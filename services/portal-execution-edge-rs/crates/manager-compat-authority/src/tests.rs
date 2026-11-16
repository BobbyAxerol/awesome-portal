use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, ManagerV2Request, PageLimit, ProjectionKind,
    RUNTIME_CONTRACT_REVISION,
};
use serde_json::{json, Value};

use super::*;

const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PROFILE: &str = "PAPER_BINANCE_USDM";
const V1_CENSUS_JSON: &str =
    include_str!("../../../contracts/manager-surface-census-v1/manager-surface-census.v1.json");
/// The 13 T1 relations census v2 adds to the 96 frozen v1 relations.
const T1_RELATIONS: [&str; 13] = [
    "public.alpha_deadman_heartbeats",
    "public.command_transport_bindings",
    "public.conditional_order_group_native_parents",
    "public.economic_account_cash_balances",
    "public.economic_account_fact_census",
    "public.economic_account_scope_heads",
    "public.economic_facts",
    "public.economic_performance_projections_v2",
    "public.economic_reconciliation_cases",
    "public.economic_tie_out_reports",
    "public.execution_algorithm_parents",
    "public.risk_pool_state_projections",
    "public.source_change_journal",
];

fn envelope(data: impl Into<Value>) -> Value {
    let data = data.into();
    json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": PROFILE,
        "catalogue_sha256": DIGEST,
        "availability": "AVAILABLE",
        "freshness": "FRESH",
        "completeness": "COMPLETE",
        "trace_id": "n19-manager-authority-test",
        "as_of": "2026-08-30T00:00:00Z",
        "data": data,
    })
}

fn catalogue_value(relation_ids: impl IntoIterator<Item = String>) -> Value {
    let relations: Vec<Value> = relation_ids
        .into_iter()
        .map(|relation_id| {
            let (schema, relation) = relation_id.split_once('.').unwrap();
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
        })
        .collect();
    let count = relations.len();
    envelope(json!({
        "catalogue_revision": DIGEST,
        "relation_count": count,
        "relations": relations
    }))
}

fn decode_catalogue(relation_ids: impl IntoIterator<Item = String>) -> ManagerCatalogue {
    let body = serde_json::to_vec(&catalogue_value(relation_ids)).unwrap();
    let ManagerPayload::Catalogue(envelope) =
        decode_success_for_profile(&ManagerV2Request::catalogue(), &body, PROFILE).unwrap()
    else {
        panic!("expected Manager catalogue")
    };
    envelope.into_data()
}

fn context<'a>(
    environment: DeploymentEnvironment,
    profile_id: &'a str,
    resource: &'a str,
    owner_revision: &'a str,
) -> ManagerRequestContext<'a> {
    ManagerRequestContext {
        environment,
        profile_id,
        delegated_resource: resource,
        owner_contract_revision: owner_revision,
    }
}

#[test]
fn canonical_authority_is_digest_bound_and_runtime_activated() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    assert_eq!(authority.approved_relation_count(), 109);
    assert_eq!(
        authority.active_adapter_revision(),
        "portal.execution.manager-adapter.runtime-v1"
    );
    assert_eq!(
        authority.activation_revision(),
        "portal.execution.manager-profile-runtime-activation.2026-09-01.1"
    );

    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    assert_eq!(bound.profile_id(), PROFILE);
    assert_eq!(
        bound.catalogue_request().blueprint().path(),
        "/portal/execution/v2/manager/catalog"
    );
    assert_eq!(
        bound.capabilities_request().blueprint().path(),
        "/portal/execution/v2/manager/capabilities"
    );
}

#[test]
fn deployment_binding_rejects_wrong_environment_profile_resource_and_revision() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    assert!(matches!(
        authority.bind(context(
            DeploymentEnvironment::Sandbox,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        )),
        Err(AuthorityError::ProfileDenied)
    ));
    assert!(matches!(
        authority.bind(context(
            DeploymentEnvironment::Paper,
            "LIVE_BINANCE_USDM",
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        )),
        Err(AuthorityError::ProfileDenied)
    ));
    assert!(matches!(
        authority.bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            "execution:manager-v2:write",
            RUNTIME_CONTRACT_REVISION,
        )),
        Err(AuthorityError::ResourceDenied)
    ));
    for (environment, profile_id) in [
        (DeploymentEnvironment::Paper, "PAPER_BINANCE_USDM"),
        (DeploymentEnvironment::Sandbox, "SANDBOX_BINANCE_USDM"),
        (DeploymentEnvironment::Live, "LIVE_BINANCE_USDM"),
    ] {
        let bound = authority
            .bind(context(
                environment,
                profile_id,
                DELEGATED_RESOURCE,
                RUNTIME_CONTRACT_REVISION,
            ))
            .unwrap();
        assert_eq!(bound.profile_id(), profile_id);
    }
    assert!(matches!(
        authority.bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            "unknown-owner-revision",
        )),
        Err(AuthorityError::RevisionUnsupported)
    ));
}

