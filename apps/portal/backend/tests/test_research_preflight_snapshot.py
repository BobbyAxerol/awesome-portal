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
    assert error_code(lambda: authority.build(payload(requested(trials=4001)))) == "RESEARCH_PREFLIGHT_RESOURCE_REFUSED"
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
    # W4 CG-P08-02: rolling is admitted now that the manifest owns the train
    # width (requested-spec v2 walk_forward.train_window); a v1 request that
    # asks for rolling is still refused because it cannot carry a width.
    assert published.admitted("window_mode") == {"expanding", "rolling"}
    assert published.admitted("frequency") == {"single", "yearly", "semi_yearly", "quarterly", "monthly", "weekly"}
    assert published.train_window is not None and published.train_window.required_when == "window_mode=rolling"
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


# W4 · CG-P02-02 / CG-P08-02 / -03 / -05 / -06 --------------------------------


def advanced_spec(*, version: str = "research.requested-spec.v2", **walk_forward: object) -> dict[str, object]:
    spec = requested()
    spec.pop("windows")
    spec["schema_version"] = version
    spec["protocol"] = "advanced"
    spec["walk_forward"] = {
        "start": "2026-01-04T00:00:00",
        "end_exclusive": "2026-01-18T00:00:00",
        "split_mode": "2026-01-06T00:00:00",
        "frequency": "weekly",
        "window_mode": "expanding",
        **walk_forward,
    }
    return spec


def refusal(callable_) -> ResearchPreflightSnapshotError:
    with pytest.raises(ResearchPreflightSnapshotError) as raised:
        callable_()
    return raised.value


def test_w4_invalid_mode_schedule_is_a_typed_refusal_not_a_bare_value_error(service) -> None:
    # Before W4 this escaped as ResearchEngineCatalogError -> private 400 ->
    # a browser 502 "rejected": a declaration mistake reported as an outage.
    authority, _ = service
    spec = requested()
    spec["optimization_mode"] = "mode_2_sbb"
    spec["optimization_schedule"] = "per_fold_causal"
    error = refusal(lambda: authority.build(payload(spec)))
    assert error.code == "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED"
    assert error.field_path == ("optimization_schedule",)


def test_w4_v1_cannot_carry_v2_fields_and_rolling_still_needs_a_width(service) -> None:
    authority, _ = service
    v1 = advanced_spec(version="research.requested-spec.v1", purge_bars=2)
    error = refusal(lambda: authority.build(payload(v1)))
    assert (error.code, error.field_path) == ("RESEARCH_PREFLIGHT_INVALID", ("walk_forward", "purge_bars"))
    rolling_v1 = advanced_spec(version="research.requested-spec.v1", window_mode="rolling")
    assert refusal(lambda: authority.build(payload(rolling_v1))).code == "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED"
    rolling_v2 = advanced_spec(window_mode="rolling")
    error = refusal(lambda: authority.build(payload(rolling_v2)))
    assert (error.code, error.field_path) == ("RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", ("walk_forward", "train_window"))
    expanding_with_width = advanced_spec(train_window="2D")
    assert refusal(lambda: authority.build(payload(expanding_with_width))).field_path == ("walk_forward", "train_window")


def test_w4_v2_rolling_plan_is_built_by_the_engine_with_a_manifest_owned_width(service) -> None:
    authority, _ = service
    result = authority.build(payload(advanced_spec(window_mode="rolling", train_window="2D")))
    topology = result["topology"]
    assert topology["window_mode"] == "rolling"
    assert topology["train_window"] == "2D"
    assert topology["plan_source"] == "quantbt.walkforward.WalkForwardEngine.build_folds"
    folds = topology["folds"]
    assert len(folds) == 2
    # Rolling: the second fold's train starts two days before its OOS.
    assert folds[1]["train"]["start_utc"] == "2026-01-11T00:00:00+00:00"
    assert folds[1]["train"]["bars"] == 48
    assert folds[0]["outer_oos"]["start_utc"] == "2026-01-06T00:00:00+00:00"
    assert result["effective_spec"]["topology"] == topology


