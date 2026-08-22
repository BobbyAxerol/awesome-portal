#![forbid(unsafe_code)]

use std::{str::FromStr as _, time::Duration};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use projection_core::{
    canonical_digest, semantic_state_digest, ApplyDisposition, FreshnessPolicy, ProjectedEntity,
    ProjectionEntityKey, ProjectionEntityKind, ProjectionError, ProjectionObservation,
    ProjectionReducer, ProjectionScope, ReplayRecord, SnapshotCompleteness,
};
use sqlx::{postgres::PgPoolOptions, PgPool, Postgres, Row, Transaction};
use thiserror::Error;
use uuid::Uuid;

mod analytics_repository;
mod query;
mod realtime;

pub use analytics_repository::{
    analytics_facts_digest, AnalyticsFactDigestInput, AnalyticsReadRequirement, AnalyticsSourceRead,
};
pub use query::{RetentionPolicySnapshot, SeriesPointWrite};
pub use realtime::{
    RealtimeActiveEpochWatermark, RealtimeEpochAvailability, RealtimeJournalPage,
    RealtimeJournalRecord, RealtimeScopeAvailability,
};

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!();

#[derive(Debug, Clone)]
pub struct EpochMetadata {
    pub adapter_version: String,
    pub source_gateway_digest: String,
    pub capability_snapshot_id: String,
}

