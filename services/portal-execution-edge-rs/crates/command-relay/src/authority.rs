//! Current command authority supplied only by a trusted server composition.
//!
//! This is not a signed wire protocol or an authentication adapter. The provider
//! must resolve actual human/session/workload/delegation authority on every call;
//! constructing its facts does not authenticate a caller. No provider is enabled
//! by default. The TS still owns current authorization and versions at COMMIT.

use std::collections::BTreeMap;

use thiserror::Error;

use crate::durable::{CommandIntent, CommandScope};

const MAX_LEASE_MS: i64 = 60_000;
const MAX_TIME_MS: i64 = 9_007_199_254_740_991;

/// Internal service authority purpose, not a published JWT or wire contract.
pub const RECOVERY_PURPOSE: &str = "execution.command-recovery.v1";

/// A new dispatch check or an authorized historical receipt lookup.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Action {
    Submit,
    Status,
}

/// Command-specific rights, not roles, owner booleans or `execution.read`.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommandPermission {
    Denied,
    StatusOnly,
    SubmitAndStatus,
}

/// Publication of this exact operation/environment/profile for new dispatch.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Publication {
    Unpublished,
    Published,
}

/// Current identity/delegation disposition resolved by the trusted provider.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessState {
    Current,
    Revoked,
}

/// Asserted and current authority revisions, both canonical unsigned strings.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RevisionFence {
    pub asserted: String,
    pub current: String,
}

/// Internal facts released by a trusted provider, deliberately not `Deserialize`.
///
/// `scope` binds the immutable original intent, including its original actor and
/// workload. The separate requester IDs identify the currently authenticated
/// caller; session, membership, policy and access fence that current requester.
/// Submit requires the requester to match the original actor/workload. Status
/// may be granted to another authorized requester, but its provider must resolve
/// current report visibility of this exact historical source binding. Digests
/// bind the original intent including recipient IDs. Disabled publication alone
/// grants no visibility. These facts are not a public request DTO.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CurrentAuthority {
    pub scope: CommandScope,
    pub requester_actor_id: String,
    pub requester_workload_id: String,
    pub operation: String,
    pub key: String,
    pub payload_digest: String,
    pub request_digest: String,
    pub issued_at_ms: i64,
    pub expires_at_ms: i64,
    pub session: RevisionFence,
    pub membership: RevisionFence,
    pub policy: RevisionFence,
    pub access: AccessState,
    pub permission: CommandPermission,
    pub publication: Publication,
    pub current_versions: BTreeMap<String, String>,
}

/// Fail-closed command authority errors with no payload or identity values.
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum AuthorityError {
    #[error("COMMAND_AUTHORITY_UNAVAILABLE")]
    Unavailable,
    #[error("COMMAND_AUTHORITY_EVIDENCE_INVALID")]
    InvalidEvidence,
    #[error("COMMAND_AUTHORITY_SCOPE_MISMATCH")]
    ScopeMismatch,
    #[error("COMMAND_AUTHORITY_INTENT_MISMATCH")]
    IntentMismatch,
    #[error("COMMAND_AUTHORITY_LEASE_EXPIRED")]
    Expired,
    #[error("COMMAND_AUTHORITY_REVOKED")]
    Revoked,
    #[error("COMMAND_SESSION_REVISION_CHANGED")]
    SessionChanged,
    #[error("COMMAND_MEMBERSHIP_REVISION_CHANGED")]
    MembershipChanged,
    #[error("COMMAND_POLICY_REVISION_CHANGED")]
    PolicyChanged,
    #[error("COMMAND_PERMISSION_DENIED")]
    PermissionDenied,
    #[error("COMMAND_OPERATION_UNPUBLISHED")]
    Unpublished,
    #[error("COMMAND_EXPECTED_VERSION_CHANGED")]
    VersionMismatch,
}

