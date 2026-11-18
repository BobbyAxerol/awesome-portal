//! `TEST_ONLY` source specimens in an explicitly admitted disposable loopback PG.
//! A fixture proof is not an installed source grant or connected acceptance.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use authoritative_event_core::{
    bootstrap::{Binding, ProtocolError, SourceProofVerifier, Verified},
    p16::{CoverageBinding, Event, Operation, ReadBinding, ReadPage, SourceScope, ValidatedPage},
    EventStreamBinding,
};
use chrono::Utc;
use execution_contracts::CanonicalId;
use projection_core::{
    canonical_digest,
    resources::{
        EnvelopeLimits, ResourceEnvelope, ResourceError, StorageLimits, StorageObservation,
    },
};
use projection_store_pg::{
    bootstrap::BootstrapError,
    p16_history::{NativeP16Query, NativeP16Receipt},
    PgProjectionStore,
};
use serde::Serialize;
use serde_json::json;
use sha2::{Digest as _, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool};
use uuid::Uuid;

const NOW: i64 = 1_792_100_000_000;

fn hash(value: &impl Serialize) -> String {
    canonical_digest(value).unwrap()
}
fn raw(letter: char) -> String {
    letter.to_string().repeat(64)
}

fn binding() -> Binding {
    Binding {
        source: EventStreamBinding {
            stream_id: "p16.fixture".into(),
            contract_revision: "p16.fixture.v1".into(),
            workspace_id: CanonicalId::parse("workspace_fixture").unwrap(),
            environment: "paper".into(),
            profile_id: "paper_fixture".into(),
            venue_id: "FIXTURE".into(),
            resource_kind: "portfolio".into(),
            resource_id: "portfolio_fixture".into(),
            filter_digest: format!("sha256:{}", raw('c')),
        },
        source_epoch: "epoch_fixture".into(),
        consumer_id: format!("fixture_{}", Uuid::now_v7().simple()),
        principal_digest: format!("sha256:{}", raw('d')),
        policy_revision: "policy_fixture".into(),
        query_digest: format!("sha256:{}", raw('e')),
        consistency_group: "portfolio_fixture".into(),
        datasets: BTreeMap::from([("orders".into(), "orders.fixture.v1".into())]),
    }
}

fn selected(binding: &Binding, after: u64, through: u64) -> ReadBinding {
    ReadBinding {
        scope: SourceScope {
            source_cell_id: "cell_fixture".into(),
            source_database_id: "db_fixture".into(),
            continuity_epoch: binding.source_epoch.clone(),
        },
        consumer_id: binding.consumer_id.clone(),
        manifest_digest: raw('a'),
        catalogue_digest: raw('b'),
        filter_digest: raw('c'),
        access_revision: 4,
        after_sequence: after,
        through_sequence: through,
        retention_floor: 1,
        max_events: 64,
        coverage: BTreeMap::from([(
            "p12.paper.execution.v1".into(),
            CoverageBinding {
                writer_id: "paper_fixture_repository".into(),
                complete_from: "fixture-activation-cut-v1".into(),
            },
        )]),
    }
}

fn event(sequence: u64) -> Event {
    let payload = json!({"quantity":"9007199254740993.123456789012345678", "nullable":null});
    Event {
        source_event_id: Uuid::from_u128(u128::from(sequence)).to_string(),
        source_cell_id: "cell_fixture".into(),
        source_database_id: "db_fixture".into(),
        continuity_epoch: "epoch_fixture".into(),
        source_commit_lsn: format!("0/{sequence:X}"),
        source_commit_group_index: 0,
        published_source_sequence: sequence,
        transaction_group_id: Uuid::from_u128(1000 + u128::from(sequence)).to_string(),
        transaction_event_index: 0,
        transaction_event_count: 1,
        business_event_id: Uuid::from_u128(100 + u128::from(sequence)).to_string(),
        event_revision: 1,
        event_type: "order_updated".into(),
        schema_version: "orders.fixture.v1".into(),
        schema_digest: raw('d'),
        operation: Operation::SemanticFact,
        entity_type: "orders".into(),
        entity_key: format!("account:orders/{sequence}"),
        entity_version: 0,
        mode: "paper".into(),
        venue: "FIXTURE".into(),
        product: "SPOT".into(),
        physical_account_ref: "physical_fixture".into(),
        logical_account_ref: "logical_fixture".into(),
        command_id: None,
        correlation_id: None,
        occurred_at: None,
        received_at: "2026-10-23T12:00:00.123456+07:00".into(),
        recorded_at: "2026-10-23T05:00:00.123456+00:00".into(),
        instrument_version: "instrument.v1".into(),
        policy_version: "policy.v1".into(),
        reducer_version: "reducer.v1".into(),
        correction_of: None,
        payload_hash: format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&payload).unwrap())
        ),
        payload,
        evidence_ref: None,
        coverage_profile_id: "p12.paper.execution.v1".into(),
        writer_id: "paper_fixture_repository".into(),
        complete_from: "fixture-activation-cut-v1".into(),
    }
}

