"""Quarantine alpha ingest authority (U14 slice, BAR-21 foundation).

Import never touches the source-controlled registry: ``alphas.v1.json``
stays immutable and the public ``/api/v1/alphas`` document keeps exposing
only registered manifests. An import lands in a **runtime quarantine store**
and stays there until a certification slice promotes it.

Ingest channel (R11, per ``STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md`` §5):
the browser never uploads code. The client submits only a **source
reference** — ``artifact_relpath`` pointing at a reviewed artifact that CI
or the owner has already placed in the ingest inbox
(``PORTAL_ALPHA_ARTIFACT_ROOT``), plus the expected digest. The server reads
that file, verifies the digest and quarantines it; no bytes travel through
the browser and the server never fetches an arbitrary remote URI (no SSRF).

Imported alphas are never executable by construction: they have no runtime
strategy adapter registered and never surface in the public alpha document,
so a run against them cannot be requested (quarantine blocks everything,
even with a crafted request — same invariant as ``quarantine_block``).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from portal_api.domain.errors import PortalDomainError
from portal_api.services.alpha_registry import (
    ALPHAS_FILE,
    ALPHAS_SCHEMA,
    AlphaRegistry,
)

ImportState = Literal[
    "PENDING_DIGEST",
    "DIGEST_MISMATCH",
    "INVALID_MANIFEST",
    "ALREADY_REGISTERED",
    "QUARANTINED",
]


class AlphaImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    alpha_id: str = Field(pattern=r"^[a-z][a-z0-9-]{2,63}$")
    version: str = Field(pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$")
    artifact_relpath: str = Field(min_length=1, max_length=512)
    expected_digest: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    git_ref: str | None = Field(default=None, max_length=256)


class AlphaImportRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    import_id: str
    alpha_id: str
    version: str
    state: ImportState
    digest_ok: bool
    received_at: str
    reason: str | None = None


class AlphaImportError(PortalDomainError):
    code = "ALPHA_IMPORT_DENIED"


class AlphaImportService:
    """Quarantine ingest pipeline (source reference, digest verify, fail-closed)."""

    def __init__(self, registry_root: Path, import_root: Path, artifact_root: Path) -> None:
        self._registry_root = registry_root
        self._import_root = import_root
        self._artifact_root = artifact_root
        self._registry = AlphaRegistry(registry_root)

    def submit(self, request: AlphaImportRequest) -> AlphaImportRecord:
        """Verify + quarantine an artifact already staged in the ingest inbox.

        No code is executed, nothing is fetched remotely and nothing is ever
        added to the source registry.
        """
        received_at = datetime.now(UTC).isoformat()

        artifact_path = self._resolve_in_inbox(request.artifact_relpath)
        if artifact_path is None or not artifact_path.is_file():
            return self._record(
                request.alpha_id,
                request.version,
                state="INVALID_MANIFEST",
                digest_ok=False,
                received_at=received_at,
                reason="artifact reference does not exist in the ingest inbox",
                write=False,
            )

        manifest = self._read_adjacent_manifest(artifact_path)
        if manifest is None:
            return self._record(
                request.alpha_id,
                request.version,
                state="INVALID_MANIFEST",
                digest_ok=False,
                received_at=received_at,
                reason="manifest.json is missing next to the artifact",
                write=False,
            )
        schema_error = self._validate_manifest(manifest)
        if schema_error is not None:
            return self._record(
                request.alpha_id,
                request.version,
                state="INVALID_MANIFEST",
                digest_ok=False,
                received_at=received_at,
                reason=schema_error,
                write=False,
            )

        if str(manifest.get("alpha_id")) != request.alpha_id or str(
            manifest.get("version")
        ) != request.version:
            return self._record(
                request.alpha_id,
                request.version,
                state="INVALID_MANIFEST",
                digest_ok=False,
                received_at=received_at,
                reason="manifest identity does not match the requested alpha_id/version",
                write=False,
            )

        try:
            self._registry.get_version(request.alpha_id, request.version)
            return self._record(
                request.alpha_id,
                request.version,
                state="ALREADY_REGISTERED",
                digest_ok=False,
                received_at=received_at,
                reason="alpha version is already registered in the immutable registry",
                write=False,
            )
        except PortalDomainError:
            pass

        if self._existing(request.alpha_id, request.version) is not None:
            return self._record(
                request.alpha_id,
                request.version,
                state="ALREADY_REGISTERED",
                digest_ok=False,
                received_at=received_at,
                reason="an import for this alpha version already exists",
                write=False,
            )

        computed = f"sha256:{hashlib.sha256(artifact_path.read_bytes()).hexdigest()}"
        manifest_digest = str(manifest.get("artifact", {}).get("digest", ""))
        digest_ok = (
            computed == request.expected_digest and computed == manifest_digest
        )
        state: ImportState = "QUARANTINED" if digest_ok else "DIGEST_MISMATCH"
        record = self._record(
            request.alpha_id,
            request.version,
            state=state,
            digest_ok=digest_ok,
            received_at=received_at,
            reason=None if digest_ok else f"artifact digest mismatch (expected {request.expected_digest})",
            write=False,
        )
        if not digest_ok:
            return record

        target = self._import_root / request.alpha_id / request.version
        target.mkdir(parents=True, exist_ok=True)
        target.joinpath("import.json").write_text(
            record.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        target.joinpath("manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        shutil.copy2(artifact_path, target / "artifact.bin")
        return record

    def list(self) -> tuple[AlphaImportRecord, ...]:
        if not self._import_root.is_dir():
            return ()
        records: list[AlphaImportRecord] = []
        for import_file in self._import_root.rglob("import.json"):
            try:
                records.append(
                    AlphaImportRecord.model_validate_json(
                        import_file.read_text(encoding="utf-8")
                    )
                )
            except (OSError, ValidationError):
                continue
        return tuple(
            sorted(records, key=lambda item: item.received_at, reverse=True)
        )

    def get(self, alpha_id: str, version: str) -> AlphaImportRecord | None:
        for record in self.list():
            if record.alpha_id == alpha_id and record.version == version:
                return record
        return None

    # -- internals -----------------------------------------------------------

    def _resolve_in_inbox(self, relpath: str) -> Path | None:
        try:
            candidate = (self._artifact_root / relpath).resolve()
        except OSError:
            return None
        root = self._artifact_root.resolve()
        if not candidate.is_relative_to(root):
            return None
        return candidate

    def _read_adjacent_manifest(self, artifact_path: Path) -> dict[str, object] | None:
        candidate = artifact_path.parent / "manifest.json"
        try:
            payload = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return payload if isinstance(payload, dict) else None

    def _validate_manifest(self, manifest: dict[str, object]) -> str | None:
        try:
            schema = json.loads(
                (self._registry_root / "schemas" / ALPHAS_SCHEMA).read_text(encoding="utf-8")
            )
            Draft202012Validator.check_schema(schema)
        except (OSError, json.JSONDecodeError, SchemaError) as exc:
            return f"alpha manifest schema unavailable: {exc}"
        errors = sorted(
            Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(manifest),
            key=lambda error: tuple(str(item) for item in error.absolute_path),
        )
        return None if not errors else errors[0].message

    def _existing(self, alpha_id: str, version: str) -> AlphaImportRecord | None:
        path = self._import_root / alpha_id / version / "import.json"
        try:
            return AlphaImportRecord.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return None

    def _record(
        self,
        alpha_id: str,
        version: str,
        *,
        state: ImportState,
        digest_ok: bool,
        received_at: str,
        reason: str | None,
        write: bool,
    ) -> AlphaImportRecord:
        return AlphaImportRecord(
            import_id=uuid.uuid4().hex[:16],
            alpha_id=alpha_id,
            version=version,
            state=state,
            digest_ok=digest_ok,
            received_at=received_at,
            reason=reason,
        )
