//! Source-dark Research read adapter over committed04 projections.
//!
//! No TS client, browser route, policy implementation or runtime task is installed.
//! The trusted policy port supplies current row/field and source-coverage authority.
//! Cursor tokens contain only a signed opaque server-side state handle; raw source
//! positions, hidden group counts and upstream proof material never leave this store.

use std::{collections::BTreeSet, future::Future, sync::Arc, time::Duration};

use authoritative_event_core::bootstrap::Manifest;
use chrono::{DateTime, Utc};
use execution_contracts::catalogue_v1::{
    Completeness, Confidence, Coverage as WireCoverage, Freshness, Opaque, Quality, SafeInteger,
};
use projection_core::{
    canonical_digest,
    resources::{ResourceError, WorkClass},
};
use query_api::{
    scoped::{
        AuthorizedRead, CacheContext, CacheRequest, Coverage, HistoryCapability, Operation,
        ReadAuthorizer, ReadQuery, ReadScope, ScopedCache, ScopedError,
    },
    CursorBoundary, CursorCodec, CursorContext, CursorDirection,
};
use realtime_sse::scoped::{
    ChangeNotice, NoticeBatch, ReplayError, ReplayFuture, ScopedReplaySource,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};
use thiserror::Error;
use uuid::Uuid;

use crate::PgProjectionStore;

const META_RESERVE: usize = 8192;
const MAX_TIME_MS: i64 = 9_007_199_254_740_991;

fn read_class(operation: Operation) -> WorkClass {
    match operation {
        Operation::Current => WorkClass::Interactive,
        Operation::Replay => WorkClass::ControlRead,
        Operation::History | Operation::Export => WorkClass::BackgroundRead,
    }
}

fn replay_query() -> ReadQuery {
    ReadQuery {
        operation: Operation::Replay,
        limit: 200,
        max_bytes: 1024 * 1024,
        entity_id: None,
        from_ms: None,
        to_ms: None,
    }
}

