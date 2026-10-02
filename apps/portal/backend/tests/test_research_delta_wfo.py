"""W1 rows C/D/E/F/G: Delta signal-notional WFO through P10 → P06 → P05.

Real children only: the supervisor and producer tests run the namespace-
isolated QuantBT child on the golden tape (1h, 2024-01-01..01-21, first OOS
2024-01-08, weekly expanding → 2 folds, 3 trials).
"""

from __future__ import annotations

import asyncio

import copy
import hashlib
import json
import os
import threading
from pathlib import Path

import pytest
from pydantic import ValidationError

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PROFILE,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
    delta_wfo_profile,
    delta_wfo_profile_digest,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.durable_runs import AttemptRegistry
from portal_api.services.job_broker import InMemoryJobBroker
from portal_api.services.research_preflight_snapshot import canonical_json
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_run_producer import (
    WFO_SOURCE_DIRNAME,
    ResearchRunProducerError,
    ResearchRunProducerExecutor,
)
from portal_api.services.research_supervisor import (
    DELTA_WFO_CHILD_LIMITS,
    DeltaWfoChildReceipt,
    IsolatedResearchSupervisor,
    ResearchChildLimits,
    ResearchSupervisorError,
)
from portal_api.workers import research_child
import portal_api.workers.durable_worker as durable_worker_module
from portal_api.workers.durable_worker import DurableQuantWorker
from test_research_run_producer import _request as p04_request, _snapshot
from wfo_test_support import FakeControlApi, wfo_request

BACKEND_ROOT = Path(__file__).parents[1]
MARKET_PATH = BACKEND_ROOT / "tests" / "fixtures" / "golden_market.parquet"
GOLDEN_START_MS = 1_704_067_200_000  # 2024-01-01T00:00Z
GOLDEN_SPLIT_MS = 1_704_672_000_000  # 2024-01-08T00:00Z
GOLDEN_END_MS = 1_705_867_200_000  # 2024-01-21T20:00Z
WFO_FLAGS = (
    "PORTAL_FEATURE_RESEARCH_WFO_PROFILE",
    "PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS",
    "PORTAL_FEATURE_RESEARCH_PROGRESS",
)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# --------------------------------------------------------------------- C: DTO


def test_w1_profile_digest_is_pinned_and_uses_p08_canonical_json() -> None:
    assert DELTA_WFO_PROFILE_DIGEST == "b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca"
    assert hashlib.sha256(canonical_json(delta_wfo_profile()).encode("utf-8")).hexdigest() == DELTA_WFO_PROFILE_DIGEST
    assert delta_wfo_profile_digest() == DELTA_WFO_PROFILE_DIGEST
    drifted = delta_wfo_profile()
    drifted["optuna_trials"] = 4
    assert delta_wfo_profile_digest(drifted) != DELTA_WFO_PROFILE_DIGEST
    assert DELTA_WFO_PROFILE["child_limits"] == {"cpu_seconds": 120, "wall_seconds": 240}


def test_w1_p04_fixture_is_unchanged_and_serializes_byte_identically() -> None:
    payload = copy.deepcopy(p04_request(snapshot_id="dss_" + "0" * 32, snapshot_content_hash="a" * 64))
    parsed = ResearchRunProducerRequest.model_validate(payload)
    assert parsed.research.execution_profile_id == "p04.fixed-qualification.v1"
    assert parsed.research.execution_profile_digest is None
    assert not parsed.research.is_delta_wfo
    dumped = parsed.model_dump(mode="json")
    assert dumped == payload
    assert json.dumps(dumped, sort_keys=True) == json.dumps(payload, sort_keys=True)
    explicit = copy.deepcopy(payload)
    explicit["research"]["execution_profile_id"] = "p04.fixed-qualification.v1"
    assert ResearchRunProducerRequest.model_validate(explicit).model_dump(mode="json") == payload


