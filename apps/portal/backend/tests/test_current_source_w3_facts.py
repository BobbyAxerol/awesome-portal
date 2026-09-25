"""W3 (P13-P15) retained WFO facts: fold verdict inputs, anatomy, trial ledger, claims.

Every test runs the public QuantBT 1.1.1 signal-notional WFO once over the
deterministic golden tape (3 trials, seed 42) and compares what the RS-02
exporter retains against QuantBT's own raw output: no fixture stands in for
the engine, and a fact QuantBT did not publish must stay a typed absence.
"""

from __future__ import annotations

import json
import shutil
from decimal import Decimal
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
    CurrentSourceArtifactAdapter,
    iter_current_source_retention_batches,
    signal_notional_current_source_admission,
)
from portal_api.services.research_artifacts import ArtifactFence, ArtifactIdentity, ResearchArtifactStore
from strategy.specification import DELTA_RSI_SPECIFICATION

CURSOR_SECRET = b"w3-current-source-cursor-secret-at-least-32-bytes"
RUN_ID = "run-w3-facts"


def _request() -> PortalRunRequest:
    return PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="golden-fixture",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="advanced_walk_forward",
        parameter_space=ParameterSpaceConfig({
            key: ParameterSpec(
                kind="float_range" if isinstance(low, float) else "int_range",
                low=low,
                high=high,
                step=step,
            )
            for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
        }),
        account=AccountConfig(),
        execution=ExecutionConfig(target_mode="signal_notional"),
        calibration=AdvancedWalkForwardConfig(
            split_mode="2024-01-08",
            split_frequency="weekly",
            window_mode="expanding",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            fold_boundary_position_policy="carry",
            optuna_trials=3,
            optuna_early_stopping=None,
            random_seed=42,
            optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        ),
    )


def _market() -> PreparedMarketData:
    return PreparedMarketData(
        frame=build_market_frame(),
        descriptor=DatasetDescriptor(dataset_id="golden-fixture", symbol="ETHUSDT", venue="BINANCE", timeframe="1h"),
        content_hash="golden-fixture",
        missing_bar_count=0,
    )


def _export(source: ArtifactRepository, retained_root: Path):
    retained = ResearchArtifactStore(retained_root)
    fence = ArtifactFence(workspace_id="ws-w3", run_id=RUN_ID, worker_attempt_id="worker-w3", lease_epoch=1)
    exported = CurrentSourceArtifactAdapter(source_artifacts=source, retained_artifacts=retained).export_advanced_walkforward(
        run_id=RUN_ID,
        identity=ArtifactIdentity(
            artifact_id="w3-artifact",
            artifact_revision=1,
            workspace_id="ws-w3",
            run_id=RUN_ID,
            engine_release_id="quantbt-1.1.1",
            engine_build_ref="pypi-wheel-1.1.1",
            request_spec_digest="a" * 64,
            effective_spec_digest="b" * 64,
            dataset_binding_digest="c" * 64,
        ),
        fence=fence,
        admission=signal_notional_current_source_admission(),
        fence_validator=lambda candidate: candidate == fence,
    )
    batches = list(iter_current_source_retention_batches(
        retained_artifacts=retained, receipt=exported.receipt, cursor_secret=CURSOR_SECRET,
    ))
    rows: dict[str, list[dict]] = {}
    for batch in batches:
        rows.setdefault(batch.table_kind, []).extend(dict(row) for row in batch.rows)
    return exported, rows


@pytest.fixture(scope="module")
def wfo(tmp_path_factory: pytest.TempPathFactory):
    root = tmp_path_factory.mktemp("w3-facts")
    source = ArtifactRepository(root / "source")
    AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source).run(
        _request(), _market(), RUN_ID, target_mode="signal_notional",
    )
    exported, rows = _export(source, root / "retained")
    return root, source, exported, rows


def _raw(source: ArtifactRepository, relative: str) -> pd.DataFrame:
    return pd.read_parquet(source.run_directory(RUN_ID) / relative)


