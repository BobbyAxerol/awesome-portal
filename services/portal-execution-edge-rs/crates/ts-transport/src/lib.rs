#![forbid(unsafe_code)]

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use chrono::Utc;
use execution_contracts::{
    CapabilityObservation, CapabilitySnapshot, CapabilityState, CompatibilityIdentity,
    ExecutionReadCapability,
};
use futures_util::StreamExt as _;
use reqwest::{
    header::{HeaderMap, HeaderValue},
    redirect::Policy,
    Certificate, Client, Identity,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use tokio::sync::Semaphore;
use ts_adapter_v1::{
    parse_read_response, request_blueprint, AdapterPayload, ReadFilters, ReadOperation,
    ReadOutcome, ResponseInput,
};
use url::Url;

const LOCK: &str = include_str!("../../../contract-pack.lock.json");
const API_KEY_HEADER: &str = "x-api-key";

#[derive(Debug, Clone)]
pub struct TransportLimits {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub queue_timeout: Duration,
    pub retry_backoff: Duration,
    pub maximum_concurrency: usize,
    pub maximum_response_bytes: usize,
    pub maximum_retries: u8,
}

impl Default for TransportLimits {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(2),
            request_timeout: Duration::from_secs(5),
            queue_timeout: Duration::from_millis(250),
            retry_backoff: Duration::from_millis(100),
            maximum_concurrency: 32,
            maximum_response_bytes: 2 * 1024 * 1024,
            maximum_retries: 1,
        }
    }
}

pub struct SourceTransportConfig<'a> {
    pub source_origin: &'a str,
    pub root_ca_pem: &'a [u8],
    pub client_identity_pem: Option<&'a [u8]>,
    pub source_api_key: Option<&'a str>,
    pub observed_gateway_digest: &'a str,
    pub limits: TransportLimits,
}

#[derive(Clone)]
pub struct BoundedSourceClient {
    client: Client,
    source_origin: Url,
    source_api_key: Option<HeaderValue>,
    observed_gateway_digest: String,
    semaphore: Arc<Semaphore>,
    limits: TransportLimits,
}

impl BoundedSourceClient {
    /// Creates a production client pinned to one HTTPS origin and explicit CA.
    ///
    /// # Errors
    ///
    /// Returns an error for an unsafe origin, missing trust anchor, invalid
    /// identity/API key, or limits outside the EX-BE-02 safety envelope.
    pub fn new(config: SourceTransportConfig<'_>) -> Result<Self, TransportError> {
        Self::build(config, true)
    }

    fn build(
        config: SourceTransportConfig<'_>,
        require_https: bool,
    ) -> Result<Self, TransportError> {
        validate_limits(&config.limits)?;
        let source_origin = validate_origin(config.source_origin, require_https)?;
        if require_https && config.root_ca_pem.is_empty() {
            return Err(TransportError::MissingTrustAnchor);
        }

        let mut builder = Client::builder()
            .connect_timeout(config.limits.connect_timeout)
            .timeout(config.limits.request_timeout)
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("primus-portal-execution-edge/ex-be-02");
        if require_https {
            let root = Certificate::from_pem(config.root_ca_pem)
                .map_err(|_| TransportError::InvalidTrustAnchor)?;
            builder = builder
                .https_only(true)
                .min_tls_version(reqwest::tls::Version::TLS_1_3)
                .add_root_certificate(root);
        }
        if let Some(raw) = config.client_identity_pem {
            let identity =
                Identity::from_pem(raw).map_err(|_| TransportError::InvalidClientIdentity)?;
            builder = builder.identity(identity);
        }
        let source_api_key = config
            .source_api_key
            .map(|raw| {
                let mut value =
                    HeaderValue::from_str(raw).map_err(|_| TransportError::InvalidCredential)?;
                value.set_sensitive(true);
                Ok::<HeaderValue, TransportError>(value)
            })
            .transpose()?;
        let client = builder
            .build()
            .map_err(|_| TransportError::ClientConfiguration)?;
        Ok(Self {
            client,
            source_origin,
            source_api_key,
            observed_gateway_digest: config.observed_gateway_digest.to_owned(),
            semaphore: Arc::new(Semaphore::new(config.limits.maximum_concurrency)),
            limits: config.limits,
        })
    }

