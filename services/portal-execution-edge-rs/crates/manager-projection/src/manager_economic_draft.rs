//! Draft mapping of existing Manager tagged values, not an admission policy.
//!
//! No route, DB query, catalogue expansion or authorization is created here.
//! The caller must separately validate source identity, freshness and scope.

use std::collections::BTreeMap;

use chrono::SecondsFormat;
use manager_v2_contract::{ManagerRecord, ManagerValue};
use serde_json::json;
use serde_json::Value;
use thiserror::Error;

use crate::economic_draft::{self, DraftScope, EconomicDraftError, FactInput, PostingInput};
use crate::materialization::{
    checked_json_byte_sum, ManagerMaterializationError, ManagerMaterializationLimits,
};
use crate::pm_registry_draft::{self, InstanceDraftError, InstanceInput};

#[derive(Debug, Error)]
pub enum ManagerDraftAdapterError {
    #[error("unexpected source relation")]
    Relation,
    #[error("required source field missing or has the wrong tag")]
    Field,
    #[error("economic draft invalid")]
    Economic(#[from] EconomicDraftError),
    #[error("PM draft invalid")]
    Instance(#[from] InstanceDraftError),
    #[error("draft serialization failed")]
    Serialization,
    #[error("draft materialization limit exceeded")]
    Materialization(#[from] ManagerMaterializationError),
}

type Fields = BTreeMap<String, ManagerValue>;

/// A successfully mapped fact, not a source-authorization or completeness proof.
/// Its private identity is used only to reject attaching a posting from another fact.
#[derive(Debug)]
pub struct MappedFact {
    payload: Value,
    fact_id: String,
}

impl MappedFact {
    #[must_use]
    pub const fn payload(&self) -> &Value {
        &self.payload
    }
}

/// Instance identity retained solely to check a candidate revision's keys.
/// Matching keys do not establish authorization or a coherent source snapshot.
#[derive(Debug)]
pub struct MappedInstance {
    payload: Value,
    token: String,
    version: i64,
}

impl MappedInstance {
    #[must_use]
    pub const fn payload(&self) -> &Value {
        &self.payload
    }
}

/// Candidate target keys retained only for exact alias/alpha linkage.
#[derive(Debug)]
pub struct MappedTarget {
    payload: Value,
    kind: String,
    canonical_id: String,
    storage_id: String,
}

impl MappedTarget {
    #[must_use]
    pub const fn payload(&self) -> &Value {
        &self.payload
    }
}

fn text<'a>(fields: &'a Fields, key: &str) -> Result<&'a str, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Text(value)) => Ok(value),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn optional_text<'a>(
    fields: &'a Fields,
    key: &str,
) -> Result<Option<&'a str>, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Null) => Ok(None),
        Some(ManagerValue::Text(value)) => Ok(Some(value)),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn integer(fields: &Fields, key: &str) -> Result<i64, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Integer(value)) => Ok(*value),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn optional_integer(fields: &Fields, key: &str) -> Result<Option<i64>, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Null) => Ok(None),
        Some(ManagerValue::Integer(value)) => Ok(Some(*value)),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn boolean(fields: &Fields, key: &str) -> Result<bool, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Boolean(value)) => Ok(*value),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn integer32(fields: &Fields, key: &str) -> Result<i32, ManagerDraftAdapterError> {
    i32::try_from(integer(fields, key)?).map_err(|_| ManagerDraftAdapterError::Field)
}

fn decimal<'a>(fields: &'a Fields, key: &str) -> Result<&'a str, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Decimal(value)) => Ok(value.as_str()),
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn timestamp(fields: &Fields, key: &str) -> Result<String, ManagerDraftAdapterError> {
    match fields.get(key) {
        Some(ManagerValue::Timestamp(value)) => {
            Ok(value.to_rfc3339_opts(SecondsFormat::AutoSi, true))
        }
        _ => Err(ManagerDraftAdapterError::Field),
    }
}

fn relation(
    record: &ManagerRecord,
    schema: &str,
    name: &str,
) -> Result<(), ManagerDraftAdapterError> {
    relation_names(
        record.relation().schema(),
        record.relation().relation(),
        schema,
        name,
    )
}

fn relation_names(
    actual_schema: &str,
    actual_name: &str,
    schema: &str,
    name: &str,
) -> Result<(), ManagerDraftAdapterError> {
    if actual_schema == schema && actual_name == name {
        Ok(())
    } else {
        Err(ManagerDraftAdapterError::Relation)
    }
}

/// Maps one already decoded Manager record; does not assert source authority.
///
/// # Errors
/// Rejects relation, field-tag, correction or scope drift and serialization errors.
pub fn map_fact_record(
    record: &ManagerRecord,
    scope: &DraftScope<'_>,
) -> Result<MappedFact, ManagerDraftAdapterError> {
    relation(record, "public", "economic_facts")?;
    fact_fields(record.fields(), scope)
}

fn fact_fields(
    fields: &Fields,
    scope: &DraftScope<'_>,
) -> Result<MappedFact, ManagerDraftAdapterError> {
    let occurred = timestamp(fields, "occurred_at")?;
    let received = timestamp(fields, "received_at")?;
    let mapped = economic_draft::map_fact(
        FactInput {
            fact_id: text(fields, "economic_fact_id")?,
            source_cell_id: text(fields, "source_cell_id")?,
            source_database_id: text(fields, "source_database_id")?,
            continuity_epoch: text(fields, "continuity_epoch")?,
            economic_scope_key: text(fields, "economic_scope_key")?,
            economic_identity: text(fields, "economic_identity")?,
            revision: integer32(fields, "revision")?,
            event_type: text(fields, "event_type")?,
            mode: text(fields, "mode")?,
            venue: text(fields, "venue")?,
            product: text(fields, "product")?,
            physical_account_ref: text(fields, "physical_account_ref")?,
            logical_account_ref: text(fields, "logical_account_ref")?,
            instrument_id: text(fields, "instrument_id")?,
            instrument_version: text(fields, "instrument_version")?,
            position_mode: text(fields, "position_mode")?,
            position_side: text(fields, "position_side")?,
            numeric_policy_version: text(fields, "numeric_policy_version")?,
            reducer_version: text(fields, "reducer_version")?,
            source_event_id: text(fields, "source_event_id")?,
            payload_hash: text(fields, "payload_hash")?,
            source_sequence: integer(fields, "source_sequence")?,
            effective_sequence: integer(fields, "effective_sequence")?,
            occurred_at: &occurred,
            received_at: &received,
            correction_of_fact_id: optional_text(fields, "correction_of_fact_id")?,
            correction_reason: optional_text(fields, "correction_reason")?,
            correction_authority: optional_text(fields, "correction_authority")?,
        },
        scope,
    )?;
    let fact_id = mapped.fact_id.to_owned();
    let payload =
        serde_json::to_value(mapped).map_err(|_| ManagerDraftAdapterError::Serialization)?;
    Ok(MappedFact { payload, fact_id })
}

/// Maps a posting against the corresponding previously scoped fact draft.
/// Same-fact linkage does not prove an authoritative source-side join.
///
/// # Errors
/// Rejects relation, field-tag, amount or fact-link drift.
pub fn map_posting_record(
    record: &ManagerRecord,
    fact: &MappedFact,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "public", "economic_postings")?;
    posting_fields(record.fields(), fact)
}

