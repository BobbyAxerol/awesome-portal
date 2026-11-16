//! `TEST_ONLY`: bounded synthetic Manager views in the owned disposable real PG.
//! No source requests, operational credentials, mutations or capacity claims.

use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use manager_projection::FEEDS;
use projection_core::{
    canonical_digest, semantic_state_digest, ProjectedEntity, ProjectionEntityKey,
    ProjectionEntityKind, ProjectionObservation, ProjectionOperation, ProjectionScope,
    ProjectionSnapshot, SnapshotCompleteness, SourceSequenceSemantics,
};
use projection_store_pg::{
    manager_snapshot_semantic_digest, EpochMetadata, ManagerAnalyticsSubject,
    ManagerAnalyticsSubjectKind, ManagerCycleCommitInput, ManagerFeedObservation,
    ManagerProjectionCycleReceipt, ManagerProjectionLeaseAcquireOutcome,
    ManagerProjectionLeaseGrant, ManagerSnapshotCommitInput, ManagerSourceAttempt,
    ManagerSourceHealth, PgProjectionStore, StoreApplyOutcome, StoreError,
};
use query_api::{
    CursorBoundary, CursorCodec, CursorContext, CursorDirection, CursorScalar, EntityQueryRequest,
    FilterField, FilterOperator, QueryAllowlist, QueryError, QueryFilter,
};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

const ADAPTER: &str = "portal.execution.manager-projection.manager-v2.runtime.v6";
const KINDS: [ProjectionEntityKind; 8] = [
    ProjectionEntityKind::Account,
    ProjectionEntityKind::Event,
    ProjectionEntityKind::Fill,
    ProjectionEntityKind::Order,
    ProjectionEntityKind::Performance,
    ProjectionEntityKind::Position,
    ProjectionEntityKind::Reconciliation,
    ProjectionEntityKind::Runtime,
];
type View = BTreeMap<String, Value>;

fn id(value: impl Into<String>) -> CanonicalId {
    CanonicalId::parse(value).unwrap()
}
fn hash(value: &impl serde::Serialize) -> String {
    canonical_digest(value).unwrap()
}
fn at(step: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(1_700_000_000 + step, 0).unwrap()
}
fn rows(count: usize) -> View {
    (0..count)
        .map(|n| {
            (
                format!("TEST_ONLY.order.{n:04}"),
                json!({"quantity":"1.000000000000000001","state":"OPEN"}),
            )
        })
        .collect()
}

struct Fixture {
    store: PgProjectionStore,
    pool: PgPool,
    scope: ProjectionScope,
    epoch: Uuid,
    lease: ManagerProjectionLeaseGrant,
    catalogue: String,
}
impl Fixture {
    async fn new() -> Self {
        assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
        let url = std::env::var("TEST_PROJECTION_DATABASE_URL")
            .expect("owned disposable PG required; never skip");
        assert!(
            url.starts_with("postgres://")
                && url.contains("@127.0.0.1:")
                && url.ends_with("/portal_projection_test_epg10_04")
        );
        let store = PgProjectionStore::connect(&url).await.unwrap();
        store.migrate().await.unwrap();
        store.migrate().await.unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .unwrap();
        let scope = ProjectionScope::new(
            id(format!("TEST_ONLY.manager.{}", Uuid::now_v7().simple())),
            "paper",
        )
        .unwrap();
        let catalogue = hash(&"TEST_ONLY.catalogue");
        let epoch = store
            .create_building_epoch(
                &scope,
                &EpochMetadata {
                    adapter_version: ADAPTER.to_owned(),
                    source_gateway_digest: hash(&"TEST_ONLY.gateway"),
                    capability_snapshot_id: catalogue.clone(),
                },
                Utc::now(),
            )
            .await
            .unwrap();
        let lease = match store
            .acquire_manager_projection_lease(
                &scope,
                epoch,
                Uuid::now_v7(),
                &hash(&"TEST_ONLY.owner"),
                Duration::from_secs(300),
            )
            .await
            .unwrap()
        {
            ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
            ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => {
                panic!("new scope must acquire")
            }
        };
        Self {
            store,
            pool,
            scope,
            epoch,
            lease,
            catalogue,
        }
    }
    fn cycle(&self, view: &View, step: i64) -> ManagerCycleCommitInput {
        ManagerCycleCommitInput {
            cycle_id: id("unresolved"),
            profile_id: "PAPER_BINANCE_USDM".to_owned(),
            catalogue_digest: self.catalogue.clone(),
            source_input_digest: hash(&(ADAPTER, &self.catalogue, view)),
            feed_count: 13,
            record_count: view.len(),
            source_read_at: at(step),
            poll_interval_ms: 2_000,
        }
    }
    async fn resolve(&self, view: &View, step: i64) -> ManagerCycleCommitInput {
        let mut input = self.cycle(view, step);
        input.cycle_id = self
            .store
            .manager_projection_cycle_id(&self.scope, self.epoch, self.lease.proof(), &input)
            .await
            .unwrap();
        input
    }
    fn snapshot(
        &self,
        view: &View,
        cycle: &ManagerCycleCommitInput,
        kind: ProjectionEntityKind,
    ) -> ManagerSnapshotCommitInput {
        let observations: Vec<_> = view
            .iter()
            .filter(|_| kind == ProjectionEntityKind::Order)
            .map(|(key, payload)| ProjectionObservation {
                ingestion_id: id(format!(
                    "ingest-{}",
                    hash(&(cycle.cycle_id.as_str(), key, payload))
                )),
                entity: ProjectionEntityKey {
                    kind,
                    entity_id: id(key),
                },
                source_authority: SourceAuthority::Execution,
                as_of: Some(at(0)),
                source_read_at: cycle.source_read_at,
                source_cursor: Some(SourceCursor {
                    event_ts: cycle.source_read_at,
                    created_at: cycle.source_read_at,
                    event_id: cycle.cycle_id.clone(),
                }),
                source_sequence: None,
                source_sequence_semantics: SourceSequenceSemantics::PerEntityContiguous,
                operation: ProjectionOperation::Upsert,
                source_completeness: SourceCompleteness::PollBounded,
                poll_interval_ms: Some(2_000),
                adapter_version: ADAPTER.to_owned(),
                capability_snapshot_id: self.catalogue.clone(),
                payload: payload.clone(),
            })
            .collect();
        let source_input_digest = manager_snapshot_semantic_digest(&observations).unwrap();
        let snapshot = ProjectionSnapshot::new(
            id(format!(
                "snapshot-{}",
                hash(&(cycle.cycle_id.as_str(), kind, &source_input_digest))
            )),
            kind,
            SnapshotCompleteness::Complete,
            observations.len(),
            observations,
        )
        .unwrap();
        ManagerSnapshotCommitInput {
            cycle_id: cycle.cycle_id.clone(),
            profile_id: cycle.profile_id.clone(),
            catalogue_digest: self.catalogue.clone(),
            source_input_digest,
            source_read_at: cycle.source_read_at,
            poll_interval_ms: 2_000,
            snapshot,
        }
    }
    async fn commit_snapshots(
        &self,
        view: &View,
        cycle: &ManagerCycleCommitInput,
    ) -> (usize, usize) {
        let mut applied = 0;
        let mut removed = 0;
        for kind in KINDS {
            let receipt = self
                .store
                .commit_manager_projection_snapshot(
                    &self.scope,
                    self.epoch,
                    self.lease.proof(),
                    &self.snapshot(view, cycle, kind),
                    cycle.source_read_at + TimeDelta::milliseconds(100),
                )
                .await
                .unwrap();
            // Durable retries return the original receipt counters, not new writes.
            if !receipt.already_durable {
                applied += receipt.applied_count;
                removed += receipt.removed_count;
            }
        }
        (applied, removed)
    }
    async fn seal(&self, cycle: &ManagerCycleCommitInput) -> ManagerProjectionCycleReceipt {
        self.store
            .commit_manager_projection_cycle(
                &self.scope,
                self.epoch,
                self.lease.proof(),
                cycle,
                cycle.source_read_at + TimeDelta::milliseconds(200),
            )
            .await
            .unwrap()
    }
    async fn commit(
        &self,
        view: &View,
        step: i64,
    ) -> (
        ManagerCycleCommitInput,
        ManagerProjectionCycleReceipt,
        usize,
        usize,
    ) {
        let cycle = self.resolve(view, step).await;
        let (applied, removed) = self.commit_snapshots(view, &cycle).await;
        let receipt = self.seal(&cycle).await;
        self.assert_oracle(view, &receipt.state_digest).await;
        (cycle, receipt, applied, removed)
    }
    async fn assert_oracle(&self, expected: &View, receipt: &str) {
        let actual: Vec<(String, Value)> = sqlx::query_as(
            "SELECT entity_id,payload FROM portal_projection.entities WHERE epoch_id=$1 ORDER BY entity_id LIMIT 80001",
        ).bind(self.epoch).fetch_all(&self.pool).await.unwrap();
        // Independent full materialized business-view oracle, not a replay of the candidate diff.
        assert_eq!(&actual.into_iter().collect::<View>(), expected);
        let mut entities: Vec<ProjectedEntity> = Vec::new();
        for key in expected.keys() {
            entities.push(
                self.store
                    .load_entity(
                        self.epoch,
                        &ProjectionEntityKey {
                            kind: ProjectionEntityKind::Order,
                            entity_id: id(key),
                        },
                    )
                    .await
                    .unwrap()
                    .unwrap(),
            );
        }
        assert_eq!(semantic_state_digest(&entities).unwrap(), receipt);
    }
    async fn xmin(&self) -> BTreeMap<String, String> {
        let values: Vec<(String,String)> = sqlx::query_as(
            "SELECT entity_id,xmin::text FROM portal_projection.entities WHERE epoch_id=$1 ORDER BY entity_id LIMIT 80001",
        ).bind(self.epoch).fetch_all(&self.pool).await.unwrap();
        values.into_iter().collect()
    }
    async fn journal_count(&self) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM portal_projection.event_journal WHERE epoch_id=$1")
            .bind(self.epoch)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
    async fn seed_bulk_current(&self, count: i32) {
        // Disposable TEST_ONLY epoch only; do not weaken schema constraints.
        sqlx::query(
            "INSERT INTO portal_projection.entities
             (epoch_id,entity_kind,entity_id,projection_sequence,source_authority,
              source_read_at,projected_at,source_completeness,poll_interval_ms,
              adapter_version,capability_snapshot_id,payload_digest,payload)
             SELECT $1,'ORDER','TEST_ONLY.bulk.'||n::text,1,'EXECUTION',$2,$2,
                    'POLL_BOUNDED',2000,$3,$4,$5,'{}'::jsonb
             FROM generate_series(1,$6::integer) AS n",
        )
        .bind(self.epoch)
        .bind(at(0))
        .bind(ADAPTER)
        .bind(&self.catalogue)
        .bind(hash(&"TEST_ONLY.bulk"))
        .bind(count)
        .execute(&self.pool)
        .await
        .unwrap();
    }
    async fn full_refresh_reference(&self, view: &View, step: i64) -> usize {
        // Existing generic reducer, intentionally refreshing every row. This is
        // a correctness reference, NOT the old N24 already-incremental writer.
        let mut cycle = self.cycle(view, step);
        cycle.cycle_id = id(format!("TEST_ONLY.full-reference-{step}"));
        let snapshot = self.snapshot(view, &cycle, ProjectionEntityKind::Order);
        let mut applied = 0;
        for observation in &snapshot.snapshot.observations {
            let result = self
                .store
                .apply_observation(
                    &self.scope,
                    self.epoch,
                    "TEST_ONLY.full-reference",
                    observation,
                    cycle.source_read_at + TimeDelta::milliseconds(100),
                )
                .await
                .unwrap();
            assert!(matches!(
                result,
                StoreApplyOutcome::Applied { .. } | StoreApplyOutcome::Refreshed { .. }
            ));
            applied += 1;
        }
        let actual: Vec<(String, Value)> = sqlx::query_as(
            "SELECT entity_id,payload FROM portal_projection.entities WHERE epoch_id=$1 ORDER BY entity_id LIMIT 80001",
        ).bind(self.epoch).fetch_all(&self.pool).await.unwrap();
        assert_eq!(&actual.into_iter().collect::<View>(), view);
        applied
    }
}

