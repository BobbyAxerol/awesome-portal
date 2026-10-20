//! `TEST_ONLY` source-shaped fixtures; no source, auth, HTTP, DB or native proof.
use authoritative_event_core::bootstrap::{page_seed, DeltaEvent, PagePlan};
use serde_json::json;
use sha2::{Digest as _, Sha256};

use super::*;

const NOW: i64 = 1_792_100_000_000;

fn mark(letter: char) -> String {
    format!("pmrb1.{}", letter.to_string().repeat(43))
}

fn digest(payload: &Value) -> String {
    format!(
        "sha256:{}",
        hex::encode(Sha256::digest(serde_json::to_vec(payload).unwrap()))
    )
}

fn binding() -> Binding {
    serde_json::from_value(json!({
        "source": {
            "stream_id":"TEST_ONLY.reports", "contract_revision":"TEST_ONLY.v1",
            "workspace_id":"TEST_ONLY_workspace", "environment":"paper",
            "profile_id":"TEST_ONLY_profile", "venue_id":"TEST_ONLY",
            "resource_kind":"reports", "resource_id":"TEST_ONLY_reports",
            "filter_digest":format!("sha256:{}", "a".repeat(64))
        },
        "source_epoch":"TEST_ONLY_epoch", "consumer_id":"TEST_ONLY_consumer",
        "principal_digest":format!("sha256:{}", "b".repeat(64)),
        "policy_revision":"TEST_ONLY_policy", "query_digest":format!("sha256:{}", "c".repeat(64)),
        "consistency_group":"TEST_ONLY_reports",
        "datasets":{(DATASET):PAYLOAD_SCHEMA}
    }))
    .unwrap()
}

fn limits() -> Limits {
    Limits {
        page_rows: 2,
        page_bytes: MAX_WIRE_BYTES,
        group_events: 4,
        group_bytes: MAX_WIRE_BYTES,
        group_chunks: 4,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}

fn wire() -> ReportPublicationWire {
    ReportPublicationWire::new(binding(), limits()).unwrap()
}

fn snapshot(rows: usize) -> (Manifest, Vec<SnapshotPage>) {
    let mut manifest: Manifest = serde_json::from_value(json!({
        "binding":binding(), "generation":"00000000-0000-4000-8000-000000000001",
        "snapshot_id":"TEST_ONLY_snapshot", "barrier":mark('A'), "delta_start":mark('A'),
        "catchup_cursor":mark('A'), "expires_at_ms":NOW+60_000,
        "rollback_until_ms":NOW+120_000, "references":[],
        "pages":{(DATASET):{"count":"0", "final_digest":format!("sha256:{}", "d".repeat(64))}}
    }))
    .unwrap();
    let mut previous = page_seed(&manifest, DATASET).unwrap();
    let mut pages = Vec::new();
    for start in (0..rows).step_by(2) {
        let data: Vec<_> = (start..rows.min(start + 2))
            .map(|index| {
                json!({
                    "dataset":DATASET, "entity_id":format!("TEST_ONLY_report_{index}"),
                    "revision":{"ordinal":"1", "opaque":"TEST_ONLY_publication_v1"},
                    "payload":{"amount":"12345678901234567890.000000000000000001",
                        "unavailable":null, "ownership":"AS_PUBLISHED_NOT_CURRENT"}
                })
            })
            .collect();
        let page: SnapshotPage = serde_json::from_value(json!({
            "generation":manifest.generation, "dataset":DATASET,
            "index":pages.len().to_string(), "previous_digest":previous, "rows":data
        }))
        .unwrap();
        previous = page.chain_digest().unwrap();
        pages.push(page);
    }
    manifest.pages.insert(
        DATASET.into(),
        PagePlan {
            count: u64::try_from(pages.len()).unwrap(),
            final_digest: previous,
        },
    );
    (manifest, pages)
}

fn raw_snapshot(manifest: &Manifest, pages: &[SnapshotPage]) -> Value {
    json!({"manifest":manifest, "pages":pages})
}

fn bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
}

