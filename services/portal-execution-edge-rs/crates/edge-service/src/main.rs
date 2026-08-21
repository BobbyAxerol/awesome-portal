#![forbid(unsafe_code)]

use std::{
    collections::VecDeque,
    convert::Infallible,
    env, fs,
    io::BufReader,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Once},
    time::Duration,
};

use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap, HeaderValue, StatusCode},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::get,
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use chrono::Utc;
use edge_auth::{DelegatedClaims, DelegationVerifier, RequiredRead};
use execution_contracts::{
    CanonicalId, CapabilitySnapshot, CapabilityState, ExecutionReadCapability,
};
use futures_util::stream;
use projection_core::{resume_decision, ProjectionCursor, ProjectionScope, ResumeDecision};
use projection_store_pg::{PgProjectionStore, RealtimeJournalRecord, RealtimeScopeAvailability};
use realtime_sse::{
    GapEnvelope, GapReason, RealtimeEnvelope, RealtimeHub, RealtimeSubscription,
    SubscriptionDelivery, COMMAND_CENTER_RESOURCE, REALTIME_SCHEMA_VERSION,
};
use rustls::{
    pki_types::{CertificateDer, PrivateKeyDer},
    server::{danger::ClientCertVerifier, WebPkiClientVerifier},
    RootCertStore, ServerConfig,
};
use serde::Serialize;
use thiserror::Error;
use tokio::{
    io::{AsyncReadExt as _, AsyncWriteExt as _},
    net::TcpStream,
    sync::RwLock,
};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use ts_transport::{
    BoundedSourceClient, CapabilityNegotiator, SourceTransportConfig, TransportLimits,
};

const MAX_SECRET_FILE_BYTES: u64 = 1024 * 1024;

#[derive(Clone)]
struct AppState {
    environment: String,
    verifier: DelegationVerifier,
    snapshot: Arc<RwLock<Option<CapabilitySnapshot>>>,
    projection_required: bool,
    projection_ready: Arc<RwLock<bool>>,
    projection_store: Option<PgProjectionStore>,
    realtime_hub: Option<RealtimeHub>,
    realtime_replay_limit: usize,
    realtime_heartbeat: Duration,
    realtime_epoch_jitter: Duration,
}

#[derive(Debug)]
struct EdgeConfig {
    bind_address: SocketAddr,
    health_bind_address: SocketAddr,
    environment: String,
    tls_certificate_file: PathBuf,
    tls_private_key_file: PathBuf,
    tls_client_ca_file: PathBuf,
    delegation_jwks_file: PathBuf,
    delegation_issuer: String,
    delegation_audience: String,
    delegation_maximum_ttl_seconds: i64,
    source_origin: String,
    source_ca_file: PathBuf,
    source_client_identity_file: Option<PathBuf>,
    source_api_key_file: Option<PathBuf>,
    source_gateway_digest: String,
    probe_alpha_id: Option<String>,
    probe_interval: Duration,
    transport_limits: TransportLimits,
    projection_ingestion_enabled: bool,
    projection_database_url_file: Option<PathBuf>,
    realtime_sse_enabled: bool,
    realtime_queue_capacity: usize,
    realtime_replay_limit: usize,
    realtime_poll_interval: Duration,
    realtime_poll_batch: usize,
    realtime_heartbeat: Duration,
    realtime_epoch_jitter: Duration,
}

