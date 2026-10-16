//! EPG10 scoped bootstrap store: no listener, producer, source grant or runtime flag.
//!
//! Existing canonical event validation and the PG atomic-commit pattern are reused.
//! Sparse source IDs remain private facts, NEVER a dense client continuity check.
//! Only a trusted adapter's independently verified scan/group proof may advance
//! this versioned protocol. No such production adapter is activated by this module.

use std::{future::Future, time::Duration};

use authoritative_event_core::{
    bootstrap::{
        events_digest, page_seed, Binding, DeltaChunk, DeltaEvent, DeltaGroup, Limits, Manifest,
        ProtocolError, Revision, SnapshotPage, SnapshotRow, Verified,
    },
    EventOperation,
};
use projection_core::{
    canonical_digest, canonical_value_digest,
    resources::{ResourceError, WorkClass},
};
use serde::Serialize;
use sqlx::{Postgres, Row, Transaction};
use thiserror::Error;
use uuid::Uuid;

use crate::PgProjectionStore;

#[derive(Debug, Error)]
pub enum BootstrapError {
    #[error(transparent)]
    Resource(#[from] ResourceError),
    #[error(transparent)]
    Protocol(#[from] ProtocolError),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error("RESYNC_REQUIRED")]
    Resync,
    #[error("INTEGRITY_CONFLICT")]
    Integrity,
    #[error("BOUNDED_INPUT_REQUIRED")]
    Bounds,
    #[error("FRESH_GROUP_PENDING")]
    FreshPending,
    #[error("projection serialization failed")]
    Serialization,
    #[error("bounded projection transaction deadline exceeded; retry durable checkpoint")]
    Deadline,
}

/// Private fields: a writer handle comes only from an authenticated manifest.
#[derive(Clone)]
pub struct BootstrapHandle {
    manifest: Manifest,
    limits: Limits,
}

impl BootstrapHandle {
    #[must_use]
    pub fn manifest(&self) -> &Manifest {
        &self.manifest
    }
}

/// Source acknowledgement capability, produced only after the SQL COMMIT.
/// No source scan position, hidden count or hidden event ID is serialized.
#[derive(Debug, Clone, Serialize)]
pub struct BootstrapReceipt {
    generation: Uuid,
    cursor: String,
    #[serde(skip)]
    revision: i64,
}

impl BootstrapReceipt {
    #[must_use]
    pub fn cursor(&self) -> &str {
        &self.cursor
    }
}

/// Internal server-side read pin; not a browser token or an authorization grant.
#[derive(Debug, Clone)]
pub struct BootstrapReadPin {
    generation: Uuid,
    binding_digest: String,
    revision: i64,
    after: (String, String),
}

#[derive(Debug)]
pub struct BootstrapView {
    pub generation: Uuid,
    pub state: &'static str,
    /// Last durable local projection commit, NOT source occurred/commit time.
    pub projection_committed_at_ms: i64,
    /// An old active generation is readable only through this bounded window.
    pub stale_until_ms: Option<i64>,
    pub rows: Vec<SnapshotRow>,
    pub next: Option<BootstrapReadPin>,
}

type Tx<'a> = Transaction<'a, Postgres>;

fn digest(value: &impl Serialize) -> Result<String, BootstrapError> {
    canonical_digest(value).map_err(|_| BootstrapError::Serialization)
}

fn encoded_len(value: &impl Serialize) -> Result<usize, BootstrapError> {
    serde_json::to_vec(value)
        .map(|bytes| bytes.len())
        .map_err(|_| BootstrapError::Serialization)
}

fn number(value: u64) -> Result<i64, BootstrapError> {
    i64::try_from(value).map_err(|_| BootstrapError::Bounds)
}

fn row_byte_bound(bytes: i32, maximum: usize) -> Result<(), BootstrapError> {
    let bytes = usize::try_from(bytes).map_err(|_| BootstrapError::Bounds)?;
    if bytes.checked_add(2).ok_or(BootstrapError::Bounds)? > maximum {
        return Err(BootstrapError::Bounds);
    }
    Ok(())
}

async fn begin_tx(store: &PgProjectionStore) -> Result<Tx<'_>, BootstrapError> {
    let mut tx = store.pool.begin().await?;
    // Safety ceilings for this unbound protocol, not measured production budgets.
    sqlx::query("SET LOCAL statement_timeout='2s'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL lock_timeout='250ms'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL idle_in_transaction_session_timeout='3s'")
        .execute(&mut *tx)
        .await?;
    Ok(tx)
}

async fn bounded<T>(
    work: impl Future<Output = Result<T, BootstrapError>>,
) -> Result<T, BootstrapError> {
    // Includes pool wait, statements and COMMIT. Timeout during COMMIT is
    // ambiguous, never an ACK; the durable idempotent receipt resolves retry.
    tokio::time::timeout(Duration::from_secs(5), work)
        .await
        .map_err(|_| BootstrapError::Deadline)?
}

fn control_binding(
    input: &Verified<Binding>,
    binding: &Binding,
    now: i64,
) -> Result<(), BootstrapError> {
    input.check(binding, "CONTROL", now)?;
    if input.value() != binding {
        return Err(ProtocolError::Scope.into());
    }
    Ok(())
}

/// Locks/revalidates the durable writer fence in the SAME transaction as data.
async fn fence(tx: &mut Tx<'_>, h: &BootstrapHandle) -> Result<String, BootstrapError> {
    let slot = h.manifest.binding.slot_key()?;
    let row = sqlx::query(
        "SELECT binding_digest,writer_generation FROM portal_projection.bootstrap_streams
         WHERE slot_key=$1 FOR UPDATE",
    )
    .bind(slot)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(BootstrapError::Resync)?;
    if row.try_get::<Uuid, _>("writer_generation")? != h.manifest.generation
        || row.try_get::<String, _>("binding_digest")? != h.manifest.binding.digest()?
    {
        return Err(BootstrapError::Resync);
    }
    let row = sqlx::query(
        "SELECT state,manifest_digest,limits_digest FROM portal_projection.bootstrap_generations
         WHERE generation=$1 FOR UPDATE",
    )
    .bind(h.manifest.generation)
    .fetch_one(&mut **tx)
    .await?;
    if row.try_get::<String, _>("manifest_digest")? != digest(&h.manifest)?
        || row.try_get::<String, _>("limits_digest")? != digest(&h.limits)?
    {
        return Err(BootstrapError::Integrity);
    }
    let state: String = row.try_get("state")?;
    if !matches!(state.as_str(), "INITIALIZING" | "CATCHING_UP" | "READY") {
        return Err(BootstrapError::Resync);
    }
    Ok(state)
}

async fn receipt(tx: &mut Tx<'_>, generation: Uuid) -> Result<BootstrapReceipt, BootstrapError> {
    let row = sqlx::query(
        "SELECT checkpoint_cursor,revision FROM portal_projection.bootstrap_generations
         WHERE generation=$1",
    )
    .bind(generation)
    .fetch_one(&mut **tx)
    .await?;
    Ok(BootstrapReceipt {
        generation,
        cursor: row.try_get("checkpoint_cursor")?,
        revision: row.try_get("revision")?,
    })
}

impl PgProjectionStore {
    /// Creates/resumes durable staging without changing the active read pointer.
    /// New generation ownership fences any paused previous writer at commit.
    ///
    /// # Errors
    /// Rejects untrusted, expired-new, changed or fenced manifests; propagates
    /// bounded transaction and database failures without acknowledging source.
    pub async fn bootstrap_begin(
        &self,
        input: &Verified<Manifest>,
        limits: Limits,
        now: i64,
    ) -> Result<BootstrapHandle, BootstrapError> {
        bounded(async {
        let manifest = input.value();
        input.check(&manifest.binding, "MANIFEST", now)?;
        limits.validate()?;
        manifest.validate_structure()?;
        let _permit = self.admit(WorkClass::BackgroundWrite, manifest.binding.datasets.len(),
            encoded_len(manifest)?.checked_mul(3).ok_or(BootstrapError::Bounds)?)?;
        let slot = manifest.binding.slot_key()?;
        let binding = manifest.binding.digest()?;
        let md = digest(manifest)?;
        let mut tx = begin_tx(self).await?;
        sqlx::query(
            "INSERT INTO portal_projection.bootstrap_streams
             (slot_key,binding_digest,writer_generation,updated_at_ms) VALUES ($1,$2,$3,$4)
             ON CONFLICT (slot_key) DO NOTHING",
        ).bind(&slot).bind(&binding).bind(manifest.generation).bind(now).execute(&mut *tx).await?;
        let root = sqlx::query(
            "SELECT writer_generation FROM portal_projection.bootstrap_streams
             WHERE slot_key=$1 FOR UPDATE",
        ).bind(&slot).fetch_one(&mut *tx).await?;
        if let Some(old) = sqlx::query(
            "SELECT manifest_digest,limits_digest,state FROM portal_projection.bootstrap_generations WHERE generation=$1",
        ).bind(manifest.generation).fetch_optional(&mut *tx).await? {
            if old.try_get::<String, _>("manifest_digest")? != md
                || old.try_get::<String, _>("limits_digest")? != digest(&limits)?
                || root.try_get::<Uuid, _>("writer_generation")? != manifest.generation {
                return Err(BootstrapError::Resync);
            }
            match old.try_get::<String, _>("state")?.as_str() {
                "INITIALIZING" => manifest.validate(&limits, now)?,
                "CATCHING_UP" | "READY" => {},
                _ => return Err(BootstrapError::Resync),
            }
        } else {
            manifest.validate(&limits, now)?;
            sqlx::query(
                "INSERT INTO portal_projection.bootstrap_generations
                 (generation,slot_key,manifest_digest,limits_digest,manifest,state,checkpoint_cursor,
                  rollback_until_ms,updated_at_ms) VALUES ($1,$2,$3,$4,$5,'INITIALIZING',$6,$7,$8)",
            ).bind(manifest.generation).bind(&slot).bind(md).bind(digest(&limits)?)
                .bind(serde_json::to_value(manifest).map_err(|_| BootstrapError::Serialization)?)
                .bind(&manifest.delta_start).bind(manifest.rollback_until_ms).bind(now)
                .execute(&mut *tx).await?;
            for dataset in manifest.binding.datasets.keys() {
                sqlx::query(
                    "INSERT INTO portal_projection.bootstrap_datasets
                     (generation,dataset,page_chain,checkpoint_cursor) VALUES ($1,$2,$3,$4)",
                ).bind(manifest.generation).bind(dataset).bind(page_seed(manifest, dataset)?)
                    .bind(&manifest.delta_start).execute(&mut *tx).await?;
            }
            sqlx::query(
                "UPDATE portal_projection.bootstrap_streams SET binding_digest=$2,
                 writer_generation=$3,updated_at_ms=$4 WHERE slot_key=$1",
            ).bind(slot).bind(binding).bind(manifest.generation).bind(now).execute(&mut *tx).await?;
            // Start the bounded stale window when a replacement starts, not
            // when the old (possibly long-running) snapshot was first created.
            sqlx::query("UPDATE portal_projection.bootstrap_generations SET rollback_until_ms=$2
                WHERE generation=(SELECT active_generation FROM portal_projection.bootstrap_streams WHERE slot_key=$1)")
                .bind(manifest.binding.slot_key()?)
                .bind(now.checked_add(limits.rollback_ttl_ms).ok_or(BootstrapError::Bounds)?)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(BootstrapHandle { manifest: manifest.clone(), limits })
        }).await
    }

    /// Persists an exact page to invisible staging; never advances a tail ACK.
    ///
    /// # Errors
    /// Rejects expiry, scope, chain/identity conflicts, size limits or a stale
    /// generation. Database/deadline errors leave no partially staged page.
    pub async fn bootstrap_stage_page(
        &self,
        h: &BootstrapHandle,
        input: &Verified<SnapshotPage>,
        now: i64,
    ) -> Result<(), BootstrapError> {
        bounded(async {
        input.check(&h.manifest.binding, "PAGE", now)?;
        let page = input.value();
        page.validate(&h.manifest, &h.limits, now)?;
        // Reserve the protocol ceiling before any SQL/JSON materialization.
        // Logical accounting covers retained input + SQL value + serialization;
        // it is deliberately not a promise about allocator/process RSS.
        let _permit = self.admit(WorkClass::BackgroundWrite, page.rows.len(),
            h.limits.page_bytes.checked_mul(3).ok_or(BootstrapError::Bounds)?)?;
        let key = digest(&(&page.dataset, page.index))?;
        let pd = digest(page)?;
        let mut tx = begin_tx(self).await?;
        if fence(&mut tx, h).await? != "INITIALIZING" { return Err(BootstrapError::Resync); }
        if let Some(row) = sqlx::query(
            "SELECT input_digest FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='PAGE' AND input_key=$2",
        ).bind(h.manifest.generation).bind(&key).fetch_optional(&mut *tx).await? {
            if row.try_get::<String, _>("input_digest")? != pd { return Err(BootstrapError::Integrity); }
            tx.commit().await?;
            return Ok(());
        }
        let progress = sqlx::query(
            "SELECT completed_pages,page_chain FROM portal_projection.bootstrap_datasets
             WHERE generation=$1 AND dataset=$2 FOR UPDATE",
        ).bind(h.manifest.generation).bind(&page.dataset).fetch_one(&mut *tx).await?;
        if progress.try_get::<i64, _>("completed_pages")? != number(page.index)?
            || progress.try_get::<String, _>("page_chain")? != page.previous_digest {
            return Err(BootstrapError::Integrity);
        }
        for row in &page.rows {
            revision_guard(&mut tx, h, &row.dataset, &row.entity_id, &row.revision,
                &canonical_value_digest(&row.payload), false).await?;
            let inserted = sqlx::query(
                "INSERT INTO portal_projection.bootstrap_rows
                 (generation,dataset,entity_id,revision_order,source_revision,payload_digest,
                  payload,last_operation) VALUES ($1,$2,$3,$4,$5,$6,$7,'UPSERT')
                 RETURNING octet_length(jsonb_build_object('dataset',dataset,'entity_id',entity_id,
                   'revision',jsonb_build_object('ordinal',revision_order::text,'opaque',source_revision),
                   'payload',payload)::text) AS encoded_bytes, payload",
            ).bind(h.manifest.generation).bind(&row.dataset).bind(&row.entity_id)
                .bind(number(row.revision.ordinal)?).bind(&row.revision.opaque)
                .bind(canonical_value_digest(&row.payload)).bind(&row.payload)
                .fetch_one(&mut *tx).await?;
            row_byte_bound(inserted.try_get("encoded_bytes")?, h.limits.page_bytes)?;
            let stored: serde_json::Value = inserted.try_get("payload")?;
            if canonical_value_digest(&stored) != canonical_value_digest(&row.payload) {
                return Err(BootstrapError::Integrity);
            }
        }
        sqlx::query(
            "INSERT INTO portal_projection.bootstrap_inputs
             (generation,kind,input_key,ordinal,input_digest,content)
             VALUES ($1,'PAGE',$2,$3,$4,'{}')",
        ).bind(h.manifest.generation).bind(key).bind(number(page.index)?).bind(pd)
            .execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE portal_projection.bootstrap_datasets SET completed_pages=completed_pages+1,
             page_chain=$3 WHERE generation=$1 AND dataset=$2",
        ).bind(h.manifest.generation).bind(&page.dataset).bind(page.chain_digest()?)
            .execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
        }).await
    }

    /// No pointer becomes visible until every page and reference is verified.
    ///
    /// # Errors
    /// Rejects unauthorized control, expiry before completion, missing pages,
    /// broken references, fence conflicts and database/deadline failures.
    pub async fn bootstrap_finish_snapshot(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<Option<BootstrapReceipt>, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::BackgroundWrite, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            let state = fence(&mut tx, h).await?;
            if state != "INITIALIZING" {
                let ack = if state == "READY" {
                    Some(receipt(&mut tx, h.manifest.generation).await?)
                } else {
                    None
                };
                tx.commit().await?;
                return Ok(ack);
            }
            if now >= h.manifest.expires_at_ms {
                return Err(BootstrapError::Resync);
            }
            for (dataset, plan) in &h.manifest.pages {
                let row = sqlx::query(
                    "SELECT completed_pages,page_chain FROM portal_projection.bootstrap_datasets
                 WHERE generation=$1 AND dataset=$2",
                )
                .bind(h.manifest.generation)
                .bind(dataset)
                .fetch_one(&mut *tx)
                .await?;
                if row.try_get::<i64, _>("completed_pages")? != number(plan.count)?
                    || row.try_get::<String, _>("page_chain")? != plan.final_digest
                {
                    return Err(BootstrapError::Integrity);
                }
            }
            validate_references(&mut tx, h).await?;
            sqlx::query(
            "UPDATE portal_projection.bootstrap_generations SET state='CATCHING_UP',updated_at_ms=$2
             WHERE generation=$1",
        ).bind(h.manifest.generation).bind(now).execute(&mut *tx).await?;
            let ready = h.manifest.delta_start == h.manifest.catchup_cursor;
            let ack = if ready {
                activate(&mut tx, h, now).await?;
                Some(receipt(&mut tx, h.manifest.generation).await?)
            } else {
                None
            };
            tx.commit().await?;
            Ok(ack)
        })
        .await
    }