fn posting_fields(fields: &Fields, fact: &MappedFact) -> Result<Value, ManagerDraftAdapterError> {
    let mapped = economic_draft::map_posting_for_fact_id(
        PostingInput {
            posting_id: text(fields, "economic_posting_id")?,
            fact_id: text(fields, "economic_fact_id")?,
            posting_index: integer32(fields, "posting_index")?,
            posting_kind: text(fields, "posting_kind")?,
            ledger_account: text(fields, "ledger_account")?,
            currency: text(fields, "currency")?,
            debit: decimal(fields, "debit")?,
            credit: decimal(fields, "credit")?,
        },
        &fact.fact_id,
    )?;
    serde_json::to_value(mapped).map_err(|_| ManagerDraftAdapterError::Serialization)
}

/// Returns a metadata-only position summary for an explicitly bound scope key.
/// This does not return the projection body or establish source authority.
///
/// # Errors
/// Rejects wrong relation, scope key, field tag, version, valuation or timestamp.
pub fn map_position_summary_record(
    record: &ManagerRecord,
    expected_scope_key: &str,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "public", "economic_position_projections")?;
    position_fields(record.fields(), expected_scope_key)
}

/// Maps the complete Manager-visible tagged projection body with explicit limits.
/// This is not an unredacted DB image, a verified digest, or a source authority.
///
/// # Errors
/// Rejects relation, scope, metadata, missing/non-object projection or JSON size.
pub fn map_position_record(
    record: &ManagerRecord,
    expected_scope_key: &str,
    limits: ManagerMaterializationLimits,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "public", "economic_position_projections")?;
    full_position_fields(record.fields(), expected_scope_key, limits)
}

fn full_position_fields(
    fields: &Fields,
    expected_scope_key: &str,
    limits: ManagerMaterializationLimits,
) -> Result<Value, ManagerDraftAdapterError> {
    let mut payload = position_fields(fields, expected_scope_key)?;
    let Some(projection @ ManagerValue::Object(_)) = fields.get("projection") else {
        return Err(ManagerDraftAdapterError::Field);
    };
    // Count the borrowed body before creating an owned JSON copy.
    let source_bytes = limits.check_record_json_bytes(projection)?;
    payload["representation"] = json!("BOUNDED_MANAGER_TAGGED_PROJECTION");
    payload["projection"] =
        serde_json::to_value(projection).map_err(|_| ManagerDraftAdapterError::Serialization)?;
    let result_bytes = limits.check_record_json_bytes(&payload)?;
    limits.check_working_json_bytes(checked_json_byte_sum(source_bytes, result_bytes)?)?;
    Ok(payload)
}

fn position_fields(
    fields: &Fields,
    expected_scope_key: &str,
) -> Result<Value, ManagerDraftAdapterError> {
    let scope_key = text(fields, "economic_scope_key")?;
    if !economic_draft::hash_key(expected_scope_key) || scope_key != expected_scope_key {
        return Err(ManagerDraftAdapterError::Economic(
            EconomicDraftError::ScopeMismatch,
        ));
    }
    let position_key = text(fields, "position_key")?;
    let instrument_version = text(fields, "instrument_version")?;
    let position_side = text(fields, "position_side")?;
    let reducer = text(fields, "reducer_version")?;
    let projection_digest = text(fields, "projection_digest")?;
    let valuation = text(fields, "valuation_status")?;
    let version = integer(fields, "execution_version")?;
    let sequence = integer(fields, "through_effective_sequence")?;
    let updated_at = timestamp(fields, "updated_at")?;
    if ![position_key, instrument_version, reducer]
        .into_iter()
        .all(economic_draft::bounded_text)
        || !matches!(position_side, "BOTH" | "LONG" | "SHORT")
        || !matches!(valuation, "UNKNOWN_REQUIRES_REFERENCE" | "UNTOUCHED")
        || !economic_draft::hash_key(projection_digest)
        || version < 0
        || sequence < 0
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(json!({
        "representation":"METADATA_ONLY_NOT_FULL_PROJECTION",
        "economic_scope_key":scope_key, "position_key":position_key,
        "instrument_version":instrument_version, "position_side":position_side,
        "execution_version":version.to_string(), "through_effective_sequence":sequence.to_string(),
        "reducer_version":reducer, "projection_digest":projection_digest,
        "valuation_status":valuation, "updated_at":updated_at
    }))
}

/// Maps one decoded PM instance record; no Canary or lifecycle is inferred.
///
/// # Errors
/// Rejects relation, field-tag or exact scope drift.
pub fn map_instance_record(
    record: &ManagerRecord,
    scope: &DraftScope<'_>,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "instances")?;
    Ok(instance_fields(record.fields(), scope)?.payload)
}

/// Maps a PM candidate instance and retains its identity for revision checking.
///
/// # Errors
/// Rejects relation, field-tag or exact scope drift.
pub fn map_scoped_instance_record(
    record: &ManagerRecord,
    scope: &DraftScope<'_>,
) -> Result<MappedInstance, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "instances")?;
    instance_fields(record.fields(), scope)
}

/// An explicitly configured spelling pair, not evidence of authorization.
/// PM registry and business venue IDs may be distinct database values.
pub struct PmVenueBinding<'a> {
    pub business_venue: &'a str,
    pub registry_venue: &'a str,
}

/// Maps an instance using an explicit, caller-authorized venue spelling pair.
/// No case folding, venue-based entity join, or source authority is inferred.
///
/// # Errors
/// Rejects a mismatched business scope, registry venue, relation or field.
pub fn map_scoped_instance_with_venue_binding(
    record: &ManagerRecord,
    business_scope: &DraftScope<'_>,
    binding: &PmVenueBinding<'_>,
) -> Result<MappedInstance, ManagerDraftAdapterError> {
    if !economic_draft::bounded_text(binding.business_venue)
        || !economic_draft::bounded_text(binding.registry_venue)
        || business_scope.venue != binding.business_venue
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    map_scoped_instance_record(
        record,
        &DraftScope {
            mode: business_scope.mode,
            venue: binding.registry_venue,
        },
    )
}

fn instance_fields(
    fields: &Fields,
    scope: &DraftScope<'_>,
) -> Result<MappedInstance, ManagerDraftAdapterError> {
    let mapped = pm_registry_draft::map_instance(
        InstanceInput {
            instance_token: text(fields, "instance_token")?,
            authority_scope_id: text(fields, "authority_scope_id")?,
            alpha_slug: text(fields, "alpha_slug")?,
            portfolio_id: text(fields, "portfolio_id")?,
            mode: text(fields, "mode")?,
            venue: text(fields, "venue")?,
            canonical_strategy_id: text(fields, "canonical_strategy_id")?,
            account_id: text(fields, "account_id")?,
            deployment_id: text(fields, "deployment_id")?,
            version: integer(fields, "version")?,
        },
        scope,
    )?;
    let token = mapped.instance_token.to_owned();
    let version = integer(fields, "version")?;
    let payload =
        serde_json::to_value(mapped).map_err(|_| ManagerDraftAdapterError::Serialization)?;
    Ok(MappedInstance {
        payload,
        token,
        version,
    })
}

/// Maps the candidate revision that matches an already scoped instance.
/// Separate reads with matching keys do not prove an atomic snapshot.
///
/// # Errors
/// Rejects the wrong relation, token, revision, state or timestamp tag.
pub fn map_current_instance_revision_record(
    record: &ManagerRecord,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "instance_revisions")?;
    instance_revision_fields(record.fields(), instance)
}

fn instance_revision_fields(
    fields: &Fields,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    instance_revision_fields_for_version(fields, instance, instance.version)
}