@pytest.mark.parametrize("mutate, message", [
    (lambda p: p["research"].__setitem__("execution_profile_digest", "0" * 64), "no execution profile digest"),
    (lambda p: p["research"].pop("p04_parameters"), "parameter map"),
    (lambda p: p["research"]["p04_parameters"].__setitem__("window", 33), "P04 profile"),
])
def test_w1_p04_validation_is_unchanged(mutate, message) -> None:
    # Deep copy: the P10 fixture shares its module-level parameter map.
    payload = copy.deepcopy(p04_request(snapshot_id="dss_" + "0" * 32, snapshot_content_hash="a" * 64))
    mutate(payload)
    with pytest.raises(ValidationError, match=message):
        ResearchRunProducerRequest.model_validate(payload)


def test_w1_wfo_profile_is_accepted_exactly() -> None:
    parsed = ResearchRunProducerRequest.model_validate(wfo_request())
    assert parsed.research.is_delta_wfo
    assert parsed.research.p04_parameters is None
    assert parsed.protocol == "advanced"
    dumped = parsed.model_dump(mode="json")
    assert dumped["research"]["execution_profile_id"] == DELTA_WFO_PROFILE_ID
    assert dumped["research"]["execution_profile_digest"] == DELTA_WFO_PROFILE_DIGEST
    assert "p04_parameters" not in dumped["research"]
    assert ResearchRunProducerRequest.model_validate(dumped) == parsed


def _spec(payload: dict) -> dict:
    return payload["research"]["requested_spec"]


@pytest.mark.parametrize("mutate, message", [
    (lambda p: p["research"].__setitem__("execution_profile_digest", "0" * 64), "digest"),
    (lambda p: p["research"].__setitem__("execution_profile_digest", None), "digest"),
    (lambda p: p["research"].__setitem__("execution_profile_id", "p10.other.v1"), "execution_profile_id"),
    (lambda p: p["research"].__setitem__("p04_parameters", {
        "window": 32, "rsi_l": 20, "signalLength": 9, "len_atr1": 10,
        "len_atr2": 42, "rvol": 1.6, "len_vol": 16, "slpercent": 1.3,
    }), "no P04 parameter map"),
    (lambda p: p["research"].__setitem__("adapter_contract_digest", "1" * 64), "adapter contract"),
    (lambda p: _spec(p).__setitem__("protocol", "three_window_decay"), "advanced protocol"),
    (lambda p: _spec(p).__setitem__("optuna_trials", 4), "exactly 3"),
    (lambda p: _spec(p).__setitem__("random_seed", 7), "seed 42"),
    (lambda p: _spec(p).__setitem__("random_seed", None), "seed 42"),
    (lambda p: _spec(p).__setitem__("optimization_schedule", "per_fold_decay"), "mode_1_decay/global"),
    (lambda p: _spec(p).__setitem__("execution_route", "pct_equity"), "signal_notional"),
    (lambda p: _spec(p).pop("walk_forward"), "walk_forward"),
    (lambda p: _spec(p).__setitem__("windows", {}), "three-window"),
    (lambda p: _spec(p)["walk_forward"].__setitem__("frequency", "monthly"), "weekly expanding"),
    (lambda p: _spec(p)["walk_forward"].__setitem__("window_mode", "rolling"), "weekly expanding"),
    (lambda p: _spec(p)["data"].__setitem__("timeframe", "4h"), "1h"),
    (lambda p: _spec(p)["walk_forward"].__setitem__("end_exclusive", "2024-04-03T00:00:00Z"), "92 days"),
    (lambda p: _spec(p)["walk_forward"].__setitem__("split_mode", "2023-12-01"), "strictly inside"),
    (lambda p: _spec(p)["client"].__setitem__("engine_release_id", "er_quantbt_110"), "engine release"),
    (lambda p: p.__setitem__("protocol", "three_window_decay"), "legacy protocol"),
])
def test_w1_wfo_profile_rejects_every_deviation(mutate, message) -> None:
    payload = wfo_request()
    mutate(payload)
    with pytest.raises(ValidationError, match=message):
        ResearchRunProducerRequest.model_validate(payload)


