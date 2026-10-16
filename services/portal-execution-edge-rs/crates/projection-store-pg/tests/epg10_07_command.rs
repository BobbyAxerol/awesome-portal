//! `TEST_ONLY` authority; real disposable `PostgreSQL`, never TS financial effects.
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use chrono::Utc;
use command_relay::{
    authority::{
        AccessState, Action, AuthorityError, AuthorityProvider, CommandPermission,
        CurrentAuthority, Publication, RecoveryFacts, RecoveryProvider, RevisionFence,
        UnavailableAuthority, RECOVERY_PURPOSE,
    },
    durable::{AuthorityReceipt, BusinessState, CommandIntent, CommandScope},
};
use projection_core::{
    canonical_digest,
    resources::{EnvelopeLimits, ResourceEnvelope, StorageLimits, StorageObservation},
};
use projection_store_pg::{
    command::{
        CommandPort, CommandStoreError, DurableCommandRelay, RelayError, SourceFuture, SourceReply,
    },
    PgProjectionStore,
};
use serde_json::{json, Value};
use uuid::Uuid;

fn url() -> String {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PG required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    url
}
async fn store() -> PgProjectionStore {
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
                observed_at: Utc::now(),
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
    let store = PgProjectionStore::connect_with_resources(&url(), envelope, 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store
}
fn ledger() -> String {
    format!("TEST_ONLY.{}", Uuid::now_v7())
}
fn intent(key: &str, amount: &str) -> CommandIntent {
    let payload = json!({"schema_version":"pma.capital-command.v1.1","operation":"TOP_UP",
        "idempotency_key":key,"recipient_kind":"PORTFOLIO","currency":"USDT",
        "expected_versions":{"budget":"1","source":"1","parent":"1"},
        "reason":"TEST_ONLY","amount":amount});
    from_payload(payload)
}
fn from_payload(payload: Value) -> CommandIntent {
    let scope = CommandScope::new(
        "TEST_ONLY.workspace",
        "paper",
        "TEST_ONLY.profile",
        "TEST_ONLY.authority",
        "TEST_ONLY.actor",
        "TEST_ONLY.workload",
    )
    .unwrap();
    let key = payload["idempotency_key"].as_str().unwrap().to_owned();
    let operation = payload["operation"].as_str().unwrap().to_owned();
    let digest = canonical_digest(&payload).unwrap();
    CommandIntent::new(scope, &key, &operation, payload, &digest).unwrap()
}
fn receipt(
    intent: &CommandIntent,
    revision: i64,
    state: BusinessState,
    applied: &str,
    pending: &str,
    cancelled: &str,
) -> AuthorityReceipt {
    let awaiting = matches!(
        state,
        BusinessState::PartiallyApplied | BusinessState::WaitingEncumbrance
    );
    AuthorityReceipt::new(intent,"TEST_ONLY.source",revision,state,json!({
        "command_id":"TEST_ONLY.command","state":state.as_str(),
        "amounts":{"requested":"5.000","applied":applied,"pending":pending,"cancelled":cancelled,"rejected":"0"},
        "currency":"USDT","parent_receipt":"TEST_ONLY.parent","blockers":[],
        "before_ref":"TEST_ONLY.before","after_ref":"TEST_ONLY.after","source_ref":"TEST_ONLY.source",
        "policy_ref":"TEST_ONLY.policy","binding_ref":"TEST_ONLY.binding","current_versions":{"budget":2},
        "physical_transfer_performed":false,"cli_exit_code":if awaiting {3}else if state==BusinessState::Applied {0}else {2},
        "next_action":if awaiting {"QUERY_SAME_INTENT"}else {"REVIEW_RECEIPT"}
    })).unwrap()
}

#[tokio::test]
async fn migration_reapply_and_quota_idempotent() {
    let store = store().await;
    store.migrate().await.unwrap();
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 3).await.unwrap();
    store.configure_command_ledger(&ledger, 3).await.unwrap();
    assert!(matches!(
        store.configure_command_ledger(&ledger, 4).await,
        Err(CommandStoreError::Configuration)
    ));
}
#[tokio::test]
async fn durable_prepare_replays_original_without_dispatch() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    let first = store.prepare_command(&ledger, &intent).await.unwrap();
    let second = store.prepare_command(&ledger, &intent).await.unwrap();
    assert_eq!(first.command_id, second.command_id);
    assert_eq!(second.delivery, "PREPARED");
    assert!(second.receipt.is_none());
    assert_eq!(second.intent.payload(), intent.payload());
}
#[tokio::test]
async fn same_key_different_amount_conflicts() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    store
        .prepare_command(&ledger, &intent("TEST_ONLY.key", "5.000"))
        .await
        .unwrap();
    assert!(matches!(
        store
            .prepare_command(&ledger, &intent("TEST_ONLY.key", "6"))
            .await,
        Err(CommandStoreError::Conflict)
    ));
}
#[tokio::test]
async fn concurrent_replicas_prepare_one_correlation_and_claim_one_send() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    let other = store.clone();
    let intent = intent("TEST_ONLY.key", "5.000");
    let (a, b) = tokio::join!(
        store.prepare_command(&ledger, &intent),
        other.prepare_command(&ledger, &intent)
    );
    assert_eq!(a.unwrap().command_id, b.unwrap().command_id);
    let (a, b) = tokio::join!(
        store.claim_command(&ledger, &intent),
        other.claim_command(&ledger, &intent)
    );
    assert_eq!(
        usize::from(a.unwrap().is_some()) + usize::from(b.unwrap().is_some()),
        1
    );
}
#[tokio::test]
async fn quota_is_durable_and_replay_allowed_when_full() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    let first = store.prepare_command(&ledger, &intent).await.unwrap();
    assert!(matches!(
        store
            .prepare_command(&ledger, &self::intent("TEST_ONLY.other", "5"))
            .await,
        Err(CommandStoreError::Capacity)
    ));
    assert_eq!(
        store
            .prepare_command(&ledger, &intent)
            .await
            .unwrap()
            .command_id,
        first.command_id
    );
}
#[tokio::test]
async fn crashed_sender_is_unknown_and_cannot_claim_again() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    assert!(store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_some());
    let fresh = self::store().await;
    assert_eq!(
        fresh
            .command_status(&ledger, &intent)
            .await
            .unwrap()
            .delivery,
        "DELIVERY_UNKNOWN"
    );
    assert!(fresh
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
}
#[tokio::test]
async fn accepted_is_not_applied_and_token_cannot_be_reused() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    let claim = store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    store.command_delivery(&claim, true).await.unwrap();
    let record = store.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(record.delivery, "ACKNOWLEDGED");
    assert!(record.receipt.is_none());
    assert!(matches!(
        store.command_delivery(&claim, false).await,
        Err(CommandStoreError::Fence)
    ));
}
#[tokio::test]
async fn lost_response_recovery_preserves_full_receipt_after_restart() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    let claim = store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    store.command_delivery(&claim, false).await.unwrap();
    let authoritative = receipt(&intent, 1, BusinessState::Applied, "5", "0", "0");
    store
        .record_command_receipt(&ledger, &intent, &authoritative)
        .await
        .unwrap();
    let fresh = self::store().await;
    let restored = fresh.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(restored.receipt.unwrap().payload(), authoritative.payload());
    assert!(fresh
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
}
#[tokio::test]
async fn pending_then_partial_cancel_preserves_original_partition() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let mut payload = intent("TEST_ONLY.key", "5.000").payload().clone();
    payload["operation"] = json!("RECALL_PARTIAL");
    payload["expected_versions"]["book"] = json!("1");
    let intent = from_payload(payload);
    store.prepare_command(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    store
        .record_command_receipt(
            &ledger,
            &intent,
            &receipt(&intent, 1, BusinessState::PartiallyApplied, "2", "3", "0"),
        )
        .await
        .unwrap();
    let final_receipt = receipt(
        &intent,
        2,
        BusinessState::PartiallyAppliedCancelled,
        "2",
        "0",
        "3",
    );
    let final_record = store
        .record_command_receipt(&ledger, &intent, &final_receipt)
        .await
        .unwrap();
    assert_eq!(
        final_record.receipt.unwrap().payload()["amounts"],
        json!({"requested":"5.000","applied":"2","pending":"0","cancelled":"3","rejected":"0"})
    );
}
#[tokio::test]
async fn stale_revision_and_same_revision_changed_payload_are_rejected() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    let applied = receipt(&intent, 2, BusinessState::Applied, "5", "0", "0");
    store
        .record_command_receipt(&ledger, &intent, &applied)
        .await
        .unwrap();
    assert!(store
        .record_command_receipt(
            &ledger,
            &intent,
            &receipt(&intent, 1, BusinessState::Applied, "5", "0", "0")
        )
        .await
        .is_err());
    let mut changed = applied.payload().clone();
    changed["after_ref"] = json!("TEST_ONLY.different");
    let changed = AuthorityReceipt::new(
        &intent,
        "TEST_ONLY.source",
        2,
        BusinessState::Applied,
        changed,
    )
    .unwrap();
    assert!(store
        .record_command_receipt(&ledger, &intent, &changed)
        .await
        .is_err());
}
#[tokio::test]
async fn receipt_cannot_attach_to_other_intent_or_undispatched_intent() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    let intent = intent("TEST_ONLY.key", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    let receipt = receipt(&intent, 1, BusinessState::Applied, "5", "0", "0");
    assert!(matches!(
        store
            .record_command_receipt(&ledger, &intent, &receipt)
            .await,
        Err(CommandStoreError::Fence)
    ));
    let other = self::intent("TEST_ONLY.other", "5");
    store.prepare_command(&ledger, &other).await.unwrap();
    store.claim_command(&ledger, &other).await.unwrap().unwrap();
    assert!(matches!(
        store
            .record_command_receipt(&ledger, &other, &receipt)
            .await,
        Err(CommandStoreError::Invalid)
    ));
}
#[tokio::test]
async fn ungoverned_pool_cannot_open_command_store() {
    let store = PgProjectionStore::connect(&url()).await.unwrap();
    assert!(matches!(
        store.configure_command_ledger(&ledger(), 1).await,
        Err(CommandStoreError::Ungoverned)
    ));
}

