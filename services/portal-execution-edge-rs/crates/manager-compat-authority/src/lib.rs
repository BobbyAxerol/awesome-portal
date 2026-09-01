#![forbid(unsafe_code)]

//! Digest-bound N19 compatibility authority for the private Manager-v2 read
//! facade.
//!
//! Only a deployment-bound authority can construct a Manager request. The
//! authority accepts relations from both the frozen N18 allowlist and the
//! authenticated owner catalogue; it never accepts an origin, method, header,
//! field selection, SQL fragment or unversioned adapter from a caller.

use std::collections::{BTreeMap, BTreeSet};

use manager_v2_contract::{
    ContractError, ManagerCapabilities, ManagerCatalogue, ManagerRecord, ManagerV2Request,
    OpaqueCursor, PageLimit, ProjectionKind, RUNTIME_CONTRACT_REVISION,
};
use serde::Deserialize;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

const CENSUS_JSON: &str =
    include_str!("../../../contracts/manager-surface-census-v1/manager-surface-census.v1.json");
const MATRIX_JSON: &str =
    include_str!("../../../contracts/manager-compat-authority-v1/adapter-matrix.v1.json");
const ACTIVATION_JSON: &str =
    include_str!("../../../contracts/manager-profile-activation-v1/runtime-activation.v1.json");
const QUALIFICATION_EVIDENCE_JSON: &str =
    include_str!("../../../contracts/manager-profile-activation-v1/qualification-evidence.v1.json");
const PAPER_RELEASE_PROFILE_JSON: &str =
    include_str!("../../../../../deploy/manifests/full-paper-read-release-profile.v1.json");
const SANDBOX_LIVE_RELEASE_PROFILE_JSON: &str =
    include_str!("../../../../../deploy/manifests/sandbox-live-read-release-profile.v1.json");
const PRODUCT_RELEASE_PROFILE_JSON: &str = include_str!(
    "../../../../../deploy/manifests/execution-manager-product-release-profile.v1.json"
);

pub const AUTHORITY_REVISION: &str = "portal.execution.manager-compat-authority.v1";
pub const DELEGATED_RESOURCE: &str = "execution:manager-v2:read";
const N18_CENSUS_DIGEST: &str =
    "sha256:cb577bdd67eb8ffaf8ec8bb73ac273f064623f2acc7210cc8b2955439411cfe3";
const N19_MATRIX_DIGEST: &str =
    "sha256:51d971d7029ac6d3028f5b8168bafbf40f6cd58c0cdd24fe4fc262316c5e3102";
const RUNTIME_ACTIVATION_DIGEST: &str =
    "sha256:6f38c74ac1cbd42aa6b17755e584fafdc9a429dd64217ccb37da88a5b2b460fa";
const REQUIRED_OPERATIONS: [&str; 5] = [
    "managerCapabilities",
    "managerCatalog",
    "managerProjection",
    "managerRelationRecord",
    "managerRelationRecords",
];
const REQUIRED_PROJECTIONS: [&str; 7] = [
    "account",
    "command_journal",
    "fill",
    "order",
    "portfolio",
    "position",
    "reconciliation",
];

/// Deployment cell selected by trusted Edge configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DeploymentEnvironment {
    Paper,
    Sandbox,
    Live,
}

impl DeploymentEnvironment {
    #[must_use]
    pub const fn from_config(value: &str) -> Option<Self> {
        match value.as_bytes() {
            b"paper" => Some(Self::Paper),
            b"sandbox" => Some(Self::Sandbox),
            b"live" => Some(Self::Live),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Paper => "paper",
            Self::Sandbox => "sandbox",
            Self::Live => "live",
        }
    }
}

/// Trusted request context after delegated-JWT verification.
#[derive(Debug, Clone, Copy)]
pub struct ManagerRequestContext<'a> {
    pub environment: DeploymentEnvironment,
    pub profile_id: &'a str,
    pub delegated_resource: &'a str,
    pub owner_contract_revision: &'a str,
}

/// Public adapter identity for evidence and rollback orchestration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AdapterSelection<'a> {
    pub adapter_revision: &'a str,
    pub owner_contract_revision: &'a str,
    pub wire_schema_revision: &'a str,
    pub deployable: bool,
    pub test_only: bool,
}

