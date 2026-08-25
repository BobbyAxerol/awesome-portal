use std::{collections::BTreeSet, fmt};

use chrono::{DateTime, Utc};
use execution_contracts::SourceCompleteness;
use projection_core::{
    canonical_digest, replay, semantic_state_digest, ProjectionEntityKind, ProjectionEpochStatus,
    ProjectionObservation, ProjectionOperation, ProjectionScope, ReplayRecord,
    SourceSequenceSemantics,
};
use serde::Serialize;
use sha2::{Digest as _, Sha256};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use super::{
    i64_from_u64, required_u64, row_to_entity, EpochWriteAuthority, PgProjectionStore,
    StoreApplyOutcome, StoreError,
};

pub const D4_CONTRACT_REVISION: &str = "d4.paper-read.v1";
pub const D4_SCOPE_ID: &str = "PAPER_BINANCE_USDM";
const MAX_TOKEN_BYTES: usize = 4_096;
const MAX_SNAPSHOT_ROWS: usize = 100_000;
const MAX_EVENT_PAGE_ROWS: usize = 1_000;

#[derive(Clone, PartialEq, Eq)]
pub struct D4SensitiveValue(String);

impl D4SensitiveValue {
    /// Creates an opaque value that is safe to retain only in the encrypted
    /// projection database. Its `Debug` representation is always redacted.
    ///
    /// # Errors
    ///
    /// Rejects empty, oversized or control-character-bearing source values.
    pub fn parse(raw: impl Into<String>) -> Result<Self, StoreError> {
        let raw = raw.into();
        if raw.is_empty() || raw.len() > MAX_TOKEN_BYTES || raw.chars().any(char::is_control) {
            return Err(StoreError::InvalidD4OpaqueValue);
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }

    fn digest(&self) -> String {
        format!("sha256:{:x}", Sha256::digest(self.as_bytes()))
    }

    fn from_database(raw: Vec<u8>) -> Result<Self, StoreError> {
        let raw = String::from_utf8(raw).map_err(|_| StoreError::PersistedD4CursorInvariant)?;
        Self::parse(raw).map_err(|_| StoreError::PersistedD4CursorInvariant)
    }
}

impl fmt::Debug for D4SensitiveValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("D4SensitiveValue([REDACTED])")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct D4ResourceCounts {
    pub orders: usize,
    pub fills: usize,
    pub positions: usize,
}

impl D4ResourceCounts {
    fn validate(self) -> Result<(), StoreError> {
        let total = self
            .orders
            .checked_add(self.fills)
            .and_then(|value| value.checked_add(self.positions))
            .ok_or(StoreError::D4PopulationBoundExceeded)?;
        if total > MAX_SNAPSHOT_ROWS {
            return Err(StoreError::D4PopulationBoundExceeded);
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct D4ProjectionWrite {
    pub stream_key: String,
    pub observation: ProjectionObservation,
}

#[derive(Debug, Clone)]
pub struct D4SnapshotLeaseInput {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub snapshot: D4SensitiveValue,
    pub initial_event_cursor: D4SensitiveValue,
    pub snapshot_digest: String,
    pub snapshot_created_at: DateTime<Utc>,
    pub snapshot_expires_at: DateTime<Utc>,
    pub snapshot_accepted_at: DateTime<Utc>,
    pub expected_counts: D4ResourceCounts,
}

#[derive(Debug, Clone)]
pub struct D4BaselineCommitInput {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub snapshot_digest: String,
    pub observations: Vec<D4ProjectionWrite>,
    pub source_read_at: DateTime<Utc>,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct D4EventPageCommitInput {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub previous_cursor: D4SensitiveValue,
    pub next_cursor: D4SensitiveValue,
    pub observations: Vec<D4ProjectionWrite>,
    pub first_source_sequence: Option<u64>,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: u64,
    pub caught_up: bool,
    pub source_read_at: DateTime<Utc>,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum D4CommitOutcome {
    Written,
    AlreadyDurable,
    RebuildRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum D4ResumePhase {
    SnapshotLeased,
    BaselineCommitted,
    Streaming,
    RebuildRequired,
}

#[derive(Debug, Clone)]
pub struct D4ResumeState {
    pub epoch_id: Uuid,
    pub phase: D4ResumePhase,
    pub snapshot: Option<D4SensitiveValue>,
    pub event_cursor: D4SensitiveValue,
    pub snapshot_digest: String,
    pub snapshot_created_at: DateTime<Utc>,
    pub snapshot_expires_at: DateTime<Utc>,
    pub expected_counts: D4ResourceCounts,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: Option<u64>,
    pub caught_up: bool,
}

/// Payload-free, repeatable-read evidence for one D4 shadow epoch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct D4QualificationSnapshot {
    pub epoch_id: Uuid,
    pub epoch_status: ProjectionEpochStatus,
    pub phase: D4ResumePhase,
    pub expected_counts: D4ResourceCounts,
    pub baseline_applied_counts: Option<D4ResourceCounts>,
    pub current_counts: D4ResourceCounts,
    pub journal_count: u64,
    pub blocker_count: u64,
    pub caught_up: bool,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: Option<u64>,
    pub last_source_read_at: DateTime<Utc>,
    pub state_digest: String,
    pub replay_state_digest: String,
    pub replay_parity: bool,
    pub activation_authorized: bool,
}

impl PgProjectionStore {
    /// Persists the D4 snapshot token and initial event cursor before the first
    /// snapshot page may be requested.
    ///
    /// # Errors
    ///
    /// Rejects a non-Paper scope, non-BUILDING epoch, token/digest mismatch,
    /// incompatible lease collision or database failure.
    pub async fn persist_d4_snapshot_lease(
        &self,
        input: &D4SnapshotLeaseInput,
    ) -> Result<D4CommitOutcome, StoreError> {
        validate_paper_scope(&input.scope)?;
        input.expected_counts.validate()?;
        validate_sha256(&input.snapshot_digest)?;
        if input.snapshot.digest() != input.snapshot_digest
            || input.snapshot_created_at >= input.snapshot_expires_at
            || input.snapshot_accepted_at < input.snapshot_created_at
            || input.snapshot_accepted_at >= input.snapshot_expires_at
        {
            return Err(StoreError::InvalidD4SnapshotLease);
        }

        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            &input.scope,
            input.epoch_id,
            EpochWriteAuthority::BuildingOnly,
        )
        .await?;
        if let Some(row) = sqlx::query(
            "SELECT phase, snapshot_token, snapshot_digest, event_cursor,
                    snapshot_created_at, snapshot_expires_at, snapshot_accepted_at,
                    expected_order_count, expected_fill_count, expected_position_count
             FROM portal_projection.d4_source_checkpoints
             WHERE epoch_id = $1 FOR UPDATE",
        )
        .bind(input.epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        {
            let exact = row.try_get::<String, _>("phase")? == "SNAPSHOT_LEASED"
                && row
                    .try_get::<Option<Vec<u8>>, _>("snapshot_token")?
                    .as_deref()
                    == Some(input.snapshot.as_bytes())
                && row.try_get::<String, _>("snapshot_digest")? == input.snapshot_digest
                && row.try_get::<Vec<u8>, _>("event_cursor")?
                    == input.initial_event_cursor.as_bytes()
                && row.try_get::<DateTime<Utc>, _>("snapshot_created_at")?
                    == input.snapshot_created_at
                && row.try_get::<DateTime<Utc>, _>("snapshot_expires_at")?
                    == input.snapshot_expires_at
                && row.try_get::<DateTime<Utc>, _>("snapshot_accepted_at")?
                    == input.snapshot_accepted_at
                && row_count(&row, "expected_order_count")? == input.expected_counts.orders
                && row_count(&row, "expected_fill_count")? == input.expected_counts.fills
                && row_count(&row, "expected_position_count")? == input.expected_counts.positions;
            if !exact {
                return Err(StoreError::D4SnapshotLeaseCollision);
            }
            transaction.commit().await?;
            return Ok(D4CommitOutcome::AlreadyDurable);
        }

        sqlx::query(
            "INSERT INTO portal_projection.d4_source_checkpoints
             (epoch_id, contract_revision, scope_id, phase, snapshot_token,
              snapshot_digest, snapshot_created_at, snapshot_expires_at,
              snapshot_accepted_at, expected_order_count, expected_fill_count,
              expected_position_count, event_cursor, updated_at)
             VALUES ($1,$2,$3,'SNAPSHOT_LEASED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$8)",
        )
        .bind(input.epoch_id)
        .bind(D4_CONTRACT_REVISION)
        .bind(D4_SCOPE_ID)
        .bind(input.snapshot.as_bytes())
        .bind(&input.snapshot_digest)
        .bind(input.snapshot_created_at)
        .bind(input.snapshot_expires_at)
        .bind(input.snapshot_accepted_at)
        .bind(i64_count(input.expected_counts.orders)?)
        .bind(i64_count(input.expected_counts.fills)?)
        .bind(i64_count(input.expected_counts.positions)?)
        .bind(input.initial_event_cursor.as_bytes())
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(D4CommitOutcome::Written)
    }

    /// Atomically writes the complete D4 baseline and advances the durable
    /// checkpoint from `SNAPSHOT_LEASED` to `BASELINE_COMMITTED`.
    ///
    /// # Errors
    ///
    /// Rejects count/identity drift, duplicate entities, an expired lease,
    /// pre-existing epoch rows or any non-BUILDING write authority.
    #[allow(clippy::too_many_lines)]
    pub async fn commit_d4_baseline(
        &self,
        input: &D4BaselineCommitInput,
    ) -> Result<D4CommitOutcome, StoreError> {
        validate_paper_scope(&input.scope)?;
        validate_sha256(&input.snapshot_digest)?;
        if input.observations.len() > MAX_SNAPSHOT_ROWS || input.source_read_at > input.committed_at
        {
            return Err(StoreError::InvalidD4Baseline);
        }
        let baseline_digest = baseline_digest(input)?;
        let mut transaction = self.pool.begin().await?;
        let mut sequence = self
            .lock_epoch_tx(
                &mut transaction,
                &input.scope,
                input.epoch_id,
                EpochWriteAuthority::BuildingOnly,
            )
            .await?;
        let checkpoint = sqlx::query(
            "SELECT * FROM portal_projection.d4_source_checkpoints
             WHERE epoch_id = $1 FOR UPDATE",
        )
        .bind(input.epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::D4SnapshotLeaseNotFound)?;
        let phase: String = checkpoint.try_get("phase")?;
        if matches!(phase.as_str(), "BASELINE_COMMITTED" | "STREAMING") {
            if checkpoint
                .try_get::<Option<String>, _>("baseline_digest")?
                .as_deref()
                == Some(&baseline_digest)
            {
                transaction.commit().await?;
                return Ok(D4CommitOutcome::AlreadyDurable);
            }
            return Err(StoreError::D4BaselineCollision);
        }
        if phase != "SNAPSHOT_LEASED"
            || checkpoint.try_get::<String, _>("snapshot_digest")? != input.snapshot_digest
            || input.committed_at
                >= checkpoint.try_get::<DateTime<Utc>, _>("snapshot_expires_at")?
        {
            return Err(StoreError::InvalidD4Baseline);
        }
        let expected = D4ResourceCounts {
            orders: row_count(&checkpoint, "expected_order_count")?,
            fills: row_count(&checkpoint, "expected_fill_count")?,
            positions: row_count(&checkpoint, "expected_position_count")?,
        };
        validate_baseline_observations(&input.observations, expected)?;
        validate_epoch_observation_identity(&mut transaction, input.epoch_id, &input.observations)
            .await?;
        let existing_rows: i64 = sqlx::query_scalar(
            "SELECT
               (SELECT count(*) FROM portal_projection.entities WHERE epoch_id = $1)
               +
               (SELECT count(*) FROM portal_projection.event_journal WHERE epoch_id = $1)",
        )
        .bind(input.epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        if existing_rows != 0 || sequence != 0 {
            return Err(StoreError::D4BaselineEpochNotEmpty);
        }
        for write in &input.observations {
            let outcome = self
                .apply_observation_locked_tx(
                    &mut transaction,
                    &input.scope,
                    input.epoch_id,
                    &mut sequence,
                    &write.stream_key,
                    &write.observation,
                    input.committed_at,
                )
                .await?;
            if !matches!(outcome, StoreApplyOutcome::Applied { .. }) {
                return Err(StoreError::D4AtomicBatchRejected);
            }
        }
        sqlx::query(
            "UPDATE portal_projection.d4_source_checkpoints
             SET phase = 'BASELINE_COMMITTED', snapshot_token = NULL,
                 baseline_digest = $2, applied_order_count = expected_order_count,
                 applied_fill_count = expected_fill_count,
                 applied_position_count = expected_position_count,
                 baseline_source_read_at = $3, baseline_committed_at = $4,
                 updated_at = $4
             WHERE epoch_id = $1",
        )
        .bind(input.epoch_id)
        .bind(&baseline_digest)
        .bind(input.source_read_at)
        .bind(input.committed_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(D4CommitOutcome::Written)
    }

    /// Atomically applies one complete D4 event page and advances its opaque
    /// cursor only after every projection write succeeds.
    ///
    /// # Errors
    ///
    /// Rejects cursor drift, invalid global ordering, oversized pages,
    /// incompatible observations or non-BUILDING epoch authority. A proven
    /// global gap marks the current epoch `FAILED` and returns
    /// [`D4CommitOutcome::RebuildRequired`].
    #[allow(clippy::too_many_lines)]
    pub async fn commit_d4_event_page(
        &self,
        input: &D4EventPageCommitInput,
    ) -> Result<D4CommitOutcome, StoreError> {
        validate_paper_scope(&input.scope)?;
        validate_event_page(input)?;
        let page_digest = event_page_digest(input)?;
        let mut transaction = self.pool.begin().await?;
        let mut sequence = self
            .lock_epoch_tx(
                &mut transaction,
                &input.scope,
                input.epoch_id,
                EpochWriteAuthority::BuildingOnly,
            )
            .await?;
        let checkpoint = sqlx::query(
            "SELECT * FROM portal_projection.d4_source_checkpoints
             WHERE epoch_id = $1 FOR UPDATE",
        )
        .bind(input.epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::D4SnapshotLeaseNotFound)?;
        let phase: String = checkpoint.try_get("phase")?;
        let persisted_cursor: Vec<u8> = checkpoint.try_get("event_cursor")?;
        if persisted_cursor == input.next_cursor.as_bytes()
            && checkpoint
                .try_get::<Option<String>, _>("last_event_page_digest")?
                .as_deref()
                == Some(&page_digest)
        {
            transaction.commit().await?;
            return Ok(D4CommitOutcome::AlreadyDurable);
        }
        if !matches!(phase.as_str(), "BASELINE_COMMITTED" | "STREAMING")
            || persisted_cursor != input.previous_cursor.as_bytes()
        {
            return Err(StoreError::D4CursorMismatch);
        }
        validate_epoch_observation_identity(&mut transaction, input.epoch_id, &input.observations)
            .await?;
        let previous_sequence = checkpoint
            .try_get::<Option<i64>, _>("last_source_sequence")?
            .map(required_u64)
            .transpose()?;
        let previous_head = checkpoint
            .try_get::<Option<i64>, _>("source_head_sequence")?
            .map(required_u64)
            .transpose()?;
        let previous_caught_up: bool = checkpoint.try_get("caught_up")?;
        let continuity_anchor = previous_sequence.or_else(|| {
            previous_caught_up
                .then_some(previous_head)
                .flatten()
                .filter(|sequence| *sequence > 0)
        });
        if let Some(reason) = global_sequence_failure(continuity_anchor, input) {
            mark_rebuild_required(
                &mut transaction,
                input.epoch_id,
                reason,
                continuity_anchor,
                input.first_source_sequence,
                &page_digest,
                input.committed_at,
            )
            .await?;
            transaction.commit().await?;
            return Ok(D4CommitOutcome::RebuildRequired);
        }
        for write in &input.observations {
            let outcome = self
                .apply_observation_locked_tx(
                    &mut transaction,
                    &input.scope,
                    input.epoch_id,
                    &mut sequence,
                    &write.stream_key,
                    &write.observation,
                    input.committed_at,
                )
                .await?;
            if !matches!(
                outcome,
                StoreApplyOutcome::Applied { .. } | StoreApplyOutcome::Refreshed { .. }
            ) {
                return Err(StoreError::D4AtomicBatchRejected);
            }
        }
        sqlx::query(
            "UPDATE portal_projection.d4_source_checkpoints
             SET phase = 'STREAMING', event_cursor = $2,
                 last_event_page_digest = $3,
                 last_source_sequence = COALESCE($4, last_source_sequence),
                 source_head_sequence = $5, caught_up = $6,
                 last_event_source_read_at = $7, last_event_committed_at = $8,
                 updated_at = $8
             WHERE epoch_id = $1",
        )
        .bind(input.epoch_id)
        .bind(input.next_cursor.as_bytes())
        .bind(&page_digest)
        .bind(input.last_source_sequence.map(i64_from_u64).transpose()?)
        .bind(i64_from_u64(input.source_head_sequence)?)
        .bind(input.caught_up)
        .bind(input.source_read_at)
        .bind(input.committed_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(D4CommitOutcome::Written)
    }

    /// Loads the minimum encrypted checkpoint needed to resume a D4 writer.
    /// The returned token/cursor remain redacted under `Debug`.
    ///
    /// # Errors
    ///
    /// Rejects unknown epochs, scope drift or malformed persisted state. A
    /// failed epoch is readable only when its checkpoint is explicitly
    /// `REBUILD_REQUIRED`; it never becomes writable again.
    pub async fn load_d4_resume_state(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
    ) -> Result<D4ResumeState, StoreError> {
        validate_paper_scope(scope)?;
        let mut transaction = self.pool.begin().await?;
        let row = sqlx::query(
            "SELECT checkpoint.*, epoch.workspace_id, epoch.environment,
                    epoch.status AS epoch_status
             FROM portal_projection.d4_source_checkpoints AS checkpoint
             JOIN portal_projection.epochs AS epoch USING (epoch_id)
             WHERE checkpoint.epoch_id = $1
             FOR SHARE OF checkpoint, epoch",
        )
        .bind(epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::D4SnapshotLeaseNotFound)?;
        if row.try_get::<String, _>("workspace_id")? != scope.workspace_id.as_str()
            || row.try_get::<String, _>("environment")? != scope.environment
            || row.try_get::<String, _>("contract_revision")? != D4_CONTRACT_REVISION
            || row.try_get::<String, _>("scope_id")? != D4_SCOPE_ID
        {
            return Err(StoreError::ScopeMismatch);
        }
        let persisted_phase: String = row.try_get("phase")?;
        let phase = match persisted_phase.as_str() {
            "SNAPSHOT_LEASED" => D4ResumePhase::SnapshotLeased,
            "BASELINE_COMMITTED" => D4ResumePhase::BaselineCommitted,
            "STREAMING" => D4ResumePhase::Streaming,
            "REBUILD_REQUIRED" => D4ResumePhase::RebuildRequired,
            _ => return Err(StoreError::PersistedVocabulary),
        };
        let epoch_status: String = row.try_get("epoch_status")?;
        if !matches!(
            (epoch_status.as_str(), phase),
            (
                "BUILDING",
                D4ResumePhase::SnapshotLeased
                    | D4ResumePhase::BaselineCommitted
                    | D4ResumePhase::Streaming
            ) | ("FAILED", D4ResumePhase::RebuildRequired)
        ) {
            return Err(StoreError::PersistedD4CheckpointInvariant);
        }
        let snapshot = row
            .try_get::<Option<Vec<u8>>, _>("snapshot_token")?
            .map(D4SensitiveValue::from_database)
            .transpose()?;
        let state = D4ResumeState {
            epoch_id,
            phase,
            snapshot,
            event_cursor: D4SensitiveValue::from_database(row.try_get("event_cursor")?)?,
            snapshot_digest: row.try_get("snapshot_digest")?,
            snapshot_created_at: row.try_get("snapshot_created_at")?,
            snapshot_expires_at: row.try_get("snapshot_expires_at")?,
            expected_counts: D4ResourceCounts {
                orders: row_count(&row, "expected_order_count")?,
                fills: row_count(&row, "expected_fill_count")?,
                positions: row_count(&row, "expected_position_count")?,
            },
            last_source_sequence: row
                .try_get::<Option<i64>, _>("last_source_sequence")?
                .map(required_u64)
                .transpose()?,
            source_head_sequence: row
                .try_get::<Option<i64>, _>("source_head_sequence")?
                .map(required_u64)
                .transpose()?,
            caught_up: row.try_get("caught_up")?,
        };
        transaction.commit().await?;
        Ok(state)
    }

    /// Captures a repeatable-read, payload-free D4 qualification snapshot.
    ///
    /// The method recomputes both visible-state and immutable-journal replay
    /// digests in the same transaction. It never queries an ACTIVE epoch and
    /// never changes lifecycle or delivery authority.
    ///
    /// # Errors
    ///
    /// Rejects scope drift, a non-BUILDING epoch, malformed persisted state,
    /// replay divergence or database failures.
    #[allow(clippy::too_many_lines)] // one repeatable-read transaction owns the evidence boundary
    pub async fn load_d4_qualification_snapshot(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
    ) -> Result<D4QualificationSnapshot, StoreError> {
        validate_paper_scope(scope)?;
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *transaction)
            .await?;
        let checkpoint = sqlx::query(
            "SELECT checkpoint.*, epoch.workspace_id, epoch.environment,
                    epoch.status AS epoch_status
             FROM portal_projection.d4_source_checkpoints AS checkpoint
             JOIN portal_projection.epochs AS epoch USING (epoch_id)
             WHERE checkpoint.epoch_id = $1",
        )
        .bind(epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::D4SnapshotLeaseNotFound)?;
        if checkpoint.try_get::<String, _>("workspace_id")? != scope.workspace_id.as_str()
            || checkpoint.try_get::<String, _>("environment")? != scope.environment
            || checkpoint.try_get::<String, _>("contract_revision")? != D4_CONTRACT_REVISION
            || checkpoint.try_get::<String, _>("scope_id")? != D4_SCOPE_ID
        {
            return Err(StoreError::ScopeMismatch);
        }
        let epoch_status = match checkpoint.try_get::<String, _>("epoch_status")?.as_str() {
            "BUILDING" => ProjectionEpochStatus::Building,
            "FAILED" => ProjectionEpochStatus::Failed,
            _ => return Err(StoreError::EpochNotBuilding),
        };
        let phase = match checkpoint.try_get::<String, _>("phase")?.as_str() {
            "SNAPSHOT_LEASED" => D4ResumePhase::SnapshotLeased,
            "BASELINE_COMMITTED" => D4ResumePhase::BaselineCommitted,
            "STREAMING" => D4ResumePhase::Streaming,
            "REBUILD_REQUIRED" => D4ResumePhase::RebuildRequired,
            _ => return Err(StoreError::PersistedVocabulary),
        };
        if epoch_status != ProjectionEpochStatus::Building {
            return Err(StoreError::EpochNotBuilding);
        }

        let expected_counts = D4ResourceCounts {
            orders: row_count(&checkpoint, "expected_order_count")?,
            fills: row_count(&checkpoint, "expected_fill_count")?,
            positions: row_count(&checkpoint, "expected_position_count")?,
        };
        let baseline_applied_counts = match (
            checkpoint.try_get::<Option<i64>, _>("applied_order_count")?,
            checkpoint.try_get::<Option<i64>, _>("applied_fill_count")?,
            checkpoint.try_get::<Option<i64>, _>("applied_position_count")?,
        ) {
            (Some(orders), Some(fills), Some(positions)) => Some(D4ResourceCounts {
                orders: usize::try_from(orders).map_err(|_| StoreError::NumericOverflow)?,
                fills: usize::try_from(fills).map_err(|_| StoreError::NumericOverflow)?,
                positions: usize::try_from(positions).map_err(|_| StoreError::NumericOverflow)?,
            }),
            (None, None, None) => None,
            _ => return Err(StoreError::PersistedD4CheckpointInvariant),
        };
        let count_row = sqlx::query(
            "SELECT
               count(*) FILTER (WHERE entity_kind = 'ORDER') AS orders,
               count(*) FILTER (WHERE entity_kind = 'FILL') AS fills,
               count(*) FILTER (WHERE entity_kind = 'POSITION') AS positions
             FROM portal_projection.entities WHERE epoch_id = $1",
        )
        .bind(epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        let current_counts = D4ResourceCounts {
            orders: row_count(&count_row, "orders")?,
            fills: row_count(&count_row, "fills")?,
            positions: row_count(&count_row, "positions")?,
        };
        let entity_rows = sqlx::query(
            "SELECT * FROM portal_projection.entities
             WHERE epoch_id = $1 ORDER BY entity_kind, entity_id",
        )
        .bind(epoch_id)
        .fetch_all(&mut *transaction)
        .await?;
        let entities = entity_rows
            .iter()
            .map(row_to_entity)
            .collect::<Result<Vec<_>, _>>()?;
        let state_digest = semantic_state_digest(&entities)?;

        let journal_rows = sqlx::query(
            "SELECT journal_ordinal, observation, projected_at
             FROM portal_projection.event_journal
             WHERE epoch_id = $1 ORDER BY journal_ordinal",
        )
        .bind(epoch_id)
        .fetch_all(&mut *transaction)
        .await?;
        let replay_records = journal_rows
            .iter()
            .map(|row| {
                let observation =
                    serde_json::from_value(row.try_get::<serde_json::Value, _>("observation")?)
                        .map_err(|_| StoreError::Serialization)?;
                Ok(ReplayRecord {
                    journal_ordinal: required_u64(row.try_get("journal_ordinal")?)?,
                    observation,
                    projected_at: row.try_get("projected_at")?,
                })
            })
            .collect::<Result<Vec<_>, StoreError>>()?;
        let journal_count =
            u64::try_from(replay_records.len()).map_err(|_| StoreError::NumericOverflow)?;
        let replay_state_digest = replay(scope.clone(), epoch_id, replay_records)?.state_digest;
        let blocker_count: i64 = sqlx::query_scalar(
            "SELECT
               (SELECT count(*) FROM portal_projection.dead_letters
                WHERE epoch_id = $1 AND status IN ('OPEN','REPLAYING'))
               +
               (SELECT count(*) FROM portal_projection.gaps
                WHERE epoch_id = $1 AND resolved_at IS NULL)
               +
               (SELECT count(*) FROM portal_projection.d4_source_failures
                WHERE epoch_id = $1)",
        )
        .bind(epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        let last_source_read_at = checkpoint
            .try_get::<Option<DateTime<Utc>>, _>("last_event_source_read_at")?
            .or(checkpoint.try_get("baseline_source_read_at")?)
            .unwrap_or(checkpoint.try_get("snapshot_accepted_at")?);
        let snapshot = D4QualificationSnapshot {
            epoch_id,
            epoch_status,
            phase,
            expected_counts,
            baseline_applied_counts,
            current_counts,
            journal_count,
            blocker_count: required_u64(blocker_count)?,
            caught_up: checkpoint.try_get("caught_up")?,
            last_source_sequence: checkpoint
                .try_get::<Option<i64>, _>("last_source_sequence")?
                .map(required_u64)
                .transpose()?,
            source_head_sequence: checkpoint
                .try_get::<Option<i64>, _>("source_head_sequence")?
                .map(required_u64)
                .transpose()?,
            last_source_read_at,
            replay_parity: state_digest == replay_state_digest,
            state_digest,
            replay_state_digest,
            activation_authorized: false,
        };
        transaction.commit().await?;
        Ok(snapshot)
    }
}

fn validate_paper_scope(scope: &ProjectionScope) -> Result<(), StoreError> {
    if scope.environment != "paper" {
        return Err(StoreError::D4PaperScopeRequired);
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), StoreError> {
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(StoreError::InvalidD4Digest);
    }
    Ok(())
}

fn i64_count(value: usize) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

fn row_count(row: &sqlx::postgres::PgRow, column: &str) -> Result<usize, StoreError> {
    usize::try_from(row.try_get::<i64, _>(column)?).map_err(|_| StoreError::NumericOverflow)
}

fn validate_stream_key(value: &str) -> Result<(), StoreError> {
    if value.is_empty() || value.len() > 128 || value.trim() != value {
        return Err(StoreError::InvalidStreamKey);
    }
    Ok(())
}

fn expected_stream_key(kind: ProjectionEntityKind) -> Option<&'static str> {
    match kind {
        ProjectionEntityKind::Order => Some("d4:paper_binance_usdm:orders"),
        ProjectionEntityKind::Fill => Some("d4:paper_binance_usdm:fills"),
        ProjectionEntityKind::Position => Some("d4:paper_binance_usdm:positions"),
        _ => None,
    }
}

fn stream_matches_entity(write: &D4ProjectionWrite) -> bool {
    expected_stream_key(write.observation.entity.kind)
        .is_some_and(|expected| write.stream_key == expected)
}

fn validate_baseline_observations(
    writes: &[D4ProjectionWrite],
    expected: D4ResourceCounts,
) -> Result<(), StoreError> {
    expected.validate()?;
    if writes.len() != expected.orders + expected.fills + expected.positions {
        return Err(StoreError::D4PopulationMismatch);
    }
    let mut observed = D4ResourceCounts {
        orders: 0,
        fills: 0,
        positions: 0,
    };
    let mut entities = BTreeSet::new();
    let mut ingestions = BTreeSet::new();
    for write in writes {
        validate_stream_key(&write.stream_key)?;
        write.observation.validate()?;
        if write.observation.operation != ProjectionOperation::Upsert
            || write.observation.source_sequence.is_some()
            || write.observation.source_sequence_semantics
                != SourceSequenceSemantics::PerEntityContiguous
            || write.observation.source_completeness != SourceCompleteness::PollBounded
            || !stream_matches_entity(write)
            || !entities.insert(write.observation.entity.clone())
            || !ingestions.insert(write.observation.ingestion_id.clone())
        {
            return Err(StoreError::InvalidD4Baseline);
        }
        match write.observation.entity.kind {
            ProjectionEntityKind::Order => observed.orders += 1,
            ProjectionEntityKind::Fill => observed.fills += 1,
            ProjectionEntityKind::Position => observed.positions += 1,
            _ => return Err(StoreError::InvalidD4Baseline),
        }
    }
    if observed != expected {
        return Err(StoreError::D4PopulationMismatch);
    }
    Ok(())
}

fn validate_event_page(input: &D4EventPageCommitInput) -> Result<(), StoreError> {
    if input.observations.len() > MAX_EVENT_PAGE_ROWS || input.source_read_at > input.committed_at {
        return Err(StoreError::InvalidD4EventPage);
    }
    if input.observations.is_empty()
        != (input.first_source_sequence.is_none() && input.last_source_sequence.is_none())
        || input.first_source_sequence.is_some() != input.last_source_sequence.is_some()
        || (input.observations.is_empty() && !input.caught_up)
    {
        return Err(StoreError::InvalidD4EventPage);
    }
    let mut ingestions = BTreeSet::new();
    let mut previous = None;
    for write in &input.observations {
        validate_stream_key(&write.stream_key)?;
        write.observation.validate()?;
        let source_sequence = write
            .observation
            .source_sequence
            .and_then(|value| u64::try_from(value).ok())
            .ok_or(StoreError::InvalidD4EventPage)?;
        if write.observation.source_sequence_semantics
            != SourceSequenceSemantics::GlobalStreamMonotonic
            || write.observation.source_completeness != SourceCompleteness::EventSourced
            || !stream_matches_entity(write)
            || !matches!(
                write.observation.entity.kind,
                ProjectionEntityKind::Order
                    | ProjectionEntityKind::Fill
                    | ProjectionEntityKind::Position
            )
            || !ingestions.insert(write.observation.ingestion_id.clone())
            || previous.is_some_and(|value| source_sequence != value + 1)
        {
            return Err(StoreError::InvalidD4EventPage);
        }
        previous = Some(source_sequence);
    }
    if input.first_source_sequence
        != input.observations.first().and_then(|write| {
            write
                .observation
                .source_sequence
                .and_then(|value| u64::try_from(value).ok())
        })
        || input.last_source_sequence != previous
    {
        return Err(StoreError::InvalidD4EventPage);
    }
    if let Some(last) = input.last_source_sequence {
        if last > input.source_head_sequence
            || (input.caught_up && last != input.source_head_sequence)
            || (!input.caught_up && last >= input.source_head_sequence)
        {
            return Err(StoreError::InvalidD4EventPage);
        }
    }
    Ok(())
}

async fn validate_epoch_observation_identity(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    writes: &[D4ProjectionWrite],
) -> Result<(), StoreError> {
    let row = sqlx::query(
        "SELECT adapter_version, capability_snapshot_id
         FROM portal_projection.epochs WHERE epoch_id = $1",
    )
    .bind(epoch_id)
    .fetch_one(&mut **transaction)
    .await?;
    let adapter_version: String = row.try_get("adapter_version")?;
    let capability_snapshot_id: String = row.try_get("capability_snapshot_id")?;
    if writes.iter().any(|write| {
        write.observation.adapter_version != adapter_version
            || write.observation.capability_snapshot_id != capability_snapshot_id
    }) {
        return Err(StoreError::D4CompatibilityIdentityMismatch);
    }
    Ok(())
}

fn baseline_digest(input: &D4BaselineCommitInput) -> Result<String, StoreError> {
    let values = input
        .observations
        .iter()
        .map(|write| (&write.stream_key, &write.observation))
        .collect::<Vec<_>>();
    canonical_digest(&(
        D4_CONTRACT_REVISION,
        D4_SCOPE_ID,
        &input.snapshot_digest,
        input.source_read_at,
        values,
    ))
    .map_err(StoreError::from)
}

fn event_page_digest(input: &D4EventPageCommitInput) -> Result<String, StoreError> {
    let values = input
        .observations
        .iter()
        .map(|write| (&write.stream_key, &write.observation))
        .collect::<Vec<_>>();
    canonical_digest(&(
        D4_CONTRACT_REVISION,
        D4_SCOPE_ID,
        input.previous_cursor.digest(),
        input.next_cursor.digest(),
        input.first_source_sequence,
        input.last_source_sequence,
        input.source_head_sequence,
        input.caught_up,
        input.source_read_at,
        values,
    ))
    .map_err(StoreError::from)
}

fn global_sequence_failure(
    previous: Option<u64>,
    input: &D4EventPageCommitInput,
) -> Option<&'static str> {
    match (previous, input.first_source_sequence) {
        (Some(previous), Some(first)) if first == previous.saturating_add(1) => None,
        (Some(previous), Some(first)) if first <= previous => Some("GLOBAL_SEQUENCE_REGRESSION"),
        (Some(_), Some(_)) => Some("GLOBAL_SEQUENCE_GAP"),
        (Some(previous), None) if input.source_head_sequence > previous => {
            Some("GLOBAL_SEQUENCE_GAP")
        }
        (Some(previous), None) if input.source_head_sequence < previous => {
            Some("GLOBAL_SEQUENCE_REGRESSION")
        }
        _ => None,
    }
}

async fn mark_rebuild_required(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    reason: &'static str,
    previous: Option<u64>,
    observed: Option<u64>,
    page_digest: &str,
    detected_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO portal_projection.d4_source_failures
         (failure_id, epoch_id, reason_code, previous_source_sequence,
          observed_source_sequence, page_digest, detected_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(Uuid::now_v7())
    .bind(epoch_id)
    .bind(reason)
    .bind(previous.map(i64_from_u64).transpose()?)
    .bind(observed.map(i64_from_u64).transpose()?)
    .bind(page_digest)
    .bind(detected_at)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "UPDATE portal_projection.d4_source_checkpoints
         SET phase = 'REBUILD_REQUIRED', updated_at = $2 WHERE epoch_id = $1",
    )
    .bind(epoch_id)
    .bind(detected_at)
    .execute(&mut **transaction)
    .await?;
    sqlx::query("UPDATE portal_projection.epochs SET status = 'FAILED' WHERE epoch_id = $1")
        .bind(epoch_id)
        .execute(&mut **transaction)
        .await?;
    Ok(())
}
