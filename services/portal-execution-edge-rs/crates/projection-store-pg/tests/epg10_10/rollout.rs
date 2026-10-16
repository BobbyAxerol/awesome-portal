//! `TEST_ONLY` shadow rehearsal. No source publication or real command effect.
use super::*;
use std::{sync::Arc, time::Duration};

use chrono::Utc;
use command_relay::durable::{AuthorityReceipt, BusinessState, CommandIntent, CommandScope};
use projection_core::resources::{
    EnvelopeLimits, ResourceEnvelope, StorageLimits, StorageObservation,
};
use projection_store_pg::bootstrap_rollout::ShadowComparison;

fn control(h: &BootstrapHandle) -> Verified<Binding> {
    seal(&h.manifest().binding, &h.manifest().binding, "CONTROL")
}

async fn shadow(store: &PgProjectionStore, b: Binding, rows: &[SnapshotRow]) -> BootstrapHandle {
    let (m, pages) = fixture(b, rows, true);
    let h = store
        .bootstrap_begin_shadow(&seal(&m, &m.binding, "MANIFEST"), limits(), NOW)
        .await
        .unwrap();
    stage_pages(store, &h, &pages).await;
    assert!(finish(store, &h).await.is_some());
    h
}

async fn compare(store: &PgProjectionStore, h: &BootstrapHandle) -> ShadowComparison {
    store
        .bootstrap_compare_shadow(h, &control(h), NOW)
        .await
        .unwrap()
}

async fn activate(store: &PgProjectionStore, h: &BootstrapHandle) {
    store
        .bootstrap_activate_shadow(h, &control(h), &compare(store, h).await, NOW)
        .await
        .unwrap();
}

async fn backfill(store: &PgProjectionStore, h: &BootstrapHandle, events: Vec<DeltaEvent>) {
    let history = DeltaChunk {
        generation: h.manifest().generation,
        group_id: "matched-history".into(),
        index: 0,
        events,
    };
    store
        .bootstrap_backfill_history(h, &seal(&history, &h.manifest().binding, "HISTORY"), NOW)
        .await
        .unwrap();
}

#[tokio::test]
async fn t10_01_shadow_holds_reads_matches_exact_rows_and_activates_atomically() {
    let (store, _) = db().await;
    let b = binding();
    let rows = vec![account("account_1"), order("order_1", 1)];
    let old = ready(&store, b.clone(), &rows).await;
    let fact = event(&old, 1, "orders", "order_1", 1, rows[1].payload.clone());
    backfill(&store, &old, vec![fact.clone()]).await;
    let new = shadow(&store, b.clone(), &rows).await;
    backfill(&store, &new, vec![fact]).await;
    let view = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
        .await
        .unwrap();
    assert_eq!(view.generation, old.manifest().generation);
    assert_eq!(view.state, "STALE");
    let comparison = compare(&store, &new).await;
    assert_eq!((comparison.rows(), comparison.facts()), (2, 1));
    let s = store
        .bootstrap_activate_shadow(&new, &control(&new), &comparison, NOW)
        .await
        .unwrap();
    assert_eq!(s.rollout_state, "ACTIVE");
    assert_eq!(s.active, Some(new.manifest().generation));
    let view = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
        .await
        .unwrap();
    assert_eq!(view.state, "READY");
    assert_eq!(view.generation, new.manifest().generation);
    assert_eq!(digest(&view.rows), digest(&rows));
    assert_eq!(
        store
            .bootstrap_activate_shadow(&new, &control(&new), &comparison, NOW)
            .await
            .unwrap()
            .active,
        s.active
    );
}

