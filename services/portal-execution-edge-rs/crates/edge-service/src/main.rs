#![forbid(unsafe_code)]

mod d4_command;

use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque},
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
    extract::{Path as AxumPath, Query, State},
    http::{header::AUTHORIZATION, HeaderMap, HeaderValue, StatusCode},
    response::{sse::Event, IntoResponse, Response, Sse},
    routing::{get, post},
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use chrono::{DateTime, SecondsFormat, Utc};
use command_relay::current_primitive::{CurrentProtectiveAcceptance, CurrentProtectiveError};
use current_source_compat::{
    AdapterKind, CapabilityBinding as CurrentCapabilityBinding, CurrentSourceMap, ExecutionProfile,
    FactClassification, MappingError, ScreenBinding as CurrentScreenBinding,
    SourceBinding as CurrentSourceBinding, CONTRACT_VERSION as CURRENT_SOURCE_CONTRACT_VERSION,
};
use edge_auth::{DelegatedClaims, DelegationVerifier, RequiredRead};
use execution_contracts::{
    CanonicalId, CapabilitySnapshot, CapabilityState, ContractWarning, DeliveryProfile,
    ExecutionReadCapability, FreshnessState, PanelState, SourceAuthority, SourceCompleteness,
};
use futures_util::stream;
use intercell_gateway::current_acceptance::{CurrentAcceptanceError, CurrentGatewayAcceptance};
use manager_compat_authority::{
    AuthorityError as ManagerAuthorityError, BoundManagerAuthority, DeploymentEnvironment,
    ManagerCompatibilityAuthority, ManagerRequestContext, DELEGATED_RESOURCE,
};
use manager_v2_client::{
    ManagerV2Client, ManagerV2ClientConfig, ManagerV2ClientError, ManagerV2ClientLimits,
};
use manager_v2_contract::{
    ManagerCatalogue, ManagerPayload, ManagerRead, ManagerV2Request, OpaqueCursor, PageLimit,
    ProjectionKind, DEFAULT_PAGE_LIMIT, MAXIMUM_RESPONSE_BYTES,
};
use projection_core::{
    evaluate_freshness, resume_decision, FreshnessInput, FreshnessPolicy, ProjectionCursor,
    ProjectionScope, ResumeDecision, VenueSessionState,
};
use projection_store_pg::{
    AnalyticsReadRequirement, AnalyticsSourceRead, PgProjectionStore, RealtimeJournalRecord,
    RealtimeScopeAvailability, StoreError,
};
use query_api::{
    CursorCodec, EntityQueryRequest, FilterField, FilterOperator, ProjectionQueryPage, QueryError,
    QueryFilter, QuerySort,
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
use source_qualification::{
    realtime_activation::{
        accept_realtime_activation, AcceptedRealtimeActivation, RealtimeActivationEvidence,
    },
    shadow_screen::PAPER_WORKBENCH_SCREEN_ID as N07_PAPER_WORKBENCH_SCREEN_ID,
};
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
use uuid::Uuid;

const MAX_SECRET_FILE_BYTES: u64 = 1024 * 1024;
const ANALYTICS_SCREEN_SCHEMA_VERSION: &str = "execution.analytics.screen.v1";
const PAPER_WORKBENCH_SHADOW_SCHEMA_VERSION: &str = "execution.paper-workbench.shadow-panel.v1";
const PAPER_WORKBENCH_SCREEN_ID: &str = "EXECUTION_PAPER_WORKBENCH_SCREEN";
const MANAGER_V2_RESOURCE: &str = "execution:manager-v2:read";
const CURRENT_SOURCE_RESOURCE_PREFIX: &str = "execution:current-source:";

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
    realtime_activation: Option<AcceptedRealtimeActivation>,
    realtime_replay_limit: usize,
    realtime_heartbeat: Duration,
    realtime_epoch_jitter: Duration,
    realtime_freshness_policy: FreshnessPolicy,
    realtime_venue_session: VenueSessionState,
    analytics_query_enabled: RuntimeGate,
    analytics_source_profile: DeliveryProfile,
    shadow_query_enabled: RuntimeGate,
    paper_workbench_shadow_enabled: RuntimeGate,
    query_cursor_codec: Option<CursorCodec>,
    shadow_query_freshness_policy: FreshnessPolicy,
    manager_v2_client: Option<ManagerV2Client>,
    manager_v2_profile_id: Option<String>,
    manager_compatibility: Arc<ManagerCompatibilityAuthority>,
    current_source_map: Arc<CurrentSourceMap>,
    current_gateway_acceptance: Arc<CurrentGatewayAcceptance>,
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
    manager_v2_read_enabled: RuntimeGate,
    manager_v2_profile_id: Option<String>,
    probe_alpha_id: Option<String>,
    probe_interval: Duration,
    transport_limits: TransportLimits,
    projection_ingestion_enabled: RuntimeGate,
    projection_database_url_file: Option<PathBuf>,
    realtime_sse_enabled: RuntimeGate,
    realtime_activation_manifest_file: Option<PathBuf>,
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
    shadow_query_enabled: RuntimeGate,
    paper_workbench_shadow_enabled: RuntimeGate,
    query_cursor_keys_file: Option<PathBuf>,
    query_cursor_active_key_id: String,
    query_cursor_ttl: Duration,
    shadow_query_freshness_policy: FreshnessPolicy,
}

struct RuntimeFeatureConfig {
    source_probes_enabled: RuntimeGate,
    projection_ingestion_enabled: RuntimeGate,
    projection_database_url_file: Option<PathBuf>,
    realtime_sse_enabled: RuntimeGate,
    realtime_activation_manifest_file: Option<PathBuf>,
    analytics_query_enabled: RuntimeGate,
    analytics_source_profile: DeliveryProfile,
    shadow_query_enabled: RuntimeGate,
    paper_workbench_shadow_enabled: RuntimeGate,
    query_cursor_keys_file: Option<PathBuf>,
    query_cursor_active_key_id: String,
    query_cursor_ttl: Duration,
    shadow_query_freshness_policy: FreshnessPolicy,
}

impl EdgeConfig {
    fn projection_store_required(&self) -> RuntimeGate {
        RuntimeGate::from(
            self.projection_ingestion_enabled.is_enabled()
                || self.realtime_sse_enabled.is_enabled()
                || self.analytics_query_enabled.is_enabled()
                || self.shadow_query_enabled.is_enabled(),
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
        let runtime = runtime_features_from_environment()?;
        let manager_v2_read_enabled =
            RuntimeGate::from(strict_boolean("EDGE_MANAGER_V2_READ_ENABLED", false)?);
        let manager_v2_profile_id =
            manager_v2_profile_from_environment(&environment, manager_v2_read_enabled)?;
        let (realtime_freshness_policy, realtime_venue_session) =
            realtime_freshness_from_environment()?;
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
            source_probes_enabled: runtime.source_probes_enabled,
            manager_v2_read_enabled,
            manager_v2_profile_id,
            probe_alpha_id: optional("EDGE_PROBE_ALPHA_ID"),
            probe_interval: Duration::from_secs(probe_interval_seconds as u64),
            transport_limits: transport_limits_from_environment()?,
            projection_ingestion_enabled: runtime.projection_ingestion_enabled,
            projection_database_url_file: runtime.projection_database_url_file,
            realtime_sse_enabled: runtime.realtime_sse_enabled,
            realtime_activation_manifest_file: runtime.realtime_activation_manifest_file,
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
            analytics_query_enabled: runtime.analytics_query_enabled,
            analytics_source_profile: runtime.analytics_source_profile,
            shadow_query_enabled: runtime.shadow_query_enabled,
            paper_workbench_shadow_enabled: runtime.paper_workbench_shadow_enabled,
            query_cursor_keys_file: runtime.query_cursor_keys_file,
            query_cursor_active_key_id: runtime.query_cursor_active_key_id,
            query_cursor_ttl: runtime.query_cursor_ttl,
            shadow_query_freshness_policy: runtime.shadow_query_freshness_policy,
        })
    }
}

fn runtime_features_from_environment() -> Result<RuntimeFeatureConfig, ConfigError> {
    let source_probes_enabled =
        RuntimeGate::from(strict_boolean("EDGE_SOURCE_PROBES_ENABLED", false)?);
    let projection_ingestion_enabled =
        RuntimeGate::from(strict_boolean("EDGE_PROJECTION_INGESTION_ENABLED", false)?);
    let realtime_sse_enabled =
        RuntimeGate::from(strict_boolean("EDGE_REALTIME_SSE_ENABLED", false)?);
    let realtime_activation_manifest_file = optional_path("EDGE_REALTIME_ACTIVATION_MANIFEST_FILE");
    let analytics_query_enabled =
        RuntimeGate::from(strict_boolean("EDGE_ANALYTICS_QUERY_ENABLED", false)?);
    let shadow_query_enabled =
        RuntimeGate::from(strict_boolean("EDGE_SHADOW_QUERY_ENABLED", false)?);
    let paper_workbench_shadow_enabled = RuntimeGate::from(strict_boolean(
        "EDGE_PAPER_WORKBENCH_SHADOW_ENABLED",
        false,
    )?);
    if paper_workbench_shadow_enabled.is_enabled() && !shadow_query_enabled.is_enabled() {
        return Err(ConfigError::Invalid("EDGE_PAPER_WORKBENCH_SHADOW_ENABLED"));
    }
    validate_realtime_runtime_dependencies(
        realtime_sse_enabled,
        projection_ingestion_enabled,
        shadow_query_enabled,
        paper_workbench_shadow_enabled,
    )?;
    if strict_boolean("EDGE_COMMAND_RELAY_ENABLED", false)? {
        return Err(ConfigError::Invalid("EDGE_COMMAND_RELAY_ENABLED"));
    }
    let projection_database_url_file = optional_path("EDGE_PROJECTION_DATABASE_URL_FILE");
    if (projection_ingestion_enabled.is_enabled()
        || realtime_sse_enabled.is_enabled()
        || analytics_query_enabled.is_enabled()
        || shadow_query_enabled.is_enabled())
        && projection_database_url_file.is_none()
    {
        return Err(ConfigError::Missing("EDGE_PROJECTION_DATABASE_URL_FILE"));
    }
    if realtime_sse_enabled.is_enabled() && realtime_activation_manifest_file.is_none() {
        return Err(ConfigError::Missing(
            "EDGE_REALTIME_ACTIVATION_MANIFEST_FILE",
        ));
    }
    let query_cursor_keys_file = optional_path("EDGE_QUERY_CURSOR_KEYS_FILE");
    if shadow_query_enabled.is_enabled() && query_cursor_keys_file.is_none() {
        return Err(ConfigError::Missing("EDGE_QUERY_CURSOR_KEYS_FILE"));
    }
    let shadow_query_freshness_policy = FreshnessPolicy {
        policy_version: value_or(
            "EDGE_SHADOW_QUERY_FRESHNESS_POLICY_VERSION",
            "paper.shadow-query.v1",
        ),
        warning_after_ms: bounded_i64(
            "EDGE_SHADOW_QUERY_FRESHNESS_WARNING_AFTER_MS",
            5_000,
            0,
            86_400_000,
        )?,
        stale_after_ms: bounded_i64(
            "EDGE_SHADOW_QUERY_FRESHNESS_STALE_AFTER_MS",
            30_000,
            1,
            86_400_000,
        )?,
        maximum_future_skew_ms: bounded_i64(
            "EDGE_SHADOW_QUERY_MAXIMUM_FUTURE_SKEW_MS",
            2_000,
            0,
            60_000,
        )?,
    };
    shadow_query_freshness_policy
        .validate()
        .map_err(|_| ConfigError::Invalid("EDGE_SHADOW_QUERY_FRESHNESS_POLICY"))?;
    Ok(RuntimeFeatureConfig {
        source_probes_enabled,
        projection_ingestion_enabled,
        projection_database_url_file,
        realtime_sse_enabled,
        realtime_activation_manifest_file,
        analytics_query_enabled,
        analytics_source_profile: delivery_profile(&value_or(
            "EDGE_ANALYTICS_SOURCE_PROFILE",
            "fixture",
        ))?,
        shadow_query_enabled,
        paper_workbench_shadow_enabled,
        query_cursor_keys_file,
        query_cursor_active_key_id: value_or("EDGE_QUERY_CURSOR_ACTIVE_KEY_ID", "shadow-q1"),
        query_cursor_ttl: Duration::from_secs(bounded_usize(
            "EDGE_QUERY_CURSOR_TTL_SECONDS",
            300,
            30,
            3_600,
        )? as u64),
        shadow_query_freshness_policy,
    })
}

