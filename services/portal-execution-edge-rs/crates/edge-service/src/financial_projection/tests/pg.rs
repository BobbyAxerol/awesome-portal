//! `TEST_ONLY` loopback mTLS + disposable real PG, never current PM authority.
use super::*;
use authoritative_event_core::bootstrap::SourceProofVerifier;
use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, Uri},
    response::IntoResponse,
    routing::post,
    Router,
};
use projection_core::{
    canonical_digest,
    resources::{EnvelopeLimits, ResourceEnvelope, StorageLimits, StorageObservation},
};
use projection_store_pg::scoped_read::ReadLimits;
use query_api::CursorCodec;
use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicBool, AtomicI64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use ts_transport::{
    report_publication_http::{ReportHttpConfig, ReportHttpLimits},
    report_publication_wire::{DELTA_PATH, PAGE_PATH, SNAPSHOT_PATH},
};

struct Clock(AtomicI64);
impl ReadClock for Clock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// Exact expected fixture tuple, not an accepting runtime proof verifier.
struct Proof {
    binding: String,
    kind: String,
    digest: String,
}
impl SourceProofVerifier for Proof {
    fn verify(&self, binding: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        binding.digest().as_ref().ok() == Some(&self.binding)
            && kind == self.kind
            && input == self.digest
            && proof == "TEST_ONLY-independent-proof"
            && now == NOW
    }
}

fn seal<T: Serialize + Clone>(value: &T, binding: &Binding, kind: &str) -> Verified<T> {
    let proof = Proof {
        binding: binding.digest().unwrap(),
        kind: kind.into(),
        digest: canonical_digest(value).unwrap(),
    };
    Verified::authenticate(
        value.clone(),
        binding,
        kind,
        "TEST_ONLY-independent-proof",
        &proof,
        NOW,
    )
    .unwrap()
}

async fn test_store() -> PgProjectionStore {
    test_store_and_resources().await.0
}

