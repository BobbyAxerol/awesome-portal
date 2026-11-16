//! Source-only mapping draft for TS economic facts and postings.
//!
//! This module is not a transport, query, identity authority, publication or
//! evidence that the corresponding TS schema is deployed or complete.

use chrono::DateTime;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, PartialEq, Eq)]
pub enum EconomicDraftError {
    #[error("invalid source field")]
    InvalidField,
    #[error("source is outside the selected scope")]
    ScopeMismatch,
    #[error("invalid correction lineage")]
    InvalidCorrection,
    #[error("posting is not linked to the selected fact")]
    FactMismatch,
    #[error("invalid exact debit or credit")]
    InvalidPosting,
}

/// Caller must independently obtain the authorized exact scope from the
/// real authority; this value does not itself grant or certify access.
pub struct DraftScope<'a> {
    pub mode: &'a str,
    pub venue: &'a str,
}

#[derive(Clone, Copy)]
pub struct FactInput<'a> {
    pub fact_id: &'a str,
    pub source_cell_id: &'a str,
    pub source_database_id: &'a str,
    pub continuity_epoch: &'a str,
    pub economic_scope_key: &'a str,
    pub economic_identity: &'a str,
    pub revision: i32,
    pub event_type: &'a str,
    pub mode: &'a str,
    pub venue: &'a str,
    pub product: &'a str,
    pub physical_account_ref: &'a str,
    pub logical_account_ref: &'a str,
    pub instrument_id: &'a str,
    pub instrument_version: &'a str,
    pub position_mode: &'a str,
    pub position_side: &'a str,
    pub numeric_policy_version: &'a str,
    pub reducer_version: &'a str,
    pub source_event_id: &'a str,
    pub payload_hash: &'a str,
    pub source_sequence: i64,
    pub effective_sequence: i64,
    pub occurred_at: &'a str,
    pub received_at: &'a str,
    pub correction_of_fact_id: Option<&'a str>,
    pub correction_reason: Option<&'a str>,
    pub correction_authority: Option<&'a str>,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct FactDraft<'a> {
    pub fact_id: &'a str,
    pub source_cell_id: &'a str,
    pub source_database_id: &'a str,
    pub continuity_epoch: &'a str,
    pub economic_scope_key: &'a str,
    pub economic_identity: &'a str,
    pub revision: String,
    pub event_type: &'a str,
    pub mode: &'a str,
    pub venue: &'a str,
    pub product: &'a str,
    pub physical_account_ref: &'a str,
    pub logical_account_ref: &'a str,
    pub instrument_id: &'a str,
    pub instrument_version: &'a str,
    pub position_mode: &'a str,
    pub position_side: &'a str,
    pub numeric_policy_version: &'a str,
    pub reducer_version: &'a str,
    pub source_event_id: &'a str,
    pub payload_hash: &'a str,
    pub source_sequence: String,
    pub effective_sequence: String,
    pub occurred_at: &'a str,
    pub received_at: &'a str,
    pub correction_of_fact_id: Option<&'a str>,
    pub correction_reason: Option<&'a str>,
    pub correction_authority: Option<&'a str>,
}

