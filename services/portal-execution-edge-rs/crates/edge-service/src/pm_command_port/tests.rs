//! `TEST_ONLY` owning context/financial outcomes; real ephemeral mTLS sockets.
//! These fixtures do not commission PM human authority or prove economic effect.
use super::*;
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};

use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::post,
    Router,
};
use command_relay::{durable::CommandScope, pm_source::OUTCOME_SCHEMA};
use projection_core::canonical_digest;
use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
use serde_json::{json, Value};

const ORIGINAL_DIGEST: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TARGET: &str = "TEST_ONLY-resolved-portfolio";
const REFERENCE: &str = "TEST_ONLY-retained-alias";

#[cfg(feature = "pm-custody-pg-test")]
mod pg_custody;

fn intent() -> CommandIntent {
    let payload = json!({
        "schema_version":"pma.capital-command.v1.1", "operation":"RECALL_PARTIAL",
        "idempotency_key":"TEST_ONLY-key", "recipient_kind":"PORTFOLIO", "currency":"USDT",
        "amount":"10.000", "reason":"TEST_ONLY-no-economic-effect",
        "expected_versions":{"budget":"1", "source":"1", "parent":"1", "book":"1"},
    });
    let digest = canonical_digest(&payload).unwrap();
    let scope = CommandScope::new(
        "TEST_ONLY-workspace",
        "paper",
        "TEST_ONLY-profile",
        "TEST_ONLY-authority",
        "TEST_ONLY-historical-human",
        "TEST_ONLY-workload",
    )
    .unwrap();
    CommandIntent::new(scope, "TEST_ONLY-key", "RECALL_PARTIAL", payload, &digest).unwrap()
}

fn outcome(intent: &CommandIntent) -> Value {
    json!({
        "schema_version":OUTCOME_SCHEMA, "transport_payload_digest":intent.digest(),
        "source_intent_digest":ORIGINAL_DIGEST,
        "source_key":[intent.scope().authority_scope_id(),intent.operation(),intent.key()],
        "target_ref":TARGET,"authority_receipt":"TEST_ONLY-owning-receipt",
        "source_revision":4,"projection_applied_checkpoint":null,
        "presentation":{
            "command_id":"TEST_ONLY-command","state":"PARTIALLY_APPLIED",
            "amounts":{"requested":"10.000","applied":"3.000","pending":"7.000","cancelled":"0","rejected":"0"},
            "currency":"USDT","parent_receipt":"TEST_ONLY-parent","blockers":["TEST_ONLY-position"],
            "before_ref":"TEST_ONLY-before","after_ref":"TEST_ONLY-after","source_ref":"TEST_ONLY-source",
            "policy_ref":"TEST_ONLY-policy","binding_ref":"TEST_ONLY-binding","current_versions":{"budget":2},
            "physical_transfer_performed":false,"cli_exit_code":3,"next_action":"QUERY_SAME_INTENT"
        }
    })
}

#[derive(Default)]
// Deliberate independent TEST_ONLY fault switches, not a production state model.
#[allow(clippy::struct_excessive_bools)]
struct Context {
    refuse_original: bool,
    refuse_assertion: bool,
    refuse_custody: bool,
    wrong_original: bool,
    token_padding: usize,
    delay_assertion: bool,
    assertion_calls: AtomicUsize,
    signed: Mutex<Vec<(PmAction, String)>>,
    retained: Mutex<Vec<Value>>,
}

impl PmCommandContext for Context {
    fn original<'a>(&'a self, intent: &'a CommandIntent) -> ContextFuture<'a, OriginalPmCommand> {
        Box::pin(async move {
            if self.refuse_original {
                return Err(PmUnavailable);
            }
            let mut original = OriginalPmCommand::new(intent, REFERENCE, ORIGINAL_DIGEST, TARGET)?;
            if self.wrong_original {
                original.request_digest = "sha256:other".to_owned();
            }
            Ok(original)
        })
    }

