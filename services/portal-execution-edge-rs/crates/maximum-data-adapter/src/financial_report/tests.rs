//! `TEST_ONLY` source-format vectors; no source authentication/runtime claim.
use super::*;
use serde_json::json;

fn source() -> SourceIdentity {
    SourceIdentity {
        source_cell_id: "TEST_ONLY-cell".into(),
        source_database_id: "TEST_ONLY-db".into(),
        source_continuity_epoch: "TEST_ONLY-epoch".into(),
    }
}

fn binding() -> FinancialBinding {
    FinancialBinding {
        export: serde_json::from_value(cut()["export"].clone()).unwrap(),
        reference: "TEST_ONLY-selected-publication".into(),
        report_key: "a".repeat(64),
        mode: "paper".into(),
        venue: "TEST_ONLY-venue".into(),
        publication_version: "9007199254740993".into(),
        snapshot_ref: "TEST_ONLY-snapshot".into(),
        publication_payload_hash: "c".repeat(64),
        backend: "TEST_ONLY-backend".into(),
        currency: "USDT".into(),
        basis: "TEST_ONLY-equity-gross-pnl".into(),
        portfolios: ["TEST_ONLY-portfolio".into()].into(),
        physical_refs: BTreeSet::new(),
        expected_sources: ["TEST_ONLY-source-A".into()].into(),
        valuation_refs: ["TEST_ONLY-valuation".into()].into(),
    }
}

fn cut() -> Value {
    json!({
        "export":{"source":source(),"dataset":"TEST_ONLY-report-inputs",
            "partition":"TEST_ONLY-partition","generation":"TEST_ONLY-generation",
            "schema":"pma.operator-report.v1.1","redaction_revision":"TEST_ONLY-fields"},
        "snapshot_id":"TEST_ONLY-snapshot","boundary":"TEST_ONLY-boundary",
        "source_set_digest":"b".repeat(64),
        "as_of_ms":1_792_735_200_123_i64,"as_of_sub_ms_us":"456",
        "recorded_through_ms":1_792_735_200_234_i64,"recorded_through_sub_ms_us":"567",
        "facts_through_ms":1_792_735_200_012_i64,"facts_through_sub_ms_us":"12",
        "valuation_cutoff_ms":1_792_735_200_123_i64,"valuation_cutoff_sub_ms_us":"456"
    })
}

fn quality() -> Value {
    json!({"status":"PARTIAL","reasons":["FACTS_BEHIND_AS_OF"]})
}

fn profile() -> Value {
    json!({"desired":"TEST_ONLY-profile","broker_applied":null,"verified":null,
        "effective":null,"outcome":"UNKNOWN","qualification":"TEST_ONLY_SIMULATION"})
}

fn economics() -> Value {
    json!({"nav":"900","realized_pnl":"0","unrealized_pnl":"0",
        "fees":null,"funding":"-0.000000000000000001","interest":null,
        "gross_exposure":"0","net_exposure":"0"})
}

fn row(source_id: &str) -> Value {
    json!({"source_id":source_id,"leaves":[source_id],
        "scope":{"portfolio_id":"TEST_ONLY-portfolio","environment":"paper"},
        "account_id":format!("TEST_ONLY-account-{source_id}"),
        "deployment_id":format!("TEST_ONLY-deployment-{source_id}"),
        "strategy_id":"TEST_ONLY-same-alpha",
        "original_owner":"00000000-0000-4000-8000-000000000001",
        "published_current_owner":"00000000-0000-4000-8000-000000000002",
        "pm_user":"00000000-0000-4000-8000-000000000003",
        "deploy_actor":"TEST_ONLY-actor","archived":true,
        "cut":cut(),"currency":"USDT","basis":"TEST_ONLY-equity-gross-pnl",
        "economics":economics(),
        "controls":{"nominal_budget":"800","margin_risk_requirement":"20",
            "exposure_cap":"2000","backing":"1000","new_risk_capacity":"60",
            "amount_locked":"5","recall_pending":"7",
            "authority_ref":"TEST_ONLY-authority","model_revision":"TEST_ONLY-R2",
            "profile":profile()},
        "quality":quality(),"physical_ref":"TEST_ONLY-physical","role":"ACCOUNT"})
}

