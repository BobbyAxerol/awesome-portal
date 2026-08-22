use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, DecimalString, PanelState};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::types::{
    checked_add, validate_non_negative, warning, AnalyticsError, CurrencyCode, DerivedAnalytics,
    FactQuality, PopulationCompleteness, QualitySummary, MAX_CAPITAL_LEDGER_ENTRIES,
};

const FORMULA_VERSION: &str = "portfolio-capital-ledger.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MovementType {
    InitialAllocate,
    Allocate,
    Withdraw,
    Rebalance,
    Adjust,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LedgerDirection {
    Increase,
    Decrease,
    Unchanged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalLedgerFact {
    pub ledger_id: CanonicalId,
    pub portfolio_id: CanonicalId,
    pub allocation_id: Option<CanonicalId>,
    pub account_id: CanonicalId,
    pub currency: CurrencyCode,
    pub movement_type: MovementType,
    pub amount: DecimalString,
    pub before_allocated: DecimalString,
    pub after_allocated: DecimalString,
    pub occurred_at: DateTime<Utc>,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalLedgerInput {
    pub portfolio_id: CanonicalId,
    pub source_population: PopulationCompleteness,
    pub entries: Vec<CapitalLedgerFact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalLedgerEntry {
    pub ledger_id: CanonicalId,
    pub allocation_id: Option<CanonicalId>,
    pub account_id: CanonicalId,
    pub movement_type: MovementType,
    pub direction: LedgerDirection,
    pub amount: DecimalString,
    pub before_allocated: DecimalString,
    pub after_allocated: DecimalString,
    pub occurred_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalLedgerBucket {
    pub currency: CurrencyCode,
    pub gross_increase: DecimalString,
    pub gross_decrease: DecimalString,
    pub entries: Vec<CapitalLedgerEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapitalLedgerWindow {
    Latest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalLedgerResult {
    pub portfolio_id: CanonicalId,
    pub entry_count: usize,
    pub returned_entry_count: usize,
    pub has_more: bool,
    pub window: CapitalLedgerWindow,
    pub buckets: Vec<CapitalLedgerBucket>,
}

struct LedgerBucketAccumulator {
    increase: Decimal,
    decrease: Decimal,
}

impl Default for LedgerBucketAccumulator {
    fn default() -> Self {
        Self {
            increase: Decimal::ZERO,
            decrease: Decimal::ZERO,
        }
    }
}

/// Validates immutable allocation movements and returns currency-isolated ledgers.
///
/// Rebalance/adjust direction is derived from before/after; allocate and withdraw
/// directions are fixed by their authoritative vocabulary.
///
/// # Errors
///
/// Rejects cross-portfolio rows, duplicate ledger IDs, negative values, arithmetic
/// overflow, or a movement whose amount does not reconcile before and after.
pub fn build_capital_ledger(
    input: &CapitalLedgerInput,
) -> Result<DerivedAnalytics<CapitalLedgerResult>, AnalyticsError> {
    let mut ids = BTreeSet::new();
    let mut buckets: BTreeMap<CurrencyCode, LedgerBucketAccumulator> = BTreeMap::new();
    let mut ranked_entries = Vec::with_capacity(input.entries.len());
    for fact in &input.entries {
        if fact.portfolio_id != input.portfolio_id {
            return Err(AnalyticsError::ScopeMismatch {
                field: "portfolio_id",
            });
        }
        if !ids.insert(fact.ledger_id.as_str()) {
            return Err(AnalyticsError::DuplicateIdentifier(
                fact.ledger_id.as_str().to_owned(),
            ));
        }
        let amount = validate_non_negative("amount", fact.amount)?;
        let before = validate_non_negative("before_allocated", fact.before_allocated)?;
        let after = validate_non_negative("after_allocated", fact.after_allocated)?;
        let direction = reconcile(fact, amount, before, after)?;
        let bucket = buckets.entry(fact.currency.clone()).or_default();
        match direction {
            LedgerDirection::Increase => bucket.increase = checked_add(bucket.increase, amount)?,
            LedgerDirection::Decrease => bucket.decrease = checked_add(bucket.decrease, amount)?,
            LedgerDirection::Unchanged => {}
        }
        ranked_entries.push((
            fact.currency.clone(),
            CapitalLedgerEntry {
                ledger_id: fact.ledger_id.clone(),
                allocation_id: fact.allocation_id.clone(),
                account_id: fact.account_id.clone(),
                movement_type: fact.movement_type,
                direction,
                amount: fact.amount,
                before_allocated: fact.before_allocated,
                after_allocated: fact.after_allocated,
                occurred_at: fact.occurred_at,
            },
        ));
    }

    ranked_entries.sort_by(|(_, left), (_, right)| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.ledger_id.as_str().cmp(left.ledger_id.as_str()))
    });
    ranked_entries.truncate(MAX_CAPITAL_LEDGER_ENTRIES);
    let returned_entry_count = ranked_entries.len();
    let mut visible_by_currency: BTreeMap<CurrencyCode, Vec<CapitalLedgerEntry>> = BTreeMap::new();
    for (currency, entry) in ranked_entries {
        visible_by_currency.entry(currency).or_default().push(entry);
    }

    let quality = QualitySummary::from_iter(input.entries.iter().map(|entry| &entry.quality))
        .with_completeness(input.source_population);
    let mut buckets: Vec<_> = buckets
        .into_iter()
        .map(|(currency, bucket)| CapitalLedgerBucket {
            entries: visible_by_currency.remove(&currency).unwrap_or_default(),
            currency,
            gross_increase: DecimalString::from_decimal(bucket.increase),
            gross_decrease: DecimalString::from_decimal(bucket.decrease),
        })
        .collect();
    buckets.sort_by(|left, right| left.currency.cmp(&right.currency));
    let mut warnings = Vec::new();
    if quality.completeness != PopulationCompleteness::Complete {
        warnings.push(warning(
            "CAPITAL_LEDGER_INCOMPLETE",
            "Capital ledger population is not proven complete",
        ));
    }
    let has_more = input.entries.len() > returned_entry_count;
    if has_more {
        warnings.push(warning(
            "CAPITAL_LEDGER_WINDOWED",
            "Entries are the latest bounded window; gross totals cover the full validated population",
        ));
    }
    let panel_state = if input.entries.is_empty() {
        PanelState::Empty
    } else if quality.completeness == PopulationCompleteness::Complete {
        PanelState::Ok
    } else {
        PanelState::Partial
    };
    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        panel_state,
        warnings,
        CapitalLedgerResult {
            portfolio_id: input.portfolio_id.clone(),
            entry_count: input.entries.len(),
            returned_entry_count,
            has_more,
            window: CapitalLedgerWindow::Latest,
            buckets,
        },
    ))
}

fn reconcile(
    fact: &CapitalLedgerFact,
    amount: Decimal,
    before: Decimal,
    after: Decimal,
) -> Result<LedgerDirection, AnalyticsError> {
    let delta = after
        .checked_sub(before)
        .ok_or(AnalyticsError::DecimalOverflow)?;
    if delta.abs() != amount {
        return Err(AnalyticsError::LedgerMismatch(
            fact.ledger_id.as_str().to_owned(),
        ));
    }
    let direction = if delta.is_zero() {
        LedgerDirection::Unchanged
    } else if delta.is_sign_positive() {
        LedgerDirection::Increase
    } else {
        LedgerDirection::Decrease
    };
    let vocabulary_valid = match fact.movement_type {
        MovementType::InitialAllocate | MovementType::Allocate => {
            direction == LedgerDirection::Increase
        }
        MovementType::Withdraw => direction == LedgerDirection::Decrease,
        MovementType::Rebalance | MovementType::Adjust => true,
    };
    if !vocabulary_valid {
        return Err(AnalyticsError::LedgerMismatch(
            fact.ledger_id.as_str().to_owned(),
        ));
    }
    Ok(direction)
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone as _;
    use execution_contracts::{FreshnessState, SourceAuthority};

    use super::*;

    fn fact(
        id: &str,
        currency: &str,
        movement_type: MovementType,
        amount: &str,
        before: &str,
        after: &str,
    ) -> CapitalLedgerFact {
        CapitalLedgerFact {
            ledger_id: CanonicalId::parse(id).unwrap(),
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            allocation_id: Some(CanonicalId::parse("alloc-1").unwrap()),
            account_id: CanonicalId::parse("account-1").unwrap(),
            currency: CurrencyCode::parse(currency).unwrap(),
            movement_type,
            amount: DecimalString::parse(amount).unwrap(),
            before_allocated: DecimalString::parse(before).unwrap(),
            after_allocated: DecimalString::parse(after).unwrap(),
            occurred_at: Utc.with_ymd_and_hms(2026, 8, 21, 0, 0, 0).unwrap(),
            quality: FactQuality {
                source_authority: SourceAuthority::Execution,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(Utc.with_ymd_and_hms(2026, 8, 21, 0, 0, 0).unwrap()),
            },
        }
    }

    #[test]
    fn reconciles_movements_and_keeps_currencies_separate() {
        let output = build_capital_ledger(&CapitalLedgerInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            entries: vec![
                fact(
                    "l-1",
                    "USDT",
                    MovementType::Allocate,
                    "10.000000000000000001",
                    "20",
                    "30.000000000000000001",
                ),
                fact("l-2", "VND", MovementType::Withdraw, "5", "20", "15"),
            ],
        })
        .unwrap();
        assert_eq!(output.data.buckets.len(), 2);
        assert_eq!(output.data.buckets[0].currency.as_str(), "USDT");
        assert_eq!(output.data.buckets[1].currency.as_str(), "VND");
        let wire = serde_json::to_value(output).unwrap();
        assert!(wire["data"]["buckets"][0]["gross_increase"].is_string());
    }

    #[test]
    fn rejects_non_reconciling_authoritative_row() {
        let input = CapitalLedgerInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            entries: vec![fact(
                "l-1",
                "USDT",
                MovementType::Allocate,
                "10",
                "20",
                "29",
            )],
        };
        assert_eq!(
            build_capital_ledger(&input),
            Err(AnalyticsError::LedgerMismatch("l-1".to_owned()))
        );
    }

    #[test]
    fn adjust_derives_direction_from_before_after() {
        let output = build_capital_ledger(&CapitalLedgerInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            entries: vec![fact("l-1", "USDT", MovementType::Adjust, "4", "20", "16")],
        })
        .unwrap();
        assert_eq!(
            output.data.buckets[0].entries[0].direction,
            LedgerDirection::Decrease
        );
    }

    #[test]
    fn windows_large_ledger_without_losing_exact_gross_totals() {
        let entries = (0..=MAX_CAPITAL_LEDGER_ENTRIES)
            .map(|index| {
                fact(
                    &format!("l-{index:04}"),
                    "USDT",
                    MovementType::Allocate,
                    "1",
                    "1",
                    "2",
                )
            })
            .collect();
        let input = CapitalLedgerInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            entries,
        };
        let output = build_capital_ledger(&input).unwrap();
        assert_eq!(output.data.entry_count, MAX_CAPITAL_LEDGER_ENTRIES + 1);
        assert_eq!(output.data.returned_entry_count, MAX_CAPITAL_LEDGER_ENTRIES);
        assert!(output.data.has_more);
        assert_eq!(
            output.data.buckets[0].gross_increase.to_string(),
            (MAX_CAPITAL_LEDGER_ENTRIES + 1).to_string()
        );
        assert_eq!(
            output.data.buckets[0].entries.len(),
            MAX_CAPITAL_LEDGER_ENTRIES
        );
    }
}
