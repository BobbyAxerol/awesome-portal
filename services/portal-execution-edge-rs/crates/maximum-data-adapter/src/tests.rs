use std::collections::BTreeMap;

use manager_compat_authority::{DeploymentEnvironment, ManagerRequestContext, DELEGATED_RESOURCE};
use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, ManagerV2Request, RUNTIME_CONTRACT_REVISION,
};
use serde_json::{json, Value};

use super::*;

const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PAPER_PROFILE: &str = "PAPER_BINANCE_USDM";
const SANDBOX_PROFILE: &str = "SANDBOX_BINANCE_USDM";

#[test]
fn e5_embedded_json_decodes_before_cross_contract_validation() {
    let registry: PublicationRegistry = serde_json::from_str(E5_PUBLICATION_JSON).unwrap();
    let fixtures: E5GoldenFixtures = serde_json::from_str(E5_GOLDEN_FIXTURES_JSON).unwrap();
    let manifest: PublicationManifest = serde_json::from_str(E5_PUBLICATION_MANIFEST_JSON).unwrap();
    assert_eq!(registry.entries.len(), 34);
    assert_eq!(fixtures.fixtures.len(), 8);
    assert_eq!(manifest.counts.field_count, 34);
}

#[test]
fn canonical_registry_closes_all_e3_fields_through_named_outcomes() {
    let adapter = MaximumDataAdapter::canonical().unwrap();
    assert_eq!(adapter.registry.entries.len(), 34);
    assert_eq!(adapter.manager_relations.len(), 96);
    assert_eq!(adapter.asset_digests().len(), 4);

    let order = adapter.operation("maximumDataOrderPageV1").unwrap();
    assert_eq!(order.field_id, "order_current");
    assert_eq!(
        order.implementation,
        ImplementationKind::ManagerRelationPage
    );
    assert_eq!(order.allowed_fields.first().unwrap(), "order_id");
    assert_eq!(order.primary_key_fields, ["order_id"]);

    let governance = adapter
        .static_publication("portal_governance", PublicationProfile::Live)
        .unwrap();
    assert!(matches!(
        governance,
        StaticPublication::ExistingPortalContract { existing_contract_id, .. }
            if existing_contract_id == "portal-control-governance-record"
    ));
    let derived = adapter
        .static_publication("execution_quality", PublicationProfile::Canary)
        .unwrap();
    assert!(matches!(
        derived,
        StaticPublication::PortalDerivedDelegate { portal_delegate_id, .. }
            if portal_delegate_id == "portal-query-analytics-execution-quality"
    ));
    let gap = adapter
        .static_publication("trade_replay", PublicationProfile::Paper)
        .unwrap();
    assert!(matches!(
        gap,
        StaticPublication::TypedUnavailable { status_code, typed_absence_id, .. }
            if status_code == "SOURCE_OWNER_GAP"
                && typed_absence_id.as_deref() == Some("fill-correction-replay")
    ));
    let canary = adapter
        .static_publication("canary_drift", PublicationProfile::Canary)
        .unwrap();
    assert!(matches!(
        canary,
        StaticPublication::TypedUnavailable { status_code, typed_absence_id, .. }
            if status_code == "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED"
                && typed_absence_id.is_none()
    ));
}

#[test]
fn manager_adapter_is_fixed_profile_bound_and_never_accepts_raw_relation_selection() {
    let adapter = MaximumDataAdapter::canonical().unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let catalogue = synthetic_catalogue(&adapter, PAPER_PROFILE);
    let bound = authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Paper,
            profile_id: PAPER_PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap();
    let prepared = adapter
        .prepare_manager_page(
            &bound,
            &catalogue,
            "maximumDataOrderPageV1",
            PublicationProfile::Paper,
            None,
            PageLimit::new(2).unwrap(),
        )
        .unwrap();
    assert_eq!(
        prepared.request().blueprint().path(),
        "/portal/execution/v2/manager/records/public/orders"
    );
    assert_eq!(
        prepared.request().blueprint().query(),
        [("limit", "2".to_owned())]
    );
    assert!(matches!(
        adapter.prepare_manager_page(
            &bound,
            &catalogue,
            "public.orders",
            PublicationProfile::Paper,
            None,
            PageLimit::new(2).unwrap(),
        ),
        Err(E5AdapterError::UnknownOperation)
    ));
    assert!(matches!(
        adapter.prepare_manager_page(
            &bound,
            &catalogue,
            "maximumDataOrderPageV1",
            PublicationProfile::Canary,
            None,
            PageLimit::new(2).unwrap(),
        ),
        Err(E5AdapterError::CanaryManagerReadDenied)
    ));
    assert!(matches!(
        adapter.static_publication("order_current", PublicationProfile::Paper),
        Err(E5AdapterError::NotManagerOperation)
    ));

    let sandbox_catalogue = synthetic_catalogue(&adapter, SANDBOX_PROFILE);
    let sandbox = authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Sandbox,
            profile_id: SANDBOX_PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap();
    assert!(matches!(
        adapter.prepare_manager_page(
            &sandbox,
            &sandbox_catalogue,
            "maximumDataOrderPageV1",
            PublicationProfile::Paper,
            None,
            PageLimit::new(2).unwrap(),
        ),
        Err(E5AdapterError::ProfileBindingMismatch)
    ));
}