#[derive(Debug, Error)]
pub enum ReadError {
    #[error(transparent)]
    Resource(#[from] ResourceError),
    #[error(transparent)]
    Scope(#[from] ScopedError),
    #[error("projection read unavailable")]
    Database(#[from] sqlx::Error),
    #[error("RESYNC_REQUIRED")]
    Resync,
    #[error("PROJECTION_READ_INTEGRITY_CONFLICT")]
    Integrity,
    #[error("BOUNDED_READ_REQUIRED")]
    Bounds,
    #[error("SCOPED_READ_DEADLINE_EXCEEDED")]
    Deadline,
    #[error("READ_CURSOR_CAPACITY_BUSY")]
    Busy,
}

/// Explicit isolated safety bounds, not approved production capacity defaults.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct ReadLimits {
    pub cursor_ttl_ms: i64,
    pub max_scope_cursors: i64,
    pub max_total_cursors: i64,
}

impl ReadLimits {
    /// # Errors
    /// Rejects an unbounded cursor store or a lifetime beyond the isolated ceiling.
    pub fn validate(self) -> Result<(), ReadError> {
        if !(1..=300_000).contains(&self.cursor_ttl_ms)
            || !(1..=256).contains(&self.max_scope_cursors)
            || !(self.max_scope_cursors..=4096).contains(&self.max_total_cursors)
        {
            return Err(ReadError::Bounds);
        }
        Ok(())
    }
}

/// Millisecond clock provided by the service, never by the browser.
pub trait ReadClock: Send + Sync {
    fn now_ms(&self) -> i64;
}

pub struct SystemReadClock;
impl ReadClock for SystemReadClock {
    fn now_ms(&self) -> i64 {
        Utc::now().timestamp_millis()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pin {
    identity_key: String,
    generation: Uuid,
    projection_revision: i64,
    ingest_cut: i64,
    after_time: i64,
    after_sequence: i64,
    after_entity: String,
    replay_revision: i64,
    pinned_at_ms: i64,
    expires_at_ms: i64,
}

struct Active {
    generation: Uuid,
    writer_generation: Uuid,
    revision: i64,
    source_epoch: String,
    committed_at_ms: i64,
    rebuilding: bool,
    rollback_until_ms: i64,
}

/// Field-projected current row or immutable historical observation. Event IDs
/// and causal references are keyed, scope-bound aliases, not global sequences.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadRow {
    pub entity_id: String,
    pub revision: String,
    pub payload: Value,
    pub event_id: Option<String>,
    pub operation: Option<String>,
    pub occurred_at_ms: Option<i64>,
    pub correction_of: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReadPage {
    pub schema_version: &'static str,
    pub projection_generation: String,
    pub source_continuity_epoch: String,
    /// Projection COMMIT time, not economic as-of, source time or facts-through.
    pub projection_committed_at_ms: i64,
    pub produced_at_ms: i64,
    pub availability: &'static str,
    pub quality: Quality,
    pub history_capability: HistoryCapability,
    pub coverage: Coverage,
    pub count_status: &'static str,
    pub rows: Vec<ReadRow>,
    pub next_cursor: Option<String>,
    /// Same committed read barrier for the separate notification-only replay.
    pub resume_cursor: Option<String>,
}

fn hash(value: &impl Serialize) -> Result<String, ReadError> {
    canonical_digest(value).map_err(|_| ReadError::Integrity)
}

fn at(ms: i64) -> Result<DateTime<Utc>, ReadError> {
    if !(0..=MAX_TIME_MS).contains(&ms) {
        return Err(ReadError::Bounds);
    }
    DateTime::from_timestamp_millis(ms).ok_or(ReadError::Bounds)
}

fn context(digest: &str, generation: Uuid) -> CursorContext<'_> {
    CursorContext {
        workspace_id: digest,
        environment: "scoped",
        epoch_id: generation,
        resource: "portal.scoped-read.v1",
        query_fingerprint: digest,
    }
}

fn quality(
    scope: &ReadScope,
    rebuilding: bool,
    history: bool,
    now: i64,
) -> Result<Quality, ReadError> {
    Ok(Quality {
        completeness: if scope.coverage == Coverage::CurrentPageOnly
            || (history && scope.history_capability != HistoryCapability::Authoritative)
        {
            Completeness::Partial
        } else {
            Completeness::Complete
        },
        // Local writes/heartbeats cannot establish upstream data freshness.
        freshness: if rebuilding {
            Freshness::Stale
        } else {
            Freshness::Unknown
        },
        coverage: match scope.coverage {
            Coverage::AuthorizedOnly => WireCoverage::AuthorizedOnly,
            Coverage::RetainedObservations => WireCoverage::RetainedObservations,
            Coverage::CurrentPageOnly => WireCoverage::CurrentPageOnly,
        },
        source_as_of_ms: None,
        portal_observed_at_ms: SafeInteger::new(u64::try_from(now).map_err(|_| ReadError::Bounds)?)
            .map_err(|_| ReadError::Bounds)?,
        source_set_ref: Opaque::parse(&scope.source_set_digest)
            .map_err(|_| ReadError::Integrity)?,
        confidence: Confidence::Unknown,
        reasons: vec![
            Opaque::parse("SOURCE_FRESHNESS_NOT_CERTIFIED").map_err(|_| ReadError::Integrity)?
        ],
    })
}

async fn deadline<T>(work: impl Future<Output = Result<T, ReadError>>) -> Result<T, ReadError> {
    tokio::time::timeout(Duration::from_secs(5), work)
        .await
        .map_err(|_| ReadError::Deadline)?
}

async fn read_tx(store: &PgProjectionStore) -> Result<Transaction<'_, Postgres>, ReadError> {
    let mut tx = store.pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL statement_timeout='2s'")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SET LOCAL idle_in_transaction_session_timeout='3s'")
        .execute(&mut *tx)
        .await?;
    Ok(tx)
}

async fn active(
    tx: &mut Transaction<'_, Postgres>,
    scope: &ReadScope,
    now: i64,
) -> Result<Active, ReadError> {
    let row = sqlx::query(
        "SELECT s.binding_digest,s.writer_generation,s.active_generation,
        g.manifest,g.state,g.revision,g.rollback_until_ms,g.updated_at_ms
        FROM portal_projection.bootstrap_streams s
        JOIN portal_projection.bootstrap_generations g ON g.generation=s.active_generation
        WHERE s.slot_key=$1",
    )
    .bind(&scope.slot_key)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(ReadError::Resync)?;
    if row.try_get::<String, _>("binding_digest")? != scope.ingest_binding_digest {
        return Err(ReadError::Resync);
    }
    let manifest: Manifest =
        serde_json::from_value(row.try_get("manifest")?).map_err(|_| ReadError::Integrity)?;
    if manifest
        .binding
        .digest()
        .map_err(|_| ReadError::Integrity)?
        != scope.ingest_binding_digest
        || manifest
            .binding
            .slot_key()
            .map_err(|_| ReadError::Integrity)?
            != scope.slot_key
        || manifest.binding.datasets.get(&scope.dataset) != Some(&scope.schema_version)
    {
        return Err(ReadError::Resync);
    }
    let generation = row.try_get("active_generation")?;
    let rebuilding = generation != row.try_get::<Uuid, _>("writer_generation")?;
    if !matches!(
        row.try_get::<String, _>("state")?.as_str(),
        "READY" | "RETAINED"
    ) || (rebuilding && now >= row.try_get::<i64, _>("rollback_until_ms")?)
    {
        return Err(ReadError::Resync);
    }
    Ok(Active {
        generation,
        writer_generation: row.try_get("writer_generation")?,
        revision: row.try_get("revision")?,
        source_epoch: manifest.binding.source_epoch,
        committed_at_ms: row.try_get("updated_at_ms")?,
        rebuilding,
        rollback_until_ms: row.try_get("rollback_until_ms")?,
    })
}

async fn load_pin(
    tx: &mut Transaction<'_, Postgres>,
    token: &str,
    codec: &CursorCodec,
    context_digest: &str,
    generation: Uuid,
    now: i64,
) -> Result<Pin, ReadError> {
    if token.len() > 4096 {
        return Err(ReadError::Resync);
    }
    let boundary = codec
        .decode(
            token,
            &context(context_digest, generation),
            CursorDirection::After,
            at(now)?,
        )
        .map_err(|_| ReadError::Resync)?;
    if !boundary.sort_values.is_empty() {
        return Err(ReadError::Resync);
    }
    let id = Uuid::parse_str(&boundary.entity_id).map_err(|_| ReadError::Resync)?;
    let row = sqlx::query(
        "SELECT state FROM portal_projection.scoped_read_cursors
        WHERE cursor_id=$1 AND context_digest=$2 AND generation=$3 AND expires_at_ms>$4",
    )
    .bind(id)
    .bind(context_digest)
    .bind(generation)
    .bind(now)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(ReadError::Resync)?;
    let pin: Pin =
        serde_json::from_value(row.try_get("state")?).map_err(|_| ReadError::Integrity)?;
    if pin.generation != generation || pin.expires_at_ms <= now || pin.pinned_at_ms > now {
        return Err(ReadError::Resync);
    }
    if pin.identity_key
        != codec
            .opaque_identifier(
                &context(context_digest, generation),
                "cursor-key",
                "identity",
            )
            .map_err(|_| ReadError::Integrity)?
    {
        return Err(ReadError::Resync);
    }
    Ok(pin)
}

/// No accepting policy/clock/secret is created by constructing the store.
pub struct ScopedReadService<'a> {
    pub store: &'a PgProjectionStore,
    pub authorizer: &'a dyn ReadAuthorizer,
    pub clock: &'a dyn ReadClock,
    pub codec: &'a CursorCodec,
    pub limits: ReadLimits,
}

