"""W5a A10c: the what-if diagnostic job through the real P06 child.

P16-T06/T07/T12/T13 (worker half): a bounded list of exact configurations is
scored by QuantBT's own objective (enqueued Optuna trials inside the parent's
exact WFO request), the frozen θ* re-scores to exactly the parent's own trial
objective, results are sealed as a P05 WHATIF_GRID before ``run_completed``,
and nothing selects, folds or interpolates.
"""

from __future__ import annotations

import copy
import os
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.domain.research_whatif_profile import (
    WHATIF_PROFILE,
    WHATIF_PROFILE_DIGEST,
    WHATIF_PROFILE_ID,
    whatif_profile_digest,
)
from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.durable_runs import AttemptRegistry
from portal_api.services.job_broker import InMemoryJobBroker
from portal_api.services.research_progress import ResearchProgressJournal
from portal_api.services.research_supervisor import (
    DeltaWfoChildReceipt,
    IsolatedResearchSupervisor,
    ResearchSupervisorError,
)
from portal_api.services.research_whatif_retention import ResearchWhatIfRetentionError, read_whatif_results
import portal_api.workers.durable_worker as durable_worker_module
from portal_api.workers.durable_worker import DurableQuantWorker
from test_research_delta_wfo import (  # type: ignore[import-not-found]
    GOLDEN_END_MS,
    GOLDEN_SPLIT_MS,
    GOLDEN_START_MS,
    MARKET_PATH,
    WFO_FLAGS,
    _AcceptingRelay,
    _golden_wfo_receipt,
    _journal_events,
    _snapshot,
    _wfo_executor,
)
from wfo_test_support import FakeControlApi, wfo_request

