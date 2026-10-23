//! Versioned executable query/history/export/notification composition.
//! No source traffic is caused by a browser read or subscription. A commissioned
//! owner supplies the actual async current-policy provider; missing authority
//! stays denied. The server snapshot used by SQL is rechecked asynchronously
//! after I/O and serialized response construction, never cached as a grant.

use std::{
    collections::BTreeMap,
    convert::Infallible,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, Weak,
    },
    time::Duration,
};

use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::get,
    Json, Router,
};
use futures_util::stream;
use projection_core::resources::ResourceEnvelope;
use projection_store_pg::{
    scoped_read::{
        PgScopedReplaySource, ReadClock, ReadError, ReadLimits, ScopedReadService, SystemReadClock,
    },
    PgProjectionStore,
};
use query_api::{
    scoped::{CacheLimits, Operation, ReadQuery, ScopedCache, ScopedError},
    CursorCodec,
};
use realtime_sse::scoped::{
    ScopedDelivery, ScopedRealtimeConfig, ScopedRealtimeHub, ScopedSubscription,
};
use serde::Deserialize;
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::{timeout, Instant},
};

use crate::{
    projection_resources::{ProjectionResourceError, ProjectionResources},
    scoped_policy::{CurrentPolicy, ResolvedPolicy},
};

pub const ROUTE_PREFIX: &str = "/internal/v2/scoped";

/// Explicit bounded service configuration, not production sizing defaults.
#[derive(Clone, Copy)]
pub struct BackendLimits {
    pub read: ReadLimits,
    pub cache: CacheLimits,
    pub realtime: ScopedRealtimeConfig,
    pub maximum_requests: usize,
    pub maximum_streams: usize,
    pub maximum_cohorts: usize,
    pub policy_timeout: Duration,
    pub stream_check_interval: Duration,
    pub maximum_stream_lifetime: Duration,
    pub storage_refresh_interval: Duration,
}

