"""Durable worker entrypoint (U11 / BAR-08-BE3).

    python -m portal_api.workers.durable_worker_main

Reads NATS_URL, PORTAL_ARTIFACT_ROOT, PORTAL_WORKER_LEASE_SECONDS and
PORTAL_WORKER_GRACE_SECONDS. Consumes ``quant.run.requested.>`` from the
QUANT_JOBS JetStream stream, executes through the existing engine and
finalizes content-addressed bundles before acking.
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
from pathlib import Path

from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.durable_runs import (
    DEFAULT_GRACE_SECONDS,
    DEFAULT_LEASE_SECONDS,
    AttemptRegistry,
)
from portal_api.services.job_broker import NatsJetStreamBroker
from portal_api.services.data_catalog import SnapshotStore
from portal_api.services.research_run_producer import ResearchRunProducerExecutor
from portal_api.services.research_progress_recovery import ResearchProgressRecovery
from portal_api.services.research_supervisor import IsolatedResearchSupervisor
from portal_api.workers.durable_worker import (
    DurableQuantWorker,
    execute_run_in_process,
)

logger = logging.getLogger("portal_api.durable_worker_main")


def _parse_seconds(name: str, default: float) -> float:
    raw = os.getenv(name)
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


async def run() -> None:
    logging.basicConfig(level=logging.INFO)
    servers = [
        item.strip()
        for item in os.getenv("NATS_URL", "nats://portal-nats:4222").split(",")
    ]
    artifact_root = Path(
        os.getenv("PORTAL_ARTIFACT_ROOT", "/var/lib/portal/artifacts/runs")
    )

    broker = NatsJetStreamBroker(servers)
    await broker.connect()
    registry = AttemptRegistry(artifact_root / "durable")
    store = ContentAddressedArtifactStore(artifact_root / "durable-store")
    research_executor = None
    if os.getenv("PORTAL_FEATURE_RESEARCH_RUN_PRODUCER", "false").strip().lower() == "true":
        snapshot_root = Path(
            os.getenv("PORTAL_SNAPSHOT_ROOT", str(artifact_root / "snapshots"))
        )
        market_root = Path(
            os.getenv("PORTAL_RESEARCH_P10_MARKET_ROOT", str(artifact_root / "p10-market"))
        )
        scratch_root = Path(
            os.getenv("PORTAL_RESEARCH_P10_SCRATCH_ROOT", str(artifact_root / "p10-scratch"))
        )
        market_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        research_executor = ResearchRunProducerExecutor(
            snapshots=SnapshotStore(snapshot_root),
            supervisor=IsolatedResearchSupervisor(
                scratch_root,
                allowed_market_root=market_root,
            ),
            market_root=market_root,
        )
    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=execute_run_in_process,
        research_executor=research_executor,
        lease_seconds=_parse_seconds("PORTAL_WORKER_LEASE_SECONDS", DEFAULT_LEASE_SECONDS),
        grace_seconds=_parse_seconds("PORTAL_WORKER_GRACE_SECONDS", DEFAULT_GRACE_SECONDS),
    )
    await worker.start()

    stop = asyncio.Event()
    progress_recovery_task: asyncio.Task[None] | None = None
    if os.getenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "false").strip().lower() == "true":
        # P11 callbacks are at-least-once.  This tiny bounded reconciler is
        # what makes a source journal useful after a worker/Control-API
        # restart instead of merely during the original in-process run.
        recovery = ResearchProgressRecovery(artifact_root / "durable")
        progress_recovery_task = asyncio.create_task(recovery.run_until(stop))
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, stop.set)

    logger.info("durable quant worker started (nats=%s)", servers)
    await stop.wait()
    if progress_recovery_task is not None:
        try:
            await progress_recovery_task
        except asyncio.CancelledError:
            pass
    await worker.stop()
    logger.info("durable quant worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
