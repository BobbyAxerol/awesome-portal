//! `TEST_ONLY` source-wire specimens. No source permission or runtime evidence.

use super::*;
use crate::EventStreamBinding;
use execution_contracts::CanonicalId;
use serde_json::json;

fn digest(letter: char) -> String {
    letter.to_string().repeat(64)
}

fn binding() -> ReadBinding {
    ReadBinding {
        scope: SourceScope {
            source_cell_id: "cell_fixture".into(),
            source_database_id: "db_fixture".into(),
            continuity_epoch: "epoch_fixture".into(),
        },
        consumer_id: "edge_fixture".into(),
        manifest_digest: digest('a'),
        catalogue_digest: digest('b'),
        filter_digest: digest('c'),
        access_revision: 4,
        after_sequence: 0,
        through_sequence: 8,
        retention_floor: 1,
        max_events: 8,
        coverage: BTreeMap::from([(
            "p12.paper.execution.v1".into(),
            CoverageBinding {
                writer_id: "paper_fixture_repository".into(),
                complete_from: "fixture-activation-cut-v1".into(),
            },
        )]),
    }
}

fn event(sequence: u64, group: u128, index: u64, count: u64) -> Event {
    let payload = json!({"quantity":"9007199254740993.123456789012345678", "nullable":null});
    Event {
        source_event_id: Uuid::from_u128(u128::from(sequence)).to_string(),
        source_cell_id: "cell_fixture".into(),
        source_database_id: "db_fixture".into(),
        continuity_epoch: "epoch_fixture".into(),
        source_commit_lsn: format!("0/{group:X}"),
        source_commit_group_index: 0,
        published_source_sequence: sequence,
        transaction_group_id: Uuid::from_u128(group).to_string(),
        transaction_event_index: index,
        transaction_event_count: count,
        business_event_id: Uuid::from_u128(u128::from(sequence) + 100).to_string(),
        event_revision: 1,
        event_type: "order_updated".into(),
        schema_version: "orders.fixture.v1".into(),
        schema_digest: digest('d'),
        operation: Operation::Upsert,
        entity_type: "orders".into(),
        entity_key: format!("account:orders/{sequence}"),
        entity_version: 0,
        mode: "paper".into(),
        venue: "FIXTURE".into(),
        product: "SPOT".into(),
        physical_account_ref: "physical_fixture".into(),
        logical_account_ref: "logical_fixture".into(),
        command_id: None,
        correlation_id: Some("correlation_fixture".into()),
        occurred_at: None,
        received_at: "2026-10-23T12:00:00.123456+07:00".into(),
        recorded_at: "2026-10-23T05:00:00.123456+00:00".into(),
        instrument_version: "instrument_fixture.v1".into(),
        policy_version: "policy_fixture.v1".into(),
        reducer_version: "reducer_fixture.v1".into(),
        correction_of: None,
        payload_hash: source_payload_hash(&payload).unwrap(),
        payload,
        evidence_ref: None,
        coverage_profile_id: "p12.paper.execution.v1".into(),
        writer_id: "paper_fixture_repository".into(),
        complete_from: "fixture-activation-cut-v1".into(),
    }
}

fn page() -> ReadPage {
    let b = binding();
    ReadPage {
        consumer_id: b.consumer_id,
        manifest_digest: b.manifest_digest,
        catalogue_digest: b.catalogue_digest,
        filter_digest: b.filter_digest,
        scope: b.scope,
        after_sequence: 0,
        scanned_through_sequence: 8,
        published_head_sequence: 20,
        access_revision: 4,
        source_lane: "SOURCE_JOURNAL".into(),
        read_role: "source_journal_paper_reader".into(),
        command_authority: "NONE".into(),
        events: vec![event(2, 10, 0, 2), event(3, 10, 1, 2), event(7, 11, 0, 1)],
    }
}

fn decode(page: &ReadPage, binding: &ReadBinding) -> Result<ValidatedPage, ProtocolError> {
    ValidatedPage::decode(&serde_json::to_vec(page).unwrap(), binding)
}

#[test]
fn actual_shape_preserves_complete_sparse_groups_and_scanned_checkpoint() {
    let source = page();
    let checked = decode(&source, &binding()).unwrap();
    assert_eq!(checked.page(), &source);
    assert_eq!(
        checked.groups().map(<[Event]>::len).collect::<Vec<_>>(),
        [2, 1]
    );
    assert_eq!(checked.page().scanned_through_sequence, 8);
    assert_eq!(
        checked
            .page()
            .events
            .last()
            .unwrap()
            .published_source_sequence,
        7
    );
    assert_eq!(checked.page().events[0].entity_version, 0);
    assert_eq!(checked.page().events[0].entity_key, "account:orders/2");
    assert_eq!(
        serde_json::to_value(&checked.page().events[0])
            .unwrap()
            .as_object()
            .unwrap()
            .len(),
        39
    );
}

