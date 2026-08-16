from __future__ import annotations

import json
import os

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    HISTORICAL_EXCLUDED_SCOPES,
    HISTORICAL_USAGE_SCOPES,
    load_historical_data_runtime,
)


def doctor_report() -> dict[str, object]:
    storage_root = os.getenv("HISTORICAL_MARKET_DATA_ROOT")
    if not storage_root:
        raise RuntimeError("HISTORICAL_MARKET_DATA_ROOT is not configured")
    runtime = load_historical_data_runtime(storage_root)
    return {
        "status": "pass",
        "capability": "historical_market_data",
        "dataset_id": CRYPTO_BINANCE_DATASET_ID,
        "usage_scopes": list(HISTORICAL_USAGE_SCOPES),
        "excluded_scopes": list(HISTORICAL_EXCLUDED_SCOPES),
        **runtime.provenance(),
    }


def main() -> None:
    print(json.dumps(doctor_report(), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
