"""Run process worker (Phase P4, plan §4.1/§9).

Executes one run in a dedicated process so WFO/Numba work never blocks the
API loop and its RSS is released when the run finishes. The worker receives
only picklable inputs (the canonical request JSON), reloads the market tape
itself, writes stage-accurate progress to the run status file and honors the
cancel flag between stages.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from portal_api.adapters.market_data import (
    DatasetDescriptor,
    PreparedMarketData,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import RunState
from portal_api.domain.errors import RunCancelledError
from portal_api.domain.requests import PortalRunRequest
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.serialization import canonicalize
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
from portal_api.services.three_window_runner import ThreeWindowRunner
from portal_api.strategies import StrategyRegistry


logger = logging.getLogger(__name__)

THREE_WINDOW_STAGES: tuple[RunState, ...] = (
    RunState.QUEUED,
    RunState.VALIDATING_DATA,
    RunState.WARMING_KERNEL,
    RunState.OPTIMIZING_IS,
    RunState.RANKING_IS_CANDIDATES,
    RunState.REPLAYING_CANDIDATES_ON_OOS,
    RunState.SELECTING_PARAMS,
    RunState.FREEZING_PARAMS,
    RunState.BACKTESTING_IS,
    RunState.BACKTESTING_OOS,
    RunState.BACKTESTING_HOLDOUT_LIVE,
    RunState.BUILDING_ARTIFACTS,
    RunState.COMPLETED,
)

ADVANCED_STAGES: tuple[RunState, ...] = (
    RunState.QUEUED,
    RunState.VALIDATING_DATA,
    RunState.WARMING_KERNEL,
    RunState.OPTIMIZING_IS,
    RunState.RANKING_IS_CANDIDATES,
    RunState.REPLAYING_CANDIDATES_ON_OOS,
    RunState.SELECTING_PARAMS,
    RunState.FREEZING_PARAMS,
    RunState.BUILDING_ARTIFACTS,
    RunState.COMPLETED,
)


def _market_path_env(request: PortalRunRequest) -> str | None:
    """Test override: PORTAL_RUNNER_MARKET_PATH points at a Parquet tape."""
    return os.getenv("PORTAL_RUNNER_MARKET_PATH")


def _load_market(request: PortalRunRequest) -> PreparedMarketData:
    override = _market_path_env(request)
    if override:
        import pandas as pd

        frame = pd.read_parquet(override)
        return PreparedMarketData(
            frame=frame,
            descriptor=DatasetDescriptor(
                dataset_id=request.dataset_id,
                symbol=request.symbol,
                venue="BINANCE",
                timeframe=request.timeframe,
            ),
            content_hash=f"override-{Path(override).name}",
            missing_bar_count=0,
        )
    from portal_api.adapters.market_data import CryptoBinanceMarketDataProvider

    pool_alpha_root = Path(__file__).resolve().parents[5]
    loader_root = Path(
        os.getenv(
            "PORTAL_CRYPTO_DATA_ROOT",
            str(pool_alpha_root / "alphas_storage" / "_get_data"),
        )
    )
    provider = CryptoBinanceMarketDataProvider(
        loader_root, engine=os.getenv("PORTAL_CRYPTO_RESAMPLE_ENGINE", "duckdb")
    )
    return provider.load(
        request.dataset_id, symbol=request.symbol, timeframe=request.timeframe
    )


def _read_status(artifacts: ArtifactRepository, run_id: str) -> dict[str, Any]:
    try:
        return artifacts.read_json(run_id, "status.json")
    except FileNotFoundError:
        return {"run_id": run_id, "state": RunState.QUEUED.value, "events": []}


def _write_status(
    artifacts: ArtifactRepository,
    run_id: str,
    *,
    state: RunState | str,
    stages: tuple[RunState, ...],
    started_at: str | None = None,
    completed_at: str | None = None,
    failure: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    if not isinstance(state, RunState):
        state = RunState(state)
    status = _read_status(artifacts, run_id)
    status["state"] = state.value
    status["stage_index"] = stages.index(state) if state in stages else None
    status["stage_count"] = len(stages)
    if started_at:
        status["started_at"] = started_at
    if completed_at:
        status["completed_at"] = completed_at
    status["failure"] = failure
    if extra:
        status.update(extra)
    status.setdefault("events", []).append({"state": state.value, "at": time.time()})
    artifacts.write_json(run_id, "status.json", canonicalize(status))


def _cancel_requested(artifacts: ArtifactRepository, run_id: str) -> bool:
    return (artifacts.run_directory(run_id) / ".cancel").exists()


def _install_console_tee(artifacts: ArtifactRepository, run_id: str) -> None:
    """Tee the worker's stdout/stderr into ``status/console.log``.

    Optuna/QuantBT print every trial as it is evaluated; the API exposes the
    tail of this file so the UI can stream real per-trial progress. The log is
    an operational capture, never parsed into structured audit events.
    """
    import sys

    log_path = artifacts.run_directory(run_id, create=True) / "status" / "console.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(log_path, "a", encoding="utf-8", buffering=1)

    class _Tee:
        def __init__(self, stream, file_handle):
            self._stream = stream
            self._handle = file_handle

        def write(self, data: str) -> int:
            self._stream.write(data)
            self._handle.write(data)
            return len(data)

        def flush(self) -> None:
            self._stream.flush()
            self._handle.flush()

        def isatty(self) -> bool:
            return False

    sys.stdout = _Tee(sys.__stdout__, handle)
    sys.stderr = _Tee(sys.__stderr__, handle)


def execute_run(
    *,
    request_json: dict[str, Any],
    run_id: str,
    artifact_root: str,
) -> dict[str, Any]:
    """Top-level worker entry; safe to submit to ProcessPoolExecutor."""
    request = PortalRunRequest.model_validate(request_json)
    artifacts = ArtifactRepository(Path(artifact_root))
    gateway = QuantBTGateway()
    strategies = StrategyRegistry()

    stages = (
        THREE_WINDOW_STAGES
        if request.protocol.value == "three_window_decay"
        else ADVANCED_STAGES
    )
    from datetime import UTC, datetime

    started_at = datetime.now(UTC).isoformat()
    _write_status(
        artifacts,
        run_id,
        state=RunState.VALIDATING_DATA,
        stages=stages,
        started_at=started_at,
        extra={
            "protocol": request.protocol.value,
            "strategy_id": request.strategy_id,
            "symbol": request.symbol,
            "timeframe": request.timeframe,
            "dataset_id": request.dataset_id,
        },
    )
    _install_console_tee(artifacts, run_id)
    market = _load_market(request)

    def progress(state: RunState) -> None:
        if _cancel_requested(artifacts, run_id):
            raise RunCancelledError(f"run {run_id} cancelled by user")
        _write_status(artifacts, run_id, state=state, stages=stages)

    try:
        from strategy.delta_rsi import warm_up

        progress(RunState.WARMING_KERNEL)
        warm_up()

        if request.protocol.value == "three_window_decay":
            runner = ThreeWindowRunner(
                gateway=gateway, strategies=strategies, artifacts=artifacts
            )
            result = runner.run(request, market, run_id, progress=progress)
        else:
            runner = AdvancedWalkForwardRunner(gateway=gateway, artifacts=artifacts)
            result = runner.run(request, market, run_id, progress=progress)
    except RunCancelledError:
        _write_status(
            artifacts,
            run_id,
            state=RunState.CANCELLED,
            stages=stages,
            completed_at=datetime.now(UTC).isoformat(),
            failure={"code": "RUN_CANCELLED", "message": "cancelled by user"},
        )
        raise
    except Exception as exc:  # noqa: BLE001 - run failure must be persisted
        logger.exception(
            "portal run %s failed in state %s",
            run_id,
            _read_status(artifacts, run_id).get("state"),
        )
        failure_code = getattr(exc, "code", "INTERNAL_ERROR")
        _write_status(
            artifacts,
            run_id,
            state=RunState.FAILED,
            stages=stages,
            completed_at=datetime.now(UTC).isoformat(),
            failure={"code": str(failure_code), "message": str(exc)},
        )
        raise

    _write_status(
        artifacts,
        run_id,
        state=RunState.COMPLETED,
        stages=stages,
        completed_at=datetime.now(UTC).isoformat(),
    )
    return {"run_id": run_id, "status": RunState.COMPLETED.value, **result}


if __name__ == "__main__":  # pragma: no cover - manual debugging entry
    import sys

    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    print(json.dumps(execute_run(**payload), indent=2))