    /// One pending fresh group per generation; chunks are bounded and invisible.
    ///
    /// # Errors
    /// Rejects untrusted/oversize/conflicting chunks, initialization or competing
    /// pending groups; propagates bounded database failures.
    #[allow(clippy::too_many_lines)] // Keep bounded staging, durable dedupe and integrity in one transaction.
    pub async fn bootstrap_stage_delta(
        &self,
        h: &BootstrapHandle,
        input: &Verified<DeltaChunk>,
        now: i64,
    ) -> Result<(), BootstrapError> {
        bounded(async {
            input.check(&h.manifest.binding, "CHUNK", now)?;
            let chunk = input.value();
            chunk.validate(&h.manifest, &h.limits, now)?;
            let _permit = self.admit(
                WorkClass::LiveWrite,
                chunk.events.len(),
                h.limits
                    .group_bytes
                    .checked_mul(3)
                    .ok_or(BootstrapError::Bounds)?,
            )?;
            let mut tx = begin_tx(self).await?;
            let state = fence(&mut tx, h).await?;
            if state == "INITIALIZING" {
                return Err(BootstrapError::Resync);
            }
            let cd = chunk.digest()?;
            if let Some(row) = sqlx::query(
                "SELECT content FROM portal_projection.bootstrap_inputs
            WHERE generation=$1 AND kind='GROUP' AND input_key=$2",
            )
            .bind(h.manifest.generation)
            .bind(&chunk.group_id)
            .fetch_optional(&mut *tx)
            .await?
            {
                let group: DeltaGroup = serde_json::from_value(row.try_get("content")?)
                    .map_err(|_| BootstrapError::Serialization)?;
                if group
                    .chunk_digests
                    .get(usize::try_from(chunk.index).map_err(|_| BootstrapError::Bounds)?)
                    != Some(&cd)
                {
                    return Err(BootstrapError::Integrity);
                }
                tx.commit().await?;
                return Ok(());
            }
            if sqlx::query(
                "SELECT 1 FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='CHUNK' AND group_id<>$2 LIMIT 1",
            )
            .bind(h.manifest.generation)
            .bind(&chunk.group_id)
            .fetch_optional(&mut *tx)
            .await?
            .is_some()
            {
                return Err(BootstrapError::FreshPending);
            }
            let key = digest(&(&chunk.group_id, chunk.index))?;
            if let Some(row) = sqlx::query(
                "SELECT input_digest FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='CHUNK' AND input_key=$2",
            )
            .bind(h.manifest.generation)
            .bind(&key)
            .fetch_optional(&mut *tx)
            .await?
            {
                if row.try_get::<String, _>("input_digest")? != cd {
                    return Err(BootstrapError::Integrity);
                }
            } else {
                // Bound durable staging too, not only the supplied individual chunk.
                let row = sqlx::query(
                "SELECT count(*) AS n,COALESCE(sum(octet_length(content::text)),0)::bigint AS bytes,
                 COALESCE(sum(jsonb_array_length(content->'events')),0)::bigint AS events
                 FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='CHUNK'",
            ).bind(h.manifest.generation).fetch_one(&mut *tx).await?;
                let content =
                    serde_json::to_value(chunk).map_err(|_| BootstrapError::Serialization)?;
                let bytes = encoded_len(chunk)?;
                if row.try_get::<i64, _>("n")? >= number(h.limits.group_chunks as u64)?
                    || row.try_get::<i64, _>("events")? + number(chunk.events.len() as u64)?
                        > number(h.limits.group_events as u64)?
                    || row.try_get::<i64, _>("bytes")? + number(bytes as u64)?
                        > number(h.limits.group_bytes as u64)?
                {
                    return Err(BootstrapError::Bounds);
                }
                let staged = sqlx::query(
                    "INSERT INTO portal_projection.bootstrap_inputs
                 (generation,kind,input_key,group_id,ordinal,input_digest,content)
                 VALUES ($1,'CHUNK',$2,$3,$4,$5,$6)
                 RETURNING octet_length(content::text) AS encoded_bytes",
                )
                .bind(h.manifest.generation)
                .bind(key)
                .bind(&chunk.group_id)
                .bind(number(chunk.index)?)
                .bind(cd)
                .bind(content)
                .fetch_one(&mut *tx)
                .await?;
                if row.try_get::<i64, _>("bytes")?
                    + i64::from(staged.try_get::<i32, _>("encoded_bytes")?)
                    > number(h.limits.group_bytes as u64)?
                {
                    return Err(BootstrapError::Bounds);
                }
            }
            tx.commit().await?;
            Ok(())
        })
        .await
    }