#[test]
fn manager_page_filters_to_e3_fields_and_preserves_opaque_continuation_without_total_cap() {
    let adapter = MaximumDataAdapter::canonical().unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let catalogue = synthetic_catalogue(&adapter, PAPER_PROFILE);
    let bound = paper_binding(&authority);
    let first = adapter
        .prepare_manager_page(
            &bound,
            &catalogue,
            "maximumDataOrderPageV1",
            PublicationProfile::Paper,
            None,
            PageLimit::new(2).unwrap(),
        )
        .unwrap();
    let envelope = source_page(
        first.request(),
        PAPER_PROFILE,
        "public",
        "orders",
        vec![record(
            "public",
            "orders",
            "source-private-order-key",
            &json!({
                "order_id": tagged_text("order-1"),
                "client_order_id": tagged_text("client-1"),
                "status": tagged_text("SUBMITTED"),
                "quantity": tagged_decimal("3.00000000"),
                "safe_but_not_in_e3": tagged_text("must-be-redacted")
            }),
        )],
        Some("opaque-order-page-2"),
        "FRESH",
        "COMPLETE",
    );
    let page = adapter.adapt_manager_page(&first, &envelope).unwrap();
    assert_eq!(page.state, NamedPageState::Populated);
    assert_eq!(page.records.len(), 1);
    assert!(page.records[0].fields.contains_key("order_id"));
    assert!(page.records[0].fields.contains_key("quantity"));
    assert!(!page.records[0].fields.contains_key("safe_but_not_in_e3"));
    assert!(page.page.has_more);
    assert!(page.page.total_unknown);
    assert!(!page.page.truncated);
    assert_eq!(
        page.page
            .next_cursor
            .as_ref()
            .map(|cursor| cursor.token.as_str()),
        Some("opaque-order-page-2")
    );
    assert_eq!(page.source_health.global_sequence, None);
    assert_eq!(page.source_health.retention_floor_ms, None);
    assert!(!page.source_health.replay_eligible);
    let encoded = serde_json::to_string(&page).unwrap();
    assert!(!encoded.contains("source-private-order-key"));
    assert!(!encoded.contains("safe_but_not_in_e3"));

    let second = adapter
        .prepare_manager_page(
            &bound,
            &catalogue,
            "maximumDataOrderPageV1",
            PublicationProfile::Paper,
            page.page
                .next_cursor
                .as_ref()
                .map(|cursor| cursor.token.as_str()),
            PageLimit::new(2).unwrap(),
        )
        .unwrap();
    assert_eq!(
        second.request().blueprint().query(),
        [
            ("limit", "2".to_owned()),
            ("cursor", "opaque-order-page-2".to_owned())
        ]
    );
    let final_page = source_page(
        second.request(),
        PAPER_PROFILE,
        "public",
        "orders",
        vec![record(
            "public",
            "orders",
            "source-private-order-key-2",
            &json!({
                "order_id": tagged_text("order-2"),
                "status": tagged_text("FILLED")
            }),
        )],
        None,
        "FRESH",
        "COMPLETE",
    );
    let final_page = adapter.adapt_manager_page(&second, &final_page).unwrap();
    assert!(!final_page.page.has_more);
    assert!(final_page.page.total_unknown);
}

