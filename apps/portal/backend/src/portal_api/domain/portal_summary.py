from __future__ import annotations

from datetime import datetime
from types import MappingProxyType
from typing import Annotated, Callable, Literal, Mapping, Protocol

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_serializer,
    field_validator,
    model_validator,
)

from portal_api.domain.portal_registry import FeatureMaturity, PortalEnvironment


AvailabilityState = Literal[
    "available",
    "unavailable",
    "degraded",
    "stale",
    "denied",
    "commissioned",
]
AvailabilityReason = Literal[
    "CAPABILITY_NOT_IMPLEMENTED",
    "UPSTREAM_UNAVAILABLE",
    "UPSTREAM_TIMEOUT",
    "INCOMPATIBLE_CONTRACT",
    "SOURCE_DATA_UNAVAILABLE",
    "LOCAL_ONLY_STATE",
    "PERMISSION_DENIED",
    "STALE_OBSERVATION",
    "PARTIAL_SOURCE_FAILURE",
]
PriorityType = Literal[
    "RUN_FAILED",
    "HISTORICAL_DATA_UNAVAILABLE",
    "REGISTRY_BLOCKING_CONCERN",
]
PlanningTaskStatus = Literal[
    "Backlog",
    "Ready",
    "In Progress",
    "Validating",
    "Done",
]
PLANNING_TASK_STATUSES: tuple[PlanningTaskStatus, ...] = (
    "Backlog",
    "Ready",
    "In Progress",
    "Validating",
    "Done",
)
FEATURE_MATURITIES: tuple[FeatureMaturity, ...] = (
    "AVAILABLE",
    "PROTOTYPE",
    "COMMISSIONED",
    "BLOCKED",
    "HIDDEN",
    "DEPRECATED",
)
MAX_SUMMARY_SECTIONS = 32
MAX_SUMMARY_PRIORITY_ITEMS = 50
MAX_SECTION_RECENT_ITEMS = 5
MAX_SECTION_WARNINGS = 5
ContentDigest = Annotated[str, Field(pattern=r"^sha256:[0-9a-f]{64}$")]


def _require_timezone(value: datetime | None) -> datetime | None:
    if value is not None and (value.tzinfo is None or value.utcoffset() is None):
        raise ValueError("summary timestamps must include a timezone")
    return value


def _require_safe_route(value: str) -> str:
    if value.startswith("//"):
        raise ValueError("summary routes cannot be scheme-relative")
    return value


class SummaryModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AvailabilityAuthority(SummaryModel):
    service: str
    contract: str
    endpoint: str | None


class AvailabilityProvenance(SummaryModel):
    source_revision: str | None
    content_digest: ContentDigest | None


class CapabilityAvailability(SummaryModel):
    state: AvailabilityState
    reason_code: AvailabilityReason | None
    detail: str | None
    retryable: bool
    checked_at: datetime
    as_of: datetime | None
    stale_after_seconds: int | None = Field(ge=0)
    authority: AvailabilityAuthority
    provenance: AvailabilityProvenance

    _checked_at_timezone = field_validator("checked_at")(_require_timezone)
    _as_of_timezone = field_validator("as_of")(_require_timezone)

    @model_validator(mode="after")
    def validate_reason_semantics(self) -> "CapabilityAvailability":
        if self.state == "available" and self.reason_code is not None:
            raise ValueError("available evidence cannot have a failure reason")
        if self.state != "available" and self.reason_code is None:
            raise ValueError("non-available evidence requires a reason code")
        return self


class EvidenceValue(SummaryModel):
    availability: CapabilityAvailability
    value: float | int | str | None
    unit: str | None
    timezone: str | None
    segment: str | None
    source_artifact_digest: ContentDigest | None

    @model_validator(mode="after")
    def validate_unavailable_value(self) -> "EvidenceValue":
        if self.availability.state in {"unavailable", "denied", "commissioned"}:
            if self.value is not None:
                raise ValueError("unavailable evidence value must be null")
        return self


class SummaryLinkItem(SummaryModel):
    id: str
    label: str
    route: str = Field(pattern=r"^/", max_length=240)
    resource_id: str | None
    observed_at: datetime
    authority: str

    _observed_at_timezone = field_validator("observed_at")(_require_timezone)
    _route_safe = field_validator("route")(_require_safe_route)


class SummaryWarning(SummaryModel):
    code: str
    severity: Literal["warning", "error"]
    title: str
    detail: str
    observed_at: datetime
    evidence_digest: ContentDigest | None

    _observed_at_timezone = field_validator("observed_at")(_require_timezone)


