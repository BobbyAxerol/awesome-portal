use std::collections::BTreeMap;

use chrono::{TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceCompleteness};
use projection_core::{
    replay, ProjectionEntityKind, ProjectionEpochStatus, ProjectionReducer, ProjectionScope,
    ReplayRecord, SnapshotCompleteness,
};
use projection_store_pg::{EpochMetadata, PgProjectionStore, StoreApplyOutcome};
use ts_adapter_v1::{parse_read_response, ReadFilters, ReadOperation, ReadOutcome, ResponseInput};
use ts_contract_v1::{
    API_VERSION, API_VERSION_HEADER, CONTRACT_REVISION, CONTRACT_REVISION_HEADER, SCHEMA_VERSION,
    SCHEMA_VERSION_HEADER,
};
use uuid::Uuid;

use super::*;

fn headers() -> BTreeMap<String, String> {
    BTreeMap::from([
        (API_VERSION_HEADER.to_owned(), API_VERSION.to_owned()),
        (
            CONTRACT_REVISION_HEADER.to_owned(),
            CONTRACT_REVISION.to_owned(),
        ),
        (SCHEMA_VERSION_HEADER.to_owned(), SCHEMA_VERSION.to_owned()),
    ])
}

#[test]
fn synthetic_corpus_manifest_pins_every_business_fixture() {
    let manifest: Value = serde_json::from_str(include_str!(
        "../../../fixtures/d4-paper-shadow-corpus.manifest.json"
    ))
    .unwrap();
    assert_eq!(
        manifest["schema_version"],
        "portal.execution.d4.synthetic-corpus.v1"
    );
    assert_eq!(manifest["contains_real_business_data"], false);
    let fixtures = [
        (
            "orders.v1.json",
            include_bytes!("../../../fixtures/orders.v1.json").as_slice(),
        ),
        (
            "fills.v1.json",
            include_bytes!("../../../fixtures/fills.v1.json").as_slice(),
        ),
        (
            "positions.v1.json",
            include_bytes!("../../../fixtures/positions.v1.json").as_slice(),
        ),
        (
            "events.v1.json",
            include_bytes!("../../../fixtures/events.v1.json").as_slice(),
        ),
    ];
    for (name, body) in fixtures {
        let digest = format!("sha256:{:x}", Sha256::digest(body));
        assert_eq!(manifest["fixtures"][name], digest);
    }
}

fn context(batch: &str) -> MappingContext {
    MappingContext {
        alpha_id: CanonicalId::parse("alpha-paper-1").unwrap(),
        batch_id: CanonicalId::parse(batch).unwrap(),
        source_read_at: "2026-08-24T10:00:10Z".parse().unwrap(),
        capability_snapshot_id: "capability-d4-test".to_owned(),
        source: LockedSourceSemantics {
            contract_revision: "paper-read.v1".to_owned(),
            route_allowlist_sha256: format!("sha256:{}", "a".repeat(64)),
            cursor_contract_sha256: format!("sha256:{}", "b".repeat(64)),
            completeness_contract_sha256: format!("sha256:{}", "c".repeat(64)),
            resync_contract_sha256: format!("sha256:{}", "d".repeat(64)),
            snapshot_poll_interval_ms: 1_000,
        },
    }
}

fn typed_payload(operation: &ReadOperation, fixture: &[u8]) -> AdapterPayload {
    let ReadOutcome::Success(payload) = parse_read_response(
        operation,
        &ResponseInput {
            http_status: 200,
            headers: &headers(),
            body: fixture,
        },
    )
    .unwrap() else {
        panic!("fixture must be a successful typed response");
    };
    payload
}

fn four_batches() -> Vec<MappedBatch> {
    let alpha = "alpha-paper-1";
    [
        (
            ReadOperation::Orders {
                alpha_id: alpha.to_owned(),
                filters: ReadFilters::default(),
                limit: 100,
            },
            include_bytes!("../../../fixtures/orders.v1.json").as_slice(),
        ),
        (
            ReadOperation::Fills {
                alpha_id: alpha.to_owned(),
                filters: ReadFilters::default(),
                limit: 100,
            },
            include_bytes!("../../../fixtures/fills.v1.json").as_slice(),
        ),
        (
            ReadOperation::Positions {
                alpha_id: alpha.to_owned(),
                filters: ReadFilters::default(),
                include_flat: true,
                limit: 100,
            },
            include_bytes!("../../../fixtures/positions.v1.json").as_slice(),
        ),
        (
            ReadOperation::Events {
                alpha_id: alpha.to_owned(),
                from: None,
                to: None,
                limit: 100,
            },
            include_bytes!("../../../fixtures/events.v1.json").as_slice(),
        ),
    ]
    .into_iter()
    .enumerate()
    .map(|(index, (operation, fixture))| {
        map_business_payload(
            typed_payload(&operation, fixture),
            &context(&format!("batch-{index}")),
        )
        .unwrap()
    })
    .collect()
}

#[test]
fn maps_exactly_the_four_locked_business_resources() {
    let batches = four_batches();
    assert_eq!(batches.len(), 4);
    assert_eq!(batches[0].resource, BusinessResource::Orders);
    assert_eq!(batches[1].resource, BusinessResource::Fills);
    assert_eq!(batches[2].resource, BusinessResource::Positions);
    assert_eq!(batches[3].resource, BusinessResource::Events);
    assert!(batches
        .iter()
        .all(|batch| batch.page_completeness == SnapshotCompleteness::Partial));
    assert_eq!(batches[0].observations[0].payload["quantity"], "0.00100000");
    assert_eq!(
        batches[0].observations[0].payload["account_id"],
        "paper-account-1"
    );
    assert_eq!(
        batches[3].observations[0].source_completeness,
        SourceCompleteness::EventSourced
    );
    assert_eq!(
        batches[3].observations[0].entity.kind,
        ProjectionEntityKind::Event
    );
    assert!(batches[3].observations[0].source_cursor.is_some());
}

