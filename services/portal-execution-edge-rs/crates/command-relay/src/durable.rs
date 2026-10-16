//! Pure internal values for the durable command boundary.
//!
//! Constructors check binding and structural integrity, not authorization.
//! They neither issue a signed envelope nor grant business authority. The
//! transport must authenticate its human/workload chain and the source must
//! recheck current policy and versions at commit. Original PM JSON is retained.

use std::cmp::Ordering;

use projection_core::canonical_digest;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use thiserror::Error;

pub const MAX_BUSINESS_BYTES: usize = 65_536;
pub const MAX_RECEIPT_BYTES: usize = 1024 * 1024;
const MAX_TEXT_BYTES: usize = 512;
const MAX_DECIMAL_BYTES: usize = 128;
const INTENT_VERSION: &str = "execution.internal-command-intent.v1";

/// Tenant, target and actual actors, supplied by the trusted admission layer.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct CommandScope {
    workspace_id: String,
    environment: String,
    profile_id: String,
    authority_scope_id: String,
    actor_id: String,
    workload_id: String,
}

impl CommandScope {
    /// Constructs a bounded scope without asserting that it is authorized.
    ///
    /// # Errors
    /// Returns an error for malformed identifiers or a noncanonical mode.
    pub fn new(
        workspace_id: &str,
        environment: &str,
        profile_id: &str,
        authority_scope_id: &str,
        actor_id: &str,
        workload_id: &str,
    ) -> Result<Self, DurableError> {
        for value in [
            workspace_id,
            profile_id,
            authority_scope_id,
            actor_id,
            workload_id,
        ] {
            text(value)?;
        }
        if !matches!(environment, "paper" | "sandbox" | "live") {
            return Err(DurableError::InvalidScope);
        }
        Ok(Self {
            workspace_id: workspace_id.to_owned(),
            environment: environment.to_owned(),
            profile_id: profile_id.to_owned(),
            authority_scope_id: authority_scope_id.to_owned(),
            actor_id: actor_id.to_owned(),
            workload_id: workload_id.to_owned(),
        })
    }

    #[must_use]
    pub fn workspace_id(&self) -> &str {
        &self.workspace_id
    }
    #[must_use]
    pub fn environment(&self) -> &str {
        &self.environment
    }
    #[must_use]
    pub fn profile_id(&self) -> &str {
        &self.profile_id
    }
    #[must_use]
    pub fn authority_scope_id(&self) -> &str {
        &self.authority_scope_id
    }
    #[must_use]
    pub fn actor_id(&self) -> &str {
        &self.actor_id
    }
    #[must_use]
    pub fn workload_id(&self) -> &str {
        &self.workload_id
    }
}

/// Immutable original business payload plus canonical scoped correlation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommandIntent {
    scope: CommandScope,
    key: String,
    operation: String,
    payload: Value,
    digest: String,
    request_digest: String,
}

impl CommandIntent {
    /// Validates the eight published PM candidate shapes without changing JSON.
    ///
    /// # Errors
    /// Rejects malformed, oversized, unsupported or incorrectly bound payloads.
    pub fn new(
        scope: CommandScope,
        key: &str,
        operation: &str,
        payload: Value,
        expected_payload_digest: &str,
    ) -> Result<Self, DurableError> {
        text(key)?;
        bounded_json(&payload, MAX_BUSINESS_BYTES)?;
        validate_pm_payload(&payload, key, operation)?;
        let digest = canonical_digest(&payload).map_err(|_| DurableError::InvalidPayload)?;
        if digest != expected_payload_digest {
            return Err(DurableError::DigestMismatch);
        }
        let request_digest = canonical_digest(&serde_json::json!({
            "schema_version": INTENT_VERSION,
            "scope": scope,
            "key": key,
            "operation": operation,
            "payload": payload,
        }))
        .map_err(|_| DurableError::InvalidPayload)?;
        Ok(Self {
            scope,
            key: key.to_owned(),
            operation: operation.to_owned(),
            payload,
            digest,
            request_digest,
        })
    }

    #[must_use]
    pub fn scope(&self) -> &CommandScope {
        &self.scope
    }
    #[must_use]
    pub fn key(&self) -> &str {
        &self.key
    }
    #[must_use]
    pub fn operation(&self) -> &str {
        &self.operation
    }
    #[must_use]
    pub fn payload(&self) -> &Value {
        &self.payload
    }
    #[must_use]
    pub fn digest(&self) -> &str {
        &self.digest
    }
    #[must_use]
    pub fn request_digest(&self) -> &str {
        &self.request_digest
    }
}

/// Transport progress only: an ACK never means money was applied.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DeliveryState {
    Prepared,
    Sending,
    Acknowledged,
    DeliveryUnknown,
    FailedBeforeSend,
}

impl DeliveryState {
    /// Checks an internal delivery transition. Unknown permits status recovery,
    /// never a new send; only a never-dispatched prepared intent may dispatch.
    ///
    /// # Errors
    /// Rejects regressions and ambiguous mutation retries.
    pub fn transition(self, next: Self) -> Result<Self, DurableError> {
        if self == next
            || matches!(
                (self, next),
                (Self::Prepared, Self::Sending | Self::FailedBeforeSend)
                    | (Self::Sending, Self::Acknowledged | Self::DeliveryUnknown)
                    | (Self::DeliveryUnknown, Self::Acknowledged)
            )
        {
            Ok(next)
        } else {
            Err(DurableError::InvalidDeliveryTransition)
        }
    }

    #[must_use]
    pub fn automatic_retry_allowed(self) -> bool {
        self == Self::Prepared
    }
}

/// Exact PM disposition, independent of transport and projection states.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BusinessState {
    Rejected,
    Applied,
    PartiallyApplied,
    WaitingEncumbrance,
    Cancelled,
    PartiallyAppliedCancelled,
}

