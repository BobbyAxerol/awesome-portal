#![forbid(unsafe_code)]

use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const REQUEST_SCHEMA_VERSION: &str = "portal.execution.external-read-request.v1";
pub const PUBLICATION_SCHEMA_VERSION: &str = "trading-system.portal-read-publication.v1";
pub const MAX_CATALOGUE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum CapabilityId {
    #[serde(rename = "orders.list")]
    OrdersList,
    #[serde(rename = "orders.trace")]
    OrdersTrace,
    #[serde(rename = "orders.legs")]
    OrdersLegs,
    #[serde(rename = "orders.fills")]
    OrdersFills,
    #[serde(rename = "deployments.positions")]
    DeploymentsPositions,
    #[serde(rename = "deployments.execution-quality")]
    DeploymentsExecutionQuality,
    #[serde(rename = "deployments.contribution")]
    DeploymentsContribution,
    #[serde(rename = "bindings.snapshot")]
    BindingsSnapshot,
    #[serde(rename = "bindings.exposure-verdict")]
    BindingsExposureVerdict,
    #[serde(rename = "portfolios.correlation-samples")]
    PortfoliosCorrelationSamples,
    #[serde(rename = "venues.calendar")]
    VenuesCalendar,
    #[serde(rename = "market.ticks")]
    MarketTicks,
    #[serde(rename = "market.candles")]
    MarketCandles,
    #[serde(rename = "accounts.current")]
    AccountsCurrent,
    #[serde(rename = "sessions.current")]
    SessionsCurrent,
    #[serde(rename = "reconciliation.current")]
    ReconciliationCurrent,
    #[serde(rename = "ops.command-journal")]
    OpsCommandJournal,
    #[serde(rename = "ops.findings")]
    OpsFindings,
    #[serde(rename = "ops.alerts")]
    OpsAlerts,
    #[serde(rename = "ops.dead-letters")]
    OpsDeadLetters,
    #[serde(rename = "ops.trace-order")]
    OpsTraceOrder,
    #[serde(rename = "ops.streams")]
    OpsStreams,
    #[serde(rename = "ops.alpha-activity")]
    OpsAlphaActivity,
    #[serde(rename = "ops.redis-retention")]
    OpsRedisRetention,
}

