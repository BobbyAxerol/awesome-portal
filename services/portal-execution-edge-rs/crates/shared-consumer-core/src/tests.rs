use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use projection_core::{
    ProjectionEntityKey, ProjectionEntityKind, ProjectionObservation, ProjectionOperation,
    ProjectionScope, SourceSequenceSemantics,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::*;

fn at(second: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(1_800_000_000 + second, 0).unwrap()
}

fn scope() -> ProjectionScope {
    ProjectionScope::new(CanonicalId::parse("workspace_n04").unwrap(), "paper").unwrap()
}

fn config(epoch_id: Uuid) -> SharedConsumerConfig {
    let bounds = SharedConsumerBounds {
        request_timeout: Duration::from_secs(30),
        ..SharedConsumerBounds::default()
    };
    SharedConsumerConfig {
        scope: scope(),
        source_scope_id: PAPER_SOURCE_SCOPE_ID.to_owned(),
        epoch_id,
        bounds,
    }
}

fn grant(epoch_id: Uuid, fence: u64, expires_at: DateTime<Utc>) -> ConsumerLeaseGrant {
    ConsumerLeaseGrant {
        scope: scope(),
        source_scope_id: PAPER_SOURCE_SCOPE_ID.to_owned(),
        epoch_id,
        lease_id: Uuid::from_u128(100 + u128::from(fence)),
        fencing_token: fence,
        expires_at,
    }
}

fn source_lease(expires_at: DateTime<Utc>) -> SourceLease {
    SourceLease {
        token: SensitiveValue::parse("source-lease-secret").unwrap(),
        expires_at,
    }
}

fn cursor(value: &str) -> SensitiveValue {
    SensitiveValue::parse(value).unwrap()
}

fn write(sequence: i64, operation: ProjectionOperation) -> ConsumerProjectionWrite {
    let event_id = format!("event_n04_{sequence}");
    ConsumerProjectionWrite {
        stream_key: "n04:paper:orders".to_owned(),
        observation: ProjectionObservation {
            ingestion_id: CanonicalId::parse(&event_id).unwrap(),
            entity: ProjectionEntityKey {
                kind: ProjectionEntityKind::Order,
                entity_id: CanonicalId::parse("order_n04_1").unwrap(),
            },
            source_authority: SourceAuthority::Execution,
            as_of: Some(at(sequence)),
            source_read_at: at(sequence) + TimeDelta::milliseconds(1),
            source_cursor: Some(SourceCursor {
                event_ts: at(sequence),
                created_at: at(sequence),
                event_id: CanonicalId::parse(&event_id).unwrap(),
            }),
            source_sequence: Some(sequence),
            source_sequence_semantics: SourceSequenceSemantics::GlobalStreamMonotonic,
            operation,
            source_completeness: SourceCompleteness::EventSourced,
            poll_interval_ms: None,
            adapter_version: "n04-source-dark-adapter".to_owned(),
            capability_snapshot_id: "cap_n04_fixture".to_owned(),
            payload: json!({"synthetic": true, "sequence": sequence}),
        },
    }
}

fn page(previous: &str, next: &str, first: u64, last: u64) -> SourceDeltaPage {
    SourceDeltaPage {
        previous_cursor: cursor(previous),
        next_cursor: cursor(next),
        writes: (first..=last)
            .map(|sequence| {
                write(
                    i64::try_from(sequence).unwrap(),
                    ProjectionOperation::Upsert,
                )
            })
            .collect(),
        first_source_sequence: Some(first),
        last_source_sequence: Some(last),
        source_head_sequence: last,
        caught_up: true,
        source_read_at: at(i64::try_from(last).unwrap()),
        response_bytes: 512,
    }
}

fn ready_consumer(epoch_id: Uuid) -> (LeaseAwareSharedConsumer, ConsumerLeaseGrant, DateTime<Utc>) {
    let now = at(0);
    let lease = grant(epoch_id, 1, at(100));
    let mut consumer = LeaseAwareSharedConsumer::new(config(epoch_id)).unwrap();
    consumer.set_demand(1, now);
    assert_eq!(
        consumer
            .install_leases(
                lease.clone(),
                source_lease(at(100)),
                cursor("cursor-0"),
                Some(10),
                now,
            )
            .unwrap(),
        ConsumerEffect::PollReady
    );
    (consumer, lease, now)
}

#[test]
fn construction_is_source_dark_and_no_demand_blocks_poll() {
    let epoch_id = Uuid::now_v7();
    let mut consumer = LeaseAwareSharedConsumer::new(config(epoch_id)).unwrap();
    let snapshot = consumer.redacted_snapshot(at(0));
    assert_eq!(snapshot.state, SharedConsumerState::Dormant);
    assert_eq!(snapshot.metrics.requests_started, 0);
    assert_eq!(consumer.begin_poll(at(0)), Err(ConsumerError::NoDemand));
}

#[test]
fn scope_and_runtime_bounds_fail_closed() {
    let epoch_id = Uuid::now_v7();
    let mut invalid = config(epoch_id);
    invalid.bounds.maximum_in_flight_requests = 2;
    assert!(matches!(
        LeaseAwareSharedConsumer::new(invalid),
        Err(ConsumerError::UnsafeBounds)
    ));
    let mut invalid = config(epoch_id);
    invalid.source_scope_id = "CALLER_SELECTED".to_owned();
    assert!(matches!(
        LeaseAwareSharedConsumer::new(invalid),
        Err(ConsumerError::ScopeMismatch)
    ));
}

#[test]
fn opaque_values_and_poll_permit_are_redacted() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let debug = format!("{permit:?}");
    assert!(!debug.contains("source-lease-secret"));
    assert!(!debug.contains("cursor-0"));
    assert!(debug.contains("[REDACTED]"));
    let snapshot = format!("{:?}", consumer.redacted_snapshot(now));
    assert!(!snapshot.contains("source-lease-secret"));
    assert!(!snapshot.contains("cursor-0"));
}

