#![forbid(unsafe_code)]

//! E7's digest-bound owner-return boundary.
//!
//! This crate validates only repository-pinned, sanitized return-pack assets.
//! It deliberately opens no network connection and owns no database client,
//! credential, listener, cache, command port or runtime activation. Existing
//! Manager reads remain current-page reads; this authority cannot turn them
//! into an event journal, replay stream or production SLO.

use std::collections::BTreeSet;

use maximum_data_acceptance::{E6AcceptanceError, MaximumDataDomainAcceptance};
use maximum_data_adapter::{E5AdapterError, MaximumDataAdapter};
use maximum_data_contract::{ContractError, MaximumDataContract};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const E7_RETURN_PACK_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e7-return-pack.v1.schema.json"
));
pub const E7_OWNER_RESPONSE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/owner-response.v2.json"
));
pub const E7_RUNTIME_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/DEPLOYED_RUNTIME_MANIFEST.json"
));
pub const E7_CAPACITY_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e7-resilience-capacity.v1.json"
));
pub const E7_RELEASE_COMPATIBILITY_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/RELEASE_COMPATIBILITY_MATRIX.json"
));
pub const E7_RETURN_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e7-return-pack.manifest.json"
));
pub const E7_SHA256_MANIFEST: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/MANIFEST.sha256"
));

pub const E7_RETURN_PACK_VERSION: &str = "portal.execution.maximum-data.e7.return-pack.v1";
pub const E7_OWNER_RESPONSE_VERSION: &str = "portal.execution.edge-owner-response.v2";
pub const E7_RUNTIME_MANIFEST_VERSION: &str =
    "portal.execution.maximum-data.e7.deployed-runtime-manifest.v1";
pub const E7_CAPACITY_VERSION: &str = "portal.execution.maximum-data.e7.resilience-capacity.v1";

const EXPECTED_CAPABILITY_COUNT: usize = 34;
const EXPECTED_SOURCE_GAP_COUNT: usize = 18;
const EXPECTED_PROFILE_COUNT: usize = 3;
const EXPECTED_E3_SHA256: &str =
    "sha256:f9ba8afb8acdf1f863c4de15758fa6e8b63cfd97b69ee0b43d4fc91f3bdbd310";
const EXPECTED_E4_SHA256: &str =
    "sha256:abc4dcfe1f94f69099dc241f2f07c95c6976d919a8e1b7f68bd9fe88873d8984";
const EXPECTED_E5_SHA256: &str =
    "sha256:57a36804838d341b6f67d4abbf15b64878743b3b58141b0af1d6934e6f189909";

const REQUIRED_RETURN_PATHS: [&str; 30] = [
    "MASTER_RESPONSE.md",
    "owner-response.v2.json",
    "DEPLOYED_RUNTIME_MANIFEST.json",
    "SOURCE_SYSTEM_INVENTORY.json",
    "DATABASE_RELATION_CENSUS.csv",
    "COLUMN_SEMANTICS_CATALOG.csv",
    "SOURCE_LINEAGE_GRAPH.json",
    "PROFILE_MODE_VENUE_COVERAGE.json",
    "SCREEN_FIELD_SOURCE_COVERAGE.csv",
    "ACTION_CAPABILITY_COVERAGE.csv",
    "DERIVED_METRIC_FEASIBILITY.csv",
    "EVENT_CONTINUITY_REPORT.md",
    "ORDER_FILL_REPLAY_CAPABILITY.json",
    "RISK_DATA_CAPABILITY.json",
    "ACCOUNTING_EQUITY_CAPABILITY.json",
    "ACCOUNT_BINDING_CAPABILITY.json",
    "MARKET_CONTEXT_CAPABILITY.json",
    "PUBLICATION_HEALTH_CAPABILITY.json",
    "SOURCE_PUBLICATION_PLAN.json",
    "SOURCE_OWNER_GAPS.json",
    "RELEASE_COMPATIBILITY_MATRIX.json",
    "schemas/source-catalog.v1.schema.json",
    "schemas/relation-history.v1.schema.json",
    "schemas/incremental-events.v2.schema.json",
    "schemas/source-health.v1.schema.json",
    "benchmarks/SOURCE_RATE_WINDOWS.csv",
    "benchmarks/EDGE_STREAM_BENCHMARK.json",
    "benchmarks/CROSS_CELL_BENCHMARK.json",
    "benchmarks/FAILURE_RECOVERY_REPORT.md",
    "evidence/EVIDENCE_INDEX.md",
];