async fn test_store_and_resources() -> (PgProjectionStore, Arc<ResourceEnvelope>) {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let url =
        std::env::var("TEST_PROJECTION_DATABASE_URL").expect("disposable PG required; no skip");
    assert!(
        url.starts_with("postgres://")
            && url.contains("@127.0.0.1:")
            && url.ends_with("/portal_projection_test_epg10_04")
    );
    let resources = Arc::new(
        ResourceEnvelope::new(EnvelopeLimits {
            max_active: 8,
            foreground_reserved: 1,
            max_entries: 8192,
            foreground_reserved_entries: 1024,
            max_bytes: 128 * 1024 * 1024,
            foreground_reserved_bytes: 16 * 1024 * 1024,
            storage_max_age: Duration::from_secs(600),
        })
        .unwrap(),
    );
    resources
        .observe_storage(
            StorageObservation {
                observed_at: chrono::Utc::now(),
                used_bytes: 0,
                free_bytes: 1_000_000,
                backlog_bytes: 0,
            },
            StorageLimits {
                soft_used_bytes: 100,
                high_used_bytes: 200,
                hard_used_bytes: 300,
                min_free_bytes: 100,
                max_backlog_bytes: 1000,
            },
        )
        .unwrap();
    let store = PgProjectionStore::connect_with_resources(&url, resources.clone(), 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    (store, resources)
}

struct SourceState {
    snapshot: Value,
    delta: Value,
    requests: Mutex<Vec<(String, Vec<u8>)>>,
}

async fn handler(
    State(state): State<Arc<SourceState>>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> impl IntoResponse {
    assert_eq!(
        headers["authorization"],
        "Bearer TEST_ONLY-original-assertion"
    );
    state
        .requests
        .lock()
        .unwrap()
        .push((uri.path().into(), body.to_vec()));
    let value = if uri.path() == SNAPSHOT_PATH {
        state.snapshot.clone()
    } else if uri.path() == PAGE_PATH {
        let request: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(request["manifest"], state.snapshot["manifest"]);
        let index = usize::try_from(request["index"].as_u64().unwrap()).unwrap();
        state.snapshot["pages"][index].clone()
    } else {
        state.delta.clone()
    };
    (
        [
            ("content-type", "application/json"),
            ("x-pma-publication-wire", "scoped-bootstrap.v1"),
            ("cache-control", "no-store"),
            ("vary", "authorization"),
        ],
        bytes(&value),
    )
}

struct Source {
    client: ReportPublicationHttpClient,
    state: Arc<SourceState>,
    handle: axum_server::Handle,
    job: Option<tokio::task::JoinHandle<()>>,
}

fn tls() -> (Vec<u8>, Vec<u8>, Vec<u8>, Vec<u8>) {
    let mut params = CertificateParams::new(vec![]).unwrap();
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let ca_key = KeyPair::generate().unwrap();
    let ca = params.self_signed(&ca_key).unwrap();
    let mut params = CertificateParams::new(vec!["localhost".into()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let key = KeyPair::generate().unwrap();
    let server = params.signed_by(&key, &ca, &ca_key).unwrap();
    let mut params = CertificateParams::new(vec!["TEST_ONLY-client".into()]).unwrap();
    params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];
    let client_key = KeyPair::generate().unwrap();
    let client = params.signed_by(&client_key, &ca, &ca_key).unwrap();
    (
        ca.pem().into_bytes(),
        server.pem().into_bytes(),
        key.serialize_pem().into_bytes(),
        format!("{}{}", client.pem(), client_key.serialize_pem()).into_bytes(),
    )
}

impl Source {
    fn start(snapshot: Value, delta: Value) -> Self {
        let (ca, certificate, key, identity) = tls();
        let config = test_server_tls(&ca, &certificate, &key);
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let origin = format!(
            "https://localhost:{}/",
            listener.local_addr().unwrap().port()
        );
        let client = ReportPublicationHttpClient::new(ReportHttpConfig {
            origin: &origin,
            root_ca_pem: &ca,
            client_identity_pem: &identity,
            limits: ReportHttpLimits::default(),
        })
        .unwrap();
        let state = Arc::new(SourceState {
            snapshot,
            delta,
            requests: Mutex::new(vec![]),
        });
        let app = Router::new()
            .route(SNAPSHOT_PATH, post(handler))
            .route(PAGE_PATH, post(handler))
            .route(DELTA_PATH, post(handler))
            .with_state(state.clone());
        let handle = axum_server::Handle::new();
        let serving = handle.clone();
        let job = tokio::spawn(async move {
            axum_server::from_tcp_rustls(listener, config)
                .handle(serving)
                .serve(app.into_make_service())
                .await
                .unwrap();
        });
        Self {
            client,
            state,
            handle,
            job: Some(job),
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

fn test_server_tls(
    ca: &[u8],
    certificate: &[u8],
    key: &[u8],
) -> axum_server::tls_rustls::RustlsConfig {
    let certificates = |raw: &[u8]| {
        rustls_pemfile::certs(&mut Cursor::new(raw))
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
    };
    let mut roots = rustls::RootCertStore::empty();
    for certificate in certificates(ca) {
        roots.add(certificate).unwrap();
    }
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let verifier = rustls::server::WebPkiClientVerifier::builder_with_provider(
        Arc::new(roots),
        provider.clone(),
    )
    .build()
    .unwrap();
    let key = rustls_pemfile::private_key(&mut Cursor::new(key))
        .unwrap()
        .unwrap();
    let mut config = rustls::ServerConfig::builder_with_provider(provider)
        .with_protocol_versions(&[&rustls::version::TLS13])
        .unwrap()
        .with_client_cert_verifier(verifier)
        .with_single_cert(certificates(certificate), key)
        .unwrap();
    config.alpn_protocols = vec![b"http/1.1".to_vec()];
    axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(config))
}

impl Drop for Source {
    fn drop(&mut self) {
        self.handle.shutdown();
        if let Some(job) = self.job.take() {
            job.abort();
        }
    }
}

struct RevocablePolicy(AtomicBool);
impl ReadAuthorizer for RevocablePolicy {
    fn current(&self, _: &ReadScope, op: Operation, _: i64) -> bool {
        !self.0.load(Ordering::SeqCst) && op == Operation::Current
    }
}

/// `TEST_ONLY` exact fixture proof source, not an issuer or production grant.
struct WorkerAuthority {
    denied: AtomicBool,
    lose_ack_once: AtomicBool,
    acks: Mutex<Vec<String>>,
}

impl WorkerAuthority {
    fn new(lose_ack_once: bool) -> Self {
        Self {
            denied: AtomicBool::new(false),
            lose_ack_once: AtomicBool::new(lose_ack_once),
            acks: Mutex::new(vec![]),
        }
    }

    fn current(&self) -> Result<(), crate::scoped_worker::SourceAuthorityError> {
        if self.denied.load(Ordering::SeqCst) {
            Err(crate::scoped_worker::SourceAuthorityError::Denied)
        } else {
            Ok(())
        }
    }

    fn proof<'a, T: Serialize + Clone + Send + Sync + 'a>(
        &'a self,
        value: &'a T,
        binding: &'a Binding,
        kind: &'a str,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<T>> {
        Box::pin(async move {
            self.current()?;
            Ok(seal(value, binding, kind))
        })
    }
}

impl crate::scoped_worker::FinancialSourceAuthority for WorkerAuthority {
    fn assertion<'a>(
        &'a self,
        request: &'a PreparedRequest,
    ) -> crate::scoped_worker::AuthorityFuture<'a, String> {
        Box::pin(async move {
            self.current()?;
            assert!(matches!(
                request.path(),
                SNAPSHOT_PATH | PAGE_PATH | DELTA_PATH
            ));
            assert!(request.body().len() <= 1024 * 1024);
            Ok("TEST_ONLY-original-assertion".into())
        })
    }

    fn manifest<'a>(
        &'a self,
        value: &'a Manifest,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<Manifest>> {
        self.proof(value, &value.binding, "MANIFEST")
    }

    fn page<'a>(
        &'a self,
        manifest: &'a Manifest,
        value: &'a SnapshotPage,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<SnapshotPage>> {
        self.proof(value, &manifest.binding, "PAGE")
    }

    fn chunk<'a>(
        &'a self,
        manifest: &'a Manifest,
        value: &'a DeltaChunk,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<DeltaChunk>> {
        self.proof(value, &manifest.binding, "CHUNK")
    }

    fn group<'a>(
        &'a self,
        manifest: &'a Manifest,
        value: &'a DeltaGroup,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<DeltaGroup>> {
        self.proof(value, &manifest.binding, "GROUP")
    }

    fn control<'a>(
        &'a self,
        value: &'a Binding,
    ) -> crate::scoped_worker::AuthorityFuture<'a, Verified<Binding>> {
        self.proof(value, value, "CONTROL")
    }

    fn acknowledge<'a>(
        &'a self,
        _: &'a Manifest,
        receipt: &'a BootstrapReceipt,
    ) -> crate::scoped_worker::AuthorityFuture<'a, ()> {
        Box::pin(async move {
            self.current()?;
            self.acks.lock().unwrap().push(receipt.cursor().to_owned());
            if self.lose_ack_once.swap(false, Ordering::SeqCst) {
                Err(crate::scoped_worker::SourceAuthorityError::Transient)
            } else {
                Ok(())
            }
        })
    }
}

