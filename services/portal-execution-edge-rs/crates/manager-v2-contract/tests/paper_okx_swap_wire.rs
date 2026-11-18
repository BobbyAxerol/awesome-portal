//! OKX Paper profile `PAPER_OKX_SWAP` (venue OKX, mode paper, database `trading_system`): every wire shape the REAL Manager facade code (image `8d4765a4`,
//! `ManagerReadFacade`/`S1ReadFacade` driven by `scripts/epg10-08/okx-paper/wire-corpus/gen_wire.py` with a stub source) emits for the OKX catalogue
//! (`scripts/epg10-08/okx-paper/artifacts/paper-okx-swap/`) decodes through the CURRENT Edge contract decoder for that profile id, and the release file lists exactly
//! the live Paper 67 relations. The compat authority (profile set per environment) is a different change and is not exercised here.
//! Corpus: the committed one, or `EDGE_WIRE_CORPUS_PAPER_OKX` (a directory containing `paper_okx_swap/`). Not covered: mTLS, JWT, HTTP framing, real rows.

use std::{collections::BTreeSet, fs, path::PathBuf};

use manager_v2_contract::{
    decode_success_for_profile, ManagerPayload, ManagerV2Request, PageLimit,
};
use serde_json::Value;

const PROFILE: &str = "PAPER_OKX_SWAP";
const OKX_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/okx-paper/artifacts/paper-okx-swap/manager-catalogue-release.json"
);
const PAPER_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/manager-catalogue-release.json"
);
const OKX_CATALOGUE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/okx-paper/artifacts/paper-okx-swap/relation-catalogue.json"
);

fn corpus() -> PathBuf {
    std::env::var("EDGE_WIRE_CORPUS_PAPER_OKX").map_or_else(
        |_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../../../scripts/epg10-08/okx-paper/wire-corpus")
                .join("paper_okx_swap")
        },
        |dir| PathBuf::from(dir).join("paper_okx_swap"),
    )
}

fn body(file: &str) -> Vec<u8> {
    let path = corpus().join(file);
    let doc: Value = serde_json::from_slice(
        &fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display())),
    )
    .unwrap();
    assert_eq!(doc["status"], 200, "{file}");
    serde_json::to_vec(&doc["body"]).unwrap()
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

#[test]
fn the_okx_release_lists_the_paper_67_and_pairs_with_its_catalogue_seal() {
    let okx: Value = serde_json::from_slice(OKX_RELEASE).unwrap();
    assert_eq!(okx["profile_id"], PROFILE);
    assert_eq!(okx["environment"], "paper");
    assert_eq!(
        names(OKX_RELEASE),
        names(PAPER_RELEASE),
        "same relation scope as the live Paper release"
    );
    assert_eq!(names(OKX_RELEASE).len(), 67);
    let catalogue: Value = serde_json::from_slice(OKX_CATALOGUE).unwrap();
    assert_eq!(catalogue["authority"]["profile_id"], PROFILE);
    assert_eq!(catalogue["authority"]["profile_venue"], "OKX");
    assert_eq!(catalogue["authority"]["profile_mode"], "paper");
    assert_eq!(catalogue["authority"]["database"], "trading_system");
    assert_eq!(
        okx["catalogue_sha256"],
        format!("sha256:{}", catalogue["catalogue_sha256"].as_str().unwrap())
    );
    let paper: Value = serde_json::from_slice(PAPER_RELEASE).unwrap();
    assert_ne!(
        okx["catalogue_sha256"], paper["catalogue_sha256"],
        "a distinct sealed catalogue"
    );
}

#[test]
fn every_real_manager_wire_shape_for_the_okx_catalogue_decodes_for_the_okx_profile() {
    let catalogue_body = body("_catalogue.json");
    let ManagerPayload::Catalogue(envelope) =
        decode_success_for_profile(&ManagerV2Request::catalogue(), &catalogue_body, PROFILE)
            .unwrap()
    else {
        panic!("expected catalogue")
    };
    let catalogue = envelope.into_data();
    assert_eq!(catalogue.relations().len(), 67);
    let listed: BTreeSet<String> = catalogue
        .relations()
        .iter()
        .map(|r| format!("public.{}", r.id().relation()))
        .collect();
    assert_eq!(listed, names(OKX_RELEASE));
    let identity = catalogue
        .source_identity()
        .expect("the identity image sends source_identity");
    assert_eq!(identity.database_name(), "trading_system");
    let ManagerPayload::Capabilities(_) = decode_success_for_profile(
        &ManagerV2Request::capabilities(),
        &body("_capabilities.json"),
        PROFILE,
    )
    .unwrap() else {
        panic!("expected capabilities")
    };
    let mut decoded = 0;
    let mut snapshots = Vec::new();
    for relation in names(OKX_RELEASE) {
        let name = relation.strip_prefix("public.").unwrap();
        let catalogued = catalogue
            .relation("public", name)
            .unwrap_or_else(|| panic!("{relation} not catalogued"));
        for case in ["page", "empty", "more"] {
            let request =
                ManagerV2Request::relation_records(catalogued, None, PageLimit::new(1).unwrap())
                    .unwrap();
            let ManagerPayload::RelationRecords(page) = decode_success_for_profile(
                &request,
                &body(&format!("{relation}.{case}.json")),
                PROFILE,
            )
            .unwrap_or_else(|e| panic!("{relation} {case}: {e}")) else {
                panic!("{relation} {case}: wrong payload")
            };
            if page.meta().source_snapshot().is_some() && case == "page" {
                snapshots.push(relation.clone());
            }
            decoded += 1;
        }
    }
    assert_eq!(decoded, 67 * 3);
    assert_eq!(snapshots, ["public.account_balances", "public.portfolios"]);
}

#[test]
fn the_okx_wire_shapes_are_refused_for_every_other_profile_id() {
    for other in [
        "PAPER_BINANCE_USDM",
        "PAPER_OKX",
        "SANDBOX_BINANCE_USDM",
        "PAPER_OKX_PERP",
    ] {
        assert!(
            decode_success_for_profile(
                &ManagerV2Request::catalogue(),
                &body("_catalogue.json"),
                other
            )
            .is_err(),
            "{other} must not decode the OKX Paper catalogue answer"
        );
    }
}