#[test]
fn simulated_future_adapter_switch_and_explicit_rollback_do_not_widen_operations() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let future = authority
        .qualify_adapter("trading-system.portal-execution.manager-v2.runtime.v2.simulated")
        .unwrap();
    assert!(!future.deployable);
    assert!(future.test_only);
    assert!(matches!(
        authority.bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            future.owner_contract_revision,
        )),
        Err(AuthorityError::AdapterNotDeployable)
    ));
    let rollback = authority.rollback_adapter(future.adapter_revision).unwrap();
    assert_eq!(rollback.owner_contract_revision, RUNTIME_CONTRACT_REVISION);
    assert!(rollback.deployable);
    assert!(!rollback.test_only);
}

#[test]
fn all_census_relations_build_only_catalogue_bound_get_blueprints() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let approved: Vec<String> = authority.approved_relations.iter().cloned().collect();
    let catalogue = decode_catalogue(approved.clone());
    authority.validate_catalogue(&catalogue).unwrap();

    for relation_id in approved {
        let request = bound
            .relation_page_request(&catalogue, &relation_id, None, PageLimit::new(200).unwrap())
            .unwrap();
        let expected = format!(
            "/portal/execution/v2/manager/records/{}",
            relation_id.replace('.', "/")
        );
        assert_eq!(request.blueprint().path(), expected);
        assert_eq!(request.blueprint().query(), &[("limit", "200".to_owned())]);
    }

    assert!(matches!(
        bound.relation_page_request(
            &catalogue,
            "public.not_approved",
            None,
            PageLimit::default(),
        ),
        Err(AuthorityError::RelationNotApproved)
    ));
}

#[test]
fn missing_or_extra_catalogue_relation_fails_closed() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let mut approved: Vec<String> = authority.approved_relations.iter().cloned().collect();
    approved.pop();
    assert!(matches!(
        authority.validate_catalogue(&decode_catalogue(approved)),
        Err(AuthorityError::CatalogueDrift)
    ));

    let mut approved: Vec<String> = authority.approved_relations.iter().cloned().collect();
    approved.push("public.unapproved_extra".to_owned());
    assert!(matches!(
        authority.validate_catalogue(&decode_catalogue(approved)),
        Err(AuthorityError::CatalogueDrift)
    ));
}

#[test]
fn pinned_subset_requires_exact_digest_and_never_widens_named_projections() {
    let authority = ManagerCompatibilityAuthority::canonical()
        .unwrap()
        .restrict_to_pinned_catalogue(DIGEST, &["public.orders", "public.accounts"])
        .unwrap();
    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let catalogue = decode_catalogue(["public.orders".to_owned(), "public.accounts".to_owned()]);
    assert!(bound.validate_catalogue(&catalogue).is_ok());
    assert!(bound
        .projection_request(
            &catalogue,
            ProjectionKind::Order,
            None,
            PageLimit::default()
        )
        .is_ok());
    assert!(matches!(
        bound.projection_request(
            &catalogue,
            ProjectionKind::Portfolio,
            None,
            PageLimit::default()
        ),
        Err(AuthorityError::ProjectionDenied)
    ));
    assert!(matches!(
        bound.relation_page_request(&catalogue, "public.portfolios", None, PageLimit::default()),
        Err(AuthorityError::RelationNotApproved)
    ));
    assert!(matches!(
        authority.validate_catalogue(&decode_catalogue(["public.orders".to_owned()])),
        Err(AuthorityError::CatalogueDrift)
    ));
    let wrong_pin = format!("sha256:{}", "b".repeat(64));
    let authority = ManagerCompatibilityAuthority::canonical()
        .unwrap()
        .restrict_to_pinned_catalogue(&wrong_pin, &["public.orders", "public.accounts"])
        .unwrap();
    assert!(matches!(
        authority.validate_catalogue(&catalogue),
        Err(AuthorityError::CatalogueDrift)
    ));
}

