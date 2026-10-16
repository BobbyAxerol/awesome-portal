//! Synthetic, source-dark correctness fixtures. No upstream requests or runtime
//! policy adapter. Real committed-group replay is separately proved by PG tests.
use std::sync::atomic::AtomicUsize;

use execution_contracts::catalogue_v1::{
    Completeness, Confidence, Coverage as QualityCoverage, Freshness, Opaque, SafeInteger,
};
use query_api::scoped::{Coverage, HistoryCapability};

use super::*;

struct Authorizer {
    allow: AtomicBool,
    until: i64,
}
impl Authorizer {
    fn yes() -> Self {
        Self {
            allow: AtomicBool::new(true),
            until: MAX_TIME_MS,
        }
    }
}
impl ReadAuthorizer for Authorizer {
    fn current(&self, scope: &ReadScope, operation: Operation, now_ms: i64) -> bool {
        self.allow.load(Ordering::Acquire)
            && now_ms < self.until
            && operation == Operation::Replay
            && scope.principal_digest == digest(1)
    }
}

fn digest(value: u8) -> String {
    // ReadScope requires the canonical algorithm-qualified digest, including
    // synthetic identities; bare hexadecimal must still fail closed.
    format!("sha256:{value:064x}")
}
fn scope() -> ReadScope {
    ReadScope {
        ingest_binding_digest: digest(2),
        slot_key: digest(3),
        principal_digest: digest(1),
        effective_scope_digest: digest(4),
        app_policy_revision: "app-v1".into(),
        field_policy_revision: "field-v1".into(),
        schema_version: "scoped.v1".into(),
        model_revision: "model-v1".into(),
        source_set_digest: digest(5),
        dataset: "orders".into(),
        entity_ids: None,
        allowed_fields: BTreeSet::from(["quantity".into()]),
        history_capability: HistoryCapability::RetainedObservations,
        coverage: Coverage::RetainedObservations,
        history_from_ms: Some(0),
        history_to_ms: Some(1000),
    }
}
fn config() -> ScopedRealtimeConfig {
    ScopedRealtimeConfig {
        maximum_clients: 100,
        client_queue_entries: 4,
        client_queue_bytes: 8192,
        total_queue_bytes: 1024 * 1024,
        notices_per_poll: 4,
        maximum_notice_bytes: 2048,
        poll_interval_ms: 10,
        poll_timeout_ms: 100,
    }
}
fn notice(cursor: &str) -> ChangeNotice {
    ChangeNotice {
        resume_cursor: cursor.into(),
        projection_generation: "generation-one".into(),
        quality: Quality {
            completeness: Completeness::Partial,
            freshness: Freshness::Stale,
            coverage: QualityCoverage::RetainedObservations,
            source_as_of_ms: None,
            portal_observed_at_ms: SafeInteger::new(0).unwrap(),
            source_set_ref: Opaque::parse("synthetic-source").unwrap(),
            confidence: Confidence::Provisional,
            reasons: vec![Opaque::parse("RETAINED_NOT_AUTHORITATIVE_HISTORY").unwrap()],
        },
    }
}
fn batch(cursors: &[&str]) -> NoticeBatch {
    NoticeBatch {
        notices: cursors.iter().map(|cursor| notice(cursor)).collect(),
        next_cursor: cursors.last().map(|v| (*v).to_owned()),
        caught_up: true,
    }
}
fn hub(auth: &Authorizer) -> ScopedRealtimeHub {
    ScopedRealtimeHub::new(scope(), "generation-one".into(), None, config(), auth, 0).unwrap()
}

struct Source {
    batches: Mutex<VecDeque<Result<NoticeBatch, ReplayError>>>,
    calls: AtomicUsize,
    afters: Mutex<Vec<Option<String>>>,
    delay_ms: u64,
    revoke: Option<Arc<Authorizer>>,
}
impl Source {
    fn new(batches: impl IntoIterator<Item = NoticeBatch>) -> Self {
        Self {
            batches: Mutex::new(batches.into_iter().map(Ok).collect()),
            calls: AtomicUsize::new(0),
            afters: Mutex::new(Vec::new()),
            delay_ms: 0,
            revoke: None,
        }
    }
    fn failure(error: ReplayError) -> Self {
        let source = Self::new([]);
        source.batches.lock().unwrap().push_back(Err(error));
        source
    }
}
impl ScopedReplaySource for Source {
    fn replay<'a>(
        &'a self,
        _scope: &'a ReadScope,
        after: Option<&'a str>,
        _limit: usize,
        _now_ms: i64,
    ) -> ReplayFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::AcqRel);
            self.afters.lock().unwrap().push(after.map(str::to_owned));
            if self.delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(self.delay_ms)).await;
            }
            if let Some(auth) = &self.revoke {
                auth.allow.store(false, Ordering::Release);
            }
            self.batches
                .lock()
                .unwrap()
                .pop_front()
                .unwrap_or(Err(ReplayError::Unavailable))
        })
    }
}

