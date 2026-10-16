//! `TEST_ONLY` synthetic inputs against a disposable real `PostgreSQL`.
//! No fixture is a TS publication, authorization grant or performance receipt.

use std::collections::BTreeMap;

use authoritative_event_core::{
    bootstrap::{
        events_digest, page_seed, Binding, DeltaChunk, DeltaEvent, DeltaGroup, Limits, Manifest,
        PagePlan, ProtocolError, Reference, Revision, SnapshotPage, SnapshotRow,
        SourceProofVerifier, Verified,
    },
    AuthoritativeEvent, EventOperation, EventStreamBinding, SourcePosition,
};
use execution_contracts::CanonicalId;
use projection_core::{canonical_digest, canonical_value_digest};
use projection_store_pg::{
    bootstrap::{BootstrapError, BootstrapHandle, BootstrapReceipt},
    PgProjectionStore,
};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

#[path = "epg10_04_bootstrap/edge_cases.rs"]
mod edge_cases;

#[path = "epg10_10/rollout.rs"]
mod rollout;

const NOW: i64 = 1_792_100_000_000;

fn limits() -> Limits {
    Limits {
        page_rows: 200,
        page_bytes: 1024 * 1024,
        group_events: 1_000,
        group_bytes: 8 * 1024 * 1024,
        group_chunks: 64,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}

fn id(value: impl Into<String>) -> CanonicalId {
    CanonicalId::parse(value).unwrap()
}

fn digest(value: &impl Serialize) -> String {
    canonical_digest(value).unwrap()
}

/// Independent expected digest/tuple allowlist, `TEST_ONLY`, never runtime auth.
struct FixtureVerifier {
    binding: String,
    kind: String,
    expected: String,
    at: i64,
}

impl SourceProofVerifier for FixtureVerifier {
    fn verify(&self, binding: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        binding.digest().ok().as_ref() == Some(&self.binding)
            && kind == self.kind
            && input == self.expected
            && proof == "TEST_ONLY_exact_proof"
            && now == self.at
    }
}

fn seal_at<T: Serialize + Clone>(
    value: &T,
    binding: &Binding,
    kind: &str,
    now: i64,
) -> Verified<T> {
    let verifier = FixtureVerifier {
        binding: binding.digest().unwrap(),
        kind: kind.to_owned(),
        expected: digest(value),
        at: now,
    };
    Verified::authenticate(
        value.clone(),
        binding,
        kind,
        "TEST_ONLY_exact_proof",
        &verifier,
        now,
    )
    .unwrap()
}

fn seal<T: Serialize + Clone>(value: &T, binding: &Binding, kind: &str) -> Verified<T> {
    seal_at(value, binding, kind, NOW)
}

async fn db() -> (PgProjectionStore, PgPool) {
    assert_eq!(
        std::env::var("EPG10_TEST_ONLY").as_deref(),
        Ok("1"),
        "isolated test admission required"
    );
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL")
        .expect("real disposable PG required; never silently skip");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04"),
        "disposable loopback target required"
    );
    let store = PgProjectionStore::connect(&url).await.unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap(); // actual idempotent embedded migration
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await
        .unwrap();
    (store, pool)
}

fn binding() -> Binding {
    let suffix = Uuid::now_v7().simple().to_string();
    Binding {
        source: EventStreamBinding {
            stream_id: "fixture.scoped.v1".to_owned(),
            contract_revision: "fixture.scoped.v1".to_owned(),
            workspace_id: id("workspace_test_only"),
            environment: "paper".to_owned(),
            profile_id: "PAPER_TEST_ONLY".to_owned(),
            venue_id: "FIXTURE".to_owned(),
            resource_kind: "portfolio".to_owned(),
            resource_id: "portfolio_test_only".to_owned(),
            filter_digest: digest(&"filter_test_only"),
        },
        source_epoch: "epoch_test_only".to_owned(),
        consumer_id: format!("consumer_{suffix}"),
        principal_digest: digest(&"principal_test_only"),
        policy_revision: "policy_1".to_owned(),
        query_digest: digest(&"query_test_only"),
        consistency_group: "portfolio_test_only".to_owned(),
        datasets: BTreeMap::from([
            ("accounts".to_owned(), "accounts.v1".to_owned()),
            ("fills".to_owned(), "fills.v1".to_owned()),
            ("orders".to_owned(), "orders.v1".to_owned()),
        ]),
    }
}