#[test]
fn hidden_only_scan_advances_coverage_without_fabricating_a_business_delta() {
    let mut source = page();
    source.events.clear();
    let checked = decode(&source, &binding()).unwrap();
    assert_eq!(checked.groups().count(), 0);
    assert_eq!(checked.page().scanned_through_sequence, 8);
}

#[test]
fn empty_stream_anchor_is_supported_without_an_invented_event() {
    let mut source = page();
    let mut b = binding();
    source.events.clear();
    source.scanned_through_sequence = 0;
    source.published_head_sequence = 0;
    b.through_sequence = 0;
    assert!(decode(&source, &b).is_ok());
}

#[test]
fn semantic_correction_and_tombstone_facts_are_not_coerced_to_upsert() {
    let mut source = page();
    source.events[0].operation = Operation::SemanticFact;
    source.events[1].operation = Operation::Correction;
    source.events[1].correction_of = Some(Uuid::from_u128(99).to_string());
    source.events[2].operation = Operation::Tombstone;
    let checked = decode(&source, &binding()).unwrap();
    assert_eq!(checked.page().events[0].operation, Operation::SemanticFact);
    assert_eq!(
        checked.page().events[1].correction_of,
        source.events[1].correction_of
    );
    // P16 may publish a tombstone without a predecessor. Do not invent one to
    // satisfy Edge's stronger current-state reducer contract.
    assert_eq!(checked.page().events[2].operation, Operation::Tombstone);
    assert!(checked.page().events[2].correction_of.is_none());
}

#[test]
fn source_unicode_hash_matches_pinned_python_and_native_ascii_codec() {
    let payload = json!({
        "label":"Tài chính 😀",
        "amount":"9007199254740993.123456789012345678",
        "nested":{"é":"日本"}
    });
    assert_eq!(
        source_payload_hash(&payload).unwrap(),
        "57826ca1b5876c8ff57105de672e66fa0096ecf16361e1a2bc078d41aa3ea0f3"
    );
    assert_ne!(
        format!("sha256:{}", source_payload_hash(&payload).unwrap()),
        projection_core::canonical_value_digest(&payload)
    );
    let mut source = page();
    source.events[0].payload = payload;
    source.events[0].payload_hash = source_payload_hash(&source.events[0].payload).unwrap();
    assert!(decode(&source, &binding()).is_ok());
}

#[test]
fn duplicate_missing_extra_and_coerced_wire_fields_are_rejected() {
    let source = serde_json::to_value(page()).unwrap();
    for field in [
        "command_id",
        "correlation_id",
        "occurred_at",
        "correction_of",
        "evidence_ref",
    ] {
        let mut malformed = source.clone();
        malformed["events"][0]
            .as_object_mut()
            .unwrap()
            .remove(field);
        assert!(
            ValidatedPage::decode(&serde_json::to_vec(&malformed).unwrap(), &binding()).is_err(),
            "{field}"
        );
    }
    for value in [json!(true), json!("8"), json!(-1), json!(8.0)] {
        let mut malformed = source.clone();
        malformed["scanned_through_sequence"] = value;
        assert!(
            ValidatedPage::decode(&serde_json::to_vec(&malformed).unwrap(), &binding()).is_err()
        );
    }
    let mut malformed = source;
    malformed["events"][0]["invented_source_published_at"] = json!("now");
    assert!(ValidatedPage::decode(&serde_json::to_vec(&malformed).unwrap(), &binding()).is_err());
    let duplicate = serde_json::to_string(&page()).unwrap().replacen(
        "\"consumer_id\":",
        "\"consumer_id\":\"foreign\",\"consumer_id\":",
        1,
    );
    assert!(ValidatedPage::decode(duplicate.as_bytes(), &binding()).is_err());
}

#[test]
fn nested_payload_duplicates_cannot_hide_behind_a_valid_last_wins_hash() {
    let source = serde_json::to_string(&page()).unwrap();
    // The final nullable value equals the original, so an ordinary Value
    // decoder would discard the forged earlier value and validate its hash.
    for repeated in [
        "\"nullable\":\"forged\",\"nullable\":null",
        "\"nullable\":\"forged\",\"\\u006eullable\":null",
    ] {
        let duplicate = source.replacen("\"nullable\":null", repeated, 1);
        assert_ne!(duplicate, source);
        assert!(matches!(
            ValidatedPage::decode(duplicate.as_bytes(), &binding()),
            Err(ProtocolError::Invalid)
        ));
    }
    assert!(ValidatedPage::decode(source.as_bytes(), &binding()).is_ok());
}

