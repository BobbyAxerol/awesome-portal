"""P06 actual PID/network namespace supervisor proof."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from portal_api.services.research_supervisor import (
    IsolatedResearchSupervisor,
    ResearchChildLimits,
    ResearchChildReceipt,
    ResearchSupervisorError,
    _child_resource_exhausted,
)


BACKEND_ROOT = Path(__file__).parents[1]
MARKET_PATH = BACKEND_ROOT / "tests" / "fixtures" / "golden_market.parquet"


@pytest.mark.parametrize("errno", (28, 122))
def test_p23_t03_supervisor_preserves_wrapped_child_storage_failure(errno: int) -> None:
    traceback = (
        f"OSError: [Errno {errno}] No space left on device\n\n"
        "The above exception was the direct cause of the following exception:\n"
        "RuntimeError: walk-forward endpoint scoring failed\n"
    )
    assert _child_resource_exhausted(traceback)
    assert not _child_resource_exhausted("RuntimeError: walk-forward endpoint scoring failed")
    assert not _child_resource_exhausted("OSError: [Errno 5] Input/output error")


def _receipt(tmp_path: Path, suffix: str = "one") -> ResearchChildReceipt:
    return ResearchChildReceipt(
        job_id=f"p06-job-{suffix}",
        run_id=f"p06-run-{suffix}",
        worker_attempt_id=f"p06-worker-{suffix}",
        lease_epoch=1,
        market_path=MARKET_PATH,
        artifact_root=tmp_path / "p05-artifacts",
    )


def test_p06_t05_t08_actual_quantbt_child_is_separate_network_pid_and_resource_bounded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """The P06 child is a process namespace, not `asyncio.to_thread` theatre."""

    monkeypatch.setenv("DATABASE_URL", "postgres://must-not-reach-child")
    observed_child_alive: list[bool] = []
    monkeypatch.setenv("NATS_URL", "nats://must-not-reach-child")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    parent_network_namespace = os.readlink("/proc/self/ns/net")
    result = supervisor.run_p04_delta_qualification(
        _receipt(tmp_path),
        limits=ResearchChildLimits(memory_bytes=4 * 1024 * 1024 * 1024, cpu_seconds=45, wall_seconds=90),
        on_child_alive=lambda: observed_child_alive.append(True),
    )
    assert result.launcher_pid != os.getpid()
    assert result.child_pid != os.getpid()
    assert result.network_namespace != parent_network_namespace
    assert result.engine_version == "1.1.1"
    assert observed_child_alive, "the supervisor must report an actually running child"
    assert result.bars == 500
    assert result.num_trades == 8
    assert result.final_equity == pytest.approx(20_589.74597203475)
    assert result.elapsed_seconds > 0
    assert result.enforced_limits == {
        "address_space_bytes": 4 * 1024 * 1024 * 1024,
        "cpu_seconds": 45,
        "file_bytes": 2 * 1024 * 1024,
        "fd_limit": 128,
        "nproc_limit": 128,
        "scratch_bytes": 64 * 1024 * 1024,
    }
    # The work directory remains forensic-only and bounded; no child keeps a
    # native handle or process after the supervisor returns.
    assert not Path(f"/proc/{result.launcher_pid}").exists()


def test_p06_t06_t08_rejects_unapproved_inputs_and_never_reuses_a_receipt(tmp_path: Path) -> None:
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    receipt = _receipt(tmp_path, "two")
    with pytest.raises(ResearchSupervisorError, match="memory_bytes"):
        supervisor.run_p04_delta_qualification(
            receipt,
            limits=ResearchChildLimits(memory_bytes=1, cpu_seconds=45, wall_seconds=90),
        )
    bad = ResearchChildReceipt(
        job_id="p06-job-bad",
        run_id="p06-run-bad",
        worker_attempt_id="p06-worker-bad",
        lease_epoch=1,
        market_path=Path("/etc/passwd"),
        artifact_root=tmp_path / "p05-artifacts",
    )
    with pytest.raises(ResearchSupervisorError, match="approved Parquet"):
        supervisor.run_p04_delta_qualification(bad)


def test_e16_supervisor_rejects_an_overview_that_does_not_cover_its_source_range() -> None:
    overview = {
        "source_bar_count": 3,
        "emitted_bucket_count": 2,
        "bucket_bars": 2,
        "sampling": "OHLC_BUCKET_V1",
        "envelope": {
            "max_high": "103",
            "max_high_at_utc_ms": 1_725_000_060_000,
            "min_low": "98",
            "min_low_at_utc_ms": 1_725_000_000_000,
        },
        "values": [
            {
                "first_ordinal": 0,
                "last_ordinal": 1,
                "open_utc_ms": 1_725_000_000_000,
                "close_utc_ms": 1_725_000_060_000,
                "open": "100",
                "high": "103",
                "low": "98",
                "close": "102",
                "volume": "25",
                "transitions": 1,
            },
            {
                "first_ordinal": 2,
                "last_ordinal": 2,
                "open_utc_ms": 1_725_000_120_000,
                "close_utc_ms": 1_725_000_120_000,
                "open": "102",
                "high": "102",
                "low": "101",
                "close": "101",
                "volume": None,
                "transitions": 0,
            },
        ],
    }
    evidence = {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {
            "execution_adapter_id": "p04.delta-rsi.v1",
            "engine_version": "1.1.1",
            "emitted_equity_points": 1,
            "source_transform_digest": "a" * 64,
        },
        "direct": {},
        "derived": {},
        "equity_points": [{}],
        "unavailable": {},
        "candle_overview": overview,
    }
    IsolatedResearchSupervisor._validate_evidence_source(evidence)

    invalid = {
        **evidence,
        "candle_overview": {**overview, "source_bar_count": 4},
    }
    with pytest.raises(ResearchSupervisorError, match="source coverage"):
        IsolatedResearchSupervisor._validate_evidence_source(invalid)


def test_p23_terminal_scratch_retirement_is_exact_and_idempotent(tmp_path: Path) -> None:
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    job = tmp_path / "scratch" / "job-one"
    first = job / "attempt-one"
    second = job / "attempt-two"
    first.mkdir(parents=True)
    second.mkdir()
    receipt = first / "receipt.json"
    receipt.write_text(
        '{"job_id":"job-one","run_id":"run-one","worker_attempt_id":"attempt-one","lease_epoch":1}',
        encoding="utf-8",
    )
    (first / "stderr.log").write_text("private child log", encoding="utf-8")
    with pytest.raises(ResearchSupervisorError, match="identity changed"):
        supervisor.retire_terminal_scratch(
            job_id="job-one", run_id="run-other", worker_attempt_id="attempt-one", lease_epoch=1,
        )
    assert first.exists() and second.exists()
    assert supervisor.retire_terminal_scratch(
        job_id="job-one", run_id="run-one", worker_attempt_id="attempt-one", lease_epoch=1,
    )
    assert not first.exists() and second.exists()
    assert not supervisor.retire_terminal_scratch(
        job_id="job-one", run_id="run-one", worker_attempt_id="attempt-one", lease_epoch=1,
    )


def test_p23_terminal_scratch_retirement_refuses_symlink(tmp_path: Path) -> None:
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=MARKET_PATH.parent)
    unrelated = tmp_path / "unrelated"
    unrelated.mkdir()
    (unrelated / "receipt.json").write_text("{}", encoding="utf-8")
    job = tmp_path / "scratch" / "job-one"
    job.mkdir()
    (job / "attempt-one").symlink_to(unrelated, target_is_directory=True)
    with pytest.raises(ResearchSupervisorError, match="not a directory"):
        supervisor.retire_terminal_scratch(
            job_id="job-one", run_id="run-one", worker_attempt_id="attempt-one", lease_epoch=1,
        )
    assert (unrelated / "receipt.json").is_file()