fn validate_realtime_runtime_dependencies(
    realtime_sse_enabled: RuntimeGate,
    projection_ingestion_enabled: RuntimeGate,
    shadow_query_enabled: RuntimeGate,
    paper_workbench_shadow_enabled: RuntimeGate,
) -> Result<(), ConfigError> {
    if realtime_sse_enabled.is_enabled()
        && (!projection_ingestion_enabled.is_enabled()
            || !shadow_query_enabled.is_enabled()
            || !paper_workbench_shadow_enabled.is_enabled())
    {
        return Err(ConfigError::Invalid("EDGE_REALTIME_SSE_ENABLED"));
    }
    Ok(())
}

fn manager_v2_profile_from_environment(
    environment: &str,
    manager_v2_read_enabled: RuntimeGate,
) -> Result<Option<String>, ConfigError> {
    let profile_id = optional("EDGE_MANAGER_V2_PROFILE_ID");
    if manager_v2_read_enabled.is_enabled()
        && !profile_id
            .as_deref()
            .is_some_and(|value| manager_profile_matches_environment(environment, value))
    {
        return Err(ConfigError::Invalid("EDGE_MANAGER_V2_PROFILE_ID"));
    }
    Ok(profile_id)
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
    let EdgeTlsMaterial {
        certificate,
        private_key,
        client_ca,
    } = edge_tls_material(&config)?;
    let jwks = read_text(&config.delegation_jwks_file)?;
    let projection_store = connect_projection_store(&config).await?;
    let query_cursor_codec = query_cursor_codec(&config)?;
    let realtime_activation = load_realtime_activation(&config)?;

    let verifier = DelegationVerifier::from_jwks_json(
        &jwks,
        &config.delegation_issuer,
        &config.delegation_audience,
        config.delegation_maximum_ttl_seconds,
        3,
    )?;
    let (negotiator, manager_v2_client) = source_clients(&config)?;
    let manager_compatibility = Arc::new(ManagerCompatibilityAuthority::canonical()?);
    let current_source_map = Arc::new(CurrentSourceMap::canonical()?);
    let current_gateway_acceptance = Arc::new(CurrentGatewayAcceptance::canonical()?);
    // N16B is compatibility-only. Loading the immutable contract at startup
    // catches source-pack drift, while EDGE_COMMAND_RELAY_ENABLED remains
    // unconditionally rejected by runtime configuration until N17B.
    let _current_protective_acceptance = CurrentProtectiveAcceptance::canonical()?;
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
        realtime_activation,
        realtime_replay_limit: config.realtime_replay_limit,
        realtime_heartbeat: config.realtime_heartbeat,
        realtime_epoch_jitter: config.realtime_epoch_jitter,
        realtime_freshness_policy: config.realtime_freshness_policy.clone(),
        realtime_venue_session: config.realtime_venue_session,
        analytics_query_enabled: config.analytics_query_enabled,
        analytics_source_profile: config.analytics_source_profile,
        shadow_query_enabled: config.shadow_query_enabled,
        paper_workbench_shadow_enabled: config.paper_workbench_shadow_enabled,
        query_cursor_codec,
        shadow_query_freshness_policy: config.shadow_query_freshness_policy.clone(),
        manager_v2_client,
        manager_v2_profile_id: config.manager_v2_profile_id.clone(),
        manager_compatibility,
        current_source_map,
        current_gateway_acceptance,
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

struct EdgeTlsMaterial {
    certificate: Vec<u8>,
    private_key: Vec<u8>,
    client_ca: Vec<u8>,
}

fn edge_tls_material(config: &EdgeConfig) -> Result<EdgeTlsMaterial, ServiceError> {
    Ok(EdgeTlsMaterial {
        certificate: read_file(&config.tls_certificate_file)?,
        private_key: read_file(&config.tls_private_key_file)?,
        client_ca: read_file(&config.tls_client_ca_file)?,
    })
}

fn source_clients(
    config: &EdgeConfig,
) -> Result<(CapabilityNegotiator, Option<ManagerV2Client>), ServiceError> {
    let source_material = source_material(config)?;
    let source_client = BoundedSourceClient::new(SourceTransportConfig {
        source_origin: &config.source_origin,
        root_ca_pem: &source_material.ca,
        client_identity_pem: source_material.identity.as_deref(),
        source_api_key: source_material.api_key.as_deref().map(str::trim),
        observed_gateway_digest: &config.source_gateway_digest,
        limits: config.transport_limits.clone(),
    })?;
    let manager_v2_client = manager_v2_client_from_config(
        config,
        &source_material.ca,
        source_material.identity.as_deref(),
    )?;
    Ok((CapabilityNegotiator::new(source_client), manager_v2_client))
}

struct SourceMaterial {
    ca: Vec<u8>,
    identity: Option<Vec<u8>>,
    api_key: Option<String>,
}

fn source_material(config: &EdgeConfig) -> Result<SourceMaterial, ServiceError> {
    Ok(SourceMaterial {
        ca: read_file(&config.source_ca_file)?,
        identity: config
            .source_client_identity_file
            .as_deref()
            .map(read_file)
            .transpose()?,
        api_key: config
            .source_api_key_file
            .as_deref()
            .map(read_text)
            .transpose()?,
    })
}

fn manager_v2_client_from_config(
    config: &EdgeConfig,
    source_ca: &[u8],
    source_identity: Option<&[u8]>,
) -> Result<Option<ManagerV2Client>, ServiceError> {
    if !config.manager_v2_read_enabled.is_enabled() {
        return Ok(None);
    }
    let client_identity_pem =
        source_identity.ok_or(ConfigError::Missing("EDGE_SOURCE_CLIENT_IDENTITY_FILE"))?;
    let profile_id = config
        .manager_v2_profile_id
        .as_deref()
        .ok_or(ConfigError::Missing("EDGE_MANAGER_V2_PROFILE_ID"))?;
    Ok(Some(ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: &config.source_origin,
        profile_id,
        root_ca_pem: source_ca,
        client_identity_pem,
        limits: ManagerV2ClientLimits::default(),
    })?))
}