impl ScopedReadService<'_> {
    fn authorize(&self, read: &AuthorizedRead, query: &ReadQuery) -> Result<(), ReadError> {
        self.limits.validate()?;
        at(self.clock.now_ms())?;
        query.validate(read.scope())?;
        if query.operation != read.operation() {
            return Err(ScopedError::AccessDenied.into());
        }
        read.recheck(self.authorizer, self.clock.now_ms())?;
        Ok(())
    }

    async fn cache_context(
        &self,
        read: &AuthorizedRead,
    ) -> Result<(CacheContext, Option<i64>), ReadError> {
        let mut tx = read_tx(self.store).await?;
        let a = active(&mut tx, read.scope(), self.clock.now_ms()).await?;
        let cut:Option<i64>=sqlx::query_scalar("SELECT max(read_ingest_order) FROM portal_projection.bootstrap_facts WHERE generation=$1")
            .bind(a.generation).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        if a.rebuilding && self.clock.now_ms() >= a.rollback_until_ms {
            return Err(ReadError::Resync);
        }
        // History-only backfill does not advance the live group revision. Include
        // its fenced local ingest cut as well; never serve a cached pre-correction
        // or pre-backfill page under the same semantic snapshot key.
        let key = self
            .codec
            .opaque_identifier(
                &context(&read.scope().digest()?, a.generation),
                "cursor-key",
                "identity",
            )
            .map_err(|_| ReadError::Integrity)?;
        let replay = self
            .authorizer
            .current(read.scope(), Operation::Replay, self.clock.now_ms());
        Ok((
            CacheContext {
                generation: a.generation,
                projection_revision: hash(&(
                    a.revision,
                    cut,
                    a.writer_generation,
                    a.rebuilding,
                    a.rollback_until_ms,
                    key,
                    self.limits,
                    replay,
                ))?,
                cutoff_ms: a.committed_at_ms,
            },
            a.rebuilding.then_some(a.rollback_until_ms),
        ))
    }

    async fn validate_cached_cursors(
        &self,
        read: &AuthorizedRead,
        query: &ReadQuery,
        bytes: &[u8],
    ) -> Result<Option<i64>, ReadError> {
        let page: Value = serde_json::from_slice(bytes).map_err(|_| ReadError::Integrity)?;
        let now = self.clock.now_ms();
        let mut tx = read_tx(self.store).await?;
        let a = active(&mut tx, read.scope(), now).await?;
        let mut expires: Option<i64> = None;
        for (field, operation) in [
            ("next_cursor", query.operation),
            ("resume_cursor", Operation::Replay),
        ] {
            let value = page.get(field).ok_or(ReadError::Integrity)?;
            if value.is_null() {
                continue;
            }
            let token = value.as_str().ok_or(ReadError::Integrity)?;
            if !self.authorizer.current(read.scope(), operation, now) {
                return Err(ReadError::Resync);
            }
            let replay = ReadQuery {
                operation: Operation::Replay,
                limit: 200,
                max_bytes: 1024 * 1024,
                entity_id: None,
                from_ms: None,
                to_ms: None,
            };
            let digest = hash(&(
                read.scope(),
                if operation == Operation::Replay {
                    &replay
                } else {
                    query
                },
            ))?;
            // The persisted deadline starts at page BEGIN, not produced_at. A
            // slow query must not extend a cached continuation's real lifetime.
            let pin = load_pin(&mut tx, token, self.codec, &digest, a.generation, now).await?;
            expires = Some(expires.map_or(pin.expires_at_ms, |old| old.min(pin.expires_at_ms)));
        }
        tx.commit().await?;
        Ok(expires)
    }

    /// Shared first-page read-through over the real PG adapter. Continuations
    /// remain exact pinned reads, not independently cached fragments. Snapshot
    /// identity is probed asynchronously before AND after cache wait/hit/load;
    /// the synchronous cache callback only binds that captured context.
    /// # Errors
    /// Preserves all page/auth/budget errors; old in-flight generation/correction
    /// fills are rejected, and a cached expired server cursor is never returned.
    pub async fn cached_first_page(
        &self,
        cache: &ScopedCache,
        read: &AuthorizedRead,
        query: &ReadQuery,
    ) -> Result<Arc<Vec<u8>>, ReadError> {
        deadline(async {
            self.authorize(read, query)?;
            let _permit = self.store.admit(
                read_class(query.operation),
                query.limit,
                query.max_bytes.checked_mul(4).ok_or(ReadError::Bounds)?,
            )?;
            let (context, _) = self.cache_context(read).await?;
            let clock = || self.clock.now_ms();
            let same_context = |value: &CacheContext| value == &context;
            let bytes = cache
                .get_or_load(
                    CacheRequest {
                        read,
                        query,
                        context: &context,
                        authorizer: self.authorizer,
                        clock: &clock,
                        current_context: &same_context,
                    },
                    || async {
                        let page =
                            self.page_inner(read, query, None).await.map_err(
                                |error| match error {
                                    ReadError::Scope(error) => error,
                                    ReadError::Resync => ScopedError::ResyncRequired,
                                    ReadError::Bounds => ScopedError::Bounds,
                                    ReadError::Busy | ReadError::Resource(_) => ScopedError::Busy,
                                    _ => ScopedError::Unavailable,
                                },
                            )?;
                        serde_json::to_vec(&page).map_err(|_| ScopedError::Integrity)
                    },
                )
                .await?;
            if self.cache_context(read).await?.0 != context {
                return Err(ReadError::Resync);
            }
            let expires = match self.validate_cached_cursors(read, query, &bytes).await {
                Ok(expires) => expires,
                Err(error) => {
                    cache.invalidate()?;
                    return Err(error);
                }
            };
            let (final_context, stale_until) = self.cache_context(read).await?;
            if final_context != context {
                return Err(ReadError::Resync);
            }
            read.recheck(self.authorizer, self.clock.now_ms())?;
            let now = self.clock.now_ms();
            if expires.is_some_and(|expiry| now >= expiry)
                || stale_until.is_some_and(|expiry| now >= expiry)
            {
                cache.invalidate()?;
                return Err(ReadError::Resync);
            }
            Ok(bytes)
        })
        .await
    }

    async fn issue(&self, scope: &ReadScope, digest: &str, pin: &Pin) -> Result<String, ReadError> {
        let now = self.clock.now_ms();
        if pin.expires_at_ms <= now {
            return Err(ReadError::Resync);
        }
        let id = Uuid::now_v7();
        let mut tx = self.store.pool.begin().await?;
        sqlx::query("SET LOCAL statement_timeout='2s'")
            .execute(&mut *tx)
            .await?;
        sqlx::query("SET LOCAL lock_timeout='250ms'")
            .execute(&mut *tx)
            .await?;
        // A short admission lock protects the global cap across service replicas.
        // No projection/history query or network wait runs under this lock.
        sqlx::query("SELECT singleton FROM portal_projection.scoped_read_cursor_budget FOR UPDATE")
            .fetch_one(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM portal_projection.scoped_read_cursors WHERE expires_at_ms<=$1")
            .bind(now)
            .execute(&mut *tx)
            .await?;
        let scope_digest = scope.digest()?;
        let counts = sqlx::query(
            "SELECT count(*) AS total,count(*) FILTER (WHERE scope_digest=$1) AS scoped
            FROM portal_projection.scoped_read_cursors",
        )
        .bind(&scope_digest)
        .fetch_one(&mut *tx)
        .await?;
        if counts.try_get::<i64, _>("total")? >= self.limits.max_total_cursors
            || counts.try_get::<i64, _>("scoped")? >= self.limits.max_scope_cursors
        {
            return Err(ReadError::Busy);
        }
        sqlx::query("INSERT INTO portal_projection.scoped_read_cursors
            (cursor_id,context_digest,generation,state,expires_at_ms,scope_digest) VALUES($1,$2,$3,$4,$5,$6)")
            .bind(id).bind(digest).bind(pin.generation)
            .bind(serde_json::to_value(pin).map_err(|_|ReadError::Integrity)?)
            .bind(pin.expires_at_ms).bind(scope_digest).execute(&mut *tx).await?;
        tx.commit().await?;
        self.codec
            .encode(
                &context(digest, pin.generation),
                CursorDirection::After,
                CursorBoundary {
                    sort_values: vec![],
                    entity_id: id.to_string(),
                },
                at(now)?,
            )
            .map_err(|_| ReadError::Integrity)
    }

    /// One read transaction, field/row scope before keyset paging, no TS request.
    /// Export is a bounded JSON chunk, not an unbounded materialized file/CSV job;
    /// each continuation is a new current-policy-authorized Export operation.
    /// # Errors
    /// Denies missing scope, changed generation/current snapshot, expired/wrong
    /// cursor, unavailable history, oversized records and bounded DB failures.
    pub async fn page(
        &self,
        read: &AuthorizedRead,
        query: &ReadQuery,
        cursor: Option<&str>,
    ) -> Result<ReadPage, ReadError> {
        deadline(async {
            self.authorize(read, query)?;
            let _permit = self.store.admit(
                read_class(query.operation),
                query.limit,
                query.max_bytes.checked_mul(4).ok_or(ReadError::Bounds)?,
            )?;
            self.page_inner(read, query, cursor).await
        })
        .await
    }

    #[allow(clippy::too_many_lines)] // Keep the scoped snapshot/SQL/pin/return fence auditable together.
    async fn page_inner(
        &self,
        read: &AuthorizedRead,
        query: &ReadQuery,
        cursor: Option<&str>,
    ) -> Result<ReadPage, ReadError> {
        self.authorize(read, query)?;
        if query.operation == Operation::Replay || query.max_bytes <= META_RESERVE {
            return Err(ReadError::Bounds);
        }
        let scope = read.scope();
        let digest = hash(&(scope, query))?;
        let history = query.from_ms.is_some();
        let now = self.clock.now_ms();
        let mut tx = read_tx(self.store).await?;
        let a = active(&mut tx, scope, now).await?;
        let mut pin = if let Some(cursor) = cursor {
            load_pin(&mut tx, cursor, self.codec, &digest, a.generation, now).await?
        } else {
            let cut:Option<i64>=sqlx::query_scalar("SELECT max(read_ingest_order) FROM portal_projection.bootstrap_facts WHERE generation=$1")
                .bind(a.generation).fetch_one(&mut *tx).await?;
            Pin {
                identity_key: self
                    .codec
                    .opaque_identifier(&context(&digest, a.generation), "cursor-key", "identity")
                    .map_err(|_| ReadError::Integrity)?,
                generation: a.generation,
                projection_revision: a.revision,
                ingest_cut: cut.unwrap_or(0),
                after_time: -1,
                after_sequence: 0,
                after_entity: String::new(),
                replay_revision: a.revision,
                pinned_at_ms: now,
                expires_at_ms: now
                    .checked_add(self.limits.cursor_ttl_ms)
                    .ok_or(ReadError::Bounds)?,
            }
        };
        if !history && pin.projection_revision != a.revision {
            return Err(ReadError::Resync);
        }
        let ids: Option<Vec<String>> = scope
            .entity_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect());
        let fields: Vec<&str> = scope.allowed_fields.iter().map(String::as_str).collect();
        let page_limit = i64::try_from(query.limit + 1).map_err(|_| ReadError::Bounds)?;
        let rows = if history {
            sqlx::query("SELECT * FROM (SELECT entity_id,source_sequence,event_time,source_revision,operation,event_id,correction_id,payload,
                sum(octet_length(payload::text)+octet_length(entity_id)+octet_length(source_revision)+1024)
                    OVER(ORDER BY event_time,source_sequence) AS page_bytes
                FROM (SELECT entity_id,source_sequence,(event->'event'->>'event_time_ms')::bigint AS event_time,
                    event->'revision'->>'opaque' AS source_revision,event->'event'->>'operation' AS operation,event_id,
                    COALESCE(event->'event'->>'correction_of_event_id',event->'event'->>'tombstone_of_event_id') AS correction_id,
                    COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(event->'event'->'payload')
                        WHERE key=ANY($4::text[])),'{}'::jsonb) AS payload
                    FROM portal_projection.bootstrap_facts WHERE generation=$1 AND dataset=$2
                    AND ($3::text[] IS NULL OR entity_id=ANY($3))
                    AND ($5::text IS NULL OR entity_id=$5) AND read_ingest_order<=$6
                    AND (event->'event'->>'event_time_ms')::bigint >= $7
                    AND (event->'event'->>'event_time_ms')::bigint < $8
                    AND ((event->'event'->>'event_time_ms')::bigint,source_sequence)>($9,$10)
                    ORDER BY (event->'event'->>'event_time_ms')::bigint,source_sequence LIMIT $11) q
                ) b WHERE page_bytes <= $12 ORDER BY event_time,source_sequence")
                .bind(a.generation).bind(&scope.dataset).bind(&ids).bind(&fields).bind(&query.entity_id)
                .bind(pin.ingest_cut).bind(query.from_ms).bind(query.to_ms)
                .bind(pin.after_time).bind(pin.after_sequence).bind(page_limit)
                .bind(i64::try_from(query.max_bytes-META_RESERVE).map_err(|_|ReadError::Bounds)?)
                .fetch_all(&mut *tx).await?
        } else {
            sqlx::query("SELECT * FROM (SELECT entity_id,source_revision,payload,
                sum(octet_length(payload::text)+octet_length(entity_id)+octet_length(source_revision)+1024)
                    OVER(ORDER BY entity_id) AS page_bytes
                FROM (SELECT entity_id,source_revision,
                    COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each(payload)
                        WHERE key=ANY($4::text[])),'{}'::jsonb) AS payload
                    FROM portal_projection.bootstrap_rows WHERE generation=$1 AND dataset=$2 AND NOT tombstoned
                    AND ($3::text[] IS NULL OR entity_id=ANY($3)) AND ($5::text IS NULL OR entity_id=$5)
                    AND entity_id>$6 ORDER BY entity_id LIMIT $7) q
                ) b WHERE page_bytes <= $8 ORDER BY entity_id")
                .bind(a.generation).bind(&scope.dataset).bind(&ids).bind(&fields).bind(&query.entity_id)
                .bind(&pin.after_entity).bind(page_limit)
                .bind(i64::try_from(query.max_bytes-META_RESERVE).map_err(|_|ReadError::Bounds)?)
                .fetch_all(&mut *tx).await?
        };
        let mut data = Vec::new();
        let mut more = false;
        for row in rows {
            if data.len() == query.limit
                || row.try_get::<i64, _>("page_bytes")?
                    > i64::try_from(query.max_bytes - META_RESERVE)
                        .map_err(|_| ReadError::Bounds)?
            {
                more = true;
                break;
            }
            let entity: String = row.try_get("entity_id")?;
            let payload: Value = row.try_get("payload")?;
            if !read.allows_entity(&entity) || read.project_payload(&payload)? != payload {
                return Err(ReadError::Integrity);
            }
            pin.after_entity.clone_from(&entity);
            let (event_id, operation, occurred_at_ms, correction_of) = if history {
                pin.after_time = row.try_get("event_time")?;
                pin.after_sequence = row.try_get("source_sequence")?;
                at(pin.after_time)?;
                let event: String = row.try_get("event_id")?;
                let alias = |raw: &str| {
                    self.codec
                        .opaque_identifier(
                            &context(&scope.digest().map_err(ReadError::Scope)?, a.generation),
                            "financial-event",
                            raw,
                        )
                        .map_err(|_| ReadError::Integrity)
                };
                (
                    Some(alias(&event)?),
                    Some(row.try_get("operation")?),
                    Some(pin.after_time),
                    row.try_get::<Option<String>, _>("correction_id")?
                        .as_deref()
                        .map(alias)
                        .transpose()?,
                )
            } else {
                (None, None, None, None)
            };
            data.push(ReadRow {
                entity_id: entity,
                revision: row.try_get("source_revision")?,
                payload,
                event_id,
                operation,
                occurred_at_ms,
                correction_of,
            });
        }
        more |= if history {
            sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM portal_projection.bootstrap_facts
                WHERE generation=$1 AND dataset=$2 AND ($3::text[] IS NULL OR entity_id=ANY($3))
                AND ($4::text IS NULL OR entity_id=$4) AND read_ingest_order<=$5
                AND (event->'event'->>'event_time_ms')::bigint >= $6
                AND (event->'event'->>'event_time_ms')::bigint < $7
                AND ((event->'event'->>'event_time_ms')::bigint,source_sequence)>($8,$9))",
            )
            .bind(a.generation)
            .bind(&scope.dataset)
            .bind(&ids)
            .bind(&query.entity_id)
            .bind(pin.ingest_cut)
            .bind(query.from_ms)
            .bind(query.to_ms)
            .bind(pin.after_time)
            .bind(pin.after_sequence)
            .fetch_one(&mut *tx)
            .await?
        } else {
            sqlx::query_scalar::<_,bool>("SELECT EXISTS(SELECT 1 FROM portal_projection.bootstrap_rows
                WHERE generation=$1 AND dataset=$2 AND NOT tombstoned AND ($3::text[] IS NULL OR entity_id=ANY($3))
                AND ($4::text IS NULL OR entity_id=$4) AND entity_id>$5)")
                .bind(a.generation).bind(&scope.dataset).bind(&ids).bind(&query.entity_id)
                .bind(&pin.after_entity).fetch_one(&mut *tx).await?
        };
        if data.is_empty() && more {
            return Err(ReadError::Bounds);
        }
        tx.commit().await?;
        read.recheck(self.authorizer, self.clock.now_ms())?;
        let next_cursor = if more {
            Some(self.issue(scope, &digest, &pin).await?)
        } else {
            None
        };
        // A source-dark caller lacking Replay never receives a replay capability.
        let resume_cursor =
            if self
                .authorizer
                .current(scope, Operation::Replay, self.clock.now_ms())
                && scope.history_capability != HistoryCapability::Unavailable
            {
                let replay_query = ReadQuery {
                    operation: Operation::Replay,
                    limit: 200,
                    max_bytes: 1024 * 1024,
                    entity_id: None,
                    from_ms: None,
                    to_ms: None,
                };
                let mut replay_pin = pin.clone();
                replay_pin.replay_revision = pin.projection_revision;
                let replay_digest = hash(&(scope, &replay_query))?;
                replay_pin.identity_key = self
                    .codec
                    .opaque_identifier(
                        &context(&replay_digest, a.generation),
                        "cursor-key",
                        "identity",
                    )
                    .map_err(|_| ReadError::Integrity)?;
                Some(self.issue(scope, &replay_digest, &replay_pin).await?)
            } else {
                None
            };
        let mut page = ReadPage {
            schema_version: "portal.scoped-read.v1",
            projection_generation: a.generation.to_string(),
            source_continuity_epoch: a.source_epoch.clone(),
            projection_committed_at_ms: a.committed_at_ms,
            produced_at_ms: self.clock.now_ms(),
            availability: if scope.coverage == Coverage::CurrentPageOnly
                || (history && scope.history_capability != HistoryCapability::Authoritative)
            {
                "PARTIAL"
            } else {
                "AVAILABLE"
            },
            quality: quality(scope, a.rebuilding, history, self.clock.now_ms())?,
            history_capability: scope.history_capability,
            coverage: scope.coverage,
            count_status: "NOT_COMPUTED",
            rows: data,
            next_cursor,
            resume_cursor,
        };
        if serde_json::to_vec(&page)
            .map_err(|_| ReadError::Integrity)?
            .len()
            > query.max_bytes
        {
            return Err(ReadError::Bounds);
        }
        self.recheck_active(read, &a, !history).await?;
        read.recheck(self.authorizer, self.clock.now_ms())?;
        if !self
            .authorizer
            .current(scope, Operation::Replay, self.clock.now_ms())
        {
            page.resume_cursor = None;
        }
        let now = self.clock.now_ms();
        if (a.rebuilding && now >= a.rollback_until_ms)
            || ((page.next_cursor.is_some() || page.resume_cursor.is_some())
                && now >= pin.expires_at_ms)
        {
            return Err(ReadError::Resync);
        }
        Ok(page)
    }

    async fn recheck_active(
        &self,
        read: &AuthorizedRead,
        expected: &Active,
        check_revision: bool,
    ) -> Result<(), ReadError> {
        let mut tx = read_tx(self.store).await?;
        let a = active(&mut tx, read.scope(), self.clock.now_ms()).await?;
        if a.generation != expected.generation
            || a.writer_generation != expected.writer_generation
            || a.rebuilding != expected.rebuilding
            || a.rollback_until_ms != expected.rollback_until_ms
            || (check_revision && a.revision != expected.revision)
        {
            return Err(ReadError::Resync);
        }
        tx.commit().await?;
        if a.rebuilding && self.clock.now_ms() >= a.rollback_until_ms {
            return Err(ReadError::Resync);
        }
        Ok(())
    }

    /// Complete local group receipts are scanned once by the shared coordinator.
    /// A notice is emitted only if that group affects this authorized dataset/ID
    /// slice. Hidden-only progress remains an opaque cursor, never a gap/count.
    /// Notifications are NOT financial event replay; exact facts stay in history.
    /// # Errors
    /// Rejects missing receipts/references, expired cursor, generation changes and
    /// stale current policy. No numeric source gap inference is performed.
    pub async fn notices(
        &self,
        read: &AuthorizedRead,
        after: Option<&str>,
        limit: usize,
    ) -> Result<NoticeBatch, ReadError> {
        deadline(async {
            self.authorize(read, &replay_query())?;
            if limit == 0 || limit > 200 {
                return Err(ReadError::Bounds);
            }
            let _permit = self
                .store
                .admit(WorkClass::ControlRead, limit, 4 * 1024 * 1024)?;
            self.notices_inner(read, after, limit).await
        })
        .await
    }

    #[allow(clippy::too_many_lines)] // One bounded receipt scan and its cursor/authority commit boundary.
    async fn notices_inner(
        &self,
        read: &AuthorizedRead,
        after: Option<&str>,
        limit: usize,
    ) -> Result<NoticeBatch, ReadError> {
        let query = replay_query();
        self.authorize(read, &query)?;
        if !(1..=200).contains(&limit) {
            return Err(ReadError::Bounds);
        }
        let scope = read.scope();
        let digest = hash(&(scope, &query))?;
        let now = self.clock.now_ms();
        let mut tx = read_tx(self.store).await?;
        let a = active(&mut tx, scope, now).await?;
        let mut pin = if let Some(token) = after {
            load_pin(&mut tx, token, self.codec, &digest, a.generation, now).await?
        } else {
            Pin {
                identity_key: self
                    .codec
                    .opaque_identifier(&context(&digest, a.generation), "cursor-key", "identity")
                    .map_err(|_| ReadError::Integrity)?,
                generation: a.generation,
                projection_revision: a.revision,
                ingest_cut: 0,
                after_time: -1,
                after_sequence: 0,
                after_entity: String::new(),
                replay_revision: a.revision,
                pinned_at_ms: now,
                expires_at_ms: now
                    .checked_add(self.limits.cursor_ttl_ms)
                    .ok_or(ReadError::Bounds)?,
            }
        };
        if pin.replay_revision > a.revision {
            return Err(ReadError::Resync);
        }
        let ids: Option<Vec<String>> = scope
            .entity_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect());
        let groups=sqlx::query("SELECT i.receipt_revision,i.event_refs_complete,
            i.event_refs=(SELECT COALESCE(jsonb_agg(jsonb_build_array(l.ordinal,l.event_id,f.event_digest)
                ORDER BY l.ordinal),'[]'::jsonb) FROM portal_projection.bootstrap_group_facts l
                JOIN portal_projection.bootstrap_facts f ON f.generation=l.generation AND f.event_id=l.event_id
                WHERE l.generation=i.generation AND l.group_id=i.group_id) AS refs_valid,
            EXISTS(SELECT 1 FROM portal_projection.bootstrap_group_facts l
                JOIN portal_projection.bootstrap_facts f ON f.generation=l.generation AND f.event_id=l.event_id
                WHERE l.generation=i.generation AND l.group_id=i.group_id AND f.dataset=$2
                AND ($3::text[] IS NULL OR f.entity_id=ANY($3))) AS visible
            FROM portal_projection.bootstrap_inputs i WHERE i.generation=$1 AND i.kind='GROUP'
                AND i.receipt_revision>$4 ORDER BY i.receipt_revision LIMIT $5")
            .bind(a.generation).bind(&scope.dataset).bind(ids).bind(pin.replay_revision)
            .bind(i64::try_from(limit).map_err(|_|ReadError::Bounds)?).fetch_all(&mut *tx).await?;
        let mut changed = false;
        for group in &groups {
            let revision: i64 = group.try_get("receipt_revision")?;
            if revision
                != pin
                    .replay_revision
                    .checked_add(1)
                    .ok_or(ReadError::Bounds)?
                || !group.try_get::<bool, _>("event_refs_complete")?
                || !group.try_get::<bool, _>("refs_valid")?
            {
                return Err(ReadError::Resync);
            }
            pin.replay_revision = revision;
            changed |= group.try_get::<bool, _>("visible")?;
        }
        if groups.is_empty() && pin.replay_revision < a.revision {
            return Err(ReadError::Resync);
        }
        let caught_up = pin.replay_revision == a.revision;
        tx.commit().await?;
        read.recheck(self.authorizer, self.clock.now_ms())?;
        // An unchanged poll reuses its cursor; browser count cannot create new
        // persisted states. Visible changes within this bounded scan may coalesce
        // into a single replacement hint; exact immutable facts are untouched.
        let cursor = if !changed
            && groups.is_empty()
            && after.is_some()
            && self.clock.now_ms() < pin.expires_at_ms - self.limits.cursor_ttl_ms / 2
        {
            after.ok_or(ReadError::Integrity)?.to_owned()
        } else {
            // Live polling renews finite cursor lifetime; expired reconnect still
            // fails before this point and can never be silently resurrected.
            pin.pinned_at_ms = self.clock.now_ms();
            pin.expires_at_ms = pin
                .pinned_at_ms
                .checked_add(self.limits.cursor_ttl_ms)
                .ok_or(ReadError::Bounds)?;
            self.issue(scope, &digest, &pin).await?
        };
        self.recheck_active(read, &a, false).await?;
        read.recheck(self.authorizer, self.clock.now_ms())?;
        let now = self.clock.now_ms();
        if now >= pin.expires_at_ms || (a.rebuilding && now >= a.rollback_until_ms) {
            return Err(ReadError::Resync);
        }
        Ok(NoticeBatch {
            notices: if changed {
                vec![ChangeNotice {
                    resume_cursor: cursor.clone(),
                    projection_generation: a.generation.to_string(),
                    quality: quality(scope, a.rebuilding, false, now)?,
                }]
            } else {
                vec![]
            },
            next_cursor: Some(cursor),
            caught_up,
        })
    }
}

