#!/usr/bin/env python3
"""99_assemble.py — rebuild the pack index: SHA-256 manifest + coverage report.

Run last. Regenerates `MANIFEST.sha256` and `extract/COVERAGE.json`, which records
how much of each handoff §7 subsection is now backed by machine-readable evidence
rather than prose.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, PACK_ROOT, provenance, sha256_file, write_json  # noqa: E402

SKIP = {"__pycache__", ".git"}
# Both are outputs of this script, so they cannot contain their own hash.
SKIP_FILES = {"MANIFEST.sha256", "COVERAGE.json"}

# handoff subsection -> artifacts that answer it
COVERAGE_MAP = {
    "7.1 runtime identity": ["evidence/phaseF/runtime_identity.txt"],
    "7.2 machine-readable API": ["openapi.sanitized.json", "extract/api-surface.json"],
    "7.3 capability discovery": ["extract/vocabularies.json", "extract/runtime-probes.json",
                                 "capabilities.sanitized.json"],
    "7.4 query/read inventory": ["extract/api-surface.json", "extract/response-shapes.json",
                                "extract/serialization-contract.json"],
    "7.5 event/outbox inventory": ["extract/event-catalog.json"],
    "7.6 admin/CLI mapping": ["extract/cli-command-map.json", "extract/api-surface.json",
                              "extract/request-contracts.json", "command-catalog.yaml"],
    "7.7 authentication": ["extract/api-surface.json", "extract/runtime-probes.json",
                           "auth-contract.md"],
    "7.8 database boundary": ["extract/db-schema.json"],
    "7.9 freshness/venue policy": ["extract/freshness-authority.json",
                                   "extract/vocabularies.json",
                                   "extract/data-layer-contract.json"],
    "7.10 workload profile": ["workload-profile.md", "evidence/phaseF/runtime_identity.txt"],
    "7.11 failure/recovery": ["extract/error-catalog.json", "extract/event-catalog.json"],
    "7.12 safe test environment": ["extract/vocabularies.json", "extract/config-surface.json"],
    "7.13 observability": ["extract/config-surface.json", "extract/freshness-authority.json"],
    "7.14 contract evolution": ["extract/runtime-probes.json", "extract/vocabularies.json"],
    "§9 sanitized artifacts": ["REDACTION-AUDIT.json"],
}


def main() -> int:
    rows = []
    for p in sorted(PACK_ROOT.rglob("*")):
        if not p.is_file() or any(d in p.parts for d in SKIP) or p.name in SKIP_FILES:
            continue
        rel = str(p.relative_to(PACK_ROOT))
        rows.append({"file": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size})

    manifest = PACK_ROOT / "MANIFEST.sha256"
    manifest.write_text("".join(f"{r['sha256']}  {r['file']}\n" for r in rows))

    present = {r["file"] for r in rows}
    coverage = []
    for section, artifacts in COVERAGE_MAP.items():
        have = [a for a in artifacts if a in present]
        coverage.append({
            "handoff_section": section,
            "artifacts_expected": artifacts,
            "artifacts_present": have,
            "status": "COVERED" if len(have) == len(artifacts) else (
                "PARTIAL" if have else "MISSING"),
        })

    summaries = {}
    for f in sorted(OUT_DIR.glob("*.json")):
        try:
            summaries[f.name] = json.loads(f.read_text()).get("summary")
        except Exception:
            pass

    audit = PACK_ROOT / "REDACTION-AUDIT.json"
    payload = {
        "provenance": provenance("scripts/99_assemble.py", ["<entire contract pack>"]),
        "files": len(rows),
        "total_bytes": sum(r["bytes"] for r in rows),
        "redaction_audit": (json.loads(audit.read_text()).get("result")
                            if audit.exists() else "NOT_RUN"),
        "handoff_coverage": coverage,
        "extract_summaries": summaries,
        "manifest_note": "per-file hashes live in MANIFEST.sha256; verify with "
                         "`sha256sum -c MANIFEST.sha256`. MANIFEST.sha256 and this file "
                         "are excluded from it because they are outputs of this script.",
    }
    p = write_json("COVERAGE.json", payload)
    print(f"files={len(rows)} bytes={payload['total_bytes']} "
          f"redaction={payload['redaction_audit']}")
    for c in coverage:
        print(f"  [{c['status'][:4]:>4}] {c['handoff_section']}")
    print(f"wrote {manifest} and {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
