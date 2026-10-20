//! Closed PM command transport. No listener, signer, authority or activation.
//!
//! The durable relay owns single-send admission. Every uncertain result remains
//! UNKNOWN, including a custody ACK lost after the owning source COMMIT. Lookup
//! uses only the published human-authenticated status route; it is NOT a private
//! service-only `RecoveryProvider` and must not impersonate a logged-out human.

use std::{future::Future, io::Cursor, pin::Pin, sync::Arc, time::Duration};

use command_relay::{
    durable::CommandIntent,
    pm_source::{decode_outcome, http_request_digest, PmOutcome, PmSourceBinding},
};
use projection_store_pg::command::{CommandPort, SourceFuture, SourceReply};
use reqwest::{header, Client, Url};
use rustls::{
    client::{danger::ServerCertVerified, danger::ServerCertVerifier, WebPkiServerVerifier},
    pki_types::{CertificateDer, ServerName, UnixTime},
    DigitallySignedStruct, RootCertStore, SignatureScheme,
};
use sha2::{Digest, Sha256};
use tokio::sync::Semaphore;

const SUBMIT: &str = "/internal/elp210/pm-command/submit";
const STATUS: &str = "/internal/elp210/pm-command/status";
const MAX_BODY: usize = 32_768;
const MAX_HEADER: usize = 8_192;
const MAX_PEM: usize = 65_536;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PmAction {
    Submit,
    Status,
}

impl PmAction {
    fn path(self) -> &'static str {
        match self {
            Self::Submit => SUBMIT,
            Self::Status => STATUS,
        }
    }
}

/// Static failure only: never contain URLs, keys, JWTs or business payloads.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PmUnavailable;

pub type ContextFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, PmUnavailable>> + Send + 'a>>;

/// Supplied by the owning retained command store, never by browser input or a
/// response. The source digest/target belong to the ORIGINAL normalization.
pub struct OriginalPmCommand {
    reference: String,
    binding: PmSourceBinding,
    request_digest: String,
}

impl OriginalPmCommand {
    /// # Errors
    /// Rejects invalid retained references or original source correlation pins.
    pub fn new(
        intent: &CommandIntent,
        reference: &str,
        original_source_digest: &str,
        original_resolved_target: &str,
    ) -> Result<Self, PmUnavailable> {
        if reference.is_empty()
            || reference.len() > 512
            || reference.trim() != reference
            || reference.chars().any(char::is_control)
        {
            return Err(PmUnavailable);
        }
        Ok(Self {
            reference: reference.to_owned(),
            binding: PmSourceBinding::new(intent, original_source_digest, original_resolved_target)
                .map_err(|_| PmUnavailable)?,
            request_digest: intent.request_digest().to_owned(),
        })
    }
}

/// Opaque, deliberately not Debug/Serialize. Structural validation is not a
/// claim of human authority: the owning current-requester issuer supplies it.
pub struct HumanAssertion(String);

impl HumanAssertion {
    /// # Errors
    /// Rejects oversized or non-JWT-shaped input without exposing its value.
    pub fn new(value: String) -> Result<Self, PmUnavailable> {
        if value.len() > MAX_HEADER {
            return Err(PmUnavailable);
        }
        let parts: Vec<_> = value.split('.').collect();
        if parts.len() != 3
            || parts.iter().any(|part| {
                part.is_empty()
                    || !part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
            })
        {
            return Err(PmUnavailable);
        }
        Ok(Self(value))
    }
}

/// Trusted composition, not an implementation of authorization. No fallback.
pub trait PmCommandContext: Send + Sync {
    /// Resolve RETAINED original reference/digest/target for this scoped intent.
    fn original<'a>(&'a self, intent: &'a CommandIntent) -> ContextFuture<'a, OriginalPmCommand>;

    /// Obtain a fresh human assertion for the ACTUAL current requester and the
    /// supplied exact POST bytes/path digest. Never infer requester from the
    /// immutable historical actor, mint locally or reuse a submit JWT on status.
    fn assertion<'a>(
        &'a self,
        intent: &'a CommandIntent,
        action: PmAction,
        delivered_request_digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion>;

    /// Durably/idempotently retain the FULL owning correlation and presentation
    /// before ACK. Cancellation/ACK loss must remain recoverable by the original
    /// key; a future completing with Ok is not an in-memory-only acknowledgement.
    fn retain<'a>(
        &'a self,
        intent: &'a CommandIntent,
        outcome: &'a PmOutcome,
    ) -> ContextFuture<'a, ()>;
}

