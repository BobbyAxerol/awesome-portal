"""Research Loop P05: disk-first immutable artifact primitives.

This module is deliberately separate from the legacy ``ArtifactRepository``
and ``ContentAddressedArtifactStore``.  Those paths remain a compatibility
surface until P10 moves named Research operations to the durable authority.
New Research workers use this module only: they write bounded Arrow batches to
random staging directories, seal an immutable manifest using fsync/rename, and
return an opaque candidate to the Control API.  The Control API remains the
only authority allowed to register a candidate as a durable `SEALED` artifact.

The module never opens a database, a broker, a Trading System connection, or a
browser-facing route.  That keeps a Python worker an adapter/writer rather than
an authority and makes a worker crash recoverable from disk alone.
"""

from __future__ import annotations

import base64
import errno
import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import tempfile
import zipfile
from collections import OrderedDict
from collections.abc import Callable, Generator, Iterable, Mapping
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path, PurePosixPath
from typing import Any, Final, Literal

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

from portal_api.domain.errors import PortalDomainError


MANIFEST_SCHEMA_VERSION: Final = "research.artifact-manifest.v1"
PART_SCHEMA_VERSION: Final = "research.parquet-part.v1"
DEFAULT_MAX_BATCH_BYTES: Final = 16 * 1024 * 1024
DEFAULT_MAX_BUFFERED_BYTES: Final = 64 * 1024 * 1024
DEFAULT_MAX_PAGE_ROWS: Final = 200
DEFAULT_MAX_PAGE_BYTES: Final = 1024 * 1024
DEFAULT_MAX_MANIFEST_BYTES: Final = 256 * 1024
DEFAULT_EXPORT_CHUNK_BYTES: Final = 64 * 1024
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ResearchArtifactError(PortalDomainError):
    """Typed P05 failure; callers must not relabel it as a sealed artifact."""

    code = "RESEARCH_ARTIFACT_FAILED"

    def __init__(self, reason: str, detail: str) -> None:
        self.reason = reason
        super().__init__(f"{reason}: {detail}")


class ArtifactFaultInjected(RuntimeError):
    """Test-only crash marker injected at a named seal transition."""


ArtifactReferenceKind = Literal[
    "ACTIVE_LEASE",
    "CHILD_RUN",
    "EXPOSURE",
    "RELEASE_CANDIDATE",
    "SELECTION",
    "VERIFICATION",
]


@dataclass(frozen=True, slots=True)
class ArtifactFence:
    """Lease identity supplied by the Control API, never inferred locally."""

    workspace_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int

    def __post_init__(self) -> None:
        for name, value in (
            ("workspace_id", self.workspace_id),
            ("run_id", self.run_id),
            ("worker_attempt_id", self.worker_attempt_id),
        ):
            _require_safe_id(value, name)
        if not isinstance(self.lease_epoch, int) or self.lease_epoch < 1:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "lease_epoch must be positive")


@dataclass(frozen=True, slots=True)
class ArtifactIdentity:
    """Immutable provenance supplied at reservation time by the Control API."""

    artifact_id: str
    artifact_revision: int
    workspace_id: str
    run_id: str
    engine_release_id: str
    engine_build_ref: str
    request_spec_digest: str
    effective_spec_digest: str
    dataset_binding_digest: str
    retention_class: str = "RESEARCH_EVIDENCE"

    def __post_init__(self) -> None:
        _require_safe_id(self.artifact_id, "artifact_id")
        _require_safe_id(self.workspace_id, "workspace_id")
        _require_safe_id(self.run_id, "run_id")
        if not isinstance(self.artifact_revision, int) or self.artifact_revision < 1:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "artifact_revision must be positive")
        for label, digest in (
            ("request_spec_digest", self.request_spec_digest),
            ("effective_spec_digest", self.effective_spec_digest),
            ("dataset_binding_digest", self.dataset_binding_digest),
        ):
            _require_digest(digest, label)
        if not self.engine_release_id or not self.engine_build_ref or not self.retention_class:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "identity provenance is incomplete")


@dataclass(frozen=True, slots=True)
class ArtifactQuota:
    """Byte-based limits.  They are deliberately independent of row counts."""

    max_batch_bytes: int = DEFAULT_MAX_BATCH_BYTES
    max_buffered_bytes: int = DEFAULT_MAX_BUFFERED_BYTES
    max_staging_bytes: int = 5 * 1024 * 1024 * 1024
    max_page_rows: int = DEFAULT_MAX_PAGE_ROWS
    max_page_bytes: int = DEFAULT_MAX_PAGE_BYTES
    max_manifest_bytes: int = DEFAULT_MAX_MANIFEST_BYTES

    def __post_init__(self) -> None:
        values = (
            self.max_batch_bytes,
            self.max_buffered_bytes,
            self.max_staging_bytes,
            self.max_page_rows,
            self.max_page_bytes,
            self.max_manifest_bytes,
        )
        if any(not isinstance(value, int) or value <= 0 for value in values):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "artifact quota values must be positive")
        if self.max_batch_bytes > self.max_buffered_bytes:
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_INVALID",
                "max_batch_bytes cannot exceed max_buffered_bytes",
            )


@dataclass(frozen=True, slots=True)
class ArtifactTableSchema:
    """Versioned Arrow schema for one logical immutable table."""

    table_kind: str
    schema_version: str
    arrow_schema: pa.Schema
    sequence_column: str | None = None
    id_column: str | None = None
    units: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _require_safe_id(self.table_kind, "table_kind")
        if not self.schema_version:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "schema_version is required")
        names = set(self.arrow_schema.names)
        if len(names) != len(self.arrow_schema.names):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "Arrow schema contains duplicate columns")
        if self.sequence_column is not None and self.sequence_column not in names:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "sequence column is not in schema")
        if self.id_column is not None and self.id_column not in names:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "id column is not in schema")
        if not set(self.units).issubset(names):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "unit keys must be schema columns")

    @property
    def fingerprint(self) -> str:
        return hashlib.sha256(str(self.arrow_schema).encode("utf-8")).hexdigest()

    def validate_batch(self, batch: pa.RecordBatch) -> None:
        if not batch.schema.equals(self.arrow_schema, check_metadata=False):
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_SCHEMA_MISMATCH",
                f"batch for {self.table_kind} differs from registered Arrow schema",
            )
        if batch.nbytes > 0 and batch.nbytes > DEFAULT_MAX_BUFFERED_BYTES:
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_BACKPRESSURE",
                "one Arrow batch exceeds the absolute bounded writer ceiling",
            )


