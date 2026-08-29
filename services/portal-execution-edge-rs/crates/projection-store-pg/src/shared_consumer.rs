use std::time::Duration;

use chrono::{DateTime, TimeDelta, Utc};
use projection_core::ProjectionScope;
use shared_consumer_core::{
    lease_ttl_is_bounded, ConsumerLeaseGrant, ConsumerLeaseProof, LeaseOwnerDigest,
    PAPER_SOURCE_SCOPE_ID,
};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use super::{i64_from_u64, EpochWriteAuthority, PgProjectionStore, StoreError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SharedConsumerLeaseAcquireOutcome {
    Acquired(ConsumerLeaseGrant),
    AlreadyHeld(ConsumerLeaseGrant),
}

impl PgProjectionStore {
    /// Acquires the singleton workspace/Paper/source-scope consumer lease.
    ///
    /// A replacement after expiry increments the durable fencing token. An
    /// active lease owned by another worker fails closed; it is never stolen.
    /// Database time is authoritative for all expiry decisions.
    ///
    /// # Errors
    ///
    /// Rejects an invalid scope/TTL/lease ID, non-BUILDING epoch, active owner
    /// collision, fencing overflow or database failure.
    pub async fn acquire_shared_consumer_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        lease_id: Uuid,
        owner_digest: &LeaseOwnerDigest,
        ttl: Duration,
    ) -> Result<SharedConsumerLeaseAcquireOutcome, StoreError> {
        validate_lease_request(scope, lease_id, ttl)?;
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOnly,
        )
        .await?;
        let now = database_now(&mut transaction).await?;
        let expires_at = expiry_from(now, ttl)?;
        let existing = sqlx::query(
            "SELECT epoch_id, lease_id, owner_digest, fencing_token, expires_at
             FROM portal_projection.shared_consumer_leases
             WHERE workspace_id = $1 AND environment = $2 AND source_scope_id = $3
             FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(PAPER_SOURCE_SCOPE_ID)
        .fetch_optional(&mut *transaction)
        .await?;

        let (grant, already_held) = if let Some(row) = existing {
            let persisted_epoch: Uuid = row.try_get("epoch_id")?;
            let persisted_lease: Uuid = row.try_get("lease_id")?;
            let persisted_owner: String = row.try_get("owner_digest")?;
            let persisted_fence = required_fence(row.try_get("fencing_token")?)?;
            let persisted_expiry: DateTime<Utc> = row.try_get("expires_at")?;
            if persisted_expiry > now {
                if persisted_epoch != epoch_id
                    || persisted_lease != lease_id
                    || persisted_owner != owner_digest.as_str()
                {
                    return Err(StoreError::SharedConsumerLeaseBusy);
                }
                (
                    grant(
                        scope,
                        epoch_id,
                        persisted_lease,
                        persisted_fence,
                        persisted_expiry,
                    ),
                    true,
                )
            } else {
                let next_fence = persisted_fence
                    .checked_add(1)
                    .ok_or(StoreError::NumericOverflow)?;
                sqlx::query(
                    "UPDATE portal_projection.shared_consumer_leases
                     SET epoch_id = $4, lease_id = $5, owner_digest = $6,
                         fencing_token = $7, acquired_at = $8, renewed_at = $8,
                         expires_at = $9, updated_at = $8
                     WHERE workspace_id = $1 AND environment = $2 AND source_scope_id = $3",
                )
                .bind(scope.workspace_id.as_str())
                .bind(&scope.environment)
                .bind(PAPER_SOURCE_SCOPE_ID)
                .bind(epoch_id)
                .bind(lease_id)
                .bind(owner_digest.as_str())
                .bind(i64_from_u64(next_fence)?)
                .bind(now)
                .bind(expires_at)
                .execute(&mut *transaction)
                .await?;
                (
                    grant(scope, epoch_id, lease_id, next_fence, expires_at),
                    false,
                )
            }
        } else {
            sqlx::query(
                "INSERT INTO portal_projection.shared_consumer_leases
                 (workspace_id, environment, source_scope_id, epoch_id, lease_id,
                  owner_digest, fencing_token, acquired_at, renewed_at, expires_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,$8,$7)",
            )
            .bind(scope.workspace_id.as_str())
            .bind(&scope.environment)
            .bind(PAPER_SOURCE_SCOPE_ID)
            .bind(epoch_id)
            .bind(lease_id)
            .bind(owner_digest.as_str())
            .bind(now)
            .bind(expires_at)
            .execute(&mut *transaction)
            .await?;
            (grant(scope, epoch_id, lease_id, 1, expires_at), false)
        };
        transaction.commit().await?;
        Ok(if already_held {
            SharedConsumerLeaseAcquireOutcome::AlreadyHeld(grant)
        } else {
            SharedConsumerLeaseAcquireOutcome::Acquired(grant)
        })
    }

    /// Renews an exact active lease without changing its fencing token.
    ///
    /// # Errors
    ///
    /// A stale, released, expired or replaced proof is rejected.
    pub async fn renew_shared_consumer_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ConsumerLeaseProof,
        owner_digest: &LeaseOwnerDigest,
        ttl: Duration,
    ) -> Result<ConsumerLeaseGrant, StoreError> {
        validate_lease_request(scope, proof.lease_id, ttl)?;
        if proof.fencing_token == 0 {
            return Err(StoreError::InvalidSharedConsumerLease);
        }
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOnly,
        )
        .await?;
        let now = database_now(&mut transaction).await?;
        let expires_at = expiry_from(now, ttl)?;
        let updated = sqlx::query(
            "UPDATE portal_projection.shared_consumer_leases
             SET renewed_at = $8, expires_at = $9, updated_at = $8
             WHERE workspace_id = $1 AND environment = $2 AND source_scope_id = $3
               AND epoch_id = $4 AND lease_id = $5 AND owner_digest = $6
               AND fencing_token = $7 AND expires_at > $8",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(PAPER_SOURCE_SCOPE_ID)
        .bind(epoch_id)
        .bind(proof.lease_id)
        .bind(owner_digest.as_str())
        .bind(i64_from_u64(proof.fencing_token)?)
        .bind(now)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::SharedConsumerLeaseLost);
        }
        transaction.commit().await?;
        Ok(grant(
            scope,
            epoch_id,
            proof.lease_id,
            proof.fencing_token,
            expires_at,
        ))
    }

    /// Releases an exact lease immediately. A stale release cannot affect a
    /// newer fencing generation.
    ///
    /// # Errors
    ///
    /// Rejects an absent, expired or replaced proof.
    pub async fn release_shared_consumer_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ConsumerLeaseProof,
        owner_digest: &LeaseOwnerDigest,
    ) -> Result<(), StoreError> {
        if scope.environment != "paper" || proof.lease_id.is_nil() || proof.fencing_token == 0 {
            return Err(StoreError::InvalidSharedConsumerLease);
        }
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOnly,
        )
        .await?;
        let now = database_now(&mut transaction).await?;
        let updated = sqlx::query(
            "UPDATE portal_projection.shared_consumer_leases
             SET expires_at = $8, updated_at = $8
             WHERE workspace_id = $1 AND environment = $2 AND source_scope_id = $3
               AND epoch_id = $4 AND lease_id = $5 AND owner_digest = $6
               AND fencing_token = $7 AND expires_at > $8",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(PAPER_SOURCE_SCOPE_ID)
        .bind(epoch_id)
        .bind(proof.lease_id)
        .bind(owner_digest.as_str())
        .bind(i64_from_u64(proof.fencing_token)?)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(StoreError::SharedConsumerLeaseLost);
        }
        transaction.commit().await?;
        Ok(())
    }
}

