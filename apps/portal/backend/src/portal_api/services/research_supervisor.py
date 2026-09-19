"""P06 process supervisor for the bounded QuantBT adapter.

The durable scheduler and lease state live in Control API/PostgreSQL.  This
module has no database, NATS, Execution, broker or command authority: it can
only start one allowlisted child from an ID-only launch receipt.  It therefore
cannot become a second scheduler or bypass P05 fencing.
"""

from __future__ import annotations

import json
import os
import resource
import shutil
import signal
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class ResearchSupervisorError(RuntimeError):
    """Typed local supervisor failure; caller maps it to P06 retry policy."""


@dataclass(frozen=True, slots=True)
class ResearchChildLimits:
    # Numba/Arrow reserve virtual address ranges while their resident use is
    # much lower. A 4 GiB address-space ceiling is therefore the smallest
    # reliable P04 QuantBT bound on this pinned runtime; CPU/FD/file/scratch
    # limits still make one child materially bounded on the 32 GiB host.
    memory_bytes: int = 4 * 1024 * 1024 * 1024
    cpu_seconds: int = 45
    scratch_bytes: int = 64 * 1024 * 1024
    file_bytes: int = 2 * 1024 * 1024
    fd_limit: int = 128
    wall_seconds: int = 90

    def validate(self) -> None:
        if not (2 * 1024 * 1024 * 1024 <= self.memory_bytes <= 8 * 1024 * 1024 * 1024):
            raise ResearchSupervisorError("memory_bytes is outside P06's bounded child range")
        if not (1 <= self.cpu_seconds <= 300 and 1 <= self.wall_seconds <= 600):
            raise ResearchSupervisorError("CPU and wall clock limits are outside P06's bounded child range")
        if not (1 * 1024 * 1024 <= self.scratch_bytes <= 512 * 1024 * 1024):
            raise ResearchSupervisorError("scratch_bytes is outside P06's bounded child range")
        if not (64 * 1024 <= self.file_bytes <= 16 * 1024 * 1024 and 32 <= self.fd_limit <= 512):
            raise ResearchSupervisorError("file/FD limits are outside P06's bounded child range")


@dataclass(frozen=True, slots=True)
class ResearchChildReceipt:
    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    artifact_root: Path

    def as_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "research.p06.child-receipt.v1",
            "task": "P04_DELTA_SMOKE",
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            # This is an opaque P05 storage root identity only. The child does
            # not write it in P06; P05 reservation/fence remains the writer.
            "artifact_root": str(self.artifact_root),
        }


@dataclass(frozen=True, slots=True)
class ResearchChildResult:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    engine_version: str
    final_equity: float
    num_trades: int
    bars: int
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]