/// Canonical immutable compatibility authority loaded by Edge startup.
#[derive(Debug)]
pub struct ManagerCompatibilityAuthority {
    matrix: AdapterMatrix,
    activation: RuntimeActivation,
    approved_relations: BTreeSet<String>,
    expected_operation_ids: BTreeSet<String>,
    expected_projection_kinds: BTreeSet<String>,
}

/// A compatibility authority bound to one exact deployment/profile/resource
/// and deployable owner revision.
#[derive(Debug, Clone, Copy)]
pub struct BoundManagerAuthority<'a> {
    authority: &'a ManagerCompatibilityAuthority,
    binding: &'a ProfileBinding,
    adapter: &'a AdapterDescriptor,
}

impl ManagerCompatibilityAuthority {
    /// Loads and fully validates the checked-in N18 census and N19 adapter
    /// matrix. Startup fails closed on any digest or authority drift.
    ///
    /// # Errors
    ///
    /// Returns a typed configuration error for malformed or widened source.
    pub fn canonical() -> Result<Self, AuthorityError> {
        if digest(CENSUS_JSON.as_bytes()) != N18_CENSUS_DIGEST {
            return Err(AuthorityError::CensusDigestDrift);
        }
        let census: Census = serde_json::from_str(CENSUS_JSON)?;
        let matrix: AdapterMatrix = serde_json::from_str(MATRIX_JSON)?;
        if digest(MATRIX_JSON.as_bytes()) != N19_MATRIX_DIGEST {
            return Err(AuthorityError::MatrixDigestDrift);
        }
        if digest(ACTIVATION_JSON.as_bytes()) != RUNTIME_ACTIVATION_DIGEST {
            return Err(AuthorityError::ActivationDigestDrift);
        }
        let activation: RuntimeActivation = serde_json::from_str(ACTIVATION_JSON)?;
        validate_static_contract(&census, &matrix)?;
        validate_runtime_activation(&matrix, &activation)?;

        Ok(Self {
            matrix,
            activation,
            approved_relations: census
                .relations
                .into_iter()
                .map(|relation| relation.relation_id)
                .collect(),
            expected_operation_ids: REQUIRED_OPERATIONS.into_iter().map(str::to_owned).collect(),
            expected_projection_kinds: REQUIRED_PROJECTIONS
                .into_iter()
                .map(str::to_owned)
                .collect(),
        })
    }

    #[must_use]
    pub fn approved_relation_count(&self) -> usize {
        self.approved_relations.len()
    }

    #[must_use]
    pub fn active_adapter_revision(&self) -> &str {
        &self.matrix.active_adapter_revision
    }

    #[must_use]
    pub fn activation_revision(&self) -> &str {
        &self.activation.activation_revision
    }

