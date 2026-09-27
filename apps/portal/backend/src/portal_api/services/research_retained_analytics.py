"""E11/E14: retain bounded facts from the actual QuantBT result, once.

No engine execution, storage or browser-time computation occurs here. OOS
scoping, net return and rolling Sharpe come from QuantBT 1.1.1's own public
reporting API. Bar exposure/turnover are explicitly labelled source-derived;
they never stand in for a trade ledger or selected-candidate IS equity.
"""

from __future__ import annotations

import hashlib
import json
from decimal import Decimal, localcontext
from typing import Any

from portal_api.services.research_evidence_metrics import (
    decimal_text,
    engine_rolling_sharpe,
    extrema_indices,
    oos_scoped_result,
)

SCHEMA_VERSION = "research.retained-analytics.v1"
MAX_CURVE_POINTS = 24
MAX_SOURCE_OBSERVATIONS = 2_000_000
MAX_BLOCK_BYTES = 16_384


def _fact(value: Any, *, locator: str, scope: str, origin: str,
          reason: str | None = None, state: str = "NOT_PUBLISHED") -> dict[str, Any]:
    if value is not None:
        try:
            value = decimal_text(value)
        except (ValueError, OverflowError):
            value = None
            reason = "SOURCE_ANALYTICS_VALUE_NOT_TRANSPORTABLE"
        else:
            state, reason = "AVAILABLE", None
    if value is None and reason is None:
        raise ValueError("an absent retained fact requires a typed source reason")
    return {"state": state, "reason_code": reason, "value": value,
            "source_locator": locator, "scope": scope, "origin": origin}


