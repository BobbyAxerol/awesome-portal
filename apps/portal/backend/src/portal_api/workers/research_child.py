"""P06 bounded QuantBT child entry point.

This module is intentionally *not* a generic plugin launcher.  P06 permits
only the pinned P04 Delta-RSI qualification operation; P07 owns imported/user
strategy admission.  The parent supervisor starts this module in a separate
PID, mount, user and network namespace and hands it an allowlisted receipt.
"""

from __future__ import annotations

import argparse
import json
import os
import resource
from pathlib import Path
from typing import Any


_BLOCKED_ENV_PREFIXES = (
    "AWS_",
    "DATABASE_",
    "EXECUTION_",
    "NATS_",
    "PORTAL_",
    "REDIS_",
)

_P04_DELTA_PARAMS: dict[str, float | int] = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}


def _safe_path(value: str, *, label: str) -> Path:
    path = Path(value).resolve(strict=True)
    if not path.is_file() or path.suffix != ".parquet":
        raise ValueError(f"{label} must name an existing Parquet file")
    return path


def _assert_clean_environment() -> None:
    leaked = sorted(
        name for name in os.environ
        if name.startswith(_BLOCKED_ENV_PREFIXES)
    )
    if leaked:
        raise RuntimeError(f"blocked scheduler environment keys reached the child: {', '.join(leaked)}")


def _network_namespace() -> str:
    return os.readlink("/proc/self/ns/net")


def _enforced_limits() -> dict[str, int]:
    """Return only the caps imposed by the allowlisted parent supervisor."""

    scratch = os.statvfs(os.environ["TMPDIR"])
    return {
        "address_space_bytes": int(resource.getrlimit(resource.RLIMIT_AS)[0]),
        "cpu_seconds": int(resource.getrlimit(resource.RLIMIT_CPU)[0]),
        "file_bytes": int(resource.getrlimit(resource.RLIMIT_FSIZE)[0]),
        "fd_limit": int(resource.getrlimit(resource.RLIMIT_NOFILE)[0]),
        "nproc_limit": int(resource.getrlimit(resource.RLIMIT_NPROC)[0]),
        "scratch_bytes": int(scratch.f_frsize * scratch.f_blocks),
    }


def _run_p04_delta_smoke(receipt: dict[str, Any]) -> dict[str, Any]:
    """Run the pinned real P04 Delta calculation over an approved tape.

    The output is intentionally a tiny scalar receipt.  P05 owns artifact
    reservation/sealing; this child neither knows nor receives PostgreSQL,
    NATS, Execution, broker or CLI credentials.
    """

    import pandas as pd

    from portal_api.adapters.quantbt import QuantBTGateway
    from strategy.delta_rsi import generate_signals

    parameters = receipt.get("p04_parameters", _P04_DELTA_PARAMS)
    if not isinstance(parameters, dict) or set(parameters) != set(_P04_DELTA_PARAMS):
        raise ValueError("P04 child receipt has an invalid parameter map")
    for name, expected in _P04_DELTA_PARAMS.items():
        value = parameters.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != expected:
            raise ValueError("P04 child receipt parameter map does not match installed profile")
    market_path = _safe_path(str(receipt["market_path"]), label="market_path")
    market = pd.read_parquet(market_path)
    signal = generate_signals(market, dict(parameters))["pos_weight"]
    endpoint = QuantBTGateway().signal_notional_endpoint(
        initial_capital=20_000,
        leverage=3,
        alloc_per_trade=2_000,
        fee_rate=0.0005,
        use_funding=False,
    )
    result = endpoint.backtest(data=market, signal=signal)
    report = result.full_report()
    return {
        "task": "P04_DELTA_SMOKE",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market)),
        "final_equity": float(report["final_equity"]),
        "num_trades": int(report["num_trades"]),
    }


def execute_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    _assert_clean_environment()
    if receipt.get("schema_version") != "research.p06.child-receipt.v1":
        raise ValueError("unsupported child receipt schema")
    if receipt.get("task") != "P04_DELTA_SMOKE":
        raise ValueError("P06 child task is not allowlisted")
    result = _run_p04_delta_smoke(receipt)
    result.update(
        {
            "child_pid": os.getpid(),
            "network_namespace": _network_namespace(),
            "credential_environment_clean": True,
            "enforced_limits": _enforced_limits(),
        }
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="P06 isolated QuantBT child")
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--result", required=True)
    arguments = parser.parse_args()
    receipt_path = Path(arguments.receipt).resolve(strict=True)
    result_path = Path(arguments.result).resolve()
    if result_path.parent != receipt_path.parent or result_path.name != "result.json":
        raise ValueError("child result path must be the sibling fixed result.json")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    result = execute_receipt(receipt)
    temporary = result_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    os.replace(temporary, result_path)
    return 0


if __name__ == "__main__":  # pragma: no cover - spawned child entry point
    raise SystemExit(main())
