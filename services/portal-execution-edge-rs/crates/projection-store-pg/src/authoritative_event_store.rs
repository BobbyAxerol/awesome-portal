//! EDS-09 durable append store for an accepted authoritative event stream.
//!
//! This module is deliberately a storage implementation, not a source client.
//! It accepts only the private [`PendingAppend`] capability produced by
//! `authoritative-event-core`; callers cannot hand-assemble an offset advance
//! or acknowledge a source before this transaction returns a receipt.

use std::collections::BTreeMap;

use authoritative_event_core::{
    reduce_current_entity, AuthoritativeEvent, CurrentEntityState, DurableAppendReceipt,
    DurableCheckpoint, EventOperation, EventStreamBinding, FrameLane, PendingAppend,
    SnapshotBoundary, SnapshotCompleteness, SnapshotTailState, SourcePosition,
};
use serde_json::Value;
use sqlx::{postgres::PgRow, Postgres, Row, Transaction};
use uuid::Uuid;

use super::{PgProjectionStore, StoreError};

/// A deliberately bounded local journal page.  SSE fan-out is a later phase;
/// it must read these post-commit rows rather than source frames.
pub const AUTHORITATIVE_EVENT_LOCAL_JOURNAL_MAX_PAGE: usize = 2_048;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoritativeEventGenerationState {
    pub generation_id: Uuid,
    pub state: SnapshotTailState,
    pub active_for_reads: bool,
    pub checkpoint: DurableCheckpoint,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthoritativeResumeState {
    Absent,
    Checkpoint(Box<AuthoritativeEventGenerationState>),
    ResnapshotRequired {
        generation_id: Uuid,
        reason_code: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoritativeAppendQuarantine {
    pub stream_binding_digest: String,
    pub generation_id: Uuid,
    pub batch_digest: String,
    pub reason_code: &'static str,
    pub detected_at_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthoritativeAppendOutcome {
    Written(DurableAppendReceipt),
    AlreadyDurable(DurableAppendReceipt),
    Quarantined(AuthoritativeAppendQuarantine),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthoritativeLocalJournalEntry {
    pub generation_id: Uuid,
    pub source_epoch: String,
    pub committed_revision: u64,
    pub batch_digest: String,
    pub final_position: SourcePosition,
    pub record_count: usize,
    pub committed_at_ms: i64,
}

struct QuarantineRequest<'a> {
    stream_binding_digest: &'a str,
    generation_id: Uuid,
    pending: &'a PendingAppend,
    reason_code: &'static str,
    detected_at_ms: i64,
    expected: Option<&'a SourcePosition>,
    observed: Option<&'a SourcePosition>,
}

impl PgProjectionStore {
    /// Commits one source-core-staged append atomically: immutable facts,
    /// generic current reducers, durable offset and the local downstream
    /// journal.  An exact receipt is returned only after `PostgreSQL` commit.
    ///
    /// A conflict does not overwrite an accepted fact.  It writes only a
    /// redacted quarantine marker, fences the generation behind an explicit
    /// resnapshot, and returns [`AuthoritativeAppendOutcome::Quarantined`].
    /// The caller must not acknowledge the source in that outcome.
    ///
    /// # Errors
    ///
    /// Returns validation or database errors without changing source/runtime
    /// state.  This method never calls a source, cache, broker or browser.
    // The ordered transaction intentionally remains auditable as one linear
    // sequence: lock → provenance → preflight → immutable facts/current →
    // checkpoint/journal → commit. Splitting it across helpers would obscure
    // the source-ACK durability boundary that EDS-09 must preserve.
    #[allow(clippy::too_many_lines)]
    pub async fn commit_authoritative_event_append(
        &self,
        pending: &PendingAppend,
        committed_at_ms: i64,
    ) -> Result<AuthoritativeAppendOutcome, StoreError> {
        pending.validate_for_storage()?;
        let admission = pending.admission();
        let binding = &admission.binding;
        let stream_binding_digest = binding.binding_digest()?;
        let snapshot = pending.snapshot();
        let frame = pending.frame();
        let mut transaction = self.pool.begin().await?;

        // Serialize generation creation/resnapshot for exactly one binding.
        // This is a transaction-scoped lock; no process-local mutex is used.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("eds09:{stream_binding_digest}"))
            .execute(&mut *transaction)
            .await?;

        sqlx::query(
            "INSERT INTO portal_projection.authoritative_event_streams
             (stream_binding_digest,stream_id,contract_revision,workspace_id,environment,
              profile_id,venue_id,resource_kind,resource_id,filter_digest,contract_digest,
              owner_return_digest,runtime_evidence_digest,transport_contract_digest,
              local_storage_policy_digest,state,created_at_ms,updated_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                     'SNAPSHOT_BACKFILL',$16,$16)
             ON CONFLICT (stream_binding_digest) DO NOTHING",
        )
        .bind(&stream_binding_digest)
        .bind(&binding.stream_id)
        .bind(&binding.contract_revision)
        .bind(binding.workspace_id.as_str())
        .bind(&binding.environment)
        .bind(&binding.profile_id)
        .bind(&binding.venue_id)
        .bind(&binding.resource_kind)
        .bind(&binding.resource_id)
        .bind(&binding.filter_digest)
        .bind(&admission.contract_digest)
        .bind(&admission.owner_return_digest)
        .bind(&admission.runtime_evidence_digest)
        .bind(&admission.transport_contract_digest)
        .bind(&admission.local_storage_policy_digest)
        .bind(committed_at_ms)
        .execute(&mut *transaction)
        .await?;

        let stream = sqlx::query(
            "SELECT stream_id,contract_revision,workspace_id,environment,profile_id,venue_id,
                    resource_kind,resource_id,filter_digest,contract_digest,owner_return_digest,
                    runtime_evidence_digest,transport_contract_digest,local_storage_policy_digest,
                    current_generation_id,active_generation_id,state
               FROM portal_projection.authoritative_event_streams
              WHERE stream_binding_digest=$1 FOR UPDATE",
        )
        .bind(&stream_binding_digest)
        .fetch_one(&mut *transaction)
        .await?;
        if !stream_matches(&stream, admission)? {
            return Err(StoreError::AuthoritativeStreamIdentityCollision);
        }
        let stream_current_generation: Option<Uuid> = stream.try_get("current_generation_id")?;
        let stream_state: String = stream.try_get("state")?;

        let generation = sqlx::query(
            "SELECT generation_id,source_epoch,snapshot_as_of_ms,high_watermark_sequence,
                    retention_floor_sequence,committed_source_sequence,committed_revision,state,
                    resnapshot_reason_code
               FROM portal_projection.authoritative_event_generations
              WHERE stream_binding_digest=$1 AND source_epoch=$2 AND snapshot_id=$3
              FOR UPDATE",
        )
        .bind(&stream_binding_digest)
        .bind(&snapshot.high_watermark.source_epoch)
        .bind(&snapshot.snapshot_id)
        .fetch_optional(&mut *transaction)
        .await?;

        let (generation_id, committed_position, committed_revision, generation_state) =
            if let Some(generation) = generation {
                let generation_id: Uuid = generation.try_get("generation_id")?;
                if stream_current_generation != Some(generation_id)
                    || !generation_matches(&generation, snapshot)?
                {
                    return Err(StoreError::AuthoritativeGenerationNotReady);
                }
                let state = parse_generation_state(&generation.try_get::<String, _>("state")?)?;
                if state == SnapshotTailState::ResnapshotRequired {
                    return Err(StoreError::AuthoritativeGenerationNotReady);
                }
                (
                    generation_id,
                    row_position(
                        &snapshot.high_watermark.source_epoch,
                        generation.try_get("committed_source_sequence")?,
                    )?,
                    required_revision(generation.try_get("committed_revision")?)?,
                    state,
                )
            } else {
                let can_start = stream_current_generation.is_none()
                    || (stream_state == "RESNAPSHOT_REQUIRED"
                        && pending.expected_previous_position().is_none());
                if !can_start || pending.expected_previous_position().is_some() {
                    return Err(StoreError::AuthoritativeGenerationNotReady);
                }
                let generation_id = Uuid::now_v7();
                sqlx::query(
                    "INSERT INTO portal_projection.authoritative_event_generations
                     (generation_id,stream_binding_digest,source_epoch,snapshot_id,
                      snapshot_as_of_ms,high_watermark_sequence,retention_floor_sequence,
                      state,created_at_ms,updated_at_ms)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,'SNAPSHOT_BACKFILL',$8,$8)",
                )
                .bind(generation_id)
                .bind(&stream_binding_digest)
                .bind(&snapshot.high_watermark.source_epoch)
                .bind(&snapshot.snapshot_id)
                .bind(snapshot.snapshot_as_of_ms)
                .bind(&snapshot.high_watermark.source_sequence)
                .bind(&snapshot.retention_floor.source_sequence)
                .bind(committed_at_ms)
                .execute(&mut *transaction)
                .await?;
                sqlx::query(
                    "UPDATE portal_projection.authoritative_event_streams
                        SET current_generation_id=$2,state='SNAPSHOT_BACKFILL',updated_at_ms=$3
                      WHERE stream_binding_digest=$1",
                )
                .bind(&stream_binding_digest)
                .bind(generation_id)
                .bind(committed_at_ms)
                .execute(&mut *transaction)
                .await?;
                (generation_id, None, 0, SnapshotTailState::SnapshotBackfill)
            };

        if generation_state == SnapshotTailState::ResnapshotRequired {
            return Err(StoreError::AuthoritativeGenerationNotReady);
        }

        if let Some(existing) = sqlx::query(
            "SELECT lane,first_source_sequence,final_source_sequence,record_count,
                    committed_revision
               FROM portal_projection.authoritative_event_batches
              WHERE generation_id=$1 AND batch_digest=$2",
        )
        .bind(generation_id)
        .bind(pending.batch_digest())
        .fetch_optional(&mut *transaction)
        .await?
        {
            let first = frame
                .records
                .first()
                .ok_or(StoreError::AuthoritativePersistenceInvariant)?;
            let exact = existing.try_get::<String, _>("lane")? == lane_name(frame.lane)
                && existing.try_get::<String, _>("first_source_sequence")?
                    == first.source_position.source_sequence
                && existing.try_get::<String, _>("final_source_sequence")?
                    == pending.target_position().source_sequence
                && existing.try_get::<i32, _>("record_count")?
                    == i32::try_from(frame.records.len())
                        .map_err(|_| StoreError::NumericOverflow)?;
            if !exact {
                return Err(StoreError::AuthoritativePersistenceInvariant);
            }
            let receipt = DurableAppendReceipt {
                batch_digest: pending.batch_digest().to_owned(),
                committed_position: pending.target_position().clone(),
                committed_revision: required_revision(existing.try_get("committed_revision")?)?,
            };
            transaction.commit().await?;
            return Ok(AuthoritativeAppendOutcome::AlreadyDurable(receipt));
        }

        if committed_position.as_ref() != pending.expected_previous_position() {
            let outcome = quarantine_transaction(
                &mut transaction,
                QuarantineRequest {
                    stream_binding_digest: &stream_binding_digest,
                    generation_id,
                    pending,
                    reason_code: "SOURCE_OFFSET_MISMATCH",
                    detected_at_ms: committed_at_ms,
                    expected: committed_position.as_ref(),
                    observed: Some(pending.target_position()),
                },
            )
            .await?;
            transaction.commit().await?;
            return Ok(outcome);
        }

        if generation_state == SnapshotTailState::SnapshotBackfill
            && frame.lane != FrameLane::HistoryBackfill
        {
            let outcome = quarantine_transaction(
                &mut transaction,
                QuarantineRequest {
                    stream_binding_digest: &stream_binding_digest,
                    generation_id,
                    pending,
                    reason_code: "SNAPSHOT_LANE_MISMATCH",
                    detected_at_ms: committed_at_ms,
                    expected: committed_position.as_ref(),
                    observed: Some(pending.target_position()),
                },
            )
            .await?;
            transaction.commit().await?;
            return Ok(outcome);
        }
        if generation_state == SnapshotTailState::TailReady
            && !matches!(frame.lane, FrameLane::Current | FrameLane::LiveTail)
        {
            let outcome = quarantine_transaction(
                &mut transaction,
                QuarantineRequest {
                    stream_binding_digest: &stream_binding_digest,
                    generation_id,
                    pending,
                    reason_code: "TAIL_LANE_MISMATCH",
                    detected_at_ms: committed_at_ms,
                    expected: committed_position.as_ref(),
                    observed: Some(pending.target_position()),
                },
            )
            .await?;
            transaction.commit().await?;
            return Ok(outcome);
        }

        let next_revision = committed_revision
            .checked_add(1)
            .ok_or(StoreError::NumericOverflow)?;
        let mut reducer_rows = BTreeMap::new();
        let mut seen_event_ids = BTreeMap::new();
        for event in &frame.records {
            if let Some(reason) = preflight_event(
                &mut transaction,
                generation_id,
                event,
                &mut seen_event_ids,
                &mut reducer_rows,
            )
            .await?
            {
                let outcome = quarantine_transaction(
                    &mut transaction,
                    QuarantineRequest {
                        stream_binding_digest: &stream_binding_digest,
                        generation_id,
                        pending,
                        reason_code: reason,
                        detected_at_ms: committed_at_ms,
                        expected: committed_position.as_ref(),
                        observed: Some(&event.source_position),
                    },
                )
                .await?;
                transaction.commit().await?;
                return Ok(outcome);
            }
        }

        let first = frame
            .records
            .first()
            .ok_or(StoreError::AuthoritativePersistenceInvariant)?;
        sqlx::query(
            "INSERT INTO portal_projection.authoritative_event_batches
             (generation_id,batch_digest,lane,first_source_sequence,final_source_sequence,
              record_count,committed_revision,source_read_at_ms,committed_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        )
        .bind(generation_id)
        .bind(pending.batch_digest())
        .bind(lane_name(frame.lane))
        .bind(&first.source_position.source_sequence)
        .bind(&pending.target_position().source_sequence)
        .bind(i32::try_from(frame.records.len()).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(next_revision).map_err(|_| StoreError::NumericOverflow)?)
        .bind(frame.source_read_at_ms)
        .bind(committed_at_ms)
        .execute(&mut *transaction)
        .await?;

        for event in &frame.records {
            insert_fact(
                &mut transaction,
                generation_id,
                pending.batch_digest(),
                next_revision,
                committed_at_ms,
                event,
            )
            .await?;
        }
        for state in reducer_rows.values() {
            upsert_current(
                &mut transaction,
                generation_id,
                next_revision,
                committed_at_ms,
                state,
            )
            .await?;
        }

        // A complete snapshot enters TAIL_READY once. Every later CURRENT or
        // LIVE_TAIL append must preserve that state; otherwise a healthy tail
        // would regress the persisted checkpoint to snapshot backfill after a
        // process restart.
        let next_state =
            if generation_state == SnapshotTailState::TailReady || pending.snapshot_is_complete() {
                SnapshotTailState::TailReady
            } else {
                SnapshotTailState::SnapshotBackfill
            };
        sqlx::query(
            "UPDATE portal_projection.authoritative_event_generations
                SET committed_source_sequence=$2,committed_revision=$3,state=$4,
                    resnapshot_reason_code=NULL,updated_at_ms=$5
              WHERE generation_id=$1",
        )
        .bind(generation_id)
        .bind(&pending.target_position().source_sequence)
        .bind(i64::try_from(next_revision).map_err(|_| StoreError::NumericOverflow)?)
        .bind(state_name(next_state))
        .bind(committed_at_ms)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO portal_projection.authoritative_event_local_journal
             (generation_id,committed_revision,batch_digest,final_source_sequence,record_count,
              committed_at_ms)
             VALUES ($1,$2,$3,$4,$5,$6)",
        )
        .bind(generation_id)
        .bind(i64::try_from(next_revision).map_err(|_| StoreError::NumericOverflow)?)
        .bind(pending.batch_digest())
        .bind(&pending.target_position().source_sequence)
        .bind(i32::try_from(frame.records.len()).map_err(|_| StoreError::NumericOverflow)?)
        .bind(committed_at_ms)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE portal_projection.authoritative_event_streams
                SET state=$2,
                    active_generation_id=CASE WHEN $2='TAIL_READY' THEN $3
                                              ELSE active_generation_id END,
                    updated_at_ms=$4
              WHERE stream_binding_digest=$1",
        )
        .bind(&stream_binding_digest)
        .bind(state_name(next_state))
        .bind(generation_id)
        .bind(committed_at_ms)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        Ok(AuthoritativeAppendOutcome::Written(DurableAppendReceipt {
            batch_digest: pending.batch_digest().to_owned(),
            committed_position: pending.target_position().clone(),
            committed_revision: next_revision,
        }))
    }

    /// Fences a current generation after an integrity condition detected
    /// outside the SQL transaction (for example a decoded-frame or transport
    /// checksum failure).  It stores no raw payload and never contacts source.
    ///
    /// # Errors
    ///
    /// Returns an error when no durable generation exists for the exact
    /// binding or the reason code is not a bounded machine vocabulary.
    pub async fn require_authoritative_event_resnapshot(
        &self,
        binding: &EventStreamBinding,
        reason_code: &str,
        detected_at_ms: i64,
    ) -> Result<(), StoreError> {
        validate_resnapshot_reason(reason_code)?;
        let stream_binding_digest = binding.binding_digest()?;
        let mut transaction = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!("eds09:{stream_binding_digest}"))
            .execute(&mut *transaction)
            .await?;
        let stream = sqlx::query(
            "SELECT current_generation_id FROM portal_projection.authoritative_event_streams
              WHERE stream_binding_digest=$1 FOR UPDATE",
        )
        .bind(&stream_binding_digest)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(StoreError::AuthoritativeGenerationNotReady)?;
        let generation_id: Option<Uuid> = stream.try_get("current_generation_id")?;
        let generation_id = generation_id.ok_or(StoreError::AuthoritativeGenerationNotReady)?;
        sqlx::query(
            "UPDATE portal_projection.authoritative_event_generations
                SET state='RESNAPSHOT_REQUIRED',resnapshot_reason_code=$2,updated_at_ms=$3
              WHERE generation_id=$1",
        )
        .bind(generation_id)
        .bind(reason_code)
        .bind(detected_at_ms)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE portal_projection.authoritative_event_streams
                SET state='RESNAPSHOT_REQUIRED',updated_at_ms=$2
              WHERE stream_binding_digest=$1",
        )
        .bind(&stream_binding_digest)
        .bind(detected_at_ms)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO portal_projection.authoritative_event_quarantines
             (quarantine_id,stream_binding_digest,generation_id,reason_code,detected_at_ms)
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(Uuid::now_v7())
        .bind(&stream_binding_digest)
        .bind(generation_id)
        .bind(reason_code)
        .bind(detected_at_ms)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(())
    }

    /// Loads the exact local restart point for the current generation.  A
    /// resnapshot fence remains explicit rather than being turned into a
    /// fabricated continuation.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid persisted exact-decimal values or a
    /// database failure.
    pub async fn load_authoritative_event_resume_state(
        &self,
        binding: &EventStreamBinding,
    ) -> Result<AuthoritativeResumeState, StoreError> {
        binding.validate()?;
        let stream_binding_digest = binding.binding_digest()?;
        let row = sqlx::query(
            "SELECT s.active_generation_id,s.current_generation_id,g.generation_id,g.source_epoch,
                    g.snapshot_id,g.snapshot_as_of_ms,g.high_watermark_sequence,
                    g.retention_floor_sequence,g.committed_source_sequence,g.committed_revision,
                    g.state,g.resnapshot_reason_code
               FROM portal_projection.authoritative_event_streams s
               LEFT JOIN portal_projection.authoritative_event_generations g
                 ON g.generation_id=s.current_generation_id
              WHERE s.stream_binding_digest=$1",
        )
        .bind(&stream_binding_digest)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(AuthoritativeResumeState::Absent);
        };
        let generation_id: Option<Uuid> = row.try_get("generation_id")?;
        let generation_id = generation_id.ok_or(StoreError::AuthoritativePersistenceInvariant)?;
        let state = parse_generation_state(&row.try_get::<String, _>("state")?)?;
        if state == SnapshotTailState::ResnapshotRequired {
            return Ok(AuthoritativeResumeState::ResnapshotRequired {
                generation_id,
                reason_code: row
                    .try_get::<Option<String>, _>("resnapshot_reason_code")?
                    .ok_or(StoreError::AuthoritativePersistenceInvariant)?,
            });
        }
        let source_epoch: String = row.try_get("source_epoch")?;
        let high_watermark = SourcePosition::new(
            source_epoch.clone(),
            row.try_get::<String, _>("high_watermark_sequence")?,
        )?;
        let retention_floor = SourcePosition::new(
            source_epoch.clone(),
            row.try_get::<String, _>("retention_floor_sequence")?,
        )?;
        let committed_position =
            row_position(&source_epoch, row.try_get("committed_source_sequence")?)?;
        let checkpoint = DurableCheckpoint {
            snapshot: SnapshotBoundary {
                binding: binding.clone(),
                snapshot_id: row.try_get("snapshot_id")?,
                snapshot_as_of_ms: row.try_get("snapshot_as_of_ms")?,
                high_watermark,
                retention_floor,
                completeness: SnapshotCompleteness::Complete,
            },
            committed_position,
            committed_revision: required_revision(row.try_get("committed_revision")?)?,
            tail_ready: state == SnapshotTailState::TailReady,
        };
        let active_generation_id: Option<Uuid> = row.try_get("active_generation_id")?;
        if state == SnapshotTailState::TailReady && active_generation_id != Some(generation_id) {
            return Err(StoreError::AuthoritativePersistenceInvariant);
        }
        Ok(AuthoritativeResumeState::Checkpoint(Box::new(
            AuthoritativeEventGenerationState {
                generation_id,
                state,
                active_for_reads: active_generation_id == Some(generation_id),
                checkpoint,
            },
        )))
    }

    /// Reads a bounded page of the local post-commit journal.  It is a private
    /// storage primitive; no browser cursor or source cursor is exposed here.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsafe page limit or a database failure.
    pub async fn load_authoritative_event_local_journal(
        &self,
        binding: &EventStreamBinding,
        after_revision: u64,
        limit: usize,
    ) -> Result<Vec<AuthoritativeLocalJournalEntry>, StoreError> {
        if limit == 0 || limit > AUTHORITATIVE_EVENT_LOCAL_JOURNAL_MAX_PAGE {
            return Err(StoreError::InvalidRealtimePageLimit);
        }
        let stream_binding_digest = binding.binding_digest()?;
        let rows = sqlx::query(
            "SELECT j.generation_id,g.source_epoch,j.committed_revision,j.batch_digest,
                    j.final_source_sequence,j.record_count,j.committed_at_ms
               FROM portal_projection.authoritative_event_streams s
               JOIN portal_projection.authoritative_event_generations g
                 ON g.generation_id=s.active_generation_id
               JOIN portal_projection.authoritative_event_local_journal j
                 ON j.generation_id=g.generation_id
              WHERE s.stream_binding_digest=$1
                AND s.state='TAIL_READY'
                AND j.committed_revision>$2
              ORDER BY j.committed_revision
              LIMIT $3",
        )
        .bind(&stream_binding_digest)
        .bind(i64::try_from(after_revision).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(limit).map_err(|_| StoreError::NumericOverflow)?)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                let source_epoch: String = row.try_get("source_epoch")?;
                Ok(AuthoritativeLocalJournalEntry {
                    generation_id: row.try_get("generation_id")?,
                    source_epoch: source_epoch.clone(),
                    committed_revision: required_revision(row.try_get("committed_revision")?)?,
                    batch_digest: row.try_get("batch_digest")?,
                    final_position: SourcePosition::new(
                        source_epoch,
                        row.try_get::<String, _>("final_source_sequence")?,
                    )?,
                    record_count: usize::try_from(row.try_get::<i32, _>("record_count")?)
                        .map_err(|_| StoreError::NumericOverflow)?,
                    committed_at_ms: row.try_get("committed_at_ms")?,
                })
            })
            .collect()
    }
}

