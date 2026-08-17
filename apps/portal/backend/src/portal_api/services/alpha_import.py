"""Quarantine alpha ingest authority (U14 slice, BAR-21 foundation).

Import never touches the source-controlled registry: ``alphas.v1.json``
stays immutable and the public ``/api/v1/alphas`` document keeps exposing
only registered manifests. An import lands in a **runtime quarantine store**
and stays there until a certification slice promotes it.

Imported alphas are never executable by construction: they have no runtime
strategy adapter registered and never surface in the public alpha document,
so a run against them cannot be requested (quarantine blocks everything,
even with a crafted request — same invariant as ``quarantine_block``).
"""

from __future__ import annotations

import hashlib
import json
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
    """Quarantine ingest pipeline (digest verify, fail-closed states)."""

    def __init__(self, registry_root: Path, import_root: Path) -> None:
        self._registry_root = registry_root
        self._import_root = import_root
        self._registry = AlphaRegistry(registry_root)

    def submit(self, manifest: dict[str, object], artifact_bytes: bytes) -> AlphaImportRecord:
        """Verify + quarantine an incoming alpha package.

        No code is executed and nothing is ever added to the source registry.
        """
        received_at = datetime.now(UTC).isoformat()

        try:
            alpha_id = str(manifest["alpha_id"])
            version = str(manifest["version"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AlphaImportError("manifest must declare alpha_id and version") from exc

        schema_error = self._validate_manifest(manifest)
        if schema_error is not None:
            return self._record(
                alpha_id,
                version,
                state="INVALID_MANIFEST",
                digest_ok=False,
                received_at=received_at,
                reason=schema_error,
                write=False,
            )

        try:
            self._registry.get_version(alpha_id, version)
            return self._record(
                alpha_id,
                version,
                state="ALREADY_REGISTERED",
                digest_ok=False,
                received_at=received_at,
                reason="alpha version is already registered in the immutable registry",
                write=False,
            )
        except PortalDomainError:
            pass

        if self._existing(alpha_id, version) is not None:
            return self._record(
                alpha_id,
                version,
                state="ALREADY_REGISTERED",
                digest_ok=False,
                received_at=received_at,
                reason="an import for this alpha version already exists",
                write=False,
            )

        registered_digest = str(manifest["artifact"]["digest"])
        computed = f"sha256:{hashlib.sha256(artifact_bytes).hexdigest()}"
        digest_ok = computed == registered_digest
        state: ImportState = "QUARANTINED" if digest_ok else "DIGEST_MISMATCH"
        record = self._record(
            alpha_id,
            version,
            state=state,
            digest_ok=digest_ok,
            received_at=received_at,
            reason=None if digest_ok else f"artifact digest mismatch: expected {registered_digest}",
            write=True,
            manifest=manifest,
            artifact_bytes=artifact_bytes,
        )
        return record

    def list(self) -> tuple[AlphaImportRecord, ...]:
        if not self._import_root.is_dir():
            return ()
        records: list[AlphaImportRecord] = []
        for import_file in self._import_root.rglob("import.json"):
            try:
                records.append(
                    AlphaImportRecord.model_validate_json(import_file.read_text(encoding="utf-8"))
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
        manifest: dict[str, object] | None = None,
        artifact_bytes: bytes | None = None,
    ) -> AlphaImportRecord:
        record = AlphaImportRecord(
            import_id=uuid.uuid4().hex[:16],
            alpha_id=alpha_id,
            version=version,
            state=state,
            digest_ok=digest_ok,
            received_at=received_at,
            reason=reason,
        )
        if not write:
            return record
        target = self._import_root / alpha_id / version
        target.mkdir(parents=True, exist_ok=True)
        target.joinpath("import.json").write_text(
            record.model_dump_json(indent=2) + "\n", encoding="utf-8"
        )
        if manifest is not None:
            target.joinpath("manifest.json").write_text(
                json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
            )
        if artifact_bytes is not None:
            target.joinpath("artifact.bin").write_bytes(artifact_bytes)
        return record
