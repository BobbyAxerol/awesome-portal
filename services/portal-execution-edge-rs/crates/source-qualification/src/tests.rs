use std::collections::BTreeMap;

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness};
use projection_core::{
    replay, ProjectionEntityKey, ProjectionEntityKind, ProjectionObservation, ProjectionOperation,
    ProjectionScope, ReplayRecord, SourceSequenceSemantics,
};
use serde_json::json;
use ts_adapter_v1::{
    map_order, parse_read_response, AdapterPayload, ReadFilters, ReadOperation, ReadOutcome,
    ResponseInput,
};
use ts_contract_v1::{
    API_VERSION, API_VERSION_HEADER, CONTRACT_REVISION, CONTRACT_REVISION_HEADER, SCHEMA_VERSION,
    SCHEMA_VERSION_HEADER,
};
use uuid::Uuid;

use super::*;

const ORDERS: &[u8] = include_bytes!("../../../fixtures/orders.v1.json");
const UNKNOWN_ORDER: &[u8] = include_bytes!("../../../fixtures/orders.unknown-status.v1.json");
const CONTRACT_PACK_DIGEST: &str =
    "sha256:9e4430fcb27cce87158376a53888dc80515673d32dbfe3b53d08e164de67e85d";
const ZERO_STATE_DIGEST: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const GOLDEN_ORDER_STATE_DIGEST: &str =
    "sha256:f1886c57d7d2d0897b4d98b5eb489ba5e283dd2e532a1e0b48cff429776e3cc4";

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(seconds, 0).unwrap()
}

fn timestamp(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .unwrap()
        .with_timezone(&Utc)
}

fn scope() -> ProjectionScope {
    ProjectionScope::new(CanonicalId::parse("workspace-offline").unwrap(), "paper").unwrap()
}

fn identity(captured_at: DateTime<Utc>) -> SourceCorpusIdentity {
    SourceCorpusIdentity {
        corpus_id: CanonicalId::parse("golden-source-corpus-v1").unwrap(),
        source_contract_revision: SUPPORTED_CONTRACT_REVISION.to_owned(),
        source_gateway_digest: CONTRACT_PACK_DIGEST.to_owned(),
        adapter_version: SUPPORTED_ADAPTER_VERSION.to_owned(),
        capability_snapshot_id: "cap-offline-v1".to_owned(),
        captured_at,
    }
}

fn observation(
    ingestion_id: impl Into<String>,
    entity_id: impl Into<String>,
    kind: ProjectionEntityKind,
    source_sequence: i64,
    source_read_at: DateTime<Utc>,
    payload: serde_json::Value,
) -> ProjectionObservation {
    ProjectionObservation {
        ingestion_id: CanonicalId::parse(ingestion_id.into()).unwrap(),
        entity: ProjectionEntityKey {
            kind,
            entity_id: CanonicalId::parse(entity_id.into()).unwrap(),
        },
        source_authority: SourceAuthority::Execution,
        as_of: Some(source_read_at),
        source_read_at,
        source_cursor: None,
        source_sequence: Some(source_sequence),
        source_sequence_semantics: SourceSequenceSemantics::PerEntityContiguous,
        operation: ProjectionOperation::Upsert,
        source_completeness: SourceCompleteness::PollBounded,
        poll_interval_ms: Some(1_000),
        adapter_version: SUPPORTED_ADAPTER_VERSION.to_owned(),
        capability_snapshot_id: "cap-offline-v1".to_owned(),
        payload,
    }
}

fn state_digest(observations: &[ProjectionObservation], epoch_id: Uuid) -> String {
    replay(
        scope(),
        epoch_id,
        observations
            .iter()
            .cloned()
            .enumerate()
            .map(|(index, observation)| ReplayRecord {
                journal_ordinal: u64::try_from(index).unwrap(),
                observation,
                projected_at: at(100),
            })
            .collect(),
    )
    .unwrap()
    .state_digest
}

fn v1_headers() -> BTreeMap<String, String> {
    BTreeMap::from([
        (API_VERSION_HEADER.to_owned(), API_VERSION.to_owned()),
        (
            CONTRACT_REVISION_HEADER.to_owned(),
            CONTRACT_REVISION.to_owned(),
        ),
        (SCHEMA_VERSION_HEADER.to_owned(), SCHEMA_VERSION.to_owned()),
    ])
}

