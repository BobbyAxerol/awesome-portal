use std::collections::{BTreeMap, BTreeSet};

use execution_contracts::{CanonicalId, DecimalString, FreshnessState, PanelState};
use serde::{Deserialize, Serialize};

use crate::types::{
    warning, AnalyticsError, DerivedAnalytics, FactQuality, PopulationCompleteness, QualitySummary,
    MAX_INSIGHT_PREVIEW_ITEMS,
};

const FORMULA_VERSION: &str = "alpha-insight-preview.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightBatchRequest {
    pub portfolio_id: CanonicalId,
    pub items: Vec<InsightItemRequest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightItemRequest {
    pub insight_id: CanonicalId,
    pub alpha_id: CanonicalId,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InsightMetric {
    AllocatedCapital,
    UsedCapital,
    NetPnl,
    Drawdown,
    Contribution,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightMetricValue {
    pub metric: InsightMetric,
    pub value: DecimalString,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightObservation {
    pub insight_id: CanonicalId,
    pub portfolio_id: CanonicalId,
    pub quality: FactQuality,
    pub metrics: Vec<InsightMetricValue>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum InsightItemState {
    Ready,
    Error,
    Missing,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightItemResult {
    pub insight_id: CanonicalId,
    pub alpha_id: CanonicalId,
    pub portfolio_id: CanonicalId,
    pub state: InsightItemState,
    pub freshness_state: FreshnessState,
    pub metrics: Vec<InsightMetricValue>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InsightBatch {
    pub portfolio_id: CanonicalId,
    pub requested_count: usize,
    pub ready_count: usize,
    pub error_count: usize,
    pub items: Vec<InsightItemResult>,
}

/// Joins a bounded preview request to per-item observations without N+1 semantics.
///
/// One missing or failed item becomes an item-level result and never fails the batch.
///
/// # Errors
///
/// Rejects over-cap batches, duplicate IDs, portfolio mismatch, unexpected observations,
/// and duplicate metric keys.
pub fn build_insight_batch(
    request: &InsightBatchRequest,
    observations: &[InsightObservation],
) -> Result<DerivedAnalytics<InsightBatch>, AnalyticsError> {
    if request.items.len() > MAX_INSIGHT_PREVIEW_ITEMS {
        return Err(AnalyticsError::BatchLimit {
            actual: request.items.len(),
            maximum: MAX_INSIGHT_PREVIEW_ITEMS,
        });
    }
    let requested_ids = requested_ids(&request.items)?;
    let by_id = index_observations(request, &requested_ids, observations)?;
    let quality = QualitySummary::from_iter(observations.iter().map(|item| &item.quality));
    let items: Vec<_> = request
        .items
        .iter()
        .map(|requested| {
            materialize_item(
                requested,
                &request.portfolio_id,
                by_id.get(requested.insight_id.as_str()).copied(),
            )
        })
        .collect();
    let ready_count = items
        .iter()
        .filter(|item| item.state == InsightItemState::Ready)
        .count();
    let error_count = items.len().saturating_sub(ready_count);
    let completeness = if error_count == 0 {
        quality.completeness
    } else {
        PopulationCompleteness::Partial
    };
    let quality = quality.with_completeness(completeness);
    let warnings = (error_count > 0)
        .then(|| {
            warning(
                "INSIGHT_BATCH_PARTIAL",
                format!("{error_count} preview items were missing or failed"),
            )
        })
        .into_iter()
        .collect();
    let panel_state = if request.items.is_empty() {
        PanelState::Empty
    } else if error_count > 0 {
        PanelState::Partial
    } else {
        PanelState::Ok
    };

    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        panel_state,
        warnings,
        InsightBatch {
            portfolio_id: request.portfolio_id.clone(),
            requested_count: request.items.len(),
            ready_count,
            error_count,
            items,
        },
    ))
}

fn requested_ids(items: &[InsightItemRequest]) -> Result<BTreeSet<&str>, AnalyticsError> {
    let mut ids = BTreeSet::new();
    for item in items {
        if !ids.insert(item.insight_id.as_str()) {
            return Err(AnalyticsError::DuplicateIdentifier(
                item.insight_id.as_str().to_owned(),
            ));
        }
    }
    Ok(ids)
}

fn index_observations<'a>(
    request: &InsightBatchRequest,
    requested_ids: &BTreeSet<&str>,
    observations: &'a [InsightObservation],
) -> Result<BTreeMap<&'a str, &'a InsightObservation>, AnalyticsError> {
    let mut by_id = BTreeMap::new();
    for observation in observations {
        if observation.portfolio_id != request.portfolio_id {
            return Err(AnalyticsError::ScopeMismatch {
                field: "portfolio_id",
            });
        }
        if !requested_ids.contains(observation.insight_id.as_str()) {
            return Err(AnalyticsError::ScopeMismatch {
                field: "insight_id",
            });
        }
        if by_id
            .insert(observation.insight_id.as_str(), observation)
            .is_some()
        {
            return Err(AnalyticsError::DuplicateIdentifier(
                observation.insight_id.as_str().to_owned(),
            ));
        }
        validate_metrics(&observation.metrics)?;
    }
    Ok(by_id)
}

fn materialize_item(
    requested: &InsightItemRequest,
    portfolio_id: &CanonicalId,
    observation: Option<&InsightObservation>,
) -> InsightItemResult {
    match observation {
        Some(observation)
            if observation.error_code.is_none() && observation.error_message.is_none() =>
        {
            InsightItemResult {
                insight_id: requested.insight_id.clone(),
                alpha_id: requested.alpha_id.clone(),
                portfolio_id: portfolio_id.clone(),
                state: InsightItemState::Ready,
                freshness_state: observation.quality.freshness_state,
                metrics: observation.metrics.clone(),
                error_code: None,
                error_message: None,
            }
        }
        Some(observation) => InsightItemResult {
            insight_id: requested.insight_id.clone(),
            alpha_id: requested.alpha_id.clone(),
            portfolio_id: portfolio_id.clone(),
            state: InsightItemState::Error,
            freshness_state: observation.quality.freshness_state,
            metrics: Vec::new(),
            error_code: observation.error_code.clone(),
            error_message: observation.error_message.clone(),
        },
        None => InsightItemResult {
            insight_id: requested.insight_id.clone(),
            alpha_id: requested.alpha_id.clone(),
            portfolio_id: portfolio_id.clone(),
            state: InsightItemState::Missing,
            freshness_state: FreshnessState::Unknown,
            metrics: Vec::new(),
            error_code: Some("INSIGHT_NOT_OBSERVED".to_owned()),
            error_message: Some("No observation was available in this batch".to_owned()),
        },
    }
}

fn validate_metrics(metrics: &[InsightMetricValue]) -> Result<(), AnalyticsError> {
    let mut names = BTreeSet::new();
    for metric in metrics {
        if !names.insert(metric.metric) {
            return Err(AnalyticsError::DuplicateIdentifier(format!(
                "metric:{:?}",
                metric.metric
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use execution_contracts::SourceAuthority;

    use super::*;

    fn request(count: usize) -> InsightBatchRequest {
        InsightBatchRequest {
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            items: (0..count)
                .map(|index| InsightItemRequest {
                    insight_id: CanonicalId::parse(format!("insight-{index}")).unwrap(),
                    alpha_id: CanonicalId::parse(format!("alpha-{index}")).unwrap(),
                })
                .collect(),
        }
    }

    fn observation(index: usize) -> InsightObservation {
        InsightObservation {
            insight_id: CanonicalId::parse(format!("insight-{index}")).unwrap(),
            portfolio_id: CanonicalId::parse("PF-1").unwrap(),
            quality: FactQuality {
                source_authority: SourceAuthority::Execution,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(Utc::now()),
            },
            metrics: vec![InsightMetricValue {
                metric: InsightMetric::NetPnl,
                value: DecimalString::parse("10.000000000000000001").unwrap(),
            }],
            error_code: None,
            error_message: None,
        }
    }

    #[test]
    fn enforces_bounded_batch() {
        assert!(matches!(
            build_insight_batch(&request(MAX_INSIGHT_PREVIEW_ITEMS + 1), &[]),
            Err(AnalyticsError::BatchLimit { .. })
        ));
    }

    #[test]
    fn echoes_portfolio_and_isolates_item_failure() {
        let output = build_insight_batch(&request(2), &[observation(0)]).unwrap();
        assert_eq!(output.panel_state, PanelState::Partial);
        assert_eq!(output.data.ready_count, 1);
        assert_eq!(output.data.error_count, 1);
        assert_eq!(output.data.items[1].state, InsightItemState::Missing);
        assert_eq!(output.data.items[0].portfolio_id.as_str(), "PF-1");
    }

    #[test]
    fn rejects_cross_portfolio_cache_result() {
        let mut observation = observation(0);
        observation.portfolio_id = CanonicalId::parse("PF-2").unwrap();
        assert_eq!(
            build_insight_batch(&request(1), &[observation]),
            Err(AnalyticsError::ScopeMismatch {
                field: "portfolio_id"
            })
        );
    }
}
