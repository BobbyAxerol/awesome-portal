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
