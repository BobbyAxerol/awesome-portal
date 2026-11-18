//! Synthetic isolated contract tests, not source publication evidence.

use super::*;
use crate::{EventOperation, SourcePosition};
use execution_contracts::CanonicalId;
use projection_core::canonical_value_digest;
use serde_json::json;

const NOW: i64 = 1_792_100_000_000;

fn digest(letter: char) -> String {
    format!("sha256:{}", letter.to_string().repeat(64))
}

fn limits() -> Limits {
    Limits {
        page_rows: 200,
        page_bytes: 1024 * 1024,
        group_events: 1_000,
        group_bytes: 8 * 1024 * 1024,
        group_chunks: 64,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}

fn binding() -> Binding {
    Binding {
        source: EventStreamBinding {
            stream_id: "fixture.scoped.v1".to_owned(),
            contract_revision: "fixture.scoped.v1".to_owned(),
            workspace_id: CanonicalId::parse("workspace_fixture").unwrap(),
            environment: "paper".to_owned(),
            profile_id: "PAPER_FIXTURE".to_owned(),
            venue_id: "FIXTURE".to_owned(),
            resource_kind: "portfolio".to_owned(),
            resource_id: "portfolio_fixture".to_owned(),
            filter_digest: digest('a'),
        },
        source_epoch: "epoch_fixture".to_owned(),
        consumer_id: "consumer_fixture".to_owned(),
        principal_digest: digest('b'),
        policy_revision: "policy_1".to_owned(),
        query_digest: digest('c'),
        consistency_group: "portfolio_fixture".to_owned(),
        datasets: BTreeMap::from([("orders".to_owned(), "orders.fixture.v1".to_owned())]),
    }
}

fn manifest() -> Manifest {
    let mut manifest = Manifest {
        binding: binding(),
        generation: Uuid::from_u128(1),
        snapshot_id: "snapshot_fixture".to_owned(),
        barrier: "opaque_barrier".to_owned(),
        delta_start: "opaque_overlap_start".to_owned(),
        catchup_cursor: "opaque_catchup".to_owned(),
        expires_at_ms: NOW + 60_000,
        rollback_until_ms: NOW + 120_000,
        pages: BTreeMap::new(),
        references: Vec::new(),
    };
    manifest.pages.insert(
        "orders".to_owned(),
        PagePlan {
            count: 0,
            final_digest: page_seed(&manifest, "orders").unwrap(),
        },
    );
    manifest
}

fn row() -> SnapshotRow {
    SnapshotRow {
        dataset: "orders".to_owned(),
        entity_id: "order_fixture".to_owned(),
        revision: Revision {
            ordinal: 1,
            opaque: "v_opaque_1".to_owned(),
        },
        payload: json!({"amount": "80.0000", "currency": "USDT", "nullable": null}),
    }
}

fn page_fixture() -> (Manifest, SnapshotPage) {
    let mut manifest = manifest();
    let page = SnapshotPage {
        generation: manifest.generation,
        dataset: "orders".to_owned(),
        index: 0,
        previous_digest: page_seed(&manifest, "orders").unwrap(),
        rows: vec![row()],
    };
    manifest.pages.insert(
        "orders".to_owned(),
        PagePlan {
            count: 1,
            final_digest: page.chain_digest().unwrap(),
        },
    );
    (manifest, page)
}

fn delta(ordinal: u64) -> DeltaEvent {
    let payload = json!({"amount": "80.0000", "currency": "USDT"});
    DeltaEvent {
        event: AuthoritativeEvent {
            event_id: CanonicalId::parse(format!("event_fixture_{ordinal}")).unwrap(),
            source_position: SourcePosition::new("epoch_fixture", ordinal.to_string()).unwrap(),
            entity_kind: "orders".to_owned(),
            entity_id: CanonicalId::parse("order_fixture").unwrap(),
            entity_version: format!("v_opaque_{ordinal}"),
            payload_schema_revision: "orders.fixture.v1".to_owned(),
            operation: EventOperation::Upsert,
            event_time_ms: NOW,
            source_published_at_ms: NOW + 1,
            correction_of_event_id: None,
            tombstone_of_event_id: None,
            causation_id: None,
            correlation_id: None,
            payload_digest: canonical_value_digest(&payload),
            payload,
        },
        revision: Revision {
            ordinal,
            opaque: format!("v_opaque_{ordinal}"),
        },
    }
}

fn chunk(manifest: &Manifest) -> DeltaChunk {
    DeltaChunk {
        generation: manifest.generation,
        group_id: "group_fixture".to_owned(),
        index: 0,
        events: vec![delta(1)],
    }
}

fn group(manifest: &Manifest, chunk: &DeltaChunk) -> DeltaGroup {
    DeltaGroup {
        generation: manifest.generation,
        group_id: chunk.group_id.clone(),
        from_cursor: manifest.delta_start.clone(),
        to_cursor: manifest.catchup_cursor.clone(),
        chunk_digests: vec![chunk.digest().unwrap()],
        events_digest: events_digest(&chunk.events).unwrap(),
        reached_catchup: true,
    }
}

/// `TEST_ONLY` exact preapproved tuple, not a signature verifier or runtime adapter.
struct FixtureVerifier {
    binding: String,
    kind: String,
    input: String,
    not_after_ms: i64,
}

impl SourceProofVerifier for FixtureVerifier {
    fn verify(&self, binding: &Binding, kind: &str, input: &str, proof: &str, now: i64) -> bool {
        binding.digest().ok().as_ref() == Some(&self.binding)
            && kind == self.kind
            && input == self.input
            && proof == "TEST_ONLY_preapproved_proof"
            && now <= self.not_after_ms
    }
}

fn verifier<T: Serialize>(value: &T, binding: &Binding, kind: &str) -> FixtureVerifier {
    FixtureVerifier {
        binding: binding.digest().unwrap(),
        kind: kind.to_owned(),
        input: hash(value).unwrap(),
        not_after_ms: NOW + 30_000,
    }
}

#[test]
fn binding_digest_changes_but_replacement_retains_fencing_slot() {
    let original = binding();
    original.validate().unwrap();
    for changed in [
        Binding {
            policy_revision: "policy_2".to_owned(),
            ..original.clone()
        },
        Binding {
            principal_digest: digest('d'),
            ..original.clone()
        },
        Binding {
            source_epoch: "epoch_2".to_owned(),
            ..original.clone()
        },
        Binding {
            query_digest: digest('e'),
            ..original.clone()
        },
    ] {
        assert_ne!(original.digest().unwrap(), changed.digest().unwrap());
        assert_eq!(original.slot_key().unwrap(), changed.slot_key().unwrap());
    }
    let other = Binding {
        consumer_id: "other_consumer".to_owned(),
        ..original.clone()
    };
    assert_ne!(original.slot_key().unwrap(), other.slot_key().unwrap());
    let mut other = original.clone();
    other.source.environment = "live".to_owned();
    assert_ne!(original.slot_key().unwrap(), other.slot_key().unwrap());
}

#[test]
fn malformed_binding_and_unbounded_opaque_metadata_fail_closed() {
    let mut value = binding();
    value.datasets.clear();
    assert_eq!(value.validate(), Err(ProtocolError::Invalid));
    value = binding();
    value.principal_digest = "not_a_digest".to_owned();
    assert!(value.validate().is_err());
    let mut value = manifest();
    value.barrier = "\nleaking_control".to_owned();
    assert!(value.validate(&limits(), NOW).is_err());
    value.barrier = "a".repeat(MAX_OPAQUE_BYTES + 1);
    assert!(value.validate(&limits(), NOW).is_err());
}

#[test]
fn revisions_are_positive_explicit_and_database_safe_not_opaque_sorting() {
    let mut revision = Revision {
        ordinal: MAX_ORDINAL,
        opaque: "v_z".to_owned(),
    };
    revision.validate().unwrap();
    revision.ordinal = 0;
    assert_eq!(revision.validate(), Err(ProtocolError::Bounds));
    revision.ordinal = MAX_ORDINAL + 1;
    assert_eq!(revision.validate(), Err(ProtocolError::Bounds));
    revision.ordinal = 2;
    revision.opaque = "v_a".to_owned();
    revision.validate().unwrap();
}

#[test]
fn wire_counters_are_exact_canonical_strings_and_reject_numeric_coercion() {
    let revision = Revision {
        ordinal: MAX_ORDINAL,
        opaque: "v_opaque".to_owned(),
    };
    let json = serde_json::to_value(&revision).unwrap();
    assert_eq!(json["ordinal"], "9223372036854775807");
    assert_eq!(serde_json::from_value::<Revision>(json).unwrap(), revision);
    for invalid in [
        json!(1),
        json!("01"),
        json!("-1"),
        json!("1e3"),
        json!("9223372036854775808"),
    ] {
        assert!(serde_json::from_value::<Revision>(json!({
            "ordinal": invalid, "opaque": "v_opaque",
        }))
        .is_err());
    }
    let (manifest, page) = page_fixture();
    assert_eq!(serde_json::to_value(&page).unwrap()["index"], "0");
    assert_eq!(
        serde_json::to_value(&manifest).unwrap()["pages"]["orders"]["count"],
        "1"
    );
    assert_eq!(
        serde_json::to_value(chunk(&manifest)).unwrap()["index"],
        "0"
    );
}

#[test]
fn empty_snapshot_has_exact_complete_dataset_set_and_seed() {
    let mut value = manifest();
    value.validate(&limits(), NOW).unwrap();
    value.pages.clear();
    assert_eq!(value.validate(&limits(), NOW), Err(ProtocolError::Scope));
    value = manifest();
    value.pages.get_mut("orders").unwrap().final_digest = digest('f');
    assert_eq!(
        value.validate(&limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    value = manifest();
    value.generation = Uuid::nil();
    assert!(value.validate(&limits(), NOW).is_err());
}

#[test]
fn manifest_lifetimes_are_explicit_finite_and_not_renewed_implicitly() {
    let mut value = manifest();
    value.expires_at_ms = NOW;
    assert_eq!(value.validate(&limits(), NOW), Err(ProtocolError::Expired));
    value.expires_at_ms = NOW + MAX_LIFETIME_MS + 1;
    assert_eq!(value.validate(&limits(), NOW), Err(ProtocolError::Bounds));
    value = manifest();
    value.rollback_until_ms = NOW + MAX_LIFETIME_MS + 1;
    assert_eq!(value.validate(&limits(), NOW), Err(ProtocolError::Bounds));
    assert_eq!(value.validate(&limits(), -1), Err(ProtocolError::Bounds));
}

#[test]
fn references_are_declared_unique_edges_without_source_inference() {
    let mut value = manifest();
    let reference = Reference {
        from_dataset: "orders".to_owned(),
        field: "parent_id".to_owned(),
        to_dataset: "orders".to_owned(),
    };
    value.references.push(reference.clone());
    value.validate(&limits(), NOW).unwrap();
    value.references.push(reference);
    assert_eq!(
        value.validate(&limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    value.references.pop();
    value.references[0].to_dataset = "hidden_dataset".to_owned();
    assert_eq!(value.validate(&limits(), NOW), Err(ProtocolError::Scope));
}

#[test]
fn authenticated_page_preserves_exact_payload_and_covers_all_chain_fields() {
    let (manifest, page) = page_fixture();
    page.validate(&manifest, &limits(), NOW).unwrap();
    assert_eq!(page.rows[0].payload["amount"], "80.0000");
    assert!(page.rows[0].payload["nullable"].is_null());
    let mut changed = page.clone();
    changed.rows[0].payload["amount"] = json!("80.00");
    assert_ne!(
        page.chain_digest().unwrap(),
        changed.chain_digest().unwrap()
    );
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    changed = page.clone();
    changed.previous_digest = digest('f');
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    changed = page.clone();
    changed.generation = Uuid::from_u128(2);
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Scope)
    );
    changed = page;
    changed.index = 1;
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
}

#[test]
fn page_rejects_duplicate_cross_dataset_keys_bounds_and_expiry() {
    let (manifest, mut page) = page_fixture();
    page.rows.push(row());
    assert_eq!(
        page.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    page.rows.pop();
    page.rows[0].dataset = "other".to_owned();
    assert_eq!(
        page.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Scope)
    );
    let (_, page) = page_fixture();
    let mut tiny = limits();
    tiny.page_bytes = 1;
    assert_eq!(
        page.validate(&manifest, &tiny, NOW),
        Err(ProtocolError::Bounds)
    );
    assert_eq!(
        page.validate(&manifest, &limits(), manifest.expires_at_ms),
        Err(ProtocolError::Expired)
    );
}

#[test]
fn page_expiry_is_independent_of_old_projection_rollback_deadline() {
    let (mut manifest, page) = page_fixture();
    manifest.rollback_until_ms = NOW + 1;
    page.validate(&manifest, &limits(), NOW + 2).unwrap();
}

#[test]
fn delta_requires_exact_declared_epoch_schema_and_opaque_revision() {
    let manifest = manifest();
    delta(1).validate(&manifest).unwrap();
    let mut event = delta(1);
    event.revision.opaque = "other".to_owned();
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Scope));
    event = delta(1);
    event.event.payload_schema_revision = "other.v1".to_owned();
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Scope));
    event = delta(1);
    event.event.source_position.source_epoch = "other_epoch".to_owned();
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Scope));
    event = delta(1);
    event.event.payload["amount"] = json!("81.0000");
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Invalid));
}