impl BackendLimits {
    /// # Errors
    /// Refuses absent/unbounded ceilings before connecting or starting tasks.
    pub fn validate(self) -> Result<(), ScopedError> {
        self.read.validate().map_err(|_| ScopedError::Bounds)?;
        self.cache.validate()?;
        if !(1..=256).contains(&self.maximum_requests)
            || self.maximum_streams == 0
            || self.maximum_streams >= self.maximum_requests
            || !(1..=256).contains(&self.maximum_cohorts)
            || self.policy_timeout.is_zero()
            || self.policy_timeout > Duration::from_secs(5)
            || self.stream_check_interval.is_zero()
            || self.stream_check_interval > Duration::from_secs(5)
            || self.maximum_stream_lifetime < self.stream_check_interval
            || self.maximum_stream_lifetime > Duration::from_secs(300)
            || self.storage_refresh_interval.is_zero()
            || self.storage_refresh_interval > Duration::from_secs(60)
        {
            return Err(ScopedError::Bounds);
        }
        // Validate the complete realtime limits without manufacturing a scope.
        self.realtime
            .validate_bounds()
            .map_err(|_| ScopedError::Bounds)?;
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error(transparent)]
    Resource(#[from] ProjectionResourceError),
    #[error(transparent)]
    Scope(#[from] ScopedError),
}

struct Inner {
    store: Arc<PgProjectionStore>,
    policy: Arc<dyn CurrentPolicy>,
    clock: Arc<dyn ReadClock>,
    codec: CursorCodec,
    limits: BackendLimits,
    resources: Arc<ResourceEnvelope>,
    cache: ScopedCache,
    requests: Arc<Semaphore>,
    streams: Arc<Semaphore>,
    cohorts: Mutex<BTreeMap<String, Weak<Cohort>>>,
}

struct Cohort {
    hub: ScopedRealtimeHub,
    members: Mutex<Vec<Weak<ResolvedPolicy>>>,
    failed: AtomicBool,
    generation: String,
}

/// Keep the service/router alive for the lifetime of its tasks. Dropping all
/// owners releases weak worker loops and queue registrations; no detached strong
/// reference keeps a source/pool alive forever. No migrations run here.
#[derive(Clone)]
pub struct ScopedBackend(Arc<Inner>);

/// Private mTLS entrypoint for a composition with an actual authority adapter.
/// `tls` must use the caller's reviewed client-certificate verifier. This starts
/// no operational service by itself and makes no health-only acceptance claim.
/// # Errors
/// Returns listener/TLS serving failures; no grant/source is inferred or retried.
pub async fn serve(
    backend: ScopedBackend,
    bind: std::net::SocketAddr,
    tls: axum_server::tls_rustls::RustlsConfig,
    shutdown: impl std::future::Future<Output = ()> + Send,
) -> std::io::Result<()> {
    let handle = axum_server::Handle::new();
    let server = axum_server::bind_rustls(bind, tls)
        .handle(handle.clone())
        .serve(backend.router().into_make_service());
    tokio::pin!(server);
    tokio::pin!(shutdown);
    tokio::select! {
        result = &mut server => result,
        () = &mut shutdown => {
            handle.graceful_shutdown(Some(Duration::from_secs(5)));
            server.await
        }
    }
}

/// Owning published financial source, assembled once per process, not per tab.
/// Its proof/ACK authority is a required commissioned dependency, never minted
/// by this service. All source definitions/placement remain explicit.
pub struct FinancialSource {
    pub http: ts_transport::report_publication_http::ReportPublicationHttpClient,
    pub binding: authoritative_event_core::bootstrap::Binding,
    pub limits: authoritative_event_core::bootstrap::Limits,
    pub bindings: BTreeMap<String, maximum_data_adapter::financial_report::FinancialBinding>,
    pub authority: Arc<dyn crate::scoped_worker::FinancialSourceAuthority>,
    pub start: crate::scoped_worker::WorkerStart,
    pub worker_limits: crate::scoped_worker::WorkerLimits,
}

/// Complete listener + one source worker lifecycle. Server shutdown first stops
/// new reads, then drains the worker at its bounded operation/COMMIT boundary.
/// A terminal worker failure closes the listener rather than silently advertising
/// a live source. No command, runtime grant, migration or traffic is enabled.
/// # Errors
/// Invalid source assembly, listener failure or terminal worker state.
pub async fn serve_with_financial_source(
    backend: ScopedBackend,
    source: FinancialSource,
    bind: std::net::SocketAddr,
    tls: axum_server::tls_rustls::RustlsConfig,
    shutdown: impl std::future::Future<Output = ()> + Send,
) -> std::io::Result<()> {
    // Finite logical wire/candidate reservation, NOT allocator/RSS accounting.
    // Covers one response and its validation/staging copies; never per browser.
    if source.bindings.is_empty() || source.bindings.len() > 4096 {
        return Err(std::io::Error::other("FINANCIAL_SOURCE_ASSEMBLY_INVALID"));
    }
    let _source_charge = backend
        .0
        .resources
        .try_register(
            source.bindings.len(),
            ts_transport::report_publication_wire::MAX_WIRE_BYTES * 4,
        )
        .map_err(|_| std::io::Error::other("FINANCIAL_SOURCE_CAPACITY_BUSY"))?;
    let projection = crate::financial_projection::FinancialProjection::new(
        &source.http,
        &backend.0.store,
        source.binding,
        source.limits,
        &source.bindings,
        backend.0.clock.as_ref(),
    )
    .map_err(|_| std::io::Error::other("FINANCIAL_SOURCE_ASSEMBLY_INVALID"))?;
    let mut worker = crate::scoped_worker::FinancialSourceWorker::new(
        projection,
        source.authority.as_ref(),
        source.start,
        source.worker_limits,
    )
    .map_err(|_| std::io::Error::other("FINANCIAL_SOURCE_ASSEMBLY_INVALID"))?;
    let (stop, receiver) = tokio::sync::watch::channel(false);
    let handle = axum_server::Handle::new();
    let server = axum_server::bind_rustls(bind, tls)
        .handle(handle.clone())
        .serve(backend.router().into_make_service());
    let work = worker.run(receiver);
    tokio::pin!(server, work, shutdown);
    tokio::select! {
        result=&mut server=>{let _=stop.send(true);let _=work.await;result},
        _=&mut work=>{
            handle.graceful_shutdown(Some(Duration::from_secs(5)));
            let _=server.await;
            Err(std::io::Error::other("FINANCIAL_SOURCE_WORKER_STOPPED"))
        },
        ()=&mut shutdown=>{
            handle.graceful_shutdown(Some(Duration::from_secs(5)));
            let _=stop.send(true);
            let result=server.await;
            let _=work.await;
            result
        }
    }
}

impl ScopedBackend {
    /// Connects one governed pool, one cache and bounded shared cohort registry.
    /// Policy must be the actual commissioned authority, never a browser scope.
    /// # Errors
    /// Refuses invalid budgets/storage/connectivity; does not migrate any DB.
    pub async fn connect(
        factory: ProjectionResources,
        database_url: &str,
        policy: Arc<dyn CurrentPolicy>,
        codec: CursorCodec,
        limits: BackendLimits,
    ) -> Result<Self, BackendError> {
        limits.validate()?;
        let store = Arc::new(factory.connect(database_url).await?);
        let backend = Self::assemble(
            store,
            Arc::clone(factory.resources()),
            policy,
            codec,
            limits,
            Arc::new(SystemReadClock),
        )?;
        let weak = Arc::downgrade(&backend.0);
        let factory = Arc::new(factory);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(limits.storage_refresh_interval).await;
                if weak.upgrade().is_none() {
                    break;
                }
                let next = Arc::clone(&factory);
                // Small bounded file reads stay off the async reactor.
                if !matches!(
                    tokio::task::spawn_blocking(move || next.refresh_storage()).await,
                    Ok(Ok(()))
                ) {
                    tracing::warn!(
                        code = "SCOPED_STORAGE_REFRESH_FAILED",
                        "writes remain fail-closed when storage evidence expires"
                    );
                }
            }
        });
        Ok(backend)
    }

    pub(crate) fn assemble(
        store: Arc<PgProjectionStore>,
        resources: Arc<ResourceEnvelope>,
        policy: Arc<dyn CurrentPolicy>,
        codec: CursorCodec,
        limits: BackendLimits,
        clock: Arc<dyn ReadClock>,
    ) -> Result<Self, BackendError> {
        limits.validate()?;
        store
            .require_resource_governance()
            .map_err(ProjectionResourceError::from)?;
        let cache = ScopedCache::new_with_resources(limits.cache, &resources)?;
        Ok(Self(Arc::new(Inner {
            store,
            policy,
            clock,
            codec,
            limits,
            resources,
            cache,
            requests: Arc::new(Semaphore::new(limits.maximum_requests)),
            streams: Arc::new(Semaphore::new(limits.maximum_streams)),
            cohorts: Mutex::new(BTreeMap::new()),
        })))
    }

    /// Actual bounded handlers, not legacy Manager/realtime wire aliases.
    pub fn router(&self) -> Router {
        routes().with_state(self.clone())
    }

    fn service<'a>(&'a self, resolved: &'a ResolvedPolicy) -> ScopedReadService<'a> {
        ScopedReadService {
            store: &self.0.store,
            authorizer: resolved,
            clock: self.0.clock.as_ref(),
            codec: &self.0.codec,
            limits: self.0.limits.read,
        }
    }

    async fn resolve(
        &self,
        headers: &HeaderMap,
        resource: &str,
        op: Operation,
    ) -> Result<ResolvedPolicy, ScopedError> {
        valid_resource(resource)?;
        let credential = credential(headers)?;
        let resolved = timeout(
            self.0.limits.policy_timeout,
            self.0
                .policy
                .resolve(credential, resource, op, self.0.clock.now_ms()),
        )
        .await
        .map_err(|_| ScopedError::Timeout)??;
        if resolved.operation() != op {
            return Err(ScopedError::AccessDenied);
        }
        self.recheck(&resolved).await?;
        Ok(resolved)
    }

    async fn recheck(&self, resolved: &ResolvedPolicy) -> Result<(), ScopedError> {
        timeout(
            self.0.limits.policy_timeout,
            self.0.policy.recheck(resolved, self.0.clock.now_ms()),
        )
        .await
        .map_err(|_| ScopedError::Timeout)?
    }

    async fn page(
        &self,
        headers: &HeaderMap,
        resource: &str,
        op: Operation,
        params: PageRequest,
    ) -> Result<Response, ApiError> {
        let _permit = Arc::clone(&self.0.requests)
            .try_acquire_owned()
            .map_err(|_| ScopedError::Busy)?;
        let resolved = self.resolve(headers, resource, op).await?;
        let read = resolved.authorize(self.0.clock.now_ms())?;
        let query = params.query(op);
        query.validate(resolved.scope())?;
        self.recheck(&resolved).await?;
        let service = self.service(&resolved);
        let bytes = if op == Operation::Current && params.cursor.is_none() {
            service
                .cached_first_page(&self.0.cache, &read, &query)
                .await?
                .as_ref()
                .clone()
        } else {
            serde_json::to_vec(
                &service
                    .page(&read, &query, params.cursor.as_deref())
                    .await?,
            )
            .map_err(|_| ScopedError::Integrity)?
        };
        // Store's SQL byte cap includes payload plus metadata reserve. Enforce
        // the full serialized envelope again, never return oversized metadata.
        if bytes.len() > params.max_bytes {
            return Err(ScopedError::Bounds.into());
        }
        self.recheck(&resolved).await?;
        Ok((
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "application/json"),
                (header::CACHE_CONTROL, "no-store"),
            ],
            bytes,
        )
            .into_response())
    }
}

