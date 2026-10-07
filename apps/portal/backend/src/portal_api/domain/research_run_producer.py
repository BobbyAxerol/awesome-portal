"""P10's private, bounded Research-run intake contract.

This model is deliberately separate from :class:`PortalRunRequest`.  The
legacy request remains the public compatibility format; this contract is only
accepted after Control API has attached a short-lived signed internal
principal.  It carries immutable identifiers and digests, never a source path,
raw candle row, credential or generic Python entrypoint.
"""

from __future__ import annotations

import json
import hashlib
import math
import re
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import Field, model_serializer, model_validator

from .requests import PortalModel
from .research_early_stopping import admitted_early_stopping
from .research_delta_wfo_profile import (
    DELTA_WFO_MAX_SPAN_DAYS,
    DELTA_WFO_PROFILE,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
    P04_FIXED_QUALIFICATION_PROFILE_ID,
    DeltaWfoPreviewLongMisconfigured,
    delta_wfo_admitted_trials,
    delta_wfo_preview_long_enabled,
)
from .research_imported_alpha_profile import (
    IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    IMPORTED_ALPHA_ADAPTER_ID,
    IMPORTED_ALPHA_PROFILE,
    IMPORTED_ALPHA_PROFILE_DIGEST,
    IMPORTED_ALPHA_PROFILE_ID,
)
from .research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST, temporal_controls
from .research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST, DELTA_CAUSAL_INNER_PROFILE, causal_inner_controls
from .research_full02_profiles import (
    DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST, DELTA_PER_FOLD_DECAY_PROFILE,
    DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE,
    per_fold_decay_controls,
)
from .research_execution_recipes import execution_recipe, recipe_digest
from .research_full03_profiles import full03_recipe, full03_controls, is_full03_profile
from .research_native_profile import is_native_profile, native_profile, validate_native_spec, native_work_digest
from .research_whatif_profile import WHATIF_MAX_EVALUATIONS, WHATIF_PROFILE_DIGEST, WHATIF_PROFILE_ID
from .research_final_audit import (
    PinnedSelectionAuditTarget, PINNED_FINAL_AUDIT_PROFILE_ID,
    PINNED_FINAL_AUDIT_PROFILE_DIGEST, audit_digest,
)
from .research_vn_observed_fixed_profile import (
    VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST,
    validate_vn_observed_fixed_spec, vn_source_instant, vn_observed_fixed_profile,
)


_IDENTIFIER = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$"
_OPAQUE = r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"
_DIGEST = r"^[0-9a-f]{64}$"
_PREFLIGHT = r"^rpft_[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"
_SNAPSHOT = r"^dss_[0-9a-f]{32}$"
_PARAMETER_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_EXACT_DECIMAL = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")

_P04_DELTA_FIXED_PARAMETERS: dict[str, int | float] = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}


class WhatIfEvaluation(PortalModel):
    """One admitted what-if configuration: the full exact parameter map."""

    evaluation_key: str = Field(pattern=_DIGEST)
    parameters: Annotated[dict[str, str], Field(min_length=1, max_length=24)]

    @model_validator(mode="after")
    def validate_exact_decimals(self) -> "WhatIfEvaluation":
        for name, value in self.parameters.items():
            if not _PARAMETER_NAME.fullmatch(name) or not _EXACT_DECIMAL.fullmatch(value):
                raise ValueError("a what-if evaluation carries exact decimal parameters only")
        return self


class WhatIfJob(PortalModel):
    """W5a A10c: the bounded evaluation list of one what-if diagnostic job."""

    schema_version: Literal["research.whatif-job.v1"]
    parent_run_id: str = Field(pattern=_OPAQUE, max_length=160)
    grid_key: str = Field(pattern=_DIGEST)
    evaluations: Annotated[list[WhatIfEvaluation], Field(min_length=1, max_length=WHATIF_MAX_EVALUATIONS)]

    @model_validator(mode="after")
    def validate_unique_keys(self) -> "WhatIfJob":
        keys = [entry.evaluation_key for entry in self.evaluations]
        if len(set(keys)) != len(keys):
            raise ValueError("a what-if job evaluates each key exactly once")
        return self


class VnSourceObservation(PortalModel):
    """Private, immutable observed-date metadata; not calendar/venue authority."""
    dataset_id: Literal["vn-stock-daily"]
    symbol: Literal["FPT"]
    timeframe: Literal["1d"]
    clock_basis: Literal["OBSERVED_SOURCE_LOCAL_DATE_V1"]
    source_timezone: Literal["Asia/Ho_Chi_Minh"]
    metadata_index_revision: str = Field(pattern=_DIGEST)
    metadata_index_source_manifest_digest: str = Field(pattern=_DIGEST)
    metadata_index_as_of_utc_ms: int = Field(strict=True, ge=0, le=8_640_000_000_000_000)
    warmup_semantics: Literal["LAST_N_OBSERVED_PREDECESSORS_V1"]
    warmup_start_utc_ms: int = Field(strict=True, ge=0, le=8_640_000_000_000_000)