#[test]
fn sealed_batch_mapping_and_replay_are_deterministic() {
    let scope = ProjectionScope::new(CanonicalId::parse("workspace-d4").unwrap(), "paper").unwrap();
    let epoch_id = Uuid::parse_str("018f8f3e-7b4c-7cc1-8a4f-123456789abc").unwrap();
    let projected_at = "2026-08-24T10:00:11Z".parse().unwrap();
    let mut reducer = ProjectionReducer::new(scope.clone(), epoch_id);
    let records = four_batches()
        .into_iter()
        .flat_map(|batch| batch.observations)
        .enumerate()
        .map(|(index, observation)| {
            reducer.apply(observation.clone(), projected_at).unwrap();
            ReplayRecord {
                journal_ordinal: u64::try_from(index + 1).unwrap(),
                observation,
                projected_at,
            }
        })
        .collect::<Vec<_>>();
    let replayed = replay(scope, epoch_id, records).unwrap();
    assert_eq!(reducer.state_digest().unwrap(), replayed.state_digest);
    assert_eq!(replayed.input_count, 4);
    assert_eq!(replayed.duplicate_count, 0);
    assert_eq!(replayed.out_of_order_count, 0);
}

#[test]
fn same_snapshot_batch_is_idempotent_and_new_poll_refreshes() {
    let payload = typed_payload(
        &ReadOperation::Orders {
            alpha_id: "alpha-paper-1".to_owned(),
            filters: ReadFilters::default(),
            limit: 100,
        },
        include_bytes!("../../../fixtures/orders.v1.json"),
    );
    let first = map_business_payload(payload.clone(), &context("batch-stable")).unwrap();
    let duplicate = map_business_payload(payload.clone(), &context("batch-stable")).unwrap();
    assert_eq!(
        first.observations[0].ingestion_id,
        duplicate.observations[0].ingestion_id
    );

    let mut later = context("batch-next");
    later.source_read_at += TimeDelta::seconds(1);
    let refresh = map_business_payload(payload, &later).unwrap();
    assert_ne!(
        first.observations[0].ingestion_id,
        refresh.observations[0].ingestion_id
    );
}

#[test]
fn malformed_source_semantics_and_public_payloads_are_rejected() {
    let mut invalid = context("batch-invalid");
    invalid.source.resync_contract_sha256 = "not-a-digest".to_owned();
    let payload = typed_payload(
        &ReadOperation::Orders {
            alpha_id: "alpha-paper-1".to_owned(),
            filters: ReadFilters::default(),
            limit: 1,
        },
        include_bytes!("../../../fixtures/orders.v1.json"),
    );
    assert!(matches!(
        map_business_payload(payload.clone(), &invalid),
        Err(MapperError::InvalidSourceSemantics)
    ));
    invalid = context("batch-whitespace");
    invalid.source.contract_revision = " paper-read.v1".to_owned();
    assert!(matches!(
        map_business_payload(payload, &invalid),
        Err(MapperError::InvalidSourceSemantics)
    ));
    let public = typed_payload(
        &ReadOperation::Health,
        include_bytes!("../../../fixtures/health.v1.json"),
    );
    assert!(matches!(
        map_business_payload(public, &context("batch-public")),
        Err(MapperError::NotBusinessPayload)
    ));
}

#[tokio::test]
async fn postgres_shadow_path_writes_and_replays_only_a_building_epoch() {
    let Ok(database_url) = std::env::var("TEST_PROJECTION_DATABASE_URL") else {
        return;
    };
    let store = PgProjectionStore::connect(&database_url).await.unwrap();
    store.migrate().await.unwrap();
    let workspace = format!("workspace-d4-{}", Uuid::now_v7());
    let scope = ProjectionScope::new(CanonicalId::parse(workspace).unwrap(), "paper").unwrap();
    let epoch_id = store
        .create_building_epoch(
            &scope,
            &EpochMetadata {
                adapter_version: MAPPER_VERSION.to_owned(),
                source_gateway_digest: format!("sha256:{}", "e".repeat(64)),
                capability_snapshot_id: "capability-d4-test".to_owned(),
            },
            Utc::now(),
        )
        .await
        .unwrap();

    for batch in four_batches() {
        for observation in batch.observations {
            assert!(matches!(
                store
                    .apply_observation(
                        &scope,
                        epoch_id,
                        &batch.stream_key,
                        &observation,
                        Utc::now(),
                    )
                    .await
                    .unwrap(),
                StoreApplyOutcome::Applied { .. }
            ));
        }
    }

    let records = store.load_replay_records(epoch_id).await.unwrap();
    let replayed = replay(scope, epoch_id, records).unwrap();
    assert_eq!(replayed.input_count, 4);
    assert_eq!(replayed.duplicate_count, 0);
    assert_eq!(replayed.out_of_order_count, 0);
    assert_eq!(
        store.load_epoch_status(epoch_id).await.unwrap(),
        ProjectionEpochStatus::Building
    );
    assert!(!store
        .active_realtime_epoch_watermarks()
        .await
        .unwrap()
        .iter()
        .any(|epoch| epoch.epoch_id == epoch_id));
}
