"""Research preview only: the long Delta WFO (PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO).

Bobby 2026-09-30: on a PORTAL_ENV=local preview the worker runs the admitted
2..400 trial count under 1800/3600 s child limits and retains more than the
RS-02 lane's usual 64 TRIAL rows. Off, every bound is the locked W1 profile.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PREVIEW_LONG_FLAG,
    DELTA_WFO_PROFILE_DIGEST,
    DeltaWfoPreviewLongMisconfigured,
    delta_wfo_admitted_trials,
    delta_wfo_child_cpu_seconds,
    delta_wfo_preview_long_enabled,
)
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter,
    CurrentSourceArtifactError,
    signal_notional_current_source_admission,
)
from portal_api.services.durable_runs import AttemptRegistry
from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.job_broker import InMemoryJobBroker
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_supervisor import (
    DELTA_WFO_CHILD_LIMITS,
    DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS,
    DeltaWfoChildReceipt,
    ResearchSupervisorError,
)
from portal_api.workers import research_child
import portal_api.workers.durable_worker as durable_worker_module
from portal_api.workers.durable_worker import DurableQuantWorker
from test_research_delta_wfo import _AcceptingRelay, _enable_wfo, _wfo_executor
from test_research_run_producer import _snapshot
from wfo_test_support import FakeControlApi, wfo_request


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def preview_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(DELTA_WFO_PREVIEW_LONG_FLAG, raising=False)


@pytest.fixture
def preview_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")


def _spec(trials: object) -> dict[str, object]:
    return {"optuna_trials": trials}


def test_flag_is_off_by_default_and_refused_outside_local(monkeypatch: pytest.MonkeyPatch) -> None:
    assert delta_wfo_preview_long_enabled({}) is False
    assert delta_wfo_preview_long_enabled({DELTA_WFO_PREVIEW_LONG_FLAG: "false", "PORTAL_ENV": "local"}) is False
    assert delta_wfo_preview_long_enabled({DELTA_WFO_PREVIEW_LONG_FLAG: "true", "PORTAL_ENV": "local"}) is True
    for env in ({}, {"PORTAL_ENV": "research"}, {"PORTAL_ENV": "live"}):
        with pytest.raises(DeltaWfoPreviewLongMisconfigured, match="only allowed with PORTAL_ENV=local"):
            delta_wfo_preview_long_enabled({DELTA_WFO_PREVIEW_LONG_FLAG: "true", **env})


def test_admitted_trials_and_cpu_cap(preview_off: None, monkeypatch: pytest.MonkeyPatch) -> None:
    # Off: the locked 3 and 120 s, whatever the spec carries.
    assert delta_wfo_admitted_trials(_spec(400)) == 3
    assert delta_wfo_child_cpu_seconds() == 120
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    assert delta_wfo_admitted_trials(_spec(400)) == 400
    assert delta_wfo_admitted_trials(_spec(2)) == 2
    assert delta_wfo_child_cpu_seconds() == 1800
    for bad in (1, 401, True, "400", None):
        with pytest.raises(ValueError, match="2 to 400 Optuna trials"):
            delta_wfo_admitted_trials(_spec(bad))


def test_preview_child_limits_validate_only_with_the_flag(preview_off: None, monkeypatch: pytest.MonkeyPatch) -> None:
    assert (DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS.cpu_seconds, DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS.wall_seconds) == (1800, 3600)
    DELTA_WFO_CHILD_LIMITS.validate()
    with pytest.raises(ResearchSupervisorError, match="outside P06's bounded child range"):
        DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS.validate()
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS.validate()
    DELTA_WFO_CHILD_LIMITS.validate()


def _receipt(**overrides: object) -> DeltaWfoChildReceipt:
    values: dict[str, object] = {
        "job_id": "rjob_p", "run_id": "rrun_p", "worker_attempt_id": "rwa_p", "lease_epoch": 1,
        "market_path": Path("/tmp/m.parquet"), "artifact_root": Path("/tmp/a"),
        "execution_profile_id": "p10.delta-signal-notional-wfo.v1", "execution_profile_digest": DELTA_WFO_PROFILE_DIGEST,
        "dataset_id": "d", "symbol": "BTCUSDT", "data_start_utc_ms": 1, "data_end_exclusive_utc_ms": 3,
        "first_oos_utc_ms": 2,
    }
    values.update(overrides)
    return DeltaWfoChildReceipt(**values)  # type: ignore[arg-type]


def test_child_receipt_carries_a_trial_count_only_when_the_parent_sets_one() -> None:
    assert "optuna_trials" not in _receipt().as_payload(output_root=Path("/tmp/o"))
    assert _receipt(optuna_trials=400).as_payload(output_root=Path("/tmp/o"))["optuna_trials"] == 400
    for bad in (1, 401):
        with pytest.raises(ResearchSupervisorError, match="bounded trial count"):
            _receipt(optuna_trials=bad).as_payload(output_root=Path("/tmp/o"))
    with pytest.raises(ResearchSupervisorError, match="bounded trial count"):
        _receipt(
            optuna_trials=5, task="P16_DELTA_WHATIF_GRID", whatif_grid_key="g",
            whatif_evaluations=({"evaluation_key": "e", "parameters": {}},),
        ).as_payload(output_root=Path("/tmp/o"))


def test_child_runs_the_receipt_trial_count_within_bounds(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    seen: list[int] = []
    monkeypatch.setattr(research_child, "_run_delta_wfo_study", lambda _r, _o, *, optuna_trials: seen.append(optuna_trials) or {})
    base = _receipt().as_payload(output_root=tmp_path)
    research_child._run_p10_delta_wfo(dict(base), tmp_path)
    research_child._run_p10_delta_wfo({**base, "optuna_trials": 400}, tmp_path)
    assert seen == [3, 400]
    for bad in (1, 401, True):
        with pytest.raises(ValueError, match="preview trial count"):
            research_child._run_p10_delta_wfo({**base, "optuna_trials": bad}, tmp_path)


def test_current_source_admission_and_bounds(preview_off: None, monkeypatch: pytest.MonkeyPatch) -> None:
    signal_notional_current_source_admission().validate()
    with pytest.raises(CurrentSourceArtifactError, match="exactly 3 trials"):
        signal_notional_current_source_admission(400)
    rows = lambda count: [{} for _ in range(count)]  # noqa: E731
    bounds = CurrentSourceArtifactAdapter._assert_admitted_output_bounds
    with pytest.raises(CurrentSourceArtifactError, match=r"trials relation must contain 2\.\.64 rows; received 65"):
        bounds(observations=rows(1), folds=rows(2), trials=rows(65), candidates=rows(1), selection=rows(1))
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    admission = signal_notional_current_source_admission(400)
    admission.validate()
    assert admission.optuna_trials == 400
    bounds(observations=rows(1), folds=rows(2), trials=rows(400), candidates=rows(40), selection=rows(1))
    with pytest.raises(CurrentSourceArtifactError, match=r"2\.\.400 rows; received 401"):
        bounds(observations=rows(1), folds=rows(2), trials=rows(401), candidates=rows(1), selection=rows(1))
    with pytest.raises(CurrentSourceArtifactError, match=r"candidates relation must contain 1\.\.64"):
        bounds(observations=rows(1), folds=rows(2), trials=rows(400), candidates=rows(65), selection=rows(1))


def test_progress_journal_cpu_cap(preview_off: None, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def journal(root: Path, cap: int) -> ResearchProgressJournal:
        return ResearchProgressJournal(root, run_id="rrun_p", attempt_id="rwa_p", lease_epoch=1, planned_trials=400, cpu_cap_seconds=cap)

    with pytest.raises(ResearchProgressError, match="CPU cap is invalid"):
        journal(tmp_path / "off", 1800)
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    assert journal(tmp_path / "on", 1800).cpu_cap_seconds == 1800


@pytest.mark.anyio
async def test_preview_worker_runs_and_retains_65_trials_under_preview_limits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Real child, real RS-02 export: more trial rows than the locked lane seals."""

    _enable_wfo(monkeypatch)
    monkeypatch.setenv(DELTA_WFO_PREVIEW_LONG_FLAG, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", "preview-long-principal-secret")
    monkeypatch.setattr(
        durable_worker_module.ResearchProgressRelay,
        "from_environment",
        classmethod(lambda _cls, **_kwargs: _AcceptingRelay()),
    )
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    run_id, attempt_id = "rrun_preview_long", "rwa_preview_long"
    payload = wfo_request(
        snapshot_id=identity.snapshot_id,
        snapshot_content_hash=identity.content_hash,
        run_id=run_id,
        job_id="rjob_preview_long",
        worker_attempt_id=attempt_id,
    )
    payload["research"]["requested_spec"]["optuna_trials"] = 65
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    with FakeControlApi() as api:
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
    assert api.operations()[-1] == "current-source/seal"
    seal = api.bodies("current-source/seal")[0]
    assert seal["table_rows"]["TRIAL"] == 65
    journal = ResearchProgressJournal(
        registry.root, run_id=run_id, attempt_id=attempt_id, lease_epoch=1, planned_trials=65, cpu_cap_seconds=1800,
    )
    events = journal.events_after(0)["events"]
    trials = [event["payload"]["trial"] for event in events if event["event_type"] == "trial_completed"]
    assert trials == list(range(1, 66))
    ticks = [event["payload"] for event in events if event["event_type"] == "budget_tick"]
    assert ticks and all(tick["cap"] == "30.000" for tick in ticks)
    completed = events[-1]
    assert completed["event_type"] == "run_completed"
    assert 0 < completed["payload"]["usage"]["cpu_seconds"] <= 1800
    snapshot = journal.snapshot()
    assert snapshot["overall"]["trials_declared"] == 65 and snapshot["overall"]["trials_done"] == 65
