//! Additive, source-dark notification-only fanout. No listener or polling task
//! is installed. A trusted caller drives ONE coordinator per exact read scope;
//! opening a tab only allocates a bounded queue, never another source poller.
//!
//! Notifications mean that a complete durable projection group changed. They
//! contain no financial facts, entity IDs, source offsets or hidden counts and
//! cannot certify realtime completeness. Consumers refetch their scoped view.
//! The source adapter owns durable, authenticated cursor retention, generation
//! checks and filtering; an opaque cursor is never an authorization capability.

use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use execution_contracts::catalogue_v1::Quality;
use query_api::scoped::{AuthorizedRead, Operation, ReadAuthorizer, ReadScope};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::time::{timeout, Duration, Instant};

pub const SCOPED_NOTICE_SCHEMA_VERSION: &str = "execution.scoped-notice.v1";
pub const NOTICE_SEMANTICS: &str = "NOTIFICATION_ONLY";
pub const MAX_NOTICE_BATCH_BYTES: usize = 1024 * 1024;
const MAX_TIME_MS: i64 = 9_007_199_254_740_991;

/// A refetch hint, NOT an economic event or proof of full source coverage.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChangeNotice {
    pub resume_cursor: String,
    pub projection_generation: String,
    pub quality: Quality,
}

/// Bounded output from an authenticated durable replay reader. Empty batches
/// may advance through an authorized interval without exposing hidden counts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoticeBatch {
    pub notices: Vec<ChangeNotice>,
    pub next_cursor: Option<String>,
    /// Transport caught-up only; never upgrades `quality.completeness`.
    pub caught_up: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum ReplayError {
    #[error("RESYNC_REQUIRED")]
    ResyncRequired,
    #[error("SCOPED_REPLAY_UNAVAILABLE")]
    Unavailable,
}

pub type ReplayFuture<'a> =
    Pin<Box<dyn Future<Output = Result<NoticeBatch, ReplayError>> + Send + 'a>>;

/// Implementations must enforce scope before reads, bound the complete batch,
/// authenticate and expire cursors, read only committed complete groups and
/// recheck active generation/current policy using their own clock after await.
/// An unavailable/expired/foreign cursor never falls back to unscoped history.
pub trait ScopedReplaySource: Send + Sync {
    fn replay<'a>(
        &'a self,
        scope: &'a ReadScope,
        after: Option<&'a str>,
        limit: usize,
        now_ms: i64,
    ) -> ReplayFuture<'a>;
}

/// Explicit isolated-target limits, not production defaults or capacity claims.
#[derive(Debug, Clone, Copy)]
pub struct ScopedRealtimeConfig {
    pub maximum_clients: usize,
    pub client_queue_entries: usize,
    pub client_queue_bytes: usize,
    pub total_queue_bytes: usize,
    pub notices_per_poll: usize,
    pub maximum_notice_bytes: usize,
    pub poll_interval_ms: u32,
    pub poll_timeout_ms: u32,
}