// Synthetic trust and commit port are explicit fixtures, not an HTTP assertion
// verifier or a source of real economic authority.
#[derive(Clone, Default)]
struct TestAuthority {
    revoked: Arc<AtomicBool>,
    stale: Arc<AtomicBool>,
    unpublished: Arc<AtomicBool>,
    calls: Arc<AtomicUsize>,
    revoke_at: Arc<AtomicUsize>,
}
impl AuthorityProvider for TestAuthority {
    fn current(
        &self,
        intent: &CommandIntent,
        _: Action,
        now: i64,
    ) -> Result<CurrentAuthority, AuthorityError> {
        let call = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
        if self.revoke_at.load(Ordering::SeqCst) != 0
            && call >= self.revoke_at.load(Ordering::SeqCst)
        {
            self.revoked.store(true, Ordering::SeqCst);
        }
        let fence = || RevisionFence {
            asserted: "1".into(),
            current: "1".into(),
        };
        let mut versions: BTreeMap<String, String> =
            serde_json::from_value(intent.payload()["expected_versions"].clone()).unwrap();
        if self.stale.load(Ordering::SeqCst) {
            versions.insert("budget".into(), "2".into());
        }
        Ok(CurrentAuthority {
            scope: intent.scope().clone(),
            requester_actor_id: intent.scope().actor_id().into(),
            requester_workload_id: intent.scope().workload_id().into(),
            operation: intent.operation().into(),
            key: intent.key().into(),
            payload_digest: intent.digest().into(),
            request_digest: intent.request_digest().into(),
            issued_at_ms: now,
            expires_at_ms: now + 60_000,
            session: fence(),
            membership: fence(),
            policy: fence(),
            access: if self.revoked.load(Ordering::SeqCst) {
                AccessState::Revoked
            } else {
                AccessState::Current
            },
            permission: CommandPermission::SubmitAndStatus,
            publication: if self.unpublished.load(Ordering::SeqCst) {
                Publication::Unpublished
            } else {
                Publication::Published
            },
            current_versions: versions,
        })
    }
}
#[derive(Clone, Default)]
struct TestPort {
    effects: Arc<AtomicUsize>,
    lookups: Arc<AtomicUsize>,
    committed: Arc<Mutex<Option<AuthorityReceipt>>>,
    ack_only: bool,
    hang: bool,
    started: Arc<AtomicBool>,
    revoke_before_commit: Option<Arc<AtomicBool>>,
}
impl CommandPort for TestPort {
    fn send<'a>(&'a self, intent: &'a CommandIntent) -> SourceFuture<'a> {
        Box::pin(async move {
            // TEST_ONLY commit-side authority fence, not a real TS provider.
            if let Some(revoked) = &self.revoke_before_commit {
                revoked.store(true, Ordering::SeqCst);
                return SourceReply::Unknown;
            }
            if self.hang {
                self.started.store(true, Ordering::SeqCst);
                std::future::pending::<()>().await;
            }
            if self.ack_only {
                return SourceReply::Acknowledged;
            }
            // TEST_ONLY source commits, THEN drops its response. This models the
            // fault, not actual money; the CAS must prevent a second send.
            self.effects.fetch_add(1, Ordering::SeqCst);
            *self.committed.lock().unwrap() =
                Some(receipt(intent, 1, BusinessState::Applied, "5", "0", "0"));
            SourceReply::Unknown
        })
    }
    fn lookup<'a>(&'a self, _: &'a CommandIntent) -> SourceFuture<'a> {
        Box::pin(async move {
            self.lookups.fetch_add(1, Ordering::SeqCst);
            self.committed
                .lock()
                .unwrap()
                .clone()
                .map_or(SourceReply::Unknown, |receipt| {
                    SourceReply::Receipt(Box::new(receipt))
                })
        })
    }
}
async fn relay(
    authority: TestAuthority,
    port: TestPort,
) -> (DurableCommandRelay<TestAuthority, TestPort>, String) {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 10).await.unwrap();
    let relay = DurableCommandRelay::new(
        store,
        &ledger,
        authority,
        port,
        4,
        Duration::from_millis(100),
    )
    .unwrap();
    relay.set_sends_enabled(true);
    (relay, ledger)
}

