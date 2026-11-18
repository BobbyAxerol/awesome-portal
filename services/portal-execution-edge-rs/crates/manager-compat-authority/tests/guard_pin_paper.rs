//! The Paper source-database identity pin (`scripts/epg10-08/guard-pin/pin.paper.json`) against the catalogue answers of the Manager images.
//! The pin file tests always run. The catalogue tests read the corpus generated from the REAL Manager facade code (see
//! `wire_shape_corpus.rs`) and are skipped unless `EDGE_WIRE_CORPUS` is set.

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

const PROFILE: &str = "PAPER_BINANCE_USDM";
const PIN: &[u8] = include_bytes!("../../../../../scripts/epg10-08/guard-pin/pin.paper.json");
const T1_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/manager-catalogue-release.json"
);

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn release_authority() -> ManagerCompatibilityAuthority {
    ManagerCompatibilityAuthority::from_pinned_release(
        T1_RELEASE,
        &digest(T1_RELEASE),
        DeploymentEnvironment::Paper,
        PROFILE,
    )
    .unwrap()
}

fn pinned() -> ManagerCompatibilityAuthority {
    release_authority()
        .with_source_identity_pin(PIN, &digest(PIN), DeploymentEnvironment::Paper, PROFILE)
        .unwrap()
}

#[test]
fn the_paper_pin_file_loads_only_for_paper_and_its_profile_and_exact_bytes() {
    let pin: Value = serde_json::from_slice(PIN).unwrap();
    assert_eq!(pin["environment"], "paper");
    assert_eq!(pin["profile_id"], PROFILE);
    assert_eq!(pin["database_name"], "trading_system");
    assert_eq!(pin["minimum_schema_ledger_rows"], 175);
    assert_eq!(pin["source_identity_required"], true);
    let loaded = |bytes: &[u8], pin_digest: &str, env, profile: &str| {
        release_authority().with_source_identity_pin(bytes, pin_digest, env, profile)
    };
    assert!(loaded(PIN, &digest(PIN), DeploymentEnvironment::Paper, PROFILE).is_ok());
    // Another environment or profile, a different digest, an empty or oversized file all refuse (the Edge then fails to start).
    for refusal in [
        loaded(PIN, &digest(PIN), DeploymentEnvironment::Sandbox, PROFILE),
        loaded(PIN, &digest(PIN), DeploymentEnvironment::Live, PROFILE),
        loaded(PIN, &digest(PIN), DeploymentEnvironment::Paper, "PAPER_OKX"),
        loaded(
            PIN,
            &digest(b"other"),
            DeploymentEnvironment::Paper,
            PROFILE,
        ),
        loaded(b"", &digest(b""), DeploymentEnvironment::Paper, PROFILE),
        loaded(
            &vec![b' '; 65_537],
            &digest(&vec![b' '; 65_537]),
            DeploymentEnvironment::Paper,
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
        ("profile_id", "SANDBOX_BINANCE_USDM"),
        ("environment", "live"),
    ] {
        let mut changed: Value = serde_json::from_slice(PIN).unwrap();
        changed[member] = json!(value);
        let bytes = serde_json::to_vec(&changed).unwrap();
        assert!(matches!(
            loaded(
                &bytes,
                &digest(&bytes),
                DeploymentEnvironment::Paper,
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
        DeploymentEnvironment::Paper,
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
        DeploymentEnvironment::Paper,
        PROFILE
    )
    .is_err());
}

fn catalogue_body(corpus: &str, generation: &str, mutate: impl FnOnce(&mut Value)) -> Vec<u8> {
    let path = PathBuf::from(corpus)
        .join(generation)
        .join("t1_67")
        .join("_catalogue.json");
    let mut doc: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    mutate(&mut doc["body"]["data"]);
    serde_json::to_vec(&doc["body"]).unwrap()
}

fn verdict(authority: &ManagerCompatibilityAuthority, body: &[u8]) -> String {
    let bound = authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Paper,
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
fn the_paper_pin_against_the_real_catalogue_answer_shapes_of_the_manager_images() {
    let Ok(corpus) = std::env::var("EDGE_WIRE_CORPUS") else {
        eprintln!("EDGE_WIRE_CORPUS not set: guard pin corpus test skipped");
        return;
    };
    let authority = pinned();
    let cases: [(&str, &str, Mutation, &str); 10] = [
        (
            "matching identity (pinned name, pinned OID hash, rows 175)",
            "new",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
            },
            "pass",
        ),
        (
            "ledger grew to 176 (a PM bundle)",
            "new",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
                data["source_identity"]["schema_ledger_rows"] = json!(176);
            },
            "pass",
        ),
        (
            "ledger far above (5000)",
            "new",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
                data["source_identity"]["schema_ledger_rows"] = json!(5000);
            },
            "pass",
        ),
        (
            "wrong database name",
            "new",
            |data| {
                data["source_identity"]["database_name"] = json!("live_data_executor");
            },
            "DATABASE_NAME",
        ),
        ("right name, wrong OID hash", "new", |_| {}, "DATABASE_OID"),
        (
            "ledger below the minimum (174)",
            "new",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
                data["source_identity"]["schema_ledger_rows"] = json!(174);
            },
            "LEDGER_BELOW_MINIMUM",
        ),
        (
            "ledger not readable",
            "new",
            |data| {
                data["source_identity"]["database_oid_sha256"] =
                    json!("5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b");
                data["source_identity"]["schema_ledger_rows"] = Value::Null;
                data["source_identity"]["latest_ledger_version"] = Value::Null;
                data["source_identity"]["ledger_status"] = json!("NOT_READABLE");
            },
            "LEDGER_NOT_READABLE",
        ),
        (
            "identity member missing (member removed from the new answer)",
            "new",
            |data| {
                data.as_object_mut().unwrap().remove("source_identity");
            },
            "IDENTITY_ABSENT",
        ),
        (
            "legacy Manager answer (old image, no member)",
            "old",
            |_| {},
            "IDENTITY_ABSENT",
        ),
        (
            "name and OID both wrong: the name is checked first",
            "new",
            |data| {
                data["source_identity"]["database_name"] = json!("trading_system_sandbox");
            },
            "DATABASE_NAME",
        ),
    ];
    for (label, generation, mutate, expected) in cases {
        let body = catalogue_body(&corpus, generation, mutate);
        let got = verdict(&authority, &body);
        println!("GUARD case={label:70} expected={expected:22} got={got}");
        assert_eq!(got, expected, "{label}");
    }
}