fn statement(source_id: &str) -> Value {
    json!({"source_id":source_id,"statement":{
        "opening_receipt":"TEST_ONLY-opening","opening_at_ms":1_792_648_800_000_i64,
        "opening_at_sub_ms_us":"0","opening":"1000","currency":"USDT",
        "as_of_ms":1_792_735_200_123_i64,"as_of_sub_ms_us":"456",
        "recorded_through_ms":1_792_735_200_234_i64,"recorded_through_sub_ms_us":"567",
        "economic_additions":"200","economic_returns":"300","net_assignments":"900",
        "budget_topups":"800","budget_decreases":"50",
        "applied_refs":[["TEST_ONLY-cell","TEST_ONLY-db","TEST_ONLY-epoch","TEST_ONLY-fund","1"]],
        "advanced_metrics":"UNAVAILABLE_METHOD_NOT_CERTIFIED"}})
}

fn payload() -> Value {
    json!({
        "reference":"TEST_ONLY-selected-publication","report_key":"a".repeat(64),
        "version":"9007199254740993","snapshot_ref":"TEST_ONLY-snapshot",
        "publication_payload_hash":"c".repeat(64),
        "header":{"report_id":"TEST_ONLY-report","view":"PORTFOLIO",
            "target":"TEST_ONLY-portfolio","cut":cut(),"currency":"USDT",
            "basis":"TEST_ONLY-equity-gross-pnl","reducer_version":"TEST_ONLY-native-v3",
            "numeric_version":"decimal38-18","assignment_digest":"d".repeat(64),
            "owner_digest":"e".repeat(64),"valuation_refs":["TEST_ONLY-valuation"],
            "mode":"paper","venue":"TEST_ONLY-venue","backend":"TEST_ONLY-backend",
            "presentation":"AS_ORIGINALLY_REPORTED","quality":quality(),
            "schema_version":"pma.operator-report.v1.1"},
        "rows":[row("TEST_ONLY-source-A")],"statements":[statement("TEST_ONLY-source-A")],
        "native":null,"native_snapshot":null,
        "publication_valid_until_ms":1_792_735_500_000_i64,"publication_valid_until_sub_ms_us":"0",
        "source_event_id":"00000000-0000-4000-8000-000000000004",
        "source_group_id":"00000000-0000-4000-8000-000000000005",
        "capture_recorded_at_ms":1_792_735_200_456_i64,"capture_recorded_at_sub_ms_us":"789"
    })
}

fn adapt(value: &Value) -> Result<PublishedFinancialReport, FinancialError> {
    PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, value, &binding())
}

#[test]
fn exact_pm_item_preserves_decimal_null_microsecond_and_historical_owner() {
    let report = adapt(&payload()).unwrap();
    assert_eq!(report.publication_version(), "9007199254740993");
    assert_eq!(report.header().cut.as_of_sub_ms_us, "456");
    assert_eq!(
        report.rows()[0]
            .economics
            .funding
            .as_ref()
            .unwrap()
            .as_str(),
        "-0.000000000000000001"
    );
    assert!(report.rows()[0].economics.fees.is_none());
    assert!(report.rows()[0].archived);
    assert_ne!(
        report.rows()[0].original_owner,
        report.rows()[0].published_current_owner
    );
    assert_eq!(report.header().quality.status, "PARTIAL");
    assert_eq!(OWNERSHIP_BASIS, "AS_PUBLISHED_NOT_CURRENT");
    assert_eq!(COVERAGE, "SELECTED_ORIGINAL_REPORT_PUBLICATIONS");
}

#[test]
fn cashflow_and_budget_never_replace_pnl_nav_or_certify_return() {
    let report = adapt(&payload()).unwrap();
    let source = &report.rows()[0];
    let statement = report.statement("TEST_ONLY-source-A").unwrap();
    assert_eq!(statement.opening.as_str(), "1000");
    assert_eq!(statement.economic_additions.as_str(), "200");
    assert_eq!(statement.economic_returns.as_str(), "300");
    assert_eq!(statement.net_assignments.as_str(), "900");
    assert_eq!(
        source.economics.realized_pnl.as_ref().unwrap().as_str(),
        "0"
    );
    assert_eq!(source.economics.nav.as_ref().unwrap().as_str(), "900");
    assert_eq!(source.controls.nominal_budget.as_str(), "800");
    assert_eq!(
        source.controls.exposure_cap.as_ref().unwrap().as_str(),
        "2000"
    );
    assert_eq!(
        statement.advanced_metrics,
        "UNAVAILABLE_METHOD_NOT_CERTIFIED"
    );
}