impl EdgeConfig {
    fn from_environment() -> Result<Self, ConfigError> {
        let environment = required("EDGE_ENVIRONMENT")?;
        if !matches!(environment.as_str(), "paper" | "sandbox" | "live") {
            return Err(ConfigError::Invalid("EDGE_ENVIRONMENT"));
        }
        let bind_address = value_or("EDGE_BIND_ADDRESS", "0.0.0.0:8443")
            .parse()
            .map_err(|_| ConfigError::Invalid("EDGE_BIND_ADDRESS"))?;
        let health_bind_address: SocketAddr =
            value_or("EDGE_HEALTH_BIND_ADDRESS", "127.0.0.1:9100")
                .parse()
                .map_err(|_| ConfigError::Invalid("EDGE_HEALTH_BIND_ADDRESS"))?;
        if !health_bind_address.ip().is_loopback() {
            return Err(ConfigError::Invalid("EDGE_HEALTH_BIND_ADDRESS"));
        }
        let probe_interval_seconds = bounded_usize("EDGE_PROBE_INTERVAL_SECONDS", 30, 5, 300)?;
        let projection_ingestion_enabled =
            strict_boolean("EDGE_PROJECTION_INGESTION_ENABLED", false)?;
        let realtime_sse_enabled = strict_boolean("EDGE_REALTIME_SSE_ENABLED", false)?;
        let projection_database_url_file = optional_path("EDGE_PROJECTION_DATABASE_URL_FILE");
        if (projection_ingestion_enabled || realtime_sse_enabled)
            && projection_database_url_file.is_none()
        {
            return Err(ConfigError::Missing("EDGE_PROJECTION_DATABASE_URL_FILE"));
        }
        Ok(Self {
            bind_address,
            health_bind_address,
            environment,
            tls_certificate_file: required_path("EDGE_TLS_CERTIFICATE_FILE")?,
            tls_private_key_file: required_path("EDGE_TLS_PRIVATE_KEY_FILE")?,
            tls_client_ca_file: required_path("EDGE_TLS_CLIENT_CA_FILE")?,
            delegation_jwks_file: required_path("EDGE_DELEGATION_JWKS_FILE")?,
            delegation_issuer: required("EDGE_DELEGATION_ISSUER")?,
            delegation_audience: required("EDGE_DELEGATION_AUDIENCE")?,
            delegation_maximum_ttl_seconds: bounded_i64(
                "EDGE_DELEGATION_MAXIMUM_TTL_SECONDS",
                60,
                1,
                60,
            )?,
            source_origin: required("EDGE_SOURCE_ORIGIN")?,
            source_ca_file: required_path("EDGE_SOURCE_CA_FILE")?,
            source_client_identity_file: optional_path("EDGE_SOURCE_CLIENT_IDENTITY_FILE"),
            source_api_key_file: optional_path("EDGE_SOURCE_API_KEY_FILE"),
            source_gateway_digest: required("EDGE_SOURCE_GATEWAY_DIGEST")?,
            probe_alpha_id: optional("EDGE_PROBE_ALPHA_ID"),
            probe_interval: Duration::from_secs(probe_interval_seconds as u64),
            transport_limits: transport_limits_from_environment()?,
            projection_ingestion_enabled,
            projection_database_url_file,
            realtime_sse_enabled,
            realtime_queue_capacity: bounded_usize("EDGE_REALTIME_QUEUE_CAPACITY", 256, 8, 4096)?,
            realtime_replay_limit: bounded_usize("EDGE_REALTIME_REPLAY_LIMIT", 1024, 1, 2048)?,
            realtime_poll_interval: Duration::from_millis(bounded_usize(
                "EDGE_REALTIME_POLL_INTERVAL_MS",
                100,
                25,
                5000,
            )? as u64),
            realtime_poll_batch: bounded_usize("EDGE_REALTIME_POLL_BATCH", 512, 1, 2048)?,
            realtime_heartbeat: Duration::from_secs(bounded_usize(
                "EDGE_REALTIME_HEARTBEAT_SECONDS",
                15,
                5,
                60,
            )? as u64),
            realtime_epoch_jitter: Duration::from_millis(bounded_usize(
                "EDGE_REALTIME_EPOCH_JITTER_MS",
                5000,
                0,
                30_000,
            )? as u64),
        })
    }
}

fn transport_limits_from_environment() -> Result<TransportLimits, ConfigError> {
    Ok(TransportLimits {
        connect_timeout: Duration::from_millis(bounded_usize(
            "EDGE_CONNECT_TIMEOUT_MS",
            2_000,
            100,
            5_000,
        )? as u64),
        request_timeout: Duration::from_millis(bounded_usize(
            "EDGE_REQUEST_TIMEOUT_MS",
            5_000,
            250,
            15_000,
        )? as u64),
        queue_timeout: Duration::from_millis(
            bounded_usize("EDGE_QUEUE_TIMEOUT_MS", 250, 10, 2_000)? as u64,
        ),
        retry_backoff: Duration::from_millis(
            bounded_usize("EDGE_RETRY_BACKOFF_MS", 100, 0, 1_000)? as u64,
        ),
        maximum_concurrency: bounded_usize("EDGE_MAXIMUM_CONCURRENCY", 32, 1, 128)?,
        maximum_response_bytes: bounded_usize(
            "EDGE_MAXIMUM_RESPONSE_BYTES",
            2 * 1024 * 1024,
            1_024,
            8 * 1024 * 1024,
        )?,
        maximum_retries: u8::try_from(bounded_usize("EDGE_MAXIMUM_RETRIES", 1, 0, 2)?)
            .map_err(|_| ConfigError::Invalid("EDGE_MAXIMUM_RETRIES"))?,
    })
}

#[tokio::main]
async fn main() -> Result<(), ServiceError> {
    ensure_crypto_provider();
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    match env::args().nth(1).as_deref() {
        Some("healthcheck") => healthcheck().await,
        Some("projection-check") => projection_check(false).await,
        Some("projection-migrate") => projection_check(true).await,
        Some("serve") | None => serve(EdgeConfig::from_environment()?).await,
        Some(_) => Err(ServiceError::UnsupportedCommand),
    }
}