fn worker_limits() -> crate::scoped_worker::WorkerLimits {
    crate::scoped_worker::WorkerLimits {
        poll_interval: Duration::from_millis(10),
        authority_timeout: Duration::from_secs(1),
        retry_base: Duration::from_millis(1),
        retry_max: Duration::from_millis(10),
        max_consecutive_failures: 3,
        jitter_seed: 7,
    }
}

fn worker_projection<'a>(
    source: &'a Source,
    store: &'a PgProjectionStore,
    manifest: &Manifest,
    bindings: &'a BTreeMap<String, FinancialBinding>,
    clock: &'a Clock,
) -> FinancialProjection<'a> {
    FinancialProjection::new(
        &source.client,
        store,
        manifest.binding.clone(),
        limits(),
        bindings,
        clock,
    )
    .unwrap()
}

#[tokio::test]
async fn source_worker_lost_ack_restart_reuses_actual_checkpoint_without_new_source_request() {
    use crate::scoped_worker::{FinancialSourceWorker, WorkerPlacement, WorkerStart, WorkerStep};
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let bindings = bindings();
    let clock = Clock(AtomicI64::new(NOW));
    let authority = WorkerAuthority::new(true);
    let mut worker = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Bootstrap {
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    for _ in 0..3 {
        assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    }
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Committed);
    assert!(authority.acks.lock().unwrap().is_empty());
    assert!(worker.step().await.unwrap_err().retryable());
    drop(worker);
    let mut resumed = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Resume {
            manifest: manifest.clone(),
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Progress);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Committed);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Acknowledged);
    assert_eq!(*authority.acks.lock().unwrap(), vec![mark('A'), mark('A')]);
    assert_eq!(source.state.requests.lock().unwrap().len(), 1);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Idle);
    assert_eq!(authority.acks.lock().unwrap().len(), 2);
    assert_eq!(
        source.state.requests.lock().unwrap().last().unwrap().0,
        DELTA_PATH
    );
    source.finish().await;
}

#[tokio::test]
async fn source_worker_interrupted_staging_resumes_original_pages_idempotently() {
    use crate::scoped_worker::{FinancialSourceWorker, WorkerPlacement, WorkerStart, WorkerStep};
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let bindings = bindings();
    let clock = Clock(AtomicI64::new(NOW));
    let authority = WorkerAuthority::new(false);
    let mut worker = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Bootstrap {
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    // Crash after the PAGE transaction committed but before finishing snapshot.
    for _ in 0..3 {
        assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    }
    drop(worker);
    let mut resumed = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Resume {
            manifest: manifest.clone(),
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    for _ in 0..3 {
        assert_eq!(resumed.step().await.unwrap(), WorkerStep::Progress);
    }
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Committed);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Acknowledged);
    {
        let requests = source.state.requests.lock().unwrap();
        assert_eq!(
            requests
                .iter()
                .map(|request| request.0.as_str())
                .collect::<Vec<_>>(),
            vec![SNAPSHOT_PATH, PAGE_PATH]
        );
    }
    assert_eq!(*authority.acks.lock().unwrap(), vec![mark('A')]);
    source.finish().await;
}

#[tokio::test]
async fn source_worker_current_denial_prevents_fetch_and_source_ack() {
    use crate::scoped_worker::{FinancialSourceWorker, WorkerPlacement, WorkerStart, WorkerStep};
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let bindings = bindings();
    let clock = Clock(AtomicI64::new(NOW));
    let authority = WorkerAuthority::new(false);
    let mut worker = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Bootstrap {
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    authority.denied.store(true, Ordering::SeqCst);
    assert!(!worker.step().await.unwrap_err().retryable());
    assert!(source.state.requests.lock().unwrap().is_empty());
    authority.denied.store(false, Ordering::SeqCst);
    for _ in 0..3 {
        assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    }
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Committed);
    authority.denied.store(true, Ordering::SeqCst);
    assert!(!worker.step().await.unwrap_err().retryable());
    assert!(authority.acks.lock().unwrap().is_empty());
    assert_eq!(source.state.requests.lock().unwrap().len(), 1);
    source.finish().await;
}