async fn preflight_event(
    transaction: &mut Transaction<'_, Postgres>,
    generation_id: Uuid,
    event: &AuthoritativeEvent,
    seen_event_ids: &mut BTreeMap<String, (String, String)>,
    reducer_rows: &mut BTreeMap<(String, String), CurrentEntityState>,
) -> Result<Option<&'static str>, StoreError> {
    if sqlx::query(
        "SELECT event_id,payload_digest FROM portal_projection.authoritative_event_facts
          WHERE generation_id=$1 AND source_epoch=$2 AND source_sequence=$3",
    )
    .bind(generation_id)
    .bind(&event.source_position.source_epoch)
    .bind(&event.source_position.source_sequence)
    .fetch_optional(&mut **transaction)
    .await?
    .is_some()
    {
        return Ok(Some("SOURCE_SEQUENCE_COLLISION"));
    }
    if seen_event_ids
        .insert(
            event.event_id.as_str().to_owned(),
            (
                event.entity_kind.clone(),
                event.entity_id.as_str().to_owned(),
            ),
        )
        .is_some()
        || sqlx::query(
            "SELECT event_id FROM portal_projection.authoritative_event_facts
              WHERE generation_id=$1 AND event_id=$2",
        )
        .bind(generation_id)
        .bind(event.event_id.as_str())
        .fetch_optional(&mut **transaction)
        .await?
        .is_some()
    {
        return Ok(Some("EVENT_ID_COLLISION"));
    }

    let target = match event.operation {
        EventOperation::Correction => event.correction_of_event_id.as_ref(),
        EventOperation::Tombstone => event.tombstone_of_event_id.as_ref(),
        EventOperation::Upsert => None,
    };
    if let Some(target) = target {
        let target_matches_current_batch =
            seen_event_ids
                .get(target.as_str())
                .is_some_and(|(entity_kind, entity_id)| {
                    entity_kind == &event.entity_kind && entity_id == event.entity_id.as_str()
                });
        let target_matches_store = sqlx::query(
            "SELECT entity_kind,entity_id FROM portal_projection.authoritative_event_facts
              WHERE generation_id=$1 AND event_id=$2",
        )
        .bind(generation_id)
        .bind(target.as_str())
        .fetch_optional(&mut **transaction)
        .await?
        .map(|row| {
            Ok::<bool, StoreError>(
                row.try_get::<String, _>("entity_kind")? == event.entity_kind
                    && row.try_get::<String, _>("entity_id")? == event.entity_id.as_str(),
            )
        })
        .transpose()?;
        if !target_matches_current_batch && target_matches_store != Some(true) {
            return Ok(Some("EVENT_TARGET_MISMATCH"));
        }
    }

    let key = (
        event.entity_kind.clone(),
        event.entity_id.as_str().to_owned(),
    );
    let current = if let Some(current) = reducer_rows.get(&key) {
        Some(current.clone())
    } else {
        load_current_entity(
            transaction,
            generation_id,
            &event.entity_kind,
            event.entity_id.as_str(),
        )
        .await?
    };
    let reduced = reduce_current_entity(current.as_ref(), event)?;
    reducer_rows.insert(key, reduced);
    Ok(None)
}