# --------------------------------------------------------------- F: child


@pytest.fixture
def clean_child_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in list(os.environ):
        if name.startswith(research_child._BLOCKED_ENV_PREFIXES):
            monkeypatch.delenv(name)


def _child_receipt(output_root: Path, **overrides) -> dict:
    receipt = DeltaWfoChildReceipt(
        job_id="w1-job",
        run_id="w1-run",
        worker_attempt_id="w1-attempt",
        lease_epoch=1,
        market_path=MARKET_PATH,
        artifact_root=Path("/nonexistent/p05"),
        execution_profile_id=DELTA_WFO_PROFILE_ID,
        execution_profile_digest=DELTA_WFO_PROFILE_DIGEST,
        dataset_id="crypto-binance-1m",
        symbol="BTCUSDT",
        data_start_utc_ms=GOLDEN_START_MS,
        data_end_exclusive_utc_ms=GOLDEN_END_MS,
        first_oos_utc_ms=GOLDEN_SPLIT_MS,
    ).as_payload(output_root=output_root)
    receipt.update(overrides)
    return receipt


def test_w1_child_task_allowlist(tmp_path: Path, clean_child_environment: None) -> None:
    for task in ("GENERIC_PYTHON", "P07_IMPORTED_ALPHA", None):
        with pytest.raises(ValueError, match="not allowlisted"):
            research_child.execute_receipt(
                {"schema_version": "research.p06.child-receipt.v1", "task": task},
                receipt_dir=tmp_path,
            )
    assert research_child._ALLOWED_TASKS == frozenset({"P04_DELTA_SMOKE", "P10_DELTA_WFO", "P16_DELTA_WHATIF_GRID", "P17_IMPORTED_SIGNAL_NOTIONAL"})


def test_w1_child_refuses_output_root_escape(tmp_path: Path, clean_child_environment: None) -> None:
    receipt_dir = tmp_path / "work"
    (receipt_dir / "output").mkdir(parents=True)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    with pytest.raises(ValueError, match="escapes"):
        research_child.execute_receipt(_child_receipt(elsewhere), receipt_dir=receipt_dir)
    with pytest.raises(ValueError, match="escapes"):
        research_child.execute_receipt(_child_receipt(receipt_dir / "output" / ".." / ".." / "elsewhere"), receipt_dir=receipt_dir)
    with pytest.raises(ValueError, match="receipt directory"):
        research_child.execute_receipt(_child_receipt(receipt_dir / "output"), receipt_dir=None)
    link_dir = tmp_path / "linked"
    link_dir.mkdir()
    (link_dir / "output").symlink_to(elsewhere, target_is_directory=True)
    with pytest.raises(ValueError, match="symlink"):
        research_child.execute_receipt(_child_receipt(link_dir / "output"), receipt_dir=link_dir)
    (receipt_dir / "output" / "stale").write_text("x", encoding="utf-8")
    with pytest.raises(ValueError, match="start empty"):
        research_child.execute_receipt(_child_receipt(receipt_dir / "output"), receipt_dir=receipt_dir)


def test_w1_child_refuses_a_different_profile_digest(tmp_path: Path, clean_child_environment: None) -> None:
    (tmp_path / "output").mkdir()
    with pytest.raises(ValueError, match="digest"):
        research_child.execute_receipt(
            _child_receipt(tmp_path / "output", execution_profile_digest="0" * 64),
            receipt_dir=tmp_path,
        )
    with pytest.raises(ValueError, match="uninstalled"):
        research_child.execute_receipt(
            _child_receipt(tmp_path / "output", execution_profile_id="p04.fixed-qualification.v1"),
            receipt_dir=tmp_path,
        )