/// Trusted composition port, never implemented by a browser/body DTO.
///
/// Implementations must obtain current command-specific human/workload rights,
/// session/delegation revocation and membership/policy revisions for each call.
/// An unavailable source or unverified external assertion must return an error;
/// a cached read grant, mTLS workload alone or role is not command authority.
pub trait AuthorityProvider: Send + Sync {
    /// Resolves one exact operation/scope/intent and the requested authority use.
    ///
    /// # Errors
    /// Returns unavailable/denied when current trusted authority cannot be proved.
    fn current(
        &self,
        intent: &CommandIntent,
        action: Action,
        now_ms: i64,
    ) -> Result<CurrentAuthority, AuthorityError>;
}

/// Safe default: there is no implicit production provider or trust adapter.
#[derive(Clone, Copy, Debug, Default)]
pub struct UnavailableAuthority;

impl AuthorityProvider for UnavailableAuthority {
    fn current(
        &self,
        _intent: &CommandIntent,
        _action: Action,
        _now_ms: i64,
    ) -> Result<CurrentAuthority, AuthorityError> {
        Err(AuthorityError::Unavailable)
    }
}

/// Current trusted service facts for private recovery of an accepted intent.
///
/// `scope` is the original immutable intent binding, not authentication of its
/// historical human actor. `workload_id` is the currently authenticated recovery
/// service. Its provider must authenticate and fence that service independently
/// of expired/revoked human login. No field grants public receipt disclosure.
/// There is deliberately no `Deserialize` or connection to a read assertion.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryFacts {
    pub scope: CommandScope,
    pub workload_id: String,
    pub purpose: String,
    pub request_digest: String,
    pub issued_at_ms: i64,
    pub expires_at_ms: i64,
    pub revision: RevisionFence,
    pub access: AccessState,
}

/// Trusted current service-identity port for private accepted-command recovery.
///
/// Implementations resolve exact historical scope and current service identity,
/// revocation and policy on every call. Native TS status lookup still requires
/// its own current service identity. Human report permission is a separate check.
pub trait RecoveryProvider: Send + Sync {
    /// Resolves one private recovery grant, never a browser/public status grant.
    ///
    /// # Errors
    /// Denies when service identity, current authority or historical binding is
    /// unverified, unavailable or revoked; never substitutes human/read grants.
    fn current(&self, intent: &CommandIntent, now_ms: i64)
        -> Result<RecoveryFacts, AuthorityError>;
}

/// No service recovery authority is installed implicitly.
#[derive(Clone, Copy, Debug, Default)]
pub struct UnavailableRecovery;

impl RecoveryProvider for UnavailableRecovery {
    fn current(
        &self,
        _intent: &CommandIntent,
        _now_ms: i64,
    ) -> Result<RecoveryFacts, AuthorityError> {
        Err(AuthorityError::Unavailable)
    }
}

/// Opaque current service recovery check; grants neither send nor disclosure.
///
/// Only `authorize_recovery` constructs this proof. It is not a public receipt
/// and cannot be passed to human status or command submission authorization.
#[derive(Debug, Eq, PartialEq)]
pub struct VerifiedRecovery {
    scope: CommandScope,
    workload_id: String,
    request_digest: String,
    expires_at_ms: i64,
}

impl VerifiedRecovery {
    #[must_use]
    pub fn scope(&self) -> &CommandScope {
        &self.scope
    }

    #[must_use]
    pub fn workload_id(&self) -> &str {
        &self.workload_id
    }

    #[must_use]
    pub fn request_digest(&self) -> &str {
        &self.request_digest
    }

    #[must_use]
    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }
}

