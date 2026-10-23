//! `TEST_ONLY` existing PM wire vectors, not financial/source authority evidence.
use super::*;
use authoritative_event_core::bootstrap::{events_digest, page_seed, PagePlan, SnapshotRow};
use query_api::scoped::{Coverage, HistoryCapability, Operation, ReadAuthorizer, ReadScope};
use serde_json::json;

#[cfg(feature = "pm-custody-pg-test")]
mod pg;

const NOW: i64 = 1_792_735_200_000;

fn mark(letter: char) -> String {
    format!("pmrb1.{}", letter.to_string().repeat(43))
}

fn binding() -> Binding {
    serde_json::from_value(json!({
        "source":{"stream_id":"TEST_ONLY.reports","contract_revision":"TEST_ONLY.v1",
            "workspace_id":"TEST_ONLY_workspace","environment":"paper","profile_id":"TEST_ONLY_profile",
            "venue_id":"TEST_ONLY","resource_kind":"reports","resource_id":"TEST_ONLY_reports",
            "filter_digest":format!("sha256:{}","a".repeat(64))},
        "source_epoch":"TEST_ONLY_epoch","consumer_id":format!("TEST_ONLY.{}",uuid::Uuid::now_v7()),
        "principal_digest":format!("sha256:{}","b".repeat(64)),"policy_revision":"TEST_ONLY_policy",
        "query_digest":format!("sha256:{}","c".repeat(64)),"consistency_group":"TEST_ONLY_reports",
        "datasets":{(DATASET):PAYLOAD_SCHEMA}
    })).unwrap()
}

fn limits() -> Limits {
    Limits {
        page_rows: 2,
        page_bytes: 1024 * 1024,
        group_events: 4,
        group_bytes: 1024 * 1024,
        group_chunks: 4,
        snapshot_ttl_ms: 300_000,
        rollback_ttl_ms: 300_000,
    }
}

fn cut() -> Value {
    json!({"export":{"source":{"source_cell_id":"TEST_ONLY-cell","source_database_id":"TEST_ONLY-db",
        "source_continuity_epoch":"TEST_ONLY-epoch"},"dataset":"TEST_ONLY-inputs",
        "partition":"TEST_ONLY-partition","generation":"TEST_ONLY-generation",
        "schema":"pma.operator-report.v1.1","redaction_revision":"TEST_ONLY-fields"},
        "snapshot_id":"TEST_ONLY-snapshot","boundary":"TEST_ONLY-boundary","source_set_digest":"b".repeat(64),
        "as_of_ms":NOW,"as_of_sub_ms_us":"456","recorded_through_ms":NOW,"recorded_through_sub_ms_us":"567",
        "facts_through_ms":NOW,"facts_through_sub_ms_us":"12","valuation_cutoff_ms":NOW,
        "valuation_cutoff_sub_ms_us":"456"})
}

fn expected() -> FinancialBinding {
    FinancialBinding {
        export: serde_json::from_value(cut()["export"].clone()).unwrap(),
        reference: "TEST_ONLY-selected".into(),
        report_key: "a".repeat(64),
        publication_version: "1".into(),
        snapshot_ref: "TEST_ONLY-snapshot".into(),
        publication_payload_hash: "c".repeat(64),
        mode: "paper".into(),
        venue: "TEST_ONLY-venue".into(),
        backend: "TEST_ONLY-backend".into(),
        currency: "USDT".into(),
        basis: "TEST_ONLY-equity-gross-pnl".into(),
        portfolios: ["TEST_ONLY-portfolio".into()].into(),
        physical_refs: std::collections::BTreeSet::default(),
        expected_sources: ["TEST_ONLY-source".into()].into(),
        valuation_refs: ["TEST_ONLY-value".into()].into(),
    }
}

fn bindings() -> BTreeMap<String, FinancialBinding> {
    let value = expected();
    [(value.reference.clone(), value)].into()
}

