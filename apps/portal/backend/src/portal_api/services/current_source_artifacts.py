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
from portal_api.domain.research_early_stopping import admitted_early_stopping, study_trial_count_admitted

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
import pyarrow.parquet as pq

from portal_api.services.research_child_audit_companion import (
    ChildAuditCompanionCapture, digest as child_audit_digest, source_file_digest,
)

from portal_api.adapters.quantbt import QUANTBT_ENGINE_VERSION
from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE
from portal_api.domain.research_full03_profiles import full03_recipe
from portal_api.domain.research_trial_budget import admitted_study_trials
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
CAUSAL_INNER_CURRENT_SOURCE_ADAPTER_ID: Final = "rs02.quantbt-signal-notional-causal-inner.v1"
CAUSAL_INNER_CURRENT_SOURCE_PROFILE_ID: Final = "rs02.delta-signal-notional-causal-inner.v1"
PER_FOLD_DECAY_CURRENT_SOURCE_ADAPTER_ID: Final = "full02.quantbt-signal-notional-per-fold-decay.v1"
PER_FOLD_DECAY_CURRENT_SOURCE_PROFILE_ID: Final = "full02.delta-signal-notional-per-fold-decay.v1"
THREE_WINDOW_CURRENT_SOURCE_ADAPTER_ID: Final = "full02.quantbt-signal-notional-three-window.v1"
THREE_WINDOW_CURRENT_SOURCE_PROFILE_ID: Final = "full02.delta-signal-notional-three-window.v1"
MAXIMUM_OPTUNA_TRIALS: Final = 64


def _maximum_optuna_trials() -> int:
    """64, or 400 while the research-preview long WFO flag is on (PORTAL_ENV=local).

    Candidates keep the 64 ceiling: the global schedule keeps the top 10 %.
    """

    return DELTA_WFO_PREVIEW_LONG_MAX_TRIALS if delta_wfo_preview_long_enabled() else MAXIMUM_OPTUNA_TRIALS
MAXIMUM_TABLE_BATCH_ROWS: Final = 200
FULL03_STORAGE_BATCH_ROWS: Final = 2048
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
    CAUSAL_INNER_CURRENT_SOURCE_PROFILE_ID: (CAUSAL_INNER_CURRENT_SOURCE_ADAPTER_ID, "signal_notional"),
    PER_FOLD_DECAY_CURRENT_SOURCE_PROFILE_ID: (PER_FOLD_DECAY_CURRENT_SOURCE_ADAPTER_ID, "signal_notional"),
    THREE_WINDOW_CURRENT_SOURCE_PROFILE_ID: (THREE_WINDOW_CURRENT_SOURCE_ADAPTER_ID, "signal_notional"),
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
    # New source intervals bind to an exact image-owned recipe. Old seals and
    # admission constructors retain their original defaults and byte identity.
    execution_profile_id: str | None = None
    execution_profile_digest: str | None = None
    early_stopping: int | None = None

    def recipe(self) -> Mapping[str, Any] | None:
        if self.execution_profile_id is None and self.execution_profile_digest is None:
            return None
        try:
            row = full03_recipe(self.execution_profile_id, self.execution_profile_digest)
        except (ValueError, TypeError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Current-source custody requires its exact installed recipe digest.") from exc
        if row["descriptor"]["current_source"]["profile_id"] != self.profile_id:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Current-source lane is outside the exact execution recipe.")
        return row

    @property
    def source_adapter_id(self) -> str:
        row = self.recipe()
        return row["descriptor"]["current_source"]["source_adapter_id"] if row is not None else _CURRENT_SOURCE_PROFILES[self.profile_id][0]

    def validate(self) -> None:
        admitted_early_stopping({"early_stopping":self.early_stopping, "optuna_trials":self.optuna_trials})
        row = self.recipe()
        if row is not None:
            p, budgets = row["descriptor"], row["budgets"]
            expected = {
                "engine_operation": "train_test_split" if p["protocol"] == "three_window_decay" else "walk_forward",
                "target_mode": p["execution_route"], "optimization_mode": p["optimization_mode"],
                "optimization_schedule": p["optimization_schedule"], "random_seed": p["random_seed"],
                "maximum_runtime_seconds": budgets["wall_seconds"],
                "maximum_rss_bytes": budgets["memory_bytes"], "maximum_disk_bytes": budgets["scratch_bytes"],
                "lease_seconds": 30,
            }
            try:
                admitted_study_trials(row, self.optuna_trials)
            except ValueError as exc:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Current-source trial count is outside its immutable recipe.") from exc
            if any(type(getattr(self, key)) is not type(value) or getattr(self, key) != value for key, value in expected.items()):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Current-source custody controls do not match the exact immutable recipe.")
            return
        profile = _CURRENT_SOURCE_PROFILES.get(self.profile_id)
        if profile is None:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED",
                "The current-source profile is not installed.",
            )
        expected_adapter, expected_target_mode = profile
        three = self.profile_id == THREE_WINDOW_CURRENT_SOURCE_PROFILE_ID
        if self.engine_operation != ("train_test_split" if three else CURRENT_SOURCE_ENGINE_OPERATION) or self.target_mode != expected_target_mode:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_ROUTE_REJECTED",
                f"The {expected_adapter} adapter accepts only QuantBT walk_forward with {expected_target_mode}.",
            )
        causal = self.profile_id == CAUSAL_INNER_CURRENT_SOURCE_PROFILE_ID
        expected_schedule = "per_fold_causal" if causal else "per_fold_decay" if self.profile_id == PER_FOLD_DECAY_CURRENT_SOURCE_PROFILE_ID else "global"
        if self.optimization_mode != "mode_1_decay" or self.optimization_schedule != expected_schedule:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_MODE_REJECTED",
                f"The current-source adapter accepts only mode_1_decay/{expected_schedule}; it never downgrades to a fixed smoke run.",
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
        if causal and (self.random_seed != 42 or self.optuna_trials != 3 or self.maximum_runtime_seconds != 240):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Causal inner custody requires seed 42, three trials per study and the 240-second cap.")
        if self.profile_id in {PER_FOLD_DECAY_CURRENT_SOURCE_PROFILE_ID, THREE_WINDOW_CURRENT_SOURCE_PROFILE_ID} and (self.random_seed != 42 or self.optuna_trials != 3 or self.maximum_runtime_seconds != 240):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "FULL-02 custody requires its exact seed, trial count and wall cap; preview-long never widens it.")


def recipe_current_source_admission(profile_id: str, profile_digest: str, *, optuna_trials: int | None = None) -> CurrentSourceAdmission:
    """Exact FULL-03 custody binding; never expands a historical recipe."""
    row = full03_recipe(profile_id,profile_digest)
    p, budgets = row["descriptor"], row["budgets"]
    result = CurrentSourceAdmission(
        profile_id=p["current_source"]["profile_id"],
        engine_operation="train_test_split" if p["protocol"] == "three_window_decay" else "walk_forward",
        target_mode=p["execution_route"], optimization_mode=p["optimization_mode"],
        optimization_schedule=p["optimization_schedule"], random_seed=p["random_seed"],
        optuna_trials=admitted_study_trials(row, row["public_profile"]["trial_default"] if optuna_trials is None else optuna_trials),
        maximum_runtime_seconds=budgets["wall_seconds"], maximum_rss_bytes=budgets["memory_bytes"],
        maximum_disk_bytes=budgets["scratch_bytes"], lease_seconds=30,
        execution_profile_id=profile_id, execution_profile_digest=profile_digest,
    )
    result.validate()
    return result


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
    # Independent private custody; never changes the five-table P05 manifest.
    child_audit_companion: ChildAuditCompanionCapture | None = None


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


def causal_inner_current_source_admission() -> CurrentSourceAdmission:
    """Exact new profile; preview-long never widens the per-study budget."""
    return CurrentSourceAdmission(
        profile_id=CAUSAL_INNER_CURRENT_SOURCE_PROFILE_ID,
        engine_operation=CURRENT_SOURCE_ENGINE_OPERATION, target_mode="signal_notional",
        optimization_mode="mode_1_decay", optimization_schedule="per_fold_causal",
        random_seed=42, optuna_trials=3, maximum_runtime_seconds=240,
        maximum_rss_bytes=2 * 1024 * 1024 * 1024,
        maximum_disk_bytes=4 * 1024 * 1024 * 1024, lease_seconds=90,
    )


