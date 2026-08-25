#![forbid(unsafe_code)]

use chrono::{DateTime, Utc};
use execution_contracts::{CanonicalId, SourceAuthority, SourceCompleteness, SourceCursor};
use paper_source_contract::{
    DeltaOperation, EventsPage, OpaqueToken, PaperReadPayload, PaperReadRequest, PositionRecord,
    ReadOutcome, SnapshotDescriptor, SnapshotPage, SnapshotResource, SnapshotResourceCounts,
    SourceFailureKind, StateDeltaEvent, StateDeltaRecord, MAXIMUM_PAGE_SIZE, MAXIMUM_SNAPSHOT_ROWS,
};
use projection_core::{
    ProjectionEntityKey, ProjectionEntityKind, ProjectionEpochStatus, ProjectionObservation,
    ProjectionOperation, ProjectionScope, SourceSequenceSemantics,
};
use serde_json::{json, Value};
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const D4_MAPPER_VERSION: &str = "paper-source-ingestor.d4.v1";

#[derive(Debug, Clone)]
pub struct D4IngestionConfig {
    pub scope: ProjectionScope,
    pub epoch_id: Uuid,
    pub epoch_status: ProjectionEpochStatus,
    pub page_size: u16,
    pub poll_interval_ms: i64,
    pub capability_snapshot_id: String,
}

