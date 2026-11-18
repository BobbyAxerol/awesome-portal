//! Cross-module `TEST_ONLY` producer -> real PG -> scoped query/history/replay.
//! This is not native publication, network failover or Research/BFF acceptance.
use super::*;

async fn current(f: &Fixture) -> Vec<(String, Value)> {
    let read = f.read(&f.scope(None), Operation::Current);
    f.service()
        .page(&read, &Fixture::query(Operation::Current, 200), None)
        .await
        .unwrap()
        .rows
        .into_iter()
        .map(|row| (row.entity_id, row.payload))
        .collect()
}

fn group(f: &Fixture, events: Vec<DeltaEvent>) -> (DeltaChunk, DeltaGroup) {
    let chunk = DeltaChunk {
        generation: f.h.manifest().generation,
        group_id: format!("TEST_ONLY.e2e.{}", Uuid::now_v7()),
        index: 0,
        events,
    };
    let group = DeltaGroup {
        generation: chunk.generation,
        group_id: chunk.group_id.clone(),
        from_cursor: f.tail.clone(),
        to_cursor: format!("TEST_ONLY.e2e.cursor.{}", Uuid::now_v7()),
        chunk_digests: vec![chunk.digest().unwrap()],
        events_digest: events_digest(&chunk.events).unwrap(),
        reached_catchup: false,
    };
    (chunk, group)
}

