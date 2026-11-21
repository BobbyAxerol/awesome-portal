"""Bounded old-wheel qualification; not a Portal admission/upgrade receipt.

Consumes one existing hash-verified HMD snapshot, excludes its holdout, and
uses the installed Portal strategy and published public engine. No DB writes,
retention writer, production version override or reseal are performed.
"""
from __future__ import annotations

import contextlib
import hashlib
from importlib import metadata
import json
import pathlib
import resource
import sys


RUN = "rrun_d8e174e6268aedbf868de56edd062b29"
MANIFEST = "1bacd23b0deac44445f46f30bc8e4bf4e5cc7ff1e63a6a363a2d34aa2ba6e441"
SNAPSHOT = "42ccef20ff66a19d219ba1aeb9355923f1e60c04a7e09851fa96e32c022368b3"


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def main() -> None:
    import pandas as pd
    import quantbt
    from portal_api.adapters.quantbt import QuantBTGateway
    from strategy.delta_rsi import generate_signals

    expected = sys.argv[1]
    assert expected in {"1.1.0", "1.1.1"}, "EXACT_OWNER_ENGINE_PAIR_REQUIRED"
    assert metadata.version("quantbt-engine") == expected
    native = metadata.version("quantbt-native")
    assert native == {"1.1.0": "0.4.1", "1.1.1": "0.4.2"}[expected]
    distribution = metadata.distribution("quantbt-engine")
    assert pathlib.Path(quantbt.__file__).resolve().is_relative_to(
        pathlib.Path(distribution.locate_file("quantbt")).resolve())
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    resource.setrlimit(resource.RLIMIT_FSIZE, (16 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
    root = pathlib.Path("/var/lib/portal/artifacts/runs/durable-store")
    paths = list((root / "runs" / RUN / "attempts").glob("*/bundle/*/manifest.json"))
    assert len(paths) == 1, "ONE_ORIGINAL_SEALED_ATTEMPT_REQUIRED"
    raw = paths[0].read_bytes()
    assert sha(raw) == MANIFEST
    manifest = json.loads(raw)
    assert manifest["run_id"] == RUN and manifest["status"] == "succeeded"

    def blob(name: str):
        digest = manifest["files"][name]
        body = (root / "blobs" / digest).read_bytes()
        assert len(body) <= 16 * 1024 * 1024 and sha(body) == digest
        return json.loads(body), digest

    request, request_hash = blob("config/request.json")
    binding, binding_hash = blob("research/dataset-binding-receipt.json")
    snapshot = root.parent / "snapshots/snapshots" / binding["snapshot_id"]
    frame = snapshot / "frame.parquet"
    assert sha(frame.read_bytes()) == binding["snapshot_content_hash"] == SNAPSHOT
    market = pd.read_parquet(frame)
    assert len(market) == 684 and market.index.is_unique and market.index.is_monotonic_increasing
    cutoff = pd.Timestamp(request["requested_spec"]["windows"]["oos"]["end_exclusive"], tz="UTC")
    assert cutoff == pd.Timestamp(request["requested_spec"]["windows"]["holdout"]["start"], tz="UTC")
    tape = market.loc[market.index < cutoff]
    assert len(tape) == 636 and len(tape) < len(market)
    with contextlib.redirect_stdout(sys.stderr):
        signal = generate_signals(tape, request["p04_parameters"])["pos_weight"]
        endpoint = quantbt.QuantBTEndpoint.signal_notional(
            initial_capital=20000, leverage=3, alloc_per_trade=2000,
            fee_rate=0.0005, use_funding=False)
        result = endpoint.backtest(data=tape, signal=signal)
        report = result.full_report()
    # Verify the actual production gateway does NOT silently admit this old
    # engine. Do not monkeypatch its constant to manufacture Portal readiness.
    try:
        gateway_version = QuantBTGateway().version()
        gateway = {"state": "ACCEPTED", "version": gateway_version}
        assert expected == "1.1.1"
    except RuntimeError as error:
        assert expected == "1.1.0" and "Unsupported quantbt-engine version" in str(error)
        gateway = {"state": "REFUSED", "reason": "INSTALLED_PORTAL_GATEWAY_REQUIRES_1_1_1"}
    assert sha(paths[0].read_bytes()) == MANIFEST and sha(frame.read_bytes()) == SNAPSHOT
    print(json.dumps({
        "schema_version": "research.p23-second-engine-public-route.v1",
        "scope": "READ_ONLY_REAL_HMD_FIXED_DELTA_PUBLIC_ENGINE_NOT_PORTAL_ADMISSION",
        "engine_version": expected, "native_version": native,
        "run_id": RUN, "request_sha256": request_hash, "binding_sha256": binding_hash,
        "manifest_sha256": MANIFEST, "snapshot_sha256": SNAPSHOT,
        "snapshot_id": binding["snapshot_id"], "dataset": request["requested_spec"]["data"],
        "windows": request["requested_spec"]["windows"],
        "direct": {"bars": str(len(tape)), "final_equity": repr(float(report["final_equity"])),
                   "num_trades": str(int(report["num_trades"]))},
        "portal_gateway": gateway, "original_bytes_unchanged": True,
        "worker_admission": "NOT_TESTED_NO_110_PROFILE",
    }))


if __name__ == "__main__":
    main()
