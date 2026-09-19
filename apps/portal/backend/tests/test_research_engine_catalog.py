"""P04 QuantBT 1.1.1 Research Engine Catalog and adapter proof."""

from __future__ import annotations

import importlib
import importlib.metadata
import json
import shutil
from pathlib import Path
from typing import Callable

import httpx
import numpy as np
import pytest
from jsonschema import Draft202012Validator

from golden_fixture import generate_golden_signals, load_golden
from portal_api.adapters.quantbt import (
    PUBLIC_ROUTE_FACTORIES,
    QuantBTGateway,
)
from portal_api.main import create_app
from portal_api.services.engine_capabilities import installed_dist_info_record_hash
from portal_api.services.research_engine_catalog import (
    FROZEN_CLAIM_IDS,
    FROZEN_EVIDENCE_FIELDS,
    FROZEN_MODE_IDS,
    FROZEN_ROUTE_IDS,
    ResearchEngineCatalogError,
    ResearchEngineCatalogLoadError,
    ResearchEngineCatalogService,
    resolve_selection,
)


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
ENGINE_RECORD_SHA256 = "6087fef28710d6d4e5d442a36a57a9e2b0ba8e78f657358563911b86845c835d"
NATIVE_RECORD_SHA256 = "998c19c56c0e7f8f66269fdbf54667575ab6f9ba779ce1711e9e83dd0b1c21f9"


