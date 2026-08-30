use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use execution_contracts::{DecimalString, SourceAuthority};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{AnalyticsError, PopulationCompleteness, MAX_SERIES_POINTS};

pub const MAX_CHART_SERIES: usize = 20;
pub const MAX_CHART_MARKERS: usize = 500;
const DIGEST_PREFIX: &str = "sha256:";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChartSeriesKind {
    Line,
    Bar,
    Candlestick,
    Episode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChartUnit {
    Money,
    Ratio,
    Percent,
    BasisPoints,
    Count,
    Price,
    Quantity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ChartGapReason {
    SourceGap,
    Retention,
    VenueClosed,
    ProjectionDiscontinuity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChartDownsampleMethod {
    None,
    ExtremaStrideV1,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartPoint {
    pub timestamp: DateTime<Utc>,
    pub value: Option<DecimalString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartGap {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub reason: ChartGapReason,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartAnnotation {
    pub timestamp: DateTime<Utc>,
    pub value: DecimalString,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartMarker {
    pub timestamp: DateTime<Utc>,
    pub marker_type: String,
    pub journal_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartDownsample {
    pub method: ChartDownsampleMethod,
    pub input_points: usize,
    pub output_points: usize,
    pub input_minimum: Option<DecimalString>,
    pub input_maximum: Option<DecimalString>,
}

/// Shared, authority-carrying chart representation used by every N25 producer.
/// Money/quantity/price values remain decimal strings all the way to the browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChartSeries {
    pub schema_version: String,
    pub series_id: String,
    pub kind: ChartSeriesKind,
    pub unit: ChartUnit,
    pub currency: Option<String>,
    pub authority: SourceAuthority,
    pub as_of: DateTime<Utc>,
    pub formula_version: String,
    pub completeness: PopulationCompleteness,
    pub join_digest: Option<String>,
    pub ohlc_owner: Option<SourceAuthority>,
    pub points: Vec<ChartPoint>,
    pub gaps: Vec<ChartGap>,
    pub markers: Vec<ChartMarker>,
    pub annotations: Vec<ChartAnnotation>,
    pub declared_total: Option<DecimalString>,
    pub downsample: ChartDownsample,
}

/// Deterministically reduces a series while retaining endpoints and global extrema.
/// It never interpolates or averages exact financial values.
///
/// # Errors
///
/// Returns a chart-rule error when the output bound is outside the canonical
/// four-to-5,000 point range.
pub fn downsample_extrema(
    points: &[ChartPoint],
    maximum: usize,
) -> Result<(Vec<ChartPoint>, ChartDownsample), AnalyticsError> {
    if !(4..=MAX_SERIES_POINTS).contains(&maximum) {
        return Err(AnalyticsError::ChartRule("downsample_bound"));
    }
    let extrema = extrema(points);
    if points.len() <= maximum {
        return Ok((
            points.to_vec(),
            ChartDownsample {
                method: ChartDownsampleMethod::None,
                input_points: points.len(),
                output_points: points.len(),
                input_minimum: extrema.0,
                input_maximum: extrema.1,
            },
        ));
    }

    let mut required = BTreeSet::from([0, points.len() - 1]);
    if let Some(index) = extrema_index(points, true) {
        required.insert(index);
    }
    if let Some(index) = extrema_index(points, false) {
        required.insert(index);
    }
    let denominator = maximum - 1;
    for slot in 0..maximum {
        required.insert(slot.saturating_mul(points.len() - 1) / denominator);
    }
    while required.len() > maximum {
        let removable = required
            .iter()
            .copied()
            .find(|index| !is_extrema_or_endpoint(points, *index));
        let Some(removable) = removable else {
            break;
        };
        required.remove(&removable);
    }
    let selected = required
        .into_iter()
        .take(maximum)
        .map(|index| points[index].clone())
        .collect::<Vec<_>>();
    Ok((
        selected.clone(),
        ChartDownsample {
            method: ChartDownsampleMethod::ExtremaStrideV1,
            input_points: points.len(),
            output_points: selected.len(),
            input_minimum: extrema.0,
            input_maximum: extrema.1,
        },
    ))
}

/// Enforces the ten shared BR-EX-64 honesty rules over a whole overlay batch.
///
/// # Errors
///
/// Returns a chart-rule error for invalid metadata, bounds, ordering, gaps,
/// totals, marker identity, currency partitioning or overlay lineage.
pub fn validate_chart_batch(series: &[ChartSeries]) -> Result<(), AnalyticsError> {
    if series.is_empty() || series.len() > MAX_CHART_SERIES {
        return Err(AnalyticsError::ChartRule("series_count"));
    }
    let overlay_digests = series
        .iter()
        .filter_map(|item| item.join_digest.as_deref())
        .collect::<BTreeSet<_>>();
    if overlay_digests.len() > 1 {
        return Err(AnalyticsError::ChartRule("overlay_join_digest"));
    }
    let mut ids = BTreeSet::new();
    for item in series {
        validate_chart(item)?;
        if !ids.insert(item.series_id.as_str()) {
            return Err(AnalyticsError::ChartRule("duplicate_series_id"));
        }
    }
    Ok(())
}

fn validate_chart(series: &ChartSeries) -> Result<(), AnalyticsError> {
    if series.schema_version != "chart-series.rules.v1"
        || series.series_id.is_empty()
        || series.series_id.len() > 128
        || series.formula_version.is_empty()
        || series.formula_version.len() > 128
        || series.points.len() > MAX_SERIES_POINTS
        || series.markers.len() > MAX_CHART_MARKERS
        || series.downsample.output_points != series.points.len()
        || series.downsample.input_points < series.downsample.output_points
    {
        return Err(AnalyticsError::ChartRule("metadata_or_bounds"));
    }
    if series.currency.is_some() && !matches!(series.unit, ChartUnit::Money | ChartUnit::Price) {
        return Err(AnalyticsError::ChartRule("currency_partition"));
    }
    if series.kind == ChartSeriesKind::Candlestick
        && series.ohlc_owner != Some(SourceAuthority::Execution)
    {
        return Err(AnalyticsError::ChartRule("ohlc_owner"));
    }
    if series.kind != ChartSeriesKind::Candlestick && series.ohlc_owner.is_some() {
        return Err(AnalyticsError::ChartRule("unexpected_ohlc_owner"));
    }
    if series
        .join_digest
        .as_deref()
        .is_some_and(|value| !valid_digest(value))
    {
        return Err(AnalyticsError::ChartRule("join_digest"));
    }
    for pair in series.points.windows(2) {
        if pair[0].timestamp >= pair[1].timestamp {
            return Err(AnalyticsError::ChartRule("point_order"));
        }
    }
    for gap in &series.gaps {
        if gap.from >= gap.to {
            return Err(AnalyticsError::ChartRule("gap_order"));
        }
    }
    for point in series.points.iter().filter(|point| point.value.is_none()) {
        if !series
            .gaps
            .iter()
            .any(|gap| point.timestamp >= gap.from && point.timestamp <= gap.to)
        {
            return Err(AnalyticsError::ChartRule("implicit_gap"));
        }
    }
    for annotation in &series.annotations {
        if annotation.label.is_empty()
            || annotation.label.len() > 160
            || !series.points.iter().any(|point| {
                point.timestamp == annotation.timestamp && point.value == Some(annotation.value)
            })
        {
            return Err(AnalyticsError::ChartRule("annotation_value"));
        }
    }
    for marker in &series.markers {
        if marker.marker_type.is_empty()
            || marker.marker_type.len() > 64
            || marker.journal_id.is_empty()
            || marker.journal_id.len() > 128
        {
            return Err(AnalyticsError::ChartRule("marker_journal_id"));
        }
    }
    if let Some(declared) = series.declared_total {
        let sum = series
            .points
            .iter()
            .filter_map(|point| point.value)
            .try_fold(Decimal::ZERO, |total, value| {
                total
                    .checked_add(value.value())
                    .ok_or(AnalyticsError::DecimalOverflow)
            })?;
        if declared.value() != sum {
            return Err(AnalyticsError::ChartRule("declared_total"));
        }
    }
    let extrema = extrema(&series.points);
    if series.downsample.input_minimum != extrema.0 || series.downsample.input_maximum != extrema.1
    {
        return Err(AnalyticsError::ChartRule("extrema_provenance"));
    }
    Ok(())
}

fn extrema(points: &[ChartPoint]) -> (Option<DecimalString>, Option<DecimalString>) {
    let mut values = points.iter().filter_map(|point| point.value);
    let Some(first) = values.next() else {
        return (None, None);
    };
    let (minimum, maximum) = values.fold((first, first), |(minimum, maximum), value| {
        (
            if value.value() < minimum.value() {
                value
            } else {
                minimum
            },
            if value.value() > maximum.value() {
                value
            } else {
                maximum
            },
        )
    });
    (Some(minimum), Some(maximum))
}

fn extrema_index(points: &[ChartPoint], minimum: bool) -> Option<usize> {
    points
        .iter()
        .enumerate()
        .filter_map(|(index, point)| point.value.map(|value| (index, value.value())))
        .min_by(|left, right| {
            let ordering = left.1.cmp(&right.1);
            if minimum {
                ordering
            } else {
                ordering.reverse()
            }
        })
        .map(|(index, _)| index)
}

fn is_extrema_or_endpoint(points: &[ChartPoint], index: usize) -> bool {
    index == 0
        || index + 1 == points.len()
        || extrema_index(points, true) == Some(index)
        || extrema_index(points, false) == Some(index)
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix(DIGEST_PREFIX).is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_780_000_000 + second, 0).unwrap()
    }

    fn point(second: i64, value: &str) -> ChartPoint {
        ChartPoint {
            timestamp: at(second),
            value: Some(DecimalString::parse(value).unwrap()),
        }
    }

    fn valid_series(points: Vec<ChartPoint>, downsample: ChartDownsample) -> ChartSeries {
        ChartSeries {
            schema_version: "chart-series.rules.v1".to_owned(),
            series_id: "paper-equity".to_owned(),
            kind: ChartSeriesKind::Line,
            unit: ChartUnit::Money,
            currency: Some("USDT".to_owned()),
            authority: SourceAuthority::Derived,
            as_of: at(20_000),
            formula_version: "equity_projection.v1".to_owned(),
            completeness: PopulationCompleteness::Complete,
            join_digest: Some(format!("sha256:{}", "a".repeat(64))),
            ohlc_owner: None,
            points,
            gaps: Vec::new(),
            markers: Vec::new(),
            annotations: Vec::new(),
            declared_total: None,
            downsample,
        }
    }

    #[test]
    fn extrema_downsampling_is_deterministic_bounded_and_preserves_global_extrema() {
        let points = (0..20_000)
            .map(|index| {
                point(
                    index,
                    &if index == 12_345 {
                        "-999".to_owned()
                    } else {
                        index.to_string()
                    },
                )
            })
            .collect::<Vec<_>>();
        let (first, metadata) = downsample_extrema(&points, 5_000).unwrap();
        let (second, _) = downsample_extrema(&points, 5_000).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 5_000);
        assert!(first
            .iter()
            .any(|item| item.value.unwrap().to_string() == "-999"));
        let series = valid_series(first, metadata);
        validate_chart_batch(&[series]).unwrap();
    }

    #[test]
    fn chart_rules_reject_implicit_gaps_wrong_totals_and_marker_without_journal_id() {
        let points = vec![
            point(0, "1"),
            ChartPoint {
                timestamp: at(1),
                value: None,
            },
        ];
        let (_, metadata) = downsample_extrema(&points, 4).unwrap();
        let mut series = valid_series(points, metadata);
        assert_eq!(
            validate_chart_batch(&[series.clone()]),
            Err(AnalyticsError::ChartRule("implicit_gap"))
        );
        series.gaps.push(ChartGap {
            from: at(1),
            to: at(2),
            reason: ChartGapReason::SourceGap,
        });
        series.declared_total = Some(DecimalString::parse("2").unwrap());
        assert_eq!(
            validate_chart_batch(&[series.clone()]),
            Err(AnalyticsError::ChartRule("declared_total"))
        );
        series.declared_total = Some(DecimalString::parse("1").unwrap());
        series.markers.push(ChartMarker {
            timestamp: at(0),
            marker_type: "ENTRY_FILL".to_owned(),
            journal_id: String::new(),
        });
        assert_eq!(
            validate_chart_batch(&[series]),
            Err(AnalyticsError::ChartRule("marker_journal_id"))
        );
    }
}