#[test]
#[allow(
    clippy::too_many_lines,
    reason = "one integration fixture documents the exact empty/partial/stale/key rejection matrix"
)]
fn manager_page_preserves_empty_partial_stale_and_rejects_missing_or_duplicate_resource_keys() {
    let adapter = MaximumDataAdapter::canonical().unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let catalogue = synthetic_catalogue(&adapter, PAPER_PROFILE);
    let bound = paper_binding(&authority);

    let positions = prepare(&adapter, &bound, &catalogue, "maximumDataPositionPageV1");
    let empty = source_page(
        positions.request(),
        PAPER_PROFILE,
        "public",
        "positions_v2",
        vec![],
        None,
        "FRESH",
        "COMPLETE",
    );
    assert_eq!(
        adapter
            .adapt_manager_page(&positions, &empty)
            .unwrap()
            .state,
        NamedPageState::Empty
    );

    let fills = prepare(&adapter, &bound, &catalogue, "maximumDataFillPageV1");
    let partial = source_page(
        fills.request(),
        PAPER_PROFILE,
        "public",
        "fills",
        vec![record(
            "public",
            "fills",
            "fill-key",
            &json!({ "fill_id": tagged_text("fill-1") }),
        )],
        None,
        "FRESH",
        "PARTIAL",
    );
    assert_eq!(
        adapter.adapt_manager_page(&fills, &partial).unwrap().state,
        NamedPageState::Partial
    );

    let accounts = prepare(&adapter, &bound, &catalogue, "maximumDataAccountPageV1");
    let stale = source_page(
        accounts.request(),
        PAPER_PROFILE,
        "public",
        "accounts",
        vec![record(
            "public",
            "accounts",
            "account-key",
            &json!({ "account_id": tagged_text("account-1") }),
        )],
        None,
        "STALE",
        "COMPLETE",
    );
    assert_eq!(
        adapter.adapt_manager_page(&accounts, &stale).unwrap().state,
        NamedPageState::Stale
    );

    let orders = prepare(&adapter, &bound, &catalogue, "maximumDataOrderPageV1");
    let valid_order = source_page(
        orders.request(),
        PAPER_PROFILE,
        "public",
        "orders",
        vec![record(
            "public",
            "orders",
            "valid-order-key",
            &json!({ "order_id": tagged_text("valid-order") }),
        )],
        None,
        "FRESH",
        "COMPLETE",
    );
    let mut missing_identity_descriptor = orders.clone();
    missing_identity_descriptor.descriptor.primary_key_fields =
        vec!["missing_primary_key".to_owned()];
    assert!(matches!(
        adapter.adapt_manager_page(&missing_identity_descriptor, &valid_order),
        Err(E5AdapterError::ResourceIdentityInvalid)
    ));
    let duplicate = source_page(
        orders.request(),
        PAPER_PROFILE,
        "public",
        "orders",
        vec![
            record(
                "public",
                "orders",
                "first-key",
                &json!({ "order_id": tagged_text("duplicate") }),
            ),
            record(
                "public",
                "orders",
                "second-key",
                &json!({ "order_id": tagged_text("duplicate") }),
            ),
        ],
        None,
        "FRESH",
        "COMPLETE",
    );
    assert!(matches!(
        adapter.adapt_manager_page(&orders, &duplicate),
        Err(E5AdapterError::ResourceIdentityInvalid)
    ));
}

#[test]
fn manager_page_rejects_cross_profile_and_assets_cannot_introduce_direct_source_authority() {
    let adapter = MaximumDataAdapter::canonical().unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let catalogue = synthetic_catalogue(&adapter, PAPER_PROFILE);
    let bound = paper_binding(&authority);
    let prepared = prepare(&adapter, &bound, &catalogue, "maximumDataOrderPageV1");
    let cross_profile = source_page(
        prepared.request(),
        SANDBOX_PROFILE,
        "public",
        "orders",
        vec![record(
            "public",
            "orders",
            "order-key",
            &json!({ "order_id": tagged_text("order-1") }),
        )],
        None,
        "FRESH",
        "COMPLETE",
    );
    assert!(matches!(
        adapter.adapt_manager_page(&prepared, &cross_profile),
        Err(E5AdapterError::SourceBindingMismatch)
    ));
    for asset in [
        E5_PUBLICATION_SCHEMA_JSON,
        E5_NAMED_PAGE_SCHEMA_JSON,
        E5_PUBLICATION_JSON,
        E5_GOLDEN_FIXTURES_JSON,
        E5_PUBLICATION_MANIFEST_JSON,
    ] {
        assert!(!asset.contains("postgres://"));
        assert!(!asset.contains("redis://"));
        assert!(!asset.contains("SELECT "));
        assert!(!asset.contains("/portal/execution/v4"));
    }
}

fn paper_binding(authority: &ManagerCompatibilityAuthority) -> BoundManagerAuthority<'_> {
    authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Paper,
            profile_id: PAPER_PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap()
}

fn prepare(
    adapter: &MaximumDataAdapter,
    authority: &BoundManagerAuthority<'_>,
    catalogue: &ManagerCatalogue,
    operation: &str,
) -> PreparedManagerPage {
    adapter
        .prepare_manager_page(
            authority,
            catalogue,
            operation,
            PublicationProfile::Paper,
            None,
            PageLimit::new(2).unwrap(),
        )
        .unwrap()
}