/// Checks current private service authority, independent of human login expiry.
///
/// The caller must separately restrict recovery to accepted/ambiguous durable
/// intents. This gate does not dispatch, grant human visibility or return any
/// receipt payload. Public status/disclosure must still use `authorize`.
///
/// # Errors
/// Denies missing, expired, revoked, wrong-purpose or misbound service authority.
pub fn authorize_recovery(
    provider: &(impl RecoveryProvider + ?Sized),
    intent: &CommandIntent,
    now_ms: i64,
) -> Result<VerifiedRecovery, AuthorityError> {
    let facts = provider.current(intent, now_ms)?;
    validate_times(facts.issued_at_ms, facts.expires_at_ms, now_ms)?;
    if facts.access != AccessState::Current {
        return Err(AuthorityError::Revoked);
    }
    if facts.purpose != RECOVERY_PURPOSE
        || facts.workload_id.is_empty()
        || facts.workload_id.len() > 512
        || facts.workload_id.trim() != facts.workload_id
        || facts.workload_id.chars().any(char::is_control)
    {
        return Err(AuthorityError::InvalidEvidence);
    }
    if facts.scope != *intent.scope() {
        return Err(AuthorityError::ScopeMismatch);
    }
    if facts.request_digest != intent.request_digest() {
        return Err(AuthorityError::IntentMismatch);
    }
    check_revision(&facts.revision, AuthorityError::PolicyChanged)?;
    Ok(VerifiedRecovery {
        scope: facts.scope,
        workload_id: facts.workload_id,
        request_digest: facts.request_digest,
        expires_at_ms: facts.expires_at_ms,
    })
}

/// Opaque result of a current check, not a reusable TS COMMIT authorization.
///
/// Only `authorize` constructs this value. Call the provider again immediately
/// before a new dispatch and for every status/reconcile request. Store no proof
/// as a durable substitute for current authority. No serde/`Deserialize` boundary.
#[derive(Debug, Eq, PartialEq)]
pub struct VerifiedAuthority {
    scope: CommandScope,
    requester_actor_id: String,
    requester_workload_id: String,
    action: Action,
    request_digest: String,
    expires_at_ms: i64,
}

impl VerifiedAuthority {
    /// Original immutable intent scope, not the current requester's identity.
    #[must_use]
    pub fn scope(&self) -> &CommandScope {
        &self.scope
    }

    #[must_use]
    pub fn requester_actor_id(&self) -> &str {
        &self.requester_actor_id
    }

    #[must_use]
    pub fn requester_workload_id(&self) -> &str {
        &self.requester_workload_id
    }

    #[must_use]
    pub fn action(&self) -> Action {
        self.action
    }

    #[must_use]
    pub fn request_digest(&self) -> &str {
        &self.request_digest
    }

    #[must_use]
    pub fn expires_at_ms(&self) -> i64 {
        self.expires_at_ms
    }
}

/// Checks fresh current authority for an immutable, structurally valid intent.
///
/// Status deliberately permits changed business versions and disabled new sends:
/// the original command may already have committed. It still requires current
/// scoped report permission for the current requester, that requester's current
/// identity/session/membership/policy and an exact historical intent binding.
/// Submit additionally requires the requester to match the original actor and
/// workload, explicit publication and current expected versions. No read grant
/// is upgraded into either right.
///
/// # Errors
/// Returns typed denial for unavailable, stale, revoked, mismatched or missing
/// current authority. Does not contact TS, send a command or mutate a ledger.
pub fn authorize(
    provider: &(impl AuthorityProvider + ?Sized),
    intent: &CommandIntent,
    action: Action,
    now_ms: i64,
) -> Result<VerifiedAuthority, AuthorityError> {
    let current = provider.current(intent, action, now_ms)?;
    validate_lease(&current, now_ms)?;
    if current.access != AccessState::Current {
        return Err(AuthorityError::Revoked);
    }
    if current.scope != *intent.scope() {
        return Err(AuthorityError::ScopeMismatch);
    }
    if !identity_valid(&current.requester_actor_id)
        || !identity_valid(&current.requester_workload_id)
    {
        return Err(AuthorityError::InvalidEvidence);
    }
    if action == Action::Submit
        && (current.requester_actor_id != intent.scope().actor_id()
            || current.requester_workload_id != intent.scope().workload_id())
    {
        return Err(AuthorityError::ScopeMismatch);
    }
    if current.operation != intent.operation()
        || current.key != intent.key()
        || current.payload_digest != intent.digest()
        || current.request_digest != intent.request_digest()
    {
        return Err(AuthorityError::IntentMismatch);
    }
    check_revision(&current.session, AuthorityError::SessionChanged)?;
    check_revision(&current.membership, AuthorityError::MembershipChanged)?;
    check_revision(&current.policy, AuthorityError::PolicyChanged)?;
    if current.permission == CommandPermission::Denied
        || (action == Action::Submit && current.permission != CommandPermission::SubmitAndStatus)
    {
        return Err(AuthorityError::PermissionDenied);
    }
    if action == Action::Submit {
        if current.publication != Publication::Published {
            return Err(AuthorityError::Unpublished);
        }
        check_versions(intent, &current.current_versions)?;
    }
    Ok(VerifiedAuthority {
        scope: current.scope,
        requester_actor_id: current.requester_actor_id,
        requester_workload_id: current.requester_workload_id,
        action,
        request_digest: current.request_digest,
        expires_at_ms: current.expires_at_ms,
    })
}

