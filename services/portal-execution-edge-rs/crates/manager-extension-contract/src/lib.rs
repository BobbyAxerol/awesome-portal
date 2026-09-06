#![forbid(unsafe_code)]

//! Fixed, non-catalogue Manager extension contracts.
//!
//! The normal Manager-v2 catalogue deliberately remains relation-only.  This
//! crate models the four separately owner-published routes used by EDS-11R4
//! and EDS-11R5.  There is no generic URL, relation, cursor, source selector,
//! database authority or browser-facing credential surface here.

use chrono::{DateTime, Utc};
use serde_json::{Map, Value};
use thiserror::Error;

pub const MARKET_CONTEXT_CONTRACT_REVISION: &str =
    "trading-system.portal-execution.market-context.v1";
pub const EVENT_LEDGER_CONTRACT_REVISION: &str = "trading-system.portal-execution.event-ledger.v1";
pub const MARKET_CONTEXT_LATEST_MAXIMUM_RESPONSE_BYTES: usize = 1_048_576;
pub const MARKET_CONTEXT_CANDLES_MAXIMUM_RESPONSE_BYTES: usize = 8_388_608;
pub const EVENT_LEDGER_MAXIMUM_RESPONSE_BYTES: usize = 8_388_608;
pub const EVENT_LEDGER_MAXIMUM_PAGE_ROWS: u16 = 1_000;

const MARKET_SCHEMA_VERSION: &str = "trading-system.portal-execution.market-context-envelope.v1";
const EVENT_SCHEMA_VERSION: &str = "trading-system.portal-execution.event-ledger-envelope.v1";
const MAXIMUM_TOKEN_BYTES: usize = 4_096;
const MAXIMUM_IDENTIFIER_BYTES: usize = 191;

/// One sealed fixed route, including only product-bounded query parameters.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManagerExtensionRequest {
    MarketLatest {
        venue: String,
        instrument: String,
    },
    MarketCandles {
        venue: String,
        instrument: String,
        interval: String,
        from_ms: i64,
        to_ms: i64,
        point_limit: u16,
    },
    EventAnchor {
        resync: bool,
    },
    EventTail {
        lease_token: String,
        cursor: String,
        page_rows: u16,
    },
}

impl ManagerExtensionRequest {
    /// Builds the fixed latest-observation operation.
    pub fn market_latest(
        venue: impl Into<String>,
        instrument: impl Into<String>,
    ) -> Result<Self, ExtensionContractError> {
        let venue = venue.into();
        let instrument = instrument.into();
        validate_market_token(&venue)?;
        validate_market_token(&instrument)?;
        Ok(Self::MarketLatest { venue, instrument })
    }

    /// Builds the fixed bounded OHLCV operation.
    #[allow(clippy::too_many_arguments)]
    pub fn market_candles(
        venue: impl Into<String>,
        instrument: impl Into<String>,
        interval: impl Into<String>,
        from_ms: i64,
        to_ms: i64,
        point_limit: u16,
    ) -> Result<Self, ExtensionContractError> {
        let venue = venue.into();
        let instrument = instrument.into();
        let interval = interval.into();
        validate_market_token(&venue)?;
        validate_market_token(&instrument)?;
        validate_interval(&interval)?;
        if from_ms < 0
            || to_ms <= from_ms
            || to_ms - from_ms > 366_i64 * 24 * 60 * 60 * 1_000
            || point_limit == 0
            || point_limit > 2_000
        {
            return Err(ExtensionContractError::InvalidMarketQuery);
        }
        Ok(Self::MarketCandles {
            venue,
            instrument,
            interval,
            from_ms,
            to_ms,
            point_limit,
        })
    }

    /// Builds the no-backfill event-log anchor request.
    #[must_use]
    pub const fn event_anchor(resync: bool) -> Self {
        Self::EventAnchor { resync }
    }

    /// Builds one opaque, lease-bound event tail request.
    pub fn event_tail(
        lease_token: impl Into<String>,
        cursor: impl Into<String>,
        page_rows: u16,
    ) -> Result<Self, ExtensionContractError> {
        let lease_token = lease_token.into();
        let cursor = cursor.into();
        validate_opaque_token(&lease_token)?;
        validate_opaque_token(&cursor)?;
        if page_rows == 0 || page_rows > EVENT_LEDGER_MAXIMUM_PAGE_ROWS {
            return Err(ExtensionContractError::InvalidEventTailQuery);
        }
        Ok(Self::EventTail {
            lease_token,
            cursor,
            page_rows,
        })
    }

