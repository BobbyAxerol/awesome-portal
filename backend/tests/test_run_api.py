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

import pandas as pd
import pytest
from fastapi.testclient import TestClient

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
def market_path(tmp_path: Path) -> Path:
    path = tmp_path / "market.parquet"
    build_market_frame().to_parquet(path, index=True)
    return path


@pytest.fixture
def client(tmp_path: Path, market_path: Path, monkeypatch) -> tuple[TestClient, Path]:
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
    return TestClient(app), tmp_path / "runs"


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


def _wait_terminal(client: TestClient, run_id: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        status = response.json()
        if status["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
            return status
        time.sleep(0.5)
    raise AssertionError(f"run {run_id} did not reach a terminal state within {timeout}s")


def test_submit_run_and_poll_to_completion(client) -> None:
    http, artifact_root = client
    frame = build_market_frame()
    response = http.post("/api/runs", json=_payload(frame))
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]

    status = _wait_terminal(http, run_id)
    assert status["status"] == "COMPLETED", status
    assert (artifact_root / run_id / "selection" / "selected_params.json").is_file()
    assert (artifact_root / run_id / "manifest.json").is_file()

    summary = http.get(f"/api/runs/{run_id}/summary").json()
    assert summary["selected_params"]["params"]
    assert set(summary["metrics"]["segments"]) == {"is", "oos", "holdout_live"}


def test_sse_stream_reaches_terminal(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = http.post("/api/runs", json=_payload(frame)).json()["run_id"]

    states: list[str] = []
    with http.stream("GET", f"/api/runs/{run_id}/events") as stream:
        deadline = time.time() + 120
        while time.time() < deadline:
            chunk = stream.iter_lines()
            for line in chunk:
                if line.startswith("data: "):
                    payload = json.loads(line[6:])
                    states.append(payload.get("state", ""))
            if "COMPLETED" in states or "FAILED" in states or "CANCELLED" in states:
                break
    assert "QUEUED" in states
    assert "COMPLETED" in states


def test_list_and_detail(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = http.post("/api/runs", json=_payload(frame)).json()["run_id"]
    _wait_terminal(http, run_id)

    runs = http.get("/api/runs").json()
    assert any(item["run_id"] == run_id for item in runs)
    detail = http.get(f"/api/runs/{run_id}").json()
    assert detail["run_id"] == run_id
    assert detail["protocol"] == "three_window_decay"


def test_wfo_and_series_endpoints(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = http.post("/api/runs", json=_payload(frame)).json()["run_id"]
    _wait_terminal(http, run_id)

    trials = http.get(f"/api/runs/{run_id}/wfo/trials?sort_by=objective&top_n=5").json()
    assert len(trials) >= 1
    assert "trial_id" in trials[0]

    candidates = http.get(f"/api/runs/{run_id}/wfo/candidates").json()
    assert isinstance(candidates, list)

    series = http.get(f"/api/runs/{run_id}/series/is?max_points=50").json()
    assert series["segment"] == "is"
    assert len(series["timestamps"]) <= 50
    assert len(series["timestamps"]) == len(series["series"]["equity"])
    assert len(series["timestamps"]) >= 2

    full = http.get(f"/api/runs/{run_id}/series/oos").json()
    assert len(full["timestamps"]) > 50

    params = http.get(f"/api/runs/{run_id}/wfo/parameters").json()
    assert set(params["selected"]["params"]) == set(DELTA_RSI_SPECIFICATION.parameter_space)

    trace = http.get(f"/api/runs/{run_id}/selection/trace").json()
    assert trace["selected_trial_id"] is not None


def test_audit_and_export_endpoints(client) -> None:
    http, _ = client
    frame = build_market_frame()
    run_id = http.post("/api/runs", json=_payload(frame)).json()["run_id"]
    _wait_terminal(http, run_id)

    audit = http.get(f"/api/runs/{run_id}/audit").json()
    assert audit["manifest"]["status"] == "COMPLETED"
    assert audit["manifest"]["protocol"] == "three_window_decay"
    assert "config" in audit and "strategy" in audit and "metrics" in audit

    response = http.get(f"/api/runs/{run_id}/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert len(response.content) > 0


def test_invalid_payload_rejected_before_submission(client) -> None:
    http, _ = client
    frame = build_market_frame()
    payload = _payload(frame)
    payload["parameter_space"] = {"window": {"kind": "int_range", "low": 20, "high": 60, "step": 2}}
    response = http.post("/api/runs", json=payload)
    assert response.status_code == 422


def test_unknown_run_returns_404(client) -> None:
    http, _ = client
    assert http.get("/api/runs/does_not_exist").status_code == 404


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


def test_completed_runs_reopen_without_rerun(tmp_path, market_path, monkeypatch) -> None:
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
    with TestClient(app) as http:
        run_id = http.post("/api/runs", json=_payload(frame)).json()["run_id"]
        _wait_terminal(http, run_id)

    # New app over the same artifact root: the completed run must reopen.
    app2 = create_app(market_data_provider=provider, artifact_repository=artifacts)
    with TestClient(app2) as http2:
        runs = http2.get("/api/runs").json()
        assert any(item["run_id"] == run_id for item in runs)
        summary = http2.get(f"/api/runs/{run_id}/summary")
        assert summary.status_code == 200
        series = http2.get(f"/api/runs/{run_id}/series/is")
        assert series.status_code == 200
