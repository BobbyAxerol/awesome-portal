//! The accepted profile set is per environment: Paper accepts `PAPER_BINANCE_USDM` and `PAPER_OKX_SWAP`; Sandbox and Live accept exactly what they accepted before.
//! An Edge process is bound to exactly one (environment, profile) pair; releases, source-identity pins and request contexts are profile-bound, so a Paper release or
//! pin made for one Paper profile is refused by an Edge configured for the other, and neither Paper profile can be loaded for Sandbox or Live.

use manager_compat_authority::{
    AuthorityError, DeploymentEnvironment, ManagerCompatibilityAuthority, ManagerRequestContext,
    DELEGATED_RESOURCE,
};
use manager_v2_contract::{decode_success_for_profile, ManagerPayload, RUNTIME_CONTRACT_REVISION};
use serde_json::{json, Value};
use sha2::{Digest as _, Sha256};

const BINANCE: &str = "PAPER_BINANCE_USDM";
const OKX: &str = "PAPER_OKX_SWAP";
const DIGEST: &str = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MATRIX: &str =
    include_str!("../../../contracts/manager-compat-authority-v1/adapter-matrix.v1.json");
const ACTIVATION: &str =
    include_str!("../../../contracts/manager-profile-activation-v1/runtime-activation.v1.json");
const EVIDENCE: &str =
    include_str!("../../../contracts/manager-profile-activation-v1/qualification-evidence.v1.json");
const PAPER_BINANCE_PIN: &[u8] =
    include_bytes!("../../../../../scripts/epg10-08/guard-pin/pin.paper.json");
const SANDBOX_PIN: &[u8] =
    include_bytes!("../../../../../scripts/epg10-08/sandbox-switch/pin.sandbox.json");
const PAPER_BINANCE_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/t1-release/artifacts/manager-catalogue-release.json"
);
const SANDBOX_RELEASE: &[u8] = include_bytes!(
    "../../../../../scripts/epg10-08/sandbox-switch/artifacts/binance-union106/manager-catalogue-release.json"
);

/// Exactly the pairs the authority accepts.
const ACCEPTED: [(DeploymentEnvironment, &str); 4] = [
    (DeploymentEnvironment::Paper, BINANCE),
    (DeploymentEnvironment::Paper, OKX),
    (DeploymentEnvironment::Sandbox, "SANDBOX_BINANCE_USDM"),
    (DeploymentEnvironment::Live, "LIVE_BINANCE_USDM"),
];
const ENVIRONMENTS: [DeploymentEnvironment; 3] = [
    DeploymentEnvironment::Paper,
    DeploymentEnvironment::Sandbox,
    DeploymentEnvironment::Live,
];
/// Ids that must never bind in any environment (near misses, the other venue's ids, the proposals of the catalogue tool, case and shape variants).
const NEAR_MISSES: [&str; 12] = [
    "SANDBOX_OKX_SWAP",
    "LIVE_OKX_SWAP",
    "PAPER_OKX",
    "SANDBOX_OKX",
    "PAPER_OKX_USDM",
    "PAPER_OKX_SWAP ",
    "paper_okx_swap",
    "PAPER_DNSE_VNM",
    "PAPER_",
    "OKX",
    "",
    "PAPER_BINANCE_USDM_OKX_SWAP",
];

fn digest(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

fn accepted(environment: DeploymentEnvironment, profile: &str) -> bool {
    ACCEPTED
        .iter()
        .any(|(env, id)| *env == environment && *id == profile)
}

fn context(environment: DeploymentEnvironment, profile_id: &str) -> ManagerRequestContext<'_> {
    ManagerRequestContext {
        environment,
        profile_id,
        delegated_resource: DELEGATED_RESOURCE,
        owner_contract_revision: RUNTIME_CONTRACT_REVISION,
    }
}

fn release_bytes(environment: &str, profile: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "schema_version": "portal.execution.manager-catalogue-release.v1",
        "environment": environment,
        "profile_id": profile,
        "catalogue_sha256": DIGEST,
        "relations": ["public.accounts", "public.orders", "public.account_equity_snapshots"],
    }))
    .unwrap()
}

