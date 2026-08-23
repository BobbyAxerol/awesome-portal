//! EX-BE-05b/F0 command relay contract boundary.
//!
//! The relay is deliberately non-operational. The policy denies before an HTTP
//! client can be constructed, while the pure journal models future duplicate
//! and ambiguous-outcome handling for fixture and replay tests.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypedCondition {
    pub text: String,
    pub owner: String,
    pub deadline: Option<String>,
    pub expires_at: Option<String>,
    pub blocking: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RelayDenied {
    pub schema_version: String,
    pub operation_id: String,
    pub decision: RelayDecision,
    pub reason: RelayDenialReason,
    pub retry_allowed: bool,
    pub source_request_sent: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelayDecision {
    Denied,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RelayDenialReason {
    CommandRelayDisabled,
    UncertainReconciliationRequired,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RelayPolicy;

impl RelayPolicy {
    #[must_use]
    pub fn authorize(self, operation_id: impl Into<String>) -> RelayDenied {
        RelayDenied {
            schema_version: "execution.command-relay-decision.v1".to_owned(),
            operation_id: operation_id.into(),
            decision: RelayDecision::Denied,
            reason: RelayDenialReason::CommandRelayDisabled,
            retry_allowed: false,
            source_request_sent: false,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum JournalState {
    Prepared,
    Uncertain,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct JournalEntry {
    operation_id: String,
    payload_hash: String,
    state: JournalState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RegisterOutcome {
    FirstSeen,
    Replay { operation_id: String },
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum JournalError {
    #[error("idempotency key already binds a different payload")]
    PayloadConflict,
    #[error("uncertain outcome requires source reconciliation; retry is prohibited")]
    UncertainReconciliationRequired,
    #[error("idempotency key was not recorded")]
    NotFound,
}

#[derive(Default)]
pub struct RelayJournal {
    entries: HashMap<String, JournalEntry>,
}

impl RelayJournal {
    /// Registers the immutable intent behind an idempotency key.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::PayloadConflict`] when the key was bound to a
    /// different payload, or [`JournalError::UncertainReconciliationRequired`]
    /// when an ambiguous source outcome must be reconciled before any retry.
    pub fn register(
        &mut self,
        idempotency_key: impl Into<String>,
        operation_id: impl Into<String>,
        payload_hash: impl Into<String>,
    ) -> Result<RegisterOutcome, JournalError> {
        let key = idempotency_key.into();
        let operation_id = operation_id.into();
        let payload_hash = payload_hash.into();
        if let Some(existing) = self.entries.get(&key) {
            if existing.payload_hash != payload_hash {
                return Err(JournalError::PayloadConflict);
            }
            if existing.state == JournalState::Uncertain {
                return Err(JournalError::UncertainReconciliationRequired);
            }
            return Ok(RegisterOutcome::Replay {
                operation_id: existing.operation_id.clone(),
            });
        }
        self.entries.insert(
            key,
            JournalEntry {
                operation_id,
                payload_hash,
                state: JournalState::Prepared,
            },
        );
        Ok(RegisterOutcome::FirstSeen)
    }

    /// Marks an intent as having an ambiguous source outcome.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::NotFound`] when the key has never been recorded.
    pub fn mark_uncertain(&mut self, idempotency_key: &str) -> Result<(), JournalError> {
        let entry = self
            .entries
            .get_mut(idempotency_key)
            .ok_or(JournalError::NotFound)?;
        entry.state = JournalState::Uncertain;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    #[derive(Deserialize)]
    struct Catalogue {
        entries: Vec<CatalogueEntry>,
    }

    #[derive(Deserialize)]
    struct CatalogueEntry {
        key: String,
        risk_tier: String,
        #[serde(flatten)]
        review_policy: ReviewPolicy,
        #[serde(flatten)]
        delivery_policy: DeliveryPolicy,
        source_route_state: String,
        http_method: Option<String>,
        blocked_reason: String,
    }

    #[derive(Deserialize)]
    struct ReviewPolicy {
        owner_review_required: bool,
        plan_required: bool,
    }

    #[derive(Deserialize)]
    struct DeliveryPolicy {
        apply_required: bool,
        portal_reachable: bool,
    }

    fn catalogue() -> Catalogue {
        serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-command-catalog.valid.json"
        ))
        .expect("canonical catalogue fixture")
    }

    #[test]
    fn denial_fixture_round_trips_and_cannot_claim_a_source_request() {
        let fixture: RelayDenied = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-command-relay-denied.valid.json"
        ))
        .expect("canonical denied fixture");
        assert_eq!(fixture, RelayPolicy.authorize(fixture.operation_id.clone()));
        assert!(!fixture.retry_allowed);
        assert!(!fixture.source_request_sent);
    }

    #[test]
    fn all_catalogue_entries_remain_unreachable_in_f0() {
        let catalogue = catalogue();
        assert_eq!(catalogue.entries.len(), 64);
        assert!(catalogue
            .entries
            .iter()
            .all(|entry| !entry.delivery_policy.portal_reachable));
    }

    #[test]
    fn portal_catalogue_applies_conservative_mutation_policy() {
        let catalogue = catalogue();
        for entry in catalogue.entries {
            let observed_http_mutation = entry
                .http_method
                .as_deref()
                .is_some_and(|method| method != "GET");
            let mutation_risk = matches!(
                entry.risk_tier.as_str(),
                "R1_PAPER_MUTATION"
                    | "R2_SANDBOX"
                    | "R3_LIVE_PROTECTIVE"
                    | "R4_LIVE_RISK_INCREASING"
            );
            if observed_http_mutation {
                assert_ne!(entry.risk_tier, "R0_READ", "{}", entry.key);
                assert!(entry.review_policy.owner_review_required, "{}", entry.key);
            }
            if mutation_risk {
                assert!(entry.review_policy.owner_review_required, "{}", entry.key);
                assert!(entry.review_policy.plan_required, "{}", entry.key);
                assert!(entry.delivery_policy.apply_required, "{}", entry.key);
            }
        }
    }

    #[test]
    fn unpublished_ops_and_generic_redis_cannot_gain_incidental_authority() {
        let catalogue = catalogue();
        for key in [
            "ops/trace-order",
            "ops/dead-letters",
            "ops/findings",
            "ops/streams",
            "ops/command-journal",
            "ops/redis-retention",
            "ops/alerts",
            "ops/alpha-activity",
        ] {
            let entry = catalogue
                .entries
                .iter()
                .find(|entry| entry.key == key)
                .unwrap();
            assert_eq!(entry.source_route_state, "UNPUBLISHED");
            assert_eq!(
                entry.blocked_reason,
                "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED"
            );
        }
        for key in ["redis/get", "redis/scan"] {
            let entry = catalogue
                .entries
                .iter()
                .find(|entry| entry.key == key)
                .unwrap();
            assert_eq!(entry.source_route_state, "DIRECT_ACCESS_PROHIBITED");
            assert_eq!(entry.blocked_reason, "GENERIC_REDIS_ACCESS_PROHIBITED");
        }
    }

    #[test]
    fn duplicate_same_payload_replays_but_conflicting_payload_is_rejected() {
        let mut journal = RelayJournal::default();
        assert_eq!(
            journal.register("idem-1", "op-1", "sha256:aaa"),
            Ok(RegisterOutcome::FirstSeen)
        );
        assert_eq!(
            journal.register("idem-1", "op-ignored", "sha256:aaa"),
            Ok(RegisterOutcome::Replay {
                operation_id: "op-1".to_owned()
            })
        );
        assert_eq!(
            journal.register("idem-1", "op-2", "sha256:bbb"),
            Err(JournalError::PayloadConflict)
        );
    }

    #[test]
    fn uncertain_outcome_never_retries_without_reconciliation() {
        let mut journal = RelayJournal::default();
        journal.register("idem-1", "op-1", "sha256:aaa").unwrap();
        journal.mark_uncertain("idem-1").unwrap();
        assert_eq!(
            journal.register("idem-1", "op-1", "sha256:aaa"),
            Err(JournalError::UncertainReconciliationRequired)
        );
    }
}