    /// Atomic immutable facts/current/checkpoints/group marker/pointer, then ACK.
    ///
    /// # Errors
    /// Rejects incomplete/conflicting groups, cursor mismatch, unknown lineage,
    /// invalid references or stale writers. No error is a source ACK, including
    /// an ambiguous connection/deadline failure while COMMIT is in progress.
    pub async fn bootstrap_commit_group(
        &self,
        h: &BootstrapHandle,
        input: &Verified<DeltaGroup>,
        now: i64,
    ) -> Result<BootstrapReceipt, BootstrapError> {
        bounded(async {
        input.check(&h.manifest.binding, "GROUP", now)?;
        let group = input.value();
        group.validate(&h.manifest, &h.limits, now)?;
        let _permit = self.admit(WorkClass::LiveWrite, h.limits.group_events,
            h.limits.group_bytes.checked_mul(4).ok_or(BootstrapError::Bounds)?)?;
        let gd = digest(group)?;
        let mut tx = begin_tx(self).await?;
        let state = fence(&mut tx, h).await?;
        if state == "INITIALIZING" { return Err(BootstrapError::Resync); }
        if let Some(row) = sqlx::query(
            "SELECT input_digest,receipt_revision FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='GROUP' AND input_key=$2",
        ).bind(h.manifest.generation).bind(&group.group_id).fetch_optional(&mut *tx).await? {
            if row.try_get::<String, _>("input_digest")? != gd { return Err(BootstrapError::Integrity); }
            let ack = BootstrapReceipt { generation: h.manifest.generation,
                cursor: group.to_cursor.clone(), revision: row.try_get("receipt_revision")? };
            tx.commit().await?;
            return Ok(ack);
        }
        let before = receipt(&mut tx, h.manifest.generation).await?;
        if before.cursor != group.from_cursor || group.to_cursor == group.from_cursor {
            return Err(BootstrapError::Resync);
        }
        let chunks = sqlx::query(
            "SELECT ordinal,input_digest,content FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='CHUNK' AND group_id=$2 ORDER BY ordinal",
        ).bind(h.manifest.generation).bind(&group.group_id).fetch_all(&mut *tx).await?;
        if chunks.len() != group.chunk_digests.len() { return Err(BootstrapError::Integrity); }
        let mut events = Vec::new();
        for (index, row) in chunks.into_iter().enumerate() {
            if row.try_get::<i64, _>("ordinal")? != number(index as u64)?
                || row.try_get::<String, _>("input_digest")? != group.chunk_digests[index] {
                return Err(BootstrapError::Integrity);
            }
            let chunk: DeltaChunk = serde_json::from_value(row.try_get("content")?)
                .map_err(|_| BootstrapError::Serialization)?;
            chunk.validate(&h.manifest, &h.limits, now)?;
            if chunk.digest()? != group.chunk_digests[index] { return Err(BootstrapError::Integrity); }
            events.extend(chunk.events);
        }
        if events.len() > h.limits.group_events
            || encoded_len(&events)? > h.limits.group_bytes {
            return Err(BootstrapError::Bounds);
        }
        if events_digest(&events)? != group.events_digest { return Err(BootstrapError::Integrity); }
        authoritative_event_core::bootstrap::validate_events(&events, &h.manifest, &h.limits)?;
        for event in &events { append_fact(&mut tx, h, event, true).await?; }
        // Replay membership is immutable and shares the fact/checkpoint COMMIT.
        // It preserves transport order/duplicates without duplicating payloads;
        // history-only backfill deliberately creates no live change receipt.
        let mut event_refs = Vec::new();
        for (ordinal, event) in events.iter().enumerate() {
            event_refs.push((number(ordinal as u64)?, event.event.event_id.as_str(), digest(event)?));
            sqlx::query("INSERT INTO portal_projection.bootstrap_group_facts
                (generation,group_id,ordinal,event_id) VALUES ($1,$2,$3,$4)")
                .bind(h.manifest.generation).bind(&group.group_id)
                .bind(number(ordinal as u64)?).bind(event.event.event_id.as_str())
                .execute(&mut *tx).await?;
        }
        validate_references(&mut tx, h).await?;
        let rev = before.revision.checked_add(1).ok_or(BootstrapError::Bounds)?;
        sqlx::query(
            "UPDATE portal_projection.bootstrap_generations SET checkpoint_cursor=$2,
             revision=$3,updated_at_ms=$4 WHERE generation=$1",
        ).bind(h.manifest.generation).bind(&group.to_cursor).bind(rev).bind(now).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE portal_projection.bootstrap_datasets SET checkpoint_cursor=$2 WHERE generation=$1",
        ).bind(h.manifest.generation).bind(&group.to_cursor).execute(&mut *tx).await?;
        sqlx::query(
            "INSERT INTO portal_projection.bootstrap_inputs
             (generation,kind,input_key,group_id,input_digest,content,receipt_revision,event_refs_complete,event_refs)
             VALUES ($1,'GROUP',$2,$2,$3,$4,$5,TRUE,$6)",
        ).bind(h.manifest.generation).bind(&group.group_id).bind(gd)
            .bind(serde_json::to_value(group).map_err(|_| BootstrapError::Serialization)?)
            .bind(rev).bind(serde_json::to_value(event_refs).map_err(|_| BootstrapError::Serialization)?)
            .execute(&mut *tx).await?;
        sqlx::query(
            "DELETE FROM portal_projection.bootstrap_inputs
             WHERE generation=$1 AND kind='CHUNK' AND group_id=$2",
        ).bind(h.manifest.generation).bind(&group.group_id).execute(&mut *tx).await?;
        if state == "CATCHING_UP" && group.reached_catchup {
            if group.to_cursor != h.manifest.catchup_cursor { return Err(BootstrapError::Integrity); }
            activate(&mut tx, h, now).await?;
        }
        let ack = BootstrapReceipt { generation: h.manifest.generation, cursor: group.to_cursor.clone(), revision: rev };
        tx.commit().await?;
        Ok(ack)
        }).await
    }

