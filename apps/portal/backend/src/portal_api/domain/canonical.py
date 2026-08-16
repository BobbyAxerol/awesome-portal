"""Canonical contract models (U09 / BAR-06).

Python runtime projection of the ``packages/contracts`` canonical schemas:
RFC 7807 problem documents, command envelopes (idempotency + optimistic
concurrency) and the guide §6.7 event envelope. These are contract primitives
for the upcoming Control API façade; they do not replace existing service
models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Mapping

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


OpaqueId = Annotated[
    str,
    Field(
        pattern=r"^[a-z][a-z0-9_]{1,15}_(?:[0-9A-HJKMNP-TV-Z]{26}|[0-9a-f]{32})$",
        max_length=64,
    ),
]
UtcTimestamp = Annotated[
    str, Field(pattern=r"^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$", max_length=40)
]
SchemaVersion = Annotated[
    str, Field(pattern=r"^[a-z][a-z0-9.-]{0,31}\.v[0-9]+$", max_length=64)
]
Traceparent = Annotated[
    str,
    Field(pattern=r"^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$"),
]
IdempotencyKey = Annotated[
    str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$")
]
RequestId = Annotated[
    str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
]


class ProblemDocument(ContractModel):
    type: str | None = Field(default=None, max_length=240)
    code: str = Field(pattern=r"^[A-Z][A-Z0-9_]{2,63}$")
    title: str = Field(min_length=1, max_length=120)
    detail: str | None = Field(default=None, min_length=1, max_length=500)
    status: int | None = Field(default=None, ge=400, le=599)
    request_id: RequestId
    traceparent: Traceparent | None = None
    occurred_at: UtcTimestamp | None = None


class CommandEnvelope(ContractModel):
    schema_version: Literal["command-envelope.v1"]
    request_id: OpaqueId
    actor_id: OpaqueId
    workspace_id: OpaqueId
    idempotency_key: IdempotencyKey
    expected_aggregate_version: int | None = Field(default=None, ge=1)
    aggregate_type: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]{1,63}$")
    aggregate_id: OpaqueId | None = None
    payload_schema_version: SchemaVersion
    traceparent: Traceparent | None = None
    payload: Mapping[str, object] = Field(default_factory=dict)


class EventEnvelope(ContractModel):
    event_id: OpaqueId
    event_type: str = Field(pattern=r"^[a-z][a-z0-9.]{2,127}\.v[0-9]+$")
    schema_version: int = Field(ge=1)
    aggregate_type: str = Field(pattern=r"^[a-z][a-z0-9_]{1,63}$")
    aggregate_id: OpaqueId
    aggregate_version: int = Field(ge=1)
    workspace_id: OpaqueId
    occurred_at: UtcTimestamp
    produced_at: UtcTimestamp
    producer: str = Field(pattern=r"^[a-z][a-z0-9-]{1,63}@[a-z0-9.-]{1,63}$", max_length=160)
    traceparent: Traceparent | None = None
    idempotency_key: IdempotencyKey
    payload: Mapping[str, object] = Field(default_factory=dict)

    @field_validator("occurred_at", "produced_at")
    @classmethod
    def validate_utc(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("canonical timestamps must be timezone-aware UTC")
        return value


__all__ = [
    "CommandEnvelope",
    "ContractModel",
    "EventEnvelope",
    "ProblemDocument",
]
