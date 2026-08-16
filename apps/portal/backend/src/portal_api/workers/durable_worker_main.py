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
    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=execute_run_in_process,
        lease_seconds=_parse_seconds("PORTAL_WORKER_LEASE_SECONDS", DEFAULT_LEASE_SECONDS),
        grace_seconds=_parse_seconds("PORTAL_WORKER_GRACE_SECONDS", DEFAULT_GRACE_SECONDS),
    )
    await worker.start()

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, stop.set)

    logger.info("durable quant worker started (nats=%s)", servers)
    await stop.wait()
    await worker.stop()
    logger.info("durable quant worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