    #[cfg(test)]
    fn new_for_test(origin: &str, source_api_key: Option<&str>, limits: TransportLimits) -> Self {
        Self::build(
            SourceTransportConfig {
                source_origin: origin,
                root_ca_pem: &[],
                client_identity_pem: None,
                source_api_key,
                observed_gateway_digest: "sha256:4f63dc9949f810-test",
                limits,
            },
            false,
        )
        .expect("test transport must be valid")
    }

    #[must_use]
    pub fn observed_gateway_digest(&self) -> &str {
        &self.observed_gateway_digest
    }

    #[must_use]
    pub fn has_alpha_credential(&self) -> bool {
        self.source_api_key.is_some()
    }

    /// Executes exactly one allowlisted GET blueprint with bounded resources.
    ///
    /// # Errors
    ///
    /// Fails closed on missing alpha credentials, queue/transport/body limits,
    /// invalid response headers, payloads, or unsupported source behavior.
    pub async fn execute(&self, operation: &ReadOperation) -> Result<ReadOutcome, TransportError> {
        let blueprint = request_blueprint(operation)?;
        let alpha_scoped = operation.alpha_id().is_some();
        if alpha_scoped && self.source_api_key.is_none() {
            return Err(TransportError::MissingSourceCredential);
        }
        let _permit = tokio::time::timeout(
            self.limits.queue_timeout,
            self.semaphore.clone().acquire_owned(),
        )
        .await
        .map_err(|_| TransportError::QueueSaturated)?
        .map_err(|_| TransportError::QueueClosed)?;

        let mut attempt = 0_u8;
        loop {
            match self.send_once(&blueprint, alpha_scoped).await {
                Ok(outcome) if should_retry(&outcome) && attempt < self.limits.maximum_retries => {}
                Ok(outcome) => return Ok(outcome),
                Err(TransportError::RequestFailed) if attempt < self.limits.maximum_retries => {}
                Err(error) => return Err(error),
            }
            attempt = attempt.saturating_add(1);
            tokio::time::sleep(self.limits.retry_backoff).await;
        }
    }