def test_w4_v2_temporal_guards_are_published_as_engine_spans(service) -> None:
    authority, _ = service
    result = authority.build(payload(advanced_spec(label_horizon_bars=2, purge_bars=3, embargo_bars=4)))
    topology = result["topology"]
    assert topology["temporal_guards"] == {"label_horizon_bars": 2, "purge_bars": 3, "embargo_bars": 4}
    first = topology["folds"][0]
    assert first["train"]["bars"] == 43  # 48 train bars less 3 purge and 2 label bars
    assert first["guards"]["purge"]["bars"] == 3
    assert first["guards"]["label_horizon"]["bars"] == 2
    assert first["guards"]["embargo"]["bars"] == 4
    # The embargo pushes the next OOS start by four bars.
    assert topology["folds"][1]["outer_oos"]["start_utc"] == "2026-01-13T04:00:00+00:00"
    # Half-open: purge ends where the label horizon begins, which ends at OOS.
    assert first["guards"]["purge"]["end_exclusive_utc_ms"] == first["guards"]["label_horizon"]["start_utc_ms"]
    assert first["guards"]["label_horizon"]["end_exclusive_utc_ms"] == first["outer_oos"]["start_utc_ms"]


def test_w4_causal_mode_one_needs_inner_folds_and_the_engine_counts_them(service) -> None:
    authority, _ = service
    causal = advanced_spec()
    causal["optimization_schedule"] = "per_fold_causal"
    error = refusal(lambda: authority.build(payload(causal)))
    assert (error.code, error.field_path) == ("RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", ("walk_forward", "inner"))
    v1 = copy.deepcopy(causal)
    v1["schema_version"] = "research.requested-spec.v1"
    assert refusal(lambda: authority.build(payload(v1))).code == "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED"
    causal["walk_forward"]["inner"] = {"split_frequency": "single", "window_mode": "expanding", "train_window": "12h", "min_folds": 1}
    result = authority.build(payload(causal))
    assert [fold["inner_fold_count"] for fold in result["topology"]["folds"]] == [1, 1]
    assert result["topology"]["inner_validation"]["train_window"] == "12h"
    too_many = copy.deepcopy(causal)
    too_many["walk_forward"]["inner"] = {"split_frequency": "weekly", "window_mode": "expanding", "train_window": "1D", "min_folds": 2}
    error = refusal(lambda: authority.build(payload(too_many)))
    assert (error.code, error.field_path) == ("RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", ("walk_forward", "inner"))
    assert "inner_min_folds=2" in str(error)
    decay = advanced_spec(inner={"split_frequency": "single", "window_mode": "expanding", "train_window": "12h", "min_folds": 1})
    assert refusal(lambda: authority.build(payload(decay))).field_path == ("walk_forward", "inner")


def test_w4_v1_plan_and_digest_inputs_are_unchanged(service) -> None:
    authority, _ = service
    result = authority.build(payload(advanced_spec(version="research.requested-spec.v1")))
    topology = result["topology"]
    assert set(topology) == {"protocol", "frequency", "window_mode", "folds", "sealed_holdout", "topology_digest"}
    assert all(set(fold) == {"fold_id", "train", "outer_oos", "state"} for fold in topology["folds"])


def test_w4_sweep_ceiling_is_enforced_server_side_with_its_field_path(service) -> None:
    authority, _ = service
    limits = authority.engine_catalog.preflight_limits()
    assert limits.sweep_dimension_ceiling.value == 8
    error = refusal(lambda: authority.build(payload(requested(), swept_dimensions=9)))
    assert (error.code, error.field_path, error.gate) == (
        "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", ("parameter_space_overrides",), "sweep_ceiling"
    )
    result = authority.build(payload(requested(), swept_dimensions=8))
    assert result["resource_estimate"]["ceilings"] == {
        "trial_ceiling": 4000,
        "sweep_dimension_ceiling": 8,
        "swept_dimensions": 8,
        "outer_fold_ceiling": 128,
        "estimated_cpu_seconds_ceiling": 86400,
    }


def test_w4_published_bounds_are_the_ones_p08_applies() -> None:
    from portal_api.services.research_preflight_snapshot import PREFLIGHT_MAXIMUM_FOLD_ROWS

    limits = ResearchEngineCatalogService(REGISTRY_ROOT).preflight_limits()
    assert limits.outer_fold_ceiling.value == PREFLIGHT_MAXIMUM_FOLD_ROWS
    assert limits.estimated_cpu_seconds_ceiling.value == 86_400


