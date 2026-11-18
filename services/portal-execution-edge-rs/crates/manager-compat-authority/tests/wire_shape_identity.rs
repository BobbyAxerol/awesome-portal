//! Companion of `wire_shape_corpus.rs` for the Manager identity image: the catalogue answer of the `new` corpus carries the optional
//! `source_identity` member and it decodes to `Some(trading_system, 175 rows, READABLE)`; the `old` answer carries none.
//! Skipped unless `EDGE_WIRE_CORPUS` is set.

use std::{fs, path::PathBuf};

use manager_v2_contract::{
    decode_success_for_profile, LedgerStatus, ManagerPayload, ManagerV2Request,
};
use serde_json::Value;

#[test]
fn the_identity_image_catalogue_answer_decodes_with_the_source_identity_member() {
    let Ok(corpus) = std::env::var("EDGE_WIRE_CORPUS") else {
        eprintln!("EDGE_WIRE_CORPUS not set: identity corpus test skipped");
        return;
    };
    for set in ["t2_54", "t1_67"] {
        for (generation, expect_identity) in [("old", false), ("new", true)] {
            let path = PathBuf::from(&corpus)
                .join(generation)
                .join(set)
                .join("_catalogue.json");
            let doc: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
            let body = serde_json::to_vec(&doc["body"]).unwrap();
            let ManagerPayload::Catalogue(envelope) = decode_success_for_profile(
                &ManagerV2Request::catalogue(),
                &body,
                "PAPER_BINANCE_USDM",
            )
            .unwrap() else {
                panic!("expected catalogue")
            };
            let identity = envelope.data().source_identity();
            if expect_identity {
                let identity =
                    identity.unwrap_or_else(|| panic!("{set} new: identity member missing"));
                assert_eq!(identity.database_name(), "trading_system");
                assert_eq!(identity.schema_ledger_rows(), Some(175));
                assert_eq!(identity.ledger_status(), LedgerStatus::Readable);
                assert_eq!(identity.database_oid_sha256().len(), 64);
                assert!(identity.latest_ledger_version().is_some());
            } else {
                assert!(identity.is_none(), "{set} old: unexpected identity member");
            }
        }
    }
}