/// Explicit private commissioning inputs. No implicit trust, limits or runtime.
pub struct PmCommandConfig {
    pub origin: String,
    pub server_ca_pem: Vec<u8>,
    pub client_certificate_pem: Vec<u8>,
    pub client_key_pem: Vec<u8>,
    pub server_leaf_sha256: [u8; 32],
    pub request_limit: usize,
    pub response_limit: usize,
    pub deadline: Duration,
    pub max_inflight: usize,
}

pub struct PmHttpCommandPort {
    client: Client,
    origin: Url,
    host: String,
    context: Arc<dyn PmCommandContext>,
    request_limit: usize,
    response_limit: usize,
    deadline: Duration,
    permits: Arc<Semaphore>,
}

impl PmHttpCommandPort {
    /// # Errors
    /// Rejects invalid explicit bounds, origin or TLS identity/trust material.
    pub fn new(
        config: &PmCommandConfig,
        context: Arc<dyn PmCommandContext>,
    ) -> Result<Self, PmUnavailable> {
        if !(1..=MAX_BODY).contains(&config.request_limit)
            || !(1..=MAX_BODY).contains(&config.response_limit)
            || config.deadline.is_zero()
            || config.deadline > Duration::from_secs(10)
            || !(1..=16).contains(&config.max_inflight)
            || config.origin.len() > 2_048
        {
            return Err(PmUnavailable);
        }
        let origin = Url::parse(&config.origin).map_err(|_| PmUnavailable)?;
        if origin.scheme() != "https"
            || origin.host_str().is_none()
            || !origin.username().is_empty()
            || origin.password().is_some()
            || origin.path() != "/"
            || origin.query().is_some()
            || origin.fragment().is_some()
        {
            return Err(PmUnavailable);
        }
        let host = origin.as_str()["https://".len()..]
            .trim_end_matches('/')
            .to_owned();
        let tls = tls_config(config)?;
        let client = Client::builder()
            .use_preconfigured_tls(tls)
            .https_only(true)
            .http1_only()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .pool_max_idle_per_host(0)
            .timeout(config.deadline)
            .connect_timeout(config.deadline)
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .build()
            .map_err(|_| PmUnavailable)?;
        Ok(Self {
            client,
            origin,
            host,
            context,
            request_limit: config.request_limit,
            response_limit: config.response_limit,
            deadline: config.deadline,
            permits: Arc::new(Semaphore::new(config.max_inflight)),
        })
    }

    async fn exchange(
        &self,
        intent: &CommandIntent,
        action: PmAction,
    ) -> Result<SourceReply, PmUnavailable> {
        // Fail-fast admission, never a hidden retry or unbounded waiter queue.
        let _permit = self.permits.try_acquire().map_err(|_| PmUnavailable)?;
        let original = self.context.original(intent).await?;
        if original.request_digest != intent.request_digest() {
            return Err(PmUnavailable);
        }
        let body = serde_json::to_vec(&serde_json::json!({
            "schema_version":"pma.edge-command-transport.v1",
            "reference":original.reference,
            "payload":intent.payload(),
            "transport_payload_digest":intent.digest(),
        }))
        .map_err(|_| PmUnavailable)?;
        let digest = http_request_digest(
            "POST",
            action.path().as_bytes(),
            b"",
            &body,
            self.request_limit,
        )
        .map_err(|_| PmUnavailable)?;
        let assertion = self.context.assertion(intent, action, &digest).await?;
        let headers = self.headers(action, &assertion, body.len())?;
        let url = self.origin.join(action.path()).map_err(|_| PmUnavailable)?;
        // TLS verification (CA/hostname/time AND exact leaf) finishes before
        // reqwest can write any HTTP headers or this opaque assertion. HTTP/1
        // only + Connection:close + no idle pool also excludes reqwest's H2/H3
        // protocol retry paths. There is deliberately no application retry.
        let response = self
            .client
            .post(url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|_| PmUnavailable)?;
        let bytes = response_bytes(response, self.response_limit).await?;
        let outcome =
            decode_outcome(intent, &original.binding, &bytes).map_err(|_| PmUnavailable)?;
        self.context.retain(intent, &outcome).await?;
        Ok(SourceReply::Receipt(Box::new(outcome.receipt)))
    }

