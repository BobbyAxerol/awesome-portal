//! E4's additive, cross-language return-pack contract.
//!
//! This module is deliberately unable to create a route, query, listener,
//! cache, credential or event stream.  It freezes the typed boundary that an
//! E5 adapter may later implement after its named source is qualified.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
};

use execution_contracts::{CanonicalId, DecimalString};
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

use crate::{
    sha256, DeliveryClass, MaximumDataContract, E2_SEMANTIC_CONTRACT_SHA256,
    E2_SEMANTIC_REGISTRY_SHA256,
};

pub const E4_SOURCE_CATALOGUE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-source-catalogue.v1.schema.json"
));
pub const E4_DOMAIN_CAPABILITY_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-domain-capability.v1.schema.json"
));
pub const E4_HISTORY_CONTINUATION_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-history-continuation.v1.schema.json"
));
pub const E4_SOURCE_HEALTH_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-source-health.v1.schema.json"
));
pub const E4_COVERAGE_ARTIFACT_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-coverage-artifact.v1.schema.json"
));
pub const E4_READ_ENVELOPE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-read-envelope.v1.schema.json"
));
pub const E4_EVENT_COVERAGE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-event-coverage.v1.schema.json"
));
pub const E4_SOURCE_CATALOGUE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-source-catalogue.v1.json"
));
pub const E4_DOMAIN_CAPABILITIES_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-domain-capabilities.v1.json"
));
pub const E4_OPERATION_BINDINGS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-operation-bindings.v1.json"
));
pub const E4_EVENT_COVERAGE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-event-coverage.v1.json"
));
pub const E4_GOLDEN_FIXTURES_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-golden-fixtures.v1.json"
));
pub const E4_CONTRACT_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e4-contract.manifest.json"
));

pub const E4_SOURCE_CATALOGUE_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.source-catalogue.schema.v1";
pub const E4_DOMAIN_CAPABILITY_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.domain-capability.schema.v1";
pub const E4_HISTORY_CONTINUATION_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.history-continuation.schema.v1";
pub const E4_SOURCE_HEALTH_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.source-health.schema.v1";
pub const E4_COVERAGE_ARTIFACT_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.coverage-artifact.schema.v1";
pub const E4_READ_ENVELOPE_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.read-envelope.schema.v1";
pub const E4_EVENT_COVERAGE_SCHEMA_ID: &str =
    "portal.execution.maximum-data.e4.event-coverage.schema.v1";
pub const E4_SOURCE_CATALOGUE_VERSION: &str =
    "portal.execution.maximum-data.e4.source-catalogue.v1";
pub const E4_DOMAIN_CAPABILITIES_VERSION: &str =
    "portal.execution.maximum-data.e4.domain-capabilities.v1";
pub const E4_OPERATION_BINDINGS_VERSION: &str =
    "portal.execution.maximum-data.e4.operation-bindings.v1";
pub const E4_EVENT_COVERAGE_VERSION: &str = "portal.execution.maximum-data.e4.event-coverage.v1";
pub const E4_GOLDEN_FIXTURES_VERSION: &str = "portal.execution.maximum-data.e4.golden-fixtures.v1";
pub const E4_CONTRACT_MANIFEST_VERSION: &str =
    "portal.execution.maximum-data.e4.contract-manifest.v1";
pub const E3_COVERAGE_MANIFEST_SHA256: &str =
    "sha256:4df8a5438efc2878b95847dd0212ab619b888da37cbd69df459be982f9e864e6";

const EXPECTED_DOMAIN_IDS: [&str; 11] = [
    "alpha_strategy_deployment_artifact",
    "portfolio_allocation_capital",
    "accounts_balances_margin_bindings_sync",
    "positions_exposure",
    "orders_fills_conditional_lifecycle",
    "execution_sessions_cycles",
    "signal_sizing_risk",
    "accounting_equity_performance_valuation",
    "reconciliation_incidents_operational_truth",
    "commands_terminal_verification",
    "market_context",
];

const REQUIRED_EVENT_KINDS: [&str; 36] = [
    "SIGNAL_INTENT_CREATED",
    "SIZING_REQUESTED",
    "SIZING_APPROVED",
    "SIZING_REDUCED",
    "SIZING_REJECTED",
    "RISK_CHECK_REQUESTED",
    "RISK_APPROVED",
    "RISK_REJECTED",
    "RISK_LIMIT_CHANGED",
    "RISK_BREACH_OPENED",
    "RISK_BREACH_RESOLVED",
    "COMMAND_ACCEPTED",
    "COMMAND_DISPATCHED",
    "COMMAND_ACKNOWLEDGED",
    "COMMAND_TERMINAL",
    "ORDER_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_SOURCE_ACKNOWLEDGED",
    "ORDER_BROKER_ACKNOWLEDGED",
    "ORDER_REJECTED",
    "ORDER_REPLACE_REQUESTED",
    "ORDER_REPLACED",
    "CANCEL_REQUESTED",
    "ORDER_CANCELED",
    "ORDER_EXPIRED",
    "PARTIAL_FILL",
    "FILL",
    "FILL_CORRECTED",
    "POSITION_UPDATED",
    "ACCOUNTING_UPDATED",
    "EQUITY_SNAPSHOT",
    "RECONCILIATION_FINDING_OPENED",
    "RECONCILIATION_FINDING_RESOLVED",
    "ALLOCATION_CHANGED",
    "BROKER_SYNC_STATE_CHANGED",
    "KILL_SWITCH_STATE_CHANGED",
];

