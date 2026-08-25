#![forbid(unsafe_code)]

use std::{collections::BTreeSet, fmt};

use chrono::{DateTime, Utc};
use execution_contracts::DecimalString;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use uuid::Uuid;

include!(concat!(env!("OUT_DIR"), "/contract_identity.rs"));

pub const CONTRACT_REVISION: &str = "d4.paper-read.v1";
pub const SCOPE_ID: &str = "PAPER_BINANCE_USDM";
pub const MAXIMUM_PAGE_SIZE: u16 = 1_000;
pub const MAXIMUM_TOKEN_BYTES: usize = 4_096;
pub const MAXIMUM_SNAPSHOT_ROWS: usize = 100_000;

#[derive(Clone, PartialEq, Eq)]
pub struct OpaqueToken(String);

impl OpaqueToken {
    /// Validates an owner-issued opaque snapshot or cursor token.
    ///
    /// # Errors
    ///
    /// Rejects empty, oversized or control-character-bearing tokens.
    pub fn parse(raw: impl Into<String>) -> Result<Self, ContractError> {
        let raw = raw.into();
        if raw.is_empty() || raw.len() > MAXIMUM_TOKEN_BYTES || raw.chars().any(char::is_control) {
            return Err(ContractError::InvalidOpaqueToken);
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for OpaqueToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("OpaqueToken([REDACTED])")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnapshotResource {
    Orders,
    Fills,
    Positions,
}

impl SnapshotResource {
    #[must_use]
    pub const fn path(self) -> &'static str {
        match self {
            Self::Orders => "/v1/orders",
            Self::Fills => "/v1/fills",
            Self::Positions => "/v1/positions",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaperReadRequest {
    BeginSnapshot,
    SnapshotPage {
        resource: SnapshotResource,
        snapshot: OpaqueToken,
        cursor: Option<OpaqueToken>,
        page_size: u16,
    },
    EventsPage {
        cursor: OpaqueToken,
        page_size: u16,
    },
}

impl PaperReadRequest {
    /// Produces one exact GET path/query blueprint. It never carries the source
    /// identity or permits caller-selected scope.
    ///
    /// # Errors
    ///
    /// Rejects page sizes outside the owner-published contract.
    pub fn blueprint(&self) -> Result<RequestBlueprint, ContractError> {
        let (path, query) = match self {
            Self::BeginSnapshot => ("/v1/events", vec![("snapshot", "begin".to_owned())]),
            Self::SnapshotPage {
                resource,
                snapshot,
                cursor,
                page_size,
            } => {
                validate_page_size(*page_size)?;
                let mut query = vec![
                    ("snapshot", snapshot.as_str().to_owned()),
                    ("page_size", page_size.to_string()),
                ];
                if let Some(cursor) = cursor {
                    query.push(("cursor", cursor.as_str().to_owned()));
                }
                (resource.path(), query)
            }
            Self::EventsPage { cursor, page_size } => {
                validate_page_size(*page_size)?;
                (
                    "/v1/events",
                    vec![
                        ("cursor", cursor.as_str().to_owned()),
                        ("page_size", page_size.to_string()),
                    ],
                )
            }
        };
        Ok(RequestBlueprint { path, query })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlueprint {
    pub path: &'static str,
    pub query: Vec<(&'static str, String)>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaperReadPayload {
    SnapshotCreated(SnapshotDescriptor),
    Orders(SnapshotPage<OrderRecord>),
    Fills(SnapshotPage<FillRecord>),
    Positions(SnapshotPage<PositionRecord>),
    Events(EventsPage),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadOutcome {
    Success(PaperReadPayload),
    Failure(SourceFailure),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFailureKind {
    InvalidRequest,
    IdentityRejected,
    CursorAhead,
    ResyncRequired,
    ResponseTooLarge,
    RateLimited,
    SourceUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceFailure {
    pub kind: SourceFailureKind,
    pub http_status: u16,
    pub retry_after_seconds: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotDescriptor {
    pub snapshot: OpaqueToken,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub resource_counts: SnapshotResourceCounts,
    pub event_cursor: OpaqueToken,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotResourceCounts {
    pub orders: usize,
    pub fills: usize,
    pub positions: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotPage<T> {
    pub rows: Vec<T>,
    pub snapshot: OpaqueToken,
    pub next_cursor: Option<OpaqueToken>,
    pub complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventsPage {
    pub events: Vec<StateDeltaEvent>,
    pub next_cursor: OpaqueToken,
    pub complete: bool,
    pub head_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StateDeltaEvent {
    pub event_id: String,
    pub sequence: u64,
    pub resource: SnapshotResource,
    pub operation: DeltaOperation,
    pub entity_id: String,
    pub entity_version: String,
    pub observed_at: DateTime<Utc>,
    pub record: StateDeltaRecord,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StateDeltaRecord {
    Order(OrderRecord),
    Fill(FillRecord),
    Position(PositionRecord),
    Tombstone,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DeltaOperation {
    Upsert,
    Delete,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum OrderSide {
    #[serde(rename = "BUY")]
    Buy,
    #[serde(rename = "SELL")]
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum PositionSide {
    #[serde(rename = "FLAT")]
    Flat,
    #[serde(rename = "LONG")]
    Long,
    #[serde(rename = "SHORT")]
    Short,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum PaperMode {
    #[serde(rename = "paper")]
    Paper,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum BinanceVenue {
    #[serde(rename = "BINANCE")]
    Binance,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrderRecord {
    pub client_order_id: String,
    pub venue_order_id: Option<String>,
    pub strategy_id: String,
    pub account_id: String,
    mode: PaperMode,
    venue: BinanceVenue,
    pub instrument_id: String,
    pub symbol: String,
    pub side: OrderSide,
    pub position_side: String,
    pub order_type: String,
    pub time_in_force: String,
    pub quantity: DecimalString,
    pub price: Option<DecimalString>,
    pub trigger_price: Option<DecimalString>,
    pub status: String,
    pub reduce_only: bool,
    pub post_only: bool,
    pub intent: String,
    pub submitted_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub error_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FillRecord {
    pub fill_id: i64,
    pub event_id: Option<Uuid>,
    pub trade_time: DateTime<Utc>,
    pub trade_id: Option<String>,
    pub client_order_id: String,
    pub venue_order_id: Option<String>,
    pub strategy_id: String,
    pub account_id: String,
    mode: PaperMode,
    venue: BinanceVenue,
    pub instrument_id: String,
    pub side: OrderSide,
    pub price: DecimalString,
    pub quantity: DecimalString,
    pub commission: DecimalString,
    pub commission_currency: Option<String>,
    pub liquidity_side: Option<String>,
    pub realized_pnl: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PositionRecord {
    pub position_id: String,
    pub strategy_id: String,
    pub account_id: String,
    mode: PaperMode,
    venue: BinanceVenue,
    pub instrument_id: String,
    pub side: PositionSide,
    pub signed_qty: DecimalString,
    pub quantity: DecimalString,
    pub avg_px_open: DecimalString,
    pub avg_px_close: DecimalString,
    pub realized_pnl: DecimalString,
    pub unrealized_pnl: DecimalString,
    pub mark_price: Option<DecimalString>,
    pub mark_price_at: Option<DateTime<Utc>>,
    pub notional: DecimalString,
    pub peak_qty: DecimalString,
    pub opened_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

/// Parses a bounded facade response according to the initiating request.
///
/// # Errors
///
/// Fails closed on an unknown status, malformed/expanded schema, contract or
/// scope drift, inconsistent paging, invalid cursor/resync semantics or an
/// event stream that is not strictly ordered and idempotent.
pub fn parse_response(
    request: &PaperReadRequest,
    http_status: u16,
    retry_after_seconds: Option<u64>,
    body: &[u8],
) -> Result<ReadOutcome, ContractError> {
    if http_status == 200 {
        return parse_success(request, body).map(ReadOutcome::Success);
    }
    parse_failure(http_status, retry_after_seconds, body).map(ReadOutcome::Failure)
}

fn parse_success(
    request: &PaperReadRequest,
    body: &[u8],
) -> Result<PaperReadPayload, ContractError> {
    match request {
        PaperReadRequest::BeginSnapshot => parse_snapshot_created(body),
        PaperReadRequest::SnapshotPage {
            resource, snapshot, ..
        } => parse_snapshot_resource(*resource, snapshot, body),
        PaperReadRequest::EventsPage { .. } => parse_events_page(body),
    }
}

fn parse_snapshot_created(body: &[u8]) -> Result<PaperReadPayload, ContractError> {
    let wire: SnapshotCreatedWire = parse_json(body)?;
    validate_envelope(
        &wire.contract_revision,
        wire.status,
        EnvelopeStatus::SnapshotCreated,
        wire.scope_id,
    )?;
    if wire.expires_at <= wire.created_at
        || wire.completeness != SnapshotCompleteness::CompleteWithinFixedScope
        || wire.resync != SnapshotResync::FullBuildingEpochOnSnapshotOrCursorExpiry
    {
        return Err(ContractError::InvalidSnapshotDescriptor);
    }
    let total = wire
        .resource_counts
        .orders
        .saturating_add(wire.resource_counts.fills)
        .saturating_add(wire.resource_counts.positions);
    if total > MAXIMUM_SNAPSHOT_ROWS {
        return Err(ContractError::SnapshotBoundExceeded);
    }
    Ok(PaperReadPayload::SnapshotCreated(SnapshotDescriptor {
        snapshot: OpaqueToken::parse(wire.snapshot)?,
        created_at: wire.created_at,
        expires_at: wire.expires_at,
        resource_counts: wire.resource_counts,
        event_cursor: OpaqueToken::parse(wire.event_cursor)?,
    }))
}

fn parse_snapshot_resource(
    resource: SnapshotResource,
    expected_snapshot: &OpaqueToken,
    body: &[u8],
) -> Result<PaperReadPayload, ContractError> {
    match resource {
        SnapshotResource::Orders => {
            let wire: OrdersPageWire = parse_json(body)?;
            validate_records(&wire.orders)?;
            Ok(PaperReadPayload::Orders(validate_snapshot_page(
                &wire.contract_revision,
                wire.status,
                wire.scope_id,
                wire.orders,
                wire.count,
                wire.snapshot,
                wire.next_cursor,
                wire.complete,
                wire.completeness,
                expected_snapshot,
            )?))
        }
        SnapshotResource::Fills => {
            let wire: FillsPageWire = parse_json(body)?;
            validate_records(&wire.fills)?;
            Ok(PaperReadPayload::Fills(validate_snapshot_page(
                &wire.contract_revision,
                wire.status,
                wire.scope_id,
                wire.fills,
                wire.count,
                wire.snapshot,
                wire.next_cursor,
                wire.complete,
                wire.completeness,
                expected_snapshot,
            )?))
        }
        SnapshotResource::Positions => {
            let wire: PositionsPageWire = parse_json(body)?;
            validate_records(&wire.positions)?;
            Ok(PaperReadPayload::Positions(validate_snapshot_page(
                &wire.contract_revision,
                wire.status,
                wire.scope_id,
                wire.positions,
                wire.count,
                wire.snapshot,
                wire.next_cursor,
                wire.complete,
                wire.completeness,
                expected_snapshot,
            )?))
        }
    }
}

fn parse_events_page(body: &[u8]) -> Result<PaperReadPayload, ContractError> {
    let wire: EventsPageWire = parse_json(body)?;
    validate_envelope(
        &wire.contract_revision,
        wire.status,
        EnvelopeStatus::Ok,
        wire.scope_id,
    )?;
    if wire.count != wire.events.len()
        || wire.count > usize::from(MAXIMUM_PAGE_SIZE)
        || wire.delivery != EventDelivery::IdempotentStateDeltas
        || wire.resync != EventResync::FullBuildingEpochOnCursorEpochOrRetentionExpiry
    {
        return Err(ContractError::InvalidEventPage);
    }
    let events = validate_events(wire.events, wire.head_sequence)?;
    Ok(PaperReadPayload::Events(EventsPage {
        events,
        next_cursor: OpaqueToken::parse(wire.next_cursor)?,
        complete: wire.complete,
        head_sequence: wire.head_sequence,
    }))
}

#[allow(clippy::too_many_arguments)]
fn validate_snapshot_page<T>(
    contract_revision: &str,
    status: EnvelopeStatus,
    scope_id: ScopeId,
    rows: Vec<T>,
    count: usize,
    snapshot: String,
    next_cursor: Option<String>,
    complete: bool,
    completeness: SnapshotCompleteness,
    expected_snapshot: &OpaqueToken,
) -> Result<SnapshotPage<T>, ContractError> {
    validate_envelope(contract_revision, status, EnvelopeStatus::Ok, scope_id)?;
    if count != rows.len() || count > usize::from(MAXIMUM_PAGE_SIZE) {
        return Err(ContractError::InvalidSnapshotPage);
    }
    let snapshot = OpaqueToken::parse(snapshot)?;
    if snapshot != *expected_snapshot {
        return Err(ContractError::SnapshotIdentityMismatch);
    }
    let next_cursor = next_cursor.map(OpaqueToken::parse).transpose()?;
    let coherent = (complete
        && completeness == SnapshotCompleteness::CompleteWithinFixedScope
        && next_cursor.is_none())
        || (!complete
            && completeness == SnapshotCompleteness::PageContinues
            && next_cursor.is_some());
    if !coherent {
        return Err(ContractError::InvalidSnapshotPage);
    }
    Ok(SnapshotPage {
        rows,
        snapshot,
        next_cursor,
        complete,
    })
}

fn validate_events(
    wire_events: Vec<StateDeltaEventWire>,
    head_sequence: u64,
) -> Result<Vec<StateDeltaEvent>, ContractError> {
    let mut previous_sequence = 0_u64;
    let mut event_ids = BTreeSet::new();
    let mut events = Vec::with_capacity(wire_events.len());
    for wire in wire_events {
        if wire.sequence == 0
            || wire.sequence <= previous_sequence
            || wire.sequence > head_sequence
            || !event_ids.insert(wire.event_id.clone())
            || wire.scope_id != ScopeId::PaperBinanceUsdm
            || !is_lower_hex_64(&wire.entity_version)
        {
            return Err(ContractError::InvalidEventSequence);
        }
        validate_text(&wire.event_id)?;
        validate_text(&wire.entity_id)?;
        let record = match (wire.operation, wire.resource, wire.record) {
            (DeltaOperation::Delete, _, Value::Null) => StateDeltaRecord::Tombstone,
            (DeltaOperation::Upsert, SnapshotResource::Orders, value) => {
                let record: OrderRecord =
                    serde_json::from_value(value).map_err(|_| ContractError::InvalidStateDelta)?;
                record.validate()?;
                if record.client_order_id != wire.entity_id {
                    return Err(ContractError::InvalidStateDelta);
                }
                StateDeltaRecord::Order(record)
            }
            (DeltaOperation::Upsert, SnapshotResource::Fills, value) => {
                let record: FillRecord =
                    serde_json::from_value(value).map_err(|_| ContractError::InvalidStateDelta)?;
                record.validate()?;
                if record.fill_id.to_string() != wire.entity_id {
                    return Err(ContractError::InvalidStateDelta);
                }
                StateDeltaRecord::Fill(record)
            }
            (DeltaOperation::Upsert, SnapshotResource::Positions, value) => {
                let record: PositionRecord =
                    serde_json::from_value(value).map_err(|_| ContractError::InvalidStateDelta)?;
                record.validate()?;
                if record.position_id != wire.entity_id {
                    return Err(ContractError::InvalidStateDelta);
                }
                StateDeltaRecord::Position(record)
            }
            _ => return Err(ContractError::InvalidStateDelta),
        };
        previous_sequence = wire.sequence;
        events.push(StateDeltaEvent {
            event_id: wire.event_id,
            sequence: wire.sequence,
            resource: wire.resource,
            operation: wire.operation,
            entity_id: wire.entity_id,
            entity_version: wire.entity_version,
            observed_at: wire.observed_at,
            record,
        });
    }
    Ok(events)
}

fn parse_failure(
    http_status: u16,
    retry_after_seconds: Option<u64>,
    body: &[u8],
) -> Result<SourceFailure, ContractError> {
    let kind = match http_status {
        400 => SourceFailureKind::InvalidRequest,
        401 => SourceFailureKind::IdentityRejected,
        409 => SourceFailureKind::CursorAhead,
        410 => SourceFailureKind::ResyncRequired,
        413 => SourceFailureKind::ResponseTooLarge,
        429 => SourceFailureKind::RateLimited,
        503 => SourceFailureKind::SourceUnavailable,
        _ => return Err(ContractError::UnexpectedHttpStatus(http_status)),
    };
    if http_status == 503 {
        let wire: SourceUnavailableWire = parse_json(body)?;
        if wire.status != "ERROR" || wire.reason != "SOURCE_READ_UNAVAILABLE" {
            return Err(ContractError::InvalidFailureEnvelope);
        }
        if retry_after_seconds.is_none() {
            return Err(ContractError::MissingRetryAfter);
        }
    } else {
        let wire: DeniedWire = parse_json(body)?;
        if wire.status != "DENIED" || wire.reason.trim().is_empty() {
            return Err(ContractError::InvalidFailureEnvelope);
        }
    }
    Ok(SourceFailure {
        kind,
        http_status,
        retry_after_seconds,
    })
}

fn validate_envelope(
    contract_revision: &str,
    status: EnvelopeStatus,
    expected_status: EnvelopeStatus,
    scope_id: ScopeId,
) -> Result<(), ContractError> {
    if contract_revision != CONTRACT_REVISION
        || status != expected_status
        || scope_id != ScopeId::PaperBinanceUsdm
    {
        return Err(ContractError::EnvelopeIdentityMismatch);
    }
    Ok(())
}

fn validate_page_size(page_size: u16) -> Result<(), ContractError> {
    if !(1..=MAXIMUM_PAGE_SIZE).contains(&page_size) {
        return Err(ContractError::InvalidPageSize);
    }
    Ok(())
}

fn validate_text(value: &str) -> Result<(), ContractError> {
    if value.is_empty() || value.trim() != value || value.chars().any(char::is_control) {
        return Err(ContractError::InvalidRecord);
    }
    Ok(())
}

fn is_lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn parse_json<T: for<'de> Deserialize<'de>>(body: &[u8]) -> Result<T, ContractError> {
    serde_json::from_slice(body).map_err(|_| ContractError::InvalidJsonSchema)
}

trait ValidateRecord {
    fn validate(&self) -> Result<(), ContractError>;
}

fn validate_records<T: ValidateRecord>(records: &[T]) -> Result<(), ContractError> {
    records.iter().try_for_each(ValidateRecord::validate)
}

impl ValidateRecord for OrderRecord {
    fn validate(&self) -> Result<(), ContractError> {
        for value in [
            &self.client_order_id,
            &self.strategy_id,
            &self.account_id,
            &self.instrument_id,
            &self.symbol,
            &self.position_side,
            &self.order_type,
            &self.time_in_force,
            &self.status,
            &self.intent,
        ] {
            validate_text(value)?;
        }
        if self.updated_at < self.submitted_at {
            return Err(ContractError::InvalidRecord);
        }
        Ok(())
    }
}

impl ValidateRecord for FillRecord {
    fn validate(&self) -> Result<(), ContractError> {
        for value in [
            &self.client_order_id,
            &self.strategy_id,
            &self.account_id,
            &self.instrument_id,
        ] {
            validate_text(value)?;
        }
        Ok(())
    }
}

impl ValidateRecord for PositionRecord {
    fn validate(&self) -> Result<(), ContractError> {
        for value in [
            &self.position_id,
            &self.strategy_id,
            &self.account_id,
            &self.instrument_id,
        ] {
            validate_text(value)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum EnvelopeStatus {
    #[serde(rename = "OK")]
    Ok,
    #[serde(rename = "SNAPSHOT_CREATED")]
    SnapshotCreated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum ScopeId {
    #[serde(rename = "PAPER_BINANCE_USDM")]
    PaperBinanceUsdm,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum SnapshotCompleteness {
    #[serde(rename = "PAGE_CONTINUES")]
    PageContinues,
    #[serde(rename = "COMPLETE_WITHIN_FIXED_SCOPE")]
    CompleteWithinFixedScope,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum SnapshotResync {
    #[serde(rename = "FULL_BUILDING_EPOCH_ON_SNAPSHOT_OR_CURSOR_EXPIRY")]
    FullBuildingEpochOnSnapshotOrCursorExpiry,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum EventDelivery {
    #[serde(rename = "IDEMPOTENT_STATE_DELTAS")]
    IdempotentStateDeltas,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
enum EventResync {
    #[serde(rename = "FULL_BUILDING_EPOCH_ON_CURSOR_EPOCH_OR_RETENTION_EXPIRY")]
    FullBuildingEpochOnCursorEpochOrRetentionExpiry,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SnapshotCreatedWire {
    contract_revision: String,
    status: EnvelopeStatus,
    scope_id: ScopeId,
    snapshot: String,
    created_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    resource_counts: SnapshotResourceCounts,
    event_cursor: String,
    completeness: SnapshotCompleteness,
    resync: SnapshotResync,
}

macro_rules! snapshot_page_wire {
    ($name:ident, $field:ident, $record:ty) => {
        #[derive(Debug, Deserialize)]
        #[serde(deny_unknown_fields)]
        struct $name {
            contract_revision: String,
            status: EnvelopeStatus,
            scope_id: ScopeId,
            $field: Vec<$record>,
            count: usize,
            snapshot: String,
            next_cursor: Option<String>,
            complete: bool,
            completeness: SnapshotCompleteness,
        }
    };
}

snapshot_page_wire!(OrdersPageWire, orders, OrderRecord);
snapshot_page_wire!(FillsPageWire, fills, FillRecord);
snapshot_page_wire!(PositionsPageWire, positions, PositionRecord);

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EventsPageWire {
    contract_revision: String,
    status: EnvelopeStatus,
    scope_id: ScopeId,
    events: Vec<StateDeltaEventWire>,
    count: usize,
    next_cursor: String,
    complete: bool,
    head_sequence: u64,
    delivery: EventDelivery,
    resync: EventResync,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StateDeltaEventWire {
    event_id: String,
    sequence: u64,
    scope_id: ScopeId,
    resource: SnapshotResource,
    operation: DeltaOperation,
    entity_id: String,
    entity_version: String,
    observed_at: DateTime<Utc>,
    record: Value,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct DeniedWire {
    status: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceUnavailableWire {
    status: String,
    reason: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ContractError {
    #[error("opaque source token is invalid")]
    InvalidOpaqueToken,
    #[error("page size is outside the D4 contract")]
    InvalidPageSize,
    #[error("source response does not match the locked JSON schema")]
    InvalidJsonSchema,
    #[error("source envelope contract, status or scope identity drifted")]
    EnvelopeIdentityMismatch,
    #[error("snapshot descriptor is invalid")]
    InvalidSnapshotDescriptor,
    #[error("snapshot population exceeds the D4 bound")]
    SnapshotBoundExceeded,
    #[error("snapshot page count, cursor or completeness is inconsistent")]
    InvalidSnapshotPage,
    #[error("snapshot page does not echo the requested snapshot")]
    SnapshotIdentityMismatch,
    #[error("event page contract is inconsistent")]
    InvalidEventPage,
    #[error("event sequence, identity or version is invalid")]
    InvalidEventSequence,
    #[error("state delta operation, resource and record disagree")]
    InvalidStateDelta,
    #[error("source record identity or time is invalid")]
    InvalidRecord,
    #[error("source returned unexpected HTTP status {0}")]
    UnexpectedHttpStatus(u16),
    #[error("source failure envelope is invalid")]
    InvalidFailureEnvelope,
    #[error("source unavailable response omitted Retry-After")]
    MissingRetryAfter,
}

#[cfg(test)]
mod tests;
