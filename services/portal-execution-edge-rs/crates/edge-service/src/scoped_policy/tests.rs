//! `TEST_ONLY` structural adapter cases, not actual Core authentication evidence.

use std::collections::BTreeSet;

use query_api::scoped::{Coverage, HistoryCapability};

use super::*;

fn digest(value: char) -> String {
    format!("sha256:{}", value.to_string().repeat(64))
}

fn scope() -> ReadScope {
    ReadScope {
        ingest_binding_digest: digest('1'),
        slot_key: digest('2'),
        principal_digest: digest('3'),
        effective_scope_digest: digest('4'),
        app_policy_revision: "TEST_ONLY-app-r1".into(),
        field_policy_revision: "TEST_ONLY-fields-r1".into(),
        schema_version: "TEST_ONLY-orders.v1".into(),
        model_revision: "TEST_ONLY-model-r1".into(),
        source_set_digest: digest('5'),
        dataset: "TEST_ONLY-orders".into(),
        entity_ids: Some(BTreeSet::from(["TEST_ONLY-own-order".into()])),
        allowed_fields: BTreeSet::from(["amount".into()]),
        history_capability: HistoryCapability::RetainedObservations,
        coverage: Coverage::AuthorizedOnly,
        history_from_ms: Some(0),
        history_to_ms: Some(1_000),
    }
}

fn resolve(scope: ReadScope, operation: Operation) -> Result<ResolvedPolicy, ScopedError> {
    ResolvedPolicy::from_current_authority(
        scope,
        operation,
        Arc::new("TEST_ONLY-session".to_owned()),
    )
}

#[test]
fn malformed_or_secret_field_scope_cannot_construct_snapshot() {
    let mut invalid = scope();
    invalid.principal_digest = "not-a-digest".into();
    assert!(resolve(invalid, Operation::Current).is_err());
    let mut invalid = scope();
    invalid.allowed_fields.insert("password".into());
    assert!(resolve(invalid, Operation::Current).is_err());
    let mut invalid = scope();
    invalid.history_to_ms = None;
    assert!(resolve(invalid, Operation::History).is_err());
}

#[test]
fn each_snapshot_has_one_exact_operation_without_implied_rights() {
    let exact = scope();
    let operations = [
        Operation::Current,
        Operation::History,
        Operation::Replay,
        Operation::Export,
    ];
    for selected in operations {
        let resolved = resolve(exact.clone(), selected).unwrap();
        for requested in operations {
            assert_eq!(
                resolved.current(&exact, requested, 100),
                selected == requested
            );
        }
        let authorized = resolved.authorize(100).unwrap();
        assert_eq!(authorized.operation(), selected);
        assert_eq!(authorized.scope(), &exact);
        assert_eq!(resolved.operation(), selected);
        assert_eq!(resolved.scope(), &exact);
    }
}

#[test]
fn changed_policy_principal_source_fields_or_entities_is_not_the_original_scope() {
    let exact = scope();
    let resolved = resolve(exact.clone(), Operation::Current).unwrap();
    let mut variants = Vec::new();
    let mut changed = exact.clone();
    changed.principal_digest = digest('6');
    variants.push(changed);
    let mut changed = exact.clone();
    changed.field_policy_revision = "TEST_ONLY-fields-r2".into();
    variants.push(changed);
    let mut changed = exact.clone();
    changed.app_policy_revision = "TEST_ONLY-app-r2".into();
    variants.push(changed);
    let mut changed = exact.clone();
    changed.source_set_digest = digest('7');
    variants.push(changed);
    let mut changed = exact.clone();
    changed.allowed_fields.insert("other".into());
    variants.push(changed);
    let mut changed = exact;
    changed.entity_ids = None;
    variants.push(changed);
    for foreign in variants {
        assert!(!resolved.current(&foreign, Operation::Current, 100));
    }
}

#[test]
fn snapshot_adapter_rejects_invalid_time_and_malformed_requested_scope() {
    let exact = scope();
    let resolved = resolve(exact.clone(), Operation::Current).unwrap();
    assert!(!resolved.current(&exact, Operation::Current, -1));
    assert!(!resolved.current(&exact, Operation::Current, MAX_TIME_MS + 1));
    assert!(resolved.authorize(-1).is_err());
    let mut malformed = exact;
    malformed.allowed_fields.clear();
    assert!(!resolved.current(&malformed, Operation::Current, 100));
}

#[test]
fn snapshot_debug_does_not_disclose_identity_or_scope() {
    let resolved = resolve(scope(), Operation::History).unwrap();
    assert_eq!(format!("{resolved:?}"), "ResolvedPolicy { REDACTED }");
}

#[tokio::test]
async fn default_unavailable_port_does_not_accept_credentials_or_structural_snapshot() {
    let provider = UnavailableCurrentPolicy;
    for operation in [
        Operation::Current,
        Operation::History,
        Operation::Replay,
        Operation::Export,
    ] {
        assert!(matches!(
            provider
                .resolve("TEST_ONLY-opaque", "TEST_ONLY-orders", operation, 100)
                .await,
            Err(ScopedError::AccessDenied)
        ));
        let resolved = resolve(scope(), operation).unwrap();
        assert_eq!(
            provider.recheck(&resolved, 100).await,
            Err(ScopedError::AccessDenied)
        );
    }
}

#[test]
fn original_private_context_is_retained_without_scope_or_session_substitution() {
    let first = resolve(scope(), Operation::Current).unwrap();
    let second = ResolvedPolicy::from_current_authority(
        scope(),
        Operation::Current,
        Arc::new("TEST_ONLY-other-session".to_owned()),
    )
    .unwrap();
    assert_eq!(first.scope(), second.scope());
    assert_eq!(
        first.custody::<String>().map(String::as_str),
        Some("TEST_ONLY-session")
    );
    assert_eq!(
        second.custody::<String>().map(String::as_str),
        Some("TEST_ONLY-other-session")
    );
    assert!(first.custody::<u64>().is_none());
    assert!(!format!("{first:?}").contains("TEST_ONLY-session"));
}
