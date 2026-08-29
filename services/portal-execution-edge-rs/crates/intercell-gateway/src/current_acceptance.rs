//! N15B capability-by-capability acceptance for the current Paper Query path.

use current_source_compat::{CapabilityKind, CurrentSourceMap, FactClassification};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const CURRENT_GATEWAY_SCHEMA_VERSION: &str = "portal.execution.intercell-gateway-current.v1";
pub const CURRENT_GATEWAY_PHASE: &str = "N15B";
pub const CANONICAL_ACCEPTANCE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json"
));

const CURRENT_SOURCE_MAP_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/current-source-v1/capability-source-map.json"
));
const N14B_PROFILE_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../deploy/manifests/current-source-paper-release-profile.v1.json"
));
const MANAGER_PUBLICATION_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/manager-v2-paper-read-v1/owner-publication/manager-v2-private-paper-publication.json"
));
const MANAGER_QUALIFICATION_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/manager-v2-paper-read-v1/owner-runtime-overlay/qualification-result.json"
));
const D3_REPORT_BYTES: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../../upgrade/backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md"
));

const ACCEPTED_CAPABILITIES: [&str; 3] = [
    "deployments.positions",
    "deployments.execution-quality",
    "sessions.current",
];
const ACCEPTED_SOURCES: [&str; 4] = [
    "manager.deployments",
    "manager.performance",
    "manager.positions",
    "manager.sessions",
];
const ACCEPTED_ROUTES: [&str; 2] = [
    "GET /internal/v1/current-source/screens/PAPER_TRADING_SCREEN",
    "GET /internal/v1/current-source/screens/PAPER_TRADING_SCREEN/sources/{source_id}/relations/{relation}",
];

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentGatewayProfile {
    pub environment: String,
    pub manager_profile_id: String,
    pub audience: String,
    pub screen_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ImmutableBindings {
    pub n13b_current_source_map_sha256: String,
    pub n14b_release_profile_sha256: String,
    pub manager_publication_sha256: String,
    pub manager_qualification_sha256: String,
    pub d3_transport_report_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CapabilityInventory {
    pub total: usize,
    pub connected: usize,
    pub derived: usize,
    pub supported_not_activated: usize,
    pub absent: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "interface")]
pub enum CurrentInterface {
    #[serde(rename = "QUERY")]
    Query {
        state: String,
        version: String,
        method: String,
        identity: String,
        source_authority: String,
    },
    #[serde(rename = "COMMAND")]
    Command {
        state: String,
        identity: String,
        reason: String,
    },
    #[serde(rename = "EVENT")]
    Event {
        state: String,
        snapshot_delta_label: String,
        enabled: bool,
        reason: String,
    },
    #[serde(rename = "ARTIFACT")]
    Artifact {
        state: String,
        enabled: bool,
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct QueryBoundary {
    pub capability_ids: Vec<String>,
    pub source_binding_ids: Vec<String>,
    pub edge_routes: Vec<String>,
    pub delegated_resource: String,
    pub delegated_scope: String,
    pub jwt_maximum_ttl_seconds: u64,
    pub maximum_page_rows: u64,
    pub maximum_source_response_bytes: u64,
    pub maximum_bff_response_bytes: u64,
    pub retry_after_dispatch: u8,
    pub redirects_allowed: bool,
    pub raw_browser_token_forwarding: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
// These booleans mirror independently attested controls in the signed evidence fixture.
#[allow(clippy::struct_excessive_bools)]
pub struct CurrentEvidence {
    pub http2: bool,
    pub tls13_mtls: bool,
    pub jwt_negative_matrix: bool,
    pub d3_latency_ceiling_ms: u64,
    pub d3_observed_max_ms: String,
    pub manager_p95_ms: String,
    pub manager_observed_max_ms: String,
    pub manager_maximum_observed_bytes: u64,
    pub partition_loss_recovery: bool,
    pub cursor_profile_isolation: bool,
    pub schema_drift_rejected: bool,
    pub rollback_reapply: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
// Independent runtime authorities must remain individually visible and fail closed.
#[allow(clippy::struct_excessive_bools)]
pub struct RuntimeAuthority {
    pub private_query_contract_accepted: bool,
    pub n15b_candidate_deployed: bool,
    pub product_bff_enabled: bool,
    pub registry_promoted: bool,
    pub sse_enabled: bool,
    pub command_enabled: bool,
    pub trading_system_changed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RollbackPolicy {
    pub scope: String,
    pub steps: Vec<String>,
    pub database_restore_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CurrentGatewayAcceptance {
    pub schema_version: String,
    pub phase: String,
    pub profile: CurrentGatewayProfile,
    pub immutable_bindings: ImmutableBindings,
    pub capability_inventory: CapabilityInventory,
    pub interfaces: Vec<CurrentInterface>,
    pub query_boundary: QueryBoundary,
    pub evidence: CurrentEvidence,
    pub runtime_authority: RuntimeAuthority,
    pub rollback: RollbackPolicy,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueryPermit<'a> {
    pub screen_id: &'a str,
    pub delegated_resource: &'a str,
    pub capability_ids: &'a [String],
    pub source_binding_ids: &'a [String],
}

impl CurrentGatewayAcceptance {
    /// Parses and validates the repository-pinned N15B acceptance contract.
    ///
    /// # Errors
    /// Returns [`CurrentAcceptanceError`] on any scope, digest, evidence or
    /// authority drift.
    pub fn canonical() -> Result<Self, CurrentAcceptanceError> {
        let acceptance: Self = serde_json::from_str(CANONICAL_ACCEPTANCE_JSON)
            .map_err(|_| CurrentAcceptanceError::InvalidJson)?;
        acceptance.validate()?;
        Ok(acceptance)
    }

    /// Validates the exact Paper Query slice without creating transport.
    ///
    /// # Errors
    /// Rejects any contract/evidence mismatch or interface/runtime widening.
    pub fn validate(&self) -> Result<(), CurrentAcceptanceError> {
        if self.schema_version != CURRENT_GATEWAY_SCHEMA_VERSION
            || self.phase != CURRENT_GATEWAY_PHASE
        {
            return Err(CurrentAcceptanceError::InvalidIdentity);
        }
        self.validate_bindings()?;
        let source_map = CurrentSourceMap::canonical()
            .map_err(|_| CurrentAcceptanceError::CurrentSourceDrift)?;
        self.validate_profile_and_inventory(&source_map)?;
        self.validate_interfaces()?;
        self.validate_query_boundary(&source_map)?;
        self.validate_evidence()?;
        self.validate_runtime_authority()?;
        self.validate_rollback()?;
        Ok(())
    }

    /// Authorizes only the exact N14B Paper screen at the Query contract layer.
    /// Product runtime activation remains a separate gate.
    ///
    /// # Errors
    /// Rejects cross-profile or non-accepted screen access before a source call.
    pub fn authorize_query(
        &self,
        environment: &str,
        manager_profile_id: &str,
        screen_id: &str,
    ) -> Result<QueryPermit<'_>, CurrentAcceptanceError> {
        if environment != self.profile.environment
            || manager_profile_id != self.profile.manager_profile_id
            || screen_id != self.profile.screen_id
        {
            return Err(CurrentAcceptanceError::QueryScopeNotAccepted);
        }
        Ok(QueryPermit {
            screen_id: &self.profile.screen_id,
            delegated_resource: &self.query_boundary.delegated_resource,
            capability_ids: &self.query_boundary.capability_ids,
            source_binding_ids: &self.query_boundary.source_binding_ids,
        })
    }

    fn validate_bindings(&self) -> Result<(), CurrentAcceptanceError> {
        let expected = [
            (
                &self.immutable_bindings.n13b_current_source_map_sha256,
                CURRENT_SOURCE_MAP_BYTES,
            ),
            (
                &self.immutable_bindings.n14b_release_profile_sha256,
                N14B_PROFILE_BYTES,
            ),
            (
                &self.immutable_bindings.manager_publication_sha256,
                MANAGER_PUBLICATION_BYTES,
            ),
            (
                &self.immutable_bindings.manager_qualification_sha256,
                MANAGER_QUALIFICATION_BYTES,
            ),
            (
                &self.immutable_bindings.d3_transport_report_sha256,
                D3_REPORT_BYTES,
            ),
        ];
        if expected
            .iter()
            .any(|(actual, bytes)| actual.as_str() != sha256(bytes))
        {
            return Err(CurrentAcceptanceError::ImmutableBindingDrift);
        }
        Ok(())
    }

    fn validate_profile_and_inventory(
        &self,
        source_map: &CurrentSourceMap,
    ) -> Result<(), CurrentAcceptanceError> {
        let release: Value = serde_json::from_slice(N14B_PROFILE_BYTES)
            .map_err(|_| CurrentAcceptanceError::ReleaseProfileDrift)?;
        if self.profile.environment != "paper"
            || self.profile.manager_profile_id != "PAPER_BINANCE_USDM"
            || self.profile.audience != "portal-execution-edge-paper"
            || self.profile.screen_id != "PAPER_TRADING_SCREEN"
            || release["profile"] != "PAPER"
            || release["environment"] != self.profile.environment
            || release["manager_profile_id"] != self.profile.manager_profile_id
            || release["delegation_audience"] != self.profile.audience
            || release["screen_ids"] != serde_json::json!([self.profile.screen_id])
        {
            return Err(CurrentAcceptanceError::ReleaseProfileDrift);
        }
        let (mut connected, mut derived, mut supported_not_activated, mut absent) = (0, 0, 0, 0);
        for capability in &source_map.capabilities {
            match capability.classification {
                FactClassification::Connected => connected += 1,
                FactClassification::DerivedFromExistingSource => derived += 1,
                FactClassification::SupportedButNotActivated => supported_not_activated += 1,
                FactClassification::SourceDoesNotCurrentlyExist => absent += 1,
            }
        }
        if self.capability_inventory.total != source_map.capabilities.len()
            || self.capability_inventory.connected != connected
            || self.capability_inventory.derived != derived
            || self.capability_inventory.supported_not_activated != supported_not_activated
            || self.capability_inventory.absent != absent
        {
            return Err(CurrentAcceptanceError::CapabilityInventoryDrift);
        }
        Ok(())
    }

    fn validate_interfaces(&self) -> Result<(), CurrentAcceptanceError> {
        let expected = ["QUERY", "COMMAND", "EVENT", "ARTIFACT"];
        let actual = self
            .interfaces
            .iter()
            .map(|interface| match interface {
                CurrentInterface::Query { .. } => "QUERY",
                CurrentInterface::Command { .. } => "COMMAND",
                CurrentInterface::Event { .. } => "EVENT",
                CurrentInterface::Artifact { .. } => "ARTIFACT",
            })
            .collect::<Vec<_>>();
        if actual != expected {
            return Err(CurrentAcceptanceError::InterfaceClassificationDrift);
        }
        match &self.interfaces[0] {
            CurrentInterface::Query {
                state,
                version,
                method,
                identity,
                source_authority,
            } if state == "ACCEPTED_CURRENT_SOURCE"
                && version == manager_v2_contract::RUNTIME_CONTRACT_REVISION
                && method == "GET"
                && identity == "portal-execution-read"
                && source_authority == "EXECUTION_CELL" => {}
            _ => return Err(CurrentAcceptanceError::InterfaceClassificationDrift),
        }
        match &self.interfaces[1] {
            CurrentInterface::Command {
                state,
                identity,
                reason,
            } if state == "DEFERRED_N16B"
                && identity == "portal-execution-command"
                && reason == "COMMAND_REQUIRES_SEPARATE_IDENTITY_AND_N16B_ACCEPTANCE" => {}
            _ => return Err(CurrentAcceptanceError::InterfaceClassificationDrift),
        }
        match &self.interfaces[2] {
            CurrentInterface::Event {
                state,
                snapshot_delta_label,
                enabled,
                reason,
            } if state == "SOURCE_DOES_NOT_CURRENTLY_EXIST"
                && snapshot_delta_label == "PORTAL_PROJECTION_DELTA"
                && !enabled
                && reason == "NO_AUTHORITATIVE_INCREMENTAL_EVENT_SOURCE_PUBLISHED" => {}
            _ => return Err(CurrentAcceptanceError::InterfaceClassificationDrift),
        }
        match &self.interfaces[3] {
            CurrentInterface::Artifact {
                state,
                enabled,
                reason,
            } if state == "SOURCE_DOES_NOT_CURRENTLY_EXIST"
                && !enabled
                && reason == "NO_CURRENT_OWNER_ARTIFACT_REFERENCE_SOURCE" => {}
            _ => return Err(CurrentAcceptanceError::InterfaceClassificationDrift),
        }
        Ok(())
    }

    fn validate_query_boundary(
        &self,
        source_map: &CurrentSourceMap,
    ) -> Result<(), CurrentAcceptanceError> {
        if self.query_boundary.capability_ids != ACCEPTED_CAPABILITIES
            || self.query_boundary.source_binding_ids != ACCEPTED_SOURCES
            || self.query_boundary.edge_routes != ACCEPTED_ROUTES
            || self.query_boundary.delegated_resource
                != "execution:current-source:PAPER_TRADING_SCREEN:read"
            || self.query_boundary.delegated_scope != "execution.read"
            || self.query_boundary.jwt_maximum_ttl_seconds != 60
            || self.query_boundary.maximum_page_rows != 200
            || self.query_boundary.maximum_source_response_bytes != 1_048_576
            || self.query_boundary.maximum_bff_response_bytes != 2_097_152
            || self.query_boundary.retry_after_dispatch != 0
            || self.query_boundary.redirects_allowed
            || self.query_boundary.raw_browser_token_forwarding
        {
            return Err(CurrentAcceptanceError::QueryBoundaryWidened);
        }
        let screen = source_map
            .screen(&self.profile.screen_id)
            .map_err(|_| CurrentAcceptanceError::CurrentSourceDrift)?;
        if screen.read_capabilities != self.query_boundary.capability_ids
            || !screen.action_capabilities.is_empty()
        {
            return Err(CurrentAcceptanceError::QueryBoundaryWidened);
        }
        for capability_id in &self.query_boundary.capability_ids {
            let capability = source_map
                .capabilities
                .iter()
                .find(|candidate| candidate.id == *capability_id)
                .ok_or(CurrentAcceptanceError::CurrentSourceDrift)?;
            if capability.kind != CapabilityKind::Read
                || matches!(
                    capability.classification,
                    FactClassification::SupportedButNotActivated
                        | FactClassification::SourceDoesNotCurrentlyExist
                )
            {
                return Err(CurrentAcceptanceError::QueryBoundaryWidened);
            }
        }
        let sources = screen
            .read_capabilities
            .iter()
            .filter_map(|capability_id| {
                source_map
                    .capabilities
                    .iter()
                    .find(|candidate| candidate.id == *capability_id)
            })
            .flat_map(|capability| capability.source_bindings.iter())
            .cloned()
            .collect::<std::collections::BTreeSet<_>>();
        let expected = self
            .query_boundary
            .source_binding_ids
            .iter()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>();
        if sources != expected {
            return Err(CurrentAcceptanceError::QueryBoundaryWidened);
        }
        Ok(())
    }

    fn validate_evidence(&self) -> Result<(), CurrentAcceptanceError> {
        let publication: Value = serde_json::from_slice(MANAGER_PUBLICATION_BYTES)
            .map_err(|_| CurrentAcceptanceError::EvidenceDrift)?;
        let qualification: Value = serde_json::from_slice(MANAGER_QUALIFICATION_BYTES)
            .map_err(|_| CurrentAcceptanceError::EvidenceDrift)?;
        let d3 = std::str::from_utf8(D3_REPORT_BYTES)
            .map_err(|_| CurrentAcceptanceError::EvidenceDrift)?;
        if !self.evidence.http2
            || !self.evidence.tls13_mtls
            || !self.evidence.jwt_negative_matrix
            || self.evidence.d3_latency_ceiling_ms != 2_000
            || self.evidence.d3_observed_max_ms != "162.587"
            || self.evidence.manager_p95_ms != "12.122"
            || self.evidence.manager_observed_max_ms != "47.075"
            || self.evidence.manager_maximum_observed_bytes != 130_547
            || !self.evidence.partition_loss_recovery
            || !self.evidence.cursor_profile_isolation
            || !self.evidence.schema_drift_rejected
            || !self.evidence.rollback_reapply
            || publication["status"] != "PRIVATE_PAPER_ROUTE_QUALIFIED"
            || publication["scope"]["profile_id"] != self.profile.manager_profile_id
            || publication["scope"]["command"] != false
            || qualification["transport_and_identity"]["tls_1_3_mtls_success"] != true
            || qualification["transport_and_identity"]["invalid_jwt_denied"] != true
            || qualification["bounds"]["duration_ms_p95"] != 12.122
            || qualification["bounds"]["duration_ms_max"] != 47.075
            || qualification["bounds"]["maximum_response_bytes_observed"] != 130_547
            || !d3.contains("D3_TRANSPORT_ACCEPTED")
            || !d3.contains("HTTP/2 + TLS 1.3 + mTLS")
            || !d3.contains("162.587 ms")
        {
            return Err(CurrentAcceptanceError::EvidenceDrift);
        }
        Ok(())
    }

    fn validate_runtime_authority(&self) -> Result<(), CurrentAcceptanceError> {
        if !self.runtime_authority.private_query_contract_accepted
            || self.runtime_authority.n15b_candidate_deployed
            || self.runtime_authority.product_bff_enabled
            || self.runtime_authority.registry_promoted
            || self.runtime_authority.sse_enabled
            || self.runtime_authority.command_enabled
            || self.runtime_authority.trading_system_changed
        {
            return Err(CurrentAcceptanceError::RuntimeAuthorityWidened);
        }
        Ok(())
    }

    fn validate_rollback(&self) -> Result<(), CurrentAcceptanceError> {
        if self.rollback.scope != "PAPER_QUERY_ONLY"
            || self.rollback.steps
                != [
                    "DISABLE_CONTROL_API_PAPER_CURRENT_SOURCE",
                    "DISABLE_EDGE_MANAGER_V2_READ",
                    "RESTORE_PREVIOUS_N14B_DIGESTS",
                    "VERIFY_TYPED_UNAVAILABLE_AND_NO_SOURCE_CALL",
                ]
            || self.rollback.database_restore_required
        {
            return Err(CurrentAcceptanceError::RollbackDrift);
        }
        Ok(())
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(bytes)))
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum CurrentAcceptanceError {
    #[error("N15B acceptance is not valid JSON")]
    InvalidJson,
    #[error("N15B acceptance identity drifted")]
    InvalidIdentity,
    #[error("N15B immutable evidence binding drifted")]
    ImmutableBindingDrift,
    #[error("N13B current-source map drifted")]
    CurrentSourceDrift,
    #[error("N14B release profile drifted")]
    ReleaseProfileDrift,
    #[error("N15B capability inventory drifted")]
    CapabilityInventoryDrift,
    #[error("N15B interface classification drifted")]
    InterfaceClassificationDrift,
    #[error("N15B Query boundary widened")]
    QueryBoundaryWidened,
    #[error("N15B evidence no longer proves the accepted Query boundary")]
    EvidenceDrift,
    #[error("N15B runtime authority widened")]
    RuntimeAuthorityWidened,
    #[error("N15B rollback contract drifted")]
    RollbackDrift,
    #[error("requested Query scope is outside the accepted N15B target")]
    QueryScopeNotAccepted,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical_acceptance() -> CurrentGatewayAcceptance {
        CurrentGatewayAcceptance::canonical().unwrap()
    }

    #[test]
    fn canonical_current_query_is_accepted_without_product_activation() {
        let acceptance = canonical_acceptance();
        let permit = acceptance
            .authorize_query("paper", "PAPER_BINANCE_USDM", "PAPER_TRADING_SCREEN")
            .unwrap();
        assert_eq!(permit.capability_ids, ACCEPTED_CAPABILITIES);
        assert_eq!(permit.source_binding_ids, ACCEPTED_SOURCES);
        assert!(acceptance.runtime_authority.private_query_contract_accepted);
        assert!(!acceptance.runtime_authority.product_bff_enabled);
        assert!(!acceptance.runtime_authority.command_enabled);
    }

    #[test]
    fn every_other_interface_is_independently_fail_closed() {
        let acceptance = canonical_acceptance();
        assert!(matches!(
            &acceptance.interfaces[1],
            CurrentInterface::Command { state, .. } if state == "DEFERRED_N16B"
        ));
        assert!(matches!(
            &acceptance.interfaces[2],
            CurrentInterface::Event { enabled: false, .. }
        ));
        assert!(matches!(
            &acceptance.interfaces[3],
            CurrentInterface::Artifact { enabled: false, .. }
        ));
    }

    #[test]
    fn cross_profile_and_unreleased_screen_queries_are_denied() {
        let acceptance = canonical_acceptance();
        for (environment, profile, screen) in [
            ("sandbox", "SANDBOX_BINANCE_USDM", "SANDBOX_TRADING_SCREEN"),
            ("live", "LIVE_BINANCE_USDM", "LIVE_OPERATIONS_SCREEN"),
            (
                "paper",
                "PAPER_BINANCE_USDM",
                "EXECUTION_FULL_BLOTTER_SCREEN",
            ),
        ] {
            assert_eq!(
                acceptance.authorize_query(environment, profile, screen),
                Err(CurrentAcceptanceError::QueryScopeNotAccepted)
            );
        }
    }

    #[test]
    fn scope_evidence_and_runtime_widening_fail_closed() {
        let mut acceptance = canonical_acceptance();
        acceptance.profile.screen_id = "EXECUTION_FULL_BLOTTER_SCREEN".to_owned();
        assert_eq!(
            acceptance.validate(),
            Err(CurrentAcceptanceError::ReleaseProfileDrift)
        );

        let mut acceptance = canonical_acceptance();
        acceptance.immutable_bindings.d3_transport_report_sha256 =
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_owned();
        assert_eq!(
            acceptance.validate(),
            Err(CurrentAcceptanceError::ImmutableBindingDrift)
        );

        let mut acceptance = canonical_acceptance();
        acceptance.runtime_authority.command_enabled = true;
        assert_eq!(
            acceptance.validate(),
            Err(CurrentAcceptanceError::RuntimeAuthorityWidened)
        );
    }

    #[test]
    fn snapshot_delta_cannot_be_relabelled_as_owner_event() {
        let mut acceptance = canonical_acceptance();
        let CurrentInterface::Event {
            snapshot_delta_label,
            enabled,
            ..
        } = &mut acceptance.interfaces[2]
        else {
            panic!("expected event classification");
        };
        *snapshot_delta_label = "TRADING_SYSTEM_EVENT".to_owned();
        *enabled = true;
        assert_eq!(
            acceptance.validate(),
            Err(CurrentAcceptanceError::InterfaceClassificationDrift)
        );
    }
}
