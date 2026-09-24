"""P06 bounded QuantBT child entry point.

This module is intentionally *not* a generic plugin launcher.  P06 permits
only two server-installed operations: the pinned P04 Delta-RSI qualification
and (W1) the digest-pinned Delta signal-notional advanced WFO profile.  P07
owns imported/user strategy admission.  The parent supervisor starts this
module in a separate PID, mount, user and network namespace and hands it an
allowlisted receipt.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import resource
from decimal import Decimal, localcontext
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
# The progress ingress has a hard 28 KiB evidence-document limit.  Point count
# alone is not a byte bound (long decimal strings and four independent series
# used to overrun it), so the producer reserves headroom for the fixed receipt
# envelope and gives each visual series its own conservative budget.
# These caps are calculated against the Control API's 28 KiB ingress ceiling
# using the contract's *largest legal* decimal strings, not typical floats.
# They leave more than 3 KiB for the fixed source envelope/reason codes.
_MAX_EQUITY_EVIDENCE_POINTS = 32
_MAX_ROLLING_EVIDENCE_POINTS = 16
_MAX_MONTHLY_EVIDENCE_POINTS = 32
_MAX_DISTRIBUTION_BUCKETS = 12
_MAX_EVIDENCE_RECEIPT_BYTES = 24 * 1024
_ALLOWED_TASKS = frozenset({"P04_DELTA_SMOKE", "P10_DELTA_WFO"})


def _finite_decimal(value: object, *, label: str) -> Decimal:
    """Accept one finite engine scalar without losing decimal intent."""

    if isinstance(value, bool):
        raise ValueError(f"P13 {label} is not numeric")
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"P13 {label} is not numeric") from exc
    if not math.isfinite(numeric):
        raise ValueError(f"P13 {label} is not finite")
    decimal = value if isinstance(value, Decimal) else Decimal(str(numeric))
    if not decimal.is_finite():
        raise ValueError(f"P13 {label} is not finite")
    return decimal


def _decimal_text(value: object, *, label: str) -> str:
    """Render a finite source number as a non-exponent decimal string.

    The child is the last place QuantBT values exist as Python numerics.  Do
    not let a JSON float cross this boundary: it would give each later reader
    a chance to round differently or serialize an invalid NaN.
    """

    text = format(_finite_decimal(value, label=label), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    text = "0" if text in {"", "-0"} else text
    # The ingress schema's exact-decimal field is deliberately finite.  Fail
    # in the isolated child before journalling rather than produce a receipt
    # that can only fail late at the Portal callback.
    if len(text) > 96:
        raise ValueError(f"P13 {label} exceeds exact-decimal transport bound")
    return text


def _ratio_minus_one(numerator: object, denominator: object, *, label: str) -> Decimal:
    """Return an exact bounded decimal ratio from source scalar text."""

    top = _finite_decimal(numerator, label=label)
    bottom = _finite_decimal(denominator, label=label)
    if bottom <= 0:
        raise ValueError(f"P13 {label} denominator is non-positive")
    # A fixed precision makes non-terminating source ratios deterministic and
    # guarantees their serialized text stays below the exact-decimal bound.
    with localcontext() as context:
        context.prec = 48
        return top / bottom - Decimal(1)


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


def _evidence_indices(equity: list[float], *, maximum_points: int) -> list[int]:
    """Return bounded chronological points while preserving extrema.

    The full OOS vector remains in-memory only long enough for source metric
    calculations.  A chart sample is a rendering aid, never the metric input.
    Each interior bucket contributes its min and max point, preserving the
    visually material drawdown/extrema without LTTB's numeric ambiguity.
    """

    count = len(equity)
    if maximum_points < 2:
        raise ValueError("P13 evidence sampling requires room for both endpoints")
    if count <= maximum_points:
        return list(range(count))
    buckets = (maximum_points - 2) // 2
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
    bucket_count = _MAX_DISTRIBUTION_BUCKETS
    width = (upper - lower) / bucket_count
    counts = [0] * bucket_count
    for value in finite:
        index = min(bucket_count - 1, max(0, int((value - lower) / width)))
        counts[index] += 1
    buckets: list[dict[str, str]] = []
    for index in range(bucket_count):
        lower_bound = lower + width * index
        upper_bound = lower + width * (index + 1)
        # Every finite value must have exactly one home.  The final bucket is
        # upper-inclusive; labelling it upper-exclusive while placing `upper`
        # inside it made a mathematically false immutable receipt.
        buckets.append({
            "lower_inclusive": _decimal_text(lower_bound, label="distribution lower"),
            "upper": _decimal_text(upper_bound, label="distribution upper"),
            "upper_inclusive": "true" if index == bucket_count - 1 else "false",
            "count": str(counts[index]),
        })
    return {
        "state": "AVAILABLE",
        "reason_code": None,
        "buckets": buckets,
    }


def _monthly_returns(oos) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build calendar returns from the previous calendar close, not first tick.

    A partial first month has no preceding close and is deliberately omitted.
    If a future run spans more than the receipt budget, the retained tail is
    explicitly labelled rather than pretending the chart is complete.
    """

    import pandas as pd

    all_months: list[dict[str, Any]] = []
    prior_close: float | None = None
    omitted_leading = 0
    frame = pd.DataFrame({"equity": oos})
    # Calendar grouping is explicitly UTC.  Source snapshots historically use
    # both tz-aware and naive-as-UTC indices, so normalize the latter rather
    # than relying on pandas' host-local default or raising after compute.
    utc_index = pd.DatetimeIndex(frame.index)
    if utc_index.tz is None:
        utc_index = utc_index.tz_localize("UTC")
    else:
        utc_index = utc_index.tz_convert("UTC")
    utc_periods = utc_index.tz_localize(None).to_period("M")
    for period, values in frame.groupby(utc_periods, sort=True):
        close = float(values["equity"].iloc[-1])
        if not math.isfinite(close) or close <= 0:
            raise ValueError("P13 P04 monthly evidence is invalid")
        if prior_close is None:
            omitted_leading += 1
        else:
            month_start = pd.Timestamp(period.start_time, tz="UTC")
            all_months.append({
                "month_start_utc_ms": _utc_ms(month_start, label="monthly"),
                "return_fraction": _decimal_text(
                    _ratio_minus_one(close, prior_close, label="monthly return"), label="monthly return",
                ),
            })
        prior_close = close
    omitted_transport = max(0, len(all_months) - _MAX_MONTHLY_EVIDENCE_POINTS)
    emitted = all_months[-_MAX_MONTHLY_EVIDENCE_POINTS:]
    return emitted, {
        "source_observation_count": len(oos),
        "emitted_point_count": len(emitted),
        "total_period_count": len(all_months),
        "omitted_leading_period_count": omitted_leading,
        "omitted_transport_period_count": omitted_transport,
        "sampling": "FULL" if omitted_transport == 0 else "TAIL_WINDOW_V1",
    }