def _load(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    if mutate is not None:
        source = _load(root / "research-engine-catalog.v1.json")
        mutate(source)
        (root / "research-engine-catalog.v1.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return root


def _service(registry_root: Path = REGISTRY_ROOT) -> ResearchEngineCatalogService:
    return ResearchEngineCatalogService(registry_root)


# P04-T01 / T05 / T13 --------------------------------------------------------


def test_p04_t01_release_provenance_current_and_historical_identity() -> None:
    service = _service()
    catalog = service.catalog
    current = next(release for release in catalog.releases if release.role == "current")
    historical = next(
        release for release in catalog.releases if release.role == "historical_reader"
    )

    assert current.release_id == "er_quantbt_111"
    assert current.version == "1.1.1"
    assert current.dist_info_record_sha256 == ENGINE_RECORD_SHA256
    assert current.native_dependency is not None
    assert current.native_dependency.version == "0.4.2"
    assert current.native_dependency.dist_info_record_sha256 == NATIVE_RECORD_SHA256
    assert importlib.metadata.version("quantbt-engine") == current.version
    assert installed_dist_info_record_hash("quantbt-engine") == ENGINE_RECORD_SHA256
    assert importlib.metadata.version("quantbt-native") == "0.4.2"
    assert installed_dist_info_record_hash("quantbt-native") == NATIVE_RECORD_SHA256

    # The legacy identity is evidence for readers, not a second installed
    # package and not a relabeling of the existing artifact contract.
    assert historical.release_id == "er_quantbt_108"
    assert historical.version == "1.0.8"
    document = service.public_document()
    assert document.historical_releases[0].status == "HISTORICAL_IDENTITY_RETAINED"
    assert document.current_release.verified is True
    assert document.evidence_contract.schema_id == "research-run-evidence.v1"
    assert document.evidence_contract.required_fields == FROZEN_EVIDENCE_FIELDS
    assert document.evidence_contract.writer_state == "P05_OWNED_NOT_ACTIVE"


def test_p04_atlas_uses_startup_provenance_observation_not_per_request_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = _service()

    def fail_if_reprobed(*_args: object, **_kwargs: object) -> object:
        raise AssertionError("Atlas requests must not re-hash installed distributions")

    monkeypatch.setattr(service, "_release_runtime", fail_if_reprobed)
    assert service.public_document().current_release.verified is True


# P04-T02 / T06 / T12 --------------------------------------------------------


def test_p04_t02_route_map_is_public_allowlisted_and_reactive_is_not_guessed() -> None:
    gateway = QuantBTGateway()
    service = _service()
    assert tuple(PUBLIC_ROUTE_FACTORIES) == FROZEN_ROUTE_IDS
    assert service.verify_public_route_surface(gateway) == {
        route_id: True for route_id in FROZEN_ROUTE_IDS
    }
    assert PUBLIC_ROUTE_FACTORIES["reactive"] == ("event_driven", {"input_mode": "strategy"})

    endpoint = gateway.route_endpoint(
        "signal_notional", initial_capital=20_000, alloc_per_trade=2_000
    )
    assert endpoint.config.mode == "signal_notional"
    scored = gateway.route_endpoint(
        "signal_notional",
        initial_capital=20_000,
        alloc_per_trade=2_000,
        report_level="score",
    )
    assert scored.config.report_level == "score"
    reactive = gateway.route_endpoint(
        "reactive", initial_capital=20_000, alloc_per_trade=2_000
    )
    assert reactive.config.mode == "native_event_strategy"
    with pytest.raises(ValueError, match="unknown QuantBT public route"):
        gateway.route_endpoint("not_a_route")
    with pytest.raises(ValueError, match="requires input_mode='strategy'"):
        gateway.route_endpoint("reactive", input_mode="orders")


@pytest.mark.parametrize("route_id", FROZEN_ROUTE_IDS)
def test_p04_t02_baseline_admission_never_converts_engine_surface_into_portal_admission(
    route_id: str,
) -> None:
    service = _service()
    route = next(item for item in service.catalog.routes if item.route_id == route_id)
    if route.axes.admission == "P04_BASELINE_ONLY":
        assert service.require_p04_baseline_admission(route_id) is route
    else:
        with pytest.raises(ResearchEngineCatalogError, match="not admitted for P04 baseline"):
            service.require_p04_baseline_admission(route_id)


def test_p04_t06_four_axis_descriptor_never_turns_a_portal_gap_into_engine_refusal() -> None:
    routes = {item.route_id: item for item in _service().catalog.routes}
    assert routes["signal_notional"].axes.integration == "ADAPTER_AVAILABLE"
    assert routes["intrabar_bracket"].axes.engine == "ENGINE_SUPPORTED"
    assert routes["intrabar_bracket"].axes.integration == "INTEGRATION_GAP"
    assert routes["options"].axes.engine == "ENGINE_SUPPORTED"
    assert routes["options"].axes.integration == "DEFERRED_BY_PORTAL"
    assert routes["arbitrage"].axes.engine == "ENGINE_PARTIAL"
    assert all(item.axes.admission != "P04_BASELINE_ONLY" for key, item in routes.items() if key not in {"signal_notional", "pct_equity"})


def test_p04_t08_required_evidence_envelope_is_declared_but_not_prematurely_persisted() -> None:
    source = _load(REGISTRY_ROOT / "research-engine-catalog.v1.json")
    evidence = source["evidence_contract"]
    assert isinstance(evidence, dict)
    assert evidence["schema_id"] == "research-run-evidence.v1"
    assert tuple(evidence["required_fields"]) == FROZEN_EVIDENCE_FIELDS
    assert evidence["writer_state"] == "P05_OWNED_NOT_ACTIVE"
    evidence_schema = _load(
        REGISTRY_ROOT / "schemas" / "research-run-evidence.v1.schema.json"
    )
    Draft202012Validator.check_schema(evidence_schema)
    Draft202012Validator(evidence_schema).validate(
        {
            "schema_version": "research-run-evidence.v1",
            "engine_release_id": "er_quantbt_111",
            "route_id": "signal_notional",
            "effective_spec_digest": "a" * 64,
            "market_data_content_hash": "b" * 64,
            "report_level": "audit",
            "selection_resolution": {
                "selection_state": "NO_SELECTED_CANDIDATE",
                "integrity_state": "COMPLETE",
                "publication_eligible": False,
            },
            "result_summary": {
                "final_equity": "20018.930144723297",
                "total_return_pct": "0.09465072361648709",
                "max_drawdown_pct": "0.16550837121867357",
                "num_trades": 5,
            },
        }
    )


def test_catalog_rejects_route_factory_drift_before_runtime_dispatch(tmp_path: Path) -> None:
    def mutate(source: dict[str, object]) -> None:
        routes = source["routes"]
        assert isinstance(routes, list)
        routes[0]["factory"] = "invented_private_method"

    with pytest.raises(ResearchEngineCatalogLoadError, match="allowlisted public factory"):
        ResearchEngineCatalogService(_root(tmp_path, mutate))


# P04-T03 / T09 ---------------------------------------------------------------


def test_p04_t03_valid_and_invalid_mode_schedule_pairs_are_explicit() -> None:
    service = _service()
    for mode in service.catalog.modes:
        for schedule in mode.valid_schedules:
            assert service.validate_mode_schedule(mode_id=mode.mode_id, schedule=schedule) == mode
    with pytest.raises(ResearchEngineCatalogError, match="not valid"):
        service.validate_mode_schedule(
            mode_id="mode_5_full_robust", schedule="per_fold_causal"
        )
    with pytest.raises(ResearchEngineCatalogError, match="unknown optimization mode"):
        service.validate_mode_schedule(mode_id="mode_99", schedule="global")


def test_p04_t09_optimizer_uses_canonical_fields_and_locks_parallelism() -> None:
    config = QuantBTGateway().build_optimization_config(
        config_fields={
            "study_name": "p04-canonical",
            "n_trials": 4,
            "directions": ["maximize", "minimize"],
            "seed": 42,
            "early_stopping_min_trials": 2,
            "early_stopping_min_delta": 0.01,
            "show_progress_bar": False,
        }
    )
    assert config.study_name == "p04-canonical"
    assert config.directions == ("maximize", "minimize")
    assert config.n_jobs == 1
    with pytest.raises(ValueError, match="canonical 'seed'"):
        QuantBTGateway().build_optimization_config(
            config_fields={"study_name": "p04", "random_seed": 42}
        )
    with pytest.raises(ValueError, match="locked to 1"):
        QuantBTGateway().build_optimization_config(
            config_fields={"study_name": "p04", "n_jobs": 2}
        )
    with pytest.raises(ValueError, match="unsupported optimizer fields"):
        QuantBTGateway().build_optimization_config(
            config_fields={"study_name": "p04", "private_hook": "no"}
        )
    with pytest.raises(ValueError, match="persistent study lifecycle admission"):
        QuantBTGateway().build_optimization_config(
            config_fields={"study_name": "p04", "storage": "sqlite:///unsafe.db"}
        )


# P04-T04 / T10 / T11 --------------------------------------------------------


def test_p04_t04_t10_t11_selection_never_substitutes_best_or_fold_last() -> None:
    no_selection = resolve_selection(
        best_trial_id="trial-best",
        selected_trial_id=None,
        target_kind="global",
        required_artifacts_present=True,
    )
    assert no_selection.best_trial_id == "trial-best"
    assert no_selection.selected_trial_id is None
    assert no_selection.selection_state == "NO_SELECTED_CANDIDATE"
    assert no_selection.integrity_state == "COMPLETE"
    assert no_selection.publication_eligible is False

    missing_artifact = resolve_selection(
        best_trial_id="trial-best",
        selected_trial_id="trial-selected",
        target_kind="per_fold",
        target_trial_refs=("trial-selected", "trial-other"),
        required_artifacts_present=False,
    )
    assert missing_artifact.selection_state == "SELECTED"
    assert missing_artifact.integrity_state == "MISSING_REQUIRED_ARTIFACT"
    assert missing_artifact.publication_eligible is False

    centroid = resolve_selection(
        best_trial_id="trial-best",
        selected_trial_id=None,
        target_kind="centroid",
        target_trial_refs=("trial-a", "trial-b"),
        required_artifacts_present=True,
    )
    assert centroid.target_kind == "centroid"
    assert centroid.selected_trial_id is None
    with pytest.raises(ResearchEngineCatalogError, match="explicit target trial reference"):
        resolve_selection(
            best_trial_id="trial-a",
            selected_trial_id="trial-last-fold",
            target_kind="per_fold",
            target_trial_refs=("trial-first-fold",),
            required_artifacts_present=True,
        )


def test_p04_t13_upgrade_default_is_disclosed_without_relabeling_history() -> None:
    catalog = _service().catalog
    current = next(item for item in catalog.releases if item.role == "current")
    historical = next(item for item in catalog.releases if item.role == "historical_reader")
    routes = {item.route_id: item for item in catalog.routes}

    assert current.release_id == "er_quantbt_111"
    assert routes["signal_notional"].default_for_new_runs is True
    assert routes["pct_equity"].default_for_new_runs is False
    assert historical.release_id == "er_quantbt_108"
    assert historical.version == "1.0.8"
    assert historical.dist_info_record_sha256 != current.dist_info_record_sha256


# P04-T08 / Atlas consumer contract -----------------------------------------


@pytest.mark.anyio
async def test_p04_t08_atlas_endpoint_is_manifest_driven_safe_and_read_only() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/research/quantbt/atlas")
            mutation = await client.post("/api/v1/research/quantbt/atlas")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "research-engine-atlas.v1"
    assert [row["route_id"] for row in payload["routes"]] == list(FROZEN_ROUTE_IDS)
    assert [row["mode_id"] for row in payload["modes"]] == list(FROZEN_MODE_IDS)
    assert [row["contract_id"] for row in payload["claims"]] == list(FROZEN_CLAIM_IDS)
    assert payload["current_release"]["verified"] is True
    encoded = json.dumps(payload)
    assert "dist_info_record_sha256" not in encoded
    assert "wheel_sha256" not in encoded
    assert mutation.status_code == 405


# P04-T07 / P04-T13 Delta direct-to-adapter proof ----------------------------


def test_p04_t07_t13_direct_and_portal_signal_notional_match_on_immutable_delta_fixture() -> None:
    market, _, metadata = load_golden()
    signal = generate_golden_signals(market)["pos_weight"]
    account = {
        "initial_capital": 20_000,
        "leverage": 3,
        "alloc_per_trade": 2_000,
        "fee_rate": 0.0005,
        "use_funding": False,
    }
    gateway = QuantBTGateway()
    # This side of the comparison imports only QuantBT's documented public
    # package surface; the other side goes through Portal's adapter.
    direct = importlib.import_module("quantbt").QuantBTEndpoint.signal_notional(**account)
    portal = gateway.signal_notional_endpoint(**account)
    direct_result = direct.backtest(data=market, signal=signal)
    portal_result = portal.backtest(data=market, signal=signal)

    np.testing.assert_allclose(direct_result.equity.to_numpy(), portal_result.equity.to_numpy())
    assert direct.full_report() == portal.full_report()
    assert direct.full_report()["final_equity"] == pytest.approx(20_589.74597203475)
    assert direct.full_report()["total_return_pct"] == pytest.approx(2.948729860173753)
    assert direct.full_report()["num_trades"] == 8
    assert metadata["kernel_sha256"]
    # The protected strategy input is an approved deterministic technical
    # fixture. This proves adapter parity; it is not labeled as live alpha or
    # external market-data acceptance.
    assert len(market) == 500


@pytest.fixture
def anyio_backend():
    return "asyncio"
