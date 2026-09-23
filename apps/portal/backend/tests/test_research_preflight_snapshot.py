from __future__ import annotations

import copy
import base64
import hashlib
import hmac
import json
import time
from pathlib import Path

import httpx
import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    DatasetDescriptor,
    MarketDataQuery,
    prepare_bounded_market_data,
)
from portal_api.services.data_catalog import SnapshotStore
from portal_api.services.research_engine_catalog import ResearchEngineCatalogService
from portal_api.services.research_preflight_snapshot import (
    ResearchPreflightSnapshotError,
    ResearchPreflightSnapshotService,
    parse_source_instant,
    sha256_json,
)
from portal_api.main import create_app


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"


class MutableHistoricalProvider:
    """A local, source-mutable HMD-shaped test double; no external reader."""

    def __init__(self, frame: pd.DataFrame, *, source_timezone: str = "UTC") -> None:
        self.frame = frame
        self.source_timezone = source_timezone
        self.calls: list[MarketDataQuery] = []
        self.metadata: dict[str, object] = {
            "source_class": "historical_market_data",
            "manifest_digest": "a" * 64,
            "reader_version": "test-double",
            "loader_contract": "hmd-loader-v1",
            "dataset_release_id": "binance_perpetual_spot_quarterly",
            "usage_scope": "research",
        }

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return (
            DatasetDescriptor(
                dataset_id="crypto-binance-1m",
                symbol=None,
                venue="BINANCE",
                timeframe=None,
                dynamic_query=True,
                supported_timeframes=("1h",),
                source_class="historical_market_data",
                availability="available",
                usage_scopes=("research",),
                source_timezone=self.source_timezone,
            ),
        )

    def load(self, query: MarketDataQuery):
        self.calls.append(query)
        descriptor = DatasetDescriptor(
            dataset_id=query.dataset_id,
            symbol=str(query.symbol),
            venue="BINANCE",
            timeframe=str(query.timeframe),
            dynamic_query=True,
            supported_timeframes=("1h",),
            source_class="historical_market_data",
            availability="available",
            usage_scopes=("research",),
            source_timezone=self.source_timezone,
        )
        return prepare_bounded_market_data(
            self.frame,
            descriptor,
            query,
            load_metadata=self.metadata,
        )


def frame(rows: int = 1_000) -> pd.DataFrame:
    index = pd.date_range("2026-01-01T00:00:00Z", periods=rows, freq="1h")
    close = pd.Series(range(100, 100 + rows), dtype="float64", index=index)
    return pd.DataFrame(
        {
            "open": close - 0.5,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": 100.0,
        },
        index=index,
    )


