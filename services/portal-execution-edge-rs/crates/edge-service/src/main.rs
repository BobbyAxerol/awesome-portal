#![forbid(unsafe_code)]

mod d4_command;

use std::{
    collections::{HashMap, HashSet, VecDeque},
    convert::Infallible,
    env, fs,
    io::BufReader,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Once},
    time::Duration,
};

use analytics::{
    aggregate_binding_exposure, build_capital_ledger, build_capital_preview, build_correlation,
    build_insight_batch, build_order_funnel, AnalyticsError, CapitalPreviewRequest,
    DerivedAnalytics, InsightBatchRequest,
};
use axum::{
    extract::{Path as AxumPath, State},
    http::{header::AUTHORIZATION, HeaderMap, HeaderValue, StatusCode},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use chrono::{DateTime, SecondsFormat, Utc};
use edge_auth::{DelegatedClaims, DelegationVerifier, RequiredRead};
use execution_contracts::{
    CanonicalId, CapabilitySnapshot, CapabilityState, DeliveryProfile, ExecutionReadCapability,
};
use futures_util::stream;
use projection_core::{
    evaluate_freshness, resume_decision, FreshnessInput, FreshnessPolicy, ProjectionCursor,
    ProjectionScope, ResumeDecision, VenueSessionState,
};
use projection_store_pg::{
    AnalyticsReadRequirement, AnalyticsSourceRead, PgProjectionStore, RealtimeJournalRecord,
    RealtimeScopeAvailability, StoreError,
};
use realtime_sse::{
    GapEnvelope, GapReason, RealtimeEnvelope, RealtimeFreshness, RealtimeHub, RealtimeSubscription,
    SubscriptionDelivery, COMMAND_CENTER_RESOURCE, REALTIME_SCHEMA_VERSION,
};
use rustls::{
    pki_types::{CertificateDer, PrivateKeyDer},
    server::{danger::ClientCertVerifier, WebPkiClientVerifier},
    RootCertStore, ServerConfig,
};
use serde::{Deserialize, Serialize};
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
const ANALYTICS_SCREEN_SCHEMA_VERSION: &str = "execution.analytics.screen.v1";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RuntimeGate {
    Disabled,
    Enabled,
}

impl RuntimeGate {
    const fn is_enabled(self) -> bool {
        matches!(self, Self::Enabled)
    }
}

impl From<bool> for RuntimeGate {
    fn from(value: bool) -> Self {
        if value {
            Self::Enabled
        } else {
            Self::Disabled
        }
    }
}

#[derive(Clone)]
struct AppState {
    environment: String,
    verifier: DelegationVerifier,
    snapshot: Arc<RwLock<Option<CapabilitySnapshot>>>,
    source_probe_required: RuntimeGate,
    projection_store_required: RuntimeGate,
    projection_store_ready: Arc<RwLock<bool>>,
    projection_ingestion_required: RuntimeGate,
    projection_ingestion_ready: Arc<RwLock<bool>>,
    realtime_required: RuntimeGate,
    realtime_poller_ready: Arc<RwLock<bool>>,
    projection_store: Option<PgProjectionStore>,
    realtime_hub: Option<RealtimeHub>,
    realtime_replay_limit: usize,
    realtime_heartbeat: Duration,
    realtime_epoch_jitter: Duration,
    realtime_freshness_policy: FreshnessPolicy,
    realtime_venue_session: VenueSessionState,
    analytics_query_enabled: RuntimeGate,
    analytics_source_profile: DeliveryProfile,
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
    source_probes_enabled: RuntimeGate,
    probe_alpha_id: Option<String>,
    probe_interval: Duration,
    transport_limits: TransportLimits,
    projection_ingestion_enabled: RuntimeGate,
    projection_database_url_file: Option<PathBuf>,
    realtime_sse_enabled: RuntimeGate,
    realtime_queue_capacity: usize,
    realtime_replay_limit: usize,
    realtime_poll_interval: Duration,
    realtime_poll_batch: usize,
    realtime_heartbeat: Duration,
    realtime_epoch_jitter: Duration,
    realtime_freshness_policy: FreshnessPolicy,
    realtime_venue_session: VenueSessionState,
    analytics_query_enabled: RuntimeGate,
    analytics_source_profile: DeliveryProfile,
}

impl EdgeConfig {
    fn projection_store_required(&self) -> RuntimeGate {
        RuntimeGate::from(
            self.projection_ingestion_enabled.is_enabled()
                || self.realtime_sse_enabled.is_enabled()
                || self.analytics_query_enabled.is_enabled(),
        )
    }

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
        let source_probes_enabled =
            RuntimeGate::from(strict_boolean("EDGE_SOURCE_PROBES_ENABLED", false)?);
        let projection_ingestion_enabled =
            RuntimeGate::from(strict_boolean("EDGE_PROJECTION_INGESTION_ENABLED", false)?);
        let realtime_sse_enabled =
            RuntimeGate::from(strict_boolean("EDGE_REALTIME_SSE_ENABLED", false)?);
        let analytics_query_enabled =
            RuntimeGate::from(strict_boolean("EDGE_ANALYTICS_QUERY_ENABLED", false)?);
        if strict_boolean("EDGE_COMMAND_RELAY_ENABLED", false)? {
            return Err(ConfigError::Invalid("EDGE_COMMAND_RELAY_ENABLED"));
        }
        let analytics_source_profile =
            delivery_profile(&value_or("EDGE_ANALYTICS_SOURCE_PROFILE", "fixture"))?;
        let (realtime_freshness_policy, realtime_venue_session) =
            realtime_freshness_from_environment()?;
        let projection_database_url_file = optional_path("EDGE_PROJECTION_DATABASE_URL_FILE");
        if (projection_ingestion_enabled.is_enabled()
            || realtime_sse_enabled.is_enabled()
            || analytics_query_enabled.is_enabled())
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
            source_probes_enabled,
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
            realtime_freshness_policy,
            realtime_venue_session,
            analytics_query_enabled,
            analytics_source_profile,
        })
    }
}

