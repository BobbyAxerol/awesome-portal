"""P06 process supervisor for the bounded QuantBT adapter.

The durable scheduler and lease state live in Control API/PostgreSQL.  This
module has no database, NATS, Execution, broker or command authority: it can
only start one allowlisted child from an ID-only launch receipt.  It therefore
cannot become a second scheduler or bypass P05 fencing.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import resource
import shutil
import signal
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, TypedDict
from portal_api.domain.research_execution_recipes import execution_recipe
from portal_api.domain.research_full03_profiles import (
    is_full03_profile, full03_recipe, validate_full03_execution_binding, full03_controls_from_receipt,
)

_FIXED_BUDGET = execution_recipe("p04.fixed-qualification.v1")["budgets"]
_WFO_BUDGET = execution_recipe("p10.delta-signal-notional-wfo.v1")["budgets"]
_IMPORTED_BUDGET = execution_recipe("p17.imported-signal-notional.v1")["budgets"]

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_PREVIEW_LONG_CPU_SECONDS,
    DELTA_WFO_PREVIEW_LONG_MAX_TRIALS,
    DELTA_WFO_PREVIEW_LONG_MIN_TRIALS,
    DELTA_WFO_PREVIEW_LONG_WALL_SECONDS,
    delta_wfo_preview_long_enabled,
)
from portal_api.domain.research_imported_alpha_profile import (
    IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    IMPORTED_ALPHA_ADAPTER_ID,
    IMPORTED_ALPHA_MAX_SOURCE_BYTES,
    IMPORTED_ALPHA_PROFILE_DIGEST,
    IMPORTED_ALPHA_PROFILE_ID,
)
from portal_api.domain.research_final_audit import (
    PINNED_FINAL_AUDIT_PROFILE_DIGEST, PINNED_FINAL_AUDIT_PROFILE_ID,
    PINNED_FINAL_AUDIT_TASK, PinnedSelectionAuditTarget, audit_digest,
)


class ResearchSupervisorError(RuntimeError):
    """Typed local supervisor failure; caller maps it to P06 retry policy."""

    def __init__(self, message: str, *, code: str = "ENGINE_ERROR") -> None:
        super().__init__(message)
        self.code = code


def _child_resource_exhausted(stderr_tail: str) -> bool:
    """Recognize Python's bounded errno line after an engine wrapper fails."""

    return bool(re.search(r"(?:OSError|PermissionError): \[Errno (?:28|122)\]", stderr_tail))


def _child_peak_rss(payload: dict[str, Any], memory_limit: int) -> int:
    """Per-process Linux high-water mark, never a parent's cumulative delta."""
    value = payload.get("peak_rss_bytes")
    if type(value) is not int or not 0 < value <= memory_limit:
        raise ResearchSupervisorError("P06 child did not report a valid bounded peak RSS")
    return value


class SourceWindowMetadata(TypedDict):
    start_ms: int
    end_ms: int
    source_locator: str


def _source_windows_payload(windows: dict[str, SourceWindowMetadata]) -> dict[str, SourceWindowMetadata]:
    """Bounded declared metadata only; never holdout rows or account authority."""
    if not isinstance(windows, dict) or set(windows) - {"is", "oos", "holdout"}:
        raise ResearchSupervisorError("P06 source window metadata is invalid")
    copied = {}
    for kind, row in windows.items():
        if not isinstance(row, dict) or set(row) != {"start_ms", "end_ms", "source_locator"}:
            raise ResearchSupervisorError("P06 source window metadata is invalid")
        start, end, locator = row["start_ms"], row["end_ms"], row["source_locator"]
        if any(type(value) is not int or not 0 <= value <= 9_007_199_254_740_991 for value in (start, end)) \
                or start >= end or not isinstance(locator, str) or not 1 <= len(locator) <= 256:
            raise ResearchSupervisorError("P06 source window metadata is invalid")
        copied[kind] = dict(row)
    return copied


@dataclass(frozen=True, slots=True)
class ResearchChildLimits:
    # Numba/Arrow reserve virtual address ranges while their resident use is
    # much lower. A 4 GiB address-space ceiling is therefore the smallest
    # reliable P04 QuantBT bound on this pinned runtime; CPU/FD/file/scratch
    # limits still make one child materially bounded on the 32 GiB host.
    memory_bytes: int = _FIXED_BUDGET["memory_bytes"]
    cpu_seconds: int = _FIXED_BUDGET["cpu_seconds"]
    scratch_bytes: int = _FIXED_BUDGET["scratch_bytes"]
    file_bytes: int = _FIXED_BUDGET["file_bytes"]
    fd_limit: int = _FIXED_BUDGET["fd_limit"]
    wall_seconds: int = _FIXED_BUDGET["wall_seconds"]

    def validate(self, *, recipe_profile_id: str | None = None) -> None:
        expanded_budget = False
        if recipe_profile_id is not None:
            from portal_api.domain.research_execution_recipes import execution_recipe
            from portal_api.domain.research_trial_budget import expanded_trials
            row=execution_recipe(recipe_profile_id)
            native_search = row['descriptor'].get('native_input',{}).get('optimizer') == 'PINNED_QUANTBT_NATIVE_IS_SHARPE_V1'
            expanded_budget=(expanded_trials(row) or native_search) and all(getattr(self,k)<=row['budgets'][k]
                for k in ('memory_bytes','cpu_seconds','wall_seconds','scratch_bytes','file_bytes','fd_limit'))
        if not (2 * 1024 * 1024 * 1024 <= self.memory_bytes <= 8 * 1024 * 1024 * 1024):
            raise ResearchSupervisorError("memory_bytes is outside P06's bounded child range")
        if not (1 <= self.cpu_seconds <= 300 and 1 <= self.wall_seconds <= 600) and not expanded_budget and not (
            # Research preview only: the long WFO child's own ceiling.
            delta_wfo_preview_long_enabled()
            and 1 <= self.cpu_seconds <= DELTA_WFO_PREVIEW_LONG_CPU_SECONDS
            and 1 <= self.wall_seconds <= DELTA_WFO_PREVIEW_LONG_WALL_SECONDS
        ):
            raise ResearchSupervisorError("CPU and wall clock limits are outside P06's bounded child range")
        if not (1 * 1024 * 1024 <= self.scratch_bytes <= 512 * 1024 * 1024):
            raise ResearchSupervisorError("scratch_bytes is outside P06's bounded child range")
        if not (64 * 1024 <= self.file_bytes <= 16 * 1024 * 1024 and 32 <= self.fd_limit <= 512):
            raise ResearchSupervisorError("file/FD limits are outside P06's bounded child range")


@dataclass(frozen=True, slots=True)
class ResearchChildReceipt:
    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    artifact_root: Path
    # P10 carries these server-owned values explicitly rather than asking the
    # child to assume UI defaults.  P06 callers that predate P10 retain the
    # protected default profile through the dataclass default below.
    p04_parameters: dict[str, int | float] | None = None
    # P13 uses the actual P08 OOS boundary to produce a compact evidence
    # passport.  It is optional only for pre-P13/P06 compatibility callers;
    # the installed P10 producer always supplies it.
    oos_start_utc_ms: int | None = None
    # Immutable P08 bound: optional warmup must not appear as IS equity.
    is_start_utc_ms: int | None = None
    # Metadata bounds only; the tape still ends before the sealed holdout.
    source_windows: dict[str, SourceWindowMetadata] | None = None
    execution_profile_id: str | None = None
    execution_profile_digest: str | None = None
    source_observation: dict[str, Any] | None = None
    qualification_binding: dict[str, Any] | None = None
    native_symbol: str | None = None
    native_optimization: dict[str, Any] | None = None

    def as_payload(self) -> dict[str, Any]:
        payload = {
            "schema_version": "research.p06.child-receipt.v1",
            "task": "P04_DELTA_SMOKE",
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            # This is an opaque P05 storage root identity only. The child does
            # not write it in P06; P05 reservation/fence remains the writer.
            "artifact_root": str(self.artifact_root),
        }
        if self.p04_parameters is not None:
            payload["p04_parameters"] = self.p04_parameters
        if self.oos_start_utc_ms is not None:
            payload["oos_start_utc_ms"] = self.oos_start_utc_ms
        if self.is_start_utc_ms is not None:
            payload["is_start_utc_ms"] = self.is_start_utc_ms
        if self.source_windows is not None:
            payload["source_windows"] = _source_windows_payload(self.source_windows)
        if self.execution_profile_id is not None:
            from portal_api.domain.research_native_profile import is_native_profile, native_profile
            if is_native_profile(self.execution_profile_id):
                row = native_profile(self.execution_profile_id, self.execution_profile_digest)
                if self.source_observation is not None or self.qualification_binding is not None:
                    raise ResearchSupervisorError('native fixed child cannot carry another source/release binding')
                if self.native_symbol not in {'BTCUSDT','ETHUSDT','SOLUSDT'}:
                    raise ResearchSupervisorError('native fixed child must carry exact P08 symbol')
                payload.update(execution_profile_id=row['profile_id'], execution_profile_digest=row['profile_digest'],native_symbol=self.native_symbol)
                optimized = row['descriptor']['native_input']['optimizer'] == 'PINNED_QUANTBT_NATIVE_IS_SHARPE_V1'
                if optimized != (self.native_optimization is not None):
                    raise ResearchSupervisorError('native optimizer controls must match the exact installed recipe')
                if optimized:
                    payload['native_optimization'] = self.native_optimization
                return payload
            from portal_api.domain.research_vn_observed_fixed_profile import VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST
            from portal_api.domain.research_run_producer import VnSourceObservation
            if (self.execution_profile_id, self.execution_profile_digest) != (VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST) or self.source_observation is None:
                raise ResearchSupervisorError("fixed child requires its exact observed-date profile and provenance")
            payload.update(execution_profile_id=self.execution_profile_id, execution_profile_digest=self.execution_profile_digest,
                source_observation=VnSourceObservation.model_validate(self.source_observation).model_dump(mode="json"))
        elif self.execution_profile_digest is not None or self.source_observation is not None or self.native_symbol is not None or self.native_optimization is not None:
            raise ResearchSupervisorError("legacy fixed child cannot carry another profile's provenance")
        if self.qualification_binding is not None:
            from portal_api.domain.research_engine_qualification import validate_engine_qualification_binding
            validate_engine_qualification_binding(self.qualification_binding, release_id="er_quantbt_110",
                profile_id="p04.fixed-qualification.v1", adapter_contract_digest=self.qualification_binding.get("adapter_contract_digest", ""))
            payload["qualification_binding"] = dict(self.qualification_binding)
        return payload


