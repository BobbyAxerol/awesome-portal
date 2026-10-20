//! Portal-owned custody, never a source normalizer or a human token issuer.

use std::sync::Arc;

use command_relay::{durable::CommandIntent, pm_source::PmOutcome};
use projection_store_pg::PgProjectionStore;

use super::{
    ContextFuture, HumanAssertion, OriginalPmCommand, PmAction, PmCommandContext, PmUnavailable,
};

/// Actual current-requester issuer supplied by the owning composition. No
/// implementation, cached token or historical-actor fallback is provided here.
pub trait PmAssertionIssuer: Send + Sync {
    fn issue<'a>(
        &'a self,
        intent: &'a CommandIntent,
        action: PmAction,
        delivered_request_digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion>;
}

/// Bounded projection-store custody paired with a separate trusted issuer.
/// Construction does not configure a quota, prepare a command, migrate a DB,
/// grant authority, open a listener or enable sends.
pub struct PgPmCommandContext {
    store: PgProjectionStore,
    ledger: String,
    issuer: Arc<dyn PmAssertionIssuer>,
}

impl PgPmCommandContext {
    /// # Errors
    /// Rejects an unbounded or malformed server-owned ledger identifier.
    pub fn new(
        store: PgProjectionStore,
        ledger: &str,
        issuer: Arc<dyn PmAssertionIssuer>,
    ) -> Result<Self, PmUnavailable> {
        if ledger.is_empty()
            || ledger.len() > 128
            || ledger.trim() != ledger
            || ledger.chars().any(char::is_control)
        {
            return Err(PmUnavailable);
        }
        Ok(Self {
            store,
            ledger: ledger.to_owned(),
            issuer,
        })
    }
}

impl PmCommandContext for PgPmCommandContext {
    fn original<'a>(&'a self, intent: &'a CommandIntent) -> ContextFuture<'a, OriginalPmCommand> {
        Box::pin(async move {
            let original = self
                .store
                .pm_original_binding(&self.ledger, intent)
                .await
                .map_err(|_| PmUnavailable)?;
            OriginalPmCommand::new(
                intent,
                original.reference(),
                original.source_intent_digest(),
                original.target_ref(),
            )
        })
    }

    fn assertion<'a>(
        &'a self,
        intent: &'a CommandIntent,
        action: PmAction,
        delivered_request_digest: &'a str,
    ) -> ContextFuture<'a, HumanAssertion> {
        self.issuer.issue(intent, action, delivered_request_digest)
    }

    fn retain<'a>(
        &'a self,
        intent: &'a CommandIntent,
        outcome: &'a PmOutcome,
    ) -> ContextFuture<'a, ()> {
        Box::pin(async move {
            self.store
                .retain_pm_outcome(&self.ledger, intent, outcome)
                .await
                .map_err(|_| PmUnavailable)
        })
    }
}