#[test]
fn null_nav_cannot_fallback_to_budget_backing_or_assignments() {
    let mut value = payload();
    value["rows"][0]["economics"]["nav"] = Value::Null;
    let report = adapt(&value).unwrap();
    assert!(report.rows()[0].economics.nav.is_none());
    assert_eq!(
        report.rows()[0].controls.backing.as_ref().unwrap().as_str(),
        "1000"
    );
}

#[test]
fn same_source_join_dedups_but_equal_values_from_distinct_leaves_survive() {
    let mut value = payload();
    value["rows"]
        .as_array_mut()
        .unwrap()
        .push(row("TEST_ONLY-source-A"));
    assert_eq!(adapt(&value).unwrap().rows().len(), 1);
    value["rows"]
        .as_array_mut()
        .unwrap()
        .push(row("TEST_ONLY-source-B"));
    value["statements"]
        .as_array_mut()
        .unwrap()
        .push(statement("TEST_ONLY-source-B"));
    let mut expected = binding();
    expected
        .expected_sources
        .insert("TEST_ONLY-source-B".into());
    let report = PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &value, &expected).unwrap();
    assert_eq!(report.rows().len(), 2);
    assert_eq!(report.rows()[0].economics, report.rows()[1].economics);
    assert_eq!(report.rows()[0].strategy_id, report.rows()[1].strategy_id);
}

#[test]
fn conflicting_source_or_parent_child_leaf_overlap_is_rejected() {
    let mut value = payload();
    let mut duplicate = row("TEST_ONLY-source-A");
    duplicate["economics"]["nav"] = json!("901");
    value["rows"].as_array_mut().unwrap().push(duplicate);
    assert!(matches!(adapt(&value), Err(FinancialError::SourceOverlap)));
    let mut value = payload();
    let mut parent = row("TEST_ONLY-parent");
    parent["role"] = json!("ROOT_RESIDUAL");
    parent["leaves"] = json!(["TEST_ONLY-source-A", "TEST_ONLY-source-B"]);
    value["rows"].as_array_mut().unwrap().push(parent);
    assert!(matches!(adapt(&value), Err(FinancialError::SourceOverlap)));
}

#[test]
fn every_source_scope_currency_basis_and_submillisecond_cut_remains_exact() {
    for (pointer, change) in [
        ("/rows/0/currency", json!("USD")),
        ("/rows/0/basis", json!("net-pnl")),
        ("/rows/0/cut/as_of_sub_ms_us", json!("457")),
        (
            "/rows/0/cut/export/source/source_continuity_epoch",
            json!("foreign"),
        ),
        ("/rows/0/scope/portfolio_id", json!("hidden")),
        ("/rows/0/scope/environment", json!("live")),
        ("/statements/0/statement/currency", json!("USD")),
        ("/statements/0/statement/as_of_sub_ms_us", json!("457")),
        ("/statements/0/statement/applied_refs/0/2", json!("foreign")),
        (
            "/header/cut/export/source/source_database_id",
            json!("foreign"),
        ),
        ("/header/venue", json!("foreign")),
        ("/reference", json!("foreign")),
        ("/report_key", json!("f".repeat(64))),
    ] {
        let mut value = payload();
        *value.pointer_mut(pointer).unwrap() = change;
        assert!(adapt(&value).is_err(), "{pointer}");
    }
}

#[test]
fn cashflow_statement_is_complete_for_each_selected_source_or_rejected() {
    for change in [
        json!([]),
        json!([statement("unknown")]),
        json!([
            statement("TEST_ONLY-source-A"),
            statement("TEST_ONLY-source-A")
        ]),
    ] {
        let mut value = payload();
        value["statements"] = change;
        assert!(adapt(&value).is_err());
    }
}

