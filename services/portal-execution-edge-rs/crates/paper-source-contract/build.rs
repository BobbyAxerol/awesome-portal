use std::{collections::BTreeMap, env, fs, path::PathBuf};

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};

const CONTRACT_DIRECTORY: &str = "../../contracts/d4-paper-read-v1";
const EXPECTED_FILES: [&str; 5] = [
    "PORTAL_PAPER_READ_FACADE_GUIDE.md",
    "portal-paper-read-d4-v1.allowlist.txt",
    "portal-paper-read-d4-v1.capability.json",
    "portal-paper-read-d4-v1.json",
    "source-proxy-d4-read-locations.conf.template",
];
const EXPECTED_ROUTES: [&str; 4] = ["/v1/events", "/v1/fills", "/v1/orders", "/v1/positions"];

#[derive(Debug, Deserialize)]
struct ContractLock {
    contract_revision: String,
    source_runtime_acceptance_commit: String,
    source_head_observed_at_import: String,
    files: BTreeMap<String, String>,
}

fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let contract_dir = manifest_dir.join(CONTRACT_DIRECTORY);
    let lock_path = contract_dir.join("contract-pack.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());

    let lock: ContractLock =
        serde_json::from_slice(&fs::read(&lock_path).expect("read D4 contract lock"))
            .expect("parse D4 contract lock");
    assert_eq!(lock.contract_revision, "d4.paper-read.v1");
    assert_eq!(lock.files.len(), EXPECTED_FILES.len());

    for name in EXPECTED_FILES {
        let path = contract_dir.join(name);
        println!("cargo:rerun-if-changed={}", path.display());
        let actual = digest(&fs::read(&path).unwrap_or_else(|_| panic!("read {name}")));
        assert_eq!(lock.files.get(name), Some(&actual), "{name} digest drifted");
    }

    validate_openapi(&contract_dir);
    validate_capability(&contract_dir);
    validate_allowlist(&contract_dir);
    validate_proxy_template(&contract_dir);

    let generated = format!(
        "pub const SOURCE_RUNTIME_ACCEPTANCE_COMMIT: &str = {:?};\n\
         pub const SOURCE_HEAD_OBSERVED_AT_IMPORT: &str = {:?};\n",
        lock.source_runtime_acceptance_commit, lock.source_head_observed_at_import
    );
    let output =
        PathBuf::from(env::var("OUT_DIR").expect("output directory")).join("contract_identity.rs");
    fs::write(output, generated).expect("write D4 contract identity");
}

fn validate_openapi(contract_dir: &std::path::Path) {
    let document: Value = serde_json::from_slice(
        &fs::read(contract_dir.join("portal-paper-read-d4-v1.json")).expect("read D4 OpenAPI"),
    )
    .expect("parse D4 OpenAPI");
    assert_eq!(document["info"]["version"], "d4.paper-read.v1");
    let paths = document["paths"].as_object().expect("D4 OpenAPI paths");
    assert_eq!(paths.len(), EXPECTED_ROUTES.len());
    for route in EXPECTED_ROUTES {
        let methods = paths[route].as_object().expect("D4 OpenAPI route");
        assert_eq!(methods.len(), 1, "{route} method surface widened");
        assert!(methods.contains_key("get"), "{route} is not GET-only");
    }
}

fn validate_capability(contract_dir: &std::path::Path) {
    let document: Value = serde_json::from_slice(
        &fs::read(contract_dir.join("portal-paper-read-d4-v1.capability.json"))
            .expect("read D4 capability"),
    )
    .expect("parse D4 capability");
    assert_eq!(document["contract_revision"], "d4.paper-read.v1");
    assert_eq!(document["scope"]["scope_id"], "PAPER_BINANCE_USDM");
    assert_eq!(document["scope"]["mode"], "paper");
    assert_eq!(document["scope"]["venue"], "BINANCE");
    assert_eq!(document["identity"]["mandatory"], true);
    assert_eq!(document["transport"]["public_listener"], false);
    for authority in [
        "portal_database",
        "redis",
        "cli",
        "broker",
        "command",
        "mutation",
        "live",
        "canary",
    ] {
        assert_eq!(
            document["authority"][authority], false,
            "{authority} widened"
        );
    }
}

fn validate_allowlist(contract_dir: &std::path::Path) {
    let raw = fs::read_to_string(contract_dir.join("portal-paper-read-d4-v1.allowlist.txt"))
        .expect("read D4 allowlist");
    let actual = raw.lines().collect::<Vec<_>>();
    let expected = EXPECTED_ROUTES
        .into_iter()
        .map(|route| format!("GET {route}"))
        .collect::<Vec<_>>();
    assert_eq!(actual, expected, "D4 allowlist drifted");
}

fn validate_proxy_template(contract_dir: &std::path::Path) {
    let raw = fs::read_to_string(contract_dir.join("source-proxy-d4-read-locations.conf.template"))
        .expect("read D4 Source Proxy template");
    assert_eq!(
        raw.matches("location = /v1/").count(),
        EXPECTED_ROUTES.len()
    );
    assert_eq!(
        raw.matches("proxy_pass_request_headers off;").count(),
        EXPECTED_ROUTES.len()
    );
    assert_eq!(
        raw.matches("proxy_pass http://127.0.0.1:8011/v1/").count(),
        EXPECTED_ROUTES.len()
    );
    assert!(!raw.lines().any(|line| {
        let line = line.trim();
        !line.starts_with('#') && (line == "location / {" || line == "location = / {")
    }));
}