async fn connect_projection_store(
    config: &EdgeConfig,
) -> Result<Option<PgProjectionStore>, ServiceError> {
    if !config.projection_ingestion_enabled.is_enabled()
        && !config.realtime_sse_enabled.is_enabled()
        && !config.analytics_query_enabled.is_enabled()
        && !config.shadow_query_enabled.is_enabled()
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

fn query_cursor_codec(config: &EdgeConfig) -> Result<Option<CursorCodec>, ServiceError> {
    if !config.shadow_query_enabled.is_enabled() {
        return Ok(None);
    }
    let path = config
        .query_cursor_keys_file
        .as_deref()
        .ok_or(ConfigError::Missing("EDGE_QUERY_CURSOR_KEYS_FILE"))?;
    let raw = read_text(path)?;
    let serialized: BTreeMap<String, String> = serde_json::from_str(&raw)
        .map_err(|_| ConfigError::Invalid("EDGE_QUERY_CURSOR_KEYS_FILE"))?;
    let keys = serialized
        .into_iter()
        .map(|(key_id, secret)| (key_id, secret.into_bytes()))
        .collect();
    CursorCodec::new(
        config.query_cursor_active_key_id.clone(),
        keys,
        config.query_cursor_ttl,
    )
    .map(Some)
    .map_err(ServiceError::Query)
}

fn load_realtime_activation(
    config: &EdgeConfig,
) -> Result<Option<AcceptedRealtimeActivation>, ServiceError> {
    if !config.realtime_sse_enabled.is_enabled() {
        return Ok(None);
    }
    let path = config
        .realtime_activation_manifest_file
        .as_deref()
        .ok_or(ConfigError::Missing(
            "EDGE_REALTIME_ACTIVATION_MANIFEST_FILE",
        ))?;
    let raw = read_text(path)?;
    let evidence: RealtimeActivationEvidence = serde_json::from_str(&raw)
        .map_err(|_| ConfigError::Invalid("EDGE_REALTIME_ACTIVATION_MANIFEST_FILE"))?;
    accept_realtime_activation(evidence)
        .map(Some)
        .map_err(|_| ConfigError::Invalid("EDGE_REALTIME_ACTIVATION_MANIFEST_FILE").into())
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
        .route("/internal/v1/realtime/snapshot", get(realtime_snapshot))
        .route("/internal/v2/manager/catalogue", get(manager_catalogue))
        .route(
            "/internal/v2/manager/capabilities",
            get(manager_capabilities),
        )
        .route(
            "/internal/v2/manager/projections/:kind",
            get(manager_projection),
        )
        .route(
            "/internal/v2/manager/relations/:schema/:relation",
            get(manager_relation_records),
        )
        .route(
            "/internal/v1/current-source/screens/:screen_id",
            get(current_source_screen),
        )
        .route(
            "/internal/v1/current-source/screens/:screen_id/sources/:source_id/relations/:relation",
            get(current_source_relation),
        )
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
        .route(
            "/internal/v1/screens/paper-workbench/:deployment_id/:panel/query",
            post(paper_workbench_shadow_query),
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ManagerPageQuery {
    limit: Option<u16>,
    cursor: Option<String>,
}

#[derive(Serialize)]
struct ManagerProblemBody {
    error: ManagerProblem,
}

#[derive(Serialize)]
struct ManagerProblem {
    code: &'static str,
    message: &'static str,
}

#[derive(Debug, Serialize)]
struct CurrentSourceScreenResponse<'a> {
    schema_version: &'static str,
    authority: &'static str,
    environment: &'a str,
    profile_id: &'a str,
    profile_baseline: FactClassification,
    screen: &'a CurrentScreenBinding,
    capabilities: Vec<&'a CurrentCapabilityBinding>,
    sources: Vec<&'a CurrentSourceBinding>,
}

#[derive(Debug, Serialize)]
struct CurrentSourceRelationResponse<T: Serialize> {
    schema_version: &'static str,
    authority: &'static str,
    environment: String,
    profile_id: String,
    screen_id: String,
    source_id: String,
    adapter: AdapterKind,
    relation: String,
    classification: FactClassification,
    availability: &'static str,
    source: T,
}

struct CurrentSourceRelationContext {
    environment: String,
    profile_id: String,
    screen_id: String,
    source_id: String,
    adapter: AdapterKind,
    relation: String,
}

#[derive(Debug, Serialize)]
struct CurrentSourceProblemBody {
    error: CurrentSourceProblem,
}

#[derive(Debug, Serialize)]
struct CurrentSourceProblem {
    code: &'static str,
    message: &'static str,
    classification: FactClassification,
    availability: &'static str,
    reason_code: Option<String>,
}

async fn current_source_screen(
    State(state): State<AppState>,
    AxumPath(screen_id): AxumPath<String>,
    headers: HeaderMap,
) -> Response {
    let profile = match current_source_authorize(&state, &headers, &screen_id) {
        Ok(profile) => profile,
        Err(response) => return response,
    };
    let Ok(screen) = state.current_source_map.screen(&screen_id) else {
        return current_source_problem(
            StatusCode::NOT_FOUND,
            "CURRENT_SOURCE_SCREEN_UNKNOWN",
            "The requested screen is not part of the current-source contract.",
            FactClassification::SourceDoesNotCurrentlyExist,
            "UNAVAILABLE",
            None,
        );
    };
    let capabilities_by_id = state.current_source_map.capabilities_by_id();
    let capabilities = screen
        .read_capabilities
        .iter()
        .chain(screen.action_capabilities.iter())
        .filter_map(|id| capabilities_by_id.get(id.as_str()).copied())
        .collect::<Vec<_>>();
    let source_ids = capabilities
        .iter()
        .flat_map(|capability| capability.source_bindings.iter())
        .collect::<BTreeSet<_>>();
    let sources = state
        .current_source_map
        .source_bindings
        .iter()
        .filter(|source| source_ids.contains(&source.id))
        .collect::<Vec<_>>();
    manager_json_response(
        StatusCode::OK,
        CurrentSourceScreenResponse {
            schema_version: CURRENT_SOURCE_CONTRACT_VERSION,
            authority: "PORTAL_EXECUTION_EDGE",
            environment: &state.environment,
            profile_id: &profile.manager_profile_id,
            profile_baseline: profile.baseline,
            screen,
            capabilities,
            sources,
        },
    )
}

async fn current_source_relation(
    State(state): State<AppState>,
    AxumPath((screen_id, source_id, relation)): AxumPath<(String, String, String)>,
    Query(query): Query<ManagerPageQuery>,
    headers: HeaderMap,
) -> Response {
    let profile = match current_source_authorize(&state, &headers, &screen_id) {
        Ok(profile) => profile,
        Err(response) => return response,
    };
    let Ok(source) = state
        .current_source_map
        .screen_source(&screen_id, &source_id)
    else {
        return current_source_problem(
            StatusCode::NOT_FOUND,
            "CURRENT_SOURCE_BINDING_UNKNOWN",
            "The source is not bound to the requested screen.",
            FactClassification::SourceDoesNotCurrentlyExist,
            "UNAVAILABLE",
            None,
        );
    };
    current_source_relation_from_manager(
        &state, screen_id, source_id, relation, query, profile, source,
    )
    .await
}

async fn current_source_relation_from_manager(
    state: &AppState,
    screen_id: String,
    source_id: String,
    relation: String,
    query: ManagerPageQuery,
    profile: &current_source_compat::ProfileBinding,
    source: &CurrentSourceBinding,
) -> Response {
    if source.adapter != AdapterKind::ManagerV2 {
        return current_source_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "CURRENT_SOURCE_ADAPTER_NOT_ACTIVATED",
            "The mapped source adapter is not activated in this Edge runtime.",
            FactClassification::SupportedButNotActivated,
            "UNAVAILABLE",
            None,
        );
    }
    let relation_id = format!("public.{relation}");
    if !source.relations.contains(&relation_id) {
        return current_source_problem(
            StatusCode::NOT_FOUND,
            "CURRENT_SOURCE_RELATION_UNKNOWN",
            "The relation is not part of the selected screen source binding.",
            FactClassification::SourceDoesNotCurrentlyExist,
            "UNAVAILABLE",
            None,
        );
    }
    let Some(client) = state.manager_v2_client.as_ref() else {
        return current_source_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "CURRENT_SOURCE_MANAGER_NOT_ACTIVATED",
            "The Manager-v2 source is not activated for this profile.",
            FactClassification::SupportedButNotActivated,
            "UNAVAILABLE",
            None,
        );
    };
    let limit = match manager_page_limit(query.limit) {
        Ok(limit) => limit,
        Err(response) => return response,
    };
    let catalogue = match fetch_manager_catalogue(client).await {
        Ok(catalogue) => catalogue,
        Err(response) => return response,
    };
    let manager_authority = match bind_manager_authority(state, &profile.manager_profile_id) {
        Ok(authority) => authority,
        Err(response) => return response,
    };
    if let Err(error) = manager_authority.validate_catalogue(&catalogue) {
        return manager_authority_error_response(&error);
    }
    if let Err(error) = state
        .current_source_map
        .validate_manager_source(source, &catalogue)
    {
        return current_source_mapping_error(&error);
    }
    let Some(catalogued_relation) = catalogue.relation("public", &relation) else {
        return current_source_problem(
            StatusCode::BAD_GATEWAY,
            "CURRENT_SOURCE_CATALOGUE_DRIFT",
            "The pinned relation is absent from the authenticated Manager catalogue.",
            FactClassification::SupportedButNotActivated,
            "UNAVAILABLE",
            None,
        );
    };
    let Ok(cursor) = query
        .cursor
        .map(|value| OpaqueCursor::from_relation_round_trip(value, catalogued_relation))
        .transpose()
    else {
        return current_source_problem(
            StatusCode::BAD_REQUEST,
            "CURRENT_SOURCE_CURSOR_INVALID",
            "The cursor is not valid for the selected relation and catalogue.",
            FactClassification::Connected,
            "UNAVAILABLE",
            None,
        );
    };
    let Ok(request) =
        manager_authority.relation_page_request(&catalogue, &relation_id, cursor.as_ref(), limit)
    else {
        return current_source_problem(
            StatusCode::BAD_REQUEST,
            "CURRENT_SOURCE_CURSOR_INVALID",
            "The cursor is not valid for the selected relation and catalogue.",
            FactClassification::Connected,
            "UNAVAILABLE",
            None,
        );
    };
    let context = CurrentSourceRelationContext {
        environment: state.environment.clone(),
        profile_id: profile.manager_profile_id.clone(),
        screen_id,
        source_id,
        adapter: source.adapter,
        relation: relation_id,
    };
    current_source_manager_read_response(client.execute(&request).await, context)
}

fn current_source_manager_read_response(
    read: Result<ManagerRead, ManagerV2ClientError>,
    context: CurrentSourceRelationContext,
) -> Response {
    match read {
        Ok(ManagerRead::Available(ManagerPayload::RelationRecords(envelope))) => {
            manager_json_response(
                StatusCode::OK,
                CurrentSourceRelationResponse {
                    schema_version: CURRENT_SOURCE_CONTRACT_VERSION,
                    authority: "PORTAL_EXECUTION_EDGE",
                    environment: context.environment,
                    profile_id: context.profile_id,
                    screen_id: context.screen_id,
                    source_id: context.source_id,
                    adapter: context.adapter,
                    relation: context.relation,
                    classification: FactClassification::Connected,
                    availability: "AVAILABLE",
                    source: envelope,
                },
            )
        }
        Ok(ManagerRead::Available(_)) => current_source_problem(
            StatusCode::BAD_GATEWAY,
            "CURRENT_SOURCE_PAYLOAD_MISMATCH",
            "Manager returned a payload for a different operation.",
            FactClassification::Connected,
            "UNAVAILABLE",
            None,
        ),
        Ok(ManagerRead::Unavailable(unavailable)) => current_source_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "CURRENT_SOURCE_UNAVAILABLE",
            "The mapped current source is temporarily unavailable.",
            FactClassification::Connected,
            "UNAVAILABLE",
            Some(unavailable.reason_code().to_owned()),
        ),
        Err(error) => current_source_client_error(&error),
    }
}