pub(crate) fn bounded_text(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

pub(crate) fn hash_key(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Map one explicitly scoped fact, without resolving latest revision or
/// asserting that its source is complete.
///
/// # Errors
/// Rejects malformed fields, mismatched mode/venue or incomplete correction.
pub fn map_fact<'a>(
    row: FactInput<'a>,
    scope: &DraftScope<'_>,
) -> Result<FactDraft<'a>, EconomicDraftError> {
    if !bounded_text(scope.mode) || !bounded_text(scope.venue) {
        return Err(EconomicDraftError::InvalidField);
    }
    if row.mode != scope.mode || row.venue != scope.venue {
        return Err(EconomicDraftError::ScopeMismatch);
    }
    if !matches!(
        row.mode,
        "paper" | "sandbox" | "live" | "replay" | "backtest"
    ) || !matches!(
        row.event_type,
        "FILL" | "FUNDING" | "SETTLEMENT" | "ADJUSTMENT"
    ) || !matches!(row.position_mode, "NET" | "HEDGE")
        || !matches!(row.position_side, "BOTH" | "LONG" | "SHORT")
        || ![
            row.fact_id,
            row.source_cell_id,
            row.source_database_id,
            row.continuity_epoch,
            row.venue,
            row.product,
            row.physical_account_ref,
            row.logical_account_ref,
            row.instrument_id,
            row.instrument_version,
            row.numeric_policy_version,
            row.reducer_version,
            row.source_event_id,
        ]
        .into_iter()
        .all(bounded_text)
        || !hash_key(row.economic_scope_key)
        || !hash_key(row.economic_identity)
        || !hash_key(row.payload_hash)
        || row.revision <= 0
        || row.source_sequence < 0
        || row.effective_sequence < 0
        || DateTime::parse_from_rfc3339(row.occurred_at).is_err()
        || DateTime::parse_from_rfc3339(row.received_at).is_err()
    {
        return Err(EconomicDraftError::InvalidField);
    }
    match (
        row.revision,
        row.correction_of_fact_id,
        row.correction_reason,
        row.correction_authority,
    ) {
        (1, None, None, None) => {}
        (2.., Some(parent), Some(reason), Some(authority))
            if parent != row.fact_id
                && [parent, reason, authority].into_iter().all(bounded_text) => {}
        _ => return Err(EconomicDraftError::InvalidCorrection),
    }
    Ok(FactDraft {
        fact_id: row.fact_id,
        source_cell_id: row.source_cell_id,
        source_database_id: row.source_database_id,
        continuity_epoch: row.continuity_epoch,
        economic_scope_key: row.economic_scope_key,
        economic_identity: row.economic_identity,
        revision: row.revision.to_string(),
        event_type: row.event_type,
        mode: row.mode,
        venue: row.venue,
        product: row.product,
        physical_account_ref: row.physical_account_ref,
        logical_account_ref: row.logical_account_ref,
        instrument_id: row.instrument_id,
        instrument_version: row.instrument_version,
        position_mode: row.position_mode,
        position_side: row.position_side,
        numeric_policy_version: row.numeric_policy_version,
        reducer_version: row.reducer_version,
        source_event_id: row.source_event_id,
        payload_hash: row.payload_hash,
        source_sequence: row.source_sequence.to_string(),
        effective_sequence: row.effective_sequence.to_string(),
        occurred_at: row.occurred_at,
        received_at: row.received_at,
        correction_of_fact_id: row.correction_of_fact_id,
        correction_reason: row.correction_reason,
        correction_authority: row.correction_authority,
    })
}

#[derive(Clone, Copy)]
pub struct PostingInput<'a> {
    pub posting_id: &'a str,
    pub fact_id: &'a str,
    pub posting_index: i32,
    pub posting_kind: &'a str,
    pub ledger_account: &'a str,
    pub currency: &'a str,
    pub debit: &'a str,
    pub credit: &'a str,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct PostingDraft<'a> {
    pub posting_id: &'a str,
    pub fact_id: &'a str,
    pub posting_index: String,
    pub posting_kind: &'a str,
    pub ledger_account: &'a str,
    pub currency: &'a str,
    pub debit: &'a str,
    pub credit: &'a str,
}

// NUMERIC(38,18) may exceed rust_decimal's 96-bit precision. Validate the
// exact nonnegative source lexeme without rounding or converting to float.
fn exact_amount(value: &str) -> Option<bool> {
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.is_empty()
        || (value.contains('.') && fraction.is_empty())
        || !whole.bytes().all(|b| b.is_ascii_digit())
        || !fraction.bytes().all(|b| b.is_ascii_digit())
        || whole.trim_start_matches('0').len() > 20
        || fraction.len() > 18
        || value.len() > 64
    {
        return None;
    }
    Some(whole.bytes().chain(fraction.bytes()).all(|b| b == b'0'))
}