fn page(selection: &ReadBinding, events: Vec<Event>) -> ReadPage {
    ReadPage {
        consumer_id: selection.consumer_id.clone(),
        manifest_digest: selection.manifest_digest.clone(),
        catalogue_digest: selection.catalogue_digest.clone(),
        filter_digest: selection.filter_digest.clone(),
        scope: selection.scope.clone(),
        after_sequence: selection.after_sequence,
        scanned_through_sequence: selection.through_sequence,
        published_head_sequence: 100,
        access_revision: selection.access_revision,
        source_lane: "SOURCE_JOURNAL".into(),
        read_role: "source_journal_paper_reader".into(),
        command_authority: "NONE".into(),
        events,
    }
}

struct FixtureVerifier {
    binding: String,
    kind: String,
    input: String,
}
impl SourceProofVerifier for FixtureVerifier {
    fn verify(&self, b: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        b.digest().ok().as_ref() == Some(&self.binding)
            && kind == self.kind
            && input == self.input
            && proof == "TEST_ONLY_exact_proof"
            && now == NOW
    }
}

fn seal<T: Serialize + Clone>(value: &T, binding: &Binding, kind: &str) -> Verified<T> {
    let verifier = FixtureVerifier {
        binding: hash(binding),
        kind: kind.into(),
        input: hash(value),
    };
    Verified::authenticate(
        value.clone(),
        binding,
        kind,
        "TEST_ONLY_exact_proof",
        &verifier,
        NOW,
    )
    .unwrap()
}

fn input(binding: &Binding, selection: &ReadBinding, page: &ReadPage) -> Verified<ValidatedPage> {
    let value = ValidatedPage::decode(&serde_json::to_vec(page).unwrap(), selection).unwrap();
    let verifier = FixtureVerifier {
        binding: hash(binding),
        kind: "P16_READ_PAGE".into(),
        input: hash(&value),
    };
    value
        .authenticate(binding, "TEST_ONLY_exact_proof", &verifier, NOW)
        .unwrap()
}

fn resources() -> Arc<ResourceEnvelope> {
    let resources = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 8,
            foreground_reserved: 2,
            max_entries: 20_000,
            foreground_reserved_entries: 1000,
            max_bytes: 64 * 1024 * 1024,
            foreground_reserved_bytes: 8 * 1024 * 1024,
            storage_max_age: Duration::from_secs(300),
        })
        .unwrap(),
    );
    resources
        .observe_storage(
            StorageObservation {
                observed_at: Utc::now(),
                used_bytes: 1,
                free_bytes: 1_000_000,
                backlog_bytes: 0,
            },
            StorageLimits {
                soft_used_bytes: 1_000_000,
                high_used_bytes: 2_000_000,
                hard_used_bytes: 3_000_000,
                min_free_bytes: 1,
                max_backlog_bytes: 1_000_000,
            },
        )
        .unwrap();
    resources
}

fn url() -> String {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url =
        std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PostgreSQL required");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    url
}