#[derive(Default)]
struct PendingSource {
    calls: AtomicUsize,
}
impl ScopedReplaySource for PendingSource {
    fn replay<'a>(
        &'a self,
        _scope: &'a ReadScope,
        _after: Option<&'a str>,
        _limit: usize,
        _now_ms: i64,
    ) -> ReplayFuture<'a> {
        Box::pin(async move {
            self.calls.fetch_add(1, Ordering::AcqRel);
            std::future::pending().await
        })
    }
}

#[tokio::test]
async fn one_source_poll_serves_one_hundred_tabs_without_subscription_reads() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let source = Source::new([batch(&["one"])]);
    let mut tabs: Vec<_> = (0..100).map(|_| hub.subscribe(&auth, 0).unwrap()).collect();
    assert_eq!(source.calls.load(Ordering::Acquire), 0);
    assert_eq!(
        hub.poll(&source, &auth, 0).await.unwrap(),
        PollOutcome::CaughtUp
    );
    for tab in &mut tabs {
        assert!(matches!(
            tab.next(&auth, 0).unwrap(),
            ScopedDelivery::Notice(_)
        ));
    }
    assert_eq!(source.calls.load(Ordering::Acquire), 1);
    assert_eq!(hub.metrics().unwrap().charged_bytes, 0);
}

#[tokio::test]
async fn slow_tab_terminates_without_blocking_fast_peer() {
    let auth = Authorizer::yes();
    let mut cfg = config();
    cfg.client_queue_entries = 1;
    let hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0).unwrap();
    let mut slow = hub.subscribe(&auth, 0).unwrap();
    let mut fast = hub.subscribe(&auth, 0).unwrap();
    let source = Source::new([batch(&["one"]), batch(&["two"])]);
    hub.poll(&source, &auth, 0).await.unwrap();
    fast.next(&auth, 0).unwrap();
    hub.poll(&source, &auth, 10).await.unwrap();
    assert_eq!(
        slow.next(&auth, 10).unwrap(),
        ScopedDelivery::Stopped(StreamStop::SlowConsumer)
    );
    assert_eq!(slow.next(&auth, 10).unwrap(), ScopedDelivery::Closed);
    assert!(matches!(
        fast.next(&auth, 10).unwrap(),
        ScopedDelivery::Notice(_)
    ));
}

#[tokio::test]
async fn global_byte_cap_is_conservative_and_drop_releases_capacity() {
    let auth = Authorizer::yes();
    let bytes = notice_bytes(&notice("one")).unwrap();
    let mut cfg = config();
    cfg.maximum_notice_bytes = bytes;
    cfg.client_queue_bytes = bytes;
    cfg.total_queue_bytes = bytes;
    let hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0).unwrap();
    let first = hub.subscribe(&auth, 0).unwrap();
    let mut second = hub.subscribe(&auth, 0).unwrap();
    hub.poll(&Source::new([batch(&["one"])]), &auth, 0)
        .await
        .unwrap();
    assert_eq!(hub.metrics().unwrap().charged_bytes, bytes);
    assert_eq!(
        second.next(&auth, 0).unwrap(),
        ScopedDelivery::Stopped(StreamStop::SlowConsumer)
    );
    drop(first);
    drop(second);
    assert_eq!(
        hub.metrics().unwrap(),
        ScopedQueueMetrics {
            clients: 0,
            charged_bytes: 0
        }
    );
}

