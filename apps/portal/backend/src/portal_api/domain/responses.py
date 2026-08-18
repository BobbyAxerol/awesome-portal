from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class HealthResponse(ResponseModel):
    status: str
    service: str
    version: str
    quantbt_loaded: bool


class ReadinessResponse(ResponseModel):
    status: Literal["ready"]
    service: str
    version: str
    registry_schema_version: Literal["portal.registry.v1"]
    registry_revision: int
    registry_digest: str


class WindowSummary(ResponseModel):
    role: str
    start_inclusive: datetime
    end_exclusive: datetime
    bars: int


class PreflightCheck(ResponseModel):
    """One preflight gate result (R14): the UI shows which check failed."""

    id: str
    ok: bool
    missing: tuple[str, ...] | None = None
    detail: str | None = None


class PreflightResponse(ResponseModel):
    valid: bool
    strategy_id: str
    dataset_id: str
    symbol: str
    timeframe: str
    windows: tuple[WindowSummary, ...]
    data_quality: dict[str, Any]
    config_hash: str
    fold_plan: dict[str, Any] | None = None
    checks: tuple[PreflightCheck, ...] = ()
    request_id: str | None = None


class StrategyResponse(ResponseModel):
    strategy_id: str
    display_name: str
    version: str
    default_timeframe: str
    required_columns: tuple[str, ...]
    structural_contract: dict[str, Any]
    parameter_space: dict[str, Any]


class DatasetDescriptorResponse(ResponseModel):
    dataset_id: str
    symbol: str | None
    venue: str
    timeframe: str | None
    dynamic_query: bool
    supported_timeframes: tuple[str, ...]
    source_class: str
    data_kind: str
    availability: Literal["available", "unavailable"]
    unavailable_reason: str | None
    usage_scopes: tuple[str, ...]
    excluded_scopes: tuple[str, ...]
    source_timezone: str


class ConfigOptionsResponse(ResponseModel):
    schema_version: str
    protocols: tuple[str, ...]
    target_modes: tuple[str, ...]
    optimization_modes: tuple[str, ...]
    optimization_schedules: tuple[str, ...]
    split_frequencies: tuple[str, ...]
    window_modes: tuple[str, ...]
    position_boundary_policies: tuple[str, ...]
    candidate_selection_metrics: tuple[str, ...]
    compatibility: dict[str, dict[str, str]]
    defaults: dict[str, dict[str, Any]]


class RowEnvelope(ResponseModel):
    """Disclosure envelope for row-table endpoints (v0.5 §12.2).

    ``total_rows`` counts the rows stored in the artifact **before** any
    filter or ``top_n`` cap, so consumers never infer truncation from
    ``returned_rows == top_n``.
    """

    total_rows: int
    returned_rows: int
    rows: list[dict[str, Any]]


class ArtifactProducer(ResponseModel):
    service: str
    artifact: str
    version: str
    as_of: str | None = None
    source_artifact_digest: str | None = None


class FoldPlanDocument(ResponseModel):
    protocol: str
    folds: list[dict[str, Any]]
    artifact_schema_version: str | None = None
    producer: ArtifactProducer | None = None


class PortalErrorDetail(ResponseModel):
    code: str
    message: str


class PortalErrorResponse(ResponseModel):
    error: PortalErrorDetail
    request_id: str


class IngressDiagnostics(ResponseModel):
    forwarded_proto: str | None
    forwarded_for_present: bool


class DependencyState(ResponseModel):
    state: Literal["ready", "available", "unavailable", "disabled"]
    detail: str | None


class RegistryDependency(DependencyState):
    digest: str | None


class HistoricalDataDependency(DependencyState):
    mode: str
    datasets: int | None


class PlanningSummaryDependency(DependencyState):
    mode: str


class WorkerDependency(DependencyState):
    max_workers: int | None


class DependenciesReport(ResponseModel):
    registry: RegistryDependency
    artifact_store: DependencyState
    historical_data: HistoricalDataDependency
    quantbt_engine: DependencyState
    planning_summary: PlanningSummaryDependency
    run_worker: WorkerDependency


class DiagnosticsResponse(ResponseModel):
    status: Literal["ok"]
    service: str
    version: str
    checked_at: datetime
    request_id: str
    traceparent: str
    ingress: IngressDiagnostics
    dependencies: DependenciesReport
