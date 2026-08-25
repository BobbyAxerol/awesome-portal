use execution_contracts::CanonicalId;
use paper_source_contract::{parse_response, SourceFailure};
use serde_json::{json, Value};

use super::*;

fn at(seconds: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(seconds, 0).unwrap()
}

fn config(status: ProjectionEpochStatus) -> D4IngestionConfig {
    D4IngestionConfig {
        scope: ProjectionScope::new(CanonicalId::parse("workspace-d4").unwrap(), "paper").unwrap(),
        epoch_id: Uuid::parse_str("0198dd00-0000-7000-8000-000000000004").unwrap(),
        epoch_status: status,
        page_size: 250,
        poll_interval_ms: 1_000,
        capability_snapshot_id: "cap_d4_contract_accepted".to_owned(),
    }
}

fn order() -> Value {
    json!({
        "client_order_id": "order-1",
        "venue_order_id": null,
        "strategy_id": "strategy-1",
        "account_id": "account-1",
        "mode": "paper",
        "venue": "BINANCE",
        "instrument_id": "BTCUSDT-PERP",
        "symbol": "BTCUSDT",
        "side": "BUY",
        "position_side": "BOTH",
        "order_type": "LIMIT",
        "time_in_force": "GTC",
        "quantity": "1.2500",
        "price": "50000.00",
        "trigger_price": null,
        "status": "NEW",
        "reduce_only": false,
        "post_only": true,
        "intent": "ENTRY",
        "submitted_at": "2026-08-25T00:00:00Z",
        "updated_at": "2026-08-25T00:00:01Z",
        "error_code": null
    })
}

fn fill() -> Value {
    json!({
        "fill_id": 7,
        "event_id": null,
        "trade_time": "2026-08-25T00:00:02Z",
        "trade_id": "trade-7",
        "client_order_id": "order-1",
        "venue_order_id": null,
        "strategy_id": "strategy-1",
        "account_id": "account-1",
        "mode": "paper",
        "venue": "BINANCE",
        "instrument_id": "BTCUSDT-PERP",
        "side": "BUY",
        "price": "50000.00",
        "quantity": "1.2500",
        "commission": "0.0010",
        "commission_currency": "USDT",
        "liquidity_side": "MAKER",
        "realized_pnl": "0.0000"
    })
}

fn position() -> Value {
    json!({
        "position_id": "position-1",
        "strategy_id": "strategy-1",
        "account_id": "account-1",
        "mode": "paper",
        "venue": "BINANCE",
        "instrument_id": "BTCUSDT-PERP",
        "side": "LONG",
        "signed_qty": "1.2500",
        "quantity": "1.2500",
        "avg_px_open": "50000.00",
        "avg_px_close": "0.00",
        "realized_pnl": "0.0000",
        "unrealized_pnl": "12.5000",
        "mark_price": "50010.00",
        "mark_price_at": "2026-08-25T00:00:03Z",
        "notional": "62512.5000",
        "peak_qty": "1.2500",
        "opened_at": "2026-08-25T00:00:00Z",
        "closed_at": null,
        "updated_at": "2026-08-25T00:00:03Z"
    })
}

fn snapshot_descriptor(counts: [usize; 3]) -> Value {
    json!({
        "contract_revision": "d4.paper-read.v1",
        "status": "SNAPSHOT_CREATED",
        "scope_id": "PAPER_BINANCE_USDM",
        "snapshot": "raw-sensitive-snapshot-token",
        "created_at": "2026-08-25T00:00:00Z",
        "expires_at": "2026-08-25T00:05:00Z",
        "resource_counts": {
            "orders": counts[0],
            "fills": counts[1],
            "positions": counts[2]
        },
        "event_cursor": "raw-sensitive-event-cursor",
        "completeness": "COMPLETE_WITHIN_FIXED_SCOPE",
        "resync": "FULL_BUILDING_EPOCH_ON_SNAPSHOT_OR_CURSOR_EXPIRY"
    })
}

fn snapshot_page(resource: SnapshotResource, rows: Vec<Value>) -> Value {
    let field = match resource {
        SnapshotResource::Orders => "orders",
        SnapshotResource::Fills => "fills",
        SnapshotResource::Positions => "positions",
    };
    let mut page = json!({
        "contract_revision": "d4.paper-read.v1",
        "status": "OK",
        "scope_id": "PAPER_BINANCE_USDM",
        "count": rows.len(),
        "snapshot": "raw-sensitive-snapshot-token",
        "next_cursor": null,
        "complete": true,
        "completeness": "COMPLETE_WITHIN_FIXED_SCOPE"
    });
    page.as_object_mut()
        .unwrap()
        .insert(field.to_owned(), Value::Array(rows));
    page
}

