use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};

const CONTRACT_DIRECTORY: &str = "../../contracts/manager-v2-paper-read-v1";
const EXPECTED_FILES: [&str; 15] = [
    "RUST_DTO_HANDOFF.md",
    "manager-v2-fixtures.json",
    "manager-v2.openapi.json",
    "owner-publication/README.md",
    "owner-publication/manager-v2-private-paper-publication.json",
    "owner-publication/n11-v1-acceptance.json",
    "owner-publication/n11-v1-capability-freeze.json",
    "owner-publication/n11-v1-fixture-index.json",
    "owner-publication/owner-publication.manifest.json",
    "owner-publication/semantic-rulings-at-freeze.json",
    "owner-runtime-overlay/README.md",
    "owner-runtime-overlay/manager-v2-runtime-qualification.json",
    "owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json",
    "owner-runtime-overlay/qualification-result.json",
    "source-proxy-manager-v2-locations.conf.template",
];
const EXPECTED_ROUTES: [&str; 5] = [
    "/portal/execution/v2/manager/catalog",
    "/portal/execution/v2/manager/capabilities",
    "/portal/execution/v2/manager/projections/{kind}",
    "/portal/execution/v2/manager/records/{schema}/{relation}",
    "/portal/execution/v2/manager/records/{schema}/{relation}/{key}",
];

#[derive(Deserialize)]
struct ContractLock {
    schema_version: String,
    status: String,
    contract_revision: String,
    files: BTreeMap<String, String>,
}

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn read_json(path: &Path) -> Value {
    serde_json::from_slice(&fs::read(path).unwrap_or_else(|_| panic!("read {}", path.display())))
        .unwrap_or_else(|_| panic!("parse {}", path.display()))
}

fn required_str<'a>(document: &'a Value, path: &[&str]) -> &'a str {
    let mut value = document;
    for key in path {
        value = &value[*key];
    }
    value
        .as_str()
        .unwrap_or_else(|| panic!("missing string at {}", path.join(".")))
}

fn required_u64(document: &Value, path: &[&str]) -> u64 {
    let mut value = document;
    for key in path {
        value = &value[*key];
    }
    value
        .as_u64()
        .unwrap_or_else(|| panic!("missing integer at {}", path.join(".")))
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let contract_dir = manifest_dir.join(CONTRACT_DIRECTORY);
    let lock_path = contract_dir.join("contract-pack.lock.json");
    println!("cargo:rerun-if-changed={}", lock_path.display());

    let lock: ContractLock =
        serde_json::from_slice(&fs::read(&lock_path).expect("read Manager-v2 contract pack lock"))
            .expect("parse Manager-v2 contract pack lock");
    assert_eq!(
        lock.schema_version,
        "portal.execution.manager-v2-paper-read.import-lock.v1"
    );
    assert_eq!(
        lock.status,
        "PRIVATE_PAPER_ROUTE_QUALIFIED_NO_PRODUCT_CONSUMER"
    );
    assert_eq!(
        lock.contract_revision,
        "trading-system.portal-execution.manager-v2.runtime.v1"
    );
    assert_eq!(lock.files.len(), EXPECTED_FILES.len());
    for name in EXPECTED_FILES {
        let path = contract_dir.join(name);
        println!("cargo:rerun-if-changed={}", path.display());
        let actual = digest(&fs::read(&path).unwrap_or_else(|_| panic!("read {name}")));
        assert_eq!(lock.files.get(name), Some(&actual), "{name} digest drifted");
    }

    validate_source_dark_openapi(&contract_dir);
    let publication = validate_current_publication(&contract_dir);
    validate_runtime_overlay(&contract_dir, &lock.files, &publication);
    validate_dto_handoff(&contract_dir);

    let maximum_page_rows = required_u64(&publication, &["bounds", "maximum_page_rows"]);
    let maximum_response_bytes = required_u64(&publication, &["bounds", "maximum_response_bytes"]);
    assert_eq!(maximum_page_rows, 200);
    assert_eq!(maximum_response_bytes, 1_048_576);
    let generated = format!(
        "pub const RUNTIME_CONTRACT_REVISION: &str = {:?};\n\
         pub const SOURCE_DARK_CONTRACT_REVISION: &str = \"trading-system.portal-execution.manager-v2.v1\";\n\
         pub const PROFILE_ID: &str = \"PAPER_BINANCE_USDM\";\n\
         pub const MAXIMUM_PAGE_ROWS: u16 = 200;\n\
         pub const MAXIMUM_RESPONSE_BYTES: usize = 1_048_576;\n",
        required_str(&publication, &["contract_revision"]),
    );
    let output =
        PathBuf::from(env::var("OUT_DIR").expect("output directory")).join("contract_identity.rs");
    fs::write(output, generated).expect("write Manager-v2 contract identity");
}