fn payload() -> Value {
    let quality = json!({"status":"PARTIAL","reasons":["FACTS_BEHIND_AS_OF"]});
    json!({"reference":"TEST_ONLY-selected","report_key":"a".repeat(64),"version":"1",
        "snapshot_ref":"TEST_ONLY-snapshot","publication_payload_hash":"c".repeat(64),
        "header":{"report_id":"TEST_ONLY-report","view":"PORTFOLIO","target":"TEST_ONLY-portfolio",
            "cut":cut(),"currency":"USDT","basis":"TEST_ONLY-equity-gross-pnl",
            "reducer_version":"TEST_ONLY-native-v3","numeric_version":"decimal38-18",
            "assignment_digest":"d".repeat(64),"owner_digest":"e".repeat(64),
            "valuation_refs":["TEST_ONLY-value"],"mode":"paper","venue":"TEST_ONLY-venue",
            "backend":"TEST_ONLY-backend","presentation":"AS_ORIGINALLY_REPORTED",
            "quality":quality,"schema_version":"pma.operator-report.v1.1"},
        "rows":[{"source_id":"TEST_ONLY-source","leaves":["TEST_ONLY-source"],
            "scope":{"portfolio_id":"TEST_ONLY-portfolio","environment":"paper"},
            "account_id":"TEST_ONLY-account","deployment_id":"TEST_ONLY-deployment","strategy_id":"TEST_ONLY-alpha",
            "original_owner":"00000000-0000-4000-8000-000000000001",
            "published_current_owner":"00000000-0000-4000-8000-000000000002",
            "pm_user":"00000000-0000-4000-8000-000000000003","deploy_actor":"TEST_ONLY-actor","archived":true,
            "cut":cut(),"currency":"USDT","basis":"TEST_ONLY-equity-gross-pnl",
            "economics":{"nav":"900","realized_pnl":"0","unrealized_pnl":"0","fees":null,
                "funding":"-0.000000000000000001","interest":null,"gross_exposure":"0","net_exposure":"0"},
            "controls":{"nominal_budget":"800","margin_risk_requirement":"20","exposure_cap":"2000",
                "backing":"1000","new_risk_capacity":"60","amount_locked":"5","recall_pending":"7",
                "authority_ref":"TEST_ONLY-authority","model_revision":"TEST_ONLY-R2",
                "profile":{"desired":"TEST_ONLY-profile","broker_applied":null,"verified":null,"effective":null,
                    "outcome":"UNKNOWN","qualification":"TEST_ONLY_SIMULATION"}},
            "quality":quality,"physical_ref":"TEST_ONLY-physical","role":"ACCOUNT"}],
        "statements":[{"source_id":"TEST_ONLY-source","statement":{"opening_receipt":"TEST_ONLY-opening",
            "opening_at_ms":NOW-86_400_000,"opening_at_sub_ms_us":"0","opening":"1000","currency":"USDT",
            "as_of_ms":NOW,"as_of_sub_ms_us":"456","recorded_through_ms":NOW,"recorded_through_sub_ms_us":"567",
            "economic_additions":"200","economic_returns":"300","net_assignments":"900",
            "budget_topups":"800","budget_decreases":"50",
            "applied_refs":[["TEST_ONLY-cell","TEST_ONLY-db","TEST_ONLY-epoch","TEST_ONLY-flow","1"]],
            "advanced_metrics":"UNAVAILABLE_METHOD_NOT_CERTIFIED"}}],"native":null,"native_snapshot":null,
        "publication_valid_until_ms":NOW+300_000,"publication_valid_until_sub_ms_us":"0",
        "source_event_id":"00000000-0000-4000-8000-000000000004",
        "source_group_id":"00000000-0000-4000-8000-000000000005",
        "capture_recorded_at_ms":NOW,"capture_recorded_at_sub_ms_us":"789"})
}

fn row(payload: Value) -> SnapshotRow {
    let expected = expected();
    SnapshotRow {
        dataset: DATASET.into(),
        entity_id: source_id("report", &expected.report_key).unwrap(),
        revision: Revision {
            ordinal: 1,
            opaque: source_id(
                "publication",
                &[
                    expected.report_key,
                    expected.publication_version,
                    expected.publication_payload_hash,
                ],
            )
            .unwrap(),
        },
        payload,
    }
}

