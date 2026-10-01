"""Operator-only AN-29 derivation from immutable P05 rows, not an API read path.

Input is newline-delimited JSON emitted by the Control API backfill CLI after it
checks the source seal and row counts. No Trading System/HMD/QuantBT run is
started. Unsupported source facts remain typed absence.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

from portal_api.services.research_portal_analytics import portal_analytics_v2


def retained_result(observations: list[dict[str, Any]], folds: list[dict[str, Any]]):
    import pandas as pd
    from quantbt.core.results import BacktestResultV2

    if not 2 <= len(observations) <= 2_000_000 or not 1 <= len(folds) <= 32:
        raise ValueError("AN-29 retained row count is outside the admitted WFO bounds")
    stamps = [row.get("at_utc_ms") for row in observations]
    if any(not isinstance(stamp, int) or stamp < 0 for stamp in stamps):
        raise ValueError("AN-29 observation timestamp is invalid")
    index = pd.to_datetime(stamps, unit="ms", utc=True)
    if not index.is_monotonic_increasing or not index.is_unique:
        raise ValueError("AN-29 observations must be chronological and unique")

    def numbers(key: str) -> list[float]:
        values = [float(row[key]) for row in observations]
        if not all(math.isfinite(value) for value in values):
            raise ValueError(f"AN-29 observation {key} is non-finite")
        return values

    equity = numbers("equity")
    if min(equity) <= 0:
        raise ValueError("AN-29 equity must remain positive")
    returns = numbers("return_fraction")
    positions = numbers("accepted_position")
    closes: list[float] = []
    for row in observations:
        bar = row.get("bar")
        candle = bar.get("candle") if isinstance(bar, dict) else None
        close = candle.get("close") if isinstance(candle, dict) else None
        value = float(close) if close is not None else math.nan
        closes.append(value if math.isfinite(value) and value > 0 else math.nan)

    windows = []
    for row in folds:
        start, end = row.get("test_start_utc_ms"), row.get("test_end_utc_ms")
        if not isinstance(start, int) or not isinstance(end, int) or start > end:
            raise ValueError("AN-29 requires sealed outer-OOS fold boundaries")
        windows.append({
            "test_start": pd.Timestamp(start, unit="ms", tz="UTC"),
            "test_end": pd.Timestamp(end, unit="ms", tz="UTC"),
        })
    windows.sort(key=lambda row: row["test_start"])
    if any(windows[i]["test_start"] <= windows[i - 1]["test_end"] for i in range(1, len(windows))):
        raise ValueError("AN-29 fold OOS windows overlap")

    result = BacktestResultV2(
        equity=pd.Series(equity, index=index),
        returns=pd.Series(returns, index=index),
        positions=pd.DataFrame({"Position_retained_symbol": positions}, index=index),
        closes=pd.DataFrame({"retained_symbol": closes}, index=index),
        symbols=["retained_symbol"],
        initial_capital=equity[0],
        metadata={"walk_forward": {"fold_table": pd.DataFrame(windows)}},
        diagnostics=pd.DataFrame({"turnover": [
            (row.get("bar") or {}).get("turnover") for row in observations
        ]}, index=index).astype(float),
    )
    return result, pd.Series(closes, index=index)


def derive_sidecar(observations: list[dict[str, Any]], folds: list[dict[str, Any]]) -> dict[str, Any]:
    result, close = retained_result(observations, folds)
    block = portal_analytics_v2(
        result=result,
        mode="WFO",
        market_close=close,
        benchmark_locator="P05.retained_OBSERVATION.bar.candle.close_or_NOT_PUBLISHED",
    )
    # These are descriptive bar/position metrics from retained arrays. Their
    # scope never becomes an audited trade ledger; label all as Portal derived.
    for fact in (*block["metrics"].values(), *block["behaviour"].values(),
                 block["last_30d"]["return_fraction"], block["last_30d"]["sharpe"]):
        fact["origin"] = "PORTAL_DERIVED"
    # The engine hit-rate formula needs source close returns, whereas profit
    # factor needs only the retained return sample. Missing candles cannot be
    # replaced by account returns to infer directional hit rates.
    if not all(math.isfinite(value) for value in close):
        for key in ("long_hit_rate_fraction", "short_hit_rate_fraction"):
            fact = block["metrics"][key]
            fact.update(state="NOT_PUBLISHED", reason_code="AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED", value=None)
    return block


def main() -> None:
    observations: list[dict[str, Any]] = []
    folds: list[dict[str, Any]] = []
    expected: dict[str, int] | None = None
    enrichment = None
    passport = None
    for raw in sys.stdin:
        item = json.loads(raw)
        kind, ordinal, payload = item.get("kind"), item.get("ordinal"), item.get("payload")
        if kind == "META":
            if expected is not None or observations or folds:
                raise ValueError("AN-29 metadata must be first")
            expected = item["expected"]
            enrichment = item.get("enrichment")
            continue
        if kind == "P04_SOURCE" and enrichment and passport is None:
            passport = payload
            continue
        if expected is None or not isinstance(payload, dict):
            raise ValueError("AN-29 row protocol is invalid")
        target = observations if kind == "OBSERVATION" else folds if kind == "FOLD" else None
        if target is None or ordinal != len(target) or len(target) >= expected[kind]:
            raise ValueError("AN-29 source ordinals are incomplete or unbounded")
        target.append(payload)
    if expected is None or len(observations) != expected["OBSERVATION"] or len(folds) != expected["FOLD"]:
        raise ValueError("AN-29 retained rows differ from the immutable seal")
    if enrichment:
        from portal_api.services.research_enrich_analysis import enrich_retained, enrich_fixed_passport
        block = enrich_fixed_passport(run_id=enrichment["run_id"], passport=passport,
            nominal_bar_ms=enrichment.get("nominal_bar_ms")) if passport else enrich_retained(
            run_id=enrichment["run_id"], observations=observations, folds=folds,
            nominal_bar_ms=enrichment.get("nominal_bar_ms"))
    else:
        block = derive_sidecar(observations, folds)
    print(json.dumps(block, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
