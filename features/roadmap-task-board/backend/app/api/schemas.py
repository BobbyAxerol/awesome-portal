"""Pydantic request models for the public v1 API."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from backend.app.domain.constants import TASK_STATUSES


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TaskCreate(APIModel):
    id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=500)
    workstream: str = Field(default="General", min_length=1, max_length=160)
    phase: str = Field(default="P0", min_length=1, max_length=80)
    weeks: str = Field(default="", max_length=80)
    priority: str = Field(default="P1", max_length=40)
    owner: str = Field(default="Unassigned", max_length=160)
    status: str = Field(default="Backlog")
    notes: Optional[str] = Field(default=None, max_length=8000)
    depends: List[str] = Field(default_factory=list)
    created: Optional[str] = Field(default=None, max_length=80)
    position: Optional[int] = Field(default=None, ge=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError("status must be one of: " + ", ".join(TASK_STATUSES))
        return value

    @field_validator("depends")
    @classmethod
    def validate_depends(cls, value: List[str]) -> List[str]:
        if len(value) > 100:
            raise ValueError("depends may contain at most 100 task IDs")
        cleaned = [item.strip() for item in value if item.strip()]
        if len(cleaned) != len(set(cleaned)):
            raise ValueError("depends must not contain duplicate task IDs")
        return cleaned


class TaskUpdate(APIModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    workstream: Optional[str] = Field(default=None, min_length=1, max_length=160)
    phase: Optional[str] = Field(default=None, min_length=1, max_length=80)
    weeks: Optional[str] = Field(default=None, max_length=80)
    priority: Optional[str] = Field(default=None, max_length=40)
    owner: Optional[str] = Field(default=None, max_length=160)
    notes: Optional[str] = Field(default=None, max_length=8000)
    depends: Optional[List[str]] = None
    created: Optional[str] = Field(default=None, max_length=80)
    expected_version: Optional[int] = Field(default=None, ge=1)

    @field_validator("depends")
    @classmethod
    def validate_depends(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return value
        return TaskCreate.validate_depends(value)


class TaskTransition(APIModel):
    status: str
    expected_version: Optional[int] = Field(default=None, ge=1)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError("status must be one of: " + ", ".join(TASK_STATUSES))
        return value


class TaskMove(APIModel):
    status: str
    position: int = Field(ge=0)
    expected_version: Optional[int] = Field(default=None, ge=1)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in TASK_STATUSES:
            raise ValueError("status must be one of: " + ", ".join(TASK_STATUSES))
        return value


class RestoreRequest(APIModel):
    expected_version: Optional[int] = Field(default=None, ge=1)


class RoadmapPhaseCreate(APIModel):
    id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=240)
    start: int = Field(ge=1, le=520)
    end: int = Field(ge=1, le=520)
    owner: str = Field(default="Unassigned", max_length=160)
    tone: str = Field(default="blue", max_length=40)
    outcome: str = Field(default="", max_length=1000)
    position: Optional[int] = Field(default=None, ge=0)

    @field_validator("end")
    @classmethod
    def validate_range(cls, end: int, info) -> int:
        start = info.data.get("start")
        if start is not None and end < start:
            raise ValueError("end must be greater than or equal to start")
        return end


class RoadmapPhaseUpdate(APIModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=240)
    start: Optional[int] = Field(default=None, ge=1, le=520)
    end: Optional[int] = Field(default=None, ge=1, le=520)
    owner: Optional[str] = Field(default=None, max_length=160)
    tone: Optional[str] = Field(default=None, max_length=40)
    outcome: Optional[str] = Field(default=None, max_length=1000)
    expected_version: Optional[int] = Field(default=None, ge=1)


class RoadmapMove(APIModel):
    position: int = Field(ge=0)
    expected_version: Optional[int] = Field(default=None, ge=1)


class SnapshotImport(APIModel):
    """An explicit destructive replacement for import/reset workflows only."""

    items: List[Dict[str, Any]]
    confirm_replace: Literal[True]


class PlanningSummaryTask(APIModel):
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    status: Literal["Backlog", "Ready", "In Progress", "Validating", "Done"]
    updated_at: datetime


class PlanningSummaryRoadmapPhase(APIModel):
    id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$")
    updated_at: datetime


class PlanningSummaryResponse(APIModel):
    schema_version: Literal["planning.summary.v1"]
    observed_at: datetime
    total_tasks: int = Field(ge=0)
    task_counts: Dict[str, int]
    roadmap_phase_count: int = Field(ge=0)
    recent_tasks: List[PlanningSummaryTask] = Field(max_length=5)
    recent_roadmap: List[PlanningSummaryRoadmapPhase] = Field(max_length=5)

    @field_validator("task_counts")
    @classmethod
    def validate_task_counts(cls, value: Dict[str, int]) -> Dict[str, int]:
        if set(value) != set(TASK_STATUSES):
            raise ValueError("task_counts must contain every current task status")
        if any(count < 0 for count in value.values()):
            raise ValueError("task counts cannot be negative")
        return value

    @model_validator(mode="after")
    def validate_total(self) -> "PlanningSummaryResponse":
        if sum(self.task_counts.values()) != self.total_tasks:
            raise ValueError("task counts must sum to total_tasks")
        return self
