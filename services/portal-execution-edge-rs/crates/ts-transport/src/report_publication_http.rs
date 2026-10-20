//! Closed HTTPS delivery of the selected-report wire, never source authority.
//!
//! TLS authenticates the configured endpoint, not publication coverage or a
//! current human grant. The caller obtains an assertion for the EXACT prepared
//! POST path/body from its owning authority. Nothing here issues/decodes JWTs,
//! constructs `Verified<T>`, applies a projection or acknowledges a source.

use std::{sync::Arc, time::Duration};

use futures_util::StreamExt as _;
use reqwest::{
    header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, CONTENT_TYPE},
    redirect::Policy,
    Certificate, Client, Identity,
};
use thiserror::Error;
use tokio::sync::Semaphore;
use url::Url;

use crate::report_publication_wire::{
    PreparedRequest, DELTA_PATH, MAX_WIRE_BYTES, PAGE_PATH, SNAPSHOT_PATH,
};

/// Safety ceilings only, not measured production capacity or a source grant.
#[derive(Clone, Debug)]
pub struct ReportHttpLimits {
    pub connect_timeout: Duration,
    pub request_timeout: Duration,
    pub queue_timeout: Duration,
    pub max_inflight: usize,
    pub maximum_response_bytes: usize,
}

impl Default for ReportHttpLimits {
    fn default() -> Self {
        Self {
            connect_timeout: Duration::from_secs(1),
            request_timeout: Duration::from_secs(5),
            queue_timeout: Duration::from_millis(100),
            max_inflight: 2,
            maximum_response_bytes: MAX_WIRE_BYTES,
        }
    }
}

/// Private inputs are borrowed only during construction; never log this value.
pub struct ReportHttpConfig<'a> {
    pub origin: &'a str,
    pub root_ca_pem: &'a [u8],
    /// Certificate chain and private key in PEM, supplied by the secret owner.
    pub client_identity_pem: &'a [u8],
    pub limits: ReportHttpLimits,
}

/// Bounded record-free failures: no upstream URL, payload or credential text.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum ReportHttpError {
    #[error("REPORT_HTTP_CONFIGURATION")]
    Configuration,
    #[error("REPORT_HTTP_ASSERTION")]
    Assertion,
    #[error("REPORT_HTTP_QUEUE_SATURATED")]
    QueueSaturated,
    #[error("REPORT_HTTP_REQUEST_FAILED")]
    RequestFailed,
    #[error("REPORT_HTTP_REDIRECT_DENIED")]
    RedirectDenied,
    #[error("REPORT_HTTP_RESPONSE_STATUS")]
    ResponseStatus,
    #[error("REPORT_HTTP_RESPONSE_HEADERS")]
    ResponseHeaders,
    #[error("REPORT_HTTP_RESPONSE_TOO_LARGE")]
    ResponseTooLarge,
}

/// Delivered bytes are UNTRUSTED and deliberately have no Debug/Serialize.
/// Feed them to the pinned wire decoder; that still does not verify authority.
pub struct UntrustedReportBody(Vec<u8>);

impl UntrustedReportBody {
    #[must_use]
    pub fn bytes(&self) -> &[u8] {
        &self.0
    }
}

/// A shared, bounded client for one explicit source origin. No arbitrary URL,
/// method, headers, cookie jar, stored bearer token or application retry API.
#[derive(Clone)]
pub struct ReportPublicationHttpClient {
    client: Client,
    origin: Url,
    admission: Arc<Semaphore>,
    semaphore: Arc<Semaphore>,
    limits: ReportHttpLimits,
}

impl ReportPublicationHttpClient {
    /// # Errors
    /// Rejects non-origin URLs, absent/invalid mTLS inputs and unsafe bounds.
    pub fn new(config: ReportHttpConfig<'_>) -> Result<Self, ReportHttpError> {
        let origin = crate::validate_origin(config.origin, true)
            .map_err(|_| ReportHttpError::Configuration)?;
        let limits = config.limits;
        if limits.connect_timeout.is_zero()
            || limits.connect_timeout > Duration::from_secs(5)
            || limits.request_timeout < limits.connect_timeout
            || limits.request_timeout > Duration::from_secs(10)
            || limits.queue_timeout.is_zero()
            || limits.queue_timeout > Duration::from_secs(2)
            || !(1..=16).contains(&limits.max_inflight)
            || !(1..=MAX_WIRE_BYTES).contains(&limits.maximum_response_bytes)
            || config.root_ca_pem.is_empty()
            || config.root_ca_pem.len() > MAX_WIRE_BYTES
            || config.client_identity_pem.is_empty()
            || config.client_identity_pem.len() > MAX_WIRE_BYTES
        {
            return Err(ReportHttpError::Configuration);
        }
        let roots = Certificate::from_pem_bundle(config.root_ca_pem)
            .map_err(|_| ReportHttpError::Configuration)?;
        if roots.is_empty() {
            return Err(ReportHttpError::Configuration);
        }
        let identity = Identity::from_pem(config.client_identity_pem)
            .map_err(|_| ReportHttpError::Configuration)?;
        let mut builder = Client::builder()
            .https_only(true)
            .min_tls_version(reqwest::tls::Version::TLS_1_3)
            .max_tls_version(reqwest::tls::Version::TLS_1_3)
            .tls_built_in_root_certs(false)
            .identity(identity)
            .connect_timeout(limits.connect_timeout)
            .timeout(limits.request_timeout)
            // No pooled stale-connection or HTTP2 resend path. This selected
            // report export is not an order/fill hot path; measure before
            // proposing connection reuse rather than hiding extra attempts.
            .http1_only()
            .pool_max_idle_per_host(0)
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .redirect(Policy::none())
            .no_proxy()
            .user_agent("portal-execution-edge/report-publication.v1");
        for root in roots {
            builder = builder.add_root_certificate(root);
        }
        let client = builder
            .build()
            .map_err(|_| ReportHttpError::Configuration)?;
        Ok(Self {
            client,
            origin,
            admission: Arc::new(Semaphore::new(limits.max_inflight * 2)),
            semaphore: Arc::new(Semaphore::new(limits.max_inflight)),
            limits,
        })
    }

