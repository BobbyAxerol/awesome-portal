#![forbid(unsafe_code)]

use std::sync::{
    atomic::{AtomicU64, AtomicUsize, Ordering},
    Arc,
};
use std::time::Duration;

use chrono::{DateTime, Utc};
use execution_contracts::{FreshnessState, SourceAuthority, SourceCompleteness, SourceCursor};
use projection_core::{
    server_jitter_deadline, ProjectionCursor, ProjectionEntityKind, ProjectionObservation,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;
use tokio::sync::broadcast;
use uuid::Uuid;

pub const REALTIME_SCHEMA_VERSION: &str = "execution.realtime.v1";
pub const COMMAND_CENTER_RESOURCE: &str = "execution:command-center";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RealtimeFreshness {
    pub state: FreshnessState,
    pub policy_version: String,
}

/// One typed projection delta carried on the screen-level multiplexed stream.
/// The projection cursor is the SSE `id`; source cursor/sequence remain facts,
/// never substitutes for Portal-edge delivery continuity.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RealtimeEnvelope {
    pub event_type: String,
    pub schema_version: String,
    pub workspace_id: String,
    pub environment: String,
    pub projection_epoch: Uuid,
    pub projection_sequence: u64,
    pub entity_kind: ProjectionEntityKind,
    pub entity_id: String,
    pub source_authority: SourceAuthority,
    pub source_cursor: Option<SourceCursor>,
    pub source_sequence: Option<i64>,
    pub source_completeness: SourceCompleteness,
    pub as_of: Option<DateTime<Utc>>,
    pub source_read_at: DateTime<Utc>,
    pub projected_at: DateTime<Utc>,
    pub freshness: FreshnessState,
    pub freshness_policy_version: String,
    pub source_discontinuity: bool,
    pub payload: Value,
}

impl RealtimeEnvelope {
    #[must_use]
    pub fn from_observation(
        workspace_id: impl Into<String>,
        environment: impl Into<String>,
        epoch_id: Uuid,
        projection_sequence: u64,
        observation: ProjectionObservation,
        projected_at: DateTime<Utc>,
        freshness: RealtimeFreshness,
    ) -> Self {
        let event_type = match observation.entity.kind {
            ProjectionEntityKind::Order => "order.updated",
            ProjectionEntityKind::Fill => "fill.recorded",
            ProjectionEntityKind::Position => "position.updated",
            ProjectionEntityKind::Runtime => "runtime.updated",
            ProjectionEntityKind::Account => "account.updated",
            ProjectionEntityKind::BrokerBinding => "broker_binding.updated",
            ProjectionEntityKind::Reconciliation => "reconciliation.updated",
            ProjectionEntityKind::Performance => "performance.updated",
            ProjectionEntityKind::Operation => "operation.updated",
        };
        Self {
            event_type: event_type.to_owned(),
            schema_version: REALTIME_SCHEMA_VERSION.to_owned(),
            workspace_id: workspace_id.into(),
            environment: environment.into(),
            projection_epoch: epoch_id,
            projection_sequence,
            entity_kind: observation.entity.kind,
            entity_id: observation.entity.entity_id.as_str().to_owned(),
            source_authority: observation.source_authority,
            source_cursor: observation.source_cursor,
            source_sequence: observation.source_sequence,
            source_completeness: observation.source_completeness,
            as_of: observation.as_of,
            source_read_at: observation.source_read_at,
            projected_at,
            freshness: freshness.state,
            freshness_policy_version: freshness.policy_version,
            source_discontinuity: false,
            payload: observation.payload,
        }
    }

