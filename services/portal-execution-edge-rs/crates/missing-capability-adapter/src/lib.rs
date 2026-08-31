#![forbid(unsafe_code)]

//! N28 authority for genuinely missing capabilities and existing-source
//! alternatives. This crate deliberately has no HTTP client: it validates
//! bounded request blueprints and response bytes without granting network or
//! Trading System mutation authority.

use std::collections::{BTreeMap, BTreeSet};

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;

pub const REGISTRY_REVISION: &str = "portal.execution.missing-capability-registry.v1";
pub const OWNER_REQUEST_REVISION: &str = "portal.execution.trading-system-owner-request.v3";
pub const OWNER_RESPONSE_REVISION: &str =
    "trading-system.portal-execution.missing-capability-publication.v1";

const REGISTRY_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/missing-capability-registry.v1.json"
));
const OWNER_REQUEST_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n28-missing-capability-v1/owner-request.v3.json"
));

const ALTERNATIVE_IDS: [&str; 13] = [
    "market.ticks",
    "market.candles.crypto",
    "market.candles.vnm",
    "venues.calendar",
    "benchmark.series",
    "analytics.cross-profile-drift",
    "event.order-lifecycle",
    "admin.health",
    "admin.inspect",
    "admin.performance",
    "admin.broker-read",
    "admin.portfolio-create",
    "admin.risk-profile",
];

const OWNER_GAPS: [(&str, &str); 9] = [
    ("MC-01", "event.full-incremental"),
    ("MC-02", "artifact.reference"),
    ("MC-03", "execution.broker-ack-timestamps"),
    ("MC-04", "execution.signal-intent-funnel"),
    ("MC-05", "binding.full-exposure-population"),
    ("MC-06", "venue.vnm-order-types"),
    ("MC-07", "admin.sizing-explanation"),
    ("MC-08", "admin.config-plan-apply"),
    ("MC-09", "command.delegated-terminal-policy"),
];

