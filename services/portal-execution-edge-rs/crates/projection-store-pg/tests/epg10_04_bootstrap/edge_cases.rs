//! Additional `TEST_ONLY` disposable-PG integrity/recovery cases, not publication.

use super::*;

async fn seed_history(
    store: &PgProjectionStore,
    h: &BootstrapHandle,
    name: &str,
    events: Vec<DeltaEvent>,
) {
    let history = DeltaChunk {
        generation: h.manifest().generation,
        group_id: name.to_owned(),
        index: 0,
        events,
    };
    store
        .bootstrap_backfill_history(h, &seal(&history, &h.manifest().binding, "HISTORY"), NOW)
        .await
        .unwrap();
}

#[tokio::test]
async fn page_chain_replay_order_and_changed_digest_are_atomic() {
    let (store, pool) = db().await;
    let mut expected = vec![account("account_1")];
    expected.extend((0..201).map(|i| order(&format!("order_{i:03}"), 1)));
    let (manifest, pages) = fixture(binding(), &expected, true);
    let h = start(&store, &manifest).await;
    assert!(matches!(
        store
            .bootstrap_checkpoint(
                &h,
                &seal(&manifest.binding, &manifest.binding, "CONTROL"),
                NOW
            )
            .await,
        Err(BootstrapError::Resync)
    ));
    let order_pages: Vec<_> = pages
        .iter()
        .filter(|page| page.dataset == "orders")
        .collect();
    assert_eq!(order_pages.len(), 2);
    assert!(matches!(
        store
            .bootstrap_stage_page(&h, &seal(order_pages[1], &manifest.binding, "PAGE"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    for _ in 0..2 {
        store
            .bootstrap_stage_page(&h, &seal(order_pages[0], &manifest.binding, "PAGE"), NOW)
            .await
            .unwrap();
    }
    let mut changed = (*order_pages[0]).clone();
    changed.rows[0].payload["amount"] = json!("81.0000");
    assert!(matches!(
        store
            .bootstrap_stage_page(&h, &seal(&changed, &manifest.binding, "PAGE"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    let progress: i64 = sqlx::query_scalar("SELECT completed_pages FROM portal_projection.bootstrap_datasets WHERE generation=$1 AND dataset='orders'")
        .bind(manifest.generation).fetch_one(&pool).await.unwrap();
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!((progress, count), (1, 200));
    stage_pages(&store, &h, &pages).await;
    assert!(finish(&store, &h).await.is_some());
    expected.sort_by(|a, b| (&a.dataset, &a.entity_id).cmp(&(&b.dataset, &b.entity_id)));
    assert_eq!(read_all(&store, &manifest.binding).await, expected);
}

#[tokio::test]
async fn resume_limits_and_control_value_are_exactly_bound() {
    let (store, pool) = db().await;
    let h = ready(&store, binding(), &[account("account_1")]).await;
    let b = &h.manifest().binding;
    let mut drift = limits();
    drift.page_rows -= 1;
    assert!(matches!(
        store
            .bootstrap_begin(&seal(h.manifest(), b, "MANIFEST"), drift, NOW)
            .await,
        Err(BootstrapError::Resync)
    ));
    let mut wrong = b.clone();
    wrong.policy_revision = "policy_wrong_value".to_owned();
    // Valid fixture authentication context, but wrong CONTROL value itself.
    let wrong_value = seal(&wrong, b, "CONTROL");
    assert!(matches!(
        store.bootstrap_finish_snapshot(&h, &wrong_value, NOW).await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    assert!(matches!(
        store.bootstrap_require_resync(&h, &wrong_value, NOW).await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    let wrong_context = seal(b, &wrong, "CONTROL");
    assert!(matches!(
        store.bootstrap_checkpoint(&h, &wrong_context, NOW).await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    assert_eq!(checkpoint(&store, &h).await, h.manifest().delta_start);
    assert_eq!(fact_count(&pool, &h).await, 0);
    assert_eq!(read_all(&store, b).await, vec![account("account_1")]);
}

#[tokio::test]
async fn completed_snapshot_finish_and_expired_ready_resume_are_idempotent() {
    let (store, pool) = db().await;
    let (manifest, pages) = fixture(binding(), &[account("account_1")], false);
    let h = start(&store, &manifest).await;
    stage_pages(&store, &h, &pages).await;
    assert!(finish(&store, &h).await.is_none());
    assert!(finish(&store, &h).await.is_none());
    let (catchup, _) = group(
        &h,
        "empty_catchup",
        &manifest.delta_start,
        &manifest.catchup_cursor,
        vec![],
        true,
    );
    commit(&store, &h, &catchup).await;
    assert_eq!(
        finish(&store, &h).await.unwrap().cursor(),
        manifest.catchup_cursor
    );
    let later = manifest.rollback_until_ms + 1;
    assert!(later > manifest.expires_at_ms);
    let resumed = store
        .bootstrap_begin(
            &seal_at(&manifest, &manifest.binding, "MANIFEST", later),
            limits(),
            later,
        )
        .await
        .unwrap();
    let update = event(
        &resumed,
        1,
        "orders",
        "order_later",
        1,
        order("order_later", 1).payload,
    );
    let (tail, chunks) = group(
        &resumed,
        "tail_after_expiry",
        &manifest.catchup_cursor,
        "opaque_after_expiry",
        vec![vec![update]],
        false,
    );
    for chunk in &chunks {
        store
            .bootstrap_stage_delta(
                &resumed,
                &seal_at(chunk, &manifest.binding, "CHUNK", later),
                later,
            )
            .await
            .unwrap();
    }
    let ack = store
        .bootstrap_commit_group(
            &resumed,
            &seal_at(&tail, &manifest.binding, "GROUP", later),
            later,
        )
        .await
        .unwrap();
    assert_eq!(ack.cursor(), "opaque_after_expiry");
    let again = store
        .bootstrap_finish_snapshot(
            &resumed,
            &seal_at(&manifest.binding, &manifest.binding, "CONTROL", later),
            later,
        )
        .await
        .unwrap();
    assert_eq!(again.unwrap().cursor(), ack.cursor());
    let view = store
        .bootstrap_read(
            &seal_at(&manifest.binding, &manifest.binding, "READ", later),
            None,
            200,
            later,
        )
        .await
        .unwrap();
    assert_eq!((view.state, view.rows.len()), ("READY", 2));
    assert_eq!(fact_count(&pool, &resumed).await, 1);
}

#[tokio::test]
async fn missing_lineage_requires_resync_before_history_and_nonresurrecting_tail() {
    let (store, pool) = db().await;
    let original_account = row(
        "accounts",
        "account_1",
        1,
        json!({
            "currency":"USDT", "equity":"1000.0000", "original_owner":"owner_at_fact",
            "original_binding":"binding_at_fact", "effective_at_ms":NOW - 1_000,
        }),
    );
    let baseline = [original_account.clone(), order("order_1", 10)];
    let missing = ready(&store, binding(), &baseline).await;
    let mut delete = event(&missing, 3, "orders", "order_1", 11, json!({}));
    delete.event.operation = EventOperation::Tombstone;
    delete.event.tombstone_of_event_id = Some(id("event_2"));
    let (bad, chunks) = group(
        &missing,
        "missing_predecessor",
        "opaque_overlap",
        "opaque_deleted",
        vec![vec![delete]],
        false,
    );
    stage_chunks(&store, &missing, &chunks).await;
    assert!(matches!(
        store
            .bootstrap_commit_group(
                &missing,
                &seal(&bad, &missing.manifest().binding, "GROUP"),
                NOW
            )
            .await,
        Err(BootstrapError::Resync)
    ));
    assert_eq!(fact_count(&pool, &missing).await, 0);
    assert_eq!(checkpoint(&store, &missing).await, "opaque_overlap");
    // Replacement fences the incomplete generation; never delete staged evidence.
    let h = ready(&store, missing.manifest().binding.clone(), &baseline).await;
    let original_account_event = event(
        &h,
        1,
        "accounts",
        "account_1",
        1,
        original_account.payload.clone(),
    );
    let original_order_event = event(&h, 2, "orders", "order_1", 10, baseline[1].payload.clone());
    seed_history(
        &store,
        &h,
        "history_prerequisite",
        vec![original_account_event.clone(), original_order_event.clone()],
    )
    .await;
    let mut delete = event(&h, 3, "orders", "order_1", 11, json!({}));
    delete.event.operation = EventOperation::Tombstone;
    delete.event.tombstone_of_event_id = Some(original_order_event.event.event_id);
    let stale = event(&h, 4, "orders", "order_1", 9, order("order_1", 9).payload);
    let (deleted, chunks) = group(
        &h,
        "delete_then_old_revision",
        "opaque_overlap",
        "opaque_deleted",
        vec![vec![delete, stale]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    commit(&store, &h, &deleted).await;
    let mut corrected_payload = original_account.payload.clone();
    corrected_payload["equity"] = json!("999.0000");
    let mut correction = event(&h, 5, "accounts", "account_1", 2, corrected_payload.clone());
    correction.event.operation = EventOperation::Correction;
    correction.event.event_time_ms = NOW - 1_000;
    correction.event.correction_of_event_id = Some(original_account_event.event.event_id.clone());
    let (corrected, chunks) = group(
        &h,
        "late_original_owner_correction",
        "opaque_deleted",
        "opaque_corrected",
        vec![vec![correction]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    commit(&store, &h, &corrected).await;
    assert_eq!(
        read_all(&store, &h.manifest().binding).await,
        vec![row("accounts", "account_1", 2, corrected_payload)]
    );
    let immutable: Value = sqlx::query_scalar(
        "SELECT event FROM portal_projection.bootstrap_facts WHERE generation=$1 AND event_id=$2",
    )
    .bind(h.manifest().generation)
    .bind(original_account_event.event.event_id.as_str())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(
        immutable,
        serde_json::to_value(&original_account_event).unwrap()
    );
    assert_eq!(fact_count(&pool, &h).await, 5);
}

#[tokio::test]
async fn immutable_event_and_source_position_conflicts_rollback_entire_groups() {
    let (store, pool) = db().await;
    for conflict_kind in ["event_identity", "source_position"] {
        let h = ready(&store, binding(), &[account("account_1")]).await;
        let original = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
        let (first, chunks) = group(
            &h,
            "first",
            "opaque_overlap",
            "opaque_first",
            vec![vec![original.clone()]],
            false,
        );
        stage_chunks(&store, &h, &chunks).await;
        commit(&store, &h, &first).await;
        let before = read_all(&store, &h.manifest().binding).await;
        let mut changed = original;
        changed.event.payload["amount"] = json!("81.0000");
        changed.event.payload_digest = canonical_value_digest(&changed.event.payload);
        if conflict_kind == "source_position" {
            changed.event.event_id = id("different_id_same_source_position");
            changed.event.entity_version = "opaque_v_2".to_owned();
            changed.revision = Revision {
                ordinal: 2,
                opaque: "opaque_v_2".to_owned(),
            };
        }
        let (bad, chunks) = group(
            &h,
            conflict_kind,
            "opaque_first",
            "opaque_conflict",
            vec![vec![changed]],
            false,
        );
        stage_chunks(&store, &h, &chunks).await;
        let error = store
            .bootstrap_commit_group(&h, &seal(&bad, &h.manifest().binding, "GROUP"), NOW)
            .await
            .unwrap_err();
        match error {
            BootstrapError::Integrity => {}
            BootstrapError::Database(sqlx::Error::Database(error)) => {
                assert_eq!(error.code().as_deref(), Some("23505"));
            }
            other => panic!("unexpected conflict boundary: {other:?}"),
        }
        assert_eq!(checkpoint(&store, &h).await, "opaque_first");
        assert_eq!(fact_count(&pool, &h).await, 1);
        assert_eq!(read_all(&store, &h.manifest().binding).await, before);
    }
}

#[tokio::test]
async fn pending_group_limits_and_history_priority_are_durable() {
    let (store, pool) = db().await;
    for bound in ["rows", "chunks", "bytes"] {
        let mut caps = limits();
        match bound {
            "rows" => caps.group_events = 2,
            "chunks" => caps.group_chunks = 1,
            "bytes" => caps.group_bytes = 2_000,
            _ => unreachable!(),
        }
        let (manifest, pages) = fixture(binding(), &[account("account_1")], true);
        let h = store
            .bootstrap_begin(&seal(&manifest, &manifest.binding, "MANIFEST"), caps, NOW)
            .await
            .unwrap();
        stage_pages(&store, &h, &pages).await;
        finish(&store, &h).await;
        let allowed = if bound == "rows" { 2_u64 } else { 1_u64 };
        for index in 0..=allowed {
            let mut payload = order(&format!("order_{index}"), 1).payload;
            if bound == "bytes" {
                payload["padding"] = json!("x".repeat(600));
            }
            let chunk = DeltaChunk {
                generation: manifest.generation,
                group_id: "bounded_pending".to_owned(),
                index,
                events: vec![event(
                    &h,
                    index + 1,
                    "orders",
                    &format!("order_{index}"),
                    1,
                    payload,
                )],
            };
            let result = store
                .bootstrap_stage_delta(&h, &seal(&chunk, &manifest.binding, "CHUNK"), NOW)
                .await;
            if index < allowed {
                result.unwrap();
            } else {
                assert!(matches!(
                    result,
                    Err(BootstrapError::Bounds | BootstrapError::Protocol(ProtocolError::Bounds))
                ));
            }
        }
        let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='CHUNK'")
            .bind(manifest.generation).fetch_one(&pool).await.unwrap();
        assert_eq!(pending, i64::try_from(allowed).unwrap());
        let history = DeltaChunk {
            generation: manifest.generation,
            group_id: "low_priority_history".to_owned(),
            index: 0,
            events: vec![event(
                &h,
                100,
                "accounts",
                "historical_account",
                1,
                account("historical_account").payload,
            )],
        };
        assert!(matches!(
            store
                .bootstrap_backfill_history(&h, &seal(&history, &manifest.binding, "HISTORY"), NOW)
                .await,
            Err(BootstrapError::FreshPending)
        ));
        assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
        assert_eq!(fact_count(&pool, &h).await, 0);
    }
    let h = ready(
        &store,
        binding(),
        &[account("account_1"), order("order_1", 1)],
    )
    .await;
    let before = read_all(&store, &h.manifest().binding).await;
    let history = DeltaChunk {
        generation: h.manifest().generation,
        group_id: "immutable_only_history".to_owned(),
        index: 0,
        events: vec![event(
            &h,
            100,
            "orders",
            "order_1",
            50,
            order("order_1", 50).payload,
        )],
    };
    store
        .bootstrap_backfill_history(&h, &seal(&history, &h.manifest().binding, "HISTORY"), NOW)
        .await
        .unwrap();
    assert_eq!(read_all(&store, &h.manifest().binding).await, before);
    assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
    assert_eq!(fact_count(&pool, &h).await, 1);
}

#[tokio::test]
async fn referential_coverage_requires_actual_json_string_ids() {
    let (store, pool) = db().await;
    for invalid in [
        json!(7),
        json!(null),
        json!({"id":"7"}),
        json!(["7"]),
        json!("missing"),
    ] {
        let rows = [
            account("7"),
            row("orders", "order_bad", 1, json!({"account_id":invalid})),
        ];
        let (manifest, pages) = fixture(binding(), &rows, true);
        let h = start(&store, &manifest).await;
        stage_pages(&store, &h, &pages).await;
        assert!(matches!(
            store
                .bootstrap_finish_snapshot(
                    &h,
                    &seal(&manifest.binding, &manifest.binding, "CONTROL"),
                    NOW
                )
                .await,
            Err(BootstrapError::Integrity)
        ));
        let active: Option<Uuid> = sqlx::query_scalar(
            "SELECT active_generation FROM portal_projection.bootstrap_streams WHERE slot_key=$1",
        )
        .bind(manifest.binding.slot_key().unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(active.is_none());
        assert!(matches!(
            store
                .bootstrap_read(
                    &seal(&manifest.binding, &manifest.binding, "READ"),
                    None,
                    200,
                    NOW
                )
                .await,
            Err(BootstrapError::Resync)
        ));
    }
    let baseline = [
        account("7"),
        row("orders", "order_good", 1, json!({"account_id":"7"})),
    ];
    let h = ready(&store, binding(), &baseline).await;
    let invalid = event(&h, 1, "orders", "order_good", 2, json!({"account_id":7}));
    let (bad, chunks) = group(
        &h,
        "bad_delta_reference",
        "opaque_overlap",
        "opaque_bad_reference",
        vec![vec![invalid]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    assert!(matches!(
        store
            .bootstrap_commit_group(&h, &seal(&bad, &h.manifest().binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    assert_eq!(fact_count(&pool, &h).await, 0);
    assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
    assert_eq!(read_all(&store, &h.manifest().binding).await, baseline);
}

#[tokio::test]
async fn postgres_jsonb_expansion_cannot_publish_unreadable_rows() {
    let (store, pool) = db().await;
    // Synthetic nonfinancial metadata, deliberately no raw business rows.
    let payload = json!({"account_id":"account_1", "wide_numbers":vec![json!(1e300); 4_000]});
    assert!(serde_json::to_vec(&payload).unwrap().len() < limits().page_bytes);
    let expanded: i32 = sqlx::query_scalar("SELECT octet_length($1::jsonb::text)")
        .bind(&payload)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(usize::try_from(expanded).unwrap() > limits().page_bytes);
    let rows = [
        account("account_1"),
        row("orders", "wide_order", 1, payload.clone()),
    ];
    let (manifest, pages) = fixture(binding(), &rows, true);
    let h = start(&store, &manifest).await;
    let page = pages.iter().find(|page| page.dataset == "orders").unwrap();
    page.validate(&manifest, &limits(), NOW).unwrap();
    assert!(matches!(
        store
            .bootstrap_stage_page(&h, &seal(page, &manifest.binding, "PAGE"), NOW)
            .await,
        Err(BootstrapError::Bounds)
    ));
    let rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    let progress: i64 = sqlx::query_scalar("SELECT completed_pages FROM portal_projection.bootstrap_datasets WHERE generation=$1 AND dataset='orders'")
        .bind(manifest.generation).fetch_one(&pool).await.unwrap();
    assert_eq!((rows, progress), (0, 0));
    let tail = ready(&store, binding(), &[account("account_1")]).await;
    let large = event(&tail, 1, "orders", "wide_order", 1, payload);
    let (bad, chunks) = group(
        &tail,
        "wide_delta",
        "opaque_overlap",
        "opaque_wide",
        vec![vec![large]],
        false,
    );
    stage_chunks(&store, &tail, &chunks).await;
    assert!(matches!(
        store
            .bootstrap_commit_group(&tail, &seal(&bad, &tail.manifest().binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Bounds)
    ));
    assert_eq!(fact_count(&pool, &tail).await, 0);
    assert_eq!(checkpoint(&store, &tail).await, "opaque_overlap");
    assert_eq!(
        read_all(&store, &tail.manifest().binding).await,
        vec![account("account_1")]
    );
}

#[tokio::test]
async fn corrected_snapshot_overlap_is_idempotent_but_predecessors_must_be_earlier() {
    let (store, pool) = db().await;
    let corrected_row = row(
        "accounts",
        "account_1",
        2,
        json!({"currency":"USDT", "equity":"999.0000", "original_owner":"owner_at_fact"}),
    );
    let h = ready(&store, binding(), std::slice::from_ref(&corrected_row)).await;
    let original = event(
        &h,
        1,
        "accounts",
        "account_1",
        1,
        json!({"currency":"USDT", "equity":"1000.0000", "original_owner":"owner_at_fact"}),
    );
    seed_history(&store, &h, "original_history", vec![original.clone()]).await;
    let mut overlap = event(
        &h,
        2,
        "accounts",
        "account_1",
        2,
        corrected_row.payload.clone(),
    );
    overlap.event.operation = EventOperation::Correction;
    overlap.event.correction_of_event_id = Some(original.event.event_id);
    let (valid, chunks) = group(
        &h,
        "already_corrected_overlap",
        "opaque_overlap",
        "opaque_after_overlap",
        vec![vec![overlap]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    commit(&store, &h, &valid).await;
    assert_eq!(
        read_all(&store, &h.manifest().binding).await,
        vec![corrected_row]
    );
    assert_eq!(fact_count(&pool, &h).await, 2);
}

#[tokio::test]
async fn correction_rejects_future_or_equal_revision_predecessors() {
    let (store, pool) = db().await;
    for invalid in ["future_position", "same_revision"] {
        let baseline = row(
            "accounts",
            "account_1",
            1,
            json!({"currency":"USDT", "equity":"1000.0000"}),
        );
        let h = ready(&store, binding(), std::slice::from_ref(&baseline)).await;
        let (target_sequence, target_revision) = if invalid == "future_position" {
            (10, 1)
        } else {
            (1, 2)
        };
        let target = event(
            &h,
            target_sequence,
            "accounts",
            "account_1",
            target_revision,
            json!({"currency":"USDT", "equity":"1000.0000"}),
        );
        seed_history(
            &store,
            &h,
            "invalid_predecessor_history",
            vec![target.clone()],
        )
        .await;
        let mut correction = event(
            &h,
            2,
            "accounts",
            "account_1",
            2,
            target.event.payload.clone(),
        );
        correction.event.operation = EventOperation::Correction;
        correction.event.correction_of_event_id = Some(target.event.event_id);
        let (bad, chunks) = group(
            &h,
            invalid,
            "opaque_overlap",
            "opaque_invalid_lineage",
            vec![vec![correction]],
            false,
        );
        stage_chunks(&store, &h, &chunks).await;
        assert!(matches!(
            store
                .bootstrap_commit_group(&h, &seal(&bad, &h.manifest().binding, "GROUP"), NOW)
                .await,
            Err(BootstrapError::Integrity)
        ));
        assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
        assert_eq!(fact_count(&pool, &h).await, 1);
        assert_eq!(
            read_all(&store, &h.manifest().binding).await,
            vec![baseline]
        );
    }
}

#[tokio::test]
async fn jsonb_numeric_normalization_cannot_commit_different_authenticated_bytes() {
    let (store, pool) = db().await;
    let payload = json!({"account_id":"account_1", "metadata":-0.0});
    let stored: Value = sqlx::query_scalar("SELECT $1::jsonb")
        .bind(&payload)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(
        canonical_value_digest(&stored),
        canonical_value_digest(&payload)
    );
    let rows = [
        account("account_1"),
        row("orders", "order_negative_zero", 1, payload.clone()),
    ];
    let (manifest, pages) = fixture(binding(), &rows, true);
    let h = start(&store, &manifest).await;
    let page = pages.iter().find(|page| page.dataset == "orders").unwrap();
    assert!(matches!(
        store
            .bootstrap_stage_page(&h, &seal(page, &manifest.binding, "PAGE"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_rows WHERE generation=$1",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    let progress: i64 = sqlx::query_scalar("SELECT completed_pages FROM portal_projection.bootstrap_datasets WHERE generation=$1 AND dataset='orders'")
        .bind(manifest.generation).fetch_one(&pool).await.unwrap();
    assert_eq!((count, progress), (0, 0));
    let tail = ready(&store, binding(), &[account("account_1")]).await;
    let history = DeltaChunk {
        generation: tail.manifest().generation,
        group_id: "negative_zero_history".to_owned(),
        index: 0,
        events: vec![event(&tail, 1, "orders", "order_negative_zero", 1, payload)],
    };
    assert!(matches!(
        store
            .bootstrap_backfill_history(
                &tail,
                &seal(&history, &tail.manifest().binding, "HISTORY"),
                NOW
            )
            .await,
        Err(BootstrapError::Integrity)
    ));
    assert_eq!(fact_count(&pool, &tail).await, 0);
    assert_eq!(checkpoint(&store, &tail).await, "opaque_overlap");
    assert_eq!(
        read_all(&store, &tail.manifest().binding).await,
        vec![account("account_1")]
    );
}

#[tokio::test]
async fn pending_chunk_jsonb_expansion_rolls_back_before_staging_commit() {
    let (store, pool) = db().await;
    let mut caps = limits();
    caps.group_bytes = 4_000;
    let (manifest, pages) = fixture(binding(), &[account("account_1")], true);
    let h = store
        .bootstrap_begin(&seal(&manifest, &manifest.binding, "MANIFEST"), caps, NOW)
        .await
        .unwrap();
    stage_pages(&store, &h, &pages).await;
    assert!(finish(&store, &h).await.is_some());
    let baseline = read_all(&store, &manifest.binding).await;
    let payload = json!({"account_id":"account_1", "wide_numbers":vec![json!(1e20); 200]});
    let chunk = DeltaChunk {
        generation: manifest.generation,
        group_id: "expanded_pending".to_owned(),
        index: 0,
        events: vec![event(&h, 1, "orders", "expanded_pending", 1, payload)],
    };
    chunk.validate(&manifest, &caps, NOW).unwrap();
    assert!(serde_json::to_vec(&chunk).unwrap().len() < caps.group_bytes);
    let expanded: i32 = sqlx::query_scalar("SELECT octet_length($1::jsonb::text)")
        .bind(serde_json::to_value(&chunk).unwrap())
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(usize::try_from(expanded).unwrap() > caps.group_bytes);
    assert!(matches!(
        store
            .bootstrap_stage_delta(&h, &seal(&chunk, &manifest.binding, "CHUNK"), NOW)
            .await,
        Err(BootstrapError::Bounds)
    ));
    let staged: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='CHUNK'",
    )
    .bind(manifest.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(staged, 0);
    assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
    assert_eq!(fact_count(&pool, &h).await, 0);
    assert_eq!(read_all(&store, &manifest.binding).await, baseline);
}

#[tokio::test]
async fn historical_revision_payload_conflicts_survive_current_state_advancement() {
    let (store, pool) = db().await;
    for seed in ["snapshot_v1", "committed_fact_v1"] {
        let rows = if seed == "snapshot_v1" {
            vec![account("account_1"), order("order_1", 1)]
        } else {
            vec![account("account_1")]
        };
        let h = ready(&store, binding(), &rows).await;
        let from = if seed == "committed_fact_v1" {
            let initial = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
            let (first, chunks) = group(
                &h,
                "seed_v1",
                "opaque_overlap",
                "opaque_v1",
                vec![vec![initial]],
                false,
            );
            stage_chunks(&store, &h, &chunks).await;
            commit(&store, &h, &first).await;
            "opaque_v1"
        } else {
            "opaque_overlap"
        };
        let mut advanced_payload = order("order_1", 2).payload;
        advanced_payload["amount"] = json!("81.0000");
        let advanced = event(&h, 2, "orders", "order_1", 2, advanced_payload);
        let (advance, chunks) = group(
            &h,
            "advance_v2",
            from,
            "opaque_v2",
            vec![vec![advanced]],
            false,
        );
        stage_chunks(&store, &h, &chunks).await;
        commit(&store, &h, &advance).await;
        let baseline = read_all(&store, &h.manifest().binding).await;
        let facts = fact_count(&pool, &h).await;
        let mut conflicting_payload = order("order_1", 1).payload;
        conflicting_payload["amount"] = json!("999.0000");
        let conflicting = event(&h, 3, "orders", "order_1", 1, conflicting_payload);
        let (bad, chunks) = group(
            &h,
            "conflicting_old_revision",
            "opaque_v2",
            "opaque_bad",
            vec![vec![conflicting]],
            false,
        );
        stage_chunks(&store, &h, &chunks).await;
        assert!(matches!(
            store
                .bootstrap_commit_group(&h, &seal(&bad, &h.manifest().binding, "GROUP"), NOW)
                .await,
            Err(BootstrapError::Integrity)
        ));
        assert_eq!(checkpoint(&store, &h).await, "opaque_v2", "{seed}");
        assert_eq!(fact_count(&pool, &h).await, facts, "{seed}");
        assert_eq!(
            read_all(&store, &h.manifest().binding).await,
            baseline,
            "{seed}"
        );
    }
}