/// Concrete isolated bridge: one existing store/policy/codec, no extra pool or
/// per-browser TS client. A service owner must install certified implementations
/// before exposing it; this constructor is not a grant or runtime activation.
pub struct PgScopedReplaySource {
    pub store: Arc<PgProjectionStore>,
    pub authorizer: Arc<dyn ReadAuthorizer>,
    pub clock: Arc<dyn ReadClock>,
    pub codec: CursorCodec,
    pub limits: ReadLimits,
}

impl ScopedReplaySource for PgScopedReplaySource {
    fn replay<'a>(
        &'a self,
        scope: &'a ReadScope,
        after: Option<&'a str>,
        limit: usize,
        now_ms: i64,
    ) -> ReplayFuture<'a> {
        Box::pin(async move {
            if now_ms > self.clock.now_ms() {
                return Err(ReplayError::Unavailable);
            }
            let read = AuthorizedRead::authorize(
                scope.clone(),
                Operation::Replay,
                self.authorizer.as_ref(),
                self.clock.now_ms(),
            )
            .map_err(|_| ReplayError::Unavailable)?;
            ScopedReadService {
                store: self.store.as_ref(),
                authorizer: self.authorizer.as_ref(),
                clock: self.clock.as_ref(),
                codec: &self.codec,
                limits: self.limits,
            }
            .notices(&read, after, limit)
            .await
            .map_err(|error| match error {
                ReadError::Resync => ReplayError::ResyncRequired,
                _ => ReplayError::Unavailable,
            })
        })
    }
}

/// Exact authorized field identity helper for adapters; no browser-supplied SQL.
#[must_use]
pub fn fields(values: &[&str]) -> BTreeSet<String> {
    values.iter().map(|v| (*v).to_owned()).collect()
}
