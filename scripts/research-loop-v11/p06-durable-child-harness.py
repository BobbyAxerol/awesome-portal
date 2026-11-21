#!/usr/bin/env python3
"""P06 test-only bridge from a durable lease receipt to the isolated child.

This is intentionally not a worker daemon, NATS consumer, Control-API route or
generic Python launcher.  P10 owns the named producer and deployment-bound
transport.  The harness exists so P06 can prove one *claimed* PostgreSQL job
can execute the real P04 Delta calculation in the actual namespace-isolated
child and return only its bounded terminal receipt.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def _read_object(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.stat().st_size > 8 * 1024:
        raise ValueError("P06 launch receipt is absent or exceeds 8 KiB")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("P06 launch receipt must be a JSON object")
    return value


def _required_text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 160:
        raise ValueError(f"{label} must be a bounded non-empty string")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description="P06 durable lease-to-child test harness")
    parser.add_argument("--input", required=True)
    arguments = parser.parse_args()
    input_path = Path(arguments.input).resolve(strict=True)
    payload = _read_object(input_path)

    repository_root = Path(__file__).resolve().parents[2]
    backend_root = repository_root / "apps" / "portal" / "backend"
    sys.path[:0] = [str(backend_root / "src"), str(backend_root), str(backend_root.parent)]

    from portal_api.services.research_supervisor import (  # noqa: PLC0415
        IsolatedResearchSupervisor,
        ResearchChildReceipt,
    )

    job_id = _required_text(payload.get("job_id"), "job_id")
    run_id = _required_text(payload.get("run_id"), "run_id")
    worker_attempt_id = _required_text(payload.get("worker_attempt_id"), "worker_attempt_id")
    lease_epoch = payload.get("lease_epoch")
    if not isinstance(lease_epoch, int) or lease_epoch < 1:
        raise ValueError("lease_epoch must be a positive integer")
    market_path = Path(_required_text(payload.get("market_path"), "market_path"))
    scratch_root = Path(_required_text(payload.get("scratch_root"), "scratch_root"))
    artifact_root = Path(_required_text(payload.get("artifact_root"), "artifact_root"))

    supervisor = IsolatedResearchSupervisor(scratch_root, allowed_market_root=market_path.parent)
    result = supervisor.run_p04_delta_qualification(
        ResearchChildReceipt(
            job_id=job_id,
            run_id=run_id,
            worker_attempt_id=worker_attempt_id,
            lease_epoch=lease_epoch,
            market_path=market_path,
            artifact_root=artifact_root,
        )
    )
    # The worker terminal contract is numeric and bounded.  P06 does not
    # pretend the task receipt is an artifact: P05 remains the artifact owner.
    terminal = {
        "schema_version": "research.p06.durable-child-result.v1",
        "job_id": job_id,
        "run_id": run_id,
        "worker_attempt_id": worker_attempt_id,
        "lease_epoch": lease_epoch,
        "outcome": "SUCCEEDED",
        "engine_version": result.engine_version,
        "bars": result.bars,
        "num_trades": result.num_trades,
        "final_equity": result.final_equity,
        "network_namespace": result.network_namespace,
        "usage": {
            "peak_rss_bytes": max(0, result.peak_rss_bytes),
            "cpu_seconds": max(0, math.ceil(result.cpu_seconds)),
            "scratch_bytes": 0,
            "fd_peak": 0,
        },
    }
    print(json.dumps(terminal, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
