#![forbid(unsafe_code)]

//! E5's named existing-data adapter boundary.
//!
//! The adapter intentionally owns no transport, database, credential, cache,
//! listener or command capability.  An authenticated Edge runtime supplies a
//! deployment-bound Manager authority and one already-decoded Manager page;
//! this crate builds only the fixed request and transforms only the fixed
//! allowlisted response.  Portal-control and derived capabilities remain
//! named delegate descriptors, never generic URLs or relation selectors.

use std::collections::{BTreeMap, BTreeSet};

use current_source_compat::{CurrentSourceMap, ExecutionProfile, MappingError};
use manager_compat_authority::{
    AuthorityError, BoundManagerAuthority, ManagerCompatibilityAuthority, AUTHORITY_REVISION,
};
use manager_v2_contract::{
    Completeness, Freshness, ManagerCatalogue, ManagerEnvelope, ManagerMeta, ManagerRecord,
    ManagerV2Request, ManagerValue, OpaqueCursor, PageLimit, RelationRecords,
    MAXIMUM_OPAQUE_TOKEN_BYTES, MAXIMUM_PAGE_ROWS, MAXIMUM_RESPONSE_BYTES,
    RUNTIME_CONTRACT_REVISION,
};
use maximum_data_contract::{
    BindingStatus, ContractError, E4Contract, E4ContractError, E4FieldOperationBinding,
    FieldDefinition, MaximumDataContract, OpaqueContinuation, E3_COVERAGE_MANIFEST_JSON,
    E4_CONTRACT_MANIFEST_JSON,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const PUBLICATION_REGISTRY_VERSION: &str =
    "portal.execution.maximum-data.e5.existing-data-publication.v1";
pub const NAMED_PAGE_SCHEMA_VERSION: &str = "portal.execution.maximum-data.e5.named-page.v1";
pub const GOLDEN_FIXTURES_VERSION: &str = "portal.execution.maximum-data.e5.golden-fixtures.v1";
pub const PUBLICATION_MANIFEST_VERSION: &str =
    "portal.execution.maximum-data.e5.publication-manifest.v1";
pub const PUBLICATION_REVISION: &str = PUBLICATION_REGISTRY_VERSION;

pub const E5_PUBLICATION_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e5-existing-data-publication.v1.schema.json"
));
pub const E5_NAMED_PAGE_SCHEMA_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e5-named-page.v1.schema.json"
));
pub const E5_PUBLICATION_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e5-existing-data-publication.v1.json"
));
pub const E5_GOLDEN_FIXTURES_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e5-golden-fixtures.v1.json"
));
pub const E5_PUBLICATION_MANIFEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/maximum-data-return-v1/e5-publication.manifest.json"
));

const MANAGER_CENSUS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/manager-surface-census-v1/manager-surface-census.v1.json"
));

const EXPECTED_MANAGER_ENTRY_COUNT: usize = 19;
const EXPECTED_EXISTING_ENTRY_COUNT: usize = 4;
const EXPECTED_DELEGATE_ENTRY_COUNT: usize = 4;
const EXPECTED_TYPED_UNAVAILABLE_ENTRY_COUNT: usize = 1;
const EXPECTED_OWNER_GAP_ENTRY_COUNT: usize = 6;

const MANAGER_PROFILES: [PublicationProfile; 3] = [
    PublicationProfile::Paper,
    PublicationProfile::Sandbox,
    PublicationProfile::Live,
];
const ALL_PROFILES: [PublicationProfile; 4] = [
    PublicationProfile::Paper,
    PublicationProfile::Sandbox,
    PublicationProfile::Live,
    PublicationProfile::Canary,
];

