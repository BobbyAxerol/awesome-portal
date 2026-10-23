//! Durable native P16 retained observations, not a current-state reducer.
//!
//! Only independently authenticated exact source inputs enter this store. Its
//! local digest guards detect conflicts; they are NEVER authorization. A caller
//! must retain the actual source/current-policy custody required by its proof
//! verifier across the operation. This module supplies no accepting verifier,
//! listener, source grant, public route, source ACK transport or history claim.
//! Sparse scan checkpoints and native facts commit together. `SEMANTIC_FACT` is
//! not UPSERT; nullable `occurred_at` and source entity versions remain unchanged.

use std::time::Instant;

use authoritative_event_core::{
    bootstrap::{Binding, ProtocolError, Verified},
    p16::{Event, ValidatedPage},
};
use projection_core::{
    canonical_digest,
    resources::{ResourceError, WorkClass},
};
use serde::Serialize;
use sqlx::Row;
use uuid::Uuid;

use crate::{
    bootstrap::{begin_tx, bounded, control_binding, BootstrapError},
    PgProjectionStore,
};

const MAX_APPEND_BYTES: usize = 8 * 1024 * 1024;
const MAX_READ_BYTES: usize = 1024 * 1024;
const MAX_READ_ROWS: usize = 200;

/// Internal durable outcome, constructed only AFTER SQL COMMIT. This is not a
/// source acknowledgement or a browser cursor, and deliberately not `Serialize`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeP16Receipt {
    through_sequence: u64,
    revision: i64,
    replayed: bool,
}

impl NativeP16Receipt {
    #[must_use]
    pub const fn through_sequence(&self) -> u64 {
        self.through_sequence
    }
    #[must_use]
    pub const fn replayed(&self) -> bool {
        self.replayed
    }
    #[must_use]
    pub const fn revision(&self) -> i64 {
        self.revision
    }
}

/// Private-source operational watermark, not source freshness/completeness.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeP16Checkpoint {
    pub observed_from_sequence: u64,
    pub through_sequence: u64,
    pub revision: i64,
    /// Local operation observation, not the `PostgreSQL` COMMIT or source time.
    pub local_recorded_at_ms: i64,
}

/// Bounded internal native history request. `through_sequence` pins one durable
/// cut; callers cannot use a source head as an already committed read cut.
#[derive(Debug, Clone)]
pub struct NativeP16Query {
    pub dataset: String,
    pub after_sequence: u64,
    pub through_sequence: u64,
    pub limit: usize,
    pub max_bytes: usize,
}

/// Internal observation payloads only. An HTTP adapter must apply its own
/// current field policy/DTO; returning this raw ledger to a browser is forbidden.
#[derive(Debug)]
pub struct NativeP16Observations {
    pub events: Vec<Event>,
    pub next_after_sequence: Option<u64>,
    pub through_sequence: u64,
    pub history_capability: &'static str,
    pub availability: &'static str,
    pub source_freshness: &'static str,
}

fn number(value: u64) -> Result<i64, BootstrapError> {
    i64::try_from(value).map_err(|_| BootstrapError::Bounds)
}

fn unsigned(value: i64) -> Result<u64, BootstrapError> {
    u64::try_from(value).map_err(|_| BootstrapError::Integrity)
}

fn digest(value: &impl Serialize) -> Result<String, BootstrapError> {
    canonical_digest(value).map_err(|_| BootstrapError::Serialization)
}

fn elapsed_now(now: i64, started: Instant) -> Result<i64, BootstrapError> {
    now.checked_add(
        i64::try_from(started.elapsed().as_millis()).map_err(|_| BootstrapError::Bounds)?,
    )
    .ok_or(BootstrapError::Bounds)
}

fn selection(page: &ValidatedPage) -> Result<String, BootstrapError> {
    let b = page.binding();
    // Retention/head/scan size may advance. They are not immutable selection or
    // replay identity, unlike the manifest, access revision and coverage cut.
    digest(&(
        &b.scope,
        &b.consumer_id,
        &b.manifest_digest,
        &b.catalogue_digest,
        &b.filter_digest,
        b.access_revision,
        &b.coverage,
    ))
}

fn page_binding(page: &ValidatedPage, binding: &Binding) -> Result<(), BootstrapError> {
    let b = page.binding();
    if binding.source.environment != "paper"
        || binding.source_epoch != b.scope.continuity_epoch
        || binding.consumer_id != b.consumer_id
        || binding.source.filter_digest != format!("sha256:{}", b.filter_digest)
        || page
            .page()
            .events
            .iter()
            .any(|event| binding.datasets.get(&event.entity_type) != Some(&event.schema_version))
    {
        return Err(ProtocolError::Scope.into());
    }
    Ok(())
}

