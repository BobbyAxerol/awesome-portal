use super::{
    decode, e5_entries, validate_authority, validate_domains, validate_runtime,
    AcceptanceAuthority, DomainAcceptance, E6AcceptanceError, MaximumDataDomainAcceptance,
    RuntimeEvidence, E6_DOMAIN_ACCEPTANCE_JSON, E6_RUNTIME_EVIDENCE_JSON,
};
use maximum_data_contract::E4Contract;

#[test]
fn canonical_pack_validates_every_domain_and_runtime_capture() {
    let pack = MaximumDataDomainAcceptance::canonical().expect("canonical E6 pack must validate");
    let digests = pack.asset_digests();
    assert_eq!(digests.len(), 4);
    assert!(digests
        .values()
        .all(|digest| digest.starts_with("sha256:") && digest.len() == 71));
}

#[test]
fn invalid_profile_or_key_evidence_fails_closed() {
    let entries = e5_entries().expect("E5 entries");
    let mut evidence: RuntimeEvidence = decode(E6_RUNTIME_EVIDENCE_JSON).expect("E6 evidence");
    evidence.captures[0].relation_observations[0].profile_binding_valid = false;
    assert!(matches!(
        validate_runtime(&evidence, &entries),
        Err(E6AcceptanceError::RuntimeEvidenceInvalid)
    ));

    let mut evidence: RuntimeEvidence = decode(E6_RUNTIME_EVIDENCE_JSON).expect("E6 evidence");
    evidence.captures[0].relation_observations[0].primary_resource_key_status =
        "INVALID".to_owned();
    assert!(matches!(
        validate_runtime(&evidence, &entries),
        Err(E6AcceptanceError::RuntimeEvidenceInvalid)
    ));
}

#[test]
fn domain_gap_drift_fails_closed() {
    let e4 = E4Contract::canonical().expect("E4 contract");
    let entries = e5_entries().expect("E5 entries");
    let mut acceptance: DomainAcceptance =
        decode(E6_DOMAIN_ACCEPTANCE_JSON).expect("domain acceptance");
    let market = acceptance
        .domains
        .iter_mut()
        .find(|domain| domain.domain_id == "market_context")
        .expect("market domain");
    market.typed_source_owner_gap_ids.pop();
    assert!(matches!(
        validate_domains(&acceptance, &e4, &entries),
        Err(E6AcceptanceError::UnsupportedDomainClaim)
    ));
}

#[test]
fn direct_source_authority_is_never_permitted() {
    let authority = AcceptanceAuthority {
        direct_database_access: true,
        direct_redis_access: false,
        raw_relation_or_sql_selection: false,
        source_identity_or_credential: false,
        source_network_change: false,
        command_or_cli_execution: false,
        runtime_activation: false,
    };
    assert!(matches!(
        validate_authority(&authority),
        Err(E6AcceptanceError::AuthorityWidened)
    ));
}
