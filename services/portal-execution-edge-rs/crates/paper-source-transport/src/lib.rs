#![forbid(unsafe_code)]

use std::{sync::Arc, time::Duration};

use futures_util::StreamExt as _;
use paper_source_contract::{parse_response, PaperReadRequest, ReadOutcome, RequestBlueprint};
use reqwest::{
    header::{HeaderMap, RETRY_AFTER},
    redirect::Policy,
    Certificate, Client, Identity, Version,
};
use thiserror::Error;
use tokio::sync::Semaphore;
use url::Url;

pub const DEFAULT_MAXIMUM_RESPONSE_BYTES: usize = 1024 * 1024;
pub const HARD_MAXIMUM_RESPONSE_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct PaperTransportLimits {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub queue_timeout: Duration,
    pub maximum_concurrency: usize,
    pub maximum_response_bytes: usize,
}

impl Default for PaperTransportLimits {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(2),
            request_timeout: Duration::from_secs(5),
            queue_timeout: Duration::from_millis(250),
            maximum_concurrency: 2,
            maximum_response_bytes: DEFAULT_MAXIMUM_RESPONSE_BYTES,
        }
    }
}

pub struct PaperSourceTransportConfig<'a> {
    pub source_proxy_origin: &'a str,
    pub root_ca_pem: &'a [u8],
    pub client_identity_pem: &'a [u8],
    pub limits: PaperTransportLimits,
}

#[derive(Clone)]
pub struct PaperSourceClient {
    client: Client,
    source_proxy_origin: Url,
    semaphore: Arc<Semaphore>,
    limits: PaperTransportLimits,
    require_http2: bool,
}

impl PaperSourceClient {
    /// Creates the D4 client pinned to one HTTPS Source Proxy origin, one trust
    /// anchor and one workload mTLS identity.
    ///
    /// The Trading System read key is intentionally absent from this API. The
    /// Source Proxy strips caller headers and injects the owner-held identity.
    ///
    /// # Errors
    ///
    /// Rejects unsafe origins, missing/invalid PKI material and limits outside
    /// the D4 envelope.
    pub fn new(config: PaperSourceTransportConfig<'_>) -> Result<Self, PaperTransportError> {
        Self::build(config, true, true)
    }

    fn build(
        config: PaperSourceTransportConfig<'_>,
        enforce_tls: bool,
        enforce_h2: bool,
    ) -> Result<Self, PaperTransportError> {
        validate_limits(&config.limits)?;
        let source_proxy_origin = validate_origin(config.source_proxy_origin, enforce_tls)?;
        if enforce_tls && config.root_ca_pem.is_empty() {
            return Err(PaperTransportError::MissingTrustAnchor);
        }
        if enforce_tls && config.client_identity_pem.is_empty() {
            return Err(PaperTransportError::MissingClientIdentity);
        }

        let mut builder = Client::builder()
            .connect_timeout(config.limits.connect_timeout)
            .timeout(config.limits.request_timeout)
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("primus-portal-paper-ingestor/d4.paper-read.v1");
        if enforce_tls {
            let root = Certificate::from_pem(config.root_ca_pem)
                .map_err(|_| PaperTransportError::InvalidTrustAnchor)?;
            let identity = Identity::from_pem(config.client_identity_pem)
                .map_err(|_| PaperTransportError::InvalidClientIdentity)?;
            builder = builder
                .https_only(true)
                .min_tls_version(reqwest::tls::Version::TLS_1_3)
                .max_tls_version(reqwest::tls::Version::TLS_1_3)
                .add_root_certificate(root)
                .identity(identity);
        }
        let client = builder
            .build()
            .map_err(|_| PaperTransportError::ClientConfiguration)?;
        Ok(Self {
            client,
            source_proxy_origin,
            semaphore: Arc::new(Semaphore::new(config.limits.maximum_concurrency)),
            limits: config.limits,
            require_http2: enforce_h2,
        })
    }

    #[cfg(test)]
    fn new_for_test(
        origin: &str,
        limits: PaperTransportLimits,
    ) -> Result<Self, PaperTransportError> {
        Self::build(
            PaperSourceTransportConfig {
                source_proxy_origin: origin,
                root_ca_pem: &[],
                client_identity_pem: &[],
                limits,
            },
            false,
            false,
        )
    }

    /// Executes exactly one enum-derived D4 GET request.
    ///
    /// This function does not retry. The snapshot/event orchestrator owns
    /// retry timing so it cannot advance a durable cursor accidentally.
    ///
    /// # Errors
    ///
    /// Fails closed on queue saturation, transport/HTTP-version drift,
    /// redirects, oversized bodies, invalid Retry-After or contract parsing.
    pub async fn execute(
        &self,
        request: &PaperReadRequest,
    ) -> Result<ReadOutcome, PaperTransportError> {
        let blueprint = request.blueprint()?;
        let _permit = tokio::time::timeout(
            self.limits.queue_timeout,
            self.semaphore.clone().acquire_owned(),
        )
        .await
        .map_err(|_| PaperTransportError::QueueSaturated)?
        .map_err(|_| PaperTransportError::QueueClosed)?;
        self.send_once(request, &blueprint).await
    }