def test_trial_ledger_carries_each_trials_own_parameters(wfo) -> None:
    """W1 receipt bug (a): the ledger shipped `parameters: {}` for every trial."""

    _, source, _, rows = wfo
    raw = _raw(source, "wfo/trials.parquet")
    retained = {row["sourceId"]: row["payload"] for row in rows["TRIAL"]}
    assert len(retained) == len(raw) == 3
    for record in raw.to_dict(orient="records"):
        expected = json.loads(record["params_json"])
        parameters = retained[str(record["trial_id"])]["parameters"]
        assert set(parameters) == set(expected) and len(parameters) == 8
        for key, value in expected.items():
            assert Decimal(parameters[key]) == Decimal(str(value))


def test_trial_and_selection_objectives_are_labelled_by_what_they_measure(wfo) -> None:
    """W1 receipt bug (b): trial 0 = −1.44 but selection trial 0 = −9.81.

    Not an id mix-up: the Stage-A row's objective is the IS mean Sharpe, the
    selected candidate's objective is QuantBT's Mode 1 decay-adjusted J over
    the same parameters. Each is now labelled, and the candidate carries the
    OOS numbers the Stage-A row never had.
    """

    _, source, exported, rows = wfo
    selected = json.loads((source.run_directory(RUN_ID) / "selection" / "selected_params.json").read_text())
    trial = next(row["payload"] for row in rows["TRIAL"] if row["sourceId"] == str(selected["trial_id"]))
    candidate = next(
        row["payload"] for row in rows["CANDIDATE"]
        if row["payload"]["trial_facts"]["source_trial_id"] == str(selected["trial_id"])
    )
    assert trial["trial_facts"]["objective_kind"] == "IS_MEAN_SHARPE"
    assert trial["trial_facts"]["stage"] == "is_search"
    assert Decimal(trial["objective"]) == Decimal(trial["trial_facts"]["metrics"]["mean_is_sharpe"])
    assert candidate["trial_facts"]["objective_kind"] == "MODE_1_DECAY_J"
    assert Decimal(candidate["objective"]) == Decimal(str(selected["objective"]))
    assert Decimal(exported.receipt.summary["selection"]["objective"]) == Decimal(str(selected["objective"]))
    assert Decimal(candidate["trial_facts"]["metrics"]["mean_oos_sharpe"]) == Decimal(str(selected["mean_oos_sharpe"]))
    search = exported.receipt.summary["source_facts"]["search"]
    assert search["selected_trial_id"] == str(selected["trial_id"])
    assert search["raw_best_is_trial_id"] in {row["sourceId"] for row in rows["TRIAL"]}
    assert search["candidate_source_trial_ids"] == [str(selected["trial_id"])]


def test_is_search_placeholders_never_become_zero(wfo) -> None:
    _, source, _, rows = wfo
    raw = _raw(source, "wfo/trials.parquet")
    assert set(raw["mean_oos_sharpe"]) == {0.0}  # QuantBT's Stage-A placeholder
    for row in rows["TRIAL"]:
        metrics = row["payload"]["trial_facts"]["metrics"]
        assert metrics["mean_oos_sharpe"] is None and metrics["mean_decay"] is None
        assert metrics["oos_reason_code"] == "QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS"
        assert row["payload"]["trial_facts"]["fold_scope"] == {"kind": "ALL_OUTER_FOLDS", "fold_id": None, "reason_code": None}
        assert row["payload"]["state"] == "COMPLETE"


def test_objective_components_recompose_the_retained_objective(wfo) -> None:
    _, _, exported, rows = wfo
    for row in [*rows["TRIAL"], *rows["CANDIDATE"]]:
        components = row["payload"]["trial_facts"]["objective_components"]
        assert components["state"] == "AVAILABLE", components
        total = sum(Decimal(term["contribution"]) for term in components["terms"])
        assert abs(total - Decimal(row["payload"]["objective"])) <= Decimal("1e-9") * max(Decimal(1), abs(total))
    probe = exported.receipt.summary["source_facts"]["search"]["objective_probe"]
    assert probe == {"rows": len(rows["TRIAL"]) + len(rows["CANDIDATE"]), "verified_rows": len(rows["TRIAL"]) + len(rows["CANDIDATE"])}


