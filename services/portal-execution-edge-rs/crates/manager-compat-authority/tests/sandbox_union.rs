//! Sandbox UNION release (`scripts/epg10-08/sandbox-switch/artifacts/binance-union106/`): the 106-relation set for `SANDBOX_BINANCE_USDM` = the 67 relations the real catalogue
//! tool qualifies + the 39 relations carried verbatim from the Sandbox catalogue served today (so the switch narrows nothing; the three `SOURCE_IDENTITY_SCOPE_GAP` relations
//! are never listed). The release loads in the census v2 loader for the Sandbox environment only; when `EDGE_WIRE_CORPUS_SANDBOX` points at the corpus emitted by the identity
//! Manager image's own facade code with this catalogue, every wire shape decodes and passes the authority and the draft sandbox pin passes that catalogue.

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
const R106: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-union106/manager-catalogue-release.json"
);
const R67: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-t1t2five67/manager-catalogue-release.json"
);
const PAPER_PIN: &[u8] = include_bytes!("../../../../../scripts/epg10-08/guard-pin/pin.paper.json");
const SANDBOX_PIN: &[u8] =
    include_bytes!("../../../../../scripts/epg10-08/sandbox-switch/pin.sandbox.DRAFT.json");

/// The 15 relations the Core Sandbox worker reads (registry of the execution cell): all must stay served.
const CORE_SANDBOX_READS: [&str; 15] = [
    "account_balances",
    "accounts",
    "account_sync_effective",
    "broker_account_sync_effective",
    "execution_sessions",
    "margin_balances",
    "portfolio_allocations",
    "portfolios",
    "positions_v2",
    "reconciliation_findings",
    "risk_grants",
    "sizing_decisions",
    "strategies",
    "strategy_deployments",
    "venue_accounts",
];

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
fn the_union_release_loads_for_sandbox_only_and_narrows_nothing() {
    let authority = load(R106, DeploymentEnvironment::Sandbox, PROFILE).unwrap();
    assert_eq!(authority.approved_relation_count(), 106);
    assert!(load(R106, DeploymentEnvironment::Paper, "PAPER_BINANCE_USDM").is_err());
    assert!(load(R106, DeploymentEnvironment::Sandbox, "SANDBOX_OKX").is_err());
    assert!(load(R106, DeploymentEnvironment::Live, "LIVE_BINANCE_USDM").is_err());
    assert!(
        names(R67).is_subset(&names(R106)),
        "the union contains the 67"
    );
    let listed = names(R106);
    for relation in CORE_SANDBOX_READS {
        assert!(
            listed.contains(&format!("public.{relation}")),
            "{relation} is read by Core's Sandbox worker"
        );
    }
    for gap in [
        "public.dnse_trading_tokens",
        "public.venue_credentials",
        "public.engine_authority_decisions",
    ] {
        assert!(!listed.contains(gap), "{gap} must never be listed");
    }
    // The Paper pin cannot be loaded for the Sandbox environment, and the draft sandbox pin loads for it.
    let pinned = |pin: &[u8]| {
        load(R106, DeploymentEnvironment::Sandbox, PROFILE)
            .unwrap()
            .with_source_identity_pin(pin, &digest(pin), DeploymentEnvironment::Sandbox, PROFILE)
    };
    assert!(pinned(PAPER_PIN).is_err());
    assert!(pinned(SANDBOX_PIN).is_ok());
}

#[test]
fn every_union_wire_shape_decodes_and_the_draft_sandbox_pin_passes_that_catalogue() {
    let Ok(corpus) = std::env::var("EDGE_WIRE_CORPUS_SANDBOX") else {
        eprintln!("EDGE_WIRE_CORPUS_SANDBOX not set: sandbox union corpus test skipped");
        return;
    };
    let dir = PathBuf::from(corpus).join("sandbox_union106");
    let read = |file: &str| -> Vec<u8> {
        let doc: Value = serde_json::from_slice(&fs::read(dir.join(file)).unwrap()).unwrap();
        serde_json::to_vec(&doc["body"]).unwrap()
    };
    let authority = load(R106, DeploymentEnvironment::Sandbox, PROFILE).unwrap();
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
        "SANDBOX union identity: {} rows={:?}",
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
    for relation in names(R106) {
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
    println!("SANDBOX union decoded {decoded} pages; snapshot on {snapshots:?}");
    assert_eq!(decoded, 106 * 3);
    assert_eq!(snapshots, ["public.account_balances", "public.portfolios"]);
    // The identity pin: the draft sandbox pin passes this catalogue.
    let pinned = load(R106, DeploymentEnvironment::Sandbox, PROFILE)
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
