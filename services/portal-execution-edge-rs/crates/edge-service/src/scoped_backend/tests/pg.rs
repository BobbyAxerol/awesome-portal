//! `TEST_ONLY` actual disposable PG and mounted Axum handlers. No current Core
//! authority, native source, production DB or connected acceptance is claimed.

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicI64, AtomicUsize, Ordering};

use authoritative_event_core::{
    bootstrap::{
        events_digest, page_seed, Binding, DeltaChunk, DeltaEvent, DeltaGroup, Limits, Manifest,
        PagePlan, Revision, SnapshotPage, SnapshotRow, SourceProofVerifier, Verified,
    },
    AuthoritativeEvent, EventOperation, EventStreamBinding, SourcePosition,
};
use execution_contracts::CanonicalId;
use futures_util::StreamExt as _;
use projection_core::{
    canonical_digest, canonical_value_digest,
    resources::{EnvelopeLimits, StorageLimits, StorageObservation},
};
use projection_store_pg::bootstrap::BootstrapHandle;
use query_api::scoped::{Coverage, HistoryCapability, ReadScope};
use serde::Serialize;
use uuid::Uuid;

use crate::scoped_policy::{PolicyFuture, UnavailableCurrentPolicy};

use super::*;

const NOW: i64 = 1_792_735_200_000;
const TOKEN: &str = "TEST_ONLY-current-authentication";
const SECOND_TOKEN: &str = "TEST_ONLY-second-session";

struct Clock(AtomicI64);
impl ReadClock for Clock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

struct Proof {
    binding: String,
    kind: String,
    input: String,
}
impl SourceProofVerifier for Proof {
    fn verify(&self, binding: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        binding.digest().ok().as_ref() == Some(&self.binding)
            && kind == self.kind
            && input == self.input
            && proof == "TEST_ONLY-exact-proof"
            && now == NOW
    }
}
fn seal<T: Serialize + Clone>(value: &T, binding: &Binding, kind: &str) -> Verified<T> {
    Verified::authenticate(
        value.clone(),
        binding,
        kind,
        "TEST_ONLY-exact-proof",
        &Proof {
            binding: binding.digest().unwrap(),
            kind: kind.into(),
            input: canonical_digest(value).unwrap(),
        },
        NOW,
    )
    .unwrap()
}
fn id(value: &str) -> CanonicalId {
    CanonicalId::parse(value).unwrap()
}
fn hash(value: &str) -> String {
    canonical_digest(&value).unwrap()
}

/// Only disposable fixture authority. The yield makes revocation tests exercise
/// the async policy boundary rather than a synchronous snapshot alone.
struct Policy {
    scope: Mutex<ReadScope>,
    operations: Mutex<Vec<Operation>>,
    enabled: AtomicBool,
    checks: AtomicUsize,
    deny_on_check: AtomicUsize,
    revoked_credential: Mutex<Option<String>>,
    stalled_credential: Mutex<Option<String>>,
    stalled_checks: AtomicUsize,
    stall_on_check: AtomicUsize,
}
impl Policy {
    fn allowed(&self, operation: Operation) -> bool {
        self.enabled.load(Ordering::SeqCst) && self.operations.lock().unwrap().contains(&operation)
    }
}
impl CurrentPolicy for Policy {
    fn resolve<'a>(
        &'a self,
        credential: &'a str,
        resource: &'a str,
        operation: Operation,
        _now: i64,
    ) -> PolicyFuture<'a, ResolvedPolicy> {
        Box::pin(async move {
            tokio::task::yield_now().await;
            if ![TOKEN, SECOND_TOKEN].contains(&credential)
                || resource != "orders"
                || !self.allowed(operation)
            {
                return Err(ScopedError::AccessDenied);
            }
            ResolvedPolicy::from_current_authority(
                self.scope.lock().unwrap().clone(),
                operation,
                Arc::new(credential.to_owned()),
            )
        })
    }
    fn recheck<'a>(&'a self, resolved: &'a ResolvedPolicy, _now: i64) -> PolicyFuture<'a, ()> {
        Box::pin(async move {
            let checked = self.checks.fetch_add(1, Ordering::SeqCst) + 1;
            let deny = self.deny_on_check.load(Ordering::SeqCst);
            let original = resolved
                .custody::<String>()
                .ok_or(ScopedError::AccessDenied)?;
            let stalled = self.stalled_credential.lock().unwrap().as_ref() == Some(original);
            if stalled || self.stall_on_check.load(Ordering::SeqCst) == checked {
                self.stalled_checks.fetch_add(1, Ordering::SeqCst);
                return std::future::pending().await;
            }
            tokio::task::yield_now().await;
            if !self.allowed(resolved.operation())
                || (deny > 0 && checked >= deny)
                || self.revoked_credential.lock().unwrap().as_ref() == Some(original)
                || resolved.scope() != &*self.scope.lock().unwrap()
            {
                return Err(ScopedError::AccessDenied);
            }
            Ok(())
        })
    }
}