fn event(manifest: &Manifest, sequence: u64) -> DeltaEvent {
    let payload = json!({"amount":"1.000000000000000001", "unavailable":null});
    serde_json::from_value(json!({
        "revision":{"ordinal":sequence.to_string(), "opaque":format!("TEST_ONLY_revision_{sequence}")},
        "event":{
            "event_id":format!("TEST_ONLY_event_{sequence}"),
            "source_position":{"source_epoch":manifest.binding.source_epoch, "source_sequence":sequence.to_string()},
            "entity_kind":DATASET, "entity_id":"TEST_ONLY_report", "entity_version":format!("TEST_ONLY_revision_{sequence}"),
            "payload_schema_revision":PAYLOAD_SCHEMA, "operation":"UPSERT", "event_time_ms":NOW,
            "source_published_at_ms":NOW, "correction_of_event_id":null, "tombstone_of_event_id":null,
            "causation_id":null, "correlation_id":null, "payload_digest":digest(&payload), "payload":payload
        }
    })).unwrap()
}

fn tail(manifest: &Manifest, events: &[DeltaEvent]) -> Value {
    let chunks = if events.is_empty() {
        vec![]
    } else {
        vec![DeltaChunk {
            generation: manifest.generation,
            group_id: "TEST_ONLY_commit".into(),
            index: 0,
            events: events.to_owned(),
        }]
    };
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: "TEST_ONLY_commit".into(),
        from_cursor: mark('A'),
        to_cursor: mark('B'),
        chunk_digests: chunks.iter().map(|chunk| chunk.digest().unwrap()).collect(),
        events_digest: events_digest(events).unwrap(),
        reached_catchup: false,
    };
    json!({"group":group, "chunks":chunks})
}

#[test]
fn requests_have_exact_fixed_routes_and_integer_request_index() {
    let wire = wire();
    let (manifest, _) = snapshot(3);
    assert_eq!(
        ReportPublicationWire::snapshot_request().path(),
        SNAPSHOT_PATH
    );
    assert_eq!(ReportPublicationWire::snapshot_request().body(), b"{}");
    let page = wire.page_request(&manifest, 1, NOW).unwrap();
    assert_eq!(page.path(), PAGE_PATH);
    assert_eq!(page.body(), bytes(&json!({"index":1,"manifest":manifest})));
    assert_eq!(
        serde_json::from_slice::<Value>(page.body()).unwrap()["index"],
        1
    );
    let delta = wire.delta_request(&manifest, &mark('A'), NOW).unwrap();
    assert_eq!(delta.path(), DELTA_PATH);
    assert_eq!(
        delta.body(),
        bytes(&json!({"cursor":mark('A'),"manifest":manifest}))
    );
}

#[test]
fn constructor_rejects_other_datasets_and_oversized_http_group_bound() {
    let mut foreign = binding();
    foreign.datasets.insert("orders".into(), "orders.v1".into());
    assert!(ReportPublicationWire::new(foreign, limits()).is_err());
    let mut wrong = binding();
    wrong.datasets.insert(DATASET.into(), "wrong.v1".into());
    assert!(ReportPublicationWire::new(wrong, limits()).is_err());
    let mut big = limits();
    big.group_bytes += 1;
    assert!(ReportPublicationWire::new(binding(), big).is_err());
}

#[test]
fn snapshot_preserves_decimal_null_and_as_published_payload() {
    let (manifest, pages) = snapshot(3);
    let decoded = wire()
        .decode_snapshot(&bytes(&raw_snapshot(&manifest, &pages)), NOW)
        .unwrap();
    assert_eq!(decoded.manifest(), &manifest);
    assert_eq!(decoded.pages(), pages);
    assert_eq!(
        decoded.pages()[0].rows[0].payload["amount"],
        "12345678901234567890.000000000000000001"
    );
    assert!(decoded.pages()[0].rows[0].payload["unavailable"].is_null());
}

#[test]
fn empty_snapshot_keeps_explicit_zero_page_hash_plan() {
    let (manifest, pages) = snapshot(0);
    assert!(wire()
        .decode_snapshot(&bytes(&raw_snapshot(&manifest, &pages)), NOW)
        .is_ok());
}

