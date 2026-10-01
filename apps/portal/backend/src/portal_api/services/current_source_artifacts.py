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
from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_OPTUNA_TRIALS,
    DELTA_WFO_PREVIEW_LONG_MAX_TRIALS,
    delta_wfo_preview_long_enabled,
)
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
SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID: Final = "rs02.quantbt-signal-notional-wfo.v1"
SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID: Final = "rs02.delta-signal-notional-wfo.v1"
MAXIMUM_OPTUNA_TRIALS: Final = 64


def _maximum_optuna_trials() -> int:
    """64, or 400 while the research-preview long WFO flag is on (PORTAL_ENV=local).

    Candidates keep the 64 ceiling: the global schedule keeps the top 10 %.
    """

    return DELTA_WFO_PREVIEW_LONG_MAX_TRIALS if delta_wfo_preview_long_enabled() else MAXIMUM_OPTUNA_TRIALS
MAXIMUM_TABLE_BATCH_ROWS: Final = 200
MAXIMUM_DERIVED_SERIES_POINTS: Final = 192
MAXIMUM_PARAMETER_FIELDS: Final = 24
RETURN_DISTRIBUTION_BUCKETS: Final = 12
# W5b: whole-run OHLC overview buckets kept in the seal summary (< 64 KiB total).
MAXIMUM_CANDLE_OVERVIEW_BUCKETS: Final = 160
# P17-T14: QuantBT isolation records kept per fold (a fold row stays < 64 KiB).
MAXIMUM_CHILD_AUDIT_RECORDS_PER_FOLD: Final = 64
_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_CURRENT_SOURCE_PROFILES: Final = {
    CURRENT_SOURCE_PROFILE_ID: (CURRENT_SOURCE_ADAPTER_ID, CURRENT_SOURCE_TARGET_MODE),
    SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID: (
        SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID,
        "signal_notional",
    ),
}


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
        profile = _CURRENT_SOURCE_PROFILES.get(self.profile_id)
        if profile is None:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED",
                "The current-source profile is not installed.",
            )
        expected_adapter, expected_target_mode = profile
        if self.engine_operation != CURRENT_SOURCE_ENGINE_OPERATION or self.target_mode != expected_target_mode:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ROUTE_REJECTED",
                f"The {expected_adapter} adapter accepts only QuantBT walk_forward with {expected_target_mode}.",
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
        maximum_trials = _maximum_optuna_trials()
        if isinstance(self.optuna_trials, bool) or not isinstance(self.optuna_trials, int) or not 2 <= self.optuna_trials <= maximum_trials:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_TRIAL_BUDGET_REJECTED",
                f"The current-source adapter accepts 2..{maximum_trials} trials.",
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