    /// Low-priority immutable history only: no reducer, cursor or command effect.
    /// Hard per-call subquota and a pending-fresh-group guard prevent backfill hogs.
    ///
    /// # Errors
    /// Rejects invalid history, missing lineage, bounds or pending fresh work;
    /// database/deadline errors roll back the whole history batch.
    pub async fn bootstrap_backfill_history(
        &self,
        h: &BootstrapHandle,
        input: &Verified<DeltaChunk>,
        now: i64,
    ) -> Result<(), BootstrapError> {
        bounded(async {
        input.check(&h.manifest.binding, "HISTORY", now)?;
        let chunk = input.value();
        chunk.validate(&h.manifest, &h.limits, now)?;
        if chunk.events.len() > 64 || encoded_len(chunk)? > h.limits.page_bytes / 4 {
            return Err(BootstrapError::Bounds);
        }
        let _permit = self.admit(WorkClass::BackgroundWrite, chunk.events.len(),
            h.limits.page_bytes.checked_mul(3).ok_or(BootstrapError::Bounds)? / 4)?;
        let mut tx = begin_tx(self).await?;
        fence(&mut tx, h).await?;
        if sqlx::query("SELECT 1 FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='CHUNK' LIMIT 1")
            .bind(h.manifest.generation).fetch_optional(&mut *tx).await?.is_some() {
            return Err(BootstrapError::FreshPending);
        }
        for event in &chunk.events { append_fact(&mut tx, h, event, false).await?; }
        tx.commit().await?;
        Ok(())
        }).await
    }

