use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, DecimalString, PanelState};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::types::{
    checked_add, validate_non_negative, warning, AnalyticsError, CurrencyCode, DerivedAnalytics,
    FactQuality, PopulationCompleteness, QualitySummary, MAX_BINDING_EXPOSURE_FACTS,
};

const FORMULA_VERSION: &str = "broker-binding-exposure.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VirtualAccountExposure {
    pub account_id: CanonicalId,
    pub currency: CurrencyCode,
    pub used: DecimalString,
    pub reserved: DecimalString,
    pub available: DecimalString,
    pub headroom: DecimalString,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BindingExposureInput {
    pub binding_id: CanonicalId,
    pub expected_account_count: Option<u32>,
    pub source_population: PopulationCompleteness,
    pub accounts: Vec<VirtualAccountExposure>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BindingExposureBucket {
    pub currency: CurrencyCode,
    pub account_count: u32,
    pub used: DecimalString,
    pub reserved: DecimalString,
    pub available: DecimalString,
    pub headroom: DecimalString,
    pub oldest_source_as_of: Option<DateTime<Utc>>,
    pub newest_source_as_of: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BindingExposureResult {
    pub binding_id: CanonicalId,
    pub account_count: u32,
    pub expected_account_count: Option<u32>,
    pub population_completeness: PopulationCompleteness,
    pub buckets: Vec<BindingExposureBucket>,
}

#[derive(Default)]
struct BucketAccumulator {
    account_count: u32,
    used: Decimal,
    reserved: Decimal,
    available: Decimal,
    headroom: Decimal,
    oldest: Option<DateTime<Utc>>,
    newest: Option<DateTime<Utc>>,
}

/// Aggregates all virtual accounts behind one physical binding by currency.
///
/// The result has no all-currency total and therefore cannot imply an FX policy.
/// `expected_account_count` describes the complete source population, not a page.
///
/// # Errors
///
/// Rejects unbounded input, duplicate account/currency facts, negative amounts,
/// and decimal/count overflow.
pub fn aggregate_binding_exposure(
    input: &BindingExposureInput,
) -> Result<DerivedAnalytics<BindingExposureResult>, AnalyticsError> {
    if input.accounts.len() > MAX_BINDING_EXPOSURE_FACTS {
        return Err(AnalyticsError::BatchLimit {
            actual: input.accounts.len(),
            maximum: MAX_BINDING_EXPOSURE_FACTS,
        });
    }
    let mut distinct_accounts = BTreeSet::new();
    let mut account_currency = BTreeSet::new();
    let mut buckets: BTreeMap<CurrencyCode, BucketAccumulator> = BTreeMap::new();
    for account in &input.accounts {
        distinct_accounts.insert(account.account_id.as_str());
        if !account_currency.insert((account.account_id.as_str(), account.currency.as_str())) {
            return Err(AnalyticsError::DuplicateIdentifier(format!(
                "{}:{}",
                account.account_id.as_str(),
                account.currency.as_str()
            )));
        }
        let used = validate_non_negative("used", account.used)?;
        let reserved = validate_non_negative("reserved", account.reserved)?;
        let available = validate_non_negative("available", account.available)?;
        let headroom = validate_non_negative("headroom", account.headroom)?;
        let bucket = buckets.entry(account.currency.clone()).or_default();
        bucket.account_count = bucket
            .account_count
            .checked_add(1)
            .ok_or(AnalyticsError::DecimalOverflow)?;
        bucket.used = checked_add(bucket.used, used)?;
        bucket.reserved = checked_add(bucket.reserved, reserved)?;
        bucket.available = checked_add(bucket.available, available)?;
        bucket.headroom = checked_add(bucket.headroom, headroom)?;
        if let Some(as_of) = account.quality.as_of {
            bucket.oldest = Some(bucket.oldest.map_or(as_of, |value| value.min(as_of)));
            bucket.newest = Some(bucket.newest.map_or(as_of, |value| value.max(as_of)));
        }
    }

    let account_count =
        u32::try_from(distinct_accounts.len()).map_err(|_| AnalyticsError::DecimalOverflow)?;
    let count_completeness = match input.expected_account_count {
        Some(expected) if expected == account_count => PopulationCompleteness::Complete,
        Some(_) => PopulationCompleteness::Partial,
        None => PopulationCompleteness::Unknown,
    };
    let quality = QualitySummary::from_iter(input.accounts.iter().map(|item| &item.quality))
        .with_completeness(input.source_population)
        .with_completeness(count_completeness);
    let population_completeness = quality.completeness;
    let mut warnings = Vec::new();
    if population_completeness != PopulationCompleteness::Complete {
        warnings.push(warning(
            "BINDING_POPULATION_INCOMPLETE",
            "Binding exposure is partial because the complete virtual-account population was not proven",
        ));
    }

    let buckets = buckets
        .into_iter()
        .map(|(currency, bucket)| BindingExposureBucket {
            currency,
            account_count: bucket.account_count,
            used: DecimalString::from_decimal(bucket.used),
            reserved: DecimalString::from_decimal(bucket.reserved),
            available: DecimalString::from_decimal(bucket.available),
            headroom: DecimalString::from_decimal(bucket.headroom),
            oldest_source_as_of: bucket.oldest,
            newest_source_as_of: bucket.newest,
        })
        .collect();
    let panel_state = if input.accounts.is_empty() {
        if input.expected_account_count == Some(0) {
            PanelState::Empty
        } else {
            PanelState::Unavailable
        }
    } else if population_completeness == PopulationCompleteness::Complete {
        PanelState::Ok
    } else {
        PanelState::Partial
    };

    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        panel_state,
        warnings,
        BindingExposureResult {
            binding_id: input.binding_id.clone(),
            account_count,
            expected_account_count: input.expected_account_count,
            population_completeness,
            buckets,
        },
    ))
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone as _;
    use execution_contracts::{FreshnessState, SourceAuthority};

    use super::*;

    fn account(id: &str, currency: &str, used: &str) -> VirtualAccountExposure {
        VirtualAccountExposure {
            account_id: CanonicalId::parse(id).unwrap(),
            currency: CurrencyCode::parse(currency).unwrap(),
            used: DecimalString::parse(used).unwrap(),
            reserved: DecimalString::parse("1.000000000000000001").unwrap(),
            available: DecimalString::parse("20").unwrap(),
            headroom: DecimalString::parse("30").unwrap(),
            quality: FactQuality {
                source_authority: SourceAuthority::Broker,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(Utc.with_ymd_and_hms(2026, 8, 21, 0, 0, 0).unwrap()),
            },
        }
    }

    #[test]
    fn totals_complete_population_independent_of_page_and_by_currency() {
        let output = aggregate_binding_exposure(&BindingExposureInput {
            binding_id: CanonicalId::parse("binding-1").unwrap(),
            expected_account_count: Some(3),
            source_population: PopulationCompleteness::Complete,
            accounts: vec![
                account("a-1", "USDT", "10.000000000000000001"),
                account("a-2", "USDT", "20.000000000000000002"),
                account("a-3", "USDC", "7"),
            ],
        })
        .unwrap();
        assert_eq!(output.panel_state, PanelState::Ok);
        assert_eq!(output.data.account_count, 3);
        assert_eq!(output.data.buckets.len(), 2);
        assert_eq!(
            output.data.buckets[1].used.to_string(),
            "30.000000000000000003"
        );
        let wire = serde_json::to_value(output).unwrap();
        assert!(wire["data"]["buckets"][1]["used"].is_string());
        assert!(wire["data"].get("total").is_none());
    }

    #[test]
    fn count_mismatch_is_visible_partiality() {
        let output = aggregate_binding_exposure(&BindingExposureInput {
            binding_id: CanonicalId::parse("binding-1").unwrap(),
            expected_account_count: Some(2),
            source_population: PopulationCompleteness::Complete,
            accounts: vec![account("a-1", "USDT", "10")],
        })
        .unwrap();
        assert_eq!(output.panel_state, PanelState::Partial);
        assert_eq!(
            output.data.population_completeness,
            PopulationCompleteness::Partial
        );
    }

    #[test]
    fn same_virtual_account_may_have_distinct_currency_buckets() {
        let output = aggregate_binding_exposure(&BindingExposureInput {
            binding_id: CanonicalId::parse("binding-1").unwrap(),
            expected_account_count: Some(1),
            source_population: PopulationCompleteness::Complete,
            accounts: vec![account("a-1", "USDT", "10"), account("a-1", "USDC", "20")],
        })
        .unwrap();
        assert_eq!(output.data.account_count, 1);
        assert_eq!(output.data.buckets.len(), 2);
    }
}
