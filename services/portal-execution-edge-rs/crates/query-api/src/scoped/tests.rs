//! Synthetic contract tests; no source publication or runtime authorization.
use std::sync::atomic::{AtomicI64, AtomicUsize};

use serde_json::json;

use super::*;
use crate::{CursorCodec, CursorContext};

fn sha(value: &str) -> String {
    format!("sha256:{}", hex::encode(Sha256::digest(value.as_bytes())))
}
fn scope() -> ReadScope {
    ReadScope {
        ingest_binding_digest: sha("ingest"),
        slot_key: sha("slot"),
        principal_digest: sha("alice"),
        effective_scope_digest: sha("authorized_account_a"),
        app_policy_revision: "app1".to_owned(),
        field_policy_revision: "field1".to_owned(),
        schema_version: "orders.v1".to_owned(),
        model_revision: "model1".to_owned(),
        source_set_digest: sha("source_a"),
        dataset: "orders".to_owned(),
        entity_ids: Some(BTreeSet::from(["order_a".to_owned()])),
        allowed_fields: BTreeSet::from(["amount".to_owned(), "nullable".to_owned()]),
        history_capability: HistoryCapability::RetainedObservations,
        coverage: Coverage::RetainedObservations,
        history_from_ms: Some(0),
        history_to_ms: Some(1_000),
    }
}
struct Policy {
    expected: ReadScope,
    allowed: AtomicBool,
    exports: AtomicBool,
}
impl Policy {
    fn new(scope: &ReadScope) -> Self {
        Self {
            expected: scope.clone(),
            allowed: AtomicBool::new(true),
            exports: AtomicBool::new(false),
        }
    }
}
impl ReadAuthorizer for Policy {
    fn current(&self, scope: &ReadScope, operation: Operation, _: i64) -> bool {
        scope == &self.expected
            && self.allowed.load(AtomicOrdering::SeqCst)
            && (operation != Operation::Export || self.exports.load(AtomicOrdering::SeqCst))
    }
}
fn query() -> ReadQuery {
    ReadQuery {
        operation: Operation::Current,
        limit: 100,
        max_bytes: MAX_READ_BYTES,
        entity_id: None,
        from_ms: None,
        to_ms: None,
    }
}
fn context() -> CacheContext {
    CacheContext {
        generation: Uuid::now_v7(),
        projection_revision: "1".to_owned(),
        cutoff_ms: 100,
    }
}
fn limits() -> CacheLimits {
    CacheLimits {
        max_entries: 4,
        max_bytes: 1024,
        max_flights: 2,
        ttl_ms: 10,
        load_timeout_ms: 100,
    }
}
fn request<'a>(
    read: &'a AuthorizedRead,
    query: &'a ReadQuery,
    context: &'a CacheContext,
    authorizer: &'a dyn ReadAuthorizer,
    clock: &'a (dyn Fn() -> i64 + Sync),
    current_context: &'a (dyn Fn(&CacheContext) -> bool + Sync),
) -> CacheRequest<'a> {
    CacheRequest {
        read,
        query,
        context,
        authorizer,
        clock,
        current_context,
    }
}

#[test]
fn scope_validation_requires_bounded_exact_history_and_field_policy() {
    let original = scope();
    original.validate().unwrap();
    let mut bad = original.clone();
    bad.allowed_fields.clear();
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
    bad = original.clone();
    bad.allowed_fields = (0..65).map(|i| format!("field_{i}")).collect();
    assert_eq!(bad.validate(), Err(ScopedError::Bounds));
    bad = original.clone();
    bad.entity_ids = Some((0..257).map(|i| format!("id_{i}")).collect());
    assert_eq!(bad.validate(), Err(ScopedError::Bounds));
    bad = original.clone();
    bad.history_to_ms = None;
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
    bad = original.clone();
    bad.history_capability = HistoryCapability::Authoritative;
    bad.coverage = Coverage::CurrentPageOnly;
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
    bad = original.clone();
    bad.app_policy_revision = "\napp1".to_owned();
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
    bad = original.clone();
    bad.principal_digest = "alice".to_owned();
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
    bad = original.clone();
    bad.model_revision = "x".repeat(257);
    assert_eq!(bad.validate(), Err(ScopedError::Invalid));
}