impl BusinessState {
    /// Parses only the six authoritative PM capital dispositions.
    ///
    /// # Errors
    /// Rejects transport ACK, projection and unresolved states.
    pub fn parse(value: &str) -> Result<Self, DurableError> {
        match value {
            "REJECTED" => Ok(Self::Rejected),
            "APPLIED" => Ok(Self::Applied),
            "PARTIALLY_APPLIED" => Ok(Self::PartiallyApplied),
            "WAITING_ENCUMBRANCE" => Ok(Self::WaitingEncumbrance),
            "CANCELLED" => Ok(Self::Cancelled),
            "PARTIALLY_APPLIED_CANCELLED" => Ok(Self::PartiallyAppliedCancelled),
            _ => Err(DurableError::InvalidReceipt),
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Rejected => "REJECTED",
            Self::Applied => "APPLIED",
            Self::PartiallyApplied => "PARTIALLY_APPLIED",
            Self::WaitingEncumbrance => "WAITING_ENCUMBRANCE",
            Self::Cancelled => "CANCELLED",
            Self::PartiallyAppliedCancelled => "PARTIALLY_APPLIED_CANCELLED",
        }
    }
}

/// A full `operator_api_contract.present_outcome` result from a trusted port.
///
/// The native trusted adapter must first bind its `Outcome` key, digest and
/// target as required by `present_outcome`. Those fields are not invented in
/// this JSON: the presentation intentionally does not contain them. This local
/// wrapper records the validated intent and source revision independently.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AuthorityReceipt {
    source_ref: String,
    revision: i64,
    state: BusinessState,
    payload: Value,
    intent_digest: String,
    amounts: AmountPartition,
}

impl AuthorityReceipt {
    /// Checks a bound, complete PM presentation without discarding its fields.
    /// This function is not authentication of the source adapter.
    ///
    /// # Errors
    /// Rejects malformed presentations, revisions, state or amount partitions.
    pub fn new(
        intent: &CommandIntent,
        source_ref: &str,
        revision: i64,
        state: BusinessState,
        payload: Value,
    ) -> Result<Self, DurableError> {
        text(source_ref)?;
        bounded_json(&payload, MAX_RECEIPT_BYTES)?;
        if revision < 0 {
            return Err(DurableError::InvalidReceipt);
        }
        let amounts = validate_receipt(intent, source_ref, state, &payload)?;
        Ok(Self {
            source_ref: source_ref.to_owned(),
            revision,
            state,
            payload,
            intent_digest: intent.request_digest().to_owned(),
            amounts,
        })
    }

    #[must_use]
    pub fn source_ref(&self) -> &str {
        &self.source_ref
    }
    #[must_use]
    pub fn revision(&self) -> i64 {
        self.revision
    }
    #[must_use]
    pub fn state(&self) -> BusinessState {
        self.state
    }
    #[must_use]
    pub fn payload(&self) -> &Value {
        &self.payload
    }
    #[must_use]
    pub fn intent_digest(&self) -> &str {
        &self.intent_digest
    }
    #[must_use]
    pub fn is_terminal(&self) -> bool {
        self.amounts.pending.is_zero()
    }

    /// Confirms the trusted adapter's receipt is being attached to its intent.
    ///
    /// # Errors
    /// Returns an error for any different scoped request, including its actors.
    pub fn verify_for(&self, intent: &CommandIntent) -> Result<(), DurableError> {
        if self.intent_digest == intent.request_digest() {
            Ok(())
        } else {
            Err(DurableError::BindingMismatch)
        }
    }