#[test]
fn cursor_advances_only_after_exact_atomic_ack() {
    let (mut consumer, lease, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let effect = consumer
        .accept_page(&permit, page("cursor-0", "cursor-1", 11, 12), at(12))
        .unwrap();
    let ConsumerEffect::CommitRequired { batch_digest, .. } = effect else {
        panic!("commit expected");
    };
    assert_eq!(
        consumer.begin_poll(at(13)),
        Err(ConsumerError::InvalidState)
    );
    assert_eq!(
        consumer.acknowledge_commit(
            lease.proof(),
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            CommitDisposition::Written,
            at(13),
        ),
        Err(ConsumerError::CommitAcknowledgementMismatch)
    );
    consumer
        .acknowledge_commit(
            lease.proof(),
            &batch_digest,
            CommitDisposition::Written,
            at(13),
        )
        .unwrap();
    let next = consumer.begin_poll(at(14)).unwrap();
    assert_eq!(next.cursor_for_adapter(), "cursor-1");
}

#[test]
fn duplicate_replay_is_idempotent_after_commit() {
    let (mut consumer, lease, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let replay = page("cursor-0", "cursor-1", 11, 11);
    let effect = consumer
        .accept_page(&permit, replay.clone(), at(11))
        .unwrap();
    let ConsumerEffect::CommitRequired { batch_digest, .. } = effect else {
        panic!("commit expected");
    };
    consumer
        .acknowledge_commit(
            lease.proof(),
            &batch_digest,
            CommitDisposition::AlreadyDurable,
            at(12),
        )
        .unwrap();
    let second_permit = consumer.begin_poll(at(13)).unwrap();
    assert_eq!(
        consumer
            .accept_page(&second_permit, replay, at(13))
            .unwrap(),
        ConsumerEffect::DuplicatePage
    );
    assert_eq!(
        consumer.redacted_snapshot(at(13)).metrics.duplicate_pages,
        1
    );
}

#[test]
fn out_of_order_and_gap_are_terminal_without_cursor_advance() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    assert_eq!(
        consumer.accept_page(&permit, page("cursor-0", "cursor-x", 12, 12), at(12)),
        Err(ConsumerError::GapDetected)
    );
    assert_eq!(
        consumer.redacted_snapshot(at(12)).state,
        SharedConsumerState::RebuildRequired
    );

    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    assert_eq!(
        consumer.accept_page(&permit, page("cursor-0", "cursor-x", 10, 10), at(10)),
        Err(ConsumerError::OutOfOrder)
    );
    assert_eq!(
        consumer.redacted_snapshot(at(10)).state,
        SharedConsumerState::RebuildRequired
    );
}

#[test]
fn delete_tombstone_is_carried_to_atomic_commit() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let mut tombstone = page("cursor-0", "cursor-1", 11, 11);
    tombstone.writes[0] = write(11, ProjectionOperation::Delete);
    consumer.accept_page(&permit, tombstone, at(11)).unwrap();
    assert_eq!(
        consumer.pending_commit().unwrap().writes[0]
            .observation
            .operation,
        ProjectionOperation::Delete
    );
}

