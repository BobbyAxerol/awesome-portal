//! `TEST_ONLY` format/correlation vectors. No real identity, grant or financial effect.
use super::*;
use crate::durable::CommandScope;
use serde_json::{json, Value};

fn intent() -> CommandIntent {
    let payload = json!({
        "schema_version":"pma.capital-command.v1.1", "operation":"RECALL_PARTIAL",
        "idempotency_key":"TEST_ONLY-key", "recipient_kind":"PORTFOLIO", "currency":"USDT",
        "amount":"10.000", "reason":"TEST_ONLY-no-send",
        "expected_versions":{"budget":"1", "source":"1", "parent":"1", "book":"1"},
    });
    let digest = canonical_digest(&payload).unwrap();
    let scope = CommandScope::new(
        "TEST_ONLY-workspace",
        "paper",
        "TEST_ONLY-profile",
        "TEST_ONLY-authority",
        "TEST_ONLY-human",
        "TEST_ONLY-workload",
    )
    .unwrap();
    CommandIntent::new(scope, "TEST_ONLY-key", "RECALL_PARTIAL", payload, &digest).unwrap()
}

fn binding(intent: &CommandIntent) -> PmSourceBinding {
    PmSourceBinding::new(intent, &"a".repeat(64), "TEST_ONLY-resolved-portfolio").unwrap()
}

fn wire(intent: &CommandIntent) -> Value {
    json!({
        "schema_version": OUTCOME_SCHEMA, "transport_payload_digest":intent.digest(),
        "source_intent_digest":"a".repeat(64),
        "source_key":[intent.scope().authority_scope_id(), intent.operation(), intent.key()],
        "target_ref":"TEST_ONLY-resolved-portfolio", "authority_receipt":"TEST_ONLY-owning-receipt",
        "source_revision":4, "projection_applied_checkpoint":null,
        "presentation":{
            "command_id":"TEST_ONLY-command", "state":"PARTIALLY_APPLIED",
            "amounts":{"requested":"10.000", "applied":"3.000", "pending":"7.000", "cancelled":"0", "rejected":"0"},
            "currency":"USDT", "parent_receipt":"TEST_ONLY-parent", "blockers":["TEST_ONLY-position"],
            "before_ref":"TEST_ONLY-before", "after_ref":"TEST_ONLY-after", "source_ref":"TEST_ONLY-source",
            "policy_ref":"TEST_ONLY-policy", "binding_ref":"TEST_ONLY-binding", "current_versions":{"budget":2},
            "physical_transfer_performed":false, "cli_exit_code":3, "next_action":"QUERY_SAME_INTENT"
        }
    })
}

fn decode(value: &Value) -> Result<PmOutcome, PmSourceError> {
    let intent = intent();
    decode_outcome(
        &intent,
        &binding(&intent),
        &serde_json::to_vec(value).unwrap(),
    )
}

#[test]
fn published_pm_http_vectors_match_exactly() {
    for (method, path, query, body, expected) in [
        (
            "POST",
            "/internal/pma11-candidate/capital/target/apply",
            "",
            "{}",
            "sha256:9de8d410b8cfdac664b05dd2ff4a88fdb02459961f63b1ad0ea2252a4d8e1cf9",
        ),
        (
            "GET",
            "/internal/pma11-candidate/reports/%CE%B1",
            "limit=2&cursor=a%2Bb",
            "",
            "sha256:51b68eb973f4f3d5bd1ffd99c7bfa41aedd04ca3385e78732e1dadbc8f7da6f2",
        ),
    ] {
        assert_eq!(
            http_request_digest(
                method,
                path.as_bytes(),
                query.as_bytes(),
                body.as_bytes(),
                1024
            )
            .unwrap(),
            expected
        );
    }
}