const ALLOWED_CAPABILITY_STATUSES: [&str; 4] = [
    "AVAILABLE_DIRECT",
    "AVAILABLE_DERIVED_AT_PORTAL",
    "OWNER_ACTION_REQUIRED",
    "CONTRACT_INCOMPATIBLE",
];

#[derive(Debug, Error)]
pub enum E7ReturnError {
    #[error("embedded E7 JSON is invalid")]
    InvalidJson,
    #[error("the E7 return-pack schema, identity or immutable pins drifted")]
    ContractDrift,
    #[error("the E7 owner response is incomplete, widened or semantically unsafe")]
    OwnerResponseInvalid,
    #[error("the E7 capacity evidence is incomplete or overclaims its measurement")]
    CapacityEvidenceInvalid,
    #[error("the E7 final manifest is incomplete or does not cover the portable return pack")]
    ManifestInvalid,
    #[error(
        "a private path, credential form or raw transport marker appeared in a pinned E7 asset"
    )]
    RedactionViolation,
    #[error("the frozen E3 contract is invalid: {0}")]
    E3(#[from] ContractError),
    #[error("the frozen E5 adapter is invalid: {0}")]
    E5(#[from] E5AdapterError),
    #[error("the frozen E6 acceptance pack is invalid: {0}")]
    E6(#[from] E6AcceptanceError),
}

/// The parsed, static E7 owner return pack.
#[derive(Debug)]
pub struct MaximumDataReturn {
    owner_response: Value,
    capacity: Value,
    manifest: Value,
}

impl MaximumDataReturn {
    /// Validates the repository-pinned complete return pack without contacting
    /// an upstream service.
    ///
    /// # Errors
    ///
    /// Returns an error when an upstream frozen contract, a required return
    /// asset, a capability/gap mapping, a measured bound or a redaction rule
    /// drifts.
    pub fn canonical() -> Result<Self, E7ReturnError> {
        MaximumDataContract::canonical()?;
        MaximumDataAdapter::canonical()?;
        MaximumDataDomainAcceptance::canonical()?;

        let owner_response = decode(E7_OWNER_RESPONSE_JSON)?;
        let capacity = decode(E7_CAPACITY_JSON)?;
        let manifest = decode(E7_RETURN_MANIFEST_JSON)?;
        let pack = Self {
            owner_response,
            capacity,
            manifest,
        };
        pack.validate()?;
        Ok(pack)
    }

    /// Validates all E7-owned documents already embedded in the binary.
    ///
    /// # Errors
    ///
    /// Returns an error instead of silently widening an existing source-read
    /// capability into SQL, event replay, a listener or an unmeasured SLO.
    pub fn validate(&self) -> Result<(), E7ReturnError> {
        validate_schema_identity()?;
        validate_owner_response(&self.owner_response)?;
        validate_capacity(&self.capacity)?;
        validate_manifest(&self.manifest)?;
        validate_redaction()?;
        Ok(())
    }

    /// Returns the accepted owner response as an immutable JSON value.
    #[must_use]
    pub fn owner_response(&self) -> &Value {
        &self.owner_response
    }
}

fn decode(input: &str) -> Result<Value, E7ReturnError> {
    serde_json::from_str(input).map_err(|_| E7ReturnError::InvalidJson)
}

fn object(value: &Value) -> Result<&serde_json::Map<String, Value>, E7ReturnError> {
    value.as_object().ok_or(E7ReturnError::ContractDrift)
}

fn string<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a str, E7ReturnError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or(E7ReturnError::ContractDrift)
}

fn array<'a>(
    object: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a Vec<Value>, E7ReturnError> {
    object
        .get(key)
        .and_then(Value::as_array)
        .ok_or(E7ReturnError::ContractDrift)
}

fn sha256(input: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(input.as_bytes()))
}

fn validate_schema_identity() -> Result<(), E7ReturnError> {
    let schema_value = decode(E7_RETURN_PACK_SCHEMA_JSON)?;
    let schema = object(&schema_value)?;
    if string(schema, "$id")? != E7_RETURN_PACK_VERSION {
        return Err(E7ReturnError::ContractDrift);
    }
    let runtime_value = decode(E7_RUNTIME_MANIFEST_JSON)?;
    let runtime = object(&runtime_value)?;
    if string(runtime, "schema_version")? != E7_RUNTIME_MANIFEST_VERSION {
        return Err(E7ReturnError::ContractDrift);
    }
    Ok(())
}