class ArtifactSchemaRegistry:
    """Small explicit registry; unknown tables cannot silently serialize."""

    def __init__(self, definitions: Iterable[ArtifactTableSchema] = ()) -> None:
        self._definitions: dict[str, ArtifactTableSchema] = {}
        for definition in definitions:
            self.register(definition)

    def register(self, definition: ArtifactTableSchema) -> None:
        prior = self._definitions.get(definition.table_kind)
        if prior is not None and prior != definition:
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_SCHEMA_CONFLICT",
                f"table kind {definition.table_kind!r} is already registered",
            )
        self._definitions[definition.table_kind] = definition

    def require(self, table_kind: str) -> ArtifactTableSchema:
        try:
            return self._definitions[table_kind]
        except KeyError as exc:
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_UNKNOWN_TABLE",
                f"table kind {table_kind!r} is not registered",
            ) from exc


@dataclass(frozen=True, slots=True)
class ArtifactPart:
    table_kind: str
    part_ordinal: int
    relative_path: str
    sha256: str
    rows: int
    bytes: int
    sequence_min: str | int | float | None
    sequence_max: str | int | float | None


@dataclass(frozen=True, slots=True)
class SealedArtifactCandidate:
    """A filesystem candidate only; it is not a Control-API sealed artifact."""

    artifact_id: str
    artifact_revision: int
    storage_locator: str
    manifest_digest: str
    manifest_schema_version: str
    total_rows: int
    total_bytes: int
    table_count: int


def build_control_api_seal_request(
    store: "ResearchArtifactStore",
    candidate: SealedArtifactCandidate,
) -> dict[str, Any]:
    """Build the exact bounded, non-secret P05 seal DTO for Control API.

    This is deliberately a pure disk-to-DTO bridge: the Python writer has no
    database credential and cannot transition an artifact to `SEALED`. P06 will submit
    this DTO only through its lease-scoped durable worker protocol after the
    Control API has reserved the artifact revision. Re-reading and verifying
    sealed bytes here prevents a stale candidate object from being used to
    publish different on-disk data.
    """

    manifest, manifest_digest = store._load_and_verify_manifest(candidate.artifact_id, verify_parts=True)
    if (
        manifest_digest != candidate.manifest_digest
        or manifest["schema_version"] != candidate.manifest_schema_version
        or manifest["artifact_revision"] != candidate.artifact_revision
        or manifest["totals"]["rows"] != candidate.total_rows
        or manifest["totals"]["bytes"] != candidate.total_bytes
    ):
        raise ResearchArtifactError(
            "RESEARCH_ARTIFACT_CONFLICT",
            "sealed candidate facts no longer match verified manifest bytes",
        )
    parts: list[dict[str, Any]] = []
    for table in manifest["tables"]:
        for part in table["parts"]:
            parts.append(
                {
                    "tableKind": table["table_kind"],
                    "schemaVersion": table["schema_version"],
                    "partOrdinal": part["part_ordinal"],
                    "relativePath": part["relative_path"],
                    "partDigest": part["sha256"],
                    "rowCount": part["rows"],
                    "byteCount": part["bytes"],
                    "sequenceMin": _sequence_transport_value(part["sequence_min"]),
                    "sequenceMax": _sequence_transport_value(part["sequence_max"]),
                }
            )
    if len(parts) > 512:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_BACKPRESSURE", "seal request exceeds bounded part count")
    return {
        "artifactId": candidate.artifact_id,
        "workerAttemptId": manifest["worker_attempt_id"],
        "leaseEpoch": manifest["lease_epoch"],
        "manifestDigest": manifest_digest,
        "manifestSchemaVersion": manifest["schema_version"],
        "totalRows": candidate.total_rows,
        "totalBytes": candidate.total_bytes,
        "parts": parts,
    }


@dataclass(frozen=True, slots=True)
class ArtifactPage:
    artifact_id: str
    artifact_revision: int
    manifest_digest: str
    table_kind: str
    rows: tuple[dict[str, Any], ...]
    next_cursor: str | None
    returned_bytes: int
    table_rows: int


@dataclass(frozen=True, slots=True)
class ArtifactReference:
    """A durable logical pin.  The PostgreSQL authority persists these later."""

    reference_kind: ArtifactReferenceKind
    reference_id: str
    pinned_until: datetime | None = None

    def __post_init__(self) -> None:
        _require_safe_id(self.reference_id, "reference_id")


@dataclass(frozen=True, slots=True)
class ArtifactRetentionDecision:
    collectable: bool
    reason: str


class ArtifactRetentionPolicy:
    """Pure policy shared by P05 tests and the Control API persistence layer."""

    permanent_reference_kinds: Final = frozenset(
        {"CHILD_RUN", "EXPOSURE", "RELEASE_CANDIDATE", "SELECTION", "VERIFICATION"}
    )

    @classmethod
    def decide(
        cls,
        *,
        retention_class: str,
        eligible_after: datetime,
        references: Iterable[ArtifactReference],
        now: datetime,
    ) -> ArtifactRetentionDecision:
        if retention_class == "RESEARCH_EVIDENCE":
            return ArtifactRetentionDecision(False, "RETENTION_CLASS_PERMANENT")
        if eligible_after > now:
            return ArtifactRetentionDecision(False, "RETENTION_WINDOW_NOT_ELAPSED")
        for reference in references:
            if reference.reference_kind in cls.permanent_reference_kinds:
                return ArtifactRetentionDecision(False, f"PINNED_BY_{reference.reference_kind}")
            if reference.pinned_until is not None and reference.pinned_until > now:
                return ArtifactRetentionDecision(False, "PINNED_BY_ACTIVE_LEASE")
        return ArtifactRetentionDecision(True, "NO_ACTIVE_OR_DURABLE_REFERENCE")