#[test]
fn every_envelope_authority_and_interval_pin_is_exact() {
    let original = serde_json::to_value(page()).unwrap();
    for (field, value) in [
        ("consumer_id", json!("foreign")),
        ("manifest_digest", json!(digest('e'))),
        ("catalogue_digest", json!(digest('e'))),
        ("filter_digest", json!(digest('e'))),
        ("access_revision", json!(5)),
        ("after_sequence", json!(1)),
        ("scanned_through_sequence", json!(7)),
        ("source_lane", json!("QUERY")),
        ("read_role", json!("source_journal_reader")),
        ("command_authority", json!("ALL")),
    ] {
        let mut bad = original.clone();
        bad[field] = value;
        assert!(
            ValidatedPage::decode(&serde_json::to_vec(&bad).unwrap(), &binding()).is_err(),
            "{field}"
        );
    }
    for field in ["source_cell_id", "source_database_id", "continuity_epoch"] {
        let mut bad = original.clone();
        bad["scope"][field] = json!("foreign");
        assert!(ValidatedPage::decode(&serde_json::to_vec(&bad).unwrap(), &binding()).is_err());
    }
}

#[test]
fn stale_retention_requires_resnapshot_not_a_reset_to_head() {
    let mut b = binding();
    b.retention_floor = 2;
    assert!(matches!(decode(&page(), &b), Err(ProtocolError::Expired)));
    b.retention_floor = 1;
    let mut source = page();
    source.published_head_sequence = 7;
    assert!(matches!(decode(&source, &b), Err(ProtocolError::Bounds)));
}

#[test]
fn schema_hash_and_source_coverage_drift_are_rejected() {
    let original = serde_json::to_value(page()).unwrap();
    for (field, value) in [
        ("source_cell_id", json!("foreign")),
        ("source_database_id", json!("foreign")),
        ("continuity_epoch", json!("foreign")),
        ("mode", json!("sandbox")),
        ("writer_id", json!("uncovered_writer")),
        ("coverage_profile_id", json!("bootstrap_only")),
        ("complete_from", json!("invented-history-start")),
        ("schema_digest", json!("not-a-hash")),
        ("payload_hash", json!(digest('f'))),
        ("received_at", json!("2026-10-23T05:00:00")),
        ("source_event_id", json!("journal-id-123")),
        ("operation", json!("DELETE")),
    ] {
        let mut bad = original.clone();
        bad["events"][0][field] = value;
        assert!(
            ValidatedPage::decode(&serde_json::to_vec(&bad).unwrap(), &binding()).is_err(),
            "{field}"
        );
    }
    let mut source = page();
    source.events[0].payload["quantity"] = json!("0");
    assert!(matches!(
        decode(&source, &binding()),
        Err(ProtocolError::Integrity)
    ));
}

#[test]
fn partial_duplicate_reordered_and_holey_visible_groups_are_refused() {
    let original = page();
    let mut variants = Vec::new();
    let mut bad = original.clone();
    bad.events.remove(1);
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[1].transaction_event_index = 0;
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[1].transaction_event_count = 3;
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[1].published_source_sequence = 4;
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[1].source_commit_lsn = "0/B".into();
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[1].schema_digest = digest('e');
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[2].source_event_id = bad.events[0].source_event_id.clone();
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[2].business_event_id = bad.events[0].business_event_id.clone();
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[2].transaction_group_id = bad.events[0].transaction_group_id.clone();
    variants.push(bad);
    let mut bad = original.clone();
    bad.events[2].source_commit_lsn = "0/9".into();
    variants.push(bad);
    let mut bad = original.clone();
    bad.events.swap(0, 1);
    variants.push(bad);
    let mut bad = original;
    bad.events[2].published_source_sequence = 9;
    variants.push(bad);
    for bad in variants {
        assert!(decode(&bad, &binding()).is_err());
    }
}

#[test]
fn commit_group_index_orders_groups_within_the_same_source_commit() {
    let mut source = page();
    source.events[2].source_commit_lsn = "0/A".into();
    source.events[2].source_commit_group_index = 1;
    assert!(decode(&source, &binding()).is_ok());
    source.events[2].source_commit_group_index = 0;
    assert!(decode(&source, &binding()).is_err());
}

#[test]
fn limits_reject_oversized_inputs_and_invalid_bound_configuration() {
    assert!(matches!(
        ValidatedPage::decode(&vec![b' '; MAX_PAGE_BYTES + 1], &binding()),
        Err(ProtocolError::Bounds)
    ));
    let mut b = binding();
    b.max_events = 0;
    assert!(decode(&page(), &b).is_err());
    let mut b = binding();
    b.max_events = MAX_EVENTS + 1;
    assert!(decode(&page(), &b).is_err());
    let mut b = binding();
    b.through_sequence = 9;
    assert!(decode(&page(), &b).is_err());
    let mut b = binding();
    b.coverage.clear();
    assert!(decode(&page(), &b).is_err());
    let mut source = page();
    source.events[0].transaction_event_count = MAX_GROUP_EVENTS + 1;
    assert!(decode(&source, &binding()).is_err());
    let mut source = page();
    source.events[0].entity_version = u64::MAX;
    assert!(decode(&source, &binding()).is_err());
    let mut source = page();
    source.events[0].payload = json!({"large":"é".repeat(MAX_PAYLOAD_BYTES / 3)});
    assert!(decode(&source, &binding()).is_err());
}