fn instance_revision_fields_for_version(
    fields: &Fields,
    instance: &MappedInstance,
    expected_version: i64,
) -> Result<Value, ManagerDraftAdapterError> {
    let token = text(fields, "instance_token")?;
    let version = integer(fields, "version")?;
    let state = text(fields, "state")?;
    let effective_at = timestamp(fields, "effective_at")?;
    if token != instance.token
        || version <= 0
        || version != expected_version
        || !matches!(
            state,
            "REGISTERED_UNFUNDED" | "MATERIALIZED_HALTED" | "ARCHIVED"
        )
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(
        json!({"instance_token":token, "version":version.to_string(),
        "state":state, "effective_at":effective_at}),
    )
}

/// Maps the PM candidate storage binding for the exact instance token.
/// The storage ID is not interchangeable with the canonical deployment ID.
///
/// # Errors
/// Rejects a wrong relation, instance token or invalid storage identifier.
pub fn map_instance_materialization_record(
    record: &ManagerRecord,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "materializations")?;
    instance_materialization_fields(record.fields(), instance)
}

fn instance_materialization_fields(
    fields: &Fields,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    let token = text(fields, "instance_token")?;
    let storage_deployment_id = text(fields, "storage_deployment_id")?;
    if token != instance.token || !economic_draft::bounded_text(storage_deployment_id) {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(json!({"instance_token": token, "storage_deployment_id": storage_deployment_id}))
}

/// Maps one stage revision linked to the exact scoped instance revision.
/// The row is historical unless a separately authorised head proves otherwise;
/// an instance key match alone does not grant access or prove a snapshot.
///
/// # Errors
/// Rejects relation, identity, field tags, stage/environment and profile drift.
pub fn map_instance_stage_revision_record(
    record: &ManagerRecord,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_binding", "stage_revisions")?;
    stage_revision_fields(record.fields(), instance)
}

/// Bind a recorded stage head to its exact revision and scoped instance.
/// The latest recorded revision may correct an older timeline; it is NOT an
/// assertion of the currently effective stage or of snapshot coherence.
///
/// # Errors
/// Rejects mismatched relations, head keys, authority or instance linkage.
pub fn map_instance_recorded_stage_head(
    head: &ManagerRecord,
    revision: &ManagerRecord,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    recorded_stage_head_fields(head, revision, instance, instance.version)
}

/// Bind a recorded stage head whose stage points to an older instance
/// revision. The referenced revision must be supplied and match by token and
/// version; matching independently fetched records is not snapshot proof.
///
/// # Errors
/// Rejects wrong relations, referenced revision or mismatched head keys.
pub fn map_instance_recorded_stage_head_with_revision(
    head: &ManagerRecord,
    stage: &ManagerRecord,
    instance: &MappedInstance,
    instance_revision: &ManagerRecord,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(instance_revision, "pm_registry", "instance_revisions")?;
    let version = integer(instance_revision.fields(), "version")?;
    instance_revision_fields_for_version(instance_revision.fields(), instance, version)?;
    recorded_stage_head_fields(head, stage, instance, version)
}

fn recorded_stage_head_fields(
    head: &ManagerRecord,
    revision: &ManagerRecord,
    instance: &MappedInstance,
    instance_version: i64,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(head, "pm_binding", "stage_heads")?;
    relation(revision, "pm_binding", "stage_revisions")?;
    let mapped = stage_revision_fields_for_version(revision.fields(), instance, instance_version)?;
    let fields = head.fields();
    let deployment = text(fields, "deployment_id")?;
    let authority = text(fields, "authority_scope_id")?;
    let version = integer(fields, "version")?;
    if version <= 0
        || mapped.get("deployment_id").and_then(Value::as_str) != Some(deployment)
        || instance
            .payload
            .get("deployment_id")
            .and_then(Value::as_str)
            != Some(deployment)
        || mapped.get("authority_scope_id").and_then(Value::as_str) != Some(authority)
        || mapped.get("version").and_then(Value::as_str) != Some(version.to_string().as_str())
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(json!({"representation":"LATEST_RECORDED_NOT_EFFECTIVE_STAGE", "revision":mapped}))
}

fn stage_revision_fields(
    fields: &Fields,
    instance: &MappedInstance,
) -> Result<Value, ManagerDraftAdapterError> {
    stage_revision_fields_for_version(fields, instance, instance.version)
}

fn stage_revision_fields_for_version(
    fields: &Fields,
    instance: &MappedInstance,
    expected_instance_version: i64,
) -> Result<Value, ManagerDraftAdapterError> {
    let token = text(fields, "instance_token")?;
    let instance_revision = integer(fields, "instance_revision")?;
    let authority = text(fields, "authority_scope_id")?;
    let portfolio = text(fields, "portfolio_id")?;
    let environment = text(fields, "environment")?;
    let deployment = text(fields, "deployment_id")?;
    let version = integer(fields, "version")?;
    let stage = text(fields, "financial_stage")?;
    let profile = optional_text(fields, "limited_live_profile_ref")?;
    let policy = text(fields, "stage_policy_ref")?;
    let policy_digest = text(fields, "stage_policy_digest")?;
    let required = boolean(fields, "research_required")?;
    let research_version = optional_integer(fields, "research_version")?;
    let applicability = text(fields, "research_applicability_ref")?;
    let effective_at = timestamp(fields, "effective_at")?;
    let expected_environment = match stage {
        "PAPER" => "paper",
        "SANDBOX" => "sandbox",
        "CANARY" | "LIVE" => "live",
        _ => return Err(ManagerDraftAdapterError::Field),
    };
    if token != instance.token
        || instance_revision != expected_instance_version
        || instance
            .payload
            .get("authority_scope_id")
            .and_then(Value::as_str)
            != Some(authority)
        || instance.payload.get("portfolio_id").and_then(Value::as_str) != Some(portfolio)
        || instance.payload.get("mode").and_then(Value::as_str) != Some(environment)
        || environment != expected_environment
        || version <= 0
        || ![deployment, policy, applicability]
            .into_iter()
            .all(economic_draft::bounded_text)
        || !economic_draft::hash_key(policy_digest)
        || required != research_version.is_some()
        || research_version.is_some_and(|revision| revision <= 0)
        || (stage == "CANARY" && !profile.is_some_and(economic_draft::bounded_text))
        || (stage != "CANARY" && profile.is_some())
        || text(fields, "operation")? != "RECORD_FINANCIAL_STAGE"
        || text(fields, "state")? != "RECORDED"
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(json!({
        "representation":"STAGE_REVISION_NOT_CURRENT_AUTHORITY",
        "instance_token":token, "instance_revision":instance_revision.to_string(),
        "authority_scope_id":authority, "portfolio_id":portfolio,
        "environment":environment, "deployment_id":deployment, "version":version.to_string(),
        "financial_stage":stage, "limited_live_profile_ref":profile,
        "stage_policy_ref":policy, "stage_policy_digest":policy_digest,
        "research_required":required, "research_version":research_version.map(|v| v.to_string()),
        "research_applicability_ref":applicability, "effective_at":effective_at
    }))
}

/// Maps one PM target only if it corresponds to the selected instance.
/// Source key equality does not assert permission or consistent snapshot.
///
/// # Errors
/// Rejects wrong relation, target kind, canonical ID or typed storage fields.
pub fn map_instance_target_record(
    record: &ManagerRecord,
    instance: &MappedInstance,
) -> Result<MappedTarget, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "targets")?;
    target_fields(record.fields(), instance)
}