fn load_release(
    bytes: &[u8],
    environment: DeploymentEnvironment,
    profile: &str,
) -> Result<ManagerCompatibilityAuthority, AuthorityError> {
    ManagerCompatibilityAuthority::from_pinned_release(bytes, &digest(bytes), environment, profile)
}

fn pin_bytes(environment: &str, profile: &str, database: &str, minimum_rows: u64) -> Vec<u8> {
    serde_json::to_vec(&json!({
        "schema_version": "portal.execution.manager-source-identity-pin.v1",
        "environment": environment,
        "profile_id": profile,
        "source_identity_required": true,
        "database_name": database,
        "database_oid_sha256": "5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b",
        "minimum_schema_ledger_rows": minimum_rows,
    }))
    .unwrap()
}

#[test]
fn the_authority_binds_exactly_the_four_pairs_and_every_other_combination_is_denied() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    let profiles: Vec<&str> = ACCEPTED
        .iter()
        .map(|(_, id)| *id)
        .chain(NEAR_MISSES)
        .collect();
    let mut bound_pairs = 0;
    for environment in ENVIRONMENTS {
        for profile in &profiles {
            let result = authority.bind(context(environment, profile));
            if accepted(environment, profile) {
                assert_eq!(result.unwrap().profile_id(), *profile);
                bound_pairs += 1;
            } else {
                assert!(
                    matches!(result, Err(AuthorityError::ProfileDenied)),
                    "{environment:?} {profile:?} must be ProfileDenied"
                );
            }
        }
    }
    assert_eq!(bound_pairs, 4);
}

#[test]
fn the_okx_profile_keeps_every_resource_and_revision_refusal_of_the_other_profiles() {
    let authority = ManagerCompatibilityAuthority::canonical().unwrap();
    for (environment, profile) in ACCEPTED {
        assert!(matches!(
            authority.bind(ManagerRequestContext {
                environment,
                profile_id: profile,
                delegated_resource: "execution:manager-v2:write",
                owner_contract_revision: RUNTIME_CONTRACT_REVISION,
            }),
            Err(AuthorityError::ResourceDenied)
        ));
        assert!(matches!(
            authority.bind(ManagerRequestContext {
                environment,
                profile_id: profile,
                delegated_resource: DELEGATED_RESOURCE,
                owner_contract_revision: "unknown-owner-revision",
            }),
            Err(AuthorityError::RevisionUnsupported)
        ));
    }
}

#[test]
fn a_paper_release_loads_only_for_its_own_profile_and_neither_paper_profile_loads_elsewhere() {
    let profiles: Vec<&str> = ACCEPTED
        .iter()
        .map(|(_, id)| *id)
        .chain(NEAR_MISSES)
        .collect();
    // A release is bound to the (environment, profile) written in it: load it for every pair and expect success only for the identical accepted pair.
    for (release_environment, release_profile) in ACCEPTED {
        let bytes = release_bytes(release_environment.as_str(), release_profile);
        for environment in ENVIRONMENTS {
            for profile in &profiles {
                let loaded = load_release(&bytes, environment, profile);
                let expected = environment == release_environment && *profile == release_profile;
                assert_eq!(
                    loaded.is_ok(),
                    expected,
                    "release {release_profile} loaded for {environment:?}/{profile}"
                );
                if let Ok(authority) = loaded {
                    assert_eq!(authority.approved_relation_count(), 3);
                    assert!(authority.bind(context(environment, profile)).is_ok());
                    // The release-pinned authority refuses the other Paper profile at bind time as well.
                    let other = if *profile == BINANCE { OKX } else { BINANCE };
                    if environment == DeploymentEnvironment::Paper {
                        assert!(matches!(
                            authority.bind(context(environment, other)),
                            Err(AuthorityError::ProfileDenied)
                        ));
                    }
                }
            }
        }
    }
    // A release file that names another environment or profile than the Edge is configured for is refused, in particular across the two Paper profiles.
    let okx = release_bytes("paper", OKX);
    let binance = release_bytes("paper", BINANCE);
    assert!(matches!(
        load_release(&okx, DeploymentEnvironment::Paper, BINANCE),
        Err(AuthorityError::InvalidCatalogueRestriction)
    ));
    assert!(matches!(
        load_release(&binance, DeploymentEnvironment::Paper, OKX),
        Err(AuthorityError::InvalidCatalogueRestriction)
    ));
    // The committed release files of the running Edges keep loading for their own profile only.
    assert!(load_release(PAPER_BINANCE_RELEASE, DeploymentEnvironment::Paper, BINANCE).is_ok());
    assert!(load_release(PAPER_BINANCE_RELEASE, DeploymentEnvironment::Paper, OKX).is_err());
    assert!(load_release(
        SANDBOX_RELEASE,
        DeploymentEnvironment::Sandbox,
        "SANDBOX_BINANCE_USDM"
    )
    .is_ok());
    assert!(load_release(SANDBOX_RELEASE, DeploymentEnvironment::Paper, OKX).is_err());
    assert!(load_release(
        SANDBOX_RELEASE,
        DeploymentEnvironment::Sandbox,
        "SANDBOX_OKX_SWAP"
    )
    .is_err());
    // A release that widens beyond the frozen census still fails for the OKX profile.
    let widened = serde_json::to_vec(&json!({
        "schema_version": "portal.execution.manager-catalogue-release.v1",
        "environment": "paper", "profile_id": OKX, "catalogue_sha256": DIGEST,
        "relations": ["public.accounts", "public.not_in_the_census"],
    }))
    .unwrap();
    assert!(matches!(
        load_release(&widened, DeploymentEnvironment::Paper, OKX),
        Err(AuthorityError::InvalidCatalogueRestriction)
    ));
}

