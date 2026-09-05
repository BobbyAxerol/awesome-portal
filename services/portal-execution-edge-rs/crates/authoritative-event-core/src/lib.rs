#![forbid(unsafe_code)]

//! EDS-09's provider-neutral snapshot-plus-tail ingestion core.
//!
//! This crate deliberately owns no listener, HTTP client, mTLS material,
//! source credential, database connection, cache or runtime flag.  A future
//! source adapter may feed it only after the source owner has published an
//! accepted event contract and runtime evidence.  The core then makes the
//! durability barrier explicit: source acknowledgement is possible only after
//! the append store has returned an exact committed receipt.

use std::collections::{BTreeMap, VecDeque};

use execution_contracts::CanonicalId;
use projection_core::{canonical_digest, canonical_value_digest};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const EDS09_SCHEMA_VERSION: &str = "portal.execution.eds09.snapshot-tail.v1";
pub const EDS09_ADMISSION_SCHEMA_VERSION: &str = "portal.execution.eds09.source-admission.v1";
pub const MAX_FRAME_EVENTS: usize = 1_000;
pub const MAX_FRAME_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_QUEUE_FRAMES_PER_LANE: usize = 128;
pub const MAX_QUEUE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_UNACKED_BYTES: usize = 8 * 1024 * 1024;

const MAX_IDENTIFIER_BYTES: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourcePosition {
    pub source_epoch: String,
    /// Canonical unsigned decimal string.  It deliberately remains a string
    /// in serialized contracts so no browser or JSON reader can round it.
    pub source_sequence: String,
}

impl SourcePosition {
    /// Creates a source position while preserving its canonical decimal form.
    ///
    /// # Errors
    ///
    /// Rejects an invalid source epoch or a non-canonical unsigned sequence.
    pub fn new(
        source_epoch: impl Into<String>,
        source_sequence: impl Into<String>,
    ) -> Result<Self, CoreError> {
        let position = Self {
            source_epoch: source_epoch.into(),
            source_sequence: source_sequence.into(),
        };
        position.validate(true)?;
        Ok(position)
    }

    /// Returns the exact sequence after validation; never parse this value in
    /// a JavaScript consumer.
    ///
    /// # Errors
    ///
    /// Returns an error when the stored value is not the canonical unsigned
    /// decimal representation expected by the source contract.
    pub fn sequence_u64(&self) -> Result<u64, CoreError> {
        parse_decimal_u64(&self.source_sequence, true)
    }

    fn validate(&self, allow_zero: bool) -> Result<(), CoreError> {
        validate_identifier(&self.source_epoch)?;
        let sequence = parse_decimal_u64(&self.source_sequence, allow_zero)?;
        if !allow_zero && sequence == 0 {
            return Err(CoreError::InvalidSourcePosition);
        }
        Ok(())
    }

    fn directly_follows(&self, prior: &Self) -> Result<bool, CoreError> {
        if self.source_epoch != prior.source_epoch {
            return Ok(false);
        }
        let prior_sequence = prior.sequence_u64()?;
        let expected = prior_sequence
            .checked_add(1)
            .ok_or(CoreError::SourceSequenceExhausted)?;
        Ok(self.sequence_u64()? == expected)
    }