#[test]
fn correction_and_tombstone_keep_original_immutable_target_identity() {
    let manifest = manifest();
    let mut event = delta(2);
    event.event.operation = EventOperation::Correction;
    event.event.correction_of_event_id = Some(CanonicalId::parse("event_fixture_1").unwrap());
    event.validate(&manifest).unwrap();
    event.event.correction_of_event_id = None;
    assert!(event.validate(&manifest).is_err());
    event.event.operation = EventOperation::Tombstone;
    event.event.tombstone_of_event_id = Some(CanonicalId::parse("event_fixture_1").unwrap());
    event.validate(&manifest).unwrap();
    event.event.tombstone_of_event_id = Some(event.event.event_id.clone());
    assert!(event.validate(&manifest).is_err());
}

#[test]
fn delta_ids_and_timestamps_are_bounded_without_rewriting_payload() {
    let manifest = manifest();
    let mut event = delta(1);
    event.event.entity_id = CanonicalId::parse("a".repeat(161)).unwrap();
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Invalid));
    event = delta(1);
    event.event.causation_id = Some(CanonicalId::parse("bad\nidentifier").unwrap());
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Invalid));
    event = delta(1);
    event.event.event_time_ms = -1;
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Bounds));
    event = delta(1);
    event.event.source_published_at_ms = MAX_TIMESTAMP_MS + 1;
    assert_eq!(event.validate(&manifest), Err(ProtocolError::Bounds));
}

