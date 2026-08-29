use serde_json::{json, Value};

use super::*;
use manager_v2_contract::{decode_success_for_profile, ManagerPayload, ManagerV2Request};

const DIGEST: &str = "sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44";

fn relation(name: &str) -> Value {
    json!({
        "id": {"schema": "public", "relation": name},
        "kind": "TABLE",
        "safe_columns": [{"name": "id", "ordinal": 1, "data_type": "bigint", "nullable": false}],
        "secret_cell_excluded_column_count": 0,
        "key": {"status": "PRIMARY_KEY", "name": null, "columns": ["id"]},
        "profile_classification": "FIXED_PROFILE_CONTEXT",
        "profile_columns": [],
        "query_status": "QUALIFIED_TS_OC_03D1"
    })
}

fn catalogue(map: &CurrentSourceMap, omit: Option<&str>) -> ManagerCatalogue {
    let names = map
        .source_bindings
        .iter()
        .filter(|binding| binding.adapter == AdapterKind::ManagerV2)
        .flat_map(|binding| binding.relations.iter())
        .map(|relation| relation.split_once('.').unwrap().1)
        .filter(|name| Some(*name) != omit)
        .collect::<BTreeSet<_>>();
    let relations = names.iter().map(|name| relation(name)).collect::<Vec<_>>();
    let body = json!({
        "contract_version": manager_v2_contract::RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": "PAPER_BINANCE_USDM",
        "catalogue_sha256": DIGEST,
        "availability": "AVAILABLE",
        "freshness": "FRESH",
        "completeness": "COMPLETE",
        "trace_id": "n13b-current-source-test",
        "as_of": "2026-08-29T00:00:00Z",
        "data": {
            "catalogue_revision": DIGEST,
            "relation_count": relations.len(),
            "relations": relations
        }
    });
    let ManagerPayload::Catalogue(envelope) = decode_success_for_profile(
        &ManagerV2Request::catalogue(),
        &serde_json::to_vec(&body).unwrap(),
        "PAPER_BINANCE_USDM",
    )
    .unwrap() else {
        panic!("expected catalogue");
    };
    envelope.into_data()
}

#[test]
fn canonical_map_is_complete_pinned_and_source_as_is() {
    let map = CurrentSourceMap::canonical().unwrap();
    assert_eq!(map.screens.len(), REQUIRED_SCREENS.len());
    assert_eq!(map.profiles.len(), 4);
    assert!(map.capabilities.len() >= 24);
    assert!(map.capabilities.iter().any(|item| item.id == "market.ticks"
        && item.classification == FactClassification::SupportedButNotActivated));
    assert!(map
        .capabilities
        .iter()
        .any(|item| item.id == "venues.calendar"
            && item.classification == FactClassification::SourceDoesNotCurrentlyExist));
}

#[test]
fn every_current_manager_relation_must_exist_in_the_authenticated_catalogue() {
    let map = CurrentSourceMap::canonical().unwrap();
    map.validate_manager_catalogue(&catalogue(&map, None))
        .unwrap();
    assert_eq!(
        map.validate_manager_catalogue(&catalogue(&map, Some("orders"))),
        Err(MappingError::ManagerRelationMissing(
            "public.orders".to_owned()
        ))
    );
}

#[test]
fn canary_is_never_a_fourth_trading_system_source_profile() {
    let map = CurrentSourceMap::canonical().unwrap();
    assert!(map
        .source_bindings
        .iter()
        .all(|source| !source.profiles.contains(&ExecutionProfile::Canary)));
    let canary = map
        .profiles
        .iter()
        .find(|profile| profile.profile == ExecutionProfile::Canary)
        .unwrap();
    assert_eq!(canary.source_profile, ExecutionProfile::Live);
}

#[test]
fn n13b_never_activates_a_command_by_inventory() {
    let map = CurrentSourceMap::canonical().unwrap();
    assert!(map
        .capabilities
        .iter()
        .filter(|capability| capability.kind == CapabilityKind::Action)
        .all(
            |capability| capability.classification == FactClassification::SupportedButNotActivated
        ));
}

#[test]
fn screen_resolution_cannot_be_used_as_a_generic_relation_api() {
    let map = CurrentSourceMap::canonical().unwrap();
    assert_eq!(
        map.screen("EXECUTION_FULL_BLOTTER_SCREEN").unwrap().views,
        ["FullBlotter"]
    );
    assert_eq!(
        map.screen("public.orders"),
        Err(MappingError::UnknownScreen)
    );
    assert_eq!(
        map.screen_source("EXECUTION_FULL_BLOTTER_SCREEN", "manager.orders")
            .unwrap()
            .relations,
        ["public.orders"]
    );
    assert_eq!(
        map.screen_source("EXECUTION_APPROVAL_INBOX_SCREEN", "manager.orders"),
        Err(MappingError::UnknownReference)
    );
}

#[test]
fn unknown_fields_and_unsafe_relations_fail_closed() {
    let mut raw: Value = serde_json::from_str(CANONICAL_MAP_JSON).unwrap();
    raw["unexpected"] = json!(true);
    assert!(serde_json::from_value::<CurrentSourceMap>(raw).is_err());

    let mut map = CurrentSourceMap::canonical().unwrap();
    map.source_bindings[0].relations = vec!["public.*".to_owned()];
    assert_eq!(map.validate(), Err(MappingError::UnsafeSourceBinding));
}
