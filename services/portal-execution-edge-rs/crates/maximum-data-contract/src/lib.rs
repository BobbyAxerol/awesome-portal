#![forbid(unsafe_code)]

//! Frozen E3 source coverage for the Portal Execution maximum-data return
//! pack. This crate is contract-only: it owns neither a database connection
//! nor a listener, route, credential, cache or command port.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const E3_SCREEN_INVENTORY_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-screen-inventory.v1.json"
));
pub const E3_FIELD_DEFINITIONS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-field-definitions.v1.json"
));
pub const E3_SCREEN_BINDINGS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-screen-bindings.v1.json"
));
pub const E3_ACTION_COVERAGE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-action-capability-coverage.v1.json"
));
pub const E3_DERIVED_METRICS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-derived-metric-feasibility.v1.json"
));
pub const E3_DOWNSTREAM_WORK_ORDERS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-portal-downstream-work-orders.v1.json"
));
pub const E3_STATE_FIXTURES_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-state-fixtures.v1.json"
));
pub const E3_COVERAGE_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e3-coverage.manifest.json"
));
pub const E3_SCREEN_FIELD_CSV: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/SCREEN_FIELD_SOURCE_COVERAGE.csv"
));
pub const E3_ACTION_CSV: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/ACTION_CAPABILITY_COVERAGE.csv"
));
pub const E3_DERIVED_METRIC_CSV: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/DERIVED_METRIC_FEASIBILITY.csv"
));
pub const E3_DOWNSTREAM_WORK_ORDERS_CSV: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/PORTAL_DOWNSTREAM_WORK_ORDERS.csv"
));

pub const E3_SCREEN_INVENTORY_VERSION: &str =
    "portal.execution.maximum-data.e3-screen-inventory.v1";
pub const E3_FIELD_DEFINITIONS_VERSION: &str =
    "portal.execution.maximum-data.e3-field-definitions.v1";
pub const E3_SCREEN_BINDINGS_VERSION: &str = "portal.execution.maximum-data.e3-screen-bindings.v1";
pub const E3_ACTION_COVERAGE_VERSION: &str =
    "portal.execution.maximum-data.e3-action-capability-coverage.v1";
pub const E3_DERIVED_METRICS_VERSION: &str =
    "portal.execution.maximum-data.e3-derived-metric-feasibility.v1";
pub const E3_DOWNSTREAM_WORK_ORDERS_VERSION: &str =
    "portal.execution.maximum-data.e3-portal-downstream-work-orders.v1";
pub const E3_STATE_FIXTURES_VERSION: &str = "portal.execution.maximum-data.e3-state-fixtures.v1";
pub const E3_COVERAGE_MANIFEST_VERSION: &str =
    "portal.execution.maximum-data.e3-coverage-manifest.v1";
pub const E2_SEMANTIC_REGISTRY_SHA256: &str =
    "sha256:c1886540c91e8e96219a12684e0b42651a061236128ab92f51442d0f56493477";
pub const E2_SEMANTIC_CONTRACT_SHA256: &str =
    "sha256:fa93683ed7c7cf1298b6e6943e93383a707f3beefe377df745fd909884f6dcac";
pub const E2_POSITIVE_AUDIT_MANIFEST_SHA256: &str =
    "sha256:b2fd7f9e60d28d01279f2283c62028beaeb166a1eb95291388059a80cb46d94b";

const EXPECTED_SCREEN_IDS: [&str; 23] = [
    "PAPER_TRADING_SCREEN",
    "SANDBOX_TRADING_SCREEN",
    "LIVE_OPERATIONS_SCREEN",
    "EXECUTION_COMMAND_CENTER_SCREEN",
    "EXECUTION_OPERATIONS_QUEUE_SCREEN",
    "EXECUTION_INCIDENT_DETAIL_SCREEN",
    "EXECUTION_APPROVAL_INBOX_SCREEN",
    "EXECUTION_GATE_R1_REVIEW_SCREEN",
    "EXECUTION_GATE_R2_REVIEW_SCREEN",
    "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_SCREEN",
    "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
    "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
    "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
    "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
    "EXECUTION_FULL_BLOTTER_SCREEN",
    "EXECUTION_ALPHA_360_SCREEN",
    "EXECUTION_PORTFOLIO_360_SCREEN",
    "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
    "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
    "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
    "EXECUTION_WAIVERS_REGISTER_SCREEN",
];

const REQUIRED_SURFACES: [&str; 22] = [
    "shell_registry",
    "approval_inbox",
    "gate_r1",
    "gate_r2",
    "conditions_waivers",
    "paper_overview",
    "paper_workbench",
    "paper_exit_review",
    "full_blotter",
    "alpha_fleet",
    "alpha_360",
    "portfolio_360",
    "account_360",
    "accounts_and_bindings",
    "sandbox_execution_loop",
    "canary_execution_loop",
    "live_execution_loop",
    "operations_queue",
    "incident_detail",
    "command_center",
    "trade_replay",
    "vnm_execution_workbench",
];

