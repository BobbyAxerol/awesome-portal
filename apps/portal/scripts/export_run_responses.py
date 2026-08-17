#!/usr/bin/env python3
"""Capture the HTTP responses the visual baseline needs from the run fixture.

``registry/fixtures/runs/visual-baseline-run/`` is a real run *artifact*
directory: parquet frames plus JSON. The Playwright visual baseline runs in a
Node-only container with no backend and no parquet reader, so it cannot read
those artifacts directly.

Rather than hand-write response bodies -- which would put invented run data in
the repository, exactly what the display rules forbid -- this script serves the
fixture through the **real FastAPI application** and records what it returns.
The stubs the baseline replays are therefore the API's own output.

Determinism: the fixture is bitwise reproducible (see ``export_run_fixture.py``)
and every captured endpoint is read-only, so re-running this produces identical
bodies. ``index.json`` records a digest of the artifact directory; the
Playwright suite asserts that digest still matches, so regenerating the run
fixture without regenerating these responses fails loudly instead of silently
baselining stale numbers.

Run from the repository root:

    PYTHONPATH=apps/portal/backend/src:apps/portal \
      python apps/portal/scripts/export_run_responses.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_ROOT = REPO_ROOT / "apps" / "portal" / "registry" / "fixtures" / "runs"
RUN_ID = "visual-baseline-run"
OUT_DIR = REPO_ROOT / "apps" / "portal" / "frontend" / "e2e" / "run-responses"

# Exactly the URLs the result screens build, query strings included. The
# `max_points` values differ per view on purpose: Overview asks for 3.000 and
# Execution for 4.000, and the fixture holds ~3.500 bars, so the baseline
# captures both a downsampled and an untouched envelope.
ENDPOINTS = [
    "/api/runs",
    f"/api/runs/{RUN_ID}",
    f"/api/runs/{RUN_ID}/audit",
    f"/api/runs/{RUN_ID}/summary",
    f"/api/runs/{RUN_ID}/config",
    f"/api/runs/{RUN_ID}/fold-plan",
    f"/api/runs/{RUN_ID}/ledger",
    f"/api/runs/{RUN_ID}/progress",
    f"/api/runs/{RUN_ID}/console?tail=2000",
    f"/api/runs/{RUN_ID}/wfo/trials?top_n=5000",
    f"/api/runs/{RUN_ID}/wfo/candidates",
    f"/api/runs/{RUN_ID}/wfo/folds",
    f"/api/runs/{RUN_ID}/wfo/parameters",
    f"/api/runs/{RUN_ID}/selection/trace",
    f"/api/runs/{RUN_ID}/series/stitched?max_points=3000",
    f"/api/runs/{RUN_ID}/series/stitched?max_points=4000",
    "/api/strategies",
    "/api/datasets",
    "/api/config/options",
    "/api/v1/alphas/imports",
]

# Two synthetic imports so the quarantine inbox baselines a populated screen
# with both persisted states, instead of only the empty case. The manifests are
# copied from the canonical alpha registry and re-identified, so they pass the
# real alpha-manifest.v1 schema.
IMPORT_ARTIFACT = b"synthetic-alpha-artifact-for-visual-baseline\n"
IMPORT_CASES = [
    ("vb-quarantined-alpha", "0.2.0", True),
    ("vb-digest-mismatch-alpha", "0.1.0", False),
]

# `import_id` is random and `received_at` is wall-clock, so both are pinned
# after capture. Nothing else is touched: state, digest_ok and the service's own
# `reason` string stay exactly as the pipeline produced them.
PINNED_IMPORT_IDS = {
    "vb-quarantined-alpha": "a1b2c3d4e5f60001",
    "vb-digest-mismatch-alpha": "a1b2c3d4e5f60002",
}
PINNED_RECEIVED_AT = {
    "vb-quarantined-alpha": "2026-08-17T09:40:00+00:00",
    "vb-digest-mismatch-alpha": "2026-08-17T09:12:00+00:00",
}


def artifact_digest(root: Path) -> str:
    """Content digest of the run fixture, path-sensitive and order-stable."""
    # Sort by the RELATIVE POSIX path, not by Path object or absolute string:
    # those orderings disagree once directories are involved ("config.json" vs
    # "config/fold_plan.json" sort differently under each), and the Playwright
    # side has to reproduce this byte for byte.
    files = sorted(
        (p.relative_to(root).as_posix(), p) for p in root.rglob("*") if p.is_file()
    )
    digest = hashlib.sha256()
    for relative_path, path in files:
        digest.update(relative_path.encode("utf-8"))
        digest.update(path.read_bytes())
    return f"sha256:{digest.hexdigest()}"


def slug(url: str) -> str:
    """Filesystem-safe name for a captured URL."""
    return (
        url.removeprefix("/api/")
        .replace(f"runs/{RUN_ID}", "run")
        .replace("/", "__")
        .replace("?", "--")
        .replace("&", "-")
        .replace("=", "_")
        or "root"
    )


def seed_imports(app: object) -> None:
    """Submit the synthetic imports through the real quarantine service."""
    import copy

    source = json.loads(
        (REPO_ROOT / "apps" / "portal" / "registry" / "alphas.v1.json").read_text(encoding="utf-8")
    )["alphas"][0]
    service = app.state.alpha_import_service  # type: ignore[attr-defined]
    good_digest = "sha256:" + hashlib.sha256(IMPORT_ARTIFACT).hexdigest()

    for alpha_id, version, digest_ok in IMPORT_CASES:
        manifest = copy.deepcopy(source)
        manifest["alpha_id"] = alpha_id
        manifest["version"] = version
        manifest["artifact"]["digest"] = good_digest if digest_ok else "sha256:" + "0" * 64
        service.submit(manifest, IMPORT_ARTIFACT)


def pin_imports(records: list[dict[str, object]]) -> list[dict[str, object]]:
    """Replace the two non-deterministic identity fields with pinned values."""
    for item in records:
        alpha_id = str(item.get("alpha_id"))
        if alpha_id in PINNED_IMPORT_IDS:
            item["import_id"] = PINNED_IMPORT_IDS[alpha_id]
            item["received_at"] = PINNED_RECEIVED_AT[alpha_id]
    return sorted(records, key=lambda item: str(item.get("received_at")), reverse=True)


def main() -> int:
    import tempfile

    os.environ["PORTAL_ARTIFACT_ROOT"] = str(FIXTURE_ROOT)
    os.environ["PORTAL_REGISTRY_ROOT"] = str(REPO_ROOT / "apps" / "portal" / "registry")
    # Quarantine writes real files; keep them out of the repository.
    os.environ["PORTAL_ALPHA_IMPORT_ROOT"] = tempfile.mkdtemp(prefix="portal-alpha-imports-")

    from fastapi.testclient import TestClient

    from portal_api.main import create_app

    app = create_app()
    seed_imports(app)
    client = TestClient(app)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.json"):
        stale.unlink()

    index: dict[str, object] = {
        "source": f"registry/fixtures/runs/{RUN_ID}",
        "source_digest": artifact_digest(FIXTURE_ROOT / RUN_ID),
        "run_id": RUN_ID,
        "endpoints": {},
    }
    endpoints: dict[str, str] = {}
    failed: list[str] = []

    for url in ENDPOINTS:
        response = client.get(url)
        if response.status_code != 200:
            failed.append(f"{response.status_code} {url}")
            continue
        body = response.json()
        if url.endswith("/alphas/imports"):
            body = pin_imports(body)
        name = f"{slug(url)}.json"
        # Compact and key-sorted: these are regenerated wholesale, never hand
        # edited, and the series bodies are large enough that pretty-printing
        # costs ~25% of the committed size for no review benefit.
        OUT_DIR.joinpath(name).write_text(
            json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        endpoints[url] = name

    if failed:
        print("FAILED to capture:\n  " + "\n  ".join(failed), file=sys.stderr)
        return 1

    index["endpoints"] = endpoints
    OUT_DIR.joinpath("index.json").write_text(
        json.dumps(index, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.json"))
    print(f"captured {len(endpoints)} responses -> {OUT_DIR.relative_to(REPO_ROOT)}/ ({total // 1024} KiB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