fn row(dataset: &str, entity: &str, revision: u64, payload: Value) -> SnapshotRow {
    SnapshotRow {
        dataset: dataset.to_owned(),
        entity_id: entity.to_owned(),
        revision: Revision {
            ordinal: revision,
            opaque: format!("opaque_v_{revision}"),
        },
        payload,
    }
}

fn account(entity: &str) -> SnapshotRow {
    row(
        "accounts",
        entity,
        1,
        json!({"currency":"USDT","equity":"9007199254740993.000000000001"}),
    )
}

fn order(entity: &str, revision: u64) -> SnapshotRow {
    row(
        "orders",
        entity,
        revision,
        json!({"account_id":"account_1","amount":"80.0000","nullable":null}),
    )
}

fn fixture(binding: Binding, rows: &[SnapshotRow], ready: bool) -> (Manifest, Vec<SnapshotPage>) {
    let generation = Uuid::now_v7();
    let mut manifest = Manifest {
        binding,
        generation,
        snapshot_id: format!("snapshot_{}", generation.simple()),
        barrier: "opaque_cut_B".to_owned(),
        delta_start: "opaque_overlap".to_owned(),
        catchup_cursor: if ready {
            "opaque_overlap"
        } else {
            "opaque_catchup"
        }
        .to_owned(),
        expires_at_ms: NOW + 60_000,
        rollback_until_ms: NOW + 120_000,
        pages: BTreeMap::new(),
        references: vec![
            Reference {
                from_dataset: "orders".to_owned(),
                field: "account_id".to_owned(),
                to_dataset: "accounts".to_owned(),
            },
            Reference {
                from_dataset: "fills".to_owned(),
                field: "order_id".to_owned(),
                to_dataset: "orders".to_owned(),
            },
        ],
    };
    let mut pages = Vec::new();
    for dataset in manifest.binding.datasets.keys() {
        let selected: Vec<_> = rows
            .iter()
            .filter(|r| &r.dataset == dataset)
            .cloned()
            .collect();
        let mut chain = page_seed(&manifest, dataset).unwrap();
        let mut count = 0;
        for (index, chunk) in selected.chunks(200).enumerate() {
            let page = SnapshotPage {
                generation,
                dataset: dataset.clone(),
                index: u64::try_from(index).unwrap(),
                previous_digest: chain,
                rows: chunk.to_vec(),
            };
            chain = page.chain_digest().unwrap();
            pages.push(page);
            count += 1;
        }
        manifest.pages.insert(
            dataset.clone(),
            PagePlan {
                count,
                final_digest: chain,
            },
        );
    }
    (manifest, pages)
}

async fn start(store: &PgProjectionStore, manifest: &Manifest) -> BootstrapHandle {
    store
        .bootstrap_begin(
            &seal(manifest, &manifest.binding, "MANIFEST"),
            limits(),
            NOW,
        )
        .await
        .unwrap()
}

async fn stage_pages(store: &PgProjectionStore, h: &BootstrapHandle, pages: &[SnapshotPage]) {
    for page in pages {
        store
            .bootstrap_stage_page(h, &seal(page, &h.manifest().binding, "PAGE"), NOW)
            .await
            .unwrap();
    }
}

async fn finish(store: &PgProjectionStore, h: &BootstrapHandle) -> Option<BootstrapReceipt> {
    store
        .bootstrap_finish_snapshot(
            h,
            &seal(&h.manifest().binding, &h.manifest().binding, "CONTROL"),
            NOW,
        )
        .await
        .unwrap()
}

async fn ready(
    store: &PgProjectionStore,
    binding: Binding,
    rows: &[SnapshotRow],
) -> BootstrapHandle {
    let (manifest, pages) = fixture(binding, rows, true);
    let h = start(store, &manifest).await;
    stage_pages(store, &h, &pages).await;
    assert!(finish(store, &h).await.is_some());
    h
}

fn event(
    h: &BootstrapHandle,
    sequence: u64,
    dataset: &str,
    entity: &str,
    revision: u64,
    payload: Value,
) -> DeltaEvent {
    let binding = &h.manifest().binding;
    DeltaEvent {
        event: AuthoritativeEvent {
            event_id: id(format!("event_{sequence}")),
            source_position: SourcePosition::new(&binding.source_epoch, sequence.to_string())
                .unwrap(),
            entity_kind: dataset.to_owned(),
            entity_id: id(entity),
            entity_version: format!("opaque_v_{revision}"),
            payload_schema_revision: binding.datasets[dataset].clone(),
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
            opaque: format!("opaque_v_{revision}"),
        },
    }
}