fn event_page() -> Value {
    json!({
        "contract_revision": "d4.paper-read.v1",
        "status": "OK",
        "scope_id": "PAPER_BINANCE_USDM",
        "events": [
            {
                "event_id": "event-10",
                "sequence": 10,
                "scope_id": "PAPER_BINANCE_USDM",
                "resource": "orders",
                "operation": "UPSERT",
                "entity_id": "order-1",
                "entity_version": "a".repeat(64),
                "observed_at": "2026-08-25T00:00:04Z",
                "record": order()
            },
            {
                "event_id": "event-11",
                "sequence": 11,
                "scope_id": "PAPER_BINANCE_USDM",
                "resource": "positions",
                "operation": "DELETE",
                "entity_id": "position-1",
                "entity_version": "b".repeat(64),
                "observed_at": "2026-08-25T00:00:05Z",
                "record": null
            }
        ],
        "count": 2,
        "next_cursor": "raw-sensitive-event-cursor-next",
        "complete": true,
        "head_sequence": 11,
        "delivery": "IDEMPOTENT_STATE_DELTAS",
        "resync": "FULL_BUILDING_EPOCH_ON_CURSOR_EPOCH_OR_RETENTION_EXPIRY"
    })
}

fn success(request: &PaperReadRequest, value: &Value) -> ReadOutcome {
    parse_response(request, 200, None, &serde_json::to_vec(value).unwrap()).unwrap()
}

fn accept_next(
    coordinator: &mut PaperIngestionCoordinator,
    value: &Value,
    timestamp: i64,
) -> IngestionEffect {
    let request = coordinator.next_request().unwrap();
    coordinator
        .accept(success(&request, value), at(timestamp))
        .unwrap()
}

fn reach_baseline_commit(coordinator: &mut PaperIngestionCoordinator) {
    assert!(matches!(
        accept_next(coordinator, &snapshot_descriptor([1, 1, 1]), 1),
        IngestionEffect::SnapshotLeaseReady { snapshot_digest }
            if snapshot_digest.starts_with("sha256:")
    ));
    assert!(coordinator.next_request().is_none());
    let lease = coordinator.pending_snapshot_lease().unwrap();
    let safe_debug = format!("{lease:?}");
    assert!(!safe_debug.contains("raw-sensitive-snapshot-token"));
    assert!(!safe_debug.contains("raw-sensitive-event-cursor"));
    assert_eq!(
        coordinator.acknowledge_snapshot_lease().unwrap(),
        IngestionEffect::SnapshotLeaseDurable
    );
    accept_next(
        coordinator,
        &snapshot_page(SnapshotResource::Orders, vec![order()]),
        2,
    );
    accept_next(
        coordinator,
        &snapshot_page(SnapshotResource::Fills, vec![fill()]),
        3,
    );
    let effect = accept_next(
        coordinator,
        &snapshot_page(SnapshotResource::Positions, vec![position()]),
        4,
    );
    assert!(matches!(
        effect,
        IngestionEffect::BaselineReady {
            observation_count: 3,
            ..
        }
    ));
}

#[test]
fn coordinator_refuses_non_building_or_non_paper_authority() {
    assert!(matches!(
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Active)),
        Err(IngestorError::BuildingEpochRequired)
    ));
    let mut wrong_scope = config(ProjectionEpochStatus::Building);
    wrong_scope.scope =
        ProjectionScope::new(CanonicalId::parse("workspace-d4").unwrap(), "sandbox").unwrap();
    assert!(matches!(
        PaperIngestionCoordinator::new(wrong_scope),
        Err(IngestorError::PaperScopeRequired)
    ));
}

#[test]
fn full_baseline_requires_exact_counts_and_durable_ack_before_events() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    reach_baseline_commit(&mut coordinator);

    assert!(coordinator.next_request().is_none());
    let pending = coordinator.pending_baseline().unwrap();
    assert_eq!(
        pending.expected_epoch_status,
        ProjectionEpochStatus::Building
    );
    assert_eq!(pending.observations.len(), 3);
    assert!(pending.snapshot_digest.starts_with("sha256:"));
    let safe_debug = format!("{pending:?}");
    assert!(!safe_debug.contains("raw-sensitive-snapshot-token"));
    assert!(!safe_debug.contains("raw-sensitive-event-cursor"));

    assert_eq!(
        coordinator.acknowledge_baseline_commit().unwrap(),
        IngestionEffect::BaselineDurable
    );
    let request = coordinator.next_request().unwrap().blueprint().unwrap();
    assert_eq!(request.path, "/v1/events");
    assert_eq!(request.query[0].0, "cursor");
    assert_eq!(request.query[0].1, "raw-sensitive-event-cursor");
}