#[test]
fn stale_fence_discards_pending_work() {
    let (mut consumer, lease, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let effect = consumer
        .accept_page(&permit, page("cursor-0", "cursor-1", 11, 11), at(11))
        .unwrap();
    let ConsumerEffect::CommitRequired { batch_digest, .. } = effect else {
        panic!("commit expected");
    };
    let stale = ConsumerLeaseProof {
        lease_id: lease.lease_id,
        fencing_token: lease.fencing_token + 1,
    };
    assert_eq!(
        consumer.acknowledge_commit(stale, &batch_digest, CommitDisposition::Written, at(12)),
        Err(ConsumerError::StaleFencingToken)
    );
    let snapshot = consumer.redacted_snapshot(at(12));
    assert_eq!(snapshot.state, SharedConsumerState::Dormant);
    assert_eq!(snapshot.pending_commit_state, ConsumerSignalState::Inactive);
}

#[test]
fn stale_or_same_generation_replacement_cannot_be_installed() {
    let epoch_id = Uuid::now_v7();
    let (mut consumer, current, _) = ready_consumer(epoch_id);
    let mut stale = grant(epoch_id, current.fencing_token, at(200));
    stale.lease_id = Uuid::now_v7();
    assert_eq!(
        consumer.install_leases(
            stale,
            source_lease(at(200)),
            cursor("cursor-stale"),
            Some(10),
            at(1),
        ),
        Err(ConsumerError::StaleFencingToken)
    );
    let mut replacement = grant(epoch_id, current.fencing_token + 1, at(200));
    replacement.lease_id = Uuid::now_v7();
    assert_eq!(
        consumer
            .install_leases(
                replacement,
                source_lease(at(200)),
                cursor("cursor-durable"),
                Some(10),
                at(1),
            )
            .unwrap(),
        ConsumerEffect::PollReady
    );
}

#[test]
fn lease_expiry_stops_all_future_source_requests() {
    let epoch_id = Uuid::now_v7();
    let mut consumer = LeaseAwareSharedConsumer::new(config(epoch_id)).unwrap();
    consumer.set_demand(1, at(0));
    consumer
        .install_leases(
            grant(epoch_id, 1, at(5)),
            source_lease(at(5)),
            cursor("cursor-0"),
            Some(10),
            at(0),
        )
        .unwrap();
    assert_eq!(consumer.begin_poll(at(5)), Err(ConsumerError::InvalidState));
    let snapshot = consumer.redacted_snapshot(at(5));
    assert_eq!(snapshot.state, SharedConsumerState::Dormant);
    assert_eq!(snapshot.metrics.requests_started, 0);
    assert_eq!(snapshot.metrics.lease_losses, 1);
}

#[test]
fn demand_idle_never_creates_a_source_request() {
    let epoch_id = Uuid::now_v7();
    let mut consumer = LeaseAwareSharedConsumer::new(config(epoch_id)).unwrap();
    consumer
        .install_leases(
            grant(epoch_id, 1, at(100)),
            source_lease(at(100)),
            cursor("cursor-0"),
            None,
            at(0),
        )
        .unwrap();
    assert_eq!(consumer.tick(at(60)), ConsumerEffect::DemandIdle);
    assert_eq!(consumer.begin_poll(at(60)), Err(ConsumerError::NoDemand));
    assert_eq!(
        consumer.redacted_snapshot(at(60)).metrics.requests_started,
        0
    );
}

#[test]
fn transient_retry_is_explicit_and_bounded() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let mut poll_at = now;
    for _ in 0..3 {
        let permit = consumer.begin_poll(poll_at).unwrap();
        let effect = consumer
            .source_failed(
                &permit,
                SourceFailureClass::SourceUnavailable,
                poll_at,
                Some(Duration::from_secs(1)),
            )
            .unwrap();
        assert_eq!(effect, ConsumerEffect::RetryAfter(Duration::from_secs(1)));
        assert_eq!(
            consumer.begin_poll(poll_at),
            Err(ConsumerError::RetryBackoffActive)
        );
        poll_at += TimeDelta::seconds(1);
    }
    let permit = consumer.begin_poll(poll_at).unwrap();
    assert_eq!(
        consumer.source_failed(
            &permit,
            SourceFailureClass::SourceUnavailable,
            poll_at,
            Some(Duration::from_secs(1)),
        ),
        Err(ConsumerError::RetryBudgetExceeded)
    );
    assert_eq!(
        consumer.redacted_snapshot(poll_at).state,
        SharedConsumerState::CircuitOpen
    );
    assert_eq!(consumer.set_demand(1, poll_at), ConsumerEffect::CircuitOpen);
}

