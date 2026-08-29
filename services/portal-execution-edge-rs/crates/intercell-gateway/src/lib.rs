#![forbid(unsafe_code)]

use std::collections::{BTreeMap, BTreeSet, VecDeque};

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const GATEWAY_SCHEMA_VERSION: &str = "portal.execution.intercell-gateway.v1";
pub const MAX_ASSERTION_TTL_SECONDS: i64 = 60;
pub const MAX_ARTIFACT_URL_TTL_SECONDS: i64 = 300;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GatewayInterface {
    Query,
    Command,
    Event,
    Artifact,
}

impl GatewayInterface {
    pub const ALL: [Self; 4] = [Self::Query, Self::Command, Self::Event, Self::Artifact];

    #[must_use]
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::Query => "QUERY",
            Self::Command => "COMMAND",
            Self::Event => "EVENT",
            Self::Artifact => "ARTIFACT",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ContractVersion {
    pub major: u16,
    pub minor: u16,
}

impl ContractVersion {
    #[must_use]
    pub const fn new(major: u16, minor: u16) -> Self {
        Self { major, minor }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionRange {
    pub minimum: ContractVersion,
    pub maximum: ContractVersion,
}

impl VersionRange {
    /// Selects the highest compatible version in two closed ranges.
    #[must_use]
    pub fn negotiate(self, other: Self) -> Option<ContractVersion> {
        let minimum = self.minimum.max(other.minimum);
        let maximum = self.maximum.min(other.maximum);
        (minimum <= maximum && minimum.major == maximum.major).then_some(maximum)
    }

    #[must_use]
    pub fn contains(self, version: ContractVersion) -> bool {
        self.minimum <= version && version <= self.maximum
    }

    fn valid(self) -> bool {
        self.minimum <= self.maximum && self.minimum.major == self.maximum.major
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PublicationState {
    FixtureOnly,
    OwnerPublished,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterfaceOffer {
    pub interface: GatewayInterface,
    pub versions: VersionRange,
    pub preferred: ContractVersion,
    pub rollback: ContractVersion,
    pub publication_state: PublicationState,
    pub contract_digest: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IdentityClass {
    Read,
    Command,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdentityPolicy {
    pub read_identity_class: String,
    pub command_identity_class: String,
    pub identities_distinct: bool,
    pub delegated_resource_policy: String,
    pub raw_browser_token_forwarding: bool,
    pub wildcard_scope_allowed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TransportMethod {
    Get,
    Post,
    Stream,
    Reference,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TransportPolicy {
    pub interface: GatewayInterface,
    pub method: TransportMethod,
    pub connect_timeout_ms: u64,
    pub request_timeout_ms: u64,
    pub queue_timeout_ms: u64,
    pub maximum_concurrency: u16,
    pub maximum_response_bytes: u64,
    pub retry_before_dispatch: u8,
    pub retry_after_dispatch: u8,
    pub redirects_allowed: bool,
    pub http2_required: bool,
    pub tls13_required: bool,
    pub redacted_observability_fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayProfile {
    pub schema_version: String,
    pub profile_id: String,
    pub source_dark: bool,
    pub runtime_active: bool,
    pub source_call_authorized: bool,
    pub identity_policy: IdentityPolicy,
    pub interfaces: Vec<InterfaceOffer>,
    pub transports: Vec<TransportPolicy>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NegotiationState {
    FixtureCompatible,
    OwnerCompatible,
    Unavailable,
    Incompatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InterfaceNegotiation {
    pub interface: GatewayInterface,
    pub state: NegotiationState,
    pub selected: Option<ContractVersion>,
    pub rollback: Option<ContractVersion>,
    pub activation_allowed: bool,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct GatewayAuthority {
    offers: BTreeMap<GatewayInterface, InterfaceOffer>,
    transports: BTreeMap<GatewayInterface, TransportPolicy>,
    identity_policy: IdentityPolicy,
    source_dark: bool,
}

impl GatewayAuthority {
    /// Loads one exact four-interface profile and rejects authority widening.
    ///
    /// # Errors
    ///
    /// Rejects malformed version ranges, duplicate/missing interfaces, unsafe
    /// transport policy, shared identities or any source-dark activation flag.
    pub fn from_source_dark_profile(profile: GatewayProfile) -> Result<Self, GatewayError> {
        if profile.schema_version != GATEWAY_SCHEMA_VERSION
            || profile.profile_id != "n15a-source-dark"
            || !profile.source_dark
            || profile.runtime_active
            || profile.source_call_authorized
        {
            return Err(GatewayError::SourceDarkBoundary);
        }
        validate_identity_policy(&profile.identity_policy)?;

        let mut offers = BTreeMap::new();
        for offer in profile.interfaces {
            validate_offer(&offer)?;
            if offer.publication_state == PublicationState::OwnerPublished {
                return Err(GatewayError::OwnerPublicationForbidden);
            }
            let key = offer.interface;
            if offers.insert(key, offer).is_some() {
                return Err(GatewayError::DuplicateInterface(key));
            }
        }
        require_exact_interfaces(&offers)?;

        let mut transports = BTreeMap::new();
        for policy in profile.transports {
            validate_transport(&policy)?;
            let key = policy.interface;
            if transports.insert(key, policy).is_some() {
                return Err(GatewayError::DuplicateTransport(key));
            }
        }
        require_exact_interfaces(&transports)?;

        Ok(Self {
            offers,
            transports,
            identity_policy: profile.identity_policy,
            source_dark: true,
        })
    }

    #[must_use]
    pub const fn source_dark(&self) -> bool {
        self.source_dark
    }

    #[must_use]
    pub fn transport(&self, interface: GatewayInterface) -> &TransportPolicy {
        &self.transports[&interface]
    }

    #[must_use]
    pub fn identity_class(&self, interface: GatewayInterface) -> IdentityClass {
        match interface {
            GatewayInterface::Command => IdentityClass::Command,
            GatewayInterface::Query | GatewayInterface::Event | GatewayInterface::Artifact => {
                IdentityClass::Read
            }
        }
    }

    #[must_use]
    pub fn identity_name(&self, interface: GatewayInterface) -> &str {
        match self.identity_class(interface) {
            IdentityClass::Read => &self.identity_policy.read_identity_class,
            IdentityClass::Command => &self.identity_policy.command_identity_class,
        }
    }

    #[must_use]
    pub fn negotiate(
        &self,
        interface: GatewayInterface,
        requested: VersionRange,
    ) -> InterfaceNegotiation {
        let Some(offer) = self.offers.get(&interface) else {
            return unavailable(interface, "INTERFACE_NOT_DECLARED");
        };
        if offer.publication_state == PublicationState::Unavailable {
            return unavailable(interface, "OWNER_PUBLICATION_UNAVAILABLE");
        }
        let Some(selected) = offer.versions.negotiate(requested) else {
            return InterfaceNegotiation {
                interface,
                state: NegotiationState::Incompatible,
                selected: None,
                rollback: None,
                activation_allowed: false,
                reason: "VERSION_RANGE_INCOMPATIBLE".to_owned(),
            };
        };
        let state = match offer.publication_state {
            PublicationState::FixtureOnly => NegotiationState::FixtureCompatible,
            PublicationState::OwnerPublished => NegotiationState::OwnerCompatible,
            PublicationState::Unavailable => NegotiationState::Unavailable,
        };
        InterfaceNegotiation {
            interface,
            state,
            selected: Some(selected),
            rollback: Some(offer.rollback),
            activation_allowed: false,
            reason: if state == NegotiationState::FixtureCompatible {
                "SOURCE_DARK_FIXTURE_ONLY"
            } else {
                "OWNER_COMPATIBLE_ACTIVATION_SEPARATE"
            }
            .to_owned(),
        }
    }
}

fn unavailable(interface: GatewayInterface, reason: &str) -> InterfaceNegotiation {
    InterfaceNegotiation {
        interface,
        state: NegotiationState::Unavailable,
        selected: None,
        rollback: None,
        activation_allowed: false,
        reason: reason.to_owned(),
    }
}

fn require_exact_interfaces<T>(map: &BTreeMap<GatewayInterface, T>) -> Result<(), GatewayError> {
    let actual: BTreeSet<_> = map.keys().copied().collect();
    let expected: BTreeSet<_> = GatewayInterface::ALL.into_iter().collect();
    if actual != expected {
        return Err(GatewayError::MissingInterface);
    }
    Ok(())
}

fn validate_offer(offer: &InterfaceOffer) -> Result<(), GatewayError> {
    if !offer.versions.valid()
        || !offer.versions.contains(offer.preferred)
        || !offer.versions.contains(offer.rollback)
        || !valid_sha256(&offer.contract_digest)
    {
        return Err(GatewayError::InvalidOffer(offer.interface));
    }
    Ok(())
}

fn validate_identity_policy(policy: &IdentityPolicy) -> Result<(), GatewayError> {
    if policy.read_identity_class != "portal-execution-read"
        || policy.command_identity_class != "portal-execution-command"
        || policy.read_identity_class == policy.command_identity_class
        || !policy.identities_distinct
        || policy.delegated_resource_policy != "EXACT_RESOURCE_ONLY"
        || policy.raw_browser_token_forwarding
        || policy.wildcard_scope_allowed
    {
        return Err(GatewayError::UnsafeIdentityPolicy);
    }
    Ok(())
}

fn validate_transport(policy: &TransportPolicy) -> Result<(), GatewayError> {
    let expected_method = match policy.interface {
        GatewayInterface::Query => TransportMethod::Get,
        GatewayInterface::Command => TransportMethod::Post,
        GatewayInterface::Event => TransportMethod::Stream,
        GatewayInterface::Artifact => TransportMethod::Reference,
    };
    if policy.method != expected_method
        || policy.connect_timeout_ms == 0
        || policy.connect_timeout_ms > 5_000
        || policy.request_timeout_ms < policy.connect_timeout_ms
        || policy.request_timeout_ms > 30_000
        || policy.queue_timeout_ms == 0
        || policy.queue_timeout_ms > 2_000
        || !(1..=8).contains(&policy.maximum_concurrency)
        || !(1_024..=8_388_608).contains(&policy.maximum_response_bytes)
        || policy.redirects_allowed
        || !policy.http2_required
        || !policy.tls13_required
        || policy.retry_after_dispatch != 0
        || policy.redacted_observability_fields
            != [
                "interface",
                "outcome",
                "latency_ms",
                "response_bytes",
                "retry_count",
            ]
    {
        return Err(GatewayError::UnsafeTransport(policy.interface));
    }
    if policy.interface == GatewayInterface::Command && policy.retry_before_dispatch != 0 {
        return Err(GatewayError::UnsafeTransport(policy.interface));
    }
    if policy.interface != GatewayInterface::Command && policy.retry_before_dispatch > 2 {
        return Err(GatewayError::UnsafeTransport(policy.interface));
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DelegatedAssertion {
    pub issuer: String,
    pub audience: String,
    pub subject: String,
    pub session_id: String,
    pub environment: String,
    pub workspace_id: String,
    pub resource_id: String,
    pub scope: String,
    pub jti: String,
    pub issued_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub identity_class: IdentityClass,
    pub approval_id: Option<String>,
    pub signature_verified: bool,
}

#[derive(Debug, Default)]
pub struct DelegatedAssertionGate {
    consumed_jti: BTreeSet<String>,
}

impl DelegatedAssertionGate {
    /// Validates a cryptographically pre-verified assertion and consumes its
    /// one-use replay identifier.
    ///
    /// # Errors
    ///
    /// Fails closed on forged, expired, overlong, wildcard, wrong-identity,
    /// wrong-resource or replayed assertions.
    pub fn authorize(
        &mut self,
        interface: GatewayInterface,
        assertion: &DelegatedAssertion,
        expected_environment: &str,
        expected_workspace: &str,
        expected_resource: &str,
        now: DateTime<Utc>,
    ) -> Result<(), AssertionError> {
        if !assertion.signature_verified {
            return Err(AssertionError::Forged);
        }
        let expected_identity = if interface == GatewayInterface::Command {
            IdentityClass::Command
        } else {
            IdentityClass::Read
        };
        if assertion.identity_class != expected_identity {
            return Err(AssertionError::WrongIdentityClass);
        }
        if assertion.issuer != "research-control-plane"
            || assertion.audience != "execution-control-plane"
            || !bounded_nonempty(&assertion.subject, 160)
            || !bounded_nonempty(&assertion.session_id, 160)
            || assertion.environment != expected_environment
            || assertion.workspace_id != expected_workspace
            || assertion.resource_id != expected_resource
            || !bounded_nonempty(&assertion.workspace_id, 200)
            || !bounded_nonempty(&assertion.resource_id, 200)
            || !bounded_nonempty(&assertion.jti, 160)
        {
            return Err(AssertionError::ClaimMismatch);
        }
        let expected_scope = format!(
            "gateway:{}:{}",
            interface.wire_name().to_ascii_lowercase(),
            expected_resource
        );
        if assertion.scope != expected_scope || assertion.scope.contains('*') {
            return Err(AssertionError::ScopeMismatch);
        }
        if assertion.issued_at > now
            || assertion.expires_at <= now
            || assertion.expires_at - assertion.issued_at
                > Duration::seconds(MAX_ASSERTION_TTL_SECONDS)
        {
            return Err(AssertionError::Expired);
        }
        if interface == GatewayInterface::Command
            && assertion.approval_id.as_deref().is_none_or(str::is_empty)
        {
            return Err(AssertionError::ApprovalRequired);
        }
        if !self.consumed_jti.insert(assertion.jti.clone()) {
            return Err(AssertionError::Replay);
        }
        Ok(())
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AssertionError {
    #[error("delegated assertion signature was not verified")]
    Forged,
    #[error("delegated assertion used the wrong identity class")]
    WrongIdentityClass,
    #[error("delegated assertion claims do not bind the expected authority")]
    ClaimMismatch,
    #[error("delegated assertion scope is not the exact resource")]
    ScopeMismatch,
    #[error("delegated assertion is expired, premature or too long lived")]
    Expired,
    #[error("command assertion lacks approval binding")]
    ApprovalRequired,
    #[error("delegated assertion replay identifier was already consumed")]
    Replay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventOperation {
    Upsert,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayEvent {
    pub event_id: String,
    pub schema_version: String,
    pub epoch: String,
    pub source_sequence: u64,
    pub cursor: String,
    pub operation: EventOperation,
    pub entity_kind: String,
    pub entity_id: String,
    pub payload_sha256: String,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventObservation {
    Applied { sequence: u64 },
    Duplicate { sequence: u64 },
    Gap { expected: u64, observed: u64 },
    OutOfOrder { last: u64, observed: u64 },
    EpochChanged { expected: String, observed: String },
}

#[derive(Debug)]
pub struct EventReplayGuard {
    epoch: String,
    last_sequence: u64,
    seen: BTreeMap<String, (u64, String)>,
}

impl EventReplayGuard {
    #[must_use]
    pub fn new(epoch: impl Into<String>, baseline_sequence: u64) -> Self {
        Self {
            epoch: epoch.into(),
            last_sequence: baseline_sequence,
            seen: BTreeMap::new(),
        }
    }

    /// Applies one N02-style event without advancing through a gap.
    ///
    /// # Errors
    ///
    /// Rejects malformed/forged event identities and conflicting duplicates.
    pub fn observe(&mut self, event: &GatewayEvent) -> Result<EventObservation, EventError> {
        validate_event(event)?;
        if let Some((sequence, digest)) = self.seen.get(&event.event_id) {
            if *sequence == event.source_sequence && digest == &event.payload_sha256 {
                return Ok(EventObservation::Duplicate {
                    sequence: *sequence,
                });
            }
            return Err(EventError::ConflictingDuplicate);
        }
        if event.epoch != self.epoch {
            return Ok(EventObservation::EpochChanged {
                expected: self.epoch.clone(),
                observed: event.epoch.clone(),
            });
        }
        let expected = self.last_sequence.saturating_add(1);
        if event.source_sequence > expected {
            return Ok(EventObservation::Gap {
                expected,
                observed: event.source_sequence,
            });
        }
        if event.source_sequence <= self.last_sequence {
            return Ok(EventObservation::OutOfOrder {
                last: self.last_sequence,
                observed: event.source_sequence,
            });
        }
        self.last_sequence = event.source_sequence;
        self.seen.insert(
            event.event_id.clone(),
            (event.source_sequence, event.payload_sha256.clone()),
        );
        Ok(EventObservation::Applied {
            sequence: event.source_sequence,
        })
    }
}

fn validate_event(event: &GatewayEvent) -> Result<(), EventError> {
    if !bounded_nonempty(&event.event_id, 160)
        || !bounded_nonempty(&event.schema_version, 100)
        || !bounded_nonempty(&event.epoch, 160)
        || !bounded_nonempty(&event.cursor, 2_048)
        || !bounded_nonempty(&event.entity_kind, 100)
        || !bounded_nonempty(&event.entity_id, 200)
        || !valid_sha256(&event.payload_sha256)
    {
        return Err(EventError::InvalidEvent);
    }
    Ok(())
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EventError {
    #[error("event envelope is malformed")]
    InvalidEvent,
    #[error("duplicate event identity carries conflicting source facts")]
    ConflictingDuplicate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ArtifactAccessPolicy {
    WorkloadScopedRead,
    ReferenceOnly,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArtifactDescriptor {
    pub artifact_id: String,
    pub kind: String,
    pub sha256: String,
    pub size_bytes: u64,
    pub media_type: String,
    pub schema_version: String,
    pub source_authority: String,
    pub created_at: DateTime<Utc>,
    pub retention_class: String,
    pub access_policy: ArtifactAccessPolicy,
    pub signed_read_url_expiry: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct ArtifactPolicy {
    pub kinds: BTreeMap<String, BTreeSet<String>>,
    pub maximum_size_bytes: u64,
    pub accepted_media_types: BTreeSet<String>,
    pub accepted_authorities: BTreeSet<String>,
    pub accepted_retention_classes: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ArtifactEvidence {
    pub digest_verified: bool,
    pub signature_verified: bool,
}

impl ArtifactPolicy {
    /// Verifies bounded artifact metadata and local digest/signature evidence.
    ///
    /// This contract never accepts an object-store credential or upload body.
    ///
    /// # Errors
    ///
    /// Rejects missing, oversized, expired, digest-mismatched, unsigned,
    /// incompatible or over-broad artifact references.
    pub fn verify(
        &self,
        descriptor: &ArtifactDescriptor,
        evidence: ArtifactEvidence,
        now: DateTime<Utc>,
    ) -> Result<(), ArtifactError> {
        if !bounded_nonempty(&descriptor.artifact_id, 200)
            || !bounded_nonempty(&descriptor.kind, 100)
            || !bounded_nonempty(&descriptor.media_type, 120)
            || !bounded_nonempty(&descriptor.schema_version, 100)
            || !bounded_nonempty(&descriptor.source_authority, 100)
            || !bounded_nonempty(&descriptor.retention_class, 100)
            || !valid_sha256(&descriptor.sha256)
            || descriptor.size_bytes == 0
        {
            return Err(ArtifactError::InvalidDescriptor);
        }
        if descriptor.size_bytes > self.maximum_size_bytes {
            return Err(ArtifactError::TooLarge);
        }
        let Some(versions) = self.kinds.get(&descriptor.kind) else {
            return Err(ArtifactError::KindUnsupported);
        };
        if !versions.contains(&descriptor.schema_version) {
            return Err(ArtifactError::SchemaIncompatible);
        }
        if !self.accepted_media_types.contains(&descriptor.media_type)
            || !self
                .accepted_authorities
                .contains(&descriptor.source_authority)
            || !self
                .accepted_retention_classes
                .contains(&descriptor.retention_class)
        {
            return Err(ArtifactError::PolicyDenied);
        }
        match descriptor.access_policy {
            ArtifactAccessPolicy::ReferenceOnly => {
                if descriptor.signed_read_url_expiry.is_some() {
                    return Err(ArtifactError::PolicyDenied);
                }
            }
            ArtifactAccessPolicy::WorkloadScopedRead => {
                let Some(expiry) = descriptor.signed_read_url_expiry else {
                    return Err(ArtifactError::ExpiryRequired);
                };
                if expiry <= now || expiry - now > Duration::seconds(MAX_ARTIFACT_URL_TTL_SECONDS) {
                    return Err(ArtifactError::Expired);
                }
            }
        }
        if !evidence.digest_verified {
            return Err(ArtifactError::DigestMismatch);
        }
        if !evidence.signature_verified {
            return Err(ArtifactError::SignatureInvalid);
        }
        Ok(())
    }

    /// Verifies a bounded local fixture body against an immutable descriptor.
    ///
    /// # Errors
    ///
    /// Returns a size or digest mismatch without making a network call.
    pub fn verify_local_bytes(
        &self,
        descriptor: &ArtifactDescriptor,
        body: &[u8],
    ) -> Result<(), ArtifactError> {
        if body.len() as u64 != descriptor.size_bytes || body.len() as u64 > self.maximum_size_bytes
        {
            return Err(ArtifactError::TooLarge);
        }
        let digest = format!("sha256:{}", hex::encode(Sha256::digest(body)));
        if digest != descriptor.sha256 {
            return Err(ArtifactError::DigestMismatch);
        }
        Ok(())
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ArtifactError {
    #[error("artifact descriptor is invalid")]
    InvalidDescriptor,
    #[error("artifact exceeds the bounded size policy")]
    TooLarge,
    #[error("artifact kind is unsupported")]
    KindUnsupported,
    #[error("artifact schema version is incompatible")]
    SchemaIncompatible,
    #[error("artifact access/authority/retention policy denied the reference")]
    PolicyDenied,
    #[error("artifact workload-scoped read expiry is required")]
    ExpiryRequired,
    #[error("artifact workload-scoped read reference is expired or too long lived")]
    Expired,
    #[error("artifact digest evidence does not match")]
    DigestMismatch,
    #[error("artifact signature evidence is invalid")]
    SignatureInvalid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalFault {
    Partition,
    Timeout,
    Duplicate,
    OutOfOrder,
    Expired,
    ForgedAssertion,
    SchemaDrift,
    SourceUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LocalTransportResult {
    Response(Vec<u8>),
    Fault(LocalFault),
}

#[derive(Debug, Default)]
pub struct LocalTransportDouble {
    scripted: BTreeMap<GatewayInterface, VecDeque<LocalTransportResult>>,
    attempts: BTreeMap<GatewayInterface, u64>,
}

impl LocalTransportDouble {
    pub fn push(&mut self, interface: GatewayInterface, result: LocalTransportResult) {
        self.scripted
            .entry(interface)
            .or_default()
            .push_back(result);
    }

    /// Executes a deterministic local script. It has no origin, socket, TLS
    /// material or credential field by construction.
    ///
    /// # Errors
    ///
    /// Rejects unscripted or oversized calls and returns injected faults.
    pub fn execute(
        &mut self,
        interface: GatewayInterface,
        maximum_response_bytes: u64,
    ) -> Result<Vec<u8>, LocalTransportError> {
        *self.attempts.entry(interface).or_default() += 1;
        let result = self
            .scripted
            .get_mut(&interface)
            .and_then(VecDeque::pop_front)
            .ok_or(LocalTransportError::Unscripted(interface))?;
        match result {
            LocalTransportResult::Response(body) => {
                if body.len() as u64 > maximum_response_bytes {
                    return Err(LocalTransportError::ResponseTooLarge(interface));
                }
                Ok(body)
            }
            LocalTransportResult::Fault(fault) => {
                Err(LocalTransportError::Injected { interface, fault })
            }
        }
    }

    #[must_use]
    pub fn attempts(&self, interface: GatewayInterface) -> u64 {
        self.attempts.get(&interface).copied().unwrap_or_default()
    }

    #[must_use]
    pub const fn network_attempts(&self) -> u64 {
        0
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LocalTransportError {
    #[error("local transport interface was not scripted: {0:?}")]
    Unscripted(GatewayInterface),
    #[error("local transport response exceeded its interface bound: {0:?}")]
    ResponseTooLarge(GatewayInterface),
    #[error("local transport injected {fault:?} for {interface:?}")]
    Injected {
        interface: GatewayInterface,
        fault: LocalFault,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RedactedObservation {
    pub interface: GatewayInterface,
    pub outcome: String,
    pub latency_ms: u64,
    pub response_bytes: u64,
    pub retry_count: u8,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum GatewayError {
    #[error("profile widened the N15A source-dark boundary")]
    SourceDarkBoundary,
    #[error("owner-published capability is forbidden in N15A")]
    OwnerPublicationForbidden,
    #[error("profile has duplicate interface {0:?}")]
    DuplicateInterface(GatewayInterface),
    #[error("profile does not declare exactly four independent interfaces")]
    MissingInterface,
    #[error("profile has duplicate transport for {0:?}")]
    DuplicateTransport(GatewayInterface),
    #[error("profile has invalid offer for {0:?}")]
    InvalidOffer(GatewayInterface),
    #[error("profile identity policy is unsafe")]
    UnsafeIdentityPolicy,
    #[error("profile transport policy is unsafe for {0:?}")]
    UnsafeTransport(GatewayInterface),
}

fn valid_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn bounded_nonempty(value: &str, maximum_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= maximum_bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROFILE_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../../packages/contracts/fixtures/execution-intercell-gateway.source-dark.valid.json"
    ));
    const EVENT_CORPUS: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../../packages/contracts/fixtures/execution-intercell-gateway.event-corpus.valid.json"
    ));
    const ARTIFACT_CORPUS: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../../packages/contracts/fixtures/execution-intercell-gateway.artifact-corpus.valid.json"
    ));

    fn authority() -> GatewayAuthority {
        GatewayAuthority::from_source_dark_profile(serde_json::from_str(PROFILE_FIXTURE).unwrap())
            .unwrap()
    }

    fn assertion(interface: GatewayInterface, now: DateTime<Utc>) -> DelegatedAssertion {
        let identity_class = if interface == GatewayInterface::Command {
            IdentityClass::Command
        } else {
            IdentityClass::Read
        };
        DelegatedAssertion {
            issuer: "research-control-plane".to_owned(),
            audience: "execution-control-plane".to_owned(),
            subject: "usr_test".to_owned(),
            session_id: "ses_test".to_owned(),
            environment: "paper".to_owned(),
            workspace_id: "ws_test".to_owned(),
            resource_id: "dep_test".to_owned(),
            scope: format!(
                "gateway:{}:dep_test",
                interface.wire_name().to_ascii_lowercase()
            ),
            jti: format!("jti-{}", interface.wire_name()),
            issued_at: now - Duration::seconds(1),
            expires_at: now + Duration::seconds(29),
            identity_class,
            approval_id: (interface == GatewayInterface::Command).then(|| "ap_test".to_owned()),
            signature_verified: true,
        }
    }

    #[test]
    fn source_dark_fixture_has_exactly_four_independent_interfaces() {
        let authority = authority();
        assert!(authority.source_dark());
        assert_ne!(
            authority.identity_name(GatewayInterface::Query),
            authority.identity_name(GatewayInterface::Command)
        );
        for interface in GatewayInterface::ALL {
            let result = authority.negotiate(
                interface,
                VersionRange {
                    minimum: ContractVersion::new(1, 0),
                    maximum: ContractVersion::new(1, 1),
                },
            );
            assert_eq!(result.state, NegotiationState::FixtureCompatible);
            assert!(!result.activation_allowed);
            assert!(result.rollback.is_some());
        }
    }

    #[test]
    fn negotiation_is_independent_and_selects_rollback_without_activation() {
        let authority = authority();
        let incompatible = authority.negotiate(
            GatewayInterface::Event,
            VersionRange {
                minimum: ContractVersion::new(2, 0),
                maximum: ContractVersion::new(2, 1),
            },
        );
        assert_eq!(incompatible.state, NegotiationState::Incompatible);
        assert!(incompatible.selected.is_none());
        let query = authority.negotiate(
            GatewayInterface::Query,
            VersionRange {
                minimum: ContractVersion::new(1, 0),
                maximum: ContractVersion::new(1, 1),
            },
        );
        assert_eq!(query.state, NegotiationState::FixtureCompatible);
        assert!(!query.activation_allowed);

        let mut profile: GatewayProfile = serde_json::from_str(PROFILE_FIXTURE).unwrap();
        profile.interfaces[3].publication_state = PublicationState::Unavailable;
        let authority = GatewayAuthority::from_source_dark_profile(profile).unwrap();
        let unavailable = authority.negotiate(
            GatewayInterface::Artifact,
            VersionRange {
                minimum: ContractVersion::new(1, 0),
                maximum: ContractVersion::new(1, 0),
            },
        );
        assert_eq!(unavailable.state, NegotiationState::Unavailable);
        assert!(unavailable.selected.is_none());
    }

    #[test]
    fn malformed_profile_and_authority_widening_fail_closed() {
        let mut profile: GatewayProfile = serde_json::from_str(PROFILE_FIXTURE).unwrap();
        profile.runtime_active = true;
        assert!(matches!(
            GatewayAuthority::from_source_dark_profile(profile),
            Err(GatewayError::SourceDarkBoundary)
        ));

        let mut profile: GatewayProfile = serde_json::from_str(PROFILE_FIXTURE).unwrap();
        profile.interfaces[0].publication_state = PublicationState::OwnerPublished;
        assert!(matches!(
            GatewayAuthority::from_source_dark_profile(profile),
            Err(GatewayError::OwnerPublicationForbidden)
        ));

        let mut profile: GatewayProfile = serde_json::from_str(PROFILE_FIXTURE).unwrap();
        profile.interfaces.pop();
        assert!(matches!(
            GatewayAuthority::from_source_dark_profile(profile),
            Err(GatewayError::MissingInterface)
        ));

        let mut profile: GatewayProfile = serde_json::from_str(PROFILE_FIXTURE).unwrap();
        profile.profile_id = "source-dark-but-not-canonical".to_owned();
        assert!(matches!(
            GatewayAuthority::from_source_dark_profile(profile),
            Err(GatewayError::SourceDarkBoundary)
        ));
    }

    #[test]
    fn transport_policies_are_bounded_and_command_never_retries() {
        let authority = authority();
        for interface in GatewayInterface::ALL {
            let policy = authority.transport(interface);
            assert!(!policy.redirects_allowed);
            assert_eq!(policy.retry_after_dispatch, 0);
            assert!(policy.maximum_response_bytes <= 8_388_608);
        }
        assert_eq!(
            authority
                .transport(GatewayInterface::Command)
                .retry_before_dispatch,
            0
        );
    }

    #[test]
    fn assertions_bind_exact_identity_resource_ttl_and_replay() {
        let now = DateTime::from_timestamp(1_777_910_400, 0).unwrap();
        let mut gate = DelegatedAssertionGate::default();
        let read = assertion(GatewayInterface::Query, now);
        assert_eq!(
            gate.authorize(
                GatewayInterface::Query,
                &read,
                "paper",
                "ws_test",
                "dep_test",
                now,
            ),
            Ok(())
        );
        assert_eq!(
            gate.authorize(
                GatewayInterface::Query,
                &read,
                "paper",
                "ws_test",
                "dep_test",
                now,
            ),
            Err(AssertionError::Replay)
        );

        let mut forged = assertion(GatewayInterface::Artifact, now);
        forged.signature_verified = false;
        assert_eq!(
            gate.authorize(
                GatewayInterface::Artifact,
                &forged,
                "paper",
                "ws_test",
                "dep_test",
                now
            ),
            Err(AssertionError::Forged)
        );

        let mut wildcard = assertion(GatewayInterface::Event, now);
        wildcard.scope = "gateway:event:*".to_owned();
        assert_eq!(
            gate.authorize(
                GatewayInterface::Event,
                &wildcard,
                "paper",
                "ws_test",
                "dep_test",
                now
            ),
            Err(AssertionError::ScopeMismatch)
        );

        let wrong_environment = assertion(GatewayInterface::Event, now);
        assert_eq!(
            gate.authorize(
                GatewayInterface::Event,
                &wrong_environment,
                "live",
                "ws_test",
                "dep_test",
                now
            ),
            Err(AssertionError::ClaimMismatch)
        );
    }

    #[test]
    fn read_identity_cannot_dispatch_command_and_expiry_fails_closed() {
        let now = DateTime::from_timestamp(1_777_910_400, 0).unwrap();
        let mut gate = DelegatedAssertionGate::default();
        let mut wrong = assertion(GatewayInterface::Query, now);
        wrong.scope = "gateway:command:dep_test".to_owned();
        assert_eq!(
            gate.authorize(
                GatewayInterface::Command,
                &wrong,
                "paper",
                "ws_test",
                "dep_test",
                now
            ),
            Err(AssertionError::WrongIdentityClass)
        );

        let mut expired = assertion(GatewayInterface::Query, now);
        expired.jti = "expired".to_owned();
        expired.expires_at = now;
        assert_eq!(
            gate.authorize(
                GatewayInterface::Query,
                &expired,
                "paper",
                "ws_test",
                "dep_test",
                now
            ),
            Err(AssertionError::Expired)
        );
    }

    #[derive(Deserialize)]
    struct EventCorpus {
        events: Vec<GatewayEvent>,
    }

    #[test]
    fn event_replay_duplicate_gap_out_of_order_and_epoch_are_typed() {
        let corpus: EventCorpus = serde_json::from_str(EVENT_CORPUS).unwrap();
        let mut guard = EventReplayGuard::new("epoch-7", 40);
        assert!(matches!(
            guard.observe(&corpus.events[0]).unwrap(),
            EventObservation::Applied { sequence: 41 }
        ));
        assert!(matches!(
            guard.observe(&corpus.events[0]).unwrap(),
            EventObservation::Duplicate { sequence: 41 }
        ));
        assert!(matches!(
            guard.observe(&corpus.events[1]).unwrap(),
            EventObservation::Gap {
                expected: 42,
                observed: 43
            }
        ));
        assert!(matches!(
            guard.observe(&corpus.events[2]).unwrap(),
            EventObservation::OutOfOrder {
                last: 41,
                observed: 39
            }
        ));
        assert!(matches!(
            guard.observe(&corpus.events[3]).unwrap(),
            EventObservation::EpochChanged { .. }
        ));
    }

    #[test]
    fn conflicting_event_identity_is_rejected_as_forged() {
        let corpus: EventCorpus = serde_json::from_str(EVENT_CORPUS).unwrap();
        let mut guard = EventReplayGuard::new("epoch-7", 40);
        guard.observe(&corpus.events[0]).unwrap();
        let mut forged = corpus.events[0].clone();
        forged.payload_sha256 = format!("sha256:{}", "f".repeat(64));
        assert_eq!(
            guard.observe(&forged),
            Err(EventError::ConflictingDuplicate)
        );
    }

    #[derive(Deserialize)]
    struct ArtifactCase {
        descriptor: ArtifactDescriptor,
        digest_verified: bool,
        signature_verified: bool,
        expected: String,
    }

    #[derive(Deserialize)]
    struct ArtifactCorpus {
        policy: ArtifactPolicyFixture,
        cases: Vec<ArtifactCase>,
    }

    #[derive(Deserialize)]
    struct ArtifactPolicyFixture {
        kinds: BTreeMap<String, BTreeSet<String>>,
        maximum_size_bytes: u64,
        accepted_media_types: BTreeSet<String>,
        accepted_authorities: BTreeSet<String>,
        accepted_retention_classes: BTreeSet<String>,
    }

    impl From<ArtifactPolicyFixture> for ArtifactPolicy {
        fn from(value: ArtifactPolicyFixture) -> Self {
            Self {
                kinds: value.kinds,
                maximum_size_bytes: value.maximum_size_bytes,
                accepted_media_types: value.accepted_media_types,
                accepted_authorities: value.accepted_authorities,
                accepted_retention_classes: value.accepted_retention_classes,
            }
        }
    }

    #[test]
    fn artifact_corpus_enforces_digest_schema_size_expiry_and_access() {
        let corpus: ArtifactCorpus = serde_json::from_str(ARTIFACT_CORPUS).unwrap();
        let policy: ArtifactPolicy = corpus.policy.into();
        let now = DateTime::from_timestamp(1_777_910_400, 0).unwrap();
        for case in corpus.cases {
            let result = policy.verify(
                &case.descriptor,
                ArtifactEvidence {
                    digest_verified: case.digest_verified,
                    signature_verified: case.signature_verified,
                },
                now,
            );
            let actual = match result {
                Ok(()) => "ACCEPTED",
                Err(ArtifactError::TooLarge) => "TOO_LARGE",
                Err(ArtifactError::SchemaIncompatible) => "SCHEMA_INCOMPATIBLE",
                Err(ArtifactError::Expired) => "EXPIRED",
                Err(ArtifactError::DigestMismatch) => "DIGEST_MISMATCH",
                Err(ArtifactError::SignatureInvalid) => "SIGNATURE_INVALID",
                Err(ArtifactError::PolicyDenied) => "POLICY_DENIED",
                Err(other) => panic!("unexpected artifact result: {other}"),
            };
            assert_eq!(actual, case.expected);
        }
    }

    #[test]
    fn artifact_local_bytes_are_digest_and_size_bound_without_transport() {
        let body = b"source-dark artifact fixture";
        let descriptor = ArtifactDescriptor {
            artifact_id: "artifact-local".to_owned(),
            kind: "EXECUTION_EVIDENCE".to_owned(),
            sha256: format!("sha256:{}", hex::encode(Sha256::digest(body))),
            size_bytes: body.len() as u64,
            media_type: "application/json".to_owned(),
            schema_version: "execution.evidence.v1".to_owned(),
            source_authority: "EXECUTION_CELL".to_owned(),
            created_at: DateTime::from_timestamp(1_777_910_300, 0).unwrap(),
            retention_class: "EVIDENCE".to_owned(),
            access_policy: ArtifactAccessPolicy::ReferenceOnly,
            signed_read_url_expiry: None,
        };
        let corpus: ArtifactCorpus = serde_json::from_str(ARTIFACT_CORPUS).unwrap();
        let policy: ArtifactPolicy = corpus.policy.into();
        assert_eq!(policy.verify_local_bytes(&descriptor, body), Ok(()));
        assert_eq!(
            policy.verify_local_bytes(&descriptor, b"tampered"),
            Err(ArtifactError::TooLarge)
        );
        let mut same_size = body.to_vec();
        same_size[0] ^= 1;
        assert_eq!(
            policy.verify_local_bytes(&descriptor, &same_size),
            Err(ArtifactError::DigestMismatch)
        );
    }

    #[test]
    fn local_transport_double_is_interface_isolated_and_never_networks() {
        let mut transport = LocalTransportDouble::default();
        transport.push(
            GatewayInterface::Query,
            LocalTransportResult::Response(b"query".to_vec()),
        );
        transport.push(
            GatewayInterface::Event,
            LocalTransportResult::Fault(LocalFault::Partition),
        );
        assert_eq!(
            transport.execute(GatewayInterface::Query, 1024).unwrap(),
            b"query"
        );
        assert!(matches!(
            transport.execute(GatewayInterface::Event, 1024),
            Err(LocalTransportError::Injected {
                interface: GatewayInterface::Event,
                fault: LocalFault::Partition
            })
        ));
        assert_eq!(transport.attempts(GatewayInterface::Command), 0);
        assert_eq!(transport.network_attempts(), 0);
    }

    #[test]
    fn local_fault_corpus_covers_n15a_failure_classes() {
        let mut transport = LocalTransportDouble::default();
        for fault in [
            LocalFault::Partition,
            LocalFault::Timeout,
            LocalFault::Duplicate,
            LocalFault::OutOfOrder,
            LocalFault::Expired,
            LocalFault::ForgedAssertion,
            LocalFault::SchemaDrift,
            LocalFault::SourceUnavailable,
        ] {
            transport.push(
                GatewayInterface::Artifact,
                LocalTransportResult::Fault(fault),
            );
            assert!(matches!(
                transport.execute(GatewayInterface::Artifact, 1024),
                Err(LocalTransportError::Injected {
                    interface: GatewayInterface::Artifact,
                    fault: observed
                }) if observed == fault
            ));
        }
        assert_eq!(transport.network_attempts(), 0);
    }

    #[test]
    fn redacted_observation_has_no_resource_or_credential_surface() {
        let observation = RedactedObservation {
            interface: GatewayInterface::Query,
            outcome: "UNAVAILABLE".to_owned(),
            latency_ms: 4,
            response_bytes: 128,
            retry_count: 0,
        };
        let encoded = serde_json::to_string(&observation).unwrap();
        for forbidden in ["token", "authorization", "resource_id", "url", "secret"] {
            assert!(!encoded.to_ascii_lowercase().contains(forbidden));
        }
    }
}
