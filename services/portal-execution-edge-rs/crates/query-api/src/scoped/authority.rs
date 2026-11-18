//! Current read-policy adapter for a trusted server composition, source-dark.
//!
//! No issuer, authentication wire, policy grant or runtime provider is installed.
//! The provider owns real authentication and current policy resolution; an
//! internally constructed grant is neither cryptographic proof nor a TS COMMIT
//! lease. A cached grant or role must never be substituted for that resolution.

use std::fmt;

use thiserror::Error;

use super::{Operation, ReadAuthorizer, ReadScope, MAX_TIME_MS};

/// Same finite current-authority boundary as the separate command gate.
const MAX_GRANT_LIFETIME_MS: i64 = 60_000;

/// Record-free errors; public scoped reads still use one denied-resource shape.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum CurrentReadError {
    #[error("CURRENT_READ_AUTHORITY_UNAVAILABLE")]
    Unavailable,
    #[error("CURRENT_READ_AUTHORITY_REVOKED")]
    Revoked,
    #[error("CURRENT_READ_AUTHORITY_STALE")]
    Stale,
    #[error("CURRENT_READ_AUTHORITY_UNKNOWN")]
    UnknownAuthority,
    #[error("CURRENT_READ_EVIDENCE_INVALID")]
    InvalidEvidence,
    #[error("CURRENT_READ_SCOPE_CHANGED")]
    ScopeMismatch,
    #[error("CURRENT_READ_AUTHORITY_EXPIRED")]
    Expired,
    #[error("CURRENT_READ_OPERATION_DENIED")]
    OperationDenied,
}

/// Opaque internal witness for one freshly resolved exact current scope.
///
/// No serde boundary, public fields or identity-bearing debug output exists.
/// Its constructor validates structure, NOT the caller's authentication. The
/// provider must establish the actual authenticated principal/workload, pinned
/// issuer, current active session and current app/field/model/membership and
/// delegation authority before creating this value. Missing facts must deny.
pub struct CurrentReadGrant {
    scope_digest: String,
    principal_digest: String,
    workload_id: String,
    operations: Vec<Operation>,
    issued_at_ms: i64,
    expires_at_ms: i64,
}

impl fmt::Debug for CurrentReadGrant {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CurrentReadGrant { REDACTED }")
    }
}

impl CurrentReadGrant {
    /// Builds facts only after trusted current-authority resolution.
    ///
    /// `current_scope` must be freshly derived, not copied from the request.
    /// Its principal/effective-scope digest or revisions MUST change on human,
    /// session, workload, membership, delegation, app/field or model changes.
    /// The provider must compare actual identity and current revisions, not
    /// trust these strings, browser fields, a role or a successful mTLS alone.
    /// Rights are the existing four read operations; none implies another.
    ///
    /// # Errors
    /// Rejects malformed scope/identity, duplicate rights and non-finite leases.
    pub fn from_current_authority(
        current_scope: &ReadScope,
        authenticated_principal_digest: &str,
        authenticated_workload_id: &str,
        operations: &[Operation],
        issued_at_ms: i64,
        expires_at_ms: i64,
    ) -> Result<Self, CurrentReadError> {
        let scope_digest = current_scope
            .digest()
            .map_err(|_| CurrentReadError::InvalidEvidence)?;
        if authenticated_principal_digest != current_scope.principal_digest {
            return Err(CurrentReadError::ScopeMismatch);
        }
        if !workload_valid(authenticated_workload_id)
            || operations.is_empty()
            || operations.len() > 4
            || operations
                .iter()
                .enumerate()
                .any(|(index, operation)| operations[..index].contains(operation))
        {
            return Err(CurrentReadError::InvalidEvidence);
        }
        validate_interval(issued_at_ms, expires_at_ms)?;
        Ok(Self {
            scope_digest,
            principal_digest: authenticated_principal_digest.into(),
            workload_id: authenticated_workload_id.into(),
            operations: operations.to_vec(),
            issued_at_ms,
            expires_at_ms,
        })
    }
}

/// Fresh trusted authority port, never implemented by a browser request DTO.
///
/// Every call must resolve actual current identity/session, app and field policy,
/// model revision and effective TS membership/delegation for the exact scope and
/// operation. Unknown issuer, missing facts, revoked/stale/unavailable authority
/// must return an error. No TTL cache of permissions is permitted. Resolution
/// must include current historical visibility for History/Replay/Export; source
/// attribution alone is not a present grant. This is not TS commit authority.
pub trait CurrentReadGrantProvider: Send + Sync {
    /// # Errors
    /// Fails closed when any actual current-authority fact cannot be established.
    fn current(
        &self,
        requested_scope: &ReadScope,
        operation: Operation,
        now_ms: i64,
    ) -> Result<CurrentReadGrant, CurrentReadError>;
}

