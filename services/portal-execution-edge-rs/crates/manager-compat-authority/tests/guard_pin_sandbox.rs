//! The SANDBOX source-database identity pin (`scripts/epg10-08/sandbox-switch/pin.sandbox.json`) against the 106-relation Sandbox release and the catalogue answers of the
//! identity Manager image (image 8d4765a4, its own facade code, stub source with the live identity: database `trading_system_sandbox`, OID 75754038, ledger 124 rows).
//! The pin file tests always run. The catalogue tests read the corpus `sandbox_union106_live` under `EDGE_WIRE_CORPUS_SANDBOX` and are skipped unless it is set.

use std::{fs, path::PathBuf};

use manager_compat_authority::{
    AuthorityError, DeploymentEnvironment, ManagerCompatibilityAuthority, ManagerRequestContext,
    DELEGATED_RESOURCE,
};
use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, PageLimit, RUNTIME_CONTRACT_REVISION,
};
use serde_json::{json, Value};
use sha2::{Digest as _, Sha256};

type Mutation = fn(&mut Value);

const PROFILE: &str = "SANDBOX_BINANCE_USDM";
const PIN: &[u8] =
    include_bytes!("../../../../../scripts/epg10-08/sandbox-switch/pin.sandbox.json");
const PAPER_PIN: &[u8] = include_bytes!("../../../../../scripts/epg10-08/guard-pin/pin.paper.json");
const RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-union106/manager-catalogue-release.json"
);
const OID_HASH: &str = "3455fa708d1b9ad728b8c44f400b93f178468a33511eac2db099e01a8edbbb5f";

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn release_authority() -> ManagerCompatibilityAuthority {
    ManagerCompatibilityAuthority::from_pinned_release(
        RELEASE,
        &digest(RELEASE),
        DeploymentEnvironment::Sandbox,
        PROFILE,
    )
    .unwrap()
}

fn pinned() -> ManagerCompatibilityAuthority {
    release_authority()
        .with_source_identity_pin(PIN, &digest(PIN), DeploymentEnvironment::Sandbox, PROFILE)
        .unwrap()
}

#[test]
fn the_sandbox_pin_file_loads_only_for_sandbox_and_its_profile_and_exact_bytes() {
    let pin: Value = serde_json::from_slice(PIN).unwrap();
    assert_eq!(pin["environment"], "sandbox");
    assert_eq!(pin["profile_id"], PROFILE);
    assert_eq!(pin["database_name"], "trading_system_sandbox");
    assert_eq!(pin["minimum_schema_ledger_rows"], 124);
    assert_eq!(pin["source_identity_required"], true);
    // The OID hash is the sha256 of the decimal OID text, as the Manager computes it (`build_source_identity`); 75754038 was read from pg_database on 2026-11-18.
    assert_eq!(pin["database_oid_sha256"], OID_HASH);
    assert_eq!(format!("{:x}", Sha256::digest(b"75754038")), OID_HASH);
    let loaded = |bytes: &[u8], pin_digest: &str, env, profile: &str| {
        release_authority().with_source_identity_pin(bytes, pin_digest, env, profile)
    };
    assert!(loaded(PIN, &digest(PIN), DeploymentEnvironment::Sandbox, PROFILE).is_ok());
    // Another environment or profile, a different digest, an empty or oversized file all refuse (the Edge then fails to start).
    for refusal in [
        loaded(PIN, &digest(PIN), DeploymentEnvironment::Paper, PROFILE),
        loaded(PIN, &digest(PIN), DeploymentEnvironment::Live, PROFILE),
        loaded(
            PIN,
            &digest(PIN),
            DeploymentEnvironment::Sandbox,
            "SANDBOX_OKX",
        ),
        loaded(
            PIN,
            &digest(PIN),
            DeploymentEnvironment::Sandbox,
            "PAPER_BINANCE_USDM",
        ),
        loaded(
            PIN,
            &digest(b"other"),
            DeploymentEnvironment::Sandbox,
            PROFILE,
        ),
        loaded(b"", &digest(b""), DeploymentEnvironment::Sandbox, PROFILE),
        loaded(
            &vec![b' '; 65_537],
            &digest(&vec![b' '; 65_537]),
            DeploymentEnvironment::Sandbox,
            PROFILE,
        ),
        // The Paper pin (other database, other profile) can never be loaded for the Sandbox deployment.
        loaded(
            PAPER_PIN,
            &digest(PAPER_PIN),
            DeploymentEnvironment::Sandbox,
            PROFILE,
        ),
    ] {
        assert!(matches!(
            refusal,
            Err(AuthorityError::InvalidSourceIdentityPin)
        ));
    }
    // A pin whose profile or environment member differs from the deployment it is loaded for refuses even with a correct digest.
    for (member, value) in [
        ("profile_id", "PAPER_BINANCE_USDM"),
        ("environment", "paper"),
    ] {
        let mut changed: Value = serde_json::from_slice(PIN).unwrap();
        changed[member] = json!(value);
        let bytes = serde_json::to_vec(&changed).unwrap();
        assert!(matches!(
            loaded(
                &bytes,
                &digest(&bytes),
                DeploymentEnvironment::Sandbox,
                PROFILE
            ),
            Err(AuthorityError::InvalidSourceIdentityPin)
        ));
    }
    // An unknown member, or a pin without `source_identity_required`, refuses (no default).
    let mut widened: Value = serde_json::from_slice(PIN).unwrap();
    widened["unexpected"] = json!(true);
    let widened = serde_json::to_vec(&widened).unwrap();
    assert!(loaded(
        &widened,
        &digest(&widened),
        DeploymentEnvironment::Sandbox,
        PROFILE
    )
    .is_err());
    let mut missing: Value = serde_json::from_slice(PIN).unwrap();
    missing
        .as_object_mut()
        .unwrap()
        .remove("source_identity_required");
    let missing = serde_json::to_vec(&missing).unwrap();
    assert!(loaded(
        &missing,
        &digest(&missing),
        DeploymentEnvironment::Sandbox,
        PROFILE
    )
    .is_err());
}

