//! EDS-12 fail-closed release qualification authority.
//!
//! This crate validates only the committed qualification shape. It cannot
//! connect to a source, inspect a database, publish an image, activate a
//! profile or represent a release as deployed.

#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use serde_json::Value;
use thiserror::Error;

pub const QUALIFICATION_REVISION: &str = "portal.execution.eds12-release-qualification.v1";
pub const FAILURE_MATRIX_REVISION: &str = "portal.execution.eds12-failure-matrix.v1";

const QUALIFICATION: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/eds12-release-qualification-v1/qualification.v1.json"
));
const FAILURE_MATRIX: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/eds12-release-qualification-v1/failure-matrix.v1.json"
));

#[derive(Debug, Error, Eq, PartialEq)]
pub enum QualificationError {
    #[error("EDS-12 qualification contract is malformed")]
    Malformed,
    #[error("EDS-12 profile isolation or authority was widened")]
    AuthorityWidened,
    #[error("EDS-12 failure matrix drifted")]
    FailureMatrixDrift,
    #[error("EDS-12 source-extension policy drifted")]
    SourceExtensionDrift,
    #[error("EDS-12 release gate drifted")]
    ReleaseGateDrift,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QualificationSummary {
    pub profile_stage_count: usize,
    pub failure_scenario_count: usize,
    pub source_extension_count: usize,
    pub product_active: bool,
    pub operations_qualified: bool,
}

/// Validates the embedded EDS-12 static qualification contract.
///
/// # Errors
///
/// Returns a stable error if a source-dark static contract widens runtime
/// authority, drops a failure scenario, hides an EDS-12 source extension, or
/// claims deployed-product acceptance without external evidence.
pub fn validate_embedded_qualification() -> Result<QualificationSummary, QualificationError> {
    let qualification: Value =
        serde_json::from_str(QUALIFICATION).map_err(|_| QualificationError::Malformed)?;
    let failure_matrix: Value =
        serde_json::from_str(FAILURE_MATRIX).map_err(|_| QualificationError::Malformed)?;
    validate_qualification(&qualification, &failure_matrix)
}

/// Validates a caller-provided static qualification contract and failure matrix.
///
/// The public form is intentionally pure so a deployment layer can validate a
/// candidate before it receives any runtime capability.
///
/// # Errors
///
/// Returns a stable rejection when the candidate is malformed, widens
/// authority, drifts from the exact profile/failure/source-extension set, or
/// claims a release gate that the committed source qualification does not
/// permit.
pub fn validate_qualification(
    qualification: &Value,
    failure_matrix: &Value,
) -> Result<QualificationSummary, QualificationError> {
    if text(qualification, "/schema_version") != Some(QUALIFICATION_REVISION)
        || text(qualification, "/phase") != Some("EDS-12")
        || text(qualification, "/decision")
            != Some("EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING")
        || text(qualification, "/runtime_effect") != Some("NONE")
    {
        return Err(QualificationError::Malformed);
    }

    validate_p01_r4_r5_boundary(qualification)?;
    let profile_stage_count = validate_profiles(qualification)?;
    let failure_scenario_count = validate_failure_matrix(qualification, failure_matrix)?;
    let source_extension_count = validate_source_extensions(qualification)?;
    validate_release_gates(qualification)?;
    validate_authority(qualification)?;
    validate_rollback(qualification)?;

    Ok(QualificationSummary {
        profile_stage_count,
        failure_scenario_count,
        source_extension_count,
        product_active: boolean(qualification, "/authority/product_active")?,
        operations_qualified: boolean(qualification, "/authority/operations_qualified")?,
    })
}

fn validate_p01_r4_r5_boundary(qualification: &Value) -> Result<(), QualificationError> {
    if text(
        qualification,
        "/baseline/p01_r4_r5_source_integration/p01_base",
    ) != Some("f9e3d94613b1b9421043ce38e9a778d243124c69")
        || text(
            qualification,
            "/baseline/p01_r4_r5_source_integration/integration_ref",
        ) != Some("integration/portal-r4r5-p01-final")
        || text(
            qualification,
            "/baseline/p01_r4_r5_source_integration/integration_commit",
        ) != Some("98c47b3a66668b6082a60767cc94bfd2359a607f")
        || number(
            qualification,
            "/baseline/p01_r4_r5_source_integration/lease_ttl_seconds",
        )? != 900
        || !boolean(
            qualification,
            "/baseline/p01_r4_r5_source_integration/source_only",
        )?
        || boolean(
            qualification,
            "/baseline/p01_r4_r5_source_integration/runtime_activation",
        )?
    {
        return Err(QualificationError::AuthorityWidened);
    }
    Ok(())
}

fn validate_profiles(qualification: &Value) -> Result<usize, QualificationError> {
    let rows = array(qualification, "/profiles")?;
    let actual: BTreeSet<_> = rows
        .iter()
        .map(|row| {
            (
                text(row, "/profile_id"),
                text(row, "/stage"),
                text(row, "/read_authority"),
                text(row, "/sse_authority"),
                text(row, "/command_authority"),
                text(row, "/live_mutation_authority"),
            )
        })
        .collect();
    let expected = BTreeSet::from([
        (
            Some("PAPER_BINANCE_USDM"),
            Some("PAPER"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DISABLED"),
            Some("DISABLED"),
        ),
        (
            Some("SANDBOX_BINANCE_USDM"),
            Some("SANDBOX"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DISABLED"),
            Some("DISABLED"),
        ),
        (
            Some("LIVE_BINANCE_USDM"),
            Some("CANARY_OVER_LIVE"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DISABLED"),
            Some("DISABLED"),
        ),
        (
            Some("LIVE_BINANCE_USDM"),
            Some("LIVE"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DEPLOYED_EVIDENCE_REQUIRED"),
            Some("DISABLED"),
            Some("DISABLED"),
        ),
    ]);
    if actual != expected || rows.len() != expected.len() {
        return Err(QualificationError::AuthorityWidened);
    }
    Ok(rows.len())
}

fn validate_failure_matrix(
    qualification: &Value,
    failure_matrix: &Value,
) -> Result<usize, QualificationError> {
    if text(failure_matrix, "/schema_version") != Some(FAILURE_MATRIX_REVISION)
        || text(failure_matrix, "/phase") != Some("EDS-12")
        || text(failure_matrix, "/runtime_effect") != Some("NONE")
        || text(qualification, "/failure_matrix/schema_version") != Some(FAILURE_MATRIX_REVISION)
        || number(qualification, "/failure_matrix/scenario_count")? != 10
    {
        return Err(QualificationError::FailureMatrixDrift);
    }
    let scenarios = array(failure_matrix, "/scenarios")?;
    let actual: BTreeSet<_> = scenarios
        .iter()
        .filter_map(|row| text(row, "/id"))
        .collect();
    let expected = BTreeSet::from([
        "SOURCE_OUTAGE",
        "NETWORK_PARTITION",
        "EDGE_UNAVAILABLE",
        "SGP_PROJECTION_DB_UNAVAILABLE",
        "DISK_PRESSURE",
        "CURSOR_EXPIRED_OR_CYCLE",
        "EPOCH_CHANGE",
        "SCHEMA_OR_CATALOGUE_INCOMPATIBLE",
        "CORRUPT_FRAME",
        "LATE_CORRECTION",
    ]);
    if actual != expected || scenarios.len() != expected.len() {
        return Err(QualificationError::FailureMatrixDrift);
    }
    for scenario in scenarios {
        if text(scenario, "/reader_state").is_none()
            || array(scenario, "/forbidden")?.is_empty()
            || text(scenario, "/offline_proof").is_none()
            || text(scenario, "/runtime_proof").is_none()
            || text(scenario, "/recovery").is_none()
        {
            return Err(QualificationError::FailureMatrixDrift);
        }
    }
    Ok(scenarios.len())
}

fn validate_source_extensions(qualification: &Value) -> Result<usize, QualificationError> {
    let rows = array(qualification, "/source_extensions")?;
    let actual: BTreeSet<_> = rows
        .iter()
        .map(|row| (text(row, "/request_id"), text(row, "/state")))
        .collect();
    let expected = BTreeSet::from([
        (Some("BR-EX-80"), Some("SOURCE_OWNER_RETURN_REQUIRED")),
        (
            Some("BR-EX-81"),
            Some("SOURCE_PAGING_AND_DRAIN_PROOF_REQUIRED"),
        ),
    ]);
    if actual != expected || rows.len() != expected.len() {
        return Err(QualificationError::SourceExtensionDrift);
    }
    for row in rows {
        if text(row, "/required_proof").is_none() || text(row, "/fallback").is_none() {
            return Err(QualificationError::SourceExtensionDrift);
        }
    }
    Ok(rows.len())
}

fn validate_release_gates(qualification: &Value) -> Result<(), QualificationError> {
    let gates = object(qualification, "/release_gates")?;
    let expected = [
        ("static_contract_and_mutation", "REQUIRED"),
        ("offline_dr_restore_rebuild", "REQUIRED"),
        ("protected_main_signed_images_sbom_provenance", "REQUIRED"),
        ("exact_deployed_browser_state_matrix", "REQUIRED"),
        ("profile_isolation_and_redaction", "REQUIRED"),
        ("p0_p1_integrity_issues", "ZERO_REQUIRED"),
        ("owner_visual_data_action_parity", "REQUIRED"),
        ("product_active", "FORBIDDEN_UNTIL_ALL_REQUIRED_EVIDENCE"),
    ];
    if gates.len() != expected.len()
        || expected.iter().any(|(key, expected_value)| {
            gates.get(*key).and_then(Value::as_str) != Some(*expected_value)
        })
    {
        return Err(QualificationError::ReleaseGateDrift);
    }
    Ok(())
}

fn validate_authority(qualification: &Value) -> Result<(), QualificationError> {
    if !boolean(qualification, "/authority/qualification_pack_authorized")?
        || boolean(qualification, "/authority/source_activation_authorized")?
        || boolean(qualification, "/authority/query_activation_authorized")?
        || boolean(qualification, "/authority/sse_activation_authorized")?
        || boolean(qualification, "/authority/command_activation_authorized")?
        || boolean(qualification, "/authority/live_mutation_authorized")?
        || boolean(qualification, "/authority/stable_release_authorized")?
        || boolean(qualification, "/authority/product_active")?
        || boolean(qualification, "/authority/operations_qualified")?
    {
        return Err(QualificationError::AuthorityWidened);
    }
    Ok(())
}

fn validate_rollback(qualification: &Value) -> Result<(), QualificationError> {
    if text(qualification, "/rollback/strategy") != Some("PROFILE_LOCAL_READER_ROLLBACK_ONLY")
        || text(qualification, "/rollback/first_action")
            != Some("disable affected named BFF/read/SSE profile before Edge or source changes")
    {
        return Err(QualificationError::ReleaseGateDrift);
    }
    let forbidden: BTreeSet<_> = array(qualification, "/rollback/forbidden")?
        .iter()
        .filter_map(Value::as_str)
        .collect();
    let expected = BTreeSet::from([
        "trading_system_data_mutation",
        "projection_truncate",
        "automatic_command_retry",
        "cross_profile_fallback",
    ]);
    if forbidden != expected {
        return Err(QualificationError::ReleaseGateDrift);
    }
    Ok(())
}

fn text<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn number(value: &Value, pointer: &str) -> Result<u64, QualificationError> {
    value
        .pointer(pointer)
        .and_then(Value::as_u64)
        .ok_or(QualificationError::Malformed)
}

fn boolean(value: &Value, pointer: &str) -> Result<bool, QualificationError> {
    value
        .pointer(pointer)
        .and_then(Value::as_bool)
        .ok_or(QualificationError::Malformed)
}

fn array<'a>(value: &'a Value, pointer: &str) -> Result<&'a [Value], QualificationError> {
    value
        .pointer(pointer)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or(QualificationError::Malformed)
}

fn object<'a>(
    value: &'a Value,
    pointer: &str,
) -> Result<&'a serde_json::Map<String, Value>, QualificationError> {
    value
        .pointer(pointer)
        .and_then(Value::as_object)
        .ok_or(QualificationError::Malformed)
}

#[cfg(test)]
mod tests;