    /// Explicit source loss/retention reset. Never continue a partial history.
    ///
    /// # Errors
    /// Rejects unauthorized/fenced control and database/deadline failure.
    pub async fn bootstrap_require_resync(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<(), BootstrapError> {
        bounded(async {
        control_binding(control, &h.manifest.binding, now)?;
        // A bounded state transition to stop ingestion remains available under
        // storage pressure; this is not admission for more economic facts.
        let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
        let mut tx = begin_tx(self).await?;
        fence(&mut tx, h).await?;
        sqlx::query("UPDATE portal_projection.bootstrap_generations SET state='RESYNC_REQUIRED',updated_at_ms=$2 WHERE generation=$1")
            .bind(h.manifest.generation).bind(now).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
        }).await
    }

    /// Reconnect from the last durable cursor; never reconstruct from MAX(id).
    ///
    /// # Errors
    /// Rejects unauthorized/fenced control and database/deadline failure.
    pub async fn bootstrap_checkpoint(
        &self,
        h: &BootstrapHandle,
        control: &Verified<Binding>,
        now: i64,
    ) -> Result<BootstrapReceipt, BootstrapError> {
        bounded(async {
            control_binding(control, &h.manifest.binding, now)?;
            let _permit = self.admit(WorkClass::ControlRead, 1, 8192)?;
            let mut tx = begin_tx(self).await?;
            if fence(&mut tx, h).await? == "INITIALIZING" {
                return Err(BootstrapError::Resync);
            }
            let ack = receipt(&mut tx, h.manifest.generation).await?;
            tx.commit().await?;
            Ok(ack)
        })
        .await
    }

    /// One consistent generation/revision for every query and continuation.
    /// Current-policy proof remains mandatory even for retained/stale reads.
    ///
    /// # Errors
    /// Rejects stale authorization/pins, unavailable or resync-required state,
    /// oversized pages and bounded database failures; never mixes generations.
    pub async fn bootstrap_read(
        &self,
        input: &Verified<Binding>,
        pin: Option<&BootstrapReadPin>,
        limit: usize,
        now: i64,
    ) -> Result<BootstrapView, BootstrapError> {
        bounded(async {
        let binding = input.value();
        input.check(binding, "READ", now)?;
        let binding_digest = binding.digest()?;
        if limit == 0 || limit > 200 { return Err(BootstrapError::Bounds); }
        let _permit = self.admit(WorkClass::Interactive, limit, 3 * 1024 * 1024)?;
        let mut tx = self.pool.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY").execute(&mut *tx).await?;
        sqlx::query("SET LOCAL statement_timeout='2s'").execute(&mut *tx).await?;
        let root = sqlx::query(
            "SELECT binding_digest,writer_generation,active_generation FROM portal_projection.bootstrap_streams WHERE slot_key=$1",
        ).bind(binding.slot_key()?).fetch_optional(&mut *tx).await?.ok_or(BootstrapError::Resync)?;
        if root.try_get::<String, _>("binding_digest")? != binding.digest()? { return Err(BootstrapError::Resync); }
        let generation: Uuid = root.try_get::<Option<Uuid>, _>("active_generation")?.ok_or(BootstrapError::Resync)?;
        let generation_row = sqlx::query("SELECT manifest,state,revision,rollback_until_ms,updated_at_ms FROM portal_projection.bootstrap_generations WHERE generation=$1")
            .bind(generation).fetch_one(&mut *tx).await?;
        let manifest: Manifest = serde_json::from_value(generation_row.try_get("manifest")?)
            .map_err(|_| BootstrapError::Serialization)?;
        if manifest.binding != *binding { return Err(BootstrapError::Resync); }
        let state: String = generation_row.try_get("state")?;
        if state == "RESYNC_REQUIRED" { return Err(BootstrapError::Resync); }
        let rebuilding = generation != root.try_get::<Uuid, _>("writer_generation")?;
        if rebuilding && now > generation_row.try_get::<i64, _>("rollback_until_ms")? {
            return Err(BootstrapError::Resync);
        }
        let rev: i64 = generation_row.try_get("revision")?;
        let projection_committed_at_ms = generation_row.try_get("updated_at_ms")?;
        let stale_until_ms = if rebuilding { Some(generation_row.try_get("rollback_until_ms")?) } else { None };
        let mut after = (String::new(), String::new());
        if let Some(pin) = pin {
            if pin.generation != generation || pin.binding_digest != binding.digest()? || pin.revision != rev {
                return Err(BootstrapError::Resync);
            }
            after = pin.after.clone();
        }
        // Bounded candidate scan + DB-side byte budget avoids loading 200 huge
        // JSON payloads into process memory before discovering the byte ceiling.
        let rows = sqlx::query(
            "SELECT * FROM (SELECT q.*,sum(octet_length(jsonb_build_object(
                'dataset',dataset,'entity_id',entity_id,'revision',jsonb_build_object(
                'ordinal',revision_order::text,'opaque',source_revision),'payload',payload)::text)+2)
             OVER (ORDER BY dataset,entity_id) AS page_bytes FROM
             (SELECT dataset,entity_id,revision_order,source_revision,payload
              FROM portal_projection.bootstrap_rows WHERE generation=$1 AND NOT tombstoned
              AND (dataset,entity_id)>($2,$3) ORDER BY dataset,entity_id LIMIT $4) q) b
             WHERE page_bytes <= 1048576 ORDER BY dataset,entity_id",
        ).bind(generation).bind(&after.0).bind(&after.1).bind(number(limit as u64)?)
            .fetch_all(&mut *tx).await?;
        let mut result = Vec::new();
        for row in rows {
            let dataset: String = row.try_get("dataset")?;
            let id: String = row.try_get("entity_id")?;
            after = (dataset.clone(), id.clone());
            result.push(SnapshotRow { dataset, entity_id: id,
                revision: Revision { ordinal: u64::try_from(row.try_get::<i64, _>("revision_order")?).map_err(|_| BootstrapError::Integrity)?,
                    opaque: row.try_get("source_revision")? }, payload: row.try_get("payload")? });
        }
        let more = sqlx::query("SELECT 1 FROM portal_projection.bootstrap_rows WHERE generation=$1 AND NOT tombstoned AND (dataset,entity_id)>($2,$3) LIMIT 1")
            .bind(generation).bind(&after.0).bind(&after.1).fetch_optional(&mut *tx).await?.is_some();
        if result.is_empty() && more { return Err(BootstrapError::Bounds); }
        tx.commit().await?;
        Ok(BootstrapView { generation, state: if rebuilding { "STALE" } else { "READY" },
            projection_committed_at_ms, stale_until_ms, rows: result,
            next: more.then_some(BootstrapReadPin { generation, binding_digest, revision: rev, after }) })
        }).await
    }
}

