"""P06 process supervisor for the bounded QuantBT adapter.

The durable scheduler and lease state live in Control API/PostgreSQL.  This
module has no database, NATS, Execution, broker or command authority: it can
only start one allowlisted child from an ID-only launch receipt.  It therefore
cannot become a second scheduler or bypass P05 fencing.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import resource
import shutil
import signal
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PREVIEW_LONG_CPU_SECONDS,
    DELTA_WFO_PREVIEW_LONG_MAX_TRIALS,
    DELTA_WFO_PREVIEW_LONG_MIN_TRIALS,
    DELTA_WFO_PREVIEW_LONG_WALL_SECONDS,
    delta_wfo_preview_long_enabled,
)
from portal_api.domain.research_imported_alpha_profile import (
    IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    IMPORTED_ALPHA_ADAPTER_ID,
    IMPORTED_ALPHA_MAX_SOURCE_BYTES,
    IMPORTED_ALPHA_PROFILE_DIGEST,
    IMPORTED_ALPHA_PROFILE_ID,
)


class ResearchSupervisorError(RuntimeError):
    """Typed local supervisor failure; caller maps it to P06 retry policy."""

    def __init__(self, message: str, *, code: str = "ENGINE_ERROR") -> None:
        super().__init__(message)
        self.code = code


def _child_resource_exhausted(stderr_tail: str) -> bool:
    """Recognize Python's bounded errno line after an engine wrapper fails."""

    return bool(re.search(r"(?:OSError|PermissionError): \[Errno (?:28|122)\]", stderr_tail))


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
        if not (1 <= self.cpu_seconds <= 300 and 1 <= self.wall_seconds <= 600) and not (
            # Research preview only: the long WFO child's own ceiling.
            delta_wfo_preview_long_enabled()
            and 1 <= self.cpu_seconds <= DELTA_WFO_PREVIEW_LONG_CPU_SECONDS
            and 1 <= self.wall_seconds <= DELTA_WFO_PREVIEW_LONG_WALL_SECONDS
        ):
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
    # P10 carries these server-owned values explicitly rather than asking the
    # child to assume UI defaults.  P06 callers that predate P10 retain the
    # protected default profile through the dataclass default below.
    p04_parameters: dict[str, int | float] | None = None
    # P13 uses the actual P08 OOS boundary to produce a compact evidence
    # passport.  It is optional only for pre-P13/P06 compatibility callers;
    # the installed P10 producer always supplies it.
    oos_start_utc_ms: int | None = None
    # Immutable P08 bound: optional warmup must not appear as IS equity.
    is_start_utc_ms: int | None = None

    def as_payload(self) -> dict[str, Any]:
        payload = {
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
        if self.p04_parameters is not None:
            payload["p04_parameters"] = self.p04_parameters
        if self.oos_start_utc_ms is not None:
            payload["oos_start_utc_ms"] = self.oos_start_utc_ms
        if self.is_start_utc_ms is not None:
            payload["is_start_utc_ms"] = self.is_start_utc_ms
        return payload


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
    # A bounded P13 source receipt, generated by the confined QuantBT child.
    # It contains no source path, candle row, credential or worker handle.
    evidence_source: dict[str, Any] | None = None
    # Independently rehashed by the E17 child and checked by the supervisor.
    imported_source_digest: str | None = None


# W1 §1.1 child_limits (cpu 120 s, wall 240 s) plus the design's scratch and
# per-file caps. Memory/FD/NPROC stay at the P04 defaults.  The P04 default
# ``ResearchChildLimits()`` is unchanged.
DELTA_WFO_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=120,
    wall_seconds=240,
    scratch_bytes=128 * 1024 * 1024,
    file_bytes=16 * 1024 * 1024,
)

# Research preview only (PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO, PORTAL_ENV=
# local): a 2..400-trial study needs more than the locked 120/240 s. Validated
# only while that flag is on; every other lane keeps its limits above.
DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=DELTA_WFO_PREVIEW_LONG_CPU_SECONDS,
    wall_seconds=DELTA_WFO_PREVIEW_LONG_WALL_SECONDS,
    scratch_bytes=128 * 1024 * 1024,
    file_bytes=16 * 1024 * 1024,
)

IMPORTED_ALPHA_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=120,
    wall_seconds=240,
    scratch_bytes=128 * 1024 * 1024,
    file_bytes=16 * 1024 * 1024,
)