    fn assertion<'a>(
        &'a self,
        _: &'a CommandIntent,
        action: PmAction,
        digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion> {
        Box::pin(async move {
            self.assertion_calls.fetch_add(1, Ordering::SeqCst);
            if self.refuse_assertion {
                return Err(PmUnavailable);
            }
            if self.delay_assertion {
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
            self.signed
                .lock()
                .unwrap()
                .push((action, digest.to_owned()));
            // TEST_ONLY signed shape; real assertion verification belongs to PM.
            HumanAssertion::new(format!(
                "TEST_ONLY.{}.signature",
                "x".repeat(self.token_padding.max(1))
            ))
        })
    }

    fn retain<'a>(
        &'a self,
        intent: &'a CommandIntent,
        outcome: &'a PmOutcome,
    ) -> ContextFuture<'a, ()> {
        Box::pin(async move {
            self.retained.lock().unwrap().push(json!({
                "intent":intent.request_digest(),"authority_receipt":outcome.authority_receipt,
                "source_intent_digest":outcome.source_intent_digest,"target_ref":outcome.target_ref,
                "revision":outcome.receipt.revision(),"presentation":outcome.receipt.payload(),
            }));
            if self.refuse_custody {
                Err(PmUnavailable)
            } else {
                Ok(())
            }
        })
    }
}

struct TlsMaterial {
    ca: Vec<u8>,
    server_cert: Vec<u8>,
    server_key: Vec<u8>,
    client_cert: Vec<u8>,
    client_key: Vec<u8>,
    server_leaf: [u8; 32],
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
        server_cert: server.pem().into_bytes(),
        server_key: server_key.serialize_pem().into_bytes(),
        client_cert: client.pem().into_bytes(),
        client_key: client_key.serialize_pem().into_bytes(),
        server_leaf: Sha256::digest(server.der().as_ref()).into(),
    }
}

struct Observation {
    path: String,
    headers: HeaderMap,
    body: Vec<u8>,
}

struct ServerState {
    observed: Mutex<Vec<Observation>>,
    reply: Mutex<Value>,
    submit_status: StatusCode,
    lose_submit_reply: bool,
    response_padding: usize,
    reply_mode: AtomicUsize,
}

async fn handler(
    State(state): State<Arc<ServerState>>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let submit = uri.path() == SUBMIT;
    state.observed.lock().unwrap().push(Observation {
        path: uri.path().to_owned(),
        headers,
        body: body.to_vec(),
    });
    if submit && state.lose_submit_reply {
        // TEST_ONLY owning effect recorded above, then real incomplete HTTP body.
        let broken = futures_util::stream::once(async {
            Err::<Bytes, _>(std::io::Error::new(
                std::io::ErrorKind::ConnectionReset,
                "TEST_ONLY lost ACK",
            ))
        });
        return Response::builder()
            .status(200)
            .header("content-length", "100")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from_stream(broken))
            .unwrap();
    }
    if submit && state.submit_status != StatusCode::OK {
        if state.submit_status.is_redirection() {
            return (
                state.submit_status,
                [(header::LOCATION, STATUS)],
                "TEST_ONLY redirect refused",
            )
                .into_response();
        }
        return (state.submit_status, "TEST_ONLY unknown").into_response();
    }
    let mut bytes = serde_json::to_vec(&*state.reply.lock().unwrap()).unwrap();
    bytes.extend(std::iter::repeat(b' ').take(state.response_padding));
    match state.reply_mode.load(Ordering::SeqCst) {
        1 => return ([(header::CONTENT_TYPE, "text/plain")], bytes).into_response(),
        2 => {
            return (
                [
                    (header::CONTENT_TYPE, "application/json"),
                    (header::CONTENT_ENCODING, "gzip"),
                ],
                bytes,
            )
                .into_response()
        }
        3 => {
            let stream = futures_util::stream::iter([Ok::<Bytes, std::io::Error>(bytes.into())]);
            return Response::builder()
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from_stream(stream))
                .unwrap();
        }
        _ => {}
    }
    ([(header::CONTENT_TYPE, "application/json")], bytes).into_response()
}

struct Fixture {
    tls: TlsMaterial,
    port: u16,
    state: Arc<ServerState>,
    handle: axum_server::Handle,
    job: Option<tokio::task::JoinHandle<()>>,
}

impl Fixture {
    async fn new(
        submit_status: StatusCode,
        lose_submit_reply: bool,
        response_padding: usize,
    ) -> Self {
        Self::with_protocol(
            submit_status,
            lose_submit_reply,
            response_padding,
            &rustls::version::TLS13,
        )
        .await
    }

