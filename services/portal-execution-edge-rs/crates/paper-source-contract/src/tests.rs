use serde_json::{json, Value};

use super::*;

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

fn page(resource: SnapshotResource, rows: &[Value], complete: bool) -> Value {
    let field = match resource {
        SnapshotResource::Orders => "orders",
        SnapshotResource::Fills => "fills",
        SnapshotResource::Positions => "positions",
    };
    let mut value = json!({
        "contract_revision": CONTRACT_REVISION,
        "status": "OK",
        "scope_id": SCOPE_ID,
        "count": rows.len(),
        "snapshot": "snapshot-token",
        "next_cursor": if complete { Value::Null } else { json!("page-cursor") },
        "complete": complete,
        "completeness": if complete { "COMPLETE_WITHIN_FIXED_SCOPE" } else { "PAGE_CONTINUES" }
    });
    value
        .as_object_mut()
        .unwrap()
        .insert(field.to_owned(), json!(rows));
    value
}

fn snapshot_request(resource: SnapshotResource) -> PaperReadRequest {
    PaperReadRequest::SnapshotPage {
        resource,
        snapshot: OpaqueToken::parse("snapshot-token").unwrap(),
        cursor: None,
        page_size: 250,
    }
}

fn parse_success(request: &PaperReadRequest, value: &Value) -> PaperReadPayload {
    let ReadOutcome::Success(payload) =
        parse_response(request, 200, None, &serde_json::to_vec(value).unwrap()).unwrap()
    else {
        panic!("expected success");
    };
    payload
}

#[test]
fn build_locked_contract_identity_is_exact() {
    assert_eq!(CONTRACT_REVISION, "d4.paper-read.v1");
    assert_eq!(SCOPE_ID, "PAPER_BINANCE_USDM");
    assert_eq!(
        SOURCE_RUNTIME_ACCEPTANCE_COMMIT,
        "99e912f4de9d23b51a3c2b9bc68eacd0841e9dfc"
    );
    assert_eq!(
        SOURCE_HEAD_OBSERVED_AT_IMPORT,
        "4ad8f87825733f7f4c0be1f3ac785f7702478d38"
    );
}

#[test]
fn request_builder_emits_only_exact_get_route_queries() {
    assert_eq!(
        PaperReadRequest::BeginSnapshot.blueprint().unwrap(),
        RequestBlueprint {
            path: "/v1/events",
            query: vec![("snapshot", "begin".to_owned())]
        }
    );
    let request = PaperReadRequest::SnapshotPage {
        resource: SnapshotResource::Orders,
        snapshot: OpaqueToken::parse("snapshot-token").unwrap(),
        cursor: Some(OpaqueToken::parse("cursor-token").unwrap()),
        page_size: 250,
    };
    assert_eq!(
        request.blueprint().unwrap(),
        RequestBlueprint {
            path: "/v1/orders",
            query: vec![
                ("snapshot", "snapshot-token".to_owned()),
                ("page_size", "250".to_owned()),
                ("cursor", "cursor-token".to_owned())
            ]
        }
    );
    assert!(matches!(
        PaperReadRequest::EventsPage {
            cursor: OpaqueToken::parse("cursor").unwrap(),
            page_size: 0
        }
        .blueprint(),
        Err(ContractError::InvalidPageSize)
    ));
}

#[test]
fn snapshot_descriptor_requires_fixed_scope_bounds_and_resync() {
    let descriptor = json!({
        "contract_revision": CONTRACT_REVISION,
        "status": "SNAPSHOT_CREATED",
        "scope_id": SCOPE_ID,
        "snapshot": "snapshot-token",
        "created_at": "2026-08-25T00:00:00Z",
        "expires_at": "2026-08-25T00:05:00Z",
        "resource_counts": {"orders": 1, "fills": 1, "positions": 1},
        "event_cursor": "event-cursor",
        "completeness": "COMPLETE_WITHIN_FIXED_SCOPE",
        "resync": "FULL_BUILDING_EPOCH_ON_SNAPSHOT_OR_CURSOR_EXPIRY"
    });
    let PaperReadPayload::SnapshotCreated(parsed) =
        parse_success(&PaperReadRequest::BeginSnapshot, &descriptor)
    else {
        panic!("expected descriptor");
    };
    assert_eq!(parsed.resource_counts.orders, 1);
    assert_eq!(parsed.event_cursor.as_str(), "event-cursor");

    let mut drifted = descriptor;
    drifted["scope_id"] = json!("PAPER_ALL");
    assert!(matches!(
        parse_response(
            &PaperReadRequest::BeginSnapshot,
            200,
            None,
            &serde_json::to_vec(&drifted).unwrap()
        ),
        Err(ContractError::InvalidJsonSchema)
    ));
}