fn group(
    h: &BootstrapHandle,
    name: &str,
    from: &str,
    to: &str,
    batches: Vec<Vec<DeltaEvent>>,
    caught_up: bool,
) -> (DeltaGroup, Vec<DeltaChunk>) {
    let chunks: Vec<_> = batches
        .into_iter()
        .enumerate()
        .map(|(index, events)| DeltaChunk {
            generation: h.manifest().generation,
            group_id: name.to_owned(),
            index: u64::try_from(index).unwrap(),
            events,
        })
        .collect();
    let events: Vec<_> = chunks
        .iter()
        .flat_map(|c| c.events.iter().cloned())
        .collect();
    (
        DeltaGroup {
            generation: h.manifest().generation,
            group_id: name.to_owned(),
            from_cursor: from.to_owned(),
            to_cursor: to.to_owned(),
            chunk_digests: chunks.iter().map(|c| c.digest().unwrap()).collect(),
            events_digest: events_digest(&events).unwrap(),
            reached_catchup: caught_up,
        },
        chunks,
    )
}

async fn stage_chunks(store: &PgProjectionStore, h: &BootstrapHandle, chunks: &[DeltaChunk]) {
    for chunk in chunks {
        store
            .bootstrap_stage_delta(h, &seal(chunk, &h.manifest().binding, "CHUNK"), NOW)
            .await
            .unwrap();
    }
}

async fn commit(
    store: &PgProjectionStore,
    h: &BootstrapHandle,
    group: &DeltaGroup,
) -> BootstrapReceipt {
    store
        .bootstrap_commit_group(h, &seal(group, &h.manifest().binding, "GROUP"), NOW)
        .await
        .unwrap()
}

async fn read_all(store: &PgProjectionStore, binding: &Binding) -> Vec<SnapshotRow> {
    let mut result = Vec::new();
    let mut pin = None;
    loop {
        let page = store
            .bootstrap_read(&seal(binding, binding, "READ"), pin.as_ref(), 200, NOW)
            .await
            .unwrap();
        assert!(
            page.rows.len() <= 200 && serde_json::to_vec(&page.rows).unwrap().len() <= 1024 * 1024
        );
        result.extend(page.rows);
        pin = page.next;
        if pin.is_none() {
            return result;
        }
    }
}

async fn checkpoint(store: &PgProjectionStore, h: &BootstrapHandle) -> String {
    store
        .bootstrap_checkpoint(
            h,
            &seal(&h.manifest().binding, &h.manifest().binding, "CONTROL"),
            NOW,
        )
        .await
        .unwrap()
        .cursor()
        .to_owned()
}