class PriorityItem(SummaryModel):
    id: str
    type: PriorityType
    severity: Literal["critical", "warning", "info"]
    title: str
    feature_id: str
    resource_id: str | None
    observed_at: datetime
    authority: str
    route: str = Field(pattern=r"^/", max_length=240)
    evidence_digest: ContentDigest | None

    _observed_at_timezone = field_validator("observed_at")(_require_timezone)
    _route_safe = field_validator("route")(_require_safe_route)


class PortalSummarySection(SummaryModel):
    source_id: str
    feature_id: str
    label: str
    availability: CapabilityAvailability
    metrics: Mapping[str, EvidenceValue]
    recent_items: tuple[SummaryLinkItem, ...]
    warnings: tuple[SummaryWarning, ...]

    @field_validator("metrics", mode="after")
    @classmethod
    def freeze_metrics(
        cls, value: Mapping[str, EvidenceValue]
    ) -> Mapping[str, EvidenceValue]:
        return MappingProxyType(dict(value))

    @field_serializer("metrics")
    def serialize_metrics(self, value: Mapping[str, EvidenceValue]) -> dict[str, object]:
        return dict(value)


class PortalSummaryContribution(SummaryModel):
    section: PortalSummarySection
    priority_items: tuple[PriorityItem, ...]


class SummaryContext(SummaryModel):
    registry_digest: ContentDigest
    environment: PortalEnvironment
    requested_at: datetime

    _requested_at_timezone = field_validator("requested_at")(_require_timezone)


class CurrentRunSnapshot(SummaryModel):
    run_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
    status: str = Field(min_length=1, max_length=64)
    protocol: str | None = Field(default=None, max_length=120)
    strategy_id: str | None = Field(default=None, max_length=160)
    symbol: str | None = Field(default=None, max_length=64)
    timeframe: str | None = Field(default=None, max_length=32)
    created_at: datetime | None
    completed_at: datetime | None

    _created_at_timezone = field_validator("created_at")(_require_timezone)
    _completed_at_timezone = field_validator("completed_at")(_require_timezone)

    @property
    def observed_at(self) -> datetime | None:
        return self.completed_at or self.created_at


class CurrentRunInventory(SummaryModel):
    total_runs: int = Field(ge=0)
    state_counts: Mapping[str, int]
    recent_runs: tuple[CurrentRunSnapshot, ...]
    truncated: bool

    @field_validator("state_counts", mode="after")
    @classmethod
    def freeze_state_counts(cls, value: Mapping[str, int]) -> Mapping[str, int]:
        if any(count < 0 for count in value.values()):
            raise ValueError("run state counts cannot be negative")
        return MappingProxyType(dict(value))

    @field_serializer("state_counts")
    def serialize_state_counts(self, value: Mapping[str, int]) -> dict[str, int]:
        return dict(value)

    @model_validator(mode="after")
    def validate_inventory(self) -> "CurrentRunInventory":
        if sum(self.state_counts.values()) != self.total_runs:
            raise ValueError("run state counts must sum to total_runs")
        if len(self.recent_runs) > self.total_runs:
            raise ValueError("recent runs cannot exceed total_runs")
        if self.truncated != (len(self.recent_runs) < self.total_runs):
            raise ValueError("run inventory truncated flag is inconsistent")
        return self


class HistoricalCapabilitySnapshot(SummaryModel):
    state: Literal["available", "unavailable"]
    dataset_count: int = Field(ge=0)
    dataset_ids: tuple[str, ...]
    source_revision: str | None

    @model_validator(mode="after")
    def validate_count(self) -> "HistoricalCapabilitySnapshot":
        if self.state == "unavailable" and self.dataset_count != 0:
            raise ValueError("unavailable historical capability cannot report a count")
        if self.dataset_count != len(self.dataset_ids):
            raise ValueError("historical dataset count does not match dataset IDs")
        return self


class PlanningSummaryTask(SummaryModel):
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    status: PlanningTaskStatus
    updated_at: datetime

    _updated_at_timezone = field_validator("updated_at")(_require_timezone)


class PlanningSummaryRoadmapPhase(SummaryModel):
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    updated_at: datetime

    _updated_at_timezone = field_validator("updated_at")(_require_timezone)


