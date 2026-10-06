"""FULL-03 source alias/clock tests; real recipe runs are a separate receipt."""
from __future__ import annotations

import copy
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.adapters import market_data
from portal_api.adapters.market_data import (
    DatasetDescriptor, HistoricalDataRuntime, HistoricalMarketDataProvider, MarketDataQuery,
    canonical_fixed_timeframe, fixed_interval_milliseconds,
)
from portal_api.domain.errors import DataSchemaError
from portal_api.services.enrich_dataset_catalog import (
    DatasetIndexError, DatasetIndexStore, build_bar_index, canonical,
    declaration_estimate, discover_indexed_timeframes, enrich_dataset_catalog,
    merge_index_documents, validate_document, window_metadata,
)
from portal_api.services.research_preflight_snapshot import _timeframe_delta

BASE = int(pd.Timestamp("2025-01-01", tz="UTC").value // 1_000_000)
NATIVE_INTERVALS = ("1min", "5min", "15min", "30min", "1h", "4h", "1D")


class Loader:
    SUPPORTED_TIMEFRAMES = NATIVE_INTERVALS
    RESAMPLE_SUPPORTED = True

    def __init__(self):
        self.calls = []

    def load_resampled(self, symbol, **kwargs):
        self.calls.append({"symbol": symbol, **kwargs})
        start, end = pd.Timestamp(kwargs["start_date"]), pd.Timestamp(kwargs["end_date"])
        index = pd.date_range(start, end, freq=_timeframe_delta(kwargs["timeframe"]))
        return pd.DataFrame({"time": index, "symbol": symbol, "open": 100., "high": 102.,
            "low": 99., "close": 101., "volume": 10.})


class IndexedProvider:
    def __init__(self, native=NATIVE_INTERVALS):
        self.native = native
        self._runtime = SimpleNamespace(manifest_digest="a" * 64)
        self.calls = []

    def list_datasets(self):
        return (DatasetDescriptor("crypto-binance-1m", None, "BINANCE", None,
            supported_timeframes=self.native, source_class="historical_market_data",
            usage_scopes=("research",), source_timezone="UTC"),)

    def research_symbol_catalog(self, dataset):
        assert dataset == "crypto-binance-1m"
        return ({"symbol": "BTCUSDT", "contract_kind": "PERPETUAL", "coverage": None},)

    def load(self, query):
        self.calls.append(query)
        return SimpleNamespace(frame=pd.DataFrame(index=pd.date_range(query.start,
            query.end_exclusive - _timeframe_delta(query.timeframe), freq=_timeframe_delta(query.timeframe))))


def indexed_document(native="1min", *, count=500):
    interval = fixed_interval_milliseconds(native)
    return {"schema_version": "research.dataset-index.v1", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": BASE + count * interval, "entries": [{"dataset_id": "crypto-binance-1m",
            "symbol": "BTCUSDT", "index": {"timeframe": native, "resolution_ms": interval,
                "start_utc_ms": BASE, "end_exclusive_utc_ms": BASE + count * interval,
                "as_of_utc_ms": BASE + count * interval, "duplicate_bar_count": 0,
                "runs": [[BASE, BASE + (count - 1) * interval]]}}]}


