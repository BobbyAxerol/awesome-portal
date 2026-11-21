"""Private byte-pinned selection audit; not browser-controlled compute input.

The eventual admission reader supplies the original P05 documents verbatim.
Their byte hashes bind both account/window defaults and the selected map;
an audit cannot resolve fresh defaults or choose another trial. This model
has no engine, filesystem or strategy import.
"""
from __future__ import annotations

import hashlib
import json
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from pydantic import Field, model_validator

from .requests import AdvancedWalkForwardConfig, PortalModel, PortalRunRequest
from .enums import OptimizationSchedule, RunProtocol


def audit_digest(value: object) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


PINNED_FINAL_AUDIT_PROFILE_ID = "p23.delta-pinned-final-audit.v1"
PINNED_FINAL_AUDIT_TASK = "P23_PINNED_FINAL_AUDIT"
PINNED_FINAL_AUDIT_PROFILE_DIGEST = audit_digest({
    "schema_version": "research.pinned-final-audit-profile.v1",
    "engine": "quantbt-engine==1.1.1", "adapter": "p04.delta-rsi.v1",
    "target_mode": "signal_notional", "schedule": "global", "optimization_mode": "none",
    "optimizer_trials": 0, "max_days": 92, "max_rows": 10000, "max_folds": 16,
    "cpu_seconds": 120, "wall_seconds": 240, "memory_bytes": 4 * 1024 ** 3,
    "scratch_bytes": 128 * 1024 ** 2, "file_bytes": 16 * 1024 ** 2,
    "max_output_files": 64, "max_output_bytes": 64 * 1024 ** 2,
})


def exact_parameter(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError("AUDIT_PARAMETER_MUST_BE_FINITE_DECIMAL")
    if len(str(value)) > 80:
        raise ValueError("AUDIT_PARAMETER_DECIMAL_SIZE_LIMIT")
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError("AUDIT_PARAMETER_MUST_BE_FINITE_DECIMAL") from exc
    if not number.is_finite():
        raise ValueError("AUDIT_PARAMETER_MUST_BE_FINITE_DECIMAL")
    if len(number.as_tuple().digits) > 34 or abs(number.as_tuple().exponent) > 34 or not -12 <= number.adjusted() <= 12:
        raise ValueError("AUDIT_PARAMETER_DECIMAL_SIZE_LIMIT")
    # Avoid Decimal.normalize's default 28-digit context rounding.
    rendered = format(number, "f")
    if "." in rendered:
        rendered = rendered.rstrip("0").rstrip(".")
    return "0" if number == 0 else rendered


def original_document(raw: str, expected: str, *, limit: int) -> dict[str, Any]:
    encoded = raw.encode("utf-8")
    if not 0 < len(encoded) <= limit:
        raise ValueError("AUDIT_ORIGINAL_DOCUMENT_SIZE_LIMIT")
    if hashlib.sha256(encoded).hexdigest() != expected:
        raise ValueError("AUDIT_ORIGINAL_DOCUMENT_DIGEST_MISMATCH")
    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                raise ValueError("AUDIT_DUPLICATE_DOCUMENT_KEY")
            result[key] = value
        return result
    def constant(_value):
        raise ValueError("AUDIT_NONFINITE_DOCUMENT_NUMBER")
    value = json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)
    if not isinstance(value, dict):
        raise ValueError("AUDIT_ORIGINAL_DOCUMENT_OBJECT_REQUIRED")
    return value