/// Safe default; no external source or trust is implicitly installed.
#[derive(Clone, Copy, Debug, Default)]
pub struct UnavailableReadGrantProvider;

impl CurrentReadGrantProvider for UnavailableReadGrantProvider {
    fn current(
        &self,
        _requested_scope: &ReadScope,
        _operation: Operation,
        _now_ms: i64,
    ) -> Result<CurrentReadGrant, CurrentReadError> {
        Err(CurrentReadError::Unavailable)
    }
}

/// Re-resolves trusted current facts on every existing read recheck.
///
/// No grant/token/proof cache and no policy inference. The existing scoped read
/// layer remains responsible for rechecking before/after awaits and disclosure.
pub struct CurrentReadAuthorizer<P = UnavailableReadGrantProvider> {
    provider: P,
}

impl<P> CurrentReadAuthorizer<P> {
    #[must_use]
    pub const fn new(provider: P) -> Self {
        Self { provider }
    }
}

impl<P> fmt::Debug for CurrentReadAuthorizer<P> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("CurrentReadAuthorizer { REDACTED }")
    }
}

impl Default for CurrentReadAuthorizer<UnavailableReadGrantProvider> {
    fn default() -> Self {
        Self::new(UnavailableReadGrantProvider)
    }
}

impl<P: CurrentReadGrantProvider> CurrentReadAuthorizer<P> {
    /// # Errors
    /// Returns only bounded record-free authority errors, never source payloads.
    pub fn check(
        &self,
        scope: &ReadScope,
        operation: Operation,
        now_ms: i64,
    ) -> Result<(), CurrentReadError> {
        if !(0..=MAX_TIME_MS).contains(&now_ms) {
            return Err(CurrentReadError::InvalidEvidence);
        }
        let digest = scope
            .digest()
            .map_err(|_| CurrentReadError::InvalidEvidence)?;
        let grant = self.provider.current(scope, operation, now_ms)?;
        validate_interval(grant.issued_at_ms, grant.expires_at_ms)?;
        if grant.issued_at_ms > now_ms || grant.expires_at_ms <= now_ms {
            return Err(CurrentReadError::Expired);
        }
        if grant.scope_digest != digest || grant.principal_digest != scope.principal_digest {
            return Err(CurrentReadError::ScopeMismatch);
        }
        if !workload_valid(&grant.workload_id) {
            return Err(CurrentReadError::InvalidEvidence);
        }
        if !grant.operations.contains(&operation) {
            return Err(CurrentReadError::OperationDenied);
        }
        Ok(())
    }
}

impl<P: CurrentReadGrantProvider> ReadAuthorizer for CurrentReadAuthorizer<P> {
    fn current(&self, scope: &ReadScope, operation: Operation, now_ms: i64) -> bool {
        self.check(scope, operation, now_ms).is_ok()
    }
}