WHATIF_FLAGS = (*WFO_FLAGS, "PORTAL_FEATURE_RESEARCH_WHATIF")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _enable(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in WHATIF_FLAGS:
        monkeypatch.setenv(name, "true")


def _text(value: object) -> str:
    from decimal import Decimal

    rendered = format(Decimal(str(value)).normalize(), "f")
    return "0" if rendered in {"-0", "0"} else rendered


def _moved(base: dict[str, str], **changes: str) -> dict[str, str]:
    return {**base, **changes}


def whatif_request(evaluations: list[dict], **overrides) -> dict:
    payload = wfo_request(**overrides)
    research = payload["research"]
    research.update({
        "intent_kind": "DIAGNOSTIC",
        "client_intent_id": "whatif:w5a",
        "execution_profile_id": WHATIF_PROFILE_ID,
        "execution_profile_digest": WHATIF_PROFILE_DIGEST,
        "whatif": {
            "schema_version": "research.whatif-job.v1",
            "parent_run_id": "rrun_w5a_parent",
            "grid_key": "9" * 64,
            "evaluations": evaluations,
        },
    })
    return payload


def _key(index: int) -> str:
    return f"{index:064x}"


def test_whatif_profile_digest_is_pinned_like_its_typescript_twin() -> None:
    assert whatif_profile_digest(WHATIF_PROFILE) == WHATIF_PROFILE_DIGEST
    assert WHATIF_PROFILE_DIGEST == "3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc"
    assert [axis["parameter"] for axis in WHATIF_PROFILE["axes"]] == ["rvol", "slpercent"]
    assert [axis["hifi_name"] for axis in WHATIF_PROFILE["axes"]] == ["entry_z", "atr_mult"]
    assert WHATIF_PROFILE["max_evaluations"] == 81


def test_whatif_request_is_a_diagnostic_and_nothing_else_may_carry_evaluations() -> None:
    base = {"window": "32", "rsi_l": "20", "signalLength": "9", "len_atr1": "10",
            "len_atr2": "42", "rvol": "1.6", "len_vol": "16", "slpercent": "1.3"}
    evaluations = [{"evaluation_key": _key(1), "parameters": base}]
    request = ResearchRunProducerRequest.model_validate(whatif_request(evaluations))
    assert request.research.is_whatif and request.research.whatif is not None
    # A diagnostic cannot claim to be NEW, and a NEW run cannot smuggle evaluations.
    bad = whatif_request(evaluations)
    bad["research"]["intent_kind"] = "NEW"
    with pytest.raises(ValidationError, match="DIAGNOSTIC"):
        ResearchRunProducerRequest.model_validate(bad)
    smuggled = wfo_request()
    smuggled["research"]["whatif"] = whatif_request(evaluations)["research"]["whatif"]
    with pytest.raises(ValidationError, match="only the what-if profile"):
        ResearchRunProducerRequest.model_validate(smuggled)
    # ≤81 evaluations, each key once, exact decimals only.
    with pytest.raises(ValidationError):
        ResearchRunProducerRequest.model_validate(whatif_request([
            {"evaluation_key": _key(index), "parameters": base} for index in range(82)
        ]))
    with pytest.raises(ValidationError, match="exactly once"):
        ResearchRunProducerRequest.model_validate(whatif_request(evaluations * 2))
    with pytest.raises(ValidationError, match="exact decimal"):
        ResearchRunProducerRequest.model_validate(whatif_request([
            {"evaluation_key": _key(1), "parameters": {**base, "rvol": "1e0"}},
        ]))
    wrong_digest = whatif_request(evaluations)
    wrong_digest["research"]["execution_profile_digest"] = "0" * 64
    with pytest.raises(ValidationError, match="digest"):
        ResearchRunProducerRequest.model_validate(wrong_digest)


def test_supervisor_refuses_an_unbounded_whatif_receipt(tmp_path: Path) -> None:
    receipt = DeltaWfoChildReceipt(
        job_id="w5a-job", run_id="w5a-run", worker_attempt_id="w5a-attempt", lease_epoch=1,
        market_path=MARKET_PATH, artifact_root=tmp_path / "p05",
        execution_profile_id=WHATIF_PROFILE_ID, execution_profile_digest=WHATIF_PROFILE_DIGEST,
        dataset_id="crypto-binance-1m", symbol="BTCUSDT",
        data_start_utc_ms=GOLDEN_START_MS, data_end_exclusive_utc_ms=GOLDEN_END_MS, first_oos_utc_ms=GOLDEN_SPLIT_MS,
        task="P16_DELTA_WHATIF_GRID", whatif_grid_key="9" * 64,
        whatif_evaluations=tuple({"evaluation_key": _key(index), "parameters": {}} for index in range(82)),
    )
    with pytest.raises(ResearchSupervisorError, match="bounded evaluation list"):
        receipt.as_payload(output_root=tmp_path / "out")


def test_real_child_rescores_the_frozen_theta_to_the_parents_exact_objective(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """P16-T12/T14: same request, same seed → θ* evaluates to the parent's own trial J."""

    import pandas as pd

    monkeypatch.setenv("DATABASE_URL", "postgres://must-not-reach-child")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    parent = supervisor.run_delta_wfo(_golden_wfo_receipt(tmp_path, "parent"))
    trials = pd.read_parquet(parent.output_root / "w1-run-parent" / "wfo" / "trials.parquet")
    first = trials.iloc[0]
    theta = {name: _text(value) for name, value in json.loads(first["params_json"]).items()}
    parent_objective = _text(first["objective"])

    moved_rvol = _text(round(float(theta["rvol"]) + 0.1, 1)) if float(theta["rvol"]) < 2.5 else _text(round(float(theta["rvol"]) - 0.1, 1))
    moved_sl = _text(round(float(theta["slpercent"]) + 0.1, 1)) if float(theta["slpercent"]) < 2.5 else _text(round(float(theta["slpercent"]) - 0.1, 1))
    evaluations = (
        {"evaluation_key": _key(1), "parameters": theta},
        {"evaluation_key": _key(2), "parameters": _moved(theta, rvol=moved_rvol)},
        {"evaluation_key": _key(3), "parameters": _moved(theta, slpercent=moved_sl)},
    )
    receipt = DeltaWfoChildReceipt(
        job_id="w5a-job", run_id="w5a-run", worker_attempt_id="w5a-attempt", lease_epoch=1,
        market_path=MARKET_PATH, artifact_root=tmp_path / "p05-artifacts",
        execution_profile_id=WHATIF_PROFILE_ID, execution_profile_digest=WHATIF_PROFILE_DIGEST,
        dataset_id="crypto-binance-1m", symbol="BTCUSDT",
        data_start_utc_ms=GOLDEN_START_MS, data_end_exclusive_utc_ms=GOLDEN_END_MS, first_oos_utc_ms=GOLDEN_SPLIT_MS,
        task="P16_DELTA_WHATIF_GRID", whatif_grid_key="9" * 64, whatif_evaluations=evaluations,
    )
    result = supervisor.run_delta_wfo(receipt)
    assert result.trial_rows == 3 and 0 < result.cpu_seconds < 120
    document = json.loads((result.output_root / "w5a-run" / "whatif_results.json").read_text())
    by_key = {entry["evaluation_key"]: entry for entry in document["results"]}
    assert set(by_key) == {_key(1), _key(2), _key(3)}
    # The frozen θ* re-scores to exactly the parent's own trial objective.
    assert by_key[_key(1)]["state"] == "COMPLETE"
    assert by_key[_key(1)]["objective"] == parent_objective
    # The results validate against the admitted job (no extra, none missing).
    clean = read_whatif_results(
        result.output_root / "w5a-run" / "whatif_results.json",
        grid_key="9" * 64,
        evaluation_keys={_key(1), _key(2), _key(3)},
    )
    assert [entry["evaluation_key"] for entry in clean] == sorted(by_key)
    with pytest.raises(ResearchWhatIfRetentionError, match="not admitted|every admitted"):
        read_whatif_results(
            result.output_root / "w5a-run" / "whatif_results.json",
            grid_key="9" * 64,
            evaluation_keys={_key(1), _key(2)},
        )


def test_child_refuses_an_evaluation_outside_its_declaration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://must-not-reach-child")
    theta = {"window": "32", "rsi_l": "20", "signalLength": "9", "len_atr1": "10",
             "len_atr2": "42", "rvol": "9.9", "len_vol": "16", "slpercent": "1.3"}
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    receipt = DeltaWfoChildReceipt(
        job_id="w5a-bad", run_id="w5a-bad-run", worker_attempt_id="w5a-bad-attempt", lease_epoch=1,
        market_path=MARKET_PATH, artifact_root=tmp_path / "p05-artifacts",
        execution_profile_id=WHATIF_PROFILE_ID, execution_profile_digest=WHATIF_PROFILE_DIGEST,
        dataset_id="crypto-binance-1m", symbol="BTCUSDT",
        data_start_utc_ms=GOLDEN_START_MS, data_end_exclusive_utc_ms=GOLDEN_END_MS, first_oos_utc_ms=GOLDEN_SPLIT_MS,
        task="P16_DELTA_WHATIF_GRID", whatif_grid_key="9" * 64,
        whatif_evaluations=({"evaluation_key": _key(1), "parameters": theta},),
    )
    with pytest.raises(ResearchSupervisorError):
        supervisor.run_delta_wfo(receipt)


@pytest.mark.anyio
async def test_worker_seals_the_whatif_grid_before_run_completed_and_never_folds(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """P16-T07/T13 worker half: one bounded job, sealed before its terminal event."""

    _enable(monkeypatch)
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", "w5a-worker-principal-secret")
    monkeypatch.setattr(
        durable_worker_module.ResearchProgressRelay,
        "from_environment",
        classmethod(lambda _cls, **_kwargs: _AcceptingRelay()),
    )
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    theta = {"window": "32", "rsi_l": "20", "signalLength": "9", "len_atr1": "10",
             "len_atr2": "42", "rvol": "1.6", "len_vol": "16", "slpercent": "1.3"}
    evaluations = [
        {"evaluation_key": _key(1), "parameters": theta},
        {"evaluation_key": _key(2), "parameters": _moved(theta, rvol="1.7")},
    ]
    run_id, attempt_id = "rrun_w5a_diag", "rwa_w5a_diag"
    payload = whatif_request(
        evaluations,
        snapshot_id=identity.snapshot_id,
        snapshot_content_hash=identity.content_hash,
        run_id=run_id,
        job_id="rjob_w5a_diag",
        worker_attempt_id=attempt_id,
    )
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    seen: list[tuple[str, list[str]]] = []

    def observe(operation: str, _body: dict) -> None:
        journal = ResearchProgressJournal(
            registry.root, run_id=run_id, attempt_id=attempt_id, lease_epoch=1, planned_trials=2,
            cpu_cap_seconds=120, profile="DELTA_WHATIF",
        )
        seen.append((operation, [event["event_type"] for event in journal.events_after(0)["events"]]))

    with FakeControlApi(on_request=observe) as api:
        monkeypatch.setenv("CONTROL_API_INTERNAL_URL", api.origin)
        worker = DurableQuantWorker(broker=InMemoryJobBroker(), registry=registry, artifact_store=store, research_executor=executor)
        await worker.start()
        await worker._broker.publish("quant.run.requested.research", {
            "schema_version": "research.run-producer-job.v1",
            "run_id": run_id,
            "run_attempt_id": attempt_id,
            "lease_epoch": 1,
            "request_json": payload,
        })
        await worker.stop()
    attempt = registry.attempt(run_id, attempt_id)
    assert attempt is not None and attempt.status == "SUCCEEDED", attempt
    assert api.operations() == ["reserve", "seal", "what-if/seal"]
    for _operation, events in seen:
        assert "run_completed" not in events
    sealed = api.bodies("what-if/seal")[0]
    assert sealed["schema_version"] == "research.whatif-grid-seal.v1"
    assert sealed["grid_key"] == "9" * 64
    assert sorted(entry["evaluation_key"] for entry in sealed["results"]) == [_key(1), _key(2)]
    assert all(entry["state"] in {"COMPLETE", "PRUNED"} for entry in sealed["results"])
    events = _journal_events(registry.root, run_id, attempt_id)
    types = [event["event_type"] for event in events]
    assert types.count("trial_completed") == 2
    assert "fold_completed" not in types  # a diagnostic never selects or folds
    assert types[-1] == "run_completed"
    assert set(events[-1]["payload"]) == {"usage"}  # no hand-off cursor: it froze nothing


@pytest.mark.anyio
async def test_worker_refuses_whatif_while_its_flag_is_dark(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in WFO_FLAGS:
        monkeypatch.setenv(name, "true")
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_WHATIF", "false")
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    theta = {"window": "32", "rsi_l": "20", "signalLength": "9", "len_atr1": "10",
             "len_atr2": "42", "rvol": "1.6", "len_vol": "16", "slpercent": "1.3"}
    payload = whatif_request(
        [{"evaluation_key": _key(1), "parameters": theta}],
        snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash,
        run_id="rrun_w5a_dark", job_id="rjob_w5a_dark", worker_attempt_id="rwa_w5a_dark",
    )
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    worker = DurableQuantWorker(broker=InMemoryJobBroker(), registry=registry, artifact_store=store, research_executor=executor)
    await worker.start()
    await worker._broker.publish("quant.run.requested.research", {
        "schema_version": "research.run-producer-job.v1",
        "run_id": "rrun_w5a_dark",
        "run_attempt_id": "rwa_w5a_dark",
        "lease_epoch": 1,
        "request_json": copy.deepcopy(payload),
    })
    await worker.stop()
    attempt = registry.attempt("rrun_w5a_dark", "rwa_w5a_dark")
    assert attempt is not None and attempt.status == "FAILED"
    assert not (tmp_path / "child-scratch").exists() or not any((tmp_path / "child-scratch").rglob("result.json"))


@pytest.mark.skipif(
    os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1",
)
def test_real_hmd_whatif_grid_through_the_confined_child(tmp_path: Path) -> None:
    """W5a A10c real data: the W1 BTCUSDT span, the full clamped 9x9 grid in one job.

    Measures CPU/wall against the 120 s / 240 s child caps, proves θ*
    re-scores to the parent's own trial objective, and that every admitted
    evaluation is answered exactly once.
    """

    import pandas as pd

    from portal_api.adapters.market_data import (
        CRYPTO_BINANCE_DATASET_ID,
        HistoricalMarketDataProvider,
        MarketDataQuery,
        load_historical_data_runtime,
    )
    from portal_api.domain.research_delta_wfo_profile import DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID
    from portal_api.services.research_supervisor import DELTA_WFO_CHILD_LIMITS

    start, split, end = (pd.Timestamp(value) for value in ("2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z", "2026-07-15T00:00:00Z"))
    ms = lambda value: int(value.value // 1_000_000)  # noqa: E731
    runtime = load_historical_data_runtime(Path(os.environ["HISTORICAL_MARKET_DATA_ROOT"]))
    market = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(MarketDataQuery(
        dataset_id=CRYPTO_BINANCE_DATASET_ID, symbol="BTCUSDT", timeframe="1h", start=start, end_exclusive=end,
    ))
    market_root = tmp_path / "market"
    market_root.mkdir(mode=0o700)
    tape = market_root / "btcusdt_1h.parquet"
    market.frame.to_parquet(tape)
    os.chmod(tape, 0o600)
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=market_root)
    common = dict(
        lease_epoch=1, market_path=tape, artifact_root=tmp_path / "p05", dataset_id=CRYPTO_BINANCE_DATASET_ID, symbol="BTCUSDT",
        data_start_utc_ms=ms(start), data_end_exclusive_utc_ms=ms(end), first_oos_utc_ms=ms(split),
    )
    parent = supervisor.run_delta_wfo(DeltaWfoChildReceipt(
        job_id="w5a-real-parent", run_id="w5a-real-parent", worker_attempt_id="w5a-real-parent-a",
        execution_profile_id=DELTA_WFO_PROFILE_ID, execution_profile_digest=DELTA_WFO_PROFILE_DIGEST, **common,
    ), limits=DELTA_WFO_CHILD_LIMITS)
    trials = pd.read_parquet(parent.output_root / "w5a-real-parent" / "wfo" / "trials.parquet")
    selected = json.loads((parent.output_root / "w5a-real-parent" / "selection" / "selected_params.json").read_text())
    theta = {name: _text(value) for name, value in selected["params"].items()}
    parent_by_params = {
        tuple(sorted((k, _text(v)) for k, v in json.loads(row["params_json"]).items())): _text(row["objective"])
        for row in trials.to_dict(orient="records")
    }
    theta_objective = parent_by_params[tuple(sorted(theta.items()))]

    # The Control API grid: θ* ± 4 declared steps (0.1) on rvol and slpercent, clamped.
    from decimal import Decimal

    def axis(value: str, low: str, high: str) -> list[str]:
        base = Decimal(value)
        return [_text(min(max(base + Decimal(k) * Decimal("0.1"), Decimal(low)), Decimal(high))) for k in range(-4, 5)]

    configs: list[dict[str, str]] = []
    for sl in axis(theta["slpercent"], "0.7", "2.5"):
        for rv in axis(theta["rvol"], "1", "2.5"):
            config = {**theta, "rvol": rv, "slpercent": sl}
            if config not in configs:
                configs.append(config)
    evaluations = tuple({"evaluation_key": _key(index + 1), "parameters": config} for index, config in enumerate(configs))
    result = supervisor.run_delta_wfo(DeltaWfoChildReceipt(
        job_id="w5a-real-grid", run_id="w5a-real-grid", worker_attempt_id="w5a-real-grid-a",
        execution_profile_id=WHATIF_PROFILE_ID, execution_profile_digest=WHATIF_PROFILE_DIGEST,
        task="P16_DELTA_WHATIF_GRID", whatif_grid_key="9" * 64, whatif_evaluations=evaluations, **common,
    ), limits=DELTA_WFO_CHILD_LIMITS)
    document = json.loads((result.output_root / "w5a-real-grid" / "whatif_results.json").read_text())
    by_key = {entry["evaluation_key"]: entry for entry in document["results"]}
    assert set(by_key) == {entry["evaluation_key"] for entry in evaluations}
    theta_key = next(entry["evaluation_key"] for entry in evaluations if entry["parameters"] == theta)
    assert by_key[theta_key]["objective"] == theta_objective
    measured = {
        "theta": theta, "theta_objective": theta_objective, "unique_evaluations": len(evaluations),
        "complete": sum(entry["state"] == "COMPLETE" for entry in by_key.values()),
        "pruned": sum(entry["state"] != "COMPLETE" for entry in by_key.values()),
        "grid_child_cpu_seconds": round(result.cpu_seconds, 3), "grid_child_wall_seconds": round(result.elapsed_seconds, 3),
        "grid_child_peak_rss_bytes": result.peak_rss_bytes, "parent_child_cpu_seconds": round(parent.cpu_seconds, 3),
        "bars": result.bars, "n_folds": result.n_folds,
        "objective_range": [str(min(Decimal(e["objective"]) for e in by_key.values() if e["objective"])), str(max(Decimal(e["objective"]) for e in by_key.values() if e["objective"]))],
    }
    print("\nW5A_REAL_HMD_WHATIF " + json.dumps(measured, sort_keys=True))
    assert result.cpu_seconds < 120 and result.elapsed_seconds < 240


def test_sibling_pins_are_admitted_only_on_the_whatif_axes() -> None:
    """P16-T08/T14: a what-if sibling pins rvol/slpercent on-step; nothing else may be overridden."""

    def with_overrides(overrides: list[dict]) -> dict:
        payload = wfo_request()
        payload["research"]["requested_spec"]["parameter_space_overrides"] = overrides
        return payload

    ResearchRunProducerRequest.model_validate(with_overrides([
        {"name": "rvol", "kind": "pin", "value": 1.4}, {"name": "slpercent", "kind": "pin", "value": 2.3},
    ]))
    for overrides, message in (
        ([{"name": "window", "kind": "pin", "value": 30}], "what-if axes"),
        ([{"name": "rvol", "kind": "pin", "value": 1.45}], "declared step"),
        ([{"name": "rvol", "kind": "sweep", "low": 1.1, "high": 1.3}], "parameter space only"),
    ):
        with pytest.raises(ValidationError, match=message):
            ResearchRunProducerRequest.model_validate(with_overrides(overrides))


def test_real_child_honours_sibling_pins(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace

    import pandas as pd

    monkeypatch.setenv("DATABASE_URL", "postgres://must-not-reach-child")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    base = _golden_wfo_receipt(tmp_path, "sibling")
    result = supervisor.run_delta_wfo(replace(base, pinned_parameters=(("rvol", "1.4"), ("slpercent", "2.3"))))
    trials = pd.read_parquet(result.output_root / "w1-run-sibling" / "wfo" / "trials.parquet")
    for record in trials.to_dict(orient="records"):
        params = json.loads(record["params_json"])
        assert _text(params["rvol"]) == "1.4" and _text(params["slpercent"]) == "2.3"
    with pytest.raises(ResearchSupervisorError, match="pinned"):
        replace(
            base, task="P16_DELTA_WHATIF_GRID", pinned_parameters=(("rvol", "1.4"),), whatif_grid_key="9" * 64,
            whatif_evaluations=({"evaluation_key": _key(1), "parameters": {}},),
        ).as_payload(output_root=tmp_path)