#[test]
fn a_source_identity_pin_loads_only_on_the_authority_of_its_own_profile() {
    let release = |profile: &str| {
        load_release(
            &release_bytes("paper", profile),
            DeploymentEnvironment::Paper,
            profile,
        )
        .unwrap()
    };
    let okx_pin = pin_bytes("paper", OKX, "trading_system", 175);
    let binance_pin = pin_bytes("paper", BINANCE, "trading_system", 175);
    let with_pin = |authority: ManagerCompatibilityAuthority, bytes: &[u8], profile: &str| {
        authority.with_source_identity_pin(
            bytes,
            &digest(bytes),
            DeploymentEnvironment::Paper,
            profile,
        )
    };
    assert!(with_pin(release(OKX), &okx_pin, OKX).is_ok());
    assert!(with_pin(release(BINANCE), &binance_pin, BINANCE).is_ok());
    // Cross-profile: a pin for one Paper profile never loads for the other, even with a correct digest and the right environment.
    assert!(matches!(
        with_pin(release(OKX), &binance_pin, OKX),
        Err(AuthorityError::InvalidSourceIdentityPin)
    ));
    assert!(matches!(
        with_pin(release(BINANCE), &okx_pin, BINANCE),
        Err(AuthorityError::InvalidSourceIdentityPin)
    ));
    // The configured profile must itself be the authority's pinned profile: a Binance authority cannot take an OKX pin under the OKX id either.
    assert!(matches!(
        with_pin(release(BINANCE), &okx_pin, OKX),
        Err(AuthorityError::ProfileDenied)
    ));
    assert!(matches!(
        with_pin(release(OKX), &binance_pin, BINANCE),
        Err(AuthorityError::ProfileDenied)
    ));
    // The committed pin files of the running Edges (Paper Binance, Sandbox) are refused for the OKX profile; the OKX pin is refused for Sandbox and Live.
    assert!(with_pin(release(OKX), PAPER_BINANCE_PIN, OKX).is_err());
    assert!(with_pin(release(OKX), PAPER_BINANCE_PIN, BINANCE).is_err());
    assert!(with_pin(release(OKX), SANDBOX_PIN, OKX).is_err());
    for (environment, profile) in [
        (DeploymentEnvironment::Sandbox, "SANDBOX_BINANCE_USDM"),
        (DeploymentEnvironment::Live, "LIVE_BINANCE_USDM"),
    ] {
        let authority = load_release(
            &release_bytes(environment.as_str(), profile),
            environment,
            profile,
        )
        .unwrap();
        assert!(authority
            .with_source_identity_pin(&okx_pin, &digest(&okx_pin), environment, profile)
            .is_err());
    }
    // An OKX pin with an unknown member, a wrong schema or an environment other than paper is refused.
    let mut wrong_environment: Value = serde_json::from_slice(&okx_pin).unwrap();
    wrong_environment["environment"] = json!("sandbox");
    let wrong_environment = serde_json::to_vec(&wrong_environment).unwrap();
    assert!(with_pin(release(OKX), &wrong_environment, OKX).is_err());
    let mut unknown: Value = serde_json::from_slice(&okx_pin).unwrap();
    unknown["unexpected"] = json!(true);
    let unknown = serde_json::to_vec(&unknown).unwrap();
    assert!(with_pin(release(OKX), &unknown, OKX).is_err());
}