#[test]
fn source_loss_does_not_advance_cursor() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let first = consumer.begin_poll(now).unwrap();
    assert_eq!(first.cursor_for_adapter(), "cursor-0");
    consumer
        .source_failed(
            &first,
            SourceFailureClass::SourceUnavailable,
            now,
            Some(Duration::from_secs(1)),
        )
        .unwrap();
    let second = consumer.begin_poll(now + TimeDelta::seconds(1)).unwrap();
    assert_eq!(second.cursor_for_adapter(), "cursor-0");
}

#[test]
fn superseded_poll_callbacks_cannot_mutate_the_active_request() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let first = consumer.begin_poll(now).unwrap();
    consumer
        .source_failed(
            &first,
            SourceFailureClass::SourceUnavailable,
            now,
            Some(Duration::from_secs(1)),
        )
        .unwrap();
    let second_at = now + TimeDelta::seconds(1);
    let second = consumer.begin_poll(second_at).unwrap();

    assert_eq!(
        consumer.source_failed(
            &first,
            SourceFailureClass::SourceUnavailable,
            second_at,
            None,
        ),
        Err(ConsumerError::StalePollPermit)
    );
    assert_eq!(
        consumer.accept_page(&first, page("cursor-0", "cursor-stale", 11, 11), second_at,),
        Err(ConsumerError::StalePollPermit)
    );
    assert_eq!(
        consumer.redacted_snapshot(second_at).state,
        SharedConsumerState::AwaitingSource
    );
    assert!(matches!(
        consumer
            .accept_page(
                &second,
                page("cursor-0", "cursor-current", 11, 11),
                second_at,
            )
            .unwrap(),
        ConsumerEffect::CommitRequired { .. }
    ));
}