def test_w4_gap_scan_reads_timestamps_only_and_never_scans_the_seal(tmp_path: Path) -> None:
    gappy = frame()
    # Drop 3 IS bars and 2 OOS bars.
    drop = [pd.Timestamp(t) for t in (
        "2026-01-05T01:00:00Z", "2026-01-05T02:00:00Z", "2026-01-05T03:00:00Z",
        "2026-01-11T10:00:00Z", "2026-01-12T10:00:00Z",
    )]
    authority = ResearchPreflightSnapshotService(
        provider=MutableHistoricalProvider(gappy.drop(index=drop)),
        snapshots=SnapshotStore(tmp_path / "gappy"),
        engine_catalog=ResearchEngineCatalogService(REGISTRY_ROOT),
    )
    result = authority.build(payload(requested()))
    scan = result["snapshot"]["gap_scan"]
    assert scan["state"] == "SCANNED" and scan["max_gap_ratio"] == 0.05
    rows = {row["window"]: row for row in scan["windows"]}
    assert (rows["IS"]["missing_bars"], rows["IS"]["gap_runs"], rows["IS"]["verdict"]) == (3, 1, "WATCH")
    assert rows["IS"]["items"] == [{"start_utc_ms": int(drop[0].value // 1_000_000), "missing_bars": 3}]
    assert (rows["OOS"]["missing_bars"], rows["OOS"]["gap_runs"]) == (2, 2)
    assert rows["holdout"]["state"] == "SEALED" and rows["holdout"]["missing_bars"] is None
    assert rows["holdout"]["note"] == "sealed — integrity checked at snapshot time, content unread"


def test_w4_holdout_seal_record_is_read_only_and_bound_to_the_snapshot(service) -> None:
    authority, _ = service
    first = authority.build(payload(requested()))
    again = authority.build(payload(requested()))
    seal = first["snapshot"]["holdout_seal"]
    assert seal["seal_digest"] == again["snapshot"]["holdout_seal"]["seal_digest"]
    assert seal["read_log"] == {
        "state": "NO_READER",
        "reads": [],
        "reason": "No Research route or worker reads sealed holdout values; P08 returns boundaries only.",
    }
    assert seal["unlock"]["state"] == "OWNER_SCOPE_REQUIRED" and "DR-01" in seal["unlock"]["reason"]
    assert seal["cap"]["state"] == "NOT_PUBLISHED"
    # The seal lives beside the topology: the v1 topology digest input is unchanged.
    assert "seal" not in first["topology"]["sealed_holdout"]
    advanced = authority.build(payload(advanced_spec()))
    assert advanced["snapshot"]["holdout_seal"]["state"] == "NOT_DECLARED"


@pytest.mark.anyio
async def test_w4_private_route_refusal_carries_gate_path_and_bounded_message(monkeypatch, tmp_path: Path) -> None:
    secret = "p08-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    app.state.research_preflight_snapshot_service = ResearchPreflightSnapshotService(
        provider=MutableHistoricalProvider(frame()),
        snapshots=SnapshotStore(tmp_path / "route-refusal"),
        engine_catalog=ResearchEngineCatalogService(REGISTRY_ROOT),
    )
    spec = requested()
    spec["optimization_mode"] = "mode_2_sbb"
    spec["optimization_schedule"] = "per_fold_causal"
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            refused = await client.post(
                "/internal/research/preflight-snapshots",
                headers={"x-portal-principal": signed_internal_principal(secret)},
                json=payload(spec, swept_dimensions=0),
            )
    finally:
        app.state.run_manager.shutdown()
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail["code"] == "RESEARCH_PREFLIGHT_SCHEDULE_NOT_ADMITTED"
    assert detail["gate"] == "mode_schedule_admitted"
    assert detail["field_path"] == ["optimization_schedule"]
    assert 0 < len(detail["message"]) <= 400 and "/" not in detail["message"]


def test_w4_refusal_detail_names_gate_and_field_path() -> None:
    from portal_api.services.research_preflight_snapshot import refusal_detail

    explicit = ResearchPreflightSnapshotError(
        "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", "sweep dims 9 > 8", field_path=("parameter_space_overrides",), gate="sweep_ceiling"
    )
    assert refusal_detail(explicit, {}) == {
        "code": "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", "gate": "sweep_ceiling",
        "field_path": ["parameter_space_overrides"], "message": "sweep dims 9 > 8",
    }
    default = ResearchPreflightSnapshotError("RESEARCH_PREFLIGHT_TOPOLOGY_INVALID", "bad")
    assert refusal_detail(default, {"protocol": "three_window_decay"})["field_path"] == ["windows"]
    assert refusal_detail(default, {"protocol": "advanced"})["field_path"] == ["walk_forward"]


# W4 · CG-P08-04 research dataset catalog -------------------------------------


def _hmd_provider(storage: Path):
    from portal_api.adapters.market_data import HistoricalDataRuntime, HistoricalMarketDataProvider

    runtime = HistoricalDataRuntime(
        storage_root=storage, reader_version="test", loader_contract="hmd-loader-v1", manifest_digest="a" * 64,
        environment_id="test", release_commit="0" * 40, release_tag="test", dataset_release_id="binance_perpetual_spot_quarterly",
        loader_class=object,
    )
    return HistoricalMarketDataProvider(runtime=runtime)


def test_w4_dataset_catalog_lists_symbols_and_month_coverage_from_names_only(tmp_path: Path) -> None:
    from portal_api.services.research_dataset_catalog import build_research_dataset_catalog

    root = tmp_path / "storage" / "crypto" / "binance_futures" / "1m"
    for symbol, months in {"BTCUSDT": [(2024, 11), (2024, 12), (2025, 1)], "BTCUSDT_250328": [(2025, 1)], "ETHUSDT": []}.items():
        base = root / f"symbol={symbol}"
        base.mkdir(parents=True)
        for year, month in months:
            (base / f"year={year}" / f"month={month:02d}").mkdir(parents=True)
    # A data file must never be opened: an unreadable one proves it.
    part = root / "symbol=BTCUSDT" / "year=2024" / "month=11" / "part.parquet"
    part.write_bytes(b"not parquet")
    part.chmod(0)
    catalog = build_research_dataset_catalog(_hmd_provider(tmp_path / "storage"))
    part.chmod(0o600)
    assert catalog["schema_version"] == "research.dataset-catalog.v1"
    (dataset,) = catalog["datasets"]
    assert dataset["dataset_id"] == "crypto-binance-1m" and dataset["calendar_policy"] == "CRYPTO_24_7"
    assert "1h" in dataset["timeframes"]
    assert "1d" in dataset["timeframes"] and "1D" not in dataset["timeframes"]
    symbols = {row["symbol"]: row for row in dataset["symbols"]["items"]}
    assert dataset["symbols"]["state"] == "PUBLISHED" and dataset["symbols"]["total"] == 3
    assert symbols["BTCUSDT"] == {
        "symbol": "BTCUSDT", "contract_kind": "PERPETUAL",
        "coverage": {"first_month": "2024-11", "last_month": "2025-01", "months": 3, "granularity": "MONTH_PARTITION"},
    }
    assert symbols["BTCUSDT_250328"]["contract_kind"] == "QUARTERLY"
    assert symbols["ETHUSDT"]["coverage"] is None
    assert str(tmp_path) not in json.dumps(catalog)


def test_research_catalog_day_token_is_the_same_fixed_interval_as_hmd() -> None:
    from portal_api.services.research_preflight_snapshot import _timeframe_delta

    assert _timeframe_delta("1d") == _timeframe_delta("1D") == pd.Timedelta(days=1)


def test_w4_dataset_catalog_says_not_published_rather_than_inventing_symbols(service) -> None:
    from portal_api.adapters.market_data import UnavailableHistoricalMarketDataProvider
    from portal_api.services.research_dataset_catalog import build_research_dataset_catalog

    authority, provider = service
    (dataset,) = build_research_dataset_catalog(provider)["datasets"]
    assert dataset["symbols"] == {
        "state": "NOT_PUBLISHED",
        "reason": "This source answers any symbol by query and publishes no symbol list.",
        "items": [], "total": None, "truncated": False,
    }
    (unavailable,) = build_research_dataset_catalog(UnavailableHistoricalMarketDataProvider("mount missing"))["datasets"]
    assert unavailable["availability"] == "unavailable" and unavailable["unavailable_reason"] == "mount missing"
    assert unavailable["symbols"]["state"] == "NOT_PUBLISHED"


@pytest.mark.anyio
async def test_w4_dataset_catalog_private_route_requires_hmac(monkeypatch) -> None:
    secret = "p08-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    app.state.market_data_provider = MutableHistoricalProvider(frame())
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get("/internal/research/datasets")
            allowed = await client.get(
                "/internal/research/datasets", headers={"x-portal-principal": signed_internal_principal(secret)}
            )
    finally:
        app.state.run_manager.shutdown()
    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json()["datasets"][0]["dataset_id"] == "crypto-binance-1m"
