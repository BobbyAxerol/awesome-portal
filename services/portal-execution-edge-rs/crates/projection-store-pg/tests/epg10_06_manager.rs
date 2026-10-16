//! `TEST_ONLY`: bounded synthetic Manager views in the owned disposable real PG.
//! No source requests, operational credentials, mutations or capacity claims.

use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use projection_core::{
    canonical_digest, semantic_state_digest, ProjectedEntity, ProjectionEntityKey,
    ProjectionEntityKind, ProjectionObservation, ProjectionOperation, ProjectionScope,
    ProjectionSnapshot, SnapshotCompleteness, SourceSequenceSemantics,
};
use projection_store_pg::{
    manager_snapshot_semantic_digest, EpochMetadata, ManagerCycleCommitInput,
    ManagerProjectionCycleReceipt, ManagerProjectionLeaseAcquireOutcome,
    ManagerProjectionLeaseGrant, ManagerSnapshotCommitInput, PgProjectionStore, StoreApplyOutcome,
    StoreError,
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