    /// Binds transport to the exact environment/profile/resource and current
    /// deployable owner revision.
    ///
    /// # Errors
    ///
    /// Rejects unknown or unqualified profiles, resources and non-deployable
    /// revisions.
    pub fn bind(
        &self,
        context: ManagerRequestContext<'_>,
    ) -> Result<BoundManagerAuthority<'_>, AuthorityError> {
        let binding = self
            .matrix
            .profile_bindings
            .iter()
            .find(|binding| binding.environment == context.environment.as_str())
            .ok_or(AuthorityError::EnvironmentDenied)?;
        if binding.profile_id != context.profile_id {
            return Err(AuthorityError::ProfileDenied);
        }
        if binding.delegated_resource != context.delegated_resource {
            return Err(AuthorityError::ResourceDenied);
        }
        let active_profile = self
            .activation
            .profiles
            .iter()
            .find(|profile| profile.environment == context.environment.as_str())
            .ok_or(AuthorityError::EnvironmentDenied)?;
        if active_profile.profile_id != context.profile_id {
            return Err(AuthorityError::ProfileDenied);
        }
        if active_profile.delegated_resource != context.delegated_resource {
            return Err(AuthorityError::ResourceDenied);
        }
        if !active_profile.transport_qualified || !active_profile.current_source_read_enabled {
            return Err(AuthorityError::ProfileNotActive);
        }
        let adapter = self.adapter_for_owner_revision(context.owner_contract_revision)?;
        if !adapter.deployable || adapter.test_only {
            return Err(AuthorityError::AdapterNotDeployable);
        }
        if adapter.adapter_revision != self.matrix.active_adapter_revision {
            return Err(AuthorityError::RevisionUnsupported);
        }
        Ok(BoundManagerAuthority {
            authority: self,
            binding,
            adapter,
        })
    }

    /// Resolves current or simulated-future adapters for offline
    /// qualification. This does not authorize a production binding.
    ///
    /// # Errors
    ///
    /// Rejects owner revisions absent from the versioned matrix.
    pub fn qualify_adapter(
        &self,
        owner_contract_revision: &str,
    ) -> Result<AdapterSelection<'_>, AuthorityError> {
        let adapter = self.adapter_for_owner_revision(owner_contract_revision)?;
        Ok(adapter.selection())
    }

    /// Returns the explicit rollback target of a candidate adapter.
    ///
    /// # Errors
    ///
    /// Rejects an unknown adapter or one without an explicit rollback target.
    pub fn rollback_adapter(
        &self,
        adapter_revision: &str,
    ) -> Result<AdapterSelection<'_>, AuthorityError> {
        let candidate = self
            .matrix
            .adapters
            .iter()
            .find(|adapter| adapter.adapter_revision == adapter_revision)
            .ok_or(AuthorityError::RevisionUnsupported)?;
        let rollback_revision = candidate
            .rollback_adapter_revision
            .as_deref()
            .ok_or(AuthorityError::RollbackUndefined)?;
        let rollback = self
            .matrix
            .adapters
            .iter()
            .find(|adapter| adapter.adapter_revision == rollback_revision)
            .ok_or(AuthorityError::RollbackUndefined)?;
        Ok(rollback.selection())
    }

    /// Verifies that the authenticated owner catalogue is exactly the frozen
    /// N18 set: no missing relation and no newly injected relation.
    ///
    /// # Errors
    ///
    /// Returns [`AuthorityError::CatalogueDrift`] for any set mismatch.
    pub fn validate_catalogue(&self, catalogue: &ManagerCatalogue) -> Result<(), AuthorityError> {
        let actual: BTreeSet<String> = catalogue
            .relations()
            .iter()
            .map(|relation| format!("{}.{}", relation.id().schema(), relation.id().relation()))
            .collect();
        if actual != self.approved_relations {
            return Err(AuthorityError::CatalogueDrift);
        }
        Ok(())
    }

    fn adapter_for_owner_revision(
        &self,
        owner_contract_revision: &str,
    ) -> Result<&AdapterDescriptor, AuthorityError> {
        self.matrix
            .adapters
            .iter()
            .find(|adapter| adapter.owner_contract_revision == owner_contract_revision)
            .ok_or(AuthorityError::RevisionUnsupported)
    }
}