@pytest.mark.parametrize("native,public", list(zip(NATIVE_INTERVALS, ("1m", "5m", "15m", "30m", "1h", "4h", "1d"))))
def test_full03_native_alias_load_and_300_target_bar_warmup(native, public, tmp_path):
    loader = Loader()
    provider = HistoricalMarketDataProvider(loader_factory=lambda: loader)
    interval = fixed_interval_milliseconds(public)
    query = MarketDataQuery("crypto-binance-1m", "BTCUSDT", public,
        start=pd.Timestamp(BASE, unit="ms", tz="UTC"),
        end_exclusive=pd.Timestamp(BASE + 4 * interval, unit="ms", tz="UTC"))
    loaded = provider.load(query)
    assert loader.calls[0]["timeframe"] == native
    assert len(loaded.frame) == 4
    assert loaded.load_metadata["target_interval_ms"] == interval
    assert loaded.load_metadata["clock_basis"] == "UTC_FIXED_INTERVAL_OPEN_TIME_V1"
    assert canonical_fixed_timeframe(native) == public
    assert _timeframe_delta(public).value // 1_000_000 == interval
    document = indexed_document(native)
    result = window_metadata(document, dataset_id="crypto-binance-1m", symbol="BTCUSDT",
        timeframe=public, start_ms=BASE + 300 * interval, end_ms=BASE + 320 * interval, warmup_bars=300)
    assert result["availability"] == "AVAILABLE"
    assert result["bars"] == 20 and result["warmup_bars_available_before_start"] == 300
    assert result["earliest_start_with_warmup_utc_ms"] == BASE + 300 * interval
    store = DatasetIndexStore(tmp_path)
    revision = store.publish(document)
    original_bytes = (tmp_path / f"{revision}.json").read_bytes()
    public_catalog = enrich_dataset_catalog(IndexedProvider(), store)
    coverage = public_catalog["datasets"][0]["symbols"]["items"][0]["coverage_by_timeframe"]
    assert [entry["timeframe"] for entry in coverage] == [public]
    assert (tmp_path / f"{revision}.json").read_bytes() == original_bytes == canonical(document)
    assert document["entries"][0]["index"]["timeframe"] == native


def test_full03_loader_declaration_is_authority_not_static_portal_menu():
    class NarrowLoader(Loader):
        SUPPORTED_TIMEFRAMES = ("2min", "1D")
    provider = HistoricalMarketDataProvider(loader_factory=NarrowLoader)
    assert provider.list_datasets()[0].supported_timeframes == ("2min", "1D")
    with pytest.raises(DataSchemaError, match="not published"):
        provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1h",
            start="2025-01-01T00:00:00Z", end_exclusive="2025-01-01T01:00:00Z"))


def test_full03_installed_rc3_fixed_interval_grammar_matches_discovery():
    import data_loader
    for native in NATIVE_INTERVALS:
        _, native_duration = data_loader._normalize_timeframe(native)
        assert native_duration.total_seconds() * 1_000 == fixed_interval_milliseconds(native)
        assert fixed_interval_milliseconds(canonical_fixed_timeframe(native)) == fixed_interval_milliseconds(native)
    assert data_loader.CryptoBinance1m.RESAMPLE_SUPPORTED is True
    # This is a reader declaration/grammar check, not a data/recipe receipt.


def test_full03_reader_cannot_substitute_another_source_symbol():
    loader = Loader()
    normal_load = loader.load_resampled
    loader.load_resampled = lambda symbol, **kwargs: normal_load("ETHUSDT", **kwargs)
    provider = HistoricalMarketDataProvider(loader_factory=lambda: loader)
    with pytest.raises(DataSchemaError, match="requested source symbol"):
        provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1m",
            start="2025-01-01T00:00:00Z", end_exclusive="2025-01-01T00:04:00Z"))


def test_full03_closed_source_clock_filters_open_future_bar_and_partial_edges(monkeypatch):
    loader = Loader()
    monkeypatch.setattr(market_data, "_observed_source_as_of_utc_ms", lambda: BASE + 3 * 60_000 + 30_000)
    # Deliberately faulty inclusive source returns open/future bars too.
    normal_load = loader.load_resampled
    def inclusive_load(symbol, **kwargs):
        return normal_load(symbol, **{**kwargs, "end_date": "2025-01-01T00:05:00Z"})
    loader.load_resampled = inclusive_load
    provider = HistoricalMarketDataProvider(loader_factory=lambda: loader)
    loaded = provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1m",
        start="2025-01-01T00:00:00Z", end_exclusive="2025-01-01T00:08:00Z"))
    assert len(loaded.frame) == 3
    assert loaded.frame.index[-1] == pd.Timestamp("2025-01-01T00:02:00Z")
    assert loaded.load_metadata["observed_as_of_utc_ms"] == BASE + 210_000
    operator = IndexedProvider()
    index = build_bar_index(operator, dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="5m",
        start_ms=BASE + 1, end_ms=BASE + 30 * 60_000, as_of_ms=BASE + 27 * 60_000)
    assert index["start_utc_ms"] == BASE + 5 * 60_000
    assert index["end_exclusive_utc_ms"] == BASE + 25 * 60_000