#[tokio::test]
async fn source_worker_hidden_scan_commit_then_lost_ack_recovers_same_durable_cursor() {
    use crate::scoped_worker::{FinancialSourceWorker, WorkerPlacement, WorkerStart, WorkerStep};
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: "TEST_ONLY-worker-hidden".into(),
        from_cursor: mark('A'),
        to_cursor: mark('B'),
        chunk_digests: vec![],
        events_digest: events_digest(&[]).unwrap(),
        reached_catchup: false,
    };
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":group,"chunks":[]}),
    );
    let bindings = bindings();
    let clock = Clock(AtomicI64::new(NOW));
    let authority = WorkerAuthority::new(false);
    let mut worker = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Bootstrap {
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    for _ in 0..3 {
        assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    }
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Committed);
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Acknowledged);
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    assert_eq!(worker.step().await.unwrap(), WorkerStep::Committed);
    authority.lose_ack_once.store(true, Ordering::SeqCst);
    assert!(worker.step().await.unwrap_err().retryable());
    drop(worker);
    let mut resumed = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Resume {
            manifest: manifest.clone(),
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Progress);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Committed);
    assert_eq!(resumed.step().await.unwrap(), WorkerStep::Acknowledged);
    assert_eq!(
        *authority.acks.lock().unwrap(),
        vec![mark('A'), mark('B'), mark('B')]
    );
    assert_eq!(
        source
            .state
            .requests
            .lock()
            .unwrap()
            .iter()
            .map(|request| request.0.clone())
            .collect::<Vec<_>>(),
        vec![SNAPSHOT_PATH, DELTA_PATH]
    );
    source.finish().await;
}

#[tokio::test]
async fn source_worker_expired_incomplete_snapshot_never_mints_replacement_generation() {
    use crate::scoped_worker::{FinancialSourceWorker, WorkerPlacement, WorkerStart, WorkerStep};
    let store = test_store().await;
    let (mut manifest, pages) = snapshot(payload());
    manifest.expires_at_ms = NOW + 1;
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let bindings = bindings();
    let clock = Clock(AtomicI64::new(NOW));
    let authority = WorkerAuthority::new(false);
    let mut worker = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Bootstrap {
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    for _ in 0..2 {
        assert_eq!(worker.step().await.unwrap(), WorkerStep::Progress);
    }
    drop(worker);
    clock.0.store(NOW + 2, Ordering::SeqCst);
    let mut resumed = FinancialSourceWorker::new(
        worker_projection(&source, &store, &manifest, &bindings, &clock),
        &authority,
        WorkerStart::Resume {
            manifest: manifest.clone(),
            placement: WorkerPlacement::Auto,
        },
        worker_limits(),
    )
    .unwrap();
    assert!(!resumed.step().await.unwrap_err().retryable());
    assert!(authority.acks.lock().unwrap().is_empty());
    assert_eq!(source.state.requests.lock().unwrap().len(), 1);
    source.finish().await;
}

const MANAGER_SESSION: &str = "TEST_ONLY-original-manager-session";

struct EntrypointPolicy(ReadScope);

impl crate::scoped_policy::CurrentPolicy for EntrypointPolicy {
    fn resolve<'a>(
        &'a self,
        credential: &'a str,
        resource: &'a str,
        operation: Operation,
        _: i64,
    ) -> crate::scoped_policy::PolicyFuture<'a, crate::scoped_policy::ResolvedPolicy> {
        Box::pin(async move {
            if credential != MANAGER_SESSION
                || resource != "reports"
                || operation != Operation::Current
            {
                return Err(ScopedError::AccessDenied);
            }
            crate::scoped_policy::ResolvedPolicy::from_current_authority(
                self.0.clone(),
                operation,
                Arc::new(credential.to_owned()),
            )
        })
    }

    fn recheck<'a>(
        &'a self,
        resolved: &'a crate::scoped_policy::ResolvedPolicy,
        _: i64,
    ) -> crate::scoped_policy::PolicyFuture<'a, ()> {
        Box::pin(async move {
            if resolved.scope() == &self.0
                && resolved.operation() == Operation::Current
                && resolved
                    .custody::<String>()
                    .is_some_and(|value| value == MANAGER_SESSION)
            {
                Ok(())
            } else {
                Err(ScopedError::AccessDenied)
            }
        })
    }
}

fn entrypoint_limits() -> crate::scoped_backend::BackendLimits {
    crate::scoped_backend::BackendLimits {
        read: ReadLimits {
            cursor_ttl_ms: 60_000,
            max_scope_cursors: 32,
            max_total_cursors: 128,
        },
        cache: query_api::scoped::CacheLimits {
            max_entries: 8,
            max_bytes: 1024 * 1024,
            max_flights: 2,
            ttl_ms: 30_000,
            load_timeout_ms: 5_000,
        },
        realtime: realtime_sse::scoped::ScopedRealtimeConfig {
            maximum_clients: 4,
            client_queue_entries: 4,
            client_queue_bytes: 65_536,
            total_queue_bytes: 262_144,
            notices_per_poll: 8,
            maximum_notice_bytes: 16_384,
            poll_interval_ms: 20,
            poll_timeout_ms: 1000,
        },
        maximum_requests: 8,
        maximum_streams: 3,
        maximum_cohorts: 4,
        policy_timeout: Duration::from_secs(1),
        stream_check_interval: Duration::from_millis(10),
        maximum_stream_lifetime: Duration::from_secs(5),
        storage_refresh_interval: Duration::from_secs(1),
    }
}

fn entrypoint_backend(
    store: Arc<PgProjectionStore>,
    resources: Arc<ResourceEnvelope>,
    policy: Arc<dyn crate::scoped_policy::CurrentPolicy>,
) -> crate::scoped_backend::ScopedBackend {
    crate::scoped_backend::ScopedBackend::assemble(
        store,
        resources,
        policy,
        CursorCodec::new(
            "TEST_ONLY",
            [("TEST_ONLY".into(), vec![7; 32])].into(),
            Duration::from_secs(60),
        )
        .unwrap(),
        entrypoint_limits(),
        Arc::new(Clock(AtomicI64::new(NOW))),
    )
    .unwrap()
}