#[test]
fn three_snapshot_resources_parse_exact_decimals_and_completion() {
    let cases = [
        (SnapshotResource::Orders, vec![order()]),
        (SnapshotResource::Fills, vec![fill()]),
        (SnapshotResource::Positions, vec![position()]),
    ];
    for (resource, rows) in cases {
        let payload = parse_success(&snapshot_request(resource), &page(resource, &rows, true));
        match payload {
            PaperReadPayload::Orders(page) => {
                assert_eq!(page.rows[0].quantity.to_string(), "1.2500");
                assert!(page.complete);
            }
            PaperReadPayload::Fills(page) => {
                assert_eq!(page.rows[0].commission.to_string(), "0.0010");
                assert!(page.complete);
            }
            PaperReadPayload::Positions(page) => {
                assert_eq!(page.rows[0].notional.to_string(), "62512.5000");
                assert!(page.complete);
            }
            _ => panic!("unexpected payload"),
        }
    }
}

#[test]
fn source_scientific_decimals_normalize_without_float_conversion() {
    let mut scientific_fill = fill();
    scientific_fill["realized_pnl"] = json!("-1.25E-7");
    let PaperReadPayload::Fills(parsed_page) = parse_success(
        &snapshot_request(SnapshotResource::Fills),
        &page(SnapshotResource::Fills, &[scientific_fill], true),
    ) else {
        panic!("expected fills page");
    };
    assert_eq!(parsed_page.rows[0].realized_pnl.to_string(), "-0.000000125");

    for invalid in ["NaN", "Infinity", "1e999", " 1e-7"] {
        let mut invalid_fill = fill();
        invalid_fill["realized_pnl"] = json!(invalid);
        assert!(matches!(
            parse_response(
                &snapshot_request(SnapshotResource::Fills),
                200,
                None,
                &serde_json::to_vec(&page(SnapshotResource::Fills, &[invalid_fill], true,))
                    .unwrap()
            ),
            Err(ContractError::InvalidJsonSchema)
        ));
    }
}

#[test]
fn page_count_cursor_snapshot_and_unknown_fields_fail_closed() {
    let request = snapshot_request(SnapshotResource::Orders);
    let mut wrong_count = page(SnapshotResource::Orders, &[order()], true);
    wrong_count["count"] = json!(2);
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&wrong_count).unwrap()
        ),
        Err(ContractError::InvalidSnapshotPage)
    ));

    let mut wrong_snapshot = page(SnapshotResource::Orders, &[order()], true);
    wrong_snapshot["snapshot"] = json!("different-snapshot");
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&wrong_snapshot).unwrap()
        ),
        Err(ContractError::SnapshotIdentityMismatch)
    ));

    let mut widened = page(SnapshotResource::Orders, &[order()], true);
    widened["orders"][0]["raw_payload"] = json!({"forbidden": true});
    assert!(matches!(
        parse_response(&request, 200, None, &serde_json::to_vec(&widened).unwrap()),
        Err(ContractError::InvalidJsonSchema)
    ));
}

#[test]
fn event_page_enforces_order_idempotency_resource_and_tombstones() {
    let request = PaperReadRequest::EventsPage {
        cursor: OpaqueToken::parse("event-cursor").unwrap(),
        page_size: 250,
    };
    let event_page = json!({
        "contract_revision": CONTRACT_REVISION,
        "status": "OK",
        "scope_id": SCOPE_ID,
        "events": [
            {
                "event_id": "event-1",
                "sequence": 10,
                "scope_id": SCOPE_ID,
                "resource": "orders",
                "operation": "UPSERT",
                "entity_id": "order-1",
                "entity_version": "a".repeat(64),
                "observed_at": "2026-08-25T00:00:04Z",
                "record": order()
            },
            {
                "event_id": "event-2",
                "sequence": 11,
                "scope_id": SCOPE_ID,
                "resource": "positions",
                "operation": "DELETE",
                "entity_id": "position-1",
                "entity_version": "b".repeat(64),
                "observed_at": "2026-08-25T00:00:05Z",
                "record": null
            }
        ],
        "count": 2,
        "next_cursor": "event-cursor-next",
        "complete": true,
        "head_sequence": 11,
        "delivery": "IDEMPOTENT_STATE_DELTAS",
        "resync": "FULL_BUILDING_EPOCH_ON_CURSOR_EPOCH_OR_RETENTION_EXPIRY"
    });
    let PaperReadPayload::Events(parsed) = parse_success(&request, &event_page) else {
        panic!("expected events");
    };
    assert!(matches!(
        parsed.events[0].record,
        StateDeltaRecord::Order(_)
    ));
    assert_eq!(parsed.events[1].record, StateDeltaRecord::Tombstone);

    let mut duplicate = event_page;
    duplicate["events"][1]["sequence"] = json!(10);
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&duplicate).unwrap()
        ),
        Err(ContractError::InvalidEventSequence)
    ));
}