#[test]
fn source_positions_above_javascript_safe_integer_remain_exact() {
    let mut b = binding();
    let mut source = page();
    let base = 9_007_199_254_740_993_u64;
    b.after_sequence = base;
    b.through_sequence = base + 8;
    b.retention_floor = base + 1;
    source.after_sequence = base;
    source.scanned_through_sequence = base + 8;
    source.published_head_sequence = base + 20;
    for event in &mut source.events {
        event.published_source_sequence += base;
    }
    let checked = decode(&source, &b).unwrap();
    assert_eq!(checked.page().events[0].published_source_sequence, base + 2);
}

fn bootstrap_binding() -> Binding {
    Binding {
        source: EventStreamBinding {
            stream_id: "p16.fixture".into(),
            contract_revision: "p16.fixture.v1".into(),
            workspace_id: CanonicalId::parse("workspace_fixture").unwrap(),
            environment: "paper".into(),
            profile_id: "paper_fixture".into(),
            venue_id: "FIXTURE".into(),
            resource_kind: "portfolio".into(),
            resource_id: "portfolio_fixture".into(),
            filter_digest: format!("sha256:{}", digest('c')),
        },
        source_epoch: "epoch_fixture".into(),
        consumer_id: "edge_fixture".into(),
        principal_digest: format!("sha256:{}", digest('d')),
        policy_revision: "policy_fixture".into(),
        query_digest: format!("sha256:{}", digest('e')),
        consistency_group: "portfolio_fixture".into(),
        datasets: BTreeMap::from([("orders".into(), "orders.fixture.v1".into())]),
    }
}

struct Denied;
impl SourceProofVerifier for Denied {
    fn verify(&self, _: &Binding, _: &str, _: &str, _: &str, _: i64) -> bool {
        false
    }
}

#[test]
fn checked_hashes_never_substitute_for_authenticated_source_proof() {
    let checked = decode(&page(), &binding()).unwrap();
    assert!(matches!(
        checked.authenticate(&bootstrap_binding(), "fixture-proof", &Denied, 10),
        Err(ProtocolError::Untrusted)
    ));
    for mutate in [0, 1, 2, 3, 4] {
        let mut b = bootstrap_binding();
        match mutate {
            0 => b.source.environment = "live".into(),
            1 => b.source_epoch = "replacement_epoch".into(),
            2 => b.consumer_id = "different_consumer".into(),
            3 => b.source.filter_digest = format!("sha256:{}", digest('f')),
            _ => {
                b.datasets
                    .insert("orders".into(), "different-schema".into());
            }
        }
        assert!(matches!(
            decode(&page(), &binding())
                .unwrap()
                .authenticate(&b, "fixture-proof", &Denied, 10),
            Err(ProtocolError::Scope)
        ));
    }
}

#[test]
fn bootstrap_verifier_binds_exact_selected_scan_and_proof_kind() {
    // TEST_ONLY trusted verifier: no credential or runtime implementation.
    struct FixtureVerifier {
        expected: String,
    }
    impl SourceProofVerifier for FixtureVerifier {
        fn verify(&self, _: &Binding, kind: &str, hash: &str, proof: &str, _: i64) -> bool {
            kind == "P16_READ_PAGE" && hash == self.expected && proof == "TEST_ONLY"
        }
    }
    let checked = decode(&page(), &binding()).unwrap();
    let verifier = FixtureVerifier {
        expected: projection_core::canonical_digest(&checked).unwrap(),
    };
    let scope = bootstrap_binding();
    let authenticated = checked
        .authenticate(&scope, "TEST_ONLY", &verifier, 10)
        .unwrap();
    assert!(authenticated.check(&scope, "P16_READ_PAGE", 10).is_ok());
    assert!(authenticated.check(&scope, "DELTA_GROUP", 10).is_err());
    assert!(authenticated
        .check(&scope, "P16_READ_PAGE", 30_011)
        .is_err());
    let mut altered = page();
    altered.published_head_sequence += 1;
    assert!(matches!(
        decode(&altered, &binding())
            .unwrap()
            .authenticate(&scope, "TEST_ONLY", &verifier, 10),
        Err(ProtocolError::Untrusted)
    ));
}
