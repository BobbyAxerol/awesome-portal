use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, DecimalString, PanelState, SourceAuthority};
use serde::{Deserialize, Serialize};

use crate::types::{
    warning, AnalyticsError, DerivedAnalytics, FactQuality, PopulationCompleteness, QualitySummary,
    MAX_FUNNEL_EVENTS,
};

const FORMULA_VERSION: &str = "order-funnel.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FunnelStage {
    Submit,
    SourceAck,
    BrokerAck,
    Fill,
}

impl FunnelStage {
    const ORDERED: [Self; 4] = [Self::Submit, Self::SourceAck, Self::BrokerAck, Self::Fill];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunnelEvent {
    pub stage: FunnelStage,
    pub source_authority: SourceAuthority,
    pub source_id: CanonicalId,
    pub occurred_at: DateTime<Utc>,
    pub quantity: Option<DecimalString>,
    pub quality: FactQuality,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunnelInput {
    pub order_id: CanonicalId,
    pub source_population: PopulationCompleteness,
    pub events: Vec<FunnelEvent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FunnelStageState {
    Observed,
    Missing,
    Partial,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunnelStageResult {
    pub stage: FunnelStage,
    pub state: FunnelStageState,
    pub events: Vec<FunnelEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderFunnel {
    pub order_id: CanonicalId,
    pub stages: Vec<FunnelStageResult>,
}

/// Reconstructs the canonical submit→source ack→broker ack→fill lifecycle.
///
/// Missing observations remain explicit; no stage is inferred from a later event.
///
/// # Errors
///
/// Rejects duplicate source event IDs or invalid source authority.
pub fn build_order_funnel(
    input: &FunnelInput,
) -> Result<DerivedAnalytics<OrderFunnel>, AnalyticsError> {
    if input.events.len() > MAX_FUNNEL_EVENTS {
        return Err(AnalyticsError::BatchLimit {
            actual: input.events.len(),
            maximum: MAX_FUNNEL_EVENTS,
        });
    }
    let mut source_ids = BTreeSet::new();
    for event in &input.events {
        if !source_ids.insert(event.source_id.as_str()) {
            return Err(AnalyticsError::DuplicateIdentifier(
                event.source_id.as_str().to_owned(),
            ));
        }
        if event.source_authority == SourceAuthority::Research
            || event.source_authority == SourceAuthority::Derived
        {
            return Err(AnalyticsError::ScopeMismatch {
                field: "funnel_source_authority",
            });
        }
    }

    let quality = QualitySummary::from_iter(input.events.iter().map(|event| &event.quality))
        .with_completeness(input.source_population);
    let absent_state = if quality.completeness == PopulationCompleteness::Complete {
        FunnelStageState::Missing
    } else {
        FunnelStageState::Partial
    };
    let mut stages = Vec::with_capacity(FunnelStage::ORDERED.len());
    for stage in FunnelStage::ORDERED {
        let mut events: Vec<_> = input
            .events
            .iter()
            .filter(|event| event.stage == stage)
            .cloned()
            .collect();
        events.sort_by(|left, right| {
            left.occurred_at
                .cmp(&right.occurred_at)
                .then_with(|| left.source_id.as_str().cmp(right.source_id.as_str()))
        });
        stages.push(FunnelStageResult {
            stage,
            state: if events.is_empty() {
                absent_state
            } else {
                FunnelStageState::Observed
            },
            events,
        });
    }

    let chronology_broken = stages
        .iter()
        .filter_map(|stage| stage.events.first().map(|event| event.occurred_at))
        .try_fold(None, |previous, current| match previous {
            Some(previous) if current < previous => Err(()),
            _ => Ok(Some(current)),
        })
        .is_err();
    let has_missing = stages
        .iter()
        .any(|stage| stage.state != FunnelStageState::Observed);
    let mut warnings = Vec::new();
    if chronology_broken {
        warnings.push(warning(
            "FUNNEL_TIME_ORDER_CONFLICT",
            "Observed source timestamps conflict with canonical lifecycle order",
        ));
    }
    if has_missing {
        warnings.push(warning(
            "FUNNEL_STAGE_NOT_OBSERVED",
            "At least one lifecycle stage is explicitly missing or partial",
        ));
    }
    let panel_state = if has_missing
        || chronology_broken
        || quality.completeness != PopulationCompleteness::Complete
    {
        PanelState::Partial
    } else {
        PanelState::Ok
    };

    Ok(DerivedAnalytics::new(
        FORMULA_VERSION,
        &quality,
        panel_state,
        warnings,
        OrderFunnel {
            order_id: input.order_id.clone(),
            stages,
        },
    ))
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone as _;
    use execution_contracts::FreshnessState;

    use super::*;

    fn event(stage: FunnelStage, id: &str, second: u32) -> FunnelEvent {
        FunnelEvent {
            stage,
            source_authority: if stage == FunnelStage::BrokerAck {
                SourceAuthority::Broker
            } else {
                SourceAuthority::Execution
            },
            source_id: CanonicalId::parse(id).unwrap(),
            occurred_at: Utc.with_ymd_and_hms(2026, 8, 21, 0, 0, second).unwrap(),
            quantity: None,
            quality: FactQuality {
                source_authority: SourceAuthority::Execution,
                freshness_state: FreshnessState::Ok,
                completeness: PopulationCompleteness::Complete,
                as_of: Some(Utc.with_ymd_and_hms(2026, 8, 21, 0, 0, second).unwrap()),
            },
        }
    }

    #[test]
    fn emits_all_stages_and_never_fabricates_missing_ack() {
        let output = build_order_funnel(&FunnelInput {
            order_id: CanonicalId::parse("ord-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            events: vec![
                event(FunnelStage::Submit, "submit-1", 1),
                event(FunnelStage::Fill, "fill-1", 4),
            ],
        })
        .unwrap();
        assert_eq!(output.panel_state, PanelState::Partial);
        assert_eq!(output.data.stages.len(), 4);
        assert_eq!(output.data.stages[1].state, FunnelStageState::Missing);
        assert_eq!(output.data.stages[2].state, FunnelStageState::Missing);
    }

    #[test]
    fn partial_source_marks_absent_stage_partial_not_missing() {
        let output = build_order_funnel(&FunnelInput {
            order_id: CanonicalId::parse("ord-1").unwrap(),
            source_population: PopulationCompleteness::Partial,
            events: vec![event(FunnelStage::Submit, "submit-1", 1)],
        })
        .unwrap();
        assert_eq!(output.data.stages[1].state, FunnelStageState::Partial);
    }

    #[test]
    fn keeps_multiple_fill_facts_in_deterministic_order() {
        let output = build_order_funnel(&FunnelInput {
            order_id: CanonicalId::parse("ord-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            events: vec![
                event(FunnelStage::Fill, "fill-b", 4),
                event(FunnelStage::Fill, "fill-a", 4),
            ],
        })
        .unwrap();
        let fills = &output.data.stages[3].events;
        assert_eq!(fills[0].source_id.as_str(), "fill-a");
        assert_eq!(fills[1].source_id.as_str(), "fill-b");
    }

    #[test]
    fn rejects_unbounded_funnel_history() {
        let input = FunnelInput {
            order_id: CanonicalId::parse("ord-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            events: vec![event(FunnelStage::Fill, "fill-1", 1); MAX_FUNNEL_EVENTS + 1],
        };
        assert!(matches!(
            build_order_funnel(&input),
            Err(AnalyticsError::BatchLimit { .. })
        ));
    }
}