    fn headers(
        &self,
        action: PmAction,
        assertion: &HumanAssertion,
        body_len: usize,
    ) -> Result<header::HeaderMap, PmUnavailable> {
        let mut headers = header::HeaderMap::new();
        for (name, value) in [
            (header::HOST, self.host.as_str()),
            (header::CONTENT_TYPE, "application/json"),
            (header::ACCEPT, "application/json"),
            (header::CONNECTION, "close"),
        ] {
            headers.insert(
                name,
                header::HeaderValue::from_str(value).map_err(|_| PmUnavailable)?,
            );
        }
        headers.insert(header::CONTENT_LENGTH, header::HeaderValue::from(body_len));
        let mut bearer = header::HeaderValue::from_str(&format!("Bearer {}", assertion.0))
            .map_err(|_| PmUnavailable)?;
        bearer.set_sensitive(true);
        headers.insert(header::AUTHORIZATION, bearer);
        let head_size = format!("POST {} HTTP/1.1\r\n", action.path()).len()
            + headers
                .iter()
                .map(|(name, value)| name.as_str().len() + value.as_bytes().len() + 4)
                .sum::<usize>()
            + 2;
        if head_size > MAX_HEADER {
            return Err(PmUnavailable);
        }
        Ok(headers)
    }

    fn call<'a>(&'a self, intent: &'a CommandIntent, action: PmAction) -> SourceFuture<'a> {
        Box::pin(async move {
            match tokio::time::timeout(self.deadline, self.exchange(intent, action)).await {
                Ok(Ok(reply)) => reply,
                _ => SourceReply::Unknown,
            }
        })
    }
}

fn certificates(pem: &[u8]) -> Result<Vec<CertificateDer<'static>>, PmUnavailable> {
    if pem.is_empty() || pem.len() > MAX_PEM {
        return Err(PmUnavailable);
    }
    let certs = rustls_pemfile::certs(&mut Cursor::new(pem))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| PmUnavailable)?;
    if certs.is_empty() {
        return Err(PmUnavailable);
    }
    Ok(certs)
}

fn tls_config(config: &PmCommandConfig) -> Result<rustls::ClientConfig, PmUnavailable> {
    let mut roots = RootCertStore::empty();
    for cert in certificates(&config.server_ca_pem)? {
        roots.add(cert).map_err(|_| PmUnavailable)?;
    }
    let client_certs = certificates(&config.client_certificate_pem)?;
    if config.client_key_pem.is_empty() || config.client_key_pem.len() > MAX_PEM {
        return Err(PmUnavailable);
    }
    let key = rustls_pemfile::private_key(&mut Cursor::new(&config.client_key_pem))
        .map_err(|_| PmUnavailable)?
        .ok_or(PmUnavailable)?;
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let webpki = WebPkiServerVerifier::builder_with_provider(Arc::new(roots), provider.clone())
        .build()
        .map_err(|_| PmUnavailable)?;
    rustls::ClientConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .map_err(|_| PmUnavailable)?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(PinnedServer {
            inner: webpki,
            leaf: config.server_leaf_sha256,
        }))
        .with_client_auth_cert(client_certs, key)
        .map_err(|_| PmUnavailable)
}

async fn response_bytes(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, PmUnavailable> {
    if response.status() != reqwest::StatusCode::OK
        || response.headers().get(header::CONTENT_TYPE)
            != Some(&header::HeaderValue::from_static("application/json"))
        || response.headers().contains_key(header::CONTENT_ENCODING)
        || response
            .content_length()
            .is_some_and(|length| length > limit as u64)
    {
        return Err(PmUnavailable);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| PmUnavailable)? {
        if chunk.len() > limit.saturating_sub(bytes.len()) {
            return Err(PmUnavailable);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

impl CommandPort for PmHttpCommandPort {
    fn send<'a>(&'a self, intent: &'a CommandIntent) -> SourceFuture<'a> {
        self.call(intent, PmAction::Submit)
    }

    fn lookup<'a>(&'a self, intent: &'a CommandIntent) -> SourceFuture<'a> {
        self.call(intent, PmAction::Status)
    }
}

#[derive(Debug)]
struct PinnedServer {
    inner: Arc<WebPkiServerVerifier>,
    leaf: [u8; 32],
}

impl ServerCertVerifier for PinnedServer {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        ocsp_response: &[u8],
        now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        let verified = self.inner.verify_server_cert(
            end_entity,
            intermediates,
            server_name,
            ocsp_response,
            now,
        )?;
        let actual_leaf: [u8; 32] = Sha256::digest(end_entity.as_ref()).into();
        if actual_leaf != self.leaf {
            return Err(rustls::Error::General(
                "PM_SERVER_LEAF_PIN_MISMATCH".to_owned(),
            ));
        }
        Ok(verified)
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls12_signature(message, cert, signature)
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        signature: &DigitallySignedStruct,
    ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
        self.inner.verify_tls13_signature(message, cert, signature)
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.inner.supported_verify_schemes()
    }
}

#[cfg(test)]
mod tests;
