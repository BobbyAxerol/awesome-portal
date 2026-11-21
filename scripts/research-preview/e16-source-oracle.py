#!/usr/bin/env python3
"""Independent HMD oracle for an E16 API receipt; never used by a BFF GET.

Run inside the owned portal-api (approved installed reader wheel,
read-only /data) with the sanitized named API receipt on stdin. No raw bars
are emitted or retained, and no QuantBT job is started by this oracle.
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal

from portal_api.adapters.market_data import HistoricalMarketDataProvider, MarketDataQuery


def main() -> None:
    receipt = json.load(sys.stdin)
    assert receipt["schema_version"] == "research.e16.real-api-receipt.v1"
    assert receipt["verdict"] == "PASS"
    replay = receipt["responses"]["replay"]["body"]
    assert replay["provenance"]["source_adapter_id"] == "p04.delta-rsi.v1"
    overview = replay["candle_overview"]
    query = MarketDataQuery(
        dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start="2026-06-08T00:00:00Z", end_exclusive="2026-06-15T00:00:00Z",
    )
    prepared = HistoricalMarketDataProvider(check_val=True).load(query)
    frame = prepared.frame
    assert len(frame) == overview["source_bar_count"] == 168
    assert Decimal(overview["envelope"]["max_high"]) == Decimal(str(float(frame["high"].max())))
    assert Decimal(overview["envelope"]["min_low"]) == Decimal(str(float(frame["low"].min())))
    assert overview["envelope"]["max_high_at_utc_ms"] == int(frame["high"].idxmax().value // 1_000_000)
    assert overview["envelope"]["min_low_at_utc_ms"] == int(frame["low"].idxmin().value // 1_000_000)
    covered = 0
    for bucket in overview["values"]:
        assert bucket["first_ordinal"] == covered
        bars = frame.iloc[bucket["first_ordinal"]:bucket["last_ordinal"] + 1]
        assert not bars.empty
        assert bucket["open_utc_ms"] == int(bars.index[0].value // 1_000_000)
        assert bucket["close_utc_ms"] == int(bars.index[-1].value // 1_000_000)
        for key, raw in {"open": bars["open"].iloc[0], "close": bars["close"].iloc[-1],
                         "high": bars["high"].max(), "low": bars["low"].min()}.items():
            assert Decimal(bucket[key]) == Decimal(str(float(raw))), (covered, key)
        assert bucket["transitions"] is None
        covered += len(bars)
    assert covered == len(frame)
    print(json.dumps({
        "schema_version": "research.e16.independent-hmd-oracle.v1", "verdict": "PASS",
        "run_id": receipt["run_id"], "dataset": query.dataset_id, "symbol": query.symbol,
        "timeframe": query.timeframe, "start": query.start, "end_exclusive": query.end_exclusive,
        "source_bar_count": len(frame), "emitted_bucket_count": len(overview["values"]),
        "assertions": "ALL_BUCKET_UTC_AND_EXACT_OHLC_AND_TRUE_SOURCE_EXTREMA_UTC_AND_COVERAGE",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
