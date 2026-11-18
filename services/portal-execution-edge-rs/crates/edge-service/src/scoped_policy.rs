//! Async current-policy boundary for the executable scoped-read composition.
//!
//! Core owns actual human/session, app/field/model and native membership
//! authority. Its opaque in-process scopes and native ENTER/RESOLVE receipts
//! are not transferable generic read grants. This module invents no HTTP wire,
//! issuer, permission cache or accepting provider from delegated JWT claims.
//!
//! A resolved value is a per-operation structural snapshot, NOT a currentness
//! lease. The router must call the actual async provider before and after each
//! awaited read/cache/replay operation and immediately before each disclosure.
//! Its synchronous adapter exists only for the existing bounded store APIs;
//! retaining that adapter never substitutes for those fresh outer checks.

use std::{any::Any, fmt, future::Future, pin::Pin, sync::Arc};

use query_api::scoped::{AuthorizedRead, Operation, ReadAuthorizer, ReadScope, ScopedError};

const MAX_TIME_MS: i64 = 9_007_199_254_740_991;

/// Bounded async authority result. Implementations retain their own actual
/// request/attempt custody; an error or cancellation must not invent release.
pub type PolicyFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, ScopedError>> + Send + 'a>>;

/// Actual trusted current-authority port, never a browser-supplied scope DTO.
///
/// Each call must resolve current authenticated human/session/workload, app and
/// field policy, model and effective TS membership/delegation for this exact
/// resource and operation. Missing or ambiguous facts fail closed. Short-lived
/// signed claims, mTLS, a prior receipt or a TTL-cached ALLOW are insufficient.
/// History, Export and Replay need their own current visibility; Current never
/// implies them. Implementations must bound authentication input and authority
/// work, and keep credential values out of logs, serialized snapshots and public
/// errors. Private original request/session custody must survive every recheck.
pub trait CurrentPolicy: Send + Sync {
    /// Resolves a server-derived scope for one exact authenticated operation.
    /// `resource` is a logical, catalogue-bound selection, not SQL or a URL.
    ///
    /// # Errors
    /// Fails closed when authentication or current exact authority is unknown.
    fn resolve<'a>(
        &'a self,
        credential: &'a str,
        resource: &'a str,
        operation: Operation,
        now_ms: i64,
    ) -> PolicyFuture<'a, ResolvedPolicy>;

    /// Resolves actual current authority afresh and compares the entire original
    /// scope and operation. A changed generation, field policy, principal or
    /// source selection must deny/resync, never silently widen the old request.
    /// The provider must also recheck the SAME original request/session custody;
    /// equal scope digests across two sessions never merge their revocation.
    /// This is not a check of the snapshot's age or original authentication only.
    ///
    /// # Errors
    /// Rejects revoked, changed, expired, unavailable or unresolved authority.
    fn recheck<'a>(&'a self, resolved: &'a ResolvedPolicy, now_ms: i64) -> PolicyFuture<'a, ()>;
}

/// Private-field, non-deserializable per-operation scope from the trusted port.
/// Construction validates structure only; it authenticates no human or source.
pub struct ResolvedPolicy {
    scope: ReadScope,
    scope_digest: String,
    operation: Operation,
    custody: Arc<dyn Any + Send + Sync>,
}

impl fmt::Debug for ResolvedPolicy {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("ResolvedPolicy { REDACTED }")
    }
}

impl ResolvedPolicy {
    /// Captures exact scope only AFTER actual trusted authority resolution.
    /// The scope must be derived by that authority, never copied from request
    /// JSON, delegated claims, configuration or a native attempt ACK.
    /// `custody` retains the actual provider's original private request/session
    /// context. It is neither serialized nor reused as another caller's context.
    ///
    /// # Errors
    /// Rejects malformed/unbounded scopes; successful construction is not auth.
    pub fn from_current_authority(
        scope: ReadScope,
        operation: Operation,
        custody: Arc<dyn Any + Send + Sync>,
    ) -> Result<Self, ScopedError> {
        let scope_digest = scope.digest()?;
        Ok(Self {
            scope,
            scope_digest,
            operation,
            custody,
        })
    }

    #[must_use]
    pub const fn scope(&self) -> &ReadScope {
        &self.scope
    }

    #[must_use]
    pub const fn operation(&self) -> Operation {
        self.operation
    }

    /// Original private provider context for fresh current-authority rechecks.
    /// A missing/wrong context type must fail closed, never fall back to digest.
    #[must_use]
    pub fn custody<T: Any>(&self) -> Option<&T> {
        self.custody.downcast_ref()
    }

    /// Adapts this operation snapshot to the existing synchronous scoped store.
    /// The caller still owns mandatory fresh async checks around I/O and send.
    ///
    /// # Errors
    /// Rejects invalid time/scope or a mismatched operation.
    pub fn authorize(&self, now_ms: i64) -> Result<AuthorizedRead, ScopedError> {
        AuthorizedRead::authorize(self.scope.clone(), self.operation, self, now_ms)
    }
}

impl ReadAuthorizer for ResolvedPolicy {
    fn current(&self, scope: &ReadScope, operation: Operation, now_ms: i64) -> bool {
        (0..=MAX_TIME_MS).contains(&now_ms)
            && operation == self.operation
            && scope
                .digest()
                .is_ok_and(|digest| digest == self.scope_digest)
    }
}

/// Safe executable default until the owning current-policy adapter is bound.
/// It does not accept mTLS, delegated claims or structurally valid snapshots.
#[derive(Debug, Default)]
pub struct UnavailableCurrentPolicy;

impl CurrentPolicy for UnavailableCurrentPolicy {
    fn resolve<'a>(
        &'a self,
        _credential: &'a str,
        _resource: &'a str,
        _operation: Operation,
        _now_ms: i64,
    ) -> PolicyFuture<'a, ResolvedPolicy> {
        Box::pin(async { Err(ScopedError::AccessDenied) })
    }

    fn recheck<'a>(&'a self, _resolved: &'a ResolvedPolicy, _now_ms: i64) -> PolicyFuture<'a, ()> {
        Box::pin(async { Err(ScopedError::AccessDenied) })
    }
}

#[cfg(test)]
mod tests;