async fn load_current_entity(
    transaction: &mut Transaction<'_, Postgres>,
    generation_id: Uuid,
    entity_kind: &str,
    entity_id: &str,
) -> Result<Option<CurrentEntityState>, StoreError> {
    let row = sqlx::query(
        "SELECT entity_kind,entity_id,last_event_id,source_epoch,source_sequence,entity_version,
                last_operation,event_time_ms,source_published_at_ms,payload,payload_digest,tombstoned
           FROM portal_projection.authoritative_event_current
          WHERE generation_id=$1 AND entity_kind=$2 AND entity_id=$3 FOR UPDATE",
    )
    .bind(generation_id)
    .bind(entity_kind)
    .bind(entity_id)
    .fetch_optional(&mut **transaction)
    .await?;
    row.as_ref().map(current_entity_from_row).transpose()
}

async fn insert_fact(
    transaction: &mut Transaction<'_, Postgres>,
    generation_id: Uuid,
    batch_digest: &str,
    committed_revision: u64,
    committed_at_ms: i64,
    event: &AuthoritativeEvent,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO portal_projection.authoritative_event_facts
         (generation_id,source_epoch,source_sequence,event_id,entity_kind,entity_id,entity_version,
          payload_schema_revision,operation,event_time_ms,source_published_at_ms,
          correction_of_event_id,tombstone_of_event_id,causation_id,correlation_id,payload_digest,
          payload,batch_digest,committed_revision,committed_at_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)",
    )
    .bind(generation_id)
    .bind(&event.source_position.source_epoch)
    .bind(&event.source_position.source_sequence)
    .bind(event.event_id.as_str())
    .bind(&event.entity_kind)
    .bind(event.entity_id.as_str())
    .bind(&event.entity_version)
    .bind(&event.payload_schema_revision)
    .bind(operation_name(event.operation))
    .bind(event.event_time_ms)
    .bind(event.source_published_at_ms)
    .bind(
        event
            .correction_of_event_id
            .as_ref()
            .map(execution_contracts::CanonicalId::as_str),
    )
    .bind(
        event
            .tombstone_of_event_id
            .as_ref()
            .map(execution_contracts::CanonicalId::as_str),
    )
    .bind(
        event
            .causation_id
            .as_ref()
            .map(execution_contracts::CanonicalId::as_str),
    )
    .bind(
        event
            .correlation_id
            .as_ref()
            .map(execution_contracts::CanonicalId::as_str),
    )
    .bind(&event.payload_digest)
    .bind(&event.payload)
    .bind(batch_digest)
    .bind(i64::try_from(committed_revision).map_err(|_| StoreError::NumericOverflow)?)
    .bind(committed_at_ms)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn upsert_current(
    transaction: &mut Transaction<'_, Postgres>,
    generation_id: Uuid,
    committed_revision: u64,
    committed_at_ms: i64,
    state: &CurrentEntityState,
) -> Result<(), StoreError> {
    sqlx::query(
        "INSERT INTO portal_projection.authoritative_event_current
         (generation_id,entity_kind,entity_id,last_event_id,source_epoch,source_sequence,
          entity_version,last_operation,event_time_ms,source_published_at_ms,payload_digest,
          payload,tombstoned,committed_revision,updated_at_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (generation_id,entity_kind,entity_id) DO UPDATE SET
           last_event_id=EXCLUDED.last_event_id,
           source_epoch=EXCLUDED.source_epoch,
           source_sequence=EXCLUDED.source_sequence,
           entity_version=EXCLUDED.entity_version,
           last_operation=EXCLUDED.last_operation,
           event_time_ms=EXCLUDED.event_time_ms,
           source_published_at_ms=EXCLUDED.source_published_at_ms,
           payload_digest=EXCLUDED.payload_digest,
           payload=EXCLUDED.payload,
           tombstoned=EXCLUDED.tombstoned,
           committed_revision=EXCLUDED.committed_revision,
           updated_at_ms=EXCLUDED.updated_at_ms",
    )
    .bind(generation_id)
    .bind(&state.entity_kind)
    .bind(state.entity_id.as_str())
    .bind(state.last_event_id.as_str())
    .bind(&state.source_position.source_epoch)
    .bind(&state.source_position.source_sequence)
    .bind(&state.entity_version)
    .bind(operation_name(state.last_operation))
    .bind(state.event_time_ms)
    .bind(state.source_published_at_ms)
    .bind(&state.payload_digest)
    .bind(&state.payload)
    .bind(state.tombstoned)
    .bind(i64::try_from(committed_revision).map_err(|_| StoreError::NumericOverflow)?)
    .bind(committed_at_ms)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn quarantine_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    request: QuarantineRequest<'_>,
) -> Result<AuthoritativeAppendOutcome, StoreError> {
    validate_resnapshot_reason(request.reason_code)?;
    sqlx::query(
        "UPDATE portal_projection.authoritative_event_generations
            SET state='RESNAPSHOT_REQUIRED',resnapshot_reason_code=$2,updated_at_ms=$3
          WHERE generation_id=$1",
    )
    .bind(request.generation_id)
    .bind(request.reason_code)
    .bind(request.detected_at_ms)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "UPDATE portal_projection.authoritative_event_streams
            SET state='RESNAPSHOT_REQUIRED',updated_at_ms=$2
          WHERE stream_binding_digest=$1",
    )
    .bind(request.stream_binding_digest)
    .bind(request.detected_at_ms)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "INSERT INTO portal_projection.authoritative_event_quarantines
         (quarantine_id,stream_binding_digest,generation_id,batch_digest,reason_code,
          expected_source_sequence,observed_source_sequence,detected_at_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(Uuid::now_v7())
    .bind(request.stream_binding_digest)
    .bind(request.generation_id)
    .bind(request.pending.batch_digest())
    .bind(request.reason_code)
    .bind(
        request
            .expected
            .map(|position| position.source_sequence.as_str()),
    )
    .bind(
        request
            .observed
            .map(|position| position.source_sequence.as_str()),
    )
    .bind(request.detected_at_ms)
    .execute(&mut **transaction)
    .await?;
    Ok(AuthoritativeAppendOutcome::Quarantined(
        AuthoritativeAppendQuarantine {
            stream_binding_digest: request.stream_binding_digest.to_owned(),
            generation_id: request.generation_id,
            batch_digest: request.pending.batch_digest().to_owned(),
            reason_code: request.reason_code,
            detected_at_ms: request.detected_at_ms,
        },
    ))
}

fn stream_matches(
    row: &PgRow,
    admission: &authoritative_event_core::EventSourceAdmission,
) -> Result<bool, StoreError> {
    let binding = &admission.binding;
    Ok(row.try_get::<String, _>("stream_id")? == binding.stream_id
        && row.try_get::<String, _>("contract_revision")? == binding.contract_revision
        && row.try_get::<String, _>("workspace_id")? == binding.workspace_id.as_str()
        && row.try_get::<String, _>("environment")? == binding.environment
        && row.try_get::<String, _>("profile_id")? == binding.profile_id
        && row.try_get::<String, _>("venue_id")? == binding.venue_id
        && row.try_get::<String, _>("resource_kind")? == binding.resource_kind
        && row.try_get::<String, _>("resource_id")? == binding.resource_id
        && row.try_get::<String, _>("filter_digest")? == binding.filter_digest
        && row.try_get::<String, _>("contract_digest")? == admission.contract_digest
        && row.try_get::<String, _>("owner_return_digest")? == admission.owner_return_digest
        && row.try_get::<String, _>("runtime_evidence_digest")?
            == admission.runtime_evidence_digest
        && row.try_get::<String, _>("transport_contract_digest")?
            == admission.transport_contract_digest
        && row.try_get::<String, _>("local_storage_policy_digest")?
            == admission.local_storage_policy_digest)
}

fn generation_matches(row: &PgRow, snapshot: &SnapshotBoundary) -> Result<bool, StoreError> {
    Ok(
        row.try_get::<String, _>("source_epoch")? == snapshot.high_watermark.source_epoch
            && row.try_get::<i64, _>("snapshot_as_of_ms")? == snapshot.snapshot_as_of_ms
            && row.try_get::<String, _>("high_watermark_sequence")?
                == snapshot.high_watermark.source_sequence
            && row.try_get::<String, _>("retention_floor_sequence")?
                == snapshot.retention_floor.source_sequence,
    )
}

fn row_position(
    source_epoch: &str,
    source_sequence: Option<String>,
) -> Result<Option<SourcePosition>, StoreError> {
    source_sequence
        .map(|source_sequence| SourcePosition::new(source_epoch, source_sequence))
        .transpose()
        .map_err(StoreError::from)
}

fn current_entity_from_row(row: &PgRow) -> Result<CurrentEntityState, StoreError> {
    let source_epoch: String = row.try_get("source_epoch")?;
    let operation = parse_operation(&row.try_get::<String, _>("last_operation")?)?;
    let tombstoned: bool = row.try_get("tombstoned")?;
    if (operation == EventOperation::Tombstone) != tombstoned {
        return Err(StoreError::AuthoritativePersistenceInvariant);
    }
    Ok(CurrentEntityState {
        entity_kind: row.try_get("entity_kind")?,
        entity_id: execution_contracts::CanonicalId::parse(row.try_get::<String, _>("entity_id")?)?,
        last_event_id: execution_contracts::CanonicalId::parse(
            row.try_get::<String, _>("last_event_id")?,
        )?,
        source_position: SourcePosition::new(
            source_epoch,
            row.try_get::<String, _>("source_sequence")?,
        )?,
        entity_version: row.try_get("entity_version")?,
        last_operation: operation,
        event_time_ms: row.try_get("event_time_ms")?,
        source_published_at_ms: row.try_get("source_published_at_ms")?,
        payload: row.try_get::<Value, _>("payload")?,
        payload_digest: row.try_get("payload_digest")?,
        tombstoned,
    })
}

fn lane_name(lane: FrameLane) -> &'static str {
    match lane {
        FrameLane::HistoryBackfill => "HISTORY_BACKFILL",
        FrameLane::Current => "CURRENT",
        FrameLane::LiveTail => "LIVE_TAIL",
    }
}

