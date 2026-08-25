#![forbid(unsafe_code)]

use std::{future::Future, pin::Pin, time::Duration};

use chrono::{DateTime, Utc};
use paper_source_contract::{
    OpaqueToken, PaperReadRequest, ReadOutcome, SnapshotResourceCounts, SourceFailureKind,
};
use paper_source_ingestor::{
    D4IngestionConfig, D4ResumeCheckpoint, D4ResumeCheckpointPhase, IngestionEffect,
    MappedObservation, PaperIngestionCoordinator,
};
use paper_source_transport::{PaperSourceClient, PaperTransportError};
use projection_core::{ProjectionEpochStatus, ProjectionScope};
use projection_store_pg::{
    D4BaselineCommitInput, D4CommitOutcome, D4EventPageCommitInput, D4ProjectionWrite,
    D4QualificationSnapshot, D4ResourceCounts, D4ResumePhase, D4SensitiveValue,
    D4SnapshotLeaseInput, PgProjectionStore, StoreError,
};
use serde::Serialize;
use thiserror::Error;
use tokio::time::Instant;
use uuid::Uuid;

pub const D4_QUALIFICATION_REPORT_SCHEMA: &str = "portal.execution.d4.qualification-run.v1";

pub type SourceReadFuture<'a> =
    Pin<Box<dyn Future<Output = Result<ReadOutcome, PaperTransportError>> + Send + 'a>>;

/// Minimal source boundary used by the one-shot runner and deterministic tests.
pub trait PaperSourceReader: Send + Sync {
    fn execute<'a>(&'a self, request: &'a PaperReadRequest) -> SourceReadFuture<'a>;
}

impl PaperSourceReader for PaperSourceClient {
    fn execute<'a>(&'a self, request: &'a PaperReadRequest) -> SourceReadFuture<'a> {
        Box::pin(async move { self.execute(request).await })
    }
}

#[derive(Debug, Clone)]
pub struct D4QualificationRunConfig {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub page_size: u16,
    pub poll_interval_ms: i64,
    pub capability_snapshot_id: String,
    pub maximum_requests: usize,
    pub maximum_elapsed: Duration,
    pub maximum_transient_retries: u8,
    pub maximum_retry_delay: Duration,
    pub maximum_freshness_age: Duration,
}

impl D4QualificationRunConfig {
    fn validate(&self) -> Result<(), RunnerError> {
        if self.scope.environment != "paper"
            || self.page_size != 250
            || !(1..=10_000).contains(&self.maximum_requests)
            || self.maximum_elapsed < Duration::from_secs(1)
            || self.maximum_elapsed > Duration::from_secs(7_200)
            || self.maximum_transient_retries > 3
            || self.maximum_retry_delay.is_zero()
            || self.maximum_retry_delay > Duration::from_secs(30)
            || self.maximum_freshness_age.is_zero()
            || self.maximum_freshness_age > Duration::from_secs(300)
        {
            return Err(RunnerError::UnsafeConfiguration);
        }
        Ok(())
    }