#[tokio::test]
async fn revoke_before_dequeue_purges_already_queued_data() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut tab = hub.subscribe(&auth, 0).unwrap();
    hub.poll(&Source::new([batch(&["one"])]), &auth, 0)
        .await
        .unwrap();
    auth.allow.store(false, Ordering::Release);
    assert_eq!(
        tab.next(&auth, 1).unwrap(),
        ScopedDelivery::Stopped(StreamStop::AccessDenied)
    );
    assert_eq!(tab.next(&auth, 1).unwrap(), ScopedDelivery::Closed);
    assert_eq!(hub.metrics().unwrap().charged_bytes, 0);
    assert!(matches!(
        hub.subscribe(&auth, 1),
        Err(ScopedRealtimeError::AccessDenied)
    ));
}

#[tokio::test]
async fn revoke_during_source_await_discards_result_and_keeps_cursor() {
    let auth = Arc::new(Authorizer::yes());
    let hub = hub(&auth);
    let mut tab = hub.subscribe(auth.as_ref(), 0).unwrap();
    let mut source = Source::new([batch(&["one"])]);
    source.revoke = Some(Arc::clone(&auth));
    assert_eq!(
        hub.poll(&source, auth.as_ref(), 0).await,
        Err(ScopedRealtimeError::AccessDenied)
    );
    assert_eq!(hub.cursor().unwrap(), None);
    assert_eq!(
        tab.next(auth.as_ref(), 0).unwrap(),
        ScopedDelivery::Stopped(StreamStop::AccessDenied)
    );
}

#[tokio::test]
async fn session_expiry_across_await_is_rechecked_with_elapsed_clock() {
    let auth = Authorizer {
        allow: AtomicBool::new(true),
        until: 2,
    };
    let hub = hub(&auth);
    let mut source = Source::new([batch(&["one"])]);
    source.delay_ms = 5;
    assert_eq!(
        hub.poll(&source, &auth, 0).await,
        Err(ScopedRealtimeError::AccessDenied)
    );
    assert_eq!(hub.cursor().unwrap(), None);
}

#[tokio::test]
async fn expired_or_wrong_scope_cursor_is_safe_resync_not_fallback() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut tab = hub.subscribe(&auth, 0).unwrap();
    let source = Source::failure(ReplayError::ResyncRequired);
    assert_eq!(
        hub.resume(&source, Some("expired"), &auth, 0).await,
        Err(ScopedRealtimeError::ResyncRequired)
    );
    assert_eq!(source.calls.load(Ordering::Acquire), 1);
    // One client's expired cursor must not disconnect unrelated current tabs.
    assert_eq!(tab.next(&auth, 0).unwrap(), ScopedDelivery::Idle);
}

#[tokio::test]
async fn reconnect_replay_does_not_advance_group_poll_cursor() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    hub.poll(&Source::new([batch(&["current"])]), &auth, 0)
        .await
        .unwrap();
    let source = Source::new([batch(&["older"])]);
    let result = hub.resume(&source, Some("start"), &auth, 0).await.unwrap();
    assert_eq!(result.next_cursor.as_deref(), Some("older"));
    assert_eq!(hub.cursor().unwrap().as_deref(), Some("current"));
}

#[tokio::test]
async fn lost_notify_uses_periodic_durable_fallback_and_restart_token() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let source = Source::new([batch(&["one"]), batch(&["two"])]);
    hub.poll(&source, &auth, 0).await.unwrap();
    assert_eq!(
        hub.poll(&source, &auth, 9).await.unwrap(),
        PollOutcome::NotDue
    );
    hub.poll(&source, &auth, 10).await.unwrap();
    assert_eq!(
        *source.afters.lock().unwrap(),
        vec![None, Some("one".into())]
    );
    // The trusted adapter restores its persisted opaque token; no history scan
    // or numeric source offset is reconstructed from browser-visible notices.
    let restarted = ScopedRealtimeHub::new(
        scope(),
        "generation-one".into(),
        hub.cursor().unwrap(),
        config(),
        &auth,
        20,
    )
    .unwrap();
    let next = Source::new([batch(&["three"])]);
    restarted.poll(&next, &auth, 20).await.unwrap();
    assert_eq!(*next.afters.lock().unwrap(), vec![Some("two".into())]);
}

#[tokio::test]
async fn repeated_wake_hints_coalesce_and_no_hint_is_correctness_authority() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let source = Source::new([batch(&["one"]), batch(&["two"])]);
    hub.poll(&source, &auth, 0).await.unwrap();
    for _ in 0..100 {
        hub.hint().unwrap();
    }
    hub.poll(&source, &auth, 1).await.unwrap();
    assert_eq!(
        hub.poll(&source, &auth, 2).await.unwrap(),
        PollOutcome::NotDue
    );
    assert_eq!(source.calls.load(Ordering::Acquire), 2);
}

