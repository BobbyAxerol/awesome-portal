// TEST_ONLY: public TLS1.3/mTLS client + real worker + owned disposable PG.
// Never point this harness at a real Manager source or an operational DB.
use super::*;
use std::{
    io::{BufRead as _, BufReader, Read as _, Write as _},
    net::TcpListener,
    os::unix::fs::PermissionsExt as _,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc,
    },
    thread::{self, JoinHandle},
};

use query_api::{CursorCodec, EntityQueryRequest};
use rcgen::{BasicConstraints, CertificateParams, ExtendedKeyUsagePurpose, IsCa, KeyPair};
use rustls::{
    server::WebPkiClientVerifier, RootCertStore, ServerConfig, ServerConnection, StreamOwned,
};
use serde_json::{json, Value};

const PROFILE: &str = "PAPER_BINANCE_USDM";
const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

struct TestFiles {
    directory: PathBuf,
    ca: PathBuf,
    identity: PathBuf,
    database_url: PathBuf,
}

impl Drop for TestFiles {
    fn drop(&mut self) {
        for path in [&self.ca, &self.identity, &self.database_url] {
            let _ = fs::remove_file(path);
        }
        let _ = fs::remove_dir(&self.directory);
    }
}

struct Source {
    address: std::net::SocketAddr,
    mode: Arc<AtomicUsize>,
    requests: Arc<AtomicUsize>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Source {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}

// Own exactly the child created by this test, including on assertion failure.
struct TestWorker {
    child: Child,
    committed: mpsc::Receiver<()>,
    output_reader: Option<JoinHandle<()>>,
}

impl Drop for TestWorker {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
        if let Some(reader) = self.output_reader.take() {
            let _ = reader.join();
        }
    }
}

fn start_test_worker(root: &Path, source: &Source, files: &TestFiles) -> TestWorker {
    let binary =
        fs::canonicalize(root.join("target/debug/edge-service")).expect("TEST_ONLY worker binary");
    assert_eq!(binary.parent(), Some(root.join("target/debug").as_path()));
    let mut child = Command::new(binary)
        .arg("manager-projection-run")
        .env("EDGE_SOURCE_ORIGIN", format!("https://{}", source.address))
        .env("EDGE_SOURCE_CA_FILE", &files.ca)
        .env("EDGE_SOURCE_CLIENT_IDENTITY_FILE", &files.identity)
        .env("EDGE_PROJECTION_DATABASE_URL_FILE", &files.database_url)
        .env("EDGE_MANAGER_PROJECTION_POLL_INTERVAL_MS", "60000")
        .env(
            "EDGE_MANAGER_PROJECTION_POLL_INTERVAL_TRANSACTIONAL_MS",
            "60000",
        )
        .env(
            "EDGE_MANAGER_PROJECTION_POLL_INTERVAL_ACCOUNT_STATE_MS",
            "60000",
        )
        .env("EDGE_MANAGER_PROJECTION_POLL_INTERVAL_METADATA_MS", "60000")
        .env("RUST_LOG", "info")
        .stdout(Stdio::piped())
        .spawn()
        .expect("spawn TEST_ONLY worker");
    let output = child.stdout.take().expect("TEST_ONLY worker stdout");
    let (sender, committed) = mpsc::channel();
    let output_reader = thread::spawn(move || {
        for line in BufReader::new(output).lines().map_while(Result::ok) {
            eprintln!("TEST_ONLY_WORKER_LOG {line}");
            if line.contains("N24 Manager projection cadence cycle committed") {
                let _ = sender.send(());
            }
        }
    });
    TestWorker {
        child,
        committed,
        output_reader: Some(output_reader),
    }
}