#[test]
fn complete_group_hashes_ordered_events_and_chunks() {
    let manifest = manifest();
    let mut chunk = chunk(&manifest);
    chunk.events.push(delta(2));
    let group = group(&manifest, &chunk);
    chunk.validate(&manifest, &limits(), NOW).unwrap();
    group.validate(&manifest, &limits(), NOW).unwrap();
    let mut reversed = chunk.events.clone();
    reversed.reverse();
    assert_ne!(
        events_digest(&chunk.events).unwrap(),
        events_digest(&reversed).unwrap()
    );
    let mut changed = chunk.clone();
    changed.index = 1;
    assert_ne!(chunk.digest().unwrap(), changed.digest().unwrap());
    let mut changed = group;
    changed.to_cursor = "not_the_catchup_cut".to_owned();
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
}

#[test]
fn filtered_hidden_only_group_advances_opaque_scan_without_visible_records() {
    let manifest = manifest();
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: "hidden_scan_fixture".to_owned(),
        from_cursor: manifest.delta_start.clone(),
        to_cursor: manifest.catchup_cursor.clone(),
        chunk_digests: Vec::new(),
        events_digest: events_digest(&[]).unwrap(),
        reached_catchup: true,
    };
    group.validate(&manifest, &limits(), NOW).unwrap();
    let json = serde_json::to_value(&group).unwrap();
    assert!(json.get("hidden_count").is_none());
    assert!(json.get("hidden_ids").is_none());
    let mut changed = group;
    changed.events_digest = digest('f');
    assert_eq!(
        changed.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
}

