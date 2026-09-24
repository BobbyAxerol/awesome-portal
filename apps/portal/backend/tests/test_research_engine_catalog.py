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
from quantbt.optimization.config import (
    OptimizationConfig as QuantBTOptimizationConfig,
    SamplerConfig,
)

from golden_fixture import generate_golden_signals, load_golden
from portal_api.adapters.quantbt import (
    PUBLIC_ROUTE_FACTORIES,
    QuantBTGateway,
)
from portal_api.main import create_app
from portal_api.domain.requests import (
    OptimizationConfig as PortalOptimizationConfig,
    ThreeWindowConfig,
)
from portal_api.services.engine_capabilities import installed_dist_info_record_hash
from portal_api.services.research_engine_catalog import (
    FROZEN_CLAIM_IDS,
    FROZEN_EVIDENCE_FIELDS,
    FROZEN_MODE_IDS,
    FROZEN_OPTIMIZER_GROUP_IDS,
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


def test_rf03_current_atlas_fixture_matches_pinned_public_producer() -> None:
    fixture = _load(PORTAL_ROOT.parents[1] / "packages" / "contracts" / "fixtures" / "research-foundation.atlas-current.valid.json")
    assert fixture["schema_version"] == "research.engine-atlas-response.v1"
    assert fixture["selected_release_kind"] == "CURRENT"
    assert fixture["historical_identity"] is None
    assert fixture["atlas"] == _service().public_document().model_dump(mode="json")


def test_p10_atlas_publishes_real_release_defaults_without_widening_fixed_admission() -> None:
    """BR-P10-02: Browser facts are exact, but do not become run authority."""

    current = next(release for release in _service().catalog.releases if release.role == "current")
    assert current.trial_ceiling == 4_000
    assert current.optimizer_defaults is not None
    assert current.submission_constraints is not None
    assert tuple(group.group_id for group in current.optimizer_defaults.groups) == FROZEN_OPTIMIZER_GROUP_IDS

    fields = {
        group.group_id: {field.field_id: field.default_value for field in group.fields}
        for group in current.optimizer_defaults.groups
    }
    # These are the defaults actually declared by the pinned QuantBT / Portal
    # configuration classes. The current P10 producer remains narrower.
    assert fields["study"] == {
        "n_trials": 300,
        "directions": ("maximize",),
        "seed": 42,
        "n_jobs": 1,
        "early_stopping_rounds": None,
        "early_stopping_min_trials": 0,
        "early_stopping_min_delta": 0.0001,
        "show_progress_bar": True,
        "duplicate_policy": "prune",
        "exception_policy": "raise",
    }
    assert fields["sampler"] == {"name": "tpe", "constraint_mode": "sampler"}
    assert fields["objective"] == {
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "optuna_trials": 400,
        "optuna_early_stopping": 200,
        "random_seed": 42,
        "scoring_backend": "endpoint",
        "min_trades_per_year": 100,
        "trade_penalty_factor": 0.5,
        "use_numba": True,
    }
    assert fields["candidate_selection"] == {
        "candidate_selection_metric": "robust_decay",
        "top_is_fraction": 0.1,
        "top_is_k": None,
        "decay_lambda": 0.5,
        "decay_gamma": 0.5,
        "candidate_decay_lambda": None,
        "candidate_decay_gamma": None,
    }
    quantbt = QuantBTOptimizationConfig(study_name="catalog-default-proof")
    sampler = SamplerConfig()
    three_window = ThreeWindowConfig()
    portal_optimization = PortalOptimizationConfig()
    assert fields["study"] == {
        "n_trials": quantbt.n_trials,
        "directions": quantbt.directions,
        "seed": quantbt.seed,
        "n_jobs": quantbt.n_jobs,
        "early_stopping_rounds": quantbt.early_stopping_rounds,
        "early_stopping_min_trials": quantbt.early_stopping_min_trials,
        "early_stopping_min_delta": quantbt.early_stopping_min_delta,
        "show_progress_bar": quantbt.show_progress_bar,
        "duplicate_policy": quantbt.duplicate_policy,
        "exception_policy": quantbt.exception_policy,
    }
    assert fields["sampler"] == {
        "name": sampler.name,
        "constraint_mode": sampler.constraint_mode,
    }
    assert fields["objective"] == {
        "optimization_mode": str(three_window.optimization_mode),
        "optimization_schedule": str(three_window.optimization_schedule),
        "optuna_trials": three_window.optuna_trials,
        "optuna_early_stopping": three_window.optuna_early_stopping,
        "random_seed": three_window.random_seed,
        "scoring_backend": portal_optimization.scoring_backend,
        "min_trades_per_year": portal_optimization.min_trades_per_year,
        "trade_penalty_factor": portal_optimization.trade_penalty_factor,
        "use_numba": portal_optimization.use_numba,
    }
    assert fields["candidate_selection"] == {
        "candidate_selection_metric": portal_optimization.candidate_selection_metric,
        "top_is_fraction": portal_optimization.top_is_fraction,
        "top_is_k": portal_optimization.top_is_k,
        "decay_lambda": portal_optimization.decay_lambda,
        "decay_gamma": portal_optimization.decay_gamma,
        "candidate_decay_lambda": portal_optimization.candidate_decay_lambda,
        "candidate_decay_gamma": portal_optimization.candidate_decay_gamma,
    }
    assert all(
        field.value_source == "RELEASE_DEFAULT" and field.override_state == "LOCKED"
        for group in current.optimizer_defaults.groups
        for field in group.fields
    )
    assert current.submission_constraints.profile_id == "p10.fixed-qualification.v1"
    assert current.submission_constraints.optimization_overrides == "FORBIDDEN"
    assert current.submission_constraints.accepted_trial_count == 1
    assert current.submission_constraints.early_stopping == "MUST_BE_NULL"
    assert current.submission_constraints.random_seed == "MUST_BE_NULL"


def test_p10_atlas_rejects_drift_between_release_ceiling_and_certified_capability(
    tmp_path: Path,
) -> None:
    def mutate(source: dict[str, object]) -> None:
        releases = source["releases"]
        assert isinstance(releases, list)
        current = next(item for item in releases if isinstance(item, dict) and item["role"] == "current")
        current["trial_ceiling"] = 3_999

    with pytest.raises(ResearchEngineCatalogLoadError, match="trial ceiling does not match"):
        ResearchEngineCatalogService(_root(tmp_path, mutate))


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
    schedules = {"global", "per_fold_decay", "per_fold_causal"}
    for mode in service.catalog.modes:
        invalid = {item.schedule for item in mode.invalid_schedules}
        assert set(mode.valid_schedules) | invalid == schedules
        assert not (set(mode.valid_schedules) & invalid)
        assert all(item.admission == "NOT_ADMITTED" and item.reason and item.source for item in mode.invalid_schedules)
        for item in mode.invalid_schedules:
            with pytest.raises(ResearchEngineCatalogError, match="not valid"):
                service.validate_mode_schedule(mode_id=mode.mode_id, schedule=item.schedule)
    mode_one = next(mode for mode in service.catalog.modes if mode.mode_id == "mode_1_decay")
    causal = next(item for item in mode_one.invalid_schedules if item.schedule == "per_fold_causal")
    assert causal.admission == "NOT_ADMITTED"
    assert "inner_split_frequency" in causal.reason
    assert causal.source[0].sha256 == "b3da15189cb87d5e6f0080123aeb7f245b4991d61354112049030335c8f3b256"
    with pytest.raises(ResearchEngineCatalogError, match="not valid"):
        service.validate_mode_schedule(mode_id="mode_1_decay", schedule="per_fold_causal")
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


def _signed_internal_principal(secret: str) -> str:
    import base64
    import hashlib
    import hmac
    import time

    payload = {
        "principalId": "rf01-control-api",
        "username": "rf01-control-api",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": ["portal_session"],
        "sessionId": "rf01-session",
        "mustChangePassword": False,
        "issuedAt": "2026-09-23T00:00:00.000Z",
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


@pytest.mark.anyio
async def test_p04_t08_atlas_is_served_only_through_the_internal_boundary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """P04-T08, amended by RF-01 (B-01).

    The Atlas document stays manifest-driven, safe and read-only, but Python no
    longer answers the public path: Control API's P09 BFF owns
    ``/api/v1/research/quantbt/atlas`` with a wrapped response, and two
    authorities on one path meant a gateway rollback swapped the shape.
    """
    secret = "rf01-internal-secret-with-enough-entropy"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            public = await client.get("/api/v1/research/quantbt/atlas")
            unsigned = await client.get("/internal/research/engine-atlas")
            response = await client.get(
                "/internal/research/engine-atlas",
                headers={"x-portal-principal": _signed_internal_principal(secret)},
            )
            mutation = await client.post(
                "/internal/research/engine-atlas",
                headers={"x-portal-principal": _signed_internal_principal(secret)},
            )
    finally:
        app.state.run_manager.shutdown()

    assert public.status_code == 404
    assert unsigned.status_code == 401
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


# RF02-B1 — Atlas mode facts carry verifiable QuantBT 1.1.1 locators ----------


def _installed_quantbt_file(relative: str) -> Path:
    distribution = importlib.metadata.distribution("quantbt-engine")
    return Path(str(distribution.locate_file(relative)))


def test_rf02_t01_every_mode_fact_locator_matches_the_pinned_package() -> None:
    import base64
    import hashlib

    distribution = importlib.metadata.distribution("quantbt-engine")
    assert distribution.version == "1.1.1"
    record = {entry.split(",")[0]: entry.split(",")[1] for entry in (distribution.read_text("RECORD") or "").splitlines() if entry}
    locators = []
    for mode in _service().catalog.modes:
        facts = mode.facts
        assert facts is not None, mode.mode_id
        assert facts.source_release_id == "er_quantbt_111"
        for fact in facts.schedules:
            locators.extend(fact.source)
            assert fact.cert_cap.source is not None
            locators.append(fact.cert_cap.source)
        for invalid in mode.invalid_schedules:
            locators.extend(invalid.source)
        for group in (facts.objective, facts.reads):
            locators.extend(getattr(group, "source", ()) or ())
        # W4 CG-P04-07: every term meaning and weight cites real engine lines.
        for item in (*facts.objective.terms, *facts.objective.weights):
            locators.extend(item.source)
    # W4 CG-P04-06/07: route engine facts and claim qualifiers are located too.
    for route in _service().catalog.routes:
        assert route.engine_facts is not None, route.route_id
        locators.extend(route.engine_facts.source)
        if route.engine_facts.support_matrix is not None:
            locators.extend(route.engine_facts.support_matrix.source)
        if route.engine_facts.route_params is not None:
            for field in route.engine_facts.route_params.fields:
                locators.extend(field.source)
    for claim in _service().catalog.claims:
        assert claim.qualifier is not None, claim.contract_id
        locators.extend(claim.qualifier.source)
    assert locators
    for locator in locators:
        path = _installed_quantbt_file(locator.path)
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        assert digest == locator.sha256, locator.path
        # The wheel RECORD carries the same digest, urlsafe-base64 without padding.
        expected_record = "sha256=" + base64.urlsafe_b64encode(bytes.fromhex(digest)).decode().rstrip("=")
        assert record[locator.path] == expected_record, locator.path
        first, last = (int(part) for part in locator.lines.split("-"))
        window = "\n".join(content.decode("utf-8").splitlines()[first - 1 : last])
        assert locator.anchor in window, (locator.path, locator.lines, locator.anchor)


def test_rf02_t02_mode_facts_agree_with_the_engine_objects_they_cite() -> None:
    from dataclasses import fields

    from quantbt.core.wfo_contracts import resolve_causality_schedule_v2
    from quantbt.core.wfo_evaluation import WFO_MODE_EVALUATION_MATRIX_V1
    from quantbt.walkforward import WalkForwardConfig

    defaults = {field.name: field.default for field in fields(WalkForwardConfig)}
    for mode in _service().catalog.modes:
        facts = mode.facts
        assert facts is not None
        for fact in facts.schedules:
            resolved = resolve_causality_schedule_v2(
                optimization_schedule=fact.schedule, optimization_mode=mode.mode_id
            )
            assert fact.causality_schedule_v2 == resolved.value, (mode.mode_id, fact.schedule)
        matrix = WFO_MODE_EVALUATION_MATRIX_V1[mode.mode_id]
        assert facts.reads.state == "PUBLISHED"
        assert list(facts.reads.selection_inputs) == list(matrix["selection_inputs"])
        assert facts.reads.retention == matrix["retention"]
        assert facts.objective.state == "PUBLISHED"
        for coefficient in facts.objective.coefficients:
            engine_default = defaults[coefficient.name]
            if coefficient.release_default is None:
                assert engine_default is None, coefficient.name
            else:
                assert float(coefficient.release_default) == engine_default, coefficient.name
        # Nothing the pinned source does not state is filled in.
        assert facts.avoid_when.state == "NOT_PUBLISHED" and facts.avoid_when.reason
        assert all(fact.cert_cap.state == "NOT_PUBLISHED" for fact in facts.schedules)


def test_rf02_t03_facts_must_describe_exactly_the_admitted_schedules(tmp_path: Path) -> None:
    def mutate(source: dict[str, object]) -> None:
        modes = source["modes"]
        assert isinstance(modes, list)
        modes[0]["facts"]["schedules"] = modes[0]["facts"]["schedules"][:1]

    with pytest.raises(ResearchEngineCatalogLoadError):
        ResearchEngineCatalogService(_root(tmp_path, mutate))


def test_rf02_t05_release_config_digest_is_published_and_moves_with_the_facts(tmp_path: Path) -> None:
    """CG-P10-01: the Atlas publishes the digest a New Run form sends back."""

    import hashlib

    document = _service().public_document().model_dump(mode="json")
    current = document["current_release"]
    facts = {
        "release_id": current["release_id"],
        "trial_ceiling": current["trial_ceiling"],
        "optimizer_defaults": current["optimizer_defaults"],
        "submission_constraints": current["submission_constraints"],
        "walk_forward_options": current["walk_forward_options"],
    }
    expected = hashlib.sha256(
        json.dumps(facts, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    # Anyone holding the published facts can recompute it; nothing private is in it.
    assert current["config_digest"] == expected

    def mutate(source: dict[str, object]) -> None:
        releases = source["releases"]
        assert isinstance(releases, list)
        current_release = next(release for release in releases if release["role"] == "current")
        current_release["walk_forward_options"]["frequency_default"] = "monthly"

    moved = ResearchEngineCatalogService(_root(tmp_path, mutate)).public_document()
    assert moved.current_release.config_digest != current["config_digest"]


# W4 CG-P04-04 / 06 / 07 -------------------------------------------------------


def test_w4_cg_p04_04_oos_state_follows_the_engine_schedule_branch(tmp_path: Path) -> None:
    from portal_api.services.research_engine_catalog import expected_oos_use_state

    seen = {}
    for mode in _service().catalog.modes:
        for fact in mode.facts.schedules:
            assert fact.oos_use_state == expected_oos_use_state(
                mode_id=mode.mode_id, schedule=fact.schedule, oos_use=fact.oos_use
            )
            seen[(mode.mode_id, fact.schedule)] = fact.oos_use_state
    assert seen[("mode_1_decay", "per_fold_decay")] == "SELECTION_INPUT"
    assert seen[("mode_1_decay", "global")] == "RETROSPECTIVE"
    assert seen[("mode_2_sbb", "global")] == "REPORT_ONLY"
    assert seen[("mode_4_is_only_robust", "per_fold_causal")] == "WITHHELD_UNTIL_S4"
    assert seen[("mode_5_full_robust", "global")] == "NOT_APPLICABLE"

    def mutate(source: dict[str, object]) -> None:
        modes = source["modes"]
        assert isinstance(modes, list)
        modes[0]["facts"]["schedules"][0]["oos_use_state"] = "WITHHELD_UNTIL_S4"

    with pytest.raises(ResearchEngineCatalogLoadError):
        ResearchEngineCatalogService(_root(tmp_path, mutate))


def test_w4_cg_p04_06_route_facts_agree_with_the_installed_engine() -> None:
    import inspect

    import quantbt
    from quantbt.walkforward import walkforward_support_matrix

    endpoint = quantbt.QuantBTEndpoint
    wfo = {row["target_mode"]: row["status"] for row in walkforward_support_matrix(as_dataframe=False)}
    document = _service().public_document()
    for route in _service().catalog.routes:
        facts = route.engine_facts
        assert facts is not None
        factory, kwargs = PUBLIC_ROUTE_FACTORIES[route.route_id]
        doc = inspect.getdoc(getattr(endpoint, factory)) or ""
        assert facts.description == doc.split("\n\n")[0].replace("\n", " ").strip()
        listed = wfo.get(route.route_id)
        if listed in {"supported", "partial"}:
            assert facts.method == "wfo" and facts.walk_forward_status == listed
        else:
            assert facts.method in {"tape", "single_pass"} and facts.walk_forward_status == "not_listed"
        if facts.resolved_backend.state == "RESOLVED":
            config = getattr(endpoint, factory)(**dict(kwargs)).config
            assert facts.resolved_backend.value == str(config.backend)
            assert facts.resolved_backend.engine_mode == str(config.mode)
        else:
            with pytest.raises(TypeError):
                getattr(endpoint, factory)(**dict(kwargs))
    by_id = {route.route_id: route for route in document.routes}
    arbitrage = by_id["arbitrage"].engine_facts.support_matrix
    engine_matrix = endpoint.arbitrage_support_matrix()
    assert [row.spec_id for row in arbitrage.rows] == list(engine_matrix)
    assert all(row.status == engine_matrix[row.spec_id]["status"] for row in arbitrage.rows)
    assert (arbitrage.executable, arbitrage.total) == (6, 9)
    assert by_id["arbitrage"].status_word == "6/9"
    assert by_id["signal_notional"].status_word == "DEFAULT"
    assert by_id["options"].status_word == "DEFERRED"
    assert by_id["pct_equity"].status_word == "LEGACY"
    # Portal deferral outranks the engine's own "experimental" matrix row.
    assert by_id["nautilus_dca_grid"].status_word == "DEFERRED"
    assert by_id["nautilus_dca_grid"].engine_facts.support_matrix.rows[0].status == "experimental"
    assert by_id["fill_replay"].engine_facts.method == "tape"


def test_w4_cg_p04_06_route_params_publish_the_engine_vocabulary_not_the_draft() -> None:
    from quantbt.core.execution_contract import IntrabarSameBarPolicy
    from quantbt.core.intrabar_reference import IntrabarLevelMode
    from quantbt.core.portfolio import PortfolioMode, PortfolioSizingMode

    by_id = {route.route_id: route for route in _service().catalog.routes}
    fields = {
        (route_id, field.name): field
        for route_id in ("intrabar_bracket", "portfolio", "reactive", "dca_ladder")
        for field in by_id[route_id].engine_facts.route_params.fields
    }
    assert fields[("intrabar_bracket", "level_mode")].engine_values == tuple(item.value for item in IntrabarLevelMode)
    assert fields[("intrabar_bracket", "level_mode")].accepted_by_engine == ()
    assert fields[("intrabar_bracket", "same_bar_policy")].engine_values == tuple(item.value for item in IntrabarSameBarPolicy)
    assert fields[("portfolio", "mode")].engine_values == tuple(item.value for item in PortfolioMode)
    assert fields[("portfolio", "mode")].accepted_by_engine == fields[("portfolio", "mode")].requested_spec_values
    assert fields[("portfolio", "sizing")].engine_values == tuple(item.value for item in PortfolioSizingMode)
    assert fields[("reactive", "runtime")].accepted_by_engine == ("R1", "R2", "R3")
    assert fields[("reactive", "audit_mode")].accepted_by_engine == ()
    # The engine lower-cases reactive runtimes and accepts r1/r2/r3 aliases.
    aliases = {"R1", "R2", "R3"}
    for field in fields.values():
        assert set(field.accepted_by_engine) == set(field.requested_spec_values) & (set(field.engine_values) | aliases)


def test_w4_cg_p04_07_claim_qualifiers_terms_and_weights_are_the_engine_values() -> None:
    from dataclasses import fields

    from quantbt.core.certification import LEVEL_DESCRIPTIONS, CertificationLevel
    from quantbt.walkforward import WalkForwardConfig

    defaults = {field.name: field.default for field in fields(WalkForwardConfig)}
    for claim in _service().catalog.claims:
        level = CertificationLevel(int(claim.engine_certification.removeprefix("L")))
        assert claim.qualifier.level_name == level.name
        assert claim.qualifier.level_description == LEVEL_DESCRIPTIONS[level]
    by_claim = {claim.contract_id: claim.qualifier for claim in _service().catalog.claims}
    # The certifier derives L0 for event_lifecycle_v2: published as a difference, not hidden.
    assert by_claim["event_lifecycle"].result_metadata_derivation == "ENGINE_DERIVES_OTHER_LEVEL"
    assert by_claim["close_target_v2"].result_metadata_derivation == "ENGINE_DERIVES_SAME_LEVEL"
    assert by_claim["reactive"].result_metadata_derivation == "NOT_DERIVABLE"
    for mode in _service().catalog.modes:
        objective = mode.facts.objective
        assert objective.terms, mode.mode_id
        if mode.mode_id != "mode_1_decay":
            assert objective.weights, mode.mode_id
        for weight in objective.weights:
            assert float(weight.release_default) == float(defaults[weight.name]), weight.name
