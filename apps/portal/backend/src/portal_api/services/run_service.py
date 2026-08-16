"""Run lifecycle manager (Phase P4, plan §9/§12).

Owns the in-memory run registry, a single-process worker pool and per-run
status persistence. Completed runs are discovered from the artifact root, so
results survive API restarts and reopen without rerunning QuantBT.
"""

from __future__ import annotations

import time
import uuid
from concurrent.futures import Future, ProcessPoolExecutor, ThreadPoolExecutor
from datetime import UTC, datetime
from multiprocessing import get_all_start_methods, get_context
from pathlib import Path
from typing import Any

from portal_api.domain.enums import RunState
from portal_api.domain.errors import RunCancelledError
from portal_api.repositories.artifacts import (
    ArtifactRepository,
    with_portal_provenance,
)
from portal_api.workers import run_worker

TERMINAL_STATES = {RunState.COMPLETED, RunState.FAILED, RunState.CANCELLED}


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


class RunManager:
    def __init__(
        self,
        *,
        artifacts: ArtifactRepository,
        max_workers: int = 1,
        mp_start_method: str | None = None,
    ):
        self._artifacts = artifacts
        self._max_workers = max_workers
        # FastAPI/TestClient and notebook hosts commonly have active threads.
        # A fork server avoids inheriting interpreter/Numba locks and also
        # avoids re-executing a pytest/notebook main module like spawn does.
        method = mp_start_method or (
            "forkserver" if "forkserver" in get_all_start_methods() else "spawn"
        )
        self._executor = ProcessPoolExecutor(
            max_workers=max_workers,
            mp_context=get_context(method),
        )
        self._launcher = ThreadPoolExecutor(
            max_workers=1,
            thread_name_prefix="portal-run-launcher",
        )
        self._futures: dict[str, Future] = {}

    # -- submission -----------------------------------------------------------

    @property
    def max_workers(self) -> int:
        return self._max_workers

    def submit(self, request) -> str:
        run_id = uuid.uuid4().hex[:16]
        status = {
            "run_id": run_id,
            "state": RunState.QUEUED.value,
            "protocol": request.protocol.value,
            "strategy_id": request.strategy_id,
            "created_at": _utc_now_iso(),
            "events": [{"state": RunState.QUEUED.value, "at": time.time()}],
            "failure": None,
        }
        self._artifacts.write_json(
            run_id,
            "status.json",
            with_portal_provenance("status.json", status),
        )
        self._artifacts.write_json(
            run_id,
            "config/request.json",
            with_portal_provenance(
                "request.json", request.model_dump(mode="json", exclude_none=False)
            ),
        )
        self._launcher.submit(
            self._launch_process,
            run_id,
            request.model_dump(mode="json"),
        )
        return run_id

    def _launch_process(self, run_id: str, request_json: dict[str, Any]) -> None:
        try:
            future = self._executor.submit(
                run_worker.execute_run,
                request_json=request_json,
                run_id=run_id,
                artifact_root=str(self._artifacts.root),
            )
        except Exception as exc:  # noqa: BLE001 - launch failure is persisted
            status = self.status(run_id) or {"run_id": run_id}
            self._artifacts.write_json(
                run_id,
                "status.json",
                with_portal_provenance(
                    "status.json",
                    {
                        **status,
                        "state": RunState.FAILED.value,
                        "completed_at": _utc_now_iso(),
                        "failure": {"code": "WORKER_LAUNCH_FAILED", "message": str(exc)},
                    },
                ),
            )
            return
        self._futures[run_id] = future
        future.add_done_callback(lambda fut, rid=run_id: self._on_done(rid, fut))

    def _on_done(self, run_id: str, future: Future) -> None:
        try:
            future.result()
        except RunCancelledError:
            pass
        except Exception:  # noqa: BLE001 - status file already carries the failure
            status = self.status(run_id)
            if status and status.get("state") not in {s.value for s in TERMINAL_STATES}:
                self._artifacts.write_json(
                    run_id,
                    "status.json",
                    with_portal_provenance(
                        "status.json",
                        {
                            **status,
                            "state": RunState.FAILED.value,
                            "completed_at": _utc_now_iso(),
                            "failure": {
                                "code": "INTERNAL_ERROR",
                                "message": "worker process failed",
                            },
                        },
                    ),
                )

    # -- queries --------------------------------------------------------------

    def status(self, run_id: str) -> dict[str, Any] | None:
        try:
            return self._artifacts.read_json(run_id, "status.json")
        except FileNotFoundError:
            return None

    def list_runs(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        if not self._artifacts.root.is_dir():
            return records
        for directory in self._artifacts.root.iterdir():
            status_path = directory / "status.json"
            if not status_path.is_file():
                continue
            try:
                import json

                status = json.loads(status_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            records.append(
                {
                    "run_id": status.get("run_id", directory.name),
                    "status": status.get("state", "UNKNOWN"),
                    "protocol": status.get("protocol"),
                    "strategy_id": status.get("strategy_id"),
                    "symbol": status.get("symbol"),
                    "timeframe": status.get("timeframe"),
                    "created_at": status.get("created_at"),
                    "completed_at": status.get("completed_at"),
                }
            )
        return sorted(
            records,
            key=lambda item: item.get("completed_at") or item.get("created_at") or "",
            reverse=True,
        )

    def cancel(self, run_id: str) -> bool:
        status = self.status(run_id)
        if status is None or status.get("state") in {s.value for s in TERMINAL_STATES}:
            return False
        (self._artifacts.run_directory(run_id, create=True) / ".cancel").touch()
        return True

    def is_terminal(self, run_id: str) -> bool:
        status = self.status(run_id)
        return status is not None and status.get("state") in {s.value for s in TERMINAL_STATES}

    def shutdown(self) -> None:
        self._launcher.shutdown(wait=False, cancel_futures=True)
        self._executor.shutdown(wait=False, cancel_futures=True)
