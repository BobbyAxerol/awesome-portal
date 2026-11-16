//! Source-only PM instance draft; no query, route, or authority binding.
use serde::Serialize;
use thiserror::Error;

use crate::economic_draft::{bounded_text, DraftScope};

#[derive(Clone, Copy)]
pub struct InstanceInput<'a> {
    pub instance_token: &'a str,
    pub authority_scope_id: &'a str,
    pub alpha_slug: &'a str,
    pub portfolio_id: &'a str,
    pub mode: &'a str,
    pub venue: &'a str,
    pub canonical_strategy_id: &'a str,
    pub account_id: &'a str,
    pub deployment_id: &'a str,
    pub version: i64,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct InstanceDraft<'a> {
    pub instance_token: &'a str,
    pub authority_scope_id: &'a str,
    pub alpha_slug: &'a str,
    pub portfolio_id: &'a str,
    pub mode: &'a str,
    pub venue: &'a str,
    pub canonical_strategy_id: &'a str,
    pub account_id: &'a str,
    pub deployment_id: &'a str,
    pub version: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum InstanceDraftError {
    #[error("invalid source field")]
    InvalidField,
    #[error("source is outside the selected scope")]
    ScopeMismatch,
}

/// Copy a single candidate row without deriving scope or lifecycle from IDs.
/// The caller must establish real source and current-policy authority.
///
/// # Errors
/// Rejects malformed input, unsupported modes and exact scope mismatch.
pub fn map_instance<'a>(
    row: InstanceInput<'a>,
    scope: &DraftScope<'_>,
) -> Result<InstanceDraft<'a>, InstanceDraftError> {
    if !bounded_text(scope.mode) || !bounded_text(scope.venue) {
        return Err(InstanceDraftError::InvalidField);
    }
    if row.mode != scope.mode || row.venue != scope.venue {
        return Err(InstanceDraftError::ScopeMismatch);
    }
    if !matches!(row.mode, "paper" | "sandbox" | "live")
        || row.version <= 0
        || ![
            row.instance_token,
            row.authority_scope_id,
            row.alpha_slug,
            row.portfolio_id,
            row.venue,
            row.canonical_strategy_id,
            row.account_id,
            row.deployment_id,
        ]
        .into_iter()
        .all(bounded_text)
    {
        return Err(InstanceDraftError::InvalidField);
    }
    Ok(InstanceDraft {
        instance_token: row.instance_token,
        authority_scope_id: row.authority_scope_id,
        alpha_slug: row.alpha_slug,
        portfolio_id: row.portfolio_id,
        mode: row.mode,
        venue: row.venue,
        canonical_strategy_id: row.canonical_strategy_id,
        account_id: row.account_id,
        deployment_id: row.deployment_id,
        version: row.version.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row() -> InstanceInput<'static> {
        InstanceInput {
            instance_token: "opaque-instance",
            authority_scope_id: "scope",
            alpha_slug: "alpha",
            portfolio_id: "portfolio",
            mode: "paper",
            venue: "okx",
            canonical_strategy_id: "strategy",
            account_id: "account",
            deployment_id: "deployment",
            version: i64::MAX,
        }
    }

    #[test]
    fn preserves_distinct_ids_and_large_revision_as_string() {
        let mapped = map_instance(
            row(),
            &DraftScope {
                mode: "paper",
                venue: "okx",
            },
        )
        .unwrap();
        assert_eq!(mapped.account_id, "account");
        assert_eq!(mapped.deployment_id, "deployment");
        assert_eq!(mapped.portfolio_id, "portfolio");
        let value = serde_json::to_value(mapped).unwrap();
        assert_eq!(value["version"], "9223372036854775807");
        assert!(value.get("state").is_none());
    }

    #[test]
    fn rejects_cross_scope_canary_alias_and_invalid_revision() {
        assert_eq!(
            map_instance(
                row(),
                &DraftScope {
                    mode: "paper",
                    venue: "binance"
                }
            ),
            Err(InstanceDraftError::ScopeMismatch)
        );
        assert_eq!(
            map_instance(
                row(),
                &DraftScope {
                    mode: "live",
                    venue: "okx"
                }
            ),
            Err(InstanceDraftError::ScopeMismatch)
        );
        let mut source = row();
        source.mode = "canary";
        assert_eq!(
            map_instance(
                source,
                &DraftScope {
                    mode: "canary",
                    venue: "okx"
                }
            ),
            Err(InstanceDraftError::InvalidField)
        );
        let mut source = row();
        source.version = 0;
        assert_eq!(
            map_instance(
                source,
                &DraftScope {
                    mode: "paper",
                    venue: "okx"
                }
            ),
            Err(InstanceDraftError::InvalidField)
        );
    }
}