#[tokio::test]
async fn manager_recurrence_restores_full_snapshot_oracle() {
    let f = Fixture::new().await;
    let a = rows(128);
    let (first, _, applied, _) = f.commit(&a, 1).await;
    assert_eq!(applied, 128);
    let mut b = a.clone();
    b.get_mut("TEST_ONLY.order.0000").unwrap()["quantity"] = json!("2.000000000000000001");
    assert_eq!(f.commit(&b, 2).await.2, 1);
    let (last, _, applied, removed) = f.commit(&a, 3).await;
    assert_ne!(last.cycle_id, first.cycle_id);
    assert_eq!((applied, removed), (1, 0));
    assert_eq!(f.journal_count().await, 130);
}

#[tokio::test]
async fn manager_changed_key_cost_is_bounded_and_unchanged_is_noop() {
    let f = Fixture::new().await;
    let mut view = rows(128);
    let (first, _, _, _) = f.commit(&view, 1).await;
    let snapshot = f.snapshot(&view, &first, ProjectionEntityKind::Order);
    let baseline = Instant::now();
    for observation in &snapshot.snapshot.observations {
        let existing: Option<String> = sqlx::query_scalar(
            "SELECT input_digest FROM portal_projection.ingestion_keys WHERE epoch_id=$1 AND ingestion_id=$2",
        ).bind(f.epoch).bind(observation.ingestion_id.as_str()).fetch_optional(&f.pool).await.unwrap();
        assert!(existing.is_some());
    }
    let baseline_record_lookup_elapsed_us = baseline.elapsed().as_micros();
    let before = f.xmin().await;
    view.get_mut("TEST_ONLY.order.0001").unwrap()["state"] = json!("CORRECTED");
    let wal_before: String = sqlx::query_scalar("SELECT pg_current_wal_insert_lsn()::text")
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let started = Instant::now();
    let cycle = f.resolve(&view, 2).await;
    let (applied, removed) = f.commit_snapshots(&view, &cycle).await;
    let candidate_receipt = f.seal(&cycle).await;
    let applied_entities = applied;
    let elapsed = started.elapsed().as_micros();
    let wal_bytes: i64 = sqlx::query_scalar(
        "SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1::pg_lsn)::bigint",
    )
    .bind(&wal_before)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    f.assert_oracle(&view, &candidate_receipt.state_digest)
        .await;
    let after = f.xmin().await;
    let changed = before
        .iter()
        .filter(|(key, xmin)| after.get(*key) != Some(*xmin))
        .count();
    assert_eq!((applied, removed, changed), (1, 0, 1));
    let journal = f.journal_count().await;
    let (same, receipt, applied, removed) = f.commit(&view, 3).await;
    assert_eq!(same.cycle_id, cycle.cycle_id);
    assert!(receipt.already_durable);
    assert_eq!((applied, removed), (0, 0));
    assert_eq!(f.xmin().await, after);
    assert_eq!(f.journal_count().await, journal);
    let reference = Fixture::new().await;
    reference.full_refresh_reference(&rows(128), 1).await;
    let reference_wal: String = sqlx::query_scalar("SELECT pg_current_wal_insert_lsn()::text")
        .fetch_one(&reference.pool)
        .await
        .unwrap();
    let reference_started = Instant::now();
    let baseline_full_snapshot_applied_entities = reference.full_refresh_reference(&view, 2).await;
    let baseline_full_snapshot_elapsed_us = reference_started.elapsed().as_micros();
    let baseline_full_snapshot_wal_bytes: i64 = sqlx::query_scalar(
        "SELECT pg_wal_lsn_diff(pg_current_wal_insert_lsn(),$1::pg_lsn)::bigint",
    )
    .bind(&reference_wal)
    .fetch_one(&reference.pool)
    .await
    .unwrap();
    assert_eq!(baseline_full_snapshot_applied_entities, 128);
    println!(
        "\nEPG10_COST_JSON={}",
        json!({
            "schema":"epg10.manager-cost.v1", "provenance":"TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL",
            "tainted_for_capacity":true, "entities":128, "changed_entities":1,
            "baseline_record_lookup_commands":128, "baseline_record_lookup_elapsed_us":baseline_record_lookup_elapsed_us,
            "candidate_current_bulk_reads":1, "candidate_unchanged_record_lookups":0,
            "applied_entities":applied_entities, "removed_entities":0, "unchanged_entities":127,
            "candidate_cycle_elapsed_us":elapsed, "candidate_wal_bytes":wal_bytes,
            "baseline_full_snapshot_elapsed_us":baseline_full_snapshot_elapsed_us,
            "baseline_full_snapshot_wal_bytes":baseline_full_snapshot_wal_bytes,
            "baseline_full_snapshot_applied_entities":baseline_full_snapshot_applied_entities,
        })
    );
}

#[tokio::test]
async fn manager_unproven_absence_rejects_poll_and_preserves_previous_state() {
    let f = Fixture::new().await;
    let full = rows(3);
    let (_, receipt, _, _) = f.commit(&full, 1).await;
    let before = f.xmin().await;
    let journal_before = f.journal_count().await;

    // A row can be omitted by a concurrent predicate change between pages;
    // neither that omission nor a real deletion is authoritative here.
    let mut incomplete = full.clone();
    incomplete.remove("TEST_ONLY.order.0001");
    incomplete.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let pending = f.resolve(&incomplete, 2).await;
    let input = f.snapshot(&incomplete, &pending, ProjectionEntityKind::Order);
    for _ in 0..2 {
        assert!(matches!(
            f.store
                .commit_manager_projection_poll_without_absence_authority(
                    &f.scope,
                    f.epoch,
                    f.lease.proof(),
                    &input,
                    &BTreeMap::new(),
                    at(2),
                )
                .await,
            Err(StoreError::ManagerProjectionMissingAbsenceAuthority)
        ));
        assert_eq!(f.xmin().await, before);
        assert_eq!(f.journal_count().await, journal_before);
        f.assert_oracle(&full, &receipt.state_digest).await;
    }

    // A later poll that observes the omitted identity can apply corrections;
    // no fabricated delete/recreate or duplicate journal entry is emitted.
    let mut recovered = full.clone();
    recovered.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let next = f.resolve(&recovered, 3).await;
    let next_input = f.snapshot(&recovered, &next, ProjectionEntityKind::Order);
    let applied = f
        .store
        .commit_manager_projection_poll_without_absence_authority(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &next_input,
            &BTreeMap::new(),
            at(3),
        )
        .await
        .unwrap();
    assert_eq!((applied.applied_count, applied.removed_count), (1, 0));
    assert_eq!(f.journal_count().await, journal_before + 1);
}

#[tokio::test]
async fn manager_delete_readd_delete_does_not_reuse_historical_tombstone() {
    let f = Fixture::new().await;
    let full = rows(3);
    f.commit(&full, 1).await;
    let mut removed = full.clone();
    removed.remove("TEST_ONLY.order.0001");
    assert_eq!(f.commit(&removed, 2).await.3, 1);
    assert_eq!(f.commit(&full, 3).await.2, 1);
    assert_eq!(f.commit(&removed, 4).await.3, 1);
    assert_eq!(f.journal_count().await, 6);
}