#[test]
fn exact_decimal_accepts_full_numeric_38_18_and_never_accepts_floats_or_nonfinite() {
    for valid in [
        "99999999999999999999.999999999999999999",
        "-0.000000000000000001",
        "0.0000000000000000000",
    ] {
        let mut value = payload();
        value["rows"][0]["economics"]["nav"] = json!(valid);
        assert_eq!(
            adapt(&value).unwrap().rows()[0]
                .economics
                .nav
                .as_ref()
                .unwrap()
                .as_str(),
            valid
        );
    }
    for invalid in [
        json!(1.1),
        json!(true),
        json!("NaN"),
        json!("Infinity"),
        json!("1e3"),
        json!("+1"),
        json!("1."),
        json!(".1"),
        json!(" 1"),
        json!("1 0"),
        json!("100000000000000000000"),
        json!("0.0000000000000000001"),
    ] {
        let mut value = payload();
        value["rows"][0]["economics"]["nav"] = invalid;
        assert!(adapt(&value).is_err());
    }
}

#[test]
fn quality_profile_and_budget_dimensions_do_not_upgrade_authority() {
    for (pointer, invalid) in [
        ("/header/quality/status", json!("FRESH")),
        ("/header/quality/status", json!("COMPLETE")),
        ("/rows/0/controls/nominal_budget", json!("-1")),
        ("/rows/0/controls/profile/outcome", json!("APPLIED")),
        (
            "/rows/0/controls/profile/qualification",
            json!("VERIFIED_BY_ADAPTER"),
        ),
        (
            "/statements/0/statement/advanced_metrics",
            json!("CERTIFIED"),
        ),
    ] {
        let mut value = payload();
        *value.pointer_mut(pointer).unwrap() = invalid;
        assert!(adapt(&value).is_err(), "{pointer}");
    }
    for status in ["PARTIAL", "STALE", "UNRESOLVED"] {
        let mut value = payload();
        value["header"]["quality"]["status"] = json!(status);
        assert_eq!(adapt(&value).unwrap().header().quality.status, status);
    }
}

#[test]
fn physical_custody_and_management_accounts_remain_distinct_and_authorized() {
    let mut value = payload();
    value["header"]["view"] = json!("VENUE");
    value["header"]["target"] = json!("TEST_ONLY-physical");
    let mut native_economics = economics();
    native_economics["nav"] = json!("7000");
    value["native"] = json!({"physical_ref":"TEST_ONLY-physical","cut":cut(),
        "currency":"USDT","basis":"TEST_ONLY-equity-gross-pnl","economics":native_economics,
        "profile":profile(),"reconciliation_ref":"TEST_ONLY-native-reconciliation","quality":quality()});
    // PM's native tuple is (snapshot bucket key, version, physical source),
    // NOT (physical_ref, version, ...). Never silently re-interpret it.
    value["native_snapshot"] = json!([
        "TEST_ONLY-reconciliation-bucket",
        "1",
        "TEST_ONLY-native-source"
    ]);
    assert!(adapt(&value).is_err());
    let mut expected = binding();
    expected.physical_refs.insert("TEST_ONLY-physical".into());
    let report = PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &value, &expected).unwrap();
    assert_eq!(
        report
            .native()
            .unwrap()
            .economics
            .nav
            .as_ref()
            .unwrap()
            .as_str(),
        "7000"
    );
    assert_eq!(
        report.rows()[0].economics.nav.as_ref().unwrap().as_str(),
        "900"
    );
    value["header"]["view"] = json!("PORTFOLIO");
    assert!(PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &value, &expected).is_err());
}

#[test]
fn late_cost_revision_preserves_old_publication_not_overwrites_or_reassigns_it() {
    let original = payload();
    let mut correction = original.clone();
    correction["version"] = json!("9007199254740994");
    correction["publication_payload_hash"] = json!("f".repeat(64));
    correction["rows"][0]["economics"]["fees"] = json!("1.000000000000000001");
    correction["header"]["presentation"] = json!("RESTATED");
    let old = adapt(&original).unwrap();
    assert!(adapt(&correction).is_err());
    let mut qualified_revision = binding();
    qualified_revision.publication_version = "9007199254740994".into();
    qualified_revision.publication_payload_hash = "f".repeat(64);
    let new =
        PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &correction, &qualified_revision).unwrap();
    assert!(old.rows()[0].economics.fees.is_none());
    assert_eq!(
        new.rows()[0].economics.fees.as_ref().unwrap().as_str(),
        "1.000000000000000001"
    );
    assert_eq!(old.rows()[0].original_owner, new.rows()[0].original_owner);
    assert_ne!(old.publication_version(), new.publication_version());
    assert_ne!(old.payload_sha256(), new.payload_sha256());
}

