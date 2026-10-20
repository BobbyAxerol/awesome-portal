//! Explicit `TEST_ONLY` feature: real disposable PG + loopback mTLS, no native
//! command authority/effect. No skip or implicit production database fallback.
use super::*;
use crate::pm_command_port::stored::{PgPmCommandContext, PmAssertionIssuer};

use projection_core::resources::{
    EnvelopeLimits, ResourceEnvelope, StorageLimits, StorageObservation,
};
use projection_store_pg::{command_pm::OriginalPmBinding, PgProjectionStore};
use std::sync::atomic::AtomicBool;

async fn store() -> PgProjectionStore {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PG required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    let resources = Arc::new(
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
    resources
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
    let store = PgProjectionStore::connect_with_resources(&url, resources, 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store
}

async fn prepare(store: &PgProjectionStore, ledger: &str, intent: &CommandIntent) {
    store.configure_command_ledger(ledger, 2).await.unwrap();
    let original = OriginalPmBinding::new(intent, REFERENCE, ORIGINAL_DIGEST, TARGET).unwrap();
    store
        .prepare_pm_command(ledger, intent, &original)
        .await
        .unwrap();
}

#[derive(Default)]
struct Issuer {
    calls: Mutex<Vec<(PmAction, String)>>,
    deny: AtomicBool,
}

impl PmAssertionIssuer for Issuer {
    fn issue<'a>(
        &'a self,
        _: &'a CommandIntent,
        action: PmAction,
        digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion> {
        Box::pin(async move {
            self.calls.lock().unwrap().push((action, digest.to_owned()));
            if self.deny.load(Ordering::SeqCst) {
                return Err(PmUnavailable);
            }
            // Deliberately TEST_ONLY shape, not a real issuer/grant/signature.
            HumanAssertion::new(format!("TEST_ONLY.{}.signature", &digest[7..]))
        })
    }
}

fn ledger() -> String {
    format!("TEST_ONLY.pm-context.{}", uuid::Uuid::now_v7())
}

#[tokio::test]
async fn real_pg_and_mtls_retain_full_outcome_before_receipt_and_survive_new_pool() {
    let db = store().await;
    let ledger = ledger();
    let intent = intent();
    prepare(&db, &ledger, &intent).await;
    db.claim_command(&ledger, &intent).await.unwrap().unwrap();
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let issuer = Arc::new(Issuer::default());
    let context = Arc::new(PgPmCommandContext::new(db.clone(), &ledger, issuer.clone()).unwrap());
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    let SourceReply::Receipt(receipt) = port.send(&intent).await else {
        panic!("actual PG custody ACK required before returning receipt");
    };
    // Custody is NOT generic delivery ACK: its original dispatch is untouched.
    let generic = db.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(generic.delivery, "DELIVERY_UNKNOWN");
    assert!(generic.receipt.is_none());
    let second_pool = store().await;
    let full = second_pool
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(full.authority_receipt, "TEST_ONLY-owning-receipt");
    assert_eq!(full.source_intent_digest, ORIGINAL_DIGEST);
    assert_eq!(full.target_ref, TARGET);
    assert_eq!(full.receipt, *receipt);
    let original = second_pool
        .pm_original_binding(&ledger, &intent)
        .await
        .unwrap();
    assert_eq!(original.reference(), REFERENCE);
    db.record_command_receipt(&ledger, &intent, &receipt)
        .await
        .unwrap();
    assert_eq!(issuer.calls.lock().unwrap().len(), 1);
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

struct LostCustodyAck {
    inner: PgPmCommandContext,
    lose_once: AtomicBool,
}

impl PmCommandContext for LostCustodyAck {
    fn original<'a>(&'a self, intent: &'a CommandIntent) -> ContextFuture<'a, OriginalPmCommand> {
        self.inner.original(intent)
    }

    fn assertion<'a>(
        &'a self,
        intent: &'a CommandIntent,
        action: PmAction,
        digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion> {
        self.inner.assertion(intent, action, digest)
    }

    fn retain<'a>(
        &'a self,
        intent: &'a CommandIntent,
        outcome: &'a PmOutcome,
    ) -> ContextFuture<'a, ()> {
        Box::pin(async move {
            self.inner.retain(intent, outcome).await?;
            if self.lose_once.swap(false, Ordering::SeqCst) {
                Err(PmUnavailable)
            } else {
                Ok(())
            }
        })
    }
}

#[tokio::test]
async fn custody_commit_ack_loss_remains_unknown_then_status_only_recovers_same_intent() {
    let db = store().await;
    let ledger = ledger();
    let intent = intent();
    prepare(&db, &ledger, &intent).await;
    let claim = db.claim_command(&ledger, &intent).await.unwrap().unwrap();
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let issuer = Arc::new(Issuer::default());
    let context = Arc::new(LostCustodyAck {
        inner: PgPmCommandContext::new(db.clone(), &ledger, issuer.clone()).unwrap(),
        lose_once: AtomicBool::new(true),
    });
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    assert!(matches!(port.send(&intent).await, SourceReply::Unknown));
    assert!(db
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .is_some());
    // This MUST still win; custody must not pre-empt the dispatch CAS.
    db.command_delivery(&claim, false).await.unwrap();
    assert_eq!(
        db.command_status(&ledger, &intent).await.unwrap().delivery,
        "DELIVERY_UNKNOWN"
    );
    assert!(db.claim_command(&ledger, &intent).await.unwrap().is_none());
    let SourceReply::Receipt(receipt) = port.lookup(&intent).await else {
        panic!("same-intent status with durable original facts must recover");
    };
    db.record_command_receipt(&ledger, &intent, &receipt)
        .await
        .unwrap();
    {
        let signed = issuer.calls.lock().unwrap();
        assert_eq!(signed.len(), 2);
        assert_eq!(signed[0].0, PmAction::Submit);
        assert_eq!(signed[1].0, PmAction::Status);
        assert_ne!(signed[0].1, signed[1].1);
    }
    let paths: Vec<_> = fixture
        .state
        .observed
        .lock()
        .unwrap()
        .iter()
        .map(|x| x.path.clone())
        .collect();
    assert_eq!(paths, [SUBMIT, STATUS]);
    fixture.finish().await;
}

#[tokio::test]
async fn missing_or_cross_ledger_original_never_calls_issuer_or_http() {
    let db = store().await;
    let ledger = ledger();
    let intent = intent();
    prepare(&db, &ledger, &intent).await;
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let issuer = Arc::new(Issuer::default());
    let other = format!("{ledger}.other");
    let context = Arc::new(PgPmCommandContext::new(db, &other, issuer.clone()).unwrap());
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    assert!(matches!(port.send(&intent).await, SourceReply::Unknown));
    assert!(matches!(port.lookup(&intent).await, SourceReply::Unknown));
    assert!(issuer.calls.lock().unwrap().is_empty());
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn stored_original_does_not_supply_missing_current_human_authority() {
    let db = store().await;
    let ledger = ledger();
    let intent = intent();
    prepare(&db, &ledger, &intent).await;
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let issuer = Arc::new(Issuer::default());
    issuer.deny.store(true, Ordering::SeqCst);
    let context = Arc::new(PgPmCommandContext::new(db.clone(), &ledger, issuer.clone()).unwrap());
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    assert!(matches!(port.send(&intent).await, SourceReply::Unknown));
    assert_eq!(issuer.calls.lock().unwrap().len(), 1);
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    assert!(db
        .read_pm_outcome(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
    fixture.finish().await;
}

#[tokio::test]
async fn versioned_owning_source_event_progress_retains_full_new_receipt_and_rejects_regression() {
    let db = store().await;
    let ledger = ledger();
    let intent = intent();
    prepare(&db, &ledger, &intent).await;
    db.claim_command(&ledger, &intent).await.unwrap().unwrap();
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    fixture.state.reply.lock().unwrap()["presentation"]["source_ref"] =
        json!("pma:source-event:TEST_ONLY-1");
    let context = Arc::new(
        PgPmCommandContext::new(db.clone(), &ledger, Arc::new(Issuer::default())).unwrap(),
    );
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    let SourceReply::Receipt(first) = port.send(&intent).await else {
        panic!("first receipt required")
    };
    db.record_command_receipt(&ledger, &intent, &first)
        .await
        .unwrap();
    {
        let mut value = fixture.state.reply.lock().unwrap();
        value["source_revision"] = json!(5);
        value["authority_receipt"] = json!("TEST_ONLY-owning-receipt-2");
        value["presentation"]["source_ref"] = json!("pma:source-event:TEST_ONLY-2");
        value["presentation"]["amounts"]["applied"] = json!("5.000");
        value["presentation"]["amounts"]["pending"] = json!("5.000");
        value["presentation"]["current_versions"]["budget"] = json!(3);
    }
    let SourceReply::Receipt(next) = port.lookup(&intent).await else {
        panic!("versioned recall progress must be accepted")
    };
    assert_eq!(next.revision(), 5);
    assert_eq!(next.source_ref(), "pma:source-event:TEST_ONLY-2");
    db.record_command_receipt(&ledger, &intent, &next)
        .await
        .unwrap();
    fixture.state.reply.lock().unwrap()["source_revision"] = json!(4);
    assert!(matches!(port.lookup(&intent).await, SourceReply::Unknown));
    let retained = db.read_pm_outcome(&ledger, &intent).await.unwrap().unwrap();
    assert_eq!(retained.authority_receipt, "TEST_ONLY-owning-receipt-2");
    assert_eq!(retained.receipt, *next);
    fixture.finish().await;
}
