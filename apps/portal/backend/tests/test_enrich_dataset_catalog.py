"""B7 synthetic regressions. Real reader/preview acceptance is a separate receipt."""
from __future__ import annotations
import copy
import hashlib
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.adapters.market_data import DatasetDescriptor
from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError
from portal_api.services.enrich_dataset_catalog import (
    DatasetIndexError, DatasetIndexStore, bar_summary, build_bar_index, canonical,
    enrich_dataset_catalog, validate_document, window_metadata, build_symbol_indexes,
    merge_index_documents, declaration_estimate,
)

DAY = 86_400_000
HOUR = 3_600_000
BASE = 1782864000000

class Provider:
    def __init__(self, *, missing=(3,), failure=None):
        self.missing = missing
        self.failure = failure
        self.calls = []
        self._runtime = SimpleNamespace(manifest_digest="a" * 64)
    def list_datasets(self):
        return (DatasetDescriptor(dataset_id="crypto-binance-1m", symbol=None, venue="BINANCE",
            timeframe=None, supported_timeframes=("1h", "1D"), source_class="historical_market_data",
            usage_scopes=("research",)),)
    def research_symbol_catalog(self, _):
        return ({"symbol": "BTCUSDT", "contract_kind": "PERPETUAL", "coverage": None},)
    def load(self, query):
        self.calls.append(query)
        if self.failure:
            raise self.failure
        stamps = pd.date_range(query.start, query.end_exclusive - pd.Timedelta(1, "h"), freq="1h")
        stamps = stamps[[int((x.value // 1_000_000 - BASE) // HOUR) not in self.missing for x in stamps]]
        return SimpleNamespace(frame=pd.DataFrame(index=stamps))

def indexed(provider=None):
    return build_bar_index(provider or Provider(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE, end_ms=BASE + 10 * HOUR, as_of_ms=BASE + 10 * HOUR)

def document(index=None):
    return {"schema_version": "research.dataset-index.v1", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": BASE + 10 * HOUR, "entries": [{"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "index": index or indexed()}]}

def test_exact_target_edges_gaps_and_independent_window_oracle():
    row = indexed()
    summary = bar_summary(row)
    assert row["runs"] == [[BASE, BASE + 2 * HOUR], [BASE + 4 * HOUR, BASE + 9 * HOUR]]
    assert (summary["bar_count"], summary["expected_bar_count"], summary["missing_ratio"], summary["gap_count"]) == (9, 10, "0.100000000000", 1)
    assert summary["last_closed_bar_end_utc_ms"] == BASE + 10 * HOUR
    result = window_metadata(document(row), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE + 4 * HOUR, end_ms=BASE + 8 * HOUR, warmup_bars=2)
    assert (result["bars"], result["warmup_bars_available_before_start"]) == (4, 1)
    assert result["first_bar_utc_ms"] == BASE + 4 * HOUR
    assert result["last_bar_utc_ms"] == BASE + 7 * HOUR

def test_append_keeps_existing_sources_and_never_refreshes_their_clock():
    previous = document()
    incoming = copy.deepcopy(previous)
    incoming["entries"][0]["dataset_id"] = "crypto-binance-spot-1m"
    result = merge_index_documents(previous, incoming)
    assert len(result["entries"]) == 2
    assert result["as_of_utc_ms"] == previous["as_of_utc_ms"]
    assert previous["entries"][0] in result["entries"]
    incoming["as_of_utc_ms"] += HOUR
    incoming["entries"][0]["index"]["as_of_utc_ms"] += HOUR
    with pytest.raises(DatasetIndexError, match="APPEND_SOURCE_CLOCK_MISMATCH"):
        merge_index_documents(previous, incoming)

def test_observation_clock_excludes_open_bar():
    row = build_bar_index(Provider(missing=()), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE, end_ms=BASE + 10 * HOUR, as_of_ms=BASE + 8 * HOUR + 30000)
    assert bar_summary(row)["last_closed_bar_end_utc_ms"] == BASE + 8 * HOUR
    assert bar_summary(row)["bar_count"] == 8

def test_chunking_is_sequential_bounded_and_memory_does_not_keep_whole_tape():
    provider = Provider(missing=())
    row = build_bar_index(provider, dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE, end_ms=BASE + 64 * DAY, as_of_ms=BASE + 64 * DAY)
    assert len(provider.calls) == 3
    assert all(call.end_exclusive - call.start <= pd.Timedelta(31, "days") for call in provider.calls)
    assert row["runs"] == [[BASE, BASE + 64 * DAY - HOUR]]

def test_retry_revision_and_read_are_deterministic_no_price_custody(tmp_path: Path):
    provider = Provider()
    store = DatasetIndexStore(tmp_path)
    doc = document(indexed(provider))
    first = store.publish(doc)
    assert store.publish(copy.deepcopy(doc)) == first == hashlib.sha256(canonical(doc)).hexdigest()
    assert len(list(tmp_path.glob("*.json"))) == 1
    calls = len(provider.calls)
    public = enrich_dataset_catalog(provider, store)
    assert len(provider.calls) == calls
    assert public["catalog_revision"] == first
    assert public["datasets"][0]["symbols"]["items"][0]["instrument"]["expiry_utc_ms"] is None
    assert "close" not in doc and "source_path" not in canonical(public).decode()

def test_unbuilt_or_changed_source_is_typed_not_guessed(tmp_path: Path):
    provider = Provider()
    store = DatasetIndexStore(tmp_path)
    assert enrich_dataset_catalog(provider, store)["index_availability"]["reason_code"] == "HMD_METADATA_INDEX_NOT_BUILT"
    store.publish(document())
    provider._runtime.manifest_digest = "b" * 64
    public = enrich_dataset_catalog(provider, store)
    assert public["index_availability"]["state"] == "NOT_PUBLISHED"
    assert public["datasets"][0]["symbols"]["items"][0]["coverage_by_timeframe"] == []

def test_catalog_cache_does_not_repeat_namespace_work_and_invalidates_on_revision(tmp_path: Path):
    provider = Provider()
    calls = []
    original = provider.research_symbol_catalog
    provider.research_symbol_catalog = lambda dataset: (calls.append(dataset), original(dataset))[1]
    store = DatasetIndexStore(tmp_path)
    first = enrich_dataset_catalog(provider, store)
    assert enrich_dataset_catalog(provider, store) is first
    assert len(calls) == 1 and not provider.calls
    store.publish(document())
    second = enrich_dataset_catalog(provider, store)
    assert second is not first and second["index_availability"]["state"] == "AVAILABLE"
    assert len(calls) == 2 and not provider.calls

@pytest.fixture
def anyio_backend():
    return "asyncio"

@pytest.mark.anyio
async def test_private_metadata_routes_require_hmac_without_loading_hmd(tmp_path: Path, monkeypatch):
    import base64
    import hmac
    import json
    import time
    import httpx
    from fastapi import FastAPI
    from portal_api.api.routes_research_internal import router
    secret = "b7-test-private-principal-secret"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    provider = Provider()
    app = FastAPI()
    app.state.market_data_provider = provider
    app.state.research_dataset_index = DatasetIndexStore(tmp_path)
    app.state.research_dataset_index.publish(document())
    app.state.research_engine_catalog = SimpleNamespace()
    app.state.quantbt_gateway = None
    app.include_router(router)
    payload = {"principalId":"b7-test", "username":"b7-test", "role":"USER",
        "authnMethods":["portal_session"], "exp":int(time.time()) + 60, "policyVersion":"auth-policy-v1"}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    headers = {"x-portal-principal": f"{encoded}.{signature}"}
    params = {"dataset_id":"crypto-binance-1m", "symbol":"BTCUSDT", "timeframe":"1h",
        "start_utc_ms":BASE + 4*HOUR, "end_exclusive_utc_ms":BASE + 8*HOUR, "warmup_bars":2}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        estimate_body={"requested_spec":{"schema_version":"research.requested-spec.v1","protocol":"three_window_decay",
            "data":{"dataset_id":"crypto-binance-1m","symbol":"BTCUSDT","timeframe":"1h"},
            "windows":{key:{"start":pd.Timestamp(BASE+a*HOUR,unit="ms",tz="UTC").isoformat(),
                "end_exclusive":pd.Timestamp(BASE+b*HOUR,unit="ms",tz="UTC").isoformat()}
                for key,a,b in (("is",0,4),("oos",4,8),("holdout",8,10))}},"warmup_bars":0}
        assert (await client.post("/internal/research/dataset-declaration-estimate",json=estimate_body)).status_code==401
        assert (await client.post("/internal/research/dataset-declaration-estimate",json=estimate_body,headers={"x-portal-principal":"browser.fake"})).status_code==401
        estimate=await client.post("/internal/research/dataset-declaration-estimate",json=estimate_body,headers=headers)
        assert estimate.status_code==200,estimate.text
        assert estimate.json()["planned_folds"]["count"]==1
        assert not provider.calls
        for route in ("/internal/research/datasets-v2", "/internal/research/dataset-bar-metadata"):
            assert (await client.get(route, params=params if "bar-metadata" in route else {})).status_code == 401
            assert (await client.get(route, params=params if "bar-metadata" in route else {},
                headers={"x-portal-principal":"browser.fake"})).status_code == 401
        catalog = await client.get("/internal/research/datasets-v2", headers=headers)
        metadata = await client.get("/internal/research/dataset-bar-metadata", headers=headers, params=params)
        refused = await client.get("/internal/research/dataset-bar-metadata", headers=headers,
            params={**params, "start_utc_ms": BASE, "warmup_bars": 2})
        provider._runtime.manifest_digest = "b" * 64
        drifted = await client.get("/internal/research/dataset-bar-metadata", headers=headers, params=params)
        app.state.research_dataset_index = DatasetIndexStore(tmp_path / "not-built")
        unbuilt = await client.get("/internal/research/dataset-bar-metadata", headers=headers, params=params)
        invalid = await client.get("/internal/research/dataset-bar-metadata", headers=headers, params={**params,"warmup_bars":100001})
    assert catalog.status_code == 200
    assert metadata.status_code == 200 and metadata.json()["bars"] == 4
    assert refused.status_code == 200 and refused.json()["availability"] == "NOT_PUBLISHED"
    assert refused.json()["bars"] == 7 and refused.json()["warmup_bars_available_before_start"] == 0
    assert refused.json()["verified_range"]["start_utc_ms"] == BASE
    assert refused.json()["earliest_start_with_warmup_utc_ms"] == BASE + 2 * HOUR
    assert drifted.status_code == 200 and drifted.json()["reason_code"] == "HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED"
    assert drifted.json()["verified_range"] is None and drifted.json()["earliest_start_with_warmup_utc_ms"] is None
    assert drifted.json()["bars"] is None
    assert unbuilt.status_code == 200 and unbuilt.json()["reason_code"] == "HMD_METADATA_INDEX_NOT_BUILT"
    assert unbuilt.json()["verified_range"] is None and unbuilt.json()["warmup_bars_available_before_start"] is None
    assert invalid.status_code == 422
    assert provider.calls == []

@pytest.mark.parametrize("edit", [
    lambda doc: doc["entries"].append(doc["entries"][0]),
    lambda doc: doc["entries"][0]["index"]["runs"].append([BASE, BASE + HOUR]),
    lambda doc: doc["entries"][0]["index"].update(resolution_ms=1),
    lambda doc: doc["entries"][0]["index"].update(as_of_utc_ms=0),
    lambda doc: doc["entries"][0]["index"].update(source_path="/private"),
    lambda doc: doc["entries"][0].update(symbol="../private"),
])
def test_invalid_stored_metadata_fails_closed(edit):
    doc = document(); edit(doc)
    with pytest.raises(DatasetIndexError): validate_document(doc)

def test_corrupt_revision_and_pointer_refused(tmp_path: Path):
    revision = DatasetIndexStore(tmp_path).publish(document())
    (tmp_path / f"{revision}.json").write_text("{}")
    with pytest.raises(DatasetIndexError): DatasetIndexStore(tmp_path).read("a" * 64)
    (tmp_path / "current").write_text("../private")
    with pytest.raises(DatasetIndexError): DatasetIndexStore(tmp_path).read("a" * 64)

def test_only_authoritative_empty_is_empty_no_schema_or_io_fallback():
    empty = indexed(Provider(failure=DatasetNotFoundError("empty")))
    assert bar_summary(empty)["availability"] == "NOT_PUBLISHED"
    assert bar_summary(empty)["missing_ratio"] is None
    for failure in (OSError("source failure"), DataSchemaError("bad data")):
        with pytest.raises(type(failure)): indexed(Provider(failure=failure))

def test_warmup_only_refusal_discloses_measured_window_not_an_admission():
    result = window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE, end_ms=BASE + 8 * HOUR, warmup_bars=2)
    assert result["availability"] == "NOT_PUBLISHED" and result["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    assert (result["bars"], result["warmup_bars_available_before_start"]) == (7, 0)
    assert result["verified_range"] == {"start_utc_ms": BASE, "end_exclusive_utc_ms": BASE + 10 * HOUR,
        "basis": "INDEXED_TARGET_BAR_RANGE_V1"}
    assert result["earliest_start_with_warmup_utc_ms"] == BASE + 2 * HOUR
    assert "may_create_run" not in result
    partial = window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE + HOUR, end_ms=BASE + 8 * HOUR, warmup_bars=3)
    assert partial["availability"] == "NOT_PUBLISHED"
    assert (partial["bars"], partial["warmup_bars_available_before_start"]) == (6, 1)
    assert partial["earliest_start_with_warmup_utc_ms"] == BASE + 7 * HOUR

def test_window_outside_index_and_invalid_query_are_not_zero():
    for start, end in ((BASE - HOUR, BASE + 8 * HOUR), (BASE, BASE + 11 * HOUR)):
        result = window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
            start_ms=start, end_ms=end, warmup_bars=2)
        assert result["bars"] is None and result["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
        assert result["warmup_bars_available_before_start"] is None
        assert result["verified_range"]["start_utc_ms"] == BASE
        assert result["earliest_start_with_warmup_utc_ms"] == BASE + 2 * HOUR
    with pytest.raises(DatasetIndexError): window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE + 1, end_ms=BASE + 8 * HOUR, warmup_bars=0)

def test_earliest_start_uses_contiguous_target_bars_and_truthful_nulls():
    for warmup, earliest in ((0, BASE), (2, BASE + 2 * HOUR), (3, BASE + 7 * HOUR), (6, None)):
        result = window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
            start_ms=BASE, end_ms=BASE + 8 * HOUR, warmup_bars=warmup)
        assert result["earliest_start_with_warmup_utc_ms"] == earliest
    gap = window_metadata(document(), dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE + 4 * HOUR, end_ms=BASE + 8 * HOUR, warmup_bars=2)
    assert gap["availability"] == "AVAILABLE" and gap["warmup_bars_available_before_start"] == 1
    for doc, symbol in ((None, "BTCUSDT"), (document(), "ETHUSDT"), (document(indexed(Provider(failure=DatasetNotFoundError("empty")))), "BTCUSDT")):
        result = window_metadata(doc, dataset_id="crypto-binance-1m", symbol=symbol, timeframe="1h",
            start_ms=BASE, end_ms=BASE + 8 * HOUR, warmup_bars=2)
        assert result["earliest_start_with_warmup_utc_ms"] is None
        if doc is None or symbol == "ETHUSDT":
            assert result["verified_range"] is None and result["bars"] is None