class _BoundedManifestCache:
    """Caches only verified small manifests, never table rows or Parquet bytes."""

    def __init__(self, max_bytes: int) -> None:
        self._max_bytes = max_bytes
        self._bytes = 0
        self._items: OrderedDict[str, tuple[int, dict[str, Any]]] = OrderedDict()

    def get(self, key: str) -> dict[str, Any] | None:
        item = self._items.get(key)
        if item is None:
            return None
        self._items.move_to_end(key)
        return item[1]

    def put(self, key: str, encoded_bytes: int, value: dict[str, Any]) -> None:
        if encoded_bytes > self._max_bytes:
            return
        prior = self._items.pop(key, None)
        if prior is not None:
            self._bytes -= prior[0]
        while self._items and self._bytes + encoded_bytes > self._max_bytes:
            _, evicted = self._items.popitem(last=False)
            self._bytes -= evicted[0]
        self._items[key] = (encoded_bytes, value)
        self._bytes += encoded_bytes


class ResearchArtifactStore:
    """Filesystem side of the P05 commit protocol.

    The final ``artifacts/<opaque-id>`` directory can be read after a worker
    exits, but is *not* public until the Control API validates the matching
    candidate/fence and changes its metadata state to ``SEALED``.
    """

    def __init__(
        self,
        root: Path,
        *,
        quota: ArtifactQuota | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.root = root.resolve()
        self.quota = quota or ArtifactQuota()
        self._clock = clock or (lambda: datetime.now(UTC))
        self.root.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.scratch_dir.mkdir(parents=True, exist_ok=True)

    @property
    def artifacts_dir(self) -> Path:
        return self.root / "artifacts"

    @property
    def scratch_dir(self) -> Path:
        return self.root / "scratch"

    def begin_write(
        self,
        *,
        identity: ArtifactIdentity,
        fence: ArtifactFence,
        schema_registry: ArtifactSchemaRegistry,
        fence_validator: Callable[[ArtifactFence], bool],
        fault_hook: Callable[[str], None] | None = None,
    ) -> "ResearchArtifactWriter":
        if identity.workspace_id != fence.workspace_id or identity.run_id != fence.run_id:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_FENCE_REJECTED", "identity and fence scopes differ")
        if not fence_validator(fence):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_FENCE_REJECTED", "worker lease is no longer current")
        # Random component is mandatory even when concurrent writes have the
        # same input/effective digests.  Never reuse an attempt-derived path.
        random_staging = secrets.token_hex(20)
        staging = (
            self.scratch_dir
            / _safe_component(fence.workspace_id)
            / _safe_component(fence.run_id)
            / _safe_component(fence.worker_attempt_id)
            / random_staging
        )
        staging.mkdir(parents=True, exist_ok=False)
        _write_durable(
            staging / ".lease-fence.json",
            _canonical_json_bytes(
                {
                    "workspace_id": fence.workspace_id,
                    "run_id": fence.run_id,
                    "worker_attempt_id": fence.worker_attempt_id,
                    "lease_epoch": fence.lease_epoch,
                }
            ),
        )
        _fsync_directory(staging.parent)
        return ResearchArtifactWriter(
            store=self,
            identity=identity,
            fence=fence,
            staging_dir=staging,
            schema_registry=schema_registry,
            fence_validator=fence_validator,
            fault_hook=fault_hook,
        )

    def reader(self, *, cursor_secret: bytes, manifest_cache_bytes: int = 512 * 1024) -> "ResearchArtifactReader":
        return ResearchArtifactReader(self, cursor_secret=cursor_secret, manifest_cache_bytes=manifest_cache_bytes)

    def reconcile(self, *, registered_artifact_ids: Iterable[str] = ()) -> dict[str, tuple[str, ...]]:
        """Report only; deletion requires a later explicit scoped cleanup call."""

        registered = set(registered_artifact_ids)
        missing: list[str] = []
        corrupt: list[str] = []
        unregistered: list[str] = []
        for artifact_dir in sorted(self.artifacts_dir.iterdir()) if self.artifacts_dir.exists() else ():
            if not artifact_dir.is_dir() or not _SAFE_ID.fullmatch(artifact_dir.name):
                continue
            try:
                self._load_and_verify_manifest(artifact_dir.name, verify_parts=True)
            except ResearchArtifactError as exc:
                if exc.reason == "RESEARCH_ARTIFACT_MISSING":
                    missing.append(artifact_dir.name)
                else:
                    corrupt.append(artifact_dir.name)
                continue
            if artifact_dir.name not in registered:
                unregistered.append(artifact_dir.name)
        staging = tuple(
            str(path.relative_to(self.root))
            for path in sorted(self.scratch_dir.rglob("*"))
            if _parse_staging_dir(self.scratch_dir, path) is not None
        )
        return {
            "missing": tuple(missing),
            "corrupt": tuple(corrupt),
            "unregistered": tuple(unregistered),
            "staging": staging,
        }

    def cleanup_expired_staging(
        self,
        *,
        older_than: datetime,
        fence_is_active: Callable[[ArtifactFence], bool],
    ) -> tuple[str, ...]:
        """Delete only recognized random staging directories with an inactive lease.

        This never touches final sealed bytes, legacy artifacts, or unrelated
        temporary paths.  P06 supplies the authoritative lease predicate.
        """

        removed: list[str] = []
        for path in sorted(self.scratch_dir.rglob("*")):
            parsed = _parse_staging_dir(self.scratch_dir, path)
            if parsed is None:
                continue
            try:
                modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
                fence_payload = json.loads(_read_bounded(path / ".lease-fence.json", 2_048))
                fence = ArtifactFence(
                    fence_payload["workspace_id"],
                    fence_payload["run_id"],
                    fence_payload["worker_attempt_id"],
                    fence_payload["lease_epoch"],
                )
            except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError, ResearchArtifactError):
                # A staging directory without an intact exact fence is not
                # safely collectible.  Reconciliation reports it, but a
                # human/repair workflow must classify it first.
                continue
            if modified >= older_than or fence_is_active(fence):
                continue
            # resolve again immediately before removal, guarding against a
            # symlink/path race and keeping cleanup inside the exact root.
            resolved = path.resolve()
            if not resolved.is_relative_to(self.scratch_dir):
                raise ResearchArtifactError("RESEARCH_ARTIFACT_PATH_INVALID", "staging path escaped scratch root")
            shutil.rmtree(resolved)
            _fsync_directory(resolved.parent)
            removed.append(str(resolved.relative_to(self.root)))
        return tuple(removed)

    def _artifact_dir(self, artifact_id: str) -> Path:
        _require_safe_id(artifact_id, "artifact_id")
        path = (self.artifacts_dir / artifact_id).resolve()
        if not path.is_relative_to(self.artifacts_dir):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_PATH_INVALID", "artifact path escaped root")
        return path

    def _load_and_verify_manifest(self, artifact_id: str, *, verify_parts: bool) -> tuple[dict[str, Any], str]:
        artifact_dir = self._artifact_dir(artifact_id)
        manifest_path = artifact_dir / "manifest.json"
        if not manifest_path.is_file():
            raise ResearchArtifactError("RESEARCH_ARTIFACT_MISSING", "sealed manifest is absent")
        encoded = _read_bounded(manifest_path, self.quota.max_manifest_bytes)
        digest = _sha256_bytes(encoded)
        try:
            manifest = json.loads(encoded)
        except json.JSONDecodeError as exc:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest is not valid JSON") from exc
        _validate_manifest(manifest, artifact_id)
        if verify_parts:
            for table in manifest["tables"]:
                for part in table["parts"]:
                    path = _safe_child(artifact_dir, part["relative_path"])
                    if not path.is_file():
                        raise ResearchArtifactError("RESEARCH_ARTIFACT_MISSING", f"part {part['relative_path']} is absent")
                    if _sha256_file(path) != part["sha256"]:
                        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", f"part {part['relative_path']} digest differs")
            for document in manifest.get("documents", []):
                path = _safe_child(artifact_dir, document["relative_path"])
                if not path.is_file():
                    raise ResearchArtifactError("RESEARCH_ARTIFACT_MISSING", f"document {document['relative_path']} is absent")
                if _sha256_file(path) != document["sha256"]:
                    raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", f"document {document['relative_path']} digest differs")
        return manifest, digest