fn realtime_freshness_from_environment() -> Result<(FreshnessPolicy, VenueSessionState), ConfigError>
{
    let policy = FreshnessPolicy {
        policy_version: value_or(
            "EDGE_REALTIME_FRESHNESS_POLICY_VERSION",
            "paper.realtime.v1",
        ),
        warning_after_ms: bounded_i64(
            "EDGE_REALTIME_FRESHNESS_WARNING_AFTER_MS",
            2_000,
            0,
            86_400_000,
        )?,
        stale_after_ms: bounded_i64(
            "EDGE_REALTIME_FRESHNESS_STALE_AFTER_MS",
            10_000,
            1,
            86_400_000,
        )?,
        maximum_future_skew_ms: bounded_i64(
            "EDGE_REALTIME_MAXIMUM_FUTURE_SKEW_MS",
            2_000,
            0,
            60_000,
        )?,
    };
    policy
        .validate()
        .map_err(|_| ConfigError::Invalid("EDGE_REALTIME_FRESHNESS_POLICY"))?;
    let session = venue_session(&value_or("EDGE_REALTIME_VENUE_SESSION", "UNKNOWN"))?;
    Ok((policy, session))
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
        Some("d4-prepare-building") => d4_command::prepare_building().await.map_err(Into::into),
        Some("d4-qualify") => d4_command::qualify().await.map_err(Into::into),
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
    let initial_snapshot = if config.source_probes_enabled.is_enabled() {
        Some(negotiator.probe(config.probe_alpha_id.as_deref()).await)
    } else {
        None
    };
    let snapshot = Arc::new(RwLock::new(initial_snapshot));
    let projection_store_ready = Arc::new(RwLock::new(projection_store.is_some()));
    // Connecting to PostgreSQL is not proof that the source mapper is running.
    // The D4 ingestor must explicitly publish readiness after it owns a locked
    // BUILDING epoch; until then an enabled ingestion gate stays fail-closed.
    let projection_ingestion_ready = Arc::new(RwLock::new(false));
    let realtime_poller_ready = Arc::new(RwLock::new(!config.realtime_sse_enabled.is_enabled()));
    let realtime_hub = if config.realtime_sse_enabled.is_enabled() {
        Some(RealtimeHub::new(config.realtime_queue_capacity)?)
    } else {
        None
    };
    let state = AppState {
        environment: config.environment.clone(),
        verifier,
        snapshot: Arc::clone(&snapshot),
        source_probe_required: config.source_probes_enabled,
        projection_store_required: config.projection_store_required(),
        projection_store_ready: Arc::clone(&projection_store_ready),
        projection_ingestion_required: config.projection_ingestion_enabled,
        projection_ingestion_ready: Arc::clone(&projection_ingestion_ready),
        realtime_required: config.realtime_sse_enabled,
        realtime_poller_ready: Arc::clone(&realtime_poller_ready),
        projection_store: projection_store.clone(),
        realtime_hub: realtime_hub.clone(),
        realtime_replay_limit: config.realtime_replay_limit,
        realtime_heartbeat: config.realtime_heartbeat,
        realtime_epoch_jitter: config.realtime_epoch_jitter,
        realtime_freshness_policy: config.realtime_freshness_policy.clone(),
        realtime_venue_session: config.realtime_venue_session,
        analytics_query_enabled: config.analytics_query_enabled,
        analytics_source_profile: config.analytics_source_profile,
    };

    spawn_background_tasks(
        &config,
        negotiator,
        snapshot,
        projection_store,
        projection_store_ready,
        realtime_poller_ready,
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
    if !config.projection_ingestion_enabled.is_enabled()
        && !config.realtime_sse_enabled.is_enabled()
        && !config.analytics_query_enabled.is_enabled()
    {
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
    projection_store_ready: Arc<RwLock<bool>>,
    realtime_poller_ready: Arc<RwLock<bool>>,
    realtime_hub: Option<RealtimeHub>,
) {
    if config.source_probes_enabled.is_enabled() {
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
    }
    if let Some(store) = projection_store.clone() {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            interval.tick().await;
            loop {
                interval.tick().await;
                *projection_store_ready.write().await = store.ping().await.is_ok();
            }
        });
    }
    if let (Some(store), Some(hub)) = (projection_store, realtime_hub) {
        tokio::spawn(realtime_journal_poller(
            store,
            hub,
            config.realtime_poll_interval,
            config.realtime_poll_batch,
            config.realtime_freshness_policy.clone(),
            config.realtime_venue_session,
            realtime_poller_ready,
        ));
    }
}

