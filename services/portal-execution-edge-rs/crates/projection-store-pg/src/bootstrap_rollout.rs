//! Operator-held shadow/read selection over the existing bootstrap writer fence.
//!
//! Internal ports only: no listener, source activation, financial send or policy
//! grant. Production adapters must supply current authority and qualified scope.

use authoritative_event_core::bootstrap::{Binding, Manifest, Verified};
use projection_core::resources::WorkClass;
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    bootstrap::{
        begin_tx, bounded, control_binding, fence, select_active, BootstrapError, BootstrapHandle,
        Tx,
    },
    PgProjectionStore,
};

/// Private compare-and-swap capability, not a serialized authorization token.
#[derive(Debug)]
pub struct ShadowComparison {
    candidate: Uuid,
    previous: Uuid,
    binding_digest: String,
    candidate_revision: i64,
    previous_revision: i64,
    candidate_history_revision: i64,
    previous_history_revision: i64,
    checkpoint: String,
    rows: i64,
    facts: i64,
}

impl ShadowComparison {
    /// Matched semantic rows (including tombstones), not source-wide totals.
    #[must_use]
    pub fn rows(&self) -> i64 {
        self.rows
    }

    /// Matched immutable event facts within this exact scoped generation.
    #[must_use]
    pub fn facts(&self) -> i64 {
        self.facts
    }
}

/// Durable operator state. Never interpret this as source/command acceptance.
#[derive(Debug, Serialize)]
pub struct RolloutStatus {
    pub candidate: Uuid,
    pub active: Option<Uuid>,
    pub previous: Option<Uuid>,
    pub rollout_state: String,
    pub candidate_state: String,
    pub candidate_revision: i64,
    pub candidate_history_revision: i64,
    pub checkpoint: String,
}

async fn status(tx: &mut Tx<'_>, h: &BootstrapHandle) -> Result<RolloutStatus, BootstrapError> {
    let row = sqlx::query(
        "SELECT s.active_generation,g.rollback_generation,g.rollout_state,
        g.state,g.revision,g.history_revision,g.checkpoint_cursor FROM portal_projection.bootstrap_streams s
        JOIN portal_projection.bootstrap_generations g ON g.generation=s.writer_generation
        WHERE s.slot_key=$1",
    )
    .bind(h.manifest.binding.slot_key()?)
    .fetch_one(&mut **tx)
    .await?;
    Ok(RolloutStatus {
        candidate: h.manifest.generation,
        active: row.try_get("active_generation")?,
        previous: row.try_get("rollback_generation")?,
        rollout_state: row.try_get("rollout_state")?,
        candidate_state: row.try_get("state")?,
        candidate_revision: row.try_get("revision")?,
        candidate_history_revision: row.try_get("history_revision")?,
        checkpoint: row.try_get("checkpoint_cursor")?,
    })
}