@dataclass(frozen=True, slots=True)
class ImportedAlphaChildReceipt:
    """Exact-digest E17 launch receipt; source is a short-lived 0600 file."""

    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    source_path: Path
    source_digest: str
    entrypoint: str
    parameters: dict[str, str | int | float | bool]
    random_seed: int | None
    artifact_root: Path
    oos_start_utc_ms: int
    is_start_utc_ms: int | None = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "research.p06.child-receipt.v1",
            "task": "P17_IMPORTED_SIGNAL_NOTIONAL",
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            "source_path": str(self.source_path),
            "source_digest": self.source_digest,
            "entrypoint": self.entrypoint,
            "parameters": dict(self.parameters),
            "random_seed": self.random_seed,
            "artifact_root": str(self.artifact_root),
            "oos_start_utc_ms": self.oos_start_utc_ms,
            **({"is_start_utc_ms": self.is_start_utc_ms} if self.is_start_utc_ms is not None else {}),
            "execution_adapter_id": IMPORTED_ALPHA_ADAPTER_ID,
            "adapter_contract_digest": IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
            "execution_profile_id": IMPORTED_ALPHA_PROFILE_ID,
            "execution_profile_digest": IMPORTED_ALPHA_PROFILE_DIGEST,
        }


@dataclass(frozen=True, slots=True)
class DeltaWfoChildReceipt:
    """ID-only launch receipt for the W1 ``P10_DELTA_WFO`` child task.

    Every WFO knob except the requested span/first OOS boundary comes from the
    digest-pinned profile inside the child; the receipt cannot widen them.
    """

    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    artifact_root: Path
    execution_profile_id: str
    execution_profile_digest: str
    dataset_id: str
    symbol: str
    data_start_utc_ms: int
    data_end_exclusive_utc_ms: int
    first_oos_utc_ms: int
    # W5a A10c: the same confined child runs the what-if diagnostic. Its
    # admitted evaluations travel ID-and-value only (no path, no source).
    task: str = "P10_DELTA_WFO"
    # W5a: a what-if sibling's two pinned axes (exact decimal text).
    pinned_parameters: tuple[tuple[str, str], ...] = ()
    whatif_grid_key: str | None = None
    whatif_evaluations: tuple[dict[str, Any], ...] = ()
    # Research preview only: the admitted long-WFO trial count. None keeps
    # the locked profile's count and the receipt bytes of every other run.
    optuna_trials: int | None = None

    def as_payload(self, *, output_root: Path) -> dict[str, Any]:
        if self.task not in {"P10_DELTA_WFO", "P16_DELTA_WHATIF_GRID"}:
            raise ResearchSupervisorError("P06 WFO child task is not allowlisted")
        payload: dict[str, Any] = {
            "schema_version": "research.p06.child-receipt.v1",
            "task": self.task,
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            "artifact_root": str(self.artifact_root),
            "output_root": str(output_root),
            "execution_profile_id": self.execution_profile_id,
            "execution_profile_digest": self.execution_profile_digest,
            "dataset_id": self.dataset_id,
            "symbol": self.symbol,
            "data_start_utc_ms": self.data_start_utc_ms,
            "data_end_exclusive_utc_ms": self.data_end_exclusive_utc_ms,
            "first_oos_utc_ms": self.first_oos_utc_ms,
        }
        if self.pinned_parameters:
            if self.task != "P10_DELTA_WFO":
                raise ResearchSupervisorError("P06 only a WFO study may carry pinned parameters")
            payload["pinned_parameters"] = dict(self.pinned_parameters)
        if self.optuna_trials is not None:
            if (
                self.task != "P10_DELTA_WFO"
                or isinstance(self.optuna_trials, bool)
                or not isinstance(self.optuna_trials, int)
                or not DELTA_WFO_PREVIEW_LONG_MIN_TRIALS <= self.optuna_trials <= DELTA_WFO_PREVIEW_LONG_MAX_TRIALS
            ):
                raise ResearchSupervisorError("P06 only a preview long WFO study may carry a bounded trial count")
            payload["optuna_trials"] = self.optuna_trials
        if self.task == "P16_DELTA_WHATIF_GRID":
            if not self.whatif_grid_key or not 1 <= len(self.whatif_evaluations) <= 81:
                raise ResearchSupervisorError("P06 what-if child receipt carries no bounded evaluation list")
            payload["whatif_grid_key"] = self.whatif_grid_key
            payload["whatif_evaluations"] = [dict(entry) for entry in self.whatif_evaluations]
        return payload