const REQUIRED_FIXTURE_STATES: [FixtureState; 8] = [
    FixtureState::Populated,
    FixtureState::Empty,
    FixtureState::Partial,
    FixtureState::Stale,
    FixtureState::Gap,
    FixtureState::Duplicate,
    FixtureState::Correction,
    FixtureState::Continuation,
];

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum E4ContractError {
    #[error("invalid E4 JSON in {0}")]
    InvalidJson(&'static str),
    #[error("E4 schema, contract identity or Manager-v2 compatibility drifted")]
    InvalidIdentity,
    #[error("E4 field, source, lineage or status is malformed")]
    InvalidField,
    #[error("E4 source, domain, event or field reference is unknown")]
    UnknownReference,
    #[error("E4 source coverage makes an unsupported availability claim")]
    InvalidCoverage,
    #[error("E4 continuation is unbounded or not bound to its source operation")]
    InvalidContinuation,
    #[error("E4 fixture fails typed empty/partial/stale/gap/duplicate/correction semantics")]
    InvalidFixture,
    #[error("E4 manifest is incomplete or has a digest drift")]
    InvalidManifest,
    #[error("UTC epoch milliseconds must be represented as a JSON int64")]
    InvalidUtcEpochMs,
    #[error("financial value must be exact decimal string with declared currency and scale")]
    InvalidExactDecimal,
}

/// Unix epoch milliseconds in UTC.  It serializes as a JSON integer and never
/// accepts a string or IEEE-754 JSON number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct UtcEpochMs(i64);

impl UtcEpochMs {
    #[must_use]
    pub const fn new(value: i64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> i64 {
        self.0
    }
}

impl Serialize for UtcEpochMs {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(self.0)
    }
}

impl<'de> Deserialize<'de> for UtcEpochMs {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct EpochVisitor;

        impl de::Visitor<'_> for EpochVisitor {
            type Value = UtcEpochMs;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("a UTC Unix epoch millisecond int64")
            }

            fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                Ok(UtcEpochMs::new(value))
            }

            fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                i64::try_from(value)
                    .map(UtcEpochMs::new)
                    .map_err(|_| E::custom(E4ContractError::InvalidUtcEpochMs))
            }
        }

        deserializer.deserialize_i64(EpochVisitor)
    }
}

/// Exact financial amount.  JSON floats cannot construct this type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ExactDecimal {
    pub value: DecimalString,
    pub currency: String,
    pub scale: u8,
}

impl ExactDecimal {
    /// Builds a declared-scale decimal without a binary floating conversion.
    ///
    /// # Errors
    /// Returns [`E4ContractError::InvalidExactDecimal`] when currency or the
    /// exact source scale is malformed.
    pub fn new(
        value: DecimalString,
        currency: impl Into<String>,
        scale: u8,
    ) -> Result<Self, E4ContractError> {
        let currency = currency.into();
        let value_scale = value.value().scale();
        if currency.len() < 3
            || currency.len() > 12
            || !currency.bytes().all(|byte| byte.is_ascii_uppercase())
            || value_scale != u32::from(scale)
        {
            return Err(E4ContractError::InvalidExactDecimal);
        }
        Ok(Self {
            value,
            currency,
            scale,
        })
    }
}

impl<'de> Deserialize<'de> for ExactDecimal {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct WireExactDecimal {
            value: DecimalString,
            currency: String,
            scale: u8,
        }