@dataclass(frozen=True, slots=True)
class ResearchChildResult:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    engine_version: str
    final_equity: float
    num_trades: int
    bars: int
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]
    # A bounded P13 source receipt, generated by the confined QuantBT child.
    # It contains no source path, candle row, credential or worker handle.
    evidence_source: dict[str, Any] | None = None
    # Independently rehashed by the E17 child and checked by the supervisor.
    imported_source_digest: str | None = None
    # Tiny source metadata is outside the P13 core. The path is private,
    # supervisor-derived, and never serialized into a public run receipt.
    fixed_replay_source: dict[str, Any] | None = None
    fixed_replay_path: Path | None = None
    native_execution: dict[str, Any] | None = None
    native_optimization_path: Path | None = None
    window_execution_source: dict[str, Any] | None = None
    window_execution_path: Path | None = None
    # Opt-in operator qualification only; these fields never enter the
    # public evidence receipt, engine bundle or P05 manifest.
    is_qualification_source: dict[str, Any] | None = None
    is_qualification_path: Path | None = None


# W1 §1.1 child_limits (cpu 120 s, wall 240 s) plus the design's scratch and
# per-file caps. Memory/FD/NPROC stay at the P04 defaults.  The P04 default
# ``ResearchChildLimits()`` is unchanged.
DELTA_WFO_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=_WFO_BUDGET["cpu_seconds"],
    wall_seconds=_WFO_BUDGET["wall_seconds"],
    scratch_bytes=_WFO_BUDGET["scratch_bytes"],
    file_bytes=_WFO_BUDGET["file_bytes"],
)

# Research preview only (PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO, PORTAL_ENV=
# local): a 2..400-trial study needs more than the locked 120/240 s. Validated
# only while that flag is on; every other lane keeps its limits above.
DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=DELTA_WFO_PREVIEW_LONG_CPU_SECONDS,
    wall_seconds=DELTA_WFO_PREVIEW_LONG_WALL_SECONDS,
    scratch_bytes=_WFO_BUDGET["scratch_bytes"],
    file_bytes=_WFO_BUDGET["file_bytes"],
)

IMPORTED_ALPHA_CHILD_LIMITS = ResearchChildLimits(
    cpu_seconds=_IMPORTED_BUDGET["cpu_seconds"],
    wall_seconds=_IMPORTED_BUDGET["wall_seconds"],
    scratch_bytes=_IMPORTED_BUDGET["scratch_bytes"],
    file_bytes=_IMPORTED_BUDGET["file_bytes"],
)


@dataclass(frozen=True, slots=True)
class ImportedAlphaChildReceipt:
    """Exact-digest E17 launch receipt; source is a short-lived 0600 file."""

    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    source_path: Path
    source_digest: str
    entrypoint: str
    parameters: dict[str, str | int | float | bool]
    random_seed: int | None
    artifact_root: Path
    oos_start_utc_ms: int
    is_start_utc_ms: int | None = None
    source_windows: dict[str, SourceWindowMetadata] | None = None

    def as_payload(self) -> dict[str, Any]:
        return {
            "schema_version": "research.p06.child-receipt.v1",
            "task": "P17_IMPORTED_SIGNAL_NOTIONAL",
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            "source_path": str(self.source_path),
            "source_digest": self.source_digest,
            "entrypoint": self.entrypoint,
            "parameters": dict(self.parameters),
            "random_seed": self.random_seed,
            "artifact_root": str(self.artifact_root),
            "oos_start_utc_ms": self.oos_start_utc_ms,
            **({"is_start_utc_ms": self.is_start_utc_ms} if self.is_start_utc_ms is not None else {}),
            **({"source_windows": _source_windows_payload(self.source_windows)} if self.source_windows is not None else {}),
            "execution_adapter_id": IMPORTED_ALPHA_ADAPTER_ID,
            "adapter_contract_digest": IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
            "execution_profile_id": IMPORTED_ALPHA_PROFILE_ID,
            "execution_profile_digest": IMPORTED_ALPHA_PROFILE_DIGEST,
        }


