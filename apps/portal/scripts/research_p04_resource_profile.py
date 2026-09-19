#!/usr/bin/env python3
"""Measure the P04 public QuantBT signal-notional baseline.

This script intentionally uses only the public gateway/endpoint API and the
protected deterministic Delta fixture. It reports process-resident memory,
which includes Python and native allocations together. P04 does not inspect
private engine buffers or claim to apportion native bytes exactly.

Run from ``apps/portal``:

    PYTHONPATH=backend/src:backend/tests:. .venv/bin/python \
      scripts/research_p04_resource_profile.py --profile minimal
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import resource
import sys
import time
from pathlib import Path
from typing import Any


def _rss_kib() -> int:
    """Current RSS in KiB without depending on a nonstandard package."""
    status = Path("/proc/self/status")
    if status.is_file():
        for line in status.read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1])
    # Linux reports KiB; macOS reports bytes. The repository's supported
    # development image is Linux, but keep the output unit explicit.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform.startswith("linux") else value / 1024)


def _peak_rss_kib() -> int:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return int(value if sys.platform.startswith("linux") else value / 1024)


def _sample(stage: str) -> dict[str, Any]:
    return {
        "stage": stage,
        "rss_kib": _rss_kib(),
        "peak_rss_kib": _peak_rss_kib(),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", choices=("minimal", "score", "audit"), required=True)
    args = parser.parse_args(argv)

    stages = [_sample("process_start")]
    # Delayed imports make the import/native baseline observable rather than
    # hiding it in module import time.
    from golden_fixture import generate_golden_signals, load_golden
    from portal_api.adapters.quantbt import QuantBTGateway

    gateway = QuantBTGateway()
    engine_version = gateway.version()
    stages.append(_sample("engine_imported"))
    market, _, metadata = load_golden()
    signal = generate_golden_signals(market)["pos_weight"]
    input_bytes = int(market.memory_usage(index=True, deep=True).sum()) + int(
        signal.memory_usage(index=True, deep=True)
    )
    stages.append(_sample("immutable_input_loaded"))
    account = {
        "initial_capital": 20_000,
        "leverage": 3,
        "alloc_per_trade": 2_000,
        "fee_rate": 0.0005,
        "use_funding": False,
        "report_level": args.profile,
    }

    def run_once(label: str) -> tuple[dict[str, Any], float]:
        started = time.perf_counter()
        endpoint = gateway.signal_notional_endpoint(**account)
        stages.append(_sample(f"{label}_endpoint_constructed"))
        result = endpoint.backtest(data=market, signal=signal)
        elapsed_ms = (time.perf_counter() - started) * 1_000
        report = endpoint.full_report()
        stages.append(_sample(f"{label}_result_retained"))
        return {
            "final_equity": float(report["final_equity"]),
            "total_return_pct": float(report["total_return_pct"]),
            "max_drawdown_pct": float(report["max_drawdown_pct"]),
            "num_trades": int(report["num_trades"]),
            "equity_rows": int(len(result.equity)),
        }, elapsed_ms

    cold_result, cold_elapsed_ms = run_once("cold")
    # Same-process second run is the warm measurement. It is not promoted to
    # external production capacity evidence.
    warm_result, warm_elapsed_ms = run_once("warm")
    gc.collect()
    stages.append(_sample("post_gc_result_retained"))
    start_rss = stages[0]["rss_kib"]
    result_rss = stages[-1]["rss_kib"]
    payload = {
        "schema_version": "research.p04.resource-profile.v1",
        "engine": {"package": "quantbt-engine", "version": engine_version},
        "profile": args.profile,
        "measurement_scope": "single local Python process; public API only",
        "units": {"memory": "KiB", "input": "bytes", "elapsed": "ms"},
        "workload": {
            "route": "signal_notional",
            "fixture": "protected_delta_rsi_deterministic_500_hourly_bars",
            "kernel_sha256": metadata["kernel_sha256"],
            "input_bytes": input_bytes,
        },
        "stages": stages,
        "cold": {"elapsed_ms": cold_elapsed_ms, "result": cold_result},
        "warm": {"elapsed_ms": warm_elapsed_ms, "result": warm_result},
        "retained_process_memory": {
            "rss_delta_kib_from_start": max(0, result_rss - start_rss),
            "meaning": "process-resident delta including Python and native allocations; not a private-buffer attribution",
        },
        "writer_retention": {
            "state": "NOT_IMPLEMENTED_UNTIL_P05",
            "reason": "P04 measures compute only; P05 owns durable artifact writer retention and cleanup.",
        },
        "host": {"platform": sys.platform, "pid": os.getpid()},
    }
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
