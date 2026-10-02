"""Source-only VN qualification: synthetic safety plus explicit real-reader opt-in."""
from __future__ import annotations

import json
import os

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    HISTORICAL_READER_VERSION, VN_SOURCE_TIMEZONE, VN_STOCK_DAILY_DATASET_ID,
    VN_STOCK_DAILY_RELEASE_DATASET_ID, HistoricalMarketDataProvider, MarketDataQuery,
    VnStockDailyQualificationProvider, load_historical_data_runtime,
    load_vn_stock_daily_qualification_runtime, market_content_hash, normalize_market_frame,
)
from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError, DateRangeError


def query(**overrides):
    return MarketDataQuery(**{"dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "timeframe": "1d",
        "start": "2026-08-03T00:00:00+07:00", "end_exclusive": "2026-08-11T00:00:00+07:00", **overrides})


def source_frame():
    # Synthetic observed rows omit the weekend and do not claim a session calendar.
    dates = pd.to_datetime(["2026-08-03", "2026-08-04", "2026-08-07", "2026-08-10"])
    return pd.DataFrame({"time": dates, "symbol": ["FPT"] * 4,
        "open": [100.] * 4, "high": [102.] * 4, "low": [99.] * 4, "close": [101.] * 4, "volume": [1000] * 4})


class Loader:
    def __init__(self, frame=None):
        self.frame = source_frame() if frame is None else frame
        self.calls = []

    def load(self, symbol, **kwargs):
        self.calls.append((symbol, kwargs))
        return self.frame.copy(deep=True)


def test_local_date_labels_are_localized_before_utc_and_half_open_source_mapping():
    loader = Loader()
    result = VnStockDailyQualificationProvider(loader_factory=lambda: loader).load(query())
    assert loader.calls == [("FPT", {"start_date": "2026-08-03T00:00:00",
        "end_date": "2026-08-10T23:59:59.999999", "check_val": True})]
    assert result.frame.index[0] == pd.Timestamp("2026-08-02T17:00:00Z")
    assert result.frame.index[-1] == pd.Timestamp("2026-08-09T17:00:00Z")
    assert len(result.frame) == 4
    assert result.missing_bar_count is None
    assert result.quality["missing_bar_count"] is None
    assert result.descriptor.source_timezone == VN_SOURCE_TIMEZONE
    assert result.descriptor.availability == "unavailable"
    assert result.load_metadata["session_quality_state"] == "NOT_PUBLISHED"
    assert result.load_metadata["instrument_metadata_state"] == "NOT_PUBLISHED"
    assert result.load_metadata["daily_timestamp_basis"] == "SOURCE_LOCAL_DATE_LABEL_NOT_SESSION_CLOSE"
    assert result.load_metadata["qualification_scope"] == "SOURCE_READER_ONLY_NOT_P10_ADMISSION"
    pd.testing.assert_frame_equal(loader.frame, source_frame())


def test_aware_dates_and_next_boundary_are_preserved_without_synthesizing_sessions():
    frame = source_frame()
    frame["time"] = pd.DatetimeIndex(frame["time"]).tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")
    loader = Loader(frame)
    result = VnStockDailyQualificationProvider(loader_factory=lambda: loader).load(query(
        end_exclusive="2026-08-10T00:00:00+07:00"))
    assert len(result.frame) == 3
    assert result.frame.index[-1] == pd.Timestamp("2026-08-06T17:00:00Z")
    assert result.missing_bar_count is None


@pytest.mark.parametrize("overrides", [
    {"dataset_id": "vn-futures-1m"}, {"dataset_id": "crypto-binance-1m"}, {"symbol": None},
    {"symbol": "../FPT"}, {"timeframe": "1h"}, {"columns": ("close",)},
    {"start": "2026-08-03"}, {"start": "2026-08-03T00:00:00Z"},
    {"end_exclusive": "2026-09-04T00:00:00+07:00"},
])
def test_nonqualified_namespace_schema_or_bounds_refuse_before_any_source_read(overrides):
    loader = Loader()
    provider = VnStockDailyQualificationProvider(loader_factory=lambda: loader)
    with pytest.raises((DataSchemaError, DatasetNotFoundError, DateRangeError)):
        provider.load(query(**overrides))
    assert loader.calls == []


