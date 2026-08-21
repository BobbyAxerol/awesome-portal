#![forbid(unsafe_code)]

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    str::FromStr,
    time::Duration,
};

use chrono::{DateTime, TimeDelta, Utc};
use execution_contracts::{
    CanonicalId, ContractWarning, FreshnessState, SourceAuthority, SourceCompleteness, SourceCursor,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const PROJECTION_SCHEMA_VERSION: &str = "execution.projection.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionScope {
    pub workspace_id: CanonicalId,
    pub environment: String,
}

impl ProjectionScope {
    /// Constructs an environment-bound projection scope.
    ///
    /// # Errors
    ///
    /// Returns [`ProjectionError::InvalidEnvironment`] unless the environment is
    /// one of the three execution environments supported by the Portal edge.
    pub fn new(
        workspace_id: CanonicalId,
        environment: impl Into<String>,
    ) -> Result<Self, ProjectionError> {
        let environment = environment.into();
        if !matches!(environment.as_str(), "paper" | "sandbox" | "live") {
            return Err(ProjectionError::InvalidEnvironment);
        }
        Ok(Self {
            workspace_id,
            environment,
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProjectionEntityKind {
    Order,
    Fill,
    Position,
    Runtime,
    Account,
    BrokerBinding,
    Reconciliation,
    Performance,
    Operation,
}

impl ProjectionEntityKind {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Order => "ORDER",
            Self::Fill => "FILL",
            Self::Position => "POSITION",
            Self::Runtime => "RUNTIME",
            Self::Account => "ACCOUNT",
            Self::BrokerBinding => "BROKER_BINDING",
            Self::Reconciliation => "RECONCILIATION",
            Self::Performance => "PERFORMANCE",
            Self::Operation => "OPERATION",
        }
    }
}

impl FromStr for ProjectionEntityKind {
    type Err = ProjectionError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "ORDER" => Ok(Self::Order),
            "FILL" => Ok(Self::Fill),
            "POSITION" => Ok(Self::Position),
            "RUNTIME" => Ok(Self::Runtime),
            "ACCOUNT" => Ok(Self::Account),
            "BROKER_BINDING" => Ok(Self::BrokerBinding),
            "RECONCILIATION" => Ok(Self::Reconciliation),
            "PERFORMANCE" => Ok(Self::Performance),
            "OPERATION" => Ok(Self::Operation),
            _ => Err(ProjectionError::InvalidEntityKind),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ProjectionEntityKey {
    pub kind: ProjectionEntityKind,
    pub entity_id: CanonicalId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionObservation {
    pub ingestion_id: CanonicalId,
    pub entity: ProjectionEntityKey,
    pub source_authority: SourceAuthority,
    pub as_of: Option<DateTime<Utc>>,
    pub source_read_at: DateTime<Utc>,
    pub source_cursor: Option<SourceCursor>,
    pub source_sequence: Option<i64>,
    pub source_completeness: SourceCompleteness,
    pub poll_interval_ms: Option<i64>,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
    pub payload: Value,
}

impl ProjectionObservation {
    /// Validates completeness, sequence, payload and adapter invariants.
    ///
    /// # Errors
    ///
    /// Returns a fail-closed projection error for an ambiguous observation.
    pub fn validate(&self) -> Result<(), ProjectionError> {
        if !self.payload.is_object() {
            return Err(ProjectionError::PayloadMustBeObject);
        }
        if self.adapter_version.trim().is_empty() || self.capability_snapshot_id.trim().is_empty() {
            return Err(ProjectionError::MissingCompatibilityIdentity);
        }
        if self.source_sequence.is_some_and(|sequence| sequence < 0) {
            return Err(ProjectionError::InvalidSourceSequence);
        }
        match (self.source_completeness, self.poll_interval_ms) {
            (SourceCompleteness::PollBounded, Some(interval)) if interval > 0 => Ok(()),
            (SourceCompleteness::PollBounded, _) => Err(ProjectionError::MissingPollInterval),
            (_, None) => Ok(()),
            (_, Some(_)) => Err(ProjectionError::UnexpectedPollInterval),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectedEntity {
    pub epoch_id: Uuid,
    pub projection_sequence: u64,
    pub entity: ProjectionEntityKey,
    pub source_authority: SourceAuthority,
    pub as_of: Option<DateTime<Utc>>,
    pub source_read_at: DateTime<Utc>,
    pub projected_at: DateTime<Utc>,
    pub source_cursor: Option<SourceCursor>,
    pub source_sequence: Option<i64>,
    pub source_completeness: SourceCompleteness,
    pub poll_interval_ms: Option<i64>,
    pub adapter_version: String,
    pub capability_snapshot_id: String,
    pub payload_digest: String,
    pub payload: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionGap {
    pub code: String,
    pub entity: ProjectionEntityKey,
    pub previous_source_sequence: Option<i64>,
    pub observed_source_sequence: Option<i64>,
    pub detected_at_projection_sequence: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApplyDisposition {
    Applied { sequence: u64 },
    Refreshed { sequence: u64 },
    GapApplied { sequence: u64 },
    Duplicate,
    OutOfOrder,
}

#[derive(Debug, Clone)]
pub struct ProjectionReducer {
    scope: ProjectionScope,
    epoch_id: Uuid,
    sequence: u64,
    entities: BTreeMap<ProjectionEntityKey, ProjectedEntity>,
    applied_ingestions: BTreeMap<CanonicalId, String>,
    gaps: Vec<ProjectionGap>,
}

impl ProjectionReducer {
    #[must_use]
    pub fn new(scope: ProjectionScope, epoch_id: Uuid) -> Self {
        Self {
            scope,
            epoch_id,
            sequence: 0,
            entities: BTreeMap::new(),
            applied_ingestions: BTreeMap::new(),
            gaps: Vec::new(),
        }
    }

    /// Hydrates the reducer from one transactionally locked current row.
    ///
    /// `PostgreSQL` owns historical idempotency keys; this constructor exists so
    /// the repository can reuse the exact pure reduction rules without loading
    /// an entire epoch into memory.
    ///
    /// # Errors
    ///
    /// Rejects a current row from another epoch or ahead of the locked epoch
    /// sequence.
    pub fn from_current(
        scope: ProjectionScope,
        epoch_id: Uuid,
        sequence: u64,
        current: Option<ProjectedEntity>,
    ) -> Result<Self, ProjectionError> {
        let mut reducer = Self::new(scope, epoch_id);
        reducer.sequence = sequence;
        if let Some(current) = current {
            if current.epoch_id != epoch_id || current.projection_sequence > sequence {
                return Err(ProjectionError::InvalidHydratedState);
            }
            reducer.entities.insert(current.entity.clone(), current);
        }
        Ok(reducer)
    }

    #[must_use]
    pub const fn epoch_id(&self) -> Uuid {
        self.epoch_id
    }

    #[must_use]
    pub const fn sequence(&self) -> u64 {
        self.sequence
    }

    #[must_use]
    pub fn scope(&self) -> &ProjectionScope {
        &self.scope
    }

    #[must_use]
    pub fn entities(&self) -> &BTreeMap<ProjectionEntityKey, ProjectedEntity> {
        &self.entities
    }

    #[must_use]
    pub fn gaps(&self) -> &[ProjectionGap] {
        &self.gaps
    }

    /// Applies one canonical observation idempotently.
    ///
    /// # Errors
    ///
    /// Fails on idempotency/cursor collisions, invalid completeness metadata or
    /// sequence exhaustion. A failure never mutates the reducer.
    pub fn apply(
        &mut self,
        observation: ProjectionObservation,
        projected_at: DateTime<Utc>,
    ) -> Result<ApplyDisposition, ProjectionError> {
        observation.validate()?;
        let input_digest = canonical_digest(&observation)?;
        if let Some(previous_digest) = self.applied_ingestions.get(&observation.ingestion_id) {
            return if previous_digest == &input_digest {
                Ok(ApplyDisposition::Duplicate)
            } else {
                Err(ProjectionError::IdempotencyCollision)
            };
        }

        let current = self.entities.get(&observation.entity);
        if let Some(current) = current {
            match compare_source_position(current, &observation) {
                SourceOrder::Older => {
                    self.applied_ingestions
                        .insert(observation.ingestion_id, input_digest);
                    return Ok(ApplyDisposition::OutOfOrder);
                }
                SourceOrder::Same => return Err(ProjectionError::SourceCursorCollision),
                SourceOrder::Newer => {}
            }
        }

        let gap_code = current.and_then(|entity| source_gap_code(entity, &observation));
        let same_payload = current.is_some_and(|entity| {
            entity.payload_digest == canonical_value_digest(&observation.payload)
        });
        let next_sequence = self
            .sequence
            .checked_add(1)
            .ok_or(ProjectionError::SequenceExhausted)?;
        let projected = projected_entity(self.epoch_id, next_sequence, &observation, projected_at);
        if let Some(code) = gap_code {
            self.gaps.push(ProjectionGap {
                code: code.to_owned(),
                entity: observation.entity.clone(),
                previous_source_sequence: current.and_then(|entity| entity.source_sequence),
                observed_source_sequence: observation.source_sequence,
                detected_at_projection_sequence: next_sequence,
            });
        }
        self.sequence = next_sequence;
        self.entities.insert(observation.entity.clone(), projected);
        self.applied_ingestions
            .insert(observation.ingestion_id, input_digest);
        Ok(if gap_code.is_some() {
            ApplyDisposition::GapApplied {
                sequence: next_sequence,
            }
        } else if same_payload {
            ApplyDisposition::Refreshed {
                sequence: next_sequence,
            }
        } else {
            ApplyDisposition::Applied {
                sequence: next_sequence,
            }
        })
    }

    /// Reconciles a bounded source snapshot into the epoch.
    ///
    /// A complete snapshot removes entities absent from the snapshot. A partial
    /// snapshot never deletes unseen state.
    ///
    /// # Errors
    ///
    /// Fails on count mismatch, mixed entity kinds, duplicate entity keys or a
    /// reducer error. Validation happens before the first mutation.
    pub fn reconcile_snapshot(
        &mut self,
        snapshot: ProjectionSnapshot,
        projected_at: DateTime<Utc>,
    ) -> Result<SnapshotResult, ProjectionError> {
        snapshot.validate()?;
        let ProjectionSnapshot {
            snapshot_id,
            entity_kind,
            completeness,
            observations,
            entity_ids,
            ..
        } = snapshot;
        let mut staged = self.clone();
        let mut applied = 0_usize;
        for observation in observations {
            if matches!(
                staged.apply(observation, projected_at)?,
                ApplyDisposition::Applied { .. }
                    | ApplyDisposition::Refreshed { .. }
                    | ApplyDisposition::GapApplied { .. }
            ) {
                applied += 1;
            }
        }
        let mut removed = Vec::new();
        if completeness == SnapshotCompleteness::Complete {
            let missing = staged
                .entities
                .keys()
                .filter(|key| key.kind == entity_kind && !entity_ids.contains(*key))
                .cloned()
                .collect::<Vec<_>>();
            for key in missing {
                staged.sequence = staged
                    .sequence
                    .checked_add(1)
                    .ok_or(ProjectionError::SequenceExhausted)?;
                staged.entities.remove(&key);
                removed.push(key);
            }
        }
        let digest = staged.state_digest()?;
        *self = staged;
        Ok(SnapshotResult {
            snapshot_id,
            applied,
            removed,
            projection_sequence: self.sequence,
            state_digest: digest,
        })
    }

    /// Computes a stable digest over the sorted visible entity state.
    ///
    /// # Errors
    ///
    /// Returns a serialization error only if a future payload type cannot be
    /// represented by canonical JSON.
    pub fn state_digest(&self) -> Result<String, ProjectionError> {
        semantic_state_digest(&self.entities.values().cloned().collect::<Vec<_>>())
    }
}

/// Computes parity over semantic source state, deliberately excluding the
/// Portal epoch, projection sequence and projection timestamp.
///
/// # Errors
///
/// Returns a serialization error if a future entity cannot be canonicalized.
pub fn semantic_state_digest(entities: &[ProjectedEntity]) -> Result<String, ProjectionError> {
    #[derive(Serialize)]
    struct ParityEntity<'a> {
        entity: &'a ProjectionEntityKey,
        source_authority: SourceAuthority,
        as_of: Option<DateTime<Utc>>,
        source_cursor: &'a Option<SourceCursor>,
        source_sequence: Option<i64>,
        source_completeness: SourceCompleteness,
        poll_interval_ms: Option<i64>,
        adapter_version: &'a str,
        capability_snapshot_id: &'a str,
        payload_digest: &'a str,
    }
    let mut ordered = entities.iter().collect::<Vec<_>>();
    ordered.sort_by(|left, right| left.entity.cmp(&right.entity));
    let parity = ordered
        .into_iter()
        .map(|entity| ParityEntity {
            entity: &entity.entity,
            source_authority: entity.source_authority,
            as_of: entity.as_of,
            source_cursor: &entity.source_cursor,
            source_sequence: entity.source_sequence,
            source_completeness: entity.source_completeness,
            poll_interval_ms: entity.poll_interval_ms,
            adapter_version: &entity.adapter_version,
            capability_snapshot_id: &entity.capability_snapshot_id,
            payload_digest: &entity.payload_digest,
        })
        .collect::<Vec<_>>();
    canonical_digest(&parity)
}

fn projected_entity(
    epoch_id: Uuid,
    sequence: u64,
    observation: &ProjectionObservation,
    projected_at: DateTime<Utc>,
) -> ProjectedEntity {
    ProjectedEntity {
        epoch_id,
        projection_sequence: sequence,
        entity: observation.entity.clone(),
        source_authority: observation.source_authority,
        as_of: observation.as_of,
        source_read_at: observation.source_read_at,
        projected_at,
        source_cursor: observation.source_cursor.clone(),
        source_sequence: observation.source_sequence,
        source_completeness: observation.source_completeness,
        poll_interval_ms: observation.poll_interval_ms,
        adapter_version: observation.adapter_version.clone(),
        capability_snapshot_id: observation.capability_snapshot_id.clone(),
        payload_digest: canonical_value_digest(&observation.payload),
        payload: observation.payload.clone(),
    }
}

enum SourceOrder {
    Older,
    Same,
    Newer,
}

fn compare_source_position(
    current: &ProjectedEntity,
    observation: &ProjectionObservation,
) -> SourceOrder {
    match (&current.source_cursor, &observation.source_cursor) {
        (Some(previous), Some(incoming)) => match incoming.cmp(previous) {
            std::cmp::Ordering::Less => SourceOrder::Older,
            std::cmp::Ordering::Equal => SourceOrder::Same,
            std::cmp::Ordering::Greater => SourceOrder::Newer,
        },
        (Some(_), None) => SourceOrder::Older,
        (None, Some(_)) => SourceOrder::Newer,
        (None, None) => match observation.source_read_at.cmp(&current.source_read_at) {
            std::cmp::Ordering::Less => SourceOrder::Older,
            std::cmp::Ordering::Equal => SourceOrder::Same,
            std::cmp::Ordering::Greater => SourceOrder::Newer,
        },
    }
}

fn source_gap_code(
    current: &ProjectedEntity,
    observation: &ProjectionObservation,
) -> Option<&'static str> {
    match (current.source_sequence, observation.source_sequence) {
        (Some(previous), Some(incoming)) if incoming > previous + 1 => Some("SOURCE_SEQUENCE_GAP"),
        (Some(previous), Some(incoming)) if incoming <= previous => {
            Some("SOURCE_SEQUENCE_REGRESSION")
        }
        _ => None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SnapshotCompleteness {
    Complete,
    Partial,
}

#[derive(Debug, Clone)]
pub struct ProjectionSnapshot {
    pub snapshot_id: CanonicalId,
    pub entity_kind: ProjectionEntityKind,
    pub completeness: SnapshotCompleteness,
    pub expected_count: usize,
    pub observations: Vec<ProjectionObservation>,
    entity_ids: BTreeSet<ProjectionEntityKey>,
}

impl ProjectionSnapshot {
    /// Creates an immutable, count-checked snapshot batch.
    ///
    /// # Errors
    ///
    /// Rejects mixed kinds, duplicate keys or an expected count mismatch.
    pub fn new(
        snapshot_id: CanonicalId,
        entity_kind: ProjectionEntityKind,
        completeness: SnapshotCompleteness,
        expected_count: usize,
        observations: Vec<ProjectionObservation>,
    ) -> Result<Self, ProjectionError> {
        let mut entity_ids = BTreeSet::new();
        for observation in &observations {
            observation.validate()?;
            if observation.entity.kind != entity_kind {
                return Err(ProjectionError::MixedSnapshotKinds);
            }
            if !entity_ids.insert(observation.entity.clone()) {
                return Err(ProjectionError::DuplicateSnapshotEntity);
            }
        }
        let snapshot = Self {
            snapshot_id,
            entity_kind,
            completeness,
            expected_count,
            observations,
            entity_ids,
        };
        snapshot.validate()?;
        Ok(snapshot)
    }

    fn validate(&self) -> Result<(), ProjectionError> {
        if self.expected_count != self.observations.len() {
            return Err(ProjectionError::SnapshotCountMismatch);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SnapshotResult {
    pub snapshot_id: CanonicalId,
    pub applied: usize,
    pub removed: Vec<ProjectionEntityKey>,
    pub projection_sequence: u64,
    pub state_digest: String,
}

#[derive(Debug, Clone)]
pub struct ReplayRecord {
    pub journal_ordinal: u64,
    pub observation: ProjectionObservation,
    pub projected_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct ReplayResult {
    pub reducer: ProjectionReducer,
    pub input_count: usize,
    pub duplicate_count: usize,
    pub out_of_order_count: usize,
    pub state_digest: String,
}

/// Rebuilds a projection deterministically from its immutable journal order.
///
/// # Errors
///
/// Rejects duplicate ordinals and propagates any reducer invariant failure.
pub fn replay(
    scope: ProjectionScope,
    epoch_id: Uuid,
    mut records: Vec<ReplayRecord>,
) -> Result<ReplayResult, ProjectionError> {
    records.sort_by_key(|record| record.journal_ordinal);
    if records
        .windows(2)
        .any(|pair| pair[0].journal_ordinal == pair[1].journal_ordinal)
    {
        return Err(ProjectionError::DuplicateReplayOrdinal);
    }
    let input_count = records.len();
    let mut duplicate_count = 0;
    let mut out_of_order_count = 0;
    let mut reducer = ProjectionReducer::new(scope, epoch_id);
    for record in records {
        match reducer.apply(record.observation, record.projected_at)? {
            ApplyDisposition::Duplicate => duplicate_count += 1,
            ApplyDisposition::OutOfOrder => out_of_order_count += 1,
            ApplyDisposition::Applied { .. }
            | ApplyDisposition::Refreshed { .. }
            | ApplyDisposition::GapApplied { .. } => {}
        }
    }
    let state_digest = reducer.state_digest()?;
    Ok(ReplayResult {
        reducer,
        input_count,
        duplicate_count,
        out_of_order_count,
        state_digest,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ProjectionEpochStatus {
    Building,
    Active,
    Retained,
    Retired,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionEpoch {
    pub epoch_id: Uuid,
    pub status: ProjectionEpochStatus,
    pub created_at: DateTime<Utc>,
    pub activated_at: Option<DateTime<Utc>>,
    pub overlap_until: Option<DateTime<Utc>>,
    pub state_digest: Option<String>,
}

impl ProjectionEpoch {
    #[must_use]
    pub const fn building(epoch_id: Uuid, created_at: DateTime<Utc>) -> Self {
        Self {
            epoch_id,
            status: ProjectionEpochStatus::Building,
            created_at,
            activated_at: None,
            overlap_until: None,
            state_digest: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EpochCutover {
    pub active: ProjectionEpoch,
    pub retained_previous: Option<ProjectionEpoch>,
}

/// Atomically models an epoch activation after parity succeeds.
///
/// # Errors
///
/// Rejects a non-building candidate, digest mismatch, active candidate reuse or
/// invalid overlap duration.
pub fn activate_epoch(
    mut candidate: ProjectionEpoch,
    mut previous: Option<ProjectionEpoch>,
    expected_digest: &str,
    actual_digest: &str,
    activated_at: DateTime<Utc>,
    overlap: Duration,
) -> Result<EpochCutover, ProjectionError> {
    if candidate.status != ProjectionEpochStatus::Building {
        return Err(ProjectionError::EpochNotBuilding);
    }
    if expected_digest != actual_digest {
        return Err(ProjectionError::ParityMismatch);
    }
    let overlap = TimeDelta::from_std(overlap).map_err(|_| ProjectionError::InvalidOverlap)?;
    candidate.status = ProjectionEpochStatus::Active;
    candidate.activated_at = Some(activated_at);
    candidate.state_digest = Some(actual_digest.to_owned());
    if let Some(previous_epoch) = previous.as_mut() {
        if previous_epoch.status != ProjectionEpochStatus::Active
            || previous_epoch.epoch_id == candidate.epoch_id
        {
            return Err(ProjectionError::InvalidPreviousEpoch);
        }
        previous_epoch.status = ProjectionEpochStatus::Retained;
        previous_epoch.overlap_until = Some(activated_at + overlap);
    }
    Ok(EpochCutover {
        active: candidate,
        retained_previous: previous,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProjectionCursor {
    pub epoch_id: Uuid,
    pub sequence: u64,
}

impl fmt::Display for ProjectionCursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}:{}", self.epoch_id, self.sequence)
    }
}

impl FromStr for ProjectionCursor {
    type Err = ProjectionError;

    fn from_str(raw: &str) -> Result<Self, Self::Err> {
        let (epoch, sequence) = raw
            .split_once(':')
            .ok_or(ProjectionError::InvalidProjectionCursor)?;
        if sequence.contains(':') {
            return Err(ProjectionError::InvalidProjectionCursor);
        }
        Ok(Self {
            epoch_id: Uuid::parse_str(epoch)
                .map_err(|_| ProjectionError::InvalidProjectionCursor)?,
            sequence: sequence
                .parse()
                .map_err(|_| ProjectionError::InvalidProjectionCursor)?,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ResumeDecision {
    Resume,
    Gap {
        earliest_available_sequence: u64,
    },
    Resnapshot {
        active_epoch_id: Uuid,
        resnapshot_not_before: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Copy)]
pub struct EpochAvailability<'a> {
    pub epoch: &'a ProjectionEpoch,
    pub earliest_available_sequence: u64,
    pub latest_available_sequence: u64,
}

/// Evaluates whether an SSE cursor can resume without overclaiming continuity.
#[must_use]
pub fn resume_decision(
    cursor: ProjectionCursor,
    active: EpochAvailability<'_>,
    retained_previous: Option<EpochAvailability<'_>>,
    client_stable_id: &str,
    now: DateTime<Utc>,
    maximum_jitter: Duration,
) -> ResumeDecision {
    let availability = if cursor.epoch_id == active.epoch.epoch_id {
        Some(active)
    } else {
        retained_previous.filter(|previous| {
            previous.epoch.epoch_id == cursor.epoch_id
                && previous
                    .epoch
                    .overlap_until
                    .is_some_and(|until| now < until)
        })
    };
    if let Some(availability) = availability {
        let next_sequence = cursor.sequence.checked_add(1);
        if cursor.sequence <= availability.latest_available_sequence {
            return if next_sequence
                .is_some_and(|next| next >= availability.earliest_available_sequence)
            {
                ResumeDecision::Resume
            } else {
                ResumeDecision::Gap {
                    earliest_available_sequence: availability.earliest_available_sequence,
                }
            };
        }
    }
    ResumeDecision::Resnapshot {
        active_epoch_id: active.epoch.epoch_id,
        resnapshot_not_before: server_jitter_deadline(
            active.epoch.epoch_id,
            client_stable_id,
            now,
            maximum_jitter,
        ),
    }
}

#[must_use]
pub fn server_jitter_deadline(
    epoch_id: Uuid,
    client_stable_id: &str,
    now: DateTime<Utc>,
    maximum_jitter: Duration,
) -> DateTime<Utc> {
    let maximum_millis = maximum_jitter.as_millis();
    if maximum_millis == 0 {
        return now;
    }
    let digest = Sha256::digest(format!("{epoch_id}:{client_stable_id}").as_bytes());
    let mut prefix = [0_u8; 8];
    prefix.copy_from_slice(&digest[..8]);
    let offset = u128::from(u64::from_be_bytes(prefix)) % (maximum_millis + 1);
    let offset = i64::try_from(offset).unwrap_or(i64::MAX);
    now + TimeDelta::milliseconds(offset)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FreshnessPolicy {
    pub policy_version: String,
    pub warning_after_ms: i64,
    pub stale_after_ms: i64,
    pub maximum_future_skew_ms: i64,
}

impl FreshnessPolicy {
    /// Validates a registry-owned freshness policy.
    ///
    /// # Errors
    ///
    /// Rejects empty versions, negative budgets and warning thresholds that do
    /// not precede the stale threshold.
    pub fn validate(&self) -> Result<(), ProjectionError> {
        if self.policy_version.trim().is_empty()
            || self.warning_after_ms < 0
            || self.stale_after_ms <= self.warning_after_ms
            || self.maximum_future_skew_ms < 0
        {
            return Err(ProjectionError::InvalidFreshnessPolicy);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VenueSessionState {
    Open,
    Paused,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FreshnessInput {
    pub as_of: Option<DateTime<Utc>>,
    pub read_at: DateTime<Utc>,
    pub source_received_at: Option<DateTime<Utc>>,
    pub projected_at: Option<DateTime<Utc>>,
    pub venue_session: VenueSessionState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FreshnessEvaluation {
    pub state: FreshnessState,
    pub age_seconds: Option<i64>,
    pub lag_ms: Option<i64>,
    pub policy_version: String,
    pub warnings: Vec<ContractWarning>,
}

/// Computes freshness only from the trusted edge clock and versioned policy.
///
/// # Errors
///
/// Rejects an invalid freshness policy.
pub fn evaluate_freshness(
    policy: &FreshnessPolicy,
    input: &FreshnessInput,
) -> Result<FreshnessEvaluation, ProjectionError> {
    policy.validate()?;
    let mut warnings = Vec::new();
    let lag_ms = match (input.source_received_at, input.projected_at) {
        (Some(received), Some(projected)) if projected >= received => {
            Some((projected - received).num_milliseconds())
        }
        (Some(_), Some(_)) => {
            warnings.push(warning(
                "PROJECTION_CLOCK_INVERSION",
                "projected_at precedes the source-read receipt; lag is unavailable",
            ));
            None
        }
        _ => None,
    };
    let Some(as_of) = input.as_of else {
        warnings.push(warning(
            "MISSING_AS_OF",
            "source observation time is unavailable",
        ));
        return Ok(FreshnessEvaluation {
            state: if input.venue_session == VenueSessionState::Paused {
                FreshnessState::Paused
            } else {
                FreshnessState::Unknown
            },
            age_seconds: None,
            lag_ms,
            policy_version: policy.policy_version.clone(),
            warnings,
        });
    };
    let signed_age_ms = (input.read_at - as_of).num_milliseconds();
    if signed_age_ms < -policy.maximum_future_skew_ms {
        warnings.push(warning(
            "SOURCE_TIME_IN_FUTURE",
            "source observation time exceeds the allowed clock-skew budget",
        ));
        return Ok(FreshnessEvaluation {
            state: FreshnessState::Unknown,
            age_seconds: None,
            lag_ms,
            policy_version: policy.policy_version.clone(),
            warnings,
        });
    }
    let age_ms = signed_age_ms.max(0);
    let state = if input.venue_session == VenueSessionState::Paused {
        FreshnessState::Paused
    } else if age_ms >= policy.stale_after_ms {
        FreshnessState::Stale
    } else if age_ms >= policy.warning_after_ms {
        FreshnessState::Aging
    } else {
        FreshnessState::Ok
    };
    Ok(FreshnessEvaluation {
        state,
        age_seconds: Some(age_ms / 1_000),
        lag_ms,
        policy_version: policy.policy_version.clone(),
        warnings,
    })
}

fn warning(code: &str, message: &str) -> ContractWarning {
    ContractWarning {
        code: code.to_owned(),
        message: message.to_owned(),
    }
}

/// Produces stable SHA-256 over canonical JSON object ordering.
///
/// # Errors
///
/// Returns an error when the value cannot be serialized.
pub fn canonical_digest<T: Serialize>(value: &T) -> Result<String, ProjectionError> {
    let value = serde_json::to_value(value).map_err(|_| ProjectionError::Serialization)?;
    Ok(canonical_value_digest(&value))
}

#[must_use]
pub fn canonical_value_digest(value: &Value) -> String {
    let canonical = canonicalize_json(value);
    format!(
        "sha256:{}",
        hex::encode(Sha256::digest(canonical.to_string().as_bytes()))
    )
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonicalize_json).collect()),
        Value::Object(values) => {
            let sorted = values
                .iter()
                .map(|(key, value)| (key.clone(), canonicalize_json(value)))
                .collect::<BTreeMap<_, _>>();
            Value::Object(sorted.into_iter().collect())
        }
        scalar => scalar.clone(),
    }
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProjectionError {
    #[error("execution projection environment is invalid")]
    InvalidEnvironment,
    #[error("projection entity kind is invalid")]
    InvalidEntityKind,
    #[error("projection payload must be a JSON object")]
    PayloadMustBeObject,
    #[error("adapter version and capability snapshot identity are required")]
    MissingCompatibilityIdentity,
    #[error("source sequence must be non-negative")]
    InvalidSourceSequence,
    #[error("POLL_BOUNDED observations require a positive poll interval")]
    MissingPollInterval,
    #[error("poll interval is only valid for POLL_BOUNDED observations")]
    UnexpectedPollInterval,
    #[error("ingestion id was reused with different content")]
    IdempotencyCollision,
    #[error("two different observations occupy the same source position")]
    SourceCursorCollision,
    #[error("projection sequence exhausted")]
    SequenceExhausted,
    #[error("snapshot count does not match its rows")]
    SnapshotCountMismatch,
    #[error("snapshot contains more than one entity kind")]
    MixedSnapshotKinds,
    #[error("snapshot contains a duplicate entity key")]
    DuplicateSnapshotEntity,
    #[error("replay journal contains a duplicate ordinal")]
    DuplicateReplayOrdinal,
    #[error("candidate projection epoch is not BUILDING")]
    EpochNotBuilding,
    #[error("candidate projection digest does not match parity target")]
    ParityMismatch,
    #[error("previous projection epoch is not a distinct ACTIVE epoch")]
    InvalidPreviousEpoch,
    #[error("epoch overlap duration is invalid")]
    InvalidOverlap,
    #[error("projection cursor is invalid")]
    InvalidProjectionCursor,
    #[error("freshness policy is invalid")]
    InvalidFreshnessPolicy,
    #[error("projection value could not be serialized")]
    Serialization,
    #[error("persisted projection state is inconsistent with its locked epoch")]
    InvalidHydratedState,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(second: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_777_000_000 + second, 0).unwrap()
    }

    fn scope() -> ProjectionScope {
        ProjectionScope::new(CanonicalId::parse("workspace_1").unwrap(), "paper").unwrap()
    }

    fn cursor(second: i64, event_id: &str) -> SourceCursor {
        SourceCursor {
            event_ts: at(second),
            created_at: at(second) + TimeDelta::milliseconds(1),
            event_id: CanonicalId::parse(event_id).unwrap(),
        }
    }

    fn observation(
        ingestion_id: &str,
        entity_id: &str,
        second: i64,
        source_sequence: Option<i64>,
        status: &str,
    ) -> ProjectionObservation {
        ProjectionObservation {
            ingestion_id: CanonicalId::parse(ingestion_id).unwrap(),
            entity: ProjectionEntityKey {
                kind: ProjectionEntityKind::Order,
                entity_id: CanonicalId::parse(entity_id).unwrap(),
            },
            source_authority: SourceAuthority::Execution,
            as_of: Some(at(second)),
            source_read_at: at(second) + TimeDelta::milliseconds(10),
            source_cursor: Some(cursor(second, ingestion_id)),
            source_sequence,
            source_completeness: SourceCompleteness::EventSourced,
            poll_interval_ms: None,
            adapter_version: "ts-adapter-v1".to_owned(),
            capability_snapshot_id: "cap_1".to_owned(),
            payload: serde_json::json!({"status": status, "quantity": "1.0000"}),
        }
    }

    fn active_epoch() -> ProjectionEpoch {
        ProjectionEpoch {
            epoch_id: Uuid::now_v7(),
            status: ProjectionEpochStatus::Active,
            created_at: at(1),
            activated_at: Some(at(2)),
            overlap_until: None,
            state_digest: Some("sha256:new".to_owned()),
        }
    }

    #[test]
    fn reducer_is_idempotent_and_does_not_advance_on_duplicates() {
        let epoch = Uuid::now_v7();
        let mut reducer = ProjectionReducer::new(scope(), epoch);
        let input = observation("evt_1", "order_1", 1, Some(1), "OPEN");
        assert_eq!(
            reducer.apply(input.clone(), at(2)).unwrap(),
            ApplyDisposition::Applied { sequence: 1 }
        );
        assert_eq!(
            reducer.apply(input, at(3)).unwrap(),
            ApplyDisposition::Duplicate
        );
        assert_eq!(reducer.sequence(), 1);
        assert_eq!(reducer.entities().len(), 1);
    }

    #[test]
    fn idempotency_and_source_cursor_collisions_fail_closed_without_mutation() {
        let mut reducer = ProjectionReducer::new(scope(), Uuid::now_v7());
        let first = observation("evt_1", "order_1", 1, Some(1), "OPEN");
        reducer.apply(first.clone(), at(2)).unwrap();

        let mut same_id_changed = first.clone();
        same_id_changed.payload = serde_json::json!({"status": "FILLED"});
        assert_eq!(
            reducer.apply(same_id_changed, at(3)),
            Err(ProjectionError::IdempotencyCollision)
        );

        let mut same_cursor = observation("evt_2", "order_1", 2, Some(2), "FILLED");
        same_cursor.source_cursor = first.source_cursor;
        assert_eq!(
            reducer.apply(same_cursor, at(3)),
            Err(ProjectionError::SourceCursorCollision)
        );
        assert_eq!(reducer.sequence(), 1);
    }

    #[test]
    fn out_of_order_input_never_rolls_current_state_back() {
        let mut reducer = ProjectionReducer::new(scope(), Uuid::now_v7());
        reducer
            .apply(observation("evt_2", "order_1", 2, None, "FILLED"), at(3))
            .unwrap();
        assert_eq!(
            reducer
                .apply(observation("evt_1", "order_1", 1, None, "OPEN"), at(4))
                .unwrap(),
            ApplyDisposition::OutOfOrder
        );
        assert_eq!(
            reducer.entities().values().next().unwrap().payload["status"],
            "FILLED"
        );
    }

    #[test]
    fn source_gap_is_explicit_but_latest_observation_remains_visible() {
        let mut reducer = ProjectionReducer::new(scope(), Uuid::now_v7());
        reducer
            .apply(observation("evt_1", "order_1", 1, Some(10), "OPEN"), at(2))
            .unwrap();
        assert_eq!(
            reducer
                .apply(
                    observation("evt_2", "order_1", 2, Some(12), "FILLED"),
                    at(3)
                )
                .unwrap(),
            ApplyDisposition::GapApplied { sequence: 2 }
        );
        assert_eq!(reducer.gaps()[0].code, "SOURCE_SEQUENCE_GAP");
    }

    #[test]
    fn reducer_is_deterministic_for_independent_entity_permutations() {
        let inputs = [
            observation("evt_a", "order_a", 1, None, "OPEN"),
            observation("evt_b", "order_b", 1, None, "OPEN"),
            observation("evt_c", "order_c", 1, None, "OPEN"),
        ];
        let permutations = [
            [0_usize, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ];
        let mut digests = Vec::new();
        for order in permutations {
            let mut reducer = ProjectionReducer::new(scope(), Uuid::nil());
            for index in order {
                reducer.apply(inputs[index].clone(), at(2)).unwrap();
            }
            digests.push(reducer.state_digest().unwrap());
        }
        assert!(digests.windows(2).all(|pair| pair[0] == pair[1]));
    }

    #[test]
    fn complete_snapshot_removes_missing_rows_but_partial_snapshot_does_not() {
        let mut reducer = ProjectionReducer::new(scope(), Uuid::now_v7());
        reducer
            .apply(observation("evt_a", "order_a", 1, None, "OPEN"), at(2))
            .unwrap();
        reducer
            .apply(observation("evt_b", "order_b", 1, None, "OPEN"), at(2))
            .unwrap();
        let partial = ProjectionSnapshot::new(
            CanonicalId::parse("snap_partial").unwrap(),
            ProjectionEntityKind::Order,
            SnapshotCompleteness::Partial,
            1,
            vec![observation("evt_a2", "order_a", 2, None, "FILLED")],
        )
        .unwrap();
        assert!(reducer
            .reconcile_snapshot(partial, at(3))
            .unwrap()
            .removed
            .is_empty());
        assert_eq!(reducer.entities().len(), 2);

        let complete = ProjectionSnapshot::new(
            CanonicalId::parse("snap_complete").unwrap(),
            ProjectionEntityKind::Order,
            SnapshotCompleteness::Complete,
            1,
            vec![observation("evt_a3", "order_a", 3, None, "FILLED")],
        )
        .unwrap();
        let result = reducer.reconcile_snapshot(complete, at(4)).unwrap();
        assert_eq!(result.removed.len(), 1);
        assert_eq!(reducer.entities().len(), 1);
    }

    #[test]
    fn replay_sorts_journal_ordinals_and_matches_live_state() {
        let epoch = Uuid::now_v7();
        let records = vec![
            ReplayRecord {
                journal_ordinal: 2,
                observation: observation("evt_2", "order_1", 2, Some(2), "FILLED"),
                projected_at: at(3),
            },
            ReplayRecord {
                journal_ordinal: 1,
                observation: observation("evt_1", "order_1", 1, Some(1), "OPEN"),
                projected_at: at(2),
            },
        ];
        let replayed = replay(scope(), epoch, records).unwrap();
        assert_eq!(replayed.reducer.sequence(), 2);
        assert_eq!(
            replayed.reducer.entities().values().next().unwrap().payload["status"],
            "FILLED"
        );
    }

    #[test]
    fn six_month_replay_corpus_is_deterministic() {
        let records = (0_u64..182_000)
            .map(|ordinal| {
                let entity = ordinal % 1_000;
                ReplayRecord {
                    journal_ordinal: ordinal,
                    observation: observation(
                        &format!("evt_{ordinal:06}"),
                        &format!("order_{entity:04}"),
                        i64::try_from(ordinal).unwrap(),
                        None,
                        if ordinal % 2 == 0 { "OPEN" } else { "FILLED" },
                    ),
                    projected_at: at(i64::try_from(ordinal).unwrap() + 1),
                }
            })
            .collect::<Vec<_>>();
        let replayed = replay(scope(), Uuid::nil(), records).unwrap();

        // The expected state is independently reduced from only the final
        // observation for each entity, not by replaying the corpus twice.
        let mut expected = ProjectionReducer::new(scope(), Uuid::nil());
        for entity in 0_u64..1_000 {
            let ordinal = 181_000 + entity;
            expected
                .apply(
                    observation(
                        &format!("evt_{ordinal:06}"),
                        &format!("order_{entity:04}"),
                        i64::try_from(ordinal).unwrap(),
                        None,
                        if ordinal % 2 == 0 { "OPEN" } else { "FILLED" },
                    ),
                    at(i64::try_from(ordinal).unwrap() + 1),
                )
                .unwrap();
        }
        assert_eq!(replayed.input_count, 182_000);
        assert_eq!(replayed.state_digest, expected.state_digest().unwrap());
        assert_eq!(replayed.reducer.entities().len(), 1_000);
    }

    #[test]
    fn epoch_cutover_requires_parity_and_retains_previous_for_overlap() {
        let now = at(100);
        let previous_id = Uuid::now_v7();
        let candidate_id = Uuid::now_v7();
        let previous = ProjectionEpoch {
            epoch_id: previous_id,
            status: ProjectionEpochStatus::Active,
            created_at: at(1),
            activated_at: Some(at(2)),
            overlap_until: None,
            state_digest: Some("sha256:old".to_owned()),
        };
        assert_eq!(
            activate_epoch(
                ProjectionEpoch::building(candidate_id, at(50)),
                Some(previous.clone()),
                "sha256:expected",
                "sha256:wrong",
                now,
                Duration::from_secs(30),
            ),
            Err(ProjectionError::ParityMismatch)
        );
        let cutover = activate_epoch(
            ProjectionEpoch::building(candidate_id, at(50)),
            Some(previous),
            "sha256:new",
            "sha256:new",
            now,
            Duration::from_secs(30),
        )
        .unwrap();
        assert_eq!(cutover.active.status, ProjectionEpochStatus::Active);
        assert_eq!(
            cutover.retained_previous.unwrap().overlap_until,
            Some(now + TimeDelta::seconds(30))
        );
    }

    #[test]
    fn active_epoch_resume_honours_last_event_and_retention_bounds() {
        let now = at(100);
        let active = active_epoch();
        let cursor = ProjectionCursor {
            epoch_id: active.epoch_id,
            sequence: 41,
        };
        assert_eq!(cursor.to_string().parse(), Ok(cursor));
        assert_eq!(
            resume_decision(
                cursor,
                EpochAvailability {
                    epoch: &active,
                    earliest_available_sequence: 43,
                    latest_available_sequence: 50,
                },
                None,
                "client-1",
                now,
                Duration::from_secs(10),
            ),
            ResumeDecision::Gap {
                earliest_available_sequence: 43
            }
        );
        assert_eq!(
            resume_decision(
                ProjectionCursor {
                    epoch_id: active.epoch_id,
                    sequence: 42,
                },
                EpochAvailability {
                    epoch: &active,
                    earliest_available_sequence: 43,
                    latest_available_sequence: 50,
                },
                None,
                "client-1",
                now,
                Duration::from_secs(10),
            ),
            ResumeDecision::Resume
        );
    }

    #[test]
    fn retained_epoch_resume_is_bounded_and_server_jitter_is_stable() {
        let now = at(100);
        let active = active_epoch();
        let old = ProjectionCursor {
            epoch_id: Uuid::nil(),
            sequence: 7,
        };
        let first = resume_decision(
            old,
            EpochAvailability {
                epoch: &active,
                earliest_available_sequence: 1,
                latest_available_sequence: 50,
            },
            None,
            "client-1",
            now,
            Duration::from_secs(10),
        );
        let second = resume_decision(
            old,
            EpochAvailability {
                epoch: &active,
                earliest_available_sequence: 1,
                latest_available_sequence: 50,
            },
            None,
            "client-1",
            now,
            Duration::from_secs(10),
        );
        assert_eq!(first, second);

        let retained = ProjectionEpoch {
            epoch_id: old.epoch_id,
            status: ProjectionEpochStatus::Retained,
            created_at: at(0),
            activated_at: Some(at(1)),
            overlap_until: Some(now + TimeDelta::seconds(30)),
            state_digest: Some("sha256:old".to_owned()),
        };
        assert_eq!(
            resume_decision(
                ProjectionCursor {
                    epoch_id: retained.epoch_id,
                    sequence: 41,
                },
                EpochAvailability {
                    epoch: &active,
                    earliest_available_sequence: 1,
                    latest_available_sequence: 50,
                },
                Some(EpochAvailability {
                    epoch: &retained,
                    earliest_available_sequence: 42,
                    latest_available_sequence: 50,
                }),
                "client-1",
                now,
                Duration::from_secs(10),
            ),
            ResumeDecision::Resume
        );
    }

    #[test]
    fn freshness_uses_server_time_and_never_conflates_pause_or_lag() {
        let policy = FreshnessPolicy {
            policy_version: "freshness.paper.v1".to_owned(),
            warning_after_ms: 10_000,
            stale_after_ms: 30_000,
            maximum_future_skew_ms: 2_000,
        };
        let evaluation = evaluate_freshness(
            &policy,
            &FreshnessInput {
                as_of: Some(at(0)),
                read_at: at(15),
                source_received_at: Some(at(14)),
                projected_at: Some(at(14) + TimeDelta::milliseconds(25)),
                venue_session: VenueSessionState::Open,
            },
        )
        .unwrap();
        assert_eq!(evaluation.state, FreshnessState::Aging);
        assert_eq!(evaluation.age_seconds, Some(15));
        assert_eq!(evaluation.lag_ms, Some(25));

        let paused = evaluate_freshness(
            &policy,
            &FreshnessInput {
                as_of: Some(at(0)),
                read_at: at(300),
                source_received_at: None,
                projected_at: None,
                venue_session: VenueSessionState::Paused,
            },
        )
        .unwrap();
        assert_eq!(paused.state, FreshnessState::Paused);
    }

    #[test]
    fn future_source_time_and_missing_basis_are_unknown() {
        let policy = FreshnessPolicy {
            policy_version: "p1".to_owned(),
            warning_after_ms: 1_000,
            stale_after_ms: 2_000,
            maximum_future_skew_ms: 100,
        };
        for as_of in [None, Some(at(2))] {
            let result = evaluate_freshness(
                &policy,
                &FreshnessInput {
                    as_of,
                    read_at: at(0),
                    source_received_at: None,
                    projected_at: None,
                    venue_session: VenueSessionState::Open,
                },
            )
            .unwrap();
            assert_eq!(result.state, FreshnessState::Unknown);
            assert_eq!(result.age_seconds, None);
        }
    }
}
