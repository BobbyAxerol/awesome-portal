use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, ManagerV2Request, PageLimit, ProjectionKind,
    RUNTIME_CONTRACT_REVISION,
};
use serde_json::{json, Value};

use super::*;

const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PROFILE: &str = "PAPER_BINANCE_USDM";

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
    assert_eq!(authority.approved_relation_count(), 96);
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
fn all_ninety_six_relations_build_only_catalogue_bound_get_blueprints() {
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

const ALT_DIGEST: &str = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

fn identity_member(name: &str, oid: &str, count: u64) -> Value {
    json!({
        "database_name": name,
        "database_oid_sha256": oid,
        "schema_migration_count": count
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
        "database_oid_sha256": DIGEST,
        "minimum_schema_migration_count": 173
    })
}

fn pinned_authority(pin: &Value) -> Result<ManagerCompatibilityAuthority, AuthorityError> {
    let bytes = serde_json::to_vec(pin).unwrap();
    let pin_digest = digest(&bytes);
    let environment = DeploymentEnvironment::Paper;
    let authority = ManagerCompatibilityAuthority::canonical()?;
    authority.with_source_identity_pin(&bytes, &pin_digest, environment, PROFILE)
}

#[test]
fn unpinned_profile_is_not_identity_checked() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let foreign = identity_member("any_database", ALT_DIGEST, 1);
    for identity in [None, Some(foreign)] {
        let catalogue = catalogue_with_identity(identity);
        authority
            .validate_source_identity(PROFILE, &catalogue)
            .unwrap();
    }
}

#[test]
fn pinned_exact_identity_and_a_higher_ledger_count_pass() {
    let authority = pinned_authority(&pin_value(true)).unwrap();
    for count in [173, 174, 1_000] {
        let member = identity_member("trading_system", DIGEST, count);
        let catalogue = catalogue_with_identity(Some(member));
        authority
            .validate_source_identity(PROFILE, &catalogue)
            .unwrap();
    }
}

#[test]
fn pinned_name_oid_hash_or_lower_ledger_count_mismatch_is_typed_and_fail_closed() {
    let authority = pinned_authority(&pin_value(true)).unwrap();
    for member in [
        identity_member("trading_system_sandbox", DIGEST, 173),
        identity_member("live_data_executor", DIGEST, 173),
        identity_member("trading_system", ALT_DIGEST, 173),
        identity_member("trading_system", DIGEST, 172),
        identity_member("trading_system", DIGEST, 0),
    ] {
        let catalogue = catalogue_with_identity(Some(member));
        assert!(matches!(
            authority.validate_source_identity(PROFILE, &catalogue),
            Err(AuthorityError::SourceDbIdentityMismatch)
        ));
    }
    assert_eq!(
        SOURCE_DB_IDENTITY_MISMATCH_CODE,
        "MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH"
    );
}

#[test]
fn an_absent_identity_is_refused_unless_the_pin_explicitly_allows_a_legacy_manager() {
    let strict = pinned_authority(&pin_value(true)).unwrap();
    let legacy_allowed = pinned_authority(&pin_value(false)).unwrap();
    let absent = catalogue_with_identity(None);
    assert!(matches!(
        strict.validate_source_identity(PROFILE, &absent),
        Err(AuthorityError::SourceDbIdentityMismatch)
    ));
    legacy_allowed
        .validate_source_identity(PROFILE, &absent)
        .unwrap();
    // A Manager that does send an identity must still match, even when legacy is allowed.
    let member = identity_member("trading_system", ALT_DIGEST, 173);
    let wrong = catalogue_with_identity(Some(member));
    assert!(matches!(
        legacy_allowed.validate_source_identity(PROFILE, &wrong),
        Err(AuthorityError::SourceDbIdentityMismatch)
    ));
}

#[test]
fn identity_pin_loading_rejects_unpinned_malformed_or_mis_bound_input() {
    let mut without_requirement = pin_value(true);
    without_requirement
        .as_object_mut()
        .unwrap()
        .remove("source_identity_required");
    let mut extra_member = pin_value(true);
    extra_member["system_identifier"] = json!("raw");
    let mut bad_oid = pin_value(true);
    bad_oid["database_oid_sha256"] = json!("not-a-digest");
    let mut empty_name = pin_value(true);
    empty_name["database_name"] = json!("");
    let mut wrong_environment = pin_value(true);
    wrong_environment["environment"] = json!("live");
    let mut wrong_profile = pin_value(true);
    wrong_profile["profile_id"] = json!("SANDBOX_BINANCE_USDM");
    let mut wrong_schema = pin_value(true);
    wrong_schema["schema_version"] = json!("unknown.v1");
    for pin in [
        without_requirement,
        extra_member,
        bad_oid,
        empty_name,
        wrong_environment,
        wrong_profile,
        wrong_schema,
    ] {
        assert!(matches!(
            pinned_authority(&pin),
            Err(AuthorityError::InvalidSourceIdentityPin)
        ));
    }
    let bytes = serde_json::to_vec(&pin_value(true)).unwrap();
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    assert!(matches!(
        authority.with_source_identity_pin(
            &bytes,
            ALT_DIGEST,
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
    let good_member = identity_member("trading_system", DIGEST, 173);
    let wrong_member = identity_member("live_data_executor", DIGEST, 149);
    let good = catalogue_with_identity(Some(good_member));
    let wrong = catalogue_with_identity(Some(wrong_member));
    let relation_id = authority.approved_relations.iter().next().unwrap().clone();
    bound.validate_catalogue(&good).unwrap();
    bound
        .relation_page_request(&good, &relation_id, None, PageLimit::default())
        .unwrap();
    assert!(matches!(
        bound.validate_catalogue(&wrong),
        Err(AuthorityError::SourceDbIdentityMismatch)
    ));
    assert!(matches!(
        bound.relation_page_request(&wrong, &relation_id, None, PageLimit::default()),
        Err(AuthorityError::SourceDbIdentityMismatch)
    ));
    assert!(matches!(
        bound.projection_request(&wrong, ProjectionKind::Order, None, PageLimit::default()),
        Err(AuthorityError::SourceDbIdentityMismatch)
    ));
}