    async fn send_once(
        &self,
        blueprint: &ts_adapter_v1::RequestBlueprint,
        alpha_scoped: bool,
    ) -> Result<ReadOutcome, TransportError> {
        let mut url = self.source_origin.clone();
        url.set_path(blueprint.path);
        if !blueprint.query.is_empty() {
            url.query_pairs_mut().extend_pairs(&blueprint.query);
        }
        let mut request = self.client.get(url);
        for (name, value) in &blueprint.headers {
            request = request.header(name, value);
        }
        if alpha_scoped {
            request = request.header(
                API_KEY_HEADER,
                self.source_api_key
                    .as_ref()
                    .ok_or(TransportError::MissingSourceCredential)?,
            );
        }
        let response = request
            .send()
            .await
            .map_err(|_| TransportError::RequestFailed)?;
        if response.status().is_redirection() {
            return Err(TransportError::RedirectDenied);
        }
        if response
            .content_length()
            .is_some_and(|length| length > self.limits.maximum_response_bytes as u64)
        {
            return Err(TransportError::ResponseTooLarge);
        }
        let status = response.status();
        let headers = response_headers(response.headers());
        let mut stream = response.bytes_stream();
        let mut body = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| TransportError::RequestFailed)?;
            if body.len().saturating_add(chunk.len()) > self.limits.maximum_response_bytes {
                return Err(TransportError::ResponseTooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        parse_read_response(
            &operation_from_path(blueprint.path, &blueprint.query)?,
            &ResponseInput {
                http_status: status.as_u16(),
                headers: &headers,
                body: &body,
            },
        )
        .map_err(TransportError::from)
    }
}

// Reconstructing only from a blueprint keeps send_once unable to accept an
// arbitrary method/path while retaining the operation-specific response type.
fn operation_from_path(
    path: &str,
    query: &[(String, String)],
) -> Result<ReadOperation, TransportError> {
    let alpha = || {
        query
            .iter()
            .find(|(key, _)| key == "alpha_id")
            .map(|(_, value)| value.clone())
            .ok_or(TransportError::InternalBlueprint)
    };
    let limit = |default| {
        query
            .iter()
            .find(|(key, _)| key == "limit")
            .and_then(|(_, value)| value.parse::<u16>().ok())
            .unwrap_or(default)
    };
    Ok(match path {
        "/v1/contracts" => ReadOperation::Contracts,
        "/v1/health" => ReadOperation::Health,
        "/v1/health/capabilities" => ReadOperation::Capabilities,
        "/v1/orders" => ReadOperation::Orders {
            alpha_id: alpha()?,
            filters: ReadFilters::default(),
            limit: limit(1),
        },
        "/v1/fills" => ReadOperation::Fills {
            alpha_id: alpha()?,
            filters: ReadFilters::default(),
            limit: limit(1),
        },
        "/v1/positions" => ReadOperation::Positions {
            alpha_id: alpha()?,
            filters: ReadFilters::default(),
            include_flat: false,
            limit: limit(1),
        },
        "/v1/events" => ReadOperation::Events {
            alpha_id: alpha()?,
            from: None,
            to: None,
            limit: limit(1),
        },
        _ => return Err(TransportError::InternalBlueprint),
    })
}

fn response_headers(headers: &HeaderMap) -> BTreeMap<String, String> {
    headers
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|text| (name.as_str().to_owned(), text.to_owned()))
        })
        .collect()
}

fn validate_origin(raw: &str, require_https: bool) -> Result<Url, TransportError> {
    let url = Url::parse(raw).map_err(|_| TransportError::InvalidSourceOrigin)?;
    let scheme_ok = url.scheme() == "https" || (!require_https && url.scheme() == "http");
    if !scheme_ok
        || url.host_str().is_none()
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(TransportError::InvalidSourceOrigin);
    }
    Ok(url)
}

fn validate_limits(limits: &TransportLimits) -> Result<(), TransportError> {
    if limits.connect_timeout.is_zero()
        || limits.connect_timeout > Duration::from_secs(5)
        || limits.request_timeout < limits.connect_timeout
        || limits.request_timeout > Duration::from_secs(15)
        || limits.queue_timeout.is_zero()
        || limits.queue_timeout > Duration::from_secs(2)
        || limits.retry_backoff > Duration::from_secs(1)
        || !(1..=128).contains(&limits.maximum_concurrency)
        || !(1_024..=8 * 1024 * 1024).contains(&limits.maximum_response_bytes)
        || limits.maximum_retries > 2
    {
        return Err(TransportError::UnsafeLimits);
    }
    Ok(())
}

fn should_retry(outcome: &ReadOutcome) -> bool {
    matches!(
        outcome,
        ReadOutcome::Retryable { .. } | ReadOutcome::Unavailable { .. }
    )
}

#[derive(Debug, Deserialize)]
struct ContractLock {
    runtime_gateway_digest_prefix: String,
    api_version: String,
    contract_revision: String,
    schema_revision: String,
}

#[derive(Clone)]
pub struct CapabilityNegotiator {
    client: BoundedSourceClient,
}

impl CapabilityNegotiator {
    #[must_use]
    pub const fn new(client: BoundedSourceClient) -> Self {
        Self { client }
    }