/// Map one posting only against an already validated, same-fact draft.
///
/// # Errors
/// Rejects a different fact, malformed metadata or non-one-sided amounts.
pub fn map_posting<'a>(
    row: PostingInput<'a>,
    fact: &FactDraft<'_>,
) -> Result<PostingDraft<'a>, EconomicDraftError> {
    map_posting_for_fact_id(row, fact.fact_id)
}

pub(crate) fn map_posting_for_fact_id<'a>(
    row: PostingInput<'a>,
    fact_id: &str,
) -> Result<PostingDraft<'a>, EconomicDraftError> {
    if row.fact_id != fact_id {
        return Err(EconomicDraftError::FactMismatch);
    }
    if ![row.posting_id, row.posting_kind, row.ledger_account]
        .into_iter()
        .all(bounded_text)
        || row.posting_index < 0
        || !(2..=16).contains(&row.currency.len())
        || !row
            .currency
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
    {
        return Err(EconomicDraftError::InvalidField);
    }
    match (exact_amount(row.debit), exact_amount(row.credit)) {
        (Some(true), Some(false)) | (Some(false), Some(true)) => {}
        _ => return Err(EconomicDraftError::InvalidPosting),
    }
    Ok(PostingDraft {
        posting_id: row.posting_id,
        fact_id: row.fact_id,
        posting_index: row.posting_index.to_string(),
        posting_kind: row.posting_kind,
        ledger_account: row.ledger_account,
        currency: row.currency,
        debit: row.debit,
        credit: row.credit,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const SCOPE: DraftScope<'static> = DraftScope {
        mode: "paper",
        venue: "BINANCE",
    };

    fn fact() -> FactInput<'static> {
        FactInput {
            fact_id: "fact-2",
            source_cell_id: "cell",
            source_database_id: "database",
            continuity_epoch: "epoch",
            economic_scope_key: KEY,
            economic_identity: KEY,
            revision: 1,
            event_type: "FILL",
            mode: "paper",
            venue: "BINANCE",
            product: "SWAP",
            physical_account_ref: "physical",
            logical_account_ref: "logical",
            instrument_id: "instrument",
            instrument_version: "version",
            position_mode: "NET",
            position_side: "BOTH",
            numeric_policy_version: "numeric-policy",
            reducer_version: "reducer",
            source_event_id: "source-event",
            payload_hash: KEY,
            source_sequence: i64::MAX,
            effective_sequence: 0,
            occurred_at: "2026-11-11T12:00:00Z",
            received_at: "2026-11-11T20:00:01+08:00",
            correction_of_fact_id: None,
            correction_reason: None,
            correction_authority: None,
        }
    }

    fn posting() -> PostingInput<'static> {
        PostingInput {
            posting_id: "posting-1",
            fact_id: "fact-2",
            posting_index: i32::MAX,
            posting_kind: "FEE",
            ledger_account: "account",
            currency: "USDT",
            debit: "99999999999999999999.123456789012345678",
            credit: "0.000000000000000000",
        }
    }

    #[test]
    fn fact_preserves_scope_accounts_timestamps_and_opaque_large_numbers() {
        let result = map_fact(fact(), &SCOPE).unwrap();
        assert_eq!(result.source_sequence, "9223372036854775807");
        assert_eq!(result.physical_account_ref, "physical");
        assert_eq!(result.logical_account_ref, "logical");
        assert_eq!(result.instrument_version, "version");
        assert_eq!(result.source_event_id, "source-event");
        assert_eq!(result.received_at, "2026-11-11T20:00:01+08:00");
        let json = serde_json::to_value(result).unwrap();
        assert!(json["source_sequence"].is_string());
        assert!(json["revision"].is_string());
    }

    #[test]
    fn correction_is_preserved_without_calculating_or_replacing_original() {
        let mut row = fact();
        row.revision = i32::MAX;
        row.correction_of_fact_id = Some("fact-1");
        row.correction_reason = Some("late fee");
        row.correction_authority = Some("source-authority");
        let mapped = map_fact(row, &SCOPE).unwrap();
        assert_eq!(mapped.revision, "2147483647");
        assert_eq!(mapped.correction_of_fact_id, Some("fact-1"));
    }

    #[test]
    fn incomplete_or_self_referencing_corrections_fail() {
        let mut row = fact();
        row.revision = 2;
        row.correction_of_fact_id = Some("fact-1");
        assert_eq!(
            map_fact(row, &SCOPE),
            Err(EconomicDraftError::InvalidCorrection)
        );
        let mut row = fact();
        row.revision = 2;
        row.correction_of_fact_id = Some("fact-2");
        row.correction_reason = Some("reason");
        row.correction_authority = Some("authority");
        assert_eq!(
            map_fact(row, &SCOPE),
            Err(EconomicDraftError::InvalidCorrection)
        );
    }

    #[test]
    fn rejects_cross_venue_mode_invalid_time_and_unknown_event() {
        let mut row = fact();
        row.venue = "OKX";
        assert_eq!(
            map_fact(row, &SCOPE),
            Err(EconomicDraftError::ScopeMismatch)
        );
        let mut row = fact();
        row.mode = "live";
        assert_eq!(
            map_fact(row, &SCOPE),
            Err(EconomicDraftError::ScopeMismatch)
        );
        let mut row = fact();
        row.occurred_at = "2026-11-11";
        assert_eq!(map_fact(row, &SCOPE), Err(EconomicDraftError::InvalidField));
        let mut row = fact();
        row.event_type = "UNKNOWN";
        assert_eq!(map_fact(row, &SCOPE), Err(EconomicDraftError::InvalidField));
        let mut row = fact();
        row.payload_hash = "bad-hash";
        assert_eq!(map_fact(row, &SCOPE), Err(EconomicDraftError::InvalidField));
        let mut row = fact();
        row.position_side = "NET";
        assert_eq!(map_fact(row, &SCOPE), Err(EconomicDraftError::InvalidField));
    }

    #[test]
    fn posting_keeps_38_digit_decimal_exactly_and_strings_index() {
        let mapped = map_posting(posting(), &map_fact(fact(), &SCOPE).unwrap()).unwrap();
        assert_eq!(mapped.debit, "99999999999999999999.123456789012345678");
        let json = serde_json::to_value(mapped).unwrap();
        assert_eq!(json["posting_index"], "2147483647");
        assert!(json["debit"].is_string());
    }

    #[test]
    fn rejects_precision_overflow_nonfinite_and_ambiguous_postings() {
        let validated = map_fact(fact(), &SCOPE).unwrap();
        for bad in [
            "100000000000000000000",
            "0.0000000000000000001",
            "NaN",
            "1e9",
            "-1",
            "1.",
            "",
        ] {
            let mut row = posting();
            row.debit = bad;
            assert_eq!(
                map_posting(row, &validated),
                Err(EconomicDraftError::InvalidPosting)
            );
        }
        let mut row = posting();
        row.credit = "1";
        assert_eq!(
            map_posting(row, &validated),
            Err(EconomicDraftError::InvalidPosting)
        );
        let mut row = posting();
        row.debit = "0";
        assert_eq!(
            map_posting(row, &validated),
            Err(EconomicDraftError::InvalidPosting)
        );
    }

    #[test]
    fn rejects_other_fact_and_currency_and_accepts_credit_side() {
        let validated = map_fact(fact(), &SCOPE).unwrap();
        let mut row = posting();
        row.fact_id = "other";
        assert_eq!(
            map_posting(row, &validated),
            Err(EconomicDraftError::FactMismatch)
        );
        let mut row = posting();
        row.currency = "usdt";
        assert_eq!(
            map_posting(row, &validated),
            Err(EconomicDraftError::InvalidField)
        );
        let mut row = posting();
        row.debit = "0";
        row.credit = "0.000000000000000001";
        assert!(map_posting(row, &validated).is_ok());
    }
}
