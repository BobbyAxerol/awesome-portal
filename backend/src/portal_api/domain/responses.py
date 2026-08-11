from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class HealthResponse(ResponseModel):
    status: str
    service: str
    version: str
    quantbt_loaded: bool


class WindowSummary(ResponseModel):
    role: str
    start_inclusive: datetime
    end_exclusive: datetime
    bars: int


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


class StrategyResponse(ResponseModel):
    strategy_id: str
    display_name: str
    version: str
    default_timeframe: str
    required_columns: tuple[str, ...]
    structural_contract: dict[str, Any]
    parameter_space: dict[str, Any]