#[tokio::test]
async fn t10_01_mismatch_in_content_revision_checkpoint_or_history_never_selects() {
    for kind in ["payload", "revision", "checkpoint", "history"] {
        let (store, _) = db().await;
        let b = binding();
        let rows = vec![account("account_1"), order("order_1", 1)];
        let old = ready(&store, b.clone(), &rows).await;
        if kind == "history" {
            let c = DeltaChunk {
                generation: old.manifest().generation,
                group_id: "baseline".into(),
                index: 0,
                events: vec![event(
                    &old,
                    1,
                    "orders",
                    "order_1",
                    1,
                    rows[1].payload.clone(),
                )],
            };
            store
                .bootstrap_backfill_history(&old, &seal(&c, &b, "HISTORY"), NOW)
                .await
                .unwrap();
        }
        let mut changed = rows.clone();
        if kind == "payload" {
            changed[1].payload["amount"] = json!("80.0001");
        }
        if kind == "revision" {
            changed[1].revision.ordinal = 2;
            changed[1].revision.opaque = "opaque_v_2".into();
        }
        let new = shadow(&store, b.clone(), &changed).await;
        if kind == "checkpoint" {
            let (g, chunks) = group(
                &new,
                "advance",
                "opaque_overlap",
                "new_cursor",
                vec![],
                false,
            );
            stage_chunks(&store, &new, &chunks).await;
            commit(&store, &new, &g).await;
        }
        assert!(
            store
                .bootstrap_compare_shadow(&new, &control(&new), NOW)
                .await
                .is_err(),
            "{kind}"
        );
        let view = store
            .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
            .await
            .unwrap();
        assert_eq!(view.generation, old.manifest().generation);
    }
    let (store, _) = db().await;
    let b = binding();
    ready(&store, b.clone(), &[]).await;
    let (mut m, _) = fixture(b.clone(), &[], true);
    m.barrier = "different_cut".into();
    for dataset in m.binding.datasets.keys() {
        let seed = page_seed(&m, dataset).unwrap();
        m.pages.get_mut(dataset).unwrap().final_digest = seed;
    }
    let h = store
        .bootstrap_begin_shadow(&seal(&m, &b, "MANIFEST"), limits(), NOW)
        .await
        .unwrap();
    finish(&store, &h).await;
    assert!(store
        .bootstrap_compare_shadow(&h, &control(&h), NOW)
        .await
        .is_err());
}

#[tokio::test]
async fn t10_history_commit_after_comparison_invalidates_activation_pin() {
    let (store, _) = db().await;
    let b = binding();
    let rows = vec![account("account_1"), order("order_1", 1)];
    ready(&store, b.clone(), &rows).await;
    let h = shadow(&store, b.clone(), &rows).await;
    let pin = compare(&store, &h).await;
    let c = DeltaChunk {
        generation: h.manifest().generation,
        group_id: "history".into(),
        index: 0,
        events: vec![event(
            &h,
            1,
            "orders",
            "order_1",
            1,
            rows[1].payload.clone(),
        )],
    };
    store
        .bootstrap_backfill_history(&h, &seal(&c, &b, "HISTORY"), NOW)
        .await
        .unwrap();
    assert!(store
        .bootstrap_activate_shadow(&h, &control(&h), &pin, NOW)
        .await
        .is_err());
    assert!(store
        .bootstrap_compare_shadow(&h, &control(&h), NOW)
        .await
        .is_err());
}

#[tokio::test]
async fn t10_02_stale_writer_and_auto_resume_cannot_bypass_held_shadow() {
    let (store, _) = db().await;
    let b = binding();
    let old = ready(&store, b.clone(), &[]).await;
    let new = shadow(&store, b.clone(), &[]).await;
    assert!(store
        .bootstrap_checkpoint(&old, &control(&old), NOW)
        .await
        .is_err());
    let (g, _) = group(
        &old,
        "paused_writer",
        "opaque_overlap",
        "forbidden",
        vec![],
        false,
    );
    assert!(store
        .bootstrap_commit_group(&old, &seal(&g, &b, "GROUP"), NOW)
        .await
        .is_err());
    assert!(store
        .bootstrap_begin(&seal(new.manifest(), &b, "MANIFEST"), limits(), NOW)
        .await
        .is_err());
    activate(&store, &new).await;
    store
        .bootstrap_rollback_read(&new, &control(&new), NOW)
        .await
        .unwrap();
    assert!(store
        .bootstrap_begin(&seal(old.manifest(), &b, "MANIFEST"), limits(), NOW)
        .await
        .is_err());
    assert_eq!(checkpoint(&store, &new).await, "opaque_overlap");
}