@dataclass(frozen=True, slots=True)
class DeltaWfoChildReceipt:
    """ID-only launch receipt for the W1 ``P10_DELTA_WFO`` child task.

    Every WFO knob except the requested span/first OOS boundary comes from the
    digest-pinned profile inside the child; the receipt cannot widen them.
    """

    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    artifact_root: Path
    execution_profile_id: str
    execution_profile_digest: str
    dataset_id: str
    symbol: str
    data_start_utc_ms: int
    data_end_exclusive_utc_ms: int
    first_oos_utc_ms: int
    # W5a A10c: the same confined child runs the what-if diagnostic. Its
    # admitted evaluations travel ID-and-value only (no path, no source).
    task: str = "P10_DELTA_WFO"
    # W5a: a what-if sibling's two pinned axes (exact decimal text).
    pinned_parameters: tuple[tuple[str, str], ...] = ()
    whatif_grid_key: str | None = None
    whatif_evaluations: tuple[dict[str, Any], ...] = ()
    # Research preview only: the admitted long-WFO trial count. None keeps
    # the locked profile's count and the receipt bytes of every other run.
    optuna_trials: int | None = None
    temporal_controls: dict[str, Any] | None = None
    causal_inner_controls: dict[str, Any] | None = None
    holdout_start_utc_ms: int | None = None
    # New recipes alone carry the separately immutable Alpha + source clock.
    # None leaves every historical launch payload byte-for-byte unchanged.
    execution_binding: dict[str, Any] | None = None
    imported_source: dict[str, Any] | None = None
    early_stopping: int | None = None

    def as_payload(self, *, output_root: Path) -> dict[str, Any]:
        if self.task not in {"P10_DELTA_WFO", "P16_DELTA_WHATIF_GRID", "P10_DELTA_THREE_WINDOW_OPTIMIZED"}:
            raise ResearchSupervisorError("P06 WFO child task is not allowlisted")
        from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID
        if self.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID and self.causal_inner_controls is None:
            raise ResearchSupervisorError("causal inner child requires its explicit bounded controls")
        payload: dict[str, Any] = {
            "schema_version": "research.p06.child-receipt.v1",
            "task": self.task,
            "job_id": self.job_id,
            "run_id": self.run_id,
            "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch,
            "market_path": str(self.market_path),
            "artifact_root": str(self.artifact_root),
            "output_root": str(output_root),
            "execution_profile_id": self.execution_profile_id,
            "execution_profile_digest": self.execution_profile_digest,
            "dataset_id": self.dataset_id,
            "symbol": self.symbol,
            "data_start_utc_ms": self.data_start_utc_ms,
            "data_end_exclusive_utc_ms": self.data_end_exclusive_utc_ms,
            "first_oos_utc_ms": self.first_oos_utc_ms,
        }
        from portal_api.domain.research_early_stopping import admitted_early_stopping
        row = execution_recipe(self.execution_profile_id)
        stopping = admitted_early_stopping({"early_stopping": self.early_stopping,
            "optuna_trials": self.optuna_trials or row["public_profile"]["trial_default"]})
        if stopping is not None:
            if self.task == "P16_DELTA_WHATIF_GRID":
                raise ResearchSupervisorError("what-if diagnostics cannot inherit optimizer early stopping")
            payload["early_stopping"] = stopping
        if is_full03_profile(self.execution_profile_id):
            try:
                row = full03_recipe(self.execution_profile_id, self.execution_profile_digest)
                validate_full03_execution_binding(self.execution_binding, row)
                from portal_api.domain.research_trial_budget import child_study_trials, expanded_trials
                if self.whatif_grid_key is not None or self.whatif_evaluations:
                    raise ValueError("FULL-03 cannot inherit preview/what-if study controls")
                if expanded_trials(row):
                    payload['optuna_trials']=self.optuna_trials
                elif self.optuna_trials is not None:
                    raise ValueError('historical recipe forbids a trial override')
                child_study_trials(row,payload)
                payload["execution_binding"] = self.execution_binding
                if row["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING":
                    from portal_api.domain.research_imported_search import validate_imported_search_binding
                    if not isinstance(self.imported_source, dict) or set(self.imported_source) != {"binding", "source_path", "alpha_id", "alpha_version_id"}:
                        raise ValueError("FULL05 child requires exact immutable source custody")
                    validate_imported_search_binding(self.imported_source["binding"])
                    payload["imported_source"] = self.imported_source
                elif self.imported_source is not None:
                    raise ValueError("Imported source cannot enter a Delta child")
                if self.pinned_parameters:
                    if len(dict(self.pinned_parameters)) != len(self.pinned_parameters):
                        raise ValueError("FULL-03 pins must name distinct declared axes")
                    payload["pinned_parameters"] = dict(self.pinned_parameters)
                if row["descriptor"]["protocol"] == "three_window_decay":
                    if (self.task != "P10_DELTA_THREE_WINDOW_OPTIMIZED"
                            or type(self.holdout_start_utc_ms) is not int
                            or not self.data_start_utc_ms < self.first_oos_utc_ms < self.holdout_start_utc_ms < self.data_end_exclusive_utc_ms
                            or self.temporal_controls is not None or self.causal_inner_controls is not None):
                        raise ValueError("FULL-03 optimized Three Window requires its independent holdout")
                    payload["holdout_start_utc_ms"] = self.holdout_start_utc_ms
                else:
                    if self.task != "P10_DELTA_WFO" or self.holdout_start_utc_ms is not None:
                        raise ValueError("FULL-03 Advanced recipe requires its exact task without Holdout")
                    if self.temporal_controls is not None:
                        payload["temporal_controls"] = dict(self.temporal_controls)
                    if self.causal_inner_controls is not None:
                        payload["causal_inner_controls"] = dict(self.causal_inner_controls)
                    full03_controls_from_receipt(payload, row)
            except ValueError as exc:
                raise ResearchSupervisorError(str(exc)) from exc
            return payload
        if self.execution_binding is not None:
            raise ResearchSupervisorError("FULL-03 Alpha/source-clock binding cannot enter a historical child")
        if self.pinned_parameters:
            if self.task not in {"P10_DELTA_WFO", "P10_DELTA_THREE_WINDOW_OPTIMIZED"}:
                raise ResearchSupervisorError("P06 only a WFO study may carry pinned parameters")
            payload["pinned_parameters"] = dict(self.pinned_parameters)
        if self.optuna_trials is not None:
            if (
                self.task != "P10_DELTA_WFO"
                or isinstance(self.optuna_trials, bool)
                or not isinstance(self.optuna_trials, int)
                or not DELTA_WFO_PREVIEW_LONG_MIN_TRIALS <= self.optuna_trials <= DELTA_WFO_PREVIEW_LONG_MAX_TRIALS
            ):
                raise ResearchSupervisorError("P06 only a preview long WFO study may carry a bounded trial count")
            payload["optuna_trials"] = self.optuna_trials
        from portal_api.domain.research_full02_profiles import (
            DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
            DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST,
        )
        full02 = self.execution_profile_id in {DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID}
        if full02 and self.optuna_trials is not None:
            raise ResearchSupervisorError("FULL-02 recipes never inherit preview-long trial budgets")
        if self.execution_profile_id == DELTA_PER_FOLD_DECAY_PROFILE_ID and self.temporal_controls is None:
            raise ResearchSupervisorError("per-fold-decay requires its explicit temporal controls")
        if self.execution_profile_id == DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID and self.task != "P10_DELTA_THREE_WINDOW_OPTIMIZED":
            raise ResearchSupervisorError("optimized Three Window cannot enter an Advanced task")
        if self.task == "P10_DELTA_THREE_WINDOW_OPTIMIZED":
            if ((self.execution_profile_id, self.execution_profile_digest) != (DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST)
                    or type(self.holdout_start_utc_ms) is not int
                    or not self.data_start_utc_ms < self.first_oos_utc_ms < self.holdout_start_utc_ms < self.data_end_exclusive_utc_ms
                    or self.temporal_controls is not None or self.causal_inner_controls is not None):
                raise ResearchSupervisorError("optimized Three Window requires its exact independent holdout/profile")
            payload["holdout_start_utc_ms"] = self.holdout_start_utc_ms
        elif self.holdout_start_utc_ms is not None:
            raise ResearchSupervisorError("independent holdout cannot enter an Advanced profile")
        if self.temporal_controls is not None:
            from portal_api.domain.research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST
            if self.task != "P10_DELTA_WFO" or (self.execution_profile_id, self.execution_profile_digest) not in {(DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST), (DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST)}:
                raise ResearchSupervisorError("temporal controls require the exact v2 execution profile")
            payload["temporal_controls"] = dict(self.temporal_controls)
        if self.causal_inner_controls is not None:
            from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST
            if self.task != "P10_DELTA_WFO" or (self.execution_profile_id, self.execution_profile_digest) != (DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST) or self.temporal_controls is not None or self.optuna_trials is not None:
                raise ResearchSupervisorError("causal controls require the exact bounded causal inner profile")
            payload["causal_inner_controls"] = dict(self.causal_inner_controls)
        if self.task == "P16_DELTA_WHATIF_GRID":
            if not self.whatif_grid_key or not 1 <= len(self.whatif_evaluations) <= 81:
                raise ResearchSupervisorError("P06 what-if child receipt carries no bounded evaluation list")
            payload["whatif_grid_key"] = self.whatif_grid_key
            payload["whatif_evaluations"] = [dict(entry) for entry in self.whatif_evaluations]
        return payload


@dataclass(frozen=True, slots=True)
class PinnedAuditChildReceipt:
    """Private immutable target only; never accepts fresh search/default knobs."""

    job_id: str
    run_id: str
    worker_attempt_id: str
    lease_epoch: int
    market_path: Path
    artifact_root: Path
    target: PinnedSelectionAuditTarget
    expected_target_digest: str

    @property
    def task(self) -> str:
        return PINNED_FINAL_AUDIT_TASK

    @property
    def execution_profile_id(self) -> str:
        return PINNED_FINAL_AUDIT_PROFILE_ID

    @property
    def execution_profile_digest(self) -> str:
        return PINNED_FINAL_AUDIT_PROFILE_DIGEST

    def as_payload(self, *, output_root: Path) -> dict[str, Any]:
        if type(self.lease_epoch) is not int or self.lease_epoch < 1:
            raise ResearchSupervisorError("audit receipt requires a positive strict lease epoch")
        if self.run_id == self.target.parent_run_id or self.target.target_digest() != self.expected_target_digest:
            raise ResearchSupervisorError("audit receipt changed its frozen target or child identity")
        return {"schema_version": "research.p06.child-receipt.v1", "task": self.task,
            "job_id": self.job_id, "run_id": self.run_id, "worker_attempt_id": self.worker_attempt_id,
            "lease_epoch": self.lease_epoch, "market_path": str(self.market_path),
            "artifact_root": str(self.artifact_root), "output_root": str(output_root),
            "execution_profile_id": self.execution_profile_id, "execution_profile_digest": self.execution_profile_digest,
            "audit_target": self.target.model_dump(mode="json"), "audit_target_digest": self.expected_target_digest}


@dataclass(frozen=True, slots=True)
class DeltaWfoChildResult:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    engine_version: str
    bars: int
    n_folds: int
    trial_rows: int
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]
    # Validated regular-file tree ``output_root/<run_id>/...`` on the parent's
    # scratch filesystem. The caller copies it out and removes it.
    output_root: Path
    output_files: int
    output_bytes: int
    # Additive private proof only for the pinned evaluation task.
    audit_receipt: dict[str, Any] | None = None


# CG-P06-02: the child's live progress channel. A fixed sibling file of the
# receipt (like ``result.json``), append-only NDJSON, bounded in lines and
# bytes. It carries only Optuna trial facts and the child's own CPU seconds;
# no path, market row, parameter value or credential.
CHILD_PROGRESS_FILENAME = "progress.ndjson"
CHILD_PROGRESS_SCHEMA = "research.p06.child-progress.v1"
CHILD_PROGRESS_MAX_RECORDS = 512
CHILD_PROGRESS_MAX_LINE_BYTES = 1_024
CHILD_PROGRESS_MAX_BYTES = CHILD_PROGRESS_MAX_RECORDS * CHILD_PROGRESS_MAX_LINE_BYTES
# The parent tails the channel this often while a progress consumer is
# attached; heartbeats keep their own 5-second cadence.
CHILD_PROGRESS_POLL_SECONDS = 0.5
_CHILD_HEARTBEAT_SECONDS = 5.0
_SIGNED_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?")


