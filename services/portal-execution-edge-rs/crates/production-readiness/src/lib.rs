//! N17A source-dark production-readiness and disaster-recovery authority.
//!
//! This crate is pure domain code. It has no listener, network client,
//! credential loader, cloud SDK or Trading System dependency. It validates
//! provisional product budgets and isolated drill evidence without turning
//! either into a production SLO, source activation or command authority.

#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const READINESS_SCHEMA_VERSION: &str = "portal.execution.production-readiness.v1";
pub const EVIDENCE_SCHEMA_VERSION: &str = "portal.execution.production-readiness-evidence.v1";
pub const PROFILE_ID: &str = "n17a-source-dark";
pub const MAX_GAME_DAY_FREQUENCY_DAYS: u16 = 90;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SloClass {
    CurrentStateSameCell,
    CrossCellBff,
    CachedChart,
    UncachedMediumChart,
    FirstEvent,
    CorrelationFreshness,
    CommandPlanAcknowledgement,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MeasurementAuthority {
    ProvisionalQualificationOnly,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProvisionalBudget {
    pub class: SloClass,
    pub maximum_p95_milliseconds: u64,
    pub authority: MeasurementAuthority,
    pub production_slo_claimed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorBudgetPolicy {
    pub mode: String,
    pub availability_target_basis_points: Option<u16>,
    pub production_window_open: bool,
    pub burn_alert_active: bool,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryComponent {
    PortalControlDatabase,
    ProjectionDatabase,
    ObjectEvidence,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryMethod {
    EncryptedPitrRestore,
    DeterministicRebuild,
    HashVerifiedRestore,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecoveryPolicy {
    pub component: RecoveryComponent,
    pub method: RecoveryMethod,
    pub encrypted_at_rest_required: bool,
    pub restore_verification_required: bool,
    pub production_rpo_seconds: Option<u64>,
    pub production_rto_seconds: Option<u64>,
    pub owner_approval_required: bool,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum IdentityFamily {
    MtlsRead,
    MtlsCommand,
    DelegatedJwtSigner,
    PortalSessionSigner,
    ProjectionDatabase,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct RotationPolicy {
    pub identity: IdentityFamily,
    pub overlap_seconds: u64,
    pub revoke_old_after_verify: bool,
    pub compromise_disables_commands_first: bool,
    pub runtime_identity_bound: bool,
    pub secret_material_present: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CapacityBudget {
    pub six_month_order_fill_rows: u64,
    pub initial_concurrent_sse_clients: u32,
    pub source_burst_events_per_minute: u32,
    pub maximum_chart_points: u32,
    pub maximum_correlation_assets: u16,
    pub backup_daily_copies: u8,
    pub backup_weekly_copies: u8,
    pub monthly_cost_budget_usd: Option<u32>,
    pub cost_owner_approval_required: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct ReadinessProfile {
    pub schema_version: String,
    pub profile_id: String,
    pub source_dark: bool,
    pub production_active: bool,
    pub network_authorized: bool,
    pub source_call_authorized: bool,
    pub command_authorized: bool,
    pub production_slo_claimed: bool,
    pub game_day_frequency_days: u16,
    pub budgets: Vec<ProvisionalBudget>,
    pub error_budget: ErrorBudgetPolicy,
    pub recovery: Vec<RecoveryPolicy>,
    pub rotations: Vec<RotationPolicy>,
    pub capacity: CapacityBudget,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DrillScenario {
    NetworkPartition,
    AuthLoss,
    SourceLoss,
    CommandContainment,
    ControlDatabasePitr,
    ProjectionRebuild,
    ReleaseRollback,
    CredentialCompromise,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DrillOutcome {
    Passed,
    Failed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DrillResult {
    pub scenario: DrillScenario,
    pub outcome: DrillOutcome,
    pub isolated: bool,
    pub source_request_sent: bool,
    pub command_dispatched: bool,
    pub network_attempts: u64,
    pub evidence_digest: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
pub struct ReadinessEvidence {
    pub schema_version: String,
    pub evidence_class: String,
    pub source_dark: bool,
    pub production_active: bool,
    pub production_slo_claimed: bool,
    pub production_rpo_rto_claimed: bool,
    pub generated_at_epoch_seconds: u64,
    pub drills: Vec<DrillResult>,
    pub manifest_digest: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QualificationDecision {
    Pass,
    Fail,
    NotMeasured,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QualificationResult {
    pub class: SloClass,
    pub decision: QualificationDecision,
    pub observed_p95_milliseconds: Option<u64>,
    pub maximum_p95_milliseconds: u64,
    pub production_slo_claimed: bool,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum ReadinessError {
    #[error("source-dark authority was widened")]
    AuthorityWidened,
    #[error("readiness profile identity is invalid")]
    InvalidIdentity,
    #[error("provisional SLO catalogue is incomplete or duplicated")]
    InvalidSloCatalogue,
    #[error("error budget must remain unclaimed until N17B")]
    ErrorBudgetClaimed,
    #[error("recovery catalogue is incomplete or unsafe")]
    InvalidRecoveryCatalogue,
    #[error("rotation catalogue is incomplete or contains secret/runtime authority")]
    InvalidRotationCatalogue,
    #[error("capacity, retention or cost boundary is invalid")]
    InvalidCapacityBudget,
    #[error("isolated game-day evidence is incomplete")]
    IncompleteGameDay,
    #[error("game-day evidence crossed a production boundary")]
    NonIsolatedEvidence,
    #[error("game-day evidence manifest digest is invalid")]
    InvalidEvidenceDigest,
}

/// Validates the exact source-dark N17A authority.
///
/// # Errors
///
/// Returns a stable fail-closed error if the profile claims production,
/// runtime, source, command, SLO, RPO/RTO or secret authority.
pub fn validate_profile(profile: &ReadinessProfile) -> Result<(), ReadinessError> {
    if profile.schema_version != READINESS_SCHEMA_VERSION || profile.profile_id != PROFILE_ID {
        return Err(ReadinessError::InvalidIdentity);
    }
    if !profile.source_dark
        || profile.production_active
        || profile.network_authorized
        || profile.source_call_authorized
        || profile.command_authorized
        || profile.production_slo_claimed
        || profile.game_day_frequency_days == 0
        || profile.game_day_frequency_days > MAX_GAME_DAY_FREQUENCY_DAYS
    {
        return Err(ReadinessError::AuthorityWidened);
    }

    let expected_slos = BTreeSet::from([
        SloClass::CurrentStateSameCell,
        SloClass::CrossCellBff,
        SloClass::CachedChart,
        SloClass::UncachedMediumChart,
        SloClass::FirstEvent,
        SloClass::CorrelationFreshness,
        SloClass::CommandPlanAcknowledgement,
    ]);
    let actual_slos: BTreeSet<_> = profile.budgets.iter().map(|item| item.class).collect();
    if actual_slos != expected_slos
        || profile.budgets.len() != expected_slos.len()
        || profile.budgets.iter().any(|item| {
            item.maximum_p95_milliseconds == 0
                || item.authority != MeasurementAuthority::ProvisionalQualificationOnly
                || item.production_slo_claimed
        })
    {
        return Err(ReadinessError::InvalidSloCatalogue);
    }
    if profile.error_budget.mode != "NOT_MEASURED"
        || profile
            .error_budget
            .availability_target_basis_points
            .is_some()
        || profile.error_budget.production_window_open
        || profile.error_budget.burn_alert_active
    {
        return Err(ReadinessError::ErrorBudgetClaimed);
    }

    let expected_recovery = BTreeSet::from([
        RecoveryComponent::PortalControlDatabase,
        RecoveryComponent::ProjectionDatabase,
        RecoveryComponent::ObjectEvidence,
    ]);
    let actual_recovery: BTreeSet<_> = profile.recovery.iter().map(|item| item.component).collect();
    if actual_recovery != expected_recovery
        || profile.recovery.len() != expected_recovery.len()
        || profile.recovery.iter().any(|item| {
            !item.encrypted_at_rest_required
                || !item.restore_verification_required
                || item.production_rpo_seconds.is_some()
                || item.production_rto_seconds.is_some()
                || !item.owner_approval_required
        })
    {
        return Err(ReadinessError::InvalidRecoveryCatalogue);
    }

    let expected_rotations = BTreeSet::from([
        IdentityFamily::MtlsRead,
        IdentityFamily::MtlsCommand,
        IdentityFamily::DelegatedJwtSigner,
        IdentityFamily::PortalSessionSigner,
        IdentityFamily::ProjectionDatabase,
    ]);
    let actual_rotations: BTreeSet<_> =
        profile.rotations.iter().map(|item| item.identity).collect();
    if actual_rotations != expected_rotations
        || profile.rotations.len() != expected_rotations.len()
        || profile.rotations.iter().any(|item| {
            item.overlap_seconds == 0
                || !item.revoke_old_after_verify
                || !item.compromise_disables_commands_first
                || item.runtime_identity_bound
                || item.secret_material_present
        })
    {
        return Err(ReadinessError::InvalidRotationCatalogue);
    }

    let capacity = &profile.capacity;
    if capacity.six_month_order_fill_rows < 182_000
        || capacity.initial_concurrent_sse_clients < 100
        || capacity.source_burst_events_per_minute < 140
        || capacity.maximum_chart_points != 5_000
        || capacity.maximum_correlation_assets != 150
        || capacity.backup_daily_copies < 7
        || capacity.backup_weekly_copies < 4
        || capacity.monthly_cost_budget_usd.is_some()
        || !capacity.cost_owner_approval_required
    {
        return Err(ReadinessError::InvalidCapacityBudget);
    }
    Ok(())
}

/// Evaluates an offline sample against a provisional interaction budget.
/// Empty input remains `NOT_MEASURED`; no result can claim a production SLO.
#[must_use]
pub fn qualify_latency(budget: &ProvisionalBudget, samples_ms: &[u64]) -> QualificationResult {
    if samples_ms.is_empty() {
        return QualificationResult {
            class: budget.class,
            decision: QualificationDecision::NotMeasured,
            observed_p95_milliseconds: None,
            maximum_p95_milliseconds: budget.maximum_p95_milliseconds,
            production_slo_claimed: false,
        };
    }
    let mut sorted = samples_ms.to_vec();
    sorted.sort_unstable();
    let rank = sorted.len().saturating_mul(95).div_ceil(100).max(1);
    let observed = sorted[rank - 1];
    QualificationResult {
        class: budget.class,
        decision: if observed <= budget.maximum_p95_milliseconds {
            QualificationDecision::Pass
        } else {
            QualificationDecision::Fail
        },
        observed_p95_milliseconds: Some(observed),
        maximum_p95_milliseconds: budget.maximum_p95_milliseconds,
        production_slo_claimed: false,
    }
}

/// Builds and validates an immutable digest over isolated drill records.
///
/// # Errors
///
/// Returns an error unless every required scenario passed without any network,
/// source or command attempt.
pub fn seal_isolated_evidence(
    generated_at_epoch_seconds: u64,
    drills: Vec<DrillResult>,
) -> Result<ReadinessEvidence, ReadinessError> {
    let required = BTreeSet::from([
        DrillScenario::NetworkPartition,
        DrillScenario::AuthLoss,
        DrillScenario::SourceLoss,
        DrillScenario::CommandContainment,
        DrillScenario::ControlDatabasePitr,
        DrillScenario::ProjectionRebuild,
        DrillScenario::ReleaseRollback,
        DrillScenario::CredentialCompromise,
    ]);
    let actual: BTreeSet<_> = drills.iter().map(|item| item.scenario).collect();
    if generated_at_epoch_seconds == 0 || actual != required || drills.len() != required.len() {
        return Err(ReadinessError::IncompleteGameDay);
    }
    if drills.iter().any(|item| {
        item.outcome != DrillOutcome::Passed
            || !item.isolated
            || item.source_request_sent
            || item.command_dispatched
            || item.network_attempts != 0
            || !valid_digest(&item.evidence_digest)
    }) {
        return Err(ReadinessError::NonIsolatedEvidence);
    }
    let manifest_digest = digest_drills(generated_at_epoch_seconds, &drills);
    Ok(ReadinessEvidence {
        schema_version: EVIDENCE_SCHEMA_VERSION.to_owned(),
        evidence_class: "OFFLINE_ISOLATED_QUALIFICATION".to_owned(),
        source_dark: true,
        production_active: false,
        production_slo_claimed: false,
        production_rpo_rto_claimed: false,
        generated_at_epoch_seconds,
        drills,
        manifest_digest,
    })
}

/// Revalidates a sealed evidence object after storage or restart.
///
/// # Errors
///
/// Rejects authority widening, malformed drill rows or digest tampering.
pub fn verify_evidence(evidence: &ReadinessEvidence) -> Result<(), ReadinessError> {
    if evidence.schema_version != EVIDENCE_SCHEMA_VERSION
        || evidence.evidence_class != "OFFLINE_ISOLATED_QUALIFICATION"
        || !evidence.source_dark
        || evidence.production_active
        || evidence.production_slo_claimed
        || evidence.production_rpo_rto_claimed
    {
        return Err(ReadinessError::AuthorityWidened);
    }
    let rebuilt =
        seal_isolated_evidence(evidence.generated_at_epoch_seconds, evidence.drills.clone())?;
    if rebuilt.manifest_digest != evidence.manifest_digest {
        return Err(ReadinessError::InvalidEvidenceDigest);
    }
    Ok(())
}

fn valid_digest(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn digest_drills(generated_at_epoch_seconds: u64, drills: &[DrillResult]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(generated_at_epoch_seconds.to_be_bytes());
    for item in drills {
        let serialized = serde_json_like(item);
        hasher.update((serialized.len() as u64).to_be_bytes());
        hasher.update(serialized.as_bytes());
    }
    format!("sha256:{:x}", hasher.finalize())
}

fn serde_json_like(item: &DrillResult) -> String {
    format!(
        "{:?}|{:?}|{}|{}|{}|{}|{}",
        item.scenario,
        item.outcome,
        item.isolated,
        item.source_request_sent,
        item.command_dispatched,
        item.network_attempts,
        item.evidence_digest
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn budget(class: SloClass, milliseconds: u64) -> ProvisionalBudget {
        ProvisionalBudget {
            class,
            maximum_p95_milliseconds: milliseconds,
            authority: MeasurementAuthority::ProvisionalQualificationOnly,
            production_slo_claimed: false,
        }
    }

    fn profile() -> ReadinessProfile {
        ReadinessProfile {
            schema_version: READINESS_SCHEMA_VERSION.to_owned(),
            profile_id: PROFILE_ID.to_owned(),
            source_dark: true,
            production_active: false,
            network_authorized: false,
            source_call_authorized: false,
            command_authorized: false,
            production_slo_claimed: false,
            game_day_frequency_days: 90,
            budgets: vec![
                budget(SloClass::CurrentStateSameCell, 200),
                budget(SloClass::CrossCellBff, 500),
                budget(SloClass::CachedChart, 500),
                budget(SloClass::UncachedMediumChart, 1_500),
                budget(SloClass::FirstEvent, 2_000),
                budget(SloClass::CorrelationFreshness, 300_000),
                budget(SloClass::CommandPlanAcknowledgement, 500),
            ],
            error_budget: ErrorBudgetPolicy {
                mode: "NOT_MEASURED".to_owned(),
                availability_target_basis_points: None,
                production_window_open: false,
                burn_alert_active: false,
            },
            recovery: vec![
                RecoveryPolicy {
                    component: RecoveryComponent::PortalControlDatabase,
                    method: RecoveryMethod::EncryptedPitrRestore,
                    encrypted_at_rest_required: true,
                    restore_verification_required: true,
                    production_rpo_seconds: None,
                    production_rto_seconds: None,
                    owner_approval_required: true,
                },
                RecoveryPolicy {
                    component: RecoveryComponent::ProjectionDatabase,
                    method: RecoveryMethod::DeterministicRebuild,
                    encrypted_at_rest_required: true,
                    restore_verification_required: true,
                    production_rpo_seconds: None,
                    production_rto_seconds: None,
                    owner_approval_required: true,
                },
                RecoveryPolicy {
                    component: RecoveryComponent::ObjectEvidence,
                    method: RecoveryMethod::HashVerifiedRestore,
                    encrypted_at_rest_required: true,
                    restore_verification_required: true,
                    production_rpo_seconds: None,
                    production_rto_seconds: None,
                    owner_approval_required: true,
                },
            ],
            rotations: [
                IdentityFamily::MtlsRead,
                IdentityFamily::MtlsCommand,
                IdentityFamily::DelegatedJwtSigner,
                IdentityFamily::PortalSessionSigner,
                IdentityFamily::ProjectionDatabase,
            ]
            .into_iter()
            .map(|identity| RotationPolicy {
                identity,
                overlap_seconds: 600,
                revoke_old_after_verify: true,
                compromise_disables_commands_first: true,
                runtime_identity_bound: false,
                secret_material_present: false,
            })
            .collect(),
            capacity: CapacityBudget {
                six_month_order_fill_rows: 182_000,
                initial_concurrent_sse_clients: 100,
                source_burst_events_per_minute: 140,
                maximum_chart_points: 5_000,
                maximum_correlation_assets: 150,
                backup_daily_copies: 7,
                backup_weekly_copies: 4,
                monthly_cost_budget_usd: None,
                cost_owner_approval_required: true,
            },
        }
    }

    fn drills() -> Vec<DrillResult> {
        [
            DrillScenario::NetworkPartition,
            DrillScenario::AuthLoss,
            DrillScenario::SourceLoss,
            DrillScenario::CommandContainment,
            DrillScenario::ControlDatabasePitr,
            DrillScenario::ProjectionRebuild,
            DrillScenario::ReleaseRollback,
            DrillScenario::CredentialCompromise,
        ]
        .into_iter()
        .enumerate()
        .map(|(index, scenario)| DrillResult {
            scenario,
            outcome: DrillOutcome::Passed,
            isolated: true,
            source_request_sent: false,
            command_dispatched: false,
            network_attempts: 0,
            evidence_digest: format!("sha256:{:064x}", index + 1),
        })
        .collect()
    }

    #[test]
    fn accepts_complete_source_dark_profile() {
        assert_eq!(validate_profile(&profile()), Ok(()));
    }

    #[test]
    fn canonical_json_profile_matches_rust_authority() {
        let canonical: ReadinessProfile = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json"
        ))
        .expect("canonical N17A profile");
        assert_eq!(validate_profile(&canonical), Ok(()));
        assert_eq!(canonical, profile());
    }

    #[test]
    fn rejects_any_runtime_or_slo_authority() {
        let mut candidate = profile();
        candidate.production_active = true;
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::AuthorityWidened)
        );
        candidate.production_active = false;
        candidate.production_slo_claimed = true;
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::AuthorityWidened)
        );
    }

    #[test]
    fn rejects_claimed_error_budget() {
        let mut candidate = profile();
        candidate.error_budget.availability_target_basis_points = Some(9_990);
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::ErrorBudgetClaimed)
        );
    }

    #[test]
    fn rejects_incomplete_recovery_or_rotation_catalogues() {
        let mut candidate = profile();
        candidate.recovery.pop();
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::InvalidRecoveryCatalogue)
        );
        let mut candidate = profile();
        candidate.rotations[0].secret_material_present = true;
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::InvalidRotationCatalogue)
        );
    }

    #[test]
    fn evaluates_nearest_rank_p95_without_production_claim() {
        let samples: Vec<u64> = (1..=100).collect();
        let result = qualify_latency(&budget(SloClass::CurrentStateSameCell, 200), &samples);
        assert_eq!(result.decision, QualificationDecision::Pass);
        assert_eq!(result.observed_p95_milliseconds, Some(95));
        assert!(!result.production_slo_claimed);
    }

    #[test]
    fn reports_empty_latency_as_not_measured() {
        let result = qualify_latency(&budget(SloClass::CrossCellBff, 500), &[]);
        assert_eq!(result.decision, QualificationDecision::NotMeasured);
        assert_eq!(result.observed_p95_milliseconds, None);
    }

    #[test]
    fn seals_and_verifies_complete_isolated_game_day() {
        let evidence = seal_isolated_evidence(1_777_777_777, drills()).expect("valid evidence");
        assert_eq!(verify_evidence(&evidence), Ok(()));
        assert!(!evidence.production_slo_claimed);
        assert!(!evidence.production_rpo_rto_claimed);
    }

    #[test]
    fn rejects_network_source_or_command_attempts() {
        for mutate in 0..3 {
            let mut rows = drills();
            match mutate {
                0 => rows[0].network_attempts = 1,
                1 => rows[1].source_request_sent = true,
                _ => rows[2].command_dispatched = true,
            }
            assert_eq!(
                seal_isolated_evidence(1_777_777_777, rows),
                Err(ReadinessError::NonIsolatedEvidence)
            );
        }
    }

    #[test]
    fn detects_evidence_tampering_after_restart() {
        let evidence = seal_isolated_evidence(1_777_777_777, drills()).expect("valid evidence");
        let serialized = serde_json::to_vec(&evidence).expect("serialize evidence");
        let mut restored: ReadinessEvidence =
            serde_json::from_slice(&serialized).expect("restore evidence");
        restored.drills[0].evidence_digest = format!("sha256:{:064x}", 999);
        assert_eq!(
            verify_evidence(&restored),
            Err(ReadinessError::InvalidEvidenceDigest)
        );
    }

    #[test]
    fn rejects_unapproved_cost_or_under_capacity() {
        let mut candidate = profile();
        candidate.capacity.monthly_cost_budget_usd = Some(500);
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::InvalidCapacityBudget)
        );
        candidate.capacity.monthly_cost_budget_usd = None;
        candidate.capacity.initial_concurrent_sse_clients = 99;
        assert_eq!(
            validate_profile(&candidate),
            Err(ReadinessError::InvalidCapacityBudget)
        );
    }
}