def _is_curve(result: Any, *, mode: str, is_start_utc_ms: int | None,
              oos_start_utc_ms: int | None) -> dict[str, Any]:
    import numpy as np
    import pandas as pd

    base = {"scope": "DECLARED_IS", "source_locator": "QuantBT.result.equity[P08.IS.start:P08.OOS.start)",
            "start_utc_ms": is_start_utc_ms, "end_exclusive_utc_ms": oos_start_utc_ms,
            "source_observation_count": 0, "emitted_point_count": 0, "sampling": None, "points": []}
    if mode == "WFO":
        return {**base, "scope": "SELECTED_CANDIDATE_IS", "state": "NOT_PUBLISHED", "reason_code": "QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT",
                "source_locator": "QuantBT.walk_forward.output.final_account_not_candidate_IS"}
    if is_start_utc_ms is None or oos_start_utc_ms is None:
        return {**base, "state": "NOT_PUBLISHED", "reason_code": "P08_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT"}
    if not 0 <= is_start_utc_ms < oos_start_utc_ms:
        raise ValueError("retained IS boundaries are invalid")
    start = pd.Timestamp(is_start_utc_ms, unit="ms", tz="UTC")
    end = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    curve = result.equity.loc[(result.equity.index >= start) & (result.equity.index < end)]
    if not len(curve):
        return {**base, "state": "NOT_APPLICABLE", "reason_code": "QUANTBT_RESULT_HAS_NO_DECLARED_IS_OBSERVATIONS"}
    if not np.isfinite(curve.to_numpy(dtype=float)).all():
        return {**base, "state": "NOT_PUBLISHED", "reason_code": "QUANTBT_IS_EQUITY_CONTAINS_NON_FINITE_VALUES"}
    selected = extrema_indices(curve.to_numpy(dtype=float).tolist(), maximum_points=MAX_CURVE_POINTS)
    points = [{"at_utc_ms": int(curve.index[index].value // 1_000_000),
               "equity": decimal_text(curve.iloc[index])} for index in selected]
    return {**base, "state": "AVAILABLE", "reason_code": None,
            "source_observation_count": len(curve), "emitted_point_count": len(points),
            "sampling": "FULL" if len(points) == len(curve) else "EXTREMA_BUCKET_V1", "points": points}


def retained_analytics(*, result: Any, mode: str, is_start_utc_ms: int | None = None,
                       oos_start_utc_ms: int | None = None) -> dict[str, Any]:
    """Build one bounded immutable block from a real, already-computed result.

    WFO uses the union of QuantBT's declared outer-test windows; gaps and
    leading IS are excluded by the engine. Fixed runs use the P08 boundary.
    No IS curve is substituted from the flat leading final-account path of
    WFO. A close-target trade-count metric is not an audited trade ledger.
    """
    import numpy as np
    import pandas as pd
    from quantbt.core.results import BacktestResultV2
    from quantbt.core.scopes import scoped_result
    from quantbt.core.types import BacktestResult
    from quantbt.metrics.performance import full_report

    if not isinstance(result, (BacktestResult, BacktestResultV2)) or mode not in {"FIXED", "WFO"}:
        raise ValueError("retained analytics require an actual admitted QuantBT result")
    index = result.equity.index
    if not 1 <= len(index) <= MAX_SOURCE_OBSERVATIONS or not index.is_monotonic_increasing or not index.is_unique:
        raise ValueError("retained analytics require bounded strictly chronological source observations")
    if index.tz is None:
        raise ValueError("retained analytics require timezone-aware source observations")
    if mode == "WFO":
        scoped = scoped_result(result, scope="oos")
        scope_locator = "quantbt==1.1.1:scoped_result(scope='oos',source_fold_table)"
    else:
        if oos_start_utc_ms is None:
            raise ValueError("fixed retained analytics require the immutable P08 OOS boundary")
        scoped = oos_scoped_result(result, oos_start_utc_ms=oos_start_utc_ms)
        scope_locator = "quantbt==1.1.1:scoped_result(scope='oos',P08.OOS.start:last_child_bar)"
    report = full_report(scoped, trading_days=365)
    full = full_report(result, trading_days=365)

    def metric(field: str, *, scope: str, percent: bool = False) -> dict[str, Any]:
        value = (full if scope == "CHILD_TAPE" else report).get(field)
        if value is not None and percent:
            with localcontext() as context:
                context.prec = 48
                value = Decimal(str(value)) / Decimal(100)
        return _fact(value, locator=f"quantbt.full_report.{field}" + ("/100" if percent else ""),
                     scope=scope, origin="ENGINE_DIRECT", reason="QUANTBT_REPORT_FIELD_NOT_PUBLISHED")

    trades = getattr(result, "trades", ()) or ()
    trade_reason = ("QUANTBT_ROUTE_PUBLISHES_NO_AUDITED_TRADE_LEDGER" if not trades
                    else "QUANTBT_TRADE_RECORDS_PRESENT_SCHEMA_NOT_MAPPED")
    behaviour = {key: _fact(None, locator="QuantBT.result.trades", scope="OOS", origin="SOURCE_DERIVED",
                            reason=trade_reason) for key in ("win_rate", "payoff_ratio", "average_hold_seconds", "max_consecutive_losses")}
    positions = scoped.positions.reindex(scoped.equity.index)
    values = positions.to_numpy(dtype=float)
    exposure = None
    if np.isfinite(values).all():
        exposed = np.any(values != 0, axis=1) if values.ndim > 1 else values != 0
        with localcontext() as context:
            context.prec = 48
            exposure = Decimal(int(exposed.sum())) / Decimal(len(exposed))
    behaviour["exposure_fraction"] = _fact(exposure, locator="QuantBT.result.positions:nonzero_OOS_bar_fraction",
        scope="OOS", origin="SOURCE_DERIVED", reason="QUANTBT_POSITIONS_NOT_FINITE")
    diagnostics = getattr(scoped, "diagnostics", None)
    turnover = None
    if isinstance(diagnostics, pd.DataFrame) and "turnover" in diagnostics:
        series = diagnostics["turnover"].reindex(scoped.equity.index)
        if np.isfinite(series.to_numpy(dtype=float)).all():
            with localcontext() as context:
                context.prec = 48
                turnover = sum((Decimal(str(value)) for value in series), Decimal(0))
    behaviour["turnover_notional"] = _fact(turnover, locator="QuantBT.result.diagnostics.turnover:OOS_sum",
        scope="OOS", origin="SOURCE_DERIVED", reason="QUANTBT_TURNOVER_NOT_PUBLISHED_FOR_EVERY_OOS_BAR")

    block = {
        "schema_version": SCHEMA_VERSION, "scope_locator": scope_locator,
        "oos_observation_count": len(scoped.equity), "trade_ledger_record_count": len(trades),
        "net_oos_return": metric("total_return_pct", scope="OOS", percent=True),
        "total_trade_count": metric("num_trades", scope="CHILD_TAPE"),
        "rolling_sharpe_63": engine_rolling_sharpe(scoped),
        "in_sample_equity": _is_curve(result, mode=mode, is_start_utc_ms=is_start_utc_ms, oos_start_utc_ms=oos_start_utc_ms),
        "behaviour": behaviour,
    }
    # Stream the full exact reporting input into a digest without serialising
    # millions of source rows into another in-memory/transport payload.
    digest = hashlib.sha256(json.dumps(block, sort_keys=True, separators=(",", ":"), allow_nan=False).encode())
    for stamp, equity, returns in zip(scoped.equity.index, scoped.equity, scoped.returns, strict=True):
        digest.update(json.dumps([int(stamp.value // 1_000_000), str(equity), str(returns)], separators=(",", ":")).encode())
    block["input_digest"] = digest.hexdigest()
    if len(json.dumps(block, separators=(",", ":"), allow_nan=False).encode()) > MAX_BLOCK_BYTES:
        raise ValueError("retained analytics exceed their immutable transport budget")
    return block