async fn wait_for_worker_refresh(
    worker: &mut TestWorker,
    source: &Source,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    after: DateTime<Utc>,
    initial_requests: usize,
) -> query_api::ProjectionQueryPage {
    tokio::time::timeout(Duration::from_secs(30), async {
        let mut committed = false;
        loop {
            assert!(
                worker
                    .child
                    .try_wait()
                    .expect("TEST_ONLY worker status")
                    .is_none(),
                "TEST_ONLY worker exited before refresh"
            );
            committed |= worker.committed.try_recv().is_ok();
            match store
                .query_entities(
                    scope,
                    projection_core::ProjectionEntityKind::Order,
                    &EntityQueryRequest::default(),
                    codec,
                    Utc::now(),
                )
                .await
            {
                Ok(page)
                    if committed
                        && source.requests.load(Ordering::SeqCst) >= initial_requests + 16
                        && page.rows.len() == 2 =>
                {
                    let observations = store
                        .load_manager_feed_observations(scope)
                        .await
                        .expect("sealed TEST_ONLY feed observations")
                        .expect("complete TEST_ONLY feed observations");
                    if observations
                        .get("manager.order")
                        .is_some_and(|feed| feed.source_read_at > after)
                    {
                        break page;
                    }
                }
                Ok(_) | Err(StoreError::ManagerProjectionCycleIncomplete) if !committed => {}
                Ok(_) => {}
                Err(error) => panic!("unexpected TEST_ONLY projection read error: {error}"),
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("bounded TEST_ONLY worker refresh")
}

fn wire(data: &Value, partial: bool) -> String {
    wire_with_freshness(data, partial, "FRESH")
}

fn wire_with_freshness(data: &Value, partial: bool, freshness: &str) -> String {
    json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL", "profile_id": PROFILE,
        "catalogue_sha256": DIGEST, "availability": "AVAILABLE",
        "freshness": freshness, "completeness": if partial { "PARTIAL" } else { "COMPLETE" },
        "trace_id": "TEST_ONLY.worker-http-pg",
        "as_of": (Utc::now() - chrono::TimeDelta::seconds(1))
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "data": data
    })
    .to_string()
}

fn catalogue(with_test_payload: bool) -> Value {
    let census: Value = serde_json::from_str(include_str!(
        "../../../contracts/manager-surface-census-v1/manager-surface-census.v1.json"
    ))
    .unwrap();
    let relations: Vec<Value> = census["relations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| {
            let (schema, name) = item["relation_id"]
                .as_str()
                .unwrap()
                .split_once('.')
                .unwrap();
            let mut safe_columns = vec![
                json!({"name":"id","ordinal":1,"data_type":"bigint","nullable":false}),
                json!({"name":"amount","ordinal":2,"data_type":"numeric","nullable":true}),
            ];
            if with_test_payload {
                safe_columns.push(
                    json!({"name":"test_payload","ordinal":3,"data_type":"text","nullable":false}),
                );
            }
            json!({
                "id": {"schema":schema,"relation":name}, "kind":"TABLE",
                "safe_columns":safe_columns,
                "secret_cell_excluded_column_count":0,
                "key":{"status":"PRIMARY_KEY","name":null,"columns":["id"]},
                "profile_classification":"FIXED_PROFILE_CONTEXT","profile_columns":[],
                "query_status":"QUALIFIED_TS_OC_03D1"
            })
        })
        .collect();
    assert_eq!(relations.len(), 96);
    json!({"catalogue_revision":DIGEST,"relation_count":relations.len(),"relations":relations})
}

fn capabilities() -> Value {
    let operations = [
        ("managerCatalog", "/portal/execution/v2/manager/catalog"),
        (
            "managerRelationRecords",
            "/portal/execution/v2/manager/records/{schema}/{relation}",
        ),
        (
            "managerRelationRecord",
            "/portal/execution/v2/manager/records/{schema}/{relation}/{key}",
        ),
        (
            "managerProjection",
            "/portal/execution/v2/manager/projections/{kind}",
        ),
        (
            "managerCapabilities",
            "/portal/execution/v2/manager/capabilities",
        ),
    ];
    json!({"contract_revision":RUNTIME_CONTRACT_REVISION,"active_profile_id":PROFILE,
        "capabilities":operations.into_iter().map(|(operation_id,path_template)| json!({
            "operation_id":operation_id,"path_template":path_template,"registered":true,
            "portal_reachable":false,"source_binding":true,"qualification_status":"OWNER_LOOPBACK_QUALIFIED"
        })).collect::<Vec<_>>()})
}

const TEST_PAGES: usize = 10;
const TEST_ROWS_PER_PAGE: usize = 200;

fn synthetic_stress_page(target: &str, kind: &str, with_test_payload: bool) -> (u16, String) {
    let relation = match kind {
        "order" => "orders",
        "fill" => "fills",
        _ => panic!("unsupported TEST_ONLY stress feed"),
    };
    let page = target
        .split_once('?')
        .and_then(|(_, query)| {
            query
                .split('&')
                .find_map(|part| part.strip_prefix("cursor="))
        })
        .map_or(0, |cursor| {
            cursor
                .strip_prefix("TEST_ONLY_STRESS_")
                .expect("TEST_ONLY cursor namespace")
                .parse::<usize>()
                .expect("TEST_ONLY page number")
        });
    assert!(page < TEST_PAGES);
    let items: Vec<Value> = (0..TEST_ROWS_PER_PAGE)
        .map(|offset| {
            let id = page * TEST_ROWS_PER_PAGE + offset + 1;
            let mut fields = json!({
                "id":{"kind":"INTEGER","value":id},
                "amount":{"kind":"DECIMAL","value":"10.125"}
            });
            if with_test_payload {
                fields["test_payload"] = json!({
                    "kind":"TEXT", "value":format!("TEST_ONLY_{kind}_{}", "x".repeat(640))
                });
            }
            json!({"relation":{"schema":"public","relation":relation},
                "record_key":format!("TEST_ONLY_stress_{id}"),"fields":fields})
        })
        .collect();
    let cursor = (page + 1 < TEST_PAGES).then(|| format!("TEST_ONLY_STRESS_{}", page + 1));
    let body = wire(
        &json!({"kind":kind,"items":items,"next_cursor":cursor}),
        page + 1 < TEST_PAGES,
    );
    assert!(body.len() <= 1_048_576, "TEST_ONLY page exceeds wire bound");
    (200, body)
}

fn response(target: &str, mode: usize) -> (u16, String) {
    let path = target.split('?').next().unwrap();
    if path.ends_with("/catalog") {
        let freshness = if mode == 6 { "STALE" } else { "FRESH" };
        return (
            200,
            wire_with_freshness(&catalogue(mode == 10), false, freshness),
        );
    }
    if path.ends_with("/capabilities") {
        return (200, wire(&capabilities(), mode == 7));
    }
    if let Some(kind) = path.strip_prefix("/portal/execution/v2/manager/projections/") {
        if mode == 9 && kind == "order" {
            return synthetic_stress_page(target, kind, false);
        }
        if mode == 10 && matches!(kind, "order" | "fill") {
            return synthetic_stress_page(target, kind, true);
        }
        let second = target.contains("cursor=");
        if kind == "order" && second && mode == 1 {
            return (429, String::new());
        }
        let (items, cursor, partial) = if kind == "order" {
            let id = if second { 2 } else { 1 };
            let amount = if second && mode >= 2 { "99" } else { "10" };
            (
                vec![json!({"relation":{"schema":"public","relation":"orders"},
                "record_key":format!("TEST_ONLY_record_{id}"),"fields":{
                    "id":{"kind":"INTEGER","value":id},
                    "amount":{"kind":"DECIMAL","value":amount}}})],
                if second {
                    None
                } else {
                    Some("TEST_ONLY_page2")
                },
                !second,
            )
        } else {
            (Vec::new(), None, false)
        };
        let freshness = if kind == "order" && ((mode == 3 && !second) || (mode == 4 && second)) {
            "STALE"
        } else {
            "FRESH"
        };
        return (
            200,
            wire_with_freshness(
                &json!({"kind":kind,"items":items,"next_cursor":cursor}),
                partial || (kind == "order" && second && mode == 5),
                freshness,
            ),
        );
    }
    if let Some(relation) = path.strip_prefix("/portal/execution/v2/manager/records/public/") {
        return (
            200,
            wire(
                &json!({"relation":{"schema":"public","relation":relation},
            "items":[],"next_cursor":null}),
                false,
            ),
        );
    }
    (404, String::new())
}

fn source_and_files(root: &Path, db_url: &str) -> (Source, TestFiles) {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut ca_params = CertificateParams::new(Vec::<String>::new()).unwrap();
    ca_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let ca_key = KeyPair::generate().unwrap();
    let ca = ca_params.self_signed(&ca_key).unwrap();
    let mut server_params = CertificateParams::new(vec!["127.0.0.1".to_owned()]).unwrap();
    server_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
    let server_key = KeyPair::generate().unwrap();
    let server_cert = server_params.signed_by(&server_key, &ca, &ca_key).unwrap();
    let mut client_params = CertificateParams::new(vec!["test.invalid".to_owned()]).unwrap();
    client_params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ClientAuth];
    let client_key = KeyPair::generate().unwrap();
    let client_cert = client_params.signed_by(&client_key, &ca, &ca_key).unwrap();
    let directory = root.join(format!("case-{}", Uuid::now_v7()));
    fs::create_dir(&directory).unwrap();
    fs::set_permissions(&directory, fs::Permissions::from_mode(0o700)).unwrap();
    let files = TestFiles {
        ca: directory.join("test-ca.pem"),
        identity: directory.join("test-identity.pem"),
        database_url: directory.join("test-db-url"),
        directory,
    };
    fs::write(&files.ca, ca.pem()).unwrap();
    fs::write(
        &files.identity,
        format!("{}{}", client_cert.pem(), client_key.serialize_pem()),
    )
    .unwrap();
    fs::write(&files.database_url, db_url).unwrap();
    let mut roots = RootCertStore::empty();
    roots.add(ca.der().clone()).unwrap();
    let verifier = WebPkiClientVerifier::builder(Arc::new(roots))
        .build()
        .unwrap();
    let server = Arc::new(
        ServerConfig::builder_with_protocol_versions(&[&rustls::version::TLS13])
            .with_client_cert_verifier(verifier)
            .with_single_cert(
                vec![server_cert.der().clone()],
                rustls::pki_types::PrivateKeyDer::Pkcs8(server_key.serialize_der().into()),
            )
            .unwrap(),
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let address = listener.local_addr().unwrap();
    let mode = Arc::new(AtomicUsize::new(0));
    let requests = Arc::new(AtomicUsize::new(0));
    let stop = Arc::new(AtomicBool::new(false));
    let (server_mode, server_requests, server_stop) =
        (mode.clone(), requests.clone(), stop.clone());
    let thread = thread::spawn(move || {
        serve_source(
            &listener,
            &server,
            &server_mode,
            &server_requests,
            &server_stop,
        );
    });
    (
        Source {
            address,
            mode,
            requests,
            stop,
            thread: Some(thread),
        },
        files,
    )
}

fn serve_source(
    listener: &TcpListener,
    server: &Arc<ServerConfig>,
    server_mode: &AtomicUsize,
    server_requests: &AtomicUsize,
    server_stop: &AtomicBool,
) {
    while !server_stop.load(Ordering::SeqCst) {
        let Ok((socket, _)) = listener.accept() else {
            thread::sleep(Duration::from_millis(2));
            continue;
        };
        socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        socket
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut stream = StreamOwned::new(ServerConnection::new(server.clone()).unwrap(), socket);
        let mut bytes = [0_u8; 8192];
        let mut len = 0;
        while len < bytes.len() && !bytes[..len].windows(4).any(|b| b == b"\r\n\r\n") {
            match stream.read(&mut bytes[len..]) {
                Ok(0) | Err(_) => break,
                Ok(n) => len += n,
            }
        }
        let Ok(text) = std::str::from_utf8(&bytes[..len]) else {
            continue;
        };
        let Some(target) = text
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
        else {
            continue;
        };
        server_requests.fetch_add(1, Ordering::SeqCst);
        // Mode 8 holds exactly this TEST_ONLY response so the parent can kill
        // a worker after its durable ticket but before any failure marker.
        while server_mode.load(Ordering::SeqCst) == 8 && !server_stop.load(Ordering::SeqCst) {
            thread::sleep(Duration::from_millis(5));
        }
        let (status, body) = response(target, server_mode.load(Ordering::SeqCst));
        let status_line = match status {
            200 => "200 OK",
            429 => "429 Too Many Requests",
            _ => "404 Not Found",
        };
        let headers = if status == 429 {
            "retry-after: 2\r\n"
        } else {
            "content-type: application/json\r\nx-manager-contract: trading-system.portal-execution.manager-v2.runtime.v1\r\n"
        };
        let reply = format!("HTTP/1.1 {status_line}\r\n{headers}content-length: {}\r\nconnection: close\r\n\r\n{body}",body.len());
        let _ = stream.write_all(reply.as_bytes());
        let _ = stream.flush();
    }
}

fn test_target() -> (PathBuf, String) {
    assert_eq!(std::env::var("EPG10_TEST_ONLY").as_deref(), Ok("1"));
    let root = fs::canonicalize(std::env::var("TMPDIR").expect("TEST_ONLY root")).unwrap();
    assert_eq!(root.parent(), Some(Path::new("/tmp")));
    assert!(root
        .file_name()
        .unwrap()
        .to_str()
        .unwrap()
        .starts_with("epg10-09-worker-"));
    let db_url = std::env::var("TEST_PROJECTION_DATABASE_URL").expect("TEST_ONLY PG");
    // Reject URL parameters, alternate hosts, and non-canonical ports before
    // opening a connection; the matching postmaster must also belong to this
    // exact disposable test root, not an unrelated loopback PostgreSQL.
    let port_text = db_url
        .strip_prefix("postgres://test_only@127.0.0.1:")
        .and_then(|rest| rest.strip_suffix("/portal_projection_test_epg10_04"))
        .expect("exact TEST_ONLY URL");
    let port: u16 = port_text.parse().expect("numeric TEST_ONLY port");
    assert!(port > 0 && port.to_string() == port_text);
    let postmaster =
        fs::read_to_string(root.join("data/postmaster.pid")).expect("owned TEST_ONLY postmaster");
    let pid_lines: Vec<_> = postmaster.lines().collect();
    assert!(pid_lines.len() >= 6);
    assert!(pid_lines[0].parse::<u32>().is_ok_and(|pid| pid > 0));
    assert_eq!(Path::new(pid_lines[1]), root.join("data"));
    assert_eq!(pid_lines[3], port_text);
    assert_eq!(Path::new(pid_lines[4]), root);
    assert_eq!(pid_lines[5], "127.0.0.1");
    (root, db_url)
}

// Only the exact uniquely named/labeled TEST_ONLY container is ever killed.
struct TestContainer {
    child: Child,
    name: String,
    owner: String,
}

impl Drop for TestContainer {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let output = Command::new("sudo")
                .args([
                    "-n",
                    "docker",
                    "inspect",
                    "--format",
                    "{{index .Config.Labels \"epg10.test.owner\"}}",
                    &self.name,
                ])
                .output();
            if output.is_ok_and(|value| {
                value.status.success()
                    && String::from_utf8_lossy(&value.stdout).trim() == self.owner
            }) {
                let _ = Command::new("sudo")
                    .args(["-n", "docker", "kill", &self.name])
                    .status();
            }
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
    }
}