class ResearchRunProducerEnvelope(PortalModel):
    """The server-owned P08/P10 immutable facts needed by the worker."""

    schema_version: Literal["research.run-producer.v1"]
    client_intent_id: str = Field(pattern=_IDENTIFIER, min_length=3, max_length=191)
    # W5a A10c: DIAGNOSTIC exists only as the what-if profile (Control API
    # pins the pair in PostgreSQL); every other request stays NEW.
    intent_kind: Literal["NEW", "DIAGNOSTIC"]
    preflight_token: str = Field(pattern=_PREFLIGHT, max_length=191)
    requested_spec: dict[str, Any] = Field(min_length=1, max_length=64)
    requested_spec_digest: str = Field(pattern=_DIGEST)
    effective_spec_digest: str = Field(pattern=_DIGEST)
    dataset_binding_digest: str = Field(pattern=_DIGEST)
    manifest_digest: str = Field(pattern=_DIGEST)
    snapshot_id: str = Field(pattern=_SNAPSHOT)
    snapshot_content_hash: str = Field(pattern=_DIGEST)
    alpha_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    alpha_version_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    execution_adapter_id: Literal["p04.delta-rsi.v1", "p17.imported-signal-notional.v1", "full03.delta-rsi.v1"]
    adapter_contract_digest: str = Field(pattern=_DIGEST)
    qualification_binding: dict[str, Any] | None = Field(default=None, max_length=16)
    # W1 §1.1: absent ⇒ the unchanged P04 fixed qualification.  The P04 wire
    # never carries these two fields (see the serializer below), so the P04
    # durable request, its spec digest and the child receipt stay byte-equal.
    execution_profile_id: str = Field(default=P04_FIXED_QUALIFICATION_PROFILE_ID, pattern=_IDENTIFIER, max_length=191)
    execution_profile_digest: str | None = Field(default=None, pattern=_DIGEST)
    p04_parameters: Annotated[dict[str, int | float], Field(min_length=8, max_length=8)] | None = None
    imported_source_digest: str | None = Field(default=None, pattern=_DIGEST)
    imported_entrypoint: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9_]{0,127}$")
    imported_parameters: Annotated[
        dict[str, str | int | float | bool], Field(max_length=12)
    ] | None = None
    imported_search_binding: dict[str, Any] | None = Field(default=None, max_length=7)
    work_digest: str = Field(pattern=_DIGEST)
    whatif: WhatIfJob | None = None
    final_audit_target: PinnedSelectionAuditTarget | None = None
    final_audit_target_digest: str | None = Field(default=None, pattern=_DIGEST)
    source_observation: VnSourceObservation | None = None

    @property
    def is_vn_observed_fixed(self) -> bool:
        return self.execution_profile_id == VN_OBSERVED_FIXED_PROFILE_ID

    @property
    def is_native_fixed(self) -> bool:
        return is_native_profile(self.execution_profile_id)

    @property
    def is_delta_wfo(self) -> bool:
        return self.is_full03 or self.execution_profile_id in (DELTA_WFO_PROFILE_ID, DELTA_WFO_V2_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_ID,
            DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID)

    @property
    def is_three_window_optimized(self) -> bool:
        return self.execution_profile_id == DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID or (
            self.is_full03 and execution_recipe(self.execution_profile_id)["descriptor"]["protocol"] == "three_window_decay")

    @property
    def is_full03(self) -> bool:
        return is_full03_profile(self.execution_profile_id)

    @property
    def is_whatif(self) -> bool:
        return self.execution_profile_id == WHATIF_PROFILE_ID

    @property
    def is_final_audit(self) -> bool:
        return self.execution_profile_id == PINNED_FINAL_AUDIT_PROFILE_ID

    @property
    def is_imported_alpha(self) -> bool:
        return self.execution_profile_id == IMPORTED_ALPHA_PROFILE_ID or self.is_imported_search

    @property
    def is_imported_search(self) -> bool:
        try:
            return execution_recipe(self.execution_profile_id)["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING"
        except ValueError:
            return False

    @model_serializer(mode="wrap")
    def _serialize_without_p04_profile_fields(self, handler: Any) -> dict[str, Any]:
        data = handler(self)
        if self.execution_profile_id == P04_FIXED_QUALIFICATION_PROFILE_ID and self.execution_profile_digest is None:
            data.pop("execution_profile_id", None)
            data.pop("execution_profile_digest", None)
        if self.p04_parameters is None:
            data.pop("p04_parameters", None)
        if self.whatif is None:
            data.pop("whatif", None)
        if self.final_audit_target is None:
            data.pop("final_audit_target", None)
        if self.final_audit_target_digest is None:
            data.pop("final_audit_target_digest", None)
        if self.source_observation is None:
            data.pop("source_observation", None)
        if self.imported_source_digest is None:
            data.pop("imported_source_digest", None)
        if self.imported_entrypoint is None:
            data.pop("imported_entrypoint", None)
        if self.imported_parameters is None:
            data.pop("imported_parameters", None)
        if self.imported_search_binding is None:
            data.pop("imported_search_binding", None)
        if self.qualification_binding is None:
            data.pop("qualification_binding", None)
        return data

    @model_validator(mode="after")
    def validate_bounded_requested_spec(self) -> "ResearchRunProducerEnvelope":
        # Registry identity is bounded and image-owned; arbitrary strings are
        # never a route to an unknown adapter or the legacy default profile.
        execution_recipe(self.execution_profile_id)
        admitted_early_stopping(self.requested_spec,
            optimizing=execution_recipe(self.execution_profile_id)["public_profile"]["trial_count"]["max"] > 1)
        encoded = json.dumps(
            self.requested_spec,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        if len(encoded) > 60 * 1024:
            raise ValueError("requested_spec exceeds the bounded private producer contract")
        binding = self.requested_spec.get("alpha_binding")
        if not isinstance(binding, dict):
            raise ValueError("requested_spec must retain its explicit AlphaVersion binding")
        if binding.get("alpha_id") != self.alpha_id or binding.get("alpha_version_id") != self.alpha_version_id:
            raise ValueError("requested_spec AlphaVersion does not match the immutable producer binding")
        if self.requested_spec.get("strategy_id") != self.alpha_id:
            raise ValueError("requested_spec strategy_id does not match the immutable Alpha identity")
        from .research_engine_qualification import validate_engine_qualification_binding
        client = self.requested_spec.get("client")
        release_id = client.get("engine_release_id") if isinstance(client, dict) else None
        if release_id == "er_quantbt_110" or self.qualification_binding is not None:
            validate_engine_qualification_binding(self.qualification_binding, release_id=release_id,
                profile_id=self.execution_profile_id, adapter_contract_digest=self.adapter_contract_digest)
            if (self.requested_spec.get("schema_version") != "research.requested-spec.v1"
                    or self.requested_spec.get("data") != {"dataset_id": "crypto-binance-1m", "symbol": "BTCUSDT", "timeframe": "1h"}
                    or self.requested_spec.get("optuna_trials") != 1 or self.requested_spec.get("early_stopping") is not None
                    or self.requested_spec.get("random_seed") is not None
                    or self.requested_spec.get("optimization_config") not in ({}, None)
                    or self.requested_spec.get("parameter_space_overrides") != []):
                raise ValueError("ENGINE_QUALIFICATION_FIXED_PROFILE_ONLY")
        if self.is_final_audit:
            self._validate_final_audit_profile()
            return self
        if self.final_audit_target is not None or self.final_audit_target_digest is not None:
            raise ValueError("a frozen audit target cannot enter another execution profile")
        if self.is_vn_observed_fixed:
            profile = vn_observed_fixed_profile()
            validate_vn_observed_fixed_spec(self.requested_spec)
            if (self.execution_profile_digest != VN_OBSERVED_FIXED_PROFILE_DIGEST
                    or self.execution_adapter_id != profile["adapter_id"]
                    or self.adapter_contract_digest != profile["adapter_contract_digest"]
                    or self.intent_kind != "NEW" or self.whatif is not None or self.source_observation is None
                    or self.imported_source_digest is not None or self.imported_entrypoint is not None
                    or self.imported_parameters is not None or self.p04_parameters != _P04_DELTA_FIXED_PARAMETERS
                    or any(isinstance(value, bool) for value in (self.p04_parameters or {}).values())):
                raise ValueError("VN observed fixed producer does not match its immutable installed pins")
            if self.source_observation.warmup_start_utc_ms >= int(vn_source_instant(self.requested_spec["windows"]["is"]["start"]).timestamp() * 1000):
                raise ValueError("VN observed warmup must precede declared IS")
            if hashlib.sha256(encoded).hexdigest() != self.requested_spec_digest:
                raise ValueError("VN observed requested spec digest does not match its retained bytes")
            work = {"schema_version": "research.p10.vn-observed-fixed-work.v1",
                "requested_spec_digest": self.requested_spec_digest, "effective_spec_digest": self.effective_spec_digest,
                "dataset_binding_digest": self.dataset_binding_digest, "manifest_digest": self.manifest_digest,
                "snapshot": {"snapshot_id": self.snapshot_id, "snapshot_content_hash": self.snapshot_content_hash},
                "alpha": {"alpha_id": self.alpha_id, "alpha_version_id": self.alpha_version_id,
                    "adapter_id": self.execution_adapter_id, "adapter_contract_digest": self.adapter_contract_digest,
                    "fixed_parameters": self.p04_parameters},
                "execution_profile": {"profile_id": self.execution_profile_id, "profile_digest": self.execution_profile_digest},
                "source_observation": self.source_observation.model_dump(mode="json"),
                "engine_release_id": self.requested_spec["client"]["engine_release_id"], "requested_spec": self.requested_spec}
            if hashlib.sha256(json.dumps(work, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() != self.work_digest:
                raise ValueError("VN observed work digest does not match its immutable source/profile binding")
            return self
        if self.source_observation is not None:
            raise ValueError("source observation metadata cannot enter another execution profile")
        if self.execution_profile_id == WHATIF_PROFILE_ID:
            # The what-if diagnostic re-runs its parent's exact WFO request:
            # same spec, same data, same seed; only its evaluations differ.
            if self.intent_kind != "DIAGNOSTIC" or self.whatif is None:
                raise ValueError("the what-if profile is a DIAGNOSTIC intent carrying its evaluations")
            if self.execution_profile_digest != WHATIF_PROFILE_DIGEST:
                raise ValueError("the what-if execution profile digest does not match the installed profile")
            self._validate_delta_wfo_spec()
            return self
        if self.intent_kind != "NEW" or self.whatif is not None:
            raise ValueError("only the what-if profile is a DIAGNOSTIC intent with evaluations")
        if self.is_native_fixed:
            row = native_profile(self.execution_profile_id, self.execution_profile_digest)
            validate_native_spec(self.requested_spec, row)
            p = row['descriptor']['alpha_binding_requirements']
            if (self.alpha_id != p['alpha_id'] or self.alpha_version_id != p['alpha_version_id']
                    or self.execution_adapter_id != p['adapter_id'] or self.adapter_contract_digest != p['adapter_contract_digest']
                    or self.p04_parameters != _P04_DELTA_FIXED_PARAMETERS
                    or any(value is not None for value in (self.qualification_binding, self.imported_source_digest,
                        self.imported_entrypoint, self.imported_parameters, self.imported_search_binding))
                    or any(type(v) not in (int, float) for v in (self.p04_parameters or {}).values())
                    or hashlib.sha256(encoded).hexdigest() != self.requested_spec_digest
                    or native_work_digest(self) != self.work_digest):
                raise ValueError('native producer must carry exact installed Delta parameters and immutable work/profile pins')
            return self
        if self.is_full03:
            self._validate_full03_spec()
            if not self.is_imported_search:
                self._validate_full02_work(encoded)
            return self
        if self.imported_search_binding is not None:
            raise ValueError("FULL05 declaration cannot enter another execution profile")
        if self.execution_profile_id == DELTA_WFO_PROFILE_ID:
            self._validate_delta_wfo_profile()
            return self
        if self.execution_profile_id == DELTA_WFO_V2_PROFILE_ID:
            if self.execution_profile_digest != DELTA_WFO_V2_PROFILE_DIGEST:
                raise ValueError("the temporal executor digest does not match its installed profile")
            temporal_controls(self.requested_spec)
            self._validate_delta_wfo_spec(temporal=True)
            return self
        if self.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID:
            if self.execution_profile_digest != DELTA_CAUSAL_INNER_PROFILE_DIGEST:
                raise ValueError("the causal inner executor digest does not match its installed profile")
            causal_inner_controls(self.requested_spec)
            self._validate_delta_wfo_spec(temporal=True, causal=True)
            return self
        if self.execution_profile_id == DELTA_PER_FOLD_DECAY_PROFILE_ID:
            if self.execution_profile_digest != DELTA_PER_FOLD_DECAY_PROFILE_DIGEST:
                raise ValueError("the per-fold-decay executor digest does not match its installed profile")
            per_fold_decay_controls(self.requested_spec)
            self._validate_delta_wfo_spec(temporal=True, per_fold_decay=True)
            self._validate_full02_work(encoded)
            return self
        if self.is_three_window_optimized:
            self._validate_three_window_optimized()
            self._validate_full02_work(encoded)
            return self
        if self.execution_profile_id == IMPORTED_ALPHA_PROFILE_ID:
            self._validate_imported_alpha_profile()
            return self
        if self.execution_profile_digest is not None:
            raise ValueError("the P04 fixed qualification profile carries no execution profile digest")
        validate_engine_qualification_binding(self.qualification_binding, release_id=release_id,
            profile_id=self.execution_profile_id, adapter_contract_digest=self.adapter_contract_digest)
        if self.p04_parameters is None:
            raise ValueError("P10 must retain exactly the installed P04 parameter map")
        if self.requested_spec.get("execution_route") != "signal_notional":
            raise ValueError("the installed P10 adapter accepts only signal_notional")
        if self.requested_spec.get("protocol") != "three_window_decay":
            raise ValueError("the installed P10 adapter accepts only three_window_decay")
        if set(self.p04_parameters) != set(_P04_DELTA_FIXED_PARAMETERS):
            raise ValueError("P10 must retain exactly the installed P04 parameter map")
        for key, expected in _P04_DELTA_FIXED_PARAMETERS.items():
            actual = self.p04_parameters.get(key)
            if isinstance(actual, bool) or not isinstance(actual, (int, float)) or actual != expected:
                raise ValueError("P10 parameter map does not match the installed P04 profile")
        windows = self.requested_spec.get("windows")
        if not isinstance(windows, dict) or not all(isinstance(windows.get(name), dict) for name in ("is", "oos", "holdout")):
            raise ValueError("requested_spec must retain three-window boundaries")
        return self

    def _validate_final_audit_profile(self) -> None:
        target = self.final_audit_target
        if (target is None or self.intent_kind != "DIAGNOSTIC"
                or self.execution_profile_digest != PINNED_FINAL_AUDIT_PROFILE_DIGEST
                or self.final_audit_target_digest != target.target_digest()
                or target.source_selection_kind != "P05_SELECTION_PARAMETERS_JSON"
                or self.whatif is not None or self.p04_parameters is not None
                or self.source_observation is not None or self.imported_source_digest is not None
                or self.imported_entrypoint is not None or self.imported_parameters is not None):
            raise ValueError("AUDIT_EXACT_RETAINED_TARGET_AND_PROFILE_REQUIRED")
        for field_name in ("alpha_version_id", "execution_adapter_id", "adapter_contract_digest",
                "dataset_binding_digest", "snapshot_id", "snapshot_content_hash"):
            if getattr(self, field_name) != getattr(target, field_name):
                raise ValueError("AUDIT_PRODUCER_TARGET_PIN_MISMATCH")
        spec = self.requested_spec
        source = target.source_request()
        if (spec.get("client", {}).get("engine_release_id") != target.engine_release_id
                or spec.get("execution_route") != "signal_notional" or spec.get("protocol") != "advanced"
                or spec.get("random_seed") != source.calibration.random_seed
                or spec.get("data", {}).get("dataset_id") != source.dataset_id
                or spec.get("data", {}).get("symbol") != source.symbol
                or spec.get("data", {}).get("timeframe") != source.timeframe):
            raise ValueError("AUDIT_ORIGINAL_REQUEST_BINDING_REQUIRED")
        encoded = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        if hashlib.sha256(encoded).hexdigest() != self.requested_spec_digest:
            raise ValueError("AUDIT_ORIGINAL_REQUEST_DIGEST_MISMATCH")
        if self.work_digest != audit_digest({"schema_version": "research.pinned-audit-work.v1",
                "target_digest": self.final_audit_target_digest,
                "requested_spec_digest": self.requested_spec_digest,
                "effective_spec_digest": self.effective_spec_digest,
                "profile_digest": PINNED_FINAL_AUDIT_PROFILE_DIGEST}):
            raise ValueError("AUDIT_PRODUCER_WORK_DIGEST_MISMATCH")

    def _validate_imported_alpha_profile(self) -> None:
        profile = IMPORTED_ALPHA_PROFILE
        if self.execution_profile_digest != IMPORTED_ALPHA_PROFILE_DIGEST:
            raise ValueError("the imported Alpha execution profile digest does not match the installed profile")
        if (
            self.execution_adapter_id != IMPORTED_ALPHA_ADAPTER_ID
            or self.adapter_contract_digest != IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST
        ):
            raise ValueError("the imported Alpha execution profile is not bound to its installed adapter")
        if not self.imported_source_digest or not self.imported_entrypoint or self.imported_parameters is None:
            raise ValueError("the imported Alpha execution profile requires exact source identity and declared pins")
        if self.p04_parameters is not None or self.whatif is not None:
            raise ValueError("the imported Alpha execution profile cannot carry P04 or what-if inputs")
        for name, value in self.imported_parameters.items():
            if not _PARAMETER_NAME.fullmatch(name) or isinstance(value, (dict, list)):
                raise ValueError("the imported Alpha parameter map contains an invalid scalar")
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("the imported Alpha parameter map contains a non-finite number")
        spec = self.requested_spec
        if (
            spec.get("schema_version") != "research.requested-spec.v1"
            or spec.get("execution_route") != profile["execution_route"]
            or spec.get("protocol") != profile["protocol"]
            or not isinstance(spec.get("windows"), dict)
            or spec.get("walk_forward") is not None
            or spec.get("optuna_trials") != 1
        ):
            raise ValueError("the imported Alpha profile accepts only one fixed three-window signal-notional run")
        client = spec.get("client")
        if not isinstance(client, dict) or client.get("engine_release_id") != profile["engine_release_id"]:
            raise ValueError("the imported Alpha profile is bound to QuantBT 1.1.1")

    def _validate_delta_wfo_profile(self) -> None:
        """Accept only the exact W1 §1.1 Delta signal-notional WFO profile."""

        if self.execution_profile_digest != DELTA_WFO_PROFILE_DIGEST:
            raise ValueError("the Delta WFO execution profile digest does not match the installed profile")
        self._validate_delta_wfo_spec()

    def _validate_delta_wfo_spec(self, *, temporal: bool = False, causal: bool = False, per_fold_decay: bool = False) -> None:
        """The locked W1 requested-spec shape (shared by the WFO and what-if profiles)."""

        profile = DELTA_CAUSAL_INNER_PROFILE if causal else DELTA_PER_FOLD_DECAY_PROFILE if per_fold_decay else DELTA_WFO_PROFILE
        spec = self.requested_spec
        if self.p04_parameters is not None:
            raise ValueError("the Delta WFO profile searches its parameters and carries no P04 parameter map")
        if self.execution_adapter_id != profile["adapter_id"] or self.adapter_contract_digest != profile["adapter_contract_digest"]:
            raise ValueError("the Delta WFO profile is bound to the installed P04 Delta adapter contract")
        if spec.get("execution_route") != profile["execution_route"]:
            raise ValueError("the Delta WFO profile accepts only signal_notional")
        if spec.get("protocol") != profile["protocol"]:
            raise ValueError("the Delta WFO profile accepts only the advanced protocol")
        if "windows" in spec:
            raise ValueError("the Delta WFO profile forbids three-window boundaries")
        try:
            preview_long = False if causal or per_fold_decay else delta_wfo_preview_long_enabled()
        except DeltaWfoPreviewLongMisconfigured as exc:
            raise ValueError(str(exc)) from exc
        if preview_long:
            # Research preview only: 2..400 trials, the seed and all else locked.
            delta_wfo_admitted_trials(spec)
        elif spec.get("optuna_trials") != (profile["trial_count"]["min"] if causal or per_fold_decay else profile["optuna_trials"]) or isinstance(spec.get("optuna_trials"), bool):
            raise ValueError("the Delta WFO profile accepts exactly 3 Optuna trials")
        if spec.get("random_seed") != profile["random_seed"] or isinstance(spec.get("random_seed"), bool):
            raise ValueError("the Delta WFO profile accepts exactly random seed 42")
        if spec.get("optimization_mode") != profile["optimization_mode"] or spec.get("optimization_schedule") != profile["optimization_schedule"]:
            raise ValueError("the Delta WFO profile accepts only mode_1_decay/global")
        if (causal or per_fold_decay) and (spec.get("optimization_config") or spec.get("route_params")):
            raise ValueError("per-fold execution admits no optimizer or route overrides")
        _validate_sibling_pins(spec.get("parameter_space_overrides"))
        data = spec.get("data")
        if not isinstance(data, dict) or data.get("timeframe") != profile["timeframe"]:
            raise ValueError("the Delta WFO profile accepts only the 1h timeframe")
        client = spec.get("client")
        if not isinstance(client, dict) or client.get("engine_release_id") != profile["engine_release_id"]:
            raise ValueError("the Delta WFO profile is bound to engine release er_quantbt_111")
        walk_forward = spec.get("walk_forward")
        if not isinstance(walk_forward, dict):
            raise ValueError("requested_spec must retain its walk_forward boundaries")
        if not temporal and (walk_forward.get("frequency") != profile["frequency"] or walk_forward.get("window_mode") != profile["window_mode"]):
            raise ValueError("the Delta WFO profile accepts only weekly expanding folds")
        start = _utc_instant(walk_forward.get("start"), "walk_forward start")
        end = _utc_instant(walk_forward.get("end_exclusive"), "walk_forward end")
        split = _utc_instant(walk_forward.get("split_mode"), "walk_forward split_mode")
        if not start < split < end:
            raise ValueError("the Delta WFO first OOS boundary must lie strictly inside the walk-forward span")
        if (end - start).total_seconds() > DELTA_WFO_MAX_SPAN_DAYS * 86_400:
            raise ValueError("the Delta WFO span exceeds the admitted 92 days")

    def _validate_full03_spec(self) -> None:
        row = full03_recipe(self.execution_profile_id, self.execution_profile_digest)
        if self.is_imported_search:
            self._validate_imported_search_spec(row)
            return
        p, spec = row["descriptor"], self.requested_spec
        requirement = p["alpha_binding_requirements"]
        client = spec.get("client")
        if (self.alpha_id != requirement["alpha_id"] or self.alpha_version_id != requirement["alpha_version_id"]
                or self.execution_adapter_id != requirement["adapter_id"]
                or self.adapter_contract_digest != requirement["adapter_contract_digest"]
                or any(value is not None for value in (self.p04_parameters, self.imported_parameters,
                    self.imported_source_digest, self.imported_entrypoint, self.qualification_binding))
                or spec.get("schema_version") != p["requested_spec_version"]
                or spec.get("protocol") != p["protocol"] or spec.get("execution_route") != p["execution_route"]
                or spec.get("optimization_mode") != p["optimization_mode"]
                or spec.get("optimization_schedule") != p["optimization_schedule"]
                or type(spec.get("optuna_trials")) is not int
                or not row["public_profile"]["trial_count"]["min"] <= spec["optuna_trials"] <= row["public_profile"]["trial_count"]["max"]
                or type(spec.get("random_seed")) is not int or spec["random_seed"] != p["random_seed"]
                or spec.get("optimization_config") or spec.get("route_params")
                or not isinstance(client, dict) or client.get("engine_release_id") != p["engine_release_id"]):
            raise ValueError("FULL-03 spec does not match its exact immutable Alpha/recipe binding")
        data = spec.get("data")
        if (not isinstance(data, dict) or set(data) != {"dataset_id", "symbol", "timeframe"}
                or data["dataset_id"] != "crypto-binance-1m" or data["timeframe"] != p["timeframe"]
                or not isinstance(data["symbol"], str) or not re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,31}", data["symbol"])):
            raise ValueError("FULL-03 data does not match its exact observed crypto timeframe")
        from decimal import InvalidOperation
        try:
            _validate_sibling_pins(spec.get("parameter_space_overrides"))
        except InvalidOperation as exc:
            raise ValueError("FULL-03 pins must be finite declared exact decimals") from exc
        if self.is_three_window_optimized:
            self._validate_three_window_optimized(profile=p, full03=True)
            return
        if "windows" in spec:
            raise ValueError("FULL-03 Advanced recipe forbids independent Three Window boundaries")
        full03_controls(spec, row)
        wf = spec["walk_forward"]
        start = _utc_instant(wf.get("start"), "walk_forward start")
        end = _utc_instant(wf.get("end_exclusive"), "walk_forward end")
        split = _utc_instant(wf.get("split_mode"), "walk_forward split_mode")
        if not start < split < end or (end - start).total_seconds() > p["max_span_days"] * 86_400:
            raise ValueError("FULL-03 span is outside its exact recipe range")

    def _validate_imported_search_spec(self, row: dict[str, Any]) -> None:
        from .research_imported_search import validate_imported_search_binding
        binding = validate_imported_search_binding(self.imported_search_binding, spec=self.requested_spec)
        p, spec = row["descriptor"], self.requested_spec
        if (self.execution_adapter_id != p["adapter_id"] or self.adapter_contract_digest != p["adapter_contract_digest"]
                or self.imported_source_digest != binding["source_digest"] or self.imported_entrypoint != binding["entrypoint"]
                or self.imported_parameters is not None or self.p04_parameters is not None or self.qualification_binding is not None
                or spec.get("schema_version") != p["requested_spec_version"] or spec.get("protocol") != p["protocol"]
                or spec.get("execution_route") != p["execution_route"] or spec.get("optimization_mode") != p["optimization_mode"]
                or spec.get("optimization_schedule") != p["optimization_schedule"]
                or type(spec.get("optuna_trials")) is not int
                or not row["public_profile"]["trial_count"]["min"] <= spec["optuna_trials"] <= row["public_profile"]["trial_count"]["max"] or spec.get("random_seed") != 42
                or spec.get("optimization_config") or spec.get("route_params")
                or spec.get("client", {}).get("engine_release_id") != p["engine_release_id"]
                or spec.get("data", {}).get("dataset_id") != p["dataset_id"] or spec.get("data", {}).get("timeframe") != p["timeframe"]
                or spec.get("alpha_binding") != {"alpha_id": self.alpha_id, "alpha_version_id": self.alpha_version_id}
                or spec.get("strategy_id") != self.alpha_id):
            raise ValueError("FULL05 spec does not match its immutable source/recipe binding")
        if p["protocol"] == "advanced":
            if "windows" in spec:
                raise ValueError("FULL05 advanced forbids independent Holdout")
            full03_controls(spec, row)
            wf = spec["walk_forward"]
            start, split, end = (_utc_instant(wf[key], key) for key in ("start", "split_mode", "end_exclusive"))
        else:
            if spec.get("walk_forward") is not None or not isinstance(spec.get("windows"), dict):
                raise ValueError("FULL05 Three Window requires its independent windows")
            windows = spec["windows"]
            start = _utc_instant(windows["is"]["start"], "IS")
            split = _utc_instant(windows["oos"]["start"], "OOS")
            holdout = _utc_instant(windows["holdout"]["start"], "Holdout")
            end = _utc_instant(windows["holdout"]["end_exclusive"], "end")
            if not split < holdout < end or windows["is"]["end_exclusive"] != windows["oos"]["start"] or windows["oos"]["end_exclusive"] != windows["holdout"]["start"]:
                raise ValueError("FULL05 windows must be contiguous and ordered")
        if not start < split < end or (end-start).total_seconds() > p["max_span_days"]*86400:
            raise ValueError("FULL05 range exceeds its exact recipe")
        if recipe_digest(spec) != self.requested_spec_digest:
            raise ValueError("FULL05 requested spec bytes changed")
        work = {"schema_version": row["work_schema_version"], "requested_spec_digest": self.requested_spec_digest,
            "effective_spec_digest": self.effective_spec_digest, "dataset_binding_digest": self.dataset_binding_digest,
            "manifest_digest": self.manifest_digest,
            "snapshot": {"snapshot_id": self.snapshot_id, "snapshot_content_hash": self.snapshot_content_hash},
            "alpha": {"alpha_id": self.alpha_id, "alpha_version_id": self.alpha_version_id,
                "source_digest": self.imported_source_digest, "entrypoint": self.imported_entrypoint,
                "adapter_id": self.execution_adapter_id, "adapter_contract_digest": self.adapter_contract_digest,
                "parameters": None, "search_binding": binding},
            "execution_profile": {"profile_id": self.execution_profile_id, "profile_digest": self.execution_profile_digest},
            "engine_release_id": spec["client"]["engine_release_id"], "requested_spec": spec}
        if recipe_digest(work) != self.work_digest:
            raise ValueError("FULL05 work digest changed its source/declaration dependency")

    def _validate_three_window_optimized(self, *, profile: dict[str, Any] | None = None, full03: bool = False) -> None:
        """A new immutable search recipe, never a widening of the fixed P04 wire."""
        profile, spec = profile or DELTA_THREE_WINDOW_OPTIMIZED_PROFILE, self.requested_spec
        trial_range = execution_recipe(self.execution_profile_id)["public_profile"]["trial_count"] if full03 else {"min": 3, "max": 3}
        if ((not full03 and self.execution_profile_digest != DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST)
                or self.execution_adapter_id != profile["adapter_id"]
                or self.adapter_contract_digest != profile["adapter_contract_digest"]
                or self.p04_parameters is not None or self.imported_parameters is not None
                or spec.get("schema_version") != profile["requested_spec_version"]
                or spec.get("protocol") != profile["protocol"]
                or spec.get("execution_route") != profile["execution_route"]
                or spec.get("optimization_mode") != "mode_1_decay"
                or spec.get("optimization_schedule") != "global"
                or type(spec.get("optuna_trials")) is not int or not trial_range["min"] <= spec["optuna_trials"] <= trial_range["max"]
                or type(spec.get("random_seed")) is not int or spec["random_seed"] != 42
                or spec.get("walk_forward") is not None
                or spec.get("optimization_config") or spec.get("route_params")
                or spec.get("data", {}).get("timeframe") != profile["timeframe"]
                or spec.get("client", {}).get("engine_release_id") != "er_quantbt_111"):
            raise ValueError("optimized Three Window requires its declared trial range and seed-42 Delta profile")
        _validate_sibling_pins(spec.get("parameter_space_overrides"))
        windows = spec.get("windows", {})
        try:
            a, b = (_utc_instant(windows["is"][name], "IS " + name) for name in ("start", "end_exclusive"))
            c = _utc_instant(windows["oos"]["end_exclusive"], "OOS end")
            d = _utc_instant(windows["holdout"]["end_exclusive"], "Holdout end")
            if (_utc_instant(windows["oos"]["start"], "OOS start") != b
                    or _utc_instant(windows["holdout"]["start"], "Holdout start") != c
                    or not a < b < c < d or (d - a).total_seconds() > profile["max_span_days"] * 86_400):
                raise ValueError("FULL-03 optimized Three Window exceeds its exact profile chronology/range" if full03
                    else "optimized Three Window requires contiguous half-open independent windows within 92 days")
        except (KeyError, TypeError) as exc:
            raise ValueError("optimized Three Window requires three explicit windows") from exc

    def _validate_full02_work(self, encoded_spec: bytes) -> None:
        from .research_execution_recipes import execution_recipe, recipe_digest
        phase = "FULL-03" if self.is_full03 else "FULL-02"
        if hashlib.sha256(encoded_spec).hexdigest() != self.requested_spec_digest:
            raise ValueError(f"{phase} requested spec does not match its retained digest")
        work = {"schema_version": execution_recipe(self.execution_profile_id, self.execution_profile_digest)["work_schema_version"],
            "requested_spec_digest": self.requested_spec_digest, "effective_spec_digest": self.effective_spec_digest,
            "dataset_binding_digest": self.dataset_binding_digest, "manifest_digest": self.manifest_digest,
            "snapshot": {"snapshot_id": self.snapshot_id, "snapshot_content_hash": self.snapshot_content_hash},
            "alpha": {"alpha_id": self.alpha_id, "alpha_version_id": self.alpha_version_id,
                "adapter_id": self.execution_adapter_id, "adapter_contract_digest": self.adapter_contract_digest},
            "execution_profile": {"profile_id": self.execution_profile_id, "profile_digest": self.execution_profile_digest},
            "engine_release_id": self.requested_spec["client"]["engine_release_id"], "requested_spec": self.requested_spec}
        if recipe_digest(work) != self.work_digest:
            raise ValueError(f"{phase} work digest does not match its immutable recipe/source binding")


# W5a A10c: a sibling attempt forked from the Screen-07 what-if pins the two
# what-if axes at one grid node and searches the rest of the declared space.
_SIBLING_PIN_AXES: dict[str, tuple[str, str, str]] = {
    "rvol": ("1", "2.5", "0.1"),
    "slpercent": ("0.7", "2.5", "0.1"),
}


def _validate_sibling_pins(overrides: object) -> None:
    if overrides in ([], None):
        return
    if not isinstance(overrides, list) or len(overrides) > len(_SIBLING_PIN_AXES):
        raise ValueError("the Delta WFO profile searches the installed Delta parameter space only")
    seen: set[str] = set()
    for entry in overrides:
        if not isinstance(entry, dict) or entry.get("kind") != "pin" or set(entry) != {"name", "kind", "value"}:
            raise ValueError("the Delta WFO profile searches the installed Delta parameter space only")
        name = entry.get("name")
        if name not in _SIBLING_PIN_AXES or name in seen:
            raise ValueError("the Delta WFO profile admits pins only on its what-if axes (rvol, slpercent)")
        seen.add(name)
        value = entry.get("value")
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            raise ValueError("a Delta WFO pin is an exact decimal")
        from decimal import Decimal, InvalidOperation

        try:
            exact = Decimal(str(value))
        except InvalidOperation as exc:
            raise ValueError("a Delta WFO pin is an exact decimal") from exc
        low, high, step = (Decimal(item) for item in _SIBLING_PIN_AXES[name])
        if not low <= exact <= high or (exact - low) % step != 0:
            raise ValueError("a Delta WFO pin must lie on its declared step inside its declared range")


def sibling_pins(requested_spec: dict[str, Any]) -> dict[str, float]:
    """The admitted what-if pins of a WFO request (empty for a plain WFO run)."""

    pins: dict[str, float] = {}
    for entry in requested_spec.get("parameter_space_overrides") or []:
        if isinstance(entry, dict) and entry.get("kind") == "pin" and entry.get("name") in _SIBLING_PIN_AXES:
            pins[str(entry["name"])] = float(str(entry["value"]))
    return pins


def _utc_instant(value: object, label: str) -> datetime:
    if not isinstance(value, str) or not 1 <= len(value) <= 64:
        raise ValueError(f"{label} is invalid")
    try:
        instant = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{label} is invalid") from exc
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=UTC)
    return instant.astimezone(UTC)


class ResearchRunProducerRequest(PortalModel):
    """Exact private payload sent by Control API through the existing facade."""

    strategy_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    dataset_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    protocol: Literal["three_window_decay", "advanced"]
    research_contract_version: Literal["research.run-request.v1"]
    run_id: str = Field(pattern=_OPAQUE, max_length=160)
    workspace_id: str = Field(pattern=_OPAQUE, max_length=160)
    job_id: str = Field(pattern=_OPAQUE, max_length=160)
    worker_attempt_id: str = Field(pattern=_OPAQUE, max_length=160)
    lease_epoch: int = Field(ge=1, le=2_147_483_647)
    research: ResearchRunProducerEnvelope

    @model_validator(mode="after")
    def validate_compatibility_projection(self) -> "ResearchRunProducerRequest":
        requested = self.research.requested_spec
        data = requested.get("data")
        if self.strategy_id != self.research.alpha_id:
            raise ValueError("legacy strategy_id does not match the immutable Alpha identity")
        if not isinstance(data, dict) or data.get("dataset_id") != self.dataset_id:
            raise ValueError("legacy dataset_id does not match the immutable requested spec")
        if requested.get("protocol") != self.protocol:
            raise ValueError("legacy protocol does not match the immutable requested spec")
        encoded = json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        if len(encoded) > 64 * 1024:
            raise ValueError("research producer request exceeds the bounded private contract")
        return self


__all__ = ["ResearchRunProducerEnvelope", "ResearchRunProducerRequest", "WhatIfEvaluation", "WhatIfJob"]