impl BoundManagerAuthority<'_> {
    #[must_use]
    pub fn profile_id(&self) -> &str {
        &self.binding.profile_id
    }

    #[must_use]
    pub fn adapter_revision(&self) -> &str {
        &self.adapter.adapter_revision
    }

    #[must_use]
    pub const fn catalogue_request(&self) -> ManagerV2Request {
        ManagerV2Request::catalogue()
    }

    #[must_use]
    pub const fn capabilities_request(&self) -> ManagerV2Request {
        ManagerV2Request::capabilities()
    }

    /// Verifies the complete owner catalogue against the N18 allowlist.
    ///
    /// # Errors
    ///
    /// Rejects missing or extra relations.
    pub fn validate_catalogue(&self, catalogue: &ManagerCatalogue) -> Result<(), AuthorityError> {
        self.authority.validate_catalogue(catalogue)
    }

    /// Verifies the exact five runtime capability descriptors.
    ///
    /// # Errors
    ///
    /// Rejects missing, extra or revision-incompatible capabilities.
    pub fn validate_capabilities(
        &self,
        capabilities: &ManagerCapabilities,
    ) -> Result<(), AuthorityError> {
        let actual: BTreeSet<String> = capabilities
            .capabilities()
            .iter()
            .map(|capability| capability.operation_id().to_owned())
            .collect();
        if actual != self.authority.expected_operation_ids {
            return Err(AuthorityError::CapabilityDrift);
        }
        Ok(())
    }

    /// Constructs a relation-page request only for the exact N18 set and an
    /// exact authenticated owner catalogue.
    ///
    /// # Errors
    ///
    /// Rejects catalogue drift, unknown relations, invalid limits or cursors.
    pub fn relation_page_request(
        &self,
        catalogue: &ManagerCatalogue,
        relation_id: &str,
        cursor: Option<&OpaqueCursor>,
        limit: PageLimit,
    ) -> Result<ManagerV2Request, AuthorityError> {
        self.authority.validate_catalogue(catalogue)?;
        if !self.authority.approved_relations.contains(relation_id) {
            return Err(AuthorityError::RelationNotApproved);
        }
        let (schema, relation) = relation_id
            .split_once('.')
            .ok_or(AuthorityError::RelationNotApproved)?;
        let catalogued = catalogue
            .relation(schema, relation)
            .ok_or(AuthorityError::CatalogueDrift)?;
        Ok(ManagerV2Request::relation_records(
            catalogued, cursor, limit,
        )?)
    }

    /// Constructs a single-record request from an owner-returned opaque key.
    ///
    /// # Errors
    ///
    /// Rejects catalogue drift, an unapproved relation or record binding drift.
    pub fn record_request(
        &self,
        catalogue: &ManagerCatalogue,
        record: &ManagerRecord,
    ) -> Result<ManagerV2Request, AuthorityError> {
        self.authority.validate_catalogue(catalogue)?;
        let relation_id = format!(
            "{}.{}",
            record.relation().schema(),
            record.relation().relation()
        );
        if !self.authority.approved_relations.contains(&relation_id) {
            return Err(AuthorityError::RelationNotApproved);
        }
        let relation = catalogue
            .relation(record.relation().schema(), record.relation().relation())
            .ok_or(AuthorityError::CatalogueDrift)?;
        Ok(ManagerV2Request::record(record, relation)?)
    }

    /// Constructs one owner-defined projection request from the fixed seven
    /// projection allowlist.
    ///
    /// # Errors
    ///
    /// Rejects catalogue drift, projection widening or cursor binding drift.
    pub fn projection_request(
        &self,
        catalogue: &ManagerCatalogue,
        kind: ProjectionKind,
        cursor: Option<&OpaqueCursor>,
        limit: PageLimit,
    ) -> Result<ManagerV2Request, AuthorityError> {
        self.authority.validate_catalogue(catalogue)?;
        if !self
            .authority
            .expected_projection_kinds
            .contains(kind.path_segment())
        {
            return Err(AuthorityError::ProjectionDenied);
        }
        Ok(ManagerV2Request::projection(
            catalogue, kind, cursor, limit,
        )?)
    }
}

