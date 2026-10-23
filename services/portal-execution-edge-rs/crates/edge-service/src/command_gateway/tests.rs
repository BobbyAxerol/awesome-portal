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

fn result(delivery: &str, business: Option<(&str, &str, &str)>) -> GatewayResult {
    use command_relay::durable::{AuthorityReceipt, BusinessState};
    let intent = parse("paper", &wire("paper", "TOP_UP")).unwrap().intent;
    let outcome = business.map(|(state, applied, pending)| {
        let receipt = AuthorityReceipt::new(&intent, "TEST_ONLY-source", 9_007_199_254_740_993,
            BusinessState::parse(state).unwrap(), json!({
                "command_id":"TEST_ONLY-command", "state":state,
                "amounts":{"requested":"10.000","applied":applied,"pending":pending,
                    "cancelled":"0","rejected":"0"},
                "currency":"USDT", "parent_receipt":"TEST_ONLY-parent", "blockers":[],
                "before_ref":"TEST_ONLY-before", "after_ref":"TEST_ONLY-after",
                "source_ref":"TEST_ONLY-source", "policy_ref":"TEST_ONLY-policy",
                "binding_ref":"TEST_ONLY-binding", "current_versions":{"budget":9_007_199_254_740_993_i64},
                "physical_transfer_performed":false, "cli_exit_code":if pending == "0" {0} else {3},
                "next_action":if pending == "0" {"REVIEW_RECEIPT"} else {"QUERY_SAME_INTENT"}
            })).unwrap();
        PmOutcome { authority_receipt:"TEST_ONLY-authority-receipt".into(),
            source_intent_digest:"a".repeat(64), target_ref:"TEST_ONLY-target".into(), receipt }
    });
    GatewayResult {
        record: CommandRecord {
            command_id: uuid::Uuid::now_v7(),
            intent,
            delivery: delivery.into(),
            receipt: outcome.as_ref().map(|o| o.receipt.clone()),
        },
        outcome,
    }
}

#[test]
fn result_keeps_delivery_business_and_projection_independent() {
    for delivery in [
        "PREPARED",
        "SENDING",
        "ACKNOWLEDGED",
        "DELIVERY_UNKNOWN",
        "FAILED_BEFORE_SEND",
    ] {
        let result = result(delivery, None);
        let value = encode_result(&result.record.intent, &result).unwrap();
        assert_eq!(value["delivery_state"], delivery);
        assert!(value["business_state"].is_null());
        assert!(value["terminal"].is_null());
        assert!(value["outcome"].is_null());
        assert_eq!(value["projection_state"], "UNAVAILABLE");
        assert!(value["projection_applied_checkpoint"].is_null());
    }
}

#[test]
fn full_result_preserves_pending_money_and_lossless_versions() {
    let result = result(
        "ACKNOWLEDGED",
        Some(("PARTIALLY_APPLIED", "3.000", "7.000")),
    );
    let value = encode_result(&result.record.intent, &result).unwrap();
    assert_eq!(value["business_state"], "PARTIALLY_APPLIED");
    assert_eq!(value["terminal"], false);
    assert_eq!(value["outcome"]["source_revision"], "9007199254740993");
    let presentation = &value["outcome"]["presentation"];
    assert_eq!(
        presentation["current_versions"]["budget"],
        "9007199254740993"
    );
    assert_eq!(presentation["amounts"]["applied"], "3.000");
    assert_eq!(presentation["amounts"]["pending"], "7.000");
    let original = result.outcome.as_ref().unwrap().receipt.payload();
    for (field, expected) in original.as_object().unwrap() {
        if field != "current_versions" {
            assert_eq!(&presentation[field], expected, "{field}");
        }
    }
    assert!(value.get("scope").is_none());
    assert!(value.get("payload").is_none());
    assert!(value["projection_applied_checkpoint"].is_null());
}

#[test]
fn applied_receipt_is_terminal_without_claiming_projected_effect() {
    let result = result("ACKNOWLEDGED", Some(("APPLIED", "10.000", "0")));
    let value = encode_result(&result.record.intent, &result).unwrap();
    assert_eq!(value["business_state"], "APPLIED");
    assert_eq!(value["terminal"], true);
    assert_eq!(value["projection_state"], "UNAVAILABLE");
}

#[test]
fn result_refuses_mixed_or_reduced_custody_in_both_directions() {
    let mut value = result("ACKNOWLEDGED", Some(("APPLIED", "10.000", "0")));
    let original = value.record.intent.clone();
    value.record.receipt = None;
    assert!(encode_result(&original, &value).is_err());
    value.record.receipt = value.outcome.as_ref().map(|o| o.receipt.clone());
    value.outcome = None;
    assert!(encode_result(&original, &value).is_err());
    let mut value = result("INVENTED_SUCCESS", None);
    assert!(encode_result(&original, &value).is_err());
    value.record.delivery = "PREPARED".into();
    let other = parse("live", &wire("live", "TOP_UP")).unwrap().intent;
    assert!(encode_result(&other, &value).is_err());
}

#[tokio::test]
async fn error_response_is_bounded_private_and_never_a_retry_instruction() {
    let response = safe_error(StatusCode::SERVICE_UNAVAILABLE, "OUTCOME_UNAVAILABLE");
    assert_eq!(response.headers()["cache-control"], "no-store");
    let bytes = axum::body::to_bytes(response.into_body(), 1_024)
        .await
        .unwrap();
    let value: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(value["error"]["retryable"], false);
    assert_eq!(value["error"]["next_action"], "QUERY_SAME_INTENT");
    assert_eq!(value["error"].as_object().unwrap().len(), 3);
}