#[test]
fn event_cursor_advances_only_after_durable_page_ack() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    reach_baseline_commit(&mut coordinator);
    coordinator.acknowledge_baseline_commit().unwrap();

    let previous_request = coordinator.next_request().unwrap();
    let effect = coordinator
        .accept(success(&previous_request, &event_page()), at(5))
        .unwrap();
    assert_eq!(
        effect,
        IngestionEffect::EventPageReady {
            observation_count: 2,
            caught_up: true
        }
    );
    assert!(coordinator.next_request().is_none());
    let pending = coordinator.pending_event_page().unwrap();
    assert_eq!(
        pending.expected_epoch_status,
        ProjectionEpochStatus::Building
    );
    assert_eq!(
        pending.observations[0].observation.source_sequence,
        Some(10)
    );
    assert_eq!(
        pending.observations[1].observation.source_sequence,
        Some(11)
    );
    assert_eq!(pending.observations[1].observation.payload["deleted"], true);

    coordinator.acknowledge_event_commit().unwrap();
    let next = coordinator.next_request().unwrap().blueprint().unwrap();
    assert_eq!(next.query[0].1, "raw-sensitive-event-cursor-next");
}

#[test]
fn retryable_failure_keeps_the_exact_current_request() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    let before = coordinator.next_request().unwrap().blueprint().unwrap();
    let effect = coordinator
        .accept(
            ReadOutcome::Failure(SourceFailure {
                kind: SourceFailureKind::RateLimited,
                http_status: 429,
                retry_after_seconds: Some(2),
            }),
            at(1),
        )
        .unwrap();
    assert_eq!(
        effect,
        IngestionEffect::RetryCurrentRequest {
            kind: SourceFailureKind::RateLimited,
            retry_after_seconds: Some(2)
        }
    );
    assert_eq!(
        coordinator.next_request().unwrap().blueprint().unwrap(),
        before
    );
}

#[test]
fn cursor_expiry_is_terminal_and_requires_a_fresh_building_epoch() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    let effect = coordinator
        .accept(
            ReadOutcome::Failure(SourceFailure {
                kind: SourceFailureKind::ResyncRequired,
                http_status: 410,
                retry_after_seconds: None,
            }),
            at(1),
        )
        .unwrap();
    assert_eq!(effect, IngestionEffect::FreshBuildingEpochRequired);
    assert!(coordinator.rebuild_required());
    assert!(coordinator.next_request().is_none());
}

#[test]
fn descriptor_count_mismatch_fails_before_any_baseline_commit() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    accept_next(&mut coordinator, &snapshot_descriptor([2, 0, 0]), 1);
    coordinator.acknowledge_snapshot_lease().unwrap();
    let request = coordinator.next_request().unwrap();
    let error = coordinator
        .accept(
            success(
                &request,
                &snapshot_page(SnapshotResource::Orders, vec![order()]),
            ),
            at(2),
        )
        .unwrap_err();
    assert!(matches!(error, IngestorError::SnapshotCountMismatch));
    assert!(coordinator.pending_baseline().is_none());
    assert!(coordinator.rebuild_required());
}

#[test]
fn wrong_resource_response_cannot_move_the_snapshot_state() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    accept_next(&mut coordinator, &snapshot_descriptor([1, 1, 1]), 1);
    coordinator.acknowledge_snapshot_lease().unwrap();
    let expected = coordinator.next_request().unwrap();
    let wrong = PaperReadRequest::SnapshotPage {
        resource: SnapshotResource::Fills,
        snapshot: OpaqueToken::parse("raw-sensitive-snapshot-token").unwrap(),
        cursor: None,
        page_size: 250,
    };
    assert!(matches!(
        coordinator.accept(
            success(
                &wrong,
                &snapshot_page(SnapshotResource::Fills, vec![fill()]),
            ),
            at(2)
        ),
        Err(IngestorError::ResponseStateMismatch)
    ));
    assert_eq!(
        coordinator.next_request().unwrap().blueprint().unwrap(),
        expected.blueprint().unwrap()
    );
}