    fn ingestion_config(&self) -> D4IngestionConfig {
        D4IngestionConfig {
            scope: self.scope.clone(),
            epoch_id: self.epoch_id,
            epoch_status: ProjectionEpochStatus::Building,
            page_size: self.page_size,
            poll_interval_ms: self.poll_interval_ms,
            capability_snapshot_id: self.capability_snapshot_id.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum D4AuthorityState {
    Disabled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct D4QualificationAuthority {
    pub query: D4AuthorityState,
    pub analytics: D4AuthorityState,
    pub sse: D4AuthorityState,
    pub commands: D4AuthorityState,
    pub activation: D4AuthorityState,
}

impl Default for D4QualificationAuthority {
    fn default() -> Self {
        Self {
            query: D4AuthorityState::Disabled,
            analytics: D4AuthorityState::Disabled,
            sse: D4AuthorityState::Disabled,
            commands: D4AuthorityState::Disabled,
            activation: D4AuthorityState::Disabled,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct D4QualificationRunReport {
    pub schema_version: String,
    pub epoch_id: Uuid,
    pub epoch_status: ProjectionEpochStatus,
    pub requests_total: usize,
    pub retries_total: u8,
    pub baseline_observations_committed_this_run: usize,
    pub event_observations_committed_this_run: usize,
    pub elapsed_ms: u64,
    pub freshness_age_ms: u64,
    pub snapshot: D4QualificationSnapshot,
    pub source_read_complete: bool,
    pub authority: D4QualificationAuthority,
}

#[derive(Default)]
struct RunCounters {
    requests: usize,
    retries: u8,
    baseline_observations: usize,
    event_observations: usize,
}

pub struct D4QualificationRunner<S> {
    source: S,
    store: PgProjectionStore,
    config: D4QualificationRunConfig,
    coordinator: PaperIngestionCoordinator,
}

impl<S> D4QualificationRunner<S>
where
    S: PaperSourceReader,
{
    /// Creates or resumes one runner bound to an existing BUILDING epoch.
    ///
    /// # Errors
    ///
    /// Rejects unsafe budgets, non-BUILDING authority, scope drift or an
    /// invalid/expired durable checkpoint before making a source request.
    pub async fn load(
        source: S,
        store: PgProjectionStore,
        config: D4QualificationRunConfig,
        now: DateTime<Utc>,
    ) -> Result<Self, RunnerError> {
        config.validate()?;
        if store.load_epoch_status(config.epoch_id).await? != ProjectionEpochStatus::Building {
            return Err(RunnerError::BuildingEpochRequired);
        }
        let ingestion_config = config.ingestion_config();
        let coordinator = match store
            .load_d4_resume_state(&config.scope, config.epoch_id)
            .await
        {
            Ok(resume) => PaperIngestionCoordinator::resume(
                ingestion_config,
                resume_checkpoint(resume)?,
                now,
            )?,
            Err(StoreError::D4SnapshotLeaseNotFound) => {
                PaperIngestionCoordinator::new(ingestion_config)?
            }
            Err(error) => return Err(error.into()),
        };
        if coordinator.rebuild_required() {
            return Err(RunnerError::FreshBuildingEpochRequired);
        }
        Ok(Self {
            source,
            store,
            config,
            coordinator,
        })
    }

    /// Runs a finite D4 snapshot plus event catch-up and returns redacted
    /// evidence. It cannot activate or publish the epoch.
    ///
    /// # Errors
    ///
    /// Aborts on any budget, transport, source, cursor, persistence, replay,
    /// freshness or BUILDING-authority violation.
    pub async fn run_until_caught_up(&mut self) -> Result<D4QualificationRunReport, RunnerError> {
        let started = Instant::now();
        let mut counters = RunCounters::default();
        loop {
            if started.elapsed() >= self.config.maximum_elapsed {
                return Err(RunnerError::ElapsedBudgetExceeded);
            }
            if counters.requests >= self.config.maximum_requests {
                return Err(RunnerError::RequestBudgetExceeded);
            }
            let request = self
                .coordinator
                .next_request()
                .ok_or(RunnerError::CoordinatorStalled)?;
            let outcome = self.source.execute(&request).await?;
            counters.requests += 1;
            let source_read_at = Utc::now();
            let effect = self.coordinator.accept(outcome, source_read_at)?;
            match effect {
                IngestionEffect::SnapshotLeaseReady { .. } => self.persist_snapshot_lease().await?,
                IngestionEffect::SnapshotPageAccepted { .. } => {}
                IngestionEffect::BaselineReady {
                    observation_count, ..
                } => {
                    counters.baseline_observations = observation_count;
                    self.persist_baseline().await?;
                }
                IngestionEffect::EventPageReady {
                    observation_count,
                    caught_up,
                } => {
                    counters.event_observations = counters
                        .event_observations
                        .checked_add(observation_count)
                        .ok_or(RunnerError::NumericOverflow)?;
                    self.persist_event_page().await?;
                    if caught_up {
                        return self.build_report(started.elapsed(), counters).await;
                    }
                }
                IngestionEffect::RetryCurrentRequest {
                    kind,
                    retry_after_seconds,
                } => {
                    self.retry_source(kind, retry_after_seconds, started, &mut counters)
                        .await?;
                }
                IngestionEffect::FreshBuildingEpochRequired => {
                    return Err(RunnerError::FreshBuildingEpochRequired);
                }
                IngestionEffect::SnapshotLeaseDurable
                | IngestionEffect::BaselineDurable
                | IngestionEffect::EventPageDurable => {
                    return Err(RunnerError::UnexpectedCoordinatorEffect);
                }
            }
        }
    }

    async fn persist_snapshot_lease(&mut self) -> Result<(), RunnerError> {
        let pending = self
            .coordinator
            .pending_snapshot_lease()
            .ok_or(RunnerError::CoordinatorStalled)?;
        self.store
            .persist_d4_snapshot_lease(&D4SnapshotLeaseInput {
                scope: self.config.scope.clone(),
                epoch_id: pending.epoch_id,
                snapshot: sensitive(&pending.snapshot)?,
                initial_event_cursor: sensitive(&pending.initial_event_cursor)?,
                snapshot_digest: pending.snapshot_digest,
                snapshot_created_at: pending.snapshot_created_at,
                snapshot_expires_at: pending.expires_at,
                snapshot_accepted_at: pending.accepted_at,
                expected_counts: resource_counts(&pending.expected_counts),
            })
            .await?;
        self.coordinator.acknowledge_snapshot_lease()?;
        Ok(())
    }

    async fn persist_baseline(&mut self) -> Result<(), RunnerError> {
        let pending = self
            .coordinator
            .pending_baseline()
            .cloned()
            .ok_or(RunnerError::CoordinatorStalled)?;
        let outcome = self
            .store
            .commit_d4_baseline(&D4BaselineCommitInput {
                scope: self.config.scope.clone(),
                epoch_id: pending.epoch_id,
                snapshot_digest: pending.snapshot_digest,
                observations: projection_writes(pending.observations),
                source_read_at: pending.source_read_at,
                committed_at: Utc::now(),
            })
            .await?;
        require_durable(outcome)?;
        self.coordinator.acknowledge_baseline_commit()?;
        Ok(())
    }

    async fn persist_event_page(&mut self) -> Result<(), RunnerError> {
        let pending = self
            .coordinator
            .pending_event_page()
            .cloned()
            .ok_or(RunnerError::CoordinatorStalled)?;
        let outcome = self
            .store
            .commit_d4_event_page(&D4EventPageCommitInput {
                scope: self.config.scope.clone(),
                epoch_id: pending.epoch_id,
                previous_cursor: sensitive(&pending.previous_cursor)?,
                next_cursor: sensitive(&pending.next_cursor)?,
                observations: projection_writes(pending.observations),
                first_source_sequence: pending.first_source_sequence,
                last_source_sequence: pending.last_source_sequence,
                source_head_sequence: pending.source_head_sequence,
                caught_up: pending.caught_up,
                source_read_at: pending.source_read_at,
                committed_at: Utc::now(),
            })
            .await?;
        require_durable(outcome)?;
        self.coordinator.acknowledge_event_commit()?;
        Ok(())
    }

    async fn retry_source(
        &self,
        kind: SourceFailureKind,
        retry_after_seconds: Option<u64>,
        started: Instant,
        counters: &mut RunCounters,
    ) -> Result<(), RunnerError> {
        if !matches!(
            kind,
            SourceFailureKind::RateLimited | SourceFailureKind::SourceUnavailable
        ) || counters.retries >= self.config.maximum_transient_retries
        {
            return Err(RunnerError::SourceRetryBudgetExceeded);
        }
        counters.retries = counters.retries.saturating_add(1);
        let retry_delay = Duration::from_secs(retry_after_seconds.unwrap_or(1));
        if retry_delay > self.config.maximum_retry_delay
            || started.elapsed().saturating_add(retry_delay) >= self.config.maximum_elapsed
        {
            return Err(RunnerError::SourceRetryDelayExceeded);
        }
        tokio::time::sleep(retry_delay).await;
        Ok(())
    }

    async fn build_report(
        &self,
        elapsed: Duration,
        counters: RunCounters,
    ) -> Result<D4QualificationRunReport, RunnerError> {
        let snapshot = self
            .store
            .load_d4_qualification_snapshot(&self.config.scope, self.config.epoch_id)
            .await?;
        if snapshot.epoch_status != ProjectionEpochStatus::Building
            || snapshot.phase != D4ResumePhase::Streaming
            || snapshot.baseline_applied_counts != Some(snapshot.expected_counts)
            || !snapshot.caught_up
            || !snapshot.replay_parity
            || snapshot.blocker_count != 0
            || snapshot.activation_authorized
        {
            return Err(RunnerError::QualificationInvariant);
        }
        let now = Utc::now();
        let freshness_age = now
            .signed_duration_since(snapshot.last_source_read_at)
            .to_std()
            .map_err(|_| RunnerError::FutureSourceRead)?;
        if freshness_age > self.config.maximum_freshness_age {
            return Err(RunnerError::FreshnessExceeded);
        }
        Ok(D4QualificationRunReport {
            schema_version: D4_QUALIFICATION_REPORT_SCHEMA.to_owned(),
            epoch_id: self.config.epoch_id,
            epoch_status: snapshot.epoch_status,
            requests_total: counters.requests,
            retries_total: counters.retries,
            baseline_observations_committed_this_run: counters.baseline_observations,
            event_observations_committed_this_run: counters.event_observations,
            elapsed_ms: u64::try_from(elapsed.as_millis())
                .map_err(|_| RunnerError::NumericOverflow)?,
            freshness_age_ms: u64::try_from(freshness_age.as_millis())
                .map_err(|_| RunnerError::NumericOverflow)?,
            snapshot,
            source_read_complete: true,
            authority: D4QualificationAuthority::default(),
        })
    }
}

fn resume_checkpoint(
    state: projection_store_pg::D4ResumeState,
) -> Result<D4ResumeCheckpoint, RunnerError> {
    Ok(D4ResumeCheckpoint {
        epoch_id: state.epoch_id,
        phase: match state.phase {
            D4ResumePhase::SnapshotLeased => D4ResumeCheckpointPhase::SnapshotLeased,
            D4ResumePhase::BaselineCommitted => D4ResumeCheckpointPhase::BaselineCommitted,
            D4ResumePhase::Streaming => D4ResumeCheckpointPhase::Streaming,
            D4ResumePhase::RebuildRequired => D4ResumeCheckpointPhase::RebuildRequired,
        },
        snapshot: state
            .snapshot
            .map(|value| OpaqueToken::parse(value.as_str()))
            .transpose()?,
        event_cursor: OpaqueToken::parse(state.event_cursor.as_str())?,
        snapshot_digest: state.snapshot_digest,
        snapshot_created_at: state.snapshot_created_at,
        snapshot_expires_at: state.snapshot_expires_at,
        expected_counts: SnapshotResourceCounts {
            orders: state.expected_counts.orders,
            fills: state.expected_counts.fills,
            positions: state.expected_counts.positions,
        },
    })
}

fn sensitive(value: &OpaqueToken) -> Result<D4SensitiveValue, StoreError> {
    D4SensitiveValue::parse(value.as_str())
}

const fn resource_counts(value: &SnapshotResourceCounts) -> D4ResourceCounts {
    D4ResourceCounts {
        orders: value.orders,
        fills: value.fills,
        positions: value.positions,
    }
}

fn projection_writes(values: Vec<MappedObservation>) -> Vec<D4ProjectionWrite> {
    values
        .into_iter()
        .map(|value| D4ProjectionWrite {
            stream_key: value.stream_key,
            observation: value.observation,
        })
        .collect()
}

fn require_durable(outcome: D4CommitOutcome) -> Result<(), RunnerError> {
    match outcome {
        D4CommitOutcome::Written | D4CommitOutcome::AlreadyDurable => Ok(()),
        D4CommitOutcome::RebuildRequired => Err(RunnerError::FreshBuildingEpochRequired),
    }
}

#[derive(Debug, Error)]
pub enum RunnerError {
    #[error("D4 qualification runner configuration is outside the safety envelope")]
    UnsafeConfiguration,
    #[error("D4 qualification requires one explicit BUILDING epoch")]
    BuildingEpochRequired,
    #[error("D4 qualification exceeded its source request budget")]
    RequestBudgetExceeded,
    #[error("D4 qualification exceeded its elapsed-time budget")]
    ElapsedBudgetExceeded,
    #[error("D4 source retry budget was exceeded")]
    SourceRetryBudgetExceeded,
    #[error("D4 source requested an unsafe retry delay")]
    SourceRetryDelayExceeded,
    #[error("D4 coordinator has no legal next action")]
    CoordinatorStalled,
    #[error("D4 coordinator emitted an internal-only acknowledgement effect")]
    UnexpectedCoordinatorEffect,
    #[error("D4 source requires a fresh BUILDING epoch")]
    FreshBuildingEpochRequired,
    #[error("D4 qualification evidence violates a BUILDING/parity/blocker invariant")]
    QualificationInvariant,
    #[error("D4 source read timestamp is in the future")]
    FutureSourceRead,
    #[error("D4 source freshness exceeded the qualification bound")]
    FreshnessExceeded,
    #[error("D4 qualification counter overflowed")]
    NumericOverflow,
    #[error(transparent)]
    Contract(#[from] paper_source_contract::ContractError),
    #[error(transparent)]
    Ingestor(#[from] paper_source_ingestor::IngestorError),
    #[error(transparent)]
    Transport(#[from] PaperTransportError),
    #[error(transparent)]
    Store(#[from] StoreError),
}

#[cfg(test)]
mod tests;