fn validate_owner_response(owner: &Value) -> Result<(), E7ReturnError> {
    let owner = object(owner)?;
    if string(owner, "schema_version")? != E7_OWNER_RESPONSE_VERSION
        || string(owner, "request_revision")? != "portal.execution.edge-maximum-data-request.v1"
        || !is_sha256(string(owner, "image_digest")?)
        || !is_sha256(string(owner, "catalogue_digest")?)
        || !is_sha256(string(owner, "serving_policy_digest")?)
        || string(owner, "return_pack_digest")? != sha256(E7_RETURN_MANIFEST_JSON)
    {
        return Err(E7ReturnError::OwnerResponseInvalid);
    }
    let pins = object(
        owner
            .get("pins")
            .ok_or(E7ReturnError::OwnerResponseInvalid)?,
    )?;
    if string(pins, "e3_coverage_manifest_sha256")? != EXPECTED_E3_SHA256
        || string(pins, "e4_contract_manifest_sha256")? != EXPECTED_E4_SHA256
        || string(pins, "e5_publication_manifest_sha256")? != EXPECTED_E5_SHA256
        || !is_sha256(string(pins, "e6_acceptance_manifest_sha256")?)
    {
        return Err(E7ReturnError::OwnerResponseInvalid);
    }

    let capabilities = array(owner, "capabilities")?;
    if capabilities.len() != EXPECTED_CAPABILITY_COUNT {
        return Err(E7ReturnError::OwnerResponseInvalid);
    }
    let mut field_ids = BTreeSet::new();
    for capability in capabilities {
        let capability = object(capability)?;
        let field_id = string(capability, "field_id")?;
        if !field_ids.insert(field_id)
            || !ALLOWED_CAPABILITY_STATUSES.contains(&string(capability, "status")?)
        {
            return Err(E7ReturnError::OwnerResponseInvalid);
        }
        for key in [
            "capability_id",
            "operation",
            "schema_revision",
            "history_semantics",
            "timestamp_contract",
            "decimal_contract",
            "reason_code",
            "source_revision",
            "next_owner_action",
        ] {
            if string(capability, key)?.is_empty() {
                return Err(E7ReturnError::OwnerResponseInvalid);
            }
        }
        if capability.get("as_of_ms").and_then(Value::as_u64).is_none()
            || array(capability, "profiles")?.is_empty()
            || array(capability, "impacted_screens")?.is_empty()
            || array(capability, "evidence_references")?.is_empty()
            || capability
                .get("portal_can_proceed")
                .and_then(Value::as_bool)
                .is_none()
        {
            return Err(E7ReturnError::OwnerResponseInvalid);
        }
        let history = string(capability, "history_semantics")?;
        if history.contains("EVENT_HISTORY_AVAILABLE") || history.contains("GLOBAL_SEQUENCE") {
            return Err(E7ReturnError::OwnerResponseInvalid);
        }
    }
    if !field_ids.contains("trade_replay") || !field_ids.contains("deployment_current") {
        return Err(E7ReturnError::OwnerResponseInvalid);
    }

    let gaps = array(owner, "genuine_source_gaps")?;
    if gaps.len() != EXPECTED_SOURCE_GAP_COUNT {
        return Err(E7ReturnError::OwnerResponseInvalid);
    }
    let mut gap_ids = BTreeSet::new();
    for gap in gaps {
        let gap = object(gap)?;
        if !gap_ids.insert(string(gap, "gap_id")?) || string(gap, "required_action")?.is_empty() {
            return Err(E7ReturnError::OwnerResponseInvalid);
        }
    }
    Ok(())
}