class ResearchArtifactWriter:
    """Append-only bounded Parquet writer for one reserved artifact revision."""

    def __init__(
        self,
        *,
        store: ResearchArtifactStore,
        identity: ArtifactIdentity,
        fence: ArtifactFence,
        staging_dir: Path,
        schema_registry: ArtifactSchemaRegistry,
        fence_validator: Callable[[ArtifactFence], bool],
        fault_hook: Callable[[str], None] | None,
    ) -> None:
        self.store = store
        self.identity = identity
        self.fence = fence
        self.staging_dir = staging_dir
        self._registry = schema_registry
        self._fence_validator = fence_validator
        self._fault_hook = fault_hook
        self._parts: dict[str, list[ArtifactPart]] = {}
        self._documents: list[dict[str, Any]] = []
        self._total_bytes = 0
        self._total_rows = 0
        self._closed = False
        self._candidate: SealedArtifactCandidate | None = None

    @property
    def buffered_bytes(self) -> int:
        # Batches are written and released synchronously; this intentionally
        # never includes a list of prior batches/results.
        return 0

    def append_batch(self, table_kind: str, batch: pa.RecordBatch) -> ArtifactPart:
        self._require_open_fence()
        definition = self._registry.require(table_kind)
        definition.validate_batch(batch)
        estimated_bytes = max(batch.nbytes, 1)
        if estimated_bytes > self.store.quota.max_batch_bytes:
            raise ResearchArtifactError(
                "RESEARCH_ARTIFACT_BACKPRESSURE",
                f"batch for {table_kind} exceeds max_batch_bytes",
            )
        if self._total_bytes + estimated_bytes > self.store.quota.max_staging_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_DISK_QUOTA", "staging reservation is exhausted")
        ordinal = len(self._parts.get(table_kind, ())) + 1
        relative_path = f"tables/{table_kind}/part-{ordinal:06d}.parquet"
        target = _safe_child(self.staging_dir, relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            # ``from_batches`` holds exactly this input batch, not a completed
            # run.  A separate part per bounded batch avoids hidden writer
            # buffers and leaves compaction explicitly for P23.
            table = pa.Table.from_batches([batch], schema=definition.arrow_schema)
            pq.write_table(table, target, compression="zstd", row_group_size=batch.num_rows)
            _fsync_file(target)
        except OSError as exc:
            if exc.errno in {errno.ENOSPC, errno.EDQUOT}:
                raise ResearchArtifactError("RESEARCH_ARTIFACT_DISK_FULL", "artifact staging disk is full") from exc
            raise
        finally:
            # Drop native table references before the next batch.  The caller
            # owns the input batch and can release it independently.
            if "table" in locals():
                del table
        file_bytes = target.stat().st_size
        if self._total_bytes + file_bytes > self.store.quota.max_staging_bytes:
            target.unlink(missing_ok=True)
            raise ResearchArtifactError("RESEARCH_ARTIFACT_DISK_QUOTA", "artifact part exceeded staging reservation")
        sequence_min, sequence_max = _batch_sequence_range(batch, definition.sequence_column)
        part = ArtifactPart(
            table_kind=table_kind,
            part_ordinal=ordinal,
            relative_path=relative_path,
            sha256=_sha256_file(target),
            rows=batch.num_rows,
            bytes=file_bytes,
            sequence_min=sequence_min,
            sequence_max=sequence_max,
        )
        self._parts.setdefault(table_kind, []).append(part)
        self._total_rows += batch.num_rows
        self._total_bytes += file_bytes
        _fsync_directory(target.parent)
        return part

    def write_small_document(self, name: str, payload: Mapping[str, Any]) -> str:
        """Write small evidence/selection metadata; large arrays belong in tables."""

        self._require_open_fence()
        _require_safe_id(name, "document name")
        encoded = _canonical_json_bytes(payload)
        if len(encoded) > self.store.quota.max_manifest_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_BACKPRESSURE", "small document exceeds metadata bound")
        if self._total_bytes + len(encoded) > self.store.quota.max_staging_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_DISK_QUOTA", "staging reservation is exhausted")
        if any(document["name"] == name for document in self._documents):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CONFLICT", "document name is already immutable")
        relative_path = f"documents/{name}.json"
        target = _safe_child(self.staging_dir, relative_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        _write_durable(target, encoded)
        digest = _sha256_bytes(encoded)
        self._documents.append({"name": name, "relative_path": relative_path, "sha256": digest, "bytes": len(encoded)})
        self._total_bytes += len(encoded)
        return digest

    def seal(self) -> SealedArtifactCandidate:
        if self._candidate is not None:
            return self._candidate
        self._require_open_fence()
        if not self._parts:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_EMPTY", "an artifact must contain at least one registered table")
        # This staging-only fence must not become an untracked final byte.
        (self.staging_dir / ".lease-fence.json").unlink(missing_ok=True)
        _fsync_directory(self.staging_dir)
        self._hit("before_manifest_fsync")
        manifest = self._build_manifest()
        encoded = _canonical_json_bytes(manifest)
        if len(encoded) > self.store.quota.max_manifest_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_BACKPRESSURE", "manifest exceeds bounded metadata limit")
        manifest_path = self.staging_dir / "manifest.json"
        _write_durable(manifest_path, encoded)
        manifest_digest = _sha256_bytes(encoded)
        self._hit("after_manifest_fsync")
        self._require_open_fence()
        final_dir = self.store._artifact_dir(self.identity.artifact_id)
        if final_dir.exists():
            existing, existing_digest = self.store._load_and_verify_manifest(self.identity.artifact_id, verify_parts=True)
            if existing_digest != manifest_digest:
                raise ResearchArtifactError("RESEARCH_ARTIFACT_CONFLICT", "artifact id already names different sealed bytes")
            self._closed = True
            self._candidate = _candidate_from_manifest(existing, existing_digest)
            return self._candidate
        self._hit("before_rename")
        os.replace(self.staging_dir, final_dir)
        _fsync_directory(final_dir.parent)
        self._closed = True
        self._hit("after_rename_before_register")
        self._candidate = SealedArtifactCandidate(
            artifact_id=self.identity.artifact_id,
            artifact_revision=self.identity.artifact_revision,
            storage_locator=f"artifacts/{self.identity.artifact_id}",
            manifest_digest=manifest_digest,
            manifest_schema_version=MANIFEST_SCHEMA_VERSION,
            total_rows=self._total_rows,
            total_bytes=self._total_bytes,
            table_count=len(self._parts),
        )
        return self._candidate

    def abort(self) -> None:
        """Remove only this known random staging directory, never a final artifact."""

        if self._closed:
            return
        resolved = self.staging_dir.resolve()
        if resolved.exists() and resolved.is_relative_to(self.store.scratch_dir):
            shutil.rmtree(resolved)
            _fsync_directory(resolved.parent)
        self._closed = True

    def _build_manifest(self) -> dict[str, Any]:
        tables: list[dict[str, Any]] = []
        for table_kind in sorted(self._parts):
            definition = self._registry.require(table_kind)
            parts = self._parts[table_kind]
            tables.append(
                {
                    "table_kind": table_kind,
                    "schema_version": definition.schema_version,
                    "part_schema_version": PART_SCHEMA_VERSION,
                    "schema_fingerprint": definition.fingerprint,
                    "columns": [
                        {
                            "name": field.name,
                            "arrow_type": str(field.type),
                            "nullable": field.nullable,
                            **({"unit": definition.units[field.name]} if field.name in definition.units else {}),
                        }
                        for field in definition.arrow_schema
                    ],
                    "sequence_column": definition.sequence_column,
                    "id_column": definition.id_column,
                    "rows": sum(part.rows for part in parts),
                    "bytes": sum(part.bytes for part in parts),
                    "parts": [asdict(part) for part in parts],
                }
            )
        return {
            "schema_version": MANIFEST_SCHEMA_VERSION,
            "artifact_id": self.identity.artifact_id,
            "artifact_revision": self.identity.artifact_revision,
            "workspace_id": self.identity.workspace_id,
            "run_id": self.identity.run_id,
            "worker_attempt_id": self.fence.worker_attempt_id,
            "lease_epoch": self.fence.lease_epoch,
            "engine": {"release_id": self.identity.engine_release_id, "build_ref": self.identity.engine_build_ref},
            "input": {
                "request_spec_digest": self.identity.request_spec_digest,
                "effective_spec_digest": self.identity.effective_spec_digest,
                "dataset_binding_digest": self.identity.dataset_binding_digest,
            },
            "retention": {"class": self.identity.retention_class},
            "completed_at": self.store._clock().astimezone(UTC).isoformat(),
            "tables": tables,
            "documents": sorted(self._documents, key=lambda item: item["name"]),
            "totals": {"rows": self._total_rows, "bytes": self._total_bytes},
        }

    def _require_open_fence(self) -> None:
        if self._closed:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CLOSED", "writer is already closed")
        if not self._fence_validator(self.fence):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_FENCE_REJECTED", "worker lease epoch is stale")

    def _hit(self, point: str) -> None:
        if self._fault_hook is not None:
            self._fault_hook(point)


class ArtifactExport:
    """Controlled streaming export; ``close`` removes only its temporary zip."""

    def __init__(self, path: Path, *, chunk_bytes: int = DEFAULT_EXPORT_CHUNK_BYTES) -> None:
        self.path = path
        self._chunk_bytes = chunk_bytes
        self._closed = False

    def __iter__(self) -> Generator[bytes, None, None]:
        try:
            with self.path.open("rb") as handle:
                while chunk := handle.read(self._chunk_bytes):
                    yield chunk
        finally:
            self.close()

    def close(self) -> None:
        if not self._closed:
            self.path.unlink(missing_ok=True)
            self._closed = True


class ResearchArtifactReader:
    """Bounded local reader for sealed bytes; not an authorization bypass."""

    def __init__(self, store: ResearchArtifactStore, *, cursor_secret: bytes, manifest_cache_bytes: int) -> None:
        if len(cursor_secret) < 32:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "cursor secret must be at least 32 bytes")
        self._store = store
        self._secret = cursor_secret
        self._cache = _BoundedManifestCache(manifest_cache_bytes)

    def inspect(self, artifact_id: str, *, verify_parts: bool = True) -> SealedArtifactCandidate:
        manifest, digest = self._manifest(artifact_id, verify_parts=verify_parts)
        return _candidate_from_manifest(manifest, digest)

    def read_page(
        self,
        *,
        artifact_id: str,
        table_kind: str,
        columns: Iterable[str] | None = None,
        cursor: str | None = None,
        limit: int = DEFAULT_MAX_PAGE_ROWS,
        max_bytes: int = DEFAULT_MAX_PAGE_BYTES,
    ) -> ArtifactPage:
        if not 1 <= limit <= self._store.quota.max_page_rows:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_PAGE_LIMIT", "page row limit is outside the artifact bound")
        if not 1 <= max_bytes <= self._store.quota.max_page_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_PAGE_LIMIT", "page byte limit is outside the artifact bound")
        manifest, manifest_digest = self._manifest(artifact_id, verify_parts=False)
        table = _manifest_table(manifest, table_kind)
        available_columns = tuple(column["name"] for column in table["columns"])
        selected_columns = tuple(columns) if columns is not None else available_columns
        if not selected_columns or len(set(selected_columns)) != len(selected_columns) or not set(selected_columns).issubset(available_columns):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_PAGE_COLUMNS", "requested columns are not a table projection")
        start_part, start_row = self._decode_cursor(
            cursor,
            artifact_id=artifact_id,
            table_kind=table_kind,
            artifact_revision=manifest["artifact_revision"],
            manifest_digest=manifest_digest,
        ) if cursor else (0, 0)
        if start_part >= len(table["parts"]):
            return ArtifactPage(artifact_id, manifest["artifact_revision"], manifest_digest, table_kind, (), None, 0, table["rows"])
        rows: list[dict[str, Any]] = []
        returned_bytes = 0
        next_cursor: str | None = None
        artifact_dir = self._store._artifact_dir(artifact_id)
        for part_index in range(start_part, len(table["parts"])):
            part = table["parts"][part_index]
            path = _safe_child(artifact_dir, part["relative_path"])
            _verify_part(path, part)
            skipped = start_row if part_index == start_part else 0
            consumed = 0
            file = pq.ParquetFile(path)
            for batch in file.iter_batches(batch_size=min(2_048, limit), columns=list(selected_columns)):
                for index in range(batch.num_rows):
                    if consumed < skipped:
                        consumed += 1
                        continue
                    row = {
                        field: _arrow_to_json(batch.column(field_index)[index].as_py())
                        for field_index, field in enumerate(selected_columns)
                    }
                    row_bytes = len(_canonical_json_bytes(row))
                    if row_bytes > max_bytes:
                        raise ResearchArtifactError("RESEARCH_ARTIFACT_PAGE_TOO_LARGE", "one row exceeds the byte page limit")
                    if rows and (len(rows) >= limit or returned_bytes + row_bytes > max_bytes):
                        next_cursor = self._encode_cursor(
                            artifact_id=artifact_id,
                            table_kind=table_kind,
                            artifact_revision=manifest["artifact_revision"],
                            manifest_digest=manifest_digest,
                            part_ordinal=part_index,
                            row_offset=consumed,
                        )
                        return ArtifactPage(
                            artifact_id,
                            manifest["artifact_revision"],
                            manifest_digest,
                            table_kind,
                            tuple(rows),
                            next_cursor,
                            returned_bytes,
                            table["rows"],
                        )
                    rows.append(row)
                    returned_bytes += row_bytes
                    consumed += 1
                    if len(rows) == limit:
                        if consumed < part["rows"] or part_index + 1 < len(table["parts"]):
                            next_cursor = self._encode_cursor(
                                artifact_id=artifact_id,
                                table_kind=table_kind,
                                artifact_revision=manifest["artifact_revision"],
                                manifest_digest=manifest_digest,
                                part_ordinal=part_index,
                                row_offset=consumed,
                            )
                        return ArtifactPage(
                            artifact_id,
                            manifest["artifact_revision"],
                            manifest_digest,
                            table_kind,
                            tuple(rows),
                            next_cursor,
                            returned_bytes,
                            table["rows"],
                        )
            start_row = 0
        return ArtifactPage(
            artifact_id,
            manifest["artifact_revision"],
            manifest_digest,
            table_kind,
            tuple(rows),
            next_cursor,
            returned_bytes,
            table["rows"],
        )

    def create_export(self, *, artifact_id: str) -> ArtifactExport:
        """Create a zip by streaming files from sealed storage, never read_bytes()."""

        manifest, _digest = self._manifest(artifact_id, verify_parts=True)
        artifact_dir = self._store._artifact_dir(artifact_id)
        export_dir = self._store.scratch_dir / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=f"{artifact_id}-", suffix=".zip", dir=export_dir)
        os.close(fd)
        export_path = Path(temporary)
        try:
            with zipfile.ZipFile(export_path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
                archive.write(artifact_dir / "manifest.json", "manifest.json")
                for table in manifest["tables"]:
                    for part in table["parts"]:
                        path = _safe_child(artifact_dir, part["relative_path"])
                        archive.write(path, part["relative_path"])
                for document in manifest.get("documents", []):
                    path = _safe_child(artifact_dir, document["relative_path"])
                    archive.write(path, document["relative_path"])
            _fsync_file(export_path)
            return ArtifactExport(export_path)
        except BaseException:
            export_path.unlink(missing_ok=True)
            raise

    def _manifest(self, artifact_id: str, *, verify_parts: bool) -> tuple[dict[str, Any], str]:
        artifact_dir = self._store._artifact_dir(artifact_id)
        manifest_path = artifact_dir / "manifest.json"
        if not manifest_path.is_file():
            raise ResearchArtifactError("RESEARCH_ARTIFACT_MISSING", "sealed manifest is absent")
        encoded = _read_bounded(manifest_path, self._store.quota.max_manifest_bytes)
        digest = _sha256_bytes(encoded)
        manifest = self._cache.get(digest)
        if manifest is None:
            try:
                parsed = json.loads(encoded)
            except json.JSONDecodeError as exc:
                raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest is not valid JSON") from exc
            _validate_manifest(parsed, artifact_id)
            self._cache.put(digest, len(encoded), parsed)
            manifest = parsed
        if verify_parts:
            for table in manifest["tables"]:
                for part in table["parts"]:
                    _verify_part(_safe_child(artifact_dir, part["relative_path"]), part)
            for document in manifest.get("documents", []):
                document_path = _safe_child(artifact_dir, document["relative_path"])
                if not document_path.is_file() or _sha256_file(document_path) != document["sha256"]:
                    raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "document digest differs")
        return manifest, digest

    def _encode_cursor(
        self,
        *,
        artifact_id: str,
        table_kind: str,
        artifact_revision: int,
        manifest_digest: str,
        part_ordinal: int,
        row_offset: int,
    ) -> str:
        payload = _canonical_json_bytes(
            {
                "artifact_id": artifact_id,
                "artifact_revision": artifact_revision,
                "manifest_digest": manifest_digest,
                "part_ordinal": part_ordinal,
                "row_offset": row_offset,
                "table_kind": table_kind,
                "v": 1,
            }
        )
        signature = hmac.new(self._secret, payload, hashlib.sha256).digest()
        return _urlsafe(payload) + "." + _urlsafe(signature)

    def _decode_cursor(
        self,
        cursor: str,
        *,
        artifact_id: str,
        table_kind: str,
        artifact_revision: int,
        manifest_digest: str,
    ) -> tuple[int, int]:
        try:
            encoded_payload, encoded_signature = cursor.split(".", 1)
            payload = _urlsafe_decode(encoded_payload)
            signature = _urlsafe_decode(encoded_signature)
            expected = hmac.new(self._secret, payload, hashlib.sha256).digest()
            value = json.loads(payload)
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CURSOR_INVALID", "cursor is malformed") from exc
        if not hmac.compare_digest(signature, expected):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CURSOR_INVALID", "cursor signature is invalid")
        expected_binding = {
            "artifact_id": artifact_id,
            "table_kind": table_kind,
            "artifact_revision": artifact_revision,
            "manifest_digest": manifest_digest,
            "v": 1,
        }
        if any(value.get(key) != expected_value for key, expected_value in expected_binding.items()):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CURSOR_INVALID", "cursor is bound to another artifact revision")
        part_ordinal = value.get("part_ordinal")
        row_offset = value.get("row_offset")
        if not isinstance(part_ordinal, int) or part_ordinal < 0 or not isinstance(row_offset, int) or row_offset < 0:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CURSOR_INVALID", "cursor offsets are invalid")
        return part_ordinal, row_offset


