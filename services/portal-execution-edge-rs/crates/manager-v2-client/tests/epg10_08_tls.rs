//! `TEST_ONLY` loopback TLS1.3/mTLS; ephemeral OpenSSL certificates, never owner PKI.
//! Exercises the PUBLIC constructors (not cfg(test) insecure clients).
use std::{
    fs::{self, OpenOptions},
    io::{BufReader, Read as _, Write as _},
    net::{SocketAddr, TcpListener},
    os::unix::fs::PermissionsExt as _,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use manager_v2_client::{
    ManagerV2Client, ManagerV2ClientConfig, ManagerV2ClientError, ManagerV2ClientLimits,
};
use manager_v2_contract::{ManagerRead, ManagerV2Request, RUNTIME_CONTRACT_REVISION};
use rustls::{
    server::WebPkiClientVerifier, RootCertStore, ServerConfig, ServerConnection, StreamOwned,
};
use ts_adapter_v1::ReadOperation;
use ts_transport::{BoundedSourceClient, SourceTransportConfig, TransportError, TransportLimits};
use uuid::Uuid;

fn owned_test_root(path: &Path) -> bool {
    path.parent() == Some(Path::new("/tmp"))
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                ["epg10-08-", "epg10-09-"].iter().any(|prefix| {
                    name.strip_prefix(prefix).is_some_and(|suffix| {
                        !suffix.is_empty()
                            && suffix
                                .chars()
                                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
                    })
                })
            })
}

#[test]
fn test_root_accepts_only_explicit08_and09_names() {
    for path in ["/tmp/epg10-08-private", "/tmp/epg10-09-private_1.X"] {
        assert!(owned_test_root(Path::new(path)));
    }
}

#[test]
fn test_root_rejects_other_phases_nested_paths_and_operational_roots() {
    for path in [
        "/tmp/epg10-08-",
        "/tmp/epg10-09-",
        "/tmp/epg10-10-private",
        "/tmp/epg10-09-private/child",
        "/tmp/epg10-09-private/../foreign",
        "/tmp/epg10-09-private bad",
        "/home/bobby",
        "/tmp",
    ] {
        assert!(!owned_test_root(Path::new(path)));
    }
}

struct Certificates(PathBuf);
impl Certificates {
    fn new() -> Self {
        assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
        let parent =
            fs::canonicalize(std::env::var("TMPDIR").expect("private test root required")).unwrap();
        assert!(owned_test_root(&parent));
        let dir = parent.join(format!("tls-{}", Uuid::now_v7()));
        fs::create_dir(&dir).unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
        let certs = Self(dir);
        for ca in ["old", "new"] {
            certs.openssl(&[
                "req",
                "-new",
                "-x509",
                "-newkey",
                "ec",
                "-pkeyopt",
                "ec_paramgen_curve:prime256v1",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=TEST_ONLY_CA",
                "-keyout",
                &format!("{ca}.key"),
                "-out",
                &format!("{ca}.crt"),
                "-addext",
                "basicConstraints=critical,CA:TRUE",
                "-addext",
                "keyUsage=critical,keyCertSign,cRLSign",
            ]);
        }
        for (name, ca, san, purpose, days) in [
            (
                "server_old",
                "old",
                "DNS:localhost,IP:127.0.0.1",
                "serverAuth",
                "1",
            ),
            (
                "server_new",
                "new",
                "DNS:localhost,IP:127.0.0.1",
                "serverAuth",
                "1",
            ),
            (
                "wrong_host",
                "old",
                "DNS:not-localhost.invalid",
                "serverAuth",
                "1",
            ),
            (
                "expired",
                "old",
                "DNS:localhost,IP:127.0.0.1",
                "serverAuth",
                "-1",
            ),
            (
                "client_old",
                "old",
                "URI:spiffe://test.invalid/portal",
                "clientAuth",
                "1",
            ),
            (
                "client_new",
                "new",
                "URI:spiffe://test.invalid/portal",
                "clientAuth",
                "1",
            ),
        ] {
            certs.leaf(name, ca, san, purpose, days);
        }
        certs
    }
    fn leaf(&self, name: &str, ca: &str, san: &str, purpose: &str, days: &str) {
        self.openssl(&[
            "req",
            "-new",
            "-newkey",
            "ec",
            "-pkeyopt",
            "ec_paramgen_curve:prime256v1",
            "-nodes",
            "-subj",
            "/CN=TEST_ONLY_LEAF",
            "-keyout",
            &format!("{name}.key"),
            "-out",
            &format!("{name}.csr"),
        ]);
        fs::write(self.0.join("extensions"), format!("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage={purpose}\nsubjectAltName={san}\n")).unwrap();
        self.openssl(&[
            "x509",
            "-req",
            "-in",
            &format!("{name}.csr"),
            "-CA",
            &format!("{ca}.crt"),
            "-CAkey",
            &format!("{ca}.key"),
            "-set_serial",
            "123",
            "-days",
            days,
            "-extfile",
            "extensions",
            "-out",
            &format!("{name}.crt"),
        ]);
    }
    fn openssl(&self, args: &[&str]) {
        let output = Command::new("openssl")
            .current_dir(&self.0)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "TEST_ONLY certificate command failed (output suppressed)"
        );
    }
    fn bytes(&self, name: &str) -> Vec<u8> {
        fs::read(self.0.join(name)).unwrap()
    }
    fn identity(&self, name: &str) -> Vec<u8> {
        [
            self.bytes(&format!("{name}.crt")),
            self.bytes(&format!("{name}.key")),
        ]
        .concat()
    }
    fn roots(&self) -> Vec<u8> {
        [self.bytes("old.crt"), self.bytes("new.crt")].concat()
    }
}
impl Drop for Certificates {
    fn drop(&mut self) {
        // Exact private directory, no symlinks/runtime paths. Overwrite transient
        // key files before unlink; SSD/snapshot erasure is not claimed.
        for entry in fs::read_dir(&self.0).unwrap() {
            let path = entry.unwrap().path();
            assert!(path.is_file() && !path.is_symlink());
            if path.extension().is_some_and(|v| v == "key") {
                let len = usize::try_from(fs::metadata(&path).unwrap().len()).unwrap();
                let mut file = OpenOptions::new().write(true).open(&path).unwrap();
                file.write_all(&vec![0; len]).unwrap();
                file.sync_all().unwrap();
            }
            fs::remove_file(path).unwrap();
        }
        fs::remove_dir(&self.0).unwrap();
    }
}

