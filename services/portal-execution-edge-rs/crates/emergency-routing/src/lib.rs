//! N16A source-dark same-domain routing and emergency policy authority.
//!
//! This crate is deliberately pure domain code. It owns no listener, network
//! client, hostname resolution, credential, Cloudflare resource or Trading
//! System authority. A valid N16A profile can only return fail-closed routing
//! decisions and can never authorize an R3 or R4 source request.

#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const EMERGENCY_SCHEMA_VERSION: &str = "portal.execution.emergency-routing.v1";
pub const PUBLIC_ORIGIN: &str = "https://portal.primusspark.com";
pub const EMERGENCY_PATH_PREFIX: &str = "/ops/emergency/";
pub const NORMAL_PROFILE: &str = "research_sgp_stable";
pub const EMERGENCY_PROFILE: &str = "execution_ops";
pub const MAX_SESSION_SECONDS: u64 = 300;
pub const MAX_STEP_UP_AGE_SECONDS: u64 = 90;
pub const MAX_BREAK_GLASS_SECONDS: u64 = 300;
pub const MIN_BREAK_GLASS_APPROVALS: usize = 2;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DependencyState {
    Available,
    Degraded,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EmergencyUiState {
    SourceDark,
    Unavailable,
    Degraded,
    Rollback,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DrillScenario {
    NormalResearch,
    ResearchLoss,
    CloudflareLoss,
    ExecutionOriginLoss,
    Rollback,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RouteTarget {
    None,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RoutingReason {
    SourceDark,
    ResearchUnavailable,
    CloudflareUnavailable,
    ExecutionOriginUnavailable,
    N12R3CatalogueUnpublished,
    RollbackEngaged,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct RoutePolicy {
    pub public_origin: String,
    pub path_prefix: String,
    pub normal_profile: String,
    pub emergency_profile: String,
    pub browser_mode: String,
    pub origin_resolution: String,
    pub same_origin_only: bool,
    pub redirects_allowed: bool,
    pub cors_allowed: bool,
    pub public_route_active: bool,
    pub execution_origin_bound: bool,
    pub browser_internal_origin_visible: bool,
    pub browser_delegated_token_visible: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct EmergencySecurityPolicy {
    pub same_portal_session: bool,
    pub allowed_roles: Vec<ActorRole>,
    pub step_up_method: String,
    pub maximum_session_seconds: u64,
    pub maximum_step_up_age_seconds: u64,
    pub maximum_break_glass_seconds: u64,
    pub minimum_distinct_approvals: usize,
    pub minimum_reason_characters: usize,
    pub maximum_reason_characters: usize,
    pub confirmation_literal: String,
    pub immutable_audit_mode: String,
    pub command_independent_health: bool,
    pub raw_browser_token_forwarding: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct CommandBoundary {
    pub protective_capabilities: Vec<ProtectiveCapability>,
    pub forbidden_risk_increasing_capabilities: Vec<RiskIncreasingCapability>,
    pub n12_r3_catalogue_published: bool,
    pub dedicated_command_identity_bound: bool,
    pub control_visible: bool,
    pub plan_allowed: bool,
    pub apply_allowed: bool,
    pub verify_allowed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct EmergencyProfile {
    pub schema_version: String,
    pub profile_id: String,
    pub source_dark: bool,
    pub runtime_active: bool,
    pub network_authorized: bool,
    pub source_call_authorized: bool,
    pub route: RoutePolicy,
    pub security: EmergencySecurityPolicy,
    pub command: CommandBoundary,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActorRole {
    Viewer,
    Operator,
    Admin,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProtectiveCapability {
    LiveHalt,
    LiveReduce,
    LiveEmergencyClose,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskIncreasingCapability {
    LiveResume,
    LiveScale,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DependencySnapshot {
    pub research: DependencyState,
    pub cloudflare: DependencyState,
    pub execution_origin: DependencyState,
    pub rollback_engaged: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmergencyRouteDecision {
    pub schema_version: String,
    pub scenario: DrillScenario,
    pub research: DependencyState,
    pub cloudflare: DependencyState,
    pub execution_origin: DependencyState,
    pub ui_state: EmergencyUiState,
    pub reason: RoutingReason,
    pub route_target: RouteTarget,
    pub candidate_profile: Option<String>,
    pub health_available: bool,
    pub control_visible: bool,
    pub source_request_sent: bool,
    pub network_attempts: u64,
}

#[derive(Clone, Debug)]
pub struct EmergencyRouter {
    profile: EmergencyProfile,
}

impl EmergencyRouter {
    /// Loads the one valid N16A profile and rejects any runtime or authority
    /// widening.
    ///
    /// # Errors
    ///
    /// Returns a stable profile error when routing, security or command
    /// invariants no longer describe a source-dark component.
    pub fn from_source_dark_profile(profile: EmergencyProfile) -> Result<Self, ProfileError> {
        validate_profile(&profile)?;
        Ok(Self { profile })
    }

    /// Resolves a deterministic local dependency snapshot. The only route
    /// target representable by N16A is `NONE`.
    #[must_use]
    pub fn resolve(&self, snapshot: DependencySnapshot) -> EmergencyRouteDecision {
        let (scenario, ui_state, reason, candidate_profile) = if snapshot.rollback_engaged {
            (
                DrillScenario::Rollback,
                EmergencyUiState::Rollback,
                RoutingReason::RollbackEngaged,
                None,
            )
        } else if snapshot.cloudflare == DependencyState::Unavailable {
            (
                DrillScenario::CloudflareLoss,
                EmergencyUiState::Unavailable,
                RoutingReason::CloudflareUnavailable,
                None,
            )
        } else if snapshot.research == DependencyState::Unavailable
            && snapshot.execution_origin == DependencyState::Unavailable
        {
            (
                DrillScenario::ExecutionOriginLoss,
                EmergencyUiState::Unavailable,
                RoutingReason::ExecutionOriginUnavailable,
                None,
            )
        } else if snapshot.research == DependencyState::Unavailable {
            (
                DrillScenario::ResearchLoss,
                EmergencyUiState::Degraded,
                RoutingReason::N12R3CatalogueUnpublished,
                Some(self.profile.route.emergency_profile.clone()),
            )
        } else if snapshot.research == DependencyState::Degraded
            || snapshot.cloudflare == DependencyState::Degraded
            || snapshot.execution_origin != DependencyState::Available
        {
            (
                DrillScenario::NormalResearch,
                EmergencyUiState::Degraded,
                RoutingReason::SourceDark,
                None,
            )
        } else {
            (
                DrillScenario::NormalResearch,
                EmergencyUiState::SourceDark,
                RoutingReason::SourceDark,
                None,
            )
        };

        EmergencyRouteDecision {
            schema_version: "portal.execution.emergency-route-decision.v1".to_owned(),
            scenario,
            research: snapshot.research,
            cloudflare: snapshot.cloudflare,
            execution_origin: snapshot.execution_origin,
            ui_state,
            reason,
            route_target: RouteTarget::None,
            candidate_profile,
            health_available: self.profile.security.command_independent_health,
            control_visible: false,
            source_request_sent: false,
            network_attempts: 0,
        }
    }

    #[must_use]
    pub const fn network_attempts(&self) -> u64 {
        0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionProof<'a> {
    pub actor_id: &'a str,
    pub role: ActorRole,
    pub session_id: &'a str,
    pub session_issued_at: u64,
    pub session_expires_at: u64,
    pub step_up_verified: bool,
    pub step_up_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BreakGlassRequest<'a> {
    pub operation_id: &'a str,
    pub incident_id: &'a str,
    pub actor_id: &'a str,
    pub capability: ProtectiveCapability,
    pub environment: &'a str,
    pub resource_id: &'a str,
    pub reason: &'a str,
    pub confirmation: &'a str,
    pub requested_at: u64,
    pub expires_at: u64,
    pub approver_ids: &'a [&'a str],
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EmergencyDenialReason {
    N12R3CatalogueUnpublished,
    SourceDark,
    RiskIncreasingForbidden,
    RoleDenied,
    SessionNotYetValid,
    SessionExpired,
    SessionTooLong,
    StepUpRequired,
    StepUpExpired,
    ActorMismatch,
    InvalidScope,
    InvalidReason,
    ConfirmationMismatch,
    InvalidExpiry,
    DistinctApprovalRequired,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct EmergencyCommandDecision {
    pub schema_version: String,
    pub operation_id: String,
    pub decision: String,
    pub reason: EmergencyDenialReason,
    pub risk_tier: String,
    pub plan_allowed: bool,
    pub apply_allowed: bool,
    pub verify_allowed: bool,
    pub source_request_sent: bool,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct EmergencyCommandGate;

impl EmergencyCommandGate {
    /// Validates the local break-glass ceremony before publication is
    /// considered. This never grants source authority.
    ///
    /// # Errors
    ///
    /// Returns the first stable ceremony denial reason.
    pub fn validate_ceremony(
        policy: &EmergencySecurityPolicy,
        session: &SessionProof<'_>,
        request: &BreakGlassRequest<'_>,
        now: u64,
    ) -> Result<(), EmergencyDenialReason> {
        if !policy.allowed_roles.contains(&session.role) {
            return Err(EmergencyDenialReason::RoleDenied);
        }
        if session.actor_id != request.actor_id {
            return Err(EmergencyDenialReason::ActorMismatch);
        }
        if session.actor_id.is_empty()
            || session.session_id.is_empty()
            || request.operation_id.is_empty()
            || request.incident_id.is_empty()
            || request.resource_id.is_empty()
            || !matches!(request.environment, "LIVE_CANARY" | "LIVE_FULL")
        {
            return Err(EmergencyDenialReason::InvalidScope);
        }
        if session.session_issued_at > now {
            return Err(EmergencyDenialReason::SessionNotYetValid);
        }
        if now >= session.session_expires_at {
            return Err(EmergencyDenialReason::SessionExpired);
        }
        if session
            .session_expires_at
            .saturating_sub(session.session_issued_at)
            > policy.maximum_session_seconds
        {
            return Err(EmergencyDenialReason::SessionTooLong);
        }
        if !session.step_up_verified {
            return Err(EmergencyDenialReason::StepUpRequired);
        }
        if session.step_up_at > now
            || now.saturating_sub(session.step_up_at) > policy.maximum_step_up_age_seconds
        {
            return Err(EmergencyDenialReason::StepUpExpired);
        }
        let reason_chars = request.reason.chars().count();
        if reason_chars < policy.minimum_reason_characters
            || reason_chars > policy.maximum_reason_characters
        {
            return Err(EmergencyDenialReason::InvalidReason);
        }
        if request.confirmation != policy.confirmation_literal {
            return Err(EmergencyDenialReason::ConfirmationMismatch);
        }
        if request.requested_at > now
            || now.saturating_sub(request.requested_at) > policy.maximum_break_glass_seconds
            || request.expires_at <= now
            || request.expires_at.saturating_sub(request.requested_at)
                > policy.maximum_break_glass_seconds
        {
            return Err(EmergencyDenialReason::InvalidExpiry);
        }
        let approvers = request
            .approver_ids
            .iter()
            .copied()
            .filter(|approver| !approver.is_empty() && *approver != request.actor_id)
            .collect::<BTreeSet<_>>();
        if approvers.len() < policy.minimum_distinct_approvals {
            return Err(EmergencyDenialReason::DistinctApprovalRequired);
        }
        Ok(())
    }

    /// N16A always returns a typed denial after locally validating the
    /// ceremony. The owner-published N12 R3 catalogue is the only later source
    /// of protective command authority.
    #[must_use]
    pub fn deny_source_dark(
        operation_id: impl Into<String>,
        reason: EmergencyDenialReason,
    ) -> EmergencyCommandDecision {
        EmergencyCommandDecision {
            schema_version: "portal.execution.emergency-command-decision.v1".to_owned(),
            operation_id: operation_id.into(),
            decision: "DENIED".to_owned(),
            reason,
            risk_tier: "R3_LIVE_PROTECTIVE".to_owned(),
            plan_allowed: false,
            apply_allowed: false,
            verify_allowed: false,
            source_request_sent: false,
        }
    }

    #[must_use]
    pub fn deny_risk_increasing(operation_id: impl Into<String>) -> EmergencyCommandDecision {
        let mut decision =
            Self::deny_source_dark(operation_id, EmergencyDenialReason::RiskIncreasingForbidden);
        "R4_LIVE_RISK_INCREASING".clone_into(&mut decision.risk_tier);
        decision
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditEventKind {
    CeremonyValidated,
    CommandDenied,
    SessionExpired,
    DependencyDegraded,
    RollbackEngaged,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuditRecord {
    pub sequence: u64,
    pub occurred_at_epoch_seconds: u64,
    pub event: AuditEventKind,
    pub actor_id: String,
    pub operation_id: String,
    pub reason_code: String,
    pub previous_hash: String,
    pub record_hash: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImmutableAuditChain {
    records: Vec<AuditRecord>,
}

impl ImmutableAuditChain {
    /// Appends one length-prefixed, SHA-256-linked Portal audit fact.
    ///
    /// # Errors
    ///
    /// Rejects empty/oversized fields and non-monotonic timestamps.
    pub fn append(
        &mut self,
        occurred_at_epoch_seconds: u64,
        event: AuditEventKind,
        actor_id: impl Into<String>,
        operation_id: impl Into<String>,
        reason_code: impl Into<String>,
    ) -> Result<&AuditRecord, AuditError> {
        let actor_id = actor_id.into();
        let operation_id = operation_id.into();
        let reason_code = reason_code.into();
        if !bounded(&actor_id, 160) || !bounded(&operation_id, 160) || !bounded(&reason_code, 160) {
            return Err(AuditError::InvalidField);
        }
        if self
            .records
            .last()
            .is_some_and(|record| record.occurred_at_epoch_seconds > occurred_at_epoch_seconds)
        {
            return Err(AuditError::NonMonotonicTime);
        }
        let sequence = self.records.len() as u64 + 1;
        let previous_hash = self
            .records
            .last()
            .map_or_else(genesis_hash, |record| record.record_hash.clone());
        let record_hash = audit_hash(
            sequence,
            occurred_at_epoch_seconds,
            event,
            &actor_id,
            &operation_id,
            &reason_code,
            &previous_hash,
        );
        self.records.push(AuditRecord {
            sequence,
            occurred_at_epoch_seconds,
            event,
            actor_id,
            operation_id,
            reason_code,
            previous_hash,
            record_hash,
        });
        self.records.last().ok_or(AuditError::InvalidChain)
    }

    /// Verifies the full sequence and hash chain.
    ///
    /// # Errors
    ///
    /// Rejects sequence, previous-hash, hash or time tampering.
    pub fn verify(&self) -> Result<(), AuditError> {
        let mut previous_hash = genesis_hash();
        let mut previous_time = 0;
        for (index, record) in self.records.iter().enumerate() {
            if record.sequence != index as u64 + 1
                || record.previous_hash != previous_hash
                || record.occurred_at_epoch_seconds < previous_time
            {
                return Err(AuditError::InvalidChain);
            }
            let expected = audit_hash(
                record.sequence,
                record.occurred_at_epoch_seconds,
                record.event,
                &record.actor_id,
                &record.operation_id,
                &record.reason_code,
                &record.previous_hash,
            );
            if record.record_hash != expected {
                return Err(AuditError::InvalidChain);
            }
            previous_hash.clone_from(&record.record_hash);
            previous_time = record.occurred_at_epoch_seconds;
        }
        Ok(())
    }

    #[must_use]
    pub fn records(&self) -> &[AuditRecord] {
        &self.records
    }
}

#[derive(Clone, Copy, Debug, Error, Eq, PartialEq)]
pub enum AuditError {
    #[error("audit field is empty or exceeds its bound")]
    InvalidField,
    #[error("audit timestamp moved backwards")]
    NonMonotonicTime,
    #[error("immutable audit hash chain is invalid")]
    InvalidChain,
}

#[derive(Clone, Copy, Debug, Error, Eq, PartialEq)]
pub enum ProfileError {
    #[error("profile widened the N16A source-dark boundary")]
    SourceDarkBoundary,
    #[error("same-domain route policy is unsafe")]
    UnsafeRoute,
    #[error("emergency session or audit policy is unsafe")]
    UnsafeSecurity,
    #[error("R3/R4 command boundary is unsafe")]
    UnsafeCommandBoundary,
}

fn validate_profile(profile: &EmergencyProfile) -> Result<(), ProfileError> {
    if profile.schema_version != EMERGENCY_SCHEMA_VERSION
        || profile.profile_id != "n16a-source-dark"
        || !profile.source_dark
        || profile.runtime_active
        || profile.network_authorized
        || profile.source_call_authorized
    {
        return Err(ProfileError::SourceDarkBoundary);
    }
    let route = &profile.route;
    if route.public_origin != PUBLIC_ORIGIN
        || route.path_prefix != EMERGENCY_PATH_PREFIX
        || route.normal_profile != NORMAL_PROFILE
        || route.emergency_profile != EMERGENCY_PROFILE
        || route.browser_mode != "SAME_ORIGIN_ONLY"
        || route.origin_resolution != "SERVER_SIDE_ONLY"
        || !route.same_origin_only
        || route.redirects_allowed
        || route.cors_allowed
        || route.public_route_active
        || route.execution_origin_bound
        || route.browser_internal_origin_visible
        || route.browser_delegated_token_visible
    {
        return Err(ProfileError::UnsafeRoute);
    }
    let security = &profile.security;
    if !security.same_portal_session
        || security.allowed_roles != [ActorRole::Operator, ActorRole::Admin]
        || security.step_up_method != "PHISHING_RESISTANT_WEBAUTHN"
        || security.maximum_session_seconds > MAX_SESSION_SECONDS
        || security.maximum_step_up_age_seconds > MAX_STEP_UP_AGE_SECONDS
        || security.maximum_break_glass_seconds > MAX_BREAK_GLASS_SECONDS
        || security.minimum_distinct_approvals < MIN_BREAK_GLASS_APPROVALS
        || security.minimum_reason_characters < 20
        || security.maximum_reason_characters > 500
        || security.minimum_reason_characters > security.maximum_reason_characters
        || security.confirmation_literal != "BREAK-GLASS"
        || security.immutable_audit_mode != "SHA256_HASH_CHAIN"
        || !security.command_independent_health
        || security.raw_browser_token_forwarding
    {
        return Err(ProfileError::UnsafeSecurity);
    }
    let command = &profile.command;
    if command.protective_capabilities
        != [
            ProtectiveCapability::LiveHalt,
            ProtectiveCapability::LiveReduce,
            ProtectiveCapability::LiveEmergencyClose,
        ]
        || command.forbidden_risk_increasing_capabilities
            != [
                RiskIncreasingCapability::LiveResume,
                RiskIncreasingCapability::LiveScale,
            ]
        || command.n12_r3_catalogue_published
        || command.dedicated_command_identity_bound
        || command.control_visible
        || command.plan_allowed
        || command.apply_allowed
        || command.verify_allowed
    {
        return Err(ProfileError::UnsafeCommandBoundary);
    }
    Ok(())
}

fn bounded(value: &str, maximum: usize) -> bool {
    !value.is_empty() && value.len() <= maximum && !value.contains('\n') && !value.contains('\r')
}

fn genesis_hash() -> String {
    format!("sha256:{}", "0".repeat(64))
}

#[allow(clippy::too_many_arguments)]
fn audit_hash(
    sequence: u64,
    occurred_at_epoch_seconds: u64,
    event: AuditEventKind,
    actor_id: &str,
    operation_id: &str,
    reason_code: &str,
    previous_hash: &str,
) -> String {
    let mut digest = Sha256::new();
    for part in [
        sequence.to_string(),
        occurred_at_epoch_seconds.to_string(),
        format!("{event:?}"),
        actor_id.to_owned(),
        operation_id.to_owned(),
        reason_code.to_owned(),
        previous_hash.to_owned(),
    ] {
        digest.update(u64::try_from(part.len()).unwrap_or(u64::MAX).to_be_bytes());
        digest.update(part.as_bytes());
    }
    format!("sha256:{}", hex::encode(digest.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROFILE_FIXTURE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../../packages/contracts/fixtures/execution-emergency-routing.source-dark.valid.json"
    ));

    fn router() -> EmergencyRouter {
        EmergencyRouter::from_source_dark_profile(
            serde_json::from_str(PROFILE_FIXTURE).expect("fixture must parse"),
        )
        .expect("fixture must remain source-dark")
    }

    fn policy() -> EmergencySecurityPolicy {
        let profile: EmergencyProfile =
            serde_json::from_str(PROFILE_FIXTURE).expect("fixture must parse");
        profile.security
    }

    fn session(now: u64) -> SessionProof<'static> {
        SessionProof {
            actor_id: "usr_operator",
            role: ActorRole::Admin,
            session_id: "ses_emergency",
            session_issued_at: now - 30,
            session_expires_at: now + 240,
            step_up_verified: true,
            step_up_at: now - 10,
        }
    }

    fn request(now: u64) -> BreakGlassRequest<'static> {
        BreakGlassRequest {
            operation_id: "op_emergency_01",
            incident_id: "inc_execution_01",
            actor_id: "usr_operator",
            capability: ProtectiveCapability::LiveHalt,
            environment: "LIVE_CANARY",
            resource_id: "dep_live_canary_01",
            reason: "Authoritative execution health requires protective halt",
            confirmation: "BREAK-GLASS",
            requested_at: now,
            expires_at: now + 180,
            approver_ids: &["usr_approver_1", "usr_approver_2"],
        }
    }

    #[test]
    fn source_dark_profile_never_resolves_a_live_route() {
        let router = router();
        for snapshot in [
            DependencySnapshot {
                research: DependencyState::Available,
                cloudflare: DependencyState::Available,
                execution_origin: DependencyState::Available,
                rollback_engaged: false,
            },
            DependencySnapshot {
                research: DependencyState::Unavailable,
                cloudflare: DependencyState::Available,
                execution_origin: DependencyState::Available,
                rollback_engaged: false,
            },
            DependencySnapshot {
                research: DependencyState::Unavailable,
                cloudflare: DependencyState::Unavailable,
                execution_origin: DependencyState::Unavailable,
                rollback_engaged: false,
            },
            DependencySnapshot {
                research: DependencyState::Available,
                cloudflare: DependencyState::Available,
                execution_origin: DependencyState::Available,
                rollback_engaged: true,
            },
        ] {
            let decision = router.resolve(snapshot);
            assert_eq!(decision.route_target, RouteTarget::None);
            assert!(!decision.control_visible);
            assert!(!decision.source_request_sent);
            assert_eq!(decision.network_attempts, 0);
        }
        assert_eq!(router.network_attempts(), 0);
    }

    #[test]
    fn research_loss_exposes_only_a_candidate_profile_and_independent_health() {
        let decision = router().resolve(DependencySnapshot {
            research: DependencyState::Unavailable,
            cloudflare: DependencyState::Available,
            execution_origin: DependencyState::Available,
            rollback_engaged: false,
        });
        assert_eq!(decision.ui_state, EmergencyUiState::Degraded);
        assert_eq!(decision.reason, RoutingReason::N12R3CatalogueUnpublished);
        assert_eq!(
            decision.candidate_profile.as_deref(),
            Some(EMERGENCY_PROFILE)
        );
        assert!(decision.health_available);
        assert!(!decision.control_visible);
    }

    #[test]
    fn cloudflare_loss_never_bypasses_the_public_same_origin() {
        let decision = router().resolve(DependencySnapshot {
            research: DependencyState::Available,
            cloudflare: DependencyState::Unavailable,
            execution_origin: DependencyState::Available,
            rollback_engaged: false,
        });
        assert_eq!(decision.ui_state, EmergencyUiState::Unavailable);
        assert_eq!(decision.reason, RoutingReason::CloudflareUnavailable);
        assert_eq!(decision.candidate_profile, None);
    }

    #[test]
    fn source_dark_and_unsafe_profiles_are_rejected() {
        let mut profile: EmergencyProfile =
            serde_json::from_str(PROFILE_FIXTURE).expect("fixture must parse");
        profile.route.public_route_active = true;
        assert!(matches!(
            EmergencyRouter::from_source_dark_profile(profile),
            Err(ProfileError::UnsafeRoute)
        ));

        let mut profile: EmergencyProfile =
            serde_json::from_str(PROFILE_FIXTURE).expect("fixture must parse");
        profile.command.n12_r3_catalogue_published = true;
        assert!(matches!(
            EmergencyRouter::from_source_dark_profile(profile),
            Err(ProfileError::UnsafeCommandBoundary)
        ));
    }

    #[test]
    fn complete_break_glass_ceremony_is_valid_but_still_has_no_source_authority() {
        let now = 1_788_134_400;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &session(now), &request(now), now,),
            Ok(())
        );
        let denied = EmergencyCommandGate::deny_source_dark(
            "op_emergency_01",
            EmergencyDenialReason::N12R3CatalogueUnpublished,
        );
        assert_eq!(denied.decision, "DENIED");
        assert!(!denied.plan_allowed);
        assert!(!denied.apply_allowed);
        assert!(!denied.verify_allowed);
        assert!(!denied.source_request_sent);
    }

    #[test]
    fn session_step_up_reason_expiry_and_approvals_fail_closed() {
        let now = 1_788_134_400;
        let mut stale_step_up = session(now);
        stale_step_up.step_up_at = now - MAX_STEP_UP_AGE_SECONDS - 1;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &stale_step_up, &request(now), now,),
            Err(EmergencyDenialReason::StepUpExpired)
        );

        let mut weak_request = request(now);
        weak_request.reason = "too short";
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &session(now), &weak_request, now,),
            Err(EmergencyDenialReason::InvalidReason)
        );

        let mut one_approver = request(now);
        one_approver.approver_ids = &["usr_approver_1", "usr_approver_1"];
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &session(now), &one_approver, now,),
            Err(EmergencyDenialReason::DistinctApprovalRequired)
        );
    }

    #[test]
    fn viewer_future_session_expired_session_and_wide_ceremony_fail_closed() {
        let now = 1_788_134_400;
        let mut viewer = session(now);
        viewer.role = ActorRole::Viewer;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &viewer, &request(now), now,),
            Err(EmergencyDenialReason::RoleDenied)
        );

        let mut future = session(now);
        future.session_issued_at = now + 1;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &future, &request(now), now,),
            Err(EmergencyDenialReason::SessionNotYetValid)
        );

        let mut expired = session(now);
        expired.session_expires_at = now;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &expired, &request(now), now,),
            Err(EmergencyDenialReason::SessionExpired)
        );

        let mut wide = request(now);
        wide.requested_at = now - MAX_BREAK_GLASS_SECONDS - 1;
        assert_eq!(
            EmergencyCommandGate::validate_ceremony(&policy(), &session(now), &wide, now,),
            Err(EmergencyDenialReason::InvalidExpiry)
        );
    }

    #[test]
    fn r4_resume_and_scale_are_structurally_denied() {
        for capability in [
            RiskIncreasingCapability::LiveResume,
            RiskIncreasingCapability::LiveScale,
        ] {
            let decision = EmergencyCommandGate::deny_risk_increasing(format!("op-{capability:?}"));
            assert_eq!(
                decision.reason,
                EmergencyDenialReason::RiskIncreasingForbidden
            );
            assert_eq!(decision.risk_tier, "R4_LIVE_RISK_INCREASING");
            assert!(!decision.source_request_sent);
        }
    }

    #[test]
    fn immutable_audit_chain_detects_tampering_and_restart_round_trips() {
        let mut chain = ImmutableAuditChain::default();
        chain
            .append(
                1_788_134_400,
                AuditEventKind::CeremonyValidated,
                "usr_operator",
                "op_emergency_01",
                "LOCAL_CEREMONY_VALID",
            )
            .expect("first record");
        chain
            .append(
                1_788_134_401,
                AuditEventKind::CommandDenied,
                "usr_operator",
                "op_emergency_01",
                "N12_R3_CATALOGUE_UNPUBLISHED",
            )
            .expect("second record");
        assert_eq!(chain.verify(), Ok(()));

        let snapshot = serde_json::to_string(&chain).expect("snapshot");
        let restored: ImmutableAuditChain = serde_json::from_str(&snapshot).expect("restore");
        assert_eq!(restored.verify(), Ok(()));

        let mut tampered: serde_json::Value =
            serde_json::from_str(&snapshot).expect("value restore");
        tampered["records"][1]["reason_code"] = serde_json::json!("SUCCESS");
        let tampered: ImmutableAuditChain =
            serde_json::from_value(tampered).expect("structural restore");
        assert_eq!(tampered.verify(), Err(AuditError::InvalidChain));
    }
}