        let wire = WireExactDecimal::deserialize(deserializer)?;
        Self::new(wire.value, wire.currency, wire.scale).map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProfileMode {
    Paper,
    Sandbox,
    Live,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SourceStatus {
    AvailableCurrentStateOnly,
    AvailableRetainedHistory,
    ExistsNotPublished,
    SourceOwnerGap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FreshnessStatus {
    Fresh,
    Stale,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Completeness {
    Complete,
    Partial,
    Gap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FixtureState {
    Populated,
    Empty,
    Partial,
    Stale,
    Gap,
    Duplicate,
    Correction,
    Continuation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventCoverageStatus {
    Available,
    Derivable,
    CurrentStateOnly,
    NotRetained,
    SourceAbsent,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceLineage {
    pub profile_id: CanonicalId,
    pub mode: ProfileMode,
    pub venue: Option<CanonicalId>,
    pub deployment_id: Option<CanonicalId>,
    pub strategy_id: Option<CanonicalId>,
    pub alpha_id: Option<CanonicalId>,
    pub portfolio_id: Option<CanonicalId>,
    pub account_id: Option<CanonicalId>,
    pub binding_id: Option<CanonicalId>,
    pub execution_session_id: Option<CanonicalId>,
    pub command_id: Option<CanonicalId>,
    pub order_id: Option<CanonicalId>,
    pub fill_id: Option<CanonicalId>,
    pub instrument_id: Option<CanonicalId>,
    pub trace_id: Option<CanonicalId>,
    pub correlation_id: Option<CanonicalId>,
    pub causation_id: Option<CanonicalId>,
    pub lineage_limitations: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceHealth {
    pub source_id: CanonicalId,
    pub source_status: SourceStatus,
    pub freshness: FreshnessStatus,
    pub observed_at_ms: UtcEpochMs,
    pub source_epoch: Option<CanonicalId>,
    pub global_sequence: Option<String>,
    pub retention_floor_ms: Option<UtcEpochMs>,
    pub correction_status: String,
    pub reason_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct OpaqueContinuation {
    pub token: String,
}

impl<'de> Deserialize<'de> for OpaqueContinuation {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct WireOpaqueContinuation {
            token: String,
        }

        let wire = WireOpaqueContinuation::deserialize(deserializer)?;
        Self::new(wire.token).map_err(de::Error::custom)
    }
}

impl OpaqueContinuation {
    /// Creates a bounded opaque token.  Its binding is represented separately
    /// in [`BoundContinuation`], so a caller cannot reinterpret it as a raw
    /// database key or an unscoped cursor.
    ///
    /// # Errors
    ///
    /// Returns [`E4ContractError::InvalidContinuation`] for an empty,
    /// surrounding-whitespace or over-4,096-byte token.
    pub fn new(token: impl Into<String>) -> Result<Self, E4ContractError> {
        let token = token.into();
        if token.is_empty()
            || token.len() > manager_v2_contract::MAXIMUM_OPAQUE_TOKEN_BYTES
            || token.trim() != token
        {
            return Err(E4ContractError::InvalidContinuation);
        }
        Ok(Self { token })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "the frozen E4 wire contract requires these four independently meaningful protocol flags"
)]
pub struct BoundContinuation {
    pub source_contract_revision: String,
    pub source_id: CanonicalId,
    pub logical_operation_id: String,
    pub profile_id: CanonicalId,
    pub next_cursor: Option<OpaqueContinuation>,
    pub has_more: bool,
    pub total_unknown: bool,
    pub earliest_available_time_ms: Option<UtcEpochMs>,
    pub newest_available_time_ms: Option<UtcEpochMs>,
    pub retention_floor_ms: Option<UtcEpochMs>,
    pub completeness: Completeness,
    pub resnapshot_required: bool,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FixtureFact {
    pub fixture_record_id: CanonicalId,
    pub amount: ExactDecimal,
    pub effective_at_ms: UtcEpochMs,
    pub observed_at_ms: UtcEpochMs,
    pub correction_of_fixture_record_id: Option<CanonicalId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReadEnvelope {
    pub schema_version: String,
    pub source_contract_revision: String,
    pub logical_operation_id: String,
    pub lineage: SourceLineage,
    pub source_health: SourceHealth,
    pub page: BoundContinuation,
    pub state: FixtureState,
    pub duplicate_records_suppressed: u16,
    pub records: Vec<FixtureFact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4SourceCatalogue {
    pub schema_version: String,
    pub e2_semantic_registry_sha256: String,
    pub e2_semantic_contract_sha256: String,
    pub sources: Vec<E4SourceCatalogueEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4SourceCatalogueEntry {
    pub source_id: String,
    pub source_kind: String,
    pub source_contract_revision: String,
    pub source_status: SourceStatus,
    pub supported_profile_ids: Vec<String>,
    pub supported_modes: Vec<ProfileMode>,
    pub history_semantics: String,
    pub correction_semantics: String,
    pub runtime_binding: String,
    pub owner: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4DomainCapabilities {
    pub schema_version: String,
    pub e2_semantic_registry_sha256: String,
    pub domains: Vec<E4DomainCapability>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4DomainCapability {
    pub domain_id: String,
    pub disposition: String,
    pub coverage_status: String,
    pub current_state_semantics: String,
    pub history_semantics: String,
    pub event_semantics: String,
    pub source_owner_gap_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BindingStatus {
    ExistingContractCompatible,
    E5NamedOperationRequired,
    SourceOwnerGap,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4OperationBindings {
    pub schema_version: String,
    pub e3_coverage_manifest_sha256: String,
    pub bindings: Vec<E4FieldOperationBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4FieldOperationBinding {
    pub field_id: String,
    pub schema_ref: String,
    pub binding_status: BindingStatus,
    pub logical_operation_id: Option<String>,
    pub typed_absence_id: Option<String>,
    pub snapshot_semantics: String,
    pub continuation_semantics: String,
    pub source_status: SourceStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4EventCoverage {
    pub schema_version: String,
    pub e2_semantic_registry_sha256: String,
    pub global_ordered_journal_status: String,
    pub coverage: Vec<E4EventCoverageEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4EventCoverageEntry {
    pub event_type: String,
    pub domain_id: String,
    pub status: EventCoverageStatus,
    pub replay_eligible: bool,
    pub source_basis: String,
    pub owner_action_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4GoldenFixtures {
    pub schema_version: String,
    pub provenance: String,
    pub fixtures: Vec<E4GoldenFixture>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4GoldenFixture {
    pub fixture_id: String,
    pub state: FixtureState,
    pub synthetic_no_business_row: bool,
    pub envelope: ReadEnvelope,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4ContractManifest {
    pub schema_version: String,
    pub phase: String,
    pub status: String,
    pub e2_semantic_registry_sha256: String,
    pub e2_semantic_contract_sha256: String,
    pub e3_coverage_manifest_sha256: String,
    pub manager_v2_contract_revision: String,
    pub counts: E4Counts,
    pub runtime_mutations: E4RuntimeMutations,
    pub files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4Counts {
    pub schema_count: usize,
    pub source_count: usize,
    pub domain_count: usize,
    pub field_binding_count: usize,
    pub event_coverage_count: usize,
    pub golden_fixture_count: usize,
    pub e3_unmapped_required_frontend_fields: u16,
    pub e3_unmapped_execution_actions: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct E4RuntimeMutations {
    pub database: crate::RuntimeMutationStatus,
    pub source_identity: crate::RuntimeMutationStatus,
    pub route: crate::RuntimeMutationStatus,
    pub listener: crate::RuntimeMutationStatus,
    pub projection_or_cache: crate::RuntimeMutationStatus,
    pub command_port: crate::RuntimeMutationStatus,
    pub deployment: crate::RuntimeMutationStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct E4Contract {
    pub source_catalogue: E4SourceCatalogue,
    pub domain_capabilities: E4DomainCapabilities,
    pub operation_bindings: E4OperationBindings,
    pub event_coverage: E4EventCoverage,
    pub golden_fixtures: E4GoldenFixtures,
    pub manifest: E4ContractManifest,
}

impl E4Contract {
    /// Parses and validates the repository-pinned E4 capability pack.
    ///
    /// # Errors
    /// Returns [`E4ContractError`] when a contract claims source, event or
    /// continuation semantics not proven by E2/E3.
    pub fn canonical() -> Result<Self, E4ContractError> {
        let contract = Self {
            source_catalogue: decode(E4_SOURCE_CATALOGUE_JSON, "e4-source-catalogue")?,
            domain_capabilities: decode(E4_DOMAIN_CAPABILITIES_JSON, "e4-domain-capabilities")?,
            operation_bindings: decode(E4_OPERATION_BINDINGS_JSON, "e4-operation-bindings")?,
            event_coverage: decode(E4_EVENT_COVERAGE_JSON, "e4-event-coverage")?,
            golden_fixtures: decode(E4_GOLDEN_FIXTURES_JSON, "e4-golden-fixtures")?,
            manifest: decode(E4_CONTRACT_MANIFEST_JSON, "e4-contract-manifest")?,
        };
        contract.validate()?;
        Ok(contract)
    }

    /// Validates the E4 pack without reaching a runtime or source database.
    ///
    /// # Errors
    /// Returns [`E4ContractError`] when any static asset, fixture or
    /// compatibility invariant drifts.
    pub fn validate(&self) -> Result<(), E4ContractError> {
        Self::validate_schema_documents()?;
        let source_ids = self.validate_source_catalogue()?;
        self.validate_domains()?;
        self.validate_operation_bindings()?;
        self.validate_event_coverage()?;
        self.validate_golden_fixtures(&source_ids)?;
        self.validate_manifest()?;
        Self::validate_manager_compatibility()?;
        Ok(())
    }

    /// Returns digests for every E4 asset represented by the manifest.
    #[must_use]
    pub fn e4_asset_digests(&self) -> BTreeMap<String, String> {
        BTreeMap::from([
            (
                "e4-source-catalogue.v1.schema.json".to_owned(),
                sha256(E4_SOURCE_CATALOGUE_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-domain-capability.v1.schema.json".to_owned(),
                sha256(E4_DOMAIN_CAPABILITY_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-history-continuation.v1.schema.json".to_owned(),
                sha256(E4_HISTORY_CONTINUATION_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-source-health.v1.schema.json".to_owned(),
                sha256(E4_SOURCE_HEALTH_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-coverage-artifact.v1.schema.json".to_owned(),
                sha256(E4_COVERAGE_ARTIFACT_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-read-envelope.v1.schema.json".to_owned(),
                sha256(E4_READ_ENVELOPE_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-event-coverage.v1.schema.json".to_owned(),
                sha256(E4_EVENT_COVERAGE_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e4-source-catalogue.v1.json".to_owned(),
                sha256(E4_SOURCE_CATALOGUE_JSON.as_bytes()),
            ),
            (
                "e4-domain-capabilities.v1.json".to_owned(),
                sha256(E4_DOMAIN_CAPABILITIES_JSON.as_bytes()),
            ),
            (
                "e4-operation-bindings.v1.json".to_owned(),
                sha256(E4_OPERATION_BINDINGS_JSON.as_bytes()),
            ),
            (
                "e4-event-coverage.v1.json".to_owned(),
                sha256(E4_EVENT_COVERAGE_JSON.as_bytes()),
            ),
            (
                "e4-golden-fixtures.v1.json".to_owned(),
                sha256(E4_GOLDEN_FIXTURES_JSON.as_bytes()),
            ),
        ])
    }

    fn validate_schema_documents() -> Result<(), E4ContractError> {
        let documents = [
            (
                E4_SOURCE_CATALOGUE_SCHEMA_JSON,
                E4_SOURCE_CATALOGUE_SCHEMA_ID,
            ),
            (
                E4_DOMAIN_CAPABILITY_SCHEMA_JSON,
                E4_DOMAIN_CAPABILITY_SCHEMA_ID,
            ),
            (
                E4_HISTORY_CONTINUATION_SCHEMA_JSON,
                E4_HISTORY_CONTINUATION_SCHEMA_ID,
            ),
            (E4_SOURCE_HEALTH_SCHEMA_JSON, E4_SOURCE_HEALTH_SCHEMA_ID),
            (
                E4_COVERAGE_ARTIFACT_SCHEMA_JSON,
                E4_COVERAGE_ARTIFACT_SCHEMA_ID,
            ),
            (E4_READ_ENVELOPE_SCHEMA_JSON, E4_READ_ENVELOPE_SCHEMA_ID),
            (E4_EVENT_COVERAGE_SCHEMA_JSON, E4_EVENT_COVERAGE_SCHEMA_ID),
        ];
        let mut ids = BTreeSet::new();
        for (document, expected_id) in documents {
            let value: Value = serde_json::from_str(document)
                .map_err(|_| E4ContractError::InvalidJson("e4-schema"))?;
            let valid = value["$schema"] == "https://json-schema.org/draft/2020-12/schema"
                && value["$id"] == expected_id
                && value["type"] == "object"
                && value["additionalProperties"] == false
                && value["required"]
                    .as_array()
                    .is_some_and(|items| !items.is_empty())
                && value["properties"]
                    .as_object()
                    .is_some_and(|items| !items.is_empty())
                && !document.contains("/portal/execution/v4")
                && !contains_forbidden_transport_or_secret(document)
                && ids.insert(expected_id);
            if !valid {
                return Err(E4ContractError::InvalidIdentity);
            }
        }
        Ok(())
    }

    fn validate_source_catalogue(&self) -> Result<BTreeSet<&str>, E4ContractError> {
        if self.source_catalogue.schema_version != E4_SOURCE_CATALOGUE_VERSION
            || self.source_catalogue.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
            || self.source_catalogue.e2_semantic_contract_sha256 != E2_SEMANTIC_CONTRACT_SHA256
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let mut ids = BTreeSet::new();
        for source in &self.source_catalogue.sources {
            if !ids.insert(source.source_id.as_str())
                || invalid_text(&source.source_id)
                || invalid_text(&source.source_kind)
                || invalid_text(&source.source_contract_revision)
                || invalid_text(&source.history_semantics)
                || invalid_text(&source.correction_semantics)
                || invalid_text(&source.runtime_binding)
                || invalid_text(&source.owner)
                || has_duplicate_or_invalid_allow_empty(&source.supported_profile_ids)
                || has_duplicate_modes(&source.supported_modes)
                || contains_forbidden_transport_or_secret(&source.source_id)
                || contains_forbidden_transport_or_secret(&source.source_contract_revision)
            {
                return Err(E4ContractError::InvalidField);
            }
            if source.source_status == SourceStatus::SourceOwnerGap
                && (!source.supported_profile_ids.is_empty() || !source.supported_modes.is_empty())
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            if source.source_status != SourceStatus::SourceOwnerGap
                && (source.supported_profile_ids.is_empty() || source.supported_modes.is_empty())
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            if source.source_id == "TRADING_SYSTEM_MANAGER_V2_PAPER"
                && (source.supported_profile_ids.len() != 1
                    || source.supported_profile_ids[0] != "PAPER_BINANCE_USDM"
                    || source.supported_modes.len() != 1
                    || source.supported_modes[0] != ProfileMode::Paper
                    || source.source_status != SourceStatus::AvailableCurrentStateOnly)
            {
                return Err(E4ContractError::InvalidCoverage);
            }
        }
        if ids.len() != self.source_catalogue.sources.len()
            || !ids.contains("TRADING_SYSTEM_MANAGER_V2_PAPER")
            || !ids.contains("AUTHORITATIVE_CHANGE_JOURNAL_REQUIRED")
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        Ok(ids)
    }

    fn validate_domains(&self) -> Result<(), E4ContractError> {
        if self.domain_capabilities.schema_version != E4_DOMAIN_CAPABILITIES_VERSION
            || self.domain_capabilities.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let expected = EXPECTED_DOMAIN_IDS.into_iter().collect::<BTreeSet<_>>();
        let actual = self
            .domain_capabilities
            .domains
            .iter()
            .map(|domain| domain.domain_id.as_str())
            .collect::<BTreeSet<_>>();
        if actual != expected || actual.len() != self.domain_capabilities.domains.len() {
            return Err(E4ContractError::InvalidCoverage);
        }
        if self.domain_capabilities.domains.iter().any(|domain| {
            invalid_text(&domain.disposition)
                || invalid_text(&domain.coverage_status)
                || invalid_text(&domain.current_state_semantics)
                || invalid_text(&domain.history_semantics)
                || invalid_text(&domain.event_semantics)
                || has_duplicate_or_invalid_allow_empty(&domain.source_owner_gap_ids)
                || contains_forbidden_transport_or_secret(&domain.history_semantics)
                || contains_forbidden_transport_or_secret(&domain.event_semantics)
        }) {
            return Err(E4ContractError::InvalidField);
        }
        Ok(())
    }

    fn validate_operation_bindings(&self) -> Result<(), E4ContractError> {
        let e3 = MaximumDataContract::canonical().map_err(|_| E4ContractError::InvalidIdentity)?;
        if self.operation_bindings.schema_version != E4_OPERATION_BINDINGS_VERSION
            || self.operation_bindings.e3_coverage_manifest_sha256 != E3_COVERAGE_MANIFEST_SHA256
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let fields = e3
            .field_definitions
            .fields
            .iter()
            .map(|field| (field.field_id.as_str(), field))
            .collect::<BTreeMap<_, _>>();
        let binding_ids = self
            .operation_bindings
            .bindings
            .iter()
            .map(|binding| binding.field_id.as_str())
            .collect::<BTreeSet<_>>();
        if binding_ids.len() != self.operation_bindings.bindings.len()
            || binding_ids != fields.keys().copied().collect::<BTreeSet<_>>()
        {
            return Err(E4ContractError::InvalidCoverage);
        }
        for binding in &self.operation_bindings.bindings {
            let field = fields
                .get(binding.field_id.as_str())
                .ok_or(E4ContractError::UnknownReference)?;
            let expected_schema_ref = if field.delivery_class == DeliveryClass::OwnerActionRequired
            {
                E4_DOMAIN_CAPABILITY_SCHEMA_ID
            } else {
                E4_READ_ENVELOPE_SCHEMA_ID
            };
            if invalid_text(&binding.schema_ref)
                || invalid_text(&binding.snapshot_semantics)
                || invalid_text(&binding.continuation_semantics)
                || binding.schema_ref != expected_schema_ref
                || contains_forbidden_transport_or_secret(&binding.schema_ref)
                || binding
                    .logical_operation_id
                    .as_deref()
                    .is_some_and(invalid_text)
                || binding
                    .typed_absence_id
                    .as_deref()
                    .is_some_and(invalid_text)
            {
                return Err(E4ContractError::InvalidField);
            }
            let source_owner_gap = field.delivery_class == DeliveryClass::OwnerActionRequired;
            if source_owner_gap != (binding.binding_status == BindingStatus::SourceOwnerGap)
                || source_owner_gap != binding.logical_operation_id.is_none()
                || source_owner_gap != binding.typed_absence_id.is_some()
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            if !source_owner_gap
                && (binding.logical_operation_id.as_deref() != Some(field.edge_operation.as_str())
                    || binding.typed_absence_id.is_some())
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            if matches!(
                field.delivery_class,
                DeliveryClass::AvailableDirect
                    | DeliveryClass::AvailableDerivedAtEdge
                    | DeliveryClass::AvailableDerivedAtPortal
            ) != (binding.binding_status == BindingStatus::ExistingContractCompatible)
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            if binding.source_status == SourceStatus::AvailableRetainedHistory
                && binding.snapshot_semantics.contains("CURRENT_STATE_ONLY")
            {
                return Err(E4ContractError::InvalidCoverage);
            }
        }
        Ok(())
    }

    fn validate_event_coverage(&self) -> Result<(), E4ContractError> {
        if self.event_coverage.schema_version != E4_EVENT_COVERAGE_VERSION
            || self.event_coverage.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
            || self.event_coverage.global_ordered_journal_status
                != "E2_NOT_PROVEN_NO_GLOBAL_SEQUENCE_RETENTION_OR_CORRECTION"
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let required = REQUIRED_EVENT_KINDS.into_iter().collect::<BTreeSet<_>>();
        let actual = self
            .event_coverage
            .coverage
            .iter()
            .map(|entry| entry.event_type.as_str())
            .collect::<BTreeSet<_>>();
        let domains = EXPECTED_DOMAIN_IDS.into_iter().collect::<BTreeSet<_>>();
        if actual != required || actual.len() != self.event_coverage.coverage.len() {
            return Err(E4ContractError::InvalidCoverage);
        }
        for entry in &self.event_coverage.coverage {
            if !domains.contains(entry.domain_id.as_str())
                || invalid_text(&entry.source_basis)
                || entry.owner_action_id.as_deref().is_some_and(invalid_text)
                || entry.replay_eligible
                || entry.status == EventCoverageStatus::Available
            {
                return Err(E4ContractError::InvalidCoverage);
            }
            let absent = entry.status == EventCoverageStatus::SourceAbsent;
            if absent != entry.owner_action_id.is_some() {
                return Err(E4ContractError::InvalidCoverage);
            }
        }
        Ok(())
    }

    fn validate_golden_fixtures(&self, source_ids: &BTreeSet<&str>) -> Result<(), E4ContractError> {
        if self.golden_fixtures.schema_version != E4_GOLDEN_FIXTURES_VERSION
            || self.golden_fixtures.provenance != "SYNTHETIC_NO_BUSINESS_ROWS"
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let expected = REQUIRED_FIXTURE_STATES.into_iter().collect::<BTreeSet<_>>();
        let actual = self
            .golden_fixtures
            .fixtures
            .iter()
            .map(|fixture| fixture.state)
            .collect::<BTreeSet<_>>();
        if actual != expected || actual.len() != self.golden_fixtures.fixtures.len() {
            return Err(E4ContractError::InvalidFixture);
        }
        let mut fixture_ids = BTreeSet::new();
        for fixture in &self.golden_fixtures.fixtures {
            if !fixture.synthetic_no_business_row
                || !fixture_ids.insert(fixture.fixture_id.as_str())
                || invalid_text(&fixture.fixture_id)
                || fixture.state != fixture.envelope.state
            {
                return Err(E4ContractError::InvalidFixture);
            }
            validate_read_envelope(&fixture.envelope, source_ids)?;
        }
        Ok(())
    }

    fn validate_manifest(&self) -> Result<(), E4ContractError> {
        let manifest = &self.manifest;
        let runtime = &manifest.runtime_mutations;
        if manifest.schema_version != E4_CONTRACT_MANIFEST_VERSION
            || manifest.phase != "EX-DP-04"
            || manifest.status != "COMPLETE"
            || manifest.e2_semantic_registry_sha256 != E2_SEMANTIC_REGISTRY_SHA256
            || manifest.e2_semantic_contract_sha256 != E2_SEMANTIC_CONTRACT_SHA256
            || manifest.e3_coverage_manifest_sha256 != E3_COVERAGE_MANIFEST_SHA256
            || manifest.manager_v2_contract_revision
                != manager_v2_contract::RUNTIME_CONTRACT_REVISION
            || manifest.counts.schema_count != 7
            || manifest.counts.source_count != self.source_catalogue.sources.len()
            || manifest.counts.domain_count != self.domain_capabilities.domains.len()
            || manifest.counts.field_binding_count != self.operation_bindings.bindings.len()
            || manifest.counts.event_coverage_count != self.event_coverage.coverage.len()
            || manifest.counts.golden_fixture_count != self.golden_fixtures.fixtures.len()
            || manifest.counts.e3_unmapped_required_frontend_fields != 0
            || manifest.counts.e3_unmapped_execution_actions != 0
            || runtime.database != crate::RuntimeMutationStatus::NotApplied
            || runtime.source_identity != crate::RuntimeMutationStatus::NotApplied
            || runtime.route != crate::RuntimeMutationStatus::NotApplied
            || runtime.listener != crate::RuntimeMutationStatus::NotApplied
            || runtime.projection_or_cache != crate::RuntimeMutationStatus::NotApplied
            || runtime.command_port != crate::RuntimeMutationStatus::NotApplied
            || runtime.deployment != crate::RuntimeMutationStatus::NotApplied
            || manifest.files != self.e4_asset_digests()
        {
            return Err(E4ContractError::InvalidManifest);
        }
        Ok(())
    }

    fn validate_manager_compatibility() -> Result<(), E4ContractError> {
        if manager_v2_contract::MAXIMUM_PAGE_ROWS != 200
            || manager_v2_contract::MAXIMUM_RESPONSE_BYTES != 1_048_576
            || manager_v2_contract::RUNTIME_CONTRACT_REVISION
                != "trading-system.portal-execution.manager-v2.runtime.v1"
        {
            return Err(E4ContractError::InvalidIdentity);
        }
        let assets = [
            E4_SOURCE_CATALOGUE_JSON,
            E4_DOMAIN_CAPABILITIES_JSON,
            E4_OPERATION_BINDINGS_JSON,
            E4_EVENT_COVERAGE_JSON,
            E4_GOLDEN_FIXTURES_JSON,
            E4_CONTRACT_MANIFEST_JSON,
        ];
        if assets.into_iter().any(|asset| {
            asset.contains("/portal/execution/v4") || contains_forbidden_transport_or_secret(asset)
        }) {
            return Err(E4ContractError::InvalidIdentity);
        }
        Ok(())
    }
}

fn validate_read_envelope(
    envelope: &ReadEnvelope,
    source_ids: &BTreeSet<&str>,
) -> Result<(), E4ContractError> {
    if envelope.schema_version != E4_READ_ENVELOPE_SCHEMA_ID
        || invalid_text(&envelope.source_contract_revision)
        || invalid_text(&envelope.logical_operation_id)
        || invalid_text(envelope.lineage.profile_id.as_str())
        || has_duplicate_or_invalid_allow_empty(&envelope.lineage.lineage_limitations)
        || invalid_text(envelope.source_health.source_id.as_str())
        || invalid_text(&envelope.source_health.correction_status)
        || invalid_text(&envelope.source_health.reason_code)
        || envelope
            .source_health
            .global_sequence
            .as_deref()
            .is_some_and(invalid_text)
        || !source_ids.contains(envelope.source_health.source_id.as_str())
        || envelope.page.source_contract_revision != envelope.source_contract_revision
        || envelope.page.source_id.as_str() != envelope.source_health.source_id.as_str()
        || envelope.page.logical_operation_id != envelope.logical_operation_id
        || envelope.page.profile_id.as_str() != envelope.lineage.profile_id.as_str()
        || invalid_text(&envelope.page.source_contract_revision)
        || invalid_text(&envelope.page.logical_operation_id)
        || (envelope.page.has_more != envelope.page.next_cursor.is_some())
        || (!envelope.page.has_more && envelope.page.next_cursor.is_some())
        || envelope
            .page
            .next_cursor
            .as_ref()
            .is_some_and(|cursor| OpaqueContinuation::new(cursor.token.clone()).is_err())
    {
        return Err(E4ContractError::InvalidContinuation);
    }
    if envelope.source_health.global_sequence.is_some()
        || envelope.source_health.source_epoch.is_some()
        || envelope.source_health.source_status == SourceStatus::AvailableRetainedHistory
    {
        return Err(E4ContractError::InvalidCoverage);
    }
    if envelope
        .page
        .earliest_available_time_ms
        .zip(envelope.page.newest_available_time_ms)
        .is_some_and(|(earliest, newest)| earliest > newest)
    {
        return Err(E4ContractError::InvalidContinuation);
    }
    if envelope.state == FixtureState::Populated && envelope.records.is_empty()
        || envelope.state == FixtureState::Empty && !envelope.records.is_empty()
        || envelope.state == FixtureState::Partial
            && envelope.page.completeness != Completeness::Partial
        || envelope.state == FixtureState::Stale
            && envelope.source_health.freshness != FreshnessStatus::Stale
        || envelope.state == FixtureState::Gap
            && (envelope.page.completeness != Completeness::Gap
                || !envelope.page.resnapshot_required
                || envelope.source_health.source_status != SourceStatus::SourceOwnerGap)
        || envelope.state == FixtureState::Duplicate && envelope.duplicate_records_suppressed == 0
        || envelope.state == FixtureState::Correction
            && !envelope
                .records
                .iter()
                .any(|record| record.correction_of_fixture_record_id.is_some())
        || envelope.state == FixtureState::Continuation && !envelope.page.has_more
    {
        return Err(E4ContractError::InvalidFixture);
    }
    if envelope.state != FixtureState::Duplicate && envelope.duplicate_records_suppressed != 0 {
        return Err(E4ContractError::InvalidFixture);
    }
    for record in &envelope.records {
        if invalid_text(record.fixture_record_id.as_str())
            || record.observed_at_ms < record.effective_at_ms
        {
            return Err(E4ContractError::InvalidFixture);
        }
    }
    Ok(())
}

fn decode<T: for<'de> Deserialize<'de>>(
    source: &'static str,
    name: &'static str,
) -> Result<T, E4ContractError> {
    serde_json::from_str(source).map_err(|_| E4ContractError::InvalidJson(name))
}

fn invalid_text(value: &str) -> bool {
    value.trim().is_empty()
        || value.trim() != value
        || value.to_ascii_uppercase().contains("TBD")
        || value.to_ascii_uppercase().contains("PLACEHOLDER")
}

fn has_duplicate_or_invalid_allow_empty(values: &[String]) -> bool {
    values.iter().any(|value| invalid_text(value))
        || values.iter().collect::<BTreeSet<_>>().len() != values.len()
}

fn has_duplicate_modes(values: &[ProfileMode]) -> bool {
    values.iter().collect::<BTreeSet<_>>().len() != values.len()
}

fn contains_forbidden_transport_or_secret(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    normalized.contains("select ")
        || normalized.contains("postgres://")
        || normalized.contains("redis://")
        || normalized.contains("private key")
        || normalized.contains("password=")
        || normalized.contains("authorization:")
}
