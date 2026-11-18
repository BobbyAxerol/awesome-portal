//! Sandbox switch package (`scripts/epg10-08/sandbox-switch/`): the release files for `SANDBOX_BINANCE_USDM` made by the real catalogue tool load in the
//! census v2 loader for the Sandbox environment only, and, when `EDGE_WIRE_CORPUS_SANDBOX` points at the corpus emitted by the identity Manager image's own
//! facade code with the sandbox catalogue, every wire shape decodes and passes the authority; the draft sandbox pin passes that catalogue and the Paper pin cannot be loaded for Sandbox.

use std::{collections::BTreeSet, fs, path::PathBuf};

use manager_compat_authority::{
    DeploymentEnvironment, ManagerCompatibilityAuthority, ManagerRequestContext, DELEGATED_RESOURCE,
};
use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, PageLimit, RUNTIME_CONTRACT_REVISION,
};
use serde_json::Value;
use sha2::{Digest as _, Sha256};

const PROFILE: &str = "SANDBOX_BINANCE_USDM";
const R67: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-t1t2five67/manager-catalogue-release.json"
);
const R54: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-t2five54.release.json"
);
const R49: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-base49.release.json"
);
const PAPER_R67: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/manager-catalogue-release.json"
);
const PAPER_PIN: &[u8] = include_bytes!("../../../../../scripts/epg10-08/guard-pin/pin.paper.json");
const SANDBOX_PIN: &[u8] =
    include_bytes!("../../../../../scripts/epg10-08/sandbox-switch/pin.sandbox.DRAFT.json");

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn names(bytes: &[u8]) -> BTreeSet<String> {
    let manifest: Value = serde_json::from_slice(bytes).unwrap();
    manifest["relations"]
        .as_array()
        .unwrap()
        .iter()
        .map(|name| name.as_str().unwrap().to_owned())
        .collect()
}

fn load(
    bytes: &[u8],
    env: DeploymentEnvironment,
    profile: &str,
) -> Result<ManagerCompatibilityAuthority, manager_compat_authority::AuthorityError> {
    ManagerCompatibilityAuthority::from_pinned_release(bytes, &digest(bytes), env, profile)
}

#[test]
fn the_sandbox_releases_load_for_sandbox_only_and_have_the_expected_relations() {
    for (bytes, count) in [(R49, 49), (R54, 54), (R67, 67)] {
        assert_eq!(
            load(bytes, DeploymentEnvironment::Sandbox, PROFILE)
                .unwrap()
                .approved_relation_count(),
            count
        );
        assert!(load(bytes, DeploymentEnvironment::Paper, "PAPER_BINANCE_USDM").is_err());
        assert!(load(bytes, DeploymentEnvironment::Sandbox, "SANDBOX_OKX").is_err());
        assert!(load(bytes, DeploymentEnvironment::Live, "LIVE_BINANCE_USDM").is_err());
    }
    assert!(names(R49).is_subset(&names(R54)) && names(R54).is_subset(&names(R67)));
    assert_eq!(
        names(R67),
        names(PAPER_R67),
        "same relation list as the Paper 67"
    );
    for gap in [
        "public.dnse_trading_tokens",
        "public.venue_credentials",
        "public.engine_authority_decisions",
    ] {
        assert!(!names(R67).contains(gap), "{gap} must never be listed");
    }
    // The Paper pin cannot be loaded for the Sandbox environment, and the draft sandbox pin loads for it.
    let pinned = |pin: &[u8]| {
        load(R67, DeploymentEnvironment::Sandbox, PROFILE)
            .unwrap()
            .with_source_identity_pin(pin, &digest(pin), DeploymentEnvironment::Sandbox, PROFILE)
    };
    assert!(pinned(PAPER_PIN).is_err());
    assert!(pinned(SANDBOX_PIN).is_ok());
}

#[test]
fn every_sandbox_wire_shape_decodes_and_the_draft_sandbox_pin_passes_that_catalogue() {
    let Ok(corpus) = std::env::var("EDGE_WIRE_CORPUS_SANDBOX") else {
        eprintln!("EDGE_WIRE_CORPUS_SANDBOX not set: sandbox corpus test skipped");
        return;
    };
    let dir = PathBuf::from(corpus).join("sandbox_t1_67");
    let read = |file: &str| -> Vec<u8> {
        let doc: Value = serde_json::from_slice(&fs::read(dir.join(file)).unwrap()).unwrap();
        serde_json::to_vec(&doc["body"]).unwrap()
    };
    let authority = load(R67, DeploymentEnvironment::Sandbox, PROFILE).unwrap();
    let bound = authority
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Sandbox,
            profile_id: PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap();
    let ManagerPayload::Catalogue(envelope) = decode_success_for_profile(
        &bound.catalogue_request(),
        &read("_catalogue.json"),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected catalogue")
    };
    let catalogue = envelope.into_data();
    bound.validate_catalogue(&catalogue).unwrap();
    let identity = catalogue.source_identity().expect("identity member");
    println!(
        "SANDBOX identity: {} rows={:?}",
        identity.database_name(),
        identity.schema_ledger_rows()
    );
    assert_eq!(identity.database_name(), "trading_system_sandbox");
    let ManagerPayload::Capabilities(caps) = decode_success_for_profile(
        &bound.capabilities_request(),
        &read("_capabilities.json"),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected capabilities")
    };
    bound.validate_capabilities(caps.data()).unwrap();
    let mut decoded = 0;
    let mut snapshots = Vec::new();
    for relation in names(R67) {
        for case in ["page", "empty", "more"] {
            let request = bound
                .relation_page_request(&catalogue, &relation, None, PageLimit::new(1).unwrap())
                .unwrap();
            let body = read(&format!("{relation}.{case}.json"));
            let ManagerPayload::RelationRecords(page) =
                decode_success_for_profile(&request, &body, PROFILE)
                    .unwrap_or_else(|e| panic!("{relation} {case}: {e}"))
            else {
                panic!("{relation} {case}: wrong payload")
            };
            if page.meta().source_snapshot().is_some() && case == "page" {
                snapshots.push(relation.clone());
            }
            decoded += 1;
        }
    }
    println!("SANDBOX decoded {decoded} pages; snapshot on {snapshots:?}");
    assert_eq!(decoded, 67 * 3);
    assert_eq!(snapshots, ["public.account_balances", "public.portfolios"]);
    // The identity pin: the draft sandbox pin passes this catalogue; the Paper pin is refused at load for the Sandbox environment.
    let pinned = load(R67, DeploymentEnvironment::Sandbox, PROFILE)
        .unwrap()
        .with_source_identity_pin(
            SANDBOX_PIN,
            &digest(SANDBOX_PIN),
            DeploymentEnvironment::Sandbox,
            PROFILE,
        )
        .unwrap();
    let pinned_bound = pinned
        .bind(ManagerRequestContext {
            environment: DeploymentEnvironment::Sandbox,
            profile_id: PROFILE,
            delegated_resource: DELEGATED_RESOURCE,
            owner_contract_revision: RUNTIME_CONTRACT_REVISION,
        })
        .unwrap();
    pinned_bound.validate_catalogue(&catalogue).unwrap();
}
