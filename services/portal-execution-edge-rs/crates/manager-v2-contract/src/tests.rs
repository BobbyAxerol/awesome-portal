use serde_json::{json, Value};

use super::*;

const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn envelope(data: impl Into<Value>) -> Value {
    let data = data.into();
    json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": PROFILE_ID,
        "catalogue_sha256": DIGEST,
        "availability": "AVAILABLE",
        "freshness": "FRESH",
        "completeness": "COMPLETE",
        "trace_id": "manager-v2-contract-test",
        "as_of": "2026-08-28T00:00:00Z",
        "data": data,
    })
}

fn relation(schema: &str, relation: &str) -> Value {
    json!({
        "id": {"schema": schema, "relation": relation},
        "kind": "TABLE",
        "safe_columns": [
            {"name": "id", "ordinal": 1, "data_type": "bigint", "nullable": false},
            {"name": "amount", "ordinal": 2, "data_type": "numeric", "nullable": true}
        ],
        "secret_cell_excluded_column_count": 1,
        "key": {"status": "PRIMARY_KEY", "name": null, "columns": ["id"]},
        "profile_classification": "FIXED_PROFILE_CONTEXT",
        "profile_columns": [],
        "query_status": "QUALIFIED_TS_OC_03D1"
    })
}

fn catalogue_response() -> Value {
    envelope(json!({
        "catalogue_revision": DIGEST,
        "relation_count": 2,
        "relations": [relation("public", "orders"), relation("public", "fills")]
    }))
}

fn record(schema: &str, relation: &str, key: &str) -> Value {
    json!({
        "relation": {"schema": schema, "relation": relation},
        "record_key": key,
        "fields": {
            "id": {"kind": "INTEGER", "value": 1},
            "amount": {"kind": "DECIMAL", "value": "12.5000"}
        }
    })
}

fn catalogue() -> ManagerCatalogue {
    let body = serde_json::to_vec(&catalogue_response()).unwrap();
    let ManagerPayload::Catalogue(response) =
        decode_success(&ManagerV2Request::catalogue(), &body).unwrap()
    else {
        panic!("expected catalogue");
    };
    response.into_data()
}

#[test]
fn build_lock_exposes_only_the_runtime_paper_identity_and_bounds() {
    assert_eq!(
        RUNTIME_CONTRACT_REVISION,
        "trading-system.portal-execution.manager-v2.runtime.v1"
    );
    assert_eq!(
        SOURCE_DARK_CONTRACT_REVISION,
        "trading-system.portal-execution.manager-v2.v1"
    );
    assert_eq!(PROFILE_ID, "PAPER_BINANCE_USDM");
    assert_eq!(MAXIMUM_PAGE_ROWS, 200);
    assert_eq!(MAXIMUM_RESPONSE_BYTES, 1_048_576);
    assert!(PageLimit::new(0).is_err());
    assert!(PageLimit::new(201).is_err());
    assert_eq!(PageLimit::default().get(), DEFAULT_PAGE_LIMIT);
}

#[test]
fn deployment_bound_profiles_are_exact_and_keep_the_paper_helper_compatible() {
    let mut sandbox = catalogue_response();
    sandbox["profile_id"] = json!("SANDBOX_BINANCE_USDM");
    let body = serde_json::to_vec(&sandbox).unwrap();

    let ManagerPayload::Catalogue(response) = decode_success_for_profile(
        &ManagerV2Request::catalogue(),
        &body,
        "SANDBOX_BINANCE_USDM",
    )
    .unwrap() else {
        panic!("expected sandbox catalogue");
    };
    assert_eq!(response.meta().profile_id(), "SANDBOX_BINANCE_USDM");
    assert!(matches!(
        decode_success(&ManagerV2Request::catalogue(), &body),
        Err(ContractError::EnvelopeIdentityMismatch)
    ));
    assert!(matches!(
        decode_success_for_profile(&ManagerV2Request::catalogue(), &body, "LIVE_BINANCE_USDM"),
        Err(ContractError::EnvelopeIdentityMismatch)
    ));

    let unavailable = json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": "LIVE_BINANCE_USDM",
        "catalogue_sha256": DIGEST,
        "availability": "UNAVAILABLE",
        "reason_code": "SOURCE_UNAVAILABLE",
        "trace_id": "manager-v2-live-unavailable"
    });
    let parsed = decode_unavailable_for_profile(
        &serde_json::to_vec(&unavailable).unwrap(),
        "LIVE_BINANCE_USDM",
    )
    .unwrap();
    assert_eq!(parsed.profile_id(), "LIVE_BINANCE_USDM");
}