#[test]
fn invalid_or_widened_catalogue_restriction_fails_closed() {
    for (digest, names) in [
        (DIGEST, vec![]),
        (DIGEST, vec!["public.orders", "public.orders"]),
        (DIGEST, vec!["public.not_approved"]),
        ("sha256:BAD", vec!["public.orders"]),
    ] {
        assert!(matches!(
            ManagerCompatibilityAuthority::canonical()
                .unwrap()
                .restrict_to_pinned_catalogue(digest, &names),
            Err(AuthorityError::InvalidCatalogueRestriction)
        ));
    }
}

#[test]
fn release_manifest_is_byte_pinned_profile_bound_and_not_widened() {
    let manifest = json!({"schema_version":"portal.execution.manager-catalogue-release.v1",
        "environment":"paper", "profile_id":PROFILE, "catalogue_sha256":DIGEST,
        "relations":["public.orders", "public.accounts"]});
    let bytes = serde_json::to_vec(&manifest).unwrap();
    let pin = digest(&bytes);
    let release = ManagerCompatibilityAuthority::from_pinned_release(
        &bytes,
        &pin,
        DeploymentEnvironment::Paper,
        PROFILE,
    )
    .unwrap();
    let exact = decode_catalogue(["public.orders".to_owned(), "public.accounts".to_owned()]);
    assert!(release.validate_catalogue(&exact).is_ok());
    assert!(matches!(
        release.bind(context(
            DeploymentEnvironment::Live,
            "LIVE_BINANCE_USDM",
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION
        )),
        Err(AuthorityError::ProfileDenied)
    ));
    assert!(ManagerCompatibilityAuthority::from_pinned_release(
        &bytes,
        DIGEST,
        DeploymentEnvironment::Paper,
        PROFILE
    )
    .is_err());
    assert!(ManagerCompatibilityAuthority::from_pinned_release(
        &bytes,
        &pin,
        DeploymentEnvironment::Live,
        "LIVE_BINANCE_USDM"
    )
    .is_err());
    let mut changed = manifest.clone();
    changed["relations"] = json!(["public.orders", "public.not_approved"]);
    let widened = serde_json::to_vec(&changed).unwrap();
    assert!(ManagerCompatibilityAuthority::from_pinned_release(
        &widened,
        &digest(&widened),
        DeploymentEnvironment::Paper,
        PROFILE
    )
    .is_err());
    changed["unexpected"] = json!(true);
    let unknown = serde_json::to_vec(&changed).unwrap();
    assert!(ManagerCompatibilityAuthority::from_pinned_release(
        &unknown,
        &digest(&unknown),
        DeploymentEnvironment::Paper,
        PROFILE
    )
    .is_err());
    let large = vec![b' '; 65_537];
    assert!(ManagerCompatibilityAuthority::from_pinned_release(
        &large,
        &digest(&large),
        DeploymentEnvironment::Paper,
        PROFILE
    )
    .is_err());
}

#[test]
fn record_projection_cursor_and_exact_decimal_remain_owned_by_typed_contract() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let approved: Vec<String> = authority.approved_relations.iter().cloned().collect();
    let catalogue = decode_catalogue(approved.clone());
    let relation_id = &approved[0];
    let (schema, relation) = relation_id.split_once('.').unwrap();
    let page_request = bound
        .relation_page_request(&catalogue, relation_id, None, PageLimit::new(1).unwrap())
        .unwrap();
    let page_body = envelope(json!({
        "relation": {"schema": schema, "relation": relation},
        "items": [{
            "relation": {"schema": schema, "relation": relation},
            "record_key": "opaque-record-key",
            "fields": {
                "id": {"kind": "INTEGER", "value": 1},
                "amount": {"kind": "DECIMAL", "value": "12.5000"}
            }
        }],
        "next_cursor": "opaque-relation-cursor"
    }));
    let ManagerPayload::RelationRecords(page) = decode_success_for_profile(
        &page_request,
        &serde_json::to_vec(&page_body).unwrap(),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected relation records")
    };
    let record = &page.data().items()[0];
    let record_request = bound.record_request(&catalogue, record).unwrap();
    assert!(record_request
        .blueprint()
        .path()
        .ends_with("/opaque-record-key"));
    assert_eq!(
        serde_json::to_value(record.fields().get("amount").unwrap()).unwrap(),
        json!({"kind": "DECIMAL", "value": "12.5000"})
    );

    let relation_cursor = page.data().next_cursor().unwrap();
    assert!(bound
        .relation_page_request(
            &catalogue,
            &approved[1],
            Some(relation_cursor),
            PageLimit::default(),
        )
        .is_err());

    let projection = bound
        .projection_request(
            &catalogue,
            ProjectionKind::Order,
            None,
            PageLimit::default(),
        )
        .unwrap();
    assert_eq!(
        projection.blueprint().path(),
        "/portal/execution/v2/manager/projections/order"
    );
}

