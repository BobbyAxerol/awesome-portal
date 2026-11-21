#!/usr/bin/env python3
"""Installed-reader source oracle only. No profile/run/API/session activation."""
from __future__ import annotations

from bisect import bisect_left
import hashlib
import importlib.metadata
import json
import os
from datetime import datetime, timezone

import pandas as pd

from portal_api.adapters.market_data import (
    REQUIRED_MARKET_COLUMNS, MarketDataQuery, VnStockDailyObservedProvider,
    VnStockDailyQualificationProvider, load_vn_stock_daily_qualification_runtime,
)
from portal_api.domain.errors import DateRangeError
from portal_api.services.enrich_dataset_catalog import (
    bar_summary, build_bar_index, canonical, validate_document, window_metadata,
)

DAY = 86_400_000
ZONE = "Asia/Ho_Chi_Minh"


def ms(date: str) -> int:
    return int(pd.Timestamp(date, tz=ZONE).value // 1_000_000)


def main() -> None:
    runtime = load_vn_stock_daily_qualification_runtime(os.environ["HISTORICAL_MARKET_DATA_ROOT"])
    assert runtime.reader_version == "0.1.0rc3"
    assert importlib.metadata.version("quantbt-engine") == "1.1.1"
    provider = VnStockDailyQualificationProvider(runtime=runtime)
    assert provider.list_datasets()[0].availability == "unavailable"
    start, end = ms("2024-01-01"), ms("2026-09-01")
    clock = int(datetime.now(timezone.utc).timestamp() * 1000)
    index = build_bar_index(provider, dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
        start_ms=start, end_ms=end, as_of_ms=clock)
    # Independent direct-loader pass; only <=31-date frames exist at a time.
    # The oracle does not call the Portal provider/index normalizer for expected.
    expected: list[int] = []
    oracle_frames: list[pd.DataFrame] = []
    queries = 0
    cursor = start
    while cursor < end:
        boundary = min(end, cursor + 31 * DAY)
        left = pd.Timestamp(cursor, unit="ms", tz="UTC").tz_convert(ZONE).tz_localize(None)
        right = pd.Timestamp(boundary, unit="ms", tz="UTC").tz_convert(ZONE).tz_localize(None)
        raw = runtime.loader_class().load("FPT", start_date=left.isoformat(),
            end_date=(right - pd.Timedelta(1, unit="us")).isoformat(), check_val=True)
        assert isinstance(raw, pd.DataFrame) and all(raw["symbol"] == "FPT")
        dates = pd.DatetimeIndex(pd.to_datetime(raw["time"], format="mixed", errors="raise"))
        dates = dates.tz_localize(ZONE) if dates.tz is None else dates.tz_convert(ZONE)
        assert (dates == dates.normalize()).all() and not dates.has_duplicates and dates.is_monotonic_increasing
        stamps = [int(x) for x in dates.tz_convert("UTC").as_unit("ms").asi8]
        assert len(stamps) <= 31 and all(cursor <= x < boundary for x in stamps)
        source_frame = raw.loc[:, REQUIRED_MARKET_COLUMNS].copy()
        source_frame.index = dates.tz_convert("UTC")
        oracle_frames.append(source_frame)
        expected.extend(stamps)
        assert len(expected) <= 10_000
        queries += 1
        assert queries <= 100
        cursor = boundary
    assert len(expected) > 300 and expected == sorted(set(expected))
    actual = [stamp for first, last in index["runs"] for stamp in range(first, last + 1, DAY)]
    assert actual == expected
    document = {"schema_version": "research.dataset-index.v2", "source_manifest_digest": runtime.manifest_digest,
        "as_of_utc_ms": clock, "entries": [{"dataset_id": "vn-stock-daily", "symbol": "FPT", "index": index}]}
    validate_document(document)
    summary = bar_summary(index)
    for field in ("expected_bar_count", "missing_ratio", "gap_count", "largest_gap_seconds", "last_closed_bar_end_utc_ms"):
        assert summary[field] is None
    cases = []
    for name, left, right, required in [
        ("exact-300-observed", expected[300], end, 300),
        ("prefix-299-refused", expected[299], end, 300),
        ("holiday-preserved", ms("2026-04-27"), ms("2026-05-05"), 300),
        ("left-outside", start - DAY, end, 0),
        ("right-outside", start, end + DAY, 0),
    ]:
        measured = window_metadata(document, dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
            start_ms=left, end_ms=right, warmup_bars=required)
        inside = start <= left and right <= end
        before = bisect_left(expected, left)
        if inside:
            rows = [x for x in expected if left <= x < right]
            assert measured["bars"] == len(rows)
            assert measured["warmup_bars_available_before_start"] == min(before, required)
            assert measured["first_bar_utc_ms"] == (rows[0] if rows else None)
            assert measured["last_bar_utc_ms"] == (rows[-1] if rows else None)
            assert measured["availability"] == ("AVAILABLE" if before >= required else "NOT_PUBLISHED")
            assert measured["warmup_start_utc_ms"] == (expected[before-required] if required and before >= required else None)
        else:
            assert measured["availability"] == "NOT_PUBLISHED" and measured["bars"] is None
            assert measured["warmup_bars_available_before_start"] is None
        assert measured["earliest_start_with_warmup_utc_ms"] == expected[required]
        cases.append({"name": name, "passed": True, "metadata": measured})
    # The explicitly constructed adapter is not the app's default provider.
    # Compare real hydrated OHLCV, including the exact observed warmup prefix,
    # with the separate direct-reader pass; output hashes/counts only.
    revision = hashlib.sha256(canonical(document)).hexdigest()
    bound = VnStockDailyObservedProvider(index_document=document, index_revision=revision, runtime=runtime)
    oracle_frame = pd.concat(oracle_frames)
    hydration = []
    for name, left, right in [("exact-300-observed", expected[300], end),
                              ("holiday-preserved", ms("2026-04-27"), ms("2026-05-05"))]:
        before = bisect_left(expected, left)
        loaded = bound.load_with_warmup(MarketDataQuery(dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
            start=pd.Timestamp(left, unit="ms", tz="UTC"), end_exclusive=pd.Timestamp(right, unit="ms", tz="UTC")),
            warmup_bars=300)
        warmup_start = expected[before - 300]
        separate = oracle_frame.loc[(oracle_frame.index >= pd.Timestamp(warmup_start, unit="ms", tz="UTC"))
            & (oracle_frame.index < pd.Timestamp(right, unit="ms", tz="UTC"))]
        pd.testing.assert_frame_equal(loaded.frame, separate, check_dtype=False, check_exact=True, check_freq=False)
        assert loaded.load_metadata["warmup_start_utc_ms"] == warmup_start
        assert loaded.missing_bar_count is None
        assert loaded.load_metadata["session_quality_state"] == "NOT_PUBLISHED"
        hydration.append({"name": name, "passed": True, "rows": len(loaded.frame),
            "analysis_bars": loaded.load_metadata["analysis_bars"], "warmup_bars": 300,
            "warmup_start_utc_ms": warmup_start, "source_queries": loaded.load_metadata["source_queries"],
            "content_hash": loaded.content_hash, "exact_direct_reader_ohlcv_match": True})
    try:
        bound.load_with_warmup(MarketDataQuery(dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
            start=pd.Timestamp(expected[299], unit="ms", tz="UTC"), end_exclusive=pd.Timestamp(end, unit="ms", tz="UTC")),
            warmup_bars=300)
    except DateRangeError:
        pass
    else:
        raise AssertionError("a 299-row prefix must not qualify for 300 observed warmup bars")
    print(json.dumps({"schema_version": "research.vn-observed-index-source-qualification.v1",
        "scope": "SOURCE_INDEX_ONLY_NOT_EXECUTION_OR_PRODUCT_ACCEPTANCE", "passed": True,
        "reader_version": runtime.reader_version, "quantbt_version": importlib.metadata.version("quantbt-engine"),
        "source_manifest_digest": runtime.manifest_digest, "symbol": "FPT", "timeframe": "1d",
        "source_timezone": ZONE, "start_utc_ms": start, "end_exclusive_utc_ms": end, "as_of_utc_ms": clock,
        "direct_queries": queries, "observed_rows": len(expected), "compressed_runs": len(index["runs"]),
        "timestamp_array_sha256": hashlib.sha256(canonical(expected)).hexdigest(),
        "index_sha256": hashlib.sha256(canonical(index)).hexdigest(),
        "document_sha256": revision, "summary": summary, "cases": cases,
        "hydration": hydration, "insufficient_prefix_hydration_refused": True,
        "execution_profile_activated": False}, sort_keys=True))


if __name__ == "__main__":
    main()