fn snapshot(payload: Value) -> (Manifest, Vec<SnapshotPage>) {
    let mut manifest: Manifest = serde_json::from_value(json!({"binding":binding(),
        "generation":uuid::Uuid::now_v7(),"snapshot_id":"TEST_ONLY_snapshot",
        "barrier":mark('A'),"delta_start":mark('A'),"catchup_cursor":mark('A'),
        "expires_at_ms":NOW+60_000,"rollback_until_ms":NOW+120_000,"references":[],
        "pages":{(DATASET):{"count":"0","final_digest":format!("sha256:{}","d".repeat(64))}}
    }))
    .unwrap();
    let page = SnapshotPage {
        generation: manifest.generation,
        dataset: DATASET.into(),
        index: 0,
        previous_digest: page_seed(&manifest, DATASET).unwrap(),
        rows: vec![row(payload)],
    };
    manifest.pages.insert(
        DATASET.into(),
        PagePlan {
            count: 1,
            final_digest: page.chain_digest().unwrap(),
        },
    );
    (manifest, vec![page])
}

fn bytes(value: &impl Serialize) -> Vec<u8> {
    serde_json::to_vec(value).unwrap()
}

#[test]
fn source_entity_revision_and_exact_pm_facts_survive_preparation() {
    let (manifest, pages) = snapshot(payload());
    let wire = ReportPublicationWire::new(manifest.binding.clone(), limits()).unwrap();
    let prepared = prepare_snapshot(
        &wire,
        &bindings(),
        &bytes(&json!({"manifest":manifest,"pages":pages})),
        NOW,
    )
    .unwrap();
    assert_eq!(prepared.pages(), pages);
    let adapted = validate_report(
        &pages[0].rows[0].payload,
        &pages[0].rows[0].entity_id,
        &pages[0].rows[0].revision,
        &bindings(),
    )
    .unwrap();
    assert_eq!(
        adapted.rows()[0].economics.nav.as_ref().unwrap().as_str(),
        "900"
    );
    assert_eq!(adapted.rows()[0].controls.nominal_budget.as_str(), "800");
    assert_eq!(adapted.header().quality.status, "PARTIAL");
}

#[test]
fn unqualified_report_correction_and_wrong_identity_never_prepare() {
    let original = row(payload());
    for (entity, revision) in [
        ("TEST_ONLY-not-source-id".into(), original.revision.clone()),
        (
            original.entity_id.clone(),
            Revision {
                ordinal: 2,
                ..original.revision.clone()
            },
        ),
        (
            original.entity_id.clone(),
            Revision {
                opaque: "TEST_ONLY-other-version".into(),
                ..original.revision.clone()
            },
        ),
    ] {
        assert!(validate_report(&original.payload, &entity, &revision, &bindings()).is_err());
    }
    let mut correction = payload();
    correction["version"] = json!("2");
    assert!(validate_report(
        &correction,
        &original.entity_id,
        &original.revision,
        &bindings()
    )
    .is_err());
    assert!(validate_report(
        &original.payload,
        &original.entity_id,
        &original.revision,
        &BTreeMap::new()
    )
    .is_err());
}

#[test]
fn one_bad_report_invalidates_candidate_before_any_store_call() {
    for pointer in [
        "/rows/0/currency",
        "/rows/0/cut/export/source/source_database_id",
        "/header/mode",
        "/reference",
    ] {
        let mut value = payload();
        *value.pointer_mut(pointer).unwrap() = json!("TEST_ONLY-foreign");
        let (manifest, pages) = snapshot(value);
        let wire = ReportPublicationWire::new(manifest.binding.clone(), limits()).unwrap();
        assert!(prepare_snapshot(
            &wire,
            &bindings(),
            &bytes(&json!({"manifest":manifest,"pages":pages})),
            NOW
        )
        .is_err());
    }
}

#[test]
fn late_unknown_cost_stays_null_and_missing_column_is_not_accepted() {
    let mut value = row(payload());
    value.payload["rows"][0]["economics"]["nav"] = Value::Null;
    let adapted = validate_report(
        &value.payload,
        &value.entity_id,
        &value.revision,
        &bindings(),
    )
    .unwrap();
    assert!(adapted.rows()[0].economics.nav.is_none());
    value.payload["rows"][0]["economics"]
        .as_object_mut()
        .unwrap()
        .remove("fees");
    assert!(validate_report(
        &value.payload,
        &value.entity_id,
        &value.revision,
        &bindings()
    )
    .is_err());
}

