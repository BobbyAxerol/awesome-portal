//! Private Core ingress composition, `SOURCE_ONLY` until owning trust is bound.
//! The body carries an ORIGINAL normalized PM intent, never grants, identity,
//! a target URL, source pins or CLI. Portal intent hashes are NOT PM digests.
//! Authentication/current-authority composition supplies scope and providers;
//! this module is not an authentication bypass or an enabled HTTP listener.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use command_relay::{
    authority::{AuthorityProvider, RecoveryProvider},
    durable::{CommandIntent, CommandScope},
    pm_source::PmOutcome,
};
use projection_store_pg::{
    command::{CommandPort, CommandRecord, DurableCommandRelay, RelayError},
    command_pm::OriginalPmBinding,
};
use serde::Deserialize;
use serde_json::Value;

const SCHEMA: &str = "execution.core-pm-original.v1";
const MAX_BODY: usize = 32_768;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HumanAction {
    Submit,
    Status,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Wire {
    schema_version: String,
    action: HumanAction,
    key: String,
    operation: String,
    payload: Value,
    payload_digest: String,
    request_digest: String,
}

/// Decoded structure only; no Deserialize of trusted scope or permission facts.
pub struct OriginalCall {
    pub action: HumanAction,
    pub intent: CommandIntent,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
#[error("CORE_COMMAND_ORIGINAL_INVALID")]
pub struct InvalidOriginal;

/// Exact original scope must come from authenticated owning custody, not a
/// current profile lookup or the status requester's identity. No send occurs.
/// # Errors
/// Rejects extra/duplicate fields, unbounded bodies and normalized digest drift.
pub fn decode_original(
    scope: CommandScope,
    raw: &[u8],
    limit: usize,
) -> Result<OriginalCall, InvalidOriginal> {
    if limit == 0 || limit > MAX_BODY || raw.is_empty() || raw.len() > limit {
        return Err(InvalidOriginal);
    }
    let unique: UniqueJson = serde_json::from_slice(raw).map_err(|_| InvalidOriginal)?;
    let wire: Wire = serde_json::from_value(unique.0).map_err(|_| InvalidOriginal)?;
    if wire.schema_version != SCHEMA {
        return Err(InvalidOriginal);
    }
    let intent = CommandIntent::new(
        scope,
        &wire.key,
        &wire.operation,
        wire.payload,
        &wire.payload_digest,
    )
    .map_err(|_| InvalidOriginal)?;
    if intent.request_digest() != wire.request_digest {
        return Err(InvalidOriginal);
    }
    Ok(OriginalCall {
        action: wire.action,
        intent,
    })
}

/// Private internal result; the Core HTTP codec must preserve the complete
/// owning outcome, not infer APPLIED from delivery or drop source correlation.
pub struct GatewayResult {
    pub record: CommandRecord,
    pub outcome: Option<PmOutcome>,
}

/// Callable HTTP composition for a server-authenticated ORIGINAL. The mounting
/// middleware supplies scope/current provider; read assertions or body fields
/// cannot call this on their own. This does not install a route or enable sends.
pub async fn handle_human<A: AuthorityProvider, P: CommandPort>(
    scope: CommandScope,
    raw: &[u8],
    limit: usize,
    relay: &DurableCommandRelay<A, P>,
    original: Option<&OriginalPmBinding>,
) -> Response {
    let result = match decode_original(scope, raw, limit) {
        Err(_) => return safe_error(StatusCode::BAD_REQUEST, "ORIGINAL_INVALID"),
        Ok(call) => execute_human(&call, relay, original)
            .await
            .and_then(|result| encode_result(&call.intent, &result)),
    };
    match result {
        Ok(value) => private_response(StatusCode::OK, value),
        Err(error) => {
            use projection_store_pg::command::CommandStoreError;
            let (status, code) = match error {
                RelayError::Authority(_) => (StatusCode::FORBIDDEN, "ACCESS_DENIED"),
                RelayError::Store(CommandStoreError::NotFound) => {
                    (StatusCode::NOT_FOUND, "ORIGINAL_UNAVAILABLE")
                }
                RelayError::Store(CommandStoreError::Conflict) => {
                    (StatusCode::CONFLICT, "IDEMPOTENCY_CONFLICT")
                }
                RelayError::Disabled => (StatusCode::SERVICE_UNAVAILABLE, "SUBMIT_DISABLED"),
                _ => (StatusCode::SERVICE_UNAVAILABLE, "OUTCOME_UNAVAILABLE"),
            };
            safe_error(status, code)
        }
    }
}

/// Versioned lossless Core result; source presentation is preserved except that
/// version counters are explicitly encoded as strings before any JS parse.
/// Local delivery is not financial effect and no projection progress is inferred.
fn encode_result(intent: &CommandIntent, result: &GatewayResult) -> Result<Value, RelayError> {
    use projection_store_pg::command::CommandStoreError;
    let invalid = || RelayError::Store(CommandStoreError::Fence);
    if result.record.intent != *intent
        || !matches!(
            result.record.delivery.as_str(),
            "PREPARED" | "SENDING" | "ACKNOWLEDGED" | "DELIVERY_UNKNOWN" | "FAILED_BEFORE_SEND"
        )
        || result.outcome.as_ref().map(|o| &o.receipt) != result.record.receipt.as_ref()
    {
        return Err(invalid());
    }
    let outcome = result.outcome.as_ref().map(|source| {
        source.receipt.verify_for(intent).map_err(|_| invalid())?;
        let mut presentation = source.receipt.payload().clone();
        let versions = presentation.get_mut("current_versions")
            .and_then(Value::as_object_mut).ok_or_else(invalid)?;
        for version in versions.values_mut() {
            *version = Value::String(version.as_i64().ok_or_else(invalid)?.to_string());
        }
        Ok::<_, RelayError>(serde_json::json!({
            "authority_receipt": source.authority_receipt,
            "source_intent_digest": source.source_intent_digest,
            "source_key": [intent.scope().authority_scope_id(), intent.operation(), intent.key()],
            "target_ref": source.target_ref,
            "source_revision": source.receipt.revision().to_string(),
            "presentation": presentation,
        }))
    }).transpose()?;
    let receipt = result.record.receipt.as_ref();
    let value = serde_json::json!({
        "schema_version": "execution.core-pm-result.v1",
        "command_id": result.record.command_id.to_string(),
        "request_digest": intent.request_digest(), "payload_digest": intent.digest(),
        "delivery_state": result.record.delivery,
        "business_state": receipt.map(|r| r.state().as_str()),
        "terminal": receipt.map(command_relay::durable::AuthorityReceipt::is_terminal),
        "projection_state": "UNAVAILABLE", "projection_applied_checkpoint": null,
        "outcome": outcome,
    });
    if serde_json::to_vec(&value).map_err(|_| invalid())?.len()
        > command_relay::durable::MAX_RECEIPT_BYTES + 16_384
    {
        return Err(invalid());
    }
    Ok(value)
}

fn private_response(status: StatusCode, value: Value) -> Response {
    let mut response = (status, Json(value)).into_response();
    response
        .headers_mut()
        .insert("cache-control", "no-store".parse().expect("static header"));
    response
}

fn safe_error(status: StatusCode, code: &str) -> Response {
    private_response(
        status,
        serde_json::json!({
            "schema_version": "execution.core-pm-result.v1",
            "error": { "code": code, "retryable": false, "next_action": "QUERY_SAME_INTENT" },
        }),
    )
}

/// Reuse the existing durable ledger, PM custody and no-retry relay. The same
/// request-scoped authority provider is installed in the relay. Source pins
/// are resolved by the trusted owner, never by the body.
/// # Errors
/// Current authority, custody and source failures fail closed. No new intent is
/// prepared without current submit permission; status never prepares or sends.
pub async fn execute_human<A: AuthorityProvider, P: CommandPort>(
    call: &OriginalCall,
    relay: &DurableCommandRelay<A, P>,
    original: Option<&OriginalPmBinding>,
) -> Result<GatewayResult, RelayError> {
    let intent = &call.intent;
    let record = match call.action {
        HumanAction::Submit => relay.submit_pm(intent, original).await?,
        HumanAction::Status => relay.status(intent, true).await?,
    };
    let outcome = relay.pm_outcome(intent).await?;
    // Any await after the relay's check requires a new human disclosure check.
    // Native PM authorization/fences through COMMIT remain source-owned.
    if record.receipt.is_some() && outcome.as_ref().map(|o| &o.receipt) != record.receipt.as_ref() {
        // Missing or concurrently changed full custody cannot become a reduced
        // known outcome. The caller must query the same retained original.
        return Err(projection_store_pg::command::CommandStoreError::Fence.into());
    }
    Ok(GatewayResult { record, outcome })
}

/// Not reachable through `HumanAction` or a body flag. Returns no receipt/data.
/// A successful return with an unsupported source transport is NOT settlement.
/// # Errors
/// Requires the separately authenticated, current service recovery provider.
pub async fn recover_service<A: AuthorityProvider, P: CommandPort>(
    relay: &DurableCommandRelay<A, P>,
    original: &CommandIntent,
    service: &impl RecoveryProvider,
) -> Result<(), RelayError> {
    relay.recover(original, service).await
}

// Mechanically follows the existing report-publication unique-JSON visitor:
// reject ambiguity recursively before Value/typed decoding can discard keys.
struct UniqueJson(Value);
impl<'de> Deserialize<'de> for UniqueJson {
    fn deserialize<D: serde::Deserializer<'de>>(input: D) -> Result<Self, D::Error> {
        struct Unique;
        impl<'de> serde::de::Visitor<'de> for Unique {
            type Value = UniqueJson;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("unique-key JSON")
            }
            fn visit_bool<E: serde::de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }
            fn visit_i64<E: serde::de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }
            fn visit_u64<E: serde::de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }
            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<Self::Value, E> {
                serde_json::Number::from_f64(v)
                    .map(|n| UniqueJson(Value::Number(n)))
                    .ok_or_else(|| E::custom("invalid JSON number"))
            }
            fn visit_str<E: serde::de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(UniqueJson(v.into()))
            }
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueJson(Value::Null))
            }
            fn visit_seq<S: serde::de::SeqAccess<'de>>(
                self,
                mut input: S,
            ) -> Result<Self::Value, S::Error> {
                let mut out = Vec::new();
                while let Some(v) = input.next_element::<UniqueJson>()? {
                    out.push(v.0);
                }
                Ok(UniqueJson(Value::Array(out)))
            }
            fn visit_map<M: serde::de::MapAccess<'de>>(
                self,
                mut input: M,
            ) -> Result<Self::Value, M::Error> {
                let mut out = serde_json::Map::new();
                while let Some((k, v)) = input.next_entry::<String, UniqueJson>()? {
                    if out.insert(k, v.0).is_some() {
                        return Err(serde::de::Error::custom("duplicate JSON key"));
                    }
                }
                Ok(UniqueJson(Value::Object(out)))
            }
        }
        input.deserialize_any(Unique)
    }
}

#[cfg(test)]
mod tests;