    #[must_use]
    pub fn blueprint(&self) -> ExtensionRequestBlueprint {
        match self {
            Self::MarketLatest { venue, instrument } => ExtensionRequestBlueprint {
                path: "/portal/execution/v2/manager/market/latest",
                query: vec![("venue", venue.clone()), ("instrument", instrument.clone())],
            },
            Self::MarketCandles {
                venue,
                instrument,
                interval,
                from_ms,
                to_ms,
                point_limit,
            } => ExtensionRequestBlueprint {
                path: "/portal/execution/v2/manager/market/candles",
                query: vec![
                    ("venue", venue.clone()),
                    ("instrument", instrument.clone()),
                    ("interval", interval.clone()),
                    ("from_ms", from_ms.to_string()),
                    ("to_ms", to_ms.to_string()),
                    ("point_limit", point_limit.to_string()),
                ],
            },
            Self::EventAnchor { resync } => ExtensionRequestBlueprint {
                path: "/portal/execution/v2/manager/events/anchor",
                query: vec![("resync", resync.to_string())],
            },
            Self::EventTail {
                lease_token,
                cursor,
                page_rows,
            } => ExtensionRequestBlueprint {
                path: "/portal/execution/v2/manager/events/tail",
                query: vec![
                    ("lease_token", lease_token.clone()),
                    ("cursor", cursor.clone()),
                    ("page_rows", page_rows.to_string()),
                ],
            },
        }
    }

    #[must_use]
    pub const fn expected_contract_revision(&self) -> &'static str {
        match self {
            Self::MarketLatest { .. } | Self::MarketCandles { .. } => {
                MARKET_CONTEXT_CONTRACT_REVISION
            }
            Self::EventAnchor { .. } | Self::EventTail { .. } => EVENT_LEDGER_CONTRACT_REVISION,
        }
    }

    #[must_use]
    pub const fn maximum_response_bytes(&self) -> usize {
        match self {
            Self::MarketLatest { .. } => MARKET_CONTEXT_LATEST_MAXIMUM_RESPONSE_BYTES,
            Self::MarketCandles { .. } => MARKET_CONTEXT_CANDLES_MAXIMUM_RESPONSE_BYTES,
            Self::EventAnchor { .. } | Self::EventTail { .. } => {
                EVENT_LEDGER_MAXIMUM_RESPONSE_BYTES
            }
        }
    }
}

/// A generated query blueprint.  It is constructed only by a sealed request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtensionRequestBlueprint {
    path: &'static str,
    query: Vec<(&'static str, String)>,
}

impl ExtensionRequestBlueprint {
    #[must_use]
    pub const fn path(&self) -> &'static str {
        self.path
    }

    #[must_use]
    pub fn query(&self) -> &[(&'static str, String)] {
        &self.query
    }
}

/// A decoded success result.  Market wire bodies can be relayed only to the
/// server-side Portal BFF; event result fields stay inside the Edge worker.
#[derive(Debug, Clone)]
pub enum ManagerExtensionRead {
    Market(MarketContextEnvelope),
    EventAnchor(EventAnchor),
    EventTail(EventTail),
    Unavailable(ManagerExtensionUnavailable),
}

#[derive(Debug, Clone)]
pub struct MarketContextEnvelope {
    wire: Value,
}

impl MarketContextEnvelope {
    #[must_use]
    pub fn wire(&self) -> &Value {
        &self.wire
    }

