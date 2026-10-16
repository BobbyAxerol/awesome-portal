//! `TEST_ONLY` synthetic scopes/facts in the exact disposable real-PG target.
//! No test authorizer or fixture is installed in a service/runtime route.

#[tokio::test]
async fn governed_pg_cache_has_one_permit_and_reserves_control_before_pool_wait() {
    use chrono::Utc;
    use projection_core::resources::{EnvelopeLimits, ResourceEnvelope, ResourceError, WorkClass};
    let mut f = Fixture::new(2).await;
    let resources = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 2,
            foreground_reserved: 1,
            max_entries: 4096,
            foreground_reserved_entries: 1024,
            max_bytes: 64 * 1024 * 1024,
            foreground_reserved_bytes: 8 * 1024 * 1024,
            storage_max_age: Duration::from_secs(60),
        })
        .unwrap(),
    );
    f.store = Arc::new(
        PgProjectionStore::connect_with_resources(
            &std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap(),
            resources.clone(),
            2,
        )
        .await
        .unwrap(),
    );
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let query = Fixture::query(Operation::Current, 1);
    let cache = ScopedCache::new_with_resources(
        CacheLimits {
            max_entries: 8,
            max_bytes: 4 * 1024 * 1024,
            max_flights: 2,
            ttl_ms: 1000,
            load_timeout_ms: 5000,
        },
        &resources,
    )
    .unwrap();
    let a = f
        .service()
        .cached_first_page(&cache, &read, &query)
        .await
        .unwrap();
    let b = f
        .service()
        .cached_first_page(&cache, &read, &query)
        .await
        .unwrap();
    assert!(Arc::ptr_eq(&a, &b));
    assert_eq!(resources.stats().unwrap().active, 0);
    let held = resources
        .try_acquire(WorkClass::BackgroundRead, 1, 1, Utc::now())
        .unwrap();
    assert!(matches!(
        f.service().page(&read, &query, None).await,
        Err(ReadError::Resource(ResourceError::Busy))
    ));
    assert!(matches!(
        f.service().notices(&read, None, 10).await,
        Err(ReadError::Scope(ScopedError::AccessDenied))
    ));
    let replay = f.read(&scope, Operation::Replay);
    f.service().notices(&replay, None, 10).await.unwrap();
    f.policy.enabled.store(false, Ordering::SeqCst);
    assert!(matches!(
        f.service().page(&read, &query, None).await,
        Err(ReadError::Scope(ScopedError::AccessDenied))
    ));
    drop(held);
    drop(cache);
    assert_eq!(resources.stats().unwrap().active, 0);
    assert_eq!(resources.stats().unwrap().bytes, 0);
}

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{
        atomic::{AtomicBool, AtomicI64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use authoritative_event_core::{
    bootstrap::{
        events_digest, page_seed, Binding, DeltaChunk, DeltaEvent, DeltaGroup, Limits, Manifest,
        PagePlan, Revision, SnapshotPage, SnapshotRow, SourceProofVerifier, Verified,
    },
    AuthoritativeEvent, EventOperation, EventStreamBinding, SourcePosition,
};
use execution_contracts::{
    catalogue_v1::{Completeness, Freshness},
    CanonicalId,
};
use projection_core::{canonical_digest, canonical_value_digest};
use projection_store_pg::{
    bootstrap::BootstrapHandle,
    scoped_read::{
        fields, PgScopedReplaySource, ReadClock, ReadError, ReadLimits, ScopedReadService,
    },
    PgProjectionStore,
};
use query_api::{
    scoped::{
        AuthorizedRead, CacheLimits, Coverage, HistoryCapability, Operation, ReadAuthorizer,
        ReadQuery, ReadScope, ScopedCache, ScopedError,
    },
    CursorCodec,
};
use realtime_sse::scoped::{
    PollOutcome, ScopedDelivery, ScopedRealtimeConfig, ScopedRealtimeHub, ScopedReplaySource,
    StreamStop,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

const NOW: i64 = 1_792_100_000_000;
fn id(value: impl Into<String>) -> CanonicalId {
    CanonicalId::parse(value).unwrap()
}
fn hash(value: &impl Serialize) -> String {
    canonical_digest(value).unwrap()
}

struct Proof {
    binding: String,
    kind: String,
    digest: String,
}
impl SourceProofVerifier for Proof {
    fn verify(&self, b: &Binding, kind: &str, digest: &str, proof: &str, now: i64) -> bool {
        b.digest().ok().as_ref() == Some(&self.binding)
            && kind == self.kind
            && digest == self.digest
            && proof == "TEST_ONLY"
            && now == NOW
    }
}
fn verified<T: Serialize + Clone>(value: &T, b: &Binding, kind: &str) -> Verified<T> {
    Verified::authenticate(
        value.clone(),
        b,
        kind,
        "TEST_ONLY",
        &Proof {
            binding: b.digest().unwrap(),
            kind: kind.to_owned(),
            digest: hash(value),
        },
        NOW,
    )
    .unwrap()
}

#[derive(Default)]
struct Policy {
    enabled: AtomicBool,
    deny_replay: AtomicBool,
    scopes: Mutex<BTreeSet<String>>,
    calls: AtomicUsize,
    deny_after: AtomicUsize,
}
impl Policy {
    fn add(&self, scope: &ReadScope) {
        self.scopes.lock().unwrap().insert(scope.digest().unwrap());
    }
}
impl ReadAuthorizer for Policy {
    fn current(&self, scope: &ReadScope, operation: Operation, _: i64) -> bool {
        let count = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
        self.enabled.load(Ordering::SeqCst)
            && !(operation == Operation::Replay && self.deny_replay.load(Ordering::SeqCst))
            && self
                .scopes
                .lock()
                .unwrap()
                .contains(&scope.digest().unwrap())
            && (self.deny_after.load(Ordering::SeqCst) == 0
                || count < self.deny_after.load(Ordering::SeqCst))
    }
}
struct Clock(AtomicI64);
impl ReadClock for Clock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

struct Fixture {
    store: Arc<PgProjectionStore>,
    pool: PgPool,
    h: BootstrapHandle,
    policy: Arc<Policy>,
    clock: Arc<Clock>,
    codec: CursorCodec,
    tail: String,
}
impl Fixture {
    #[allow(clippy::too_many_lines)] // One explicit test-only authenticated bootstrap fixture.
    async fn new(rows: usize) -> Self {
        assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
        let url = std::env::var("TEST_PROJECTION_DATABASE_URL")
            .expect("disposable PG required; never skip");
        assert!(
            url.starts_with("postgres://")
                && url.contains("@127.0.0.1:")
                && url.ends_with("/portal_projection_test_epg10_04")
        );
        let store = Arc::new(PgProjectionStore::connect(&url).await.unwrap());
        store.migrate().await.unwrap();
        store.migrate().await.unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .unwrap();
        let b = Binding {
            source: EventStreamBinding {
                stream_id: "TEST_ONLY.read".to_owned(),
                contract_revision: "TEST_ONLY.v1".to_owned(),
                workspace_id: id("TEST_ONLY.workspace"),
                environment: "paper".to_owned(),
                profile_id: "TEST_ONLY.PAPER".to_owned(),
                venue_id: "FIXTURE".to_owned(),
                resource_kind: "portfolio".to_owned(),
                resource_id: "TEST_ONLY.portfolio".to_owned(),
                filter_digest: hash(&"TEST_ONLY.filter"),
            },
            source_epoch: "TEST_ONLY.epoch".to_owned(),
            consumer_id: format!("TEST_ONLY.{}", Uuid::now_v7().simple()),
            principal_digest: hash(&"TEST_ONLY.ingest"),
            policy_revision: "TEST_ONLY.ingest-policy".to_owned(),
            query_digest: hash(&"TEST_ONLY.query"),
            consistency_group: "TEST_ONLY.group".to_owned(),
            datasets: BTreeMap::from([("orders".to_owned(), "TEST_ONLY.orders.v1".to_owned())]),
        };
        let generation = Uuid::now_v7();
        let mut m = Manifest {
            binding: b,
            generation,
            snapshot_id: "TEST_ONLY.snapshot".to_owned(),
            barrier: "TEST_ONLY.barrier".to_owned(),
            delta_start: "TEST_ONLY.start".to_owned(),
            catchup_cursor: "TEST_ONLY.start".to_owned(),
            expires_at_ms: NOW + 60_000,
            rollback_until_ms: NOW + 120_000,
            pages: BTreeMap::new(),
            references: vec![],
        };
        let rows:Vec<_>=(0..rows).map(|n|SnapshotRow {dataset:"orders".to_owned(),entity_id:format!("order_{n:04}"),
            revision:Revision{ordinal:1,opaque:"opaque_v1".to_owned()},payload:json!({"amount":"9007199254740993.000000000001","nullable":null,"hidden_balance":"987654321","private_account":"hidden"})}).collect();
        let mut chain = page_seed(&m, "orders").unwrap();
        let mut pages = vec![];
        for (n, chunk) in rows.chunks(200).enumerate() {
            let page = SnapshotPage {
                generation,
                dataset: "orders".to_owned(),
                index: u64::try_from(n).unwrap(),
                previous_digest: chain,
                rows: chunk.to_vec(),
            };
            chain = page.chain_digest().unwrap();
            pages.push(page);
        }
        m.pages.insert(
            "orders".to_owned(),
            PagePlan {
                count: u64::try_from(pages.len()).unwrap(),
                final_digest: chain,
            },
        );
        let limits = Limits {
            page_rows: 200,
            page_bytes: 1024 * 1024,
            group_events: 1000,
            group_bytes: 8 * 1024 * 1024,
            group_chunks: 64,
            snapshot_ttl_ms: 300_000,
            rollback_ttl_ms: 300_000,
        };
        let h = store
            .bootstrap_begin(&verified(&m, &m.binding, "MANIFEST"), limits, NOW)
            .await
            .unwrap();
        for page in pages {
            store
                .bootstrap_stage_page(&h, &verified(&page, &m.binding, "PAGE"), NOW)
                .await
                .unwrap();
        }
        store
            .bootstrap_finish_snapshot(&h, &verified(&m.binding, &m.binding, "CONTROL"), NOW)
            .await
            .unwrap()
            .unwrap();
        let policy = Arc::new(Policy::default());
        policy.enabled.store(true, Ordering::SeqCst);
        Self {
            store,
            pool,
            h,
            policy,
            clock: Arc::new(Clock(AtomicI64::new(NOW))),
            codec: CursorCodec::new(
                "TEST_ONLY",
                BTreeMap::from([("TEST_ONLY".to_owned(), vec![0x51; 32])]),
                Duration::from_secs(300),
            )
            .unwrap(),
            tail: "TEST_ONLY.start".to_owned(),
        }
    }
    fn scope(&self, ids: Option<&[&str]>) -> ReadScope {
        ReadScope {
            ingest_binding_digest: self.h.manifest().binding.digest().unwrap(),
            slot_key: self.h.manifest().binding.slot_key().unwrap(),
            principal_digest: hash(&"TEST_ONLY.alice"),
            effective_scope_digest: hash(&ids),
            app_policy_revision: "TEST_ONLY.app1".to_owned(),
            field_policy_revision: "TEST_ONLY.fields1".to_owned(),
            schema_version: "TEST_ONLY.orders.v1".to_owned(),
            model_revision: "TEST_ONLY.no-metrics".to_owned(),
            source_set_digest: hash(&"TEST_ONLY.source-set"),
            dataset: "orders".to_owned(),
            entity_ids: ids.map(|ids| ids.iter().map(|id| (*id).to_owned()).collect()),
            allowed_fields: fields(&["amount", "nullable"]),
            history_capability: HistoryCapability::RetainedObservations,
            coverage: Coverage::RetainedObservations,
            history_from_ms: Some(NOW - 10_000),
            history_to_ms: Some(NOW + 10_000),
        }
    }
    fn read(&self, scope: &ReadScope, op: Operation) -> AuthorizedRead {
        self.policy.add(scope);
        AuthorizedRead::authorize(scope.clone(), op, self.policy.as_ref(), self.clock.now_ms())
            .unwrap()
    }
    fn service(&self) -> ScopedReadService<'_> {
        ScopedReadService {
            store: self.store.as_ref(),
            authorizer: self.policy.as_ref(),
            clock: self.clock.as_ref(),
            codec: &self.codec,
            limits: ReadLimits {
                cursor_ttl_ms: 60_000,
                max_scope_cursors: 128,
                max_total_cursors: 4096,
            },
        }
    }
    fn query(op: Operation, limit: usize) -> ReadQuery {
        ReadQuery {
            operation: op,
            limit,
            max_bytes: 1024 * 1024,
            entity_id: None,
            from_ms: (op == Operation::History).then_some(NOW - 1000),
            to_ms: (op == Operation::History).then_some(NOW + 1000),
        }
    }
    fn event(&self, n: u64, entity: &str, revision: u64) -> DeltaEvent {
        let payload = json!({"amount":format!("{n}.000000000000000001"),"nullable":null,"hidden_balance":"secret-business-row"});
        DeltaEvent {
            event: AuthoritativeEvent {
                event_id: id(format!("source_global_{n}")),
                source_position: SourcePosition::new(
                    self.h.manifest().binding.source_epoch.clone(),
                    n.to_string(),
                )
                .unwrap(),
                entity_kind: "orders".to_owned(),
                entity_id: id(entity),
                entity_version: format!("opaque_v{revision}"),
                payload_schema_revision: "TEST_ONLY.orders.v1".to_owned(),
                operation: EventOperation::Upsert,
                event_time_ms: NOW,
                source_published_at_ms: NOW + 1,
                correction_of_event_id: None,
                tombstone_of_event_id: None,
                causation_id: None,
                correlation_id: None,
                payload_digest: canonical_value_digest(&payload),
                payload,
            },
            revision: Revision {
                ordinal: revision,
                opaque: format!("opaque_v{revision}"),
            },
        }
    }
    async fn append(&mut self, events: Vec<DeltaEvent>) {
        let name = format!("TEST_ONLY.group.{}", Uuid::now_v7().simple());
        let target = format!("TEST_ONLY.cursor.{}", Uuid::now_v7().simple());
        let chunk = DeltaChunk {
            generation: self.h.manifest().generation,
            group_id: name.clone(),
            index: 0,
            events: events.clone(),
        };
        let group = DeltaGroup {
            generation: self.h.manifest().generation,
            group_id: name,
            from_cursor: self.tail.clone(),
            to_cursor: target.clone(),
            chunk_digests: vec![chunk.digest().unwrap()],
            events_digest: events_digest(&events).unwrap(),
            reached_catchup: false,
        };
        self.store
            .bootstrap_stage_delta(
                &self.h,
                &verified(&chunk, &self.h.manifest().binding, "CHUNK"),
                NOW,
            )
            .await
            .unwrap();
        self.store
            .bootstrap_commit_group(
                &self.h,
                &verified(&group, &self.h.manifest().binding, "GROUP"),
                NOW,
            )
            .await
            .unwrap();
        self.tail = target;
    }
    async fn backfill(&self, event: DeltaEvent) {
        let chunk = DeltaChunk {
            generation: self.h.manifest().generation,
            group_id: "TEST_ONLY.backfill".to_owned(),
            index: 0,
            events: vec![event],
        };
        self.store
            .bootstrap_backfill_history(
                &self.h,
                &verified(&chunk, &self.h.manifest().binding, "HISTORY"),
                NOW,
            )
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn t05_01_scope_precedes_page_and_fields_never_include_hidden_peers() {
    let f = Fixture::new(5).await;
    let scope = f.scope(Some(&["order_0001", "order_0004"]));
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let first = f.service().page(&read, &q, None).await.unwrap();
    assert_eq!(first.rows[0].entity_id, "order_0001");
    assert!(first.next_cursor.is_some());
    assert_eq!(first.count_status, "NOT_COMPUTED");
    let second = f
        .service()
        .page(&read, &q, first.next_cursor.as_deref())
        .await
        .unwrap();
    assert_eq!(second.rows[0].entity_id, "order_0004");
    assert!(second.next_cursor.is_none());
    let wire = serde_json::to_string(&first).unwrap();
    for forbidden in [
        "hidden_balance",
        "private_account",
        "order_0000",
        "total_count",
        "hidden_count",
    ] {
        assert!(!wire.contains(forbidden));
    }
    assert_eq!(
        first.rows[0].payload["amount"],
        "9007199254740993.000000000001"
    );
    assert!(first.rows[0].payload["nullable"].is_null());
    let mut forged = scope;
    forged.entity_ids = None;
    assert!(AuthorizedRead::authorize(forged, Operation::Current, f.policy.as_ref(), NOW).is_err());
}

#[tokio::test]
async fn full_authorized_catalogue_has_bounded_pages_not_total_row_cap() {
    let f = Fixture::new(205).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 100);
    let mut cursor = None;
    let mut ids = BTreeSet::new();
    let mut pages = 0;
    loop {
        let page = f
            .service()
            .page(&read, &q, cursor.as_deref())
            .await
            .unwrap();
        assert!(page.rows.len() <= 100);
        assert!(serde_json::to_vec(&page).unwrap().len() <= q.max_bytes);
        for row in page.rows {
            assert!(ids.insert(row.entity_id));
        }
        pages += 1;
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!((ids.len(), pages), (205, 3));
}

#[tokio::test]
async fn cursor_rejects_other_scope_policy_source_set_filter_and_limit() {
    let f = Fixture::new(3).await;
    let scope = f.scope(None);
    let q = Fixture::query(Operation::Current, 1);
    let read = f.read(&scope, Operation::Current);
    let cursor = f
        .service()
        .page(&read, &q, None)
        .await
        .unwrap()
        .next_cursor
        .unwrap();
    for field in ["principal", "field", "app", "source", "model"] {
        let mut changed = scope.clone();
        match field {
            "principal" => changed.principal_digest = hash(&"TEST_ONLY.bob"),
            "field" => changed.field_policy_revision = "TEST_ONLY.fields2".to_owned(),
            "app" => changed.app_policy_revision = "TEST_ONLY.app2".to_owned(),
            "source" => changed.source_set_digest = hash(&"TEST_ONLY.source2"),
            _ => changed.model_revision = "TEST_ONLY.model2".to_owned(),
        }
        let changed = f.read(&changed, Operation::Current);
        assert!(matches!(
            f.service().page(&changed, &q, Some(&cursor)).await,
            Err(ReadError::Resync)
        ));
    }
    let q2 = Fixture::query(Operation::Current, 2);
    assert!(matches!(
        f.service().page(&read, &q2, Some(&cursor)).await,
        Err(ReadError::Resync)
    ));
    let mut q2 = q;
    q2.entity_id = Some("order_0001".to_owned());
    assert!(matches!(
        f.service().page(&read, &q2, Some(&cursor)).await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn t05_06_exact_history_ties_corrections_and_tombstones_keep_lineage() {
    let mut f = Fixture::new(1).await;
    let first = f.event(1, "order_0000", 2);
    f.append(vec![first.clone()]).await;
    let mut second = f.event(3, "order_0000", 3);
    second.event.operation = EventOperation::Correction;
    second.event.correction_of_event_id = Some(first.event.event_id.clone());
    f.append(vec![second.clone()]).await;
    let mut third = f.event(5, "order_0000", 4);
    third.event.operation = EventOperation::Tombstone;
    third.event.tombstone_of_event_id = Some(second.event.event_id.clone());
    f.append(vec![third]).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::History);
    let q = Fixture::query(Operation::History, 2);
    let first = f.service().page(&read, &q, None).await.unwrap();
    let next = f
        .service()
        .page(&read, &q, first.next_cursor.as_deref())
        .await
        .unwrap();
    assert_eq!((first.rows.len(), next.rows.len()), (2, 1));
    assert_eq!(first.rows[0].payload["amount"], "1.000000000000000001");
    assert_eq!(first.rows[1].correction_of, first.rows[0].event_id);
    assert_eq!(next.rows[0].correction_of, first.rows[1].event_id);
    assert_eq!(first.availability, "PARTIAL");
    assert_eq!(first.quality.completeness, Completeness::Partial);
    assert_eq!(first.quality.freshness, Freshness::Unknown);
    assert!(first.quality.source_as_of_ms.is_none());
    let wire = serde_json::to_string(&first).unwrap();
    assert!(!wire.contains("source_global_"));
    assert!(!wire.contains("source_sequence"));
    let current = f.read(&scope, Operation::Current);
    assert!(f
        .service()
        .page(&current, &Fixture::query(Operation::Current, 10), None)
        .await
        .unwrap()
        .rows
        .is_empty());
}

#[tokio::test]
async fn t05_05_missing_history_is_unavailable_not_an_empty_success() {
    let f = Fixture::new(1).await;
    let mut scope = f.scope(None);
    scope.history_capability = HistoryCapability::Unavailable;
    scope.history_from_ms = None;
    scope.history_to_ms = None;
    let read = f.read(&scope, Operation::History);
    assert!(matches!(
        f.service()
            .page(&read, &Fixture::query(Operation::History, 2), None)
            .await,
        Err(ReadError::Scope(ScopedError::TypedUnavailable))
    ));
    let current = f.read(&scope, Operation::Current);
    let page = f
        .service()
        .page(&current, &Fixture::query(Operation::Current, 2), None)
        .await
        .unwrap();
    assert!(page.resume_cursor.is_none());
}

#[tokio::test]
async fn history_continuation_uses_fixed_local_ingest_cut_across_late_backfill() {
    let mut f = Fixture::new(0).await;
    f.append(vec![f.event(10, "a", 1), f.event(30, "c", 1)])
        .await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::History);
    let q = Fixture::query(Operation::History, 1);
    let first = f.service().page(&read, &q, None).await.unwrap();
    f.backfill(f.event(20, "b", 1)).await;
    let next = f
        .service()
        .page(&read, &q, first.next_cursor.as_deref())
        .await
        .unwrap();
    assert_eq!(next.rows[0].entity_id, "c");
    assert!(next.next_cursor.is_none());
    assert_eq!(
        f.service()
            .page(&read, &Fixture::query(Operation::History, 10), None)
            .await
            .unwrap()
            .rows
            .len(),
        3
    );
}

#[tokio::test]
async fn current_projection_change_invalidates_pin_instead_of_mixing_versions() {
    let mut f = Fixture::new(3).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let first = f.service().page(&read, &q, None).await.unwrap();
    f.append(vec![f.event(1, "order_0001", 2)]).await;
    assert!(matches!(
        f.service()
            .page(&read, &q, first.next_cursor.as_deref())
            .await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn t05_04_expired_tampered_and_wrong_generation_cursors_fail_closed() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let cursor = f
        .service()
        .page(&read, &q, None)
        .await
        .unwrap()
        .next_cursor
        .unwrap();
    let mut tampered = cursor.clone();
    tampered.push('x');
    assert!(matches!(
        f.service().page(&read, &q, Some(&tampered)).await,
        Err(ReadError::Resync)
    ));
    f.clock.0.store(NOW + 60_001, Ordering::SeqCst);
    assert!(matches!(
        f.service().page(&read, &q, Some(&cursor)).await,
        Err(ReadError::Resync)
    ));
    f.clock.0.store(NOW, Ordering::SeqCst);
    sqlx::query(
        "UPDATE portal_projection.bootstrap_streams SET active_generation=NULL WHERE slot_key=$1",
    )
    .bind(&scope.slot_key)
    .execute(&f.pool)
    .await
    .unwrap();
    assert!(matches!(
        f.service().page(&read, &q, Some(&cursor)).await,
        Err(ReadError::Resync)
    ));
}

fn config() -> ScopedRealtimeConfig {
    ScopedRealtimeConfig {
        maximum_clients: 128,
        client_queue_entries: 2,
        client_queue_bytes: 16384,
        total_queue_bytes: 1024 * 1024,
        notices_per_poll: 20,
        maximum_notice_bytes: 8192,
        poll_interval_ms: 10,
        poll_timeout_ms: 5000,
    }
}
struct CountingSource {
    source: PgScopedReplaySource,
    calls: AtomicUsize,
}
impl ScopedReplaySource for CountingSource {
    fn replay<'a>(
        &'a self,
        scope: &'a ReadScope,
        after: Option<&'a str>,
        limit: usize,
        now: i64,
    ) -> realtime_sse::scoped::ReplayFuture<'a> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.source.replay(scope, after, limit, now)
    }
}
fn source(f: &Fixture) -> CountingSource {
    CountingSource {
        source: PgScopedReplaySource {
            store: Arc::clone(&f.store),
            authorizer: f.policy.clone(),
            clock: f.clock.clone(),
            codec: f.codec.clone(),
            limits: f.service().limits,
        },
        calls: AtomicUsize::new(0),
    }
}

#[tokio::test]
async fn t05_02_t05_07_lost_hint_many_tabs_use_one_durable_poller_then_restart() {
    let mut f = Fixture::new(1).await;
    let scope = f.scope(None);
    f.read(&scope, Operation::Replay);
    let hub = ScopedRealtimeHub::new(
        scope.clone(),
        f.h.manifest().generation.to_string(),
        None,
        config(),
        f.policy.as_ref(),
        NOW,
    )
    .unwrap();
    let source = source(&f);
    let mut clients: Vec<_> = (0..100)
        .map(|_| hub.subscribe(f.policy.as_ref(), NOW).unwrap())
        .collect();
    assert_eq!(source.calls.load(Ordering::SeqCst), 0);
    hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
    assert_eq!(source.calls.load(Ordering::SeqCst), 1);
    f.append(vec![f.event(1, "order_0000", 2)]).await;
    f.clock.0.store(NOW + 11, Ordering::SeqCst);
    assert_eq!(
        hub.poll(&source, f.policy.as_ref(), NOW + 11)
            .await
            .unwrap(),
        PollOutcome::CaughtUp
    );
    for client in &mut clients {
        assert!(matches!(
            client.next(f.policy.as_ref(), NOW + 11).unwrap(),
            ScopedDelivery::Notice(_)
        ));
    }
    assert_eq!(source.calls.load(Ordering::SeqCst), 2);
    let checkpoint = hub.cursor().unwrap();
    let restarted = ScopedRealtimeHub::new(
        scope,
        f.h.manifest().generation.to_string(),
        checkpoint,
        config(),
        f.policy.as_ref(),
        NOW + 11,
    )
    .unwrap();
    let mut c = restarted.subscribe(f.policy.as_ref(), NOW + 11).unwrap();
    f.append(vec![f.event(3, "order_0000", 3)]).await;
    restarted
        .poll(&source, f.policy.as_ref(), NOW + 11)
        .await
        .unwrap();
    assert!(matches!(
        c.next(f.policy.as_ref(), NOW + 11).unwrap(),
        ScopedDelivery::Notice(_)
    ));
}

#[tokio::test]
async fn t05_03_slow_client_is_bounded_and_does_not_block_healthy_peer() {
    let mut f = Fixture::new(1).await;
    let scope = f.scope(None);
    f.read(&scope, Operation::Replay);
    let hub = ScopedRealtimeHub::new(
        scope,
        f.h.manifest().generation.to_string(),
        None,
        config(),
        f.policy.as_ref(),
        NOW,
    )
    .unwrap();
    let source = source(&f);
    let mut slow = hub.subscribe(f.policy.as_ref(), NOW).unwrap();
    let mut fast = hub.subscribe(f.policy.as_ref(), NOW).unwrap();
    hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
    for n in 1..=4u64 {
        f.append(vec![f.event(n, "order_0000", n + 1)]).await;
        hub.hint().unwrap();
        hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
        assert!(matches!(
            fast.next(f.policy.as_ref(), NOW).unwrap(),
            ScopedDelivery::Notice(_)
        ));
    }
    assert_eq!(
        slow.next(f.policy.as_ref(), NOW).unwrap(),
        ScopedDelivery::Stopped(StreamStop::SlowConsumer)
    );
    assert!(hub.metrics().unwrap().charged_bytes <= config().total_queue_bytes);
}

#[tokio::test]
async fn sparse_hidden_group_progress_has_no_false_gap_or_hidden_count() {
    let mut f = Fixture::new(1).await;
    let scope = f.scope(Some(&["order_0000"]));
    let read = f.read(&scope, Operation::Replay);
    let initial = f
        .service()
        .notices(&read, None, 10)
        .await
        .unwrap()
        .next_cursor;
    f.append(vec![f.event(1, "order_0000", 2)]).await;
    f.append(vec![f.event(2, "hidden", 1)]).await;
    f.append(vec![f.event(3, "order_0000", 3)]).await;
    let batch = f
        .service()
        .notices(&read, initial.as_deref(), 10)
        .await
        .unwrap();
    assert_eq!(batch.notices.len(), 1);
    assert!(batch.caught_up);
    let wire = serde_json::to_string(&batch.notices).unwrap();
    for forbidden in ["hidden", "source_sequence", "missed_events", "total_count"] {
        assert!(!wire.contains(forbidden));
    }
    f.append(vec![f.event(4, "hidden", 2)]).await;
    let hidden = f
        .service()
        .notices(&read, batch.next_cursor.as_deref(), 10)
        .await
        .unwrap();
    assert!(hidden.notices.is_empty());
    assert!(hidden.caught_up);
}

#[tokio::test]
async fn missing_local_group_receipt_or_unmapped_legacy_group_requires_resync() {
    let mut f = Fixture::new(0).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Replay);
    let initial = f
        .service()
        .notices(&read, None, 10)
        .await
        .unwrap()
        .next_cursor;
    f.append(vec![f.event(1, "a", 1)]).await;
    f.append(vec![f.event(3, "b", 1)]).await;
    sqlx::query("UPDATE portal_projection.bootstrap_inputs SET event_refs_complete=FALSE WHERE generation=$1 AND kind='GROUP' AND receipt_revision=1")
        .bind(f.h.manifest().generation).execute(&f.pool).await.unwrap();
    assert!(matches!(
        f.service().notices(&read, initial.as_deref(), 10).await,
        Err(ReadError::Resync)
    ));
    sqlx::query("DELETE FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='GROUP' AND receipt_revision=1")
        .bind(f.h.manifest().generation).execute(&f.pool).await.unwrap();
    assert!(matches!(
        f.service().notices(&read, initial.as_deref(), 10).await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn export_is_chunked_exact_and_rechecks_authority_on_every_download() {
    let f = Fixture::new(3).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Export);
    let q = Fixture::query(Operation::Export, 1);
    let page = f.service().page(&read, &q, None).await.unwrap();
    assert_eq!(page.rows.len(), 1);
    assert!(page.next_cursor.is_some());
    f.policy.enabled.store(false, Ordering::SeqCst);
    assert!(matches!(
        f.service()
            .page(&read, &q, page.next_cursor.as_deref())
            .await,
        Err(ReadError::Scope(ScopedError::AccessDenied))
    ));
}

#[tokio::test]
async fn t05_08_revoke_during_read_and_queued_replay_never_returns_old_policy_data() {
    let mut f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let before = f.policy.calls.load(Ordering::SeqCst);
    f.policy.deny_after.store(before + 2, Ordering::SeqCst);
    assert!(matches!(
        f.service()
            .page(&read, &Fixture::query(Operation::Current, 1), None)
            .await,
        Err(ReadError::Scope(ScopedError::AccessDenied))
    ));
    f.policy.deny_after.store(0, Ordering::SeqCst);
    let replay = f.read(&scope, Operation::Replay);
    let cursor = f
        .service()
        .notices(&replay, None, 10)
        .await
        .unwrap()
        .next_cursor;
    let hub = ScopedRealtimeHub::new(
        scope,
        f.h.manifest().generation.to_string(),
        cursor,
        config(),
        f.policy.as_ref(),
        NOW,
    )
    .unwrap();
    let mut sub = hub.subscribe(f.policy.as_ref(), NOW).unwrap();
    let source = source(&f);
    f.append(vec![f.event(1, "order_0000", 2)]).await;
    hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
    f.policy.enabled.store(false, Ordering::SeqCst);
    assert_eq!(
        sub.next(f.policy.as_ref(), NOW).unwrap(),
        ScopedDelivery::Stopped(StreamStop::AccessDenied)
    );
}

#[tokio::test]
async fn row_and_cursor_storage_bounds_fail_explicitly_and_expiry_reclaims_capacity() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let mut q = Fixture::query(Operation::Current, 1);
    q.max_bytes = 8193;
    assert!(matches!(
        f.service().page(&read, &q, None).await,
        Err(ReadError::Bounds)
    ));
    let mut service = f.service();
    service.limits.max_scope_cursors = 1;
    service.limits.max_total_cursors = 4096;
    // Disable Replay metadata for this one operation so exactly one page cursor
    // consumes the scope budget; history-disabled scopes never get resume tokens.
    let mut scoped = scope;
    scoped.history_capability = HistoryCapability::Unavailable;
    scoped.history_from_ms = None;
    scoped.history_to_ms = None;
    let read = f.read(&scoped, Operation::Current);
    q.max_bytes = 1024 * 1024;
    service.page(&read, &q, None).await.unwrap();
    assert!(matches!(
        service.page(&read, &q, None).await,
        Err(ReadError::Busy)
    ));
    f.clock.0.store(NOW + 60_001, Ordering::SeqCst);
    service.page(&read, &q, None).await.unwrap();
}

#[tokio::test]
async fn history_backfill_has_no_phantom_live_notice_and_survives_new_store() {
    let f = Fixture::new(0).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Replay);
    let initial = f
        .service()
        .notices(&read, None, 10)
        .await
        .unwrap()
        .next_cursor;
    f.backfill(f.event(1, "a", 1)).await;
    let batch = f
        .service()
        .notices(&read, initial.as_deref(), 10)
        .await
        .unwrap();
    assert!(batch.notices.is_empty());
    let history = f.read(&scope, Operation::History);
    assert_eq!(
        f.service()
            .page(&history, &Fixture::query(Operation::History, 20), None)
            .await
            .unwrap()
            .rows
            .len(),
        1
    );
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap();
    let reopened = PgProjectionStore::connect(&url).await.unwrap();
    let reader = ScopedReadService {
        store: &reopened,
        authorizer: f.policy.as_ref(),
        clock: f.clock.as_ref(),
        codec: &f.codec,
        limits: f.service().limits,
    };
    assert!(reader
        .notices(&read, initial.as_deref(), 10)
        .await
        .unwrap()
        .notices
        .is_empty());
}

#[tokio::test]
async fn committed_membership_and_history_indexes_exist_after_idempotent_migration() {
    let mut f = Fixture::new(0).await;
    let one = f.event(1, "a", 1);
    f.append(vec![one.clone(), one]).await;
    let links: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_group_facts WHERE generation=$1",
    )
    .bind(f.h.manifest().generation)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let facts: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_facts WHERE generation=$1",
    )
    .bind(f.h.manifest().generation)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!((links, facts), (2, 1));
    let names:Vec<String>=sqlx::query_scalar("SELECT indexname FROM pg_indexes WHERE schemaname='portal_projection' AND indexname IN ('bootstrap_fact_history','bootstrap_fact_entity_history','bootstrap_group_replay','scoped_read_cursor_expiry')")
        .fetch_all(&f.pool).await.unwrap();
    assert_eq!(names.len(), 4);
    let plan:Value=sqlx::query_scalar("EXPLAIN (FORMAT JSON) SELECT entity_id FROM portal_projection.bootstrap_facts WHERE generation=$1 AND dataset='orders' ORDER BY (event->'event'->>'event_time_ms')::bigint,source_sequence LIMIT 10")
        .bind(f.h.manifest().generation).fetch_one(&f.pool).await.unwrap();
    assert!(plan[0]["Plan"].is_object());
    // This small synthetic plan is a real PG query-path check, NOT a production
    // cardinality/capacity acceptance or reason to force an index/disable scans.
}

#[tokio::test]
async fn missing_group_fact_link_cannot_silently_become_hidden_progress() {
    let mut f = Fixture::new(0).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Replay);
    let start = f
        .service()
        .notices(&read, None, 10)
        .await
        .unwrap()
        .next_cursor;
    f.append(vec![f.event(1, "visible", 1)]).await;
    sqlx::query("DELETE FROM portal_projection.bootstrap_group_facts WHERE generation=$1")
        .bind(f.h.manifest().generation)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(matches!(
        f.service().notices(&read, start.as_deref(), 10).await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn current_page_only_is_partial_not_full_realtime() {
    let f = Fixture::new(1).await;
    let mut scope = f.scope(None);
    scope.coverage = Coverage::CurrentPageOnly;
    scope.history_capability = HistoryCapability::Unavailable;
    scope.history_from_ms = None;
    scope.history_to_ms = None;
    let read = f.read(&scope, Operation::Current);
    let page = f
        .service()
        .page(&read, &Fixture::query(Operation::Current, 2), None)
        .await
        .unwrap();
    assert_eq!(page.availability, "PARTIAL");
    assert_eq!(page.quality.completeness, Completeness::Partial);
    assert_eq!(page.quality.freshness, Freshness::Unknown);
    assert!(page.resume_cursor.is_none());
}

#[tokio::test]
async fn cursor_scope_quota_cannot_be_evaded_by_changing_query_context() {
    let f = Fixture::new(3).await;
    let mut scope = f.scope(None);
    scope.history_capability = HistoryCapability::Unavailable;
    scope.history_from_ms = None;
    scope.history_to_ms = None;
    let read = f.read(&scope, Operation::Current);
    let mut service = f.service();
    service.limits.max_scope_cursors = 1;
    service
        .page(&read, &Fixture::query(Operation::Current, 1), None)
        .await
        .unwrap();
    assert!(matches!(
        service
            .page(&read, &Fixture::query(Operation::Current, 2), None)
            .await,
        Err(ReadError::Busy)
    ));
}

#[tokio::test]
async fn identity_key_rotation_requires_resync_instead_of_breaking_causal_aliases() {
    let mut f = Fixture::new(0).await;
    let one = f.event(1, "a", 1);
    let mut two = f.event(3, "a", 2);
    two.event.operation = EventOperation::Correction;
    two.event.correction_of_event_id = Some(one.event.event_id.clone());
    f.append(vec![one, two]).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::History);
    let query = Fixture::query(Operation::History, 1);
    let first = f.service().page(&read, &query, None).await.unwrap();
    let keys = BTreeMap::from([
        ("TEST_ONLY".to_owned(), vec![0x51; 32]),
        ("TEST_ONLY.new".to_owned(), vec![0x52; 32]),
    ]);
    let codec = CursorCodec::new("TEST_ONLY.new", keys, Duration::from_secs(300)).unwrap();
    let mut service = f.service();
    service.codec = &codec;
    assert!(matches!(
        service
            .page(&read, &query, first.next_cursor.as_deref())
            .await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn scoped_pg_cache_single_flight_invalidation_and_history_backfill_are_integrated() {
    let mut f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let query = Fixture::query(Operation::Current, 1);
    let cache = ScopedCache::new(CacheLimits {
        max_entries: 8,
        max_bytes: 4 * 1024 * 1024,
        max_flights: 2,
        ttl_ms: 1000,
        load_timeout_ms: 5000,
    })
    .unwrap();
    let service = f.service();
    let (a, b, c) = tokio::join!(
        service.cached_first_page(&cache, &read, &query),
        service.cached_first_page(&cache, &read, &query),
        service.cached_first_page(&cache, &read, &query)
    );
    let a = a.unwrap();
    let b = b.unwrap();
    let c = c.unwrap();
    assert!(Arc::ptr_eq(&a, &b) && Arc::ptr_eq(&b, &c));
    assert_eq!(cache.usage().unwrap().0, 1);
    f.append(vec![f.event(10, "order_0000", 2)]).await;
    let changed = f
        .service()
        .cached_first_page(&cache, &read, &query)
        .await
        .unwrap();
    assert_ne!(a, changed);
    let history = f.read(&scope, Operation::History);
    let hq = Fixture::query(Operation::History, 10);
    let first = f
        .service()
        .cached_first_page(&cache, &history, &hq)
        .await
        .unwrap();
    f.backfill(f.event(5, "b", 1)).await;
    let new = f
        .service()
        .cached_first_page(&cache, &history, &hq)
        .await
        .unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&first).unwrap()["rows"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&new).unwrap()["rows"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    f.policy.enabled.store(false, Ordering::SeqCst);
    assert!(matches!(
        f.service().cached_first_page(&cache, &read, &query).await,
        Err(ReadError::Scope(ScopedError::AccessDenied))
    ));
}

fn cache() -> ScopedCache {
    ScopedCache::new(CacheLimits {
        max_entries: 8,
        max_bytes: 4 * 1024 * 1024,
        max_flights: 2,
        ttl_ms: 1000,
        load_timeout_ms: 5000,
    })
    .unwrap()
}

#[tokio::test]
async fn cached_page_relabels_stale_when_replacement_bootstrap_starts() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let cache = cache();
    let old = f
        .service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    let mut replacement = f.h.manifest().clone();
    replacement.generation = Uuid::now_v7();
    f.store
        .bootstrap_begin(
            &verified(&replacement, &replacement.binding, "MANIFEST"),
            Limits {
                page_rows: 200,
                page_bytes: 1024 * 1024,
                group_events: 1000,
                group_bytes: 8 * 1024 * 1024,
                group_chunks: 64,
                snapshot_ttl_ms: 300_000,
                rollback_ttl_ms: 300_000,
            },
            NOW,
        )
        .await
        .unwrap();
    let new = f
        .service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    assert_ne!(old, new);
    assert_eq!(
        serde_json::from_slice::<Value>(&new).unwrap()["quality"]["freshness"],
        "STALE"
    );
    f.clock.0.store(NOW + 300_001, Ordering::SeqCst);
    assert!(matches!(
        f.service().cached_first_page(&cache, &read, &q).await,
        Err(ReadError::Resync)
    ));
}

#[tokio::test]
async fn cached_cursor_checks_actual_retention_deadline_not_page_production_time() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let cache = cache();
    f.service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    // TEST_ONLY early cursor-state retention simulates a page BEGIN deadline
    // earlier than produced_at + configured TTL; no operational row is touched.
    sqlx::query(
        "UPDATE portal_projection.scoped_read_cursors SET expires_at_ms=$2,
        state=jsonb_set(state,'{expires_at_ms}',to_jsonb($2::bigint)) WHERE generation=$1",
    )
    .bind(f.h.manifest().generation)
    .bind(NOW + 10)
    .execute(&f.pool)
    .await
    .unwrap();
    f.clock.0.store(NOW + 11, Ordering::SeqCst);
    assert!(matches!(
        f.service().cached_first_page(&cache, &read, &q).await,
        Err(ReadError::Resync)
    ));
    assert_eq!(cache.usage().unwrap().0, 0);
    f.service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
}

#[tokio::test]
async fn cached_page_identity_includes_active_key_and_read_limits() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let cache = cache();
    let old = f
        .service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.new",
        BTreeMap::from([
            ("TEST_ONLY".to_owned(), vec![0x51; 32]),
            ("TEST_ONLY.new".to_owned(), vec![0x52; 32]),
        ]),
        Duration::from_secs(300),
    )
    .unwrap();
    let mut service = f.service();
    service.codec = &codec;
    let new = service.cached_first_page(&cache, &read, &q).await.unwrap();
    assert_ne!(old, new);
    service.limits.cursor_ttl_ms = 30_000;
    assert_ne!(
        new,
        service.cached_first_page(&cache, &read, &q).await.unwrap()
    );
    assert_eq!(cache.usage().unwrap().0, 3);
}

#[tokio::test]
async fn cached_current_page_does_not_keep_revoked_replay_capability() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let cache = cache();
    let old = f
        .service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    assert!(serde_json::from_slice::<Value>(&old).unwrap()["resume_cursor"].is_string());
    f.policy.deny_replay.store(true, Ordering::SeqCst);
    let new = f
        .service()
        .cached_first_page(&cache, &read, &q)
        .await
        .unwrap();
    assert!(serde_json::from_slice::<Value>(&new).unwrap()["resume_cursor"].is_null());
    assert_eq!(
        serde_json::from_slice::<Value>(&new).unwrap()["rows"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

struct StepClock {
    calls: AtomicUsize,
    step_after: AtomicUsize,
    late_ms: i64,
}
impl ReadClock for StepClock {
    fn now_ms(&self) -> i64 {
        if self.calls.fetch_add(1, Ordering::SeqCst) >= self.step_after.load(Ordering::SeqCst) {
            self.late_ms
        } else {
            NOW
        }
    }
}

#[tokio::test]
async fn cursor_expiry_during_final_metadata_await_is_checked_before_return() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let q = Fixture::query(Operation::Current, 1);
    let clock = StepClock {
        calls: AtomicUsize::new(0),
        step_after: AtomicUsize::new(usize::MAX),
        late_ms: NOW + 60_001,
    };
    let mut service = f.service();
    service.clock = &clock;
    service.page(&read, &q, None).await.unwrap();
    let calls = clock.calls.swap(0, Ordering::SeqCst);
    clock.step_after.store(calls - 1, Ordering::SeqCst);
    assert!(matches!(
        service.page(&read, &q, None).await,
        Err(ReadError::Resync)
    ));
    clock.calls.store(0, Ordering::SeqCst);
    clock.step_after.store(usize::MAX, Ordering::SeqCst);
    let cache = cache();
    service.cached_first_page(&cache, &read, &q).await.unwrap();
    clock.calls.store(0, Ordering::SeqCst);
    service.cached_first_page(&cache, &read, &q).await.unwrap();
    let calls = clock.calls.swap(0, Ordering::SeqCst);
    clock.step_after.store(calls - 1, Ordering::SeqCst);
    assert!(matches!(
        service.cached_first_page(&cache, &read, &q).await,
        Err(ReadError::Resync)
    ));
    assert_eq!(cache.usage().unwrap().0, 0);
}

#[tokio::test]
async fn stale_generation_deadline_crossed_during_final_await_requires_resync() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let replay = f.read(&scope, Operation::Replay);
    let q = Fixture::query(Operation::Current, 1);
    let mut replacement = f.h.manifest().clone();
    replacement.generation = Uuid::now_v7();
    replacement.rollback_until_ms = NOW + 10;
    f.store
        .bootstrap_begin(
            &verified(&replacement, &replacement.binding, "MANIFEST"),
            Limits {
                page_rows: 200,
                page_bytes: 1024 * 1024,
                group_events: 1000,
                group_bytes: 8 * 1024 * 1024,
                group_chunks: 64,
                snapshot_ttl_ms: 300_000,
                rollback_ttl_ms: 10,
            },
            NOW,
        )
        .await
        .unwrap();
    let clock = StepClock {
        calls: AtomicUsize::new(0),
        step_after: AtomicUsize::new(usize::MAX),
        late_ms: NOW + 11,
    };
    let mut service = f.service();
    service.clock = &clock;
    // Cursor lifetime is 60s: only the 10ms stale-generation window expires.
    service.page(&read, &q, None).await.unwrap();
    let calls = clock.calls.swap(0, Ordering::SeqCst);
    clock.step_after.store(calls - 1, Ordering::SeqCst);
    assert!(matches!(
        service.page(&read, &q, None).await,
        Err(ReadError::Resync)
    ));
    clock.calls.store(0, Ordering::SeqCst);
    clock.step_after.store(usize::MAX, Ordering::SeqCst);
    service.notices(&replay, None, 1).await.unwrap();
    let calls = clock.calls.swap(0, Ordering::SeqCst);
    clock.step_after.store(calls - 1, Ordering::SeqCst);
    assert!(matches!(
        service.notices(&replay, None, 1).await,
        Err(ReadError::Resync)
    ));
    clock.calls.store(0, Ordering::SeqCst);
    clock.step_after.store(usize::MAX, Ordering::SeqCst);
    let cache = cache();
    service.cached_first_page(&cache, &read, &q).await.unwrap();
    clock.calls.store(0, Ordering::SeqCst);
    service.cached_first_page(&cache, &read, &q).await.unwrap();
    let calls = clock.calls.swap(0, Ordering::SeqCst);
    clock.step_after.store(calls - 1, Ordering::SeqCst);
    assert!(matches!(
        service.cached_first_page(&cache, &read, &q).await,
        Err(ReadError::Resync)
    ));
    assert_eq!(cache.usage().unwrap().0, 0);
}