#[test]
fn ready_delta_stream_does_not_expire_with_its_historical_snapshot() {
    let manifest = manifest();
    let chunk = chunk(&manifest);
    let group = group(&manifest, &chunk);
    let later = manifest.rollback_until_ms + 1;
    manifest.validate_structure().unwrap();
    assert_eq!(
        manifest.validate(&limits(), later),
        Err(ProtocolError::Expired)
    );
    chunk.validate(&manifest, &limits(), later).unwrap();
    group.validate(&manifest, &limits(), later).unwrap();
}

#[test]
fn group_and_chunk_reject_bounds_duplicate_hashes_and_other_generation() {
    let manifest = manifest();
    let mut chunk = chunk(&manifest);
    let mut group = group(&manifest, &chunk);
    group.chunk_digests.push(group.chunk_digests[0].clone());
    assert_eq!(
        group.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Integrity)
    );
    chunk.index = 64;
    assert_eq!(
        chunk.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Bounds)
    );
    chunk.index = 0;
    chunk.generation = Uuid::from_u128(2);
    assert_eq!(
        chunk.validate(&manifest, &limits(), NOW),
        Err(ProtocolError::Scope)
    );
    chunk.generation = manifest.generation;
    let mut tiny = limits();
    tiny.group_bytes = 1;
    assert_eq!(
        chunk.validate(&manifest, &tiny, NOW),
        Err(ProtocolError::Bounds)
    );
}

