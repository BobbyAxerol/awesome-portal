//! `TEST_ONLY` fixtures and resource tripwires in the disposable loopback PG.
//! Logical memory ceilings and shared-host timings are NOT production capacity.
use std::{collections::BTreeMap, sync::Arc, time::Duration};

use authoritative_event_core::{
    bootstrap::{
        events_digest, page_seed, Binding, DeltaChunk, DeltaEvent, DeltaGroup, Limits, Manifest,
        PagePlan, Revision, SnapshotPage, SnapshotRow, SourceProofVerifier, Verified,
    },
    AuthoritativeEvent, EventOperation, EventStreamBinding, SourcePosition,
};
use chrono::{TimeDelta, Utc};
use execution_contracts::CanonicalId;
use projection_core::{
    canonical_digest, canonical_value_digest,
    resources::{
        EnvelopeLimits, ResourceEnvelope, ResourceError, StorageLimits, StorageObservation,
        WorkClass,
    },
};
use projection_store_pg::{
    bootstrap::{BootstrapError, BootstrapHandle},
    PgProjectionStore, StoreError,
};
use serde::Serialize;
use serde_json::json;
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

const NOW: i64 = 1_792_100_000_000;
fn hash(value: &impl Serialize) -> String {
    canonical_digest(value).unwrap()
}
fn id(value: impl Into<String>) -> CanonicalId {
    CanonicalId::parse(value).unwrap()
}
fn url() -> String {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let value = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("real disposable PG required");
    assert!(
        value.starts_with("postgres://")
            && value.contains("@127.0.0.1:")
            && value.ends_with("/portal_projection_test_epg10_04")
    );
    value
}
fn envelope() -> Arc<ResourceEnvelope> {
    Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 3,
            foreground_reserved: 1,
            max_entries: 8192,
            foreground_reserved_entries: 2048,
            max_bytes: 128 * 1024 * 1024,
            foreground_reserved_bytes: 40 * 1024 * 1024,
            storage_max_age: Duration::from_secs(60),
        })
        .unwrap(),
    )
}
fn storage(resources: &ResourceEnvelope, used: u64) {
    resources
        .observe_storage(
            StorageObservation {
                observed_at: Utc::now(),
                used_bytes: used,
                free_bytes: 1000,
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
}
fn limits() -> Limits {
    Limits {
        page_rows: 200,
        page_bytes: 1024 * 1024,
        group_events: 1000,
        group_bytes: 8 * 1024 * 1024,
        group_chunks: 64,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}
struct Proof(String, String, String);
impl SourceProofVerifier for Proof {
    fn verify(&self, binding: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        binding.digest().ok().as_ref() == Some(&self.0)
            && kind == self.1
            && input == self.2
            && proof == "TEST_ONLY"
            && now == NOW
    }
}
fn verified<T: Clone + Serialize>(value: &T, binding: &Binding, kind: &str) -> Verified<T> {
    Verified::authenticate(
        value.clone(),
        binding,
        kind,
        "TEST_ONLY",
        &Proof(binding.digest().unwrap(), kind.to_owned(), hash(value)),
        NOW,
    )
    .unwrap()
}
fn fixture() -> (Manifest, SnapshotPage) {
    let mut manifest = Manifest {
        binding: Binding {
            source: EventStreamBinding {
                stream_id: "TEST_ONLY.resources".to_owned(),
                contract_revision: "TEST_ONLY.v1".to_owned(),
                workspace_id: id("TEST_ONLY.workspace"),
                environment: "paper".to_owned(),
                profile_id: "TEST_ONLY.paper".to_owned(),
                venue_id: "FIXTURE".to_owned(),
                resource_kind: "portfolio".to_owned(),
                resource_id: "TEST_ONLY.portfolio".to_owned(),
                filter_digest: hash(&"filter"),
            },
            source_epoch: "TEST_ONLY.epoch".to_owned(),
            consumer_id: Uuid::now_v7().to_string(),
            principal_digest: hash(&"principal"),
            policy_revision: "policy1".to_owned(),
            query_digest: hash(&"query"),
            consistency_group: "TEST_ONLY.group".to_owned(),
            datasets: BTreeMap::from([("orders".to_owned(), "orders.v1".to_owned())]),
        },
        generation: Uuid::now_v7(),
        snapshot_id: Uuid::now_v7().to_string(),
        barrier: "opaque_B".to_owned(),
        delta_start: "opaque_start".to_owned(),
        catchup_cursor: "opaque_start".to_owned(),
        expires_at_ms: NOW + 60_000,
        rollback_until_ms: NOW + 120_000,
        pages: BTreeMap::new(),
        references: vec![],
    };
    let page = SnapshotPage {
        generation: manifest.generation,
        dataset: "orders".to_owned(),
        index: 0,
        previous_digest: page_seed(&manifest, "orders").unwrap(),
        rows: vec![SnapshotRow {
            dataset: "orders".to_owned(),
            entity_id: "order1".to_owned(),
            revision: Revision {
                ordinal: 1,
                opaque: "v1".to_owned(),
            },
            payload: json!({"amount":"9007199254740993.000000000001"}),
        }],
    };
    manifest.pages.insert(
        "orders".to_owned(),
        PagePlan {
            count: 1,
            final_digest: page.chain_digest().unwrap(),
        },
    );
    (manifest, page)
}
async fn db() -> (PgProjectionStore, PgPool, Arc<ResourceEnvelope>) {
    let resources = envelope();
    storage(&resources, 0);
    let store = PgProjectionStore::connect_with_resources(&url(), resources.clone(), 3)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .connect(&url())
        .await
        .unwrap();
    (store, pool, resources)
}
async fn ready(store: &PgProjectionStore) -> BootstrapHandle {
    let (manifest, page) = fixture();
    let h = store
        .bootstrap_begin(
            &verified(&manifest, &manifest.binding, "MANIFEST"),
            limits(),
            NOW,
        )
        .await
        .unwrap();
    store
        .bootstrap_stage_page(&h, &verified(&page, &manifest.binding, "PAGE"), NOW)
        .await
        .unwrap();
    assert!(store
        .bootstrap_finish_snapshot(
            &h,
            &verified(&manifest.binding, &manifest.binding, "CONTROL"),
            NOW
        )
        .await
        .unwrap()
        .is_some());
    h
}
fn delta(h: &BootstrapHandle) -> (DeltaChunk, DeltaGroup) {
    let payload = json!({"amount":"1.000000000001"});
    let event = DeltaEvent {
        revision: Revision {
            ordinal: 2,
            opaque: "v2".to_owned(),
        },
        event: AuthoritativeEvent {
            event_id: id("event2"),
            source_position: SourcePosition::new("TEST_ONLY.epoch", "2").unwrap(),
            entity_kind: "orders".to_owned(),
            entity_id: id("order1"),
            entity_version: "v2".to_owned(),
            payload_schema_revision: "orders.v1".to_owned(),
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
    };
    let chunk = DeltaChunk {
        generation: h.manifest().generation,
        group_id: "group2".to_owned(),
        index: 0,
        events: vec![event],
    };
    let group = DeltaGroup {
        generation: h.manifest().generation,
        group_id: chunk.group_id.clone(),
        from_cursor: "opaque_start".to_owned(),
        to_cursor: "opaque_next".to_owned(),
        chunk_digests: vec![chunk.digest().unwrap()],
        events_digest: events_digest(&chunk.events).unwrap(),
        reached_catchup: false,
    };
    (chunk, group)
}
async fn checkpoint(store: &PgProjectionStore, h: &BootstrapHandle) -> String {
    store
        .bootstrap_checkpoint(
            h,
            &verified(&h.manifest().binding, &h.manifest().binding, "CONTROL"),
            NOW,
        )
        .await
        .unwrap()
        .cursor()
        .to_owned()
}

#[tokio::test]
async fn governed_pool_rejects_insufficient_capacity_before_connect() {
    for cap in [0, 2, 65] {
        assert!(matches!(
            PgProjectionStore::connect_with_resources("not-a-database", envelope(), cap).await,
            Err(StoreError::Resource(ResourceError::Config))
        ));
    }
}

#[tokio::test]
async fn absent_storage_refuses_bootstrap_without_creating_generation() {
    let (store, pool, _) = db().await;
    let resources = envelope();
    let governed = PgProjectionStore::connect_with_resources(&url(), resources, 3)
        .await
        .unwrap();
    let (m, _) = fixture();
    assert!(matches!(
        governed
            .bootstrap_begin(&verified(&m, &m.binding, "MANIFEST"), limits(), NOW)
            .await,
        Err(BootstrapError::Resource(ResourceError::StorageStale))
    ));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_generations WHERE generation=$1",
    )
    .bind(m.generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    store.ping().await.unwrap();
}

#[tokio::test]
async fn high_water_pauses_bootstrap_and_history_but_live_delta_and_control_progress() {
    let (store, _, resources) = db().await;
    let h = ready(&store).await;
    let (chunk, group) = delta(&h);
    storage(&resources, 200);
    let (m, _) = fixture();
    assert!(matches!(
        store
            .bootstrap_begin(&verified(&m, &m.binding, "MANIFEST"), limits(), NOW)
            .await,
        Err(BootstrapError::Resource(ResourceError::StorageHigh))
    ));
    assert!(matches!(
        store
            .bootstrap_backfill_history(
                &h,
                &verified(&chunk, &h.manifest().binding, "HISTORY"),
                NOW
            )
            .await,
        Err(BootstrapError::Resource(ResourceError::StorageHigh))
    ));
    store
        .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
        .await
        .unwrap();
    let ack = store
        .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(ack.cursor(), "opaque_next");
    assert_eq!(checkpoint(&store, &h).await, ack.cursor());
}

#[tokio::test]
async fn hard_water_never_acks_and_resume_matches_exact_payload_checkpoint() {
    let (store, pool, resources) = db().await;
    let h = ready(&store).await;
    let (chunk, group) = delta(&h);
    store
        .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
        .await
        .unwrap();
    storage(&resources, 300);
    assert!(matches!(
        store
            .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
            .await,
        Err(BootstrapError::Resource(ResourceError::StorageHard))
    ));
    assert_eq!(checkpoint(&store, &h).await, "opaque_start");
    storage(&resources, 0);
    for _ in 0..2 {
        store
            .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
            .await
            .unwrap();
    }
    let digest: String = sqlx::query_scalar("SELECT payload_digest FROM portal_projection.bootstrap_rows WHERE generation=$1 AND entity_id='order1'")
        .bind(h.manifest().generation).fetch_one(&pool).await.unwrap();
    assert_eq!(digest, chunk.events[0].event.payload_digest);
    let facts: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.bootstrap_facts WHERE generation=$1",
    )
    .bind(h.manifest().generation)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(facts, 1);
    assert_eq!(checkpoint(&store, &h).await, "opaque_next");
}

#[tokio::test]
async fn background_slots_cannot_starve_live_delta_or_control_pool_capacity() {
    let (store, _, resources) = db().await;
    let h = ready(&store).await;
    let a = resources
        .try_acquire(WorkClass::BackgroundRead, 1, 1, Utc::now())
        .unwrap();
    let b = resources
        .try_acquire(WorkClass::BackgroundWrite, 1, 1, Utc::now())
        .unwrap();
    let (chunk, group) = delta(&h);
    assert!(matches!(
        store
            .bootstrap_backfill_history(
                &h,
                &verified(&chunk, &h.manifest().binding, "HISTORY"),
                NOW
            )
            .await,
        Err(BootstrapError::Resource(ResourceError::Busy))
    ));
    store
        .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
        .await
        .unwrap();
    store
        .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(checkpoint(&store, &h).await, "opaque_next");
    drop((a, b));
    assert_eq!(resources.stats().unwrap().active, 0);
}

#[tokio::test]
async fn cancellation_releases_admission_and_rolls_back_uncommitted_group() {
    let (store, pool, resources) = db().await;
    let h = ready(&store).await;
    let (chunk, group) = delta(&h);
    store
        .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
        .await
        .unwrap();
    let mut blocker = pool.begin().await.unwrap();
    let blocker_pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
        .fetch_one(&mut *blocker)
        .await
        .unwrap();
    sqlx::query(
        "SELECT slot_key FROM portal_projection.bootstrap_streams WHERE slot_key=$1 FOR UPDATE",
    )
    .bind(h.manifest().binding.slot_key().unwrap())
    .execute(&mut *blocker)
    .await
    .unwrap();
    let task = {
        let store = store.clone();
        let h = h.clone();
        let group = group.clone();
        tokio::spawn(async move {
            store
                .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
                .await
        })
    };
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let waiting_for_lock: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)))",
            )
            .bind(blocker_pid)
            .fetch_one(&pool)
            .await
            .unwrap();
            if waiting_for_lock {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(resources.stats().unwrap().active, 1);
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    blocker.rollback().await.unwrap();
    assert_eq!(resources.stats().unwrap().active, 0);
    assert_eq!(checkpoint(&store, &h).await, "opaque_start");
    store
        .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(checkpoint(&store, &h).await, "opaque_next");
}