#[test]
fn exact_five_capabilities_are_validated_after_contract_decode() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let capabilities = [
        ("managerCatalog", "/portal/execution/v2/manager/catalog"),
        (
            "managerRelationRecords",
            "/portal/execution/v2/manager/records/{schema}/{relation}",
        ),
        (
            "managerRelationRecord",
            "/portal/execution/v2/manager/records/{schema}/{relation}/{key}",
        ),
        (
            "managerProjection",
            "/portal/execution/v2/manager/projections/{kind}",
        ),
        (
            "managerCapabilities",
            "/portal/execution/v2/manager/capabilities",
        ),
    ];
    let body = envelope(json!({
        "contract_revision": RUNTIME_CONTRACT_REVISION,
        "active_profile_id": PROFILE,
        "capabilities": capabilities.into_iter().map(|(operation_id, path_template)| json!({
            "operation_id": operation_id,
            "path_template": path_template,
            "registered": true,
            "portal_reachable": false,
            "source_binding": true,
            "qualification_status": "OWNER_LOOPBACK_QUALIFIED"
        })).collect::<Vec<_>>()
    }));
    let ManagerPayload::Capabilities(parsed) = decode_success_for_profile(
        &bound.capabilities_request(),
        &serde_json::to_vec(&body).unwrap(),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected capabilities")
    };
    bound.validate_capabilities(parsed.data()).unwrap();
}