@dataclass(frozen=True, slots=True)
class DeltaWfoChildResult:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    engine_version: str
    bars: int
    n_folds: int
    trial_rows: int
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]
    # Validated regular-file tree ``output_root/<run_id>/...`` on the parent's
    # scratch filesystem. The caller copies it out and removes it.
    output_root: Path
    output_files: int
    output_bytes: int


# CG-P06-02: the child's live progress channel. A fixed sibling file of the
# receipt (like ``result.json``), append-only NDJSON, bounded in lines and
# bytes. It carries only Optuna trial facts and the child's own CPU seconds;
# no path, market row, parameter value or credential.
CHILD_PROGRESS_FILENAME = "progress.ndjson"
CHILD_PROGRESS_SCHEMA = "research.p06.child-progress.v1"
CHILD_PROGRESS_MAX_RECORDS = 512
CHILD_PROGRESS_MAX_LINE_BYTES = 1_024
CHILD_PROGRESS_MAX_BYTES = CHILD_PROGRESS_MAX_RECORDS * CHILD_PROGRESS_MAX_LINE_BYTES
# The parent tails the channel this often while a progress consumer is
# attached; heartbeats keep their own 5-second cadence.
CHILD_PROGRESS_POLL_SECONDS = 0.5
_CHILD_HEARTBEAT_SECONDS = 5.0
_SIGNED_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?")


def _valid_child_progress_record(value: object, expected_sequence: int) -> dict[str, Any] | None:
    """Accept exactly one well-formed trial record, or nothing.

    The channel is an observation, not an authority: a malformed record ends
    the live channel (the retained trial table still closes the study) rather
    than failing a run whose engine result is intact.
    """

    if not isinstance(value, dict):
        return None
    if set(value) != {"schema_version", "sequence", "kind", "trial", "state", "objective", "best_objective", "cpu_seconds"}:
        return None
    if value.get("schema_version") != CHILD_PROGRESS_SCHEMA or value.get("kind") != "trial":
        return None
    sequence = value.get("sequence")
    trial = value.get("trial")
    if (
        not isinstance(sequence, int) or isinstance(sequence, bool) or sequence != expected_sequence
        or not isinstance(trial, int) or isinstance(trial, bool) or not 1 <= trial <= 100_000
        or value.get("state") not in {"COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"}
    ):
        return None
    for key in ("objective", "best_objective"):
        item = value.get(key)
        if item is not None and (not isinstance(item, str) or len(item) > 96 or not _SIGNED_DECIMAL.fullmatch(item)):
            return None
    cpu = value.get("cpu_seconds")
    if cpu is not None and (isinstance(cpu, bool) or not isinstance(cpu, (int, float)) or not 0 <= cpu < 1e9):
        return None
    return value


class _ChildProgressTail:
    """Read new complete lines from the child's progress file, bounded."""

    def __init__(self, path: Path, consumer: Callable[[dict[str, Any]], None]) -> None:
        self._path = path
        self._consumer = consumer
        self._offset = 0
        self._buffer = b""
        self._next_sequence = 1
        self._closed = False

    def drain(self) -> None:
        if self._closed:
            return
        try:
            descriptor = os.open(self._path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            return
        except OSError:
            self._closed = True  # e.g. a symlink planted in place of the file
            return
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode):
                self._closed = True
                return
            budget = CHILD_PROGRESS_MAX_BYTES - self._offset
            if budget <= 0:
                self._closed = True
                return
            os.lseek(descriptor, self._offset, os.SEEK_SET)
            chunk = os.read(descriptor, min(budget, max(0, info.st_size - self._offset)))
        finally:
            os.close(descriptor)
        self._offset += len(chunk)
        self._buffer += chunk
        while b"\n" in self._buffer:
            line, self._buffer = self._buffer.split(b"\n", 1)
            if len(line) > CHILD_PROGRESS_MAX_LINE_BYTES:
                self._closed = True
                return
            try:
                record = _valid_child_progress_record(json.loads(line.decode("utf-8")), self._next_sequence)
            except (UnicodeDecodeError, json.JSONDecodeError):
                record = None
            if record is None:
                self._closed = True
                return
            self._next_sequence += 1
            self._consumer(record)
        if len(self._buffer) > CHILD_PROGRESS_MAX_LINE_BYTES:
            self._closed = True


@dataclass(frozen=True, slots=True)
class _LaunchOutcome:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    payload: dict[str, Any]
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]