async fn activate(tx: &mut Tx<'_>, h: &BootstrapHandle, now: i64) -> Result<(), BootstrapError> {
    // Every dataset checkpoint/pointer and readiness marker shares this COMMIT.
    sqlx::query(
        "UPDATE portal_projection.bootstrap_generations SET state='RETAINED',rollback_until_ms=$3
         WHERE generation=(SELECT active_generation FROM portal_projection.bootstrap_streams WHERE slot_key=$1)
         AND generation<>$2",
    ).bind(h.manifest.binding.slot_key()?).bind(h.manifest.generation)
        .bind(now.checked_add(h.limits.rollback_ttl_ms).ok_or(BootstrapError::Bounds)?)
        .execute(&mut **tx).await?;
    sqlx::query("UPDATE portal_projection.bootstrap_generations SET state='READY',updated_at_ms=$2 WHERE generation=$1")
        .bind(h.manifest.generation).bind(now).execute(&mut **tx).await?;
    sqlx::query("UPDATE portal_projection.bootstrap_streams SET active_generation=$2,updated_at_ms=$3 WHERE slot_key=$1")
        .bind(h.manifest.binding.slot_key()?).bind(h.manifest.generation).bind(now).execute(&mut **tx).await?;
    Ok(())
}

async fn validate_references(tx: &mut Tx<'_>, h: &BootstrapHandle) -> Result<(), BootstrapError> {
    for reference in &h.manifest.references {
        if sqlx::query(
            "SELECT 1 FROM portal_projection.bootstrap_rows r WHERE r.generation=$1
             AND r.dataset=$2 AND NOT r.tombstoned AND
             (jsonb_typeof(r.payload->$4) IS DISTINCT FROM 'string' OR NOT EXISTS
             (SELECT 1 FROM portal_projection.bootstrap_rows t WHERE t.generation=r.generation
              AND t.dataset=$3 AND t.entity_id=r.payload->>$4 AND NOT t.tombstoned)) LIMIT 1",
        )
        .bind(h.manifest.generation)
        .bind(&reference.from_dataset)
        .bind(&reference.to_dataset)
        .bind(&reference.field)
        .fetch_optional(&mut **tx)
        .await?
        .is_some()
        {
            return Err(BootstrapError::Integrity);
        }
    }
    Ok(())
}