    /// Preserves original requested/applied/cancelled amounts across replay.
    ///
    /// # Errors
    /// Rejects another command/source, revision conflicts or decreasing progress.
    pub fn validate_progress(&self, previous: &Self) -> Result<(), DurableError> {
        if self.intent_digest != previous.intent_digest
            || self.source_ref != previous.source_ref
            || self.payload["command_id"] != previous.payload["command_id"]
            || self.payload["currency"] != previous.payload["currency"]
            || self.revision < previous.revision
            || (self.revision == previous.revision && self.payload != previous.payload)
            || (previous.is_terminal() && self.state != previous.state)
            || self.amounts.requested.compare(&previous.amounts.requested) != Ordering::Equal
            || self.amounts.applied.compare(&previous.amounts.applied) == Ordering::Less
            || self.amounts.cancelled.compare(&previous.amounts.cancelled) == Ordering::Less
            || self.amounts.rejected.compare(&previous.amounts.rejected) == Ordering::Less
            || self.amounts.pending.compare(&previous.amounts.pending) == Ordering::Greater
        {
            return Err(DurableError::ProgressRegression);
        }
        let versions = previous.payload["current_versions"]
            .as_object()
            .ok_or(DurableError::ProgressRegression)?;
        for (name, old) in versions {
            let old = old.as_i64().ok_or(DurableError::ProgressRegression)?;
            let current = self.payload["current_versions"]
                .get(name)
                .and_then(Value::as_i64)
                .ok_or(DurableError::ProgressRegression)?;
            if current < old {
                return Err(DurableError::ProgressRegression);
            }
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct AmountPartition {
    requested: DecimalAmount,
    applied: DecimalAmount,
    pending: DecimalAmount,
    cancelled: DecimalAmount,
    rejected: DecimalAmount,
}

impl AmountPartition {
    fn from_value(value: &Value) -> Result<Self, DurableError> {
        let object = value.as_object().ok_or(DurableError::InvalidPartition)?;
        if object.len() != 5 {
            return Err(DurableError::InvalidPartition);
        }
        let result = Self {
            requested: DecimalAmount::parse(string_field(object, "requested")?)?,
            applied: DecimalAmount::parse(string_field(object, "applied")?)?,
            pending: DecimalAmount::parse(string_field(object, "pending")?)?,
            cancelled: DecimalAmount::parse(string_field(object, "cancelled")?)?,
            rejected: DecimalAmount::parse(string_field(object, "rejected")?)?,
        };
        let total = DecimalAmount::sum(&[
            &result.applied,
            &result.pending,
            &result.cancelled,
            &result.rejected,
        ]);
        if total.compare(&result.requested) != Ordering::Equal {
            return Err(DurableError::InvalidPartition);
        }
        Ok(result)
    }

    fn matches(&self, state: BusinessState) -> bool {
        let a = self.applied.is_zero();
        let p = self.pending.is_zero();
        let c = self.cancelled.is_zero();
        let r = self.rejected.is_zero();
        match state {
            BusinessState::Applied => p && c && r,
            BusinessState::Rejected => a && p && c,
            // PM permits an already partially released waiting receipt, too.
            BusinessState::WaitingEncumbrance => !p && c && r,
            BusinessState::PartiallyApplied => !a && !p && c && r,
            BusinessState::Cancelled => a && p && r,
            BusinessState::PartiallyAppliedCancelled => !a && p && !c && r,
        }
    }
}

fn validate_receipt(
    intent: &CommandIntent,
    source_ref: &str,
    state: BusinessState,
    payload: &Value,
) -> Result<AmountPartition, DurableError> {
    const FIELDS: [&str; 15] = [
        "command_id",
        "state",
        "amounts",
        "currency",
        "parent_receipt",
        "blockers",
        "before_ref",
        "after_ref",
        "source_ref",
        "policy_ref",
        "binding_ref",
        "current_versions",
        "physical_transfer_performed",
        "cli_exit_code",
        "next_action",
    ];
    let object = payload.as_object().ok_or(DurableError::InvalidReceipt)?;
    if object.len() != FIELDS.len() || object.keys().any(|field| !FIELDS.contains(&field.as_str()))
    {
        return Err(DurableError::InvalidReceipt);
    }
    if string_field(object, "state")? != state.as_str()
        || string_field(object, "source_ref")? != source_ref
        || payload["currency"] != intent.payload()["currency"]
        || payload["physical_transfer_performed"] != Value::Bool(false)
    {
        return Err(DurableError::BindingMismatch);
    }
    for field in [
        "command_id",
        "currency",
        "before_ref",
        "after_ref",
        "source_ref",
        "policy_ref",
        "binding_ref",
    ] {
        text(string_field(object, field)?)?;
    }
    let amounts = AmountPartition::from_value(&payload["amounts"])?;
    if !amounts.matches(state) {
        return Err(DurableError::InvalidPartition);
    }
    if let Some(value) = intent.payload().get("amount").and_then(Value::as_str) {
        if amounts.requested.compare(&DecimalAmount::parse(value)?) != Ordering::Equal {
            return Err(DurableError::BindingMismatch);
        }
    }
    match object.get("parent_receipt") {
        Some(Value::String(value)) => text(value)?,
        Some(Value::Null)
            if amounts.applied.is_zero() || intent.operation() == "SET_ROOT_LIMIT" => {}
        _ => return Err(DurableError::InvalidReceipt),
    }
    let blockers = payload["blockers"]
        .as_array()
        .ok_or(DurableError::InvalidReceipt)?;
    if blockers.len() > 128 {
        return Err(DurableError::InvalidReceipt);
    }
    for blocker in blockers {
        text(blocker.as_str().ok_or(DurableError::InvalidReceipt)?)?;
    }
    let versions = payload["current_versions"]
        .as_object()
        .ok_or(DurableError::InvalidReceipt)?;
    if versions.is_empty() || versions.len() > 32 {
        return Err(DurableError::InvalidReceipt);
    }
    for (name, value) in versions {
        text(name)?;
        if value.as_i64().is_none_or(|version| version < 0) {
            return Err(DurableError::InvalidReceipt);
        }
    }
    let pending = !amounts.pending.is_zero();
    let exit_code = if pending {
        3
    } else if state == BusinessState::Applied {
        0
    } else {
        2
    };
    let action = if pending {
        "QUERY_SAME_INTENT"
    } else {
        "REVIEW_RECEIPT"
    };
    if payload["cli_exit_code"].as_i64() != Some(exit_code)
        || payload["next_action"].as_str() != Some(action)
    {
        return Err(DurableError::InvalidReceipt);
    }
    Ok(amounts)
}

#[derive(Clone, Debug, Error, Eq, PartialEq)]
pub enum DurableError {
    #[error("invalid command scope")]
    InvalidScope,
    #[error("invalid bounded text")]
    InvalidText,
    #[error("invalid PM payload")]
    InvalidPayload,
    #[error("unsupported operation")]
    UnsupportedOperation,
    #[error("payload exceeds bound")]
    BodyTooLarge,
    #[error("command binding mismatch")]
    BindingMismatch,
    #[error("canonical payload digest mismatch")]
    DigestMismatch,
    #[error("invalid delivery transition")]
    InvalidDeliveryTransition,
    #[error("invalid authoritative receipt")]
    InvalidReceipt,
    #[error("invalid exact decimal amount")]
    InvalidAmount,
    #[error("invalid amount partition")]
    InvalidPartition,
    #[error("authoritative progress regressed or conflicted")]
    ProgressRegression,
}

fn text(value: &str) -> Result<(), DurableError> {
    if value.is_empty()
        || value.len() > MAX_TEXT_BYTES
        || value.trim() != value
        || value.chars().any(|ch| ch <= '\u{001f}' || ch == '\u{007f}')
    {
        Err(DurableError::InvalidText)
    } else {
        Ok(())
    }
}

fn bounded_json(value: &Value, maximum: usize) -> Result<(), DurableError> {
    if serde_json::to_vec(value)
        .map_err(|_| DurableError::InvalidPayload)?
        .len()
        > maximum
    {
        Err(DurableError::BodyTooLarge)
    } else {
        Ok(())
    }
}

fn string_field<'a>(object: &'a Map<String, Value>, key: &str) -> Result<&'a str, DurableError> {
    object
        .get(key)
        .and_then(Value::as_str)
        .ok_or(DurableError::InvalidPayload)
}

// Structural mirror of the pinned foundation PmaCandidateCapitalCommand.
// Policy, capacity, economic effects and target/version authority stay at TS.
fn validate_pm_payload(payload: &Value, key: &str, operation: &str) -> Result<(), DurableError> {
    let object = payload.as_object().ok_or(DurableError::InvalidPayload)?;
    if string_field(object, "schema_version")? != "pma.capital-command.v1.1" {
        return Err(DurableError::InvalidPayload);
    }
    if string_field(object, "operation")? != operation
        || string_field(object, "idempotency_key")? != key
    {
        return Err(DurableError::BindingMismatch);
    }
    let version_keys: &[&str] = match operation {
        "FUND" => &["budget", "source", "claim"],
        "INITIAL_GRANT" | "TOP_UP" => &["budget", "source", "parent"],
        "IMMEDIATE_DECREASE" | "RECALL_PARTIAL" | "RECALL_FULL" | "ADJUST_TARGET_BUDGET" => {
            &["budget", "source", "parent", "book"]
        }
        "SET_ROOT_LIMIT" => &["budget", "source"],
        _ => return Err(DurableError::UnsupportedOperation),
    };
    let mut fields = vec![
        "schema_version",
        "operation",
        "idempotency_key",
        "recipient_kind",
        "currency",
        "expected_versions",
        "reason",
    ];
    let recipient = string_field(object, "recipient_kind")?;
    match (operation, recipient) {
        ("SET_ROOT_LIMIT", "ROOT") => {}
        ("SET_ROOT_LIMIT", _) | (_, "ROOT") => return Err(DurableError::InvalidPayload),
        (_, "DEPLOYMENT_ACCOUNT") => {
            fields.extend(["recipient_account_id", "recipient_deployment_id"]);
        }
        (_, "PORTFOLIO") => {}
        _ => return Err(DurableError::InvalidPayload),
    }
    let amount_field = match operation {
        "RECALL_FULL" => None,
        "ADJUST_TARGET_BUDGET" => Some("target_budget"),
        "SET_ROOT_LIMIT" => Some("target_root_limit"),
        _ => Some("amount"),
    };
    if let Some(field) = amount_field {
        fields.push(field);
    }
    if operation == "FUND" {
        fields.push("source_ref");
    }
    if object.len() != fields.len() || object.keys().any(|field| !fields.contains(&field.as_str()))
    {
        return Err(DurableError::InvalidPayload);
    }
    for field in &fields {
        if *field != "expected_versions" {
            text(string_field(object, field)?)?;
        }
    }
    if let Some(field) = amount_field {
        let amount = DecimalAmount::parse(string_field(object, field)?)?;
        if field == "amount" && amount.is_zero() {
            return Err(DurableError::InvalidAmount);
        }
    }
    let versions = object
        .get("expected_versions")
        .and_then(Value::as_object)
        .ok_or(DurableError::InvalidPayload)?;
    if versions.len() != version_keys.len()
        || versions
            .keys()
            .any(|field| !version_keys.contains(&field.as_str()))
    {
        return Err(DurableError::InvalidPayload);
    }
    for value in versions.values() {
        let counter = value.as_str().ok_or(DurableError::InvalidPayload)?;
        if counter.is_empty()
            || !counter.bytes().all(|byte| byte.is_ascii_digit())
            || (counter.len() > 1 && counter.starts_with('0'))
            || counter.parse::<i64>().is_err()
        {
            return Err(DurableError::InvalidPayload);
        }
    }
    Ok(())
}

/// Bounded exact, nonnegative decimal arithmetic; never an IEEE-754 value.
#[derive(Clone, Debug, Eq, PartialEq)]
struct DecimalAmount {
    // Little-endian decimal coefficient, retaining a single digit for zero.
    digits: Vec<u8>,
    scale: usize,
}

impl DecimalAmount {
    fn parse(value: &str) -> Result<Self, DurableError> {
        if value.is_empty() || value.len() > MAX_DECIMAL_BYTES {
            return Err(DurableError::InvalidAmount);
        }
        let (whole, fraction) = value
            .split_once('.')
            .map_or((value, None), |(whole, fraction)| (whole, Some(fraction)));
        if whole.is_empty()
            || !whole.bytes().all(|byte| byte.is_ascii_digit())
            || (whole.len() > 1 && whole.starts_with('0'))
            || fraction.is_some_and(|part| {
                part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit())
            })
        {
            return Err(DurableError::InvalidAmount);
        }
        let fraction = fraction.unwrap_or("").trim_end_matches('0');
        let mut digits = whole
            .bytes()
            .chain(fraction.bytes())
            .map(|byte| byte - b'0')
            .rev()
            .collect::<Vec<_>>();
        while digits.len() > 1 && digits.last() == Some(&0) {
            digits.pop();
        }
        Ok(Self {
            digits,
            scale: fraction.len(),
        })
    }

