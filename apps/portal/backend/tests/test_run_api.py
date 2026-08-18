"""Run API, worker and SSE tests (Phase P4, plan §9/§12/§20).

The real worker subprocess executes a tiny three-window run on the golden
fixture (shipped to it via PORTAL_RUNNER_MARKET_PATH); the API is exercised
through TestClient with an in-memory provider and the real QuantBT gateway.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import anyio
import httpx
import numpy as np
import pandas as pd
import pytest

from golden_fixture import build_market_frame
from portal_api.adapters.market_data import DatasetDescriptor, InMemoryMarketDataProvider
from portal_api.domain.requests import (
    AccountConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
    ThreeWindowConfig,
)
from portal_api.main import create_app
from portal_api.repositories import ArtifactRepository
from strategy.specification import DELTA_RSI_SPECIFICATION

TRIALS = 4
IS_END = 140
OOS_END = 300


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def market_path(tmp_path: Path) -> Path:
    path = tmp_path / "market.parquet"
    build_market_frame().to_parquet(path, index=True)
    return path


@pytest.fixture
async def client(tmp_path: Path, market_path: Path, monkeypatch):
    artifacts = ArtifactRepository(tmp_path / "runs")
    frame = pd.read_parquet(market_path)
    provider = InMemoryMarketDataProvider(
        {
            "golden-fixture": (
                DatasetDescriptor(
                    dataset_id="golden-fixture",
                    symbol="ETHUSDT",
                    venue="BINANCE",
                    timeframe="1h",
                ),
                frame,
            )
        }
    )
    monkeypatch.setenv("PORTAL_RUNNER_MARKET_PATH", str(market_path))
    app = create_app(
        market_data_provider=provider,
        artifact_repository=artifacts,
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as http:
        yield http, tmp_path / "runs"
    app.state.run_manager.shutdown()


def _payload(frame: pd.DataFrame) -> dict:
    index = frame.index
    parameter_space = {
        key: {
            "kind": "float_range" if isinstance(low, float) else "int_range",
            "low": low,
            "high": high,
            "step": step,
        }
        for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
    }
    return {
        "strategy_id": "delta-rsi-polynomial-alpha",
        "dataset_id": "golden-fixture",
        "symbol": "ETHUSDT",
        "timeframe": "1h",
        "protocol": "three_window_decay",
        "parameter_space": parameter_space,
        "calibration": {
            "is_start": str(index[0]),
            "is_end_exclusive": str(index[IS_END]),
            "oos_start": str(index[IS_END]),
            "oos_end_exclusive": str(index[OOS_END]),
            "holdout_start": str(index[OOS_END]),
            "holdout_end_exclusive": None,
            "optuna_trials": TRIALS,
            "optuna_early_stopping": None,
            "random_seed": 42,
            "optimization": {
                "min_trades_per_year": 50.0,
                "trade_penalty_factor": 0.5,
            },
        },
        "account": {},
        "execution": {},
    }


async def _wait_terminal(client: httpx.AsyncClient, run_id: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        response = await client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        status = response.json()
        if status["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return status
        await anyio.sleep(0.5)
    raise AssertionError(f"run {run_id} did not reach a terminal state within {timeout}s")


@pytest.mark.anyio
async def test_submit_run_and_poll_to_completion(client) -> None:
    http, artifact_root = client
    frame = build_market_frame()
    response = await http.post("/api/runs", json=_payload(frame))
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]

    submitted = await http.get(f"/api/runs/{run_id}/config")
    assert submitted.status_code == 200
    assert submitted.json()["account"]["canonical_one_way_fee_rate"] == pytest.approx(0.0005)

    status = await _wait_terminal(http, run_id)
    assert status["status"] == "COMPLETED", status
    assert (artifact_root / run_id / "selection" / "selected_params.json").is_file()
    assert (artifact_root / run_id / "manifest.json").is_file()

    summary = (await http.get(f"/api/runs/{run_id}/summary")).json()
    assert summary["selected_params"]["params"]
    assert set(summary["metrics"]["segments"]) == {"is", "oos", "holdout_live"}


@pytest.mark.anyio
async def test_sse_stream_reaches_terminal(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = (await http.post("/api/runs", json=_payload(frame))).json()["run_id"]

    states: list[str] = []
    async with http.stream("GET", f"/api/runs/{run_id}/events") as stream:
        deadline = time.time() + 120
        while time.time() < deadline:
            async for line in stream.aiter_lines():
                if line.startswith("data: "):
                    payload = json.loads(line[6:])
                    states.append(payload.get("state", ""))
            if "COMPLETED" in states or "FAILED" in states or "CANCELLED" in states:
                break
    assert "QUEUED" in states
    assert "COMPLETED" in states


@pytest.mark.anyio
async def test_list_and_detail(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = (await http.post("/api/runs", json=_payload(frame))).json()["run_id"]
    await _wait_terminal(http, run_id)

    runs = (await http.get("/api/runs")).json()
    assert any(item["run_id"] == run_id for item in runs)
    detail = (await http.get(f"/api/runs/{run_id}")).json()
    assert detail["run_id"] == run_id
    assert detail["protocol"] == "three_window_decay"


@pytest.mark.anyio
async def test_wfo_and_series_endpoints(client) -> None:
    http, artifact_root = client
    frame = build_market_frame()
    run_id = (await http.post("/api/runs", json=_payload(frame))).json()["run_id"]
    await _wait_terminal(http, run_id)

    # A real 400-trial TPE run can contain pruned rows represented by -inf/NaN
    # in Parquet. The diagnostic JSON API must expose those sentinels as null
    # without weakening strict artifact serialization.
    trial_path = artifact_root / run_id / "wfo" / "trials.parquet"
    persisted_trials = pd.read_parquet(trial_path)
    pruned_row = {column: np.nan for column in persisted_trials.columns}
    pruned_row.update(
        {
            "trial_id": 99_999,
            "objective": -np.inf,
            "pruned": True,
            "params_json": "{}",
            "selection_metadata_json": None,
        }
    )
    persisted_trials = pd.concat(
        [persisted_trials, pd.DataFrame([pruned_row])], ignore_index=True
    )
    persisted_trials.to_parquet(trial_path, index=True)

    trials = (await http.get(f"/api/runs/{run_id}/wfo/trials?sort_by=objective&top_n=5")).json()
    assert trials["total_rows"] >= 1
    assert trials["returned_rows"] == len(trials["rows"])
    assert trials["returned_rows"] <= 5
    assert "trial_id" in trials["rows"][0]
    assert len({item["trial_id"] for item in trials["rows"]}) == len(trials["rows"])

    candidates = (await http.get(f"/api/runs/{run_id}/wfo/candidates")).json()
    assert candidates["total_rows"] >= 1
    assert candidates["returned_rows"] == len(candidates["rows"])
    folds = (await http.get(f"/api/runs/{run_id}/wfo/folds")).json()
    assert folds["total_rows"] == folds["returned_rows"]
    assert folds["total_rows"] >= 1

    series = (await http.get(f"/api/runs/{run_id}/series/is?max_points=50")).json()
    assert series["segment"] == "is"
    assert len(series["timestamps"]) <= 50
    assert len(series["timestamps"]) == len(series["series"]["equity"])
    assert len(series["timestamps"]) >= 2

    full = (await http.get(f"/api/runs/{run_id}/series/oos")).json()
    assert len(full["timestamps"]) > 50

    params = (await http.get(f"/api/runs/{run_id}/wfo/parameters")).json()
    assert set(params["selected"]["params"]) == set(DELTA_RSI_SPECIFICATION.parameter_space)

    trace = (await http.get(f"/api/runs/{run_id}/selection/trace")).json()
    assert trace["selected_trial_id"] is not None

    ledger = (await http.get(f"/api/runs/{run_id}/ledger")).json()
    assert ledger["status"] == "COMPLETED"
    assert ledger["trial_ledger_ready"] is True
    assert len(ledger["trial_events"]) == TRIALS + 1
    assert any(item.get("objective") is not None for item in ledger["trial_events"])
    projected_pruned = next(
        item for item in ledger["trial_events"] if item["trial_id"] == 99_999
    )
    assert projected_pruned["pruned"] is True
    assert projected_pruned["objective"] is None
    assert projected_pruned["selection_metadata_json"] is None

    presentation = (await http.get(f"/api/runs/{run_id}/presentation/calendar?max_points=50")).json()
    assert presentation["segment"] == "calendar"
    assert {"is_equity", "oos_equity", "holdout_live_equity"} == set(presentation["series"])
    for values in presentation["series"].values():
        assert len(values) == len(presentation["timestamps"])
    # Segment gaps survive downsampling and remain null, preventing chart
    # lines from visually joining independent fresh-account replays.
    assert any(value is None for value in presentation["series"]["is_equity"])
    assert any(value is None for value in presentation["series"]["oos_equity"])


@pytest.mark.anyio
async def test_audit_and_export_endpoints(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = (await http.post("/api/runs", json=_payload(frame))).json()["run_id"]
    await _wait_terminal(http, run_id)

    audit = (await http.get(f"/api/runs/{run_id}/audit")).json()
    assert audit["manifest"]["status"] == "COMPLETED"
    assert audit["manifest"]["protocol"] == "three_window_decay"
    assert "config" in audit and "strategy" in audit and "metrics" in audit

    response = await http.get(f"/api/runs/{run_id}/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert len(response.content) > 0


@pytest.mark.anyio
async def test_invalid_payload_rejected_before_submission(client) -> None:
    http, _ = client
    frame = build_market_frame()
    payload = _payload(frame)
    payload["parameter_space"] = {"window": {"kind": "int_range", "low": 20, "high": 60, "step": 2}}
    response = await http.post("/api/runs", json=payload)
    assert response.status_code == 422


@pytest.mark.anyio
async def test_unknown_run_returns_404(client) -> None:
    http, _ = client
    assert (await http.get("/api/runs/does_not_exist")).status_code == 404


def test_cancel_flag_cancels_in_process_run(tmp_path, market_path, monkeypatch) -> None:
    from portal_api.domain.enums import RunState
    from portal_api.workers import run_worker

    artifacts = ArtifactRepository(tmp_path / "runs")
    frame = build_market_frame()
    request = PortalRunRequest.model_validate(_payload(frame))
    run_id = "run_p4_cancel"
    artifacts.write_json(run_id, "status.json", {"run_id": run_id, "state": "QUEUED", "events": []})
    (artifacts.run_directory(run_id) / ".cancel").touch()
    monkeypatch.setenv("PORTAL_RUNNER_MARKET_PATH", str(market_path))

    with pytest.raises(Exception):
        run_worker.execute_run(
            request_json=request.model_dump(mode="json"),
            run_id=run_id,
            artifact_root=str(artifacts.root),
        )
    status = artifacts.read_json(run_id, "status.json")
    assert status["state"] == RunState.CANCELLED.value
    assert status["failure"]["code"] == "RUN_CANCELLED"


@pytest.mark.anyio
async def test_completed_runs_reopen_without_rerun(tmp_path, market_path, monkeypatch) -> None:
    artifacts = ArtifactRepository(tmp_path / "runs")
    frame = build_market_frame()
    provider = InMemoryMarketDataProvider(
        {
            "golden-fixture": (
                DatasetDescriptor(
                    dataset_id="golden-fixture",
                    symbol="ETHUSDT",
                    venue="BINANCE",
                    timeframe="1h",
                ),
                frame,
            )
        }
    )
    monkeypatch.setenv("PORTAL_RUNNER_MARKET_PATH", str(market_path))
    app = create_app(market_data_provider=provider, artifact_repository=artifacts)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as http:
        run_id = (await http.post("/api/runs", json=_payload(frame))).json()["run_id"]
        await _wait_terminal(http, run_id)
    app.state.run_manager.shutdown()

    # New app over the same artifact root: the completed run must reopen.
    app2 = create_app(market_data_provider=provider, artifact_repository=artifacts)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app2),
        base_url="http://test",
    ) as http2:
        runs = (await http2.get("/api/runs")).json()
        assert any(item["run_id"] == run_id for item in runs)
        summary = await http2.get(f"/api/runs/{run_id}/summary")
        assert summary.status_code == 200
        series = await http2.get(f"/api/runs/{run_id}/series/is")
        assert series.status_code == 200
    app2.state.run_manager.shutdown()