impl EpochMetadata {
    fn validate(&self) -> Result<(), StoreError> {
        if self.adapter_version.trim().is_empty()
            || !self.source_gateway_digest.starts_with("sha256:")
            || self.capability_snapshot_id.trim().is_empty()
        {
            return Err(StoreError::InvalidEpochMetadata);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreApplyOutcome {
    Applied { sequence: u64 },
    Refreshed { sequence: u64 },
    GapApplied { sequence: u64 },
    Duplicate { sequence: Option<u64> },
    OutOfOrder,
    DeadLettered { reason_code: &'static str },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivatedEpoch {
    pub active_epoch_id: Uuid,
    pub retained_previous_epoch_id: Option<Uuid>,
    pub overlap_until: DateTime<Utc>,
    pub state_digest: String,
}

#[derive(Clone)]
pub struct PgProjectionStore {
    pool: PgPool,
}

impl PgProjectionStore {
    /// Connects to the Portal-owned projection `PostgreSQL` database.
    ///
    /// # Errors
    ///
    /// Returns a database error when the bounded pool cannot connect.
    pub async fn connect(database_url: &str) -> Result<Self, StoreError> {
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .min_connections(0)
            .acquire_timeout(Duration::from_secs(3))
            .idle_timeout(Duration::from_secs(60))
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    /// Applies embedded expand-compatible projection migrations.
    ///
    /// # Errors
    ///
    /// Returns the migration error without starting projection ingestion.
    pub async fn migrate(&self) -> Result<(), StoreError> {
        MIGRATOR.run(&self.pool).await?;
        Ok(())
    }

    /// Probes only the Portal projection database.
    ///
    /// # Errors
    ///
    /// Returns a database error if the connection cannot execute a bounded
    /// constant query.
    pub async fn ping(&self) -> Result<(), StoreError> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }

    /// Creates a BUILDING epoch. It cannot become query authority until parity
    /// activation succeeds.
    ///
    /// # Errors
    ///
    /// Rejects invalid compatibility metadata or database constraint failures.
    pub async fn create_building_epoch(
        &self,
        scope: &ProjectionScope,
        metadata: &EpochMetadata,
        created_at: DateTime<Utc>,
    ) -> Result<Uuid, StoreError> {
        metadata.validate()?;
        let epoch_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.epochs
             (epoch_id, workspace_id, environment, status, adapter_version,
              source_gateway_digest, capability_snapshot_id, created_at)
             VALUES ($1, $2, $3, 'BUILDING', $4, $5, $6, $7)",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&metadata.adapter_version)
        .bind(&metadata.source_gateway_digest)
        .bind(&metadata.capability_snapshot_id)
        .bind(created_at)
        .execute(&self.pool)
        .await?;
        Ok(epoch_id)
    }

    /// Applies one source observation atomically with its idempotency key,
    /// current entity, checkpoint, journal and any gap record.
    ///
    /// # Errors
    ///
    /// Returns an error for an unknown epoch, wrong scope or database failure.
    /// Ambiguous reducer input is committed as a redacted dead letter and
    /// returned as [`StoreApplyOutcome::DeadLettered`].
    #[allow(clippy::too_many_lines)] // one database transaction keeps all six writes atomic
    pub async fn apply_observation(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        stream_key: &str,
        observation: &ProjectionObservation,
        projected_at: DateTime<Utc>,
    ) -> Result<StoreApplyOutcome, StoreError> {
        if stream_key.trim().is_empty() {
            return Err(StoreError::InvalidStreamKey);
        }
        observation.validate()?;
        let input_digest = canonical_digest(observation)?;
        let mut transaction = self.pool.begin().await?;

        if let Some(row) = sqlx::query(
            "SELECT input_digest, projection_sequence
             FROM portal_projection.ingestion_keys
             WHERE epoch_id = $1 AND ingestion_id = $2",
        )
        .bind(epoch_id)
        .bind(observation.ingestion_id.as_str())
        .fetch_optional(&mut *transaction)
        .await?
        {
            let previous_digest: String = row.try_get("input_digest")?;
            if previous_digest == input_digest {
                let sequence = optional_u64(row.try_get::<Option<i64>, _>("projection_sequence")?)?;
                transaction.commit().await?;
                return Ok(StoreApplyOutcome::Duplicate { sequence });
            }
            let outcome = dead_letter(
                &mut transaction,
                epoch_id,
                observation,
                &input_digest,
                "IDEMPOTENCY_COLLISION",
                projected_at,
            )
            .await?;
            transaction.commit().await?;
            return Ok(outcome);
        }

        let epoch = sqlx::query(
            "SELECT workspace_id, environment, status, next_projection_sequence
             FROM portal_projection.epochs
             WHERE epoch_id = $1
             FOR UPDATE",
        )
        .bind(epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::EpochNotFound)?;
        if epoch.try_get::<String, _>("workspace_id")? != scope.workspace_id.as_str()
            || epoch.try_get::<String, _>("environment")? != scope.environment.as_str()
        {
            return Err(StoreError::ScopeMismatch);
        }
        let status: String = epoch.try_get("status")?;
        if !matches!(status.as_str(), "BUILDING" | "ACTIVE") {
            return Err(StoreError::EpochNotWritable);
        }
        let current_sequence = required_u64(epoch.try_get("next_projection_sequence")?)?;
        let current = self
            .load_entity_tx(&mut transaction, epoch_id, &observation.entity, true)
            .await?;
        let mut reducer =
            ProjectionReducer::from_current(scope.clone(), epoch_id, current_sequence, current)?;
        let disposition = match reducer.apply(observation.clone(), projected_at) {
            Ok(disposition) => disposition,
            Err(error) => {
                let reason = reducer_reason_code(&error);
                let outcome = dead_letter(
                    &mut transaction,
                    epoch_id,
                    observation,
                    &input_digest,
                    reason,
                    projected_at,
                )
                .await?;
                insert_ingestion(
                    &mut transaction,
                    epoch_id,
                    observation.ingestion_id.as_str(),
                    &input_digest,
                    "DEAD_LETTERED",
                    None,
                    projected_at,
                )
                .await?;
                transaction.commit().await?;
                return Ok(outcome);
            }
        };

        let (outcome_name, projection_sequence) = match disposition {
            ApplyDisposition::Applied { sequence } => ("APPLIED", Some(sequence)),
            ApplyDisposition::Refreshed { sequence } => ("REFRESHED", Some(sequence)),
            ApplyDisposition::GapApplied { sequence } => ("GAP_APPLIED", Some(sequence)),
            ApplyDisposition::OutOfOrder => ("OUT_OF_ORDER", None),
            ApplyDisposition::Duplicate => {
                return Err(StoreError::ReducerDatabaseInvariant);
            }
        };
        insert_ingestion(
            &mut transaction,
            epoch_id,
            observation.ingestion_id.as_str(),
            &input_digest,
            outcome_name,
            projection_sequence,
            projected_at,
        )
        .await?;
        insert_journal(
            &mut transaction,
            epoch_id,
            observation,
            &input_digest,
            outcome_name,
            projection_sequence,
            projected_at,
        )
        .await?;

        if let Some(sequence) = projection_sequence {
            let entity = reducer
                .entities()
                .get(&observation.entity)
                .ok_or(StoreError::ReducerDatabaseInvariant)?;
            upsert_entity(&mut transaction, entity).await?;
            sqlx::query(
                "UPDATE portal_projection.epochs
                 SET next_projection_sequence = $2
                 WHERE epoch_id = $1",
            )
            .bind(epoch_id)
            .bind(i64_from_u64(sequence)?)
            .execute(&mut *transaction)
            .await?;
            upsert_checkpoint(
                &mut transaction,
                epoch_id,
                stream_key,
                observation,
                sequence,
                projected_at,
            )
            .await?;
            if let Some(gap) = reducer.gaps().last() {
                insert_gap(&mut transaction, epoch_id, gap, projected_at).await?;
            }
        }
        transaction.commit().await?;
        Ok(match disposition {
            ApplyDisposition::Applied { sequence } => StoreApplyOutcome::Applied { sequence },
            ApplyDisposition::Refreshed { sequence } => StoreApplyOutcome::Refreshed { sequence },
            ApplyDisposition::GapApplied { sequence } => StoreApplyOutcome::GapApplied { sequence },
            ApplyDisposition::OutOfOrder => StoreApplyOutcome::OutOfOrder,
            ApplyDisposition::Duplicate => unreachable!("database owns duplicate detection"),
        })
    }

    /// Loads one current entity from a named epoch.
    ///
    /// # Errors
    ///
    /// Returns a database or persisted-contract error.
    pub async fn load_entity(
        &self,
        epoch_id: Uuid,
        entity: &ProjectionEntityKey,
    ) -> Result<Option<ProjectedEntity>, StoreError> {
        let mut transaction = self.pool.begin().await?;
        let entity = self
            .load_entity_tx(&mut transaction, epoch_id, entity, false)
            .await?;
        transaction.commit().await?;
        Ok(entity)
    }

    /// Loads immutable journal input in its durable per-database commit order.
    ///
    /// The ordinal is independent from projection sequence, so rejected
    /// out-of-order input remains replayable without inventing a projected
    /// change. Callers feed the result into the pure projection replay engine.
    ///
    /// # Errors
    ///
    /// Returns an error for an unknown epoch, malformed persisted observation
    /// or database failure.
    pub async fn load_replay_records(
        &self,
        epoch_id: Uuid,
    ) -> Result<Vec<ReplayRecord>, StoreError> {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (
               SELECT 1 FROM portal_projection.epochs WHERE epoch_id = $1
             )",
        )
        .bind(epoch_id)
        .fetch_one(&self.pool)
        .await?;
        if !exists {
            return Err(StoreError::EpochNotFound);
        }
        let rows = sqlx::query(
            "SELECT journal_ordinal, observation, projected_at
             FROM portal_projection.event_journal
             WHERE epoch_id = $1
             ORDER BY journal_ordinal",
        )
        .bind(epoch_id)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
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
            .collect()
    }

    async fn load_entity_tx(
        &self,
        transaction: &mut Transaction<'_, Postgres>,
        epoch_id: Uuid,
        entity: &ProjectionEntityKey,
        lock: bool,
    ) -> Result<Option<ProjectedEntity>, StoreError> {
        let query = if lock {
            "SELECT * FROM portal_projection.entities
             WHERE epoch_id = $1 AND entity_kind = $2 AND entity_id = $3
             FOR UPDATE"
        } else {
            "SELECT * FROM portal_projection.entities
             WHERE epoch_id = $1 AND entity_kind = $2 AND entity_id = $3"
        };
        sqlx::query(query)
            .bind(epoch_id)
            .bind(entity.kind.as_str())
            .bind(entity.entity_id.as_str())
            .fetch_optional(&mut **transaction)
            .await?
            .map(|row| row_to_entity(&row))
            .transpose()
    }

    /// Activates a parity-matched BUILDING epoch and retains the previous epoch
    /// read-only for a bounded overlap window.
    ///
    /// # Errors
    ///
    /// Rejects parity drift, unresolved dead letters/gaps, invalid status or a
    /// database failure. The swap is one transaction.
    pub async fn activate_epoch(
        &self,
        scope: &ProjectionScope,
        candidate_epoch_id: Uuid,
        expected_state_digest: &str,
        activated_at: DateTime<Utc>,
        overlap: Duration,
    ) -> Result<ActivatedEpoch, StoreError> {
        let overlap = TimeDelta::from_std(overlap).map_err(|_| StoreError::InvalidOverlap)?;
        let mut transaction = self.pool.begin().await?;
        let candidate = sqlx::query(
            "SELECT workspace_id, environment, status
             FROM portal_projection.epochs WHERE epoch_id = $1 FOR UPDATE",
        )
        .bind(candidate_epoch_id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::EpochNotFound)?;
        if candidate.try_get::<String, _>("workspace_id")? != scope.workspace_id.as_str()
            || candidate.try_get::<String, _>("environment")? != scope.environment.as_str()
        {
            return Err(StoreError::ScopeMismatch);
        }
        if candidate.try_get::<String, _>("status")? != "BUILDING" {
            return Err(StoreError::EpochNotBuilding);
        }
        let blockers: i64 = sqlx::query_scalar(
            "SELECT
               (SELECT count(*) FROM portal_projection.dead_letters
                WHERE epoch_id = $1 AND status IN ('OPEN', 'REPLAYING'))
               +
               (SELECT count(*) FROM portal_projection.gaps
                WHERE epoch_id = $1 AND resolved_at IS NULL)",
        )
        .bind(candidate_epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        if blockers != 0 {
            return Err(StoreError::EpochHasUnresolvedBlockers);
        }
        let rows = sqlx::query(
            "SELECT * FROM portal_projection.entities
             WHERE epoch_id = $1 ORDER BY entity_kind, entity_id",
        )
        .bind(candidate_epoch_id)
        .fetch_all(&mut *transaction)
        .await?;
        let entities = rows
            .iter()
            .map(row_to_entity)
            .collect::<Result<Vec<_>, _>>()?;
        let actual_state_digest = semantic_state_digest(&entities)?;
        if expected_state_digest != actual_state_digest {
            sqlx::query(
                "UPDATE portal_projection.epochs
                 SET expected_state_digest = $2, actual_state_digest = $3
                 WHERE epoch_id = $1",
            )
            .bind(candidate_epoch_id)
            .bind(expected_state_digest)
            .bind(&actual_state_digest)
            .execute(&mut *transaction)
            .await?;
            transaction.commit().await?;
            return Err(StoreError::ParityMismatch);
        }
        let previous = sqlx::query_scalar::<_, Uuid>(
            "SELECT epoch_id FROM portal_projection.epochs
             WHERE workspace_id = $1 AND environment = $2 AND status = 'ACTIVE'
             FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .fetch_optional(&mut *transaction)
        .await?;
        let overlap_until = activated_at + overlap;
        if let Some(previous_epoch_id) = previous {
            sqlx::query(
                "UPDATE portal_projection.epochs
                 SET status = 'RETAINED', overlap_until = $2
                 WHERE epoch_id = $1",
            )
            .bind(previous_epoch_id)
            .bind(overlap_until)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "UPDATE portal_projection.epochs
             SET status = 'ACTIVE', activated_at = $2,
                 expected_state_digest = $3, actual_state_digest = $3
             WHERE epoch_id = $1",
        )
        .bind(candidate_epoch_id)
        .bind(activated_at)
        .bind(&actual_state_digest)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(ActivatedEpoch {
            active_epoch_id: candidate_epoch_id,
            retained_previous_epoch_id: previous,
            overlap_until,
            state_digest: actual_state_digest,
        })
    }

    /// Stores immutable evidence for an already reconciled snapshot.
    ///
    /// # Errors
    ///
    /// Rejects duplicate evidence or invalid counts through database constraints.
    #[allow(clippy::too_many_arguments)]
    pub async fn record_snapshot_evidence(
        &self,
        epoch_id: Uuid,
        snapshot_id: &CanonicalId,
        entity_kind: ProjectionEntityKind,
        completeness: SnapshotCompleteness,
        expected_count: usize,
        applied_count: usize,
        removed_count: usize,
        source_read_at: DateTime<Utc>,
        committed_at: DateTime<Utc>,
        state_digest: &str,
    ) -> Result<(), StoreError> {
        sqlx::query(
            "INSERT INTO portal_projection.snapshots
             (epoch_id, snapshot_id, entity_kind, completeness, expected_count,
              applied_count, removed_count, source_read_at, committed_at, state_digest)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        )
        .bind(epoch_id)
        .bind(snapshot_id.as_str())
        .bind(entity_kind.as_str())
        .bind(match completeness {
            SnapshotCompleteness::Complete => "COMPLETE",
            SnapshotCompleteness::Partial => "PARTIAL",
        })
        .bind(i64::try_from(expected_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(applied_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(removed_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(source_read_at)
        .bind(committed_at)
        .bind(state_digest)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Registers a content-addressed immutable freshness policy snapshot.
    ///
    /// # Errors
    ///
    /// Rejects invalid policy thresholds or a version reused with different
    /// content.
    pub async fn register_freshness_policy(
        &self,
        policy: &FreshnessPolicy,
        registered_at: DateTime<Utc>,
    ) -> Result<String, StoreError> {
        policy.validate()?;
        let digest = canonical_digest(policy)?;
        let inserted = sqlx::query(
            "INSERT INTO portal_projection.freshness_policy_snapshots
             (policy_version, policy_digest, policy, registered_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (policy_version) DO NOTHING",
        )
        .bind(&policy.policy_version)
        .bind(&digest)
        .bind(serde_json::to_value(policy).map_err(|_| StoreError::Serialization)?)
        .bind(registered_at)
        .execute(&self.pool)
        .await?;
        if inserted.rows_affected() == 0 {
            let existing: String = sqlx::query_scalar(
                "SELECT policy_digest
                 FROM portal_projection.freshness_policy_snapshots
                 WHERE policy_version = $1",
            )
            .bind(&policy.policy_version)
            .fetch_one(&self.pool)
            .await?;
            if existing != digest {
                return Err(StoreError::FreshnessPolicyVersionCollision);
            }
        }
        Ok(digest)
    }
}

async fn insert_ingestion(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    ingestion_id: &str,
    input_digest: &str,
    outcome: &str,
    sequence: Option<u64>,
    seen_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO portal_projection.ingestion_keys
         (epoch_id, ingestion_id, input_digest, outcome, projection_sequence, first_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(epoch_id)
    .bind(ingestion_id)
    .bind(input_digest)
    .bind(outcome)
    .bind(sequence.map(i64_from_u64).transpose()?)
    .bind(seen_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn insert_journal(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    observation: &ProjectionObservation,
    input_digest: &str,
    outcome: &str,
    sequence: Option<u64>,
    projected_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    let (event_ts, created_at, event_id) = cursor_parts(observation.source_cursor.as_ref());
    sqlx::query(
        "INSERT INTO portal_projection.event_journal
         (event_id, projected_at, epoch_id, ingestion_id, projection_sequence,
          entity_kind, entity_id, outcome, source_event_ts, source_created_at,
          source_event_id, source_sequence, source_read_at, as_of, input_digest, observation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    )
    .bind(Uuid::now_v7())
    .bind(projected_at)
    .bind(epoch_id)
    .bind(observation.ingestion_id.as_str())
    .bind(sequence.map(i64_from_u64).transpose()?)
    .bind(observation.entity.kind.as_str())
    .bind(observation.entity.entity_id.as_str())
    .bind(outcome)
    .bind(event_ts)
    .bind(created_at)
    .bind(event_id)
    .bind(observation.source_sequence)
    .bind(observation.source_read_at)
    .bind(observation.as_of)
    .bind(input_digest)
    .bind(serde_json::to_value(observation).map_err(|_| StoreError::Serialization)?)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn upsert_entity(
    transaction: &mut Transaction<'_, Postgres>,
    entity: &ProjectedEntity,
) -> Result<(), StoreError> {
    let (event_ts, created_at, event_id) = cursor_parts(entity.source_cursor.as_ref());
    sqlx::query(
        "INSERT INTO portal_projection.entities
         (epoch_id, entity_kind, entity_id, projection_sequence, source_authority,
          as_of, source_read_at, projected_at, source_event_ts, source_created_at,
          source_event_id, source_sequence, source_completeness, poll_interval_ms,
          adapter_version, capability_snapshot_id, payload_digest, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         ON CONFLICT (epoch_id, entity_kind, entity_id) DO UPDATE SET
           projection_sequence = EXCLUDED.projection_sequence,
           source_authority = EXCLUDED.source_authority,
           as_of = EXCLUDED.as_of,
           source_read_at = EXCLUDED.source_read_at,
           projected_at = EXCLUDED.projected_at,
           source_event_ts = EXCLUDED.source_event_ts,
           source_created_at = EXCLUDED.source_created_at,
           source_event_id = EXCLUDED.source_event_id,
           source_sequence = EXCLUDED.source_sequence,
           source_completeness = EXCLUDED.source_completeness,
           poll_interval_ms = EXCLUDED.poll_interval_ms,
           adapter_version = EXCLUDED.adapter_version,
           capability_snapshot_id = EXCLUDED.capability_snapshot_id,
           payload_digest = EXCLUDED.payload_digest,
           payload = EXCLUDED.payload",
    )
    .bind(entity.epoch_id)
    .bind(entity.entity.kind.as_str())
    .bind(entity.entity.entity_id.as_str())
    .bind(i64_from_u64(entity.projection_sequence)?)
    .bind(authority_str(entity.source_authority))
    .bind(entity.as_of)
    .bind(entity.source_read_at)
    .bind(entity.projected_at)
    .bind(event_ts)
    .bind(created_at)
    .bind(event_id)
    .bind(entity.source_sequence)
    .bind(completeness_str(entity.source_completeness))
    .bind(entity.poll_interval_ms)
    .bind(&entity.adapter_version)
    .bind(&entity.capability_snapshot_id)
    .bind(&entity.payload_digest)
    .bind(&entity.payload)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn upsert_checkpoint(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    stream_key: &str,
    observation: &ProjectionObservation,
    sequence: u64,
    updated_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    let (event_ts, created_at, event_id) = cursor_parts(observation.source_cursor.as_ref());
    sqlx::query(
        "INSERT INTO portal_projection.checkpoints
         (epoch_id, stream_key, source_event_ts, source_created_at, source_event_id,
          source_sequence, last_projection_sequence, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (epoch_id, stream_key) DO UPDATE SET
           source_event_ts = EXCLUDED.source_event_ts,
           source_created_at = EXCLUDED.source_created_at,
           source_event_id = EXCLUDED.source_event_id,
           source_sequence = EXCLUDED.source_sequence,
           last_projection_sequence = EXCLUDED.last_projection_sequence,
           updated_at = EXCLUDED.updated_at",
    )
    .bind(epoch_id)
    .bind(stream_key)
    .bind(event_ts)
    .bind(created_at)
    .bind(event_id)
    .bind(observation.source_sequence)
    .bind(i64_from_u64(sequence)?)
    .bind(updated_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn insert_gap(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    gap: &projection_core::ProjectionGap,
    detected_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO portal_projection.gaps
         (gap_id, epoch_id, entity_kind, entity_id, reason_code,
          previous_source_sequence, observed_source_sequence,
          projection_sequence, detected_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(Uuid::now_v7())
    .bind(epoch_id)
    .bind(gap.entity.kind.as_str())
    .bind(gap.entity.entity_id.as_str())
    .bind(&gap.code)
    .bind(gap.previous_source_sequence)
    .bind(gap.observed_source_sequence)
    .bind(i64_from_u64(gap.detected_at_projection_sequence)?)
    .bind(detected_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn dead_letter(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    observation: &ProjectionObservation,
    input_digest: &str,
    reason_code: &'static str,
    seen_at: DateTime<Utc>,
) -> Result<StoreApplyOutcome, StoreError> {
    let redacted = serde_json::json!({
        "ingestion_id": observation.ingestion_id.as_str(),
        "entity_kind": observation.entity.kind.as_str(),
        "entity_id": observation.entity.entity_id.as_str(),
        "as_of": observation.as_of,
        "source_read_at": observation.source_read_at,
        "source_cursor": observation.source_cursor.clone(),
        "source_sequence": observation.source_sequence,
        "adapter_version": &observation.adapter_version,
        "capability_snapshot_id": &observation.capability_snapshot_id,
        "payload_digest": projection_core::canonical_value_digest(&observation.payload),
    });
    sqlx::query(
        "INSERT INTO portal_projection.dead_letters
         (dead_letter_id, epoch_id, ingestion_id, reason_code, input_digest,
          redacted_observation, status, first_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,'OPEN',$7)
         ON CONFLICT (epoch_id, ingestion_id, input_digest) DO NOTHING",
    )
    .bind(Uuid::now_v7())
    .bind(epoch_id)
    .bind(observation.ingestion_id.as_str())
    .bind(reason_code)
    .bind(input_digest)
    .bind(redacted)
    .bind(seen_at)
    .execute(&mut **transaction)
    .await?;
    Ok(StoreApplyOutcome::DeadLettered { reason_code })
}

fn row_to_entity(row: &sqlx::postgres::PgRow) -> Result<ProjectedEntity, StoreError> {
    let event_ts: Option<DateTime<Utc>> = row.try_get("source_event_ts")?;
    let created_at: Option<DateTime<Utc>> = row.try_get("source_created_at")?;
    let event_id: Option<String> = row.try_get("source_event_id")?;
    let source_cursor = match (event_ts, created_at, event_id) {
        (Some(event_ts), Some(created_at), Some(event_id)) => Some(SourceCursor {
            event_ts,
            created_at,
            event_id: CanonicalId::parse(event_id)?,
        }),
        (None, None, None) => None,
        _ => return Err(StoreError::PersistedCursorInvariant),
    };
    Ok(ProjectedEntity {
        epoch_id: row.try_get("epoch_id")?,
        projection_sequence: required_u64(row.try_get("projection_sequence")?)?,
        entity: ProjectionEntityKey {
            kind: ProjectionEntityKind::from_str(&row.try_get::<String, _>("entity_kind")?)?,
            entity_id: CanonicalId::parse(row.try_get::<String, _>("entity_id")?)?,
        },
        source_authority: parse_authority(&row.try_get::<String, _>("source_authority")?)?,
        as_of: row.try_get("as_of")?,
        source_read_at: row.try_get("source_read_at")?,
        projected_at: row.try_get("projected_at")?,
        source_cursor,
        source_sequence: row.try_get("source_sequence")?,
        source_completeness: parse_completeness(&row.try_get::<String, _>("source_completeness")?)?,
        poll_interval_ms: row.try_get("poll_interval_ms")?,
        adapter_version: row.try_get("adapter_version")?,
        capability_snapshot_id: row.try_get("capability_snapshot_id")?,
        payload_digest: row.try_get("payload_digest")?,
        payload: row.try_get("payload")?,
    })
}

fn cursor_parts(
    cursor: Option<&SourceCursor>,
) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>, Option<&str>) {
    cursor.map_or((None, None, None), |cursor| {
        (
            Some(cursor.event_ts),
            Some(cursor.created_at),
            Some(cursor.event_id.as_str()),
        )
    })
}

const fn authority_str(authority: SourceAuthority) -> &'static str {
    match authority {
        SourceAuthority::Research => "RESEARCH",
        SourceAuthority::Execution => "EXECUTION",
        SourceAuthority::Broker => "BROKER",
        SourceAuthority::Derived => "DERIVED",
    }
}

fn parse_authority(value: &str) -> Result<SourceAuthority, StoreError> {
    match value {
        "RESEARCH" => Ok(SourceAuthority::Research),
        "EXECUTION" => Ok(SourceAuthority::Execution),
        "BROKER" => Ok(SourceAuthority::Broker),
        "DERIVED" => Ok(SourceAuthority::Derived),
        _ => Err(StoreError::PersistedVocabulary),
    }
}

const fn completeness_str(completeness: SourceCompleteness) -> &'static str {
    match completeness {
        SourceCompleteness::EventSourced => "EVENT_SOURCED",
        SourceCompleteness::PollBounded => "POLL_BOUNDED",
        SourceCompleteness::Unknown => "UNKNOWN",
    }
}

fn parse_completeness(value: &str) -> Result<SourceCompleteness, StoreError> {
    match value {
        "EVENT_SOURCED" => Ok(SourceCompleteness::EventSourced),
        "POLL_BOUNDED" => Ok(SourceCompleteness::PollBounded),
        "UNKNOWN" => Ok(SourceCompleteness::Unknown),
        _ => Err(StoreError::PersistedVocabulary),
    }
}

fn reducer_reason_code(error: &ProjectionError) -> &'static str {
    match error {
        ProjectionError::SourceCursorCollision => "SOURCE_CURSOR_COLLISION",
        ProjectionError::IdempotencyCollision => "IDEMPOTENCY_COLLISION",
        ProjectionError::PayloadMustBeObject => "INVALID_PAYLOAD",
        ProjectionError::MissingPollInterval | ProjectionError::UnexpectedPollInterval => {
            "INVALID_COMPLETENESS"
        }
        _ => "INVALID_OBSERVATION",
    }
}

fn required_u64(value: i64) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

fn optional_u64(value: Option<i64>) -> Result<Option<u64>, StoreError> {
    value.map(required_u64).transpose()
}

fn i64_from_u64(value: u64) -> Result<i64, StoreError> {
    i64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

#[derive(Debug, Error)]
pub enum StoreError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Projection(#[from] ProjectionError),
    #[error(transparent)]
    Contract(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    Query(#[from] query_api::QueryError),
    #[error("projection epoch metadata is invalid")]
    InvalidEpochMetadata,
    #[error("projection stream key is invalid")]
    InvalidStreamKey,
    #[error("projection epoch does not exist")]
    EpochNotFound,
    #[error("projection scope does not match the epoch")]
    ScopeMismatch,
    #[error("projection epoch is not writable")]
    EpochNotWritable,
    #[error("projection epoch is not BUILDING")]
    EpochNotBuilding,
    #[error("projection epoch has unresolved gaps or dead letters")]
    EpochHasUnresolvedBlockers,
    #[error("projection parity digest does not match")]
    ParityMismatch,
    #[error("projection epoch overlap is invalid")]
    InvalidOverlap,
    #[error("persisted projection cursor is internally inconsistent")]
    PersistedCursorInvariant,
    #[error("persisted projection vocabulary is unsupported")]
    PersistedVocabulary,
    #[error("projection reducer and database state diverged")]
    ReducerDatabaseInvariant,
    #[error("numeric projection value exceeds PostgreSQL BIGINT")]
    NumericOverflow,
    #[error("freshness policy version was reused with different content")]
    FreshnessPolicyVersionCollision,
    #[error("projection value could not be serialized")]
    Serialization,
    #[error("active projection epoch does not exist for this scope")]
    ActiveEpochNotFound,
    #[error("realtime replay page limit is outside the bounded range")]
    InvalidRealtimePageLimit,
    #[error("analytics source snapshot does not exist")]
    AnalyticsSourceNotFound,
    #[error("analytics source snapshot delivery profile does not match the requested profile")]
    AnalyticsSourceProfileMismatch,
    #[error("analytics source capability snapshot does not match the active capability")]
    AnalyticsCapabilityMismatch,
    #[error("analytics source snapshot is not internally complete")]
    AnalyticsPopulationMismatch,
    #[error("analytics source payload is invalid for its narrow screen contract")]
    InvalidAnalyticsSourcePayload,
    #[error("analytics source fact digest does not match its immutable snapshot header")]
    AnalyticsSourceIntegrityMismatch,
    #[error("analytics source query exceeds its bounded repository limit")]
    AnalyticsSourceLimitExceeded,
    #[error("analytics source payload exceeds the bounded repository byte limit")]
    AnalyticsSourcePayloadLimitExceeded,
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeMap, sync::OnceLock};

    use execution_contracts::DecimalString;
    use query_api::{
        CursorCodec, EntityQueryRequest, FilterField, FilterOperator, QueryFilter,
        RetentionAvailability, RetentionPolicy, SeriesIntent,
    };

    use super::*;

    static POSTGRES_TEST_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

    fn postgres_test_lock() -> &'static tokio::sync::Mutex<()> {
        POSTGRES_TEST_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
    }

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_777_000_000 + second, 0).unwrap()
    }

    fn scope() -> ProjectionScope {
        ProjectionScope::new(CanonicalId::parse("workspace_pg_test").unwrap(), "paper").unwrap()
    }

    fn metadata() -> EpochMetadata {
        EpochMetadata {
            adapter_version: "ts-adapter-v1".to_owned(),
            source_gateway_digest: "sha256:test-gateway".to_owned(),
            capability_snapshot_id: "cap_pg_test".to_owned(),
        }
    }

    fn observation(id: &str, second: i64, sequence: i64, status: &str) -> ProjectionObservation {
        ProjectionObservation {
            ingestion_id: CanonicalId::parse(id).unwrap(),
            entity: ProjectionEntityKey {
                kind: ProjectionEntityKind::Order,
                entity_id: CanonicalId::parse("order_pg_1").unwrap(),
            },
            source_authority: SourceAuthority::Execution,
            as_of: Some(at(second)),
            source_read_at: at(second) + TimeDelta::milliseconds(10),
            source_cursor: Some(SourceCursor {
                event_ts: at(second),
                created_at: at(second) + TimeDelta::milliseconds(1),
                event_id: CanonicalId::parse(id).unwrap(),
            }),
            source_sequence: Some(sequence),
            source_completeness: SourceCompleteness::EventSourced,
            poll_interval_ms: None,
            adapter_version: "ts-adapter-v1".to_owned(),
            capability_snapshot_id: "cap_pg_test".to_owned(),
            payload: serde_json::json!({"status": status, "quantity": "1.0000"}),
        }
    }

    async fn reset(store: &PgProjectionStore, database_url: &str) {
        assert!(database_url.contains("/portal_projection_test"));
        sqlx::query(
            "TRUNCATE portal_projection.retention_policy_snapshots,
                      portal_projection.freshness_policy_snapshots,
                      portal_projection.epochs CASCADE",
        )
        .execute(&store.pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)] // one ordered scenario proves migration through cutover
    async fn postgres_projection_survives_restart_and_swaps_only_after_parity() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let _guard = postgres_test_lock().lock().await;
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        reset(&store, &database_url).await;

        let scope = scope();
        let first_epoch = store
            .create_building_epoch(&scope, &metadata(), at(0))
            .await
            .unwrap();
        let first = observation("evt_pg_1", 1, 1, "OPEN");
        assert_eq!(
            store
                .apply_observation(&scope, first_epoch, "orders:alpha_1", &first, at(2))
                .await
                .unwrap(),
            StoreApplyOutcome::Applied { sequence: 1 }
        );
        assert_eq!(
            store
                .apply_observation(&scope, first_epoch, "orders:alpha_1", &first, at(3))
                .await
                .unwrap(),
            StoreApplyOutcome::Duplicate { sequence: Some(1) }
        );
        let second = observation("evt_pg_2", 2, 3, "FILLED");
        assert_eq!(
            store
                .apply_observation(&scope, first_epoch, "orders:alpha_1", &second, at(3))
                .await
                .unwrap(),
            StoreApplyOutcome::GapApplied { sequence: 2 }
        );
        assert_eq!(
            store
                .apply_observation(
                    &scope,
                    first_epoch,
                    "orders:alpha_1",
                    &observation("evt_pg_old", 0, 0, "PENDING"),
                    at(4),
                )
                .await
                .unwrap(),
            StoreApplyOutcome::OutOfOrder
        );

        let restarted = PgProjectionStore::connect(&database_url).await.unwrap();
        let entity = restarted
            .load_entity(first_epoch, &second.entity)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(entity.payload["status"], "FILLED");
        assert_eq!(entity.projection_sequence, 2);
        let replayed = projection_core::replay(
            scope.clone(),
            first_epoch,
            restarted.load_replay_records(first_epoch).await.unwrap(),
        )
        .unwrap();
        assert_eq!(replayed.input_count, 3);
        assert_eq!(replayed.out_of_order_count, 1);
        assert_eq!(replayed.reducer.sequence(), 2);

        sqlx::query(
            "UPDATE portal_projection.gaps
             SET resolved_at = $2, resolution_evidence_digest = 'sha256:resolved'
             WHERE epoch_id = $1",
        )
        .bind(first_epoch)
        .bind(at(4))
        .execute(&restarted.pool)
        .await
        .unwrap();
        let first_digest = semantic_state_digest(&[entity]).unwrap();
        assert_eq!(replayed.state_digest, first_digest);
        restarted
            .record_snapshot_evidence(
                first_epoch,
                &CanonicalId::parse("snapshot_pg_1").unwrap(),
                ProjectionEntityKind::Order,
                SnapshotCompleteness::Complete,
                1,
                1,
                0,
                at(4),
                at(5),
                &first_digest,
            )
            .await
            .unwrap();
        assert!(sqlx::query(
            "UPDATE portal_projection.snapshots
             SET applied_count = 0
             WHERE epoch_id = $1 AND snapshot_id = 'snapshot_pg_1'",
        )
        .bind(first_epoch)
        .execute(&restarted.pool)
        .await
        .is_err());
        let activated = restarted
            .activate_epoch(
                &scope,
                first_epoch,
                &first_digest,
                at(5),
                Duration::from_secs(30),
            )
            .await
            .unwrap();
        assert_eq!(activated.retained_previous_epoch_id, None);

        let candidate = restarted
            .create_building_epoch(&scope, &metadata(), at(6))
            .await
            .unwrap();
        restarted
            .apply_observation(
                &scope,
                candidate,
                "orders:alpha_1",
                &observation("evt_pg_2", 2, 3, "FILLED"),
                at(7),
            )
            .await
            .unwrap();
        let candidate_entity = restarted
            .load_entity(candidate, &second.entity)
            .await
            .unwrap()
            .unwrap();
        let candidate_digest = semantic_state_digest(&[candidate_entity]).unwrap();
        assert_eq!(candidate_digest, first_digest);
        let cutover = restarted
            .activate_epoch(
                &scope,
                candidate,
                &candidate_digest,
                at(8),
                Duration::from_secs(30),
            )
            .await
            .unwrap();
        assert_eq!(cutover.retained_previous_epoch_id, Some(first_epoch));

        let policy = FreshnessPolicy {
            policy_version: "paper.orders.v1".to_owned(),
            warning_after_ms: 10_000,
            stale_after_ms: 30_000,
            maximum_future_skew_ms: 2_000,
        };
        let digest = restarted
            .register_freshness_policy(&policy, at(9))
            .await
            .unwrap();
        assert_eq!(
            restarted
                .register_freshness_policy(&policy, at(10))
                .await
                .unwrap(),
            digest
        );
        let changed_policy = FreshnessPolicy {
            stale_after_ms: 40_000,
            ..policy
        };
        assert!(matches!(
            restarted
                .register_freshness_policy(&changed_policy, at(11))
                .await,
            Err(StoreError::FreshnessPolicyVersionCollision)
        ));
    }

    #[tokio::test]
    async fn realtime_resume_pages_are_exact_bounded_and_scope_aware() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let _guard = postgres_test_lock().lock().await;
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        reset(&store, &database_url).await;
        let scope = scope();
        let epoch_id = store
            .create_building_epoch(&scope, &metadata(), at(0))
            .await
            .unwrap();
        let first = observation("evt_realtime_1", 1, 1, "OPEN");
        let second = observation("evt_realtime_2", 2, 2, "PARTIAL");
        store
            .apply_observation(&scope, epoch_id, "orders:alpha_1", &first, at(2))
            .await
            .unwrap();
        store
            .apply_observation(&scope, epoch_id, "orders:alpha_1", &second, at(3))
            .await
            .unwrap();
        let digest = semantic_state_digest(&[store
            .load_entity(epoch_id, &second.entity)
            .await
            .unwrap()
            .unwrap()])
        .unwrap();
        store
            .activate_epoch(&scope, epoch_id, &digest, at(4), Duration::from_secs(30))
            .await
            .unwrap();

        let availability = store.realtime_scope_availability(&scope).await.unwrap();
        assert_eq!(availability.active.epoch.epoch_id, epoch_id);
        assert_eq!(availability.active.earliest_available_sequence, 1);
        assert_eq!(availability.active.latest_available_sequence, 2);
        assert!(availability.retained_previous.is_none());

        let first_page = store.load_realtime_records(epoch_id, 0, 1).await.unwrap();
        assert!(first_page.has_more);
        assert_eq!(first_page.records[0].projection_sequence, 1);
        assert_eq!(
            first_page.records[0].workspace_id,
            scope.workspace_id.as_str()
        );
        let tail = store.load_realtime_records(epoch_id, 1, 2).await.unwrap();
        assert!(!tail.has_more);
        assert_eq!(tail.records[0].projection_sequence, 2);

        assert_realtime_epoch_cutover(&store, &scope, epoch_id).await;
        assert!(matches!(
            store.load_realtime_records(epoch_id, 0, 0).await,
            Err(StoreError::InvalidRealtimePageLimit)
        ));
    }

    async fn assert_realtime_epoch_cutover(
        store: &PgProjectionStore,
        scope: &ProjectionScope,
        epoch_id: Uuid,
    ) {
        let ordinal = store.latest_realtime_journal_ordinal().await.unwrap();
        let third = observation("evt_realtime_3", 3, 3, "FILLED");
        store
            .apply_observation(scope, epoch_id, "orders:alpha_1", &third, at(5))
            .await
            .unwrap();
        let live = store
            .load_realtime_records_after_ordinal(ordinal, 8)
            .await
            .unwrap();
        assert_eq!(live.records.len(), 1);
        assert_eq!(live.records[0].projection_sequence, 3);
        let before_cutover = store.active_realtime_epoch_watermarks().await.unwrap();
        assert_eq!(before_cutover.len(), 1);
        assert_eq!(before_cutover[0].epoch_id, epoch_id);
        assert_eq!(before_cutover[0].latest_sequence, 3);

        let replacement_epoch = store
            .create_building_epoch(scope, &metadata(), at(6))
            .await
            .unwrap();
        let replacement = observation("evt_realtime_replacement", 1, 1, "OPEN");
        store
            .apply_observation(
                scope,
                replacement_epoch,
                "orders:alpha_1",
                &replacement,
                at(7),
            )
            .await
            .unwrap();
        let while_building = store.active_realtime_epoch_watermarks().await.unwrap();
        assert_eq!(while_building.len(), 1);
        assert_eq!(while_building[0].epoch_id, epoch_id);
        let replacement_digest = semantic_state_digest(&[store
            .load_entity(replacement_epoch, &replacement.entity)
            .await
            .unwrap()
            .unwrap()])
        .unwrap();
        store
            .activate_epoch(
                scope,
                replacement_epoch,
                &replacement_digest,
                at(8),
                Duration::from_secs(30),
            )
            .await
            .unwrap();
        let after_cutover = store.active_realtime_epoch_watermarks().await.unwrap();
        assert_eq!(after_cutover.len(), 1);
        assert_eq!(after_cutover[0].epoch_id, replacement_epoch);
        assert_eq!(after_cutover[0].latest_sequence, 1);
        assert_eq!(
            store
                .load_realtime_records(replacement_epoch, 0, 1)
                .await
                .unwrap()
                .records[0]
                .projection_sequence,
            1,
        );
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)] // one scale corpus proves the cross-cutting query contract
    async fn postgres_query_is_stable_exact_adaptive_and_cold_aware_at_scale() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let _guard = postgres_test_lock().lock().await;
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        reset(&store, &database_url).await;
        let scope = scope();
        let epoch_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.epochs
             (epoch_id,workspace_id,environment,status,adapter_version,
              source_gateway_digest,capability_snapshot_id,created_at,activated_at,
              next_projection_sequence)
             VALUES ($1,$2,$3,'ACTIVE','ts-adapter-v1','sha256:scale','cap_scale',$4,$4,182000)",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(at(0))
        .execute(&store.pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO portal_projection.entities
             (epoch_id,entity_kind,entity_id,projection_sequence,source_authority,
              as_of,source_read_at,projected_at,source_completeness,adapter_version,
              capability_snapshot_id,payload_digest,payload)
             SELECT $1,'ORDER','order_' || lpad(g::text,6,'0'),g,'EXECUTION',
                    $2 + g * interval '1 second',$2 + g * interval '1 second',
                    $2 + g * interval '1 second','UNKNOWN','ts-adapter-v1',
                    'cap_scale','sha256:scale',
                    jsonb_build_object(
                      'status', CASE WHEN g % 2 = 0 THEN 'OPEN' ELSE 'FILLED' END,
                      'currency', CASE WHEN g % 3 = 0 THEN 'USD' ELSE 'VND' END,
                      'instrument_id', 'BTC-PERP',
                      'quantity', '0.100000000000000001',
                      'notional', g::text || '.000000000000000001')
             FROM generate_series(1,182000) AS g",
        )
        .bind(epoch_id)
        .bind(at(0))
        .execute(&store.pool)
        .await
        .unwrap();

        let codec = CursorCodec::new(
            "cursor-v1",
            BTreeMap::from([("cursor-v1".to_owned(), vec![7_u8; 32])]),
            Duration::from_secs(900),
        )
        .unwrap();
        let now = at(400_000);
        let first = store
            .query_entities(
                &scope,
                ProjectionEntityKind::Order,
                &EntityQueryRequest::default(),
                &codec,
                now,
            )
            .await
            .unwrap();
        assert_eq!(first.total_count, 182_000);
        assert_eq!(first.filtered_count, 182_000);
        assert_eq!(first.rows.len(), 100);
        assert!(first.has_more);
        assert!(!first.has_previous);
        assert!(first.next.is_some());

        sqlx::query(
            "INSERT INTO portal_projection.entities
             (epoch_id,entity_kind,entity_id,projection_sequence,source_authority,
              as_of,source_read_at,projected_at,source_completeness,adapter_version,
              capability_snapshot_id,payload_digest,payload)
             VALUES ($1,'ORDER','order_newer',182001,'EXECUTION',$2,$2,$2,'UNKNOWN',
                     'ts-adapter-v1','cap_scale','sha256:newer',
                     '{\"status\":\"OPEN\",\"currency\":\"USD\",\"quantity\":\"0.1\",\"notional\":\"1.1\"}')",
        )
        .bind(epoch_id)
        .bind(at(300_000))
        .execute(&store.pool)
        .await
        .unwrap();
        sqlx::query(
            "DELETE FROM portal_projection.entities
             WHERE epoch_id=$1 AND entity_kind='ORDER' AND entity_id=$2",
        )
        .bind(epoch_id)
        .bind(&first.rows[0].entity_id)
        .execute(&store.pool)
        .await
        .unwrap();
        let second_request = EntityQueryRequest {
            after: first.next.clone(),
            ..EntityQueryRequest::default()
        };
        let second = store
            .query_entities(
                &scope,
                ProjectionEntityKind::Order,
                &second_request,
                &codec,
                now,
            )
            .await
            .unwrap();
        assert_eq!(second.total_count, 182_000);
        assert!(second.has_previous);
        assert!(second.previous.is_some());
        assert!(first.rows.iter().all(|left| {
            second
                .rows
                .iter()
                .all(|right| left.entity_id != right.entity_id)
        }));
        assert!(second.rows.iter().all(|row| row.entity_id != "order_newer"));

        let backward = store
            .query_entities(
                &scope,
                ProjectionEntityKind::Order,
                &EntityQueryRequest {
                    before: second.previous.clone(),
                    ..EntityQueryRequest::default()
                },
                &codec,
                now,
            )
            .await
            .unwrap();
        assert_eq!(backward.rows.last(), first.rows.last());
        assert!(backward.has_more);

        let filtered = store
            .query_entities(
                &scope,
                ProjectionEntityKind::Order,
                &EntityQueryRequest {
                    filters: vec![QueryFilter {
                        field: FilterField::Status,
                        operator: FilterOperator::Eq,
                        values: vec!["OPEN".to_owned()],
                    }],
                    ..EntityQueryRequest::default()
                },
                &codec,
                now,
            )
            .await
            .unwrap();
        assert_eq!(filtered.total_count, 182_000);
        assert_eq!(filtered.filtered_count, 91_000);
        assert_eq!(
            filtered
                .aggregates_by_currency
                .iter()
                .map(|aggregate| aggregate.row_count)
                .sum::<u64>(),
            filtered.filtered_count
        );
        assert!(filtered
            .aggregates_by_currency
            .iter()
            .all(|aggregate| aggregate.quantity_count == aggregate.row_count
                && aggregate.notional_count == aggregate.row_count
                && aggregate.invalid_numeric_count == 0));
        assert!(filtered
            .aggregates_by_currency
            .iter()
            .any(|aggregate| aggregate.currency.as_deref() == Some("USD")));
        assert!(filtered
            .aggregates_by_currency
            .iter()
            .any(|aggregate| aggregate.currency.as_deref() == Some("VND")));

        store
            .record_retention_policy(
                &scope,
                &RetentionPolicySnapshot {
                    retention_policy_id: Uuid::now_v7(),
                    series_key: "paper-equity".to_owned(),
                    metric: "equity".to_owned(),
                    policy: RetentionPolicy {
                        policy_version: "paper-equity-v1".to_owned(),
                        hot_from: at(0),
                        cold_requestable_from: Some(at(-1_000_000)),
                        purged_before: Some(at(-2_000_000)),
                        access_request_path: Some("/admin/data-access-requests".to_owned()),
                    },
                    created_at: at(-1),
                },
            )
            .await
            .unwrap();
        assert!(sqlx::query(
            "UPDATE portal_projection.retention_policy_snapshots
             SET hot_from=$1 WHERE workspace_id=$2",
        )
        .bind(at(1))
        .bind(scope.workspace_id.as_str())
        .execute(&store.pool)
        .await
        .is_err());
        sqlx::query(
            "INSERT INTO portal_projection.series_points
             (epoch_id,series_key,metric,interval_seconds,bucket_at,currency,value,
              minimum,maximum,sample_count,source_authority,as_of,projection_sequence,
              adapter_version,capability_snapshot_id)
             SELECT $1,'paper-equity','equity',300,$2 + g * interval '300 seconds','USD',
                    (g::text || '.123456789012345678')::numeric,
                    (g::text || '.123456789012345678')::numeric,
                    (g::text || '.123456789012345678')::numeric,
                    5,'EXECUTION',$2 + g * interval '300 seconds',g+1,
                    'ts-adapter-v1','cap_scale'
             FROM generate_series(0,2880) AS g",
        )
        .bind(epoch_id)
        .bind(at(0))
        .execute(&store.pool)
        .await
        .unwrap();
        store
            .write_series_point(
                &scope,
                epoch_id,
                &SeriesPointWrite {
                    series_key: "paper-equity".to_owned(),
                    metric: "equity".to_owned(),
                    interval_seconds: 300,
                    bucket_at: at(864_300),
                    currency: Some("USD".to_owned()),
                    value: DecimalString::parse("2881.123456789012345678").unwrap(),
                    minimum: DecimalString::parse("2881.123456789012345678").unwrap(),
                    maximum: DecimalString::parse("2881.123456789012345678").unwrap(),
                    sample_count: 5,
                    source_authority: SourceAuthority::Execution,
                    as_of: at(864_300),
                    projection_sequence: 182_001,
                    adapter_version: "ts-adapter-v1".to_owned(),
                    capability_snapshot_id: "cap_scale".to_owned(),
                },
            )
            .await
            .unwrap();
        let series = store
            .query_series(
                &scope,
                "paper-equity",
                "equity",
                Some("USD"),
                at(0),
                at(864_000),
                SeriesIntent::Overview,
            )
            .await
            .unwrap();
        assert_eq!(series.interval_seconds, 300);
        assert_eq!(series.returned_rows, 2_881);
        assert_eq!(series.source_rows, 14_405);
        assert_eq!(series.downsample_method, "canonical_preaggregated");
        assert_eq!(series.points[1].value.to_string(), "1.123456789012345678");
        assert_eq!(series.retention.availability, RetentionAvailability::Hot);
        let cold = store
            .query_series(
                &scope,
                "paper-equity",
                "equity",
                Some("USD"),
                at(-800_000),
                at(-700_000),
                SeriesIntent::Inspect,
            )
            .await
            .unwrap();
        assert_eq!(
            cold.retention.availability,
            RetentionAvailability::ColdRequestable
        );
        assert!(cold.points.is_empty());
        assert_eq!(
            cold.retention.access_request_path.as_deref(),
            Some("/admin/data-access-requests")
        );
    }

    async fn insert_analytics_snapshot(
        store: &PgProjectionStore,
        epoch_id: Uuid,
        kind: &str,
        resource_id: &str,
        context_key: &str,
        expected_fact_count: i64,
        expected_population_count: Option<i64>,
    ) -> Uuid {
        let snapshot_id = Uuid::now_v7();
        let empty_digest = analytics_facts_digest(&[]).unwrap();
        sqlx::query(
            "INSERT INTO portal_projection.analytics_source_snapshots
             (snapshot_id,epoch_id,analytics_kind,resource_id,context_key,source_profile,
              population_completeness,expected_fact_count,expected_population_count,
              source_read_at,projected_at,freshness_policy_version,
              freshness_warning_after_ms,freshness_stale_after_ms,maximum_future_skew_ms,
              projection_sequence,adapter_version,capability_snapshot_id,payload_digest)
             VALUES ($1,$2,$3,$4,$5,'paper','COMPLETE',$6,$7,$8,$9,'paper.analytics.v1',
                     20000,60000,2000,10,'ts-adapter-v1','cap_analytics',$10)",
        )
        .bind(snapshot_id)
        .bind(epoch_id)
        .bind(kind)
        .bind(resource_id)
        .bind(context_key)
        .bind(expected_fact_count)
        .bind(expected_population_count)
        .bind(at(90))
        .bind(at(91))
        .bind(empty_digest)
        .execute(&store.pool)
        .await
        .unwrap();
        snapshot_id
    }

    async fn insert_analytics_fact(
        store: &PgProjectionStore,
        snapshot_id: Uuid,
        fact_id: &str,
        fact_kind: &str,
        ordinal: i64,
        authority: &str,
        payload: serde_json::Value,
    ) {
        sqlx::query(
            "INSERT INTO portal_projection.analytics_source_facts
             (snapshot_id,fact_id,fact_kind,ordinal,source_authority,as_of,payload)
             VALUES ($1,$2,$3,$4,$5,$6,$7)",
        )
        .bind(snapshot_id)
        .bind(fact_id)
        .bind(fact_kind)
        .bind(ordinal)
        .bind(authority)
        .bind(at(90))
        .bind(payload)
        .execute(&store.pool)
        .await
        .unwrap();
        reseal_analytics_snapshot(store, snapshot_id).await;
    }

    async fn reseal_analytics_snapshot(store: &PgProjectionStore, snapshot_id: Uuid) {
        let rows = sqlx::query(
            "SELECT fact_id,fact_kind,ordinal,source_authority,as_of,payload
             FROM portal_projection.analytics_source_facts
             WHERE snapshot_id=$1 ORDER BY ordinal ASC",
        )
        .bind(snapshot_id)
        .fetch_all(&store.pool)
        .await
        .unwrap();
        let facts = rows
            .into_iter()
            .map(|row| AnalyticsFactDigestInput {
                fact_id: row.try_get("fact_id").unwrap(),
                fact_kind: row.try_get("fact_kind").unwrap(),
                ordinal: required_u64(row.try_get("ordinal").unwrap()).unwrap(),
                source_authority: parse_authority(
                    &row.try_get::<String, _>("source_authority").unwrap(),
                )
                .unwrap(),
                as_of: row.try_get("as_of").unwrap(),
                payload: row.try_get("payload").unwrap(),
            })
            .collect::<Vec<_>>();
        sqlx::query(
            "UPDATE portal_projection.analytics_source_snapshots
             SET payload_digest=$2 WHERE snapshot_id=$1",
        )
        .bind(snapshot_id)
        .bind(analytics_facts_digest(&facts).unwrap())
        .execute(&store.pool)
        .await
        .unwrap();
    }

    fn analytics_quality() -> serde_json::Value {
        serde_json::json!({
            "source_authority": "EXECUTION",
            "freshness_state": "OK",
            "completeness": "COMPLETE",
            "as_of": at(90),
        })
    }

    #[tokio::test]
    #[allow(clippy::too_many_lines)]
    async fn analytics_repositories_are_epoch_scoped_complete_and_profile_bound() {
        use analytics::{
            aggregate_binding_exposure, build_capital_ledger, build_capital_preview,
            build_correlation, build_insight_batch, build_order_funnel, CapitalPreviewRequest,
            CurrencyCode, InsightBatchRequest, InsightItemRequest,
        };
        use execution_contracts::{DecimalString, DeliveryProfile, FreshnessState};

        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let _guard = postgres_test_lock().lock().await;
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        reset(&store, &database_url).await;
        let scope = scope();
        let epoch_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.epochs
             (epoch_id,workspace_id,environment,status,adapter_version,source_gateway_digest,
              capability_snapshot_id,created_at,activated_at,next_projection_sequence)
             VALUES ($1,$2,$3,'ACTIVE','ts-adapter-v1','sha256:analytics','cap_analytics',$4,$4,10)",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(at(80))
        .execute(&store.pool)
        .await
        .unwrap();

        let capital = insert_analytics_snapshot(
            &store,
            epoch_id,
            "CAPITAL_PREVIEW",
            "PF-1",
            "USDT",
            1,
            Some(1),
        )
        .await;
        insert_analytics_fact(
            &store,
            capital,
            "capital-USDT",
            "CAPITAL_BUCKET",
            0,
            "EXECUTION",
            serde_json::json!({
                "portfolio_id":"ignored", "currency":"USDC", "allocated":"500",
                "used":"100", "reserved":"25", "maximum_allocated":"1000",
                "quality": analytics_quality(),
            }),
        )
        .await;

        let funnel =
            insert_analytics_snapshot(&store, epoch_id, "ORDER_FUNNEL", "order-1", "", 2, Some(2))
                .await;
        for (ordinal, stage, authority) in [(0, "SUBMIT", "EXECUTION"), (1, "BROKER_ACK", "BROKER")]
        {
            insert_analytics_fact(
                &store,
                funnel,
                &format!("event-{ordinal}"),
                "FUNNEL_EVENT",
                ordinal,
                authority,
                serde_json::json!({
                    "stage":stage, "source_authority":authority,
                    "source_id":format!("event-{ordinal}"), "occurred_at":at(90 + ordinal),
                    "quantity":"1", "quality":analytics_quality(),
                }),
            )
            .await;
        }

        let insight =
            insert_analytics_snapshot(&store, epoch_id, "INSIGHT_PREVIEW", "PF-1", "", 1, Some(1))
                .await;
        insert_analytics_fact(
            &store,
            insight,
            "insight-1",
            "INSIGHT_OBSERVATION",
            0,
            "EXECUTION",
            serde_json::json!({
                "insight_id":"insight-1", "portfolio_id":"ignored",
                "quality":analytics_quality(),
                "metrics":[{"metric":"NET_PNL","value":"12.500"}],
                "error_code":null, "error_message":null,
            }),
        )
        .await;

        let correlation = insert_analytics_snapshot(
            &store,
            epoch_id,
            "PORTFOLIO_CORRELATION",
            "PF-1",
            "",
            3,
            Some(2),
        )
        .await;
        for (ordinal, id, kind, payload) in [
            (
                0,
                "label-a",
                "CORRELATION_LABEL",
                serde_json::json!({"entity_id":"alpha-a","display_name":"Alpha A"}),
            ),
            (
                1,
                "label-b",
                "CORRELATION_LABEL",
                serde_json::json!({"entity_id":"alpha-b","display_name":"Alpha B"}),
            ),
            (
                2,
                "pair-ab",
                "CORRELATION_PAIR",
                serde_json::json!({
                    "left_id":"alpha-a","right_id":"alpha-b",
                    "coefficient":"0.125","sample_count":100
                }),
            ),
        ] {
            insert_analytics_fact(&store, correlation, id, kind, ordinal, "EXECUTION", payload)
                .await;
        }

        let ledger =
            insert_analytics_snapshot(&store, epoch_id, "CAPITAL_LEDGER", "PF-1", "", 1, Some(1))
                .await;
        insert_analytics_fact(
            &store,
            ledger,
            "ledger-1",
            "CAPITAL_LEDGER_ENTRY",
            0,
            "EXECUTION",
            serde_json::json!({
                "ledger_id":"ledger-1","portfolio_id":"ignored","allocation_id":null,
                "account_id":"account-1","currency":"USDT","movement_type":"ALLOCATE",
                "amount":"10","before_allocated":"0","after_allocated":"10",
                "occurred_at":at(90),"quality":analytics_quality(),
            }),
        )
        .await;

        let exposure = insert_analytics_snapshot(
            &store,
            epoch_id,
            "BINDING_EXPOSURE",
            "binding-1",
            "",
            1,
            Some(1),
        )
        .await;
        insert_analytics_fact(
            &store,
            exposure,
            "account-1-USDT",
            "VIRTUAL_ACCOUNT_EXPOSURE",
            0,
            "BROKER",
            serde_json::json!({
                "account_id":"account-1","currency":"USDT","used":"100",
                "reserved":"20","available":"80","headroom":"200",
                "quality":analytics_quality(),
            }),
        )
        .await;

        let requirement = AnalyticsReadRequirement {
            expected_profile: DeliveryProfile::Paper,
            capability_snapshot_id: "cap_analytics",
            read_at: at(100),
        };
        let portfolio = CanonicalId::parse("PF-1").unwrap();
        let currency = CurrencyCode::parse("USDT").unwrap();
        let capital_read = store
            .load_capital_preview_source(&scope, &portfolio, &currency, &requirement)
            .await
            .unwrap();
        assert_eq!(capital_read.epoch_id, epoch_id);
        assert!(
            build_capital_preview(
                &CapitalPreviewRequest {
                    portfolio_id: portfolio.clone(),
                    requested_amount: DecimalString::parse("50").unwrap(),
                    currency,
                },
                &capital_read.input,
            )
            .unwrap()
            .data
            .decision_eligible
        );
        assert_eq!(
            build_order_funnel(
                &store
                    .load_order_funnel_source(
                        &scope,
                        &CanonicalId::parse("order-1").unwrap(),
                        &requirement,
                    )
                    .await
                    .unwrap()
                    .input,
            )
            .unwrap()
            .data
            .stages
            .len(),
            4
        );
        let batch = InsightBatchRequest {
            portfolio_id: portfolio.clone(),
            items: vec![InsightItemRequest {
                insight_id: CanonicalId::parse("insight-1").unwrap(),
                alpha_id: CanonicalId::parse("alpha-a").unwrap(),
            }],
        };
        let insight_read = store
            .load_insight_preview_source(&scope, &portfolio, &requirement)
            .await
            .unwrap();
        assert_eq!(
            build_insight_batch(&batch, &insight_read.input)
                .unwrap()
                .data
                .ready_count,
            1
        );
        let correlation_read = store
            .load_correlation_source(&scope, &portfolio, &requirement)
            .await
            .unwrap();
        assert_eq!(
            build_correlation(&correlation_read.input)
                .unwrap()
                .data
                .labels
                .len(),
            2
        );
        assert_eq!(
            build_capital_ledger(
                &store
                    .load_capital_ledger_source(&scope, &portfolio, &requirement)
                    .await
                    .unwrap()
                    .input,
            )
            .unwrap()
            .data
            .buckets
            .len(),
            1
        );
        assert_eq!(
            aggregate_binding_exposure(
                &store
                    .load_binding_exposure_source(
                        &scope,
                        &CanonicalId::parse("binding-1").unwrap(),
                        &requirement,
                    )
                    .await
                    .unwrap()
                    .input,
            )
            .unwrap()
            .data
            .account_count,
            1
        );

        let wrong_profile = AnalyticsReadRequirement {
            expected_profile: DeliveryProfile::Sandbox,
            ..requirement.clone()
        };
        assert!(matches!(
            store
                .load_capital_preview_source(
                    &scope,
                    &portfolio,
                    &CurrencyCode::parse("USDT").unwrap(),
                    &wrong_profile,
                )
                .await,
            Err(StoreError::AnalyticsSourceProfileMismatch)
        ));
        let wrong_capability = AnalyticsReadRequirement {
            expected_profile: DeliveryProfile::Paper,
            capability_snapshot_id: "cap_wrong",
            read_at: at(100),
        };
        assert!(matches!(
            store
                .load_capital_preview_source(
                    &scope,
                    &portfolio,
                    &CurrencyCode::parse("USDT").unwrap(),
                    &wrong_capability,
                )
                .await,
            Err(StoreError::AnalyticsCapabilityMismatch)
        ));

        let incomplete = insert_analytics_snapshot(
            &store,
            epoch_id,
            "CAPITAL_PREVIEW",
            "PF-incomplete",
            "USDT",
            2,
            Some(1),
        )
        .await;
        insert_analytics_fact(
            &store,
            incomplete,
            "capital-incomplete-USDT",
            "CAPITAL_BUCKET",
            0,
            "EXECUTION",
            serde_json::json!({
                "portfolio_id":"ignored", "currency":"USDT", "allocated":"500",
                "used":"100", "reserved":"25", "maximum_allocated":"1000",
                "quality":analytics_quality(),
            }),
        )
        .await;
        assert!(matches!(
            store
                .load_capital_preview_source(
                    &scope,
                    &CanonicalId::parse("PF-incomplete").unwrap(),
                    &CurrencyCode::parse("USDT").unwrap(),
                    &requirement,
                )
                .await,
            Err(StoreError::AnalyticsPopulationMismatch)
        ));

        sqlx::query(
            "UPDATE portal_projection.analytics_source_snapshots
             SET venue_session_state='PAUSED' WHERE snapshot_id=$1",
        )
        .bind(correlation)
        .execute(&store.pool)
        .await
        .unwrap();
        sqlx::query(
            "UPDATE portal_projection.analytics_source_facts
             SET source_authority='BROKER' WHERE snapshot_id=$1 AND fact_id='pair-ab'",
        )
        .bind(correlation)
        .execute(&store.pool)
        .await
        .unwrap();
        reseal_analytics_snapshot(&store, correlation).await;
        let mixed_quality = store
            .load_correlation_source(&scope, &portfolio, &requirement)
            .await
            .unwrap()
            .input
            .quality;
        assert_eq!(mixed_quality.source_authority, SourceAuthority::Derived);
        assert_eq!(mixed_quality.freshness_state, FreshnessState::Paused);

        sqlx::query(
            "UPDATE portal_projection.analytics_source_facts
             SET payload=jsonb_set(payload, '{display_name}', '\"tampered\"')
             WHERE snapshot_id=$1 AND fact_id='label-a'",
        )
        .bind(correlation)
        .execute(&store.pool)
        .await
        .unwrap();
        assert!(matches!(
            store
                .load_correlation_source(&scope, &portfolio, &requirement)
                .await,
            Err(StoreError::AnalyticsSourceIntegrityMismatch)
        ));
    }
}
