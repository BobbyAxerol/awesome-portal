use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use execution_contracts::{
    CanonicalId, DecimalString, FreshnessState, PanelState, SourceAuthority,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::series::enforce_response_size;
use crate::types::{AnalyticsError, PopulationCompleteness};

pub const MAX_INSIGHT_TILES: usize = 12;
pub const MAX_INSIGHT_SERIES_ITEMS: usize = 5_000;
pub const MAX_HEATMAP_CELLS: usize = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TileKind {
    Line,
    Histogram,
    Funnel,
    Waterfall,
    Heatmap,
    Bar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InsightTileState {
    Ready,
    InsufficientData,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LinePoint {
    pub bucket_start: DateTime<Utc>,
    pub value: Option<DecimalString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistogramBin {
    pub lower: DecimalString,
    pub upper: DecimalString,
    pub count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunnelStageSeries {
    pub stage: String,
    pub count: u64,
    pub conversion: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WaterfallInputStep {
    pub label: String,
    pub delta: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WaterfallStep {
    pub label: String,
    pub start: DecimalString,
    pub delta: DecimalString,
    pub end: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HeatmapCell {
    pub x: String,
    pub y: String,
    pub value: DecimalString,
    pub sample_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BarPoint {
    pub label: String,
    pub value: DecimalString,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "points", rename_all = "snake_case")]
pub enum InsightSeries {
    Line(Vec<LinePoint>),
    Histogram(Vec<HistogramBin>),
    Funnel(Vec<FunnelStageSeries>),
    Waterfall(Vec<WaterfallStep>),
    Heatmap(Vec<HeatmapCell>),
    Bar(Vec<BarPoint>),
}

impl InsightSeries {
    #[must_use]
    pub const fn kind(&self) -> TileKind {
        match self {
            Self::Line(_) => TileKind::Line,
            Self::Histogram(_) => TileKind::Histogram,
            Self::Funnel(_) => TileKind::Funnel,
            Self::Waterfall(_) => TileKind::Waterfall,
            Self::Heatmap(_) => TileKind::Heatmap,
            Self::Bar(_) => TileKind::Bar,
        }
    }

    fn len(&self) -> usize {
        match self {
            Self::Line(values) => values.len(),
            Self::Histogram(values) => values.len(),
            Self::Funnel(values) => values.len(),
            Self::Waterfall(values) => values.len(),
            Self::Heatmap(values) => values.len(),
            Self::Bar(values) => values.len(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InsightTileInput {
    pub tile_id: CanonicalId,
    pub title: String,
    pub tile_kind: TileKind,
    pub formula_version: String,
    pub authority: SourceAuthority,
    pub freshness: FreshnessState,
    pub completeness: PopulationCompleteness,
    pub as_of: Option<DateTime<Utc>>,
    pub minimum_samples: u64,
    pub observed_samples: u64,
    pub series: Option<InsightSeries>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightTile {
    pub tile_id: CanonicalId,
    pub title: String,
    pub tile_kind: TileKind,
    pub formula_version: String,
    pub authority: SourceAuthority,
    pub freshness: FreshnessState,
    pub completeness: PopulationCompleteness,
    pub as_of: Option<DateTime<Utc>>,
    pub minimum_samples: u64,
    pub observed_samples: u64,
    pub state: InsightTileState,
    pub series: Option<InsightSeries>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightTileBatch {
    pub schema_version: String,
    pub runtime_active: bool,
    pub source_side_effect_requested: bool,
    pub subject_id: CanonicalId,
    pub panel_state: PanelState,
    pub returned_tiles: usize,
    pub total_series_items: usize,
    pub tiles: Vec<InsightTile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileDefinition {
    pub tile_id: String,
    pub title: String,
    pub tile_kind: TileKind,
    pub formula_version: String,
    pub minimum_samples: u64,
}

/// Validates and publishes at most twelve semantic insight tiles.
///
/// # Errors
///
/// Rejects duplicate IDs, kind/series mismatches, invalid exact-decimal series,
/// sample-state lies, unbounded item counts and responses larger than 2 MiB.
pub fn build_insight_tile_batch(
    subject_id: CanonicalId,
    inputs: Vec<InsightTileInput>,
) -> Result<InsightTileBatch, AnalyticsError> {
    if inputs.len() > MAX_INSIGHT_TILES {
        return Err(AnalyticsError::BatchLimit {
            actual: inputs.len(),
            maximum: MAX_INSIGHT_TILES,
        });
    }
    let mut ids = BTreeSet::new();
    let mut total_series_items = 0usize;
    let mut tiles = Vec::with_capacity(inputs.len());
    for input in inputs {
        if !ids.insert(input.tile_id.as_str().to_owned()) {
            return Err(AnalyticsError::DuplicateIdentifier(
                input.tile_id.as_str().to_owned(),
            ));
        }
        let state = if input.observed_samples < input.minimum_samples {
            if input.series.is_some() {
                return Err(AnalyticsError::InvalidTileSampleState);
            }
            InsightTileState::InsufficientData
        } else {
            let series = input
                .series
                .as_ref()
                .ok_or(AnalyticsError::InvalidTileSampleState)?;
            if series.kind() != input.tile_kind {
                return Err(AnalyticsError::InvalidTileSeries("kind_mismatch"));
            }
            validate_series(series)?;
            total_series_items = total_series_items
                .checked_add(series.len())
                .ok_or(AnalyticsError::DecimalOverflow)?;
            InsightTileState::Ready
        };
        if total_series_items > MAX_INSIGHT_SERIES_ITEMS {
            return Err(AnalyticsError::SeriesPointLimit {
                actual: total_series_items,
                maximum: MAX_INSIGHT_SERIES_ITEMS,
            });
        }
        tiles.push(InsightTile {
            tile_id: input.tile_id,
            title: input.title,
            tile_kind: input.tile_kind,
            formula_version: input.formula_version,
            authority: input.authority,
            freshness: input.freshness,
            completeness: input.completeness,
            as_of: input.as_of,
            minimum_samples: input.minimum_samples,
            observed_samples: input.observed_samples,
            state,
            series: input.series,
        });
    }
    let panel_state = if tiles.is_empty() {
        PanelState::Empty
    } else if tiles
        .iter()
        .all(|tile| tile.state == InsightTileState::Ready)
    {
        PanelState::Ok
    } else {
        PanelState::Partial
    };
    let batch = InsightTileBatch {
        schema_version: "execution.analytics.insight-series.v1".to_owned(),
        runtime_active: false,
        source_side_effect_requested: false,
        subject_id,
        panel_state,
        returned_tiles: tiles.len(),
        total_series_items,
        tiles,
    };
    enforce_response_size(&batch)?;
    Ok(batch)
}

fn validate_series(series: &InsightSeries) -> Result<(), AnalyticsError> {
    match series {
        InsightSeries::Line(points) => {
            ordered_unique(points.iter().map(|point| point.bucket_start), "line")?;
        }
        InsightSeries::Histogram(bins) => {
            let mut previous_upper = None;
            for bin in bins {
                if bin.lower >= bin.upper || previous_upper.is_some_and(|upper| upper > bin.lower) {
                    return Err(AnalyticsError::InvalidTileSeries("histogram"));
                }
                previous_upper = Some(bin.upper);
            }
        }
        InsightSeries::Funnel(stages) => {
            let mut previous = None;
            for stage in stages {
                if stage.stage.trim().is_empty()
                    || previous.is_some_and(|count| count < stage.count)
                {
                    return Err(AnalyticsError::InvalidTileSeries("funnel"));
                }
                let expected = match previous {
                    Some(0) => Decimal::ZERO,
                    Some(value) => Decimal::from(stage.count)
                        .checked_div(Decimal::from(value))
                        .ok_or(AnalyticsError::DecimalOverflow)?,
                    None => Decimal::ONE,
                };
                if stage.conversion.value() != expected {
                    return Err(AnalyticsError::InvalidTileSeries("funnel_conversion"));
                }
                previous = Some(stage.count);
            }
        }
        InsightSeries::Waterfall(steps) => {
            let mut previous_end = None;
            for step in steps {
                if step.label.trim().is_empty()
                    || previous_end.is_some_and(|value| value != step.start.value())
                    || step.start.value().checked_add(step.delta.value()) != Some(step.end.value())
                {
                    return Err(AnalyticsError::InvalidTileSeries("waterfall"));
                }
                previous_end = Some(step.end.value());
            }
        }
        InsightSeries::Heatmap(cells) => {
            if cells.len() > MAX_HEATMAP_CELLS {
                return Err(AnalyticsError::SeriesPointLimit {
                    actual: cells.len(),
                    maximum: MAX_HEATMAP_CELLS,
                });
            }
            let mut keys = BTreeSet::new();
            if cells.iter().any(|cell| {
                cell.x.trim().is_empty()
                    || cell.y.trim().is_empty()
                    || !keys.insert((cell.x.as_str(), cell.y.as_str()))
            }) {
                return Err(AnalyticsError::InvalidTileSeries("heatmap"));
            }
        }
        InsightSeries::Bar(points) => {
            let mut labels = BTreeSet::new();
            if points
                .iter()
                .any(|point| point.label.trim().is_empty() || !labels.insert(point.label.as_str()))
            {
                return Err(AnalyticsError::InvalidTileSeries("bar"));
            }
        }
    }
    Ok(())
}

fn ordered_unique(
    values: impl IntoIterator<Item = DateTime<Utc>>,
    field: &'static str,
) -> Result<(), AnalyticsError> {
    let mut previous = None;
    for value in values {
        if previous.is_some_and(|prior| prior >= value) {
            return Err(AnalyticsError::InvalidTileSeries(field));
        }
        previous = Some(value);
    }
    Ok(())
}

#[must_use]
pub fn alpha_360_tile_catalogue() -> Vec<TileDefinition> {
    [
        (
            "equity-by-stage",
            "Equity by stage",
            TileKind::Line,
            "equity_by_stage.v1",
        ),
        (
            "drawdown-underwater",
            "Drawdown & underwater",
            TileKind::Line,
            "drawdown.v1",
        ),
        (
            "rolling-correlation",
            "Rolling corr vs benchmark",
            TileKind::Line,
            "rolling_corr.v1",
        ),
        (
            "venue-contribution",
            "Venue contribution",
            TileKind::Bar,
            "venue_contribution.v1",
        ),
        (
            "execution-quality",
            "Execution quality by venue",
            TileKind::Histogram,
            "execution_quality.v1",
        ),
        (
            "order-funnel",
            "Order funnel",
            TileKind::Funnel,
            "order_funnel.v1",
        ),
        (
            "trade-return-histogram",
            "Trade return histogram",
            TileKind::Histogram,
            "trade_return_histogram.v1",
        ),
        (
            "execution-density",
            "Execution density day x hour",
            TileKind::Heatmap,
            "execution_density.v1",
        ),
        (
            "regime-equity",
            "Regime-shaded equity",
            TileKind::Line,
            "regime_equity.v1",
        ),
        (
            "paper-live-drift",
            "Paper vs Live drift",
            TileKind::Line,
            "paper_live_drift.v1",
        ),
        (
            "risk-utilization",
            "Risk utilization",
            TileKind::Bar,
            "risk_utilization.v1",
        ),
        (
            "cost-drag",
            "Cost drag waterfall",
            TileKind::Waterfall,
            "cost_drag.v1",
        ),
    ]
    .into_iter()
    .map(
        |(tile_id, title, tile_kind, formula_version)| TileDefinition {
            tile_id: tile_id.to_owned(),
            title: title.to_owned(),
            tile_kind,
            formula_version: formula_version.to_owned(),
            minimum_samples: 30,
        },
    )
    .collect()
}

#[cfg(test)]
mod tests {
    use chrono::TimeDelta;

    use super::*;
    use crate::MAX_INSIGHT_PREVIEW_ITEMS;

    fn at(hours: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_777_737_600, 0).unwrap() + TimeDelta::hours(hours)
    }

    fn tile(kind: TileKind, series: InsightSeries) -> InsightTileInput {
        InsightTileInput {
            tile_id: CanonicalId::parse(format!("tile-{kind:?}")).unwrap(),
            title: format!("{kind:?}"),
            tile_kind: kind,
            formula_version: "fixture.v1".to_owned(),
            authority: SourceAuthority::Derived,
            freshness: FreshnessState::Ok,
            completeness: PopulationCompleteness::Complete,
            as_of: Some(at(1)),
            minimum_samples: 1,
            observed_samples: 10,
            series: Some(series),
        }
    }

    #[test]
    fn validates_all_six_semantic_kinds_and_exact_math() {
        let tiles = vec![
            tile(
                TileKind::Line,
                InsightSeries::Line(vec![LinePoint {
                    bucket_start: at(0),
                    value: Some(DecimalString::parse("1.000000000000000001").unwrap()),
                }]),
            ),
            tile(
                TileKind::Histogram,
                InsightSeries::Histogram(vec![HistogramBin {
                    lower: DecimalString::parse("-1").unwrap(),
                    upper: DecimalString::parse("0").unwrap(),
                    count: 4,
                }]),
            ),
            tile(
                TileKind::Funnel,
                InsightSeries::Funnel(vec![
                    FunnelStageSeries {
                        stage: "submitted".to_owned(),
                        count: 4,
                        conversion: DecimalString::parse("1").unwrap(),
                    },
                    FunnelStageSeries {
                        stage: "filled".to_owned(),
                        count: 1,
                        conversion: DecimalString::parse("0.25").unwrap(),
                    },
                ]),
            ),
            tile(
                TileKind::Waterfall,
                InsightSeries::Waterfall(vec![WaterfallStep {
                    label: "fees".to_owned(),
                    start: DecimalString::parse("10.000000000000000001").unwrap(),
                    delta: DecimalString::parse("-0.000000000000000001").unwrap(),
                    end: DecimalString::parse("10").unwrap(),
                }]),
            ),
            tile(
                TileKind::Heatmap,
                InsightSeries::Heatmap(vec![HeatmapCell {
                    x: "Mon".to_owned(),
                    y: "10".to_owned(),
                    value: DecimalString::parse("2").unwrap(),
                    sample_count: 2,
                }]),
            ),
            tile(
                TileKind::Bar,
                InsightSeries::Bar(vec![BarPoint {
                    label: "BINANCE".to_owned(),
                    value: DecimalString::parse("2.50").unwrap(),
                    currency: Some("USDT".to_owned()),
                }]),
            ),
        ];
        let output =
            build_insight_tile_batch(CanonicalId::parse("alpha_1").unwrap(), tiles).unwrap();
        assert_eq!(output.returned_tiles, 6);
        assert_eq!(output.total_series_items, 7);
        assert_eq!(output.panel_state, PanelState::Ok);
    }

    #[test]
    fn rejects_kind_mismatch_and_untruthful_sample_state() {
        let mismatch = tile(TileKind::Line, InsightSeries::Bar(vec![]));
        assert_eq!(
            build_insight_tile_batch(CanonicalId::parse("alpha_1").unwrap(), vec![mismatch]),
            Err(AnalyticsError::InvalidTileSeries("kind_mismatch"))
        );

        let mut insufficient = tile(TileKind::Bar, InsightSeries::Bar(vec![]));
        insufficient.minimum_samples = 11;
        assert_eq!(
            build_insight_tile_batch(CanonicalId::parse("alpha_1").unwrap(), vec![insufficient]),
            Err(AnalyticsError::InvalidTileSampleState)
        );
    }

    #[test]
    fn publishes_canonical_twelve_tile_semantics() {
        let catalogue = alpha_360_tile_catalogue();
        assert_eq!(catalogue.len(), MAX_INSIGHT_TILES);
        assert_eq!(catalogue[5].tile_kind, TileKind::Funnel);
        assert_eq!(catalogue[7].tile_kind, TileKind::Heatmap);
        assert_eq!(catalogue[11].tile_kind, TileKind::Waterfall);
        assert_eq!(MAX_INSIGHT_PREVIEW_ITEMS, 64);
    }

    #[test]
    fn all_six_canonical_openapi_fixtures_deserialize_through_rust() {
        let fixtures = [
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-line.valid.json"
            ),
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-histogram.valid.json"
            ),
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-funnel.valid.json"
            ),
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-waterfall.valid.json"
            ),
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-heatmap.valid.json"
            ),
            include_str!(
                "../../../../../packages/contracts/fixtures/execution-analytics.insight-bar.valid.json"
            ),
        ];
        let expected = [
            TileKind::Line,
            TileKind::Histogram,
            TileKind::Funnel,
            TileKind::Waterfall,
            TileKind::Heatmap,
            TileKind::Bar,
        ];

        for (source, expected_kind) in fixtures.into_iter().zip(expected) {
            let fixture: InsightTileBatch = serde_json::from_str(source).unwrap();
            assert_eq!(fixture.returned_tiles, 1);
            assert_eq!(fixture.tiles[0].tile_kind, expected_kind);
            assert_eq!(
                fixture.tiles[0].series.as_ref().unwrap().kind(),
                expected_kind
            );
            assert!(!fixture.runtime_active);
            assert!(!fixture.source_side_effect_requested);
        }
    }
}
