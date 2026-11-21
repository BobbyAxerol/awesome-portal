"""Observed-date adapter safety; synthetic rows are not a product qualification."""
from __future__ import annotations

import copy
import hashlib
from dataclasses import replace
from pathlib import Path

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    HISTORICAL_LOADER_CONTRACT, HISTORICAL_READER_VERSION, REQUIRED_MARKET_COLUMNS,
    VN_SOURCE_TIMEZONE, VN_STOCK_DAILY_DATASET_ID, VN_STOCK_DAILY_RELEASE_DATASET_ID,
    HistoricalDataRuntime, HistoricalMarketDataProvider, MarketDataQuery,
    VnStockDailyObservedProvider, VnStockDailyQualificationProvider, market_content_hash,
)
from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError, DateRangeError
from portal_api.services.enrich_dataset_catalog import canonical, validate_document
from portal_api.services.research_observed_daily_index import (
    CLOCK_BASIS, observed_window_metadata, validate_observed_daily_index,
)
from portal_api.services.research_dataset_catalog import build_research_dataset_catalog

DAY = 86_400_000


def ms(date):
    timestamp = pd.Timestamp(date)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(VN_SOURCE_TIMEZONE)
    return int(timestamp.tz_convert("UTC").value // 1_000_000)


def source_frame(dates=None, symbol="FPT"):
    dates = pd.to_datetime(["2026-08-03", "2026-08-04", "2026-08-07", "2026-08-10"]) if dates is None else dates
    return pd.DataFrame({"time": dates, "symbol": [symbol] * len(dates),
        "open": [100.] * len(dates), "high": [102.] * len(dates), "low": [99.] * len(dates),
        "close": [101.] * len(dates), "volume": [1000.] * len(dates)})


def document(frame=None, *, start="2026-08-03", end="2026-08-11"):
    frame = source_frame() if frame is None else frame
    runs = []
    for date in frame["time"]:
        stamp = ms(date)
        if runs and runs[-1][1] + DAY == stamp:
            runs[-1][1] = stamp
        else:
            runs.append([stamp, stamp])
    index = validate_observed_daily_index({"timeframe": "1d", "resolution_ms": DAY,
        "start_utc_ms": ms(start), "end_exclusive_utc_ms": ms(end), "as_of_utc_ms": ms(end) + DAY,
        "duplicate_bar_count": 0, "runs": runs, "clock_basis": CLOCK_BASIS,
        "source_timezone": VN_SOURCE_TIMEZONE})
    return validate_document({"schema_version": "research.dataset-index.v2", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": ms(end) + DAY, "entries": [{"dataset_id": VN_STOCK_DAILY_DATASET_ID,
            "symbol": "FPT", "index": index}]})


class Loader:
    def __init__(self, frame=None):
        self.frame = source_frame() if frame is None else frame
        self.calls = []
        self.transform = lambda value: value
        self.after_read = lambda: None

    def load(self, symbol, **kwargs):
        self.calls.append((symbol, kwargs))
        start, end = pd.Timestamp(kwargs["start_date"]), pd.Timestamp(kwargs["end_date"])
        local = pd.DatetimeIndex(self.frame["time"])
        if local.tz is not None:
            local = local.tz_convert(VN_SOURCE_TIMEZONE).tz_localize(None)
        frame = self.frame.loc[(local >= start) & (local <= end)].copy()
        self.after_read()
        return self.transform(frame)


def runtime():
    return HistoricalDataRuntime(storage_root=Path("/isolated/read-only"), reader_version=HISTORICAL_READER_VERSION,
        loader_contract=HISTORICAL_LOADER_CONTRACT, manifest_digest="a" * 64, environment_id="test",
        release_commit="b" * 40, release_tag="test", dataset_release_id=VN_STOCK_DAILY_RELEASE_DATASET_ID,
        loader_class=Loader)


def provider(loader=None, doc=None, **kwargs):
    loader = Loader() if loader is None else loader
    doc = document(loader.frame) if doc is None else doc
    return VnStockDailyObservedProvider(index_document=doc, index_revision=hashlib.sha256(canonical(doc)).hexdigest(),
        runtime=runtime(), loader_factory=lambda: loader, **kwargs)