#[tokio::test]
async fn t10_03_inflight_read_pin_and_stale_comparison_reject_mixed_generations() {
    let (store, _) = db().await;
    let b = binding();
    let rows = vec![account("account_1"), order("order_1", 1)];
    ready(&store, b.clone(), &rows).await;
    let new = shadow(&store, b.clone(), &rows).await;
    let read = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 1, NOW)
        .await
        .unwrap();
    let comparison = compare(&store, &new).await;
    // An actual committed revision change invalidates the private CAS pin.
    let (g, _) = group(&new, "advance", "opaque_overlap", "later", vec![], false);
    commit(&store, &new, &g).await;
    assert!(store
        .bootstrap_activate_shadow(&new, &control(&new), &comparison, NOW)
        .await
        .is_err());
    assert!(store
        .bootstrap_compare_shadow(&new, &control(&new), NOW)
        .await
        .is_err());
    // Fresh equal generations are needed, not a fabricated refreshed pin.
    let newer = shadow(&store, b.clone(), &rows).await;
    activate(&store, &newer).await;
    assert!(matches!(
        store
            .bootstrap_read(&seal(&b, &b, "READ"), read.next.as_ref(), 1, NOW)
            .await,
        Err(BootstrapError::Resync)
    ));
}

// Mechanically mirrors the existing07 typed fixture; no new command schema or
// authority implementation. It persists a full receipt, never sends a command.
fn command_fixture() -> (CommandIntent, AuthorityReceipt) {
    let payload = json!({"schema_version":"pma.capital-command.v1.1","operation":"TOP_UP",
        "idempotency_key":"TEST_ONLY.rollout","recipient_kind":"PORTFOLIO","currency":"USDT",
        "expected_versions":{"budget":"1","source":"1","parent":"1"},"reason":"TEST_ONLY","amount":"5.000"});
    let scope = CommandScope::new(
        "TEST_ONLY.workspace",
        "paper",
        "TEST_ONLY.profile",
        "TEST_ONLY.authority",
        "TEST_ONLY.actor",
        "TEST_ONLY.workload",
    )
    .unwrap();
    let intent = CommandIntent::new(
        scope,
        "TEST_ONLY.rollout",
        "TOP_UP",
        payload.clone(),
        &digest(&payload),
    )
    .unwrap();
    let receipt = AuthorityReceipt::new(&intent, "TEST_ONLY.source", 1, BusinessState::Applied, json!({
        "command_id":"TEST_ONLY.command","state":"APPLIED",
        "amounts":{"requested":"5.000","applied":"5","pending":"0","cancelled":"0","rejected":"0"},
        "currency":"USDT","parent_receipt":"TEST_ONLY.parent","blockers":[],
        "before_ref":"TEST_ONLY.before","after_ref":"TEST_ONLY.after","source_ref":"TEST_ONLY.source",
        "policy_ref":"TEST_ONLY.policy","binding_ref":"TEST_ONLY.binding","current_versions":{"budget":2},
        "physical_transfer_performed":false,"cli_exit_code":0,"next_action":"REVIEW_RECEIPT"})).unwrap();
    (intent, receipt)
}

// Same governed fixture envelope as07; never weaken CommandStore::Ungoverned.
async fn command_store() -> PgProjectionStore {
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
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap();
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    PgProjectionStore::connect_with_resources(&url, envelope, 8)
        .await
        .unwrap()
}

