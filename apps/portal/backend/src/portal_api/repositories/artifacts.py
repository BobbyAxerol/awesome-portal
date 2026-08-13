from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Mapping

import pandas as pd

from portal_api.domain.errors import ArtifactPathError
from portal_api.serialization import canonicalize

_RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")


def _json_default(value: Any) -> Any:
    # Canonical serializer (Phase P0, B2): no repr fallback, unknown types
    # raise SerializationError so artifacts never leak arbitrary objects.
    return canonicalize(value)


class ArtifactRepository:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def run_directory(self, run_id: str, *, create: bool = False) -> Path:
        if not _RUN_ID_PATTERN.fullmatch(run_id):
            raise ArtifactPathError("run_id contains unsafe characters")
        path = (self.root / run_id).resolve()
        if not path.is_relative_to(self.root):
            raise ArtifactPathError("run path escapes artifact root")
        if create:
            path.mkdir(parents=True, exist_ok=True)
        return path

    def _artifact_path(self, run_id: str, relative_path: str, *, create_parent: bool) -> Path:
        run_dir = self.run_directory(run_id, create=create_parent)
        relative = Path(relative_path)
        if relative.is_absolute() or ".." in relative.parts:
            raise ArtifactPathError("artifact path must be a safe relative path")
        path = (run_dir / relative).resolve()
        if not path.is_relative_to(run_dir):
            raise ArtifactPathError("artifact path escapes run directory")
        if create_parent:
            path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def write_json(self, run_id: str, relative_path: str, payload: Mapping[str, Any]) -> Path:
        path = self._artifact_path(run_id, relative_path, create_parent=True)
        encoded = json.dumps(
            dict(payload),
            default=_json_default,
            allow_nan=False,
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        ).encode("utf-8")
        self._atomic_write(path, encoded)
        return path

    def read_json(self, run_id: str, relative_path: str) -> dict[str, Any]:
        path = self._artifact_path(run_id, relative_path, create_parent=False)
        return json.loads(path.read_text(encoding="utf-8"))

    def write_frame(self, run_id: str, relative_path: str, frame: pd.DataFrame) -> Path:
        path = self._artifact_path(run_id, relative_path, create_parent=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        os.close(fd)
        temp_path = Path(temp_name)
        try:
            frame.to_parquet(temp_path, index=True)
            os.replace(temp_path, path)
        finally:
            temp_path.unlink(missing_ok=True)
        return path

    @staticmethod
    def _atomic_write(path: Path, payload: bytes) -> None:
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, path)
        finally:
            temp_path.unlink(missing_ok=True)
