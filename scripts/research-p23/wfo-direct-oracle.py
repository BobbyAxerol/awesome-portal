"""Read-only qualification oracle: call the published engine, not Portal's runner.

Only the sealed built-in Delta/global/three-trial profile is admitted here.
No source receipt is overwritten, no job is inserted and no result is sealed.
"""
from __future__ import annotations

import hashlib
import contextlib
import json
import math
import pathlib
import re
import resource
import sys
from decimal import Decimal
from importlib import metadata


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def checked_bytes(root, relative, maximum=16 * 1024 * 1024):
    name = pathlib.PurePosixPath(relative)
    assert not name.is_absolute() and ".." not in name.parts, "RELATIVE_CUSTODY_PATH_REQUIRED"
    path = root.joinpath(*name.parts)
    assert not any(p.is_symlink() for p in (path, *path.parents)), "SYMLINK_CUSTODY_REFUSED"
    assert path.is_file() and 0 < path.stat().st_size <= maximum, "SOURCE_BYTE_CAP"
    raw = path.read_bytes()
    assert len(raw) <= maximum, "SOURCE_BYTE_CAP"
    return raw


def decimal(value):
    numeric = Decimal(str(value))
    assert numeric.is_finite(), "FINITE_SOURCE_NUMBER_REQUIRED"
    return format(numeric, "f")