#[derive(Debug, Error)]
pub enum E5AdapterError {
    #[error("embedded E5 JSON is invalid")]
    InvalidJson,
    #[error("E5 schema, manifest, inventory or immutable pin drifted")]
    ContractDrift,
    #[error("E5 publication widened source or runtime authority")]
    AuthorityWidened,
    #[error("unknown E5 field or logical operation")]
    UnknownOperation,
    #[error("the requested E5 operation is not a Manager relation-page adapter")]
    NotManagerOperation,
    #[error("the requested profile is outside this named capability binding")]
    ProfileDenied,
    #[error("Canary must compose Live facts through its named Portal boundary")]
    CanaryManagerReadDenied,
    #[error("the bound Manager identity does not match the selected E5 profile")]
    ProfileBindingMismatch,
    #[error("the source Manager catalogue has no named E5 relation")]
    CatalogueRelationMissing,
    #[error("the Manager response relation or profile does not match the prepared operation")]
    SourceBindingMismatch,
    #[error("the Manager response exceeds the request's bounded frame")]
    PageBoundExceeded,
    #[error("a required named resource key is absent, null or duplicated")]
    ResourceIdentityInvalid,
    #[error("the source continuation is invalid")]
    Continuation(#[from] E4ContractError),
    #[error("the frozen E3 contract is invalid: {0}")]
    E3(#[from] ContractError),
    #[error("the frozen E4 contract is invalid: {0}")]
    E4(E4ContractError),
    #[error("the N13B current-source map is invalid: {0}")]
    CurrentSource(#[from] MappingError),
    #[error("the N19 Manager authority is invalid: {0}")]
    ManagerAuthority(#[from] AuthorityError),
    #[error("the Manager contract rejected the bounded operation: {0}")]
    ManagerContract(#[from] manager_v2_contract::ContractError),
    #[error("an exact source identity could not be serialized")]
    SourceIdentitySerialization,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PublicationProfile {
    Paper,
    Sandbox,
    Live,
    Canary,
}

impl PublicationProfile {
    fn current_source_profile(self) -> ExecutionProfile {
        match self {
            Self::Paper => ExecutionProfile::Paper,
            Self::Sandbox => ExecutionProfile::Sandbox,
            Self::Live => ExecutionProfile::Live,
            Self::Canary => ExecutionProfile::Canary,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ImplementationKind {
    ExistingPortalContract,
    ManagerRelationPage,
    PortalDerivedDelegate,
    TypedUnavailable,
    TypedSourceOwnerGap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PublicationState {
    ImplementedReuse,
    ImplementedManagerAdapter,
    ImplementedNamedPortalDelegate,
    TypedUnavailable,
    SourceOwnerGap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum NamedPageState {
    Populated,
    Empty,
    Partial,
    Stale,
}

/// A browser-safe, source-free description of one fixed operation.  It has no
/// relation selector or source URL; those remain private to the request
/// builder that received an authenticated catalogue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct E5OperationDescriptor {
    pub field_id: String,
    pub logical_operation_id: Option<String>,
    pub implementation: ImplementationKind,
    pub publication_state: PublicationState,
    pub profiles: Vec<PublicationProfile>,
    pub allowed_fields: Vec<String>,
    pub primary_key_fields: Vec<String>,
    pub source_history_semantics: String,
    pub current_status: String,
    pub typed_status_code: Option<String>,
    pub typed_absence_id: Option<String>,
}

/// A fixed non-Manager outcome for an existing Portal contract, a named
/// delegate, a qualified unavailability or an owner source gap.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StaticPublication {
    ExistingPortalContract {
        descriptor: E5OperationDescriptor,
        existing_contract_id: String,
    },
    PortalDerivedDelegate {
        descriptor: E5OperationDescriptor,
        portal_delegate_id: String,
    },
    TypedUnavailable {
        descriptor: E5OperationDescriptor,
        status_code: String,
        typed_absence_id: Option<String>,
    },
}

/// A sealed Manager relation request prepared from a named E5 operation.
/// The request can only be dispatched by the existing authenticated Manager
/// client owned by the Edge runtime.
#[derive(Debug, Clone)]
pub struct PreparedManagerPage {
    descriptor: E5OperationDescriptor,
    relation_id: String,
    profile_id: String,
    page_limit: PageLimit,
    request: ManagerV2Request,
}

impl PreparedManagerPage {
    #[must_use]
    pub fn descriptor(&self) -> &E5OperationDescriptor {
        &self.descriptor
    }

    #[must_use]
    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }

    #[must_use]
    pub fn request(&self) -> &ManagerV2Request {
        &self.request
    }
}

/// Source metadata deliberately limited to what an available Manager page
/// actually carries.  Absence of a global sequence, retention floor and
/// correction journal is explicit rather than inferred.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NamedPageSourceHealth {
    pub freshness: Freshness,
    pub completeness: Completeness,
    pub as_of_ms: i64,
    pub trace_id: String,
    pub global_sequence: Option<String>,
    pub retention_floor_ms: Option<i64>,
    pub retention_floor_status: &'static str,
    pub correction_observability: &'static str,
    pub replay_eligible: bool,
}

/// The only continuation E5 exposes: a source-issued opaque token associated
/// with this fixed operation.  It is bounded, has no total-history cap and
/// can be rebound only to the same named catalogue relation on the next call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NamedPageContinuation {
    pub next_cursor: Option<OpaqueContinuation>,
    pub has_more: bool,
    pub total_unknown: bool,
    pub maximum_page_rows: u16,
    pub truncated: bool,
}

/// One E3-allowlisted record.  `record_key` from the Manager contract is
/// deliberately absent: it is a source-private handle, not Portal data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NamedPageRecord {
    pub fields: BTreeMap<String, ManagerValue>,
}

/// A typed named page produced from one Manager relation page.  It does not
/// claim a global journal, correction replay or a retention floor that the
/// source envelope has not supplied.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NamedDataPage {
    pub schema_version: &'static str,
    pub publication_revision: &'static str,
    pub logical_operation_id: String,
    pub field_id: String,
    pub profile_id: String,
    pub source_contract_revision: &'static str,
    pub source_catalogue_sha256: String,
    pub source_history_semantics: String,
    pub source_health: NamedPageSourceHealth,
    pub page: NamedPageContinuation,
    pub state: NamedPageState,
    pub records: Vec<NamedPageRecord>,
}

#[derive(Debug)]
pub struct MaximumDataAdapter {
    registry: PublicationRegistry,
    e3: MaximumDataContract,
    e4: E4Contract,
    current_source: CurrentSourceMap,
    manager_relations: BTreeSet<String>,
}

impl MaximumDataAdapter {
    /// Loads and validates the entire additive E5 registry without opening a
    /// network connection, database connection, cache or listener.
    ///
    /// # Errors
    /// Returns [`E5AdapterError`] when a frozen source, profile, field,
    /// capability, bound, typed-gap or authority invariant drifts.
    pub fn canonical() -> Result<Self, E5AdapterError> {
        let e3 = MaximumDataContract::canonical()?;
        let e4 = E4Contract::canonical().map_err(E5AdapterError::E4)?;
        let current_source = CurrentSourceMap::canonical()?;
        let registry: PublicationRegistry =
            serde_json::from_str(E5_PUBLICATION_JSON).map_err(|_| E5AdapterError::InvalidJson)?;
        let manager_relations = manager_relation_ids()?;
        let adapter = Self {
            registry,
            e3,
            e4,
            current_source,
            manager_relations,
        };
        adapter.validate()?;
        Ok(adapter)
    }

    /// Validates the E5 contract assets and all cross-contract bindings.
    ///
    /// # Errors
    /// Returns [`E5AdapterError`] on manifest, authority, field or source
    /// mapping drift.
    pub fn validate(&self) -> Result<(), E5AdapterError> {
        validate_schema(
            E5_PUBLICATION_SCHEMA_JSON,
            "portal.execution.maximum-data.e5.existing-data-publication.schema.v1",
        )?;
        validate_schema(
            E5_NAMED_PAGE_SCHEMA_JSON,
            "portal.execution.maximum-data.e5.named-page.schema.v1",
        )?;
        self.validate_registry_identity()?;
        self.validate_entries()?;
        self.validate_fixtures()?;
        self.validate_manifest()?;
        Ok(())
    }

    /// Returns a descriptor for an exact logical operation.  Owner-gap fields
    /// intentionally have no logical operation and are resolved by field ID.
    ///
    /// # Errors
    /// Returns [`E5AdapterError::UnknownOperation`] for a non-published
    /// operation.
    pub fn operation(
        &self,
        logical_operation_id: &str,
    ) -> Result<E5OperationDescriptor, E5AdapterError> {
        let entry = self
            .registry
            .entries
            .iter()
            .find(|entry| {
                self.e4_operation(entry)
                    .is_some_and(|operation| operation == logical_operation_id)
            })
            .ok_or(E5AdapterError::UnknownOperation)?;
        self.descriptor(entry)
    }

    /// Resolves an exact field into a non-Manager published outcome.  Manager
    /// relation fields must use [`Self::prepare_manager_page`] instead.
    ///
    /// # Errors
    /// Returns an error for unknown fields, profile widening or an attempt to
    /// use this helper for a Manager relation.
    pub fn static_publication(
        &self,
        field_id: &str,
        profile: PublicationProfile,
    ) -> Result<StaticPublication, E5AdapterError> {
        let entry = self.entry_by_field(field_id)?;
        Self::require_profile(entry, profile)?;
        let descriptor = self.descriptor(entry)?;
        match entry.implementation {
            ImplementationKind::ExistingPortalContract => {
                Ok(StaticPublication::ExistingPortalContract {
                    descriptor,
                    existing_contract_id: required_text(entry.existing_contract_id.as_ref())?,
                })
            }
            ImplementationKind::PortalDerivedDelegate => {
                Ok(StaticPublication::PortalDerivedDelegate {
                    descriptor,
                    portal_delegate_id: required_text(entry.portal_delegate_id.as_ref())?,
                })
            }
            ImplementationKind::TypedUnavailable | ImplementationKind::TypedSourceOwnerGap => {
                Ok(StaticPublication::TypedUnavailable {
                    descriptor,
                    status_code: required_text(entry.typed_status_code.as_ref())?,
                    typed_absence_id: entry.typed_absence_id.clone(),
                })
            }
            ImplementationKind::ManagerRelationPage => Err(E5AdapterError::NotManagerOperation),
        }
    }

    /// Builds exactly one existing Manager relation-page request.  The caller
    /// cannot select a raw relation, field list, SQL fragment, profile or URL.
    /// A source-issued cursor is rebound to this one catalogue relation before
    /// it reaches the pre-existing Manager authority.
    ///
    /// # Errors
    /// Returns an error for an unknown/non-Manager operation, profile drift,
    /// catalogue drift, invalid cursor or out-of-authority request.
    pub fn prepare_manager_page(
        &self,
        authority: &BoundManagerAuthority<'_>,
        catalogue: &ManagerCatalogue,
        logical_operation_id: &str,
        profile: PublicationProfile,
        cursor: Option<&str>,
        limit: PageLimit,
    ) -> Result<PreparedManagerPage, E5AdapterError> {
        if profile == PublicationProfile::Canary {
            return Err(E5AdapterError::CanaryManagerReadDenied);
        }
        let entry = self
            .registry
            .entries
            .iter()
            .find(|entry| {
                self.e4_operation(entry)
                    .is_some_and(|operation| operation == logical_operation_id)
            })
            .ok_or(E5AdapterError::UnknownOperation)?;
        if entry.implementation != ImplementationKind::ManagerRelationPage {
            return Err(E5AdapterError::NotManagerOperation);
        }
        Self::require_profile(entry, profile)?;
        let expected_profile_id = self.manager_profile_id(profile)?;
        if authority.profile_id() != expected_profile_id {
            return Err(E5AdapterError::ProfileBindingMismatch);
        }
        let relation_id = required_text(entry.manager_relation_id.as_ref())?;
        let (schema, relation) = split_relation(&relation_id)?;
        let catalogue_relation = catalogue
            .relation(schema, relation)
            .ok_or(E5AdapterError::CatalogueRelationMissing)?;
        let bound_cursor = cursor
            .map(|value| {
                OpaqueCursor::from_relation_round_trip(value.to_owned(), catalogue_relation)
            })
            .transpose()?;
        let request = authority.relation_page_request(
            catalogue,
            &relation_id,
            bound_cursor.as_ref(),
            limit,
        )?;
        Ok(PreparedManagerPage {
            descriptor: self.descriptor(entry)?,
            relation_id,
            profile_id: expected_profile_id.to_owned(),
            page_limit: limit,
            request,
        })
    }

    /// Converts one source-decoded Manager relation page into the E5 named
    /// data page.  It retains only E3 allowlisted fields and rejects missing
    /// or duplicate primary resource identities.
    ///
    /// # Errors
    /// Returns an error for cross-profile/relation responses, page-bound
    /// drift, malformed resource identities or invalid opaque continuation.
    pub fn adapt_manager_page(
        &self,
        prepared: &PreparedManagerPage,
        response: &ManagerEnvelope<RelationRecords>,
    ) -> Result<NamedDataPage, E5AdapterError> {
        if response.meta().profile_id() != prepared.profile_id
            || relation_id(response.data()) != prepared.relation_id
        {
            return Err(E5AdapterError::SourceBindingMismatch);
        }
        if response.data().items().len() > usize::from(prepared.page_limit.get()) {
            return Err(E5AdapterError::PageBoundExceeded);
        }
        let allowed = prepared
            .descriptor
            .allowed_fields
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>();
        let identities = prepared
            .descriptor
            .primary_key_fields
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>();
        let mut seen_identities = BTreeSet::new();
        let mut records = Vec::with_capacity(response.data().items().len());
        for record in response.data().items() {
            validate_record_relation(record, &prepared.relation_id)?;
            let identity = resource_identity(record, &identities)?;
            if !seen_identities.insert(identity) {
                return Err(E5AdapterError::ResourceIdentityInvalid);
            }
            let fields = record
                .fields()
                .iter()
                .filter(|(name, _)| allowed.contains(name.as_str()))
                .map(|(name, value)| (name.clone(), value.clone()))
                .collect();
            records.push(NamedPageRecord { fields });
        }
        let next_cursor = response
            .data()
            .next_cursor()
            .map(|cursor| OpaqueContinuation::new(cursor.as_str().to_owned()))
            .transpose()?;
        let has_more = next_cursor.is_some();
        let source_health = source_health(response.meta());
        let state = page_state(&source_health, &records);
        Ok(NamedDataPage {
            schema_version: NAMED_PAGE_SCHEMA_VERSION,
            publication_revision: PUBLICATION_REVISION,
            logical_operation_id: prepared
                .descriptor
                .logical_operation_id
                .clone()
                .ok_or(E5AdapterError::ContractDrift)?,
            field_id: prepared.descriptor.field_id.clone(),
            profile_id: prepared.profile_id.clone(),
            source_contract_revision: RUNTIME_CONTRACT_REVISION,
            source_catalogue_sha256: response.meta().catalogue_sha256().as_str().to_owned(),
            source_history_semantics: prepared.descriptor.source_history_semantics.clone(),
            source_health,
            page: NamedPageContinuation {
                next_cursor,
                has_more,
                total_unknown: true,
                maximum_page_rows: prepared.page_limit.get(),
                truncated: false,
            },
            state,
            records,
        })
    }

    /// Returns digest-bound E5 asset digests, excluding the manifest itself.
    #[must_use]
    pub fn asset_digests(&self) -> BTreeMap<String, String> {
        BTreeMap::from([
            (
                "e5-existing-data-publication.v1.schema.json".to_owned(),
                sha256(E5_PUBLICATION_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e5-named-page.v1.schema.json".to_owned(),
                sha256(E5_NAMED_PAGE_SCHEMA_JSON.as_bytes()),
            ),
            (
                "e5-existing-data-publication.v1.json".to_owned(),
                sha256(E5_PUBLICATION_JSON.as_bytes()),
            ),
            (
                "e5-golden-fixtures.v1.json".to_owned(),
                sha256(E5_GOLDEN_FIXTURES_JSON.as_bytes()),
            ),
        ])
    }

    fn validate_registry_identity(&self) -> Result<(), E5AdapterError> {
        let registry = &self.registry;
        if registry.schema_version != PUBLICATION_REGISTRY_VERSION
            || registry.phase != "EX-DP-05"
            || registry.status != "EDGE_IMPLEMENTED_SOURCE_DARK"
            || registry.e3_coverage_manifest_sha256 != sha256(E3_COVERAGE_MANIFEST_JSON.as_bytes())
            || registry.e4_contract_manifest_sha256 != sha256(E4_CONTRACT_MANIFEST_JSON.as_bytes())
            || registry.manager_census_sha256 != sha256(MANAGER_CENSUS_JSON.as_bytes())
            || registry.current_source_map_sha256
                != sha256(current_source_compat::CANONICAL_MAP_JSON.as_bytes())
            || registry.manager_compatibility_authority_revision != AUTHORITY_REVISION
            || registry.current_source_contract_version != current_source_compat::CONTRACT_VERSION
            || registry.manager_runtime_contract_revision != RUNTIME_CONTRACT_REVISION
            || registry.page_bounds.maximum_page_rows != usize::from(MAXIMUM_PAGE_ROWS)
            || registry.page_bounds.maximum_response_bytes != MAXIMUM_RESPONSE_BYTES
            || registry.page_bounds.maximum_cursor_bytes != MAXIMUM_OPAQUE_TOKEN_BYTES
            || registry.page_bounds.total_history_cap
        {
            return Err(E5AdapterError::ContractDrift);
        }
        let authority = &registry.authority;
        if authority.browser_direct_source_access
            || authority.direct_database_access
            || authority.direct_redis_access
            || authority.raw_relation_or_sql_selection
            || authority.source_identity_or_credential
            || authority.source_network_change
            || authority.command_or_cli_execution
            || authority.runtime_activation
            || !authority.typed_unavailable_retained
        {
            return Err(E5AdapterError::AuthorityWidened);
        }
        ManagerCompatibilityAuthority::canonical()?;
        Ok(())
    }

    fn validate_entries(&self) -> Result<(), E5AdapterError> {
        let expected_fields = self
            .e3
            .field_definitions
            .fields
            .iter()
            .map(|field| field.field_id.as_str())
            .collect::<BTreeSet<_>>();
        let actual_fields = self
            .registry
            .entries
            .iter()
            .map(|entry| entry.field_id.as_str())
            .collect::<BTreeSet<_>>();
        if self.registry.entries.len() != expected_fields.len() || actual_fields != expected_fields
        {
            return Err(E5AdapterError::ContractDrift);
        }
        let mut implementation_counts = BTreeMap::<ImplementationKind, usize>::new();
        for entry in &self.registry.entries {
            if entry.field_id.is_empty()
                || entry.profiles.is_empty()
                || entry
                    .profiles
                    .iter()
                    .copied()
                    .collect::<BTreeSet<_>>()
                    .len()
                    != entry.profiles.len()
            {
                return Err(E5AdapterError::ContractDrift);
            }
            *implementation_counts
                .entry(entry.implementation)
                .or_default() += 1;
            let field = self.field(&entry.field_id)?;
            let binding = self.e4_binding(&entry.field_id)?;
            self.validate_entry_shape(entry, field, binding)?;
        }
        let count = |kind| {
            implementation_counts
                .get(&kind)
                .copied()
                .unwrap_or_default()
        };
        if count(ImplementationKind::ExistingPortalContract) != EXPECTED_EXISTING_ENTRY_COUNT
            || count(ImplementationKind::ManagerRelationPage) != EXPECTED_MANAGER_ENTRY_COUNT
            || count(ImplementationKind::PortalDerivedDelegate) != EXPECTED_DELEGATE_ENTRY_COUNT
            || count(ImplementationKind::TypedUnavailable) != EXPECTED_TYPED_UNAVAILABLE_ENTRY_COUNT
            || count(ImplementationKind::TypedSourceOwnerGap) != EXPECTED_OWNER_GAP_ENTRY_COUNT
        {
            return Err(E5AdapterError::ContractDrift);
        }
        Ok(())
    }

    fn validate_entry_shape(
        &self,
        entry: &PublicationEntry,
        field: &FieldDefinition,
        binding: &E4FieldOperationBinding,
    ) -> Result<(), E5AdapterError> {
        let no_manager = entry.manager_relation_id.is_none();
        let no_existing = entry.existing_contract_id.is_none();
        let no_delegate = entry.portal_delegate_id.is_none();
        let no_status = entry.typed_status_code.is_none();
        let no_absence = entry.typed_absence_id.is_none();
        match entry.implementation {
            ImplementationKind::ExistingPortalContract => {
                if binding.binding_status != BindingStatus::ExistingContractCompatible
                    || entry.publication_state != PublicationState::ImplementedReuse
                    || no_existing
                    || !no_manager
                    || !no_delegate
                    || !no_status
                    || !no_absence
                    || entry.profiles != ALL_PROFILES
                {
                    return Err(E5AdapterError::ContractDrift);
                }
            }
            ImplementationKind::ManagerRelationPage => {
                let relation = required_text(entry.manager_relation_id.as_ref())?;
                if binding.binding_status != BindingStatus::E5NamedOperationRequired
                    || entry.publication_state != PublicationState::ImplementedManagerAdapter
                    || relation != field.source_relation_or_operation
                    || !self.manager_relations.contains(&relation)
                    || !no_existing
                    || !no_delegate
                    || !no_status
                    || !no_absence
                    || entry.profiles != MANAGER_PROFILES
                {
                    return Err(E5AdapterError::ContractDrift);
                }
            }
            ImplementationKind::PortalDerivedDelegate => {
                let delegate = required_text(entry.portal_delegate_id.as_ref())?;
                let expected = expected_delegate(&entry.field_id);
                if binding.binding_status != BindingStatus::E5NamedOperationRequired
                    || entry.publication_state != PublicationState::ImplementedNamedPortalDelegate
                    || Some(delegate.as_str()) != expected
                    || !no_manager
                    || !no_existing
                    || !no_status
                    || !no_absence
                {
                    return Err(E5AdapterError::ContractDrift);
                }
            }
            ImplementationKind::TypedUnavailable => {
                if entry.field_id != "canary_drift"
                    || binding.binding_status != BindingStatus::E5NamedOperationRequired
                    || entry.publication_state != PublicationState::TypedUnavailable
                    || entry.typed_status_code.as_deref()
                        != Some("E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED")
                    || !no_manager
                    || !no_existing
                    || !no_delegate
                    || !no_absence
                    || entry.profiles != [PublicationProfile::Canary]
                {
                    return Err(E5AdapterError::ContractDrift);
                }
            }
            ImplementationKind::TypedSourceOwnerGap => {
                if binding.binding_status != BindingStatus::SourceOwnerGap
                    || entry.publication_state != PublicationState::SourceOwnerGap
                    || entry.typed_status_code.as_deref() != Some("SOURCE_OWNER_GAP")
                    || entry.typed_absence_id != binding.typed_absence_id
                    || !no_manager
                    || !no_existing
                    || !no_delegate
                    || entry.profiles != ALL_PROFILES
                {
                    return Err(E5AdapterError::ContractDrift);
                }
            }
        }
        if field.source_columns.is_empty()
            || field.primary_resource_key.is_empty()
            || binding.logical_operation_id.as_deref() != self.e4_operation(entry)
        {
            return Err(E5AdapterError::ContractDrift);
        }
        Ok(())
    }

    fn validate_fixtures(&self) -> Result<(), E5AdapterError> {
        let fixtures: E5GoldenFixtures = serde_json::from_str(E5_GOLDEN_FIXTURES_JSON)
            .map_err(|_| E5AdapterError::InvalidJson)?;
        let expected = BTreeSet::from([
            "POPULATED",
            "EMPTY",
            "PARTIAL",
            "STALE",
            "DUPLICATE",
            "GAP",
            "CORRECTION",
            "CONTINUATION",
        ]);
        let actual = fixtures
            .fixtures
            .iter()
            .map(|fixture| fixture.state.as_str())
            .collect::<BTreeSet<_>>();
        if fixtures.schema_version != GOLDEN_FIXTURES_VERSION
            || fixtures.provenance != "SYNTHETIC_SOURCE_TO_CONTRACT_NO_BUSINESS_ROWS"
            || fixtures.fixtures.len() != expected.len()
            || actual != expected
            || fixtures.fixtures.iter().any(|fixture| {
                fixture.fixture_id.is_empty()
                    || fixture.logical_operation_id.is_empty()
                    || fixture.expected_outcome.is_empty()
                    || self.operation(&fixture.logical_operation_id).is_err()
            })
        {
            return Err(E5AdapterError::ContractDrift);
        }
        for fixture in &fixtures.fixtures {
            let expected_outcome = match fixture.state.as_str() {
                "DUPLICATE" => "TYPED_SOURCE_REJECTION",
                "GAP" | "CORRECTION" => "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
                _ => "NAMED_PAGE",
            };
            if fixture.expected_outcome != expected_outcome {
                return Err(E5AdapterError::ContractDrift);
            }
        }
        Ok(())
    }

    fn validate_manifest(&self) -> Result<(), E5AdapterError> {
        let manifest: PublicationManifest = serde_json::from_str(E5_PUBLICATION_MANIFEST_JSON)
            .map_err(|_| E5AdapterError::InvalidJson)?;
        if manifest.schema_version != PUBLICATION_MANIFEST_VERSION
            || manifest.phase != "EX-DP-05"
            || manifest.status != "EDGE_IMPLEMENTED_SOURCE_DARK"
            || manifest.e3_coverage_manifest_sha256 != sha256(E3_COVERAGE_MANIFEST_JSON.as_bytes())
            || manifest.e4_contract_manifest_sha256 != sha256(E4_CONTRACT_MANIFEST_JSON.as_bytes())
            || manifest.counts.field_count != self.registry.entries.len()
            || manifest.counts.manager_relation_adapter_count != EXPECTED_MANAGER_ENTRY_COUNT
            || manifest.counts.existing_contract_count != EXPECTED_EXISTING_ENTRY_COUNT
            || manifest.counts.portal_delegate_count != EXPECTED_DELEGATE_ENTRY_COUNT
            || manifest.counts.typed_unavailable_count != EXPECTED_TYPED_UNAVAILABLE_ENTRY_COUNT
            || manifest.counts.source_owner_gap_count != EXPECTED_OWNER_GAP_ENTRY_COUNT
            || manifest.runtime_mutations.database != "NOT_APPLIED"
            || manifest.runtime_mutations.source_identity != "NOT_APPLIED"
            || manifest.runtime_mutations.route != "NOT_APPLIED"
            || manifest.runtime_mutations.listener != "NOT_APPLIED"
            || manifest.runtime_mutations.projection_or_cache != "NOT_APPLIED"
            || manifest.runtime_mutations.command_port != "NOT_APPLIED"
            || manifest.runtime_mutations.deployment != "NOT_APPLIED"
            || manifest.files != self.asset_digests()
        {
            return Err(E5AdapterError::ContractDrift);
        }
        Ok(())
    }

    fn entry_by_field(&self, field_id: &str) -> Result<&PublicationEntry, E5AdapterError> {
        self.registry
            .entries
            .iter()
            .find(|entry| entry.field_id == field_id)
            .ok_or(E5AdapterError::UnknownOperation)
    }

    fn field(&self, field_id: &str) -> Result<&FieldDefinition, E5AdapterError> {
        self.e3
            .field_definitions
            .fields
            .iter()
            .find(|field| field.field_id == field_id)
            .ok_or(E5AdapterError::ContractDrift)
    }

    fn e4_binding(&self, field_id: &str) -> Result<&E4FieldOperationBinding, E5AdapterError> {
        self.e4
            .operation_bindings
            .bindings
            .iter()
            .find(|binding| binding.field_id == field_id)
            .ok_or(E5AdapterError::ContractDrift)
    }

    fn e4_operation(&self, entry: &PublicationEntry) -> Option<&str> {
        self.e4_binding(&entry.field_id)
            .ok()
            .and_then(|binding| binding.logical_operation_id.as_deref())
    }

    fn descriptor(
        &self,
        entry: &PublicationEntry,
    ) -> Result<E5OperationDescriptor, E5AdapterError> {
        let field = self.field(&entry.field_id)?;
        let binding = self.e4_binding(&entry.field_id)?;
        Ok(E5OperationDescriptor {
            field_id: entry.field_id.clone(),
            logical_operation_id: binding.logical_operation_id.clone(),
            implementation: entry.implementation,
            publication_state: entry.publication_state,
            profiles: entry.profiles.clone(),
            allowed_fields: field.source_columns.clone(),
            primary_key_fields: split_resource_key(&field.primary_resource_key)?,
            source_history_semantics: field.history_requirement.clone(),
            current_status: field.current_status.clone(),
            typed_status_code: entry.typed_status_code.clone(),
            typed_absence_id: entry.typed_absence_id.clone(),
        })
    }

    fn require_profile(
        entry: &PublicationEntry,
        profile: PublicationProfile,
    ) -> Result<(), E5AdapterError> {
        if entry.profiles.contains(&profile) {
            Ok(())
        } else {
            Err(E5AdapterError::ProfileDenied)
        }
    }

    fn manager_profile_id(&self, profile: PublicationProfile) -> Result<&str, E5AdapterError> {
        let binding = self
            .current_source
            .profile(profile.current_source_profile())?;
        if profile == PublicationProfile::Canary || binding.source_profile != binding.profile {
            return Err(E5AdapterError::CanaryManagerReadDenied);
        }
        Ok(&binding.manager_profile_id)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PublicationRegistry {
    schema_version: String,
    phase: String,
    status: String,
    e3_coverage_manifest_sha256: String,
    e4_contract_manifest_sha256: String,
    manager_census_sha256: String,
    current_source_map_sha256: String,
    manager_compatibility_authority_revision: String,
    current_source_contract_version: String,
    manager_runtime_contract_revision: String,
    page_bounds: PageBounds,
    entries: Vec<PublicationEntry>,
    authority: PublicationAuthority,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PageBounds {
    maximum_page_rows: usize,
    maximum_response_bytes: usize,
    maximum_cursor_bytes: usize,
    total_history_cap: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PublicationEntry {
    field_id: String,
    implementation: ImplementationKind,
    publication_state: PublicationState,
    manager_relation_id: Option<String>,
    existing_contract_id: Option<String>,
    portal_delegate_id: Option<String>,
    typed_status_code: Option<String>,
    typed_absence_id: Option<String>,
    profiles: Vec<PublicationProfile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "each forbidden authority is independently pinned"
)]
struct PublicationAuthority {
    browser_direct_source_access: bool,
    direct_database_access: bool,
    direct_redis_access: bool,
    raw_relation_or_sql_selection: bool,
    source_identity_or_credential: bool,
    source_network_change: bool,
    command_or_cli_execution: bool,
    runtime_activation: bool,
    typed_unavailable_retained: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct E5GoldenFixtures {
    schema_version: String,
    provenance: String,
    fixtures: Vec<E5GoldenFixture>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct E5GoldenFixture {
    fixture_id: String,
    state: String,
    logical_operation_id: String,
    expected_outcome: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct PublicationManifest {
    schema_version: String,
    phase: String,
    status: String,
    e3_coverage_manifest_sha256: String,
    e4_contract_manifest_sha256: String,
    counts: PublicationCounts,
    runtime_mutations: RuntimeMutations,
    files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(
    clippy::struct_field_names,
    reason = "the manifest's machine-readable count keys are frozen cross-language wire names"
)]
struct PublicationCounts {
    field_count: usize,
    manager_relation_adapter_count: usize,
    existing_contract_count: usize,
    portal_delegate_count: usize,
    typed_unavailable_count: usize,
    source_owner_gap_count: usize,
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
struct Census {
    relations: Vec<CensusRelation>,
}

#[derive(Debug, Deserialize)]
struct CensusRelation {
    relation_id: String,
    source_capability: String,
}

fn validate_schema(document: &str, expected_id: &str) -> Result<(), E5AdapterError> {
    let value: Value = serde_json::from_str(document).map_err(|_| E5AdapterError::InvalidJson)?;
    if value["$schema"] != "https://json-schema.org/draft/2020-12/schema"
        || value["$id"] != expected_id
        || value["type"] != "object"
        || value["additionalProperties"] != false
        || value["required"].as_array().is_none_or(Vec::is_empty)
        || value["properties"]
            .as_object()
            .is_none_or(serde_json::Map::is_empty)
        || contains_forbidden(document)
    {
        return Err(E5AdapterError::ContractDrift);
    }
    Ok(())
}

fn manager_relation_ids() -> Result<BTreeSet<String>, E5AdapterError> {
    let census: Census =
        serde_json::from_str(MANAGER_CENSUS_JSON).map_err(|_| E5AdapterError::InvalidJson)?;
    let relations = census
        .relations
        .iter()
        .map(|relation| relation.relation_id.clone())
        .collect::<BTreeSet<_>>();
    if relations.len() != census.relations.len()
        || relations.len() != 96
        || census
            .relations
            .iter()
            .any(|relation| relation.source_capability != "managerRelationRecords")
    {
        return Err(E5AdapterError::ContractDrift);
    }
    Ok(relations)
}

fn expected_delegate(field_id: &str) -> Option<&'static str> {
    match field_id {
        "execution_quality" => Some("portal-query-analytics-execution-quality"),
        "conditional_legs" => Some("portal-current-source-conditional-orders"),
        "portfolio_capital" => Some("portal-analytics-capital-ledger"),
        "alpha_activity" => Some("portal-query-analytics-alpha-activity"),
        _ => None,
    }
}

fn required_text(value: Option<&String>) -> Result<String, E5AdapterError> {
    value
        .filter(|value| !value.is_empty() && value.trim() == value.as_str())
        .cloned()
        .ok_or(E5AdapterError::ContractDrift)
}

fn split_relation(value: &str) -> Result<(&str, &str), E5AdapterError> {
    let Some((schema, relation)) = value.split_once('.') else {
        return Err(E5AdapterError::ContractDrift);
    };
    if schema != "public"
        || relation.is_empty()
        || !relation
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(E5AdapterError::ContractDrift);
    }
    Ok((schema, relation))
}

fn split_resource_key(value: &str) -> Result<Vec<String>, E5AdapterError> {
    let fields = value
        .split(',')
        .map(str::trim)
        .map(str::to_owned)
        .collect::<Vec<_>>();
    if fields.is_empty()
        || fields.iter().any(|field| {
            field.is_empty()
                || !field
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
        })
        || fields.iter().collect::<BTreeSet<_>>().len() != fields.len()
    {
        return Err(E5AdapterError::ContractDrift);
    }
    Ok(fields)
}

fn relation_id(page: &RelationRecords) -> String {
    format!(
        "{}.{}",
        page.relation().schema(),
        page.relation().relation()
    )
}

fn validate_record_relation(record: &ManagerRecord, expected: &str) -> Result<(), E5AdapterError> {
    let actual = format!(
        "{}.{}",
        record.relation().schema(),
        record.relation().relation()
    );
    if actual == expected {
        Ok(())
    } else {
        Err(E5AdapterError::SourceBindingMismatch)
    }
}

fn resource_identity(record: &ManagerRecord, fields: &[&str]) -> Result<String, E5AdapterError> {
    let mut identity = BTreeMap::new();
    for field in fields {
        let value = record
            .fields()
            .get(*field)
            .filter(|value| !matches!(value, ManagerValue::Null))
            .ok_or(E5AdapterError::ResourceIdentityInvalid)?;
        identity.insert((*field).to_owned(), value);
    }
    serde_json::to_string(&identity).map_err(|_| E5AdapterError::SourceIdentitySerialization)
}

fn source_health(meta: &ManagerMeta) -> NamedPageSourceHealth {
    NamedPageSourceHealth {
        freshness: meta.freshness(),
        completeness: meta.completeness(),
        as_of_ms: meta.as_of().timestamp_millis(),
        trace_id: meta.trace_id().to_owned(),
        global_sequence: None,
        retention_floor_ms: None,
        retention_floor_status: "UNDECLARED_BY_MANAGER_ENVELOPE",
        correction_observability: "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
        replay_eligible: false,
    }
}

fn page_state(health: &NamedPageSourceHealth, records: &[NamedPageRecord]) -> NamedPageState {
    if health.freshness == Freshness::Stale {
        NamedPageState::Stale
    } else if health.completeness != Completeness::Complete {
        NamedPageState::Partial
    } else if records.is_empty() {
        NamedPageState::Empty
    } else {
        NamedPageState::Populated
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn contains_forbidden(value: &str) -> bool {
    [
        "/portal/execution/v4",
        "postgres://",
        "redis://",
        "SELECT ",
        "BEGIN ",
    ]
    .into_iter()
    .any(|forbidden| value.contains(forbidden))
}

#[cfg(test)]
mod tests;