#[tokio::test]
async fn t10_04_read_rollback_preserves_new_facts_and_full_command_receipt() {
    let (store, pool) = db().await;
    let commands = command_store().await;
    let b = binding();
    let rows = vec![account("account_1"), order("order_1", 1)];
    let old = ready(&store, b.clone(), &rows).await;
    let baseline = event(&old, 1, "orders", "order_1", 1, rows[1].payload.clone());
    backfill(&store, &old, vec![baseline.clone()]).await;
    let new = shadow(&store, b.clone(), &rows).await;
    backfill(&store, &new, vec![baseline.clone()]).await;
    let ledger = format!("TEST_ONLY.rollout.{}", Uuid::now_v7());
    commands.configure_command_ledger(&ledger, 2).await.unwrap();
    let (intent, full) = command_fixture();
    let first = commands.prepare_command(&ledger, &intent).await.unwrap();
    assert!(commands
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_some());
    activate(&store, &new).await;
    // Source response arriving after read cutover retains the original identity.
    commands
        .record_command_receipt(&ledger, &intent, &full)
        .await
        .unwrap();
    let mut e = event(
        &new,
        2,
        "orders",
        "order_1",
        2,
        json!({"account_id":"account_1","amount":"79.9999"}),
    );
    e.event.operation = EventOperation::Correction;
    e.event.correction_of_event_id = Some(baseline.event.event_id.clone());
    let expected_history = json!([baseline, e]);
    let (g, chunks) = group(
        &new,
        "after-cutover",
        "opaque_overlap",
        "post_cut",
        vec![vec![e]],
        false,
    );
    stage_chunks(&store, &new, &chunks).await;
    commit(&store, &new, &g).await;
    let status = store
        .bootstrap_rollback_read(&new, &control(&new), NOW)
        .await
        .unwrap();
    assert_eq!(status.active, Some(old.manifest().generation));
    assert_eq!(status.rollout_state, "ROLLED_BACK");
    assert_eq!(fact_count(&pool, &new).await, 2);
    let actual: Value = sqlx::query_scalar("SELECT jsonb_agg(event ORDER BY source_sequence) FROM portal_projection.bootstrap_facts WHERE generation=$1")
        .bind(new.manifest().generation).fetch_one(&pool).await.unwrap();
    assert_eq!(actual, expected_history);
    let preserved = commands.command_status(&ledger, &intent).await.unwrap();
    assert_eq!(preserved.command_id, first.command_id);
    assert_eq!(preserved.receipt.unwrap().payload(), full.payload());
    assert!(commands
        .claim_command(&ledger, &intent)
        .await
        .unwrap()
        .is_none());
    let view = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
        .await
        .unwrap();
    assert_eq!(view.state, "STALE");
    assert!(view.stale_until_ms.is_some());
    assert_eq!(digest(&view.rows), digest(&rows));
    assert_eq!(checkpoint(&store, &new).await, "post_cut");
    assert!(store
        .bootstrap_compare_shadow(&new, &control(&new), NOW)
        .await
        .is_err());
    let (g, _) = group(&new, "continue", "post_cut", "post_rollback", vec![], false);
    commit(&store, &new, &g).await;
    assert_eq!(
        store
            .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
            .await
            .unwrap()
            .generation,
        old.manifest().generation
    );
    assert_eq!(fact_count(&pool, &new).await, 2);
}