async fn retained(
    tx: &mut Tx<'_>,
    h: &BootstrapHandle,
    previous: Uuid,
    now: i64,
) -> Result<(i64, i64, String), BootstrapError> {
    let row = sqlx::query("SELECT manifest,state,revision,history_revision,checkpoint_cursor,rollback_until_ms
        FROM portal_projection.bootstrap_generations WHERE generation=$1 AND slot_key=$2 FOR UPDATE")
        .bind(previous).bind(h.manifest.binding.slot_key()?).fetch_optional(&mut **tx).await?
        .ok_or(BootstrapError::Resync)?;
    let manifest: Manifest = serde_json::from_value(row.try_get("manifest")?)
        .map_err(|_| BootstrapError::Serialization)?;
    let state: String = row.try_get("state")?;
    if previous == h.manifest.generation
        || manifest.binding != h.manifest.binding
        || manifest.barrier != h.manifest.barrier
        || !matches!(state.as_str(), "READY" | "RETAINED")
        || now > row.try_get::<i64, _>("rollback_until_ms")?
    {
        return Err(BootstrapError::Resync);
    }
    Ok((
        row.try_get("revision")?,
        row.try_get("history_revision")?,
        row.try_get("checkpoint_cursor")?,
    ))
}

impl PgProjectionStore {
    /// Compare exact rows/revisions/payloads/tombstones AND immutable fact sets.
    /// SQL deadlines bound the scan; no full payload export/aggregate in Rust.
    ///
    /// # Errors
    /// Fails closed on scope, fence, readiness, barrier/checkpoint, retention or
    /// content mismatch, resource pressure and bounded database failures.
    pub async fn bootstrap_compare_shadow(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<ShadowComparison, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            if fence(&mut tx, h).await? != "READY" { return Err(BootstrapError::Resync); }
            let s = status(&mut tx, h).await?;
            if !matches!(s.rollout_state.as_str(), "SHADOW" | "ROLLED_BACK") {
                return Err(BootstrapError::Resync);
            }
            let previous = s.active.ok_or(BootstrapError::Resync)?;
            let (previous_revision, previous_history_revision, cursor) = retained(&mut tx, h, previous, now).await?;
            if cursor != s.checkpoint { return Err(BootstrapError::Integrity); }
            let different: bool = sqlx::query_scalar("SELECT EXISTS (
                (SELECT dataset,entity_id,revision_order,source_revision,payload_digest,payload,tombstoned
                 FROM portal_projection.bootstrap_rows WHERE generation=$1
                 EXCEPT SELECT dataset,entity_id,revision_order,source_revision,payload_digest,payload,tombstoned
                 FROM portal_projection.bootstrap_rows WHERE generation=$2)
                UNION ALL
                (SELECT dataset,entity_id,revision_order,source_revision,payload_digest,payload,tombstoned
                 FROM portal_projection.bootstrap_rows WHERE generation=$2
                 EXCEPT SELECT dataset,entity_id,revision_order,source_revision,payload_digest,payload,tombstoned
                 FROM portal_projection.bootstrap_rows WHERE generation=$1))")
                .bind(h.manifest.generation).bind(previous).fetch_one(&mut *tx).await?;
            let different_facts: bool = sqlx::query_scalar("SELECT EXISTS (
                (SELECT event_id,event_digest,source_sequence,event FROM portal_projection.bootstrap_facts WHERE generation=$1
                 EXCEPT SELECT event_id,event_digest,source_sequence,event FROM portal_projection.bootstrap_facts WHERE generation=$2)
                UNION ALL
                (SELECT event_id,event_digest,source_sequence,event FROM portal_projection.bootstrap_facts WHERE generation=$2
                 EXCEPT SELECT event_id,event_digest,source_sequence,event FROM portal_projection.bootstrap_facts WHERE generation=$1))")
                .bind(h.manifest.generation).bind(previous).fetch_one(&mut *tx).await?;
            if different || different_facts { return Err(BootstrapError::Integrity); }
            let counts = sqlx::query("SELECT
                (SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1) AS rows,
                (SELECT count(*) FROM portal_projection.bootstrap_facts WHERE generation=$1) AS facts")
                .bind(h.manifest.generation).fetch_one(&mut *tx).await?;
            let comparison = ShadowComparison { candidate: h.manifest.generation, previous,
                binding_digest: h.manifest.binding.digest()?, candidate_revision: s.candidate_revision,
                previous_revision, candidate_history_revision: s.candidate_history_revision,
                previous_history_revision, checkpoint: s.checkpoint, rows: counts.try_get("rows")?, facts: counts.try_get("facts")? };
            tx.commit().await?;
            Ok(comparison)
        }).await
    }

    /// Select a complete, compared candidate with an atomic private-pin CAS.
    /// A lost ACK is resolved by this idempotent call or durable status lookup.
    ///
    /// # Errors
    /// Rejects foreign/stale comparisons, changed writer/pointer/checkpoint,
    /// expired retained scope and unauthorized or bounded database failures.
    pub async fn bootstrap_activate_shadow(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        comparison: &ShadowComparison,
        now: i64,
    ) -> Result<RolloutStatus, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            if fence(&mut tx, h).await? != "READY" {
                return Err(BootstrapError::Resync);
            }
            let s = status(&mut tx, h).await?;
            if comparison.candidate != h.manifest.generation
                || comparison.binding_digest != h.manifest.binding.digest()?
                || comparison.candidate_revision != s.candidate_revision
                || comparison.candidate_history_revision != s.candidate_history_revision
                || comparison.checkpoint != s.checkpoint
            {
                return Err(BootstrapError::Resync);
            }
            let (revision, history_revision, cursor) =
                retained(&mut tx, h, comparison.previous, now).await?;
            if revision != comparison.previous_revision
                || history_revision != comparison.previous_history_revision
                || cursor != comparison.checkpoint
            {
                return Err(BootstrapError::Resync);
            }
            if s.rollout_state == "ACTIVE"
                && s.active == Some(comparison.candidate)
                && s.previous == Some(comparison.previous)
            {
                tx.commit().await?;
                return Ok(s);
            }
            if !matches!(s.rollout_state.as_str(), "SHADOW" | "ROLLED_BACK")
                || s.active != Some(comparison.previous)
            {
                return Err(BootstrapError::Resync);
            }
            select_active(&mut tx, h, now).await?;
            sqlx::query(
                "UPDATE portal_projection.bootstrap_generations
                SET rollout_state='ACTIVE',rollback_generation=$2 WHERE generation=$1",
            )
            .bind(h.manifest.generation)
            .bind(comparison.previous)
            .execute(&mut *tx)
            .await?;
            let s = status(&mut tx, h).await?;
            tx.commit().await?;
            Ok(s)
        })
        .await
    }

    /// Roll back reads only. The candidate remains the sole ingestion writer.
    /// Facts, command receipts, status and policy are never deleted/restored.
    ///
    /// # Errors
    /// Rejects unselected/foreign/fenced scope, expired retention and bounded
    /// database failure. Never silently chooses an older or different scope.
    pub async fn bootstrap_rollback_read(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<RolloutStatus, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            fence(&mut tx, h).await?;
            let s = status(&mut tx, h).await?;
            let previous = s.previous.ok_or(BootstrapError::Resync)?;
            retained(&mut tx, h, previous, now).await?;
            if !((s.rollout_state == "ACTIVE" && s.active == Some(h.manifest.generation))
                || (s.rollout_state == "ROLLED_BACK" && s.active == Some(previous))) {
                return Err(BootstrapError::Resync);
            }
            sqlx::query("UPDATE portal_projection.bootstrap_streams SET active_generation=$2,updated_at_ms=$3 WHERE slot_key=$1")
                .bind(h.manifest.binding.slot_key()?).bind(previous).bind(now).execute(&mut *tx).await?;
            sqlx::query("UPDATE portal_projection.bootstrap_generations SET rollout_state='ROLLED_BACK' WHERE generation=$1")
                .bind(h.manifest.generation).execute(&mut *tx).await?;
            let s = status(&mut tx, h).await?;
            tx.commit().await?;
            Ok(s)
        }).await
    }

    /// Inspect interrupted rollout with fresh control authority and writer fence.
    ///
    /// # Errors
    /// Fails closed for unauthorized/changed scope or bounded database failure.
    pub async fn bootstrap_rollout_status(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<RolloutStatus, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            fence(&mut tx, h).await?;
            let s = status(&mut tx, h).await?;
            tx.commit().await?;
            Ok(s)
        })
        .await
    }
}
