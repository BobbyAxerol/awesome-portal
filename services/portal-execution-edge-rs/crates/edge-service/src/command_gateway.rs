//! Private Core ingress composition, `SOURCE_ONLY` until owning trust is bound.
//! The body carries an ORIGINAL normalized PM intent, never grants, identity,
//! a target URL, source pins or CLI. Portal intent hashes are NOT PM digests.
//! Authentication/current-authority composition supplies scope and providers;
//! this module is not an authentication bypass or an enabled HTTP listener.

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