    async fn with_protocol(
        submit_status: StatusCode,
        lose_submit_reply: bool,
        response_padding: usize,
        protocol: &'static rustls::SupportedProtocolVersion,
    ) -> Self {
        let tls = material();
        let certs = |raw: &[u8]| {
            rustls_pemfile::certs(&mut Cursor::new(raw))
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
        let mut server = rustls::ServerConfig::builder_with_provider(provider)
            .with_protocol_versions(&[protocol])
            .unwrap()
            .with_client_cert_verifier(verifier)
            .with_single_cert(certs(&tls.server_cert), key)
            .unwrap();
        server.alpn_protocols = vec![b"http/1.1".to_vec()];
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let port = listener.local_addr().unwrap().port();
        let state = Arc::new(ServerState {
            observed: Mutex::new(Vec::new()),
            reply: Mutex::new(outcome(&intent())),
            submit_status,
            lose_submit_reply,
            response_padding,
            reply_mode: AtomicUsize::new(0),
        });
        let app = Router::new()
            .route(SUBMIT, post(handler))
            .route(STATUS, post(handler))
            .with_state(state.clone());
        let handle = axum_server::Handle::new();
        let serving_handle = handle.clone();
        let job = tokio::spawn(async move {
            axum_server::from_tcp_rustls(
                listener,
                axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(server)),
            )
            .handle(serving_handle)
            .serve(app.into_make_service())
            .await
            .unwrap();
        });
        tokio::task::yield_now().await;
        Self {
            tls,
            port,
            state,
            handle,
            job: Some(job),
        }
    }

    fn config(&self) -> PmCommandConfig {
        PmCommandConfig {
            origin: format!("https://localhost:{}/", self.port),
            server_ca_pem: self.tls.ca.clone(),
            client_certificate_pem: self.tls.client_cert.clone(),
            client_key_pem: self.tls.client_key.clone(),
            server_leaf_sha256: self.tls.server_leaf,
            request_limit: MAX_BODY,
            response_limit: MAX_BODY,
            deadline: Duration::from_secs(2),
            max_inflight: 1,
        }
    }

