#!/usr/bin/env python3
"""U17 benchmark gate (BAR-14): measure the Python query path before any
Rust extraction. Produces ``upgrade/backend/bar14/benchmark-report.json``
with p50/p95/p99, bytes, RSS and the extraction gate decision. Per the
guide, if the gate is not met, Rust remains NOT STARTED — not a failed
phase.

    PYTHONPATH=apps/portal/backend/src:apps/portal \\
      python apps/portal/scripts/benchmark_query_path.py
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import tracemalloc
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
PORTAL_ROOT = REPO_ROOT / "apps" / "portal"
OUTPUT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar14"

sys.path.insert(0, str(PORTAL_ROOT / "backend" / "src"))
sys.path.insert(0, str(PORTAL_ROOT))

# §15 extraction gate (metadata query target from BAR-01 §12 and U17 §15.6):
TARGET_P95_MS = 200.0
MIN_ITERATIONS = 20
GATE_SCHEMA_VERSION = "bar14.benchmark.v1"


def _sample_frame():
    import numpy as np
    import pandas as pd

    index = pd.date_range("2024-01-01", periods=200_000, freq="1min", tz="UTC")
    close = pd.Series(np.linspace(100.0, 200.0, len(index)), index=index)
    return pd.DataFrame(
        {
            "open": close + 0.1,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": 1000.0,
        },
        index=index,
    )


def run_benchmark(iterations: int = MIN_ITERATIONS) -> dict[str, Any]:
    import os

    # Query-path under measurement: DataCatalog SnapshotStore range query
    # plus downsampling over a synthetic 200k-row candle frame.
    from portal_api.services.data_catalog import SnapshotStore
    from portal_api.services.data_catalog import DataFamily, QualityProfile, ReleaseManifestRef

    family = DataFamily(
        family_id="benchmark-candle",
        label="benchmark",
        kind="candle",
        schema_version="candle.v1",
        activated=True,
        release_manifest=ReleaseManifestRef(
            manifest_sha256="0" * 64, accepted_at="2026-08-16T00:00:00Z"
        ),
        quality=QualityProfile(max_gap_ratio=0.05, max_duplicate_rows=0),
    )
    store = SnapshotStore(Path(os.getenv("TMPDIR", "/tmp")) / "bar14-benchmark-store")
    frame = _sample_frame()
    identity, _ = store.register(
        frame=frame, family=family, lineage=("benchmark:v1",), expected_frequency="1min"
    )

    latencies: list[float] = []
    tracemalloc.start()
    for _ in range(iterations):
        started = time.perf_counter()
        result = store.query(identity.snapshot_id, max_points=500)
        assert result["returned_points"] <= 500
        latencies.append((time.perf_counter() - started) * 1000)
    _, peak_rss = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    latencies.sort()
    report = {
        "schema_version": GATE_SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat(),
        "iterations": iterations,
        "rows": len(frame),
        "latency_ms": {
            "p50": round(statistics.median(latencies), 3),
            "p95": round(latencies[int(len(latencies) * 0.95) - 1], 3),
            "p99": round(latencies[int(len(latencies) * 0.99) - 1], 3),
            "max": round(latencies[-1], 3),
        },
        "peak_traced_bytes": peak_rss,
        "target_p95_ms": TARGET_P95_MS,
        "gate_met": latencies[int(len(latencies) * 0.95) - 1] <= TARGET_P95_MS,
        "decision": decide(latencies[int(len(latencies) * 0.95) - 1]),
    }
    return report


def decide(p95_ms: float) -> str:
    """Extraction gate decision; a failed gate keeps Rust NOT STARTED."""
    return "rust-extraction-eligible" if p95_ms <= TARGET_P95_MS else "rust-not-started"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=OUTPUT_ROOT,
        help="benchmark directory (default: upgrade/backend/bar14)",
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=MIN_ITERATIONS,
        help=f"query iterations (default: {MIN_ITERATIONS})",
    )
    args = parser.parse_args(argv)
    args.output_root.mkdir(parents=True, exist_ok=True)
    report = run_benchmark(args.iterations)
    target = args.output_root / "benchmark-report.json"
    target.write_text(
        json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"p95={report['latency_ms']['p95']}ms target={TARGET_P95_MS}ms "
        f"decision={report['decision']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
