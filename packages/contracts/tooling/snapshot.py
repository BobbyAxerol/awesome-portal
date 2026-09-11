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
    "schemas/execution-manager-realtime.v2.schema.json",
    "schemas/execution-command-tasks.v1.schema.json",
    "schemas/execution-analytics-series.v1.schema.json",
    "schemas/execution-query-analytics.v1.schema.json",
    "schemas/execution-event-envelope.v1.schema.json",
    "schemas/execution-command-center-snapshot.v1.schema.json",
    "schemas/execution-operations.v1.schema.json",
    "schemas/execution-staged-activation.v1.schema.json",
    "schemas/execution-intercell-gateway.v1.schema.json",
    "schemas/execution-intercell-gateway-current.v1.schema.json",
    "schemas/execution-emergency-routing.v1.schema.json",
    "schemas/execution-production-acceptance-current.v1.schema.json",
    "schemas/execution-paper-read.v1.schema.json",
    "schemas/execution-sandbox-certification.v1.schema.json",
    "schemas/execution-canary-control-room.v1.schema.json",
    "schemas/execution-live-full-operations.v1.schema.json",
    "schemas/execution-profile-read.v1.schema.json",
    "schemas/governance-live-review.v1.schema.json",
    "schemas/execution-manager-lists.v1.schema.json",
    "schemas/execution-alpha-fleet-list.v2.schema.json",
    "schemas/execution-contract-authority.v1.schema.json",
    "schemas/execution-market-context.v1.schema.json",
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
    "fixtures/execution-realtime.auth-expired.valid.json",
    "fixtures/execution-manager-realtime.live-empty.valid.json",
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
    "fixtures/execution-command-tasks.valid.json",
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
    "fixtures/execution-intercell-gateway.source-dark.valid.json",
    "fixtures/execution-intercell-gateway.event-corpus.valid.json",
    "fixtures/execution-intercell-gateway.artifact-corpus.valid.json",
    "fixtures/execution-intercell-gateway.current-paper.accepted.json",
    "fixtures/execution-emergency-routing.source-dark.valid.json",
    "fixtures/execution-emergency-routing.ui-corpus.valid.json",
    "fixtures/execution-production-acceptance.current-paper.accepted.json",
    "fixtures/execution-paper-overview.ready.valid.json",
    "fixtures/execution-paper-overview.empty.valid.json",
    "fixtures/execution-paper-overview.stale.valid.json",
    "fixtures/execution-paper-overview.partial.valid.json",
    "fixtures/execution-paper-overview.unavailable.valid.json",
    "fixtures/execution-paper-workbench.partial.valid.json",
    "fixtures/execution-paper-workbench-vnm.partial.valid.json",
    "fixtures/execution-full-blotter.partial.valid.json",
    "fixtures/execution-sandbox-certification.unavailable.valid.json",
    "fixtures/execution-canary-control-room.unavailable.valid.json",
    "fixtures/execution-live-full-operations.unavailable.valid.json",
    "fixtures/execution-sandbox-overview.ready.valid.json",
    "fixtures/execution-live-overview.empty.valid.json",
    "fixtures/execution-canary-live-facts.empty.valid.json",
    "fixtures/execution-account-broker-360.ready.valid.json",
    "fixtures/execution-query-analytics.empty.valid.json",
    "fixtures/execution-alpha-fleet-list.valid.json",
    "fixtures/execution-alpha-fleet-list.v2.valid.json",
    "fixtures/execution-bindings-list.valid.json",
    "fixtures/execution-binding-detail.valid.json",
    "fixtures/governance-live-review.valid.json",
    "fixtures/execution-contract-authority.valid.json",
    "fixtures/execution-market-context.latest.valid.json",
    "fixtures/execution-market-context.candles.valid.json",
    "generated/portal-api.d.ts",
    "generated/execution-analytics.d.ts",
    "generated/execution-analytics-series.d.ts",
    "generated/execution-query-analytics.d.ts",
    "generated/execution-governance.d.ts",
    "generated/execution-realtime.d.ts",
    "generated/execution-command-center.d.ts",
    "generated/execution-operations.d.ts",
    "generated/execution-staged-activation.d.ts",
    "generated/execution-intercell-gateway.d.ts",
    "generated/execution-emergency-routing.d.ts",
    "generated/execution-paper-read.d.ts",
    "generated/execution-canary.d.ts",
    "generated/execution-live-full.d.ts",
    "generated/execution-profile-read.d.ts",
    "generated/execution-manager-lists.d.ts",
    "generated/execution-contract-authority.d.ts",
    "generated/execution-market-context.d.ts",
    "openapi/execution-analytics.openapi.json",
    "openapi/execution-analytics-series.openapi.json",
    "openapi/execution-query-analytics.openapi.json",
    "openapi/execution-governance.openapi.json",
    "openapi/execution-realtime.openapi.json",
    "openapi/execution-command-center.openapi.json",
    "openapi/execution-operations.openapi.json",
    "openapi/execution-staged-activation.openapi.json",
    "openapi/execution-intercell-gateway.openapi.json",
    "openapi/execution-emergency-routing.openapi.json",
    "openapi/execution-paper-read.openapi.json",
    "openapi/execution-canary.openapi.json",
    "openapi/execution-live-full.openapi.json",
    "openapi/execution-profile-read.openapi.json",
    "openapi/execution-manager-lists.openapi.json",
    "openapi/execution-contract-authority.openapi.json",
    "openapi/execution-market-context.openapi.json",
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
    parser.add_argument(
        "--check",
        action="store_true",
        help=(
            "verify contracts-snapshot.json against the files on disk and exit "
            "non-zero on drift, instead of rewriting it"
        ),
    )
    args = parser.parse_args(argv)
    target = args.output_root / "contracts-snapshot.json"
    if args.check:
        expected = build_snapshot()
        try:
            recorded = json.loads(target.read_text(encoding="utf-8"))
        except FileNotFoundError:
            print(f"{target} is missing", file=sys.stderr)
            return 1
        drifted = sorted(
            relative
            for relative, digest in expected["file_digests"].items()
            if recorded.get("file_digests", {}).get(relative) != digest
        )
        stale = sorted(
            set(recorded.get("file_digests", {})) - set(expected["file_digests"])
        )
        if recorded.get("schema_version") != expected["schema_version"]:
            print(
                f"contracts-snapshot.json schema_version is "
                f"{recorded.get('schema_version')!r}, expected "
                f"{expected['schema_version']!r}",
                file=sys.stderr,
            )
            return 1
        if drifted or stale:
            for relative in drifted:
                print(f"drifted: {relative}", file=sys.stderr)
            for relative in stale:
                print(f"not tracked any more: {relative}", file=sys.stderr)
            print(
                "contracts-snapshot.json no longer describes the contracts it "
                "tracks. Run `python3 packages/contracts/tooling/snapshot.py` "
                "after changing a published contract, fixture or generated type.",
                file=sys.stderr,
            )
            return 1
        print(f"{target} matches all {len(expected['file_digests'])} tracked files")
        return 0
    target.write_text(
        json.dumps(build_snapshot(), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
