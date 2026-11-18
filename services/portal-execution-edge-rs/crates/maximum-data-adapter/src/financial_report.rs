//! Typed read adaptation of PM's EXISTING original-publication item, not an
//! economic writer, valuation/rollup engine, source verifier or grant provider.
//!
//! Source: `report_publication_history.py` + `report_wire.exact_payload` at PM
//! b6badae4. The bootstrap transport owns authentication/coverage/checkpoints;
//! this module consumes an already decoded item and never upgrades its selected
//! `AS_PUBLISHED` history to current authority, full history or certified returns.

use std::collections::{BTreeMap, BTreeSet};

use serde::{de, Deserialize, Deserializer, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;

pub const PAYLOAD_SCHEMA: &str = "pma.report-publication-history-item.v1";
pub const OWNERSHIP_BASIS: &str = "AS_PUBLISHED_NOT_CURRENT";
pub const COVERAGE: &str = "SELECTED_ORIGINAL_REPORT_PUBLICATIONS";
const MAX_BYTES: usize = 1024 * 1024;
const MAX_ROWS: usize = 128;
const MAX_TIME: i64 = 9_007_199_254_740_991;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum FinancialError {
    #[error("PM_FINANCIAL_SHAPE")]
    Shape,
    #[error("PM_FINANCIAL_BOUNDS")]
    Bounds,
    #[error("PM_FINANCIAL_BINDING")]
    Binding,
    #[error("PM_FINANCIAL_SOURCE_OVERLAP")]
    SourceOverlap,
}

/// Exact finite fixed-point wire text. No float parsing or rounding is used.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct DecimalText(String);

impl DecimalText {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    fn nonnegative(&self) -> bool {
        !self.0.starts_with('-') || self.0.bytes().all(|c| matches!(c, b'-' | b'.' | b'0'))
    }
}

impl<'de> Deserialize<'de> for DecimalText {
    fn deserialize<D: Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        let text = String::deserialize(input)?;
        let unsigned = text.strip_prefix('-').unwrap_or(&text);
        let parts: Vec<_> = unsigned.split('.').collect();
        let valid = parts.len() <= 2
            && !parts[0].is_empty()
            && parts
                .iter()
                .all(|v| !v.is_empty() && v.bytes().all(|c| c.is_ascii_digit()))
            && parts[0].trim_start_matches('0').len() <= 20
            && parts
                .get(1)
                .is_none_or(|v| v.trim_end_matches('0').len() <= 18)
            && text.len() <= 128;
        if !valid {
            return Err(de::Error::custom("PM_FINANCIAL_EXACT_DECIMAL_REQUIRED"));
        }
        Ok(Self(text))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SourceIdentity {
    pub source_cell_id: String,
    pub source_database_id: String,
    pub source_continuity_epoch: String,
}

/// Server-selected expected binding; its construction does NOT grant access.
/// The caller must authorize the WHOLE original publication before adapting it.
pub struct FinancialBinding {
    pub export: ExportScope,
    pub reference: String,
    pub report_key: String,
    pub publication_version: String,
    pub snapshot_ref: String,
    pub publication_payload_hash: String,
    pub mode: String,
    pub venue: String,
    pub backend: String,
    pub currency: String,
    pub basis: String,
    pub portfolios: BTreeSet<String>,
    pub physical_refs: BTreeSet<String>,
    pub expected_sources: BTreeSet<String>,
    pub valuation_refs: BTreeSet<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExportScope {
    pub source: SourceIdentity,
    pub dataset: String,
    pub partition: String,
    pub generation: String,
    pub schema: String,
    pub redaction_revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SnapshotCut {
    pub export: ExportScope,
    pub snapshot_id: String,
    pub boundary: String,
    pub source_set_digest: String,
    pub as_of_ms: i64,
    pub as_of_sub_ms_us: String,
    pub recorded_through_ms: i64,
    pub recorded_through_sub_ms_us: String,
    pub facts_through_ms: i64,
    pub facts_through_sub_ms_us: String,
    pub valuation_cutoff_ms: i64,
    pub valuation_cutoff_sub_ms_us: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Quality {
    pub status: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Economics {
    #[serde(deserialize_with = "required_nullable")]
    pub nav: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub realized_pnl: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub unrealized_pnl: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub fees: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub funding: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub interest: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub gross_exposure: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub net_exposure: Option<DecimalText>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileDisplay {
    pub desired: String,
    #[serde(deserialize_with = "required_nullable")]
    pub broker_applied: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub verified: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub effective: Option<String>,
    pub outcome: String,
    pub qualification: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Controls {
    pub nominal_budget: DecimalText,
    #[serde(deserialize_with = "required_nullable")]
    pub margin_risk_requirement: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub exposure_cap: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub backing: Option<DecimalText>,
    #[serde(deserialize_with = "required_nullable")]
    pub new_risk_capacity: Option<DecimalText>,
    pub amount_locked: DecimalText,
    pub recall_pending: DecimalText,
    pub authority_ref: String,
    pub model_revision: String,
    pub profile: ProfileDisplay,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReportHeader {
    pub report_id: String,
    pub view: String,
    pub target: String,
    pub cut: SnapshotCut,
    pub currency: String,
    pub basis: String,
    pub reducer_version: String,
    pub numeric_version: String,
    pub assignment_digest: String,
    pub owner_digest: String,
    pub valuation_refs: Vec<String>,
    pub mode: String,
    pub venue: String,
    pub backend: String,
    pub presentation: String,
    pub quality: Quality,
    pub schema_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PortfolioScope {
    pub portfolio_id: String,
    pub environment: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AccountRow {
    pub source_id: String,
    pub leaves: BTreeSet<String>,
    pub scope: PortfolioScope,
    pub account_id: String,
    pub deployment_id: String,
    pub strategy_id: String,
    pub original_owner: String,
    pub published_current_owner: String,
    pub pm_user: String,
    pub deploy_actor: String,
    pub archived: bool,
    pub cut: SnapshotCut,
    pub currency: String,
    pub basis: String,
    pub economics: Economics,
    pub controls: Controls,
    pub quality: Quality,
    pub physical_ref: String,
    pub role: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CapitalStatement {
    pub opening_receipt: String,
    pub opening_at_ms: i64,
    pub opening_at_sub_ms_us: String,
    pub opening: DecimalText,
    pub currency: String,
    pub as_of_ms: i64,
    pub as_of_sub_ms_us: String,
    pub recorded_through_ms: i64,
    pub recorded_through_sub_ms_us: String,
    pub economic_additions: DecimalText,
    pub economic_returns: DecimalText,
    pub net_assignments: DecimalText,
    pub budget_topups: DecimalText,
    pub budget_decreases: DecimalText,
    pub applied_refs: Vec<(String, String, String, String, String)>,
    pub advanced_metrics: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct SourceStatement {
    source_id: String,
    statement: CapitalStatement,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NativeProjection {
    pub physical_ref: String,
    pub cut: SnapshotCut,
    pub currency: String,
    pub basis: String,
    pub economics: Economics,
    pub profile: ProfileDisplay,
    pub reconciliation_ref: String,
    pub quality: Quality,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct PublicationItem {
    reference: String,
    report_key: String,
    version: String,
    snapshot_ref: String,
    publication_payload_hash: String,
    header: ReportHeader,
    rows: Vec<AccountRow>,
    statements: Vec<SourceStatement>,
    #[serde(deserialize_with = "required_nullable")]
    native: Option<NativeProjection>,
    #[serde(deserialize_with = "required_nullable")]
    native_snapshot: Option<(String, String, String)>,
    publication_valid_until_ms: i64,
    publication_valid_until_sub_ms_us: String,
    source_event_id: String,
    source_group_id: String,
    capture_recorded_at_ms: i64,
    capture_recorded_at_sub_ms_us: String,
}

/// Typed `AS_PUBLISHED` facts. No grand total deliberately exists: native custody
/// and management attribution are alternative bases, not additive accounts.
pub struct PublishedFinancialReport {
    item: PublicationItem,
    payload_sha256: String,
}

impl PublishedFinancialReport {
    /// Decode the exact PM item AFTER its bounded transport decoded JSON. The
    /// transport must reject duplicate object keys before producing `Value`.
    /// No hashing here authenticates source, scope, publication fence or coverage.
    ///
    /// # Errors
    /// Rejects schema/bounds/binding drift, overlapping economic leaves, changed
    /// valuation/cut/currency and non-exact decimals. Never falls back to budget.
    pub fn adapt(
        payload_schema: &str,
        payload: &Value,
        expected: &FinancialBinding,
    ) -> Result<Self, FinancialError> {
        if payload_schema != PAYLOAD_SCHEMA {
            return Err(FinancialError::Binding);
        }
        let encoded = serde_json::to_vec(payload).map_err(|_| FinancialError::Shape)?;
        if encoded.is_empty() || encoded.len() > MAX_BYTES {
            return Err(FinancialError::Bounds);
        }
        validate_tree(payload)?;
        let mut item: PublicationItem =
            serde_json::from_value(payload.clone()).map_err(|_| FinancialError::Shape)?;
        validate_binding(&item, expected)?;
        validate_rows(&mut item, expected)?;
        Ok(Self {
            item,
            payload_sha256: format!("sha256:{:x}", Sha256::digest(encoded)),
        })
    }

    #[must_use]
    pub fn header(&self) -> &ReportHeader {
        &self.item.header
    }

    #[must_use]
    pub fn rows(&self) -> &[AccountRow] {
        &self.item.rows
    }

    /// The native custody basis remains separate from every internal account.
    #[must_use]
    pub fn native(&self) -> Option<&NativeProjection> {
        self.item.native.as_ref()
    }

    #[must_use]
    pub fn statement(&self, source_id: &str) -> Option<&CapitalStatement> {
        self.item
            .statements
            .iter()
            .find(|s| s.source_id == source_id)
            .map(|s| &s.statement)
    }

    #[must_use]
    pub fn publication_version(&self) -> &str {
        &self.item.version
    }

    /// Content identity of input bytes only; NOT PM's private persistence hash.
    #[must_use]
    pub fn payload_sha256(&self) -> &str {
        &self.payload_sha256
    }
}

fn validate_binding(
    item: &PublicationItem,
    expected: &FinancialBinding,
) -> Result<(), FinancialError> {
    let header = &item.header;
    if item.reference != expected.reference
        || item.report_key != expected.report_key
        || header.cut.export != expected.export
        || item.version != expected.publication_version
        || item.snapshot_ref != expected.snapshot_ref
        || item.publication_payload_hash != expected.publication_payload_hash
        || header
            .valuation_refs
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>()
            != expected.valuation_refs
        || header.valuation_refs.len() != expected.valuation_refs.len()
        || header.mode != expected.mode
        || header.venue != expected.venue
        || header.backend != expected.backend
        || header.currency != expected.currency
        || header.basis != expected.basis
        || !matches!(header.mode.as_str(), "paper" | "sandbox" | "live")
        || !matches!(header.view.as_str(), "PORTFOLIO" | "RESEARCHER" | "VENUE")
        || !matches!(
            header.presentation.as_str(),
            "RESTATED" | "AS_ORIGINALLY_REPORTED"
        )
        || header.schema_version != "pma.operator-report.v1.1"
        || item.snapshot_ref != header.cut.snapshot_id
        || !counter(&item.version, false)
        || !hex_digest(&item.report_key)
        || !hex_digest(&item.publication_payload_hash)
    {
        return Err(FinancialError::Binding);
    }
    validate_cut(&header.cut)?;
    quality(&header.quality)?;
    time(
        item.publication_valid_until_ms,
        &item.publication_valid_until_sub_ms_us,
    )?;
    time(
        item.capture_recorded_at_ms,
        &item.capture_recorded_at_sub_ms_us,
    )?;
    match (&item.native, &item.native_snapshot) {
        (Some(native), Some((_, version, _)))
            if header.view == "VENUE"
                && native.physical_ref == header.target
                && expected.physical_refs.contains(&native.physical_ref)
                && counter(version, false)
                && native.cut == header.cut
                && native.currency == header.currency
                && native.basis == header.basis =>
        {
            quality(&native.quality)?;
            profile(&native.profile)?;
        }
        (None, None) if header.view != "VENUE" => {}
        _ => return Err(FinancialError::Binding),
    }
    if header.view == "PORTFOLIO" && !expected.portfolios.contains(&header.target) {
        return Err(FinancialError::Binding);
    }
    Ok(())
}

fn validate_rows(
    item: &mut PublicationItem,
    expected: &FinancialBinding,
) -> Result<(), FinancialError> {
    if item.rows.len() > MAX_ROWS || item.statements.len() > MAX_ROWS {
        return Err(FinancialError::Bounds);
    }
    let mut unique = BTreeMap::new();
    let mut leaves = BTreeSet::new();
    for row in &item.rows {
        if row.cut != item.header.cut
            || row.currency != item.header.currency
            || row.basis != item.header.basis
            || row.scope.environment != item.header.mode
            || !expected.portfolios.contains(&row.scope.portfolio_id)
            || !matches!(row.role.as_str(), "ACCOUNT" | "ROOT_RESIDUAL")
            || row.leaves.is_empty()
            || row.leaves.len() > MAX_ROWS
        {
            return Err(FinancialError::Binding);
        }
        quality(&row.quality)?;
        controls(&row.controls)?;
        if let Some(previous) = unique.get(&row.source_id) {
            if *previous != row {
                return Err(FinancialError::SourceOverlap);
            }
        } else {
            for leaf in &row.leaves {
                if !leaves.insert(leaf) {
                    return Err(FinancialError::SourceOverlap);
                }
            }
            unique.insert(row.source_id.clone(), row);
        }
    }
    let mut statements = BTreeSet::new();
    for source in &item.statements {
        if !unique.contains_key(&source.source_id) || !statements.insert(source.source_id.clone()) {
            return Err(FinancialError::Binding);
        }
        statement(&source.statement, &item.header)?;
    }
    if statements.len() != unique.len()
        || unique.keys().cloned().collect::<BTreeSet<_>>() != expected.expected_sources
    {
        return Err(FinancialError::Binding);
    }
    item.rows = unique.into_values().cloned().collect();
    Ok(())
}

fn validate_cut(cut: &SnapshotCut) -> Result<(), FinancialError> {
    for (ms, residual) in [
        (cut.as_of_ms, &cut.as_of_sub_ms_us),
        (cut.recorded_through_ms, &cut.recorded_through_sub_ms_us),
        (cut.facts_through_ms, &cut.facts_through_sub_ms_us),
        (cut.valuation_cutoff_ms, &cut.valuation_cutoff_sub_ms_us),
    ] {
        time(ms, residual)?;
    }
    Ok(())
}

fn quality(value: &Quality) -> Result<(), FinancialError> {
    if !matches!(
        value.status.as_str(),
        "COMPLETE" | "PARTIAL" | "STALE" | "UNRESOLVED"
    ) || (value.status == "COMPLETE") != value.reasons.is_empty()
        || value.reasons.len() > MAX_ROWS
    {
        return Err(FinancialError::Shape);
    }
    Ok(())
}

fn profile(value: &ProfileDisplay) -> Result<(), FinancialError> {
    if !matches!(
        value.outcome.as_str(),
        "PENDING" | "UNKNOWN" | "APPLIED" | "REJECTED"
    ) || !matches!(
        value.qualification.as_str(),
        "TEST_ONLY_SIMULATION" | "VERIFIED_NATIVE" | "UNAVAILABLE"
    ) || (value.outcome == "APPLIED"
        && (value.broker_applied.is_none()
            || value.verified.is_none()
            || value.effective.is_none()))
    {
        return Err(FinancialError::Shape);
    }
    Ok(())
}

fn controls(value: &Controls) -> Result<(), FinancialError> {
    for amount in [
        Some(&value.nominal_budget),
        value.margin_risk_requirement.as_ref(),
        value.exposure_cap.as_ref(),
        value.backing.as_ref(),
        value.new_risk_capacity.as_ref(),
        Some(&value.amount_locked),
        Some(&value.recall_pending),
    ]
    .into_iter()
    .flatten()
    {
        if !amount.nonnegative() {
            return Err(FinancialError::Shape);
        }
    }
    profile(&value.profile)
}

fn statement(value: &CapitalStatement, header: &ReportHeader) -> Result<(), FinancialError> {
    let cut = &header.cut;
    if value.currency != header.currency
        || (value.as_of_ms, &value.as_of_sub_ms_us) != (cut.as_of_ms, &cut.as_of_sub_ms_us)
        || (value.recorded_through_ms, &value.recorded_through_sub_ms_us)
            != (cut.recorded_through_ms, &cut.recorded_through_sub_ms_us)
        || value.advanced_metrics != "UNAVAILABLE_METHOD_NOT_CERTIFIED"
        || value.applied_refs.len() > MAX_ROWS
    {
        return Err(FinancialError::Binding);
    }
    time(value.opening_at_ms, &value.opening_at_sub_ms_us)?;
    if (
        value.opening_at_ms,
        value.opening_at_sub_ms_us.parse::<u16>().unwrap_or(1000),
    ) > (
        cut.as_of_ms,
        cut.as_of_sub_ms_us.parse::<u16>().unwrap_or(1000),
    ) {
        return Err(FinancialError::Binding);
    }
    for amount in [
        &value.opening,
        &value.economic_additions,
        &value.economic_returns,
        &value.budget_topups,
        &value.budget_decreases,
    ] {
        if !amount.nonnegative() {
            return Err(FinancialError::Shape);
        }
    }
    let mut seen = BTreeSet::new();
    for reference in &value.applied_refs {
        if reference.0 != cut.export.source.source_cell_id
            || reference.1 != cut.export.source.source_database_id
            || reference.2 != cut.export.source.source_continuity_epoch
            || !counter(&reference.4, false)
            || !seen.insert(reference)
        {
            return Err(FinancialError::Binding);
        }
    }
    Ok(())
}

fn time(ms: i64, residual: &str) -> Result<(), FinancialError> {
    if !(0..=MAX_TIME).contains(&ms)
        || !counter(residual, true)
        || !residual.parse::<u16>().is_ok_and(|v| v <= 999)
    {
        return Err(FinancialError::Shape);
    }
    Ok(())
}

fn counter(value: &str, zero: bool) -> bool {
    !value.is_empty()
        && value.bytes().all(|v| v.is_ascii_digit())
        && (value == "0" || !value.starts_with('0'))
        && (zero || value != "0")
        && value.parse::<i64>().is_ok()
}

fn hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

fn validate_tree(value: &Value) -> Result<(), FinancialError> {
    match value {
        Value::String(text)
            if text.is_empty()
                || text.len() > 512
                || text.trim() != text
                || text.chars().any(char::is_control) =>
        {
            return Err(FinancialError::Shape)
        }
        Value::Array(rows) => {
            if rows.len() > MAX_ROWS {
                return Err(FinancialError::Bounds);
            }
            for row in rows {
                validate_tree(row)?;
            }
        }
        Value::Object(fields) => {
            for field in fields.values() {
                validate_tree(field)?;
            }
        }
        _ => {}
    }
    Ok(())
}

// PM exact_payload emits each dataclass column even when its value is None.
// A nullable source column must not silently become an optional wire field.
fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}

#[cfg(test)]
mod tests;