    fn is_zero(&self) -> bool {
        self.digits.iter().all(|digit| *digit == 0)
    }

    fn scaled(&self, scale: usize) -> Vec<u8> {
        let mut digits = vec![0; scale - self.scale];
        digits.extend_from_slice(&self.digits);
        digits
    }

    fn compare(&self, other: &Self) -> Ordering {
        let scale = self.scale.max(other.scale);
        let mut left = self.scaled(scale);
        let mut right = other.scaled(scale);
        let length = left.len().max(right.len());
        left.resize(length, 0);
        right.resize(length, 0);
        left.iter().rev().cmp(right.iter().rev())
    }

    fn sum(values: &[&Self]) -> Self {
        let scale = values.iter().map(|value| value.scale).max().unwrap_or(0);
        let mut digits = vec![0];
        for value in values {
            let incoming = value.scaled(scale);
            digits.resize(digits.len().max(incoming.len()) + 1, 0);
            let mut carry = 0;
            for (index, digit) in digits.iter_mut().enumerate() {
                let total = *digit + incoming.get(index).copied().unwrap_or(0) + carry;
                *digit = total % 10;
                carry = total / 10;
            }
        }
        while digits.len() > 1 && digits.last() == Some(&0) {
            digits.pop();
        }
        Self { digits, scale }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scope() -> CommandScope {
        CommandScope::new(
            "TEST_ONLY-workspace",
            "paper",
            "TEST_ONLY-profile",
            "TEST_ONLY-authority",
            "TEST_ONLY-human",
            "TEST_ONLY-workload",
        )
        .unwrap()
    }

    fn payload(operation: &str) -> Value {
        let versions = match operation {
            "FUND" => json!({"budget":"0", "source":"0", "claim":"0"}),
            "INITIAL_GRANT" | "TOP_UP" => json!({"budget":"0", "source":"0", "parent":"0"}),
            "SET_ROOT_LIMIT" => json!({"budget":"0", "source":"0"}),
            _ => json!({"budget":"0", "source":"0", "parent":"0", "book":"0"}),
        };
        let mut value = json!({
            "schema_version":"pma.capital-command.v1.1", "operation":operation,
            "idempotency_key":"TEST_ONLY-key", "recipient_kind":"PORTFOLIO",
            "currency":"USD", "expected_versions":versions, "reason":"TEST_ONLY-not-submitted",
        });
        match operation {
            "RECALL_FULL" => {}
            "ADJUST_TARGET_BUDGET" => value["target_budget"] = json!("0.00"),
            "SET_ROOT_LIMIT" => {
                value["recipient_kind"] = json!("ROOT");
                value["target_root_limit"] = json!("0");
            }
            _ => value["amount"] = json!("10.00"),
        }
        if operation == "FUND" {
            value["source_ref"] = json!("TEST_ONLY-capital-source");
        }
        value
    }

    fn intent_from(value: Value) -> Result<CommandIntent, DurableError> {
        let key = value["idempotency_key"].as_str().unwrap().to_owned();
        let operation = value["operation"].as_str().unwrap().to_owned();
        let digest = canonical_digest(&value).unwrap();
        CommandIntent::new(scope(), &key, &operation, value, &digest)
    }

    fn intent() -> CommandIntent {
        intent_from(payload("RECALL_PARTIAL")).unwrap()
    }

    fn presentation(
        state: BusinessState,
        applied: &str,
        pending: &str,
        cancelled: &str,
        rejected: &str,
    ) -> Value {
        let is_pending = !DecimalAmount::parse(pending).unwrap().is_zero();
        json!({
            "command_id":"TEST_ONLY-command", "state":state.as_str(),
            "amounts":{"requested":"10.00", "applied":applied, "pending":pending, "cancelled":cancelled, "rejected":rejected},
            "currency":"USD", "parent_receipt":"TEST_ONLY-parent-receipt", "blockers":[],
            "before_ref":"TEST_ONLY-before", "after_ref":"TEST_ONLY-after", "source_ref":"TEST_ONLY-source",
            "policy_ref":"TEST_ONLY-policy", "binding_ref":"TEST_ONLY-binding", "current_versions":{"budget":1},
            "physical_transfer_performed":false,
            "cli_exit_code":if is_pending {3} else if state == BusinessState::Applied {0} else {2},
            "next_action":if is_pending {"QUERY_SAME_INTENT"} else {"REVIEW_RECEIPT"},
        })
    }

    fn receipt(
        revision: i64,
        state: BusinessState,
        value: Value,
    ) -> Result<AuthorityReceipt, DurableError> {
        AuthorityReceipt::new(&intent(), "TEST_ONLY-source", revision, state, value)
    }

    #[test]
    fn canonical_digest_and_original_json_are_preserved() {
        let value = payload("TOP_UP");
        let command = intent_from(value.clone()).unwrap();
        assert_eq!(command.payload(), &value);
        assert_eq!(command.digest(), canonical_digest(&value).unwrap());
        assert_eq!(command, intent_from(value).unwrap());
        assert_eq!(command.payload()["amount"], "10.00");
    }

    #[test]
    fn shared_pm_fixture_is_accepted_without_rewriting_precision() {
        let fixture: Value = serde_json::from_str(include_str!("../../../contracts/execution-catalogue-v1/shared/execution-v2-foundation.synthetic.valid.json")).unwrap();
        let mut count = 0;
        for case in fixture["cases"].as_array().unwrap() {
            for fact in case["facts"].as_array().unwrap() {
                if fact["type"] == "PmaCapitalCommand" && fact["valid"] == true {
                    let command = intent_from(fact["value"].clone()).unwrap();
                    assert_eq!(command.payload(), &fact["value"]);
                    count += 1;
                }
            }
        }
        assert_eq!(count, 2);
    }

    #[test]
    fn eight_candidate_operations_and_exact_recipient_pairs() {
        for operation in [
            "FUND",
            "INITIAL_GRANT",
            "TOP_UP",
            "IMMEDIATE_DECREASE",
            "RECALL_PARTIAL",
            "RECALL_FULL",
            "ADJUST_TARGET_BUDGET",
            "SET_ROOT_LIMIT",
        ] {
            let value = payload(operation);
            assert!(intent_from(value.clone()).is_ok(), "{operation}");
            if operation != "SET_ROOT_LIMIT" {
                let mut account = value;
                account["recipient_kind"] = json!("DEPLOYMENT_ACCOUNT");
                account["recipient_account_id"] = json!("TEST_ONLY-account");
                account["recipient_deployment_id"] = json!("TEST_ONLY-deployment");
                assert!(intent_from(account.clone()).is_ok());
                account
                    .as_object_mut()
                    .unwrap()
                    .remove("recipient_deployment_id");
                assert!(intent_from(account).is_err());
            }
        }
    }

    #[test]
    fn same_key_different_payload_changes_both_digests() {
        let a = intent_from(payload("TOP_UP")).unwrap();
        let mut value = payload("TOP_UP");
        value["amount"] = json!("11.00");
        let b = intent_from(value).unwrap();
        assert_eq!(a.key(), b.key());
        assert_ne!(a.digest(), b.digest());
        assert_ne!(a.request_digest(), b.request_digest());
    }

    #[test]
    fn scope_and_actual_actors_bind_request_not_business_digest() {
        let original = intent_from(payload("TOP_UP")).unwrap();
        let variants = [
            [
                "other",
                "paper",
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            ],
            [
                "TEST_ONLY-workspace",
                "sandbox",
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            ],
            [
                "TEST_ONLY-workspace",
                "paper",
                "other",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            ],
            [
                "TEST_ONLY-workspace",
                "paper",
                "TEST_ONLY-profile",
                "other",
                "TEST_ONLY-human",
                "TEST_ONLY-workload",
            ],
            [
                "TEST_ONLY-workspace",
                "paper",
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "other",
                "TEST_ONLY-workload",
            ],
            [
                "TEST_ONLY-workspace",
                "paper",
                "TEST_ONLY-profile",
                "TEST_ONLY-authority",
                "TEST_ONLY-human",
                "other",
            ],
        ];
        for [workspace, mode, profile, authority, actor, workload] in variants {
            let scoped =
                CommandScope::new(workspace, mode, profile, authority, actor, workload).unwrap();
            let other = CommandIntent::new(
                scoped,
                original.key(),
                original.operation(),
                original.payload().clone(),
                original.digest(),
            )
            .unwrap();
            assert_eq!(original.digest(), other.digest());
            assert_ne!(original.request_digest(), other.request_digest());
        }
    }

    #[test]
    fn wrong_key_operation_and_digest_are_rejected() {
        let value = payload("TOP_UP");
        let digest = canonical_digest(&value).unwrap();
        assert_eq!(
            CommandIntent::new(scope(), "wrong", "TOP_UP", value.clone(), &digest),
            Err(DurableError::BindingMismatch)
        );
        assert_eq!(
            CommandIntent::new(scope(), "TEST_ONLY-key", "FUND", value.clone(), &digest),
            Err(DurableError::BindingMismatch)
        );
        assert_eq!(
            CommandIntent::new(scope(), "TEST_ONLY-key", "TOP_UP", value, "sha256:wrong"),
            Err(DurableError::DigestMismatch)
        );
    }

    #[test]
    fn unsupported_return_and_extra_business_fields_are_not_admitted() {
        let mut value = payload("TOP_UP");
        value["operation"] = json!("RETURN_CAPITAL");
        assert_eq!(intent_from(value), Err(DurableError::UnsupportedOperation));
        let mut value = payload("TOP_UP");
        value["actor_id"] = json!("browser-spoof");
        assert_eq!(intent_from(value), Err(DurableError::InvalidPayload));
    }

    #[test]
    fn input_size_text_and_mode_are_bounded() {
        let mut value = payload("TOP_UP");
        value["reason"] = json!("x".repeat(MAX_BUSINESS_BYTES));
        assert_eq!(intent_from(value), Err(DurableError::BodyTooLarge));
        for value in [
            "",
            " leading",
            "trailing ",
            "has\ncontrol",
            "\u{00a0}leading",
        ] {
            assert!(CommandScope::new(value, "paper", "p", "a", "u", "w").is_err());
        }
        for mode in ["PAPER", "canary", "DEMO", "unknown"] {
            assert!(CommandScope::new("w", mode, "p", "a", "u", "s").is_err());
        }
        assert!(CommandScope::new(&"é".repeat(257), "paper", "p", "a", "u", "w").is_err());
    }

    #[test]
    fn version_strings_are_exact_i64_counters_not_numbers() {
        for counter in [
            json!(0),
            json!("01"),
            json!("-1"),
            json!("1e2"),
            json!("9223372036854775808"),
        ] {
            let mut value = payload("TOP_UP");
            value["expected_versions"]["budget"] = counter;
            assert!(intent_from(value).is_err());
        }
        let mut value = payload("TOP_UP");
        value["expected_versions"]["budget"] = json!("9223372036854775807");
        assert!(intent_from(value).is_ok());
        let mut value = payload("TOP_UP");
        value["expected_versions"]["book"] = json!("0");
        assert!(intent_from(value).is_err());
    }

    #[test]
    fn decimals_reject_floats_signs_exponents_and_positive_zero() {
        for amount in [
            json!(1.5),
            json!("1e2"),
            json!("+1"),
            json!("-1"),
            json!("01"),
            json!(".1"),
            json!("1."),
            json!("0.00"),
        ] {
            let mut value = payload("TOP_UP");
            value["amount"] = amount;
            assert!(intent_from(value).is_err());
        }
        let mut value = payload("TOP_UP");
        value["amount"] = json!("9".repeat(128));
        assert!(intent_from(value).is_ok());
    }

    #[test]
    fn delivery_unknown_and_ack_never_allow_automatic_mutation_retry() {
        let sending = DeliveryState::Prepared
            .transition(DeliveryState::Sending)
            .unwrap();
        assert!(!sending.automatic_retry_allowed());
        let unknown = sending.transition(DeliveryState::DeliveryUnknown).unwrap();
        assert!(!unknown.automatic_retry_allowed());
        assert!(unknown.transition(DeliveryState::Sending).is_err());
        assert!(unknown.transition(DeliveryState::Prepared).is_err());
        assert!(unknown.transition(DeliveryState::FailedBeforeSend).is_err());
        let ack = unknown.transition(DeliveryState::Acknowledged).unwrap();
        assert!(!ack.automatic_retry_allowed());
        assert!(ack.transition(DeliveryState::Prepared).is_err());
    }

    #[test]
    fn delivery_ack_is_distinct_from_every_business_disposition() {
        assert_eq!(
            serde_json::to_string(&DeliveryState::Acknowledged).unwrap(),
            "\"ACKNOWLEDGED\""
        );
        for value in ["ACKNOWLEDGED", "ACCEPTED", "UNKNOWN", "CURRENT", "PENDING"] {
            assert!(BusinessState::parse(value).is_err());
        }
        for state in [
            BusinessState::Rejected,
            BusinessState::Applied,
            BusinessState::PartiallyApplied,
            BusinessState::WaitingEncumbrance,
            BusinessState::Cancelled,
            BusinessState::PartiallyAppliedCancelled,
        ] {
            assert_eq!(BusinessState::parse(state.as_str()).unwrap(), state);
        }
    }

    #[test]
    fn every_pm_amount_disposition_preserves_the_entire_receipt() {
        for (state, applied, pending, cancelled, rejected) in [
            (BusinessState::Applied, "10", "0", "0", "0"),
            (BusinessState::Rejected, "0", "0", "0", "10"),
            (BusinessState::WaitingEncumbrance, "0", "10", "0", "0"),
            (BusinessState::PartiallyApplied, "3.00", "7", "0", "0"),
            (BusinessState::Cancelled, "0", "0", "10", "0"),
            (
                BusinessState::PartiallyAppliedCancelled,
                "3",
                "0",
                "7.00",
                "0",
            ),
        ] {
            let value = presentation(state, applied, pending, cancelled, rejected);
            let stored = receipt(0, state, value.clone()).unwrap();
            assert_eq!(stored.payload(), &value);
            assert_eq!(stored.state(), state);
            assert_eq!(stored.is_terminal(), pending == "0");
            assert_eq!(stored.intent_digest(), intent().request_digest());
            assert!(stored.verify_for(&intent()).is_ok());
        }
    }

    #[test]
    fn receipt_scope_binding_and_source_revision_are_required() {
        let value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        assert!(receipt(-1, BusinessState::Applied, value.clone()).is_err());
        assert!(AuthorityReceipt::new(
            &intent(),
            "wrong-source",
            0,
            BusinessState::Applied,
            value.clone()
        )
        .is_err());
        assert!(receipt(0, BusinessState::Rejected, value.clone()).is_err());
        let valid = receipt(0, BusinessState::Applied, value).unwrap();
        assert!(valid
            .verify_for(&intent_from(payload("TOP_UP")).unwrap())
            .is_err());
    }

    #[test]
    fn receipt_requires_full_authority_proof_not_http_success_subset() {
        let value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        for key in value.as_object().unwrap().keys() {
            let mut missing = value.clone();
            missing.as_object_mut().unwrap().remove(key);
            assert!(
                receipt(0, BusinessState::Applied, missing).is_err(),
                "{key}"
            );
        }
        let mut physical = value.clone();
        physical["physical_transfer_performed"] = json!(true);
        assert!(receipt(0, BusinessState::Applied, physical).is_err());
        let mut currency = value;
        currency["currency"] = json!("OTHER");
        assert!(receipt(0, BusinessState::Applied, currency).is_err());
    }

    #[test]
    fn incomplete_bad_partition_and_wrong_requested_amount_fail_closed() {
        let value = presentation(BusinessState::PartiallyApplied, "3", "7", "0", "0");
        let mut missing = value.clone();
        missing["amounts"]
            .as_object_mut()
            .unwrap()
            .remove("cancelled");
        assert!(receipt(0, BusinessState::PartiallyApplied, missing).is_err());
        let mut wrong = value.clone();
        wrong["amounts"]["pending"] = json!("6.999999999999999999999999999999");
        assert!(receipt(0, BusinessState::PartiallyApplied, wrong).is_err());
        let mut mismatch = value;
        mismatch["amounts"]["requested"] = json!("11");
        mismatch["amounts"]["pending"] = json!("8");
        assert!(receipt(0, BusinessState::PartiallyApplied, mismatch).is_err());
    }

    #[test]
    fn exact_partition_supports_more_than_decimal96_or_ieee754_precision() {
        let unit = format!("0.{}1", "0".repeat(70));
        let double = format!("0.{}2", "0".repeat(70));
        let amounts = json!({"requested":double, "applied":unit, "pending":unit, "cancelled":"0", "rejected":"0"});
        assert!(AmountPartition::from_value(&amounts).is_ok());
        let large = "9".repeat(127);
        let sum = format!("1{}", "0".repeat(127));
        let amounts = json!({"requested":sum, "applied":large, "pending":"1", "cancelled":"0", "rejected":"0"});
        assert!(AmountPartition::from_value(&amounts).is_ok());
    }

    #[test]
    fn partial_cancel_retains_applied_and_exact_pending_partition() {
        let previous = receipt(
            1,
            BusinessState::PartiallyApplied,
            presentation(BusinessState::PartiallyApplied, "3.00", "7.000", "0", "0"),
        )
        .unwrap();
        let cancelled = receipt(
            2,
            BusinessState::PartiallyAppliedCancelled,
            presentation(
                BusinessState::PartiallyAppliedCancelled,
                "3",
                "0.00",
                "7.00",
                "0",
            ),
        )
        .unwrap();
        assert!(cancelled.validate_progress(&previous).is_ok());
        assert!(cancelled.is_terminal());
        assert_eq!(cancelled.payload()["amounts"]["applied"], "3");
        assert!(previous.validate_progress(&cancelled).is_err());
    }

    #[test]
    fn decreasing_applied_or_cancelled_and_same_revision_conflict_are_rejected() {
        let a = receipt(
            1,
            BusinessState::PartiallyApplied,
            presentation(BusinessState::PartiallyApplied, "3", "7", "0", "0"),
        )
        .unwrap();
        let regressed = receipt(
            2,
            BusinessState::PartiallyApplied,
            presentation(BusinessState::PartiallyApplied, "2", "8", "0", "0"),
        )
        .unwrap();
        assert!(regressed.validate_progress(&a).is_err());
        let conflict = receipt(
            1,
            BusinessState::PartiallyApplied,
            presentation(BusinessState::PartiallyApplied, "4", "6", "0", "0"),
        )
        .unwrap();
        assert!(conflict.validate_progress(&a).is_err());
        let cancelled = receipt(
            2,
            BusinessState::PartiallyAppliedCancelled,
            presentation(BusinessState::PartiallyAppliedCancelled, "3", "0", "7", "0"),
        )
        .unwrap();
        let undo = receipt(
            3,
            BusinessState::Applied,
            presentation(BusinessState::Applied, "10", "0", "0", "0"),
        )
        .unwrap();
        assert!(undo.validate_progress(&cancelled).is_err());
        assert!(a.validate_progress(&a).is_ok());
    }

    #[test]
    fn status_reordering_and_another_source_command_are_rejected() {
        let previous = receipt(
            2,
            BusinessState::PartiallyApplied,
            presentation(BusinessState::PartiallyApplied, "3", "7", "0", "0"),
        )
        .unwrap();
        let mut changed = previous.payload().clone();
        changed["command_id"] = json!("TEST_ONLY-different-command");
        assert!(receipt(3, BusinessState::PartiallyApplied, changed)
            .unwrap()
            .validate_progress(&previous)
            .is_err());
        let older = receipt(
            1,
            BusinessState::PartiallyApplied,
            previous.payload().clone(),
        )
        .unwrap();
        assert!(older.validate_progress(&previous).is_err());
    }

    #[test]
    fn inconsistent_disposition_pending_and_delivery_labels_are_rejected() {
        let partial = presentation(BusinessState::PartiallyApplied, "3", "7", "0", "0");
        let mut applied = partial.clone();
        applied["state"] = json!("APPLIED");
        assert!(receipt(0, BusinessState::Applied, applied).is_err());
        let mut exit = partial.clone();
        exit["cli_exit_code"] = json!(0);
        assert!(receipt(0, BusinessState::PartiallyApplied, exit).is_err());
        let mut action = partial;
        action["next_action"] = json!("REVIEW_RECEIPT");
        assert!(receipt(0, BusinessState::PartiallyApplied, action).is_err());
    }

    #[test]
    fn receipt_metadata_bounds_do_not_strip_or_invent_proof() {
        let mut value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        value["blockers"] = json!(vec!["TEST_ONLY-blocker"; 129]);
        assert!(receipt(0, BusinessState::Applied, value).is_err());
        let mut value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        value["parent_receipt"] = Value::Null;
        assert!(receipt(0, BusinessState::Applied, value).is_err());
        let mut value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        value["current_versions"]["budget"] = json!(-1);
        assert!(receipt(0, BusinessState::Applied, value).is_err());
    }

    #[test]
    fn authority_version_dimensions_cannot_disappear_or_decrease() {
        let value = presentation(BusinessState::PartiallyApplied, "3", "7", "0", "0");
        let previous = receipt(1, BusinessState::PartiallyApplied, value.clone()).unwrap();
        let mut decreased = value.clone();
        decreased["current_versions"]["budget"] = json!(0);
        let decreased = receipt(2, BusinessState::PartiallyApplied, decreased).unwrap();
        assert!(decreased.validate_progress(&previous).is_err());
        let mut missing = value.clone();
        missing["current_versions"] = json!({"other_dimension":1});
        let missing = receipt(2, BusinessState::PartiallyApplied, missing).unwrap();
        assert!(missing.validate_progress(&previous).is_err());
        let mut advanced = value;
        advanced["current_versions"] = json!({"budget":2,"new_dimension":0});
        let advanced = receipt(2, BusinessState::PartiallyApplied, advanced).unwrap();
        assert!(advanced.validate_progress(&previous).is_ok());
    }

    #[test]
    fn terminal_zero_request_disposition_cannot_be_rewritten() {
        let intent = intent_from(payload("SET_ROOT_LIMIT")).unwrap();
        let mut value = presentation(BusinessState::Applied, "0", "0", "0", "0");
        value["amounts"]["requested"] = json!("0.00");
        let previous = AuthorityReceipt::new(
            &intent,
            "TEST_ONLY-source",
            1,
            BusinessState::Applied,
            value.clone(),
        )
        .unwrap();
        for state in [BusinessState::Rejected, BusinessState::Cancelled] {
            let mut changed = value.clone();
            changed["state"] = json!(state.as_str());
            changed["cli_exit_code"] = json!(2);
            let changed =
                AuthorityReceipt::new(&intent, "TEST_ONLY-source", 2, state, changed).unwrap();
            assert!(changed.validate_progress(&previous).is_err());
        }
        value["current_versions"]["budget"] = json!(2);
        let refreshed = AuthorityReceipt::new(
            &intent,
            "TEST_ONLY-source",
            2,
            BusinessState::Applied,
            value,
        )
        .unwrap();
        assert!(refreshed.validate_progress(&previous).is_ok());
    }

    #[test]
    fn full_receipt_has_its_own_one_mebibyte_bound_not_business_bound() {
        let mut value = presentation(BusinessState::Applied, "10", "0", "0", "0");
        value["blockers"] = json!(vec!["x".repeat(MAX_TEXT_BYTES); 128]);
        let size = serde_json::to_vec(&value).unwrap().len();
        assert!(size > MAX_BUSINESS_BYTES && size < MAX_RECEIPT_BYTES);
        assert!(receipt(1, BusinessState::Applied, value.clone()).is_ok());
        value["blockers"] = json!(["x".repeat(MAX_RECEIPT_BYTES)]);
        assert_eq!(
            receipt(1, BusinessState::Applied, value),
            Err(DurableError::BodyTooLarge)
        );
    }
}
