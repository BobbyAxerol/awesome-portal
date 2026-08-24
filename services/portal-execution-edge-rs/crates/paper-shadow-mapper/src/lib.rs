#![forbid(unsafe_code)]

use chrono::{DateTime, Utc};
use execution_contracts::{
    CanonicalId, ExecutionEventFact, FillFact, PaperOrderFact, PositionFact, SourceCompleteness,
    SourceCursor,
};
use projection_core::{
    ProjectionEntityKey, ProjectionEntityKind, ProjectionObservation, SnapshotCompleteness,
};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest as _, Sha256};
use thiserror::Error;
use ts_adapter_v1::{
    map_event, map_fill, map_paper_order, map_position, AdapterError, AdapterPayload,
};

pub const MAPPER_VERSION: &str = "paper-shadow-mapper.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BusinessResource {
    Orders,
    Fills,
    Positions,
    Events,
}

impl BusinessResource {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Orders => "orders",
            Self::Fills => "fills",
            Self::Positions => "positions",
            Self::Events => "events",
        }
    }

    const fn maximum_page_rows(self) -> usize {
        match self {
            Self::Orders | Self::Fills => 1_000,
            Self::Positions => 500,
            Self::Events => 5_000,
        }
    }
}

/// Digest-locked semantics supplied by the owner-published D4 contract.
///
/// This type proves only that all required identities are present and
/// canonical. The runtime authorization gate still binds those digests to the
/// owner-approved window before any business source call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockedSourceSemantics {
    pub contract_revision: String,
    pub route_allowlist_sha256: String,
    pub cursor_contract_sha256: String,
    pub completeness_contract_sha256: String,
    pub resync_contract_sha256: String,
    pub snapshot_poll_interval_ms: i64,
}