fn private_router(state: AppState) -> Router {
    Router::new()
        .route("/internal/v1/compatibility", get(compatibility))
        .route("/internal/v1/realtime/stream", get(realtime_stream))
        .route(
            "/internal/v1/screens/gate-r2/:approval_id/capital-preview",
            post(capital_preview),
        )
        .route(
            "/internal/v1/screens/blotter/orders/:order_id/funnel",
            get(order_funnel),
        )
        .route(
            "/internal/v1/screens/alpha-360/:alpha_id/insight-previews",
            post(insight_previews),
        )
        .route(
            "/internal/v1/screens/portfolio-360/:portfolio_id/correlation",
            get(portfolio_correlation),
        )
        .route(
            "/internal/v1/screens/portfolio-360/:portfolio_id/capital-ledger",
            get(capital_ledger),
        )
        .route(
            "/internal/v1/screens/account-broker-360/:binding_id/exposure",
            get(binding_exposure),
        )
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

async fn capital_preview(
    State(state): State<AppState>,
    AxumPath(approval_id): AxumPath<String>,
    headers: HeaderMap,
    Json(request): Json<CapitalPreviewRequest>,
) -> Response {
    let Ok(approval_id) = screen_identifier(approval_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let resource = format!("execution:screen:gate-r2:{}", approval_id.as_str());
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    let read = context
        .store
        .load_capital_preview_source(
            &context.scope,
            &request.portfolio_id,
            &request.currency,
            &requirement,
        )
        .await;
    match read {
        Ok(read) => {
            let analytics = build_capital_preview(&request, &read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

async fn order_funnel(
    State(state): State<AppState>,
    AxumPath(order_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Ok(order_id) = screen_identifier(order_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let resource = format!("execution:screen:blotter:{}", order_id.as_str());
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    match context
        .store
        .load_order_funnel_source(&context.scope, &order_id, &requirement)
        .await
    {
        Ok(read) => {
            let analytics = build_order_funnel(&read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

async fn insight_previews(
    State(state): State<AppState>,
    AxumPath(alpha_id): AxumPath<String>,
    headers: HeaderMap,
    Json(request): Json<InsightBatchRequest>,
) -> Response {
    let Ok(alpha_id) = screen_identifier(alpha_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if request.items.iter().any(|item| item.alpha_id != alpha_id) {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let resource = format!("execution:screen:alpha-360:{}", alpha_id.as_str());
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    match context
        .store
        .load_insight_preview_source(&context.scope, &request.portfolio_id, &requirement)
        .await
    {
        Ok(read) => {
            let analytics = build_insight_batch(&request, &read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

async fn portfolio_correlation(
    State(state): State<AppState>,
    AxumPath(portfolio_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Ok(portfolio_id) = screen_identifier(portfolio_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let resource = format!("execution:screen:portfolio-360:{}", portfolio_id.as_str());
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    match context
        .store
        .load_correlation_source(&context.scope, &portfolio_id, &requirement)
        .await
    {
        Ok(read) => {
            let analytics = build_correlation(&read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

async fn capital_ledger(
    State(state): State<AppState>,
    AxumPath(portfolio_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Ok(portfolio_id) = screen_identifier(portfolio_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let resource = format!("execution:screen:portfolio-360:{}", portfolio_id.as_str());
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    match context
        .store
        .load_capital_ledger_source(&context.scope, &portfolio_id, &requirement)
        .await
    {
        Ok(read) => {
            let analytics = build_capital_ledger(&read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

async fn binding_exposure(
    State(state): State<AppState>,
    AxumPath(binding_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let Ok(binding_id) = screen_identifier(binding_id) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let resource = format!(
        "execution:screen:account-broker-360:{}",
        binding_id.as_str()
    );
    let context = match analytics_context(&state, &headers, &resource).await {
        Ok(context) => context,
        Err(status) => return status.into_response(),
    };
    let requirement = context.requirement(&state);
    match context
        .store
        .load_binding_exposure_source(&context.scope, &binding_id, &requirement)
        .await
    {
        Ok(read) => {
            let analytics = aggregate_binding_exposure(&read.input);
            analytics_response(read, analytics)
        }
        Err(error) => analytics_store_error(&error),
    }
}

struct AnalyticsRequestContext {
    store: PgProjectionStore,
    scope: ProjectionScope,
    capability_snapshot_id: String,
    read_at: chrono::DateTime<Utc>,
}

impl AnalyticsRequestContext {
    fn requirement<'a>(&'a self, state: &AppState) -> AnalyticsReadRequirement<'a> {
        AnalyticsReadRequirement {
            expected_profile: state.analytics_source_profile,
            capability_snapshot_id: &self.capability_snapshot_id,
            read_at: self.read_at,
        }
    }
}

async fn analytics_context(
    state: &AppState,
    headers: &HeaderMap,
    resource: &str,
) -> Result<AnalyticsRequestContext, StatusCode> {
    if !state.analytics_query_enabled.is_enabled() {
        return Err(StatusCode::NOT_FOUND);
    }
    let store = state
        .projection_store
        .clone()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let token = bearer(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let claims = state
        .verifier
        .verify_read(
            token,
            &RequiredRead {
                environment: &state.environment,
                resource: Some(resource),
            },
        )
        .map_err(|_| StatusCode::FORBIDDEN)?;
    let workspace_id =
        CanonicalId::parse(claims.workspace_id).map_err(|_| StatusCode::FORBIDDEN)?;
    let scope = ProjectionScope::new(workspace_id, state.environment.clone())
        .map_err(|_| StatusCode::FORBIDDEN)?;
    let snapshot = state.snapshot.read().await;
    let snapshot = snapshot
        .as_ref()
        .filter(|snapshot| snapshot_ready(snapshot))
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    Ok(AnalyticsRequestContext {
        store,
        scope,
        capability_snapshot_id: snapshot.identity.capability_snapshot_id.clone(),
        read_at: Utc::now(),
    })
}

#[derive(Serialize, Deserialize)]
struct AnalyticsScreenEnvelope<T> {
    schema_version: String,
    epoch_id: uuid::Uuid,
    source_snapshot_id: uuid::Uuid,
    capability_snapshot_id: String,
    source_profile: DeliveryProfile,
    projection_sequence: u64,
    freshness_policy_version: String,
    read_at: chrono::DateTime<Utc>,
    analytics: DerivedAnalytics<T>,
}

fn analytics_response<I, O>(
    read: AnalyticsSourceRead<I>,
    analytics: Result<DerivedAnalytics<O>, AnalyticsError>,
) -> Response
where
    O: Serialize,
{
    match analytics {
        Ok(analytics) => Json(AnalyticsScreenEnvelope {
            schema_version: ANALYTICS_SCREEN_SCHEMA_VERSION.to_owned(),
            epoch_id: read.epoch_id,
            source_snapshot_id: read.source_snapshot_id,
            capability_snapshot_id: read.capability_snapshot_id,
            source_profile: read.source_profile,
            projection_sequence: read.projection_sequence,
            freshness_policy_version: read.freshness_policy_version,
            read_at: read.read_at,
            analytics,
        })
        .into_response(),
        Err(error) => analytics_error_response(&error),
    }
}

#[derive(Serialize)]
struct AnalyticsProblemBody {
    error: AnalyticsProblem,
}

#[derive(Serialize)]
struct AnalyticsProblem {
    code: &'static str,
    message: &'static str,
}

fn analytics_error_response(error: &AnalyticsError) -> Response {
    let (status, code, message) = analytics_error_contract(error);
    (
        status,
        Json(AnalyticsProblemBody {
            error: AnalyticsProblem { code, message },
        }),
    )
        .into_response()
}

fn analytics_error_contract(error: &AnalyticsError) -> (StatusCode, &'static str, &'static str) {
    match error {
        AnalyticsError::DecimalOverflow => (
            StatusCode::SERVICE_UNAVAILABLE,
            "ANALYTICS_ARITHMETIC_UNAVAILABLE",
            "Analytics could not be computed with exact decimal arithmetic.",
        ),
        AnalyticsError::BatchLimit { .. }
        | AnalyticsError::CorrelationEntityLimit { .. }
        | AnalyticsError::RankedPairLimit { .. } => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_INPUT_LIMIT_EXCEEDED",
            "Analytics input exceeds the published bounded contract.",
        ),
        AnalyticsError::InvalidCurrency(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_INVALID_CURRENCY",
            "Analytics input contains an invalid currency code.",
        ),
        AnalyticsError::NegativeAmount { .. }
        | AnalyticsError::InconsistentAmount { .. }
        | AnalyticsError::LedgerMismatch(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_ACCOUNTING_MISMATCH",
            "Analytics input violates an exact accounting boundary.",
        ),
        AnalyticsError::ScopeMismatch { .. } => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_SCOPE_MISMATCH",
            "Analytics input does not belong to the requested scope.",
        ),
        AnalyticsError::DuplicateIdentifier(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_DUPLICATE_IDENTIFIER",
            "Analytics input contains a duplicate identifier.",
        ),
        AnalyticsError::CorrelationPairCount { .. }
        | AnalyticsError::UnknownCorrelationEntity(_)
        | AnalyticsError::InvalidCorrelationCoefficient
        | AnalyticsError::SuppliedSelfCorrelation => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_CORRELATION_INVALID",
            "Correlation input violates the published analytics contract.",
        ),
    }
}

fn analytics_store_error(error: &StoreError) -> Response {
    match error {
        StoreError::AnalyticsSourceNotFound => StatusCode::NOT_FOUND.into_response(),
        StoreError::AnalyticsSourceProfileMismatch
        | StoreError::AnalyticsCapabilityMismatch
        | StoreError::AnalyticsPopulationMismatch
        | StoreError::InvalidAnalyticsSourcePayload
        | StoreError::AnalyticsSourceLimitExceeded
        | StoreError::ActiveEpochNotFound
        | StoreError::EpochNotFound => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        _ => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

fn screen_identifier(raw: String) -> Result<CanonicalId, StatusCode> {
    if raw.len() > 128
        || !raw
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    CanonicalId::parse(raw).map_err(|_| StatusCode::BAD_REQUEST)
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
        request.claims.sid.clone(),
        state.realtime_epoch_jitter,
    );
    let (initial, terminal_after_initial) = match prepare_resume(
        store,
        &availability,
        &request,
        &mut subscription,
        RealtimeResumePolicy {
            replay_limit: state.realtime_replay_limit,
            epoch_jitter: state.realtime_epoch_jitter,
            freshness: &state.realtime_freshness_policy,
            venue_session: state.realtime_venue_session,
        },
    )
    .await
    {
        Ok(prepared) => prepared,
        Err(status) => return status.into_response(),
    };
    let expires_in = request
        .assertion_expires_at
        .signed_duration_since(Utc::now())
        .to_std()
        .unwrap_or(Duration::ZERO)
        .saturating_sub(Duration::from_secs(2));
    let heartbeat_at = tokio::time::Instant::now() + state.realtime_heartbeat;
    let machine = StreamMachine {
        initial,
        subscription: Some(subscription),
        heartbeat: tokio::time::interval_at(heartbeat_at, state.realtime_heartbeat),
        expires_at: tokio::time::Instant::now() + expires_in,
        assertion_expires_at: request.assertion_expires_at,
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
    assertion_expires_at: DateTime<Utc>,
    cursor: ProjectionCursor,
    scope: ProjectionScope,
}

#[derive(Clone, Copy)]
struct RealtimeResumePolicy<'a> {
    replay_limit: usize,
    epoch_jitter: Duration,
    freshness: &'a FreshnessPolicy,
    venue_session: VenueSessionState,
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
    let assertion_expires_at = assertion_expires_at(&claims)?;
    let cursor = requested_cursor(headers)
        .map_err(|()| StatusCode::BAD_REQUEST)?
        .ok_or(StatusCode::BAD_REQUEST)?;
    let workspace_id =
        CanonicalId::parse(claims.workspace_id.clone()).map_err(|_| StatusCode::FORBIDDEN)?;
    let scope = ProjectionScope::new(workspace_id, state.environment.clone())
        .map_err(|_| StatusCode::FORBIDDEN)?;
    Ok(RealtimeRequest {
        claims,
        assertion_expires_at,
        cursor,
        scope,
    })
}

fn assertion_expires_at(claims: &DelegatedClaims) -> Result<DateTime<Utc>, StatusCode> {
    claims.expires_at().ok_or(StatusCode::FORBIDDEN)
}

async fn prepare_resume(
    store: &PgProjectionStore,
    availability: &RealtimeScopeAvailability,
    request: &RealtimeRequest,
    subscription: &mut RealtimeSubscription,
    policy: RealtimeResumePolicy<'_>,
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
        policy.epoch_jitter,
    );
    match decision {
        ResumeDecision::Resume => {
            prepare_replay(
                store,
                availability,
                request.cursor,
                subscription,
                policy.replay_limit,
                policy.freshness,
                policy.venue_session,
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
        ResumeDecision::CursorAhead {
            active_epoch_id,
            latest_available_sequence,
            resnapshot_not_before,
        } => {
            let mut gap = GapEnvelope::new(GapReason::CursorAhead, Some(request.cursor));
            gap.active_epoch_id = Some(active_epoch_id);
            gap.latest_available_sequence = Some(latest_available_sequence);
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
    freshness_policy: &FreshnessPolicy,
    venue_session: VenueSessionState,
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
        let envelope = record_to_envelope(record, freshness_policy, venue_session, Utc::now())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        initial.push_back(projection_event(&envelope));
    }
    subscription.advance_after_replay(replay_cursor);
    Ok((initial, false))
}

struct StreamMachine {
    initial: VecDeque<Event>,
    subscription: Option<RealtimeSubscription>,
    heartbeat: tokio::time::Interval,
    expires_at: tokio::time::Instant,
    assertion_expires_at: DateTime<Utc>,
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
            auth_expiring_event(&machine.assertion_expires_at)
        }
    };
    Some((Ok(event), machine))
}

#[derive(Serialize)]
struct AuthExpiringEnvelope {
    event_type: &'static str,
    schema_version: &'static str,
    reconnect_required: bool,
    expires_at: String,
}

fn auth_expiring_event(expires_at: &DateTime<Utc>) -> Event {
    json_event("auth.expiring", &auth_expiring_payload(expires_at), None)
}

fn auth_expiring_payload(expires_at: &DateTime<Utc>) -> AuthExpiringEnvelope {
    AuthExpiringEnvelope {
        event_type: "auth.expiring",
        schema_version: REALTIME_SCHEMA_VERSION,
        reconnect_required: true,
        expires_at: expires_at.to_rfc3339_opts(SecondsFormat::Secs, true),
    }
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

fn record_to_envelope(
    record: RealtimeJournalRecord,
    freshness_policy: &FreshnessPolicy,
    venue_session: VenueSessionState,
    read_at: chrono::DateTime<Utc>,
) -> Result<RealtimeEnvelope, projection_core::ProjectionError> {
    let freshness = evaluate_freshness(
        freshness_policy,
        &FreshnessInput {
            as_of: record.observation.as_of,
            read_at,
            source_received_at: Some(record.observation.source_read_at),
            projected_at: Some(record.projected_at),
            venue_session,
        },
    )?;
    let mut envelope = RealtimeEnvelope::from_observation(
        record.workspace_id,
        record.environment,
        record.epoch_id,
        record.projection_sequence,
        record.observation,
        record.projected_at,
        RealtimeFreshness {
            state: freshness.state,
            policy_version: freshness.policy_version,
        },
    );
    envelope.source_discontinuity = record.outcome == "GAP_APPLIED";
    Ok(envelope)
}

async fn realtime_journal_poller(
    store: PgProjectionStore,
    hub: RealtimeHub,
    poll_interval: Duration,
    poll_batch: usize,
    freshness_policy: FreshnessPolicy,
    venue_session: VenueSessionState,
    poller_ready: Arc<RwLock<bool>>,
) {
    let mut interval = tokio::time::interval(poll_interval);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    // Initial database unavailability must not permanently kill the poller.
    // Existing ACTIVE epochs start at their high-water mark; replay remains an
    // explicit per-client cursor concern rather than a process-start fan-out.
    let mut cursors = loop {
        interval.tick().await;
        match store.active_realtime_epoch_watermarks().await {
            Ok(active) => {
                let cursors = active
                    .into_iter()
                    .map(|epoch| (epoch.epoch_id, epoch.latest_sequence))
                    .collect();
                *poller_ready.write().await = true;
                break cursors;
            }
            Err(error) => {
                *poller_ready.write().await = false;
                warn!(error = %error, "realtime journal poller startup retry");
            }
        }
    };

    loop {
        interval.tick().await;
        match poll_active_realtime_epochs(
            &store,
            &hub,
            &mut cursors,
            poll_batch,
            &freshness_policy,
            venue_session,
        )
        .await
        {
            Ok(()) => *poller_ready.write().await = true,
            Err(error) => {
                *poller_ready.write().await = false;
                warn!(error = %error, "realtime journal poll failed without discarding epoch cursors");
            }
        }
    }
}

async fn poll_active_realtime_epochs(
    store: &PgProjectionStore,
    hub: &RealtimeHub,
    cursors: &mut HashMap<uuid::Uuid, u64>,
    poll_batch: usize,
    freshness_policy: &FreshnessPolicy,
    venue_session: VenueSessionState,
) -> Result<(), StoreError> {
    let active = store.active_realtime_epoch_watermarks().await?;
    let active_ids: HashSet<_> = active.iter().map(|epoch| epoch.epoch_id).collect();
    for epoch in active {
        let Some(mut after) = cursors.get(&epoch.epoch_id).copied() else {
            // One real event from the newly authoritative epoch is enough to
            // terminate old subscriptions with an epoch_changed gap. Skip the
            // rebuild backlog and continue from the activation high-water.
            if epoch.latest_sequence > 0 {
                if let Some(record) = store
                    .load_realtime_records(epoch.epoch_id, 0, 1)
                    .await?
                    .records
                    .into_iter()
                    .next()
                {
                    hub.publish(record_to_envelope(
                        record,
                        freshness_policy,
                        venue_session,
                        Utc::now(),
                    )?);
                }
            }
            cursors.insert(epoch.epoch_id, epoch.latest_sequence);
            continue;
        };

        loop {
            let page = store
                .load_realtime_records(epoch.epoch_id, after, poll_batch)
                .await?;
            for record in page.records {
                let sequence = record.projection_sequence;
                hub.publish(record_to_envelope(
                    record,
                    freshness_policy,
                    venue_session,
                    Utc::now(),
                )?);
                after = sequence;
                cursors.insert(epoch.epoch_id, sequence);
            }
            if !page.has_more {
                break;
            }
        }
    }
    cursors.retain(|epoch_id, _| active_ids.contains(epoch_id));
    Ok(())
}

async fn livez() -> impl IntoResponse {
    (StatusCode::OK, Json(ProbeResponse { status: "live" }))
}

async fn readyz(State(state): State<AppState>) -> Response {
    let snapshot = state.snapshot.read().await;
    let dependencies = RequiredDependencyReadiness {
        source: DependencyReadiness::from_bool(
            !state.source_probe_required.is_enabled()
                || snapshot.as_ref().is_some_and(snapshot_ready),
        ),
        projection_store: DependencyReadiness::from_bool(
            !state.projection_store_required.is_enabled()
                || *state.projection_store_ready.read().await,
        ),
        projection_ingestion: DependencyReadiness::from_bool(
            !state.projection_ingestion_required.is_enabled()
                || *state.projection_ingestion_ready.read().await,
        ),
        realtime: DependencyReadiness::from_bool(
            !state.realtime_required.is_enabled() || *state.realtime_poller_ready.read().await,
        ),
    };
    let ready = service_ready(dependencies);
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

#[derive(Clone, Copy)]
struct RequiredDependencyReadiness {
    source: DependencyReadiness,
    projection_store: DependencyReadiness,
    projection_ingestion: DependencyReadiness,
    realtime: DependencyReadiness,
}

#[derive(Clone, Copy)]
struct DependencyReadiness(bool);

impl DependencyReadiness {
    const fn from_bool(value: bool) -> Self {
        Self(value)
    }

    const fn is_ready(self) -> bool {
        self.0
    }
}

fn service_ready(dependencies: RequiredDependencyReadiness) -> bool {
    dependencies.source.is_ready()
        && dependencies.projection_store.is_ready()
        && dependencies.projection_ingestion.is_ready()
        && dependencies.realtime.is_ready()
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

fn delivery_profile(value: &str) -> Result<DeliveryProfile, ConfigError> {
    match value {
        "fixture" => Ok(DeliveryProfile::Fixture),
        "shadow" => Ok(DeliveryProfile::Shadow),
        "paper" => Ok(DeliveryProfile::Paper),
        "sandbox" => Ok(DeliveryProfile::Sandbox),
        "live_canary" => Ok(DeliveryProfile::LiveCanary),
        "live_full" => Ok(DeliveryProfile::LiveFull),
        _ => Err(ConfigError::Invalid("EDGE_ANALYTICS_SOURCE_PROFILE")),
    }
}

fn venue_session(value: &str) -> Result<VenueSessionState, ConfigError> {
    match value {
        "OPEN" => Ok(VenueSessionState::Open),
        "PAUSED" => Ok(VenueSessionState::Paused),
        "UNKNOWN" => Ok(VenueSessionState::Unknown),
        _ => Err(ConfigError::Invalid("EDGE_REALTIME_VENUE_SESSION")),
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
    D4Command(#[from] d4_command::D4CommandError),
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
    use analytics::{
        BindingExposureResult, CapitalLedgerResult, CapitalPreview, CorrelationResult,
        InsightBatch, OrderFunnel,
    };
    use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
    use rustls::pki_types::{CertificateDer, UnixTime};
    use serde::de::DeserializeOwned;

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
    fn auth_expiring_payload_carries_the_verified_utc_expiry() {
        let expires_at = DateTime::parse_from_rfc3339("2026-08-22T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);

        assert_eq!(
            serde_json::to_value(auth_expiring_payload(&expires_at)).unwrap(),
            serde_json::json!({
                "event_type": "auth.expiring",
                "schema_version": REALTIME_SCHEMA_VERSION,
                "reconnect_required": true,
                "expires_at": "2026-08-22T10:00:00Z",
            })
        );
    }

    #[test]
    fn unusable_assertion_expiry_is_rejected_before_stream_setup() {
        let claims = DelegatedClaims {
            iss: "issuer".to_owned(),
            aud: "audience".to_owned(),
            sub: "subject".to_owned(),
            sid: "session".to_owned(),
            workspace_id: "workspace".to_owned(),
            roles: vec!["USER".to_owned()],
            scopes: vec!["execution.read".to_owned()],
            resources: vec![COMMAND_CENTER_RESOURCE.to_owned()],
            environment: "paper".to_owned(),
            jti: "assertion".to_owned(),
            iat: 0,
            nbf: 0,
            exp: i64::MAX,
            auth_time: 0,
            amr: vec!["portal_session".to_owned()],
        };

        assert_eq!(assertion_expires_at(&claims), Err(StatusCode::FORBIDDEN));
    }

    #[test]
    fn screen_identifiers_are_ascii_bounded_and_resource_safe() {
        assert!(screen_identifier("PF_1.alpha-2".to_owned()).is_ok());
        assert!(screen_identifier(String::new()).is_err());
        assert!(screen_identifier("../other".to_owned()).is_err());
        assert!(screen_identifier("id:other".to_owned()).is_err());
        assert!(screen_identifier("x".repeat(129)).is_err());
    }

    #[test]
    fn analytics_errors_are_typed_without_leaking_source_identifiers() {
        assert_eq!(
            analytics_error_contract(&AnalyticsError::ScopeMismatch {
                field: "portfolio_id",
            }),
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                "ANALYTICS_SCOPE_MISMATCH",
                "Analytics input does not belong to the requested scope.",
            )
        );
        assert_eq!(
            analytics_error_contract(&AnalyticsError::DuplicateIdentifier(
                "sensitive-source-id".to_owned(),
            )),
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                "ANALYTICS_DUPLICATE_IDENTIFIER",
                "Analytics input contains a duplicate identifier.",
            )
        );
        assert_eq!(
            analytics_error_contract(&AnalyticsError::DecimalOverflow).0,
            StatusCode::SERVICE_UNAVAILABLE
        );
    }

    #[test]
    fn all_six_analytics_openapi_fixtures_deserialize_through_rust_serde() {
        fn parse<T: DeserializeOwned>(raw: &str) {
            serde_json::from_str::<AnalyticsScreenEnvelope<T>>(raw).unwrap();
        }

        parse::<CapitalPreview>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.capital-preview.valid.json"
        ));
        parse::<OrderFunnel>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.order-funnel.valid.json"
        ));
        parse::<InsightBatch>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.insight-batch.valid.json"
        ));
        parse::<CorrelationResult>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.correlation.valid.json"
        ));
        parse::<CapitalLedgerResult>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.capital-ledger.valid.json"
        ));
        parse::<BindingExposureResult>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-analytics.binding-exposure.valid.json"
        ));
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
        assert!(service_ready(RequiredDependencyReadiness {
            source: DependencyReadiness::from_bool(true),
            projection_store: DependencyReadiness::from_bool(true),
            projection_ingestion: DependencyReadiness::from_bool(true),
            realtime: DependencyReadiness::from_bool(true),
        }));
        assert!(!service_ready(RequiredDependencyReadiness {
            source: DependencyReadiness::from_bool(false),
            projection_store: DependencyReadiness::from_bool(true),
            projection_ingestion: DependencyReadiness::from_bool(true),
            realtime: DependencyReadiness::from_bool(true),
        }));
        assert!(!service_ready(RequiredDependencyReadiness {
            source: DependencyReadiness::from_bool(true),
            projection_store: DependencyReadiness::from_bool(false),
            projection_ingestion: DependencyReadiness::from_bool(true),
            realtime: DependencyReadiness::from_bool(true),
        }));
        assert!(!service_ready(RequiredDependencyReadiness {
            source: DependencyReadiness::from_bool(true),
            projection_store: DependencyReadiness::from_bool(true),
            projection_ingestion: DependencyReadiness::from_bool(false),
            realtime: DependencyReadiness::from_bool(true),
        }));
        assert!(!service_ready(RequiredDependencyReadiness {
            source: DependencyReadiness::from_bool(true),
            projection_store: DependencyReadiness::from_bool(true),
            projection_ingestion: DependencyReadiness::from_bool(true),
            realtime: DependencyReadiness::from_bool(false),
        }));
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