fn validate_capacity(capacity: &Value) -> Result<(), E7ReturnError> {
    let capacity = object(capacity)?;
    if string(capacity, "schema_version")? != E7_CAPACITY_VERSION
        || string(capacity, "phase")? != "EX-DP-07"
        || capacity.get("raw_rows_persisted").and_then(Value::as_bool) != Some(false)
        || capacity
            .get("production_slo_established")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err(E7ReturnError::CapacityEvidenceInvalid);
    }
    let profiles = array(capacity, "profiles")?;
    if profiles.len() != EXPECTED_PROFILE_COUNT {
        return Err(E7ReturnError::CapacityEvidenceInvalid);
    }
    let expected = [("PAPER", 1_u64, 1_u64), ("SANDBOX", 1, 1), ("LIVE", 2, 0)];
    for (profile, safe_concurrency, error_count) in expected {
        let row = profiles
            .iter()
            .find(|row| row.get("profile").and_then(Value::as_str) == Some(profile))
            .ok_or(E7ReturnError::CapacityEvidenceInvalid)?;
        let row = object(row)?;
        if row
            .get("maximum_safe_concurrency_observed")
            .and_then(Value::as_u64)
            != Some(safe_concurrency)
            || row.get("source_error_count").and_then(Value::as_u64) != Some(error_count)
            || row.get("tested_concurrency").and_then(Value::as_u64) != Some(2)
            || row.get("page_limit").and_then(Value::as_u64) != Some(1)
            || row.get("maximum_response_bytes").and_then(Value::as_u64) != Some(1_048_576)
        {
            return Err(E7ReturnError::CapacityEvidenceInvalid);
        }
    }
    let transient = array(
        capacity,
        "additional_typed_source_unavailability_observations",
    )?;
    if transient.len() != 1
        || transient[0].get("profile").and_then(Value::as_str) != Some("LIVE")
        || transient[0].get("field_id").and_then(Value::as_str) != Some("order_current")
        || transient[0].get("relation_id").and_then(Value::as_str) != Some("public.orders")
        || transient[0].get("http_status").and_then(Value::as_u64) != Some(503)
        || transient[0].get("status").and_then(Value::as_str) != Some("SOURCE_UNAVAILABLE_OBSERVED")
    {
        return Err(E7ReturnError::CapacityEvidenceInvalid);
    }
    let unmeasured = array(capacity, "external_evidence_requirements")?;
    let required = [
        "GLOBAL_SEQUENCE_AND_GAP_RATE",
        "RETAINED_EVENT_REPLAY_AND_CORRECTION",
        "CROSS_CELL_SGP_INGEST",
        "ONE_FIVE_THIRTY_MINUTE_SOURCE_OUTAGE",
    ];
    if required.iter().any(|needle| {
        !unmeasured
            .iter()
            .any(|item| item.get("requirement_id").and_then(Value::as_str) == Some(*needle))
    }) {
        return Err(E7ReturnError::CapacityEvidenceInvalid);
    }
    Ok(())
}

fn validate_manifest(manifest: &Value) -> Result<(), E7ReturnError> {
    let manifest = object(manifest)?;
    if string(manifest, "schema_version")? != E7_RETURN_PACK_VERSION
        || string(manifest, "phase")? != "EX-DP-07"
        || string(manifest, "status")?
            != "RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES"
    {
        return Err(E7ReturnError::ManifestInvalid);
    }
    let pins = object(manifest.get("pins").ok_or(E7ReturnError::ManifestInvalid)?)?;
    if string(pins, "e3_coverage_manifest_sha256")? != EXPECTED_E3_SHA256
        || string(pins, "e4_contract_manifest_sha256")? != EXPECTED_E4_SHA256
        || string(pins, "e5_publication_manifest_sha256")? != EXPECTED_E5_SHA256
        || !is_sha256(string(pins, "e6_acceptance_manifest_sha256")?)
    {
        return Err(E7ReturnError::ManifestInvalid);
    }
    let paths = array(manifest, "required_paths")?;
    let actual: BTreeSet<&str> = paths.iter().filter_map(Value::as_str).collect();
    if REQUIRED_RETURN_PATHS
        .iter()
        .any(|path| !actual.contains(path))
    {
        return Err(E7ReturnError::ManifestInvalid);
    }
    let sha_manifest_paths: BTreeSet<&str> = E7_SHA256_MANIFEST
        .lines()
        .filter_map(|line| line.split_once("  ").map(|(_, path)| path))
        .collect();
    if REQUIRED_RETURN_PATHS
        .iter()
        .any(|path| !sha_manifest_paths.contains(path))
    {
        return Err(E7ReturnError::ManifestInvalid);
    }
    Ok(())
}

fn validate_redaction() -> Result<(), E7ReturnError> {
    let content = [
        E7_RETURN_PACK_SCHEMA_JSON,
        E7_OWNER_RESPONSE_JSON,
        E7_RUNTIME_MANIFEST_JSON,
        E7_CAPACITY_JSON,
        E7_RELEASE_COMPATIBILITY_JSON,
        E7_RETURN_MANIFEST_JSON,
    ]
    .join("\n")
    .to_ascii_lowercase();
    let forbidden = [
        "/home/",
        "/srv/",
        "postgres://",
        "postgresql://",
        "redis://",
        "authorization:",
        "-----begin",
    ];
    if forbidden.iter().any(|needle| content.contains(needle)) {
        return Err(E7ReturnError::RedactionViolation);
    }
    Ok(())
}

fn is_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests;
