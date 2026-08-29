use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, DecimalString, PanelState};
use query_api::{select_series_interval, SeriesIntent};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::types::{
    warning, AnalyticsError, CurrencyCode, DerivedAnalytics, FactQuality, PopulationCompleteness,
    QualitySummary,
};

const FORMULA_VERSION: &str = "equity_projection.v1";
pub const MAX_SERIES_POINTS: usize = 5_000;
pub const MAX_ANALYTICS_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SeriesGapReason {
    SourceGap,
    Retention,
    SessionClosed,
    ProjectionDiscontinuity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeriesGap {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub reason: SeriesGapReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EquityPoint {
    pub bucket_start: DateTime<Utc>,
    pub equity: Option<DecimalString>,
    pub drawdown: Option<DecimalString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovedBandPoint {
    pub bucket_start: DateTime<Utc>,
    pub lower: DecimalString,
    pub upper: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovedBand {
    pub run_id: CanonicalId,
    pub artifact_digest: String,
    pub points: Vec<ApprovedBandPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RetentionSummary {
    pub availability: String,
    pub policy_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EquityProjectionInput {
    pub deployment_id: CanonicalId,
    pub currency: CurrencyCode,
    pub requested_from: DateTime<Utc>,
    pub requested_to: DateTime<Utc>,
    pub intent: SeriesIntent,
    pub joined_run_id: CanonicalId,
    pub artifact_digest: String,
    pub points: Vec<EquityPoint>,
    pub approved_band: Option<ApprovedBand>,
    pub gaps: Vec<SeriesGap>,
    pub source_rows: u64,
    pub retention: RetentionSummary,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EquityProjection {
    pub deployment_id: CanonicalId,
    pub currency: CurrencyCode,
    pub requested_from: DateTime<Utc>,
    pub requested_to: DateTime<Utc>,
    pub interval: String,
    pub interval_seconds: u32,
    pub expected_buckets: u32,
    pub returned_buckets: u32,
    pub source_rows: u64,
    pub coverage: DecimalString,
    pub joined_run_id: CanonicalId,
    pub artifact_digest: String,
    pub points: Vec<EquityPoint>,
    pub approved_band: Option<ApprovedBand>,
    pub gaps: Vec<SeriesGap>,
    pub retention: RetentionSummary,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EquityProjectionResponse {
    pub schema_version: String,
    pub runtime_active: bool,
    pub source_side_effect_requested: bool,
    pub analytics: DerivedAnalytics<EquityProjection>,
}

/// Builds the source-dark equity contract without interpolation or float math.
///
/// The interval is selected by the shared query ladder. Missing values must be
/// covered by an explicit gap, and an approved band is accepted only when its
/// immutable research run and artifact digest match the deployment lineage.
///
/// # Errors
///
/// Rejects invalid ranges, unbounded/misaligned series, implicit gaps, invalid
/// drawdown/band values, lineage drift and responses larger than 2 MiB.
pub fn build_equity_projection(
    input: EquityProjectionInput,
) -> Result<EquityProjectionResponse, AnalyticsError> {
    let selection = select_series_interval(input.requested_from, input.requested_to, input.intent)
        .map_err(|_| AnalyticsError::InvalidSeriesRange)?;
    validate_points(
        &input.points,
        &input.gaps,
        input.requested_from,
        input.requested_to,
        selection.interval_seconds,
    )?;
    validate_gaps(&input.gaps, input.requested_from, input.requested_to)?;
    if let Some(band) = &input.approved_band {
        if band.run_id != input.joined_run_id || band.artifact_digest != input.artifact_digest {
            return Err(AnalyticsError::ApprovedBandLineageMismatch);
        }
        validate_band(
            band,
            input.requested_from,
            input.requested_to,
            selection.interval_seconds,
        )?;
    }

    let returned = input
        .points
        .iter()
        .filter(|point| point.equity.is_some())
        .count();
    let returned_u32 = u32::try_from(returned).map_err(|_| AnalyticsError::SeriesPointLimit {
        actual: returned,
        maximum: MAX_SERIES_POINTS,
    })?;
    let coverage = Decimal::from(returned_u32)
        .checked_div(Decimal::from(selection.inclusive_bucket_count))
        .ok_or(AnalyticsError::DecimalOverflow)?;
    let quality = QualitySummary::one(&input.quality).with_completeness(
        if returned_u32 == selection.inclusive_bucket_count {
            input.quality.completeness
        } else {
            PopulationCompleteness::Partial
        },
    );
    let panel_state = if input.points.is_empty() {
        PanelState::Empty
    } else if input.gaps.is_empty() && quality.completeness == PopulationCompleteness::Complete {
        PanelState::Ok
    } else {
        PanelState::Partial
    };
    let warnings = (!input.gaps.is_empty())
        .then(|| {
            warning(
                "SERIES_HAS_EXPLICIT_GAPS",
                "No values were interpolated across gaps",
            )
        })
        .into_iter()
        .collect();
    let projection = EquityProjection {
        deployment_id: input.deployment_id,
        currency: input.currency,
        requested_from: input.requested_from,
        requested_to: input.requested_to,
        interval: interval_name(selection.interval_seconds).to_owned(),
        interval_seconds: selection.interval_seconds,
        expected_buckets: selection.inclusive_bucket_count,
        returned_buckets: returned_u32,
        source_rows: input.source_rows,
        coverage: DecimalString::from_decimal(coverage),
        joined_run_id: input.joined_run_id,
        artifact_digest: input.artifact_digest,
        points: input.points,
        approved_band: input.approved_band,
        gaps: input.gaps,
        retention: input.retention,
    };
    let output = EquityProjectionResponse {
        schema_version: "execution.analytics.equity-projection.v1".to_owned(),
        runtime_active: false,
        source_side_effect_requested: false,
        analytics: DerivedAnalytics::new(
            FORMULA_VERSION,
            &quality,
            panel_state,
            warnings,
            projection,
        ),
    };
    enforce_response_size(&output)?;
    Ok(output)
}

pub(crate) fn enforce_response_size<T: Serialize>(value: &T) -> Result<(), AnalyticsError> {
    let actual = serde_json::to_vec(value)
        .map_err(|_| AnalyticsError::InvalidTileSeries("serialization"))?
        .len();
    if actual > MAX_ANALYTICS_RESPONSE_BYTES {
        return Err(AnalyticsError::ResponseSizeLimit {
            actual,
            maximum: MAX_ANALYTICS_RESPONSE_BYTES,
        });
    }
    Ok(())
}

fn validate_points(
    points: &[EquityPoint],
    gaps: &[SeriesGap],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    interval_seconds: u32,
) -> Result<(), AnalyticsError> {
    if points.len() > MAX_SERIES_POINTS {
        return Err(AnalyticsError::SeriesPointLimit {
            actual: points.len(),
            maximum: MAX_SERIES_POINTS,
        });
    }
    let mut seen = BTreeSet::new();
    let mut previous = None;
    for point in points {
        validate_bucket(point.bucket_start, from, to, interval_seconds)?;
        if previous.is_some_and(|value| value >= point.bucket_start)
            || !seen.insert(point.bucket_start)
        {
            return Err(AnalyticsError::InvalidSeriesOrdering { field: "points" });
        }
        if point
            .drawdown
            .is_some_and(|drawdown| drawdown.value() > Decimal::ZERO)
        {
            return Err(AnalyticsError::InvalidTileSeries("drawdown_positive"));
        }
        let missing = point.equity.is_none() || point.drawdown.is_none();
        if missing && !gaps.iter().any(|gap| contains(gap, point.bucket_start)) {
            return Err(AnalyticsError::UnexplainedSeriesGap);
        }
        previous = Some(point.bucket_start);
    }
    Ok(())
}

fn validate_band(
    band: &ApprovedBand,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    interval_seconds: u32,
) -> Result<(), AnalyticsError> {
    if band.points.len() > MAX_SERIES_POINTS {
        return Err(AnalyticsError::SeriesPointLimit {
            actual: band.points.len(),
            maximum: MAX_SERIES_POINTS,
        });
    }
    let mut previous = None;
    for point in &band.points {
        validate_bucket(point.bucket_start, from, to, interval_seconds)?;
        if previous.is_some_and(|value| value >= point.bucket_start) {
            return Err(AnalyticsError::InvalidSeriesOrdering {
                field: "approved_band",
            });
        }
        if point.lower > point.upper {
            return Err(AnalyticsError::InvalidApprovedBand);
        }
        previous = Some(point.bucket_start);
    }
    Ok(())
}

fn validate_gaps(
    gaps: &[SeriesGap],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<(), AnalyticsError> {
    let mut previous_to = None;
    for gap in gaps {
        if gap.from > gap.to || gap.from < from || gap.to > to {
            return Err(AnalyticsError::InvalidSeriesOrdering { field: "gaps" });
        }
        if previous_to.is_some_and(|value| value >= gap.from) {
            return Err(AnalyticsError::InvalidSeriesOrdering { field: "gaps" });
        }
        previous_to = Some(gap.to);
    }
    Ok(())
}

fn validate_bucket(
    bucket: DateTime<Utc>,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    interval_seconds: u32,
) -> Result<(), AnalyticsError> {
    if bucket < from
        || bucket > to
        || bucket.timestamp().rem_euclid(i64::from(interval_seconds)) != 0
    {
        return Err(AnalyticsError::InvalidSeriesBucket);
    }
    Ok(())
}

fn contains(gap: &SeriesGap, point: DateTime<Utc>) -> bool {
    gap.from <= point && point <= gap.to
}

const fn interval_name(interval_seconds: u32) -> &'static str {
    match interval_seconds {
        60 => "1m",
        300 => "5m",
        900 => "15m",
        3_600 => "1h",
        14_400 => "4h",
        86_400 => "1d",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeDelta;
    use execution_contracts::{FreshnessState, SourceAuthority};

    use super::*;

    fn at(hours: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_777_737_600, 0).unwrap() + TimeDelta::hours(hours)
    }

    fn input(hours: i64) -> EquityProjectionInput {
        EquityProjectionInput {
            deployment_id: CanonicalId::parse("dep_88").unwrap(),
            currency: CurrencyCode::parse("USDT").unwrap(),
            requested_from: at(0),
            requested_to: at(hours),
            intent: SeriesIntent::Overview,
            joined_run_id: CanonicalId::parse("run_44").unwrap(),
            artifact_digest: format!("sha256:{}", "a".repeat(64)),
            points: vec![
                EquityPoint {
                    bucket_start: at(0),
                    equity: Some(DecimalString::parse("100.000000000000000001").unwrap()),
                    drawdown: Some(DecimalString::parse("0").unwrap()),
                },
                EquityPoint {
                    bucket_start: at(1),
                    equity: None,
                    drawdown: None,
                },
            ],
            approved_band: None,
            gaps: vec![SeriesGap {
                from: at(1),
                to: at(1),
                reason: SeriesGapReason::SourceGap,
            }],
            source_rows: 1,
            retention: RetentionSummary {
                availability: "HOT".to_owned(),
                policy_version: "retention.paper.v1".to_owned(),
            },
            quality: FactQuality {
                source_authority: SourceAuthority::Execution,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(at(hours)),
            },
        }
    }

    #[test]
    fn selects_adaptive_interval_and_preserves_exact_decimal_gap() {
        let output = build_equity_projection(input(2)).unwrap();
        assert_eq!(output.analytics.data.interval, "1m");
        assert_eq!(output.analytics.data.expected_buckets, 121);
        assert_eq!(output.analytics.data.returned_buckets, 1);
        assert_eq!(
            output.analytics.data.points[0].equity.unwrap().to_string(),
            "100.000000000000000001"
        );
        assert_eq!(output.analytics.panel_state, PanelState::Partial);
        assert_eq!(
            output.analytics.warnings[0].code,
            "SERIES_HAS_EXPLICIT_GAPS"
        );
        assert!(!output.runtime_active);
    }

    #[test]
    fn chooses_finest_rung_under_five_thousand_points() {
        let mut value = input(24 * 30);
        value.points.truncate(1);
        value.gaps.clear();
        let output = build_equity_projection(value).unwrap();
        assert_eq!(output.analytics.data.interval, "15m");
        assert!(output.analytics.data.expected_buckets <= 5_000);
    }

    #[test]
    fn rejects_implicit_gap_and_lineage_drift() {
        let mut implicit = input(2);
        implicit.gaps.clear();
        assert_eq!(
            build_equity_projection(implicit),
            Err(AnalyticsError::UnexplainedSeriesGap)
        );

        let mut drift = input(2);
        drift.approved_band = Some(ApprovedBand {
            run_id: CanonicalId::parse("run_other").unwrap(),
            artifact_digest: drift.artifact_digest.clone(),
            points: vec![],
        });
        assert_eq!(
            build_equity_projection(drift),
            Err(AnalyticsError::ApprovedBandLineageMismatch)
        );
    }

    #[test]
    fn rejects_positive_drawdown_and_more_than_five_thousand_points() {
        let mut bad = input(2);
        bad.points[0].drawdown = Some(DecimalString::parse("0.01").unwrap());
        assert_eq!(
            build_equity_projection(bad),
            Err(AnalyticsError::InvalidTileSeries("drawdown_positive"))
        );

        let mut too_many = input(24 * 365);
        too_many.points = (0..=MAX_SERIES_POINTS)
            .map(|index| EquityPoint {
                bucket_start: at(i64::try_from(index).unwrap()),
                equity: Some(DecimalString::parse("1").unwrap()),
                drawdown: Some(DecimalString::parse("0").unwrap()),
            })
            .collect();
        too_many.gaps.clear();
        assert!(matches!(
            build_equity_projection(too_many),
            Err(AnalyticsError::SeriesPointLimit { .. })
        ));
    }

    #[test]
    fn canonical_openapi_equity_fixture_deserializes_through_rust() {
        let fixture: EquityProjectionResponse = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.equity-projection.valid.json"
        ))
        .unwrap();

        assert_eq!(
            fixture.schema_version,
            "execution.analytics.equity-projection.v1"
        );
        assert!(!fixture.runtime_active);
        assert!(!fixture.source_side_effect_requested);
        assert_eq!(
            fixture.analytics.data.points[0]
                .equity
                .expect("fixture equity")
                .to_string(),
            "100.000000000000000001"
        );
    }
}