#[tokio::test]
async fn t09_atomic_group_ack_loss_reconnect_query_history_and_replay() {
    let mut f = Fixture::new(2).await;
    let before = current(&f).await;
    let scope = f.scope(None);
    let replay = f.read(&scope, Operation::Replay);
    let cursor = f
        .service()
        .notices(&replay, None, 20)
        .await
        .unwrap()
        .next_cursor;
    let (chunk, group) = group(
        &f,
        vec![f.event(1, "order_0000", 2), f.event(2, "order_0001", 2)],
    );
    let binding = &f.h.manifest().binding;
    f.store
        .bootstrap_stage_delta(&f.h, &verified(&chunk, binding, "CHUNK"), NOW)
        .await
        .unwrap();
    assert_eq!(current(&f).await, before); // staged chunks are not economic facts
    assert!(f
        .service()
        .notices(&replay, cursor.as_deref(), 20)
        .await
        .unwrap()
        .notices
        .is_empty());
    let ack = f
        .store
        .bootstrap_commit_group(&f.h, &verified(&group, binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(ack.cursor(), group.to_cursor);
    // Drop this store connection set as if the response was lost. The protocol
    // handle is immutable input, not reconstructed from MAX(event_id).
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap();
    f.store = Arc::new(PgProjectionStore::connect(&url).await.unwrap());
    let binding = &f.h.manifest().binding;
    let retry = f
        .store
        .bootstrap_commit_group(&f.h, &verified(&group, binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(retry.cursor(), ack.cursor());
    let checkpoint = f
        .store
        .bootstrap_checkpoint(&f.h, &verified(binding, binding, "CONTROL"), NOW)
        .await
        .unwrap();
    assert_eq!(checkpoint.cursor(), ack.cursor());
    let after = current(&f).await;
    assert_eq!(after.len(), 2);
    assert_eq!(after[0].1["amount"], "1.000000000000000001");
    assert_eq!(after[1].1["amount"], "2.000000000000000001");
    let history = f.read(&scope, Operation::History);
    assert_eq!(
        f.service()
            .page(&history, &Fixture::query(Operation::History, 200), None)
            .await
            .unwrap()
            .rows
            .len(),
        2
    );
    let replayed = f
        .service()
        .notices(&replay, cursor.as_deref(), 20)
        .await
        .unwrap();
    assert_eq!(replayed.notices.len(), 1); // one committed group, not two ACKs
    assert!(replayed.caught_up);
}

#[tokio::test]
async fn t09_resync_new_generation_same_digest_old_cursor_cannot_cross() {
    let mut f = Fixture::new(2).await;
    f.append(vec![f.event(1, "order_0000", 2)]).await;
    let expected = hash(&current(&f).await);
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Current);
    let old_cursor = f
        .service()
        .page(&read, &Fixture::query(Operation::Current, 1), None)
        .await
        .unwrap()
        .next_cursor;
    let binding = &f.h.manifest().binding;
    let raw = f
        .store
        .bootstrap_read(&verified(binding, binding, "READ"), None, 200, NOW)
        .await
        .unwrap();
    f.store
        .bootstrap_require_resync(&f.h, &verified(binding, binding, "CONTROL"), NOW)
        .await
        .unwrap();
    assert!(f
        .service()
        .page(&read, &Fixture::query(Operation::Current, 200), None)
        .await
        .is_err());
    let mut manifest = f.h.manifest().clone();
    manifest.generation = Uuid::now_v7();
    manifest.snapshot_id = "TEST_ONLY.resync".into();
    manifest.delta_start = "TEST_ONLY.resync-start".into();
    manifest.catchup_cursor.clone_from(&manifest.delta_start);
    let page = SnapshotPage {
        generation: manifest.generation,
        dataset: "orders".into(),
        index: 0,
        previous_digest: page_seed(&manifest, "orders").unwrap(),
        rows: raw.rows,
    };
    manifest.pages.insert(
        "orders".into(),
        PagePlan {
            count: 1,
            final_digest: page.chain_digest().unwrap(),
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
    let h = f
        .store
        .bootstrap_begin(
            &verified(&manifest, &manifest.binding, "MANIFEST"),
            limits,
            NOW,
        )
        .await
        .unwrap();
    f.store
        .bootstrap_stage_page(&h, &verified(&page, &manifest.binding, "PAGE"), NOW)
        .await
        .unwrap();
    f.store
        .bootstrap_finish_snapshot(
            &h,
            &verified(&manifest.binding, &manifest.binding, "CONTROL"),
            NOW,
        )
        .await
        .unwrap();
    f.h = h;
    assert_eq!(hash(&current(&f).await), expected);
    assert!(f
        .service()
        .page(
            &read,
            &Fixture::query(Operation::Current, 1),
            old_cursor.as_deref()
        )
        .await
        .is_err());
}

#[tokio::test]
async fn t09_correction_tombstone_history_and_realtime_converge() {
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
    let mut client = hub.subscribe(f.policy.as_ref(), NOW).unwrap();
    hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
    let original = f.event(1, "order_0000", 2);
    f.append(vec![original.clone()]).await;
    let mut correction = f.event(2, "order_0000", 3);
    correction.event.operation = EventOperation::Correction;
    correction.event.correction_of_event_id = Some(original.event.event_id.clone());
    f.append(vec![correction.clone()]).await;
    let mut tombstone = f.event(3, "order_0000", 4);
    tombstone.event.operation = EventOperation::Tombstone;
    tombstone.event.tombstone_of_event_id = Some(correction.event.event_id);
    f.append(vec![tombstone]).await;
    hub.hint().unwrap();
    hub.poll(&source, f.policy.as_ref(), NOW).await.unwrap();
    assert!(matches!(
        client.next(f.policy.as_ref(), NOW).unwrap(),
        ScopedDelivery::Notice(_)
    ));
    assert!(current(&f).await.is_empty());
    let history = f.read(&scope, Operation::History);
    let page = f
        .service()
        .page(&history, &Fixture::query(Operation::History, 200), None)
        .await
        .unwrap();
    assert_eq!(page.rows.len(), 3);
    let wire = serde_json::to_string(&page).unwrap();
    assert!(!wire.contains("hidden_balance"));
    assert!(!wire.contains("source_global_"));
    assert!(page.rows.iter().any(|row| row.correction_of.is_some()));
}

#[tokio::test]
async fn t09_unavailable_command_does_not_block_independent_read_and_revoke_stops_it() {
    let f = Fixture::new(2).await;
    let scope = f.scope(None);
    let read = f.read(&scope, Operation::Export);
    let page = f
        .service()
        .page(&read, &Fixture::query(Operation::Export, 1), None)
        .await
        .unwrap();
    // This read-only projection has no command resource authority. Refusing
    // that independent plane must not poison a qualified read.
    assert!(f
        .store
        .configure_command_ledger("TEST_ONLY.unbound", 1)
        .await
        .is_err());
    assert_eq!(current(&f).await.len(), 2);
    let mut wrong_scope = scope.clone();
    wrong_scope.model_revision = "TEST_ONLY.policy-pending".into();
    let wrong = f.read(&wrong_scope, Operation::Export);
    assert!(f
        .service()
        .page(
            &wrong,
            &Fixture::query(Operation::Export, 1),
            page.next_cursor.as_deref()
        )
        .await
        .is_err());
    f.policy.enabled.store(false, Ordering::SeqCst);
    assert!(f
        .service()
        .page(
            &read,
            &Fixture::query(Operation::Export, 1),
            page.next_cursor.as_deref()
        )
        .await
        .is_err());
}