#[tokio::test]
async fn t07_01_commit_response_loss_restart_same_key_one_effect() {
    let authority = TestAuthority::default();
    let port = TestPort::default();
    let (relay, ledger) = relay(authority.clone(), port.clone()).await;
    let intent = intent("TEST_ONLY.key", "5.000");
    assert_eq!(
        relay.submit(&intent).await.unwrap().delivery,
        "DELIVERY_UNKNOWN"
    );
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
    drop(relay);
    let restarted = DurableCommandRelay::new(
        store().await,
        &ledger,
        authority.clone(),
        port.clone(),
        4,
        Duration::from_millis(100),
    )
    .unwrap();
    // Real TS versions may already advance after commit: replay/status must not
    // incorrectly demand that old expected versions remain current.
    authority.stale.store(true, Ordering::SeqCst);
    restarted.set_sends_enabled(true);
    assert_eq!(
        restarted.submit(&intent).await.unwrap().delivery,
        "DELIVERY_UNKNOWN"
    );
    let recovered = restarted.status(&intent, true).await.unwrap();
    assert_eq!(recovered.receipt.unwrap().state(), BusinessState::Applied);
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
    assert_eq!(port.lookups.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn t08_revoked_after_durable_prepare_or_claim_sends_no_effect() {
    for point in [3, 4] {
        let store = store().await;
        let ledger = ledger();
        store.configure_command_ledger(&ledger, 10).await.unwrap();
        let authority = TestAuthority::default();
        authority.revoke_at.store(point, Ordering::SeqCst);
        let port = TestPort::default();
        let relay = DurableCommandRelay::new(
            store.clone(),
            &ledger,
            authority,
            port.clone(),
            4,
            Duration::from_millis(100),
        )
        .unwrap();
        relay.set_sends_enabled(true);
        let intent = intent("TEST_ONLY.revoke-durable", "5");
        assert!(matches!(
            relay.submit(&intent).await,
            Err(RelayError::Authority(_))
        ));
        assert_eq!(port.effects.load(Ordering::SeqCst), 0);
        let durable = store.command_status(&ledger, &intent).await.unwrap();
        // A won dispatch CAS is never reopened for automatic send, even when
        // this process knows it denied before transport. Recovery stays safe.
        assert_eq!(
            durable.delivery,
            if point == 3 {
                "PREPARED"
            } else {
                "DELIVERY_UNKNOWN"
            }
        );
        assert!(durable.receipt.is_none());
    }
}

#[tokio::test]
async fn t08_test_only_source_commit_fence_is_not_replaced_by_edge_dispatch_check() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 10).await.unwrap();
    let authority = TestAuthority::default();
    let port = TestPort {
        revoke_before_commit: Some(authority.revoked.clone()),
        ..TestPort::default()
    };
    let relay = DurableCommandRelay::new(
        store.clone(),
        &ledger,
        authority,
        port.clone(),
        4,
        Duration::from_millis(100),
    )
    .unwrap();
    relay.set_sends_enabled(true);
    let intent = intent("TEST_ONLY.source-fence", "5");
    assert!(matches!(
        relay.submit(&intent).await,
        Err(RelayError::Authority(_))
    ));
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
    let durable = store.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(durable.delivery, "DELIVERY_UNKNOWN");
    assert!(durable.receipt.is_none());
    // No native TS transaction occurred; full T08-01 still needs actual owner
    // commit-lease evidence. A post-send error is never rewritten to REJECTED.
}
#[tokio::test]
async fn t07_02_relay_conflict_never_sends_another_payload() {
    let port = TestPort::default();
    let (relay, _) = relay(TestAuthority::default(), port.clone()).await;
    relay
        .submit(&intent("TEST_ONLY.key", "5.000"))
        .await
        .unwrap();
    assert!(matches!(
        relay.submit(&intent("TEST_ONLY.key", "6")).await,
        Err(RelayError::Store(CommandStoreError::Conflict))
    ));
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn t07_03_stale_or_revoked_or_unpublished_never_sends() {
    let authority = TestAuthority::default();
    let port = TestPort::default();
    let (relay, _) = relay(authority.clone(), port.clone()).await;
    authority.stale.store(true, Ordering::SeqCst);
    assert!(relay.submit(&intent("TEST_ONLY.stale", "5")).await.is_err());
    authority.stale.store(false, Ordering::SeqCst);
    authority.revoked.store(true, Ordering::SeqCst);
    assert!(relay
        .submit(&intent("TEST_ONLY.revoked", "5"))
        .await
        .is_err());
    authority.revoked.store(false, Ordering::SeqCst);
    authority.unpublished.store(true, Ordering::SeqCst);
    assert!(relay
        .submit(&intent("TEST_ONLY.unpublished", "5"))
        .await
        .is_err());
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn t07_04_transport_ack_never_becomes_applied() {
    let port = TestPort {
        ack_only: true,
        ..TestPort::default()
    };
    let (relay, _) = relay(TestAuthority::default(), port.clone()).await;
    let record = relay.submit(&intent("TEST_ONLY.key", "5")).await.unwrap();
    assert_eq!(record.delivery, "ACKNOWLEDGED");
    assert!(record.receipt.is_none());
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn t07_06_missing_authority_no_sql_or_cli_fallback() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    let port = TestPort::default();
    let relay = DurableCommandRelay::new(
        store,
        &ledger,
        UnavailableAuthority,
        port.clone(),
        1,
        Duration::from_millis(100),
    )
    .unwrap();
    relay.set_sends_enabled(true);
    assert!(relay.submit(&intent("TEST_ONLY.key", "5")).await.is_err());
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
}
#[tokio::test]
async fn rollback_disables_new_sends_but_preserves_authorized_recovery() {
    let authority = TestAuthority::default();
    let port = TestPort::default();
    let (relay, _) = relay(authority.clone(), port.clone()).await;
    let intent = intent("TEST_ONLY.key", "5");
    relay.submit(&intent).await.unwrap();
    relay.set_sends_enabled(false);
    assert!(matches!(
        relay.submit(&self::intent("TEST_ONLY.new", "5")).await,
        Err(RelayError::Disabled)
    ));
    assert_eq!(
        relay
            .status(&intent, true)
            .await
            .unwrap()
            .receipt
            .unwrap()
            .state(),
        BusinessState::Applied
    );
    authority.revoked.store(true, Ordering::SeqCst);
    assert!(relay.status(&intent, false).await.is_err());
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
}
#[tokio::test]
async fn source_timeout_is_unknown_and_never_blindly_retried() {
    let port = TestPort {
        hang: true,
        ..TestPort::default()
    };
    let (relay, _) = relay(TestAuthority::default(), port.clone()).await;
    let intent = intent("TEST_ONLY.key", "5");
    assert_eq!(
        relay.submit(&intent).await.unwrap().delivery,
        "DELIVERY_UNKNOWN"
    );
    assert_eq!(
        relay.submit(&intent).await.unwrap().delivery,
        "DELIVERY_UNKNOWN"
    );
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
}

struct TestRecovery;
impl RecoveryProvider for TestRecovery {
    fn current(&self, intent: &CommandIntent, now: i64) -> Result<RecoveryFacts, AuthorityError> {
        Ok(RecoveryFacts {
            scope: intent.scope().clone(),
            workload_id: "TEST_ONLY.recovery-service".into(),
            purpose: RECOVERY_PURPOSE.into(),
            request_digest: intent.request_digest().into(),
            issued_at_ms: now,
            expires_at_ms: now + 60_000,
            revision: RevisionFence {
                asserted: "1".into(),
                current: "1".into(),
            },
            access: AccessState::Current,
        })
    }
}
#[tokio::test]
async fn private_recovery_survives_revoked_human_without_disclosing_receipt() {
    let authority = TestAuthority::default();
    let port = TestPort::default();
    let (relay, ledger) = relay(authority.clone(), port.clone()).await;
    let intent = intent("TEST_ONLY.key", "5");
    relay.submit(&intent).await.unwrap();
    relay.set_sends_enabled(false);
    authority.revoked.store(true, Ordering::SeqCst);
    assert!(relay.status(&intent, true).await.is_err());
    relay.recover(&intent, &TestRecovery).await.unwrap();
    assert!(relay.status(&intent, false).await.is_err());
    // Private test inspection only: service recovery persisted, did not resend.
    assert_eq!(
        store()
            .await
            .command_status(&ledger, &intent)
            .await
            .unwrap()
            .receipt
            .unwrap()
            .state(),
        BusinessState::Applied
    );
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn separate_process_restores_the_committed_receipt() {
    let intent = intent("TEST_ONLY.process-key", "5.000");
    if let Ok(ledger) = std::env::var("EPG10_07_CHILD_LEDGER") {
        assert!(ledger.starts_with("TEST_ONLY."));
        let store = store().await;
        let record = store.command_status(&ledger, &intent).await.unwrap();
        assert_eq!(record.receipt.unwrap().state(), BusinessState::Applied);
        assert!(store
            .claim_command(&ledger, &intent)
            .await
            .unwrap()
            .is_none());
        return;
    }
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 1).await.unwrap();
    store.prepare_command(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    store
        .record_command_receipt(
            &ledger,
            &intent,
            &receipt(&intent, 1, BusinessState::Applied, "5", "0", "0"),
        )
        .await
        .unwrap();
    drop(store);
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "separate_process_restores_the_committed_receipt",
            "--test-threads=1",
        ])
        .env("EPG10_07_CHILD_LEDGER", ledger)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "separate process receipt recovery failed"
    );
    assert!(output.stdout.len() < 65536 && output.stderr.len() < 65536);
}

#[tokio::test]
async fn async_source_admission_is_fail_fast_without_waiter_queue() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    let port = TestPort {
        hang: true,
        ..TestPort::default()
    };
    let relay = Arc::new(
        DurableCommandRelay::new(
            store,
            &ledger,
            TestAuthority::default(),
            port.clone(),
            1,
            Duration::from_secs(2),
        )
        .unwrap(),
    );
    relay.set_sends_enabled(true);
    let other = Arc::clone(&relay);
    let first = tokio::spawn(async move { other.submit(&intent("TEST_ONLY.first", "5")).await });
    for _ in 0..1000 {
        if port.started.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
    assert!(port.started.load(Ordering::SeqCst));
    assert!(matches!(
        relay.submit(&intent("TEST_ONLY.second", "5")).await,
        Err(RelayError::Busy)
    ));
    assert_eq!(first.await.unwrap().unwrap().delivery, "DELIVERY_UNKNOWN");
}
