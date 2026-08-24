#![forbid(unsafe_code)]

use std::{collections::BTreeMap, sync::OnceLock};

use execution_contracts::DecimalString;
use serde::{Deserialize, Serialize};
use serde_json::Value;

include!(concat!(env!("OUT_DIR"), "/vocabularies.rs"));

pub const API_VERSION: &str = "v1";
pub const CONTRACT_REVISION: &str = "v1";
pub const SCHEMA_VERSION: &str = "v1";
pub const CONTRACT_REVISION_HEADER: &str = "x-trading-contract-revision";
pub const API_VERSION_HEADER: &str = "x-trading-api-version";
pub const SCHEMA_VERSION_HEADER: &str = "x-trading-schema-version";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WireIdentifier {
    Text(String),
    Integer(i64),
}

impl WireIdentifier {
    #[must_use]
    pub fn canonical_text(&self) -> String {
        match self {
            Self::Text(value) => value.clone(),
            Self::Integer(value) => value.to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireContracts {
    pub status: String,
    pub api_version: String,
    pub authoritative_contract_revision: String,
    pub authoritative_schema_version: String,
    pub supported_contract_revisions: Vec<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireCapabilities {
    pub status: String,
    pub ts: f64,
    #[serde(default)]
    pub capabilities: BTreeMap<String, Value>,
    #[serde(default)]
    pub venue_products: Vec<WireVenueProduct>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
// These independent booleans are the upstream v1 wire contract. Collapsing
// them into a state would change Trading System semantics.
#[allow(clippy::struct_excessive_bools)]
pub struct WireVenueProduct {
    pub venue: String,
    pub product: String,
    #[serde(default)]
    pub supported_modes: Vec<String>,
    pub execution_available: bool,
    pub market_data_available: bool,
    pub private_events_available: bool,
    pub account_sync_available: bool,
    pub reconciliation_available: bool,
    #[serde(default)]
    pub position_modes: Vec<String>,
    pub rollout_state: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireHealth {
    pub status: String,
    pub ts: f64,
    #[serde(default)]
    pub checks: BTreeMap<String, Value>,
    #[serde(default)]
    pub capabilities: BTreeMap<String, Value>,
    #[serde(default)]
    pub venue_products: Vec<WireVenueProduct>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireOrder {
    pub client_order_id: String,
    #[serde(default)]
    pub venue_order_id: Option<String>,
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default, alias = "alpha_id")]
    pub strategy_id: Option<String>,
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub quantity: DecimalString,
    #[serde(default)]
    pub price: Option<DecimalString>,
    #[serde(default)]
    pub filled_quantity: Option<DecimalString>,
    pub status: String,
    pub mode: String,
    pub venue: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireFill {
    pub fill_id: WireIdentifier,
    #[serde(default)]
    pub trade_id: Option<String>,
    #[serde(default)]
    pub client_order_id: Option<String>,
    #[serde(default, alias = "alpha_id")]
    pub strategy_id: Option<String>,
    #[serde(default)]
    pub account_id: Option<String>,
    pub symbol: String,
    pub side: String,
    pub quantity: DecimalString,
    pub price: DecimalString,
    #[serde(default)]
    #[serde(alias = "fee")]
    pub commission: Option<DecimalString>,
    #[serde(default)]
    pub trade_time: Option<String>,
    pub mode: String,
    pub venue: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WirePosition {
    pub position_id: String,
    pub strategy_id: String,
    pub account_id: String,
    pub mode: String,
    pub venue: String,
    #[serde(default)]
    pub instrument_id: Option<String>,
    pub symbol: String,
    pub side: String,
    pub signed_qty: DecimalString,
    pub quantity: DecimalString,
    #[serde(default)]
    pub avg_px_open: Option<DecimalString>,
    #[serde(default)]
    pub avg_px_close: Option<DecimalString>,
    #[serde(default)]
    pub realized_pnl: Option<DecimalString>,
    #[serde(default)]
    pub unrealized_pnl: Option<DecimalString>,
    #[serde(default)]
    pub peak_qty: Option<DecimalString>,
    #[serde(default)]
    pub opened_at: Option<String>,
    #[serde(default)]
    pub closed_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WireEvent {
    #[serde(default)]
    pub event_id: Option<String>,
    pub event_type: String,
    pub event_ts: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub trace_id: Option<String>,
    #[serde(default, alias = "alpha_id")]
    pub strategy_id: Option<String>,
    #[serde(default)]
    pub client_order_id: Option<String>,
    #[serde(default)]
    pub payload: Value,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireList<T> {
    pub status: String,
    pub count: i64,
    pub items: Vec<T>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireRejected {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
    #[serde(default)]
    pub detail: Option<Value>,
    #[serde(default)]
    pub retry_after_seconds: Option<u64>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireUnsupportedRevision {
    pub status: String,
    pub requested_revision: String,
    pub supported_revisions: Vec<String>,
    pub authoritative_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct VocabularySummary {
    pub python_enums: usize,
    pub db_check_constraints: usize,
    pub db_check_distinct_fields: usize,
    pub db_fields_conflated_across_tables: usize,
    pub venue_product_profiles: usize,
    pub crosschecked_concepts: usize,
    pub crosscheck_divergences: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PythonEnumVocabulary {
    #[serde(rename = "enum")]
    pub name: String,
    pub source: String,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DbCheckVocabulary {
    pub table: String,
    pub column: String,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DbCheckVocabularies {
    pub by_table_column: BTreeMap<String, DbCheckVocabulary>,
    pub by_field: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct VocabularyCatalog {
    pub summary: VocabularySummary,
    pub python_enums: Vec<PythonEnumVocabulary>,
    pub db_check_vocabularies: DbCheckVocabularies,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VocabularyMatch {
    Known(String),
    Unsupported(String),
}

#[must_use]
/// Returns the immutable, build-time validated Trading System vocabulary pack.
///
/// # Panics
///
/// Panics only when the evidence embedded by `build.rs` no longer deserializes
/// into the pinned v1 catalog, which is a build artifact integrity failure.
pub fn vocabulary_catalog() -> &'static VocabularyCatalog {
    static CATALOG: OnceLock<VocabularyCatalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(VOCABULARIES_JSON)
            .expect("build-time validated vocabulary snapshot must deserialize")
    })
}

#[must_use]
pub fn classify_python_enum(name: &str, raw: &str) -> VocabularyMatch {
    let known = vocabulary_catalog()
        .python_enums
        .iter()
        .find(|item| item.name == name)
        .is_some_and(|item| item.values.iter().any(|value| value == raw));
    if known {
        VocabularyMatch::Known(raw.to_owned())
    } else {
        VocabularyMatch::Unsupported(raw.to_owned())
    }
}

#[must_use]
pub fn classify_db_check(table_column: &str, raw: &str) -> VocabularyMatch {
    let known = vocabulary_catalog()
        .db_check_vocabularies
        .by_table_column
        .get(table_column)
        .is_some_and(|item| item.values.iter().any(|value| value == raw));
    if known {
        VocabularyMatch::Known(raw.to_owned())
    } else {
        VocabularyMatch::Unsupported(raw.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_vocabulary_evidence_is_compiled_in() {
        let catalog = vocabulary_catalog();
        assert_eq!(catalog.summary.python_enums, 22);
        assert_eq!(catalog.python_enums.len(), 22);
        assert_eq!(catalog.summary.db_check_constraints, 91);
        assert_eq!(catalog.db_check_vocabularies.by_table_column.len(), 91);
        assert_eq!(catalog.summary.db_check_distinct_fields, 33);
        assert_eq!(catalog.db_check_vocabularies.by_field.len(), 33);
        assert_eq!(catalog.summary.db_fields_conflated_across_tables, 7);
        assert_eq!(catalog.summary.venue_product_profiles, 6);
        assert_eq!(catalog.summary.crosschecked_concepts, 6);
        assert_eq!(catalog.summary.crosscheck_divergences, 3);
    }

    #[test]
    fn unknown_values_are_preserved_instead_of_crashing_or_aliasing() {
        assert_eq!(
            classify_python_enum("TradingMode", "paper"),
            VocabularyMatch::Known("paper".to_owned())
        );
        assert_eq!(
            classify_python_enum("TradingMode", "future-mode"),
            VocabularyMatch::Unsupported("future-mode".to_owned())
        );
        assert_eq!(
            classify_db_check("strategy_deployments.runtime_state", "NEW_STATE"),
            VocabularyMatch::Unsupported("NEW_STATE".to_owned())
        );
    }
}