    /// Sends one exact prepared POST, with no reserialization or retry.
    ///
    /// `assertion` is independently issued for this method/path/body and current
    /// principal/scope by the owning authority; this method neither validates
    /// JWT claims nor turns successful TLS/HTTP into source completeness proof.
    /// The bearer header is sensitive and never retained in the client config.
    ///
    /// # Errors
    /// Fails closed on malformed credentials, saturation, TLS/timeout/cancelled
    /// delivery, unexpected response metadata and declared/streamed byte limits.
    pub async fn execute(
        &self,
        request: &PreparedRequest,
        assertion: &str,
    ) -> Result<UntrustedReportBody, ReportHttpError> {
        let deadline = tokio::time::Instant::now() + self.limits.request_timeout;
        // Queue duration alone cannot bound waiting tasks/body ownership. At
        // most N active + N queued callers share these permits across clones.
        let _admission = self
            .admission
            .try_acquire()
            .map_err(|_| ReportHttpError::QueueSaturated)?;
        if !matches!(request.path(), SNAPSHOT_PATH | PAGE_PATH | DELTA_PATH)
            || request.body().len() > MAX_WIRE_BYTES
        {
            return Err(ReportHttpError::Configuration);
        }
        if assertion.is_empty()
            || assertion.len() > 16_384
            || !assertion.bytes().all(|byte| byte.is_ascii_graphic())
        {
            return Err(ReportHttpError::Assertion);
        }
        let mut bearer = HeaderValue::from_str(&format!("Bearer {assertion}"))
            .map_err(|_| ReportHttpError::Assertion)?;
        bearer.set_sensitive(true);
        let queue_deadline =
            (tokio::time::Instant::now() + self.limits.queue_timeout).min(deadline);
        let _permit = tokio::time::timeout_at(queue_deadline, self.semaphore.acquire())
            .await
            .map_err(|_| ReportHttpError::QueueSaturated)?
            .map_err(|_| ReportHttpError::QueueSaturated)?;
        // Outer deadline includes streaming, not merely response headers. A
        // cancelled future drops its response and permit without retry/ACK.
        tokio::time::timeout_at(deadline, self.send_once(request, bearer))
            .await
            .map_err(|_| ReportHttpError::RequestFailed)?
    }

    async fn send_once(
        &self,
        request: &PreparedRequest,
        bearer: HeaderValue,
    ) -> Result<UntrustedReportBody, ReportHttpError> {
        let mut url = self.origin.clone();
        url.set_path(request.path());
        let response = self
            .client
            .post(url)
            .header(AUTHORIZATION, bearer)
            .header(CONTENT_TYPE, "application/json")
            .header(ACCEPT, "application/json")
            .header("accept-encoding", "identity")
            .header("connection", "close")
            .body(request.body().to_vec())
            .send()
            .await
            .map_err(|_| ReportHttpError::RequestFailed)?;
        if response.status().is_redirection() {
            return Err(ReportHttpError::RedirectDenied);
        }
        if response.status() != reqwest::StatusCode::OK {
            return Err(ReportHttpError::ResponseStatus);
        }
        validate_headers(response.headers())?;
        if response
            .content_length()
            .is_some_and(|length| length > self.limits.maximum_response_bytes as u64)
        {
            return Err(ReportHttpError::ResponseTooLarge);
        }
        let mut stream = response.bytes_stream();
        let mut body = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| ReportHttpError::RequestFailed)?;
            if chunk.len()
                > self
                    .limits
                    .maximum_response_bytes
                    .saturating_sub(body.len())
            {
                return Err(ReportHttpError::ResponseTooLarge);
            }
            body.extend_from_slice(&chunk);
        }
        Ok(UntrustedReportBody(body))
    }
}

fn one_header<'a>(headers: &'a HeaderMap, name: &str) -> Result<&'a str, ReportHttpError> {
    let mut values = headers.get_all(name).iter();
    let value = values
        .next()
        .ok_or(ReportHttpError::ResponseHeaders)?
        .to_str()
        .map_err(|_| ReportHttpError::ResponseHeaders)?;
    if values.next().is_some() {
        return Err(ReportHttpError::ResponseHeaders);
    }
    Ok(value)
}

fn validate_headers(headers: &HeaderMap) -> Result<(), ReportHttpError> {
    let content_type = one_header(headers, "content-type")?;
    if !(content_type.eq_ignore_ascii_case("application/json")
        || content_type.eq_ignore_ascii_case("application/json; charset=utf-8"))
        || one_header(headers, "x-pma-publication-wire")? != "scoped-bootstrap.v1"
        || !one_header(headers, "cache-control")?.eq_ignore_ascii_case("no-store")
        || !one_header(headers, "vary")?
            .split(',')
            .any(|value| value.trim().eq_ignore_ascii_case("authorization"))
    {
        return Err(ReportHttpError::ResponseHeaders);
    }
    if headers.contains_key("content-encoding")
        && !one_header(headers, "content-encoding")?.eq_ignore_ascii_case("identity")
    {
        return Err(ReportHttpError::ResponseHeaders);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