fn current_source_authorize<'a>(
    state: &'a AppState,
    headers: &HeaderMap,
    screen_id: &str,
) -> Result<&'a current_source_compat::ProfileBinding, Response> {
    let token = bearer(headers).ok_or_else(|| StatusCode::UNAUTHORIZED.into_response())?;
    let resource = format!("{CURRENT_SOURCE_RESOURCE_PREFIX}{screen_id}:read");
    let claims = state
        .verifier
        .verify_read(
            token,
            &RequiredRead {
                environment: &state.environment,
                resource: Some(&resource),
            },
        )
        .map_err(|_| StatusCode::FORBIDDEN.into_response())?;
    let profile = current_execution_profile(&state.environment).ok_or_else(|| {
        current_source_problem(
            StatusCode::INTERNAL_SERVER_ERROR,
            "CURRENT_SOURCE_ENVIRONMENT_INVALID",
            "The Edge environment cannot be mapped to an Execution profile.",
            FactClassification::SourceDoesNotCurrentlyExist,
            "UNAVAILABLE",
            None,
        )
    })?;
    let binding = state
        .current_source_map
        .profile(profile)
        .map_err(|error| current_source_mapping_error(&error))?;
    if claims.profile_id.as_deref() != Some(binding.manager_profile_id.as_str())
        || state.manager_v2_profile_id.as_deref() != Some(binding.manager_profile_id.as_str())
    {
        return Err(StatusCode::FORBIDDEN.into_response());
    }
    state
        .current_gateway_acceptance
        .authorize_query(&state.environment, &binding.manager_profile_id, screen_id)
        .map_err(|_| {
            current_source_problem(
                StatusCode::NOT_FOUND,
                "CURRENT_SOURCE_QUERY_NOT_ACCEPTED",
                "The requested screen is outside the accepted current Query release.",
                FactClassification::SupportedButNotActivated,
                "UNAVAILABLE",
                Some("N15B_QUERY_CAPABILITY_NOT_ACCEPTED".to_owned()),
            )
        })?;
    Ok(binding)
}

fn current_execution_profile(environment: &str) -> Option<ExecutionProfile> {
    match environment {
        "paper" => Some(ExecutionProfile::Paper),
        "sandbox" => Some(ExecutionProfile::Sandbox),
        "live" => Some(ExecutionProfile::Live),
        _ => None,
    }
}

fn current_source_mapping_error(error: &MappingError) -> Response {
    let code = match error {
        MappingError::ManagerRelationMissing(_) => "CURRENT_SOURCE_CATALOGUE_DRIFT",
        _ => "CURRENT_SOURCE_CONTRACT_REJECTED",
    };
    current_source_problem(
        StatusCode::BAD_GATEWAY,
        code,
        "The current-source mapping does not match its authenticated source.",
        FactClassification::SupportedButNotActivated,
        "UNAVAILABLE",
        None,
    )
}

fn current_source_client_error(error: &ManagerV2ClientError) -> Response {
    let (status, code) = match error {
        ManagerV2ClientError::QueueSaturated
        | ManagerV2ClientError::QueueClosed
        | ManagerV2ClientError::RequestFailed => (
            StatusCode::SERVICE_UNAVAILABLE,
            "CURRENT_SOURCE_TRANSPORT_UNAVAILABLE",
        ),
        _ => (
            StatusCode::BAD_GATEWAY,
            "CURRENT_SOURCE_UPSTREAM_CONTRACT_REJECTED",
        ),
    };
    current_source_problem(
        status,
        code,
        "The current source did not satisfy the bounded transport contract.",
        FactClassification::Connected,
        "UNAVAILABLE",
        None,
    )
}

fn current_source_problem(
    status: StatusCode,
    code: &'static str,
    message: &'static str,
    classification: FactClassification,
    availability: &'static str,
    reason_code: Option<String>,
) -> Response {
    manager_json_response(
        status,
        CurrentSourceProblemBody {
            error: CurrentSourceProblem {
                code,
                message,
                classification,
                availability,
                reason_code,
            },
        },
    )
}

async fn manager_catalogue(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let access = match manager_request_client(&state, &headers) {
        Ok(access) => access,
        Err(response) => return response,
    };
    manager_catalogue_response(
        access
            .client
            .execute(&access.authority.catalogue_request())
            .await,
        &access.authority,
    )
}

async fn manager_capabilities(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let access = match manager_request_client(&state, &headers) {
        Ok(access) => access,
        Err(response) => return response,
    };
    manager_capabilities_response(
        access
            .client
            .execute(&access.authority.capabilities_request())
            .await,
        &access.authority,
    )
}

async fn manager_projection(
    State(state): State<AppState>,
    AxumPath(kind): AxumPath<String>,
    Query(query): Query<ManagerPageQuery>,
    headers: HeaderMap,
) -> Response {
    let access = match manager_request_client(&state, &headers) {
        Ok(access) => access,
        Err(response) => return response,
    };
    let Some(kind) = ProjectionKind::from_path_segment(&kind) else {
        return manager_problem(
            StatusCode::BAD_REQUEST,
            "MANAGER_V2_INVALID_PROJECTION",
            "The requested Manager projection is not part of the fixed contract.",
        );
    };
    let limit = match manager_page_limit(query.limit) {
        Ok(limit) => limit,
        Err(response) => return response,
    };
    let catalogue = match fetch_manager_catalogue(access.client).await {
        Ok(catalogue) => catalogue,
        Err(response) => return response,
    };
    let Ok(cursor) = query
        .cursor
        .map(|value| OpaqueCursor::from_projection_round_trip(value, &catalogue, kind))
        .transpose()
    else {
        return manager_problem(
            StatusCode::BAD_REQUEST,
            "MANAGER_V2_INVALID_CURSOR",
            "The Manager pagination cursor is invalid for this request.",
        );
    };
    let Ok(request) = access
        .authority
        .projection_request(&catalogue, kind, cursor.as_ref(), limit)
    else {
        return manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_AUTHORITY_REJECTED",
            "The Manager projection is not accepted by the compatibility authority.",
        );
    };
    manager_read_response(
        access.client.execute(&request).await,
        |payload| match payload {
            ManagerPayload::Projection(envelope) => Some(envelope),
            _ => None,
        },
    )
}

async fn manager_relation_records(
    State(state): State<AppState>,
    AxumPath((schema, relation)): AxumPath<(String, String)>,
    Query(query): Query<ManagerPageQuery>,
    headers: HeaderMap,
) -> Response {
    let access = match manager_request_client(&state, &headers) {
        Ok(access) => access,
        Err(response) => return response,
    };
    if !manager_identifier(&schema) || !manager_identifier(&relation) {
        return manager_problem(
            StatusCode::BAD_REQUEST,
            "MANAGER_V2_INVALID_RELATION",
            "The requested Manager relation is invalid.",
        );
    }
    let limit = match manager_page_limit(query.limit) {
        Ok(limit) => limit,
        Err(response) => return response,
    };
    let catalogue = match fetch_manager_catalogue(access.client).await {
        Ok(catalogue) => catalogue,
        Err(response) => return response,
    };
    let Some(catalogued_relation) = catalogue.relation(&schema, &relation) else {
        return manager_problem(
            StatusCode::NOT_FOUND,
            "MANAGER_V2_RELATION_NOT_CATALOGUED",
            "The requested relation is not present in the active Manager catalogue.",
        );
    };
    let Ok(cursor) = query
        .cursor
        .map(|value| OpaqueCursor::from_relation_round_trip(value, catalogued_relation))
        .transpose()
    else {
        return manager_problem(
            StatusCode::BAD_REQUEST,
            "MANAGER_V2_INVALID_CURSOR",
            "The Manager pagination cursor is invalid for this relation.",
        );
    };
    let relation_id = format!("{schema}.{relation}");
    let Ok(request) =
        access
            .authority
            .relation_page_request(&catalogue, &relation_id, cursor.as_ref(), limit)
    else {
        return manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_AUTHORITY_REJECTED",
            "The Manager relation is not accepted by the compatibility authority.",
        );
    };
    manager_read_response(
        access.client.execute(&request).await,
        |payload| match payload {
            ManagerPayload::RelationRecords(envelope) => Some(envelope),
            _ => None,
        },
    )
}

struct AuthorizedManagerRequest<'a> {
    client: &'a ManagerV2Client,
    authority: BoundManagerAuthority<'a>,
}

fn manager_request_client<'a>(
    state: &'a AppState,
    headers: &HeaderMap,
) -> Result<AuthorizedManagerRequest<'a>, Response> {
    let token = bearer(headers).ok_or_else(|| StatusCode::UNAUTHORIZED.into_response())?;
    let claims = state
        .verifier
        .verify_read(
            token,
            &RequiredRead {
                environment: &state.environment,
                resource: Some(MANAGER_V2_RESOURCE),
            },
        )
        .map_err(|_| StatusCode::FORBIDDEN.into_response())?;
    if claims.profile_id.as_deref() != state.manager_v2_profile_id.as_deref() {
        return Err(StatusCode::FORBIDDEN.into_response());
    }
    let client = state.manager_v2_client.as_ref().ok_or_else(|| {
        manager_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "MANAGER_V2_READ_DISABLED",
            "Manager read-through is disabled for this Edge runtime.",
        )
    })?;
    let profile_id = claims
        .profile_id
        .as_deref()
        .ok_or_else(|| StatusCode::FORBIDDEN.into_response())?;
    let authority = bind_manager_authority(state, profile_id)?;
    Ok(AuthorizedManagerRequest { client, authority })
}

fn bind_manager_authority<'a>(
    state: &'a AppState,
    profile_id: &str,
) -> Result<BoundManagerAuthority<'a>, Response> {
    let environment = DeploymentEnvironment::from_config(&state.environment).ok_or_else(|| {
        manager_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "MANAGER_COMPAT_ENVIRONMENT_DENIED",
            "The Edge deployment environment is not accepted by Manager compatibility policy.",
        )
    })?;
    state
        .manager_compatibility
        .bind(ManagerRequestContext {
            environment,
            profile_id,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: manager_v2_contract::RUNTIME_CONTRACT_REVISION,
        })
        .map_err(|error| manager_authority_error_response(&error))
}

fn manager_page_limit(value: Option<u16>) -> Result<PageLimit, Response> {
    PageLimit::new(value.unwrap_or(DEFAULT_PAGE_LIMIT)).map_err(|_| {
        manager_problem(
            StatusCode::BAD_REQUEST,
            "MANAGER_V2_INVALID_PAGE_LIMIT",
            "The Manager page limit must be between 1 and 200.",
        )
    })
}