def query(**changes):
    return MarketDataQuery(**{"dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "timeframe": "1d",
        "start": "2026-08-03T00:00:00+07:00", "end_exclusive": "2026-08-11T00:00:00+07:00", **changes})


def test_available_source_descriptor_is_observed_only_not_default_activation_or_calendar():
    loader, doc = Loader(), document()
    before = copy.deepcopy(doc)
    bound = provider(loader, doc)
    assert loader.calls == []  # Construction/catalog do not inspect source or current-pointer files.
    catalog = build_research_dataset_catalog(bound)["datasets"][0]
    assert catalog["availability"] == "available"
    assert catalog["calendar_policy"] == "SOURCE_DECLARED"
    assert catalog["source_timezone"] == VN_SOURCE_TIMEZONE
    assert catalog["symbols"]["items"] == [{"symbol": "FPT", "contract_kind": None, "coverage": None}]
    assert loader.calls == []
    result = bound.load(query())
    assert result.frame.index.tolist() == [pd.Timestamp(date).tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")
                                         for date in loader.frame["time"]]
    assert result.missing_bar_count is None
    assert result.load_metadata["qualification_scope"] == "OBSERVED_DAILY_ADAPTER_ONLY_NOT_P10_ADMISSION"
    assert result.load_metadata["session_quality_state"] == "NOT_PUBLISHED"
    assert result.load_metadata["instrument_metadata_state"] == "NOT_PUBLISHED"
    assert result.load_metadata["warmup_start_utc_ms"] is None
    assert result.load_metadata["warmup_bars"] == 0 and result.load_metadata["analysis_bars"] == 4
    assert result.content_hash == market_content_hash(result.frame)
    assert doc == before
    assert VnStockDailyQualificationProvider(loader_factory=Loader).list_datasets()[0].availability == "unavailable"
    assert VN_STOCK_DAILY_DATASET_ID not in {row.dataset_id for row in
        HistoricalMarketDataProvider(loader_factory=Loader).list_datasets()}