def test_full03_alias_lookup_preserves_dataset_symbol_and_conflict_authority(tmp_path):
    document = indexed_document()
    for dataset, symbol in (("crypto-binance-spot-1m", "BTCUSDT"), ("crypto-binance-1m", "ETHUSDT")):
        result = window_metadata(document, dataset_id=dataset, symbol=symbol, timeframe="1m",
            start_ms=BASE + 300 * 60_000, end_ms=BASE + 320 * 60_000, warmup_bars=300)
        assert result["availability"] == "NOT_PUBLISHED" and result["bars"] is None
    conflicting = copy.deepcopy(document)
    alias = copy.deepcopy(document["entries"][0])
    alias["index"]["timeframe"] = "1m"
    alias["index"]["runs"][0][0] += 60_000
    conflicting["entries"].append(alias)
    with pytest.raises(DatasetIndexError, match="ALIAS_CONFLICT"):
        validate_document(conflicting)
    incoming = copy.deepcopy(document)
    incoming["entries"][0]["index"]["timeframe"] = "1m"
    merged = merge_index_documents(document, incoming)
    assert len(merged["entries"]) == 1
    assert document["entries"][0]["index"]["timeframe"] == "1min"


def test_full03_discovery_and_timestamp_estimate_never_load_prices(tmp_path):
    provider = IndexedProvider()
    store = DatasetIndexStore(tmp_path)
    document = indexed_document()
    store.publish(document)
    discovery = discover_indexed_timeframes(provider, store, dataset_id="crypto-binance-1m", symbols=["BTCUSDT", "ETHUSDT"])
    assert [row["timeframe"] for row in discovery["published_timeframes"]] == ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]
    assert discovery["symbols"][1]["reason_code"] == "HMD_SYMBOL_NOT_LISTED"
    def at(bar):
        return pd.Timestamp(BASE + bar * 60_000, unit="ms", tz="UTC").isoformat()
    requested = {"schema_version": "research.requested-spec.v1", "protocol": "three_window_decay",
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1m"},
        "windows": {name: {"start": at(left), "end_exclusive": at(right)}
            for name, left, right in (("is", 300, 380), ("oos", 380, 440), ("holdout", 440, 500))}}
    estimated = declaration_estimate(document, requested, warmup_bars=300, engine_catalog=SimpleNamespace())
    assert estimated["planned_folds"]["availability"] == "AVAILABLE"
    assert estimated["planned_folds"]["count"] == 1
    assert provider.calls == []


def test_full03_warmup_cap_and_large_timestamp_plan_are_bounded():
    document = indexed_document(count=100_301)
    with pytest.raises(DatasetIndexError, match="QUERY_INVALID"):
        window_metadata(document, dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1m",
            start_ms=BASE, end_ms=BASE + 60_000, warmup_bars=100_001)
    def at(bar):
        return pd.Timestamp(BASE + bar * 60_000, unit="ms", tz="UTC").isoformat()
    requested = {"schema_version": "research.requested-spec.v1", "protocol": "three_window_decay",
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1m"},
        "windows": {name: {"start": at(left), "end_exclusive": at(right)}
            for name, left, right in (("is", 300, 50_000), ("oos", 50_000, 80_000), ("holdout", 80_000, 100_301))}}
    estimated = declaration_estimate(document, requested, warmup_bars=300, engine_catalog=SimpleNamespace())
    assert estimated["planned_folds"]["reason_code"] == "DECLARATION_TIMESTAMP_PLAN_BUDGET_EXCEEDED"


