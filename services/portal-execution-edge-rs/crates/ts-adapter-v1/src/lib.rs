#![forbid(unsafe_code)]

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, ExternalVocabularyValue, OrderFact, SourceAuthority};
use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;
use ts_contract_v1::{
    classify_python_enum, VocabularyMatch, WireCapabilities, WireContracts, WireEvent, WireFill,
    WireHealth, WireOrder, WirePosition, WireRejected, WireUnsupportedRevision, API_VERSION,
    API_VERSION_HEADER, CONTRACT_REVISION, CONTRACT_REVISION_HEADER, SCHEMA_VERSION,
    SCHEMA_VERSION_HEADER,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HttpMethod {
    Get,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ReadFilters {
    pub mode: Option<String>,
    pub venue: Option<String>,
    pub symbol: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReadOperation {
    Contracts,
    Health,
    Capabilities,
    Orders {
        alpha_id: String,
        filters: ReadFilters,
        limit: u16,
    },
    Fills {
        alpha_id: String,
        filters: ReadFilters,
        limit: u16,
    },
    Positions {
        alpha_id: String,
        filters: ReadFilters,
        include_flat: bool,
        limit: u16,
    },
    Events {
        alpha_id: String,
        from: Option<String>,
        to: Option<String>,
        limit: u16,
    },
}

impl ReadOperation {
    #[must_use]
    pub const fn label(&self) -> &'static str {
        match self {
            Self::Contracts => "contracts",
            Self::Health => "health",
            Self::Capabilities => "capabilities",
            Self::Orders { .. } => "orders",
            Self::Fills { .. } => "fills",
            Self::Positions { .. } => "positions",
            Self::Events { .. } => "events",
        }
    }

    #[must_use]
    pub fn alpha_id(&self) -> Option<&str> {
        match self {
            Self::Orders { alpha_id, .. }
            | Self::Fills { alpha_id, .. }
            | Self::Positions { alpha_id, .. }
            | Self::Events { alpha_id, .. } => Some(alpha_id),
            Self::Contracts | Self::Health | Self::Capabilities => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestBlueprint {
    pub method: HttpMethod,
    pub path: &'static str,
    pub query: Vec<(String, String)>,
    pub headers: BTreeMap<String, String>,
}

/// Produces only proven read routes. EX-BE-01 exposes no arbitrary path or method.
///
/// # Errors
///
/// Returns an error when an alpha scope is missing or a source endpoint limit
/// exceeds the range proven by the immutable contract pack.
pub fn request_blueprint(operation: &ReadOperation) -> Result<RequestBlueprint, AdapterError> {
    validate_operation(operation)?;
    let mut query = Vec::new();
    let path = match operation {
        ReadOperation::Contracts => "/v1/contracts",
        ReadOperation::Health => "/v1/health",
        ReadOperation::Capabilities => "/v1/health/capabilities",
        ReadOperation::Orders {
            alpha_id,
            filters,
            limit,
        } => {
            query.push(("alpha_id".to_owned(), alpha_id.clone()));
            append_filters(&mut query, filters);
            query.push(("limit".to_owned(), limit.to_string()));
            "/v1/orders"
        }
        ReadOperation::Fills {
            alpha_id,
            filters,
            limit,
        } => {
            query.push(("alpha_id".to_owned(), alpha_id.clone()));
            append_filters(&mut query, filters);
            query.push(("limit".to_owned(), limit.to_string()));
            "/v1/fills"
        }
        ReadOperation::Positions {
            alpha_id,
            filters,
            include_flat,
            limit,
        } => {
            query.push(("alpha_id".to_owned(), alpha_id.clone()));
            append_filters(&mut query, filters);
            query.push(("include_flat".to_owned(), include_flat.to_string()));
            query.push(("limit".to_owned(), limit.to_string()));
            "/v1/positions"
        }
        ReadOperation::Events {
            alpha_id,
            from,
            to,
            limit,
        } => {
            query.push(("alpha_id".to_owned(), alpha_id.clone()));
            if let Some(from) = from {
                query.push(("from".to_owned(), from.clone()));
            }
            if let Some(to) = to {
                query.push(("to".to_owned(), to.clone()));
            }
            query.push(("limit".to_owned(), limit.to_string()));
            "/v1/events"
        }
    };
    Ok(RequestBlueprint {
        method: HttpMethod::Get,
        path,
        query,
        headers: BTreeMap::from([(
            "X-Trading-Contract-Revision".to_owned(),
            CONTRACT_REVISION.to_owned(),
        )]),
    })
}

fn validate_operation(operation: &ReadOperation) -> Result<(), AdapterError> {
    if operation
        .alpha_id()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err(AdapterError::MissingAlphaScope);
    }
    let (limit, maximum) = match operation {
        ReadOperation::Orders { limit, .. } | ReadOperation::Fills { limit, .. } => {
            (Some(*limit), 1_000)
        }
        ReadOperation::Positions { limit, .. } => (Some(*limit), 500),
        ReadOperation::Events { limit, .. } => (Some(*limit), 5_000),
        ReadOperation::Contracts | ReadOperation::Health | ReadOperation::Capabilities => (None, 0),
    };
    if limit.is_some_and(|value| value == 0 || value > maximum) {
        return Err(AdapterError::InvalidLimit { maximum });
    }
    Ok(())
}

fn append_filters(query: &mut Vec<(String, String)>, filters: &ReadFilters) {
    for (name, value) in [
        ("mode", filters.mode.as_ref()),
        ("venue", filters.venue.as_ref()),
        ("symbol", filters.symbol.as_ref()),
    ] {
        if let Some(value) = value {
            query.push((name.to_owned(), value.clone()));
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum AdapterPayload {
    Contracts(WireContracts),
    Health(WireHealth),
    Capabilities(WireCapabilities),
    Orders { count: i64, rows: Vec<WireOrder> },
    Fills { count: i64, rows: Vec<WireFill> },
    Positions { count: i64, rows: Vec<WirePosition> },
    Events { count: i64, rows: Vec<WireEvent> },
}

#[derive(Debug, Clone, PartialEq)]
pub enum ReadOutcome {
    Success(AdapterPayload),
    Denied {
        reason: String,
    },
    Retryable {
        reason: String,
        retry_after_seconds: Option<u64>,
    },
    Unavailable {
        http_status: u16,
    },
    Incompatible {
        requested_revision: String,
        supported_revisions: Vec<String>,
        authoritative_revision: String,
    },
}

#[derive(Debug, Clone)]
pub struct ResponseInput<'a> {
    pub http_status: u16,
    pub headers: &'a BTreeMap<String, String>,
    pub body: &'a [u8],
}

/// Normalizes a Trading System v1 response without hiding contract failures.
///
/// # Errors
///
/// Returns an error for malformed typed bodies, absent/mismatched success
/// headers, missing denial reason codes, or an unrecognized HTTP status.
pub fn parse_read_response(
    operation: &ReadOperation,
    response: &ResponseInput<'_>,
) -> Result<ReadOutcome, AdapterError> {
    match response.http_status {
        200 => {
            validate_success_headers(response.headers)?;
            let payload = match operation {
                ReadOperation::Contracts => AdapterPayload::Contracts(parse_json(response.body)?),
                ReadOperation::Health => AdapterPayload::Health(parse_json(response.body)?),
                ReadOperation::Capabilities => {
                    AdapterPayload::Capabilities(parse_json(response.body)?)
                }
                ReadOperation::Orders { .. } => {
                    let envelope: OrdersEnvelope = parse_json(response.body)?;
                    AdapterPayload::Orders {
                        count: envelope.count,
                        rows: envelope.orders,
                    }
                }
                ReadOperation::Fills { .. } => {
                    let envelope: FillsEnvelope = parse_json(response.body)?;
                    AdapterPayload::Fills {
                        count: envelope.count,
                        rows: envelope.fills,
                    }
                }
                ReadOperation::Positions { .. } => {
                    let envelope: PositionsEnvelope = parse_json(response.body)?;
                    AdapterPayload::Positions {
                        count: envelope.count,
                        rows: envelope.positions,
                    }
                }
                ReadOperation::Events { .. } => {
                    let envelope: EventsEnvelope = parse_json(response.body)?;
                    AdapterPayload::Events {
                        count: envelope.count,
                        rows: envelope.events,
                    }
                }
            };
            Ok(ReadOutcome::Success(payload))
        }
        406 => {
            let error: WireUnsupportedRevision = parse_json(response.body)?;
            Ok(ReadOutcome::Incompatible {
                requested_revision: error.requested_revision,
                supported_revisions: error.supported_revisions,
                authoritative_revision: error.authoritative_revision,
            })
        }
        403 => {
            let error: WireRejected = parse_json(response.body)?;
            let reason = error.reason.ok_or(AdapterError::MissingReasonCode)?;
            Ok(ReadOutcome::Denied { reason })
        }
        429 => {
            let error: WireRejected = parse_json(response.body)?;
            Ok(ReadOutcome::Retryable {
                reason: error
                    .reason
                    .unwrap_or_else(|| "UPSTREAM_RATE_LIMIT".to_owned()),
                retry_after_seconds: error.retry_after_seconds,
            })
        }
        500..=599 => Ok(ReadOutcome::Unavailable {
            http_status: response.http_status,
        }),
        status => Err(AdapterError::UnexpectedHttpStatus(status)),
    }
}

fn parse_json<'a, T: Deserialize<'a>>(body: &'a [u8]) -> Result<T, AdapterError> {
    serde_json::from_slice(body).map_err(|_| AdapterError::MalformedJson)
}

fn validate_success_headers(headers: &BTreeMap<String, String>) -> Result<(), AdapterError> {
    for (name, expected) in [
        (API_VERSION_HEADER, API_VERSION),
        (CONTRACT_REVISION_HEADER, CONTRACT_REVISION),
        (SCHEMA_VERSION_HEADER, SCHEMA_VERSION),
    ] {
        let actual = headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str());
        if actual != Some(expected) {
            return Err(AdapterError::ContractHeaderMismatch {
                header: name,
                expected,
            });
        }
    }
    Ok(())
}

/// Maps one v1 order into the Portal canonical execution fact.
///
/// # Errors
///
/// Returns an error when a canonical identifier or RFC 3339 timestamp is
/// invalid. Unknown enum tokens are preserved as unsupported values instead.
pub fn map_order(wire: WireOrder, scoped_alpha_id: &str) -> Result<OrderFact, AdapterError> {
    let alpha_id = wire
        .strategy_id
        .as_deref()
        .unwrap_or(scoped_alpha_id)
        .to_owned();
    Ok(OrderFact {
        client_order_id: CanonicalId::parse(wire.client_order_id)?,
        venue_order_id: wire.venue_order_id,
        alpha_id: CanonicalId::parse(alpha_id)?,
        symbol: wire.symbol,
        side: external_value("OrderSide", wire.side),
        order_type: external_value("OrderType", wire.order_type),
        quantity: wire.quantity,
        price: wire.price,
        filled_quantity: wire.filled_quantity,
        status: external_value("OrderStatus", wire.status),
        mode: external_value("TradingMode", wire.mode),
        venue: wire.venue,
        created_at: parse_optional_timestamp(wire.created_at)?,
        updated_at: parse_optional_timestamp(wire.updated_at)?,
    })
}

fn external_value(vocabulary: &str, raw: String) -> ExternalVocabularyValue {
    let supported = matches!(
        classify_python_enum(vocabulary, &raw),
        VocabularyMatch::Known(_)
    );
    ExternalVocabularyValue {
        vocabulary: vocabulary.to_owned(),
        raw,
        supported,
    }
}

fn parse_optional_timestamp(raw: Option<String>) -> Result<Option<DateTime<Utc>>, AdapterError> {
    raw.map(|value| {
        DateTime::parse_from_rfc3339(&value)
            .map(|timestamp| timestamp.with_timezone(&Utc))
            .map_err(|_| AdapterError::InvalidTimestamp)
    })
    .transpose()
}

#[must_use]
pub const fn source_authority() -> SourceAuthority {
    SourceAuthority::Execution
}

#[derive(Debug, Deserialize)]
struct OrdersEnvelope {
    #[allow(dead_code)]
    status: String,
    count: i64,
    orders: Vec<WireOrder>,
    #[serde(flatten)]
    _extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
struct FillsEnvelope {
    #[allow(dead_code)]
    status: String,
    count: i64,
    fills: Vec<WireFill>,
    #[serde(flatten)]
    _extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
struct PositionsEnvelope {
    #[allow(dead_code)]
    status: String,
    count: i64,
    positions: Vec<WirePosition>,
    #[serde(flatten)]
    _extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
struct EventsEnvelope {
    #[allow(dead_code)]
    status: String,
    count: i64,
    events: Vec<WireEvent>,
    #[serde(flatten)]
    _extra: BTreeMap<String, Value>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AdapterError {
    #[error("alpha-scoped Trading System read requires a non-empty alpha_id")]
    MissingAlphaScope,
    #[error("read limit is outside the proven endpoint range (maximum {maximum})")]
    InvalidLimit { maximum: u16 },
    #[error("successful response has incompatible {header}; expected {expected}")]
    ContractHeaderMismatch {
        header: &'static str,
        expected: &'static str,
    },
    #[error("upstream response is not valid for the selected v1 wire contract")]
    MalformedJson,
    #[error("upstream denial omitted its reason code")]
    MissingReasonCode,
    #[error("unexpected upstream HTTP status {0}")]
    UnexpectedHttpStatus(u16),
    #[error("wire timestamp is not RFC 3339")]
    InvalidTimestamp,
    #[error(transparent)]
    CanonicalContract(#[from] execution_contracts::ContractError),
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORDERS: &[u8] = include_bytes!("../../../fixtures/orders.v1.json");
    const UNKNOWN_ORDER: &[u8] = include_bytes!("../../../fixtures/orders.unknown-status.v1.json");
    const CONTRACTS: &[u8] = include_bytes!("../../../fixtures/contracts.v1.json");
    const HEALTH: &[u8] = include_bytes!("../../../fixtures/health.v1.json");
    const CAPABILITIES: &[u8] = include_bytes!("../../../fixtures/capabilities.v1.json");
    const FILLS: &[u8] = include_bytes!("../../../fixtures/fills.v1.json");
    const POSITIONS: &[u8] = include_bytes!("../../../fixtures/positions.v1.json");
    const EVENTS: &[u8] = include_bytes!("../../../fixtures/events.v1.json");
    const UNSUPPORTED: &[u8] = include_bytes!("../../../fixtures/unsupported-revision.v1.json");
    const DENIED: &[u8] = include_bytes!("../../../fixtures/denied.v1.json");
    const NON_JSON_500: &[u8] = include_bytes!("../../../fixtures/non-json-500.txt");

    fn v1_headers() -> BTreeMap<String, String> {
        BTreeMap::from([
            (API_VERSION_HEADER.to_owned(), API_VERSION.to_owned()),
            (
                CONTRACT_REVISION_HEADER.to_owned(),
                CONTRACT_REVISION.to_owned(),
            ),
            (SCHEMA_VERSION_HEADER.to_owned(), SCHEMA_VERSION.to_owned()),
        ])
    }

    fn orders_operation() -> ReadOperation {
        ReadOperation::Orders {
            alpha_id: "alpha-paper-1".to_owned(),
            filters: ReadFilters::default(),
            limit: 100,
        }
    }

    #[test]
    fn every_blueprint_is_get_only_and_revision_pinned() {
        let operations = [
            ReadOperation::Contracts,
            ReadOperation::Health,
            ReadOperation::Capabilities,
            orders_operation(),
            ReadOperation::Fills {
                alpha_id: "a".to_owned(),
                filters: ReadFilters::default(),
                limit: 100,
            },
            ReadOperation::Positions {
                alpha_id: "a".to_owned(),
                filters: ReadFilters::default(),
                include_flat: false,
                limit: 200,
            },
            ReadOperation::Events {
                alpha_id: "a".to_owned(),
                from: None,
                to: None,
                limit: 500,
            },
        ];
        for operation in operations {
            let blueprint = request_blueprint(&operation).unwrap();
            assert_eq!(blueprint.method, HttpMethod::Get);
            assert_eq!(
                blueprint.headers.get("X-Trading-Contract-Revision"),
                Some(&"v1".to_owned())
            );
        }
    }

    #[test]
    fn contract_discovery_fixture_keeps_unknown_extension_fields() {
        let headers = v1_headers();
        let outcome = parse_read_response(
            &ReadOperation::Contracts,
            &ResponseInput {
                http_status: 200,
                headers: &headers,
                body: CONTRACTS,
            },
        )
        .unwrap();
        let ReadOutcome::Success(AdapterPayload::Contracts(contract)) = outcome else {
            panic!("expected contracts payload");
        };
        assert_eq!(contract.authoritative_contract_revision, "v1");
        assert_eq!(contract.extra["shadow_is_authoritative"], false);
    }

    #[test]
    fn every_allowlisted_read_surface_has_a_typed_golden_fixture() {
        let headers = v1_headers();
        let cases = [
            (ReadOperation::Health, HEALTH, "health"),
            (ReadOperation::Capabilities, CAPABILITIES, "capabilities"),
            (
                ReadOperation::Fills {
                    alpha_id: "alpha-paper-1".to_owned(),
                    filters: ReadFilters::default(),
                    limit: 100,
                },
                FILLS,
                "fills",
            ),
            (
                ReadOperation::Positions {
                    alpha_id: "alpha-paper-1".to_owned(),
                    filters: ReadFilters::default(),
                    include_flat: false,
                    limit: 100,
                },
                POSITIONS,
                "positions",
            ),
            (
                ReadOperation::Events {
                    alpha_id: "alpha-paper-1".to_owned(),
                    from: None,
                    to: None,
                    limit: 500,
                },
                EVENTS,
                "events",
            ),
        ];
        for (operation, body, expected) in cases {
            let outcome = parse_read_response(
                &operation,
                &ResponseInput {
                    http_status: 200,
                    headers: &headers,
                    body,
                },
            )
            .unwrap();
            let label = match outcome {
                ReadOutcome::Success(AdapterPayload::Health(_)) => "health",
                ReadOutcome::Success(AdapterPayload::Capabilities(_)) => "capabilities",
                ReadOutcome::Success(AdapterPayload::Fills { count: 1, .. }) => "fills",
                ReadOutcome::Success(AdapterPayload::Positions { count: 1, .. }) => "positions",
                ReadOutcome::Success(AdapterPayload::Events { count: 1, .. }) => "events",
                _ => "unexpected",
            };
            assert_eq!(label, expected);
        }
    }

    #[test]
    fn alpha_scope_and_source_limits_fail_closed() {
        let missing = ReadOperation::Orders {
            alpha_id: " ".to_owned(),
            filters: ReadFilters::default(),
            limit: 100,
        };
        assert_eq!(
            request_blueprint(&missing),
            Err(AdapterError::MissingAlphaScope)
        );

        let excessive = ReadOperation::Positions {
            alpha_id: "a".to_owned(),
            filters: ReadFilters::default(),
            include_flat: false,
            limit: 501,
        };
        assert_eq!(
            request_blueprint(&excessive),
            Err(AdapterError::InvalidLimit { maximum: 500 })
        );
    }

    #[test]
    fn exact_decimal_order_maps_to_canonical_execution_fact() {
        let headers = v1_headers();
        let outcome = parse_read_response(
            &orders_operation(),
            &ResponseInput {
                http_status: 200,
                headers: &headers,
                body: ORDERS,
            },
        )
        .unwrap();
        let ReadOutcome::Success(AdapterPayload::Orders { rows, count }) = outcome else {
            panic!("expected orders payload");
        };
        assert_eq!(count, 1);
        let order = map_order(rows.into_iter().next().unwrap(), "alpha-paper-1").unwrap();
        assert_eq!(order.quantity.to_string(), "0.00100000");
        assert_eq!(order.price.unwrap().to_string(), "50000.00");
        assert!(order.status.supported);
        assert_eq!(source_authority(), SourceAuthority::Execution);
    }

    #[test]
    fn numeric_json_is_rejected_for_exact_decimal_fields() {
        let headers = v1_headers();
        let body = ORDERS
            .windows(b"\"0.00100000\"".len())
            .position(|window| window == b"\"0.00100000\"")
            .map(|position| {
                let mut bytes = ORDERS.to_vec();
                bytes.splice(
                    position..position + b"\"0.00100000\"".len(),
                    b"0.001".iter().copied(),
                );
                bytes
            })
            .unwrap();
        let result = parse_read_response(
            &orders_operation(),
            &ResponseInput {
                http_status: 200,
                headers: &headers,
                body: &body,
            },
        );
        assert_eq!(result, Err(AdapterError::MalformedJson));
    }

    #[test]
    fn unknown_enum_is_preserved_and_marked_unsupported() {
        let headers = v1_headers();
        let outcome = parse_read_response(
            &orders_operation(),
            &ResponseInput {
                http_status: 200,
                headers: &headers,
                body: UNKNOWN_ORDER,
            },
        )
        .unwrap();
        let ReadOutcome::Success(AdapterPayload::Orders { rows, .. }) = outcome else {
            panic!("expected orders payload");
        };
        let mapped = map_order(rows.into_iter().next().unwrap(), "alpha-paper-1").unwrap();
        assert_eq!(mapped.status.raw, "BROKER_PENDING_V2");
        assert!(!mapped.status.supported);
    }

    #[test]
    fn revision_mismatch_and_reason_codes_are_not_flattened_into_http_status() {
        let headers = BTreeMap::new();
        let incompatible = parse_read_response(
            &ReadOperation::Contracts,
            &ResponseInput {
                http_status: 406,
                headers: &headers,
                body: UNSUPPORTED,
            },
        )
        .unwrap();
        assert!(matches!(incompatible, ReadOutcome::Incompatible { .. }));

        let denied = parse_read_response(
            &orders_operation(),
            &ResponseInput {
                http_status: 403,
                headers: &headers,
                body: DENIED,
            },
        )
        .unwrap();
        assert_eq!(
            denied,
            ReadOutcome::Denied {
                reason: "UNAUTHORIZED_ALPHA".to_owned()
            }
        );
    }

    #[test]
    fn non_json_5xx_is_an_explicit_unavailable_state() {
        let headers = BTreeMap::new();
        assert_eq!(
            parse_read_response(
                &ReadOperation::Positions {
                    alpha_id: "alpha-paper-1".to_owned(),
                    filters: ReadFilters::default(),
                    include_flat: false,
                    limit: 200,
                },
                &ResponseInput {
                    http_status: 500,
                    headers: &headers,
                    body: NON_JSON_500,
                },
            )
            .unwrap(),
            ReadOutcome::Unavailable { http_status: 500 }
        );
    }

    #[test]
    fn successful_body_without_exact_contract_headers_is_refused() {
        let headers = BTreeMap::new();
        assert!(matches!(
            parse_read_response(
                &orders_operation(),
                &ResponseInput {
                    http_status: 200,
                    headers: &headers,
                    body: ORDERS,
                }
            ),
            Err(AdapterError::ContractHeaderMismatch { .. })
        ));
    }
}