#[test]
fn failure_statuses_are_typed_without_preserving_source_reason() {
    let request = PaperReadRequest::BeginSnapshot;
    let denied = br#"{"status":"DENIED","reason":"CURSOR_EXPIRED"}"#;
    let ReadOutcome::Failure(failure) = parse_response(&request, 410, None, denied).unwrap() else {
        panic!("expected failure");
    };
    assert_eq!(failure.kind, SourceFailureKind::ResyncRequired);
    assert_eq!(failure.retry_after_seconds, None);

    let unavailable = br#"{"status":"ERROR","reason":"SOURCE_READ_UNAVAILABLE"}"#;
    assert!(matches!(
        parse_response(&request, 503, None, unavailable),
        Err(ContractError::MissingRetryAfter)
    ));
    let ReadOutcome::Failure(failure) =
        parse_response(&request, 503, Some(2), unavailable).unwrap()
    else {
        panic!("expected unavailable");
    };
    assert_eq!(failure.kind, SourceFailureKind::SourceUnavailable);
}

#[test]
fn every_published_failure_status_has_one_fail_closed_classification() {
    let request = PaperReadRequest::BeginSnapshot;
    let denied = br#"{"status":"DENIED","reason":"SAFE_REASON"}"#;
    for (status, expected) in [
        (400, SourceFailureKind::InvalidRequest),
        (401, SourceFailureKind::IdentityRejected),
        (409, SourceFailureKind::CursorAhead),
        (410, SourceFailureKind::ResyncRequired),
        (413, SourceFailureKind::ResponseTooLarge),
        (429, SourceFailureKind::RateLimited),
    ] {
        let ReadOutcome::Failure(failure) =
            parse_response(&request, status, Some(1), denied).unwrap()
        else {
            panic!("expected typed failure");
        };
        assert_eq!(failure.kind, expected);
    }
    assert!(matches!(
        parse_response(&request, 500, None, denied),
        Err(ContractError::UnexpectedHttpStatus(500))
    ));
}

#[test]
fn source_scope_and_page_completion_drift_fail_closed() {
    let request = snapshot_request(SnapshotResource::Orders);
    let mut scope_drift = page(SnapshotResource::Orders, &[order()], true);
    scope_drift["orders"][0]["mode"] = json!("live");
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&scope_drift).unwrap()
        ),
        Err(ContractError::InvalidJsonSchema)
    ));

    let mut cursor_drift = page(SnapshotResource::Orders, &[order()], true);
    cursor_drift["next_cursor"] = json!("unexpected-cursor");
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&cursor_drift).unwrap()
        ),
        Err(ContractError::InvalidSnapshotPage)
    ));
}

#[test]
fn state_delta_resource_operation_and_entity_must_match_record() {
    let request = PaperReadRequest::EventsPage {
        cursor: OpaqueToken::parse("event-cursor").unwrap(),
        page_size: 1,
    };
    let incompatible = json!({
        "contract_revision": CONTRACT_REVISION,
        "status": "OK",
        "scope_id": SCOPE_ID,
        "events": [{
            "event_id": "event-incompatible",
            "sequence": 1,
            "scope_id": SCOPE_ID,
            "resource": "fills",
            "operation": "UPSERT",
            "entity_id": "7",
            "entity_version": "c".repeat(64),
            "observed_at": "2026-08-25T00:00:04Z",
            "record": order()
        }],
        "count": 1,
        "next_cursor": "event-cursor-next",
        "complete": true,
        "head_sequence": 1,
        "delivery": "IDEMPOTENT_STATE_DELTAS",
        "resync": "FULL_BUILDING_EPOCH_ON_CURSOR_EPOCH_OR_RETENTION_EXPIRY"
    });
    assert!(matches!(
        parse_response(
            &request,
            200,
            None,
            &serde_json::to_vec(&incompatible).unwrap()
        ),
        Err(ContractError::InvalidStateDelta)
    ));
}

#[test]
fn opaque_tokens_are_redacted_and_bounded() {
    let token = OpaqueToken::parse("sensitive-cursor").unwrap();
    assert_eq!(format!("{token:?}"), "OpaqueToken([REDACTED])");
    assert!(matches!(
        OpaqueToken::parse(""),
        Err(ContractError::InvalidOpaqueToken)
    ));
    assert!(matches!(
        OpaqueToken::parse("x".repeat(MAXIMUM_TOKEN_BYTES + 1)),
        Err(ContractError::InvalidOpaqueToken)
    ));
}
