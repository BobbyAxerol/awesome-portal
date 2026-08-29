use chrono::{DateTime, Utc};
use projection_core::{canonical_digest, ProjectionScope};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::real_source::{RealSourceDecision, RealSourceQualificationReport};

pub const SHADOW_ACTIVATION_SCHEMA_VERSION: &str = "execution.shadow-screen-activation.v1";
pub const PAPER_WORKBENCH_SCREEN_ID: &str = "EXECUTION_PAPER_WORKBENCH_SCREEN";
pub const PAPER_WORKBENCH_PUBLIC_ROUTE: &str =
    "/api/v1/execution/deployments/paper/:deploymentId/projection/:panel";
pub const PAPER_WORKBENCH_PRIVATE_ROUTE: &str =
    "/internal/v1/screens/paper-workbench/:deploymentId/:panel/query";
const MAX_IDENTIFIER_BYTES: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShadowCompatibilityManifest {
    pub source_contract_revision: String,
    pub adapter_version: String,
    pub source_gateway_digest: String,
    pub capability_snapshot_id: String,
    pub projection_schema_digest: String,
    pub query_contract_digest: String,
    pub edge_image_digest: String,
    pub control_api_image_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// These booleans intentionally mirror five independently deployed feature
// gates. Collapsing them into one mode would make authority widening harder to
// detect in signed evidence.
#[allow(clippy::struct_excessive_bools)]
pub struct ShadowRuntimeIntent {
    pub projection_enabled: bool,
    pub query_enabled: bool,
    pub screen_enabled: bool,
    pub realtime_enabled: bool,
    pub command_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShadowGateEvidence {
    pub fixture_parity_sha256: String,
    pub source_loss_sha256: String,
    pub auth_matrix_sha256: String,
    pub load_test_sha256: String,
    pub rollback_sha256: String,
    pub visual_honest_state_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShadowOwnerApproval {
    pub owner_id: String,
    pub approved: bool,
    pub approved_at: Option<DateTime<Utc>>,
    pub evidence_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ShadowActivationEvidence {
    pub schema_version: String,
    pub screen_id: String,
    pub public_route: String,
    pub private_route: String,
    pub delivery_profile: String,
    pub scope: ProjectionScope,
    pub candidate_epoch_id: Uuid,
    pub expected_state_digest: String,
    pub projected_state_digest: String,
    pub replay_state_digest: String,
    pub compatibility: ShadowCompatibilityManifest,
    pub runtime_intent: ShadowRuntimeIntent,
    pub gate_evidence: ShadowGateEvidence,
    pub n06_report: RealSourceQualificationReport,
    pub owner_approval: ShadowOwnerApproval,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShadowActivationMode {
    Candidate,
    Acceptance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ShadowActivationDecision {
    ReadyForOwnerReview,
    Accepted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShadowActivationReport {
    pub schema_version: String,
    pub screen_id: String,
    pub candidate_epoch_id: Uuid,
    pub manifest_digest: String,
    pub decision: ShadowActivationDecision,
    pub epoch_activation_authorized: bool,
    pub registry_profile_changed: bool,
    pub runtime_flags_changed: bool,
}

/// Capability object required by the `PostgreSQL` cutover transaction. Its
/// fields are private so unvalidated JSON cannot be used as activation authority.
#[derive(Debug, Clone)]
pub struct AcceptedShadowActivation {
    evidence: ShadowActivationEvidence,
    manifest_digest: String,
}

impl AcceptedShadowActivation {
    #[must_use]
    pub const fn evidence(&self) -> &ShadowActivationEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn manifest_digest(&self) -> &str {
        &self.manifest_digest
    }
}

/// Evaluates the owner-review candidate without granting database cutover
/// authority. This is safe for CI and sanitized handoff generation.
///
/// # Errors
///
/// Rejects scope, compatibility, N06, parity, evidence, flag or approval drift.
pub fn evaluate_shadow_activation(
    evidence: &ShadowActivationEvidence,
    mode: ShadowActivationMode,
) -> Result<ShadowActivationReport, ShadowActivationError> {
    validate(evidence, mode)?;
    let accepted = mode == ShadowActivationMode::Acceptance;
    Ok(ShadowActivationReport {
        schema_version: SHADOW_ACTIVATION_SCHEMA_VERSION.to_owned(),
        screen_id: evidence.screen_id.clone(),
        candidate_epoch_id: evidence.candidate_epoch_id,
        manifest_digest: canonical_digest(evidence)?,
        decision: if accepted {
            ShadowActivationDecision::Accepted
        } else {
            ShadowActivationDecision::ReadyForOwnerReview
        },
        epoch_activation_authorized: accepted,
        registry_profile_changed: false,
        runtime_flags_changed: false,
    })
}

/// Converts fully accepted evidence into the only capability accepted by the
/// `PostgreSQL` shadow cutover transaction. It still cannot change registry or
/// deployment flags.
///
/// # Errors
///
/// Rejects every candidate that is not an exact owner-approved acceptance.
pub fn accept_shadow_activation(
    evidence: ShadowActivationEvidence,
) -> Result<AcceptedShadowActivation, ShadowActivationError> {
    let report = evaluate_shadow_activation(&evidence, ShadowActivationMode::Acceptance)?;
    Ok(AcceptedShadowActivation {
        evidence,
        manifest_digest: report.manifest_digest,
    })
}

fn validate(
    evidence: &ShadowActivationEvidence,
    mode: ShadowActivationMode,
) -> Result<(), ShadowActivationError> {
    if evidence.schema_version != SHADOW_ACTIVATION_SCHEMA_VERSION
        || evidence.screen_id != PAPER_WORKBENCH_SCREEN_ID
        || evidence.public_route != PAPER_WORKBENCH_PUBLIC_ROUTE
        || evidence.private_route != PAPER_WORKBENCH_PRIVATE_ROUTE
        || evidence.delivery_profile != "shadow"
        || evidence.scope.environment != "paper"
        || evidence.scope.workspace_id.as_str() != "workspace_paper_binance_usdm"
        || evidence.candidate_epoch_id.is_nil()
    {
        return Err(ShadowActivationError::IdentityMismatch);
    }
    ProjectionScope::new(
        evidence.scope.workspace_id.clone(),
        evidence.scope.environment.clone(),
    )?;
    if !is_safe_identifier(&evidence.compatibility.adapter_version)
        || !is_safe_identifier(&evidence.compatibility.capability_snapshot_id)
        || evidence.compatibility.source_contract_revision != "d4.paper-read.v2"
    {
        return Err(ShadowActivationError::CompatibilityMismatch);
    }
    for digest in [
        &evidence.expected_state_digest,
        &evidence.projected_state_digest,
        &evidence.replay_state_digest,
        &evidence.compatibility.source_gateway_digest,
        &evidence.compatibility.projection_schema_digest,
        &evidence.compatibility.query_contract_digest,
        &evidence.compatibility.edge_image_digest,
        &evidence.compatibility.control_api_image_digest,
        &evidence.gate_evidence.fixture_parity_sha256,
        &evidence.gate_evidence.source_loss_sha256,
        &evidence.gate_evidence.auth_matrix_sha256,
        &evidence.gate_evidence.load_test_sha256,
        &evidence.gate_evidence.rollback_sha256,
        &evidence.gate_evidence.visual_honest_state_sha256,
        &evidence.owner_approval.evidence_sha256,
        &evidence.n06_report.evidence_digest,
    ] {
        if !is_nonzero_sha256(digest) {
            return Err(ShadowActivationError::InvalidDigest);
        }
    }
    if evidence.expected_state_digest != evidence.projected_state_digest
        || evidence.expected_state_digest != evidence.replay_state_digest
    {
        return Err(ShadowActivationError::ParityMismatch);
    }
    if evidence.n06_report.decision != RealSourceDecision::EvidenceAccepted
        || evidence.n06_report.building_epoch_id != evidence.candidate_epoch_id
        || evidence.n06_report.contract_revision != evidence.compatibility.source_contract_revision
        || evidence.n06_report.source_scope_id != "PAPER_BINANCE_USDM"
        || evidence.n06_report.source_mutations != 0
        || evidence.n06_report.divergence_count != 0
        || evidence.n06_report.activation_authorized
        || evidence.n06_report.registry_profile_changed
    {
        return Err(ShadowActivationError::N06AcceptanceRequired);
    }
    let intent = &evidence.runtime_intent;
    if !intent.projection_enabled
        || !intent.query_enabled
        || !intent.screen_enabled
        || intent.realtime_enabled
        || intent.command_enabled
    {
        return Err(ShadowActivationError::UnsafeRuntimeIntent);
    }
    if !is_safe_identifier(&evidence.owner_approval.owner_id) {
        return Err(ShadowActivationError::OwnerApprovalInvalid);
    }
    match mode {
        ShadowActivationMode::Candidate => {
            if evidence.owner_approval.approved || evidence.owner_approval.approved_at.is_some() {
                return Err(ShadowActivationError::OwnerApprovalInvalid);
            }
        }
        ShadowActivationMode::Acceptance => {
            if !evidence.owner_approval.approved || evidence.owner_approval.approved_at.is_none() {
                return Err(ShadowActivationError::OwnerApprovalRequired);
            }
        }
    }
    Ok(())
}

fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn is_nonzero_sha256(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|digest| {
        digest.len() == 64
            && digest
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            && digest.bytes().any(|byte| byte != b'0')
    })
}

#[derive(Debug, Error)]
pub enum ShadowActivationError {
    #[error("shadow activation identity, route or scope mismatched")]
    IdentityMismatch,
    #[error("shadow activation compatibility identity mismatched")]
    CompatibilityMismatch,
    #[error("shadow activation digest is malformed or a placeholder")]
    InvalidDigest,
    #[error("shadow activation semantic parity mismatched")]
    ParityMismatch,
    #[error("accepted N06 real-source evidence is required")]
    N06AcceptanceRequired,
    #[error("shadow activation runtime intent widens authority")]
    UnsafeRuntimeIntent,
    #[error("shadow activation owner approval is invalid")]
    OwnerApprovalInvalid,
    #[error("shadow activation owner approval is required")]
    OwnerApprovalRequired,
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
}

impl ShadowActivationError {
    #[must_use]
    pub const fn reason_code(&self) -> &'static str {
        match self {
            Self::IdentityMismatch => "N07_IDENTITY_MISMATCH",
            Self::CompatibilityMismatch => "N07_COMPATIBILITY_MISMATCH",
            Self::InvalidDigest => "N07_DIGEST_INVALID",
            Self::ParityMismatch => "N07_PARITY_MISMATCH",
            Self::N06AcceptanceRequired => "N07_N06_ACCEPTANCE_REQUIRED",
            Self::UnsafeRuntimeIntent => "N07_RUNTIME_INTENT_UNSAFE",
            Self::OwnerApprovalInvalid => "N07_OWNER_APPROVAL_INVALID",
            Self::OwnerApprovalRequired => "N07_OWNER_APPROVAL_REQUIRED",
            Self::Projection(_) => "N07_SERIALIZATION_FAILED",
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeDelta, Utc};
    use execution_contracts::CanonicalId;

    use super::*;
    use crate::real_source::{
        QualificationProfile, RealSourceDecision, REAL_SOURCE_EVIDENCE_SCHEMA_VERSION,
    };

    fn digest(value: char) -> String {
        format!("sha256:{}", value.to_string().repeat(64))
    }

    fn candidate() -> ShadowActivationEvidence {
        let epoch = Uuid::now_v7();
        ShadowActivationEvidence {
            schema_version: SHADOW_ACTIVATION_SCHEMA_VERSION.to_owned(),
            screen_id: PAPER_WORKBENCH_SCREEN_ID.to_owned(),
            public_route: PAPER_WORKBENCH_PUBLIC_ROUTE.to_owned(),
            private_route: PAPER_WORKBENCH_PRIVATE_ROUTE.to_owned(),
            delivery_profile: "shadow".to_owned(),
            scope: ProjectionScope::new(
                CanonicalId::parse("workspace_paper_binance_usdm").unwrap(),
                "paper",
            )
            .unwrap(),
            candidate_epoch_id: epoch,
            expected_state_digest: digest('a'),
            projected_state_digest: digest('a'),
            replay_state_digest: digest('a'),
            compatibility: ShadowCompatibilityManifest {
                source_contract_revision: "d4.paper-read.v2".to_owned(),
                adapter_version: "ts-adapter-v1".to_owned(),
                source_gateway_digest: digest('b'),
                capability_snapshot_id: "cap-n07".to_owned(),
                projection_schema_digest: digest('c'),
                query_contract_digest: digest('d'),
                edge_image_digest: digest('e'),
                control_api_image_digest: digest('f'),
            },
            runtime_intent: ShadowRuntimeIntent {
                projection_enabled: true,
                query_enabled: true,
                screen_enabled: true,
                realtime_enabled: false,
                command_enabled: false,
            },
            gate_evidence: ShadowGateEvidence {
                fixture_parity_sha256: digest('1'),
                source_loss_sha256: digest('2'),
                auth_matrix_sha256: digest('3'),
                load_test_sha256: digest('4'),
                rollback_sha256: digest('5'),
                visual_honest_state_sha256: digest('6'),
            },
            n06_report: RealSourceQualificationReport {
                schema_version: REAL_SOURCE_EVIDENCE_SCHEMA_VERSION.to_owned(),
                run_id: Uuid::now_v7(),
                owner_window_id: "window-n06".to_owned(),
                contract_revision: "d4.paper-read.v2".to_owned(),
                source_scope_id: "PAPER_BINANCE_USDM".to_owned(),
                building_epoch_id: epoch,
                evidence_digest: digest('7'),
                qualification_profile: QualificationProfile::PaperFastAcceptance,
                decision: RealSourceDecision::EvidenceAccepted,
                soak_seconds: 86_400,
                source_mutations: 0,
                divergence_count: 0,
                activation_authorized: false,
                registry_profile_changed: false,
            },
            owner_approval: ShadowOwnerApproval {
                owner_id: "bobby".to_owned(),
                approved: false,
                approved_at: None,
                evidence_sha256: digest('8'),
            },
        }
    }

    #[test]
    fn candidate_is_deterministic_and_cannot_activate() {
        let evidence = candidate();
        let first = evaluate_shadow_activation(&evidence, ShadowActivationMode::Candidate).unwrap();
        let second =
            evaluate_shadow_activation(&evidence, ShadowActivationMode::Candidate).unwrap();
        assert_eq!(first, second);
        assert_eq!(
            first.decision,
            ShadowActivationDecision::ReadyForOwnerReview
        );
        assert!(!first.epoch_activation_authorized);
        assert!(!first.registry_profile_changed);
        assert!(!first.runtime_flags_changed);
    }

    #[test]
    fn acceptance_requires_owner_and_yields_private_capability() {
        let mut evidence = candidate();
        evidence.owner_approval.approved = true;
        evidence.owner_approval.approved_at = Some(Utc::now() + TimeDelta::seconds(1));
        let accepted = accept_shadow_activation(evidence.clone()).unwrap();
        assert_eq!(accepted.evidence(), &evidence);
        assert!(accepted.manifest_digest().starts_with("sha256:"));
    }

    #[test]
    fn synthetic_n06_widened_flags_and_parity_drift_fail_closed() {
        let mut n06 = candidate();
        n06.n06_report.decision = RealSourceDecision::TemplateValid;
        assert_eq!(
            evaluate_shadow_activation(&n06, ShadowActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N07_N06_ACCEPTANCE_REQUIRED"
        );

        let mut command = candidate();
        command.runtime_intent.command_enabled = true;
        assert_eq!(
            evaluate_shadow_activation(&command, ShadowActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N07_RUNTIME_INTENT_UNSAFE"
        );

        let mut parity = candidate();
        parity.replay_state_digest = digest('9');
        assert_eq!(
            evaluate_shadow_activation(&parity, ShadowActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N07_PARITY_MISMATCH"
        );
    }

    #[test]
    fn route_screen_scope_and_unknown_json_fields_cannot_widen() {
        let mut route = candidate();
        route.private_route = "/internal/v1/query".to_owned();
        assert_eq!(
            evaluate_shadow_activation(&route, ShadowActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N07_IDENTITY_MISMATCH"
        );

        let mut value = serde_json::to_value(candidate()).unwrap();
        value["source_api_key"] = serde_json::json!("forbidden");
        assert!(serde_json::from_value::<ShadowActivationEvidence>(value).is_err());
    }
}
