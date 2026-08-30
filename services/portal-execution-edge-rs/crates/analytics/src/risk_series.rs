use std::collections::{BTreeMap, BTreeSet};

use chrono::{DateTime, Utc};
use execution_contracts::{DecimalString, SourceAuthority};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    downsample_extrema, validate_chart_batch, AnalyticsError, ChartAnnotation, ChartSeries,
    ChartSeriesKind, ChartUnit, PopulationCompleteness,
};

const MAX_RISK_INPUT_POINTS: usize = 5_000;
const MAX_RHO_POINTS: usize = 400;
const MAX_DRAWDOWN_ALPHAS: usize = 20;
const MAX_EPISODES_PER_ALPHA: usize = 40;
const MAX_JOINT_WINDOWS: usize = 10;
type ActiveRhoBreach = (DateTime<Utc>, DateTime<Utc>, DateTime<Utc>, DecimalString);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NavPoint {
    pub timestamp: DateTime<Utc>,
    pub value: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RhoTimelineInput {
    pub series_id: String,
    pub portfolio: Vec<NavPoint>,
    pub benchmark: Vec<NavPoint>,
    pub rolling_observations: usize,
    pub threshold: DecimalString,
    pub as_of: DateTime<Utc>,
    pub join_digest: String,
    pub completeness: PopulationCompleteness,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RhoBreach {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub peak_at: DateTime<Utc>,
    pub peak: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RhoTimeline {
    pub formula_version: String,
    pub rolling_observations: usize,
    pub threshold: DecimalString,
    pub series: ChartSeries,
    pub breaches: Vec<RhoBreach>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DrawdownInput {
    pub alpha_id: String,
    pub points: Vec<NavPoint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DrawdownEpisode {
    pub alpha_id: String,
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub depth_pct: DecimalString,
    pub recovered: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JointDrawdownWindow {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub member_alpha_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DrawdownOverlap {
    pub formula_version: String,
    pub episodes: Vec<DrawdownEpisode>,
    pub insufficient_alpha_ids: Vec<String>,
    pub joint_windows: Vec<JointDrawdownWindow>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanaryDriftInput {
    pub series_id: String,
    pub canary: Vec<NavPoint>,
    pub paper_twin: Vec<NavPoint>,
    pub as_of: DateTime<Utc>,
    pub join_digest: String,
    pub completeness: PopulationCompleteness,
}

/// Derives a deterministic rolling Pearson timeline using decimal arithmetic.
///
/// # Errors
///
/// Returns a typed risk-series error for invalid NAV ordering, unsafe rolling
/// configuration, digest drift or decimal overflow.
pub fn build_rho_timeline(input: &RhoTimelineInput) -> Result<RhoTimeline, AnalyticsError> {
    validate_nav(&input.portfolio)?;
    validate_nav(&input.benchmark)?;
    if !(2..=250).contains(&input.rolling_observations)
        || input.threshold.value() < Decimal::NEGATIVE_ONE
        || input.threshold.value() > Decimal::ONE
        || !valid_digest(&input.join_digest)
    {
        return Err(AnalyticsError::RiskSeries("rho_configuration"));
    }
    let portfolio = returns(&input.portfolio)?;
    let benchmark = returns(&input.benchmark)?;
    let aligned = portfolio
        .into_iter()
        .filter_map(|(timestamp, value)| {
            benchmark
                .get(&timestamp)
                .copied()
                .map(|other| (timestamp, value, other))
        })
        .collect::<Vec<_>>();
    let mut points = Vec::new();
    for window in aligned.windows(input.rolling_observations) {
        let Some(last) = window.last() else {
            continue;
        };
        points.push(crate::ChartPoint {
            timestamp: last.0,
            value: Some(DecimalString::from_decimal(pearson(window)?)),
        });
    }
    let (points, downsample) = downsample_extrema(&points, MAX_RHO_POINTS)?;
    let breaches = breaches(&points, input.threshold);
    let annotations = breaches
        .iter()
        .map(|breach| ChartAnnotation {
            timestamp: breach.peak_at,
            value: breach.peak,
            label: "rho threshold breach".to_owned(),
        })
        .collect();
    let series = ChartSeries {
        schema_version: "chart-series.rules.v1".to_owned(),
        series_id: input.series_id.clone(),
        kind: ChartSeriesKind::Line,
        unit: ChartUnit::Ratio,
        currency: None,
        authority: SourceAuthority::Derived,
        as_of: input.as_of,
        formula_version: "corr.v1".to_owned(),
        completeness: input.completeness,
        join_digest: Some(input.join_digest.clone()),
        ohlc_owner: None,
        points,
        gaps: Vec::new(),
        markers: Vec::new(),
        annotations,
        declared_total: None,
        downsample,
    };
    validate_chart_batch(std::slice::from_ref(&series))?;
    Ok(RhoTimeline {
        formula_version: "corr.v1".to_owned(),
        rolling_observations: input.rolling_observations,
        threshold: input.threshold,
        series,
        breaches,
    })
}

/// Derives per-alpha peak-to-recovery episodes and exact joint intervals.
///
/// # Errors
///
/// Returns a typed risk-series error for invalid alpha bounds, duplicate
/// identifiers, malformed NAV series or excessive episode/joint-window output.
pub fn build_drawdown_overlap(inputs: &[DrawdownInput]) -> Result<DrawdownOverlap, AnalyticsError> {
    if inputs.is_empty() || inputs.len() > MAX_DRAWDOWN_ALPHAS {
        return Err(AnalyticsError::RiskSeries("drawdown_alpha_bound"));
    }
    let mut seen = BTreeSet::new();
    let mut episodes = Vec::new();
    let mut insufficient = Vec::new();
    for input in inputs {
        if input.alpha_id.is_empty() || !seen.insert(input.alpha_id.as_str()) {
            return Err(AnalyticsError::RiskSeries("drawdown_alpha_id"));
        }
        validate_nav(&input.points)?;
        if input.points.len() < 2 {
            insufficient.push(input.alpha_id.clone());
            continue;
        }
        let derived = drawdown_episodes(input)?;
        if derived.len() > MAX_EPISODES_PER_ALPHA {
            return Err(AnalyticsError::RiskSeries("drawdown_episode_bound"));
        }
        episodes.extend(derived);
    }
    let joint_windows = joint_windows(&episodes)?;
    Ok(DrawdownOverlap {
        formula_version: "drawdown_overlap.v1".to_owned(),
        episodes,
        insufficient_alpha_ids: insufficient,
        joint_windows,
    })
}

/// Computes a basis-point drift line over matched canary and Paper-twin NAV.
///
/// # Errors
///
/// Returns a typed risk-series error for invalid NAV input, join-digest drift,
/// a zero twin denominator, decimal overflow or chart-rule failure.
pub fn build_canary_drift(input: &CanaryDriftInput) -> Result<ChartSeries, AnalyticsError> {
    validate_nav(&input.canary)?;
    validate_nav(&input.paper_twin)?;
    if !valid_digest(&input.join_digest) {
        return Err(AnalyticsError::RiskSeries("canary_join_digest"));
    }
    let twin = input
        .paper_twin
        .iter()
        .map(|point| (point.timestamp, point.value.value()))
        .collect::<BTreeMap<_, _>>();
    let mut points = Vec::new();
    for point in &input.canary {
        let Some(twin_value) = twin.get(&point.timestamp).copied() else {
            continue;
        };
        if twin_value.is_zero() {
            return Err(AnalyticsError::RiskSeries("canary_zero_twin"));
        }
        let drift = point
            .value
            .value()
            .checked_sub(twin_value)
            .and_then(|value| value.checked_div(twin_value))
            .and_then(|value| value.checked_mul(Decimal::from(10_000)))
            .ok_or(AnalyticsError::DecimalOverflow)?
            .round_dp(12);
        points.push(crate::ChartPoint {
            timestamp: point.timestamp,
            value: Some(DecimalString::from_decimal(drift)),
        });
    }
    let (points, downsample) = downsample_extrema(&points, MAX_RHO_POINTS)?;
    let series = ChartSeries {
        schema_version: "chart-series.rules.v1".to_owned(),
        series_id: input.series_id.clone(),
        kind: ChartSeriesKind::Line,
        unit: ChartUnit::BasisPoints,
        currency: None,
        authority: SourceAuthority::Derived,
        as_of: input.as_of,
        formula_version: "drift.v1".to_owned(),
        completeness: input.completeness,
        join_digest: Some(input.join_digest.clone()),
        ohlc_owner: None,
        points,
        gaps: Vec::new(),
        markers: Vec::new(),
        annotations: Vec::new(),
        declared_total: None,
        downsample,
    };
    validate_chart_batch(std::slice::from_ref(&series))?;
    Ok(series)
}

fn validate_nav(points: &[NavPoint]) -> Result<(), AnalyticsError> {
    if points.len() > MAX_RISK_INPUT_POINTS
        || points
            .iter()
            .any(|point| point.value.value() <= Decimal::ZERO)
        || points
            .windows(2)
            .any(|window| window[0].timestamp >= window[1].timestamp)
    {
        return Err(AnalyticsError::RiskSeries("nav_points"));
    }
    Ok(())
}

fn returns(points: &[NavPoint]) -> Result<BTreeMap<DateTime<Utc>, Decimal>, AnalyticsError> {
    let mut output = BTreeMap::new();
    for pair in points.windows(2) {
        let value = pair[1]
            .value
            .value()
            .checked_div(pair[0].value.value())
            .and_then(|value| value.checked_sub(Decimal::ONE))
            .ok_or(AnalyticsError::DecimalOverflow)?;
        output.insert(pair[1].timestamp, value);
    }
    Ok(output)
}

pub(crate) fn pearson(
    window: &[(DateTime<Utc>, Decimal, Decimal)],
) -> Result<Decimal, AnalyticsError> {
    let count =
        Decimal::from(u64::try_from(window.len()).map_err(|_| AnalyticsError::DecimalOverflow)?);
    let (sum_x, sum_y) = window.iter().try_fold(
        (Decimal::ZERO, Decimal::ZERO),
        |(sum_x, sum_y), (_, x, y)| {
            Ok::<_, AnalyticsError>((
                sum_x
                    .checked_add(*x)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
                sum_y
                    .checked_add(*y)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
            ))
        },
    )?;
    let mean_x = sum_x
        .checked_div(count)
        .ok_or(AnalyticsError::DecimalOverflow)?;
    let mean_y = sum_y
        .checked_div(count)
        .ok_or(AnalyticsError::DecimalOverflow)?;
    let (covariance, variance_x, variance_y) = window.iter().try_fold(
        (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO),
        |(covariance, variance_x, variance_y), (_, x, y)| {
            let dx = x
                .checked_sub(mean_x)
                .ok_or(AnalyticsError::DecimalOverflow)?;
            let dy = y
                .checked_sub(mean_y)
                .ok_or(AnalyticsError::DecimalOverflow)?;
            Ok::<_, AnalyticsError>((
                covariance
                    .checked_add(dx.checked_mul(dy).ok_or(AnalyticsError::DecimalOverflow)?)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
                variance_x
                    .checked_add(dx.checked_mul(dx).ok_or(AnalyticsError::DecimalOverflow)?)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
                variance_y
                    .checked_add(dy.checked_mul(dy).ok_or(AnalyticsError::DecimalOverflow)?)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
            ))
        },
    )?;
    let denominator = decimal_sqrt(
        variance_x
            .checked_mul(variance_y)
            .ok_or(AnalyticsError::DecimalOverflow)?,
    )?;
    if denominator.is_zero() {
        return Ok(Decimal::ZERO);
    }
    let rho = covariance
        .checked_div(denominator)
        .ok_or(AnalyticsError::DecimalOverflow)?
        .clamp(Decimal::NEGATIVE_ONE, Decimal::ONE)
        .round_dp(12);
    Ok(rho)
}

fn decimal_sqrt(value: Decimal) -> Result<Decimal, AnalyticsError> {
    if value.is_sign_negative() {
        return Err(AnalyticsError::RiskSeries("negative_variance"));
    }
    if value.is_zero() {
        return Ok(Decimal::ZERO);
    }
    let two = Decimal::from(2_u8);
    let mut guess = if value > Decimal::ONE {
        value / two
    } else {
        Decimal::ONE
    };
    for _ in 0..32 {
        guess = guess
            .checked_add(
                value
                    .checked_div(guess)
                    .ok_or(AnalyticsError::DecimalOverflow)?,
            )
            .and_then(|next| next.checked_div(two))
            .ok_or(AnalyticsError::DecimalOverflow)?;
    }
    Ok(guess)
}

fn breaches(points: &[crate::ChartPoint], threshold: DecimalString) -> Vec<RhoBreach> {
    let mut output = Vec::new();
    let mut active: Option<ActiveRhoBreach> = None;
    for point in points {
        let Some(value) = point.value else {
            continue;
        };
        if value.value() > threshold.value() {
            active = Some(match active {
                Some((from, _, _peak_at, peak)) if value.value() > peak.value() => {
                    (from, point.timestamp, point.timestamp, value)
                }
                Some((from, _, peak_at, peak)) => (from, point.timestamp, peak_at, peak),
                None => (point.timestamp, point.timestamp, point.timestamp, value),
            });
        } else if let Some((from, to, peak_at, peak)) = active.take() {
            output.push(RhoBreach {
                from,
                to,
                peak_at,
                peak,
            });
        }
    }
    if let Some((from, to, peak_at, peak)) = active {
        output.push(RhoBreach {
            from,
            to,
            peak_at,
            peak,
        });
    }
    output
}

fn drawdown_episodes(input: &DrawdownInput) -> Result<Vec<DrawdownEpisode>, AnalyticsError> {
    let mut peak = input.points[0].value.value();
    let mut active: Option<(DateTime<Utc>, DateTime<Utc>, Decimal)> = None;
    let mut output = Vec::new();
    for point in &input.points[1..] {
        let value = point.value.value();
        if value >= peak {
            if let Some((from, _, depth)) = active.take() {
                output.push(DrawdownEpisode {
                    alpha_id: input.alpha_id.clone(),
                    from,
                    to: point.timestamp,
                    depth_pct: DecimalString::from_decimal(depth),
                    recovered: true,
                });
            }
            peak = value;
            continue;
        }
        let depth = value
            .checked_div(peak)
            .and_then(|ratio| ratio.checked_sub(Decimal::ONE))
            .and_then(|ratio| ratio.checked_mul(Decimal::from(100)))
            .ok_or(AnalyticsError::DecimalOverflow)?
            .round_dp(12);
        active = Some(match active {
            Some((from, _, minimum)) => (from, point.timestamp, minimum.min(depth)),
            None => (point.timestamp, point.timestamp, depth),
        });
    }
    if let Some((from, to, depth)) = active {
        output.push(DrawdownEpisode {
            alpha_id: input.alpha_id.clone(),
            from,
            to,
            depth_pct: DecimalString::from_decimal(depth),
            recovered: false,
        });
    }
    Ok(output)
}

fn joint_windows(episodes: &[DrawdownEpisode]) -> Result<Vec<JointDrawdownWindow>, AnalyticsError> {
    let boundaries = episodes
        .iter()
        .flat_map(|episode| [episode.from, episode.to])
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let mut output: Vec<JointDrawdownWindow> = Vec::new();
    for pair in boundaries.windows(2) {
        let members = episodes
            .iter()
            .filter(|episode| episode.from <= pair[0] && episode.to >= pair[1])
            .map(|episode| episode.alpha_id.clone())
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        if members.len() < 2 {
            continue;
        }
        if let Some(previous) = output.last_mut() {
            if previous.to == pair[0] && previous.member_alpha_ids == members {
                previous.to = pair[1];
                continue;
            }
        }
        output.push(JointDrawdownWindow {
            from: pair[0],
            to: pair[1],
            member_alpha_ids: members,
        });
    }
    if output.len() > MAX_JOINT_WINDOWS {
        return Err(AnalyticsError::RiskSeries("joint_window_bound"));
    }
    Ok(output)
}

fn valid_digest(value: &str) -> bool {
    value.strip_prefix("sha256:").is_some_and(|hex| {
        hex.len() == 64
            && hex
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(day: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_780_000_000 + day * 86_400, 0).unwrap()
    }

    fn nav(values: &[&str]) -> Vec<NavPoint> {
        values
            .iter()
            .enumerate()
            .map(|(index, value)| NavPoint {
                timestamp: at(i64::try_from(index).unwrap()),
                value: DecimalString::parse(value).unwrap(),
            })
            .collect()
    }

    #[test]
    fn rolling_rho_is_decimal_deterministic_and_breaches_reference_real_points() {
        let input = RhoTimelineInput {
            series_id: "portfolio-rho".to_owned(),
            portfolio: nav(&["100", "102", "101", "105", "108", "107"]),
            benchmark: nav(&["200", "203", "202", "208", "214", "212"]),
            rolling_observations: 3,
            threshold: DecimalString::parse("0.6").unwrap(),
            as_of: at(6),
            join_digest: format!("sha256:{}", "b".repeat(64)),
            completeness: PopulationCompleteness::Complete,
        };
        let first = build_rho_timeline(&input).unwrap();
        let second = build_rho_timeline(&input).unwrap();
        assert_eq!(first, second);
        assert!(!first.series.points.is_empty());
        for breach in &first.breaches {
            assert!(first.series.points.iter().any(|point| {
                point.timestamp == breach.peak_at && point.value == Some(breach.peak)
            }));
        }
    }

    #[test]
    fn drawdown_overlap_derives_peak_to_recovery_and_joint_windows() {
        let output = build_drawdown_overlap(&[
            DrawdownInput {
                alpha_id: "alpha-a".to_owned(),
                points: nav(&["100", "90", "80", "101"]),
            },
            DrawdownInput {
                alpha_id: "alpha-b".to_owned(),
                points: nav(&["100", "100", "95", "94"]),
            },
        ])
        .unwrap();
        assert_eq!(output.episodes.len(), 2);
        assert_eq!(output.joint_windows.len(), 1);
        assert_eq!(
            output.joint_windows[0].member_alpha_ids,
            ["alpha-a", "alpha-b"]
        );
        assert!(output
            .episodes
            .iter()
            .all(|episode| episode.depth_pct.value().is_sign_negative()));
    }

    #[test]
    fn canary_drift_requires_matched_positive_series_and_retains_exact_bps() {
        let output = build_canary_drift(&CanaryDriftInput {
            series_id: "canary-drift".to_owned(),
            canary: nav(&["100", "101"]),
            paper_twin: nav(&["100", "100"]),
            as_of: at(2),
            join_digest: format!("sha256:{}", "c".repeat(64)),
            completeness: PopulationCompleteness::Complete,
        })
        .unwrap();
        assert_eq!(output.points[1].value.unwrap().to_string(), "100.00");
    }
}