fn entrypoint_source(
    source: &Source,
    manifest: &Manifest,
    authority: Arc<WorkerAuthority>,
) -> crate::scoped_backend::FinancialSource {
    crate::scoped_backend::FinancialSource {
        http: source.client.clone(),
        binding: manifest.binding.clone(),
        limits: limits(),
        bindings: bindings(),
        authority,
        start: crate::scoped_worker::WorkerStart::Bootstrap {
            placement: crate::scoped_worker::WorkerPlacement::Auto,
        },
        worker_limits: worker_limits(),
    }
}

struct EntrypointServer {
    address: std::net::SocketAddr,
    client: reqwest::Client,
    client_without_identity: reqwest::Client,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    job: Option<tokio::task::JoinHandle<std::io::Result<()>>>,
}

impl EntrypointServer {
    fn start(
        backend: crate::scoped_backend::ScopedBackend,
        source: crate::scoped_backend::FinancialSource,
    ) -> Self {
        let (ca, certificate, key, identity) = tls();
        let config = test_server_tls(&ca, &certificate, &key);
        let client = |identity: Option<&[u8]>| {
            let mut builder = reqwest::Client::builder()
                .https_only(true)
                .no_proxy()
                .tls_built_in_root_certs(false)
                .add_root_certificate(reqwest::Certificate::from_pem(&ca).unwrap())
                .min_tls_version(reqwest::tls::Version::TLS_1_3)
                .max_tls_version(reqwest::tls::Version::TLS_1_3)
                .http1_only()
                .pool_max_idle_per_host(0)
                .timeout(Duration::from_secs(2));
            if let Some(identity) = identity {
                builder = builder.identity(reqwest::Identity::from_pem(identity).unwrap());
            }
            builder.build().unwrap()
        };
        // Select an ephemeral loopback test port, never an operational listener.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        drop(listener);
        let (shutdown, signal) = tokio::sync::oneshot::channel();
        let job = tokio::spawn(crate::scoped_backend::serve_with_financial_source(
            backend,
            source,
            address,
            config,
            async move {
                let _ = signal.await;
            },
        ));
        Self {
            address,
            client: client(Some(&identity)),
            client_without_identity: client(None),
            shutdown: Some(shutdown),
            job: Some(job),
        }
    }

    fn url(&self) -> String {
        format!(
            "https://localhost:{}/internal/v2/scoped/reports/query?limit=2&max_bytes=1048576",
            self.address.port()
        )
    }

    async fn finish(mut self) -> std::io::Result<()> {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        tokio::time::timeout(Duration::from_secs(10), self.job.take().unwrap())
            .await
            .unwrap()
            .unwrap()
    }

    async fn await_stopped(mut self) -> std::io::Result<()> {
        tokio::time::timeout(Duration::from_secs(10), self.job.take().unwrap())
            .await
            .unwrap()
            .unwrap()
    }
}

impl Drop for EntrypointServer {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        // Failed assertions also release ONLY this disposable listener/task.
        if let Some(job) = self.job.take() {
            job.abort();
        }
    }
}

async fn await_entrypoint_ack(authority: &WorkerAuthority) {
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if !authority.acks.lock().unwrap().is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
    })
    .await
    .expect("bounded TEST_ONLY source did not ACK");
}

#[tokio::test]
async fn complete_mtls_entrypoint_commits_queries_and_gracefully_releases_worker_listener() {
    let (store, resources) = test_store_and_resources().await;
    let store = Arc::new(store);
    let (manifest, pages) = snapshot(payload());
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let authority = Arc::new(WorkerAuthority::new(false));
    let backend = entrypoint_backend(
        store.clone(),
        resources.clone(),
        Arc::new(EntrypointPolicy(read_scope(&manifest))),
    );
    let server = EntrypointServer::start(
        backend,
        entrypoint_source(&source, &manifest, authority.clone()),
    );
    await_entrypoint_ack(&authority).await;
    let response = server
        .client
        .get(server.url())
        .bearer_auth(MANAGER_SESSION)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), reqwest::StatusCode::OK);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let body: Value = response.json().await.unwrap();
    assert_eq!(
        body["rows"][0]["payload"]["rows"][0]["economics"]["nav"],
        "900"
    );
    assert_eq!(
        body["projection_generation"],
        manifest.generation.to_string()
    );
    assert!(server
        .client_without_identity
        .get(server.url())
        .bearer_auth(MANAGER_SESSION)
        .send()
        .await
        .is_err());
    let clock = Clock(AtomicI64::new(NOW));
    let bindings = bindings();
    let projection = worker_projection(&source, &store, &manifest, &bindings, &clock);
    let handle = projection
        .resume_manifest(
            &seal(&manifest, &manifest.binding, "MANIFEST"),
            SnapshotPlacement::Auto,
        )
        .await
        .unwrap();
    assert_eq!(
        projection
            .checkpoint(
                &handle,
                &seal(&manifest.binding, &manifest.binding, "CONTROL")
            )
            .await
            .unwrap()
            .cursor(),
        mark('A')
    );
    let address = server.address;
    server.finish().await.unwrap();
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
    assert_eq!(resources.stats().unwrap().active, 0);
    assert_eq!(resources.stats().unwrap().bytes, 0);
    source.finish().await;
}