impl CapabilityId {
    #[must_use]
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::OrdersList => "orders.list",
            Self::OrdersTrace => "orders.trace",
            Self::OrdersLegs => "orders.legs",
            Self::OrdersFills => "orders.fills",
            Self::DeploymentsPositions => "deployments.positions",
            Self::DeploymentsExecutionQuality => "deployments.execution-quality",
            Self::DeploymentsContribution => "deployments.contribution",
            Self::BindingsSnapshot => "bindings.snapshot",
            Self::BindingsExposureVerdict => "bindings.exposure-verdict",
            Self::PortfoliosCorrelationSamples => "portfolios.correlation-samples",
            Self::VenuesCalendar => "venues.calendar",
            Self::MarketTicks => "market.ticks",
            Self::MarketCandles => "market.candles",
            Self::AccountsCurrent => "accounts.current",
            Self::SessionsCurrent => "sessions.current",
            Self::ReconciliationCurrent => "reconciliation.current",
            Self::OpsCommandJournal => "ops.command-journal",
            Self::OpsFindings => "ops.findings",
            Self::OpsAlerts => "ops.alerts",
            Self::OpsDeadLetters => "ops.dead-letters",
            Self::OpsTraceOrder => "ops.trace-order",
            Self::OpsStreams => "ops.streams",
            Self::OpsAlphaActivity => "ops.alpha-activity",
            Self::OpsRedisRetention => "ops.redis-retention",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CapabilityDefinition {
    pub id: CapabilityId,
    pub path_template: &'static str,
    pub maximum_page_rows: u16,
    pub maximum_response_bytes: usize,
}

pub const CAPABILITY_DEFINITIONS: [CapabilityDefinition; 24] = [
    definition(
        CapabilityId::OrdersList,
        "/portal/execution/v1/orders",
        200,
        8_388_608,
    ),
    definition(
        CapabilityId::OrdersTrace,
        "/portal/execution/v1/orders/{resource_id}/trace",
        200,
        2_097_152,
    ),
    definition(
        CapabilityId::OrdersLegs,
        "/portal/execution/v1/order-groups/{resource_id}/legs",
        8,
        524_288,
    ),
    definition(
        CapabilityId::OrdersFills,
        "/portal/execution/v1/orders/{resource_id}/fills",
        200,
        8_388_608,
    ),
    definition(
        CapabilityId::DeploymentsPositions,
        "/portal/execution/v1/deployments/{resource_id}/positions",
        500,
        8_388_608,
    ),
    definition(
        CapabilityId::DeploymentsExecutionQuality,
        "/portal/execution/v1/deployments/{resource_id}/execution-quality",
        12,
        2_097_152,
    ),
    definition(
        CapabilityId::DeploymentsContribution,
        "/portal/execution/v1/deployments/{resource_id}/contribution",
        400,
        2_097_152,
    ),
    definition(
        CapabilityId::BindingsSnapshot,
        "/portal/execution/v1/broker-bindings/{resource_id}",
        50,
        2_097_152,
    ),
    definition(
        CapabilityId::BindingsExposureVerdict,
        "/portal/execution/v1/broker-bindings/{resource_id}/exposure-verdict",
        50,
        2_097_152,
    ),
    definition(
        CapabilityId::PortfoliosCorrelationSamples,
        "/portal/execution/v1/portfolios/{resource_id}/correlation-samples",
        5_000,
        8_388_608,
    ),
    definition(
        CapabilityId::VenuesCalendar,
        "/portal/execution/v1/venues/{resource_id}/calendar",
        400,
        2_097_152,
    ),
    definition(
        CapabilityId::MarketTicks,
        "/portal/execution/v1/market/ticks",
        50,
        524_288,
    ),
    definition(
        CapabilityId::MarketCandles,
        "/portal/execution/v1/market/candles",
        2_000,
        8_388_608,
    ),
    definition(
        CapabilityId::AccountsCurrent,
        "/portal/execution/v1/accounts/{resource_id}",
        50,
        2_097_152,
    ),
    definition(
        CapabilityId::SessionsCurrent,
        "/portal/execution/v1/sessions/{resource_id}",
        50,
        2_097_152,
    ),
    definition(
        CapabilityId::ReconciliationCurrent,
        "/portal/execution/v1/reconciliation",
        200,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsCommandJournal,
        "/portal/execution/v1/ops/command-journal",
        200,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsFindings,
        "/portal/execution/v1/ops/findings",
        200,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsAlerts,
        "/portal/execution/v1/ops/alerts",
        200,
        2_097_152,
    ),
    definition(
        CapabilityId::OpsDeadLetters,
        "/portal/execution/v1/ops/dead-letters",
        200,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsTraceOrder,
        "/portal/execution/v1/ops/trace-order/{resource_id}",
        500,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsStreams,
        "/portal/execution/v1/ops/streams",
        200,
        2_097_152,
    ),
    definition(
        CapabilityId::OpsAlphaActivity,
        "/portal/execution/v1/ops/alpha-activity",
        200,
        4_194_304,
    ),
    definition(
        CapabilityId::OpsRedisRetention,
        "/portal/execution/v1/ops/redis-retention",
        200,
        2_097_152,
    ),
];

const fn definition(
    id: CapabilityId,
    path_template: &'static str,
    maximum_page_rows: u16,
    maximum_response_bytes: usize,
) -> CapabilityDefinition {
    CapabilityDefinition {
        id,
        path_template,
        maximum_page_rows,
        maximum_response_bytes,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublishedCapability {
    pub id: CapabilityId,
    pub method: String,
    pub path_template: String,
    pub authentication: String,
    pub pagination: String,
    pub maximum_page_rows: u16,
    pub maximum_response_bytes: usize,
    pub response_schema_sha256: String,
    pub positive_fixture_sha256: String,
    pub published: bool,
    pub portal_reachable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// The owner publication intentionally spells every forbidden authority as a
// separate signed boolean so a widened field cannot hide behind an enum.
#[allow(clippy::struct_excessive_bools)]
pub struct PublicationAuthority {
    pub read_only: bool,
    pub portal_database_credential: bool,
    pub portal_redis_authority: bool,
    pub portal_cli_authority: bool,
    pub portal_broker_authority: bool,
    pub command_or_mutation: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationCatalogue {
    pub schema_version: String,
    pub request_revision: String,
    pub source_contract_revision: String,
    pub source_contract_commit: String,
    pub owner_id: String,
    pub owner_accepted: bool,
    pub partial_publication: bool,
    pub authority: PublicationAuthority,
    pub capabilities: Vec<PublishedCapability>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// This mirrors the external evidence-only manifest byte-for-byte. Collapsing
// the booleans would weaken drift detection and owner review.
#[allow(clippy::struct_excessive_bools)]
pub struct ManifestAuthority {
    pub publication_evidence_only: bool,
    pub portal_activation: bool,
    pub network_change: bool,
    pub database_credential_handoff: bool,
    pub redis: bool,
    pub cli: bool,
    pub broker: bool,
    pub command: bool,
    pub mutation: bool,
    pub sandbox: bool,
    pub canary: bool,
    pub live: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicationManifest {
    pub schema_version: String,
    pub request_revision: String,
    pub source_contract_revision: String,
    pub source_contract_commit: String,
    pub source_image_digest: String,
    pub owner_id: String,
    pub owner_accepted: bool,
    pub owner_acceptance_evidence_sha256: String,
    pub capability_catalogue_sha256: String,
    pub semantic_rulings_sha256: String,
    pub golden_corpus_index_sha256: String,
    pub acceptance_results_sha256: String,
    pub authority: ManifestAuthority,
}

#[derive(Debug, Clone)]
pub struct CompatibilityGate {
    source_contract_revision: String,
    capabilities: BTreeMap<CapabilityId, PublishedCapability>,
}

impl CompatibilityGate {
    /// Accepts an immutable owner publication without opening any source connection.
    ///
    /// # Errors
    ///
    /// Rejects unaccepted/drifted publications, unsafe authority, unexpected routes,
    /// methods, bounds, authentication or missing response/fixture digests.
    pub fn accept(
        catalogue_bytes: &[u8],
        manifest: &PublicationManifest,
    ) -> Result<Self, AdapterError> {
        if catalogue_bytes.is_empty() || catalogue_bytes.len() > MAX_CATALOGUE_BYTES {
            return Err(AdapterError::CatalogueSize);
        }
        let catalogue: PublicationCatalogue = serde_json::from_slice(catalogue_bytes)
            .map_err(|_| AdapterError::MalformedCatalogue)?;
        validate_manifest(&catalogue, catalogue_bytes, manifest)?;
        validate_authority(&catalogue.authority)?;
        validate_commit(&catalogue.source_contract_commit)?;

        let definitions = CAPABILITY_DEFINITIONS
            .iter()
            .map(|definition| (definition.id, definition))
            .collect::<BTreeMap<_, _>>();
        let mut capabilities = BTreeMap::new();
        for capability in catalogue.capabilities {
            if capabilities.contains_key(&capability.id) {
                return Err(AdapterError::DuplicateCapability(capability.id));
            }
            let expected = definitions
                .get(&capability.id)
                .ok_or(AdapterError::UnknownCapability)?;
            validate_capability(&capability, expected)?;
            capabilities.insert(capability.id, capability);
        }
        if capabilities.is_empty()
            || (!catalogue.partial_publication && capabilities.len() != definitions.len())
            || (!catalogue.partial_publication
                && capabilities
                    .values()
                    .any(|capability| !capability.published || !capability.portal_reachable))
            || (catalogue.partial_publication
                && !capabilities
                    .values()
                    .any(|capability| capability.published && capability.portal_reachable))
        {
            return Err(AdapterError::PublicationCompleteness);
        }
        Ok(Self {
            source_contract_revision: catalogue.source_contract_revision,
            capabilities,
        })
    }

    #[must_use]
    pub fn availability(&self, id: CapabilityId) -> CapabilityAvailability {
        match self.capabilities.get(&id) {
            Some(capability) if capability.published && capability.portal_reachable => {
                CapabilityAvailability::Available
            }
            Some(_) => CapabilityAvailability::Unpublished,
            None => CapabilityAvailability::UnavailableInRevision,
        }
    }

    /// Builds one exact GET request. Authentication remains transport-owned.
    ///
    /// # Errors
    ///
    /// Fails closed for unpublished capability, invalid resource identity,
    /// unsupported query field, dual cursor, unbounded page or query injection.
    pub fn request_blueprint(
        &self,
        id: CapabilityId,
        resource_id: Option<&str>,
        query: &[QueryParameter],
    ) -> Result<RequestBlueprint, AdapterError> {
        let capability = self
            .capabilities
            .get(&id)
            .ok_or(AdapterError::CapabilityUnavailable(id))?;
        if !capability.published || !capability.portal_reachable {
            return Err(AdapterError::CapabilityUnavailable(id));
        }
        if !capability.published || !capability.portal_reachable {
            return Err(AdapterError::CapabilityUnavailable(id));
        }
        let definition = CAPABILITY_DEFINITIONS
            .iter()
            .find(|definition| definition.id == id)
            .ok_or(AdapterError::UnknownCapability)?;
        let needs_resource = definition.path_template.contains("{resource_id}");
        let path = match (needs_resource, resource_id) {
            (true, Some(value)) => {
                validate_resource_token(value)?;
                definition.path_template.replace("{resource_id}", value)
            }
            (false, None) => definition.path_template.to_owned(),
            _ => return Err(AdapterError::ResourceScopeMismatch),
        };
        validate_query(id, query, capability.maximum_page_rows)?;
        Ok(RequestBlueprint {
            method: "GET",
            path,
            query: query.to_vec(),
            headers: BTreeMap::from([
                (
                    "X-Trading-Contract-Revision".to_owned(),
                    self.source_contract_revision.clone(),
                ),
                (
                    "X-Portal-Read-Capability".to_owned(),
                    id.wire_name().to_owned(),
                ),
            ]),
            maximum_response_bytes: capability.maximum_response_bytes,
        })
    }

    /// Parses only the common authority/freshness envelope and leaves typed data
    /// to the mapper generated from the published response schema.
    ///
    /// # Errors
    ///
    /// Rejects body/header/schema drift, oversized data, secret-shaped fields,
    /// non-Execution authority and unknown HTTP outcomes.
    pub fn parse_response(
        &self,
        id: CapabilityId,
        response: &ResponseInput<'_>,
    ) -> Result<ReadOutcome, AdapterError> {
        let capability = self
            .capabilities
            .get(&id)
            .ok_or(AdapterError::CapabilityUnavailable(id))?;
        if response.body.len() > capability.maximum_response_bytes
            || response.body.len() > MAX_RESPONSE_BYTES
        {
            return Err(AdapterError::ResponseTooLarge);
        }
        match response.http_status {
            200 => {
                require_header(
                    response.headers,
                    "x-trading-contract-revision",
                    &self.source_contract_revision,
                )?;
                require_header(response.headers, "x-portal-read-capability", id.wire_name())?;
                require_header(
                    response.headers,
                    "x-response-schema-sha256",
                    &capability.response_schema_sha256,
                )?;
                let envelope: ExternalQueryEnvelope = serde_json::from_slice(response.body)
                    .map_err(|_| AdapterError::MalformedResponse)?;
                validate_envelope(&envelope)?;
                Ok(ReadOutcome::Success(envelope))
            }
            403 => Ok(ReadOutcome::Denied(parse_problem(response.body)?)),
            404 | 412 => Ok(ReadOutcome::Unavailable(parse_problem(response.body)?)),
            406 => Ok(ReadOutcome::Incompatible(parse_problem(response.body)?)),
            429 => Ok(ReadOutcome::Retryable(parse_problem(response.body)?)),
            500..=599 => Ok(ReadOutcome::Unavailable(ExternalProblem {
                code: "SOURCE_UNAVAILABLE".to_owned(),
                message: "External read source is unavailable".to_owned(),
            })),
            status => Err(AdapterError::UnsupportedHttpStatus(status)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CapabilityAvailability {
    Available,
    Unpublished,
    UnavailableInRevision,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryField {
    WorkspaceId,
    Environment,
    DeploymentId,
    AlphaId,
    PortfolioId,
    BindingId,
    AccountId,
    Venue,
    Symbol,
    StatusBucket,
    From,
    To,
    Window,
    After,
    Before,
    Limit,
    IncludeFlat,
}

impl QueryField {
    #[must_use]
    pub const fn wire_name(self) -> &'static str {
        match self {
            Self::WorkspaceId => "workspace_id",
            Self::Environment => "environment",
            Self::DeploymentId => "deployment_id",
            Self::AlphaId => "alpha_id",
            Self::PortfolioId => "portfolio_id",
            Self::BindingId => "binding_id",
            Self::AccountId => "account_id",
            Self::Venue => "venue",
            Self::Symbol => "symbol",
            Self::StatusBucket => "status_bucket",
            Self::From => "from",
            Self::To => "to",
            Self::Window => "window",
            Self::After => "after",
            Self::Before => "before",
            Self::Limit => "limit",
            Self::IncludeFlat => "include_flat",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryParameter {
    pub field: QueryField,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlueprint {
    pub method: &'static str,
    pub path: String,
    pub query: Vec<QueryParameter>,
    pub headers: BTreeMap<String, String>,
    pub maximum_response_bytes: usize,
}

#[derive(Debug, Clone)]
pub struct ResponseInput<'a> {
    pub http_status: u16,
    pub headers: &'a BTreeMap<String, String>,
    pub body: &'a [u8],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalQueryEnvelope {
    pub data: Value,
    pub authority: String,
    pub as_of: DateTime<Utc>,
    pub source_sequence: u64,
    pub freshness: ExternalFreshness,
    pub completeness: ExternalCompleteness,
    pub projection_lag_ms: u64,
    pub trace_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalFreshness {
    Fresh,
    Degraded,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ExternalCompleteness {
    Complete,
    Partial,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExternalProblem {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReadOutcome {
    Success(ExternalQueryEnvelope),
    Denied(ExternalProblem),
    Retryable(ExternalProblem),
    Unavailable(ExternalProblem),
    Incompatible(ExternalProblem),
}

fn validate_manifest(
    catalogue: &PublicationCatalogue,
    bytes: &[u8],
    manifest: &PublicationManifest,
) -> Result<(), AdapterError> {
    if catalogue.schema_version != PUBLICATION_SCHEMA_VERSION
        || manifest.schema_version != "trading-system.portal-read-publication-manifest.v1"
        || catalogue.request_revision != REQUEST_SCHEMA_VERSION
        || manifest.request_revision != REQUEST_SCHEMA_VERSION
        || !catalogue.owner_accepted
        || !manifest.owner_accepted
        || catalogue.owner_id != manifest.owner_id
        || catalogue.source_contract_revision != manifest.source_contract_revision
        || catalogue.source_contract_commit != manifest.source_contract_commit
    {
        return Err(AdapterError::PublicationIdentity);
    }
    if sha256(bytes) != manifest.capability_catalogue_sha256
        || !valid_nonzero_digest(&manifest.semantic_rulings_sha256)
        || !valid_nonzero_digest(&manifest.golden_corpus_index_sha256)
        || !valid_nonzero_digest(&manifest.acceptance_results_sha256)
        || !valid_nonzero_digest(&manifest.source_image_digest)
        || !valid_nonzero_digest(&manifest.owner_acceptance_evidence_sha256)
        || !manifest_authority_is_evidence_only(&manifest.authority)
    {
        return Err(AdapterError::PublicationDigest);
    }
    Ok(())
}

fn validate_authority(authority: &PublicationAuthority) -> Result<(), AdapterError> {
    if !authority.read_only
        || authority.portal_database_credential
        || authority.portal_redis_authority
        || authority.portal_cli_authority
        || authority.portal_broker_authority
        || authority.command_or_mutation
    {
        return Err(AdapterError::AuthorityWidening);
    }
    Ok(())
}

fn validate_capability(
    capability: &PublishedCapability,
    expected: &CapabilityDefinition,
) -> Result<(), AdapterError> {
    if capability.method != "GET"
        || capability.path_template != expected.path_template
        || capability.authentication != "MTLS_AND_DELEGATED_JWT"
        || !matches!(capability.pagination.as_str(), "NONE" | "KEYSET")
        || capability.maximum_page_rows == 0
        || capability.maximum_page_rows > expected.maximum_page_rows
        || capability.maximum_response_bytes == 0
        || capability.maximum_response_bytes > expected.maximum_response_bytes
        || capability.maximum_response_bytes > MAX_RESPONSE_BYTES
        || !valid_nonzero_digest(&capability.response_schema_sha256)
        || !valid_nonzero_digest(&capability.positive_fixture_sha256)
    {
        return Err(AdapterError::CapabilityContractDrift(capability.id));
    }
    Ok(())
}

fn validate_commit(value: &str) -> Result<(), AdapterError> {
    if value.len() != 40
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        || value.bytes().all(|byte| byte == b'0')
    {
        return Err(AdapterError::PublicationIdentity);
    }
    Ok(())
}

fn validate_query(
    id: CapabilityId,
    query: &[QueryParameter],
    maximum: u16,
) -> Result<(), AdapterError> {
    let allowed = allowed_query(id);
    let mut fields = BTreeSet::new();
    for parameter in query {
        if !allowed.contains(&parameter.field) || !fields.insert(parameter.field) {
            return Err(AdapterError::UnsupportedQuery(parameter.field));
        }
        validate_token(&parameter.value)?;
        if parameter.field == QueryField::Limit {
            let value = parameter
                .value
                .parse::<u16>()
                .map_err(|_| AdapterError::InvalidLimit)?;
            if value == 0 || value > maximum {
                return Err(AdapterError::InvalidLimit);
            }
        }
    }
    if fields.contains(&QueryField::After) && fields.contains(&QueryField::Before) {
        return Err(AdapterError::DualCursor);
    }
    if !fields.contains(&QueryField::WorkspaceId) || !fields.contains(&QueryField::Environment) {
        return Err(AdapterError::MissingScopeContext);
    }
    Ok(())
}

fn allowed_query(id: CapabilityId) -> BTreeSet<QueryField> {
    let common = [QueryField::WorkspaceId, QueryField::Environment];
    let extra: &[QueryField] = match id {
        CapabilityId::OrdersList => &[
            QueryField::DeploymentId,
            QueryField::AlphaId,
            QueryField::Venue,
            QueryField::Symbol,
            QueryField::StatusBucket,
            QueryField::From,
            QueryField::To,
            QueryField::After,
            QueryField::Before,
            QueryField::Limit,
        ],
        CapabilityId::OrdersFills | CapabilityId::DeploymentsPositions => &[
            QueryField::After,
            QueryField::Before,
            QueryField::Limit,
            QueryField::IncludeFlat,
        ],
        CapabilityId::MarketTicks => &[QueryField::Venue, QueryField::Symbol],
        CapabilityId::MarketCandles => &[
            QueryField::Venue,
            QueryField::Symbol,
            QueryField::From,
            QueryField::To,
            QueryField::Window,
            QueryField::After,
            QueryField::Before,
            QueryField::Limit,
        ],
        CapabilityId::PortfoliosCorrelationSamples
        | CapabilityId::DeploymentsContribution
        | CapabilityId::DeploymentsExecutionQuality
        | CapabilityId::VenuesCalendar => &[
            QueryField::From,
            QueryField::To,
            QueryField::Window,
            QueryField::After,
            QueryField::Before,
            QueryField::Limit,
        ],
        CapabilityId::OpsCommandJournal
        | CapabilityId::OpsFindings
        | CapabilityId::OpsAlerts
        | CapabilityId::OpsDeadLetters
        | CapabilityId::OpsStreams
        | CapabilityId::OpsAlphaActivity
        | CapabilityId::ReconciliationCurrent => &[
            QueryField::From,
            QueryField::To,
            QueryField::After,
            QueryField::Before,
            QueryField::Limit,
        ],
        _ => &[],
    };
    common.into_iter().chain(extra.iter().copied()).collect()
}

fn validate_token(value: &str) -> Result<(), AdapterError> {
    if value.is_empty()
        || value.len() > 256
        || value.contains('/')
        || value.contains('\\')
        || value.contains('&')
        || value.contains('=')
        || value.contains('#')
        || value.contains('%')
        || value.chars().any(char::is_control)
    {
        return Err(AdapterError::InvalidQueryValue);
    }
    Ok(())
}

fn validate_resource_token(value: &str) -> Result<(), AdapterError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(AdapterError::InvalidQueryValue);
    }
    Ok(())
}

fn validate_envelope(envelope: &ExternalQueryEnvelope) -> Result<(), AdapterError> {
    if envelope.authority != "EXECUTION_CELL"
        || envelope.trace_id.is_empty()
        || envelope.trace_id.len() > 128
        || !envelope.data.is_object()
        || contains_secret_shaped_key(&envelope.data)
    {
        return Err(AdapterError::InvalidEnvelope);
    }
    Ok(())
}

const fn manifest_authority_is_evidence_only(authority: &ManifestAuthority) -> bool {
    authority.publication_evidence_only
        && !authority.portal_activation
        && !authority.network_change
        && !authority.database_credential_handoff
        && !authority.redis
        && !authority.cli
        && !authority.broker
        && !authority.command
        && !authority.mutation
        && !authority.sandbox
        && !authority.canary
        && !authority.live
}

fn contains_secret_shaped_key(value: &Value) -> bool {
    match value {
        Value::Object(values) => values.iter().any(|(key, child)| {
            let normalized = key.to_ascii_lowercase();
            matches!(
                normalized.as_str(),
                "password" | "secret" | "api_key" | "private_key" | "dsn" | "credential"
            ) || contains_secret_shaped_key(child)
        }),
        Value::Array(values) => values.iter().any(contains_secret_shaped_key),
        _ => false,
    }
}

fn require_header(
    headers: &BTreeMap<String, String>,
    name: &str,
    expected: &str,
) -> Result<(), AdapterError> {
    if headers.get(name).map(String::as_str) != Some(expected) {
        return Err(AdapterError::ResponseHeaderDrift(name.to_owned()));
    }
    Ok(())
}

fn parse_problem(body: &[u8]) -> Result<ExternalProblem, AdapterError> {
    serde_json::from_slice(body).map_err(|_| AdapterError::MalformedResponse)
}

fn sha256(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn valid_nonzero_digest(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
        && value[7..].bytes().any(|byte| byte != b'0')
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum AdapterError {
    #[error("publication catalogue size is invalid")]
    CatalogueSize,
    #[error("publication catalogue is malformed")]
    MalformedCatalogue,
    #[error("publication identity is invalid")]
    PublicationIdentity,
    #[error("publication digest is invalid")]
    PublicationDigest,
    #[error("publication widened source authority")]
    AuthorityWidening,
    #[error("publication capability set is incomplete")]
    PublicationCompleteness,
    #[error("capability is duplicated: {0:?}")]
    DuplicateCapability(CapabilityId),
    #[error("capability is unknown")]
    UnknownCapability,
    #[error("capability contract drifted: {0:?}")]
    CapabilityContractDrift(CapabilityId),
    #[error("capability is unavailable: {0:?}")]
    CapabilityUnavailable(CapabilityId),
    #[error("resource scope does not match route")]
    ResourceScopeMismatch,
    #[error("query field is unsupported: {0:?}")]
    UnsupportedQuery(QueryField),
    #[error("query value is invalid")]
    InvalidQueryValue,
    #[error("page limit is invalid")]
    InvalidLimit,
    #[error("after and before cursors are mutually exclusive")]
    DualCursor,
    #[error("workspace and environment source scope are required")]
    MissingScopeContext,
    #[error("response body exceeds the capability bound")]
    ResponseTooLarge,
    #[error("response header drift: {0}")]
    ResponseHeaderDrift(String),
    #[error("response is malformed")]
    MalformedResponse,
    #[error("authority/freshness envelope is invalid")]
    InvalidEnvelope,
    #[error("unsupported HTTP status {0}")]
    UnsupportedHttpStatus(u16),
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIGEST: &str = "sha256:1111111111111111111111111111111111111111111111111111111111111111";

    fn catalogue(partial: bool) -> PublicationCatalogue {
        PublicationCatalogue {
            schema_version: PUBLICATION_SCHEMA_VERSION.to_owned(),
            request_revision: REQUEST_SCHEMA_VERSION.to_owned(),
            source_contract_revision: "trading.portal-read.v1".to_owned(),
            source_contract_commit: "a".repeat(40),
            owner_id: "trading-system-owner".to_owned(),
            owner_accepted: true,
            partial_publication: partial,
            authority: PublicationAuthority {
                read_only: true,
                portal_database_credential: false,
                portal_redis_authority: false,
                portal_cli_authority: false,
                portal_broker_authority: false,
                command_or_mutation: false,
            },
            capabilities: CAPABILITY_DEFINITIONS
                .iter()
                .map(|definition| PublishedCapability {
                    id: definition.id,
                    method: "GET".to_owned(),
                    path_template: definition.path_template.to_owned(),
                    authentication: "MTLS_AND_DELEGATED_JWT".to_owned(),
                    pagination: if definition.maximum_page_rows > 50 {
                        "KEYSET"
                    } else {
                        "NONE"
                    }
                    .to_owned(),
                    maximum_page_rows: definition.maximum_page_rows,
                    maximum_response_bytes: definition.maximum_response_bytes,
                    response_schema_sha256: DIGEST.to_owned(),
                    positive_fixture_sha256: DIGEST.to_owned(),
                    published: true,
                    portal_reachable: true,
                })
                .collect(),
        }
    }

    fn accepted(catalogue: &PublicationCatalogue) -> CompatibilityGate {
        let bytes = serde_json::to_vec(catalogue).unwrap();
        CompatibilityGate::accept(
            &bytes,
            &PublicationManifest {
                schema_version: "trading-system.portal-read-publication-manifest.v1".to_owned(),
                request_revision: REQUEST_SCHEMA_VERSION.to_owned(),
                source_contract_revision: catalogue.source_contract_revision.clone(),
                source_contract_commit: catalogue.source_contract_commit.clone(),
                source_image_digest: DIGEST.to_owned(),
                owner_id: catalogue.owner_id.clone(),
                owner_accepted: true,
                owner_acceptance_evidence_sha256: DIGEST.to_owned(),
                capability_catalogue_sha256: sha256(&bytes),
                semantic_rulings_sha256: DIGEST.to_owned(),
                golden_corpus_index_sha256: DIGEST.to_owned(),
                acceptance_results_sha256: DIGEST.to_owned(),
                authority: evidence_only_authority(),
            },
        )
        .unwrap()
    }

    fn evidence_only_authority() -> ManifestAuthority {
        ManifestAuthority {
            publication_evidence_only: true,
            portal_activation: false,
            network_change: false,
            database_credential_handoff: false,
            redis: false,
            cli: false,
            broker: false,
            command: false,
            mutation: false,
            sandbox: false,
            canary: false,
            live: false,
        }
    }

    fn scope_query() -> Vec<QueryParameter> {
        vec![
            QueryParameter {
                field: QueryField::WorkspaceId,
                value: "ws-main".to_owned(),
            },
            QueryParameter {
                field: QueryField::Environment,
                value: "PAPER".to_owned(),
            },
        ]
    }

    #[test]
    fn catalogue_definitions_are_unique_get_only_and_not_generic_escape_hatches() {
        let ids = CAPABILITY_DEFINITIONS
            .iter()
            .map(|value| value.id)
            .collect::<BTreeSet<_>>();
        let paths = CAPABILITY_DEFINITIONS
            .iter()
            .map(|value| value.path_template)
            .collect::<BTreeSet<_>>();
        assert_eq!(ids.len(), CAPABILITY_DEFINITIONS.len());
        assert_eq!(paths.len(), CAPABILITY_DEFINITIONS.len());
        assert!(paths
            .iter()
            .all(|path| path.starts_with("/portal/execution/v1/")));
        assert!(paths.iter().all(|path| !path.contains("redis/get")
            && !path.contains("redis/scan")
            && !path.contains("sql")
            && !path.contains("cli")));
    }

    #[test]
    fn checked_in_request_template_and_rust_definitions_cannot_drift() {
        let template: PublicationCatalogue = serde_json::from_str(include_str!(
            "../../../contracts/n11-external-read-v1-request/capability-catalogue.example.json"
        ))
        .unwrap();
        let manifest: PublicationManifest = serde_json::from_str(include_str!(
            "../../../contracts/n11-external-read-v1-request/owner-publication.manifest.example.json"
        ))
        .unwrap();
        assert_eq!(template.capabilities.len(), CAPABILITY_DEFINITIONS.len());
        for definition in CAPABILITY_DEFINITIONS {
            let published = template
                .capabilities
                .iter()
                .find(|capability| capability.id == definition.id)
                .unwrap();
            assert_eq!(published.method, "GET");
            assert_eq!(published.path_template, definition.path_template);
            assert!(published.maximum_page_rows <= definition.maximum_page_rows);
            assert!(published.maximum_response_bytes <= definition.maximum_response_bytes);
            assert!(!published.published);
            assert!(!published.portal_reachable);
        }
        assert!(!template.owner_accepted);
        assert!(!manifest.owner_accepted);
        assert!(manifest_authority_is_evidence_only(&manifest.authority));
    }

    #[test]
    fn accepted_publication_builds_exact_bounded_blueprint() {
        let gate = accepted(&catalogue(false));
        let blueprint = gate
            .request_blueprint(
                CapabilityId::OrdersList,
                None,
                &[
                    QueryParameter {
                        field: QueryField::WorkspaceId,
                        value: "ws-main".to_owned(),
                    },
                    QueryParameter {
                        field: QueryField::Environment,
                        value: "PAPER".to_owned(),
                    },
                    QueryParameter {
                        field: QueryField::StatusBucket,
                        value: "OPEN".to_owned(),
                    },
                    QueryParameter {
                        field: QueryField::Limit,
                        value: "200".to_owned(),
                    },
                ],
            )
            .unwrap();
        assert_eq!(blueprint.method, "GET");
        assert_eq!(blueprint.path, "/portal/execution/v1/orders");
        assert_eq!(blueprint.maximum_response_bytes, 8_388_608);
        assert_eq!(blueprint.headers["X-Portal-Read-Capability"], "orders.list");
    }

    #[test]
    fn partial_publication_is_accepted_but_missing_panel_stays_unavailable() {
        let mut value = catalogue(true);
        value
            .capabilities
            .retain(|item| item.id == CapabilityId::OrdersList);
        let gate = accepted(&value);
        assert_eq!(
            gate.availability(CapabilityId::OrdersList),
            CapabilityAvailability::Available
        );
        assert_eq!(
            gate.availability(CapabilityId::OpsAlerts),
            CapabilityAvailability::UnavailableInRevision
        );
        assert_eq!(
            gate.request_blueprint(CapabilityId::OpsAlerts, None, &[]),
            Err(AdapterError::CapabilityUnavailable(CapabilityId::OpsAlerts))
        );
    }

    #[test]
    fn owner_acceptance_digest_authority_and_route_drift_fail_closed() {
        let mut value = catalogue(false);
        value.owner_accepted = false;
        let bytes = serde_json::to_vec(&value).unwrap();
        let manifest = PublicationManifest {
            schema_version: "trading-system.portal-read-publication-manifest.v1".to_owned(),
            request_revision: REQUEST_SCHEMA_VERSION.to_owned(),
            source_contract_revision: value.source_contract_revision.clone(),
            source_contract_commit: value.source_contract_commit.clone(),
            source_image_digest: DIGEST.to_owned(),
            owner_id: value.owner_id.clone(),
            owner_accepted: true,
            owner_acceptance_evidence_sha256: DIGEST.to_owned(),
            capability_catalogue_sha256: sha256(&bytes),
            semantic_rulings_sha256: DIGEST.to_owned(),
            golden_corpus_index_sha256: DIGEST.to_owned(),
            acceptance_results_sha256: DIGEST.to_owned(),
            authority: evidence_only_authority(),
        };
        assert!(matches!(
            CompatibilityGate::accept(&bytes, &manifest),
            Err(AdapterError::PublicationIdentity)
        ));

        let mut value = catalogue(false);
        value.authority.portal_redis_authority = true;
        let bytes = serde_json::to_vec(&value).unwrap();
        let mut manifest = manifest;
        manifest.capability_catalogue_sha256 = sha256(&bytes);
        assert!(matches!(
            CompatibilityGate::accept(&bytes, &manifest),
            Err(AdapterError::AuthorityWidening)
        ));

        let mut value = catalogue(false);
        value.capabilities[0].path_template = "/redis/scan".to_owned();
        let bytes = serde_json::to_vec(&value).unwrap();
        manifest.capability_catalogue_sha256 = sha256(&bytes);
        assert!(matches!(
            CompatibilityGate::accept(&bytes, &manifest),
            Err(AdapterError::CapabilityContractDrift(_))
        ));
    }

    #[test]
    fn query_and_resource_injection_are_rejected() {
        let gate = accepted(&catalogue(false));
        assert_eq!(
            gate.request_blueprint(CapabilityId::OrdersTrace, Some("../admin"), &[]),
            Err(AdapterError::InvalidQueryValue)
        );
        assert_eq!(
            gate.request_blueprint(
                CapabilityId::OrdersList,
                None,
                &[
                    scope_query()[0].clone(),
                    scope_query()[1].clone(),
                    QueryParameter {
                        field: QueryField::Limit,
                        value: "201".to_owned()
                    },
                ]
            ),
            Err(AdapterError::InvalidLimit)
        );
        assert_eq!(
            gate.request_blueprint(
                CapabilityId::OrdersList,
                None,
                &[
                    scope_query()[0].clone(),
                    scope_query()[1].clone(),
                    QueryParameter {
                        field: QueryField::After,
                        value: "a".to_owned()
                    },
                    QueryParameter {
                        field: QueryField::Before,
                        value: "b".to_owned()
                    },
                ]
            ),
            Err(AdapterError::DualCursor)
        );
        assert!(matches!(
            gate.request_blueprint(
                CapabilityId::BindingsSnapshot,
                Some("binding-1"),
                &[
                    scope_query()[0].clone(),
                    scope_query()[1].clone(),
                    QueryParameter {
                        field: QueryField::Symbol,
                        value: "BTCUSDT".to_owned()
                    },
                ]
            ),
            Err(AdapterError::UnsupportedQuery(_))
        ));
        assert_eq!(
            gate.request_blueprint(CapabilityId::OrdersList, None, &[]),
            Err(AdapterError::MissingScopeContext)
        );
    }

    #[test]
    fn response_requires_exact_contract_capability_schema_and_safe_envelope() {
        let gate = accepted(&catalogue(false));
        let headers = BTreeMap::from([
            (
                "x-trading-contract-revision".to_owned(),
                "trading.portal-read.v1".to_owned(),
            ),
            (
                "x-portal-read-capability".to_owned(),
                "orders.list".to_owned(),
            ),
            ("x-response-schema-sha256".to_owned(), DIGEST.to_owned()),
        ]);
        let body = br#"{"data":{"orders":[]},"authority":"EXECUTION_CELL","as_of":"2026-08-26T10:00:00Z","source_sequence":42,"freshness":"FRESH","completeness":"COMPLETE","projection_lag_ms":12,"trace_id":"trace-1"}"#;
        let outcome = gate
            .parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 200,
                    headers: &headers,
                    body,
                },
            )
            .unwrap();
        assert!(matches!(outcome, ReadOutcome::Success(_)));

        let secret = br#"{"data":{"api_key":"leak"},"authority":"EXECUTION_CELL","as_of":"2026-08-26T10:00:00Z","source_sequence":42,"freshness":"FRESH","completeness":"COMPLETE","projection_lag_ms":12,"trace_id":"trace-1"}"#;
        assert_eq!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 200,
                    headers: &headers,
                    body: secret
                }
            ),
            Err(AdapterError::InvalidEnvelope)
        );
        let mut drift = headers;
        drift.insert(
            "x-response-schema-sha256".to_owned(),
            "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff".to_owned(),
        );
        assert!(matches!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 200,
                    headers: &drift,
                    body
                }
            ),
            Err(AdapterError::ResponseHeaderDrift(_))
        ));
    }

    #[test]
    fn denial_incompatibility_retry_and_source_failure_remain_distinct() {
        let gate = accepted(&catalogue(false));
        let headers = BTreeMap::new();
        let problem = br#"{"code":"SCOPE_DENIED","message":"scope denied"}"#;
        assert!(matches!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 403,
                    headers: &headers,
                    body: problem
                }
            )
            .unwrap(),
            ReadOutcome::Denied(_)
        ));
        assert!(matches!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 406,
                    headers: &headers,
                    body: problem
                }
            )
            .unwrap(),
            ReadOutcome::Incompatible(_)
        ));
        assert!(matches!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 429,
                    headers: &headers,
                    body: problem
                }
            )
            .unwrap(),
            ReadOutcome::Retryable(_)
        ));
        assert!(matches!(
            gate.parse_response(
                CapabilityId::OrdersList,
                &ResponseInput {
                    http_status: 503,
                    headers: &headers,
                    body: b"not-json"
                }
            )
            .unwrap(),
            ReadOutcome::Unavailable(_)
        ));
    }
}
