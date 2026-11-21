"""FPT observed fixed admission/P08 contract, no market or runtime activation."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from portal_api.domain.research_vn_observed_fixed_profile import (
    VN_OBSERVED_FIXED_FLAG, VN_OBSERVED_FIXED_PROFILE_DIGEST, validate_vn_observed_fixed_spec,
    vn_observed_fixed_profile, vn_observed_fixed_profile_digest, vn_source_instant,
)
from portal_api.services.data_catalog import SnapshotStore
from portal_api.services.research_engine_catalog import ResearchEngineCatalogService
from portal_api.services.research_preflight_snapshot import ResearchPreflightSnapshotService, ResearchPreflightSnapshotError, sha256_json
from test_historical_vn_observed_provider import Loader, document, provider, source_frame, ms
from test_research_preflight_snapshot import requested, payload

REGISTRY = Path(__file__).resolve().parents[2] / "registry"


def spec():
    result = requested(trials=1)
    result["random_seed"] = None
    result["data"] = {"dataset_id": "vn-stock-daily", "symbol": "FPT", "timeframe": "1d"}
    result["windows"] = {
        "is": {"start": "2025-04-01T00:00:00", "end_exclusive": "2025-08-01T00:00:00"},
        "oos": {"start": "2025-08-01T00:00:00", "end_exclusive": "2026-01-01T00:00:00"},
        "holdout": {"start": "2026-01-01T00:00:00", "end_exclusive": "2026-05-01T00:00:00"},
    }
    return result


def source():
    # Synthetic rows deliberately omit dates; not a source calendar rule.
    frame = source_frame(pd.bdate_range("2024-01-01", periods=650))
    doc = document(frame, start=frame["time"].iloc[0], end=frame["time"].iloc[-1] + pd.Timedelta(1, "D"))
    return provider(Loader(frame), doc), frame


def test_profile_digest_and_exact_source_local_midnight_pins():
    # Pin the deployment/Control API env spelling, not only a self-consistent
    # test import that could otherwise hide a flag drift between the layers.
    assert VN_OBSERVED_FIXED_FLAG == "PORTAL_FEATURE_RESEARCH_VN_OBSERVED_PROFILE"
    profile = vn_observed_fixed_profile()
    assert vn_observed_fixed_profile_digest(profile) == VN_OBSERVED_FIXED_PROFILE_DIGEST
    validate_vn_observed_fixed_spec(spec())
    assert vn_source_instant("2025-04-01T00:00:00").isoformat() == "2025-03-31T17:00:00+00:00"
    assert vn_source_instant("2025-03-31T17:00:00Z").isoformat() == "2025-03-31T17:00:00+00:00"
    profile["symbol"] = "VN30F1M"
    assert vn_observed_fixed_profile_digest(profile) != VN_OBSERVED_FIXED_PROFILE_DIGEST
    assert vn_observed_fixed_profile()["symbol"] == "FPT"


@pytest.mark.parametrize("path,value", [
    (("data", "symbol"), "VN30F1M"), (("data", "timeframe"), "1h"),
    (("data", "dataset_id"), "crypto-binance-1m"), (("optuna_trials",), True), (("optuna_trials",), 2),
    (("random_seed",), 42), (("route_params",), {"leverage": 4}), (("optimization_config",), {"sampler": "tpe"}),
    (("client", "engine_release_id"), "er_quantbt_112"), (("windows", "is", "start"), "2025-04-01T00:00:00Z"),
])
def test_profile_does_not_widen_to_unqualified_source_or_mutated_fixed_economics(path, value):
    request = spec()
    target = request
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValueError):
        validate_vn_observed_fixed_spec(request)


def test_p08_seals_exact_300_observed_warmup_and_unknown_session_quality(tmp_path, monkeypatch):
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "true")
    adapter, frame = source()
    store = SnapshotStore(tmp_path / "snapshots")
    service = ResearchPreflightSnapshotService(adapter, store, ResearchEngineCatalogService(REGISTRY, market_data_provider=adapter))
    result = service.build(payload(spec(), warmup_bars=300))
    snapshot = result["snapshot"]
    stamps = [ms(value) for value in frame["time"]]
    prefix = [value for value in stamps if value < ms("2025-04-01")]
    expected_start = prefix[-300]
    assert snapshot["warmup"]["bars"] == 300
    assert snapshot["query"]["start_utc_ms"] == expected_start
    assert ms("2025-04-01") - expected_start > 300 * 86_400_000
    assert snapshot["calendar_policy"] == "SOURCE_DECLARED"
    assert snapshot["closed_bar_policy"] == "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
    assert snapshot["quality"] == {"rows": snapshot["row_count"], "gaps": None, "duplicates": 0,
        "gap_ratio": None, "passed": True, "reason_codes": [], "missing_bar_count": None, "state": "OBSERVED_TAPE_INTEGRITY_ONLY"}
    assert snapshot["gap_scan"]["state"] == "NOT_PUBLISHED"
    binding = result["dataset_binding"]
    assert binding["provenance"]["warmup_start_utc_ms"] == expected_start
    assert binding["provenance"]["warmup_semantics"] == "LAST_N_OBSERVED_PREDECESSORS_V1"
    assert result["effective_spec_digest"] == sha256_json(result["effective_spec"])
    _, _, retained = store.open(snapshot["snapshot_id"])
    assert len(retained[retained.index < pd.Timestamp(ms("2025-04-01"), unit="ms", tz="UTC")]) == 300
    assert [int(value) for value in retained.index.as_unit("ms").asi8] == [value for value in stamps if expected_start <= value < ms("2026-05-01")]


@pytest.mark.parametrize("flag,warmup", [("false", 300), ("true", 299)])
def test_p08_flag_or_index_presence_alone_cannot_widen_admission(tmp_path, monkeypatch, flag, warmup):
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, flag)
    adapter, _ = source()
    service = ResearchPreflightSnapshotService(adapter, SnapshotStore(tmp_path), ResearchEngineCatalogService(REGISTRY))
    with pytest.raises(ResearchPreflightSnapshotError, match="qualified fixed FPT profile"):
        service.build(payload(spec(), warmup_bars=warmup))


def test_atlas_qualification_requires_flag_actual_provider_and_verified_release(monkeypatch):
    adapter, _ = source()
    service = ResearchEngineCatalogService(REGISTRY, market_data_provider=adapter)
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "false")
    assert service.public_document().current_release.vn_observed_daily_qualification.state == "NOT_PUBLISHED"
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "true")
    fact = service.public_document().current_release.vn_observed_daily_qualification
    assert fact.state == "AVAILABLE" and fact.index_revision is not None
    assert fact.profile_digest == VN_OBSERVED_FIXED_PROFILE_DIGEST
    assert ResearchEngineCatalogService(REGISTRY).public_document().current_release.vn_observed_daily_qualification.state == "NOT_PUBLISHED"
    service._current_release_runtime = service._current_release_runtime.model_copy(update={"verified": False})
    assert service.public_document().current_release.vn_observed_daily_qualification.state == "NOT_PUBLISHED"


def test_source_date_fraction_is_checked_before_python_datetime_can_truncate():
    assert vn_source_instant("2025-03-31T17:00:00.000000000Z").isoformat() == "2025-03-31T17:00:00+00:00"
    with pytest.raises(ValueError):
        vn_source_instant("2025-03-31T17:00:00.000000001Z")


@pytest.mark.parametrize("flag,document_state", [("false", "forbidden"), ("true", "valid"), ("true", "absent"), ("true", "corrupt")])
def test_default_factory_needs_explicit_flag_and_verified_index_and_preserves_crypto(monkeypatch, flag, document_state):
    import portal_api.main as main
    from portal_api.adapters.market_data import ObservedVnCompositeProvider, BINANCE_RELEASE_DATASET_ID
    from portal_api.services.enrich_dataset_catalog import DatasetIndexStore, canonical
    from test_historical_vn_observed_provider import runtime
    from dataclasses import replace
    import hashlib

    doc = document(source_frame(pd.bdate_range("2024-01-01", periods=650)), start="2024-01-01", end="2026-06-27")
    identity = object()

    class Primary:
        _runtime = replace(runtime(), dataset_release_id=BINANCE_RELEASE_DATASET_ID)
        def load(self, _query):
            return identity

    primary = Primary()
    monkeypatch.setenv("PORTAL_HISTORICAL_DATA_MODE", "required")
    monkeypatch.delenv("PORTAL_DATASET_MANIFEST", raising=False)
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, flag)
    monkeypatch.setattr(main, "HistoricalMarketDataProvider", lambda **_: primary)
    monkeypatch.setattr(main, "load_vn_stock_daily_qualification_runtime", lambda _: runtime())

    def read(_store, digest):
        assert digest == "a" * 64
        if document_state == "forbidden":
            raise AssertionError("flag off must never inspect the index")
        if document_state == "corrupt":
            raise ValueError("private corrupted source index path")
        if document_state == "absent":
            return None, None, "HMD_METADATA_INDEX_NOT_BUILT"
        return hashlib.sha256(canonical(doc)).hexdigest(), doc, None

    monkeypatch.setattr(DatasetIndexStore, "read", read)
    result = main._default_provider()
    if document_state == "valid":
        assert isinstance(result, ObservedVnCompositeProvider)
        assert result.qualification()["symbol"] == "FPT"
    else:
        assert result is primary
    from portal_api.adapters.market_data import MarketDataQuery
    assert result.load(MarketDataQuery(dataset_id="crypto-binance-1m", symbol="BTCUSDT", timeframe="1h")) is identity


def source_document(frame):
    return document(frame, start=frame["time"].iloc[0], end=frame["time"].iloc[-1] + pd.Timedelta(1, "D"))


def test_qualified_fixed_estimate_uses_only_observed_index_and_same_p08_topology(monkeypatch):
    from portal_api.services.enrich_dataset_catalog import declaration_estimate
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "true")
    adapter, frame = source()
    catalog = ResearchEngineCatalogService(REGISTRY, market_data_provider=adapter)
    result = declaration_estimate(source_document(frame), spec(), warmup_bars=300, engine_catalog=catalog)
    assert result["planned_folds"] == {"availability": "AVAILABLE", "reason_code": None,
        "count": 1, "basis": "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1",
        "min_train_bars": len(frame[(frame["time"] >= "2025-04-01") & (frame["time"] < "2025-08-01")]),
        "min_oos_bars": len(frame[(frame["time"] >= "2025-08-01") & (frame["time"] < "2026-01-01")])}
    assert result["earliest_start_basis"] == "OBSERVED_INDEXED_WARMUP_BARS_V1"
    assert result["earliest_start_utc_ms"] == ms(frame["time"].iloc[300])
    assert result["windows"][0]["warmup_bars_available_before_start"] == 300
    assert result["windows"][0]["start_utc_ms"] == ms("2025-04-01")
    assert adapter._loader_factory().calls == []
    assert result["scope"] == "INDEX_ESTIMATE_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION"


@pytest.mark.parametrize("refusal", ["flag", "index_revision", "wrong_warmup", "no_provider"])
def test_unqualified_estimates_preserve_measured_observations_without_admitting_profile(monkeypatch, refusal):
    import copy
    from portal_api.services.enrich_dataset_catalog import declaration_estimate
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "false" if refusal == "flag" else "true")
    adapter, frame = source()
    catalog = ResearchEngineCatalogService(REGISTRY, market_data_provider=None if refusal == "no_provider" else adapter)
    doc = copy.deepcopy(source_document(frame))
    if refusal == "index_revision":
        doc["as_of_utc_ms"] += 1
        doc["entries"][0]["index"]["as_of_utc_ms"] += 1
    result = declaration_estimate(doc, spec(), warmup_bars=299 if refusal == "wrong_warmup" else 300, engine_catalog=catalog)
    assert result["planned_folds"]["availability"] == "NOT_PUBLISHED"
    assert result["planned_folds"]["reason_code"] == "VN_DAILY_PORTAL_EXECUTION_NOT_QUALIFIED"
    assert all(row["availability"] == "AVAILABLE" and row["bars"] > 0 for row in result["windows"])
    assert result["earliest_start_utc_ms"] is not None
    assert adapter._loader_factory().calls == []


def test_estimate_cache_cannot_retain_ready_plan_after_qualification_revocation(tmp_path, monkeypatch):
    from portal_api.services.enrich_dataset_catalog import DatasetIndexStore
    adapter, frame = source()
    catalog = ResearchEngineCatalogService(REGISTRY, market_data_provider=adapter)
    store = DatasetIndexStore(tmp_path)
    doc = source_document(frame)
    revision = store.publish(doc)
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "false")
    def estimate():
        return store.estimate(revision, doc, spec(), warmup_bars=300, engine_catalog=catalog)
    assert estimate()["planned_folds"]["availability"] == "NOT_PUBLISHED"
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "true")
    assert estimate()["planned_folds"]["availability"] == "AVAILABLE"
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "false")
    assert estimate()["planned_folds"]["availability"] == "NOT_PUBLISHED"
    assert len(store._estimates) == 2 and adapter._loader_factory().calls == []


def test_verified_empty_weekend_tail_is_not_a_fabricated_calendar_bar(tmp_path, monkeypatch):
    from portal_api.services.enrich_dataset_catalog import declaration_estimate
    monkeypatch.setenv(VN_OBSERVED_FIXED_FLAG, "true")
    adapter, frame = source()
    catalog = ResearchEngineCatalogService(REGISTRY, market_data_provider=adapter)
    request = spec()
    request["windows"]["holdout"]["end_exclusive"] = "2026-05-03T00:00:00"  # Sunday, within exact observed index coverage.
    result = ResearchPreflightSnapshotService(adapter, SnapshotStore(tmp_path), catalog).build(payload(request, warmup_bars=300))
    estimate = declaration_estimate(source_document(frame), request, warmup_bars=300, engine_catalog=catalog)
    assert result["snapshot"]["query"]["end_exclusive_utc_ms"] == ms("2026-05-03")
    assert estimate["planned_folds"]["availability"] == "AVAILABLE"
    assert estimate["windows"][-1]["last_bar_utc_ms"] == ms("2026-05-01")
    assert result["snapshot"]["quality"]["missing_bar_count"] is None
    request["windows"]["holdout"]["end_exclusive"] = "2026-07-05T00:00:00"
    refused = declaration_estimate(source_document(frame), request, warmup_bars=300, engine_catalog=catalog)
    assert refused["planned_folds"]["availability"] == "NOT_PUBLISHED"
    assert refused["planned_folds"]["reason_code"] == "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"
    with pytest.raises(ResearchPreflightSnapshotError, match="bounded historical source"):
        ResearchPreflightSnapshotService(adapter, SnapshotStore(tmp_path / "outside"), catalog).build(payload(request, warmup_bars=300))