def grid_cell_to_evaluation_map(cells: Iterable[Mapping[str, Any]]) -> dict[str, tuple[str, ...]]:
    """Map display cells to a smaller immutable set of unique config digests."""

    mapped: dict[str, list[str]] = {}
    for cell in cells:
        cell_id = cell.get("cell_id")
        config = cell.get("effective_config")
        if not isinstance(cell_id, str) or not isinstance(config, Mapping):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "grid cells require cell_id and effective_config")
        _require_safe_id(cell_id, "cell_id")
        digest = _sha256_bytes(_canonical_json_bytes(config))
        mapped.setdefault(digest, []).append(cell_id)
    return {digest: tuple(cell_ids) for digest, cell_ids in sorted(mapped.items())}


def _candidate_from_manifest(manifest: Mapping[str, Any], digest: str) -> SealedArtifactCandidate:
    return SealedArtifactCandidate(
        artifact_id=manifest["artifact_id"],
        artifact_revision=manifest["artifact_revision"],
        storage_locator=f"artifacts/{manifest['artifact_id']}",
        manifest_digest=digest,
        manifest_schema_version=manifest["schema_version"],
        total_rows=manifest["totals"]["rows"],
        total_bytes=manifest["totals"]["bytes"],
        table_count=len(manifest["tables"]),
    )