fn routes() -> Router<ScopedBackend> {
    Router::new()
        .route("/internal/v2/scoped/:resource/query", get(current))
        .route("/internal/v2/scoped/:resource/history", get(history))
        .route("/internal/v2/scoped/:resource/export", get(export))
        .route("/internal/v2/scoped/:resource/stream", get(notifications))
        .layer(axum::middleware::from_fn(bounded_uri))
}

async fn bounded_uri(request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    if request.uri().to_string().len() > 8192 {
        return ApiError::from(ScopedError::Bounds).into_response();
    }
    next.run(request).await
}

/// Mounted by the existing binary until an actual provider is commissioned.
/// Explicit unavailability, no implicit accepting default and no DB connection.
pub fn uncommissioned_router() -> Router {
    Router::new()
        .route("/internal/v2/scoped/:resource/query", get(uncommissioned))
        .route("/internal/v2/scoped/:resource/history", get(uncommissioned))
        .route("/internal/v2/scoped/:resource/export", get(uncommissioned))
        .route("/internal/v2/scoped/:resource/stream", get(uncommissioned))
}

async fn uncommissioned() -> Response {
    safe_error(
        StatusCode::SERVICE_UNAVAILABLE,
        "CURRENT_POLICY_PROVIDER_NOT_COMMISSIONED",
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PageRequest {
    limit: usize,
    max_bytes: usize,
    entity_id: Option<String>,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    cursor: Option<String>,
}
impl PageRequest {
    fn query(&self, operation: Operation) -> ReadQuery {
        ReadQuery {
            operation,
            limit: self.limit,
            max_bytes: self.max_bytes,
            entity_id: self.entity_id.clone(),
            from_ms: self.from_ms,
            to_ms: self.to_ms,
        }
    }
}

async fn current(
    State(backend): State<ScopedBackend>,
    Path(resource): Path<String>,
    headers: HeaderMap,
    params: Result<Query<PageRequest>, axum::extract::rejection::QueryRejection>,
) -> Response {
    page_handler(backend, resource, headers, params, Operation::Current).await
}
async fn history(
    State(backend): State<ScopedBackend>,
    Path(resource): Path<String>,
    headers: HeaderMap,
    params: Result<Query<PageRequest>, axum::extract::rejection::QueryRejection>,
) -> Response {
    page_handler(backend, resource, headers, params, Operation::History).await
}
async fn export(
    State(backend): State<ScopedBackend>,
    Path(resource): Path<String>,
    headers: HeaderMap,
    params: Result<Query<PageRequest>, axum::extract::rejection::QueryRejection>,
) -> Response {
    page_handler(backend, resource, headers, params, Operation::Export).await
}
async fn page_handler(
    backend: ScopedBackend,
    resource: String,
    headers: HeaderMap,
    params: Result<Query<PageRequest>, axum::extract::rejection::QueryRejection>,
    op: Operation,
) -> Response {
    let Ok(Query(params)) = params else {
        return ApiError::from(ScopedError::Invalid).into_response();
    };
    backend
        .page(&headers, &resource, op, params)
        .await
        .unwrap_or_else(IntoResponse::into_response)
}

fn valid_resource(value: &str) -> Result<(), ScopedError> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err(ScopedError::AccessDenied);
    }
    Ok(())
}
fn credential(headers: &HeaderMap) -> Result<&str, ScopedError> {
    if headers.get_all(header::AUTHORIZATION).iter().count() != 1 {
        return Err(ScopedError::AccessDenied);
    }
    let raw = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or(ScopedError::AccessDenied)?;
    let token = raw
        .strip_prefix("Bearer ")
        .ok_or(ScopedError::AccessDenied)?;
    if token.is_empty()
        || token.len() > 16 * 1024
        || token
            .bytes()
            .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
    {
        return Err(ScopedError::AccessDenied);
    }
    Ok(token)
}