async fn append_fact(
    tx: &mut Tx<'_>,
    h: &BootstrapHandle,
    input: &DeltaEvent,
    apply: bool,
) -> Result<(), BootstrapError> {
    let event = &input.event;
    let ed = digest(input)?;
    revision_guard(
        tx,
        h,
        &event.entity_kind,
        event.entity_id.as_str(),
        &input.revision,
        &event.payload_digest,
        event.operation == EventOperation::Tombstone,
    )
    .await?;
    if let Some(row) = sqlx::query("SELECT event_digest FROM portal_projection.bootstrap_facts WHERE generation=$1 AND event_id=$2")
        .bind(h.manifest.generation).bind(event.event_id.as_str()).fetch_optional(&mut **tx).await? {
        if row.try_get::<String, _>("event_digest")? != ed { return Err(BootstrapError::Integrity); }
    } else {
        if let Some(target) = event.correction_of_event_id.as_ref().or(event.tombstone_of_event_id.as_ref()) {
            let target = sqlx::query("SELECT dataset,entity_id,source_sequence,
                (event->'revision'->>'ordinal')::bigint AS revision_order
                FROM portal_projection.bootstrap_facts WHERE generation=$1 AND event_id=$2")
                .bind(h.manifest.generation).bind(target.as_str()).fetch_optional(&mut **tx).await?
                .ok_or(BootstrapError::Resync)?;
            if target.try_get::<String, _>("dataset")? != event.entity_kind
                || target.try_get::<String, _>("entity_id")? != event.entity_id.as_str()
                || target.try_get::<i64, _>("source_sequence")? >= number(event.source_position.sequence_u64().map_err(|_| BootstrapError::Integrity)?)?
                || target.try_get::<i64, _>("revision_order")? >= number(input.revision.ordinal)? {
                return Err(BootstrapError::Integrity);
            }
        }
        let stored: serde_json::Value = sqlx::query_scalar(
            "INSERT INTO portal_projection.bootstrap_facts
             (generation,event_id,dataset,entity_id,event_digest,source_sequence,event) VALUES ($1,$2,$3,$4,$5,$6,$7)
             RETURNING event",
        ).bind(h.manifest.generation).bind(event.event_id.as_str()).bind(&event.entity_kind)
            .bind(event.entity_id.as_str()).bind(&ed)
            .bind(number(event.source_position.sequence_u64().map_err(|_| BootstrapError::Integrity)?)?)
            .bind(serde_json::to_value(input).map_err(|_| BootstrapError::Serialization)?)
            .fetch_one(&mut **tx).await?;
        if canonical_value_digest(&stored) != ed {
            return Err(BootstrapError::Integrity);
        }
    }
    if !apply {
        return Ok(());
    }
    let op = match event.operation {
        EventOperation::Upsert => "UPSERT",
        EventOperation::Correction => "CORRECTION",
        EventOperation::Tombstone => "TOMBSTONE",
    };
    let current = sqlx::query("SELECT revision_order,source_revision,payload_digest,tombstoned FROM portal_projection.bootstrap_rows WHERE generation=$1 AND dataset=$2 AND entity_id=$3 FOR UPDATE")
        .bind(h.manifest.generation).bind(&event.entity_kind).bind(event.entity_id.as_str())
        .fetch_optional(&mut **tx).await?;
    if let Some(row) = current {
        let previous: i64 = row.try_get("revision_order")?;
        if previous > number(input.revision.ordinal)? {
            return Ok(());
        }
        if previous == number(input.revision.ordinal)? {
            if row.try_get::<String, _>("source_revision")? != input.revision.opaque
                || row.try_get::<String, _>("payload_digest")? != event.payload_digest
                || row.try_get::<bool, _>("tombstoned")?
                    != (event.operation == EventOperation::Tombstone)
            {
                return Err(BootstrapError::Integrity);
            }
            return Ok(());
        }
    }
    let inserted = sqlx::query(
        "INSERT INTO portal_projection.bootstrap_rows (generation,dataset,entity_id,revision_order,
         source_revision,payload_digest,payload,tombstoned,last_operation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (generation,dataset,entity_id) DO UPDATE SET revision_order=EXCLUDED.revision_order,
         source_revision=EXCLUDED.source_revision,payload_digest=EXCLUDED.payload_digest,payload=EXCLUDED.payload,
         tombstoned=EXCLUDED.tombstoned,last_operation=EXCLUDED.last_operation
         RETURNING octet_length(jsonb_build_object('dataset',dataset,'entity_id',entity_id,
           'revision',jsonb_build_object('ordinal',revision_order::text,'opaque',source_revision),
           'payload',payload)::text) AS encoded_bytes",
    ).bind(h.manifest.generation).bind(&event.entity_kind).bind(event.entity_id.as_str())
        .bind(number(input.revision.ordinal)?).bind(&input.revision.opaque).bind(&event.payload_digest)
        .bind(&event.payload).bind(event.operation == EventOperation::Tombstone).bind(op)
        .fetch_one(&mut **tx).await?;
    row_byte_bound(inserted.try_get("encoded_bytes")?, h.limits.page_bytes)?;
    Ok(())
}

// One immutable digest per entity revision, including snapshot baselines.
// Without it, moving CURRENT to v2 would forget whether replayed v1 conflicted
// with the original snapshot/history. Reuse input receipts; store no extra body.
async fn revision_guard(
    tx: &mut Tx<'_>,
    h: &BootstrapHandle,
    dataset: &str,
    entity_id: &str,
    revision: &Revision,
    payload_digest: &str,
    tombstoned: bool,
) -> Result<(), BootstrapError> {
    let key = digest(&(dataset, entity_id, revision.ordinal))?;
    let signature = digest(&(&revision.opaque, payload_digest, tombstoned))?;
    sqlx::query(
        "INSERT INTO portal_projection.bootstrap_inputs
        (generation,kind,input_key,input_digest,content) VALUES ($1,'REVISION',$2,$3,'{}')
        ON CONFLICT (generation,kind,input_key) DO NOTHING",
    )
    .bind(h.manifest.generation)
    .bind(&key)
    .bind(&signature)
    .execute(&mut **tx)
    .await?;
    let stored: String = sqlx::query_scalar(
        "SELECT input_digest FROM portal_projection.bootstrap_inputs
        WHERE generation=$1 AND kind='REVISION' AND input_key=$2",
    )
    .bind(h.manifest.generation)
    .bind(key)
    .fetch_one(&mut **tx)
    .await?;
    if stored != signature {
        return Err(BootstrapError::Integrity);
    }
    Ok(())
}