fn order_from_fixture(body: &[u8], ingestion_id: &str) -> ProjectionObservation {
    let operation = ReadOperation::Orders {
        alpha_id: "alpha-paper-1".to_owned(),
        filters: ReadFilters::default(),
        limit: 100,
    };
    let ReadOutcome::Success(AdapterPayload::Orders { mut rows, .. }) = parse_read_response(
        &operation,
        &ResponseInput {
            http_status: 200,
            headers: &v1_headers(),
            body,
        },
    )
    .unwrap() else {
        panic!("expected typed v1 order fixture");
    };
    let fact = map_order(rows.remove(0), "alpha-paper-1").unwrap();
    let source_read_at = fact.updated_at.or(fact.created_at).unwrap();
    let entity_id = fact.client_order_id.as_str().to_owned();
    observation(
        ingestion_id,
        entity_id,
        ProjectionEntityKind::Order,
        1,
        source_read_at,
        serde_json::to_value(fact).unwrap(),
    )
}

#[test]
fn v1_wire_fixture_maps_to_frozen_replay_parity() {
    let epoch_id = Uuid::parse_str("018f3f00-0000-7000-8000-000000000099").unwrap();
    let observations = vec![order_from_fixture(ORDERS, "ingest-order-1")];
    let actual = state_digest(&observations, epoch_id);
    assert_eq!(actual, GOLDEN_ORDER_STATE_DIGEST);
    let corpus = QualificationCorpus::new(
        identity(timestamp("2026-08-20T10:00:06Z")),
        scope(),
        GOLDEN_ORDER_STATE_DIGEST.to_owned(),
        observations,
    )
    .unwrap();
    let report = qualify_offline(&corpus, epoch_id, timestamp("2026-08-20T10:00:07Z")).unwrap();
    assert_eq!(report.gate_status, OfflineGateStatus::Passed);
    assert!(!report.activation_authorized);
    assert_eq!(report.metrics.applied_total, 1);
}

#[test]
fn duplicate_out_of_order_and_gap_are_explicit_and_replay_deterministic() {
    let epoch_id = Uuid::now_v7();
    let first = observation(
        "ingest-order-first",
        "order-1",
        ProjectionEntityKind::Order,
        1,
        at(10),
        json!({"status":"OPEN","credential":"must-not-appear"}),
    );
    let newer = observation(
        "ingest-order-newer",
        "order-1",
        ProjectionEntityKind::Order,
        3,
        at(30),
        json!({"status":"FILLED"}),
    );
    let older = observation(
        "ingest-order-older",
        "order-1",
        ProjectionEntityKind::Order,
        2,
        at(20),
        json!({"status":"PARTIALLY_FILLED"}),
    );
    let observations = vec![first.clone(), newer, first, older];
    let expected = state_digest(&observations, epoch_id);
    let corpus =
        QualificationCorpus::new(identity(at(40)), scope(), expected, observations).unwrap();
    let report = qualify_offline(&corpus, epoch_id, at(50)).unwrap();

    assert_eq!(report.gate_status, OfflineGateStatus::BlockedSourceGap);
    assert_eq!(report.blocker_codes, ["SOURCE_GAP_PRESENT"]);
    assert_eq!(report.metrics.applied_total, 2);
    assert_eq!(report.metrics.duplicate_total, 1);
    assert_eq!(report.metrics.out_of_order_total, 1);
    assert_eq!(report.metrics.source_gap_total, 1);
    let serialized = serde_json::to_string(&report).unwrap();
    assert!(!serialized.contains("must-not-appear"));
    assert!(!serialized.contains("order-1"));
}

#[test]
fn tamper_and_compatibility_drift_fail_before_reduction() {
    let epoch_id = Uuid::now_v7();
    let observations = vec![observation(
        "ingest-1",
        "order-1",
        ProjectionEntityKind::Order,
        1,
        at(10),
        json!({"status":"OPEN"}),
    )];
    let expected = state_digest(&observations, epoch_id);
    let mut corpus =
        QualificationCorpus::new(identity(at(20)), scope(), expected, observations).unwrap();
    corpus.observations[0].payload = json!({"status":"TAMPERED"});
    assert_eq!(
        corpus.validate().unwrap_err().reason_code(),
        "CORPUS_DIGEST_MISMATCH"
    );

    let mut wrong_revision = identity(at(20));
    wrong_revision.source_contract_revision = "v2".to_owned();
    assert_eq!(
        QualificationCorpus::new(
            wrong_revision,
            scope(),
            ZERO_STATE_DIGEST.to_owned(),
            vec![],
        )
        .unwrap_err()
        .reason_code(),
        "SOURCE_CONTRACT_UNSUPPORTED"
    );
}