#[test]
fn catalogue_derived_requests_emit_only_the_five_exact_get_blueprints() {
    let catalogue = catalogue();
    let orders = catalogue.relation("public", "orders").unwrap();
    let page =
        ManagerV2Request::relation_records(orders, None, PageLimit::new(2).unwrap()).unwrap();
    assert_eq!(
        page.blueprint(),
        RequestBlueprint::new(
            "/portal/execution/v2/manager/records/public/orders",
            vec![("limit", "2".to_owned())]
        )
    );

    let page_body = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [record("public", "orders", "record-key")],
        "next_cursor": "page-cursor"
    }));
    let ManagerPayload::RelationRecords(page_result) =
        decode_success(&page, &serde_json::to_vec(&page_body).unwrap()).unwrap()
    else {
        panic!("expected relation page");
    };
    let page_result = page_result.into_data();
    let next = page_result.next_cursor().unwrap();
    let resumed =
        ManagerV2Request::relation_records(orders, Some(next), PageLimit::new(2).unwrap()).unwrap();
    assert_eq!(
        resumed.blueprint().path(),
        "/portal/execution/v2/manager/records/public/orders"
    );
    assert_eq!(
        resumed.blueprint().query(),
        &[
            ("limit", "2".to_owned()),
            ("cursor", "page-cursor".to_owned())
        ]
    );

    let record_request = ManagerV2Request::record(&page_result.items()[0], orders).unwrap();
    assert_eq!(
        record_request.blueprint().path(),
        "/portal/execution/v2/manager/records/public/orders/record-key"
    );
    assert!(matches!(
        ManagerV2Request::relation_records(
            catalogue.relation("public", "fills").unwrap(),
            Some(next),
            PageLimit::default(),
        ),
        Err(ContractError::CursorBindingDenied)
    ));
    assert!(matches!(
        ManagerV2Request::record(
            &page_result.items()[0],
            catalogue.relation("public", "fills").unwrap(),
        ),
        Err(ContractError::RecordBindingDenied)
    ));

    assert_eq!(
        ManagerV2Request::catalogue().blueprint().path(),
        "/portal/execution/v2/manager/catalog"
    );
    assert_eq!(
        ManagerV2Request::capabilities().blueprint().path(),
        "/portal/execution/v2/manager/capabilities"
    );
    assert_eq!(
        ManagerV2Request::projection(
            &catalogue,
            ProjectionKind::Order,
            None,
            PageLimit::default()
        )
        .unwrap()
        .blueprint()
        .path(),
        "/portal/execution/v2/manager/projections/order"
    );
}

#[test]
fn runtime_catalogue_and_record_fields_fail_closed_on_drift() {
    let mut old_revision = catalogue_response();
    old_revision["contract_version"] = json!(SOURCE_DARK_CONTRACT_REVISION);
    assert!(matches!(
        decode_success(
            &ManagerV2Request::catalogue(),
            &serde_json::to_vec(&old_revision).unwrap()
        ),
        Err(ContractError::EnvelopeIdentityMismatch)
    ));

    let catalogue = catalogue();
    let orders = catalogue.relation("public", "orders").unwrap();
    let request = ManagerV2Request::relation_records(orders, None, PageLimit::default()).unwrap();
    let mut unsafe_page = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [record("public", "orders", "record-key")],
        "next_cursor": null
    }));
    unsafe_page["data"]["items"][0]["fields"]["password"] =
        json!({"kind": "TEXT", "value": "forbidden"});
    assert!(matches!(
        decode_success(&request, &serde_json::to_vec(&unsafe_page).unwrap()),
        Err(ContractError::UnsafeRecordFields)
    ));

    let mut malformed_record = record("public", "orders", "record-key");
    malformed_record["fields"]["amount"] = json!({"kind": "DECIMAL", "value": 12.5});
    let malformed_page = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [malformed_record],
        "next_cursor": null
    }));
    assert!(matches!(
        decode_success(&request, &serde_json::to_vec(&malformed_page).unwrap()),
        Err(ContractError::InvalidManagerValue)
    ));
}

