use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    CanonicalId, ContractError, DecimalString, FreshnessState, SourceAuthority, SourceCompleteness,
    SourceCursor,
};

pub const EXECUTION_EVENT_SCHEMA_VERSION: &str = "execution.event.v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionEventType {
    #[serde(rename = "order.updated")]
    OrderUpdated,
    #[serde(rename = "fill.recorded")]
    FillRecorded,
    #[serde(rename = "position.updated")]
    PositionUpdated,
    #[serde(rename = "source_event.observed")]
    SourceEventObserved,
    #[serde(rename = "runtime.updated")]
    RuntimeUpdated,
    #[serde(rename = "account.updated")]
    AccountUpdated,
    #[serde(rename = "broker_binding.updated")]
    BrokerBindingUpdated,
    #[serde(rename = "reconciliation.updated")]
    ReconciliationUpdated,
    #[serde(rename = "performance.updated")]
    PerformanceUpdated,
    #[serde(rename = "operation.updated")]
    OperationUpdated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "event_type", content = "payload")]
pub enum ExecutionEvent {
    #[serde(rename = "order.updated")]
    OrderUpdated(OrderUpdatedPayload),
    #[serde(rename = "fill.recorded")]
    FillRecorded(FillRecordedPayload),
    #[serde(rename = "position.updated")]
    PositionUpdated(PositionUpdatedPayload),
    #[serde(rename = "source_event.observed")]
    SourceEventObserved(SourceEventObservedPayload),
    #[serde(rename = "runtime.updated")]
    RuntimeUpdated(RuntimeUpdatedPayload),
    #[serde(rename = "account.updated")]
    AccountUpdated(AccountUpdatedPayload),
    #[serde(rename = "broker_binding.updated")]
    BrokerBindingUpdated(BrokerBindingUpdatedPayload),
    #[serde(rename = "reconciliation.updated")]
    ReconciliationUpdated(ReconciliationUpdatedPayload),
    #[serde(rename = "performance.updated")]
    PerformanceUpdated(PerformanceUpdatedPayload),
    #[serde(rename = "operation.updated")]
    OperationUpdated(OperationUpdatedPayload),
}

impl ExecutionEvent {
    #[must_use]
    pub const fn event_type(&self) -> ExecutionEventType {
        match self {
            Self::OrderUpdated(_) => ExecutionEventType::OrderUpdated,
            Self::FillRecorded(_) => ExecutionEventType::FillRecorded,
            Self::PositionUpdated(_) => ExecutionEventType::PositionUpdated,
            Self::SourceEventObserved(_) => ExecutionEventType::SourceEventObserved,
            Self::RuntimeUpdated(_) => ExecutionEventType::RuntimeUpdated,
            Self::AccountUpdated(_) => ExecutionEventType::AccountUpdated,
            Self::BrokerBindingUpdated(_) => ExecutionEventType::BrokerBindingUpdated,
            Self::ReconciliationUpdated(_) => ExecutionEventType::ReconciliationUpdated,
            Self::PerformanceUpdated(_) => ExecutionEventType::PerformanceUpdated,
            Self::OperationUpdated(_) => ExecutionEventType::OperationUpdated,
        }
    }