#[test]
fn failed_adapter_candidate_does_not_poison_pinned_rollback_qualification() {
    let epoch_id = Uuid::now_v7();
    let observations = vec![observation(
        "ingest-rollback",
        "order-rollback",
        ProjectionEntityKind::Order,
        1,
        at(10),
        json!({"status":"OPEN"}),
    )];
    let expected = state_digest(&observations, epoch_id);
    let pinned = QualificationCorpus::new(
        identity(at(20)),
        scope(),
        expected.clone(),
        observations.clone(),
    )
    .unwrap();
    let before = qualify_offline(&pinned, epoch_id, at(30)).unwrap();

    let mut candidate_identity = identity(at(20));
    candidate_identity.adapter_version = "ts-adapter-v2-unapproved".to_owned();
    let mut candidate_observations = observations;
    candidate_observations[0].adapter_version = candidate_identity.adapter_version.clone();
    assert_eq!(
        QualificationCorpus::new(
            candidate_identity,
            scope(),
            expected,
            candidate_observations,
        )
        .unwrap_err()
        .reason_code(),
        "SOURCE_ADAPTER_UNSUPPORTED"
    );

    let after = qualify_offline(&pinned, epoch_id, at(30)).unwrap();
    assert_eq!(after, before);
    assert!(!after.activation_authorized);
}

#[test]
fn unknown_source_vocabulary_is_preserved_without_becoming_authoritative() {
    let mapped = order_from_fixture(UNKNOWN_ORDER, "ingest-unknown-order");
    assert_eq!(mapped.payload["status"]["raw"], "BROKER_PENDING_V2");
    assert_eq!(mapped.payload["status"]["supported"], false);
}

#[test]
fn qualifies_the_locked_single_page_cap_without_unbounded_output() {
    let epoch_id = Uuid::now_v7();
    let observations = (0..MAX_CORPUS_OBSERVATIONS)
        .map(|index| {
            observation(
                format!("ingest-{index}"),
                format!("order-{index}"),
                ProjectionEntityKind::Order,
                1,
                at(10),
                json!({"status":"OPEN","ordinal":index}),
            )
        })
        .collect::<Vec<_>>();
    let expected = state_digest(&observations, epoch_id);
    let corpus =
        QualificationCorpus::new(identity(at(20)), scope(), expected, observations).unwrap();
    let report = qualify_offline(&corpus, epoch_id, at(30)).unwrap();

    assert_eq!(report.observation_count, MAX_CORPUS_OBSERVATIONS);
    assert_eq!(report.metrics.applied_total, 5_000);
    assert_eq!(report.gate_status, OfflineGateStatus::Passed);
    assert!(serde_json::to_vec(&report).unwrap().len() < 2_048);
}

#[test]
fn future_receipt_and_idempotency_collision_fail_closed() {
    let epoch_id = Uuid::now_v7();
    let first = observation(
        "ingest-same",
        "order-1",
        ProjectionEntityKind::Order,
        1,
        at(10),
        json!({"status":"OPEN"}),
    );
    let collision = observation(
        "ingest-same",
        "order-1",
        ProjectionEntityKind::Order,
        2,
        at(11),
        json!({"status":"FILLED"}),
    );
    let observations = vec![first, collision];
    let corpus = QualificationCorpus::new(
        identity(at(20)),
        scope(),
        ZERO_STATE_DIGEST.to_owned(),
        observations,
    )
    .unwrap();
    assert_eq!(
        qualify_offline(&corpus, epoch_id, at(30))
            .unwrap_err()
            .reason_code(),
        "PROJECTION_REJECTED"
    );

    let future = observation(
        "ingest-future",
        "order-2",
        ProjectionEntityKind::Order,
        1,
        at(30),
        json!({"status":"OPEN"}),
    );
    assert_eq!(
        QualificationCorpus::new(
            identity(at(20) - TimeDelta::milliseconds(2_001)),
            scope(),
            ZERO_STATE_DIGEST.to_owned(),
            vec![future]
        )
        .unwrap_err()
        .reason_code(),
        "CAPTURE_TIME_INVERSION"
    );

    let observations = vec![observation(
        "ingest-time-order",
        "order-time",
        ProjectionEntityKind::Order,
        1,
        at(10),
        json!({"status":"OPEN"}),
    )];
    let expected = state_digest(&observations, epoch_id);
    let corpus =
        QualificationCorpus::new(identity(at(20)), scope(), expected, observations).unwrap();
    assert_eq!(
        qualify_offline(&corpus, epoch_id, at(19))
            .unwrap_err()
            .reason_code(),
        "PROJECTION_TIME_INVERSION"
    );
}