#[test]
fn fresh_scope_authority_and_operation_are_not_inferred_from_read_access() {
    let s = scope();
    let policy = Policy::new(&s);
    let read = AuthorizedRead::authorize(s.clone(), Operation::Current, &policy, 100).unwrap();
    assert!(read.allows_entity("order_a"));
    assert!(!read.allows_entity("order_hidden"));
    assert!(matches!(
        AuthorizedRead::authorize(s.clone(), Operation::Export, &policy, 100),
        Err(ScopedError::AccessDenied)
    ));
    let mut widened = s.clone();
    widened.entity_ids = None;
    assert!(matches!(
        AuthorizedRead::authorize(widened, Operation::Current, &policy, 100),
        Err(ScopedError::AccessDenied)
    ));
    assert_eq!(
        read.project_payload(
            &json!({"amount":"9007199254740993.000000000001", "nullable":null, "hidden":"secret"})
        )
        .unwrap(),
        json!({"amount":"9007199254740993.000000000001", "nullable":null})
    );
    policy.allowed.store(false, AtomicOrdering::SeqCst);
    assert_eq!(read.recheck(&policy, 100), Err(ScopedError::AccessDenied));
}

#[test]
fn query_history_bounds_never_infer_full_coverage_from_local_rows() {
    let s = scope();
    let mut q = query();
    q.operation = Operation::History;
    q.from_ms = Some(1);
    q.to_ms = Some(999);
    q.validate(&s).unwrap();
    q.to_ms = Some(1_001);
    assert_eq!(q.validate(&s), Err(ScopedError::TypedUnavailable));
    q.to_ms = None;
    assert_eq!(q.validate(&s), Err(ScopedError::Invalid));
    q = query();
    q.entity_id = Some("hidden".to_owned());
    assert_eq!(q.validate(&s), Err(ScopedError::AccessDenied));
    q = query();
    q.limit = 201;
    assert_eq!(q.validate(&s), Err(ScopedError::Bounds));
    q = query();
    q.max_bytes = MAX_READ_BYTES + 1;
    assert_eq!(q.validate(&s), Err(ScopedError::Bounds));
    let mut unavailable = s;
    unavailable.history_capability = HistoryCapability::Unavailable;
    unavailable.history_from_ms = None;
    unavailable.history_to_ms = None;
    q = query();
    q.operation = Operation::Replay;
    assert_eq!(q.validate(&unavailable), Err(ScopedError::TypedUnavailable));
    q.operation = Operation::Export;
    q.validate(&unavailable).unwrap();
    q.from_ms = Some(0);
    q.to_ms = Some(1);
    assert_eq!(q.validate(&unavailable), Err(ScopedError::TypedUnavailable));
}

#[test]
fn cache_key_binds_all_scope_query_generation_revision_and_cutoff_axes() {
    let s = scope();
    let policy = Policy::new(&s);
    let read = AuthorizedRead::authorize(s.clone(), Operation::Current, &policy, 100).unwrap();
    let q = query();
    let ctx = context();
    let baseline = CacheKey::new(&read, &q, &ctx).unwrap();
    let mut variants = Vec::new();
    for change in 0..14 {
        let mut changed = s.clone();
        match change {
            0 => changed.principal_digest = sha("bob"),
            1 => changed.effective_scope_digest = sha("other_scope"),
            2 => changed.app_policy_revision = "app2".to_owned(),
            3 => changed.field_policy_revision = "field2".to_owned(),
            4 => changed.schema_version = "orders.v2".to_owned(),
            5 => changed.model_revision = "model2".to_owned(),
            6 => changed.source_set_digest = sha("other_source"),
            7 => changed.ingest_binding_digest = sha("other_ingest"),
            8 => changed.slot_key = sha("other_slot"),
            9 => changed.dataset = "fills".to_owned(),
            10 => changed.entity_ids = None,
            11 => {
                changed.allowed_fields.insert("extra".to_owned());
            }
            12 => changed.history_from_ms = Some(1),
            _ => changed.coverage = Coverage::AuthorizedOnly,
        }
        let p = Policy::new(&changed);
        let a = AuthorizedRead::authorize(changed, Operation::Current, &p, 100).unwrap();
        variants.push(CacheKey::new(&a, &q, &ctx).unwrap());
    }
    let mut changed = ctx.clone();
    changed.generation = Uuid::now_v7();
    variants.push(CacheKey::new(&read, &q, &changed).unwrap());
    changed = ctx.clone();
    changed.projection_revision = "2".to_owned();
    variants.push(CacheKey::new(&read, &q, &changed).unwrap());
    changed = ctx.clone();
    changed.cutoff_ms += 1;
    variants.push(CacheKey::new(&read, &q, &changed).unwrap());
    let mut changed = q.clone();
    changed.limit -= 1;
    variants.push(CacheKey::new(&read, &changed, &ctx).unwrap());
    changed = q;
    changed.entity_id = Some("order_a".to_owned());
    variants.push(CacheKey::new(&read, &changed, &ctx).unwrap());
    assert!(variants.iter().all(|key| key != &baseline));
    assert_eq!(
        variants
            .iter()
            .map(CacheKey::as_str)
            .collect::<BTreeSet<_>>()
            .len(),
        variants.len()
    );
}

