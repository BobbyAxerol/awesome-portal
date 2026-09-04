#![forbid(unsafe_code)]

//! E6's offline domain-acceptance and source-health boundary.
//!
//! This crate validates the frozen E3/E4/E5 contracts and a sanitized
//! read-only Manager qualification capture. It deliberately owns no network
//! client, database connection, credential, listener, cache, command port or
//! runtime activation.

use std::collections::{BTreeMap, BTreeSet};

use manager_v2_contract::RUNTIME_CONTRACT_REVISION;
use maximum_data_adapter::{
    E5AdapterError, MaximumDataAdapter, E5_PUBLICATION_JSON, E5_PUBLICATION_MANIFEST_JSON,
};
use maximum_data_contract::{
    E4Contract, E4ContractError, E3_COVERAGE_MANIFEST_JSON, E4_CONTRACT_MANIFEST_JSON,
};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const E6_DOMAIN_ACCEPTANCE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e6-domain-acceptance.v1.schema.json"
));
pub const E6_RUNTIME_EVIDENCE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e6-runtime-evidence.v1.schema.json"
));
pub const E6_DOMAIN_ACCEPTANCE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e6-domain-acceptance.v1.json"
));
pub const E6_RUNTIME_EVIDENCE_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e6-runtime-evidence.v1.json"
));
pub const E6_ACCEPTANCE_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e6-acceptance.manifest.json"
));

pub const E6_DOMAIN_ACCEPTANCE_VERSION: &str =
    "portal.execution.maximum-data.e6.domain-acceptance.v1";
pub const E6_RUNTIME_EVIDENCE_VERSION: &str =
    "portal.execution.maximum-data.e6.runtime-evidence.v1";
pub const E6_ACCEPTANCE_MANIFEST_VERSION: &str =
    "portal.execution.maximum-data.e6.acceptance-manifest.v1";

const MAXIMUM_RESPONSE_BYTES: usize = 1_048_576;
const EXPECTED_MANAGER_RELATION_COUNT: usize = 19;
const EXPECTED_CATALOGUE_RELATION_COUNT: usize = 96;
const EXPECTED_DOMAIN_COUNT: usize = 11;
const EXPECTED_CAPTURE_COUNT: usize = 3;
const EXPECTED_NEGATIVE_CHECK_COUNT: usize = 6;
const EXPECTED_OBSERVATION_COUNT: usize = EXPECTED_CAPTURE_COUNT * EXPECTED_MANAGER_RELATION_COUNT;

const PROFILE_BINDINGS: [(&str, &str); EXPECTED_CAPTURE_COUNT] = [
    ("PAPER", "PAPER_BINANCE_USDM"),
    ("SANDBOX", "SANDBOX_BINANCE_USDM"),
    ("LIVE", "LIVE_BINANCE_USDM"),
];

const ACCEPTANCE_STATUSES: [&str; 6] = [
    "ACCEPTED_CURRENT_STATE_WITH_TYPED_LIMITATIONS",
    "ACCEPTED_NAMED_DERIVATION_WITH_TYPED_LIMITATIONS",
    "ACCEPTED_CURRENT_STATE_ONLY",
    "ACCEPTED_BOUNDED_READ_WITH_TYPED_LIMITATIONS",
    "ACCEPTED_BOUNDED_SNAPSHOT_READ_WITH_TYPED_LIMITATIONS",
    "ACCEPTED_READ_ONLY_JOURNAL_WITH_TYPED_LIMITATIONS",
];