#[test]
fn delivery_whitespace_percent_encoding_query_order_and_method_are_not_normalized() {
    let original = http_request_digest("POST", b"/x/%61", b"a=1&b=2", b"{}", 1024).unwrap();
    for (method, path, query, body) in [
        (
            "GET",
            b"/x/%61".as_slice(),
            b"a=1&b=2".as_slice(),
            b"{}".as_slice(),
        ),
        ("POST", b"/x/a", b"a=1&b=2", b"{}"),
        ("POST", b"/x/%61", b"b=2&a=1", b"{}"),
        ("POST", b"/x/%61", b"a=1&b=2", b"{ }"),
    ] {
        assert_ne!(
            http_request_digest(method, path, query, body, 1024).unwrap(),
            original
        );
    }
    assert_ne!(original, intent().request_digest());
    assert_ne!(original, intent().digest());
}

#[test]
fn http_limits_and_method_fail_closed() {
    for (method, path, query, body, cap) in [
        ("post", b"/x".as_slice(), b"".as_slice(), b"".as_slice(), 1),
        ("DELETE", b"/x", b"", b"", 1),
        ("POST", b"x", b"", b"", 1),
        ("POST", b"/x?q", b"", b"", 1),
        ("GET", b"/x#f", b"", b"", 1),
        ("POST", b"/x", b"", b"{}", 1),
        ("GET", b"/x", b"", b"", 0),
    ] {
        assert_eq!(
            http_request_digest(method, path, query, body, cap),
            Err(PmSourceError::HttpBinding)
        );
    }
    assert!(http_request_digest("GET", &vec![b'/'; 8192], &vec![b'a'; 2048], b"", 1).is_ok());
    assert!(http_request_digest("GET", &vec![b'/'; 8193], b"", b"", 1).is_err());
    assert!(http_request_digest("GET", b"/", &vec![b'a'; 2049], b"", 1).is_err());
}

#[test]
fn full_source_metadata_and_exact_presentation_survive() {
    let intent = intent();
    let value = wire(&intent);
    let result = decode(&value).unwrap();
    assert_eq!(result.authority_receipt, "TEST_ONLY-owning-receipt");
    assert_eq!(result.source_intent_digest, "a".repeat(64));
    assert_eq!(result.target_ref, "TEST_ONLY-resolved-portfolio");
    assert_eq!(result.receipt.payload(), &value["presentation"]);
    assert_eq!(result.receipt.revision(), 4);
    assert_eq!(result.receipt.state(), BusinessState::PartiallyApplied);
    assert_eq!(result.receipt.intent_digest(), intent.request_digest());
    assert_ne!(result.source_intent_digest, intent.digest());
}

#[test]
fn source_correlation_rejects_every_mismatched_pin() {
    for (pointer, replacement) in [
        ("/schema_version", json!("other")),
        ("/transport_payload_digest", json!("sha256:other")),
        ("/source_intent_digest", json!("b".repeat(64))),
        ("/source_key/0", json!("other-authority")),
        ("/source_key/1", json!("TOP_UP")),
        ("/source_key/2", json!("other-key")),
        ("/target_ref", json!("other-target")),
        ("/authority_receipt", json!("")),
    ] {
        let mut value = wire(&intent());
        *value.pointer_mut(pointer).unwrap() = replacement;
        assert!(decode(&value).is_err(), "{pointer}");
    }
}

#[test]
fn original_source_binding_cannot_attach_to_another_actor_or_payload() {
    let old = intent();
    let bound = binding(&old);
    let scope = CommandScope::new(
        "TEST_ONLY-workspace",
        "paper",
        "TEST_ONLY-profile",
        "TEST_ONLY-authority",
        "other-human",
        "TEST_ONLY-workload",
    )
    .unwrap();
    let other = CommandIntent::new(
        scope,
        old.key(),
        old.operation(),
        old.payload().clone(),
        old.digest(),
    )
    .unwrap();
    assert!(decode_outcome(&other, &bound, &serde_json::to_vec(&wire(&old)).unwrap()).is_err());
    for digest in [
        "a".repeat(63),
        "A".repeat(64),
        format!("sha256:{}", "a".repeat(64)),
    ] {
        assert!(PmSourceBinding::new(&old, &digest, "TEST_ONLY-target").is_err());
    }
    assert!(PmSourceBinding::new(&old, &"a".repeat(64), " target").is_err());
}

