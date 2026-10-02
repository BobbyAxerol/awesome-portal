"""Synthetic source-date index safety, not real reader or product qualification."""
from __future__ import annotations

import copy
import json
from dataclasses import replace
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.adapters.market_data import DatasetDescriptor, VN_SOURCE_TIMEZONE, VN_STOCK_DAILY_DATASET_ID
from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError
from portal_api.services import research_observed_daily_index as observed
from portal_api.services.enrich_dataset_catalog import (
    DatasetIndexError, DatasetIndexStore, build_bar_index, canonical, validate_document,
)

DAY = 86_400_000


def ms(date: str) -> int:
    return int(pd.Timestamp(date, tz=VN_SOURCE_TIMEZONE).value // 1_000_000)


def source_dates(values: list[str]) -> pd.DatetimeIndex:
    return pd.DatetimeIndex(pd.to_datetime(values)).tz_localize(VN_SOURCE_TIMEZONE).tz_convert("UTC")


class TimestampOnlyFrame(pd.DataFrame):
    def __getitem__(self, _key):
        raise AssertionError("index infrastructure must never inspect a market column")


class Source:
    """Explicit synthetic timestamps; no trading-calendar authority implied."""
    def __init__(self, dates=None):
        self.dates = source_dates(["2026-08-03", "2026-08-04", "2026-08-07", "2026-08-10"]) if dates is None else dates
        self.calls = []
        self.failure = None
        self.transform = lambda value: value
        self._runtime = SimpleNamespace(manifest_digest="a" * 64)

    def load(self, query):
        self.calls.append(query)
        if self.failure is not None:
            raise self.failure
        dates = self.dates[(self.dates >= query.start) & (self.dates < query.end_exclusive)]
        result = SimpleNamespace(frame=TimestampOnlyFrame(index=dates),
            descriptor=DatasetDescriptor(dataset_id=VN_STOCK_DAILY_DATASET_ID, symbol="FPT", venue="VN",
                timeframe="1d", source_timezone=VN_SOURCE_TIMEZONE),
            load_metadata={"daily_timestamp_basis": observed.TIMESTAMP_BASIS, "manifest_digest": "a" * 64})
        return self.transform(result)


def build(source=None, **changes):
    arguments = {"dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "timeframe": "1d",
        "start_ms": ms("2026-08-03"), "end_ms": ms("2026-08-11"), "as_of_ms": ms("2026-08-12")}
    return observed.build_observed_daily_index(source or Source(), **{**arguments, **changes})


def test_preserves_source_local_midnight_gaps_and_honest_summary():
    source = Source()
    index = build(source)
    assert index["runs"] == [[ms("2026-08-03"), ms("2026-08-04")],
        [ms("2026-08-07"), ms("2026-08-07")], [ms("2026-08-10"), ms("2026-08-10")]]
    assert index["runs"][0][0] == int(pd.Timestamp("2026-08-02T17:00:00Z").value // 1_000_000)
    assert observed.validate_observed_daily_index(index) is index
    summary = observed.observed_bar_summary(index)
    assert summary["bar_count"] == 4
    for name in ("expected_bar_count", "missing_ratio", "gap_count", "largest_gap_seconds", "last_closed_bar_end_utc_ms"):
        assert summary[name] is None
    assert summary["availability"] == "AVAILABLE"  # Observed metadata only, not execution admission.
    assert summary["calendar_availability"] == {"state": "NOT_PUBLISHED", "reason_code": "VN_SESSION_CALENDAR_NOT_PUBLISHED"}
    assert summary["closed_bar_policy"] == observed.CLOSED_BAR_POLICY
    assert summary["clock_basis"] == index["clock_basis"] == observed.CLOCK_BASIS
    assert summary["source_timezone"] == VN_SOURCE_TIMEZONE
    assert set(index) == {"timeframe", "resolution_ms", "start_utc_ms", "end_exclusive_utc_ms",
        "as_of_utc_ms", "duplicate_bar_count", "runs", "clock_basis", "source_timezone"}
    assert not any(word in canonical(index).decode() for word in ("close", "volume", "source_path", "credential"))
    assert source.calls[0].columns == ("open", "high", "low", "close", "volume")


def test_sequential_31_local_date_chunks_merge_only_actual_adjacent_labels():
    first, end = ms("2026-04-01"), ms("2026-06-04")
    dates = pd.date_range(pd.Timestamp(first, unit="ms", tz="UTC"), periods=64, freq="1D").as_unit("us")
    source = Source(dates)
    index = build(source, start_ms=first, end_ms=end, as_of_ms=end)
    assert len(source.calls) == 3
    assert [(int(q.start.value // 1_000_000), int(q.end_exclusive.value // 1_000_000)) for q in source.calls] == [
        (first, first + 31 * DAY), (first + 31 * DAY, first + 62 * DAY), (first + 62 * DAY, end)]
    assert all(q.start.tz is not None and q.end_exclusive - q.start <= pd.Timedelta(31, "days") for q in source.calls)
    assert index["runs"] == [[first, end - DAY]]
    assert observed.observed_bar_summary(index)["bar_count"] == 64


def test_observation_clock_uses_local_date_cutoff_not_a_session_close_claim():
    source = Source(source_dates(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]))
    index = build(source, as_of_ms=ms("2026-08-06") + 12 * 3_600_000)
    assert index["end_exclusive_utc_ms"] == ms("2026-08-06")
    assert index["runs"] == [[ms("2026-08-03"), ms("2026-08-05")]]
    assert observed.observed_bar_summary(index)["last_closed_bar_end_utc_ms"] is None


def test_observed_300_warmup_crosses_gaps_and_returns_exact_last_n_predecessors():
    # Synthetic weekday subset is a test input, never a production calendar rule.
    dates = pd.bdate_range("2024-01-01", periods=330, tz=VN_SOURCE_TIMEZONE).tz_convert("UTC")
    source = Source(dates)
    stamps = [int(value) for value in dates.as_unit("ms").asi8]
    index = build(source, start_ms=stamps[0], end_ms=stamps[-1] + DAY, as_of_ms=stamps[-1] + DAY)
    before = copy.deepcopy(index)
    assert observed.observed_earliest_start_with_warmup(index, 300) == stamps[300]
    assert observed.observed_earliest_start_with_warmup(index, 0) == stamps[0]
    assert observed.observed_earliest_start_with_warmup(index, 330) is None
    result = observed.observed_window_metadata(index, start_ms=stamps[310], end_ms=stamps[315] + DAY, warmup_bars=300)
    assert result["availability"] == "AVAILABLE"
    assert result["bars"] == 6
    assert result["warmup_bars_available_before_start"] == 300
    assert result["warmup_start_utc_ms"] == stamps[10]
    assert stamps[310] - result["warmup_start_utc_ms"] > 300 * DAY
    assert result["verified_range"]["basis"] == observed.RANGE_BASIS
    assert result["first_bar_utc_ms"] == stamps[310] and result["last_bar_utc_ms"] == stamps[315]
    assert index == before


def test_warmup_on_an_unobserved_date_and_zero_warmup_use_actual_ordinals():
    index = build()
    result = observed.observed_window_metadata(index, start_ms=ms("2026-08-08"), end_ms=ms("2026-08-11"), warmup_bars=2)
    assert result["availability"] == "AVAILABLE"
    assert result["bars"] == 1 and result["warmup_start_utc_ms"] == ms("2026-08-04")
    assert result["first_bar_utc_ms"] == ms("2026-08-10")
    zero = observed.observed_window_metadata(index, start_ms=ms("2026-08-05"), end_ms=ms("2026-08-07"), warmup_bars=0)
    assert zero["availability"] == "AVAILABLE" and zero["bars"] == 0
    assert zero["first_bar_utc_ms"] is None and zero["last_bar_utc_ms"] is None
    assert zero["warmup_start_utc_ms"] is None and zero["warmup_bars_available_before_start"] == 0


def test_insufficient_observed_prefix_is_measured_refusal_not_24_7_estimate():
    result = observed.observed_window_metadata(build(), start_ms=ms("2026-08-10"), end_ms=ms("2026-08-11"), warmup_bars=300)
    assert result["availability"] == "NOT_PUBLISHED"
    assert result["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    assert result["bars"] == 1 and result["warmup_bars_available_before_start"] == 3
    assert result["verified_range"]["basis"] == observed.RANGE_BASIS
    assert result["earliest_start_with_warmup_utc_ms"] is None and result["warmup_start_utc_ms"] is None


@pytest.mark.parametrize("left,right", [("2026-08-02", "2026-08-11"), ("2026-08-03", "2026-08-12")])
def test_outside_verified_range_never_returns_partial_count_as_full_coverage(left, right):
    result = observed.observed_window_metadata(build(), start_ms=ms(left), end_ms=ms(right), warmup_bars=2)
    assert result["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    for field in ("bars", "first_bar_utc_ms", "last_bar_utc_ms", "warmup_bars_available_before_start", "warmup_start_utc_ms"):
        assert result[field] is None
    assert result["verified_range"]["start_utc_ms"] == ms("2026-08-03")
    assert result["earliest_start_with_warmup_utc_ms"] == ms("2026-08-07")


def test_metadata_reads_never_load_source_and_stale_envelope_gives_no_index(tmp_path):
    source = Source()
    index = build(source)
    doc = {"schema_version": "research.dataset-index.v2", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": index["as_of_utc_ms"], "entries": [{"dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "index": index}]}
    store = DatasetIndexStore(tmp_path)
    store.publish(doc)
    count = len(source.calls)
    revision, found, reason = store.read("b" * 64)
    assert revision is not None and found is None and reason == "HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED"
    result = observed.observed_window_metadata(None, start_ms=ms("2026-08-03"), end_ms=ms("2026-08-11"), warmup_bars=300)
    assert result["availability"] == "NOT_PUBLISHED" and result["verified_range"] is None
    assert result["bars"] is None and result["warmup_start_utc_ms"] is None
    observed.observed_bar_summary(index)
    observed.observed_earliest_start_with_warmup(index, 300)
    assert len(source.calls) == count


@pytest.mark.parametrize("changes,code", [
    ({"dataset_id": "crypto-binance-1m"}, "EXACT_SOURCE_NAMESPACE"),
    ({"timeframe": "1h"}, "INTERVAL_INVALID"), ({"symbol": "../FPT"}, "BOUNDS_INVALID"),
    ({"symbol": "fpt"}, "BOUNDS_INVALID"), ({"start_ms": True}, "BOUNDS_INVALID"),
    ({"end_ms": 1.0}, "BOUNDS_INVALID"), ({"as_of_ms": -1}, "BOUNDS_INVALID"),
    ({"start_ms": 1785715200000}, "NOT_BAR_ALIGNED"),  # UTC midnight, not source midnight.
    ({"end_ms": ms("2026-08-11") + 1}, "NOT_BAR_ALIGNED"),
    ({"as_of_ms": ms("2026-08-03") + 1000}, "RANGE_EXCEEDS_BUDGET"),
])
def test_bad_query_refuses_before_source_io(changes, code):
    source = Source()
    with pytest.raises(DatasetIndexError, match=code):
        build(source, **changes)
    assert source.calls == []


@pytest.mark.parametrize("fault", ["wrong-dataset", "wrong-symbol", "wrong-timezone", "wrong-venue", "wrong-timeframe",
    "missing-descriptor", "missing-descriptor-field", "wrong-basis", "missing-metadata", "naive", "intraday", "duplicate", "unordered", "outside"])
def test_substituted_source_or_nonexact_chronology_fails_without_repair(fault):
    source = Source()
    def corrupt(value):
        descriptors = {"wrong-dataset": {"dataset_id": "crypto-binance-1m"}, "wrong-symbol": {"symbol": "ACB"},
            "wrong-timezone": {"source_timezone": "UTC"}, "wrong-venue": {"venue": "BINANCE"}, "wrong-timeframe": {"timeframe": "1h"}}
        if fault in descriptors:
            value.descriptor = replace(value.descriptor, **descriptors[fault])
        if fault == "missing-descriptor": value.descriptor = None
        if fault == "missing-descriptor-field": value.descriptor = SimpleNamespace(dataset_id=VN_STOCK_DAILY_DATASET_ID)
        if fault == "wrong-basis": value.load_metadata = {"daily_timestamp_basis": "SESSION_CLOSE"}
        if fault == "missing-metadata": value.load_metadata = None
        dates = value.frame.index
        if fault == "naive": dates = dates.tz_localize(None)
        if fault == "intraday": dates = dates + pd.Timedelta(1, "us")
        if fault == "duplicate": dates = dates.insert(1, dates[0])
        if fault == "unordered": dates = dates[::-1]
        if fault == "outside": dates = dates.insert(len(dates), pd.Timestamp(ms("2026-08-11"), unit="ms", tz="UTC"))
        value.frame = TimestampOnlyFrame(index=dates)
        return value
    source.transform = corrupt
    with pytest.raises(DatasetIndexError, match="TIMESTAMP_CONTRACT_REJECTED"):
        build(source)


@pytest.mark.parametrize("edit", [
    {"clock_basis": "UTC_FIXED_INTERVAL_V1"}, {"source_timezone": "UTC"}, {"timeframe": "1h"},
    {"resolution_ms": 3_600_000}, {"duplicate_bar_count": 1}, {"duplicate_bar_count": False},
    {"as_of_utc_ms": ms("2026-08-10")}, {"start_utc_ms": ms("2026-08-03") + 1},
    {"end_exclusive_utc_ms": ms("2026-08-11") + 1}, {"source_path": "/private"},
    {"runs": [[ms("2026-08-03"), ms("2026-08-04")], [ms("2026-08-04"), ms("2026-08-07")]]},
    {"runs": [[ms("2026-08-03"), ms("2026-08-03")], [ms("2026-08-04"), ms("2026-08-04")]]},
    {"runs": [[ms("2026-08-07"), ms("2026-08-07")], [ms("2026-08-03"), ms("2026-08-03")]]},
    {"runs": [[ms("2026-08-03"), ms("2026-08-11")]]}, {"runs": [[True, ms("2026-08-04")]]},
])
def test_invalid_stored_index_cannot_be_summarized_or_used_for_warmup(edit):
    index = {**build(), **edit}
    for operation in (observed.validate_observed_daily_index, observed.observed_bar_summary,
                      lambda value: observed.observed_earliest_start_with_warmup(value, 300),
                      lambda value: observed.observed_window_metadata(value, start_ms=ms("2026-08-03"), end_ms=ms("2026-08-11"), warmup_bars=0)):
        with pytest.raises(DatasetIndexError, match="DOCUMENT_REJECTED"):
            operation(index)


@pytest.mark.parametrize("warmup", [True, -1, 1.0, 100_001])
def test_invalid_warmup_is_bounded(warmup):
    index = build()
    with pytest.raises(DatasetIndexError, match="WINDOW_QUERY_INVALID"):
        observed.observed_earliest_start_with_warmup(index, warmup)
    with pytest.raises(DatasetIndexError, match="WINDOW_QUERY_INVALID"):
        observed.observed_window_metadata(index, start_ms=ms("2026-08-03"), end_ms=ms("2026-08-11"), warmup_bars=warmup)


def test_chunk_row_run_budgets_fail_closed_without_truncation(monkeypatch):
    source = Source()
    monkeypatch.setattr(observed, "MAX_CHUNKS", 1)
    with pytest.raises(DatasetIndexError, match="CHUNK_BUDGET"):
        build(source, end_ms=ms("2026-09-04"), as_of_ms=ms("2026-09-04"))
    assert not source.calls
    monkeypatch.setattr(observed, "MAX_CHUNKS", 100)
    monkeypatch.setattr(observed, "MAX_ROWS", 3)
    with pytest.raises(DatasetIndexError, match="RANGE_EXCEEDS_BUDGET"):
        build(source)
    assert not source.calls
    monkeypatch.setattr(observed, "MAX_ROWS", 10_000_000)
    monkeypatch.setattr(observed, "MAX_RUNS", 1)
    with pytest.raises(DatasetIndexError, match="GAP_BUDGET"):
        build(source)
    assert len(source.calls) == 1


def test_exact_authoritative_empty_is_typed_but_other_source_failures_propagate():
    source = Source()
    source.failure = DatasetNotFoundError("No observed VN daily bars in the requested local-date window")
    index = build(source)
    assert index["runs"] == []
    assert observed.observed_bar_summary(index)["reason_code"] == "HMD_INDEXED_RANGE_HAS_NO_BARS"
    assert observed.observed_earliest_start_with_warmup(index, 0) is None
    for failure in (DatasetNotFoundError("historical source authority unavailable"), OSError("source unavailable"), DataSchemaError("schema invalid")):
        source.failure = failure
        with pytest.raises(type(failure), match=str(failure)):
            build(source)


@pytest.mark.parametrize("fault", ["wrong-chunk-pin", "missing-chunk-pin", "changed-runtime", "invalid-runtime"])
def test_runtime_and_each_chunk_keep_the_same_exact_source_revision(fault):
    source = Source()
    if fault == "invalid-runtime":
        source._runtime.manifest_digest = "not-a-digest"
    def changed(value):
        if fault == "wrong-chunk-pin": value.load_metadata["manifest_digest"] = "b" * 64
        if fault == "missing-chunk-pin": value.load_metadata.pop("manifest_digest")
        if fault == "changed-runtime": source._runtime.manifest_digest = "b" * 64
        return value
    source.transform = changed
    with pytest.raises(DatasetIndexError, match="SOURCE_REVISION_CHANGED"):
        build(source)
    assert len(source.calls) == (0 if fault == "invalid-runtime" else 1)


def test_revision_change_after_an_empty_source_chunk_still_refuses():
    source = Source()
    def load(_query):
        source._runtime.manifest_digest = "b" * 64
        raise DatasetNotFoundError("No observed VN daily bars in the requested local-date window")
    source.load = load
    with pytest.raises(DatasetIndexError, match="SOURCE_REVISION_CHANGED"):
        build(source)


def test_existing_utc_index_shape_and_bytes_are_unchanged_and_not_reinterpreted():
    first = int(pd.Timestamp("2026-08-03T00:00:00Z").value // 1_000_000)
    class UTCSource:
        def load(self, query):
            return SimpleNamespace(frame=pd.DataFrame(index=pd.date_range(query.start, periods=3, freq="1h")))
    old = build_bar_index(UTCSource(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=first, end_ms=first + 3 * 3_600_000, as_of_ms=first + 3 * 3_600_000)
    expected = {"timeframe": "1h", "resolution_ms": 3_600_000, "start_utc_ms": first,
        "end_exclusive_utc_ms": first + 3 * 3_600_000, "as_of_utc_ms": first + 3 * 3_600_000,
        "duplicate_bar_count": 0, "runs": [[first, first + 2 * 3_600_000]]}
    assert old == expected and canonical(old) == json.dumps(expected, sort_keys=True, separators=(",", ":")).encode()
    doc = {"schema_version": "research.dataset-index.v1", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": old["as_of_utc_ms"], "entries": [{"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "index": old}]}
    assert validate_document(doc) is doc
    with pytest.raises(DatasetIndexError, match="DOCUMENT_REJECTED"):
        observed.validate_observed_daily_index(old)