fn catalogue_body(corpus: &str, mutate: impl FnOnce(&mut Value)) -> Vec<u8> {
    let path = PathBuf::from(corpus)
        .join("sandbox_union106_live")
        .join("_catalogue.json");
    let mut doc: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    mutate(&mut doc["body"]["data"]);
    serde_json::to_vec(&doc["body"]).unwrap()
}

fn verdict(authority: &ManagerCompatibilityAuthority, body: &[u8]) -> String {
    let bound = authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Sandbox,
            profile_id: PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap();
    let ManagerPayload::Catalogue(envelope) =
        decode_success_for_profile(&bound.catalogue_request(), body, PROFILE).unwrap()
    else {
        panic!("expected catalogue")
    };
    let catalogue = envelope.into_data();
    let page = bound.relation_page_request(
        &catalogue,
        "public.orders",
        None,
        PageLimit::new(1).unwrap(),
    );
    match (bound.validate_catalogue(&catalogue), page) {
        (Ok(()), Ok(_)) => "pass".to_owned(),
        (Err(error), Err(page_error)) => {
            assert_eq!(
                error.to_string(),
                page_error.to_string(),
                "page requests fail the same way"
            );
            error.source_identity_detail().map_or_else(
                || format!("other:{error}"),
                |(reason, ..)| reason.to_owned(),
            )
        }
        other => panic!("catalogue and page verdicts disagree: {other:?}"),
    }
}

#[test]
fn the_sandbox_pin_against_the_real_catalogue_answer_shape_of_the_identity_manager() {
    let Ok(corpus) = std::env::var("EDGE_WIRE_CORPUS_SANDBOX") else {
        eprintln!("EDGE_WIRE_CORPUS_SANDBOX not set: sandbox guard pin corpus test skipped");
        return;
    };
    let authority = pinned();
    let cases: [(&str, Mutation, &str); 11] = [
        (
            "matching identity (pinned name, pinned OID hash, rows 124)",
            |_| {},
            "pass",
        ),
        (
            "ledger grew to 125 (a new migration row)",
            |data| data["source_identity"]["schema_ledger_rows"] = json!(125),
            "pass",
        ),
        (
            "ledger far above (5000)",
            |data| data["source_identity"]["schema_ledger_rows"] = json!(5000),
            "pass",
        ),
        (
            "Paper database name (trading_system)",
            |data| data["source_identity"]["database_name"] = json!("trading_system"),
            "DATABASE_NAME",
        ),
        (
            "legacy database name (live_data_executor)",
            |data| data["source_identity"]["database_name"] = json!("live_data_executor"),
            "DATABASE_NAME",
        ),
        (
            "right name, the Paper OID hash",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
            },
            "DATABASE_OID",
        ),
        (
            "ledger below the minimum (123)",
            |data| data["source_identity"]["schema_ledger_rows"] = json!(123),
            "LEDGER_BELOW_MINIMUM",
        ),
        (
            "ledger as it was before the nine read indexes (122)",
            |data| data["source_identity"]["schema_ledger_rows"] = json!(122),
            "LEDGER_BELOW_MINIMUM",
        ),
        (
            "ledger not readable",
            |data| {
                data["source_identity"]["schema_ledger_rows"] = Value::Null;
                data["source_identity"]["latest_ledger_version"] = Value::Null;
                data["source_identity"]["ledger_status"] = json!("NOT_READABLE");
            },
            "LEDGER_NOT_READABLE",
        ),
        (
            "identity member missing (a Manager without the member)",
            |data| {
                data.as_object_mut().unwrap().remove("source_identity");
            },
            "IDENTITY_ABSENT",
        ),
        (
            "name and OID both wrong: the name is checked first",
            |data| {
                data["source_identity"]["database_name"] = json!("trading_system");
                data["source_identity"]["database_oid_sha256"] = json!("0".repeat(64));
            },
            "DATABASE_NAME",
        ),
    ];
    for (label, mutate, expected) in cases {
        let body = catalogue_body(&corpus, mutate);
        let got = verdict(&authority, &body);
        println!("GUARD case={label:70} expected={expected:22} got={got}");
        assert_eq!(got, expected, "{label}");
    }
}
