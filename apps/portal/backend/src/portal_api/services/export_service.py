"""Audit export service (Phase P3, plan §11/§12).

Builds a full-fidelity export directory per run — JSON manifests plus CSV
tables for every series and walk-forward ledger — and a zip bundle for HTTP
download. Export is derived from committed artifacts only; QuantBT is never
re-run.
"""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

import pandas as pd

from portal_api.repositories.artifacts import ArtifactRepository

_JSON_PATHS = (
    "manifest.json",
    "config.json",
    "strategy.json",
    "metrics.json",
    "selection/selected_params.json",
    "selection/selection_trace.json",
    "wfo/params_by_fold.json",
)

_FRAME_PATHS = (
    "series/is.parquet",
    "series/oos.parquet",
    "series/holdout_live.parquet",
    "series/stitched.parquet",
    "wfo/folds.parquet",
    "wfo/fold_selection.parquet",
    "wfo/fold_boundary.parquet",
    "wfo/trials.parquet",
    "wfo/candidates.parquet",
)


def export_run(artifacts: ArtifactRepository, run_id: str) -> Path:
    """Materialize the audit export directory and return its path."""
    run_dir = artifacts.run_directory(run_id)
    export_dir = run_dir / "export"
    if export_dir.exists():
        shutil.rmtree(export_dir)
    export_dir.mkdir(parents=True)

    for relative in _JSON_PATHS:
        source = run_dir / relative
        if source.is_file():
            target = export_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)

    for relative in _FRAME_PATHS:
        source = run_dir / relative
        if source.is_file():
            target = export_dir / relative.replace(".parquet", ".csv")
            target.parent.mkdir(parents=True, exist_ok=True)
            frame = pd.read_parquet(source)
            frame.to_csv(target, index=True)

    return export_dir


def export_bundle(artifacts: ArtifactRepository, run_id: str) -> Path:
    """Zip the export directory; returns the bundle path."""
    export_dir = export_run(artifacts, run_id)
    bundle = export_dir / f"{run_id}-export.zip"
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as handle:
        for path in sorted(export_dir.rglob("*")):
            if path.is_file() and path.suffix != ".zip":
                handle.write(path, path.relative_to(export_dir))
    return bundle