def _valid_child_progress_record(value: object, expected_sequence: int) -> dict[str, Any] | None:
    """Accept exactly one well-formed trial record, or nothing.

    The channel is an observation, not an authority: a malformed record ends
    the live channel (the retained trial table still closes the study) rather
    than failing a run whose engine result is intact.
    """

    if not isinstance(value, dict):
        return None
    required = {"schema_version", "sequence", "kind", "trial", "state", "objective", "best_objective", "cpu_seconds"}
    if not required <= set(value) or set(value) - required - {"source_trial_id", "study_id"}:
        return None
    if ("source_trial_id" in value) != ("study_id" in value):
        return None
    for key in ("source_trial_id", "study_id"):
        if key in value and (not isinstance(value[key], str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,159}", value[key]) is None):
            return None
    if value.get("schema_version") != CHILD_PROGRESS_SCHEMA or value.get("kind") != "trial":
        return None
    sequence = value.get("sequence")
    trial = value.get("trial")
    if (
        not isinstance(sequence, int) or isinstance(sequence, bool) or sequence != expected_sequence
        or not isinstance(trial, int) or isinstance(trial, bool) or not 1 <= trial <= 100_000
        or value.get("state") not in {"COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"}
    ):
        return None
    for key in ("objective", "best_objective"):
        item = value.get(key)
        if item is not None and (not isinstance(item, str) or len(item) > 96 or not _SIGNED_DECIMAL.fullmatch(item)):
            return None
    cpu = value.get("cpu_seconds")
    if cpu is not None and (isinstance(cpu, bool) or not isinstance(cpu, (int, float)) or not 0 <= cpu < 1e9):
        return None
    return value


class _ChildProgressTail:
    """Read new complete lines from the child's progress file, bounded."""

    def __init__(self, path: Path, consumer: Callable[[dict[str, Any]], None]) -> None:
        self._path = path
        self._consumer = consumer
        self._offset = 0
        self._buffer = b""
        self._next_sequence = 1
        self._closed = False

    def drain(self) -> None:
        if self._closed:
            return
        try:
            descriptor = os.open(self._path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            return
        except OSError:
            self._closed = True  # e.g. a symlink planted in place of the file
            return
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode):
                self._closed = True
                return
            budget = CHILD_PROGRESS_MAX_BYTES - self._offset
            if budget <= 0:
                self._closed = True
                return
            os.lseek(descriptor, self._offset, os.SEEK_SET)
            chunk = os.read(descriptor, min(budget, max(0, info.st_size - self._offset)))
        finally:
            os.close(descriptor)
        self._offset += len(chunk)
        self._buffer += chunk
        while b"\n" in self._buffer:
            line, self._buffer = self._buffer.split(b"\n", 1)
            if len(line) > CHILD_PROGRESS_MAX_LINE_BYTES:
                self._closed = True
                return
            try:
                record = _valid_child_progress_record(json.loads(line.decode("utf-8")), self._next_sequence)
            except (UnicodeDecodeError, json.JSONDecodeError):
                record = None
            if record is None:
                self._closed = True
                return
            self._next_sequence += 1
            self._consumer(record)
        if len(self._buffer) > CHILD_PROGRESS_MAX_LINE_BYTES:
            self._closed = True


@dataclass(frozen=True, slots=True)
class _LaunchOutcome:
    launcher_pid: int
    child_pid: int
    network_namespace: str
    payload: dict[str, Any]
    elapsed_seconds: float
    peak_rss_bytes: int
    cpu_seconds: float
    enforced_limits: dict[str, int]


class IsolatedResearchSupervisor:
    """Start one real namespace-isolated, resource-limited P04 child."""

    _MAX_RESULT_BYTES = 32 * 1024
    _MAX_LOG_BYTES = 16 * 1024
    _MAX_WFO_OUTPUT_FILES = 64
    _MAX_WFO_OUTPUT_BYTES = 64 * 1024 * 1024

    def __init__(self, scratch_root: Path, *, allowed_market_root: Path) -> None:
        self._scratch_root = scratch_root.resolve()
        self._allowed_market_root = allowed_market_root.resolve(strict=True)
        self._scratch_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._unshare = shutil.which("unshare")
        if self._unshare is None:
            raise ResearchSupervisorError("P06 requires the host unshare utility for a real network namespace")

    @staticmethod
    def _opaque(value: str, label: str) -> None:
        if not value or len(value) > 160 or not value.replace("-", "").replace("_", "").replace(".", "").isalnum():
            raise ResearchSupervisorError(f"{label} is not an opaque bounded identifier")

    def _validate_launch_identity(self, *, job_id: str, run_id: str, worker_attempt_id: str, lease_epoch: int) -> None:
        for label, value in (("job_id", job_id), ("run_id", run_id), ("worker_attempt_id", worker_attempt_id)):
            self._opaque(value, label)
        if lease_epoch < 1:
            raise ResearchSupervisorError("lease_epoch must be positive")

    def retire_terminal_scratch(
        self, *, job_id: str, run_id: str, worker_attempt_id: str, lease_epoch: int
    ) -> bool:
        """Retire one finished child receipt after the durable worker commits terminal.

        The caller first proves its executor settled and this exact attempt is
        terminal in the durable ledger. The receipt check prevents an old
        lease from removing another child's scratch. The attempt ledger, not
        this disposable directory, remains the launch-once authority.
        """

        self._validate_launch_identity(
            job_id=job_id, run_id=run_id,
            worker_attempt_id=worker_attempt_id, lease_epoch=lease_epoch,
        )
        job_dir = self._scratch_root / job_id
        work = job_dir / worker_attempt_id
        if not work.exists():
            return False
        if work.is_symlink() or not work.is_dir() or job_dir.is_symlink():
            raise ResearchSupervisorError("terminal scratch is not a directory")
        receipt_path = work / "receipt.json"
        if receipt_path.is_symlink() or not receipt_path.is_file():
            raise ResearchSupervisorError("terminal scratch has no launch receipt")
        try:
            payload = json.loads(receipt_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchSupervisorError("terminal scratch launch receipt is invalid") from exc
        if (
            not isinstance(payload, dict)
            or payload.get("job_id") != job_id
            or payload.get("run_id") != run_id
            or payload.get("worker_attempt_id") != worker_attempt_id
            or payload.get("lease_epoch") != lease_epoch
        ):
            raise ResearchSupervisorError("terminal scratch launch identity changed")
        shutil.rmtree(work)
        try:
            job_dir.rmdir()  # Never remove another attempt's scratch.
        except OSError:
            pass
        return True

    def _approved_market_input(self, market_path: Path) -> Path:
        resolved = market_path.resolve(strict=True)
        if resolved.suffix != ".parquet" or not resolved.is_relative_to(self._allowed_market_root):
            raise ResearchSupervisorError("P06 child may read only an approved Parquet market input")
        return resolved

    def _approved_imported_source(self, source_path: Path, expected_digest: str) -> Path:
        if source_path.is_symlink():
            raise ResearchSupervisorError("E17 child source must not be a symlink")
        resolved = source_path.resolve(strict=True)
        info = resolved.stat()
        if (
            resolved.suffix != ".py"
            or not resolved.is_relative_to(self._allowed_market_root)
            or not stat.S_ISREG(info.st_mode)
            or info.st_size < 1
            or info.st_size > IMPORTED_ALPHA_MAX_SOURCE_BYTES
            or stat.S_IMODE(info.st_mode) & 0o077
        ):
            raise ResearchSupervisorError("E17 child source is not an approved bounded 0600 Python input")
        digest = hashlib.sha256(resolved.read_bytes()).hexdigest()
        if digest != expected_digest:
            raise ResearchSupervisorError("E17 child source digest does not match its immutable binding")
        return resolved

    def _assert_artifact_root(self, artifact_root: Path) -> None:
        if artifact_root.resolve().is_relative_to(self._scratch_root):
            raise ResearchSupervisorError("artifact_root must not be a child scratch location")

    def run_p04_delta_qualification(
        self,
        receipt: ResearchChildReceipt,
        *,
        limits: ResearchChildLimits = ResearchChildLimits(),
        on_child_alive: Callable[[], None] | None = None,
    ) -> ResearchChildResult:
        from portal_api.domain.research_native_profile import is_native_profile, native_profile
        native = receipt.execution_profile_id is not None and is_native_profile(receipt.execution_profile_id)
        limits.validate(recipe_profile_id=receipt.execution_profile_id if native else None)
        cap = native_profile(receipt.execution_profile_id,receipt.execution_profile_digest)['budgets'] if native else {'cpu_seconds':45,'wall_seconds':90}
        fields = ('memory_bytes','cpu_seconds','wall_seconds','scratch_bytes','file_bytes','fd_limit') if native else ('cpu_seconds','wall_seconds')
        if receipt.execution_profile_id is not None and any(getattr(limits, field) > cap[field] for field in fields):
            raise ResearchSupervisorError("observed fixed child cannot widen its admitted recipe resource caps")
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._assert_artifact_root(receipt.artifact_root)
        launch = self._launch(
            job_id=receipt.job_id,
            worker_attempt_id=receipt.worker_attempt_id,
            payload_for=lambda _work: receipt.as_payload(),
            expected_task="P04_DELTA_SMOKE",
            capture_is_qualification=receipt.source_windows is not None,
            limits=limits,
            on_child_alive=on_child_alive,
        )
        payload = launch.payload
        if native:
            facts = payload.get('native_execution')
            if (not isinstance(facts, dict) or facts.get('execution_route') != native_profile(receipt.execution_profile_id,receipt.execution_profile_digest)['descriptor']['execution_route']
                    or facts != payload.get('evidence_source',{}).get('source',{}).get('native_execution')):
                raise ResearchSupervisorError('native route result must match its exact retained child source')
        native_optimization_path=None
        if receipt.native_optimization is not None:
            from portal_api.services.research_native_optimization import verify
            summary=payload['native_execution'].get('optimization')
            native_optimization_path=self._scratch_root/receipt.job_id/receipt.worker_attempt_id/'native-optimizer-trials.parquet'
            if not isinstance(summary,dict) or summary.get('requested_trials')!=receipt.native_optimization['optuna_trials'] or summary.get('train_end_exclusive_utc_ms')!=receipt.oos_start_utc_ms:
                raise ResearchSupervisorError('native optimization source differs from admission')
            verify(native_optimization_path,summary)
        if receipt.execution_profile_id is not None:
            if (payload.get("execution_profile_id") != receipt.execution_profile_id
                    or payload.get("execution_profile_digest") != receipt.execution_profile_digest
                    or payload.get("source_observation") != receipt.source_observation):
                raise ResearchSupervisorError("fixed child did not retain the admitted observed source/profile identity")
        try:
            engine_version = str(payload["engine_version"])
            final_equity = float(payload["final_equity"])
            num_trades = int(payload["num_trades"])
            bars = int(payload["bars"])
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
        evidence_source = payload.get("evidence_source")
        expected_engine_version = "1.1.0" if receipt.qualification_binding is not None else "1.1.1"
        if engine_version != expected_engine_version or payload.get("qualification_binding") != receipt.qualification_binding:
            raise ResearchSupervisorError("fixed child engine/binding differs from the immutable launch pin")
        if evidence_source is not None:
            self._validate_evidence_source(evidence_source, expected_engine_version=expected_engine_version,
                expected_adapter_id='full03.delta-rsi.v1' if native else 'p04.delta-rsi.v1')
        fixed_replay_source, fixed_replay_path = self._validated_fixed_replay(payload, receipt)
        window_source, window_path = None, None
        if native:
            from portal_api.services.research_window_execution import read_rows, verify_source
            window_source = payload.get("window_execution_source")
            window_path = self._scratch_root / receipt.job_id / receipt.worker_attempt_id / "window-execution.parquet"
            if not isinstance(window_source, dict):
                raise ResearchSupervisorError("native child omitted window/execution custody")
            verify_source(window_source, read_rows(window_path))
        is_qualification_source, is_qualification_path = self._validated_is_qualification(payload, receipt)
        return ResearchChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            final_equity=final_equity,
            num_trades=num_trades,
            bars=bars,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=launch.peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            evidence_source=evidence_source if isinstance(evidence_source, dict) else None,
            native_execution=payload.get('native_execution') if native else None,
            native_optimization_path=native_optimization_path,
            window_execution_source=window_source,
            window_execution_path=window_path,
            fixed_replay_source=fixed_replay_source,
            fixed_replay_path=fixed_replay_path,
            is_qualification_source=is_qualification_source,
            is_qualification_path=is_qualification_path,
        )

    def run_imported_alpha_qualification(
        self,
        receipt: ImportedAlphaChildReceipt,
        *,
        limits: ResearchChildLimits = IMPORTED_ALPHA_CHILD_LIMITS,
        on_child_alive: Callable[[], None] | None = None,
    ) -> ResearchChildResult:
        limits.validate()
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._approved_imported_source(receipt.source_path, receipt.source_digest)
        self._assert_artifact_root(receipt.artifact_root)
        launch = self._launch(
            job_id=receipt.job_id,
            worker_attempt_id=receipt.worker_attempt_id,
            payload_for=lambda _work: receipt.as_payload(),
            expected_task="P17_IMPORTED_SIGNAL_NOTIONAL",
            capture_is_qualification=receipt.source_windows is not None,
            limits=limits,
            on_child_alive=on_child_alive,
        )
        payload = launch.payload
        try:
            engine_version = str(payload["engine_version"])
            final_equity = float(payload["final_equity"])
            num_trades = int(payload["num_trades"])
            bars = int(payload["bars"])
            source_digest = str(payload["source_digest"])
            profile_digest = str(payload["execution_profile_digest"])
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("E17 child returned an invalid bounded receipt") from error
        if source_digest != receipt.source_digest or profile_digest != IMPORTED_ALPHA_PROFILE_DIGEST:
            raise ResearchSupervisorError("E17 child did not execute the admitted source/profile identity")
        evidence_source = payload.get("evidence_source")
        if evidence_source is not None:
            self._validate_evidence_source(
                evidence_source,
                expected_adapter_id=IMPORTED_ALPHA_ADAPTER_ID,
            )
        fixed_replay_source, fixed_replay_path = self._validated_fixed_replay(payload, receipt)
        is_qualification_source, is_qualification_path = self._validated_is_qualification(payload, receipt)
        return ResearchChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            final_equity=final_equity,
            num_trades=num_trades,
            bars=bars,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=launch.peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            evidence_source=evidence_source if isinstance(evidence_source, dict) else None,
            imported_source_digest=source_digest,
            fixed_replay_source=fixed_replay_source,
            fixed_replay_path=fixed_replay_path,
            is_qualification_source=is_qualification_source,
            is_qualification_path=is_qualification_path,
        )

    def _validated_fixed_replay(
        self, payload: dict[str, Any], receipt: ResearchChildReceipt | ImportedAlphaChildReceipt,
    ) -> tuple[dict[str, Any] | None, Path | None]:
        from portal_api.services.research_fixed_replay import FILE_NAME, validate_source_metadata, verify_fixed_replay_file

        source = payload.get("fixed_replay_source")
        if source is None:
            if receipt.source_windows is not None:
                raise ResearchSupervisorError("fresh fixed child omitted its replay source availability")
            return None, None
        try:
            validate_source_metadata(source)
            oos = (receipt.source_windows or {}).get("oos", {})
            if source["oos_start_utc_ms"] != receipt.oos_start_utc_ms or source["oos_start_utc_ms"] != oos.get("start_ms") \
                    or source["oos_end_exclusive_utc_ms"] != oos.get("end_ms"):
                raise ValueError("fixed replay source bounds disagree with admitted OOS")
            path = self._scratch_root / receipt.job_id / receipt.worker_attempt_id / FILE_NAME
            if source["state"] == "NOT_PUBLISHED":
                if path.exists() or path.is_symlink():
                    raise ValueError("fixed replay absent source unexpectedly has a file")
                return source, None
            verify_fixed_replay_file(path, source)
            return source, path
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ResearchSupervisorError("fixed replay child source failed exact byte/row custody validation") from exc

    def _validated_is_qualification(
        self, payload: dict[str, Any], receipt: ResearchChildReceipt | ImportedAlphaChildReceipt,
    ) -> tuple[dict[str, Any] | None, Path | None]:
        source = payload.get("is_qualification_source")
        enabled = os.environ.get("RESEARCH_IS_QUALIFICATION_CAPTURE") == "true" and receipt.source_windows is not None
        if source is None and not enabled:
            unexpected = self._scratch_root / receipt.job_id / receipt.worker_attempt_id / "is-qualification.ndjson"
            if unexpected.exists() or unexpected.is_symlink():
                raise ResearchSupervisorError("disabled IS qualification unexpectedly produced a private witness")
            return None, None
        try:
            if not enabled or source is None or receipt.source_windows is None:
                raise ValueError("IS qualification does not match its server opt-in")
            from portal_api.services.research_is_qualification import (
                FILE_NAME, validate_is_qualification_metadata, verify_is_qualification_file,
            )
            validate_is_qualification_metadata(source)
            binding = {key: getattr(receipt, key) for key in ("run_id", "job_id", "worker_attempt_id", "lease_epoch")}
            admitted_is = receipt.source_windows["is"]
            if source["is_start_utc_ms"] != admitted_is["start_ms"] \
                    or source["is_end_exclusive_utc_ms"] != admitted_is["end_ms"] \
                    or source["binding_sha256"] != hashlib.sha256(json.dumps(binding,
                        sort_keys=True, separators=(",", ":")).encode()).hexdigest():
                raise ValueError("IS qualification metadata does not match admitted identity/windows")
            path = self._scratch_root / receipt.job_id / receipt.worker_attempt_id / FILE_NAME
            if source["state"] == "NOT_PUBLISHED":
                if path.exists() or path.is_symlink():
                    raise ValueError("absent IS qualification unexpectedly has a source file")
                return source, None
            verify_is_qualification_file(path, source,
                binding=binding,
                source_windows=receipt.source_windows)
            enriched = payload["evidence_source"]["enriched_analysis"]
            identities = [row for row in enriched["source_tables"] if row["name"] == "OBSERVATION_IS"]
            if len(identities) != 1 or identities[0]["digest"] != source["observation_is_digest"] \
                    or identities[0]["row_count"] != source["row_count"]:
                raise ValueError("IS qualification source does not bind the public IS observation identity")
            return source, path
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise ResearchSupervisorError("IS qualification failed private byte/identity/window validation") from exc

    def run_delta_wfo(
        self,
        receipt: DeltaWfoChildReceipt | PinnedAuditChildReceipt,
        *,
        limits: ResearchChildLimits = DELTA_WFO_CHILD_LIMITS,
        on_child_alive: Callable[[], None] | None = None,
        on_child_progress: Callable[[dict[str, Any]], None] | None = None,
    ) -> DeltaWfoChildResult:
        """Run the W1 Delta signal-notional WFO in the same P06 confinement.

        The child writes QuantBT's advanced WFO artifacts into ``output``, a
        sibling of its receipt on the real scratch filesystem (never the
        child's private tmpfs, which disappears with its mount namespace).
        The parent then refuses symlinks, non-regular files and any output
        beyond ``64`` files / ``64 MiB`` before a caller may read it.
        """

        full03_row = full03_recipe(receipt.execution_profile_id, receipt.execution_profile_digest) if is_full03_profile(receipt.execution_profile_id) else None
        limits.validate(recipe_profile_id=receipt.execution_profile_id if full03_row else None)
        if full03_row is not None and any(getattr(limits, field) > full03_row["budgets"][field]
                for field in ("memory_bytes", "cpu_seconds", "wall_seconds", "scratch_bytes", "file_bytes", "fd_limit")):
            raise ResearchSupervisorError("FULL-03 child cannot widen its exact recipe resource caps")
        if isinstance(receipt, PinnedAuditChildReceipt) and (
            limits.memory_bytes > 4 * 1024 ** 3 or limits.cpu_seconds > 120 or limits.wall_seconds > 240
            or limits.scratch_bytes > 128 * 1024 ** 2 or limits.file_bytes > 16 * 1024 ** 2
        ):
            raise ResearchSupervisorError("pinned final audit cannot widen its admitted resource caps")
        from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID
        causal_caps = execution_recipe(DELTA_CAUSAL_INNER_PROFILE_ID)["budgets"]
        if receipt.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID and (limits.cpu_seconds > causal_caps["cpu_seconds"] or limits.wall_seconds > causal_caps["wall_seconds"]):
            raise ResearchSupervisorError("causal inner child cannot widen its 120 CPU/240 wall-second profile caps")
        from portal_api.domain.research_full02_profiles import DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID
        if receipt.execution_profile_id in {DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID}:
            caps = execution_recipe(receipt.execution_profile_id)["budgets"]
            if any(getattr(limits, field) > caps[field] for field in ("memory_bytes", "cpu_seconds", "wall_seconds", "scratch_bytes", "file_bytes", "fd_limit")):
                raise ResearchSupervisorError("FULL-02 child cannot widen its exact recipe resource caps")
        self._validate_launch_identity(
            job_id=receipt.job_id,
            run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id,
            lease_epoch=receipt.lease_epoch,
        )
        self._approved_market_input(receipt.market_path)
        self._assert_artifact_root(receipt.artifact_root)
        if full03_row is not None and full03_row["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING":
            if not isinstance(receipt.imported_source, dict):
                raise ResearchSupervisorError("FULL05 child source is absent")
            self._approved_imported_source(Path(receipt.imported_source["source_path"]), receipt.imported_source["binding"]["source_digest"])
        output_holder: dict[str, Path] = {}

        def payload_for(work: Path) -> dict[str, Any]:
            output = work / "output"
            output.mkdir(mode=0o700)
            output_holder["output"] = output
            return receipt.as_payload(output_root=output)

        try:
            launch = self._launch(
                job_id=receipt.job_id,
                worker_attempt_id=receipt.worker_attempt_id,
                payload_for=payload_for,
                expected_task=receipt.task,
                limits=limits,
                on_child_alive=on_child_alive,
                on_child_progress=on_child_progress,
            )
            payload = launch.payload
            try:
                engine_version = str(payload["engine_version"])
                bars = int(payload["bars"])
                n_folds = int(payload["n_folds"])
                trial_rows = int(payload["trial_rows"])
                profile_digest = str(payload["execution_profile_digest"])
            except (KeyError, TypeError, ValueError) as error:
                raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
            peak_rss_bytes = launch.peak_rss_bytes
            if profile_digest != receipt.execution_profile_digest:
                raise ResearchSupervisorError("P06 WFO child did not run the admitted execution profile")
            if full03_row is not None:
                profile = full03_row["descriptor"]
                bounds = profile.get("fold_bounds") or {"min": 1, "max": 1}
                from portal_api.domain.research_trial_budget import child_study_trials, admitted_total_trials
                expected_trials = admitted_total_trials(full03_row, child_study_trials(
                    full03_row, receipt.as_payload(output_root=output_holder["output"])), n_folds)
                if (engine_version != "1.1.1" or not bounds["min"] <= n_folds <= bounds["max"]
                        or not 0 < bars <= full03_row["budgets"]["planning_max_bars"]
                        or (trial_rows != expected_trials if receipt.early_stopping is None else not 1 <= trial_rows <= expected_trials)):
                    raise ResearchSupervisorError("FULL-03 child returned incompatible exact recipe counts or engine")
            if receipt.execution_profile_id in {DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID}:
                minimum, maximum = (1, 1) if receipt.execution_profile_id == DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID else (2, 16)
                if (engine_version != "1.1.1" or not minimum <= n_folds <= maximum
                        or not 0 < bars <= 10_000
                        or (trial_rows != 3 * n_folds if receipt.early_stopping is None else not 1 <= trial_rows <= 3 * n_folds)):
                    raise ResearchSupervisorError("FULL-02 child returned incompatible profile counts or engine")
            output = output_holder["output"]
            files, total_bytes = self._validate_output_tree(output, run_id=receipt.run_id)
            audit_receipt = None
            if isinstance(receipt, PinnedAuditChildReceipt):
                audit_receipt = payload.get("audit_receipt")
                if (not isinstance(audit_receipt, dict)
                    or audit_receipt.get("target_digest") != receipt.expected_target_digest
                    or audit_receipt.get("run_id") != receipt.run_id
                    or audit_receipt.get("parent_run_id") != receipt.target.parent_run_id
                    or audit_receipt.get("optimizer_reinvoked") is not False
                    or type(audit_receipt.get("optimizer_trials")) is not int or audit_receipt["optimizer_trials"] != 0
                    or audit_receipt.get("parameters_digest") != audit_digest(receipt.target.parameters())
                    or audit_receipt.get("source_config_digest") != receipt.target.source_config_digest
                    or audit_receipt.get("source_selection_digest") != receipt.target.source_selection_digest
                    or audit_receipt.get("source_selection_kind") != receipt.target.source_selection_kind
                    or audit_receipt.get("source_selection_part_digest") != receipt.target.source_selection_part_digest
                    or audit_receipt.get("snapshot_id") != receipt.target.snapshot_id
                    or audit_receipt.get("snapshot_content_hash") != receipt.target.snapshot_content_hash
                    or audit_receipt.get("n_folds") != n_folds or audit_receipt.get("bars") != bars
                    or engine_version != receipt.target.engine_version or trial_rows != 0
                    or not 2 <= n_folds <= 16 or not 0 < bars <= 10000):
                    raise ResearchSupervisorError("pinned audit child did not attest its exact target and no-optimizer execution")
                document = json.loads((output / receipt.run_id / "audit/result.v1.json").read_text(encoding="utf-8"))
                persisted = {key: value for key, value in document.items() if key not in {"producer", "artifact_schema_version"}}
                if persisted != audit_receipt:
                    raise ResearchSupervisorError("pinned audit child receipt differs from its retained output")
        except BaseException:
            output = output_holder.get("output")
            if output is not None and output.exists():
                shutil.rmtree(output, ignore_errors=True)
            raise
        return DeltaWfoChildResult(
            launcher_pid=launch.launcher_pid,
            child_pid=launch.child_pid,
            network_namespace=launch.network_namespace,
            engine_version=engine_version,
            bars=bars,
            n_folds=n_folds,
            trial_rows=trial_rows,
            elapsed_seconds=launch.elapsed_seconds,
            peak_rss_bytes=peak_rss_bytes,
            cpu_seconds=launch.cpu_seconds,
            enforced_limits=launch.enforced_limits,
            output_root=output,
            output_files=files,
            output_bytes=total_bytes,
            audit_receipt=audit_receipt,
        )

    @classmethod
    def _validate_output_tree(cls, output: Path, *, run_id: str) -> tuple[int, int]:
        """Refuse a child output that is not a small tree of regular files."""

        if output.is_symlink() or not output.is_dir():
            raise ResearchSupervisorError("P06 WFO child output root is invalid")
        files = 0
        total = 0
        for directory, subdirectories, names in os.walk(output, followlinks=False):
            for name in (*subdirectories, *names):
                path = Path(directory) / name
                info = path.lstat()
                if stat.S_ISLNK(info.st_mode):
                    raise ResearchSupervisorError("P06 WFO child output contains a symlink")
                if stat.S_ISDIR(info.st_mode):
                    continue
                if not stat.S_ISREG(info.st_mode):
                    raise ResearchSupervisorError("P06 WFO child output contains a non-regular file")
                files += 1
                total += info.st_size
                if files > cls._MAX_WFO_OUTPUT_FILES or total > cls._MAX_WFO_OUTPUT_BYTES:
                    raise ResearchSupervisorError(
                        "P06 WFO child output exceeds its bounded file budget",
                        code="RESOURCE_EXCEEDED",
                    )
        entries = [entry.name for entry in output.iterdir()]
        if entries != [run_id] or not (output / run_id / "manifest.json").is_file():
            raise ResearchSupervisorError("P06 WFO child output is not one run artifact directory")
        return files, total

    def _launch(
        self,
        *,
        job_id: str,
        worker_attempt_id: str,
        payload_for: Callable[[Path], dict[str, Any]],
        expected_task: str,
        limits: ResearchChildLimits,
        on_child_alive: Callable[[], None] | None,
        on_child_progress: Callable[[dict[str, Any]], None] | None = None,
        capture_is_qualification: bool = False,
    ) -> _LaunchOutcome:
        work = self._scratch_root / job_id / worker_attempt_id
        if work.exists():
            raise ResearchSupervisorError("a P06 scratch receipt may be launched only once")
        work.mkdir(mode=0o700, parents=True)
        (work / "tmp").mkdir(mode=0o700)
        receipt_path = work / "receipt.json"
        result_path = work / "result.json"
        stdout_path = work / "stdout.log"
        stderr_path = work / "stderr.log"
        receipt_path.write_text(json.dumps(payload_for(work), sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
        os.chmod(receipt_path, 0o600)

        project_root = Path(__file__).resolve().parents[3]
        source_root = project_root / "src"
        strategy_root = project_root.parent
        environment = {
            "HOME": str(work),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "MKL_NUM_THREADS": "1",
            "NUMEXPR_NUM_THREADS": "1",
            "OMP_NUM_THREADS": "1",
            "OPENBLAS_NUM_THREADS": "1",
            "PATH": os.defpath,
            "PYTHONDONTWRITEBYTECODE": "1",
            "PYTHONNOUSERSITE": "1",
            "TMPDIR": str(work / "tmp"),
            "TZ": "UTC",
        }
        # Exact non-secret boolean, not an inherited environment capability.
        # WFO and legacy callers retain their original launch environment.
        if expected_task in {"P04_DELTA_SMOKE", "P17_IMPORTED_SIGNAL_NOTIONAL"} \
                and capture_is_qualification \
                and os.environ.get("RESEARCH_IS_QUALIFICATION_CAPTURE") == "true":
            environment["RESEARCH_IS_QUALIFICATION_CAPTURE"] = "true"
        if expected_task == "P04_DELTA_SMOKE" and json.loads(receipt_path.read_text()).get("qualification_binding") is not None:
            # Only this exact already-validated binding receives these two
            # non-secret local qualification switches; never inherited secrets.
            from portal_api.domain.research_engine_qualification import ENGINE_110_QUALIFICATION_BINDING_DIGEST
            environment["RESEARCH_ENGINE_QUALIFICATION_CHILD_BINDING_SHA256"] = ENGINE_110_QUALIFICATION_BINDING_DIGEST
        # `-I` ignores PYTHONPATH and the user site. The controlled bootstrap
        # adds only this repository's immutable source roots, rather than
        # inheriting a parent interpreter's arbitrary module search path.
        bootstrap = (
            "import resource, runpy, subprocess, sys; "
            # Set NPROC only after `unshare` has established the child user
            # namespace. Applying it in preexec made the fork needed by
            # `unshare -f` count unrelated host processes owned by the test
            # user and could falsely reject a healthy child on a busy host.
            "resource.setrlimit(resource.RLIMIT_NPROC, (128, 128)); "
            # The mount namespace is already private at this point. A tmpfs
            # mounted over the exact per-receipt scratch directory is the
            # aggregate scratch limit, rather than merely a per-file limit.
            "subprocess.run(['mount', '-t', 'tmpfs', '-o', 'size=' + sys.argv[5] + ',mode=0700', 'tmpfs', sys.argv[4]], check=True); "
            "sys.path[:0] = [sys.argv[1], sys.argv[2], sys.argv[3]]; "
            "sys.argv = ['research_child', *sys.argv[6:]]; "
            "runpy.run_module('portal_api.workers.research_child', run_name='__main__')"
        )
        command = [
            self._unshare,
            "-Urnmpf",
            "--mount-proc",
            sys.executable,
            "-I",
            "-c",
            bootstrap,
            str(source_root),
            str(project_root),
            str(strategy_root),
            str(work / "tmp"),
            str(limits.scratch_bytes),
            "--receipt",
            str(receipt_path),
            "--result",
            str(result_path),
        ]
        tail = _ChildProgressTail(work / CHILD_PROGRESS_FILENAME, on_child_progress) if on_child_progress else None
        # Without a progress consumer the loop keeps its original 5-second
        # cadence exactly; with one it wakes twice a second to tail the file.
        wait_step = CHILD_PROGRESS_POLL_SECONDS if tail is not None else _CHILD_HEARTBEAT_SECONDS
        before = resource.getrusage(resource.RUSAGE_CHILDREN)
        started = time.monotonic()
        with stdout_path.open("xb", buffering=0) as stdout, stderr_path.open("xb", buffering=0) as stderr:
            process = subprocess.Popen(
                command,
                cwd=work,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                start_new_session=True,
                preexec_fn=self._limit_preexec(limits),
            )
            try:
                if on_child_alive is not None and process.poll() is None:
                    on_child_alive()
                last_alive = time.monotonic()
                while True:
                    remaining = limits.wall_seconds - (time.monotonic() - started)
                    if remaining <= 0:
                        return_code = process.poll()
                        if return_code is not None:
                            break
                        raise subprocess.TimeoutExpired(command, limits.wall_seconds)
                    try:
                        return_code = process.wait(timeout=min(wait_step, remaining))
                        break
                    except subprocess.TimeoutExpired:
                        if tail is not None:
                            tail.drain()
                        if (
                            on_child_alive is not None and process.poll() is None
                            and time.monotonic() - last_alive >= _CHILD_HEARTBEAT_SECONDS - 1e-6
                        ):
                            last_alive = time.monotonic()
                            on_child_alive()
                if tail is not None:
                    # Records written just before exit are still facts.
                    tail.drain()
            except subprocess.TimeoutExpired as error:
                self._kill_process_group(process)
                raise ResearchSupervisorError("P06 child exceeded its wall-clock limit and was killed", code="RESOURCE_EXCEEDED") from error
            except Exception:
                self._kill_process_group(process)
                raise
        elapsed = time.monotonic() - started
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        if return_code != 0:
            if return_code == -signal.SIGXCPU:
                raise ResearchSupervisorError(
                    "P06 child exceeded its CPU limit and was killed",
                    code="RESOURCE_EXCEEDED",
                )
            stderr_tail = self._read_tail(stderr_path)
            # QuantBT/Optuna can wrap an OSError from its on-disk JIT cache in
            # RuntimeError before the isolated child exits. The bounded tail
            # still contains Python's errno line; never forward its traceback
            # (which may contain private paths or strategy parameters) into a
            # user-visible failure receipt.
            if _child_resource_exhausted(stderr_tail):
                raise ResearchSupervisorError(
                    "P06 child exhausted its disk or filesystem quota",
                    code="RESOURCE_EXCEEDED",
                )
            raise ResearchSupervisorError(
                f"P06 child exited {return_code}: {stderr_tail!r}"
            )
        payload = self._read_result(result_path)
        try:
            child_pid = int(payload["child_pid"])
            network_namespace = str(payload["network_namespace"])
            enforced_limits = {str(key): int(value) for key, value in dict(payload["enforced_limits"]).items()}
        except (KeyError, TypeError, ValueError) as error:
            raise ResearchSupervisorError("P06 child returned an invalid bounded receipt") from error
        if payload.get("task") != expected_task or payload.get("credential_environment_clean") is not True:
            raise ResearchSupervisorError("P06 child receipt did not prove its required boundary")
        expected_limits = {
            "address_space_bytes": limits.memory_bytes,
            "cpu_seconds": limits.cpu_seconds,
            "file_bytes": limits.file_bytes,
            "fd_limit": limits.fd_limit,
            "nproc_limit": 128,
            "scratch_bytes": limits.scratch_bytes,
        }
        if enforced_limits != expected_limits:
            raise ResearchSupervisorError("P06 child did not retain the exact bounded resource limits")
        return _LaunchOutcome(
            launcher_pid=process.pid,
            child_pid=child_pid,
            network_namespace=network_namespace,
            payload=payload,
            elapsed_seconds=elapsed,
            # ru_maxrss for RUSAGE_CHILDREN is a lifetime maximum, not an
            # additive counter. Subtracting it reports zero for later smaller
            # jobs. Every allowlisted task attests its own RUSAGE_SELF value.
            peak_rss_bytes=_child_peak_rss(payload, limits.memory_bytes),
            cpu_seconds=max(0.0, (after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime)),
            enforced_limits=enforced_limits,
        )

    @staticmethod
    def _validate_evidence_source(
        value: object,
        *,
        expected_adapter_id: str = "p04.delta-rsi.v1",
        expected_engine_version: str = "1.1.1",
    ) -> None:
        """Reject a malformed P13 receipt before it crosses P06's boundary.

        TypeScript repeats the full contract at Control ingress.  This cheap
        local shape check prevents a corrupt child result from being sealed
        into a P10 bundle or replayed forever by the durable journal.
        """

        if not isinstance(value, dict):
            raise ResearchSupervisorError("P06 child evidence receipt is invalid")
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        core = {key: item for key, item in value.items() if key != "enriched_analysis"}
        if len(json.dumps(core, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()) > 28 * 1024:
            raise ResearchSupervisorError("P06 child evidence receipt exceeds its bounded budget")
        enrichment = value.get("enriched_analysis")
        if enrichment is not None and (not isinstance(enrichment, dict)
                or enrichment.get("schema_version") != "research.enriched-analysis.v1"
                or len(json.dumps(enrichment, separators=(",", ":")).encode()) > 65_536):
            raise ResearchSupervisorError("P06 child enrichment is invalid or unbounded")
        if value.get("schema_version") != "research.p13.evidence-source.v1":
            raise ResearchSupervisorError("P06 child evidence receipt has an unsupported schema")
        source = value.get("source")
        direct = value.get("direct")
        derived = value.get("derived")
        points = value.get("equity_points")
        unavailable = value.get("unavailable")
        if not all(isinstance(item, dict) for item in (source, direct, derived, unavailable)) or not isinstance(points, list):
            raise ResearchSupervisorError("P06 child evidence receipt shape is invalid")
        if source.get("execution_adapter_id") != expected_adapter_id or source.get("engine_version") != expected_engine_version:
            raise ResearchSupervisorError("P06 child evidence receipt source identity is invalid")
        if not 1 <= len(points) <= 192 or source.get("emitted_equity_points") != len(points):
            raise ResearchSupervisorError("P06 child evidence receipt point count is invalid")
        if not isinstance(source.get("source_transform_digest"), str) or not re.fullmatch(r"[0-9a-f]{64}", source["source_transform_digest"]):
            raise ResearchSupervisorError("P06 child evidence receipt digest is invalid")
        overview = value.get("candle_overview")
        if overview is not None:
            IsolatedResearchSupervisor._validate_candle_overview(overview)
        # The hash is not persisted as a source of truth here; calculating it
        # confirms the JSON is canonicalizable before the worker receives it.
        hashlib.sha256(encoded).hexdigest()

    @staticmethod
    def _validate_candle_overview(overview: Any) -> None:
        """Accept the E16-R1 producer contract without relaxing old receipts.

        New children publish an availability envelope with at most 48 true
        OOS buckets and null execution markers. Legacy children published at
        most 12 raw buckets; their numeric position changes are not fills.
        The full evidence byte budget is checked by the caller above.
        """
        if not isinstance(overview, dict):
            raise ResearchSupervisorError("P06 child candle overview is invalid")
        canonical = "state" in overview
        keys = {"source_bar_count", "emitted_bucket_count", "bucket_bars", "sampling", "envelope", "values"}
        if canonical:
            keys |= {"state", "reason_code", "scope"}
        if set(overview) != keys:
            raise ResearchSupervisorError("P06 child candle overview shape is invalid")
        if canonical:
            if overview["scope"] != "OOS_EQUITY_WINDOW":
                raise ResearchSupervisorError("P06 child candle overview scope is invalid")
            if overview["state"] == "NOT_PUBLISHED":
                reason = overview["reason_code"]
                if (
                    not isinstance(reason, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]{2,159}", reason)
                    or any(overview[key] is not None for key in ("source_bar_count", "bucket_bars", "sampling", "envelope"))
                    or type(overview["emitted_bucket_count"]) is not int or overview["emitted_bucket_count"] != 0
                    or overview["values"] != []
                ):
                    raise ResearchSupervisorError("P06 child candle overview absence is invalid")
                return
            if overview["state"] != "AVAILABLE" or overview["reason_code"] is not None:
                raise ResearchSupervisorError("P06 child candle overview availability is invalid")
        rows = overview["values"]
        bucket_count, bucket_bars, source_bars = (overview[key] for key in ("emitted_bucket_count", "bucket_bars", "source_bar_count"))
        sampling = overview["sampling"]
        if (
            not isinstance(rows, list) or not 1 <= len(rows) <= (48 if canonical else 12)
            or type(bucket_count) is not int or bucket_count != len(rows)
            or type(bucket_bars) is not int or not 1 <= bucket_bars <= 2_000_000
            or type(source_bars) is not int or not len(rows) <= source_bars <= 2_000_000
            or (source_bars + bucket_bars - 1) // bucket_bars != bucket_count
            or sampling not in ("FULL", "OHLC_BUCKET_V1")
            or (sampling == "FULL") != (bucket_bars == 1)
        ):
            raise ResearchSupervisorError("P06 child candle overview bounds are invalid")
        decimal_pattern = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
        def exact_decimal(value: Any) -> Decimal:
            if not isinstance(value, str) or len(value) > 96 or not decimal_pattern.fullmatch(value):
                raise ResearchSupervisorError("P06 child candle overview decimal is invalid")
            return Decimal(value)
        def utc_ms(value: Any) -> bool:
            return type(value) is int and 0 <= value <= 9_007_199_254_740_991
        previous_last, previous_close_at = -1, -1
        extremes: list[tuple[Decimal, Decimal, int, int]] = []
        for row in rows:
            if not isinstance(row, dict) or set(row) != {
                "first_ordinal", "last_ordinal", "open_utc_ms", "close_utc_ms", "open", "high", "low", "close", "volume", "transitions",
            }:
                raise ResearchSupervisorError("P06 child candle overview row is invalid")
            first, last, open_at, close_at = (row[key] for key in ("first_ordinal", "last_ordinal", "open_utc_ms", "close_utc_ms"))
            if (
                type(first) is not int or type(last) is not int or first != previous_last + 1
                or not first <= last < source_bars or last - first + 1 > bucket_bars
                or not utc_ms(open_at) or not utc_ms(close_at) or open_at <= previous_close_at or close_at < open_at
            ):
                raise ResearchSupervisorError("P06 child candle overview chronology is invalid")
            transitions = row["transitions"]
            if (canonical and transitions is not None) or (
                not canonical and (type(transitions) is not int or not 0 <= transitions <= 2_000_000)
            ):
                raise ResearchSupervisorError("P06 child candle overview markers are invalid")
            open_price, high, low, close = (exact_decimal(row[key]) for key in ("open", "high", "low", "close"))
            if not low <= min(open_price, close) <= max(open_price, close) <= high:
                raise ResearchSupervisorError("P06 child candle overview OHLC range is invalid")
            if row["volume"] is not None:
                exact_decimal(row["volume"])
            extremes.append((high, low, open_at, close_at))
            previous_last, previous_close_at = last, close_at
        if previous_last != source_bars - 1:
            raise ResearchSupervisorError("P06 child candle overview source coverage is invalid")
        envelope = overview["envelope"]
        if not isinstance(envelope, dict) or set(envelope) != {"max_high", "min_low", "max_high_at_utc_ms", "min_low_at_utc_ms"}:
            raise ResearchSupervisorError("P06 child candle overview envelope is invalid")
        high, low = exact_decimal(envelope["max_high"]), exact_decimal(envelope["min_low"])
        high_at, low_at = envelope["max_high_at_utc_ms"], envelope["min_low_at_utc_ms"]
        if (
            high != max(item[0] for item in extremes) or low != min(item[1] for item in extremes)
            or not utc_ms(high_at) or not utc_ms(low_at)
            or not any(item[0] == high and item[2] <= high_at <= item[3] for item in extremes)
            or not any(item[1] == low and item[2] <= low_at <= item[3] for item in extremes)
        ):
            raise ResearchSupervisorError("P06 child candle overview envelope extrema are invalid")

    @staticmethod
    def _limit_preexec(limits: ResearchChildLimits):
        def apply() -> None:
            resource.setrlimit(resource.RLIMIT_AS, (limits.memory_bytes, limits.memory_bytes))
            resource.setrlimit(resource.RLIMIT_CPU, (limits.cpu_seconds, limits.cpu_seconds))
            resource.setrlimit(resource.RLIMIT_FSIZE, (limits.file_bytes, limits.file_bytes))
            resource.setrlimit(resource.RLIMIT_NOFILE, (limits.fd_limit, limits.fd_limit))
            # NPROC is applied in the bootstrap *inside* the isolated user
            # namespace (above), after `unshare -f` has completed. That keeps
            # the 128-process cap real without turning unrelated host PIDs
            # into a false admission failure.

        return apply

    @staticmethod
    def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=5)

    def _read_result(self, path: Path) -> dict[str, Any]:
        if not path.is_file() or path.stat().st_size > self._MAX_RESULT_BYTES + 65_536:
            raise ResearchSupervisorError("P06 child result is absent or exceeds the bounded receipt limit")
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict):
            raise ResearchSupervisorError("P06 child result must be a JSON object")
        core = dict(value)
        evidence = core.get("evidence_source")
        if isinstance(evidence, dict):
            core["evidence_source"] = {key: item for key, item in evidence.items() if key != "enriched_analysis"}
            enrichment = evidence.get("enriched_analysis")
            if enrichment is not None and len(json.dumps(enrichment, separators=(",", ":")).encode()) > 65_536:
                raise ResearchSupervisorError("P06 child enrichment exceeds its independent bound")
        if len(json.dumps(core, separators=(",", ":")).encode()) > self._MAX_RESULT_BYTES:
            raise ResearchSupervisorError("P06 child core result exceeds its original bounded receipt limit")
        return value

    def _read_tail(self, path: Path) -> str:
        if not path.is_file():
            return ""
        with path.open("rb") as handle:
            handle.seek(max(0, path.stat().st_size - self._MAX_LOG_BYTES))
            return handle.read(self._MAX_LOG_BYTES).decode("utf-8", errors="replace")


__all__ = [
    "DELTA_WFO_CHILD_LIMITS",
    "DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS",
    "DeltaWfoChildReceipt",
    "DeltaWfoChildResult",
    "IsolatedResearchSupervisor",
    "ResearchChildLimits",
    "ResearchChildReceipt",
    "ResearchChildResult",
    "ResearchSupervisorError",
]