#[derive(Debug, Error)]
pub enum AuthorityError {
    #[error("N18 census digest drift")]
    CensusDigestDrift,
    #[error("N19 compatibility matrix digest drift")]
    MatrixDigestDrift,
    #[error("runtime profile activation digest drift")]
    ActivationDigestDrift,
    #[error("runtime profile qualification evidence digest drift")]
    QualificationEvidenceDigestDrift,
    #[error("invalid compatibility authority document")]
    InvalidAuthorityDocument,
    #[error("deployment environment is not approved")]
    EnvironmentDenied,
    #[error("deployment profile is not approved")]
    ProfileDenied,
    #[error("delegated resource is not approved")]
    ResourceDenied,
    #[error("deployment profile transport is not qualified")]
    TransportNotQualified,
    #[error("deployment profile current-source read is not active")]
    ProfileNotActive,
    #[error("owner contract revision is unsupported")]
    RevisionUnsupported,
    #[error("adapter is qualification-only and cannot be deployed")]
    AdapterNotDeployable,
    #[error("adapter rollback target is undefined")]
    RollbackUndefined,
    #[error("owner catalogue differs from the frozen N18 relation set")]
    CatalogueDrift,
    #[error("relation is not approved by N18")]
    RelationNotApproved,
    #[error("projection is not approved")]
    ProjectionDenied,
    #[error("manager capability surface drifted")]
    CapabilityDrift,
    #[error("manager contract rejected the bounded request")]
    Contract(#[from] ContractError),
    #[error("compatibility authority JSON is invalid")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Deserialize)]
struct Census {
    schema_version: String,
    phase: String,
    decision: String,
    runtime_effect: String,
    generated_from_sanitized_contracts_only: bool,
    counts: CensusCounts,
    manager_primitives: Vec<CensusManagerPrimitive>,
    relations: Vec<CensusRelation>,
    authority: CensusAuthority,
}

#[derive(Debug, Deserialize)]
struct CensusCounts {
    relations: usize,
    manager_primitives: usize,
}

#[derive(Debug, Deserialize)]
struct CensusManagerPrimitive {
    operation_id: String,
    method: String,
    delivery_phase: String,
}

#[derive(Debug, Deserialize)]
struct CensusRelation {
    relation_id: String,
    source_capability: String,
}

#[derive(Debug, Deserialize)]
struct CensusAuthority {
    compatibility_owner: String,
    control_and_screen_owner: String,
    source_owner: String,
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct AdapterMatrix {
    schema_version: String,
    phase: String,
    decision: String,
    n18_census_sha256: String,
    active_adapter_revision: String,
    adapters: Vec<AdapterDescriptor>,
    profile_bindings: Vec<ProfileBinding>,
    projection_kinds: Vec<String>,
    transport_policy: TransportPolicy,
    authority: MatrixAuthority,
}

#[derive(Debug, Deserialize)]
struct AdapterDescriptor {
    adapter_revision: String,
    owner_contract_revision: String,
    wire_schema_revision: String,
    state: String,
    deployable: bool,
    test_only: bool,
    rollback_adapter_revision: Option<String>,
    operation_ids: Vec<String>,
}

impl AdapterDescriptor {
    fn selection(&self) -> AdapterSelection<'_> {
        AdapterSelection {
            adapter_revision: &self.adapter_revision,
            owner_contract_revision: &self.owner_contract_revision,
            wire_schema_revision: &self.wire_schema_revision,
            deployable: self.deployable,
            test_only: self.test_only,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ProfileBinding {
    environment: String,
    profile_id: String,
    delegated_resource: String,
    transport_qualified: bool,
    product_enabled: bool,
}

#[derive(Debug, Deserialize)]
struct RuntimeActivation {
    schema_version: String,
    activation_revision: String,
    decision: String,
    adapter_matrix_sha256: String,
    qualification_evidence_sha256: String,
    release_profiles: ActivationReleaseProfiles,
    owner_contract_revision: String,
    active_adapter_revision: String,
    profiles: Vec<ActivationProfile>,
    transport_requirements: ActivationTransportRequirements,
    derived_planes: ActivationDerivedPlanes,
    authority: ActivationAuthority,
}

#[derive(Debug, Deserialize)]
struct ActivationReleaseProfiles {
    #[serde(rename = "paper_sha256")]
    paper: String,
    #[serde(rename = "sandbox_live_sha256")]
    sandbox_live: String,
    #[serde(rename = "product_candidate_sha256")]
    product_candidate: String,
}

#[derive(Debug, Deserialize)]
struct ActivationProfile {
    environment: String,
    profile_id: String,
    delegation_audience: String,
    delegated_resource: String,
    transport_qualified: bool,
    current_source_read_enabled: bool,
    empty_result_semantics: String,
}

#[derive(Debug, Deserialize)]
struct ActivationTransportRequirements {
    origin_scheme: String,
    minimum_tls: String,
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct ActivationDerivedPlanes {
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct ActivationAuthority {
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct TransportPolicy {
    origin_scheme: String,
    method: String,
    minimum_tls: String,
    maximum_page_rows: u16,
    maximum_response_bytes: usize,
    maximum_cursor_bytes: usize,
    maximum_concurrency_per_replica: usize,
    request_header_allowlist: Vec<String>,
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct MatrixAuthority {
    #[serde(flatten)]
    flags: BTreeMap<String, bool>,
}

fn validate_static_contract(census: &Census, matrix: &AdapterMatrix) -> Result<(), AuthorityError> {
    if validate_census(census)
        && validate_adapters(matrix)
        && validate_bindings(matrix)
        && validate_transport(matrix)
    {
        Ok(())
    } else {
        Err(AuthorityError::InvalidAuthorityDocument)
    }
}

fn validate_runtime_activation(
    matrix: &AdapterMatrix,
    activation: &RuntimeActivation,
) -> Result<(), AuthorityError> {
    if activation.qualification_evidence_sha256 != digest(QUALIFICATION_EVIDENCE_JSON.as_bytes()) {
        return Err(AuthorityError::QualificationEvidenceDigestDrift);
    }

    let profiles: BTreeMap<&str, &ActivationProfile> = activation
        .profiles
        .iter()
        .map(|profile| (profile.environment.as_str(), profile))
        .collect();
    let expected_profiles = [
        ("paper", "PAPER_BINANCE_USDM", "portal-execution-edge-paper"),
        (
            "sandbox",
            "SANDBOX_BINANCE_USDM",
            "portal-execution-edge-sandbox",
        ),
        ("live", "LIVE_BINANCE_USDM", "portal-execution-edge-live"),
    ];
    let profiles_are_exact = profiles.len() == expected_profiles.len()
        && expected_profiles
            .into_iter()
            .all(|(environment, profile_id, audience)| {
                profiles.get(environment).is_some_and(|profile| {
                    profile.profile_id == profile_id
                        && profile.delegation_audience == audience
                        && profile.delegated_resource == DELEGATED_RESOURCE
                        && profile.transport_qualified
                        && profile.current_source_read_enabled
                        && profile.empty_result_semantics == "AUTHORITATIVE_EMPTY"
                })
            });

    let release_profiles_are_bound = activation.release_profiles.paper
        == digest(PAPER_RELEASE_PROFILE_JSON.as_bytes())
        && activation.release_profiles.sandbox_live
            == digest(SANDBOX_LIVE_RELEASE_PROFILE_JSON.as_bytes())
        && activation.release_profiles.product_candidate
            == digest(PRODUCT_RELEASE_PROFILE_JSON.as_bytes());

    let valid = activation.schema_version
        == "portal.execution.manager-profile-runtime-activation.v1"
        && activation.decision == "PAPER_SANDBOX_LIVE_CURRENT_SOURCE_READ_ACTIVE"
        && activation.adapter_matrix_sha256 == N19_MATRIX_DIGEST
        && activation.owner_contract_revision == RUNTIME_CONTRACT_REVISION
        && activation.active_adapter_revision == matrix.active_adapter_revision
        && release_profiles_are_bound
        && profiles_are_exact
        && activation.transport_requirements.origin_scheme == "https"
        && activation.transport_requirements.minimum_tls == "TLS1.3"
        && activation.transport_requirements.flags
            == BTreeMap::from([
                ("automatic_retries".to_owned(), false),
                ("delegated_jwt_required".to_owned(), true),
                ("mutual_tls_required".to_owned(), true),
                ("redirects_allowed".to_owned(), false),
            ])
        && activation.derived_planes.flags
            == BTreeMap::from([
                ("analytics_requires_projection".to_owned(), true),
                ("projection_requires_separate_runtime_gate".to_owned(), true),
                ("sse_requires_complete_projection_epoch".to_owned(), true),
            ])
        && activation.authority.flags
            == false_flags(&[
                "browser_raw_manager_access",
                "command_relay",
                "live_mutation",
                "database_access",
                "redis_access",
                "cli_access",
                "caller_selected_origin",
                "caller_selected_profile",
                "trading_system_source_change",
            ]);

    if valid {
        Ok(())
    } else {
        Err(AuthorityError::InvalidAuthorityDocument)
    }
}

fn validate_census(census: &Census) -> bool {
    let operations: BTreeSet<&str> = census
        .manager_primitives
        .iter()
        .map(|primitive| primitive.operation_id.as_str())
        .collect();
    let required_operations: BTreeSet<&str> = REQUIRED_OPERATIONS.into_iter().collect();
    let relation_ids: BTreeSet<&str> = census
        .relations
        .iter()
        .map(|relation| relation.relation_id.as_str())
        .collect();
    census.schema_version == "portal.execution.manager-surface-census.v1"
        && census.phase == "N18"
        && census.decision == "N18_CAPABILITY_DATA_COVERAGE_CENSUS_COMPLETE"
        && census.runtime_effect == "NONE"
        && census.generated_from_sanitized_contracts_only
        && census.counts.relations == 96
        && census.counts.manager_primitives == 5
        && census.relations.len() == 96
        && relation_ids.len() == 96
        && census.manager_primitives.len() == 5
        && operations == required_operations
        && census
            .manager_primitives
            .iter()
            .all(|primitive| primitive.method == "GET" && primitive.delivery_phase == "N19")
        && census.relations.iter().all(|relation| {
            relation.relation_id.starts_with("public.")
                && relation.source_capability == "managerRelationRecords"
        })
        && census.authority.compatibility_owner == "RUST_EXECUTION_EDGE"
        && census.authority.control_and_screen_owner == "TYPESCRIPT_CONTROL_API"
        && census.authority.source_owner == "TRADING_SYSTEM"
        && census.authority.flags
            == false_flags(&[
                "browser_raw_relation_access",
                "database_redis_cli_shell_access",
                "product_endpoint_added",
                "schema_migration",
                "source_activation",
            ])
}

fn validate_adapters(matrix: &AdapterMatrix) -> bool {
    let required_operations: BTreeSet<&str> = REQUIRED_OPERATIONS.into_iter().collect();
    matrix.schema_version == AUTHORITY_REVISION
        && matrix.phase == "N19"
        && matrix.decision == "N19_RUST_MANAGER_COMPATIBILITY_AUTHORITY_ACCEPTED"
        && matrix.n18_census_sha256 == N18_CENSUS_DIGEST
        && matrix.adapters.len() == 2
        && matrix
            .adapters
            .iter()
            .all(|adapter| adapter.operation_ids.iter().collect::<BTreeSet<_>>().len() == 5)
        && matrix.adapters.iter().all(|adapter| {
            adapter
                .operation_ids
                .iter()
                .map(String::as_str)
                .collect::<BTreeSet<_>>()
                == required_operations
        })
        && matrix
            .adapters
            .iter()
            .filter(|adapter| adapter.deployable)
            .count()
            == 1
        && matrix.adapters.iter().any(|adapter| {
            adapter.adapter_revision == matrix.active_adapter_revision
                && adapter.owner_contract_revision == RUNTIME_CONTRACT_REVISION
                && adapter.state == "ACTIVE_CURRENT"
                && adapter.deployable
                && !adapter.test_only
        })
        && matrix.adapters.iter().any(|adapter| {
            adapter.state == "QUALIFICATION_ONLY"
                && !adapter.deployable
                && adapter.test_only
                && adapter.rollback_adapter_revision.as_deref()
                    == Some(matrix.active_adapter_revision.as_str())
        })
}

fn validate_bindings(matrix: &AdapterMatrix) -> bool {
    let binding_map: BTreeMap<&str, &ProfileBinding> = matrix
        .profile_bindings
        .iter()
        .map(|binding| (binding.environment.as_str(), binding))
        .collect();
    binding_map.len() == 3
        && [
            ("paper", "PAPER_BINANCE_USDM"),
            ("sandbox", "SANDBOX_BINANCE_USDM"),
            ("live", "LIVE_BINANCE_USDM"),
        ]
        .into_iter()
        .all(|(environment, profile)| {
            binding_map.get(environment).is_some_and(|binding| {
                binding.profile_id == profile
                    && binding.delegated_resource == DELEGATED_RESOURCE
                    && !binding.product_enabled
            })
        })
        && binding_map
            .get("paper")
            .is_some_and(|binding| binding.transport_qualified)
        && binding_map
            .get("sandbox")
            .is_some_and(|binding| !binding.transport_qualified)
        && binding_map
            .get("live")
            .is_some_and(|binding| !binding.transport_qualified)
}

fn validate_transport(matrix: &AdapterMatrix) -> bool {
    let projection_kinds: BTreeSet<&str> =
        matrix.projection_kinds.iter().map(String::as_str).collect();
    let required_projections: BTreeSet<&str> = REQUIRED_PROJECTIONS.into_iter().collect();
    projection_kinds == required_projections
        && matrix.transport_policy.origin_scheme == "https"
        && matrix.transport_policy.method == "GET"
        && matrix.transport_policy.minimum_tls == "TLS1.3"
        && matrix.transport_policy.flags
            == BTreeMap::from([
                ("automatic_retries".to_owned(), false),
                ("delegated_jwt_required".to_owned(), true),
                ("mutual_tls_required".to_owned(), true),
                ("redirects_allowed".to_owned(), false),
            ])
        && matrix.transport_policy.maximum_page_rows == 200
        && matrix.transport_policy.maximum_response_bytes == 1_048_576
        && matrix.transport_policy.maximum_cursor_bytes == 4_096
        && matrix.transport_policy.maximum_concurrency_per_replica == 2
        && matrix.transport_policy.request_header_allowlist
            == ["accept".to_owned(), "x-request-id".to_owned()]
        && matrix.authority.flags
            == false_flags(&[
                "browser_raw_manager_access",
                "caller_selected_origin",
                "caller_selected_method",
                "caller_selected_header",
                "caller_selected_field",
                "database_access",
                "redis_access",
                "cli_access",
                "source_activation",
                "product_endpoint_added",
            ])
}

fn false_flags(names: &[&str]) -> BTreeMap<String, bool> {
    names
        .iter()
        .map(|name| ((*name).to_owned(), false))
        .collect()
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests;