struct ApiError(ScopedError);
impl From<ScopedError> for ApiError {
    fn from(value: ScopedError) -> Self {
        Self(value)
    }
}
impl From<ReadError> for ApiError {
    fn from(value: ReadError) -> Self {
        Self(match value {
            ReadError::Scope(e) => e,
            ReadError::Resync => ScopedError::ResyncRequired,
            ReadError::Bounds => ScopedError::Bounds,
            ReadError::Busy | ReadError::Resource(_) => ScopedError::Busy,
            ReadError::Deadline => ScopedError::Timeout,
            ReadError::Database(_) | ReadError::Integrity => ScopedError::Unavailable,
        })
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self.0 {
            ScopedError::AccessDenied => StatusCode::FORBIDDEN,
            ScopedError::Invalid | ScopedError::Bounds => StatusCode::BAD_REQUEST,
            ScopedError::ResyncRequired => StatusCode::CONFLICT,
            ScopedError::TypedUnavailable => StatusCode::UNPROCESSABLE_ENTITY,
            ScopedError::Busy => StatusCode::TOO_MANY_REQUESTS,
            ScopedError::Timeout | ScopedError::Unavailable | ScopedError::Integrity => {
                StatusCode::SERVICE_UNAVAILABLE
            }
        };
        safe_error(status, &self.0.to_string())
    }
}
fn safe_error(status: StatusCode, code: &str) -> Response {
    (
        status,
        [(header::CACHE_CONTROL, "no-store")],
        Json(serde_json::json!({"schema_version":"execution.scoped-error.v1","code":code})),
    )
        .into_response()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StreamRequest {
    cursor: Option<String>,
}

async fn notifications(
    State(backend): State<ScopedBackend>,
    Path(resource): Path<String>,
    headers: HeaderMap,
    params: Result<Query<StreamRequest>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let Ok(Query(params)) = params else {
        return ApiError::from(ScopedError::Invalid).into_response();
    };
    match backend.open_stream(&headers, &resource, params).await {
        Ok(response) => response,
        Err(error) => error.into_response(),
    }
}

struct StreamState {
    backend: ScopedBackend,
    cohort: Arc<Cohort>,
    resolved: Arc<ResolvedPolicy>,
    subscription: ScopedSubscription,
    replay: std::collections::VecDeque<realtime_sse::scoped::ChangeNotice>,
    replay_cursor: Option<String>,
    catch_up: bool,
    deadline: Instant,
    _permit: OwnedSemaphorePermit,
    // Reserve the maximum bounded reconnect batch as well as live hub queues.
    _replay_charge: projection_core::resources::ResourceLease,
}

impl ScopedBackend {
    async fn open_stream(
        &self,
        headers: &HeaderMap,
        resource: &str,
        params: StreamRequest,
    ) -> Result<Response, ApiError> {
        let _request_permit = Arc::clone(&self.0.requests)
            .try_acquire_owned()
            .map_err(|_| ScopedError::Busy)?;
        let permit = Arc::clone(&self.0.streams)
            .try_acquire_owned()
            .map_err(|_| ScopedError::Busy)?;
        let replay_charge = self
            .0
            .resources
            .try_register(
                self.0.limits.realtime.notices_per_poll,
                realtime_sse::scoped::MAX_NOTICE_BATCH_BYTES,
            )
            .map_err(|_| ScopedError::Busy)?;
        let resolved = Arc::new(self.resolve(headers, resource, Operation::Replay).await?);
        let read = resolved.authorize(self.0.clock.now_ms())?;
        let generation = self.service(&resolved).replay_generation(&read).await?;
        self.recheck(&resolved).await?;
        let initial = self
            .service(&resolved)
            .notices(
                &read,
                params.cursor.as_deref(),
                self.0.limits.realtime.notices_per_poll,
            )
            .await?;
        self.recheck(&resolved).await?;
        if self.service(&resolved).replay_generation(&read).await? != generation {
            return Err(ScopedError::ResyncRequired.into());
        }
        if initial
            .notices
            .iter()
            .any(|notice| notice.projection_generation != generation)
        {
            return Err(ScopedError::ResyncRequired.into());
        }
        let key = format!("{}:{generation}", resolved.scope().digest()?);
        let (cohort, new) =
            self.cohort(&key, &resolved, generation, initial.next_cursor.clone())?;
        let subscription = cohort
            .hub
            .subscribe(resolved.as_ref(), self.0.clock.now_ms())
            .map_err(|_| ScopedError::Busy)?;
        {
            let mut members = cohort
                .members
                .lock()
                .map_err(|_| ScopedError::Unavailable)?;
            members.retain(|member| member.strong_count() > 0);
            members.push(Arc::downgrade(&resolved));
        }
        // Start before the next await: a simultaneous subscriber cannot adopt
        // a cohort whose creator later cancels before starting its coordinator.
        if new {
            self.spawn_coordinator(&cohort);
        }
        // Reconnect catch-up resumes the exact initial durable cursor AFTER
        // subscription. Thus a commit between scan and subscribe is not lost.
        // Concurrent duplicates are notification-only refetch hints.
        self.recheck(&resolved).await?;
        let state = StreamState {
            backend: self.clone(),
            cohort,
            resolved,
            subscription,
            replay: initial.notices.into(),
            replay_cursor: initial.next_cursor,
            catch_up: true,
            deadline: Instant::now() + self.0.limits.maximum_stream_lifetime,
            _permit: permit,
            _replay_charge: replay_charge,
        };
        Ok(stream_response(state))
    }
}

fn stream_response(state: StreamState) -> Response {
    let output = stream::unfold(state, |mut state| async move {
        loop {
            if Instant::now() >= state.deadline
                || state.cohort.failed.load(Ordering::SeqCst)
                || state.backend.recheck(&state.resolved).await.is_err()
            {
                return None;
            }
            if state.replay.is_empty() && state.catch_up {
                let Ok(read) = state.resolved.authorize(state.backend.0.clock.now_ms()) else {
                    return None;
                };
                let batch = state
                    .backend
                    .service(&state.resolved)
                    .notices(
                        &read,
                        state.replay_cursor.as_deref(),
                        state.backend.0.limits.realtime.notices_per_poll,
                    )
                    .await
                    .ok()?;
                if state.backend.recheck(&state.resolved).await.is_err()
                    || batch
                        .notices
                        .iter()
                        .any(|n| n.projection_generation != state.cohort.generation)
                {
                    return None;
                }
                state.replay_cursor = batch.next_cursor;
                state.catch_up = !batch.caught_up;
                state.replay.extend(batch.notices);
                if state.replay.is_empty() && state.catch_up {
                    tokio::time::sleep(state.backend.0.limits.stream_check_interval).await;
                    continue;
                }
            }
            let notice = if let Some(notice) = state.replay.pop_front() {
                Some(notice)
            } else {
                match state
                    .subscription
                    .next(state.resolved.as_ref(), state.backend.0.clock.now_ms())
                {
                    Ok(ScopedDelivery::Notice(value)) => Some((*value).clone()),
                    Ok(ScopedDelivery::Idle) => None,
                    _ => return None,
                }
            };
            let event = if let Some(notice) = notice {
                match Event::default()
                    .event("projection-changed")
                    .id(&notice.resume_cursor)
                    .json_data(notice)
                {
                    Ok(event) => event,
                    Err(_) => return None,
                }
            } else {
                tokio::time::sleep(state.backend.0.limits.stream_check_interval).await;
                Event::default().comment("notification-only")
            };
            // Fresh authority after serialization/sleep, before EACH frame.
            if state.backend.recheck(&state.resolved).await.is_err()
                || state.cohort.failed.load(Ordering::SeqCst)
                || Instant::now() >= state.deadline
            {
                return None;
            }
            return Some((Ok::<_, Infallible>(event), state));
        }
    });
    ([(header::CACHE_CONTROL, "no-store")], Sse::new(output)).into_response()
}

impl ScopedBackend {
    fn cohort(
        &self,
        key: &str,
        resolved: &ResolvedPolicy,
        generation: String,
        initial_cursor: Option<String>,
    ) -> Result<(Arc<Cohort>, bool), ApiError> {
        let mut registry = self
            .0
            .cohorts
            .lock()
            .map_err(|_| ScopedError::Unavailable)?;
        registry.retain(|_, entry| entry.strong_count() > 0);
        if let Some(current) = registry.get(key).and_then(Weak::upgrade) {
            return Ok((current, false));
        }
        if registry.len() >= self.0.limits.maximum_cohorts {
            return Err(ScopedError::Busy.into());
        }
        let hub = ScopedRealtimeHub::new_with_resources(
            resolved.scope().clone(),
            generation.clone(),
            initial_cursor,
            self.0.limits.realtime,
            resolved,
            self.0.clock.now_ms(),
            &self.0.resources,
        )
        .map_err(|_| ScopedError::Busy)?;
        let cohort = Arc::new(Cohort {
            hub,
            members: Mutex::new(Vec::new()),
            failed: AtomicBool::new(false),
            generation,
        });
        registry.insert(key.to_owned(), Arc::downgrade(&cohort));
        Ok((cohort, true))
    }

    fn spawn_coordinator(&self, cohort: &Arc<Cohort>) {
        let weak_backend = Arc::downgrade(&self.0);
        let weak_cohort = Arc::downgrade(cohort);
        tokio::spawn(async move {
            loop {
                let (Some(inner), Some(cohort)) = (weak_backend.upgrade(), weak_cohort.upgrade())
                else {
                    break;
                };
                if !cohort.hub.metrics().is_ok_and(|m| m.clients > 0) {
                    break;
                }
                let backend = ScopedBackend(inner);
                let members = cohort
                    .members
                    .lock()
                    .map(|mut members| {
                        members.retain(|member| member.strong_count() > 0);
                        members.iter().filter_map(Weak::upgrade).collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                // A cohort is NOT owned by its first subscriber's session.
                // Choose a currently valid original context from live members.
                // The entire selection is bounded, not N sequential timeouts.
                let representative = timeout(backend.0.limits.policy_timeout, async {
                    let mut remaining = members;
                    while let Some(member) = remaining.pop() {
                        if backend.recheck(&member).await.is_ok() {
                            return Some(member);
                        }
                    }
                    None
                })
                .await
                .ok()
                .flatten();
                if let Some(resolved) = representative {
                    let authorizer: Arc<dyn query_api::scoped::ReadAuthorizer> = resolved.clone();
                    let source = PgScopedReplaySource {
                        store: Arc::clone(&backend.0.store),
                        authorizer,
                        clock: Arc::clone(&backend.0.clock),
                        codec: backend.0.codec.clone(),
                        limits: backend.0.limits.read,
                    };
                    let result = async {
                        cohort
                            .hub
                            .poll(&source, resolved.as_ref(), backend.0.clock.now_ms())
                            .await
                            .map_err(|_| ScopedError::Unavailable)?;
                        backend.recheck(&resolved).await
                    }
                    .await;
                    // A concurrent session revoke does not poison equivalent
                    // peers. Each frame still rechecks its OWN original context.
                    if result.is_err() && backend.recheck(&resolved).await.is_ok() {
                        cohort.failed.store(true, Ordering::SeqCst);
                        break;
                    }
                }
                let cadence =
                    Duration::from_millis(u64::from(backend.0.limits.realtime.poll_interval_ms));
                drop(cohort);
                drop(backend);
                tokio::time::sleep(cadence).await;
            }
        });
    }
}

#[cfg(test)]
mod tests;