#[test]
fn snapshot_rejects_foreign_binding_generation_and_expiry() {
    let (manifest, pages) = snapshot(1);
    for field in ["policy_revision", "source_epoch", "consumer_id"] {
        let mut raw = raw_snapshot(&manifest, &pages);
        raw["manifest"]["binding"][field] = json!("TEST_ONLY_changed");
        assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    }
    let mut raw = raw_snapshot(&manifest, &pages);
    raw["pages"][0]["generation"] = json!("00000000-0000-4000-8000-000000000002");
    assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    assert!(wire()
        .decode_snapshot(&bytes(&raw_snapshot(&manifest, &pages)), NOW + 60_000)
        .is_err());
}

#[test]
fn requests_refuse_foreign_manifest_invalid_cursor_and_page_range() {
    let (mut manifest, _) = snapshot(1);
    assert!(wire().page_request(&manifest, 1, NOW).is_err());
    assert!(wire().page_request(&manifest, 0, NOW + 60_000).is_err());
    assert!(wire().delta_request(&manifest, "invalid", NOW).is_err());
    assert!(wire().delta_request(&manifest, &mark('A'), -1).is_err());
    manifest.binding.principal_digest = format!("sha256:{}", "e".repeat(64));
    assert!(wire().delta_request(&manifest, &mark('A'), NOW).is_err());
}

