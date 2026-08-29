//! N16B compatibility authority for current Trading System protective primitives.
//!
//! This module accepts source shape compatibility only. It contains no network
//! client and the canonical fixture deliberately keeps command transport and
//! source-call authority disabled until N17B accepts an exact release/window.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CURRENT_PROTECTIVE_SCHEMA_VERSION: &str = "portal.execution.protective-path-current.v1";
pub const CURRENT_PROTECTIVE_PHASE: &str = "N16B";
pub const CANONICAL_ACCEPTANCE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/contracts/fixtures/execution-protective-path.current-emergency-close.accepted.json"
));

const COMMAND_CATALOG_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/contracts/fixtures/execution-command-catalog.valid.json"
));
const OPENAPI_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/openapi.sanitized.json"
));
const REQUEST_CONTRACT_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/request-contracts.json"
));
const RESPONSE_SHAPE_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/response-shapes.json"
));
const N15B_ACCEPTANCE_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json"
));
const N16A_PROFILE_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/contracts/fixtures/execution-emergency-routing.source-dark.valid.json"
));

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ImmutableBindings {
    pub command_catalog_sha256: String,
    pub openapi_sha256: String,
    pub request_contracts_sha256: String,
    pub response_shapes_sha256: String,
    pub n15b_acceptance_sha256: String,
    pub n16a_profile_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct IdentityBoundary {
    pub edge_identity: String,
    pub read_identity_forbidden: bool,
    pub authentication: String,
    pub delegated_scope: String,
    pub delegated_resource: String,
    pub jwt_maximum_ttl_seconds: u64,
    pub source_credential_server_side_only: bool,
    pub browser_internal_hostname_visible: bool,
    pub browser_source_credential_visible: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct AcceptedMapping {
    pub capability_id: String,
    pub catalog_key: String,
    pub environment: String,
    pub risk_tier: String,
    pub effect: String,
    pub target_types: Vec<String>,
    pub mode: String,
    pub venue: String,
    pub product: String,
    pub plan: String,
    pub apply: String,
    pub operation: String,
    pub verify: String,
    pub maximum_request_bytes: usize,
    pub maximum_response_bytes: usize,
    pub source_idempotent: bool,
    pub portal_idempotency_required: bool,
    pub automatic_retry_after_dispatch: bool,
    pub requires_webauthn: bool,
    pub distinct_approver_count: u8,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapabilityState {
    AcceptedCurrentPrimitive,
    SupportedButNotActivated,
    SourceDoesNotCurrentlyExist,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityClassification {
    pub capability_id: String,
    pub state: CapabilityState,
    pub reason_code: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct TerminalReconciliation {
    pub source_states: Vec<String>,
    pub terminal_states: Vec<String>,
    pub http_200_is_terminal: bool,
    pub operation_id_required: bool,
    pub verify_required: bool,
    pub partial_is_failure_visible: bool,
    pub ambiguous_becomes_uncertain: bool,
    pub retry_while_uncertain: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct RuntimeAuthority {
    pub compatibility_contract_accepted: bool,
    pub command_transport_enabled: bool,
    pub source_call_authorized: bool,
    pub public_route_enabled: bool,
    pub live_mutation_authorized: bool,
    pub trading_system_changed: bool,
    pub runtime_probe_executed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceIdentity {
    pub authority: String,
    pub source_commit: String,
    pub gateway_image: String,
    pub gateway_digest: String,
    pub runtime_profile: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Rollback {
    pub scope: String,
    pub steps: Vec<String>,
    pub database_restore_required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentProtectiveAcceptance {
    pub schema_version: String,
    pub phase: String,
    pub status: String,
    pub source: SourceIdentity,
    pub immutable_bindings: ImmutableBindings,
    pub identity_boundary: IdentityBoundary,
    pub accepted_mapping: AcceptedMapping,
    pub capability_classification: Vec<CapabilityClassification>,
    pub terminal_reconciliation: TerminalReconciliation,
    pub runtime_authority: RuntimeAuthority,
    pub rollback: Rollback,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProtectivePlan<'a> {
    pub capability_id: &'a str,
    pub environment: &'a str,
    pub target_type: &'a str,
    pub mode: &'a str,
    pub venue: &'a str,
    pub product: &'a str,
    pub edge_identity: &'a str,
}

#[derive(Clone, Copy, Debug, Error, Eq, PartialEq)]
pub enum CurrentProtectiveError {
    #[error("canonical N16B acceptance fixture is invalid")]
    InvalidAcceptance,
    #[error("canonical N16B source evidence binding drifted")]
    EvidenceDrift,
    #[error("read or unknown identity cannot use the protective path")]
    CommandIdentityRequired,
    #[error("protective capability or target scope is not accepted")]
    ScopeNotAccepted,
    #[error("N16B accepts compatibility only; command transport remains inactive")]
    RuntimeInactive,
}

impl CurrentProtectiveAcceptance {
    /// Loads and binds the source-as-is N16B compatibility contract.
    ///
    /// # Errors
    ///
    /// Fails closed if the fixture, accepted shape or any source evidence hash drifts.
    pub fn canonical() -> Result<Self, CurrentProtectiveError> {
        let acceptance: Self = serde_json::from_str(CANONICAL_ACCEPTANCE_JSON)
            .map_err(|_| CurrentProtectiveError::InvalidAcceptance)?;
        acceptance.validate()?;
        Ok(acceptance)
    }

    /// Authorizes construction of a transport only after a later runtime phase
    /// has explicitly enabled all source-call authorities.
    ///
    /// # Errors
    ///
    /// Read identities, widened scopes and the canonical dark fixture are denied.
    pub fn authorize_transport(
        &self,
        plan: ProtectivePlan<'_>,
    ) -> Result<&AcceptedMapping, CurrentProtectiveError> {
        if plan.edge_identity != self.identity_boundary.edge_identity {
            return Err(CurrentProtectiveError::CommandIdentityRequired);
        }
        let accepted = &self.accepted_mapping;
        if plan.capability_id != accepted.capability_id
            || plan.environment != accepted.environment
            || !accepted
                .target_types
                .iter()
                .any(|target| target == plan.target_type)
            || plan.mode != accepted.mode
            || plan.venue != accepted.venue
            || plan.product != accepted.product
        {
            return Err(CurrentProtectiveError::ScopeNotAccepted);
        }
        if !self.runtime_authority.command_transport_enabled
            || !self.runtime_authority.source_call_authorized
            || !self.runtime_authority.live_mutation_authorized
        {
            return Err(CurrentProtectiveError::RuntimeInactive);
        }
        Ok(accepted)
    }

    fn validate(&self) -> Result<(), CurrentProtectiveError> {
        if self.schema_version != CURRENT_PROTECTIVE_SCHEMA_VERSION
            || self.phase != CURRENT_PROTECTIVE_PHASE
            || self.status != "CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED"
            || self.identity_boundary.edge_identity != "portal-execution-command"
            || !self.identity_boundary.read_identity_forbidden
            || self.accepted_mapping.capability_id != "live.emergency-close"
            || self.accepted_mapping.environment != "LIVE_FULL"
            || self.accepted_mapping.target_types != ["ACCOUNT"]
            || self.accepted_mapping.source_idempotent
            || self.accepted_mapping.automatic_retry_after_dispatch
            || self.capability_classification.len() != 9
            || self
                .capability_classification
                .iter()
                .filter(|item| item.state == CapabilityState::AcceptedCurrentPrimitive)
                .count()
                != 1
            || !self.runtime_authority.compatibility_contract_accepted
            || self.runtime_authority.command_transport_enabled
            || self.runtime_authority.source_call_authorized
            || self.runtime_authority.public_route_enabled
            || self.runtime_authority.live_mutation_authorized
            || self.runtime_authority.trading_system_changed
            || self.runtime_authority.runtime_probe_executed
        {
            return Err(CurrentProtectiveError::InvalidAcceptance);
        }
        let expected = ImmutableBindings {
            command_catalog_sha256: digest(COMMAND_CATALOG_BYTES),
            openapi_sha256: digest(OPENAPI_BYTES),
            request_contracts_sha256: digest(REQUEST_CONTRACT_BYTES),
            response_shapes_sha256: digest(RESPONSE_SHAPE_BYTES),
            n15b_acceptance_sha256: digest(N15B_ACCEPTANCE_BYTES),
            n16a_profile_sha256: digest(N16A_PROFILE_BYTES),
        };
        if self.immutable_bindings != expected {
            return Err(CurrentProtectiveError::EvidenceDrift);
        }
        Ok(())
    }
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exact_plan<'a>() -> ProtectivePlan<'a> {
        ProtectivePlan {
            capability_id: "live.emergency-close",
            environment: "LIVE_FULL",
            target_type: "ACCOUNT",
            mode: "live",
            venue: "BINANCE",
            product: "USD_M",
            edge_identity: "portal-execution-command",
        }
    }

    #[test]
    fn canonical_contract_binds_source_evidence_and_stays_dark() {
        let acceptance = CurrentProtectiveAcceptance::canonical().unwrap();
        assert_eq!(acceptance.capability_classification.len(), 9);
        assert_eq!(
            acceptance.authorize_transport(exact_plan()),
            Err(CurrentProtectiveError::RuntimeInactive)
        );
    }

    #[test]
    fn read_identity_and_widened_target_are_denied_before_runtime_gate() {
        let acceptance = CurrentProtectiveAcceptance::canonical().unwrap();
        assert_eq!(
            acceptance.authorize_transport(ProtectivePlan {
                edge_identity: "portal-execution-read",
                ..exact_plan()
            }),
            Err(CurrentProtectiveError::CommandIdentityRequired)
        );
        assert_eq!(
            acceptance.authorize_transport(ProtectivePlan {
                target_type: "PORTFOLIO",
                ..exact_plan()
            }),
            Err(CurrentProtectiveError::ScopeNotAccepted)
        );
    }

    #[test]
    fn compatibility_contract_can_authorize_only_after_explicit_runtime_acceptance() {
        let mut acceptance = CurrentProtectiveAcceptance::canonical().unwrap();
        acceptance.runtime_authority.command_transport_enabled = true;
        acceptance.runtime_authority.source_call_authorized = true;
        acceptance.runtime_authority.live_mutation_authorized = true;
        let mapping = acceptance.authorize_transport(exact_plan()).unwrap();
        assert_eq!(mapping.plan, "GET /v1/admin/ops/emergency-close/plan");
        assert_eq!(
            mapping.verify,
            "POST /v1/admin/ops/emergency-close/{operation_id}/verify"
        );
        assert!(!mapping.source_idempotent);
        assert!(!mapping.automatic_retry_after_dispatch);
    }
}