    /// Probes the immutable contract first, then each read capability
    /// independently. Alpha reads are opt-in and credential-gated.
    ///
    /// # Panics
    ///
    /// Panics only when the compile-time embedded contract lock is invalid;
    /// repository validation and tests parse the same immutable file.
    #[allow(clippy::if_not_else)] // Fail-closed mismatch branches stay first.
    pub async fn probe(&self, alpha_id: Option<&str>) -> CapabilitySnapshot {
        let now = Utc::now();
        let lock: ContractLock = serde_json::from_str(LOCK).expect("embedded lock must be valid");
        let mut capabilities = BTreeMap::new();
        let mut observed_venue_products = Vec::new();
        let digest_ok = self
            .client
            .observed_gateway_digest()
            .starts_with(&lock.runtime_gateway_digest_prefix);

        if !digest_ok {
            for capability in all_capabilities() {
                observe(
                    &mut capabilities,
                    capability,
                    CapabilityState::Incompatible,
                    "source_gateway_digest_mismatch",
                    now,
                );
            }
        } else {
            let contracts = self.client.execute(&ReadOperation::Contracts).await;
            let contract_ok = matches!(
                &contracts,
                Ok(ReadOutcome::Success(AdapterPayload::Contracts(contract)))
                    if contract.api_version == lock.api_version
                        && contract.authoritative_contract_revision == lock.contract_revision
                        && contract.authoritative_schema_version == lock.schema_revision
                        && contract.supported_contract_revisions.iter().any(|value| value == &lock.contract_revision)
            );
            if !contract_ok {
                for capability in all_capabilities() {
                    observe(
                        &mut capabilities,
                        capability,
                        CapabilityState::Incompatible,
                        "source_contract_negotiation_failed",
                        now,
                    );
                }
            } else {
                observe(
                    &mut capabilities,
                    ExecutionReadCapability::Contracts,
                    CapabilityState::Supported,
                    "v1_contract_verified",
                    now,
                );
                probe_public(
                    &self.client,
                    ReadOperation::Health,
                    ExecutionReadCapability::Health,
                    &mut capabilities,
                    &mut observed_venue_products,
                    now,
                )
                .await;
                probe_public(
                    &self.client,
                    ReadOperation::Capabilities,
                    ExecutionReadCapability::Capabilities,
                    &mut capabilities,
                    &mut observed_venue_products,
                    now,
                )
                .await;
                self.probe_alpha(alpha_id, &mut capabilities, now).await;
            }
        }
        observed_venue_products.sort();
        observed_venue_products.dedup();
        let snapshot_id = snapshot_id(
            self.client.observed_gateway_digest(),
            &lock,
            &capabilities,
            &observed_venue_products,
        );
        CapabilitySnapshot {
            identity: CompatibilityIdentity {
                adapter_id: "ts-adapter-v1".to_owned(),
                source_gateway_digest: self.client.observed_gateway_digest().to_owned(),
                source_api_version: lock.api_version,
                source_contract_revision: lock.contract_revision,
                source_schema_version: lock.schema_revision,
                capability_snapshot_id: snapshot_id,
                contract_checked_at: now,
            },
            capabilities,
            observed_venue_products,
            warnings: Vec::new(),
        }
    }

    async fn probe_alpha(
        &self,
        alpha_id: Option<&str>,
        observations: &mut BTreeMap<ExecutionReadCapability, CapabilityObservation>,
        now: chrono::DateTime<Utc>,
    ) {
        let Some(alpha_id) = alpha_id.filter(|value| !value.trim().is_empty()) else {
            disable_alpha(observations, "alpha_probe_not_configured", now);
            return;
        };
        if !self.client.has_alpha_credential() {
            disable_alpha(observations, "source_read_credential_missing", now);
            return;
        }
        let operations = [
            (
                ExecutionReadCapability::Orders,
                ReadOperation::Orders {
                    alpha_id: alpha_id.to_owned(),
                    filters: ReadFilters::default(),
                    limit: 1,
                },
            ),
            (
                ExecutionReadCapability::Fills,
                ReadOperation::Fills {
                    alpha_id: alpha_id.to_owned(),
                    filters: ReadFilters::default(),
                    limit: 1,
                },
            ),
            (
                ExecutionReadCapability::Positions,
                ReadOperation::Positions {
                    alpha_id: alpha_id.to_owned(),
                    filters: ReadFilters::default(),
                    include_flat: false,
                    limit: 1,
                },
            ),
            (
                ExecutionReadCapability::Events,
                ReadOperation::Events {
                    alpha_id: alpha_id.to_owned(),
                    from: None,
                    to: None,
                    limit: 1,
                },
            ),
        ];
        for (capability, operation) in operations {
            let outcome = self.client.execute(&operation).await;
            let (state, reason) = classify_probe(&outcome);
            observe(observations, capability, state, reason, now);
        }
    }
}