#[test]
fn snapshot_and_tail_reject_empty_oversized_or_trailing_json() {
    let (manifest, _) = snapshot(0);
    for raw in [
        vec![],
        vec![b' '; MAX_WIRE_BYTES + 1],
        b"{} {}".to_vec(),
        b"null".to_vec(),
    ] {
        assert!(wire().decode_snapshot(&raw, NOW).is_err());
        assert!(wire()
            .decode_delta(&raw, &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn duplicate_fields_at_any_depth_are_rejected() {
    let (manifest, pages) = snapshot(1);
    let raw = String::from_utf8(bytes(&raw_snapshot(&manifest, &pages))).unwrap();
    for corrupt in [
        raw.replace(
            "\"unavailable\":null",
            "\"unavailable\":null,\"unavailable\":null",
        ),
        raw.replacen("\"manifest\":", "\"pages\":[],\"manifest\":", 1),
    ] {
        assert!(wire().decode_snapshot(corrupt.as_bytes(), NOW).is_err());
    }
}

#[test]
fn unknown_envelope_source_and_page_fields_are_rejected() {
    let (manifest, pages) = snapshot(1);
    for location in [0, 1, 2] {
        let mut raw = raw_snapshot(&manifest, &pages);
        match location {
            0 => raw["extra"] = json!(true),
            1 => raw["manifest"]["binding"]["source"]["extra"] = json!(true),
            _ => raw["pages"][0]["extra"] = json!(true),
        }
        assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    }
}

#[test]
fn snapshot_requires_every_page_in_hash_order() {
    let (manifest, pages) = snapshot(3);
    let mut raw = raw_snapshot(&manifest, &pages);
    raw["pages"].as_array_mut().unwrap().pop();
    assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    let mut raw = raw_snapshot(&manifest, &pages);
    raw["pages"].as_array_mut().unwrap().swap(0, 1);
    assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    let mut raw = raw_snapshot(&manifest, &pages);
    raw["pages"][0]["rows"][0]["payload"]["amount"] = json!("2.0");
    assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
}

#[test]
fn cross_page_duplicate_entity_is_not_a_complete_snapshot() {
    let (mut manifest, mut pages) = snapshot(3);
    pages[1].rows[0].entity_id = pages[0].rows[0].entity_id.clone();
    manifest.pages.get_mut(DATASET).unwrap().final_digest = pages[1].chain_digest().unwrap();
    assert!(wire()
        .decode_snapshot(&bytes(&raw_snapshot(&manifest, &pages)), NOW)
        .is_err());
}

#[test]
fn response_page_counter_requires_canonical_decimal_string() {
    let (manifest, pages) = snapshot(1);
    for index in [
        json!(0),
        json!("00"),
        json!("-1"),
        json!("9223372036854775808"),
    ] {
        let mut raw = serde_json::to_value(&pages[0]).unwrap();
        raw["index"] = index;
        assert!(wire().decode_page(&bytes(&raw), &manifest, 0, NOW).is_err());
    }
    assert_eq!(
        wire()
            .decode_page(
                &bytes(&serde_json::to_value(&pages[0]).unwrap()),
                &manifest,
                0,
                NOW
            )
            .unwrap()
            .page(),
        &pages[0]
    );
}

#[test]
fn page_correlation_and_row_bound_are_enforced() {
    let (manifest, pages) = snapshot(3);
    assert!(wire()
        .decode_page(
            &bytes(&serde_json::to_value(&pages[0]).unwrap()),
            &manifest,
            1,
            NOW
        )
        .is_err());
    let mut raw = serde_json::to_value(&pages[0]).unwrap();
    let extra = raw["rows"][0].clone();
    raw["rows"].as_array_mut().unwrap().push(extra);
    assert!(wire().decode_page(&bytes(&raw), &manifest, 0, NOW).is_err());
}

#[test]
fn changed_cut_reference_and_source_prefix_bound_are_refused() {
    let (manifest, pages) = snapshot(0);
    for selector in [0, 1, 2] {
        let mut raw = raw_snapshot(&manifest, &pages);
        match selector {
            0 => raw["manifest"]["catchup_cursor"] = json!(mark('B')),
            1 => {
                raw["manifest"]["references"] =
                    json!([{"from_dataset":DATASET,"field":"report","to_dataset":DATASET}]);
            }
            _ => raw["manifest"]["pages"][DATASET]["count"] = json!("4097"),
        }
        assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
    }
}

#[test]
fn empty_tail_is_untrusted_and_must_not_include_chunks() {
    let (manifest, _) = snapshot(0);
    let decoded = wire()
        .decode_delta(br#"{"group":null,"chunks":[]}"#, &manifest, &mark('A'), NOW)
        .unwrap();
    assert!(decoded.group().is_none());
    assert!(decoded.chunks().is_empty());
    assert!(wire()
        .decode_delta(br#"{"chunks":[]}"#, &manifest, &mark('A'), NOW)
        .is_err());
    let mut raw = tail(&manifest, &[event(&manifest, 1)]);
    raw["group"] = Value::Null;
    assert!(wire()
        .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
        .is_err());
}

#[test]
fn hidden_only_group_advances_only_opaque_untrusted_cursor() {
    let (manifest, _) = snapshot(0);
    let raw = tail(&manifest, &[]);
    let decoded = wire()
        .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
        .unwrap();
    assert!(decoded.chunks().is_empty());
    assert_eq!(decoded.group().unwrap().to_cursor, mark('B'));
    assert!(!decoded.group().unwrap().reached_catchup);
}

#[test]
fn visible_group_retains_exact_event_payload_and_decimal_sequence() {
    let (manifest, _) = snapshot(0);
    let raw = tail(&manifest, &[event(&manifest, 1), event(&manifest, 3)]);
    let decoded = wire()
        .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
        .unwrap();
    assert_eq!(
        decoded.chunks()[0].events[1]
            .event
            .source_position
            .source_sequence,
        "3"
    );
    assert_eq!(
        decoded.chunks()[0].events[0].event.payload["amount"],
        "1.000000000000000001"
    );
}

#[test]
fn event_position_requires_positive_canonical_decimal_string() {
    let (manifest, _) = snapshot(0);
    for sequence in [
        json!(1),
        json!("0"),
        json!("01"),
        json!("-1"),
        json!("18446744073709551616"),
    ] {
        let mut raw = tail(&manifest, &[event(&manifest, 1)]);
        raw["chunks"][0]["events"][0]["event"]["source_position"]["source_sequence"] = sequence;
        assert!(wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn chunk_count_index_digest_and_event_digest_must_match() {
    let (manifest, _) = snapshot(0);
    let original = tail(&manifest, &[event(&manifest, 1)]);
    for selector in [0, 1, 2, 3] {
        let mut raw = original.clone();
        match selector {
            0 => raw["chunks"] = json!([]),
            1 => raw["chunks"][0]["index"] = json!("1"),
            2 => raw["group"]["chunk_digests"][0] = json!(format!("sha256:{}", "f".repeat(64))),
            _ => raw["group"]["events_digest"] = json!(format!("sha256:{}", "f".repeat(64))),
        }
        assert!(wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn group_requires_exact_generation_from_cursor_progress_and_no_catchup_claim() {
    let (manifest, _) = snapshot(0);
    for selector in [0, 1, 2, 3] {
        let mut raw = tail(&manifest, &[]);
        match selector {
            0 => raw["group"]["generation"] = json!("00000000-0000-4000-8000-000000000002"),
            1 => raw["group"]["from_cursor"] = json!(mark('C')),
            2 => raw["group"]["to_cursor"] = json!(mark('A')),
            _ => raw["group"]["reached_catchup"] = json!(true),
        }
        assert!(wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn expired_snapshot_cannot_page_but_ready_tail_is_not_silently_expired() {
    let (manifest, pages) = snapshot(1);
    assert!(wire()
        .decode_page(
            &bytes(&serde_json::to_value(&pages[0]).unwrap()),
            &manifest,
            0,
            NOW + 300_000
        )
        .is_err());
    assert!(wire()
        .decode_delta(
            br#"{"group":null,"chunks":[]}"#,
            &manifest,
            &mark('A'),
            NOW + 300_000
        )
        .is_ok());
}

#[test]
fn live_page_does_not_depend_on_the_independent_rollback_window() {
    let (mut manifest, mut pages) = snapshot(1);
    manifest.rollback_until_ms = NOW - 1;
    pages[0].previous_digest = page_seed(&manifest, DATASET).unwrap();
    manifest.pages.get_mut(DATASET).unwrap().final_digest = pages[0].chain_digest().unwrap();
    assert!(wire()
        .decode_snapshot(&bytes(&raw_snapshot(&manifest, &pages)), NOW)
        .is_err());
    assert!(wire().page_request(&manifest, 0, NOW).is_ok());
    assert!(wire()
        .decode_page(
            &bytes(&serde_json::to_value(&pages[0]).unwrap()),
            &manifest,
            0,
            NOW
        )
        .is_ok());
}

#[test]
fn complete_group_envelope_must_fit_the_configured_source_cap() {
    let (manifest, _) = snapshot(0);
    let raw = tail(&manifest, &[event(&manifest, 1)]);
    let length = bytes(&raw).len();
    let mut bound = limits();
    bound.group_bytes = length;
    let exact = ReportPublicationWire::new(binding(), bound).unwrap();
    assert!(exact
        .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
        .is_ok());
    bound.group_bytes -= 1;
    let small = ReportPublicationWire::new(binding(), bound).unwrap();
    assert!(matches!(
        small.decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW),
        Err(WireError::Bounds)
    ));
}

#[test]
fn bundled_snapshot_cannot_exceed_the_retained_source_row_prefix() {
    let (mut manifest, _) = snapshot(0);
    let mut previous = page_seed(&manifest, DATASET).unwrap();
    let mut pages = Vec::new();
    for start in (0..4097).step_by(200) {
        let rows: Vec<_> = (start..4097.min(start + 200))
            .map(|index| {
                json!({
                    "dataset":DATASET, "entity_id":format!("r{index}"),
                    "revision":{"ordinal":"1", "opaque":"v1"}, "payload":{}
                })
            })
            .collect();
        let page: SnapshotPage = serde_json::from_value(json!({
            "generation":manifest.generation, "dataset":DATASET,
            "index":pages.len().to_string(), "previous_digest":previous, "rows":rows
        }))
        .unwrap();
        previous = page.chain_digest().unwrap();
        pages.push(page);
    }
    manifest.pages.insert(
        DATASET.into(),
        PagePlan {
            count: u64::try_from(pages.len()).unwrap(),
            final_digest: previous,
        },
    );
    let raw = bytes(&raw_snapshot(&manifest, &pages));
    assert!(raw.len() < MAX_WIRE_BYTES);
    let mut bound = limits();
    bound.page_rows = 200;
    let wire = ReportPublicationWire::new(binding(), bound).unwrap();
    assert!(matches!(
        wire.decode_snapshot(&raw, NOW),
        Err(WireError::Bounds)
    ));
}

#[test]
fn unavailable_or_legacy_json_never_becomes_a_snapshot_or_empty_tail() {
    let (manifest, _) = snapshot(0);
    for raw in [
        json!({"error":"PUBLICATION_UNAVAILABLE","state":"UNAVAILABLE","business_applied":null}),
        json!({"rows":[],"next_cursor":null}),
        json!({"group":null,"chunks":[],"applied":true}),
    ] {
        assert!(wire().decode_snapshot(&bytes(&raw), NOW).is_err());
        assert!(wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn required_event_nulls_and_closed_nested_source_fields_are_checked_before_hashes() {
    let (manifest, _) = snapshot(0);
    for selector in [0, 1, 2, 3] {
        let mut raw = tail(&manifest, &[event(&manifest, 1)]);
        let value = &mut raw["chunks"][0]["events"][0]["event"];
        match selector {
            0 => {
                value.as_object_mut().unwrap().remove("correlation_id");
            }
            1 => value["correlation_id"] = json!("TEST_ONLY_invented"),
            2 => value["source_position"]["extra"] = json!(true),
            _ => value["extra"] = json!(true),
        }
        assert!(matches!(
            wire().decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW),
            Err(WireError::Shape)
        ));
    }
}

#[test]
fn unsupported_correction_or_delete_is_not_normalized_to_report_upsert() {
    let (manifest, _) = snapshot(0);
    for operation in ["CORRECTION", "TOMBSTONE"] {
        let mut raw = tail(&manifest, &[event(&manifest, 1)]);
        raw["chunks"][0]["events"][0]["event"]["operation"] = json!(operation);
        assert!(wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .is_err());
    }
}

#[test]
fn source_epoch_schema_payload_and_timestamp_drift_are_rejected() {
    let (manifest, _) = snapshot(0);
    for selector in [0, 1, 2, 3] {
        let mut input = event(&manifest, 1);
        match selector {
            0 => input.event.source_position.source_epoch = "TEST_ONLY_other".into(),
            1 => input.event.payload_schema_revision = "wrong.v1".into(),
            2 => input.event.payload["amount"] = json!("2.0"),
            _ => input.event.source_published_at_ms = NOW - 1,
        }
        assert!(wire()
            .decode_delta(
                &bytes(&tail(&manifest, &[input])),
                &manifest,
                &mark('A'),
                NOW
            )
            .is_err());
    }
}

#[test]
fn aggregate_events_and_source_prefix_ceiling_cannot_be_raised() {
    let (manifest, _) = snapshot(0);
    let many: Vec<_> = (1..=5).map(|sequence| event(&manifest, sequence)).collect();
    assert!(wire()
        .decode_delta(&bytes(&tail(&manifest, &many)), &manifest, &mark('A'), NOW)
        .is_err());
    assert!(wire()
        .decode_delta(
            &bytes(&tail(&manifest, &[event(&manifest, 4097)])),
            &manifest,
            &mark('A'),
            NOW
        )
        .is_err());
}

#[test]
fn cross_chunk_order_and_full_event_digest_are_checked() {
    let (manifest, _) = snapshot(0);
    let mut raw = tail(&manifest, &[event(&manifest, 3)]);
    let second = DeltaChunk {
        generation: manifest.generation,
        group_id: "TEST_ONLY_commit".into(),
        index: 1,
        events: vec![event(&manifest, 1)],
    };
    raw["chunks"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::to_value(&second).unwrap());
    raw["group"]["chunk_digests"]
        .as_array_mut()
        .unwrap()
        .push(json!(second.digest().unwrap()));
    raw["group"]["events_digest"] =
        json!(events_digest(&[event(&manifest, 3), event(&manifest, 1)]).unwrap());
    assert!(wire()
        .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
        .is_err());
}

#[test]
fn multiple_chunks_reuse_the_complete_ordered_protocol_without_proving_coverage() {
    let (manifest, _) = snapshot(0);
    let mut raw = tail(&manifest, &[event(&manifest, 1)]);
    let second = DeltaChunk {
        generation: manifest.generation,
        group_id: "TEST_ONLY_commit".into(),
        index: 1,
        events: vec![event(&manifest, 3)],
    };
    raw["chunks"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::to_value(&second).unwrap());
    raw["group"]["chunk_digests"]
        .as_array_mut()
        .unwrap()
        .push(json!(second.digest().unwrap()));
    raw["group"]["events_digest"] =
        json!(events_digest(&[event(&manifest, 1), event(&manifest, 3)]).unwrap());
    assert_eq!(
        wire()
            .decode_delta(&bytes(&raw), &manifest, &mark('A'), NOW)
            .unwrap()
            .chunks()
            .len(),
        2
    );
}