fn manager_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
        && matches!(value.as_bytes().first(), Some(byte) if byte.is_ascii_alphabetic() || *byte == b'_')
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn manager_profile_matches_environment(environment: &str, profile_id: &str) -> bool {
    let expected_prefix = match environment {
        "paper" => "PAPER_",
        "sandbox" => "SANDBOX_",
        "live" => "LIVE_",
        _ => return false,
    };
    profile_id.starts_with(expected_prefix)
        && (expected_prefix.len() + 2..=128).contains(&profile_id.len())
        && profile_id
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

async fn fetch_manager_catalogue(client: &ManagerV2Client) -> Result<ManagerCatalogue, Response> {
    match client.execute(&ManagerV2Request::catalogue()).await {
        Ok(ManagerRead::Available(ManagerPayload::Catalogue(envelope))) => Ok(envelope.into_data()),
        Ok(ManagerRead::Available(_)) => Err(manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_UNEXPECTED_PAYLOAD",
            "Manager returned a response that does not match the requested operation.",
        )),
        Ok(ManagerRead::Unavailable(unavailable)) => Err(manager_json_response(
            StatusCode::SERVICE_UNAVAILABLE,
            unavailable,
        )),
        Err(error) => Err(manager_client_error_response(&error)),
    }
}

fn manager_catalogue_response(
    read: Result<ManagerRead, ManagerV2ClientError>,
    authority: &BoundManagerAuthority<'_>,
) -> Response {
    match read {
        Ok(ManagerRead::Available(ManagerPayload::Catalogue(envelope))) => {
            if let Err(error) = authority.validate_catalogue(envelope.data()) {
                return manager_authority_error_response(&error);
            }
            manager_json_response(StatusCode::OK, envelope)
        }
        Ok(ManagerRead::Available(_)) => manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_UNEXPECTED_PAYLOAD",
            "Manager returned a response that does not match the requested operation.",
        ),
        Ok(ManagerRead::Unavailable(unavailable)) => {
            manager_json_response(StatusCode::SERVICE_UNAVAILABLE, unavailable)
        }
        Err(error) => manager_client_error_response(&error),
    }
}

fn manager_capabilities_response(
    read: Result<ManagerRead, ManagerV2ClientError>,
    authority: &BoundManagerAuthority<'_>,
) -> Response {
    match read {
        Ok(ManagerRead::Available(ManagerPayload::Capabilities(envelope))) => {
            if let Err(error) = authority.validate_capabilities(envelope.data()) {
                return manager_authority_error_response(&error);
            }
            manager_json_response(StatusCode::OK, envelope)
        }
        Ok(ManagerRead::Available(_)) => manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_UNEXPECTED_PAYLOAD",
            "Manager returned a response that does not match the requested operation.",
        ),
        Ok(ManagerRead::Unavailable(unavailable)) => {
            manager_json_response(StatusCode::SERVICE_UNAVAILABLE, unavailable)
        }
        Err(error) => manager_client_error_response(&error),
    }
}

fn manager_authority_error_response(error: &ManagerAuthorityError) -> Response {
    let (status, code, message) = match error {
        ManagerAuthorityError::EnvironmentDenied
        | ManagerAuthorityError::ProfileDenied
        | ManagerAuthorityError::ResourceDenied
        | ManagerAuthorityError::AdapterNotDeployable => (
            StatusCode::FORBIDDEN,
            "MANAGER_COMPAT_BINDING_DENIED",
            "The Manager deployment binding is not authorized.",
        ),
        ManagerAuthorityError::TransportNotQualified => (
            StatusCode::SERVICE_UNAVAILABLE,
            "MANAGER_COMPAT_TRANSPORT_NOT_QUALIFIED",
            "The Manager transport has not been qualified for this deployment profile.",
        ),
        ManagerAuthorityError::RelationNotApproved => (
            StatusCode::NOT_FOUND,
            "MANAGER_COMPAT_RELATION_NOT_APPROVED",
            "The relation is not part of the frozen Manager compatibility surface.",
        ),
        ManagerAuthorityError::Contract(_) => (
            StatusCode::BAD_REQUEST,
            "MANAGER_COMPAT_REQUEST_INVALID",
            "The Manager request violates an opaque key, cursor or page bound.",
        ),
        _ => (
            StatusCode::BAD_GATEWAY,
            "MANAGER_COMPAT_SOURCE_DRIFT",
            "The Manager source no longer matches the accepted compatibility contract.",
        ),
    };
    manager_problem(status, code, message)
}

fn manager_read_response<T, F>(
    read: Result<ManagerRead, ManagerV2ClientError>,
    select: F,
) -> Response
where
    T: Serialize,
    F: FnOnce(ManagerPayload) -> Option<T>,
{
    match read {
        Ok(ManagerRead::Available(payload)) => match select(payload) {
            Some(payload) => manager_json_response(StatusCode::OK, payload),
            None => manager_problem(
                StatusCode::BAD_GATEWAY,
                "MANAGER_V2_UNEXPECTED_PAYLOAD",
                "Manager returned a response that does not match the requested operation.",
            ),
        },
        Ok(ManagerRead::Unavailable(unavailable)) => {
            manager_json_response(StatusCode::SERVICE_UNAVAILABLE, unavailable)
        }
        Err(error) => manager_client_error_response(&error),
    }
}

fn manager_client_error_response(error: &ManagerV2ClientError) -> Response {
    match error {
        ManagerV2ClientError::QueueSaturated
        | ManagerV2ClientError::QueueClosed
        | ManagerV2ClientError::RequestFailed => manager_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "MANAGER_V2_SOURCE_UNAVAILABLE",
            "Manager source is temporarily unavailable.",
        ),
        ManagerV2ClientError::InvalidSourceProxyOrigin
        | ManagerV2ClientError::InvalidProfileId
        | ManagerV2ClientError::MissingTrustAnchor
        | ManagerV2ClientError::InvalidTrustAnchor
        | ManagerV2ClientError::MissingClientIdentity
        | ManagerV2ClientError::InvalidClientIdentity
        | ManagerV2ClientError::UnsafeLimits
        | ManagerV2ClientError::ClientConfiguration
        | ManagerV2ClientError::RedirectDenied
        | ManagerV2ClientError::ContractHeaderMismatch
        | ManagerV2ClientError::InvalidContentType
        | ManagerV2ClientError::ResponseTooLarge
        | ManagerV2ClientError::UnexpectedHttpStatus(_)
        | ManagerV2ClientError::Contract(_) => manager_problem(
            StatusCode::BAD_GATEWAY,
            "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
            "Manager source response did not satisfy the fixed read contract.",
        ),
    }
}

fn manager_json_response<T: Serialize>(status: StatusCode, payload: T) -> Response {
    let body = match serde_json::to_vec(&payload) {
        Ok(body) if body.len() <= MAXIMUM_RESPONSE_BYTES => body,
        Ok(_) => {
            return manager_problem(
                StatusCode::BAD_GATEWAY,
                "MANAGER_V2_RESPONSE_LIMIT_EXCEEDED",
                "Manager response exceeded the published byte limit.",
            );
        }
        Err(_) => {
            return manager_problem(
                StatusCode::BAD_GATEWAY,
                "MANAGER_V2_RESPONSE_SERIALIZATION_FAILED",
                "Manager response could not be serialized safely.",
            );
        }
    };
    let mut response = (status, [("content-type", "application/json")], body).into_response();
    let headers = response.headers_mut();
    headers.insert("cache-control", HeaderValue::from_static("no-store"));
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    response
}

