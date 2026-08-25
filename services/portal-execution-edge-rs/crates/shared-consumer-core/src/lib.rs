#![forbid(unsafe_code)]

use std::{collections::BTreeSet, fmt, time::Duration};

use chrono::{DateTime, TimeDelta, Utc};
use projection_core::{
    canonical_digest, ProjectionObservation, ProjectionOperation, ProjectionScope,
    SourceSequenceSemantics,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use uuid::Uuid;

pub const SHARED_CONSUMER_SCHEMA_VERSION: &str = "portal.execution.shared-consumer.v1";
pub const PAPER_SOURCE_SCOPE_ID: &str = "PAPER_BINANCE_USDM";
const MAX_OPAQUE_BYTES: usize = 4_096;
const MAX_PAGE_ROWS: usize = 1_000;
const MAX_RESPONSE_BYTES: usize = 8 * 1_024 * 1_024;
const MIN_LEASE_TTL: Duration = Duration::from_secs(5);
const MAX_LEASE_TTL: Duration = Duration::from_secs(300);

#[derive(Clone, PartialEq, Eq)]
pub struct SensitiveValue(String);

impl SensitiveValue {
    /// Creates an opaque source value whose debug output is always redacted.
    ///
    /// # Errors
    ///
    /// Rejects empty, oversized or control-character-bearing values.
    pub fn parse(raw: impl Into<String>) -> Result<Self, ConsumerError> {
        let raw = raw.into();
        if raw.is_empty() || raw.len() > MAX_OPAQUE_BYTES || raw.chars().any(char::is_control) {
            return Err(ConsumerError::InvalidOpaqueValue);
        }
        Ok(Self(raw))
    }

    #[must_use]
    pub fn expose_to_source_adapter(&self) -> &str {
        &self.0
    }

    #[must_use]
    pub fn digest(&self) -> String {
        format!("sha256:{:x}", Sha256::digest(self.0.as_bytes()))
    }
}

impl fmt::Debug for SensitiveValue {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SensitiveValue([REDACTED])")
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LeaseOwnerDigest(String);

impl LeaseOwnerDigest {
    /// Parses the non-secret SHA-256 identity of one Portal worker owner.
    ///
    /// # Errors
    ///
    /// Rejects anything other than lower-case `sha256:<64 hex>`.
    pub fn parse(value: impl Into<String>) -> Result<Self, ConsumerError> {
        let value = value.into();
        validate_sha256(&value)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConsumerLeaseProof {
    pub lease_id: Uuid,
    pub fencing_token: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConsumerLeaseGrant {
    pub scope: ProjectionScope,
    pub source_scope_id: String,
    pub epoch_id: Uuid,
    pub lease_id: Uuid,
    pub fencing_token: u64,
    pub expires_at: DateTime<Utc>,
}

impl ConsumerLeaseGrant {
    /// Validates the fixed Paper source scope and non-expired fencing grant.
    ///
    /// # Errors
    ///
    /// Rejects a non-Paper scope, unsupported source scope, nil lease, zero
    /// fence or expired lease.
    pub fn validate_at(&self, now: DateTime<Utc>) -> Result<(), ConsumerError> {
        if self.scope.environment != "paper" || self.source_scope_id != PAPER_SOURCE_SCOPE_ID {
            return Err(ConsumerError::ScopeMismatch);
        }
        if self.lease_id.is_nil() || self.fencing_token == 0 || now >= self.expires_at {
            return Err(ConsumerError::LeaseLost);
        }
        Ok(())
    }

    #[must_use]
    pub const fn proof(&self) -> ConsumerLeaseProof {
        ConsumerLeaseProof {
            lease_id: self.lease_id,
            fencing_token: self.fencing_token,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceLease {
    pub token: SensitiveValue,
    pub expires_at: DateTime<Utc>,
}

impl SourceLease {
    fn validate_at(&self, now: DateTime<Utc>) -> Result<(), ConsumerError> {
        if now >= self.expires_at {
            return Err(ConsumerError::SourceLeaseExpired);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SharedConsumerBounds {
    pub maximum_page_rows: usize,
    pub maximum_response_bytes: usize,
    pub maximum_queue_depth: usize,
    pub maximum_in_flight_requests: usize,
    pub request_timeout: Duration,
    pub maximum_transient_retries: u8,
    pub maximum_retry_delay: Duration,
    pub idle_after: Duration,
}

impl Default for SharedConsumerBounds {
    fn default() -> Self {
        Self {
            maximum_page_rows: MAX_PAGE_ROWS,
            maximum_response_bytes: MAX_RESPONSE_BYTES,
            maximum_queue_depth: 1,
            maximum_in_flight_requests: 1,
            request_timeout: Duration::from_secs(5),
            maximum_transient_retries: 3,
            maximum_retry_delay: Duration::from_secs(30),
            idle_after: Duration::from_secs(30),
        }
    }
}

impl SharedConsumerBounds {
    fn validate(&self) -> Result<(), ConsumerError> {
        if self.maximum_page_rows == 0
            || self.maximum_page_rows > MAX_PAGE_ROWS
            || self.maximum_response_bytes == 0
            || self.maximum_response_bytes > MAX_RESPONSE_BYTES
            || self.maximum_queue_depth != 1
            || self.maximum_in_flight_requests != 1
            || self.request_timeout.is_zero()
            || self.request_timeout > Duration::from_secs(30)
            || self.maximum_transient_retries > 3
            || self.maximum_retry_delay.is_zero()
            || self.maximum_retry_delay > Duration::from_secs(30)
            || self.idle_after.is_zero()
            || self.idle_after > Duration::from_secs(300)
        {
            return Err(ConsumerError::UnsafeBounds);
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct SharedConsumerConfig {
    pub scope: ProjectionScope,
    pub source_scope_id: String,
    pub epoch_id: Uuid,
    pub bounds: SharedConsumerBounds,
}

impl SharedConsumerConfig {
    fn validate(&self) -> Result<(), ConsumerError> {
        if self.scope.environment != "paper"
            || self.source_scope_id != PAPER_SOURCE_SCOPE_ID
            || self.epoch_id.is_nil()
        {
            return Err(ConsumerError::ScopeMismatch);
        }
        self.bounds.validate()
    }
}

#[derive(Debug, Clone)]
pub struct ConsumerProjectionWrite {
    pub stream_key: String,
    pub observation: ProjectionObservation,
}

#[derive(Debug, Clone)]
pub struct SourceDeltaPage {
    pub previous_cursor: SensitiveValue,
    pub next_cursor: SensitiveValue,
    pub writes: Vec<ConsumerProjectionWrite>,
    pub first_source_sequence: Option<u64>,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: u64,
    pub caught_up: bool,
    pub source_read_at: DateTime<Utc>,
    pub response_bytes: usize,
}

#[derive(Debug, Clone)]
pub struct PendingAtomicCommit {
    pub lease: ConsumerLeaseProof,
    pub batch_digest: String,
    pub previous_cursor: SensitiveValue,
    pub next_cursor: SensitiveValue,
    pub writes: Vec<ConsumerProjectionWrite>,
    pub first_source_sequence: Option<u64>,
    pub last_source_sequence: Option<u64>,
    pub source_head_sequence: u64,
    pub caught_up: bool,
    pub source_read_at: DateTime<Utc>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct PollPermit {
    lease: ConsumerLeaseProof,
    request_generation: u64,
    source_lease: SensitiveValue,
    cursor: SensitiveValue,
    deadline: DateTime<Utc>,
}

impl PollPermit {
    #[must_use]
    pub const fn lease(&self) -> ConsumerLeaseProof {
        self.lease
    }

    #[must_use]
    pub fn source_lease_for_adapter(&self) -> &str {
        self.source_lease.expose_to_source_adapter()
    }

    #[must_use]
    pub fn cursor_for_adapter(&self) -> &str {
        self.cursor.expose_to_source_adapter()
    }
}

impl fmt::Debug for PollPermit {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("PollPermit")
            .field("lease", &self.lease)
            .field("request_generation", &self.request_generation)
            .field("source_lease", &"[REDACTED]")
            .field("cursor", &"[REDACTED]")
            .field("deadline", &self.deadline)
            .finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SharedConsumerState {
    Dormant,
    DemandIdle,
    Ready,
    AwaitingSource,
    AwaitingAtomicCommit,
    RetryBackoff,
    CircuitOpen,
    RebuildRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFailureClass {
    RateLimited,
    SourceUnavailable,
    RequestTimeout,
    CursorAhead,
    CursorExpired,
    GapDetected,
    LeaseExpired,
    ContractUnsupported,
    ResponseTooLarge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommitDisposition {
    Written,
    AlreadyDurable,
    RebuildRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConsumerEffect {
    Dormant,
    DemandIdle,
    PollReady,
    CommitRequired {
        batch_digest: String,
        observation_count: usize,
    },
    DuplicatePage,
    RetryAfter(Duration),
    CircuitOpen,
    RebuildRequired,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SharedConsumerMetrics {
    pub requests_started: u64,
    pub source_pages_received: u64,
    pub observations_received: u64,
    pub observations_committed: u64,
    pub duplicate_pages: u64,
    pub retries_scheduled: u64,
    pub source_failures: u64,
    pub gaps_detected: u64,
    pub lease_losses: u64,
    pub queue_high_watermark: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConsumerSignalState {
    Active,
    Inactive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RedactedConsumerSnapshot {
    pub schema_version: String,
    pub state: SharedConsumerState,
    pub demand_count: u32,
    pub lease_state: ConsumerSignalState,
    pub source_lease_state: ConsumerSignalState,
    pub cursor_state: ConsumerSignalState,
    pub pending_commit_state: ConsumerSignalState,
    pub metrics: SharedConsumerMetrics,
}

pub struct LeaseAwareSharedConsumer {
    config: SharedConsumerConfig,
    state: SharedConsumerState,
    lease: Option<ConsumerLeaseGrant>,
    source_lease: Option<SourceLease>,
    cursor: Option<SensitiveValue>,
    last_source_sequence: Option<u64>,
    last_committed_page_digest: Option<String>,
    pending: Option<PendingAtomicCommit>,
    demand_count: u32,
    last_demand_at: Option<DateTime<Utc>>,
    retries: u8,
    retry_ready_at: Option<DateTime<Utc>>,
    last_poll_generation: u64,
    active_poll_generation: Option<u64>,
    metrics: SharedConsumerMetrics,
}

impl LeaseAwareSharedConsumer {
    /// Builds a source-dark consumer. Construction cannot emit a source request.
    ///
    /// # Errors
    ///
    /// Rejects any scope or bound wider than the N04 Paper envelope.
    pub fn new(config: SharedConsumerConfig) -> Result<Self, ConsumerError> {
        config.validate()?;
        Ok(Self {
            config,
            state: SharedConsumerState::Dormant,
            lease: None,
            source_lease: None,
            cursor: None,
            last_source_sequence: None,
            last_committed_page_digest: None,
            pending: None,
            demand_count: 0,
            last_demand_at: None,
            retries: 0,
            retry_ready_at: None,
            last_poll_generation: 0,
            active_poll_generation: None,
            metrics: SharedConsumerMetrics::default(),
        })
    }

    /// Installs both the Portal fencing lease and the source-issued lease.
    ///
    /// # Errors
    ///
    /// Rejects scope/epoch drift, expiry or an attempt to replace an active
    /// lease while a page is in flight or awaiting commit.
    pub fn install_leases(
        &mut self,
        lease: ConsumerLeaseGrant,
        source_lease: SourceLease,
        committed_cursor: SensitiveValue,
        last_source_sequence: Option<u64>,
        now: DateTime<Utc>,
    ) -> Result<ConsumerEffect, ConsumerError> {
        lease.validate_at(now)?;
        source_lease.validate_at(now)?;
        if lease.scope != self.config.scope
            || lease.source_scope_id != self.config.source_scope_id
            || lease.epoch_id != self.config.epoch_id
        {
            return Err(ConsumerError::ScopeMismatch);
        }
        if matches!(
            self.state,
            SharedConsumerState::AwaitingSource | SharedConsumerState::AwaitingAtomicCommit
        ) {
            return Err(ConsumerError::WorkInFlight);
        }
        if let Some(current) = &self.lease {
            let valid_renewal = lease.lease_id == current.lease_id
                && lease.fencing_token == current.fencing_token
                && lease.expires_at >= current.expires_at;
            let valid_replacement =
                lease.lease_id != current.lease_id && lease.fencing_token > current.fencing_token;
            if !valid_renewal && !valid_replacement {
                return Err(ConsumerError::StaleFencingToken);
            }
        }
        self.lease = Some(lease);
        self.source_lease = Some(source_lease);
        self.cursor = Some(committed_cursor);
        self.last_source_sequence = last_source_sequence;
        self.pending = None;
        self.retries = 0;
        self.retry_ready_at = None;
        self.state = if self.demand_count == 0 {
            SharedConsumerState::DemandIdle
        } else {
            SharedConsumerState::Ready
        };
        Ok(self.current_idle_effect())
    }

    /// Updates aggregate Portal demand. Individual screens never receive a
    /// source permit and therefore cannot poll Trading System independently.
    pub fn set_demand(&mut self, demand_count: u32, now: DateTime<Utc>) -> ConsumerEffect {
        self.demand_count = demand_count;
        if demand_count > 0 {
            self.last_demand_at = Some(now);
            if self.leases_valid_at(now)
                && matches!(
                    self.state,
                    SharedConsumerState::DemandIdle | SharedConsumerState::Ready
                )
            {
                self.state = SharedConsumerState::Ready;
                return ConsumerEffect::PollReady;
            }
        } else if matches!(self.state, SharedConsumerState::Ready) {
            self.state = SharedConsumerState::DemandIdle;
        }
        self.current_idle_effect()
    }

    /// Creates the only allowed in-flight source read permit.
    ///
    /// # Errors
    ///
    /// Fails closed on no demand, lease expiry, retry backoff or any existing
    /// source/commit work.
    pub fn begin_poll(&mut self, now: DateTime<Utc>) -> Result<PollPermit, ConsumerError> {
        self.expire_if_needed(now);
        if self.demand_count == 0 {
            return Err(ConsumerError::NoDemand);
        }
        if self.state == SharedConsumerState::RetryBackoff {
            let ready_at = self.retry_ready_at.ok_or(ConsumerError::InvalidState)?;
            if now < ready_at {
                return Err(ConsumerError::RetryBackoffActive);
            }
            self.state = SharedConsumerState::Ready;
            self.retry_ready_at = None;
        }
        if self.state != SharedConsumerState::Ready {
            return Err(ConsumerError::InvalidState);
        }
        let lease = self.lease.as_ref().ok_or(ConsumerError::LeaseLost)?;
        lease.validate_at(now)?;
        let source_lease = self
            .source_lease
            .as_ref()
            .ok_or(ConsumerError::SourceLeaseExpired)?;
        source_lease.validate_at(now)?;
        let cursor = self.cursor.as_ref().ok_or(ConsumerError::CursorMissing)?;
        let deadline = add_duration(now, self.config.bounds.request_timeout)?;
        let request_generation = self
            .last_poll_generation
            .checked_add(1)
            .ok_or(ConsumerError::RequestGenerationExhausted)?;
        let permit = PollPermit {
            lease: lease.proof(),
            request_generation,
            source_lease: source_lease.token.clone(),
            cursor: cursor.clone(),
            deadline,
        };
        self.last_poll_generation = request_generation;
        self.active_poll_generation = Some(request_generation);
        self.metrics.requests_started = self.metrics.requests_started.saturating_add(1);
        self.state = SharedConsumerState::AwaitingSource;
        Ok(permit)
    }

    /// Validates one bounded ordered page and stages it for one atomic store
    /// transaction. This method never advances the committed cursor.
    ///
    /// # Errors
    ///
    /// Rejects stale fences, timeout, oversized responses, cursor drift,
    /// conflicting duplicates, invalid DELETE/UPSERT observations, ordering
    /// regressions and gaps.
    pub fn accept_page(
        &mut self,
        permit: &PollPermit,
        page: SourceDeltaPage,
        now: DateTime<Utc>,
    ) -> Result<ConsumerEffect, ConsumerError> {
        self.expire_if_needed(now);
        if self.state != SharedConsumerState::AwaitingSource {
            return Err(ConsumerError::InvalidState);
        }
        self.validate_permit(permit, now)?;
        self.active_poll_generation = None;
        if now > permit.deadline {
            self.state = SharedConsumerState::Ready;
            return Err(ConsumerError::RequestTimedOut);
        }
        if page.response_bytes > self.config.bounds.maximum_response_bytes {
            self.mark_rebuild(false);
            return Err(ConsumerError::ResponseTooLarge);
        }
        if let Err(error) = validate_page(&self.config.bounds, &page, now) {
            self.mark_rebuild(false);
            return Err(error);
        }
        let current_cursor = self.cursor.as_ref().ok_or(ConsumerError::CursorMissing)?;
        let page_digest = page_digest(&page)?;
        if page.previous_cursor != *current_cursor {
            if self.last_committed_page_digest.as_deref() == Some(page_digest.as_str()) {
                self.metrics.duplicate_pages = self.metrics.duplicate_pages.saturating_add(1);
                self.state = SharedConsumerState::Ready;
                return Ok(ConsumerEffect::DuplicatePage);
            }
            self.mark_rebuild(false);
            return Err(ConsumerError::CursorMismatch);
        }
        if let Some(previous) = self.last_source_sequence {
            match page.first_source_sequence {
                Some(first) if first == previous.saturating_add(1) => {}
                Some(first) if first <= previous => {
                    self.mark_rebuild(false);
                    return Err(ConsumerError::OutOfOrder);
                }
                Some(_) => {
                    self.mark_rebuild(true);
                    return Err(ConsumerError::GapDetected);
                }
                None if page.source_head_sequence > previous => {
                    self.mark_rebuild(true);
                    return Err(ConsumerError::GapDetected);
                }
                None if page.source_head_sequence < previous => {
                    self.mark_rebuild(false);
                    return Err(ConsumerError::OutOfOrder);
                }
                None => {}
            }
        }
        let lease = self.lease.as_ref().ok_or(ConsumerError::LeaseLost)?.proof();
        let observation_count = page.writes.len();
        self.metrics.source_pages_received = self.metrics.source_pages_received.saturating_add(1);
        self.metrics.observations_received = self
            .metrics
            .observations_received
            .saturating_add(u64::try_from(observation_count).unwrap_or(u64::MAX));
        self.metrics.queue_high_watermark = self.metrics.queue_high_watermark.max(1);
        self.pending = Some(PendingAtomicCommit {
            lease,
            batch_digest: page_digest.clone(),
            previous_cursor: page.previous_cursor,
            next_cursor: page.next_cursor,
            writes: page.writes,
            first_source_sequence: page.first_source_sequence,
            last_source_sequence: page.last_source_sequence,
            source_head_sequence: page.source_head_sequence,
            caught_up: page.caught_up,
            source_read_at: page.source_read_at,
        });
        self.state = SharedConsumerState::AwaitingAtomicCommit;
        Ok(ConsumerEffect::CommitRequired {
            batch_digest: page_digest,
            observation_count,
        })
    }

    #[must_use]
    pub fn pending_commit(&self) -> Option<&PendingAtomicCommit> {
        self.pending.as_ref()
    }

    /// Accepts an exact durable transaction acknowledgement and only then
    /// advances the in-memory cursor.
    ///
    /// # Errors
    ///
    /// Rejects stale fences, wrong batch identity or an acknowledgement after
    /// lease expiry. A store-declared rebuild is terminal.
    pub fn acknowledge_commit(
        &mut self,
        proof: ConsumerLeaseProof,
        batch_digest: &str,
        disposition: CommitDisposition,
        now: DateTime<Utc>,
    ) -> Result<ConsumerEffect, ConsumerError> {
        self.expire_if_needed(now);
        if self.state != SharedConsumerState::AwaitingAtomicCommit {
            return Err(ConsumerError::InvalidState);
        }
        let lease = self.lease.as_ref().ok_or(ConsumerError::LeaseLost)?;
        lease.validate_at(now)?;
        if proof != lease.proof() {
            self.lose_lease();
            return Err(ConsumerError::StaleFencingToken);
        }
        let pending = self.pending.as_ref().ok_or(ConsumerError::InvalidState)?;
        if pending.lease != proof || pending.batch_digest != batch_digest {
            return Err(ConsumerError::CommitAcknowledgementMismatch);
        }
        if disposition == CommitDisposition::RebuildRequired {
            self.mark_rebuild(true);
            return Ok(ConsumerEffect::RebuildRequired);
        }
        let pending = self.pending.take().ok_or(ConsumerError::InvalidState)?;
        self.cursor = Some(pending.next_cursor);
        self.last_source_sequence = pending.last_source_sequence.or(self.last_source_sequence);
        self.last_committed_page_digest = Some(pending.batch_digest);
        self.metrics.observations_committed = self
            .metrics
            .observations_committed
            .saturating_add(u64::try_from(pending.writes.len()).unwrap_or(u64::MAX));
        self.retries = 0;
        self.retry_ready_at = None;
        self.state = if self.demand_count == 0 {
            SharedConsumerState::DemandIdle
        } else {
            SharedConsumerState::Ready
        };
        Ok(self.current_idle_effect())
    }

    /// Handles a typed source failure without advancing the cursor.
    ///
    /// Transient classes receive a bounded explicit backoff. Cursor expiry,
    /// gap, unsupported contract and oversized responses fail closed.
    ///
    /// # Errors
    ///
    /// Rejects an invalid state, exhausted retry budget, expired lease,
    /// unsupported contract, oversized response or cursor mismatch.
    pub fn source_failed(
        &mut self,
        permit: &PollPermit,
        failure: SourceFailureClass,
        now: DateTime<Utc>,
        requested_delay: Option<Duration>,
    ) -> Result<ConsumerEffect, ConsumerError> {
        self.expire_if_needed(now);
        if self.state != SharedConsumerState::AwaitingSource {
            return Err(ConsumerError::InvalidState);
        }
        self.validate_permit(permit, now)?;
        self.active_poll_generation = None;
        self.metrics.source_failures = self.metrics.source_failures.saturating_add(1);
        match failure {
            SourceFailureClass::RateLimited
            | SourceFailureClass::SourceUnavailable
            | SourceFailureClass::RequestTimeout => {
                if self.retries >= self.config.bounds.maximum_transient_retries {
                    self.state = SharedConsumerState::CircuitOpen;
                    return Err(ConsumerError::RetryBudgetExceeded);
                }
                self.retries = self.retries.saturating_add(1);
                let delay = requested_delay
                    .unwrap_or_else(|| Duration::from_secs(u64::from(self.retries)))
                    .min(self.config.bounds.maximum_retry_delay);
                self.retry_ready_at = Some(add_duration(now, delay)?);
                self.metrics.retries_scheduled = self.metrics.retries_scheduled.saturating_add(1);
                self.state = SharedConsumerState::RetryBackoff;
                Ok(ConsumerEffect::RetryAfter(delay))
            }
            SourceFailureClass::LeaseExpired => {
                self.lose_lease();
                Err(ConsumerError::SourceLeaseExpired)
            }
            SourceFailureClass::CursorExpired | SourceFailureClass::GapDetected => {
                self.mark_rebuild(true);
                Ok(ConsumerEffect::RebuildRequired)
            }
            SourceFailureClass::CursorAhead => {
                self.mark_rebuild(false);
                Err(ConsumerError::CursorMismatch)
            }
            SourceFailureClass::ContractUnsupported => {
                self.mark_rebuild(false);
                Err(ConsumerError::ContractUnsupported)
            }
            SourceFailureClass::ResponseTooLarge => {
                self.mark_rebuild(false);
                Err(ConsumerError::ResponseTooLarge)
            }
        }
    }

    /// Drops all source authority immediately. Pending work is intentionally
    /// discarded and can never be acknowledged under a replacement fence.
    pub fn lose_lease(&mut self) {
        self.metrics.lease_losses = self.metrics.lease_losses.saturating_add(1);
        self.lease = None;
        self.source_lease = None;
        self.pending = None;
        self.retry_ready_at = None;
        self.active_poll_generation = None;
        self.retries = 0;
        self.state = SharedConsumerState::Dormant;
    }

    /// Applies demand-idle expiry without opening or renewing any lease.
    pub fn tick(&mut self, now: DateTime<Utc>) -> ConsumerEffect {
        self.expire_if_needed(now);
        if self.demand_count == 0
            && self
                .last_demand_at
                .and_then(|last| elapsed(last, now))
                .is_some_and(|elapsed| elapsed >= self.config.bounds.idle_after)
            && matches!(self.state, SharedConsumerState::Ready)
        {
            self.state = SharedConsumerState::DemandIdle;
        }
        self.current_idle_effect()
    }

    #[must_use]
    pub fn redacted_snapshot(&self, now: DateTime<Utc>) -> RedactedConsumerSnapshot {
        RedactedConsumerSnapshot {
            schema_version: SHARED_CONSUMER_SCHEMA_VERSION.to_owned(),
            state: self.state,
            demand_count: self.demand_count,
            lease_state: signal_state(
                self.lease
                    .as_ref()
                    .is_some_and(|lease| lease.validate_at(now).is_ok()),
            ),
            source_lease_state: signal_state(
                self.source_lease
                    .as_ref()
                    .is_some_and(|lease| lease.validate_at(now).is_ok()),
            ),
            cursor_state: signal_state(self.cursor.is_some()),
            pending_commit_state: signal_state(self.pending.is_some()),
            metrics: self.metrics.clone(),
        }
    }

    fn current_idle_effect(&self) -> ConsumerEffect {
        match self.state {
            SharedConsumerState::Dormant => ConsumerEffect::Dormant,
            SharedConsumerState::Ready => ConsumerEffect::PollReady,
            SharedConsumerState::CircuitOpen => ConsumerEffect::CircuitOpen,
            SharedConsumerState::RebuildRequired => ConsumerEffect::RebuildRequired,
            SharedConsumerState::DemandIdle
            | SharedConsumerState::AwaitingSource
            | SharedConsumerState::AwaitingAtomicCommit
            | SharedConsumerState::RetryBackoff => ConsumerEffect::DemandIdle,
        }
    }

    fn leases_valid_at(&self, now: DateTime<Utc>) -> bool {
        self.lease
            .as_ref()
            .is_some_and(|lease| lease.validate_at(now).is_ok())
            && self
                .source_lease
                .as_ref()
                .is_some_and(|lease| lease.validate_at(now).is_ok())
    }

    fn expire_if_needed(&mut self, now: DateTime<Utc>) {
        if self.lease.is_some() && !self.leases_valid_at(now) {
            self.lose_lease();
        }
    }

    fn validate_permit(
        &self,
        permit: &PollPermit,
        now: DateTime<Utc>,
    ) -> Result<(), ConsumerError> {
        let lease = self.lease.as_ref().ok_or(ConsumerError::LeaseLost)?;
        lease.validate_at(now)?;
        self.source_lease
            .as_ref()
            .ok_or(ConsumerError::SourceLeaseExpired)?
            .validate_at(now)?;
        if permit.lease != lease.proof() {
            return Err(ConsumerError::StaleFencingToken);
        }
        if self.active_poll_generation != Some(permit.request_generation) {
            return Err(ConsumerError::StalePollPermit);
        }
        Ok(())
    }

    fn mark_rebuild(&mut self, gap: bool) {
        if gap {
            self.metrics.gaps_detected = self.metrics.gaps_detected.saturating_add(1);
        }
        self.pending = None;
        self.retry_ready_at = None;
        self.active_poll_generation = None;
        self.state = SharedConsumerState::RebuildRequired;
    }
}

const fn signal_state(active: bool) -> ConsumerSignalState {
    if active {
        ConsumerSignalState::Active
    } else {
        ConsumerSignalState::Inactive
    }
}

fn validate_page(
    bounds: &SharedConsumerBounds,
    page: &SourceDeltaPage,
    now: DateTime<Utc>,
) -> Result<(), ConsumerError> {
    if page.writes.len() > bounds.maximum_page_rows
        || page.response_bytes == 0
        || page.previous_cursor == page.next_cursor
        || page.source_read_at > now + TimeDelta::minutes(5)
    {
        return Err(ConsumerError::InvalidPage);
    }
    if page.writes.is_empty()
        != (page.first_source_sequence.is_none() && page.last_source_sequence.is_none())
        || page.first_source_sequence.is_some() != page.last_source_sequence.is_some()
        || (page.writes.is_empty() && !page.caught_up)
    {
        return Err(ConsumerError::InvalidPage);
    }
    let mut event_ids = BTreeSet::new();
    let mut previous_sequence = None;
    for write in &page.writes {
        if write.stream_key.is_empty()
            || write.stream_key.len() > 128
            || write.stream_key.trim() != write.stream_key
        {
            return Err(ConsumerError::InvalidPage);
        }
        write
            .observation
            .validate()
            .map_err(|_| ConsumerError::InvalidObservation)?;
        let sequence = write
            .observation
            .source_sequence
            .and_then(|value| u64::try_from(value).ok())
            .ok_or(ConsumerError::InvalidObservation)?;
        if write.observation.source_sequence_semantics
            != SourceSequenceSemantics::GlobalStreamMonotonic
            || !matches!(
                write.observation.operation,
                ProjectionOperation::Upsert | ProjectionOperation::Delete
            )
            || !event_ids.insert(write.observation.ingestion_id.clone())
            || previous_sequence.is_some_and(|previous| sequence != previous + 1)
        {
            return Err(ConsumerError::InvalidObservation);
        }
        previous_sequence = Some(sequence);
    }
    if page.first_source_sequence
        != page.writes.first().and_then(|write| {
            write
                .observation
                .source_sequence
                .and_then(|value| u64::try_from(value).ok())
        })
        || page.last_source_sequence != previous_sequence
    {
        return Err(ConsumerError::InvalidPage);
    }
    if let Some(last) = page.last_source_sequence {
        if last > page.source_head_sequence
            || (page.caught_up && last != page.source_head_sequence)
            || (!page.caught_up && last >= page.source_head_sequence)
        {
            return Err(ConsumerError::InvalidPage);
        }
    }
    Ok(())
}

fn page_digest(page: &SourceDeltaPage) -> Result<String, ConsumerError> {
    let values = page
        .writes
        .iter()
        .map(|write| (&write.stream_key, &write.observation))
        .collect::<Vec<_>>();
    canonical_digest(&(
        SHARED_CONSUMER_SCHEMA_VERSION,
        page.previous_cursor.digest(),
        page.next_cursor.digest(),
        page.first_source_sequence,
        page.last_source_sequence,
        page.source_head_sequence,
        page.caught_up,
        page.source_read_at,
        values,
    ))
    .map_err(|_| ConsumerError::Serialization)
}

fn validate_sha256(value: &str) -> Result<(), ConsumerError> {
    if value.len() != 71
        || !value.starts_with("sha256:")
        || !value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(ConsumerError::InvalidDigest);
    }
    Ok(())
}

fn add_duration(now: DateTime<Utc>, duration: Duration) -> Result<DateTime<Utc>, ConsumerError> {
    let delta = TimeDelta::from_std(duration).map_err(|_| ConsumerError::UnsafeBounds)?;
    now.checked_add_signed(delta)
        .ok_or(ConsumerError::UnsafeBounds)
}

fn elapsed(start: DateTime<Utc>, end: DateTime<Utc>) -> Option<Duration> {
    (end - start).to_std().ok()
}

#[must_use]
pub fn lease_ttl_is_bounded(ttl: Duration) -> bool {
    (MIN_LEASE_TTL..=MAX_LEASE_TTL).contains(&ttl)
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ConsumerError {
    #[error("consumer scope or epoch is unsupported")]
    ScopeMismatch,
    #[error("consumer runtime bounds are unsafe")]
    UnsafeBounds,
    #[error("source token or cursor is invalid")]
    InvalidOpaqueValue,
    #[error("digest is not canonical sha256")]
    InvalidDigest,
    #[error("consumer lease is absent, expired or invalid")]
    LeaseLost,
    #[error("source-issued consumer lease is absent or expired")]
    SourceLeaseExpired,
    #[error("consumer work is already in flight")]
    WorkInFlight,
    #[error("no aggregate Portal demand exists")]
    NoDemand,
    #[error("consumer state transition is invalid")]
    InvalidState,
    #[error("explicit retry backoff has not elapsed")]
    RetryBackoffActive,
    #[error("durable cursor is missing")]
    CursorMissing,
    #[error("source request exceeded its deadline")]
    RequestTimedOut,
    #[error("source request generation is exhausted")]
    RequestGenerationExhausted,
    #[error("source response belongs to a superseded poll")]
    StalePollPermit,
    #[error("source response exceeds its bounded byte limit")]
    ResponseTooLarge,
    #[error("source page envelope is invalid")]
    InvalidPage,
    #[error("source observation is invalid")]
    InvalidObservation,
    #[error("source cursor does not match committed state")]
    CursorMismatch,
    #[error("source sequence is out of order")]
    OutOfOrder,
    #[error("source sequence contains a proven gap")]
    GapDetected,
    #[error("lease fencing token is stale")]
    StaleFencingToken,
    #[error("commit acknowledgement does not match pending bytes")]
    CommitAcknowledgementMismatch,
    #[error("transient retry budget is exhausted")]
    RetryBudgetExceeded,
    #[error("source contract revision is unsupported")]
    ContractUnsupported,
    #[error("consumer page digest could not be serialized")]
    Serialization,
}

#[cfg(test)]
mod tests;