async fn probe_public(
    client: &BoundedSourceClient,
    operation: ReadOperation,
    capability: ExecutionReadCapability,
    observations: &mut BTreeMap<ExecutionReadCapability, CapabilityObservation>,
    venue_products: &mut Vec<String>,
    now: chrono::DateTime<Utc>,
) {
    let outcome = client.execute(&operation).await;
    if let Ok(ReadOutcome::Success(payload)) = &outcome {
        let profiles = match payload {
            AdapterPayload::Health(body) => Some(&body.venue_products),
            AdapterPayload::Capabilities(body) => Some(&body.venue_products),
            _ => None,
        };
        if let Some(profiles) = profiles {
            venue_products.extend(profiles.iter().map(|profile| {
                format!(
                    "{}/{}:{}",
                    profile.venue, profile.product, profile.rollout_state
                )
            }));
        }
    }
    let (state, reason) = classify_probe(&outcome);
    observe(observations, capability, state, reason, now);
}

fn classify_probe(
    outcome: &Result<ReadOutcome, TransportError>,
) -> (CapabilityState, &'static str) {
    match outcome {
        Ok(ReadOutcome::Success(_)) => (CapabilityState::ReadOnly, "live_read_probe_succeeded"),
        Ok(ReadOutcome::Denied { .. }) => (CapabilityState::Disabled, "source_read_denied"),
        Ok(ReadOutcome::Incompatible { .. }) => (
            CapabilityState::Incompatible,
            "source_revision_incompatible",
        ),
        Ok(ReadOutcome::Retryable { .. } | ReadOutcome::Unavailable { .. }) => {
            (CapabilityState::Disabled, "source_temporarily_unavailable")
        }
        Err(_) => (CapabilityState::Disabled, "source_probe_failed"),
    }
}

fn observe(
    observations: &mut BTreeMap<ExecutionReadCapability, CapabilityObservation>,
    capability: ExecutionReadCapability,
    state: CapabilityState,
    reason: &str,
    checked_at: chrono::DateTime<Utc>,
) {
    observations.insert(
        capability,
        CapabilityObservation {
            state,
            reason: reason.to_owned(),
            checked_at,
        },
    );
}

fn disable_alpha(
    observations: &mut BTreeMap<ExecutionReadCapability, CapabilityObservation>,
    reason: &str,
    now: chrono::DateTime<Utc>,
) {
    for capability in [
        ExecutionReadCapability::Orders,
        ExecutionReadCapability::Fills,
        ExecutionReadCapability::Positions,
        ExecutionReadCapability::Events,
    ] {
        observe(
            observations,
            capability,
            CapabilityState::Disabled,
            reason,
            now,
        );
    }
}

const fn all_capabilities() -> [ExecutionReadCapability; 7] {
    [
        ExecutionReadCapability::Contracts,
        ExecutionReadCapability::Health,
        ExecutionReadCapability::Capabilities,
        ExecutionReadCapability::Orders,
        ExecutionReadCapability::Fills,
        ExecutionReadCapability::Positions,
        ExecutionReadCapability::Events,
    ]
}

#[derive(Serialize)]
struct SnapshotHashInput<'a> {
    digest: &'a str,
    api: &'a str,
    contract: &'a str,
    schema: &'a str,
    capabilities: BTreeMap<ExecutionReadCapability, (&'a CapabilityState, &'a str)>,
    venue_products: &'a [String],
}

