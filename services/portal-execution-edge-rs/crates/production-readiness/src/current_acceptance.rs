//! N17B exact-set acceptance for the current, source-as-is Paper path.
//!
//! This is contract authority only. It validates the immutable current source,
//! real private-path evidence, recovery boundary and runtime non-authorities.
//! It contains no network client and can neither enable a product route nor
//! dispatch a Trading System command.

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const SCHEMA_VERSION: &str = "portal.execution.production-acceptance-current.v1";
pub const DECISION: &str = "N17B_EXACT_CURRENT_SET_ACCEPTED";
pub const PROFILE_ID: &str = "PAPER_BINANCE_USDM";
pub const SCREEN_ID: &str = "PAPER_TRADING_SCREEN";
pub const SOURCE_CONTRACT: &str = "trading-system.portal-execution.manager-v2.runtime.v1";

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExactSetAcceptance {
    pub schema_version: String,
    pub phase: String,
    pub decision: String,
    pub profile: Profile,
    pub immutable_bindings: ImmutableBindings,
    pub delivery: Vec<Delivery>,
    pub transport_evidence: TransportEvidence,
    pub recovery: Recovery,
    pub runtime_authority: RuntimeAuthority,
    pub rollback: Rollback,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Profile {
    pub environment: String,
    pub manager_profile_id: String,
    pub screen_id: String,
    pub source_contract: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ImmutableBindings {
    pub n13b_source_map_sha256: String,
    pub n14b_release_profile_sha256: String,
    pub n15b_gateway_acceptance_sha256: String,
    pub n16b_protective_acceptance_sha256: String,
    pub n17a_readiness_profile_sha256: String,
    pub manager_publication_sha256: String,
    pub manager_qualification_sha256: String,
    pub edge_image_sha256: String,
    pub source_proxy_image_sha256: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "interface", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Delivery {
    Query {
        state: String,
        capability_ids: Vec<String>,
        source_binding_ids: Vec<String>,
        upstream_routes: Vec<String>,
    },
    Command {
        state: String,
        capability_ids: Vec<String>,
        reason: String,
    },
    Event {
        state: String,
        reason: String,
    },
    Artifact {
        state: String,
        reason: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NegativeStatuses {
    pub missing_jwt: u16,
    pub wrong_resource: u16,
    pub wrong_method: u16,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TransportEvidence {
    pub private_route: String,
    pub http2: bool,
    pub tls13_mtls: bool,
    pub delegated_jwt: bool,
    pub source_limit_requests_per_second: u16,
    pub portal_limit_requests_per_second: u16,
    pub qualification_pacing_requests_per_second: u16,
    pub requests: u32,
    pub successful_requests: u32,
    pub observed_p95_ms: String,
    pub observed_max_ms: String,
    pub maximum_response_bytes: u64,
    pub negative_statuses: NegativeStatuses,
    pub business_rows_emitted: u64,
    pub source_mutations: u64,
    pub command_dispatches: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct Recovery {
    pub n17a_game_day_reused: bool,
    pub stateless_query_adapter: bool,
    pub persistent_source_data_created: bool,
    pub database_restore_required: bool,
    pub paper_query_rpo_seconds: u64,
    pub rollback_target_seconds: u64,
    pub rollback_rehearsed: bool,
    pub identity_rotation_runbook_verified: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct RuntimeAuthority {
    pub owner_phase_approval: bool,
    pub exact_set_contract_accepted: bool,
    pub paper_private_path_qualified: bool,
    pub portal_adapter_implemented: bool,
    pub signed_product_image_published: bool,
    pub product_bff_enabled: bool,
    pub public_stable_changed: bool,
    pub sandbox_read_enabled: bool,
    pub live_read_enabled: bool,
    pub live_command_enabled: bool,
    pub live_mutation_authorized: bool,
    pub trading_system_changed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rollback {
    pub scope: String,
    pub steps: Vec<String>,
    pub automatic_retry_after_dispatch: bool,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum AcceptanceError {
    #[error("N17B acceptance identity drifted")]
    InvalidIdentity,
    #[error("N17B immutable evidence binding drifted")]
    BindingDrift,
    #[error("N17B exact delivery set widened or reordered")]
    DeliveryWidened,
    #[error("N17B private transport evidence is unsafe or incomplete")]
    InvalidTransportEvidence,
    #[error("N17B stateless recovery boundary drifted")]
    InvalidRecovery,
    #[error("N17B runtime authority widened beyond the accepted exact set")]
    RuntimeAuthorityWidened,
    #[error("N17B rollback is incomplete or permits retry")]
    InvalidRollback,
}

/// Validates exact N17B source-as-is acceptance without creating runtime
/// authority.
///
/// # Errors
///
/// Returns a stable fail-closed error for any identity, evidence, delivery,
/// authority or rollback widening.
pub fn validate(acceptance: &ExactSetAcceptance) -> Result<(), AcceptanceError> {
    if acceptance.schema_version != SCHEMA_VERSION
        || acceptance.phase != "N17B"
        || acceptance.decision != DECISION
        || acceptance.profile.environment != "paper"
        || acceptance.profile.manager_profile_id != PROFILE_ID
        || acceptance.profile.screen_id != SCREEN_ID
        || acceptance.profile.source_contract != SOURCE_CONTRACT
    {
        return Err(AcceptanceError::InvalidIdentity);
    }
    validate_bindings(&acceptance.immutable_bindings)?;
    validate_delivery(&acceptance.delivery)?;
    validate_transport(&acceptance.transport_evidence)?;
    validate_recovery(&acceptance.recovery)?;
    validate_runtime(&acceptance.runtime_authority)?;
    validate_rollback(&acceptance.rollback)?;
    Ok(())
}

fn validate_bindings(bindings: &ImmutableBindings) -> Result<(), AcceptanceError> {
    let expected = [
        (
            &bindings.n13b_source_map_sha256,
            digest(include_bytes!(
                "../../../contracts/current-source-v1/capability-source-map.json"
            )),
        ),
        (
            &bindings.n14b_release_profile_sha256,
            digest(include_bytes!(
                "../../../../../deploy/manifests/current-source-paper-release-profile.v1.json"
            )),
        ),
        (
            &bindings.n15b_gateway_acceptance_sha256,
            digest(include_bytes!(
                "../../../../../packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json"
            )),
        ),
        (
            &bindings.n16b_protective_acceptance_sha256,
            digest(include_bytes!(
                "../../../../../packages/contracts/fixtures/execution-protective-path.current-emergency-close.accepted.json"
            )),
        ),
        (
            &bindings.n17a_readiness_profile_sha256,
            digest(include_bytes!(
                "../../../../../packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json"
            )),
        ),
        (
            &bindings.manager_publication_sha256,
            digest(include_bytes!(
                "../../../contracts/manager-v2-paper-read-v1/owner-publication/owner-publication.manifest.json"
            )),
        ),
        (
            &bindings.manager_qualification_sha256,
            digest(include_bytes!(
                "../../../contracts/manager-v2-paper-read-v1/owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json"
            )),
        ),
    ];
    if expected
        .iter()
        .any(|(actual, expected)| *actual != expected)
        || bindings.edge_image_sha256
            != "sha256:acf792c7831f1f7a16dcf2a004fa797a9e9b4812ba6b83f6fd0a3ee216f995db"
        || bindings.source_proxy_image_sha256
            != "sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7"
    {
        return Err(AcceptanceError::BindingDrift);
    }
    Ok(())
}

fn validate_delivery(delivery: &[Delivery]) -> Result<(), AcceptanceError> {
    let expected_capabilities = [
        "deployments.positions",
        "deployments.execution-quality",
        "sessions.current",
    ];
    let expected_bindings = [
        "manager.deployments",
        "manager.performance",
        "manager.positions",
        "manager.sessions",
    ];
    let expected_routes = [
        "GET /internal/v2/manager/capabilities",
        "GET /internal/v2/manager/relations/public/{relation}",
    ];
    let valid = matches!(delivery.first(), Some(Delivery::Query {
        state,
        capability_ids,
        source_binding_ids,
        upstream_routes,
    }) if state == "CONNECTED_PRIVATE_ACCEPTED"
        && string_slice(capability_ids) == expected_capabilities
        && string_slice(source_binding_ids) == expected_bindings
        && string_slice(upstream_routes) == expected_routes)
        && matches!(delivery.get(1), Some(Delivery::Command { state, capability_ids, reason })
            if state == "COMPATIBILITY_ACCEPTED_RUNTIME_INACTIVE"
                && string_slice(capability_ids) == ["live.emergency-close"]
                && reason == "EXACT_LIVE_ACCOUNT_WINDOW_NOT_OPEN")
        && matches!(delivery.get(2), Some(Delivery::Event { state, reason })
            if state == "SOURCE_DOES_NOT_CURRENTLY_EXIST"
                && reason == "NO_AUTHORITATIVE_INCREMENTAL_EVENT_SOURCE_PUBLISHED")
        && matches!(delivery.get(3), Some(Delivery::Artifact { state, reason })
            if state == "SOURCE_DOES_NOT_CURRENTLY_EXIST"
                && reason == "NO_CURRENT_OWNER_ARTIFACT_REFERENCE_SOURCE")
        && delivery.len() == 4;
    if !valid {
        return Err(AcceptanceError::DeliveryWidened);
    }
    Ok(())
}

fn validate_transport(evidence: &TransportEvidence) -> Result<(), AcceptanceError> {
    let p95 = evidence.observed_p95_ms.parse::<f64>().ok();
    let maximum = evidence.observed_max_ms.parse::<f64>().ok();
    if evidence.private_route != "10.70.0.1/30_TO_10.70.0.2/30"
        || !evidence.http2
        || !evidence.tls13_mtls
        || !evidence.delegated_jwt
        || evidence.source_limit_requests_per_second != 20
        || !(1..=15).contains(&evidence.portal_limit_requests_per_second)
        || !(1..=evidence.portal_limit_requests_per_second)
            .contains(&evidence.qualification_pacing_requests_per_second)
        || evidence.requests < 25
        || evidence.successful_requests != evidence.requests
        || p95.is_none_or(|value| value <= 0.0 || value > 500.0)
        || maximum.is_none_or(|value| value <= 0.0 || value > 2_000.0)
        || p95 > maximum
        || evidence.maximum_response_bytes == 0
        || evidence.maximum_response_bytes > 2 * 1024 * 1024
        || evidence.negative_statuses
            != (NegativeStatuses {
                missing_jwt: 401,
                wrong_resource: 403,
                wrong_method: 405,
            })
        || evidence.business_rows_emitted != 0
        || evidence.source_mutations != 0
        || evidence.command_dispatches != 0
    {
        return Err(AcceptanceError::InvalidTransportEvidence);
    }
    Ok(())
}

fn validate_recovery(recovery: &Recovery) -> Result<(), AcceptanceError> {
    if !recovery.n17a_game_day_reused
        || !recovery.stateless_query_adapter
        || recovery.persistent_source_data_created
        || recovery.database_restore_required
        || recovery.paper_query_rpo_seconds != 0
        || recovery.rollback_target_seconds == 0
        || recovery.rollback_target_seconds > 300
        || !recovery.rollback_rehearsed
        || !recovery.identity_rotation_runbook_verified
    {
        return Err(AcceptanceError::InvalidRecovery);
    }
    Ok(())
}

fn validate_runtime(runtime: &RuntimeAuthority) -> Result<(), AcceptanceError> {
    if !runtime.owner_phase_approval
        || !runtime.exact_set_contract_accepted
        || !runtime.paper_private_path_qualified
        || !runtime.portal_adapter_implemented
        || runtime.signed_product_image_published
        || runtime.product_bff_enabled
        || runtime.public_stable_changed
        || runtime.sandbox_read_enabled
        || runtime.live_read_enabled
        || runtime.live_command_enabled
        || runtime.live_mutation_authorized
        || runtime.trading_system_changed
    {
        return Err(AcceptanceError::RuntimeAuthorityWidened);
    }
    Ok(())
}

fn validate_rollback(rollback: &Rollback) -> Result<(), AcceptanceError> {
    let expected = [
        "DISABLE_CONTROL_API_PAPER_CURRENT_SOURCE",
        "RESTORE_SCREEN_NATIVE_ADAPTER_DARK_STATE",
        "CLOSE_MANAGER_V2_H2_SESSION",
        "VERIFY_TYPED_UNAVAILABLE_AND_ZERO_SOURCE_MUTATION",
    ];
    if rollback.scope != "PAPER_QUERY_ADAPTER_ONLY"
        || string_slice(&rollback.steps) != expected
        || rollback.automatic_retry_after_dispatch
    {
        return Err(AcceptanceError::InvalidRollback);
    }
    Ok(())
}

fn string_slice(values: &[String]) -> Vec<&str> {
    values.iter().map(String::as_str).collect()
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical() -> ExactSetAcceptance {
        serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-production-acceptance.current-paper.accepted.json"
        ))
        .expect("canonical N17B fixture")
    }

    #[test]
    fn accepts_canonical_exact_current_set() {
        assert_eq!(validate(&canonical()), Ok(()));
    }

    #[test]
    fn rejects_immutable_drift() {
        let mut candidate = canonical();
        candidate.immutable_bindings.n13b_source_map_sha256 = format!("sha256:{:064x}", 7);
        assert_eq!(validate(&candidate), Err(AcceptanceError::BindingDrift));
    }

    #[test]
    fn rejects_scope_or_interface_widening() {
        let mut candidate = canonical();
        candidate.profile.environment = "live".to_owned();
        assert_eq!(validate(&candidate), Err(AcceptanceError::InvalidIdentity));

        let mut candidate = canonical();
        candidate.delivery.push(candidate.delivery[0].clone());
        assert_eq!(validate(&candidate), Err(AcceptanceError::DeliveryWidened));
    }

    #[test]
    fn rejects_unsafe_rate_or_failed_negative_matrix() {
        let mut candidate = canonical();
        candidate
            .transport_evidence
            .portal_limit_requests_per_second = 20;
        assert_eq!(
            validate(&candidate),
            Err(AcceptanceError::InvalidTransportEvidence)
        );
        let mut candidate = canonical();
        candidate
            .transport_evidence
            .negative_statuses
            .wrong_resource = 200;
        assert_eq!(
            validate(&candidate),
            Err(AcceptanceError::InvalidTransportEvidence)
        );
    }

    #[test]
    fn rejects_product_or_live_runtime_authority() {
        let mut candidate = canonical();
        candidate.runtime_authority.product_bff_enabled = true;
        assert_eq!(
            validate(&candidate),
            Err(AcceptanceError::RuntimeAuthorityWidened)
        );
        let mut candidate = canonical();
        candidate.runtime_authority.live_mutation_authorized = true;
        assert_eq!(
            validate(&candidate),
            Err(AcceptanceError::RuntimeAuthorityWidened)
        );
    }

    #[test]
    fn rejects_retry_or_incomplete_rollback() {
        let mut candidate = canonical();
        candidate.rollback.automatic_retry_after_dispatch = true;
        assert_eq!(validate(&candidate), Err(AcceptanceError::InvalidRollback));
    }
}
