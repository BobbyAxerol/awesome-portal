use std::time::Duration;

use chrono::{DateTime, TimeDelta, Utc};
use projection_core::ProjectionScope;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use sqlx::Row as _;
use uuid::Uuid;

use crate::{PgProjectionStore, StoreError};

const CLEANUP_STATEMENTS: &[&str] = &[
    "DELETE FROM portal_projection.analytics_source_facts AS fact USING portal_projection.analytics_source_snapshots AS snapshot WHERE fact.snapshot_id=snapshot.snapshot_id AND snapshot.epoch_id=$1",
    "DELETE FROM portal_projection.analytics_source_snapshots WHERE epoch_id=$1",
    "DELETE FROM portal_projection.d4_source_failures WHERE epoch_id=$1",
    "DELETE FROM portal_projection.d4_source_checkpoints WHERE epoch_id=$1",
    "DELETE FROM portal_projection.shared_consumer_leases WHERE epoch_id=$1",
    "DELETE FROM portal_projection.manager_projection_leases WHERE epoch_id=$1",
    "DELETE FROM portal_projection.manager_projection_heartbeats WHERE epoch_id=$1",
    "DELETE FROM portal_projection.manager_projection_commits WHERE epoch_id=$1",
    "DELETE FROM portal_projection.manager_projection_cycles WHERE epoch_id=$1",
    "DELETE FROM portal_projection.series_points WHERE epoch_id=$1",
    "DELETE FROM portal_projection.snapshots WHERE epoch_id=$1",
    "DELETE FROM portal_projection.event_journal WHERE epoch_id=$1",
    "DELETE FROM portal_projection.entities WHERE epoch_id=$1",
    "DELETE FROM portal_projection.ingestion_keys WHERE epoch_id=$1",
    "DELETE FROM portal_projection.checkpoints WHERE epoch_id=$1",
    "DELETE FROM portal_projection.gaps WHERE epoch_id=$1",
    "DELETE FROM portal_projection.dead_letters WHERE epoch_id=$1",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetentionLifecyclePolicySnapshot {
    pub policy_id: Uuid,
    pub policy_version: String,
    pub policy_digest: String,
    pub hot_window: Duration,
    pub rollback_window: Duration,
    pub storage_budget_bytes: u64,
    pub soft_limit_percent: u8,
    pub hard_limit_percent: u8,
    pub max_journal_rows: u64,
    pub created_at: DateTime<Utc>,
}

impl RetentionLifecyclePolicySnapshot {
    fn validate(&self) -> Result<(), StoreError> {
        if self.policy_version.trim() != self.policy_version
            || self.policy_version.is_empty()
            || !is_sha256(&self.policy_digest)
            || self.hot_window.is_zero()
            || self.rollback_window.is_zero()
            || self.storage_budget_bytes == 0
            || self.max_journal_rows == 0
            || self.soft_limit_percent == 0
            || self.soft_limit_percent >= self.hard_limit_percent
            || self.hard_limit_percent >= 100
        {
            return Err(StoreError::InvalidRetentionLifecyclePolicy);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecoveryCheckpointEvidence {
    pub checkpoint_id: Uuid,
    pub epoch_id: Uuid,
    pub through_journal_ordinal: u64,
    pub through_projection_sequence: u64,
    pub state_digest: String,
    pub archive_digest: String,
    pub encryption_key_digest: String,
    pub archive_verified_at: DateTime<Utc>,
    pub restore_verified_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

impl RecoveryCheckpointEvidence {
    fn validate(&self) -> Result<(), StoreError> {
        if !is_sha256(&self.state_digest)
            || !is_sha256(&self.archive_digest)
            || !is_sha256(&self.encryption_key_digest)
            || self.restore_verified_at < self.archive_verified_at
            || self.created_at < self.restore_verified_at
        {
            return Err(StoreError::InvalidRecoveryCheckpoint);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StorageBudgetObservation {
    pub used_bytes: u64,
    pub journal_rows: u64,
    pub observed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StoragePressure {
    Healthy,
    SoftLimit,
    HardLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryCause {
    CursorExpired,
    SequenceGap,
    JournalLimit,
    DiskHardLimit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecoveryDirective {
    Continue,
    ScheduleRetiredCleanup,
    PauseIngestionAndBuildNewEpoch,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupPlan {
    pub cleanup_run_id: Uuid,
    pub epoch_id: Uuid,
    pub checkpoint_id: Uuid,
    pub cleanup_not_before: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CleanupOutcome {
    pub cleanup_run_id: Uuid,
    pub epoch_id: Uuid,
    pub rows_removed: u64,
    pub result_digest: String,
}

#[must_use]
pub fn evaluate_storage_pressure(
    policy: &RetentionLifecyclePolicySnapshot,
    observation: StorageBudgetObservation,
) -> StoragePressure {
    let used_percent_numerator = u128::from(observation.used_bytes) * 100;
    let budget = u128::from(policy.storage_budget_bytes);
    if observation.journal_rows >= policy.max_journal_rows
        || used_percent_numerator >= budget * u128::from(policy.hard_limit_percent)
    {
        StoragePressure::HardLimit
    } else if used_percent_numerator >= budget * u128::from(policy.soft_limit_percent) {
        StoragePressure::SoftLimit
    } else {
        StoragePressure::Healthy
    }
}

#[must_use]
pub fn retention_policy_digest(
    scope: &ProjectionScope,
    policy: &RetentionLifecyclePolicySnapshot,
) -> String {
    let canonical = format!(
        "workspace_id={}\nenvironment={}\npolicy_version={}\nhot_window_seconds={}\nrollback_window_seconds={}\nstorage_budget_bytes={}\nsoft_limit_percent={}\nhard_limit_percent={}\nmax_journal_rows={}\ncreated_at={}\n",
        scope.workspace_id.as_str(),
        scope.environment,
        policy.policy_version,
        policy.hot_window.as_secs(),
        policy.rollback_window.as_secs(),
        policy.storage_budget_bytes,
        policy.soft_limit_percent,
        policy.hard_limit_percent,
        policy.max_journal_rows,
        policy.created_at.to_rfc3339(),
    );
    format!("sha256:{:x}", Sha256::digest(canonical.as_bytes()))
}

#[must_use]
pub const fn recovery_directive(
    pressure: StoragePressure,
    recovery_cause: Option<RecoveryCause>,
) -> RecoveryDirective {
    if recovery_cause.is_some() || matches!(pressure, StoragePressure::HardLimit) {
        RecoveryDirective::PauseIngestionAndBuildNewEpoch
    } else if matches!(pressure, StoragePressure::SoftLimit) {
        RecoveryDirective::ScheduleRetiredCleanup
    } else {
        RecoveryDirective::Continue
    }
}

impl PgProjectionStore {
    /// Appends one immutable lifecycle/budget policy for a projection scope.
    ///
    /// # Errors
    ///
    /// Rejects invalid or colliding policy evidence and database failures.
    pub async fn record_retention_lifecycle_policy(
        &self,
        scope: &ProjectionScope,
        policy: &RetentionLifecyclePolicySnapshot,
    ) -> Result<(), StoreError> {
        policy.validate()?;
        if retention_policy_digest(scope, policy) != policy.policy_digest {
            return Err(StoreError::InvalidRetentionLifecyclePolicy);
        }
        let hot_window_seconds = duration_i64(policy.hot_window)?;
        let rollback_window_seconds = duration_i64(policy.rollback_window)?;
        let storage_budget_bytes = u64_i64(policy.storage_budget_bytes)?;
        let max_journal_rows = u64_i64(policy.max_journal_rows)?;
        let inserted = sqlx::query(
            "INSERT INTO portal_projection.retention_lifecycle_policy_snapshots
             (policy_id, workspace_id, environment, policy_version, policy_digest,
              hot_window_seconds, rollback_window_seconds, storage_budget_bytes,
              soft_limit_percent, hard_limit_percent, max_journal_rows, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (workspace_id, environment, policy_version) DO NOTHING",
        )
        .bind(policy.policy_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&policy.policy_version)
        .bind(&policy.policy_digest)
        .bind(hot_window_seconds)
        .bind(rollback_window_seconds)
        .bind(storage_budget_bytes)
        .bind(i16::from(policy.soft_limit_percent))
        .bind(i16::from(policy.hard_limit_percent))
        .bind(max_journal_rows)
        .bind(policy.created_at)
        .execute(&self.pool)
        .await?;
        if inserted.rows_affected() == 0 {
            let persisted: String = sqlx::query_scalar(
                "SELECT policy_digest
                 FROM portal_projection.retention_lifecycle_policy_snapshots
                 WHERE workspace_id=$1 AND environment=$2 AND policy_version=$3",
            )
            .bind(scope.workspace_id.as_str())
            .bind(&scope.environment)
            .bind(&policy.policy_version)
            .fetch_one(&self.pool)
            .await?;
            if persisted != policy.policy_digest {
                return Err(StoreError::RetentionPolicyVersionCollision);
            }
        }
        Ok(())
    }

    /// Returns local Portal projection storage usage; it never reads the
    /// Trading System database or source API.
    ///
    /// # Errors
    ///
    /// Returns database or numeric-conversion failures.
    pub async fn observe_projection_storage(
        &self,
        observed_at: DateTime<Utc>,
    ) -> Result<StorageBudgetObservation, StoreError> {
        let row = sqlx::query(
            "SELECT
               COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::BIGINT AS used_bytes,
               (SELECT count(*) FROM portal_projection.event_journal)::BIGINT AS journal_rows
             FROM pg_class c
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='portal_projection' AND c.relkind IN ('r','p')",
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(StorageBudgetObservation {
            used_bytes: nonnegative_u64(row.try_get("used_bytes")?)?,
            journal_rows: nonnegative_u64(row.try_get("journal_rows")?)?,
            observed_at,
        })
    }

    /// Retires a read-only overlap epoch only after its overlap has elapsed.
    ///
    /// # Errors
    ///
    /// Rejects wrong scope/state, a live overlap or database failure.
    pub async fn retire_retained_epoch(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        retired_at: DateTime<Utc>,
    ) -> Result<(), StoreError> {
        let result = sqlx::query(
            "UPDATE portal_projection.epochs AS retired
             SET status='RETIRED', retired_at=$4, overlap_until=NULL
             WHERE retired.epoch_id=$1 AND retired.workspace_id=$2
               AND retired.environment=$3 AND retired.status='RETAINED'
               AND retired.overlap_until <= $4
               AND $4 <= clock_timestamp()
               AND EXISTS (
                 SELECT 1 FROM portal_projection.epochs AS active
                 WHERE active.workspace_id=$2 AND active.environment=$3
                   AND active.status='ACTIVE' AND active.epoch_id <> $1)",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(retired_at)
        .execute(&self.pool)
        .await?;
        if result.rows_affected() != 1 {
            return Err(StoreError::EpochNotRetireable);
        }
        Ok(())
    }

    /// Persists archive-encryption and deterministic-restore proof for the
    /// complete retained/retired epoch journal.
    ///
    /// # Errors
    ///
    /// Rejects incomplete, invalid or mismatched evidence and database failures.
    pub async fn record_recovery_checkpoint(
        &self,
        evidence: &RecoveryCheckpointEvidence,
    ) -> Result<(), StoreError> {
        evidence.validate()?;
        let mut transaction = self.pool.begin().await?;
        let epoch = sqlx::query(
            "SELECT status, next_projection_sequence, actual_state_digest,
                    clock_timestamp() AS database_now
             FROM portal_projection.epochs WHERE epoch_id=$1 FOR UPDATE",
        )
        .bind(evidence.epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::EpochNotFound)?;
        let status: String = epoch.try_get("status")?;
        let database_now: DateTime<Utc> = epoch.try_get("database_now")?;
        if (status != "RETAINED" && status != "RETIRED") || evidence.created_at > database_now {
            return Err(StoreError::EpochNotRecoverable);
        }
        let journal_ordinal: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(journal_ordinal),0)::BIGINT
             FROM portal_projection.event_journal WHERE epoch_id=$1",
        )
        .bind(evidence.epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        let projection_sequence: i64 = epoch.try_get("next_projection_sequence")?;
        let state_digest: Option<String> = epoch.try_get("actual_state_digest")?;
        if nonnegative_u64(journal_ordinal)? != evidence.through_journal_ordinal
            || nonnegative_u64(projection_sequence)? != evidence.through_projection_sequence
            || state_digest.as_deref() != Some(evidence.state_digest.as_str())
        {
            return Err(StoreError::RecoveryCheckpointCoverageMismatch);
        }
        sqlx::query(
            "INSERT INTO portal_projection.retention_recovery_checkpoints
             (checkpoint_id, epoch_id, through_journal_ordinal,
              through_projection_sequence, state_digest, archive_digest,
              encryption_key_digest, archive_verified_at, restore_verified_at, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        )
        .bind(evidence.checkpoint_id)
        .bind(evidence.epoch_id)
        .bind(u64_i64(evidence.through_journal_ordinal)?)
        .bind(u64_i64(evidence.through_projection_sequence)?)
        .bind(&evidence.state_digest)
        .bind(&evidence.archive_digest)
        .bind(&evidence.encryption_key_digest)
        .bind(evidence.archive_verified_at)
        .bind(evidence.restore_verified_at)
        .bind(evidence.created_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    /// Plans cleanup no earlier than both request time and the retired epoch's
    /// rollback-retention deadline.
    ///
    /// # Errors
    ///
    /// Rejects missing policy/recovery evidence, non-retired epochs and
    /// database failures.
    pub async fn plan_retired_epoch_cleanup(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        policy_id: Uuid,
        checkpoint_id: Uuid,
        requested_at: DateTime<Utc>,
    ) -> Result<CleanupPlan, StoreError> {
        let row = sqlx::query(
            "SELECT epoch.retired_at, policy.hot_window_seconds,
                    policy.rollback_window_seconds,
                    recovery.checkpoint_id
             FROM portal_projection.epochs AS epoch
             JOIN portal_projection.retention_lifecycle_policy_snapshots AS policy
               ON policy.policy_id=$4 AND policy.workspace_id=epoch.workspace_id
              AND policy.environment=epoch.environment
             JOIN portal_projection.retention_recovery_checkpoints AS recovery
               ON recovery.checkpoint_id=$5 AND recovery.epoch_id=epoch.epoch_id
             WHERE epoch.epoch_id=$1 AND epoch.workspace_id=$2
               AND epoch.environment=$3 AND epoch.status='RETIRED'",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(policy_id)
        .bind(checkpoint_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(StoreError::CleanupEvidenceMissing)?;
        let retired_at: DateTime<Utc> = row
            .try_get::<Option<DateTime<Utc>>, _>("retired_at")?
            .ok_or(StoreError::CleanupEvidenceMissing)?;
        let hot_seconds: i64 = row.try_get("hot_window_seconds")?;
        let rollback_seconds: i64 = row.try_get("rollback_window_seconds")?;
        let retention_window = TimeDelta::seconds(hot_seconds.max(rollback_seconds));
        let cleanup_not_before = (retired_at + retention_window).max(requested_at);
        let cleanup_run_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.retention_cleanup_runs
             (cleanup_run_id, epoch_id, policy_id, checkpoint_id, status,
              cleanup_not_before, requested_at)
             VALUES ($1,$2,$3,$4,'PLANNED',$5,$6)",
        )
        .bind(cleanup_run_id)
        .bind(epoch_id)
        .bind(policy_id)
        .bind(checkpoint_id)
        .bind(cleanup_not_before)
        .bind(requested_at)
        .execute(&self.pool)
        .await?;
        Ok(CleanupPlan {
            cleanup_run_id,
            epoch_id,
            checkpoint_id,
            cleanup_not_before,
        })
    }

    /// Removes heavy rows for one fully evidenced RETIRED epoch while keeping
    /// epoch, recovery and cleanup audit shells. The whole cleanup is atomic.
    ///
    /// # Errors
    ///
    /// Rejects early/replayed runs, live leases, lifecycle drift and database
    /// failures; the transaction rolls back without partial cleanup.
    pub async fn execute_retired_epoch_cleanup(
        &self,
        cleanup_run_id: Uuid,
        executed_at: DateTime<Utc>,
    ) -> Result<CleanupOutcome, StoreError> {
        let mut transaction = self.pool.begin().await?;
        let row = sqlx::query(
            "SELECT cleanup.epoch_id, cleanup.checkpoint_id, cleanup.cleanup_not_before,
                    cleanup.status, epoch.status AS epoch_status,
                    clock_timestamp() AS database_now
             FROM portal_projection.retention_cleanup_runs AS cleanup
             JOIN portal_projection.epochs AS epoch USING (epoch_id)
             JOIN portal_projection.retention_recovery_checkpoints AS recovery
               ON recovery.checkpoint_id=cleanup.checkpoint_id
              AND recovery.epoch_id=cleanup.epoch_id
             WHERE cleanup.cleanup_run_id=$1 FOR UPDATE OF cleanup, epoch",
        )
        .bind(cleanup_run_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::CleanupRunNotFound)?;
        let epoch_id: Uuid = row.try_get("epoch_id")?;
        let checkpoint_id: Uuid = row.try_get("checkpoint_id")?;
        let cleanup_not_before: DateTime<Utc> = row.try_get("cleanup_not_before")?;
        let database_now: DateTime<Utc> = row.try_get("database_now")?;
        if row.try_get::<String, _>("status")? != "PLANNED"
            || row.try_get::<String, _>("epoch_status")? != "RETIRED"
            || executed_at < cleanup_not_before
            || executed_at > database_now
        {
            return Err(StoreError::CleanupNotReady);
        }
        let live_lease_count: i64 = sqlx::query_scalar(
            "SELECT
               (SELECT count(*) FROM portal_projection.shared_consumer_leases
                WHERE epoch_id=$1 AND expires_at > $2) +
               (SELECT count(*) FROM portal_projection.manager_projection_leases
                WHERE epoch_id=$1 AND expires_at > $2)",
        )
        .bind(epoch_id)
        .bind(executed_at)
        .fetch_one(&mut *transaction)
        .await?;
        if live_lease_count != 0 {
            return Err(StoreError::CleanupLeaseStillActive);
        }
        sqlx::query(
            "UPDATE portal_projection.retention_cleanup_runs
             SET status='RUNNING', started_at=$2 WHERE cleanup_run_id=$1",
        )
        .bind(cleanup_run_id)
        .bind(executed_at)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("SELECT set_config('portal_projection.cleanup_run_id',$1,true)")
            .bind(cleanup_run_id.to_string())
            .execute(&mut *transaction)
            .await?;

        let mut rows_removed = 0_u64;
        for statement in CLEANUP_STATEMENTS {
            rows_removed = rows_removed
                .checked_add(
                    sqlx::query(statement)
                        .bind(epoch_id)
                        .execute(&mut *transaction)
                        .await?
                        .rows_affected(),
                )
                .ok_or(StoreError::NumericOverflow)?;
        }
        let result_digest =
            cleanup_result_digest(cleanup_run_id, epoch_id, checkpoint_id, rows_removed);
        sqlx::query(
            "UPDATE portal_projection.retention_cleanup_runs
             SET status='COMPLETED', completed_at=$2, rows_removed=$3, result_digest=$4
             WHERE cleanup_run_id=$1 AND status='RUNNING'",
        )
        .bind(cleanup_run_id)
        .bind(executed_at)
        .bind(u64_i64(rows_removed)?)
        .bind(&result_digest)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(CleanupOutcome {
            cleanup_run_id,
            epoch_id,
            rows_removed,
            result_digest,
        })
    }
}

fn cleanup_result_digest(
    cleanup_run_id: Uuid,
    epoch_id: Uuid,
    checkpoint_id: Uuid,
    rows_removed: u64,
) -> String {
    let canonical = format!(
        "cleanup_run_id={cleanup_run_id}\nepoch_id={epoch_id}\ncheckpoint_id={checkpoint_id}\nrows_removed={rows_removed}\n"
    );
    format!("sha256:{:x}", Sha256::digest(canonical.as_bytes()))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn duration_i64(value: Duration) -> Result<i64, StoreError> {
    i64::try_from(value.as_secs()).map_err(|_| StoreError::NumericOverflow)
}

fn u64_i64(value: u64) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

fn nonnegative_u64(value: i64) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_777_000_000 + second, 0).unwrap()
    }

    fn policy() -> RetentionLifecyclePolicySnapshot {
        RetentionLifecyclePolicySnapshot {
            policy_id: Uuid::nil(),
            policy_version: "retention-v1".to_owned(),
            policy_digest: format!("sha256:{}", "a".repeat(64)),
            hot_window: Duration::from_secs(86_400),
            rollback_window: Duration::from_secs(3_600),
            storage_budget_bytes: 1_000,
            soft_limit_percent: 70,
            hard_limit_percent: 85,
            max_journal_rows: 100,
            created_at: at(0),
        }
    }

    #[test]
    fn pressure_is_bounded_and_hard_limit_never_silently_compacts_active_truth() {
        let policy = policy();
        let observed = |used_bytes, journal_rows| StorageBudgetObservation {
            used_bytes,
            journal_rows,
            observed_at: at(1),
        };
        assert_eq!(
            evaluate_storage_pressure(&policy, observed(699, 99)),
            StoragePressure::Healthy
        );
        assert_eq!(
            evaluate_storage_pressure(&policy, observed(700, 99)),
            StoragePressure::SoftLimit
        );
        assert_eq!(
            evaluate_storage_pressure(&policy, observed(850, 99)),
            StoragePressure::HardLimit
        );
        assert_eq!(
            evaluate_storage_pressure(&policy, observed(100, 100)),
            StoragePressure::HardLimit
        );
        assert_eq!(
            recovery_directive(StoragePressure::HardLimit, None),
            RecoveryDirective::PauseIngestionAndBuildNewEpoch
        );
    }

    #[test]
    fn gap_and_cursor_expiry_always_require_a_new_building_epoch() {
        for cause in [RecoveryCause::CursorExpired, RecoveryCause::SequenceGap] {
            assert_eq!(
                recovery_directive(StoragePressure::Healthy, Some(cause)),
                RecoveryDirective::PauseIngestionAndBuildNewEpoch
            );
        }
    }

    #[test]
    fn policy_and_recovery_evidence_reject_unsafe_values() {
        let mut invalid = policy();
        invalid.hard_limit_percent = invalid.soft_limit_percent;
        assert!(matches!(
            invalid.validate(),
            Err(StoreError::InvalidRetentionLifecyclePolicy)
        ));
        let evidence = RecoveryCheckpointEvidence {
            checkpoint_id: Uuid::nil(),
            epoch_id: Uuid::nil(),
            through_journal_ordinal: 1,
            through_projection_sequence: 1,
            state_digest: format!("sha256:{}", "b".repeat(64)),
            archive_digest: format!("sha256:{}", "c".repeat(64)),
            encryption_key_digest: format!("sha256:{}", "d".repeat(64)),
            archive_verified_at: at(3),
            restore_verified_at: at(2),
            created_at: at(4),
        };
        assert!(matches!(
            evidence.validate(),
            Err(StoreError::InvalidRecoveryCheckpoint)
        ));
    }
}