    #[must_use]
    pub fn into_wire(self) -> Value {
        self.wire
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventAnchor {
    pub source_epoch: String,
    pub lease_epoch: String,
    pub lease_token: String,
    pub cursor: String,
    pub snapshot_as_of_ms: i64,
    pub high_watermark: u64,
    pub retention_floor: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventTail {
    pub source_epoch: String,
    pub lease_epoch: String,
    pub next_cursor: String,
    pub retention_floor: u64,
    pub as_of_ms: i64,
    pub events: Vec<LedgerEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LedgerEvent {
    pub source_sequence: u64,
    pub event_id: String,
    pub entity: String,
    pub entity_id: String,
    pub operation: LedgerOperation,
    pub entity_version: String,
    pub observed_at_ms: i64,
    pub occurred_at_ms: i64,
    pub supersedes_event_id: Option<String>,
    pub record: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LedgerOperation {
    Upsert,
    Delete,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ManagerExtensionUnavailable {
    pub profile_id: String,
    pub reason_code: String,
}

/// Decodes an exact 200 body for the given deployment profile and fixed
/// request.  It rejects unbounded/unknown envelopes before any data reaches a
/// Portal consumer.
pub fn decode_extension_success_for_profile(
    request: &ManagerExtensionRequest,
    body: &[u8],
    expected_profile_id: &str,
) -> Result<ManagerExtensionRead, ExtensionContractError> {
    validate_profile_id(expected_profile_id)?;
    let value: Value =
        serde_json::from_slice(body).map_err(|_| ExtensionContractError::InvalidJson)?;
    let object = object(&value)?;
    let contract_revision = text(object, "contract_revision", 160)?;
    if contract_revision != request.expected_contract_revision()
        || text(object, "authority", 64)? != "EXECUTION_CELL"
        || text(object, "profile_id", 128)? != expected_profile_id
        || text(object, "availability", 32)? != "AVAILABLE"
    {
        return Err(ExtensionContractError::EnvelopeIdentityMismatch);
    }
    let expected_schema = match request {
        ManagerExtensionRequest::MarketLatest { .. }
        | ManagerExtensionRequest::MarketCandles { .. } => MARKET_SCHEMA_VERSION,
        ManagerExtensionRequest::EventAnchor { .. } | ManagerExtensionRequest::EventTail { .. } => {
            EVENT_SCHEMA_VERSION
        }
    };
    if text(object, "schema_version", 160)? != expected_schema
        || !matches!(
            text(object, "freshness", 32)?.as_str(),
            "FRESH" | "AGING" | "DEGRADED" | "STALE"
        )
        || !matches!(
            text(object, "completeness", 32)?.as_str(),
            "COMPLETE" | "PARTIAL" | "POLL_BOUNDED"
        )
        || utc_ms(object.get("as_of_ms"))?.is_negative()
    {
        return Err(ExtensionContractError::EnvelopeIdentityMismatch);
    }
    let data = object_value(object, "data")?;
    match request {
        ManagerExtensionRequest::MarketLatest { .. }
        | ManagerExtensionRequest::MarketCandles { .. } => {
            validate_market_data(request, data)?;
            Ok(ManagerExtensionRead::Market(MarketContextEnvelope {
                wire: value,
            }))
        }
        ManagerExtensionRequest::EventAnchor { .. } => Ok(ManagerExtensionRead::EventAnchor(
            decode_event_anchor(data)?,
        )),
        ManagerExtensionRequest::EventTail { .. } => {
            Ok(ManagerExtensionRead::EventTail(decode_event_tail(data)?))
        }
    }
}

/// Decodes a Manager-style 503 without treating it as a successful empty
/// source response.
pub fn decode_extension_unavailable_for_profile(
    body: &[u8],
    expected_profile_id: &str,
) -> Result<ManagerExtensionUnavailable, ExtensionContractError> {
    validate_profile_id(expected_profile_id)?;
    let value: Value =
        serde_json::from_slice(body).map_err(|_| ExtensionContractError::InvalidJson)?;
    let object = object(&value)?;
    if text(object, "authority", 64)? != "EXECUTION_CELL"
        || text(object, "profile_id", 128)? != expected_profile_id
        || text(object, "availability", 32)? != "UNAVAILABLE"
    {
        return Err(ExtensionContractError::EnvelopeIdentityMismatch);
    }
    let reason_code = text(object, "reason_code", 128)?;
    validate_reason_code(&reason_code)?;
    Ok(ManagerExtensionUnavailable {
        profile_id: expected_profile_id.to_owned(),
        reason_code,
    })
}

fn validate_market_data(
    request: &ManagerExtensionRequest,
    data: &Value,
) -> Result<(), ExtensionContractError> {
    let object = object(data)?;
    let operation_id = text(object, "operation_id", 128)?;
    let expected_operation = match request {
        ManagerExtensionRequest::MarketLatest { .. } => "managerMarketContextLatestV1",
        ManagerExtensionRequest::MarketCandles { .. } => "managerMarketContextCandlesV1",
        _ => return Err(ExtensionContractError::InvalidMarketData),
    };
    if operation_id != expected_operation || contains_forbidden_market_field(data, 0)? {
        return Err(ExtensionContractError::InvalidMarketData);
    }
    let items = array(object_value(object, "items")?)?;
    let maximum = match request {
        ManagerExtensionRequest::MarketLatest { .. } => 200,
        ManagerExtensionRequest::MarketCandles { .. } => 2_000,
        _ => 0,
    };
    if items.len() > maximum {
        return Err(ExtensionContractError::InvalidMarketData);
    }
    Ok(())
}

fn decode_event_anchor(data: &Value) -> Result<EventAnchor, ExtensionContractError> {
    let envelope = object(data)?;
    if text(envelope, "operation_id", 128)? != "managerEventLedgerAnchorV1"
        || text(envelope, "snapshot_semantics", 64)? != "EVENT_LOG_ANCHOR"
    {
        return Err(ExtensionContractError::InvalidEventAnchor);
    }
    let snapshot = object(object_value(envelope, "snapshot")?)?;
    if text(snapshot, "snapshot_semantics", 64)? != "EVENT_LOG_ANCHOR"
        || !array(object_value(snapshot, "records")?)?.is_empty()
    {
        return Err(ExtensionContractError::InvalidEventAnchor);
    }
    let source_epoch = parse_source_epoch(text(envelope, "source_epoch", 160)?)?;
    if source_epoch != parse_source_epoch(text(snapshot, "source_epoch", 160)?)? {
        return Err(ExtensionContractError::InvalidEventAnchor);
    }
    let high_watermark = unsigned(object_value(snapshot, "watermark_sequence")?)?;
    let retention_floor = unsigned(object_value(snapshot, "retention_floor")?)?;
    if retention_floor == 0 || retention_floor > high_watermark.saturating_add(1) {
        return Err(ExtensionContractError::InvalidEventAnchor);
    }
    let snapshot_as_of_ms = timestamp_ms(text(snapshot, "observed_at", 64)?)?;
    let lease_epoch = identifier(text(envelope, "epoch", 160)?)?;
    let lease_token = opaque(text(envelope, "lease_token", MAXIMUM_TOKEN_BYTES)?)?;
    let cursor = opaque(text(envelope, "cursor", MAXIMUM_TOKEN_BYTES)?)?;
    let _lease_expires_at = timestamp_ms(text(envelope, "lease_expires_at", 64)?)?;
    Ok(EventAnchor {
        source_epoch,
        lease_epoch,
        lease_token,
        cursor,
        snapshot_as_of_ms,
        high_watermark,
        retention_floor,
    })
}

fn decode_event_tail(data: &Value) -> Result<EventTail, ExtensionContractError> {
    let envelope = object(data)?;
    if text(envelope, "operation_id", 128)? != "managerEventLedgerTailV1"
        || text(envelope, "snapshot_semantics", 64)? != "EVENT_LOG_ANCHOR"
    {
        return Err(ExtensionContractError::InvalidEventTail);
    }
    let source_epoch = parse_source_epoch(text(envelope, "source_epoch", 160)?)?;
    let lease_epoch = identifier(text(envelope, "epoch", 160)?)?;
    let next_cursor = opaque(text(envelope, "cursor", MAXIMUM_TOKEN_BYTES)?)?;
    let retention_floor = unsigned(object_value(envelope, "retention_floor")?)?;
    if retention_floor == 0 {
        return Err(ExtensionContractError::InvalidEventTail);
    }
    let as_of_ms = timestamp_ms(text(envelope, "as_of", 64)?)?;
    let events = array(object_value(envelope, "events")?)?;
    if events.len() > usize::from(EVENT_LEDGER_MAXIMUM_PAGE_ROWS) {
        return Err(ExtensionContractError::InvalidEventTail);
    }
    let mut result = Vec::with_capacity(events.len());
    let mut previous = None;
    for value in events {
        let event = decode_ledger_event(value)?;
        if previous.is_some_and(|sequence| event.source_sequence != sequence + 1) {
            return Err(ExtensionContractError::EventSequenceGap);
        }
        previous = Some(event.source_sequence);
        result.push(event);
    }
    Ok(EventTail {
        source_epoch,
        lease_epoch,
        next_cursor,
        retention_floor,
        as_of_ms,
        events: result,
    })
}

fn decode_ledger_event(value: &Value) -> Result<LedgerEvent, ExtensionContractError> {
    let event = object(value)?;
    let source_sequence = unsigned(object_value(event, "source_sequence")?)?;
    if source_sequence == 0 {
        return Err(ExtensionContractError::InvalidLedgerEvent);
    }
    let event_id = identifier(text(event, "event_id", 160)?)?;
    let entity = identifier(text(event, "entity", 160)?)?;
    let entity_id = identifier(text(event, "entity_id", 160)?)?;
    let entity_version = identifier(text(event, "entity_version", 160)?)?;
    let operation = match text(event, "operation", 16)?.as_str() {
        "UPSERT" => LedgerOperation::Upsert,
        "DELETE" => LedgerOperation::Delete,
        _ => return Err(ExtensionContractError::InvalidLedgerEvent),
    };
    let record = object_value(event, "record")?.clone();
    if !record.is_object() || contains_forbidden_event_field(&record, 0)? {
        return Err(ExtensionContractError::InvalidLedgerEvent);
    }
    let observed_at_ms = timestamp_ms(text(event, "observed_at", 64)?)?;
    let occurred_at_ms = timestamp_ms(text(object(&record)?, "occurred_at", 64)?)?;
    let supersedes_event_id = event
        .get("supersedes_event_id")
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .ok_or(ExtensionContractError::InvalidLedgerEvent)
                .and_then(identifier)
        })
        .transpose()?;
    match operation {
        LedgerOperation::Upsert if supersedes_event_id.is_some() => {
            return Err(ExtensionContractError::InvalidLedgerEvent);
        }
        LedgerOperation::Delete if supersedes_event_id.is_none() => {
            return Err(ExtensionContractError::InvalidLedgerEvent);
        }
        LedgerOperation::Upsert | LedgerOperation::Delete => {}
    }
    Ok(LedgerEvent {
        source_sequence,
        event_id,
        entity,
        entity_id,
        operation,
        entity_version,
        observed_at_ms,
        occurred_at_ms,
        supersedes_event_id,
        record,
    })
}

fn object(value: &Value) -> Result<&Map<String, Value>, ExtensionContractError> {
    value.as_object().ok_or(ExtensionContractError::InvalidJson)
}

fn object_value<'a>(
    object: &'a Map<String, Value>,
    name: &str,
) -> Result<&'a Value, ExtensionContractError> {
    object.get(name).ok_or(ExtensionContractError::InvalidJson)
}

fn array(value: &Value) -> Result<&[Value], ExtensionContractError> {
    value
        .as_array()
        .map(Vec::as_slice)
        .ok_or(ExtensionContractError::InvalidJson)
}

fn text(
    object: &Map<String, Value>,
    name: &str,
    maximum: usize,
) -> Result<String, ExtensionContractError> {
    let value = object_value(object, name)?
        .as_str()
        .ok_or(ExtensionContractError::InvalidJson)?;
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ExtensionContractError::InvalidJson);
    }
    Ok(value.to_owned())
}