#[tokio::test]
async fn manager_large_current_rows_stream_through_correction_deletion_and_retry() {
    let f = Fixture::new().await;
    let mut view = rows(512);
    // Eight MiB of TEST_ONLY payload crosses multiple SQL transport buffers.
    // This exercises complete draining, not a production RSS/capacity claim.
    let detail = "TEST_ONLY_DETAIL_".repeat(1024);
    for payload in view.values_mut() {
        payload["detail"] = json!(detail);
        payload["exact"] = json!("9007199254740993.000000000000000001");
    }
    assert_eq!(f.commit(&view, 1).await.2, 512);
    let before = f.xmin().await;
    view.get_mut("TEST_ONLY.order.0511").unwrap()["state"] = json!("CORRECTED");
    view.remove("TEST_ONLY.order.0256");
    let (_, _, applied, removed) = f.commit(&view, 2).await;
    assert_eq!((applied, removed), (1, 1));
    let after = f.xmin().await;
    for key in view
        .keys()
        .filter(|key| key.as_str() != "TEST_ONLY.order.0511")
    {
        assert_eq!(before.get(key), after.get(key));
    }
    assert_ne!(
        before.get("TEST_ONLY.order.0511"),
        after.get("TEST_ONLY.order.0511")
    );
    assert_eq!(f.journal_count().await, 514);
    // A second complete drain must preserve durable no-op/retry semantics,
    // including the final row and the prior deletion, without rewriting peers.
    let (_, receipt, applied, removed) = f.commit(&view, 3).await;
    assert!(receipt.already_durable);
    assert_eq!((applied, removed), (0, 0));
    assert_eq!(f.xmin().await, after);
    assert_eq!(f.journal_count().await, 514);
}

#[tokio::test]
async fn manager_current_stream_decode_failure_rolls_back_and_original_retry_recovers() {
    let f = Fixture::new().await;
    let mut view = rows(2);
    f.commit(&view, 1).await;
    let original_cursor: String = sqlx::query_scalar(
        "SELECT source_event_id FROM portal_projection.entities
         WHERE epoch_id=$1 AND entity_id='TEST_ONLY.order.0001'",
    )
    .bind(f.epoch)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    // All cursor columns remain non-null: no SQL constraint is weakened.
    // The second row fails the existing CanonicalId decoder after a valid row.
    sqlx::query(
        "UPDATE portal_projection.entities SET source_event_id=''
         WHERE epoch_id=$1 AND entity_id='TEST_ONLY.order.0001'",
    )
    .bind(f.epoch)
    .execute(&f.pool)
    .await
    .unwrap();
    let before = f.xmin().await;
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let cycle = f.resolve(&view, 2).await;
    let input = f.snapshot(&view, &cycle, ProjectionEntityKind::Order);
    let commits_before: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.manager_projection_commits WHERE epoch_id=$1",
    )
    .bind(f.epoch)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert!(f
        .store
        .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &input, at(2),)
        .await
        .is_err());
    assert_eq!(f.xmin().await, before);
    assert_eq!(f.journal_count().await, 2);
    let commits_after: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.manager_projection_commits WHERE epoch_id=$1",
    )
    .bind(f.epoch)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!(commits_after, commits_before);
    sqlx::query(
        "UPDATE portal_projection.entities SET source_event_id=$2
         WHERE epoch_id=$1 AND entity_id='TEST_ONLY.order.0001'",
    )
    .bind(f.epoch)
    .bind(original_cursor)
    .execute(&f.pool)
    .await
    .unwrap();
    let recovered = f
        .store
        .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &input, at(2))
        .await
        .unwrap();
    assert_eq!((recovered.applied_count, recovered.removed_count), (1, 0));
    assert_eq!(f.commit_snapshots(&view, &cycle).await, (0, 0));
    let receipt = f.seal(&cycle).await;
    f.assert_oracle(&view, &receipt.state_digest).await;
    assert_eq!(f.journal_count().await, 3);
}

#[tokio::test]
async fn manager_current_stream_rejects_persisted_row_80001_without_partial_commit() {
    let f = Fixture::new().await;
    let view = View::new();
    let cycle = f.resolve(&view, 1).await;
    let input = f.snapshot(&view, &cycle, ProjectionEntityKind::Order);
    // Direct TEST_ONLY fixture rows, in this disposable epoch only. Exercise
    // the database-result sentinel, not merely an oversized incoming count.
    f.seed_bulk_current(80001).await;
    assert!(matches!(
        f.store
            .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &input, at(1),)
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    let retained: i64 =
        sqlx::query_scalar("SELECT count(*) FROM portal_projection.entities WHERE epoch_id=$1")
            .bind(f.epoch)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let commits: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.manager_projection_commits WHERE epoch_id=$1",
    )
    .bind(f.epoch)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert_eq!((retained, commits, f.journal_count().await), (80001, 0, 0));
}

#[tokio::test]
async fn manager_epoch_stream_refuses_row_80001_and_original_receipt_recovers() {
    let f = Fixture::new().await;
    let view = rows(1);
    let (first, _, _, _) = f.commit(&view, 1).await;
    f.seed_bulk_current(80000).await;
    let same = f.cycle(&view, 2);
    assert!(matches!(
        f.store
            .manager_projection_cycle_id(&f.scope, f.epoch, f.lease.proof(), &same,)
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    let retained: i64 =
        sqlx::query_scalar("SELECT count(*) FROM portal_projection.entities WHERE epoch_id=$1")
            .bind(f.epoch)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!((retained, f.journal_count().await), (80001, 1));
    // Repair only the fixture corruption and reuse the same original receipt
    // request, proving the aborted stream did not poison the transaction pool.
    sqlx::query(
        "DELETE FROM portal_projection.entities
         WHERE epoch_id=$1 AND entity_id LIKE 'TEST_ONLY.bulk.%'",
    )
    .bind(f.epoch)
    .execute(&f.pool)
    .await
    .unwrap();
    let recovered = f
        .store
        .manager_projection_cycle_id(&f.scope, f.epoch, f.lease.proof(), &same)
        .await
        .unwrap();
    assert_eq!(recovered, first.cycle_id);
    assert_eq!(f.journal_count().await, 1);
}

#[tokio::test]
async fn manager_page_cursors_resnapshot_after_a_changed_sealed_cycle() {
    let f = Fixture::new().await;
    let mut view = rows(3);
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let now = Utc::now();
    let first_request = EntityQueryRequest {
        limit: 1,
        ..EntityQueryRequest::default()
    };
    let first = f
        .store
        .query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            &first_request,
            &codec,
            now,
        )
        .await
        .unwrap();
    let forward = EntityQueryRequest {
        after: first.next_cursor.clone(),
        ..first_request.clone()
    };
    assert!(forward.after.is_some());
    let second = f
        .store
        .query_entities(&f.scope, ProjectionEntityKind::Order, &forward, &codec, now)
        .await
        .unwrap();
    assert_ne!(first.rows[0].entity_id, second.rows[0].entity_id);
    assert_cursor_context_isolation(&f, &view, &forward, &codec, now).await;
    let backward = EntityQueryRequest {
        before: second.prev_cursor.clone(),
        ..first_request.clone()
    };
    assert!(backward.before.is_some());
    let previous = f
        .store
        .query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            &backward,
            &codec,
            now,
        )
        .await
        .unwrap();
    assert_eq!(previous.rows[0].entity_id, first.rows[0].entity_id);

    // An identical completed poll does not invalidate an outstanding page.
    f.commit(&view, 2).await;
    assert!(f
        .store
        .query_entities(&f.scope, ProjectionEntityKind::Order, &forward, &codec, now)
        .await
        .is_ok());

    assert_legacy_manager_cursor_rejected(
        &f,
        &first_request,
        &codec,
        now,
        first.rows[0].as_of,
        &first.rows[0].entity_id,
    )
    .await;
    assert_changed_cycle_invalidates_cursors(
        &f,
        &mut view,
        &first_request,
        &forward,
        &backward,
        &codec,
        now,
    )
    .await;
    assert_non_manager_cursor_is_unbound(&f, &first_request, &codec, now).await;
}

async fn assert_changed_cycle_invalidates_cursors(
    f: &Fixture,
    view: &mut View,
    first_request: &EntityQueryRequest,
    forward: &EntityQueryRequest,
    backward: &EntityQueryRequest,
    codec: &CursorCodec,
    now: DateTime<Utc>,
) {
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    f.commit(view, 3).await;
    for stale in [forward, backward] {
        assert!(matches!(
            f.store
                .query_entities(&f.scope, ProjectionEntityKind::Order, stale, codec, now)
                .await,
            Err(StoreError::Query(QueryError::CursorContextMismatch))
        ));
    }
    assert!(f
        .store
        .query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            first_request,
            codec,
            now
        )
        .await
        .is_ok());
}