def test_declaration_keeps_exact_legacy_refusal_shape_and_shared_earliest():
    requested = {"schema_version": "research.requested-spec.v1", "protocol": "three_window_decay",
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1h"},
        "windows": {key: {"start": pd.Timestamp(BASE + left * HOUR, unit="ms", tz="UTC").isoformat(),
            "end_exclusive": pd.Timestamp(BASE + right * HOUR, unit="ms", tz="UTC").isoformat()}
            for key, left, right in (("is", 0, 4), ("oos", 4, 8), ("holdout", 8, 10))}}
    result = declaration_estimate(document(), requested, warmup_bars=3, engine_catalog=SimpleNamespace())
    assert result["earliest_start_utc_ms"] == BASE + 7 * HOUR
    window = result["windows"][0]
    assert window["availability"] == "NOT_PUBLISHED" and window["bars"] is None
    assert window["warmup_bars_available_before_start"] is None
    assert "verified_range" not in window and "earliest_start_with_warmup_utc_ms" not in window

def test_range_budget_refuses_before_loading():
    provider = Provider()
    with pytest.raises(DatasetIndexError): build_bar_index(provider, dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h",
        start_ms=BASE, end_ms=BASE + 5000 * DAY, as_of_ms=BASE + 5000 * DAY)
    assert provider.calls == []