fn workload_valid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn validate_interval(issued_at_ms: i64, expires_at_ms: i64) -> Result<(), CurrentReadError> {
    let lifetime = expires_at_ms
        .checked_sub(issued_at_ms)
        .ok_or(CurrentReadError::InvalidEvidence)?;
    if !(0..=MAX_TIME_MS).contains(&issued_at_ms)
        || !(0..=MAX_TIME_MS).contains(&expires_at_ms)
        || !(1..=MAX_GRANT_LIFETIME_MS).contains(&lifetime)
    {
        return Err(CurrentReadError::InvalidEvidence);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    };

    use super::*;
    use crate::scoped::{AuthorizedRead, Coverage, HistoryCapability, ScopedError};

    const NOW: i64 = 1_792_137_600_000;
    const WORKLOAD: &str = "TEST_ONLY-authenticated-workload";

    fn digest(value: char) -> String {
        format!("sha256:{}", value.to_string().repeat(64))
    }

    fn scope() -> ReadScope {
        ReadScope {
            ingest_binding_digest: digest('1'),
            slot_key: digest('2'),
            principal_digest: digest('3'),
            effective_scope_digest: digest('4'),
            app_policy_revision: "app-v1".into(),
            field_policy_revision: "field-v1".into(),
            schema_version: "TEST_ONLY-orders.v1".into(),
            model_revision: "model-v1".into(),
            source_set_digest: digest('5'),
            dataset: "orders".into(),
            entity_ids: Some(BTreeSet::from(["TEST_ONLY-own-order".into()])),
            allowed_fields: BTreeSet::from(["amount".into()]),
            history_capability: HistoryCapability::RetainedObservations,
            coverage: Coverage::AuthorizedOnly,
            history_from_ms: Some(0),
            history_to_ms: Some(1_000),
        }
    }

    // TEST_ONLY: structural gate exercise, never an authentication provider.
    struct TestProvider {
        current_scope: Mutex<ReadScope>,
        operations: Vec<Operation>,
        error: Mutex<Option<CurrentReadError>>,
        issued_at_ms: i64,
        expires_at_ms: i64,
        calls: AtomicUsize,
    }

    impl TestProvider {
        fn new(scope: ReadScope, operations: Vec<Operation>) -> Self {
            Self {
                current_scope: Mutex::new(scope),
                operations,
                error: Mutex::new(None),
                issued_at_ms: NOW,
                expires_at_ms: NOW + MAX_GRANT_LIFETIME_MS,
                calls: AtomicUsize::new(0),
            }
        }
    }

    impl CurrentReadGrantProvider for TestProvider {
        fn current(
            &self,
            _requested_scope: &ReadScope,
            _operation: Operation,
            _now_ms: i64,
        ) -> Result<CurrentReadGrant, CurrentReadError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if let Some(error) = *self.error.lock().unwrap() {
                return Err(error);
            }
            let current = self.current_scope.lock().unwrap();
            CurrentReadGrant::from_current_authority(
                &current,
                &current.principal_digest,
                WORKLOAD,
                &self.operations,
                self.issued_at_ms,
                self.expires_at_ms,
            )
        }
    }

    #[test]
    fn unavailable_default_denies_every_operation_without_role_fallback() {
        let authorizer = CurrentReadAuthorizer::default();
        for operation in [
            Operation::Current,
            Operation::History,
            Operation::Replay,
            Operation::Export,
        ] {
            assert!(!authorizer.current(&scope(), operation, NOW));
        }
    }

    #[test]
    fn manager_wide_and_researcher_exact_slice_need_explicit_current_grants() {
        for manager in [true, false] {
            let mut scope = scope();
            if manager {
                scope.entity_ids = None;
            }
            let authorizer = CurrentReadAuthorizer::new(TestProvider::new(
                scope.clone(),
                vec![Operation::Current],
            ));
            let read =
                AuthorizedRead::authorize(scope.clone(), Operation::Current, &authorizer, NOW)
                    .unwrap();
            assert_eq!(read.scope(), &scope);
            assert_eq!(read.allows_entity("TEST_ONLY-peer-order"), manager);
            assert!(!authorizer.current(&scope, Operation::Export, NOW));
        }
    }

    #[test]
    fn each_read_operation_is_independent_not_implied_by_read_all() {
        let scope = scope();
        let operations = [
            Operation::Current,
            Operation::History,
            Operation::Replay,
            Operation::Export,
        ];
        for granted in operations {
            let authorizer =
                CurrentReadAuthorizer::new(TestProvider::new(scope.clone(), vec![granted]));
            for requested in operations {
                assert_eq!(
                    authorizer.current(&scope, requested, NOW),
                    requested == granted
                );
            }
        }
    }

    #[test]
    fn every_recheck_resolves_fresh_provider_and_current_revoke_wins() {
        let scope = scope();
        let authorizer =
            CurrentReadAuthorizer::new(TestProvider::new(scope.clone(), vec![Operation::Current]));
        let read = AuthorizedRead::authorize(scope, Operation::Current, &authorizer, NOW).unwrap();
        assert!(read.recheck(&authorizer, NOW).is_ok());
        *authorizer.provider.error.lock().unwrap() = Some(CurrentReadError::Revoked);
        assert_eq!(
            read.recheck(&authorizer, NOW),
            Err(ScopedError::AccessDenied)
        );
        assert_eq!(authorizer.provider.calls.load(Ordering::SeqCst), 3);
    }

    #[test]
    fn current_app_field_model_and_effective_authority_changes_fence_old_scope() {
        for axis in 0..4 {
            let scope = scope();
            let authorizer = CurrentReadAuthorizer::new(TestProvider::new(
                scope.clone(),
                vec![Operation::Current],
            ));
            let read =
                AuthorizedRead::authorize(scope, Operation::Current, &authorizer, NOW).unwrap();
            {
                let mut current = authorizer.provider.current_scope.lock().unwrap();
                match axis {
                    0 => current.app_policy_revision = "app-v2".into(),
                    1 => current.field_policy_revision = "field-v2".into(),
                    2 => current.model_revision = "model-v2".into(),
                    _ => current.effective_scope_digest = digest('6'),
                }
            }
            assert_eq!(
                read.recheck(&authorizer, NOW),
                Err(ScopedError::AccessDenied)
            );
        }
    }

    #[test]
    fn changed_principal_rows_fields_and_source_binding_cannot_reuse_grant() {
        let original = scope();
        let authorizer = CurrentReadAuthorizer::new(TestProvider::new(
            original.clone(),
            vec![Operation::Current],
        ));
        for axis in 0..5 {
            let mut requested = original.clone();
            match axis {
                0 => requested.principal_digest = digest('6'),
                1 => requested.entity_ids = None,
                2 => {
                    requested.allowed_fields.insert("TEST_ONLY-hidden".into());
                }
                3 => requested.source_set_digest = digest('7'),
                _ => requested.ingest_binding_digest = digest('8'),
            }
            assert!(!authorizer.current(&requested, Operation::Current, NOW));
        }
    }

    #[test]
    fn revoked_stale_unknown_issuer_and_unavailable_all_fail_same_public_shape() {
        for error in [
            CurrentReadError::Revoked,
            CurrentReadError::Stale,
            CurrentReadError::UnknownAuthority,
            CurrentReadError::Unavailable,
        ] {
            let scope = scope();
            let authorizer = CurrentReadAuthorizer::new(TestProvider::new(
                scope.clone(),
                vec![Operation::Current],
            ));
            *authorizer.provider.error.lock().unwrap() = Some(error);
            assert!(matches!(
                AuthorizedRead::authorize(scope, Operation::Current, &authorizer, NOW),
                Err(ScopedError::AccessDenied)
            ));
        }
    }

    #[test]
    fn grant_expiry_is_exclusive_and_future_issuance_is_denied() {
        let scope = scope();
        let mut provider = TestProvider::new(scope.clone(), vec![Operation::Current]);
        provider.issued_at_ms = NOW + 1;
        let authorizer = CurrentReadAuthorizer::new(provider);
        assert!(!authorizer.current(&scope, Operation::Current, NOW));
        assert!(authorizer.current(&scope, Operation::Current, NOW + 1));
        assert!(authorizer.current(&scope, Operation::Current, NOW + MAX_GRANT_LIFETIME_MS - 1));
        assert!(!authorizer.current(&scope, Operation::Current, NOW + MAX_GRANT_LIFETIME_MS));
    }

    #[test]
    fn malformed_or_excessive_lease_never_constructs_a_grant() {
        for (issued, expires) in [
            (-1, NOW),
            (NOW, NOW),
            (NOW, NOW + MAX_GRANT_LIFETIME_MS + 1),
            (0, i64::MAX),
            (i64::MIN, i64::MAX),
        ] {
            assert!(CurrentReadGrant::from_current_authority(
                &scope(),
                &digest('3'),
                WORKLOAD,
                &[Operation::Current],
                issued,
                expires,
            )
            .is_err());
        }
    }

    #[test]
    fn grant_requires_actual_principal_workload_and_explicit_distinct_rights() {
        let scope = scope();
        for workload in [
            String::new(),
            " workload".into(),
            "a\nb".into(),
            "x".repeat(513),
        ] {
            assert!(CurrentReadGrant::from_current_authority(
                &scope,
                &scope.principal_digest,
                &workload,
                &[Operation::Current],
                NOW,
                NOW + 1,
            )
            .is_err());
        }
        assert!(CurrentReadGrant::from_current_authority(
            &scope,
            &digest('9'),
            WORKLOAD,
            &[Operation::Current],
            NOW,
            NOW + 1,
        )
        .is_err());
        for operations in [vec![], vec![Operation::Current, Operation::Current]] {
            assert!(CurrentReadGrant::from_current_authority(
                &scope,
                &scope.principal_digest,
                WORKLOAD,
                &operations,
                NOW,
                NOW + 1,
            )
            .is_err());
        }
    }

    #[test]
    fn malformed_clock_and_scope_fail_closed() {
        let mut scope = scope();
        let authorizer =
            CurrentReadAuthorizer::new(TestProvider::new(scope.clone(), vec![Operation::Current]));
        for now in [-1, MAX_TIME_MS + 1, i64::MIN, i64::MAX] {
            assert!(!authorizer.current(&scope, Operation::Current, now));
        }
        scope.allowed_fields.clear();
        assert!(!authorizer.current(&scope, Operation::Current, NOW));
    }

    #[test]
    fn debug_and_errors_never_disclose_identity_or_source_values() {
        let scope = scope();
        let grant = CurrentReadGrant::from_current_authority(
            &scope,
            &scope.principal_digest,
            WORKLOAD,
            &[Operation::Current],
            NOW,
            NOW + 1,
        )
        .unwrap();
        assert_eq!(format!("{grant:?}"), "CurrentReadGrant { REDACTED }");
        let authorizer =
            CurrentReadAuthorizer::new(TestProvider::new(scope, vec![Operation::Current]));
        assert_eq!(
            format!("{authorizer:?}"),
            "CurrentReadAuthorizer { REDACTED }"
        );
        assert_eq!(
            CurrentReadError::UnknownAuthority.to_string(),
            "CURRENT_READ_AUTHORITY_UNKNOWN"
        );
    }
}