fn manager_problem(status: StatusCode, code: &'static str, message: &'static str) -> Response {
    (
        status,
        Json(ManagerProblemBody {
            error: ManagerProblem { code, message },
        }),
    )
        .into_response()
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
        AnalyticsError::InvalidSeriesRange => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_SERIES_RANGE_INVALID",
            "Analytics series range cannot be represented by the canonical interval ladder.",
        ),
        AnalyticsError::SeriesPointLimit { .. } => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_SERIES_POINT_LIMIT",
            "Analytics series exceeds the published point limit.",
        ),
        AnalyticsError::InvalidSeriesOrdering { .. }
        | AnalyticsError::InvalidSeriesBucket
        | AnalyticsError::UnexplainedSeriesGap => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_SERIES_GAP_UNEXPLAINED",
            "Analytics series ordering, bucket alignment or gap evidence is invalid.",
        ),
        AnalyticsError::ApprovedBandLineageMismatch | AnalyticsError::InvalidApprovedBand => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_APPROVED_BAND_LINEAGE_MISMATCH",
            "Approved research band lineage or bounds are invalid.",
        ),
        AnalyticsError::InvalidTileSeries(_) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_TILE_KIND_MISMATCH",
            "Insight series does not satisfy its semantic tile kind.",
        ),
        AnalyticsError::InvalidTileSampleState => (
            StatusCode::UNPROCESSABLE_ENTITY,
            "ANALYTICS_TILE_SAMPLE_STATE_INVALID",
            "Insight series and sample state are inconsistent.",
        ),
        AnalyticsError::ResponseSizeLimit { .. } => (
            StatusCode::PAYLOAD_TOO_LARGE,
            "ANALYTICS_RESPONSE_SIZE_LIMIT",
            "Analytics response exceeds the published size limit.",
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

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ShadowPanelQueryRequest {
    limit: u16,
    filters: Vec<QueryFilter>,
    sorts: Vec<QuerySort>,
    after: Option<String>,
    before: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
struct ScopedShadowQuery {
    request: EntityQueryRequest,
    required_filters: Vec<QueryFilter>,
}

impl ShadowPanelQueryRequest {
    fn into_scoped_query(
        self,
        deployment_id: &CanonicalId,
    ) -> Result<ScopedShadowQuery, StatusCode> {
        if self
            .filters
            .iter()
            .any(|filter| filter.field == FilterField::DeploymentId)
        {
            return Err(StatusCode::BAD_REQUEST);
        }
        Ok(ScopedShadowQuery {
            request: EntityQueryRequest {
                limit: self.limit,
                filters: self.filters,
                sorts: self.sorts,
                after: self.after,
                before: self.before,
            },
            required_filters: vec![QueryFilter {
                field: FilterField::DeploymentId,
                operator: FilterOperator::Eq,
                values: vec![deployment_id.as_str().to_owned()],
            }],
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum ShadowPanel {
    Orders,
    Positions,
}

impl ShadowPanel {
    fn parse(value: &str) -> Result<Self, StatusCode> {
        match value {
            "orders" => Ok(Self::Orders),
            "positions" => Ok(Self::Positions),
            _ => Err(StatusCode::NOT_FOUND),
        }
    }

    const fn entity_kind(self) -> projection_core::ProjectionEntityKind {
        match self {
            Self::Orders => projection_core::ProjectionEntityKind::Order,
            Self::Positions => projection_core::ProjectionEntityKind::Position,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PaperWorkbenchShadowEnvelope {
    schema_version: &'static str,
    screen_id: &'static str,
    delivery_profile: DeliveryProfile,
    deployment_id: String,
    panel: ShadowPanel,
    panel_state: PanelState,
    authority: &'static str,
    upstream_authorities: BTreeSet<SourceAuthority>,
    source_completeness: SourceCompleteness,
    poll_interval_ms: Option<i64>,
    freshness_state: FreshnessState,
    freshness_policy_version: String,
    age_seconds: Option<i64>,
    lag_ms: Option<i64>,
    read_at: DateTime<Utc>,
    epoch_id: Uuid,
    activation_manifest_digest: String,
    capability_snapshot_id: String,
    warnings: Vec<ContractWarning>,
    page: ProjectionQueryPage,
}

async fn paper_workbench_shadow_query(
    State(state): State<AppState>,
    AxumPath((raw_deployment_id, raw_panel)): AxumPath<(String, String)>,
    headers: HeaderMap,
    Json(body): Json<ShadowPanelQueryRequest>,
) -> Response {
    if !state.shadow_query_enabled.is_enabled()
        || !state.paper_workbench_shadow_enabled.is_enabled()
        || state.environment != "paper"
    {
        return shadow_problem(StatusCode::NOT_FOUND, "N07_SHADOW_SCREEN_DISABLED");
    }
    let deployment_id = match screen_identifier(raw_deployment_id) {
        Ok(value) => value,
        Err(status) => return shadow_problem(status, "N07_DEPLOYMENT_ID_INVALID"),
    };
    let panel = match ShadowPanel::parse(&raw_panel) {
        Ok(value) => value,
        Err(status) => return shadow_problem(status, "N07_PANEL_NOT_COMMISSIONED"),
    };
    let Some(token) = bearer(&headers) else {
        return shadow_problem(StatusCode::UNAUTHORIZED, "N07_AUTH_REQUIRED");
    };
    let resource = format!(
        "execution:screen:paper-workbench:{}",
        deployment_id.as_str()
    );
    let Ok(claims) = state.verifier.verify_read(
        token,
        &RequiredRead {
            environment: &state.environment,
            resource: Some(&resource),
        },
    ) else {
        return shadow_problem(StatusCode::FORBIDDEN, "N07_AUTH_SCOPE_DENIED");
    };
    let Ok(workspace_id) = CanonicalId::parse(claims.workspace_id) else {
        return shadow_problem(StatusCode::FORBIDDEN, "N07_WORKSPACE_INVALID");
    };
    let Ok(scope) = ProjectionScope::new(workspace_id, state.environment.clone()) else {
        return shadow_problem(StatusCode::FORBIDDEN, "N07_SCOPE_INVALID");
    };
    let Some(store) = state.projection_store.as_ref() else {
        return shadow_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "N07_PROJECTION_UNAVAILABLE",
        );
    };
    let Some(codec) = state.query_cursor_codec.as_ref() else {
        return shadow_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "N07_CURSOR_AUTHORITY_UNAVAILABLE",
        );
    };
    let authority = match store
        .active_shadow_screen_authority(&scope, PAPER_WORKBENCH_SCREEN_ID)
        .await
    {
        Ok(value) => value,
        Err(error) => return shadow_store_error(&error),
    };
    let query = match body.into_scoped_query(&deployment_id) {
        Ok(value) => value,
        Err(status) => return shadow_problem(status, "N07_QUERY_SCOPE_INVALID"),
    };
    let read_at = Utc::now();
    let page = match store
        .query_entities_scoped(
            &scope,
            panel.entity_kind(),
            &query.request,
            &query.required_filters,
            codec,
            read_at,
        )
        .await
    {
        Ok(value) if value.epoch_id == authority.epoch_id => value,
        Ok(_) => {
            return shadow_problem(
                StatusCode::SERVICE_UNAVAILABLE,
                "N07_EPOCH_CHANGED_RESNAPSHOT",
            )
        }
        Err(error) => return shadow_store_error(&error),
    };
    match build_shadow_envelope(
        &deployment_id,
        panel,
        authority,
        page,
        read_at,
        &state.shadow_query_freshness_policy,
    ) {
        Ok(value) => Json(value).into_response(),
        Err(_) => shadow_problem(StatusCode::INTERNAL_SERVER_ERROR, "N07_FRESHNESS_INVALID"),
    }
}

fn build_shadow_envelope(
    deployment_id: &CanonicalId,
    panel: ShadowPanel,
    authority: projection_store_pg::ShadowScreenAuthority,
    page: ProjectionQueryPage,
    read_at: DateTime<Utc>,
    policy: &FreshnessPolicy,
) -> Result<PaperWorkbenchShadowEnvelope, projection_core::ProjectionError> {
    let as_of = page.rows.iter().map(|row| row.as_of).max();
    let source_read_at = page.rows.iter().map(|row| row.source_read_at).max();
    let projected_at = page.rows.iter().map(|row| row.projected_at).max();
    let upstream_authorities = page
        .rows
        .iter()
        .map(|row| row.source_authority)
        .collect::<BTreeSet<_>>();
    let source_completeness = if page.rows.is_empty() {
        SourceCompleteness::Unknown
    } else if page
        .rows
        .iter()
        .all(|row| row.source_completeness == SourceCompleteness::EventSourced)
    {
        SourceCompleteness::EventSourced
    } else if page
        .rows
        .iter()
        .any(|row| row.source_completeness == SourceCompleteness::PollBounded)
    {
        SourceCompleteness::PollBounded
    } else {
        SourceCompleteness::Unknown
    };
    let poll_interval_ms = page
        .rows
        .iter()
        .filter_map(|row| row.poll_interval_ms)
        .max();
    let freshness = evaluate_freshness(
        policy,
        &FreshnessInput {
            as_of,
            read_at,
            source_received_at: source_read_at,
            projected_at,
            venue_session: VenueSessionState::Unknown,
        },
    )?;
    let mut warnings = freshness.warnings;
    if page.rows.is_empty() {
        warnings.push(shadow_warning(
            "EMPTY_SHADOW_PANEL",
            "No accepted projection rows match this deployment and panel query.",
        ));
    }
    if source_completeness == SourceCompleteness::PollBounded {
        warnings.push(shadow_warning(
            "POLL_BOUNDED_SOURCE",
            "The panel is a bounded poll projection, not an event-complete ledger.",
        ));
    }
    if page.retention.policy_version == "UNCONFIGURED" {
        warnings.push(shadow_warning(
            "RETENTION_UNCONFIGURED",
            "Retention authority is not published for this entity page.",
        ));
    }
    let panel_state = if page.rows.is_empty() {
        PanelState::Empty
    } else if freshness.state == FreshnessState::Stale {
        PanelState::Stale
    } else if source_completeness != SourceCompleteness::EventSourced {
        PanelState::Partial
    } else {
        PanelState::Ok
    };
    Ok(PaperWorkbenchShadowEnvelope {
        schema_version: PAPER_WORKBENCH_SHADOW_SCHEMA_VERSION,
        screen_id: PAPER_WORKBENCH_SCREEN_ID,
        delivery_profile: DeliveryProfile::Shadow,
        deployment_id: deployment_id.as_str().to_owned(),
        panel,
        panel_state,
        authority: "PORTAL_PROJECTION",
        upstream_authorities,
        source_completeness,
        poll_interval_ms,
        freshness_state: freshness.state,
        freshness_policy_version: freshness.policy_version,
        age_seconds: freshness.age_seconds,
        lag_ms: freshness.lag_ms,
        read_at,
        epoch_id: authority.epoch_id,
        activation_manifest_digest: authority.manifest_digest,
        capability_snapshot_id: authority.capability_snapshot_id,
        warnings,
        page,
    })
}

fn shadow_warning(code: &str, message: &str) -> ContractWarning {
    ContractWarning {
        code: code.to_owned(),
        message: message.to_owned(),
    }
}

#[derive(Serialize)]
struct ShadowProblem {
    code: &'static str,
    status: u16,
}

fn shadow_problem(status: StatusCode, code: &'static str) -> Response {
    (
        status,
        Json(ShadowProblem {
            code,
            status: status.as_u16(),
        }),
    )
        .into_response()
}

fn shadow_store_error(error: &StoreError) -> Response {
    match error {
        StoreError::ShadowScreenNotActivated
        | StoreError::ActiveEpochNotFound
        | StoreError::EpochNotFound => shadow_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "N07_SHADOW_EPOCH_UNAVAILABLE",
        ),
        StoreError::ShadowActivationEvidenceInvalid => shadow_problem(
            StatusCode::SERVICE_UNAVAILABLE,
            "N07_ACTIVATION_EVIDENCE_INVALID",
        ),
        StoreError::Query(query_error) => match query_error {
            QueryError::CursorExpired | QueryError::CursorContextMismatch => {
                shadow_problem(StatusCode::CONFLICT, "N07_CURSOR_RESNAPSHOT_REQUIRED")
            }
            QueryError::InvalidCursor
            | QueryError::AmbiguousCursor
            | QueryError::InvalidPageLimit
            | QueryError::QueryTooComplex
            | QueryError::FilterNotAllowed
            | QueryError::InvalidFilter
            | QueryError::SortNotAllowed
            | QueryError::InvalidQuery => {
                shadow_problem(StatusCode::BAD_REQUEST, "N07_QUERY_INVALID")
            }
            _ => shadow_problem(StatusCode::SERVICE_UNAVAILABLE, "N07_QUERY_UNAVAILABLE"),
        },
        _ => shadow_problem(StatusCode::INTERNAL_SERVER_ERROR, "N07_QUERY_FAILED"),
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
    let availability = match realtime_authority(&state, store, &request.scope).await {
        Ok(availability) => availability,
        Err(status) => return status.into_response(),
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

#[derive(Serialize)]
struct RealtimeSnapshot {
    schema_version: &'static str,
    delivery_profile: &'static str,
    workspace_id: String,
    environment: String,
    projection_epoch: Uuid,
    projection_sequence: u64,
    cursor: String,
    stream_available: bool,
    resnapshot_not_before: Option<DateTime<Utc>>,
    capability_snapshot_id: String,
    activation_manifest_digest: String,
}

async fn realtime_snapshot(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(store) = &state.projection_store else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let (claims, scope) = match authorize_realtime_scope(&state, &headers) {
        Ok(authority) => authority,
        Err(status) => return status.into_response(),
    };
    let availability = match realtime_authority(&state, store, &scope).await {
        Ok(availability) => availability,
        Err(status) => return status.into_response(),
    };
    let Some(activation) = &state.realtime_activation else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let cursor = ProjectionCursor {
        epoch_id: availability.active.epoch.epoch_id,
        sequence: availability.active.latest_available_sequence,
    };
    Json(RealtimeSnapshot {
        schema_version: "execution.realtime-snapshot.v1",
        delivery_profile: "shadow",
        workspace_id: claims.workspace_id,
        environment: state.environment.clone(),
        projection_epoch: cursor.epoch_id,
        projection_sequence: cursor.sequence,
        cursor: cursor.to_string(),
        stream_available: true,
        resnapshot_not_before: None,
        capability_snapshot_id: activation
            .evidence()
            .compatibility
            .capability_snapshot_id
            .clone(),
        activation_manifest_digest: activation.manifest_digest().to_owned(),
    })
    .into_response()
}

async fn realtime_authority(
    state: &AppState,
    store: &PgProjectionStore,
    scope: &ProjectionScope,
) -> Result<RealtimeScopeAvailability, StatusCode> {
    let activation = state
        .realtime_activation
        .as_ref()
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;
    let evidence = activation.evidence();
    if evidence.scope != *scope || evidence.scope.environment != state.environment {
        return Err(StatusCode::FORBIDDEN);
    }
    let shadow = store
        .active_shadow_screen_authority(scope, N07_PAPER_WORKBENCH_SCREEN_ID)
        .await
        .map_err(|error| match error {
            StoreError::ShadowScreenNotActivated
            | StoreError::ShadowActivationEvidenceInvalid
            | StoreError::ActiveEpochNotFound => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        })?;
    if shadow.epoch_id != evidence.active_epoch_id
        || shadow.manifest_digest != evidence.n07_activation_manifest_digest
        || shadow.capability_snapshot_id != evidence.compatibility.capability_snapshot_id
    {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    let availability =
        store
            .realtime_scope_availability(scope)
            .await
            .map_err(|error| match error {
                StoreError::ActiveEpochNotFound => StatusCode::SERVICE_UNAVAILABLE,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            })?;
    if availability.active.epoch.epoch_id != evidence.active_epoch_id {
        return Err(StatusCode::SERVICE_UNAVAILABLE);
    }
    Ok(availability)
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
    let (claims, scope) = authorize_realtime_scope(state, headers)?;
    let assertion_expires_at = assertion_expires_at(&claims)?;
    let cursor = requested_cursor(headers)
        .map_err(|()| StatusCode::BAD_REQUEST)?
        .ok_or(StatusCode::BAD_REQUEST)?;
    Ok(RealtimeRequest {
        claims,
        assertion_expires_at,
        cursor,
        scope,
    })
}

fn authorize_realtime_scope(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(DelegatedClaims, ProjectionScope), StatusCode> {
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
    let workspace_id =
        CanonicalId::parse(claims.workspace_id.clone()).map_err(|_| StatusCode::FORBIDDEN)?;
    let scope = ProjectionScope::new(workspace_id, state.environment.clone())
        .map_err(|_| StatusCode::FORBIDDEN)?;
    Ok((claims, scope))
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
    ManagerTransport(#[from] ManagerV2ClientError),
    #[error("Manager compatibility authority rejected startup: {0}")]
    ManagerCompatibility(#[from] ManagerAuthorityError),
    #[error("current-source contract rejected: {0}")]
    CurrentSource(#[from] MappingError),
    #[error("current inter-cell gateway acceptance rejected: {0}")]
    CurrentGatewayAcceptance(#[from] CurrentAcceptanceError),
    #[error("current protective-path acceptance rejected: {0}")]
    CurrentProtectiveAcceptance(#[from] CurrentProtectiveError),
    #[error(transparent)]
    ProjectionStore(#[from] projection_store_pg::StoreError),
    #[error(transparent)]
    D4Command(#[from] d4_command::D4CommandError),
    #[error(transparent)]
    Realtime(#[from] realtime_sse::RealtimeError),
    #[error(transparent)]
    Query(#[from] query_api::QueryError),
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
    use axum::body::to_bytes;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use query_api::{
        ProjectionPageRetention, QuerySort, RetentionAvailability, SortDirection, SortField,
        QUERY_SCHEMA_VERSION,
    };
    use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
    use rsa::{
        pkcs8::{EncodePrivateKey, LineEnding},
        rand_core::OsRng,
        traits::PublicKeyParts,
        RsaPrivateKey, RsaPublicKey,
    };
    use rustls::pki_types::{CertificateDer, UnixTime};
    use serde::de::DeserializeOwned;

    use super::*;

    struct CertificateFixture {
        ca_pem: String,
        client_der: Vec<u8>,
    }

    struct DelegationTestSigner {
        encoding: EncodingKey,
        jwks: String,
    }

    fn delegation_test_signer() -> DelegationTestSigner {
        let private = RsaPrivateKey::new(&mut OsRng, 2048).unwrap();
        let public = RsaPublicKey::from(&private);
        let pem = private.to_pkcs8_pem(LineEnding::LF).unwrap();
        DelegationTestSigner {
            encoding: EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
            jwks: serde_json::json!({
                "keys": [{
                    "kty": "RSA",
                    "kid": "manager-edge-test-k1",
                    "use": "sig",
                    "alg": "RS256",
                    "n": URL_SAFE_NO_PAD.encode(public.n().to_bytes_be()),
                    "e": URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())
                }]
            })
            .to_string(),
        }
    }

    fn manager_claims(now: i64, resource: &str) -> DelegatedClaims {
        DelegatedClaims {
            iss: "portal-control-api".to_owned(),
            aud: "portal-execution-edge-paper".to_owned(),
            sub: "manager-test-user".to_owned(),
            sid: "manager-test-session".to_owned(),
            workspace_id: "manager-test-workspace".to_owned(),
            roles: vec!["MANAGER".to_owned()],
            scopes: vec!["execution.read".to_owned()],
            resources: vec![resource.to_owned()],
            environment: "paper".to_owned(),
            profile_id: Some("PAPER_BINANCE_USDM".to_owned()),
            jti: "manager-test-assertion".to_owned(),
            iat: now,
            nbf: now,
            exp: now + 60,
            auth_time: now - 1,
            amr: vec!["portal_session".to_owned()],
        }
    }

    fn signed_manager_claims(signer: &DelegationTestSigner, claims: &DelegatedClaims) -> String {
        encode(
            &Header {
                alg: Algorithm::RS256,
                kid: Some("manager-edge-test-k1".to_owned()),
                ..Header::default()
            },
            claims,
            &signer.encoding,
        )
        .unwrap()
    }

    fn disabled_manager_state(verifier: DelegationVerifier) -> AppState {
        AppState {
            environment: "paper".to_owned(),
            verifier,
            snapshot: Arc::new(RwLock::new(None)),
            source_probe_required: RuntimeGate::Disabled,
            projection_store_required: RuntimeGate::Disabled,
            projection_store_ready: Arc::new(RwLock::new(false)),
            projection_ingestion_required: RuntimeGate::Disabled,
            projection_ingestion_ready: Arc::new(RwLock::new(false)),
            realtime_required: RuntimeGate::Disabled,
            realtime_poller_ready: Arc::new(RwLock::new(false)),
            projection_store: None,
            realtime_hub: None,
            realtime_activation: None,
            realtime_replay_limit: 1,
            realtime_heartbeat: Duration::from_secs(5),
            realtime_epoch_jitter: Duration::ZERO,
            realtime_freshness_policy: FreshnessPolicy {
                policy_version: "manager-test-policy".to_owned(),
                warning_after_ms: 0,
                stale_after_ms: 1,
                maximum_future_skew_ms: 0,
            },
            realtime_venue_session: VenueSessionState::Unknown,
            analytics_query_enabled: RuntimeGate::Disabled,
            analytics_source_profile: DeliveryProfile::Fixture,
            shadow_query_enabled: RuntimeGate::Disabled,
            paper_workbench_shadow_enabled: RuntimeGate::Disabled,
            query_cursor_codec: None,
            shadow_query_freshness_policy: FreshnessPolicy {
                policy_version: "manager-test-shadow-policy".to_owned(),
                warning_after_ms: 0,
                stale_after_ms: 1,
                maximum_future_skew_ms: 0,
            },
            manager_v2_client: None,
            manager_v2_profile_id: Some("PAPER_BINANCE_USDM".to_owned()),
            manager_compatibility: Arc::new(ManagerCompatibilityAuthority::canonical().unwrap()),
            current_source_map: Arc::new(CurrentSourceMap::canonical().unwrap()),
            current_gateway_acceptance: Arc::new(CurrentGatewayAcceptance::canonical().unwrap()),
        }
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
    fn realtime_runtime_requires_ingestion_query_and_screen_authority() {
        assert!(matches!(
            validate_realtime_runtime_dependencies(
                RuntimeGate::Enabled,
                RuntimeGate::Disabled,
                RuntimeGate::Enabled,
                RuntimeGate::Enabled,
            ),
            Err(ConfigError::Invalid("EDGE_REALTIME_SSE_ENABLED"))
        ));
        assert!(validate_realtime_runtime_dependencies(
            RuntimeGate::Enabled,
            RuntimeGate::Enabled,
            RuntimeGate::Enabled,
            RuntimeGate::Enabled,
        )
        .is_ok());
        assert!(validate_realtime_runtime_dependencies(
            RuntimeGate::Disabled,
            RuntimeGate::Disabled,
            RuntimeGate::Disabled,
            RuntimeGate::Disabled,
        )
        .is_ok());
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
    fn manager_read_gate_requires_the_named_resource_and_fails_closed_when_disabled() {
        let signer = delegation_test_signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge-paper",
            60,
            3,
        )
        .unwrap();
        let state = disabled_manager_state(verifier);
        let mut headers = HeaderMap::new();

        let Err(response) = manager_request_client(&state, &headers) else {
            panic!("missing bearer assertion must be rejected");
        };
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let now = Utc::now().timestamp();
        let wrong_resource =
            signed_manager_claims(&signer, &manager_claims(now, COMMAND_CENTER_RESOURCE));
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {wrong_resource}").parse().unwrap(),
        );
        let Err(response) = manager_request_client(&state, &headers) else {
            panic!("a different execution resource must be rejected");
        };
        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        let manager_resource =
            signed_manager_claims(&signer, &manager_claims(now, MANAGER_V2_RESOURCE));
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {manager_resource}").parse().unwrap(),
        );
        let Err(response) = manager_request_client(&state, &headers) else {
            panic!("disabled Manager read-through must not create a client");
        };
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        let mut wrong_profile = manager_claims(now, MANAGER_V2_RESOURCE);
        wrong_profile.profile_id = Some("SANDBOX_BINANCE_USDM".to_owned());
        let wrong_profile = signed_manager_claims(&signer, &wrong_profile);
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {wrong_profile}").parse().unwrap(),
        );
        let Err(response) = manager_request_client(&state, &headers) else {
            panic!("a profile-mismatched Manager assertion must be rejected");
        };
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[test]
    fn current_source_gate_is_screen_and_profile_exact() {
        let signer = delegation_test_signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge-paper",
            60,
            3,
        )
        .unwrap();
        let state = disabled_manager_state(verifier);
        let now = Utc::now().timestamp();
        let resource = format!("{CURRENT_SOURCE_RESOURCE_PREFIX}PAPER_TRADING_SCREEN:read");
        let token = signed_manager_claims(&signer, &manager_claims(now, &resource));
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, format!("Bearer {token}").parse().unwrap());

        let profile = current_source_authorize(&state, &headers, "PAPER_TRADING_SCREEN").unwrap();
        assert_eq!(profile.manager_profile_id, "PAPER_BINANCE_USDM");
        let unreleased_resource =
            format!("{CURRENT_SOURCE_RESOURCE_PREFIX}EXECUTION_FULL_BLOTTER_SCREEN:read");
        let unreleased_token =
            signed_manager_claims(&signer, &manager_claims(now, &unreleased_resource));
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {unreleased_token}").parse().unwrap(),
        );
        let Err(response) =
            current_source_authorize(&state, &headers, "EXECUTION_FULL_BLOTTER_SCREEN")
        else {
            panic!("N15B must reject a mapped screen outside the accepted release");
        };
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn n15b_current_source_screen_is_exact_and_unbound_source_stays_dark() {
        let signer = delegation_test_signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge-paper",
            60,
            3,
        )
        .unwrap();
        let state = disabled_manager_state(verifier);
        let screen_id = "PAPER_TRADING_SCREEN";
        let resource = format!("{CURRENT_SOURCE_RESOURCE_PREFIX}{screen_id}:read");
        let token =
            signed_manager_claims(&signer, &manager_claims(Utc::now().timestamp(), &resource));
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, format!("Bearer {token}").parse().unwrap());

        let response = current_source_screen(
            State(state.clone()),
            AxumPath(screen_id.to_owned()),
            headers.clone(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), MAXIMUM_RESPONSE_BYTES)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(body["profile_id"], "PAPER_BINANCE_USDM");
        assert_eq!(body["profile_baseline"], "CONNECTED");
        let capability_ids = body["capabilities"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| item["id"].as_str().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            capability_ids,
            [
                "deployments.positions",
                "deployments.execution-quality",
                "sessions.current",
            ]
        );

        let response = current_source_relation(
            State(state),
            AxumPath((
                screen_id.to_owned(),
                "portal.control".to_owned(),
                "not-a-relation".to_owned(),
            )),
            Query(ManagerPageQuery {
                limit: None,
                cursor: None,
            }),
            headers,
        )
        .await;
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let body = to_bytes(response.into_body(), 4096).await.unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            body["error"]["classification"],
            "SOURCE_DOES_NOT_CURRENTLY_EXIST"
        );
        assert_eq!(body["error"]["availability"], "UNAVAILABLE");
    }

    #[test]
    fn manager_profiles_are_exact_environment_bound() {
        assert!(manager_profile_matches_environment(
            "paper",
            "PAPER_BINANCE_USDM"
        ));
        assert!(manager_profile_matches_environment(
            "sandbox",
            "SANDBOX_BINANCE_USDM"
        ));
        assert!(manager_profile_matches_environment(
            "live",
            "LIVE_BINANCE_USDM"
        ));
        assert!(!manager_profile_matches_environment(
            "live",
            "SANDBOX_BINANCE_USDM"
        ));
        assert!(!manager_profile_matches_environment(
            "paper",
            "PAPER_binance_USDM"
        ));
        assert!(!manager_profile_matches_environment("paper", "PAPER_"));
    }

    #[test]
    fn manager_query_inputs_and_local_error_mapping_are_bounded() {
        assert!(manager_identifier("public"));
        assert!(manager_identifier("_internal_42"));
        assert!(!manager_identifier("public.orders"));
        assert!(!manager_identifier("orders/escape"));
        assert!(!manager_identifier("9orders"));
        assert!(!manager_identifier(&"x".repeat(64)));
        assert_eq!(manager_page_limit(None).unwrap().get(), DEFAULT_PAGE_LIMIT);
        assert_eq!(manager_page_limit(Some(200)).unwrap().get(), 200);
        let Err(response) = manager_page_limit(Some(0)) else {
            panic!("zero must be rejected");
        };
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let Err(response) = manager_page_limit(Some(201)) else {
            panic!("oversized page must be rejected");
        };
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            manager_client_error_response(&ManagerV2ClientError::RequestFailed).status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        assert_eq!(
            manager_client_error_response(&ManagerV2ClientError::ContractHeaderMismatch).status(),
            StatusCode::BAD_GATEWAY
        );
    }

    #[tokio::test]
    async fn manager_source_unavailable_is_relayed_as_a_typed_owner_envelope() {
        let unavailable = manager_v2_contract::decode_unavailable(
            format!(
                concat!(
                    r#"{{"contract_version":"{}","authority":"EXECUTION_CELL","profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","availability":"UNAVAILABLE","reason_code":"SOURCE_UNAVAILABLE","trace_id":"manager-edge-test"}}"#
                ),
                manager_v2_contract::RUNTIME_CONTRACT_REVISION
            )
            .as_bytes(),
        )
        .unwrap();
        let response = manager_json_response(StatusCode::SERVICE_UNAVAILABLE, unavailable);
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(response.headers().get("cache-control").unwrap(), "no-store");
        let body = to_bytes(response.into_body(), 4096).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
            serde_json::json!({
                "contract_version": manager_v2_contract::RUNTIME_CONTRACT_REVISION,
                "authority": "EXECUTION_CELL",
                "profile_id": "PAPER_BINANCE_USDM",
                "catalogue_sha256": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "availability": "UNAVAILABLE",
                "reason_code": "SOURCE_UNAVAILABLE",
                "trace_id": "manager-edge-test"
            })
        );
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
            profile_id: None,
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
    fn paper_workbench_shadow_fixture_deserializes_through_rust_serde() {
        let envelope = serde_json::from_str::<PaperWorkbenchShadowEnvelope>(include_str!(
            "../../../../../packages/contracts/fixtures/execution-paper-workbench.orders-shadow.valid.json"
        ))
        .unwrap();
        assert_eq!(envelope.panel, ShadowPanel::Orders);
        assert_eq!(envelope.deployment_id, "dep_74");
        assert_eq!(envelope.authority, "PORTAL_PROJECTION");
        assert_eq!(envelope.page.total_count, 91_000);
        assert_eq!(envelope.page.filtered_count, 45_500);
    }

    #[test]
    fn paper_workbench_query_scope_is_server_injected_and_not_client_replaceable() {
        let deployment = CanonicalId::parse("dep_74").unwrap();
        let request = ShadowPanelQueryRequest {
            limit: 100,
            filters: vec![QueryFilter {
                field: FilterField::Status,
                operator: FilterOperator::Eq,
                values: vec!["OPEN".to_owned()],
            }],
            sorts: vec![QuerySort {
                field: SortField::AsOf,
                direction: SortDirection::Desc,
            }],
            after: None,
            before: None,
        };
        let scoped = request.into_scoped_query(&deployment).unwrap();
        assert_eq!(scoped.request.filters.len(), 1);
        assert_eq!(scoped.required_filters.len(), 1);
        assert_eq!(scoped.required_filters[0].field, FilterField::DeploymentId);
        assert_eq!(scoped.required_filters[0].values, ["dep_74"]);

        let injected = ShadowPanelQueryRequest {
            limit: 100,
            filters: vec![QueryFilter {
                field: FilterField::DeploymentId,
                operator: FilterOperator::Eq,
                values: vec!["dep_other".to_owned()],
            }],
            sorts: scoped.request.sorts,
            after: None,
            before: None,
        };
        assert_eq!(
            injected.into_scoped_query(&deployment),
            Err(StatusCode::BAD_REQUEST)
        );
    }

    #[test]
    fn empty_shadow_panel_is_honest_and_carries_activation_authority() {
        let epoch_id = Uuid::now_v7();
        let envelope = build_shadow_envelope(
            &CanonicalId::parse("dep_74").unwrap(),
            ShadowPanel::Orders,
            projection_store_pg::ShadowScreenAuthority {
                epoch_id,
                screen_id: PAPER_WORKBENCH_SCREEN_ID.to_owned(),
                manifest_digest: format!("sha256:{}", "a".repeat(64)),
                capability_snapshot_id: "cap-n07".to_owned(),
            },
            ProjectionQueryPage {
                schema_version: QUERY_SCHEMA_VERSION.to_owned(),
                epoch_id,
                total_count: 0,
                filtered_count: 0,
                rows: Vec::new(),
                next_cursor: None,
                prev_cursor: None,
                has_more: false,
                has_previous: false,
                applied_filters: Vec::new(),
                applied_sort: vec![QuerySort {
                    field: SortField::AsOf,
                    direction: SortDirection::Desc,
                }],
                aggregates_by_currency: Vec::new(),
                retention: ProjectionPageRetention {
                    availability: RetentionAvailability::Unknown,
                    policy_version: "UNCONFIGURED".to_owned(),
                },
            },
            Utc::now(),
            &FreshnessPolicy {
                policy_version: "paper.shadow-query.v1".to_owned(),
                warning_after_ms: 5_000,
                stale_after_ms: 30_000,
                maximum_future_skew_ms: 2_000,
            },
        )
        .unwrap();
        assert_eq!(envelope.panel_state, PanelState::Empty);
        assert_eq!(envelope.freshness_state, FreshnessState::Unknown);
        assert_eq!(envelope.source_completeness, SourceCompleteness::Unknown);
        assert!(envelope
            .warnings
            .iter()
            .any(|warning| warning.code == "EMPTY_SHADOW_PANEL"));
        assert!(envelope
            .warnings
            .iter()
            .any(|warning| warning.code == "RETENTION_UNCONFIGURED"));
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