fn okx_catalogue_body(profile: &str, database_name: &str, ledger_rows: Option<u64>) -> Vec<u8> {
    let relations: Vec<Value> = ["public.accounts", "public.orders", "public.account_equity_snapshots"]
        .iter()
        .map(|relation_id| {
            let (schema, relation) = relation_id.split_once('.').unwrap();
            json!({
                "id": {"schema": schema, "relation": relation},
                "kind": "TABLE",
                "safe_columns": [{"name": "id", "ordinal": 1, "data_type": "bigint", "nullable": false}],
                "secret_cell_excluded_column_count": 0,
                "key": {"status": "PRIMARY_KEY", "name": null, "columns": ["id"]},
                "profile_classification": "RELATION_PROFILE_MARKERS_PRESENT",
                "profile_columns": ["mode", "venue"],
                "query_status": "QUALIFIED_TS_OC_03D1"
            })
        })
        .collect();
    let mut identity = json!({
        "database_name": database_name,
        "database_oid_sha256": "5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b",
        "schema_ledger_rows": ledger_rows,
        "latest_ledger_version": "20261115_t1_read_indexes",
        "ledger_status": if ledger_rows.is_some() { "READABLE" } else { "NOT_READABLE" },
    });
    if ledger_rows.is_none() {
        identity["latest_ledger_version"] = Value::Null;
    }
    serde_json::to_vec(&json!({
        "contract_version": RUNTIME_CONTRACT_REVISION,
        "authority": "EXECUTION_CELL",
        "profile_id": profile,
        "catalogue_sha256": DIGEST,
        "availability": "AVAILABLE",
        "freshness": "FRESH",
        "completeness": "COMPLETE",
        "trace_id": "okx-paper-profile-test",
        "as_of": "2026-11-18T00:00:00Z",
        "data": {
            "catalogue_revision": DIGEST,
            "relation_count": relations.len(),
            "relations": relations,
            "source_identity": identity,
        },
    }))
    .unwrap()
}

fn verdict(authority: &ManagerCompatibilityAuthority, profile: &str, body: &[u8]) -> String {
    let bound = authority
        .bind(context(DeploymentEnvironment::Paper, profile))
        .unwrap();
    let Ok(ManagerPayload::Catalogue(envelope)) =
        decode_success_for_profile(&bound.catalogue_request(), body, profile)
    else {
        return "DECODE_REFUSED".to_owned();
    };
    match bound.validate_catalogue(&envelope.into_data()) {
        Ok(()) => "pass".to_owned(),
        Err(error) => error.source_identity_detail().map_or_else(
            || format!("other:{error}"),
            |(reason, ..)| reason.to_owned(),
        ),
    }
}

