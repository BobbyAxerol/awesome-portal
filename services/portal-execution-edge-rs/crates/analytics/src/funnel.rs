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
    pub event_count: usize,
    pub returned_event_count: usize,
    pub truncated: bool,
    pub events: Vec<FunnelEvent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FunnelWindow {
    LifecycleAndLatest,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderFunnel {
    pub order_id: CanonicalId,
    pub event_count: usize,
    pub returned_event_count: usize,
    pub has_more: bool,
    pub window: FunnelWindow,
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
    validate_funnel_events(&input.events)?;
    let quality = QualitySummary::from_iter(input.events.iter().map(|event| &event.quality))
        .with_completeness(input.source_population);
    let absent_state = if quality.completeness == PopulationCompleteness::Complete {
        FunnelStageState::Missing
    } else {
        FunnelStageState::Partial
    };
    let selected_ids = selected_funnel_event_ids(&input.events);
    let mut stages = Vec::with_capacity(FunnelStage::ORDERED.len());
    for stage in FunnelStage::ORDERED {
        stages.push(materialize_stage(
            &input.events,
            &selected_ids,
            stage,
            absent_state,
        ));
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
    let returned_event_count = stages.iter().map(|stage| stage.returned_event_count).sum();
    let has_more = input.events.len() > returned_event_count;
    if has_more {
        warnings.push(warning(
            "FUNNEL_WINDOWED",
            "Events preserve the earliest observed lifecycle facts plus the latest bounded history",
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
            event_count: input.events.len(),
            returned_event_count,
            has_more,
            window: FunnelWindow::LifecycleAndLatest,
            stages,
        },
    ))
}

fn validate_funnel_events(events: &[FunnelEvent]) -> Result<(), AnalyticsError> {
    let mut source_ids = BTreeSet::new();
    for event in events {
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
    Ok(())
}

fn materialize_stage(
    events: &[FunnelEvent],
    selected_ids: &BTreeSet<&str>,
    stage: FunnelStage,
    absent_state: FunnelStageState,
) -> FunnelStageResult {
    let mut all_events: Vec<_> = events
        .iter()
        .filter(|event| event.stage == stage)
        .cloned()
        .collect();
    all_events.sort_by(|left, right| {
        left.occurred_at
            .cmp(&right.occurred_at)
            .then_with(|| left.source_id.as_str().cmp(right.source_id.as_str()))
    });
    let event_count = all_events.len();
    let events: Vec<_> = all_events
        .into_iter()
        .filter(|event| selected_ids.contains(event.source_id.as_str()))
        .collect();
    let returned_event_count = events.len();
    FunnelStageResult {
        stage,
        state: if event_count == 0 {
            absent_state
        } else {
            FunnelStageState::Observed
        },
        event_count,
        returned_event_count,
        truncated: returned_event_count < event_count,
        events,
    }
}

fn selected_funnel_event_ids(events: &[FunnelEvent]) -> BTreeSet<&str> {
    let mut selected = BTreeSet::new();
    for stage in FunnelStage::ORDERED {
        if let Some(earliest) =
            events
                .iter()
                .filter(|event| event.stage == stage)
                .min_by(|left, right| {
                    left.occurred_at
                        .cmp(&right.occurred_at)
                        .then_with(|| left.source_id.as_str().cmp(right.source_id.as_str()))
                })
        {
            selected.insert(earliest.source_id.as_str());
        }
    }
    let remaining = MAX_FUNNEL_EVENTS.saturating_sub(selected.len());
    let mut latest: Vec<_> = events
        .iter()
        .filter(|event| !selected.contains(event.source_id.as_str()))
        .collect();
    latest.sort_by(|left, right| {
        right
            .occurred_at
            .cmp(&left.occurred_at)
            .then_with(|| right.source_id.as_str().cmp(left.source_id.as_str()))
    });
    selected.extend(
        latest
            .into_iter()
            .take(remaining)
            .map(|event| event.source_id.as_str()),
    );
    selected
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
    fn windows_large_funnel_while_retaining_lifecycle_and_latest_events() {
        let mut events = vec![
            event(FunnelStage::Submit, "submit-1", 1),
            event(FunnelStage::SourceAck, "source-ack-1", 2),
            event(FunnelStage::BrokerAck, "broker-ack-1", 3),
        ];
        events.extend((0..=MAX_FUNNEL_EVENTS).map(|index| {
            let mut item = event(FunnelStage::Fill, &format!("fill-{index:04}"), 4);
            item.occurred_at += chrono::TimeDelta::milliseconds(i64::try_from(index).unwrap());
            item
        }));
        let input = FunnelInput {
            order_id: CanonicalId::parse("ord-1").unwrap(),
            source_population: PopulationCompleteness::Complete,
            events,
        };
        let output = build_order_funnel(&input).unwrap();
        assert_eq!(output.data.returned_event_count, MAX_FUNNEL_EVENTS);
        assert!(output.data.has_more);
        assert_eq!(
            output.data.stages[0].events[0].source_id.as_str(),
            "submit-1"
        );
        assert!(output.data.stages[3].truncated);
        let expected_latest = format!("fill-{MAX_FUNNEL_EVENTS:04}");
        assert_eq!(
            output.data.stages[3]
                .events
                .last()
                .unwrap()
                .source_id
                .as_str(),
            expected_latest
        );
    }
}
