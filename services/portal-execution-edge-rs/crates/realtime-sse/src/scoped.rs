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
use projection_core::resources::{ResourceEnvelope, ResourceError, ResourceLease};
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
    /// Retains the configured charge through every hub clone/subscription.
    registration: Option<Arc<ResourceLease>>,
    /// Governed cohorts cannot use hints to bypass their minimum poll cadence.
    poll_extra_ms: Option<u32>,
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
                registration: None,
                poll_extra_ms: None,
            }),
        })
    }

    /// Registers the aggregate configured client queue entries/bytes once per
    /// shared hub. Logical capacity is not process RSS. Governs poll cadence to
    /// interval plus per-instance jitter in [0,min(interval,1000)] milliseconds;
    /// hints never bypass that minimum. It starts no poll/retry background task.
    /// # Errors
    /// Invalid scope/config, denied Replay grant or exhausted shared resources.
    pub fn new_with_resources(
        scope: ReadScope,
        generation: String,
        initial_cursor: Option<String>,
        config: ScopedRealtimeConfig,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
        resources: &Arc<ResourceEnvelope>,
    ) -> Result<Self, ScopedRealtimeError> {
        let mut hub = Self::new(
            scope,
            generation,
            initial_cursor,
            config,
            authorizer,
            now_ms,
        )?;
        let entries = config
            .maximum_clients
            .checked_mul(config.client_queue_entries)
            .ok_or(ScopedRealtimeError::Invalid)?;
        let registration = resources
            .try_register(entries, config.total_queue_bytes)
            .map_err(|error| match error {
                ResourceError::Config => ScopedRealtimeError::Invalid,
                _ => ScopedRealtimeError::Busy,
            })?;
        let maximum_extra_ms = config.poll_interval_ms.min(1000);
        let extra_ms =
            u32::try_from(uuid::Uuid::now_v7().as_u128() % u128::from(maximum_extra_ms + 1))
                .map_err(|_| ScopedRealtimeError::Invalid)?;
        let shared = Arc::get_mut(&mut hub.shared).ok_or(ScopedRealtimeError::Unavailable)?;
        shared.registration = Some(Arc::new(registration));
        shared.poll_extra_ms = Some(extra_ms);
        Ok(hub)
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
            if now_ms < state.next_poll_ms && (self.shared.poll_extra_ms.is_some() || !state.hinted)
            {
                return Ok(PollOutcome::NotDue);
            }
            state.hinted = false;
            state.next_poll_ms = now_ms
                .checked_add(
                    i64::from(self.shared.config.poll_interval_ms)
                        + i64::from(self.shared.poll_extra_ms.unwrap_or(0)),
                )
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

#[cfg(test)]
mod resource_tests {
    use std::sync::atomic::AtomicUsize;

    use projection_core::resources::EnvelopeLimits;
    use query_api::scoped::{Coverage, HistoryCapability};

    use super::*;

    // Source-dark, test-only authorization and notification fixtures.
    struct Authorizer(bool);

    impl ReadAuthorizer for Authorizer {
        fn current(&self, scope: &ReadScope, operation: Operation, _now_ms: i64) -> bool {
            self.0 && operation == Operation::Replay && scope.principal_digest == digest(1)
        }
    }

    fn digest(value: u8) -> String {
        format!("sha256:{value:064x}")
    }

    fn scope() -> ReadScope {
        ReadScope {
            ingest_binding_digest: digest(2),
            slot_key: digest(3),
            principal_digest: digest(1),
            effective_scope_digest: digest(4),
            app_policy_revision: "app-v1".into(),
            field_policy_revision: "field-v1".into(),
            schema_version: "scoped.v1".into(),
            model_revision: "model-v1".into(),
            source_set_digest: digest(5),
            dataset: "orders".into(),
            entity_ids: None,
            allowed_fields: BTreeSet::from(["quantity".into()]),
            history_capability: HistoryCapability::RetainedObservations,
            coverage: Coverage::RetainedObservations,
            history_from_ms: Some(0),
            history_to_ms: Some(1000),
        }
    }

    fn config() -> ScopedRealtimeConfig {
        ScopedRealtimeConfig {
            maximum_clients: 2,
            client_queue_entries: 2,
            client_queue_bytes: 1024,
            total_queue_bytes: 2048,
            notices_per_poll: 2,
            maximum_notice_bytes: 128,
            poll_interval_ms: 10,
            poll_timeout_ms: 100,
        }
    }

    fn resources(max_entries: usize, max_bytes: usize) -> Arc<ResourceEnvelope> {
        Arc::new(
            ResourceEnvelope::new(EnvelopeLimits {
                max_active: 3,
                foreground_reserved: 1,
                foreground_reserved_entries: 2,
                foreground_reserved_bytes: 1000,
                max_entries,
                max_bytes,
                storage_max_age: std::time::Duration::from_secs(5),
            })
            .unwrap(),
        )
    }

    fn hub(resources: &Arc<ResourceEnvelope>) -> Result<ScopedRealtimeHub, ScopedRealtimeError> {
        ScopedRealtimeHub::new_with_resources(
            scope(),
            "generation-one".into(),
            None,
            config(),
            &Authorizer(true),
            0,
            resources,
        )
    }

    struct Source {
        calls: AtomicUsize,
        failure: Option<ReplayError>,
    }

    impl ScopedReplaySource for Source {
        fn replay<'a>(
            &'a self,
            _scope: &'a ReadScope,
            _after: Option<&'a str>,
            _limit: usize,
            _now_ms: i64,
        ) -> ReplayFuture<'a> {
            self.calls.fetch_add(1, Ordering::AcqRel);
            Box::pin(async move {
                if let Some(error) = self.failure {
                    Err(error)
                } else {
                    Ok(NoticeBatch {
                        notices: vec![],
                        next_cursor: None,
                        caught_up: true,
                    })
                }
            })
        }
    }

    #[test]
    fn hub_aggregate_registration_survives_clone_and_subscription() {
        let resources = resources(10, 10000);
        let first = hub(&resources).unwrap();
        let subscription = first.subscribe(&Authorizer(true), 0).unwrap();
        let cloned = first.clone();
        let second = hub(&resources).unwrap();
        assert!(matches!(hub(&resources), Err(ScopedRealtimeError::Busy)));
        assert_eq!(resources.stats().unwrap().active, 0);
        assert_eq!(resources.stats().unwrap().entries, 8);
        drop((first, cloned));
        assert_eq!(resources.stats().unwrap().entries, 8);
        drop(subscription);
        assert_eq!(resources.stats().unwrap().entries, 4);
        drop(second);
        assert_eq!(resources.stats().unwrap().bytes, 0);
    }

    #[test]
    fn hub_aggregate_bytes_and_authorization_fail_without_leaks() {
        let resources = resources(20, 5000);
        let first = hub(&resources).unwrap();
        assert!(matches!(hub(&resources), Err(ScopedRealtimeError::Busy)));
        assert!(matches!(
            ScopedRealtimeHub::new_with_resources(
                scope(),
                "generation-one".into(),
                None,
                config(),
                &Authorizer(false),
                0,
                &resources,
            ),
            Err(ScopedRealtimeError::AccessDenied)
        ));
        assert_eq!(resources.stats().unwrap().registrations, 1);
        drop(first);
        assert_eq!(resources.stats().unwrap().entries, 0);
    }

    #[tokio::test]
    async fn governed_jitter_is_bounded_and_hints_cannot_bypass_minimum() {
        let resources = resources(10, 10000);
        let hub = hub(&resources).unwrap();
        let source = Source {
            calls: AtomicUsize::new(0),
            failure: None,
        };
        assert_eq!(
            hub.poll(&source, &Authorizer(true), 0).await.unwrap(),
            PollOutcome::CaughtUp
        );
        let next = hub.lock().unwrap().next_poll_ms;
        assert!((10..=20).contains(&next));
        hub.hint().unwrap();
        assert_eq!(
            hub.poll(&source, &Authorizer(true), 9).await.unwrap(),
            PollOutcome::NotDue
        );
        assert_eq!(
            hub.poll(&source, &Authorizer(true), next - 1)
                .await
                .unwrap(),
            PollOutcome::NotDue
        );
        assert_eq!(source.calls.load(Ordering::Acquire), 1);
        assert_eq!(
            hub.poll(&source, &Authorizer(true), next).await.unwrap(),
            PollOutcome::CaughtUp
        );
        assert_eq!(source.calls.load(Ordering::Acquire), 2);
        drop(hub);
        assert_eq!(resources.stats().unwrap().bytes, 0);
    }

    #[tokio::test]
    async fn governed_resync_is_terminal_not_an_automatic_retry() {
        let hub = hub(&resources(10, 10000)).unwrap();
        let source = Source {
            calls: AtomicUsize::new(0),
            failure: Some(ReplayError::ResyncRequired),
        };
        assert_eq!(
            hub.poll(&source, &Authorizer(true), 0).await,
            Err(ScopedRealtimeError::ResyncRequired)
        );
        hub.hint().unwrap();
        assert_eq!(
            hub.poll(&source, &Authorizer(true), 100).await,
            Err(ScopedRealtimeError::ResyncRequired)
        );
        assert_eq!(source.calls.load(Ordering::Acquire), 1);
    }
}