#[test]
fn negative_matrix_is_complete_and_contains_no_secrets() {
    let value: Value = serde_json::from_str(include_str!(
        "../../../contracts/manager-compat-authority-v1/negative-matrix.v1.json"
    ))
    .unwrap();
    let cases = value["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 12);
    let ids: BTreeSet<&str> = cases
        .iter()
        .map(|case| case["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids.len(), 12);
    let serialized = value.to_string().to_ascii_lowercase();
    for forbidden in ["api_key", "private_key", "password", "secret", "dsn"] {
        assert!(!serialized.contains(forbidden));
    }
}

const OID_HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ALT_OID_HASH: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/// Manager wire member; `rows: None` is a `NOT_READABLE` ledger.
fn identity_member(name: &str, oid: &str, rows: Option<u64>) -> Value {
    json!({
        "database_name": name,
        "database_oid_sha256": oid,
        "schema_ledger_rows": rows,
        "latest_ledger_version": rows.map(|_| "99zzzzzzzzzzzzzz-test-v1"),
        "ledger_status": if rows.is_some() { "READABLE" } else { "NOT_READABLE" }
    })
}

fn catalogue_with_identity(identity: Option<Value>) -> ManagerCatalogue {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let mut value = catalogue_value(authority.approved_relations.iter().cloned());
    if let Some(identity) = identity {
        value["data"]["source_identity"] = identity;
    }
    let body = serde_json::to_vec(&value).unwrap();
    let ManagerPayload::Catalogue(envelope) =
        decode_success_for_profile(&ManagerV2Request::catalogue(), &body, PROFILE).unwrap()
    else {
        panic!("expected Manager catalogue")
    };
    envelope.into_data()
}

fn pin_value(required: bool) -> Value {
    json!({
        "schema_version": "portal.execution.manager-source-identity-pin.v1",
        "environment": "paper",
        "profile_id": PROFILE,
        "source_identity_required": required,
        "database_name": "trading_system",
        "database_oid_sha256": OID_HASH,
        "minimum_schema_ledger_rows": 173
    })
}

fn pinned_authority(pin: &Value) -> Result<ManagerCompatibilityAuthority, AuthorityError> {
    let bytes = serde_json::to_vec(pin).unwrap();
    let pin_digest = digest(&bytes);
    let environment = DeploymentEnvironment::Paper;
    let authority = ManagerCompatibilityAuthority::canonical()?;
    authority.with_source_identity_pin(&bytes, &pin_digest, environment, PROFILE)
}

fn check(
    authority: &ManagerCompatibilityAuthority,
    member: Option<Value>,
) -> Result<(), AuthorityError> {
    authority.validate_source_identity(PROFILE, &catalogue_with_identity(member))
}

fn reason_code(result: Result<(), AuthorityError>) -> &'static str {
    result.unwrap_err().source_identity_detail().unwrap().0
}

#[test]
fn unpinned_profile_is_not_identity_checked() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let foreign = identity_member("any_database", ALT_OID_HASH, None);
    for member in [None, Some(foreign)] {
        check(&authority, member).unwrap();
    }
}

#[test]
fn pinned_exact_identity_and_a_higher_ledger_count_pass() {
    let authority = pinned_authority(&pin_value(true)).unwrap();
    for rows in [173, 174, 1_000] {
        let member = identity_member("trading_system", OID_HASH, Some(rows));
        check(&authority, Some(member)).unwrap();
    }
}

#[test]
fn each_mismatch_has_its_own_reason_and_never_echoes_hashes_or_counts() {
    let authority = pinned_authority(&pin_value(true)).unwrap();
    let cases = [
        (
            identity_member("trading_system_sandbox", OID_HASH, Some(173)),
            "DATABASE_NAME",
        ),
        (
            identity_member("live_data_executor", OID_HASH, Some(149)),
            "DATABASE_NAME",
        ),
        (
            identity_member("trading_system", ALT_OID_HASH, Some(173)),
            "DATABASE_OID",
        ),
        (
            identity_member("trading_system", OID_HASH, Some(172)),
            "LEDGER_BELOW_MINIMUM",
        ),
        (
            identity_member("trading_system", OID_HASH, None),
            "LEDGER_NOT_READABLE",
        ),
    ];
    for (member, expected) in cases {
        let error = check(&authority, Some(member)).unwrap_err();
        let (reason, pinned, observed) = error.source_identity_detail().unwrap();
        assert_eq!(reason, expected);
        assert_eq!(pinned, "trading_system");
        assert!(observed.is_some());
        let rendered = format!("{error} {error:?}");
        assert!(!rendered.contains(OID_HASH) && !rendered.contains(ALT_OID_HASH));
    }
    assert_eq!(
        SOURCE_DB_IDENTITY_MISMATCH_CODE,
        "MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH"
    );
}

#[test]
fn ledger_checks_follow_the_pin_minimum_and_ledger_status_required() {
    let mut no_minimum = pin_value(true);
    no_minimum["minimum_schema_ledger_rows"] = Value::Null;
    let lenient = pinned_authority(&no_minimum).unwrap();
    let unreadable = identity_member("trading_system", OID_HASH, None);
    // Null minimum and no status requirement: only name and OID hash are compared.
    check(&lenient, Some(unreadable.clone())).unwrap();
    check(
        &lenient,
        Some(identity_member("trading_system", OID_HASH, Some(1))),
    )
    .unwrap();

    let mut status_required = no_minimum.clone();
    status_required["ledger_status_required"] = json!(true);
    let strict_status = pinned_authority(&status_required).unwrap();
    assert_eq!(
        reason_code(check(&strict_status, Some(unreadable))),
        "LEDGER_NOT_READABLE"
    );
    let readable = identity_member("trading_system", OID_HASH, Some(1));
    check(&strict_status, Some(readable)).unwrap();

    // The key may also be absent: same as null.
    let mut absent_minimum = pin_value(true);
    absent_minimum
        .as_object_mut()
        .unwrap()
        .remove("minimum_schema_ledger_rows");
    let unpinned_count = pinned_authority(&absent_minimum).unwrap();
    let member = identity_member("trading_system", OID_HASH, None);
    check(&unpinned_count, Some(member)).unwrap();
}

#[test]
fn an_absent_identity_is_refused_unless_the_pin_explicitly_allows_a_legacy_manager() {
    let strict = pinned_authority(&pin_value(true)).unwrap();
    let legacy_allowed = pinned_authority(&pin_value(false)).unwrap();
    assert_eq!(reason_code(check(&strict, None)), "IDENTITY_ABSENT");
    check(&legacy_allowed, None).unwrap();
    // A Manager that does send an identity must still match, even when legacy is allowed.
    let member = identity_member("trading_system", ALT_OID_HASH, Some(173));
    assert_eq!(
        reason_code(check(&legacy_allowed, Some(member))),
        "DATABASE_OID"
    );
}

#[test]
fn identity_pin_loading_rejects_unpinned_malformed_or_mis_bound_input() {
    let with = |key: &str, value: Value| {
        let mut pin = pin_value(true);
        pin[key] = value;
        pin
    };
    let mut without_requirement = pin_value(true);
    without_requirement
        .as_object_mut()
        .unwrap()
        .remove("source_identity_required");
    for pin in [
        without_requirement,
        with("system_identifier", json!("raw")),
        // The pre-Manager-wire field name must not be silently accepted.
        with("minimum_schema_migration_count", json!(173)),
        with("database_oid_sha256", json!(format!("sha256:{OID_HASH}"))),
        with("database_oid_sha256", json!(OID_HASH.to_uppercase())),
        with("database_oid_sha256", json!("not-a-digest")),
        with("database_name", json!("")),
        with("environment", json!("live")),
        with("profile_id", json!("SANDBOX_BINANCE_USDM")),
        with("schema_version", json!("unknown.v1")),
        with("minimum_schema_ledger_rows", json!(-1)),
        with("ledger_status_required", json!("yes")),
    ] {
        assert!(matches!(
            pinned_authority(&pin),
            Err(AuthorityError::InvalidSourceIdentityPin)
        ));
    }
    let bytes = serde_json::to_vec(&pin_value(true)).unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let wrong_digest = format!("sha256:{ALT_OID_HASH}");
    assert!(matches!(
        authority.with_source_identity_pin(
            &bytes,
            &wrong_digest,
            DeploymentEnvironment::Paper,
            PROFILE,
        ),
        Err(AuthorityError::InvalidSourceIdentityPin)
    ));
}

#[test]
fn bound_authority_applies_the_identity_guard_to_every_request_builder() {
    let authority = pinned_authority(&pin_value(true)).unwrap();
    let bound = authority
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let good_member = identity_member("trading_system", OID_HASH, Some(173));
    let wrong_member = identity_member("live_data_executor", OID_HASH, Some(149));
    let good = catalogue_with_identity(Some(good_member));
    let wrong = catalogue_with_identity(Some(wrong_member));
    let relation_id = authority.approved_relations.iter().next().unwrap().clone();
    bound.validate_catalogue(&good).unwrap();
    bound
        .relation_page_request(&good, &relation_id, None, PageLimit::default())
        .unwrap();
    assert!(matches!(
        bound.validate_catalogue(&wrong),
        Err(AuthorityError::SourceDbIdentityMismatch { .. })
    ));
    assert!(matches!(
        bound.relation_page_request(&wrong, &relation_id, None, PageLimit::default()),
        Err(AuthorityError::SourceDbIdentityMismatch { .. })
    ));
    assert!(matches!(
        bound.projection_request(&wrong, ProjectionKind::Order, None, PageLimit::default()),
        Err(AuthorityError::SourceDbIdentityMismatch { .. })
    ));
}

fn v1_relations() -> Vec<String> {
    let census: Value = serde_json::from_str(V1_CENSUS_JSON).unwrap();
    let mut relations: Vec<String> = census["relations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["relation_id"].as_str().unwrap().to_owned())
        .collect();
    relations.sort();
    relations
}

fn paper_release(relations: &[String]) -> Result<ManagerCompatibilityAuthority, AuthorityError> {
    let manifest = json!({"schema_version":"portal.execution.manager-catalogue-release.v1",
        "environment":"paper", "profile_id":PROFILE, "catalogue_sha256":DIGEST,
        "relations":relations});
    let bytes = serde_json::to_vec(&manifest).unwrap();
    ManagerCompatibilityAuthority::from_pinned_release(
        &bytes,
        &digest(&bytes),
        DeploymentEnvironment::Paper,
        PROFILE,
    )
}

#[test]
fn census_v2_is_the_frozen_v1_set_plus_exactly_the_thirteen_t1_relations() {
    let canonical = ManagerCompatibilityAuthority::canonical().unwrap();
    let v1 = v1_relations();
    assert_eq!(v1.len(), 96);
    let mut expected: BTreeSet<String> = v1.into_iter().collect();
    assert!(T1_RELATIONS
        .iter()
        .all(|name| expected.insert((*name).to_owned())));
    assert_eq!(canonical.approved_relations, expected);
    assert_eq!(canonical.approved_relation_count(), 109);
}

#[test]
fn release_listing_the_current_49_v1_relations_is_accepted_and_enables_only_them() {
    let current: Vec<String> = v1_relations().into_iter().take(49).collect();
    let release = paper_release(&current).unwrap();
    assert_eq!(release.approved_relation_count(), 49);
    release
        .validate_catalogue(&decode_catalogue(current.clone()))
        .unwrap();

    // The 13 T1 relations are in the census but stay disabled: a catalogue that carries one is drift, and
    // no request can be built for it.
    let mut widened = current.clone();
    widened.push(T1_RELATIONS[6].to_owned());
    assert!(matches!(
        release.validate_catalogue(&decode_catalogue(widened)),
        Err(AuthorityError::CatalogueDrift)
    ));
    let bound = release
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    let catalogue = decode_catalogue(current);
    for name in T1_RELATIONS {
        assert!(matches!(
            bound.relation_page_request(&catalogue, name, None, PageLimit::default()),
            Err(AuthorityError::RelationNotApproved)
        ));
    }
}

#[test]
fn release_listing_a_t1_relation_is_accepted_only_when_it_is_in_the_v2_census() {
    let mut listed: Vec<String> = v1_relations().into_iter().take(49).collect();
    for name in T1_RELATIONS {
        let mut with_t1 = listed.clone();
        with_t1.push(name.to_owned());
        assert_eq!(
            paper_release(&with_t1).unwrap().approved_relation_count(),
            50
        );
    }
    listed.push(T1_RELATIONS[6].to_owned());
    let release = paper_release(&listed).unwrap();
    let catalogue = decode_catalogue(listed.clone());
    release.validate_catalogue(&catalogue).unwrap();
    let bound = release
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    assert!(bound
        .relation_page_request(&catalogue, T1_RELATIONS[6], None, PageLimit::default())
        .is_ok());

    // A name outside the v2 census (including a near-miss of a T1 name) is refused.
    for name in [
        "public.economic_fact",
        "public.economic_facts_v3",
        "public.venue_secrets",
    ] {
        let mut outside = listed.clone();
        outside.push(name.to_owned());
        assert!(matches!(
            paper_release(&outside),
            Err(AuthorityError::InvalidCatalogueRestriction)
        ));
    }
}

// Real Paper release files, read as bytes exactly as the Edge loads them: the live T2-five release (54) and the
// prepared T1 + T2-five release (67). Both come from the real catalogue tool (see docs/PAPER_T1_RELEASE_PLAN_20261116.md).
const PAPER_T2_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/t2-live-manager-catalogue-release.json"
);
const PAPER_T1_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/manager-catalogue-release.json"
);
const SCOPE_GAP_RELATIONS: [&str; 3] = [
    "public.dnse_trading_tokens",
    "public.venue_credentials",
    "public.engine_authority_decisions",
];
const T2_FIVE: [&str; 5] = [
    "public.alphas",
    "public.portfolio_audit_current_state",
    "public.portfolio_equity_snapshots",
    "public.strategies",
    "public.traders",
];