    async fn finish(mut self) {
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

#[tokio::test]
async fn real_mtls_exact_wrapper_headers_digest_and_full_custody_before_receipt() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let context = Arc::new(Context::default());
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    let intent = intent();
    let SourceReply::Receipt(receipt) = port.send(&intent).await else {
        panic!("TEST_ONLY receipt missing");
    };
    assert_eq!(receipt.payload(), &outcome(&intent)["presentation"]);
    {
        let retained = context.retained.lock().unwrap();
        assert_eq!(retained.len(), 1);
        assert_eq!(retained[0]["authority_receipt"], "TEST_ONLY-owning-receipt");
        assert_eq!(retained[0]["source_intent_digest"], ORIGINAL_DIGEST);
        assert_eq!(retained[0]["target_ref"], TARGET);
        assert_eq!(retained[0]["presentation"]["current_versions"]["budget"], 2);
    }
    {
        let observed = fixture.state.observed.lock().unwrap();
        assert_eq!(observed.len(), 1);
        let delivered = &observed[0];
        assert_eq!(delivered.path, SUBMIT);
        let names: BTreeSet<_> = delivered
            .headers
            .keys()
            .map(header::HeaderName::as_str)
            .collect();
        assert_eq!(
            names,
            BTreeSet::from([
                "host",
                "authorization",
                "content-type",
                "content-length",
                "connection",
                "accept"
            ])
        );
        assert_eq!(delivered.headers[header::CONNECTION], "close");
        assert_eq!(
            delivered.headers[header::CONTENT_LENGTH]
                .to_str()
                .unwrap()
                .parse::<usize>()
                .unwrap(),
            delivered.body.len()
        );
        let body: Value = serde_json::from_slice(&delivered.body).unwrap();
        assert_eq!(body.as_object().unwrap().len(), 4);
        assert_eq!(body["reference"], REFERENCE);
        assert_eq!(body["payload"], *intent.payload());
        assert_eq!(body["transport_payload_digest"], intent.digest());
        let digest =
            http_request_digest("POST", SUBMIT.as_bytes(), b"", &delivered.body, MAX_BODY).unwrap();
        assert_eq!(
            context.signed.lock().unwrap().as_slice(),
            &[(PmAction::Submit, digest)]
        );
    }
    fixture.finish().await;
}

#[tokio::test]
async fn lost_ack_is_unknown_then_status_only_same_original_intent_and_fresh_assertion() {
    let fixture = Fixture::new(StatusCode::OK, true, 0).await;
    let context = Arc::new(Context::default());
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    let intent = intent();
    assert!(matches!(port.send(&intent).await, SourceReply::Unknown));
    assert!(context.retained.lock().unwrap().is_empty());
    assert!(matches!(
        port.lookup(&intent).await,
        SourceReply::Receipt(_)
    ));
    {
        let observed = fixture.state.observed.lock().unwrap();
        assert_eq!(
            observed
                .iter()
                .map(|row| row.path.as_str())
                .collect::<Vec<_>>(),
            [SUBMIT, STATUS]
        );
        assert_eq!(observed[0].body, observed[1].body);
        let signed = context.signed.lock().unwrap();
        assert_eq!(signed.len(), 2);
        assert_ne!(signed[0].1, signed[1].1);
        assert_eq!(signed[1].0, PmAction::Status);
    }
    fixture.finish().await;
}

#[tokio::test]
async fn http503_never_retries_or_claims_not_applied() {
    let fixture = Fixture::new(StatusCode::SERVICE_UNAVAILABLE, false, 0).await;
    let context = Arc::new(Context::default());
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    assert!(context.retained.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn redirect_never_delivers_a_second_request() {
    let fixture = Fixture::new(StatusCode::TEMPORARY_REDIRECT, false, 0).await;
    let port = PmHttpCommandPort::new(&fixture.config(), Arc::new(Context::default())).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn authority_refusal_and_wrong_original_mean_zero_http() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    for context in [
        Context {
            refuse_original: true,
            ..Context::default()
        },
        Context {
            refuse_assertion: true,
            ..Context::default()
        },
        Context {
            wrong_original: true,
            ..Context::default()
        },
    ] {
        let port = PmHttpCommandPort::new(&fixture.config(), Arc::new(context)).unwrap();
        assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn custody_ack_loss_preserves_unknown_and_never_returns_reduced_receipt() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let context = Arc::new(Context {
        refuse_custody: true,
        ..Context::default()
    });
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
    assert_eq!(context.retained.lock().unwrap().len(), 1);
    fixture.finish().await;
}

#[tokio::test]
async fn mismatched_source_correlation_never_reaches_custody() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    fixture.state.reply.lock().unwrap()["target_ref"] = json!("TEST_ONLY-wrong-target");
    let context = Arc::new(Context::default());
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert!(context.retained.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn leaf_ca_hostname_and_client_identity_fail_before_any_http_credentials() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let foreign = material();
    for kind in 0..4 {
        let mut config = fixture.config();
        match kind {
            0 => config.server_leaf_sha256 = [0; 32],
            1 => config.server_ca_pem = foreign.ca.clone(),
            2 => config.origin = format!("https://127.0.0.1:{}/", fixture.port),
            _ => {
                config.client_certificate_pem = foreign.client_cert.clone();
                config.client_key_pem = foreign.client_key.clone();
            }
        }
        let port = PmHttpCommandPort::new(&config, Arc::new(Context::default())).unwrap();
        assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn tls12_only_source_cannot_receive_any_http_credentials() {
    let fixture = Fixture::with_protocol(StatusCode::OK, false, 0, &rustls::version::TLS12).await;
    let port = PmHttpCommandPort::new(&fixture.config(), Arc::new(Context::default())).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn whole_wrapper_limit_includes_reference_and_envelope_before_signing() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let context = Arc::new(Context::default());
    let mut config = fixture.config();
    config.request_limit = serde_json::to_vec(intent().payload()).unwrap().len();
    let port = PmHttpCommandPort::new(&config, context.clone()).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert_eq!(context.assertion_calls.load(Ordering::SeqCst), 0);
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn oversized_authorization_header_fails_without_http_delivery() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let context = Arc::new(Context {
        token_padding: 8_000,
        ..Context::default()
    });
    let port = PmHttpCommandPort::new(&fixture.config(), context).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn oversized_response_is_unknown_without_custody() {
    let fixture = Fixture::new(StatusCode::OK, false, MAX_BODY).await;
    let context = Arc::new(Context::default());
    let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
    assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
    assert!(context.retained.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn chunked_oversize_wrong_mime_and_encoding_are_unknown_without_custody() {
    for mode in 1..=3 {
        let padding = if mode == 3 { MAX_BODY } else { 0 };
        let fixture = Fixture::new(StatusCode::OK, false, padding).await;
        fixture.state.reply_mode.store(mode, Ordering::SeqCst);
        let context = Arc::new(Context::default());
        let port = PmHttpCommandPort::new(&fixture.config(), context.clone()).unwrap();
        assert!(matches!(port.send(&intent()).await, SourceReply::Unknown));
        assert!(context.retained.lock().unwrap().is_empty());
        assert_eq!(fixture.state.observed.lock().unwrap().len(), 1);
        fixture.finish().await;
    }
}

#[tokio::test]
async fn explicit_wrapper_and_response_byte_limits_are_inclusive() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let original = intent();
    let body = serde_json::to_vec(&json!({"schema_version":"pma.edge-command-transport.v1",
        "reference":REFERENCE,"payload":original.payload(),"transport_payload_digest":original.digest()})).unwrap();
    let mut config = fixture.config();
    config.request_limit = body.len();
    config.response_limit = serde_json::to_vec(&outcome(&original)).unwrap().len();
    let port = PmHttpCommandPort::new(&config, Arc::new(Context::default())).unwrap();
    assert!(matches!(
        port.send(&original).await,
        SourceReply::Receipt(_)
    ));
    fixture.finish().await;
}

#[tokio::test]
async fn request_header_8192_is_inclusive_and_8193_is_refused_locally() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let port = PmHttpCommandPort::new(&fixture.config(), Arc::new(Context::default())).unwrap();
    let smallest = HumanAssertion::new("a.b.c".to_owned()).unwrap();
    let headers = port.headers(PmAction::Submit, &smallest, 500).unwrap();
    let base = format!("POST {SUBMIT} HTTP/1.1\r\n").len()
        + headers
            .iter()
            .map(|(name, value)| name.as_str().len() + value.as_bytes().len() + 4)
            .sum::<usize>()
        + 2;
    let exact = format!("a.{}.c", "x".repeat(MAX_HEADER - base + 1));
    assert!(port
        .headers(
            PmAction::Submit,
            &HumanAssertion::new(exact.clone()).unwrap(),
            500
        )
        .is_ok());
    assert!(port
        .headers(
            PmAction::Submit,
            &HumanAssertion::new(format!("{exact}x")).unwrap(),
            500
        )
        .is_err());
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn whole_call_deadline_and_fail_fast_concurrency_cover_authority_provider() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    let context = Arc::new(Context {
        delay_assertion: true,
        ..Context::default()
    });
    let mut config = fixture.config();
    config.deadline = Duration::from_millis(25);
    let port = PmHttpCommandPort::new(&config, context.clone()).unwrap();
    let original = intent();
    let first = port.send(&original);
    let second = async {
        tokio::task::yield_now().await;
        port.lookup(&original).await
    };
    let (first, second) = tokio::join!(first, second);
    assert!(matches!(first, SourceReply::Unknown));
    assert!(matches!(second, SourceReply::Unknown));
    assert_eq!(context.assertion_calls.load(Ordering::SeqCst), 1);
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[tokio::test]
async fn invalid_commissioning_bounds_urls_and_material_fail_closed() {
    let fixture = Fixture::new(StatusCode::OK, false, 0).await;
    for kind in 0..12 {
        let mut config = fixture.config();
        match kind {
            0 => config.request_limit = 0,
            1 => config.request_limit = MAX_BODY + 1,
            2 => config.response_limit = 0,
            3 => config.response_limit = MAX_BODY + 1,
            4 => config.deadline = Duration::ZERO,
            5 => config.deadline = Duration::from_secs(11),
            6 => config.max_inflight = 0,
            7 => config.max_inflight = 17,
            8 => config.origin = "http://localhost/".to_owned(),
            9 => config.origin = "https://localhost/?x=1".to_owned(),
            10 => config.origin = "https://user:password@localhost/".to_owned(),
            _ => config.client_key_pem.clear(),
        }
        assert!(PmHttpCommandPort::new(&config, Arc::new(Context::default())).is_err());
    }
    assert!(fixture.state.observed.lock().unwrap().is_empty());
    fixture.finish().await;
}

#[test]
fn malformed_reference_and_assertion_have_no_permissive_fallback() {
    for reference in ["", " x", "x\r\n", &"x".repeat(513)] {
        assert!(OriginalPmCommand::new(&intent(), reference, ORIGINAL_DIGEST, TARGET).is_err());
    }
    for token in [
        "",
        "one.two",
        "one.two.three.four",
        "one.two.three\r\n",
        "a..c",
        "a.b.c=",
    ] {
        assert!(HumanAssertion::new(token.to_owned()).is_err());
    }
    assert!(HumanAssertion::new("TEST_ONLY.shape.signature".to_owned()).is_ok());
    assert!(HumanAssertion::new(".".repeat(MAX_HEADER + 1)).is_err());
}
