use serde_json::{json, Value};

use super::*;

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
