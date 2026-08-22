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
    "schemas/execution-governance-paper-exit.v1.schema.json",
    "schemas/execution-realtime-event.v1.schema.json",
    "fixtures/problem.valid.json",
    "fixtures/command.valid.json",
    "fixtures/event.valid.json",
    "fixtures/keyset-page.valid.json",
    "fixtures/execution-projection-page.valid.json",
    "fixtures/execution-governance.r2-review.valid.json",
    "fixtures/execution-governance.paper-exit-review.valid.json",
    "fixtures/execution-realtime.auth-expiring.valid.json",
    "fixtures/execution-realtime.projection-gap.valid.json",
    "generated/portal-api.d.ts",
    "generated/execution-analytics.d.ts",
    "generated/execution-governance.d.ts",
    "generated/execution-realtime.d.ts",
    "openapi/execution-analytics.openapi.json",
    "openapi/execution-governance.openapi.json",
    "openapi/execution-realtime.openapi.json",
    "fixtures/execution-analytics.capital-preview.valid.json",
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