async fn fact_count(pool: &PgPool, h: &BootstrapHandle) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM portal_projection.bootstrap_facts WHERE generation=$1")
        .bind(h.manifest().generation)
        .fetch_one(pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn t04_01_full_paged_snapshot_overlap_delete_and_immutable_history_converge() {
    let (store, pool) = db().await;
    let mut expected = vec![account("account_1")];
    expected.extend((0..205).map(|i| order(&format!("order_{i:03}"), 10)));
    let (manifest, pages) = fixture(binding(), &expected, false);
    assert_eq!(manifest.pages["orders"].count, 2);
    let h = start(&store, &manifest).await;
    stage_pages(&store, &h, &pages).await;
    assert!(finish(&store, &h).await.is_none());
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
    // An authenticated predecessor is required: a current row is not event lineage.
    let original = event(
        &h,
        2,
        "orders",
        "order_001",
        10,
        order("order_001", 10).payload,
    );
    let history = DeltaChunk {
        generation: manifest.generation,
        group_id: "history".to_owned(),
        index: 0,
        events: vec![original.clone()],
    };
    store
        .bootstrap_backfill_history(&h, &seal(&history, &manifest.binding, "HISTORY"), NOW)
        .await
        .unwrap();
    let old = event(
        &h,
        1,
        "orders",
        "order_000",
        9,
        json!({"account_id":"account_1","amount":"old"}),
    );
    let update = event(
        &h,
        3,
        "orders",
        "order_000",
        11,
        json!({"account_id":"account_1","amount":"81.0000"}),
    );
    let mut delete = event(&h, 4, "orders", "order_001", 11, json!({}));
    delete.event.operation = EventOperation::Tombstone;
    delete.event.tombstone_of_event_id = Some(original.event.event_id.clone());
    let add = event(
        &h,
        5,
        "orders",
        "order_205",
        1,
        order("order_205", 1).payload,
    );
    let (g, chunks) = group(
        &h,
        "overlap",
        &manifest.delta_start,
        &manifest.catchup_cursor,
        vec![vec![old, update.clone()], vec![delete, add.clone()]],
        true,
    );
    stage_chunks(&store, &h, &chunks).await;
    assert_eq!(
        commit(&store, &h, &g).await.cursor(),
        manifest.catchup_cursor
    );
    expected.retain(|r| r.entity_id != "order_001" && r.entity_id != "order_000");
    expected.push(row("orders", "order_000", 11, update.event.payload));
    expected.push(row("orders", "order_205", 1, add.event.payload));
    expected.sort_by(|a, b| (&a.dataset, &a.entity_id).cmp(&(&b.dataset, &b.entity_id)));
    assert_eq!(read_all(&store, &manifest.binding).await, expected);
    assert_eq!(fact_count(&pool, &h).await, 5);
    assert_eq!(checkpoint(&store, &h).await, manifest.catchup_cursor);
    println!(
        "EPG10_T04_01_TEST_ONLY rows={} facts=5 digest={}",
        expected.len(),
        digest(&expected)
    );
}

#[tokio::test]
async fn t04_02_database_disconnect_before_commit_and_lost_ack_after_commit() {
    let (store, pool) = db().await;
    let h = ready(&store, binding(), &[account("account_1")]).await;
    let e = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
    let (g, chunks) = group(
        &h,
        "disconnect",
        "opaque_overlap",
        "opaque_after",
        vec![vec![e]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    // Exact own disposable DB only: pause checkpoint write after its data work,
    // inspect from another connection, terminate that writer backend, then retry.
    sqlx::raw_sql("CREATE FUNCTION portal_projection.epg10_04_pause() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_advisory_xact_lock(90404); RETURN NEW; END $$;
      CREATE TRIGGER epg10_04_pause BEFORE UPDATE OF checkpoint_cursor ON portal_projection.bootstrap_generations
      FOR EACH ROW EXECUTE FUNCTION portal_projection.epg10_04_pause();").execute(&pool).await.unwrap();
    let mut blocker = pool.acquire().await.unwrap();
    sqlx::query("SELECT pg_advisory_lock(90404)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    let task_store = store.clone();
    let task_h = h.clone();
    let input = seal(&g, &h.manifest().binding, "GROUP");
    let task = tokio::spawn(async move {
        task_store
            .bootstrap_commit_group(&task_h, &input, NOW)
            .await
    });
    let writer = tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            if let Some(pid) = sqlx::query_scalar::<_, i32>(
                "SELECT pid FROM pg_stat_activity WHERE datname=current_database()
                AND wait_event='advisory' AND pid<>pg_backend_pid() LIMIT 1",
            )
            .fetch_optional(&pool)
            .await
            .unwrap()
            {
                break pid;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(fact_count(&pool, &h).await, 0);
    let before: String = sqlx::query_scalar(
        "SELECT checkpoint_cursor FROM portal_projection.bootstrap_generations WHERE generation=$1",
    )
    .bind(h.manifest().generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(before, "opaque_overlap");
    let killed: bool = sqlx::query_scalar("SELECT pg_terminate_backend($1)")
        .bind(writer)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(killed && task.await.unwrap().is_err());
    sqlx::query("SELECT pg_advisory_unlock(90404)")
        .execute(&mut *blocker)
        .await
        .unwrap();
    sqlx::raw_sql(
        "DROP TRIGGER epg10_04_pause ON portal_projection.bootstrap_generations;
      DROP FUNCTION portal_projection.epg10_04_pause();",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(fact_count(&pool, &h).await, 0);
    let first = commit(&store, &h, &g).await;
    let expected = read_all(&store, &h.manifest().binding).await;
    drop(store); // reconnect a new store after the durable COMMIT, before retry ACK
    let (restarted, _) = db().await;
    let resumed = start(&restarted, h.manifest()).await;
    stage_chunks(&restarted, &resumed, &chunks).await;
    assert_eq!(
        commit(&restarted, &resumed, &g).await.cursor(),
        first.cursor()
    );
    assert_eq!(fact_count(&pool, &h).await, 1);
    assert_eq!(read_all(&restarted, &h.manifest().binding).await, expected);
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.bootstrap_inputs WHERE generation=$1 AND kind='CHUNK'")
        .bind(h.manifest().generation).fetch_one(&pool).await.unwrap();
    assert_eq!(pending, 0);
}

#[tokio::test]
async fn t04_03_expiry_and_retention_require_whole_new_generation() {
    let (store, _) = db().await;
    let old = ready(&store, binding(), &[account("account_1")]).await;
    let (manifest, pages) = fixture(
        old.manifest().binding.clone(),
        &[account("account_1"), order("order_new", 1)],
        false,
    );
    let h = start(&store, &manifest).await;
    stage_pages(&store, &h, &pages[..1]).await;
    let expired = manifest.expires_at_ms + 1;
    assert!(matches!(
        store
            .bootstrap_stage_page(
                &h,
                &seal_at(&pages[1], &manifest.binding, "PAGE", expired),
                expired
            )
            .await,
        Err(BootstrapError::Protocol(ProtocolError::Expired))
    ));
    assert!(matches!(
        store
            .bootstrap_finish_snapshot(
                &h,
                &seal_at(&manifest.binding, &manifest.binding, "CONTROL", expired),
                expired
            )
            .await,
        Err(BootstrapError::Resync)
    ));
    let view = store
        .bootstrap_read(
            &seal(&manifest.binding, &manifest.binding, "READ"),
            None,
            200,
            NOW,
        )
        .await
        .unwrap();
    assert_eq!(
        (view.generation, view.state, view.rows.len()),
        (old.manifest().generation, "STALE", 1)
    );
    let replacement = ready(
        &store,
        manifest.binding.clone(),
        &[account("account_1"), order("order_new", 1)],
    )
    .await;
    assert_eq!(read_all(&store, &manifest.binding).await.len(), 2);
    assert!(store
        .bootstrap_checkpoint(
            &h,
            &seal(&manifest.binding, &manifest.binding, "CONTROL"),
            NOW
        )
        .await
        .is_err());
    store
        .bootstrap_require_resync(
            &replacement,
            &seal(&manifest.binding, &manifest.binding, "CONTROL"),
            NOW,
        )
        .await
        .unwrap();
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

#[tokio::test]
async fn t04_04_cross_dataset_group_is_invisible_until_complete_atomic_commit() {
    let (store, pool) = db().await;
    let old = ready(&store, binding(), &[account("account_1")]).await;
    let (manifest, pages) = fixture(
        old.manifest().binding.clone(),
        &[account("account_1")],
        false,
    );
    let h = start(&store, &manifest).await;
    stage_pages(&store, &h, &pages).await;
    finish(&store, &h).await;
    let order = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
    let fill = event(
        &h,
        2,
        "fills",
        "fill_1",
        1,
        json!({"order_id":"order_1","price":"123.450000"}),
    );
    let (g, chunks) = group(
        &h,
        "cross_dataset",
        &manifest.delta_start,
        &manifest.catchup_cursor,
        vec![vec![order], vec![fill]],
        true,
    );
    stage_chunks(&store, &h, &chunks[..1]).await;
    assert!(matches!(
        store
            .bootstrap_commit_group(&h, &seal(&g, &manifest.binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    assert_eq!(read_all(&store, &manifest.binding).await.len(), 1);
    assert_eq!(fact_count(&pool, &h).await, 0);
    stage_chunks(&store, &h, &chunks[1..]).await;
    commit(&store, &h, &g).await;
    assert_eq!(read_all(&store, &manifest.binding).await.len(), 3);
    let cursors: Vec<String> = sqlx::query_scalar(
        "SELECT checkpoint_cursor FROM portal_projection.bootstrap_datasets WHERE generation=$1",
    )
    .bind(manifest.generation)
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(cursors.len(), 3);
    assert!(cursors.iter().all(|c| c == &manifest.catchup_cursor));
}

#[tokio::test]
async fn t04_05_generation_and_revision_pins_prevent_mixed_page_reads() {
    let (store, pool) = db().await;
    let old = ready(
        &store,
        binding(),
        &[account("account_1"), order("order_1", 1)],
    )
    .await;
    let b = old.manifest().binding.clone();
    let first = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 1, NOW)
        .await
        .unwrap();
    let pin = first.next.unwrap();
    let old_digest: String = sqlx::query_scalar("SELECT md5(string_agg(payload::text,',' ORDER BY dataset,entity_id)) FROM portal_projection.bootstrap_rows WHERE generation=$1")
        .bind(old.manifest().generation).fetch_one(&pool).await.unwrap();
    let new = ready(
        &store,
        b.clone(),
        &[account("account_1"), order("order_2", 1)],
    )
    .await;
    assert!(matches!(
        store
            .bootstrap_read(&seal(&b, &b, "READ"), Some(&pin), 1, NOW)
            .await,
        Err(BootstrapError::Resync)
    ));
    assert!(store
        .bootstrap_checkpoint(&old, &seal(&b, &b, "CONTROL"), NOW)
        .await
        .is_err());
    let retained: String = sqlx::query_scalar("SELECT md5(string_agg(payload::text,',' ORDER BY dataset,entity_id)) FROM portal_projection.bootstrap_rows WHERE generation=$1")
        .bind(old.manifest().generation).fetch_one(&pool).await.unwrap();
    assert_eq!(old_digest, retained);
    let first = store
        .bootstrap_read(&seal(&b, &b, "READ"), None, 1, NOW)
        .await
        .unwrap();
    let e = event(&new, 1, "orders", "order_3", 1, order("order_3", 1).payload);
    let (g, chunks) = group(
        &new,
        "revision_change",
        "opaque_overlap",
        "opaque_new",
        vec![vec![e]],
        false,
    );
    stage_chunks(&store, &new, &chunks).await;
    commit(&store, &new, &g).await;
    assert!(matches!(
        store
            .bootstrap_read(&seal(&b, &b, "READ"), first.next.as_ref(), 1, NOW)
            .await,
        Err(BootstrapError::Resync)
    ));
}

#[tokio::test]
async fn t04_06_sparse_visible_positions_and_hidden_only_scan_do_not_leak_counts() {
    let (store, _) = db().await;
    let h = ready(&store, binding(), &[account("account_1")]).await;
    let b = &h.manifest().binding;
    let e1 = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
    let (one, chunks) = group(
        &h,
        "visible_one",
        "opaque_overlap",
        "opaque_scan_one",
        vec![vec![e1]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    commit(&store, &h, &one).await;
    let (hidden, _) = group(
        &h,
        "hidden_interval",
        "opaque_scan_one",
        "opaque_scan_two",
        vec![],
        false,
    );
    let hidden_receipt = commit(&store, &h, &hidden).await;
    let e3 = event(&h, 3, "orders", "order_3", 1, order("order_3", 1).payload);
    let (three, chunks) = group(
        &h,
        "visible_three",
        "opaque_scan_two",
        "opaque_scan_three",
        vec![vec![e3]],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    let receipt = commit(&store, &h, &three).await;
    assert_eq!(read_all(&store, b).await.len(), 3);
    assert_eq!(hidden_receipt.cursor(), "opaque_scan_two");
    let encoded = serde_json::to_value(&receipt).unwrap();
    assert_eq!(encoded.as_object().unwrap().len(), 2);
    for forbidden in [
        "source_sequence",
        "hidden_count",
        "scanned_through",
        "revision",
        "event_id",
    ] {
        assert!(encoded.get(forbidden).is_none());
    }
}

#[tokio::test]
async fn t04_07_missing_visible_event_or_untrusted_scan_never_advances_checkpoint() {
    let (store, pool) = db().await;
    let h = ready(&store, binding(), &[account("account_1")]).await;
    let one = event(&h, 1, "orders", "order_1", 1, order("order_1", 1).payload);
    let three = event(&h, 3, "orders", "order_3", 1, order("order_3", 1).payload);
    let (expected, _) = group(
        &h,
        "visible_loss",
        "opaque_overlap",
        "opaque_after",
        vec![vec![one.clone(), three]],
        false,
    );
    let lost = DeltaChunk {
        generation: h.manifest().generation,
        group_id: expected.group_id.clone(),
        index: 0,
        events: vec![one],
    };
    stage_chunks(&store, &h, &[lost]).await;
    assert!(matches!(
        store
            .bootstrap_commit_group(&h, &seal(&expected, &h.manifest().binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Integrity)
    ));
    assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
    assert_eq!(fact_count(&pool, &h).await, 0);
    let verifier = FixtureVerifier {
        binding: h.manifest().binding.digest().unwrap(),
        kind: "GROUP".to_owned(),
        expected: digest(&expected),
        at: NOW,
    };
    let mut forged = expected.clone();
    forged.to_cursor = "forged_scan".to_owned();
    assert_eq!(
        Verified::authenticate(
            forged,
            &h.manifest().binding,
            "GROUP",
            "TEST_ONLY_exact_proof",
            &verifier,
            NOW
        )
        .unwrap_err(),
        ProtocolError::Untrusted
    );
}

#[tokio::test]
async fn t04_08_scope_grant_revoke_epoch_change_require_authorized_resnapshot() {
    let (store, _) = db().await;
    let old = ready(
        &store,
        binding(),
        &[account("account_1"), order("order_old", 1)],
    )
    .await;
    let old_b = &old.manifest().binding;
    let first = store
        .bootstrap_read(&seal(old_b, old_b, "READ"), None, 1, NOW)
        .await
        .unwrap();
    let mut grant = old_b.clone();
    grant.policy_revision = "policy_grant_2".to_owned();
    grant.query_digest = digest(&"newly_authorized_history");
    let (m, pages) = fixture(
        grant.clone(),
        &[
            account("account_1"),
            order("order_old", 1),
            order("historical_newly_authorized", 1),
        ],
        true,
    );
    let h = start(&store, &m).await;
    assert!(store
        .bootstrap_read(&seal(old_b, old_b, "READ"), first.next.as_ref(), 200, NOW)
        .await
        .is_err());
    assert!(store
        .bootstrap_read(&seal(&grant, &grant, "READ"), None, 200, NOW)
        .await
        .is_err());
    stage_pages(&store, &h, &pages).await;
    finish(&store, &h).await;
    assert!(read_all(&store, &grant)
        .await
        .iter()
        .any(|r| r.entity_id == "historical_newly_authorized"));
    let mut revoke = grant.clone();
    revoke.policy_revision = "policy_revoke_3".to_owned();
    revoke.source_epoch = "epoch_reset_2".to_owned();
    let revoked = ready(&store, revoke.clone(), &[account("account_1")]).await;
    assert!(store
        .bootstrap_read(&seal(&grant, &grant, "READ"), None, 200, NOW)
        .await
        .is_err());
    assert!(store
        .bootstrap_checkpoint(&h, &seal(&grant, &grant, "CONTROL"), NOW)
        .await
        .is_err());
    assert_eq!(read_all(&store, &revoke).await, vec![account("account_1")]);
    assert_eq!(checkpoint(&store, &revoked).await, "opaque_overlap");
}

#[tokio::test]
async fn whole_transaction_deadline_rolls_back_without_advancing_any_checkpoint() {
    let (store, pool) = db().await;
    let h = ready(&store, binding(), &[account("account_1")]).await;
    let events = (1..=10)
        .map(|n| {
            event(
                &h,
                n,
                "orders",
                &format!("order_{n}"),
                1,
                order(&format!("order_{n}"), 1).payload,
            )
        })
        .collect();
    let (g, chunks) = group(
        &h,
        "deadline",
        "opaque_overlap",
        "opaque_after",
        vec![events],
        false,
    );
    stage_chunks(&store, &h, &chunks).await;
    // Every individual statement is under2s, while their complete transaction
    // exceeds5s. This proves a real whole-operation cap, not a renamed SQL cap.
    sqlx::raw_sql(
        "CREATE FUNCTION portal_projection.epg10_04_slow() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.6); RETURN NEW; END $$;
      CREATE TRIGGER epg10_04_slow BEFORE INSERT ON portal_projection.bootstrap_facts
      FOR EACH ROW EXECUTE FUNCTION portal_projection.epg10_04_slow();",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        store
            .bootstrap_commit_group(&h, &seal(&g, &h.manifest().binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Deadline)
    ));
    sqlx::raw_sql(
        "DROP TRIGGER epg10_04_slow ON portal_projection.bootstrap_facts;
      DROP FUNCTION portal_projection.epg10_04_slow();",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(fact_count(&pool, &h).await, 0);
    assert_eq!(checkpoint(&store, &h).await, "opaque_overlap");
    commit(&store, &h, &g).await;
    assert_eq!(fact_count(&pool, &h).await, 10);
}