pub(super) async fn validate_shared_consumer_lease_tx(
    transaction: &mut Transaction<'_, Postgres>,
    scope: &ProjectionScope,
    epoch_id: Uuid,
    proof: ConsumerLeaseProof,
) -> Result<(), StoreError> {
    let row = sqlx::query(
        "SELECT epoch_id, lease_id, fencing_token, expires_at, clock_timestamp() AS checked_at
         FROM portal_projection.shared_consumer_leases
         WHERE workspace_id = $1 AND environment = $2 AND source_scope_id = $3
         FOR UPDATE",
    )
    .bind(scope.workspace_id.as_str())
    .bind(&scope.environment)
    .bind(PAPER_SOURCE_SCOPE_ID)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(StoreError::SharedConsumerLeaseLost)?;
    let checked_at: DateTime<Utc> = row.try_get("checked_at")?;
    if row.try_get::<Uuid, _>("epoch_id")? != epoch_id
        || row.try_get::<Uuid, _>("lease_id")? != proof.lease_id
        || required_fence(row.try_get("fencing_token")?)? != proof.fencing_token
        || row.try_get::<DateTime<Utc>, _>("expires_at")? <= checked_at
    {
        return Err(StoreError::SharedConsumerLeaseLost);
    }
    Ok(())
}

fn validate_lease_request(
    scope: &ProjectionScope,
    lease_id: Uuid,
    ttl: Duration,
) -> Result<(), StoreError> {
    if scope.environment != "paper" || lease_id.is_nil() || !lease_ttl_is_bounded(ttl) {
        return Err(StoreError::InvalidSharedConsumerLease);
    }
    Ok(())
}

fn grant(
    scope: &ProjectionScope,
    epoch_id: Uuid,
    lease_id: Uuid,
    fencing_token: u64,
    expires_at: DateTime<Utc>,
) -> ConsumerLeaseGrant {
    ConsumerLeaseGrant {
        scope: scope.clone(),
        source_scope_id: PAPER_SOURCE_SCOPE_ID.to_owned(),
        epoch_id,
        lease_id,
        fencing_token,
        expires_at,
    }
}

async fn database_now(
    transaction: &mut Transaction<'_, Postgres>,
) -> Result<DateTime<Utc>, StoreError> {
    Ok(sqlx::query_scalar("SELECT clock_timestamp()")
        .fetch_one(&mut **transaction)
        .await?)
}

fn expiry_from(now: DateTime<Utc>, ttl: Duration) -> Result<DateTime<Utc>, StoreError> {
    let delta = TimeDelta::from_std(ttl).map_err(|_| StoreError::InvalidSharedConsumerLease)?;
    now.checked_add_signed(delta)
        .ok_or(StoreError::InvalidSharedConsumerLease)
}

fn required_fence(value: i64) -> Result<u64, StoreError> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(StoreError::InvalidSharedConsumerLease)
}
