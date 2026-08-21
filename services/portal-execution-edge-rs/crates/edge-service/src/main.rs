#![forbid(unsafe_code)]

use std::{
    env, fs,
    io::BufReader,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{Arc, Once},
    time::Duration,
};

use axum::{
    extract::State,
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use axum_server::tls_rustls::RustlsConfig;
use edge_auth::{DelegationVerifier, RequiredRead};
use execution_contracts::{CapabilitySnapshot, CapabilityState, ExecutionReadCapability};
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
use tracing::info;
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
        let projection_database_url_file = optional_path("EDGE_PROJECTION_DATABASE_URL_FILE");
        if projection_ingestion_enabled && projection_database_url_file.is_none() {
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
            transport_limits: TransportLimits {
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
                queue_timeout: Duration::from_millis(bounded_usize(
                    "EDGE_QUEUE_TIMEOUT_MS",
                    250,
                    10,
                    2_000,
                )? as u64),
                retry_backoff: Duration::from_millis(bounded_usize(
                    "EDGE_RETRY_BACKOFF_MS",
                    100,
                    0,
                    1_000,
                )? as u64),
                maximum_concurrency: bounded_usize("EDGE_MAXIMUM_CONCURRENCY", 32, 1, 128)?,
                maximum_response_bytes: bounded_usize(
                    "EDGE_MAXIMUM_RESPONSE_BYTES",
                    2 * 1024 * 1024,
                    1_024,
                    8 * 1024 * 1024,
                )?,
                maximum_retries: u8::try_from(bounded_usize("EDGE_MAXIMUM_RETRIES", 1, 0, 2)?)
                    .map_err(|_| ConfigError::Invalid("EDGE_MAXIMUM_RETRIES"))?,
            },
            projection_ingestion_enabled,
            projection_database_url_file,
        })
    }
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
    let projection_store = if config.projection_ingestion_enabled {
        let database_url_file = config
            .projection_database_url_file
            .as_deref()
            .ok_or(ConfigError::Missing("EDGE_PROJECTION_DATABASE_URL_FILE"))?;
        let database_url = read_text(database_url_file)?;
        let store = projection_store_pg::PgProjectionStore::connect(database_url.trim()).await?;
        store.ping().await?;
        Some(store)
    } else {
        None
    };

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
        limits: config.transport_limits,
    })?;
    let negotiator = CapabilityNegotiator::new(source_client);
    let snapshot = Arc::new(RwLock::new(Some(
        negotiator.probe(config.probe_alpha_id.as_deref()).await,
    )));
    let projection_ready = Arc::new(RwLock::new(projection_store.is_some()));
    let state = AppState {
        environment: config.environment,
        verifier,
        snapshot: Arc::clone(&snapshot),
        projection_required: config.projection_ingestion_enabled,
        projection_ready: Arc::clone(&projection_ready),
    };

    let probe_snapshot = Arc::clone(&snapshot);
    let probe_alpha_id = config.probe_alpha_id;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(config.probe_interval);
        interval.tick().await;
        loop {
            interval.tick().await;
            let next = negotiator.probe(probe_alpha_id.as_deref()).await;
            *probe_snapshot.write().await = Some(next);
        }
    });
    if let Some(store) = projection_store {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(10));
            interval.tick().await;
            loop {
                interval.tick().await;
                *projection_ready.write().await = store.ping().await.is_ok();
            }
        });
    }

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

fn private_router(state: AppState) -> Router {
    Router::new()
        .route("/internal/v1/compatibility", get(compatibility))
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
