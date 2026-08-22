use chrono::{DateTime, Utc};
use projection_core::{
    EpochAvailability, ProjectionEpoch, ProjectionEpochStatus, ProjectionObservation,
    ProjectionScope,
};
use sqlx::Row as _;
use uuid::Uuid;

use super::{required_u64, PgProjectionStore, StoreError};

const MAX_REALTIME_PAGE: usize = 2048;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeEpochAvailability {
    pub epoch: ProjectionEpoch,
    pub earliest_available_sequence: u64,
    pub latest_available_sequence: u64,
}

impl RealtimeEpochAvailability {
    #[must_use]
    pub const fn as_core(&self) -> EpochAvailability<'_> {
        EpochAvailability {
            epoch: &self.epoch,
            earliest_available_sequence: self.earliest_available_sequence,
            latest_available_sequence: self.latest_available_sequence,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeScopeAvailability {
    pub active: RealtimeEpochAvailability,
    pub retained_previous: Option<RealtimeEpochAvailability>,
}

/// Active epoch high-water for one workspace/environment stream. The edge
/// keeps a cursor per active epoch so BUILDING journal rows can never advance
/// or hide the delivery cursor of the currently authoritative epoch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeActiveEpochWatermark {
    pub workspace_id: String,
    pub environment: String,
    pub epoch_id: Uuid,
    pub latest_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeJournalRecord {
    pub journal_ordinal: u64,
    pub workspace_id: String,
    pub environment: String,
    pub epoch_id: Uuid,
    pub projection_sequence: u64,
    pub projected_at: DateTime<Utc>,
    pub outcome: String,
    pub observation: ProjectionObservation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeJournalPage {
    pub records: Vec<RealtimeJournalRecord>,
    pub has_more: bool,
}

impl PgProjectionStore {
    /// Lists exactly one ACTIVE epoch per scope with its committed sequence.
    /// BUILDING and retained epochs are intentionally absent from live fan-out.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when `PostgreSQL` cannot be queried or a stored
    /// sequence cannot be represented by the public unsigned contract.
    pub async fn active_realtime_epoch_watermarks(
        &self,
    ) -> Result<Vec<RealtimeActiveEpochWatermark>, StoreError> {
        let rows = sqlx::query(
            "SELECT workspace_id, environment, epoch_id, next_projection_sequence
               FROM portal_projection.epochs
              WHERE status = 'ACTIVE'
              ORDER BY workspace_id, environment, epoch_id",
        )
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| {
                Ok(RealtimeActiveEpochWatermark {
                    workspace_id: row.try_get("workspace_id")?,
                    environment: row.try_get("environment")?,
                    epoch_id: row.try_get("epoch_id")?,
                    latest_sequence: required_u64(row.try_get("next_projection_sequence")?)?,
                })
            })
            .collect()
    }

    /// Returns the active and most recent retained epoch plus exact journal
    /// bounds used by the pure resume decision. No synthetic continuity is
    /// inferred when retained history has been evicted.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when `PostgreSQL` cannot be queried, persisted
    /// values are invalid, or the scope has no active projection epoch.
    pub async fn realtime_scope_availability(
        &self,
        scope: &ProjectionScope,
    ) -> Result<RealtimeScopeAvailability, StoreError> {
        let rows = sqlx::query(
            "SELECT e.epoch_id, e.status, e.created_at, e.activated_at,
                    e.overlap_until, e.actual_state_digest,
                    e.next_projection_sequence,
                    COALESCE(
                      (SELECT MIN(j.projection_sequence)
                         FROM portal_projection.event_journal j
                        WHERE j.epoch_id = e.epoch_id
                          AND j.projection_sequence IS NOT NULL),
                      e.next_projection_sequence + 1
                    ) AS earliest_available_sequence
               FROM portal_projection.epochs e
              WHERE e.workspace_id = $1 AND e.environment = $2
                AND e.status IN ('ACTIVE', 'RETAINED')
              ORDER BY CASE e.status WHEN 'ACTIVE' THEN 0 ELSE 1 END,
                       e.activated_at DESC NULLS LAST
              LIMIT 2",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .fetch_all(&self.pool)
        .await?;

        let mut active = None;
        let mut retained_previous = None;
        for row in rows {
            let status: String = row.try_get("status")?;
            let availability = row_to_availability(&row, &status)?;
            match status.as_str() {
                "ACTIVE" => active = Some(availability),
                "RETAINED" if retained_previous.is_none() => {
                    retained_previous = Some(availability);
                }
                _ => {}
            }
        }
        Ok(RealtimeScopeAvailability {
            active: active.ok_or(StoreError::ActiveEpochNotFound)?,
            retained_previous,
        })
    }

    /// Loads a bounded replay page strictly after a Portal projection cursor.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] for an invalid page limit, numeric overflow,
    /// malformed persisted data, or a `PostgreSQL` query failure.
    pub async fn load_realtime_records(
        &self,
        epoch_id: Uuid,
        after_sequence: u64,
        limit: usize,
    ) -> Result<RealtimeJournalPage, StoreError> {
        validate_limit(limit)?;
        let rows = sqlx::query(
            "SELECT j.journal_ordinal, e.workspace_id, e.environment, j.epoch_id,
                    j.projection_sequence, j.projected_at, j.outcome, j.observation
               FROM portal_projection.event_journal j
               JOIN portal_projection.epochs e ON e.epoch_id = j.epoch_id
              WHERE j.epoch_id = $1 AND j.projection_sequence > $2
              ORDER BY j.projection_sequence
              LIMIT $3",
        )
        .bind(epoch_id)
        .bind(i64::try_from(after_sequence).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(limit + 1).map_err(|_| StoreError::NumericOverflow)?)
        .fetch_all(&self.pool)
        .await?;
        page_from_rows(rows, limit)
    }

    /// Captures the global journal high-water mark before a poller starts. A
    /// reconnect replays from its epoch cursor; the poller only fans out new
    /// commits made after edge startup.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] when `PostgreSQL` cannot be queried or the stored
    /// ordinal cannot be represented by the public unsigned contract.
    pub async fn latest_realtime_journal_ordinal(&self) -> Result<u64, StoreError> {
        let value: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(journal_ordinal), 0)
               FROM portal_projection.event_journal",
        )
        .fetch_one(&self.pool)
        .await?;
        required_u64(value)
    }

    /// Loads one bounded global tail page. Joining epoch metadata makes the
    /// fan-out workspace/environment aware without one database poll per SSE
    /// client.
    ///
    /// # Errors
    ///
    /// Returns [`StoreError`] for an invalid page limit, numeric overflow,
    /// malformed persisted data, or a `PostgreSQL` query failure.
    pub async fn load_realtime_records_after_ordinal(
        &self,
        after_ordinal: u64,
        limit: usize,
    ) -> Result<RealtimeJournalPage, StoreError> {
        validate_limit(limit)?;
        let rows = sqlx::query(
            "SELECT j.journal_ordinal, e.workspace_id, e.environment, j.epoch_id,
                    j.projection_sequence, j.projected_at, j.outcome, j.observation
               FROM portal_projection.event_journal j
               JOIN portal_projection.epochs e ON e.epoch_id = j.epoch_id
              WHERE j.journal_ordinal > $1
                AND j.projection_sequence IS NOT NULL
                AND e.status IN ('ACTIVE', 'RETAINED')
              ORDER BY j.journal_ordinal
              LIMIT $2",
        )
        .bind(i64::try_from(after_ordinal).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(limit + 1).map_err(|_| StoreError::NumericOverflow)?)
        .fetch_all(&self.pool)
        .await?;
        page_from_rows(rows, limit)
    }
}

fn validate_limit(limit: usize) -> Result<(), StoreError> {
    if (1..=MAX_REALTIME_PAGE).contains(&limit) {
        Ok(())
    } else {
        Err(StoreError::InvalidRealtimePageLimit)
    }
}

fn page_from_rows(
    mut rows: Vec<sqlx::postgres::PgRow>,
    limit: usize,
) -> Result<RealtimeJournalPage, StoreError> {
    let has_more = rows.len() > limit;
    rows.truncate(limit);
    let records = rows
        .into_iter()
        .map(|row| {
            let observation = serde_json::from_value(row.try_get("observation")?)
                .map_err(|_| StoreError::Serialization)?;
            Ok(RealtimeJournalRecord {
                journal_ordinal: required_u64(row.try_get("journal_ordinal")?)?,
                workspace_id: row.try_get("workspace_id")?,
                environment: row.try_get("environment")?,
                epoch_id: row.try_get("epoch_id")?,
                projection_sequence: required_u64(row.try_get("projection_sequence")?)?,
                projected_at: row.try_get("projected_at")?,
                outcome: row.try_get("outcome")?,
                observation,
            })
        })
        .collect::<Result<Vec<_>, StoreError>>()?;
    Ok(RealtimeJournalPage { records, has_more })
}

fn row_to_availability(
    row: &sqlx::postgres::PgRow,
    status: &str,
) -> Result<RealtimeEpochAvailability, StoreError> {
    let status = match status {
        "ACTIVE" => ProjectionEpochStatus::Active,
        "RETAINED" => ProjectionEpochStatus::Retained,
        _ => return Err(StoreError::PersistedVocabulary),
    };
    Ok(RealtimeEpochAvailability {
        epoch: ProjectionEpoch {
            epoch_id: row.try_get("epoch_id")?,
            status,
            created_at: row.try_get("created_at")?,
            activated_at: row.try_get("activated_at")?,
            overlap_until: row.try_get("overlap_until")?,
            state_digest: row.try_get("actual_state_digest")?,
        },
        earliest_available_sequence: required_u64(row.try_get("earliest_available_sequence")?)?,
        latest_available_sequence: required_u64(row.try_get("next_projection_sequence")?)?,
    })
}