async fn serve(config: EdgeConfig) -> Result<(), ServiceError> {
    let certificate = read_file(&config.tls_certificate_file)?;
    let private_key = read_file(&config.tls_private_key_file)?;
    let client_ca = read_file(&config.tls_client_ca_file)?;
    let jwks = read_text(&config.delegation_jwks_file)?;
    let source_ca = read_file(&config.source_ca_file)?;
    let source_identity = config
        .source_client_identity_file
        .as_deref()
        .map(read_file)
        .transpose()?;
    let source_api_key = config
        .source_api_key_file
        .as_deref()
        .map(read_text)
        .transpose()?;
    let projection_store = connect_projection_store(&config).await?;

    let verifier = DelegationVerifier::from_jwks_json(
        &jwks,
        &config.delegation_issuer,
        &config.delegation_audience,
        config.delegation_maximum_ttl_seconds,
        3,
    )?;
    let source_client = BoundedSourceClient::new(SourceTransportConfig {
        source_origin: &config.source_origin,
        root_ca_pem: &source_ca,
        client_identity_pem: source_identity.as_deref(),
        source_api_key: source_api_key.as_deref().map(str::trim),
        observed_gateway_digest: &config.source_gateway_digest,
        limits: config.transport_limits.clone(),
    })?;
    let negotiator = CapabilityNegotiator::new(source_client);
    let snapshot = Arc::new(RwLock::new(Some(
        negotiator.probe(config.probe_alpha_id.as_deref()).await,
    )));
    let projection_ready = Arc::new(RwLock::new(projection_store.is_some()));
    let realtime_hub = if config.realtime_sse_enabled {
        Some(RealtimeHub::new(config.realtime_queue_capacity)?)
    } else {
        None
    };
    let state = AppState {
        environment: config.environment.clone(),
        verifier,
        snapshot: Arc::clone(&snapshot),
        projection_required: config.projection_ingestion_enabled || config.realtime_sse_enabled,
        projection_ready: Arc::clone(&projection_ready),
        projection_store: projection_store.clone(),
        realtime_hub: realtime_hub.clone(),
        realtime_replay_limit: config.realtime_replay_limit,
        realtime_heartbeat: config.realtime_heartbeat,
        realtime_epoch_jitter: config.realtime_epoch_jitter,
    };

    spawn_background_tasks(
        &config,
        negotiator,
        snapshot,
        projection_store,
        projection_ready,
        realtime_hub,
    );

    let private_app = private_router(state.clone());
    let health_app = health_router(state);
    let tls = RustlsConfig::from_config(Arc::new(mtls_server_config(
        &certificate,
        &private_key,
        &client_ca,
    )?));
    info!(bind_address = %config.bind_address, "starting private execution edge");
    let private_server =
        axum_server::bind_rustls(config.bind_address, tls).serve(private_app.into_make_service());
    let health_listener = tokio::net::TcpListener::bind(config.health_bind_address).await?;
    let health_server = axum::serve(health_listener, health_app);
    tokio::select! {
        result = private_server => result.map_err(ServiceError::Server),
        result = health_server => result.map_err(ServiceError::Io),
        result = tokio::signal::ctrl_c() => {
            result.map_err(ServiceError::Io)?;
            info!("shutdown signal received");
            Ok(())
        }
    }
}

async fn connect_projection_store(
    config: &EdgeConfig,
) -> Result<Option<PgProjectionStore>, ServiceError> {
    if !config.projection_ingestion_enabled && !config.realtime_sse_enabled {
        return Ok(None);
    }
    let database_url_file = config
        .projection_database_url_file
        .as_deref()
        .ok_or(ConfigError::Missing("EDGE_PROJECTION_DATABASE_URL_FILE"))?;
    let database_url = read_text(database_url_file)?;
    let store = PgProjectionStore::connect(database_url.trim()).await?;
    store.ping().await?;
    Ok(Some(store))
}

fn spawn_background_tasks(
    config: &EdgeConfig,
    negotiator: CapabilityNegotiator,
    snapshot: Arc<RwLock<Option<CapabilitySnapshot>>>,
    projection_store: Option<PgProjectionStore>,
    projection_ready: Arc<RwLock<bool>>,
    realtime_hub: Option<RealtimeHub>,
) {
    let probe_alpha_id = config.probe_alpha_id.clone();
    let probe_interval = config.probe_interval;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(probe_interval);
        interval.tick().await;
        loop {
            interval.tick().await;
            let next = negotiator.probe(probe_alpha_id.as_deref()).await;
            *snapshot.write().await = Some(next);
        }
    });
    if let Some(store) = projection_store.clone() {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            interval.tick().await;
            loop {
                interval.tick().await;
                *projection_ready.write().await = store.ping().await.is_ok();
            }
        });
    }
    if let (Some(store), Some(hub)) = (projection_store, realtime_hub) {
        tokio::spawn(realtime_journal_poller(
            store,
            hub,
            config.realtime_poll_interval,
            config.realtime_poll_batch,
        ));
    }
}

