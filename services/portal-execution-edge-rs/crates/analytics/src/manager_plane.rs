use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use execution_contracts::{DecimalString, SourceAuthority};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    build_drawdown_overlap, downsample_extrema, validate_chart_batch, AnalyticsError,
    ChartDownsample, ChartDownsampleMethod, ChartMarker, ChartPoint, ChartSeries, ChartSeriesKind,
    ChartUnit, DrawdownInput, DrawdownOverlap, NavPoint, PopulationCompleteness,
};

const MAX_MANAGER_ANALYTICS_FACTS: usize = 20_000;
const MAX_REPLAY_LOG_ROWS: usize = 200;
const MAX_POSITIONS: usize = 500;
const MAX_CURRENCY_PARTITIONS: usize = 64;
const MAX_CORRELATION_ALPHAS: usize = 20;
type DailyDecimalSnapshots = BTreeMap<chrono::NaiveDate, (DateTime<Utc>, Decimal)>;
type StrategyCurrencySnapshots = BTreeMap<(String, String), DailyDecimalSnapshots>;
type AlphaDailySnapshots = BTreeMap<String, DailyDecimalSnapshots>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AnalyticsCapabilityState {
    Available,
    Empty,
    Partial,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalyticsCapability {
    pub capability_id: String,
    pub state: AnalyticsCapabilityState,
    pub authority: SourceAuthority,
    pub formula_version: Option<String>,
    pub source_relations: Vec<String>,
    pub reason_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerQueryAnalyticsFact {
    pub entity_id: String,
    pub relation: String,
    pub as_of: DateTime<Utc>,
    pub fields: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagerQueryAnalyticsInput {
    pub subject_kind: String,
    pub subject_id: String,
    pub environment: String,
    pub profile_id: String,
    pub as_of: DateTime<Utc>,
    pub projection_state_digest: String,
    pub completeness: PopulationCompleteness,
    pub facts: Vec<ManagerQueryAnalyticsFact>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExactCurrencyPartition {
    pub relation: String,
    pub currency: Option<String>,
    pub row_count: u64,
    pub quantity_count: u64,
    pub quantity: DecimalString,
    pub notional_count: u64,
    pub notional: DecimalString,
    pub realized_pnl_count: u64,
    pub realized_pnl: DecimalString,
    pub invalid_numeric_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagerCorrelationPair {
    pub left_alpha_id: String,
    pub right_alpha_id: String,
    pub coefficient: DecimalString,
    pub sample_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagerCorrelation {
    pub formula_version: String,
    pub state: AnalyticsCapabilityState,
    pub reason_code: Option<String>,
    pub alpha_ids: Vec<String>,
    pub pairs: Vec<ManagerCorrelationPair>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderFunnelSummary {
    pub formula_version: String,
    pub total_orders: u64,
    pub status_counts: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionQualitySummary {
    pub formula_version: String,
    pub submitted_count: u64,
    pub risk_rejected_count: u64,
    pub broker_rejected_count: u64,
    pub filled_count: u64,
    pub reject_rate: Option<DecimalString>,
    pub latency_state: AnalyticsCapabilityState,
    pub latency_reason_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplayLogRow {
    pub timestamp: DateTime<Utc>,
    pub journal_id: String,
    pub event_type: String,
    pub order_id: Option<String>,
    pub fill_id: Option<String>,
    pub price: Option<DecimalString>,
    pub quantity: Option<DecimalString>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReplaySummary {
    pub state: AnalyticsCapabilityState,
    pub reason_code: Option<String>,
    pub markers: Vec<ChartMarker>,
    pub trade_log: Vec<ReplayLogRow>,
    pub candles_state: AnalyticsCapabilityState,
    pub candles_reason_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManagerQueryAnalytics {
    pub schema_version: String,
    pub formula_version: String,
    pub subject_kind: String,
    pub subject_id: String,
    pub environment: String,
    pub profile_id: String,
    pub authority: SourceAuthority,
    pub derived_authority: SourceAuthority,
    pub as_of: DateTime<Utc>,
    pub completeness: PopulationCompleteness,
    pub projection_state_digest: String,
    pub source_fact_count: usize,
    pub capabilities: Vec<AnalyticsCapability>,
    pub exact_currency_partitions: Vec<ExactCurrencyPartition>,
    pub order_funnel: OrderFunnelSummary,
    pub execution_quality: ExecutionQualitySummary,
    pub chart_series: Vec<ChartSeries>,
    pub replay: ReplaySummary,
    pub drawdown_overlap: Option<DrawdownOverlap>,
    pub correlation: ManagerCorrelation,
    pub positions: Vec<serde_json::Value>,
}

/// Builds the complete currently-derivable N25 analytics surface from one
/// immutable Manager projection snapshot. Unsupported source semantics remain
/// typed unavailable; no values are fabricated or inferred by the browser.
///
/// # Errors
///
/// Returns a typed analytics error when input bounds, exact-decimal values,
/// identifiers, chart rules or source-series semantics are invalid.
#[allow(clippy::too_many_lines)] // one constructor keeps the canonical capability matrix auditable
pub fn build_manager_query_analytics(
    input: &ManagerQueryAnalyticsInput,
) -> Result<ManagerQueryAnalytics, AnalyticsError> {
    if input.facts.len() > MAX_MANAGER_ANALYTICS_FACTS
        || input.subject_id.is_empty()
        || input.subject_kind.is_empty()
        || !valid_digest(&input.projection_state_digest)
    {
        return Err(AnalyticsError::RiskSeries("manager_analytics_input"));
    }
    let partitions = exact_partitions(&input.facts)?;
    let funnel = order_funnel(&input.facts)?;
    let quality = execution_quality(&input.facts)?;
    let mut chart_series = equity_and_contribution_series(input)?;
    if !chart_series.is_empty() {
        validate_chart_batch(&chart_series)?;
    }
    chart_series.sort_by(|left, right| left.series_id.cmp(&right.series_id));
    let replay = replay(&input.facts)?;
    let drawdown_overlap = drawdown_overlap(&input.facts)?;
    let correlation = manager_correlation(&input.facts)?;
    let positions = input
        .facts
        .iter()
        .filter(|fact| fact.relation == "public.positions_v2")
        .take(MAX_POSITIONS)
        .map(|fact| fact.fields.clone())
        .collect::<Vec<_>>();

    let equity_state = if chart_series.is_empty() {
        AnalyticsCapabilityState::Empty
    } else {
        AnalyticsCapabilityState::Available
    };
    let overlap_state = if drawdown_overlap.is_some() {
        AnalyticsCapabilityState::Available
    } else {
        AnalyticsCapabilityState::Unavailable
    };
    let contribution_state = if chart_series
        .iter()
        .any(|series| series.series_id.starts_with("daily-contribution:"))
    {
        AnalyticsCapabilityState::Available
    } else {
        AnalyticsCapabilityState::Empty
    };
    let exposure_state = if partitions
        .iter()
        .any(|partition| partition.relation == "public.positions_v2")
    {
        AnalyticsCapabilityState::Available
    } else {
        AnalyticsCapabilityState::Empty
    };
    let capabilities = vec![
        capability(
            "exact-query",
            AnalyticsCapabilityState::Available,
            SourceAuthority::Derived,
            Some("exact_aggregate.v1"),
            &["public.orders", "public.fills", "public.positions_v2"],
            None,
        ),
        capability(
            "position-exposure",
            exposure_state,
            SourceAuthority::Derived,
            Some("position_exposure.v1"),
            &["public.positions_v2"],
            None,
        ),
        capability(
            "stage-equity",
            equity_state,
            SourceAuthority::Derived,
            Some("equity_projection.v1"),
            &[
                "public.performance_snapshots",
                "public.account_equity_snapshots",
                "public.portfolio_equity_snapshots",
            ],
            None,
        ),
        capability(
            "execution-quality",
            AnalyticsCapabilityState::Available,
            SourceAuthority::Derived,
            Some("execution_quality.v1"),
            &["public.execution_sessions"],
            None,
        ),
        capability(
            "contribution",
            contribution_state,
            SourceAuthority::Derived,
            Some("contribution.v1"),
            &["public.performance_snapshots"],
            None,
        ),
        capability(
            "order-funnel",
            if funnel.total_orders == 0 {
                AnalyticsCapabilityState::Empty
            } else {
                AnalyticsCapabilityState::Available
            },
            SourceAuthority::Derived,
            Some("order_funnel.v1"),
            &["public.orders"],
            None,
        ),
        capability(
            "replay-journal",
            replay.state,
            SourceAuthority::Execution,
            Some("replay.v1"),
            &["public.orders", "public.fills", "public.domain_events"],
            replay.reason_code.as_deref(),
        ),
        capability(
            "market-candles",
            AnalyticsCapabilityState::Unavailable,
            SourceAuthority::Execution,
            None,
            &[],
            Some("N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED"),
        ),
        capability(
            "portfolio-drawdown-overlap",
            overlap_state,
            SourceAuthority::Derived,
            Some("drawdown_overlap.v1"),
            &["public.performance_snapshots"],
            overlap_state
                .eq(&AnalyticsCapabilityState::Unavailable)
                .then_some("N25_INSUFFICIENT_MULTI_ALPHA_HISTORY"),
        ),
        capability(
            "portfolio-correlation",
            correlation.state,
            SourceAuthority::Derived,
            Some("portfolio-correlation-returns.v1"),
            &["public.performance_snapshots"],
            correlation.reason_code.as_deref(),
        ),
        capability(
            "portfolio-rho-timeline",
            AnalyticsCapabilityState::Unavailable,
            SourceAuthority::Derived,
            Some("corr.v1"),
            &["public.portfolio_equity_snapshots"],
            Some("N28_BENCHMARK_SERIES_SOURCE_NOT_ACTIVATED"),
        ),
        capability(
            "canary-drift",
            AnalyticsCapabilityState::Unavailable,
            SourceAuthority::Derived,
            Some("drift.v1"),
            &[],
            Some("N28_TWIN_PROFILE_JOIN_NOT_ACTIVATED"),
        ),
    ];

    Ok(ManagerQueryAnalytics {
        schema_version: "execution.query-analytics.v1".to_owned(),
        formula_version: "manager-query-analytics.v1".to_owned(),
        subject_kind: input.subject_kind.clone(),
        subject_id: input.subject_id.clone(),
        environment: input.environment.clone(),
        profile_id: input.profile_id.clone(),
        authority: SourceAuthority::Execution,
        derived_authority: SourceAuthority::Derived,
        as_of: input.as_of,
        completeness: input.completeness,
        projection_state_digest: input.projection_state_digest.clone(),
        source_fact_count: input.facts.len(),
        capabilities,
        exact_currency_partitions: partitions,
        order_funnel: funnel,
        execution_quality: quality,
        chart_series,
        replay,
        drawdown_overlap,
        correlation,
        positions,
    })
}

fn exact_partitions(
    facts: &[ManagerQueryAnalyticsFact],
) -> Result<Vec<ExactCurrencyPartition>, AnalyticsError> {
    #[derive(Default)]
    struct Partition {
        rows: u64,
        quantity_count: u64,
        quantity: Decimal,
        notional_count: u64,
        notional: Decimal,
        realized_count: u64,
        realized: Decimal,
        invalid: u64,
    }
    let mut partitions: BTreeMap<(String, Option<String>), Partition> = BTreeMap::new();
    for fact in facts {
        if !["quantity", "notional", "realized_pnl"]
            .iter()
            .any(|field| fact.fields.get(*field).is_some())
        {
            continue;
        }
        let currency =
            text(&fact.fields, "currency").or_else(|| text(&fact.fields, "commission_currency"));
        if currency
            .as_deref()
            .is_some_and(|value| !valid_currency(value))
        {
            return Err(AnalyticsError::RiskSeries("currency_partition"));
        }
        let partition = partitions
            .entry((fact.relation.clone(), currency))
            .or_default();
        partition.rows = checked_count(partition.rows)?;
        accumulate_exact(
            &fact.fields,
            "quantity",
            &mut partition.quantity_count,
            &mut partition.quantity,
            &mut partition.invalid,
        )?;
        accumulate_exact(
            &fact.fields,
            "notional",
            &mut partition.notional_count,
            &mut partition.notional,
            &mut partition.invalid,
        )?;
        accumulate_exact(
            &fact.fields,
            "realized_pnl",
            &mut partition.realized_count,
            &mut partition.realized,
            &mut partition.invalid,
        )?;
    }
    if partitions.len() > MAX_CURRENCY_PARTITIONS {
        return Err(AnalyticsError::RiskSeries("currency_partition_bound"));
    }
    Ok(partitions
        .into_iter()
        .map(|((relation, currency), value)| ExactCurrencyPartition {
            relation,
            currency,
            row_count: value.rows,
            quantity_count: value.quantity_count,
            quantity: DecimalString::from_decimal(value.quantity),
            notional_count: value.notional_count,
            notional: DecimalString::from_decimal(value.notional),
            realized_pnl_count: value.realized_count,
            realized_pnl: DecimalString::from_decimal(value.realized),
            invalid_numeric_count: value.invalid,
        })
        .collect())
}

fn order_funnel(facts: &[ManagerQueryAnalyticsFact]) -> Result<OrderFunnelSummary, AnalyticsError> {
    let mut counts = BTreeMap::new();
    let mut total = 0_u64;
    for fact in facts.iter().filter(|fact| fact.relation == "public.orders") {
        let status = text(&fact.fields, "status").unwrap_or_else(|| "UNKNOWN".to_owned());
        total = checked_count(total)?;
        let count = counts.entry(status).or_insert(0_u64);
        *count = checked_count(*count)?;
    }
    Ok(OrderFunnelSummary {
        formula_version: "order_funnel.v1".to_owned(),
        total_orders: total,
        status_counts: counts,
    })
}

fn execution_quality(
    facts: &[ManagerQueryAnalyticsFact],
) -> Result<ExecutionQualitySummary, AnalyticsError> {
    let mut submitted = 0_u64;
    let mut risk_rejected = 0_u64;
    let mut broker_rejected = 0_u64;
    let mut filled = 0_u64;
    for fact in facts
        .iter()
        .filter(|fact| fact.relation == "public.execution_sessions")
    {
        submitted = checked_add_u64(submitted, integer(&fact.fields, "submitted_count")?)?;
        risk_rejected =
            checked_add_u64(risk_rejected, integer(&fact.fields, "risk_rejected_count")?)?;
        broker_rejected = checked_add_u64(
            broker_rejected,
            integer(&fact.fields, "broker_rejected_count")?,
        )?;
        filled = checked_add_u64(filled, integer(&fact.fields, "filled_count")?)?;
    }
    let rejected = checked_add_u64(risk_rejected, broker_rejected)?;
    let reject_rate = if submitted == 0 {
        None
    } else {
        Some(DecimalString::from_decimal(
            Decimal::from(rejected)
                .checked_div(Decimal::from(submitted))
                .and_then(|value| value.checked_mul(Decimal::from(100)))
                .ok_or(AnalyticsError::DecimalOverflow)?
                .round_dp(12),
        ))
    };
    Ok(ExecutionQualitySummary {
        formula_version: "execution_quality.v1".to_owned(),
        submitted_count: submitted,
        risk_rejected_count: risk_rejected,
        broker_rejected_count: broker_rejected,
        filled_count: filled,
        reject_rate,
        latency_state: AnalyticsCapabilityState::Unavailable,
        latency_reason_code: Some("N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED".to_owned()),
    })
}

#[allow(clippy::too_many_lines)] // equity and contribution share one exact snapshot traversal
fn equity_and_contribution_series(
    input: &ManagerQueryAnalyticsInput,
) -> Result<Vec<ChartSeries>, AnalyticsError> {
    let mut by_series: BTreeMap<(String, String, String), Vec<ChartPoint>> = BTreeMap::new();
    for fact in input.facts.iter().filter(|fact| {
        matches!(
            fact.relation.as_str(),
            "public.performance_snapshots"
                | "public.account_equity_snapshots"
                | "public.portfolio_equity_snapshots"
        )
    }) {
        let Some(timestamp) = timestamp(&fact.fields, "ts").or(Some(fact.as_of)) else {
            continue;
        };
        let currency = text(&fact.fields, "currency").unwrap_or_else(|| "UNKNOWN".to_owned());
        if let Some(value) = decimal(&fact.fields, "equity")? {
            by_series
                .entry((fact.relation.clone(), currency.clone(), "equity".to_owned()))
                .or_default()
                .push(ChartPoint {
                    timestamp,
                    value: Some(value),
                });
        }
        if let Some(value) = decimal(&fact.fields, "drawdown")? {
            by_series
                .entry((fact.relation.clone(), currency, "drawdown".to_owned()))
                .or_default()
                .push(ChartPoint {
                    timestamp,
                    value: Some(value),
                });
        }
    }
    let mut pnl_snapshots = StrategyCurrencySnapshots::new();
    for fact in input
        .facts
        .iter()
        .filter(|fact| fact.relation == "public.performance_snapshots")
    {
        let Some(strategy_id) = text(&fact.fields, "strategy_id") else {
            continue;
        };
        let Some(currency) = text(&fact.fields, "currency") else {
            continue;
        };
        if !valid_currency(&currency) {
            return Err(AnalyticsError::RiskSeries("currency_partition"));
        }
        let Some(value) = decimal(&fact.fields, "net_pnl")? else {
            continue;
        };
        let at = timestamp(&fact.fields, "ts").unwrap_or(fact.as_of);
        let per_day = pnl_snapshots.entry((strategy_id, currency)).or_default();
        match per_day.get(&at.date_naive()) {
            Some((current_at, _)) if *current_at >= at => {}
            _ => {
                per_day.insert(at.date_naive(), (at, value.value()));
            }
        }
    }
    let mut contributions: BTreeMap<(chrono::NaiveDate, String), Decimal> = BTreeMap::new();
    for ((_strategy_id, currency), daily) in pnl_snapshots {
        let values = daily.into_iter().collect::<Vec<_>>();
        for pair in values.windows(2) {
            let contribution = pair[1]
                .1
                 .1
                .checked_sub(pair[0].1 .1)
                .ok_or(AnalyticsError::DecimalOverflow)?;
            let current = contributions
                .entry((pair[1].0, currency.clone()))
                .or_default();
            *current = current
                .checked_add(contribution)
                .ok_or(AnalyticsError::DecimalOverflow)?;
        }
    }
    let mut series = Vec::new();
    for ((relation, currency, metric), mut points) in by_series {
        normalize_points(&mut points);
        let (points, downsample) = downsample_extrema(&points, 5_000)?;
        let is_equity = metric == "equity";
        series.push(ChartSeries {
            schema_version: "chart-series.rules.v1".to_owned(),
            series_id: format!(
                "{}:{}:{}",
                relation.trim_start_matches("public."),
                currency,
                metric
            ),
            kind: ChartSeriesKind::Line,
            unit: if is_equity {
                ChartUnit::Money
            } else {
                ChartUnit::Percent
            },
            currency: is_equity.then_some(currency),
            authority: SourceAuthority::Derived,
            as_of: input.as_of,
            formula_version: if is_equity {
                "equity_projection.v1"
            } else {
                "drawdown.v1"
            }
            .to_owned(),
            completeness: input.completeness,
            join_digest: Some(input.projection_state_digest.clone()),
            ohlc_owner: None,
            points,
            gaps: Vec::new(),
            markers: Vec::new(),
            annotations: Vec::new(),
            declared_total: None,
            downsample,
        });
    }
    let mut contribution_by_currency: BTreeMap<String, Vec<ChartPoint>> = BTreeMap::new();
    for ((day, currency), value) in contributions {
        let timestamp = DateTime::from_naive_utc_and_offset(
            day.and_hms_opt(0, 0, 0)
                .ok_or(AnalyticsError::RiskSeries("contribution_day"))?,
            Utc,
        );
        contribution_by_currency
            .entry(currency)
            .or_default()
            .push(ChartPoint {
                timestamp,
                value: Some(DecimalString::from_decimal(value)),
            });
    }
    for (currency, points) in contribution_by_currency {
        let total = points.iter().filter_map(|point| point.value).try_fold(
            Decimal::ZERO,
            |sum, value| {
                sum.checked_add(value.value())
                    .ok_or(AnalyticsError::DecimalOverflow)
            },
        )?;
        let extrema = point_extrema(&points);
        series.push(ChartSeries {
            schema_version: "chart-series.rules.v1".to_owned(),
            series_id: format!("daily-contribution:{currency}"),
            kind: ChartSeriesKind::Bar,
            unit: ChartUnit::Money,
            currency: Some(currency),
            authority: SourceAuthority::Derived,
            as_of: input.as_of,
            formula_version: "contribution.v1".to_owned(),
            completeness: input.completeness,
            join_digest: Some(input.projection_state_digest.clone()),
            ohlc_owner: None,
            downsample: ChartDownsample {
                method: ChartDownsampleMethod::None,
                input_points: points.len(),
                output_points: points.len(),
                input_minimum: extrema.0,
                input_maximum: extrema.1,
            },
            points,
            gaps: Vec::new(),
            markers: Vec::new(),
            annotations: Vec::new(),
            declared_total: Some(DecimalString::from_decimal(total)),
        });
    }
    Ok(series)
}

fn replay(facts: &[ManagerQueryAnalyticsFact]) -> Result<ReplaySummary, AnalyticsError> {
    let mut log = Vec::new();
    for fact in facts {
        let row = match fact.relation.as_str() {
            "public.fills" => Some(ReplayLogRow {
                timestamp: timestamp(&fact.fields, "trade_time").unwrap_or(fact.as_of),
                journal_id: text(&fact.fields, "event_id")
                    .unwrap_or_else(|| fact.entity_id.clone()),
                event_type: "FILL".to_owned(),
                order_id: text(&fact.fields, "client_order_id"),
                fill_id: text(&fact.fields, "fill_id"),
                price: decimal(&fact.fields, "price")?,
                quantity: decimal(&fact.fields, "quantity")?,
            }),
            "public.orders"
                if text(&fact.fields, "status")
                    .as_deref()
                    .is_some_and(|status| status.contains("REJECT")) =>
            {
                Some(ReplayLogRow {
                    timestamp: timestamp(&fact.fields, "updated_at").unwrap_or(fact.as_of),
                    journal_id: text(&fact.fields, "order_id")
                        .unwrap_or_else(|| fact.entity_id.clone()),
                    event_type: "REJECT".to_owned(),
                    order_id: text(&fact.fields, "order_id"),
                    fill_id: None,
                    price: decimal(&fact.fields, "price")?,
                    quantity: decimal(&fact.fields, "quantity")?,
                })
            }
            _ => None,
        };
        if let Some(row) = row {
            log.push(row);
        }
    }
    log.sort_by(|left, right| {
        left.timestamp
            .cmp(&right.timestamp)
            .then_with(|| left.journal_id.cmp(&right.journal_id))
    });
    log.truncate(MAX_REPLAY_LOG_ROWS);
    let markers = log
        .iter()
        .take(crate::MAX_CHART_MARKERS)
        .map(|row| ChartMarker {
            timestamp: row.timestamp,
            marker_type: if row.event_type == "REJECT" {
                "REJECT"
            } else {
                "ENTRY_OR_EXIT_FILL"
            }
            .to_owned(),
            journal_id: row.journal_id.clone(),
        })
        .collect::<Vec<_>>();
    Ok(ReplaySummary {
        state: if log.is_empty() {
            AnalyticsCapabilityState::Empty
        } else {
            AnalyticsCapabilityState::Partial
        },
        reason_code: (!log.is_empty()).then_some("N25_REPLAY_WITHOUT_CANDLES".to_owned()),
        markers,
        trade_log: log,
        candles_state: AnalyticsCapabilityState::Unavailable,
        candles_reason_code: "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED".to_owned(),
    })
}

fn drawdown_overlap(
    facts: &[ManagerQueryAnalyticsFact],
) -> Result<Option<DrawdownOverlap>, AnalyticsError> {
    let mut inputs: BTreeMap<String, Vec<NavPoint>> = BTreeMap::new();
    for fact in facts
        .iter()
        .filter(|fact| fact.relation == "public.performance_snapshots")
    {
        let Some(strategy_id) = text(&fact.fields, "strategy_id") else {
            continue;
        };
        let Some(value) = decimal(&fact.fields, "equity")? else {
            continue;
        };
        inputs.entry(strategy_id).or_default().push(NavPoint {
            timestamp: timestamp(&fact.fields, "ts").unwrap_or(fact.as_of),
            value,
        });
    }
    if inputs.len() < 2 {
        return Ok(None);
    }
    let mut inputs = inputs
        .into_iter()
        .map(|(alpha_id, mut points)| {
            points.sort_by_key(|point| point.timestamp);
            points.dedup_by_key(|point| point.timestamp);
            DrawdownInput { alpha_id, points }
        })
        .collect::<Vec<_>>();
    inputs.sort_by(|left, right| left.alpha_id.cmp(&right.alpha_id));
    build_drawdown_overlap(&inputs).map(Some)
}

#[allow(clippy::too_many_lines)] // keeps alignment, pair bounds and state derivation together
fn manager_correlation(
    facts: &[ManagerQueryAnalyticsFact],
) -> Result<ManagerCorrelation, AnalyticsError> {
    let mut daily = AlphaDailySnapshots::new();
    for fact in facts
        .iter()
        .filter(|fact| fact.relation == "public.performance_snapshots")
    {
        let Some(alpha_id) = text(&fact.fields, "strategy_id") else {
            continue;
        };
        if !valid_identifier(&alpha_id) {
            return Err(AnalyticsError::RiskSeries("correlation_alpha_id"));
        }
        let Some(equity) = decimal(&fact.fields, "equity")? else {
            continue;
        };
        if equity.value() <= Decimal::ZERO {
            return Err(AnalyticsError::RiskSeries("correlation_nav"));
        }
        let at = timestamp(&fact.fields, "ts").unwrap_or(fact.as_of);
        let per_day = daily.entry(alpha_id).or_default();
        match per_day.get(&at.date_naive()) {
            Some((current_at, _)) if *current_at >= at => {}
            _ => {
                per_day.insert(at.date_naive(), (at, equity.value()));
            }
        }
    }
    let truncated = daily.len() > MAX_CORRELATION_ALPHAS;
    let daily = daily
        .into_iter()
        .take(MAX_CORRELATION_ALPHAS)
        .collect::<BTreeMap<_, _>>();
    let alpha_ids = daily.keys().cloned().collect::<Vec<_>>();
    let returns = daily
        .iter()
        .map(|(alpha_id, values)| {
            let values = values.iter().collect::<Vec<_>>();
            let mut output = BTreeMap::new();
            for pair in values.windows(2) {
                let value = pair[1]
                    .1
                     .1
                    .checked_div(pair[0].1 .1)
                    .and_then(|value| value.checked_sub(Decimal::ONE))
                    .ok_or(AnalyticsError::DecimalOverflow)?;
                output.insert(*pair[1].0, value);
            }
            Ok::<_, AnalyticsError>((alpha_id.clone(), output))
        })
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    let mut pairs = Vec::new();
    for right in 0..alpha_ids.len() {
        for left in 0..right {
            let left_returns = &returns[&alpha_ids[left]];
            let right_returns = &returns[&alpha_ids[right]];
            let aligned = left_returns
                .iter()
                .filter_map(|(day, left_value)| {
                    right_returns.get(day).and_then(|right_value| {
                        day.and_hms_opt(0, 0, 0).map(|timestamp| {
                            (
                                DateTime::from_naive_utc_and_offset(timestamp, Utc),
                                *left_value,
                                *right_value,
                            )
                        })
                    })
                })
                .collect::<Vec<_>>();
            if aligned.len() < 2 {
                continue;
            }
            pairs.push(ManagerCorrelationPair {
                left_alpha_id: alpha_ids[left].clone(),
                right_alpha_id: alpha_ids[right].clone(),
                coefficient: DecimalString::from_decimal(crate::risk_series::pearson(&aligned)?),
                sample_count: u64::try_from(aligned.len())
                    .map_err(|_| AnalyticsError::DecimalOverflow)?,
            });
        }
    }
    let expected_pairs = alpha_ids
        .len()
        .saturating_mul(alpha_ids.len().saturating_sub(1))
        / 2;
    let (state, reason_code) = if alpha_ids.len() < 2 {
        (
            AnalyticsCapabilityState::Empty,
            Some("N25_INSUFFICIENT_MULTI_ALPHA_HISTORY".to_owned()),
        )
    } else if truncated {
        (
            AnalyticsCapabilityState::Partial,
            Some("N25_CORRELATION_ALPHA_BOUND".to_owned()),
        )
    } else if pairs.len() != expected_pairs {
        (
            AnalyticsCapabilityState::Partial,
            Some("N25_CORRELATION_PAIR_INSUFFICIENT_HISTORY".to_owned()),
        )
    } else {
        (AnalyticsCapabilityState::Available, None)
    };
    Ok(ManagerCorrelation {
        formula_version: "portfolio-correlation-returns.v1".to_owned(),
        state,
        reason_code,
        alpha_ids,
        pairs,
    })
}

fn capability(
    capability_id: &str,
    state: AnalyticsCapabilityState,
    authority: SourceAuthority,
    formula_version: Option<&str>,
    relations: &[&str],
    reason_code: Option<&str>,
) -> AnalyticsCapability {
    AnalyticsCapability {
        capability_id: capability_id.to_owned(),
        state,
        authority,
        formula_version: formula_version.map(str::to_owned),
        source_relations: relations.iter().map(ToString::to_string).collect(),
        reason_code: reason_code.map(str::to_owned),
    }
}

fn normalize_points(points: &mut Vec<ChartPoint>) {
    points.sort_by_key(|point| point.timestamp);
    points.dedup_by_key(|point| point.timestamp);
}

fn point_extrema(points: &[ChartPoint]) -> (Option<DecimalString>, Option<DecimalString>) {
    let mut values = points.iter().filter_map(|point| point.value);
    let Some(first) = values.next() else {
        return (None, None);
    };
    values.fold((Some(first), Some(first)), |(minimum, maximum), value| {
        (
            Some(if value.value() < minimum.expect("present").value() {
                value
            } else {
                minimum.expect("present")
            }),
            Some(if value.value() > maximum.expect("present").value() {
                value
            } else {
                maximum.expect("present")
            }),
        )
    })
}

fn accumulate_exact(
    fields: &serde_json::Value,
    field: &str,
    count: &mut u64,
    total: &mut Decimal,
    invalid: &mut u64,
) -> Result<(), AnalyticsError> {
    let Some(value) = fields.get(field) else {
        return Ok(());
    };
    match value
        .as_str()
        .and_then(|value| DecimalString::parse(value).ok())
    {
        Some(value) => {
            *count = checked_count(*count)?;
            *total = total
                .checked_add(value.value())
                .ok_or(AnalyticsError::DecimalOverflow)?;
        }
        None if !value.is_null() => *invalid = checked_count(*invalid)?,
        None => {}
    }
    Ok(())
}

fn decimal(
    fields: &serde_json::Value,
    field: &str,
) -> Result<Option<DecimalString>, AnalyticsError> {
    fields
        .get(field)
        .filter(|value| !value.is_null())
        .map(|value| {
            value
                .as_str()
                .ok_or(AnalyticsError::RiskSeries(
                    "financial_value_not_decimal_string",
                ))
                .and_then(|value| {
                    DecimalString::parse(value)
                        .map_err(|_| AnalyticsError::RiskSeries("invalid_decimal"))
                })
        })
        .transpose()
}

fn text(fields: &serde_json::Value, field: &str) -> Option<String> {
    fields
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned)
}

fn integer(fields: &serde_json::Value, field: &str) -> Result<u64, AnalyticsError> {
    match fields.get(field) {
        None | Some(serde_json::Value::Null) => Ok(0),
        Some(value) => value
            .as_u64()
            .ok_or(AnalyticsError::RiskSeries("invalid_non_negative_count")),
    }
}

fn timestamp(fields: &serde_json::Value, field: &str) -> Option<DateTime<Utc>> {
    fields
        .get(field)
        .and_then(serde_json::Value::as_str)
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc))
}

fn checked_count(value: u64) -> Result<u64, AnalyticsError> {
    value.checked_add(1).ok_or(AnalyticsError::DecimalOverflow)
}

fn checked_add_u64(left: u64, right: u64) -> Result<u64, AnalyticsError> {
    left.checked_add(right)
        .ok_or(AnalyticsError::DecimalOverflow)
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}

fn valid_currency(value: &str) -> bool {
    (2..=12).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_780_000_000 + second, 0).unwrap()
    }

    fn fact(
        entity: &str,
        relation: &str,
        second: i64,
        fields: serde_json::Value,
    ) -> ManagerQueryAnalyticsFact {
        ManagerQueryAnalyticsFact {
            entity_id: entity.to_owned(),
            relation: relation.to_owned(),
            as_of: at(second),
            fields,
        }
    }

    fn input() -> ManagerQueryAnalyticsInput {
        ManagerQueryAnalyticsInput {
            subject_kind: "DEPLOYMENT".to_owned(),
            subject_id: "dep-74".to_owned(),
            environment: "paper".to_owned(),
            profile_id: "PAPER_BINANCE_USDM".to_owned(),
            as_of: at(100),
            projection_state_digest: format!("sha256:{}", "d".repeat(64)),
            completeness: PopulationCompleteness::Complete,
            facts: vec![
                fact(
                    "session-1",
                    "public.execution_sessions",
                    1,
                    json!({"submitted_count":10,"risk_rejected_count":1,"broker_rejected_count":1,"filled_count":8}),
                ),
                fact(
                    "order-1",
                    "public.orders",
                    2,
                    json!({"status":"FILLED","currency":"USDT","quantity":"0.1","notional":"10.00"}),
                ),
                fact(
                    "fill-1",
                    "public.fills",
                    3,
                    json!({"fill_id":"fill-1","event_id":"evt-1","trade_time":at(3).to_rfc3339(),"client_order_id":"order-1","price":"100.00","quantity":"0.1","realized_pnl":"1.25","commission_currency":"USDT"}),
                ),
                fact(
                    "equity-1",
                    "public.account_equity_snapshots",
                    4,
                    json!({"ts":at(4).to_rfc3339(),"currency":"USDT","equity":"100.00","drawdown":"0"}),
                ),
                fact(
                    "equity-2",
                    "public.account_equity_snapshots",
                    5,
                    json!({"ts":at(5).to_rfc3339(),"currency":"USDT","equity":"101.25","drawdown":"0"}),
                ),
                fact(
                    "position-1",
                    "public.positions_v2",
                    6,
                    json!({"currency":"USDT","quantity":"0.1","notional":"10.00","instrument_id":"BTCUSDT"}),
                ),
            ],
        }
    }

    #[test]
    fn manager_plane_is_exact_bounded_source_attributed_and_deterministic() {
        let first = build_manager_query_analytics(&input()).unwrap();
        let second = build_manager_query_analytics(&input()).unwrap();
        assert_eq!(first, second);
        assert_eq!(
            first.execution_quality.reject_rate.unwrap().to_string(),
            "20.00"
        );
        assert_eq!(first.order_funnel.total_orders, 1);
        assert_eq!(first.exact_currency_partitions.len(), 3);
        assert!(first.exact_currency_partitions.iter().any(|partition| {
            partition.relation == "public.positions_v2" && partition.notional.to_string() == "10.00"
        }));
        assert_eq!(first.replay.markers[0].journal_id, "evt-1");
        assert!(first
            .chart_series
            .iter()
            .all(|series| series.points.len() <= 5_000));
        assert!(first.capabilities.iter().any(|capability| {
            capability.capability_id == "market-candles"
                && capability.reason_code.as_deref()
                    == Some("N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED")
        }));
    }

    #[test]
    fn portfolio_correlation_and_contribution_use_daily_source_snapshots() {
        let mut source = input();
        source.subject_kind = "PORTFOLIO".to_owned();
        source.subject_id = "pf-1".to_owned();
        source.facts.clear();
        for (alpha, values) in [
            ("alpha-a", ["100", "110", "121", "145.2"]),
            ("alpha-b", ["200", "220", "242", "290.4"]),
        ] {
            for (day, value) in values.into_iter().enumerate() {
                let timestamp = at(i64::try_from(day).unwrap() * 86_400);
                source.facts.push(fact(
                    &format!("{alpha}-{day}"),
                    "public.performance_snapshots",
                    i64::try_from(day).unwrap() * 86_400,
                    json!({
                        "strategy_id":alpha,
                        "currency":"USDT",
                        "equity":value,
                        "net_pnl":value,
                        "ts":timestamp.to_rfc3339()
                    }),
                ));
            }
        }
        let output = build_manager_query_analytics(&source).unwrap();
        assert_eq!(
            output.correlation.state,
            AnalyticsCapabilityState::Available
        );
        assert_eq!(output.correlation.pairs.len(), 1);
        assert_eq!(output.correlation.pairs[0].coefficient.to_string(), "1");
        assert_eq!(output.correlation.pairs[0].sample_count, 3);
        let contributions = output
            .chart_series
            .iter()
            .find(|series| series.series_id == "daily-contribution:USDT")
            .unwrap();
        assert_eq!(contributions.points.len(), 3);
        assert_eq!(contributions.declared_total.unwrap().to_string(), "135.6");
    }

    #[test]
    fn malformed_financial_number_is_counted_for_aggregates_and_rejected_for_series() {
        let mut aggregate_only = input();
        aggregate_only.facts.push(fact(
            "order-bad",
            "public.orders",
            7,
            json!({"currency":"USDT","quantity":12.5}),
        ));
        let output = build_manager_query_analytics(&aggregate_only).unwrap();
        assert_eq!(
            output
                .exact_currency_partitions
                .iter()
                .map(|partition| partition.invalid_numeric_count)
                .sum::<u64>(),
            1
        );

        let mut bad_series = input();
        bad_series.facts.push(fact(
            "equity-bad",
            "public.account_equity_snapshots",
            8,
            json!({"ts":at(8).to_rfc3339(),"currency":"USDT","equity":12.5,"drawdown":"0"}),
        ));
        assert_eq!(
            build_manager_query_analytics(&bad_series),
            Err(AnalyticsError::RiskSeries(
                "financial_value_not_decimal_string"
            ))
        );
    }
}
