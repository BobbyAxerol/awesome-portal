#!/usr/bin/env python3
"""Snapshot the canonical contracts workspace (BAR-06 breaking-change gate).

Produces ``packages/contracts/contracts-snapshot.json``: sha256 digests of
every schema, fixture, generated type and the README. Any drift fails CI
before application tests.

    python packages/contracts/tooling/snapshot.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

CONTRACTS_ROOT = Path(__file__).resolve().parents[1]

TRACKED = (
    "README.md",
    "schemas/common.v1.schema.json",
    "schemas/problem.v1.schema.json",
    "schemas/command-envelope.v1.schema.json",
    "schemas/event-envelope.v1.schema.json",
    "schemas/keyset-page.v1.schema.json",
    "schemas/execution-projection-page.v1.schema.json",
    "schemas/execution-governance-r2-review.v1.schema.json",
    "schemas/execution-governance-approval-workflow.v1.schema.json",
    "schemas/execution-governance-paper-exit.v1.schema.json",
    "schemas/execution-realtime-event.v1.schema.json",
    "schemas/execution-analytics-series.v1.schema.json",
    "schemas/execution-event-envelope.v1.schema.json",
    "schemas/execution-command-center-snapshot.v1.schema.json",
    "schemas/execution-operations.v1.schema.json",
    "schemas/execution-staged-activation.v1.schema.json",
    "fixtures/problem.valid.json",
    "fixtures/command.valid.json",
    "fixtures/event.valid.json",
    "fixtures/keyset-page.valid.json",
    "fixtures/execution-projection-page.valid.json",
    "fixtures/execution-paper-workbench.orders-shadow.valid.json",
    "fixtures/execution-governance.r2-review.valid.json",
    "fixtures/execution-governance.r1-review.valid.json",
    "fixtures/execution-governance.approval-history.valid.json",
    "fixtures/execution-governance.paper-exit-review.valid.json",
    "fixtures/execution-realtime.auth-expiring.valid.json",
    "fixtures/execution-realtime.projection-gap.valid.json",
    "fixtures/execution-analytics.equity-projection.valid.json",
    "fixtures/execution-analytics.insight-line.valid.json",
    "fixtures/execution-analytics.insight-histogram.valid.json",
    "fixtures/execution-analytics.insight-funnel.valid.json",
    "fixtures/execution-analytics.insight-waterfall.valid.json",
    "fixtures/execution-analytics.insight-heatmap.valid.json",
    "fixtures/execution-analytics.insight-bar.valid.json",
    "fixtures/execution-events.corpus.valid.json",
    "fixtures/execution-command-center.busy.valid.json",
    "fixtures/execution-command-center.empty.valid.json",
    "fixtures/execution-command-center.partial.valid.json",
    "fixtures/execution-command-center.stale.valid.json",
    "fixtures/execution-command-center.unavailable.valid.json",
    "fixtures/execution-command-catalog.valid.json",
    "fixtures/execution-command-plan.valid.json",
    "fixtures/execution-command-operation.valid.json",
    "fixtures/execution-command-relay-denied.valid.json",
    "fixtures/execution-operations-queue.valid.json",
    "fixtures/execution-operation-workflow.valid.json",
    "fixtures/execution-incident-detail.open.valid.json",
    "fixtures/execution-incident-workflow.resolved.valid.json",
    "fixtures/execution-staged-activation.capabilities.valid.json",
    "fixtures/execution-staged-activation.plan-blocked.valid.json",
    "fixtures/execution-staged-activation.states.valid.json",
    "generated/portal-api.d.ts",
    "generated/execution-analytics.d.ts",
    "generated/execution-analytics-series.d.ts",
    "generated/execution-governance.d.ts",
    "generated/execution-realtime.d.ts",
    "generated/execution-command-center.d.ts",
    "generated/execution-operations.d.ts",
    "generated/execution-staged-activation.d.ts",
    "openapi/execution-analytics.openapi.json",
    "openapi/execution-analytics-series.openapi.json",
    "openapi/execution-governance.openapi.json",
    "openapi/execution-realtime.openapi.json",
    "openapi/execution-command-center.openapi.json",
    "openapi/execution-operations.openapi.json",
    "openapi/execution-staged-activation.openapi.json",
    "fixtures/execution-analytics.capital-preview.valid.json",
    "fixtures/execution-analytics.order-funnel.valid.json",
    "fixtures/execution-analytics.insight-batch.valid.json",
    "fixtures/execution-analytics.correlation.valid.json",
    "fixtures/execution-analytics.capital-ledger.valid.json",
    "fixtures/execution-analytics.binding-exposure.valid.json",
    "package.json",
)


def _digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def build_snapshot() -> dict[str, Any]:
    return {
        "schema_version": "contracts.snapshot.v1",
        "file_digests": {
            relative: _digest(CONTRACTS_ROOT / relative)
            for relative in sorted(TRACKED)
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=CONTRACTS_ROOT,
        help="contracts directory (default: packages/contracts)",
    )
    args = parser.parse_args(argv)
    target = args.output_root / "contracts-snapshot.json"
    target.write_text(
        json.dumps(build_snapshot(), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
