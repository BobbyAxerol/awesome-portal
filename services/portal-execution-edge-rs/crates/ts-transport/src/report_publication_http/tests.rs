//! `TEST_ONLY` ephemeral mTLS delivery, never a source grant or publication proof.
use super::*;
use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

use authoritative_event_core::bootstrap::{Binding, Limits, Manifest};
use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    response::Response,
    routing::post,
    Router,
};
use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
use rustls::RootCertStore;
use serde_json::json;
use tokio::sync::{Notify, Semaphore};

use crate::report_publication_wire::{ReportPublicationWire, DATASET, PAYLOAD_SCHEMA};

const ASSERTION: &str = "TEST_ONLY.independently_issued.assertion";
const NOW: i64 = 1_792_100_000_000;

struct TlsMaterial {
    ca: Vec<u8>,
    server_certificate: Vec<u8>,
    server_key: Vec<u8>,
    client_identity: Vec<u8>,
}

fn material() -> TlsMaterial {
    let mut params = CertificateParams::new(Vec::<String>::new()).unwrap();
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let ca_key = KeyPair::generate().unwrap();
    let ca = params.self_signed(&ca_key).unwrap();
    let mut params = CertificateParams::new(vec!["localhost".to_owned()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let server_key = KeyPair::generate().unwrap();
    let server = params.signed_by(&server_key, &ca, &ca_key).unwrap();
    let mut params = CertificateParams::new(vec!["TEST_ONLY-client".to_owned()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];
    let client_key = KeyPair::generate().unwrap();
    let client = params.signed_by(&client_key, &ca, &ca_key).unwrap();
    TlsMaterial {
        ca: ca.pem().into_bytes(),
        server_certificate: server.pem().into_bytes(),
        server_key: server_key.serialize_pem().into_bytes(),
        client_identity: format!("{}{}", client.pem(), client_key.serialize_pem()).into_bytes(),
    }
}

#[derive(Clone)]
enum Delivery {
    Finite,
    Chunked,
    Broken,
    Delayed(Duration),
}

#[derive(Clone)]
struct Reply {
    status: StatusCode,
    headers: Vec<(&'static str, String)>,
    bytes: Vec<u8>,
    delivery: Delivery,
}

impl Default for Reply {
    fn default() -> Self {
        Self {
            status: StatusCode::OK,
            headers: vec![
                ("content-type", "application/json".into()),
                ("x-pma-publication-wire", "scoped-bootstrap.v1".into()),
                ("cache-control", "no-store".into()),
                ("vary", "Authorization".into()),
            ],
            bytes: br#"{"TEST_ONLY":"UNTRUSTED"}"#.to_vec(),
            delivery: Delivery::Finite,
        }
    }
}

struct Observation {
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    bytes: Vec<u8>,
}

struct ServerState {
    observed: Mutex<Vec<Observation>>,
    reply: Mutex<Reply>,
    hold: AtomicBool,
    entered: Notify,
    release: Semaphore,
}

async fn handler(
    State(state): State<Arc<ServerState>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    state.observed.lock().unwrap().push(Observation {
        method,
        uri,
        headers,
        bytes: body.to_vec(),
    });
    let reply = state.reply.lock().unwrap().clone();
    state.entered.notify_one();
    if state.hold.load(Ordering::SeqCst) {
        state.release.acquire().await.unwrap().forget();
    }
    let mut response = Response::builder().status(reply.status);
    for (name, value) in reply.headers {
        response = response.header(name, value);
    }
    let body = match reply.delivery {
        Delivery::Finite => Body::from(reply.bytes),
        Delivery::Chunked => {
            let midpoint = reply.bytes.len() / 2;
            let chunks = vec![
                Ok::<Bytes, std::io::Error>(reply.bytes[..midpoint].to_vec().into()),
                Ok(reply.bytes[midpoint..].to_vec().into()),
            ];
            Body::from_stream(futures_util::stream::iter(chunks))
        }
        Delivery::Broken => {
            response = response.header("content-length", "100");
            Body::from_stream(futures_util::stream::once(async {
                Err::<Bytes, _>(std::io::Error::new(
                    std::io::ErrorKind::ConnectionReset,
                    "TEST_ONLY incomplete body",
                ))
            }))
        }
        Delivery::Delayed(delay) => Body::from_stream(futures_util::stream::once(async move {
            tokio::time::sleep(delay).await;
            Ok::<Bytes, std::io::Error>(reply.bytes.into())
        })),
    };
    response.body(body).unwrap()
}

struct Fixture {
    tls: TlsMaterial,
    origin: String,
    state: Arc<ServerState>,
    handle: axum_server::Handle,
    job: Option<tokio::task::JoinHandle<()>>,
}

impl Fixture {
    async fn new() -> Self {
        Self::with_protocol(&rustls::version::TLS13).await
    }

    async fn with_protocol(protocol: &'static rustls::SupportedProtocolVersion) -> Self {
        let tls = material();
        let certs = |pem: &[u8]| {
            rustls_pemfile::certs(&mut Cursor::new(pem))
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        let mut roots = RootCertStore::empty();
        for cert in certs(&tls.ca) {
            roots.add(cert).unwrap();
        }
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let verifier = rustls::server::WebPkiClientVerifier::builder_with_provider(
            Arc::new(roots),
            provider.clone(),
        )
        .build()
        .unwrap();
        let key = rustls_pemfile::private_key(&mut Cursor::new(&tls.server_key))
            .unwrap()
            .unwrap();
        let mut config = rustls::ServerConfig::builder_with_provider(provider)
            .with_protocol_versions(&[protocol])
            .unwrap()
            .with_client_cert_verifier(verifier)
            .with_single_cert(certs(&tls.server_certificate), key)
            .unwrap();
        config.alpn_protocols = vec![b"http/1.1".to_vec()];
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let origin = format!(
            "https://localhost:{}/",
            listener.local_addr().unwrap().port()
        );
        let state = Arc::new(ServerState {
            observed: Mutex::new(Vec::new()),
            reply: Mutex::new(Reply::default()),
            hold: AtomicBool::new(false),
            entered: Notify::new(),
            release: Semaphore::new(0),
        });
        let app = Router::new()
            .route(SNAPSHOT_PATH, post(handler))
            .route(PAGE_PATH, post(handler))
            .route(DELTA_PATH, post(handler))
            .with_state(state.clone());
        let handle = axum_server::Handle::new();
        let serving_handle = handle.clone();
        let job = tokio::spawn(async move {
            axum_server::from_tcp_rustls(
                listener,
                axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(config)),
            )
            .handle(serving_handle)
            .serve(app.into_make_service())
            .await
            .unwrap();
        });
        tokio::task::yield_now().await;
        Self {
            tls,
            origin,
            state,
            handle,
            job: Some(job),
        }
    }

    fn config(&self) -> ReportHttpConfig<'_> {
        ReportHttpConfig {
            origin: &self.origin,
            root_ca_pem: &self.tls.ca,
            client_identity_pem: &self.tls.client_identity,
            limits: ReportHttpLimits::default(),
        }
    }

    fn client(&self) -> ReportPublicationHttpClient {
        ReportPublicationHttpClient::new(self.config()).unwrap()
    }

    async fn entered(&self) {
        tokio::time::timeout(Duration::from_secs(2), self.state.entered.notified())
            .await
            .unwrap();
    }

    async fn finish(mut self) {
        self.state.hold.store(false, Ordering::SeqCst);
        self.state.release.add_permits(4);
        self.handle.graceful_shutdown(Some(Duration::from_secs(1)));
        tokio::time::timeout(Duration::from_secs(2), self.job.take().unwrap())
            .await
            .unwrap()
            .unwrap();
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.handle.shutdown();
        if let Some(job) = self.job.take() {
            job.abort();
        }
    }
}

fn page_and_delta() -> (PreparedRequest, PreparedRequest) {
    let cursor = "pmrb1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let binding: Binding = serde_json::from_value(json!({
        "source":{"stream_id":"TEST_ONLY.reports","contract_revision":"TEST_ONLY.v1",
            "workspace_id":"TEST_ONLY_workspace","environment":"paper","profile_id":"TEST_ONLY_profile",
            "venue_id":"TEST_ONLY","resource_kind":"reports","resource_id":"TEST_ONLY_reports",
            "filter_digest":format!("sha256:{}","a".repeat(64))},
        "source_epoch":"TEST_ONLY_epoch","consumer_id":"TEST_ONLY_consumer",
        "principal_digest":format!("sha256:{}","b".repeat(64)),"policy_revision":"TEST_ONLY_policy",
        "query_digest":format!("sha256:{}","c".repeat(64)),"consistency_group":"TEST_ONLY_reports",
        "datasets":{(DATASET):PAYLOAD_SCHEMA}
    })).unwrap();
    let manifest: Manifest = serde_json::from_value(json!({
        "binding":binding,"generation":"00000000-0000-4000-8000-000000000001",
        "snapshot_id":"TEST_ONLY_snapshot","barrier":cursor,"delta_start":cursor,
        "catchup_cursor":cursor,"expires_at_ms":NOW+60_000,"rollback_until_ms":NOW+60_000,
        "references":[],"pages":{(DATASET):{"count":"1","final_digest":format!("sha256:{}","d".repeat(64))}}
    })).unwrap();
    let wire = ReportPublicationWire::new(
        binding,
        Limits {
            page_rows: 200,
            page_bytes: MAX_WIRE_BYTES,
            group_events: 1000,
            group_bytes: MAX_WIRE_BYTES,
            group_chunks: 64,
            snapshot_ttl_ms: 300_000,
            rollback_ttl_ms: 300_000,
        },
    )
    .unwrap();
    (
        wire.page_request(&manifest, 0, NOW).unwrap(),
        wire.delta_request(&manifest, cursor, NOW).unwrap(),
    )
}

