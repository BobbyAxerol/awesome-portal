"""W5b (P17): the signal-notional route's retained replay ledger.

These tests run the public QuantBT 1.1.1 walk-forward on the deterministic
golden tape (and, opt-in, on real HMD bars) and check what the exporter
retains for Screen 08:

* the engine's own order/fill/trade tuples are counted, and on this
  close-target route they are empty (P17-T02: SOURCE_UNSUPPORTED_CONFIRMED);
* every bar carries the candle the engine consumed and the account's own
  fee/turnover/funding, with checkpoints equal to a sequential replay
  (P17-T04);
* the fold capital convention is QuantBT's, and a fold's start equity is the
  previous fold's end equity because the account is one stitched run
  (P17-T03/T14);
* the candle overview keeps the run's price extrema (downsample invariant);
* a source tree without the ledger keeps its v1 schema and digest.
"""

from __future__ import annotations

import json
import os
import shutil
from decimal import Decimal
from pathlib import Path

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    HistoricalMarketDataProvider,
    MarketDataQuery,
    load_historical_data_runtime,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter,
    iter_current_source_retention_batches,
    signal_notional_current_source_admission,
)
from portal_api.services.research_artifacts import ResearchArtifactStore
from test_current_source_artifacts import _fence, _identity, _market, _request

SECRET = b"rs02-current-source-cursor-secret-at-least-32-bytes"


def _run(tmp_path: Path, run_id: str, market=None, request=None):
    source = ArtifactRepository(tmp_path / "source-runs")
    runner = AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source)
    runner.run(
        request or _request(target_mode="signal_notional", optuna_trials=3),
        market or _market(),
        run_id,
        target_mode="signal_notional",
    )
    return source


def _export(source: ArtifactRepository, root: Path, run_id: str):
    retained = ResearchArtifactStore(root)
    fence = _fence(run_id)
    exported = CurrentSourceArtifactAdapter(source_artifacts=source, retained_artifacts=retained).export_advanced_walkforward(
        run_id=run_id,
        identity=_identity(run_id),
        fence=fence,
        admission=signal_notional_current_source_admission(),
        fence_validator=lambda candidate: candidate == fence,
    )
    batches = list(iter_current_source_retention_batches(retained_artifacts=retained, receipt=exported.receipt, cursor_secret=SECRET))
    rows: dict[str, list[dict]] = {}
    for batch in batches:
        rows.setdefault(batch.table_kind, []).extend(dict(row) for row in batch.rows)
    return exported, rows


@pytest.fixture(scope="module")
def golden(tmp_path_factory):
    tmp_path = tmp_path_factory.mktemp("w5b")
    run_id = "run-w5b-signal-notional"
    source = _run(tmp_path, run_id)
    exported, rows = _export(source, tmp_path / "retained", run_id)
    return tmp_path, source, run_id, exported, rows


def _assert_replay_ledger(source: ArtifactRepository, run_id: str, exported, rows) -> dict:
    run_dir = source.run_directory(run_id)
    stitched = pd.read_parquet(run_dir / "series" / "stitched.parquet")
    ledger = pd.read_parquet(run_dir / "series" / "account_ledger.v1.parquet")
    contract = json.loads((run_dir / "wfo" / "account_contract.v1.json").read_text())
    summary = exported.receipt.summary["replay"]

    # P17-T02: the engine's own tuples, counted. close_target_v2 emits none.
    assert contract["orders_published"] == 0
    assert contract["fills_published"] == 0
    assert contract["trades_published"] == 0
    assert contract["orders_count"] == 0 and contract["fills_count"] == 0
    assert summary["account_contract"]["orders_published"] == 0
    assert summary["account_contract"]["fills_published"] == 0
    assert summary["account_contract"]["trades_published"] == 0
    assert summary["account_contract"]["allow_partial_fill"] is False
    assert summary["account_contract"]["oms_mode"] == "netting"
    assert exported.receipt.as_dict()["coverage"]["route_ledger"] == "SOURCE_UNSUPPORTED_CONFIRMED"

    observations = rows["OBSERVATION"]
    assert len(observations) == len(stitched) == len(ledger)
    bars = [row["payload"]["bar"] for row in observations]
    assert all(bar["schema_version"] == "research.current-source-bar.v1" for bar in bars)

    # Every bar is the engine's own number, exactly.
    fee_sum = Decimal("0")
    turnover_sum = Decimal("0")
    transitions = 0
    previous = None
    previous_text = None
    for index, (row, bar) in enumerate(zip(observations, bars, strict=True)):
        source_bar = stitched.iloc[index]
        assert Decimal(bar["candle"]["high"]) == Decimal(str(float(source_bar["high"])))
        assert Decimal(bar["candle"]["low"]) == Decimal(str(float(source_bar["low"])))
        assert Decimal(bar["candle"]["close"]) == Decimal(str(float(source_bar["close"])))
        assert Decimal(bar["fee"]) == Decimal(str(float(ledger["fee"].iloc[index])))
        assert Decimal(bar["turnover"]) == Decimal(str(float(ledger["turnover"].iloc[index])))
        fee_sum += Decimal(bar["fee"])
        turnover_sum += Decimal(bar["turnover"])
        position = Decimal(row["payload"]["accepted_position"])
        changed = position != (previous if previous is not None else Decimal("0"))
        transitions += int(changed)
        assert bar["transition"] is changed
        assert bar["position_before"] == previous_text
        # P17-T04: the checkpoint a far seek reads equals the sequential sum.
        assert Decimal(bar["checkpoint"]["cumulative_fee"]) == fee_sum
        assert Decimal(bar["checkpoint"]["cumulative_turnover"]) == turnover_sum
        assert bar["checkpoint"]["transition_count"] == transitions
        # On this route a fee is charged exactly when the target moves.
        assert (Decimal(bar["fee"]) != 0) is changed
        previous = position
        previous_text = row["payload"]["accepted_position"]
    assert summary["totals"]["transitions"] == transitions
    assert Decimal(summary["totals"]["fee"]) == fee_sum
    assert summary["totals"]["bars_with_turnover"] == transitions

    # P17-T03/T14: one stitched account that carries its position; fold k
    # starts from fold k-1's last equity, never from a re-based capital.
    capital = summary["fold_capital"]
    assert capital["account_execution"] == "single_stitched_run"
    assert capital["policy"] == "carry_position"
    segments = summary["fold_segments"]
    assert len(segments) == exported.receipt.table_rows["folds"] >= 2
    for before, after in zip(segments, segments[1:]):
        assert after["first_ordinal"] == before["last_ordinal"] + 1
        assert after["start_equity"] == before["end_equity"]
        assert after["start_position"] == before["end_position"]
        assert after["start_basis"] == "PREVIOUS_OBSERVATION"
    for segment in segments:
        inside = bars[segment["first_ordinal"] : segment["last_ordinal"] + 1]
        assert all(bar["fold_id"] == segment["fold_id"] for bar in inside)
        assert segment["transitions"] == sum(1 for bar in inside if bar["transition"])
    assert [event["policy"] for event in capital["boundary_events"]] == ["carry_position"] * (len(segments) - 1)

    # Overview: bounded, and the run's extrema survive the downsample.
    overview = summary["candle_overview"]
    assert overview["emitted_bucket_count"] <= 160
    assert Decimal(overview["envelope"]["max_high"]) == max(Decimal(bar["candle"]["high"]) for bar in bars)
    assert Decimal(overview["envelope"]["min_low"]) == min(Decimal(bar["candle"]["low"]) for bar in bars)
    assert max(Decimal(value["high"]) for value in overview["values"]) == Decimal(overview["envelope"]["max_high"])
    assert sum(value["transitions"] for value in overview["values"]) == transitions
    assert overview["values"][0]["first_ordinal"] == 0
    assert overview["values"][-1]["last_ordinal"] == len(bars) - 1
    assert len(json.dumps(exported.receipt.summary, sort_keys=True).encode("utf-8")) <= 65_536
    return {"transitions": transitions, "fee": str(fee_sum), "segments": segments}