@pytest.mark.parametrize("matching", [True, False])
def test_mode5_estimate_labels_only_native_identical_calibration_geometry(monkeypatch, matching):
    from portal_api.services import research_preflight_snapshot as planner
    start = pd.Timestamp(BASE, unit="ms", tz="UTC").isoformat()
    end = pd.Timestamp(BASE + 10 * HOUR, unit="ms", tz="UTC").isoformat()
    interval = {"start_utc": start, "end_exclusive_utc": end, "bars": 10}
    evaluation = dict(interval)
    if not matching:
        evaluation["bars"] = 9
    monkeypatch.setattr(planner, "_v2_walk_forward_fields", lambda _: {})
    monkeypatch.setattr(planner, "_engine_advanced_topology", lambda *a, **k:
        (None, None, {"folds": [{"train": interval, "outer_oos": evaluation}]}))
    requested = {"schema_version": "research.requested-spec.v2", "protocol": "advanced_walk_forward",
        "optimization_mode": "mode_5_full_robust", "optuna_trials": 3,
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1h"},
        "walk_forward": {"start": start, "end_exclusive": end}}
    result = declaration_estimate(document(indexed(Provider(missing=()))), requested, warmup_bars=0,
        engine_catalog=SimpleNamespace(walk_forward_options=lambda: None))
    plan = result["planned_folds"]
    if matching:
        assert plan["evaluation_scope"] == "FULL_SAMPLE_CALIBRATION"
        assert plan["items"][0]["train"] == plan["items"][0]["outer_oos"]
    else:
        assert plan["availability"] == "NOT_PUBLISHED"
        assert plan["reason_code"] == "MODE5_NATIVE_CALIBRATION_GEOMETRY_NOT_PUBLISHED"
        assert "evaluation_scope" not in plan