#[test]
fn defaults_are_explicit_bounded_correctness_ceilings() {
    let limits = ReportHttpLimits::default();
    assert_eq!(limits.connect_timeout, Duration::from_secs(1));
    assert_eq!(limits.request_timeout, Duration::from_secs(5));
    assert_eq!(limits.queue_timeout, Duration::from_millis(100));
    assert_eq!(limits.max_inflight, 2);
    assert_eq!(limits.maximum_response_bytes, MAX_WIRE_BYTES);
}

#[tokio::test]
async fn configuration_rejects_non_origin_urls_without_http() {
    let fixture = Fixture::new().await;
    for origin in [
        "http://localhost/",
        "https://user:password@localhost/",
        "https://localhost/path",
        "https://localhost/?query=1",
        "https://localhost/#fragment",
    ] {
        let mut config = fixture.config();
        config.origin = origin;
        assert!(matches!(
            ReportPublicationHttpClient::new(config),
            Err(ReportHttpError::Configuration)
        ));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn configuration_rejects_unbounded_or_zero_limits_without_http() {
    let fixture = Fixture::new().await;
    for kind in 0..10 {
        let mut config = fixture.config();
        match kind {
            0 => config.limits.connect_timeout = Duration::ZERO,
            1 => config.limits.connect_timeout = Duration::from_secs(6),
            2 => config.limits.request_timeout = Duration::ZERO,
            3 => config.limits.request_timeout = Duration::from_secs(11),
            4 => config.limits.queue_timeout = Duration::ZERO,
            5 => config.limits.queue_timeout = Duration::from_secs(3),
            6 => config.limits.max_inflight = 0,
            7 => config.limits.max_inflight = 17,
            8 => config.limits.maximum_response_bytes = 0,
            _ => config.limits.maximum_response_bytes = MAX_WIRE_BYTES + 1,
        }
        assert!(matches!(
            ReportPublicationHttpClient::new(config),
            Err(ReportHttpError::Configuration)
        ));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn configuration_requires_real_ca_and_client_identity_material() {
    let fixture = Fixture::new().await;
    for kind in 0..4 {
        let mut config = fixture.config();
        match kind {
            0 => config.root_ca_pem = b"",
            1 => config.root_ca_pem = b"TEST_ONLY not a CA",
            2 => config.client_identity_pem = b"",
            _ => config.client_identity_pem = b"TEST_ONLY not a client identity",
        }
        assert!(matches!(
            ReportPublicationHttpClient::new(config),
            Err(ReportHttpError::Configuration)
        ));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn real_mtls_delivers_exact_sealed_snapshot_and_bearer_bytes() {
    let fixture = Fixture::new().await;
    let request = ReportPublicationWire::snapshot_request();
    let result = fixture.client().execute(&request, ASSERTION).await.unwrap();
    assert_eq!(result.bytes(), Reply::default().bytes);
    {
        let observed = fixture.state.observed.lock().unwrap();
        assert_eq!(observed.len(), 1);
        assert_eq!(observed[0].method, Method::POST);
        assert_eq!(observed[0].uri.path(), SNAPSHOT_PATH);
        assert!(observed[0].uri.query().is_none());
        assert_eq!(observed[0].bytes, request.body());
        assert_eq!(
            observed[0].headers["authorization"],
            format!("Bearer {ASSERTION}")
        );
        assert_eq!(observed[0].headers["content-type"], "application/json");
        assert_eq!(observed[0].headers["accept"], "application/json");
        assert_eq!(observed[0].headers["accept-encoding"], "identity");
        assert!(!observed[0].headers.contains_key("cookie"));
    }
    fixture.finish().await;
}

#[tokio::test]
async fn page_and_delta_preserve_prepared_path_body_and_integer_index() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    let (page, delta) = page_and_delta();
    for request in [&page, &delta] {
        client.execute(request, ASSERTION).await.unwrap();
    }
    {
        let observed = fixture.state.observed.lock().unwrap();
        assert_eq!(observed.len(), 2);
        for (actual, prepared) in observed.iter().zip([&page, &delta]) {
            assert_eq!(actual.uri.path(), prepared.path());
            assert_eq!(actual.bytes, prepared.body());
        }
        let body: serde_json::Value = serde_json::from_slice(&observed[0].bytes).unwrap();
        assert_eq!(body["index"], json!(0));
        assert!(body["index"].is_u64());
    }
    fixture.finish().await;
}

#[tokio::test]
async fn successful_http_returns_untrusted_bytes_without_promoting_json_to_a_fact() {
    let fixture = Fixture::new().await;
    fixture.state.reply.lock().unwrap().bytes = b"TEST_ONLY not JSON or a source proof".to_vec();
    let body = fixture
        .client()
        .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
        .await
        .unwrap();
    assert_eq!(body.bytes(), b"TEST_ONLY not JSON or a source proof");
    assert!(serde_json::from_slice::<serde_json::Value>(body.bytes()).is_err());
    fixture.finish().await;
}

#[tokio::test]
async fn unsafe_or_oversized_assertions_are_refused_before_any_http() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    for assertion in [
        String::new(),
        "TEST_ONLY token".into(),
        "TEST_ONLY\r\nInjected:x".into(),
        "TEST_ONLY\tsecret".into(),
        "TEST_ONLY\0secret".into(),
        "TEST_ONLYé".into(),
        "x".repeat(16_385),
    ] {
        assert!(matches!(
            client
                .execute(&ReportPublicationWire::snapshot_request(), &assertion)
                .await,
            Err(ReportHttpError::Assertion)
        ));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn assertion_length_edges_are_inclusive_without_local_jwt_issuance() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    for length in [1, 16_384] {
        let assertion = "x".repeat(length);
        client
            .execute(&ReportPublicationWire::snapshot_request(), &assertion)
            .await
            .unwrap();
        assert_eq!(
            fixture
                .state
                .observed
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .headers["authorization"],
            format!("Bearer {assertion}")
        );
    }
    fixture.finish().await;
}

#[tokio::test]
async fn wrong_ca_hostname_and_foreign_client_fail_before_http_credentials() {
    let fixture = Fixture::new().await;
    let foreign = material();
    let wrong_host = fixture.origin.replace("localhost", "127.0.0.1");
    for kind in 0..3 {
        let mut config = fixture.config();
        match kind {
            0 => config.root_ca_pem = &foreign.ca,
            1 => config.origin = &wrong_host,
            _ => config.client_identity_pem = &foreign.client_identity,
        }
        let client = ReportPublicationHttpClient::new(config).unwrap();
        assert!(matches!(
            client
                .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
                .await,
            Err(ReportHttpError::RequestFailed)
        ));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn tls12_only_server_receives_no_http_or_assertion() {
    let fixture = Fixture::with_protocol(&rustls::version::TLS12).await;
    assert!(matches!(
        fixture
            .client()
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::RequestFailed)
    ));
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn missing_or_wrong_security_metadata_never_becomes_an_untrusted_success() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    for (name, bad) in [
        ("content-type", "text/plain"),
        ("x-pma-publication-wire", "legacy.v1"),
        ("cache-control", "public"),
        ("vary", "Accept"),
    ] {
        for missing in [true, false] {
            let mut reply = Reply::default();
            reply.headers.retain(|(key, _)| *key != name);
            if !missing {
                reply.headers.push((name, bad.into()));
            }
            *fixture.state.reply.lock().unwrap() = reply;
            assert!(matches!(
                client
                    .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
                    .await,
                Err(ReportHttpError::ResponseHeaders)
            ));
        }
    }
    fixture.finish().await;
}

#[tokio::test]
async fn duplicate_security_headers_fail_closed_even_when_values_match() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    for (name, value) in [
        ("content-type", "application/json"),
        ("x-pma-publication-wire", "scoped-bootstrap.v1"),
        ("cache-control", "no-store"),
        ("vary", "Authorization"),
        ("content-encoding", "identity"),
    ] {
        let mut reply = Reply::default();
        if name == "content-encoding" {
            reply.headers.push((name, value.into()));
        }
        reply.headers.push((name, value.into()));
        *fixture.state.reply.lock().unwrap() = reply;
        assert!(matches!(
            client
                .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
                .await,
            Err(ReportHttpError::ResponseHeaders)
        ));
    }
    fixture.finish().await;
}

#[tokio::test]
async fn explicit_json_charset_identity_and_case_insensitive_vary_tokens_are_accepted() {
    let fixture = Fixture::new().await;
    {
        let mut reply = fixture.state.reply.lock().unwrap();
        reply.headers = vec![
            ("content-type", "Application/JSON; charset=UTF-8".into()),
            ("x-pma-publication-wire", "scoped-bootstrap.v1".into()),
            ("cache-control", "NO-STORE".into()),
            ("vary", "Accept, aUtHoRiZaTiOn".into()),
            ("content-encoding", "IDENTITY".into()),
        ];
    }
    fixture
        .client()
        .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
        .await
        .unwrap();
    fixture.finish().await;
}

#[tokio::test]
async fn encoded_response_is_never_automatically_decoded() {
    let fixture = Fixture::new().await;
    let client = fixture.client();
    for encoding in ["gzip", "br", "deflate", "zstd"] {
        let mut reply = Reply::default();
        reply.headers.push(("content-encoding", encoding.into()));
        *fixture.state.reply.lock().unwrap() = reply;
        assert!(matches!(
            client
                .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
                .await,
            Err(ReportHttpError::ResponseHeaders)
        ));
    }
    fixture.finish().await;
}

#[tokio::test]
async fn redirect_with_real_location_is_not_followed_or_retried() {
    let fixture = Fixture::new().await;
    {
        let mut reply = fixture.state.reply.lock().unwrap();
        reply.status = StatusCode::TEMPORARY_REDIRECT;
        reply.headers.push(("location", PAGE_PATH.into()));
    }
    assert!(matches!(
        fixture
            .client()
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::RedirectDenied)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn non200_status_has_one_delivery_and_no_implicit_retry() {
    let fixture = Fixture::new().await;
    fixture.state.reply.lock().unwrap().status = StatusCode::SERVICE_UNAVAILABLE;
    assert!(matches!(
        fixture
            .client()
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::ResponseStatus)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn declared_response_length_limit_is_inclusive() {
    let fixture = Fixture::new().await;
    let mut config = fixture.config();
    config.limits.maximum_response_bytes = 32;
    let client = ReportPublicationHttpClient::new(config).unwrap();
    fixture.state.reply.lock().unwrap().bytes = vec![b'x'; 32];
    assert_eq!(
        client
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
            .unwrap()
            .bytes()
            .len(),
        32
    );
    fixture.state.reply.lock().unwrap().bytes.push(b'x');
    assert!(matches!(
        client
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::ResponseTooLarge)
    ));
    fixture.finish().await;
}

#[tokio::test]
async fn chunked_response_cannot_evade_the_same_byte_limit() {
    let fixture = Fixture::new().await;
    let mut config = fixture.config();
    config.limits.maximum_response_bytes = 32;
    let client = ReportPublicationHttpClient::new(config).unwrap();
    {
        let mut reply = fixture.state.reply.lock().unwrap();
        reply.delivery = Delivery::Chunked;
        reply.bytes = vec![b'x'; 32];
    }
    assert_eq!(
        client
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
            .unwrap()
            .bytes()
            .len(),
        32
    );
    fixture.state.reply.lock().unwrap().bytes.push(b'x');
    assert!(matches!(
        client
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::ResponseTooLarge)
    ));
    fixture.finish().await;
}

#[tokio::test]
async fn incomplete_response_remains_failed_with_exactly_one_delivery() {
    let fixture = Fixture::new().await;
    fixture.state.reply.lock().unwrap().delivery = Delivery::Broken;
    assert!(matches!(
        fixture
            .client()
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::RequestFailed)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn request_deadline_covers_body_stream_not_just_headers() {
    let fixture = Fixture::new().await;
    fixture.state.reply.lock().unwrap().delivery = Delivery::Delayed(Duration::from_millis(500));
    let mut config = fixture.config();
    config.limits.connect_timeout = Duration::from_millis(100);
    config.limits.request_timeout = Duration::from_millis(100);
    assert!(matches!(
        ReportPublicationHttpClient::new(config)
            .unwrap()
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::RequestFailed)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn saturated_active_slot_times_out_without_a_second_http_request() {
    let fixture = Fixture::new().await;
    fixture.state.hold.store(true, Ordering::SeqCst);
    let mut config = fixture.config();
    config.limits.max_inflight = 1;
    config.limits.queue_timeout = Duration::from_millis(30);
    let client = Arc::new(ReportPublicationHttpClient::new(config).unwrap());
    let worker = client.clone();
    let first = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    fixture.entered().await;
    assert!(matches!(
        client
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await,
        Err(ReportHttpError::QueueSaturated)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.state.release.add_permits(1);
    tokio::time::timeout(Duration::from_secs(2), first)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    fixture.finish().await;
}

#[tokio::test]
async fn cloned_clients_share_bounded_active_and_waiting_admission() {
    let fixture = Fixture::new().await;
    fixture.state.hold.store(true, Ordering::SeqCst);
    let mut config = fixture.config();
    config.limits.max_inflight = 1;
    config.limits.queue_timeout = Duration::from_secs(1);
    let client = ReportPublicationHttpClient::new(config).unwrap();
    let worker = client.clone();
    let first = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    fixture.entered().await;
    let worker = client.clone();
    let queued = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    tokio::time::timeout(Duration::from_secs(1), async {
        while client.admission.available_permits() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // This is fail-fast admission correctness, not a latency/capacity claim.
    let third = tokio::time::timeout(
        Duration::from_millis(100),
        client.execute(&ReportPublicationWire::snapshot_request(), ASSERTION),
    )
    .await
    .unwrap();
    assert!(matches!(third, Err(ReportHttpError::QueueSaturated)));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    queued.abort();
    assert!(matches!(queued.await, Err(error) if error.is_cancelled()));
    assert_eq!(client.admission.available_permits(), 1);
    fixture.state.release.add_permits(1);
    tokio::time::timeout(Duration::from_secs(2), first)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(client.admission.available_permits(), 2);
    assert_eq!(client.semaphore.available_permits(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn queue_timeout_cannot_extend_the_shorter_whole_request_deadline() {
    let fixture = Fixture::new().await;
    let mut config = fixture.config();
    config.limits.max_inflight = 1;
    config.limits.connect_timeout = Duration::from_millis(100);
    config.limits.request_timeout = Duration::from_millis(200);
    config.limits.queue_timeout = Duration::from_secs(2);
    let client = ReportPublicationHttpClient::new(config).unwrap();
    // Hold only the local active slot: no source request or timing measurement
    // creates the queued condition. Its absolute request deadline must still win.
    let held = client.semaphore.acquire().await.unwrap();
    let result = tokio::time::timeout(
        Duration::from_secs(1),
        client.execute(&ReportPublicationWire::snapshot_request(), ASSERTION),
    )
    .await
    .unwrap();
    assert!(matches!(result, Err(ReportHttpError::QueueSaturated)));
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    assert_eq!(client.admission.available_permits(), 2);
    drop(held);
    assert_eq!(client.semaphore.available_permits(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn whole_response_deadline_also_includes_the_time_spent_queued() {
    let fixture = Fixture::new().await;
    fixture.state.hold.store(true, Ordering::SeqCst);
    let mut config = fixture.config();
    config.limits.max_inflight = 1;
    config.limits.connect_timeout = Duration::from_millis(100);
    config.limits.request_timeout = Duration::from_secs(1);
    config.limits.queue_timeout = Duration::from_secs(1);
    let client = ReportPublicationHttpClient::new(config).unwrap();
    let worker = client.clone();
    let first = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    fixture.entered().await;
    let worker = client.clone();
    let second = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    tokio::time::timeout(Duration::from_secs(1), async {
        while client.admission.available_permits() != 0 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // First request captured its finite reply before admission was held. The
    // next request gets a delayed body, whose duration alone is below the total
    // timeout but whose queue+body duration is above it.
    fixture.state.reply.lock().unwrap().delivery = Delivery::Delayed(Duration::from_millis(600));
    tokio::time::sleep(Duration::from_millis(600)).await;
    fixture.state.hold.store(false, Ordering::SeqCst);
    fixture.state.release.add_permits(1);
    first.await.unwrap().unwrap();
    assert!(matches!(
        second.await.unwrap(),
        Err(ReportHttpError::RequestFailed)
    ));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 2);
    assert_eq!(client.admission.available_permits(), 2);
    assert_eq!(client.semaphore.available_permits(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn cancelled_request_releases_capacity_and_never_retries_or_acknowledges() {
    let fixture = Fixture::new().await;
    fixture.state.hold.store(true, Ordering::SeqCst);
    let mut config = fixture.config();
    config.limits.max_inflight = 1;
    let client = Arc::new(ReportPublicationHttpClient::new(config).unwrap());
    let worker = client.clone();
    let first = tokio::spawn(async move {
        worker
            .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
            .await
    });
    fixture.entered().await;
    first.abort();
    assert!(matches!(first.await, Err(error) if error.is_cancelled()));
    assert_eq!(client.admission.available_permits(), 2);
    assert_eq!(client.semaphore.available_permits(), 1);
    fixture.state.hold.store(false, Ordering::SeqCst);
    fixture.state.release.add_permits(1);
    client
        .execute(&ReportPublicationWire::snapshot_request(), ASSERTION)
        .await
        .unwrap();
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 2);
    fixture.finish().await;
}