#[tokio::test]
async fn partial_stale_quality_is_unchanged_by_caught_up_transport() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut tab = hub.subscribe(&auth, 0).unwrap();
    hub.poll(&Source::new([batch(&["one"])]), &auth, 0)
        .await
        .unwrap();
    let ScopedDelivery::Notice(value) = tab.next(&auth, 0).unwrap() else {
        panic!("expected notice");
    };
    assert_eq!(value.quality, notice("one").quality);
    assert_eq!(value.quality.completeness, Completeness::Partial);
    assert_eq!(value.quality.freshness, Freshness::Stale);
    assert_eq!(NOTICE_SEMANTICS, "NOTIFICATION_ONLY");
}

#[tokio::test]
async fn unavailable_source_never_claims_caught_up_or_advances_cursor() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    assert_eq!(
        hub.poll(&Source::failure(ReplayError::Unavailable), &auth, 0)
            .await,
        Err(ScopedRealtimeError::Unavailable)
    );
    assert_eq!(hub.cursor().unwrap(), None);
}

#[tokio::test]
async fn generation_mismatch_discards_whole_batch_before_fanout() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut tab = hub.subscribe(&auth, 0).unwrap();
    let mut wrong = batch(&["one", "two"]);
    wrong.notices[1].projection_generation = "wrong".into();
    assert_eq!(
        hub.poll(&Source::new([wrong]), &auth, 0).await,
        Err(ScopedRealtimeError::Integrity)
    );
    assert_eq!(hub.cursor().unwrap(), None);
    assert_eq!(
        tab.next(&auth, 0).unwrap(),
        ScopedDelivery::Stopped(StreamStop::ResyncRequired)
    );
}

#[tokio::test]
async fn duplicate_receipts_are_integrity_error_not_double_delivery() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    assert_eq!(
        hub.poll(&Source::new([batch(&["one", "one"])]), &auth, 0)
            .await,
        Err(ScopedRealtimeError::Integrity)
    );
}

#[tokio::test]
async fn malformed_batch_tail_and_oversized_notice_are_rejected() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut wrong = batch(&["one"]);
    wrong.next_cursor = Some("other".into());
    assert_eq!(
        hub.poll(&Source::new([wrong]), &auth, 0).await,
        Err(ScopedRealtimeError::Integrity)
    );
    let hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, config(), &auth, 0).unwrap();
    let mut large = batch(&["one"]);
    large.notices[0].resume_cursor = "x".repeat(4097);
    large.next_cursor = Some(large.notices[0].resume_cursor.clone());
    assert_eq!(
        hub.poll(&Source::new([large]), &auth, 0).await,
        Err(ScopedRealtimeError::Integrity)
    );
}

#[tokio::test]
async fn invalid_quality_constructor_and_excess_batch_count_fail_closed() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut wrong = batch(&["one"]);
    wrong.notices[0].quality.reasons = vec![Opaque::parse("reason").unwrap(); 33];
    assert_eq!(
        hub.poll(&Source::new([wrong]), &auth, 0).await,
        Err(ScopedRealtimeError::Integrity)
    );
    let hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, config(), &auth, 0).unwrap();
    assert_eq!(
        hub.poll(
            &Source::new([batch(&["one", "two", "three", "four", "five"])]),
            &auth,
            0
        )
        .await,
        Err(ScopedRealtimeError::Integrity)
    );
}

#[tokio::test]
async fn source_cannot_spin_empty_more_pages_without_cursor_progress() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let wrong = NoticeBatch {
        notices: vec![],
        next_cursor: None,
        caught_up: false,
    };
    assert_eq!(
        hub.poll(&Source::new([wrong]), &auth, 0).await,
        Err(ScopedRealtimeError::Integrity)
    );
}

#[tokio::test]
async fn empty_authorized_scan_advances_opaque_cursor_without_hidden_counts() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut tab = hub.subscribe(&auth, 0).unwrap();
    let empty = NoticeBatch {
        notices: vec![],
        next_cursor: Some("covered".into()),
        caught_up: true,
    };
    hub.poll(&Source::new([empty]), &auth, 0).await.unwrap();
    assert_eq!(hub.cursor().unwrap().as_deref(), Some("covered"));
    assert_eq!(tab.next(&auth, 0).unwrap(), ScopedDelivery::Idle);
}