fn unsigned(value: &Value) -> Result<u64, ExtensionContractError> {
    value.as_u64().ok_or(ExtensionContractError::InvalidJson)
}

fn utc_ms(value: Option<&Value>) -> Result<i64, ExtensionContractError> {
    value
        .and_then(Value::as_i64)
        .filter(|value| (0..=8_640_000_000_000_000).contains(value))
        .ok_or(ExtensionContractError::InvalidJson)
}

fn timestamp_ms(value: String) -> Result<i64, ExtensionContractError> {
    if !value.ends_with('Z') || value.len() > 64 {
        return Err(ExtensionContractError::InvalidTimestamp);
    }
    let parsed = DateTime::parse_from_rfc3339(&value)
        .map_err(|_| ExtensionContractError::InvalidTimestamp)?
        .with_timezone(&Utc);
    Ok(parsed.timestamp_millis())
}

fn validate_profile_id(value: &str) -> Result<(), ExtensionContractError> {
    if !(3..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ExtensionContractError::EnvelopeIdentityMismatch);
    }
    Ok(())
}

fn validate_market_token(value: &str) -> Result<(), ExtensionContractError> {
    if value.is_empty()
        || value.len() > MAXIMUM_IDENTIFIER_BYTES
        || !value.bytes().all(|byte| {
            byte.is_ascii_uppercase()
                || byte.is_ascii_digit()
                || matches!(byte, b'.' | b'_' | b':' | b'-')
        })
    {
        return Err(ExtensionContractError::InvalidMarketQuery);
    }
    Ok(())
}