#[tokio::test]
async fn concurrent_tabs_share_one_loader_without_source_work_per_client() {
    let s = scope();
    let policy = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &policy, 100).unwrap();
    let q = query();
    let ctx = context();
    let cache = ScopedCache::new(limits()).unwrap();
    let calls = AtomicUsize::new(0);
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    let fetch = || {
        cache.get_or_load(
            request(&read, &q, &ctx, &policy, &clock, &active),
            || async {
                calls.fetch_add(1, AtomicOrdering::SeqCst);
                tokio::task::yield_now().await;
                Ok(b"authorized".to_vec())
            },
        )
    };
    let (one, two, three) = tokio::join!(fetch(), fetch(), fetch());
    assert_eq!(one.unwrap().as_slice(), b"authorized");
    assert_eq!(two.unwrap().as_slice(), b"authorized");
    assert_eq!(three.unwrap().as_slice(), b"authorized");
    assert_eq!(calls.load(AtomicOrdering::SeqCst), 1);
    assert_eq!(cache.usage().unwrap(), (1, 10, 0));
}

#[tokio::test]
async fn identical_query_filters_never_share_protected_data_across_principals() {
    let q = query();
    let ctx = context();
    let cache = ScopedCache::new(limits()).unwrap();
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    for (principal, body) in [("alice", "alice-only"), ("bob", "bob-only")] {
        let mut s = scope();
        s.principal_digest = sha(principal);
        let p = Policy::new(&s);
        let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
        let result = cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                Ok(body.as_bytes().to_vec())
            })
            .await
            .unwrap();
        assert_eq!(result.as_slice(), body.as_bytes());
    }
    assert_eq!(cache.usage().unwrap().0, 2);
}

#[tokio::test]
async fn cache_hit_and_loader_completion_both_recheck_current_authority() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let q = query();
    let ctx = context();
    let cache = ScopedCache::new(limits()).unwrap();
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    cache
        .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
            Ok(vec![1])
        })
        .await
        .unwrap();
    p.allowed.store(false, AtomicOrdering::SeqCst);
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                panic!("denied hit must not load")
            })
            .await,
        Err(ScopedError::AccessDenied)
    );
    p.allowed.store(true, AtomicOrdering::SeqCst);
    cache.invalidate().unwrap();
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                p.allowed.store(false, AtomicOrdering::SeqCst);
                Ok(vec![2])
            })
            .await,
        Err(ScopedError::AccessDenied)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
}

#[tokio::test]
async fn generation_change_during_load_never_fills_or_returns_old_snapshot() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let q = query();
    let ctx = context();
    let cache = ScopedCache::new(limits()).unwrap();
    let clock = || 100;
    let fresh = AtomicBool::new(true);
    let active = |candidate: &CacheContext| candidate == &ctx && fresh.load(AtomicOrdering::SeqCst);
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                fresh.store(false, AtomicOrdering::SeqCst);
                Ok(vec![1])
            })
            .await,
        Err(ScopedError::ResyncRequired)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
}