    #[must_use]
    pub const fn entity_kind(&self) -> &'static str {
        match self {
            Self::OrderUpdated(_) => "order",
            Self::FillRecorded(_) => "fill",
            Self::PositionUpdated(_) => "position",
            Self::SourceEventObserved(_) => "event",
            Self::RuntimeUpdated(_) => "runtime",
            Self::AccountUpdated(_) => "account",
            Self::BrokerBindingUpdated(_) => "broker_binding",
            Self::ReconciliationUpdated(_) => "reconciliation",
            Self::PerformanceUpdated(_) => "performance",
            Self::OperationUpdated(_) => "operation",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionEventEnvelopeInput {
    pub workspace_id: CanonicalId,
    pub environment: String,
    pub projection_epoch: String,
    pub projection_sequence: u64,
    pub entity_id: CanonicalId,
    pub source_authority: SourceAuthority,
    pub source_cursor: Option<SourceCursor>,
    pub source_sequence: Option<i64>,
    pub source_completeness: SourceCompleteness,
    pub as_of: Option<DateTime<Utc>>,
    pub source_read_at: DateTime<Utc>,
    pub projected_at: DateTime<Utc>,
    pub freshness: FreshnessState,
    pub freshness_policy_version: String,
    pub source_discontinuity: bool,
    pub event: ExecutionEvent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionEventEnvelope {
    schema_version: String,
    pub workspace_id: CanonicalId,
    pub environment: String,
    pub projection_epoch: String,
    pub projection_sequence: u64,
    entity_kind: String,
    pub entity_id: CanonicalId,
    pub source_authority: SourceAuthority,
    pub source_cursor: Option<SourceCursor>,
    pub source_sequence: Option<i64>,
    pub source_completeness: SourceCompleteness,
    pub as_of: Option<DateTime<Utc>>,
    pub source_read_at: DateTime<Utc>,
    pub projected_at: DateTime<Utc>,
    pub freshness: FreshnessState,
    pub freshness_policy_version: String,
    pub source_discontinuity: bool,
    #[serde(flatten)]
    pub event: ExecutionEvent,
}

impl ExecutionEventEnvelope {
    #[must_use]
    pub fn new(input: ExecutionEventEnvelopeInput) -> Self {
        let entity_kind = input.event.entity_kind().to_owned();
        Self {
            schema_version: EXECUTION_EVENT_SCHEMA_VERSION.to_owned(),
            workspace_id: input.workspace_id,
            environment: input.environment,
            projection_epoch: input.projection_epoch,
            projection_sequence: input.projection_sequence,
            entity_kind,
            entity_id: input.entity_id,
            source_authority: input.source_authority,
            source_cursor: input.source_cursor,
            source_sequence: input.source_sequence,
            source_completeness: input.source_completeness,
            as_of: input.as_of,
            source_read_at: input.source_read_at,
            projected_at: input.projected_at,
            freshness: input.freshness,
            freshness_policy_version: input.freshness_policy_version,
            source_discontinuity: input.source_discontinuity,
            event: input.event,
        }
    }

    #[must_use]
    pub fn schema_version(&self) -> &str {
        &self.schema_version
    }

    #[must_use]
    pub fn entity_kind(&self) -> &str {
        &self.entity_kind
    }

    /// Validates deserialized input before it is accepted by a stream mapper.
    ///
    /// # Errors
    ///
    /// Rejects schema-version or event/entity discriminator drift.
    pub fn validate(&self) -> Result<(), ContractError> {
        if self.schema_version != EXECUTION_EVENT_SCHEMA_VERSION
            || self.entity_kind != self.event.entity_kind()
        {
            return Err(ContractError::InvalidEventEnvelope);
        }
        Ok(())
    }
}

macro_rules! payload {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
        pub struct $name { $(pub $field: $ty),* }
    };
}

payload!(OrderUpdatedPayload {
    order_id: CanonicalId,
    status: String,
    quantity: DecimalString,
    price: Option<DecimalString>,
    currency: String,
});
payload!(FillRecordedPayload {
    fill_id: CanonicalId,
    order_id: CanonicalId,
    quantity: DecimalString,
    price: DecimalString,
    fee: Option<DecimalString>,
    currency: String,
    liquidity: String,
});
payload!(PositionUpdatedPayload {
    position_id: CanonicalId,
    instrument_id: CanonicalId,
    quantity: DecimalString,
    mark_price: Option<DecimalString>,
    unrealized_pnl: Option<DecimalString>,
    currency: String,
});
payload!(SourceEventObservedPayload {
    source_event_id: CanonicalId,
    source_event_type: String,
    occurred_at: DateTime<Utc>,
});
payload!(RuntimeUpdatedPayload {
    runtime_id: CanonicalId,
    state: String,
    reason: Option<String>,
});
payload!(AccountUpdatedPayload {
    account_id: CanonicalId,
    currency: String,
    equity: DecimalString,
    available: DecimalString,
});
payload!(BrokerBindingUpdatedPayload {
    binding_id: CanonicalId,
    state: String,
    sync_age_seconds: Option<u64>,
});
payload!(ReconciliationUpdatedPayload {
    finding_id: CanonicalId,
    severity: String,
    state: String,
    difference: Option<DecimalString>,
    currency: Option<String>,
});
payload!(PerformanceUpdatedPayload {
    deployment_id: CanonicalId,
    currency: String,
    equity: DecimalString,
    drawdown: DecimalString,
});
payload!(OperationUpdatedPayload {
    operation_id: CanonicalId,
    state: String,
    incident_id: Option<CanonicalId>,
});

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(event: ExecutionEvent) -> ExecutionEventEnvelope {
        let now = DateTime::from_timestamp(1_777_737_600, 0).unwrap();
        ExecutionEventEnvelope::new(ExecutionEventEnvelopeInput {
            workspace_id: CanonicalId::parse("workspace-fixture").unwrap(),
            environment: "paper".to_owned(),
            projection_epoch: "018f47a4-b9d1-7a16-a4cd-3f75cf4d6200".to_owned(),
            projection_sequence: 42,
            entity_id: CanonicalId::parse("entity-fixture").unwrap(),
            source_authority: SourceAuthority::Execution,
            source_cursor: None,
            source_sequence: Some(42),
            source_completeness: SourceCompleteness::EventSourced,
            as_of: Some(now),
            source_read_at: now,
            projected_at: now,
            freshness: FreshnessState::Ok,
            freshness_policy_version: "execution.paper.v1".to_owned(),
            source_discontinuity: false,
            event,
        })
    }

    #[test]
    fn schema_version_is_one_canonical_string_and_discriminator_is_derived() {
        let value = envelope(ExecutionEvent::OrderUpdated(OrderUpdatedPayload {
            order_id: CanonicalId::parse("ord_1").unwrap(),
            status: "WORKING".to_owned(),
            quantity: DecimalString::parse("1.000000000000000001").unwrap(),
            price: Some(DecimalString::parse("60000.5").unwrap()),
            currency: "USDT".to_owned(),
        }));
        let json = serde_json::to_value(&value).unwrap();
        assert_eq!(json["schema_version"], EXECUTION_EVENT_SCHEMA_VERSION);
        assert_eq!(json["event_type"], "order.updated");
        assert_eq!(json["entity_kind"], "order");
        assert!(json["payload"]["quantity"].is_string());
        value.validate().unwrap();
    }

    #[test]
    fn rejects_deserialized_version_or_discriminator_drift() {
        let value = envelope(ExecutionEvent::RuntimeUpdated(RuntimeUpdatedPayload {
            runtime_id: CanonicalId::parse("runtime_1").unwrap(),
            state: "READY".to_owned(),
            reason: None,
        }));
        let mut json = serde_json::to_value(value).unwrap();
        json["schema_version"] = serde_json::json!(1);
        assert!(serde_json::from_value::<ExecutionEventEnvelope>(json).is_err());

        let mut json = serde_json::to_value(envelope(ExecutionEvent::RuntimeUpdated(
            RuntimeUpdatedPayload {
                runtime_id: CanonicalId::parse("runtime_1").unwrap(),
                state: "READY".to_owned(),
                reason: None,
            },
        )))
        .unwrap();
        json["entity_kind"] = serde_json::json!("order");
        assert_eq!(
            serde_json::from_value::<ExecutionEventEnvelope>(json)
                .unwrap()
                .validate(),
            Err(ContractError::InvalidEventEnvelope)
        );
    }

    #[test]
    fn canonical_execution_mapper_corpus_deserializes_through_rust() {
        let fixtures: Vec<ExecutionEventEnvelope> = serde_json::from_str(include_str!(
            "../../../../../packages/contracts/fixtures/execution-events.corpus.valid.json"
        ))
        .unwrap();

        assert_eq!(fixtures.len(), 10);
        for fixture in fixtures {
            assert_eq!(fixture.schema_version(), EXECUTION_EVENT_SCHEMA_VERSION);
            assert_eq!(fixture.entity_kind(), fixture.event.entity_kind());
            fixture.validate().unwrap();
        }
    }
}
