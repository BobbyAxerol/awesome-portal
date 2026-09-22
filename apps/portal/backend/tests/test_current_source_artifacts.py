"""RS-02 sealed current-source artifact adapter tests.

These tests intentionally execute the public QuantBT 1.1.1 advanced WFO path
once over the existing deterministic golden tape.  They prove the adapter
retains actual WFO output rather than a fixture or a browser-time rerun.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from golden_fixture import build_market_frame
from portal_api.adapters.market_data import DatasetDescriptor, PreparedMarketData
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import OptimizationMode, OptimizationSchedule
from portal_api.domain.requests import (
    AccountConfig,
    AdvancedWalkForwardConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
)
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
from portal_api.services.current_source_artifacts import (
    CURRENT_SOURCE_ADAPTER_ID,
    CurrentSourceArtifactAdapter,
    CurrentSourceArtifactError,
    _decimal_object,
    default_current_source_admission,
    iter_current_source_retention_batches,
)
from portal_api.services.research_artifacts import ArtifactFence, ArtifactIdentity, ResearchArtifactStore
from strategy.specification import DELTA_RSI_SPECIFICATION


def _market() -> PreparedMarketData:
    return PreparedMarketData(
        frame=build_market_frame(),
        descriptor=DatasetDescriptor(
            dataset_id="golden-fixture",
            symbol="ETHUSDT",
            venue="BINANCE",
            timeframe="1h",
        ),
        content_hash="golden-fixture",
        missing_bar_count=0,
    )


def _request() -> PortalRunRequest:
    parameter_space = ParameterSpaceConfig({
        key: ParameterSpec(
            kind="float_range" if isinstance(low, float) else "int_range",
            low=low,
            high=high,
            step=step,
        )
        for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
    })
    return PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="golden-fixture",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="advanced_walk_forward",
        parameter_space=parameter_space,
        account=AccountConfig(),
        execution=ExecutionConfig(),
        calibration=AdvancedWalkForwardConfig(
            split_mode="2024-01-08",
            split_frequency="weekly",
            window_mode="expanding",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            fold_boundary_position_policy="carry",
            optuna_trials=8,
            optuna_early_stopping=None,
            random_seed=42,
            optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        ),
    )


def _identity(run_id: str) -> ArtifactIdentity:
    return ArtifactIdentity(
        artifact_id="rs02-current-source-artifact",
        artifact_revision=1,
        workspace_id="ws-rs02",
        run_id=run_id,
        engine_release_id="quantbt-1.1.1",
        engine_build_ref="pypi-wheel-1.1.1",
        request_spec_digest="a" * 64,
        effective_spec_digest="b" * 64,
        dataset_binding_digest="c" * 64,
    )


def _fence(run_id: str) -> ArtifactFence:
    return ArtifactFence(
        workspace_id="ws-rs02",
        run_id=run_id,
        worker_attempt_id="worker-rs02",
        lease_epoch=1,
    )


@pytest.fixture
def exported(tmp_path: Path):
    source = ArtifactRepository(tmp_path / "source-runs")
    runner = AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source)
    run_id = "run-rs02-advanced"
    runner.run(_request(), _market(), run_id)
    retained = ResearchArtifactStore(tmp_path / "retained")
    adapter = CurrentSourceArtifactAdapter(source_artifacts=source, retained_artifacts=retained)
    fence = _fence(run_id)
    exported = adapter.export_advanced_walkforward(
        run_id=run_id,
        identity=_identity(run_id),
        fence=fence,
        admission=default_current_source_admission(),
        fence_validator=lambda candidate: candidate == fence,
    )
    return source, retained, exported


def test_current_source_adapter_retains_real_wfo_rows_once(exported) -> None:
    source, retained, result = exported
    receipt = result.receipt
    assert receipt.source_adapter_id == CURRENT_SOURCE_ADAPTER_ID
    assert receipt.table_rows["observations"] > 20
    assert receipt.table_rows["folds"] >= 2
    assert receipt.table_rows["trials"] >= 2
    assert receipt.table_rows["candidates"] >= 1
    assert receipt.table_rows["selection"] == 1
    assert receipt.as_dict()["coverage"]["route_ledger"] == "SOURCE_UNSUPPORTED_CONFIRMED"
    assert receipt.summary["schema_version"] == "research.current-source-summary.v1"
    assert receipt.summary["metrics"]["initial_equity"]
    assert receipt.summary["selection"]["parameters"]
    assert receipt.summary["derived"]["monthly_returns"]["source_observation_count"] == receipt.table_rows["observations"]
    assert receipt.summary["derived"]["return_distribution"]["state"] in {"AVAILABLE", "NOT_APPLICABLE"}
    distribution = receipt.summary["derived"]["return_distribution"]
    if distribution["state"] == "AVAILABLE":
        assert sum(int(bucket["count"]) for bucket in distribution["values"]) == receipt.table_rows["observations"]
    assert len(json.dumps(receipt.summary, sort_keys=True).encode("utf-8")) <= 65_536

    reader = retained.reader(cursor_secret=b"rs02-current-source-cursor-secret-at-least-32-bytes")
    page = reader.read_page(
        artifact_id=result.candidate.artifact_id,
        table_kind="observations",
        columns=(
            "source_ordinal", "source_index_utc", "at_utc_ms", "equity",
            "return_fraction", "accepted_position", "drawdown_fraction",
        ),
        limit=200,
    )
    assert page.table_rows == receipt.table_rows["observations"]
    assert len(page.rows) > 20
    assert page.rows[0]["source_ordinal"] == 0
    assert isinstance(page.rows[0]["equity"], str)
    assert isinstance(page.rows[0]["at_utc_ms"], int)
    assert page.rows[0]["source_index_utc"].endswith("Z")

    # The raw legacy repository remains untouched; the current-source lane is
    # additive and source output can still be reopened without QuantBT rerun.
    stitched = pd.read_parquet(source.run_directory("run-rs02-advanced") / "series" / "stitched.parquet")
    assert receipt.table_rows["observations"] == len(stitched)


def test_current_source_retention_bridge_pages_only_sealed_rows(exported) -> None:
    _, retained, result = exported
    batches = list(iter_current_source_retention_batches(
        retained_artifacts=retained,
        receipt=result.receipt,
        cursor_secret=b"rs02-current-source-cursor-secret-at-least-32-bytes",
    ))
    assert all(len(batch.rows) <= 200 for batch in batches)
    assert {batch.table_kind for batch in batches} == {
        "OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION",
    }
    observed = [row for batch in batches if batch.table_kind == "OBSERVATION" for row in batch.rows]
    assert len(observed) == result.receipt.table_rows["observations"]
    assert observed[0]["sourceOrdinal"] == 0
    assert observed[0]["sourceId"].endswith("Z")
    assert observed[0]["payload"]["equity"]
    # P05 keeps private raw metadata, but the Portal-local BFF retention input
    # exposes only declared screen fields. This makes the maximum 256-fold / 64
    # candidate reader bounded without leaking generic source records.
    for batch in batches:
        if batch.table_kind in {"FOLD", "CANDIDATE"}:
            assert all("source_payload" not in row["payload"] for row in batch.rows)
        if batch.table_kind in {"TRIAL", "CANDIDATE", "SELECTION"}:
            assert all(len(row["payload"]["parameters"]) <= 24 for row in batch.rows)


def test_current_source_adapter_rejects_mismatched_mode_without_fallback(tmp_path: Path) -> None:
    source = ArtifactRepository(tmp_path / "source-runs")
    run_id = "run-rs02-mode"
    directory = source.run_directory(run_id, create=True)
    (directory / "manifest.json").write_text(json.dumps({
        "quantbt_version": "1.1.1", "protocol": "advanced_walk_forward", "status": "COMPLETED",
    }), encoding="utf-8")
    (directory / "config.json").write_text(json.dumps({"calibration": {
        "optimization_mode": "none", "optimization_schedule": "global", "random_seed": 42, "optuna_trials": 8,
    }}), encoding="utf-8")
    adapter = CurrentSourceArtifactAdapter(
        source_artifacts=source,
        retained_artifacts=ResearchArtifactStore(tmp_path / "retained"),
    )
    fence = _fence(run_id)
    with pytest.raises(CurrentSourceArtifactError, match="mode/schedule") as error:
        adapter.export_advanced_walkforward(
            run_id=run_id,
            identity=_identity(run_id),
            fence=fence,
            admission=default_current_source_admission(),
            fence_validator=lambda candidate: candidate == fence,
        )
    assert error.value.code == "RESEARCH_CURRENT_SOURCE_CONFIG_REJECTED"


def test_current_source_adapter_marks_old_engine_artifacts_not_retained_legacy(tmp_path: Path) -> None:
    source = ArtifactRepository(tmp_path / "source-runs")
    run_id = "run-rs02-legacy"
    directory = source.run_directory(run_id, create=True)
    (directory / "manifest.json").write_text(json.dumps({
        "quantbt_version": "1.0.8", "protocol": "advanced_walk_forward", "status": "COMPLETED",
    }), encoding="utf-8")
    adapter = CurrentSourceArtifactAdapter(
        source_artifacts=source,
        retained_artifacts=ResearchArtifactStore(tmp_path / "retained"),
    )
    fence = _fence(run_id)
    with pytest.raises(CurrentSourceArtifactError) as error:
        adapter.export_advanced_walkforward(
            run_id=run_id,
            identity=_identity(run_id),
            fence=fence,
            admission=default_current_source_admission(),
            fence_validator=lambda candidate: candidate == fence,
        )
    assert error.value.code == "NOT_RETAINED_LEGACY"


def test_current_source_adapter_rejects_over_budget_relation_before_p05_write() -> None:
    with pytest.raises(CurrentSourceArtifactError) as error:
        CurrentSourceArtifactAdapter._assert_admitted_output_bounds(  # noqa: SLF001 -- exact admission boundary under test
            observations=[{}],
            folds=[{}, {}],
            trials=[{} for _ in range(2)],
            candidates=[{} for _ in range(65)],
            selection=[{}],
        )
    assert error.value.code == "RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED"


def test_current_source_adapter_rejects_an_unbounded_parameter_map_before_retention() -> None:
    with pytest.raises(CurrentSourceArtifactError) as error:
        _decimal_object({f"parameter_{index}": index for index in range(25)}, "test parameters")
    assert error.value.code == "RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED"