class PlanningSummarySnapshot(SummaryModel):
    schema_version: Literal["planning.summary.v1"]
    observed_at: datetime
    total_tasks: StrictInt = Field(ge=0)
    task_counts: Mapping[PlanningTaskStatus, StrictInt]
    roadmap_phase_count: StrictInt = Field(ge=0)
    recent_tasks: tuple[PlanningSummaryTask, ...] = Field(max_length=5)
    recent_roadmap: tuple[PlanningSummaryRoadmapPhase, ...] = Field(max_length=5)

    _observed_at_timezone = field_validator("observed_at")(_require_timezone)

    @field_validator("task_counts", mode="after")
    @classmethod
    def freeze_task_counts(
        cls, value: Mapping[PlanningTaskStatus, StrictInt]
    ) -> Mapping[PlanningTaskStatus, StrictInt]:
        if set(value) != set(PLANNING_TASK_STATUSES):
            raise ValueError("task counts must contain every current Planning status")
        if any(count < 0 for count in value.values()):
            raise ValueError("task counts cannot be negative")
        return MappingProxyType(dict(value))

    @field_serializer("task_counts")
    def serialize_task_counts(
        self, value: Mapping[PlanningTaskStatus, int]
    ) -> dict[str, int]:
        return dict(value)

    @model_validator(mode="after")
    def validate_task_total(self) -> "PlanningSummarySnapshot":
        if sum(self.task_counts.values()) != self.total_tasks:
            raise ValueError("task counts must sum to total_tasks")
        return self


class RegistryCounts(SummaryModel):
    by_maturity: Mapping[FeatureMaturity, int]
    blocking_concerns: int = Field(ge=0)

    @field_validator("by_maturity", mode="after")
    @classmethod
    def freeze_by_maturity(
        cls, value: Mapping[FeatureMaturity, int]
    ) -> Mapping[FeatureMaturity, int]:
        if set(value) != set(FEATURE_MATURITIES):
            raise ValueError("by_maturity must contain every FeatureMaturity")
        if any(count < 0 for count in value.values()):
            raise ValueError("maturity counts cannot be negative")
        return MappingProxyType(dict(value))

    @field_serializer("by_maturity")
    def serialize_by_maturity(
        self, value: Mapping[FeatureMaturity, int]
    ) -> dict[str, int]:
        return dict(value)


class PortalSummaryV1(SummaryModel):
    schema_version: Literal["portal.summary.v1"]
    registry_digest: ContentDigest
    environment: PortalEnvironment
    requested_at: datetime
    completed_at: datetime
    overall_availability: CapabilityAvailability
    registry_counts: RegistryCounts
    sections: tuple[PortalSummarySection, ...] = Field(max_length=MAX_SUMMARY_SECTIONS)
    priority_items: tuple[PriorityItem, ...] = Field(max_length=MAX_SUMMARY_PRIORITY_ITEMS)

    _requested_at_timezone = field_validator("requested_at")(_require_timezone)
    _completed_at_timezone = field_validator("completed_at")(_require_timezone)

    @model_validator(mode="after")
    def validate_bounded_evidence(self) -> "PortalSummaryV1":
        for section in self.sections:
            if len(section.recent_items) > MAX_SECTION_RECENT_ITEMS:
                raise ValueError("summary sections bound recent items to five")
            if len(section.warnings) > MAX_SECTION_WARNINGS:
                raise ValueError("summary sections bound warnings to five")
        return self


class CurrentRunSummaryPort(Protocol):
    def read_current_runs(self, *, limit: int) -> CurrentRunInventory: ...


class HistoricalCapabilityPort(Protocol):
    def read_historical_capability(self) -> HistoricalCapabilitySnapshot: ...


class PlanningSummaryReadPort(Protocol):
    async def read_planning_summary(
        self, *, deadline: float
    ) -> PlanningSummarySnapshot: ...


class PortalSummaryAdapter(Protocol):
    source_id: str

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummaryContribution: ...

    def unavailable_contribution(
        self,
        *,
        reason_code: Literal["UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE"],
        checked_at: datetime,
    ) -> PortalSummaryContribution: ...


SummaryClock = Callable[[], datetime]


__all__ = [
    "AvailabilityAuthority",
    "AvailabilityProvenance",
    "CapabilityAvailability",
    "CurrentRunInventory",
    "CurrentRunSnapshot",
    "CurrentRunSummaryPort",
    "EvidenceValue",
    "FEATURE_MATURITIES",
    "HistoricalCapabilityPort",
    "HistoricalCapabilitySnapshot",
    "MAX_SECTION_RECENT_ITEMS",
    "MAX_SECTION_WARNINGS",
    "MAX_SUMMARY_PRIORITY_ITEMS",
    "MAX_SUMMARY_SECTIONS",
    "PLANNING_TASK_STATUSES",
    "PlanningSummaryReadPort",
    "PlanningSummaryRoadmapPhase",
    "PlanningSummarySnapshot",
    "PlanningSummaryTask",
    "PortalSummaryAdapter",
    "PortalSummaryContribution",
    "PortalSummarySection",
    "PortalSummaryV1",
    "PriorityItem",
    "RegistryCounts",
    "SummaryClock",
    "SummaryContext",
    "SummaryLinkItem",
    "SummaryWarning",
]