#[test]
fn absent_scan_group_and_hidden_only_group_are_distinct() {
    let (manifest, _) = snapshot(payload());
    let wire = ReportPublicationWire::new(manifest.binding.clone(), limits()).unwrap();
    let empty = prepare_delta(
        &wire,
        &bindings(),
        &manifest,
        &mark('A'),
        &bytes(&json!({"group":null,"chunks":[]})),
        NOW,
    )
    .unwrap();
    assert!(empty.group().is_none());
    let group = DeltaGroup {
        generation: manifest.generation,
        group_id: "TEST_ONLY_hidden".into(),
        from_cursor: mark('A'),
        to_cursor: mark('B'),
        chunk_digests: vec![],
        events_digest: events_digest(&[]).unwrap(),
        reached_catchup: false,
    };
    let hidden = prepare_delta(
        &wire,
        &bindings(),
        &manifest,
        &mark('A'),
        &bytes(&json!({"group":group,"chunks":[]})),
        NOW,
    )
    .unwrap();
    assert_eq!(hidden.group(), Some(&group));
    assert!(hidden.chunks().is_empty());
}

#[test]
fn candidate_comparison_is_full_value_not_schema_or_generation_only() {
    let (manifest, mut pages) = snapshot(payload());
    let original = pages[0].clone();
    pages[0].rows[0].payload["rows"][0]["economics"]["nav"] = json!("901");
    assert!(exact(&original, &pages[0]).is_err());
    let mut changed = manifest.clone();
    changed.binding.policy_revision = "TEST_ONLY-new-policy".into();
    assert!(exact(&manifest, &changed).is_err());
}

struct Policy;
impl ReadAuthorizer for Policy {
    fn current(&self, _: &ReadScope, operation: Operation, _: i64) -> bool {
        operation == Operation::Current
    }
}

fn read_scope(manifest: &Manifest) -> ReadScope {
    ReadScope {
        ingest_binding_digest: manifest.binding.digest().unwrap(),
        slot_key: manifest.binding.slot_key().unwrap(),
        principal_digest: manifest.binding.principal_digest.clone(),
        effective_scope_digest: format!("sha256:{}", "e".repeat(64)),
        app_policy_revision: "TEST_ONLY_policy".into(),
        field_policy_revision: "TEST_ONLY_fields".into(),
        schema_version: PAYLOAD_SCHEMA.into(),
        model_revision: "TEST_ONLY_model".into(),
        source_set_digest: format!("sha256:{}", "f".repeat(64)),
        dataset: DATASET.into(),
        entity_ids: None,
        allowed_fields: payload().as_object().unwrap().keys().cloned().collect(),
        history_capability: HistoryCapability::Unavailable,
        coverage: Coverage::CurrentPageOnly,
        history_from_ms: None,
        history_to_ms: None,
    }
}

#[test]
fn full_original_read_requires_actual_authorization_and_every_source_field() {
    let (manifest, _) = snapshot(payload());
    let scope = read_scope(&manifest);
    let read = AuthorizedRead::authorize(scope.clone(), Operation::Current, &Policy, NOW).unwrap();
    assert!(validate_read_scope(&read).is_ok());
    for field in scope.allowed_fields.clone() {
        let mut reduced = scope.clone();
        reduced.allowed_fields.remove(&field);
        let reduced = AuthorizedRead::authorize(reduced, Operation::Current, &Policy, NOW).unwrap();
        assert!(validate_read_scope(&reduced).is_err());
    }
    assert!(AuthorizedRead::authorize(scope, Operation::Export, &Policy, NOW).is_err());
}

#[test]
fn typed_read_retains_scoped_event_alias_and_separates_capital_flow_from_profit() {
    let source = row(payload());
    let typed = adapt_read_row(
        ReadRow {
            entity_id: source.entity_id,
            revision: source.revision.opaque,
            payload: source.payload,
            event_id: Some("TEST_ONLY-scoped-alias".into()),
            operation: Some("UPSERT".into()),
            occurred_at_ms: Some(NOW),
            correction_of: None,
        },
        &bindings(),
    )
    .unwrap();
    assert_eq!(typed.event_id.as_deref(), Some("TEST_ONLY-scoped-alias"));
    assert_eq!(
        typed
            .report
            .statement("TEST_ONLY-source")
            .unwrap()
            .economic_additions
            .as_str(),
        "200"
    );
    assert_eq!(
        typed.report.rows()[0]
            .economics
            .realized_pnl
            .as_ref()
            .unwrap()
            .as_str(),
        "0"
    );
}
