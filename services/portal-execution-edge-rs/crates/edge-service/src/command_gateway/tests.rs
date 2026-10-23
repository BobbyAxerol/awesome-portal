//! `TEST_ONLY` normalized PM inputs, not Portal/PM runtime authority.
use super::*;
use projection_core::canonical_digest;
use serde_json::json;

fn scope(environment: &str) -> CommandScope {
    CommandScope::new(
        "TEST_ONLY-workspace",
        environment,
        "TEST_ONLY-profile",
        "TEST_ONLY-authority",
        "TEST_ONLY-original-actor",
        "TEST_ONLY-workload",
    )
    .unwrap()
}

fn payload(operation: &str) -> Value {
    let mut value = json!({"schema_version":"pma.capital-command.v1.1", "operation":operation,
        "idempotency_key":"TEST_ONLY-key", "recipient_kind":"PORTFOLIO", "currency":"USDT",
        "reason":"TEST_ONLY-no-effect", "expected_versions":{"budget":"1","source":"1","parent":"1"},
        "amount":"10.000"});
    let object = value.as_object_mut().unwrap();
    match operation {
        "FUND" => {
            object.insert("source_ref".into(), json!("TEST_ONLY-source"));
            object.insert(
                "expected_versions".into(),
                json!({"budget":"1","source":"1","claim":"1"}),
            );
        }
        "SET_ROOT_LIMIT" => {
            object.remove("amount");
            object.insert("target_root_limit".into(), json!("10.000"));
            object.insert("recipient_kind".into(), json!("ROOT"));
            object.insert(
                "expected_versions".into(),
                json!({"budget":"1","source":"1"}),
            );
        }
        "IMMEDIATE_DECREASE" | "RECALL_PARTIAL" | "RECALL_FULL" | "ADJUST_TARGET_BUDGET" => {
            object.insert(
                "expected_versions".into(),
                json!({"budget":"1","source":"1","parent":"1","book":"1"}),
            );
            if operation == "RECALL_FULL" {
                object.remove("amount");
            }
            if operation == "ADJUST_TARGET_BUDGET" {
                object.remove("amount");
                object.insert("target_budget".into(), json!("10.000"));
            }
        }
        _ => {}
    }
    value
}

fn wire(environment: &str, operation: &str) -> Value {
    let payload = payload(operation);
    let digest = canonical_digest(&payload).unwrap();
    let original = CommandIntent::new(
        scope(environment),
        "TEST_ONLY-key",
        operation,
        payload.clone(),
        &digest,
    )
    .unwrap();
    json!({"schema_version":SCHEMA, "action":"SUBMIT", "key":original.key(),
        "operation":original.operation(), "payload":payload, "payload_digest":digest,
        "request_digest":original.request_digest()})
}

fn parse(environment: &str, value: &Value) -> Result<OriginalCall, InvalidOriginal> {
    decode_original(
        scope(environment),
        &serde_json::to_vec(value).unwrap(),
        MAX_BODY,
    )
}

#[test]
fn all_eight_operations_and_three_source_modes_reuse_pm_validation() {
    for environment in ["paper", "sandbox", "live"] {
        for operation in [
            "FUND",
            "INITIAL_GRANT",
            "TOP_UP",
            "IMMEDIATE_DECREASE",
            "RECALL_PARTIAL",
            "RECALL_FULL",
            "ADJUST_TARGET_BUDGET",
            "SET_ROOT_LIMIT",
        ] {
            let wire = wire(environment, operation);
            let call = parse(environment, &wire).unwrap();
            assert_eq!(call.action, HumanAction::Submit);
            assert_eq!(call.intent.operation(), operation);
            assert_eq!(call.intent.scope().environment(), environment);
            let mut status = wire;
            status["action"] = json!("STATUS");
            assert_eq!(
                parse(environment, &status).unwrap().intent.request_digest(),
                call.intent.request_digest()
            );
        }
    }
}

#[test]
fn body_cannot_supply_identity_grants_target_or_service_recovery() {
    for field in [
        "actor_id",
        "scope",
        "permission",
        "grant",
        "target_ref",
        "url",
        "source_intent_digest",
        "reconcile",
    ] {
        let mut value = wire("paper", "TOP_UP");
        value[field] = json!("TEST_ONLY-not-authority");
        assert!(parse("paper", &value).is_err(), "{field}");
    }
    for action in [
        "RECOVER",
        "SERVICE_STATUS",
        "execution.read",
        "SUBMIT_AND_RETRY",
    ] {
        let mut value = wire("paper", "TOP_UP");
        value["action"] = json!(action);
        assert!(parse("paper", &value).is_err());
    }
}

#[test]
fn original_scope_and_both_digests_are_independent_exact_bindings() {
    let value = wire("paper", "TOP_UP");
    assert!(parse("live", &value).is_err());
    let other_actor = CommandScope::new(
        "TEST_ONLY-workspace",
        "paper",
        "TEST_ONLY-profile",
        "TEST_ONLY-authority",
        "TEST_ONLY-current-requester",
        "TEST_ONLY-workload",
    )
    .unwrap();
    assert!(decode_original(other_actor, &serde_json::to_vec(&value).unwrap(), MAX_BODY).is_err());
    for field in [
        "payload_digest",
        "request_digest",
        "key",
        "operation",
        "schema_version",
    ] {
        let mut changed = value.clone();
        changed[field] = json!("TEST_ONLY-changed");
        assert!(parse("paper", &changed).is_err());
    }
    let mut changed = value;
    changed["payload"]["amount"] = json!(10.0);
    assert!(parse("paper", &changed).is_err());
}

#[test]
fn duplicate_fields_are_rejected_at_every_body_depth() {
    let raw = serde_json::to_string(&wire("paper", "TOP_UP")).unwrap();
    for (old, replacement) in [
        (
            "\"action\":\"SUBMIT\"",
            "\"action\":\"SUBMIT\",\"action\":\"STATUS\"",
        ),
        (
            "\"amount\":\"10.000\"",
            "\"amount\":\"10.000\",\"amount\":\"10.000\"",
        ),
        ("\"budget\":\"1\"", "\"budget\":\"1\",\"budget\":\"1\""),
    ] {
        assert!(raw.contains(old));
        assert!(decode_original(
            scope("paper"),
            raw.replace(old, replacement).as_bytes(),
            MAX_BODY
        )
        .is_err());
    }
}

#[test]
fn raw_size_and_json_shape_bounds_fail_before_dispatch() {
    let raw = serde_json::to_vec(&wire("paper", "TOP_UP")).unwrap();
    assert!(decode_original(scope("paper"), &raw, raw.len()).is_ok());
    for limit in [0, raw.len() - 1, MAX_BODY + 1] {
        assert!(decode_original(scope("paper"), &raw, limit).is_err());
    }
    for raw in [
        b"".as_slice(),
        b"null",
        b"[]",
        b"{}{}",
        b"false",
        b"{\"payload\":NaN}",
    ] {
        assert!(decode_original(scope("paper"), raw, MAX_BODY).is_err());
    }
}
