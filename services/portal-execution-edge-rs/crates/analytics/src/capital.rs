use execution_contracts::{CanonicalId, DecimalString, PanelState};
use serde::{Deserialize, Serialize};

use crate::types::{
    blocks_decision, checked_add, checked_sub, validate_non_negative, warning, AnalyticsError,
    CurrencyCode, DerivedAnalytics, FactQuality, PopulationCompleteness, QualitySummary,
};

const FORMULA_VERSION: &str = "capital-preview.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalPreviewRequest {
    pub portfolio_id: CanonicalId,
    pub requested_amount: DecimalString,
    pub currency: CurrencyCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalBucketInput {
    pub portfolio_id: CanonicalId,
    pub currency: CurrencyCode,
    pub allocated: DecimalString,
    pub used: DecimalString,
    pub reserved: DecimalString,
    pub maximum_allocated: DecimalString,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CapitalBlocker {
    StaleInput,
    IncompleteInput,
    ExceedsAllocationLimit,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CapitalPreview {
    pub portfolio_id: CanonicalId,
    pub currency: CurrencyCode,
    pub requested_amount: DecimalString,
    pub allocated_before: DecimalString,
    pub allocated_after: DecimalString,
    pub maximum_allocated: DecimalString,
    pub used: DecimalString,
    pub reserved: DecimalString,
    pub available_before: DecimalString,
    pub available_after: DecimalString,
    pub allocation_headroom_before: DecimalString,
    pub allocation_headroom_after: DecimalString,
    pub decision_eligible: bool,
    pub blockers: Vec<CapitalBlocker>,
}

/// Computes a currency-isolated capital preview without changing authoritative state.
///
/// # Errors
///
/// Rejects scope mismatch, negative/inconsistent accounting values, and decimal overflow.
pub fn build_capital_preview(
    request: &CapitalPreviewRequest,
    input: &CapitalBucketInput,
) -> Result<DerivedAnalytics<CapitalPreview>, AnalyticsError> {
    if request.portfolio_id != input.portfolio_id {
        return Err(AnalyticsError::ScopeMismatch {
            field: "portfolio_id",
        });
    }
    if request.currency != input.currency {
        return Err(AnalyticsError::ScopeMismatch { field: "currency" });
    }

    let requested = validate_non_negative("requested_amount", request.requested_amount)?;
    let allocated = validate_non_negative("allocated", input.allocated)?;
    let used = validate_non_negative("used", input.used)?;
    let reserved = validate_non_negative("reserved", input.reserved)?;
    let maximum = validate_non_negative("maximum_allocated", input.maximum_allocated)?;
    let committed = checked_add(used, reserved)?;
    if committed > allocated || allocated > maximum {
        return Err(AnalyticsError::InconsistentAmount {
            field: "capital_bucket",
        });
    }

    let allocated_after = checked_add(allocated, requested)?;
    let available_before = checked_sub(allocated, committed)?;
    let available_after = checked_sub(allocated_after, committed)?;
    let headroom_before = checked_sub(maximum, allocated)?;
    let exceeds_limit = allocated_after > maximum;
    let headroom_after = if exceeds_limit {
        rust_decimal::Decimal::ZERO
    } else {
        checked_sub(maximum, allocated_after)?
    };

    let mut blockers = Vec::new();
    let mut warnings = Vec::new();
    if blocks_decision(input.quality.freshness_state) {
        blockers.push(CapitalBlocker::StaleInput);
        warnings.push(warning(
            "CAPITAL_INPUT_NOT_FRESH",
            "Capital preview is visible for diagnosis but cannot authorize an R2 decision",
        ));
    }
    if input.quality.completeness != PopulationCompleteness::Complete {
        blockers.push(CapitalBlocker::IncompleteInput);
        warnings.push(warning(
            "CAPITAL_INPUT_INCOMPLETE",
            "Capital population is not complete; approval remains blocked",
        ));
    }
    if exceeds_limit {
        blockers.push(CapitalBlocker::ExceedsAllocationLimit);
        warnings.push(warning(
            "CAPITAL_LIMIT_EXCEEDED",
            "Requested allocation is greater than the authoritative currency-bucket limit",
        ));
    }

    let panel_state = if blocks_decision(input.quality.freshness_state) {
        PanelState::Stale
    } else if input.quality.completeness != PopulationCompleteness::Complete {
        PanelState::Partial
    } else {
        PanelState::Ok
    };
    let quality = QualitySummary::one(&input.quality);
    let data = CapitalPreview {
        portfolio_id: request.portfolio_id.clone(),
        currency: request.currency.clone(),
        requested_amount: request.requested_amount,
        allocated_before: DecimalString::from_decimal(allocated),
        allocated_after: DecimalString::from_decimal(allocated_after),
        maximum_allocated: DecimalString::from_decimal(maximum),
        used: DecimalString::from_decimal(used),
        reserved: DecimalString::from_decimal(reserved),
        available_before: DecimalString::from_decimal(available_before),
        available_after: DecimalString::from_decimal(available_after),
        allocation_headroom_before: DecimalString::from_decimal(headroom_before),
        allocation_headroom_after: DecimalString::from_decimal(headroom_after),
        decision_eligible: blockers.is_empty(),
        blockers,
    };
    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        panel_state,
        warnings,
        data,
    ))
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use execution_contracts::{FreshnessState, SourceAuthority};

    use super::*;

    fn decimal(value: &str) -> DecimalString {
        DecimalString::parse(value).unwrap()
    }

    fn request() -> CapitalPreviewRequest {
        CapitalPreviewRequest {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            requested_amount: decimal("125.250000000000000001"),
            currency: CurrencyCode::parse("USDT").unwrap(),
        }
    }

    fn input() -> CapitalBucketInput {
        CapitalBucketInput {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            currency: CurrencyCode::parse("USDT").unwrap(),
            allocated: decimal("500.000000000000000001"),
            used: decimal("100"),
            reserved: decimal("25"),
            maximum_allocated: decimal("1000"),
            quality: FactQuality {
                source_authority: SourceAuthority::Execution,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(Utc::now()),
            },
        }
    }

    #[test]
    fn computes_exact_preview_and_serializes_decimals_as_strings() {
        let preview = build_capital_preview(&request(), &input()).unwrap();
        assert!(preview.data.decision_eligible);
        assert_eq!(
            preview.data.allocated_after.to_string(),
            "625.250000000000000002"
        );
        let wire = serde_json::to_value(preview).unwrap();
        assert!(wire["data"]["allocated_after"].is_string());
        assert_eq!(wire["formula_version"], FORMULA_VERSION);
    }

    #[test]
    fn stale_input_is_a_visible_r2_blocker() {
        let mut input = input();
        input.quality.freshness_state = FreshnessState::Stale;
        let preview = build_capital_preview(&request(), &input).unwrap();
        assert_eq!(preview.panel_state, PanelState::Stale);
        assert!(!preview.data.decision_eligible);
        assert_eq!(preview.data.blockers, vec![CapitalBlocker::StaleInput]);
    }

    #[test]
    fn never_converts_or_combines_currency_buckets() {
        let mut input = input();
        input.currency = CurrencyCode::parse("USDC").unwrap();
        assert_eq!(
            build_capital_preview(&request(), &input),
            Err(AnalyticsError::ScopeMismatch { field: "currency" })
        );
    }
}