#[tokio::test]
async fn complete_entrypoint_denied_source_stops_listener_without_source_http_or_receipt() {
    let (store, resources) = test_store_and_resources().await;
    let (manifest, pages) = snapshot(payload());
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let authority = Arc::new(WorkerAuthority::new(false));
    authority.denied.store(true, Ordering::SeqCst);
    let backend = entrypoint_backend(
        Arc::new(store),
        resources.clone(),
        Arc::new(crate::scoped_policy::UnavailableCurrentPolicy),
    );
    let server = EntrypointServer::start(
        backend,
        entrypoint_source(&source, &manifest, authority.clone()),
    );
    let address = server.address;
    let error = server.await_stopped().await.unwrap_err();
    assert_eq!(error.to_string(), "FINANCIAL_SOURCE_WORKER_STOPPED");
    assert!(tokio::net::TcpStream::connect(address).await.is_err());
    assert!(source.state.requests.lock().unwrap().is_empty());
    assert!(authority.acks.lock().unwrap().is_empty());
    assert_eq!(resources.stats().unwrap().active, 0);
    assert_eq!(resources.stats().unwrap().bytes, 0);
    source.finish().await;
}

fn query() -> ReadQuery {
    ReadQuery {
        operation: Operation::Current,
        limit: 2,
        max_bytes: 1024 * 1024,
        entity_id: None,
        from_ms: None,
        to_ms: None,
    }
}

#[tokio::test]
async fn mtls_financial_snapshot_commit_scoped_read_and_revoke_use_existing_ports() {
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let bindings = bindings();
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let clock = Clock(AtomicI64::new(NOW));
    let pipeline = FinancialProjection::new(
        &source.client,
        &store,
        manifest.binding.clone(),
        limits(),
        &bindings,
        &clock,
    )
    .unwrap();
    let candidate = pipeline
        .fetch_snapshot("TEST_ONLY-original-assertion")
        .await
        .unwrap();
    let proof = seal(&manifest, &manifest.binding, "MANIFEST");
    let handle = pipeline
        .begin_snapshot(&candidate, &proof, SnapshotPlacement::Auto)
        .await
        .unwrap();
    let page_proof = seal(&pages[0], &manifest.binding, "PAGE");
    pipeline
        .stage_page(&candidate, 0, &handle, &page_proof)
        .await
        .unwrap();
    let control = seal(&manifest.binding, &manifest.binding, "CONTROL");
    let receipt = pipeline
        .finish_snapshot(&candidate, &handle, &control)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(receipt.cursor(), mark('A'));
    // Exact original retry after a simulated lost return, no fresh generation.
    assert_eq!(
        pipeline
            .finish_snapshot(&candidate, &handle, &control)
            .await
            .unwrap()
            .unwrap()
            .cursor(),
        receipt.cursor()
    );
    let codec = CursorCodec::new(
        "TEST_ONLY",
        [("TEST_ONLY".into(), vec![7; 32])].into(),
        Duration::from_secs(60),
    )
    .unwrap();
    let policy = RevocablePolicy(AtomicBool::new(false));
    let read =
        AuthorizedRead::authorize(read_scope(&manifest), Operation::Current, &policy, NOW).unwrap();
    let reader = ScopedReadService {
        store: &store,
        authorizer: &policy,
        clock: &clock,
        codec: &codec,
        limits: ReadLimits {
            cursor_ttl_ms: 60_000,
            max_scope_cursors: 16,
            max_total_cursors: 64,
        },
    };
    let page = read_financial_page(&reader, &read, &query(), None, &bindings)
        .await
        .unwrap();
    assert_eq!(page.reports.len(), 1);
    assert!(page.metadata().rows.is_empty());
    assert_eq!(page.metadata().availability, "PARTIAL");
    assert_eq!(
        page.reports[0].report.rows()[0]
            .economics
            .nav
            .as_ref()
            .unwrap()
            .as_str(),
        "900"
    );
    assert!(page.reports[0].report.rows()[0].economics.fees.is_none());
    assert!(page.metadata().resume_cursor.is_none());
    policy.0.store(true, Ordering::SeqCst);
    assert!(
        read_financial_page(&reader, &read, &query(), None, &bindings)
            .await
            .is_err()
    );
    assert_eq!(
        source.state.requests.lock().unwrap().as_slice(),
        &[(SNAPSHOT_PATH.into(), b"{}".to_vec())]
    );
    source.finish().await;
}