fn validate_interval(value: &str) -> Result<(), ExtensionContractError> {
    if value.is_empty()
        || value.len() > 32
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(ExtensionContractError::InvalidMarketQuery);
    }
    Ok(())
}

fn validate_opaque_token(value: &str) -> Result<(), ExtensionContractError> {
    if value.is_empty()
        || value.len() > MAXIMUM_TOKEN_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(ExtensionContractError::InvalidEventTailQuery);
    }
    Ok(())
}

fn opaque(value: String) -> Result<String, ExtensionContractError> {
    validate_opaque_token(&value)?;
    Ok(value)
}

fn identifier(value: String) -> Result<String, ExtensionContractError> {
    if value.is_empty()
        || value.len() > 160
        || !value.is_ascii()
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
    {
        return Err(ExtensionContractError::InvalidLedgerEvent);
    }
    Ok(value)
}

fn parse_source_epoch(value: String) -> Result<String, ExtensionContractError> {
    identifier(value).map_err(|_| ExtensionContractError::InvalidEventAnchor)
}

fn validate_reason_code(value: &str) -> Result<(), ExtensionContractError> {
    if value.is_empty()
        || value.len() > 128
        || !matches!(value.as_bytes().first(), Some(first) if first.is_ascii_uppercase())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(ExtensionContractError::InvalidUnavailable);
    }
    Ok(())
}