impl D4IngestionConfig {
    fn validate(&self) -> Result<(), IngestorError> {
        if self.scope.environment != "paper" {
            return Err(IngestorError::PaperScopeRequired);
        }
        if self.epoch_status != ProjectionEpochStatus::Building {
            return Err(IngestorError::BuildingEpochRequired);
        }
        if !(1..=MAXIMUM_PAGE_SIZE).contains(&self.page_size) {
            return Err(IngestorError::InvalidPageSize);
        }
        if !(250..=300_000).contains(&self.poll_interval_ms) {
            return Err(IngestorError::InvalidPollInterval);
        }
        if self.capability_snapshot_id.is_empty()
            || self.capability_snapshot_id.trim() != self.capability_snapshot_id
            || self.capability_snapshot_id.len() > 128
        {
            return Err(IngestorError::InvalidCapabilityIdentity);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MappedObservation {
    pub stream_key: String,
    pub observation: ProjectionObservation,
}

#[derive(Debug, Clone)]
pub struct PendingBaselineCommit {
    pub epoch_id: Uuid,
    pub expected_epoch_status: ProjectionEpochStatus,
    pub snapshot: OpaqueToken,
    pub initial_event_cursor: OpaqueToken,
    pub snapshot_digest: String,
    pub expected_counts: SnapshotResourceCounts,
    pub observations: Vec<MappedObservation>,
    pub source_read_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct PendingSnapshotLease {
    pub epoch_id: Uuid,
    pub expected_epoch_status: ProjectionEpochStatus,
    pub snapshot: OpaqueToken,
    pub initial_event_cursor: OpaqueToken,
    pub snapshot_digest: String,
    pub snapshot_created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub expected_counts: SnapshotResourceCounts,
    pub accepted_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct PendingEventCommit {
    pub epoch_id: Uuid,
    pub expected_epoch_status: ProjectionEpochStatus,
    pub previous_cursor: OpaqueToken,
    pub next_cursor: OpaqueToken,
    pub observations: Vec<MappedObservation>,
    pub first_source_sequence: Option<u64>,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: u64,
    pub source_read_at: DateTime<Utc>,
    pub caught_up: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IngestionEffect {
    SnapshotLeaseReady {
        snapshot_digest: String,
    },
    SnapshotLeaseDurable,
    SnapshotPageAccepted {
        resource: SnapshotResource,
        observed: usize,
        expected: usize,
    },
    BaselineReady {
        observation_count: usize,
        snapshot_digest: String,
    },
    BaselineDurable,
    EventPageReady {
        observation_count: usize,
        caught_up: bool,
    },
    EventPageDurable,
    RetryCurrentRequest {
        kind: SourceFailureKind,
        retry_after_seconds: Option<u64>,
    },
    FreshBuildingEpochRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BootstrapResource {
    Orders,
    Fills,
    Positions,
}

impl BootstrapResource {
    const fn contract_resource(self) -> SnapshotResource {
        match self {
            Self::Orders => SnapshotResource::Orders,
            Self::Fills => SnapshotResource::Fills,
            Self::Positions => SnapshotResource::Positions,
        }
    }

    const fn next(self) -> Option<Self> {
        match self {
            Self::Orders => Some(Self::Fills),
            Self::Fills => Some(Self::Positions),
            Self::Positions => None,
        }
    }
}

#[derive(Debug, Clone)]
enum IngestionState {
    AwaitingSnapshot,
    AwaitingSnapshotLeaseCommit {
        descriptor: SnapshotDescriptor,
        accepted_at: DateTime<Utc>,
    },
    PagingSnapshot {
        descriptor: SnapshotDescriptor,
        resource: BootstrapResource,
        cursor: Option<OpaqueToken>,
        resource_observed: usize,
        observations: Vec<MappedObservation>,
    },
    AwaitingBaselineCommit {
        pending: PendingBaselineCommit,
    },
    PollingEvents {
        cursor: OpaqueToken,
    },
    AwaitingEventCommit {
        pending: PendingEventCommit,
    },
    RebuildRequired,
}

#[derive(Debug, Clone)]
pub struct PaperIngestionCoordinator {
    config: D4IngestionConfig,
    state: IngestionState,
}

impl PaperIngestionCoordinator {
    /// Creates an offline coordinator bound to one explicit BUILDING epoch.
    ///
    /// # Errors
    ///
    /// Rejects non-Paper scope, non-BUILDING authority and unbounded runtime
    /// values before any source request can be produced.
    pub fn new(config: D4IngestionConfig) -> Result<Self, IngestorError> {
        config.validate()?;
        Ok(Self {
            config,
            state: IngestionState::AwaitingSnapshot,
        })
    }

    #[must_use]
    pub fn next_request(&self) -> Option<PaperReadRequest> {
        match &self.state {
            IngestionState::AwaitingSnapshot => Some(PaperReadRequest::BeginSnapshot),
            IngestionState::PagingSnapshot {
                descriptor,
                resource,
                cursor,
                ..
            } => Some(PaperReadRequest::SnapshotPage {
                resource: resource.contract_resource(),
                snapshot: descriptor.snapshot.clone(),
                cursor: cursor.clone(),
                page_size: self.config.page_size,
            }),
            IngestionState::PollingEvents { cursor } => Some(PaperReadRequest::EventsPage {
                cursor: cursor.clone(),
                page_size: self.config.page_size,
            }),
            IngestionState::AwaitingSnapshotLeaseCommit { .. }
            | IngestionState::AwaitingBaselineCommit { .. }
            | IngestionState::AwaitingEventCommit { .. }
            | IngestionState::RebuildRequired => None,
        }
    }

    #[must_use]
    pub fn pending_snapshot_lease(&self) -> Option<PendingSnapshotLease> {
        match &self.state {
            IngestionState::AwaitingSnapshotLeaseCommit {
                descriptor,
                accepted_at,
            } => Some(PendingSnapshotLease {
                epoch_id: self.config.epoch_id,
                expected_epoch_status: ProjectionEpochStatus::Building,
                snapshot: descriptor.snapshot.clone(),
                initial_event_cursor: descriptor.event_cursor.clone(),
                snapshot_digest: opaque_digest(&descriptor.snapshot),
                snapshot_created_at: descriptor.created_at,
                expires_at: descriptor.expires_at,
                expected_counts: descriptor.resource_counts.clone(),
                accepted_at: *accepted_at,
            }),
            _ => None,
        }
    }

    #[must_use]
    pub fn pending_baseline(&self) -> Option<&PendingBaselineCommit> {
        match &self.state {
            IngestionState::AwaitingBaselineCommit { pending } => Some(pending),
            _ => None,
        }
    }

    #[must_use]
    pub fn pending_event_page(&self) -> Option<&PendingEventCommit> {
        match &self.state {
            IngestionState::AwaitingEventCommit { pending } => Some(pending),
            _ => None,
        }
    }

    /// Accepts one already contract-validated response.
    ///
    /// # Errors
    ///
    /// Fails closed on response/state mismatch, snapshot count drift, mapping
    /// ambiguity or any attempt to continue a terminal rebuild state.
    pub fn accept(
        &mut self,
        outcome: ReadOutcome,
        source_read_at: DateTime<Utc>,
    ) -> Result<IngestionEffect, IngestorError> {
        if let ReadOutcome::Failure(failure) = outcome {
            if failure.kind == SourceFailureKind::ResyncRequired {
                self.state = IngestionState::RebuildRequired;
                return Ok(IngestionEffect::FreshBuildingEpochRequired);
            }
            if matches!(
                self.state,
                IngestionState::AwaitingSnapshotLeaseCommit { .. }
                    | IngestionState::AwaitingBaselineCommit { .. }
                    | IngestionState::AwaitingEventCommit { .. }
                    | IngestionState::RebuildRequired
            ) {
                return Err(IngestorError::ResponseStateMismatch);
            }
            return Ok(IngestionEffect::RetryCurrentRequest {
                kind: failure.kind,
                retry_after_seconds: failure.retry_after_seconds,
            });
        }
        let ReadOutcome::Success(payload) = outcome else {
            unreachable!("read outcome is success or failure")
        };
        let state = std::mem::replace(&mut self.state, IngestionState::RebuildRequired);
        self.accept_success(state, payload, source_read_at)
    }

    /// Allows snapshot paging only after the caller confirms that the opaque
    /// snapshot and event watermark were durably stored for this BUILDING
    /// epoch.
    ///
    /// # Errors
    ///
    /// Rejects acknowledgements in every other state.
    pub fn acknowledge_snapshot_lease(&mut self) -> Result<IngestionEffect, IngestorError> {
        let state = std::mem::replace(&mut self.state, IngestionState::RebuildRequired);
        let IngestionState::AwaitingSnapshotLeaseCommit { descriptor, .. } = state else {
            self.state = state;
            return Err(IngestorError::CommitAcknowledgementOutOfOrder);
        };
        self.state = IngestionState::PagingSnapshot {
            descriptor,
            resource: BootstrapResource::Orders,
            cursor: None,
            resource_observed: 0,
            observations: Vec::new(),
        };
        Ok(IngestionEffect::SnapshotLeaseDurable)
    }

    /// Advances from baseline commit to event polling only after the caller has
    /// durably and atomically written rows plus both opaque cursors.
    ///
    /// # Errors
    ///
    /// Rejects acknowledgements in every other state.
    pub fn acknowledge_baseline_commit(&mut self) -> Result<IngestionEffect, IngestorError> {
        let state = std::mem::replace(&mut self.state, IngestionState::RebuildRequired);
        let IngestionState::AwaitingBaselineCommit { pending } = state else {
            self.state = state;
            return Err(IngestorError::CommitAcknowledgementOutOfOrder);
        };
        self.state = IngestionState::PollingEvents {
            cursor: pending.initial_event_cursor,
        };
        Ok(IngestionEffect::BaselineDurable)
    }

    /// Advances the event cursor only after the caller confirms the full event
    /// page and next cursor were committed in one durable transaction.
    ///
    /// # Errors
    ///
    /// Rejects acknowledgements in every other state.
    pub fn acknowledge_event_commit(&mut self) -> Result<IngestionEffect, IngestorError> {
        let state = std::mem::replace(&mut self.state, IngestionState::RebuildRequired);
        let IngestionState::AwaitingEventCommit { pending } = state else {
            self.state = state;
            return Err(IngestorError::CommitAcknowledgementOutOfOrder);
        };
        self.state = IngestionState::PollingEvents {
            cursor: pending.next_cursor,
        };
        Ok(IngestionEffect::EventPageDurable)
    }

    #[must_use]
    pub fn rebuild_required(&self) -> bool {
        matches!(self.state, IngestionState::RebuildRequired)
    }

    fn accept_success(
        &mut self,
        state: IngestionState,
        payload: PaperReadPayload,
        source_read_at: DateTime<Utc>,
    ) -> Result<IngestionEffect, IngestorError> {
        match (state, payload) {
            (IngestionState::AwaitingSnapshot, PaperReadPayload::SnapshotCreated(descriptor)) => {
                let snapshot_digest = opaque_digest(&descriptor.snapshot);
                self.state = IngestionState::AwaitingSnapshotLeaseCommit {
                    descriptor,
                    accepted_at: source_read_at,
                };
                Ok(IngestionEffect::SnapshotLeaseReady { snapshot_digest })
            }
            (
                IngestionState::PagingSnapshot {
                    descriptor,
                    resource: BootstrapResource::Orders,
                    cursor: _,
                    resource_observed,
                    observations,
                },
                PaperReadPayload::Orders(page),
            ) => self.accept_snapshot_page(
                descriptor,
                BootstrapResource::Orders,
                resource_observed,
                observations,
                page,
                source_read_at,
            ),
            (
                IngestionState::PagingSnapshot {
                    descriptor,
                    resource: BootstrapResource::Fills,
                    cursor: _,
                    resource_observed,
                    observations,
                },
                PaperReadPayload::Fills(page),
            ) => self.accept_snapshot_page(
                descriptor,
                BootstrapResource::Fills,
                resource_observed,
                observations,
                page,
                source_read_at,
            ),
            (
                IngestionState::PagingSnapshot {
                    descriptor,
                    resource: BootstrapResource::Positions,
                    cursor: _,
                    resource_observed,
                    observations,
                },
                PaperReadPayload::Positions(page),
            ) => self.accept_snapshot_page(
                descriptor,
                BootstrapResource::Positions,
                resource_observed,
                observations,
                page,
                source_read_at,
            ),
            (IngestionState::PollingEvents { cursor }, PaperReadPayload::Events(page)) => {
                let first_source_sequence = page.events.first().map(|event| event.sequence);
                let last_source_sequence = page.events.last().map(|event| event.sequence);
                let observations = map_event_page(&page, &self.config, source_read_at)?;
                let effect = IngestionEffect::EventPageReady {
                    observation_count: observations.len(),
                    caught_up: page.complete,
                };
                self.state = IngestionState::AwaitingEventCommit {
                    pending: PendingEventCommit {
                        epoch_id: self.config.epoch_id,
                        expected_epoch_status: ProjectionEpochStatus::Building,
                        previous_cursor: cursor,
                        next_cursor: page.next_cursor,
                        observations,
                        first_source_sequence,
                        last_source_sequence,
                        source_head_sequence: page.head_sequence,
                        source_read_at,
                        caught_up: page.complete,
                    },
                };
                Ok(effect)
            }
            (previous, _) => {
                self.state = previous;
                Err(IngestorError::ResponseStateMismatch)
            }
        }
    }

    fn accept_snapshot_page<T>(
        &mut self,
        descriptor: SnapshotDescriptor,
        resource: BootstrapResource,
        resource_observed: usize,
        mut observations: Vec<MappedObservation>,
        page: SnapshotPage<T>,
        source_read_at: DateTime<Utc>,
    ) -> Result<IngestionEffect, IngestorError>
    where
        T: IntoSnapshotObservation,
    {
        let mapped = page
            .rows
            .into_iter()
            .map(|record| {
                record.into_observation(&self.config, source_read_at, &descriptor.snapshot)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let observed = resource_observed
            .checked_add(mapped.len())
            .ok_or(IngestorError::SnapshotCountOverflow)?;
        let expected = expected_count(&descriptor, resource);
        if observed > expected
            || observations.len().saturating_add(mapped.len()) > MAXIMUM_SNAPSHOT_ROWS
        {
            return Err(IngestorError::SnapshotCountMismatch);
        }
        observations.extend(mapped);
        if !page.complete {
            self.state = IngestionState::PagingSnapshot {
                descriptor,
                resource,
                cursor: page.next_cursor,
                resource_observed: observed,
                observations,
            };
            return Ok(IngestionEffect::SnapshotPageAccepted {
                resource: resource.contract_resource(),
                observed,
                expected,
            });
        }
        if observed != expected {
            return Err(IngestorError::SnapshotCountMismatch);
        }
        if let Some(next) = resource.next() {
            self.state = IngestionState::PagingSnapshot {
                descriptor,
                resource: next,
                cursor: None,
                resource_observed: 0,
                observations,
            };
            return Ok(IngestionEffect::SnapshotPageAccepted {
                resource: resource.contract_resource(),
                observed,
                expected,
            });
        }

        let snapshot_digest = opaque_digest(&descriptor.snapshot);
        let observation_count = observations.len();
        self.state = IngestionState::AwaitingBaselineCommit {
            pending: PendingBaselineCommit {
                epoch_id: self.config.epoch_id,
                expected_epoch_status: ProjectionEpochStatus::Building,
                snapshot: descriptor.snapshot,
                initial_event_cursor: descriptor.event_cursor,
                snapshot_digest: snapshot_digest.clone(),
                expected_counts: descriptor.resource_counts,
                observations,
                source_read_at,
            },
        };
        Ok(IngestionEffect::BaselineReady {
            observation_count,
            snapshot_digest,
        })
    }
}

trait IntoSnapshotObservation {
    fn into_observation(
        self,
        config: &D4IngestionConfig,
        source_read_at: DateTime<Utc>,
        snapshot: &OpaqueToken,
    ) -> Result<MappedObservation, IngestorError>;
}

macro_rules! snapshot_mapper {
    ($record:ty, $kind:expr, $id:expr, $as_of:expr, $stream:literal) => {
        impl IntoSnapshotObservation for $record {
            fn into_observation(
                self,
                config: &D4IngestionConfig,
                source_read_at: DateTime<Utc>,
                snapshot: &OpaqueToken,
            ) -> Result<MappedObservation, IngestorError> {
                let entity_id = CanonicalId::parse(($id)(&self))?;
                let payload = serde_json::to_value(&self)?;
                let ingestion_id = snapshot_ingestion_id(snapshot, $stream, entity_id.as_str());
                Ok(MappedObservation {
                    stream_key: format!(
                        "d4:{scope}:{stream}",
                        scope = "paper_binance_usdm",
                        stream = $stream
                    ),
                    observation: observation(
                        ingestion_id,
                        $kind,
                        entity_id,
                        ($as_of)(&self),
                        source_read_at,
                        None,
                        None,
                        SourceSequenceSemantics::PerEntityContiguous,
                        ProjectionOperation::Upsert,
                        SourceCompleteness::PollBounded,
                        Some(config.poll_interval_ms),
                        payload,
                        config,
                    ),
                })
            }
        }
    };
}

snapshot_mapper!(
    paper_source_contract::OrderRecord,
    ProjectionEntityKind::Order,
    |record: &paper_source_contract::OrderRecord| record.client_order_id.clone(),
    |record: &paper_source_contract::OrderRecord| Some(record.updated_at),
    "orders"
);
snapshot_mapper!(
    paper_source_contract::FillRecord,
    ProjectionEntityKind::Fill,
    |record: &paper_source_contract::FillRecord| record.fill_id.to_string(),
    |record: &paper_source_contract::FillRecord| Some(record.trade_time),
    "fills"
);
snapshot_mapper!(
    PositionRecord,
    ProjectionEntityKind::Position,
    |record: &PositionRecord| record.position_id.clone(),
    |record: &PositionRecord| Some(record.updated_at),
    "positions"
);

fn map_event_page(
    page: &EventsPage,
    config: &D4IngestionConfig,
    source_read_at: DateTime<Utc>,
) -> Result<Vec<MappedObservation>, IngestorError> {
    page.events
        .iter()
        .map(|event| map_event(event, config, source_read_at))
        .collect()
}

fn map_event(
    event: &StateDeltaEvent,
    config: &D4IngestionConfig,
    source_read_at: DateTime<Utc>,
) -> Result<MappedObservation, IngestorError> {
    let (kind, stream, payload) = match &event.record {
        StateDeltaRecord::Order(record) => (
            ProjectionEntityKind::Order,
            "orders",
            serde_json::to_value(record)?,
        ),
        StateDeltaRecord::Fill(record) => (
            ProjectionEntityKind::Fill,
            "fills",
            serde_json::to_value(record)?,
        ),
        StateDeltaRecord::Position(record) => (
            ProjectionEntityKind::Position,
            "positions",
            serde_json::to_value(record)?,
        ),
        StateDeltaRecord::Tombstone => (
            match event.resource {
                SnapshotResource::Orders => ProjectionEntityKind::Order,
                SnapshotResource::Fills => ProjectionEntityKind::Fill,
                SnapshotResource::Positions => ProjectionEntityKind::Position,
            },
            match event.resource {
                SnapshotResource::Orders => "orders",
                SnapshotResource::Fills => "fills",
                SnapshotResource::Positions => "positions",
            },
            tombstone_payload(event),
        ),
    };
    let entity_id = CanonicalId::parse(event.entity_id.clone())?;
    let event_id = CanonicalId::parse(event.event_id.clone())?;
    let source_sequence =
        i64::try_from(event.sequence).map_err(|_| IngestorError::SequenceOverflow)?;
    let cursor = SourceCursor {
        event_ts: event.observed_at,
        created_at: event.observed_at,
        event_id: event_id.clone(),
    };
    Ok(MappedObservation {
        stream_key: format!("d4:paper_binance_usdm:{stream}"),
        observation: observation(
            event_id,
            kind,
            entity_id,
            Some(event.observed_at),
            source_read_at,
            Some(cursor),
            Some(source_sequence),
            SourceSequenceSemantics::GlobalStreamMonotonic,
            match event.operation {
                DeltaOperation::Upsert => ProjectionOperation::Upsert,
                DeltaOperation::Delete => ProjectionOperation::Delete,
            },
            SourceCompleteness::EventSourced,
            None,
            payload,
            config,
        ),
    })
}

fn tombstone_payload(event: &StateDeltaEvent) -> Value {
    json!({
        "deleted": event.operation == DeltaOperation::Delete,
        "entity_version": event.entity_version,
        "observed_at": event.observed_at,
    })
}

#[allow(clippy::too_many_arguments)]
fn observation(
    ingestion_id: CanonicalId,
    kind: ProjectionEntityKind,
    entity_id: CanonicalId,
    as_of: Option<DateTime<Utc>>,
    source_read_at: DateTime<Utc>,
    source_cursor: Option<SourceCursor>,
    source_sequence: Option<i64>,
    source_sequence_semantics: SourceSequenceSemantics,
    operation: ProjectionOperation,
    source_completeness: SourceCompleteness,
    poll_interval_ms: Option<i64>,
    payload: Value,
    config: &D4IngestionConfig,
) -> ProjectionObservation {
    ProjectionObservation {
        ingestion_id,
        entity: ProjectionEntityKey { kind, entity_id },
        source_authority: SourceAuthority::Execution,
        as_of,
        source_read_at,
        source_cursor,
        source_sequence,
        source_sequence_semantics,
        operation,
        source_completeness,
        poll_interval_ms,
        adapter_version: D4_MAPPER_VERSION.to_owned(),
        capability_snapshot_id: config.capability_snapshot_id.clone(),
        payload,
    }
}

fn expected_count(descriptor: &SnapshotDescriptor, resource: BootstrapResource) -> usize {
    match resource {
        BootstrapResource::Orders => descriptor.resource_counts.orders,
        BootstrapResource::Fills => descriptor.resource_counts.fills,
        BootstrapResource::Positions => descriptor.resource_counts.positions,
    }
}

fn snapshot_ingestion_id(snapshot: &OpaqueToken, resource: &str, entity_id: &str) -> CanonicalId {
    let mut hasher = Sha256::new();
    hasher.update(b"d4.paper-read.v1\0snapshot-row\0");
    hasher.update(snapshot.as_str().as_bytes());
    hasher.update(b"\0");
    hasher.update(resource.as_bytes());
    hasher.update(b"\0");
    hasher.update(entity_id.as_bytes());
    CanonicalId::parse(format!("d4_snapshot_{:x}", hasher.finalize()))
        .expect("SHA-256 projection identity is canonical")
}

fn opaque_digest(token: &OpaqueToken) -> String {
    format!("sha256:{:x}", Sha256::digest(token.as_str().as_bytes()))
}

#[derive(Debug, Error)]
pub enum IngestorError {
    #[error("D4 ingestor requires Portal Paper projection scope")]
    PaperScopeRequired,
    #[error("D4 ingestor requires an explicit BUILDING epoch")]
    BuildingEpochRequired,
    #[error("D4 page size is outside the contract")]
    InvalidPageSize,
    #[error("D4 poll interval is outside the bounded envelope")]
    InvalidPollInterval,
    #[error("D4 capability identity is invalid")]
    InvalidCapabilityIdentity,
    #[error("D4 response does not match the current ingestion state")]
    ResponseStateMismatch,
    #[error("D4 snapshot count overflowed")]
    SnapshotCountOverflow,
    #[error("D4 snapshot count differs from its immutable descriptor")]
    SnapshotCountMismatch,
    #[error("D4 source sequence cannot fit the projection store")]
    SequenceOverflow,
    #[error("D4 durable commit acknowledgement is out of order")]
    CommitAcknowledgementOutOfOrder,
    #[error(transparent)]
    Contract(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests;
