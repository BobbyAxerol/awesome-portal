"""Private P08 research dataset catalog (CG-P08-04).

Read-only and bounded. It projects what the approved historical source can
serve a Research preflight: datasets, their timeframes and availability and,
when the approved reader's storage layout is mounted, the symbols present
with their month-partition coverage. It never opens a data file, never reads
a price and never returns a filesystem path; exact first/last bars stay the
preflight's job (it queries the bounded range and refuses what is absent).
"""

from __future__ import annotations

import re
from typing import Mapping

from portal_api.adapters.market_data import MarketDataProvider
from portal_api.domain.errors import PortalDomainError

DATASET_CATALOG_SCHEMA_VERSION = "research.dataset-catalog.v1"
MAXIMUM_CATALOG_DATASETS = 16
MAXIMUM_CATALOG_SYMBOLS = 256
_SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
_TIMEFRAME = re.compile(r"^[1-9][0-9]*(?:min|m|h|D|d)$")


class ResearchDatasetCatalogError(RuntimeError):
    """The historical source cannot publish its descriptor at all."""


def _calendar_policy(venue: str) -> str:
    # Same rule P08 applies when it seals a snapshot.
    return "CRYPTO_24_7" if venue == "BINANCE" else "SOURCE_DECLARED"


def build_research_dataset_catalog(provider: MarketDataProvider) -> dict[str, object]:
    try:
        descriptors = tuple(provider.list_datasets())
    except (PortalDomainError, OSError, ValueError) as exc:
        raise ResearchDatasetCatalogError("historical dataset descriptors are unavailable") from exc
    symbol_catalog = getattr(provider, "research_symbol_catalog", None)
    datasets: list[dict[str, object]] = []
    for descriptor in descriptors[:MAXIMUM_CATALOG_DATASETS]:
        if "research" not in descriptor.usage_scopes and descriptor.source_class == "historical_market_data":
            continue
        timeframes = [item for item in descriptor.supported_timeframes if _TIMEFRAME.fullmatch(item)]
        if not timeframes and descriptor.timeframe and _TIMEFRAME.fullmatch(descriptor.timeframe):
            timeframes = [descriptor.timeframe]
        symbols: dict[str, object]
        if descriptor.availability != "available":
            symbols = {
                "state": "NOT_PUBLISHED",
                "reason": "The dataset is unavailable, so no symbol can be listed.",
                "items": [],
                "total": None,
                "truncated": False,
            }
        elif descriptor.symbol is not None:
            symbols = {
                "state": "PUBLISHED",
                "reason": None,
                "items": [{"symbol": descriptor.symbol, "contract_kind": None, "coverage": None}],
                "total": 1,
                "truncated": False,
            }
        elif callable(symbol_catalog):
            try:
                listed: tuple[Mapping[str, object], ...] = tuple(symbol_catalog(descriptor.dataset_id))
            except (PortalDomainError, OSError, ValueError):
                listed = ()
                symbols = {
                    "state": "NOT_PUBLISHED",
                    "reason": "The approved reader's storage layout could not be listed.",
                    "items": [],
                    "total": None,
                    "truncated": False,
                }
            else:
                valid = [item for item in listed if isinstance(item.get("symbol"), str) and _SYMBOL.fullmatch(str(item["symbol"]))]
                symbols = {
                    "state": "PUBLISHED",
                    "reason": None,
                    "items": [dict(item) for item in valid[:MAXIMUM_CATALOG_SYMBOLS]],
                    "total": len(valid),
                    "truncated": len(valid) > MAXIMUM_CATALOG_SYMBOLS,
                }
        else:
            symbols = {
                "state": "NOT_PUBLISHED",
                "reason": "This source answers any symbol by query and publishes no symbol list.",
                "items": [],
                "total": None,
                "truncated": False,
            }
        datasets.append(
            {
                "dataset_id": descriptor.dataset_id,
                "venue": descriptor.venue,
                "availability": descriptor.availability,
                "unavailable_reason": descriptor.unavailable_reason,
                "source_class": descriptor.source_class,
                "usage_scopes": list(descriptor.usage_scopes),
                "excluded_scopes": list(descriptor.excluded_scopes),
                "source_timezone": descriptor.source_timezone,
                "calendar_policy": _calendar_policy(descriptor.venue),
                "timeframes": timeframes,
                "symbols": symbols,
            }
        )
    return {
        "schema_version": DATASET_CATALOG_SCHEMA_VERSION,
        "datasets": datasets,
        "coverage_rule": "Coverage is the month partitions present in the approved reader's storage layout (hive-symbol-year-month-v1). It is not the exact first or last bar; preflight queries the bounded range and refuses what is absent.",
    }


__all__ = [
    "DATASET_CATALOG_SCHEMA_VERSION",
    "ResearchDatasetCatalogError",
    "build_research_dataset_catalog",
]
