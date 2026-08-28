#![forbid(unsafe_code)]

//! Narrow mTLS-only transport for the private Manager-v2 Paper facade.
//!
//! The client takes only a Source Proxy origin plus the Portal workload trust
//! anchor/client identity. The Proxy obtains the short-lived delegated JWT;
//! this crate deliberately has no JWT, issuer, Trading System database, Redis,
//! broker, CLI or V1/API-key configuration surface.

use std::{sync::Arc, time::Duration};

use futures_util::StreamExt as _;
use manager_v2_contract::{
    decode_success, decode_unavailable, ManagerRead, ManagerV2Request, MAXIMUM_RESPONSE_BYTES,
    RUNTIME_CONTRACT_REVISION,
};
use reqwest::{
    header::{HeaderName, HeaderValue, ACCEPT, CONTENT_TYPE},
    redirect::Policy,
    Certificate, Client, Identity,
};
use thiserror::Error;
use tokio::sync::Semaphore;
use url::Url;
use uuid::Uuid;

/// Bounded client settings. They are deliberately tighter than the owner
/// facade's published concurrency and body limits.
#[derive(Debug, Clone)]
pub struct ManagerV2ClientLimits {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub queue_timeout: Duration,
    pub maximum_concurrency: usize,
    pub maximum_response_bytes: usize,
}

impl Default for ManagerV2ClientLimits {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(2),
            request_timeout: Duration::from_secs(5),
            queue_timeout: Duration::from_millis(250),
            maximum_concurrency: 2,
            maximum_response_bytes: MAXIMUM_RESPONSE_BYTES,
        }
    }
}

/// Private mTLS inputs for the one fixed Source Proxy origin.
pub struct ManagerV2ClientConfig<'a> {
    pub source_proxy_origin: &'a str,
    pub root_ca_pem: &'a [u8],
    pub client_identity_pem: &'a [u8],
    pub limits: ManagerV2ClientLimits,
}

/// Sealed Manager-v2 HTTPS client. It has no generic URL or header API.
#[derive(Clone)]
pub struct ManagerV2Client {
    client: Client,
    source_proxy_origin: Url,
    semaphore: Arc<Semaphore>,
    limits: ManagerV2ClientLimits,
}

impl ManagerV2Client {
    /// Creates the production client pinned to an HTTPS-only Source Proxy and
    /// one TLS 1.3 Portal workload identity.
    ///
    /// # Errors
    ///
    /// Rejects unsafe origins, missing/invalid mTLS material and limits outside
    /// this bounded consumer envelope.
    pub fn new(config: ManagerV2ClientConfig<'_>) -> Result<Self, ManagerV2ClientError> {
        Self::build(config, true)
    }

    fn build(
        config: ManagerV2ClientConfig<'_>,
        enforce_tls: bool,
    ) -> Result<Self, ManagerV2ClientError> {
        validate_limits(&config.limits)?;
        let source_proxy_origin = validate_origin(config.source_proxy_origin, enforce_tls)?;
        if enforce_tls && config.root_ca_pem.is_empty() {
            return Err(ManagerV2ClientError::MissingTrustAnchor);
        }
        if enforce_tls && config.client_identity_pem.is_empty() {
            return Err(ManagerV2ClientError::MissingClientIdentity);
        }

        let mut builder = Client::builder()
            .connect_timeout(config.limits.connect_timeout)
            .timeout(config.limits.request_timeout)
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("portal-execution-edge/manager-v2.runtime.v1");
        if enforce_tls {
            let root = Certificate::from_pem(config.root_ca_pem)
                .map_err(|_| ManagerV2ClientError::InvalidTrustAnchor)?;
            let identity = Identity::from_pem(config.client_identity_pem)
                .map_err(|_| ManagerV2ClientError::InvalidClientIdentity)?;
            builder = builder
                .https_only(true)
                .min_tls_version(reqwest::tls::Version::TLS_1_3)
                .max_tls_version(reqwest::tls::Version::TLS_1_3)
                .add_root_certificate(root)
                .identity(identity);
        }
        let client = builder
            .build()
            .map_err(|_| ManagerV2ClientError::ClientConfiguration)?;
        Ok(Self {
            client,
            source_proxy_origin,
            semaphore: Arc::new(Semaphore::new(config.limits.maximum_concurrency)),
            limits: config.limits,
        })
    }

    #[cfg(test)]
    fn new_for_test(
        source_proxy_origin: &str,
        limits: ManagerV2ClientLimits,
    ) -> Result<Self, ManagerV2ClientError> {
        Self::build(
            ManagerV2ClientConfig {
                source_proxy_origin,
                root_ca_pem: &[],
                client_identity_pem: &[],
                limits,
            },
            false,
        )
    }

    /// Executes exactly one fixed Manager-v2 request through the Source Proxy.
    ///
    /// The client deliberately does not retry. A future named Portal read model
    /// owns freshness and retry semantics, preventing an implicit retry from
    /// becoming a source of hidden load or incorrect state assumptions.
    ///
    /// # Errors
    ///
    /// Fails closed on queue saturation, redirect/header/content-type/body
    /// drift, unexpected status, transport failure, or typed contract failure.
    pub async fn execute(
        &self,
        request: &ManagerV2Request,
    ) -> Result<ManagerRead, ManagerV2ClientError> {
        let _permit = tokio::time::timeout(
            self.limits.queue_timeout,
            self.semaphore.clone().acquire_owned(),
        )
        .await
        .map_err(|_| ManagerV2ClientError::QueueSaturated)?
        .map_err(|_| ManagerV2ClientError::QueueClosed)?;
        self.send_once(request).await
    }