def _sequence_transport_value(value: str | int | float | None) -> str | None:
    """Preserve a manifest scalar exactly across the Python→TS DTO boundary."""

    if value is None:
        return None
    # JSON is canonical for primitive numeric spelling here and rejects NaN/
    # infinity rather than letting a non-portable value reach the SQL ledger.
    if isinstance(value, bool):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "sequence value cannot be boolean")
    if isinstance(value, (int, float)):
        return json.dumps(value, allow_nan=False, separators=(",", ":"))
    if isinstance(value, str):
        return value
    raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "sequence value has unsupported type")


def _manifest_table(manifest: Mapping[str, Any], table_kind: str) -> dict[str, Any]:
    for table in manifest["tables"]:
        if table["table_kind"] == table_kind:
            return table
    raise ResearchArtifactError("RESEARCH_ARTIFACT_TABLE_NOT_FOUND", f"table {table_kind!r} is absent")


def _validate_manifest(manifest: Any, artifact_id: str) -> None:
    if not isinstance(manifest, dict) or manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest schema version is invalid")
    if manifest.get("artifact_id") != artifact_id:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest artifact id differs from its directory")
    _require_safe_id(artifact_id, "artifact_id")
    if not isinstance(manifest.get("artifact_revision"), int) or manifest["artifact_revision"] < 1:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest revision is invalid")
    tables = manifest.get("tables")
    totals = manifest.get("totals")
    if not isinstance(tables, list) or not tables or not isinstance(totals, dict):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest tables/totals are missing")
    seen_tables: set[str] = set()
    calculated_rows = 0
    calculated_bytes = 0
    for table in tables:
        if not isinstance(table, dict) or not isinstance(table.get("table_kind"), str):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "table descriptor is invalid")
        if table["table_kind"] in seen_tables:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest repeats a table kind")
        seen_tables.add(table["table_kind"])
        parts = table.get("parts")
        columns = table.get("columns")
        if not isinstance(columns, list) or not columns or any(not isinstance(column, dict) or not isinstance(column.get("name"), str) for column in columns):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "table column metadata is invalid")
        if not isinstance(parts, list) or not parts:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "table has no parts")
        table_rows = 0
        table_bytes = 0
        for ordinal, part in enumerate(parts, start=1):
            if not isinstance(part, dict) or part.get("part_ordinal") != ordinal:
                raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "part ordinals are not contiguous")
            relative_path = part.get("relative_path")
            if not isinstance(relative_path, str) or not relative_path.endswith(".parquet"):
                raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "part path is invalid")
            _safe_relative_path(relative_path)
            if not isinstance(part.get("rows"), int) or part["rows"] < 0 or not isinstance(part.get("bytes"), int) or part["bytes"] < 0:
                raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "part statistics are invalid")
            _require_digest(part.get("sha256"), "part digest")
            table_rows += part["rows"]
            table_bytes += part["bytes"]
        if table.get("rows") != table_rows or table.get("bytes") != table_bytes:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "table statistics do not match parts")
        calculated_rows += table_rows
        calculated_bytes += table_bytes
    documents = manifest.get("documents", [])
    if not isinstance(documents, list):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest documents are invalid")
    document_names: set[str] = set()
    for document in documents:
        if not isinstance(document, dict) or not isinstance(document.get("name"), str):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "document descriptor is invalid")
        _require_safe_id(document["name"], "document name")
        if document["name"] in document_names:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest repeats a document name")
        document_names.add(document["name"])
        relative_path = document.get("relative_path")
        if not isinstance(relative_path, str) or not relative_path.endswith(".json"):
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "document path is invalid")
        _safe_relative_path(relative_path)
        if not isinstance(document.get("bytes"), int) or document["bytes"] < 0:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "document byte count is invalid")
        _require_digest(document.get("sha256"), "document digest")
        calculated_bytes += document["bytes"]
    if totals.get("rows") != calculated_rows or totals.get("bytes") != calculated_bytes:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "manifest totals do not match parts")