class IsolatedResearchSupervisor:
    """Start one real namespace-isolated, resource-limited P04 child."""

    _MAX_RESULT_BYTES = 32 * 1024
    _MAX_LOG_BYTES = 16 * 1024

    def __init__(self, scratch_root: Path, *, allowed_market_root: Path) -> None:
        self._scratch_root = scratch_root.resolve()
        self._allowed_market_root = allowed_market_root.resolve(strict=True)
        self._scratch_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._unshare = shutil.which("unshare")
        if self._unshare is None:
            raise ResearchSupervisorError("P06 requires the host unshare utility for a real network namespace")

    @staticmethod
    def _opaque(value: str, label: str) -> None:
        if not value or len(value) > 160 or not value.replace("-", "").replace("_", "").replace(".", "").isalnum():
            raise ResearchSupervisorError(f"{label} is not an opaque bounded identifier")

    def run_p04_delta_qualification(
        self,
        receipt: ResearchChildReceipt,
        *,
        limits: ResearchChildLimits = ResearchChildLimits(),
    ) -> ResearchChildResult:
        limits.validate()
        for label, value in (("job_id", receipt.job_id), ("run_id", receipt.run_id), ("worker_attempt_id", receipt.worker_attempt_id)):
            self._opaque(value, label)
        if receipt.lease_epoch < 1:
            raise ResearchSupervisorError("lease_epoch must be positive")
        market_path = receipt.market_path.resolve(strict=True)
        if market_path.suffix != ".parquet" or not market_path.is_relative_to(self._allowed_market_root):
            raise ResearchSupervisorError("P06 child may read only an approved Parquet market input")
        artifact_root = receipt.artifact_root.resolve()
        if artifact_root.is_relative_to(self._scratch_root):
            raise ResearchSupervisorError("artifact_root must not be a child scratch location")

        work = self._scratch_root / receipt.job_id / receipt.worker_attempt_id
        if work.exists():
            raise ResearchSupervisorError("a P06 scratch receipt may be launched only once")
        work.mkdir(mode=0o700, parents=True)
        (work / "tmp").mkdir(mode=0o700)
        receipt_path = work / "receipt.json"
        result_path = work / "result.json"
        stdout_path = work / "stdout.log"
        stderr_path = work / "stderr.log"
        receipt_path.write_text(json.dumps(receipt.as_payload(), sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
        os.chmod(receipt_path, 0o600)

        project_root = Path(__file__).resolve().parents[3]
        source_root = project_root / "src"
        strategy_root = project_root.parent
        environment = {
            "HOME": str(work),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "PATH": os.defpath,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
            "TMPDIR": str(work / "tmp"),
            "TZ": "UTC",
        }
        # `-I` ignores PYTHONPATH and the user site. The controlled bootstrap
        # adds only this repository's immutable source roots, rather than
        # inheriting a parent interpreter's arbitrary module search path.
        bootstrap = (
            "import resource, runpy, subprocess, sys; "
            # Set NPROC only after `unshare` has established the child user
            # namespace. Applying it in preexec made the fork needed by
            # `unshare -f` count unrelated host processes owned by the test
            # user and could falsely reject a healthy child on a busy host.
            "resource.setrlimit(resource.RLIMIT_NPROC, (128, 128)); "
            # The mount namespace is already private at this point. A tmpfs
            # mounted over the exact per-receipt scratch directory is the
            # aggregate scratch limit, rather than merely a per-file limit.
            "subprocess.run(['mount', '-t', 'tmpfs', '-o', 'size=' + sys.argv[5] + ',mode=0700', 'tmpfs', sys.argv[4]], check=True); "
            "sys.path[:0] = [sys.argv[1], sys.argv[2], sys.argv[3]]; "
            "sys.argv = ['research_child', *sys.argv[6:]]; "
            "runpy.run_module('portal_api.workers.research_child', run_name='__main__')"
        )
        command = [
            self._unshare,
            "-Urnmpf",
            "--mount-proc",
            sys.executable,
            "-I",
            "-c",
            bootstrap,
            str(source_root),
            str(project_root),
            str(strategy_root),
            str(work / "tmp"),
            str(limits.scratch_bytes),
            "--receipt",
            str(receipt_path),
            "--result",
            str(result_path),
        ]
        before = resource.getrusage(resource.RUSAGE_CHILDREN)
        started = time.monotonic()
        with stdout_path.open("xb", buffering=0) as stdout, stderr_path.open("xb", buffering=0) as stderr:
            process = subprocess.Popen(
                command,
                cwd=work,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                start_new_session=True,
                preexec_fn=self._limit_preexec(limits),
            )
            try:
                return_code = process.wait(timeout=limits.wall_seconds)
            except subprocess.TimeoutExpired as error:
                self._kill_process_group(process)
                raise ResearchSupervisorError("P06 child exceeded its wall-clock limit and was killed") from error
        elapsed = time.monotonic() - started
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        if return_code != 0:
            raise ResearchSupervisorError(
                f"P06 child exited {return_code}: {self._read_tail(stderr_path)!r}"
            )
        payload = self._read_result(result_path)
        try:
            child_pid = int(payload["child_pid"])
            network_namespace = str(payload["network_namespace"])
            engine_version = str(payload["engine_version"])
            final_equity = float(payload["final_equity"])
            num_trades = int(payload["num_trades"])
            bars = int(payload["bars"])
            enforced_limits = {str(key): int(value) for key, value in dict(payload["enforced_limits"]).items()}
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
        if payload.get("task") != "P04_DELTA_SMOKE" or payload.get("credential_environment_clean") is not True:
            raise ResearchSupervisorError("P06 child receipt did not prove its required boundary")
        expected_limits = {
            "address_space_bytes": limits.memory_bytes,
            "cpu_seconds": limits.cpu_seconds,
            "file_bytes": limits.file_bytes,
            "fd_limit": limits.fd_limit,
            "nproc_limit": 128,
            "scratch_bytes": limits.scratch_bytes,
        }
        if enforced_limits != expected_limits:
            raise ResearchSupervisorError("P06 child did not retain the exact bounded resource limits")
        return ResearchChildResult(
            launcher_pid=process.pid,
            child_pid=child_pid,
            network_namespace=network_namespace,
            engine_version=engine_version,
            final_equity=final_equity,
            num_trades=num_trades,
            bars=bars,
            elapsed_seconds=elapsed,
            peak_rss_bytes=max(0, int(after.ru_maxrss - before.ru_maxrss)) * 1024,
            cpu_seconds=max(0.0, (after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime)),
            enforced_limits=enforced_limits,
        )

    @staticmethod
    def _limit_preexec(limits: ResearchChildLimits):
        def apply() -> None:
            resource.setrlimit(resource.RLIMIT_AS, (limits.memory_bytes, limits.memory_bytes))
            resource.setrlimit(resource.RLIMIT_CPU, (limits.cpu_seconds, limits.cpu_seconds))
            resource.setrlimit(resource.RLIMIT_FSIZE, (limits.file_bytes, limits.file_bytes))
            resource.setrlimit(resource.RLIMIT_NOFILE, (limits.fd_limit, limits.fd_limit))
            # NPROC is applied in the bootstrap *inside* the isolated user
            # namespace (above), after `unshare -f` has completed. That keeps
            # the 128-process cap real without turning unrelated host PIDs
            # into a false admission failure.

        return apply

    @staticmethod
    def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)

    def _read_result(self, path: Path) -> dict[str, Any]:
        if not path.is_file() or path.stat().st_size > self._MAX_RESULT_BYTES:
            raise ResearchSupervisorError("P06 child result is absent or exceeds the bounded receipt limit")
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ResearchSupervisorError("P06 child result must be a JSON object")
        return value

    def _read_tail(self, path: Path) -> str:
        if not path.is_file():
            return ""
        with path.open("rb") as handle:
            handle.seek(max(0, path.stat().st_size - self._MAX_LOG_BYTES))
            return handle.read(self._MAX_LOG_BYTES).decode("utf-8", errors="replace")


__all__ = [
    "IsolatedResearchSupervisor",
    "ResearchChildLimits",
    "ResearchChildReceipt",
    "ResearchChildResult",
    "ResearchSupervisorError",
]