def test_signal_notional_replay_ledger_is_the_engine_account_bar_by_bar(golden) -> None:
    _, source, run_id, exported, rows = golden
    measured = _assert_replay_ledger(source, run_id, exported, rows)
    assert measured["transitions"] >= 1


def test_a_source_tree_without_the_ledger_keeps_its_v1_shape_and_digest(golden) -> None:
    tmp_path, source, run_id, exported, _ = golden
    legacy_root = tmp_path / "legacy-source"
    shutil.copytree(source.run_directory(run_id), legacy_root / run_id)
    (legacy_root / run_id / "series" / "account_ledger.v1.parquet").unlink()
    (legacy_root / run_id / "wfo" / "account_contract.v1.json").unlink()
    legacy, rows = _export(ArtifactRepository(legacy_root), tmp_path / "retained-legacy", run_id)
    assert "replay" not in legacy.receipt.summary
    assert all("bar" not in row["payload"] for row in rows["OBSERVATION"])
    assert legacy.receipt.source_transform_digest != exported.receipt.source_transform_digest
    manifest, _ = ResearchArtifactStore(tmp_path / "retained-legacy")._load_and_verify_manifest(  # noqa: SLF001
        legacy.receipt.artifact_id, verify_parts=False,
    )
    schema = {table["table_kind"]: table["schema_version"] for table in manifest["tables"]}
    assert schema["observations"] == "research.current-source-observations.v1"
    new_manifest, _ = ResearchArtifactStore(tmp_path / "retained")._load_and_verify_manifest(  # noqa: SLF001
        exported.receipt.artifact_id, verify_parts=False,
    )
    assert {table["table_kind"]: table["schema_version"] for table in new_manifest["tables"]}["observations"] == (
        "research.current-source-observations.v2"
    )


@pytest.mark.skipif(
    os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1",
)
def test_real_hmd_signal_notional_replay_ledger(tmp_path: Path) -> None:
    """BTCUSDT 1h 2026-06-01..07-15 through the approved read-only HMD reader."""

    start = pd.Timestamp("2026-06-01T00:00:00Z")
    split = pd.Timestamp("2026-07-01T00:00:00Z")
    end = pd.Timestamp("2026-07-15T00:00:00Z")
    runtime = load_historical_data_runtime(Path(os.environ["HISTORICAL_MARKET_DATA_ROOT"]))
    market = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(
        MarketDataQuery(dataset_id=CRYPTO_BINANCE_DATASET_ID, symbol="BTCUSDT", timeframe="1h", start=start, end_exclusive=end)
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
    run_id = "run-w5b-real-hmd"
    source = _run(tmp_path, run_id, market=market, request=request)
    exported, rows = _export(source, tmp_path / "retained", run_id)
    measured = _assert_replay_ledger(source, run_id, exported, rows)
    print("\nW5B_REAL_HMD_REPLAY " + json.dumps({
        "bars": len(rows["OBSERVATION"]),
        "transitions": measured["transitions"],
        "fee": measured["fee"],
        "segments": measured["segments"],
    }, sort_keys=True))