#[test]
fn canonical_source_modes_supported_without_inventing_canary_economics() {
    for mode in ["paper", "sandbox", "live"] {
        let mut expected = binding();
        expected.mode = mode.into();
        let mut value = payload();
        value["header"]["mode"] = json!(mode);
        value["rows"][0]["scope"]["environment"] = json!(mode);
        assert!(PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &value, &expected).is_ok());
    }
    let mut expected = binding();
    expected.mode = "canary".into();
    let mut value = payload();
    value["header"]["mode"] = json!("canary");
    value["rows"][0]["scope"]["environment"] = json!("canary");
    assert!(PublishedFinancialReport::adapt(PAYLOAD_SCHEMA, &value, &expected).is_err());
    // Canary is a separately bound consumer of canonical Live facts; source
    // mode rewriting cannot create its authority or a new economic history.
}

#[test]
fn unknown_schema_fields_unsafe_counters_timestamps_and_payload_bounds_fail_closed() {
    assert!(PublishedFinancialReport::adapt("made-up", &payload(), &binding()).is_err());
    for (pointer, invalid) in [
        ("/version", json!(9_007_199_254_740_993_u64)),
        ("/version", json!("01")),
        ("/version", json!("0")),
        ("/version", json!("9223372036854775808")),
        ("/header/cut/as_of_ms", json!(9_007_199_254_740_992_i64)),
        ("/header/cut/as_of_ms", json!(-1)),
        ("/header/cut/as_of_sub_ms_us", json!("1000")),
        ("/header/cut/as_of_sub_ms_us", json!("01")),
        (
            "/statements/0/statement/opening_at_ms",
            json!(1_792_735_200_124_i64),
        ),
    ] {
        let mut value = payload();
        *value.pointer_mut(pointer).unwrap() = invalid;
        assert!(adapt(&value).is_err(), "{pointer}");
    }
    let mut value = payload();
    value["rows"][0]["secret"] = json!("TEST_ONLY-no-raw-payload-forwarding");
    assert!(adapt(&value).is_err());
    let mut value = payload();
    value["rows"] = json!(vec![row("TEST_ONLY-source-A"); 129]);
    assert!(matches!(adapt(&value), Err(FinancialError::Bounds)));
    let mut value = payload();
    value["excess"] = json!("x".repeat(MAX_BYTES));
    assert!(matches!(adapt(&value), Err(FinancialError::Bounds)));
}

#[test]
fn every_nullable_pm_column_requires_explicit_null_not_missing_schema_fields() {
    let mut pointers: Vec<String> = ["/native", "/native_snapshot"]
        .into_iter()
        .map(str::to_owned)
        .collect();
    for field in [
        "nav",
        "realized_pnl",
        "unrealized_pnl",
        "fees",
        "funding",
        "interest",
        "gross_exposure",
        "net_exposure",
    ] {
        pointers.push(format!("/rows/0/economics/{field}"));
    }
    for field in [
        "margin_risk_requirement",
        "exposure_cap",
        "backing",
        "new_risk_capacity",
    ] {
        pointers.push(format!("/rows/0/controls/{field}"));
    }
    for field in ["broker_applied", "verified", "effective"] {
        pointers.push(format!("/rows/0/controls/profile/{field}"));
    }
    for pointer in pointers {
        let (parent, field) = pointer.rsplit_once('/').unwrap();
        let mut missing = payload();
        missing
            .pointer_mut(parent)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove(field);
        assert!(
            matches!(adapt(&missing), Err(FinancialError::Shape)),
            "{pointer}"
        );
        let mut explicit_null = payload();
        *explicit_null.pointer_mut(&pointer).unwrap() = Value::Null;
        assert!(adapt(&explicit_null).is_ok(), "{pointer}");
    }
}