#[tokio::test]
async fn timeout_and_future_cancellation_release_single_flight_admission() {
    let auth = Authorizer::yes();
    let mut cfg = config();
    cfg.poll_timeout_ms = 2;
    let timeout_hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0).unwrap();
    let source = PendingSource::default();
    assert_eq!(
        timeout_hub.poll(&source, &auth, 0).await,
        Err(ScopedRealtimeError::Timeout)
    );
    timeout_hub.hint().unwrap();
    timeout_hub
        .poll(&Source::new([batch(&["timeout-recovered"])]), &auth, 0)
        .await
        .unwrap();
    assert_eq!(
        timeout_hub.cursor().unwrap().as_deref(),
        Some("timeout-recovered")
    );

    cfg.poll_timeout_ms = 60_000;
    let cancellation_hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0).unwrap();
    let mut pending = Box::pin(cancellation_hub.poll(&source, &auth, 0));
    // Enter the awaited source exactly once, without competing wall-clock timers.
    std::future::poll_fn(|cx| {
        assert!(pending.as_mut().poll(cx).is_pending());
        std::task::Poll::Ready(())
    })
    .await;
    assert_eq!(source.calls.load(Ordering::Acquire), 2);
    let recovered = Source::new([batch(&["two"])]);
    assert_eq!(
        cancellation_hub.poll(&recovered, &auth, 0).await,
        Err(ScopedRealtimeError::Busy)
    );
    assert_eq!(
        cancellation_hub.resume(&recovered, None, &auth, 0).await,
        Err(ScopedRealtimeError::Busy)
    );
    assert_eq!(recovered.calls.load(Ordering::Acquire), 0);
    drop(pending);
    assert_eq!(cancellation_hub.cursor().unwrap(), None);
    cancellation_hub.hint().unwrap();
    cancellation_hub.poll(&recovered, &auth, 0).await.unwrap();
    assert_eq!(cancellation_hub.cursor().unwrap().as_deref(), Some("two"));
}

#[tokio::test]
async fn concurrent_poll_and_reconnect_share_one_admission() {
    let auth = Authorizer::yes();
    let hub = hub(&auth);
    let mut source = Source::new([batch(&["one"])]);
    source.delay_ms = 50;
    let first = hub.poll(&source, &auth, 0);
    tokio::pin!(first);
    tokio::select! { _ = &mut first => panic!("delayed source should not finish"), () = tokio::time::sleep(Duration::from_millis(1)) => {} }
    assert_eq!(
        hub.poll(&source, &auth, 0).await,
        Err(ScopedRealtimeError::Busy)
    );
    assert_eq!(
        hub.resume(&source, Some("old"), &auth, 0).await,
        Err(ScopedRealtimeError::Busy)
    );
}

#[test]
fn config_and_client_cap_have_no_unlimited_or_role_based_default() {
    let auth = Authorizer::yes();
    let mut cfg = config();
    cfg.maximum_clients = 1;
    let hub =
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0).unwrap();
    let tab = hub.subscribe(&auth, 0).unwrap();
    assert!(matches!(
        hub.subscribe(&auth, 0),
        Err(ScopedRealtimeError::Busy)
    ));
    drop(tab);
    assert!(hub.subscribe(&auth, 0).is_ok());
    let mut cfg = config();
    cfg.poll_interval_ms = 0;
    assert!(matches!(
        ScopedRealtimeHub::new(scope(), "generation-one".into(), None, cfg, &auth, 0),
        Err(ScopedRealtimeError::Invalid)
    ));
    let mut foreign = scope();
    foreign.principal_digest = digest(9);
    assert!(matches!(
        ScopedRealtimeHub::new(foreign, "generation-one".into(), None, config(), &auth, 0),
        Err(ScopedRealtimeError::AccessDenied)
    ));
}

#[test]
fn wire_is_notification_only_and_contains_no_financial_or_hidden_position_fields() {
    let value = serde_json::to_value(notice("opaque.signed.token")).unwrap();
    let keys: Vec<_> = value
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(
        keys,
        vec!["projection_generation", "quality", "resume_cursor"]
    );
    let mut extra = value;
    extra["quantity"] = serde_json::json!("100.0000000000001");
    assert!(serde_json::from_value::<ChangeNotice>(extra).is_err());
}