fn operation_name(operation: EventOperation) -> &'static str {
    match operation {
        EventOperation::Upsert => "UPSERT",
        EventOperation::Tombstone => "TOMBSTONE",
        EventOperation::Correction => "CORRECTION",
    }
}

fn parse_operation(value: &str) -> Result<EventOperation, StoreError> {
    match value {
        "UPSERT" => Ok(EventOperation::Upsert),
        "TOMBSTONE" => Ok(EventOperation::Tombstone),
        "CORRECTION" => Ok(EventOperation::Correction),
        _ => Err(StoreError::AuthoritativePersistenceInvariant),
    }
}

fn state_name(state: SnapshotTailState) -> &'static str {
    match state {
        SnapshotTailState::AwaitingSnapshot
        | SnapshotTailState::AwaitingDurableCommit
        | SnapshotTailState::SnapshotBackfill => "SNAPSHOT_BACKFILL",
        SnapshotTailState::TailReady => "TAIL_READY",
        SnapshotTailState::ResnapshotRequired => "RESNAPSHOT_REQUIRED",
    }
}

fn parse_generation_state(value: &str) -> Result<SnapshotTailState, StoreError> {
    match value {
        "SNAPSHOT_BACKFILL" => Ok(SnapshotTailState::SnapshotBackfill),
        "TAIL_READY" => Ok(SnapshotTailState::TailReady),
        "RESNAPSHOT_REQUIRED" => Ok(SnapshotTailState::ResnapshotRequired),
        _ => Err(StoreError::AuthoritativePersistenceInvariant),
    }
}