# ---------------------------------------------------------- E: supervisor


def test_w1_default_and_wfo_limits() -> None:
    default = ResearchChildLimits()
    assert (default.cpu_seconds, default.wall_seconds, default.scratch_bytes, default.file_bytes) == (
        45, 90, 64 * 1024 * 1024, 2 * 1024 * 1024,
    )
    assert (
        DELTA_WFO_CHILD_LIMITS.cpu_seconds,
        DELTA_WFO_CHILD_LIMITS.wall_seconds,
        DELTA_WFO_CHILD_LIMITS.scratch_bytes,
        DELTA_WFO_CHILD_LIMITS.file_bytes,
        DELTA_WFO_CHILD_LIMITS.memory_bytes,
        DELTA_WFO_CHILD_LIMITS.fd_limit,
    ) == (120, 240, 128 * 1024 * 1024, 16 * 1024 * 1024, default.memory_bytes, default.fd_limit)
    DELTA_WFO_CHILD_LIMITS.validate()


def _golden_wfo_receipt(tmp_path: Path, suffix: str) -> DeltaWfoChildReceipt:
    return DeltaWfoChildReceipt(
        job_id=f"w1-job-{suffix}",
        run_id=f"w1-run-{suffix}",
        worker_attempt_id=f"w1-attempt-{suffix}",
        lease_epoch=1,
        market_path=MARKET_PATH,
        artifact_root=tmp_path / "p05-artifacts",
        execution_profile_id=DELTA_WFO_PROFILE_ID,
        execution_profile_digest=DELTA_WFO_PROFILE_DIGEST,
        dataset_id="crypto-binance-1m",
        symbol="BTCUSDT",
        data_start_utc_ms=GOLDEN_START_MS,
        data_end_exclusive_utc_ms=GOLDEN_END_MS,
        first_oos_utc_ms=GOLDEN_SPLIT_MS,
    )