#[tokio::test]
async fn invalidation_fences_inflight_fill_without_releasing_its_capacity_slot() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let q = query();
    let mut other_query = q.clone();
    other_query.limit -= 1;
    let ctx = context();
    let mut cap = limits();
    cap.max_flights = 1;
    let cache = ScopedCache::new(cap).unwrap();
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                cache.invalidate().unwrap();
                assert_eq!(cache.usage().unwrap().2, 1);
                assert_eq!(
                    cache
                        .get_or_load(
                            request(&read, &other_query, &ctx, &p, &clock, &active),
                            || async { Ok(vec![2]) }
                        )
                        .await,
                    Err(ScopedError::Busy)
                );
                Ok(vec![1])
            })
            .await,
        Err(ScopedError::ResyncRequired)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                Ok(vec![3])
            })
            .await
            .unwrap()
            .as_slice(),
        &[3]
    );
}

#[tokio::test]
async fn cancelled_leader_releases_flight_for_a_later_retry() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let q = query();
    let ctx = context();
    let cache = ScopedCache::new(limits()).unwrap();
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    let mut pending = Box::pin(
        cache.get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
            std::future::pending().await
        }),
    );
    tokio::select! { biased; result = &mut pending => panic!("must wait, got {result:?}"), () = tokio::task::yield_now() => {} }
    assert_eq!(cache.usage().unwrap().2, 1);
    drop(pending);
    assert_eq!(cache.usage().unwrap().2, 0);
    cache
        .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
            Ok(vec![4])
        })
        .await
        .unwrap();
    assert_eq!(cache.usage().unwrap(), (1, 1, 0));
}

#[tokio::test]
async fn timeout_error_and_oversize_loads_leave_no_entries_or_flights() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let q = query();
    let ctx = context();
    let mut cap = limits();
    cap.load_timeout_ms = 1;
    let cache = ScopedCache::new(cap).unwrap();
    let clock = || 100;
    let active = |candidate: &CacheContext| candidate == &ctx;
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                std::future::pending().await
            })
            .await,
        Err(ScopedError::Timeout)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
    assert_eq!(
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                Err(ScopedError::Unavailable)
            })
            .await,
        Err(ScopedError::Unavailable)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
    let mut small = q;
    small.max_bytes = 1;
    assert_eq!(
        cache
            .get_or_load(
                request(&read, &small, &ctx, &p, &clock, &active),
                || async { Ok(vec![1, 2]) }
            )
            .await,
        Err(ScopedError::Bounds)
    );
    assert_eq!(cache.usage().unwrap(), (0, 0, 0));
    cache
        .get_or_load(
            request(&read, &small, &ctx, &p, &clock, &active),
            || async { Ok(vec![1]) },
        )
        .await
        .unwrap();
}

#[tokio::test]
async fn cache_lru_bytes_entries_and_ttl_are_explicitly_bounded() {
    let s = scope();
    let p = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &p, 100).unwrap();
    let ctx = context();
    let mut cap = limits();
    cap.max_entries = 2;
    cap.max_bytes = 6;
    let cache = ScopedCache::new(cap).unwrap();
    let now = AtomicI64::new(100);
    let clock = || now.load(AtomicOrdering::SeqCst);
    let active = |candidate: &CacheContext| candidate == &ctx;
    for limit in 1..=3 {
        let mut q = query();
        q.limit = limit;
        cache
            .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
                Ok(vec![1, 2, 3])
            })
            .await
            .unwrap();
        let (entries, bytes, flights) = cache.usage().unwrap();
        assert!(entries <= 2 && bytes <= 6 && flights == 0);
    }
    now.store(111, AtomicOrdering::SeqCst);
    let q = query();
    cache
        .get_or_load(request(&read, &q, &ctx, &p, &clock, &active), || async {
            Ok(vec![9])
        })
        .await
        .unwrap();
    assert_eq!(cache.usage().unwrap(), (1, 1, 0));
}

#[test]
fn display_decimal_ordering_is_exact_for_negative_scale_ties_and_large_values() {
    for (left, right, expected) in [
        ("-10", "-2", Ordering::Less),
        ("-0.000", "0", Ordering::Equal),
        ("1.10", "1.1", Ordering::Equal),
        ("1.01", "1.001", Ordering::Greater),
        (
            "9007199254740993.000000000001",
            "9007199254740993.000000000002",
            Ordering::Less,
        ),
        ("-0.000000000000000000000000000001", "0", Ordering::Less),
    ] {
        assert_eq!(compare_decimal_lexemes(left, right).unwrap(), expected);
        assert_eq!(
            compare_decimal_lexemes(right, left).unwrap(),
            expected.reverse()
        );
    }
    assert_eq!(
        compare_decimal_lexemes(&"9".repeat(128), &"1".repeat(127)).unwrap(),
        Ordering::Greater
    );
    for bad in ["1e20", "NaN", "Infinity", "+1", "01", "-", "1."] {
        assert!(compare_decimal_lexemes(bad, "1").is_err());
    }
}

