use super::{
    decode, validate_capacity, validate_manifest, validate_owner_response, E7ReturnError,
    MaximumDataReturn, E7_CAPACITY_JSON, E7_OWNER_RESPONSE_JSON, E7_RETURN_MANIFEST_JSON,
};

#[test]
fn canonical_return_pack_binds_all_frozen_contracts() {
    let pack = MaximumDataReturn::canonical().expect("canonical E7 return pack must validate");
    assert_eq!(
        pack.owner_response()["capabilities"]
            .as_array()
            .map(Vec::len),
        Some(34)
    );
}

#[test]
fn replay_or_source_gap_cannot_be_silently_upgraded() {
    let mut owner = decode(E7_OWNER_RESPONSE_JSON).expect("owner response");
    let replay = owner["capabilities"]
        .as_array_mut()
        .expect("capabilities")
        .iter_mut()
        .find(|capability| capability["field_id"] == "trade_replay")
        .expect("trade replay capability");
    replay["history_semantics"] = serde_json::json!("EVENT_HISTORY_AVAILABLE");
    assert!(matches!(
        validate_owner_response(&owner),
        Err(E7ReturnError::OwnerResponseInvalid)
    ));
}

#[test]
fn capacity_cannot_upgrade_paper_or_sandbox_above_measured_bound() {
    let mut capacity = decode(E7_CAPACITY_JSON).expect("capacity");
    let paper = capacity["profiles"]
        .as_array_mut()
        .expect("profiles")
        .iter_mut()
        .find(|profile| profile["profile"] == "PAPER")
        .expect("paper profile");
    paper["maximum_safe_concurrency_observed"] = serde_json::json!(2);
    assert!(matches!(
        validate_capacity(&capacity),
        Err(E7ReturnError::CapacityEvidenceInvalid)
    ));
}

#[test]
fn final_manifest_must_cover_portable_return_paths() {
    let mut manifest = decode(E7_RETURN_MANIFEST_JSON).expect("manifest");
    manifest["required_paths"]
        .as_array_mut()
        .expect("paths")
        .retain(|path| path != "SOURCE_OWNER_GAPS.json");
    assert!(matches!(
        validate_manifest(&manifest),
        Err(E7ReturnError::ManifestInvalid)
    ));
}