fn required_revision(value: i64) -> Result<u64, StoreError> {
    u64::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

fn validate_resnapshot_reason(reason_code: &str) -> Result<(), StoreError> {
    if reason_code.len() < 2
        || reason_code.len() > 96
        || !reason_code
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_uppercase)
        || !reason_code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(StoreError::InvalidAuthoritativeResnapshotReason);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use authoritative_event_core::{
        AuthoritativeEvent, EventSourceAdmission, IngestBounds, SnapshotTailCoordinator,
        EDS09_ADMISSION_SCHEMA_VERSION,
    };
    use execution_contracts::CanonicalId;
    use projection_core::canonical_value_digest;

    use super::*;

    fn digest(value: char) -> String {
        format!("sha256:{}", value.to_string().repeat(64))
    }

    fn binding(suffix: &str) -> EventStreamBinding {
        EventStreamBinding {
            stream_id: format!("execution.fill-lifecycle.{suffix}"),
            contract_revision: "eds09-test-v1".to_owned(),
            workspace_id: CanonicalId::parse("workspace_eds09_store").unwrap(),
            environment: "paper".to_owned(),
            profile_id: "PAPER_BINANCE_USDM".to_owned(),
            venue_id: "BINANCE_USDM".to_owned(),
            resource_kind: "deployment".to_owned(),
            resource_id: "deployment_eds09_store".to_owned(),
            filter_digest: digest('a'),
        }
    }

    fn position(sequence: u64) -> SourcePosition {
        SourcePosition::new("epoch_eds09_store", sequence.to_string()).unwrap()
    }

    fn admission(suffix: &str) -> EventSourceAdmission {
        EventSourceAdmission {
            schema_version: EDS09_ADMISSION_SCHEMA_VERSION.to_owned(),
            binding: binding(suffix),
            contract_digest: digest('b'),
            owner_return_digest: digest('c'),
            runtime_evidence_digest: digest('d'),
            transport_contract_digest: digest('e'),
            local_storage_policy_digest: digest('f'),
            retention_floor: position(1),
            source_runtime_accepted: true,
            snapshot_tail_supported: true,
            correction_tombstone_supported: true,
            durable_ack_supported: true,
        }
    }

    fn boundary(binding: EventStreamBinding) -> SnapshotBoundary {
        SnapshotBoundary {
            binding,
            snapshot_id: "snapshot_eds09_store".to_owned(),
            snapshot_as_of_ms: 1_788_500_000_000,
            high_watermark: position(2),
            retention_floor: position(1),
            completeness: SnapshotCompleteness::Complete,
        }
    }

    fn event(sequence: u64, operation: EventOperation) -> AuthoritativeEvent {
        let payload = serde_json::json!({"sequence": sequence.to_string(), "state": "accepted"});
        AuthoritativeEvent {
            event_id: CanonicalId::parse(format!("event_store_{sequence}")).unwrap(),
            source_position: position(sequence),
            entity_kind: "fill".to_owned(),
            entity_id: CanonicalId::parse("fill_eds09_store").unwrap(),
            entity_version: format!("version_{sequence}"),
            payload_schema_revision: "fill-payload-v1".to_owned(),
            operation,
            event_time_ms: 1_788_500_000_000 + i64::try_from(sequence).unwrap(),
            source_published_at_ms: 1_788_500_000_100 + i64::try_from(sequence).unwrap(),
            correction_of_event_id: if operation == EventOperation::Correction {
                Some(CanonicalId::parse("event_store_1").unwrap())
            } else {
                None
            },
            tombstone_of_event_id: if operation == EventOperation::Tombstone {
                Some(CanonicalId::parse("event_store_1").unwrap())
            } else {
                None
            },
            causation_id: None,
            correlation_id: None,
            payload_digest: canonical_value_digest(&payload),
            payload,
        }
    }

    fn frame(
        binding: EventStreamBinding,
        lane: FrameLane,
        previous: Option<SourcePosition>,
        records: Vec<AuthoritativeEvent>,
        complete: bool,
    ) -> authoritative_event_core::SourceFrame {
        authoritative_event_core::SourceFrame::seal(
            binding,
            lane,
            position(2),
            previous,
            records,
            complete,
            1_788_500_000_500,
        )
        .unwrap()
    }

    async fn require_resnapshot_and_fence_journal(
        store: &PgProjectionStore,
        binding: &EventStreamBinding,
    ) {
        store
            .require_authoritative_event_resnapshot(
                binding,
                "TRANSPORT_CHECKSUM_MISMATCH",
                1_788_500_001_003,
            )
            .await
            .unwrap();
        assert!(matches!(
            store
                .load_authoritative_event_resume_state(binding)
                .await
                .unwrap(),
            AuthoritativeResumeState::ResnapshotRequired { .. }
        ));
        assert!(store
            .load_authoritative_event_local_journal(binding, 0, 8)
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn append_store_acks_only_committed_snapshot_tail_and_quarantines_bad_target() {
        let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
            return;
        };
        let store = PgProjectionStore::connect(&database_url).await.unwrap();
        store.migrate().await.unwrap();
        let suffix = Uuid::now_v7().simple().to_string();
        let admission = admission(&suffix);
        let mut coordinator =
            SnapshotTailCoordinator::new(admission.clone(), IngestBounds::default()).unwrap();
        coordinator
            .begin_snapshot(boundary(admission.binding.clone()))
            .unwrap();
        coordinator
            .prepare_append(frame(
                admission.binding.clone(),
                FrameLane::HistoryBackfill,
                None,
                vec![
                    event(1, EventOperation::Upsert),
                    event(2, EventOperation::Upsert),
                ],
                true,
            ))
            .unwrap();
        let pending = coordinator.pending_append().unwrap();
        let first = store
            .commit_authoritative_event_append(pending, 1_788_500_001_000)
            .await
            .unwrap();
        let receipt = match first {
            AuthoritativeAppendOutcome::Written(receipt) => receipt,
            other => panic!("expected durable write, got {other:?}"),
        };
        assert!(matches!(
            store
                .commit_authoritative_event_append(pending, 1_788_500_001_001)
                .await
                .unwrap(),
            AuthoritativeAppendOutcome::AlreadyDurable(_)
        ));
        coordinator.acknowledge_durable_append(receipt).unwrap();
        assert_eq!(coordinator.state(), SnapshotTailState::TailReady);

        coordinator
            .prepare_append(frame(
                admission.binding.clone(),
                FrameLane::LiveTail,
                Some(position(2)),
                vec![event(3, EventOperation::Correction)],
                false,
            ))
            .unwrap();
        let second = store
            .commit_authoritative_event_append(
                coordinator.pending_append().unwrap(),
                1_788_500_001_002,
            )
            .await
            .unwrap();
        let receipt = match second {
            AuthoritativeAppendOutcome::Written(receipt) => receipt,
            other => panic!("expected correction write, got {other:?}"),
        };
        coordinator.acknowledge_durable_append(receipt).unwrap();
        let AuthoritativeResumeState::Checkpoint(state) = store
            .load_authoritative_event_resume_state(&admission.binding)
            .await
            .unwrap()
        else {
            panic!("durable checkpoint must exist");
        };
        assert!(state.active_for_reads);
        assert_eq!(state.checkpoint.committed_position, Some(position(3)));
        assert_eq!(state.checkpoint.committed_revision, 2);
        assert!(state.checkpoint.tail_ready);
        let resumed = SnapshotTailCoordinator::resume(
            admission.clone(),
            IngestBounds::default(),
            state.checkpoint.clone(),
        )
        .unwrap();
        assert_eq!(resumed.state(), SnapshotTailState::TailReady);
        let journal = store
            .load_authoritative_event_local_journal(&admission.binding, 0, 8)
            .await
            .unwrap();
        assert_eq!(journal.len(), 2);
        assert_eq!(journal[1].final_position, position(3));

        require_resnapshot_and_fence_journal(&store, &admission.binding).await;
    }

    #[test]
    fn unsafe_quarantine_reason_is_rejected_before_database() {
        assert!(matches!(
            validate_resnapshot_reason("lowercase"),
            Err(StoreError::InvalidAuthoritativeResnapshotReason)
        ));
    }
}
