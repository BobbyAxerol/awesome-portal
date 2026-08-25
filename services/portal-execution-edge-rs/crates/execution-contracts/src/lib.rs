#![forbid(unsafe_code)]

use std::{collections::BTreeMap, fmt};

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(transparent)]
pub struct CanonicalId(String);

impl CanonicalId {
    /// Builds an identifier after rejecting empty or surrounding-whitespace forms.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidIdentifier`] when the identifier is empty
    /// or has surrounding whitespace.
    pub fn parse(raw: impl Into<String>) -> Result<Self, ContractError> {
        let raw = raw.into();
        if raw.is_empty() || raw.trim() != raw {
            return Err(ContractError::InvalidIdentifier);
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl<'de> Deserialize<'de> for CanonicalId {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let raw = String::deserialize(deserializer)?;
        Self::parse(raw).map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SourceAuthority {
    Research,
    Execution,
    Broker,
    Derived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryProfile {
    Fixture,
    Shadow,
    Paper,
    Sandbox,
    LiveCanary,
    LiveFull,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FreshnessState {
    Ok,
    Aging,
    Stale,
    Paused,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SourceCompleteness {
    EventSourced,
    PollBounded,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PanelState {
    Loading,
    Ok,
    Empty,
    Partial,
    Stale,
    Denied,
    Unavailable,
    InsufficientData,
    Terminal,
}

/// Exact decimal serialized as a JSON string. JSON numbers are rejected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct DecimalString(Decimal);

impl DecimalString {
    #[must_use]
    pub const fn from_decimal(value: Decimal) -> Self {
        Self(value)
    }

    /// Parses a base-10 decimal without binary-float conversion or rounding.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidDecimal`] when `raw` is not a valid
    /// decimal representation.
    pub fn parse(raw: &str) -> Result<Self, ContractError> {
        Decimal::from_str_exact(raw)
            .map(Self)
            .map_err(|_| ContractError::InvalidDecimal(raw.to_owned()))
    }

    #[must_use]
    pub const fn value(self) -> Decimal {
        self.0
    }
}

impl fmt::Display for DecimalString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl Serialize for DecimalString {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0.to_string())
    }
}

impl<'de> Deserialize<'de> for DecimalString {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DecimalStringVisitor;

        impl de::Visitor<'_> for DecimalStringVisitor {
            type Value = DecimalString;

            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                formatter.write_str("an exact decimal encoded as a JSON string")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: de::Error,
            {
                DecimalString::parse(value).map_err(E::custom)
            }
        }

        deserializer.deserialize_str(DecimalStringVisitor)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExternalVocabularyValue {
    pub vocabulary: String,
    pub raw: String,
    pub supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SourceCursor {
    pub event_ts: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub event_id: CanonicalId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceFacts {
    pub source_authority: SourceAuthority,
    pub as_of: Option<DateTime<Utc>>,
    pub read_at: DateTime<Utc>,
    pub source_sequence: Option<i64>,
    pub source_cursor: Option<SourceCursor>,
    pub projection_epoch: Option<String>,
    pub projection_sequence: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContractWarning {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReadEnvelope<T> {
    pub schema_version: String,
    pub delivery_profile: DeliveryProfile,
    pub freshness_state: FreshnessState,
    pub panel_state: PanelState,
    #[serde(flatten)]
    pub source: SourceFacts,
    pub source_completeness: SourceCompleteness,
    pub poll_interval_ms: Option<i64>,
    pub age_seconds: Option<i64>,
    pub lag_ms: Option<i64>,
    pub formula_version: Option<String>,
    pub capability_snapshot_id: Option<String>,
    pub warnings: Vec<ContractWarning>,
    pub data: T,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionReadCapability {
    Contracts,
    Health,
    Capabilities,
    Orders,
    Fills,
    Positions,
    Events,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapabilityState {
    Supported,
    ReadOnly,
    ShadowOnly,
    Disabled,
    Incompatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilityObservation {
    pub state: CapabilityState,
    pub reason: String,
    pub checked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CompatibilityIdentity {
    pub adapter_id: String,
    pub source_gateway_digest: String,
    pub source_api_version: String,
    pub source_contract_revision: String,
    pub source_schema_version: String,
    pub capability_snapshot_id: String,
    pub contract_checked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapabilitySnapshot {
    pub identity: CompatibilityIdentity,
    pub capabilities: BTreeMap<ExecutionReadCapability, CapabilityObservation>,
    pub observed_venue_products: Vec<String>,
    pub warnings: Vec<ContractWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderFact {
    pub client_order_id: CanonicalId,
    pub venue_order_id: Option<String>,
    pub alpha_id: CanonicalId,
    pub symbol: String,
    pub side: ExternalVocabularyValue,
    pub order_type: ExternalVocabularyValue,
    pub quantity: DecimalString,
    pub price: Option<DecimalString>,
    pub filled_quantity: Option<DecimalString>,
    pub status: ExternalVocabularyValue,
    pub mode: ExternalVocabularyValue,
    pub venue: String,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

/// D4 Paper shadow extension that preserves the frozen `OrderFact` payload
/// while carrying the source account binding required by Portal projections.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaperOrderFact {
    #[serde(flatten)]
    pub order: OrderFact,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account_id: Option<CanonicalId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FillFact {
    pub fill_id: CanonicalId,
    pub trade_id: Option<CanonicalId>,
    pub client_order_id: Option<CanonicalId>,
    pub alpha_id: CanonicalId,
    pub account_id: Option<CanonicalId>,
    pub symbol: String,
    pub side: ExternalVocabularyValue,
    pub quantity: DecimalString,
    pub price: DecimalString,
    pub commission: Option<DecimalString>,
    pub trade_time: Option<DateTime<Utc>>,
    pub mode: ExternalVocabularyValue,
    pub venue: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PositionFact {
    pub position_id: CanonicalId,
    pub alpha_id: CanonicalId,
    pub account_id: CanonicalId,
    pub mode: ExternalVocabularyValue,
    pub venue: String,
    pub instrument_id: Option<String>,
    pub symbol: String,
    pub side: ExternalVocabularyValue,
    pub signed_quantity: DecimalString,
    pub quantity: DecimalString,
    pub average_open_price: Option<DecimalString>,
    pub average_close_price: Option<DecimalString>,
    pub realized_pnl: Option<DecimalString>,
    pub unrealized_pnl: Option<DecimalString>,
    pub peak_quantity: Option<DecimalString>,
    pub opened_at: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionEventFact {
    pub event_id: CanonicalId,
    pub event_type: String,
    pub event_ts: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub trace_id: Option<CanonicalId>,
    pub alpha_id: CanonicalId,
    pub client_order_id: Option<CanonicalId>,
    pub payload: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ContractError {
    #[error("identifier must be non-empty and must not contain surrounding whitespace")]
    InvalidIdentifier,
    #[error("invalid exact decimal string: {0}")]
    InvalidDecimal(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_requires_a_json_string_and_round_trips_scale() {
        let decimal: DecimalString = serde_json::from_str("\"100.2500\"").unwrap();
        assert_eq!(decimal.to_string(), "100.2500");
        assert_eq!(serde_json::to_string(&decimal).unwrap(), "\"100.2500\"");
        assert!(serde_json::from_str::<DecimalString>("100.25").is_err());
    }

    #[test]
    fn decimal_rejects_precision_that_would_be_silently_rounded() {
        let too_precise = "123456789012.000000000000000001";

        assert_eq!(
            DecimalString::parse(too_precise),
            Err(ContractError::InvalidDecimal(too_precise.to_owned()))
        );
        assert!(serde_json::from_str::<DecimalString>(&format!("\"{too_precise}\"")).is_err());
    }

    #[test]
    fn canonical_id_fails_closed_on_ambiguous_whitespace() {
        assert!(CanonicalId::parse(" order-1 ").is_err());
        assert_eq!(CanonicalId::parse("order-1").unwrap().as_str(), "order-1");
    }

    #[test]
    fn read_envelope_keeps_source_cursor_flat_and_structured() {
        let envelope = ReadEnvelope {
            schema_version: "execution.read.v1".to_owned(),
            delivery_profile: DeliveryProfile::Shadow,
            freshness_state: FreshnessState::Ok,
            panel_state: PanelState::Ok,
            source: SourceFacts {
                source_authority: SourceAuthority::Execution,
                as_of: Some("2026-08-21T00:00:00Z".parse().unwrap()),
                read_at: "2026-08-21T00:00:01Z".parse().unwrap(),
                source_sequence: None,
                source_cursor: Some(SourceCursor {
                    event_ts: "2026-08-21T00:00:00Z".parse().unwrap(),
                    created_at: "2026-08-21T00:00:00.100Z".parse().unwrap(),
                    event_id: CanonicalId::parse("evt_1").unwrap(),
                }),
                projection_epoch: Some("018f0000-0000-7000-8000-000000000001".to_owned()),
                projection_sequence: Some(7),
            },
            source_completeness: SourceCompleteness::EventSourced,
            poll_interval_ms: None,
            age_seconds: Some(1),
            lag_ms: Some(5),
            formula_version: None,
            capability_snapshot_id: Some("cap_1".to_owned()),
            warnings: vec![],
            data: serde_json::json!({"status": "OPEN"}),
        };
        let wire = serde_json::to_value(envelope).unwrap();
        assert_eq!(wire["source_authority"], "EXECUTION");
        assert_eq!(wire["source_cursor"]["event_id"], "evt_1");
        assert!(wire.get("source").is_none());
    }
}