#[derive(Debug, Error)]
pub enum E6AcceptanceError {
    #[error("embedded E6 JSON is invalid")]
    InvalidJson,
    #[error("E6 schema, identity, manifest or immutable pin drifted")]
    ContractDrift,
    #[error("E6 domain acceptance claims an unsupported source semantic")]
    UnsupportedDomainClaim,
    #[error("E6 sanitized runtime evidence is incomplete or inconsistent")]
    RuntimeEvidenceInvalid,
    #[error("E6 authority widened beyond offline acceptance")]
    AuthorityWidened,
    #[error("the frozen E4 contract is invalid: {0}")]
    E4(#[from] E4ContractError),
    #[error("the frozen E5 adapter is invalid: {0}")]
    E5(#[from] E5AdapterError),
}

/// A digest-bound, offline E6 acceptance pack.
#[derive(Debug)]
pub struct MaximumDataDomainAcceptance {
    domain_acceptance: DomainAcceptance,
    runtime_evidence: RuntimeEvidence,
    manifest: AcceptanceManifest,
}

impl MaximumDataDomainAcceptance {
    /// Parses and validates the repository-pinned E6 pack.
    ///
    /// # Errors
    ///
    /// Returns an error when any E3/E4/E5 pin, domain limitation, runtime
    /// observation, negative check or artifact digest drifts.
    pub fn canonical() -> Result<Self, E6AcceptanceError> {
        let acceptance = decode(E6_DOMAIN_ACCEPTANCE_JSON)?;
        let evidence = decode(E6_RUNTIME_EVIDENCE_JSON)?;
        let manifest = decode(E6_ACCEPTANCE_MANIFEST_JSON)?;
        let pack = Self {
            domain_acceptance: acceptance,
            runtime_evidence: evidence,
            manifest,
        };
        pack.validate()?;
        Ok(pack)
    }

    /// Validates the entire E6 pack without opening a source connection.
    ///
    /// # Errors
    ///
    /// Returns an error if a frozen source contract, domain ruling, redaction
    /// boundary or runtime evidence assertion is invalid.
    pub fn validate(&self) -> Result<(), E6AcceptanceError> {
        let e4 = E4Contract::canonical()?;
        MaximumDataAdapter::canonical()?;
        validate_schema_documents()?;
        validate_identity(&self.domain_acceptance, &self.runtime_evidence)?;
        validate_authority(&self.domain_acceptance.authority)?;
        let e5_entries = e5_entries()?;
        validate_domains(&self.domain_acceptance, &e4, &e5_entries)?;
        validate_runtime(&self.runtime_evidence, &e5_entries)?;
        validate_manifest(&self.manifest)?;
        validate_no_raw_or_forbidden_content()?;
        Ok(())
    }

    /// Returns the exact E6 asset digests represented by the manifest.
    #[must_use]
    pub fn asset_digests(&self) -> BTreeMap<String, String> {
        e6_asset_digests()
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DomainAcceptance {
    schema_version: String,
    phase: String,
    status: String,
    e3_coverage_manifest_sha256: String,
    e4_contract_manifest_sha256: String,
    e5_publication_manifest_sha256: String,
    global_source_health: GlobalSourceHealth,
    domains: Vec<DomainRuling>,
    authority: AcceptanceAuthority,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct GlobalSourceHealth {
    manager_envelope: String,
    global_sequence: String,
    retention_floor: String,
    event_replay: String,
    correction: String,
    empty: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DomainRuling {
    domain_id: String,
    acceptance_status: String,
    field_ids: Vec<String>,
    accepted_semantics: Vec<String>,
    typed_source_owner_gap_ids: Vec<String>,
    owner_action: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "each denied authority is an independently pinned owner boundary"
)]
struct AcceptanceAuthority {
    direct_database_access: bool,
    direct_redis_access: bool,
    raw_relation_or_sql_selection: bool,
    source_identity_or_credential: bool,
    source_network_change: bool,
    command_or_cli_execution: bool,
    runtime_activation: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeEvidence {
    schema_version: String,
    phase: String,
    status: String,
    capture_method: String,
    raw_data_persisted: bool,
    e3_coverage_manifest_sha256: String,
    e4_contract_manifest_sha256: String,
    e5_publication_manifest_sha256: String,
    captures: Vec<ProfileCapture>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ProfileCapture {
    schema_version: String,
    capture_method: String,
    profile: String,
    captured_at_utc: String,
    request_bounds: RequestBounds,
    catalogue: CatalogueObservation,
    relation_observations: Vec<RelationObservation>,
    negative_checks: NegativeChecks,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RequestBounds {
    relation_page_limit: usize,
    maximum_response_bytes: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct CatalogueObservation {
    http_status: u16,
    content_type: String,
    response_bytes: usize,
    body_sha256: String,
    contract_version: String,
    authority: String,
    profile_id: String,
    catalogue_sha256: String,
    availability: String,
    freshness: String,
    completeness: String,
    as_of_utc: String,
    relation_count: usize,
    fixed_relation_count: usize,
    all_fixed_relations_present: bool,
    profile_binding_valid: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "each observation flag independently proves a source safety property"
)]
struct RelationObservation {
    http_status: u16,
    content_type: String,
    response_bytes: usize,
    body_sha256: String,
    contract_version: String,
    authority: String,
    profile_id: String,
    catalogue_sha256: String,
    availability: String,
    freshness: String,
    completeness: String,
    as_of_utc: String,
    field_id: String,
    relation_id: String,
    expected_profile_id: String,
    profile_binding_valid: bool,
    relation_binding_valid: bool,
    item_count: usize,
    page_bound_valid: bool,
    has_next_cursor: bool,
    primary_resource_key_status: String,
    record_field_shape_sha256: Option<String>,
    observed_state: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct NegativeChecks {
    missing_client_certificate: MissingClientCertificate,
    read_identity_post_method_denial: MethodDenial,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct MissingClientCertificate {
    outcome: String,
    error_class: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct MethodDenial {
    http_status: u16,
    denied: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct AcceptanceManifest {
    schema_version: String,
    phase: String,
    status: String,
    e3_coverage_manifest_sha256: String,
    e4_contract_manifest_sha256: String,
    e5_publication_manifest_sha256: String,
    counts: AcceptanceCounts,
    runtime_mutations: RuntimeMutations,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_field_names,
    reason = "the fields mirror the versioned JSON manifest names"
)]
struct AcceptanceCounts {
    domain_count: usize,
    profile_capture_count: usize,
    manager_relation_observation_count: usize,
    negative_check_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct RuntimeMutations {
    database: String,
    source_identity: String,
    route: String,
    listener: String,
    projection_or_cache: String,
    command_port: String,
    deployment: String,
}

#[derive(Debug, Deserialize)]
struct E5Registry {
    entries: Vec<E5RegistryEntry>,
}

#[derive(Debug, Deserialize)]
struct E5RegistryEntry {
    field_id: String,
    implementation: String,
    manager_relation_id: Option<String>,
    profiles: Vec<String>,
}

fn decode<T: for<'de> Deserialize<'de>>(document: &'static str) -> Result<T, E6AcceptanceError> {
    serde_json::from_str(document).map_err(|_| E6AcceptanceError::InvalidJson)
}

fn validate_schema_documents() -> Result<(), E6AcceptanceError> {
    validate_schema(
        E6_DOMAIN_ACCEPTANCE_SCHEMA_JSON,
        "portal.execution.maximum-data.e6.domain-acceptance.schema.v1",
    )?;
    validate_schema(
        E6_RUNTIME_EVIDENCE_SCHEMA_JSON,
        "portal.execution.maximum-data.e6.runtime-evidence.schema.v1",
    )
}

fn validate_schema(document: &str, expected_id: &str) -> Result<(), E6AcceptanceError> {
    let value: Value =
        serde_json::from_str(document).map_err(|_| E6AcceptanceError::InvalidJson)?;
    if value["$schema"] != "https://json-schema.org/draft/2020-12/schema"
        || value["$id"] != expected_id
        || value["type"] != "object"
        || value["additionalProperties"] != false
        || value["required"].as_array().is_none_or(Vec::is_empty)
        || value["properties"]
            .as_object()
            .is_none_or(serde_json::Map::is_empty)
    {
        return Err(E6AcceptanceError::ContractDrift);
    }
    Ok(())
}

fn validate_identity(
    acceptance: &DomainAcceptance,
    evidence: &RuntimeEvidence,
) -> Result<(), E6AcceptanceError> {
    let e3_digest = sha256(E3_COVERAGE_MANIFEST_JSON.as_bytes());
    let e4_digest = sha256(E4_CONTRACT_MANIFEST_JSON.as_bytes());
    let e5_digest = sha256(E5_PUBLICATION_MANIFEST_JSON.as_bytes());
    let acceptance_pins = acceptance.e3_coverage_manifest_sha256 == e3_digest
        && acceptance.e4_contract_manifest_sha256 == e4_digest
        && acceptance.e5_publication_manifest_sha256 == e5_digest;
    let evidence_pins = evidence.e3_coverage_manifest_sha256 == e3_digest
        && evidence.e4_contract_manifest_sha256 == e4_digest
        && evidence.e5_publication_manifest_sha256 == e5_digest;
    let source_health = &acceptance.global_source_health;
    if acceptance.schema_version != E6_DOMAIN_ACCEPTANCE_VERSION
        || acceptance.phase != "EX-DP-06"
        || acceptance.status != "EDGE_SHADOW_VERIFIED"
        || evidence.schema_version != E6_RUNTIME_EVIDENCE_VERSION
        || evidence.phase != "EX-DP-06"
        || evidence.status != "SAME_HOST_READ_ONLY_QUALIFIED"
        || evidence.capture_method != "SAME_HOST_EXISTING_EDGE_MTLS_READ_ONLY"
        || evidence.raw_data_persisted
        || !acceptance_pins
        || !evidence_pins
        || source_health.manager_envelope != "PROFILE_BOUND_AVAILABLE_FRESH_COMPLETENESS_EXPLICIT"
        || source_health.global_sequence != "NOT_PROVEN"
        || source_health.retention_floor != "UNDECLARED_BY_MANAGER_ENVELOPE"
        || source_health.event_replay != "NOT_ACCEPTED"
        || source_health.correction != "NOT_OBSERVABLE_FROM_MANAGER_PAGE"
        || source_health.empty != "AUTHORITATIVE_EMPTY_ONLY_WHEN_AVAILABLE_COMPLETE_AND_ZERO_ITEMS"
    {
        return Err(E6AcceptanceError::ContractDrift);
    }
    Ok(())
}

fn validate_authority(authority: &AcceptanceAuthority) -> Result<(), E6AcceptanceError> {
    if authority.direct_database_access
        || authority.direct_redis_access
        || authority.raw_relation_or_sql_selection
        || authority.source_identity_or_credential
        || authority.source_network_change
        || authority.command_or_cli_execution
        || authority.runtime_activation
    {
        return Err(E6AcceptanceError::AuthorityWidened);
    }
    Ok(())
}

fn e5_entries() -> Result<BTreeMap<String, E5RegistryEntry>, E6AcceptanceError> {
    let registry: E5Registry = decode(E5_PUBLICATION_JSON)?;
    let mut entries = BTreeMap::new();
    for entry in registry.entries {
        if !nonblank(&entry.field_id) || entries.insert(entry.field_id.clone(), entry).is_some() {
            return Err(E6AcceptanceError::ContractDrift);
        }
    }
    Ok(entries)
}

fn validate_domains(
    acceptance: &DomainAcceptance,
    e4: &E4Contract,
    e5_entries: &BTreeMap<String, E5RegistryEntry>,
) -> Result<(), E6AcceptanceError> {
    let expected = e4
        .domain_capabilities
        .domains
        .iter()
        .map(|domain| (domain.domain_id.as_str(), domain))
        .collect::<BTreeMap<_, _>>();
    let actual_ids = acceptance
        .domains
        .iter()
        .map(|domain| domain.domain_id.as_str())
        .collect::<BTreeSet<_>>();
    if acceptance.domains.len() != EXPECTED_DOMAIN_COUNT
        || actual_ids.len() != acceptance.domains.len()
        || actual_ids != expected.keys().copied().collect()
    {
        return Err(E6AcceptanceError::ContractDrift);
    }
    let e4_fields = e4
        .operation_bindings
        .bindings
        .iter()
        .map(|binding| binding.field_id.as_str())
        .collect::<BTreeSet<_>>();
    for domain in &acceptance.domains {
        let Some(expected_domain) = expected.get(domain.domain_id.as_str()) else {
            return Err(E6AcceptanceError::ContractDrift);
        };
        let field_ids = domain
            .field_ids
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let accepted_semantics = domain
            .accepted_semantics
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let typed_gaps = domain
            .typed_source_owner_gap_ids
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let expected_gaps = expected_domain
            .source_owner_gap_ids
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let fields_valid = !field_ids.is_empty()
            && field_ids.len() == domain.field_ids.len()
            && field_ids
                .iter()
                .all(|field_id| e4_fields.contains(field_id) && e5_entries.contains_key(*field_id));
        let semantic_text_valid = !accepted_semantics.is_empty()
            && accepted_semantics.len() == domain.accepted_semantics.len()
            && domain.accepted_semantics.iter().all(|semantic| {
                nonblank(semantic)
                    && !semantic.contains("GLOBAL_SEQUENCE_PROVEN")
                    && !semantic.contains("EVENT_REPLAY_ACCEPTED")
                    && !semantic.contains("FULL_RETAINED_HISTORY_ACCEPTED")
            });
        let status_valid = ACCEPTANCE_STATUSES.contains(&domain.acceptance_status.as_str())
            || domain.acceptance_status == "TYPED_SOURCE_OWNER_GAP_WITH_INSTRUMENT_REFERENCE";
        let gaps_valid = typed_gaps.len() == domain.typed_source_owner_gap_ids.len()
            && typed_gaps == expected_gaps;
        let owner_action_valid = if expected_gaps.is_empty() {
            domain.owner_action == "NOT_REQUIRED_CURRENT_SOURCE_BOUNDARY"
                && domain.acceptance_status == "ACCEPTED_CURRENT_STATE_ONLY"
        } else {
            nonblank(&domain.owner_action)
                && domain.owner_action != "NOT_REQUIRED_CURRENT_SOURCE_BOUNDARY"
                && domain.acceptance_status.contains("TYPED")
        };
        if !fields_valid
            || !semantic_text_valid
            || !status_valid
            || !gaps_valid
            || !owner_action_valid
        {
            return Err(E6AcceptanceError::UnsupportedDomainClaim);
        }
    }
    Ok(())
}

fn validate_runtime(
    evidence: &RuntimeEvidence,
    e5_entries: &BTreeMap<String, E5RegistryEntry>,
) -> Result<(), E6AcceptanceError> {
    let manager_entries = manager_entries(e5_entries)?;
    let expected_profiles = PROFILE_BINDINGS.into_iter().collect::<BTreeMap<_, _>>();
    let actual_profiles = evidence
        .captures
        .iter()
        .map(|capture| capture.profile.as_str())
        .collect::<BTreeSet<_>>();
    if evidence.captures.len() != EXPECTED_CAPTURE_COUNT
        || actual_profiles.len() != evidence.captures.len()
        || actual_profiles != expected_profiles.keys().copied().collect()
    {
        return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
    }
    for capture in &evidence.captures {
        let Some(expected_profile_id) = expected_profiles.get(capture.profile.as_str()) else {
            return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
        };
        validate_capture(capture, expected_profile_id, &manager_entries)?;
    }
    Ok(())
}

fn manager_entries(
    e5_entries: &BTreeMap<String, E5RegistryEntry>,
) -> Result<BTreeMap<&str, &str>, E6AcceptanceError> {
    let mut entries = BTreeMap::new();
    for entry in e5_entries.values() {
        if entry.implementation != "MANAGER_RELATION_PAGE" {
            continue;
        }
        let Some(relation_id) = entry.manager_relation_id.as_deref() else {
            return Err(E6AcceptanceError::ContractDrift);
        };
        if entry.profiles != ["PAPER", "SANDBOX", "LIVE"]
            || entries
                .insert(entry.field_id.as_str(), relation_id)
                .is_some()
        {
            return Err(E6AcceptanceError::ContractDrift);
        }
    }
    if entries.len() != EXPECTED_MANAGER_RELATION_COUNT {
        return Err(E6AcceptanceError::ContractDrift);
    }
    Ok(entries)
}

fn validate_capture(
    capture: &ProfileCapture,
    expected_profile_id: &str,
    manager_entries: &BTreeMap<&str, &str>,
) -> Result<(), E6AcceptanceError> {
    let catalogue = &capture.catalogue;
    if capture.schema_version != E6_RUNTIME_EVIDENCE_VERSION
        || capture.capture_method != "SAME_HOST_EXISTING_EDGE_MTLS_READ_ONLY"
        || !utc_timestamp(&capture.captured_at_utc)
        || capture.request_bounds.relation_page_limit != 1
        || capture.request_bounds.maximum_response_bytes != MAXIMUM_RESPONSE_BYTES
        || catalogue.http_status != 200
        || catalogue.content_type != "application/json"
        || catalogue.response_bytes > MAXIMUM_RESPONSE_BYTES
        || !sha256_digest(&catalogue.body_sha256)
        || catalogue.contract_version != RUNTIME_CONTRACT_REVISION
        || catalogue.authority != "EXECUTION_CELL"
        || catalogue.profile_id != expected_profile_id
        || !sha256_digest(&catalogue.catalogue_sha256)
        || catalogue.availability != "AVAILABLE"
        || catalogue.freshness != "FRESH"
        || catalogue.completeness != "COMPLETE"
        || !utc_timestamp(&catalogue.as_of_utc)
        || catalogue.relation_count != EXPECTED_CATALOGUE_RELATION_COUNT
        || catalogue.fixed_relation_count != EXPECTED_MANAGER_RELATION_COUNT
        || !catalogue.all_fixed_relations_present
        || !catalogue.profile_binding_valid
    {
        return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
    }
    validate_observations(capture, expected_profile_id, manager_entries)?;
    validate_negative_checks(&capture.negative_checks)
}

fn validate_observations(
    capture: &ProfileCapture,
    expected_profile_id: &str,
    manager_entries: &BTreeMap<&str, &str>,
) -> Result<(), E6AcceptanceError> {
    let actual_field_ids = capture
        .relation_observations
        .iter()
        .map(|observation| observation.field_id.as_str())
        .collect::<BTreeSet<_>>();
    if capture.relation_observations.len() != EXPECTED_MANAGER_RELATION_COUNT
        || actual_field_ids.len() != capture.relation_observations.len()
        || actual_field_ids != manager_entries.keys().copied().collect()
    {
        return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
    }
    for observation in &capture.relation_observations {
        let Some(expected_relation_id) = manager_entries.get(observation.field_id.as_str()) else {
            return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
        };
        let state = expected_observed_state(observation);
        let key_valid = if observation.item_count == 0 {
            observation.primary_resource_key_status == "AUTHORITATIVE_EMPTY"
                && observation.record_field_shape_sha256.is_none()
        } else {
            observation.primary_resource_key_status == "NONEMPTY_VALIDATED"
                && observation
                    .record_field_shape_sha256
                    .as_deref()
                    .is_some_and(sha256_digest)
        };
        if observation.http_status != 200
            || observation.content_type != "application/json"
            || observation.response_bytes > MAXIMUM_RESPONSE_BYTES
            || !sha256_digest(&observation.body_sha256)
            || observation.contract_version != RUNTIME_CONTRACT_REVISION
            || observation.authority != "EXECUTION_CELL"
            || observation.profile_id != expected_profile_id
            || observation.catalogue_sha256 != capture.catalogue.catalogue_sha256
            || observation.availability != "AVAILABLE"
            || observation.freshness != "FRESH"
            || !matches!(observation.completeness.as_str(), "COMPLETE" | "PARTIAL")
            || !utc_timestamp(&observation.as_of_utc)
            || observation.expected_profile_id != expected_profile_id
            || !observation.profile_binding_valid
            || observation.relation_id != *expected_relation_id
            || !observation.relation_binding_valid
            || observation.item_count > 1
            || !observation.page_bound_valid
            || (observation.has_next_cursor && observation.item_count == 0)
            || !key_valid
            || observation.observed_state != state
        {
            return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
        }
    }
    Ok(())
}

fn expected_observed_state(observation: &RelationObservation) -> &'static str {
    if observation.freshness == "STALE" {
        "STALE"
    } else if observation.completeness != "COMPLETE" {
        "PARTIAL"
    } else if observation.item_count == 0 {
        "AUTHORITATIVE_EMPTY"
    } else {
        "POPULATED"
    }
}

fn validate_negative_checks(checks: &NegativeChecks) -> Result<(), E6AcceptanceError> {
    if checks.missing_client_certificate.outcome != "DENIED"
        || !nonblank(&checks.missing_client_certificate.error_class)
        || !checks.read_identity_post_method_denial.denied
        || checks.read_identity_post_method_denial.http_status != 405
    {
        return Err(E6AcceptanceError::RuntimeEvidenceInvalid);
    }
    Ok(())
}

fn validate_manifest(manifest: &AcceptanceManifest) -> Result<(), E6AcceptanceError> {
    let mutations = &manifest.runtime_mutations;
    if manifest.schema_version != E6_ACCEPTANCE_MANIFEST_VERSION
        || manifest.phase != "EX-DP-06"
        || manifest.status != "EDGE_SHADOW_VERIFIED"
        || manifest.e3_coverage_manifest_sha256 != sha256(E3_COVERAGE_MANIFEST_JSON.as_bytes())
        || manifest.e4_contract_manifest_sha256 != sha256(E4_CONTRACT_MANIFEST_JSON.as_bytes())
        || manifest.e5_publication_manifest_sha256
            != sha256(E5_PUBLICATION_MANIFEST_JSON.as_bytes())
        || manifest.counts.domain_count != EXPECTED_DOMAIN_COUNT
        || manifest.counts.profile_capture_count != EXPECTED_CAPTURE_COUNT
        || manifest.counts.manager_relation_observation_count != EXPECTED_OBSERVATION_COUNT
        || manifest.counts.negative_check_count != EXPECTED_NEGATIVE_CHECK_COUNT
        || mutations.database != "NOT_APPLIED"
        || mutations.source_identity != "NOT_APPLIED"
        || mutations.route != "NOT_APPLIED"
        || mutations.listener != "NOT_APPLIED"
        || mutations.projection_or_cache != "NOT_APPLIED"
        || mutations.command_port != "NOT_APPLIED"
        || mutations.deployment != "NOT_APPLIED"
        || manifest.files != e6_asset_digests()
    {
        return Err(E6AcceptanceError::ContractDrift);
    }
    Ok(())
}

fn validate_no_raw_or_forbidden_content() -> Result<(), E6AcceptanceError> {
    let documents = [
        E6_DOMAIN_ACCEPTANCE_SCHEMA_JSON,
        E6_RUNTIME_EVIDENCE_SCHEMA_JSON,
        E6_DOMAIN_ACCEPTANCE_JSON,
        E6_RUNTIME_EVIDENCE_JSON,
        E6_ACCEPTANCE_MANIFEST_JSON,
    ];
    if documents.into_iter().any(|document| {
        [
            "postgres://",
            "redis://",
            "SELECT ",
            "BEGIN ",
            "/portal/execution/v4",
            "\"trace_id\"",
            "\"record_key\"",
            "-----BEGIN",
        ]
        .into_iter()
        .any(|forbidden| document.contains(forbidden))
    }) {
        return Err(E6AcceptanceError::AuthorityWidened);
    }
    Ok(())
}

fn e6_asset_digests() -> BTreeMap<String, String> {
    BTreeMap::from([
        (
            "e6-domain-acceptance.v1.schema.json".to_owned(),
            sha256(E6_DOMAIN_ACCEPTANCE_SCHEMA_JSON.as_bytes()),
        ),
        (
            "e6-runtime-evidence.v1.schema.json".to_owned(),
            sha256(E6_RUNTIME_EVIDENCE_SCHEMA_JSON.as_bytes()),
        ),
        (
            "e6-domain-acceptance.v1.json".to_owned(),
            sha256(E6_DOMAIN_ACCEPTANCE_JSON.as_bytes()),
        ),
        (
            "e6-runtime-evidence.v1.json".to_owned(),
            sha256(E6_RUNTIME_EVIDENCE_JSON.as_bytes()),
        ),
    ])
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn sha256_digest(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return false;
    };
    hex.len() == 64
        && hex.bytes().all(|byte| {
            byte.is_ascii_digit() || (byte.is_ascii_lowercase() && byte.is_ascii_hexdigit())
        })
}

fn utc_timestamp(value: &str) -> bool {
    value.len() >= 20
        && value.ends_with('Z')
        && value
            .bytes()
            .all(|byte| byte.is_ascii() && !byte.is_ascii_control())
}

fn nonblank(value: &str) -> bool {
    !value.is_empty() && value.trim() == value
}

#[cfg(test)]
mod tests;