fn snapshot_id(
    digest: &str,
    lock: &ContractLock,
    capabilities: &BTreeMap<ExecutionReadCapability, CapabilityObservation>,
    venue_products: &[String],
) -> String {
    let normalized = SnapshotHashInput {
        digest,
        api: &lock.api_version,
        contract: &lock.contract_revision,
        schema: &lock.schema_revision,
        capabilities: capabilities
            .iter()
            .map(|(key, value)| (*key, (&value.state, value.reason.as_str())))
            .collect(),
        venue_products,
    };
    let bytes = serde_json::to_vec(&normalized).expect("snapshot hash input serializes");
    format!("cap_{}", hex::encode(Sha256::digest(bytes)))
}

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("Trading System source origin is invalid")]
    InvalidSourceOrigin,
    #[error("Trading System trust anchor is required")]
    MissingTrustAnchor,
    #[error("Trading System trust anchor is invalid")]
    InvalidTrustAnchor,
    #[error("Trading System client identity is invalid")]
    InvalidClientIdentity,
    #[error("Trading System source credential is invalid")]
    InvalidCredential,
    #[error("Trading System source credential is required for alpha-scoped reads")]
    MissingSourceCredential,
    #[error("Trading System transport limits are outside the safety envelope")]
    UnsafeLimits,
    #[error("Trading System HTTP client could not be configured")]
    ClientConfiguration,
    #[error("Trading System request queue is saturated")]
    QueueSaturated,
    #[error("Trading System request queue is unavailable")]
    QueueClosed,
    #[error("Trading System request failed")]
    RequestFailed,
    #[error("Trading System redirect is denied")]
    RedirectDenied,
    #[error("Trading System response exceeded its byte limit")]
    ResponseTooLarge,
    #[error("internal read blueprint is invalid")]
    InternalBlueprint,
    #[error(transparent)]
    Adapter(#[from] ts_adapter_v1::AdapterError),
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tokio::{
        io::{AsyncReadExt as _, AsyncWriteExt as _},
        net::TcpListener,
    };

    use super::*;

    const CONTRACT_HEADERS: &str = "x-trading-api-version: v1\r\nx-trading-contract-revision: v1\r\nx-trading-schema-version: v1\r\n";

    async fn server(requests: Arc<Mutex<Vec<String>>>, oversized: bool) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    break;
                };
                let requests = Arc::clone(&requests);
                tokio::spawn(async move {
                    let mut buffer = vec![0; 16 * 1024];
                    let size = socket.read(&mut buffer).await.unwrap_or(0);
                    let raw = String::from_utf8_lossy(&buffer[..size]).to_string();
                    requests.lock().unwrap().push(raw.clone());
                    let path = raw.split_whitespace().nth(1).unwrap_or("/");
                    let body = if oversized {
                        "x".repeat(2_048)
                    } else if path.starts_with("/v1/contracts") {
                        include_str!("../../../fixtures/contracts.v1.json").to_owned()
                    } else if path.starts_with("/v1/health/capabilities") {
                        include_str!("../../../fixtures/capabilities.v1.json").to_owned()
                    } else if path.starts_with("/v1/health") {
                        include_str!("../../../fixtures/health.v1.json").to_owned()
                    } else if path.starts_with("/v1/orders") {
                        include_str!("../../../fixtures/orders.v1.json").to_owned()
                    } else if path.starts_with("/v1/fills") {
                        include_str!("../../../fixtures/fills.v1.json").to_owned()
                    } else if path.starts_with("/v1/positions") {
                        include_str!("../../../fixtures/positions.v1.json").to_owned()
                    } else {
                        include_str!("../../../fixtures/events.v1.json").to_owned()
                    };
                    let response = format!(
                        "HTTP/1.1 200 OK\r\n{CONTRACT_HEADERS}content-length: {}\r\nconnection: close\r\n\r\n{}",
                        body.len(), body
                    );
                    let _ = socket.write_all(response.as_bytes()).await;
                });
            }
        });
        format!("http://{address}")
    }

    async fn redirect_server() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let mut buffer = [0_u8; 2_048];
                let _ = socket.read(&mut buffer).await;
                let _ = socket
                    .write_all(
                        b"HTTP/1.1 302 Found\r\nlocation: http://127.0.0.1:1/escape\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                    )
                    .await;
            }
        });
        format!("http://{address}")
    }

    #[tokio::test]
    async fn negotiation_probes_only_public_routes_without_alpha_scope() {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let origin = server(Arc::clone(&requests), false).await;
        let client =
            BoundedSourceClient::new_for_test(&origin, Some("secret"), TransportLimits::default());
        let snapshot = CapabilityNegotiator::new(client).probe(None).await;
        assert_eq!(
            snapshot.capabilities[&ExecutionReadCapability::Contracts].state,
            CapabilityState::Supported
        );
        assert_eq!(
            snapshot.capabilities[&ExecutionReadCapability::Orders].state,
            CapabilityState::Disabled
        );
        let captured = requests.lock().unwrap().join("\n");
        assert!(captured.contains("GET /v1/contracts HTTP/1.1"));
        assert!(captured.contains("GET /v1/health HTTP/1.1"));
        assert!(!captured.contains("/v1/orders"));
        assert!(!captured.to_ascii_lowercase().contains(API_KEY_HEADER));
    }

    #[tokio::test]
    async fn alpha_probe_uses_service_credential_and_all_allowlisted_reads() {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let origin = server(Arc::clone(&requests), false).await;
        let client = BoundedSourceClient::new_for_test(
            &origin,
            Some("source-secret"),
            TransportLimits::default(),
        );
        let snapshot = CapabilityNegotiator::new(client)
            .probe(Some("alpha-paper-1"))
            .await;
        assert_eq!(
            snapshot.capabilities[&ExecutionReadCapability::Events].state,
            CapabilityState::ReadOnly
        );
        let captured = requests.lock().unwrap().join("\n").to_ascii_lowercase();
        for path in ["/v1/orders", "/v1/fills", "/v1/positions", "/v1/events"] {
            assert!(captured.contains(path));
        }
        assert_eq!(captured.matches("x-api-key: source-secret").count(), 4);
    }

    #[tokio::test]
    async fn response_byte_limit_fails_closed() {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let origin = server(requests, true).await;
        let limits = TransportLimits {
            maximum_response_bytes: 1_024,
            ..TransportLimits::default()
        };
        let client = BoundedSourceClient::new_for_test(&origin, None, limits);
        assert!(matches!(
            client.execute(&ReadOperation::Contracts).await,
            Err(TransportError::ResponseTooLarge)
        ));
    }

    #[tokio::test]
    async fn redirect_is_never_followed() {
        let origin = redirect_server().await;
        let client = BoundedSourceClient::new_for_test(&origin, None, TransportLimits::default());
        assert!(matches!(
            client.execute(&ReadOperation::Contracts).await,
            Err(TransportError::RedirectDenied)
        ));
    }

    #[tokio::test]
    async fn digest_mismatch_stops_before_any_network_call() {
        let requests = Arc::new(Mutex::new(Vec::new()));
        let origin = server(Arc::clone(&requests), false).await;
        let mut client =
            BoundedSourceClient::new_for_test(&origin, None, TransportLimits::default());
        client.observed_gateway_digest = "sha256:wrong".to_owned();
        let snapshot = CapabilityNegotiator::new(client).probe(None).await;
        assert!(snapshot
            .capabilities
            .values()
            .all(|value| value.state == CapabilityState::Incompatible));
        assert!(requests.lock().unwrap().is_empty());
    }

    #[test]
    fn production_transport_rejects_plaintext_and_unsafe_limits() {
        let config = SourceTransportConfig {
            source_origin: "http://trading-system.internal",
            root_ca_pem: b"ignored",
            client_identity_pem: None,
            source_api_key: None,
            observed_gateway_digest: "sha256:x",
            limits: TransportLimits::default(),
        };
        assert!(matches!(
            BoundedSourceClient::new(config),
            Err(TransportError::InvalidSourceOrigin)
        ));
    }
}