fn real_release(bytes: &[u8]) -> Result<ManagerCompatibilityAuthority, AuthorityError> {
    ManagerCompatibilityAuthority::from_pinned_release(
        bytes,
        &digest(bytes),
        DeploymentEnvironment::Paper,
        PROFILE,
    )
}

fn release_relations(bytes: &[u8]) -> Vec<String> {
    let manifest: Value = serde_json::from_slice(bytes).unwrap();
    manifest["relations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|name| name.as_str().unwrap().to_owned())
        .collect()
}

fn catalogue_bound_to(
    relation_ids: impl IntoIterator<Item = String>,
    release: &[u8],
) -> ManagerCatalogue {
    let manifest: Value = serde_json::from_slice(release).unwrap();
    let revision = manifest["catalogue_sha256"].as_str().unwrap();
    let mut wire = catalogue_value(relation_ids);
    wire["catalogue_sha256"] = json!(revision);
    wire["data"]["catalogue_revision"] = json!(revision);
    let ManagerPayload::Catalogue(envelope) = decode_success_for_profile(
        &ManagerV2Request::catalogue(),
        &serde_json::to_vec(&wire).unwrap(),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected Manager catalogue")
    };
    envelope.into_data()
}

#[test]
fn the_real_paper_t2_and_t1_release_files_are_accepted_by_the_census_v2_loader() {
    let t2 = release_relations(PAPER_T2_RELEASE);
    let t1 = release_relations(PAPER_T1_RELEASE);
    assert_eq!((t2.len(), t1.len()), (54, 67));
    assert!(
        t2.iter().all(|name| t1.contains(name)),
        "T1 release keeps every T2 relation"
    );
    let added: BTreeSet<&str> = t1
        .iter()
        .filter(|name| !t2.contains(name))
        .map(String::as_str)
        .collect();
    let expected: BTreeSet<&str> = T1_RELATIONS.into_iter().collect();
    assert_eq!(
        added, expected,
        "the release adds exactly the 13 census v2 T1 relations"
    );
    for gap in SCOPE_GAP_RELATIONS {
        assert!(
            !t2.iter().chain(&t1).any(|name| name == gap),
            "{gap} must never be listed"
        );
    }

    let live = real_release(PAPER_T2_RELEASE).unwrap();
    let next = real_release(PAPER_T1_RELEASE).unwrap();
    assert_eq!(
        (
            live.approved_relation_count(),
            next.approved_relation_count()
        ),
        (54, 67)
    );

    // The whole release path: a Manager catalogue with exactly the release relations validates, a missing or
    // extra relation is drift, and a request can be built for each T1 relation (and for none outside the release).
    let catalogue = catalogue_bound_to(t1.clone(), PAPER_T1_RELEASE);
    next.validate_catalogue(&catalogue).unwrap();
    let mut short = t1.clone();
    short.pop();
    assert!(matches!(
        next.validate_catalogue(&catalogue_bound_to(short, PAPER_T1_RELEASE)),
        Err(AuthorityError::CatalogueDrift)
    ));
    let bound = next
        .bind(context(
            DeploymentEnvironment::Paper,
            PROFILE,
            DELEGATED_RESOURCE,
            RUNTIME_CONTRACT_REVISION,
        ))
        .unwrap();
    for name in T1_RELATIONS {
        assert!(bound
            .relation_page_request(&catalogue, name, None, PageLimit::default())
            .is_ok());
    }
    for gap in SCOPE_GAP_RELATIONS {
        assert!(matches!(
            bound.relation_page_request(&catalogue, gap, None, PageLimit::default()),
            Err(AuthorityError::RelationNotApproved)
        ));
    }
    // The currently deployed T2 release must not accept the T1 relations (and so is unchanged by this binary).
    let live_catalogue = catalogue_bound_to(t2, PAPER_T2_RELEASE);
    live.validate_catalogue(&live_catalogue).unwrap();
    assert!(matches!(
        live.validate_catalogue(&catalogue),
        Err(AuthorityError::CatalogueDrift)
    ));
}

#[test]
fn a_62_relation_listing_of_the_49_v1_plus_13_t1_relations_is_accepted_but_drops_the_t2_five() {
    let without_t2_five: Vec<String> = release_relations(PAPER_T1_RELEASE)
        .into_iter()
        .filter(|name| !T2_FIVE.contains(&name.as_str()))
        .collect();
    assert_eq!(without_t2_five.len(), 62);
    let release = paper_release(&without_t2_five).unwrap();
    assert_eq!(release.approved_relation_count(), 62);
    // Replacing the live 54 by this listing would remove five relations Core serves today.
    let live = release_relations(PAPER_T2_RELEASE);
    let dropped: Vec<&String> = live
        .iter()
        .filter(|name| !without_t2_five.contains(name))
        .collect();
    assert_eq!(dropped.len(), 5);
}
