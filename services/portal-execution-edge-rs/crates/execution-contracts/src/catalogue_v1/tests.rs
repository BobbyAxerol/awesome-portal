use super::*;

fn opaque(value: &str) -> Opaque {
    Opaque::parse(value).unwrap()
}
fn time(value: u64) -> SafeInteger {
    SafeInteger::new(value).unwrap()
}
fn shared(kind: &str) -> Value {
    let fixtures: Value = serde_json::from_str(include_str!("../../../../contracts/execution-catalogue-v1/shared/execution-v2-foundation.synthetic.valid.json")).unwrap();
    fixtures["cases"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|case| case["facts"].as_array().unwrap())
        .find(|f| f["type"] == kind && f["valid"] == true)
        .unwrap()["value"]
        .clone()
}
fn metadata() -> Metadata {
    serde_json::from_value(shared("StreamEnvelope")).unwrap()
}
fn context() -> BrowserContext {
    BrowserContext {
        snapshot_id: opaque("test:snapshot"),
        dataset: opaque("orders"),
        produced_at_ms: time(100),
        received_at_ms: time(101),
        projection: Projection::ReusedEdge,
        coverage_proof: None,
    }
}
fn binding() -> CursorBinding {
    CursorBinding {
        dataset: opaque("orders"),
        principal: opaque("test:user"),
        scope_digest: opaque("full:scope"),
        filter_digest: opaque("filter:1"),
        authorization_revision: opaque("auth:1"),
        source_continuity_epoch: opaque("epoch:1"),
        projection_generation: opaque("generation:1"),
        snapshot_id: opaque("snapshot:1"),
        schema: opaque("edge.v1"),
        expires_at_ms: time(999),
    }
}

#[test]
fn t02_01_complete_bounded_traversal_and_oversize() {
    let records: Vec<Record> = (0..1379)
        .map(|n| Record {
            key: vec![opaque("same-sort-field"), opaque(&format!("id:{n:06}"))],
            value: json!({"id":format!("id:{n:06}"),"value":"λ\"\\\n".repeat(n % 13 + 1)}),
        })
        .collect();
    let limits = PageLimits {
        rows: 17,
        bytes: 1000,
    };
    let mut after: Option<Vec<Opaque>> = None;
    let mut values = vec![];
    let mut pages = 0;
    loop {
        let page = bounded_page(
            &records,
            after.as_deref(),
            opaque("test:snapshot"),
            &limits,
            |key| Opaque::parse(format!("server-held:{}", key.last().unwrap().as_str())),
        )
        .unwrap();
        assert!(page.rows.len() <= limits.rows);
        assert!(serde_json::to_vec(&page).unwrap().len() <= limits.bytes);
        values.extend(page.rows.clone());
        pages += 1;
        if page.continuation.is_none() {
            break;
        }
        let id = page.rows.last().unwrap()["id"].as_str().unwrap();
        after = Some(vec![opaque("same-sort-field"), opaque(id)]);
    }
    assert!(pages > 80);
    assert_eq!(
        values,
        records.iter().map(|r| r.value.clone()).collect::<Vec<_>>()
    );
    assert_eq!(
        bounded_page(
            &records,
            None,
            opaque("test:snapshot"),
            &PageLimits {
                rows: 1,
                bytes: 140
            },
            |_| Ok(opaque("server:cursor"))
        )
        .unwrap_err(),
        Error::RecordTooLarge
    );
}