def _rolling_returns(oos, equity: list[float]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return a receipt-bounded sample of true 20-observation rolling facts."""

    full = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="rolling"),
        "return_fraction": _decimal_text(
            _ratio_minus_one(equity[index], equity[index - 20], label="rolling return"), label="rolling return",
        ),
    } for index in range(20, len(equity))]
    if not full:
        return [], {
            "source_observation_count": 0,
            "emitted_point_count": 0,
            "sampling": "NOT_APPLICABLE",
            "window_observations": 20,
        }
    selected = _evidence_indices(
        [float(item["return_fraction"]) for item in full],
        maximum_points=_MAX_ROLLING_EVIDENCE_POINTS,
    )
    emitted = [full[index] for index in selected]
    return emitted, {
        "source_observation_count": len(full),
        "emitted_point_count": len(emitted),
        "sampling": "FULL" if len(emitted) == len(full) else "EXTREMA_BUCKET_V1",
        "window_observations": 20,
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
    maximum = -math.inf
    drawdowns: list[Decimal] = []
    source_hash = hashlib.sha256()
    for timestamp, value in zip(oos.index, equity, strict=True):
        maximum = max(maximum, value)
        drawdown = _ratio_minus_one(value, maximum, label="drawdown")
        drawdowns.append(drawdown)
        source_hash.update(f"{_utc_ms(timestamp, label='OOS')}|{_decimal_text(value, label='equity')}\n".encode("utf-8"))

    selected = _evidence_indices(equity, maximum_points=_MAX_EQUITY_EVIDENCE_POINTS)
    points = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="OOS"),
        "equity": _decimal_text(equity[index], label="equity"),
        "drawdown_fraction": _decimal_text(drawdowns[index], label="drawdown"),
    } for index in selected]

    months, monthly_metadata = _monthly_returns(oos)
    rolling, rolling_metadata = _rolling_returns(oos, equity)
    returns_series = result.returns.reindex(market.index).loc[mask].dropna().astype(float)
    distribution = _return_distribution([float(value) for value in returns_series.to_list()])

    initial = equity[0]
    final = float(report["final_equity"])
    if not math.isfinite(final) or final <= 0:
        raise ValueError("P13 P04 engine final equity is invalid")
    if not math.isclose(final, equity[-1], rel_tol=1e-9, abs_tol=1e-7):
        raise ValueError("P13 P04 engine final equity does not reconcile to the OOS series")
    receipt = {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {
            "execution_adapter_id": "p04.delta-rsi.v1",
            "engine_version": QuantBTGateway().version(),
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
            "oos_observation_count": len(equity),
            "emitted_equity_points": len(points),
            "chart_sampling": "FULL" if len(points) == len(equity) else "EXTREMA_BUCKET_V1",
            "source_transform_digest": source_hash.hexdigest(),
            # V1 receipts remain readable.  This marker selects the corrected
            # P13R2 immutable projection and prevents corrected series from
            # being confused with a historical P13R1 receipt.
            "evidence_transform_revision": "P13_SOURCE_R2",
            # Endpoint values reconcile to the OOS equity series.  Engine
            # counters, by contrast, cover the full confined child input
            # (optional warmup + IS + OOS).  Do not collapse these distinct
            # populations into a misleading one-word scope.
            "direct_metric_scopes": {
                "initial_equity": "OOS_EQUITY_SERIES",
                "final_equity": "OOS_EQUITY_SERIES",
                "num_trades": "FULL_CHILD_TAPE",
                "bars": "FULL_CHILD_TAPE",
            },
            "series_metadata": {
                "equity_oos": {
                    "source_observation_count": len(equity),
                    "emitted_point_count": len(points),
                    "sampling": "FULL" if len(points) == len(equity) else "EXTREMA_BUCKET_V1",
                },
                "monthly_returns": monthly_metadata,
                "rolling_returns_20": rolling_metadata,
                "return_distribution": {
                    "source_observation_count": len(returns_series),
                    "emitted_point_count": len(distribution["buckets"]),
                    "sampling": "FULL_RETURN_HISTOGRAM_V2",
                },
            },
        },
        "direct": {
            "initial_equity": _decimal_text(initial, label="initial equity"),
            "final_equity": _decimal_text(final, label="final equity"),
            "num_trades": str(int(report["num_trades"])),
            "bars": str(int(len(market))),
        },
        "derived": {
        "net_return_fraction": _decimal_text(
            _ratio_minus_one(final, initial, label="net return"), label="net return",
        ),
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
    # RF-05 CG-P13-03/04/06: additive engine OOS analytics (services/research_evidence_metrics.py).
    # An analytics failure is a typed absence, never a failed child run.
    from portal_api.services import research_evidence_metrics as analytics
    from quantbt.errors import QuantBTEngineError
    try:
        receipt["oos_analytics"] = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=oos_start_utc_ms, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES, receipt_bytes=len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")))
    except (ValueError, QuantBTEngineError):
        receipt["oos_analytics"] = analytics.not_published_block()
    encoded = json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    if len(encoded) > _MAX_EVIDENCE_RECEIPT_BYTES:
        # This runs inside the bounded child before its terminal event is
        # journalled.  It is therefore a deterministic source error rather
        # than a late, unrecoverable sidecar-storage failure.
        raise ValueError("P13 evidence receipt exceeds the child byte budget")
    return receipt


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


def _wfo_output_root(receipt: dict[str, Any], receipt_dir: Path | None) -> Path:
    """Accept only the supervisor-created empty ``output`` sibling directory.

    It is on the real scratch filesystem (not this child's tmpfs) so the
    parent can read it after the mount namespace is gone.  Anything else --
    another path, a symlink, a pre-populated directory -- is refused.
    """

    if receipt_dir is None:
        raise ValueError("P10 WFO child requires its receipt directory")
    raw = receipt.get("output_root")
    if not isinstance(raw, str) or not raw:
        raise ValueError("P10 WFO child receipt has no output_root")
    expected = (receipt_dir / "output").resolve(strict=True)
    candidate = Path(raw)
    if candidate.is_symlink():
        raise ValueError("P10 WFO output_root must not be a symlink")
    resolved = candidate.resolve(strict=True)
    if resolved != expected or not resolved.is_dir():
        raise ValueError("P10 WFO output_root escapes the expected sibling output directory")
    tmpdir = os.environ.get("TMPDIR")
    if tmpdir and resolved.is_relative_to(Path(tmpdir).resolve()):
        raise ValueError("P10 WFO output_root must not be the child tmpfs")
    if any(resolved.iterdir()):
        raise ValueError("P10 WFO output_root must start empty")
    return resolved


def _utc_ms_field(receipt: dict[str, Any], name: str) -> int:
    value = receipt.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"P10 WFO child receipt {name} is invalid")
    return value


def _run_p10_delta_wfo(receipt: dict[str, Any], output_root: Path) -> dict[str, Any]:
    """Run the W1 §1.1 profile through the Portal advanced WFO runner.

    Every WFO knob comes from the digest-verified profile; the receipt only
    carries the admitted span, first OOS boundary and dataset labels.
    """

    import pandas as pd

    from portal_api.adapters.market_data import DatasetDescriptor, prepare_market_data
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
    from portal_api.domain.research_delta_wfo_profile import (
        DELTA_WFO_PROFILE,
        DELTA_WFO_PROFILE_DIGEST,
        DELTA_WFO_PROFILE_ID,
        delta_wfo_profile_digest,
    )
    from portal_api.repositories.artifacts import ArtifactRepository
    from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
    from strategy.specification import DELTA_RSI_SPECIFICATION

    if receipt.get("execution_profile_id") != DELTA_WFO_PROFILE_ID:
        raise ValueError("P10 WFO child receipt names an uninstalled execution profile")
    if (
        receipt.get("execution_profile_digest") != DELTA_WFO_PROFILE_DIGEST
        or delta_wfo_profile_digest(DELTA_WFO_PROFILE) != DELTA_WFO_PROFILE_DIGEST
    ):
        raise ValueError("P10 WFO child profile digest does not match the installed profile")
    profile = DELTA_WFO_PROFILE
    run_id = receipt.get("run_id")
    dataset_id = receipt.get("dataset_id")
    symbol = receipt.get("symbol")
    if not all(isinstance(value, str) and value for value in (run_id, dataset_id, symbol)):
        raise ValueError("P10 WFO child receipt identity is invalid")
    start_ms = _utc_ms_field(receipt, "data_start_utc_ms")
    end_ms = _utc_ms_field(receipt, "data_end_exclusive_utc_ms")
    split_ms = _utc_ms_field(receipt, "first_oos_utc_ms")
    if not start_ms < split_ms < end_ms:
        raise ValueError("P10 WFO child span is invalid")

    market_path = _safe_path(str(receipt["market_path"]), label="market_path")
    market = prepare_market_data(
        pd.read_parquet(market_path),
        DatasetDescriptor(dataset_id=dataset_id, symbol=symbol, venue="BINANCE", timeframe=profile["timeframe"]),
    )
    start = pd.Timestamp(start_ms, unit="ms", tz="UTC")
    end = pd.Timestamp(end_ms, unit="ms", tz="UTC")
    split = pd.Timestamp(split_ms, unit="ms", tz="UTC")
    request = PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id=dataset_id,
        symbol=symbol,
        timeframe=profile["timeframe"],
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
        # The same account as the installed P04 Delta qualification child.
        account=AccountConfig(
            initial_capital=20_000,
            leverage=3,
            alloc_per_trade=2_000,
            canonical_one_way_fee_rate=0.0005,
            funding_enabled=False,
        ),
        execution=ExecutionConfig(target_mode=profile["execution_route"]),
        calibration=AdvancedWalkForwardConfig(
            data_start=start.to_pydatetime(),
            data_end_exclusive=end.to_pydatetime(),
            split_mode=split.isoformat(),
            split_frequency=profile["frequency"],
            window_mode=profile["window_mode"],
            optimization_mode=OptimizationMode(profile["optimization_mode"]),
            optimization_schedule=OptimizationSchedule(profile["optimization_schedule"]),
            fold_boundary_position_policy="carry",
            optuna_trials=profile["optuna_trials"],
            optuna_early_stopping=None,
            random_seed=profile["random_seed"],
            optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        ),
    )
    summary = AdvancedWalkForwardRunner(
        gateway=QuantBTGateway(),
        artifacts=ArtifactRepository(output_root),
    ).run(request, market, run_id, target_mode=profile["execution_route"])
    n_folds = int(summary.get("n_folds") or 0)
    bounds = profile["fold_bounds"]
    if not bounds["min"] <= n_folds <= bounds["max"]:
        raise ValueError(f"P10 WFO produced {n_folds} folds outside the admitted {bounds['min']}..{bounds['max']}")
    trials_path = output_root / run_id / "wfo" / "trials.parquet"
    trial_rows = len(pd.read_parquet(trials_path)) if trials_path.is_file() else 0
    if trial_rows != profile["optuna_trials"]:
        raise ValueError("P10 WFO did not publish exactly the admitted trial count")
    return {
        "task": "P10_DELTA_WFO",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market.frame)),
        "n_folds": n_folds,
        "trial_rows": trial_rows,
        "execution_profile_digest": DELTA_WFO_PROFILE_DIGEST,
    }


def execute_receipt(receipt: dict[str, Any], *, receipt_dir: Path | None = None) -> dict[str, Any]:
    _assert_clean_environment()
    if receipt.get("schema_version") != "research.p06.child-receipt.v1":
        raise ValueError("unsupported child receipt schema")
    task = receipt.get("task")
    if task not in _ALLOWED_TASKS:
        raise ValueError("P06 child task is not allowlisted")
    if task == "P10_DELTA_WFO":
        result = _run_p10_delta_wfo(receipt, _wfo_output_root(receipt, receipt_dir))
    else:
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
    result = execute_receipt(receipt, receipt_dir=receipt_path.parent)
    temporary = result_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    os.replace(temporary, result_path)
    return 0


if __name__ == "__main__":  # pragma: no cover - spawned child entry point
    raise SystemExit(main())