struct Server {
    addr: SocketAddr,
    stop: Arc<AtomicBool>,
    requests: Arc<AtomicUsize>,
    worker: Option<JoinHandle<()>>,
}
impl Server {
    fn start(
        c: &Certificates,
        leaf: &str,
        client_roots: &[u8],
        tls12: bool,
        redirect: bool,
        profile: &str,
    ) -> Self {
        let _ = rustls::crypto::ring::default_provider().install_default();
        let mut roots = RootCertStore::empty();
        for cert in rustls_pemfile::certs(&mut BufReader::new(client_roots)) {
            roots.add(cert.unwrap()).unwrap();
        }
        let verifier = WebPkiClientVerifier::builder(Arc::new(roots))
            .build()
            .unwrap();
        let cert = c.bytes(&format!("{leaf}.crt"));
        let key = c.bytes(&format!("{leaf}.key"));
        let certs = rustls_pemfile::certs(&mut BufReader::new(cert.as_slice()))
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        let key = rustls_pemfile::private_key(&mut BufReader::new(key.as_slice()))
            .unwrap()
            .unwrap();
        let versions = if tls12 {
            &[&rustls::version::TLS12][..]
        } else {
            &[&rustls::version::TLS13][..]
        };
        let config = Arc::new(
            ServerConfig::builder_with_protocol_versions(versions)
                .with_client_cert_verifier(verifier)
                .with_single_cert(certs, key)
                .unwrap(),
        );
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(AtomicUsize::new(0));
        let (done, count, profile) = (stop.clone(), requests.clone(), profile.to_owned());
        let worker = thread::spawn(move || {
            while !done.load(Ordering::SeqCst) {
                let Ok((socket, _)) = listener.accept() else {
                    thread::sleep(Duration::from_millis(2));
                    continue;
                };
                socket
                    .set_read_timeout(Some(Duration::from_secs(1)))
                    .unwrap();
                socket
                    .set_write_timeout(Some(Duration::from_secs(1)))
                    .unwrap();
                let mut stream =
                    StreamOwned::new(ServerConnection::new(config.clone()).unwrap(), socket);
                let mut bytes = [0; 8192];
                let mut size = 0;
                while size < bytes.len() && !bytes[..size].windows(4).any(|v| v == b"\r\n\r\n") {
                    match stream.read(&mut bytes[size..]) {
                        Ok(0) | Err(_) => break,
                        Ok(read) => size += read,
                    }
                }
                if !bytes[..size].windows(4).any(|v| v == b"\r\n\r\n") {
                    continue;
                }
                count.fetch_add(1, Ordering::SeqCst);
                let v1 = bytes[..size].starts_with(b"GET /v1/");
                let body = if v1 {
                    include_str!("../../../fixtures/health.v1.json").to_owned()
                } else {
                    catalogue(&profile)
                };
                let headers = if v1 {
                    "x-trading-api-version: v1\r\nx-trading-contract-revision: v1\r\nx-trading-schema-version: v1\r\n"
                } else {
                    "content-type: application/json\r\nx-manager-contract: trading-system.portal-execution.manager-v2.runtime.v1\r\n"
                };
                let status = if redirect {
                    "302 Found\r\nlocation: https://not-allowed.invalid/"
                } else {
                    "200 OK"
                };
                let response = format!("HTTP/1.1 {status}\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });
        Self {
            addr,
            stop,
            requests,
            worker: Some(worker),
        }
    }
    fn origin(&self) -> String {
        format!("https://{}", self.addr)
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.worker.take().unwrap().join().unwrap();
    }
}
fn catalogue(profile: &str) -> String {
    let digest = format!("sha256:{}", "a".repeat(64));
    format!(
        r#"{{"contract_version":"{RUNTIME_CONTRACT_REVISION}","authority":"EXECUTION_CELL","profile_id":"{profile}","catalogue_sha256":"{digest}","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","trace_id":"TEST_ONLY","as_of":"2026-10-16T00:00:00Z","data":{{"catalogue_revision":"{digest}","relation_count":1,"relations":[{{"id":{{"schema":"public","relation":"orders"}},"kind":"TABLE","safe_columns":[{{"name":"id","ordinal":1,"data_type":"bigint","nullable":false}}],"secret_cell_excluded_column_count":0,"key":{{"status":"PRIMARY_KEY","name":null,"columns":["id"]}},"profile_classification":"FIXED_PROFILE_CONTEXT","profile_columns":[],"query_status":"QUALIFIED_TS_OC_03D1"}}]}}}}"#
    )
}
fn manager(
    origin: &str,
    roots: &[u8],
    identity: &[u8],
    profile: &str,
) -> Result<ManagerV2Client, ManagerV2ClientError> {
    ManagerV2Client::new(ManagerV2ClientConfig {
        source_proxy_origin: origin,
        profile_id: profile,
        root_ca_pem: roots,
        client_identity_pem: identity,
        limits: ManagerV2ClientLimits {
            connect_timeout: Duration::from_secs(1),
            request_timeout: Duration::from_secs(2),
            ..ManagerV2ClientLimits::default()
        },
    })
}
fn v1(
    origin: &str,
    roots: &[u8],
    identity: Option<&[u8]>,
) -> Result<BoundedSourceClient, TransportError> {
    BoundedSourceClient::new(SourceTransportConfig {
        source_origin: origin,
        root_ca_pem: roots,
        client_identity_pem: identity,
        source_api_key: None,
        observed_gateway_digest: "TEST_ONLY",
        limits: TransportLimits {
            connect_timeout: Duration::from_secs(1),
            request_timeout: Duration::from_secs(2),
            maximum_retries: 0,
            ..TransportLimits::default()
        },
    })
}
async fn succeeds(s: &Server, roots: &[u8], identity: &[u8], profile: &str) {
    assert!(matches!(
        manager(&s.origin(), roots, identity, profile)
            .unwrap()
            .execute(&ManagerV2Request::catalogue())
            .await
            .unwrap(),
        ManagerRead::Available(_)
    ));
    assert!(v1(&s.origin(), roots, Some(identity))
        .unwrap()
        .execute(&ReadOperation::Health)
        .await
        .is_ok());
}
async fn denied(s: &Server, roots: &[u8], identity: Option<&[u8]>) {
    if let Some(identity) = identity {
        assert!(matches!(
            manager(&s.origin(), roots, identity, "PAPER_BINANCE_USDM")
                .unwrap()
                .execute(&ManagerV2Request::catalogue())
                .await,
            Err(ManagerV2ClientError::RequestFailed)
        ));
    }
    assert!(matches!(
        v1(&s.origin(), roots, identity)
            .unwrap()
            .execute(&ReadOperation::Health)
            .await,
        Err(TransportError::RequestFailed)
    ));
    assert_eq!(s.requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn trusted_mtls_positive_across_paper_sandbox_live() {
    let c = Certificates::new();
    for profile in [
        "PAPER_BINANCE_USDM",
        "SANDBOX_BINANCE_USDM",
        "LIVE_BINANCE_USDM",
    ] {
        let s = Server::start(&c, "server_old", &c.bytes("old.crt"), false, false, profile);
        succeeds(&s, &c.bytes("old.crt"), &c.identity("client_old"), profile).await;
        assert_eq!(s.requests.load(Ordering::SeqCst), 2);
    }
}
#[tokio::test]
async fn untrusted_server_chain_denied_without_public_root_fallback() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "server_new",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(&s, &c.bytes("old.crt"), Some(&c.identity("client_old"))).await;
}
#[tokio::test]
async fn trusted_chain_wrong_hostname_denied() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "wrong_host",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(&s, &c.bytes("old.crt"), Some(&c.identity("client_old"))).await;
}
#[tokio::test]
async fn missing_or_wrong_client_certificate_denied() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "server_old",
        &c.bytes("old.crt"),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    assert!(matches!(
        manager(&s.origin(), &c.bytes("old.crt"), &[], "PAPER_BINANCE_USDM"),
        Err(ManagerV2ClientError::MissingClientIdentity)
    ));
    denied(&s, &c.bytes("old.crt"), None).await;
    denied(&s, &c.bytes("old.crt"), Some(&c.identity("client_new"))).await;
}
#[tokio::test]
async fn ca_overlap_then_removal_requires_new_strict_client_not_stale_pool() {
    let c = Certificates::new();
    let old = Server::start(
        &c,
        "server_old",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    let new = Server::start(
        &c,
        "server_new",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    succeeds(
        &old,
        &c.roots(),
        &c.identity("client_old"),
        "PAPER_BINANCE_USDM",
    )
    .await;
    succeeds(
        &new,
        &c.roots(),
        &c.identity("client_old"),
        "PAPER_BINANCE_USDM",
    )
    .await;
    let fresh_old = Server::start(
        &c,
        "server_old",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(
        &fresh_old,
        &c.bytes("new.crt"),
        Some(&c.identity("client_old")),
    )
    .await;
    succeeds(
        &new,
        &c.bytes("new.crt"),
        &c.identity("client_new"),
        "PAPER_BINANCE_USDM",
    )
    .await;
}
#[tokio::test]
async fn client_cert_overlap_and_revocation_preserve_same_profile_scope() {
    let c = Certificates::new();
    let overlap = Server::start(
        &c,
        "server_old",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    succeeds(
        &overlap,
        &c.bytes("old.crt"),
        &c.identity("client_old"),
        "PAPER_BINANCE_USDM",
    )
    .await;
    succeeds(
        &overlap,
        &c.bytes("old.crt"),
        &c.identity("client_new"),
        "PAPER_BINANCE_USDM",
    )
    .await;
    let current = Server::start(
        &c,
        "server_old",
        &c.bytes("new.crt"),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(
        &current,
        &c.bytes("old.crt"),
        Some(&c.identity("client_old")),
    )
    .await;
    succeeds(
        &current,
        &c.bytes("old.crt"),
        &c.identity("client_new"),
        "PAPER_BINANCE_USDM",
    )
    .await;
}
#[tokio::test]
async fn tls12_server_denied_without_protocol_downgrade() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "server_old",
        &c.roots(),
        true,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(&s, &c.bytes("old.crt"), Some(&c.identity("client_old"))).await;
}
#[tokio::test]
async fn verified_tls_does_not_allow_redirect_credential_forwarding() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "server_old",
        &c.roots(),
        false,
        true,
        "PAPER_BINANCE_USDM",
    );
    assert!(matches!(
        manager(
            &s.origin(),
            &c.bytes("old.crt"),
            &c.identity("client_old"),
            "PAPER_BINANCE_USDM"
        )
        .unwrap()
        .execute(&ManagerV2Request::catalogue())
        .await,
        Err(ManagerV2ClientError::RedirectDenied)
    ));
    assert!(matches!(
        v1(
            &s.origin(),
            &c.bytes("old.crt"),
            Some(&c.identity("client_old"))
        )
        .unwrap()
        .execute(&ReadOperation::Health)
        .await,
        Err(TransportError::RedirectDenied)
    ));
    assert_eq!(s.requests.load(Ordering::SeqCst), 2);
}
#[tokio::test]
async fn expired_server_certificate_denied() {
    let c = Certificates::new();
    let s = Server::start(
        &c,
        "expired",
        &c.roots(),
        false,
        false,
        "PAPER_BINANCE_USDM",
    );
    denied(&s, &c.bytes("old.crt"), Some(&c.identity("client_old"))).await;
}
#[tokio::test]
async fn empty_malformed_oversized_trust_and_non_https_origins_fail_closed() {
    let c = Certificates::new();
    let identity = c.identity("client_old");
    for roots in [&b"not a certificate"[..], &vec![b'a'; 1024 * 1024 + 1]] {
        assert!(manager("https://localhost", roots, &identity, "PAPER_BINANCE_USDM").is_err());
        assert!(v1("https://localhost", roots, Some(&identity)).is_err());
    }
    for origin in [
        "http://localhost",
        "https://user:password@localhost",
        "https://localhost/path",
        "https://localhost?secret=x",
    ] {
        assert!(manager(origin, &c.bytes("old.crt"), &identity, "PAPER_BINANCE_USDM").is_err());
        assert!(v1(origin, &c.bytes("old.crt"), Some(&identity)).is_err());
    }
    // Do not format actual identity/credentials or upstream request errors.
    assert!(!format!("{}", TransportError::RequestFailed).contains("TEST_ONLY"));
    assert!(Path::new(&c.0).is_dir());
}