#[test]
fn t02_01_invalid_keys_bounds_and_terminal_empty_page() {
    let records = [
        Record {
            key: vec![opaque("a")],
            value: json!(0),
        },
        Record {
            key: vec![opaque("a")],
            value: json!(1),
        },
    ];
    assert_eq!(
        bounded_page(
            &records,
            None,
            opaque("s"),
            &PageLimits {
                rows: 1,
                bytes: 1000
            },
            |_| Ok(opaque("c"))
        )
        .unwrap_err(),
        Error::UnstableKey
    );
    assert_eq!(
        bounded_page(
            &[],
            None,
            opaque("s"),
            &PageLimits {
                rows: 0,
                bytes: 1000
            },
            |_| Ok(opaque("c"))
        )
        .unwrap_err(),
        Error::InvalidPageBounds
    );
    assert!(bounded_page(
        &[],
        None,
        opaque("s"),
        &PageLimits {
            rows: 1,
            bytes: 1000
        },
        |_| Ok(opaque("c"))
    )
    .unwrap()
    .rows
    .is_empty());
    assert_eq!(
        bounded_page(
            &[],
            Some(&[opaque("missing")]),
            opaque("s"),
            &PageLimits {
                rows: 1,
                bytes: 1000
            },
            |_| Ok(opaque("c"))
        )
        .unwrap_err(),
        Error::ResyncRequired
    );
}

#[test]
fn t02_02_exact_decimal_id_and_safe_time_roundtrip() {
    for s in [
        "0",
        "-0.000",
        "900719925474099312345678901234567890.0000000000000000000000000000000000001",
        "-0.00000000000000000000000000000000000000001",
    ] {
        let d = ExactDecimal::parse(s).unwrap();
        assert_eq!(
            serde_json::from_str::<ExactDecimal>(&serde_json::to_string(&d).unwrap())
                .unwrap()
                .as_str(),
            s
        );
    }
    for s in ["01", ".1", "1.", "1e9", "NaN", "+1", "--1", "-", ""] {
        assert!(ExactDecimal::parse(s).is_err());
    }
    assert!(ExactDecimal::parse("1".repeat(129)).is_err());
    assert!(serde_json::from_str::<ExactDecimal>("0.1").is_err());
    assert_eq!(
        opaque("90071992547409931234567890").as_str(),
        "90071992547409931234567890"
    );
    assert!(SafeInteger::new(MAX_SAFE_INTEGER).is_ok());
    assert!(SafeInteger::new(MAX_SAFE_INTEGER + 1).is_err());
    for s in ["-1", "1.1", "\"1\""] {
        assert!(serde_json::from_str::<SafeInteger>(s).is_err());
    }
    let null: Option<ExactDecimal> = serde_json::from_str("null").unwrap();
    assert_eq!(null, None);
    let precise = legacy_clock("2026-10-16T02:00:00.123456789Z").unwrap();
    assert_eq!(precise.sub_ms_nanoseconds, 456_789);
    assert_eq!(
        precise.source_timestamp.as_str(),
        "2026-10-16T02:00:00.123456789Z"
    );
    assert_eq!(
        precise.utc_ms,
        legacy_clock("2026-10-16T09:00:00.123456789+07:00")
            .unwrap()
            .utc_ms
    );
    assert!(legacy_clock("2026-02-30T00:00:00Z").is_err());
    assert!(legacy_clock("1969-12-31T00:00:00Z").is_err());
}

#[test]
fn t02_04_every_cursor_binding_and_expiry_fails_closed() {
    let b = binding();
    b.check(&b, time(1)).unwrap();
    for index in 0..9 {
        let mut changed = b.clone();
        let slots = [
            &mut changed.dataset,
            &mut changed.principal,
            &mut changed.scope_digest,
            &mut changed.filter_digest,
            &mut changed.authorization_revision,
            &mut changed.source_continuity_epoch,
            &mut changed.projection_generation,
            &mut changed.snapshot_id,
            &mut changed.schema,
        ];
        *slots.into_iter().nth(index).unwrap() = opaque("different");
        assert_eq!(b.check(&changed, time(1)), Err(Error::ResyncRequired));
    }
    assert_eq!(b.check(&b, time(999)), Err(Error::ResyncRequired));
}