#[tokio::test]
async fn exact_source_proofs_expire_and_foreign_seals_do_not_stage_financial_rows() {
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let bindings = bindings();
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let clock = Clock(AtomicI64::new(NOW));
    let pipeline = FinancialProjection::new(
        &source.client,
        &store,
        manifest.binding.clone(),
        limits(),
        &bindings,
        &clock,
    )
    .unwrap();
    let candidate = pipeline
        .fetch_snapshot("TEST_ONLY-original-assertion")
        .await
        .unwrap();
    let handle = pipeline
        .begin_snapshot(
            &candidate,
            &seal(&manifest, &manifest.binding, "MANIFEST"),
            SnapshotPlacement::Auto,
        )
        .await
        .unwrap();
    let mut changed = pages[0].clone();
    changed.rows[0].payload["rows"][0]["economics"]["nav"] = json!("901");
    assert!(matches!(
        pipeline
            .stage_page(
                &candidate,
                0,
                &handle,
                &seal(&changed, &manifest.binding, "PAGE")
            )
            .await,
        Err(FinancialProjectionError::Binding)
    ));
    let proof = seal(&pages[0], &manifest.binding, "PAGE");
    clock.0.store(NOW + 30_001, Ordering::SeqCst);
    assert!(matches!(
        pipeline.stage_page(&candidate, 0, &handle, &proof).await,
        Err(FinancialProjectionError::Store(BootstrapError::Protocol(
            ProtocolError::Expired
        )))
    ));
    clock.0.store(NOW, Ordering::SeqCst);
    assert!(pipeline
        .finish_snapshot(
            &candidate,
            &handle,
            &seal(&manifest.binding, &manifest.binding, "CONTROL")
        )
        .await
        .is_err());
    source.finish().await;
}

#[tokio::test]
async fn authenticated_hidden_only_group_advances_real_durable_checkpoint_not_empty_poll() {
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let bindings = bindings();
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: "TEST_ONLY-hidden-commit".into(),
        from_cursor: mark('A'),
        to_cursor: mark('B'),
        chunk_digests: vec![],
        events_digest: events_digest(&[]).unwrap(),
        reached_catchup: false,
    };
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":group,"chunks":[]}),
    );
    let clock = Clock(AtomicI64::new(NOW));
    let pipeline = FinancialProjection::new(
        &source.client,
        &store,
        manifest.binding.clone(),
        limits(),
        &bindings,
        &clock,
    )
    .unwrap();
    let candidate = pipeline
        .fetch_snapshot("TEST_ONLY-original-assertion")
        .await
        .unwrap();
    let handle = pipeline
        .begin_snapshot(
            &candidate,
            &seal(&manifest, &manifest.binding, "MANIFEST"),
            SnapshotPlacement::Auto,
        )
        .await
        .unwrap();
    pipeline
        .stage_page(
            &candidate,
            0,
            &handle,
            &seal(&pages[0], &manifest.binding, "PAGE"),
        )
        .await
        .unwrap();
    let control = seal(&manifest.binding, &manifest.binding, "CONTROL");
    pipeline
        .finish_snapshot(&candidate, &handle, &control)
        .await
        .unwrap();
    let delta = pipeline
        .fetch_delta(&handle, &mark('A'), "TEST_ONLY-original-assertion")
        .await
        .unwrap();
    assert!(delta.chunks().is_empty());
    assert_eq!(
        pipeline
            .commit_group(&delta, &handle, &seal(&group, &manifest.binding, "GROUP"))
            .await
            .unwrap()
            .cursor(),
        mark('B')
    );
    let second = test_store().await;
    assert_eq!(
        second
            .bootstrap_checkpoint(&handle, &control, NOW)
            .await
            .unwrap()
            .cursor(),
        mark('B')
    );
    assert_eq!(
        pipeline
            .checkpoint(&handle, &control)
            .await
            .unwrap()
            .cursor(),
        mark('B')
    );
    source.finish().await;
}

fn cost_delta(
    manifest: &Manifest,
    page: &SnapshotPage,
) -> (BTreeMap<String, FinancialBinding>, DeltaChunk, DeltaGroup) {
    let mut bindings = bindings();
    let mut updated = expected();
    updated.reference = "TEST_ONLY-qualified-cost-v2".into();
    updated.publication_version = "2".into();
    updated.publication_payload_hash = "f".repeat(64);
    let mut value = payload();
    value["reference"] = json!(updated.reference);
    value["version"] = json!("2");
    value["publication_payload_hash"] = json!(updated.publication_payload_hash);
    value["source_event_id"] = json!("00000000-0000-4000-8000-000000000006");
    value["source_group_id"] = json!("00000000-0000-4000-8000-000000000007");
    value["rows"][0]["economics"]["fees"] = json!("1.250000000000000001");
    let revision = Revision {
        ordinal: 2,
        opaque: source_id(
            "publication",
            &[
                &updated.report_key,
                &updated.publication_version,
                &updated.publication_payload_hash,
            ],
        )
        .unwrap(),
    };
    bindings.insert(updated.reference.clone(), updated);
    let event=serde_json::from_value(json!({"revision":revision,"event":{
        "event_id":value["source_event_id"],"source_position":{"source_epoch":manifest.binding.source_epoch,"source_sequence":"11"},
        "entity_kind":DATASET,"entity_id":page.rows[0].entity_id,"entity_version":revision.opaque,
        "payload_schema_revision":PAYLOAD_SCHEMA,"operation":"UPSERT","event_time_ms":NOW,"source_published_at_ms":NOW,
        "correction_of_event_id":null,"tombstone_of_event_id":null,"causation_id":null,"correlation_id":null,
        "payload_digest":format!("sha256:{:x}",Sha256::digest(bytes(&value))),"payload":value
    }})).unwrap();
    let chunk = DeltaChunk {
        generation: manifest.generation,
        group_id: "TEST_ONLY-cost-commit".into(),
        index: 0,
        events: vec![event],
    };
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: chunk.group_id.clone(),
        from_cursor: mark('A'),
        to_cursor: mark('B'),
        chunk_digests: vec![chunk.digest().unwrap()],
        events_digest: events_digest(&chunk.events).unwrap(),
        reached_catchup: false,
    };
    (bindings, chunk, group)
}

