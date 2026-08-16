"""Data Catalog and immutable snapshot authority (U13 / BAR-10).

Dataset/Universe/Instrument/Snapshot/Quality identities, family activation
from the source-controlled catalog, digest-addressed immutable snapshots
(no mutable ``latest``), per-kind schemas and a bounded query contract with
downsampling metadata. Historical ingestion stays behind the approved
reader wheel; nothing here scans the filesystem.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from portal_api.domain.errors import PortalDomainError

CATALOG_FILE = "data-catalog.v1.json"
CATALOG_SCHEMA = "data-catalog.v1.schema.json"

DataKind = Literal["candle", "matrix", "metrics", "orderbook"]
CANDLE_COLUMNS = ("open", "high", "low", "close", "volume")


class DataCatalogError(PortalDomainError):
    code = "DATA_CATALOG_DENIED"


class DataCatalogLoadError(RuntimeError):
    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        self.detail = detail
        super().__init__(f"{code}: {detail}")


class CatalogModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class QualityProfile(CatalogModel):
    max_gap_ratio: float = Field(gt=0, le=1)
    max_duplicate_rows: int = Field(ge=0)


class ReleaseManifestRef(CatalogModel):
    manifest_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    accepted_at: str


class DataFamily(CatalogModel):
    family_id: str = Field(pattern=r"^[a-z][a-z0-9-]{2,63}$")
    label: str = Field(min_length=1, max_length=120)
    kind: DataKind
    schema_version: str = Field(pattern=r"^[a-z][a-z0-9-]{0,31}\.v[0-9]+$")
    activated: bool
    release_manifest: ReleaseManifestRef
    quality: QualityProfile


class DataCatalog(CatalogModel):
    schema_version: Literal["data-catalog.v1"]
    catalog_revision: int = Field(ge=1)
    families: tuple[DataFamily, ...]


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


@dataclass(frozen=True, slots=True)
class SnapshotIdentity:
    snapshot_id: str
    family_id: str
    kind: DataKind
    schema_version: str
    content_hash: str
    lineage: tuple[str, ...]
    produced_at: str
    bounds: tuple[str, str]
    row_count: int


@dataclass(frozen=True, slots=True)
class QualityReport:
    snapshot_id: str
    gaps: int
    duplicates: int
    rows: int
    gap_ratio: float
    passed: bool
    reason_codes: tuple[str, ...] = field(default_factory=tuple)


def compute_quality(
    frame: pd.DataFrame,
    *,
    snapshot_id: str,
    max_gap_ratio: float,
    max_duplicate_rows: int,
    expected_frequency: str | None = None,
) -> QualityReport:
    index = frame.index
    duplicates = int(index.duplicated().sum())
    gaps = 0
    if expected_frequency and len(index) > 1:
        expected = pd.Timedelta(expected_frequency)
        gaps = int((index.to_series().diff().dropna() > expected * 1.5).sum())
    total = len(index)
    gap_ratio = gaps / total if total else 0.0
    reasons: list[str] = []
    if gap_ratio > max_gap_ratio:
        reasons.append("GAP_RATIO_EXCEEDED")
    if duplicates > max_duplicate_rows:
        reasons.append("DUPLICATE_ROWS_EXCEEDED")
    return QualityReport(
        snapshot_id=snapshot_id,
        gaps=gaps,
        duplicates=duplicates,
        rows=total,
        gap_ratio=round(gap_ratio, 6),
        passed=not reasons,
        reason_codes=tuple(reasons),
    )


class SnapshotStore:
    """Digest-addressed immutable snapshots; repair always creates a new one."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def snapshot_path(self, snapshot_id: str) -> Path:
        return self.root / "snapshots" / snapshot_id

    def register(
        self,
        *,
        frame: pd.DataFrame,
        family: DataFamily,
        lineage: tuple[str, ...],
        expected_frequency: str | None = None,
    ) -> tuple[SnapshotIdentity, QualityReport]:
        encoded = frame.to_parquet(index=True)
        content_hash = sha256_bytes(encoded)
        produced_at = datetime.now(UTC).isoformat()
        digest_material = json.dumps(
            {
                "family_id": family.family_id,
                "kind": family.kind,
                "content_hash": content_hash,
                "lineage": list(lineage),
                "row_count": len(frame),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        snapshot_id = f"dss_{sha256_bytes(digest_material.encode('utf-8'))[:32]}"
        path = self.snapshot_path(snapshot_id)
        quality = compute_quality(
            frame,
            snapshot_id=snapshot_id,
            max_gap_ratio=family.quality.max_gap_ratio,
            max_duplicate_rows=family.quality.max_duplicate_rows,
            expected_frequency=expected_frequency,
        )
        if not quality.passed:
            raise DataCatalogError(
                f"snapshot {snapshot_id} failed quality: {', '.join(quality.reason_codes)}"
            )
        if not path.is_dir():
            path.mkdir(parents=True, exist_ok=True)
            (path / "frame.parquet").write_bytes(encoded)
            identity = SnapshotIdentity(
                snapshot_id=snapshot_id,
                family_id=family.family_id,
                kind=family.kind,
                schema_version=family.schema_version,
                content_hash=content_hash,
                lineage=lineage,
                produced_at=produced_at,
                bounds=(str(frame.index.min()), str(frame.index.max())),
                row_count=len(frame),
            )
            (path / "identity.json").write_text(
                json.dumps(
                    {
                        "snapshot_id": identity.snapshot_id,
                        "family_id": identity.family_id,
                        "kind": identity.kind,
                        "schema_version": identity.schema_version,
                        "content_hash": identity.content_hash,
                        "lineage": list(identity.lineage),
                        "produced_at": identity.produced_at,
                        "bounds": list(identity.bounds),
                        "row_count": identity.row_count,
                    },
                    sort_keys=True,
                    indent=2,
                ),
                encoding="utf-8",
            )
            (path / "quality.json").write_text(
                json.dumps(
                    {
                        "snapshot_id": quality.snapshot_id,
                        "gaps": quality.gaps,
                        "duplicates": quality.duplicates,
                        "rows": quality.rows,
                        "gap_ratio": quality.gap_ratio,
                        "passed": quality.passed,
                        "reason_codes": list(quality.reason_codes),
                    },
                    sort_keys=True,
                    indent=2,
                ),
                encoding="utf-8",
            )
        return identity, quality

    def list(self) -> list[dict[str, Any]]:
        root = self.root / "snapshots"
        if not root.is_dir():
            return []
        entries: list[dict[str, Any]] = []
        for path in sorted(root.iterdir()):
            identity_path = path / "identity.json"
            if not identity_path.is_file():
                continue
            payload = json.loads(identity_path.read_text(encoding="utf-8"))
            entries.append(
                {
                    "snapshot_id": payload["snapshot_id"],
                    "family_id": payload["family_id"],
                    "kind": payload["kind"],
                    "produced_at": payload["produced_at"],
                    "row_count": payload["row_count"],
                }
            )
        return entries

    def open(self, snapshot_id: str) -> tuple[SnapshotIdentity, QualityReport, pd.DataFrame]:
        from io import BytesIO

        path = self.snapshot_path(snapshot_id)
        if not path.is_dir():
            raise DataCatalogError(f"snapshot {snapshot_id} not found")
        payload = (path / "frame.parquet").read_bytes()
        if sha256_bytes(payload) != json.loads(
            (path / "identity.json").read_text(encoding="utf-8")
        )["content_hash"]:
            raise DataCatalogError(f"snapshot {snapshot_id} is corrupt")
        frame = pd.read_parquet(BytesIO(payload))
        identity_payload = json.loads((path / "identity.json").read_text(encoding="utf-8"))
        quality_payload = json.loads((path / "quality.json").read_text(encoding="utf-8"))
        identity = SnapshotIdentity(
            snapshot_id=identity_payload["snapshot_id"],
            family_id=identity_payload["family_id"],
            kind=identity_payload["kind"],
            schema_version=identity_payload["schema_version"],
            content_hash=identity_payload["content_hash"],
            lineage=tuple(identity_payload["lineage"]),
            produced_at=identity_payload["produced_at"],
            bounds=tuple(identity_payload["bounds"]),
            row_count=identity_payload["row_count"],
        )
        quality = QualityReport(
            snapshot_id=quality_payload["snapshot_id"],
            gaps=quality_payload["gaps"],
            duplicates=quality_payload["duplicates"],
            rows=quality_payload["rows"],
            gap_ratio=quality_payload["gap_ratio"],
            passed=quality_payload["passed"],
            reason_codes=tuple(quality_payload["reason_codes"]),
        )
        return identity, quality, frame

    def query(
        self,
        snapshot_id: str,
        *,
        start: str | None = None,
        end_exclusive: str | None = None,
        columns: tuple[str, ...] | None = None,
        max_points: int | None = None,
    ) -> dict[str, Any]:
        identity, quality, frame = self.open(snapshot_id)
        if start is not None or end_exclusive is not None:
            mask = pd.Series(True, index=frame.index)
            if start is not None:
                mask &= frame.index >= pd.Timestamp(start)
            if end_exclusive is not None:
                mask &= frame.index < pd.Timestamp(end_exclusive)
            frame = frame.loc[mask]
        if columns is not None:
            frame = frame.loc[:, list(columns)]
        original_points = len(frame)
        stride = 1
        if max_points is not None and max_points > 0 and original_points > max_points:
            import math

            stride = math.ceil(original_points / max_points)
            frame = frame.iloc[:: max(stride, 1)]
        return {
            "snapshot_id": snapshot_id,
            "family_id": identity.family_id,
            "kind": identity.kind,
            "content_hash": identity.content_hash,
            "original_points": original_points,
            "returned_points": len(frame),
            "downsample_stride": stride,
            "points": frame.reset_index().to_dict(orient="records"),
            "quality": {
                "gaps": quality.gaps,
                "duplicates": quality.duplicates,
                "passed": quality.passed,
            },
        }


class DataCatalogService:
    """Loads one immutable catalog for the deployed commit (fail-closed)."""

    def __init__(self, registry_root: Path) -> None:
        self._registry_root = registry_root
        self._catalog = self._load()

    @property
    def catalog(self) -> DataCatalog:
        return self._catalog

    def _load(self) -> DataCatalog:
        source_path = self._registry_root / CATALOG_FILE
        schema_path = self._registry_root / "schemas" / CATALOG_SCHEMA
        try:
            source = json.loads(source_path.read_text(encoding="utf-8"))
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise DataCatalogLoadError(
                "CATALOG_FILE_UNAVAILABLE", "data catalog cannot be loaded"
            ) from exc
        try:
            Draft202012Validator.check_schema(schema)
            validator = Draft202012Validator(schema, format_checker=FormatChecker())
            errors = sorted(
                validator.iter_errors(source),
                key=lambda error: tuple(str(item) for item in error.absolute_path),
            )
        except (SchemaError, ValueError) as exc:
            raise DataCatalogLoadError("CATALOG_SCHEMA_INVALID", "catalog schema invalid") from exc
        if errors:
            raise DataCatalogLoadError("CATALOG_SOURCE_INVALID", errors[0].message)
        try:
            catalog = DataCatalog.model_validate(source)
        except ValidationError as exc:
            raise DataCatalogLoadError("CATALOG_SOURCE_INVALID", "catalog model invalid") from exc
        family_ids = [family.family_id for family in catalog.families]
        if len(family_ids) != len(set(family_ids)):
            raise DataCatalogLoadError("CATALOG_SOURCE_INVALID", "duplicate family ids")
        return catalog

    def family(self, family_id: str) -> DataFamily:
        for family in self._catalog.families:
            if family.family_id == family_id:
                return family
        raise DataCatalogError(f"family {family_id!r} is not in the data catalog")

    def activated_family(self, family_id: str) -> DataFamily:
        family = self.family(family_id)
        if not family.activated:
            raise DataCatalogError(f"family {family_id!r} is not activated")
        return family

    def public_document(self) -> dict[str, Any]:
        return {
            "schema_version": self._catalog.schema_version,
            "catalog_revision": self._catalog.catalog_revision,
            "families": [
                {
                    "family_id": family.family_id,
                    "label": family.label,
                    "kind": family.kind,
                    "schema_version": family.schema_version,
                    "activated": family.activated,
                    "release_manifest": {
                        "manifest_sha256": family.release_manifest.manifest_sha256,
                        "accepted_at": family.release_manifest.accepted_at,
                    },
                    "quality": family.quality.model_dump(mode="json"),
                }
                for family in self._catalog.families
            ],
        }


__all__ = [
    "CANDLE_COLUMNS",
    "DataCatalogError",
    "DataCatalogLoadError",
    "DataCatalogService",
    "DataFamily",
    "DataKind",
    "QualityReport",
    "SnapshotIdentity",
    "SnapshotStore",
    "compute_quality",
    "sha256_bytes",
]
