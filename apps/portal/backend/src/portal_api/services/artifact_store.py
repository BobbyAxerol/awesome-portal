"""Content-addressed immutable artifact authority (U11 / BAR-08-BE1).

Implements the §8.3/§8.4 commit protocol: write into an attempt-scoped temp
directory, verify required files, compute per-file sha256 checksums, finalize
into a content-addressed bundle and record a v2 manifest. Reopening always
resolves through digests; tampering is detected. Legacy prototype artifacts
can be imported explicitly (no rewrite in place).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from portal_api.domain.errors import PortalDomainError
from portal_api.serialization import canonicalize

BUNDLE_SCHEMA_VERSION = "2.0.0"
MANIFEST_FILE = "manifest.json"
CHECKSUMS_FILE = "checksums.sha256"


class ArtifactCommitError(PortalDomainError):
    code = "ARTIFACT_COMMIT_FAILED"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True, slots=True)
class CommittedBundle:
    bundle_sha256: str
    manifest_sha256: str
    location: str
    files: dict[str, str]


class ContentAddressedArtifactStore:
    """Local-first S3-compatible layout: blobs content-addressed + bundles.

    ``{root}/blobs/{sha256}`` stores every file by digest;
    ``{root}/runs/{run_id}/attempts/{attempt_id}/bundle/{bundle_sha256}/``
    holds the finalized manifest + checksums referencing the blobs. The
    layout maps one-to-one onto an S3 bucket path so the later object-store
    adapter swaps only the backend.
    """

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    @property
    def blobs_dir(self) -> Path:
        return self.root / "blobs"

    def temp_dir(self, run_id: str, attempt_id: str) -> Path:
        path = self.root / "runs" / run_id / "attempts" / attempt_id / "temp"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def bundle_dir(self, run_id: str, attempt_id: str, bundle_sha256: str) -> Path:
        return (
            self.root / "runs" / run_id / "attempts" / attempt_id / "bundle" / bundle_sha256
        )

    def stage_directory(self, source_dir: Path, temp_dir: Path) -> list[str]:
        """Copy an engine-produced run directory into the attempt temp area.

        Any pre-existing ``manifest.json`` is preserved as
        ``legacy/manifest.json`` so the content-addressed v2 manifest stays
        the single authority inside a bundle.
        """
        staged: list[str] = []
        for path in sorted(source_dir.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(source_dir)
            if path.name == MANIFEST_FILE:
                relative = Path("legacy") / MANIFEST_FILE
            target = temp_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
            staged.append(str(relative))
        return staged

    def put_blob(self, source: Path, *, digest: str | None = None) -> str:
        computed = digest or sha256_file(source)
        target = self.blobs_dir / computed
        if not target.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            temp = target.with_suffix(".tmp")
            shutil.copyfile(source, temp)
            os.replace(temp, target)
        if sha256_file(target) != computed:
            raise ArtifactCommitError("blob digest mismatch after write")
        return computed

    def commit_bundle(
        self,
        *,
        run_id: str,
        attempt_id: str,
        temp_dir: Path,
        required_files: tuple[str, ...],
        manifest_extra: dict[str, Any] | None = None,
    ) -> CommittedBundle:
        missing = [name for name in required_files if not (temp_dir / name).is_file()]
        if missing:
            raise ArtifactCommitError(f"required bundle files missing: {sorted(missing)}")

        file_digests: dict[str, str] = {}
        for path in sorted(temp_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.name == MANIFEST_FILE and path.parent == temp_dir:
                raise ArtifactCommitError("staged files must not contain a manifest")
            relative = str(path.relative_to(temp_dir))
            file_digests[relative] = self.put_blob(path)

        manifest = {
            "artifact_schema_version": BUNDLE_SCHEMA_VERSION,
            "run_id": run_id,
            "run_attempt_id": attempt_id,
            "status": "succeeded",
            "files": file_digests,
            "required_files": list(required_files),
            **(manifest_extra or {}),
        }
        manifest_payload = json.dumps(
            canonicalize(manifest), sort_keys=True, indent=2, separators=(",", ": ")
        ).encode("utf-8")
        manifest_sha256 = sha256_bytes(manifest_payload)
        bundle_sha256 = sha256_bytes(manifest_payload)

        bundle_dir = self.bundle_dir(run_id, attempt_id, bundle_sha256)
        bundle_dir.mkdir(parents=True, exist_ok=True)
        checksum_lines = [
            f"{digest}  {name}" for name, digest in sorted(file_digests.items())
        ]
        (bundle_dir / MANIFEST_FILE).write_bytes(manifest_payload)
        (bundle_dir / CHECKSUMS_FILE).write_text(
            "\n".join(checksum_lines) + "\n", encoding="utf-8"
        )
        return CommittedBundle(
            bundle_sha256=bundle_sha256,
            manifest_sha256=manifest_sha256,
            location=str(bundle_dir),
            files=file_digests,
        )

    def open_bundle(self, run_id: str, attempt_id: str, bundle_sha256: str) -> dict[str, Any]:
        bundle_dir = self.bundle_dir(run_id, attempt_id, bundle_sha256)
        manifest_path = bundle_dir / MANIFEST_FILE
        if not manifest_path.is_file():
            raise ArtifactCommitError("bundle manifest not found")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if sha256_file(manifest_path) != bundle_sha256:
            raise ArtifactCommitError("bundle manifest tampered")
        for name, digest in manifest["files"].items():
            blob = self.blobs_dir / digest
            if not blob.is_file() or sha256_file(blob) != digest:
                raise ArtifactCommitError(f"bundle file {name} is corrupt or missing")
        return manifest

    def reconcile(self) -> dict[str, int]:
        """Detect orphan/corrupt blobs and bundles; return counts."""
        orphan_blobs = 0
        referenced: set[str] = set()
        corrupt_bundles = 0
        runs_dir = self.root / "runs"
        if runs_dir.is_dir():
            for manifest_path in runs_dir.rglob(MANIFEST_FILE):
                try:
                    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    corrupt_bundles += 1
                    continue
                if sha256_file(manifest_path) != manifest_path.parent.name:
                    corrupt_bundles += 1
                    continue
                for digest in manifest.get("files", {}).values():
                    referenced.add(digest)
        if self.blobs_dir.is_dir():
            for blob in self.blobs_dir.iterdir():
                if blob.is_file() and blob.name not in referenced:
                    orphan_blobs += 1
        return {"orphan_blobs": orphan_blobs, "corrupt_bundles": corrupt_bundles}

    def import_legacy_artifacts(
        self,
        *,
        run_id: str,
        attempt_id: str,
        legacy_run_dir: Path,
        required_files: tuple[str, ...],
    ) -> CommittedBundle:
        """Explicit one-shot import of a legacy prototype run directory."""
        temp_dir = self.temp_dir(run_id, attempt_id)
        for path in sorted(legacy_run_dir.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(legacy_run_dir)
            if path.name == MANIFEST_FILE:
                relative = Path("legacy") / MANIFEST_FILE
            target = temp_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        return self.commit_bundle(
            run_id=run_id,
            attempt_id=attempt_id,
            temp_dir=temp_dir,
            required_files=required_files,
            manifest_extra={"imported_from": "legacy-prototype-v1"},
        )


__all__ = [
    "BUNDLE_SCHEMA_VERSION",
    "ArtifactCommitError",
    "CommittedBundle",
    "ContentAddressedArtifactStore",
    "sha256_bytes",
    "sha256_file",
]