async fn assert_cursor_context_isolation(
    f: &Fixture,
    view: &View,
    forward: &EntityQueryRequest,
    codec: &CursorCodec,
    now: DateTime<Utc>,
) {
    let other_page_size = EntityQueryRequest {
        limit: 2,
        ..forward.clone()
    };
    assert!(matches!(
        f.store
            .query_entities(
                &f.scope,
                ProjectionEntityKind::Order,
                &other_page_size,
                codec,
                now
            )
            .await,
        Err(StoreError::Query(QueryError::CursorContextMismatch))
    ));
    let filtered = EntityQueryRequest {
        filters: vec![QueryFilter {
            field: FilterField::Status,
            operator: FilterOperator::Eq,
            values: vec!["OPEN".to_owned()],
        }],
        ..forward.clone()
    };
    assert!(matches!(
        f.store
            .query_entities(&f.scope, ProjectionEntityKind::Order, &filtered, codec, now)
            .await,
        Err(StoreError::Query(QueryError::CursorContextMismatch))
    ));
    let other = Fixture::new().await;
    let (_, other_receipt, _, _) = other.commit(view, 1).await;
    other
        .store
        .activate_manager_projection_epoch(
            &other.scope,
            other.epoch,
            &other_receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert!(matches!(
        other
            .store
            .query_entities(
                &other.scope,
                ProjectionEntityKind::Order,
                forward,
                codec,
                now
            )
            .await,
        Err(StoreError::Query(QueryError::CursorContextMismatch))
    ));
}

async fn assert_legacy_manager_cursor_rejected(
    f: &Fixture,
    first_request: &EntityQueryRequest,
    codec: &CursorCodec,
    now: DateTime<Utc>,
    first_as_of: DateTime<Utc>,
    first_entity_id: &str,
) {
    // A pre-upgrade Manager cursor does not carry a sealed-state binding.
    let legacy_context = CursorContext {
        workspace_id: f.scope.workspace_id.as_str(),
        environment: &f.scope.environment,
        epoch_id: f.epoch,
        resource: "projection:ORDER",
        query_fingerprint: "",
    };
    let fingerprint = first_request
        .validate(
            &QueryAllowlist::projection_entities(),
            codec,
            &legacy_context,
            now,
        )
        .unwrap()
        .fingerprint;
    let legacy_context = CursorContext {
        query_fingerprint: &fingerprint,
        ..legacy_context
    };
    let legacy = codec
        .encode(
            &legacy_context,
            CursorDirection::After,
            CursorBoundary {
                sort_values: vec![CursorScalar::Timestamp(first_as_of)],
                entity_id: first_entity_id.to_owned(),
            },
            now,
        )
        .unwrap();
    let legacy_request = EntityQueryRequest {
        after: Some(legacy),
        ..first_request.clone()
    };
    assert!(matches!(
        f.store
            .query_entities(
                &f.scope,
                ProjectionEntityKind::Order,
                &legacy_request,
                codec,
                now
            )
            .await,
        Err(StoreError::Query(QueryError::CursorContextMismatch))
    ));
}

async fn assert_non_manager_cursor_is_unbound(
    f: &Fixture,
    first_request: &EntityQueryRequest,
    codec: &CursorCodec,
    now: DateTime<Utc>,
) {
    // No Manager sequence is added to an unrelated adapter's cursor context.
    // This mutation affects only the disposable test database.
    sqlx::query("UPDATE portal_projection.epochs SET adapter_version='TEST_ONLY.non_manager' WHERE epoch_id=$1")
        .bind(f.epoch)
        .execute(&f.pool)
        .await
        .unwrap();
    let non_manager_first = f
        .store
        .query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            first_request,
            codec,
            now,
        )
        .await
        .unwrap();
    let non_manager_with_observations = f
        .store
        .query_entities_scoped_with_observations(
            &f.scope,
            ProjectionEntityKind::Order,
            first_request,
            &[],
            codec,
            now,
        )
        .await
        .unwrap();
    assert_eq!(non_manager_with_observations.manager_observations, None);
    assert_eq!(non_manager_with_observations.manager_health, None);
    let non_manager_forward = EntityQueryRequest {
        after: non_manager_first.next_cursor,
        ..first_request.clone()
    };
    assert!(non_manager_forward.after.is_some());
    sqlx::query("UPDATE portal_projection.epochs SET next_projection_sequence=next_projection_sequence+1 WHERE epoch_id=$1")
        .bind(f.epoch)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(f
        .store
        .query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            &non_manager_forward,
            codec,
            now
        )
        .await
        .is_ok());
}

#[tokio::test]
async fn source_health_failures_are_ordered_scoped_and_preserve_the_sealed_view() {
    let f = Fixture::new().await;
    let view = rows(2);
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    let early = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    // A candidate epoch cannot affect any active reader's source health.
    assert!(!f
        .store
        .record_manager_source_failure(&early, f.epoch)
        .await
        .unwrap());
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Unknown
    );
    let observations = f
        .store
        .load_manager_feed_observations(&f.scope)
        .await
        .unwrap();
    let other = ProjectionScope::new(id("TEST_ONLY.other-scope"), "paper").unwrap();
    let other_attempt = f
        .store
        .begin_manager_source_attempt(&other, Duration::from_secs(30))
        .await
        .unwrap();
    assert!(!f
        .store
        .record_manager_source_failure_for_active_scope(&other_attempt)
        .await
        .unwrap());
    assert!(!f
        .store
        .record_manager_source_failure(&other_attempt, f.epoch)
        .await
        .unwrap());
    let later = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let (first, second) = tokio::join!(
        f.store.record_manager_source_failure(&early, f.epoch),
        f.store.record_manager_source_failure(&later, f.epoch),
    );
    assert!(first.unwrap());
    assert!(second.unwrap());
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    assert_eq!(
        f.store.load_manager_source_health(&other).await.unwrap(),
        ManagerSourceHealth::Unknown
    );
    assert_eq!(
        f.store
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        observations
    );
    f.assert_oracle(&view, &receipt.state_digest).await;
    let marker: i64 = sqlx::query_scalar(
        "SELECT last_failure_order FROM portal_projection.manager_source_health WHERE epoch_id=$1",
    )
    .bind(f.epoch)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let next: i64 = sqlx::query_scalar(
        "SELECT nextval('portal_projection.manager_source_health_order'::regclass)",
    )
    .fetch_one(&f.pool)
    .await
    .unwrap();
    assert!(marker > 0 && next > marker);
}

async fn seal_health_test_cycle(
    f: &Fixture,
    view: &View,
    step: i64,
    attempt: &ManagerSourceAttempt,
    complete: bool,
) -> ManagerProjectionCycleReceipt {
    let input = f.resolve(view, step).await;
    f.commit_snapshots(view, &input).await;
    let observations = FEEDS
        .iter()
        .enumerate()
        .map(|(index, feed)| {
            (
                feed.feed_id.to_owned(),
                ManagerFeedObservation {
                    as_of: at(if index == 0 { step - 1 } else { step }),
                    source_read_at: at(step),
                    poll_interval_ms: 2_000,
                },
            )
        })
        .collect();
    f.store
        .commit_manager_projection_cycle_with_source_health(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &input,
            &observations,
            attempt,
            complete,
            at(step + 1),
        )
        .await
        .unwrap()
}

