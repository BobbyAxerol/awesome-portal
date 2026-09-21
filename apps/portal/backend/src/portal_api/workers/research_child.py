"""P06 bounded QuantBT child entry point.

This module is intentionally *not* a generic plugin launcher.  P06 permits
only the pinned P04 Delta-RSI qualification operation; P07 owns imported/user
strategy admission.  The parent supervisor starts this module in a separate
PID, mount, user and network namespace and hands it an allowlisted receipt.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import resource
from decimal import Decimal
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
_MAX_EVIDENCE_POINTS = 192


def _decimal_text(value: object, *, label: str) -> str:
    """Render a finite source number as a non-exponent decimal string.

    The child is the last place QuantBT values exist as Python numerics.  Do
    not let a JSON float cross this boundary: it would give each later reader
    a chance to round differently or serialize an invalid NaN.
    """

    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"P13 {label} is not numeric") from exc
    if not math.isfinite(numeric):
        raise ValueError(f"P13 {label} is not finite")
    text = format(Decimal(str(numeric)), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in {"", "-0"} else text


def _utc_ms(value: object, *, label: str) -> int:
    import pandas as pd

    try:
        timestamp = pd.Timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"P13 {label} timestamp is invalid") from exc
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")
    milliseconds = int(timestamp.value // 1_000_000)
    if milliseconds < 0:
        raise ValueError(f"P13 {label} timestamp precedes UTC epoch")
    return milliseconds


def _evidence_indices(equity: list[float]) -> list[int]:
    """Return <=192 chronological chart points while preserving extremes.

    The full OOS vector remains in-memory only long enough for source metric
    calculations.  A chart sample is a rendering aid, never the metric input.
    Each interior bucket contributes its min and max point, preserving the
    visually material drawdown/extrema without LTTB's numeric ambiguity.
    """

    count = len(equity)
    if count <= _MAX_EVIDENCE_POINTS:
        return list(range(count))
    buckets = (_MAX_EVIDENCE_POINTS - 2) // 2
    selected = {0, count - 1}
    for bucket in range(buckets):
        start = 1 + ((count - 2) * bucket) // buckets
        end = 1 + ((count - 2) * (bucket + 1)) // buckets
        if end <= start:
            continue
        window = equity[start:end]
        minimum = min(range(start, end), key=lambda index: equity[index])
        maximum = max(range(start, end), key=lambda index: equity[index])
        selected.add(minimum)
        selected.add(maximum)
    return sorted(selected)


def _return_distribution(values: list[float]) -> dict[str, Any]:
    """Return a bounded deterministic histogram from actual OOS returns."""

    finite = [value for value in values if math.isfinite(value)]
    if not finite:
        return {
            "state": "NOT_APPLICABLE",
            "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FINITE_RETURN_OBSERVATIONS",
            "buckets": [],
        }
    lower, upper = min(finite), max(finite)
    if math.isclose(lower, upper, rel_tol=0.0, abs_tol=0.0):
        return {
            "state": "NOT_APPLICABLE",
            "reason_code": "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE",
            "buckets": [],
        }
    bucket_count = 12
    width = (upper - lower) / bucket_count
    counts = [0] * bucket_count
    for value in finite:
        index = min(bucket_count - 1, max(0, int((value - lower) / width)))
        counts[index] += 1
    return {
        "state": "AVAILABLE",
        "reason_code": None,
        "buckets": [{
            "lower_inclusive": _decimal_text(lower + width * index, label="distribution lower"),
            "upper_exclusive": _decimal_text(lower + width * (index + 1), label="distribution upper"),
            "count": str(counts[index]),
        } for index in range(bucket_count)],
    }


def _p13_evidence_source(*, market, result, report: dict[str, Any], oos_start_utc_ms: int) -> dict[str, Any]:
    """Build the bounded evidence passport from the actual QuantBT result.

    It intentionally excludes OHLCV/source rows, fills, benchmark and funding
    because P04 does not publish those facts through this adapter.  Those
    absences are explicit typed states rather than a dashboard default.
    """

    import pandas as pd

    # Keep the engine adapter inside the isolated child entry point.  P13
    # evidence needs only its pinned version string; importing it here avoids
    # widening module import side effects for journal-only helpers while still
    # making the child receipt self-contained.
    from portal_api.adapters.quantbt import QuantBTGateway

    start = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    equity_series = result.equity.reindex(market.index).astype(float)
    mask = equity_series.index >= start
    oos = equity_series.loc[mask].dropna()
    if oos.empty:
        raise ValueError("P13 P04 result did not publish any OOS equity observations")
    if not oos.index.is_monotonic_increasing or oos.index.has_duplicates:
        raise ValueError("P13 P04 OOS equity index is not a strict chronological series")

    equity = [float(value) for value in oos.to_list()]
    if any(not math.isfinite(value) or value <= 0 for value in equity):
        raise ValueError("P13 P04 OOS equity contains a non-finite or non-positive value")
    peaks: list[float] = []
    maximum = -math.inf
    drawdowns: list[float] = []
    source_hash = hashlib.sha256()
    for timestamp, value in zip(oos.index, equity, strict=True):
        maximum = max(maximum, value)
        drawdown = value / maximum - 1.0
        peaks.append(maximum)
        drawdowns.append(drawdown)
        source_hash.update(f"{_utc_ms(timestamp, label='OOS')}|{_decimal_text(value, label='equity')}\n".encode("utf-8"))

    selected = _evidence_indices(equity)
    points = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="OOS"),
        "equity": _decimal_text(equity[index], label="equity"),
        "drawdown_fraction": _decimal_text(drawdowns[index], label="drawdown"),
    } for index in selected]

    months: list[dict[str, Any]] = []
    frame = pd.DataFrame({"equity": oos})
    for period, values in frame.groupby(frame.index.to_period("M"), sort=True):
        first = float(values["equity"].iloc[0])
        last = float(values["equity"].iloc[-1])
        if not math.isfinite(first) or first <= 0 or not math.isfinite(last):
            raise ValueError("P13 P04 monthly evidence is invalid")
        month_start = pd.Timestamp(period.start_time, tz="UTC")
        months.append({
            "month_start_utc_ms": _utc_ms(month_start, label="monthly"),
            "return_fraction": _decimal_text(last / first - 1.0, label="monthly return"),
        })
    if len(months) > 120:
        # A fixed P04 P10 run is bounded, but keep the source receipt bounded
        # if a future P08 snapshot uses a wider historical interval.
        months = months[-120:]

    rolling = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="rolling"),
        "return_fraction": _decimal_text(equity[index] / equity[index - 20] - 1.0, label="rolling return"),
    } for index in selected if index >= 20]
    returns_series = result.returns.reindex(market.index).loc[mask].dropna().astype(float)
    distribution = _return_distribution([float(value) for value in returns_series.to_list()])

    initial = equity[0]
    final = float(report["final_equity"])
    if not math.isfinite(final) or final <= 0:
        raise ValueError("P13 P04 engine final equity is invalid")
    if not math.isclose(final, equity[-1], rel_tol=1e-9, abs_tol=1e-7):
        raise ValueError("P13 P04 engine final equity does not reconcile to the OOS series")
    return {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {
            "execution_adapter_id": "p04.delta-rsi.v1",
            "engine_version": QuantBTGateway().version(),
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
            "oos_observation_count": len(equity),
            "emitted_equity_points": len(points),
            "chart_sampling": "FULL" if len(points) == len(equity) else "EXTREMA_BUCKET_V1",
            "source_transform_digest": source_hash.hexdigest(),
        },
        "direct": {
            "initial_equity": _decimal_text(initial, label="initial equity"),
            "final_equity": _decimal_text(final, label="final equity"),
            "num_trades": str(int(report["num_trades"])),
            "bars": str(int(len(market))),
        },
        "derived": {
            "net_return_fraction": _decimal_text(final / initial - 1.0, label="net return"),
            "max_drawdown_fraction": _decimal_text(min(drawdowns), label="max drawdown"),
            "monthly_returns": months,
            "rolling_returns_20_observations": rolling,
            "return_distribution": distribution,
        },
        "equity_points": points,
        "unavailable": {
            "benchmark": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"},
            "funding": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FUNDING"},
            "audited_fills": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"},
            "per_fold_metrics": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_METRICS"},
        },
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
    output = {
        "task": "P04_DELTA_SMOKE",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market)),
        "final_equity": float(report["final_equity"]),
        "num_trades": int(report["num_trades"]),
    }
    oos_start_utc_ms = receipt.get("oos_start_utc_ms")
    # Older P06 test receipts are intentionally still executable; P13 only
    # receives an evidence document when P10 supplied the immutable boundary.
    if isinstance(oos_start_utc_ms, int) and not isinstance(oos_start_utc_ms, bool) and oos_start_utc_ms >= 0:
        output["evidence_source"] = _p13_evidence_source(
            market=market,
            result=result,
            report=report,
            oos_start_utc_ms=oos_start_utc_ms,
        )
    return output


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