impl ScopedRealtimeConfig {
    fn validate(self) -> Result<Self, ScopedRealtimeError> {
        if self.maximum_clients == 0
            || self.maximum_clients > 4096
            || self.client_queue_entries == 0
            || self.client_queue_entries > 4096
            || self.notices_per_poll == 0
            || self.notices_per_poll > 200
            || self.maximum_notice_bytes == 0
            || self.maximum_notice_bytes > 1024 * 1024
            || self.client_queue_bytes < self.maximum_notice_bytes
            || self.total_queue_bytes < self.client_queue_bytes
            || self.total_queue_bytes > 64 * 1024 * 1024
            || self.poll_interval_ms == 0
            || self.poll_interval_ms > 60_000
            || self.poll_timeout_ms == 0
            || self.poll_timeout_ms > 60_000
        {
            return Err(ScopedRealtimeError::Invalid);
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum ScopedRealtimeError {
    #[error("INVALID_SCOPED_REALTIME")]
    Invalid,
    #[error("RESOURCE_NOT_AVAILABLE")]
    AccessDenied,
    #[error("SCOPED_REALTIME_CAPACITY_BUSY")]
    Busy,
    #[error("RESYNC_REQUIRED")]
    ResyncRequired,
    #[error("SCOPED_REPLAY_UNAVAILABLE")]
    Unavailable,
    #[error("SCOPED_REPLAY_DEADLINE_EXCEEDED")]
    Timeout,
    #[error("SCOPED_NOTICE_INTEGRITY_CONFLICT")]
    Integrity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StreamStop {
    SlowConsumer,
    AccessDenied,
    ResyncRequired,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScopedDelivery {
    Notice(Arc<ChangeNotice>),
    Idle,
    Stopped(StreamStop),
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PollOutcome {
    NotDue,
    CaughtUp,
    MoreAvailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ScopedQueueMetrics {
    pub clients: usize,
    /// Conservative charged serialized bytes; excludes fixed bounded queue
    /// bookkeeping, and counts shared Arc payloads once PER queued recipient.
    pub charged_bytes: usize,
}

struct ClientQueue {
    entries: VecDeque<(Arc<ChangeNotice>, usize)>,
    bytes: usize,
    stop: Option<StreamStop>,
    stop_delivered: bool,
}

struct State {
    clients: BTreeMap<u64, ClientQueue>,
    next_id: u64,
    charged_bytes: usize,
    cursor: Option<String>,
    next_poll_ms: i64,
    hinted: bool,
    stopped: Option<StreamStop>,
}

struct Shared {
    read: AuthorizedRead,
    generation: String,
    config: ScopedRealtimeConfig,
    state: Mutex<State>,
    polling: AtomicBool,
}

/// One exact authorized query/generation cohort. Never share a hub merely
/// because callers have the same role name. Cancellation releases polling.
#[derive(Clone)]
pub struct ScopedRealtimeHub {
    shared: Arc<Shared>,
}

impl ScopedRealtimeHub {
    /// # Errors
    /// Invalid bounds, cursor, scope, generation or missing current Replay grant.
    pub fn new(
        scope: ReadScope,
        generation: String,
        initial_cursor: Option<String>,
        config: ScopedRealtimeConfig,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<Self, ScopedRealtimeError> {
        text(&generation, 256)?;
        optional_cursor(initial_cursor.as_deref())?;
        let config = config.validate()?;
        let read = AuthorizedRead::authorize(scope, Operation::Replay, authorizer, now_ms)
            .map_err(|_| ScopedRealtimeError::AccessDenied)?;
        Ok(Self {
            shared: Arc::new(Shared {
                read,
                generation,
                config,
                state: Mutex::new(State {
                    clients: BTreeMap::new(),
                    next_id: 0,
                    charged_bytes: 0,
                    cursor: initial_cursor,
                    next_poll_ms: now_ms,
                    hinted: false,
                    stopped: None,
                }),
                polling: AtomicBool::new(false),
            }),
        })
    }

    /// Queue-only subscription. It does not query TS, PG or any replay source.
    /// # Errors
    /// Current policy denial, invalid clock, stopped generation or client cap.
    pub fn subscribe(
        &self,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<ScopedSubscription, ScopedRealtimeError> {
        self.check(authorizer, now_ms)?;
        let mut state = self.lock()?;
        if state.stopped.is_some() {
            return Err(ScopedRealtimeError::ResyncRequired);
        }
        if state.clients.len() >= self.shared.config.maximum_clients {
            return Err(ScopedRealtimeError::Busy);
        }
        let id = state.next_id;
        state.next_id = id.checked_add(1).ok_or(ScopedRealtimeError::Busy)?;
        state.clients.insert(
            id,
            ClientQueue {
                entries: VecDeque::new(),
                bytes: 0,
                stop: None,
                stop_delivered: false,
            },
        );
        Ok(ScopedSubscription {
            hub: self.clone(),
            id,
        })
    }

    /// Wake hint only. Durable cursor polling remains mandatory when hints are
    /// lost; repeated hints coalesce and cannot create another in-flight read.
    /// # Errors
    /// Poisoned state fails closed.
    pub fn hint(&self) -> Result<(), ScopedRealtimeError> {
        self.lock()?.hinted = true;
        Ok(())
    }

    /// Caller drives this one bounded coordinator, not one loop per browser.
    /// # Errors
    /// Reauthorization, generation/receipt integrity, source or bounded timeout.
    pub async fn poll(
        &self,
        source: &dyn ScopedReplaySource,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<PollOutcome, ScopedRealtimeError> {
        self.check(authorizer, now_ms)?;
        let _flight = self.acquire()?;
        let after = {
            let mut state = self.lock()?;
            if state.stopped.is_some() {
                return Err(ScopedRealtimeError::ResyncRequired);
            }
            if !state.hinted && now_ms < state.next_poll_ms {
                return Ok(PollOutcome::NotDue);
            }
            state.hinted = false;
            state.next_poll_ms = now_ms
                .checked_add(i64::from(self.shared.config.poll_interval_ms))
                .ok_or(ScopedRealtimeError::Invalid)?;
            state.cursor.clone()
        };
        let batch = self
            .read_batch(source, after.as_deref(), authorizer, now_ms, true)
            .await?;
        let mut state = self.lock()?;
        for notice in &batch.notices {
            let bytes = notice_bytes(notice)?;
            let notice = Arc::new(notice.clone());
            let mut total = state.charged_bytes;
            for queue in state.clients.values_mut().filter(|q| q.stop.is_none()) {
                if queue.entries.len() >= self.shared.config.client_queue_entries
                    || queue.bytes.saturating_add(bytes) > self.shared.config.client_queue_bytes
                    || total.saturating_add(bytes) > self.shared.config.total_queue_bytes
                {
                    total -= queue.bytes;
                    queue.entries.clear();
                    queue.bytes = 0;
                    queue.stop = Some(StreamStop::SlowConsumer);
                } else {
                    queue.entries.push_back((Arc::clone(&notice), bytes));
                    queue.bytes += bytes;
                    total += bytes;
                }
            }
            state.charged_bytes = total;
        }
        state.cursor = batch.next_cursor;
        Ok(if batch.caught_up {
            PollOutcome::CaughtUp
        } else {
            PollOutcome::MoreAvailable
        })
    }

    /// One bounded reconnect read. It NEVER advances the shared poll cursor or
    /// creates a client polling task. Caller must avoid replay/live handoff gaps
    /// using the durable opaque cursor, never visible numeric gap arithmetic.
    /// # Errors
    /// Expired/foreign cursor, revoked scope, wrong generation or bounded source.
    pub async fn resume(
        &self,
        source: &dyn ScopedReplaySource,
        after: Option<&str>,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<NoticeBatch, ScopedRealtimeError> {
        self.check(authorizer, now_ms)?;
        optional_cursor(after)?;
        let _flight = self.acquire()?;
        if self.lock()?.stopped.is_some() {
            return Err(ScopedRealtimeError::ResyncRequired);
        }
        self.read_batch(source, after, authorizer, now_ms, false)
            .await
    }

    /// Opaque durable resume token for trusted coordinator persistence only.
    /// # Errors
    /// Poisoned state fails closed.
    pub fn cursor(&self) -> Result<Option<String>, ScopedRealtimeError> {
        Ok(self.lock()?.cursor.clone())
    }

    /// # Errors
    /// Poisoned state fails closed. Metrics are server-internal, not wire data.
    pub fn metrics(&self) -> Result<ScopedQueueMetrics, ScopedRealtimeError> {
        let state = self.lock()?;
        Ok(ScopedQueueMetrics {
            clients: state.clients.len(),
            charged_bytes: state.charged_bytes,
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, State>, ScopedRealtimeError> {
        self.shared
            .state
            .lock()
            .map_err(|_| ScopedRealtimeError::Integrity)
    }

    fn check(
        &self,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<(), ScopedRealtimeError> {
        if self.shared.read.recheck(authorizer, now_ms).is_err() {
            self.stop(StreamStop::AccessDenied)?;
            return Err(ScopedRealtimeError::AccessDenied);
        }
        Ok(())
    }

    fn stop(&self, reason: StreamStop) -> Result<(), ScopedRealtimeError> {
        let mut state = self.lock()?;
        state.stopped = Some(reason);
        for queue in state.clients.values_mut() {
            queue.entries.clear();
            queue.bytes = 0;
            queue.stop = Some(reason);
        }
        state.charged_bytes = 0;
        Ok(())
    }

    fn acquire(&self) -> Result<Flight<'_>, ScopedRealtimeError> {
        self.shared
            .polling
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| ScopedRealtimeError::Busy)?;
        Ok(Flight(&self.shared.polling))
    }

    async fn read_batch(
        &self,
        source: &dyn ScopedReplaySource,
        after: Option<&str>,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
        invalidate_cohort: bool,
    ) -> Result<NoticeBatch, ScopedRealtimeError> {
        let started = Instant::now();
        let result = timeout(
            Duration::from_millis(u64::from(self.shared.config.poll_timeout_ms)),
            source.replay(
                self.shared.read.scope(),
                after,
                self.shared.config.notices_per_poll,
                now_ms,
            ),
        )
        .await;
        let elapsed = i64::try_from(started.elapsed().as_millis())
            .map_err(|_| ScopedRealtimeError::Invalid)?;
        let current_ms = now_ms
            .checked_add(elapsed)
            .filter(|v| *v <= MAX_TIME_MS)
            .ok_or(ScopedRealtimeError::Invalid)?;
        self.check(authorizer, current_ms)?;
        let batch = match result {
            Err(_) => return Err(ScopedRealtimeError::Timeout),
            Ok(Err(ReplayError::Unavailable)) => return Err(ScopedRealtimeError::Unavailable),
            Ok(Err(ReplayError::ResyncRequired)) => {
                if invalidate_cohort {
                    self.stop(StreamStop::ResyncRequired)?;
                }
                return Err(ScopedRealtimeError::ResyncRequired);
            }
            Ok(Ok(batch)) => batch,
        };
        if self.validate_batch(&batch, after).is_err() {
            if invalidate_cohort {
                self.stop(StreamStop::ResyncRequired)?;
            }
            return Err(ScopedRealtimeError::Integrity);
        }
        let elapsed = i64::try_from(started.elapsed().as_millis())
            .map_err(|_| ScopedRealtimeError::Invalid)?;
        self.check(
            authorizer,
            now_ms
                .checked_add(elapsed)
                .ok_or(ScopedRealtimeError::Invalid)?,
        )?;
        Ok(batch)
    }

    fn validate_batch(
        &self,
        batch: &NoticeBatch,
        after: Option<&str>,
    ) -> Result<(), ScopedRealtimeError> {
        optional_cursor(batch.next_cursor.as_deref())?;
        if batch.notices.len() > self.shared.config.notices_per_poll
            || (!batch.caught_up && batch.next_cursor.as_deref() == after)
            || (after.is_some() && batch.next_cursor.is_none())
        {
            return Err(ScopedRealtimeError::Integrity);
        }
        let mut seen = BTreeSet::new();
        // Include the duplicated tail cursor and bounded envelope framing, not
        // only individual notice payloads, in the batch serialization budget.
        let mut total_bytes = batch.next_cursor.as_ref().map_or(128, |v| 128 + v.len());
        for notice in &batch.notices {
            optional_cursor(Some(&notice.resume_cursor))?;
            total_bytes = total_bytes
                .saturating_add(notice_bytes(notice)?)
                .saturating_add(1);
            if notice.projection_generation != self.shared.generation
                || Some(notice.resume_cursor.as_str()) == after
                || !seen.insert(&notice.resume_cursor)
                || notice_bytes(notice)? > self.shared.config.maximum_notice_bytes
                || total_bytes > MAX_NOTICE_BATCH_BYTES
            {
                return Err(ScopedRealtimeError::Integrity);
            }
            // Also enforce constructors' wire validation (e.g. <=32 reasons).
            let bytes = serde_json::to_vec(notice).map_err(|_| ScopedRealtimeError::Integrity)?;
            serde_json::from_slice::<ChangeNotice>(&bytes)
                .map_err(|_| ScopedRealtimeError::Integrity)?;
        }
        if let Some(last) = batch.notices.last() {
            if batch.next_cursor.as_deref() != Some(last.resume_cursor.as_str()) {
                return Err(ScopedRealtimeError::Integrity);
            }
        }
        Ok(())
    }
}

struct Flight<'a>(&'a AtomicBool);
impl Drop for Flight<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

pub struct ScopedSubscription {
    hub: ScopedRealtimeHub,
    id: u64,
}

impl ScopedSubscription {
    /// Revalidates current rights BEFORE every queued delivery. A revoke purges
    /// all queued notices for this exact scope cohort, even after a fresh poll.
    /// # Errors
    /// Poisoned state fails closed; protected data is never returned on failure.
    pub fn next(
        &mut self,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<ScopedDelivery, ScopedRealtimeError> {
        // Keep terminal delivery observable once while never emitting old data.
        let _ = self.hub.check(authorizer, now_ms);
        let mut state = self.hub.lock()?;
        let Some(queue) = state.clients.get_mut(&self.id) else {
            return Ok(ScopedDelivery::Closed);
        };
        if let Some(stop) = queue.stop {
            if queue.stop_delivered {
                return Ok(ScopedDelivery::Closed);
            }
            queue.stop_delivered = true;
            return Ok(ScopedDelivery::Stopped(stop));
        }
        if let Some((notice, bytes)) = queue.entries.pop_front() {
            queue.bytes -= bytes;
            state.charged_bytes -= bytes;
            return Ok(ScopedDelivery::Notice(notice));
        }
        Ok(ScopedDelivery::Idle)
    }
}

impl Drop for ScopedSubscription {
    fn drop(&mut self) {
        if let Ok(mut state) = self.hub.shared.state.lock() {
            if let Some(queue) = state.clients.remove(&self.id) {
                state.charged_bytes -= queue.bytes;
            }
        }
    }
}

fn text(value: &str, maximum: usize) -> Result<(), ScopedRealtimeError> {
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ScopedRealtimeError::Invalid);
    }
    Ok(())
}

fn optional_cursor(value: Option<&str>) -> Result<(), ScopedRealtimeError> {
    if let Some(value) = value {
        text(value, 4096)?;
        if !value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || b"._-".contains(&v))
        {
            return Err(ScopedRealtimeError::Invalid);
        }
    }
    Ok(())
}

fn notice_bytes(notice: &ChangeNotice) -> Result<usize, ScopedRealtimeError> {
    serde_json::to_vec(notice)
        .map(|v| v.len())
        .map_err(|_| ScopedRealtimeError::Integrity)
}

#[cfg(test)]
mod tests;
