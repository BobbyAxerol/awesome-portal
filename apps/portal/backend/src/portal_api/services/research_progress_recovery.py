"""Bounded startup/interval recovery for P11 source journals.

The worker relay is intentionally non-authoritative: an acknowledged
Control-API callback may be lost after the source journal was fsync'd.  A
worker restart must therefore discover the small set of durable P10 journals
and replay them idempotently.  This module never starts a run, reads market
data, opens a broker, parses stdout, or touches a bundle; it only reuses the
already sealed journal and its immutable P10 envelope identity.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_progress_relay import ResearchProgressRelay, ResearchProgressRelayError


_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
_MAX_JOURNALS_PER_PASS = 8
_MAX_CONCURRENT_RELAYS = 4
_RECOVERY_INTERVAL_SECONDS = 5.0


@dataclass(frozen=True, slots=True)
class _JournalDescriptor:
    run_id: str
    attempt_id: str
    lease_epoch: int
    job_id: str
    workspace_id: str
    planned_trials: int


class ResearchProgressRecovery:
    """Replay no more than eight locally-owned journals per bounded pass."""

    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root.resolve()

    async def reconcile_once(self) -> int:
        """Return number of complete callback pages acknowledged this pass.

        A malformed/stale journal is intentionally skipped instead of being
        interpreted or deleted.  It remains locally auditable and cannot make
        the worker retry an execution or consume unbounded CPU/network.
        """

        if os.getenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "false").strip().lower() != "true":
            return 0
        semaphore = asyncio.Semaphore(_MAX_CONCURRENT_RELAYS)

        async def replay(descriptor: _JournalDescriptor) -> bool:
            try:
                async with semaphore:
                    journal = ResearchProgressJournal(
                        self._registry_root,
                        run_id=descriptor.run_id,
                        attempt_id=descriptor.attempt_id,
                        lease_epoch=descriptor.lease_epoch,
                        planned_trials=descriptor.planned_trials,
                    )
                    relay = ResearchProgressRelay.from_environment(
                        journal=journal,
                        job_id=descriptor.job_id,
                        workspace_id=descriptor.workspace_id,
                    )
                    return relay is not None and await relay.flush()
            except (OSError, ValueError, ResearchProgressError, ResearchProgressRelayError):
                # The journal is the recovery authority.  Do not delete it or
                # turn a source/callback outage into a new execution attempt.
                return False

        results = await asyncio.gather(*(replay(item) for item in self._discover()))
        return sum(1 for result in results if result)

    async def run_until(self, stopped: asyncio.Event) -> None:
        while not stopped.is_set():
            await self.reconcile_once()
            try:
                await asyncio.wait_for(stopped.wait(), timeout=_RECOVERY_INTERVAL_SECONDS)
            except TimeoutError:
                continue

    def _discover(self) -> list[_JournalDescriptor]:
        descriptors: list[_JournalDescriptor] = []
        if not self._registry_root.is_dir():
            return descriptors
        for run_dir in sorted(self._registry_root.iterdir(), key=lambda item: item.name):
            if len(descriptors) >= _MAX_JOURNALS_PER_PASS:
                break
            if not run_dir.is_dir() or not _ID_RE.fullmatch(run_dir.name):
                continue
            intent = self._read_object(run_dir / "run-intent.json")
            payload = intent.get("payload") if isinstance(intent, dict) else None
            if not isinstance(payload, dict):
                continue
            job_id = payload.get("job_id")
            workspace_id = payload.get("workspace_id")
            lease_epoch = payload.get("lease_epoch")
            if (
                not isinstance(job_id, str) or not _ID_RE.fullmatch(job_id)
                or not isinstance(workspace_id, str) or not _ID_RE.fullmatch(workspace_id)
                or not isinstance(lease_epoch, int) or isinstance(lease_epoch, bool) or lease_epoch < 1
            ):
                continue
            progress_root = run_dir / "progress"
            if not progress_root.is_dir():
                continue
            for attempt_dir in sorted(progress_root.iterdir(), key=lambda item: item.name):
                if len(descriptors) >= _MAX_JOURNALS_PER_PASS:
                    break
                if not attempt_dir.is_dir() or not _ID_RE.fullmatch(attempt_dir.name):
                    continue
                snapshot = self._read_object(attempt_dir / "snapshot.json")
                if (
                    snapshot.get("schema_version") != "research.progress-snapshot.v1"
                    or snapshot.get("run_id") != run_dir.name
                    or snapshot.get("attempt_id") != attempt_dir.name
                    or snapshot.get("lease_epoch") != lease_epoch
                ):
                    continue
                overall = snapshot.get("overall")
                planned_trials = overall.get("trials_declared") if isinstance(overall, dict) else None
                if not isinstance(planned_trials, int) or isinstance(planned_trials, bool) or planned_trials < 1:
                    continue
                descriptors.append(_JournalDescriptor(
                    run_id=run_dir.name,
                    attempt_id=attempt_dir.name,
                    lease_epoch=lease_epoch,
                    job_id=job_id,
                    workspace_id=workspace_id,
                    planned_trials=planned_trials,
                ))
        return descriptors

    @staticmethod
    def _read_object(path: Path) -> dict[str, Any]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}


__all__ = ["ResearchProgressRecovery"]
