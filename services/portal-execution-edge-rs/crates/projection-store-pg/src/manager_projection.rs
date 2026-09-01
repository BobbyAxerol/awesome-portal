use std::{collections::BTreeSet, time::Duration};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use projection_core::{
    canonical_digest, semantic_state_digest, ProjectionEntityKey, ProjectionEntityKind,
    ProjectionObservation, ProjectionOperation, ProjectionScope, ProjectionSnapshot,
    SnapshotCompleteness, SourceSequenceSemantics,
};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use super::{
    i64_from_u64, ActivatedEpoch, EpochWriteAuthority, PgProjectionStore, StoreApplyOutcome,
    StoreError,
};

pub const MANAGER_PROJECTION_SOURCE_SCOPE: &str = "MANAGER_V2";
const MINIMUM_LEASE_TTL: Duration = Duration::from_secs(5);
const MAXIMUM_LEASE_TTL: Duration = Duration::from_secs(900);
const REQUIRED_SNAPSHOT_KINDS: [&str; 8] = [
    "ACCOUNT",
    "EVENT",
    "FILL",
    "ORDER",
    "PERFORMANCE",
    "POSITION",
    "RECONCILIATION",
    "RUNTIME",
];

/// Computes the content identity of one Manager snapshot without transport
/// receipt timestamps, cursors or ingestion identifiers. Those fields prove
/// observation freshness, but they must not turn an unchanged full snapshot
/// into thousands of false business deltas.
///
/// # Errors
///
/// Returns a projection serialization error for a non-canonical payload.
pub fn manager_snapshot_semantic_digest(
    observations: &[ProjectionObservation],
) -> Result<String, StoreError> {
    canonical_digest(
        &observations
            .iter()
            .map(manager_observation_semantic_value)
            .collect::<Vec<_>>(),
    )
    .map_err(StoreError::from)
}

/// Computes the idempotency identity for one Manager snapshot fact. Transport
/// receipt timestamps and retrieval cursors are intentionally absent; poll
/// liveness is persisted in the bounded epoch heartbeat instead.
fn manager_observation_semantic_digest(
    observation: &ProjectionObservation,
) -> Result<String, StoreError> {
    canonical_digest(&manager_observation_semantic_value(observation)).map_err(StoreError::from)
}