fn target_fields(
    fields: &Fields,
    instance: &MappedInstance,
) -> Result<MappedTarget, ManagerDraftAdapterError> {
    let kind = text(fields, "kind")?;
    let canonical_id = text(fields, "canonical_id")?;
    let storage_id = text(fields, "storage_id")?;
    let (instance_field, typed_field) = match kind {
        "alpha" => ("canonical_strategy_id", "strategy_storage"),
        "account" => ("account_id", "account_storage"),
        "deployment" => ("deployment_id", "deployment_storage"),
        _ => return Err(ManagerDraftAdapterError::Field),
    };
    if instance.payload.get(instance_field).and_then(Value::as_str) != Some(canonical_id)
        || storage_id.is_empty()
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    for key in ["strategy_storage", "account_storage", "deployment_storage"] {
        let value = optional_text(fields, key)?;
        if (key == typed_field && value != Some(storage_id))
            || (key != typed_field && value.is_some())
        {
            return Err(ManagerDraftAdapterError::Field);
        }
    }
    Ok(MappedTarget {
        payload: json!({"kind":kind, "canonical_id":canonical_id, "storage_id":storage_id}),
        kind: kind.to_owned(),
        canonical_id: canonical_id.to_owned(),
        storage_id: storage_id.to_owned(),
    })
}

/// Maps an alias only when its source keys match the selected instance target.
///
/// # Errors
/// Rejects wrong relation, target linkage, empty spelling or invalid source hash.
pub fn map_target_alias_record(
    record: &ManagerRecord,
    target: &MappedTarget,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "aliases")?;
    alias_fields(record.fields(), target)
}

fn alias_fields(fields: &Fields, target: &MappedTarget) -> Result<Value, ManagerDraftAdapterError> {
    let kind = text(fields, "kind")?;
    let canonical_id = text(fields, "canonical_id")?;
    let storage_id = text(fields, "storage_id")?;
    let spelling = text(fields, "spelling")?;
    let source_sha256 = text(fields, "source_sha256")?;
    if kind != target.kind
        || canonical_id != target.canonical_id
        || storage_id != target.storage_id
        || spelling.is_empty()
        || !economic_draft::hash_key(source_sha256)
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(
        json!({"kind":kind,"spelling":spelling,"canonical_id":canonical_id,
        "storage_id":storage_id,"source_sha256":source_sha256}),
    )
}

/// Maps an alpha record only for the matching instance and alpha target.
///
/// # Errors
/// Rejects wrong relation, alpha slug, canonical ID or storage ID.
pub fn map_instance_alpha_record(
    record: &ManagerRecord,
    instance: &MappedInstance,
    target: &MappedTarget,
) -> Result<Value, ManagerDraftAdapterError> {
    relation(record, "pm_registry", "alphas")?;
    alpha_fields(record.fields(), instance, target)
}