#[test]
fn complete_group_allows_exact_replay_but_not_conflicting_source_identities() {
    let manifest = manifest();
    assert_eq!(
        validate_events(&[delta(3), delta(1)], &manifest, &limits()),
        Err(ProtocolError::Integrity)
    );
    let first = delta(1);
    validate_events(
        &[first.clone(), first.clone(), delta(3)],
        &manifest,
        &limits(),
    )
    .unwrap();
    let mut conflict = first.clone();
    conflict.event.payload["amount"] = json!("81.0000");
    conflict.event.payload_digest = canonical_value_digest(&conflict.event.payload);
    assert_eq!(
        validate_events(&[first.clone(), conflict], &manifest, &limits()),
        Err(ProtocolError::Integrity)
    );
    let mut other_id = first.clone();
    other_id.event.event_id = CanonicalId::parse("other_event_at_same_position").unwrap();
    assert_eq!(
        validate_events(&[first, other_id], &manifest, &limits()),
        Err(ProtocolError::Integrity)
    );
}

#[test]
fn delta_projection_rows_fit_one_page_without_truncation() {
    let manifest = manifest();
    let mut tiny = limits();
    tiny.page_bytes = 1;
    assert_eq!(
        validate_events(&[delta(1)], &manifest, &tiny),
        Err(ProtocolError::Bounds)
    );
    assert_eq!(
        chunk(&manifest).validate(&manifest, &tiny, NOW),
        Err(ProtocolError::Bounds)
    );
}

#[test]
fn all_explicit_safety_limits_fail_closed_above_ceiling_or_zero() {
    let baseline = limits();
    baseline.validate().unwrap();
    for invalid in [
        Limits {
            page_rows: 201,
            ..baseline
        },
        Limits {
            page_rows: 0,
            ..baseline
        },
        Limits {
            page_bytes: MAX_PAGE_BYTES + 1,
            ..baseline
        },
        Limits {
            group_events: 1_001,
            ..baseline
        },
        Limits {
            group_bytes: MAX_GROUP_BYTES + 1,
            ..baseline
        },
        Limits {
            group_chunks: 65,
            ..baseline
        },
        Limits {
            snapshot_ttl_ms: 300_001,
            ..baseline
        },
        Limits {
            rollback_ttl_ms: -1,
            ..baseline
        },
    ] {
        assert_eq!(invalid.validate(), Err(ProtocolError::Bounds));
    }
}