const REQUIRED_FIXTURE_STATES: [E3FixtureState; 8] = [
    E3FixtureState::Populated,
    E3FixtureState::Empty,
    E3FixtureState::Partial,
    E3FixtureState::Stale,
    E3FixtureState::Gap,
    E3FixtureState::Duplicate,
    E3FixtureState::Correction,
    E3FixtureState::NextPage,
];

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ContractError {
    #[error("invalid JSON in {0}")]
    InvalidJson(&'static str),
    #[error("E3 contract version or source-semantic pin drifted")]
    InvalidIdentity,
    #[error("E3 screen or surface inventory is incomplete or duplicate")]
    InvalidInventory,
    #[error("E3 contract has blank, placeholder or malformed data")]
    InvalidField,
    #[error("E3 contract references an unknown screen, field or capability")]
    UnknownReference,
    #[error("a required E3 field has no source mapping")]
    UnmappedRequiredField,
    #[error("an execution action has no typed coverage")]
    UnmappedAction,
    #[error("a direct/derived status violates the E3 source boundary")]
    InvalidDelivery,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenInventory {
    pub schema_version: String,
    pub screen_catalogue_contract: String,
    pub e2_semantic_registry_sha256: String,
    pub e2_semantic_contract_sha256: String,
    pub screens: Vec<ScreenDefinition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenDefinition {
    pub screen_id: String,
    pub operation_id: String,
    pub response_contract: String,
    pub read_capabilities: Vec<String>,
    pub required_surfaces: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FieldDefinitions {
    pub schema_version: String,
    pub fields: Vec<FieldDefinition>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Requiredness {
    Required,
    Optional,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeliveryClass {
    AvailableDirect,
    AvailableDerivedAtEdge,
    AvailableDerivedAtPortal,
    ExistsNotPublished,
    ExistsButSemanticsUnresolved,
    ExistsButNotSafeToExpose,
    SourceDoesNotExist,
    OwnerActionRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FieldDefinition {
    pub field_id: String,
    pub capability_id: String,
    pub panel_id: String,
    pub frontend_field_path: String,
    pub visible_meaning: String,
    pub required_or_optional: Requiredness,
    pub source_system: String,
    pub source_relation_or_operation: String,
    pub source_columns: Vec<String>,
    pub primary_resource_key: String,
    pub join_path: String,
    pub authority: String,
    pub mutability: String,
    pub delivery_class: DeliveryClass,
    pub history_requirement: String,
    pub freshness_requirement: String,
    pub formula_id: String,
    pub formula_version: String,
    pub currency_policy: String,
    pub timestamp_policy: String,
    pub edge_operation: String,
    pub portal_derivation_allowed: bool,
    pub current_status: String,
    pub missing_reason: String,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenBindings {
    pub schema_version: String,
    pub bindings: Vec<ScreenBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenBinding {
    pub screen_id: String,
    pub field_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ActionCoverage {
    pub schema_version: String,
    pub actions: Vec<ActionDefinition>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActionKind {
    PortalWorkflow,
    TradingSystemCommand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ActionAvailability {
    Available,
    Disabled,
    ExistsNotPublished,
    OwnerActionRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ActionDefinition {
    pub screen_id: String,
    pub action_id: String,
    pub capability_id: String,
    pub action_kind: ActionKind,
    pub required_resource_identity: Vec<String>,
    pub source_preconditions: Vec<String>,
    pub current_availability: ActionAvailability,
    pub disabled_reason: String,
    pub plan_apply_verify_contract: String,
    pub terminal_evidence_target: String,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DerivedMetricFeasibility {
    pub schema_version: String,
    pub metrics: Vec<DerivedMetric>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DerivedMetric {
    pub metric_id: String,
    pub target_field_id: String,
    pub authoritative_inputs: Vec<String>,
    pub formula_id: String,
    pub formula_version: String,
    pub delivery_class: DeliveryClass,
    pub current_status: String,
    pub feasibility_reason: String,
    pub required_next_action: String,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DownstreamWorkOrders {
    pub schema_version: String,
    pub work_orders: Vec<DownstreamWorkOrder>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DownstreamWorkOrder {
    pub work_order_id: String,
    pub field_ids: Vec<String>,
    pub source_operation: String,
    pub resource_identity: String,
    pub continuation_policy: String,
    pub portal_storage_reducer: String,
    pub empty_stale_gap_semantics: String,
    pub delivery_class: DeliveryClass,
    pub required_next_action: String,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3StateFixtures {
    pub schema_version: String,
    pub fixtures: Vec<E3StateFixture>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum E3FixtureState {
    Populated,
    Empty,
    Partial,
    Stale,
    Gap,
    Duplicate,
    Correction,
    NextPage,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3StateFixture {
    pub fixture_id: String,
    pub state: E3FixtureState,
    pub screen_id: String,
    pub field_id: String,
    pub expected_delivery_class: DeliveryClass,
    pub expected_source_status: String,
    pub expected_consumer_semantics: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3CoverageManifest {
    pub schema_version: String,
    pub phase: String,
    pub status: String,
    pub source_evidence: E3SourceEvidence,
    pub upstream_manager_bounds: E3ManagerBounds,
    pub counts: E3Counts,
    pub runtime_mutations: E3RuntimeMutations,
    pub files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3SourceEvidence {
    pub e2_positive_semantic_audit_manifest_sha256: String,
    pub e2_semantic_registry_sha256: String,
    pub e2_semantic_contract_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3ManagerBounds {
    pub maximum_page_rows: u16,
    pub maximum_response_bytes: usize,
    pub contract_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3Counts {
    pub frozen_screen_count: usize,
    pub required_surface_count: usize,
    pub field_definition_count: usize,
    pub screen_field_mapping_count: usize,
    pub action_coverage_count: usize,
    pub derived_metric_count: usize,
    pub downstream_work_order_count: usize,
    pub state_fixture_count: usize,
    pub unmapped_required_frontend_fields: u16,
    pub unmapped_execution_actions: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E3RuntimeMutations {
    pub database: RuntimeMutationStatus,
    pub source_identity: RuntimeMutationStatus,
    pub route: RuntimeMutationStatus,
    pub listener: RuntimeMutationStatus,
    pub projection_or_cache: RuntimeMutationStatus,
    pub command_port: RuntimeMutationStatus,
    pub deployment: RuntimeMutationStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RuntimeMutationStatus {
    NotApplied,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MaximumDataContract {
    pub screen_inventory: ScreenInventory,
    pub field_definitions: FieldDefinitions,
    pub screen_bindings: ScreenBindings,
    pub action_coverage: ActionCoverage,
    pub derived_metrics: DerivedMetricFeasibility,
    pub downstream_work_orders: DownstreamWorkOrders,
    pub state_fixtures: E3StateFixtures,
    pub e3_manifest: E3CoverageManifest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CoverageRow<'a> {
    pub screen_id: &'a str,
    pub field: &'a FieldDefinition,
}

impl MaximumDataContract {
    /// Parses and validates the repository-pinned E3 mapping pack.
    ///
    /// # Errors
    /// Returns [`ContractError`] when inventory, identity, source coverage or
    /// action boundaries drift.
    pub fn canonical() -> Result<Self, ContractError> {
        let contract = Self {
            screen_inventory: decode(E3_SCREEN_INVENTORY_JSON, "e3-screen-inventory")?,
            field_definitions: decode(E3_FIELD_DEFINITIONS_JSON, "e3-field-definitions")?,
            screen_bindings: decode(E3_SCREEN_BINDINGS_JSON, "e3-screen-bindings")?,
            action_coverage: decode(E3_ACTION_COVERAGE_JSON, "e3-action-coverage")?,
            derived_metrics: decode(E3_DERIVED_METRICS_JSON, "e3-derived-metrics")?,
            downstream_work_orders: decode(
                E3_DOWNSTREAM_WORK_ORDERS_JSON,
                "e3-downstream-work-orders",
            )?,
            state_fixtures: decode(E3_STATE_FIXTURES_JSON, "e3-state-fixtures")?,
            e3_manifest: decode(E3_COVERAGE_MANIFEST_JSON, "e3-coverage-manifest")?,
        };
        contract.validate()?;
        Ok(contract)
    }

    /// Validates the no-generic-read, source-accurate E3 contract boundary.
    ///
    /// # Errors
    /// Returns [`ContractError`] when a field/action is unmapped, a source is
    /// unsafe, a placeholder leaks in, or a screen catalogue drift is found.
    pub fn validate(&self) -> Result<(), ContractError> {
        self.validate_identity()?;
        let screens = self.validate_screens()?;
        let fields = self.validate_fields()?;
        self.validate_bindings(&screens, &fields)?;
        self.validate_actions(&screens)?;
        self.validate_metrics(&fields)?;
        self.validate_work_orders(&fields)?;
        self.validate_state_fixtures(&screens, &fields)?;
        self.validate_manifest()?;
        Ok(())
    }

    /// Returns every expanded field-level mapping in deterministic order.
    ///
    /// # Errors
    /// Returns [`ContractError`] when the underlying contract is invalid.
    pub fn coverage_rows(&self) -> Result<Vec<CoverageRow<'_>>, ContractError> {
        self.validate()?;
        let field_by_id = self
            .field_definitions
            .fields
            .iter()
            .map(|field| (field.field_id.as_str(), field))
            .collect::<BTreeMap<_, _>>();
        let mut rows = Vec::new();
        for binding in &self.screen_bindings.bindings {
            for field_id in &binding.field_ids {
                let field = field_by_id
                    .get(field_id.as_str())
                    .ok_or(ContractError::UnknownReference)?;
                rows.push(CoverageRow {
                    screen_id: binding.screen_id.as_str(),
                    field,
                });
            }
        }
        rows.sort_by(|left, right| {
            (
                left.screen_id,
                left.field.panel_id.as_str(),
                left.field.frontend_field_path.as_str(),
            )
                .cmp(&(
                    right.screen_id,
                    right.field.panel_id.as_str(),
                    right.field.frontend_field_path.as_str(),
                ))
        });
        Ok(rows)
    }

    /// Renders the required E3 screen/field CSV without loading business rows.
    ///
    /// # Errors
    /// Returns [`ContractError`] when a mapping no longer validates.
    pub fn render_screen_field_csv(&self) -> Result<String, ContractError> {
        let mut result = String::from(
            "screen_id,panel_id,frontend_field_path,visible_meaning,required_or_optional,source_system,source_relation_or_operation,source_columns,primary_resource_key,join_path,authority,mutability,delivery_class,history_requirement,freshness_requirement,formula_id,formula_version,currency_policy,timestamp_policy,edge_operation,portal_derivation_allowed,current_status,missing_reason,owner,capability_id\n",
        );
        for row in self.coverage_rows()? {
            let field = row.field;
            append_csv_row(
                &mut result,
                &[
                    row.screen_id.to_owned(),
                    field.panel_id.clone(),
                    field.frontend_field_path.clone(),
                    field.visible_meaning.clone(),
                    requiredness_name(field.required_or_optional).to_owned(),
                    field.source_system.clone(),
                    field.source_relation_or_operation.clone(),
                    field.source_columns.join("|"),
                    field.primary_resource_key.clone(),
                    field.join_path.clone(),
                    field.authority.clone(),
                    field.mutability.clone(),
                    delivery_class_name(field.delivery_class).to_owned(),
                    field.history_requirement.clone(),
                    field.freshness_requirement.clone(),
                    field.formula_id.clone(),
                    field.formula_version.clone(),
                    field.currency_policy.clone(),
                    field.timestamp_policy.clone(),
                    field.edge_operation.clone(),
                    field.portal_derivation_allowed.to_string(),
                    field.current_status.clone(),
                    field.missing_reason.clone(),
                    field.owner.clone(),
                    field.capability_id.clone(),
                ],
            );
        }
        Ok(result)
    }

    /// Renders the required E3 action CSV without exposing a command port.
    ///
    /// # Errors
    /// Returns [`ContractError`] when the action inventory no longer validates.
    pub fn render_action_csv(&self) -> Result<String, ContractError> {
        self.validate()?;
        let mut actions = self.action_coverage.actions.iter().collect::<Vec<_>>();
        actions.sort_by(|left, right| {
            (left.screen_id.as_str(), left.action_id.as_str())
                .cmp(&(right.screen_id.as_str(), right.action_id.as_str()))
        });
        let mut result = String::from(
            "screen_id,action_id,capability_id,action_kind,required_resource_identity,source_preconditions,current_availability,disabled_reason,plan_apply_verify_contract,terminal_evidence_target,owner\n",
        );
        for action in actions {
            append_csv_row(
                &mut result,
                &[
                    action.screen_id.clone(),
                    action.action_id.clone(),
                    action.capability_id.clone(),
                    action_kind_name(action.action_kind).to_owned(),
                    action.required_resource_identity.join("|"),
                    action.source_preconditions.join("|"),
                    action_availability_name(action.current_availability).to_owned(),
                    action.disabled_reason.clone(),
                    action.plan_apply_verify_contract.clone(),
                    action.terminal_evidence_target.clone(),
                    action.owner.clone(),
                ],
            );
        }
        Ok(result)
    }

    /// Renders the required E3 derived-metric feasibility CSV.
    ///
    /// # Errors
    /// Returns [`ContractError`] when metric-to-field coverage no longer validates.
    pub fn render_derived_metric_csv(&self) -> Result<String, ContractError> {
        self.validate()?;
        let mut metrics = self.derived_metrics.metrics.iter().collect::<Vec<_>>();
        metrics.sort_by(|left, right| left.metric_id.cmp(&right.metric_id));
        let mut result = String::from(
            "metric_id,target_field_id,authoritative_inputs,formula_id,formula_version,delivery_class,current_status,feasibility_reason,required_next_action,owner\n",
        );
        for metric in metrics {
            append_csv_row(
                &mut result,
                &[
                    metric.metric_id.clone(),
                    metric.target_field_id.clone(),
                    metric.authoritative_inputs.join("|"),
                    metric.formula_id.clone(),
                    metric.formula_version.clone(),
                    delivery_class_name(metric.delivery_class).to_owned(),
                    metric.current_status.clone(),
                    metric.feasibility_reason.clone(),
                    metric.required_next_action.clone(),
                    metric.owner.clone(),
                ],
            );
        }
        Ok(result)
    }

    /// Renders downstream implementation instructions without making Portal
    /// infer a source, formula, reducer or continuation policy.
    ///
    /// # Errors
    /// Returns [`ContractError`] when the work-order-to-field boundary drifts.
    pub fn render_downstream_work_orders_csv(&self) -> Result<String, ContractError> {
        self.validate()?;
        let mut work_orders = self
            .downstream_work_orders
            .work_orders
            .iter()
            .collect::<Vec<_>>();
        work_orders.sort_by(|left, right| left.work_order_id.cmp(&right.work_order_id));
        let mut result = String::from(
            "work_order_id,field_ids,source_operation,resource_identity,continuation_policy,portal_storage_reducer,empty_stale_gap_semantics,delivery_class,required_next_action,owner\n",
        );
        for work_order in work_orders {
            append_csv_row(
                &mut result,
                &[
                    work_order.work_order_id.clone(),
                    work_order.field_ids.join("|"),
                    work_order.source_operation.clone(),
                    work_order.resource_identity.clone(),
                    work_order.continuation_policy.clone(),
                    work_order.portal_storage_reducer.clone(),
                    work_order.empty_stale_gap_semantics.clone(),
                    delivery_class_name(work_order.delivery_class).to_owned(),
                    work_order.required_next_action.clone(),
                    work_order.owner.clone(),
                ],
            );
        }
        Ok(result)
    }

    #[must_use]
    pub fn source_bound_page_limit(&self) -> u16 {
        manager_v2_contract::MAXIMUM_PAGE_ROWS
    }

    #[must_use]
    pub fn source_bound_response_bytes(&self) -> usize {
        manager_v2_contract::MAXIMUM_RESPONSE_BYTES
    }

    #[must_use]
    pub fn e3_input_digests(&self) -> BTreeMap<&'static str, String> {
        BTreeMap::from([
            (
                "e3-screen-inventory.v1.json",
                sha256(E3_SCREEN_INVENTORY_JSON.as_bytes()),
            ),
            (
                "e3-field-definitions.v1.json",
                sha256(E3_FIELD_DEFINITIONS_JSON.as_bytes()),
            ),
            (
                "e3-screen-bindings.v1.json",
                sha256(E3_SCREEN_BINDINGS_JSON.as_bytes()),
            ),
            (
                "e3-action-capability-coverage.v1.json",
                sha256(E3_ACTION_COVERAGE_JSON.as_bytes()),
            ),
            (
                "e3-derived-metric-feasibility.v1.json",
                sha256(E3_DERIVED_METRICS_JSON.as_bytes()),
            ),
            (
                "e3-portal-downstream-work-orders.v1.json",
                sha256(E3_DOWNSTREAM_WORK_ORDERS_JSON.as_bytes()),
            ),
            (
                "e3-state-fixtures.v1.json",
                sha256(E3_STATE_FIXTURES_JSON.as_bytes()),
            ),
        ])
    }

    #[must_use]
    pub fn e3_asset_digests(&self) -> BTreeMap<String, String> {
        BTreeMap::from([
            (
                "e3-screen-inventory.v1.json".to_owned(),
                sha256(E3_SCREEN_INVENTORY_JSON.as_bytes()),
            ),
            (
                "e3-field-definitions.v1.json".to_owned(),
                sha256(E3_FIELD_DEFINITIONS_JSON.as_bytes()),
            ),
            (
                "e3-screen-bindings.v1.json".to_owned(),
                sha256(E3_SCREEN_BINDINGS_JSON.as_bytes()),
            ),
            (
                "e3-action-capability-coverage.v1.json".to_owned(),
                sha256(E3_ACTION_COVERAGE_JSON.as_bytes()),
            ),
            (
                "e3-derived-metric-feasibility.v1.json".to_owned(),
                sha256(E3_DERIVED_METRICS_JSON.as_bytes()),
            ),
            (
                "e3-portal-downstream-work-orders.v1.json".to_owned(),
                sha256(E3_DOWNSTREAM_WORK_ORDERS_JSON.as_bytes()),
            ),
            (
                "e3-state-fixtures.v1.json".to_owned(),
                sha256(E3_STATE_FIXTURES_JSON.as_bytes()),
            ),
            (
                "SCREEN_FIELD_SOURCE_COVERAGE.csv".to_owned(),
                sha256(E3_SCREEN_FIELD_CSV.as_bytes()),
            ),
            (
                "ACTION_CAPABILITY_COVERAGE.csv".to_owned(),
                sha256(E3_ACTION_CSV.as_bytes()),
            ),
            (
                "DERIVED_METRIC_FEASIBILITY.csv".to_owned(),
                sha256(E3_DERIVED_METRIC_CSV.as_bytes()),
            ),
            (
                "PORTAL_DOWNSTREAM_WORK_ORDERS.csv".to_owned(),
                sha256(E3_DOWNSTREAM_WORK_ORDERS_CSV.as_bytes()),
            ),
        ])
    }

    fn validate_identity(&self) -> Result<(), ContractError> {
        if self.screen_inventory.schema_version != E3_SCREEN_INVENTORY_VERSION
            || self.field_definitions.schema_version != E3_FIELD_DEFINITIONS_VERSION
            || self.screen_bindings.schema_version != E3_SCREEN_BINDINGS_VERSION
            || self.action_coverage.schema_version != E3_ACTION_COVERAGE_VERSION
            || self.derived_metrics.schema_version != E3_DERIVED_METRICS_VERSION
            || self.downstream_work_orders.schema_version != E3_DOWNSTREAM_WORK_ORDERS_VERSION
            || self.screen_inventory.screen_catalogue_contract != "portal.execution.screen-bff.v1"
            || self.screen_inventory.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
            || self.screen_inventory.e2_semantic_contract_sha256 != E2_SEMANTIC_CONTRACT_SHA256
            || manager_v2_contract::MAXIMUM_PAGE_ROWS != 200
            || manager_v2_contract::MAXIMUM_RESPONSE_BYTES != 1_048_576
        {
            return Err(ContractError::InvalidIdentity);
        }
        Ok(())
    }

    fn validate_screens(&self) -> Result<BTreeMap<&str, &ScreenDefinition>, ContractError> {
        let expected = EXPECTED_SCREEN_IDS.into_iter().collect::<BTreeSet<_>>();
        let actual = self
            .screen_inventory
            .screens
            .iter()
            .map(|screen| screen.screen_id.as_str())
            .collect::<BTreeSet<_>>();
        if actual != expected || actual.len() != self.screen_inventory.screens.len() {
            return Err(ContractError::InvalidInventory);
        }
        let required_surfaces = REQUIRED_SURFACES.into_iter().collect::<BTreeSet<_>>();
        let covered_surfaces = self
            .screen_inventory
            .screens
            .iter()
            .flat_map(|screen| screen.required_surfaces.iter().map(String::as_str))
            .collect::<BTreeSet<_>>();
        if !required_surfaces.is_subset(&covered_surfaces)
            || self.screen_inventory.screens.iter().any(|screen| {
                invalid_text(&screen.screen_id)
                    || invalid_text(&screen.operation_id)
                    || invalid_text(&screen.response_contract)
                    || screen.read_capabilities.is_empty()
                    || screen.required_surfaces.is_empty()
                    || has_duplicate_or_invalid(&screen.read_capabilities)
                    || has_duplicate_or_invalid(&screen.required_surfaces)
            })
        {
            return Err(ContractError::InvalidInventory);
        }
        Ok(self
            .screen_inventory
            .screens
            .iter()
            .map(|screen| (screen.screen_id.as_str(), screen))
            .collect())
    }

    fn validate_fields(&self) -> Result<BTreeMap<&str, &FieldDefinition>, ContractError> {
        let fields = self
            .field_definitions
            .fields
            .iter()
            .map(|field| (field.field_id.as_str(), field))
            .collect::<BTreeMap<_, _>>();
        if fields.is_empty() || fields.len() != self.field_definitions.fields.len() {
            return Err(ContractError::InvalidInventory);
        }
        for field in &self.field_definitions.fields {
            if invalid_field(field) {
                return Err(ContractError::InvalidField);
            }
            if field.delivery_class == DeliveryClass::AvailableDerivedAtPortal
                && !field.portal_derivation_allowed
            {
                return Err(ContractError::InvalidDelivery);
            }
            if matches!(
                field.delivery_class,
                DeliveryClass::AvailableDirect
                    | DeliveryClass::AvailableDerivedAtEdge
                    | DeliveryClass::AvailableDerivedAtPortal
            ) && field.missing_reason != "NOT_APPLICABLE"
            {
                return Err(ContractError::InvalidDelivery);
            }
            if matches!(
                field.delivery_class,
                DeliveryClass::ExistsNotPublished
                    | DeliveryClass::ExistsButSemanticsUnresolved
                    | DeliveryClass::ExistsButNotSafeToExpose
                    | DeliveryClass::SourceDoesNotExist
                    | DeliveryClass::OwnerActionRequired
            ) && field.missing_reason == "NOT_APPLICABLE"
            {
                return Err(ContractError::InvalidDelivery);
            }
        }
        Ok(fields)
    }

    fn validate_bindings(
        &self,
        screens: &BTreeMap<&str, &ScreenDefinition>,
        fields: &BTreeMap<&str, &FieldDefinition>,
    ) -> Result<(), ContractError> {
        let binding_screens = self
            .screen_bindings
            .bindings
            .iter()
            .map(|binding| binding.screen_id.as_str())
            .collect::<BTreeSet<_>>();
        if binding_screens.len() != self.screen_bindings.bindings.len()
            || binding_screens != screens.keys().copied().collect::<BTreeSet<_>>()
        {
            return Err(ContractError::InvalidInventory);
        }

        let mut referenced_fields = BTreeSet::new();
        for binding in &self.screen_bindings.bindings {
            if !screens.contains_key(binding.screen_id.as_str()) {
                return Err(ContractError::UnknownReference);
            }
            if binding.field_ids.is_empty() || has_duplicate_or_invalid(&binding.field_ids) {
                return Err(ContractError::UnmappedRequiredField);
            }
            for field_id in &binding.field_ids {
                let field = fields
                    .get(field_id.as_str())
                    .ok_or(ContractError::UnknownReference)?;
                // N20's current capability list is a frozen input to E3, not
                // a ceiling on maximum-data discovery. A field whose named
                // capability is not yet in that list is intentionally an
                // E5 publication delta, represented by its delivery/status
                // fields above; it never becomes a generic relation read.
                referenced_fields.insert(field.field_id.as_str());
            }
        }
        if referenced_fields.len() != fields.len() {
            return Err(ContractError::UnmappedRequiredField);
        }
        Ok(())
    }

    fn validate_actions(
        &self,
        screens: &BTreeMap<&str, &ScreenDefinition>,
    ) -> Result<(), ContractError> {
        let mut action_ids = BTreeSet::new();
        for action in &self.action_coverage.actions {
            if !screens.contains_key(action.screen_id.as_str())
                || !action_ids.insert(action.action_id.as_str())
                || invalid_text(&action.action_id)
                || invalid_text(&action.capability_id)
                || invalid_text(&action.disabled_reason)
                || invalid_text(&action.plan_apply_verify_contract)
                || invalid_text(&action.terminal_evidence_target)
                || invalid_text(&action.owner)
                || action.required_resource_identity.is_empty()
                || action.source_preconditions.is_empty()
                || has_duplicate_or_invalid(&action.required_resource_identity)
                || has_duplicate_or_invalid(&action.source_preconditions)
            {
                return Err(ContractError::UnmappedAction);
            }
            if action.action_kind == ActionKind::TradingSystemCommand
                && action.current_availability == ActionAvailability::Available
            {
                return Err(ContractError::InvalidDelivery);
            }
            if action.current_availability == ActionAvailability::Available
                && action.disabled_reason != "NOT_APPLICABLE"
            {
                return Err(ContractError::InvalidDelivery);
            }
            if action.current_availability != ActionAvailability::Available
                && action.disabled_reason == "NOT_APPLICABLE"
            {
                return Err(ContractError::InvalidDelivery);
            }
        }
        if self.action_coverage.actions.is_empty() {
            return Err(ContractError::UnmappedAction);
        }
        Ok(())
    }

    fn validate_metrics(
        &self,
        fields: &BTreeMap<&str, &FieldDefinition>,
    ) -> Result<(), ContractError> {
        let mut metric_ids = BTreeSet::new();
        for metric in &self.derived_metrics.metrics {
            if !metric_ids.insert(metric.metric_id.as_str())
                || !fields.contains_key(metric.target_field_id.as_str())
                || invalid_text(&metric.metric_id)
                || invalid_text(&metric.formula_id)
                || invalid_text(&metric.formula_version)
                || invalid_text(&metric.current_status)
                || invalid_text(&metric.feasibility_reason)
                || invalid_text(&metric.required_next_action)
                || invalid_text(&metric.owner)
                || metric.authoritative_inputs.is_empty()
                || has_duplicate_or_invalid(&metric.authoritative_inputs)
            {
                return Err(ContractError::UnknownReference);
            }
        }
        if self.derived_metrics.metrics.is_empty() {
            return Err(ContractError::InvalidInventory);
        }
        Ok(())
    }

    fn validate_work_orders(
        &self,
        fields: &BTreeMap<&str, &FieldDefinition>,
    ) -> Result<(), ContractError> {
        let mut work_order_ids = BTreeSet::new();
        let mut covered_fields = BTreeSet::new();
        for work_order in &self.downstream_work_orders.work_orders {
            if !work_order_ids.insert(work_order.work_order_id.as_str())
                || invalid_text(&work_order.work_order_id)
                || invalid_text(&work_order.source_operation)
                || invalid_text(&work_order.resource_identity)
                || invalid_text(&work_order.continuation_policy)
                || invalid_text(&work_order.portal_storage_reducer)
                || invalid_text(&work_order.empty_stale_gap_semantics)
                || invalid_text(&work_order.required_next_action)
                || invalid_text(&work_order.owner)
                || work_order.field_ids.is_empty()
                || has_duplicate_or_invalid(&work_order.field_ids)
            {
                return Err(ContractError::InvalidField);
            }
            for field_id in &work_order.field_ids {
                if !fields.contains_key(field_id.as_str()) {
                    return Err(ContractError::UnknownReference);
                }
                covered_fields.insert(field_id.as_str());
            }
        }
        let unpublished_fields = fields
            .values()
            .filter(|field| {
                !matches!(
                    field.delivery_class,
                    DeliveryClass::AvailableDirect | DeliveryClass::AvailableDerivedAtPortal
                )
            })
            .map(|field| field.field_id.as_str())
            .collect::<BTreeSet<_>>();
        if self.downstream_work_orders.work_orders.is_empty()
            || !unpublished_fields.is_subset(&covered_fields)
        {
            return Err(ContractError::UnmappedRequiredField);
        }
        Ok(())
    }

    fn validate_state_fixtures(
        &self,
        screens: &BTreeMap<&str, &ScreenDefinition>,
        fields: &BTreeMap<&str, &FieldDefinition>,
    ) -> Result<(), ContractError> {
        let expected_states = REQUIRED_FIXTURE_STATES.into_iter().collect::<BTreeSet<_>>();
        let actual_states = self
            .state_fixtures
            .fixtures
            .iter()
            .map(|fixture| fixture.state)
            .collect::<BTreeSet<_>>();
        if actual_states != expected_states
            || actual_states.len() != self.state_fixtures.fixtures.len()
        {
            return Err(ContractError::InvalidInventory);
        }
        let mut fixture_ids = BTreeSet::new();
        for fixture in &self.state_fixtures.fixtures {
            let field = fields
                .get(fixture.field_id.as_str())
                .ok_or(ContractError::UnknownReference)?;
            if !screens.contains_key(fixture.screen_id.as_str())
                || !fixture_ids.insert(fixture.fixture_id.as_str())
                || invalid_text(&fixture.fixture_id)
                || invalid_text(&fixture.expected_source_status)
                || invalid_text(&fixture.expected_consumer_semantics)
                || fixture.expected_delivery_class != field.delivery_class
            {
                return Err(ContractError::InvalidField);
            }
            if fixture.state == E3FixtureState::Gap
                && fixture.expected_delivery_class != DeliveryClass::OwnerActionRequired
            {
                return Err(ContractError::InvalidDelivery);
            }
            if fixture.state == E3FixtureState::NextPage
                && fixture.expected_delivery_class == DeliveryClass::OwnerActionRequired
            {
                return Err(ContractError::InvalidDelivery);
            }
        }
        Ok(())
    }

    fn validate_manifest(&self) -> Result<(), ContractError> {
        let manifest = &self.e3_manifest;
        let mapping_count = self
            .screen_bindings
            .bindings
            .iter()
            .map(|binding| binding.field_ids.len())
            .sum::<usize>();
        let runtime = &manifest.runtime_mutations;
        if manifest.schema_version != E3_COVERAGE_MANIFEST_VERSION
            || manifest.phase != "EX-DP-03"
            || manifest.status != "COMPLETE"
            || manifest
                .source_evidence
                .e2_positive_semantic_audit_manifest_sha256
                != E2_POSITIVE_AUDIT_MANIFEST_SHA256
            || manifest.source_evidence.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
            || manifest.source_evidence.e2_semantic_contract_sha256 != E2_SEMANTIC_CONTRACT_SHA256
            || manifest.upstream_manager_bounds.maximum_page_rows
                != manager_v2_contract::MAXIMUM_PAGE_ROWS
            || manifest.upstream_manager_bounds.maximum_response_bytes
                != manager_v2_contract::MAXIMUM_RESPONSE_BYTES
            || manifest.upstream_manager_bounds.contract_revision
                != manager_v2_contract::RUNTIME_CONTRACT_REVISION
            || manifest.counts.frozen_screen_count != self.screen_inventory.screens.len()
            || manifest.counts.required_surface_count != REQUIRED_SURFACES.len()
            || manifest.counts.field_definition_count != self.field_definitions.fields.len()
            || manifest.counts.screen_field_mapping_count != mapping_count
            || manifest.counts.action_coverage_count != self.action_coverage.actions.len()
            || manifest.counts.derived_metric_count != self.derived_metrics.metrics.len()
            || manifest.counts.downstream_work_order_count
                != self.downstream_work_orders.work_orders.len()
            || manifest.counts.state_fixture_count != self.state_fixtures.fixtures.len()
            || manifest.counts.unmapped_required_frontend_fields != 0
            || manifest.counts.unmapped_execution_actions != 0
            || runtime.database != RuntimeMutationStatus::NotApplied
            || runtime.source_identity != RuntimeMutationStatus::NotApplied
            || runtime.route != RuntimeMutationStatus::NotApplied
            || runtime.listener != RuntimeMutationStatus::NotApplied
            || runtime.projection_or_cache != RuntimeMutationStatus::NotApplied
            || runtime.command_port != RuntimeMutationStatus::NotApplied
            || runtime.deployment != RuntimeMutationStatus::NotApplied
            || manifest.files != self.e3_asset_digests()
        {
            return Err(ContractError::InvalidIdentity);
        }
        Ok(())
    }
}

fn decode<T: for<'de> Deserialize<'de>>(
    source: &'static str,
    name: &'static str,
) -> Result<T, ContractError> {
    serde_json::from_str(source).map_err(|_| ContractError::InvalidJson(name))
}

fn invalid_field(field: &FieldDefinition) -> bool {
    invalid_text(&field.field_id)
        || invalid_text(&field.capability_id)
        || invalid_text(&field.panel_id)
        || invalid_text(&field.frontend_field_path)
        || invalid_text(&field.visible_meaning)
        || invalid_text(&field.source_system)
        || invalid_text(&field.source_relation_or_operation)
        || invalid_text(&field.primary_resource_key)
        || invalid_text(&field.join_path)
        || invalid_text(&field.authority)
        || invalid_text(&field.mutability)
        || invalid_text(&field.history_requirement)
        || invalid_text(&field.freshness_requirement)
        || invalid_text(&field.formula_id)
        || invalid_text(&field.formula_version)
        || invalid_text(&field.currency_policy)
        || invalid_text(&field.timestamp_policy)
        || invalid_text(&field.edge_operation)
        || invalid_text(&field.current_status)
        || invalid_text(&field.missing_reason)
        || invalid_text(&field.owner)
        || field.source_columns.is_empty()
        || has_duplicate_or_invalid(&field.source_columns)
}

fn invalid_text(value: &str) -> bool {
    value.trim().is_empty()
        || value.trim() != value
        || value.to_ascii_uppercase().contains("TBD")
        || value.to_ascii_uppercase().contains("<PLACEHOLDER>")
}

fn has_duplicate_or_invalid(values: &[String]) -> bool {
    let unique = values.iter().map(String::as_str).collect::<BTreeSet<_>>();
    unique.len() != values.len() || values.iter().any(|value| invalid_text(value))
}

fn requiredness_name(value: Requiredness) -> &'static str {
    match value {
        Requiredness::Required => "REQUIRED",
        Requiredness::Optional => "OPTIONAL",
    }
}

fn delivery_class_name(value: DeliveryClass) -> &'static str {
    match value {
        DeliveryClass::AvailableDirect => "AVAILABLE_DIRECT",
        DeliveryClass::AvailableDerivedAtEdge => "AVAILABLE_DERIVED_AT_EDGE",
        DeliveryClass::AvailableDerivedAtPortal => "AVAILABLE_DERIVED_AT_PORTAL",
        DeliveryClass::ExistsNotPublished => "EXISTS_NOT_PUBLISHED",
        DeliveryClass::ExistsButSemanticsUnresolved => "EXISTS_BUT_SEMANTICS_UNRESOLVED",
        DeliveryClass::ExistsButNotSafeToExpose => "EXISTS_BUT_NOT_SAFE_TO_EXPOSE",
        DeliveryClass::SourceDoesNotExist => "SOURCE_DOES_NOT_EXIST",
        DeliveryClass::OwnerActionRequired => "OWNER_ACTION_REQUIRED",
    }
}

fn action_kind_name(value: ActionKind) -> &'static str {
    match value {
        ActionKind::PortalWorkflow => "PORTAL_WORKFLOW",
        ActionKind::TradingSystemCommand => "TRADING_SYSTEM_COMMAND",
    }
}

fn action_availability_name(value: ActionAvailability) -> &'static str {
    match value {
        ActionAvailability::Available => "AVAILABLE",
        ActionAvailability::Disabled => "DISABLED",
        ActionAvailability::ExistsNotPublished => "EXISTS_NOT_PUBLISHED",
        ActionAvailability::OwnerActionRequired => "OWNER_ACTION_REQUIRED",
    }
}

fn append_csv_row(target: &mut String, values: &[String]) {
    let encoded = values
        .iter()
        .map(|value| csv_cell(value))
        .collect::<Vec<_>>();
    target.push_str(&encoded.join(","));
    target.push('\n');
}

fn csv_cell(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_owned()
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests;
