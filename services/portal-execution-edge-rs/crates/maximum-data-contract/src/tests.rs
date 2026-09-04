use serde_json::{json, Value};

use super::*;
use crate::e4::{
    E4Contract, E4ContractError, E4EventCoverage, E4GoldenFixtures, EventCoverageStatus,
    FixtureState, E4_CONTRACT_MANIFEST_JSON, E4_DOMAIN_CAPABILITIES_JSON, E4_EVENT_COVERAGE_JSON,
    E4_GOLDEN_FIXTURES_JSON, E4_OPERATION_BINDINGS_JSON, E4_SOURCE_CATALOGUE_JSON,
};
use execution_contracts::DecimalString;

#[test]
fn canonical_e3_pack_covers_every_frozen_screen_surface_field_and_action() {
    let contract = MaximumDataContract::canonical().unwrap();
    assert_eq!(contract.screen_inventory.screens.len(), 23);
    assert_eq!(contract.action_coverage.actions.len(), 12);
    assert_eq!(contract.derived_metrics.metrics.len(), 10);
    assert_eq!(contract.downstream_work_orders.work_orders.len(), 14);
    assert_eq!(contract.state_fixtures.fixtures.len(), 8);
    assert_eq!(contract.e3_manifest.status, "COMPLETE");
    assert_eq!(
        contract
            .e3_manifest
            .counts
            .unmapped_required_frontend_fields,
        0
    );
    assert_eq!(contract.e3_manifest.counts.unmapped_execution_actions, 0);
    assert!(contract.coverage_rows().unwrap().len() >= 80);
    assert_eq!(contract.source_bound_page_limit(), 200);
    assert_eq!(contract.source_bound_response_bytes(), 1_048_576);
}

#[test]
fn every_required_field_and_action_is_mapped_without_placeholder_or_generic_access() {
    let contract = MaximumDataContract::canonical().unwrap();
    let rows = contract.coverage_rows().unwrap();
    assert!(rows
        .iter()
        .filter(|row| row.field.required_or_optional == Requiredness::Required)
        .all(|row| !row.field.source_relation_or_operation.contains("SELECT ")));
    assert!(rows.iter().all(|row| {
        !row.field
            .source_relation_or_operation
            .contains("postgres://")
            && !row.field.source_relation_or_operation.contains("redis://")
            && !row.field.source_relation_or_operation.contains('*')
            && !row
                .field
                .visible_meaning
                .to_ascii_uppercase()
                .contains("TBD")
    }));
    assert!(contract
        .action_coverage
        .actions
        .iter()
        .all(|action| !action.plan_apply_verify_contract.contains("SELECT ")));
}

#[test]
fn no_trading_system_command_is_misrepresented_as_an_active_read_mapping() {
    let contract = MaximumDataContract::canonical().unwrap();
    assert!(contract.action_coverage.actions.iter().all(|action| {
        action.action_kind != ActionKind::TradingSystemCommand
            || action.current_availability != ActionAvailability::Available
    }));
}

#[test]
fn blank_owner_unknown_field_and_unqualified_direct_delivery_fail_closed() {
    let canonical = MaximumDataContract::canonical().unwrap();

    let mut blank_owner: Value = serde_json::from_str(E3_FIELD_DEFINITIONS_JSON).unwrap();
    blank_owner["fields"][0]["owner"] = json!("");
    let blank_owner_contract = MaximumDataContract {
        field_definitions: serde_json::from_value(blank_owner).unwrap(),
        ..canonical.clone()
    };
    assert_eq!(
        blank_owner_contract.validate(),
        Err(ContractError::InvalidField)
    );

    let mut unknown_field: Value = serde_json::from_str(E3_SCREEN_BINDINGS_JSON).unwrap();
    unknown_field["bindings"][0]["field_ids"][0] = json!("unknown_field");
    let unknown_field_contract = MaximumDataContract {
        screen_bindings: serde_json::from_value(unknown_field).unwrap(),
        ..canonical.clone()
    };
    assert_eq!(
        unknown_field_contract.validate(),
        Err(ContractError::UnknownReference)
    );

    let mut unqualified_direct: Value = serde_json::from_str(E3_FIELD_DEFINITIONS_JSON).unwrap();
    unqualified_direct["fields"][4]["delivery_class"] = json!("AVAILABLE_DIRECT");
    let unqualified_direct_contract = MaximumDataContract {
        field_definitions: serde_json::from_value(unqualified_direct).unwrap(),
        ..canonical
    };
    assert_eq!(
        unqualified_direct_contract.validate(),
        Err(ContractError::InvalidDelivery)
    );

    let mut tampered_manifest: Value = serde_json::from_str(E3_COVERAGE_MANIFEST_JSON).unwrap();
    tampered_manifest["counts"]["unmapped_execution_actions"] = json!(1);
    let tampered_manifest_contract = MaximumDataContract {
        e3_manifest: serde_json::from_value(tampered_manifest).unwrap(),
        ..MaximumDataContract::canonical().unwrap()
    };
    assert_eq!(
        tampered_manifest_contract.validate(),
        Err(ContractError::InvalidIdentity)
    );
}

