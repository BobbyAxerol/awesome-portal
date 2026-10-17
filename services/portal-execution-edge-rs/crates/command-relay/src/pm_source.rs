//! PM-owned private source formats, not an HTTP client or an authority provider.
//!
//! The trusted adapter authenticates the source/current leases and obtains the
//! ORIGINAL normalized digest/target. Never reconstruct them from today's
//! profile, take them from browser input, or treat successful decoding as a grant.
//! No route, send, retry, token, key or runtime binding is installed here.

use std::{collections::BTreeMap, fmt};

use projection_core::canonical_digest;
use serde::{de, Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

use crate::durable::{
    AuthorityReceipt, BusinessState, CommandIntent, DurableError, MAX_RECEIPT_BYTES,
};

pub const HTTP_BINDING_SCHEMA: &str = "pma.http-request-binding.v1";
pub const OUTCOME_SCHEMA: &str = "pma.edge-command-outcome.v1";

#[derive(Debug, Error, Eq, PartialEq)]
pub enum PmSourceError {
    #[error("PM_HTTP_BINDING_INVALID")]
    HttpBinding,
    #[error("PM_SOURCE_BINDING_INVALID")]
    SourceBinding,
    #[error("PM_OUTCOME_INVALID")]
    Outcome,
    #[error("PM_OUTCOME_BODY_LIMIT")]
    BodyLimit,
    #[error("PM_RECEIPT_INVALID")]
    Receipt(#[from] DurableError),
}

/// Hashes the exact delivered bytes, not normalized business JSON or an intent.
/// Serialize once, sign for these bytes, then deliver those SAME bytes. Redirects
/// or URL/query/body rewriting would invalidate this binding. The explicit body
/// bound belongs to the qualified transport configuration, not a new default.
///
/// # Errors
/// Rejects unsupported methods, path/query/body limits and non-path delimiters.
pub fn http_request_digest(
    method: &str,
    raw_path: &[u8],
    query: &[u8],
    body: &[u8],
    request_limit: usize,
) -> Result<String, PmSourceError> {
    if !matches!(method, "GET" | "POST")
        || !raw_path.starts_with(b"/")
        || raw_path.len() > 8192
        || raw_path.contains(&b'?')
        || raw_path.contains(&b'#')
        || query.len() > 2048
        || request_limit == 0
        || body.len() > request_limit
    {
        return Err(PmSourceError::HttpBinding);
    }
    canonical_digest(&serde_json::json!({
        "schema": HTTP_BINDING_SCHEMA, "method": method,
        "path_sha256": hash(raw_path), "query_sha256": hash(query), "body_sha256": hash(body),
    }))
    .map_err(|_| PmSourceError::HttpBinding)
}

/// Structural original-source pins, never proof of source or caller identity.
/// The authenticated port must resolve/retain these with the original command;
/// no implicit normalization, alias resolution or historical backfill occurs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PmSourceBinding {
    request_digest: String,
    source_intent_digest: String,
    target_ref: String,
}

impl PmSourceBinding {
    /// # Errors
    /// Rejects malformed normalized digest or resolved target; grants no rights.
    pub fn new(
        intent: &CommandIntent,
        source_intent_digest: &str,
        target_ref: &str,
    ) -> Result<Self, PmSourceError> {
        if !lower_hex_digest(source_intent_digest) || !text(target_ref) {
            return Err(PmSourceError::SourceBinding);
        }
        Ok(Self {
            request_digest: intent.request_digest().to_owned(),
            source_intent_digest: source_intent_digest.to_owned(),
            target_ref: target_ref.to_owned(),
        })
    }
}

/// All correlation metadata remains available beside the full existing receipt.
/// This is neither source authentication nor a projection-applied checkpoint.
#[derive(Debug, Eq, PartialEq)]
pub struct PmOutcome {
    pub authority_receipt: String,
    pub source_intent_digest: String,
    pub target_ref: String,
    pub receipt: AuthorityReceipt,
}

/// Decodes only the full PM private port, never its reduced HTTP summary.
///
/// The adapter must already authenticate the source and current authority. On
/// failure AFTER dispatch the relay keeps UNKNOWN and queries the SAME key;
/// failure is never a negative business receipt or permission to resend.
///
/// # Errors
/// Rejects malformed/duplicate/extra fields, mismatched original pins, invented
/// projection progress and invalid full money/state/receipt evidence.
pub fn decode_outcome(
    intent: &CommandIntent,
    binding: &PmSourceBinding,
    bytes: &[u8],
) -> Result<PmOutcome, PmSourceError> {
    if bytes.len() > MAX_RECEIPT_BYTES {
        return Err(PmSourceError::BodyLimit);
    }
    let wire: WireOutcome = serde_json::from_slice(bytes).map_err(|_| PmSourceError::Outcome)?;
    if wire.schema_version != OUTCOME_SCHEMA
        || binding.request_digest != intent.request_digest()
        || wire.transport_payload_digest != intent.digest()
        || wire.source_intent_digest != binding.source_intent_digest
        || wire.source_key
            != [
                intent.scope().authority_scope_id(),
                intent.operation(),
                intent.key(),
            ]
        || wire.target_ref != binding.target_ref
        || !text(&wire.authority_receipt)
    {
        return Err(PmSourceError::SourceBinding);
    }
    let state = BusinessState::parse(&wire.presentation.state)?;
    let source_ref = wire.presentation.source_ref.clone();
    let payload = serde_json::to_value(wire.presentation).map_err(|_| PmSourceError::Outcome)?;
    let receipt = AuthorityReceipt::new(intent, &source_ref, wire.source_revision, state, payload)?;
    Ok(PmOutcome {
        authority_receipt: wire.authority_receipt,
        source_intent_digest: wire.source_intent_digest,
        target_ref: wire.target_ref,
        receipt,
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WireOutcome {
    schema_version: String,
    transport_payload_digest: String,
    source_intent_digest: String,
    source_key: [String; 3],
    target_ref: String,
    authority_receipt: String,
    source_revision: i64,
    presentation: Presentation,
    // Required null, not Option: absent must not mean a verified null checkpoint.
    #[serde(rename = "projection_applied_checkpoint")]
    _projection_applied_checkpoint: (),
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Presentation {
    command_id: String,
    state: String,
    amounts: Amounts,
    currency: String,
    #[serde(deserialize_with = "required_nullable_text")]
    parent_receipt: Option<String>,
    blockers: Vec<String>,
    before_ref: String,
    after_ref: String,
    source_ref: String,
    policy_ref: String,
    binding_ref: String,
    #[serde(deserialize_with = "versions")]
    current_versions: BTreeMap<String, i64>,
    physical_transfer_performed: bool,
    cli_exit_code: i64,
    next_action: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Amounts {
    requested: String,
    applied: String,
    pending: String,
    cancelled: String,
    rejected: String,
}

fn required_nullable_text<'de, D: Deserializer<'de>>(input: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(input)
}

fn versions<'de, D: Deserializer<'de>>(input: D) -> Result<BTreeMap<String, i64>, D::Error> {
    struct Versions;
    impl<'de> de::Visitor<'de> for Versions {
        type Value = BTreeMap<String, i64>;
        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("bounded unique native integer versions")
        }
        fn visit_map<M: de::MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
            let mut values = BTreeMap::new();
            while let Some((key, value)) = map.next_entry::<String, i64>()? {
                if !text(&key)
                    || value < 0
                    || values.len() == 32
                    || values.insert(key, value).is_some()
                {
                    return Err(de::Error::custom("invalid version map"));
                }
            }
            Ok(values)
        }
    }
    input.deserialize_map(Versions)
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn lower_hex_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|ch| ch.is_ascii_digit() || (b'a'..=b'f').contains(&ch))
}

fn text(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 512
        && value.trim() == value
        && !value.chars().any(|ch| ch <= '\u{001f}' || ch == '\u{007f}')
}

#[cfg(test)]
mod tests;
