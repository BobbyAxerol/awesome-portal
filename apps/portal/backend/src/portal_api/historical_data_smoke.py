from __future__ import annotations

import argparse
import json
import os
import resource

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    HistoricalMarketDataProvider,
    MarketDataQuery,
)


def smoke_report(
    *,
    symbol: str,
    timeframe: str,
    start: str,
    end_exclusive: str,
    engine: str,
) -> dict[str, object]:
    provider = HistoricalMarketDataProvider(engine=engine)
    prepared = provider.load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol=symbol,
            timeframe=timeframe,
            start=start,
            end_exclusive=end_exclusive,
        )
    )
    return {
        "dataset_id": prepared.descriptor.dataset_id,
        "symbol": prepared.descriptor.symbol,
        "timeframe": prepared.descriptor.timeframe,
        "process_max_rss_bytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        * 1024,
        **prepared.quality,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Smoke-test the bounded Portal historical Binance hot path."
    )
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--start", default="2026-08-01T00:00:00+00:00")
    parser.add_argument("--end-exclusive", default="2026-08-02T00:00:00+00:00")
    parser.add_argument(
        "--engine",
        default=os.getenv("PORTAL_CRYPTO_RESAMPLE_ENGINE", "duckdb"),
    )
    args = parser.parse_args()
    print(
        json.dumps(
            smoke_report(
                symbol=args.symbol,
                timeframe=args.timeframe,
                start=args.start,
                end_exclusive=args.end_exclusive,
                engine=args.engine,
            ),
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