def test_w1_supervisor_runs_real_wfo_child_under_wfo_limits(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://must-not-reach-child")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    alive: list[bool] = []
    result = supervisor.run_delta_wfo(
        _golden_wfo_receipt(tmp_path, "one"),
        on_child_alive=lambda: alive.append(True),
    )
    assert alive
    assert result.child_pid != os.getpid()
    assert result.network_namespace != os.readlink("/proc/self/ns/net")
    assert result.engine_version == "1.1.1"
    assert result.n_folds == 2
    assert result.trial_rows == 3
    assert result.enforced_limits == {
        "address_space_bytes": 4 * 1024 * 1024 * 1024,
        "cpu_seconds": 120,
        "file_bytes": 16 * 1024 * 1024,
        "fd_limit": 128,
        "nproc_limit": 128,
        "scratch_bytes": 128 * 1024 * 1024,
    }
    assert 0 < result.cpu_seconds < 120
    assert result.elapsed_seconds < 240
    # Output lives on the scratch filesystem beside the receipt, not in tmpfs.
    work = tmp_path / "scratch" / "w1-job-one" / "w1-attempt-one"
    assert result.output_root == work / "output"
    assert (result.output_root / "w1-run-one" / "manifest.json").is_file()
    assert (result.output_root / "w1-run-one" / "wfo" / "trials.parquet").is_file()
    assert 0 < result.output_files <= 64 and 0 < result.output_bytes <= 64 * 1024 * 1024
    manifest = json.loads((result.output_root / "w1-run-one" / "manifest.json").read_text())
    assert manifest["target_mode"] == "signal_notional"
    assert manifest["random_seed"] == 42
    assert not Path(f"/proc/{result.launcher_pid}").exists()


def test_w1_supervisor_refuses_unsafe_output_trees(tmp_path: Path) -> None:
    output = tmp_path / "output"
    run = output / "run-x"
    run.mkdir(parents=True)
    (run / "manifest.json").write_text("{}", encoding="utf-8")
    assert IsolatedResearchSupervisor._validate_output_tree(output, run_id="run-x") == (1, 2)
    (run / "escape").symlink_to("/etc/passwd")
    with pytest.raises(ResearchSupervisorError, match="symlink"):
        IsolatedResearchSupervisor._validate_output_tree(output, run_id="run-x")
    (run / "escape").unlink()
    for index in range(64):
        (run / f"f{index}").write_text("x", encoding="utf-8")
    with pytest.raises(ResearchSupervisorError, match="file budget") as error:
        IsolatedResearchSupervisor._validate_output_tree(output, run_id="run-x")
    assert error.value.code == "RESOURCE_EXCEEDED"
    for index in range(64):
        (run / f"f{index}").unlink()
    with (run / "big.bin").open("wb") as handle:
        handle.truncate(64 * 1024 * 1024 + 1)
    with pytest.raises(ResearchSupervisorError, match="file budget"):
        IsolatedResearchSupervisor._validate_output_tree(output, run_id="run-x")
    (run / "big.bin").unlink()
    (output / "other-run").mkdir()
    with pytest.raises(ResearchSupervisorError, match="one run artifact"):
        IsolatedResearchSupervisor._validate_output_tree(output, run_id="run-x")


# ------------------------------------------------------------ D: producer


def _wfo_executor(tmp_path: Path, snapshots) -> ResearchRunProducerExecutor:
    market_root = tmp_path / "market-scratch"
    market_root.mkdir(mode=0o700, exist_ok=True)
    return ResearchRunProducerExecutor(
        snapshots=snapshots,
        supervisor=IsolatedResearchSupervisor(tmp_path / "child-scratch", allowed_market_root=market_root),
        market_root=market_root,
    )


def _enable_wfo(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in WFO_FLAGS:
        monkeypatch.setenv(name, "true")


def test_w1_producer_flag_off_refuses_before_any_child(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    for name in WFO_FLAGS:
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "true")
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    request = ResearchRunProducerRequest.model_validate(
        wfo_request(snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash)
    )
    with pytest.raises(ResearchRunProducerError, match="not enabled") as error:
        executor._execute_sync(request, tmp_path / "engine")
    assert error.value.code == "CAPABILITY_MISMATCH"
    assert not (tmp_path / "child-scratch").exists() or not list((tmp_path / "child-scratch").iterdir())
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_WFO_PROFILE", "true")
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "false")
    with pytest.raises(ResearchRunProducerError, match="not enabled"):
        executor._execute_sync(request, tmp_path / "engine")


def test_w1_producer_runs_real_wfo_child_and_stages_source(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_wfo(monkeypatch)
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    request = ResearchRunProducerRequest.model_validate(
        wfo_request(snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash)
    )
    journal = ResearchProgressJournal(
        tmp_path / "progress", run_id=request.run_id, attempt_id=request.worker_attempt_id,
        lease_epoch=1, planned_trials=3, cpu_cap_seconds=120,
    )
    engine_root = tmp_path / "engine"
    result = executor._execute_sync(request, engine_root, journal)
    assert result["status"] == "COMPLETED"
    assert result["research_evidence"] is None and result["research_split"] is None
    receipt = result["research_receipt"]
    assert receipt["schema_version"] == "research.p10.delta-wfo-receipt.v1"
    assert receipt["execution_profile_digest"] == DELTA_WFO_PROFILE_DIGEST
    assert receipt["engine"]["n_folds"] == 2 and receipt["engine"]["trial_rows"] == 3
    assert receipt["resource"]["enforced_limits"]["cpu_seconds"] == 120
    assert "p04_parameters" not in receipt
    source = engine_root / WFO_SOURCE_DIRNAME / request.run_id
    assert (source / "manifest.json").is_file() and (source / "wfo" / "folds.parquet").is_file()
    # The child output was copied out and removed from P06 scratch.
    assert not (tmp_path / "child-scratch" / request.job_id / request.worker_attempt_id / "output").exists()
    # The derived tape is removed exactly like the P04 tape (job/attempt dir).
    assert not [path for path in (tmp_path / "market-scratch").rglob("*") if path.is_file()]
    events = journal.events_after(0)["events"]
    ticks = [event["payload"] for event in events if event["event_type"] == "budget_tick"]
    assert ticks[0] == {"used": "0.000", "cap": "2.000", "pct": 0}
    assert ticks[-1]["cap"] == "2.000"
    # CG-P06-02: trials arrive live from the child's Optuna callback, as one
    # global study that names no fold. Folds are claimed only after retention
    # (durable worker), and no segment timestamp is ever invented.
    assert not [event for event in events if event["event_type"] in {"fold_completed", "fold_segment_observed"}]
    trials = [event["payload"] for event in events if event["event_type"] == "trial_completed"]
    assert [trial["trial"] for trial in trials] == [1, 2, 3]
    assert all(trial["study"] == "GLOBAL" and "fold" not in trial for trial in trials)
    assert all(trial["state"] in {"COMPLETE", "PRUNED"} for trial in trials)
    completed = [trial for trial in trials if trial["state"] == "COMPLETE"]
    assert completed and all(trial["objective"] is not None for trial in completed)
    assert trials[-1]["best_objective"] is not None
    # ETA exists while trials remain and is withdrawn once the search is done.
    assert all(isinstance(trial["eta_s"], int) and trial["eta_s"] >= 0 for trial in trials[:-1])
    assert trials[-1]["eta_s"] is None
    assert [trial["overall_pct"] for trial in trials] == [33, 56, 80]
    assert trials[-1]["tqdm_line"].startswith("global study · trial 3/3 · best IS Sharpe ")
    snapshot = journal.snapshot()
    assert snapshot["folds"] == []  # a global study opens no fold row
    assert snapshot["overall"]["trials_done"] == 3 and snapshot["overall"]["eta_s"] is None
    stages = snapshot["stages"]
    assert [stage["state"] for stage in stages] == ["DONE", "DONE", "DONE", "RUNNING", "PENDING"]
    # The WFO receipt's RSS is the child's own high-water mark.
    assert receipt["resource"]["peak_rss_bytes"] > 50 * 1024 * 1024


# -------------------------------------------------------- G: durable worker


class _AcceptingRelay:
    async def flush(self) -> bool:
        return True

    async def run_until(self, stopped) -> None:
        await stopped.wait()


def _journal_events(registry_root: Path, run_id: str, attempt_id: str) -> list[dict]:
    journal = ResearchProgressJournal(
        registry_root, run_id=run_id, attempt_id=attempt_id, lease_epoch=1, planned_trials=3, cpu_cap_seconds=120,
    )
    return journal.events_after(0)["events"]


@pytest.mark.anyio
async def test_w1_worker_retains_before_run_completed_and_claims_three_trials(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_wfo(monkeypatch)
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", "w1-worker-principal-secret")
    monkeypatch.setattr(
        durable_worker_module.ResearchProgressRelay,
        "from_environment",
        classmethod(lambda _cls, **_kwargs: _AcceptingRelay()),
    )
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    run_id, attempt_id = "rrun_w1_worker", "rwa_w1_worker"
    payload = wfo_request(
        snapshot_id=identity.snapshot_id,
        snapshot_content_hash=identity.content_hash,
        run_id=run_id,
        job_id="rjob_w1_worker",
        worker_attempt_id=attempt_id,
    )
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    observed_at_request: list[tuple[str, list[str]]] = []

    def observe(operation: str, _body: dict) -> None:
        events = _journal_events(registry.root, run_id, attempt_id)
        observed_at_request.append((operation, [event["event_type"] for event in events]))

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
    operations = api.operations()
    assert operations[:2] == ["reserve", "seal"]
    source_seal = operations.index("current-source/seal")
    assert set(operations[2:source_seal]) == {"current-source/batches"}
    assert operations[-1] == "child-audit/seal"
    assert operations[source_seal + 1:-1] and set(operations[source_seal + 1:-1]) == {"child-audit/batches"}
    # Every retention request happened before the P11 terminal event and
    # before any fold was claimed. Trials were observed live (CG-P06-02), so
    # all three already existed when retention began.
    for _operation, events in observed_at_request:
        assert "run_completed" not in events
        assert "fold_completed" not in events
        assert events.count("trial_completed") == 3

    events = _journal_events(registry.root, run_id, attempt_id)
    types = [event["event_type"] for event in events]
    assert types.count("trial_completed") == 3
    assert types.count("fold_completed") == 2
    assert "fold_segment_observed" not in types
    assert types.index("run_completed") > max(index for index, kind in enumerate(types) if kind == "trial_completed")
    assert types[-1] == "run_completed"
    trials = [event["payload"] for event in events if event["event_type"] == "trial_completed"]
    assert [trial["trial"] for trial in trials] == [1, 2, 3]  # live once, never re-claimed
    assert trials[-1]["overall_pct"] == 80
    folds = [event["payload"] for event in events if event["event_type"] == "fold_completed"]
    assert [fold["fold"] for fold in folds] == [1, 2]
    selection = folds[0]["selection"]
    assert selection["scope"] == "GLOBAL_STUDY" and all(fold["selection"] == selection for fold in folds)
    assert len(selection["params_digest"]) == 64
    completed = events[-1]["payload"]
    assert set(completed) == {"usage", "handoff_cursor"}  # no P13 evidence / P14 split digest
    assert completed["handoff_cursor"] == {
        "fold": 2, "trial": selection["trial"], "params_digest": selection["params_digest"],
    }
    assert 0 < completed["usage"]["cpu_seconds"] <= 120
    assert completed["usage"]["peak_rss_bytes"] > 0
    assert completed["usage"]["scratch_bytes"] is None and completed["usage"]["fd_peak"] is None
    ticks = [event["payload"] for event in events if event["event_type"] == "budget_tick"]
    assert ticks and all(tick["cap"] == "2.000" for tick in ticks)
    snapshot = ResearchProgressJournal(
        registry.root, run_id=run_id, attempt_id=attempt_id, lease_epoch=1, planned_trials=3, cpu_cap_seconds=120,
    ).snapshot()
    assert snapshot["overall"]["trials_done"] == 3 and snapshot["overall"]["trials_declared"] == 3
    assert [fold["state"] for fold in snapshot["folds"]] == ["DONE", "DONE"]
    assert all(fold["selection"]["state"] == "AVAILABLE" for fold in snapshot["folds"])
    assert snapshot["claim"]["state"] == "NOT_ISSUED"
    assert snapshot["claim"]["text"].startswith("The Delta walk-forward study")
    assert snapshot["claim"]["handoff_cursor"] == completed["handoff_cursor"]
    assert snapshot["overall"]["pct"] == 100 and snapshot["overall"]["eta_s"] is None
    manifest = store.open_bundle(run_id, attempt_id, attempt.artifacts_sha256)
    assert not any(WFO_SOURCE_DIRNAME in name for name in manifest["files"])
    assert "research/p10-receipt.json" in manifest["files"]
    # E15: the WFO lane has five mandatory P11 artifacts. The fixed P04 lane
    # adds evidence-source + split-source and therefore seals the seven rows
    # in the Screen-03 manifest without inventing either source receipt here.
    mandatory = {
        "research/requested-spec.json",
        "research/effective-spec-receipt.json",
        "research/dataset-binding-receipt.json",
        "research/progress-journal.ndjson",
        "research/progress-receipt.json",
    }
    assert mandatory.issubset(manifest["files"])
    artifacts = {row["name"]: row for row in snapshot["artifacts"]}
    assert set(artifacts) == mandatory
    assert all(row["state"] == "SEALED" and len(row["digest"]) == 64 for row in artifacts.values())
    assert not list(store.temp_dir(run_id, attempt_id).iterdir())
    # P23-T02: only the immutable bundle/attempt ledger survives terminal.
    assert not (tmp_path / "child-scratch" / payload["job_id"]).exists()


@pytest.mark.anyio
async def test_w1_worker_flag_off_refuses_wfo_without_executing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("PORTAL_FEATURE_RESEARCH_WFO_PROFILE", raising=False)
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "true")
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "true")
    calls = 0

    async def research_executor(_request_json: dict, _run_id: str, _artifact_root: Path) -> dict:
        nonlocal calls
        calls += 1
        raise AssertionError("a dark WFO lane must not execute")

    registry = AttemptRegistry(tmp_path / "runs")
    broker = InMemoryJobBroker()
    worker = DurableQuantWorker(
        broker=broker, registry=registry,
        artifact_store=ContentAddressedArtifactStore(tmp_path / "artifacts"),
        research_executor=research_executor,
    )
    await worker.start()
    await broker.publish("quant.run.requested.research", {
        "schema_version": "research.run-producer-job.v1",
        "run_id": "rrun_w1_worker",
        "run_attempt_id": "rwa_w1_worker",
        "lease_epoch": 1,
        "request_json": wfo_request(run_id="rrun_w1_worker", worker_attempt_id="rwa_w1_worker"),
    })
    await worker.stop()
    attempt = registry.attempt("rrun_w1_worker", "rwa_w1_worker")
    assert attempt is not None and attempt.status == "FAILED"
    assert attempt.failure_code == "CAPABILITY_MISMATCH"
    assert calls == 0
    assert ("quant.run.failed" in [subject for subject, _ in broker.published])


def test_w1_p11_usage_clamps_to_the_profile_cap(tmp_path: Path) -> None:
    result = {"research_receipt": {"resource": {"cpu_seconds": 130.2, "peak_rss_bytes": 10}}}
    assert DurableQuantWorker._p11_usage(result)["cpu_seconds"] == 45
    assert DurableQuantWorker._p11_usage(result, cpu_cap_seconds=120)["cpu_seconds"] == 120
    p04 = ResearchProgressJournal(tmp_path, run_id="r1", attempt_id="a1", lease_epoch=1)
    p04.emit("run_started")
    with pytest.raises(ResearchProgressError, match="usage"):
        p04.emit("run_completed", {"usage": {"peak_rss_bytes": 0, "cpu_seconds": 100, "scratch_bytes": 0, "fd_peak": 0}})
    # An unmeasured CPU value is null, not above the cap.
    p04.emit("run_failed", {
        "code": "USER_CANCELLED", "message": "cancelled",
        "usage": {"peak_rss_bytes": None, "cpu_seconds": None, "scratch_bytes": None, "fd_peak": None},
    })


@pytest.mark.anyio
async def test_p23_cancel_joins_running_producer_thread_before_terminal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    snapshots, identity = _snapshot(tmp_path)
    executor = _wfo_executor(tmp_path, snapshots)
    started = threading.Event()
    release = threading.Event()

    def pending_child(_self, _request, _root, _journal):
        started.set()
        assert release.wait(timeout=2)
        return {"status": "COMPLETED"}

    monkeypatch.setattr(ResearchRunProducerExecutor, "_execute_sync", pending_child)
    request = wfo_request(snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash)
    task = asyncio.create_task(executor(request, request["run_id"], tmp_path / "engine"))
    assert await asyncio.to_thread(started.wait, 1)
    task.cancel()
    await asyncio.sleep(0.02)
    assert not task.done(), "a cancelled worker must not close its lease while its child still runs"
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await task