class IsolatedResearchSupervisor:
    """Start one real namespace-isolated, resource-limited P04 child."""

    _MAX_RESULT_BYTES = 32 * 1024
    _MAX_LOG_BYTES = 16 * 1024
    _MAX_WFO_OUTPUT_FILES = 64
    _MAX_WFO_OUTPUT_BYTES = 64 * 1024 * 1024

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

    def _validate_launch_identity(self, *, job_id: str, run_id: str, worker_attempt_id: str, lease_epoch: int) -> None:
        for label, value in (("job_id", job_id), ("run_id", run_id), ("worker_attempt_id", worker_attempt_id)):
            self._opaque(value, label)
        if lease_epoch < 1:
            raise ResearchSupervisorError("lease_epoch must be positive")

    def retire_terminal_scratch(
        self, *, job_id: str, run_id: str, worker_attempt_id: str, lease_epoch: int
    ) -> bool:
        """Retire one finished child receipt after the durable worker commits terminal.

        The caller first proves its executor settled and this exact attempt is
        terminal in the durable ledger. The receipt check prevents an old
        lease from removing another child's scratch. The attempt ledger, not
        this disposable directory, remains the launch-once authority.
        """

        self._validate_launch_identity(
            job_id=job_id, run_id=run_id,
            worker_attempt_id=worker_attempt_id, lease_epoch=lease_epoch,
        )
        job_dir = self._scratch_root / job_id
        work = job_dir / worker_attempt_id
        if not work.exists():
            return False
        if work.is_symlink() or not work.is_dir() or job_dir.is_symlink():
            raise ResearchSupervisorError("terminal scratch is not a directory")
        receipt_path = work / "receipt.json"
        if receipt_path.is_symlink() or not receipt_path.is_file():
            raise ResearchSupervisorError("terminal scratch has no launch receipt")
        try:
            payload = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchSupervisorError("terminal scratch launch receipt is invalid") from exc
        if (
            not isinstance(payload, dict)
            or payload.get("job_id") != job_id
            or payload.get("run_id") != run_id
            or payload.get("worker_attempt_id") != worker_attempt_id
            or payload.get("lease_epoch") != lease_epoch
        ):
            raise ResearchSupervisorError("terminal scratch launch identity changed")
        shutil.rmtree(work)
        try:
            job_dir.rmdir()  # Never remove another attempt's scratch.
        except OSError:
            pass
        return True

    def _approved_market_input(self, market_path: Path) -> Path:
        resolved = market_path.resolve(strict=True)
        if resolved.suffix != ".parquet" or not resolved.is_relative_to(self._allowed_market_root):
            raise ResearchSupervisorError("P06 child may read only an approved Parquet market input")
        return resolved

    def _approved_imported_source(self, source_path: Path, expected_digest: str) -> Path:
        if source_path.is_symlink():
            raise ResearchSupervisorError("E17 child source must not be a symlink")
        resolved = source_path.resolve(strict=True)
        info = resolved.stat()
        if (
            resolved.suffix != ".py"
            or not resolved.is_relative_to(self._allowed_market_root)
            or not stat.S_ISREG(info.st_mode)
            or info.st_size < 1
            or info.st_size > IMPORTED_ALPHA_MAX_SOURCE_BYTES
            or stat.S_IMODE(info.st_mode) & 0o077
        ):
            raise ResearchSupervisorError("E17 child source is not an approved bounded 0600 Python input")
        digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
        if digest != expected_digest:
            raise ResearchSupervisorError("E17 child source digest does not match its immutable binding")
        return resolved

    def _assert_artifact_root(self, artifact_root: Path) -> None:
        if artifact_root.resolve().is_relative_to(self._scratch_root):
            raise ResearchSupervisorError("artifact_root must not be a child scratch location")

    def run_p04_delta_qualification(
        self,
        receipt: ResearchChildReceipt,
        *,
        limits: ResearchChildLimits = ResearchChildLimits(),
        on_child_alive: Callable[[], None] | None = None,
    ) -> ResearchChildResult:
        limits.validate()
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._assert_artifact_root(receipt.artifact_root)
        launch = self._launch(
            job_id=receipt.job_id,
            worker_attempt_id=receipt.worker_attempt_id,
            payload_for=lambda _work: receipt.as_payload(),
            expected_task="P04_DELTA_SMOKE",
            limits=limits,
            on_child_alive=on_child_alive,
        )
        payload = launch.payload
        try:
            engine_version = str(payload["engine_version"])
            final_equity = float(payload["final_equity"])
            num_trades = int(payload["num_trades"])
            bars = int(payload["bars"])
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
        evidence_source = payload.get("evidence_source")
        if evidence_source is not None:
            self._validate_evidence_source(evidence_source)
        return ResearchChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            final_equity=final_equity,
            num_trades=num_trades,
            bars=bars,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=launch.peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            evidence_source=evidence_source if isinstance(evidence_source, dict) else None,
        )

    def run_imported_alpha_qualification(
        self,
        receipt: ImportedAlphaChildReceipt,
        *,
        limits: ResearchChildLimits = IMPORTED_ALPHA_CHILD_LIMITS,
        on_child_alive: Callable[[], None] | None = None,
    ) -> ResearchChildResult:
        limits.validate()
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._approved_imported_source(receipt.source_path, receipt.source_digest)
        self._assert_artifact_root(receipt.artifact_root)
        launch = self._launch(
            job_id=receipt.job_id,
            worker_attempt_id=receipt.worker_attempt_id,
            payload_for=lambda _work: receipt.as_payload(),
            expected_task="P17_IMPORTED_SIGNAL_NOTIONAL",
            limits=limits,
            on_child_alive=on_child_alive,
        )
        payload = launch.payload
        try:
            engine_version = str(payload["engine_version"])
            final_equity = float(payload["final_equity"])
            num_trades = int(payload["num_trades"])
            bars = int(payload["bars"])
            source_digest = str(payload["source_digest"])
            profile_digest = str(payload["execution_profile_digest"])
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("E17 child returned an invalid bounded receipt") from error
        if source_digest != receipt.source_digest or profile_digest != IMPORTED_ALPHA_PROFILE_DIGEST:
            raise ResearchSupervisorError("E17 child did not execute the admitted source/profile identity")
        evidence_source = payload.get("evidence_source")
        if evidence_source is not None:
            self._validate_evidence_source(
                evidence_source,
                expected_adapter_id=IMPORTED_ALPHA_ADAPTER_ID,
            )
        return ResearchChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            final_equity=final_equity,
            num_trades=num_trades,
            bars=bars,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=launch.peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            evidence_source=evidence_source if isinstance(evidence_source, dict) else None,
            imported_source_digest=source_digest,
        )

    def run_delta_wfo(
        self,
        receipt: DeltaWfoChildReceipt,
        *,
        limits: ResearchChildLimits = DELTA_WFO_CHILD_LIMITS,
        on_child_alive: Callable[[], None] | None = None,
        on_child_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> DeltaWfoChildResult:
        """Run the W1 Delta signal-notional WFO in the same P06 confinement.

        The child writes QuantBT's advanced WFO artifacts into ``output``, a
        sibling of its receipt on the real scratch filesystem (never the
        child's private tmpfs, which disappears with its mount namespace).
        The parent then refuses symlinks, non-regular files and any output
        beyond ``64`` files / ``64 MiB`` before a caller may read it.
        """

        limits.validate()
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._assert_artifact_root(receipt.artifact_root)
        output_holder: dict[str, Path] = {}

        def payload_for(work: Path) -> dict[str, Any]:
            output = work / "output"
            output.mkdir(mode=0o700)
            output_holder["output"] = output
            return receipt.as_payload(output_root=output)

        try:
            launch = self._launch(
                job_id=receipt.job_id,
                worker_attempt_id=receipt.worker_attempt_id,
                payload_for=payload_for,
                expected_task=receipt.task,
                limits=limits,
                on_child_alive=on_child_alive,
                on_child_progress=on_child_progress,
            )
            payload = launch.payload
            try:
                engine_version = str(payload["engine_version"])
                bars = int(payload["bars"])
                n_folds = int(payload["n_folds"])
                trial_rows = int(payload["trial_rows"])
                profile_digest = str(payload["execution_profile_digest"])
            except (KeyError, TypeError, ValueError) as error:
                raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
            # CG-P11-09: the child reports its own peak RSS. The parent's
            # RUSAGE_CHILDREN delta cannot see a child smaller than an earlier
            # one in this process, so it is only the fallback.
            child_rss = payload.get("peak_rss_bytes")
            peak_rss_bytes = (
                child_rss
                if isinstance(child_rss, int) and not isinstance(child_rss, bool) and 0 < child_rss <= 16 * 1024 ** 3
                else launch.peak_rss_bytes
            )
            if profile_digest != receipt.execution_profile_digest:
                raise ResearchSupervisorError("P06 WFO child did not run the admitted execution profile")
            output = output_holder["output"]
            files, total_bytes = self._validate_output_tree(output, run_id=receipt.run_id)
        except BaseException:
            output = output_holder.get("output")
            if output is not None and output.exists():
                shutil.rmtree(output, ignore_errors=True)
            raise
        return DeltaWfoChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            bars=bars,
            n_folds=n_folds,
            trial_rows=trial_rows,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            output_root=output,
            output_files=files,
            output_bytes=total_bytes,
        )

    @classmethod
    def _validate_output_tree(cls, output: Path, *, run_id: str) -> tuple[int, int]:
        """Refuse a child output that is not a small tree of regular files."""

        if output.is_symlink() or not output.is_dir():
            raise ResearchSupervisorError("P06 WFO child output root is invalid")
        files = 0
        total = 0
        for directory, subdirectories, names in os.walk(output, followlinks=False):
            for name in (*subdirectories, *names):
                path = Path(directory) / name
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise ResearchSupervisorError("P06 WFO child output contains a symlink")
                if stat.S_ISDIR(info.st_mode):
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise ResearchSupervisorError("P06 WFO child output contains a non-regular file")
                files += 1
                total += info.st_size
                if files > cls._MAX_WFO_OUTPUT_FILES or total > cls._MAX_WFO_OUTPUT_BYTES:
                    raise ResearchSupervisorError(
                        "P06 WFO child output exceeds its bounded file budget",
                        code="RESOURCE_EXCEEDED",
                    )
        entries = [entry.name for entry in output.iterdir()]
        if entries != [run_id] or not (output / run_id / "manifest.json").is_file():
            raise ResearchSupervisorError("P06 WFO child output is not one run artifact directory")
        return files, total

    def _launch(
        self,
        *,
        job_id: str,
        worker_attempt_id: str,
        payload_for: Callable[[Path], dict[str, Any]],
        expected_task: str,
        limits: ResearchChildLimits,
        on_child_alive: Callable[[], None] | None,
        on_child_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> _LaunchOutcome:
        work = self._scratch_root / job_id / worker_attempt_id
        if work.exists():
            raise ResearchSupervisorError("a P06 scratch receipt may be launched only once")
        work.mkdir(mode=0o700, parents=True)
        (work / "tmp").mkdir(mode=0o700)
        receipt_path = work / "receipt.json"
        result_path = work / "result.json"
        stdout_path = work / "stdout.log"
        stderr_path = work / "stderr.log"
        receipt_path.write_text(json.dumps(payload_for(work), sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
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
        tail = _ChildProgressTail(work / CHILD_PROGRESS_FILENAME, on_child_progress) if on_child_progress else None
        # Without a progress consumer the loop keeps its original 5-second
        # cadence exactly; with one it wakes twice a second to tail the file.
        wait_step = CHILD_PROGRESS_POLL_SECONDS if tail is not None else _CHILD_HEARTBEAT_SECONDS
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
                if on_child_alive is not None and process.poll() is None:
                    on_child_alive()
                last_alive = time.monotonic()
                while True:
                    remaining = limits.wall_seconds - (time.monotonic() - started)
                    if remaining <= 0:
                        return_code = process.poll()
                        if return_code is not None:
                            break
                        raise subprocess.TimeoutExpired(command, limits.wall_seconds)
                    try:
                        return_code = process.wait(timeout=min(wait_step, remaining))
                        break
                    except subprocess.TimeoutExpired:
                        if tail is not None:
                            tail.drain()
                        if (
                            on_child_alive is not None and process.poll() is None
                            and time.monotonic() - last_alive >= _CHILD_HEARTBEAT_SECONDS - 1e-6
                        ):
                            last_alive = time.monotonic()
                            on_child_alive()
                if tail is not None:
                    # Records written just before exit are still facts.
                    tail.drain()
            except subprocess.TimeoutExpired as error:
                self._kill_process_group(process)
                raise ResearchSupervisorError("P06 child exceeded its wall-clock limit and was killed", code="RESOURCE_EXCEEDED") from error
            except Exception:
                self._kill_process_group(process)
                raise
        elapsed = time.monotonic() - started
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        if return_code != 0:
            if return_code == -signal.SIGXCPU:
                raise ResearchSupervisorError(
                    "P06 child exceeded its CPU limit and was killed",
                    code="RESOURCE_EXCEEDED",
                )
            stderr_tail = self._read_tail(stderr_path)
            # QuantBT/Optuna can wrap an OSError from its on-disk JIT cache in
            # RuntimeError before the isolated child exits. The bounded tail
            # still contains Python's errno line; never forward its traceback
            # (which may contain private paths or strategy parameters) into a
            # user-visible failure receipt.
            if _child_resource_exhausted(stderr_tail):
                raise ResearchSupervisorError(
                    "P06 child exhausted its disk or filesystem quota",
                    code="RESOURCE_EXCEEDED",
                )
            raise ResearchSupervisorError(
                f"P06 child exited {return_code}: {stderr_tail!r}"
            )
        payload = self._read_result(result_path)
        try:
            child_pid = int(payload["child_pid"])
            network_namespace = str(payload["network_namespace"])
            enforced_limits = {str(key): int(value) for key, value in dict(payload["enforced_limits"]).items()}
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
        if payload.get("task") != expected_task or payload.get("credential_environment_clean") is not True:
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
        return _LaunchOutcome(
            launcher_pid=process.pid,
            child_pid=child_pid,
            network_namespace=network_namespace,
            payload=payload,
            elapsed_seconds=elapsed,
            peak_rss_bytes=max(0, int(after.ru_maxrss - before.ru_maxrss)) * 1024,
            cpu_seconds=max(0.0, (after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime)),
            enforced_limits=enforced_limits,
        )

    @staticmethod
    def _validate_evidence_source(
        value: object,
        *,
        expected_adapter_id: str = "p04.delta-rsi.v1",
    ) -> None:
        """Reject a malformed P13 receipt before it crosses P06's boundary.

        TypeScript repeats the full contract at Control ingress.  This cheap
        local shape check prevents a corrupt child result from being sealed
        into a P10 bundle or replayed forever by the durable journal.
        """

        if not isinstance(value, dict):
            raise ResearchSupervisorError("P06 child evidence receipt is invalid")
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if len(encoded) > 28 * 1024:
            raise ResearchSupervisorError("P06 child evidence receipt exceeds its bounded budget")
        if value.get("schema_version") != "research.p13.evidence-source.v1":
            raise ResearchSupervisorError("P06 child evidence receipt has an unsupported schema")
        source = value.get("source")
        direct = value.get("direct")
        derived = value.get("derived")
        points = value.get("equity_points")
        unavailable = value.get("unavailable")
        if not all(isinstance(item, dict) for item in (source, direct, derived, unavailable)) or not isinstance(points, list):
            raise ResearchSupervisorError("P06 child evidence receipt shape is invalid")
        if source.get("execution_adapter_id") != expected_adapter_id or source.get("engine_version") != "1.1.1":
            raise ResearchSupervisorError("P06 child evidence receipt source identity is invalid")
        if not 1 <= len(points) <= 192 or source.get("emitted_equity_points") != len(points):
            raise ResearchSupervisorError("P06 child evidence receipt point count is invalid")
        if not isinstance(source.get("source_transform_digest"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["source_transform_digest"]):
            raise ResearchSupervisorError("P06 child evidence receipt digest is invalid")
        overview = value.get("candle_overview")
        if overview is not None:
            IsolatedResearchSupervisor._validate_candle_overview(overview)
        # The hash is not persisted as a source of truth here; calculating it
        # confirms the JSON is canonicalizable before the worker receives it.
        hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _validate_candle_overview(overview: Any) -> None:
        """Accept the E16-R1 producer contract without relaxing old receipts.

        New children publish an availability envelope with at most 48 true
        OOS buckets and null execution markers. Legacy children published at
        most 12 raw buckets; their numeric position changes are not fills.
        The full evidence byte budget is checked by the caller above.
        """
        if not isinstance(overview, dict):
            raise ResearchSupervisorError("P06 child candle overview is invalid")
        canonical = "state" in overview
        keys = {"source_bar_count", "emitted_bucket_count", "bucket_bars", "sampling", "envelope", "values"}
        if canonical:
            keys |= {"state", "reason_code", "scope"}
        if set(overview) != keys:
            raise ResearchSupervisorError("P06 child candle overview shape is invalid")
        if canonical:
            if overview["scope"] != "OOS_EQUITY_WINDOW":
                raise ResearchSupervisorError("P06 child candle overview scope is invalid")
            if overview["state"] == "NOT_PUBLISHED":
                reason = overview["reason_code"]
                if (
                    not isinstance(reason, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{2,159}", reason)
                    or any(overview[key] is not None for key in ("source_bar_count", "bucket_bars", "sampling", "envelope"))
                    or type(overview["emitted_bucket_count"]) is not int or overview["emitted_bucket_count"] != 0
                    or overview["values"] != []
                ):
                    raise ResearchSupervisorError("P06 child candle overview absence is invalid")
                return
            if overview["state"] != "AVAILABLE" or overview["reason_code"] is not None:
                raise ResearchSupervisorError("P06 child candle overview availability is invalid")
        rows = overview["values"]
        bucket_count, bucket_bars, source_bars = (overview[key] for key in ("emitted_bucket_count", "bucket_bars", "source_bar_count"))
        sampling = overview["sampling"]
        if (
            not isinstance(rows, list) or not 1 <= len(rows) <= (48 if canonical else 12)
            or type(bucket_count) is not int or bucket_count != len(rows)
            or type(bucket_bars) is not int or not 1 <= bucket_bars <= 2_000_000
            or type(source_bars) is not int or not len(rows) <= source_bars <= 2_000_000
            or (source_bars + bucket_bars - 1) // bucket_bars != bucket_count
            or sampling not in ("FULL", "OHLC_BUCKET_V1")
            or (sampling == "FULL") != (bucket_bars == 1)
        ):
            raise ResearchSupervisorError("P06 child candle overview bounds are invalid")
        decimal_pattern = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
        def exact_decimal(value: Any) -> Decimal:
            if not isinstance(value, str) or len(value) > 96 or not decimal_pattern.fullmatch(value):
                raise ResearchSupervisorError("P06 child candle overview decimal is invalid")
            return Decimal(value)
        def utc_ms(value: Any) -> bool:
            return type(value) is int and 0 <= value <= 9_007_199_254_740_991
        previous_last, previous_close_at = -1, -1
        extremes: list[tuple[Decimal, Decimal, int, int]] = []
        for row in rows:
            if not isinstance(row, dict) or set(row) != {
                "first_ordinal", "last_ordinal", "open_utc_ms", "close_utc_ms", "open", "high", "low", "close", "volume", "transitions",
            }:
                raise ResearchSupervisorError("P06 child candle overview row is invalid")
            first, last, open_at, close_at = (row[key] for key in ("first_ordinal", "last_ordinal", "open_utc_ms", "close_utc_ms"))
            if (
                type(first) is not int or type(last) is not int or first != previous_last + 1
                or not first <= last < source_bars or last - first + 1 > bucket_bars
                or not utc_ms(open_at) or not utc_ms(close_at) or open_at <= previous_close_at or close_at < open_at
            ):
                raise ResearchSupervisorError("P06 child candle overview chronology is invalid")
            transitions = row["transitions"]
            if (canonical and transitions is not None) or (
                not canonical and (type(transitions) is not int or not 0 <= transitions <= 2_000_000)
            ):
                raise ResearchSupervisorError("P06 child candle overview markers are invalid")
            open_price, high, low, close = (exact_decimal(row[key]) for key in ("open", "high", "low", "close"))
            if not low <= min(open_price, close) <= max(open_price, close) <= high:
                raise ResearchSupervisorError("P06 child candle overview OHLC range is invalid")
            if row["volume"] is not None:
                exact_decimal(row["volume"])
            extremes.append((high, low, open_at, close_at))
            previous_last, previous_close_at = last, close_at
        if previous_last != source_bars - 1:
            raise ResearchSupervisorError("P06 child candle overview source coverage is invalid")
        envelope = overview["envelope"]
        if not isinstance(envelope, dict) or set(envelope) != {"max_high", "min_low", "max_high_at_utc_ms", "min_low_at_utc_ms"}:
            raise ResearchSupervisorError("P06 child candle overview envelope is invalid")
        high, low = exact_decimal(envelope["max_high"]), exact_decimal(envelope["min_low"])
        high_at, low_at = envelope["max_high_at_utc_ms"], envelope["min_low_at_utc_ms"]
        if (
            high != max(item[0] for item in extremes) or low != min(item[1] for item in extremes)
            or not utc_ms(high_at) or not utc_ms(low_at)
            or not any(item[0] == high and item[2] <= high_at <= item[3] for item in extremes)
            or not any(item[1] == low and item[2] <= low_at <= item[3] for item in extremes)
        ):
            raise ResearchSupervisorError("P06 child candle overview envelope extrema are invalid")

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
    "DELTA_WFO_CHILD_LIMITS",
    "DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS",
    "DeltaWfoChildReceipt",
    "DeltaWfoChildResult",
    "IsolatedResearchSupervisor",
    "ResearchChildLimits",
    "ResearchChildReceipt",
    "ResearchChildResult",
    "ResearchSupervisorError",
]