#[tokio::test]
async fn expired_or_future_storage_never_advances_checkpoint() {
    let (store, _, _) = db().await;
    let h = ready(&store).await;
    let (chunk, _) = delta(&h);
    for offset in [-120, 120] {
        let resources = envelope();
        let store = PgProjectionStore::connect_with_resources(&url(), resources.clone(), 3)
            .await
            .unwrap();
        resources
            .observe_storage(
                StorageObservation {
                    observed_at: Utc::now() + TimeDelta::seconds(offset),
                    used_bytes: 0,
                    free_bytes: 1000,
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
        assert!(matches!(
            store
                .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
                .await,
            Err(BootstrapError::Resource(ResourceError::StorageStale))
        ));
        assert_eq!(checkpoint(&store, &h).await, "opaque_start");
    }
}

#[tokio::test]
async fn byte_pressure_fails_before_pool_and_resync_remains_bounded() {
    let (store, _, resources) = db().await;
    let h = ready(&store).await;
    // Registered cache/queues occupy only the nonreserved logical capacity.
    let lease = resources.try_register(1, 88 * 1024 * 1024).unwrap();
    let (m, _) = fixture();
    assert!(matches!(
        store
            .bootstrap_begin(&verified(&m, &m.binding, "MANIFEST"), limits(), NOW)
            .await,
        Err(BootstrapError::Resource(ResourceError::Bytes))
    ));
    let (chunk, group) = delta(&h);
    store
        .bootstrap_stage_delta(&h, &verified(&chunk, &h.manifest().binding, "CHUNK"), NOW)
        .await
        .unwrap();
    store
        .bootstrap_commit_group(&h, &verified(&group, &h.manifest().binding, "GROUP"), NOW)
        .await
        .unwrap();
    assert_eq!(checkpoint(&store, &h).await, "opaque_next");
    drop(lease);
    assert_eq!(resources.stats().unwrap().active, 0);
}