#[test]
fn source_proof_authentication_requires_exact_input_kind_and_binding() {
    let value = manifest();
    let proof_checker = verifier(&value, &value.binding, "manifest");
    let verified = Verified::authenticate(
        value.clone(),
        &value.binding,
        "manifest",
        "TEST_ONLY_preapproved_proof",
        &proof_checker,
        NOW,
    )
    .unwrap();
    assert_eq!(verified.value(), &value);
    verified.check(&value.binding, "manifest", NOW).unwrap();
    assert_eq!(
        verified.check(&value.binding, "page", NOW),
        Err(ProtocolError::Scope)
    );
    let mut changed_binding = value.binding.clone();
    changed_binding.policy_revision = "policy_2".to_owned();
    assert_eq!(
        verified.check(&changed_binding, "manifest", NOW),
        Err(ProtocolError::Scope)
    );
    let mut changed = value.clone();
    changed.barrier = "tampered_cut".to_owned();
    assert!(matches!(
        Verified::authenticate(
            changed,
            &value.binding,
            "manifest",
            "TEST_ONLY_preapproved_proof",
            &proof_checker,
            NOW,
        ),
        Err(ProtocolError::Untrusted)
    ));
    assert!(matches!(
        Verified::authenticate(
            value.clone(),
            &value.binding,
            "manifest",
            "wrong_proof",
            &proof_checker,
            NOW,
        ),
        Err(ProtocolError::Untrusted)
    ));
}

#[test]
fn proof_handoff_is_bounded_nonrenewable_and_future_clock_fails_closed() {
    let value = manifest();
    let proof_checker = verifier(&value, &value.binding, "manifest");
    let verified = Verified::authenticate(
        value.clone(),
        &value.binding,
        "manifest",
        "TEST_ONLY_preapproved_proof",
        &proof_checker,
        NOW,
    )
    .unwrap();
    verified
        .check(&value.binding, "manifest", NOW + 30_000)
        .unwrap();
    assert_eq!(
        verified.check(&value.binding, "manifest", NOW + 30_001),
        Err(ProtocolError::Expired)
    );
    assert_eq!(
        verified.check(&value.binding, "manifest", NOW - 1),
        Err(ProtocolError::Expired)
    );
    assert!(matches!(
        Verified::authenticate(
            value.clone(),
            &value.binding,
            "manifest",
            "TEST_ONLY_preapproved_proof",
            &proof_checker,
            NOW + 30_001,
        ),
        Err(ProtocolError::Untrusted)
    ));
}

#[test]
fn unknown_contract_fields_cannot_silently_change_protocol_semantics() {
    let mut json = serde_json::to_value(manifest()).unwrap();
    json["source_complete"] = json!(true);
    assert!(serde_json::from_value::<Manifest>(json).is_err());
}

#[test]
fn metadata_and_pre_auth_hash_inputs_have_bounded_nonallocating_serialization() {
    let mut manifest = manifest();
    let mut tiny = limits();
    tiny.page_bytes = 1;
    assert_eq!(manifest.validate(&tiny, NOW), Err(ProtocolError::Bounds));
    manifest.references = vec![
        Reference {
            from_dataset: "orders".to_owned(),
            field: "parent_id".to_owned(),
            to_dataset: "orders".to_owned(),
        };
        MAX_PAGE_BYTES / 32
    ];
    assert_eq!(manifest.validate_structure(), Err(ProtocolError::Bounds));
    let small = binding();
    let verifier = verifier(&small, &small, "CONTROL");
    let oversized = json!({"padding": "x".repeat(MAX_GROUP_BYTES)});
    assert!(matches!(
        Verified::authenticate(
            oversized,
            &small,
            "CONTROL",
            "TEST_ONLY_preapproved_proof",
            &verifier,
            NOW,
        ),
        Err(ProtocolError::Bounds)
    ));
    // A writer consumes no more than its limit and returns no partial success.
    let mut writer = ByteBound {
        written: 0,
        maximum: 2,
        exceeded: false,
    };
    assert_eq!(io::Write::write(&mut writer, b"ok").unwrap(), 2);
    assert!(io::Write::write(&mut writer, b"x").is_err());
    assert_eq!(writer.written, 2);
}