#[test]
fn native_integer_counters_and_null_checkpoint_are_required() {
    for (pointer, replacement) in [
        ("/source_revision", json!("4")),
        ("/source_revision", json!(4.0)),
        ("/source_revision", json!(-1)),
        ("/presentation/current_versions/budget", json!("2")),
        ("/presentation/cli_exit_code", json!("3")),
        ("/projection_applied_checkpoint", json!(4)),
        ("/presentation/physical_transfer_performed", json!(true)),
    ] {
        let mut value = wire(&intent());
        *value.pointer_mut(pointer).unwrap() = replacement;
        assert!(decode(&value).is_err(), "{pointer}");
    }
    for field in [
        "projection_applied_checkpoint",
        "authority_receipt",
        "source_revision",
    ] {
        let mut value = wire(&intent());
        value.as_object_mut().unwrap().remove(field);
        assert!(decode(&value).is_err(), "{field}");
    }
}

#[test]
fn missing_and_extra_fields_fail_at_every_level() {
    for pointer in [
        "",
        "/presentation",
        "/presentation/amounts",
        "/presentation/current_versions",
    ] {
        let mut value = wire(&intent());
        value
            .pointer_mut(pointer)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .insert(
                "unexpected".to_owned(),
                json!({"secret":"TEST_ONLY-canary"}),
            );
        assert!(decode(&value).is_err(), "{pointer}");
    }
    let mut value = wire(&intent());
    value["presentation"]
        .as_object_mut()
        .unwrap()
        .remove("parent_receipt");
    assert!(decode(&value).is_err());
}

#[test]
fn duplicate_fields_fail_at_all_four_nesting_levels() {
    let intent = intent();
    let raw = serde_json::to_string(&wire(&intent)).unwrap();
    for (needle, replacement) in [
        (
            "\"source_revision\":4",
            "\"source_revision\":4,\"source_revision\":4",
        ),
        (
            "\"state\":\"PARTIALLY_APPLIED\"",
            "\"state\":\"PARTIALLY_APPLIED\",\"state\":\"APPLIED\"",
        ),
        (
            "\"applied\":\"3.000\"",
            "\"applied\":\"3.000\",\"applied\":\"3.000\"",
        ),
        ("\"budget\":2", "\"budget\":2,\"budget\":2"),
    ] {
        assert!(raw.contains(needle));
        assert!(
            decode_outcome(
                &intent,
                &binding(&intent),
                raw.replace(needle, replacement).as_bytes()
            )
            .is_err(),
            "{needle}"
        );
    }
}

#[test]
fn malformed_oversized_summary_and_transport_ack_are_not_receipts() {
    let intent = intent();
    let binding = binding(&intent);
    for raw in [
        b"{}".as_slice(),
        b"{",
        br#"{"status":"ACKNOWLEDGED"}"#,
        br#"{"status":"UNKNOWN"}"#,
    ] {
        assert!(decode_outcome(&intent, &binding, raw).is_err());
    }
    assert_eq!(
        decode_outcome(&intent, &binding, &vec![b' '; MAX_RECEIPT_BYTES + 1]),
        Err(PmSourceError::BodyLimit)
    );
    let mut value = wire(&intent);
    value["presentation"]["state"] = json!("UNKNOWN");
    assert!(decode(&value).is_err());
}

#[test]
fn exact_partition_currency_and_progress_checks_are_reused() {
    for (pointer, replacement) in [
        ("/presentation/amounts/applied", json!("3.001")),
        ("/presentation/amounts/requested", json!(10.0)),
        ("/presentation/currency", json!("USD")),
        ("/presentation/next_action", json!("REVIEW_RECEIPT")),
    ] {
        let mut value = wire(&intent());
        *value.pointer_mut(pointer).unwrap() = replacement;
        assert!(decode(&value).is_err());
    }
    let mut next = wire(&intent());
    next["source_revision"] = json!(5);
    next["presentation"]["amounts"]["applied"] = json!("4.000");
    next["presentation"]["amounts"]["pending"] = json!("6.000");
    let old = decode(&wire(&intent())).unwrap().receipt;
    let newer = decode(&next).unwrap().receipt;
    assert!(newer.validate_progress(&old).is_ok());
    assert!(old.validate_progress(&newer).is_err());
}

