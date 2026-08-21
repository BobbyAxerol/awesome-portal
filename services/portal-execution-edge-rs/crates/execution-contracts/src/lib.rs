#![forbid(unsafe_code)]

use std::{collections::BTreeMap, fmt, str::FromStr};

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
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
    /// Parses a base-10 decimal without passing through a binary float.
    ///
    /// # Errors
    ///
    /// Returns [`ContractError::InvalidDecimal`] when `raw` is not a valid
    /// decimal representation.
    pub fn parse(raw: &str) -> Result<Self, ContractError> {
        Decimal::from_str(raw)
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceFacts {
    pub source_authority: SourceAuthority,
    pub as_of: Option<DateTime<Utc>>,
    pub read_at: DateTime<Utc>,
    pub source_sequence: Option<i64>,
    pub source_cursor: Option<String>,
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
    pub source: SourceFacts,
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
    fn canonical_id_fails_closed_on_ambiguous_whitespace() {
        assert!(CanonicalId::parse(" order-1 ").is_err());
        assert_eq!(CanonicalId::parse("order-1").unwrap().as_str(), "order-1");
    }
}