fn identity_valid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn validate_lease(current: &CurrentAuthority, now_ms: i64) -> Result<(), AuthorityError> {
    validate_times(current.issued_at_ms, current.expires_at_ms, now_ms)
}

fn validate_times(
    issued_at_ms: i64,
    expires_at_ms: i64,
    now_ms: i64,
) -> Result<(), AuthorityError> {
    if !(0..=MAX_TIME_MS).contains(&now_ms)
        || !(0..=MAX_TIME_MS).contains(&issued_at_ms)
        || !(0..=MAX_TIME_MS).contains(&expires_at_ms)
        || expires_at_ms <= issued_at_ms
        || expires_at_ms - issued_at_ms > MAX_LEASE_MS
    {
        return Err(AuthorityError::InvalidEvidence);
    }
    if issued_at_ms > now_ms || expires_at_ms <= now_ms {
        return Err(AuthorityError::Expired);
    }
    Ok(())
}

fn revision_valid(value: &str) -> bool {
    value.len() <= 19
        && value
            .parse::<i64>()
            .is_ok_and(|revision| revision >= 0 && revision.to_string() == value)
}

fn check_revision(fence: &RevisionFence, error: AuthorityError) -> Result<(), AuthorityError> {
    if !revision_valid(&fence.asserted) || !revision_valid(&fence.current) {
        return Err(AuthorityError::InvalidEvidence);
    }
    if fence.asserted != fence.current {
        return Err(error);
    }
    Ok(())
}