#[test]
fn display_min_max_retains_spike_extrema_without_mutating_canonical_input_or_coverage() {
    let mut points: Vec<_> = (0..20)
        .map(|at_ms| ChartPoint {
            at_ms,
            value: ExactDecimal::parse("1.0000").unwrap(),
        })
        .collect();
    points[8].value = ExactDecimal::parse("999999999999999999999.0000001").unwrap();
    points[12].value = ExactDecimal::parse("-999999999999999999999.0000001").unwrap();
    let original = points.clone();
    let continuation = Some("opaque_raw_page_next".to_owned());
    let view = display_min_max(
        &points,
        4,
        Coverage::RetainedObservations,
        continuation.clone(),
    )
    .unwrap();
    assert_eq!(
        view.points
            .iter()
            .map(|point| point.at_ms)
            .collect::<Vec<_>>(),
        vec![0, 8, 12, 19]
    );
    assert_eq!(view.raw_continuation, continuation);
    assert_eq!(view.coverage, Coverage::RetainedObservations);
    assert!(view.display_only);
    assert_eq!(view.method, "BUCKET_MIN_MAX_DISPLAY_V1");
    assert_eq!((view.input_rows, view.returned_rows), (20, 4));
    assert_eq!(points, original);
    assert!(display_min_max(&points, 3, Coverage::AuthorizedOnly, None).is_err());
    points[2].at_ms = points[1].at_ms;
    assert_eq!(
        display_min_max(&points, 4, Coverage::AuthorizedOnly, None),
        Err(ScopedError::Integrity)
    );
}

#[test]
fn opaque_public_event_identity_binds_scope_and_keeps_raw_ids_out_of_output() {
    let codec = CursorCodec::new(
        "test-k1",
        BTreeMap::from([("test-k1".to_owned(), vec![7; 32])]),
        Duration::from_secs(30),
    )
    .unwrap();
    let epoch = Uuid::now_v7();
    let ctx = CursorContext {
        workspace_id: "fixture_workspace",
        environment: "paper",
        epoch_id: epoch,
        resource: "scoped_history",
        query_fingerprint: "fully_scope_bound_fixture_digest",
    };
    let raw = "event_9007199254740993";
    let public = codec.opaque_identifier(&ctx, "event", raw).unwrap();
    assert_eq!(public, codec.opaque_identifier(&ctx, "event", raw).unwrap());
    assert!(!public.contains(raw));
    assert!(!public.contains("9007199254740993"));
    let other = CursorContext {
        query_fingerprint: "other_principal_policy",
        ..ctx
    };
    assert_ne!(
        public,
        codec.opaque_identifier(&other, "event", raw).unwrap()
    );
    assert_ne!(
        public,
        codec
            .opaque_identifier(&other, "another_namespace", raw)
            .unwrap()
    );
    assert!(codec
        .opaque_identifier(&other, "event", &"x".repeat(161))
        .is_err());
    assert!(codec
        .opaque_identifier(&other, "event", "bad\nidentity")
        .is_err());
}

#[test]
fn explicit_safety_ceilings_and_empty_authorized_set_do_not_default_to_all() {
    let mut cap = limits();
    cap.max_entries = 0;
    assert!(ScopedCache::new(cap).is_err());
    cap = limits();
    cap.max_flights = 65;
    assert!(ScopedCache::new(cap).is_err());
    cap = limits();
    cap.ttl_ms = 300_001;
    assert!(ScopedCache::new(cap).is_err());
    cap = limits();
    cap.load_timeout_ms = 0;
    assert!(ScopedCache::new(cap).is_err());
    let mut s = scope();
    s.entity_ids = Some(BTreeSet::new());
    let policy = Policy::new(&s);
    let read = AuthorizedRead::authorize(s, Operation::Current, &policy, 100).unwrap();
    assert!(!read.allows_entity("order_a"));
    let mut q = query();
    q.entity_id = Some("order_a".to_owned());
    assert_eq!(q.validate(read.scope()), Err(ScopedError::AccessDenied));
}
