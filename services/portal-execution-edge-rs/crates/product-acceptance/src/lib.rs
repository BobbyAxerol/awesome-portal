//! N29 fail-closed product acceptance authority.
//!
//! This pure domain crate cannot publish images, open a network connection or
//! activate a product profile. It validates the immutable closeout decision
//! and keeps a backend-ready candidate distinct from a product release.

#![forbid(unsafe_code)]

use std::collections::BTreeSet;

use serde_json::Value;
use thiserror::Error;

pub const ACCEPTANCE_REVISION: &str = "portal.execution.product-acceptance.v1";
pub const DEBT_REVISION: &str = "portal.execution.product-debt-register.v1";

const ACCEPTANCE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n29-product-acceptance-v1/product-acceptance.v1.json"
));
const DEBT: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../contracts/n29-product-acceptance-v1/debt-register.v1.json"
));

#[derive(Debug, Error, Eq, PartialEq)]
pub enum AcceptanceError {
    #[error("N29 contract is malformed")]
    Malformed,
    #[error("N29 inventory or evidence drifted")]
    InventoryDrift,
    #[error("N29 release authority was widened")]
    AuthorityWidened,
    #[error("N29 debt classification is incomplete")]
    DebtDrift,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AcceptanceSummary {
    pub relation_count: u64,
    pub commissioned_request_count: u64,
    pub portal_read_count: u64,
    pub requested_command_count: u64,
    pub screen_contract_count: u64,
    pub typed_owner_gap_count: u64,
    pub release_blocker_count: usize,
    pub product_release_authorized: bool,
}

/// Validates the embedded backend closeout and release boundary.
///
/// # Errors
///
/// Returns a stable error when counts, reasoned unavailable states, evidence
/// digests, blockers or authority flags drift.
pub fn validate_embedded_acceptance() -> Result<AcceptanceSummary, AcceptanceError> {
    let acceptance: Value =
        serde_json::from_str(ACCEPTANCE).map_err(|_| AcceptanceError::Malformed)?;
    let debt: Value = serde_json::from_str(DEBT).map_err(|_| AcceptanceError::Malformed)?;

    if text(&acceptance, "/schema_version") != Some(ACCEPTANCE_REVISION)
        || text(&acceptance, "/phase") != Some("N29")
        || text(&acceptance, "/decision")
            != Some("RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING")
        || text(&acceptance, "/release_channel") != Some("PROTECTED_MAIN_CANDIDATE")
        || text(&acceptance, "/runtime_effect") != Some("NONE")
    {
        return Err(AcceptanceError::InventoryDrift);
    }

    let summary = AcceptanceSummary {
        relation_count: number(&acceptance, "/accepted_scope/relations/total")?,
        commissioned_request_count: number(
            &acceptance,
            "/accepted_scope/commissioned_requests/total",
        )?,
        portal_read_count: number(&acceptance, "/accepted_scope/portal_reads/total")?,
        requested_command_count: number(&acceptance, "/accepted_scope/requested_commands/total")?,
        screen_contract_count: number(&acceptance, "/accepted_scope/screen_contracts/total")?,
        typed_owner_gap_count: number(&acceptance, "/accepted_scope/n28/owner_gaps")?,
        release_blocker_count: array(&debt, "/release_blockers")?.len(),
        product_release_authorized: boolean(&acceptance, "/authority/product_release_authorized")?,
    };
    if summary.relation_count != 96
        || summary.commissioned_request_count != 31
        || summary.portal_read_count != 27
        || summary.requested_command_count != 9
        || summary.screen_contract_count != 23
        || summary.typed_owner_gap_count != 9
        || summary.release_blocker_count != 1
        || summary.product_release_authorized
    {
        return Err(AcceptanceError::InventoryDrift);
    }

    let unavailable = array(
        &acceptance,
        "/accepted_scope/screen_contracts/typed_unavailable_screen_ids",
    )?;
    let actual: BTreeSet<_> = unavailable.iter().filter_map(Value::as_str).collect();
    // Phase 2 promoted Account/Broker 360 to a real screen root while keeping
    // the still-missing exposure population typed at branch level. A whole
    // screen may no longer be classified unavailable here.
    let expected = BTreeSet::new();
    if actual != expected || unavailable.len() != expected.len() {
        return Err(AcceptanceError::InventoryDrift);
    }

    let evidence = acceptance
        .pointer("/evidence")
        .and_then(Value::as_object)
        .ok_or(AcceptanceError::Malformed)?;
    if evidence.len() != 35
        || evidence
            .values()
            .any(|value| !value.as_str().is_some_and(is_sha256))
    {
        return Err(AcceptanceError::InventoryDrift);
    }

    for pointer in [
        "/authority/product_release_authorized",
        "/authority/stable_merge_authorized",
        "/authority/stable_deployment_authorized",
        "/authority/source_activation_authorized",
        "/authority/command_activation_authorized",
        "/authority/live_mutation_authorized",
        "/authority/trading_system_change_authorized",
    ] {
        if boolean(&acceptance, pointer)? {
            return Err(AcceptanceError::AuthorityWidened);
        }
    }
    if !boolean(&acceptance, "/authority/portal_release_candidate")? {
        return Err(AcceptanceError::AuthorityWidened);
    }

    validate_debt_register(&debt)?;
    Ok(summary)
}

fn validate_debt_register(debt: &Value) -> Result<(), AcceptanceError> {
    if text(debt, "/schema_version") != Some(DEBT_REVISION)
        || text(debt, "/phase") != Some("N29")
        || text(debt, "/decision") != Some("NO_UNNAMED_DEBT")
        || !array(debt, "/internal_technical_debt")?.is_empty()
        || number(debt, "/typed_external_gaps/count")? != 9
        || boolean(debt, "/typed_external_gaps/release_blocking")?
        || number(debt, "/intentional_exclusions/count")? != 3
        || boolean(debt, "/intentional_exclusions/release_blocking")?
        || text(debt, "/new_phase_policy")
            != Some("N30_REQUIRES_GENUINELY_NEW_PRODUCT_SCOPE_OR_NEW_OWNER_REVISION")
    {
        return Err(AcceptanceError::DebtDrift);
    }

    let blocker_ids = item_ids(array(debt, "/release_blockers")?);
    let resolved_ids = item_ids(array(debt, "/resolved_delivery_gates")?);
    if blocker_ids != BTreeSet::from(["N29-REL-01"])
        || resolved_ids != BTreeSet::from(["N29-BE-72", "N29-FE-01"])
    {
        return Err(AcceptanceError::DebtDrift);
    }
    Ok(())
}

fn item_ids(items: &[Value]) -> BTreeSet<&str> {
    items
        .iter()
        .filter_map(|item| item.get("blocker_id"))
        .filter_map(Value::as_str)
        .collect()
}

fn text<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn number(value: &Value, pointer: &str) -> Result<u64, AcceptanceError> {
    value
        .pointer(pointer)
        .and_then(Value::as_u64)
        .ok_or(AcceptanceError::Malformed)
}

fn boolean(value: &Value, pointer: &str) -> Result<bool, AcceptanceError> {
    value
        .pointer(pointer)
        .and_then(Value::as_bool)
        .ok_or(AcceptanceError::Malformed)
}

fn array<'a>(value: &'a Value, pointer: &str) -> Result<&'a [Value], AcceptanceError> {
    value
        .pointer(pointer)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or(AcceptanceError::Malformed)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value.as_bytes()[7..].iter().all(u8::is_ascii_hexdigit)
        && value.as_bytes()[7..]
            .iter()
            .all(|byte| !byte.is_ascii_uppercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_closeout_is_exact_and_fail_closed() {
        let result = validate_embedded_acceptance().expect("valid N29 closeout");
        assert_eq!(result.relation_count, 96);
        assert_eq!(result.commissioned_request_count, 31);
        assert_eq!(result.release_blocker_count, 1);
        assert!(!result.product_release_authorized);
    }

    #[test]
    fn digest_validator_rejects_uppercase_short_and_unprefixed_values() {
        assert!(is_sha256(&format!("sha256:{}", "a".repeat(64))));
        assert!(!is_sha256(&format!("sha256:{}", "A".repeat(64))));
        assert!(!is_sha256(&format!("sha256:{}", "a".repeat(63))));
        assert!(!is_sha256(&"a".repeat(64)));
    }
}