const EXCLUSIONS: [&str; 3] = ["redis-inspect", "testnet-hard-reset", "lab-reset"];

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Registry {
    schema_version: String,
    phase: String,
    decision: String,
    runtime_effect: String,
    source_evidence: BTreeMap<String, String>,
    counts: Counts,
    alternative_adapters: Vec<AdapterRecord>,
    owner_contract_entries: Vec<OwnerGap>,
    intentional_exclusions: Vec<Exclusion>,
    n27_reclassification_candidates: Vec<String>,
    authority: RegistryAuthority,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Counts {
    alternative_adapters: usize,
    owner_contract_entries: usize,
    intentional_exclusions: usize,
    n27_reclassification_candidates: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdapterRecord {
    capability_id: String,
    adapter_revision: String,
    authority: String,
    resolution: String,
    source_operations: Vec<String>,
    profiles: Vec<String>,
    maximum_rows: usize,
    maximum_response_bytes: usize,
    completeness: String,
    activation_state: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnerGap {
    capability_id: String,
    reason_code: String,
    owner_request_id: String,
    typed_unavailable_until_verified: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Exclusion {
    task_id: String,
    reason_code: String,
    owner_request_created: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
struct RegistryAuthority {
    browser_source_access: bool,
    direct_database_access: bool,
    direct_redis_access: bool,
    raw_cli_or_shell: bool,
    source_command_activation: bool,
    source_network_change: bool,
    trading_system_mutation: bool,
    typed_unavailable_retained: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct OwnerRequest {
    schema_version: String,
    request_revision: String,
    phase: String,
    status: String,
    supersedes_request_revision: String,
    registry_revision: String,
    common_contract: CommonContract,
    entries: Vec<OwnerRequestEntry>,
    authority: Value,
    return_pack: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(clippy::struct_excessive_bools)]
struct CommonContract {
    transport: String,
    identity: String,
    read_and_command_identities_distinct: bool,
    browser_direct_access: bool,
    version_header: String,
    additive_compatibility_required: bool,
    maximum_response_bytes: usize,
    maximum_page_rows: usize,
    maximum_concurrency_per_identity: usize,
    automatic_retry: bool,
    portal_activation_on_publication: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct OwnerRequestEntry {
    request_id: String,
    capability_id: String,
    kind: String,
    preferred_operation: String,
    required_schema: String,
    required_fields: Vec<String>,
    bounds: OwnerBounds,
    semantic_requirements: Vec<String>,
    required_fixtures: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(clippy::struct_field_names)]
struct OwnerBounds {
    maximum_page_rows: usize,
    maximum_response_bytes: usize,
    maximum_cursor_bytes: usize,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum N28Error {
    #[error("N28 embedded contract is invalid JSON")]
    InvalidContractJson,
    #[error("N28 contract identity or inventory drifted")]
    ContractDrift,
    #[error("N28 contract widened runtime or source authority")]
    AuthorityWidened,
    #[error("requested source adapter is unknown")]
    UnknownAdapter,
    #[error("request parameter is invalid or outside its published bound")]
    InvalidParameter,
    #[error("source response is malformed or exceeds its published bound")]
    InvalidSourceResponse,
    #[error("owner publication is not accepted or complete")]
    OwnerPublicationPending,
}

/// Validated inventory summary suitable for static release evidence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AuthoritySummary {
    pub schema_version: &'static str,
    pub phase: &'static str,
    pub alternative_adapters: usize,
    pub owner_contract_entries: usize,
    pub intentional_exclusions: usize,
    pub n27_reclassification_candidates: usize,
    pub runtime_effect: &'static str,
}

/// Loads both embedded contracts and proves their inventory, immutable bounds,
/// exact owner-gap pairing and fail-closed authority.
///
/// # Errors
/// Returns [`N28Error`] for any contract or authority drift.
pub fn validate_embedded_authority() -> Result<AuthoritySummary, N28Error> {
    let registry: Registry =
        serde_json::from_str(REGISTRY_JSON).map_err(|_| N28Error::InvalidContractJson)?;
    let request: OwnerRequest =
        serde_json::from_str(OWNER_REQUEST_JSON).map_err(|_| N28Error::InvalidContractJson)?;

    if registry.schema_version != REGISTRY_REVISION
        || registry.phase != "N28"
        || registry.decision != "N28_GENUINE_GAPS_CLASSIFIED_AND_BOUND"
        || registry.runtime_effect != "NONE"
        || registry.source_evidence.len() != 7
        || registry
            .source_evidence
            .values()
            .any(|value| !is_prefixed_sha256(value))
        || registry.counts.alternative_adapters != 13
        || registry.counts.owner_contract_entries != 9
        || registry.counts.intentional_exclusions != 3
        || registry.counts.n27_reclassification_candidates != 5
        || registry.alternative_adapters.len() != 13
        || registry.owner_contract_entries.len() != 9
        || registry.intentional_exclusions.len() != 3
        || registry.n27_reclassification_candidates.len() != 5
    {
        return Err(N28Error::ContractDrift);
    }

    let adapter_ids = unique_set(
        registry
            .alternative_adapters
            .iter()
            .map(|item| item.capability_id.as_str()),
    )?;
    if adapter_ids != string_set(ALTERNATIVE_IDS) {
        return Err(N28Error::ContractDrift);
    }
    for adapter in &registry.alternative_adapters {
        if !adapter.adapter_revision.starts_with("portal.execution.")
            || adapter.adapter_revision.strip_suffix(".v1").is_none()
            || !matches!(
                adapter.authority.as_str(),
                "TRADING_SYSTEM_GATEWAY" | "MARKET_DATA_LAYER" | "PORTAL_PROJECTION"
            )
            || adapter.resolution.is_empty()
            || adapter.source_operations.is_empty()
            || adapter.profiles.is_empty()
            || adapter.maximum_rows == 0
            || adapter.maximum_rows > 5000
            || adapter.maximum_response_bytes == 0
            || adapter.maximum_response_bytes > 8_388_608
            || adapter.completeness.is_empty()
            || adapter.activation_state != "SOURCE_DARK"
        {
            return Err(N28Error::ContractDrift);
        }
    }

    let gap_pairs = registry
        .owner_contract_entries
        .iter()
        .map(|item| (item.owner_request_id.as_str(), item.capability_id.as_str()))
        .collect::<BTreeSet<_>>();
    if gap_pairs != OWNER_GAPS.into_iter().collect()
        || registry.owner_contract_entries.iter().any(|item| {
            !item.typed_unavailable_until_verified || !item.reason_code.starts_with("N28_")
        })
        || unique_set(
            registry
                .intentional_exclusions
                .iter()
                .map(|item| item.task_id.as_str()),
        )? != string_set(EXCLUSIONS)
        || registry.intentional_exclusions.iter().any(|item| {
            item.owner_request_created
                || item.reason_code.is_empty()
                || (item.task_id == "redis-inspect"
                    && item.reason_code != "DIRECT_REDIS_ACCESS_FORBIDDEN")
        })
    {
        return Err(N28Error::ContractDrift);
    }

    if registry.authority.browser_source_access
        || registry.authority.direct_database_access
        || registry.authority.direct_redis_access
        || registry.authority.raw_cli_or_shell
        || registry.authority.source_command_activation
        || registry.authority.source_network_change
        || registry.authority.trading_system_mutation
        || !registry.authority.typed_unavailable_retained
    {
        return Err(N28Error::AuthorityWidened);
    }
    validate_owner_request(&request)?;

    Ok(AuthoritySummary {
        schema_version: REGISTRY_REVISION,
        phase: "N28",
        alternative_adapters: 13,
        owner_contract_entries: 9,
        intentional_exclusions: 3,
        n27_reclassification_candidates: 5,
        runtime_effect: "NONE",
    })
}

fn validate_owner_request(request: &OwnerRequest) -> Result<(), N28Error> {
    let pairs = request
        .entries
        .iter()
        .map(|entry| (entry.request_id.as_str(), entry.capability_id.as_str()))
        .collect::<BTreeSet<_>>();
    if request.schema_version != "portal.execution.missing-capability-owner-request.v1"
        || request.request_revision != OWNER_REQUEST_REVISION
        || request.phase != "N28"
        || request.status != "OWNER_PUBLICATION_PENDING"
        || request.supersedes_request_revision != "portal.execution.trading-system-owner-request.v2"
        || request.registry_revision != REGISTRY_REVISION
        || request.entries.len() != 9
        || pairs != OWNER_GAPS.into_iter().collect()
        || request.common_contract.transport != "TLS_1_3_MTLS"
        || request.common_contract.identity
            != "SHORT_LIVED_DELEGATED_JWT_EXACT_CAPABILITY_RESOURCE_PROFILE"
        || !request.common_contract.read_and_command_identities_distinct
        || request.common_contract.browser_direct_access
        || request.common_contract.version_header != "X-Trading-Contract-Revision"
        || !request.common_contract.additive_compatibility_required
        || request.common_contract.maximum_response_bytes != 8_388_608
        || request.common_contract.maximum_page_rows != 5000
        || request.common_contract.maximum_concurrency_per_identity != 2
        || request.common_contract.automatic_retry
        || request.common_contract.portal_activation_on_publication
        || !request.authority.is_object()
        || !request.return_pack.is_object()
    {
        return Err(N28Error::ContractDrift);
    }
    for entry in &request.entries {
        if !matches!(entry.kind.as_str(), "READ" | "COMMAND")
            || entry.preferred_operation.is_empty()
            || entry.required_schema.is_empty()
            || entry.required_fields.is_empty()
            || entry.semantic_requirements.is_empty()
            || entry.required_fixtures.is_empty()
            || entry.bounds.maximum_page_rows > 5000
            || entry.bounds.maximum_response_bytes > 8_388_608
            || entry.bounds.maximum_cursor_bytes > 4096
        {
            return Err(N28Error::ContractDrift);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
    Post,
    Patch,
}

/// A bounded, relative source request. It carries no authority or credential
/// and cannot dispatch itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlueprint {
    pub adapter_revision: &'static str,
    pub method: HttpMethod,
    pub relative_path_and_query: String,
    pub maximum_rows: usize,
    pub maximum_response_bytes: usize,
    pub completeness: &'static str,
    pub source_dark: bool,
    pub mutation_candidate: bool,
}

/// Builds the latest-tick Gateway request with strict path components.
///
/// # Errors
/// Rejects unsafe or empty identifiers.
pub fn market_tick_request(
    venue: &str,
    symbol: &str,
    product: Option<&str>,
) -> Result<RequestBlueprint, N28Error> {
    let venue = token(venue)?;
    let symbol = token(symbol)?;
    let mut path = format!("/v1/market/latest/{venue}/{symbol}");
    if let Some(product) = product {
        path.push_str("?product=");
        path.push_str(token(product)?);
    }
    Ok(blueprint(
        "portal.execution.gateway-market-tick.v1",
        HttpMethod::Get,
        path,
        1,
        524_288,
        "LATEST_OBSERVATION_ONLY",
        false,
    ))
}

/// Builds a bounded Binance candle request.
///
/// # Errors
/// Rejects unsupported interval/market and windows above 1,500 rows.
pub fn crypto_candles_request(
    symbol: &str,
    interval: &str,
    limit: usize,
    market: &str,
) -> Result<RequestBlueprint, N28Error> {
    let symbol = token(symbol)?;
    if !matches!(
        interval,
        "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d"
    ) || !matches!(market, "spot" | "um" | "cm")
        || !(1..=1500).contains(&limit)
    {
        return Err(N28Error::InvalidParameter);
    }
    Ok(blueprint(
        "portal.execution.data-layer-binance-candles.v1",
        HttpMethod::Get,
        format!("/v1/binance/klines/{symbol}?interval={interval}&limit={limit}&market={market}"),
        limit,
        8_388_608,
        "BOUNDED_PROVIDER_WINDOW",
        false,
    ))
}

/// Builds a bounded VNM preload request. `fresh=false` is not caller
/// configurable, preventing this read adapter from triggering collection.
///
/// # Errors
/// Rejects unsupported intervals and windows above 2,000 rows.
pub fn vnm_candles_request(
    symbol: &str,
    interval: &str,
    limit: usize,
) -> Result<RequestBlueprint, N28Error> {
    let symbol = token(symbol)?;
    if !matches!(interval, "1m" | "5m" | "15m" | "30m" | "1h" | "1d")
        || !(1..=2000).contains(&limit)
    {
        return Err(N28Error::InvalidParameter);
    }
    Ok(blueprint(
        "portal.execution.data-layer-vn-preload-candles.v1",
        HttpMethod::Get,
        format!("/v1/preload/{symbol}?interval={interval}&limit={limit}&fresh=false"),
        limit,
        8_388_608,
        "CANONICAL_PRELOAD_WINDOW",
        false,
    ))
}

#[must_use]
pub fn venue_calendar_request() -> RequestBlueprint {
    blueprint(
        "portal.execution.data-layer-session-calendar.v1",
        HttpMethod::Get,
        "/v1/control/session-calendar".to_owned(),
        8,
        262_144,
        "CURRENT_SESSION_RULES",
        false,
    )
}

#[must_use]
pub fn admin_health_request() -> RequestBlueprint {
    blueprint(
        "portal.execution.gateway-admin-health.v1",
        HttpMethod::Get,
        "/v1/health".to_owned(),
        1,
        262_144,
        "CURRENT_SOURCE_HEALTH",
        false,
    )
}

/// Builds the current partial event source request. It must never be presented
/// as the full-event owner capability.
///
/// # Errors
/// Rejects invalid mode, venue or page bounds.
pub fn order_events_request(
    mode: &str,
    venue: &str,
    limit: usize,
) -> Result<RequestBlueprint, N28Error> {
    if !matches!(mode, "paper" | "sandbox" | "live") || !(1..=5000).contains(&limit) {
        return Err(N28Error::InvalidParameter);
    }
    let venue = token(venue)?;
    Ok(blueprint(
        "portal.execution.gateway-order-events.v1",
        HttpMethod::Get,
        format!("/v1/admin/events?mode={mode}&venue={venue}&limit={limit}"),
        limit,
        8_388_608,
        "ORDER_LIFECYCLE_ONLY_POLL_BOUNDED",
        false,
    ))
}

/// Returns one of the five N27 reclassification candidates as a source-dark
/// bounded route. POST/PATCH entries are plans only and cannot dispatch.
///
/// # Errors
/// Rejects unknown task IDs or unsafe resource identifiers.
pub fn n27_candidate_request(
    task_id: &str,
    resource_id: &str,
) -> Result<RequestBlueprint, N28Error> {
    let id = token(resource_id)?;
    match task_id {
        "inspect" => Ok(blueprint(
            "portal.execution.gateway-alpha-account-inspect.v1",
            HttpMethod::Get,
            format!("/v1/admin/alphas/{id}"),
            1,
            1_048_576,
            "CURRENT_SOURCE_SNAPSHOT",
            false,
        )),
        "performance" => Ok(blueprint(
            "portal.execution.current-performance-query.v1",
            HttpMethod::Get,
            format!("/internal/execution/v1/portfolios/{id}/performance"),
            5000,
            8_388_608,
            "N25_PROJECTION_BACKED",
            false,
        )),
        "broker-read" => Ok(blueprint(
            "portal.execution.gateway-broker-binding-read.v1",
            HttpMethod::Get,
            format!("/v1/admin/broker-bindings/{id}/state"),
            1,
            1_048_576,
            "CURRENT_SOURCE_SNAPSHOT",
            false,
        )),
        "portfolio-create" => Ok(blueprint(
            "portal.execution.gateway-portfolio-create.v1",
            HttpMethod::Post,
            "/v1/admin/portfolios".to_owned(),
            1,
            1_048_576,
            "PRE_DISPATCH_PLAN_ONLY",
            true,
        )),
        "risk-profile" => Ok(blueprint(
            "portal.execution.gateway-alpha-risk-profile.v1",
            HttpMethod::Patch,
            format!("/v1/admin/alphas/{id}/risk"),
            1,
            1_048_576,
            "PRE_DISPATCH_PLAN_AND_VERIFY_REQUIRED",
            true,
        )),
        _ => Err(N28Error::UnknownAdapter),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarketTick {
    pub venue: String,
    pub symbol: String,
    pub product: Option<String>,
    pub canonical_instrument_id: Option<String>,
    pub price: Decimal,
    pub observed_at: Option<String>,
    pub completeness: &'static str,
}

/// Validates and normalizes the current Gateway latest-market envelope.
///
/// # Errors
/// Rejects oversized bytes, identity mismatch or a missing exact price.
pub fn normalize_market_tick(
    bytes: &[u8],
    expected_venue: &str,
    expected_symbol: &str,
) -> Result<MarketTick, N28Error> {
    if bytes.len() > 524_288 {
        return Err(N28Error::InvalidSourceResponse);
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| N28Error::InvalidSourceResponse)?;
    if value.get("status").and_then(Value::as_str) != Some("OK")
        || value.get("venue").and_then(Value::as_str) != Some(expected_venue)
        || value.get("symbol").and_then(Value::as_str) != Some(expected_symbol)
    {
        return Err(N28Error::InvalidSourceResponse);
    }
    let market = value
        .get("market")
        .and_then(Value::as_object)
        .ok_or(N28Error::InvalidSourceResponse)?;
    let price = ["price", "last_price", "close", "p"]
        .into_iter()
        .find_map(|key| market.get(key))
        .ok_or(N28Error::InvalidSourceResponse)
        .and_then(json_decimal)?;
    let observed_at = ["observed_at", "timestamp", "event_time", "updated_at"]
        .into_iter()
        .find_map(|key| market.get(key).and_then(Value::as_str))
        .map(ToOwned::to_owned);
    Ok(MarketTick {
        venue: expected_venue.to_owned(),
        symbol: expected_symbol.to_owned(),
        product: value
            .get("product")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        canonical_instrument_id: value
            .get("canonical_instrument_id")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        price,
        observed_at,
        completeness: "LATEST_OBSERVATION_ONLY",
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VenueSession {
    pub name: String,
    pub open: String,
    pub close: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VenueCalendar {
    pub venue: String,
    pub timezone: String,
    pub date: Option<String>,
    pub is_open: bool,
    pub sessions: Vec<VenueSession>,
}

/// Normalizes the current Market Data Layer calendar for VN equities or
/// continuous crypto. It is current-rules authority, not a future holiday
/// calendar.
///
/// # Errors
/// Rejects unknown venue keys, oversized responses or malformed sessions.
pub fn normalize_venue_calendar(bytes: &[u8], venue: &str) -> Result<VenueCalendar, N28Error> {
    if bytes.len() > 262_144 || !matches!(venue, "vn_stock" | "crypto") {
        return Err(N28Error::InvalidSourceResponse);
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| N28Error::InvalidSourceResponse)?;
    let calendar = value.get(venue).ok_or(N28Error::InvalidSourceResponse)?;
    let timezone = required_string(calendar, "timezone")?;
    let is_open = calendar
        .get("is_open")
        .and_then(Value::as_bool)
        .ok_or(N28Error::InvalidSourceResponse)?;
    let raw_sessions = calendar
        .get("sessions")
        .and_then(Value::as_array)
        .ok_or(N28Error::InvalidSourceResponse)?;
    if raw_sessions.len() > 8 {
        return Err(N28Error::InvalidSourceResponse);
    }
    let sessions = raw_sessions
        .iter()
        .map(|session| {
            Ok(VenueSession {
                name: required_string(session, "name")?.to_owned(),
                open: required_string(session, "open")?.to_owned(),
                close: required_string(session, "close")?.to_owned(),
            })
        })
        .collect::<Result<Vec<_>, N28Error>>()?;
    Ok(VenueCalendar {
        venue: venue.to_owned(),
        timezone: timezone.to_owned(),
        date: calendar
            .get("date")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        is_open,
        sessions,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OrderLifecyclePage {
    pub count: usize,
    pub event_ids: Vec<String>,
    pub completeness: &'static str,
}

/// Validates the bounded current Gateway order-lifecycle event page while
/// explicitly retaining its partial completeness.
///
/// # Errors
/// Rejects count mismatch, missing stable identity or rows above the request.
pub fn normalize_order_lifecycle_events(
    bytes: &[u8],
    requested_limit: usize,
) -> Result<OrderLifecyclePage, N28Error> {
    if bytes.len() > 8_388_608 || !(1..=5000).contains(&requested_limit) {
        return Err(N28Error::InvalidSourceResponse);
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| N28Error::InvalidSourceResponse)?;
    if value.get("status").and_then(Value::as_str) != Some("OK") {
        return Err(N28Error::InvalidSourceResponse);
    }
    let events = value
        .get("events")
        .and_then(Value::as_array)
        .ok_or(N28Error::InvalidSourceResponse)?;
    let count = value
        .get("count")
        .and_then(Value::as_u64)
        .and_then(|count| usize::try_from(count).ok())
        .ok_or(N28Error::InvalidSourceResponse)?;
    if count != events.len() || count > requested_limit {
        return Err(N28Error::InvalidSourceResponse);
    }
    let event_ids = events
        .iter()
        .map(|event| required_string(event, "event_id").map(ToOwned::to_owned))
        .collect::<Result<Vec<_>, N28Error>>()?;
    if event_ids.iter().collect::<BTreeSet<_>>().len() != event_ids.len() {
        return Err(N28Error::InvalidSourceResponse);
    }
    Ok(OrderLifecyclePage {
        count,
        event_ids,
        completeness: "ORDER_LIFECYCLE_ONLY_POLL_BOUNDED",
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Candle {
    pub time_ms: i64,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    pub volume: Decimal,
}

/// Normalizes either the bounded Binance array envelope or the VNM object
/// envelope into exact-decimal candles.
///
/// # Errors
/// Rejects malformed values, duplicate/non-monotonic timestamps or bounds.
pub fn normalize_candles(
    adapter_revision: &str,
    bytes: &[u8],
    maximum_rows: usize,
) -> Result<Vec<Candle>, N28Error> {
    if bytes.len() > 8_388_608 || maximum_rows == 0 || maximum_rows > 2000 {
        return Err(N28Error::InvalidSourceResponse);
    }
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| N28Error::InvalidSourceResponse)?;
    let rows = value
        .get("data")
        .and_then(Value::as_array)
        .ok_or(N28Error::InvalidSourceResponse)?;
    if rows.len() > maximum_rows {
        return Err(N28Error::InvalidSourceResponse);
    }
    let mut candles = Vec::with_capacity(rows.len());
    for row in rows {
        let candle = match adapter_revision {
            "portal.execution.data-layer-binance-candles.v1" => parse_binance_candle(row)?,
            "portal.execution.data-layer-vn-preload-candles.v1" => parse_vnm_candle(row)?,
            _ => return Err(N28Error::UnknownAdapter),
        };
        if candles
            .last()
            .is_some_and(|previous: &Candle| previous.time_ms >= candle.time_ms)
        {
            return Err(N28Error::InvalidSourceResponse);
        }
        candles.push(candle);
    }
    Ok(candles)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProfileDriftPoint {
    pub time_ms: i64,
    pub paper: Decimal,
    pub live: Decimal,
    pub relative_delta: Decimal,
}

/// Calculates exact cross-profile drift over timestamp intersection only.
/// `relative_delta=(live-paper)/abs(paper)`; zero paper values are omitted.
///
/// # Errors
/// Rejects series larger than the N28 bound or duplicate timestamps.
pub fn cross_profile_drift(
    paper: &[(i64, Decimal)],
    live: &[(i64, Decimal)],
) -> Result<Vec<ProfileDriftPoint>, N28Error> {
    if paper.len() > 5000 || live.len() > 5000 {
        return Err(N28Error::InvalidParameter);
    }
    let paper_map = exact_series(paper)?;
    let live_map = exact_series(live)?;
    Ok(paper_map
        .into_iter()
        .filter_map(|(time_ms, paper_value)| {
            let live_value = live_map.get(&time_ms)?;
            if paper_value.is_zero() {
                return None;
            }
            Some(ProfileDriftPoint {
                time_ms,
                paper: paper_value,
                live: *live_value,
                relative_delta: (*live_value - paper_value) / paper_value.abs(),
            })
        })
        .collect())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnerResponse {
    schema_version: String,
    request_revision: String,
    source_commit: String,
    source_image_digest: String,
    owner_id: String,
    owner_accepted: bool,
    entries: Vec<OwnerResponseEntry>,
    authority: OwnerResponseAuthority,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct OwnerResponseEntry {
    request_id: String,
    capability_id: String,
    state: String,
    contract_revision: Option<String>,
    schema_sha256: Option<String>,
    fixture_index_sha256: Option<String>,
    acceptance_sha256: Option<String>,
    portal_activation: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)]
struct OwnerResponseAuthority {
    contains_credentials: bool,
    contains_business_rows: bool,
    contains_raw_sql: bool,
    portal_database_or_redis_authority: bool,
    portal_cli_or_broker_authority: bool,
    runtime_flags_changed: bool,
}

/// Verifies a complete owner publication. Publication is evidence only and
/// every row must remain `portal_activation=false`; N29 owns activation.
///
/// # Errors
/// Returns pending for the supplied pending template and any partial response.
pub fn verify_owner_publication(bytes: &[u8]) -> Result<(), N28Error> {
    let response: OwnerResponse =
        serde_json::from_slice(bytes).map_err(|_| N28Error::InvalidContractJson)?;
    let pairs = response
        .entries
        .iter()
        .map(|entry| (entry.request_id.as_str(), entry.capability_id.as_str()))
        .collect::<BTreeSet<_>>();
    if response.schema_version != OWNER_RESPONSE_REVISION
        || response.request_revision != OWNER_REQUEST_REVISION
        || !response.owner_accepted
        || response.owner_id.is_empty()
        || !is_git_sha(&response.source_commit)
        || response.source_commit.chars().all(|value| value == '0')
        || !is_prefixed_sha256(&response.source_image_digest)
        || response.source_image_digest.ends_with(&"0".repeat(64))
        || response.entries.len() != 9
        || pairs != OWNER_GAPS.into_iter().collect()
        || response.entries.iter().any(|entry| {
            entry.state != "PUBLISHED"
                || entry.portal_activation
                || entry.contract_revision.as_deref().is_none_or(str::is_empty)
                || entry
                    .schema_sha256
                    .as_deref()
                    .is_none_or(|value| !is_prefixed_sha256(value))
                || entry
                    .fixture_index_sha256
                    .as_deref()
                    .is_none_or(|value| !is_prefixed_sha256(value))
                || entry
                    .acceptance_sha256
                    .as_deref()
                    .is_none_or(|value| !is_prefixed_sha256(value))
        })
        || response.authority.contains_credentials
        || response.authority.contains_business_rows
        || response.authority.contains_raw_sql
        || response.authority.portal_database_or_redis_authority
        || response.authority.portal_cli_or_broker_authority
        || response.authority.runtime_flags_changed
    {
        return Err(N28Error::OwnerPublicationPending);
    }
    Ok(())
}

fn blueprint(
    adapter_revision: &'static str,
    method: HttpMethod,
    relative_path_and_query: String,
    maximum_rows: usize,
    maximum_response_bytes: usize,
    completeness: &'static str,
    mutation_candidate: bool,
) -> RequestBlueprint {
    RequestBlueprint {
        adapter_revision,
        method,
        relative_path_and_query,
        maximum_rows,
        maximum_response_bytes,
        completeness,
        source_dark: true,
        mutation_candidate,
    }
}

fn token(value: &str) -> Result<&str, N28Error> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
    {
        return Err(N28Error::InvalidParameter);
    }
    Ok(value)
}

fn parse_binance_candle(value: &Value) -> Result<Candle, N28Error> {
    let values = value.as_array().ok_or(N28Error::InvalidSourceResponse)?;
    if values.len() < 6 {
        return Err(N28Error::InvalidSourceResponse);
    }
    Ok(Candle {
        time_ms: json_i64(&values[0])?,
        open: json_decimal(&values[1])?,
        high: json_decimal(&values[2])?,
        low: json_decimal(&values[3])?,
        close: json_decimal(&values[4])?,
        volume: json_decimal(&values[5])?,
    })
}

fn parse_vnm_candle(value: &Value) -> Result<Candle, N28Error> {
    Ok(Candle {
        time_ms: json_i64(value.get("time").ok_or(N28Error::InvalidSourceResponse)?)?,
        open: json_decimal(value.get("open").ok_or(N28Error::InvalidSourceResponse)?)?,
        high: json_decimal(value.get("high").ok_or(N28Error::InvalidSourceResponse)?)?,
        low: json_decimal(value.get("low").ok_or(N28Error::InvalidSourceResponse)?)?,
        close: json_decimal(value.get("close").ok_or(N28Error::InvalidSourceResponse)?)?,
        volume: json_decimal(value.get("volume").ok_or(N28Error::InvalidSourceResponse)?)?,
    })
}

fn json_i64(value: &Value) -> Result<i64, N28Error> {
    value
        .as_i64()
        .or_else(|| value.as_str()?.parse().ok())
        .ok_or(N28Error::InvalidSourceResponse)
}

fn json_decimal(value: &Value) -> Result<Decimal, N28Error> {
    value
        .as_str()
        .map(str::parse)
        .or_else(|| value.as_number().map(|number| number.to_string().parse()))
        .transpose()
        .map_err(|_| N28Error::InvalidSourceResponse)?
        .ok_or(N28Error::InvalidSourceResponse)
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, N28Error> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or(N28Error::InvalidSourceResponse)
}

fn exact_series(values: &[(i64, Decimal)]) -> Result<BTreeMap<i64, Decimal>, N28Error> {
    let mut map = BTreeMap::new();
    for (timestamp, value) in values {
        if map.insert(*timestamp, *value).is_some() {
            return Err(N28Error::InvalidParameter);
        }
    }
    Ok(map)
}

fn unique_set<'a>(values: impl Iterator<Item = &'a str>) -> Result<BTreeSet<&'a str>, N28Error> {
    let mut result = BTreeSet::new();
    for value in values {
        if value.is_empty() || !result.insert(value) {
            return Err(N28Error::ContractDrift);
        }
    }
    Ok(result)
}

fn string_set<const N: usize>(values: [&'static str; N]) -> BTreeSet<&'static str> {
    values.into_iter().collect()
}

fn is_git_sha(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_prefixed_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[must_use]
pub fn embedded_contract_sha256() -> String {
    format!("{:x}", Sha256::digest(REGISTRY_JSON.as_bytes()))
}

#[cfg(test)]
mod tests;