fn validate_source_dark_openapi(contract_dir: &Path) {
    let document = read_json(&contract_dir.join("manager-v2.openapi.json"));
    assert_eq!(
        required_str(&document, &["x-contract-revision"]),
        "trading-system.portal-execution.manager-v2.v1"
    );
    let paths = document["paths"]
        .as_object()
        .expect("Manager-v2 OpenAPI paths");
    assert_eq!(paths.len(), EXPECTED_ROUTES.len());
    for route in EXPECTED_ROUTES {
        let methods = paths[route].as_object().expect("Manager-v2 OpenAPI route");
        assert_eq!(methods.len(), 1, "{route} method surface widened");
        assert!(methods.contains_key("get"), "{route} is not GET-only");
    }
}

fn validate_current_publication(contract_dir: &Path) -> Value {
    let publication = read_json(
        &contract_dir.join("owner-publication/manager-v2-private-paper-publication.json"),
    );
    assert_eq!(
        required_str(&publication, &["status"]),
        "PRIVATE_PAPER_ROUTE_QUALIFIED"
    );
    assert_eq!(
        required_str(&publication, &["contract_revision"]),
        "trading-system.portal-execution.manager-v2.runtime.v1"
    );
    assert_eq!(
        required_str(&publication, &["scope", "profile_id"]),
        "PAPER_BINANCE_USDM"
    );
    for scope in [
        "public_listener",
        "sandbox",
        "canary",
        "live",
        "command",
        "redis",
        "broker",
        "cli_execution",
        "event_sse_replay",
        "portal_database_dsn_or_role",
    ] {
        assert_eq!(publication["scope"][scope], false, "{scope} widened");
    }
    let operations = publication["operations"]
        .as_array()
        .expect("Manager-v2 publication operations");
    assert_eq!(operations.len(), EXPECTED_ROUTES.len());
    let paths = operations
        .iter()
        .map(|operation| {
            assert_eq!(operation["method"], "GET");
            operation["path_template"]
                .as_str()
                .expect("Manager-v2 operation path")
        })
        .collect::<Vec<_>>();
    for route in EXPECTED_ROUTES {
        assert!(paths.contains(&route), "missing approved route {route}");
    }
    publication
}

fn validate_runtime_overlay(
    contract_dir: &Path,
    lock_files: &BTreeMap<String, String>,
    publication: &Value,
) {
    let manifest = read_json(
        &contract_dir.join("owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json"),
    );
    assert_eq!(
        required_str(&manifest, &["contract_revision"]),
        "trading-system.portal-execution.manager-v2.runtime.v1"
    );
    assert_eq!(
        required_str(&manifest, &["status"]),
        "OWNER_LOOPBACK_QUALIFICATION_PASSED_CLEANED_UP"
    );
    assert_eq!(
        publication["owner_loopback_overlay"]["manifest_sha256"].as_str(),
        lock_files
            .get("owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json")
            .map(String::as_str)
    );
    for (name, digest_value) in manifest["files"]
        .as_object()
        .expect("Manager-v2 overlay manifest files")
    {
        assert_eq!(
            lock_files
                .get(&format!("owner-runtime-overlay/{name}"))
                .map(String::as_str),
            digest_value.as_str(),
            "runtime overlay member drifted: {name}"
        );
    }
    let overlay = read_json(
        &contract_dir.join("owner-runtime-overlay/manager-v2-runtime-qualification.json"),
    );
    assert_eq!(
        required_str(&overlay, &["base_source_dark_contract", "revision"]),
        "trading-system.portal-execution.manager-v2.v1"
    );
    assert_eq!(
        required_str(&overlay, &["profile", "profile_id"]),
        "PAPER_BINANCE_USDM"
    );
    assert_eq!(
        required_str(
            &overlay,
            &["wire_overlay", "manager_record_required_addition"]
        ),
        "record_key"
    );
    assert_eq!(
        required_u64(&overlay, &["limits", "maximum_page_rows"]),
        200
    );
    assert_eq!(
        required_u64(&overlay, &["limits", "maximum_response_bytes"]),
        1_048_576
    );
}

fn validate_dto_handoff(contract_dir: &Path) {
    let handoff = fs::read_to_string(contract_dir.join("RUST_DTO_HANDOFF.md"))
        .expect("read Manager-v2 Rust DTO handoff");
    for marker in [
        "MANAGER_V2_CONTRACT_VERSION",
        "OpaqueCursor",
        "CatalogueDigest",
        "ManagerEnvelope",
        "ManagerUnavailable",
        "ManagerValue",
    ] {
        assert!(
            handoff.contains(marker),
            "Rust DTO handoff missing {marker}"
        );
    }
}