#[test]
fn response_and_page_bounds_fail_closed() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let mut oversized = page("cursor-0", "cursor-1", 11, 11);
    oversized.response_bytes = MAX_RESPONSE_BYTES + 1;
    assert_eq!(
        consumer.accept_page(&permit, oversized, at(11)),
        Err(ConsumerError::ResponseTooLarge)
    );
    assert_eq!(
        consumer.redacted_snapshot(at(11)).state,
        SharedConsumerState::RebuildRequired
    );
}

#[test]
fn duplicate_event_ids_inside_page_are_rejected() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    let mut invalid = page("cursor-0", "cursor-1", 11, 12);
    invalid.writes[1].observation.ingestion_id = invalid.writes[0].observation.ingestion_id.clone();
    assert_eq!(
        consumer.accept_page(&permit, invalid, at(12)),
        Err(ConsumerError::InvalidObservation)
    );
}

#[test]
fn owner_digest_and_lease_ttl_are_strict() {
    assert!(LeaseOwnerDigest::parse(format!("sha256:{}", "a".repeat(64))).is_ok());
    assert_eq!(
        LeaseOwnerDigest::parse("sha256:ABC"),
        Err(ConsumerError::InvalidDigest)
    );
    assert!(lease_ttl_is_bounded(Duration::from_secs(30)));
    assert!(!lease_ttl_is_bounded(Duration::from_secs(1)));
    assert!(!lease_ttl_is_bounded(Duration::from_secs(301)));
}

#[test]
fn source_declared_gap_forces_new_epoch() {
    let (mut consumer, _, now) = ready_consumer(Uuid::now_v7());
    let permit = consumer.begin_poll(now).unwrap();
    assert_eq!(
        consumer
            .source_failed(&permit, SourceFailureClass::CursorExpired, now, None)
            .unwrap(),
        ConsumerEffect::RebuildRequired
    );
    assert_eq!(
        consumer.redacted_snapshot(now).state,
        SharedConsumerState::RebuildRequired
    );
}

#[test]
fn redacted_metrics_contain_no_scope_cursor_or_credentials() {
    let (consumer, _, now) = ready_consumer(Uuid::now_v7());
    let encoded = serde_json::to_string(&consumer.redacted_snapshot(now).metrics).unwrap();
    assert!(!encoded.contains("workspace_n04"));
    assert!(!encoded.contains("PAPER_BINANCE_USDM"));
    assert!(!encoded.contains("cursor"));
    assert!(!encoded.contains("lease-secret"));
}

#[test]
fn claude_fixture_snapshots_deserialize_through_the_exact_rust_envelope() {
    #[derive(Deserialize)]
    struct FixturePack {
        schema_version: String,
        synthetic_non_business_data: bool,
        scenarios: Vec<FixtureScenario>,
    }

    #[derive(Deserialize)]
    struct FixtureScenario {
        name: String,
        snapshot: RedactedConsumerSnapshot,
    }

    let fixture: FixturePack =
        serde_json::from_str(include_str!("../fixtures/redacted-snapshots.json")).unwrap();
    assert_eq!(
        fixture.schema_version,
        "portal.execution.shared-consumer-fixtures.v1"
    );
    assert!(fixture.synthetic_non_business_data);
    assert_eq!(fixture.scenarios.len(), 5);
    let names = fixture
        .scenarios
        .iter()
        .map(|scenario| scenario.name.as_str())
        .collect::<BTreeSet<_>>();
    assert_eq!(
        names,
        BTreeSet::from([
            "awaiting_atomic_commit",
            "circuit_open",
            "demand_idle",
            "rebuild_required",
            "source_dark",
        ])
    );
    assert!(fixture.scenarios.iter().all(|scenario| {
        scenario.snapshot.schema_version == SHARED_CONSUMER_SCHEMA_VERSION
            && serde_json::to_string(&scenario.snapshot)
                .is_ok_and(|value| !value.contains("cursor-") && !value.contains("secret"))
    }));
}