def test_exact_300_observed_predecessors_not_300_calendar_dates_across_weekend_gaps():
    # A synthetic weekday sequence proves ordinal semantics; it is not a trading calendar.
    frame = source_frame(pd.bdate_range("2024-01-01", periods=330))
    end = frame["time"].iloc[-1] + pd.Timedelta(1, "D")
    loader, doc = Loader(frame), document(frame, start=frame["time"].iloc[0], end=end)
    bound = provider(loader, doc)
    start, stop = frame["time"].iloc[310], frame["time"].iloc[315] + pd.Timedelta(1, "D")
    result = bound.load_with_warmup(query(start=start.tz_localize(VN_SOURCE_TIMEZONE),
        end_exclusive=stop.tz_localize(VN_SOURCE_TIMEZONE)), warmup_bars=300)
    expected = pd.DatetimeIndex(frame["time"].iloc[10:316]).tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")
    assert result.frame.index.equals(expected)
    assert result.frame.index[:300].equals(expected[:300])
    assert (result.frame.index[:300] < start.tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")).all()
    assert result.frame.index[300:].equals(expected[300:])
    assert len(result.frame) == 306
    assert result.load_metadata["warmup_start_utc_ms"] == ms(frame["time"].iloc[10])
    assert ms(start) - result.load_metadata["warmup_start_utc_ms"] > 300 * DAY
    assert result.load_metadata["warmup_bars"] == 300 and result.load_metadata["analysis_bars"] == 6
    expected_metadata = observed_window_metadata(doc["entries"][0]["index"], start_ms=ms(start),
        end_ms=ms(stop), warmup_bars=300)
    assert result.load_metadata["warmup_start_utc_ms"] == expected_metadata["warmup_start_utc_ms"]
    assert result.load_metadata["analysis_bars"] == expected_metadata["bars"]
    assert 1 < len(loader.calls) <= 100
    for _symbol, call in loader.calls:
        assert call["check_val"] is True
        assert pd.Timestamp(call["end_date"]) - pd.Timestamp(call["start_date"]) < pd.Timedelta(31, "D")


def test_unobserved_start_and_long_holiday_chunk_use_exact_predecessors():
    dates = pd.to_datetime(["2026-01-01", "2026-01-02", "2026-04-10", "2026-04-13"])
    loader = Loader(source_frame(dates))
    doc = document(loader.frame, start="2026-01-01", end="2026-04-14")
    result = provider(loader, doc).load_with_warmup(query(start="2026-04-11T00:00:00+07:00",
        end_exclusive="2026-04-14T00:00:00+07:00"), warmup_bars=3)
    assert len(result.frame) == 4 and len(loader.calls) == 4
    assert result.load_metadata["warmup_start_utc_ms"] == ms("2026-01-01")
    assert result.load_metadata["analysis_bars"] == 1
    assert result.missing_bar_count is None


@pytest.mark.parametrize("changes,warmup", [
    ({"dataset_id": "crypto-binance-1m"}, 0), ({"symbol": "ABC"}, 0),
    ({"timeframe": "1h"}, 0), ({"columns": ("close",)}, 0),
    ({"start": "2026-08-03"}, 0), ({"start": "2026-08-03T00:00:00Z"}, 0),
    ({"start": "2026-08-02T00:00:00+07:00"}, 0),
    ({"end_exclusive": "2026-08-12T00:00:00+07:00"}, 0),
    ({}, 300), ({}, True), ({}, -1), ({}, 100_001),
])
def test_namespace_bounds_schema_and_insufficient_ordinal_prefix_refuse_before_source_io(changes, warmup):
    loader = Loader()
    with pytest.raises((DataSchemaError, DatasetNotFoundError, DateRangeError)):
        provider(loader).load_with_warmup(query(**changes), warmup_bars=warmup)
    assert loader.calls == []


def test_empty_indexed_analysis_window_does_not_turn_warmup_only_into_a_run():
    loader = Loader()
    with pytest.raises(DatasetNotFoundError, match="No observed VN daily bars"):
        provider(loader).load_with_warmup(query(start="2026-08-05T00:00:00+07:00",
            end_exclusive="2026-08-07T00:00:00+07:00"), warmup_bars=2)
    assert loader.calls == []


@pytest.mark.parametrize("fault", ["missing", "added", "unordered", "duplicate", "wrong-symbol", "bad-ohlc"])
def test_source_disagreement_is_not_repaired_or_forward_filled(fault):
    loader = Loader()
    if fault == "missing":
        loader.transform = lambda frame: frame.iloc[:-1]
    elif fault == "added":
        loader.transform = lambda frame: pd.concat([frame.iloc[:2], source_frame(pd.to_datetime(["2026-08-05"])), frame.iloc[2:]])
    elif fault == "unordered":
        loader.transform = lambda frame: frame.iloc[::-1]
    elif fault == "duplicate":
        loader.transform = lambda frame: frame.iloc[[0, 1, 1, 3]]
    elif fault == "wrong-symbol":
        loader.transform = lambda frame: frame.assign(symbol="ABC")
    else:
        loader.transform = lambda frame: frame.assign(high=50.)
    with pytest.raises(DataSchemaError):
        provider(loader).load(query())


def test_source_runtime_revision_is_checked_before_and_after_each_chunk():
    loader = Loader()
    bound = provider(loader)
    loader.after_read = lambda: setattr(bound, "_runtime", replace(runtime(), manifest_digest="b" * 64))
    with pytest.raises(DataSchemaError, match="SOURCE_REVISION_CHANGED"):
        bound.load(query())


def test_source_pin_is_checked_before_descriptor_or_symbol_catalog_publish():
    loader = Loader()
    bound = provider(loader)
    bound._runtime = replace(runtime(), manifest_digest="b" * 64)
    with pytest.raises(DataSchemaError, match="SOURCE_REVISION_CHANGED"):
        bound.list_datasets()
    with pytest.raises(DataSchemaError, match="SOURCE_REVISION_CHANGED"):
        bound.research_symbol_catalog(VN_STOCK_DAILY_DATASET_ID)
    assert loader.calls == []


@pytest.mark.parametrize("fault", ["version", "timezone", "clock", "runs", "duplicate", "resolution", "namespace", "symbol", "offset", "boolean", "source", "budget"])
def test_constructor_pins_revision_and_defensively_refuses_invalid_vn_branch(fault):
    doc = document()
    index = doc["entries"][0]["index"]
    if fault == "version":
        doc["schema_version"] = "research.dataset-index.v1"
    elif fault == "timezone":
        index["source_timezone"] = "UTC"
    elif fault == "clock":
        index["clock_basis"] = "INTERVAL_END_AT_OR_BEFORE_AS_OF_V1"
    elif fault == "runs":
        index["runs"] = list(reversed(index["runs"]))
    elif fault == "duplicate":
        doc["entries"].append(copy.deepcopy(doc["entries"][0]))
    elif fault == "resolution":
        index["resolution_ms"] = 3600_000
    elif fault == "namespace":
        doc["entries"][0]["dataset_id"] = "crypto-binance-1m"
    elif fault == "symbol":
        doc["entries"][0]["symbol"] = "../FPT"
    elif fault == "offset":
        index["start_utc_ms"] += 1
    elif fault == "boolean":
        index["duplicate_bar_count"] = False
    elif fault == "source":
        doc["source_manifest_digest"] = "b" * 64
    else:
        index["end_exclusive_utc_ms"] = index["start_utc_ms"] + 3101 * DAY
        doc["as_of_utc_ms"] = index["as_of_utc_ms"] = index["end_exclusive_utc_ms"] + DAY
    loader = Loader()
    with pytest.raises(DataSchemaError):
        provider(loader, doc)
    assert loader.calls == []


def test_document_and_revision_remain_immutable_even_if_callers_mutate_their_mapping():
    doc, loader = document(), Loader()
    bound = provider(loader, doc)
    original_revision = hashlib.sha256(canonical(doc)).hexdigest()
    doc["entries"][0]["index"]["runs"].clear()
    result = bound.load(query())
    assert len(result.frame) == 4
    assert result.load_metadata["metadata_index_revision"] == original_revision
    with pytest.raises(DataSchemaError, match="REVISION_REJECTED"):
        VnStockDailyObservedProvider(index_document=document(), index_revision="0" * 64,
            runtime=runtime(), loader_factory=Loader)


def test_no_implicit_runtime_or_constructor_storage_lookup():
    with pytest.raises(DataSchemaError, match="explicit installed runtime"):
        VnStockDailyObservedProvider(index_document=document(), index_revision=hashlib.sha256(canonical(document())).hexdigest())


def test_only_indexed_vn_symbols_are_listed_and_mixed_crypto_entries_do_not_grant_a_query():
    doc = document()
    doc["entries"].append({"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "index": {
        "timeframe": "1h", "resolution_ms": 3600_000, "start_utc_ms": ms("2026-08-03") + 3600_000,
        "end_exclusive_utc_ms": ms("2026-08-11") + 3600_000, "as_of_utc_ms": doc["as_of_utc_ms"],
        "duplicate_bar_count": 0, "runs": []}})
    validate_document(doc)
    bound = provider(doc=doc)
    assert bound.research_symbol_catalog(VN_STOCK_DAILY_DATASET_ID) == ({"symbol": "FPT", "contract_kind": None, "coverage": None},)
    with pytest.raises(DatasetNotFoundError):
        bound.research_symbol_catalog("crypto-binance-1m")


def test_empty_observed_index_is_unavailable_not_a_published_zero_row_source():
    doc = document()
    doc["entries"][0]["index"]["runs"] = []
    bound = provider(doc=doc)
    assert bound.list_datasets()[0].availability == "unavailable"
    assert bound.research_symbol_catalog(VN_STOCK_DAILY_DATASET_ID) == ()
    catalog = build_research_dataset_catalog(bound)["datasets"][0]
    assert catalog["symbols"]["state"] == "NOT_PUBLISHED" and catalog["symbols"]["items"] == []
    with pytest.raises(DatasetNotFoundError):
        bound.load(query())
