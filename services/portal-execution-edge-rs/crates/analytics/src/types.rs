use std::{fmt, str::FromStr};

use chrono::{DateTime, Utc};
use execution_contracts::{
    ContractWarning, DecimalString, FreshnessState, PanelState, SourceAuthority,
};
use rust_decimal::Decimal;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use thiserror::Error;

pub const ANALYTICS_SCHEMA_VERSION: &str = "execution.analytics.v1";
pub const MAX_INSIGHT_PREVIEW_ITEMS: usize = 64;
pub const MAX_CORRELATION_DIMENSION: usize = 150;
pub const MAX_CORRELATION_ENTITIES: usize = 500;
pub const MAX_RANKED_CORRELATION_PAIRS: usize = 500;
pub const MAX_BINDING_EXPOSURE_FACTS: usize = 2_500;
pub const MAX_FUNNEL_EVENTS: usize = 1_024;
pub const MAX_CAPITAL_LEDGER_ENTRIES: usize = 250;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct CurrencyCode(String);

impl CurrencyCode {
    /// Parses an uppercase currency or settlement-asset code.
    ///
    /// # Errors
    ///
    /// Returns [`AnalyticsError::InvalidCurrency`] for ambiguous or unbounded values.
    pub fn parse(raw: impl Into<String>) -> Result<Self, AnalyticsError> {
        let raw = raw.into();
        if !(2..=12).contains(&raw.len())
            || !raw
                .as_bytes()
                .iter()
                .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
        {
            return Err(AnalyticsError::InvalidCurrency(raw));
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for CurrencyCode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl Serialize for CurrencyCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for CurrencyCode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Self::parse(String::deserialize(deserializer)?).map_err(de::Error::custom)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PopulationCompleteness {
    Complete,
    Partial,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FactQuality {
    pub source_authority: SourceAuthority,
    pub freshness_state: FreshnessState,
    pub completeness: PopulationCompleteness,
    pub as_of: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DerivedAnalytics<T> {
    pub schema_version: String,
    pub formula_version: String,
    pub source_authority: SourceAuthority,
    pub input_freshness_floor: FreshnessState,
    pub panel_state: PanelState,
    pub input_completeness: PopulationCompleteness,
    pub input_as_of: Option<DateTime<Utc>>,
    pub warnings: Vec<ContractWarning>,
    pub data: T,
}

impl<T> DerivedAnalytics<T> {
    pub(crate) fn new(
        formula_version: &str,
        quality: &QualitySummary,
        panel_state: PanelState,
        warnings: Vec<ContractWarning>,
        data: T,
    ) -> Self {
        Self {
            schema_version: ANALYTICS_SCHEMA_VERSION.to_owned(),
            formula_version: formula_version.to_owned(),
            source_authority: SourceAuthority::Derived,
            input_freshness_floor: quality.freshness,
            panel_state,
            input_completeness: quality.completeness,
            input_as_of: quality.as_of,
            warnings,
            data,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct QualitySummary {
    pub freshness: FreshnessState,
    pub completeness: PopulationCompleteness,
    pub as_of: Option<DateTime<Utc>>,
}

impl QualitySummary {
    pub(crate) fn one(quality: &FactQuality) -> Self {
        Self {
            freshness: quality.freshness_state,
            completeness: quality.completeness,
            as_of: quality.as_of,
        }
    }

    pub(crate) fn from_iter<'a>(qualities: impl IntoIterator<Item = &'a FactQuality>) -> Self {
        let mut found = false;
        let mut freshness = FreshnessState::Ok;
        let mut completeness = PopulationCompleteness::Complete;
        let mut as_of: Option<DateTime<Utc>> = None;
        for quality in qualities {
            found = true;
            freshness = worse_freshness(freshness, quality.freshness_state);
            completeness = worse_completeness(completeness, quality.completeness);
            as_of = match (as_of, quality.as_of) {
                (Some(current), Some(candidate)) => Some(current.min(candidate)),
                (value, None) | (None, value) => value,
            };
        }
        if found {
            Self {
                freshness,
                completeness,
                as_of,
            }
        } else {
            Self {
                freshness: FreshnessState::Unknown,
                completeness: PopulationCompleteness::Unknown,
                as_of: None,
            }
        }
    }

    pub(crate) fn with_completeness(mut self, completeness: PopulationCompleteness) -> Self {
        self.completeness = worse_completeness(self.completeness, completeness);
        self
    }
}

pub(crate) const fn blocks_decision(freshness: FreshnessState) -> bool {
    matches!(
        freshness,
        FreshnessState::Stale | FreshnessState::Paused | FreshnessState::Unknown
    )
}

const fn freshness_rank(value: FreshnessState) -> u8 {
    match value {
        FreshnessState::Ok => 0,
        FreshnessState::Aging => 1,
        FreshnessState::Paused => 2,
        FreshnessState::Stale => 3,
        FreshnessState::Unknown => 4,
    }
}

pub(crate) fn worse_freshness(left: FreshnessState, right: FreshnessState) -> FreshnessState {
    if freshness_rank(left) >= freshness_rank(right) {
        left
    } else {
        right
    }
}

pub(crate) const fn worse_completeness(
    left: PopulationCompleteness,
    right: PopulationCompleteness,
) -> PopulationCompleteness {
    match (left, right) {
        (PopulationCompleteness::Unknown, _) | (_, PopulationCompleteness::Unknown) => {
            PopulationCompleteness::Unknown
        }
        (PopulationCompleteness::Partial, _) | (_, PopulationCompleteness::Partial) => {
            PopulationCompleteness::Partial
        }
        _ => PopulationCompleteness::Complete,
    }
}

pub(crate) fn validate_non_negative(
    field: &'static str,
    value: DecimalString,
) -> Result<Decimal, AnalyticsError> {
    let value = value.value();
    if value.is_sign_negative() {
        return Err(AnalyticsError::NegativeAmount { field });
    }
    Ok(value)
}

pub(crate) fn checked_add(left: Decimal, right: Decimal) -> Result<Decimal, AnalyticsError> {
    left.checked_add(right)
        .ok_or(AnalyticsError::DecimalOverflow)
}

pub(crate) fn checked_sub(left: Decimal, right: Decimal) -> Result<Decimal, AnalyticsError> {
    left.checked_sub(right)
        .ok_or(AnalyticsError::DecimalOverflow)
}

pub(crate) fn warning(code: &str, message: impl Into<String>) -> ContractWarning {
    ContractWarning {
        code: code.to_owned(),
        message: message.into(),
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AnalyticsError {
    #[error("invalid uppercase currency code: {0}")]
    InvalidCurrency(String),
    #[error("{field} must not be negative")]
    NegativeAmount { field: &'static str },
    #[error("exact decimal arithmetic overflow")]
    DecimalOverflow,
    #[error("{field} is inconsistent with its accounting boundary")]
    InconsistentAmount { field: &'static str },
    #[error("identifier scope mismatch: {field}")]
    ScopeMismatch { field: &'static str },
    #[error("duplicate identifier: {0}")]
    DuplicateIdentifier(String),
    #[error("batch has {actual} items; maximum is {maximum}")]
    BatchLimit { actual: usize, maximum: usize },
    #[error("correlation entity count {actual} exceeds maximum {maximum}")]
    CorrelationEntityLimit { actual: usize, maximum: usize },
    #[error("correlation pair count is {actual}; expected {expected}")]
    CorrelationPairCount { actual: usize, expected: usize },
    #[error("ranked correlation count {actual} exceeds maximum {maximum}")]
    RankedPairLimit { actual: usize, maximum: usize },
    #[error("correlation references unknown entity: {0}")]
    UnknownCorrelationEntity(String),
    #[error("correlation coefficient must be between -1 and 1")]
    InvalidCorrelationCoefficient,
    #[error("self-correlation must not be supplied")]
    SuppliedSelfCorrelation,
    #[error("capital ledger entry does not reconcile: {0}")]
    LedgerMismatch(String),
    #[error("series time range is invalid or wider than the canonical interval ladder")]
    InvalidSeriesRange,
    #[error("series contains more than {maximum} points: {actual}")]
    SeriesPointLimit { actual: usize, maximum: usize },
    #[error("series point or gap ordering is invalid: {field}")]
    InvalidSeriesOrdering { field: &'static str },
    #[error("series timestamp is outside or misaligned with the selected bucket interval")]
    InvalidSeriesBucket,
    #[error("a missing series value is not covered by an explicit gap")]
    UnexplainedSeriesGap,
    #[error("approved research band does not match the immutable run/digest lineage")]
    ApprovedBandLineageMismatch,
    #[error("approved research band lower bound exceeds its upper bound")]
    InvalidApprovedBand,
    #[error("insight series shape is invalid for tile kind {0}")]
    InvalidTileSeries(&'static str),
    #[error("insight tile sample count does not satisfy its declared state")]
    InvalidTileSampleState,
    #[error("analytics response is {actual} bytes; maximum is {maximum}")]
    ResponseSizeLimit { actual: usize, maximum: usize },
}

impl FromStr for CurrencyCode {
    type Err = AnalyticsError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        Self::parse(raw)
    }
}
