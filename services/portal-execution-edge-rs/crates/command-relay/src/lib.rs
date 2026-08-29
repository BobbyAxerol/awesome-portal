//! N12 live-command relay safety boundary.
//!
//! This crate contains no network client and grants no Trading System authority.
//! It validates an owner-published capability, a one-operation delegation and
//! the independent command feature flags before a transport may be constructed.
//! The journal preserves `202` as non-terminal and makes ambiguous outcomes
//! fail closed across replay and restart.

pub mod current_primitive;

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypedCondition {
    pub text: String,
    pub owner: String,
    pub deadline: Option<String>,
    pub expires_at: Option<String>,
    pub blocking: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelayDenied {
    pub schema_version: String,
    pub operation_id: String,
    pub decision: RelayDecision,
    pub reason: RelayDenialReason,
    pub retry_allowed: bool,
    pub source_request_sent: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelayDecision {
    Denied,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelayDenialReason {
    CommandRelayDisabled,
    UncertainReconciliationRequired,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RelayPolicy;

impl RelayPolicy {
    #[must_use]
    pub fn authorize(self, operation_id: impl Into<String>) -> RelayDenied {
        RelayDenied {
            schema_version: "execution.command-relay-decision.v1".to_owned(),
            operation_id: operation_id.into(),
            decision: RelayDecision::Denied,
            reason: RelayDenialReason::CommandRelayDisabled,
            retry_allowed: false,
            source_request_sent: false,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Environment {
    Paper,
    Sandbox,
    LiveCanary,
    LiveFull,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskTier {
    R1PaperMutation,
    R2Sandbox,
    R3LiveProtective,
    R4LiveRiskIncreasing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EffectClass {
    Protective,
    RiskIncreasing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TargetType {
    Account,
    Deployment,
    Portfolio,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActorRole {
    Viewer,
    Operator,
    Admin,
}

/// One exact command capability published and accepted by the Trading System
/// owner. The relay never turns an F0 CLI catalogue row into this object.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct PublishedCapability {
    pub capability_id: String,
    pub environment: Environment,
    pub risk_tier: RiskTier,
    pub effect: EffectClass,
    pub target_types: Vec<TargetType>,
    pub apply_path: String,
    pub verify_path: String,
    pub maximum_request_bytes: usize,
    pub maximum_response_bytes: usize,
    pub source_idempotent: bool,
    pub monotonic_protection: bool,
    pub requires_webauthn: bool,
    pub requires_dual_approval: bool,
    pub published: bool,
    pub portal_reachable: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
#[allow(clippy::struct_excessive_bools)]
pub struct CommandFeatureFlags {
    pub paper_commands_enabled: bool,
    pub sandbox_commands_enabled: bool,
    pub live_protective_commands_enabled: bool,
    pub live_risk_increasing_commands_enabled: bool,
    pub command_kill_switch_active: bool,
}

impl CommandFeatureFlags {
    fn permits(self, capability: &PublishedCapability) -> bool {
        if self.command_kill_switch_active {
            return false;
        }
        match capability.risk_tier {
            RiskTier::R1PaperMutation => self.paper_commands_enabled,
            RiskTier::R2Sandbox => self.sandbox_commands_enabled,
            RiskTier::R3LiveProtective => self.live_protective_commands_enabled,
            RiskTier::R4LiveRiskIncreasing => self.live_risk_increasing_commands_enabled,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApplyProof<'a> {
    pub operation_id: &'a str,
    pub request_key: &'a str,
    pub payload_hash: &'a str,
    pub capability_id: &'a str,
    pub environment: Environment,
    pub target_type: TargetType,
    pub target_key: &'a str,
    pub expected_target_version: u64,
    pub observed_target_version: u64,
    pub actor_id: &'a str,
    pub actor_role: ActorRole,
    pub delegation_operation_id: &'a str,
    pub delegation_payload_hash: &'a str,
    pub delegation_environment: Environment,
    pub delegation_target_key: &'a str,
    pub delegation_expires_at_epoch_seconds: u64,
    pub now_epoch_seconds: u64,
    pub webauthn_verified: bool,
    pub distinct_approver_count: u8,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorizedRelay {
    pub operation_id: String,
    pub request_key: String,
    pub payload_hash: String,
    pub target_key: String,
    pub apply_path: String,
    pub verify_path: String,
    pub maximum_request_bytes: usize,
    pub maximum_response_bytes: usize,
    pub source_request_sent: bool,
}

#[derive(Clone, Copy, Debug, Error, Eq, PartialEq)]
pub enum AuthorizationError {
    #[error("command capability is not owner-published and portal-reachable")]
    CapabilityUnpublished,
    #[error("independent command feature flag or kill switch denied the command")]
    CommandFlagDenied,
    #[error("capability scope does not match the plan")]
    ScopeMismatch,
    #[error("capability route or bounds are invalid")]
    CapabilityInvalid,
    #[error("delegation token does not bind the exact operation")]
    DelegationBindingMismatch,
    #[error("delegation token has expired")]
    DelegationExpired,
    #[error("expected target version is stale")]
    StaleExpectedVersion,
    #[error("actor role cannot apply an execution command")]
    RoleDenied,
    #[error("phishing-resistant step-up is required")]
    StepUpRequired,
    #[error("distinct dual approval is required")]
    DualApprovalRequired,
    #[error("command payload hash is invalid")]
    PayloadHashInvalid,
}

/// Validates the immutable command proof before a bounded HTTP transport can be
/// constructed. A successful result is still pre-dispatch and therefore has
/// `source_request_sent=false`.
///
/// # Errors
///
/// Returns a stable [`AuthorizationError`] when publication, feature flags,
/// scope, delegation binding, freshness, step-up or approval proof is invalid.
pub fn authorize_published(
    flags: CommandFeatureFlags,
    capability: &PublishedCapability,
    proof: &ApplyProof<'_>,
) -> Result<AuthorizedRelay, AuthorizationError> {
    if !capability.published || !capability.portal_reachable {
        return Err(AuthorizationError::CapabilityUnpublished);
    }
    if !flags.permits(capability) {
        return Err(AuthorizationError::CommandFlagDenied);
    }
    if capability.capability_id != proof.capability_id
        || capability.environment != proof.environment
        || !capability.target_types.contains(&proof.target_type)
        || proof.operation_id.is_empty()
        || proof.request_key.is_empty()
        || proof.target_key.is_empty()
        || proof.actor_id.is_empty()
    {
        return Err(AuthorizationError::ScopeMismatch);
    }
    if !valid_capability(capability) {
        return Err(AuthorizationError::CapabilityInvalid);
    }
    if !valid_sha256(proof.payload_hash) {
        return Err(AuthorizationError::PayloadHashInvalid);
    }
    if proof.operation_id != proof.delegation_operation_id
        || proof.payload_hash != proof.delegation_payload_hash
        || proof.environment != proof.delegation_environment
        || proof.target_key != proof.delegation_target_key
    {
        return Err(AuthorizationError::DelegationBindingMismatch);
    }
    if proof.delegation_expires_at_epoch_seconds <= proof.now_epoch_seconds {
        return Err(AuthorizationError::DelegationExpired);
    }
    if proof.expected_target_version != proof.observed_target_version {
        return Err(AuthorizationError::StaleExpectedVersion);
    }
    if !matches!(proof.actor_role, ActorRole::Operator | ActorRole::Admin) {
        return Err(AuthorizationError::RoleDenied);
    }
    if capability.requires_webauthn && !proof.webauthn_verified {
        return Err(AuthorizationError::StepUpRequired);
    }
    if capability.requires_dual_approval && proof.distinct_approver_count < 2 {
        return Err(AuthorizationError::DualApprovalRequired);
    }
    Ok(AuthorizedRelay {
        operation_id: proof.operation_id.to_owned(),
        request_key: proof.request_key.to_owned(),
        payload_hash: proof.payload_hash.to_owned(),
        target_key: proof.target_key.to_owned(),
        apply_path: capability.apply_path.clone(),
        verify_path: capability.verify_path.clone(),
        maximum_request_bytes: capability.maximum_request_bytes,
        maximum_response_bytes: capability.maximum_response_bytes,
        source_request_sent: false,
    })
}

fn valid_sha256(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64
        && hex
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn valid_capability(capability: &PublishedCapability) -> bool {
    capability
        .apply_path
        .starts_with("/portal/execution/v1/commands/")
        && capability.verify_path == "/portal/execution/v1/command-operations/{source_operation_id}"
        && !capability.apply_path.contains('*')
        && capability.maximum_request_bytes > 0
        && capability.maximum_request_bytes <= 65_536
        && capability.maximum_response_bytes > 0
        && capability.maximum_response_bytes <= 1_048_576
        && !capability.target_types.is_empty()
        && match capability.risk_tier {
            RiskTier::R1PaperMutation => capability.environment == Environment::Paper,
            RiskTier::R2Sandbox => capability.environment == Environment::Sandbox,
            RiskTier::R3LiveProtective | RiskTier::R4LiveRiskIncreasing => matches!(
                capability.environment,
                Environment::LiveCanary | Environment::LiveFull
            ),
        }
        && (!matches!(capability.risk_tier, RiskTier::R3LiveProtective)
            || capability.requires_webauthn)
        && match capability.effect {
            EffectClass::Protective => {
                !matches!(capability.risk_tier, RiskTier::R4LiveRiskIncreasing)
            }
            EffectClass::RiskIncreasing => {
                capability.risk_tier == RiskTier::R4LiveRiskIncreasing
                    && capability.requires_webauthn
                    && capability.requires_dual_approval
            }
        }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum JournalState {
    Prepared,
    Dispatched,
    Accepted,
    Acknowledged,
    Succeeded,
    Failed,
    Denied,
    Partial,
    Uncertain,
    Expired,
}

impl JournalState {
    #[must_use]
    pub fn is_source_terminal(self) -> bool {
        matches!(
            self,
            Self::Succeeded | Self::Failed | Self::Denied | Self::Partial
        )
    }

    #[must_use]
    pub fn automatic_retry_allowed(self) -> bool {
        matches!(self, Self::Prepared)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
struct JournalEntry {
    operation_id: String,
    payload_hash: String,
    target_key: String,
    effect: EffectClass,
    source_idempotent: bool,
    monotonic_protection: bool,
    state: JournalState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RegisterOutcome {
    FirstSeen,
    Replay { operation_id: String },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SourceObservation {
    HttpAccepted202,
    Acknowledged,
    Succeeded,
    Failed,
    Denied,
    Partial,
    Ambiguous,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum JournalError {
    #[error("idempotency key already binds a different payload")]
    PayloadConflict,
    #[error("uncertain outcome requires source reconciliation; retry is prohibited")]
    UncertainReconciliationRequired,
    #[error("idempotency key was not recorded")]
    NotFound,
    #[error("journal transition is invalid")]
    InvalidTransition,
    #[error("risk-increasing command is blocked by an uncertain same-target operation")]
    TargetUncertainRiskIncreaseBlocked,
    #[error("protective command is not provably monotonic and idempotent")]
    TargetUncertainProtectionUnsafe,
    #[error("journal snapshot is invalid")]
    InvalidSnapshot,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RelayJournal {
    entries: HashMap<String, JournalEntry>,
}

impl RelayJournal {
    /// Backward-compatible F0 registration for an unscoped blocked plan.
    ///
    /// # Errors
    ///
    /// Returns a conflict or uncertainty error when the request key cannot be
    /// safely registered or replayed.
    pub fn register(
        &mut self,
        idempotency_key: impl Into<String>,
        operation_id: impl Into<String>,
        payload_hash: impl Into<String>,
    ) -> Result<RegisterOutcome, JournalError> {
        self.register_scoped(
            idempotency_key,
            operation_id,
            payload_hash,
            "unscoped",
            EffectClass::Protective,
            false,
            false,
        )
    }

    #[allow(clippy::too_many_arguments)]
    /// Registers one immutable target-scoped command intent.
    ///
    /// # Errors
    ///
    /// Returns a conflict, uncertainty or same-target safety error.
    pub fn register_scoped(
        &mut self,
        idempotency_key: impl Into<String>,
        operation_id: impl Into<String>,
        payload_hash: impl Into<String>,
        target_key: impl Into<String>,
        effect: EffectClass,
        source_idempotent: bool,
        monotonic_protection: bool,
    ) -> Result<RegisterOutcome, JournalError> {
        let key = idempotency_key.into();
        let operation_id = operation_id.into();
        let payload_hash = payload_hash.into();
        let target_key = target_key.into();
        self.check_target_policy(&target_key, effect, source_idempotent, monotonic_protection)?;
        if let Some(existing) = self.entries.get(&key) {
            if existing.payload_hash != payload_hash || existing.target_key != target_key {
                return Err(JournalError::PayloadConflict);
            }
            if existing.state == JournalState::Uncertain {
                return Err(JournalError::UncertainReconciliationRequired);
            }
            return Ok(RegisterOutcome::Replay {
                operation_id: existing.operation_id.clone(),
            });
        }
        self.entries.insert(
            key,
            JournalEntry {
                operation_id,
                payload_hash,
                target_key,
                effect,
                source_idempotent,
                monotonic_protection,
                state: JournalState::Prepared,
            },
        );
        Ok(RegisterOutcome::FirstSeen)
    }

    /// Marks a prepared operation as dispatched.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::NotFound`] or [`JournalError::InvalidTransition`].
    pub fn mark_dispatched(&mut self, idempotency_key: &str) -> Result<(), JournalError> {
        self.transition(
            idempotency_key,
            JournalState::Prepared,
            JournalState::Dispatched,
        )
    }

    /// Records an accepted, acknowledged, terminal or ambiguous source fact.
    ///
    /// # Errors
    ///
    /// Returns a lookup or transition error; unknown facts are never coerced.
    pub fn observe(
        &mut self,
        idempotency_key: &str,
        observation: SourceObservation,
    ) -> Result<JournalState, JournalError> {
        let entry = self
            .entries
            .get_mut(idempotency_key)
            .ok_or(JournalError::NotFound)?;
        let next = match (entry.state, observation) {
            (JournalState::Dispatched, SourceObservation::HttpAccepted202) => {
                JournalState::Accepted
            }
            (
                JournalState::Dispatched | JournalState::Accepted,
                SourceObservation::Acknowledged,
            ) => JournalState::Acknowledged,
            (
                JournalState::Dispatched | JournalState::Accepted | JournalState::Acknowledged,
                SourceObservation::Succeeded,
            ) => JournalState::Succeeded,
            (
                JournalState::Dispatched | JournalState::Accepted | JournalState::Acknowledged,
                SourceObservation::Failed,
            ) => JournalState::Failed,
            (
                JournalState::Dispatched | JournalState::Accepted | JournalState::Acknowledged,
                SourceObservation::Denied,
            ) => JournalState::Denied,
            (
                JournalState::Dispatched | JournalState::Accepted | JournalState::Acknowledged,
                SourceObservation::Partial,
            ) => JournalState::Partial,
            (
                JournalState::Dispatched | JournalState::Accepted | JournalState::Acknowledged,
                SourceObservation::Ambiguous,
            ) => JournalState::Uncertain,
            _ => return Err(JournalError::InvalidTransition),
        };
        entry.state = next;
        Ok(next)
    }

    /// Freezes automatic retry after an ambiguous dispatch outcome.
    ///
    /// # Errors
    ///
    /// Returns a lookup or transition error.
    pub fn mark_uncertain(&mut self, idempotency_key: &str) -> Result<(), JournalError> {
        let entry = self
            .entries
            .get_mut(idempotency_key)
            .ok_or(JournalError::NotFound)?;
        if entry.state.is_source_terminal() {
            return Err(JournalError::InvalidTransition);
        }
        entry.state = JournalState::Uncertain;
        Ok(())
    }

    /// Resolves uncertainty only from an authoritative terminal observation.
    ///
    /// # Errors
    ///
    /// Returns a lookup or transition error for non-terminal evidence.
    pub fn reconcile_uncertain(
        &mut self,
        idempotency_key: &str,
        terminal: SourceObservation,
    ) -> Result<JournalState, JournalError> {
        let entry = self
            .entries
            .get_mut(idempotency_key)
            .ok_or(JournalError::NotFound)?;
        if entry.state != JournalState::Uncertain {
            return Err(JournalError::InvalidTransition);
        }
        let next = match terminal {
            SourceObservation::Succeeded => JournalState::Succeeded,
            SourceObservation::Failed => JournalState::Failed,
            SourceObservation::Denied => JournalState::Denied,
            SourceObservation::Partial => JournalState::Partial,
            _ => return Err(JournalError::InvalidTransition),
        };
        entry.state = next;
        Ok(next)
    }

    /// Returns the persisted journal state.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::NotFound`] for an unknown request key.
    pub fn state(&self, idempotency_key: &str) -> Result<JournalState, JournalError> {
        self.entries
            .get(idempotency_key)
            .map(|entry| entry.state)
            .ok_or(JournalError::NotFound)
    }

    /// Serializes the restart-safe journal snapshot.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::InvalidSnapshot`] on serialization failure.
    pub fn snapshot_json(&self) -> Result<String, JournalError> {
        serde_json::to_string(self).map_err(|_| JournalError::InvalidSnapshot)
    }

    /// Restores and validates a restart-safe journal snapshot.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::InvalidSnapshot`] for malformed or unsafe data.
    pub fn restore_json(snapshot: &str) -> Result<Self, JournalError> {
        let journal: Self =
            serde_json::from_str(snapshot).map_err(|_| JournalError::InvalidSnapshot)?;
        if journal.entries.iter().any(|(key, entry)| {
            key.is_empty()
                || entry.operation_id.is_empty()
                || !valid_sha256(&entry.payload_hash)
                || entry.target_key.is_empty()
        }) {
            return Err(JournalError::InvalidSnapshot);
        }
        Ok(journal)
    }

    fn transition(
        &mut self,
        idempotency_key: &str,
        expected: JournalState,
        next: JournalState,
    ) -> Result<(), JournalError> {
        let entry = self
            .entries
            .get_mut(idempotency_key)
            .ok_or(JournalError::NotFound)?;
        if entry.state != expected {
            return Err(JournalError::InvalidTransition);
        }
        entry.state = next;
        Ok(())
    }

    fn check_target_policy(
        &self,
        target_key: &str,
        effect: EffectClass,
        source_idempotent: bool,
        monotonic_protection: bool,
    ) -> Result<(), JournalError> {
        let uncertain_same_target = self
            .entries
            .values()
            .any(|entry| entry.target_key == target_key && entry.state == JournalState::Uncertain);
        if !uncertain_same_target {
            return Ok(());
        }
        if effect == EffectClass::RiskIncreasing {
            return Err(JournalError::TargetUncertainRiskIncreaseBlocked);
        }
        if !source_idempotent || !monotonic_protection {
            return Err(JournalError::TargetUncertainProtectionUnsafe);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    const HASH_A: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    #[derive(Deserialize)]
    struct Catalogue {
        entries: Vec<CatalogueEntry>,
    }

    #[derive(Deserialize)]
    struct CatalogueEntry {
        key: String,
        risk_tier: String,
        #[serde(flatten)]
        review_policy: ReviewPolicy,
        #[serde(flatten)]
        delivery_policy: DeliveryPolicy,
        source_route_state: String,
        http_method: Option<String>,
        blocked_reason: String,
    }

    #[derive(Deserialize)]
    struct ReviewPolicy {
        owner_review_required: bool,
        plan_required: bool,
    }

    #[derive(Deserialize)]
    struct DeliveryPolicy {
        apply_required: bool,
        portal_reachable: bool,
    }

    fn catalogue() -> Catalogue {
        serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-command-catalog.valid.json"
        ))
        .expect("canonical catalogue fixture")
    }

    fn capability(risk_tier: RiskTier, effect: EffectClass) -> PublishedCapability {
        PublishedCapability {
            capability_id: "live.halt".to_owned(),
            environment: Environment::LiveCanary,
            risk_tier,
            effect,
            target_types: vec![TargetType::Deployment],
            apply_path: "/portal/execution/v1/commands/live/halt".to_owned(),
            verify_path: "/portal/execution/v1/command-operations/{source_operation_id}".to_owned(),
            maximum_request_bytes: 16_384,
            maximum_response_bytes: 262_144,
            source_idempotent: true,
            monotonic_protection: true,
            requires_webauthn: true,
            requires_dual_approval: false,
            published: true,
            portal_reachable: true,
        }
    }

    fn proof() -> ApplyProof<'static> {
        ApplyProof {
            operation_id: "op-1",
            request_key: "request-1",
            payload_hash: HASH_A,
            capability_id: "live.halt",
            environment: Environment::LiveCanary,
            target_type: TargetType::Deployment,
            target_key: "deployment:dep-1",
            expected_target_version: 7,
            observed_target_version: 7,
            actor_id: "operator-1",
            actor_role: ActorRole::Operator,
            delegation_operation_id: "op-1",
            delegation_payload_hash: HASH_A,
            delegation_environment: Environment::LiveCanary,
            delegation_target_key: "deployment:dep-1",
            delegation_expires_at_epoch_seconds: 200,
            now_epoch_seconds: 100,
            webauthn_verified: true,
            distinct_approver_count: 1,
        }
    }

    fn live_protective_flags() -> CommandFeatureFlags {
        CommandFeatureFlags {
            live_protective_commands_enabled: true,
            ..CommandFeatureFlags::default()
        }
    }

    #[test]
    fn denial_fixture_round_trips_and_cannot_claim_a_source_request() {
        let fixture: RelayDenied = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-command-relay-denied.valid.json"
        ))
        .expect("canonical denied fixture");
        assert_eq!(fixture, RelayPolicy.authorize(fixture.operation_id.clone()));
        assert!(!fixture.retry_allowed);
        assert!(!fixture.source_request_sent);
    }

    #[test]
    fn all_catalogue_entries_remain_unreachable_in_f0() {
        let catalogue = catalogue();
        assert_eq!(catalogue.entries.len(), 64);
        assert!(catalogue
            .entries
            .iter()
            .all(|entry| !entry.delivery_policy.portal_reachable));
    }

    #[test]
    fn portal_catalogue_applies_conservative_mutation_policy() {
        let catalogue = catalogue();
        for entry in catalogue.entries {
            let observed_http_mutation = entry
                .http_method
                .as_deref()
                .is_some_and(|method| method != "GET");
            let mutation_risk = matches!(
                entry.risk_tier.as_str(),
                "R1_PAPER_MUTATION"
                    | "R2_SANDBOX"
                    | "R3_LIVE_PROTECTIVE"
                    | "R4_LIVE_RISK_INCREASING"
            );
            if observed_http_mutation {
                assert_ne!(entry.risk_tier, "R0_READ", "{}", entry.key);
                assert!(entry.review_policy.owner_review_required, "{}", entry.key);
            }
            if mutation_risk {
                assert!(entry.review_policy.owner_review_required, "{}", entry.key);
                assert!(entry.review_policy.plan_required, "{}", entry.key);
                assert!(entry.delivery_policy.apply_required, "{}", entry.key);
            }
        }
    }

    #[test]
    fn unpublished_ops_and_generic_redis_cannot_gain_incidental_authority() {
        let catalogue = catalogue();
        for key in [
            "ops/trace-order",
            "ops/dead-letters",
            "ops/findings",
            "ops/streams",
            "ops/command-journal",
            "ops/redis-retention",
            "ops/alerts",
            "ops/alpha-activity",
        ] {
            let entry = catalogue
                .entries
                .iter()
                .find(|entry| entry.key == key)
                .unwrap();
            assert_eq!(entry.source_route_state, "UNPUBLISHED");
            assert_eq!(
                entry.blocked_reason,
                "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED"
            );
        }
        for key in ["redis/get", "redis/scan"] {
            let entry = catalogue
                .entries
                .iter()
                .find(|entry| entry.key == key)
                .unwrap();
            assert_eq!(entry.source_route_state, "DIRECT_ACCESS_PROHIBITED");
            assert_eq!(entry.blocked_reason, "GENERIC_REDIS_ACCESS_PROHIBITED");
        }
    }

    #[test]
    fn published_capability_requires_exact_flags_delegation_version_and_step_up() {
        let capability = capability(RiskTier::R3LiveProtective, EffectClass::Protective);
        let authorized = authorize_published(live_protective_flags(), &capability, &proof())
            .expect("exact protective proof");
        assert!(!authorized.source_request_sent);

        let mut wrong = proof();
        wrong.observed_target_version = 8;
        assert_eq!(
            authorize_published(live_protective_flags(), &capability, &wrong),
            Err(AuthorizationError::StaleExpectedVersion)
        );
        wrong = proof();
        wrong.webauthn_verified = false;
        assert_eq!(
            authorize_published(live_protective_flags(), &capability, &wrong),
            Err(AuthorizationError::StepUpRequired)
        );
        wrong = proof();
        wrong.delegation_target_key = "deployment:other";
        assert_eq!(
            authorize_published(live_protective_flags(), &capability, &wrong),
            Err(AuthorizationError::DelegationBindingMismatch)
        );
        wrong = proof();
        wrong.actor_role = ActorRole::Viewer;
        assert_eq!(
            authorize_published(live_protective_flags(), &capability, &wrong),
            Err(AuthorizationError::RoleDenied)
        );
        wrong = proof();
        wrong.delegation_expires_at_epoch_seconds = wrong.now_epoch_seconds;
        assert_eq!(
            authorize_published(live_protective_flags(), &capability, &wrong),
            Err(AuthorizationError::DelegationExpired)
        );
    }

    #[test]
    fn command_flags_and_kill_switch_are_independent() {
        let capability = capability(RiskTier::R3LiveProtective, EffectClass::Protective);
        assert_eq!(
            authorize_published(CommandFeatureFlags::default(), &capability, &proof()),
            Err(AuthorizationError::CommandFlagDenied)
        );
        let flags = CommandFeatureFlags {
            live_protective_commands_enabled: true,
            command_kill_switch_active: true,
            ..CommandFeatureFlags::default()
        };
        assert_eq!(
            authorize_published(flags, &capability, &proof()),
            Err(AuthorizationError::CommandFlagDenied)
        );
    }

    #[test]
    fn risk_increasing_requires_webauthn_dual_approval_and_its_own_flag() {
        let mut capability =
            capability(RiskTier::R4LiveRiskIncreasing, EffectClass::RiskIncreasing);
        capability.requires_dual_approval = true;
        let mut proof = proof();
        proof.distinct_approver_count = 1;
        let flags = CommandFeatureFlags {
            live_risk_increasing_commands_enabled: true,
            ..CommandFeatureFlags::default()
        };
        assert_eq!(
            authorize_published(flags, &capability, &proof),
            Err(AuthorizationError::DualApprovalRequired)
        );
        proof.distinct_approver_count = 2;
        assert!(authorize_published(flags, &capability, &proof).is_ok());
    }

    #[test]
    fn duplicate_same_payload_replays_but_conflicting_payload_is_rejected() {
        let mut journal = RelayJournal::default();
        assert_eq!(
            journal.register("idem-1", "op-1", HASH_A),
            Ok(RegisterOutcome::FirstSeen)
        );
        assert_eq!(
            journal.register("idem-1", "op-ignored", HASH_A),
            Ok(RegisterOutcome::Replay {
                operation_id: "op-1".to_owned()
            })
        );
        assert_eq!(
            journal.register(
                "idem-1",
                "op-2",
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            ),
            Err(JournalError::PayloadConflict)
        );
    }

    #[test]
    fn accepted_202_is_nonterminal_and_verify_controls_terminal_truth() {
        let mut journal = RelayJournal::default();
        journal.register("idem-1", "op-1", HASH_A).unwrap();
        journal.mark_dispatched("idem-1").unwrap();
        assert_eq!(
            journal.observe("idem-1", SourceObservation::HttpAccepted202),
            Ok(JournalState::Accepted)
        );
        assert!(!journal.state("idem-1").unwrap().is_source_terminal());
        assert!(!journal.state("idem-1").unwrap().automatic_retry_allowed());
        assert_eq!(
            journal.observe("idem-1", SourceObservation::Succeeded),
            Ok(JournalState::Succeeded)
        );
    }

    #[test]
    fn uncertain_survives_restart_blocks_risk_and_only_allows_safe_protection() {
        let mut journal = RelayJournal::default();
        journal
            .register_scoped(
                "idem-1",
                "op-1",
                HASH_A,
                "deployment:dep-1",
                EffectClass::Protective,
                true,
                true,
            )
            .unwrap();
        journal.mark_dispatched("idem-1").unwrap();
        journal
            .observe("idem-1", SourceObservation::Ambiguous)
            .unwrap();

        let snapshot = journal.snapshot_json().unwrap();
        let mut restored = RelayJournal::restore_json(&snapshot).unwrap();
        assert_eq!(restored.state("idem-1"), Ok(JournalState::Uncertain));
        assert_eq!(
            restored.register_scoped(
                "idem-risk",
                "op-risk",
                HASH_A,
                "deployment:dep-1",
                EffectClass::RiskIncreasing,
                true,
                false,
            ),
            Err(JournalError::TargetUncertainRiskIncreaseBlocked)
        );
        assert_eq!(
            restored.register_scoped(
                "idem-close",
                "op-close",
                HASH_A,
                "deployment:dep-1",
                EffectClass::Protective,
                false,
                false,
            ),
            Err(JournalError::TargetUncertainProtectionUnsafe)
        );
        assert_eq!(
            restored.register_scoped(
                "idem-halt",
                "op-halt",
                HASH_A,
                "deployment:dep-1",
                EffectClass::Protective,
                true,
                true,
            ),
            Ok(RegisterOutcome::FirstSeen)
        );
        assert_eq!(
            restored.reconcile_uncertain("idem-1", SourceObservation::Succeeded),
            Ok(JournalState::Succeeded)
        );
    }

    #[test]
    fn malformed_restart_snapshot_fails_closed() {
        assert_eq!(
            RelayJournal::restore_json("{\"bad\":true}"),
            Err(JournalError::InvalidSnapshot)
        );
    }
}