fn manager_observation_semantic_value(observation: &ProjectionObservation) -> serde_json::Value {
    serde_json::json!({
        "entity": &observation.entity,
        "operation": observation.operation,
        "source_authority": observation.source_authority,
        "source_completeness": observation.source_completeness,
        "poll_interval_ms": observation.poll_interval_ms,
        "adapter_version": &observation.adapter_version,
        "capability_snapshot_id": &observation.capability_snapshot_id,
        "payload": &observation.payload,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagerProjectionLeaseProof {
    pub lease_id: Uuid,
    pub fencing_token: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerProjectionLeaseGrant {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub lease_id: Uuid,
    pub fencing_token: u64,
    pub expires_at: DateTime<Utc>,
}

impl ManagerProjectionLeaseGrant {
    #[must_use]
    pub const fn proof(&self) -> ManagerProjectionLeaseProof {
        ManagerProjectionLeaseProof {
            lease_id: self.lease_id,
            fencing_token: self.fencing_token,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagerProjectionLeaseAcquireOutcome {
    Acquired(ManagerProjectionLeaseGrant),
    AlreadyHeld(ManagerProjectionLeaseGrant),
}

#[derive(Debug, Clone)]
pub struct ManagerSnapshotCommitInput {
    pub cycle_id: CanonicalId,
    pub profile_id: String,
    pub catalogue_digest: String,
    pub source_input_digest: String,
    pub source_read_at: DateTime<Utc>,
    pub poll_interval_ms: i64,
    pub snapshot: ProjectionSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerSnapshotCommitReceipt {
    pub snapshot_id: CanonicalId,
    pub entity_kind: ProjectionEntityKind,
    pub applied_count: usize,
    pub removed_count: usize,
    pub state_digest: String,
    pub already_durable: bool,
}

#[derive(Debug, Clone)]
pub struct ManagerCycleCommitInput {
    pub cycle_id: CanonicalId,
    pub profile_id: String,
    pub catalogue_digest: String,
    pub source_input_digest: String,
    pub feed_count: usize,
    pub record_count: usize,
    pub source_read_at: DateTime<Utc>,
    pub poll_interval_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerProjectionCycleReceipt {
    pub cycle_id: CanonicalId,
    pub state_digest: String,
    pub already_durable: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagerProjectionEpochSelection {
    pub epoch_id: Uuid,
    pub status: projection_core::ProjectionEpochStatus,
    pub created: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerProjectionRollback {
    pub restored_epoch_id: Uuid,
    pub failed_epoch_id: Uuid,
    pub restored_state_digest: String,
}

impl PgProjectionStore {
    /// Selects the newest exact N24 ACTIVE/BUILDING epoch or creates a new
    /// BUILDING epoch when compatibility identity changed.
    ///
    /// # Errors
    ///
    /// Rejects invalid metadata and database failures. It never reuses an
    /// incompatible epoch.
    pub async fn ensure_manager_projection_epoch(
        &self,
        scope: &ProjectionScope,
        metadata: &super::EpochMetadata,
        created_at: DateTime<Utc>,
    ) -> Result<ManagerProjectionEpochSelection, StoreError> {
        metadata.validate()?;
        if let Some(row) = sqlx::query(
            "SELECT epoch_id,status FROM portal_projection.epochs
             WHERE workspace_id=$1 AND environment=$2
               AND adapter_version=$3 AND source_gateway_digest=$4
               AND capability_snapshot_id=$5 AND status IN ('ACTIVE','BUILDING')
             ORDER BY CASE status WHEN 'BUILDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&metadata.adapter_version)
        .bind(&metadata.source_gateway_digest)
        .bind(&metadata.capability_snapshot_id)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(ManagerProjectionEpochSelection {
                epoch_id: row.try_get("epoch_id")?,
                status: parse_epoch_status(&row.try_get::<String, _>("status")?)?,
                created: false,
            });
        }
        let epoch_id = self
            .create_building_epoch(scope, metadata, created_at)
            .await?;
        Ok(ManagerProjectionEpochSelection {
            epoch_id,
            status: projection_core::ProjectionEpochStatus::Building,
            created: true,
        })
    }

    /// Prepares exactly one same-compatibility BUILDING epoch for an explicit
    /// rebuild. A transaction-scoped advisory lock prevents horizontally
    /// scaled operators from creating parallel rebuilds for one profile.
    ///
    /// # Errors
    ///
    /// Rejects metadata drift while a BUILDING epoch already exists and all
    /// database failures.
    pub async fn prepare_manager_projection_rebuild_epoch(
        &self,
        scope: &ProjectionScope,
        metadata: &super::EpochMetadata,
        created_at: DateTime<Utc>,
    ) -> Result<ManagerProjectionEpochSelection, StoreError> {
        metadata.validate()?;
        let mut transaction = self.pool.begin().await?;
        let lock_identity = format!(
            "n24-manager-rebuild:{}:{}",
            scope.workspace_id.as_str(),
            scope.environment
        );
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(lock_identity)
            .execute(&mut *transaction)
            .await?;
        if let Some(row) = sqlx::query(
            "SELECT epoch_id,adapter_version,source_gateway_digest,capability_snapshot_id
             FROM portal_projection.epochs
             WHERE workspace_id=$1 AND environment=$2 AND status='BUILDING'
             ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .fetch_optional(&mut *transaction)
        .await?
        {
            if row.try_get::<String, _>("adapter_version")? != metadata.adapter_version
                || row.try_get::<String, _>("source_gateway_digest")?
                    != metadata.source_gateway_digest
                || row.try_get::<String, _>("capability_snapshot_id")?
                    != metadata.capability_snapshot_id
            {
                return Err(StoreError::ManagerProjectionRebuildBusy);
            }
            let epoch_id = row.try_get("epoch_id")?;
            transaction.commit().await?;
            return Ok(ManagerProjectionEpochSelection {
                epoch_id,
                status: projection_core::ProjectionEpochStatus::Building,
                created: false,
            });
        }
        let epoch_id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.epochs
             (epoch_id,workspace_id,environment,status,adapter_version,
              source_gateway_digest,capability_snapshot_id,created_at)
             VALUES ($1,$2,$3,'BUILDING',$4,$5,$6,$7)",
        )
        .bind(epoch_id)
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(&metadata.adapter_version)
        .bind(&metadata.source_gateway_digest)
        .bind(&metadata.capability_snapshot_id)
        .bind(created_at)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(ManagerProjectionEpochSelection {
            epoch_id,
            status: projection_core::ProjectionEpochStatus::Building,
            created: true,
        })
    }

    /// Acquires one database-clock/fencing-token lease per workspace/profile.
    ///
    /// # Errors
    ///
    /// Rejects invalid TTL/owner/scope, non-writable epochs and active owners.
    #[allow(clippy::too_many_arguments)]
    pub async fn acquire_manager_projection_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        lease_id: Uuid,
        owner_digest: &str,
        ttl: Duration,
    ) -> Result<ManagerProjectionLeaseAcquireOutcome, StoreError> {
        validate_lease_input(lease_id, owner_digest, ttl)?;
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOrActive,
        )
        .await?;
        let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
            .fetch_one(&mut *transaction)
            .await?;
        let expires_at = now
            .checked_add_signed(
                TimeDelta::from_std(ttl).map_err(|_| StoreError::InvalidManagerProjectionLease)?,
            )
            .ok_or(StoreError::InvalidManagerProjectionLease)?;
        let existing = sqlx::query(
            "SELECT epoch_id,lease_id,owner_digest,fencing_token,expires_at
             FROM portal_projection.manager_projection_leases
             WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3
             FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
        .fetch_optional(&mut *transaction)
        .await?;
        let (grant, already) = if let Some(row) = existing {
            let persisted_expiry: DateTime<Utc> = row.try_get("expires_at")?;
            let persisted_fence = required_fence(row.try_get("fencing_token")?)?;
            if persisted_expiry > now {
                if row.try_get::<Uuid, _>("epoch_id")? != epoch_id
                    || row.try_get::<Uuid, _>("lease_id")? != lease_id
                    || row.try_get::<String, _>("owner_digest")? != owner_digest
                {
                    return Err(StoreError::ManagerProjectionLeaseBusy);
                }
                (
                    lease_grant(scope, epoch_id, lease_id, persisted_fence, persisted_expiry),
                    true,
                )
            } else {
                let fence = persisted_fence
                    .checked_add(1)
                    .ok_or(StoreError::NumericOverflow)?;
                sqlx::query(
                    "UPDATE portal_projection.manager_projection_leases
                     SET epoch_id=$4,lease_id=$5,owner_digest=$6,fencing_token=$7,
                         acquired_at=$8,renewed_at=$8,expires_at=$9,updated_at=$8
                     WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3",
                )
                .bind(scope.workspace_id.as_str())
                .bind(&scope.environment)
                .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
                .bind(epoch_id)
                .bind(lease_id)
                .bind(owner_digest)
                .bind(i64_from_u64(fence)?)
                .bind(now)
                .bind(expires_at)
                .execute(&mut *transaction)
                .await?;
                (
                    lease_grant(scope, epoch_id, lease_id, fence, expires_at),
                    false,
                )
            }
        } else {
            sqlx::query(
                "INSERT INTO portal_projection.manager_projection_leases
                 (workspace_id,environment,source_scope_id,epoch_id,lease_id,owner_digest,
                  fencing_token,acquired_at,renewed_at,expires_at,updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7,$8,$7)",
            )
            .bind(scope.workspace_id.as_str())
            .bind(&scope.environment)
            .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
            .bind(epoch_id)
            .bind(lease_id)
            .bind(owner_digest)
            .bind(now)
            .bind(expires_at)
            .execute(&mut *transaction)
            .await?;
            (lease_grant(scope, epoch_id, lease_id, 1, expires_at), false)
        };
        transaction.commit().await?;
        Ok(if already {
            ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(grant)
        } else {
            ManagerProjectionLeaseAcquireOutcome::Acquired(grant)
        })
    }

    /// Renews an exact lease. Database time remains authoritative.
    ///
    /// # Errors
    ///
    /// Rejects an expired, stale or replaced fencing proof.
    pub async fn renew_manager_projection_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ManagerProjectionLeaseProof,
        owner_digest: &str,
        ttl: Duration,
    ) -> Result<ManagerProjectionLeaseGrant, StoreError> {
        validate_lease_input(proof.lease_id, owner_digest, ttl)?;
        if proof.fencing_token == 0 {
            return Err(StoreError::InvalidManagerProjectionLease);
        }
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOrActive,
        )
        .await?;
        let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
            .fetch_one(&mut *transaction)
            .await?;
        let expires_at = now
            .checked_add_signed(
                TimeDelta::from_std(ttl).map_err(|_| StoreError::InvalidManagerProjectionLease)?,
            )
            .ok_or(StoreError::InvalidManagerProjectionLease)?;
        let changed = sqlx::query(
            "UPDATE portal_projection.manager_projection_leases
             SET renewed_at=$8,expires_at=$9,updated_at=$8
             WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3
               AND epoch_id=$4 AND lease_id=$5 AND owner_digest=$6
               AND fencing_token=$7 AND expires_at>$8",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
        .bind(epoch_id)
        .bind(proof.lease_id)
        .bind(owner_digest)
        .bind(i64_from_u64(proof.fencing_token)?)
        .bind(now)
        .bind(expires_at)
        .execute(&mut *transaction)
        .await?;
        if changed.rows_affected() != 1 {
            return Err(StoreError::ManagerProjectionLeaseLost);
        }
        transaction.commit().await?;
        Ok(lease_grant(
            scope,
            epoch_id,
            proof.lease_id,
            proof.fencing_token,
            expires_at,
        ))
    }

    /// Releases an exact Manager projection lease. A stale proof cannot
    /// release a newer fencing generation.
    ///
    /// # Errors
    ///
    /// Rejects absent, expired or replaced proofs.
    pub async fn release_manager_projection_lease(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ManagerProjectionLeaseProof,
    ) -> Result<(), StoreError> {
        if proof.lease_id.is_nil() || proof.fencing_token == 0 {
            return Err(StoreError::InvalidManagerProjectionLease);
        }
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOrActive,
        )
        .await?;
        let now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
            .fetch_one(&mut *transaction)
            .await?;
        let changed = sqlx::query(
            "UPDATE portal_projection.manager_projection_leases
             SET expires_at=$8,updated_at=$8
             WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3
               AND epoch_id=$4 AND lease_id=$5 AND fencing_token=$6 AND expires_at>$7",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
        .bind(epoch_id)
        .bind(proof.lease_id)
        .bind(i64_from_u64(proof.fencing_token)?)
        .bind(now)
        .bind(now)
        .execute(&mut *transaction)
        .await?;
        if changed.rows_affected() != 1 {
            return Err(StoreError::ManagerProjectionLeaseLost);
        }
        transaction.commit().await?;
        Ok(())
    }

    /// Commits one complete entity-kind snapshot under the exact lease fence.
    /// Missing rows become explicit Portal-owned tombstone observations.
    ///
    /// # Errors
    ///
    /// Rejects partial snapshots, metadata drift, stale leases, collisions,
    /// out-of-order input and database failures atomically.
    #[allow(clippy::too_many_lines)] // One transaction owns validation, reduction and evidence.
    pub async fn commit_manager_projection_snapshot(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ManagerProjectionLeaseProof,
        input: &ManagerSnapshotCommitInput,
        committed_at: DateTime<Utc>,
    ) -> Result<ManagerSnapshotCommitReceipt, StoreError> {
        validate_snapshot_input(scope, input)?;
        let validated = ProjectionSnapshot::new(
            input.snapshot.snapshot_id.clone(),
            input.snapshot.entity_kind,
            input.snapshot.completeness,
            input.snapshot.expected_count,
            input.snapshot.observations.clone(),
        )?;
        let source_input_digest = manager_snapshot_semantic_digest(&validated.observations)?;
        if source_input_digest != input.source_input_digest {
            return Err(StoreError::ManagerProjectionInputDigestMismatch);
        }
        let mut transaction = self.pool.begin().await?;
        validate_lease_tx(&mut transaction, scope, epoch_id, proof).await?;
        let prior = sqlx::query(
            "SELECT entity_kind,source_input_digest,applied_count,removed_count,state_digest
             FROM portal_projection.manager_projection_commits
             WHERE epoch_id=$1 AND snapshot_id=$2",
        )
        .bind(epoch_id)
        .bind(input.snapshot.snapshot_id.as_str())
        .fetch_optional(&mut *transaction)
        .await?;
        if let Some(row) = prior {
            if row.try_get::<String, _>("entity_kind")? != input.snapshot.entity_kind.as_str()
                || row.try_get::<String, _>("source_input_digest")? != input.source_input_digest
            {
                return Err(StoreError::ManagerProjectionCommitCollision);
            }
            transaction.commit().await?;
            return Ok(ManagerSnapshotCommitReceipt {
                snapshot_id: input.snapshot.snapshot_id.clone(),
                entity_kind: input.snapshot.entity_kind,
                applied_count: required_usize(row.try_get("applied_count")?)?,
                removed_count: required_usize(row.try_get("removed_count")?)?,
                state_digest: row.try_get("state_digest")?,
                already_durable: true,
            });
        }
        let mut sequence = self
            .lock_epoch_tx(
                &mut transaction,
                scope,
                epoch_id,
                EpochWriteAuthority::BuildingOrActive,
            )
            .await?;
        let stream_key = format!(
            "n24:{}:{}",
            input.profile_id,
            input.snapshot.entity_kind.as_str()
        );
        let mut applied_count = 0_usize;
        for observation in &validated.observations {
            let input_digest = manager_observation_semantic_digest(observation)?;
            match self
                .apply_observation_locked_tx(
                    &mut transaction,
                    scope,
                    epoch_id,
                    &mut sequence,
                    &stream_key,
                    observation,
                    &input_digest,
                    committed_at,
                )
                .await?
            {
                StoreApplyOutcome::Applied { .. }
                | StoreApplyOutcome::Refreshed { .. }
                | StoreApplyOutcome::GapApplied { .. } => applied_count += 1,
                StoreApplyOutcome::Duplicate { .. } => {}
                StoreApplyOutcome::OutOfOrder | StoreApplyOutcome::DeadLettered { .. } => {
                    return Err(StoreError::ManagerProjectionSnapshotRejected);
                }
            }
        }
        let desired = validated
            .observations
            .iter()
            .map(|observation| observation.entity.entity_id.as_str().to_owned())
            .collect::<BTreeSet<_>>();
        let existing = sqlx::query_scalar::<_, String>(
            "SELECT entity_id FROM portal_projection.entities
             WHERE epoch_id=$1 AND entity_kind=$2 ORDER BY entity_id",
        )
        .bind(epoch_id)
        .bind(input.snapshot.entity_kind.as_str())
        .fetch_all(&mut *transaction)
        .await?;
        let mut removed_count = 0_usize;
        for entity_id in existing.into_iter().filter(|id| !desired.contains(id)) {
            let tombstone = tombstone_observation(input, entity_id)?;
            let input_digest = manager_observation_semantic_digest(&tombstone)?;
            match self
                .apply_observation_locked_tx(
                    &mut transaction,
                    scope,
                    epoch_id,
                    &mut sequence,
                    &stream_key,
                    &tombstone,
                    &input_digest,
                    committed_at,
                )
                .await?
            {
                StoreApplyOutcome::Applied { .. }
                | StoreApplyOutcome::Refreshed { .. }
                | StoreApplyOutcome::GapApplied { .. } => removed_count += 1,
                StoreApplyOutcome::Duplicate { .. } => {}
                StoreApplyOutcome::OutOfOrder | StoreApplyOutcome::DeadLettered { .. } => {
                    return Err(StoreError::ManagerProjectionSnapshotRejected);
                }
            }
        }
        let entities = load_entities_tx(&mut transaction, epoch_id).await?;
        let state_digest = semantic_state_digest(&entities)?;
        sqlx::query(
            "INSERT INTO portal_projection.snapshots
             (epoch_id,snapshot_id,entity_kind,completeness,expected_count,applied_count,
              removed_count,source_read_at,committed_at,state_digest)
             VALUES ($1,$2,$3,'COMPLETE',$4,$5,$6,$7,$8,$9)",
        )
        .bind(epoch_id)
        .bind(input.snapshot.snapshot_id.as_str())
        .bind(input.snapshot.entity_kind.as_str())
        .bind(
            i64::try_from(input.snapshot.expected_count)
                .map_err(|_| StoreError::NumericOverflow)?,
        )
        .bind(i64::try_from(applied_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(removed_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(input.source_read_at)
        .bind(committed_at)
        .bind(&state_digest)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "INSERT INTO portal_projection.manager_projection_commits
             (epoch_id,snapshot_id,cycle_id,profile_id,entity_kind,source_input_digest,
              catalogue_digest,fencing_token,expected_count,applied_count,removed_count,
              source_read_at,committed_at,state_digest)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        )
        .bind(epoch_id)
        .bind(input.snapshot.snapshot_id.as_str())
        .bind(input.cycle_id.as_str())
        .bind(&input.profile_id)
        .bind(input.snapshot.entity_kind.as_str())
        .bind(&input.source_input_digest)
        .bind(&input.catalogue_digest)
        .bind(i64_from_u64(proof.fencing_token)?)
        .bind(
            i64::try_from(input.snapshot.expected_count)
                .map_err(|_| StoreError::NumericOverflow)?,
        )
        .bind(i64::try_from(applied_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(i64::try_from(removed_count).map_err(|_| StoreError::NumericOverflow)?)
        .bind(input.source_read_at)
        .bind(committed_at)
        .bind(&state_digest)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(ManagerSnapshotCommitReceipt {
            snapshot_id: input.snapshot.snapshot_id.clone(),
            entity_kind: input.snapshot.entity_kind,
            applied_count,
            removed_count,
            state_digest,
            already_durable: false,
        })
    }

    /// Seals a cycle only after all eight entity-kind snapshots are durable.
    ///
    /// # Errors
    ///
    /// Rejects incomplete cycles, metadata drift, stale fences or collisions.
    pub async fn commit_manager_projection_cycle(
        &self,
        scope: &ProjectionScope,
        epoch_id: Uuid,
        proof: ManagerProjectionLeaseProof,
        input: &ManagerCycleCommitInput,
        committed_at: DateTime<Utc>,
    ) -> Result<ManagerProjectionCycleReceipt, StoreError> {
        validate_cycle_input(scope, input)?;
        let mut transaction = self.pool.begin().await?;
        validate_lease_tx(&mut transaction, scope, epoch_id, proof).await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            epoch_id,
            EpochWriteAuthority::BuildingOrActive,
        )
        .await?;
        let receipt = if let Some(receipt) =
            reuse_manager_projection_cycle_tx(&mut transaction, epoch_id, input, committed_at)
                .await?
        {
            receipt
        } else {
            seal_manager_projection_cycle_tx(&mut transaction, epoch_id, input, committed_at)
                .await?
        };
        transaction.commit().await?;
        Ok(receipt)
    }

    /// Atomically activates a complete parity-matched N24 epoch and retains
    /// the previous epoch for rollback.
    ///
    /// # Errors
    ///
    /// Rejects incomplete cycles, digest drift, blockers and invalid overlap.
    pub async fn activate_manager_projection_epoch(
        &self,
        scope: &ProjectionScope,
        candidate_epoch_id: Uuid,
        expected_state_digest: &str,
        activated_at: DateTime<Utc>,
        overlap: Duration,
    ) -> Result<ActivatedEpoch, StoreError> {
        let overlap = TimeDelta::from_std(overlap).map_err(|_| StoreError::InvalidOverlap)?;
        if overlap < TimeDelta::minutes(5) || overlap > TimeDelta::hours(24) {
            return Err(StoreError::InvalidOverlap);
        }
        let mut transaction = self.pool.begin().await?;
        self.lock_epoch_tx(
            &mut transaction,
            scope,
            candidate_epoch_id,
            EpochWriteAuthority::BuildingOnly,
        )
        .await?;
        let latest_cycle: Option<String> = sqlx::query_scalar(
            "SELECT state_digest FROM portal_projection.manager_projection_cycles
             WHERE epoch_id=$1 ORDER BY committed_at DESC LIMIT 1",
        )
        .bind(candidate_epoch_id)
        .fetch_optional(&mut *transaction)
        .await?;
        if latest_cycle.as_deref() != Some(expected_state_digest) {
            return Err(StoreError::ParityMismatch);
        }
        let blockers: i64 = sqlx::query_scalar(
            "SELECT
               (SELECT count(*) FROM portal_projection.dead_letters
                WHERE epoch_id=$1 AND status IN ('OPEN','REPLAYING')) +
               (SELECT count(*) FROM portal_projection.gaps
                WHERE epoch_id=$1 AND resolved_at IS NULL)",
        )
        .bind(candidate_epoch_id)
        .fetch_one(&mut *transaction)
        .await?;
        if blockers != 0 {
            return Err(StoreError::EpochHasUnresolvedBlockers);
        }
        let entities = load_entities_tx(&mut transaction, candidate_epoch_id).await?;
        let actual = semantic_state_digest(&entities)?;
        if actual != expected_state_digest {
            return Err(StoreError::ParityMismatch);
        }
        let previous = sqlx::query_scalar::<_, Uuid>(
            "SELECT epoch_id FROM portal_projection.epochs
             WHERE workspace_id=$1 AND environment=$2 AND status='ACTIVE' FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .fetch_optional(&mut *transaction)
        .await?;
        let overlap_until = activated_at + overlap;
        if let Some(previous_epoch_id) = previous {
            sqlx::query(
                "UPDATE portal_projection.epochs SET status='RETAINED',overlap_until=$2
                 WHERE epoch_id=$1",
            )
            .bind(previous_epoch_id)
            .bind(overlap_until)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query(
            "UPDATE portal_projection.epochs
             SET status='ACTIVE',activated_at=$2,expected_state_digest=$3,actual_state_digest=$3
             WHERE epoch_id=$1",
        )
        .bind(candidate_epoch_id)
        .bind(activated_at)
        .bind(&actual)
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;
        Ok(ActivatedEpoch {
            active_epoch_id: candidate_epoch_id,
            retained_previous_epoch_id: previous,
            overlap_until,
            state_digest: actual,
        })
    }

    /// Atomically restores the exact retained predecessor within its overlap
    /// window after the affected worker has stopped and its lease has expired.
    ///
    /// # Errors
    ///
    /// Rejects wrong scope/state, expired overlap, a live writer lease or
    /// missing restored-state evidence.
    pub async fn rollback_manager_projection_epoch(
        &self,
        scope: &ProjectionScope,
        failed_active_epoch_id: Uuid,
        retained_epoch_id: Uuid,
    ) -> Result<ManagerProjectionRollback, StoreError> {
        if failed_active_epoch_id == retained_epoch_id {
            return Err(StoreError::InvalidManagerProjectionRollback);
        }
        let mut transaction = self.pool.begin().await?;
        let database_now: DateTime<Utc> = sqlx::query_scalar("SELECT clock_timestamp()")
            .fetch_one(&mut *transaction)
            .await?;
        let rows = sqlx::query(
            "SELECT epoch_id,status,overlap_until,actual_state_digest
             FROM portal_projection.epochs
             WHERE workspace_id=$1 AND environment=$2 AND epoch_id=ANY($3)
             ORDER BY epoch_id FOR UPDATE",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(vec![failed_active_epoch_id, retained_epoch_id])
        .fetch_all(&mut *transaction)
        .await?;
        if rows.len() != 2 {
            return Err(StoreError::InvalidManagerProjectionRollback);
        }
        let failed = rows
            .iter()
            .find(|row| row.try_get::<Uuid, _>("epoch_id").ok() == Some(failed_active_epoch_id))
            .ok_or(StoreError::InvalidManagerProjectionRollback)?;
        let retained = rows
            .iter()
            .find(|row| row.try_get::<Uuid, _>("epoch_id").ok() == Some(retained_epoch_id))
            .ok_or(StoreError::InvalidManagerProjectionRollback)?;
        let overlap_until: Option<DateTime<Utc>> = retained.try_get("overlap_until")?;
        let restored_state_digest: Option<String> = retained.try_get("actual_state_digest")?;
        if failed.try_get::<String, _>("status")? != "ACTIVE"
            || retained.try_get::<String, _>("status")? != "RETAINED"
            || overlap_until.is_none_or(|deadline| deadline < database_now)
            || restored_state_digest
                .as_deref()
                .is_none_or(|digest| !valid_digest(digest))
        {
            return Err(StoreError::InvalidManagerProjectionRollback);
        }
        let live_lease: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM portal_projection.manager_projection_leases
             WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3
               AND expires_at>$4",
        )
        .bind(scope.workspace_id.as_str())
        .bind(&scope.environment)
        .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
        .bind(database_now)
        .fetch_one(&mut *transaction)
        .await?;
        if live_lease != 0 {
            return Err(StoreError::ManagerProjectionLeaseBusy);
        }
        sqlx::query(
            "UPDATE portal_projection.epochs
             SET status='FAILED',overlap_until=NULL WHERE epoch_id=$1 AND status='ACTIVE'",
        )
        .bind(failed_active_epoch_id)
        .execute(&mut *transaction)
        .await?;
        sqlx::query(
            "UPDATE portal_projection.epochs
             SET status='ACTIVE',overlap_until=NULL WHERE epoch_id=$1 AND status='RETAINED'",
        )
        .bind(retained_epoch_id)
        .execute(&mut *transaction)
        .await?;
        let restored_state_digest =
            restored_state_digest.ok_or(StoreError::InvalidManagerProjectionRollback)?;
        transaction.commit().await?;
        Ok(ManagerProjectionRollback {
            restored_epoch_id: retained_epoch_id,
            failed_epoch_id: failed_active_epoch_id,
            restored_state_digest,
        })
    }
}

async fn reuse_manager_projection_cycle_tx(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    input: &ManagerCycleCommitInput,
    observed_at: DateTime<Utc>,
) -> Result<Option<ManagerProjectionCycleReceipt>, StoreError> {
    let Some(row) = sqlx::query(
        "SELECT profile_id,catalogue_digest,source_input_digest,feed_count::bigint AS feed_count,
                record_count,state_digest
         FROM portal_projection.manager_projection_cycles
         WHERE epoch_id=$1 AND cycle_id=$2",
    )
    .bind(epoch_id)
    .bind(input.cycle_id.as_str())
    .fetch_optional(&mut **transaction)
    .await?
    else {
        return Ok(None);
    };
    if row.try_get::<String, _>("profile_id")? != input.profile_id
        || row.try_get::<String, _>("catalogue_digest")? != input.catalogue_digest
        || row.try_get::<String, _>("source_input_digest")? != input.source_input_digest
        || required_usize(row.try_get("feed_count")?)? != input.feed_count
        || required_usize(row.try_get("record_count")?)? != input.record_count
    {
        return Err(StoreError::ManagerProjectionCommitCollision);
    }
    let state_digest: String = row.try_get("state_digest")?;
    upsert_manager_projection_heartbeat_tx(
        transaction,
        epoch_id,
        input,
        &state_digest,
        observed_at,
    )
    .await?;
    Ok(Some(ManagerProjectionCycleReceipt {
        cycle_id: input.cycle_id.clone(),
        state_digest,
        already_durable: true,
    }))
}

async fn seal_manager_projection_cycle_tx(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    input: &ManagerCycleCommitInput,
    committed_at: DateTime<Utc>,
) -> Result<ManagerProjectionCycleReceipt, StoreError> {
    let rows = sqlx::query(
        "SELECT entity_kind,catalogue_digest,profile_id
         FROM portal_projection.manager_projection_commits
         WHERE epoch_id=$1 AND cycle_id=$2 ORDER BY entity_kind",
    )
    .bind(epoch_id)
    .bind(input.cycle_id.as_str())
    .fetch_all(&mut **transaction)
    .await?;
    let kinds = rows
        .iter()
        .map(|row| row.try_get::<String, _>("entity_kind"))
        .collect::<Result<BTreeSet<_>, _>>()?;
    if kinds
        != REQUIRED_SNAPSHOT_KINDS
            .into_iter()
            .map(str::to_owned)
            .collect()
        || rows.iter().any(|row| {
            row.try_get::<String, _>("catalogue_digest").ok().as_deref()
                != Some(input.catalogue_digest.as_str())
                || row.try_get::<String, _>("profile_id").ok().as_deref()
                    != Some(input.profile_id.as_str())
        })
    {
        return Err(StoreError::ManagerProjectionCycleIncomplete);
    }
    let entities = load_entities_tx(transaction, epoch_id).await?;
    let state_digest = semantic_state_digest(&entities)?;
    let realtime_sequence: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(realtime_sequence),0)+1
           FROM portal_projection.manager_projection_cycles
          WHERE epoch_id=$1",
    )
    .bind(epoch_id)
    .fetch_one(&mut **transaction)
    .await?;
    let realtime_observation =
        serde_json::to_value(manager_cycle_observation(input, &state_digest)?)
            .map_err(|_| StoreError::Serialization)?;
    sqlx::query(
        "INSERT INTO portal_projection.manager_projection_cycles
         (epoch_id,cycle_id,profile_id,catalogue_digest,source_input_digest,feed_count,
          snapshot_count,record_count,source_read_at,committed_at,state_digest,
          realtime_sequence,realtime_observation)
         VALUES ($1,$2,$3,$4,$5,$6,8,$7,$8,$9,$10,$11,$12)",
    )
    .bind(epoch_id)
    .bind(input.cycle_id.as_str())
    .bind(&input.profile_id)
    .bind(&input.catalogue_digest)
    .bind(&input.source_input_digest)
    .bind(i32::try_from(input.feed_count).map_err(|_| StoreError::NumericOverflow)?)
    .bind(i64::try_from(input.record_count).map_err(|_| StoreError::NumericOverflow)?)
    .bind(input.source_read_at)
    .bind(committed_at)
    .bind(&state_digest)
    .bind(realtime_sequence)
    .bind(realtime_observation)
    .execute(&mut **transaction)
    .await?;
    upsert_manager_projection_heartbeat_tx(
        transaction,
        epoch_id,
        input,
        &state_digest,
        committed_at,
    )
    .await?;
    Ok(ManagerProjectionCycleReceipt {
        cycle_id: input.cycle_id.clone(),
        state_digest,
        already_durable: false,
    })
}

async fn upsert_manager_projection_heartbeat_tx(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
    input: &ManagerCycleCommitInput,
    state_digest: &str,
    observed_at: DateTime<Utc>,
) -> Result<(), StoreError> {
    let changed = sqlx::query(
        "INSERT INTO portal_projection.manager_projection_heartbeats
         (epoch_id,profile_id,catalogue_digest,state_digest,record_count,poll_interval_ms,
          source_read_at,observed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (epoch_id) DO UPDATE SET
           state_digest=EXCLUDED.state_digest,
           record_count=EXCLUDED.record_count,
           poll_interval_ms=EXCLUDED.poll_interval_ms,
           source_read_at=GREATEST(
             portal_projection.manager_projection_heartbeats.source_read_at,
             EXCLUDED.source_read_at
           ),
           observed_at=GREATEST(
             portal_projection.manager_projection_heartbeats.observed_at,
             EXCLUDED.observed_at
           )
         WHERE portal_projection.manager_projection_heartbeats.profile_id=EXCLUDED.profile_id
           AND portal_projection.manager_projection_heartbeats.catalogue_digest=EXCLUDED.catalogue_digest",
    )
    .bind(epoch_id)
    .bind(&input.profile_id)
    .bind(&input.catalogue_digest)
    .bind(state_digest)
    .bind(i64::try_from(input.record_count).map_err(|_| StoreError::NumericOverflow)?)
    .bind(input.poll_interval_ms)
    .bind(input.source_read_at)
    .bind(observed_at)
    .execute(&mut **transaction)
    .await?;
    if changed.rows_affected() != 1 {
        return Err(StoreError::ManagerProjectionCommitCollision);
    }
    Ok(())
}

async fn validate_lease_tx(
    transaction: &mut Transaction<'_, Postgres>,
    scope: &ProjectionScope,
    epoch_id: Uuid,
    proof: ManagerProjectionLeaseProof,
) -> Result<(), StoreError> {
    let row = sqlx::query(
        "SELECT epoch_id,lease_id,fencing_token,expires_at,clock_timestamp() AS checked_at
         FROM portal_projection.manager_projection_leases
         WHERE workspace_id=$1 AND environment=$2 AND source_scope_id=$3 FOR UPDATE",
    )
    .bind(scope.workspace_id.as_str())
    .bind(&scope.environment)
    .bind(MANAGER_PROJECTION_SOURCE_SCOPE)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(StoreError::ManagerProjectionLeaseLost)?;
    let checked_at: DateTime<Utc> = row.try_get("checked_at")?;
    if row.try_get::<Uuid, _>("epoch_id")? != epoch_id
        || row.try_get::<Uuid, _>("lease_id")? != proof.lease_id
        || required_fence(row.try_get("fencing_token")?)? != proof.fencing_token
        || row.try_get::<DateTime<Utc>, _>("expires_at")? <= checked_at
    {
        return Err(StoreError::ManagerProjectionLeaseLost);
    }
    Ok(())
}

fn validate_lease_input(
    lease_id: Uuid,
    owner_digest: &str,
    ttl: Duration,
) -> Result<(), StoreError> {
    if lease_id.is_nil()
        || !valid_digest(owner_digest)
        || !(MINIMUM_LEASE_TTL..=MAXIMUM_LEASE_TTL).contains(&ttl)
    {
        return Err(StoreError::InvalidManagerProjectionLease);
    }
    Ok(())
}

fn validate_snapshot_input(
    scope: &ProjectionScope,
    input: &ManagerSnapshotCommitInput,
) -> Result<(), StoreError> {
    if input.snapshot.completeness != SnapshotCompleteness::Complete
        || !profile_matches(&scope.environment, &input.profile_id)
        || !valid_digest(&input.catalogue_digest)
        || !valid_digest(&input.source_input_digest)
        || !(250..=60_000).contains(&input.poll_interval_ms)
        || input.snapshot.observations.iter().any(|observation| {
            observation.entity.kind != input.snapshot.entity_kind
                || observation.source_authority != SourceAuthority::Execution
                || observation.source_completeness != SourceCompleteness::PollBounded
                || observation.source_sequence.is_some()
                || observation.poll_interval_ms != Some(input.poll_interval_ms)
                || observation.capability_snapshot_id != input.catalogue_digest
        })
    {
        return Err(StoreError::InvalidManagerProjectionSnapshot);
    }
    Ok(())
}

fn validate_cycle_input(
    scope: &ProjectionScope,
    input: &ManagerCycleCommitInput,
) -> Result<(), StoreError> {
    if !profile_matches(&scope.environment, &input.profile_id)
        || !valid_digest(&input.catalogue_digest)
        || !valid_digest(&input.source_input_digest)
        || input.feed_count != 13
        || input.record_count > 80_000
        || !(250..=60_000).contains(&input.poll_interval_ms)
    {
        return Err(StoreError::InvalidManagerProjectionCycle);
    }
    Ok(())
}

fn manager_cycle_observation(
    input: &ManagerCycleCommitInput,
    state_digest: &str,
) -> Result<ProjectionObservation, StoreError> {
    let ingestion_digest = canonical_digest(&(
        input.cycle_id.as_str(),
        input.profile_id.as_str(),
        input.catalogue_digest.as_str(),
        input.source_input_digest.as_str(),
    ))?;
    Ok(ProjectionObservation {
        ingestion_id: CanonicalId::parse(format!(
            "n26-cycle-{}",
            &ingestion_digest.trim_start_matches("sha256:")[..32]
        ))?,
        entity: ProjectionEntityKey {
            kind: ProjectionEntityKind::Runtime,
            entity_id: CanonicalId::parse("manager-projection-cycle")?,
        },
        source_authority: SourceAuthority::Execution,
        as_of: Some(input.source_read_at),
        source_read_at: input.source_read_at,
        source_cursor: None,
        source_sequence: None,
        source_sequence_semantics: SourceSequenceSemantics::PerEntityContiguous,
        operation: ProjectionOperation::Upsert,
        source_completeness: SourceCompleteness::PollBounded,
        poll_interval_ms: Some(input.poll_interval_ms),
        adapter_version: "portal.execution.manager-projection.manager-v2.runtime.v5".to_owned(),
        capability_snapshot_id: input.catalogue_digest.clone(),
        payload: serde_json::json!({
            "delta_kind": "PORTAL_PROJECTION_DELTA",
            "profile_id": input.profile_id,
            "cycle_id": input.cycle_id.as_str(),
            "state_digest": state_digest,
            "fact_count": input.record_count,
            "source_input_digest": input.source_input_digest,
        }),
    })
}

fn tombstone_observation(
    input: &ManagerSnapshotCommitInput,
    entity_id: String,
) -> Result<ProjectionObservation, StoreError> {
    let digest = canonical_digest(&(
        input.cycle_id.as_str(),
        input.snapshot.entity_kind.as_str(),
        &entity_id,
        "DELETE",
    ))?;
    Ok(ProjectionObservation {
        ingestion_id: CanonicalId::parse(format!(
            "n24-delete-{}",
            digest.trim_start_matches("sha256:")
        ))?,
        entity: ProjectionEntityKey {
            kind: input.snapshot.entity_kind,
            entity_id: CanonicalId::parse(entity_id)?,
        },
        source_authority: SourceAuthority::Execution,
        as_of: Some(input.source_read_at),
        source_read_at: input.source_read_at,
        source_cursor: Some(SourceCursor {
            event_ts: input.source_read_at,
            created_at: input.source_read_at,
            event_id: input.cycle_id.clone(),
        }),
        source_sequence: None,
        source_sequence_semantics: SourceSequenceSemantics::PerEntityContiguous,
        operation: ProjectionOperation::Delete,
        source_completeness: SourceCompleteness::PollBounded,
        poll_interval_ms: Some(input.poll_interval_ms),
        adapter_version: "portal.execution.manager-projection.manager-v2.runtime.v5".to_owned(),
        capability_snapshot_id: input.catalogue_digest.clone(),
        payload: serde_json::json!({
            "change_label": "PORTAL_PROJECTION_DELTA",
            "tombstone": true,
        }),
    })
}

async fn load_entities_tx(
    transaction: &mut Transaction<'_, Postgres>,
    epoch_id: Uuid,
) -> Result<Vec<projection_core::ProjectedEntity>, StoreError> {
    let rows = sqlx::query(
        "SELECT * FROM portal_projection.entities
         WHERE epoch_id=$1 ORDER BY entity_kind,entity_id",
    )
    .bind(epoch_id)
    .fetch_all(&mut **transaction)
    .await?;
    rows.iter().map(super::row_to_entity).collect()
}

fn lease_grant(
    scope: &ProjectionScope,
    epoch_id: Uuid,
    lease_id: Uuid,
    fencing_token: u64,
    expires_at: DateTime<Utc>,
) -> ManagerProjectionLeaseGrant {
    ManagerProjectionLeaseGrant {
        scope: scope.clone(),
        epoch_id,
        lease_id,
        fencing_token,
        expires_at,
    }
}

fn profile_matches(environment: &str, profile_id: &str) -> bool {
    matches!(
        (environment, profile_id),
        ("paper", "PAPER_BINANCE_USDM")
            | ("sandbox", "SANDBOX_BINANCE_USDM")
            | ("live", "LIVE_BINANCE_USDM")
    )
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

fn required_fence(value: i64) -> Result<u64, StoreError> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(StoreError::InvalidManagerProjectionLease)
}

fn required_usize(value: i64) -> Result<usize, StoreError> {
    usize::try_from(value).map_err(|_| StoreError::NumericOverflow)
}

fn parse_epoch_status(value: &str) -> Result<projection_core::ProjectionEpochStatus, StoreError> {
    match value {
        "BUILDING" => Ok(projection_core::ProjectionEpochStatus::Building),
        "ACTIVE" => Ok(projection_core::ProjectionEpochStatus::Active),
        _ => Err(StoreError::PersistedVocabulary),
    }
}