#[test]
fn csv_is_deterministic_and_preserves_required_machine_columns() {
    let contract = MaximumDataContract::canonical().unwrap();
    let screen_csv = contract.render_screen_field_csv().unwrap();
    let action_csv = contract.render_action_csv().unwrap();
    let metric_csv = contract.render_derived_metric_csv().unwrap();
    let work_order_csv = contract.render_downstream_work_orders_csv().unwrap();
    assert!(screen_csv.starts_with("screen_id,panel_id,frontend_field_path,"));
    assert!(screen_csv.contains("OWNER_ACTION_REQUIRED"));
    assert!(screen_csv.contains("EXISTS_BUT_NOT_SAFE_TO_EXPOSE"));
    assert!(action_csv.starts_with("screen_id,action_id,capability_id,"));
    assert!(metric_csv.starts_with("metric_id,target_field_id,authoritative_inputs,"));
    assert!(work_order_csv.starts_with("work_order_id,field_ids,source_operation,"));
    assert_eq!(screen_csv, contract.render_screen_field_csv().unwrap());
    assert_eq!(action_csv, contract.render_action_csv().unwrap());
    assert_eq!(metric_csv, contract.render_derived_metric_csv().unwrap());
    assert_eq!(
        work_order_csv,
        contract.render_downstream_work_orders_csv().unwrap()
    );
    assert_eq!(screen_csv, E3_SCREEN_FIELD_CSV);
    assert_eq!(action_csv, E3_ACTION_CSV);
    assert_eq!(metric_csv, E3_DERIVED_METRIC_CSV);
    assert_eq!(work_order_csv, E3_DOWNSTREAM_WORK_ORDERS_CSV);
}

#[test]
fn canonical_e4_pack_binds_every_e3_field_and_every_required_event_kind() {
    let contract = E4Contract::canonical().unwrap();
    assert_eq!(contract.source_catalogue.sources.len(), 6);
    assert_eq!(contract.domain_capabilities.domains.len(), 11);
    assert_eq!(contract.operation_bindings.bindings.len(), 34);
    assert_eq!(contract.event_coverage.coverage.len(), 36);
    assert_eq!(contract.golden_fixtures.fixtures.len(), 8);
    assert_eq!(contract.manifest.status, "COMPLETE");
    assert!(contract
        .event_coverage
        .coverage
        .iter()
        .all(|entry| !entry.replay_eligible && entry.status != EventCoverageStatus::Available));
    assert!(contract.e4_asset_digests().len() == 12);
    assert_eq!(manager_v2_contract::MAXIMUM_PAGE_ROWS, 200);
    assert_eq!(manager_v2_contract::MAXIMUM_RESPONSE_BYTES, 1_048_576);
}