fn contains_forbidden_market_field(
    value: &Value,
    depth: usize,
) -> Result<bool, ExtensionContractError> {
    contains_forbidden_field(
        value,
        depth,
        &[
            "raw",
            "payload",
            "credential",
            "secret",
            "cursor",
            "lease_token",
        ],
    )
}

fn contains_forbidden_event_field(
    value: &Value,
    depth: usize,
) -> Result<bool, ExtensionContractError> {
    contains_forbidden_field(
        value,
        depth,
        &[
            "raw",
            "raw_request",
            "raw_response",
            "credential",
            "secret",
            "payload",
        ],
    )
}

fn contains_forbidden_field(
    value: &Value,
    depth: usize,
    forbidden: &[&str],
) -> Result<bool, ExtensionContractError> {
    if depth > 16 {
        return Err(ExtensionContractError::InvalidJson);
    }
    match value {
        Value::Array(values) => values.iter().try_fold(false, |seen, item| {
            Ok(seen || contains_forbidden_field(item, depth + 1, forbidden)?)
        }),
        Value::Object(values) => values.iter().try_fold(false, |seen, (key, item)| {
            Ok(seen
                || forbidden.contains(&key.as_str())
                || contains_forbidden_field(item, depth + 1, forbidden)?)
        }),
        _ => Ok(false),
    }
}

/// Contract errors deliberately carry no source body, opaque cursor, lease or
/// credential value.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ExtensionContractError {
    #[error("Manager extension request contains an invalid market query")]
    InvalidMarketQuery,
    #[error("Manager extension request contains an invalid event-tail query")]
    InvalidEventTailQuery,
    #[error("Manager extension response is not the fixed JSON contract")]
    InvalidJson,
    #[error("Manager extension envelope identity drifted")]
    EnvelopeIdentityMismatch,
    #[error("Manager extension market payload is invalid or contains a forbidden field")]
    InvalidMarketData,
    #[error("Manager extension event anchor is invalid")]
    InvalidEventAnchor,
    #[error("Manager extension event tail is invalid")]
    InvalidEventTail,
    #[error("Manager extension event is invalid or contains a forbidden field")]
    InvalidLedgerEvent,
    #[error("Manager extension event page has a source sequence gap")]
    EventSequenceGap,
    #[error("Manager extension timestamp is invalid")]
    InvalidTimestamp,
    #[error("Manager extension unavailable response is invalid")]
    InvalidUnavailable,
}

#[cfg(test)]
mod tests;