def full02_current_source_admission(*, three_window: bool = False) -> CurrentSourceAdmission:
    return CurrentSourceAdmission(profile_id=THREE_WINDOW_CURRENT_SOURCE_PROFILE_ID if three_window else PER_FOLD_DECAY_CURRENT_SOURCE_PROFILE_ID,
        engine_operation="train_test_split" if three_window else "walk_forward", target_mode="signal_notional",
        optimization_mode="mode_1_decay", optimization_schedule="global" if three_window else "per_fold_decay",
        random_seed=42, optuna_trials=3, maximum_runtime_seconds=240,
        maximum_rss_bytes=2 * 1024 ** 3, maximum_disk_bytes=4 * 1024 ** 3, lease_seconds=90)


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
        causal_selection = _retained_facts(row, "causal_selection")
        if causal_selection is not None:
            payload["causal_selection"] = causal_selection
        fold_selection = _retained_facts(row, "fold_selection")
        if fold_selection is not None:
            payload["fold_selection"] = fold_selection
        mode4_selection = _retained_facts(row, "mode4_selection")
        if mode4_selection is not None:
            payload["mode4_selection"] = mode4_selection
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
        selection_record = _json_object(row.get("payload_json"), "selection payload")
        if "scope" in selection_record:
            payload.update({key: selection_record[key] for key in ("scope", "fold_id")})
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
        source_windows: dict[str, Any] | None = None,
    ) -> CurrentSourceArtifactExport:
        """Seal actual, already-computed WFO output once under an active lease.

        `fence_validator` is intentionally injected by the durable parent. It
        is never derived from a path, a browser value or artifact metadata.
        """

        admission.validate()
        recipe = admission.recipe()
        causal = admission.optimization_schedule == "per_fold_causal"
        # Native optimizer custody follows the exact mode, not the strategy's
        # source family. FULL05 imported recipes run these same QuantBT modes;
        # omitting their disclosure loses centroid/IS-only/full-sample truth.
        full04 = recipe is not None and admission.optimization_mode != "mode_1_decay"
        mode4_causal = full04 and causal and admission.optimization_mode == "mode_4_is_only_robust"
        nested_causal = causal and not mode4_causal
        per_fold_decay = admission.optimization_schedule == "per_fold_decay"
        three_window = admission.engine_operation == "train_test_split"
        source_adapter_id = admission.source_adapter_id
        if identity.run_id != run_id or fence.run_id != run_id:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_FENCE_REJECTED",
                "The source run and P05 identity/fence scopes must match.",
            )
        raw_dir = self._source_artifacts.run_directory(run_id)
        manifest = self._read_json(raw_dir / "manifest.json", "manifest")
        self._require_current_advanced_wfo(manifest, three_window=three_window)
        if recipe is not None:
            expected_timeframe = recipe["descriptor"]["timeframe"]
            aliases = {"1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min", "1d": "1D"}
            if manifest.get("timeframe") not in {expected_timeframe, aliases.get(expected_timeframe, expected_timeframe)}:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_PROFILE_REJECTED", "Native source interval differs from the exact admission recipe.")
        config = self._read_json(raw_dir / "config.json", "config")
        self._assert_admission_matches_source(config, admission)
        strategy = self._read_json(raw_dir / "strategy.json", "strategy")
        metrics = self._read_json(raw_dir / "metrics.json", "metrics")
        selection = self._read_json(raw_dir / "selection" / "selected_params.json", "selection")

        observations = self._observation_rows(raw_dir / "series" / "stitched.parquet")
        if recipe is not None and len(observations) > recipe["budgets"]["planning_max_bars"]:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED", "Native current-source observations exceed the exact recipe's bar budget.")
        # W3: optional QuantBT fact documents written by the runner since
        # CG-P13-07/08. An older source tree simply lacks them; every fact
        # derived from them then stays a typed absence downstream.
        source_contract = self._optional_json(raw_dir / "wfo" / "source_contract.v1.json", "source contract")
        mode_evidence = self._read_mode_evidence(raw_dir / "wfo" / "mode_evidence.v1.json") if full04 else None
        mode_tables = self._mode_audit_tables(raw_dir, mode_evidence, recipe) if full04 else {}
        if three_window and (not isinstance(source_contract, Mapping) or source_contract.get("engine_operation") != "train_test_split"):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Three Window source must name its actual train_test_split operation.")
        if per_fold_decay:
            wf = source_contract.get("walk_forward") if isinstance(source_contract, Mapping) else None
            if (not isinstance(wf, Mapping) or wf.get("optimization_schedule") != "per_fold_decay"
                    or wf.get("optimization_mode") != "mode_1_decay" or wf.get("oos_used_for_selection") is not True
                    or wf.get("causality_claim") != "fold_local_decay_calibration"):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_FOLD_SELECTION_REJECTED", "Per-fold decay must publish its native outer-OOS selection-input semantics.")
        if nested_causal:
            source_wfo = source_contract.get("walk_forward") if isinstance(source_contract, Mapping) else None
            if (not isinstance(source_wfo, Mapping) or source_wfo.get("optimization_mode") != "mode_1_decay"
                    or source_wfo.get("optimization_schedule") != "per_fold_causal"
                    or source_wfo.get("causality_claim") != "strict_nested_fold_local_retraining"
                    or source_wfo.get("oos_used_for_selection") is not False
                    or source_wfo.get("full_sample_used_for_selection") is not False):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CAUSAL_BINDING_REJECTED", "Causal source must publish its exact native nested-selection contract.")
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
            fold_metrics=None if causal else fold_metrics,
            observations=observations,
        )
        trials = self._frame_rows(raw_dir / "wfo" / "trials.parquet", kind="trials", source_contract=source_contract, causal=causal or per_fold_decay,
            full04_mode=admission.optimization_mode if full04 else None)
        candidates = self._frame_rows(
            raw_dir / "wfo" / "candidates.parquet",
            kind="candidates",
            source_contract=source_contract,
            objective_terms=self._objective_terms(config),
            causal=causal or per_fold_decay,
            full04_mode=admission.optimization_mode if full04 else None,
        )
        from portal_api.services.research_sampler_trace import SAMPLER_TRACE_PATH, retain_sampler_trace
        try:
            sampler_trace = retain_sampler_trace(raw_dir / SAMPLER_TRACE_PATH, run_id=run_id, trial_count=len(trials))
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_SAMPLER_TRACE_INVALID", "Sampler source trace is incompatible with this run's retained source.") from exc
        if nested_causal:
            selection = self._attach_causal_selections(raw_dir, folds=folds, trials=trials, candidates=candidates, config=config, selection=selection,
                constraints=recipe["descriptor"]["inner_constraints"] if recipe is not None else None,
                configured_trials=admission.optuna_trials, patience=admission.early_stopping)
        if mode4_causal:
            selection = self._attach_mode4_selections(raw_dir, folds=folds, trials=trials, candidates=candidates,
                selection=selection, recipe=recipe, configured_trials=admission.optuna_trials, patience=admission.early_stopping)
        if per_fold_decay:
            selection = self._attach_per_fold_decay_selections(raw_dir, folds=folds, trials=trials, candidates=candidates,
                selection=selection, configured_trials=admission.optuna_trials, patience=admission.early_stopping)
        selection_rows = [self._selection_row(selection)]
        execution_observation = self._execution_observation(manifest, folds, selection)
        # W5b (P17): the final account's per-bar ledger and its counted
        # order/fill/trade facts. Optional, so an older source tree keeps its
        # v1 observation schema, its digest and its summary exactly.
        account_ledger = self._optional_frame(raw_dir / "series" / "account_ledger.v1.parquet", "account ledger")
        account_contract = self._optional_json(raw_dir / "wfo" / "account_contract.v1.json", "account contract")
        replay_summary = None
        lifecycle_path = raw_dir / "wfo" / "strategy_lifecycle.v1.parquet"
        try:
            lifecycle_digest = source_file_digest(lifecycle_path) if lifecycle_path.exists() else None
        except (OSError, ValueError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CHILD_AUDIT_INVALID", "Lifecycle source exceeds companion custody bounds.") from exc
        lifecycle = self._optional_frame(lifecycle_path, "strategy lifecycle")
        lifecycle_contract = self._optional_json(raw_dir / "wfo" / "strategy_lifecycle_contract.v1.json", "strategy lifecycle contract")
        child_audit_summary = None
        if lifecycle is not None:
            child_audit_summary = self._attach_child_audit(folds, lifecycle=lifecycle, contract=lifecycle_contract)
        percent_recipe = recipe is not None and recipe["descriptor"].get("execution_route") == "pct_equity"
        if account_ledger is not None or (percent_recipe and account_contract is not None):
            stitched = self._read_frame(raw_dir / "series" / "stitched.parquet", "stitched series")
            # The legacy percent-equity engine publishes the final equity /
            # position / price replay, but no fee/turnover/funding series.
            # Retain those real bars with null cost facts; an empty in-memory
            # frame is not a fabricated or sealed accounting-ledger artifact.
            replay_summary = self._attach_bar_ledger(
                observations,
                stitched=stitched,
                ledger=account_ledger if account_ledger is not None else pd.DataFrame(index=stitched.index),
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
            three_window=three_window,
            recipe=recipe,
            patience=admission.early_stopping,
        )
        window_replay = self._three_window_replay_rows(raw_dir,
            maximum_rows=recipe["budgets"]["planning_max_bars"] if recipe is not None else 92 * 24) if three_window else None

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
                    ("account_contract", account_contract if replay_summary is not None else None),
                    ("strategy_lifecycle_contract", lifecycle_contract if child_audit_summary is not None else None),
                    ("execution_observation", execution_observation),
                    ("sampler_public_trace", None if sampler_trace is None else sampler_trace[0]),
                    ("three_window_replay", window_replay),
                    ("mode_evidence", mode_evidence),
                )
                if value is not None
            },
        )
        # pct_equity can publish actual market/position bars without an optional
        # accounting ledger. Arrow drops extra dict keys silently: selecting the
        # old schema here discarded every attached candle/transition while the
        # summary still advertised them. Schema follows persisted row facts.
        registry = current_source_schema_registry(bar_ledger=replay_summary is not None)
        from portal_api.services.research_window_execution import (
            capture_current_windows, ROW_SCHEMA as window_schema, TABLE as window_table, TABLE_VERSION as window_version,
        )
        window_source = None
        window_records = []
        if recipe is not None:
            window_source, window_records = capture_current_windows(
                observations=observations, folds=folds, windows=source_windows or {}, three_rows=window_replay,
                raw_dir=raw_dir, route=recipe["descriptor"]["execution_route"],
                bar_ms=recipe["descriptor"]["source_clock"]["bar_interval_ms"],
                full_sample=full04 and admission.optimization_mode == "mode_5_full_robust",
            )
            registry.register(ArtifactTableSchema(table_kind=window_table, schema_version=window_version,
                arrow_schema=window_schema, sequence_column="source_ordinal", id_column="source_ordinal"))
        for name, (path, schema) in mode_tables.items():
            if schema.names:
                registry.register(ArtifactTableSchema(table_kind=f"mode_audit_{name}",
                    schema_version=f"research.current-source-mode-audit-{name}.v1", arrow_schema=schema))
        if window_replay is not None:
            base = current_source_schema_registry().require("observations").arrow_schema
            registry.register(ArtifactTableSchema(table_kind="three_window_replay",
                schema_version="research.three-window-replay.v1",
                arrow_schema=pa.schema([*base, pa.field("window_role", pa.string(), nullable=False),
                    pa.field("window_source_ordinal", pa.int64(), nullable=False),
                    pa.field("window_source_id", pa.string(), nullable=False)]),
                sequence_column="source_ordinal", id_column="window_source_id"))
        summary = self._summary(
            observations=observations,
            folds=folds,
            trials=trials,
            candidates=candidates,
            selection=selection_rows[0],
            source_facts=self._source_facts(
                source_contract=source_contract,
                fold_metrics=None if causal else fold_metrics,
                config=config,
                trials=trials,
                candidates=candidates,
                selection=selection_rows[0],
                folds=folds if nested_causal else None,
            ),
        )
        if sampler_trace is not None and isinstance(summary.get("source_facts"), dict):
            summary["source_facts"]["search"]["sampler_trace"] = sampler_trace[1]
        if per_fold_decay and isinstance(summary.get("source_facts"), dict):
            # No run-global raw winner exists across independent outer studies.
            summary["source_facts"]["search"]["raw_best_is_trial_id"] = None
            summary["source_facts"]["search"]["raw_best_is_objective"] = None
            summary["source_facts"]["search"]["candidate_source_trial_ids"] = sorted(row["candidate_id"] for row in candidates)
        if mode4_causal and isinstance(summary.get("source_facts"), dict):
            summary["source_facts"]["search"]["raw_best_is_trial_id"] = None
            summary["source_facts"]["search"]["raw_best_is_objective"] = None
            summary["source_facts"]["search"]["candidate_source_trial_ids"] = sorted(row["candidate_id"] for row in candidates)
        if full04:
            summary["optimizer_disclosure"] = self._optimizer_disclosure(mode_evidence, source_contract=source_contract,
                config=config, selection=selection_rows[0], folds=folds, trials=trials, candidates=candidates, admission=admission)
            if admission.optimization_mode == "mode_5_full_robust":
                summary["derived_scope"] = "FULL_SAMPLE_CALIBRATION_INCLUSIVE_V1"
            if isinstance(summary.get("source_facts"), dict):
                # Mode1's top-IS/decay controls are not another optimizer's
                # population/ranking contract, even when constructor defaults
                # happen to carry the same values.
                search = summary["source_facts"]["search"]
                for key in ("top_is_fraction", "top_is_k", "decay_lambda", "decay_gamma",
                            "raw_best_is_trial_id", "raw_best_is_objective"):
                    search[key] = None
        if three_window:
            summary["protocol_disclosure"] = self._three_window_disclosure(raw_dir, config=config, selection=selection,
                                                                         exact_display_sampling=recipe is not None)
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
            "scope": "OOS_CALIBRATION_REPLAY_SERIES" if three_window else "FULL_STITCHED_SOURCE_SERIES",
        }
        if execution_observation is not None:
            summary["execution_observation"] = execution_observation
        if replay_summary is not None:
            summary["replay"] = replay_summary
            if child_audit_summary is not None:
                summary["replay"]["child_audit"] = child_audit_summary
        if summary_analytics is not None:
            summary["summary_analytics"] = summary_analytics
        if summary_analytics_v2 is not None:
            summary["summary_analytics_v2"] = summary_analytics_v2
        from portal_api.services.research_enrich_analysis import enrich_retained
        summary["enriched_analysis"] = enrich_retained(run_id=identity.run_id, observations=observations, folds=folds,
            source_windows=source_windows)
        if full04 and admission.optimization_mode == "mode_5_full_robust":
            # Values and original source documents stay intact. Only this
            # new mode's retained reader projection receives its actual
            # full-sample role, never an untouched-OOS label inherited from
            # the generic WFO analytics adapters.
            for name in ("summary_analytics", "summary_analytics_v2", "enriched_analysis"):
                if name in summary:
                    summary[name] = self._full_sample_projection(summary[name])
            if "execution_observation" in summary:
                summary["execution_observation"] = {**summary["execution_observation"],
                    "evaluation_role": "FULL_SAMPLE_CALIBRATION"}
            enriched = summary["enriched_analysis"]
            enriched["windows"]["oos"] = {"state": "NOT_APPLICABLE",
                "reason_code": "FULL_SAMPLE_CALIBRATION_HAS_NO_UNTOUCHED_OOS"}
            enriched["windows"]["full_sample"] = {"state": "AVAILABLE", "reason_code": None,
                "start_ms": enriched["scope"]["first_at_utc_ms"],
                "end_ms": enriched["scope"]["last_at_utc_ms"] + recipe["descriptor"]["source_clock"]["bar_interval_ms"],
                "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE",
                "source_locator": "P05.native_full_sample_fold.train_start..test_end"}
        self._reference_candidate_population(summary, candidates)
        self._fit_summary_budget(summary, observations, exact_display_sampling=recipe is not None)
        writer = self._retained_artifacts.begin_write(
            identity=identity,
            fence=fence,
            schema_registry=registry,
            fence_validator=fence_validator,
        )
        try:
            # Keep FULL03's <=100k indexed bars within the existing 128-part
            # manifest envelope. Storage batching is distinct from the
            # unchanged 200-row / 1-MiB private import/page boundary. Historical
            # profiles retain their original part layout and custody bytes.
            self._write_rows(writer, registry, "observations", observations,
                             maximum_batch_rows=FULL03_STORAGE_BATCH_ROWS if recipe is not None else MAXIMUM_TABLE_BATCH_ROWS)
            self._write_rows(writer, registry, "folds", folds)
            self._write_rows(writer, registry, "trials", trials)
            self._write_rows(writer, registry, "candidates", candidates)
            self._write_rows(writer, registry, "selection", selection_rows)
            if window_source is not None:
                from portal_api.services.research_window_execution import storage_batch
                # Storage parts are independently bounded; public transport is
                # still <=200 rows/1 MiB, not the Parquet row-group size.
                for start in range(0, len(window_records), 8192):
                    writer.append_batch(window_table, storage_batch(window_records[start:start + 8192]))
                writer.write_small_document("window_execution_source", window_source)
            for name, (path, schema) in mode_tables.items():
                if not schema.names:
                    continue  # exact native empty relation is declared in the bound source document
                table = pq.read_table(path)
                if source_file_digest(path) != mode_evidence["source_tables"][name]["sha256"]:
                    raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode audit source changed during P05 custody transfer.")
                batches = table.to_batches(max_chunksize=MAXIMUM_TABLE_BATCH_ROWS)
                if not batches:
                    batches = [pa.RecordBatch.from_pylist([], schema=schema)]
                for batch in batches:
                    writer.append_batch(f"mode_audit_{name}", batch)
            if window_replay is not None:
                self._write_rows(writer, registry, "three_window_replay", window_replay,
                                 maximum_batch_rows=FULL03_STORAGE_BATCH_ROWS if recipe is not None else MAXIMUM_TABLE_BATCH_ROWS)
            writer.write_small_document("source_manifest", self._document(manifest))
            writer.write_small_document("source_config", self._document(config))
            writer.write_small_document("source_strategy", self._document(strategy))
            writer.write_small_document("source_metrics", self._document(metrics))
            writer.write_small_document("source_coverage", {
                "schema_version": "research.current-source-coverage.v1",
                "source_adapter_id": source_adapter_id,
                "profile_id": admission.profile_id,
                "source_transform_digest": source_transform_digest,
                "available": ["observations", "returns", "positions", "folds", "trials", "candidates", "selection", *(["three_window_replay"] if three_window else [])],
                "unavailable": {
                    "route_ledger": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "audited_fills": "SOURCE_UNSUPPORTED_CONFIRMED",
                    "benchmark": "SOURCE_UNSUPPORTED_CONFIRMED",
                },
            })
            if source_contract is not None:
                writer.write_small_document("source_contract", self._document(source_contract))
            if mode_evidence is not None:
                writer.write_small_document("source_mode_evidence", self._document(mode_evidence))
            if three_window:
                writer.write_small_document("source_three_window_roles", self._document(self._read_json(raw_dir / "wfo" / "three_window_roles.v1.json", "Three Window roles")))
            if sampler_trace is not None:
                writer.write_small_document("source_sampler_public_trace", self._document(sampler_trace[0]))
            if fold_metrics is not None:
                writer.write_small_document("source_selected_fold_metrics", self._document(fold_metrics))
            if summary_analytics is not None:
                writer.write_small_document("source_retained_analytics", self._document(summary_analytics))
            if summary_analytics_v2 is not None:
                writer.write_small_document("source_retained_analytics_v2", self._document(summary_analytics_v2))
            if replay_summary is not None and account_contract is not None:
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
        companion = None
        if lifecycle is not None:
            # Exact raw-file binding is checked again after normalization. No
            # full audit rows enter the terminal receipt or original P05 seal.
            rows = []
            for ordinal, (_, raw) in enumerate(lifecycle.iterrows()):
                record = {str(column): self._json_value(value) for column, value in raw.to_dict().items()}
                fold_id = None if record.get("fold_id") is None else str(record["fold_id"])
                rows.append({**self._child_audit_record(ordinal, record, fold_id),
                    "run_fingerprint": self._fact_token(record.get("run_id"))})
            try:
                if source_file_digest(lifecycle_path) != lifecycle_digest:
                    raise ValueError("CHILD_AUDIT_SOURCE_CHANGED")
                companion = ChildAuditCompanionCapture(tuple(rows), lifecycle_digest,
                    child_audit_digest(lifecycle_contract), self._fact_int((lifecycle_contract or {}).get("records_dropped")),
                    self._fact_token((lifecycle_contract or {}).get("policy")))
            except (OSError, ValueError) as exc:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CHILD_AUDIT_INVALID", "Lifecycle source changed or exceeds custody bounds.") from exc
        return CurrentSourceArtifactExport(candidate=candidate, receipt=receipt, child_audit_companion=companion)

    def _child_audit_record(self, ordinal: int, record: Mapping[str, Any], fold_id: str | None) -> dict[str, Any]:
        """Same normalization for full custody and the unchanged legacy witness."""
        context = record.get("context")
        return {"audit_ordinal": ordinal, "candidate_id": self._fact_token(record.get("candidate_id")),
            "fold_id": fold_id, "seed": self._fact_int(record.get("seed")),
            "context": context if isinstance(context, str) and 0 < len(context) <= 96 else None,
            **{key: self._fact_token(record.get(key)) for key in ("lifecycle_kind", "policy", "state_before", "strategy_fingerprint", "market_fingerprint")},
            **{key: self._fact_bool(record.get(key)) for key in ("certified_isolation", "spawned", "reset_called", "warmup_called", "closed")},
            "warmup_bars": self._fact_int(record.get("warmup_bars")),
            **{key + "_utc_ms": self._nullable_utc_ms(record.get(key), "lifecycle " + key.replace("_", " "))
                for key in ("cutoff", "train_start", "train_end", "test_start", "test_end")}}

    def _require_current_advanced_wfo(self, manifest: Mapping[str, Any], *, three_window: bool = False) -> None:
        if manifest.get("quantbt_version") != QUANTBT_ENGINE_VERSION:
            raise CurrentSourceArtifactError(
                "NOT_RETAINED_LEGACY",
                "Only a current QuantBT 1.1.1 artifact may enter the RS-02 current-source lane.",
            )
        if manifest.get("protocol") != ("three_window_decay" if three_window else "advanced_walk_forward"):
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
        if calibration.get("optuna_early_stopping") != admission.early_stopping:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CONFIG_REJECTED", "The completed source early stopping differs from its immutable request.")
        recipe = admission.recipe()
        if recipe is not None and admission.optimization_mode != "mode_1_decay":
            settings = recipe["descriptor"]["optimizer_settings"]
            native_settings = calibration.get("optimization")
            if not isinstance(native_settings, Mapping) or any(native_settings.get(key) != value for key, value in settings.items()):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CONFIG_REJECTED", "Native mode settings differ from the exact immutable optimizer recipe.")

    @staticmethod
    def _full_sample_projection(value: Any) -> Any:
        """Role-only FULL-04 transformation; no metric/series recomputation."""
        if isinstance(value, Mapping):
            return {key: CurrentSourceArtifactAdapter._full_sample_projection(item) for key, item in value.items()}
        if isinstance(value, list):
            return [CurrentSourceArtifactAdapter._full_sample_projection(item) for item in value]
        if not isinstance(value, str):
            return value
        exact = {
            "OOS": "FULL_SAMPLE",
            "FULL_RETAINED_OOS": "FULL_RETAINED_FULL_SAMPLE",
            "RETAINED_OOS_OBSERVATIONS": "RETAINED_FULL_SAMPLE_OBSERVATIONS",
            "FIRST_LAST_RETAINED_OOS_EQUITY_V1": "FIRST_LAST_RETAINED_FULL_SAMPLE_EQUITY_V1",
            "OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1": "FULL_SAMPLE_MONTH_CLOSE_OVER_FIRST_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1",
            "FIRST_OOS_CLOSE": "FIRST_FULL_SAMPLE_CLOSE",
        }
        if value in exact:
            return exact[value]
        # These are Portal-derived source locators/reasons, not native engine
        # claim strings. Explicit test scope means the native full-span fold.
        return value.replace("scope='oos',source_fold_table", "scope='test',full_sample_source_fold_table").replace(
            "_OOS_", "_FULL_SAMPLE_").replace(":OOS", ":FULL_SAMPLE").replace("IS_minus_OOS", "IS_minus_FULL_SAMPLE")

    @staticmethod
    def _read_mode_evidence(path: Path) -> dict[str, Any]:
        try:
            if path.is_symlink() or not path.is_file() or path.stat().st_size > 256 * 1024:
                raise ValueError("unbounded native mode document")
        except (OSError, ValueError) as exc:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode evidence must be a bounded regular source document.") from exc
        return CurrentSourceArtifactAdapter._read_json(path, "native mode evidence")

    @staticmethod
    def _mode_audit_tables(raw_dir: Path, evidence: Mapping[str, Any], recipe: Mapping[str, Any]) -> dict[str, tuple[Path, pa.Schema]]:
        """Authenticate five named native tables before any P05 write.

        Table values remain private columnar custody. Neither a public JSON
        blob nor a browser-time engine/audit call is an acceptable substitute.
        """
        tables = evidence.get("source_tables")
        names = {"trials", "analysis", "evaluations", "selection", "objective_components"}
        if (not isinstance(tables, Mapping) or set(tables) != names
                or evidence.get("bounds") != {"table_rows": 4096, "total_rows": 8192, "bytes": 256 * 1024}):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode evidence must name its five bounded source audit tables.")
        result, total_rows, total_bytes = {}, 0, 0
        for name in sorted(names):
            declaration = tables[name]
            relative = f"wfo/mode_audit_{name}.v1.parquet"
            if (not isinstance(declaration, Mapping) or set(declaration) != {"path", "rows", "sha256"}
                    or declaration.get("path") != relative or type(declaration.get("rows")) is not int
                    or not 0 <= declaration["rows"] <= 4096
                    or not isinstance(declaration.get("sha256"), str) or not _SHA256.fullmatch(declaration["sha256"])):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode audit table identity/count/hash is outside its exact custody schema.")
            path = raw_dir / relative
            try:
                if path.is_symlink() or not path.is_file() or path.stat().st_size > recipe["budgets"]["file_bytes"]:
                    raise ValueError("native table is not a bounded regular file")
                total_bytes += path.stat().st_size
                if source_file_digest(path) != declaration["sha256"]:
                    raise ValueError("native audit source bytes changed")
                metadata = pq.read_metadata(path)
                schema = pq.read_schema(path)
                if metadata.num_rows != declaration["rows"] or len(schema.names) > 128:
                    raise ValueError("native audit cardinality differs")
                if name == "selection":
                    selected = pq.read_table(path).to_pylist()
                    best = evidence.get("best_trial")
                    if len(selected) != 1 or not isinstance(best, Mapping):
                        raise ValueError("native audit has no single final selection")
                    native = selected[0]
                    native_params = _json_object(native.get("selected_params"), "native audit selected parameters")
                    native_metadata = _json_object(native.get("selection_metadata"), "native audit selected metadata")
                    if (native.get("selected_trial_id") != best.get("trial_id")
                            or CurrentSourceArtifactAdapter._decimal(native.get("selected_objective"), "native audit objective") != CurrentSourceArtifactAdapter._decimal(best.get("objective"), "native selected objective")
                            or _decimal_object(native_params, "native audit parameters") != _decimal_object(best.get("params"), "native selected parameters")
                            or native_metadata != best.get("selection_metadata")):
                        raise ValueError("native audit selection differs from the compact mode target")
            except (OSError, ValueError, KeyError, TypeError, pa.ArrowException, CurrentSourceArtifactError) as exc:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode audit bytes do not match their pinned source evidence.") from exc
            total_rows += metadata.num_rows
            if total_rows > 8192 or total_bytes > recipe["budgets"]["scratch_bytes"]:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode audit exceeds its total row/byte budget.")
            result[name] = (path, schema)
        if evidence.get("row_counts") != {name: tables[name]["rows"] for name in names}:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode audit count witnesses disagree.")
        return result

    def _optimizer_disclosure(
        self, evidence: Mapping[str, Any], *, source_contract: Mapping[str, Any], config: Mapping[str, Any],
        selection: Mapping[str, Any], folds: list[dict[str, Any]], trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]], admission: CurrentSourceAdmission,
    ) -> dict[str, Any]:
        """A closed, small projection of authentic native mode evidence.

        Every objective/selector fact retains its published value. In
        particular a bootstrap proxy is not realized OOS, a centroid is not
        an Optuna trial, and a full-sample fold is not untouched validation.
        """
        def refuse() -> None:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED", "Native mode selection, methodology and source claims do not bind to the exact optimizer recipe.")

        mode, schedule = admission.optimization_mode, admission.optimization_schedule
        wf = source_contract.get("walk_forward") if isinstance(source_contract, Mapping) else None
        best, target = evidence.get("best_trial"), evidence.get("selection_target")
        retained = _json_object(selection["payload_json"], "mode selection payload")
        if (evidence.get("schema_version") != "portal.wfo-mode-evidence.v1"
                or evidence.get("optimization_mode") != mode or evidence.get("optimization_schedule") != schedule
                or not isinstance(wf, Mapping) or wf.get("optimization_mode") != mode or wf.get("optimization_schedule") != schedule
                or wf.get("oos_used_for_selection") is not (mode == "mode_3_flat_minima")
                or wf.get("full_sample_used_for_selection") is not (mode == "mode_5_full_robust")
                or not isinstance(best, Mapping) or not isinstance(target, Mapping)
                or target != retained.get("selection_target")
                or _decimal_object(best.get("params"), "native mode parameters") != _decimal_object(retained.get("params"), "mode selected parameters")
                or self._nullable_decimal(best.get("objective"), "native mode objective") != selection["objective"]):
            refuse()
        metadata = best.get("selection_metadata")
        metadata = metadata if isinstance(metadata, Mapping) else {}
        native_id = best.get("trial_id")
        synthetic = target.get("kind") == "SYNTHETIC_CENTROID"
        if (type(native_id) is not int or native_id < -1 or target.get("native_trial_id") != native_id
                or target.get("params") != best.get("params") or target.get("selection_metadata") != metadata
                or synthetic != (native_id == -1)
                or target.get("kind") not in {"SYNTHETIC_CENTROID", "OPTUNA_TRIAL"}
                or target.get("source_trial_id") != (None if synthetic else native_id)):
            refuse()
        if synthetic:
            if mode != "mode_3_flat_minima" or metadata.get("selector") != "centroid" or selection["trial_id"] is not None or metadata.get("requires_evaluation") is not True:
                refuse()
        elif schedule == "global" and selection["trial_id"] != str(native_id):
            refuse()
        if schedule == "per_fold_causal":
            if mode != "mode_4_is_only_robust" or wf.get("causality_claim") != "strict_fold_local_retraining":
                refuse()
            last = json.loads(folds[-1]["payload_json"])["mode4_selection"]
            if last["source_trial_id"] != str(native_id) or last["selected_trial_id"] != selection["trial_id"]:
                refuse()
        elif wf.get("causality_claim") != "retrospective_global_calibration":
            refuse()
        locator = "wfo.mode_evidence.v1:best_trial.selection_metadata"
        settings = config["calibration"]["optimization"]
        selector_metadata = metadata
        if mode == "mode_3_flat_minima" and metadata.get("cluster_size") is None:
            plateau = [json.loads(row["payload_json"]).get("selection_metadata", {}) for row in candidates]
            plateau = [row for row in plateau if row.get("selector") == "centroid" and row.get("cluster_size") is not None]
            if len(plateau) == 1:
                selector_metadata = plateau[0]
                locator = "wfo.candidates.parquet:selection_metadata.centroid"
        scalar = lambda key: self._fact_decimal(selector_metadata.get(key), key)
        token = lambda key: self._fact_token(selector_metadata.get(key))
        if mode == "mode_3_flat_minima":
            native = {"kind": "PLATEAU", "selector": token("selector"), "cluster_method": token("cluster_method"),
                "cluster_size": self._fact_int(selector_metadata.get("cluster_size")), "top_trials": self._fact_int(selector_metadata.get("top_trials")),
                "medoid_trial_id": self._nullable_identifier(selector_metadata.get("medoid_trial_id")),
                "cluster_mean_objective": scalar("cluster_mean_objective"), "cluster_best_objective": scalar("cluster_best_objective")}
            score, score_kind = selection["objective"], self._full04_objective_kind(best, mode)
        elif mode == "mode_2_sbb":
            if wf.get("scoring_backend") != "proxy" or settings.get("scoring_backend") != "proxy":
                refuse()
            sampled = [json.loads(row["payload_json"]) for row in trials if row["trial_id"] == str(native_id)]
            if len(sampled) != 1:
                refuse()
            native = {"kind": "BOOTSTRAP_PROXY", "scoring_backend": "proxy", "sbb_samples": settings["sbb_samples"],
                "sbb_block_length": settings["sbb_block_length"], "sbb_simulation": settings["sbb_simulation"],
                "synthetic_oos_mean": self._fact_decimal(sampled[0].get("mean_oos_sharpe"), "synthetic OOS mean"),
                # Fold-level standard deviations are retained in native audit.
                # They are not a source-published run-level std statistic.
                "synthetic_oos_std": self._fact_decimal(sampled[0].get("synthetic_oos_std"), "synthetic OOS std")}
            locator = "wfo.trials.parquet:selection_metadata.mode_2_sbb"
            if settings.get("candidate_selection_metric") != "mean_is_sharpe" or metadata.get("selected_by") != "mean_is_sharpe":
                refuse()
            score, score_kind = self._fact_decimal(best.get("mean_is_sharpe"), "IS selection mean"), "IS_MEAN_SHARPE"
        else:
            native = {"kind": "IS_ONLY_DISPERSION" if mode == "mode_4_is_only_robust" else "FULL_SAMPLE_ROBUST",
                "selector": token("selector"), "is_subperiods": settings["is_subperiods"],
                "temporal_score": scalar("temporal_score"), "temporal_q25": scalar("temporal_q25"),
                "temporal_mad": scalar("temporal_mad"), "temporal_count": self._fact_int(metadata.get("temporal_count")),
                "is_only_robust_score": scalar("is_only_robust_score")}
            score, score_kind = native["is_only_robust_score"], "IS_ONLY_ROBUST_J" if mode == "mode_4_is_only_robust" else "FULL_SAMPLE_ROBUST_J"
            if score is None and native["temporal_score"] is not None:
                score, score_kind = native["temporal_score"], "IS_TEMPORAL_ROBUST_SCORE" if mode == "mode_4_is_only_robust" else "FULL_SAMPLE_TEMPORAL_ROBUST_SCORE"
            if mode == "mode_5_full_robust":
                if len(folds) != 1 or any(folds[0][f"train_{edge}_utc_ms"] != folds[0][f"test_{edge}_utc_ms"] for edge in ("start", "end")):
                    refuse()
                native["selection_sample_bars"] = self._fact_int(json.loads(folds[0]["payload_json"]).get("train_bars"))
                if native["selection_sample_bars"] is None:
                    refuse()
        native.update(source_locator=locator, reason_code="QUANTBT_MODE_DETAIL_NOT_PUBLISHED" if any(value is None for value in native.values()) else None)
        result = {"schema_version": "research.current-source-optimizer-disclosure.v1", "optimization_mode": mode,
            "optimization_schedule": schedule, "selection_target": {
                "kind": "SYNTHETIC_CENTROID" if synthetic else "STUDY_LOCAL_TRIAL" if schedule == "per_fold_causal" else "TRIAL",
                "trial_id": selection["trial_id"], "objective_kind": self._full04_objective_kind(best, mode),
                "selection_score": score, "selection_score_kind": score_kind if score is not None else None},
            "calibration_sample": "BOOTSTRAP_PROXY" if mode == "mode_2_sbb" else "FULL_SAMPLE" if mode == "mode_5_full_robust" else "IS_OOS" if mode == "mode_3_flat_minima" else "IS_ONLY",
            "oos_used_for_selection": wf["oos_used_for_selection"], "full_sample_used_for_selection": wf["full_sample_used_for_selection"],
            "mode_evidence": native}
        if synthetic:
            result["centroid"] = {"state": "AVAILABLE", "parameters": _decimal_object(best["params"], "centroid parameters"),
                "medoid_trial_id": native["medoid_trial_id"], "cluster_size": native["cluster_size"],
                "cluster_method": native["cluster_method"], "requires_evaluation": True}
        return result

    @staticmethod
    def _assert_admitted_output_bounds(
        *,
        observations: list[dict[str, Any]],
        folds: list[dict[str, Any]],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: list[dict[str, Any]],
        three_window: bool = False,
        recipe: Mapping[str, Any] | None = None,
        patience: int | None = None,
    ) -> None:
        """Reject an over-budget engine result before P05 writes any bytes.

        The Control API repeats these checks at the custody boundary.  Keeping
        the same finite envelope here means an unexpectedly large or partial
        engine output cannot leave a valid-looking P05 artifact that the
        Portal later has to reject after consuming disk or importer capacity.
        """

        bounds = (
            ("observations", len(observations), 1, 2_000_000),
            ("folds", len(folds), 1 if three_window else 2, 1 if three_window else 256),
            ("trials", len(trials), 1 if patience is not None else 2, _maximum_optuna_trials()),
            ("candidates", len(candidates), 1, MAXIMUM_OPTUNA_TRIALS),
            ("selection", len(selection), 1, 1),
        )
        if recipe is not None:
            p = recipe["descriptor"]
            fold_bounds = {"min": 1, "max": 1} if three_window else p["fold_bounds"]
            maximum_trials = p.get("max_total_trials", p["trial_count"]["max"])
            bounds = (
                ("observations", len(observations), 1, recipe["budgets"]["planning_max_bars"]),
                ("folds", len(folds), fold_bounds["min"], fold_bounds["max"]),
                ("trials", len(trials), 1 if patience is not None else p["trial_count"]["min"], maximum_trials),
                ("candidates", len(candidates), 1, maximum_trials),
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
        causal: bool = False,
        full04_mode: str | None = None,
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
                if full04_mode is not None and (type(record.get("trial_id")) is not int or record["trial_id"] < 0):
                    raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_BINDING_REJECTED", "An optimizer trial must retain its actual non-negative native identity.")
                record["trial_facts"] = self._trial_facts(record, source_contract=source_contract, objective_terms=None, full04_mode=full04_mode)
                if causal:
                    trial_id = self._causal_trial_id(record, trial_id)
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
                if full04_mode is not None and record.get("trial_id") == -1:
                    if full04_mode != "mode_3_flat_minima" or causal:
                        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_BINDING_REJECTED", "A synthetic centroid is not an Optuna trial or fold-local pick.")
                    candidate_id = "native_centroid_minus1"
                params = record.get("params") if isinstance(record.get("params"), Mapping) else {}
                normalized_params = _decimal_object(params, f"{kind} parameters")
                record["trial_facts"] = self._trial_facts(record, source_contract=source_contract, objective_terms=objective_terms, full04_mode=full04_mode)
                if causal:
                    candidate_id = self._causal_trial_id(record, candidate_id)
                if full04_mode is not None:
                    # A native candidate ledger may contain the robust pick
                    # and the same real trial again as a shortlist member.
                    # Evaluation-row identity is not an invented trial ID.
                    candidate_id = f"{candidate_id}.evaluation_{ordinal}"
                    if not causal and type(record.get("trial_id")) is int and record["trial_id"] >= 0:
                        record["trial_facts"]["source_trial_id"] = str(record["trial_id"])
                rows.append({
                    "source_ordinal": ordinal,
                    "candidate_id": candidate_id,
                    "objective": self._nullable_decimal(self._first(record, "objective", "value", "score"), "candidate objective"),
                    "parameters_json": self._canonical_json(normalized_params),
                    "payload_json": self._canonical_json(record),
                })
            else:  # pragma: no cover - private call sites stay explicit
                raise AssertionError(f"unsupported current-source table {kind}")
        if causal or full04_mode is not None:
            field = "trial_id" if kind == "trials" else "candidate_id"
            if len({row[field] for row in rows}) != len(rows):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CAUSAL_BINDING_REJECTED", "Causal source rows repeat an identity within one study.")
        return rows

    def _causal_trial_id(self, record: dict[str, Any], source_id: str) -> str:
        facts = record["trial_facts"]
        study = facts.get("study_id")
        scope = facts.get("fold_scope", {})
        metadata = record.get("selection_metadata") if isinstance(record.get("selection_metadata"), Mapping) else {}
        local = self._nullable_identifier(metadata.get("source_trial_id", record.get("trial_id")))
        original = record.get("trial_id")
        if (study is None or local is None or scope.get("kind") != "FOLD" or scope.get("fold_id") != study
                or type(original) is not int or original < 0 or source_id != str(original)):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CAUSAL_BINDING_REJECTED", "Causal trial lacks its exact outer-fold study/source identity.")
        facts["source_trial_id"] = local
        # The evaluation row identity remains the actual engine trial ID;
        # source_trial_id separately names the original local Optuna trial.
        return self._identifier(f"study_{study}.trial_{source_id}", "causal trial id", 0)

    def _attach_causal_selections(
        self, raw_dir: Path, *, folds: list[dict[str, Any]], trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]], config: Mapping[str, Any], selection: Mapping[str, Any],
        constraints: Mapping[str, Any] | None = None, configured_trials: int = 3, patience: int | None = None,
    ) -> dict[str, Any]:
        """Join actual nested tables; never reinterpret last-study inner scores as outer scores."""
        def refuse() -> None:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_CAUSAL_BINDING_REJECTED", "Causal source selection/inner rows do not bind exactly to every outer fold.")

        def records(frame: pd.DataFrame) -> list[dict[str, Any]]:
            return [{str(k): self._json_value(v) for k, v in row.to_dict().items()} for _, row in frame.iterrows()]

        selections = records(self._read_frame(raw_dir / "wfo" / "fold_selection.parquet", "causal fold selection"))
        inner_rows = records(self._read_frame(raw_dir / "wfo" / "inner_folds.parquet", "causal inner folds"))
        params_by_fold = self._read_json(raw_dir / "wfo" / "params_by_fold.json", "causal parameters by fold")
        params_by_fold = {k: v for k, v in params_by_fold.items() if k not in {"producer", "artifact_schema_version"}}
        expected_ids = {fold["fold_id"] for fold in folds}
        if not 2 <= len(folds) <= 16 or len(expected_ids) != len(folds) or len(selections) != len(folds) or set(params_by_fold) != expected_ids:
            refuse()
        selection_map: dict[str, Mapping[str, Any]] = {}
        grouped_inner: dict[str, list[Mapping[str, Any]]] = {}
        for row in selections:
            fold_id = self._nullable_identifier(row.get("fold_id"))
            if fold_id not in expected_ids or fold_id in selection_map:
                refuse()
            selection_map[fold_id] = row
        for row in inner_rows:
            fold_id = self._nullable_identifier(row.get("outer_fold_id"))
            if fold_id not in expected_ids:
                refuse()
            grouped_inner.setdefault(fold_id, []).append(row)
        calibration = config["calibration"]
        inner_config = {key: calibration.get(key) for key in ("inner_split_frequency", "inner_window_mode", "inner_train_window", "inner_min_folds")}
        constraints = constraints if constraints is not None else DELTA_CAUSAL_INNER_PROFILE["inner_constraints"]
        if (inner_config["inner_split_frequency"] not in constraints["frequencies"]
                or inner_config["inner_window_mode"] not in constraints["window_modes"]
                or not isinstance(inner_config["inner_train_window"], str)
                or re.fullmatch(constraints["train_window_pattern"], inner_config["inner_train_window"]) is None
                or type(inner_config["inner_min_folds"]) is not int or not 2 <= inner_config["inner_min_folds"] <= 16):
            refuse()

        def facts(row: Mapping[str, Any]) -> Mapping[str, Any]:
            return json.loads(row["payload_json"])["trial_facts"]

        if type(configured_trials) is not int or not 2 <= configured_trials <= 400 or not study_trial_count_admitted(len(trials), configured_trials * len(folds), patience) or len(trials) > 6400:
            refuse()
        for fold in folds:
            fold_id = fold["fold_id"]
            native = selection_map[fold_id]
            study = self._nullable_identifier(native.get("study_id"))
            fold_seed = self._fact_int(native.get("fold_seed"))
            if study != fold_id or fold_seed is None or fold_seed > 9_007_199_254_740_991 or native.get("outer_oos_used_for_selection") is not False:
                refuse()
            for name in ("train_start", "train_end", "test_start", "test_end"):
                if self._nullable_utc_ms(native.get(name), name) != fold[name + "_utc_ms"]:
                    refuse()
            native_params = native.get("selected_params")
            if native_params is None and isinstance(native.get("selected_params_json"), str):
                native_params = _json_object(native["selected_params_json"], "causal selected parameters")
            params = _decimal_object(native_params, "causal selected parameters")
            if not params or params != _decimal_object(params_by_fold[fold_id], "causal fold parameter map"):
                refuse()
            study_trials = [row for row in trials if facts(row).get("study_id") == study]
            study_candidates = [row for row in candidates if facts(row).get("study_id") == study]
            if not study_trial_count_admitted(len(study_trials), configured_trials, patience) or self._fact_int(native.get("study_trial_rows")) != len(study_trials) or not 1 <= len(study_candidates) <= configured_trials or self._fact_int(native.get("candidate_count")) != len(study_candidates):
                refuse()
            local = self._nullable_identifier(native.get("selected_trial_id"))
            selected = [row for row in study_candidates if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            searched = [row for row in study_trials if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            if len(selected) != 1 or len(searched) != 1:
                refuse()
            if (searched[0]["state"] != "COMPLETE" or facts(searched[0]).get("stage") != "is_search"
                    or facts(searched[0]).get("pruned") is not False
                    or facts(selected[0]).get("stage") != "oos_candidate_selection"
                    or facts(selected[0]).get("pruned") is not False):
                refuse()
            actual_inner = grouped_inner.get(fold_id, [])
            if not max(2, inner_config["inner_min_folds"]) <= len(actual_inner) <= 16 or self._fact_int(native.get("inner_fold_count")) != len(actual_inner):
                refuse()
            validation = native.get("inner_validation")
            if validation is None and isinstance(native.get("inner_validation_json"), str):
                validation = _json_object(native["inner_validation_json"], "causal inner validation")
            if (not isinstance(validation, Mapping) or any(validation.get(k) != v for k, v in inner_config.items())
                    or validation.get("enabled") is not True or validation.get("selection_scope") != "outer_is_only"
                    or validation.get("outer_oos_used_for_selection") is not False):
                refuse()
            retained_inner = []
            seen_inner = set()
            for row in actual_inner:
                inner_id = self._nullable_identifier(row.get("inner_fold_id"))
                bounds = {name + "_utc_ms": self._nullable_utc_ms(row.get("inner_" + name), "inner " + name)
                          for name in ("train_start", "train_end", "test_start", "test_end")}
                if inner_id is None or inner_id in seen_inner or row.get("outer_oos_used_for_selection") is not False or any(value is None for value in bounds.values()):
                    refuse()
                if (not fold["train_start_utc_ms"] <= bounds["train_start_utc_ms"] <= bounds["train_end_utc_ms"] < bounds["test_start_utc_ms"] <= bounds["test_end_utc_ms"] <= fold["train_end_utc_ms"] < fold["test_start_utc_ms"]
                        or any(self._nullable_utc_ms(row.get("outer_" + name), "inner outer " + name) != fold[name + "_utc_ms"] for name in ("train_start", "train_end", "test_start"))):
                    refuse()
                seen_inner.add(inner_id)
                retained_inner.append({"inner_fold_id": inner_id, **bounds, "outer_oos_used_for_selection": False})
            claim = self._fact_token(native.get("causality_claim"))
            if claim != "strict_nested_fold_local_retraining":
                refuse()
            block = {
                "schema_version": "research.current-source-causal-selection.v1", "scope": "OUTER_FOLD_SELECTION",
                "study_id": study, "fold_seed": fold_seed, "selected_trial_id": searched[0]["trial_id"],
                "parameters": params, "objective": selected[0]["objective"], "objective_kind": "INNER_VALIDATION_DECAY_J",
                **{name: self._nullable_decimal(native.get(name), name) for name in ("candidate_is_metric", "candidate_oos_metric", "candidate_decay")},
                "candidate_is_scope": "INNER_VALIDATION_IS_MEAN", "candidate_oos_scope": "OUTER_FOLD_OOS",
                "candidate_decay_scope": "INNER_IS_MEAN_MINUS_OUTER_OOS",
                "candidate_metrics_scope": "OUTER_FOLD_POST_SELECTION", "candidate_count": len(study_candidates), "study_trial_rows": len(study_trials),
                "outer_oos_used_for_selection": False, "causality_claim": claim,
                "inner_fold_count": len(retained_inner), "inner_validation": inner_config, "inner_folds": retained_inner,
            }
            payload = json.loads(fold["payload_json"])
            payload["causal_selection"] = block
            fold["payload_json"] = self._canonical_json(payload)
        last = json.loads(folds[-1]["payload_json"])["causal_selection"]
        original_local = self._nullable_identifier(selection.get("trial_id"))
        native_last = selection_map[folds[-1]["fold_id"]]
        if (selection.get("scope") != "LAST_FOLD_DEPLOYMENT" or selection.get("fold_id") != folds[-1]["fold_id"]
                or original_local != self._nullable_identifier(native_last.get("selected_trial_id"))
                or _decimal_object(selection.get("params"), "last-fold parameters") != last["parameters"]
                or self._nullable_decimal(selection.get("objective"), "last-fold objective") != last["objective"]):
            refuse()
        return {**selection, "trial_id": last["selected_trial_id"]}

    def _attach_mode4_selections(
        self, raw_dir: Path, *, folds: list[dict[str, Any]], trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]], selection: Mapping[str, Any], recipe: Mapping[str, Any], configured_trials: int = 3, patience: int | None = None,
    ) -> dict[str, Any]:
        """Bind actual IS-only outer studies; Mode 4 has no nested inner study.

        The selector's robustness score is not automatically the native row's
        objective: a medoid retains its original IS mean Sharpe. Both remain
        source facts, never recomputed or relabelled by this custody adapter.
        """
        def refuse() -> None:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE4_BINDING_REJECTED",
                "IS-only selections must bind to their own outer study, source trial, parameters and frozen deployment.")

        frame = self._read_frame(raw_dir / "wfo" / "fold_selection.parquet", "IS-only fold selection")
        native_rows = [{str(k): self._json_value(v) for k, v in row.to_dict().items()} for _, row in frame.iterrows()]
        params_by_fold = self._read_json(raw_dir / "wfo" / "params_by_fold.json", "IS-only parameters by fold")
        params_by_fold = {k: v for k, v in params_by_fold.items() if k not in {"producer", "artifact_schema_version"}}
        ids = {row["fold_id"] for row in folds}
        limits = recipe["descriptor"]["fold_bounds"]
        configured_trials = admitted_study_trials(recipe, configured_trials)
        if (not limits["min"] <= len(folds) <= limits["max"] or len(ids) != len(folds)
                or len(native_rows) != len(folds) or set(params_by_fold) != ids
                or not study_trial_count_admitted(len(trials), configured_trials * len(folds), patience) or len(trials) > recipe["descriptor"]["max_total_trials"]):
            refuse()
        by_fold = {self._nullable_identifier(row.get("fold_id")): row for row in native_rows}
        if set(by_fold) != ids:
            refuse()

        def facts(row: Mapping[str, Any]) -> Mapping[str, Any]:
            return json.loads(row["payload_json"])["trial_facts"]

        for ordinal, fold in enumerate(folds):
            native = by_fold[fold["fold_id"]]
            study, seed = self._nullable_identifier(native.get("study_id")), self._fact_int(native.get("fold_seed"))
            if (study != fold["fold_id"] or seed is None or seed > 9_007_199_254_740_991
                    or native.get("outer_oos_used_for_selection") is not False
                    or native.get("causality_claim") != "strict_fold_local_retraining"
                    or native.get("inner_fold_count") not in (None, 0)):
                refuse()
            for name in ("train_start", "train_end", "test_start", "test_end"):
                if self._nullable_utc_ms(native.get(name), name) != fold[name + "_utc_ms"]:
                    refuse()
            native_params = native.get("selected_params")
            if native_params is None and isinstance(native.get("selected_params_json"), str):
                native_params = _json_object(native["selected_params_json"], "IS-only selected parameters")
            params = _decimal_object(native_params, "IS-only selected parameters")
            if not params or params != _decimal_object(params_by_fold[fold["fold_id"]], "IS-only fold parameter map"):
                refuse()
            local = self._nullable_identifier(native.get("selected_trial_id"))
            searched = [row for row in trials if facts(row).get("study_id") == study]
            pool = [row for row in candidates if facts(row).get("study_id") == study]
            matching = [row for row in searched if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            selected = [row for row in pool if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            # QuantBT publishes [robust_pick, *top_IS] without deduplicating
            # this IS-only pool. Select the explicit native robust witness,
            # not whichever repeated row happened to arrive first.
            selected = [row for row in selected if json.loads(row["payload_json"]).get("selection_metadata", {}).get("selected_by") == "is_only_robust"]
            if (not study_trial_count_admitted(len(searched), configured_trials, patience) or self._fact_int(native.get("study_trial_rows")) != len(searched)
                    or not 1 <= len(pool) <= configured_trials or self._fact_int(native.get("candidate_count")) != len(pool)
                    or len(matching) != 1 or len(selected) != 1 or matching[0]["state"] != "COMPLETE"
                    or facts(matching[0]).get("stage") != "is_search" or facts(matching[0]).get("pruned") is not False
                    or facts(selected[0]).get("stage") not in {"is_search", "is_only_candidate_selection"}
                    or facts(selected[0]).get("oos_seen_by_optuna") is not False):
                refuse()
            block = {
                "schema_version": "research.current-source-mode4-selection.v1", "scope": "OUTER_FOLD_SELECTION",
                "study_id": study, "fold_seed": seed, "source_trial_id": local,
                "selected_trial_id": matching[0]["trial_id"], "parameters": params,
                "params_digest": hashlib.sha256(self._canonical_json(params).encode()).hexdigest(),
                "objective": selected[0]["objective"], "objective_kind": facts(selected[0])["objective_kind"],
                "candidate_count": len(pool), "study_trial_rows": len(searched),
                "outer_oos_used_for_selection": False, "causality_claim": "strict_fold_local_retraining",
                "selection_sequence": ordinal,
                "params_frozen_at_utc_ms": self._nullable_utc_ms(native.get("params_frozen_at"), "IS-only parameter freeze"),
                "candidate_is_metric": self._nullable_decimal(native.get("candidate_is_metric"), "IS-only candidate metric"),
            }
            payload = json.loads(fold["payload_json"])
            payload["mode4_selection"] = block
            fold["payload_json"] = self._canonical_json(payload)
        last = json.loads(folds[-1]["payload_json"])["mode4_selection"]
        if (selection.get("scope") != "LAST_FOLD_DEPLOYMENT" or selection.get("fold_id") != folds[-1]["fold_id"]
                or self._nullable_identifier(selection.get("trial_id")) != last["source_trial_id"]
                or _decimal_object(selection.get("params"), "IS-only last-fold parameters") != last["parameters"]
                or self._nullable_decimal(selection.get("objective"), "IS-only last-fold objective") != last["objective"]):
            refuse()
        return {**selection, "trial_id": last["selected_trial_id"]}

    def _attach_per_fold_decay_selections(
        self, raw_dir: Path, *, folds: list[dict[str, Any]], trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]], selection: Mapping[str, Any], configured_trials: int = 3, patience: int | None = None,
    ) -> dict[str, Any]:
        """Join real fold-local selection; unlike causal, outer OOS participated."""
        def refuse() -> None:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_FOLD_SELECTION_REJECTED",
                "Per-fold-decay source selection must bind to its exact retained study, parameters and outer fold.")

        frame = self._read_frame(raw_dir / "wfo" / "fold_selection.parquet", "per-fold-decay selection")
        native_rows = [{str(k): self._json_value(v) for k, v in row.to_dict().items()} for _, row in frame.iterrows()]
        params_by_fold = self._read_json(raw_dir / "wfo" / "params_by_fold.json", "per-fold parameter map")
        params_by_fold = {k: v for k, v in params_by_fold.items() if k not in {"producer", "artifact_schema_version"}}
        ids = {row["fold_id"] for row in folds}
        if type(configured_trials) is not int or not 2 <= configured_trials <= 400 or not 2 <= len(folds) <= 16 or len(ids) != len(folds) or len(native_rows) != len(folds) or not study_trial_count_admitted(len(trials), configured_trials * len(folds), patience) or set(params_by_fold) != ids:
            refuse()
        by_fold = {self._nullable_identifier(row.get("fold_id")): row for row in native_rows}
        if set(by_fold) != ids:
            refuse()
        def facts(row: Mapping[str, Any]) -> Mapping[str, Any]:
            return json.loads(row["payload_json"])["trial_facts"]
        for ordinal, fold in enumerate(folds):
            native = by_fold[fold["fold_id"]]
            study = self._nullable_identifier(native.get("study_id", native.get("fold_id")))
            if (study != fold["fold_id"] or native.get("outer_oos_used_for_selection") is not True
                    or native.get("causality_claim") != "fold_local_decay_calibration"):
                refuse()
            for name in ("train_start", "train_end", "test_start", "test_end"):
                if self._nullable_utc_ms(native.get(name), name) != fold[name + "_utc_ms"]:
                    refuse()
            native_params = native.get("selected_params")
            if native_params is None and isinstance(native.get("selected_params_json"), str):
                native_params = _json_object(native["selected_params_json"], "fold selected parameters")
            params = _decimal_object(native_params, "fold selected parameters")
            if not params or params != _decimal_object(params_by_fold[fold["fold_id"]], "fold parameter map"):
                refuse()
            local = self._nullable_identifier(native.get("selected_trial_id"))
            searched = [row for row in trials if facts(row).get("study_id") == study]
            pool = [row for row in candidates if facts(row).get("study_id") == study]
            selected = [row for row in pool if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            matching = [row for row in searched if facts(row).get("source_trial_id") == local and json.loads(row["parameters_json"]) == params]
            if (not study_trial_count_admitted(len(searched), configured_trials, patience) or not 1 <= len(pool) <= configured_trials or len(selected) != 1 or len(matching) != 1
                    or matching[0]["state"] != "COMPLETE" or selected[0]["objective"] is None
                    or facts(selected[0]).get("stage") != "oos_candidate_selection"):
                refuse()
            block = {
                "schema_version": "research.current-source-fold-selection.v1", "scope": "OUTER_FOLD_SELECTION",
                "study_id": study, "selected_trial_id": matching[0]["trial_id"], "parameters": params,
                "params_digest": hashlib.sha256(self._canonical_json(params).encode()).hexdigest(),
                "objective": selected[0]["objective"], "objective_kind": "OUTER_FOLD_DECAY_J",
                "candidate_count": len(pool), "study_trial_rows": len(searched),
                "outer_oos_used_for_selection": True,
                "selection_sequence": ordinal,
                "params_frozen_at_utc_ms": self._nullable_utc_ms(native.get("params_frozen_at"), "fold parameter freeze"),
                **{name: self._nullable_decimal(native.get(name), name) for name in ("candidate_is_metric", "candidate_oos_metric", "candidate_decay")},
            }
            payload = json.loads(fold["payload_json"])
            payload["fold_selection"] = block
            fold["payload_json"] = self._canonical_json(payload)
        last = json.loads(folds[-1]["payload_json"])["fold_selection"]
        if (selection.get("scope") != "LAST_FOLD_DEPLOYMENT" or selection.get("fold_id") != folds[-1]["fold_id"]
                or _decimal_object(selection.get("params"), "last fold parameters") != last["parameters"]
                or self._nullable_identifier(selection.get("trial_id")) != self._nullable_identifier(by_fold[folds[-1]["fold_id"]].get("selected_trial_id"))):
            refuse()
        return {**selection, "trial_id": last["selected_trial_id"]}

    def _three_window_disclosure(self, raw_dir: Path, *, config: Mapping[str, Any], selection: Mapping[str, Any],
                                 exact_display_sampling: bool = False) -> dict[str, Any]:
        roles = self._read_json(raw_dir / "wfo" / "three_window_roles.v1.json", "three-window roles")
        if (roles.get("engine_operation") != "train_test_split" or roles.get("calibration_tape") != ["IS", "OOS"]
                or roles.get("holdout_used_for_selection") is not False or roles.get("freeze_before_holdout") is not True):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Independent Holdout requires explicit native custody/selection-order facts.")
        frozen_at = self._nullable_utc_ms(roles.get("frozen_at"), "Three Window parameter freeze")
        holdout_read = self._nullable_utc_ms(roles.get("holdout_replay_started_at"), "Three Window holdout replay start")
        if (frozen_at is None or holdout_read is None or frozen_at > holdout_read
                or roles.get("frozen_at") != selection.get("frozen_at")
                or roles.get("selected_params_digest_scope") != "SHA256_SORTED_NUMERIC_PARAMETER_JSON"):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Holdout replay clocks must follow the retained native parameter freeze.")
        windows, series, metadata = {}, {}, {}
        params = _decimal_object(selection.get("params"), "Three Window selected parameters")
        digest = hashlib.sha256(self._canonical_json(params).encode()).hexdigest()
        if roles.get("selected_params_digest") != hashlib.sha256(self._canonical_json(selection.get("params")).encode()).hexdigest():
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Holdout parameter bundle does not bind the actual selected parameters.")
        for key, source_role, file_key in (("is", "IS", "is"), ("oos", "OOS", "oos"), ("holdout", "HOLDOUT", "holdout_live")):
            bounds = roles.get("windows", {}).get(source_role)
            if not isinstance(bounds, Mapping) or any(type(bounds.get(name)) is not int for name in ("start_utc_ms", "end_exclusive_utc_ms")) or bounds["start_utc_ms"] >= bounds["end_exclusive_utc_ms"]:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Three Window role bounds are incomplete.")
            rows = self._observation_rows(raw_dir / "series" / f"{file_key}.parquet")
            if any(not bounds["start_utc_ms"] <= row["at_utc_ms"] < bounds["end_exclusive_utc_ms"] for row in rows):
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "A replay observation escapes its named window.")
            windows[key] = {**bounds, "bar_count": len(rows)}
            indexes = (self._protocol_display_indices(rows, maximum_points=48) if exact_display_sampling else
                       sorted({round(i * (len(rows) - 1) / max(1, min(len(rows), 48) - 1)) for i in range(min(len(rows), 48))}))
            series[key] = [{name: rows[i][name] for name in ("at_utc_ms", "equity", "return_fraction", "accepted_position", "drawdown_fraction", "signal_target")} for i in indexes]
            metadata[key] = {"source_observation_count": len(rows), "emitted_point_count": len(indexes),
                             "sampling": "FULL" if len(rows) == len(indexes) else "MULTI_SERIES_EXTREMA_V1"}
        if windows["is"]["end_exclusive_utc_ms"] != windows["oos"]["start_utc_ms"] or windows["oos"]["end_exclusive_utc_ms"] != windows["holdout"]["start_utc_ms"]:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_HOLDOUT_BINDING_REJECTED", "Three Window replay roles are not contiguous.")
        return {"schema_version": "research.current-source-protocol-disclosure.v1", "protocol": "three_window_decay",
            "engine_operation": "train_test_split", "calibration_scope": "IS_OOS_ONLY", "observation_scope": "OOS_SELECTION_INPUT",
            "windows": windows, "window_series": series,
            **({"window_series_metadata": metadata} if exact_display_sampling else {}),
            "independent_holdout": {"state": "AVAILABLE", **windows["holdout"],
                "holdout_used_for_selection": False, "selected_params_digest": digest, "freeze_before_holdout": True}}

    def _three_window_replay_rows(self, raw_dir: Path, *, maximum_rows: int = 92 * 24) -> list[dict[str, Any]]:
        """Complete private frozen-parameter replays, not the native study ledger.

        The public summary samples these series. All original exact rows have
        durable P05 Parquet custody, so a sampled chart never becomes the only
        retained IS/Holdout evidence after the confined child is cleaned up.
        """
        result: list[dict[str, Any]] = []
        for role, file_key in (("IS", "is"), ("OOS", "oos"), ("HOLDOUT", "holdout_live")):
            for row in self._observation_rows(raw_dir / "series" / f"{file_key}.parquet"):
                result.append({**row, "source_ordinal": len(result), "window_role": role,
                    "window_source_ordinal": row["source_ordinal"],
                    "window_source_id": f"{role}:{row['source_index_utc']}"})
        if type(maximum_rows) is not int or not 3 <= len(result) <= maximum_rows:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_BOUNDS_REJECTED", "Optimized Three Window full replay exceeds its exact admitted bar bound.")
        return result

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
                "bars_with_turnover": bars_with_turnover if "turnover" in columns else None,
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
            by_fold[fold_id].append(self._child_audit_record(ordinal, record, fold_id))
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

    @staticmethod
    def _reference_candidate_population(summary: dict[str, Any], candidates: list[dict[str, Any]]) -> None:
        """Bound summary metadata without dropping any sealed candidate fact.

        Large study populations already live in the CANDIDATE table. Replace
        only their duplicate identity array with a versioned, exact digest
        reference. Small/historical layouts retain their original shape.
        Readers must validate and resolve this reference, never display it as
        an empty population or infer identity from a ledger page.
        """
        facts = summary.get("source_facts")
        search = facts.get("search") if isinstance(facts, dict) else None
        ids = search.get("candidate_source_trial_ids") if isinstance(search, dict) else None
        if not isinstance(ids, list) or len(ids) <= 256:
            return
        if len(ids) > 6400 or ids != sorted(set(ids)):
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "Candidate population identities are invalid.")
        candidate_ids = sorted({row["candidate_id"] for row in candidates})
        if candidate_ids == ids:
            source_field = "candidate_id"
        else:
            trial_ids = sorted({str(payload["trial_facts"]["source_trial_id"])
                for row in candidates for payload in [json.loads(row["payload_json"])]
                if isinstance(payload.get("trial_facts"), dict) and payload["trial_facts"].get("source_trial_id") is not None})
            if trial_ids != ids:
                raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "Candidate population does not bind to its retained rows.")
            source_field = "trial_facts.source_trial_id"
        search["candidate_source_trial_ids_ref"] = {
            "schema_version": "research.retained-candidate-population.v1",
            "table": "CANDIDATE", "source_field": source_field, "count": len(ids),
            "sha256": hashlib.sha256(json.dumps(ids, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
        }
        del search["candidate_source_trial_ids"]

    def _fit_summary_budget(self, summary: dict[str, Any], observations: list[dict[str, Any]],
                            *, exact_display_sampling: bool = False) -> None:
        """Keep separate core/enrichment bounds without removing authority.

        Only declared display sampling is coarsened, with all bars
        represented and price extrema preserved. Retained observation rows,
        analytics, selection, child audit and fold facts are never discarded.
        A summary that cannot fit even with one candle still fails closed.
        """
        def size(value: Mapping[str, Any]) -> int:
            # PostgreSQL's CHECK measures jsonb::text, not the compact wire
            # encoding. Its spaces after commas/colons can push an otherwise
            # accepted summary over 64 KiB at the atomic seal. Count that
            # representation before P05 writes; ASCII escaping is conservative
            # for Unicode because jsonb stores UTF-8 text instead of escapes.
            try:
                return len(json.dumps(canonicalize(value), ensure_ascii=True,
                                      sort_keys=True, allow_nan=False).encode("utf-8"))
            except (TypeError, ValueError) as exc:
                raise CurrentSourceArtifactError(
                    "RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", "Source metadata is not canonical JSON."
                ) from exc

        enriched = summary.get("enriched_analysis")
        if enriched is not None and (not isinstance(enriched, dict) or size(enriched) > 73_728):
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE", "The retained enrichment exceeds its bounded supplement budget."
            )

        def core_size() -> int:
            return size({key: value for key, value in summary.items() if key != "enriched_analysis"})

        replay = summary.get("replay")
        overview = replay.get("candle_overview") if isinstance(replay, dict) else None
        protocol = summary.get("protocol_disclosure")
        ceiling = MAXIMUM_CANDLE_OVERVIEW_BUCKETS
        protocol_ceiling = 48
        while core_size() > 65_536 and isinstance(overview, dict) and ceiling > 1:
            if (exact_display_sampling and isinstance(protocol, dict)
                    and isinstance(protocol.get("window_series_metadata"), dict) and protocol_ceiling > 8
                    and size(protocol["window_series"]) >= size(overview)):
                protocol_ceiling = max(8, protocol_ceiling // 2)
                self._coarsen_protocol_display(protocol, maximum_points=protocol_ceiling)
                continue
            ceiling = max(1, ceiling // 2)
            overview = self._candle_overview(observations, maximum_buckets=ceiling)
            replay["candle_overview"] = overview
        # FULL03 dense minute replays retain ALL window rows in Parquet. Only
        # their named display sample is coarsened; keep endpoints and the
        # global extrema of equity, returns and drawdown, with typed counts.
        ceiling = protocol_ceiling
        while (core_size() > 65_536 and exact_display_sampling and isinstance(protocol, dict)
               and isinstance(protocol.get("window_series_metadata"), dict) and ceiling > 8):
            ceiling = max(8, ceiling // 2)
            self._coarsen_protocol_display(protocol, maximum_points=ceiling)
        if core_size() > 65_536:
            raise CurrentSourceArtifactError(
                "RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE",
                "The current-source summary exceeds the sealed local read-model budget.",
            )

    def _coarsen_protocol_display(self, protocol: dict[str, Any], *, maximum_points: int) -> None:
        for role in ("is", "oos", "holdout"):
            points = protocol["window_series"][role]
            indexes = self._protocol_display_indices(points, maximum_points=maximum_points)
            protocol["window_series"][role] = [points[index] for index in indexes]
            meta = protocol["window_series_metadata"][role]
            meta["emitted_point_count"] = len(indexes)
            meta["sampling"] = ("FULL" if len(indexes) == meta["source_observation_count"]
                                else "MULTI_SERIES_EXTREMA_V1")

    @staticmethod
    def _protocol_display_indices(rows: list[dict[str, Any]], *, maximum_points: int) -> list[int]:
        if len(rows) <= maximum_points:
            return list(range(len(rows)))
        # One union, not three independently presented source histories.
        # A minimum of two endpoints + six extrema survives every coarsening.
        maximum_per_series = max(2, maximum_points // 3)
        return sorted(set().union(*(CurrentSourceArtifactAdapter._extrema_indices(
            [Decimal(str(row[field])) for row in rows], maximum=maximum_per_series)
            for field in ("equity", "return_fraction", "drawdown_fraction"))))

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
        full04_mode: str | None = None,
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
        if full04_mode is not None:
            oos_evaluated = stage == "oos_candidate_selection"
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
        if full04_mode is not None:
            objective_kind = self._full04_objective_kind(record, full04_mode)
        components = self._objective_components(record, stage=stage, objective_terms=objective_terms)
        if full04_mode is not None:
            components = {"state": "NOT_PUBLISHED", "reason_code": "QUANTBT_MODE_COMPONENTS_RETAINED_IN_NATIVE_EVIDENCE", "formula": None, "terms": []}
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
            "objective_components": components,
        }

    @staticmethod
    def _full04_objective_kind(record: Mapping[str, Any], mode: str) -> str:
        metadata = record.get("selection_metadata") if isinstance(record.get("selection_metadata"), Mapping) else {}
        if metadata.get("stage") == "oos_candidate_selection":
            return "MODE_1_DECAY_J"
        if mode == "mode_2_sbb":
            return "SBB_BOOTSTRAP_ROBUST_J"
        if mode == "mode_3_flat_minima":
            return "IS_MEAN_SHARPE" if metadata.get("stage") == "is_search" else "MODE_1_DECAY_J"
        if mode == "mode_4_is_only_robust":
            return "IS_ONLY_ROBUST_J" if record.get("trial_id") == -1 else "IS_MEAN_SHARPE"
        if mode == "mode_5_full_robust":
            return "FULL_SAMPLE_ROBUST_J" if record.get("trial_id") == -1 else "FULL_SAMPLE_MEAN_SHARPE"
        raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_MODE_BINDING_REJECTED", "An unregistered optimizer mode cannot acquire retained mode facts.")

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

    @staticmethod
    def _execution_observation(
        manifest: Mapping[str, Any], folds: list[dict[str, Any]], selection: Mapping[str, Any]
    ) -> dict[str, Any] | None:
        """A real adapter completion clock, NOT an engine first-read timestamp.

        Old output missing a clock/selection fact stays absent. The inclusive
        source fold end is converted using the source's declared bar interval.
        """
        used = selection.get("oos_used_for_selection")
        interval = {"1m":60_000, "1min": 60_000, "5m":300_000, "5min": 300_000, "15m":900_000, "15min": 900_000,
                    "30m":1_800_000, "30min": 1_800_000, "1h": 3_600_000, "4h": 14_400_000,
                    "1d":86_400_000, "1D": 86_400_000}.get(manifest.get("timeframe"))
        if type(used) is not bool or interval is None or not folds:
            return None
        try:
            start, completed = pd.Timestamp(manifest["started_at"]), pd.Timestamp(manifest["completed_at"])
            if start.tzinfo is None or completed.tzinfo is None or pd.isna(start) or pd.isna(completed) or completed < start:
                return None
            bounds = [(row["test_start_utc_ms"], row["test_end_utc_ms"]) for row in folds]
            if any(type(a) is not int or type(b) is not int or a < 0 or b < a for a, b in bounds):
                return None
        except (KeyError, TypeError, ValueError):
            return None
        return {
            "schema_version": "research.execution-observation.v1",
            "basis": "PORTAL_ADAPTER_ENGINE_CALL_COMPLETED",
            "started_at_utc_ms": int(start.value // 1_000_000),
            "completed_at_utc_ms": int(completed.value // 1_000_000),
            "range_start_utc_ms": min(a for a, _ in bounds),
            "range_end_exclusive_utc_ms": max(b for _, b in bounds) + interval,
            "evaluation_role": "SELECTION_INPUT" if used else "OUTER_OOS",
        }

    def _source_facts(
        self,
        *,
        source_contract: Mapping[str, Any] | None,
        fold_metrics: Mapping[str, Any] | None,
        config: Mapping[str, Any],
        trials: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        selection: Mapping[str, Any],
        folds: list[dict[str, Any]] | None = None,
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
        result = {
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
        if folds is not None:
            result["selected_fold_metrics"]["reason_code"] = "QUANTBT_CAUSAL_BEST_TRIAL_METRICS_ARE_INNER_VALIDATION_NOT_OUTER_OOS"
            result["temporal_guards"]["observed_inner_fold_count"] = sum(json.loads(fold["payload_json"])["causal_selection"]["inner_fold_count"] for fold in folds)
            result["search"]["raw_best_is_trial_id"] = None
            result["search"]["raw_best_is_objective"] = None
            result["search"]["candidate_source_trial_ids"] = sorted({self._identifier(f"study_{facts_of(row)['study_id']}.trial_{facts_of(row)['source_trial_id']}", "causal candidate source id", 0) for row in candidates})
        return result

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
        retained_selection = json.loads(str(selection["payload_json"]))
        if "scope" in retained_selection:
            body["selection"].update({key: retained_selection[key] for key in ("scope", "fold_id")})
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

    def _write_rows(self, writer: Any, registry: ArtifactSchemaRegistry, kind: str, rows: Iterable[dict[str, Any]],
                    *, maximum_batch_rows: int = MAXIMUM_TABLE_BATCH_ROWS) -> None:
        schema = registry.require(kind).arrow_schema
        values = list(rows)
        if not values:
            raise CurrentSourceArtifactError("RESEARCH_CURRENT_SOURCE_ARTIFACT_INVALID", f"The source {kind} relation is empty.")
        if maximum_batch_rows not in (MAXIMUM_TABLE_BATCH_ROWS, FULL03_STORAGE_BATCH_ROWS):
            raise ValueError("retained storage batch must use a bounded compiled size")
        for start in range(0, len(values), maximum_batch_rows):
            batch_rows = values[start : start + maximum_batch_rows]
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