fn private_router(state: AppState) -> Router {
    Router::new()
        .route("/internal/v1/compatibility", get(compatibility))
        .route("/internal/v1/realtime/stream", get(realtime_stream))
        .with_state(state)
}

fn health_router(state: AppState) -> Router {
    Router::new()
        .route("/livez", get(livez))
        .route("/readyz", get(readyz))
        .with_state(state)
}

async fn compatibility(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(token) = bearer(&headers) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if state
        .verifier
        .verify_read(
            token,
            &RequiredRead {
                environment: &state.environment,
                resource: None,
            },
        )
        .is_err()
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    match state.snapshot.read().await.clone() {
        Some(snapshot) => Json(snapshot).into_response(),
        None => StatusCode::SERVICE_UNAVAILABLE.into_response(),
    }
}

async fn realtime_stream(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let (Some(store), Some(hub)) = (&state.projection_store, &state.realtime_hub) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let request = match authorize_realtime_request(&state, &headers) {
        Ok(request) => request,
        Err(status) => return status.into_response(),
    };
    let availability = match store.realtime_scope_availability(&request.scope).await {
        Ok(availability) => availability,
        Err(projection_store_pg::StoreError::ActiveEpochNotFound) => {
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let mut subscription = hub.subscribe(
        request.claims.workspace_id.clone(),
        state.environment.clone(),
        request.cursor,
    );
    let (initial, terminal_after_initial) = match prepare_resume(
        store,
        &availability,
        &request,
        &mut subscription,
        state.realtime_replay_limit,
        state.realtime_epoch_jitter,
    )
    .await
    {
        Ok(prepared) => prepared,
        Err(status) => return status.into_response(),
    };
    let expires_in = request
        .claims
        .expires_at()
        .map_or(Duration::ZERO, |expires_at| {
            (expires_at - Utc::now())
                .to_std()
                .unwrap_or(Duration::ZERO)
                .saturating_sub(Duration::from_secs(2))
        });
    let heartbeat_at = tokio::time::Instant::now() + state.realtime_heartbeat;
    let machine = StreamMachine {
        initial,
        subscription: Some(subscription),
        heartbeat: tokio::time::interval_at(heartbeat_at, state.realtime_heartbeat),
        expires_at: tokio::time::Instant::now() + expires_in,
        terminal_after_initial,
    };
    let stream = stream::unfold(machine, next_sse_event);
    let mut response = Sse::new(stream).into_response();
    let response_headers = response.headers_mut();
    response_headers.insert(
        "cache-control",
        HeaderValue::from_static("no-cache, no-store"),
    );
    response_headers.insert("x-accel-buffering", HeaderValue::from_static("no"));
    response_headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    response
}

struct RealtimeRequest {
    claims: DelegatedClaims,
    cursor: ProjectionCursor,
    scope: ProjectionScope,
}

fn authorize_realtime_request(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<RealtimeRequest, StatusCode> {
    let token = bearer(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let claims = state
        .verifier
        .verify_read(
            token,
            &RequiredRead {
                environment: &state.environment,
                resource: Some(COMMAND_CENTER_RESOURCE),
            },
        )
        .map_err(|_| StatusCode::FORBIDDEN)?;
    let cursor = requested_cursor(headers)
        .map_err(|()| StatusCode::BAD_REQUEST)?
        .ok_or(StatusCode::BAD_REQUEST)?;
    let workspace_id =
        CanonicalId::parse(claims.workspace_id.clone()).map_err(|_| StatusCode::FORBIDDEN)?;
    let scope = ProjectionScope::new(workspace_id, state.environment.clone())
        .map_err(|_| StatusCode::FORBIDDEN)?;
    Ok(RealtimeRequest {
        claims,
        cursor,
        scope,
    })
}

async fn prepare_resume(
    store: &PgProjectionStore,
    availability: &RealtimeScopeAvailability,
    request: &RealtimeRequest,
    subscription: &mut RealtimeSubscription,
    replay_limit: usize,
    epoch_jitter: Duration,
) -> Result<(VecDeque<Event>, bool), StatusCode> {
    let decision = resume_decision(
        request.cursor,
        availability.active.as_core(),
        availability
            .retained_previous
            .as_ref()
            .map(|previous| previous.as_core()),
        &request.claims.sid,
        Utc::now(),
        epoch_jitter,
    );
    match decision {
        ResumeDecision::Resume => {
            prepare_replay(
                store,
                availability,
                request.cursor,
                subscription,
                replay_limit,
            )
            .await
        }
        ResumeDecision::Gap {
            earliest_available_sequence,
        } => {
            let mut gap = GapEnvelope::new(GapReason::HistoryEvicted, Some(request.cursor));
            gap.active_epoch_id = Some(availability.active.epoch.epoch_id);
            gap.earliest_available_sequence = Some(earliest_available_sequence);
            Ok((VecDeque::from([gap_event(&gap)]), true))
        }
        ResumeDecision::Resnapshot {
            active_epoch_id,
            resnapshot_not_before,
        } => {
            let mut gap = GapEnvelope::new(GapReason::EpochChanged, Some(request.cursor));
            gap.active_epoch_id = Some(active_epoch_id);
            gap.resnapshot_not_before = Some(resnapshot_not_before);
            Ok((VecDeque::from([gap_event(&gap)]), true))
        }
    }
}

async fn prepare_replay(
    store: &PgProjectionStore,
    availability: &RealtimeScopeAvailability,
    cursor: ProjectionCursor,
    subscription: &mut RealtimeSubscription,
    replay_limit: usize,
) -> Result<(VecDeque<Event>, bool), StatusCode> {
    let page = store
        .load_realtime_records(cursor.epoch_id, cursor.sequence, replay_limit)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if page.has_more {
        let mut gap = GapEnvelope::new(GapReason::ReplayWindowExceeded, Some(cursor));
        gap.active_epoch_id = Some(availability.active.epoch.epoch_id);
        return Ok((VecDeque::from([gap_event(&gap)]), true));
    }

    let mut initial = VecDeque::new();
    let mut expected = cursor.sequence.saturating_add(1);
    let mut replay_cursor = cursor;
    for record in page.records {
        if record.projection_sequence != expected || record.outcome == "GAP_APPLIED" {
            return Ok((
                VecDeque::from([gap_event(&GapEnvelope::new(
                    GapReason::SourceDiscontinuity,
                    Some(replay_cursor),
                ))]),
                true,
            ));
        }
        replay_cursor = ProjectionCursor {
            epoch_id: record.epoch_id,
            sequence: record.projection_sequence,
        };
        expected = expected.saturating_add(1);
        initial.push_back(projection_event(&record_to_envelope(record)));
    }
    subscription.advance_after_replay(replay_cursor);
    Ok((initial, false))
}

struct StreamMachine {
    initial: VecDeque<Event>,
    subscription: Option<RealtimeSubscription>,
    heartbeat: tokio::time::Interval,
    expires_at: tokio::time::Instant,
    terminal_after_initial: bool,
}

enum NextStreamEvent {
    Delivery(SubscriptionDelivery),
    Heartbeat,
    Expired,
}

async fn next_sse_event(
    mut machine: StreamMachine,
) -> Option<(Result<Event, Infallible>, StreamMachine)> {
    if let Some(event) = machine.initial.pop_front() {
        return Some((Ok(event), machine));
    }
    if machine.terminal_after_initial {
        return None;
    }
    let subscription = machine.subscription.as_mut()?;
    let next = tokio::select! {
        delivery = subscription.next() => NextStreamEvent::Delivery(delivery),
        _ = machine.heartbeat.tick() => NextStreamEvent::Heartbeat,
        () = tokio::time::sleep_until(machine.expires_at) => NextStreamEvent::Expired,
    };
    let event = match next {
        NextStreamEvent::Delivery(SubscriptionDelivery::Event(event)) => projection_event(&event),
        NextStreamEvent::Delivery(SubscriptionDelivery::Gap(gap)) => {
            machine.terminal_after_initial = true;
            gap_event(&gap)
        }
        NextStreamEvent::Delivery(SubscriptionDelivery::Closed) => return None,
        NextStreamEvent::Heartbeat => json_event(
            "projection.heartbeat",
            &serde_json::json!({
                "event_type": "projection.heartbeat",
                "schema_version": REALTIME_SCHEMA_VERSION,
                "server_time": Utc::now(),
            }),
            None,
        ),
        NextStreamEvent::Expired => {
            machine.terminal_after_initial = true;
            json_event(
                "auth.expiring",
                &serde_json::json!({
                    "event_type": "auth.expiring",
                    "schema_version": REALTIME_SCHEMA_VERSION,
                    "reconnect_required": true,
                }),
                None,
            )
        }
    };
    Some((Ok(event), machine))
}

fn requested_cursor(headers: &HeaderMap) -> Result<Option<ProjectionCursor>, ()> {
    let last_event = header_text(headers, "last-event-id")?;
    let snapshot = header_text(headers, "x-projection-cursor")?;
    if last_event.is_some() && snapshot.is_some() && last_event != snapshot {
        return Err(());
    }
    last_event
        .or(snapshot)
        .map(str::parse)
        .transpose()
        .map_err(|_| ())
}

fn header_text<'a>(headers: &'a HeaderMap, name: &str) -> Result<Option<&'a str>, ()> {
    headers
        .get(name)
        .map(|value| value.to_str().map_err(|_| ()))
        .transpose()
}

fn projection_event(envelope: &RealtimeEnvelope) -> Event {
    json_event(
        &envelope.event_type,
        envelope,
        Some(envelope.cursor().to_string()),
    )
}

fn gap_event(gap: &GapEnvelope) -> Event {
    json_event("projection.gap", gap, None).retry(Duration::from_secs(1))
}

fn json_event<T: Serialize>(event_type: &str, payload: &T, id: Option<String>) -> Event {
    let data = serde_json::to_string(payload)
        .unwrap_or_else(|_| "{\"event_type\":\"stream.serialization_error\"}".to_owned());
    let event = Event::default().event(event_type).data(data);
    match id {
        Some(id) => event.id(id),
        None => event,
    }
}

fn record_to_envelope(record: RealtimeJournalRecord) -> RealtimeEnvelope {
    let mut envelope = RealtimeEnvelope::from_observation(
        record.workspace_id,
        record.environment,
        record.epoch_id,
        record.projection_sequence,
        record.observation,
        record.projected_at,
    );
    envelope.source_discontinuity = record.outcome == "GAP_APPLIED";
    envelope
}

async fn realtime_journal_poller(
    store: PgProjectionStore,
    hub: RealtimeHub,
    poll_interval: Duration,
    poll_batch: usize,
) {
    let mut ordinal = match store.latest_realtime_journal_ordinal().await {
        Ok(ordinal) => ordinal,
        Err(error) => {
            warn!(error = %error, "realtime journal poller could not capture startup watermark");
            return;
        }
    };
    let mut interval = tokio::time::interval(poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        interval.tick().await;
        loop {
            match store
                .load_realtime_records_after_ordinal(ordinal, poll_batch)
                .await
            {
                Ok(page) => {
                    for record in page.records {
                        ordinal = record.journal_ordinal;
                        hub.publish(record_to_envelope(record));
                    }
                    if !page.has_more {
                        break;
                    }
                }
                Err(error) => {
                    warn!(error = %error, "realtime journal poll failed without advancing cursor");
                    break;
                }
            }
        }
    }
}

async fn livez() -> impl IntoResponse {
    (StatusCode::OK, Json(ProbeResponse { status: "live" }))
}

async fn readyz(State(state): State<AppState>) -> Response {
    let projection_ready = !state.projection_required || *state.projection_ready.read().await;
    let snapshot = state.snapshot.read().await;
    let ready = service_ready(
        snapshot.as_ref(),
        state.projection_required,
        projection_ready,
    );
    let status = if ready {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(ProbeResponse {
            status: if ready { "ready" } else { "not_ready" },
        }),
    )
        .into_response()
}

fn service_ready(
    snapshot: Option<&CapabilitySnapshot>,
    projection_required: bool,
    projection_ready: bool,
) -> bool {
    snapshot.is_some_and(snapshot_ready) && (!projection_required || projection_ready)
}

fn snapshot_ready(snapshot: &CapabilitySnapshot) -> bool {
    matches!(
        snapshot
            .capabilities
            .get(&ExecutionReadCapability::Contracts)
            .map(|value| value.state),
        Some(CapabilityState::Supported)
    ) && matches!(
        snapshot
            .capabilities
            .get(&ExecutionReadCapability::Health)
            .map(|value| value.state),
        Some(CapabilityState::ReadOnly)
    )
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .filter(|value| !value.is_empty())
}

#[derive(Serialize)]
struct ProbeResponse {
    status: &'static str,
}

fn mtls_server_config(
    certificate_pem: &[u8],
    private_key_pem: &[u8],
    client_ca_pem: &[u8],
) -> Result<ServerConfig, ServiceError> {
    let certificates = certificates(certificate_pem)?;
    let private_key = private_key(private_key_pem)?;
    let verifier = mtls_client_verifier(client_ca_pem)?;
    let mut server = ServerConfig::builder_with_protocol_versions(&[&rustls::version::TLS13])
        .with_client_cert_verifier(verifier)
        .with_single_cert(certificates, private_key)
        .map_err(|_| ServiceError::InvalidTlsMaterial)?;
    server.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Ok(server)
}

fn mtls_client_verifier(client_ca_pem: &[u8]) -> Result<Arc<dyn ClientCertVerifier>, ServiceError> {
    ensure_crypto_provider();
    let mut roots = RootCertStore::empty();
    for certificate in certificates(client_ca_pem)? {
        roots
            .add(certificate)
            .map_err(|_| ServiceError::InvalidTlsMaterial)?;
    }
    if roots.is_empty() {
        return Err(ServiceError::InvalidTlsMaterial);
    }
    WebPkiClientVerifier::builder(Arc::new(roots))
        .build()
        .map_err(|_| ServiceError::InvalidTlsMaterial)
}

fn ensure_crypto_provider() {
    static INSTALL: Once = Once::new();
    INSTALL.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

fn certificates(raw: &[u8]) -> Result<Vec<CertificateDer<'static>>, ServiceError> {
    let mut reader = BufReader::new(raw);
    let certificates = rustls_pemfile::certs(&mut reader)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| ServiceError::InvalidTlsMaterial)?;
    if certificates.is_empty() {
        return Err(ServiceError::InvalidTlsMaterial);
    }
    Ok(certificates)
}

fn private_key(raw: &[u8]) -> Result<PrivateKeyDer<'static>, ServiceError> {
    rustls_pemfile::private_key(&mut BufReader::new(raw))
        .map_err(|_| ServiceError::InvalidTlsMaterial)?
        .ok_or(ServiceError::InvalidTlsMaterial)
}