fn check_versions(
    intent: &CommandIntent,
    current: &BTreeMap<String, String>,
) -> Result<(), AuthorityError> {
    let expected = intent.payload()["expected_versions"]
        .as_object()
        .ok_or(AuthorityError::InvalidEvidence)?;
    if current.len() != expected.len()
        || current.iter().any(|(key, version)| {
            !revision_valid(version)
                || expected.get(key).and_then(serde_json::Value::as_str) != Some(version.as_str())
        })
    {
        return Err(AuthorityError::VersionMismatch);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use projection_core::canonical_digest;
    use serde_json::json;

    const NOW: i64 = 1_792_137_600_000;

    // TEST_ONLY provider: structural authority tests, never authentication proof.
    struct TestAuthority(CurrentAuthority);
    impl AuthorityProvider for TestAuthority {
        fn current(
            &self,
            _intent: &CommandIntent,
            _action: Action,
            _now_ms: i64,
        ) -> Result<CurrentAuthority, AuthorityError> {
            Ok(self.0.clone())
        }
    }

    fn intent() -> CommandIntent {
        let scope = CommandScope::new(
            "TEST_ONLY-workspace",
            "paper",
            "TEST_ONLY-profile",
            "TEST_ONLY-authority",
            "TEST_ONLY-human",
            "TEST_ONLY-workload",
        )
        .unwrap();
        let payload = json!({
            "schema_version":"pma.capital-command.v1.1", "operation":"TOP_UP",
            "idempotency_key":"TEST_ONLY-key", "recipient_kind":"PORTFOLIO",
            "currency":"USD", "amount":"10.00", "reason":"TEST_ONLY-not-sent",
            "expected_versions":{"budget":"0","source":"0","parent":"0"},
        });
        let digest = canonical_digest(&payload).unwrap();
        CommandIntent::new(scope, "TEST_ONLY-key", "TOP_UP", payload, &digest).unwrap()
    }

    fn facts(intent: &CommandIntent) -> CurrentAuthority {
        let fence = RevisionFence {
            asserted: "7".into(),
            current: "7".into(),
        };
        CurrentAuthority {
            scope: intent.scope().clone(),
            requester_actor_id: intent.scope().actor_id().into(),
            requester_workload_id: intent.scope().workload_id().into(),
            operation: intent.operation().into(),
            key: intent.key().into(),
            payload_digest: intent.digest().into(),
            request_digest: intent.request_digest().into(),
            issued_at_ms: NOW,
            expires_at_ms: NOW + MAX_LEASE_MS,
            session: fence.clone(),
            membership: fence.clone(),
            policy: fence,
            access: AccessState::Current,
            permission: CommandPermission::SubmitAndStatus,
            publication: Publication::Published,
            current_versions: BTreeMap::from([
                ("budget".into(), "0".into()),
                ("source".into(), "0".into()),
                ("parent".into(), "0".into()),
            ]),
        }
    }

    #[test]
    fn default_has_no_current_authority() {
        assert_eq!(
            authorize(&UnavailableAuthority, &intent(), Action::Submit, NOW),
            Err(AuthorityError::Unavailable)
        );
        assert_eq!(
            authorize(&UnavailableAuthority, &intent(), Action::Status, NOW),
            Err(AuthorityError::Unavailable)
        );
    }

    #[test]
    fn exact_submit_releases_only_bound_opaque_proof() {
        let intent = intent();
        let proof =
            authorize(&TestAuthority(facts(&intent)), &intent, Action::Submit, NOW).unwrap();
        assert_eq!(proof.scope(), intent.scope());
        assert_eq!(proof.requester_actor_id(), intent.scope().actor_id());
        assert_eq!(proof.requester_workload_id(), intent.scope().workload_id());
        assert_eq!(proof.request_digest(), intent.request_digest());
        assert_eq!(proof.action(), Action::Submit);
        assert_eq!(proof.expires_at_ms(), NOW + MAX_LEASE_MS);
    }

    #[test]
    fn status_survives_disabled_sends_and_advanced_business_versions() {
        let intent = intent();
        let mut current = facts(&intent);
        current.permission = CommandPermission::StatusOnly;
        current.publication = Publication::Unpublished;
        current.current_versions.clear();
        assert!(authorize(&TestAuthority(current), &intent, Action::Status, NOW).is_ok());
    }

    #[test]
    fn another_authorized_requester_can_report_but_cannot_submit_original_intent() {
        let intent = intent();
        let mut current = facts(&intent);
        current.requester_actor_id = "TEST_ONLY-other-manager".into();
        current.requester_workload_id = "TEST_ONLY-report-workload".into();
        let provider = TestAuthority(current);
        let proof = authorize(&provider, &intent, Action::Status, NOW).unwrap();
        assert_eq!(proof.scope(), intent.scope());
        assert_eq!(proof.requester_actor_id(), "TEST_ONLY-other-manager");
        assert_eq!(proof.requester_workload_id(), "TEST_ONLY-report-workload");
        assert_eq!(
            authorize(&provider, &intent, Action::Submit, NOW),
            Err(AuthorityError::ScopeMismatch)
        );
    }

    #[test]
    fn alternate_report_requester_needs_current_permission_and_revision_fences() {
        let intent = intent();
        for axis in 0..5 {
            let mut current = facts(&intent);
            current.requester_actor_id = "TEST_ONLY-other-manager".into();
            let error = match axis {
                0 => {
                    current.access = AccessState::Revoked;
                    AuthorityError::Revoked
                }
                1 => {
                    current.permission = CommandPermission::Denied;
                    AuthorityError::PermissionDenied
                }
                2 => {
                    current.session.current = "8".into();
                    AuthorityError::SessionChanged
                }
                3 => {
                    current.membership.current = "8".into();
                    AuthorityError::MembershipChanged
                }
                _ => {
                    current.policy.current = "8".into();
                    AuthorityError::PolicyChanged
                }
            };
            assert_eq!(
                authorize(&TestAuthority(current), &intent, Action::Status, NOW),
                Err(error)
            );
        }
    }

    #[test]
    fn missing_or_malformed_current_requester_ids_never_grant_report_rights() {
        let intent = intent();
        for invalid in [
            String::new(),
            " ".into(),
            " caller".into(),
            "a\nb".into(),
            "x".repeat(513),
        ] {
            for axis in 0..2 {
                let mut current = facts(&intent);
                if axis == 0 {
                    current.requester_actor_id.clone_from(&invalid);
                } else {
                    current.requester_workload_id.clone_from(&invalid);
                }
                for action in [Action::Submit, Action::Status] {
                    assert_eq!(
                        authorize(&TestAuthority(current.clone()), &intent, action, NOW),
                        Err(AuthorityError::InvalidEvidence)
                    );
                }
            }
        }
    }

    #[test]
    fn status_only_is_not_new_submission_permission() {
        let intent = intent();
        let mut current = facts(&intent);
        current.permission = CommandPermission::StatusOnly;
        assert_eq!(
            authorize(&TestAuthority(current), &intent, Action::Submit, NOW),
            Err(AuthorityError::PermissionDenied)
        );
    }

    #[test]
    fn read_or_role_without_command_permission_denies_both_actions() {
        let intent = intent();
        let mut current = facts(&intent);
        current.permission = CommandPermission::Denied;
        let provider = TestAuthority(current);
        for action in [Action::Submit, Action::Status] {
            assert_eq!(
                authorize(&provider, &intent, action, NOW),
                Err(AuthorityError::PermissionDenied)
            );
        }
    }

    #[test]
    fn unpublished_operation_cannot_dispatch() {
        let intent = intent();
        let mut current = facts(&intent);
        current.publication = Publication::Unpublished;
        assert_eq!(
            authorize(&TestAuthority(current), &intent, Action::Submit, NOW),
            Err(AuthorityError::Unpublished)
        );
    }

    #[test]
    fn every_scope_axis_and_actual_actor_is_bound() {
        let intent = intent();
        for axis in 0..6 {
            let mut values = [
                "TEST_ONLY-workspace",
                "paper",
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            ];
            values[axis] = if axis == 1 {
                "sandbox"
            } else {
                "TEST_ONLY-other"
            };
            let mut current = facts(&intent);
            current.scope = CommandScope::new(
                values[0], values[1], values[2], values[3], values[4], values[5],
            )
            .unwrap();
            for action in [Action::Submit, Action::Status] {
                assert_eq!(
                    authorize(&TestAuthority(current.clone()), &intent, action, NOW),
                    Err(AuthorityError::ScopeMismatch)
                );
            }
        }
    }

    #[test]
    fn key_operation_payload_and_request_digest_are_bound() {
        let intent = intent();
        for axis in 0..4 {
            let mut current = facts(&intent);
            match axis {
                0 => current.operation = "RECALL_FULL".into(),
                1 => current.key = "TEST_ONLY-other-key".into(),
                2 => current.payload_digest = "0".repeat(64),
                _ => current.request_digest = "0".repeat(64),
            }
            assert_eq!(
                authorize(&TestAuthority(current), &intent, Action::Status, NOW),
                Err(AuthorityError::IntentMismatch)
            );
        }
    }

    #[test]
    fn malformed_long_or_future_lease_never_grants_authority() {
        let intent = intent();
        for (issued, expires, error) in [
            (-1, NOW + 1, AuthorityError::InvalidEvidence),
            (NOW, NOW, AuthorityError::InvalidEvidence),
            (NOW, NOW + MAX_LEASE_MS + 1, AuthorityError::InvalidEvidence),
            (NOW, MAX_TIME_MS + 1, AuthorityError::InvalidEvidence),
            (NOW + 1, NOW + 2, AuthorityError::Expired),
        ] {
            let mut current = facts(&intent);
            current.issued_at_ms = issued;
            current.expires_at_ms = expires;
            assert_eq!(
                authorize(&TestAuthority(current), &intent, Action::Submit, NOW),
                Err(error)
            );
        }
    }

    #[test]
    fn expiry_is_exclusive_even_for_status_recovery() {
        let intent = intent();
        let provider = TestAuthority(facts(&intent));
        assert!(authorize(&provider, &intent, Action::Submit, NOW + MAX_LEASE_MS - 1).is_ok());
        assert_eq!(
            authorize(&provider, &intent, Action::Status, NOW + MAX_LEASE_MS),
            Err(AuthorityError::Expired)
        );
    }

    #[test]
    fn current_revocation_denies_submit_and_historical_status() {
        let intent = intent();
        let mut current = facts(&intent);
        current.access = AccessState::Revoked;
        let provider = TestAuthority(current);
        for action in [Action::Submit, Action::Status] {
            assert_eq!(
                authorize(&provider, &intent, action, NOW),
                Err(AuthorityError::Revoked)
            );
        }
    }

    #[test]
    fn each_current_revision_fence_is_required() {
        let intent = intent();
        for (axis, error) in [
            (0, AuthorityError::SessionChanged),
            (1, AuthorityError::MembershipChanged),
            (2, AuthorityError::PolicyChanged),
        ] {
            let mut current = facts(&intent);
            match axis {
                0 => current.session.current = "8".into(),
                1 => current.membership.current = "8".into(),
                _ => current.policy.current = "8".into(),
            }
            assert_eq!(
                authorize(&TestAuthority(current), &intent, Action::Status, NOW),
                Err(error)
            );
        }
    }

    #[test]
    fn authority_revisions_require_canonical_nonnegative_i64() {
        let intent = intent();
        for revision in ["", "-1", "+1", "01", " 1", "1.0", "9223372036854775808"] {
            let mut current = facts(&intent);
            current.session = RevisionFence {
                asserted: revision.into(),
                current: revision.into(),
            };
            assert_eq!(
                authorize(&TestAuthority(current), &intent, Action::Status, NOW),
                Err(AuthorityError::InvalidEvidence)
            );
        }
    }

    #[test]
    fn exact_version_set_and_values_are_required_only_for_new_dispatch() {
        let intent = intent();
        for axis in 0..4 {
            let mut current = facts(&intent);
            match axis {
                0 => {
                    current.current_versions.insert("budget".into(), "1".into());
                }
                1 => {
                    current.current_versions.remove("budget");
                }
                2 => {
                    current.current_versions.insert("extra".into(), "0".into());
                }
                _ => {
                    current
                        .current_versions
                        .insert("budget".into(), "00".into());
                }
            }
            assert_eq!(
                authorize(
                    &TestAuthority(current.clone()),
                    &intent,
                    Action::Submit,
                    NOW
                ),
                Err(AuthorityError::VersionMismatch)
            );
            assert!(authorize(&TestAuthority(current), &intent, Action::Status, NOW).is_ok());
        }
    }

    #[test]
    fn provider_is_resolved_again_for_every_action_and_current_revoke_wins() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct RevokingAuthority(CurrentAuthority, AtomicUsize);
        impl AuthorityProvider for RevokingAuthority {
            fn current(
                &self,
                _intent: &CommandIntent,
                _action: Action,
                _now_ms: i64,
            ) -> Result<CurrentAuthority, AuthorityError> {
                let mut current = self.0.clone();
                if self.1.fetch_add(1, Ordering::SeqCst) != 0 {
                    current.access = AccessState::Revoked;
                }
                Ok(current)
            }
        }

        let intent = intent();
        let provider = RevokingAuthority(facts(&intent), AtomicUsize::new(0));
        assert!(authorize(&provider, &intent, Action::Status, NOW).is_ok());
        assert_eq!(
            authorize(&provider, &intent, Action::Submit, NOW),
            Err(AuthorityError::Revoked)
        );
        assert_eq!(provider.1.load(Ordering::SeqCst), 2);
    }

    struct TestRecovery(RecoveryFacts);
    impl RecoveryProvider for TestRecovery {
        fn current(
            &self,
            _intent: &CommandIntent,
            _now_ms: i64,
        ) -> Result<RecoveryFacts, AuthorityError> {
            Ok(self.0.clone())
        }
    }

    fn recovery_facts(intent: &CommandIntent) -> RecoveryFacts {
        RecoveryFacts {
            scope: intent.scope().clone(),
            workload_id: "TEST_ONLY-recovery-service".into(),
            purpose: RECOVERY_PURPOSE.into(),
            request_digest: intent.request_digest().into(),
            issued_at_ms: NOW,
            expires_at_ms: NOW + MAX_LEASE_MS,
            revision: RevisionFence {
                asserted: "2".into(),
                current: "2".into(),
            },
            access: AccessState::Current,
        }
    }

    #[test]
    fn recovery_default_denies_and_exact_service_gets_only_recovery_proof() {
        let intent = intent();
        assert_eq!(
            authorize_recovery(&UnavailableRecovery, &intent, NOW),
            Err(AuthorityError::Unavailable)
        );
        let proof =
            authorize_recovery(&TestRecovery(recovery_facts(&intent)), &intent, NOW).unwrap();
        assert_eq!(proof.scope(), intent.scope());
        assert_eq!(proof.workload_id(), "TEST_ONLY-recovery-service");
        assert_eq!(proof.request_digest(), intent.request_digest());
        assert_eq!(proof.expires_at_ms(), NOW + MAX_LEASE_MS);
    }

    #[test]
    fn recovery_requires_exact_scope_digest_purpose_and_current_service() {
        let intent = intent();
        for axis in 0..4 {
            let mut facts = recovery_facts(&intent);
            let error = match axis {
                0 => {
                    facts.scope = CommandScope::new(
                        "TEST_ONLY-other",
                        "paper",
                        "TEST_ONLY-profile",
                        "TEST_ONLY-authority",
                        "TEST_ONLY-human",
                        "TEST_ONLY-workload",
                    )
                    .unwrap();
                    AuthorityError::ScopeMismatch
                }
                1 => {
                    facts.request_digest = "0".repeat(64);
                    AuthorityError::IntentMismatch
                }
                2 => {
                    facts.purpose = "execution.read".into();
                    AuthorityError::InvalidEvidence
                }
                _ => {
                    facts.workload_id.clear();
                    AuthorityError::InvalidEvidence
                }
            };
            assert_eq!(
                authorize_recovery(&TestRecovery(facts), &intent, NOW),
                Err(error)
            );
        }
    }

    #[test]
    fn recovery_lease_is_current_finite_and_at_most_sixty_seconds() {
        let intent = intent();
        for (issued, expires, error) in [
            (NOW - 1, NOW, AuthorityError::Expired),
            (NOW + 1, NOW + 2, AuthorityError::Expired),
            (NOW, NOW + MAX_LEASE_MS + 1, AuthorityError::InvalidEvidence),
            (-1, NOW + 1, AuthorityError::InvalidEvidence),
        ] {
            let mut facts = recovery_facts(&intent);
            facts.issued_at_ms = issued;
            facts.expires_at_ms = expires;
            assert_eq!(
                authorize_recovery(&TestRecovery(facts), &intent, NOW),
                Err(error)
            );
        }
    }

    #[test]
    fn recovery_uses_service_revoke_fence_not_expired_human_login() {
        let intent = intent();
        let mut human = facts(&intent);
        human.access = AccessState::Revoked;
        assert_eq!(
            authorize(&TestAuthority(human), &intent, Action::Status, NOW),
            Err(AuthorityError::Revoked)
        );
        assert!(authorize_recovery(&TestRecovery(recovery_facts(&intent)), &intent, NOW).is_ok());
        let mut facts = recovery_facts(&intent);
        facts.access = AccessState::Revoked;
        assert_eq!(
            authorize_recovery(&TestRecovery(facts), &intent, NOW),
            Err(AuthorityError::Revoked)
        );
        let mut facts = recovery_facts(&intent);
        facts.revision.current = "3".into();
        assert_eq!(
            authorize_recovery(&TestRecovery(facts), &intent, NOW),
            Err(AuthorityError::PolicyChanged)
        );
    }
}
