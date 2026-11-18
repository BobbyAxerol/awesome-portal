use projection_core::ProjectionScope;
use sqlx::Row as _;
use std::time::Duration;
use uuid::Uuid;

use crate::{PgProjectionStore, StoreError};

/// Database-issued start order for one Manager polling attempt. It does not
/// identify a source event and cannot establish source freshness on its own.
#[derive(Debug, Clone)]
pub struct ManagerSourceAttempt {
    pub(crate) order: i64,
    pub(crate) scope: ProjectionScope,
}

/// Health is deliberately independent of the last successful feed clocks.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub enum ManagerSourceHealth {
    #[default]
    Unknown,
    Degraded,
    Healthy,
}

impl PgProjectionStore {
    /// Reserve an order before reading any page of a source attempt.
    ///
    /// # Errors
    /// Returns a database error if a ticket cannot be issued.
    pub async fn begin_manager_source_attempt(
        &self,
        scope: &ProjectionScope,
        grace: Duration,
    ) -> Result<ManagerSourceAttempt, StoreError> {
        let grace_ms = i64::try_from(grace.as_millis())
            .ok()
            .filter(|value| (1..=86_400_000).contains(value))
            .ok_or(StoreError::ScopeMismatch)?;
        let mut transaction = self.pool.begin().await?;
        let order: i64 = sqlx::query_scalar(
            "INSERT INTO portal_projection.manager_source_attempts
                (attempt_order,workspace_id,environment,deadline)
             VALUES (nextval('portal_projection.manager_source_health_order'::regclass),
                $1,$2,clock_timestamp()+($3::bigint * interval '1 millisecond'))
             RETURNING attempt_order",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(grace_ms)
        .fetch_one(&mut *transaction)
        .await?;
        // Move expired markers atomically to a single unproven watermark per
        // scope. A partial seal cannot erase it; only a later full seal can.
        sqlx::query(
            "WITH expired AS (
               DELETE FROM portal_projection.manager_source_attempts
               WHERE workspace_id=$1 AND environment=$2
                 AND deadline <= statement_timestamp()
               RETURNING attempt_order
             )
             INSERT INTO portal_projection.manager_source_attempt_watermarks AS w
                 (workspace_id,environment,expired_order)
             SELECT $1,$2,MAX(attempt_order) FROM expired HAVING COUNT(*) > 0
             ON CONFLICT (workspace_id,environment) DO UPDATE
             SET expired_order=GREATEST(w.expired_order,EXCLUDED.expired_order)",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(ManagerSourceAttempt {
            order,
            scope: scope.clone(),
        })
    }

    /// Record a failed source attempt against the same still-active epoch.
    /// The failure receives a fresh issue order, so an earlier in-flight
    /// success cannot clear it. False means the epoch/scope was not active.
    ///
    /// # Errors
    /// Returns a database error if the failure could not be recorded.
    pub async fn record_manager_source_failure(
        &self,
        attempt: &ManagerSourceAttempt,
        epoch_id: Uuid,
    ) -> Result<bool, StoreError> {
        let mut transaction = self.pool.begin().await?;
        // Serialize failures with the cycle seal and with epoch activation.
        // A scope check without the row lock can mark an epoch after cutover.
        let active: Option<Uuid> = sqlx::query_scalar(
            "SELECT epoch_id FROM portal_projection.epochs
             WHERE epoch_id=$1 AND workspace_id=$2 AND environment=$3
               AND status='ACTIVE'
               AND adapter_version LIKE 'portal.execution.manager-projection.%'
             FOR UPDATE",
        )
        .bind(epoch_id)
        .bind(attempt.scope.workspace_id.as_str())
        .bind(&attempt.scope.environment)
        .fetch_optional(&mut *transaction)
        .await?;
        if active.is_none() || attempt.order <= 0 {
            transaction.rollback().await?;
            return Ok(false);
        }
        let result = sqlx::query(
            "INSERT INTO portal_projection.manager_source_health AS health
                 (epoch_id, last_failure_order)
             VALUES ($1, nextval('portal_projection.manager_source_health_order'::regclass))
             ON CONFLICT (epoch_id) DO UPDATE
             SET last_failure_order=GREATEST(health.last_failure_order,EXCLUDED.last_failure_order)",
        )
        .bind(epoch_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM portal_projection.manager_source_attempts WHERE attempt_order=$1 AND workspace_id=$2 AND environment=$3")
            .bind(attempt.order)
            .bind(attempt.scope.workspace_id.as_str())
            .bind(&attempt.scope.environment)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(result.rows_affected() == 1)
    }

    /// Mark the Manager epoch currently serving this scope after an attempt
    /// failed. Selecting under the epoch lock prevents writing to a retained
    /// predecessor when cutover occurred during the source request.
    ///
    /// # Errors
    /// Returns a database error when the status cannot be persisted.
    pub async fn record_manager_source_failure_for_active_scope(
        &self,
        attempt: &ManagerSourceAttempt,
    ) -> Result<bool, StoreError> {
        if attempt.order <= 0 {
            return Err(StoreError::ScopeMismatch);
        }
        let mut transaction = self.pool.begin().await?;
        let mut epoch: Option<Uuid> = None;
        // A READ COMMITTED scan can wait on the old ACTIVE row and then
        // discover it is RETAINED after a concurrent activation. Retry once
        // with a new statement snapshot to see its successor.
        for _ in 0..2 {
            epoch = sqlx::query_scalar(
                "SELECT epoch_id FROM portal_projection.epochs
             WHERE workspace_id=$1 AND environment=$2 AND status='ACTIVE'
               AND adapter_version LIKE 'portal.execution.manager-projection.%'
             FOR UPDATE",
            )
            .bind(attempt.scope.workspace_id.as_str())
            .bind(&attempt.scope.environment)
            .fetch_optional(&mut *transaction)
            .await?;
            if epoch.is_some() {
                break;
            }
        }
        let Some(epoch_id) = epoch else {
            sqlx::query("DELETE FROM portal_projection.manager_source_attempts WHERE attempt_order=$1 AND workspace_id=$2 AND environment=$3")
                .bind(attempt.order)
                .bind(attempt.scope.workspace_id.as_str())
                .bind(&attempt.scope.environment)
                .execute(&mut *transaction)
                .await?;
            transaction.commit().await?;
            return Ok(false);
        };
        sqlx::query(
            "INSERT INTO portal_projection.manager_source_health AS health
                 (epoch_id,last_failure_order)
             VALUES ($1,nextval('portal_projection.manager_source_health_order'::regclass))
             ON CONFLICT (epoch_id) DO UPDATE
             SET last_failure_order=GREATEST(health.last_failure_order,EXCLUDED.last_failure_order)",
        )
        .bind(epoch_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query("DELETE FROM portal_projection.manager_source_attempts WHERE attempt_order=$1 AND workspace_id=$2 AND environment=$3")
            .bind(attempt.order)
            .bind(attempt.scope.workspace_id.as_str())
            .bind(&attempt.scope.environment)
            .execute(&mut *transaction)
            .await?;
        transaction.commit().await?;
        Ok(true)
    }

    /// Read status for one active scope without treating missing proof as
    /// fresh. Healthy is bound to the exact sealed heartbeat and sequence.
    ///
    /// # Errors
    /// Returns a database error if the scope cannot be queried.
    pub async fn load_manager_source_health(
        &self,
        scope: &ProjectionScope,
    ) -> Result<ManagerSourceHealth, StoreError> {
        let row = sqlx::query(
            "SELECT health.last_failure_order,health.cleared_by_attempt,
                    health.sealed_observed_at,health.sealed_sequence,
                    h.observed_at,h.sealed_projection_sequence,e.next_projection_sequence,
                    EXISTS (SELECT 1 FROM portal_projection.manager_source_attempts p
                        WHERE p.workspace_id=e.workspace_id AND p.environment=e.environment
                          AND p.deadline <= statement_timestamp())
                    OR EXISTS (SELECT 1 FROM portal_projection.manager_source_attempt_watermarks w
                        WHERE w.workspace_id=e.workspace_id AND w.environment=e.environment)
                    AS attempt_timed_out
             FROM portal_projection.epochs e
             LEFT JOIN portal_projection.manager_source_health health USING (epoch_id)
             LEFT JOIN portal_projection.manager_projection_heartbeats h USING (epoch_id)
             WHERE e.workspace_id=$1 AND e.environment=$2 AND e.status='ACTIVE'
               AND e.adapter_version LIKE 'portal.execution.manager-projection.%'",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .fetch_optional(&self.pool)
        .await?;
        let Some(row) = row else {
            return Ok(ManagerSourceHealth::Unknown);
        };
        manager_source_health_from_row(&row)
    }
}

/// Classify only values captured together in one database snapshot.
pub(crate) fn manager_source_health_from_row(
    row: &sqlx::postgres::PgRow,
) -> Result<ManagerSourceHealth, StoreError> {
    let failure: Option<i64> = row.try_get("last_failure_order")?;
    let cleared: Option<i64> = row.try_get("cleared_by_attempt")?;
    if failure
        .zip(cleared)
        .is_some_and(|(failure, cleared)| failure > 0 && failure >= cleared)
    {
        return Ok(ManagerSourceHealth::Degraded);
    }
    if row.try_get::<bool, _>("attempt_timed_out")? {
        return Ok(ManagerSourceHealth::Unknown);
    }
    let sealed_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("sealed_observed_at")?;
    let heartbeat_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("observed_at")?;
    let sealed: Option<i64> = row.try_get("sealed_sequence")?;
    let heartbeat_sealed: Option<i64> = row.try_get("sealed_projection_sequence")?;
    let actual: i64 = row.try_get("next_projection_sequence")?;
    if cleared.is_some_and(|order| order > 0)
        && sealed_at.is_some()
        && sealed_at == heartbeat_at
        && sealed == Some(actual)
        && sealed == heartbeat_sealed
    {
        Ok(ManagerSourceHealth::Healthy)
    } else {
        Ok(ManagerSourceHealth::Unknown)
    }
}