def test_one_minute_source_pass_bins_all_timeframes_without_fabricating_constituents():
    class MinuteProvider(Provider):
        def load(self, query):
            self.calls.append(query)
            stamps = pd.date_range(query.start, query.end_exclusive - pd.Timedelta(1, "min"), freq="1min")
            # Entire hour absent, isolated constituent minute absent. Both must
            # match the reader's nonempty-bin policy, not a fake full-hour gate.
            hour = (stamps.asi8 // 1_000_000 - BASE) // HOUR
            stamps = stamps[(hour != 3) & (stamps.asi8 // 1_000_000 != BASE + 60_000)]
            return SimpleNamespace(frame=pd.DataFrame(index=stamps))
    provider = MinuteProvider()
    indexes = build_symbol_indexes(provider, dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframes=["1min", "1h", "4h", "1d"],
        start_ms=BASE, end_ms=BASE + 2 * DAY, as_of_ms=BASE + 2 * DAY)
    assert len(provider.calls) == 1 and provider.calls[0].timeframe == "1min"
    summary = {row["timeframe"]: bar_summary(row) for row in indexes}
    assert summary["1h"]["bar_count"] == 47
    assert summary["4h"]["bar_count"] == 12 and summary["1d"]["bar_count"] == 2
    assert summary["1min"]["bar_count"] == 2 * 1440 - 61