#[test]
fn the_identity_guard_of_the_okx_profile_and_the_cross_profile_answers() {
    let pin = pin_bytes("paper", OKX, "trading_system", 175);
    let authority = load_release(
        &release_bytes("paper", OKX),
        DeploymentEnvironment::Paper,
        OKX,
    )
    .unwrap()
    .with_source_identity_pin(&pin, &digest(&pin), DeploymentEnvironment::Paper, OKX)
    .unwrap();
    let cases: [(&str, &str, Option<u64>, &str); 7] = [
        ("matching identity", "trading_system", Some(175), "pass"),
        ("ledger grew", "trading_system", Some(5000), "pass"),
        (
            "wrong database name",
            "trading_system_sandbox",
            Some(175),
            "DATABASE_NAME",
        ),
        (
            "ledger below the minimum",
            "trading_system",
            Some(174),
            "LEDGER_BELOW_MINIMUM",
        ),
        (
            "ledger not readable",
            "trading_system",
            None,
            "LEDGER_NOT_READABLE",
        ),
        (
            "legacy database",
            "live_data_executor",
            Some(175),
            "DATABASE_NAME",
        ),
        (
            "name and rows both wrong: the name first",
            "trading_system_sandbox",
            Some(1),
            "DATABASE_NAME",
        ),
    ];
    for (label, database, rows, expected) in cases {
        let body = okx_catalogue_body(OKX, database, rows);
        assert_eq!(verdict(&authority, OKX, &body), expected, "{label}");
    }
    // An answer that names the other Paper profile (a Binance Manager behind the OKX route, or the reverse) is refused at decode, before any guard runs.
    let binance_answer = okx_catalogue_body(BINANCE, "trading_system", Some(175));
    assert_eq!(verdict(&authority, OKX, &binance_answer), "DECODE_REFUSED");
    let binance_pin = pin_bytes("paper", BINANCE, "trading_system", 175);
    let binance_authority = load_release(
        &release_bytes("paper", BINANCE),
        DeploymentEnvironment::Paper,
        BINANCE,
    )
    .unwrap()
    .with_source_identity_pin(
        &binance_pin,
        &digest(&binance_pin),
        DeploymentEnvironment::Paper,
        BINANCE,
    )
    .unwrap();
    let okx_answer = okx_catalogue_body(OKX, "trading_system", Some(175));
    assert_eq!(
        verdict(&binance_authority, BINANCE, &okx_answer),
        "DECODE_REFUSED"
    );
    assert_eq!(
        verdict(
            &binance_authority,
            BINANCE,
            &okx_catalogue_body(BINANCE, "trading_system", Some(175))
        ),
        "pass"
    );
}

fn profiles_of(document: &Value, key: &str) -> Vec<(String, String)> {
    document[key]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            (
                row["environment"].as_str().unwrap().to_owned(),
                row["profile_id"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
}

#[test]
fn the_authority_documents_list_the_okx_profile_without_inventing_evidence() {
    let matrix: Value = serde_json::from_str(MATRIX).unwrap();
    let activation: Value = serde_json::from_str(ACTIVATION).unwrap();
    let evidence: Value = serde_json::from_str(EVIDENCE).unwrap();
    let expected: Vec<(String, String)> = ACCEPTED
        .iter()
        .map(|(env, id)| ((*env).as_str().to_owned(), (*id).to_owned()))
        .collect();
    let mut matrix_pairs = profiles_of(&matrix, "profile_bindings");
    let mut activation_pairs = profiles_of(&activation, "profiles");
    let mut expected_sorted = expected;
    matrix_pairs.sort();
    activation_pairs.sort();
    expected_sorted.sort();
    assert_eq!(matrix_pairs, expected_sorted);
    assert_eq!(activation_pairs, expected_sorted);
    // The OKX binding is not transport qualified in the historical matrix; its activation audience is the Core/Edge naming.
    let binding = matrix["profile_bindings"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["profile_id"] == OKX)
        .unwrap();
    assert_eq!(binding["environment"], "paper");
    assert_eq!(binding["transport_qualified"], false);
    assert_eq!(binding["product_enabled"], false);
    let active = activation["profiles"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["profile_id"] == OKX)
        .unwrap();
    assert_eq!(
        active["delegation_audience"],
        "portal-execution-edge-paper-okx"
    );
    // The 2026-09-01 evidence is unchanged: three environments, none of them OKX (nothing was observed for OKX).
    assert_eq!(evidence["profiles"].as_array().unwrap().len(), 3);
    assert!(!EVIDENCE.contains("OKX"));
    assert_eq!(
        activation["qualification_evidence_sha256"],
        json!(digest(EVIDENCE.as_bytes()))
    );
    assert_eq!(
        activation["adapter_matrix_sha256"],
        json!(digest(MATRIX.as_bytes()))
    );
}