    async fn send_once(
        &self,
        request: &PaperReadRequest,
        blueprint: &RequestBlueprint,
    ) -> Result<ReadOutcome, PaperTransportError> {
        let mut url = self.source_proxy_origin.clone();
        url.set_path(blueprint.path);
        url.query_pairs_mut().extend_pairs(&blueprint.query);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| PaperTransportError::RequestFailed)?;
        if response.status().is_redirection() {
            return Err(PaperTransportError::RedirectDenied);
        }
        if self.require_http2 && response.version() != Version::HTTP_2 {
            return Err(PaperTransportError::Http2Required);
        }
        if response
            .content_length()
            .is_some_and(|length| length > self.limits.maximum_response_bytes as u64)
        {
            return Err(PaperTransportError::ResponseTooLarge);
        }

        let status = response.status().as_u16();
        let retry_after_seconds = retry_after_seconds(response.headers())?;
        let mut stream = response.bytes_stream();
        let mut body = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| PaperTransportError::RequestFailed)?;
            if body.len().saturating_add(chunk.len()) > self.limits.maximum_response_bytes {
                return Err(PaperTransportError::ResponseTooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        parse_response(request, status, retry_after_seconds, &body)
            .map_err(PaperTransportError::from)
    }
}

fn retry_after_seconds(headers: &HeaderMap) -> Result<Option<u64>, PaperTransportError> {
    headers
        .get(RETRY_AFTER)
        .map(|value| {
            value
                .to_str()
                .ok()
                .and_then(|value| value.parse::<u64>().ok())
                .filter(|value| *value > 0 && *value <= 300)
                .ok_or(PaperTransportError::InvalidRetryAfter)
        })
        .transpose()
}

fn validate_origin(raw: &str, require_https: bool) -> Result<Url, PaperTransportError> {
    let url = Url::parse(raw).map_err(|_| PaperTransportError::InvalidSourceProxyOrigin)?;
    let scheme_ok = url.scheme() == "https" || (!require_https && url.scheme() == "http");
    if !scheme_ok
        || url.host_str().is_none()
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(PaperTransportError::InvalidSourceProxyOrigin);
    }
    Ok(url)
}

fn validate_limits(limits: &PaperTransportLimits) -> Result<(), PaperTransportError> {
    if limits.connect_timeout.is_zero()
        || limits.connect_timeout > Duration::from_secs(5)
        || limits.request_timeout < limits.connect_timeout
        || limits.request_timeout > Duration::from_secs(15)
        || limits.queue_timeout.is_zero()
        || limits.queue_timeout > Duration::from_secs(2)
        || !(1..=4).contains(&limits.maximum_concurrency)
        || !(1_024..=HARD_MAXIMUM_RESPONSE_BYTES).contains(&limits.maximum_response_bytes)
    {
        return Err(PaperTransportError::UnsafeLimits);
    }
    Ok(())
}

#[derive(Debug, Error)]
pub enum PaperTransportError {
    #[error("D4 Source Proxy origin is invalid")]
    InvalidSourceProxyOrigin,
    #[error("D4 Source Proxy trust anchor is required")]
    MissingTrustAnchor,
    #[error("D4 Source Proxy trust anchor is invalid")]
    InvalidTrustAnchor,
    #[error("D4 Source Proxy workload mTLS identity is required")]
    MissingClientIdentity,
    #[error("D4 Source Proxy workload mTLS identity is invalid")]
    InvalidClientIdentity,
    #[error("D4 transport limits are outside the safety envelope")]
    UnsafeLimits,
    #[error("D4 HTTP client could not be configured")]
    ClientConfiguration,
    #[error("D4 request queue is saturated")]
    QueueSaturated,
    #[error("D4 request queue is closed")]
    QueueClosed,
    #[error("D4 Source Proxy request failed")]
    RequestFailed,
    #[error("D4 Source Proxy redirect is denied")]
    RedirectDenied,
    #[error("D4 Source Proxy must negotiate HTTP/2")]
    Http2Required,
    #[error("D4 Source Proxy response exceeded the byte limit")]
    ResponseTooLarge,
    #[error("D4 Retry-After must be an integer from 1 to 300 seconds")]
    InvalidRetryAfter,
    #[error(transparent)]
    Contract(#[from] paper_source_contract::ContractError),
}

#[cfg(test)]
mod tests;