async fn db() -> (PgProjectionStore, PgPool) {
    let url = url();
    let store = PgProjectionStore::connect_with_resources(&url, resources(), 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store.migrate().await.unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(&url)
        .await
        .unwrap();
    (store, pool)
}

async fn cleanup(pool: &PgPool, binding: &Binding) {
    let slot = binding.slot_key().unwrap();
    let mut tx = pool.begin().await.unwrap();
    for table in ["native_p16_scans", "native_p16_facts", "native_p16_streams"] {
        sqlx::query(&format!(
            "DELETE FROM portal_projection.{table} WHERE slot_key=$1"
        ))
        .bind(&slot)
        .execute(&mut *tx)
        .await
        .unwrap();
    }
    tx.commit().await.unwrap();
}

fn query(through: u64) -> NativeP16Query {
    NativeP16Query {
        dataset: "orders".into(),
        after_sequence: 0,
        through_sequence: through,
        limit: 200,
        max_bytes: 1024 * 1024,
    }
}

async fn append(
    store: &PgProjectionStore,
    b: &Binding,
    after: u64,
    through: u64,
    events: Vec<Event>,
) -> Result<NativeP16Receipt, BootstrapError> {
    let selected = selected(b, after, through);
    store
        .p16_append_observations(b, &input(b, &selected, &page(&selected, events)), NOW)
        .await
}

#[tokio::test]
async fn native_semantic_facts_nulls_decimals_and_sparse_positions_are_not_current_state() {
    let (store, pool) = db().await;
    let b = binding();
    let expected = vec![event(2), event(7)];
    let receipt = append(&store, &b, 0, 8, expected.clone()).await.unwrap();
    assert_eq!(receipt.through_sequence(), 8);
    let control = seal(&b, &b, "CONTROL");
    let page = store
        .p16_observations(&b, &control, &query(8), NOW)
        .await
        .unwrap();
    assert_eq!(page.events, expected);
    assert_eq!(page.history_capability, "RETAINED_OBSERVATIONS");
    assert_eq!(
        (page.availability, page.source_freshness),
        ("PARTIAL", "UNKNOWN")
    );
    assert_eq!(page.events[0].operation, Operation::SemanticFact);
    assert!(page.events[0].occurred_at.is_none());
    assert_eq!(page.events[0].entity_version, 0);
    // Native observations did not provision a generic current-state generation.
    let current: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM portal_projection.bootstrap_streams WHERE slot_key=$1)",
    )
    .bind(b.slot_key().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!current);
    let native: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.native_p16_facts WHERE slot_key=$1",
    )
    .bind(b.slot_key().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(native, 2);
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn lost_ack_reopened_store_and_growing_source_head_replay_original_receipt() {
    let (store, pool) = db().await;
    let b = binding();
    let first = append(&store, &b, 0, 8, vec![event(2)]).await.unwrap();
    assert!(!first.replayed());
    drop(store); // Discard the application ACK/connection, retain committed DB.
    let store = PgProjectionStore::connect_with_resources(&url(), resources(), 8)
        .await
        .unwrap();
    let selected = selected(&b, 0, 8);
    let mut retry = page(&selected, vec![event(2)]);
    retry.published_head_sequence = 120;
    let replay = store
        .p16_append_observations(&b, &input(&b, &selected, &retry), NOW)
        .await
        .unwrap();
    assert!(replay.replayed());
    assert_eq!(replay.through_sequence(), first.through_sequence());
    assert_eq!(replay.revision(), first.revision());
    let checkpoint = store
        .p16_observation_checkpoint(&b, &seal(&b, &b, "CONTROL"), NOW)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(checkpoint.revision, 1);
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn conflicting_retry_never_overwrites_committed_native_facts() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 8, vec![event(2)]).await.unwrap();
    let mut changed = event(2);
    changed.operation = Operation::Tombstone; // No invented predecessor needed by native wire.
    assert!(matches!(
        append(&store, &b, 0, 8, vec![changed]).await,
        Err(BootstrapError::Integrity)
    ));
    let result = store
        .p16_observations(&b, &seal(&b, &b, "CONTROL"), &query(8), NOW)
        .await
        .unwrap();
    assert_eq!(result.events[0].operation, Operation::SemanticFact);
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn hidden_only_scan_has_durable_checkpoint_without_fabricated_events() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 8, vec![]).await.unwrap();
    let control = seal(&b, &b, "CONTROL");
    assert_eq!(
        store
            .p16_observation_checkpoint(&b, &control, NOW)
            .await
            .unwrap()
            .unwrap()
            .through_sequence,
        8
    );
    assert!(store
        .p16_observations(&b, &control, &query(8), NOW)
        .await
        .unwrap()
        .events
        .is_empty());
    assert!(matches!(
        append(&store, &b, 0, 9, vec![]).await,
        Err(BootstrapError::Resync)
    ));
    append(&store, &b, 8, 12, vec![event(11)]).await.unwrap();
    assert_eq!(
        store
            .p16_observation_checkpoint(&b, &control, NOW)
            .await
            .unwrap()
            .unwrap()
            .through_sequence,
        12
    );
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn concurrent_identical_append_commits_once_and_returns_one_replay() {
    let (store, pool) = db().await;
    let b = binding();
    let a = append(&store, &b, 0, 8, vec![event(2)]);
    let other = append(&store, &b, 0, 8, vec![event(2)]);
    let (a, other) = tokio::join!(a, other);
    assert_ne!(a.unwrap().replayed(), other.unwrap().replayed());
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn concurrent_disagreeing_scans_have_one_winner_and_no_mixed_facts() {
    let (store, pool) = db().await;
    let b = binding();
    let (a, other) = tokio::join!(
        append(&store, &b, 0, 8, vec![event(2)]),
        append(&store, &b, 0, 8, vec![event(7)])
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(other.is_ok()), 1);
    assert!(matches!(
        a.err().or_else(|| other.err()),
        Some(BootstrapError::Integrity)
    ));
    let facts: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.native_p16_facts WHERE slot_key=$1",
    )
    .bind(b.slot_key().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(facts, 1);
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn late_fact_conflict_rolls_back_earlier_fact_and_scan_checkpoint() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 4, vec![event(2)]).await.unwrap();
    let mut conflict = event(7);
    conflict.business_event_id = event(2).business_event_id;
    assert!(matches!(
        append(&store, &b, 4, 8, vec![event(6), conflict]).await,
        Err(BootstrapError::Integrity)
    ));
    let control = seal(&b, &b, "CONTROL");
    assert_eq!(
        store
            .p16_observation_checkpoint(&b, &control, NOW)
            .await
            .unwrap()
            .unwrap()
            .through_sequence,
        4
    );
    let facts: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM portal_projection.native_p16_facts WHERE slot_key=$1",
    )
    .bind(b.slot_key().unwrap())
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(facts, 1);
    append(&store, &b, 4, 8, vec![event(6), event(7)])
        .await
        .unwrap();
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn proof_kind_binding_and_expiry_fail_closed_before_append_or_read() {
    let (store, pool) = db().await;
    let b = binding();
    let selected = selected(&b, 0, 8);
    let signed = input(&b, &selected, &page(&selected, vec![event(2)]));
    assert!(matches!(
        store
            .p16_append_observations(&b, &signed, NOW + 30_001)
            .await,
        Err(BootstrapError::Protocol(ProtocolError::Expired))
    ));
    let mut other = b.clone();
    other.principal_digest = format!("sha256:{}", raw('f'));
    assert!(matches!(
        store.p16_append_observations(&other, &signed, NOW).await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    store
        .p16_append_observations(&b, &signed, NOW)
        .await
        .unwrap();
    assert!(matches!(
        store
            .p16_observations(&b, &seal(&b, &b, "NOT_CONTROL"), &query(8), NOW)
            .await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    assert!(matches!(
        store
            .p16_observation_checkpoint(&b, &seal(&b, &b, "CONTROL"), NOW + 30_001)
            .await,
        Err(BootstrapError::Protocol(ProtocolError::Expired))
    ));
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn changed_source_selection_or_identity_needs_resync_not_silent_rebinding() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 8, vec![event(2)]).await.unwrap();
    let mut changed = selected(&b, 8, 12);
    changed.access_revision += 1;
    assert!(matches!(
        store
            .p16_append_observations(
                &b,
                &input(&b, &changed, &page(&changed, vec![event(11)])),
                NOW
            )
            .await,
        Err(BootstrapError::Resync)
    ));
    let mut identity = b.clone();
    identity.principal_digest = format!("sha256:{}", raw('f'));
    assert!(matches!(
        append(&store, &identity, 8, 12, vec![event(11)]).await,
        Err(BootstrapError::Resync)
    ));
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn commit_order_is_checked_across_pages_not_only_inside_page() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 8, vec![event(7)]).await.unwrap();
    let mut late = event(11);
    late.source_commit_lsn = "0/2".into();
    assert!(matches!(
        append(&store, &b, 8, 12, vec![late]).await,
        Err(BootstrapError::Integrity)
    ));
    append(&store, &b, 8, 12, vec![event(11)]).await.unwrap();
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn bounded_native_history_pages_pin_committed_cut_and_reject_foreign_dataset() {
    let (store, pool) = db().await;
    let b = binding();
    append(&store, &b, 0, 8, vec![event(2), event(7)])
        .await
        .unwrap();
    let control = seal(&b, &b, "CONTROL");
    let mut request = query(8);
    request.limit = 1;
    let first = store
        .p16_observations(&b, &control, &request, NOW)
        .await
        .unwrap();
    assert_eq!(first.events[0].published_source_sequence, 2);
    assert_eq!(first.next_after_sequence, Some(2));
    append(&store, &b, 8, 12, vec![event(11)]).await.unwrap();
    request.after_sequence = first.next_after_sequence.unwrap();
    let second = store
        .p16_observations(&b, &control, &request, NOW)
        .await
        .unwrap();
    assert_eq!(second.events[0].published_source_sequence, 7);
    assert_eq!(second.next_after_sequence, None); // New11 is outside pinned8.
    request.max_bytes = 2;
    assert!(matches!(
        store.p16_observations(&b, &control, &request, NOW).await,
        Err(BootstrapError::Bounds)
    ));
    request.max_bytes = 1024 * 1024;
    request.dataset = "accounts".into();
    assert!(matches!(
        store.p16_observations(&b, &control, &request, NOW).await,
        Err(BootstrapError::Protocol(ProtocolError::Scope))
    ));
    request.dataset = "orders".into();
    request.through_sequence = 13;
    assert!(matches!(
        store.p16_observations(&b, &control, &request, NOW).await,
        Err(BootstrapError::Resync)
    ));
    request.through_sequence = 12;
    request.limit = 201;
    assert!(matches!(
        store.p16_observations(&b, &control, &request, NOW).await,
        Err(BootstrapError::Bounds)
    ));
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn ungoverned_pool_cannot_bypass_native_resource_admission() {
    let (store, pool) = db().await;
    let b = binding();
    let ungoverned = PgProjectionStore::connect(&url()).await.unwrap();
    assert!(matches!(
        append(&ungoverned, &b, 0, 8, vec![event(2)]).await,
        Err(BootstrapError::Resource(ResourceError::Config))
    ));
    assert!(store
        .p16_observation_checkpoint(&b, &seal(&b, &b, "CONTROL"), NOW)
        .await
        .unwrap()
        .is_none());
    cleanup(&pool, &b).await;
}

#[tokio::test]
async fn native_database_and_read_counters_above_binary64_precision_stay_exact() {
    let (store, pool) = db().await;
    let b = binding();
    let base = 9_007_199_254_740_993_u64;
    let selection = selected(&b, base, base + 4);
    let mut expected = event(base + 2);
    expected.source_commit_lsn = format!("{:X}/{:X}", (base + 2) >> 32, (base + 2) & 0xffff_ffff);
    let mut source = page(&selection, vec![expected.clone()]);
    source.published_head_sequence = base + 10;
    store
        .p16_append_observations(&b, &input(&b, &selection, &source), NOW)
        .await
        .unwrap();
    let control = seal(&b, &b, "CONTROL");
    let checkpoint = store
        .p16_observation_checkpoint(&b, &control, NOW)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(checkpoint.observed_from_sequence, base);
    assert_eq!(checkpoint.through_sequence, base + 4);
    let mut request = query(base + 4);
    request.after_sequence = base;
    let result = store
        .p16_observations(&b, &control, &request, NOW)
        .await
        .unwrap();
    assert_eq!(result.events, vec![expected]);
    cleanup(&pool, &b).await;
}
