//! `TEST_ONLY` command authority/effect; persistence and competing readers use PG.
//! No PM network port, native COMMIT lease or broker action is impersonated.
use super::*;

#[tokio::test]
async fn t09_restart_recovery_preserves_full_receipt_actor_and_single_effect() {
    let authority = TestAuthority::default();
    let port = TestPort::default();
    let (first, ledger) = relay(authority.clone(), port.clone()).await;
    let intent = intent("TEST_ONLY.e2e", "5.000");
    let prepared = first.submit(&intent).await.unwrap();
    assert_eq!(prepared.delivery, "DELIVERY_UNKNOWN");
    drop(first);
    let persisted = store()
        .await
        .command_status(&ledger, &intent)
        .await
        .unwrap();
    assert_eq!(persisted.intent.scope().actor_id(), "TEST_ONLY.actor");
    assert_eq!(persisted.intent.scope().workload_id(), "TEST_ONLY.workload");
    assert_eq!(persisted.command_id, prepared.command_id);
    let restarted = DurableCommandRelay::new(
        store().await,
        &ledger,
        authority.clone(),
        port.clone(),
        4,
        Duration::from_millis(100),
    )
    .unwrap();
    restarted.set_sends_enabled(true);
    let recovered = restarted.status(&intent, true).await.unwrap();
    let expected = port.committed.lock().unwrap().clone().unwrap();
    assert_eq!(recovered.receipt.unwrap().payload(), expected.payload());
    assert_eq!(
        restarted.submit(&intent).await.unwrap().command_id,
        prepared.command_id
    );
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
    authority.revoked.store(true, Ordering::SeqCst);
    assert!(matches!(
        restarted.status(&intent, true).await,
        Err(RelayError::Authority(_))
    ));
    assert_eq!(port.effects.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn t09_receipt_durable_commit_rollback_cannot_fabricate_terminal_state() {
    let store = store().await;
    let ledger = ledger();
    store.configure_command_ledger(&ledger, 2).await.unwrap();
    let intent = intent("TEST_ONLY.e2e-rollback", "5.000");
    store.prepare_command(&ledger, &intent).await.unwrap();
    store
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .unwrap();
    // A competing process sees durable UNKNOWN before an authority receipt.
    let other = self::store().await;
    assert!(other
        .command_status(&ledger, &intent)
        .await
        .unwrap()
        .receipt
        .is_none());
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(1)
        .connect(&url())
        .await
        .unwrap();
    let mut tx = pool.begin().await.unwrap();
    sqlx::query(
        "UPDATE portal_projection.command_relay SET delivery='ACKNOWLEDGED' WHERE ledger_id=$1",
    )
    .bind(&ledger)
    .execute(&mut *tx)
    .await
    .unwrap();
    assert_eq!(
        other
            .command_status(&ledger, &intent)
            .await
            .unwrap()
            .delivery,
        "DELIVERY_UNKNOWN"
    );
    tx.rollback().await.unwrap();
    assert_eq!(
        other
            .command_status(&ledger, &intent)
            .await
            .unwrap()
            .delivery,
        "DELIVERY_UNKNOWN"
    );
    let full = receipt(&intent, 1, BusinessState::Applied, "5", "0", "0");
    store
        .record_command_receipt(&ledger, &intent, &full)
        .await
        .unwrap();
    let known = other.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(known.receipt.unwrap().payload(), full.payload());
    // Lower/reused conflicting receipt cannot roll back a known terminal fact.
    let mut conflicting = full.payload().clone();
    conflicting["after_ref"] = json!("TEST_ONLY.conflicting");
    let invalid = AuthorityReceipt::new(
        &intent,
        "TEST_ONLY.source",
        1,
        BusinessState::Applied,
        conflicting,
    )
    .unwrap();
    assert!(store
        .record_command_receipt(&ledger, &intent, &invalid)
        .await
        .is_err());
    assert_eq!(
        other
            .command_status(&ledger, &intent)
            .await
            .unwrap()
            .receipt
            .unwrap()
            .payload(),
        full.payload()
    );
}

#[tokio::test]
async fn t09_unknown_ack_restart_disabled_send_is_not_rejection_or_retry() {
    let authority = TestAuthority::default();
    let port = TestPort {
        ack_only: true,
        ..TestPort::default()
    };
    let (first, ledger) = relay(authority.clone(), port.clone()).await;
    let intent = intent("TEST_ONLY.e2e-ack", "5.000");
    first.submit(&intent).await.unwrap();
    drop(first);
    let restarted = DurableCommandRelay::new(
        store().await,
        &ledger,
        authority,
        port.clone(),
        4,
        Duration::from_millis(100),
    )
    .unwrap();
    let record = restarted.status(&intent, true).await.unwrap();
    assert!(record.receipt.is_none());
    assert_ne!(record.delivery, "REJECTED");
    assert!(restarted
        .submit(&self::intent("TEST_ONLY.e2e-new", "5"))
        .await
        .is_err());
    assert_eq!(port.effects.load(Ordering::SeqCst), 0);
}