    fn no_later_than(&self, bound: &Self) -> Result<bool, CoreError> {
        Ok(self.source_epoch == bound.source_epoch
            && self.sequence_u64()? <= bound.sequence_u64()?)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventStreamBinding {
    pub stream_id: String,
    pub contract_revision: String,
    pub workspace_id: CanonicalId,
    pub environment: String,
    pub profile_id: String,
    pub venue_id: String,
    pub resource_kind: String,
    pub resource_id: String,
    pub filter_digest: String,
}

impl EventStreamBinding {
    /// Validates the exact profile and filter binding carried by every frame.
    ///
    /// # Errors
    ///
    /// Rejects an unbounded identifier, non-execution environment or invalid
    /// content-addressed filter digest.
    pub fn validate(&self) -> Result<(), CoreError> {
        for value in [
            &self.stream_id,
            &self.contract_revision,
            self.workspace_id.as_str(),
            &self.profile_id,
            &self.venue_id,
            &self.resource_kind,
            &self.resource_id,
        ] {
            validate_identifier(value)?;
        }
        if !matches!(self.environment.as_str(), "paper" | "sandbox" | "live") {
            return Err(CoreError::InvalidEnvironment);
        }
        validate_sha256(&self.filter_digest)?;
        Ok(())
    }

    /// Returns the stable, non-secret identity used by a durable store to
    /// separate one exact source/profile/resource stream from every other
    /// stream.  It is intentionally derived from the complete binding rather
    /// than the provider-supplied `stream_id` alone.
    ///
    /// # Errors
    ///
    /// Returns an error if the binding is malformed or cannot be canonicalized.
    pub fn binding_digest(&self) -> Result<String, CoreError> {
        self.validate()?;
        canonical_digest(self).map_err(|_| CoreError::FrameSerialization)
    }
}

/// Independently attested source capabilities.  Each boolean is a distinct
/// contract fact rather than a state enum: an owner can support one semantic
/// while lacking another, and admission must reject that partial declaration.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventSourceAdmission {
    pub schema_version: String,
    pub binding: EventStreamBinding,
    pub contract_digest: String,
    pub owner_return_digest: String,
    pub runtime_evidence_digest: String,
    pub transport_contract_digest: String,
    /// Pins the Portal-owned local retention/capacity policy.  Source
    /// retention is not enough to authorize an unbounded local append store.
    pub local_storage_policy_digest: String,
    pub retention_floor: SourcePosition,
    pub source_runtime_accepted: bool,
    pub snapshot_tail_supported: bool,
    pub correction_tombstone_supported: bool,
    pub durable_ack_supported: bool,
}

impl EventSourceAdmission {
    /// Validates the independently returned owner admission needed before a
    /// source adapter can construct a coordinator.
    ///
    /// `contract_only`, fixture-only and source-dark owner returns fail here;
    /// they cannot accidentally start an ingest loop.
    ///
    /// # Errors
    ///
    /// Returns an error for revision, binding, evidence, retention or required
    /// semantic drift, including a source that is still source-dark.
    pub fn validate(&self) -> Result<(), CoreError> {
        if self.schema_version != EDS09_ADMISSION_SCHEMA_VERSION {
            return Err(CoreError::AdmissionSchemaUnsupported);
        }
        self.binding.validate()?;
        self.retention_floor.validate(true)?;
        for digest in [
            &self.contract_digest,
            &self.owner_return_digest,
            &self.runtime_evidence_digest,
            &self.transport_contract_digest,
            &self.local_storage_policy_digest,
        ] {
            validate_sha256(digest)?;
        }
        if !self.source_runtime_accepted {
            return Err(CoreError::SourceRuntimeNotAccepted);
        }
        if !self.snapshot_tail_supported
            || !self.correction_tombstone_supported
            || !self.durable_ack_supported
        {
            return Err(CoreError::RequiredSourceSemanticMissing);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotBoundary {
    pub binding: EventStreamBinding,
    pub snapshot_id: String,
    pub snapshot_as_of_ms: i64,
    pub high_watermark: SourcePosition,
    pub retention_floor: SourcePosition,
    pub completeness: SnapshotCompleteness,
}

impl SnapshotBoundary {
    /// Validates a complete, source-bound snapshot boundary.
    ///
    /// # Errors
    ///
    /// Rejects partial snapshots, scope drift, epoch drift or a retention
    /// floor after the published high watermark.
    pub fn validate_against(&self, admission: &EventSourceAdmission) -> Result<(), CoreError> {
        self.binding.validate()?;
        validate_identifier(&self.snapshot_id)?;
        self.high_watermark.validate(true)?;
        self.retention_floor.validate(true)?;
        if self.binding != admission.binding || self.retention_floor != admission.retention_floor {
            return Err(CoreError::BindingMismatch);
        }
        if self.completeness != SnapshotCompleteness::Complete
            || self.high_watermark.source_epoch != self.retention_floor.source_epoch
            || self.high_watermark.sequence_u64()? < self.retention_floor.sequence_u64()?
        {
            return Err(CoreError::InvalidSnapshotBoundary);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SnapshotCompleteness {
    Complete,
    Partial,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FrameLane {
    HistoryBackfill,
    Current,
    LiveTail,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventOperation {
    Upsert,
    Tombstone,
    Correction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthoritativeEvent {
    pub event_id: CanonicalId,
    pub source_position: SourcePosition,
    pub entity_kind: String,
    pub entity_id: CanonicalId,
    pub entity_version: String,
    pub payload_schema_revision: String,
    pub operation: EventOperation,
    pub event_time_ms: i64,
    pub source_published_at_ms: i64,
    pub correction_of_event_id: Option<CanonicalId>,
    pub tombstone_of_event_id: Option<CanonicalId>,
    pub causation_id: Option<CanonicalId>,
    pub correlation_id: Option<CanonicalId>,
    pub payload: Value,
    pub payload_digest: String,
}

impl AuthoritativeEvent {
    /// Validates the immutable event envelope before it can enter a frame.
    ///
    /// # Errors
    ///
    /// Rejects non-object payloads, digest drift, invalid positions, invalid
    /// event identities and corrections that do not identify their predecessor.
    pub fn validate(&self) -> Result<(), CoreError> {
        self.source_position.validate(false)?;
        validate_identifier(&self.entity_kind)?;
        validate_identifier(&self.entity_version)?;
        validate_identifier(&self.payload_schema_revision)?;
        if !self.payload.is_object()
            || self.source_published_at_ms < self.event_time_ms
            || canonical_value_digest(&self.payload) != self.payload_digest
        {
            return Err(CoreError::InvalidEvent);
        }
        validate_sha256(&self.payload_digest)?;
        match (
            self.operation,
            &self.correction_of_event_id,
            &self.tombstone_of_event_id,
        ) {
            (EventOperation::Upsert, None, None)
            | (EventOperation::Correction, Some(_), None)
            | (EventOperation::Tombstone, None, Some(_)) => {}
            _ => return Err(CoreError::InvalidCorrectionSemantics),
        }
        // A correction/tombstone is a new immutable fact about an earlier
        // fact. Allowing it to target itself would make the reducer accept a
        // circular relationship inside one frame before the durable store can
        // prove that the predecessor exists.
        if self.correction_of_event_id.as_ref() == Some(&self.event_id)
            || self.tombstone_of_event_id.as_ref() == Some(&self.event_id)
        {
            return Err(CoreError::InvalidCorrectionSemantics);
        }
        Ok(())
    }
}

/// A source-independent current-state row derived from the immutable event
/// sequence.  It is intentionally generic: source-specific typed columns are
/// introduced only by a relation adapter after that relation's event contract
/// has been accepted.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurrentEntityState {
    pub entity_kind: String,
    pub entity_id: CanonicalId,
    pub last_event_id: CanonicalId,
    pub source_position: SourcePosition,
    pub entity_version: String,
    pub last_operation: EventOperation,
    pub event_time_ms: i64,
    pub source_published_at_ms: i64,
    pub payload: Value,
    pub payload_digest: String,
    pub tombstoned: bool,
}

/// Applies one already-validated immutable event to one current-state row.
///
/// The caller must separately prove a correction/tombstone target exists in
/// the append history.  This pure reducer enforces the remaining per-entity
/// identity and source-position monotonicity, so a storage adapter cannot
/// silently overwrite a newer current row.
///
/// # Errors
///
/// Returns an error if the event is invalid, targets a different entity, or
/// would move that entity's source position backwards.
pub fn reduce_current_entity(
    current: Option<&CurrentEntityState>,
    event: &AuthoritativeEvent,
) -> Result<CurrentEntityState, CoreError> {
    event.validate()?;
    if let Some(existing) = current {
        if existing.entity_kind != event.entity_kind || existing.entity_id != event.entity_id {
            return Err(CoreError::CurrentReducerIdentityMismatch);
        }
        if existing.source_position.source_epoch != event.source_position.source_epoch
            || event.source_position.sequence_u64()? <= existing.source_position.sequence_u64()?
        {
            return Err(CoreError::CurrentReducerOutOfOrder);
        }
    }
    Ok(CurrentEntityState {
        entity_kind: event.entity_kind.clone(),
        entity_id: event.entity_id.clone(),
        last_event_id: event.event_id.clone(),
        source_position: event.source_position.clone(),
        entity_version: event.entity_version.clone(),
        last_operation: event.operation,
        event_time_ms: event.event_time_ms,
        source_published_at_ms: event.source_published_at_ms,
        payload: event.payload.clone(),
        payload_digest: event.payload_digest.clone(),
        tombstoned: event.operation == EventOperation::Tombstone,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceFrame {
    pub schema_version: String,
    pub binding: EventStreamBinding,
    pub lane: FrameLane,
    pub snapshot_high_watermark: SourcePosition,
    pub previous_position: Option<SourcePosition>,
    pub records: Vec<AuthoritativeEvent>,
    pub complete: bool,
    pub source_read_at_ms: i64,
    pub content_digest: String,
}

#[derive(Serialize)]
struct FrameDigestMaterial<'a> {
    schema_version: &'a str,
    binding: &'a EventStreamBinding,
    lane: FrameLane,
    snapshot_high_watermark: &'a SourcePosition,
    previous_position: &'a Option<SourcePosition>,
    records: &'a [AuthoritativeEvent],
    complete: bool,
    source_read_at_ms: i64,
}

impl SourceFrame {
    /// Seals an exact bounded source frame with a canonical checksum.
    ///
    /// The source adapter must validate transport decompression separately;
    /// this core validates only canonical decoded data and its checksum.
    ///
    /// # Errors
    ///
    /// Returns an error when the proposed decoded frame cannot be
    /// canonically serialized for its checksum.
    pub fn seal(
        binding: EventStreamBinding,
        lane: FrameLane,
        snapshot_high_watermark: SourcePosition,
        previous_position: Option<SourcePosition>,
        records: Vec<AuthoritativeEvent>,
        complete: bool,
        source_read_at_ms: i64,
    ) -> Result<Self, CoreError> {
        let mut frame = Self {
            schema_version: EDS09_SCHEMA_VERSION.to_owned(),
            binding,
            lane,
            snapshot_high_watermark,
            previous_position,
            records,
            complete,
            source_read_at_ms,
            content_digest: String::new(),
        };
        frame.content_digest = frame.compute_digest()?;
        Ok(frame)
    }

    /// Validates frame size, checksum, scope binding and strict intra-frame
    /// sequence continuity.  It does not make any source call.
    ///
    /// # Errors
    ///
    /// Returns an error for frame-bound, checksum, binding, epoch or sequence
    /// violations.
    pub fn validate(&self, bounds: &IngestBounds) -> Result<(), CoreError> {
        bounds.validate()?;
        if self.schema_version != EDS09_SCHEMA_VERSION {
            return Err(CoreError::FrameSchemaUnsupported);
        }
        self.binding.validate()?;
        self.snapshot_high_watermark.validate(true)?;
        if self.records.len() > bounds.maximum_frame_events || self.records.is_empty() {
            return Err(CoreError::FrameBoundExceeded);
        }
        if self.compute_digest()? != self.content_digest {
            return Err(CoreError::FrameChecksumMismatch);
        }
        validate_sha256(&self.content_digest)?;
        if let Some(previous) = &self.previous_position {
            previous.validate(true)?;
            if previous.source_epoch != self.snapshot_high_watermark.source_epoch {
                return Err(CoreError::EpochMismatch);
            }
        }

        let mut prior = self.previous_position.as_ref();
        for record in &self.records {
            record.validate()?;
            if record.source_position.source_epoch != self.snapshot_high_watermark.source_epoch {
                return Err(CoreError::EpochMismatch);
            }
            if let Some(previous) = prior {
                if !record.source_position.directly_follows(previous)? {
                    return Err(CoreError::SourceSequenceGap);
                }
            }
            prior = Some(&record.source_position);
        }
        let encoded = serde_json::to_vec(self).map_err(|_| CoreError::FrameSerialization)?;
        if encoded.len() > bounds.maximum_frame_bytes {
            return Err(CoreError::FrameBoundExceeded);
        }
        Ok(())
    }

    #[must_use]
    pub fn final_position(&self) -> Option<&SourcePosition> {
        self.records.last().map(|record| &record.source_position)
    }

    /// Returns the canonical serialized byte length used by bounded queues.
    ///
    /// # Errors
    ///
    /// Returns an error when the frame cannot be serialized.
    pub fn encoded_len(&self) -> Result<usize, CoreError> {
        serde_json::to_vec(self)
            .map(|encoded| encoded.len())
            .map_err(|_| CoreError::FrameSerialization)
    }

    fn compute_digest(&self) -> Result<String, CoreError> {
        canonical_digest(&FrameDigestMaterial {
            schema_version: &self.schema_version,
            binding: &self.binding,
            lane: self.lane,
            snapshot_high_watermark: &self.snapshot_high_watermark,
            previous_position: &self.previous_position,
            records: &self.records,
            complete: self.complete,
            source_read_at_ms: self.source_read_at_ms,
        })
        .map_err(|_| CoreError::FrameSerialization)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IngestBounds {
    pub maximum_frame_events: usize,
    pub maximum_frame_bytes: usize,
    pub maximum_queue_frames_per_lane: usize,
    pub maximum_queue_bytes: usize,
    pub maximum_unacked_bytes: usize,
}

impl Default for IngestBounds {
    fn default() -> Self {
        Self {
            maximum_frame_events: 200,
            maximum_frame_bytes: 1024 * 1024,
            maximum_queue_frames_per_lane: 32,
            maximum_queue_bytes: 8 * 1024 * 1024,
            maximum_unacked_bytes: 2 * 1024 * 1024,
        }
    }
}

impl IngestBounds {
    fn validate(&self) -> Result<(), CoreError> {
        if self.maximum_frame_events == 0
            || self.maximum_frame_events > MAX_FRAME_EVENTS
            || self.maximum_frame_bytes == 0
            || self.maximum_frame_bytes > MAX_FRAME_BYTES
            || self.maximum_queue_frames_per_lane == 0
            || self.maximum_queue_frames_per_lane > MAX_QUEUE_FRAMES_PER_LANE
            || self.maximum_queue_bytes == 0
            || self.maximum_queue_bytes > MAX_QUEUE_BYTES
            || self.maximum_unacked_bytes == 0
            || self.maximum_unacked_bytes > MAX_UNACKED_BYTES
            || self.maximum_unacked_bytes > self.maximum_queue_bytes
        {
            return Err(CoreError::UnsafeBounds);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SnapshotTailState {
    AwaitingSnapshot,
    SnapshotBackfill,
    TailReady,
    AwaitingDurableCommit,
    ResnapshotRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DurableCheckpoint {
    pub snapshot: SnapshotBoundary,
    pub committed_position: Option<SourcePosition>,
    pub committed_revision: u64,
    pub tail_ready: bool,
}

impl DurableCheckpoint {
    /// Validates a post-commit checkpoint used after process restart.
    ///
    /// # Errors
    ///
    /// Returns an error when snapshot provenance, the durable position or the
    /// tail-ready state is inconsistent with the admitted source.
    pub fn validate_against(&self, admission: &EventSourceAdmission) -> Result<(), CoreError> {
        self.snapshot.validate_against(admission)?;
        if self.tail_ready && self.committed_position.is_none() {
            return Err(CoreError::InvalidCheckpoint);
        }
        if let Some(position) = &self.committed_position {
            position.validate(false)?;
            let position_sequence = position.sequence_u64()?;
            let high_watermark_sequence = self.snapshot.high_watermark.sequence_u64()?;
            if position.source_epoch != self.snapshot.high_watermark.source_epoch
                || (!self.tail_ready && position_sequence > high_watermark_sequence)
                || (self.tail_ready && position_sequence < high_watermark_sequence)
            {
                return Err(CoreError::InvalidCheckpoint);
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingAppend {
    admission: EventSourceAdmission,
    snapshot: SnapshotBoundary,
    bounds: IngestBounds,
    frame: SourceFrame,
    batch_digest: String,
    expected_previous_position: Option<SourcePosition>,
    target_position: SourcePosition,
}

impl PendingAppend {
    #[must_use]
    pub fn admission(&self) -> &EventSourceAdmission {
        &self.admission
    }

    #[must_use]
    pub fn snapshot(&self) -> &SnapshotBoundary {
        &self.snapshot
    }

    #[must_use]
    pub fn frame(&self) -> &SourceFrame {
        &self.frame
    }

    #[must_use]
    pub fn batch_digest(&self) -> &str {
        &self.batch_digest
    }

    #[must_use]
    pub fn expected_previous_position(&self) -> Option<&SourcePosition> {
        self.expected_previous_position.as_ref()
    }

    #[must_use]
    pub fn target_position(&self) -> &SourcePosition {
        &self.target_position
    }

    #[must_use]
    pub fn snapshot_is_complete(&self) -> bool {
        self.frame.lane == FrameLane::HistoryBackfill && self.frame.complete
    }

    /// Revalidates the non-forgeable pending append immediately before a
    /// storage implementation opens its transaction.  The fields are private
    /// so only [`SnapshotTailCoordinator`] can construct this capability.
    ///
    /// # Errors
    ///
    /// Returns an error if any bound source, snapshot, frame or checksum
    /// invariant changed before the transaction starts.
    pub fn validate_for_storage(&self) -> Result<(), CoreError> {
        self.admission.validate()?;
        self.snapshot.validate_against(&self.admission)?;
        self.frame.validate(&self.bounds)?;
        if self.frame.binding != self.admission.binding
            || self.frame.binding != self.snapshot.binding
            || self.frame.snapshot_high_watermark != self.snapshot.high_watermark
            || self.frame.content_digest != self.batch_digest
            || self.frame.final_position() != Some(&self.target_position)
        {
            return Err(CoreError::PendingAppendInvariant);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DurableAppendReceipt {
    pub batch_digest: String,
    pub committed_position: SourcePosition,
    pub committed_revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IngestEffect {
    SnapshotStarted,
    CommitRequired {
        batch_digest: String,
        record_count: usize,
    },
    DurableCheckpointAdvanced {
        state: SnapshotTailState,
        committed_revision: u64,
    },
    ResnapshotRequired {
        reason: &'static str,
    },
}

/// Provider-neutral state machine.  It cannot establish a transport session
/// and its durable offset changes only in [`Self::acknowledge_durable_append`].
pub struct SnapshotTailCoordinator {
    admission: EventSourceAdmission,
    bounds: IngestBounds,
    state: SnapshotTailState,
    snapshot: Option<SnapshotBoundary>,
    committed_position: Option<SourcePosition>,
    committed_revision: u64,
    pending: Option<PendingAppend>,
}

impl SnapshotTailCoordinator {
    /// Creates a coordinator only for a source that has independent runtime
    /// acceptance.  A source-dark or contract-only return fails closed.
    ///
    /// # Errors
    ///
    /// Returns an error if source admission or the configured in-memory bounds
    /// are unsafe.
    pub fn new(admission: EventSourceAdmission, bounds: IngestBounds) -> Result<Self, CoreError> {
        admission.validate()?;
        bounds.validate()?;
        Ok(Self {
            admission,
            bounds,
            state: SnapshotTailState::AwaitingSnapshot,
            snapshot: None,
            committed_position: None,
            committed_revision: 0,
            pending: None,
        })
    }

    /// Restores exactly the last durable state after a process restart.
    ///
    /// # Errors
    ///
    /// Returns an error if admission, bounds or the durable checkpoint does
    /// not match the source binding.
    pub fn resume(
        admission: EventSourceAdmission,
        bounds: IngestBounds,
        checkpoint: DurableCheckpoint,
    ) -> Result<Self, CoreError> {
        admission.validate()?;
        bounds.validate()?;
        checkpoint.validate_against(&admission)?;
        Ok(Self {
            admission,
            bounds,
            state: if checkpoint.tail_ready {
                SnapshotTailState::TailReady
            } else {
                SnapshotTailState::SnapshotBackfill
            },
            snapshot: Some(checkpoint.snapshot),
            committed_position: checkpoint.committed_position,
            committed_revision: checkpoint.committed_revision,
            pending: None,
        })
    }

    #[must_use]
    pub const fn state(&self) -> SnapshotTailState {
        self.state
    }

    #[must_use]
    pub fn pending_append(&self) -> Option<&PendingAppend> {
        self.pending.as_ref()
    }

    #[must_use]
    pub fn durable_checkpoint(&self) -> Option<DurableCheckpoint> {
        self.snapshot.clone().map(|snapshot| DurableCheckpoint {
            snapshot,
            committed_position: self.committed_position.clone(),
            committed_revision: self.committed_revision,
            tail_ready: self.state == SnapshotTailState::TailReady,
        })
    }

    /// Starts an explicit snapshot epoch.  The snapshot itself is not durable
    /// yet and this method cannot issue a source acknowledgement.
    ///
    /// # Errors
    ///
    /// Returns an error unless the coordinator is awaiting a complete snapshot
    /// matching its admitted source.
    pub fn begin_snapshot(
        &mut self,
        snapshot: SnapshotBoundary,
    ) -> Result<IngestEffect, CoreError> {
        if self.state != SnapshotTailState::AwaitingSnapshot {
            return Err(CoreError::InvalidCoordinatorState);
        }
        snapshot.validate_against(&self.admission)?;
        self.snapshot = Some(snapshot);
        self.state = SnapshotTailState::SnapshotBackfill;
        Ok(IngestEffect::SnapshotStarted)
    }

    /// Validates and stages exactly one snapshot or tail frame.  The returned
    /// pending append must be committed atomically by the durable store before
    /// [`Self::acknowledge_durable_append`] can advance the local offset.
    ///
    /// # Errors
    ///
    /// Returns an error on invalid state, source/profile drift, a gap, an
    /// unexpected lane, or any invalid frame; it never advances the offset.
    pub fn prepare_append(&mut self, frame: SourceFrame) -> Result<IngestEffect, CoreError> {
        if self.state == SnapshotTailState::AwaitingDurableCommit {
            return Err(CoreError::AppendAlreadyPending);
        }
        if self.state == SnapshotTailState::ResnapshotRequired {
            return Err(CoreError::ResnapshotRequired);
        }
        frame.validate(&self.bounds)?;
        let snapshot = self
            .snapshot
            .as_ref()
            .ok_or(CoreError::SnapshotNotStarted)?;
        if frame.binding != self.admission.binding
            || frame.binding != snapshot.binding
            || frame.snapshot_high_watermark != snapshot.high_watermark
        {
            return Err(CoreError::BindingMismatch);
        }

        let target = frame
            .final_position()
            .cloned()
            .ok_or(CoreError::FrameBoundExceeded)?;
        let expected_previous = self.committed_position.clone();
        match self.state {
            SnapshotTailState::SnapshotBackfill => {
                if frame.lane != FrameLane::HistoryBackfill {
                    return Err(CoreError::UnexpectedFrameLane);
                }
                Self::validate_snapshot_frame(&frame, snapshot, expected_previous.as_ref())?;
            }
            SnapshotTailState::TailReady => {
                if !matches!(frame.lane, FrameLane::Current | FrameLane::LiveTail) || frame.complete
                {
                    return Err(CoreError::UnexpectedFrameLane);
                }
                Self::validate_tail_frame(&frame, expected_previous.as_ref())?;
            }
            SnapshotTailState::AwaitingSnapshot
            | SnapshotTailState::AwaitingDurableCommit
            | SnapshotTailState::ResnapshotRequired => {
                return Err(CoreError::InvalidCoordinatorState)
            }
        }
        let batch_digest = frame.content_digest.clone();
        self.pending = Some(PendingAppend {
            admission: self.admission.clone(),
            snapshot: snapshot.clone(),
            bounds: self.bounds.clone(),
            frame,
            batch_digest: batch_digest.clone(),
            expected_previous_position: expected_previous,
            target_position: target,
        });
        self.state = SnapshotTailState::AwaitingDurableCommit;
        Ok(IngestEffect::CommitRequired {
            batch_digest,
            record_count: self
                .pending
                .as_ref()
                .map_or(0, |pending| pending.frame.records.len()),
        })
    }

    /// Advances the in-memory offset after, and only after, an exact durable
    /// append-store acknowledgement.
    ///
    /// # Errors
    ///
    /// Returns an error unless the receipt exactly matches the currently
    /// pending append and moves the committed revision forward.
    pub fn acknowledge_durable_append(
        &mut self,
        receipt: DurableAppendReceipt,
    ) -> Result<IngestEffect, CoreError> {
        if self.state != SnapshotTailState::AwaitingDurableCommit {
            return Err(CoreError::InvalidCoordinatorState);
        }
        let pending = self
            .pending
            .as_ref()
            .ok_or(CoreError::InvalidCoordinatorState)?;
        if receipt.batch_digest != pending.batch_digest
            || receipt.committed_position != pending.target_position
            || receipt.committed_revision <= self.committed_revision
        {
            return Err(CoreError::DurableReceiptMismatch);
        }
        let snapshot_complete =
            pending.frame.lane == FrameLane::HistoryBackfill && pending.frame.complete;
        self.committed_position = Some(receipt.committed_position);
        self.committed_revision = receipt.committed_revision;
        self.pending = None;
        self.state = if snapshot_complete {
            SnapshotTailState::TailReady
        } else {
            SnapshotTailState::SnapshotBackfill
        };
        Ok(IngestEffect::DurableCheckpointAdvanced {
            state: self.state,
            committed_revision: self.committed_revision,
        })
    }

    /// Marks a non-recoverable integrity condition.  A caller must begin a new
    /// explicit snapshot; silently skipping or rewinding a source position is
    /// prohibited.
    pub fn require_resnapshot(&mut self, reason: &'static str) -> IngestEffect {
        self.pending = None;
        self.state = SnapshotTailState::ResnapshotRequired;
        IngestEffect::ResnapshotRequired { reason }
    }

    fn validate_snapshot_frame(
        frame: &SourceFrame,
        snapshot: &SnapshotBoundary,
        committed: Option<&SourcePosition>,
    ) -> Result<(), CoreError> {
        if frame.complete != (frame.final_position() == Some(&snapshot.high_watermark)) {
            return Err(CoreError::InvalidSnapshotFrame);
        }
        let first = frame.records.first().ok_or(CoreError::FrameBoundExceeded)?;
        if let Some(committed) = committed {
            if frame.previous_position.as_ref() != Some(committed)
                || !first.source_position.directly_follows(committed)?
            {
                return Err(CoreError::SourceSequenceGap);
            }
        } else if frame.previous_position.is_some()
            || first.source_position != snapshot.retention_floor
        {
            return Err(CoreError::InvalidSnapshotFrame);
        }
        if !frame
            .final_position()
            .ok_or(CoreError::FrameBoundExceeded)?
            .no_later_than(&snapshot.high_watermark)?
        {
            return Err(CoreError::InvalidSnapshotFrame);
        }
        Ok(())
    }

    fn validate_tail_frame(
        frame: &SourceFrame,
        committed: Option<&SourcePosition>,
    ) -> Result<(), CoreError> {
        let committed = committed.ok_or(CoreError::TailBeforeSnapshot)?;
        let first = frame.records.first().ok_or(CoreError::FrameBoundExceeded)?;
        if frame.previous_position.as_ref() != Some(committed)
            || !first.source_position.directly_follows(committed)?
        {
            return Err(CoreError::SourceSequenceGap);
        }
        if first.source_position.sequence_u64()? <= frame.snapshot_high_watermark.sequence_u64()? {
            return Err(CoreError::TailBeforeSnapshot);
        }
        Ok(())
    }
}

/// A bounded in-memory ingress queue.  It intentionally rejects overflow;
/// source-specific disk spool policy belongs to the runtime adapter and cannot
/// be inferred before an accepted owner transport contract exists.
pub struct BoundedFrameQueue {
    bounds: IngestBounds,
    live: VecDeque<QueuedFrame>,
    current: VecDeque<QueuedFrame>,
    history: VecDeque<QueuedFrame>,
    queued_bytes: usize,
    unacked: BTreeMap<u64, usize>,
    unacked_bytes: usize,
    next_delivery_id: u64,
}

#[derive(Debug, Clone)]
pub struct QueuedFrame {
    pub delivery_id: u64,
    pub frame: SourceFrame,
    pub encoded_bytes: usize,
}

impl BoundedFrameQueue {
    /// Creates a queue whose strict priority is live tail, current state, then
    /// historical backfill.  This prevents backfill from starving live data.
    ///
    /// # Errors
    ///
    /// Returns an error if configured queue or unacknowledged-byte bounds are
    /// unsafe.
    pub fn new(bounds: IngestBounds) -> Result<Self, CoreError> {
        bounds.validate()?;
        Ok(Self {
            bounds,
            live: VecDeque::new(),
            current: VecDeque::new(),
            history: VecDeque::new(),
            queued_bytes: 0,
            unacked: BTreeMap::new(),
            unacked_bytes: 0,
            next_delivery_id: 0,
        })
    }

    /// Enqueues one fully validated frame without opening a source connection.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid frame or bounded queue overflow; callers
    /// must apply source-specific backpressure rather than drop the frame.
    pub fn enqueue(&mut self, frame: SourceFrame) -> Result<(), CoreError> {
        frame.validate(&self.bounds)?;
        let encoded_bytes = frame.encoded_len()?;
        let lane = match frame.lane {
            FrameLane::LiveTail => &mut self.live,
            FrameLane::Current => &mut self.current,
            FrameLane::HistoryBackfill => &mut self.history,
        };
        if lane.len() >= self.bounds.maximum_queue_frames_per_lane
            || self.queued_bytes.saturating_add(encoded_bytes) > self.bounds.maximum_queue_bytes
        {
            return Err(CoreError::IngressBackpressure);
        }
        lane.push_back(QueuedFrame {
            delivery_id: 0,
            frame,
            encoded_bytes,
        });
        self.queued_bytes = self.queued_bytes.saturating_add(encoded_bytes);
        Ok(())
    }

    /// Dequeues one frame under priority and unacknowledged-byte limits.
    ///
    /// # Errors
    ///
    /// Returns an error if the in-flight byte cap or delivery identifier limit
    /// would be exceeded; it leaves the frame queued in that case.
    pub fn dequeue(&mut self) -> Result<Option<QueuedFrame>, CoreError> {
        let source = if !self.live.is_empty() {
            &mut self.live
        } else if !self.current.is_empty() {
            &mut self.current
        } else {
            &mut self.history
        };
        let Some(mut queued) = source.pop_front() else {
            return Ok(None);
        };
        if self.unacked_bytes.saturating_add(queued.encoded_bytes)
            > self.bounds.maximum_unacked_bytes
        {
            source.push_front(queued);
            return Err(CoreError::UnackedByteLimit);
        }
        self.queued_bytes = self.queued_bytes.saturating_sub(queued.encoded_bytes);
        self.next_delivery_id = self
            .next_delivery_id
            .checked_add(1)
            .ok_or(CoreError::DeliveryIdExhausted)?;
        queued.delivery_id = self.next_delivery_id;
        self.unacked
            .insert(queued.delivery_id, queued.encoded_bytes);
        self.unacked_bytes = self.unacked_bytes.saturating_add(queued.encoded_bytes);
        Ok(Some(queued))
    }

    /// Releases in-flight capacity only after a durable append acknowledgement.
    ///
    /// # Errors
    ///
    /// Returns an error if the delivery was not currently in flight.
    pub fn acknowledge_durable(&mut self, delivery_id: u64) -> Result<(), CoreError> {
        let bytes = self
            .unacked
            .remove(&delivery_id)
            .ok_or(CoreError::UnknownDelivery)?;
        self.unacked_bytes = self.unacked_bytes.saturating_sub(bytes);
        Ok(())
    }
}

fn parse_decimal_u64(raw: &str, allow_zero: bool) -> Result<u64, CoreError> {
    if raw.is_empty()
        || raw.len() > 20
        || (raw.len() > 1 && raw.starts_with('0'))
        || !raw.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(CoreError::InvalidSourcePosition);
    }
    let value = raw
        .parse::<u64>()
        .map_err(|_| CoreError::InvalidSourcePosition)?;
    if !allow_zero && value == 0 {
        return Err(CoreError::InvalidSourcePosition);
    }
    Ok(value)
}

fn validate_identifier(value: &str) -> Result<(), CoreError> {
    if value.is_empty()
        || value.len() > MAX_IDENTIFIER_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-' | b':'))
    {
        return Err(CoreError::InvalidIdentifier);
    }
    Ok(())
}

fn validate_sha256(value: &str) -> Result<(), CoreError> {
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(CoreError::InvalidDigest);
    }
    Ok(())
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum CoreError {
    #[error("event-source admission schema is unsupported")]
    AdmissionSchemaUnsupported,
    #[error("the source has not independently accepted runtime activation")]
    SourceRuntimeNotAccepted,
    #[error("the source lacks a required snapshot-tail, correction or durable-ack semantic")]
    RequiredSourceSemanticMissing,
    #[error("event-stream identifier or version is invalid")]
    InvalidIdentifier,
    #[error("event-stream environment is invalid")]
    InvalidEnvironment,
    #[error("a digest is not canonical sha256")]
    InvalidDigest,
    #[error("source epoch or exact decimal sequence is invalid")]
    InvalidSourcePosition,
    #[error("source sequence cannot advance past u64")]
    SourceSequenceExhausted,
    #[error("source binding does not match the admitted profile or snapshot")]
    BindingMismatch,
    #[error("snapshot boundary is incomplete or inconsistent")]
    InvalidSnapshotBoundary,
    #[error("event frame schema is unsupported")]
    FrameSchemaUnsupported,
    #[error("event frame exceeds configured bounds")]
    FrameBoundExceeded,
    #[error("event frame checksum does not match decoded content")]
    FrameChecksumMismatch,
    #[error("event frame cannot be canonically serialized")]
    FrameSerialization,
    #[error("event source epoch differs from its snapshot")]
    EpochMismatch,
    #[error("event is malformed or its payload digest drifted")]
    InvalidEvent,
    #[error("correction semantics are invalid")]
    InvalidCorrectionSemantics,
    #[error("ingest bounds are unsafe")]
    UnsafeBounds,
    #[error("snapshot has not started")]
    SnapshotNotStarted,
    #[error("coordinator state transition is invalid")]
    InvalidCoordinatorState,
    #[error("another append is awaiting durable acknowledgement")]
    AppendAlreadyPending,
    #[error("frame lane is invalid for the current snapshot-tail state")]
    UnexpectedFrameLane,
    #[error("snapshot backfill frame is invalid")]
    InvalidSnapshotFrame,
    #[error("tail frame arrived before a durable complete snapshot")]
    TailBeforeSnapshot,
    #[error("source sequence is duplicate, out of order or contains a gap")]
    SourceSequenceGap,
    #[error("durable append receipt does not match the staged frame")]
    DurableReceiptMismatch,
    #[error("checkpoint is invalid for the admitted event source")]
    InvalidCheckpoint,
    #[error("a pending append is internally inconsistent")]
    PendingAppendInvariant,
    #[error("current-state reducer received a different entity")]
    CurrentReducerIdentityMismatch,
    #[error("current-state reducer received a non-monotonic source position")]
    CurrentReducerOutOfOrder,
    #[error("an explicit resnapshot is required")]
    ResnapshotRequired,
    #[error("ingress queue applied backpressure")]
    IngressBackpressure,
    #[error("unacknowledged-byte limit was reached")]
    UnackedByteLimit,
    #[error("delivery identifier is exhausted")]
    DeliveryIdExhausted,
    #[error("delivery acknowledgement is unknown or already consumed")]
    UnknownDelivery,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(value: char) -> String {
        format!("sha256:{}", value.to_string().repeat(64))
    }

    fn binding() -> EventStreamBinding {
        EventStreamBinding {
            stream_id: "execution.fill-lifecycle.v1".to_owned(),
            contract_revision: "eds09-synthetic-v1".to_owned(),
            workspace_id: CanonicalId::parse("workspace_eds09").unwrap(),
            environment: "paper".to_owned(),
            profile_id: "PAPER_BINANCE_USDM".to_owned(),
            venue_id: "BINANCE_USDM".to_owned(),
            resource_kind: "deployment".to_owned(),
            resource_id: "deployment_eds09".to_owned(),
            filter_digest: digest('a'),
        }
    }

    fn position(sequence: u64) -> SourcePosition {
        SourcePosition::new("epoch_eds09", sequence.to_string()).unwrap()
    }

    fn admission(runtime_accepted: bool) -> EventSourceAdmission {
        EventSourceAdmission {
            schema_version: EDS09_ADMISSION_SCHEMA_VERSION.to_owned(),
            binding: binding(),
            contract_digest: digest('b'),
            owner_return_digest: digest('c'),
            runtime_evidence_digest: digest('d'),
            transport_contract_digest: digest('e'),
            local_storage_policy_digest: digest('f'),
            retention_floor: position(8),
            source_runtime_accepted: runtime_accepted,
            snapshot_tail_supported: true,
            correction_tombstone_supported: true,
            durable_ack_supported: true,
        }
    }

    fn boundary() -> SnapshotBoundary {
        SnapshotBoundary {
            binding: binding(),
            snapshot_id: "snapshot_eds09".to_owned(),
            snapshot_as_of_ms: 1_788_500_000_000,
            high_watermark: position(10),
            retention_floor: position(8),
            completeness: SnapshotCompleteness::Complete,
        }
    }

    fn event(sequence: u64, operation: EventOperation) -> AuthoritativeEvent {
        let payload = serde_json::json!({"sequence": sequence.to_string(), "state": "accepted"});
        AuthoritativeEvent {
            event_id: CanonicalId::parse(format!("event_{sequence}")).unwrap(),
            source_position: position(sequence),
            entity_kind: "fill".to_owned(),
            entity_id: CanonicalId::parse("fill_eds09").unwrap(),
            entity_version: format!("version_{sequence}"),
            payload_schema_revision: "fill-payload-v1".to_owned(),
            operation,
            event_time_ms: 1_788_500_000_000 + i64::try_from(sequence).unwrap(),
            source_published_at_ms: 1_788_500_000_100 + i64::try_from(sequence).unwrap(),
            correction_of_event_id: None,
            tombstone_of_event_id: if operation == EventOperation::Tombstone {
                Some(CanonicalId::parse("event_10").unwrap())
            } else {
                None
            },
            causation_id: None,
            correlation_id: None,
            payload_digest: canonical_value_digest(&payload),
            payload,
        }
    }

    fn correction(sequence: u64) -> AuthoritativeEvent {
        let mut event = event(sequence, EventOperation::Correction);
        event.correction_of_event_id = Some(CanonicalId::parse("event_10").unwrap());
        event
    }

    fn frame(
        lane: FrameLane,
        previous: Option<SourcePosition>,
        records: Vec<AuthoritativeEvent>,
        complete: bool,
    ) -> SourceFrame {
        SourceFrame::seal(
            binding(),
            lane,
            position(10),
            previous,
            records,
            complete,
            1_788_500_000_500,
        )
        .unwrap()
    }

    fn commit(coordinator: &mut SnapshotTailCoordinator, revision: u64) {
        let pending = coordinator.pending_append().unwrap();
        coordinator
            .acknowledge_durable_append(DurableAppendReceipt {
                batch_digest: pending.batch_digest.clone(),
                committed_position: pending.target_position.clone(),
                committed_revision: revision,
            })
            .unwrap();
    }

    #[test]
    fn source_dark_contract_cannot_construct_a_runtime_coordinator() {
        assert!(matches!(
            SnapshotTailCoordinator::new(admission(false), IngestBounds::default()),
            Err(CoreError::SourceRuntimeNotAccepted)
        ));
    }

    #[test]
    fn snapshot_backfill_must_be_durable_before_tail_starts() {
        let mut coordinator =
            SnapshotTailCoordinator::new(admission(true), IngestBounds::default()).unwrap();
        assert_eq!(
            coordinator.begin_snapshot(boundary()).unwrap(),
            IngestEffect::SnapshotStarted
        );
        coordinator
            .prepare_append(frame(
                FrameLane::HistoryBackfill,
                None,
                vec![
                    event(8, EventOperation::Upsert),
                    event(9, EventOperation::Upsert),
                ],
                false,
            ))
            .unwrap();
        assert_eq!(
            coordinator.state(),
            SnapshotTailState::AwaitingDurableCommit
        );
        assert!(matches!(
            coordinator.prepare_append(frame(
                FrameLane::HistoryBackfill,
                Some(position(9)),
                vec![event(10, EventOperation::Upsert)],
                true,
            )),
            Err(CoreError::AppendAlreadyPending)
        ));
        commit(&mut coordinator, 1);
        assert_eq!(coordinator.state(), SnapshotTailState::SnapshotBackfill);
        coordinator
            .prepare_append(frame(
                FrameLane::HistoryBackfill,
                Some(position(9)),
                vec![event(10, EventOperation::Upsert)],
                true,
            ))
            .unwrap();
        commit(&mut coordinator, 2);
        assert_eq!(coordinator.state(), SnapshotTailState::TailReady);
        coordinator
            .prepare_append(frame(
                FrameLane::LiveTail,
                Some(position(10)),
                vec![event(11, EventOperation::Tombstone)],
                false,
            ))
            .unwrap();
        commit(&mut coordinator, 3);
        assert_eq!(
            coordinator.durable_checkpoint().unwrap().committed_position,
            Some(position(11))
        );
    }

    #[test]
    fn gap_epoch_and_bad_receipt_fail_closed() {
        let mut coordinator =
            SnapshotTailCoordinator::new(admission(true), IngestBounds::default()).unwrap();
        coordinator.begin_snapshot(boundary()).unwrap();
        coordinator
            .prepare_append(frame(
                FrameLane::HistoryBackfill,
                None,
                vec![
                    event(8, EventOperation::Upsert),
                    event(9, EventOperation::Upsert),
                ],
                false,
            ))
            .unwrap();
        let pending = coordinator.pending_append().unwrap();
        assert!(matches!(
            coordinator.acknowledge_durable_append(DurableAppendReceipt {
                batch_digest: digest('f'),
                committed_position: pending.target_position.clone(),
                committed_revision: 1,
            }),
            Err(CoreError::DurableReceiptMismatch)
        ));
        commit(&mut coordinator, 1);
        assert!(matches!(
            coordinator.prepare_append(frame(
                FrameLane::HistoryBackfill,
                Some(position(9)),
                vec![event(11, EventOperation::Upsert)],
                false,
            )),
            Err(CoreError::SourceSequenceGap)
        ));
        assert_eq!(
            coordinator.require_resnapshot("SOURCE_SEQUENCE_GAP"),
            IngestEffect::ResnapshotRequired {
                reason: "SOURCE_SEQUENCE_GAP"
            }
        );
        assert_eq!(coordinator.state(), SnapshotTailState::ResnapshotRequired);
    }

    #[test]
    fn corrections_and_tombstones_are_immutable_new_events() {
        let mut corrected = correction(11);
        assert!(corrected.validate().is_ok());
        corrected.correction_of_event_id = None;
        assert_eq!(
            corrected.validate(),
            Err(CoreError::InvalidCorrectionSemantics)
        );

        let mut tombstone = event(12, EventOperation::Tombstone);
        tombstone.correction_of_event_id = Some(CanonicalId::parse("event_11").unwrap());
        assert_eq!(
            tombstone.validate(),
            Err(CoreError::InvalidCorrectionSemantics)
        );
        let mut self_target = correction(13);
        self_target.correction_of_event_id = Some(self_target.event_id.clone());
        assert_eq!(
            self_target.validate(),
            Err(CoreError::InvalidCorrectionSemantics)
        );

        let current = reduce_current_entity(None, &event(10, EventOperation::Upsert)).unwrap();
        assert!(matches!(
            reduce_current_entity(Some(&current), &event(9, EventOperation::Upsert)),
            Err(CoreError::CurrentReducerOutOfOrder)
        ));
    }

    #[test]
    fn checksum_cross_profile_and_queue_priority_are_enforced() {
        let mut bad = frame(
            FrameLane::HistoryBackfill,
            None,
            vec![event(8, EventOperation::Upsert)],
            false,
        );
        bad.records[0].payload = serde_json::json!({"tampered": true});
        assert_eq!(
            bad.validate(&IngestBounds::default()),
            Err(CoreError::FrameChecksumMismatch)
        );

        let mut queue = BoundedFrameQueue::new(IngestBounds::default()).unwrap();
        queue
            .enqueue(frame(
                FrameLane::HistoryBackfill,
                None,
                vec![event(8, EventOperation::Upsert)],
                false,
            ))
            .unwrap();
        queue
            .enqueue(frame(
                FrameLane::LiveTail,
                Some(position(10)),
                vec![event(11, EventOperation::Upsert)],
                false,
            ))
            .unwrap();
        let first = queue.dequeue().unwrap().unwrap();
        assert_eq!(first.frame.lane, FrameLane::LiveTail);
        queue.acknowledge_durable(first.delivery_id).unwrap();
    }
}