fn alpha_fields(
    fields: &Fields,
    instance: &MappedInstance,
    target: &MappedTarget,
) -> Result<Value, ManagerDraftAdapterError> {
    let slug = text(fields, "alpha_slug")?;
    let canonical_id = text(fields, "canonical_id")?;
    let storage_id = text(fields, "storage_id")?;
    if target.kind != "alpha"
        || canonical_id != target.canonical_id
        || storage_id != target.storage_id
        || instance.payload.get("alpha_slug").and_then(Value::as_str) != Some(slug)
        || instance
            .payload
            .get("canonical_strategy_id")
            .and_then(Value::as_str)
            != Some(canonical_id)
    {
        return Err(ManagerDraftAdapterError::Field);
    }
    Ok(json!({"alpha_slug":slug,"canonical_id":canonical_id,"storage_id":storage_id}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};
    use manager_v2_contract::{
        decode_success_for_profile, ManagerDecimalString, ManagerPayload, ManagerV2Request,
        PageLimit, RUNTIME_CONTRACT_REVISION,
    };
    use serde_json::json;

    const KEY: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const SCOPE: DraftScope<'static> = DraftScope {
        mode: "paper",
        venue: "BINANCE",
    };

    fn text_fields(values: &[(&str, &str)]) -> Fields {
        values
            .iter()
            .map(|(key, value)| ((*key).to_owned(), ManagerValue::Text((*value).to_owned())))
            .collect()
    }

    fn fact_fields_fixture() -> Fields {
        let mut fields = text_fields(&[
            ("economic_fact_id", "fact"),
            ("source_cell_id", "cell"),
            ("source_database_id", "db"),
            ("continuity_epoch", "epoch"),
            ("economic_scope_key", KEY),
            ("economic_identity", KEY),
            ("event_type", "FILL"),
            ("mode", "paper"),
            ("venue", "BINANCE"),
            ("product", "SWAP"),
            ("physical_account_ref", "physical"),
            ("logical_account_ref", "logical"),
            ("instrument_id", "instrument"),
            ("instrument_version", "v1"),
            ("position_mode", "NET"),
            ("position_side", "BOTH"),
            ("numeric_policy_version", "p1"),
            ("reducer_version", "r1"),
            ("source_event_id", "event"),
            ("payload_hash", KEY),
        ]);
        fields.insert("revision".into(), ManagerValue::Integer(1));
        fields.insert("source_sequence".into(), ManagerValue::Integer(i64::MAX));
        fields.insert("effective_sequence".into(), ManagerValue::Integer(1));
        let ts: DateTime<Utc> = "2026-11-11T15:00:00Z".parse().unwrap();
        fields.insert("occurred_at".into(), ManagerValue::Timestamp(ts));
        fields.insert("received_at".into(), ManagerValue::Timestamp(ts));
        for key in [
            "correction_of_fact_id",
            "correction_reason",
            "correction_authority",
        ] {
            fields.insert(key.into(), ManagerValue::Null);
        }
        fields
    }

    fn decoded_record(schema: &str, name: &str, key: &str, fields: &Fields) -> ManagerRecord {
        let digest = format!("sha256:{}", "a".repeat(64));
        let columns: Vec<_> = fields
            .keys()
            .enumerate()
            .map(|(index, name)| {
                json!({
                    "name":name,"ordinal":index+1,"data_type":"text","nullable":true
                })
            })
            .collect();
        let envelope = |data: Value| {
            json!({
                "contract_version":RUNTIME_CONTRACT_REVISION,"authority":"EXECUTION_CELL",
                "profile_id":"PAPER_BINANCE_USDM","catalogue_sha256":digest,
                "availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE",
                "trace_id":"synthetic-g7-test","as_of":"2026-11-11T15:00:00Z","data":data
            })
        };
        let body = envelope(
            json!({"catalogue_revision":digest,"relation_count":1,"relations":[{
                "id":{"schema":schema,"relation":name},"kind":"TABLE",
                "safe_columns":columns,"secret_cell_excluded_column_count":0,
                "key":{"status":"PRIMARY_KEY","name":null,"columns":[key]},
                "profile_classification":"FIXED_PROFILE_CONTEXT","profile_columns":[],
                "query_status":"QUALIFIED_TS_OC_03D1"
            }]}),
        );
        let ManagerPayload::Catalogue(catalogue) = decode_success_for_profile(
            &ManagerV2Request::catalogue(),
            &serde_json::to_vec(&body).unwrap(),
            "PAPER_BINANCE_USDM",
        )
        .unwrap() else {
            panic!("expected catalogue")
        };
        let catalogue = catalogue.into_data();
        let request = ManagerV2Request::relation_records(
            catalogue.relation(schema, name).unwrap(),
            None,
            PageLimit::default(),
        )
        .unwrap();
        let page = envelope(json!({"relation":{"schema":schema,"relation":name},
            "items":[{"relation":{"schema":schema,"relation":name},
            "record_key":"synthetic-key","fields":fields}],"next_cursor":null}));
        let ManagerPayload::RelationRecords(result) = decode_success_for_profile(
            &request,
            &serde_json::to_vec(&page).unwrap(),
            "PAPER_BINANCE_USDM",
        )
        .unwrap() else {
            panic!("expected records")
        };
        result.into_data().items()[0].clone()
    }

    #[test]
    fn synthetic_manager_catalogue_and_page_decode_into_adapter() {
        let record = decoded_record(
            "public",
            "economic_facts",
            "economic_fact_id",
            &fact_fields_fixture(),
        );
        let mapped = map_fact_record(&record, &SCOPE).unwrap();
        assert_eq!(mapped.payload()["fact_id"], "fact");
        assert!(matches!(
            map_instance_record(&record, &SCOPE),
            Err(ManagerDraftAdapterError::Relation)
        ));
    }

    fn stage_instance(mode: &str) -> MappedInstance {
        let mut fields = text_fields(&[
            ("instance_token", "instance"),
            ("authority_scope_id", "scope"),
            ("alpha_slug", "alpha"),
            ("portfolio_id", "portfolio"),
            ("mode", mode),
            ("venue", "BINANCE"),
            ("canonical_strategy_id", "strategy"),
            ("account_id", "account"),
            ("deployment_id", "canonical-deployment"),
        ]);
        fields.insert("version".into(), ManagerValue::Integer(4));
        let record = decoded_record("pm_registry", "instances", "instance_token", &fields);
        map_scoped_instance_record(
            &record,
            &DraftScope {
                mode,
                venue: "BINANCE",
            },
        )
        .unwrap()
    }

    fn stage_fixture(stage: &str, mode: &str) -> Fields {
        let mut fields = text_fields(&[
            ("instance_token", "instance"),
            ("authority_scope_id", "scope"),
            ("portfolio_id", "portfolio"),
            ("environment", mode),
            ("deployment_id", "physical-deployment"),
            ("financial_stage", stage),
            ("stage_policy_ref", "policy"),
            ("stage_policy_digest", KEY),
            ("research_applicability_ref", "research"),
            ("operation", "RECORD_FINANCIAL_STAGE"),
            ("state", "RECORDED"),
        ]);
        fields.insert("instance_revision".into(), ManagerValue::Integer(4));
        fields.insert("version".into(), ManagerValue::Integer(i64::MAX));
        fields.insert("research_required".into(), ManagerValue::Boolean(false));
        fields.insert("research_version".into(), ManagerValue::Null);
        fields.insert(
            "limited_live_profile_ref".into(),
            if stage == "CANARY" {
                ManagerValue::Text("limited-live-profile".into())
            } else {
                ManagerValue::Null
            },
        );
        fields.insert(
            "effective_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        fields
    }

    #[test]
    fn stage_mapping_keeps_canary_distinct_and_binds_instance_revision() {
        for (stage, mode) in [
            ("PAPER", "paper"),
            ("SANDBOX", "sandbox"),
            ("CANARY", "live"),
            ("LIVE", "live"),
        ] {
            let instance = stage_instance(mode);
            let fields = stage_fixture(stage, mode);
            let record = decoded_record("pm_binding", "stage_revisions", "deployment_id", &fields);
            let mapped = map_instance_stage_revision_record(&record, &instance).unwrap();
            assert_eq!(mapped["financial_stage"], stage);
            assert_eq!(mapped["environment"], mode);
            assert_eq!(mapped["deployment_id"], "physical-deployment");
            assert_eq!(mapped["version"], i64::MAX.to_string());
            assert_eq!(
                mapped["limited_live_profile_ref"].is_string(),
                stage == "CANARY"
            );
            assert_eq!(
                mapped["representation"],
                "STAGE_REVISION_NOT_CURRENT_AUTHORITY"
            );
            let wrong = decoded_record("pm_binding", "stage_heads", "deployment_id", &fields);
            assert!(matches!(
                map_instance_stage_revision_record(&wrong, &instance),
                Err(ManagerDraftAdapterError::Relation)
            ));
        }
    }

    #[test]
    fn pm_venue_binding_is_explicit_and_never_folds_case() {
        let mut fields = text_fields(&[
            ("instance_token", "instance"),
            ("authority_scope_id", "scope"),
            ("alpha_slug", "alpha"),
            ("portfolio_id", "portfolio"),
            ("mode", "paper"),
            ("venue", "okx"),
            ("canonical_strategy_id", "strategy"),
            ("account_id", "account"),
            ("deployment_id", "deployment"),
        ]);
        fields.insert("version".into(), ManagerValue::Integer(2));
        let record = decoded_record("pm_registry", "instances", "instance_token", &fields);
        let scope = DraftScope {
            mode: "paper",
            venue: "OKX",
        };
        let binding = PmVenueBinding {
            business_venue: "OKX",
            registry_venue: "okx",
        };
        let mapped = map_scoped_instance_with_venue_binding(&record, &scope, &binding).unwrap();
        assert_eq!(mapped.payload()["venue"], "okx");
        assert!(map_scoped_instance_record(&record, &scope).is_err());
        assert!(map_scoped_instance_with_venue_binding(
            &record,
            &scope,
            &PmVenueBinding {
                business_venue: "okx",
                registry_venue: "okx"
            }
        )
        .is_err());
        assert!(map_scoped_instance_with_venue_binding(
            &record,
            &scope,
            &PmVenueBinding {
                business_venue: "OKX",
                registry_venue: "OKX"
            }
        )
        .is_err());
        assert!(map_scoped_instance_with_venue_binding(
            &record,
            &DraftScope {
                mode: "live",
                venue: "OKX"
            },
            &binding
        )
        .is_err());
    }

    #[test]
    fn stage_head_is_latest_recorded_not_effective_and_keys_must_match() {
        let instance = stage_instance("paper");
        let mut revision = stage_fixture("PAPER", "paper");
        revision.insert(
            "deployment_id".into(),
            ManagerValue::Text("canonical-deployment".into()),
        );
        let record = decoded_record("pm_binding", "stage_revisions", "deployment_id", &revision);
        let mut head = text_fields(&[
            ("deployment_id", "canonical-deployment"),
            ("authority_scope_id", "scope"),
        ]);
        head.insert("version".into(), ManagerValue::Integer(i64::MAX));
        let head_record = decoded_record("pm_binding", "stage_heads", "deployment_id", &head);
        let mapped = map_instance_recorded_stage_head(&head_record, &record, &instance).unwrap();
        assert_eq!(
            mapped["representation"],
            "LATEST_RECORDED_NOT_EFFECTIVE_STAGE"
        );
        let mut other_revision = revision.clone();
        other_revision.insert("deployment_id".into(), ManagerValue::Text("other".into()));
        let other_revision = decoded_record(
            "pm_binding",
            "stage_revisions",
            "deployment_id",
            &other_revision,
        );
        let mut other_head = head.clone();
        other_head.insert("deployment_id".into(), ManagerValue::Text("other".into()));
        let other_head = decoded_record("pm_binding", "stage_heads", "deployment_id", &other_head);
        assert!(map_instance_recorded_stage_head(&other_head, &other_revision, &instance).is_err());
        for (field, value) in [
            ("deployment_id", ManagerValue::Text("other".into())),
            ("authority_scope_id", ManagerValue::Text("other".into())),
            ("version", ManagerValue::Integer(1)),
            ("version", ManagerValue::Integer(0)),
        ] {
            let mut bad = head.clone();
            bad.insert(field.into(), value);
            let bad = decoded_record("pm_binding", "stage_heads", "deployment_id", &bad);
            assert!(
                map_instance_recorded_stage_head(&bad, &record, &instance).is_err(),
                "{field}"
            );
        }
        assert!(map_instance_recorded_stage_head(&record, &record, &instance).is_err());
        assert!(map_instance_recorded_stage_head(&head_record, &head_record, &instance).is_err());
    }

    #[test]
    fn recorded_stage_can_reference_verified_older_instance_revision() {
        let instance = stage_instance("paper");
        let mut stage = stage_fixture("PAPER", "paper");
        stage.insert(
            "deployment_id".into(),
            ManagerValue::Text("canonical-deployment".into()),
        );
        stage.insert("instance_revision".into(), ManagerValue::Integer(2));
        let stage = decoded_record("pm_binding", "stage_revisions", "deployment_id", &stage);
        let mut head = text_fields(&[
            ("deployment_id", "canonical-deployment"),
            ("authority_scope_id", "scope"),
        ]);
        head.insert("version".into(), ManagerValue::Integer(i64::MAX));
        let head = decoded_record("pm_binding", "stage_heads", "deployment_id", &head);
        let mut revision = text_fields(&[
            ("instance_token", "instance"),
            ("state", "REGISTERED_UNFUNDED"),
        ]);
        revision.insert("version".into(), ManagerValue::Integer(2));
        revision.insert(
            "effective_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        let history = decoded_record(
            "pm_registry",
            "instance_revisions",
            "instance_token",
            &revision,
        );
        assert!(map_instance_recorded_stage_head(&head, &stage, &instance).is_err());
        let mapped =
            map_instance_recorded_stage_head_with_revision(&head, &stage, &instance, &history)
                .unwrap();
        assert_eq!(mapped["revision"]["instance_revision"], "2");
        assert_eq!(
            mapped["representation"],
            "LATEST_RECORDED_NOT_EFFECTIVE_STAGE"
        );
        for (key, value) in [
            ("instance_token", ManagerValue::Text("other".into())),
            ("version", ManagerValue::Integer(3)),
            ("version", ManagerValue::Integer(0)),
        ] {
            let mut bad = revision.clone();
            bad.insert(key.into(), value);
            let bad = decoded_record("pm_registry", "instance_revisions", "instance_token", &bad);
            assert!(
                map_instance_recorded_stage_head_with_revision(&head, &stage, &instance, &bad)
                    .is_err()
            );
        }
        assert!(
            map_instance_recorded_stage_head_with_revision(&head, &stage, &instance, &head)
                .is_err()
        );
    }

    #[test]
    fn stage_mapping_rejects_cross_scope_profiles_and_invalid_research() {
        let instance = stage_instance("live");
        let valid = stage_fixture("CANARY", "live");
        let mutations = [
            ("instance_token", ManagerValue::Text("other".into())),
            ("instance_revision", ManagerValue::Integer(5)),
            ("authority_scope_id", ManagerValue::Text("other".into())),
            ("portfolio_id", ManagerValue::Text("other".into())),
            ("environment", ManagerValue::Text("paper".into())),
            ("limited_live_profile_ref", ManagerValue::Null),
            (
                "limited_live_profile_ref",
                ManagerValue::Text(String::new()),
            ),
            ("stage_policy_digest", ManagerValue::Text("bad".into())),
            ("version", ManagerValue::Integer(0)),
            ("research_required", ManagerValue::Boolean(true)),
            ("research_version", ManagerValue::Integer(0)),
            ("operation", ManagerValue::Text("OTHER".into())),
            ("state", ManagerValue::Text("OTHER".into())),
        ];
        for (field, value) in mutations {
            let mut bad = valid.clone();
            bad.insert(field.into(), value);
            assert!(stage_revision_fields(&bad, &instance).is_err(), "{field}");
        }
        let mut valid_research = valid.clone();
        valid_research.insert("research_required".into(), ManagerValue::Boolean(true));
        valid_research.insert("research_version".into(), ManagerValue::Integer(i64::MAX));
        assert_eq!(
            stage_revision_fields(&valid_research, &instance).unwrap()["research_version"],
            i64::MAX.to_string()
        );
        let mut live = stage_fixture("LIVE", "live");
        live.insert(
            "limited_live_profile_ref".into(),
            ManagerValue::Text("not-allowed".into()),
        );
        assert!(stage_revision_fields(&live, &instance).is_err());
        let mut missing = valid;
        missing.remove("limited_live_profile_ref");
        assert!(stage_revision_fields(&missing, &instance).is_err());
    }

    #[test]
    fn synthetic_manager_pm_pages_bind_only_matching_instance_and_revision() {
        let mut fields = text_fields(&[
            ("instance_token", "opaque"),
            ("authority_scope_id", "scope"),
            ("alpha_slug", "alpha"),
            ("portfolio_id", "portfolio"),
            ("mode", "paper"),
            ("venue", "binance"),
            ("canonical_strategy_id", "strategy"),
            ("account_id", "account"),
            ("deployment_id", "deployment"),
        ]);
        fields.insert("version".into(), ManagerValue::Integer(4));
        let record = decoded_record("pm_registry", "instances", "instance_token", &fields);
        let instance = map_scoped_instance_record(
            &record,
            &DraftScope {
                mode: "paper",
                venue: "binance",
            },
        )
        .unwrap();
        let mut revision = text_fields(&[
            ("instance_token", "opaque"),
            ("state", "REGISTERED_UNFUNDED"),
        ]);
        revision.insert("version".into(), ManagerValue::Integer(4));
        revision.insert(
            "effective_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        let revision_record = decoded_record(
            "pm_registry",
            "instance_revisions",
            "instance_token",
            &revision,
        );
        assert_eq!(
            map_current_instance_revision_record(&revision_record, &instance).unwrap()["version"],
            "4"
        );
        assert!(matches!(
            map_current_instance_revision_record(&record, &instance),
            Err(ManagerDraftAdapterError::Relation)
        ));
        revision.insert("version".into(), ManagerValue::Integer(5));
        let other = decoded_record(
            "pm_registry",
            "instance_revisions",
            "instance_token",
            &revision,
        );
        assert!(matches!(
            map_current_instance_revision_record(&other, &instance),
            Err(ManagerDraftAdapterError::Field)
        ));
        let mut materialization = text_fields(&[
            ("instance_token", "opaque"),
            ("storage_deployment_id", "storage-deployment"),
        ]);
        let storage = decoded_record(
            "pm_registry",
            "materializations",
            "instance_token",
            &materialization,
        );
        assert_eq!(
            map_instance_materialization_record(&storage, &instance).unwrap()
                ["storage_deployment_id"],
            "storage-deployment"
        );
        assert_ne!(instance.payload()["deployment_id"], "storage-deployment");
        materialization.insert(
            "instance_token".into(),
            ManagerValue::Text("another".into()),
        );
        let other = decoded_record(
            "pm_registry",
            "materializations",
            "instance_token",
            &materialization,
        );
        assert!(matches!(
            map_instance_materialization_record(&other, &instance),
            Err(ManagerDraftAdapterError::Field)
        ));
    }

    fn check_alpha_target(instance: &MappedInstance, target: &MappedTarget, fields: &Fields) {
        let mut alpha = text_fields(&[
            ("alpha_slug", "alpha"),
            ("canonical_id", "strategy"),
            ("storage_id", "physical"),
        ]);
        let alpha_record = decoded_record("pm_registry", "alphas", "alpha_slug", &alpha);
        assert_eq!(
            map_instance_alpha_record(&alpha_record, instance, target).unwrap()["storage_id"],
            "physical"
        );
        let mut unrelated = fields.clone();
        unrelated.insert(
            "canonical_strategy_id".into(),
            ManagerValue::Text("other-strategy".into()),
        );
        let unrelated_instance = instance_fields(
            &unrelated,
            &DraftScope {
                mode: "paper",
                venue: "binance",
            },
        )
        .unwrap();
        assert!(matches!(
            alpha_fields(&alpha, &unrelated_instance, target),
            Err(ManagerDraftAdapterError::Field)
        ));
        alpha.insert("alpha_slug".into(), ManagerValue::Text("different".into()));
        assert!(matches!(
            alpha_fields(&alpha, instance, target),
            Err(ManagerDraftAdapterError::Field)
        ));
    }

    #[test]
    fn pm_targets_and_aliases_are_bound_by_instance_kind_and_typed_storage() {
        let mut fields = text_fields(&[
            ("instance_token", "opaque"),
            ("authority_scope_id", "scope"),
            ("alpha_slug", "alpha"),
            ("portfolio_id", "portfolio"),
            ("mode", "paper"),
            ("venue", "binance"),
            ("canonical_strategy_id", "strategy"),
            ("account_id", "account"),
            ("deployment_id", "deployment"),
        ]);
        fields.insert("version".into(), ManagerValue::Integer(1));
        let instance = instance_fields(
            &fields,
            &DraftScope {
                mode: "paper",
                venue: "binance",
            },
        )
        .unwrap();
        for (kind, canonical, typed) in [
            ("alpha", "strategy", "strategy_storage"),
            ("account", "account", "account_storage"),
            ("deployment", "deployment", "deployment_storage"),
        ] {
            let mut target_fields = text_fields(&[
                ("kind", kind),
                ("canonical_id", canonical),
                ("storage_id", "physical"),
            ]);
            for name in ["strategy_storage", "account_storage", "deployment_storage"] {
                target_fields.insert(
                    name.into(),
                    if name == typed {
                        ManagerValue::Text("physical".into())
                    } else {
                        ManagerValue::Null
                    },
                );
            }
            let record = decoded_record("pm_registry", "targets", "canonical_id", &target_fields);
            let target = map_instance_target_record(&record, &instance).unwrap();
            assert_eq!(target.payload()["storage_id"], "physical");
            let mut alias = text_fields(&[
                ("kind", kind),
                ("canonical_id", canonical),
                ("storage_id", "physical"),
                ("spelling", " original spelling "),
                ("source_sha256", KEY),
            ]);
            let alias_record = decoded_record("pm_registry", "aliases", "spelling", &alias);
            assert_eq!(
                map_target_alias_record(&alias_record, &target).unwrap()["spelling"],
                " original spelling "
            );
            alias.insert("storage_id".into(), ManagerValue::Text("other".into()));
            assert!(matches!(
                alias_fields(&alias, &target),
                Err(ManagerDraftAdapterError::Field)
            ));
            alias.insert("storage_id".into(), ManagerValue::Text("physical".into()));
            alias.insert("source_sha256".into(), ManagerValue::Text("bad".into()));
            assert!(matches!(
                alias_fields(&alias, &target),
                Err(ManagerDraftAdapterError::Field)
            ));
            if kind == "alpha" {
                check_alpha_target(&instance, &target, &fields);
            }
            target_fields.insert(typed.into(), ManagerValue::Text("wrong".into()));
            assert!(matches!(
                super::target_fields(&target_fields, &instance),
                Err(ManagerDraftAdapterError::Field)
            ));
            target_fields.insert(typed.into(), ManagerValue::Text("physical".into()));
            target_fields.remove("account_storage");
            assert!(matches!(
                super::target_fields(&target_fields, &instance),
                Err(ManagerDraftAdapterError::Field)
            ));
            target_fields.insert("account_storage".into(), ManagerValue::Null);
            target_fields.insert(
                "canonical_id".into(),
                ManagerValue::Text("other-instance".into()),
            );
            assert!(matches!(
                super::target_fields(&target_fields, &instance),
                Err(ManagerDraftAdapterError::Field)
            ));
        }
    }

    #[test]
    fn tagged_fact_preserves_opaque_and_timestamp_values() {
        let mapped = fact_fields(&fact_fields_fixture(), &SCOPE).unwrap();
        assert_eq!(mapped.payload()["source_sequence"], "9223372036854775807");
        assert_eq!(mapped.payload()["occurred_at"], "2026-11-11T15:00:00Z");
        assert_eq!(mapped.payload()["instrument_version"], "v1");
        assert!(mapped.payload()["correction_of_fact_id"].is_null());
    }

    #[test]
    fn missing_is_not_null_and_integer_is_not_text() {
        let mut fields = fact_fields_fixture();
        fields.remove("correction_reason");
        assert!(matches!(
            fact_fields(&fields, &SCOPE),
            Err(ManagerDraftAdapterError::Field)
        ));
        let mut fields = fact_fields_fixture();
        fields.insert("revision".into(), ManagerValue::Text("1".into()));
        assert!(matches!(
            fact_fields(&fields, &SCOPE),
            Err(ManagerDraftAdapterError::Field)
        ));
        fields.insert("revision".into(), ManagerValue::Integer(i64::MAX));
        assert!(matches!(
            fact_fields(&fields, &SCOPE),
            Err(ManagerDraftAdapterError::Field)
        ));
    }

    #[test]
    fn rejects_wrong_relation_and_cross_scope_without_granting_access() {
        assert!(relation_names("public", "economic_facts", "public", "economic_facts").is_ok());
        assert!(matches!(
            relation_names("public", "economic_postings", "public", "economic_facts"),
            Err(ManagerDraftAdapterError::Relation)
        ));
        assert!(matches!(
            fact_fields(
                &fact_fields_fixture(),
                &DraftScope {
                    mode: "paper",
                    venue: "OKX"
                }
            ),
            Err(ManagerDraftAdapterError::Economic(
                EconomicDraftError::ScopeMismatch
            ))
        ));
    }

    #[test]
    fn manager_decimals_preserve_38_digit_values_and_reject_wrong_tags() {
        let mut fields = text_fields(&[
            ("economic_posting_id", "posting"),
            ("economic_fact_id", "fact"),
            ("posting_kind", "fee"),
            ("ledger_account", "account"),
            ("currency", "USDT"),
        ]);
        fields.insert("posting_index".into(), ManagerValue::Integer(1));
        let amount = "99999999999999999999.123456789012345678";
        fields.insert(
            "debit".into(),
            ManagerValue::Decimal(ManagerDecimalString::parse(amount).unwrap()),
        );
        fields.insert(
            "credit".into(),
            ManagerValue::Decimal(ManagerDecimalString::parse("0").unwrap()),
        );
        let fact = fact_fields(&fact_fields_fixture(), &SCOPE).unwrap();
        let mapped = posting_fields(&fields, &fact).unwrap();
        assert_eq!(mapped["debit"], amount);
        assert_eq!(decimal(&fields, "debit").unwrap(), amount);
        fields.insert(
            "economic_fact_id".into(),
            ManagerValue::Text("another-fact".into()),
        );
        assert!(matches!(
            posting_fields(&fields, &fact),
            Err(ManagerDraftAdapterError::Economic(
                EconomicDraftError::FactMismatch
            ))
        ));
        fields.insert("debit".into(), ManagerValue::Text(amount.into()));
        assert!(matches!(
            decimal(&fields, "debit"),
            Err(ManagerDraftAdapterError::Field)
        ));
    }

    #[test]
    fn pm_tagged_instance_preserves_revision_and_requires_exact_scope() {
        let mut fields = text_fields(&[
            ("instance_token", "opaque"),
            ("authority_scope_id", "scope"),
            ("alpha_slug", "alpha"),
            ("portfolio_id", "portfolio"),
            ("mode", "paper"),
            ("venue", "okx"),
            ("canonical_strategy_id", "strategy"),
            ("account_id", "account"),
            ("deployment_id", "deployment"),
        ]);
        fields.insert("version".into(), ManagerValue::Integer(i64::MAX));
        let mapped = instance_fields(
            &fields,
            &DraftScope {
                mode: "paper",
                venue: "okx",
            },
        )
        .unwrap();
        assert_eq!(mapped.payload()["version"], "9223372036854775807");
        let mut revision = text_fields(&[
            ("instance_token", "opaque"),
            ("state", "MATERIALIZED_HALTED"),
        ]);
        revision.insert("version".into(), ManagerValue::Integer(i64::MAX));
        revision.insert(
            "effective_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        let mapped_revision = instance_revision_fields(&revision, &mapped).unwrap();
        assert_eq!(mapped_revision["version"], "9223372036854775807");
        assert_eq!(mapped_revision["state"], "MATERIALIZED_HALTED");
        revision.insert("version".into(), ManagerValue::Integer(i64::MAX - 1));
        assert!(matches!(
            instance_revision_fields(&revision, &mapped),
            Err(ManagerDraftAdapterError::Field)
        ));
        revision.insert("version".into(), ManagerValue::Integer(i64::MAX));
        revision.insert(
            "instance_token".into(),
            ManagerValue::Text("another".into()),
        );
        assert!(matches!(
            instance_revision_fields(&revision, &mapped),
            Err(ManagerDraftAdapterError::Field)
        ));
        revision.insert("instance_token".into(), ManagerValue::Text("opaque".into()));
        revision.insert("state".into(), ManagerValue::Text("UNKNOWN".into()));
        assert!(matches!(
            instance_revision_fields(&revision, &mapped),
            Err(ManagerDraftAdapterError::Field)
        ));
        assert!(matches!(
            instance_fields(&fields, &SCOPE),
            Err(ManagerDraftAdapterError::Instance(
                InstanceDraftError::ScopeMismatch
            ))
        ));
    }

    #[test]
    fn position_summary_preserves_unknown_valuation_and_requires_scope() {
        let mut fields = text_fields(&[
            ("economic_scope_key", KEY),
            ("position_key", "position"),
            ("instrument_version", "v1"),
            ("position_side", "BOTH"),
            ("reducer_version", "r1"),
            ("projection_digest", KEY),
            ("valuation_status", "UNKNOWN_REQUIRES_REFERENCE"),
        ]);
        fields.insert("execution_version".into(), ManagerValue::Integer(i64::MAX));
        fields.insert(
            "through_effective_sequence".into(),
            ManagerValue::Integer(2),
        );
        fields.insert(
            "updated_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        let mapped = position_fields(&fields, KEY).unwrap();
        assert_eq!(mapped["execution_version"], "9223372036854775807");
        assert_eq!(mapped["valuation_status"], "UNKNOWN_REQUIRES_REFERENCE");
        assert_eq!(
            mapped["representation"],
            "METADATA_ONLY_NOT_FULL_PROJECTION"
        );
        assert!(mapped.get("projection").is_none());
        assert!(matches!(
            position_fields(&fields, &"a".repeat(64)),
            Err(ManagerDraftAdapterError::Economic(
                EconomicDraftError::ScopeMismatch
            ))
        ));
        fields.insert(
            "valuation_status".into(),
            ManagerValue::Text("VALUED".into()),
        );
        assert!(matches!(
            position_fields(&fields, KEY),
            Err(ManagerDraftAdapterError::Field)
        ));
        fields.insert(
            "valuation_status".into(),
            ManagerValue::Text("UNTOUCHED".into()),
        );
        fields.insert("execution_version".into(), ManagerValue::Integer(-1));
        assert!(matches!(
            position_fields(&fields, KEY),
            Err(ManagerDraftAdapterError::Field)
        ));
    }

    #[test]
    fn full_position_preserves_tagged_nested_values_and_enforces_whole_output_limit() {
        let mut fields = text_fields(&[
            ("economic_scope_key", KEY),
            ("position_key", "position"),
            ("instrument_version", "v1"),
            ("position_side", "LONG"),
            ("reducer_version", "r1"),
            ("projection_digest", KEY),
            ("valuation_status", "UNKNOWN_REQUIRES_REFERENCE"),
        ]);
        fields.insert("execution_version".into(), ManagerValue::Integer(i64::MAX));
        fields.insert(
            "through_effective_sequence".into(),
            ManagerValue::Integer(2),
        );
        fields.insert(
            "updated_at".into(),
            ManagerValue::Timestamp("2026-11-11T15:00:00Z".parse().unwrap()),
        );
        let amount = "99999999999999999999.123456789012345678";
        let mut body = BTreeMap::new();
        body.insert(
            "amount".into(),
            ManagerValue::Decimal(ManagerDecimalString::parse(amount).unwrap()),
        );
        body.insert(
            "nested".into(),
            ManagerValue::Array(vec![ManagerValue::Null, ManagerValue::Text("0".into())]),
        );
        fields.insert("projection".into(), ManagerValue::Object(body));
        let generous = ManagerMaterializationLimits::new(8192, 8192, 8192).unwrap();
        let mapped = full_position_fields(&fields, KEY, generous).unwrap();
        let record = decoded_record(
            "public",
            "economic_position_projections",
            "position_key",
            &fields,
        );
        assert_eq!(map_position_record(&record, KEY, generous).unwrap(), mapped);
        assert_eq!(
            mapped["representation"],
            "BOUNDED_MANAGER_TAGGED_PROJECTION"
        );
        assert_eq!(mapped["projection"]["value"]["amount"]["value"], amount);
        assert_eq!(
            mapped["projection"]["value"]["nested"]["value"][0]["kind"],
            "NULL"
        );
        assert_eq!(
            mapped["projection"]["value"]["nested"]["value"][1]["kind"],
            "TEXT"
        );
        let size = serde_json::to_vec(&mapped).unwrap().len();
        let source_size = serde_json::to_vec(fields.get("projection").unwrap())
            .unwrap()
            .len();
        assert!(full_position_fields(
            &fields,
            KEY,
            ManagerMaterializationLimits::new(size, size, size + source_size).unwrap()
        )
        .is_ok());
        assert!(matches!(
            full_position_fields(
                &fields,
                KEY,
                ManagerMaterializationLimits::new(size - 1, size - 1, size + source_size).unwrap()
            ),
            Err(ManagerDraftAdapterError::Materialization(
                ManagerMaterializationError::RecordJsonLimitExceeded
            ))
        ));
        assert!(matches!(
            full_position_fields(
                &fields,
                KEY,
                ManagerMaterializationLimits::new(size, size, size + source_size - 1).unwrap()
            ),
            Err(ManagerDraftAdapterError::Materialization(
                ManagerMaterializationError::WorkingJsonLimitExceeded
            ))
        ));
        assert!(matches!(
            full_position_fields(&fields, &"a".repeat(64), generous),
            Err(ManagerDraftAdapterError::Economic(
                EconomicDraftError::ScopeMismatch
            ))
        ));
        fields.insert("projection".into(), ManagerValue::Null);
        assert!(matches!(
            full_position_fields(&fields, KEY, generous),
            Err(ManagerDraftAdapterError::Field)
        ));
        fields.remove("projection");
        assert!(matches!(
            full_position_fields(&fields, KEY, generous),
            Err(ManagerDraftAdapterError::Field)
        ));
    }
}