struct Fixture {
    backend: ScopedBackend,
    policy: Arc<Policy>,
    handle: BootstrapHandle,
    clock: Arc<Clock>,
}

fn resources() -> Arc<ResourceEnvelope> {
    let envelope = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 8,
            foreground_reserved: 1,
            max_entries: 8192,
            foreground_reserved_entries: 1024,
            max_bytes: 128 * 1024 * 1024,
            foreground_reserved_bytes: 16 * 1024 * 1024,
            storage_max_age: Duration::from_secs(600),
        })
        .unwrap(),
    );
    envelope
        .observe_storage(
            StorageObservation {
                observed_at: chrono::Utc::now(),
                used_bytes: 0,
                free_bytes: 1_000_000,
                backlog_bytes: 0,
            },
            StorageLimits {
                soft_used_bytes: 100,
                high_used_bytes: 200,
                hard_used_bytes: 300,
                min_free_bytes: 100,
                max_backlog_bytes: 1000,
            },
        )
        .unwrap();
    envelope
}
fn source_limits() -> Limits {
    Limits {
        page_rows: 200,
        page_bytes: 1024 * 1024,
        group_events: 8,
        group_bytes: 1024 * 1024,
        group_chunks: 4,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}
fn binding() -> Binding {
    Binding {
        source: EventStreamBinding {
            stream_id: "TEST_ONLY.backend".into(),
            contract_revision: "TEST_ONLY.v1".into(),
            workspace_id: id("TEST_ONLY.workspace"),
            environment: "paper".into(),
            profile_id: "TEST_ONLY.PAPER".into(),
            venue_id: "TEST_ONLY".into(),
            resource_kind: "portfolio".into(),
            resource_id: "TEST_ONLY.portfolio".into(),
            filter_digest: hash("TEST_ONLY-filter"),
        },
        source_epoch: "TEST_ONLY.epoch".into(),
        consumer_id: format!("TEST_ONLY.{}", Uuid::now_v7()),
        principal_digest: hash("TEST_ONLY-ingest"),
        policy_revision: "TEST_ONLY-ingest-policy".into(),
        query_digest: hash("TEST_ONLY-query"),
        consistency_group: "TEST_ONLY-group".into(),
        datasets: BTreeMap::from([("orders".into(), "TEST_ONLY.orders.v1".into())]),
    }
}
fn snapshot() -> (Manifest, SnapshotPage) {
    let mut manifest = Manifest {
        binding: binding(),
        generation: Uuid::now_v7(),
        snapshot_id: "TEST_ONLY.snapshot".into(),
        barrier: "TEST_ONLY.barrier".into(),
        delta_start: "TEST_ONLY.start".into(),
        catchup_cursor: "TEST_ONLY.start".into(),
        expires_at_ms: NOW + 60_000,
        rollback_until_ms: NOW + 120_000,
        pages: BTreeMap::new(),
        references: vec![],
    };
    let page = SnapshotPage {
        generation: manifest.generation,
        dataset: "orders".into(),
        index: 0,
        previous_digest: page_seed(&manifest, "orders").unwrap(),
        rows: ["order_a", "hidden_peer", "order_c"]
            .into_iter()
            .map(|entity| SnapshotRow {
                dataset: "orders".into(),
                entity_id: entity.into(),
                revision: Revision {
                    ordinal: 1,
                    opaque: "TEST_ONLY-v1".into(),
                },
                payload: json!({"amount":"9007199254740993.000000000001","nullable":null,
                "hidden_balance":"TEST_ONLY-private"}),
            })
            .collect(),
    };
    manifest.pages.insert(
        "orders".into(),
        PagePlan {
            count: 1,
            final_digest: page.chain_digest().unwrap(),
        },
    );
    (manifest, page)
}
fn read_scope(binding: &Binding) -> ReadScope {
    ReadScope {
        ingest_binding_digest: binding.digest().unwrap(),
        slot_key: binding.slot_key().unwrap(),
        principal_digest: hash("TEST_ONLY-alice"),
        effective_scope_digest: hash("TEST_ONLY-own-orders"),
        app_policy_revision: "TEST_ONLY-app1".into(),
        field_policy_revision: "TEST_ONLY-fields1".into(),
        schema_version: "TEST_ONLY.orders.v1".into(),
        model_revision: "TEST_ONLY-no-metrics".into(),
        source_set_digest: hash("TEST_ONLY-source-set"),
        dataset: "orders".into(),
        entity_ids: Some(BTreeSet::from(["order_a".into(), "order_c".into()])),
        allowed_fields: BTreeSet::from(["amount".into(), "nullable".into()]),
        history_capability: HistoryCapability::RetainedObservations,
        coverage: Coverage::AuthorizedOnly,
        history_from_ms: Some(NOW - 10_000),
        history_to_ms: Some(NOW + 10_000),
    }
}
impl Fixture {
    async fn new() -> Self {
        assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
        let url = std::env::var("TEST_PROJECTION_DATABASE_URL")
            .expect("disposable PG required, never skip");
        assert!(
            url.starts_with("postgres://")
                && url.contains("@127.0.0.1:")
                && url.ends_with("/portal_projection_test_epg10_04")
        );
        let resources = resources();
        let store = Arc::new(
            PgProjectionStore::connect_with_resources(&url, Arc::clone(&resources), 8)
                .await
                .unwrap(),
        );
        store.migrate().await.unwrap();
        let (manifest, page) = snapshot();
        let handle = store
            .bootstrap_begin(
                &seal(&manifest, &manifest.binding, "MANIFEST"),
                source_limits(),
                NOW,
            )
            .await
            .unwrap();
        store
            .bootstrap_stage_page(&handle, &seal(&page, &manifest.binding, "PAGE"), NOW)
            .await
            .unwrap();
        store
            .bootstrap_finish_snapshot(
                &handle,
                &seal(&manifest.binding, &manifest.binding, "CONTROL"),
                NOW,
            )
            .await
            .unwrap()
            .unwrap();
        let policy = Arc::new(Policy {
            scope: Mutex::new(read_scope(&manifest.binding)),
            operations: Mutex::new(vec![
                Operation::Current,
                Operation::History,
                Operation::Export,
                Operation::Replay,
            ]),
            enabled: AtomicBool::new(true),
            checks: AtomicUsize::new(0),
            deny_on_check: AtomicUsize::new(0),
            revoked_credential: Mutex::new(None),
            stalled_credential: Mutex::new(None),
            stalled_checks: AtomicUsize::new(0),
            stall_on_check: AtomicUsize::new(0),
        });
        let codec = CursorCodec::new(
            "TEST_ONLY",
            BTreeMap::from([("TEST_ONLY".into(), vec![0x51; 32])]),
            Duration::from_secs(300),
        )
        .unwrap();
        let clock = Arc::new(Clock(AtomicI64::new(NOW)));
        let backend = ScopedBackend::assemble(
            store,
            resources,
            policy.clone(),
            codec,
            limits(),
            clock.clone(),
        )
        .unwrap();
        Self {
            backend,
            policy,
            handle,
            clock,
        }
    }
    async fn request(&self, suffix: &str, parameters: &str) -> Response {
        self.backend
            .router()
            .oneshot(
                Request::builder()
                    .uri(format!("{ROUTE_PREFIX}/orders/{suffix}{parameters}"))
                    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    }
    async fn append(&self) {
        let binding = &self.handle.manifest().binding;
        let payload = json!({"amount":"100.000000000001","nullable":null,"hidden_balance":"TEST_ONLY-private"});
        let event = DeltaEvent {
            event: AuthoritativeEvent {
                event_id: id("TEST_ONLY-event1"),
                source_position: SourcePosition::new(binding.source_epoch.clone(), "1").unwrap(),
                entity_kind: "orders".into(),
                entity_id: id("order_a"),
                entity_version: "TEST_ONLY-v2".into(),
                payload_schema_revision: "TEST_ONLY.orders.v1".into(),
                operation: EventOperation::Upsert,
                event_time_ms: NOW,
                source_published_at_ms: NOW,
                correction_of_event_id: None,
                tombstone_of_event_id: None,
                causation_id: None,
                correlation_id: None,
                payload_digest: canonical_value_digest(&payload),
                payload,
            },
            revision: Revision {
                ordinal: 2,
                opaque: "TEST_ONLY-v2".into(),
            },
        };
        let chunk = DeltaChunk {
            generation: self.handle.manifest().generation,
            group_id: "TEST_ONLY-group1".into(),
            index: 0,
            events: vec![event],
        };
        let group = DeltaGroup {
            generation: chunk.generation,
            group_id: chunk.group_id.clone(),
            from_cursor: "TEST_ONLY.start".into(),
            to_cursor: "TEST_ONLY.next".into(),
            chunk_digests: vec![chunk.digest().unwrap()],
            events_digest: events_digest(&chunk.events).unwrap(),
            reached_catchup: false,
        };
        self.backend
            .0
            .store
            .bootstrap_stage_delta(&self.handle, &seal(&chunk, binding, "CHUNK"), NOW)
            .await
            .unwrap();
        self.backend
            .0
            .store
            .bootstrap_commit_group(&self.handle, &seal(&group, binding, "GROUP"), NOW)
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn actual_router_query_history_export_preserve_exact_authorized_projection() {
    let fixture = Fixture::new().await;
    let response = fixture.request("query", "?limit=2&max_bytes=1048576").await;
    assert_eq!(response.status(), StatusCode::OK);
    let page = response_json(response).await;
    assert_eq!(page["rows"].as_array().unwrap().len(), 2);
    assert_eq!(
        page["rows"][0]["payload"]["amount"],
        "9007199254740993.000000000001"
    );
    assert!(page["rows"][0]["payload"]["nullable"].is_null());
    assert!(
        page["resume_cursor"].is_null(),
        "Current does not imply Replay"
    );
    let wire = page.to_string();
    for hidden in [
        "hidden_peer",
        "hidden_balance",
        "TEST_ONLY-private",
        "total_count",
    ] {
        assert!(!wire.contains(hidden));
    }
    fixture.append().await;
    for (suffix, parameters) in [
        (
            "history",
            format!(
                "?limit=2&max_bytes=1048576&from_ms={}&to_ms={}",
                NOW - 1,
                NOW + 1
            ),
        ),
        ("export", "?limit=2&max_bytes=1048576".into()),
    ] {
        let response = fixture.request(suffix, &parameters).await;
        assert_eq!(response.status(), StatusCode::OK);
        let page = response_json(response).await;
        assert_eq!(page["rows"][0]["payload"]["amount"], "100.000000000001");
        assert!(!page.to_string().contains("hidden_balance"));
    }
}

#[tokio::test]
async fn mounted_cursor_is_exact_scope_and_operation_bound() {
    let fixture = Fixture::new().await;
    let response = fixture.request("query", "?limit=1&max_bytes=1048576").await;
    assert_eq!(response.status(), StatusCode::OK);
    let page = response_json(response).await;
    let cursor = page["next_cursor"].as_str().unwrap();
    let next = format!("?limit=1&max_bytes=1048576&cursor={cursor}");
    let response = fixture.request("query", &next).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_json(response).await["rows"][0]["entity_id"],
        "order_c"
    );
    let response = fixture.request("export", &next).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    fixture.policy.scope.lock().unwrap().principal_digest = hash("TEST_ONLY-other-human");
    let response = fixture.request("query", &next).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(response_json(response).await["code"], "RESYNC_REQUIRED");
}

#[tokio::test]
async fn cached_route_rechecks_actual_async_authority_after_cached_read() {
    let fixture = Fixture::new().await;
    let response = fixture.request("query", "?limit=2&max_bytes=1048576").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(fixture.policy.checks.load(Ordering::SeqCst), 3);
    fixture.policy.deny_on_check.store(6, Ordering::SeqCst);
    let response = fixture.request("query", "?limit=2&max_bytes=1048576").await;
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
    let body = response_json(response).await;
    assert_eq!(body["code"], "RESOURCE_NOT_AVAILABLE");
    assert!(!body.to_string().contains("amount"));
    assert_eq!(fixture.policy.checks.load(Ordering::SeqCst), 6);
}

#[tokio::test]
async fn unpolled_pages_and_transport_clones_hold_admission_until_last_byte_owner_drops() {
    let fixture = Fixture::new().await;
    fixture.append().await;
    // Warm only the authorized cache so its retained charge is a stable baseline.
    drop(fixture.request("query", "?limit=2&max_bytes=1048576").await);
    let baseline = fixture.backend.0.resources.stats().unwrap();
    for (suffix, parameters) in [
        ("query", "?limit=2&max_bytes=1048576".into()),
        (
            "history",
            format!(
                "?limit=2&max_bytes=1048576&from_ms={}&to_ms={}",
                NOW - 1,
                NOW + 1
            ),
        ),
        ("export", "?limit=2&max_bytes=1048576".into()),
    ] {
        let mut responses = Vec::new();
        for admitted in 1..=fixture.backend.0.limits.maximum_requests {
            let response = fixture.request(suffix, &parameters).await;
            assert_eq!(response.status(), StatusCode::OK);
            responses.push(response);
            assert_eq!(
                fixture.backend.0.requests.available_permits(),
                fixture.backend.0.limits.maximum_requests - admitted,
                "an unpolled response must still own its request admission"
            );
        }
        assert_eq!(
            fixture.request(suffix, &parameters).await.status(),
            StatusCode::TOO_MANY_REQUESTS
        );
        let held = fixture.backend.0.resources.stats().unwrap();
        assert_eq!(held.entries, baseline.entries + responses.len());
        assert_eq!(held.bytes, baseline.bytes + responses.len() * 1_048_576);
        let bytes = to_bytes(responses.pop().unwrap().into_body(), 1_048_576)
            .await
            .unwrap();
        let transport_copy = bytes.clone();
        drop(bytes);
        assert_eq!(fixture.backend.0.requests.available_permits(), 0);
        drop(transport_copy);
        assert_eq!(fixture.backend.0.requests.available_permits(), 1);
        drop(fixture.request(suffix, &parameters).await);
        drop(responses);
        assert_eq!(
            fixture.backend.0.requests.available_permits(),
            fixture.backend.0.limits.maximum_requests
        );
        let released = fixture.backend.0.resources.stats().unwrap();
        assert_eq!(
            (released.entries, released.bytes),
            (baseline.entries, baseline.bytes)
        );
    }
}

#[tokio::test]
async fn page_envelope_exhaustion_and_final_revoke_release_request_admission() {
    let fixture = Fixture::new().await;
    drop(fixture.request("query", "?limit=2&max_bytes=1048576").await);
    let resources = &fixture.backend.0.resources;
    let baseline = resources.stats().unwrap();
    let bounds = resources.limits();
    for (entries, bytes) in [
        (
            bounds.max_entries - bounds.foreground_reserved_entries - baseline.entries,
            1,
        ),
        (
            1,
            bounds.max_bytes - bounds.foreground_reserved_bytes - baseline.bytes - 1_048_576 + 1,
        ),
    ] {
        let held = resources.try_register(entries, bytes).unwrap();
        let before = resources.stats().unwrap();
        assert_eq!(
            fixture
                .request("query", "?limit=2&max_bytes=1048576")
                .await
                .status(),
            StatusCode::TOO_MANY_REQUESTS
        );
        let after = resources.stats().unwrap();
        assert_eq!((after.entries, after.bytes), (before.entries, before.bytes));
        assert_eq!(
            fixture.backend.0.requests.available_permits(),
            fixture.backend.0.limits.maximum_requests
        );
        drop(held);
    }
    // Deny precisely the post-cache recheck, after a response charge exists.
    fixture.policy.deny_on_check.store(
        fixture.policy.checks.load(Ordering::SeqCst) + 3,
        Ordering::SeqCst,
    );
    assert_eq!(
        fixture
            .request("query", "?limit=2&max_bytes=1048576")
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    let after = resources.stats().unwrap();
    assert_eq!(
        (after.entries, after.bytes),
        (baseline.entries, baseline.bytes)
    );
    assert_eq!(
        fixture.backend.0.requests.available_permits(),
        fixture.backend.0.limits.maximum_requests
    );
}

#[tokio::test]
async fn cancelled_final_policy_recheck_releases_response_reservation() {
    let fixture = Fixture::new().await;
    drop(fixture.request("query", "?limit=2&max_bytes=1048576").await);
    let baseline = fixture.backend.0.resources.stats().unwrap();
    fixture.policy.stall_on_check.store(
        fixture.policy.checks.load(Ordering::SeqCst) + 3,
        Ordering::SeqCst,
    );
    let router = fixture.backend.router();
    let task = tokio::spawn(async move {
        router
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "{ROUTE_PREFIX}/orders/query?limit=2&max_bytes=1048576"
                    ))
                    .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap()
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        while fixture.policy.stalled_checks.load(Ordering::SeqCst) == 0 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    let held = fixture.backend.0.resources.stats().unwrap();
    assert_eq!(
        (held.entries, held.bytes),
        (baseline.entries + 1, baseline.bytes + 1_048_576)
    );
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    let released = fixture.backend.0.resources.stats().unwrap();
    assert_eq!(
        (released.entries, released.bytes),
        (baseline.entries, baseline.bytes)
    );
    assert_eq!(
        fixture.backend.0.requests.available_permits(),
        fixture.backend.0.limits.maximum_requests
    );
}

#[tokio::test]
async fn direct_requests_cannot_inject_authority_or_turn_current_into_stream() {
    let fixture = Fixture::new().await;
    *fixture.policy.operations.lock().unwrap() = vec![Operation::Current];
    for suffix in ["history", "export", "stream"] {
        let response = fixture.request(suffix, "?limit=2&max_bytes=1048576").await;
        let expected = if suffix == "stream" {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::FORBIDDEN
        };
        assert_eq!(response.status(), expected);
    }
    assert_eq!(
        fixture.request("stream", "").await.status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        fixture
            .request("query", "?limit=2&max_bytes=1048576&scope=all")
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    fixture.policy.enabled.store(false, Ordering::SeqCst);
    let response = fixture
        .backend
        .router()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "{ROUTE_PREFIX}/orders/query?limit=2&max_bytes=1048576"
                ))
                .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
                .body(Body::from(
                    serde_json::to_vec(
                        &json!({"scope":read_scope(&fixture.handle.manifest().binding)}),
                    )
                    .unwrap(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn mounted_stream_shares_exact_cohort_revokes_each_frame_and_releases_clients() {
    let fixture = Fixture::new().await;
    let first = fixture.request("stream", "").await;
    let second = fixture.request("stream", "").await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(second.status(), StatusCode::OK);
    assert!(first.headers()[header::CONTENT_TYPE]
        .to_str()
        .unwrap()
        .starts_with("text/event-stream"));
    let cohort = fixture
        .backend
        .0
        .cohorts
        .lock()
        .unwrap()
        .values()
        .next()
        .unwrap()
        .upgrade()
        .unwrap();
    assert_eq!(cohort.hub.metrics().unwrap().clients, 2);
    assert_eq!(fixture.backend.0.cohorts.lock().unwrap().len(), 1);
    fixture.policy.enabled.store(false, Ordering::SeqCst);
    let mut first_body = first.into_body().into_data_stream();
    assert!(
        tokio::time::timeout(Duration::from_secs(1), first_body.next())
            .await
            .unwrap()
            .is_none()
    );
    drop(first_body);
    drop(second);
    tokio::task::yield_now().await;
    assert_eq!(cohort.hub.metrics().unwrap().clients, 0);
    assert_eq!(
        fixture.backend.0.requests.available_permits(),
        fixture.backend.0.limits.maximum_requests
    );
}

#[tokio::test]
async fn same_scope_sessions_share_notifications_but_not_revocation_custody() {
    let fixture = Fixture::new().await;
    let first = fixture.request("stream", "").await;
    let second = fixture
        .backend
        .router()
        .oneshot(
            Request::builder()
                .uri(format!("{ROUTE_PREFIX}/orders/stream"))
                .header(header::AUTHORIZATION, format!("Bearer {SECOND_TOKEN}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(second.status(), StatusCode::OK);
    assert_eq!(fixture.backend.0.cohorts.lock().unwrap().len(), 1);
    *fixture.policy.revoked_credential.lock().unwrap() = Some(TOKEN.into());
    let mut revoked = first.into_body().into_data_stream();
    let mut surviving = second.into_body().into_data_stream();
    assert!(tokio::time::timeout(Duration::from_secs(1), revoked.next())
        .await
        .unwrap()
        .is_none());
    // Let the shared coordinator actually run after first-session revoke. A
    // first-subscriber authority anchor must not terminate the valid session.
    tokio::time::sleep(Duration::from_millis(50)).await;
    let frame = tokio::time::timeout(Duration::from_secs(1), surviving.next())
        .await
        .unwrap();
    assert!(frame.is_some_and(|frame| frame.is_ok()));
    drop(revoked);
    drop(surviving);
}

#[tokio::test]
async fn stalled_newest_session_does_not_starve_valid_peer_notifications() {
    let fixture = Fixture::new().await;
    let first = fixture.request("stream", "").await;
    let second = fixture
        .backend
        .router()
        .oneshot(
            Request::builder()
                .uri(format!("{ROUTE_PREFIX}/orders/stream"))
                .header(header::AUTHORIZATION, format!("Bearer {SECOND_TOKEN}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(second.status(), StatusCode::OK);
    let mut surviving = first.into_body().into_data_stream();
    // Complete reconnect catch-up BEFORE the new commit. Only the coordinator
    // can now deliver its notification; catch-up must not mask a stalled poller.
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let frame = surviving.next().await.unwrap().unwrap();
            if String::from_utf8_lossy(&frame).contains("notification-only") {
                break;
            }
        }
    })
    .await
    .unwrap();
    *fixture.policy.stalled_credential.lock().unwrap() = Some(SECOND_TOKEN.into());
    tokio::time::timeout(Duration::from_secs(2), async {
        while fixture.policy.stalled_checks.load(Ordering::SeqCst) == 0 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    fixture.append().await;
    // The source/read clock was deliberately frozen for all other specimens.
    // Advance past the poll cadence (including its bounded jitter), otherwise
    // NotDue would mask BOTH the old and fixed representative algorithms.
    fixture.clock.0.store(NOW + 100, Ordering::SeqCst);
    tokio::time::timeout(Duration::from_millis(600), async {
        loop {
            let frame = surviving.next().await.unwrap().unwrap();
            if String::from_utf8_lossy(&frame).contains("projection-changed") {
                break;
            }
        }
    })
    .await
    .expect("valid original session must progress beside a pending peer");
    // The pending peer is not treated as ALLOW, merged into another session,
    // nor removed from custody. Dropping both bodies releases client admission.
    drop(surviving);
    drop(second);
}

#[tokio::test]
async fn full_stream_admission_retains_independent_query_capacity() {
    let fixture = Fixture::new().await;
    let mut streams = Vec::new();
    for _ in 0..fixture.backend.0.limits.maximum_streams {
        let response = fixture.request("stream", "").await;
        assert_eq!(response.status(), StatusCode::OK);
        streams.push(response);
    }
    assert_eq!(
        fixture.request("stream", "").await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        fixture
            .request("query", "?limit=2&max_bytes=1048576")
            .await
            .status(),
        StatusCode::OK
    );
    drop(streams);
    tokio::task::yield_now().await;
    assert_eq!(
        fixture.backend.0.streams.available_permits(),
        fixture.backend.0.limits.maximum_streams
    );
}

#[tokio::test]
async fn configured_backend_without_actual_current_provider_is_fail_closed() {
    let fixture = Fixture::new().await;
    let inner = &fixture.backend.0;
    let backend = ScopedBackend::assemble(
        Arc::clone(&inner.store),
        Arc::clone(&inner.resources),
        Arc::new(UnavailableCurrentPolicy),
        inner.codec.clone(),
        inner.limits,
        Arc::clone(&inner.clock),
    )
    .unwrap();
    let response = backend
        .router()
        .oneshot(
            Request::builder()
                .uri(format!(
                    "{ROUTE_PREFIX}/orders/query?limit=2&max_bytes=1048576"
                ))
                .header(header::AUTHORIZATION, format!("Bearer {TOKEN}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