#[test]
fn tagged_values_preserve_exact_decimal_and_reject_invalid_nested_values() {
    let catalogue = catalogue();
    let orders = catalogue.relation("public", "orders").unwrap();
    let request = ManagerV2Request::relation_records(orders, None, PageLimit::default()).unwrap();
    let mut nested = record("public", "orders", "record-key");
    nested["fields"]["amount"] = json!({
        "kind": "OBJECT",
        "value": {
            "settled": {"kind": "DECIMAL", "value": "0.000000125"}
        }
    });
    let body = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [nested],
        "next_cursor": null
    }));
    let ManagerPayload::RelationRecords(parsed) =
        decode_success(&request, &serde_json::to_vec(&body).unwrap()).unwrap()
    else {
        panic!("expected page");
    };
    let ManagerValue::Object(values) = &parsed.data().items()[0].fields()["amount"] else {
        panic!("expected object");
    };
    let ManagerValue::Decimal(value) = &values["settled"] else {
        panic!("expected decimal");
    };
    assert_eq!(value.to_string(), "0.000000125");

    let mut invalid_nested = record("public", "orders", "record-key");
    invalid_nested["fields"]["amount"] = json!({
        "kind": "OBJECT",
        "value": {"note": {"kind": "TEXT", "value": false}}
    });
    let invalid_body = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [invalid_nested],
        "next_cursor": null
    }));
    assert!(matches!(
        decode_success(&request, &serde_json::to_vec(&invalid_body).unwrap()),
        Err(ContractError::InvalidManagerValue)
    ));
}

#[test]
fn unavailable_and_capabilities_are_typed_and_runtime_qualified() {
    let unavailable = json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": PROFILE_ID,
        "catalogue_sha256": DIGEST,
        "availability": "UNAVAILABLE",
        "reason_code": "SOURCE_UNAVAILABLE",
        "trace_id": "manager-v2-unavailable"
    });
    let parsed = decode_unavailable(&serde_json::to_vec(&unavailable).unwrap()).unwrap();
    assert_eq!(parsed.availability(), Availability::Unavailable);
    assert_eq!(parsed.reason_code(), "SOURCE_UNAVAILABLE");

    let capabilities = envelope(json!({
        "contract_revision": RUNTIME_CONTRACT_REVISION,
        "active_profile_id": PROFILE_ID,
        "capabilities": EXPECTED_CAPABILITIES.iter().map(|(operation_id, path_template)| json!({
            "operation_id": operation_id,
            "path_template": path_template,
            "registered": true,
            "portal_reachable": false,
            "source_binding": true,
            "qualification_status": "OWNER_LOOPBACK_QUALIFIED"
        })).collect::<Vec<_>>()
    }));
    let ManagerPayload::Capabilities(parsed) = decode_success(
        &ManagerV2Request::capabilities(),
        &serde_json::to_vec(&capabilities).unwrap(),
    )
    .unwrap() else {
        panic!("expected capabilities");
    };
    assert_eq!(parsed.data().capabilities().len(), 5);

    let mut malformed = unavailable;
    malformed["reason_code"] = json!("runtime disabled");
    assert!(matches!(
        decode_unavailable(&serde_json::to_vec(&malformed).unwrap()),
        Err(ContractError::InvalidUnavailableResult)
    ));
}

#[test]
fn relayed_envelopes_preserve_owner_shape_without_validation_only_state() {
    let catalogue = catalogue();
    let orders = catalogue.relation("public", "orders").unwrap();
    let request =
        ManagerV2Request::relation_records(orders, None, PageLimit::new(2).unwrap()).unwrap();
    let page = envelope(json!({
        "relation": {"schema": "public", "relation": "orders"},
        "items": [record("public", "orders", "record-key")],
        "next_cursor": "page-cursor"
    }));
    let ManagerPayload::RelationRecords(response) =
        decode_success(&request, &serde_json::to_vec(&page).unwrap()).unwrap()
    else {
        panic!("expected relation page");
    };
    let relayed = serde_json::to_value(&response).unwrap();
    assert_eq!(relayed["contract_version"], RUNTIME_CONTRACT_REVISION);
    assert_eq!(relayed["authority"], "EXECUTION_CELL");
    assert_eq!(relayed["profile_id"], PROFILE_ID);
    assert_eq!(relayed["availability"], "AVAILABLE");
    assert_eq!(relayed["freshness"], "FRESH");
    assert_eq!(relayed["data"]["next_cursor"], "page-cursor");
    assert_eq!(
        relayed["data"]["items"][0]["fields"]["amount"],
        json!({"kind": "DECIMAL", "value": "12.5000"})
    );
    assert!(relayed.get("meta").is_none());
    assert!(!relayed.to_string().contains("catalogue_digest"));
    assert!(!relayed.to_string().contains("safe_column_names"));

    let resumed = OpaqueCursor::from_relation_round_trip(
        "page-cursor".to_owned(),
        catalogue.relation("public", "orders").unwrap(),
    )
    .unwrap();
    assert_eq!(
        serde_json::to_value(&resumed).unwrap(),
        json!("page-cursor")
    );
    assert!(OpaqueCursor::from_relation_round_trip(
        "cursor with spaces".to_owned(),
        catalogue.relation("public", "orders").unwrap(),
    )
    .is_err());
}