#[test]
fn t02_05_shared_strict_unknown_fields_and_major_negotiation() {
    let base = shared("StreamEnvelope");
    assert_eq!(
        serde_json::to_value(serde_json::from_value::<Metadata>(base.clone()).unwrap()).unwrap(),
        base
    );
    let mut v = base.clone();
    v["unknown"] = json!(1);
    assert!(serde_json::from_value::<Metadata>(v).is_err());
    let mut v = base.clone();
    v["contract_version"] = json!("edge.v2");
    assert!(serde_json::from_value::<Metadata>(v).is_err());
    let mut v = base;
    v.as_object_mut().unwrap().remove("replacement_ref");
    assert!(serde_json::from_value::<Metadata>(v).is_err());
    compatible(1, &[opaque("exact")], &[opaque("exact")]).unwrap();
    assert_eq!(compatible(2, &[], &[]), Err(Error::UnsupportedSchema));
    assert_eq!(
        compatible(1, &[opaque("future-required")], &[]),
        Err(Error::UnsupportedSchema)
    );
}

#[test]
fn t02_06_mapping_never_invents_coverage_or_clock() {
    let edge = metadata();
    let mut c = context();
    let browser = edge.to_browser(&c).unwrap();
    assert_eq!(browser["facts_through_ms"], Value::Null);
    assert_eq!(browser["recorded_through_ms"], Value::Null);
    assert_eq!(browser["quality"]["completeness"], "UNRESOLVED");
    assert_eq!(browser["produced_at_ms"], 100);
    assert_eq!(
        browser["emitted_at_ms"],
        serde_json::to_value(edge.emitted_at_ms).unwrap()
    );
    assert_eq!(
        browser["resume_cursor"],
        serde_json::to_value(&edge.continuation).unwrap()
    );
    let scoped = edge
        .to_scoped_browser(&c, opaque("test:bff-cursor"))
        .unwrap();
    assert_eq!(
        scoped["mapping_revision"],
        "execution.scoped-continuation.v1"
    );
    assert_eq!(scoped["snapshot"]["resume_cursor"], "test:bff-cursor");
    c.projection = Projection::PortalDerived {
        generation: opaque("portal:gen"),
        lineage_ref: opaque("test:lineage"),
    };
    let browser = edge.to_browser(&c).unwrap();
    assert_eq!(
        browser["versions"]["source_continuity_epoch"],
        serde_json::to_value(&edge.source_continuity_epoch).unwrap()
    );
    assert_eq!(browser["versions"]["projection_generation"], "portal:gen");
}

#[test]
fn t02_07_source_bound_proof_preserved_not_assumed() {
    let edge = metadata();
    let mut c = context();
    c.coverage_proof = Some(CoverageProof {
        source_set_ref: edge.quality.source_set_ref.clone(),
        as_of_ms: edge.as_of_ms,
        facts_through_ms: time(12),
        recorded_through_ms: time(13),
    });
    let browser = edge.to_browser(&c).unwrap();
    assert_eq!(browser["facts_through_ms"], 12);
    assert_eq!(browser["recorded_through_ms"], 13);
    c.coverage_proof.as_mut().unwrap().source_set_ref = opaque("wrong");
    assert_eq!(edge.to_browser(&c), Err(Error::CoverageProofMismatch));
    c.coverage_proof.as_mut().unwrap().source_set_ref = edge.quality.source_set_ref.clone();
    c.coverage_proof.as_mut().unwrap().as_of_ms = time(0);
    assert_eq!(edge.to_browser(&c), Err(Error::CoverageProofMismatch));
}