#[test]
fn snapshot_mapping_preserves_exact_decimal_scale() {
    let mut coordinator =
        PaperIngestionCoordinator::new(config(ProjectionEpochStatus::Building)).unwrap();
    reach_baseline_commit(&mut coordinator);
    let pending = coordinator.pending_baseline().unwrap();
    let order = &pending.observations[0].observation;
    let fill = &pending.observations[1].observation;
    let position = &pending.observations[2].observation;
    assert_eq!(order.payload["quantity"], "1.2500");
    assert_eq!(fill.payload["commission"], "0.0010");
    assert_eq!(position.payload["notional"], "62512.5000");
    assert_eq!(order.source_completeness, SourceCompleteness::PollBounded);
    assert_eq!(order.poll_interval_ms, Some(1_000));
}

#[test]
fn leased_snapshot_resume_restarts_bounded_paging_without_exposing_tokens() {
    let config = config(ProjectionEpochStatus::Building);
    let checkpoint = D4ResumeCheckpoint {
        epoch_id: config.epoch_id,
        phase: D4ResumeCheckpointPhase::SnapshotLeased,
        snapshot: Some(OpaqueToken::parse("raw-sensitive-snapshot-token").unwrap()),
        event_cursor: OpaqueToken::parse("raw-sensitive-event-cursor").unwrap(),
        snapshot_digest: opaque_digest(
            &OpaqueToken::parse("raw-sensitive-snapshot-token").unwrap(),
        ),
        snapshot_created_at: at(1),
        snapshot_expires_at: at(301),
        expected_counts: SnapshotResourceCounts {
            orders: 1,
            fills: 1,
            positions: 1,
        },
    };
    let coordinator = PaperIngestionCoordinator::resume(config, checkpoint, at(2)).unwrap();
    let request = coordinator.next_request().unwrap();
    let blueprint = request.blueprint().unwrap();
    assert_eq!(blueprint.path, "/v1/orders");
    assert!(blueprint
        .query
        .iter()
        .any(|(key, value)| *key == "snapshot" && value == "raw-sensitive-snapshot-token"));
    assert!(!format!("{coordinator:?}").contains("raw-sensitive-snapshot-token"));
}

#[test]
fn streaming_resume_uses_exact_durable_cursor_and_rejects_snapshot_drift() {
    let config = config(ProjectionEpochStatus::Building);
    let checkpoint = D4ResumeCheckpoint {
        epoch_id: config.epoch_id,
        phase: D4ResumeCheckpointPhase::Streaming,
        snapshot: None,
        event_cursor: OpaqueToken::parse("raw-sensitive-event-cursor-next").unwrap(),
        snapshot_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            .to_owned(),
        snapshot_created_at: at(1),
        snapshot_expires_at: at(301),
        expected_counts: SnapshotResourceCounts {
            orders: 1,
            fills: 1,
            positions: 1,
        },
    };
    let coordinator =
        PaperIngestionCoordinator::resume(config.clone(), checkpoint.clone(), at(500)).unwrap();
    let blueprint = coordinator.next_request().unwrap().blueprint().unwrap();
    assert_eq!(blueprint.path, "/v1/events");
    assert_eq!(blueprint.query[0].1, "raw-sensitive-event-cursor-next");

    let mut invalid = checkpoint;
    invalid.snapshot = Some(OpaqueToken::parse("must-not-survive-baseline").unwrap());
    assert!(matches!(
        PaperIngestionCoordinator::resume(config, invalid, at(2)),
        Err(IngestorError::UnexpectedResumeSnapshot)
    ));
}

#[test]
fn expired_snapshot_resume_fails_before_a_source_request() {
    let config = config(ProjectionEpochStatus::Building);
    let snapshot = OpaqueToken::parse("raw-sensitive-snapshot-token").unwrap();
    let checkpoint = D4ResumeCheckpoint {
        epoch_id: config.epoch_id,
        phase: D4ResumeCheckpointPhase::SnapshotLeased,
        snapshot: Some(snapshot.clone()),
        event_cursor: OpaqueToken::parse("raw-sensitive-event-cursor").unwrap(),
        snapshot_digest: opaque_digest(&snapshot),
        snapshot_created_at: at(1),
        snapshot_expires_at: at(301),
        expected_counts: SnapshotResourceCounts {
            orders: 0,
            fills: 0,
            positions: 0,
        },
    };
    assert!(matches!(
        PaperIngestionCoordinator::resume(config, checkpoint, at(301)),
        Err(IngestorError::ExpiredOrInvalidResumeSnapshot)
    ));
}