def main():
    import pandas as pd
    import pyarrow.parquet as pq
    from quantbt import QuantBTEndpoint
    from quantbt.walkforward import WalkForwardConfig
    from strategy.delta_rsi import build_walkforward_signal
    from strategy.specification import DELTA_RSI_SPECIFICATION

    args = json.load(sys.stdin)
    run, artifact = args["run_id"], args["artifact_id"]
    assert re.fullmatch(r"rrun_[a-z0-9]{1,80}", run)
    assert re.fullmatch(r"rart_[a-z0-9]{1,80}", artifact)
    assert metadata.version("quantbt-engine") == "1.1.1", "PINNED_ENGINE_REQUIRED"
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    root = pathlib.Path("/var/lib/portal/artifacts/runs/durable-store")
    retained = root / "research-retained/artifacts" / artifact
    manifest_raw = checked_bytes(retained, "manifest.json")
    manifest = json.loads(manifest_raw)
    assert manifest["run_id"] == run and manifest["artifact_id"] == artifact
    assert sha(manifest_raw) == args["manifest_digest"], "MANIFEST_PIN_MISMATCH"
    pins = {"manifest": sha(manifest_raw)}

    def document(name):
        rows = [r for r in manifest["documents"] if r["name"] == name]
        assert len(rows) == 1, "EXACT_DOCUMENT_REQUIRED"
        row = rows[0]
        raw = checked_bytes(retained, row["relative_path"])
        assert len(raw) == row["bytes"] and sha(raw) == row["sha256"], "DOCUMENT_HASH_MISMATCH"
        pins[name] = sha(raw)
        return json.loads(raw)

    def table(name):
        rows = [r for r in manifest["tables"] if r["table_kind"] == name]
        assert len(rows) == 1, "EXACT_TABLE_REQUIRED"
        row = rows[0]
        assert 0 < row["rows"] <= 10_000 and len(row["parts"]) <= 50, "TABLE_ROW_CAP"
        frames = []
        for part in row["parts"]:
            raw = checked_bytes(retained, part["relative_path"])
            assert len(raw) == part["bytes"] and sha(raw) == part["sha256"], "PART_HASH_MISMATCH"
            frame = pq.read_table(retained / part["relative_path"]).to_pandas()
            assert len(frame) == part["rows"], "PART_ROW_MISMATCH"
            frames.append(frame)
        result = pd.concat(frames, ignore_index=True)
        assert len(result) == row["rows"], "TABLE_ROW_MISMATCH"
        assert list(result.source_ordinal) == list(range(len(result))), "SOURCE_ORDINAL_MISMATCH"
        return result

    config = document("source_config")
    source_metrics = document("source_metrics")["segments"]["stitched"]
    summary = document("current_source_summary")
    calibration = config["calibration"]
    assert config["strategy_id"] == "delta-rsi-polynomial-alpha"
    assert config["protocol"] == "advanced_walk_forward" and config["timeframe"] == "1h"
    assert calibration["optimization_mode"] == "mode_1_decay"
    assert calibration["optimization_schedule"] == "global"
    assert calibration["optuna_trials"] == 3 and calibration["random_seed"] == 42
    assert config["execution"]["target_mode"] == "signal_notional"
    paths = list((root / "runs" / run / "attempts").glob("*/bundle/*/manifest.json"))
    assert len(paths) == 1, "ONE_SEALED_ATTEMPT_REQUIRED"
    bundle_raw = checked_bytes(root, str(paths[0].relative_to(root)))
    bundle = json.loads(bundle_raw)
    assert bundle["run_id"] == run and bundle["status"] == "succeeded"
    pins["bundle"] = sha(bundle_raw)

    def blob(name):
        digest = bundle["files"][name]
        assert re.fullmatch(r"[a-f0-9]{64}", digest)
        raw = checked_bytes(root, "blobs/" + digest)
        assert sha(raw) == digest, "BUNDLE_BLOB_HASH_MISMATCH"
        pins[name] = digest
        return json.loads(raw)

    request = blob("config/request.json")
    binding = blob("research/dataset-binding-receipt.json")
    assert request["run_id"] == binding["run_id"] == run
    assert request["execution_profile_id"] == "p10.delta-signal-notional-wfo.v1"
    spec = request["requested_spec"]
    assert spec["client"]["engine_release_id"] == "er_quantbt_111"
    assert spec["data"] == {k: config[k] for k in ("dataset_id", "symbol", "timeframe")}
    assert spec["walk_forward"]["start"] == calibration["data_start"]
    assert spec["walk_forward"]["end_exclusive"] == calibration["data_end_exclusive"]
    snapshot = binding["snapshot_id"]
    assert re.fullmatch(r"dss_[a-z0-9]{1,80}", snapshot)
    snapshot_root = root.parent / "snapshots/snapshots" / snapshot
    raw = checked_bytes(snapshot_root, "frame.parquet")
    identity = json.loads(checked_bytes(snapshot_root, "identity.json"))
    assert sha(raw) == identity["content_hash"] == binding["snapshot_content_hash"]
    pins["snapshot"] = sha(raw)
    market = pq.read_table(snapshot_root / "frame.parquet").to_pandas()
    assert market.index.is_unique and market.index.is_monotonic_increasing
    start, end = map(pd.Timestamp, (calibration["data_start"], calibration["data_end_exclusive"]))
    assert 0 < (end - start).total_seconds() <= 92 * 86400
    tape = market.loc[(market.index >= start) & (market.index < end)]
    assert 0 < len(tape) <= 2208
    # Config comes from hash-verified source bytes; do not call the Portal config
    # mapper, runner, retention serializer, objective or analytics implementation.
    fields = {k: v for k, v in calibration.items() if k not in {
        "optimization", "data_start", "data_end_exclusive"}}
    fields.update(calibration["optimization"])
    fields.update(target_mode="signal_notional", metadata={"lifecycle_ledger_max_rows": 20_000})
    account = config["account"]
    kwargs = {k: account[k] for k in ("initial_capital", "leverage", "maintenance_ratio",
        "contract_size", "alloc_per_trade", "funding_rate", "use_pyramiding")}
    kwargs.update(fee_rate=account["canonical_one_way_fee_rate"], use_funding=account["funding_enabled"],
        slippage=config["execution"]["slippage"])
    ranges = {}
    # Optuna consumes its seeded RNG in declaration order, not canonical-JSON
    # key order. Bind that order to the image-owned strategy declaration and
    # assert every sealed range agrees before calling the engine.
    assert set(config["parameter_space"]) == set(DELTA_RSI_SPECIFICATION.parameter_space)
    for name, declared in DELTA_RSI_SPECIFICATION.parameter_space.items():
        entry = config["parameter_space"][name]
        assert entry["kind"] in {"int_range", "float_range"}, "DECLARED_RANGE_REQUIRED"
        assert (entry["low"], entry["high"], entry["step"]) == declared, "INSTALLED_STRATEGY_RANGE_DRIFT"
        ranges[name] = (entry["low"], entry["high"], entry["step"])
    endpoint = QuantBTEndpoint.walk_forward(strategy_class=build_walkforward_signal,
        target_mode="signal_notional", walkforward_config=WalkForwardConfig(**fields),
        optimization_config=fields, **kwargs)
    # Engines may emit progress to stdout; keep stdout exclusively structured.
    with contextlib.redirect_stdout(sys.stderr):
        result = endpoint.backtest(data=tape, param_ranges=ranges)
    report = result.full_report(trading_days=calibration["optimization"]["scoring_trading_days"])
    wf = result.metadata["walk_forward"]
    assert 2 <= wf["n_folds"] <= 16
    observations = table("observations")
    assert len(observations) == len(result.equity) == len(tape)
    # Raw accounting equity and time are exact; no floating tolerance hides drift.
    for row, (at, equity) in zip(observations.itertuples(), result.equity.items(), strict=True):
        assert row.at_utc_ms == int(at.value // 1_000_000), "OBSERVATION_TIME_DIFF"
        assert Decimal(row.equity) == Decimal(str(float(equity))), (
            f"OBSERVATION_EQUITY_DIFF:{row.source_ordinal}:{row.equity}:{float(equity)!r}")
    for key in ("initial_capital", "final_equity", "num_trades", "sharpe", "sortino", "max_drawdown_pct"):
        assert math.isfinite(float(report[key]))
        assert report[key] == source_metrics[key], "SOURCE_METRIC_DIFF:" + key
    folds, trials, selection = table("folds"), table("trials"), table("selection")
    assert len(folds) == wf["n_folds"] and len(trials) == 3 and len(selection) == 1
    # Selected params/objective come from the engine, never from retained params.
    selected = selection.iloc[0]
    best = wf["best_trial"]
    assert {k: Decimal(v) for k, v in json.loads(selected.parameters_json).items()} == {
        k: Decimal(str(v)) for k, v in best["params"].items()}, "SELECTED_PARAMS_DIFF"
    initial, final = float(report["initial_capital"]), float(report["final_equity"])
    direct = {"initial_equity": decimal(initial), "final_equity": decimal(final),
        # Public summary's documented exact-decimal endpoint ratio, not the
        # binary64 percent from full_report. Accounting above is engine-owned.
        "net_return_fraction": decimal(Decimal(str(final)) / Decimal(str(initial)) - Decimal(1)),
        "max_drawdown_fraction": decimal(float((result.equity / result.equity.cummax() - 1).min()))}
    assert all(Decimal(direct[k]) == Decimal(summary["metrics"][k]) for k in direct), "SUMMARY_METRIC_DIFF"
    # Source-part rehash proves the oracle did not reseal/replace the tested evidence.
    assert sha(checked_bytes(retained, "manifest.json")) == pins["manifest"]
    print(json.dumps({"engine_version": metadata.version("quantbt-engine"), "run_id": run,
        "artifact_id": artifact, "pins": pins, "snapshot_id": snapshot,
        "dataset": spec["data"], "windows": spec["walk_forward"], "seed": calibration["random_seed"],
        "parameter_declaration_order": list(ranges), "direct_metrics": direct, "source_metrics_compared": 6,
        "observation_rows_exact": len(observations), "fold_count": len(folds), "trial_count": len(trials),
        "selected_parameters_exact": True, "peak_rss_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
        "engine_recomputed": True, "production_runner_used": False, "passed": True}))


if __name__ == "__main__":
    main()