#[test]
fn e4_epoch_and_exact_decimal_reject_float_string_scale_and_currency_drift() {
    let epoch: UtcEpochMs = serde_json::from_str("1760000000123").unwrap();
    assert_eq!(epoch.value(), 1_760_000_000_123);
    assert!(serde_json::from_str::<UtcEpochMs>("\"1760000000123\"").is_err());
    assert!(serde_json::from_str::<UtcEpochMs>("1760000000123.0").is_err());

    let decimal: ExactDecimal =
        serde_json::from_str(r#"{"value":"123.45000000","currency":"USDT","scale":8}"#).unwrap();
    assert_eq!(decimal.value, DecimalString::parse("123.45000000").unwrap());
    assert!(serde_json::from_str::<ExactDecimal>(
        r#"{"value":123.45,"currency":"USDT","scale":2}"#
    )
    .is_err());
    assert!(serde_json::from_str::<ExactDecimal>(
        r#"{"value":"123.45","currency":"usdt","scale":2}"#
    )
    .is_err());
    assert!(serde_json::from_str::<ExactDecimal>(
        r#"{"value":"123.4500","currency":"USDT","scale":2}"#
    )
    .is_err());
    assert!(serde_json::from_str::<OpaqueContinuation>(r#"{"token":" "}"#).is_err());
    assert!(serde_json::from_value::<OpaqueContinuation>(json!({
        "token": "x".repeat(manager_v2_contract::MAXIMUM_OPAQUE_TOKEN_BYTES + 1)
    }))
    .is_err());
}

#[test]
fn e4_fails_closed_for_cursor_lineage_timestamp_and_event_replay_invention() {
    let canonical = E4Contract::canonical().unwrap();

    let mut cursor_fixture: Value = serde_json::from_str(E4_GOLDEN_FIXTURES_JSON).unwrap();
    cursor_fixture["fixtures"][0]["envelope"]["page"]["next_cursor"] =
        json!({"token": "misbound-cursor"});
    let cursor_contract = E4Contract {
        golden_fixtures: serde_json::from_value(cursor_fixture).unwrap(),
        ..canonical.clone()
    };
    assert_eq!(
        cursor_contract.validate(),
        Err(E4ContractError::InvalidContinuation)
    );

    let mut raw_float_epoch: Value = serde_json::from_str(E4_GOLDEN_FIXTURES_JSON).unwrap();
    raw_float_epoch["fixtures"][0]["envelope"]["source_health"]["observed_at_ms"] =
        json!(1_760_000_000_123.0);
    assert!(serde_json::from_value::<E4GoldenFixtures>(raw_float_epoch).is_err());

    let mut missing_profile: Value = serde_json::from_str(E4_GOLDEN_FIXTURES_JSON).unwrap();
    missing_profile["fixtures"][0]["envelope"]["lineage"]["profile_id"] = json!("");
    assert!(serde_json::from_value::<E4GoldenFixtures>(missing_profile).is_err());

    let mut invented_replay: Value = serde_json::from_str(E4_EVENT_COVERAGE_JSON).unwrap();
    invented_replay["coverage"][0]["status"] = json!("AVAILABLE");
    invented_replay["coverage"][0]["replay_eligible"] = json!(true);
    let replay_contract = E4Contract {
        event_coverage: serde_json::from_value::<E4EventCoverage>(invented_replay).unwrap(),
        ..canonical
    };
    assert_eq!(
        replay_contract.validate(),
        Err(E4ContractError::InvalidCoverage)
    );
}

#[test]
fn e4_fixture_states_are_explicit_and_never_masquerade_as_a_v4_route() {
    let contract = E4Contract::canonical().unwrap();
    let states = contract
        .golden_fixtures
        .fixtures
        .iter()
        .map(|fixture| fixture.state)
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(states.len(), 8);
    assert!(states.contains(&FixtureState::Populated));
    assert!(states.contains(&FixtureState::Continuation));
    for asset in [
        E4_SOURCE_CATALOGUE_JSON,
        E4_DOMAIN_CAPABILITIES_JSON,
        E4_OPERATION_BINDINGS_JSON,
        E4_EVENT_COVERAGE_JSON,
        E4_GOLDEN_FIXTURES_JSON,
        E4_CONTRACT_MANIFEST_JSON,
    ] {
        assert!(!asset.contains("/portal/execution/v4"));
        assert!(!asset.contains("postgres://"));
        assert!(!asset.contains("SELECT "));
    }
}