def test_fold_facts_match_quantbt_fold_metrics_and_the_retained_path(wfo) -> None:
    _, source, _, rows = wfo
    run_dir = source.run_directory(RUN_ID)
    metrics = json.loads((run_dir / "wfo" / "selected_fold_metrics.v1.json").read_text())["fold_metrics"]
    stitched = pd.read_parquet(run_dir / "series" / "stitched.parquet")
    assert len(rows["FOLD"]) == len(metrics) >= 2
    for row, source_metrics in zip(rows["FOLD"], metrics, strict=True):
        facts = row["payload"]["fold_facts"]
        score = facts["oos_score"]
        assert Decimal(score["oos_sharpe"]) == Decimal(str(source_metrics["oos_sharpe"]))
        assert Decimal(score["decay"]) == Decimal(str(source_metrics["decay"]))
        assert Decimal(score["oos_trade_count"]) == Decimal(str(source_metrics["oos_trade_count"]))
        # Independent float recomputation of the path facts from the raw parquet.
        start = pd.Timestamp(row["payload"]["test_start_utc_ms"], unit="ms", tz="UTC")
        end = pd.Timestamp(row["payload"]["test_end_utc_ms"], unit="ms", tz="UTC")
        window = stitched.loc[(stitched.index >= start) & (stitched.index <= end)]
        base = float(stitched.loc[stitched.index < start, "equity"].iloc[-1])
        path = facts["oos_path"]
        assert path["observation_count"] == len(window) == facts["test_bars"]
        assert float(path["return_fraction"]) == pytest.approx(window["equity"].iloc[-1] / base - 1, abs=1e-12)
        peak = window["equity"].cummax().clip(lower=base)
        assert float(path["max_drawdown_fraction"]) == pytest.approx((window["equity"] / peak - 1).min(), abs=1e-12)
        assert float(path["worst_return_fraction"]) == pytest.approx(window["returns"].min(), abs=1e-15)
        guards = facts["guards"]
        for name in ("warmup", "label_horizon", "purge", "embargo"):
            assert guards[name]["bars"] == 0 and guards[name]["start_utc_ms"] is None
        assert guards["account_policy"] == "carry_position"


def test_claims_and_guards_are_quantbts_own_metadata(wfo) -> None:
    _, source, exported, _ = wfo
    selected = json.loads((source.run_directory(RUN_ID) / "selection" / "selected_params.json").read_text())
    facts = exported.receipt.summary["source_facts"]
    assert facts["claims"]["validation_claim"] == selected["validation_claim"] == "walk_forward_oos"
    assert facts["claims"]["causality_claim"] == selected["causality_claim"]
    assert facts["claims"]["oos_used_for_selection"] is selected["oos_used_for_selection"] is True
    assert facts["claims"]["chronological_validation_claim"] == "not_causal_multi_fold_global_calibration"
    assert facts["temporal_guards"]["purge_bars"] == 0 and facts["temporal_guards"]["warmup_policy"] == "none"
    assert facts["temporal_guards"]["inner_validation"] is None and facts["temporal_guards"]["inner_validation_published"] is True
    assert facts["execution"]["engine_id"] == "close_target_v2"
    assert facts["search"]["trial_ledger_mode"] == "compact"
    data_use = exported.receipt.summary["data_use"]
    assert {value["state"] for value in data_use.values()} == {"AVAILABLE"}
    assert len(json.dumps(exported.receipt.summary).encode()) <= 65_536


def test_retained_rows_expose_only_declared_fact_blocks(wfo) -> None:
    _, _, _, rows = wfo
    for row in rows["FOLD"]:
        assert set(row["payload"]) == {
            "fold_id", "train_start_utc_ms", "train_end_utc_ms", "test_start_utc_ms", "test_end_utc_ms", "fold_facts",
            # W5b / P17-T14: QuantBT's declared strategy-isolation block.
            "child_audit",
        }
    for kind in ("TRIAL", "CANDIDATE"):
        for row in rows[kind]:
            assert "payload_json" not in row["payload"] and "selection_metadata" not in row["payload"]