@pytest.mark.parametrize("public", ("1m", "4h", "1d"))
def test_full03_actual_preflight_snapshot_uses_target_bar_warmup_and_clock(public, tmp_path):
    from pathlib import Path
    from portal_api.services.data_catalog import SnapshotStore
    from portal_api.services.research_engine_catalog import ResearchEngineCatalogService
    from portal_api.services.research_preflight_snapshot import ResearchPreflightSnapshotService, sha256_json
    loader = Loader()
    runtime = HistoricalDataRuntime(storage_root=tmp_path, reader_version="test", loader_contract="hmd-loader-v1",
        manifest_digest="a" * 64, environment_id="test", release_commit="0" * 40,
        release_tag="test", dataset_release_id="test", loader_class=Loader)
    provider = HistoricalMarketDataProvider(runtime=runtime, loader_factory=lambda: loader)
    interval = fixed_interval_milliseconds(public)
    def at(bar):
        return pd.Timestamp(BASE + bar * interval, unit="ms", tz="UTC").isoformat()
    requested = {"schema_version": "research.requested-spec.v1", "protocol": "three_window_decay",
        "execution_route": "signal_notional", "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global", "client": {"engine_release_id": "er_quantbt_111"},
        "optuna_trials": 1, "parameter_space_overrides": [],
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": public},
        "windows": {name: {"start": at(left), "end_exclusive": at(right)}
            for name, left, right in (("is", 300, 380), ("oos", 380, 440), ("holdout", 440, 500))}}
    registry = Path(__file__).resolve().parents[2] / "registry"
    store = DatasetIndexStore(tmp_path / "index")
    document = indexed_document(public)
    revision = store.publish(document)
    authority = ResearchPreflightSnapshotService(provider=provider, snapshots=SnapshotStore(tmp_path / "snapshots"),
        engine_catalog=ResearchEngineCatalogService(registry), metadata_index_store=store)
    result = authority.build({"requested_spec": requested, "requested_spec_digest": sha256_json(requested),
        "warmup_bars": 300, "required_columns": ["open", "high", "low", "close", "volume"],
        "requires_funding": False})
    snapshot = result["snapshot"]
    assert snapshot["warmup"]["bars"] == snapshot["warmup"]["requested_bars"] == 300
    assert snapshot["query"]["start_utc_ms"] == BASE
    assert snapshot["quality"]["gaps"] == 0
    assert snapshot["provenance"]["clock_basis"] == "UTC_FIXED_INTERVAL_OPEN_TIME_V1"
    assert snapshot["provenance"]["target_interval_ms"] == interval
    assert result["dataset_binding"]["timeframe"] == public
    provenance = result["dataset_binding"]["provenance"]
    assert provenance == {"clock_basis": "UTC_FIXED_INTERVAL_OPEN_TIME_V1", "source_timezone": "UTC",
        "metadata_index_revision": revision, "metadata_index_source_manifest_digest": "a" * 64,
        "metadata_index_as_of_utc_ms": document["as_of_utc_ms"], "warmup_start_utc_ms": BASE,
        "warmup_semantics": "FIXED_INTERVAL_PREDECESSORS_V1"}
    assert result["dataset_binding"]["closed_bar_policy"] == snapshot["closed_bar_policy"] == "CLOSED_BARS_ONLY"
    assert result["effective_spec"]["data_binding"]["provenance"] == provenance
    assert all(snapshot["provenance"][key] == value for key, value in provenance.items())