@pytest.mark.parametrize("fault", ["invalid-date", "intraday", "wrong-symbol", "duplicate", "bad-ohlc", "missing-column", "empty"])
def test_source_identity_and_ohlcv_are_strict_not_repaired_or_filled(fault):
    frame = source_frame()
    if fault == "invalid-date":
        frame["time"] = frame["time"].astype(object)
        frame.loc[0, "time"] = "invalid"
    if fault == "intraday":
        frame.loc[0, "time"] += pd.Timedelta(1, unit="h")
    if fault == "wrong-symbol":
        frame.loc[0, "symbol"] = "VN30F1M"
    if fault == "duplicate":
        frame.loc[1, "time"] = frame.loc[0, "time"]
    if fault == "bad-ohlc":
        frame.loc[0, "high"] = 50.
    if fault == "missing-column":
        frame = frame.drop(columns=["volume"])
    if fault == "empty":
        frame = frame.iloc[:0]
    provider = VnStockDailyQualificationProvider(loader_factory=lambda: Loader(frame))
    with pytest.raises((DataSchemaError, DatasetNotFoundError)):
        provider.load(query())


@pytest.mark.skipif(os.getenv("PORTAL_RUN_HMD_VN_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_VN_REAL_SMOKE=1")
def test_real_installed_vn_daily_reader_oracle_is_source_only_not_execution():
    root = os.environ["HISTORICAL_MARKET_DATA_ROOT"]
    runtime = load_vn_stock_daily_qualification_runtime(root)
    assert runtime.reader_version == HISTORICAL_READER_VERSION == "0.1.0rc3"
    assert runtime.manifest_digest == "f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47"
    assert runtime.dataset_release_id == VN_STOCK_DAILY_RELEASE_DATASET_ID
    provider = VnStockDailyQualificationProvider(runtime=runtime)
    assert provider.list_datasets()[0].availability == "unavailable"
    active = HistoricalMarketDataProvider(runtime=load_historical_data_runtime(root))
    assert VN_STOCK_DAILY_DATASET_ID not in {item.dataset_id for item in active.list_datasets()}
    observations = []
    for left, right, expected in (("2026-08-01", "2026-08-15", 10),
                                 ("2026-04-27", "2026-05-05", 3),
                                 ("2026-08-03", "2026-08-04", 1)):
        start = pd.Timestamp(left, tz=VN_SOURCE_TIMEZONE)
        end = pd.Timestamp(right, tz=VN_SOURCE_TIMEZONE)
        prepared = provider.load(query(start=start, end_exclusive=end))
        direct = runtime.loader_class().load("FPT", start_date=left,
            end_date=(pd.Timestamp(right) - pd.Timedelta(1, unit="us")).isoformat(), check_val=True)
        direct_frame = direct.set_index("time")
        direct_frame.index = pd.DatetimeIndex(direct_frame.index).tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")
        direct_frame = normalize_market_frame(direct_frame)
        pd.testing.assert_frame_equal(prepared.frame, direct_frame)
        assert market_content_hash(direct_frame) == prepared.content_hash
        assert len(prepared.frame) == expected
        assert (prepared.frame.index >= start.tz_convert("UTC")).all()
        assert (prepared.frame.index < end.tz_convert("UTC")).all()
        assert prepared.missing_bar_count is None
        observations.append({"symbol": "FPT", "start_utc": start.tz_convert("UTC").isoformat(),
            "end_exclusive_utc": end.tz_convert("UTC").isoformat(), "rows": expected,
            "first_utc": prepared.frame.index[0].isoformat(), "last_utc": prepared.frame.index[-1].isoformat(),
            "market_content_hash": prepared.content_hash, "direct_reader_match": True,
            "session_completeness": "NOT_PUBLISHED"})
    # No raw OHLCV/rows are exported. This sanitized source receipt is not a
    # P08/P10/engine execution receipt and does not activate a catalog entry.
    assert load_vn_stock_daily_qualification_runtime(root).manifest_digest == runtime.manifest_digest
    print(json.dumps({"scope": "VN_DAILY_SOURCE_READER_QUALIFICATION_ONLY", "reader_version": runtime.reader_version,
        "manifest_digest": runtime.manifest_digest, "observations": observations,
        "execution_admitted": False, "instrument_metadata": "NOT_PUBLISHED"}, sort_keys=True))
