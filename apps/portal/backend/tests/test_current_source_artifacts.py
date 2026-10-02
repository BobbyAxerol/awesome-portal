"""RS-02 sealed current-source artifact adapter tests.

These tests intentionally execute the public QuantBT 1.1.1 advanced WFO path
once over the existing deterministic golden tape.  They prove the adapter
retains actual WFO output rather than a fixture or a browser-time rerun.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import pandas as pd
import pytest

from golden_fixture import build_market_frame
from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    DatasetDescriptor,
    HistoricalMarketDataProvider,
    MarketDataQuery,
    PreparedMarketData,
    load_historical_data_runtime,
)
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
    SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID,
    SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID,
    CurrentSourceArtifactAdapter,
    CurrentSourceArtifactError,
    _decimal_object,
    default_current_source_admission,
    signal_notional_current_source_admission,
    iter_current_source_retention_batches,
)
from portal_api.services.research_artifacts import ArtifactFence, ArtifactIdentity, ResearchArtifactStore
from strategy.specification import DELTA_RSI_SPECIFICATION


def test_summary_budget_accounts_for_postgres_jsonb_spacing(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    summary = {"authority": "unchanged", "replay": {"candle_overview": {
        "values": [{"a": "x", "b": "y"} for _ in range(3000)],
    }}}
    assert len(json.dumps(summary, separators=(",", ":")).encode()) < 65_536
    assert len(json.dumps(summary).encode()) > 65_536
    calls: list[int] = []

    def coarsened(_observations: list[dict[str, object]], *, maximum_buckets: int) -> dict[str, object]:
        calls.append(maximum_buckets)
        return {"values": [], "sampling": "COARSENED_TEST"}

    monkeypatch.setattr(adapter, "_candle_overview", coarsened)
    adapter._fit_summary_budget(summary, [])
    assert calls and summary["authority"] == "unchanged"
    assert len(json.dumps(summary).encode()) <= 65_536


def test_summary_budget_does_not_discard_oversized_authority() -> None:
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    summary = {"authority": {str(i): "x" for i in range(5500)}}
    assert len(json.dumps(summary, separators=(",", ":")).encode()) < 65_536
    assert len(json.dumps(summary).encode()) > 65_536
    with pytest.raises(CurrentSourceArtifactError) as failure:
        adapter._fit_summary_budget(summary, [])
    assert failure.value.code == "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE"
    assert len(summary["authority"]) == 5500


def test_summary_budget_keeps_independently_bounded_enrichment() -> None:
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    summary = {"authority": "x" * 60_000, "enriched_analysis": {"authority": "y" * 70_000}}
    adapter._fit_summary_budget(summary, [])
    assert len(summary["authority"]) == 60_000
    assert len(summary["enriched_analysis"]["authority"]) == 70_000
    with pytest.raises(CurrentSourceArtifactError) as failure:
        adapter._fit_summary_budget({"enriched_analysis": {"authority": "y" * 73_728}}, [])
    assert failure.value.code == "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE"


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


def _request(*, target_mode: str = "pct_equity", optuna_trials: int = 8) -> PortalRunRequest:
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
        execution=ExecutionConfig(target_mode=target_mode),
        calibration=AdvancedWalkForwardConfig(
            split_mode="2024-01-08",
            split_frequency="weekly",
            window_mode="expanding",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            fold_boundary_position_policy="carry",
            optuna_trials=optuna_trials,
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
    source_file = source.run_directory("run-rs02-advanced") / "series" / "stitched.parquet"
    source_bytes = source_file.read_bytes()
    assert receipt.summary["source_series_artifact"] == {
        "algorithm": "SHA-256",
        "digest": hashlib.sha256(source_bytes).hexdigest(),
        "logical_name": "series/stitched.parquet",
        "size_bytes": len(source_bytes),
        "scope": "FULL_STITCHED_SOURCE_SERIES",
    }
    # E11/E14 source-time block survives the actual P05 seal, not a GET rerun.
    analytics = receipt.summary["summary_analytics"]
    original = source.read_json("run-rs02-advanced", "wfo/retained_analytics.v1.json")
    assert original["artifact_schema_version"] == "1"
    assert original["producer"]["artifact"] == "retained_analytics.v1.json"
    assert analytics == {key: value for key, value in original.items() if key not in {"producer", "artifact_schema_version"}}
    assert analytics["net_oos_return"]["scope"] == "OOS"
    assert analytics["total_trade_count"]["scope"] == "CHILD_TAPE"
    assert analytics["in_sample_equity"]["reason_code"] == "QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT"
    analytics_v2 = receipt.summary["summary_analytics_v2"]
    source_v2 = source.read_json("run-rs02-advanced", "wfo/retained_analytics.v2.json")
    assert analytics_v2 == {key: value for key, value in source_v2.items()
                            if key not in {"producer", "artifact_schema_version"}}
    assert analytics_v2["schema_version"] == "research.retained-analytics.v2"
    assert analytics_v2["metrics"]["sharpe"]["origin"] == "ENGINE_DIRECT"
    assert analytics_v2["metrics"]["benchmark_return_fraction"]["state"] == "AVAILABLE"
    assert analytics_v2["last_30d"]["label"] == "last 30D"
    assert "rolling_sharpe_63" not in analytics_v2
    stitched = pd.read_parquet(source.run_directory("run-rs02-advanced") / "series" / "stitched.parquet")
    fold_frame = pd.read_parquet(source.run_directory("run-rs02-advanced") / "wfo" / "folds.parquet")
    oos_mask = pd.Series(False, index=stitched.index)
    for _, fold in fold_frame.iterrows():
        start = pd.Timestamp(fold["test_start"]).tz_convert("UTC")
        end = pd.Timestamp(fold["test_end"]).tz_convert("UTC")
        oos_mask |= (stitched.index >= start) & (stitched.index <= end)
    oos_count = int(oos_mask.sum())
    assert receipt.summary["derived_scope"] == "OUTER_TEST_UNION_INCLUSIVE_V1"
    assert receipt.summary["derived"]["monthly_returns"]["source_observation_count"] == oos_count
    assert oos_count < receipt.table_rows["observations"]
    assert receipt.summary["derived"]["return_distribution"]["state"] in {"AVAILABLE", "NOT_APPLICABLE"}
    distribution = receipt.summary["derived"]["return_distribution"]
    if distribution["state"] == "AVAILABLE":
        assert sum(int(bucket["count"]) for bucket in distribution["values"]) == oos_count
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


def test_signal_notional_current_source_profile_retains_the_same_bounded_relations(tmp_path: Path) -> None:
    source = ArtifactRepository(tmp_path / "source-runs")
    retained = ResearchArtifactStore(tmp_path / "retained")
    run_id = "run-rs02-signal-notional"
    request = _request(target_mode="signal_notional", optuna_trials=3)
    runner = AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source)

    result = runner.run(request, _market(), run_id, target_mode="signal_notional")
    assert result["n_folds"] >= 2

    fence = _fence(run_id)
    exported = CurrentSourceArtifactAdapter(
        source_artifacts=source,
        retained_artifacts=retained,
    ).export_advanced_walkforward(
        run_id=run_id,
        identity=_identity(run_id),
        fence=fence,
        admission=signal_notional_current_source_admission(),
        fence_validator=lambda candidate: candidate == fence,
    )

    assert exported.receipt.source_adapter_id == SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID
    assert exported.receipt.profile_id == SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID
    assert exported.receipt.table_rows["folds"] >= 2
    assert exported.receipt.table_rows["trials"] >= 3
    assert exported.receipt.table_rows["candidates"] >= 1
    assert exported.receipt.as_dict()["coverage"]["observations"] == "AVAILABLE_DIRECT"
    batches = list(iter_current_source_retention_batches(
        retained_artifacts=retained,
        receipt=exported.receipt,
        cursor_secret=b"rs02-current-source-cursor-secret-at-least-32-bytes",
    ))
    assert {batch.table_kind for batch in batches} == {
        "OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION",
    }
    assert all(len(batch.rows) <= 200 for batch in batches)


@pytest.mark.skipif(
    os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1",
)
def test_signal_notional_real_hmd_wfo_is_sealed_by_p05(tmp_path: Path) -> None:
    """Real HMD → pinned QuantBT WFO → bounded local P05 seal; no runtime/API write."""

    start = pd.Timestamp("2026-06-01T00:00:00Z")
    split = pd.Timestamp("2026-07-01T00:00:00Z")
    end = pd.Timestamp("2026-07-15T00:00:00Z")
    runtime = load_historical_data_runtime(Path(os.environ["HISTORICAL_MARKET_DATA_ROOT"]))
    market = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            timeframe="1h",
            start=start,
            end_exclusive=end,
        )
    )
    request = _request(target_mode="signal_notional", optuna_trials=3)
    request = request.model_copy(update={
        "dataset_id": CRYPTO_BINANCE_DATASET_ID,
        "symbol": "BTCUSDT",
        "calibration": request.calibration.model_copy(update={
            "data_start": start.to_pydatetime(),
            "data_end_exclusive": end.to_pydatetime(),
            "split_mode": split.isoformat(),
        }),
    })
    run_id = "run-rs02-real-hmd-p05"
    source = ArtifactRepository(tmp_path / "source-runs")
    retained = ResearchArtifactStore(tmp_path / "retained")
    result = AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source).run(
        request,
        market,
        run_id,
        target_mode="signal_notional",
    )
    assert result["n_folds"] >= 2

    digest = request.config_hash()
    identity = ArtifactIdentity(
        artifact_id="rs02-real-hmd-p05-artifact",
        artifact_revision=1,
        workspace_id="ws-rs02",
        run_id=run_id,
        engine_release_id="quantbt-1.1.1",
        engine_build_ref=SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID,
        request_spec_digest=digest,
        effective_spec_digest=digest,
        dataset_binding_digest=market.content_hash,
    )
    exported = CurrentSourceArtifactAdapter(
        source_artifacts=source,
        retained_artifacts=retained,
    ).export_advanced_walkforward(
        run_id=run_id,
        identity=identity,
        fence=_fence(run_id),
        admission=signal_notional_current_source_admission(),
        fence_validator=lambda candidate: candidate == _fence(run_id),
    )

    assert exported.receipt.source_adapter_id == SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID
    assert exported.receipt.profile_id == SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID
    assert exported.receipt.table_rows["folds"] >= 2
    assert exported.receipt.table_rows["trials"] >= 3
    assert exported.receipt.total_rows == sum(exported.receipt.table_rows.values())
    manifest, manifest_digest = retained._load_and_verify_manifest(  # noqa: SLF001 -- verify exact P05 bytes in this custody test
        exported.receipt.artifact_id,
        verify_parts=True,
    )
    assert manifest_digest == exported.receipt.manifest_digest
    assert manifest["totals"]["rows"] == exported.receipt.total_rows


def test_current_source_adapter_rejects_mismatched_mode_without_fallback(tmp_path: Path) -> None:
    source = ArtifactRepository(tmp_path / "source-runs")
    run_id = "run-rs02-mode"
    directory = source.run_directory(run_id, create=True)
    (directory / "manifest.json").write_text(json.dumps({
        "quantbt_version": "1.1.1", "protocol": "advanced_walk_forward", "status": "COMPLETED",
    }), encoding="utf-8")
    (directory / "config.json").write_text(json.dumps({"execution": {"target_mode": "pct_equity"}, "calibration": {
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