fn start_candidate_container(root: &Path, source: &Source, files: &TestFiles) -> TestContainer {
    assert!(source.address.ip().is_loopback());
    assert_eq!(
        std::env::var("EPG10_CANDIDATE_IMAGE_TEST_ONLY").as_deref(),
        Ok("sha256:8022ea09016eaa3ffdcbfce13d8f3d6696d45d61b1408e97e9c0f93b672e9cef")
    );
    let owner = format!("{}", Uuid::now_v7());
    let name = format!("edge-capacity-test-{owner}");
    let existing = Command::new("sudo")
        .args([
            "-n",
            "docker",
            "ps",
            "-aq",
            "--filter",
            &format!("name=^/{name}$"),
        ])
        .output()
        .unwrap();
    assert!(existing.status.success() && existing.stdout.is_empty());
    let container_user =
        std::env::var("EPG10_TEST_CONTAINER_USER").unwrap_or_else(|_| "1000:1000".to_owned());
    let (uid, gid) = container_user.split_once(':').expect("TEST_ONLY uid:gid");
    assert!([uid, gid].iter().all(|value| value
        .parse::<u32>()
        .is_ok_and(|id| id > 0 && id.to_string() == *value)));
    let mut command = Command::new("sudo");
    command.args([
        "-n",
        "docker",
        "run",
        "--rm",
        "--name",
        &name,
        "--label",
        &format!("epg10.test.owner={owner}"),
        "--network",
        "host",
        "--read-only",
        "--user",
        &container_user,
        "--cpus",
        "0.5",
        "--cpuset-cpus",
        "7",
        "--memory",
        "1g",
        "--memory-swap",
        "1g",
        "--pids-limit",
        "64",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
    ]);
    command
        .arg("--volume")
        .arg(format!("{}:{}:ro", root.display(), root.display()));
    configure_test_container_env(&mut command, source, files);
    let child = command
        .args([
            "sha256:8022ea09016eaa3ffdcbfce13d8f3d6696d45d61b1408e97e9c0f93b672e9cef",
            "manager-projection-once",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("spawn TEST_ONLY container");
    TestContainer { child, name, owner }
}

fn configure_test_container_env(command: &mut Command, source: &Source, files: &TestFiles) {
    for name in [
        "EDGE_ENVIRONMENT",
        "EDGE_TLS_CERTIFICATE_FILE",
        "EDGE_TLS_PRIVATE_KEY_FILE",
        "EDGE_TLS_CLIENT_CA_FILE",
        "EDGE_DELEGATION_JWKS_FILE",
        "EDGE_DELEGATION_ISSUER",
        "EDGE_DELEGATION_AUDIENCE",
        "EDGE_SOURCE_GATEWAY_DIGEST",
        "EDGE_MANAGER_V2_READ_ENABLED",
        "EDGE_MANAGER_V2_PROFILE_ID",
        "EDGE_MANAGER_PROJECTION_ENABLED",
        "EDGE_MANAGER_PROJECTION_OWNER_DIGEST",
    ] {
        command.arg("--env").arg(format!(
            "{name}={}",
            std::env::var(name).expect("TEST_ONLY env")
        ));
    }
    for (name, value) in [
        ("EDGE_SOURCE_ORIGIN", format!("https://{}", source.address)),
        ("EDGE_SOURCE_CA_FILE", files.ca.display().to_string()),
        (
            "EDGE_SOURCE_CLIENT_IDENTITY_FILE",
            files.identity.display().to_string(),
        ),
        (
            "EDGE_PROJECTION_DATABASE_URL_FILE",
            files.database_url.display().to_string(),
        ),
        (
            "EDGE_MANAGER_PROJECTION_MAX_RECORD_JSON_BYTES",
            "4096".to_owned(),
        ),
        (
            "EDGE_MANAGER_PROJECTION_MAX_RETAINED_JSON_BYTES",
            "4194304".to_owned(),
        ),
        (
            "EDGE_MANAGER_PROJECTION_MAX_WORKING_JSON_BYTES",
            "16777216".to_owned(),
        ),
    ] {
        command.arg("--env").arg(format!("{name}={value}"));
    }
}

fn container_cgroup_sample(name: &str) -> Option<(u64, u64)> {
    let output = Command::new("sudo")
        .args([
            "-n",
            "docker",
            "inspect",
            "--format",
            "{{.State.Pid}}",
            name,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let pid = String::from_utf8(output.stdout)
        .ok()?
        .trim()
        .parse::<u32>()
        .ok()?;
    if pid == 0 {
        return None;
    }
    let content = fs::read_to_string(format!("/proc/{pid}/cgroup")).ok()?;
    let group = content.lines().find_map(|line| line.strip_prefix("0::/"))?;
    if group.split('/').any(|part| part == "..") {
        return None;
    }
    let group_path = Path::new("/sys/fs/cgroup").join(group);
    let current = fs::read_to_string(group_path.join("memory.current"))
        .ok()?
        .trim()
        .parse()
        .ok()?;
    let events = fs::read_to_string(group_path.join("memory.events")).ok()?;
    let oom_kill = events
        .lines()
        .find_map(|line| line.strip_prefix("oom_kill "))?
        .parse()
        .ok()?;
    Some((current, oom_kill))
}

async fn wait_candidate_container(mut container: TestContainer) -> (u64, u64) {
    let mut sampled_max = 0_u64;
    let mut oom_kill = 0_u64;
    let status = tokio::time::timeout(Duration::from_secs(120), async {
        loop {
            if let Some((current, kills)) = container_cgroup_sample(&container.name) {
                sampled_max = sampled_max.max(current);
                oom_kill = oom_kill.max(kills);
            }
            if let Some(status) = container
                .child
                .try_wait()
                .expect("TEST_ONLY container status")
            {
                break status;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await
    .expect("bounded TEST_ONLY container");
    assert!(status.success(), "TEST_ONLY container failed: {status}");
    assert!(
        sampled_max > 0,
        "TEST_ONLY cgroup memory.current was not observed"
    );
    assert_eq!(oom_kill, 0, "TEST_ONLY container reported an OOM kill");
    (sampled_max, oom_kill)
}

#[tokio::test]
#[ignore = "TEST_ONLY: explicit disposable Docker candidate, source and PG required"]
async fn candidate_container_pagination_and_cgroup() {
    let (root, db_url) = test_target();
    let store = PgProjectionStore::connect(&db_url).await.unwrap();
    store.migrate().await.unwrap();
    let (source, files) = source_and_files(&root, &db_url);
    source.mode.store(9, Ordering::SeqCst);
    let started = std::time::Instant::now();
    let (sampled_max, oom_kill) =
        wait_candidate_container(start_candidate_container(&root, &source, &files)).await;
    let requests = source.requests.load(Ordering::SeqCst);
    assert_eq!(requests, TEST_PAGES + 14);
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager").unwrap(),
        "paper",
    )
    .unwrap();
    assert_eq!(
        store.load_manager_source_health(&scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let mut request = EntityQueryRequest::default();
    let mut ids = BTreeSet::new();
    loop {
        let page = store
            .query_entities(
                &scope,
                projection_core::ProjectionEntityKind::Order,
                &request,
                &codec,
                Utc::now(),
            )
            .await
            .unwrap();
        assert_eq!(page.total_count, (TEST_PAGES * TEST_ROWS_PER_PAGE) as u64);
        for row in page.rows {
            assert!(ids.insert(row.entity_id), "duplicate TEST_ONLY entity");
        }
        let Some(cursor) = page.next_cursor else {
            break;
        };
        request.after = Some(cursor);
    }
    assert_eq!(ids.len(), TEST_PAGES * TEST_ROWS_PER_PAGE);
    eprintln!("TEST_ONLY_CONTAINER_METRICS rows={} pages={} requests={} cgroup_sampled_max_bytes={} oom_kill={} elapsed_ms={}", ids.len(), TEST_PAGES, requests, sampled_max, oom_kill, started.elapsed().as_millis());
}

async fn verify_synthetic_business_feed(
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    kind: projection_core::ProjectionEntityKind,
    feed: &str,
) {
    let mut request = EntityQueryRequest::default();
    let mut entity_ids = BTreeSet::new();
    let mut source_ids = BTreeSet::new();
    let expected_text = format!("TEST_ONLY_{feed}_{}", "x".repeat(640));
    loop {
        let page = store
            .query_entities(scope, kind, &request, codec, Utc::now())
            .await
            .unwrap();
        assert_eq!(page.total_count, (TEST_PAGES * TEST_ROWS_PER_PAGE) as u64);
        for row in page.rows {
            assert!(
                entity_ids.insert(row.entity_id),
                "duplicate TEST_ONLY entity"
            );
            // Query API normalizes the Manager tagged fields to top-level values.
            assert_eq!(row.payload["test_payload"], expected_text);
            assert_eq!(row.payload["amount"], "10.125");
            assert!(source_ids.insert(row.payload["id"].as_u64().unwrap()));
        }
        let Some(cursor) = page.next_cursor else {
            break;
        };
        request.after = Some(cursor);
    }
    let expected: BTreeSet<_> = (1..=(TEST_PAGES * TEST_ROWS_PER_PAGE) as u64).collect();
    assert_eq!(source_ids, expected);
    assert_eq!(entity_ids.len(), expected.len());
}

#[tokio::test]
#[ignore = "TEST_ONLY: explicit disposable Docker candidate, source and PG required"]
async fn candidate_container_order_fill_pagination_and_cgroup() {
    let (root, db_url) = test_target();
    let store = PgProjectionStore::connect(&db_url).await.unwrap();
    store.migrate().await.unwrap();
    let (source, files) = source_and_files(&root, &db_url);
    source.mode.store(10, Ordering::SeqCst);
    let started = std::time::Instant::now();
    let (sampled_max, oom_kill) =
        wait_candidate_container(start_candidate_container(&root, &source, &files)).await;
    let requests = source.requests.load(Ordering::SeqCst);
    assert_eq!(requests, TEST_PAGES * 2 + 13);
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager").unwrap(),
        "paper",
    )
    .unwrap();
    assert_eq!(
        store.load_manager_source_health(&scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    verify_synthetic_business_feed(
        &store,
        &scope,
        &codec,
        projection_core::ProjectionEntityKind::Order,
        "order",
    )
    .await;
    verify_synthetic_business_feed(
        &store,
        &scope,
        &codec,
        projection_core::ProjectionEntityKind::Fill,
        "fill",
    )
    .await;
    eprintln!("TEST_ONLY_ORDER_FILL_METRICS rows_per_feed={} pages_per_feed={} requests={} cgroup_sampled_max_bytes={} oom_kill={} elapsed_ms={}", TEST_PAGES * TEST_ROWS_PER_PAGE, TEST_PAGES, requests, sampled_max, oom_kill, started.elapsed().as_millis());
}

#[allow(clippy::too_many_arguments)] // Keep the owned worker/recovery context explicit.
async fn verify_worker_restarts(
    root: &Path,
    db_url: &str,
    source: &Source,
    files: &TestFiles,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    config: &EdgeConfig,
    mut last_page: query_api::ProjectionQueryPage,
) {
    for _ in 0..2 {
        let after = store
            .load_manager_feed_observations(scope)
            .await
            .unwrap()
            .unwrap()
            .get("manager.order")
            .unwrap()
            .source_read_at;
        let initial_requests = source.requests.load(Ordering::SeqCst);
        let mut worker = start_test_worker(root, source, files);
        let page = wait_for_worker_refresh(
            &mut worker,
            source,
            store,
            scope,
            codec,
            after,
            initial_requests,
        )
        .await;
        assert_eq!(page.epoch_id, last_page.epoch_id);
        assert_eq!(
            page.rows.iter().map(|row| &row.payload).collect::<Vec<_>>(),
            last_page
                .rows
                .iter()
                .map(|row| &row.payload)
                .collect::<Vec<_>>()
        );
        // A no-op receipt reuses semantic rows; new source liveness is sealed
        // separately and must not fabricate row changes or event sequences.
        assert_eq!(page.rows, last_page.rows);
        drop(worker); // kills/waits for this exact TEST_ONLY child
        last_page = page;
    }
    verify_worker_crash_before_failure_marker(root, db_url, source, files, store, scope, config)
        .await;
}

#[allow(clippy::too_many_arguments)] // Keep the owned process/source/DB proof explicit.
async fn verify_worker_crash_before_failure_marker(
    root: &Path,
    db_url: &str,
    source: &Source,
    files: &TestFiles,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    config: &EdgeConfig,
) {
    let pool = sqlx::PgPool::connect(db_url).await.unwrap();
    source.mode.store(8, Ordering::SeqCst);
    let initial_requests = source.requests.load(Ordering::SeqCst);
    let mut worker = start_test_worker(root, source, files);
    tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            assert!(worker.child.try_wait().unwrap().is_none());
            let pending: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM portal_projection.manager_source_attempts WHERE workspace_id=$1 AND environment=$2",
            )
            .bind(scope.workspace_id.as_str()).bind(&scope.environment)
            .fetch_one(&pool).await.unwrap();
            if pending == 1 && source.requests.load(Ordering::SeqCst) > initial_requests {
                break;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    }).await.expect("TEST_ONLY worker reached source with durable pending attempt");
    drop(worker); // SIGKILL + wait; no worker failure handler can run.
    source.mode.store(2, Ordering::SeqCst);
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    // Advance only the synthetic row deadline, not production clocks or policy.
    let updated = sqlx::query("UPDATE portal_projection.manager_source_attempts SET deadline=clock_timestamp()-interval '1 second' WHERE workspace_id=$1 AND environment=$2")
        .bind(scope.workspace_id.as_str()).bind(&scope.environment).execute(&pool).await.unwrap();
    assert_eq!(updated.rows_affected(), 1);
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Unknown
    );
    let mut recovered_cache = ManagerProjectionFeedCache::default();
    let recovered = run_once_mode(
        config,
        false,
        &[FeedClass::Transactional],
        &mut recovered_cache,
    )
    .await
    .unwrap();
    assert_eq!(recovered.refreshed_classes, FeedClass::ALL);
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM portal_projection.manager_source_attempts WHERE workspace_id=$1 AND environment=$2")
        .bind(scope.workspace_id.as_str()).bind(&scope.environment).fetch_one(&pool).await.unwrap();
    assert_eq!(pending, 0);
    pool.close().await;
}

async fn verify_rate_limit_preserves_projection(
    source: &Source,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    config: &EdgeConfig,
    cache: &mut ManagerProjectionFeedCache,
    before: &query_api::ProjectionQueryPage,
) {
    source.mode.store(1, Ordering::SeqCst);
    let count = source.requests.load(Ordering::SeqCst);
    let failed = run_once_mode(config, false, &FeedClass::ALL, cache).await;
    assert!(matches!(failed, Err(ManagerProjectionCommandError::Client(
        ManagerV2ClientError::RateLimited { retry_after: Some(delay) })) if delay == Duration::from_secs(2)));
    assert_eq!(source.requests.load(Ordering::SeqCst) - count, 4);
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let after_failure = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(after_failure.rows, before.rows);
}

async fn run_test_binary_once(
    root: &Path,
    source: &Source,
    files: &TestFiles,
    limits: Option<ManagerMaterializationLimits>,
) -> std::process::ExitStatus {
    let binary = fs::canonicalize(root.join("target/debug/edge-service"))
        .expect("TEST_ONLY candidate worker binary");
    assert_eq!(binary.parent(), Some(root.join("target/debug").as_path()));
    let mut command = Command::new(binary);
    command
        .arg("manager-projection-once")
        .env("EDGE_SOURCE_ORIGIN", format!("https://{}", source.address))
        .env("EDGE_SOURCE_CA_FILE", &files.ca)
        .env("EDGE_SOURCE_CLIENT_IDENTITY_FILE", &files.identity)
        .env("EDGE_PROJECTION_DATABASE_URL_FILE", &files.database_url)
        .stdout(Stdio::null());
    if let Some(limits) = limits {
        command
            .env(
                "EDGE_MANAGER_PROJECTION_MAX_RECORD_JSON_BYTES",
                limits.max_record_json_bytes().to_string(),
            )
            .env(
                "EDGE_MANAGER_PROJECTION_MAX_RETAINED_JSON_BYTES",
                limits.max_retained_json_bytes().to_string(),
            )
            .env(
                "EDGE_MANAGER_PROJECTION_MAX_WORKING_JSON_BYTES",
                limits.max_working_json_bytes().to_string(),
            );
    }
    let child = command
        .stderr(Stdio::inherit())
        .spawn()
        .expect("spawn TEST_ONLY candidate once");
    let (_sender, committed) = mpsc::channel();
    let mut guard = TestWorker {
        child,
        committed,
        output_reader: None,
    };
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            if let Some(status) = guard.child.try_wait().expect("TEST_ONLY candidate status") {
                break status;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("bounded TEST_ONLY candidate once")
}

async fn verify_candidate_rate_limit_and_recovery(
    root: &Path,
    source: &Source,
    files: &TestFiles,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    before: &query_api::ProjectionQueryPage,
) {
    source.mode.store(1, Ordering::SeqCst);
    let count = source.requests.load(Ordering::SeqCst);
    assert!(!run_test_binary_once(root, source, files, None)
        .await
        .success());
    assert_eq!(source.requests.load(Ordering::SeqCst) - count, 4);
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let failed = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(failed.rows, before.rows);
    source.mode.store(2, Ordering::SeqCst);
    assert!(run_test_binary_once(root, source, files, None)
        .await
        .success());
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let recovered = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(recovered.rows, before.rows);
}

async fn verify_quality_rejection_preserves_projection(
    source: &Source,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    config: &EdgeConfig,
    cache: &mut ManagerProjectionFeedCache,
    before: &query_api::ProjectionQueryPage,
) {
    let observations = store.load_manager_feed_observations(scope).await.unwrap();
    let cached = cache.clone();
    for mode in [3, 4, 5, 6, 7] {
        source.mode.store(mode, Ordering::SeqCst);
        let failed = run_once_mode(config, false, &FeedClass::ALL, cache).await;
        match mode {
            3 | 4 | 6 => assert!(matches!(
                failed,
                Err(ManagerProjectionCommandError::SourceNotFresh)
            )),
            5 | 7 => assert!(matches!(
                failed,
                Err(ManagerProjectionCommandError::CycleMetadataDrift)
            )),
            _ => unreachable!(),
        }
        assert_eq!(
            store.load_manager_source_health(scope).await.unwrap(),
            ManagerSourceHealth::Degraded
        );
        let after = store
            .query_entities(
                scope,
                projection_core::ProjectionEntityKind::Order,
                &EntityQueryRequest::default(),
                codec,
                Utc::now(),
            )
            .await
            .unwrap();
        assert_eq!(after.epoch_id, before.epoch_id);
        assert_eq!(after.rows, before.rows);
        assert_eq!(
            store.load_manager_feed_observations(scope).await.unwrap(),
            observations
        );
        assert_eq!(cache.feeds.len(), cached.feeds.len());
        assert!(cached.feeds.iter().all(|(feed, snapshot)| cache
            .feeds
            .get(feed)
            .is_some_and(|current| Arc::ptr_eq(current, snapshot))));
    }
}

fn test_worker_config(source: &Source, files: &TestFiles) -> EdgeConfig {
    let mut config = EdgeConfig::from_environment().expect("TEST_ONLY config supplied by runner");
    config.source_origin = format!("https://{}", source.address);
    config.source_ca_file.clone_from(&files.ca);
    config.source_client_identity_file = Some(files.identity.clone());
    config.projection_database_url_file = Some(files.database_url.clone());
    config
}

async fn verify_cold_cache(
    config: &EdgeConfig,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    after_recovery: &query_api::ProjectionQueryPage,
) -> query_api::ProjectionQueryPage {
    let mut cold_cache = ManagerProjectionFeedCache::default();
    let cold = run_once_mode(config, false, &FeedClass::ALL, &mut cold_cache)
        .await
        .unwrap();
    assert_eq!(cold.report.record_count, 2);
    let after_cold = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(
        after_cold
            .rows
            .iter()
            .map(|row| &row.payload)
            .collect::<Vec<_>>(),
        after_recovery
            .rows
            .iter()
            .map(|row| &row.payload)
            .collect::<Vec<_>>()
    );
    after_cold
}

#[tokio::test]
async fn worker_http_pg_429_preserves_projection_and_cold_cache_recovers() {
    let (root, db_url) = test_target();
    let store = PgProjectionStore::connect(&db_url).await.unwrap();
    store.migrate().await.unwrap();
    let (source, files) = source_and_files(&root, &db_url);
    let config = test_worker_config(&source, &files);
    let mut cache = ManagerProjectionFeedCache::default();
    let baseline = run_once_mode(&config, false, &FeedClass::ALL, &mut cache)
        .await
        .unwrap();
    assert!(baseline.report.activated);
    assert_eq!(baseline.report.record_count, 2);
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager").unwrap(),
        "paper",
    )
    .unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let request = EntityQueryRequest::default();
    assert_eq!(
        store.load_manager_source_health(&scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let before = store
        .query_entities(
            &scope,
            projection_core::ProjectionEntityKind::Order,
            &request,
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(before.rows.len(), 2);
    verify_quality_rejection_preserves_projection(
        &source, &store, &scope, &codec, &config, &mut cache, &before,
    )
    .await;
    verify_rate_limit_preserves_projection(
        &source, &store, &scope, &codec, &config, &mut cache, &before,
    )
    .await;
    source.mode.store(2, Ordering::SeqCst);
    let recovered = run_once_mode(&config, false, &[FeedClass::Transactional], &mut cache)
        .await
        .unwrap();
    assert_eq!(recovered.report.record_count, 2);
    assert_eq!(recovered.refreshed_classes, FeedClass::ALL);
    assert_eq!(
        store.load_manager_source_health(&scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let after_recovery = store
        .query_entities(
            &scope,
            projection_core::ProjectionEntityKind::Order,
            &request,
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(after_recovery.rows.len(), 2);
    assert_ne!(after_recovery.rows, before.rows);
    assert!(after_recovery
        .rows
        .iter()
        .any(|row| row.payload.to_string().contains("99")));
    let after_cold = verify_cold_cache(&config, &store, &scope, &codec, &after_recovery).await;
    verify_candidate_rate_limit_and_recovery(
        &root,
        &source,
        &files,
        &store,
        &scope,
        &codec,
        &after_cold,
    )
    .await;
    // Start and stop two actual long-running worker processes, not just two
    // in-process cache values. Each must rebuild and seal a full baseline.
    verify_worker_restarts(
        &root, &db_url, &source, &files, &store, &scope, &codec, &config, after_cold,
    )
    .await;
}

#[tokio::test]
async fn worker_http_pg_json_limits_preserve_sealed_projection_and_recover() {
    let (root, db_url) = test_target();
    let store = PgProjectionStore::connect(&db_url).await.unwrap();
    store.migrate().await.unwrap();
    let (source, files) = source_and_files(&root, &db_url);
    let config = test_worker_config(&source, &files);
    let mut cache = ManagerProjectionFeedCache::default();
    assert!(
        run_once_mode(&config, false, &FeedClass::ALL, &mut cache)
            .await
            .unwrap()
            .report
            .activated
    );
    let scope = projection_core::ProjectionScope::new(
        execution_contracts::CanonicalId::parse("workspace_execution_manager").unwrap(),
        "paper",
    )
    .unwrap();
    let codec = CursorCodec::new(
        "TEST_ONLY.cursor",
        BTreeMap::from([("TEST_ONLY.cursor".to_owned(), vec![7_u8; 32])]),
        Duration::from_secs(300),
    )
    .unwrap();
    let query = || EntityQueryRequest::default();
    let before = store
        .query_entities(
            &scope,
            projection_core::ProjectionEntityKind::Order,
            &query(),
            &codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(before.rows.len(), 2);
    let bytes = cache.fact_json_bytes().unwrap();
    assert!(bytes > 1);
    let cases = [
        (
            ManagerMaterializationLimits::new(1, bytes * 2, bytes * 4).unwrap(),
            ManagerMaterializationError::RecordJsonLimitExceeded,
        ),
        (
            ManagerMaterializationLimits::new(1, bytes - 1, bytes * 4).unwrap(),
            ManagerMaterializationError::RetainedJsonLimitExceeded,
        ),
        (
            ManagerMaterializationLimits::new(bytes, bytes, bytes).unwrap(),
            ManagerMaterializationError::WorkingJsonLimitExceeded,
        ),
    ];
    for (limits, expected) in cases {
        let baseline_cache = cache.clone();
        let baseline_observations = store.load_manager_feed_observations(&scope).await.unwrap();
        let mut limited = test_worker_config(&source, &files);
        limited.manager_projection_materialization_limits = Some(limits);
        let outcome = run_once_mode(&limited, false, &FeedClass::ALL, &mut cache).await;
        assert!(
            matches!(outcome, Err(ManagerProjectionCommandError::Materialization(error)) if error == expected)
        );
        assert_eq!(
            store.load_manager_source_health(&scope).await.unwrap(),
            ManagerSourceHealth::Degraded
        );
        let after = store
            .query_entities(
                &scope,
                projection_core::ProjectionEntityKind::Order,
                &query(),
                &codec,
                Utc::now(),
            )
            .await
            .unwrap();
        assert_eq!(after.epoch_id, before.epoch_id);
        assert_eq!(after.rows, before.rows);
        assert_eq!(
            store.load_manager_feed_observations(&scope).await.unwrap(),
            baseline_observations
        );
        assert!(baseline_cache.feeds.iter().all(|(id, snapshot)| cache
            .feeds
            .get(id)
            .is_some_and(|current| Arc::ptr_eq(current, snapshot))));
        run_once_mode(&config, false, &FeedClass::ALL, &mut cache)
            .await
            .unwrap();
        assert_eq!(
            store.load_manager_source_health(&scope).await.unwrap(),
            ManagerSourceHealth::Healthy
        );
    }
    verify_candidate_json_limit(&root, &source, &files, &store, &scope, &codec, &before).await;
}

async fn verify_candidate_json_limit(
    root: &Path,
    source: &Source,
    files: &TestFiles,
    store: &PgProjectionStore,
    scope: &projection_core::ProjectionScope,
    codec: &CursorCodec,
    before: &query_api::ProjectionQueryPage,
) {
    let limits = ManagerMaterializationLimits::new(1, 1_000_000, 2_000_000).unwrap();
    assert!(!run_test_binary_once(root, source, files, Some(limits))
        .await
        .success());
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Degraded
    );
    let failed = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(failed.epoch_id, before.epoch_id);
    assert_eq!(failed.rows, before.rows);
    assert!(run_test_binary_once(root, source, files, None)
        .await
        .success());
    assert_eq!(
        store.load_manager_source_health(scope).await.unwrap(),
        ManagerSourceHealth::Healthy
    );
    let recovered = store
        .query_entities(
            scope,
            projection_core::ProjectionEntityKind::Order,
            &EntityQueryRequest::default(),
            codec,
            Utc::now(),
        )
        .await
        .unwrap();
    assert_eq!(recovered.rows, before.rows);
}