#[test]
fn t02_05_research_shared_mapping_golden_then_scoped_stage() {
    let golden: Value = serde_json::from_str(include_str!(
        "../../../../contracts/execution-catalogue-v1/mapping-golden.json"
    ))
    .unwrap();
    let edge: Metadata = serde_json::from_value(golden["source"].clone()).unwrap();
    let c = BrowserContext {
        snapshot_id: opaque("test:golden-snapshot"),
        dataset: opaque("test:orders"),
        produced_at_ms: time(1_800_000_000_999),
        received_at_ms: time(1_800_000_000_998),
        projection: Projection::ReusedEdge,
        coverage_proof: None,
    };
    assert_eq!(edge.to_browser(&c).unwrap(), golden["expected"]);
    assert_eq!(
        edge.to_scoped_browser(&c, opaque("test:bff-issued-bound-cursor"))
            .unwrap(),
        golden["scope_stage"]
    );
}

#[test]
fn t02_09_stage_lifecycle_trade_state_independent() {
    assert_eq!(
        serde_json::from_value::<Environment>(json!("live")).unwrap(),
        Environment::Live
    );
    assert_eq!(
        serde_json::from_value::<Stage>(json!("CANARY")).unwrap(),
        Stage::Canary
    );
    assert!(serde_json::from_value::<Environment>(json!("canary")).is_err());
    assert!(serde_json::from_value::<Stage>(json!("ARCHIVED")).is_err());
    assert_eq!(
        serde_json::from_value::<Lifecycle>(json!("ARCHIVED")).unwrap(),
        Lifecycle::Archived
    );
    assert_eq!(
        serde_json::from_value::<TradeState>(json!("HALTED")).unwrap(),
        TradeState::Halted
    );
}

#[test]
fn t02_10_quality_bound_and_null_required() {
    let mut edge = metadata();
    edge.quality.reasons = vec![opaque("r"); 33];
    assert_eq!(edge.to_browser(&context()), Err(Error::InvalidWireValue));
    let mut v = shared("StreamEnvelope");
    v["quality"]["freshness"] = json!("UNRESOLVED");
    assert!(serde_json::from_value::<Metadata>(v).is_err());
    let mut v = shared("StreamEnvelope");
    v["quality"]["reasons"] = json!(vec!["r"; 33]);
    assert!(serde_json::from_value::<Metadata>(v).is_err());
}

#[test]
fn t02_03_current_only_is_not_history_and_source_is_not_runtime() {
    let current = map_legacy(LegacyDisposition::CurrentOnly, false, true, false);
    assert_eq!(current.availability, GuideAvailability::Available);
    let history = map_legacy(LegacyDisposition::CurrentOnly, true, true, false);
    assert_eq!(history.availability, GuideAvailability::Unavailable);
    assert_eq!(history.history_capability, HistoryCapability::CurrentOnly);
    for status in [
        LegacyDisposition::CurrentOnly,
        LegacyDisposition::HistoryAvailable,
    ] {
        assert_eq!(
            map_legacy(status, false, false, false).implementation_status,
            Implementation::RuntimePending
        );
    }
    for status in [
        LegacyDisposition::Planned,
        LegacyDisposition::SourceVerified,
        LegacyDisposition::RuntimePending,
    ] {
        assert_eq!(
            map_legacy(status, false, true, true).availability,
            GuideAvailability::Unavailable
        );
    }
    let restricted = map_legacy(LegacyDisposition::Restricted, false, true, true);
    assert_eq!(
        shared_availability(restricted.availability),
        json!({"state":"DENIED","reason_code":"RESOURCE_NOT_AVAILABLE"})
    );
}

#[test]
fn t02_registry_all_families_have_explicit_owners_and_gaps() {
    let registry: Value = serde_json::from_str(REGISTRY).unwrap();
    assert_eq!(registry["families"].as_array().unwrap().len(), 42);
    assert_eq!(registry["new_runtime_exports_enabled"], false);
    for family in registry["families"].as_array().unwrap() {
        for key in [
            "owner",
            "grain",
            "writer_refs",
            "source_query_refs",
            "history_scope",
            "publication_gates",
        ] {
            assert!(!family[key].is_null(), "{} {key}", family["id"]);
        }
        assert_eq!(family["availability"], "UNAVAILABLE");
    }
}