def test_a_source_tree_without_the_new_documents_keeps_typed_absences(wfo, tmp_path: Path) -> None:
    root, source, _, _ = wfo
    legacy_root = tmp_path / "legacy-source"
    shutil.copytree(source.run_directory(RUN_ID), legacy_root / RUN_ID)
    for name in ("source_contract.v1.json", "selected_fold_metrics.v1.json"):
        (legacy_root / RUN_ID / "wfo" / name).unlink()
    exported, rows = _export(ArtifactRepository(legacy_root), tmp_path / "retained")
    assert "source_facts" not in exported.receipt.summary
    assert {value["state"] for value in exported.receipt.summary["data_use"].values()} == {"NOT_PUBLISHED"}
    for row in rows["FOLD"]:
        assert row["payload"]["fold_facts"]["oos_score"] is None
    for row in rows["TRIAL"]:
        assert row["payload"]["trial_facts"]["fold_scope"]["kind"] == "NOT_PUBLISHED"


def test_rolling_returns_20_match_an_independent_reference(wfo) -> None:
    """A12 P13-T02: every emitted rolling-20 point equals equity[t]/equity[t-20]−1 of the raw series."""

    _, source, exported, _ = wfo
    stitched = pd.read_parquet(source.run_directory(RUN_ID) / "series" / "stitched.parquet")
    reference = (stitched["equity"] / stitched["equity"].shift(20) - 1).dropna()
    rolling = exported.receipt.summary["derived"]["rolling_returns_20"]
    assert rolling["source_observation_count"] == len(reference)
    by_ms = {int(index.value // 1_000_000): value for index, value in reference.items()}
    for point in rolling["values"]:
        assert float(point["return_fraction"]) == pytest.approx(by_ms[point["at_utc_ms"]], abs=1e-12)
    emitted = {point["at_utc_ms"] for point in rolling["values"]}
    # The extrema-bucket sampler keeps both endpoints and the global extrema.
    assert int(reference.idxmin().value // 1_000_000) in emitted
    assert int(reference.idxmax().value // 1_000_000) in emitted
    assert int(reference.index[0].value // 1_000_000) in emitted
    assert int(reference.index[-1].value // 1_000_000) in emitted


def test_future_data_does_not_move_the_fold_plan_and_the_claim_stays_non_causal(wfo, tmp_path: Path) -> None:
    """A12 P14-T01/T02 on the admitted global schedule.

    Perturbing every bar after fold 0's test window leaves the fold plan and
    every guard window unchanged. The global Mode 1 selector does see all
    folds, so QuantBT itself declares the run non-causal with OOS used for
    selection; the retained claim must say exactly that, never a strict pass.
    """

    _, _, exported, rows = wfo
    boundary = pd.Timestamp(rows["FOLD"][0]["payload"]["test_end_utc_ms"], unit="ms", tz="UTC")
    frame = build_market_frame().copy()
    future = frame.index > boundary
    for column in ("open", "high", "low", "close"):
        frame.loc[future, column] = frame.loc[future, column] * 1.07
    perturbed = PreparedMarketData(
        frame=frame,
        descriptor=DatasetDescriptor(dataset_id="golden-fixture", symbol="ETHUSDT", venue="BINANCE", timeframe="1h"),
        content_hash="golden-fixture-perturbed",
        missing_bar_count=0,
    )
    other = ArtifactRepository(tmp_path / "perturbed")
    AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=other).run(
        _request(), perturbed, RUN_ID, target_mode="signal_notional",
    )
    _, other_rows = _export(other, tmp_path / "retained")

    def plan(table: list[dict]) -> list[dict]:
        keys = ("fold_id", "train_start_utc_ms", "train_end_utc_ms", "test_start_utc_ms", "test_end_utc_ms")
        return [
            {key: row["payload"][key] for key in keys} | {"guards": row["payload"]["fold_facts"]["guards"]}
            for row in table
        ]

    assert plan(other_rows["FOLD"]) == plan(rows["FOLD"])
    claims = exported.receipt.summary["source_facts"]["claims"]
    assert claims["oos_used_for_selection"] is True
    assert claims["chronological_validation_claim"] == "not_causal_multi_fold_global_calibration"
    assert claims["causality_claim"] == "retrospective_global_calibration"