def test_full03_index_timestamp_mismatch_has_a_typed_refusal(tmp_path):
    from portal_api.services.research_preflight_snapshot import (
        ResearchPreflightSnapshotError, _verified_fixed_utc_index_provenance,
    )
    runtime = HistoricalDataRuntime(storage_root=tmp_path, reader_version="test", loader_contract="hmd-loader-v1",
        manifest_digest="a" * 64, environment_id="test", release_commit="0" * 40,
        release_tag="test", dataset_release_id="test", loader_class=Loader)
    provider = HistoricalMarketDataProvider(runtime=runtime, loader_factory=Loader)
    store = DatasetIndexStore(tmp_path / "index")
    document = indexed_document("1min")
    document["entries"][0]["index"]["runs"] = [[BASE, BASE + 349 * 60_000], [BASE + 351 * 60_000, BASE + 499 * 60_000]]
    store.publish(document)
    market = provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1m",
        start=pd.Timestamp(BASE, unit="ms", tz="UTC"),
        end_exclusive=pd.Timestamp(BASE + 500 * 60_000, unit="ms", tz="UTC")))
    with pytest.raises(ResearchPreflightSnapshotError) as refusal:
        _verified_fixed_utc_index_provenance(provider, market,
            query_start=pd.Timestamp(BASE, unit="ms", tz="UTC"),
            logical_start=pd.Timestamp(BASE + 300 * 60_000, unit="ms", tz="UTC"),
            logical_end=pd.Timestamp(BASE + 500 * 60_000, unit="ms", tz="UTC"),
            warmup_bars=300, metadata_index_store=store)
    assert refusal.value.code == "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE"
    assert refusal.value.gate == "metadata_index" and refusal.value.field_path == ("data",)


def test_full03_missing_index_does_not_invent_provenance_or_break_legacy(tmp_path):
    from portal_api.services.research_preflight_snapshot import _verified_fixed_utc_index_provenance
    runtime = HistoricalDataRuntime(storage_root=tmp_path, reader_version="test", loader_contract="hmd-loader-v1",
        manifest_digest="a" * 64, environment_id="test", release_commit="0" * 40,
        release_tag="test", dataset_release_id="test", loader_class=Loader)
    provider = HistoricalMarketDataProvider(runtime=runtime, loader_factory=Loader)
    start, end = pd.Timestamp(BASE, unit="ms", tz="UTC"), pd.Timestamp(BASE + 4 * 3_600_000, unit="ms", tz="UTC")
    market = provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1h", start=start, end_exclusive=end))
    assert _verified_fixed_utc_index_provenance(provider, market, query_start=start, logical_start=start,
        logical_end=end, warmup_bars=0, metadata_index_store=DatasetIndexStore(tmp_path / "missing")) is None


def test_full03_arrow_microsecond_index_uses_utc_milliseconds_for_membership(tmp_path):
    from dataclasses import replace
    from portal_api.services.research_preflight_snapshot import _verified_fixed_utc_index_provenance
    runtime = HistoricalDataRuntime(storage_root=tmp_path, reader_version="test", loader_contract="hmd-loader-v1",
        manifest_digest="a" * 64, environment_id="test", release_commit="0" * 40,
        release_tag="test", dataset_release_id="test", loader_class=Loader)
    loader = Loader()
    original_load = loader.load_resampled
    def microsecond_load(symbol, **kwargs):
        frame = original_load(symbol, **kwargs)
        frame["time"] = frame["time"].astype("datetime64[us, UTC]")
        return frame
    loader.load_resampled = microsecond_load
    provider = HistoricalMarketDataProvider(runtime=runtime, loader_factory=lambda: loader)
    store = DatasetIndexStore(tmp_path / "index")
    store.publish(indexed_document("1min"))
    start = pd.Timestamp(BASE, unit="ms", tz="UTC")
    end = pd.Timestamp(BASE + 500 * 60_000, unit="ms", tz="UTC")
    market = provider.load(MarketDataQuery("crypto-binance-1m", "BTCUSDT", "1m", start=start, end_exclusive=end))
    # Exercise both native loader alignment and a retained Arrow-us frame.
    market = replace(market, frame=market.frame.set_axis(market.frame.index.as_unit("us")))
    assert market.frame.index.unit == "us"
    result = _verified_fixed_utc_index_provenance(provider, market, query_start=start,
        logical_start=pd.Timestamp(BASE + 300 * 60_000, unit="ms", tz="UTC"),
        logical_end=end, warmup_bars=300, metadata_index_store=store)
    assert result["warmup_start_utc_ms"] == BASE
    assert result["metadata_index_as_of_utc_ms"] == BASE + 500 * 60_000