    async fn send_once(
        &self,
        request: &ManagerV2Request,
    ) -> Result<ManagerRead, ManagerV2ClientError> {
        let blueprint = request.blueprint();
        let mut url = self.source_proxy_origin.clone();
        url.set_path(blueprint.path());
        if !blueprint.query().is_empty() {
            url.query_pairs_mut().extend_pairs(
                blueprint
                    .query()
                    .iter()
                    .map(|(name, value)| (*name, value.as_str())),
            );
        }
        let request_id = HeaderValue::from_str(&Uuid::now_v7().to_string())
            .map_err(|_| ManagerV2ClientError::ClientConfiguration)?;
        let response = self
            .client
            .get(url)
            .header(ACCEPT, "application/json")
            .header(HeaderName::from_static("x-request-id"), request_id)
            .send()
            .await
            .map_err(|_| ManagerV2ClientError::RequestFailed)?;
        if response.status().is_redirection() {
            return Err(ManagerV2ClientError::RedirectDenied);
        }
        validate_response_headers(response.headers())?;
        if response
            .content_length()
            .is_some_and(|length| length > self.limits.maximum_response_bytes as u64)
        {
            return Err(ManagerV2ClientError::ResponseTooLarge);
        }

        let status = response.status().as_u16();
        let mut stream = response.bytes_stream();
        let mut body = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| ManagerV2ClientError::RequestFailed)?;
            if body.len().saturating_add(chunk.len()) > self.limits.maximum_response_bytes {
                return Err(ManagerV2ClientError::ResponseTooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        match status {
            200 => decode_success(request, &body)
                .map(ManagerRead::Available)
                .map_err(ManagerV2ClientError::from),
            503 => decode_unavailable(&body)
                .map(ManagerRead::Unavailable)
                .map_err(ManagerV2ClientError::from),
            _ => Err(ManagerV2ClientError::UnexpectedHttpStatus(status)),
        }
    }
}

fn validate_origin(raw: &str, require_https: bool) -> Result<Url, ManagerV2ClientError> {
    let url = Url::parse(raw).map_err(|_| ManagerV2ClientError::InvalidSourceProxyOrigin)?;
    let scheme_ok = url.scheme() == "https" || (!require_https && url.scheme() == "http");
    if !scheme_ok
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(ManagerV2ClientError::InvalidSourceProxyOrigin);
    }
    Ok(url)
}

fn validate_limits(limits: &ManagerV2ClientLimits) -> Result<(), ManagerV2ClientError> {
    if limits.connect_timeout.is_zero()
        || limits.connect_timeout > Duration::from_secs(5)
        || limits.request_timeout < limits.connect_timeout
        || limits.request_timeout > Duration::from_secs(15)
        || limits.queue_timeout.is_zero()
        || limits.queue_timeout > Duration::from_secs(2)
        || !(1..=2).contains(&limits.maximum_concurrency)
        || !(1_024..=MAXIMUM_RESPONSE_BYTES).contains(&limits.maximum_response_bytes)
    {
        return Err(ManagerV2ClientError::UnsafeLimits);
    }
    Ok(())
}

fn validate_response_headers(
    headers: &reqwest::header::HeaderMap,
) -> Result<(), ManagerV2ClientError> {
    let contract = headers
        .get(HeaderName::from_static("x-manager-contract"))
        .and_then(|value| value.to_str().ok());
    if contract != Some(RUNTIME_CONTRACT_REVISION) {
        return Err(ManagerV2ClientError::ContractHeaderMismatch);
    }
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_ascii_lowercase);
    if !content_type.is_some_and(|value| value.starts_with("application/json")) {
        return Err(ManagerV2ClientError::InvalidContentType);
    }
    Ok(())
}

/// Bounded Manager-v2 client errors. They intentionally exclude source bodies,
/// keys and transport credentials from their values and display text.
#[derive(Debug, Error)]
pub enum ManagerV2ClientError {
    #[error("Manager-v2 Source Proxy origin is invalid")]
    InvalidSourceProxyOrigin,
    #[error("Manager-v2 Source Proxy trust anchor is required")]
    MissingTrustAnchor,
    #[error("Manager-v2 Source Proxy trust anchor is invalid")]
    InvalidTrustAnchor,
    #[error("Manager-v2 Source Proxy workload mTLS identity is required")]
    MissingClientIdentity,
    #[error("Manager-v2 Source Proxy workload mTLS identity is invalid")]
    InvalidClientIdentity,
    #[error("Manager-v2 client limits are outside the approved safety envelope")]
    UnsafeLimits,
    #[error("Manager-v2 HTTP client could not be configured")]
    ClientConfiguration,
    #[error("Manager-v2 request queue is saturated")]
    QueueSaturated,
    #[error("Manager-v2 request queue is closed")]
    QueueClosed,
    #[error("Manager-v2 Source Proxy request failed")]
    RequestFailed,
    #[error("Manager-v2 Source Proxy redirect is denied")]
    RedirectDenied,
    #[error("Manager-v2 response contract header drifted or was absent")]
    ContractHeaderMismatch,
    #[error("Manager-v2 response content type is not JSON")]
    InvalidContentType,
    #[error("Manager-v2 response exceeded the owner-qualified byte limit")]
    ResponseTooLarge,
    #[error("Manager-v2 Source Proxy returned unexpected HTTP status {0}")]
    UnexpectedHttpStatus(u16),
    #[error(transparent)]
    Contract(#[from] manager_v2_contract::ContractError),
}

#[cfg(test)]
mod tests;