    #[must_use]
    pub const fn cursor(&self) -> ProjectionCursor {
        ProjectionCursor {
            epoch_id: self.projection_epoch,
            sequence: self.projection_sequence,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GapReason {
    HistoryEvicted,
    ReplayWindowExceeded,
    SlowConsumer,
    EpochChanged,
    SourceDiscontinuity,
    ProjectionSequenceGap,
    CursorAhead,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GapEnvelope {
    pub event_type: &'static str,
    pub schema_version: &'static str,
    pub reason: GapReason,
    pub last_good_cursor: Option<String>,
    pub active_epoch_id: Option<Uuid>,
    pub earliest_available_sequence: Option<u64>,
    pub latest_available_sequence: Option<u64>,
    pub missed_events: Option<u64>,
    pub resnapshot_not_before: Option<DateTime<Utc>>,
}

impl GapEnvelope {
    #[must_use]
    pub fn new(reason: GapReason, last_good_cursor: Option<ProjectionCursor>) -> Self {
        Self {
            event_type: "projection.gap",
            schema_version: REALTIME_SCHEMA_VERSION,
            reason,
            last_good_cursor: last_good_cursor.map(|cursor| cursor.to_string()),
            active_epoch_id: None,
            earliest_available_sequence: None,
            latest_available_sequence: None,
            missed_events: None,
            resnapshot_not_before: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct HubMetrics {
    pub active_subscribers: usize,
    pub published_events: u64,
    pub slow_consumer_gaps: u64,
}

#[derive(Debug)]
struct Metrics {
    active_subscribers: AtomicUsize,
    published_events: AtomicU64,
    slow_consumer_gaps: AtomicU64,
}

/// Bounded fan-out shared by every screen subscription in one edge process.
/// Tokio broadcast intentionally surfaces lag instead of allocating an
/// unbounded per-client queue.
#[derive(Debug, Clone)]
pub struct RealtimeHub {
    sender: broadcast::Sender<Arc<RealtimeEnvelope>>,
    metrics: Arc<Metrics>,
}

impl RealtimeHub {
    /// Creates a bounded fan-out hub.
    ///
    /// # Errors
    ///
    /// Rejects capacities outside the reviewed operational envelope.
    pub fn new(capacity: usize) -> Result<Self, RealtimeError> {
        if !(8..=4096).contains(&capacity) {
            return Err(RealtimeError::InvalidCapacity);
        }
        let (sender, _) = broadcast::channel(capacity);
        Ok(Self {
            sender,
            metrics: Arc::new(Metrics {
                active_subscribers: AtomicUsize::new(0),
                published_events: AtomicU64::new(0),
                slow_consumer_gaps: AtomicU64::new(0),
            }),
        })
    }

    #[must_use]
    pub fn subscribe(
        &self,
        workspace_id: impl Into<String>,
        environment: impl Into<String>,
        cursor: ProjectionCursor,
        client_stable_id: impl Into<String>,
        maximum_epoch_jitter: Duration,
    ) -> RealtimeSubscription {
        self.metrics
            .active_subscribers
            .fetch_add(1, Ordering::Relaxed);
        RealtimeSubscription {
            receiver: self.sender.subscribe(),
            workspace_id: workspace_id.into(),
            environment: environment.into(),
            last_good_cursor: cursor,
            client_stable_id: client_stable_id.into(),
            maximum_epoch_jitter,
            metrics: Arc::clone(&self.metrics),
            terminal: false,
        }
    }

    pub fn publish(&self, event: RealtimeEnvelope) {
        self.metrics
            .published_events
            .fetch_add(1, Ordering::Relaxed);
        // No receivers is normal before the feature flag is enabled.
        let _ = self.sender.send(Arc::new(event));
    }

    #[must_use]
    pub fn metrics(&self) -> HubMetrics {
        HubMetrics {
            active_subscribers: self.metrics.active_subscribers.load(Ordering::Relaxed),
            published_events: self.metrics.published_events.load(Ordering::Relaxed),
            slow_consumer_gaps: self.metrics.slow_consumer_gaps.load(Ordering::Relaxed),
        }
    }
}

pub struct RealtimeSubscription {
    receiver: broadcast::Receiver<Arc<RealtimeEnvelope>>,
    workspace_id: String,
    environment: String,
    last_good_cursor: ProjectionCursor,
    client_stable_id: String,
    maximum_epoch_jitter: Duration,
    metrics: Arc<Metrics>,
    terminal: bool,
}

impl RealtimeSubscription {
    pub fn advance_after_replay(&mut self, cursor: ProjectionCursor) {
        self.last_good_cursor = cursor;
    }

    /// Returns one in-scope event or a terminal typed gap. Duplicates produced
    /// by the replay/live hand-off are suppressed by cursor.
    pub async fn next(&mut self) -> SubscriptionDelivery {
        if self.terminal {
            return SubscriptionDelivery::Closed;
        }
        loop {
            match self.receiver.recv().await {
                Ok(event) => {
                    if event.workspace_id != self.workspace_id
                        || event.environment != self.environment
                    {
                        continue;
                    }
                    let cursor = event.cursor();
                    if cursor.epoch_id == self.last_good_cursor.epoch_id
                        && cursor.sequence <= self.last_good_cursor.sequence
                    {
                        continue;
                    }
                    if cursor.epoch_id != self.last_good_cursor.epoch_id {
                        self.terminal = true;
                        let mut gap =
                            GapEnvelope::new(GapReason::EpochChanged, Some(self.last_good_cursor));
                        gap.active_epoch_id = Some(cursor.epoch_id);
                        gap.resnapshot_not_before = Some(server_jitter_deadline(
                            cursor.epoch_id,
                            &self.client_stable_id,
                            Utc::now(),
                            self.maximum_epoch_jitter,
                        ));
                        return SubscriptionDelivery::Gap(gap);
                    }
                    if event.source_discontinuity {
                        self.terminal = true;
                        return SubscriptionDelivery::Gap(GapEnvelope::new(
                            GapReason::SourceDiscontinuity,
                            Some(self.last_good_cursor),
                        ));
                    }
                    if cursor.sequence != self.last_good_cursor.sequence.saturating_add(1) {
                        self.terminal = true;
                        return SubscriptionDelivery::Gap(GapEnvelope::new(
                            GapReason::ProjectionSequenceGap,
                            Some(self.last_good_cursor),
                        ));
                    }
                    self.last_good_cursor = cursor;
                    return SubscriptionDelivery::Event(event);
                }
                Err(broadcast::error::RecvError::Lagged(missed)) => {
                    self.metrics
                        .slow_consumer_gaps
                        .fetch_add(1, Ordering::Relaxed);
                    self.terminal = true;
                    let mut gap =
                        GapEnvelope::new(GapReason::SlowConsumer, Some(self.last_good_cursor));
                    gap.missed_events = Some(missed);
                    return SubscriptionDelivery::Gap(gap);
                }
                Err(broadcast::error::RecvError::Closed) => {
                    self.terminal = true;
                    return SubscriptionDelivery::Closed;
                }
            }
        }
    }
}

impl Drop for RealtimeSubscription {
    fn drop(&mut self) {
        self.metrics
            .active_subscribers
            .fetch_sub(1, Ordering::Relaxed);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SubscriptionDelivery {
    Event(Arc<RealtimeEnvelope>),
    Gap(GapEnvelope),
    Closed,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RealtimeError {
    #[error("realtime queue capacity is outside the bounded range")]
    InvalidCapacity,
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone as _;
    use execution_contracts::CanonicalId;
    use projection_core::{ProjectionEntityKey, ProjectionObservation};

    use super::*;

    fn event(epoch: Uuid, sequence: u64) -> RealtimeEnvelope {
        let source_sequence = i64::try_from(sequence).unwrap();
        RealtimeEnvelope::from_observation(
            "ws-one",
            "paper",
            epoch,
            sequence,
            ProjectionObservation {
                ingestion_id: CanonicalId::parse(format!("ing-{sequence}")).unwrap(),
                entity: ProjectionEntityKey {
                    kind: ProjectionEntityKind::Order,
                    entity_id: CanonicalId::parse(format!("order-{sequence}")).unwrap(),
                },
                source_authority: SourceAuthority::Execution,
                as_of: Some(Utc.timestamp_opt(source_sequence, 0).unwrap()),
                source_read_at: Utc.timestamp_opt(source_sequence, 0).unwrap(),
                source_cursor: None,
                source_sequence: Some(source_sequence),
                source_completeness: SourceCompleteness::EventSourced,
                poll_interval_ms: None,
                adapter_version: "v1".to_owned(),
                capability_snapshot_id: "caps-v1".to_owned(),
                payload: serde_json::json!({"price": "1.2500"}),
            },
            Utc.timestamp_opt(source_sequence, 0).unwrap(),
            RealtimeFreshness {
                state: FreshnessState::Ok,
                policy_version: "paper.realtime.v1".to_owned(),
            },
        )
    }

    #[tokio::test]
    async fn one_publish_fans_out_to_one_hundred_screen_streams() {
        let hub = RealtimeHub::new(128).unwrap();
        let epoch = Uuid::now_v7();
        let mut subscribers = (0..100)
            .map(|_| {
                hub.subscribe(
                    "ws-one",
                    "paper",
                    ProjectionCursor {
                        epoch_id: epoch,
                        sequence: 0,
                    },
                    "session-1",
                    Duration::ZERO,
                )
            })
            .collect::<Vec<_>>();
        hub.publish(event(epoch, 1));
        for subscriber in &mut subscribers {
            let SubscriptionDelivery::Event(received) = subscriber.next().await else {
                panic!("expected a projection event");
            };
            assert_eq!(received.projection_sequence, 1);
        }
        assert_eq!(hub.metrics().active_subscribers, 100);
    }

    #[tokio::test]
    async fn slow_consumer_gets_one_terminal_gap_instead_of_unbounded_memory() {
        let hub = RealtimeHub::new(8).unwrap();
        let epoch = Uuid::now_v7();
        let mut subscriber = hub.subscribe(
            "ws-one",
            "paper",
            ProjectionCursor {
                epoch_id: epoch,
                sequence: 0,
            },
            "session-1",
            Duration::ZERO,
        );
        for sequence in 1..=32 {
            hub.publish(event(epoch, sequence));
        }
        let SubscriptionDelivery::Gap(gap) = subscriber.next().await else {
            panic!("expected a slow-consumer gap");
        };
        assert_eq!(gap.reason, GapReason::SlowConsumer);
        assert!(gap.missed_events.is_some_and(|missed| missed > 0));
        assert_eq!(subscriber.next().await, SubscriptionDelivery::Closed);
        assert_eq!(hub.metrics().slow_consumer_gaps, 1);
    }

    #[tokio::test]
    async fn replay_live_race_duplicates_are_suppressed_but_real_gaps_fail_closed() {
        let hub = RealtimeHub::new(8).unwrap();
        let epoch = Uuid::now_v7();
        let mut subscriber = hub.subscribe(
            "ws-one",
            "paper",
            ProjectionCursor {
                epoch_id: epoch,
                sequence: 3,
            },
            "session-1",
            Duration::ZERO,
        );
        hub.publish(event(epoch, 4));
        hub.publish(event(epoch, 5));
        subscriber.advance_after_replay(ProjectionCursor {
            epoch_id: epoch,
            sequence: 4,
        });
        let SubscriptionDelivery::Event(received) = subscriber.next().await else {
            panic!("expected sequence five");
        };
        assert_eq!(received.projection_sequence, 5);

        hub.publish(event(epoch, 7));
        let SubscriptionDelivery::Gap(gap) = subscriber.next().await else {
            panic!("expected a discontinuity gap");
        };
        assert_eq!(gap.reason, GapReason::ProjectionSequenceGap);
    }

    #[tokio::test]
    async fn live_epoch_change_carries_active_epoch_and_stable_resnapshot_deadline() {
        let hub = RealtimeHub::new(8).unwrap();
        let previous_epoch = Uuid::now_v7();
        let active_epoch = Uuid::now_v7();
        let mut subscriber = hub.subscribe(
            "ws-one",
            "paper",
            ProjectionCursor {
                epoch_id: previous_epoch,
                sequence: 3,
            },
            "session-stable",
            Duration::from_secs(10),
        );
        hub.publish(event(active_epoch, 1));
        let before = Utc::now();
        let SubscriptionDelivery::Gap(gap) = subscriber.next().await else {
            panic!("expected an epoch-change gap");
        };
        let after = Utc::now() + chrono::TimeDelta::seconds(10);
        assert_eq!(gap.reason, GapReason::EpochChanged);
        assert_eq!(gap.active_epoch_id, Some(active_epoch));
        assert!(gap
            .resnapshot_not_before
            .is_some_and(|value| value >= before && value <= after));
    }
}