#[tokio::test]
async fn t10_05_interrupted_shadow_reconnect_inspects_resumes_and_rolls_back_idempotently() {
    let (store, _) = db().await;
    let b = binding();
    let old = ready(&store, b.clone(), &[]).await;
    let (m, _) = fixture(b.clone(), &[], true);
    let h = store
        .bootstrap_begin_shadow(&seal(&m, &b, "MANIFEST"), limits(), NOW)
        .await
        .unwrap();
    let s = store
        .bootstrap_rollout_status(&h, &control(&h), NOW)
        .await
        .unwrap();
    assert_eq!(s.candidate_state, "INITIALIZING");
    assert_eq!(s.active, Some(old.manifest().generation));
    assert!(store
        .bootstrap_compare_shadow(&h, &control(&h), NOW)
        .await
        .is_err());
    drop(store);
    let (store, _) = db().await;
    let h = store
        .bootstrap_begin_shadow(&seal(&m, &b, "MANIFEST"), limits(), NOW)
        .await
        .unwrap();
    finish(&store, &h).await;
    let proof = compare(&store, &h).await;
    store
        .bootstrap_activate_shadow(&h, &control(&h), &proof, NOW)
        .await
        .unwrap();
    // ACK lost; a new connection observes the committed selection.
    let (fresh, _) = db().await;
    assert_eq!(
        fresh
            .bootstrap_rollout_status(&h, &control(&h), NOW)
            .await
            .unwrap()
            .rollout_state,
        "ACTIVE"
    );
    fresh
        .bootstrap_activate_shadow(&h, &control(&h), &proof, NOW)
        .await
        .unwrap();
    fresh
        .bootstrap_rollback_read(&h, &control(&h), NOW)
        .await
        .unwrap();
    let s = fresh
        .bootstrap_rollback_read(&h, &control(&h), NOW)
        .await
        .unwrap();
    assert_eq!(s.active, Some(old.manifest().generation));
    assert!(fresh
        .bootstrap_checkpoint(&old, &control(&old), NOW)
        .await
        .is_err());
    // A still-equal candidate may be deliberately reselected with a NEW compare.
    activate(&fresh, &h).await;
}

#[tokio::test]
async fn t10_scope_and_retention_fail_closed_for_control_and_retained_reads() {
    let (store, _) = db().await;
    let b = binding();
    ready(&store, b.clone(), &[]).await;
    let h = shadow(&store, b.clone(), &[]).await;
    let mut other = b.clone();
    other.policy_revision = "revoked".into();
    let wrong = seal(&other, &other, "CONTROL");
    assert!(store
        .bootstrap_compare_shadow(&h, &wrong, NOW)
        .await
        .is_err());
    let proof = compare(&store, &h).await;
    assert!(store
        .bootstrap_activate_shadow(&h, &wrong, &proof, NOW)
        .await
        .is_err());
    activate(&store, &h).await;
    assert!(store
        .bootstrap_rollback_read(&h, &wrong, NOW)
        .await
        .is_err());
    let later = NOW + limits().rollback_ttl_ms + 1;
    assert!(store
        .bootstrap_rollback_read(&h, &seal_at(&b, &b, "CONTROL", later), later)
        .await
        .is_err());
    store
        .bootstrap_rollback_read(&h, &control(&h), NOW)
        .await
        .unwrap();
    assert!(store
        .bootstrap_read(&seal_at(&b, &b, "READ", later), None, 200, later)
        .await
        .is_err());
    assert!(store
        .bootstrap_read(&seal(&other, &other, "READ"), None, 200, NOW)
        .await
        .is_err());
}

#[tokio::test]
async fn t10_mode_neutral_shadow_and_rollback_for_test_only_sandbox_and_live() {
    for mode in ["sandbox", "live"] {
        let (store, _) = db().await;
        let mut b = binding();
        b.source.environment = mode.into();
        b.source.profile_id = format!("{}_TEST_ONLY", mode.to_uppercase());
        let rows = vec![account("account_1")];
        let old = ready(&store, b.clone(), &rows).await;
        let new = shadow(&store, b.clone(), &rows).await;
        activate(&store, &new).await;
        assert_eq!(
            store
                .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
                .await
                .unwrap()
                .generation,
            new.manifest().generation
        );
        store
            .bootstrap_rollback_read(&new, &control(&new), NOW)
            .await
            .unwrap();
        assert_eq!(
            store
                .bootstrap_read(&seal(&b, &b, "READ"), None, 200, NOW)
                .await
                .unwrap()
                .generation,
            old.manifest().generation
        );
        assert!(store
            .bootstrap_checkpoint(&old, &control(&old), NOW)
            .await
            .is_err());
    }
}