fn synthetic_catalogue(adapter: &MaximumDataAdapter, profile_id: &str) -> ManagerCatalogue {
    let mut manager_fields = BTreeMap::<String, (Vec<String>, Vec<String>)>::new();
    for entry in &adapter.registry.entries {
        if entry.implementation != ImplementationKind::ManagerRelationPage {
            continue;
        }
        let relation = entry.manager_relation_id.clone().unwrap();
        let field = adapter.field(&entry.field_id).unwrap();
        let mut columns = field.source_columns.clone();
        columns.push("safe_but_not_in_e3".to_owned());
        manager_fields.insert(
            relation,
            (
                columns,
                split_resource_key(&field.primary_resource_key).unwrap(),
            ),
        );
    }
    let census: Value = serde_json::from_str(MANAGER_CENSUS_JSON).unwrap();
    let relations = census["relations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["relation_id"].as_str().unwrap())
        .map(|relation_id| {
            let (schema, relation) = split_relation(relation_id).unwrap();
            let (columns, key_columns) = manager_fields
                .get(relation_id)
                .cloned()
                .unwrap_or_else(|| (vec!["id".to_owned()], vec!["id".to_owned()]));
            let safe_columns = columns
                .iter()
                .enumerate()
                .map(|(index, name)| {
                    json!({
                        "name": name,
                        "ordinal": index + 1,
                        "data_type": "text",
                        "nullable": !key_columns.contains(name)
                    })
                })
                .collect::<Vec<_>>();
            json!({
                "id": { "schema": schema, "relation": relation },
                "kind": "TABLE",
                "safe_columns": safe_columns,
                "secret_cell_excluded_column_count": 0,
                "key": { "status": "PRIMARY_KEY", "name": null, "columns": key_columns },
                "profile_classification": "FIXED_PROFILE_CONTEXT",
                "profile_columns": [],
                "query_status": "QUALIFIED_TS_OC_03D1"
            })
        })
        .collect::<Vec<_>>();
    let data = json!({
        "catalogue_revision": DIGEST,
        "relation_count": relations.len(),
        "relations": relations
    });
    let response = envelope(profile_id, &data, "FRESH", "COMPLETE");
    let ManagerPayload::Catalogue(catalogue) = decode_success_for_profile(
        &ManagerV2Request::catalogue(),
        &serde_json::to_vec(&response).unwrap(),
        profile_id,
    )
    .unwrap() else {
        panic!("expected catalogue");
    };
    catalogue.into_data()
}

#[allow(
    clippy::too_many_arguments,
    clippy::needless_pass_by_value,
    reason = "the test factory mirrors the owned Manager wire response without a production helper"
)]
fn source_page(
    request: &ManagerV2Request,
    profile_id: &str,
    schema: &str,
    relation: &str,
    items: Vec<Value>,
    next_cursor: Option<&str>,
    freshness: &str,
    completeness: &str,
) -> ManagerEnvelope<RelationRecords> {
    let data = json!({
        "relation": { "schema": schema, "relation": relation },
        "items": items,
        "next_cursor": next_cursor
    });
    let response = envelope(profile_id, &data, freshness, completeness);
    let ManagerPayload::RelationRecords(page) =
        decode_success_for_profile(request, &serde_json::to_vec(&response).unwrap(), profile_id)
            .unwrap()
    else {
        panic!("expected relation records");
    };
    page
}

fn envelope(profile_id: &str, data: &Value, freshness: &str, completeness: &str) -> Value {
    json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": profile_id,
        "catalogue_sha256": DIGEST,
        "availability": "AVAILABLE",
        "freshness": freshness,
        "completeness": completeness,
        "trace_id": "maximum-data-e5-test",
        "as_of": "2026-09-04T00:00:00Z",
        "data": data
    })
}

fn record(schema: &str, relation: &str, record_key: &str, fields: &Value) -> Value {
    let relation_id = format!("{schema}.{relation}");
    let mut complete = fields.as_object().cloned().unwrap();
    for field in source_fields(&relation_id) {
        complete
            .entry(field)
            .or_insert_with(|| tagged_text("fixture-value"));
    }
    complete
        .entry("safe_but_not_in_e3".to_owned())
        .or_insert_with(|| tagged_text("fixture-safe-extra"));
    json!({
        "relation": { "schema": schema, "relation": relation },
        "record_key": record_key,
        "fields": complete
    })
}

fn source_fields(relation_id: &str) -> Vec<String> {
    let definitions: Value =
        serde_json::from_str(maximum_data_contract::E3_FIELD_DEFINITIONS_JSON).unwrap();
    definitions["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["source_relation_or_operation"] == relation_id)
        .unwrap()["source_columns"]
        .as_array()
        .unwrap()
        .iter()
        .map(|field| field.as_str().unwrap().to_owned())
        .collect()
}

fn tagged_text(value: &str) -> Value {
    json!({ "kind": "TEXT", "value": value })
}

fn tagged_decimal(value: &str) -> Value {
    json!({ "kind": "DECIMAL", "value": value })
}