def signal_notional_current_source_admission(optuna_trials: int = DELTA_WFO_OPTUNA_TRIALS) -> CurrentSourceAdmission:
    """Return the separately versioned real-HMD-qualified Signal Notional profile.

    The first qualification is pinned to the measured three-trial run, one
    deterministic seed and global Mode 1. It is not a generic strategy
    executor and grants no authority to execute imported Python source.
    Widening this profile requires a new measured source receipt. The one
    exception is the research-preview long WFO: its caller passes the run's
    admitted trial count only while that PORTAL_ENV=local flag is on.
    """

    if optuna_trials != DELTA_WFO_OPTUNA_TRIALS and not delta_wfo_preview_long_enabled():
        raise CurrentSourceArtifactError(
            "RESEARCH_CURRENT_SOURCE_TRIAL_BUDGET_REJECTED",
            "The Signal Notional current-source profile runs exactly 3 trials.",
        )

    return CurrentSourceAdmission(
        profile_id=SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID,
        engine_operation=CURRENT_SOURCE_ENGINE_OPERATION,
        target_mode="signal_notional",
        optimization_mode="mode_1_decay",
        optimization_schedule="global",
        random_seed=42,
        optuna_trials=optuna_trials,
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
        # W5b: observations schema v2 carries one declared bar block.
        if isinstance(row.get("bar_json"), str):
            payload["bar"] = dict(_json_object(row["bar_json"], "retained bar block"))
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
        facts = _retained_facts(row, "fold_facts")
        if facts is not None:
            payload["fold_facts"] = facts
        # P17-T14: the fold's child-audit block, only on a W5b source tree.
        child_audit = _retained_facts(row, "child_audit")
        if child_audit is not None:
            payload["child_audit"] = child_audit
    elif table_kind == "trials":
        source_id = row.get("trial_id")
        at_utc_ms = None
        payload = {
            "trial_id": source_id,
            "state": row.get("state"),
            "objective": row.get("objective"),
            "parameters": _decimal_object(row.get("parameters_json"), "trial parameters"),
        }
        facts = _retained_facts(row, "trial_facts")
        if facts is not None:
            payload["trial_facts"] = facts
    elif table_kind == "candidates":
        source_id = row.get("candidate_id")
        at_utc_ms = None
        payload = {
            "candidate_id": source_id,
            "objective": row.get("objective"),
            "parameters": _decimal_object(row.get("parameters_json"), "candidate parameters"),
        }
        facts = _retained_facts(row, "trial_facts")
        if facts is not None:
            payload["trial_facts"] = facts
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


def _retained_facts(row: Mapping[str, Any], key: str) -> Mapping[str, Any] | None:
    """The declared W3 facts block of a retained row, or None for an older artifact.

    Only this named, exporter-built block leaves P05; the raw source record
    around it (`payload_json`) never becomes a Portal import field.
    """

    raw = row.get("payload_json")
    if not isinstance(raw, str):
        return None
    record = _json_object(raw, "retained row payload")
    facts = record.get(key)
    if facts is None:
        return None
    if not isinstance(facts, Mapping):
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The retained {key} block must be an object.")
    return dict(facts)


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


def current_source_schema_registry(*, bar_ledger: bool = False) -> ArtifactSchemaRegistry:
    """Return the finite, explicit table registry accepted by this adapter.

    ``bar_ledger`` selects the W5b observation schema v2: the v1 columns plus
    one ``bar_json`` block per bar (the candle the engine consumed and the
    final account's own fee/turnover/funding for that bar, with running
    checkpoints). A source tree without ``series/account_ledger.v1.parquet``
    keeps the v1 schema byte-for-byte.
    """

    exact_decimal = pa.string()
    ordinal = pa.int64()
    utc_ms = pa.int64()
    json_text = pa.string()
    observation_fields = [
        pa.field("source_ordinal", ordinal, nullable=False),
        pa.field("source_index_utc", pa.string(), nullable=False),
        pa.field("at_utc_ms", utc_ms, nullable=False),
        pa.field("equity", exact_decimal, nullable=False),
        pa.field("return_fraction", exact_decimal, nullable=False),
        pa.field("accepted_position", exact_decimal, nullable=False),
        pa.field("drawdown_fraction", exact_decimal, nullable=False),
        pa.field("signal_target", exact_decimal, nullable=True),
    ]
    if bar_ledger:
        observation_fields.append(pa.field("bar_json", json_text, nullable=False))
    return ArtifactSchemaRegistry((
        ArtifactTableSchema(
            table_kind="observations",
            schema_version=(
                "research.current-source-observations.v2" if bar_ledger
                else "research.current-source-observations.v1"
            ),
            arrow_schema=pa.schema(observation_fields),
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
        source_adapter_id = _CURRENT_SOURCE_PROFILES[admission.profile_id][0]
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
        # W3: optional QuantBT fact documents written by the runner since
        # CG-P13-07/08. An older source tree simply lacks them; every fact
        # derived from them then stays a typed absence downstream.
        source_contract = self._optional_json(raw_dir / "wfo" / "source_contract.v1.json", "source contract")
        fold_metrics = self._optional_json(raw_dir / "wfo" / "selected_fold_metrics.v1.json", "selected fold metrics")
        summary_analytics = self._optional_json(raw_dir / "wfo" / "retained_analytics.v1.json", "retained analytics")
        summary_analytics_v2 = self._optional_json(raw_dir / "wfo" / "retained_analytics.v2.json", "Portal analytics v2")
        if summary_analytics_v2 is not None:
            summary_analytics_v2 = {key: value for key, value in summary_analytics_v2.items()
                                    if key not in {"producer", "artifact_schema_version"}}
        if summary_analytics is not None:
            # The source file has Portal artifact provenance; the named public
            # analytics DTO does not expose writer metadata. Older raw blocks
            # stay valid and preserve their original semantic transform digest.
            summary_analytics = {key: value for key, value in summary_analytics.items()
                                 if key not in {"producer", "artifact_schema_version"}}
        fold_extension = self._optional_frame(raw_dir / "wfo" / "folds_extension.v1.parquet", "fold extension")
        folds = self._frame_rows(raw_dir / "wfo" / "folds.parquet", kind="folds")
        self._attach_fold_facts(
            folds,
            extension=fold_extension,
            fold_metrics=fold_metrics,
            observations=observations,
        )
        trials = self._frame_rows(raw_dir / "wfo" / "trials.parquet", kind="trials", source_contract=source_contract)
        candidates = self._frame_rows(
            raw_dir / "wfo" / "candidates.parquet",
            kind="candidates",
            source_contract=source_contract,
            objective_terms=self._objective_terms(config),
        )
        selection_rows = [self._selection_row(selection)]
        # W5b (P17): the final account's per-bar ledger and its counted
        # order/fill/trade facts. Optional, so an older source tree keeps its
        # v1 observation schema, its digest and its summary exactly.
        account_ledger = self._optional_frame(raw_dir / "series" / "account_ledger.v1.parquet", "account ledger")
        account_contract = self._optional_json(raw_dir / "wfo" / "account_contract.v1.json", "account contract")
        replay_summary = None
        lifecycle = self._optional_frame(raw_dir / "wfo" / "strategy_lifecycle.v1.parquet", "strategy lifecycle")
        lifecycle_contract = self._optional_json(raw_dir / "wfo" / "strategy_lifecycle_contract.v1.json", "strategy lifecycle contract")
        child_audit_summary = None
        if lifecycle is not None and account_ledger is not None:
            child_audit_summary = self._attach_child_audit(folds, lifecycle=lifecycle, contract=lifecycle_contract)
        if account_ledger is not None:
            replay_summary = self._attach_bar_ledger(
                observations,
                stitched=self._read_frame(raw_dir / "series" / "stitched.parquet", "stitched series"),
                ledger=account_ledger,
                folds=folds,
                account_contract=account_contract,
                source_contract=source_contract,
            )
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
            # Only when present, so an older source tree keeps its digest.
            **{
                key: value
                for key, value in (
                    ("source_contract", source_contract),
                    ("selected_fold_metrics", fold_metrics),
                    ("summary_analytics", summary_analytics),
                    ("summary_analytics_v2", summary_analytics_v2),
                    ("account_contract", account_contract if account_ledger is not None else None),
                    ("strategy_lifecycle_contract", lifecycle_contract if child_audit_summary is not None else None),
                )
                if value is not None
            },
        )
        registry = current_source_schema_registry(bar_ledger=account_ledger is not None)
        summary = self._summary(
            observations=observations,
            folds=folds,
            trials=trials,
            candidates=candidates,
            selection=selection_rows[0],
            source_facts=self._source_facts(
                source_contract=source_contract,
                fold_metrics=fold_metrics,
                config=config,
                trials=trials,
                candidates=candidates,
                selection=selection_rows[0],
            ),
        )
        # The retained table/manifest hashes authenticate the projection,
        # not the source equity file itself. Seal its actual bytes once here.
        series_path = raw_dir / "series" / "stitched.parquet"
        series_hash = hashlib.sha256()
        series_size = 0
        with series_path.open("rb") as source_series:
            for chunk in iter(lambda: source_series.read(1024 * 1024), b""):
                series_hash.update(chunk)
                series_size += len(chunk)
        summary["source_series_artifact"] = {
            "algorithm": "SHA-256",
            "digest": series_hash.hexdigest(),
            "logical_name": "series/stitched.parquet",
            "size_bytes": series_size,
            "scope": "FULL_STITCHED_SOURCE_SERIES",
        }
        if replay_summary is not None:
            summary["replay"] = replay_summary
            if child_audit_summary is not None:
                summary["replay"]["child_audit"] = child_audit_summary
        if summary_analytics is not None:
            summary["summary_analytics"] = summary_analytics
        if summary_analytics_v2 is not None:
            summary["summary_analytics_v2"] = summary_analytics_v2
        self._fit_summary_budget(summary, observations)
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
                "source_adapter_id": source_adapter_id,
                "profile_id": admission.profile_id,
                "source_transform_digest": source_transform_digest,
                "available": ["observations", "returns", "positions", "folds", "trials", "candidates", "selection"],
                "unavailable": {
                    "route_ledger": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "audited_fills": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "benchmark": "SOURCE_UNSUPPORTED_CONFIRMED",
                },
            })
            if source_contract is not None:
                writer.write_small_document("source_contract", self._document(source_contract))
            if fold_metrics is not None:
                writer.write_small_document("source_selected_fold_metrics", self._document(fold_metrics))
            if summary_analytics is not None:
                writer.write_small_document("source_retained_analytics", self._document(summary_analytics))
            if summary_analytics_v2 is not None:
                writer.write_small_document("source_retained_analytics_v2", self._document(summary_analytics_v2))
            if account_ledger is not None and account_contract is not None:
                writer.write_small_document("source_account_contract", self._document(account_contract))
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
            source_adapter_id=source_adapter_id,
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
        execution = config.get("execution")
        if not isinstance(execution, Mapping) or execution.get("target_mode") != admission.target_mode:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ROUTE_REJECTED", "The retained run target mode does not match its admitted source profile.")
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
            ("trials", len(trials), 2, _maximum_optuna_trials()),
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

    def _frame_rows(
        self,
        path: Path,
        *,
        kind: str,
        source_contract: Mapping[str, Any] | None = None,
        objective_terms: Mapping[str, Decimal] | None = None,
    ) -> list[dict[str, Any]]:
        frame = self._read_frame(path, kind)
        if frame.empty:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The current WFO {kind} table is empty.")
        rows: list[dict[str, Any]] = []
        for ordinal, (_, raw) in enumerate(frame.iterrows()):
            record = {str(column): self._json_value(value) for column, value in raw.to_dict().items()}
            if kind in {"trials", "candidates"}:
                # The runner flattens nested trial columns into `*_json` text
                # (`_flatten_frame`). Read both spellings, so a real ledger's
                # parameters and stage metadata are never silently dropped.
                if not isinstance(record.get("params"), Mapping) and isinstance(record.get("params_json"), str):
                    record["params"] = dict(_json_object(record["params_json"], f"{kind} parameters"))
                if not isinstance(record.get("selection_metadata"), Mapping) and isinstance(record.get("selection_metadata_json"), str):
                    record["selection_metadata"] = dict(_json_object(record["selection_metadata_json"], f"{kind} selection metadata"))
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
                record["trial_facts"] = self._trial_facts(record, source_contract=source_contract, objective_terms=None)
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
                record["trial_facts"] = self._trial_facts(record, source_contract=source_contract, objective_terms=objective_terms)
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

    # ------------------------------------------------------------ W3 facts

    def _optional_json(self, path: Path, label: str) -> dict[str, Any] | None:
        if not path.exists():
            return None
        return self._read_json(path, label)

    def _optional_frame(self, path: Path, label: str) -> pd.DataFrame | None:
        if not path.exists():
            return None
        return self._read_frame(path, label)

    @staticmethod
    def _fact_token(value: object) -> str | None:
        """A verbatim QuantBT enum-like string, or None when it is not one."""

        if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}", value):
            return value
        return None

    @staticmethod
    def _fact_bool(value: object) -> bool | None:
        return value if isinstance(value, bool) else None

    @staticmethod
    def _fact_int(value: object) -> int | None:
        if isinstance(value, bool):
            return None
        if isinstance(value, int) and value >= 0:
            return value
        if isinstance(value, float) and math.isfinite(value) and value.is_integer() and value >= 0:
            return int(value)
        return None

    def _fact_decimal(self, value: object, label: str) -> str | None:
        if value is None or isinstance(value, bool):
            return None
        if isinstance(value, float) and not math.isfinite(value):
            return None
        try:
            return self._nullable_decimal(value, label)
        except CurrentSourceArtifactError:
            return None

    def _attach_fold_facts(
        self,
        folds: list[dict[str, Any]],
        *,
        extension: pd.DataFrame | None,
        fold_metrics: Mapping[str, Any] | None,
        observations: list[dict[str, Any]],
    ) -> None:
        """Add one bounded `fold_facts` object to each retained fold payload.

        * `guards` — QuantBT 1.1.1's own per-fold warm-up / label-horizon /
          purge / embargo / validation windows (`folds_extension.v1.parquet`).
        * `oos_score` — QuantBT's per-fold score for the selected parameters
          (`best_trial.fold_metrics`): S_IS, S_OOS, decay, trade counts.
        * `oos_path` — computed once here from the retained stitched
          observations inside the fold's test window: fold return, maximum
          drawdown and the worst bar. It is labelled as a derivation.
        """

        extension_by_id: dict[str, dict[str, Any]] = {}
        if extension is not None:
            for _, raw in extension.iterrows():
                record = {str(column): self._json_value(value) for column, value in raw.to_dict().items()}
                extension_by_id[str(record.get("fold_id"))] = record
        metrics_by_id: dict[str, Mapping[str, Any]] = {}
        if fold_metrics is not None and isinstance(fold_metrics.get("fold_metrics"), list):
            for row in fold_metrics["fold_metrics"]:
                if isinstance(row, Mapping):
                    metrics_by_id[str(row.get("fold_id"))] = row
        for fold in folds:
            record = json.loads(fold["payload_json"])
            fold_id = fold["fold_id"]
            facts: dict[str, Any] = {
                "schema_version": "research.current-source-fold-facts.v1",
                "train_bars": self._fact_int(record.get("train_bars")),
                "test_bars": self._fact_int(record.get("test_bars")),
                "guards": self._fold_guards(extension_by_id.get(fold_id)) if extension is not None else None,
                "oos_score": self._fold_score(metrics_by_id.get(fold_id)) if fold_metrics is not None else None,
                "oos_path": self._fold_path(
                    observations,
                    start_ms=fold["test_start_utc_ms"],
                    end_ms=fold["test_end_utc_ms"],
                ),
            }
            record["fold_facts"] = facts
            fold["payload_json"] = self._canonical_json(record)

    # ---------------------------------------------------------- W5b bars

    def _attach_bar_ledger(
        self,
        observations: list[dict[str, Any]],
        *,
        stitched: pd.DataFrame,
        ledger: pd.DataFrame,
        folds: list[dict[str, Any]],
        account_contract: Mapping[str, Any] | None,
        source_contract: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        """Add one ``bar_json`` block per observation and return the replay summary.

        Each block holds what QuantBT's final account consumed and produced on
        that bar: the candle (the analysed HMD bar in ``stitched.parquet``),
        the fee, turnover, funding and rejected-order count (the account's own
        series), and running checkpoints so a far seek reads the same state a
        sequential replay would reach. ``transition`` is a change of the
        engine's accepted position — the close-target route's only execution
        event; it is never called a fill.
        """

        if len(stitched) != len(observations):
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                "The stitched series and the retained observations disagree on bar count.",
            )
        aligned = ledger.reindex(stitched.index)
        has_candle = {"open", "high", "low", "close"}.issubset(stitched.columns)
        windows = [
            (fold["fold_id"], fold["test_start_utc_ms"], fold["test_end_utc_ms"])
            for fold in folds
            if fold["test_start_utc_ms"] is not None and fold["test_end_utc_ms"] is not None
        ]
        columns = set(aligned.columns)
        cumulative = {
            name: (Decimal("0") if name in columns else None)
            for name in ("fee", "turnover", "funding")
        }
        rejected_total = 0 if "rejected_orders" in columns else None
        transitions = 0
        bars_with_turnover = 0
        previous_position: Decimal | None = None
        for ordinal, (observation, (index, bar), (_, account)) in enumerate(
            zip(observations, stitched.iterrows(), aligned.iterrows(), strict=True)
        ):
            timestamp = self._utc_timestamp(index, "bar")
            if int(timestamp.value // 1_000_000) != observation["at_utc_ms"]:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                    "A bar ledger row is not aligned with its retained observation.",
                )
            position = Decimal(str(observation["accepted_position"]))
            # QuantBT opens the account flat and never executes target[0]
            # (`first_bar_target_policy`), so bar 0 transitions only if the
            # engine itself reports a non-zero accepted position there.
            transition = position != (previous_position if previous_position is not None else Decimal("0"))
            transitions += int(transition)
            values: dict[str, str | None] = {}
            for name in ("fee", "turnover", "funding"):
                values[name] = self._nullable_decimal(account.get(name), f"bar {name}") if name in columns else None
                if values[name] is not None:
                    cumulative[name] = (cumulative[name] or Decimal("0")) + Decimal(values[name])
            if values["turnover"] is not None and Decimal(values["turnover"]) != 0:
                bars_with_turnover += 1
            rejected = self._fact_int(account.get("rejected_orders")) if "rejected_orders" in columns else None
            if rejected is not None and rejected_total is not None:
                rejected_total += rejected
            at = observation["at_utc_ms"]
            fold_id = next((fold for fold, start, end in windows if start <= at <= end), None)
            block = {
                "schema_version": "research.current-source-bar.v1",
                "candle": None if not has_candle else {
                    "open": self._decimal(bar["open"], "bar open"),
                    "high": self._decimal(bar["high"], "bar high"),
                    "low": self._decimal(bar["low"], "bar low"),
                    "close": self._decimal(bar["close"], "bar close"),
                    "volume": self._nullable_decimal(bar.get("volume"), "bar volume"),
                },
                "fee": values["fee"],
                "turnover": values["turnover"],
                "funding": values["funding"],
                "rejected_orders": rejected,
                "reject_code": self._fact_int(account.get("reject_code")) if "reject_code" in columns else None,
                "position_before": None if previous_position is None else self._decimal(previous_position, "position before"),
                "transition": transition,
                "fold_id": fold_id,
                "checkpoint": {
                    "cumulative_fee": None if cumulative["fee"] is None else self._decimal(cumulative["fee"], "cumulative fee"),
                    "cumulative_turnover": None if cumulative["turnover"] is None else self._decimal(cumulative["turnover"], "cumulative turnover"),
                    "cumulative_funding": None if cumulative["funding"] is None else self._decimal(cumulative["funding"], "cumulative funding"),
                    "transition_count": transitions,
                    "rejected_orders": rejected_total,
                },
            }
            observation["bar_json"] = self._canonical_json(block)
            previous_position = position
        return self._replay_summary(
            observations,
            folds=windows,
            account_contract=account_contract,
            source_contract=source_contract,
            totals={
                "bars": len(observations),
                "transitions": transitions,
                "bars_with_turnover": bars_with_turnover,
                "fee": None if cumulative["fee"] is None else self._decimal(cumulative["fee"], "total fee"),
                "turnover": None if cumulative["turnover"] is None else self._decimal(cumulative["turnover"], "total turnover"),
                "funding": None if cumulative["funding"] is None else self._decimal(cumulative["funding"], "total funding"),
                "rejected_orders": rejected_total,
            },
            has_candle=has_candle,
        )

    def _attach_child_audit(
        self,
        folds: list[dict[str, Any]],
        *,
        lifecycle: pd.DataFrame,
        contract: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        """Add QuantBT's strategy-isolation records to each fold payload (P17-T14).

        One record per child strategy instance QuantBT created for that fold:
        in-sample search per candidate, in-sample and out-of-sample scoring of
        the selected candidate, and the out-of-sample generation that produced
        the replayed bars. ``audit_ordinal`` is the record's row in QuantBT's
        own table — the original child-audit id together with the candidate id,
        fold id and seed QuantBT gave it. No record is invented or reordered.
        """

        fold_ids = {fold["fold_id"] for fold in folds}
        by_fold: dict[str, list[dict[str, Any]]] = {fold_id: [] for fold_id in fold_ids}
        unmatched = 0
        fingerprints: set[str] = set()
        for ordinal, (_, raw) in enumerate(lifecycle.iterrows()):
            record = {str(column): self._json_value(value) for column, value in raw.to_dict().items()}
            fold_id = None if record.get("fold_id") is None else str(record.get("fold_id"))
            if fold_id not in by_fold:
                unmatched += 1
                continue
            run_fingerprint = self._fact_token(record.get("run_id"))
            if run_fingerprint:
                fingerprints.add(run_fingerprint)
            context = record.get("context")
            by_fold[fold_id].append({
                "audit_ordinal": ordinal,
                "candidate_id": self._fact_token(record.get("candidate_id")),
                "fold_id": fold_id,
                "seed": self._fact_int(record.get("seed")),
                "context": context if isinstance(context, str) and 0 < len(context) <= 96 else None,
                "lifecycle_kind": self._fact_token(record.get("lifecycle_kind")),
                "policy": self._fact_token(record.get("policy")),
                "certified_isolation": self._fact_bool(record.get("certified_isolation")),
                "spawned": self._fact_bool(record.get("spawned")),
                "reset_called": self._fact_bool(record.get("reset_called")),
                "warmup_called": self._fact_bool(record.get("warmup_called")),
                "warmup_bars": self._fact_int(record.get("warmup_bars")),
                "closed": self._fact_bool(record.get("closed")),
                "state_before": self._fact_token(record.get("state_before")),
                "cutoff_utc_ms": self._nullable_utc_ms(record.get("cutoff"), "lifecycle cutoff"),
                "train_start_utc_ms": self._nullable_utc_ms(record.get("train_start"), "lifecycle train start"),
                "train_end_utc_ms": self._nullable_utc_ms(record.get("train_end"), "lifecycle train end"),
                "test_start_utc_ms": self._nullable_utc_ms(record.get("test_start"), "lifecycle test start"),
                "test_end_utc_ms": self._nullable_utc_ms(record.get("test_end"), "lifecycle test end"),
                "strategy_fingerprint": self._fact_token(record.get("strategy_fingerprint")),
                "market_fingerprint": self._fact_token(record.get("market_fingerprint")),
            })
        for fold in folds:
            records = by_fold[fold["fold_id"]]
            # QuantBT appends the OOS-generation child after trial search.
            # A first-64 sample can hide the exact child that generated the
            # replay even when the source retained it. Reserve that record
            # before filling the bounded display sample; keep source ordinals.
            generation = [row for row in records if row["context"] == "out-of-sample generation"]
            if len(generation) > MAXIMUM_CHILD_AUDIT_RECORDS_PER_FOLD:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_CHILD_AUDIT_INVALID",
                    "The source published more OOS-generation children than the admitted fold budget.",
                )
            generation_ordinals = {row["audit_ordinal"] for row in generation}
            # Keep a selection-stage witness for each retained generation
            # candidate too. A long study otherwise keeps the generated
            # child but drops its real pre-generation bundle fingerprint.
            witnesses: list[dict[str, Any]] = []
            for child in generation:
                if child["candidate_id"] is None:
                    continue
                witness = next((row for row in records
                    if row["audit_ordinal"] < child["audit_ordinal"]
                    and row["context"] != "out-of-sample generation"
                    and row["candidate_id"] == child["candidate_id"]), None)
                if witness is not None and witness["audit_ordinal"] not in generation_ordinals:
                    witnesses.append(witness)
                    generation_ordinals.add(witness["audit_ordinal"])
            required = generation + witnesses
            if len(required) > MAXIMUM_CHILD_AUDIT_RECORDS_PER_FOLD:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_CHILD_AUDIT_INVALID",
                    "The source generation witnesses exceed the admitted fold budget.",
                )
            selected = required + [row for row in records if row["audit_ordinal"] not in generation_ordinals][
                :MAXIMUM_CHILD_AUDIT_RECORDS_PER_FOLD - len(required)]
            selected.sort(key=lambda row: row["audit_ordinal"])
            block = {
                "schema_version": "research.current-source-fold-child-audit.v1",
                "source_record_count": len(records),
                "truncated": len(records) > MAXIMUM_CHILD_AUDIT_RECORDS_PER_FOLD,
                "records": selected,
            }
            record = json.loads(fold["payload_json"])
            record["child_audit"] = block
            fold["payload_json"] = self._canonical_json(record)
        contract = contract or {}
        return {
            "schema_version": "research.current-source-child-audit-summary.v1",
            "policy": self._fact_token(contract.get("policy")),
            "records_dropped_by_source": self._fact_int(contract.get("records_dropped")),
            "source_record_count": len(lifecycle),
            "unmatched_record_count": unmatched,
            "source_run_fingerprint": next(iter(fingerprints)) if len(fingerprints) == 1 else None,
        }

    def _replay_summary(
        self,
        observations: list[dict[str, Any]],
        *,
        folds: list[tuple[str, int, int]],
        account_contract: Mapping[str, Any] | None,
        source_contract: Mapping[str, Any] | None,
        totals: Mapping[str, Any],
        has_candle: bool,
    ) -> dict[str, Any]:
        contract = account_contract or {}
        plan = contract.get("account_execution_plan") if isinstance(contract.get("account_execution_plan"), Mapping) else None
        walk_forward = source_contract.get("walk_forward") if isinstance(source_contract, Mapping) and isinstance(source_contract.get("walk_forward"), Mapping) else {}
        events = []
        if plan is not None and isinstance(plan.get("boundary_events"), list):
            for event in plan["boundary_events"]:
                if not isinstance(event, Mapping):
                    continue
                events.append({
                    "previous_fold_id": self._nullable_identifier(None if event.get("previous_fold_id") is None else str(event.get("previous_fold_id"))),
                    "fold_id": self._nullable_identifier(None if event.get("fold_id") is None else str(event.get("fold_id"))),
                    "boundary_utc_ms": self._nullable_utc_ms(event.get("boundary_timestamp"), "fold boundary"),
                    "next_test_start_utc_ms": self._nullable_utc_ms(event.get("next_test_start"), "next test start"),
                    "gap_bars": self._fact_int(event.get("gap_bars")),
                    "policy": self._fact_token(event.get("policy")),
                })
        segments = []
        for fold_id, start, end in folds:
            inside = [index for index, row in enumerate(observations) if start <= row["at_utc_ms"] <= end]
            if not inside:
                continue
            first, last = inside[0], inside[-1]
            bars = [json.loads(observations[index]["bar_json"]) for index in inside]
            before = observations[first - 1] if first > 0 else None

            def total(name: str) -> str | None:
                values = [bar[name] for bar in bars]
                if any(value is None for value in values):
                    return None
                return self._decimal(sum((Decimal(value) for value in values), Decimal("0")), f"fold {name}")

            segments.append({
                "fold_id": fold_id,
                "first_ordinal": first,
                "last_ordinal": last,
                "bars": len(inside),
                "start_basis": "PREVIOUS_OBSERVATION" if before is not None else "FIRST_WINDOW_OBSERVATION",
                "start_equity": (before or observations[first])["equity"],
                "end_equity": observations[last]["equity"],
                "start_position": None if before is None else before["accepted_position"],
                "end_position": observations[last]["accepted_position"],
                "transitions": sum(1 for bar in bars if bar["transition"]),
                "fee": total("fee"),
                "turnover": total("turnover"),
            })
        return {
            "schema_version": "research.current-source-replay-summary.v1",
            "account_contract": {
                "orders_published": self._fact_int(contract.get("orders_published")),
                "fills_published": self._fact_int(contract.get("fills_published")),
                "trades_published": self._fact_int(contract.get("trades_published")),
                "orders_count": self._fact_int(contract.get("orders_count")),
                "fills_count": self._fact_int(contract.get("fills_count")),
                "target_intent_kind": self._fact_token(contract.get("target_intent_kind")),
                "intrabar_exit_model": self._fact_token(contract.get("intrabar_exit_model")),
                "fill_price_policy": self._fact_token(contract.get("fill_price_policy")),
                "same_bar_policy": self._fact_token(contract.get("same_bar_policy")),
                "allow_partial_fill": self._fact_bool(contract.get("allow_partial_fill")),
                "slippage_bps": self._fact_decimal(contract.get("slippage_bps"), "slippage bps"),
                "fee_rate_oneway": self._fact_decimal(contract.get("fee_rate_oneway"), "one-way fee rate"),
                "use_funding": self._fact_bool(contract.get("use_funding")),
                "oms_mode": self._fact_token(contract.get("oms_mode")),
                "margin_mode": self._fact_token(contract.get("margin_mode")),
                "report_level": self._fact_token(contract.get("report_level")),
                "portfolio_mode": self._fact_token(contract.get("portfolio_mode")),
            },
            "fold_capital": {
                "account_execution": self._fact_token(
                    (plan or {}).get("execution_mode") or walk_forward.get("account_execution"),
                ),
                "policy": self._fact_token((plan or {}).get("policy") or walk_forward.get("fold_account_policy")),
                "boundary_position_policy": self._fact_token(walk_forward.get("fold_boundary_position_policy")),
                "boundary_events": events,
            },
            "totals": dict(totals),
            "fold_segments": segments,
            "candle_overview": self._candle_overview(observations) if has_candle else None,
        }

    def _fit_summary_budget(self, summary: dict[str, Any], observations: list[dict[str, Any]]) -> None:
        """Keep the 64-KiB seal bound without removing any source authority.

        Only the declared OHLC display sampling is coarsened, with all bars
        represented and price extrema preserved. Retained observation rows,
        analytics, selection, child audit and fold facts are never discarded.
        A summary that cannot fit even with one candle still fails closed.
        """
        def size() -> int:
            return len(self._canonical_json(summary).encode("utf-8"))

        replay = summary.get("replay")
        overview = replay.get("candle_overview") if isinstance(replay, dict) else None
        ceiling = MAXIMUM_CANDLE_OVERVIEW_BUCKETS
        while size() > 65_536 and isinstance(overview, dict) and ceiling > 1:
            ceiling = max(1, ceiling // 2)
            overview = self._candle_overview(observations, maximum_buckets=ceiling)
            replay["candle_overview"] = overview
        if size() > 65_536:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE",
                "The current-source summary exceeds the sealed local read-model budget.",
            )

    def _candle_overview(self, observations: list[dict[str, Any]], *,
                         maximum_buckets: int = MAXIMUM_CANDLE_OVERVIEW_BUCKETS) -> dict[str, Any]:
        """At most 160 OHLC buckets over the whole run, extrema kept by construction.

        A bucket's high is the maximum high and its low the minimum low of the
        bars it covers; open is the first bar's open and close the last bar's
        close. Downsampling can therefore never hide the run's price range.
        """

        count = len(observations)
        bucket_bars = max(1, math.ceil(count / maximum_buckets))
        values = []
        max_high: tuple[Decimal, int] | None = None
        min_low: tuple[Decimal, int] | None = None
        for start in range(0, count, bucket_bars):
            members = observations[start : start + bucket_bars]
            bars = [json.loads(row["bar_json"]) for row in members]
            highs = [Decimal(bar["candle"]["high"]) for bar in bars]
            lows = [Decimal(bar["candle"]["low"]) for bar in bars]
            high, low = max(highs), min(lows)
            high_at = members[highs.index(high)]["at_utc_ms"]
            low_at = members[lows.index(low)]["at_utc_ms"]
            if max_high is None or high > max_high[0]:
                max_high = (high, high_at)
            if min_low is None or low < min_low[0]:
                min_low = (low, low_at)
            volumes = [bar["candle"]["volume"] for bar in bars]
            values.append({
                "first_ordinal": start,
                "last_ordinal": start + len(members) - 1,
                "open_utc_ms": members[0]["at_utc_ms"],
                "close_utc_ms": members[-1]["at_utc_ms"],
                "open": bars[0]["candle"]["open"],
                "high": self._decimal(high, "bucket high"),
                "low": self._decimal(low, "bucket low"),
                "close": bars[-1]["candle"]["close"],
                "volume": None if any(volume is None for volume in volumes) else self._decimal(
                    sum((Decimal(volume) for volume in volumes), Decimal("0")), "bucket volume",
                ),
                "transitions": sum(1 for bar in bars if bar["transition"]),
            })
        assert max_high is not None and min_low is not None  # count >= 1
        return {
            "source_bar_count": count,
            "emitted_bucket_count": len(values),
            "bucket_bars": bucket_bars,
            "sampling": "FULL" if bucket_bars == 1 else "OHLC_BUCKET_V1",
            "envelope": {
                "max_high": self._decimal(max_high[0], "max high"),
                "max_high_at_utc_ms": max_high[1],
                "min_low": self._decimal(min_low[0], "min low"),
                "min_low_at_utc_ms": min_low[1],
            },
            "values": values,
        }

    def _fold_guards(self, record: Mapping[str, Any] | None) -> dict[str, Any] | None:
        if record is None:
            return None

        def window(name: str) -> dict[str, Any]:
            return {
                "bars": self._fact_int(record.get(f"{name}_bars")),
                "start_utc_ms": self._nullable_utc_ms(record.get(f"{name}_start"), f"{name} start"),
                "end_utc_ms": self._nullable_utc_ms(record.get(f"{name}_end"), f"{name} end"),
            }

        return {
            "warmup": window("warmup"),
            "label_horizon": window("label_horizon"),
            "purge": window("purge"),
            "embargo": window("embargo"),
            "validation": window("validation"),
            "cutoff_utc_ms": self._nullable_utc_ms(record.get("cutoff_timestamp"), "fold cutoff"),
            "account_policy": self._fact_token(record.get("account_policy")),
        }

    def _fold_score(self, row: Mapping[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        keys = (
            "is_sharpe", "oos_sharpe", "is_sharpe_raw", "oos_sharpe_raw", "decay",
            "is_trade_count", "oos_trade_count", "is_required_trades", "oos_required_trades",
            "is_trade_penalty", "oos_trade_penalty",
        )
        score = {key: self._fact_decimal(row.get(key), f"fold {key}") for key in keys}
        score["basis"] = "QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1"
        return score

    def _fold_path(self, observations: list[dict[str, Any]], *, start_ms: int | None, end_ms: int | None) -> dict[str, Any] | None:
        if start_ms is None or end_ms is None:
            return None
        before: dict[str, Any] | None = None
        inside: list[dict[str, Any]] = []
        for row in observations:
            at = row["at_utc_ms"]
            if at < start_ms:
                before = row
            elif at <= end_ms:
                inside.append(row)
            else:
                break
        if not inside:
            return None
        start_equity = Decimal(str((before or inside[0])["equity"]))
        if start_equity == 0:
            return None
        peak = start_equity
        max_drawdown = Decimal("0")
        worst = inside[0]
        for row in inside:
            equity = Decimal(str(row["equity"]))
            peak = max(peak, equity)
            if peak != 0:
                max_drawdown = min(max_drawdown, (equity / peak) - Decimal("1"))
            if Decimal(str(row["return_fraction"])) < Decimal(str(worst["return_fraction"])):
                worst = row
        end_equity = Decimal(str(inside[-1]["equity"]))
        return {
            "basis": "RETAINED_STITCHED_OBSERVATIONS_V1",
            "observation_count": len(inside),
            "start_basis": "PREVIOUS_OBSERVATION" if before is not None else "FIRST_WINDOW_OBSERVATION",
            "start_equity": self._decimal(start_equity, "fold start equity"),
            "end_equity": self._decimal(end_equity, "fold end equity"),
            "return_fraction": self._decimal((end_equity / start_equity) - Decimal("1"), "fold return"),
            "max_drawdown_fraction": self._decimal(max_drawdown, "fold max drawdown"),
            "worst_return_fraction": self._decimal(worst["return_fraction"], "fold worst return"),
            "worst_at_utc_ms": worst["at_utc_ms"],
        }

    def _objective_terms(self, config: Mapping[str, Any]) -> dict[str, Decimal] | None:
        """λ/γ of QuantBT's Mode 1 candidate objective, from the source config only."""

        calibration = config.get("calibration")
        optimization = calibration.get("optimization") if isinstance(calibration, Mapping) else None
        if not isinstance(optimization, Mapping):
            return None
        terms: dict[str, Decimal] = {}
        for name in ("decay_lambda", "decay_gamma"):
            candidate = optimization.get(f"candidate_{name}")
            value = candidate if candidate is not None else optimization.get(name)
            decimal = self._fact_decimal(value, name)
            if decimal is None:
                return None
            terms[name] = Decimal(decimal)
        return terms

    def _trial_facts(
        self,
        record: Mapping[str, Any],
        *,
        source_contract: Mapping[str, Any] | None,
        objective_terms: Mapping[str, Decimal] | None,
    ) -> dict[str, Any]:
        """Declared per-trial facts; OOS numbers only when the stage evaluated OOS.

        QuantBT's Stage-A `is_search` rows carry `mean_oos_sharpe = 0.0` and
        `mean_decay = 0.0` as placeholders (the IS search never looks at OOS),
        and `temporal_*` fall back to the IS mean when `temporal_count == 0`.
        Publishing those as numbers would turn "not evaluated" into 0, so they
        become typed absences here.
        """

        metadata = record.get("selection_metadata") if isinstance(record.get("selection_metadata"), Mapping) else {}
        stage = self._fact_token(metadata.get("stage"))
        schedule_fold = metadata.get("schedule_fold_id", record.get("schedule_fold_id"))
        study = metadata.get("study_id", record.get("study_id"))
        walk_forward = source_contract.get("walk_forward") if isinstance(source_contract, Mapping) else None
        trials_scope = walk_forward.get("optuna_trials_scope") if isinstance(walk_forward, Mapping) else None
        if schedule_fold is not None and self._fact_token(str(schedule_fold)):
            fold_scope = {"kind": "FOLD", "fold_id": str(schedule_fold), "reason_code": None}
        elif trials_scope == "global":
            fold_scope = {"kind": "ALL_OUTER_FOLDS", "fold_id": None, "reason_code": None}
        else:
            fold_scope = {"kind": "NOT_PUBLISHED", "fold_id": None, "reason_code": "QUANTBT_TRIAL_ROW_DID_NOT_PUBLISH_A_FOLD_SCOPE"}
        oos_evaluated = stage is not None and stage != "is_search"
        temporal_count = self._fact_decimal(metadata.get("temporal_count", record.get("temporal_count")), "temporal count")
        temporal_scored = temporal_count is not None and Decimal(temporal_count) > 0
        metrics = {
            "mean_is_sharpe": self._fact_decimal(record.get("mean_is_sharpe"), "mean IS Sharpe"),
            "mean_oos_sharpe": self._fact_decimal(record.get("mean_oos_sharpe"), "mean OOS Sharpe") if oos_evaluated else None,
            "mean_decay": self._fact_decimal(record.get("mean_decay"), "mean decay") if oos_evaluated else None,
            "std_decay": self._fact_decimal(record.get("std_decay"), "decay dispersion") if oos_evaluated else None,
            "oos_reason_code": None if oos_evaluated else (
                "QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS" if stage == "is_search" else "QUANTBT_TRIAL_ROW_DID_NOT_PUBLISH_ITS_STAGE"
            ),
            "temporal_score": self._fact_decimal(record.get("temporal_score"), "temporal score") if temporal_scored else None,
            "temporal_q25": self._fact_decimal(record.get("temporal_q25"), "temporal q25") if temporal_scored else None,
            "temporal_count": temporal_count,
            "temporal_reason_code": None if temporal_scored else "QUANTBT_TEMPORAL_SUBPERIODS_NOT_SCORED",
        }
        # What the row's `objective` measures. A Stage-A trial and the selected
        # candidate can share a trial id yet carry different objectives
        # (W1 receipt: trial 0 = IS mean Sharpe −1.44; selection = Mode 1 J −9.81).
        objective_kind = {
            "is_search": "IS_MEAN_SHARPE",
            "oos_candidate_selection": "MODE_1_DECAY_J",
        }.get(stage or "", "NOT_PUBLISHED")
        return {
            "schema_version": "research.current-source-trial-facts.v1",
            "stage": stage,
            "objective_kind": objective_kind,
            "fold_scope": fold_scope,
            "study_id": None if study is None else self._fact_token(str(study)),
            "source_trial_id": None if metadata.get("source_trial_id") is None else self._fact_token(str(metadata.get("source_trial_id"))),
            "pruned": self._fact_bool(record.get("pruned")),
            "oos_seen_by_optuna": self._fact_bool(metadata.get("oos_seen_by_optuna")),
            "metrics": metrics,
            "objective_components": self._objective_components(record, stage=stage, objective_terms=objective_terms),
        }

    def _objective_components(
        self,
        record: Mapping[str, Any],
        *,
        stage: str | None,
        objective_terms: Mapping[str, Decimal] | None,
    ) -> dict[str, Any]:
        """CG-P15-04 capability probe: recompose the objective from its published terms.

        The components are published only when QuantBT's documented Mode 1
        formula, fed with the numbers QuantBT itself retained, reproduces the
        retained objective. Otherwise the breakdown is a typed absence.
        """

        objective = self._fact_decimal(record.get("objective"), "objective")
        if objective is None:
            return {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_TRIAL_ROW_HAS_NO_OBJECTIVE", "formula": None, "terms": []}
        target = Decimal(objective)
        tolerance = Decimal("1e-9") * max(Decimal("1"), abs(target))
        if stage == "is_search":
            mean_is = self._fact_decimal(record.get("mean_is_sharpe"), "mean IS Sharpe")
            if mean_is is not None and abs(Decimal(mean_is) - target) <= tolerance:
                return {
                    "state": "AVAILABLE",
                    "reason_code": None,
                    "formula": "MODE_1_IS_SEARCH_OBJECTIVE_EQUALS_MEAN_IS_SHARPE",
                    "terms": [{"term": "mean_is_sharpe", "weight": "1", "value": mean_is, "contribution": mean_is}],
                }
            return {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_OBJECTIVE_DID_NOT_RECOMPOSE_FROM_PUBLISHED_TERMS", "formula": None, "terms": []}
        if stage == "oos_candidate_selection" and objective_terms is not None:
            mean_oos = self._fact_decimal(record.get("mean_oos_sharpe"), "mean OOS Sharpe")
            std_decay = self._fact_decimal(record.get("std_decay"), "decay dispersion")
            mean_decay = self._fact_decimal(record.get("mean_decay"), "mean decay")
            if mean_oos is not None and std_decay is not None and mean_decay is not None:
                decay_lambda = objective_terms["decay_lambda"]
                decay_gamma = objective_terms["decay_gamma"]
                positive_decay = max(Decimal("0"), Decimal(mean_decay))
                parts = [
                    ("mean_oos_sharpe", Decimal("1"), Decimal(mean_oos)),
                    ("std_decay", -decay_lambda, Decimal(std_decay)),
                    ("positive_mean_decay", -decay_gamma, positive_decay),
                ]
                recomposed = sum((weight * value for _, weight, value in parts), Decimal("0"))
                if abs(recomposed - target) <= tolerance:
                    return {
                        "state": "AVAILABLE",
                        "reason_code": None,
                        "formula": "MODE_1_DECAY_OOS_MEAN_MINUS_LAMBDA_STD_MINUS_GAMMA_POSITIVE_DECAY",
                        "terms": [
                            {
                                "term": name,
                                "weight": self._decimal(weight, f"{name} weight"),
                                "value": self._decimal(value, f"{name} value"),
                                "contribution": self._decimal(weight * value, f"{name} contribution"),
                            }
                            for name, weight, value in parts
                        ],
                    }
            return {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_OBJECTIVE_DID_NOT_RECOMPOSE_FROM_PUBLISHED_TERMS", "formula": None, "terms": []}
        return {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_STAGE_HAS_NO_DOCUMENTED_OBJECTIVE_FORMULA", "formula": None, "terms": []}

    def _source_facts(
        self,
        *,
        source_contract: Mapping[str, Any] | None,
        fold_metrics: Mapping[str, Any] | None,
        config: Mapping[str, Any],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: Mapping[str, Any],
    ) -> dict[str, Any] | None:
        """One bounded, versioned block of run-level QuantBT facts for the seal summary."""

        if source_contract is None:
            return None
        walk_forward = source_contract.get("walk_forward") if isinstance(source_contract.get("walk_forward"), Mapping) else {}
        account = source_contract.get("final_account") if isinstance(source_contract.get("final_account"), Mapping) else {}
        contract = account.get("execution_contract") if isinstance(account.get("execution_contract"), Mapping) else {}
        native = walk_forward.get("native_prepared_wfo") if isinstance(walk_forward.get("native_prepared_wfo"), Mapping) else {}
        inner = walk_forward.get("inner_validation")
        terms = self._objective_terms(config)

        def facts_of(row: Mapping[str, Any]) -> Mapping[str, Any]:
            payload = json.loads(row["payload_json"])
            return payload.get("trial_facts") if isinstance(payload.get("trial_facts"), Mapping) else {}

        searched = [row for row in trials if facts_of(row).get("stage") == "is_search" and row.get("objective") is not None]
        raw_best = max(searched, key=lambda row: Decimal(str(row["objective"])), default=None)
        probes = [facts_of(row).get("objective_components", {}) for row in [*trials, *candidates]]
        verified = sum(1 for probe in probes if probe.get("state") == "AVAILABLE")
        pruned = [row for row in trials if facts_of(row).get("pruned") is True]
        return {
            "schema_version": "research.current-source-facts.v1",
            "claims": {
                "validation_claim": self._fact_token(walk_forward.get("validation_claim")),
                "causality_claim": self._fact_token(walk_forward.get("causality_claim")),
                "chronological_validation_claim": self._fact_token(walk_forward.get("chronological_validation_claim")),
                "oos_used_for_selection": self._fact_bool(walk_forward.get("oos_used_for_selection")),
                "full_sample_used_for_selection": self._fact_bool(walk_forward.get("full_sample_used_for_selection")),
                "params_semantics": self._fact_token(walk_forward.get("params_semantics")),
                "causality_schedule": self._fact_token(walk_forward.get("causality_schedule_v2")),
                "signal_causality_scope": self._fact_token(walk_forward.get("signal_causality_scope")),
            },
            "temporal_guards": {
                "label_horizon_bars": self._fact_int(walk_forward.get("label_horizon_bars")),
                "purge_bars": self._fact_int(walk_forward.get("purge_bars")),
                "embargo_bars": self._fact_int(walk_forward.get("embargo_bars")),
                "warmup_policy": self._fact_token(walk_forward.get("warmup_policy")),
                "warmup_bars": self._fact_int(walk_forward.get("warmup_bars")),
                "inner_validation": None if not isinstance(inner, Mapping) else {
                    "selection_scope": self._fact_token(inner.get("selection_scope")),
                    "inner_split_frequency": self._fact_token(inner.get("inner_split_frequency")),
                    "inner_window_mode": self._fact_token(inner.get("inner_window_mode")),
                    "inner_min_folds": self._fact_int(inner.get("inner_min_folds")),
                },
                "inner_validation_published": "inner_validation" in walk_forward,
            },
            "search": {
                "optimization_mode": self._fact_token(walk_forward.get("optimization_mode")),
                "optimization_schedule": self._fact_token(walk_forward.get("optimization_schedule")),
                "n_studies": self._fact_int(walk_forward.get("n_studies")),
                "optuna_trials_scope": self._fact_token(walk_forward.get("optuna_trials_scope")),
                "optuna_trials_per_study": self._fact_int(walk_forward.get("optuna_trials_configured_per_study")),
                "trial_ledger_mode": self._fact_token(walk_forward.get("trial_ledger_mode")),
                "candidate_selection_metric": self._fact_token(walk_forward.get("candidate_selection_metric")),
                "top_is_fraction": self._fact_decimal(walk_forward.get("top_is_fraction"), "top IS fraction"),
                "top_is_k": self._fact_int(walk_forward.get("top_is_k")),
                "decay_lambda": None if terms is None else self._decimal(terms["decay_lambda"], "decay lambda"),
                "decay_gamma": None if terms is None else self._decimal(terms["decay_gamma"], "decay gamma"),
                "raw_best_is_trial_id": None if raw_best is None else raw_best["trial_id"],
                "raw_best_is_objective": None if raw_best is None else raw_best["objective"],
                "selected_trial_id": selection.get("trial_id"),
                "candidate_source_trial_ids": sorted({
                    str(facts_of(row).get("source_trial_id"))
                    for row in candidates
                    if facts_of(row).get("source_trial_id") is not None
                }),
                "pruned_trial_count": len(pruned),
                "objective_probe": {
                    "rows": len(probes),
                    "verified_rows": verified,
                },
            },
            "execution": {
                "engine_id": self._fact_token(contract.get("engine_id") or account.get("engine_id")),
                "signal_phase": self._fact_token(contract.get("signal_phase") or account.get("signal_phase")),
                "fill_phase": self._fact_token(contract.get("fill_phase") or account.get("fill_phase")),
                "accounting_certified": self._fact_bool(contract.get("accounting_certified")),
                "final_account_backend": self._fact_token(account.get("backend")),
                "final_account_runtime": self._fact_token(account.get("target_runtime")),
                "scoring_backend": self._fact_token(walk_forward.get("scoring_backend")),
                "native_prepared_wfo_policy": self._fact_token(native.get("resolved_policy")),
                "execution_clock": self._fact_token(native.get("execution_clock")),
                "account_execution": self._fact_token(walk_forward.get("account_execution")),
                "fold_account_policy": self._fact_token(walk_forward.get("fold_account_policy")),
                "fold_boundary_position_policy": self._fact_token(walk_forward.get("fold_boundary_position_policy")),
            },
            "selected_fold_metrics": {
                "state": "AVAILABLE" if fold_metrics is not None else "NOT_PUBLISHED",
                "reason_code": None if fold_metrics is not None else "QUANTBT_BEST_TRIAL_DID_NOT_RETAIN_FOLD_METRICS",
                "trial_id": None if fold_metrics is None else self._nullable_identifier(fold_metrics.get("trial_id")),
            },
        }

    @staticmethod
    def _summary(
        *,
        observations: list[dict[str, Any]],
        folds: list[dict[str, Any]],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: Mapping[str, Any],
        source_facts: Mapping[str, Any] | None = None,
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
        guards = source_facts.get("temporal_guards") if isinstance(source_facts, Mapping) else None
        claims = source_facts.get("claims") if isinstance(source_facts, Mapping) else None

        def guard_fact(value: object, reason: str) -> dict[str, Any]:
            # AVAILABLE only when QuantBT published the configured guard for
            # this run (W3); the exact value lives in `source_facts`.
            if value is not None:
                return {"state": "AVAILABLE", "reason_code": None}
            return {"state": "NOT_PUBLISHED", "reason_code": reason}

        data_use = {
            "warmup": guard_fact(
                None if not isinstance(guards, Mapping) else guards.get("warmup_policy"),
                "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_WARMUP_CONVENTION",
            ),
            "purge": guard_fact(
                None if not isinstance(guards, Mapping) else guards.get("purge_bars"),
                "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PURGE_CONVENTION",
            ),
            "embargo": guard_fact(
                None if not isinstance(guards, Mapping) else guards.get("embargo_bars"),
                "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EMBARGO_CONVENTION",
            ),
            "strict_outer_oos_selection": guard_fact(
                None if not isinstance(claims, Mapping) else claims.get("oos_used_for_selection"),
                "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_EVIDENCE",
            ),
        }
        body: dict[str, Any] = {
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
            # Source facts only when QuantBT published their exact semantics
            # (W3 `source_facts`); otherwise the typed absences stay.
            "data_use": data_use,
            "derived": CurrentSourceArtifactAdapter._derived_series(observations, folds),
            "derived_scope": "OUTER_TEST_UNION_INCLUSIVE_V1",
            "counts": {
                "folds": len(folds),
                "trials": len(trials),
                "candidates": len(candidates),
            },
        }
        if source_facts is not None:
            body["source_facts"] = dict(source_facts)
        return body

    @staticmethod
    def _derived_series(observations: list[dict[str, Any]], folds: list[dict[str, Any]]) -> dict[str, Any]:
        """Seal display-only OOS facts from the exact inclusive outer-test windows.

        The full stitched account tape stays in P05 for Replay and audit. A
        pre-OOS prefix must not be labelled as OOS distribution or rolling
        return. Each overlapping fold contributes a bar once, not twice.
        """

        windows: list[tuple[int, int]] = []
        for fold in folds:
            start, end = fold.get("test_start_utc_ms"), fold.get("test_end_utc_ms")
            if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end < start:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                    "A fold lacks a valid outer-test window for chart derivation.",
                )
            windows.append((start, end))
        # Merge overlapping inclusive folds, then walk the chronological tape
        # once. The admission ceiling is 2M bars / 256 folds; N×F scans are
        # not acceptable at source seal time.
        merged: list[tuple[int, int]] = []
        for start, end in sorted(windows):
            if merged and start <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], end))
            else:
                merged.append((start, end))
        scoped: list[dict[str, Any]] = []
        window_index = 0
        for row in observations:
            at = row["at_utc_ms"]
            while window_index < len(merged) and at > merged[window_index][1]:
                window_index += 1
            if window_index == len(merged):
                break
            if at >= merged[window_index][0]:
                scoped.append(row)
        if not scoped:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID",
                "The stitched series has no bar in the declared outer-test windows.",
            )
        equities = [Decimal(str(row["equity"])) for row in scoped]
        returns = [Decimal(str(row["return_fraction"])) for row in scoped]
        return {
            "monthly_returns": CurrentSourceArtifactAdapter._monthly_returns(scoped, equities),
            "rolling_returns_20": CurrentSourceArtifactAdapter._rolling_returns(scoped, equities),
            "return_distribution": CurrentSourceArtifactAdapter._return_distribution(returns),
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
        # QuantBT's compact ledger has no Optuna state column but does publish
        # `pruned`; a pruned row must never read as COMPLETE (W3, CG-P15-03).
        if record.get("pruned") is True:
            return "PRUNED"
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
    "SIGNAL_NOTIONAL_CURRENT_SOURCE_ADAPTER_ID",
    "SIGNAL_NOTIONAL_CURRENT_SOURCE_PROFILE_ID",
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
    "signal_notional_current_source_admission",
    "iter_current_source_retention_batches",
]