impl PgProjectionStore {
    /// Atomically appends native facts and their exact selected scan interval.
    /// Retries return the original committed receipt, including after a lost ACK.
    ///
    /// # Errors
    /// Rejects absent resource admission, stale/untrusted proof, scope/selection
    /// changes, non-CAS scans, regressing commit order and conflicting identity.
    #[allow(clippy::too_many_lines)] // One transaction owns facts, CAS and durable retry receipt.
    pub async fn p16_append_observations(
        &self,
        binding: &Binding,
        input: &Verified<ValidatedPage>,
        now: i64,
    ) -> Result<NativeP16Receipt, BootstrapError> {
        bounded(async {
            let started = Instant::now();
            input.check(binding, "P16_READ_PAGE", now)?;
            let value = input.value();
            page_binding(value, binding)?;
            let page = value.page();
            let bytes = serde_json::to_vec(value).map_err(|_| BootstrapError::Serialization)?;
            if bytes.len() > MAX_APPEND_BYTES { return Err(BootstrapError::Bounds); }
            if self.resources.is_none() { return Err(ResourceError::Config.into()); }
            let _permit = self.admit(WorkClass::LiveWrite, page.events.len(),
                bytes.len().checked_mul(3).ok_or(BootstrapError::Bounds)?)?;
            let slot = binding.slot_key()?;
            let binding_digest = binding.digest()?;
            let selected = selection(value)?;
            let scan_digest = digest(&(&selected, page.after_sequence,
                page.scanned_through_sequence, &page.events))?;
            let mut tx = begin_tx(self).await?;
            sqlx::query("INSERT INTO portal_projection.native_p16_streams
                (slot_key,binding_digest,selection_digest,observed_from_sequence,checkpoint_sequence,
                 retention_floor,published_head,recorded_at_ms) VALUES ($1,$2,$3,$4,$4,$5,$6,$7)
                 ON CONFLICT (slot_key) DO NOTHING")
                .bind(&slot).bind(&binding_digest).bind(&selected).bind(number(page.after_sequence)?)
                .bind(number(value.binding().retention_floor)?).bind(number(page.published_head_sequence)?)
                .bind(now).execute(&mut *tx).await?;
            let stream = sqlx::query("SELECT binding_digest,selection_digest,checkpoint_sequence,
                retention_floor,published_head,last_commit_lsn::text AS last_lsn,last_commit_group_index,
                revision FROM portal_projection.native_p16_streams WHERE slot_key=$1 FOR UPDATE")
                .bind(&slot).fetch_one(&mut *tx).await?;
            if stream.try_get::<String,_>("binding_digest")? != binding_digest
                || stream.try_get::<String,_>("selection_digest")? != selected {
                return Err(BootstrapError::Resync);
            }
            if let Some(receipt) = sqlx::query("SELECT input_digest,receipt_revision
                FROM portal_projection.native_p16_scans WHERE slot_key=$1 AND after_sequence=$2
                AND through_sequence=$3")
                .bind(&slot).bind(number(page.after_sequence)?).bind(number(page.scanned_through_sequence)?)
                .fetch_optional(&mut *tx).await? {
                if receipt.try_get::<String,_>("input_digest")? != scan_digest {
                    return Err(BootstrapError::Integrity);
                }
                let revision = receipt.try_get("receipt_revision")?;
                input.check(binding, "P16_READ_PAGE", elapsed_now(now, started)?)?;
                tx.commit().await?;
                return Ok(NativeP16Receipt { through_sequence: page.scanned_through_sequence,
                    revision, replayed: true });
            }
            if stream.try_get::<i64,_>("checkpoint_sequence")? != number(page.after_sequence)?
                || stream.try_get::<i64,_>("retention_floor")? > number(value.binding().retention_floor)?
                || stream.try_get::<i64,_>("published_head")? > number(page.published_head_sequence)? {
                return Err(BootstrapError::Resync);
            }
            if let Some(first) = page.events.first() {
                let ordered: bool = sqlx::query_scalar("SELECT last_commit_lsn IS NULL OR
                    ($2::text::pg_lsn,$3::bigint)>(last_commit_lsn,last_commit_group_index)
                    FROM portal_projection.native_p16_streams WHERE slot_key=$1")
                    .bind(&slot).bind(&first.source_commit_lsn).bind(number(first.source_commit_group_index)?)
                    .fetch_one(&mut *tx).await?;
                if !ordered { return Err(BootstrapError::Integrity); }
            }
            for event in &page.events {
                let event_bytes = serde_json::to_vec(event).map_err(|_| BootstrapError::Serialization)?;
                let inserted = sqlx::query("INSERT INTO portal_projection.native_p16_facts
                    (slot_key,source_sequence,source_event_id,business_event_id,event_revision,dataset,
                     event_digest,event_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING")
                    .bind(&slot).bind(number(event.published_source_sequence)?)
                    .bind(Uuid::parse_str(&event.source_event_id).map_err(|_| BootstrapError::Integrity)?)
                    .bind(Uuid::parse_str(&event.business_event_id).map_err(|_| BootstrapError::Integrity)?)
                    .bind(number(event.event_revision)?).bind(&event.entity_type)
                    .bind(digest(event)?).bind(event_bytes).execute(&mut *tx).await?;
                if inserted.rows_affected() != 1 { return Err(BootstrapError::Integrity); }
            }
            let revision = stream.try_get::<i64,_>("revision")?.checked_add(1)
                .ok_or(BootstrapError::Bounds)?;
            let last = page.events.last();
            let changed = sqlx::query("UPDATE portal_projection.native_p16_streams SET
                checkpoint_sequence=$2,retention_floor=$3,published_head=$4,revision=$5,recorded_at_ms=$6,
                last_commit_lsn=COALESCE($7::text::pg_lsn,last_commit_lsn),
                last_commit_group_index=COALESCE($8,last_commit_group_index)
                WHERE slot_key=$1 AND checkpoint_sequence=$9")
                .bind(&slot).bind(number(page.scanned_through_sequence)?)
                .bind(number(value.binding().retention_floor)?).bind(number(page.published_head_sequence)?)
                .bind(revision).bind(now).bind(last.map(|event| event.source_commit_lsn.as_str()))
                .bind(last.map(|event| number(event.source_commit_group_index)).transpose()?)
                .bind(number(page.after_sequence)?).execute(&mut *tx).await?;
            if changed.rows_affected() != 1 { return Err(BootstrapError::Resync); }
            sqlx::query("INSERT INTO portal_projection.native_p16_scans
                (slot_key,after_sequence,through_sequence,input_digest,receipt_revision,recorded_at_ms)
                VALUES ($1,$2,$3,$4,$5,$6)")
                .bind(&slot).bind(number(page.after_sequence)?).bind(number(page.scanned_through_sequence)?)
                .bind(scan_digest).bind(revision).bind(now).execute(&mut *tx).await?;
            input.check(binding, "P16_READ_PAGE", elapsed_now(now, started)?)?;
            tx.commit().await?;
            Ok(NativeP16Receipt { through_sequence: page.scanned_through_sequence,
                revision, replayed: false })
        }).await
    }

    /// Reads an internal durable watermark under independently verified CONTROL
    /// authority for this exact binding. A binding hash alone cannot call this.
    ///
    /// # Errors
    /// Rejects stale/wrong authority, changed binding and bounded DB failures.
    pub async fn p16_observation_checkpoint(
        &self,
        binding: &Binding,
        authority: &Verified<Binding>,
        now: i64,
    ) -> Result<Option<NativeP16Checkpoint>, BootstrapError> {
        bounded(async {
            let started = Instant::now();
            control_binding(authority, binding, now)?;
            if self.resources.is_none() { return Err(ResourceError::Config.into()); }
            let _permit = self.admit(WorkClass::ControlRead, 1, 1024)?;
            let mut tx = begin_tx(self).await?;
            let row = sqlx::query("SELECT binding_digest,observed_from_sequence,checkpoint_sequence,
                revision,recorded_at_ms FROM portal_projection.native_p16_streams WHERE slot_key=$1")
                .bind(binding.slot_key()?).fetch_optional(&mut *tx).await?;
            let checkpoint = row.map(|row| {
                if row.try_get::<String,_>("binding_digest")? != binding.digest()? {
                    return Err(BootstrapError::Resync);
                }
                Ok(NativeP16Checkpoint {
                    observed_from_sequence: unsigned(row.try_get("observed_from_sequence")?)?,
                    through_sequence: unsigned(row.try_get("checkpoint_sequence")?)?,
                    revision: row.try_get("revision")?,
                    local_recorded_at_ms: row.try_get("recorded_at_ms")?,
                })
            }).transpose()?;
            tx.commit().await?;
            control_binding(authority, binding, elapsed_now(now, started)?)?;
            Ok(checkpoint)
        }).await
    }

    /// Reads bounded retained observations at an explicit committed scan cut.
    /// Never serves CURRENT or asserts complete lifetime/source-fresh history.
    ///
    /// # Errors
    /// Rejects untrusted/stale authority, foreign dataset/cut, oversized rows,
    /// inconsistent stored bytes and any database/deadline/resource failure.
    #[allow(clippy::too_many_lines)] // Validate authority, cut and bytes around the same bounded transaction.
    pub async fn p16_observations(
        &self,
        binding: &Binding,
        authority: &Verified<Binding>,
        query: &NativeP16Query,
        now: i64,
    ) -> Result<NativeP16Observations, BootstrapError> {
        bounded(async {
            let started = Instant::now();
            control_binding(authority, binding, now)?;
            if !binding.datasets.contains_key(&query.dataset) { return Err(ProtocolError::Scope.into()); }
            if query.limit == 0 || query.limit > MAX_READ_ROWS || query.max_bytes < 2
                || query.max_bytes > MAX_READ_BYTES || query.after_sequence > query.through_sequence {
                return Err(BootstrapError::Bounds);
            }
            if self.resources.is_none() { return Err(ResourceError::Config.into()); }
            let _permit = self.admit(WorkClass::Interactive, query.limit,
                query.max_bytes.checked_mul(3).ok_or(BootstrapError::Bounds)?)?;
            let slot = binding.slot_key()?;
            let mut tx = begin_tx(self).await?;
            let stream = sqlx::query("SELECT binding_digest,observed_from_sequence,checkpoint_sequence
                FROM portal_projection.native_p16_streams WHERE slot_key=$1")
                .bind(&slot).fetch_optional(&mut *tx).await?.ok_or(BootstrapError::Resync)?;
            if stream.try_get::<String,_>("binding_digest")? != binding.digest()?
                || number(query.after_sequence)? < stream.try_get::<i64,_>("observed_from_sequence")?
                || number(query.through_sequence)? > stream.try_get::<i64,_>("checkpoint_sequence")? {
                return Err(BootstrapError::Resync);
            }
            // SQL budgets BEFORE returning BYTEA to the process; a row-count cap
            // alone would allow 200 multi-MiB native events into process memory.
            let rows = sqlx::query("SELECT source_sequence,event_digest,event_bytes FROM
                (SELECT source_sequence,event_digest,event_bytes,
                    SUM(octet_length(event_bytes)+1) OVER(ORDER BY source_sequence) AS cumulative
                 FROM (SELECT source_sequence,event_digest,event_bytes FROM portal_projection.native_p16_facts
                    WHERE slot_key=$1 AND dataset=$2 AND source_sequence>$3 AND source_sequence<=$4
                    ORDER BY source_sequence LIMIT $5) AS candidates) AS budgeted
                WHERE cumulative<=$6 ORDER BY source_sequence")
                .bind(&slot).bind(&query.dataset).bind(number(query.after_sequence)?)
                .bind(number(query.through_sequence)?)
                .bind(i64::try_from(query.limit).map_err(|_| BootstrapError::Bounds)?)
                .bind(i64::try_from(query.max_bytes - 2).map_err(|_| BootstrapError::Bounds)?)
                .fetch_all(&mut *tx).await?;
            let mut events = Vec::with_capacity(rows.len());
            let mut after = query.after_sequence;
            for row in rows {
                let bytes: Vec<u8> = row.try_get("event_bytes")?;
                let event: Event = serde_json::from_slice(&bytes).map_err(|_| BootstrapError::Integrity)?;
                after = unsigned(row.try_get("source_sequence")?)?;
                if digest(&event)? != row.try_get::<String,_>("event_digest")?
                    || event.published_source_sequence != after || event.entity_type != query.dataset
                    || binding.datasets.get(&event.entity_type) != Some(&event.schema_version) {
                    return Err(BootstrapError::Integrity);
                }
                events.push(event);
            }
            let more: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM portal_projection.native_p16_facts
                WHERE slot_key=$1 AND dataset=$2 AND source_sequence>$3 AND source_sequence<=$4)")
                .bind(&slot).bind(&query.dataset).bind(number(after)?).bind(number(query.through_sequence)?)
                .fetch_one(&mut *tx).await?;
            if more && events.is_empty() { return Err(BootstrapError::Bounds); }
            tx.commit().await?;
            control_binding(authority, binding, elapsed_now(now, started)?)?;
            Ok(NativeP16Observations { events, next_after_sequence: more.then_some(after),
                through_sequence: query.through_sequence, history_capability: "RETAINED_OBSERVATIONS",
                availability: "PARTIAL", source_freshness: "UNKNOWN" })
        }).await
    }
}