def _verify_part(path: Path, part: Mapping[str, Any]) -> None:
    if not path.is_file():
        raise ResearchArtifactError("RESEARCH_ARTIFACT_MISSING", f"part {part['relative_path']} is absent")
    if path.stat().st_size != part["bytes"] or _sha256_file(path) != part["sha256"]:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", f"part {part['relative_path']} digest differs")


def _batch_sequence_range(batch: pa.RecordBatch, sequence_column: str | None) -> tuple[str | int | float | None, str | int | float | None]:
    if sequence_column is None or batch.num_rows == 0:
        return None, None
    values = batch.column(batch.schema.get_field_index(sequence_column))
    result = pc.min_max(values).as_py()
    return _arrow_to_json(result.get("min")), _arrow_to_json(result.get("max"))


def _arrow_to_json(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC).isoformat()
        return value.astimezone(UTC).isoformat()
    if isinstance(value, bytes):
        return base64.b64encode(value).decode("ascii")
    if isinstance(value, list):
        return [_arrow_to_json(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _arrow_to_json(item) for key, item in value.items()}
    return value


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(_canonical_json_value(value), allow_nan=False, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _canonical_json_value(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if value != value or value in {float("inf"), float("-inf")}:
            raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", "non-finite float cannot enter an artifact")
        return value
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).astimezone(UTC).isoformat()
    if isinstance(value, Mapping):
        return {str(key): _canonical_json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_canonical_json_value(item) for item in value]
    raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", f"unsupported artifact JSON type {type(value).__name__}")


def _write_durable(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary_path = Path(temporary)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        _fsync_directory(path.parent)
    finally:
        temporary_path.unlink(missing_ok=True)


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _read_bounded(path: Path, maximum: int) -> bytes:
    if path.stat().st_size > maximum:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "bounded manifest is too large")
    with path.open("rb") as handle:
        payload = handle.read(maximum + 1)
    if len(payload) > maximum:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_CORRUPT", "bounded manifest is too large")
    return payload


def _safe_child(root: Path, relative_path: str) -> Path:
    relative = _safe_relative_path(relative_path)
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_PATH_INVALID", "artifact path escaped its root")
    return target


def _safe_relative_path(relative_path: str) -> Path:
    relative = PurePosixPath(relative_path)
    if relative.is_absolute() or ".." in relative.parts or relative_path.startswith("/") or not relative.parts:
        raise ResearchArtifactError("RESEARCH_ARTIFACT_PATH_INVALID", "artifact path is not a safe relative path")
    return Path(*relative.parts)


def _safe_component(value: str) -> str:
    _require_safe_id(value, "path component")
    return value


def _require_safe_id(value: Any, label: str) -> None:
    if not isinstance(value, str) or not _SAFE_ID.fullmatch(value):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", f"{label} contains unsafe characters")


def _require_digest(value: Any, label: str) -> None:
    if not isinstance(value, str) or not _SHA256.fullmatch(value):
        raise ResearchArtifactError("RESEARCH_ARTIFACT_INVALID", f"{label} must be a lowercase sha256 digest")


def _urlsafe(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _urlsafe_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _parse_staging_dir(scratch_root: Path, path: Path) -> tuple[str, str, str, str] | None:
    if not path.is_dir():
        return None
    try:
        relative = path.relative_to(scratch_root)
    except ValueError:
        return None
    if len(relative.parts) != 4 or not re.fullmatch(r"[0-9a-f]{40}", relative.parts[-1]):
        return None
    try:
        for component in relative.parts[:3]:
            _require_safe_id(component, "staging path component")
    except ResearchArtifactError:
        return None
    return relative.parts[0], relative.parts[1], relative.parts[2], relative.parts[3]


__all__ = [
    "ArtifactExport",
    "ArtifactFaultInjected",
    "ArtifactFence",
    "ArtifactIdentity",
    "ArtifactPage",
    "ArtifactPart",
    "ArtifactQuota",
    "ArtifactReference",
    "ArtifactRetentionDecision",
    "ArtifactRetentionPolicy",
    "ArtifactSchemaRegistry",
    "ArtifactTableSchema",
    "MANIFEST_SCHEMA_VERSION",
    "ResearchArtifactError",
    "ResearchArtifactReader",
    "ResearchArtifactStore",
    "SealedArtifactCandidate",
    "build_control_api_seal_request",
    "grid_cell_to_evaluation_map",
]