impl LockedSourceSemantics {
    /// Validates the source semantics required by the mapper.
    ///
    /// # Errors
    ///
    /// Rejects empty revisions, non-canonical digests and poll intervals
    /// outside the bounded Paper shadow envelope.
    pub fn validate(&self) -> Result<(), MapperError> {
        if self.contract_revision.trim().is_empty()
            || self.contract_revision.trim() != self.contract_revision
        {
            return Err(MapperError::InvalidSourceSemantics);
        }
        for digest in [
            &self.route_allowlist_sha256,
            &self.cursor_contract_sha256,
            &self.completeness_contract_sha256,
            &self.resync_contract_sha256,
        ] {
            if !is_sha256(digest) {
                return Err(MapperError::InvalidSourceSemantics);
            }
        }
        if !(250..=300_000).contains(&self.snapshot_poll_interval_ms) {
            return Err(MapperError::InvalidSourceSemantics);
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct MappingContext {
    pub alpha_id: CanonicalId,
    pub batch_id: CanonicalId,
    pub source_read_at: DateTime<Utc>,
    pub capability_snapshot_id: String,
    pub source: LockedSourceSemantics,
}

impl MappingContext {
    fn validate(&self) -> Result<(), MapperError> {
        self.source.validate()?;
        if self.capability_snapshot_id.trim().is_empty()
            || self.capability_snapshot_id.trim() != self.capability_snapshot_id
        {
            return Err(MapperError::MissingCapabilitySnapshot);
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct MappedBatch {
    pub resource: BusinessResource,
    pub stream_key: String,
    pub source_reported_count: usize,
    pub page_completeness: SnapshotCompleteness,
    pub observations: Vec<ProjectionObservation>,
}

/// Converts one bounded, typed Trading System business response into canonical
/// projection observations. Public capability payloads are never accepted.
///
/// # Errors
///
/// Fails closed on source-scope drift, invalid identifiers/timestamps,
/// non-object payloads, impossible counts, response-page overflow or missing
/// locked source semantics.
pub fn map_business_payload(
    payload: AdapterPayload,
    context: &MappingContext,
) -> Result<MappedBatch, MapperError> {
    context.validate()?;
    match payload {
        AdapterPayload::Orders { count, rows } => {
            let resource = BusinessResource::Orders;
            let reported = validate_page(resource, count, rows.len())?;
            let facts = rows
                .into_iter()
                .map(|row| map_paper_order(row, context.alpha_id.as_str()))
                .collect::<Result<Vec<_>, _>>()?;
            mapped_snapshot(resource, reported, &facts, context, order_observation)
        }
        AdapterPayload::Fills { count, rows } => {
            let resource = BusinessResource::Fills;
            let reported = validate_page(resource, count, rows.len())?;
            let facts = rows
                .into_iter()
                .map(|row| map_fill(row, context.alpha_id.as_str()))
                .collect::<Result<Vec<_>, _>>()?;
            mapped_snapshot(resource, reported, &facts, context, fill_observation)
        }
        AdapterPayload::Positions { count, rows } => {
            let resource = BusinessResource::Positions;
            let reported = validate_page(resource, count, rows.len())?;
            let facts = rows
                .into_iter()
                .map(|row| map_position(row, context.alpha_id.as_str()))
                .collect::<Result<Vec<_>, _>>()?;
            mapped_snapshot(resource, reported, &facts, context, position_observation)
        }
        AdapterPayload::Events { count, rows } => {
            let resource = BusinessResource::Events;
            let reported = validate_page(resource, count, rows.len())?;
            let facts = rows
                .into_iter()
                .map(|row| map_event(row, context.alpha_id.as_str()))
                .collect::<Result<Vec<_>, _>>()?;
            mapped_snapshot(resource, reported, &facts, context, event_observation)
        }
        AdapterPayload::Contracts(_)
        | AdapterPayload::Health(_)
        | AdapterPayload::Capabilities(_) => Err(MapperError::NotBusinessPayload),
    }
}

fn mapped_snapshot<T, F>(
    resource: BusinessResource,
    source_reported_count: usize,
    facts: &[T],
    context: &MappingContext,
    map: F,
) -> Result<MappedBatch, MapperError>
where
    F: Fn(&T, &MappingContext) -> Result<ProjectionObservation, MapperError>,
{
    let observations = facts
        .iter()
        .map(|fact| map(fact, context))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(MappedBatch {
        resource,
        stream_key: format!("paper:{}:{}", context.alpha_id.as_str(), resource.as_str()),
        source_reported_count,
        // One response page is never equivalent to a complete population.
        // Full snapshot completeness belongs to the owner-published paging and
        // watermark orchestrator, not this row mapper.
        page_completeness: SnapshotCompleteness::Partial,
        observations,
    })
}

fn order_observation(
    fact: &PaperOrderFact,
    context: &MappingContext,
) -> Result<ProjectionObservation, MapperError> {
    let entity_id = fact.order.client_order_id.clone();
    let as_of = fact.order.updated_at.or(fact.order.created_at);
    snapshot_observation(
        ProjectionEntityKind::Order,
        entity_id,
        as_of,
        &fact,
        context,
    )
}

fn fill_observation(
    fact: &FillFact,
    context: &MappingContext,
) -> Result<ProjectionObservation, MapperError> {
    let entity_id = fact.fill_id.clone();
    snapshot_observation(
        ProjectionEntityKind::Fill,
        entity_id,
        fact.trade_time,
        &fact,
        context,
    )
}

fn position_observation(
    fact: &PositionFact,
    context: &MappingContext,
) -> Result<ProjectionObservation, MapperError> {
    let entity_id = fact.position_id.clone();
    let as_of = fact.updated_at.or(fact.closed_at).or(fact.opened_at);
    snapshot_observation(
        ProjectionEntityKind::Position,
        entity_id,
        as_of,
        &fact,
        context,
    )
}

fn event_observation(
    fact: &ExecutionEventFact,
    context: &MappingContext,
) -> Result<ProjectionObservation, MapperError> {
    let entity_id = fact.event_id.clone();
    let cursor = SourceCursor {
        event_ts: fact.event_ts,
        created_at: fact.created_at,
        event_id: fact.event_id.clone(),
    };
    let observation = ProjectionObservation {
        ingestion_id: CanonicalId::parse(format!("source-event:{}", entity_id.as_str()))?,
        entity: ProjectionEntityKey {
            kind: ProjectionEntityKind::Event,
            entity_id,
        },
        source_authority: ts_adapter_v1::source_authority(),
        as_of: Some(fact.event_ts),
        source_read_at: context.source_read_at,
        source_cursor: Some(cursor),
        source_sequence: None,
        source_completeness: SourceCompleteness::EventSourced,
        poll_interval_ms: None,
        adapter_version: MAPPER_VERSION.to_owned(),
        capability_snapshot_id: context.capability_snapshot_id.clone(),
        payload: json_object(&fact)?,
    };
    observation.validate()?;
    Ok(observation)
}

fn snapshot_observation<T: Serialize>(
    kind: ProjectionEntityKind,
    entity_id: CanonicalId,
    as_of: Option<DateTime<Utc>>,
    fact: &T,
    context: &MappingContext,
) -> Result<ProjectionObservation, MapperError> {
    let observation = ProjectionObservation {
        ingestion_id: snapshot_ingestion_id(&context.batch_id, kind, &entity_id)?,
        entity: ProjectionEntityKey { kind, entity_id },
        source_authority: ts_adapter_v1::source_authority(),
        as_of,
        source_read_at: context.source_read_at,
        source_cursor: None,
        source_sequence: None,
        source_completeness: SourceCompleteness::PollBounded,
        poll_interval_ms: Some(context.source.snapshot_poll_interval_ms),
        adapter_version: MAPPER_VERSION.to_owned(),
        capability_snapshot_id: context.capability_snapshot_id.clone(),
        payload: json_object(fact)?,
    };
    observation.validate()?;
    Ok(observation)
}

fn snapshot_ingestion_id(
    batch_id: &CanonicalId,
    kind: ProjectionEntityKind,
    entity_id: &CanonicalId,
) -> Result<CanonicalId, MapperError> {
    let mut hasher = Sha256::new();
    hasher.update(batch_id.as_str());
    hasher.update([0]);
    hasher.update(kind.as_str());
    hasher.update([0]);
    hasher.update(entity_id.as_str());
    CanonicalId::parse(format!("snapshot-row:{:x}", hasher.finalize())).map_err(MapperError::from)
}

fn json_object<T: Serialize>(fact: &T) -> Result<Value, MapperError> {
    let value = serde_json::to_value(fact).map_err(|_| MapperError::Serialization)?;
    if value.is_object() {
        Ok(value)
    } else {
        Err(MapperError::Serialization)
    }
}

fn validate_page(
    resource: BusinessResource,
    count: i64,
    rows: usize,
) -> Result<usize, MapperError> {
    let reported = usize::try_from(count).map_err(|_| MapperError::InvalidSourceCount)?;
    if rows > resource.maximum_page_rows() || reported < rows {
        return Err(MapperError::InvalidSourceCount);
    }
    Ok(reported)
}

fn is_sha256(value: &str) -> bool {
    value.len() == 71
        && value.starts_with("sha256:")
        && value[7..]
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum MapperError {
    #[error("D4 source semantics are incomplete or malformed")]
    InvalidSourceSemantics,
    #[error("D4 mapping requires a capability snapshot identity")]
    MissingCapabilitySnapshot,
    #[error("public capability payload is not a Paper business payload")]
    NotBusinessPayload,
    #[error("source response count/page size is invalid")]
    InvalidSourceCount,
    #[error("canonical fact serialization failed")]
    Serialization,
    #[error(transparent)]
    Adapter(#[from] AdapterError),
    #[error(transparent)]
    Contract(#[from] execution_contracts::ContractError),
    #[error(transparent)]
    Projection(#[from] projection_core::ProjectionError),
}

#[cfg(test)]
mod tests;
