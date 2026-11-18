//! Source-dark scoped read contract. No route, policy grant or source is installed.
//!
//! The current-policy adapter is a trusted boundary, not a browser-supplied
//! assertion. These APIs never widen an absent scope to a workspace-wide read.

pub mod authority;

use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::io;
use std::sync::{
    atomic::{AtomicBool, Ordering as AtomicOrdering},
    Arc, Mutex,
};
use std::time::Duration;

use execution_contracts::catalogue_v1::ExactDecimal;
use projection_core::resources::{ResourceEnvelope, ResourceError, ResourceLease};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use tokio::sync::Notify;
use tokio::time::{timeout_at, Instant};
use uuid::Uuid;

pub const MAX_READ_ROWS: usize = 200;
pub const MAX_READ_BYTES: usize = 1024 * 1024;
const MAX_TIME_MS: i64 = 9_007_199_254_740_991;

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum ScopedError {
    #[error("INVALID_SCOPED_READ")]
    Invalid,
    #[error("BOUNDED_READ_REQUIRED")]
    Bounds,
    #[error("RESOURCE_NOT_AVAILABLE")]
    AccessDenied,
    #[error("HISTORY_UNAVAILABLE")]
    TypedUnavailable,
    #[error("RESYNC_REQUIRED")]
    ResyncRequired,
    #[error("READ_CAPACITY_BUSY")]
    Busy,
    #[error("READ_DEADLINE_EXCEEDED")]
    Timeout,
    #[error("SCOPED_READ_INTEGRITY_CONFLICT")]
    Integrity,
    #[error("SCOPED_READ_UNAVAILABLE")]
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Operation {
    Current,
    History,
    Replay,
    Export,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HistoryCapability {
    Unavailable,
    RetainedObservations,
    Authoritative,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Coverage {
    AuthorizedOnly,
    RetainedObservations,
    CurrentPageOnly,
}

/// Trusted, exact policy/source selection. `None` IDs means manager-wide only
/// if the independent authorizer explicitly permits it; it is never a default.
/// Allowed fields are top-level schema fields, not arbitrary nested selectors.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadScope {
    pub ingest_binding_digest: String,
    pub slot_key: String,
    pub principal_digest: String,
    pub effective_scope_digest: String,
    pub app_policy_revision: String,
    pub field_policy_revision: String,
    pub schema_version: String,
    pub model_revision: String,
    pub source_set_digest: String,
    pub dataset: String,
    pub entity_ids: Option<BTreeSet<String>>,
    pub allowed_fields: BTreeSet<String>,
    pub history_capability: HistoryCapability,
    pub coverage: Coverage,
    /// Explicit source-declared retained interval [from,to), never MIN/MAX facts.
    pub history_from_ms: Option<i64>,
    pub history_to_ms: Option<i64>,
}

impl ReadScope {
    /// # Errors
    /// Rejects malformed/oversized scope, missing field policy or false coverage.
    pub fn validate(&self) -> Result<(), ScopedError> {
        bounded(self, 64 * 1024)?;
        for digest in [
            &self.ingest_binding_digest,
            &self.slot_key,
            &self.principal_digest,
            &self.effective_scope_digest,
            &self.source_set_digest,
        ] {
            valid_digest(digest)?;
        }
        for value in [
            &self.app_policy_revision,
            &self.field_policy_revision,
            &self.schema_version,
            &self.model_revision,
            &self.dataset,
        ] {
            opaque(value)?;
        }
        if self.allowed_fields.is_empty() {
            return Err(ScopedError::Invalid);
        }
        if self.allowed_fields.len() > 64
            || self.entity_ids.as_ref().is_some_and(|ids| ids.len() > 256)
        {
            return Err(ScopedError::Bounds);
        }
        if self.coverage == Coverage::CurrentPageOnly
            && self.history_capability == HistoryCapability::Authoritative
        {
            return Err(ScopedError::Invalid);
        }
        for field in &self.allowed_fields {
            opaque(field)?;
            if secret_field(field) {
                return Err(ScopedError::Invalid);
            }
        }
        if let Some(ids) = &self.entity_ids {
            for id in ids {
                opaque(id)?;
            }
        }
        match (self.history_from_ms, self.history_to_ms) {
            (Some(from), Some(to)) => {
                time(from)?;
                time(to)?;
                if to <= from || self.history_capability == HistoryCapability::Unavailable {
                    return Err(ScopedError::Invalid);
                }
            }
            (None, None) if self.history_capability == HistoryCapability::Unavailable => {}
            _ => return Err(ScopedError::Invalid),
        }
        Ok(())
    }

    /// # Errors
    /// Rejects invalid scope; returns a hash, never an authorization capability.
    pub fn digest(&self) -> Result<String, ScopedError> {
        self.validate()?;
        hash(self)
    }
}

/// Must enforce current app/field policy and operation-specific rights. In
/// particular Export/Replay are not implied by a Current read authorization.
pub trait ReadAuthorizer: Send + Sync {
    fn current(&self, scope: &ReadScope, operation: Operation, now_ms: i64) -> bool;
}

/// Private construction, no Deserialize. Every query/hit/download/replay must
/// recheck this against the current policy, not just the original session token.
#[derive(Debug, Clone)]
pub struct AuthorizedRead {
    scope: ReadScope,
    operation: Operation,
}

impl AuthorizedRead {
    /// # Errors
    /// Missing or stale rights fail closed; no accepting runtime adapter exists.
    pub fn authorize(
        scope: ReadScope,
        operation: Operation,
        authorizer: &dyn ReadAuthorizer,
        now_ms: i64,
    ) -> Result<Self, ScopedError> {
        scope.validate()?;
        let read = Self { scope, operation };
        read.recheck(authorizer, now_ms)?;
        Ok(read)
    }

    #[must_use]
    pub fn scope(&self) -> &ReadScope {
        &self.scope
    }

    #[must_use]
    pub const fn operation(&self) -> Operation {
        self.operation
    }

    /// # Errors
    /// Current-policy rejection is the same safe shape for hidden/missing IDs.
    pub fn recheck(&self, authorizer: &dyn ReadAuthorizer, now_ms: i64) -> Result<(), ScopedError> {
        time(now_ms)?;
        if !authorizer.current(&self.scope, self.operation, now_ms) {
            return Err(ScopedError::AccessDenied);
        }
        Ok(())
    }

    #[must_use]
    pub fn allows_entity(&self, entity_id: &str) -> bool {
        self.scope
            .entity_ids
            .as_ref()
            .is_none_or(|ids| ids.contains(entity_id))
    }

    /// Field projection is additional defense, not a replacement for pre-query
    /// row authorization. No hidden fields may participate in count/sort/join.
    /// # Errors
    /// Rejects non-object data instead of returning an unredacted raw payload.
    pub fn project_payload(&self, payload: &Value) -> Result<Value, ScopedError> {
        let object = payload.as_object().ok_or(ScopedError::Integrity)?;
        let projected = Value::Object(
            object
                .iter()
                .filter(|(field, _)| self.scope.allowed_fields.contains(*field))
                .map(|(field, value)| (field.clone(), value.clone()))
                .collect(),
        );
        let mut nodes = 0;
        safe_publication(&projected, 0, &mut nodes)?;
        Ok(projected)
    }
}

// Defense in depth over an already owner-reviewed schema/field allowlist, NOT
// a substitute for it or a promise to recognize arbitrary secret values. Never
// inspect excluded fields: hidden values must not become an error side channel.
fn secret_field(field: &str) -> bool {
    let normalized: String = field
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .flat_map(char::to_lowercase)
        .collect();
    matches!(
        normalized.as_str(),
        "password"
            | "passwd"
            | "secret"
            | "clientsecret"
            | "apisecret"
            | "apikey"
            | "privatekey"
            | "signingkey"
            | "credential"
            | "credentials"
            | "authorization"
            | "cookie"
            | "setcookie"
            | "token"
            | "accesstoken"
            | "refreshtoken"
            | "sessiontoken"
            | "idtoken"
            | "jwt"
            | "bearertoken"
            | "dbpassword"
            | "connectionstring"
    )
}

fn safe_publication(value: &Value, depth: usize, nodes: &mut usize) -> Result<(), ScopedError> {
    *nodes += 1;
    if depth > 16 || *nodes > 4096 {
        return Err(ScopedError::Bounds);
    }
    match value {
        Value::Object(fields) => {
            for (field, value) in fields {
                if secret_field(field) {
                    return Err(ScopedError::Integrity);
                }
                safe_publication(value, depth + 1, nodes)?;
            }
        }
        Value::Array(values) => {
            for value in values {
                safe_publication(value, depth + 1, nodes)?;
            }
        }
        Value::String(text)
            if text.contains("-----BEGIN ") && text.contains("PRIVATE KEY-----")
                || text
                    .trim_start()
                    .get(..7)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case("Bearer ")) =>
        {
            return Err(ScopedError::Integrity)
        }
        _ => {}
    }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReadQuery {
    pub operation: Operation,
    pub limit: usize,
    pub max_bytes: usize,
    pub entity_id: Option<String>,
    pub from_ms: Option<i64>,
    pub to_ms: Option<i64>,
}

impl ReadQuery {
    /// # Errors
    /// Rejects widening, partial ranges, unavailable history and unsafe bounds.
    pub fn validate(&self, scope: &ReadScope) -> Result<(), ScopedError> {
        scope.validate()?;
        if !(1..=MAX_READ_ROWS).contains(&self.limit)
            || !(1..=MAX_READ_BYTES).contains(&self.max_bytes)
        {
            return Err(ScopedError::Bounds);
        }
        if let Some(entity) = &self.entity_id {
            opaque(entity)?;
            if scope
                .entity_ids
                .as_ref()
                .is_some_and(|ids| !ids.contains(entity))
            {
                return Err(ScopedError::AccessDenied);
            }
        }
        let history_range = match (self.from_ms, self.to_ms) {
            (None, None) => false,
            (Some(from), Some(to)) => {
                time(from)?;
                time(to)?;
                if from >= to || self.operation == Operation::Current {
                    return Err(ScopedError::Invalid);
                }
                if scope.history_capability == HistoryCapability::Unavailable {
                    return Err(ScopedError::TypedUnavailable);
                }
                if scope.history_from_ms.is_none_or(|start| from < start)
                    || scope.history_to_ms.is_none_or(|end| to > end)
                {
                    return Err(ScopedError::TypedUnavailable);
                }
                true
            }
            _ => return Err(ScopedError::Invalid),
        };
        if self.operation == Operation::History && !history_range {
            return Err(ScopedError::Invalid);
        }
        if matches!(self.operation, Operation::History | Operation::Replay)
            && scope.history_capability == HistoryCapability::Unavailable
        {
            return Err(ScopedError::TypedUnavailable);
        }
        Ok(())
    }

    /// # Errors
    /// Serialization failure is a contract error, never a fallback cache key.
    pub fn digest(&self) -> Result<String, ScopedError> {
        hash(self)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CacheContext {
    pub generation: Uuid,
    pub projection_revision: String,
    pub cutoff_ms: i64,
}

impl CacheContext {
    /// # Errors
    /// Rejects absent generation/revision or an invalid pinned cutoff.
    pub fn validate(&self) -> Result<(), ScopedError> {
        if self.generation.is_nil() {
            return Err(ScopedError::Invalid);
        }
        opaque(&self.projection_revision)?;
        time(self.cutoff_ms)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheKey(String);
impl CacheKey {
    /// # Errors
    /// The entire scope, query and immutable snapshot identity are bound.
    pub fn new(
        read: &AuthorizedRead,
        query: &ReadQuery,
        context: &CacheContext,
    ) -> Result<Self, ScopedError> {
        query.validate(read.scope())?;
        context.validate()?;
        if query.operation != read.operation() {
            return Err(ScopedError::AccessDenied);
        }
        Ok(Self(hash(&(read.scope(), query, context))?))
    }
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Explicit isolated safety ceilings, NOT approved production capacity/SLOs.
#[derive(Debug, Clone, Copy)]
pub struct CacheLimits {
    pub max_entries: usize,
    pub max_bytes: usize,
    pub max_flights: usize,
    pub ttl_ms: u64,
    pub load_timeout_ms: u64,
}
impl CacheLimits {
    /// # Errors
    /// No implicit defaults, unbounded queue or unlimited TTL is permitted.
    pub fn validate(&self) -> Result<(), ScopedError> {
        if !(1..=4096).contains(&self.max_entries)
            || !(1..=64 * MAX_READ_BYTES).contains(&self.max_bytes)
            || !(1..=64).contains(&self.max_flights)
            || !(1..=300_000).contains(&self.ttl_ms)
            || !(1..=5_000).contains(&self.load_timeout_ms)
        {
            return Err(ScopedError::Bounds);
        }
        Ok(())
    }
}

pub struct CacheRequest<'a> {
    pub read: &'a AuthorizedRead,
    pub query: &'a ReadQuery,
    pub context: &'a CacheContext,
    pub authorizer: &'a dyn ReadAuthorizer,
    pub clock: &'a (dyn Fn() -> i64 + Sync),
    /// Must compare the current generation/revision/cutoff, not simply true.
    pub current_context: &'a (dyn Fn(&CacheContext) -> bool + Sync),
}
impl CacheRequest<'_> {
    fn check(&self) -> Result<(), ScopedError> {
        self.read.recheck(self.authorizer, (self.clock)())?;
        self.query.validate(self.read.scope())?;
        if self.read.operation() != self.query.operation {
            return Err(ScopedError::AccessDenied);
        }
        self.context.validate()?;
        if !(self.current_context)(self.context) {
            return Err(ScopedError::ResyncRequired);
        }
        Ok(())
    }
}

struct Entry {
    value: Arc<Vec<u8>>,
    expires_at_ms: i64,
    used: u64,
}
struct Flight {
    notify: Notify,
    done: AtomicBool,
    epoch: u64,
}
struct State {
    entries: BTreeMap<String, Entry>,
    flights: BTreeMap<String, Arc<Flight>>,
    bytes: usize,
    epoch: u64,
    tick: u64,
}

/// In-process query coalescing only, never a distributed ingest lease or replay
/// authority. Futures run in callers and cancellation drops the exact slot.
#[derive(Clone)]
pub struct ScopedCache {
    state: Arc<Mutex<State>>,
    limits: CacheLimits,
    /// Retains the configured charge until the final cache clone is dropped.
    registration: Option<Arc<ResourceLease>>,
}

struct FlightGuard {
    state: Arc<Mutex<State>>,
    key: String,
    flight: Arc<Flight>,
}
impl Drop for FlightGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = self.state.lock() {
            if state
                .flights
                .get(&self.key)
                .is_some_and(|current| Arc::ptr_eq(current, &self.flight))
            {
                state.flights.remove(&self.key);
            }
        }
        self.flight.done.store(true, AtomicOrdering::Release);
        self.flight.notify.notify_waiters();
    }
}

impl ScopedCache {
    /// # Errors
    /// Rejects unsafe explicit limits; construction creates no background task.
    pub fn new(limits: CacheLimits) -> Result<Self, ScopedError> {
        limits.validate()?;
        Ok(Self {
            state: Arc::new(Mutex::new(State {
                entries: BTreeMap::new(),
                flights: BTreeMap::new(),
                bytes: 0,
                epoch: 0,
                tick: 0,
            })),
            limits,
            registration: None,
        })
    }

    /// Registers configured cache entries, in-flight slots and retained bytes
    /// once across all clones. This logical ceiling is not a process RSS claim;
    /// active loaders must use the caller's governed work admission separately.
    /// # Errors
    /// Invalid limits, arithmetic overflow or exhausted shared resource budget.
    pub fn new_with_resources(
        limits: CacheLimits,
        resources: &Arc<ResourceEnvelope>,
    ) -> Result<Self, ScopedError> {
        let mut cache = Self::new(limits)?;
        let entries = limits
            .max_entries
            .checked_add(limits.max_flights)
            .ok_or(ScopedError::Bounds)?;
        let registration = resources
            .try_register(entries, limits.max_bytes)
            .map_err(|error| match error {
                ResourceError::Config => ScopedError::Bounds,
                _ => ScopedError::Busy,
            })?;
        cache.registration = Some(Arc::new(registration));
        Ok(cache)
    }

    /// Invalidates cached values and fences already running loaders. Flights
    /// retain their slots until cancellation/completion, preventing reset storms
    /// from multiplying concurrent work beyond `max_flights`.
    /// # Errors
    /// Poisoned state/epoch exhaustion fails closed instead of clearing policy.
    pub fn invalidate(&self) -> Result<(), ScopedError> {
        let mut state = self.state.lock().map_err(|_| ScopedError::Unavailable)?;
        state.epoch = state.epoch.checked_add(1).ok_or(ScopedError::Bounds)?;
        state.entries.clear();
        state.bytes = 0;
        for flight in state.flights.values() {
            flight.done.store(true, AtomicOrdering::Release);
            flight.notify.notify_waiters();
        }
        Ok(())
    }

    /// Returns entries, bytes and active flights without payload/identity data.
    /// # Errors
    /// Poisoned cache state is unavailable.
    pub fn usage(&self) -> Result<(usize, usize, usize), ScopedError> {
        let state = self.state.lock().map_err(|_| ScopedError::Unavailable)?;
        Ok((state.entries.len(), state.bytes, state.flights.len()))
    }

    /// Authorization and snapshot identity are rechecked on hits and after
    /// every wait/load. Errors are not cached. Byte/entry/flight/wait/TTL bounds
    /// apply independently; invalidation cannot publish an old in-flight fill.
    /// # Errors
    /// Returns only coarse policy, resync, bound, busy and timeout failures.
    #[allow(clippy::too_many_lines)] // One auditable slot/load/commit lifecycle.
    pub async fn get_or_load<F, Fut>(
        &self,
        request: CacheRequest<'_>,
        load: F,
    ) -> Result<Arc<Vec<u8>>, ScopedError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Vec<u8>, ScopedError>>,
    {
        request.check()?;
        let key = CacheKey::new(request.read, request.query, request.context)?.0;
        let deadline = Instant::now() + Duration::from_millis(self.limits.load_timeout_ms);
        loop {
            request.check()?;
            let (hit, flight, leader, epoch) = {
                let mut state = self.state.lock().map_err(|_| ScopedError::Unavailable)?;
                let now = (request.clock)();
                let expired: Vec<_> = state
                    .entries
                    .iter()
                    .filter(|(_, entry)| entry.expires_at_ms <= now)
                    .map(|(key, _)| key.clone())
                    .collect();
                for expired in expired {
                    if let Some(entry) = state.entries.remove(&expired) {
                        state.bytes -= entry.value.len();
                    }
                }
                state.tick = state.tick.checked_add(1).ok_or(ScopedError::Bounds)?;
                let used = state.tick;
                let epoch = state.epoch;
                if let Some(entry) = state.entries.get_mut(&key) {
                    entry.used = used;
                    (Some(Arc::clone(&entry.value)), None, false, epoch)
                } else if let Some(flight) = state.flights.get(&key) {
                    if flight.epoch != epoch {
                        return Err(ScopedError::ResyncRequired);
                    }
                    (None, Some(Arc::clone(flight)), false, epoch)
                } else {
                    if state.flights.len() >= self.limits.max_flights {
                        return Err(ScopedError::Busy);
                    }
                    let flight = Arc::new(Flight {
                        notify: Notify::new(),
                        done: AtomicBool::new(false),
                        epoch,
                    });
                    state.flights.insert(key.clone(), Arc::clone(&flight));
                    (None, Some(flight), true, epoch)
                }
            };
            if let Some(value) = hit {
                request.check()?;
                if self
                    .state
                    .lock()
                    .map_err(|_| ScopedError::Unavailable)?
                    .epoch
                    != epoch
                {
                    return Err(ScopedError::ResyncRequired);
                }
                return Ok(value);
            }
            let flight = flight.ok_or(ScopedError::Unavailable)?;
            if !leader {
                let notified = flight.notify.notified();
                tokio::pin!(notified);
                let _ = notified.as_mut().enable();
                if !flight.done.load(AtomicOrdering::Acquire) {
                    timeout_at(deadline, notified)
                        .await
                        .map_err(|_| ScopedError::Timeout)?;
                }
                continue;
            }
            let _guard = FlightGuard {
                state: Arc::clone(&self.state),
                key: key.clone(),
                flight,
            };
            let value = timeout_at(deadline, load())
                .await
                .map_err(|_| ScopedError::Timeout)??;
            request.check()?;
            if value.len() > request.query.max_bytes || value.len() > self.limits.max_bytes {
                return Err(ScopedError::Bounds);
            }
            let value = Arc::new(value);
            let expires_at_ms = (request.clock)()
                .checked_add(i64::try_from(self.limits.ttl_ms).map_err(|_| ScopedError::Bounds)?)
                .ok_or(ScopedError::Bounds)?;
            let mut state = self.state.lock().map_err(|_| ScopedError::Unavailable)?;
            if state.epoch != epoch {
                return Err(ScopedError::ResyncRequired);
            }
            while state.entries.len() >= self.limits.max_entries
                || state.bytes + value.len() > self.limits.max_bytes
            {
                let oldest = state
                    .entries
                    .iter()
                    .min_by_key(|(_, entry)| entry.used)
                    .map(|(key, _)| key.clone())
                    .ok_or(ScopedError::Bounds)?;
                if let Some(entry) = state.entries.remove(&oldest) {
                    state.bytes -= entry.value.len();
                }
            }
            state.bytes += value.len();
            let used = state.tick;
            state.entries.insert(
                key,
                Entry {
                    value: Arc::clone(&value),
                    expires_at_ms,
                    used,
                },
            );
            return Ok(value);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChartPoint {
    pub at_ms: i64,
    pub value: ExactDecimal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DisplaySeries {
    pub method: &'static str,
    pub display_only: bool,
    pub coverage: Coverage,
    pub input_rows: usize,
    pub returned_rows: usize,
    pub points: Vec<ChartPoint>,
    pub raw_continuation: Option<String>,
}

/// Exact lexeme ordering without fixed precision, floating conversion or value
/// rounding. Input has the shared 128-byte plain decimal contract.
/// # Errors
/// Rejects noncanonical/exponent/nonfinite values instead of coercing them.
pub fn compare_decimal_lexemes(left: &str, right: &str) -> Result<Ordering, ScopedError> {
    fn parts(value: &str) -> (bool, &str, &str) {
        let unsigned = value.strip_prefix('-').unwrap_or(value);
        let (whole, fraction) = unsigned.split_once('.').unwrap_or((unsigned, ""));
        let fraction = fraction.trim_end_matches('0');
        (
            value.starts_with('-') && (whole != "0" || !fraction.is_empty()),
            whole,
            fraction,
        )
    }
    ExactDecimal::parse(left).map_err(|_| ScopedError::Invalid)?;
    ExactDecimal::parse(right).map_err(|_| ScopedError::Invalid)?;
    let (negative_l, whole_l, fraction_l) = parts(left);
    let (negative_r, whole_r, fraction_r) = parts(right);
    if negative_l != negative_r {
        return Ok(if negative_l {
            Ordering::Less
        } else {
            Ordering::Greater
        });
    }
    let magnitude = whole_l
        .len()
        .cmp(&whole_r.len())
        .then_with(|| whole_l.cmp(whole_r))
        .then_with(|| fraction_l.cmp(fraction_r));
    Ok(if negative_l {
        magnitude.reverse()
    } else {
        magnitude
    })
}

/// A bounded display-only, deterministic min/max bucket view of one already
/// authorized, same-unit canonical series page. No metric input is rewritten;
/// raw continuation and source coverage survive decimation unchanged.
/// # Errors
/// Rejects unsorted/unbounded points and unusable display limits.
pub fn display_min_max(
    points: &[ChartPoint],
    max_points: usize,
    coverage: Coverage,
    raw_continuation: Option<String>,
) -> Result<DisplaySeries, ScopedError> {
    if points.len() > 5_000 || !(4..=5_000).contains(&max_points) {
        return Err(ScopedError::Bounds);
    }
    bounded(&points, MAX_READ_BYTES)?;
    if let Some(cursor) = &raw_continuation {
        if cursor.is_empty() || cursor.len() > 4_096 || cursor.chars().any(char::is_control) {
            return Err(ScopedError::Invalid);
        }
    }
    for point in points {
        time(point.at_ms)?;
    }
    if points.windows(2).any(|pair| pair[0].at_ms >= pair[1].at_ms) {
        return Err(ScopedError::Integrity);
    }
    let mut selected = BTreeSet::new();
    if points.len() <= max_points {
        selected.extend(0..points.len());
    } else {
        selected.insert(0);
        selected.insert(points.len() - 1);
        let buckets = (max_points - 2) / 2;
        let interior = points.len() - 2;
        for bucket in 0..buckets {
            let start = 1 + bucket * interior / buckets;
            let end = 1 + (bucket + 1) * interior / buckets;
            let mut minimum = start;
            let mut maximum = start;
            for index in start + 1..end {
                if compare_decimal_lexemes(
                    points[index].value.as_str(),
                    points[minimum].value.as_str(),
                )? == Ordering::Less
                {
                    minimum = index;
                }
                if compare_decimal_lexemes(
                    points[index].value.as_str(),
                    points[maximum].value.as_str(),
                )? == Ordering::Greater
                {
                    maximum = index;
                }
            }
            selected.insert(minimum);
            selected.insert(maximum);
        }
    }
    let output: Vec<_> = selected
        .into_iter()
        .map(|index| points[index].clone())
        .collect();
    Ok(DisplaySeries {
        method: "BUCKET_MIN_MAX_DISPLAY_V1",
        display_only: true,
        coverage,
        input_rows: points.len(),
        returned_rows: output.len(),
        points: output,
        raw_continuation,
    })
}

fn time(value: i64) -> Result<(), ScopedError> {
    if !(0..=MAX_TIME_MS).contains(&value) {
        return Err(ScopedError::Invalid);
    }
    Ok(())
}
fn opaque(value: &str) -> Result<(), ScopedError> {
    if value.is_empty()
        || value.len() > 256
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(ScopedError::Invalid);
    }
    Ok(())
}
fn valid_digest(value: &str) -> Result<(), ScopedError> {
    let bytes = value.strip_prefix("sha256:").ok_or(ScopedError::Invalid)?;
    if bytes.len() != 64
        || !bytes
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ScopedError::Invalid);
    }
    Ok(())
}
fn hash(value: &impl Serialize) -> Result<String, ScopedError> {
    let body = serde_json::to_value(value).map_err(|_| ScopedError::Invalid)?;
    Ok(format!(
        "sha256:{}",
        hex::encode(Sha256::digest(body.to_string().as_bytes()))
    ))
}
struct BoundedWriter {
    used: usize,
    maximum: usize,
}
impl io::Write for BoundedWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        let count = self
            .used
            .checked_add(buffer.len())
            .ok_or_else(|| io::Error::other("bounded"))?;
        if count > self.maximum {
            return Err(io::Error::other("bounded"));
        }
        self.used = count;
        Ok(buffer.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn bounded(value: &(impl Serialize + ?Sized), maximum: usize) -> Result<(), ScopedError> {
    serde_json::to_writer(BoundedWriter { used: 0, maximum }, value)
        .map_err(|_| ScopedError::Bounds)
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod resource_tests {
    use projection_core::resources::EnvelopeLimits;

    use super::*;

    fn resources(max_entries: usize, max_bytes: usize) -> Arc<ResourceEnvelope> {
        Arc::new(
            ResourceEnvelope::new(EnvelopeLimits {
                max_active: 3,
                foreground_reserved: 1,
                foreground_reserved_entries: 2,
                foreground_reserved_bytes: 100,
                max_entries,
                max_bytes,
                storage_max_age: Duration::from_secs(5),
            })
            .unwrap(),
        )
    }

    fn limits() -> CacheLimits {
        CacheLimits {
            max_entries: 2,
            max_bytes: 400,
            max_flights: 2,
            ttl_ms: 100,
            load_timeout_ms: 100,
        }
    }

    #[test]
    fn cache_configured_entries_are_shared_and_clone_drop_is_exact() {
        let resources = resources(10, 2000);
        let first = ScopedCache::new_with_resources(limits(), &resources).unwrap();
        let cloned = first.clone();
        let second = ScopedCache::new_with_resources(limits(), &resources).unwrap();
        assert!(matches!(
            ScopedCache::new_with_resources(limits(), &resources),
            Err(ScopedError::Busy)
        ));
        assert_eq!(resources.stats().unwrap().active, 0);
        assert_eq!(resources.stats().unwrap().entries, 8);
        drop(first);
        assert_eq!(resources.stats().unwrap().entries, 8);
        drop(cloned);
        assert_eq!(resources.stats().unwrap().entries, 4);
        drop(second);
        assert_eq!(resources.stats().unwrap().bytes, 0);
    }

    #[test]
    fn cache_byte_ceiling_failure_and_invalid_config_do_not_leak() {
        let resources = resources(20, 800);
        let first = ScopedCache::new_with_resources(limits(), &resources).unwrap();
        assert!(matches!(
            ScopedCache::new_with_resources(limits(), &resources),
            Err(ScopedError::Busy)
        ));
        let mut invalid = limits();
        invalid.max_flights = 0;
        assert!(ScopedCache::new_with_resources(invalid, &resources).is_err());
        assert_eq!(resources.stats().unwrap().bytes, 400);
        drop(first);
        assert_eq!(resources.stats().unwrap().entries, 0);
        // The compatible constructor is intentionally not a governed allocation.
        drop(ScopedCache::new(limits()).unwrap());
        assert_eq!(resources.stats().unwrap().registrations, 1);
    }
}
