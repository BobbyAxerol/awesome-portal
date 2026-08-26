use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use projection_core::canonical_digest;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

pub const REAL_SOURCE_EVIDENCE_SCHEMA_VERSION: &str = "execution.real-source-qualification.v1";
pub const N06_SOURCE_CONTRACT_REVISION: &str = "d4.paper-read.v2";
pub const N06_SOURCE_SCOPE_ID: &str = "PAPER_BINANCE_USDM";
pub const N06_WORKSPACE_ID: &str = "workspace_paper_binance_usdm";
pub const FAST_PAPER_MINIMUM_SOAK_SECONDS: u64 = 1_800;
pub const FAST_PAPER_MAXIMUM_SAMPLE_INTERVAL_SECONDS: u64 = 30;
pub const EXTENDED_MINIMUM_SOAK_SECONDS: u64 = 86_400;
pub const EXTENDED_MAXIMUM_SAMPLE_INTERVAL_SECONDS: u64 = 300;
const MAXIMUM_IDENTIFIER_BYTES: usize = 128;

const REQUIRED_DRILLS: &[&str] = &[
    "baseline_semantic_parity",
    "cross_cell_loss_recovery",
    "cursor_expiry_new_building_epoch",
    "delta_semantic_parity",
    "duplicate_idempotency",
    "gap_new_building_epoch",
    "lease_expiry_source_idle",
    "restart_recovery",
    "restore_recovery",
    "rollback_to_dormant",
    "source_loss_recovery",
    "tombstone_delete",
];
const REQUIRED_ROUTE_CLASSES: &[&str] = &["baseline", "delta", "lease"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QualificationMode {
    Template,
    Candidate,
    Acceptance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct QualificationPrerequisites<'a> {
    pub n02_owner_manifest_sha256: &'a str,
    pub n03_owner_manifest_sha256: &'a str,
    pub owner_window_evidence_sha256: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EvidenceOrigin {
    SyntheticTemplate,
    RealSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QualificationAuthority {
    ReadOnlyBuildingShadow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EvidenceDataClass {
    SanitizedMetadataOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum QualificationProfile {
    /// Owner-approved Paper shadow admission. It keeps the complete parity,
    /// fault, restore, load and rollback corpus, but does not make a 24-hour
    /// wall-clock delay the price of every development promotion.
    #[serde(rename = "PAPER_FAST_ACCEPTANCE")]
    PaperFastAcceptance,
    /// Long-running confidence evidence for stable/release and later
    /// risk-bearing stages. It never substitutes for the fast profile's fault
    /// drills; it extends observation coverage.
    #[serde(rename = "EXTENDED_24H")]
    Extended24h,
}

impl QualificationProfile {
    const fn coverage(self) -> (u64, u64) {
        match self {
            Self::PaperFastAcceptance => (
                FAST_PAPER_MINIMUM_SOAK_SECONDS,
                FAST_PAPER_MAXIMUM_SAMPLE_INTERVAL_SECONDS,
            ),
            Self::Extended24h => (
                EXTENDED_MINIMUM_SOAK_SECONDS,
                EXTENDED_MAXIMUM_SAMPLE_INTERVAL_SECONDS,
            ),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QualificationIdentity {
    pub run_id: Uuid,
    pub owner_window_id: String,
    pub workspace_id: String,
    pub source_scope_id: String,
    pub contract_revision: String,
    pub dataset_scope: String,
    pub owner_window_evidence_sha256: String,
    pub n02_owner_manifest_sha256: String,
    pub n03_owner_manifest_sha256: String,
    pub source_image_digest: String,
    pub edge_image_digest: String,
    pub proxy_image_digest: String,
    pub projection_schema_digest: String,
    pub source_implementation_commit: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SemanticParityEvidence {
    pub baseline_expected_digest: String,
    pub baseline_actual_digest: String,
    pub delta_expected_digest: String,
    pub delta_actual_digest: String,
    pub projected_state_digest: String,
    pub replay_state_digest: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DrillEvidence {
    pub name: String,
    pub passed: bool,
    pub evidence_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LatencyPercentiles {
    pub p50_ms: u64,
    pub p95_ms: u64,
    pub p99_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RouteQualificationMetrics {
    pub route_class: String,
    pub request_count: u64,
    pub latency: LatencyPercentiles,
    pub rows_scanned: u64,
    pub rows_returned: u64,
    pub source_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QualificationBounds {
    pub maximum_route_p99_ms: u64,
    pub maximum_rust_rss_bytes: u64,
    pub maximum_rust_cpu_millicores: u64,
    pub maximum_queue_depth: u64,
    pub maximum_projection_lag_ms: u64,
    pub maximum_data_age_ms: u64,
    pub maximum_rebuild_seconds: u64,
    pub maximum_pg_size_bytes: u64,
    pub maximum_pg_iops: u64,
    pub maximum_restore_seconds: u64,
    pub maximum_rows_scanned_per_returned_row: u64,
    pub maximum_source_requests_per_minute: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SoakEvidence {
    pub duration_seconds: u64,
    pub sample_interval_seconds: u64,
    pub sample_count: u64,
    pub active_request_count: u64,
    pub source_request_count: u64,
    pub source_bytes: u64,
    pub rows_scanned: u64,
    pub rows_returned: u64,
    pub source_mutation_count: u64,
    pub baseline_count: u64,
    pub full_reconciliation_count: u64,
    pub ordinary_delta_full_scan_count: u64,
    pub source_selects_after_lease_expiry: u64,
    pub peak_rust_rss_bytes: u64,
    pub peak_rust_cpu_millicores: u64,
    pub peak_queue_depth: u64,
    pub dropped_pages: u64,
    pub p99_projection_lag_ms: u64,
    pub p99_data_age_ms: u64,
    pub gap_count: u64,
    pub divergence_count: u64,
    pub rebuild_seconds: u64,
    pub peak_pg_size_bytes: u64,
    pub peak_pg_iops: u64,
    pub wal_bytes: u64,
    pub restore_seconds: u64,
    pub restart_count: u64,
    pub oom_count: u64,
    pub source_error_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OwnerReview {
    pub owner_id: String,
    pub accepted: bool,
    pub reviewed_at: Option<DateTime<Utc>>,
    pub evidence_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RealSourceQualificationEvidence {
    pub schema_version: String,
    pub evidence_origin: EvidenceOrigin,
    pub qualification_profile: QualificationProfile,
    pub identity: QualificationIdentity,
    pub building_epoch_id: Uuid,
    pub epoch_status: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
    pub semantic_parity: SemanticParityEvidence,
    pub drills: Vec<DrillEvidence>,
    pub route_metrics: Vec<RouteQualificationMetrics>,
    pub bounds: QualificationBounds,
    pub soak: SoakEvidence,
    pub authority: QualificationAuthority,
    pub evidence_data_class: EvidenceDataClass,
    pub owner_review: OwnerReview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RealSourceDecision {
    TemplateValid,
    ReadyForOwnerReview,
    EvidenceAccepted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealSourceQualificationReport {
    pub schema_version: String,
    pub run_id: Uuid,
    pub owner_window_id: String,
    pub contract_revision: String,
    pub source_scope_id: String,
    pub building_epoch_id: Uuid,
    pub evidence_digest: String,
    pub qualification_profile: QualificationProfile,
    pub decision: RealSourceDecision,
    pub soak_seconds: u64,
    pub source_mutations: u64,
    pub divergence_count: u64,
    pub activation_authorized: bool,
    pub registry_profile_changed: bool,
}

/// Validates an exact N06 technical evidence envelope. This function cannot
/// activate a source, epoch, Query profile or command capability.
///
/// # Errors
///
/// Fails closed on identity, scope, parity, drill, resource, soak, redaction
/// or owner-review drift.
pub fn qualify_real_source(
    evidence: &RealSourceQualificationEvidence,
    mode: QualificationMode,
    prerequisites: Option<QualificationPrerequisites<'_>>,
) -> Result<RealSourceQualificationReport, RealSourceQualificationError> {
    validate_identity(&evidence.identity, mode, prerequisites)?;
    if evidence.schema_version != REAL_SOURCE_EVIDENCE_SCHEMA_VERSION {
        return Err(RealSourceQualificationError::UnsupportedSchema);
    }
    if (mode == QualificationMode::Template)
        != matches!(evidence.evidence_origin, EvidenceOrigin::SyntheticTemplate)
    {
        return Err(RealSourceQualificationError::EvidenceModeMismatch);
    }
    if evidence.building_epoch_id.is_nil() || evidence.epoch_status != "BUILDING" {
        return Err(RealSourceQualificationError::EpochNotBuilding);
    }
    if evidence.ended_at <= evidence.started_at {
        return Err(RealSourceQualificationError::InvalidWindow);
    }
    let duration = evidence
        .ended_at
        .signed_duration_since(evidence.started_at)
        .num_seconds();
    let duration =
        u64::try_from(duration).map_err(|_| RealSourceQualificationError::NumericOverflow)?;
    let (minimum_soak_seconds, maximum_sample_interval_seconds) =
        evidence.qualification_profile.coverage();
    if duration != evidence.soak.duration_seconds
        || duration < minimum_soak_seconds
        || evidence.soak.sample_interval_seconds == 0
        || evidence.soak.sample_interval_seconds > maximum_sample_interval_seconds
    {
        return Err(RealSourceQualificationError::SoakCoverageInsufficient);
    }
    let required_samples = duration
        .checked_add(evidence.soak.sample_interval_seconds - 1)
        .ok_or(RealSourceQualificationError::NumericOverflow)?
        / evidence.soak.sample_interval_seconds;
    if evidence.soak.sample_count < required_samples {
        return Err(RealSourceQualificationError::SoakCoverageInsufficient);
    }
    validate_parity(&evidence.semantic_parity)?;
    validate_drills(&evidence.drills)?;
    validate_bounds(&evidence.bounds)?;
    validate_route_metrics(&evidence.route_metrics, &evidence.bounds)?;
    validate_soak(&evidence.soak, &evidence.bounds)?;
    validate_route_totals(&evidence.route_metrics, &evidence.soak)?;
    // These enums intentionally have one accepted representation. Unknown or
    // widened values fail during deserialization before qualification.
    let QualificationAuthority::ReadOnlyBuildingShadow = evidence.authority;
    let EvidenceDataClass::SanitizedMetadataOnly = evidence.evidence_data_class;
    validate_owner_review(&evidence.owner_review, evidence.ended_at, mode)?;
    let decision = match mode {
        QualificationMode::Template => RealSourceDecision::TemplateValid,
        QualificationMode::Candidate => RealSourceDecision::ReadyForOwnerReview,
        QualificationMode::Acceptance => RealSourceDecision::EvidenceAccepted,
    };
    Ok(RealSourceQualificationReport {
        schema_version: REAL_SOURCE_EVIDENCE_SCHEMA_VERSION.to_owned(),
        run_id: evidence.identity.run_id,
        owner_window_id: evidence.identity.owner_window_id.clone(),
        contract_revision: evidence.identity.contract_revision.clone(),
        source_scope_id: evidence.identity.source_scope_id.clone(),
        building_epoch_id: evidence.building_epoch_id,
        evidence_digest: canonical_digest(evidence)?,
        qualification_profile: evidence.qualification_profile,
        decision,
        soak_seconds: evidence.soak.duration_seconds,
        source_mutations: evidence.soak.source_mutation_count,
        divergence_count: evidence.soak.divergence_count,
        activation_authorized: false,
        registry_profile_changed: false,
    })
}

fn validate_identity(
    identity: &QualificationIdentity,
    mode: QualificationMode,
    prerequisites: Option<QualificationPrerequisites<'_>>,
) -> Result<(), RealSourceQualificationError> {
    if identity.run_id.is_nil()
        || !is_safe_identifier(&identity.owner_window_id)
        || identity.workspace_id != N06_WORKSPACE_ID
        || identity.source_scope_id != N06_SOURCE_SCOPE_ID
        || identity.contract_revision != N06_SOURCE_CONTRACT_REVISION
        || identity.dataset_scope != "paper/BINANCE/USDM"
        || !is_commit(&identity.source_implementation_commit)
    {
        return Err(RealSourceQualificationError::IdentityMismatch);
    }
    for digest in [
        &identity.n02_owner_manifest_sha256,
        &identity.n03_owner_manifest_sha256,
        &identity.owner_window_evidence_sha256,
        &identity.source_image_digest,
        &identity.edge_image_digest,
        &identity.proxy_image_digest,
        &identity.projection_schema_digest,
    ] {
        if !is_nonzero_sha256(digest) {
            return Err(RealSourceQualificationError::InvalidDigest);
        }
    }
    match mode {
        QualificationMode::Template => {
            if prerequisites.is_some() {
                return Err(RealSourceQualificationError::PrerequisiteDigestMismatch);
            }
        }
        QualificationMode::Candidate | QualificationMode::Acceptance => {
            let prerequisites =
                prerequisites.ok_or(RealSourceQualificationError::PrerequisiteDigestMismatch)?;
            if prerequisites.n02_owner_manifest_sha256 != identity.n02_owner_manifest_sha256
                || prerequisites.n03_owner_manifest_sha256 != identity.n03_owner_manifest_sha256
                || prerequisites.owner_window_evidence_sha256
                    != identity.owner_window_evidence_sha256
            {
                return Err(RealSourceQualificationError::PrerequisiteDigestMismatch);
            }
        }
    }
    Ok(())
}

fn validate_parity(parity: &SemanticParityEvidence) -> Result<(), RealSourceQualificationError> {
    for digest in [
        &parity.baseline_expected_digest,
        &parity.baseline_actual_digest,
        &parity.delta_expected_digest,
        &parity.delta_actual_digest,
        &parity.projected_state_digest,
        &parity.replay_state_digest,
    ] {
        if !is_nonzero_sha256(digest) {
            return Err(RealSourceQualificationError::InvalidDigest);
        }
    }
    if parity.baseline_expected_digest != parity.baseline_actual_digest
        || parity.delta_expected_digest != parity.delta_actual_digest
        || parity.projected_state_digest != parity.replay_state_digest
    {
        return Err(RealSourceQualificationError::SemanticParityMismatch);
    }
    Ok(())
}

fn validate_drills(drills: &[DrillEvidence]) -> Result<(), RealSourceQualificationError> {
    let mut names = BTreeSet::new();
    for drill in drills {
        if !names.insert(drill.name.as_str())
            || !drill.passed
            || !is_nonzero_sha256(&drill.evidence_sha256)
        {
            return Err(RealSourceQualificationError::DrillEvidenceIncomplete);
        }
    }
    let required = REQUIRED_DRILLS.iter().copied().collect::<BTreeSet<_>>();
    if names != required {
        return Err(RealSourceQualificationError::DrillEvidenceIncomplete);
    }
    Ok(())
}

fn validate_bounds(bounds: &QualificationBounds) -> Result<(), RealSourceQualificationError> {
    if bounds.maximum_route_p99_ms == 0
        || bounds.maximum_rust_rss_bytes == 0
        || bounds.maximum_rust_cpu_millicores == 0
        || bounds.maximum_queue_depth == 0
        || bounds.maximum_projection_lag_ms == 0
        || bounds.maximum_data_age_ms == 0
        || bounds.maximum_rebuild_seconds == 0
        || bounds.maximum_pg_size_bytes == 0
        || bounds.maximum_pg_iops == 0
        || bounds.maximum_restore_seconds == 0
        || bounds.maximum_rows_scanned_per_returned_row == 0
        || bounds.maximum_source_requests_per_minute == 0
    {
        return Err(RealSourceQualificationError::UnsafeBounds);
    }
    Ok(())
}

fn validate_route_metrics(
    routes: &[RouteQualificationMetrics],
    bounds: &QualificationBounds,
) -> Result<(), RealSourceQualificationError> {
    if routes.is_empty() {
        return Err(RealSourceQualificationError::RouteMetricsIncomplete);
    }
    let mut names = BTreeSet::new();
    for route in routes {
        if !is_safe_identifier(&route.route_class)
            || !names.insert(route.route_class.as_str())
            || route.request_count == 0
            || route.latency.p50_ms == 0
            || route.rows_returned == 0
            || route.source_bytes == 0
            || route.latency.p50_ms > route.latency.p95_ms
            || route.latency.p95_ms > route.latency.p99_ms
            || route.latency.p99_ms > bounds.maximum_route_p99_ms
            || exceeds_amplification(
                route.rows_scanned,
                route.rows_returned,
                bounds.maximum_rows_scanned_per_returned_row,
            )?
        {
            return Err(RealSourceQualificationError::RouteMetricsIncomplete);
        }
    }
    let required = REQUIRED_ROUTE_CLASSES
        .iter()
        .copied()
        .collect::<BTreeSet<_>>();
    if names != required {
        return Err(RealSourceQualificationError::RouteMetricsIncomplete);
    }
    Ok(())
}

fn validate_soak(
    soak: &SoakEvidence,
    bounds: &QualificationBounds,
) -> Result<(), RealSourceQualificationError> {
    if soak.active_request_count == 0
        || soak.source_request_count == 0
        || soak.source_bytes == 0
        || soak.rows_returned == 0
        || soak.wal_bytes == 0
        || soak.rebuild_seconds == 0
        || soak.restore_seconds == 0
        || soak.source_mutation_count != 0
        || soak.baseline_count != 1
        || soak.full_reconciliation_count == 0
        || soak.full_reconciliation_count > soak.sample_count
        || soak.ordinary_delta_full_scan_count != 0
        || soak.source_selects_after_lease_expiry != 0
        || soak.dropped_pages != 0
        || soak.gap_count != 0
        || soak.divergence_count != 0
        || soak.restart_count != 0
        || soak.oom_count != 0
        || soak.source_error_count != 0
        || soak.peak_rust_rss_bytes > bounds.maximum_rust_rss_bytes
        || soak.peak_rust_cpu_millicores > bounds.maximum_rust_cpu_millicores
        || soak.peak_queue_depth > bounds.maximum_queue_depth
        || soak.p99_projection_lag_ms > bounds.maximum_projection_lag_ms
        || soak.p99_data_age_ms > bounds.maximum_data_age_ms
        || soak.rebuild_seconds > bounds.maximum_rebuild_seconds
        || soak.peak_pg_size_bytes > bounds.maximum_pg_size_bytes
        || soak.peak_pg_iops > bounds.maximum_pg_iops
        || soak.restore_seconds > bounds.maximum_restore_seconds
        || exceeds_amplification(
            soak.rows_scanned,
            soak.rows_returned,
            bounds.maximum_rows_scanned_per_returned_row,
        )?
    {
        return Err(RealSourceQualificationError::SoakBoundsExceeded);
    }
    let request_numerator = u128::from(soak.source_request_count) * 60;
    let request_denominator =
        u128::from(soak.duration_seconds) * u128::from(bounds.maximum_source_requests_per_minute);
    if request_numerator > request_denominator {
        return Err(RealSourceQualificationError::SoakBoundsExceeded);
    }
    Ok(())
}

fn validate_route_totals(
    routes: &[RouteQualificationMetrics],
    soak: &SoakEvidence,
) -> Result<(), RealSourceQualificationError> {
    let (requests, bytes, scanned, returned) = routes.iter().try_fold(
        (0_u64, 0_u64, 0_u64, 0_u64),
        |(requests, bytes, scanned, returned), route| {
            Ok::<_, RealSourceQualificationError>((
                requests
                    .checked_add(route.request_count)
                    .ok_or(RealSourceQualificationError::NumericOverflow)?,
                bytes
                    .checked_add(route.source_bytes)
                    .ok_or(RealSourceQualificationError::NumericOverflow)?,
                scanned
                    .checked_add(route.rows_scanned)
                    .ok_or(RealSourceQualificationError::NumericOverflow)?,
                returned
                    .checked_add(route.rows_returned)
                    .ok_or(RealSourceQualificationError::NumericOverflow)?,
            ))
        },
    )?;
    if requests != soak.source_request_count
        || bytes != soak.source_bytes
        || scanned != soak.rows_scanned
        || returned != soak.rows_returned
    {
        return Err(RealSourceQualificationError::RouteTotalsMismatch);
    }
    Ok(())
}

fn validate_owner_review(
    review: &OwnerReview,
    ended_at: DateTime<Utc>,
    mode: QualificationMode,
) -> Result<(), RealSourceQualificationError> {
    if !is_safe_identifier(&review.owner_id) || !is_nonzero_sha256(&review.evidence_sha256) {
        return Err(RealSourceQualificationError::OwnerReviewInvalid);
    }
    match mode {
        QualificationMode::Template | QualificationMode::Candidate => {
            if review.accepted || review.reviewed_at.is_some() {
                return Err(RealSourceQualificationError::OwnerReviewInvalid);
            }
        }
        QualificationMode::Acceptance => {
            if !review.accepted || review.reviewed_at.is_none_or(|value| value < ended_at) {
                return Err(RealSourceQualificationError::OwnerReviewRequired);
            }
        }
    }
    Ok(())
}

fn exceeds_amplification(
    scanned: u64,
    returned: u64,
    maximum_ratio: u64,
) -> Result<bool, RealSourceQualificationError> {
    let maximum = u128::from(returned)
        .checked_mul(u128::from(maximum_ratio))
        .ok_or(RealSourceQualificationError::NumericOverflow)?;
    Ok(u128::from(scanned) > maximum)
}

fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAXIMUM_IDENTIFIER_BYTES
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

fn is_commit(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        && value.bytes().any(|byte| byte != b'0')
}

#[derive(Debug, Error)]
pub enum RealSourceQualificationError {
    #[error("real-source qualification evidence schema is unsupported")]
    UnsupportedSchema,
    #[error("real-source qualification identity or scope mismatched")]
    IdentityMismatch,
    #[error("synthetic/real qualification evidence does not match verifier mode")]
    EvidenceModeMismatch,
    #[error("real-source qualification digest is malformed or a placeholder")]
    InvalidDigest,
    #[error("accepted N02/N03/owner-window prerequisite digests do not match the evidence")]
    PrerequisiteDigestMismatch,
    #[error("qualification epoch is not BUILDING")]
    EpochNotBuilding,
    #[error("qualification window is invalid")]
    InvalidWindow,
    #[error("the selected qualification profile has incomplete soak coverage")]
    SoakCoverageInsufficient,
    #[error("baseline, delta or replay semantic parity mismatched")]
    SemanticParityMismatch,
    #[error("required qualification drill evidence is incomplete")]
    DrillEvidenceIncomplete,
    #[error("qualification resource bounds are unsafe")]
    UnsafeBounds,
    #[error("route metrics are incomplete or outside bounds")]
    RouteMetricsIncomplete,
    #[error("per-route metrics do not reconcile with soak totals")]
    RouteTotalsMismatch,
    #[error("steady-state soak exceeded a safety bound")]
    SoakBoundsExceeded,
    #[error("owner review evidence is invalid")]
    OwnerReviewInvalid,
    #[error("owner acceptance is required after the qualification window")]
    OwnerReviewRequired,
    #[error("qualification numeric conversion overflowed")]
    NumericOverflow,
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
}

impl RealSourceQualificationError {
    #[must_use]
    pub const fn reason_code(&self) -> &'static str {
        match self {
            Self::UnsupportedSchema => "N06_SCHEMA_UNSUPPORTED",
            Self::IdentityMismatch => "N06_IDENTITY_MISMATCH",
            Self::EvidenceModeMismatch => "N06_EVIDENCE_MODE_MISMATCH",
            Self::InvalidDigest => "N06_DIGEST_INVALID",
            Self::PrerequisiteDigestMismatch => "N06_PREREQUISITE_DIGEST_MISMATCH",
            Self::EpochNotBuilding => "N06_EPOCH_NOT_BUILDING",
            Self::InvalidWindow => "N06_WINDOW_INVALID",
            Self::SoakCoverageInsufficient => "N06_SOAK_COVERAGE_INSUFFICIENT",
            Self::SemanticParityMismatch => "N06_SEMANTIC_PARITY_MISMATCH",
            Self::DrillEvidenceIncomplete => "N06_DRILL_EVIDENCE_INCOMPLETE",
            Self::UnsafeBounds => "N06_BOUNDS_UNSAFE",
            Self::RouteMetricsIncomplete => "N06_ROUTE_METRICS_INCOMPLETE",
            Self::RouteTotalsMismatch => "N06_ROUTE_TOTALS_MISMATCH",
            Self::SoakBoundsExceeded => "N06_SOAK_BOUNDS_EXCEEDED",
            Self::OwnerReviewInvalid => "N06_OWNER_REVIEW_INVALID",
            Self::OwnerReviewRequired => "N06_OWNER_REVIEW_REQUIRED",
            Self::NumericOverflow => "N06_NUMERIC_OVERFLOW",
            Self::Projection(_) => "N06_SERIALIZATION_FAILED",
        }
    }
}