async fn healthcheck() -> Result<(), ServiceError> {
    let address: SocketAddr = value_or("EDGE_HEALTH_BIND_ADDRESS", "127.0.0.1:9100")
        .parse()
        .map_err(|_| ConfigError::Invalid("EDGE_HEALTH_BIND_ADDRESS"))?;
    if !address.ip().is_loopback() {
        return Err(ConfigError::Invalid("EDGE_HEALTH_BIND_ADDRESS").into());
    }
    let mut stream = tokio::time::timeout(Duration::from_secs(2), TcpStream::connect(address))
        .await
        .map_err(|_| ServiceError::HealthcheckFailed)??;
    stream
        .write_all(b"GET /readyz HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await?;
    let mut response = [0_u8; 64];
    let size = stream.read(&mut response).await?;
    if response[..size].starts_with(b"HTTP/1.1 200") {
        Ok(())
    } else {
        Err(ServiceError::HealthcheckFailed)
    }
}

fn required(name: &'static str) -> Result<String, ConfigError> {
    optional(name).ok_or(ConfigError::Missing(name))
}

fn optional(name: &str) -> Option<String> {
    env::var(name).ok().filter(|value| !value.trim().is_empty())
}

fn value_or(name: &str, default: &str) -> String {
    optional(name).unwrap_or_else(|| default.to_owned())
}

fn required_path(name: &'static str) -> Result<PathBuf, ConfigError> {
    required(name).map(PathBuf::from)
}

fn optional_path(name: &str) -> Option<PathBuf> {
    optional(name).map(PathBuf::from)
}

fn bounded_usize(
    name: &'static str,
    default: usize,
    minimum: usize,
    maximum: usize,
) -> Result<usize, ConfigError> {
    let parsed = optional(name).map_or(Ok(default), |raw| {
        raw.parse().map_err(|_| ConfigError::Invalid(name))
    })?;
    if (minimum..=maximum).contains(&parsed) {
        Ok(parsed)
    } else {
        Err(ConfigError::Invalid(name))
    }
}

fn bounded_i64(
    name: &'static str,
    default: i64,
    minimum: i64,
    maximum: i64,
) -> Result<i64, ConfigError> {
    let parsed = optional(name).map_or(Ok(default), |raw| {
        raw.parse().map_err(|_| ConfigError::Invalid(name))
    })?;
    if (minimum..=maximum).contains(&parsed) {
        Ok(parsed)
    } else {
        Err(ConfigError::Invalid(name))
    }
}

fn strict_boolean(name: &'static str, default: bool) -> Result<bool, ConfigError> {
    match optional(name).as_deref() {
        None => Ok(default),
        Some("true") => Ok(true),
        Some("false") => Ok(false),
        Some(_) => Err(ConfigError::Invalid(name)),
    }
}

fn read_file(path: &Path) -> Result<Vec<u8>, ServiceError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_SECRET_FILE_BYTES {
        return Err(ServiceError::UnsafeSecretFile);
    }
    fs::read(path).map_err(ServiceError::Io)
}