async fn assert_page_health(f: &Fixture, expected: ManagerSourceHealth, count: usize) {
    let codec = CursorCodec::new(
        "TEST_ONLY.health",
        BTreeMap::from([("TEST_ONLY.health".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let result = f
        .store
        .query_entities_scoped_with_observations(
            &f.scope,
            ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            &[],
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(result.manager_health, Some(expected));
    assert_eq!(result.page.rows.len(), count);
}

async fn assert_analytics_health(f: &Fixture, expected: ManagerSourceHealth) {
    let snapshot = f
        .store
        .load_manager_analytics_snapshot(
            &f.scope,
            &ManagerAnalyticsSubject {
                kind: ManagerAnalyticsSubjectKind::LiveGate,
                id: id("TEST_ONLY.health"),
            },
        )
        .await
        .unwrap();
    assert_eq!(snapshot.source_health, expected);
    assert_eq!(snapshot.repository_query_count, 1);
    assert!(snapshot.feed_as_of.is_some());
    assert!(snapshot.feed_latest_as_of > snapshot.feed_as_of);
    let encoded = serde_json::to_value(snapshot).unwrap();
    assert!(encoded.get("source_health").is_none());
    assert!(encoded.get("feed_latest_as_of").is_none());
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // Preserve one chronology across interleaved attempts.
async fn source_health_expired_pending_attempt_is_unknown_until_newer_full_recovery() {
    let f = Fixture::new().await;
    let first = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let receipt = seal_health_test_cycle(&f, &rows(1), 1, &first, true).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let other =
        ProjectionScope::new(id(format!("TEST_ONLY.other.{}", Uuid::now_v7())), "paper").unwrap();
    let _other_pending = f
        .store
        .begin_manager_source_attempt(&other, Duration::from_secs(30))
        .await
        .unwrap();
    sqlx::query("UPDATE portal_projection.manager_source_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE workspace_id=$1 AND environment=$2")
        .bind(other.workspace_id.as_str()).bind(&other.environment).execute(&f.pool).await.unwrap();
    assert_page_health(&f, ManagerSourceHealth::Healthy, 1).await;

    let older = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let crashed = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    // A normal in-flight attempt does not immediately invalidate a good seal.
    assert_analytics_health(&f, ManagerSourceHealth::Healthy).await;
    // Simulate the DB deadline after process death: no failure marker was made.
    sqlx::query("UPDATE portal_projection.manager_source_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE attempt_order=(SELECT MAX(attempt_order) FROM portal_projection.manager_source_attempts WHERE workspace_id=$1 AND environment=$2)")
        .bind(f.scope.workspace_id.as_str()).bind(&f.scope.environment).execute(&f.pool).await.unwrap();
    assert_page_health(&f, ManagerSourceHealth::Unknown, 1).await;
    assert_analytics_health(&f, ManagerSourceHealth::Unknown).await;
    // An older completion cannot erase a newer unproven attempt.
    seal_health_test_cycle(&f, &rows(2), 3, &older, true).await;
    assert_page_health(&f, ManagerSourceHealth::Unknown, 2).await;
    let partial = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let compacted: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.manager_source_attempt_watermarks WHERE workspace_id=$1 AND environment=$2")
        .bind(f.scope.workspace_id.as_str()).bind(&f.scope.environment).fetch_one(&f.pool).await.unwrap();
    assert_eq!(compacted, 1);
    seal_health_test_cycle(&f, &rows(3), 5, &partial, false).await;
    assert_page_health(&f, ManagerSourceHealth::Unknown, 3).await;
    let recovery = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(4), 7, &recovery, true).await;
    assert_page_health(&f, ManagerSourceHealth::Healthy, 4).await;
    assert_analytics_health(&f, ManagerSourceHealth::Healthy).await;
    let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.manager_source_attempts WHERE workspace_id=$1 AND environment=$2")
        .bind(f.scope.workspace_id.as_str()).bind(&f.scope.environment).fetch_one(&f.pool).await.unwrap();
    assert_eq!(remaining, 0);
    let watermarks: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.manager_source_attempt_watermarks WHERE workspace_id=$1 AND environment=$2")
        .bind(f.scope.workspace_id.as_str()).bind(&f.scope.environment).fetch_one(&f.pool).await.unwrap();
    assert_eq!(watermarks, 0);
    // An old in-flight failure that arrives later still invalidates the seal.
    assert!(f
        .store
        .record_manager_source_failure_for_active_scope(&crashed)
        .await
        .unwrap());
    assert_page_health(&f, ManagerSourceHealth::Degraded, 4).await;
    let final_recovery = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(5), 9, &final_recovery, true).await;
    assert_page_health(&f, ManagerSourceHealth::Healthy, 5).await;
    assert!(f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::ZERO)
        .await
        .is_err());
    assert!(f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(86_401))
        .await
        .is_err());
}

#[tokio::test]
async fn source_health_compaction_racing_partial_completion_retains_unknown() {
    let f = Fixture::new().await;
    let first = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let receipt = seal_health_test_cycle(&f, &rows(1), 1, &first, true).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let _crashed = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let partial = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    sqlx::query("UPDATE portal_projection.manager_source_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE workspace_id=$1 AND environment=$2")
        .bind(f.scope.workspace_id.as_str()).bind(&f.scope.environment).execute(&f.pool).await.unwrap();
    let ((), recovery) = tokio::join!(
        async {
            seal_health_test_cycle(&f, &rows(2), 3, &partial, false).await;
        },
        f.store
            .begin_manager_source_attempt(&f.scope, Duration::from_secs(30)),
    );
    let recovery = recovery.unwrap();
    assert_page_health(&f, ManagerSourceHealth::Unknown, 2).await;
    assert_analytics_health(&f, ManagerSourceHealth::Unknown).await;
    seal_health_test_cycle(&f, &rows(3), 5, &recovery, true).await;
    assert_page_health(&f, ManagerSourceHealth::Healthy, 3).await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // Preserve the actual activation/rollback sequence.
async fn source_health_rollback_invalidates_retained_proof_until_full_recovery() {
    let mut old = Fixture::new().await;
    let old_attempt = old
        .store
        .begin_manager_source_attempt(&old.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let old_receipt = seal_health_test_cycle(&old, &rows(1), 1, &old_attempt, true).await;
    old.store
        .activate_manager_projection_epoch(
            &old.scope,
            old.epoch,
            &old_receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert_page_health(&old, ManagerSourceHealth::Healthy, 1).await;
    old.store
        .release_manager_projection_lease(&old.scope, old.epoch, old.lease.proof())
        .await
        .unwrap();
    let next_epoch = old
        .store
        .create_building_epoch(
            &old.scope,
            &EpochMetadata {
                adapter_version: ADAPTER.to_owned(),
                source_gateway_digest: hash(&"TEST_ONLY.gateway"),
                capability_snapshot_id: old.catalogue.clone(),
            },
            Utc::now(),
        )
        .await
        .unwrap();
    let next_lease = match old
        .store
        .acquire_manager_projection_lease(
            &old.scope,
            next_epoch,
            Uuid::now_v7(),
            &hash(&"TEST_ONLY.next-owner"),
            Duration::from_secs(300),
        )
        .await
        .unwrap()
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
        ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => {
            panic!("released scope must acquire")
        }
    };
    let next = Fixture {
        store: old.store.clone(),
        pool: old.pool.clone(),
        scope: old.scope.clone(),
        epoch: next_epoch,
        lease: next_lease,
        catalogue: old.catalogue.clone(),
    };
    let next_attempt = next
        .store
        .begin_manager_source_attempt(&next.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let next_receipt = seal_health_test_cycle(&next, &rows(2), 2, &next_attempt, true).await;
    next.store
        .activate_manager_projection_epoch(
            &next.scope,
            next.epoch,
            &next_receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert_page_health(&next, ManagerSourceHealth::Healthy, 2).await;
    assert!(matches!(
        next.store
            .rollback_manager_projection_epoch(&next.scope, next.epoch, old.epoch)
            .await,
        Err(StoreError::ManagerProjectionLeaseBusy)
    ));
    assert_page_health(&next, ManagerSourceHealth::Healthy, 2).await;
    next.store
        .release_manager_projection_lease(&next.scope, next.epoch, next.lease.proof())
        .await
        .unwrap();
    old.store
        .rollback_manager_projection_epoch(&old.scope, next.epoch, old.epoch)
        .await
        .unwrap();
    assert_page_health(&old, ManagerSourceHealth::Unknown, 1).await;
    assert_analytics_health(&old, ManagerSourceHealth::Unknown).await;
    old.assert_oracle(&rows(1), &old_receipt.state_digest).await;
    old.lease = match old
        .store
        .acquire_manager_projection_lease(
            &old.scope,
            old.epoch,
            Uuid::now_v7(),
            &hash(&"TEST_ONLY.recovery-owner"),
            Duration::from_secs(300),
        )
        .await
        .unwrap()
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
        ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => {
            panic!("released scope must reacquire")
        }
    };
    let recovery = old
        .store
        .begin_manager_source_attempt(&old.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&old, &rows(1), 3, &recovery, true).await;
    assert_page_health(&old, ManagerSourceHealth::Healthy, 1).await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // One chronological proof across failure and recovery.
async fn source_health_seal_cannot_clear_newer_failure_or_promote_partial_recovery() {
    let f = Fixture::new().await;
    let first = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let receipt = seal_health_test_cycle(&f, &rows(1), 1, &first, true).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    assert_page_health(&f, ManagerSourceHealth::Healthy, 1).await;
    assert_analytics_health(&f, ManagerSourceHealth::Healthy).await;
    let old = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let failure = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    assert!(f
        .store
        .record_manager_source_failure_for_active_scope(&failure)
        .await
        .unwrap());
    assert_page_health(&f, ManagerSourceHealth::Degraded, 1).await;
    assert_analytics_health(&f, ManagerSourceHealth::Degraded).await;
    seal_health_test_cycle(&f, &rows(2), 3, &old, true).await;
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let partial = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(3), 5, &partial, false).await;
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let recovery = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(4), 7, &recovery, true).await;
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    assert_page_health(&f, ManagerSourceHealth::Healthy, 4).await;
    assert_analytics_health(&f, ManagerSourceHealth::Healthy).await;
    let partial = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(5), 9, &partial, false).await;
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    // Concurrent failure is never erased by an earlier-issued success.
    let early = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let failed = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    let ((), result) = tokio::join!(
        async {
            seal_health_test_cycle(&f, &rows(6), 11, &early, true).await;
        },
        f.store.record_manager_source_failure(&failed, f.epoch),
    );
    assert!(result.unwrap());
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let recovered = f
        .store
        .begin_manager_source_attempt(&f.scope, Duration::from_secs(30))
        .await
        .unwrap();
    seal_health_test_cycle(&f, &rows(7), 13, &recovered, true).await;
    assert_eq!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    // Legacy callers must not inherit the previous health proof.
    f.commit(&rows(8), 15).await;
    assert_ne!(
        f.store.load_manager_source_health(&f.scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    assert_page_health(&f, ManagerSourceHealth::Degraded, 8).await;
}

fn analytics_shared_scope_view() -> View {
    BTreeMap::from([
        (
            "TEST_ONLY.deployment.a".to_owned(),
            json!({
                "source_relation":"public.strategy_deployments", "deployment_id":"dep-a",
                "portfolio_id":"pf-a", "strategy_id":"shared", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.deployment.b".to_owned(),
            json!({
                "source_relation":"public.strategy_deployments", "deployment_id":"dep-b",
                "portfolio_id":"pf-b", "strategy_id":"shared", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.order.a".to_owned(),
            json!({
                "source_relation":"public.orders", "deployment_id":"dep-a",
                "portfolio_id":"pf-a", "strategy_id":"shared", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.order.b".to_owned(),
            json!({
                "source_relation":"public.orders", "deployment_id":"dep-b",
                "portfolio_id":"pf-b", "strategy_id":"shared", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.order.only_b".to_owned(),
            json!({
                "source_relation":"public.orders", "portfolio_id":"pf-b", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.order.conflict".to_owned(),
            json!({
                "source_relation":"public.orders", "deployment_id":"dep-b",
                "portfolio_id":"pf-a", "strategy_id":"shared", "account_id":"shared"
            }),
        ),
        (
            "TEST_ONLY.order.wrapped".to_owned(),
            json!({
                "source_relation":"public.orders", "fields": {
                    "deployment_id":{"kind":"TEXT","value":"dep-b"}, "portfolio_id":{"kind":"TEXT","value":"pf-b"},
                    "strategy_id":{"kind":"TEXT","value":"shared"}, "account_id":{"kind":"TEXT","value":"shared"}
                }
            }),
        ),
    ])
}

#[tokio::test]
async fn analytics_explicit_scope_ids_beat_shared_strategy_and_account() {
    let f = Fixture::new().await;
    let view = analytics_shared_scope_view();
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    for (kind, value) in [
        (ManagerAnalyticsSubjectKind::Deployment, "dep-a"),
        (ManagerAnalyticsSubjectKind::Portfolio, "pf-a"),
    ] {
        let snapshot = f
            .store
            .load_manager_analytics_snapshot(
                &f.scope,
                &ManagerAnalyticsSubject {
                    kind,
                    id: id(value),
                },
            )
            .await
            .unwrap();
        let actual: Vec<_> = snapshot
            .facts
            .iter()
            .map(|fact| fact.entity_id.as_str())
            .collect();
        assert_eq!(actual, ["TEST_ONLY.deployment.a", "TEST_ONLY.order.a"]);
        assert_eq!(snapshot.repository_query_count, 1);
    }
}

#[tokio::test]
async fn analytics_weak_scope_match_fails_closed_without_hiding_source() {
    let f = Fixture::new().await;
    let mut view = analytics_shared_scope_view();
    view.insert(
        "TEST_ONLY.order.legacy".to_owned(),
        json!({
            "source_relation":"public.orders", "strategy_id":"shared", "account_id":"shared"
        }),
    );
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    for (kind, value) in [
        (ManagerAnalyticsSubjectKind::Deployment, "dep-a"),
        (ManagerAnalyticsSubjectKind::Portfolio, "pf-a"),
    ] {
        assert!(matches!(
            f.store
                .load_manager_analytics_snapshot(
                    &f.scope,
                    &ManagerAnalyticsSubject {
                        kind,
                        id: id(value)
                    },
                )
                .await,
            Err(StoreError::AnalyticsAttributionUnproven)
        ));
    }
    let alpha = f
        .store
        .load_manager_analytics_snapshot(
            &f.scope,
            &ManagerAnalyticsSubject {
                kind: ManagerAnalyticsSubjectKind::Alpha,
                id: id("shared"),
            },
        )
        .await
        .unwrap();
    assert!(alpha
        .facts
        .iter()
        .any(|fact| fact.entity_id == "TEST_ONLY.order.legacy"));
    assert!(f
        .store
        .load_entity(
            f.epoch,
            &ProjectionEntityKey {
                kind: ProjectionEntityKind::Order,
                entity_id: id("TEST_ONLY.order.legacy"),
            }
        )
        .await
        .unwrap()
        .is_some());
}

#[tokio::test]
async fn analytics_portfolio_id_does_not_prove_deployment_id() {
    let f = Fixture::new().await;
    let mut view = analytics_shared_scope_view();
    view.insert(
        "TEST_ONLY.order.only_a".to_owned(),
        json!({
            "source_relation":"public.orders", "portfolio_id":"pf-a", "account_id":"shared"
        }),
    );
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert!(matches!(
        f.store
            .load_manager_analytics_snapshot(
                &f.scope,
                &ManagerAnalyticsSubject {
                    kind: ManagerAnalyticsSubjectKind::Deployment,
                    id: id("dep-a")
                },
            )
            .await,
        Err(StoreError::AnalyticsAttributionUnproven)
    ));
    let portfolio = f
        .store
        .load_manager_analytics_snapshot(
            &f.scope,
            &ManagerAnalyticsSubject {
                kind: ManagerAnalyticsSubjectKind::Portfolio,
                id: id("pf-a"),
            },
        )
        .await
        .unwrap();
    assert!(portfolio
        .facts
        .iter()
        .any(|fact| fact.entity_id == "TEST_ONLY.order.only_a"));
}

#[tokio::test]
async fn analytics_reobserved_fact_keeps_original_business_clock_and_digest() {
    let f = Fixture::new().await;
    let view = BTreeMap::from([(
        String::from("manager.order:TEST_ONLY.order.1"),
        json!({"source_relation":"public.orders", "source_feed":"manager.order",
            "strategy_id":"TEST_ONLY.alpha", "quantity":"1"}),
    )]);
    let (cycle, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let subject = ManagerAnalyticsSubject {
        kind: ManagerAnalyticsSubjectKind::Alpha,
        id: id("TEST_ONLY.alpha"),
    };
    let before = f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert_eq!(before.as_of, Some(at(0)));
    assert_eq!(before.feed_as_of, None);
    let mut feeds: BTreeMap<_, _> = FEEDS
        .iter()
        .map(|feed| {
            (
                feed.feed_id.to_owned(),
                ManagerFeedObservation {
                    as_of: at(0),
                    source_read_at: at(1),
                    poll_interval_ms: 2_000,
                },
            )
        })
        .collect();
    let order = feeds.get_mut("manager.order").unwrap();
    order.as_of = at(2);
    order.source_read_at = at(2);
    f.store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &cycle,
            &feeds,
            at(2),
        )
        .await
        .unwrap();
    let after = f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert_eq!(after.as_of, Some(at(2)));
    assert_eq!(after.feed_as_of, Some(at(0))); // other feeds remain old
    assert_eq!(after.facts, before.facts); // no business time or payload rewritten
    assert_eq!(after.fact_digest, before.fact_digest);
    assert_eq!(after.repository_query_count, 1);
    for observation in feeds.values_mut() {
        observation.as_of = at(3);
        observation.source_read_at = at(3);
    }
    let mut refreshed_cycle = cycle.clone();
    refreshed_cycle.source_read_at = at(3);
    f.store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &refreshed_cycle,
            &feeds,
            at(3),
        )
        .await
        .unwrap();
    let fully_refreshed = f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert_eq!(fully_refreshed.as_of, Some(at(3)));
    assert_eq!(fully_refreshed.feed_as_of, Some(at(3)));
    assert_eq!(fully_refreshed.facts, before.facts);
    assert_eq!(fully_refreshed.fact_digest, before.fact_digest);
}

#[tokio::test]
async fn manager_analytics_rejects_fact_without_source_as_of() {
    let f = Fixture::new().await;
    let view = BTreeMap::from([(
        String::from("TEST_ONLY.order.1"),
        json!({
            "source_relation":"public.orders", "strategy_id":"TEST_ONLY.alpha", "quantity":"1"
        }),
    )]);
    let (_, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let subject = ManagerAnalyticsSubject {
        kind: ManagerAnalyticsSubjectKind::Alpha,
        id: id("TEST_ONLY.alpha"),
    };
    let snapshot = f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert_eq!(snapshot.fact_count, 1);
    assert_eq!(snapshot.as_of, Some(at(0)));
    assert_eq!(snapshot.feed_as_of, None);
    sqlx::query(
        "UPDATE portal_projection.entities SET as_of=NULL WHERE epoch_id=$1 AND entity_id=$2",
    )
    .bind(f.epoch)
    .bind("TEST_ONLY.order.1")
    .execute(&f.pool)
    .await
    .unwrap();
    assert!(matches!(
        f.store
            .load_manager_analytics_snapshot(&f.scope, &subject)
            .await,
        Err(StoreError::InvalidAnalyticsSourcePayload)
    ));
}

#[tokio::test]
async fn manager_queries_reject_unsealed_changed_cycle_and_recover() {
    let f = Fixture::new().await;
    let mut view = rows(1);
    let (baseline, receipt, _, _) = f.commit(&view, 1).await;
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let request = EntityQueryRequest::default();
    let subject = ManagerAnalyticsSubject {
        kind: ManagerAnalyticsSubjectKind::LiveGate,
        id: id("TEST_ONLY.subject"),
    };
    let query = || {
        f.store.query_entities(
            &f.scope,
            ProjectionEntityKind::Order,
            &request,
            &codec,
            Utc::now(),
        )
    };
    assert_eq!(query().await.unwrap().rows.len(), 1);
    assert!(f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .is_ok());

    // Old heartbeats have no sequence and must not become trusted merely by
    // migrating the schema; a checked repeat of the complete cycle restores it.
    sqlx::query("UPDATE portal_projection.manager_projection_heartbeats SET sealed_projection_sequence=NULL WHERE epoch_id=$1")
        .bind(f.epoch)
        .execute(&f.pool)
        .await
        .unwrap();
    assert!(matches!(
        query().await,
        Err(StoreError::ManagerProjectionCycleIncomplete)
    ));
    f.seal(&baseline).await;
    assert!(query().await.is_ok());

    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let partial = f.resolve(&view, 2).await;
    // A no-op kind does not change visible data and must not block a read.
    for kind in [ProjectionEntityKind::Account, ProjectionEntityKind::Order] {
        f.store
            .commit_manager_projection_snapshot(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &f.snapshot(&view, &partial, kind),
                at(2),
            )
            .await
            .unwrap();
        if kind == ProjectionEntityKind::Account {
            assert!(query().await.is_ok());
        }
    }
    assert!(matches!(
        query().await,
        Err(StoreError::ManagerProjectionCycleIncomplete)
    ));
    assert!(matches!(
        f.store
            .load_manager_analytics_snapshot(&f.scope, &subject)
            .await,
        Err(StoreError::ManagerProjectionCycleIncomplete)
    ));

    // A successor may recover an abandoned partial attempt. Historical
    // unsealed receipts must not cause a permanent false unavailability.
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("NEWER");
    f.commit(&view, 3).await;
    assert_eq!(query().await.unwrap().rows[0].payload["state"], "NEWER");
    assert!(f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .is_ok());

    // The generic reader must preserve non-Manager adapter behavior even
    // when no Manager heartbeat seal exists. This changes only the isolated
    // synthetic epoch, after all Manager-specific checks above have finished.
    sqlx::query("UPDATE portal_projection.epochs SET adapter_version='TEST_ONLY.non_manager' WHERE epoch_id=$1")
        .bind(f.epoch)
        .execute(&f.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE portal_projection.manager_projection_heartbeats SET sealed_projection_sequence=NULL WHERE epoch_id=$1")
        .bind(f.epoch)
        .execute(&f.pool)
        .await
        .unwrap();
    assert_eq!(query().await.unwrap().rows[0].payload["state"], "NEWER");
}

#[tokio::test]
async fn manager_partial_commit_retry_is_deterministic_and_durable() {
    let f = Fixture::new().await;
    let mut view = rows(4);
    f.commit(&view, 1).await;
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let cycle = f.resolve(&view, 2).await;
    let input = f.snapshot(&view, &cycle, ProjectionEntityKind::Order);
    f.store
        .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &input, at(2))
        .await
        .unwrap();
    let retry = f.resolve(&view, 3).await;
    assert_eq!(retry.cycle_id, cycle.cycle_id);
    assert_eq!(f.commit_snapshots(&view, &retry).await, (0, 0));
    let receipt = f.seal(&retry).await;
    f.assert_oracle(&view, &receipt.state_digest).await;
    assert_eq!(f.journal_count().await, 5);
}

#[tokio::test]
async fn manager_stale_occurrence_cannot_reapply_after_newer_seal() {
    let f = Fixture::new().await;
    let mut view = rows(2);
    let (old, _, _, _) = f.commit(&view, 1).await;
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("CORRECTED");
    let pending = f.resolve(&view, 2).await;
    view.get_mut("TEST_ONLY.order.0001").unwrap()["state"] = json!("NEWER");
    let (_, latest, _, _) = f.commit(&view, 3).await;
    for stale in [old, pending] {
        assert!(f
            .store
            .commit_manager_projection_snapshot(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &f.snapshot(&view, &stale, ProjectionEntityKind::Order),
                at(4)
            )
            .await
            .is_err());
        assert!(f
            .store
            .commit_manager_projection_cycle(&f.scope, f.epoch, f.lease.proof(), &stale, at(4))
            .await
            .is_err());
    }
    f.assert_oracle(&view, &latest.state_digest).await;
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // Keep atomic recovery and fencing in one trace.
async fn manager_feed_observations_are_fenced_atomic_and_restart_safe() {
    let mut f = Fixture::new().await;
    let mut view = rows(1);
    let mut baseline = f.resolve(&view, 1).await;
    baseline.source_read_at = at(1) + TimeDelta::nanoseconds(123);
    let mut feeds: BTreeMap<_, _> = FEEDS
        .iter()
        .map(|feed| {
            (
                feed.feed_id.to_owned(),
                ManagerFeedObservation {
                    as_of: at(0),
                    source_read_at: baseline.source_read_at,
                    poll_interval_ms: 2_000,
                },
            )
        })
        .collect();
    // Missing snapshots cannot publish even a valid-looking feed map.
    assert!(f
        .store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &baseline,
            &feeds,
            at(2),
        )
        .await
        .is_err());
    f.commit_snapshots(&view, &baseline).await;
    let mut missing = feeds.clone();
    missing.remove("manager.fill");
    assert!(matches!(
        f.store
            .commit_manager_projection_cycle_with_feed_observations(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &baseline,
                &missing,
                at(2),
            )
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    let receipt = f
        .store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &baseline,
            &feeds,
            at(2),
        )
        .await
        .unwrap();
    f.store
        .activate_manager_projection_epoch(
            &f.scope,
            f.epoch,
            &receipt.state_digest,
            Utc::now(),
            Duration::from_secs(600),
        )
        .await
        .unwrap();
    assert_eq!(
        f.store
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        Some(feeds.clone())
    );
    let subject = ManagerAnalyticsSubject {
        kind: ManagerAnalyticsSubjectKind::LiveGate,
        id: id("TEST_ONLY.empty.subject"),
    };
    let analytics = f
        .store
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert!(analytics.facts.is_empty());
    assert_eq!(analytics.as_of, None);
    assert_eq!(analytics.feed_as_of, Some(at(0)));
    assert_eq!(analytics.repository_query_count, 1);
    // A malformed sealed map must fail closed, not become an optimistic clock.
    sqlx::query("UPDATE portal_projection.manager_projection_heartbeats SET feed_observations='{}'::jsonb WHERE epoch_id=$1")
        .bind(f.epoch).execute(&f.pool).await.unwrap();
    assert!(matches!(
        f.store
            .load_manager_analytics_snapshot(&f.scope, &subject)
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    sqlx::query("UPDATE portal_projection.manager_projection_heartbeats SET feed_observations=$2 WHERE epoch_id=$1")
        .bind(f.epoch).bind(serde_json::to_value(&feeds).unwrap()).execute(&f.pool).await.unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let request = EntityQueryRequest::default();
    let page = f
        .store
        .query_entities_scoped_with_observations(
            &f.scope,
            ProjectionEntityKind::Order,
            &request,
            &[],
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(page.page.epoch_id, f.epoch);
    assert_eq!(page.page.rows.len(), 1);
    assert_eq!(page.manager_observations, Some(Some(feeds.clone())));
    assert!(feeds.contains_key("manager.fill")); // synthetic fill feed has no facts
    let other = ProjectionScope::new(id("TEST_ONLY.other-workspace"), "paper").unwrap();
    assert!(matches!(
        f.store.load_manager_feed_observations(&other).await,
        Err(StoreError::EpochNotFound)
    ));

    // No-op cycle updates only the refreshed class; another feed keeps its
    // old clock. A fresh connection proves the exact map survives restart.
    let order = feeds.get_mut("manager.order").unwrap();
    order.source_read_at = at(2);
    order.as_of = at(2);
    f.store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &baseline,
            &feeds,
            at(2),
        )
        .await
        .unwrap();
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap();
    let reopened = PgProjectionStore::connect(&url).await.unwrap();
    assert_eq!(
        reopened
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        Some(feeds.clone())
    );
    assert_eq!(
        feeds["manager.fill"].source_read_at,
        baseline.source_read_at
    );

    let mut contradiction = feeds.clone();
    contradiction.get_mut("manager.fill").unwrap().as_of = at(1);
    assert!(matches!(
        f.store
            .commit_manager_projection_cycle_with_feed_observations(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &baseline,
                &contradiction,
                at(2),
            )
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    let mut regression = feeds.clone();
    regression.get_mut("manager.order").unwrap().source_read_at = at(1);
    regression.get_mut("manager.order").unwrap().as_of = at(0);
    assert!(matches!(
        f.store
            .commit_manager_projection_cycle_with_feed_observations(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &baseline,
                &regression,
                at(2),
            )
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    assert_eq!(
        reopened
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        Some(feeds.clone())
    );

    let old = f.lease.proof();
    f.store
        .release_manager_projection_lease(&f.scope, f.epoch, old)
        .await
        .unwrap();
    f.lease = match f
        .store
        .acquire_manager_projection_lease(
            &f.scope,
            f.epoch,
            Uuid::now_v7(),
            &hash(&"TEST_ONLY.owner"),
            Duration::from_secs(300),
        )
        .await
        .unwrap()
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
        ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => panic!("released lease"),
    };
    assert!(matches!(
        f.store
            .commit_manager_projection_cycle_with_feed_observations(
                &f.scope,
                f.epoch,
                old,
                &baseline,
                &feeds,
                at(2),
            )
            .await,
        Err(StoreError::ManagerProjectionLeaseLost)
    ));

    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("UPDATED");
    let changed = f.resolve(&view, 3).await;
    f.store
        .commit_manager_projection_snapshot(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &f.snapshot(&view, &changed, ProjectionEntityKind::Order),
            at(3),
        )
        .await
        .unwrap();
    assert!(matches!(
        reopened.load_manager_feed_observations(&f.scope).await,
        Err(StoreError::ManagerProjectionCycleIncomplete)
    ));
    assert!(matches!(
        reopened
            .query_entities_scoped_with_observations(
                &f.scope,
                ProjectionEntityKind::Order,
                &request,
                &[],
                &codec,
                Utc::now(),
            )
            .await,
        Err(StoreError::ManagerProjectionCycleIncomplete)
    ));
    f.commit_snapshots(&view, &changed).await;
    for observation in feeds.values_mut() {
        observation.source_read_at = at(3);
        observation.as_of = at(3);
    }
    f.store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &changed,
            &feeds,
            at(3),
        )
        .await
        .unwrap();
    assert_eq!(
        reopened
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        Some(feeds.clone())
    );

    // A legacy/no-lineage seal must not keep an apparently current old map.
    f.store
        .commit_manager_projection_cycle(&f.scope, f.epoch, f.lease.proof(), &changed, at(3))
        .await
        .unwrap();
    assert_eq!(
        reopened
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        None
    );
    let legacy = reopened
        .query_entities_scoped_with_observations(
            &f.scope,
            ProjectionEntityKind::Order,
            &request,
            &[],
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(legacy.manager_observations, Some(None));
    let legacy_analytics = reopened
        .load_manager_analytics_snapshot(&f.scope, &subject)
        .await
        .unwrap();
    assert!(legacy_analytics.facts.is_empty());
    assert_eq!(legacy_analytics.feed_as_of, None);
    assert_eq!(legacy_analytics.as_of, None);
    // The updated worker can restore lineage after a legacy seal; leave this
    // TEST_ONLY record available for an actual isolated PostgreSQL restart.
    f.store
        .commit_manager_projection_cycle_with_feed_observations(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &changed,
            &feeds,
            at(3),
        )
        .await
        .unwrap();
    assert_eq!(
        reopened
            .load_manager_feed_observations(&f.scope)
            .await
            .unwrap(),
        Some(feeds)
    );
}

#[tokio::test]
async fn manager_stale_lease_and_cross_scope_are_rejected() {
    let mut f = Fixture::new().await;
    let view = rows(1);
    let pending = f.resolve(&view, 1).await;
    let old = f.lease.proof();
    f.store
        .release_manager_projection_lease(&f.scope, f.epoch, old)
        .await
        .unwrap();
    f.lease = match f
        .store
        .acquire_manager_projection_lease(
            &f.scope,
            f.epoch,
            Uuid::now_v7(),
            &hash(&"TEST_ONLY.owner"),
            Duration::from_secs(300),
        )
        .await
        .unwrap()
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
        ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => {
            panic!("released lease must acquire")
        }
    };
    assert!(matches!(
        f.store
            .manager_projection_cycle_id(&f.scope, f.epoch, old, &pending)
            .await,
        Err(StoreError::ManagerProjectionLeaseLost)
    ));
    let other = ProjectionScope::new(id("TEST_ONLY.other-workspace"), "paper").unwrap();
    assert!(f
        .store
        .manager_projection_cycle_id(&other, f.epoch, f.lease.proof(), &pending)
        .await
        .is_err());
    f.commit(&view, 2).await;
}

#[tokio::test]
async fn manager_partial_snapshot_and_oversize_fail_closed() {
    let f = Fixture::new().await;
    let view = rows(1);
    let mut cycle = f.resolve(&view, 1).await;
    let mut partial = f.snapshot(&view, &cycle, ProjectionEntityKind::Order);
    partial.snapshot.completeness = SnapshotCompleteness::Partial;
    assert!(matches!(
        f.store
            .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &partial, at(1))
            .await,
        Err(StoreError::InvalidManagerProjectionSnapshot)
    ));
    cycle.record_count = 80_001;
    assert!(f
        .store
        .manager_projection_cycle_id(&f.scope, f.epoch, f.lease.proof(), &cycle)
        .await
        .is_err());
    assert_eq!(f.journal_count().await, 0);
    assert!(f.xmin().await.is_empty());
}

#[tokio::test]
async fn manager_rebootstrap_keeps_business_semantics_and_new_epoch() {
    let first = Fixture::new().await;
    let view = rows(128);
    let (a, _, _, _) = first.commit(&view, 1).await;
    let fresh = Fixture::new().await;
    let (b, _, applied, removed) = fresh.commit(&view, 1).await;
    assert_ne!(first.epoch, fresh.epoch);
    assert_ne!(a.cycle_id, b.cycle_id);
    assert_eq!((applied, removed), (128, 0));
    assert_eq!(first.journal_count().await, fresh.journal_count().await);
}

#[tokio::test]
async fn manager_fast_feed_corrections_keep_old_cached_global_freshness() {
    let f = Fixture::new().await;
    let mut view = rows(2);
    f.commit(&view, 1).await;
    for step in [2, 3] {
        view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!(format!("CORRECTED-{step}"));
        let mut cycle = f.resolve(&view, step).await;
        // Slow metadata remains cached. Actual Order observations are newer;
        // cycle freshness must not become their source ordering position.
        cycle.source_read_at = at(1);
        for kind in KINDS {
            let mut input = f.snapshot(&view, &cycle, kind);
            if kind == ProjectionEntityKind::Order {
                input.source_read_at = at(step);
                for observation in &mut input.snapshot.observations {
                    observation.source_read_at = at(step);
                    let cursor = observation.source_cursor.as_mut().unwrap();
                    cursor.event_ts = at(step);
                    cursor.created_at = at(step);
                }
            }
            f.store
                .commit_manager_projection_snapshot(
                    &f.scope,
                    f.epoch,
                    f.lease.proof(),
                    &input,
                    at(step) + TimeDelta::milliseconds(100),
                )
                .await
                .unwrap();
        }
        let receipt = f
            .store
            .commit_manager_projection_cycle(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &cycle,
                at(step) + TimeDelta::milliseconds(200),
            )
            .await
            .unwrap();
        f.assert_oracle(&view, &receipt.state_digest).await;
        let entity = f
            .store
            .load_entity(
                f.epoch,
                &ProjectionEntityKey {
                    kind: ProjectionEntityKind::Order,
                    entity_id: id("TEST_ONLY.order.0000"),
                },
            )
            .await
            .unwrap()
            .unwrap();
        assert_eq!(entity.source_cursor.unwrap().event_ts, at(step));
        assert_eq!(cycle.source_read_at, at(1));
    }
    assert_eq!(f.journal_count().await, 4);
}

#[tokio::test]
async fn manager_new_lease_recovers_partial_cycle_with_newer_complete_source() {
    let mut f = Fixture::new().await;
    let mut view = rows(2);
    f.commit(&view, 1).await;
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("PARTIAL-B");
    let partial = f.resolve(&view, 2).await;
    let b = f.snapshot(&view, &partial, ProjectionEntityKind::Order);
    f.store
        .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &b, at(2))
        .await
        .unwrap();
    view.get_mut("TEST_ONLY.order.0000").unwrap()["state"] = json!("NEWER-C");
    let newer = f.resolve(&view, 3).await;
    let c = f.snapshot(&view, &newer, ProjectionEntityKind::Order);
    // Even misuse of an internal same-cycle proof cannot return an old receipt
    // as evidence of a different CURRENT kind. Actual workers never interleave.
    f.store
        .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &c, at(3))
        .await
        .unwrap();
    assert!(matches!(
        f.store
            .commit_manager_projection_snapshot(&f.scope, f.epoch, f.lease.proof(), &b, at(4))
            .await,
        Err(StoreError::ManagerProjectionSnapshotRejected)
    ));
    let old = f.lease.proof();
    f.store
        .release_manager_projection_lease(&f.scope, f.epoch, old)
        .await
        .unwrap();
    f.lease = match f
        .store
        .acquire_manager_projection_lease(
            &f.scope,
            f.epoch,
            Uuid::now_v7(),
            &hash(&"TEST_ONLY.owner"),
            Duration::from_secs(300),
        )
        .await
        .unwrap()
    {
        ManagerProjectionLeaseAcquireOutcome::Acquired(lease) => lease,
        ManagerProjectionLeaseAcquireOutcome::AlreadyHeld(_) => {
            panic!("new invocation must acquire its own proof")
        }
    };
    assert!(f.lease.fencing_token > old.fencing_token);
    let (_, receipt, applied, removed) = f.commit(&view, 4).await;
    assert!(!receipt.already_durable);
    assert_eq!((applied, removed), (0, 0));
    assert_eq!(f.journal_count().await, 4);
}

#[tokio::test]
#[allow(clippy::too_many_lines)] // Keep the mixed-feed setup, clock negatives and exact recovery trace together.
async fn manager_empty_fast_account_feed_deletes_without_borrowing_slow_policy_clock() {
    fn clocks(balance_read: i64) -> BTreeMap<String, DateTime<Utc>> {
        let mut clocks: BTreeMap<_, _> = [
            "manager.order",
            "manager.fill",
            "manager.position",
            "manager.account",
            "manager.reconciliation",
            "manager.portfolio",
            "relation.strategy_deployments",
            "relation.account_balances",
            "relation.account_policies",
            "relation.account_reservations",
            "relation.portfolio_allocations",
            "relation.risk_profiles",
            "relation.domain_events",
        ]
        .into_iter()
        .map(|feed| (feed.to_owned(), at(1)))
        .collect();
        clocks.insert("relation.account_balances".to_owned(), at(balance_read));
        clocks
    }
    fn account_input(
        f: &Fixture,
        view: &View,
        cycle: &ManagerCycleCommitInput,
        reads: &BTreeMap<String, DateTime<Utc>>,
    ) -> ManagerSnapshotCommitInput {
        let mut input = f.snapshot(view, cycle, ProjectionEntityKind::Order);
        for observation in &mut input.snapshot.observations {
            observation.entity.kind = ProjectionEntityKind::Account;
            let feed = observation.payload["source_feed"].as_str().unwrap();
            observation.source_read_at = reads[feed];
            let cursor = observation.source_cursor.as_mut().unwrap();
            cursor.event_ts = reads[feed];
            cursor.created_at = reads[feed];
        }
        input.source_input_digest =
            manager_snapshot_semantic_digest(&input.snapshot.observations).unwrap();
        input.snapshot = ProjectionSnapshot::new(
            input.snapshot.snapshot_id,
            ProjectionEntityKind::Account,
            SnapshotCompleteness::Complete,
            input.snapshot.observations.len(),
            input.snapshot.observations,
        )
        .unwrap();
        input
    }
    let f = Fixture::new().await;
    let balance = "relation.account_balances:TEST_ONLY.balance";
    let policy = "relation.account_policies:TEST_ONLY.policy";
    let mut view = BTreeMap::from([
        (
            balance.to_owned(),
            json!({"source_feed":"relation.account_balances","quantity":"1.000000000000000001"}),
        ),
        (
            policy.to_owned(),
            json!({"source_feed":"relation.account_policies","state":"UNCHANGED"}),
        ),
    ]);
    let mut first = f.resolve(&view, 2).await;
    first.source_read_at = at(1);
    let first_reads = clocks(2);
    for kind in KINDS {
        let input = if kind == ProjectionEntityKind::Account {
            account_input(&f, &view, &first, &first_reads)
        } else {
            f.snapshot(&View::new(), &first, kind)
        };
        f.store
            .commit_manager_projection_snapshot_with_feed_reads(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &input,
                &first_reads,
                at(2) + TimeDelta::milliseconds(100),
            )
            .await
            .unwrap();
    }
    f.store
        .commit_manager_projection_cycle(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &first,
            at(2) + TimeDelta::milliseconds(200),
        )
        .await
        .unwrap();
    let before = f.xmin().await;
    view.remove(balance); // successful empty balances feed, policy still cached at1
    let mut next = f.resolve(&view, 3).await;
    next.source_read_at = at(1);
    let reads = clocks(3);
    let input = account_input(&f, &view, &next, &reads);
    let mut missing = reads.clone();
    missing.remove("relation.account_balances");
    let mut wrong = missing.clone();
    wrong.insert("TEST_ONLY.wrong-feed".to_owned(), at(3));
    for invalid in [clocks(2), missing, wrong] {
        assert!(f
            .store
            .commit_manager_projection_snapshot_with_feed_reads(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &input,
                &invalid,
                at(3) + TimeDelta::milliseconds(100)
            )
            .await
            .is_err());
    }
    let receipt = f
        .store
        .commit_manager_projection_snapshot_with_feed_reads(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &input,
            &reads,
            at(3) + TimeDelta::milliseconds(100),
        )
        .await
        .unwrap();
    assert_eq!((receipt.applied_count, receipt.removed_count), (0, 1));
    for kind in KINDS
        .into_iter()
        .filter(|kind| *kind != ProjectionEntityKind::Account)
    {
        f.store
            .commit_manager_projection_snapshot_with_feed_reads(
                &f.scope,
                f.epoch,
                f.lease.proof(),
                &f.snapshot(&View::new(), &next, kind),
                &reads,
                at(3) + TimeDelta::milliseconds(100),
            )
            .await
            .unwrap();
    }
    let sealed = f
        .store
        .commit_manager_projection_cycle(
            &f.scope,
            f.epoch,
            f.lease.proof(),
            &next,
            at(3) + TimeDelta::milliseconds(200),
        )
        .await
        .unwrap();
    assert!(f
        .store
        .load_entity(
            f.epoch,
            &ProjectionEntityKey {
                kind: ProjectionEntityKind::Account,
                entity_id: id(balance),
            }
        )
        .await
        .unwrap()
        .is_none());
    let kept = f
        .store
        .load_entity(
            f.epoch,
            &ProjectionEntityKey {
                kind: ProjectionEntityKind::Account,
                entity_id: id(policy),
            },
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(kept.payload, view[policy]);
    assert_eq!(semantic_state_digest(&[kept]).unwrap(), sealed.state_digest);
    assert_eq!(f.xmin().await.get(policy), before.get(policy));
    assert_eq!(f.journal_count().await, 3);
}