class PinnedSelectionAuditTarget(PortalModel):
    """All-time frozen global selection: no new optimizer/default knobs.

    Per-fold causal selections require their own individually pinned target
    sequence. Refuse that source here instead of taking the last fold map.
    """
    schema_version: Literal["research.pinned-selection-audit-target.v1"]
    parent_run_id: str = Field(pattern=r"^rrun_[A-Za-z0-9_.-]{1,155}$")
    parent_artifact_id: str = Field(pattern=r"^rart_[A-Za-z0-9_.-]{1,155}$")
    parent_artifact_revision: int = Field(strict=True, ge=1)
    parent_manifest_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    dataset_binding_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    snapshot_id: str = Field(pattern=r"^dss_[a-f0-9]{32}$")
    snapshot_content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    engine_release_id: Literal["er_quantbt_111"]
    engine_version: Literal["1.1.1"]
    alpha_version_id: str = Field(pattern=r"^av_[A-Za-z0-9_.-]{1,155}$")
    execution_adapter_id: Literal["p04.delta-rsi.v1"]
    adapter_contract_digest: Literal["9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784"]
    source_config_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_config_raw: str = Field(min_length=1, max_length=65_536)
    source_selection_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_selection_raw: str = Field(min_length=1, max_length=16_384)
    source_selection_kind: Literal["ENGINE_SELECTED_PARAMS_DOCUMENT", "P05_SELECTION_PARAMETERS_JSON"]
    source_selection_part_digest: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    source_selection_part_relative_path: str | None = Field(default=None, pattern=r"^tables/selection/part-[0-9]{6}\.parquet$")

    def source_request(self) -> PortalRunRequest:
        document = original_document(self.source_config_raw, self.source_config_digest, limit=65_536)
        # Existing ArtifactRepository appends these two provenance fields.
        # Hash the exact original document first; only then parse its request.
        request = {key: value for key, value in document.items() if key not in {"producer", "artifact_schema_version"}}
        parsed = PortalRunRequest.model_validate(request)
        # Original runner emits resolved account/execution settings. Never
        # resolve today's defaults for an older, sparse document.
        for field in ("account", "execution"):
            settings = getattr(parsed, field)
            if settings.model_fields_set != set(type(settings).model_fields):
                raise ValueError("AUDIT_RESOLVED_SOURCE_SETTINGS_REQUIRED")
        if not {"data_start", "data_end_exclusive", "random_seed"} <= parsed.calibration.model_fields_set:
            raise ValueError("AUDIT_EXPLICIT_SOURCE_WINDOW_AND_SEED_REQUIRED")
        return parsed

    def parameters(self) -> dict[str, str]:
        selection = original_document(self.source_selection_raw, self.source_selection_digest, limit=16_384)
        params = selection if self.source_selection_kind == "P05_SELECTION_PARAMETERS_JSON" else selection.get("params")
        if not isinstance(params, dict) or not 1 <= len(params) <= 24:
            raise ValueError("AUDIT_SELECTED_PARAMETER_MAP_REQUIRED")
        return {name: exact_parameter(value) for name, value in params.items()}

    def target_digest(self) -> str:
        # Byte-document digests bind the bytes, not their reserialization.
        return audit_digest(self.model_dump(mode="json", exclude={"source_config_raw", "source_selection_raw"}))

    @model_validator(mode="after")
    def validate_frozen_source(self) -> "PinnedSelectionAuditTarget":
        retained = self.source_selection_kind == "P05_SELECTION_PARAMETERS_JSON"
        if retained != (self.source_selection_part_digest is not None) or retained != (self.source_selection_part_relative_path is not None):
            raise ValueError("AUDIT_SELECTION_ORIGIN_AND_PART_PINS_REQUIRED")
        request = self.source_request()
        if request.strategy_id != "delta-rsi-polynomial-alpha" or request.protocol != RunProtocol.ADVANCED_WALK_FORWARD:
            raise ValueError("AUDIT_INSTALLED_DELTA_WFO_SOURCE_REQUIRED")
        calibration = request.calibration
        if not isinstance(calibration, AdvancedWalkForwardConfig) or calibration.optimization_schedule != OptimizationSchedule.GLOBAL:
            raise ValueError("AUDIT_PER_FOLD_TARGET_SEQUENCE_REQUIRED")
        if request.execution.target_mode != "signal_notional" or request.timeframe != "1h":
            raise ValueError("AUDIT_SOURCE_ROUTE_NOT_QUALIFIED")
        if calibration.data_start is None or calibration.data_end_exclusive is None:
            raise ValueError("AUDIT_EXACT_SOURCE_WINDOW_REQUIRED")
        if not 0 < (calibration.data_end_exclusive - calibration.data_start).total_seconds() <= 92 * 86_400:
            raise ValueError("AUDIT_SOURCE_WINDOW_LIMIT")
        if type(calibration.random_seed) is not int:
            raise ValueError("AUDIT_SOURCE_SEED_REQUIRED")
        if set(self.parameters()) != set(request.parameter_space.root):
            raise ValueError("AUDIT_SELECTION_PARAMETER_SURFACE_MISMATCH")
        return self


class PinnedAuditPreparation(PortalModel):
    """Control's scoped custody pins, never browser-selected paths/parameters."""
    parent_run_id: str = Field(pattern=r"^rrun_[A-Za-z0-9_.-]{1,155}$")
    parent_artifact_id: str = Field(pattern=r"^rart_[A-Za-z0-9_.-]{1,155}$")
    parent_artifact_revision: int = Field(strict=True, ge=1)
    parent_manifest_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    dataset_binding_digest: str = Field(pattern=r"^[a-f0-9]{64}$")
    snapshot_id: str = Field(pattern=r"^dss_[a-f0-9]{32}$")
    snapshot_content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    engine_release_id: Literal["er_quantbt_111"]
    alpha_version_id: str = Field(pattern=r"^av_[A-Za-z0-9_.-]{1,155}$")
    execution_adapter_id: Literal["p04.delta-rsi.v1"]
    adapter_contract_digest: Literal["9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784"]
