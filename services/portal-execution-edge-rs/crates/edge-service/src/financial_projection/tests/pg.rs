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
    report_publication_wire::{DELTA_PATH, SNAPSHOT_PATH},
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
    let store = PgProjectionStore::connect_with_resources(&url, resources, 8)
        .await
        .unwrap();
    store.migrate().await.unwrap();
    store
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
        &state.snapshot
    } else {
        &state.delta
    };
    (
        [
            ("content-type", "application/json"),
            ("x-pma-publication-wire", "scoped-bootstrap.v1"),
            ("cache-control", "no-store"),
            ("vary", "authorization"),
        ],
        bytes(value),
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
        let certificates = |raw: &[u8]| {
            rustls_pemfile::certs(&mut Cursor::new(raw))
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };
        let mut roots = rustls::RootCertStore::empty();
        for certificate in certificates(&ca) {
            roots.add(certificate).unwrap();
        }
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let verifier = rustls::server::WebPkiClientVerifier::builder_with_provider(
            Arc::new(roots),
            provider.clone(),
        )
        .build()
        .unwrap();
        let key = rustls_pemfile::private_key(&mut Cursor::new(&key))
            .unwrap()
            .unwrap();
        let mut config = rustls::ServerConfig::builder_with_provider(provider)
            .with_protocol_versions(&[&rustls::version::TLS13])
            .unwrap()
            .with_client_cert_verifier(verifier)
            .with_single_cert(certificates(&certificate), key)
            .unwrap();
        config.alpn_protocols = vec![b"http/1.1".to_vec()];
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
            .route(DELTA_PATH, post(handler))
            .with_state(state.clone());
        let handle = axum_server::Handle::new();
        let serving = handle.clone();
        let job = tokio::spawn(async move {
            axum_server::from_tcp_rustls(
                listener,
                axum_server::tls_rustls::RustlsConfig::from_config(Arc::new(config)),
            )
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