#[tokio::test]
async fn newly_qualified_cost_publication_stages_complete_group_and_reads_without_pnl_invention() {
    let store = test_store().await;
    let (manifest, pages) = snapshot(payload());
    let (bindings, chunk, group) = cost_delta(&manifest, &pages[0]);
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":group,"chunks":[chunk]}),
    );
    let clock = Clock(AtomicI64::new(NOW));
    let pipeline = FinancialProjection::new(
        &source.client,
        &store,
        manifest.binding.clone(),
        limits(),
        &bindings,
        &clock,
    )
    .unwrap();
    let candidate = pipeline
        .fetch_snapshot("TEST_ONLY-original-assertion")
        .await
        .unwrap();
    let handle = pipeline
        .begin_snapshot(
            &candidate,
            &seal(&manifest, &manifest.binding, "MANIFEST"),
            SnapshotPlacement::Auto,
        )
        .await
        .unwrap();
    pipeline
        .stage_page(
            &candidate,
            0,
            &handle,
            &seal(&pages[0], &manifest.binding, "PAGE"),
        )
        .await
        .unwrap();
    let control = seal(&manifest.binding, &manifest.binding, "CONTROL");
    pipeline
        .finish_snapshot(&candidate, &handle, &control)
        .await
        .unwrap();
    let delta = pipeline
        .fetch_delta(&handle, &mark('A'), "TEST_ONLY-original-assertion")
        .await
        .unwrap();
    assert!(pipeline
        .commit_group(&delta, &handle, &seal(&group, &manifest.binding, "GROUP"))
        .await
        .is_err());
    pipeline
        .stage_chunk(
            &delta,
            0,
            &handle,
            &seal(&chunk, &manifest.binding, "CHUNK"),
        )
        .await
        .unwrap();
    assert_eq!(
        pipeline
            .commit_group(&delta, &handle, &seal(&group, &manifest.binding, "GROUP"))
            .await
            .unwrap()
            .cursor(),
        mark('B')
    );
    let policy = RevocablePolicy(AtomicBool::new(false));
    let read =
        AuthorizedRead::authorize(read_scope(&manifest), Operation::Current, &policy, NOW).unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY",
        [("TEST_ONLY".into(), vec![7; 32])].into(),
        Duration::from_secs(60),
    )
    .unwrap();
    let reader = ScopedReadService {
        store: &store,
        authorizer: &policy,
        clock: &clock,
        codec: &codec,
        limits: ReadLimits {
            cursor_ttl_ms: 60_000,
            max_scope_cursors: 16,
            max_total_cursors: 64,
        },
    };
    let result = read_financial_page(&reader, &read, &query(), None, &bindings)
        .await
        .unwrap();
    assert_qualified_costs(&result.reports[0].report);
    source.finish().await;
}

fn assert_qualified_costs(report: &PublishedFinancialReport) {
    assert_eq!(report.publication_version(), "2");
    assert_eq!(
        report.rows()[0].economics.fees.as_ref().unwrap().as_str(),
        "1.250000000000000001"
    );
    assert_eq!(
        report.rows()[0]
            .economics
            .realized_pnl
            .as_ref()
            .unwrap()
            .as_str(),
        "0"
    );
    assert_eq!(
        report
            .statement("TEST_ONLY-source")
            .unwrap()
            .economic_additions
            .as_str(),
        "200"
    );
}

#[tokio::test]
async fn ungoverned_store_is_refused_before_financial_http_write_or_read() {
    let governed = test_store().await;
    let url = std::env::var("TEST_PROJECTION_DATABASE_URL").unwrap();
    let ungoverned = PgProjectionStore::connect(&url).await.unwrap();
    let (manifest, pages) = snapshot(payload());
    let bindings = bindings();
    let source = Source::start(
        json!({"manifest":manifest,"pages":pages}),
        json!({"group":null,"chunks":[]}),
    );
    let clock = Clock(AtomicI64::new(NOW));
    assert!(matches!(
        FinancialProjection::new(
            &source.client,
            &ungoverned,
            manifest.binding.clone(),
            limits(),
            &bindings,
            &clock
        ),
        Err(FinancialProjectionError::Resource(_))
    ));
    // The target exists, so rejection is explicit governance rather than a DB failure.
    assert!(FinancialProjection::new(
        &source.client,
        &governed,
        manifest.binding.clone(),
        limits(),
        &bindings,
        &clock
    )
    .is_ok());
    let policy = RevocablePolicy(AtomicBool::new(false));
    let read =
        AuthorizedRead::authorize(read_scope(&manifest), Operation::Current, &policy, NOW).unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY",
        [("TEST_ONLY".into(), vec![7; 32])].into(),
        Duration::from_secs(60),
    )
    .unwrap();
    let reader = ScopedReadService {
        store: &ungoverned,
        authorizer: &policy,
        clock: &clock,
        codec: &codec,
        limits: ReadLimits {
            cursor_ttl_ms: 60_000,
            max_scope_cursors: 16,
            max_total_cursors: 64,
        },
    };
    assert!(matches!(
        read_financial_page(&reader, &read, &query(), None, &bindings).await,
        Err(FinancialProjectionError::Resource(_))
    ));
    assert!(source.state.requests.lock().unwrap().is_empty());
    source.finish().await;
}