def requested(*, trials: int = 8, engine_release_id: str = "er_quantbt_111") -> dict[str, object]:
    return {
        "schema_version": "research.requested-spec.v1",
        "alpha_binding": None,
        "not_publishable": True,
        "strategy_id": "delta_rsi",
        "execution_route": "signal_notional",
        "route_params": {},
        "data": {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1h"},
        "protocol": "three_window_decay",
        "windows": {
            "is": {"start": "2026-01-04T00:00:00", "end_exclusive": "2026-01-10T00:00:00"},
            "oos": {"start": "2026-01-10T00:00:00", "end_exclusive": "2026-01-14T00:00:00"},
            "holdout": {"start": "2026-01-14T00:00:00", "end_exclusive": "2026-01-18T00:00:00"},
        },
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "parameter_space_overrides": [],
        "optuna_trials": trials,
        "early_stopping": None,
        "random_seed": 42,
        "optimization_config": {},
        "client": {"engine_release_id": engine_release_id, "config_digest": "b" * 64},
    }


def payload(spec: dict[str, object], **overrides: object) -> dict[str, object]:
    return {
        "requested_spec": spec,
        "requested_spec_digest": sha256_json(spec),
        "required_columns": ["open", "high", "low", "close", "volume"],
        "warmup_bars": 24,
        "requires_funding": False,
        **overrides,
    }


def signed_internal_principal(secret: str) -> str:
    payload = {
        "principalId": "p08-user-a",
        "username": "p08-user-a",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": ["portal_session", "research_preflight"],
        "sessionId": "p08-session",
        "mustChangePassword": False,
        "issuedAt": "2026-09-20T00:00:00.000Z",
        "exp": int(time.time()) + 60,
        "policyVersion": "auth-policy-v1",
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    return f"{encoded}.{signature}"


@pytest.fixture()
def service(tmp_path: Path) -> tuple[ResearchPreflightSnapshotService, MutableHistoricalProvider]:
    provider = MutableHistoricalProvider(frame())
    return (
        ResearchPreflightSnapshotService(
            provider=provider,
            snapshots=SnapshotStore(tmp_path / "snapshots"),
            engine_catalog=ResearchEngineCatalogService(REGISTRY_ROOT),
        ),
        provider,
    )


def error_code(callable_):
    with pytest.raises(ResearchPreflightSnapshotError) as raised:
        callable_()
    return raised.value.code


def test_p08_t01_snapshot_is_content_addressed_and_survives_source_mutation(service) -> None:
    authority, provider = service
    first = authority.build(payload(requested()))
    snapshot_id = first["snapshot"]["snapshot_id"]
    original_hash = first["snapshot"]["market_content_hash"]
    # Simulate a source correction after the preflight. The old frame lives at
    # the snapshot ref; a later preflight receives an explicitly new ref.
    row = provider.frame.index[100]
    provider.frame.loc[row, ["open", "high", "low", "close"]] += 100.0
    second = authority.build(payload(requested()))
    assert second["snapshot"]["snapshot_id"] != snapshot_id
    identity, _, original = authority.snapshots.open(snapshot_id)
    assert identity.snapshot_id == snapshot_id
    assert first["snapshot"]["market_content_hash"] == original_hash
    assert original.loc[original.index[100], "close"] != provider.frame.loc[provider.frame.index[100], "close"]


def test_p08_t02_t03_timezone_half_open_closed_bar_and_warmup(service) -> None:
    authority, provider = service
    result = authority.build(payload(requested()))
    query = provider.calls[-1]
    assert query.start == pd.Timestamp("2026-01-03T00:00:00Z")
    assert query.end_exclusive == pd.Timestamp("2026-01-18T00:00:00Z")
    assert result["snapshot"]["warmup"]["requested_bars"] == 24
    assert result["snapshot"]["closed_bar_policy"] == "CLOSED_BARS_ONLY"
    # UTC-naive crypto, Vietnam-naive and an aware timestamp preserve their
    # intended instant; this utility is shared by every P08 interval.
    assert parse_source_instant("2026-01-01T00:00:00", source_timezone="UTC") == pd.Timestamp("2026-01-01T00:00:00Z")
    assert parse_source_instant("2026-01-01T07:00:00", source_timezone="Asia/Ho_Chi_Minh") == pd.Timestamp("2026-01-01T00:00:00Z")
    assert parse_source_instant("2026-01-01T09:00:00+09:00", source_timezone="UTC") == pd.Timestamp("2026-01-01T00:00:00Z")


def test_p08_t04_required_data_refusals_are_typed(service) -> None:
    authority, _ = service
    assert error_code(lambda: authority.build(payload(requested(), requires_funding=True))) == "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE"
    assert error_code(lambda: authority.build(payload(requested(), required_columns=["open", "funding_rate"]))) == "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE"
    assert error_code(lambda: authority.build(payload(requested(), required_columns=[42]))) == "RESEARCH_PREFLIGHT_INVALID"


def test_p08_seals_only_declared_alpha_columns_after_full_hmd_validation(service) -> None:
    authority, provider = service
    result = authority.build(payload(requested(), required_columns=["close"]))
    # The current approved HMD adapter certifies its full OHLCV hot path, so
    # P08 asks it for that known-safe boundary, then seals only the Alpha's
    # declared input subset. No unused candle columns become worker input.
    assert provider.calls[-1].columns == ("open", "high", "low", "close", "volume")
    _, _, sealed = authority.snapshots.open(result["snapshot"]["snapshot_id"])
    assert list(sealed.columns) == ["close"]
    assert result["snapshot"]["columns"] == ["close"]


def test_p08_t05_t08_t09_t10_t11_manifest_exposes_only_boundaries_and_scope(service) -> None:
    authority, _ = service
    result = authority.build(payload(requested()))
    rendered = str(result)
    assert "points" not in rendered and "100.0" not in rendered
    assert result["topology"]["sealed_holdout"]["evaluation_state"] == "NOT_EVALUATED"
    assert result["resource_estimate"]["scope"] == "per_study_per_fold_per_seed; no product-wide trial claim is implied"
    assert result["effective_spec_digest"] == sha256_json(result["effective_spec"])
    assert result["effective_spec"]["intent"]["kind"] == "NEW"


def test_p08_safe_provenance_has_an_allowlist_and_never_leaks_loader_values(service) -> None:
    authority, provider = service
    provider.metadata["private_dsn"] = "postgres://must-never-reach-browser"
    provider.metadata["access_token"] = "not-a-provenance-fact"
    provider.metadata["oversized_note"] = "x" * 192
    result = authority.build(payload(requested()))
    provenance = result["snapshot"]["provenance"]
    assert provenance["loader_contract"] == "hmd-loader-v1"
    assert "private_dsn" not in provenance
    assert "access_token" not in provenance
    assert "oversized_note" not in provenance


def test_p08_private_response_has_concrete_panel_shapes(service) -> None:
    authority, _ = service
    result = authority.build(payload(requested()))
    assert set(result["snapshot"]["query"]) == {
        "start_utc", "end_exclusive_utc", "start_utc_ms", "end_exclusive_utc_ms"
    }
    assert result["snapshot"]["warmup"]["state"] == "BOUNDARY_ONLY_NOT_FIT"
    assert result["snapshot"]["quality"]["state"] == "SNAPSHOT_INTEGRITY_ONLY"
    assert result["topology"]["folds"][0]["state"] == "BOUNDARY_FIXED_NOT_EVALUATED"
    assert result["topology"]["sealed_holdout"]["snapshot_read_state"] == "OPAQUE_SNAPSHOT_ONLY"
    assert result["resource_estimate"]["admission_state"] == "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING"
    assert result["effective_spec"]["engine"] == result["capability"]
    assert result["effective_spec"]["data_binding"]["closed_bar_policy"] == "CLOSED_BARS_ONLY"


def test_p08_t06_t12_material_digest_and_release_or_route_changes_do_not_reuse_authority(service) -> None:
    authority, _ = service
    base = requested()
    baseline = authority.build(payload(base))
    changed = copy.deepcopy(base)
    changed["random_seed"] = 43
    changed_result = authority.build(payload(changed))
    assert changed_result["requested_spec_digest"] != baseline["requested_spec_digest"]
    assert error_code(lambda: authority.build(payload(requested(engine_release_id="er_quantbt_108")))) == "RESEARCH_PREFLIGHT_RELEASE_STALE"
    route = copy.deepcopy(base)
    route["execution_route"] = "portfolio"
    route["route_params"] = {"portfolio": {"mode": "longshort", "sizing": "equal_weight"}}
    assert error_code(lambda: authority.build(payload(route))) == "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED"


def test_p08_t07_resource_refusal_is_truthful_and_does_not_implicitly_queue(service) -> None:
    authority, _ = service
    before = authority.snapshots.list()
    assert error_code(lambda: authority.build(payload(requested(trials=2_147_483_647)))) == "RESEARCH_PREFLIGHT_RESOURCE_REFUSED"
    # A plainly inadmissible study is refused before snapshot serialization,
    # so a browser retry cannot leave unreferenced immutable frames behind.
    assert authority.snapshots.list() == before


def test_p08_advanced_expanding_plan_is_authoritative_but_rolling_never_invents_width(service) -> None:
    authority, _ = service
    spec = requested()
    spec.pop("windows")
    spec["protocol"] = "advanced"
    spec["walk_forward"] = {
        "start": "2026-01-04T00:00:00",
        "end_exclusive": "2026-01-18T00:00:00",
        "split_mode": "2026-01-06T00:00:00",
        "frequency": "weekly",
        "window_mode": "expanding",
    }
    result = authority.build(payload(spec))
    assert result["topology"]["protocol"] == "advanced_walk_forward"
    assert len(result["topology"]["folds"]) >= 1
    rolling = copy.deepcopy(spec)
    rolling["walk_forward"]["window_mode"] = "rolling"
    assert error_code(lambda: authority.build(payload(rolling))) == "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"


def test_p08_long_advanced_topology_refuses_instead_of_silently_truncating(service) -> None:
    authority, _ = service
    # 129 weekly folds exceeds the explicit P08 metadata ceiling.  The source
    # authority must reject it rather than returning the first 128 as though
    # they described the submitted end boundary.
    long_provider = MutableHistoricalProvider(frame(rows=24 * 1_000))
    long_authority = ResearchPreflightSnapshotService(
        provider=long_provider,
        snapshots=authority.snapshots,
        engine_catalog=authority.engine_catalog,
    )
    spec = requested()
    spec.pop("windows")
    spec["protocol"] = "advanced"
    spec["walk_forward"] = {
        "start": "2026-01-02T00:00:00",
        "end_exclusive": "2028-08-01T00:00:00",
        "split_mode": "2026-01-09T00:00:00",
        "frequency": "weekly",
        "window_mode": "expanding",
    }
    assert error_code(lambda: long_authority.build(payload(spec))) == "RESEARCH_PREFLIGHT_RESOURCE_REFUSED"


@pytest.mark.anyio
async def test_p08_private_route_requires_hmac_and_never_turns_snapshot_metadata_into_browser_raw_data(monkeypatch, tmp_path: Path) -> None:
    secret = "p08-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    provider = MutableHistoricalProvider(frame())
    app.state.research_preflight_snapshot_service = ResearchPreflightSnapshotService(
        provider=provider,
        snapshots=SnapshotStore(tmp_path / "route-snapshots"),
        engine_catalog=ResearchEngineCatalogService(REGISTRY_ROOT),
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            denied = await client.post("/internal/research/preflight-snapshots", json=payload(requested()))
            allowed = await client.post(
                "/internal/research/preflight-snapshots",
                headers={"x-portal-principal": signed_internal_principal(secret)},
                json=payload(requested()),
            )
            public = await client.post(
                "/api/v1/research/preflight-snapshots",
                headers={"x-portal-principal": signed_internal_principal(secret)},
                json=payload(requested()),
            )
            snapshot_id = allowed.json()["snapshot"]["snapshot_id"]
            def raw_frame_open_forbidden(*_args, **_kwargs):
                raise AssertionError("opaque P08 browser denial must not open the raw frame")

            monkeypatch.setattr(app.state.snapshot_store, "open", raw_frame_open_forbidden)
            opaque_quality = await client.get(f"/api/v1/data/snapshots/{snapshot_id}/quality")
            opaque_series = await client.get(f"/api/v1/data/snapshots/{snapshot_id}/series")
            listing = await client.get("/api/v1/data/snapshots")
    finally:
        app.state.run_manager.shutdown()

    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json()["snapshot"]["closed_bar_policy"] == "CLOSED_BARS_ONLY"
    assert "points" not in allowed.text
    assert public.status_code == 404
    # An opaque P08 snapshot ID is provenance metadata, never a capability
    # for legacy public Data Catalog raw/quality routes.  Both denials happen
    # before `SnapshotStore.open()` can read the sealed frame.
    assert opaque_quality.status_code == 404
    assert opaque_series.status_code == 404
    assert snapshot_id not in {item["snapshot_id"] for item in listing.json()["snapshots"]}


@pytest.fixture
def anyio_backend():
    return "asyncio"


def test_rf02_t04_walk_forward_values_come_from_the_published_manifest(tmp_path: Path) -> None:
    """RF02-B2: preflight admits exactly what the Atlas publishes, no more, no less."""

    import shutil

    published = ResearchEngineCatalogService(REGISTRY_ROOT).walk_forward_options()
    assert published.admitted("window_mode") == {"expanding"}
    assert published.admitted("frequency") == {"single", "yearly", "semi_yearly", "quarterly", "monthly", "weekly"}
    rolling = next(item for item in published.window_mode if item.value == "rolling")
    assert rolling.admission == "NOT_ADMITTED" and "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED" in (rolling.reason or "")
    assert published.frequency_default == "quarterly" and published.window_mode_default == "expanding"

    # Withdraw `weekly` in a copy of the manifest: the same spec that passes
    # against the published manifest is now refused, so there is one list.
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    catalog_path = root / "research-engine-catalog.v1.json"
    source = json.loads(catalog_path.read_text(encoding="utf-8"))
    current = next(release for release in source["releases"] if release["role"] == "current")
    for item in current["walk_forward_options"]["frequency"]:
        if item["value"] == "weekly":
            item["admission"] = "NOT_ADMITTED"
            item["reason"] = "withdrawn for this test"
    catalog_path.write_text(json.dumps(source, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    spec = requested()
    spec.pop("windows")
    spec["protocol"] = "advanced"
    spec["walk_forward"] = {
        "start": "2026-01-04T00:00:00",
        "end_exclusive": "2026-01-18T00:00:00",
        "split_mode": "walk_forward_2026-01-06T00:00:00",
        "frequency": "weekly",
        "window_mode": "expanding",
    }
    published_authority = ResearchPreflightSnapshotService(
        provider=MutableHistoricalProvider(frame()),
        snapshots=SnapshotStore(tmp_path / "published"),
        engine_catalog=ResearchEngineCatalogService(REGISTRY_ROOT),
    )
    assert published_authority.build(payload(spec))["topology"]["frequency"] == "weekly"
    withdrawn_authority = ResearchPreflightSnapshotService(
        provider=MutableHistoricalProvider(frame()),
        snapshots=SnapshotStore(tmp_path / "withdrawn"),
        engine_catalog=ResearchEngineCatalogService(root),
    )
    assert error_code(lambda: withdrawn_authority.build(payload(spec))) == "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"
