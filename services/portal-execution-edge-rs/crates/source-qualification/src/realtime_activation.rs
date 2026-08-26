use chrono::{DateTime, Utc};
use projection_core::{canonical_digest, ProjectionScope};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    real_source::{
        QualificationProfile, RealSourceDecision, RealSourceQualificationReport,
        EXTENDED_MINIMUM_SOAK_SECONDS, FAST_PAPER_MINIMUM_SOAK_SECONDS,
    },
    shadow_screen::PAPER_WORKBENCH_SCREEN_ID,
};

pub const REALTIME_ACTIVATION_SCHEMA_VERSION: &str = "execution.realtime-activation.v1";
pub const COMMAND_CENTER_SCREEN_ID: &str = "EXECUTION_COMMAND_CENTER_SCREEN";
pub const COMMAND_CENTER_PUBLIC_STREAM_ROUTE: &str = "/api/v1/execution/command-center/stream";
pub const COMMAND_CENTER_PUBLIC_SNAPSHOT_ROUTE: &str =
    "/api/v1/execution/command-center/realtime-snapshot";
pub const COMMAND_CENTER_PRIVATE_STREAM_ROUTE: &str = "/internal/v1/realtime/stream";
pub const COMMAND_CENTER_PRIVATE_SNAPSHOT_ROUTE: &str = "/internal/v1/realtime/snapshot";
const MAX_IDENTIFIER_BYTES: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealtimeCompatibilityManifest {
    pub source_contract_revision: String,
    pub realtime_contract_revision: String,
    pub capability_snapshot_id: String,
    pub edge_image_digest: String,
    pub control_api_image_digest: String,
    pub snapshot_contract_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct RealtimeRuntimeIntent {
    pub projection_enabled: bool,
    pub query_enabled: bool,
    pub screen_enabled: bool,
    pub realtime_enabled: bool,
    pub command_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealtimeGateEvidence {
    pub h2_mtls_sha256: String,
    pub auth_positive_negative_sha256: String,
    pub snapshot_resume_sha256: String,
    pub epoch_gap_cursor_sha256: String,
    pub fanout_100_sha256: String,
    pub slow_consumer_sha256: String,
    pub source_loss_recovery_sha256: String,
    pub terminal_client_sha256: String,
    pub rollback_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealtimeOwnerApproval {
    pub owner_id: String,
    pub approved: bool,
    pub approved_at: Option<DateTime<Utc>>,
    pub evidence_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealtimeActivationEvidence {
    pub schema_version: String,
    pub screen_id: String,
    pub public_stream_route: String,
    pub public_snapshot_route: String,
    pub private_stream_route: String,
    pub private_snapshot_route: String,
    pub delivery_profile: String,
    pub scope: ProjectionScope,
    pub active_epoch_id: Uuid,
    pub n07_screen_id: String,
    pub n07_activation_manifest_digest: String,
    pub compatibility: RealtimeCompatibilityManifest,
    pub runtime_intent: RealtimeRuntimeIntent,
    pub gate_evidence: RealtimeGateEvidence,
    pub n06_report: RealSourceQualificationReport,
    pub owner_approval: RealtimeOwnerApproval,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RealtimeActivationMode {
    Candidate,
    Acceptance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RealtimeActivationDecision {
    ReadyForOwnerReview,
    Accepted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealtimeActivationReport {
    pub schema_version: String,
    pub screen_id: String,
    pub active_epoch_id: Uuid,
    pub manifest_digest: String,
    pub decision: RealtimeActivationDecision,
    pub realtime_activation_authorized: bool,
    pub command_authority_changed: bool,
}

/// Private capability required by the edge at startup and again on every
/// snapshot/stream admission. Raw JSON can never act as runtime authority.
#[derive(Debug, Clone)]
pub struct AcceptedRealtimeActivation {
    evidence: RealtimeActivationEvidence,
    manifest_digest: String,
}

impl AcceptedRealtimeActivation {
    #[must_use]
    pub const fn evidence(&self) -> &RealtimeActivationEvidence {
        &self.evidence
    }

    #[must_use]
    pub fn manifest_digest(&self) -> &str {
        &self.manifest_digest
    }
}

/// Evaluates immutable N08 evidence without granting runtime authority.
///
/// # Errors
///
/// Rejects route/scope, source/N07 lineage, evidence, intent or owner drift.
pub fn evaluate_realtime_activation(
    evidence: &RealtimeActivationEvidence,
    mode: RealtimeActivationMode,
) -> Result<RealtimeActivationReport, RealtimeActivationError> {
    validate(evidence, mode)?;
    let accepted = mode == RealtimeActivationMode::Acceptance;
    Ok(RealtimeActivationReport {
        schema_version: REALTIME_ACTIVATION_SCHEMA_VERSION.to_owned(),
        screen_id: evidence.screen_id.clone(),
        active_epoch_id: evidence.active_epoch_id,
        manifest_digest: canonical_digest(evidence)?,
        decision: if accepted {
            RealtimeActivationDecision::Accepted
        } else {
            RealtimeActivationDecision::ReadyForOwnerReview
        },
        realtime_activation_authorized: accepted,
        command_authority_changed: false,
    })
}

/// Converts exact owner-approved evidence into the only runtime capability
/// accepted by the edge.
///
/// # Errors
///
/// Rejects any evidence that is not an exact acceptance.
pub fn accept_realtime_activation(
    evidence: RealtimeActivationEvidence,
) -> Result<AcceptedRealtimeActivation, RealtimeActivationError> {
    let report = evaluate_realtime_activation(&evidence, RealtimeActivationMode::Acceptance)?;
    Ok(AcceptedRealtimeActivation {
        evidence,
        manifest_digest: report.manifest_digest,
    })
}

fn validate(
    evidence: &RealtimeActivationEvidence,
    mode: RealtimeActivationMode,
) -> Result<(), RealtimeActivationError> {
    if evidence.schema_version != REALTIME_ACTIVATION_SCHEMA_VERSION
        || evidence.screen_id != COMMAND_CENTER_SCREEN_ID
        || evidence.public_stream_route != COMMAND_CENTER_PUBLIC_STREAM_ROUTE
        || evidence.public_snapshot_route != COMMAND_CENTER_PUBLIC_SNAPSHOT_ROUTE
        || evidence.private_stream_route != COMMAND_CENTER_PRIVATE_STREAM_ROUTE
        || evidence.private_snapshot_route != COMMAND_CENTER_PRIVATE_SNAPSHOT_ROUTE
        || evidence.delivery_profile != "shadow"
        || evidence.scope.environment != "paper"
        || evidence.scope.workspace_id.as_str() != "workspace_paper_binance_usdm"
        || evidence.active_epoch_id.is_nil()
        || evidence.n07_screen_id != PAPER_WORKBENCH_SCREEN_ID
    {
        return Err(RealtimeActivationError::IdentityMismatch);
    }
    ProjectionScope::new(
        evidence.scope.workspace_id.clone(),
        evidence.scope.environment.clone(),
    )?;
    if evidence.compatibility.source_contract_revision != "d4.paper-read.v2"
        || evidence.compatibility.realtime_contract_revision != "execution.realtime.v1"
        || !is_safe_identifier(&evidence.compatibility.capability_snapshot_id)
    {
        return Err(RealtimeActivationError::CompatibilityMismatch);
    }
    for digest in [
        &evidence.n07_activation_manifest_digest,
        &evidence.compatibility.edge_image_digest,
        &evidence.compatibility.control_api_image_digest,
        &evidence.compatibility.snapshot_contract_digest,
        &evidence.gate_evidence.h2_mtls_sha256,
        &evidence.gate_evidence.auth_positive_negative_sha256,
        &evidence.gate_evidence.snapshot_resume_sha256,
        &evidence.gate_evidence.epoch_gap_cursor_sha256,
        &evidence.gate_evidence.fanout_100_sha256,
        &evidence.gate_evidence.slow_consumer_sha256,
        &evidence.gate_evidence.source_loss_recovery_sha256,
        &evidence.gate_evidence.terminal_client_sha256,
        &evidence.gate_evidence.rollback_sha256,
        &evidence.n06_report.evidence_digest,
        &evidence.owner_approval.evidence_sha256,
    ] {
        if !is_nonzero_sha256(digest) {
            return Err(RealtimeActivationError::InvalidDigest);
        }
    }
    let minimum_soak = match evidence.n06_report.qualification_profile {
        QualificationProfile::PaperFastAcceptance => FAST_PAPER_MINIMUM_SOAK_SECONDS,
        QualificationProfile::Extended24h => EXTENDED_MINIMUM_SOAK_SECONDS,
    };
    if evidence.n06_report.decision != RealSourceDecision::EvidenceAccepted
        || evidence.n06_report.building_epoch_id != evidence.active_epoch_id
        || evidence.n06_report.contract_revision != evidence.compatibility.source_contract_revision
        || evidence.n06_report.source_scope_id != "PAPER_BINANCE_USDM"
        || evidence.n06_report.soak_seconds < minimum_soak
        || evidence.n06_report.source_mutations != 0
        || evidence.n06_report.divergence_count != 0
        || evidence.n06_report.activation_authorized
        || evidence.n06_report.registry_profile_changed
    {
        return Err(RealtimeActivationError::N06AcceptanceRequired);
    }
    let intent = &evidence.runtime_intent;
    if !intent.projection_enabled
        || !intent.query_enabled
        || !intent.screen_enabled
        || !intent.realtime_enabled
        || intent.command_enabled
    {
        return Err(RealtimeActivationError::UnsafeRuntimeIntent);
    }
    if !is_safe_identifier(&evidence.owner_approval.owner_id) {
        return Err(RealtimeActivationError::OwnerApprovalInvalid);
    }
    match mode {
        RealtimeActivationMode::Candidate => {
            if evidence.owner_approval.approved || evidence.owner_approval.approved_at.is_some() {
                return Err(RealtimeActivationError::OwnerApprovalInvalid);
            }
        }
        RealtimeActivationMode::Acceptance => {
            if !evidence.owner_approval.approved || evidence.owner_approval.approved_at.is_none() {
                return Err(RealtimeActivationError::OwnerApprovalRequired);
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
pub enum RealtimeActivationError {
    #[error("realtime activation identity, route or scope mismatched")]
    IdentityMismatch,
    #[error("realtime activation compatibility identity mismatched")]
    CompatibilityMismatch,
    #[error("realtime activation digest is malformed or a placeholder")]
    InvalidDigest,
    #[error("accepted N06 real-source evidence is required")]
    N06AcceptanceRequired,
    #[error("realtime activation runtime intent widens authority")]
    UnsafeRuntimeIntent,
    #[error("realtime activation owner approval is invalid")]
    OwnerApprovalInvalid,
    #[error("realtime activation owner approval is required")]
    OwnerApprovalRequired,
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
}

impl RealtimeActivationError {
    #[must_use]
    pub const fn reason_code(&self) -> &'static str {
        match self {
            Self::IdentityMismatch => "N08_IDENTITY_MISMATCH",
            Self::CompatibilityMismatch => "N08_COMPATIBILITY_MISMATCH",
            Self::InvalidDigest => "N08_DIGEST_INVALID",
            Self::N06AcceptanceRequired => "N08_N06_ACCEPTANCE_REQUIRED",
            Self::UnsafeRuntimeIntent => "N08_RUNTIME_INTENT_UNSAFE",
            Self::OwnerApprovalInvalid => "N08_OWNER_APPROVAL_INVALID",
            Self::OwnerApprovalRequired => "N08_OWNER_APPROVAL_REQUIRED",
            Self::Projection(_) => "N08_SERIALIZATION_FAILED",
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

    fn candidate() -> RealtimeActivationEvidence {
        let epoch = Uuid::now_v7();
        RealtimeActivationEvidence {
            schema_version: REALTIME_ACTIVATION_SCHEMA_VERSION.to_owned(),
            screen_id: COMMAND_CENTER_SCREEN_ID.to_owned(),
            public_stream_route: COMMAND_CENTER_PUBLIC_STREAM_ROUTE.to_owned(),
            public_snapshot_route: COMMAND_CENTER_PUBLIC_SNAPSHOT_ROUTE.to_owned(),
            private_stream_route: COMMAND_CENTER_PRIVATE_STREAM_ROUTE.to_owned(),
            private_snapshot_route: COMMAND_CENTER_PRIVATE_SNAPSHOT_ROUTE.to_owned(),
            delivery_profile: "shadow".to_owned(),
            scope: ProjectionScope::new(
                CanonicalId::parse("workspace_paper_binance_usdm").unwrap(),
                "paper",
            )
            .unwrap(),
            active_epoch_id: epoch,
            n07_screen_id: PAPER_WORKBENCH_SCREEN_ID.to_owned(),
            n07_activation_manifest_digest: digest('a'),
            compatibility: RealtimeCompatibilityManifest {
                source_contract_revision: "d4.paper-read.v2".to_owned(),
                realtime_contract_revision: "execution.realtime.v1".to_owned(),
                capability_snapshot_id: "cap-n08".to_owned(),
                edge_image_digest: digest('b'),
                control_api_image_digest: digest('c'),
                snapshot_contract_digest: digest('d'),
            },
            runtime_intent: RealtimeRuntimeIntent {
                projection_enabled: true,
                query_enabled: true,
                screen_enabled: true,
                realtime_enabled: true,
                command_enabled: false,
            },
            gate_evidence: RealtimeGateEvidence {
                h2_mtls_sha256: digest('1'),
                auth_positive_negative_sha256: digest('2'),
                snapshot_resume_sha256: digest('3'),
                epoch_gap_cursor_sha256: digest('4'),
                fanout_100_sha256: digest('5'),
                slow_consumer_sha256: digest('6'),
                source_loss_recovery_sha256: digest('7'),
                terminal_client_sha256: digest('8'),
                rollback_sha256: digest('9'),
            },
            n06_report: RealSourceQualificationReport {
                schema_version: REAL_SOURCE_EVIDENCE_SCHEMA_VERSION.to_owned(),
                run_id: Uuid::now_v7(),
                owner_window_id: "window-n06-fast".to_owned(),
                contract_revision: "d4.paper-read.v2".to_owned(),
                source_scope_id: "PAPER_BINANCE_USDM".to_owned(),
                building_epoch_id: epoch,
                evidence_digest: digest('e'),
                qualification_profile: QualificationProfile::PaperFastAcceptance,
                decision: RealSourceDecision::EvidenceAccepted,
                soak_seconds: FAST_PAPER_MINIMUM_SOAK_SECONDS,
                source_mutations: 0,
                divergence_count: 0,
                activation_authorized: false,
                registry_profile_changed: false,
            },
            owner_approval: RealtimeOwnerApproval {
                owner_id: "bobby".to_owned(),
                approved: false,
                approved_at: None,
                evidence_sha256: digest('f'),
            },
        }
    }

    #[test]
    fn candidate_is_deterministic_and_never_changes_runtime() {
        let evidence = candidate();
        let first =
            evaluate_realtime_activation(&evidence, RealtimeActivationMode::Candidate).unwrap();
        let second =
            evaluate_realtime_activation(&evidence, RealtimeActivationMode::Candidate).unwrap();
        assert_eq!(first, second);
        assert_eq!(
            first.decision,
            RealtimeActivationDecision::ReadyForOwnerReview
        );
        assert!(!first.realtime_activation_authorized);
        assert!(!first.command_authority_changed);
    }

    #[test]
    fn owner_acceptance_yields_private_runtime_capability() {
        let mut evidence = candidate();
        evidence.owner_approval.approved = true;
        evidence.owner_approval.approved_at = Some(Utc::now() + TimeDelta::seconds(1));
        let accepted = accept_realtime_activation(evidence.clone()).unwrap();
        assert_eq!(accepted.evidence(), &evidence);
        assert!(accepted.manifest_digest().starts_with("sha256:"));
    }

    #[test]
    fn n06_lineage_n07_digest_and_command_widening_fail_closed() {
        let mut synthetic = candidate();
        synthetic.n06_report.decision = RealSourceDecision::TemplateValid;
        assert_eq!(
            evaluate_realtime_activation(&synthetic, RealtimeActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N08_N06_ACCEPTANCE_REQUIRED"
        );

        let mut missing_n07 = candidate();
        missing_n07.n07_activation_manifest_digest = "sha256:".to_owned() + &"0".repeat(64);
        assert_eq!(
            evaluate_realtime_activation(&missing_n07, RealtimeActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N08_DIGEST_INVALID"
        );

        let mut command = candidate();
        command.runtime_intent.command_enabled = true;
        assert_eq!(
            evaluate_realtime_activation(&command, RealtimeActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N08_RUNTIME_INTENT_UNSAFE"
        );
    }

    #[test]
    fn routes_scope_and_unknown_fields_cannot_widen() {
        let mut route = candidate();
        route.private_stream_route = "/internal/v1/realtime".to_owned();
        assert_eq!(
            evaluate_realtime_activation(&route, RealtimeActivationMode::Candidate)
                .unwrap_err()
                .reason_code(),
            "N08_IDENTITY_MISMATCH"
        );

        let mut value = serde_json::to_value(candidate()).unwrap();
        value["api_key"] = serde_json::json!("forbidden");
        assert!(serde_json::from_value::<RealtimeActivationEvidence>(value).is_err());
    }
}