fn read_text(path: &Path) -> Result<String, ServiceError> {
    String::from_utf8(read_file(path)?).map_err(|_| ServiceError::UnsafeSecretFile)
}

async fn projection_check(migrate: bool) -> Result<(), ServiceError> {
    let path = required_path("EDGE_PROJECTION_DATABASE_URL_FILE")?;
    let database_url = read_text(&path)?;
    let store = projection_store_pg::PgProjectionStore::connect(database_url.trim()).await?;
    if migrate {
        store.migrate().await?;
    }
    store.ping().await?;
    Ok(())
}

#[derive(Debug, Error)]
enum ConfigError {
    #[error("required configuration {0} is missing")]
    Missing(&'static str),
    #[error("configuration {0} is invalid")]
    Invalid(&'static str),
}

#[derive(Debug, Error)]
enum ServiceError {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error(transparent)]
    Auth(#[from] edge_auth::AuthError),
    #[error(transparent)]
    Transport(#[from] ts_transport::TransportError),
    #[error(transparent)]
    ProjectionStore(#[from] projection_store_pg::StoreError),
    #[error(transparent)]
    Realtime(#[from] realtime_sse::RealtimeError),
    #[error("TLS material is invalid")]
    InvalidTlsMaterial,
    #[error("secret file violates size/type constraints")]
    UnsafeSecretFile,
    #[error("healthcheck failed")]
    HealthcheckFailed,
    #[error("unsupported execution edge command")]
    UnsupportedCommand,
    #[error("execution edge server failed")]
    Server(#[source] std::io::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[cfg(test)]
mod tests {
    use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
    use rustls::pki_types::{CertificateDer, UnixTime};

    use super::*;

    struct CertificateFixture {
        ca_pem: String,
        client_der: Vec<u8>,
    }

    fn certificate_fixture(common_name: &str) -> CertificateFixture {
        let mut ca_parameters = CertificateParams::new(Vec::<String>::new()).unwrap();
        ca_parameters.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        let ca_key = KeyPair::generate().unwrap();
        let ca = ca_parameters.self_signed(&ca_key).unwrap();

        let mut client_parameters = CertificateParams::new(vec![common_name.to_owned()]).unwrap();
        client_parameters.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];
        let client_key = KeyPair::generate().unwrap();
        let client = client_parameters
            .signed_by(&client_key, &ca, &ca_key)
            .unwrap();
        CertificateFixture {
            ca_pem: ca.pem(),
            client_der: client.der().to_vec(),
        }
    }

    #[test]
    fn plaintext_health_must_be_loopback_only() {
        let address: SocketAddr = "127.0.0.1:9100".parse().unwrap();
        assert!(address.ip().is_loopback());
        let public: SocketAddr = "0.0.0.0:9100".parse().unwrap();
        assert!(!public.ip().is_loopback());
    }

    #[test]
    fn bearer_parser_is_exact_and_never_accepts_query_credentials() {
        let mut headers = HeaderMap::new();
        assert_eq!(bearer(&headers), None);
        headers.insert(AUTHORIZATION, "Basic abc".parse().unwrap());
        assert_eq!(bearer(&headers), None);
        headers.insert(AUTHORIZATION, "Bearer assertion".parse().unwrap());
        assert_eq!(bearer(&headers), Some("assertion"));
    }

    #[test]
    fn malformed_tls_material_fails_closed() {
        assert!(matches!(
            mtls_server_config(b"not-a-cert", b"not-a-key", b"not-a-ca"),
            Err(ServiceError::InvalidTlsMaterial)
        ));
    }

    #[test]
    fn readiness_requires_both_verified_contract_and_live_source_health() {
        let snapshot = |health: &str| -> CapabilitySnapshot {
            serde_json::from_value(serde_json::json!({
                "identity": {
                    "adapter_id": "ts-adapter-v1",
                    "source_gateway_digest": "sha256:test",
                    "source_api_version": "v1",
                    "source_contract_revision": "v1",
                    "source_schema_version": "v1",
                    "capability_snapshot_id": "cap_test",
                    "contract_checked_at": "2026-08-21T00:00:00Z"
                },
                "capabilities": {
                    "contracts": {
                        "state": "SUPPORTED",
                        "reason": "verified",
                        "checked_at": "2026-08-21T00:00:00Z"
                    },
                    "health": {
                        "state": health,
                        "reason": "probe",
                        "checked_at": "2026-08-21T00:00:00Z"
                    }
                },
                "observed_venue_products": [],
                "warnings": []
            }))
            .unwrap()
        };
        assert!(snapshot_ready(&snapshot("READ_ONLY")));
        assert!(!snapshot_ready(&snapshot("DISABLED")));
        assert!(!snapshot_ready(&snapshot("INCOMPATIBLE")));
        assert!(service_ready(Some(&snapshot("READ_ONLY")), false, false));
        assert!(!service_ready(Some(&snapshot("READ_ONLY")), true, false));
        assert!(service_ready(Some(&snapshot("READ_ONLY")), true, true));
    }

    #[test]
    fn mtls_is_mandatory_and_rejects_a_client_from_another_ca() {
        let trusted = certificate_fixture("sgp-control-api");
        let untrusted = certificate_fixture("untrusted-client");
        let verifier = mtls_client_verifier(trusted.ca_pem.as_bytes()).unwrap();
        assert!(verifier.client_auth_mandatory());
        assert!(verifier
            .verify_client_cert(
                &CertificateDer::from(trusted.client_der),
                &[],
                UnixTime::now(),
            )
            .is_ok());
        assert!(verifier
            .verify_client_cert(
                &CertificateDer::from(untrusted.client_der),
                &[],
                UnixTime::now(),
            )
            .is_err());
    }
}
