"""RS-02 current-source QuantBT artifact adapter.

The existing P04 worker emits a deliberately tiny terminal receipt.  That is
the right boundary for a fixed qualification, but it is not a substitute for
the public QuantBT 1.1.1 advanced walk-forward output already available in
this repository.  This module is the *one-time*, confined adapter for that
output:

* it accepts only an explicitly admitted, versioned WFO profile;
* it converts already-written, current-engine artifacts into P05 sealed
  Parquet tables with exact decimal text and original row identity;
* it never opens PostgreSQL, an HTTP client, a broker, a source database or a
  browser-facing route; and
* it returns a small manifest receipt.  The receipt is not a data frame and
  cannot be used to reconstruct source rows in a terminal journal.

The parent durable worker owns reservation/lease/seal registration.  A later
server-side importer pages the sealed tables into Portal-owned local read
models.  GET handlers must never call this module or QuantBT.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import UTC
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Final, Iterable, Mapping

import pandas as pd
import pyarrow as pa

from portal_api.adapters.quantbt import QUANTBT_ENGINE_VERSION
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.serialization import canonicalize
from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactError,
    ResearchArtifactStore,
    SealedArtifactCandidate,
)


CURRENT_SOURCE_ADAPTER_ID: Final = "rs02.quantbt-advanced-wfo.v1"
CURRENT_SOURCE_RECEIPT_SCHEMA: Final = "research.current-source-artifact.v1"
CURRENT_SOURCE_ENGINE_OPERATION: Final = "walk_forward"
CURRENT_SOURCE_TARGET_MODE: Final = "pct_equity"
CURRENT_SOURCE_PROFILE_ID: Final = "rs02.delta-wfo-global.v1"
MAXIMUM_OPTUNA_TRIALS: Final = 64
MAXIMUM_TABLE_BATCH_ROWS: Final = 200
MAXIMUM_DERIVED_SERIES_POINTS: Final = 192
MAXIMUM_PARAMETER_FIELDS: Final = 24
RETURN_DISTRIBUTION_BUCKETS: Final = 12
_SHA256 = re.compile(r"^[0-9a-f]{64}$")


class CurrentSourceArtifactError(RuntimeError):
    """A typed adapter refusal before a source artifact is retained."""

    def __init__(self, code: str, detail: str) -> None:
        self.code = code
        super().__init__(detail)


@dataclass(frozen=True, slots=True)
class CurrentSourceAdmission:
    """Exact compute profile admitted by the RS-02 adapter.

    The durable supervisor, not this data serializer, enforces the resource
    caps.  Keeping them in the admission object binds the future worker lease
    to the same source profile that created the retained artifact.
    """

    profile_id: str
    engine_operation: str
    target_mode: str
    optimization_mode: str
    optimization_schedule: str
    random_seed: int
    optuna_trials: int
    maximum_runtime_seconds: int
    maximum_rss_bytes: int
    maximum_disk_bytes: int
    lease_seconds: int

    def validate(self) -> None:
        if self.profile_id != CURRENT_SOURCE_PROFILE_ID:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED",
                "The current-source profile is not installed.",
            )
        if self.engine_operation != CURRENT_SOURCE_ENGINE_OPERATION or self.target_mode != CURRENT_SOURCE_TARGET_MODE:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ROUTE_REJECTED",
                "The current-source adapter accepts only QuantBT walk_forward with pct_equity.",
            )
        if self.optimization_mode != "mode_1_decay" or self.optimization_schedule != "global":
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_MODE_REJECTED",
                "The current-source adapter accepts only mode_1_decay/global; it never downgrades to a fixed smoke run.",
            )
        if isinstance(self.random_seed, bool) or not isinstance(self.random_seed, int) or self.random_seed < 0:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_SEED_REJECTED",
                "The current-source adapter requires one non-negative deterministic seed.",
            )
        if isinstance(self.optuna_trials, bool) or not isinstance(self.optuna_trials, int) or not 2 <= self.optuna_trials <= MAXIMUM_OPTUNA_TRIALS:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_TRIAL_BUDGET_REJECTED",
                f"The current-source adapter accepts 2..{MAXIMUM_OPTUNA_TRIALS} trials.",
            )
        caps = (
            ("maximum_runtime_seconds", self.maximum_runtime_seconds, 1, 86_400),
            ("maximum_rss_bytes", self.maximum_rss_bytes, 64 * 1024 * 1024, 8 * 1024 * 1024 * 1024),
            ("maximum_disk_bytes", self.maximum_disk_bytes, 64 * 1024 * 1024, 512 * 1024 * 1024 * 1024),
            ("lease_seconds", self.lease_seconds, 15, 300),
        )
        for label, value, minimum, maximum in caps:
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_RESOURCE_REJECTED",
                    f"The current-source {label} is outside the admitted bounded range.",
                )


@dataclass(frozen=True, slots=True)
class CurrentSourceArtifactReceipt:
    """Compact artifact identity for the private importer/Control API only."""

    artifact_id: str
    artifact_revision: int
    manifest_digest: str
    total_rows: int
    total_bytes: int
    table_rows: Mapping[str, int]
    source_transform_digest: str
    profile_id: str
    # Bounded source-derived facts for the private Portal retention sealer.
    # This is not a table export and must stay below the P05 small-document
    # budget; full observations/trials stay in P05 Parquet batches.
    summary: Mapping[str, Any]
    source_adapter_id: str = CURRENT_SOURCE_ADAPTER_ID
    schema_version: str = CURRENT_SOURCE_RECEIPT_SCHEMA

    def as_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "source_adapter_id": self.source_adapter_id,
            "profile_id": self.profile_id,
            "artifact": {
                "artifact_id": self.artifact_id,
                "artifact_revision": self.artifact_revision,
                "manifest_digest": self.manifest_digest,
                "total_rows": self.total_rows,
                "total_bytes": self.total_bytes,
                "table_rows": dict(sorted(self.table_rows.items())),
            },
            "source_transform_digest": self.source_transform_digest,
            "summary": dict(self.summary),
            "coverage": {
                "observations": "AVAILABLE_DIRECT",
                "returns": "AVAILABLE_DIRECT",
                "positions": "AVAILABLE_DIRECT",
                "folds": "AVAILABLE_DIRECT",
                "trials": "AVAILABLE_DIRECT",
                "candidates": "AVAILABLE_DIRECT",
                "selection": "AVAILABLE_DIRECT",
                "route_ledger": "SOURCE_UNSUPPORTED_CONFIRMED",
                "audited_fills": "SOURCE_UNSUPPORTED_CONFIRMED",
            },
        }


@dataclass(frozen=True, slots=True)
class CurrentSourceArtifactExport:
    candidate: SealedArtifactCandidate
    receipt: CurrentSourceArtifactReceipt


@dataclass(frozen=True, slots=True)
class CurrentSourceRetentionBatch:
    """One private, bounded Portal-import batch derived from sealed P05 bytes.

    The parent worker may transport this DTO only over its private lease-bound
    control path.  It intentionally has no browser serialization helper and
    never carries an artifact locator or P05 cursor.
    """

    table_kind: str
    batch_ordinal: int
    rows: tuple[Mapping[str, Any], ...]
    batch_digest: str


def default_current_source_admission() -> CurrentSourceAdmission:
    """A deliberately small real-WFO profile used by isolated qualification."""

    return CurrentSourceAdmission(
        profile_id=CURRENT_SOURCE_PROFILE_ID,
        engine_operation=CURRENT_SOURCE_ENGINE_OPERATION,
        target_mode=CURRENT_SOURCE_TARGET_MODE,
        optimization_mode="mode_1_decay",
        optimization_schedule="global",
        random_seed=42,
        optuna_trials=8,
        maximum_runtime_seconds=300,
        maximum_rss_bytes=2 * 1024 * 1024 * 1024,
        maximum_disk_bytes=4 * 1024 * 1024 * 1024,
        lease_seconds=90,
    )


def iter_current_source_retention_batches(
    *,
    retained_artifacts: ResearchArtifactStore,
    receipt: CurrentSourceArtifactReceipt,
    cursor_secret: bytes,
) -> Iterable[CurrentSourceRetentionBatch]:
    """Read the sealed RS-02 artifact once into finite private import batches.

    This bridge proves the intended P05/Rust-style custody boundary without
    adding HTTP, PostgreSQL, a background worker or an unbounded terminal
    payload to the Python adapter.  A parent with an active lease is the only
    caller that may submit yielded rows to Control API retention.
    """

    reader = retained_artifacts.reader(cursor_secret=cursor_secret)
    table_mapping = {
        "observations": "OBSERVATION",
        "folds": "FOLD",
        "trials": "TRIAL",
        "candidates": "CANDIDATE",
        "selection": "SELECTION",
    }
    for artifact_table, portal_kind in table_mapping.items():
        cursor: str | None = None
        batch_ordinal = 0
        imported_rows = 0
        while True:
            page = reader.read_page(
                artifact_id=receipt.artifact_id,
                table_kind=artifact_table,
                cursor=cursor,
                limit=MAXIMUM_TABLE_BATCH_ROWS,
            )
            normalized = tuple(
                _portal_retention_row(artifact_table, row)
                for row in page.rows
            )
            if normalized:
                payload = canonicalize(list(normalized))
                encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
                if len(encoded) > 1_048_576:
                    raise CurrentSourceArtifactError(
                        "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                        "A current-source private retention batch exceeds 1 MiB.",
                    )
                yield CurrentSourceRetentionBatch(
                    table_kind=portal_kind,
                    batch_ordinal=batch_ordinal,
                    rows=normalized,
                    batch_digest=hashlib.sha256(encoded).hexdigest(),
                )
                imported_rows += len(normalized)
                batch_ordinal += 1
            if page.next_cursor is None:
                break
            cursor = page.next_cursor
        if imported_rows != receipt.table_rows[artifact_table]:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_SEAL_CONFLICT",
                "A P05 retained table count changed while preparing the Portal import.",
            )


def _portal_retention_row(table_kind: str, row: Mapping[str, Any]) -> Mapping[str, Any]:
    """Normalize P05 row JSON into the finite private Control API import DTO."""

    ordinal = row.get("source_ordinal")
    if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "A retained row ordinal is invalid.")
    if table_kind == "observations":
        source_id = row.get("source_index_utc")
        at_utc_ms = row.get("at_utc_ms")
        payload = {
            "source_index_utc": source_id,
            "at_utc_ms": at_utc_ms,
            "equity": row.get("equity"),
            "return_fraction": row.get("return_fraction"),
            "accepted_position": row.get("accepted_position"),
            "drawdown_fraction": row.get("drawdown_fraction"),
            "signal_target": row.get("signal_target"),
        }
    elif table_kind == "folds":
        source_id = row.get("fold_id")
        at_utc_ms = None
        payload = {
            "fold_id": source_id,
            "train_start_utc_ms": row.get("train_start_utc_ms"),
            "train_end_utc_ms": row.get("train_end_utc_ms"),
            "test_start_utc_ms": row.get("test_start_utc_ms"),
            "test_end_utc_ms": row.get("test_end_utc_ms"),
        }
    elif table_kind == "trials":
        source_id = row.get("trial_id")
        at_utc_ms = None
        payload = {
            "trial_id": source_id,
            "state": row.get("state"),
            "objective": row.get("objective"),
            "parameters": _decimal_object(row.get("parameters_json"), "trial parameters"),
        }
    elif table_kind == "candidates":
        source_id = row.get("candidate_id")
        at_utc_ms = None
        payload = {
            "candidate_id": source_id,
            "objective": row.get("objective"),
            "parameters": _decimal_object(row.get("parameters_json"), "candidate parameters"),
        }
    elif table_kind == "selection":
        source_id = row.get("selection_role")
        at_utc_ms = None
        payload = {
            "selection_role": source_id,
            "trial_id": row.get("trial_id"),
            "objective": row.get("objective"),
            "parameters": _decimal_object(row.get("parameters_json"), "selection parameters"),
        }
    else:  # pragma: no cover - fixed table map above
        raise AssertionError(f"unsupported retained table {table_kind}")
    if not isinstance(source_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}", source_id):
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "A retained source identifier is invalid.")
    if at_utc_ms is not None and (isinstance(at_utc_ms, bool) or not isinstance(at_utc_ms, int) or at_utc_ms < 0):
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "A retained UTC millisecond value is invalid.")
    return {
        "sourceOrdinal": ordinal,
        "sourceId": source_id,
        "occurredAtUtcMs": at_utc_ms,
        "payload": payload,
    }


def _json_object(value: object, label: str) -> Mapping[str, Any]:
    try:
        parsed = json.loads(value) if isinstance(value, str) else value
    except json.JSONDecodeError as exc:
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The retained {label} is invalid JSON.") from exc
    if not isinstance(parsed, Mapping):
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The retained {label} must be an object.")
    return {str(key): CurrentSourceArtifactAdapter._json_value(item) for key, item in parsed.items()}


def _decimal_object(value: object, label: str) -> Mapping[str, str]:
    parsed = _json_object(value, label)
    if len(parsed) > MAXIMUM_PARAMETER_FIELDS:
        raise CurrentSourceArtifactError(
            "RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED",
            f"The retained {label} exceeds {MAXIMUM_PARAMETER_FIELDS} declared fields.",
        )
    normalized: dict[str, str] = {}
    for key, item in parsed.items():
        name = str(key)
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", name):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The retained {label} key is invalid.")
        decimal = CurrentSourceArtifactAdapter._decimal(item, f"{label} {name}")
        if len(decimal) > 96:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED", f"The retained {label} decimal is too large.")
        normalized[name] = decimal
    return normalized


def current_source_schema_registry() -> ArtifactSchemaRegistry:
    """Return the finite, explicit table registry accepted by this adapter."""

    exact_decimal = pa.string()
    ordinal = pa.int64()
    utc_ms = pa.int64()
    json_text = pa.string()
    return ArtifactSchemaRegistry((
        ArtifactTableSchema(
            table_kind="observations",
            schema_version="research.current-source-observations.v1",
            arrow_schema=pa.schema((
                pa.field("source_ordinal", ordinal, nullable=False),
                pa.field("source_index_utc", pa.string(), nullable=False),
                pa.field("at_utc_ms", utc_ms, nullable=False),
                pa.field("equity", exact_decimal, nullable=False),
                pa.field("return_fraction", exact_decimal, nullable=False),
                pa.field("accepted_position", exact_decimal, nullable=False),
                pa.field("drawdown_fraction", exact_decimal, nullable=False),
                pa.field("signal_target", exact_decimal, nullable=True),
            )),
            sequence_column="source_ordinal",
            id_column="source_index_utc",
            units={
                "equity": "currency",
                "return_fraction": "fraction",
                "accepted_position": "position_weight",
                "drawdown_fraction": "fraction",
                "signal_target": "position_weight",
            },
        ),
        ArtifactTableSchema(
            table_kind="folds",
            schema_version="research.current-source-folds.v1",
            arrow_schema=pa.schema((
                pa.field("source_ordinal", ordinal, nullable=False),
                pa.field("fold_id", pa.string(), nullable=False),
                pa.field("train_start_utc_ms", utc_ms, nullable=True),
                pa.field("train_end_utc_ms", utc_ms, nullable=True),
                pa.field("test_start_utc_ms", utc_ms, nullable=True),
                pa.field("test_end_utc_ms", utc_ms, nullable=True),
                pa.field("payload_json", json_text, nullable=False),
            )),
            sequence_column="source_ordinal",
            id_column="fold_id",
        ),
        ArtifactTableSchema(
            table_kind="trials",
            schema_version="research.current-source-trials.v1",
            arrow_schema=pa.schema((
                pa.field("source_ordinal", ordinal, nullable=False),
                pa.field("trial_id", pa.string(), nullable=False),
                pa.field("state", pa.string(), nullable=False),
                pa.field("objective", exact_decimal, nullable=True),
                pa.field("parameters_json", json_text, nullable=False),
                pa.field("payload_json", json_text, nullable=False),
            )),
            sequence_column="source_ordinal",
            id_column="trial_id",
        ),
        ArtifactTableSchema(
            table_kind="candidates",
            schema_version="research.current-source-candidates.v1",
            arrow_schema=pa.schema((
                pa.field("source_ordinal", ordinal, nullable=False),
                pa.field("candidate_id", pa.string(), nullable=False),
                pa.field("objective", exact_decimal, nullable=True),
                pa.field("parameters_json", json_text, nullable=False),
                pa.field("payload_json", json_text, nullable=False),
            )),
            sequence_column="source_ordinal",
            id_column="candidate_id",
        ),
        ArtifactTableSchema(
            table_kind="selection",
            schema_version="research.current-source-selection.v1",
            arrow_schema=pa.schema((
                pa.field("source_ordinal", ordinal, nullable=False),
                pa.field("selection_role", pa.string(), nullable=False),
                pa.field("trial_id", pa.string(), nullable=True),
                pa.field("objective", exact_decimal, nullable=True),
                pa.field("parameters_json", json_text, nullable=False),
                pa.field("payload_json", json_text, nullable=False),
            )),
            sequence_column="source_ordinal",
            id_column="selection_role",
        ),
    ))


class CurrentSourceArtifactAdapter:
    """Converts one qualified Advanced WFO run into a P05 sealed artifact."""

    def __init__(self, *, source_artifacts: ArtifactRepository, retained_artifacts: ResearchArtifactStore) -> None:
        self._source_artifacts = source_artifacts
        self._retained_artifacts = retained_artifacts

    def export_advanced_walkforward(
        self,
        *,
        run_id: str,
        identity: ArtifactIdentity,
        fence: ArtifactFence,
        admission: CurrentSourceAdmission,
        fence_validator: Callable[[ArtifactFence], bool],
    ) -> CurrentSourceArtifactExport:
        """Seal actual, already-computed WFO output once under an active lease.

        `fence_validator` is intentionally injected by the durable parent. It
        is never derived from a path, a browser value or artifact metadata.
        """

        admission.validate()
        if identity.run_id != run_id or fence.run_id != run_id:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_FENCE_REJECTED",
                "The source run and P05 identity/fence scopes must match.",
            )
        raw_dir = self._source_artifacts.run_directory(run_id)
        manifest = self._read_json(raw_dir / "manifest.json", "manifest")
        self._require_current_advanced_wfo(manifest)
        config = self._read_json(raw_dir / "config.json", "config")
        self._assert_admission_matches_source(config, admission)
        strategy = self._read_json(raw_dir / "strategy.json", "strategy")
        metrics = self._read_json(raw_dir / "metrics.json", "metrics")
        selection = self._read_json(raw_dir / "selection" / "selected_params.json", "selection")

        observations = self._observation_rows(raw_dir / "series" / "stitched.parquet")
        folds = self._frame_rows(raw_dir / "wfo" / "folds.parquet", kind="folds")
        trials = self._frame_rows(raw_dir / "wfo" / "trials.parquet", kind="trials")
        candidates = self._frame_rows(raw_dir / "wfo" / "candidates.parquet", kind="candidates")
        selection_rows = [self._selection_row(selection)]
        self._assert_admitted_output_bounds(
            observations=observations,
            folds=folds,
            trials=trials,
            candidates=candidates,
            selection=selection_rows,
        )

        source_transform_digest = self._source_transform_digest(
            manifest=manifest,
            config=config,
            selection=selection,
            observations=observations,
            folds=folds,
            trials=trials,
            candidates=candidates,
        )
        registry = current_source_schema_registry()
        summary = self._summary(
            observations=observations,
            folds=folds,
            trials=trials,
            candidates=candidates,
            selection=selection_rows[0],
        )
        if len(json.dumps(canonicalize(summary), ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")) > 65_536:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE",
                "The current-source summary exceeds the sealed local read-model budget.",
            )
        writer = self._retained_artifacts.begin_write(
            identity=identity,
            fence=fence,
            schema_registry=registry,
            fence_validator=fence_validator,
        )
        try:
            self._write_rows(writer, registry, "observations", observations)
            self._write_rows(writer, registry, "folds", folds)
            self._write_rows(writer, registry, "trials", trials)
            self._write_rows(writer, registry, "candidates", candidates)
            self._write_rows(writer, registry, "selection", selection_rows)
            writer.write_small_document("source_manifest", self._document(manifest))
            writer.write_small_document("source_config", self._document(config))
            writer.write_small_document("source_strategy", self._document(strategy))
            writer.write_small_document("source_metrics", self._document(metrics))
            writer.write_small_document("source_coverage", {
                "schema_version": "research.current-source-coverage.v1",
                "source_adapter_id": CURRENT_SOURCE_ADAPTER_ID,
                "profile_id": admission.profile_id,
                "source_transform_digest": source_transform_digest,
                "available": ["observations", "returns", "positions", "folds", "trials", "candidates", "selection"],
                "unavailable": {
                    "route_ledger": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "audited_fills": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "benchmark": "SOURCE_UNSUPPORTED_CONFIRMED",
                },
            })
            writer.write_small_document("current_source_summary", self._document(summary))
            candidate = writer.seal()
        except BaseException:
            writer.abort()
            raise

        sealed_manifest, digest = self._retained_artifacts._load_and_verify_manifest(  # noqa: SLF001 -- same P05 custody module
            candidate.artifact_id,
            verify_parts=True,
        )
        if digest != candidate.manifest_digest:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_SEAL_CONFLICT",
                "The sealed P05 manifest does not match the returned candidate.",
            )
        table_rows = {str(table["table_kind"]): int(table["rows"]) for table in sealed_manifest["tables"]}
        receipt = CurrentSourceArtifactReceipt(
            artifact_id=candidate.artifact_id,
            artifact_revision=candidate.artifact_revision,
            manifest_digest=candidate.manifest_digest,
            total_rows=candidate.total_rows,
            total_bytes=candidate.total_bytes,
            table_rows=table_rows,
            source_transform_digest=source_transform_digest,
            profile_id=admission.profile_id,
            summary=summary,
        )
        return CurrentSourceArtifactExport(candidate=candidate, receipt=receipt)

    def _require_current_advanced_wfo(self, manifest: Mapping[str, Any]) -> None:
        if manifest.get("quantbt_version") != QUANTBT_ENGINE_VERSION:
            raise CurrentSourceArtifactError(
                "NOT_RETAINED_LEGACY",
                "Only a current QuantBT 1.1.1 artifact may enter the RS-02 current-source lane.",
            )
        if manifest.get("protocol") != "advanced_walk_forward":
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED",
                "The RS-02 current-source lane accepts only an admitted advanced_walk_forward result; fixed P04 remains on its versioned reader.",
            )
        if manifest.get("status") != "COMPLETED":
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_NOT_COMPLETE",
                "A current-source artifact may be retained only after a completed engine result.",
            )

    def _assert_admission_matches_source(self, config: Mapping[str, Any], admission: CurrentSourceAdmission) -> None:
        calibration = config.get("calibration")
        if not isinstance(calibration, Mapping):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CONFIG_INVALID", "The source configuration lacks calibration facts.")
        if calibration.get("optimization_mode") != admission.optimization_mode or calibration.get("optimization_schedule") != admission.optimization_schedule:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CONFIG_REJECTED", "The completed source mode/schedule does not match its admitted profile.")
        if calibration.get("random_seed") != admission.random_seed or calibration.get("optuna_trials") != admission.optuna_trials:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CONFIG_REJECTED", "The completed source seed/trial budget does not match its admitted profile.")

    @staticmethod
    def _assert_admitted_output_bounds(
        *,
        observations: list[dict[str, Any]],
        folds: list[dict[str, Any]],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: list[dict[str, Any]],
    ) -> None:
        """Reject an over-budget engine result before P05 writes any bytes.

        The Control API repeats these checks at the custody boundary.  Keeping
        the same finite envelope here means an unexpectedly large or partial
        engine output cannot leave a valid-looking P05 artifact that the
        Portal later has to reject after consuming disk or importer capacity.
        """

        bounds = (
            ("observations", len(observations), 1, 2_000_000),
            ("folds", len(folds), 2, 256),
            ("trials", len(trials), 2, MAXIMUM_OPTUNA_TRIALS),
            ("candidates", len(candidates), 1, MAXIMUM_OPTUNA_TRIALS),
            ("selection", len(selection), 1, 1),
        )
        for relation, count, minimum, maximum in bounds:
            if not minimum <= count <= maximum:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED",
                    f"The admitted current-source {relation} relation must contain {minimum}..{maximum} rows; received {count}.",
                )

    @staticmethod
    def _read_json(path: Path, label: str) -> dict[str, Any]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {label} document is unavailable or invalid.") from exc
        if not isinstance(value, dict):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {label} document must be an object.")
        return value

    @staticmethod
    def _document(value: Mapping[str, Any]) -> dict[str, Any]:
        canonical = canonicalize(dict(value))
        encoded = json.dumps(canonical, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(encoded) > 256 * 1024:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE", "A retained source document exceeds the P05 metadata budget.")
        return canonical

    def _observation_rows(self, path: Path) -> list[dict[str, Any]]:
        frame = self._read_frame(path, "stitched series")
        required = {"equity", "returns", "accepted_position", "drawdown"}
        if not required.issubset(frame.columns):
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                "The current WFO stitched series lacks an admitted observation field.",
            )
        if not frame.index.is_monotonic_increasing or frame.index.has_duplicates:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "The current WFO stitched series is not strictly chronological.")
        rows: list[dict[str, Any]] = []
        for ordinal, (index, row) in enumerate(frame.iterrows()):
            timestamp = self._utc_timestamp(index, "observation")
            rows.append({
                "source_ordinal": ordinal,
                "source_index_utc": timestamp.isoformat().replace("+00:00", "Z"),
                "at_utc_ms": int(timestamp.value // 1_000_000),
                "equity": self._decimal(row["equity"], "equity"),
                "return_fraction": self._decimal(row["returns"], "returns"),
                "accepted_position": self._decimal(row["accepted_position"], "accepted position"),
                "drawdown_fraction": self._decimal(row["drawdown"], "drawdown"),
                "signal_target": self._nullable_decimal(row.get("signal_target"), "signal target"),
            })
        if not rows:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "The current WFO stitched series is empty.")
        return rows

    def _frame_rows(self, path: Path, *, kind: str) -> list[dict[str, Any]]:
        frame = self._read_frame(path, kind)
        if frame.empty:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The current WFO {kind} table is empty.")
        rows: list[dict[str, Any]] = []
        for ordinal, (_, raw) in enumerate(frame.iterrows()):
            record = {str(column): self._json_value(value) for column, value in raw.to_dict().items()}
            if kind == "folds":
                fold_id = self._identifier(record.get("fold_id"), f"{kind} fold id", ordinal)
                rows.append({
                    "source_ordinal": ordinal,
                    "fold_id": fold_id,
                    "train_start_utc_ms": self._nullable_utc_ms(record.get("train_start"), "train start"),
                    "train_end_utc_ms": self._nullable_utc_ms(record.get("train_end"), "train end"),
                    "test_start_utc_ms": self._nullable_utc_ms(record.get("test_start"), "test start"),
                    "test_end_utc_ms": self._nullable_utc_ms(record.get("test_end"), "test end"),
                    "payload_json": self._canonical_json(record),
                })
            elif kind == "trials":
                trial_id = self._identifier(record.get("trial_id"), f"{kind} id", ordinal)
                params = record.get("params") if isinstance(record.get("params"), Mapping) else {}
                normalized_params = _decimal_object(params, f"{kind} parameters")
                rows.append({
                    "source_ordinal": ordinal,
                    "trial_id": trial_id,
                    "state": self._trial_state(record),
                    "objective": self._nullable_decimal(self._first(record, "objective", "value", "score"), "trial objective"),
                    "parameters_json": self._canonical_json(normalized_params),
                    "payload_json": self._canonical_json(record),
                })
            elif kind == "candidates":
                candidate_id = self._identifier(self._first(record, "candidate_id", "trial_id", "id"), f"{kind} id", ordinal)
                params = record.get("params") if isinstance(record.get("params"), Mapping) else {}
                normalized_params = _decimal_object(params, f"{kind} parameters")
                rows.append({
                    "source_ordinal": ordinal,
                    "candidate_id": candidate_id,
                    "objective": self._nullable_decimal(self._first(record, "objective", "value", "score"), "candidate objective"),
                    "parameters_json": self._canonical_json(normalized_params),
                    "payload_json": self._canonical_json(record),
                })
            else:  # pragma: no cover - private call sites stay explicit
                raise AssertionError(f"unsupported current-source table {kind}")
        return rows

    def _selection_row(self, selection: Mapping[str, Any]) -> dict[str, Any]:
        params = selection.get("params")
        if not isinstance(params, Mapping) or not params:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "The WFO source selection has no parameters.")
        normalized_params = _decimal_object(params, "selection parameters")
        return {
            "source_ordinal": 0,
            "selection_role": "SELECTED",
            "trial_id": self._nullable_identifier(selection.get("trial_id")),
            "objective": self._nullable_decimal(selection.get("objective"), "selection objective"),
            "parameters_json": self._canonical_json(normalized_params),
            "payload_json": self._canonical_json(dict(selection)),
        }

    @staticmethod
    def _summary(
        *,
        observations: list[dict[str, Any]],
        folds: list[dict[str, Any]],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: Mapping[str, Any],
    ) -> dict[str, Any]:
        """Build a compact, source-derived seal document for TS BFF mapping.

        It deliberately carries only scalar/fold-selection facts. The caller
        imports full rows from the sealed P05 tables in 200-row batches; no
        response or terminal receipt contains an observation/trial dataframe.
        """

        initial = Decimal(str(observations[0]["equity"]))
        final = Decimal(str(observations[-1]["equity"]))
        if initial == 0:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                "The retained current-source initial equity may not be zero.",
            )
        net_return = (final / initial) - Decimal("1")
        drawdowns = [Decimal(str(row["drawdown_fraction"])) for row in observations]
        # QuantBT's current stitched output records a signed drawdown series;
        # the economically worst drawdown is therefore its minimum, not the
        # maximum absolute value guessed by a display client.
        max_drawdown = min(drawdowns)
        raw_parameters = json.loads(str(selection["parameters_json"]))
        if not isinstance(raw_parameters, Mapping):
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                "The retained selection parameter bundle is invalid.",
            )
        parameters = _decimal_object(raw_parameters, "selection parameters")
        return {
            "schema_version": "research.current-source-summary.v1",
            "metrics": {
                "initial_equity": CurrentSourceArtifactAdapter._decimal(initial, "initial equity"),
                "final_equity": CurrentSourceArtifactAdapter._decimal(final, "final equity"),
                "net_return_fraction": CurrentSourceArtifactAdapter._decimal(net_return, "net return"),
                "max_drawdown_fraction": CurrentSourceArtifactAdapter._decimal(max_drawdown, "max drawdown"),
            },
            "selection": {
                "trial_id": selection.get("trial_id"),
                "objective": selection.get("objective"),
                "parameters": parameters,
            },
            "data_use": {
                # These are source facts only when their exact semantics are
                # published. Current QuantBT WFO rows prove chronology but do
                # not yet attest a warmup/purge/embargo convention or strict
                # outer-OOS selection rule, so preserve typed absences.
                "warmup": {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_WARMUP_CONVENTION"},
                "purge": {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PURGE_CONVENTION"},
                "embargo": {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EMBARGO_CONVENTION"},
                "strict_outer_oos_selection": {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_EVIDENCE"},
            },
            "derived": CurrentSourceArtifactAdapter._derived_series(observations),
            "counts": {
                "folds": len(folds),
                "trials": len(trials),
                "candidates": len(candidates),
            },
        }

    @staticmethod
    def _derived_series(observations: list[dict[str, Any]]) -> dict[str, Any]:
        """Produce finite source-derived chart facts once, before retention.

        Full-resolution observation rows remain in their P05 relation and are
        imported into Portal-local storage.  These compact projections are
        only display aids: all direct passport metrics above still use full
        exact rows, so chart sampling can never change a financial fact.
        """

        equities = [Decimal(str(row["equity"])) for row in observations]
        returns = [Decimal(str(row["return_fraction"])) for row in observations]
        monthly = CurrentSourceArtifactAdapter._monthly_returns(observations, equities)
        rolling = CurrentSourceArtifactAdapter._rolling_returns(observations, equities)
        distribution = CurrentSourceArtifactAdapter._return_distribution(returns)
        return {
            "monthly_returns": monthly,
            "rolling_returns_20": rolling,
            "return_distribution": distribution,
        }

    @staticmethod
    def _monthly_returns(observations: list[dict[str, Any]], equities: list[Decimal]) -> dict[str, Any]:
        """Calendar returns use the previous UTC calendar close, never a tick."""

        month_closes: list[tuple[pd.Timestamp, Decimal]] = []
        current_month: tuple[int, int] | None = None
        current_close: Decimal | None = None
        for observation, equity in zip(observations, equities, strict=True):
            timestamp = CurrentSourceArtifactAdapter._utc_timestamp(observation["source_index_utc"], "monthly observation")
            key = (timestamp.year, timestamp.month)
            if current_month is not None and key != current_month:
                assert current_close is not None  # set on every non-empty month
                month_closes.append((pd.Timestamp(year=current_month[0], month=current_month[1], day=1, tz="UTC"), current_close))
            current_month = key
            current_close = equity
        assert current_month is not None and current_close is not None
        month_closes.append((pd.Timestamp(year=current_month[0], month=current_month[1], day=1, tz="UTC"), current_close))

        all_values: list[dict[str, Any]] = []
        prior_close: Decimal | None = None
        omitted_leading = 0
        for month_start, close in month_closes:
            if prior_close is None:
                omitted_leading += 1
            else:
                if prior_close == 0:
                    raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "A monthly source close may not be zero.")
                all_values.append({
                    "month_start_utc_ms": int(month_start.value // 1_000_000),
                    "return_fraction": CurrentSourceArtifactAdapter._decimal((close / prior_close) - Decimal("1"), "monthly return"),
                })
            prior_close = close
        emitted = all_values[-MAXIMUM_DERIVED_SERIES_POINTS:]
        return {
            "source_observation_count": len(observations),
            "emitted_point_count": len(emitted),
            "total_period_count": len(all_values),
            "omitted_leading_period_count": omitted_leading,
            "omitted_transport_period_count": len(all_values) - len(emitted),
            "sampling": "FULL" if len(emitted) == len(all_values) else "TAIL_WINDOW_V1",
            "values": emitted,
        }

    @staticmethod
    def _rolling_returns(observations: list[dict[str, Any]], equities: list[Decimal]) -> dict[str, Any]:
        """Exact 20-observation rolling returns with deterministic extrema sampling."""

        window = 20
        full: list[dict[str, Any]] = []
        for index in range(window, len(equities)):
            base = equities[index - window]
            if base == 0:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "A rolling source equity may not be zero.")
            full.append({
                "at_utc_ms": observations[index]["at_utc_ms"],
                "return_fraction": CurrentSourceArtifactAdapter._decimal((equities[index] / base) - Decimal("1"), "rolling return"),
            })
        if not full:
            return {
                "source_observation_count": 0,
                "emitted_point_count": 0,
                "window_observations": window,
                "sampling": "NOT_APPLICABLE",
                "values": [],
            }
        indices = CurrentSourceArtifactAdapter._extrema_indices(
            [Decimal(str(item["return_fraction"])) for item in full], maximum=MAXIMUM_DERIVED_SERIES_POINTS,
        )
        emitted = [full[index] for index in indices]
        return {
            "source_observation_count": len(full),
            "emitted_point_count": len(emitted),
            "window_observations": window,
            "sampling": "FULL" if len(emitted) == len(full) else "EXTREMA_BUCKET_V1",
            "values": emitted,
        }

    @staticmethod
    def _return_distribution(values: list[Decimal]) -> dict[str, Any]:
        """A 12-bin exact-decimal histogram with a truthful final inclusive bin."""

        if not values:
            return {
                "state": "NOT_APPLICABLE",
                "reason_code": "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_RETURN_OBSERVATIONS",
                "source_observation_count": 0,
                "emitted_point_count": 0,
                "sampling": "NOT_APPLICABLE",
                "values": [],
            }
        lower, upper = min(values), max(values)
        if lower == upper:
            return {
                "state": "NOT_APPLICABLE",
                "reason_code": "QUANTBT_ADVANCED_WFO_RETURN_DISTRIBUTION_ZERO_VARIANCE",
                "source_observation_count": len(values),
                "emitted_point_count": 0,
                "sampling": "NOT_APPLICABLE",
                "values": [],
            }
        width = (upper - lower) / Decimal(RETURN_DISTRIBUTION_BUCKETS)
        counts = [0] * RETURN_DISTRIBUTION_BUCKETS
        for value in values:
            index = min(RETURN_DISTRIBUTION_BUCKETS - 1, max(0, int((value - lower) / width)))
            counts[index] += 1
        buckets = [{
            "lower_inclusive": CurrentSourceArtifactAdapter._decimal(lower + width * index, "distribution lower"),
            "upper": CurrentSourceArtifactAdapter._decimal(lower + width * (index + 1), "distribution upper"),
            "upper_inclusive": "true" if index == RETURN_DISTRIBUTION_BUCKETS - 1 else "false",
            "count": str(counts[index]),
        } for index in range(RETURN_DISTRIBUTION_BUCKETS)]
        return {
            "state": "AVAILABLE",
            "reason_code": None,
            "source_observation_count": len(values),
            "emitted_point_count": len(buckets),
            "sampling": "FULL_RETURN_HISTOGRAM_V2",
            "values": buckets,
        }

    @staticmethod
    def _extrema_indices(values: list[Decimal], *, maximum: int) -> list[int]:
        """Bound a chronological chart while preserving endpoints and extrema."""

        if maximum < 2:
            raise ValueError("current-source extrema sampling needs both endpoints")
        if len(values) <= maximum:
            return list(range(len(values)))
        buckets = max(1, (maximum - 2) // 2)
        selected = {0, len(values) - 1}
        for bucket in range(buckets):
            start = 1 + ((len(values) - 2) * bucket) // buckets
            end = 1 + ((len(values) - 2) * (bucket + 1)) // buckets
            if end <= start:
                continue
            selected.add(min(range(start, end), key=lambda index: values[index]))
            selected.add(max(range(start, end), key=lambda index: values[index]))
        return sorted(selected)

    @staticmethod
    def _read_frame(path: Path, label: str) -> pd.DataFrame:
        try:
            frame = pd.read_parquet(path)
        except (OSError, ValueError, ImportError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {label} Parquet is unavailable or invalid.") from exc
        if not isinstance(frame, pd.DataFrame):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {label} is not a table.")
        return frame

    def _write_rows(self, writer: Any, registry: ArtifactSchemaRegistry, kind: str, rows: Iterable[dict[str, Any]]) -> None:
        schema = registry.require(kind).arrow_schema
        values = list(rows)
        if not values:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {kind} relation is empty.")
        for start in range(0, len(values), MAXIMUM_TABLE_BATCH_ROWS):
            batch_rows = values[start : start + MAXIMUM_TABLE_BATCH_ROWS]
            try:
                batch = pa.RecordBatch.from_pylist(batch_rows, schema=schema)
            except (pa.ArrowException, ValueError, TypeError) as exc:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {kind} rows do not match the retained schema.") from exc
            writer.append_batch(kind, batch)

    @staticmethod
    def _utc_timestamp(value: object, label: str) -> pd.Timestamp:
        try:
            timestamp = pd.Timestamp(value)
        except (TypeError, ValueError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} timestamp is invalid.") from exc
        if timestamp is pd.NaT:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} timestamp is missing.")
        if timestamp.tzinfo is None:
            timestamp = timestamp.tz_localize(UTC)
        else:
            timestamp = timestamp.tz_convert(UTC)
        if timestamp.value < 0:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} timestamp predates UTC epoch.")
        return timestamp

    def _nullable_utc_ms(self, value: object, label: str) -> int | None:
        if value is None or value is pd.NaT:
            return None
        return int(self._utc_timestamp(value, label).value // 1_000_000)

    @staticmethod
    def _decimal(value: object, label: str) -> str:
        if value is None or value is pd.NaT or isinstance(value, bool):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} value is missing or invalid.")
        try:
            numeric = Decimal(str(value))
        except Exception as exc:  # Decimal has several implementation-specific parse errors
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} value is not numeric.") from exc
        if not numeric.is_finite():
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The {label} value is not finite.")
        text = format(numeric, "f")
        if "." in text:
            text = text.rstrip("0").rstrip(".")
        return "0" if text in {"", "-0"} else text

    def _nullable_decimal(self, value: object, label: str) -> str | None:
        if value is None or value is pd.NaT:
            return None
        try:
            if bool(pd.isna(value)):
                return None
        except (TypeError, ValueError):
            pass
        return self._decimal(value, label)

    @staticmethod
    def _identifier(value: object, label: str, ordinal: int) -> str:
        candidate = str(value) if value is not None and value is not pd.NaT else ""
        if not candidate or len(candidate) > 160 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}", candidate):
            return f"{label.replace(' ', '-')}-{ordinal:06d}"
        return candidate

    @staticmethod
    def _nullable_identifier(value: object) -> str | None:
        if value is None or value is pd.NaT:
            return None
        candidate = str(value)
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}", candidate):
            return candidate
        return None

    @staticmethod
    def _first(record: Mapping[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in record:
                return record[key]
        return None

    @staticmethod
    def _trial_state(record: Mapping[str, Any]) -> str:
        candidate = CurrentSourceArtifactAdapter._first(record, "state", "status", "trial_state")
        if isinstance(candidate, str) and re.fullmatch(r"[A-Z][A-Z0-9_]{1,63}", candidate):
            return candidate
        return "COMPLETE"

    @staticmethod
    def _json_value(value: object) -> Any:
        if value is pd.NaT:
            return None
        if isinstance(value, (float,)):
            if not math.isfinite(value):
                return None
            return value
        if hasattr(value, "item") and not isinstance(value, (str, bytes, bytearray)):
            try:
                return CurrentSourceArtifactAdapter._json_value(value.item())
            except (TypeError, ValueError):
                pass
        if isinstance(value, pd.Timestamp):
            return CurrentSourceArtifactAdapter._utc_timestamp(value, "metadata").isoformat().replace("+00:00", "Z")
        if isinstance(value, Mapping):
            return {str(key): CurrentSourceArtifactAdapter._json_value(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [CurrentSourceArtifactAdapter._json_value(item) for item in value]
        return value

    @staticmethod
    def _canonical_json(value: Mapping[str, Any]) -> str:
        try:
            return json.dumps(canonicalize(dict(value)), ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "Source metadata is not canonical JSON.") from exc

    @staticmethod
    def _source_transform_digest(**values: Any) -> str:
        try:
            payload = canonicalize(values)
            encoded = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "Current-source transform identity is invalid.") from exc
        return hashlib.sha256(encoded).hexdigest()


__all__ = [
    "CURRENT_SOURCE_ADAPTER_ID",
    "CURRENT_SOURCE_ENGINE_OPERATION",
    "CURRENT_SOURCE_PROFILE_ID",
    "CURRENT_SOURCE_RECEIPT_SCHEMA",
    "CURRENT_SOURCE_TARGET_MODE",
    "CurrentSourceAdmission",
    "CurrentSourceArtifactAdapter",
    "CurrentSourceArtifactError",
    "CurrentSourceArtifactExport",
    "CurrentSourceArtifactReceipt",
    "CurrentSourceRetentionBatch",
    "current_source_schema_registry",
    "default_current_source_admission",
    "iter_current_source_retention_batches",
]
