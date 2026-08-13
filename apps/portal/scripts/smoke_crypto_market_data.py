from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    CryptoBinanceMarketDataProvider,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-test the portal Binance market-data hot path.")
    parser.add_argument("--symbol", default="ETHUSDT")
    parser.add_argument("--timeframe", default="1h")
    parser.add_argument("--engine", default=os.getenv("PORTAL_CRYPTO_RESAMPLE_ENGINE", "duckdb"))
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    loader_root = Path(
        os.getenv(
            "PORTAL_CRYPTO_DATA_ROOT",
            str(project_root.parent / "alphas_storage" / "_get_data"),
        )
    )
    provider = CryptoBinanceMarketDataProvider(loader_root, engine=args.engine)
    prepared = provider.load(
        CRYPTO_BINANCE_DATASET_ID,
        symbol=args.symbol,
        timeframe=args.timeframe,
    )
    summary = {
        "dataset_id": prepared.descriptor.dataset_id,
        "symbol": prepared.descriptor.symbol,
        "timeframe": prepared.descriptor.timeframe,
        **prepared.quality,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