#[test]
fn all_six_owning_states_preserve_exact_pm_presentation() {
    for (state, values, code) in [
        ("APPLIED", ["10.000", "0", "0", "0"], 0),
        ("REJECTED", ["0", "0", "0", "10.000"], 2),
        ("WAITING_ENCUMBRANCE", ["0", "10.000", "0", "0"], 3),
        ("PARTIALLY_APPLIED", ["3.000", "7.000", "0", "0"], 3),
        ("CANCELLED", ["0", "0", "10.000", "0"], 2),
        (
            "PARTIALLY_APPLIED_CANCELLED",
            ["3.000", "0", "7.000", "0"],
            2,
        ),
    ] {
        let mut value = wire(&intent());
        value["presentation"]["state"] = json!(state);
        for (name, amount) in ["applied", "pending", "cancelled", "rejected"]
            .iter()
            .zip(values)
        {
            value["presentation"]["amounts"][name] = json!(amount);
        }
        value["presentation"]["cli_exit_code"] = json!(code);
        value["presentation"]["next_action"] = json!(if code == 3 {
            "QUERY_SAME_INTENT"
        } else {
            "REVIEW_RECEIPT"
        });
        assert_eq!(
            decode(&value).unwrap().receipt.payload(),
            &value["presentation"]
        );
    }
}

#[test]
fn all_modes_and_eight_shapes_are_decoded_without_activating_any() {
    for environment in ["paper", "sandbox", "live"] {
        for operation in [
            "FUND",
            "INITIAL_GRANT",
            "TOP_UP",
            "SET_ROOT_LIMIT",
            "IMMEDIATE_DECREASE",
            "RECALL_PARTIAL",
            "RECALL_FULL",
            "ADJUST_TARGET_BUDGET",
        ] {
            let mut body = intent().payload().clone();
            body["operation"] = json!(operation);
            body.as_object_mut().unwrap().remove("amount");
            body["expected_versions"] = match operation {
                "FUND" => json!({"budget":"1", "source":"1", "claim":"1"}),
                "INITIAL_GRANT" | "TOP_UP" => json!({"budget":"1", "source":"1", "parent":"1"}),
                "SET_ROOT_LIMIT" => json!({"budget":"1", "source":"1"}),
                _ => json!({"budget":"1", "source":"1", "parent":"1", "book":"1"}),
            };
            match operation {
                "RECALL_FULL" => {}
                "SET_ROOT_LIMIT" => {
                    body["recipient_kind"] = json!("ROOT");
                    body["target_root_limit"] = json!("10.000");
                }
                "ADJUST_TARGET_BUDGET" => body["target_budget"] = json!("10.000"),
                _ => body["amount"] = json!("10.000"),
            }
            if operation == "FUND" {
                body["source_ref"] = json!("TEST_ONLY-funding-source");
            }
            let scope = CommandScope::new(
                "TEST_ONLY-workspace",
                environment,
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            )
            .unwrap();
            let digest = canonical_digest(&body).unwrap();
            let intent =
                CommandIntent::new(scope, "TEST_ONLY-key", operation, body, &digest).unwrap();
            let mut value = wire(&intent);
            value["presentation"]["state"] = json!("APPLIED");
            value["presentation"]["amounts"]["applied"] = json!("10.000");
            value["presentation"]["amounts"]["pending"] = json!("0");
            value["presentation"]["cli_exit_code"] = json!(0);
            value["presentation"]["next_action"] = json!("REVIEW_RECEIPT");
            assert!(decode_outcome(
                &intent,
                &binding(&intent),
                &serde_json::to_vec(&value).unwrap()
            )
            .is_ok());
        }
    }
}

#[test]
fn decode_error_never_contains_untrusted_values() {
    let mut value = wire(&intent());
    value["presentation"]["currency"] = json!("TEST_ONLY_SECRET_CANARY");
    let error = decode(&value).unwrap_err();
    assert!(!error.to_string().contains("TEST_ONLY_SECRET_CANARY"));
    assert!(!format!("{error:?}").contains("TEST_ONLY_SECRET_CANARY"));
}
