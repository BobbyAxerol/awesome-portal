"""Private P05 custody plan for native frozen-selection audit output.

This never runs an engine or grants a lineage relationship. Admission and the
Control reader must independently bind the eventual audited child. Preserve
the native binary64 columns in bounded Arrow batches; do not manufacture an
optimizer ledger to pass the existing searched-WFO retention profile.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pyarrow.parquet as pq

from portal_api.domain.research_final_audit import PinnedSelectionAuditTarget, audit_digest, exact_parameter
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_artifacts import ArtifactTableSchema


@dataclass(frozen=True)
class PinnedAuditTable:
    path: Path
    definition: ArtifactTableSchema
    source_rows: int
    source_digest: str


@dataclass(frozen=True)
class PinnedAuditOutput:
    tables: tuple[PinnedAuditTable, ...]
    documents: dict[str, dict[str, Any]]
    files: dict[str, str]


def _source_bytes(root: Path, relative: str, maximum: int) -> bytes:
    path = root / relative
    if any(candidate.is_symlink() for candidate in (path, *path.parents)) or not path.is_file():
        raise ValueError("AUDIT_OUTPUT_ORDINARY_FILE_REQUIRED")
    if not 0 < path.stat().st_size <= maximum:
        raise ValueError("AUDIT_OUTPUT_FILE_LIMIT")
    # Each isolated output file is at most 16 MiB; JSON files at most 64 KiB.
    with path.open("rb") as handle:
        value = handle.read(maximum + 1)
    if not 0 < len(value) <= maximum:
        raise ValueError("AUDIT_OUTPUT_FILE_LIMIT")
    return value


def _document(root: Path, relative: str, pins: dict[str, str]) -> dict[str, Any]:
    raw = _source_bytes(root, relative, 65_536)
    pins[relative] = hashlib.sha256(raw).hexdigest()
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("AUDIT_OUTPUT_DOCUMENT_OBJECT_REQUIRED")
    return {key: item for key, item in value.items() if key not in {"producer", "artifact_schema_version"}}


def validate_audit_result(target: PinnedSelectionAuditTarget, result: dict[str, Any], run_id: str) -> None:
    expected = {"schema_version": "research.pinned-selection-audit-result.v1",
        "run_id": run_id, "parent_run_id": target.parent_run_id,
        "target_digest": target.target_digest(), "parameters_digest": audit_digest(target.parameters()),
        "engine_release_id": target.engine_release_id, "engine_version": target.engine_version,
        "snapshot_id": target.snapshot_id, "snapshot_content_hash": target.snapshot_content_hash,
        "source_selection_digest": target.source_selection_digest,
        "source_selection_kind": target.source_selection_kind,
        "source_selection_part_digest": target.source_selection_part_digest,
        "source_config_digest": target.source_config_digest, "audit_target_kind": "SINGLE_PARAMETER_SET"}
    if (run_id == target.parent_run_id or any(result.get(key) != value for key, value in expected.items())
            or result.get("optimizer_reinvoked") is not False
            or type(result.get("optimizer_trials")) is not int or result["optimizer_trials"] != 0
            or type(result.get("n_folds")) is not int or not 2 <= result["n_folds"] <= 16
            or type(result.get("bars")) is not int or not 1 <= result["bars"] <= 10_000):
        raise ValueError("AUDIT_OUTPUT_RECEIPT_TARGET_MISMATCH")


def pinned_audit_output(request: ResearchRunProducerRequest, receipt: dict[str, Any], root: Path) -> PinnedAuditOutput:
    research = request.research
    target = research.final_audit_target
    if not research.is_final_audit or target is None:
        raise ValueError("AUDIT_OUTPUT_PROFILE_REQUIRED")
    pins: dict[str, str] = {}
    result = _document(root, "audit/result.v1.json", pins)
    validate_audit_result(target, result, request.run_id)
    if receipt.get("audit") != result:
        raise ValueError("AUDIT_OUTPUT_RECEIPT_DOCUMENT_MISMATCH")
    manifest = _document(root, "manifest.json", pins)
    if (manifest.get("run_id") != request.run_id or manifest.get("status") != "COMPLETED"
            or manifest.get("protocol") != "advanced_walk_forward" or manifest.get("quantbt_version") != "1.1.1"):
        raise ValueError("AUDIT_OUTPUT_NATIVE_IDENTITY_MISMATCH")
    selected = _document(root, "selection/selected_params.json", pins)
    # Pinned QuantBT 1.1.1 publishes a fixed-evaluation best_trial (id 0 and
    # its measured objective) even with NONE and no Optuna study. Preserve
    # those native facts; nulling them would falsify the retained document.
    # The separate audited receipt proves zero optimizer invocations/trials.
    if (selected.get("optimization_mode") != "none" or selected.get("optimization_schedule") != "global"
            or type(selected.get("n_studies")) is not int or selected["n_studies"] != 0
            or type(selected.get("trial_id")) is not int or selected["trial_id"] != 0
            or type(selected.get("objective")) not in (int, float) or not math.isfinite(selected["objective"])
            or not isinstance(selected.get("params"), dict)
            or {name: exact_parameter(value) for name, value in selected["params"].items()} != target.parameters()):
        raise ValueError("AUDIT_OUTPUT_SELECTION_CHANGED")
    config = _document(root, "config.json", pins)
    from portal_api.services.research_final_audit import pinned_audit_request
    expected_config = pinned_audit_request(target).model_dump(mode="json")
    if config != expected_config:
        raise ValueError("AUDIT_OUTPUT_CONFIG_CHANGED")
    plans = []
    for table_kind, relative, minimum, maximum, required in (
        ("audit_equity", "series/stitched.parquet", 1, 10_000, {"equity", "returns", "accepted_position", "drawdown"}),
        ("audit_folds", "wfo/folds.parquet", 2, 16, {"test_start", "test_end"}),
        ("audit_account_ledger", "series/account_ledger.v1.parquet", 1, 10_000, {"fee"}),
        ("audit_lifecycle", "wfo/strategy_lifecycle.v1.parquet", 1, 20_000, {"context", "candidate_id"}),
    ):
        raw = _source_bytes(root, relative, 16 * 1024 ** 2)
        source_digest = hashlib.sha256(raw).hexdigest()
        pins[relative] = source_digest
        import io
        parquet = pq.ParquetFile(io.BytesIO(raw))
        if (not minimum <= parquet.metadata.num_rows <= maximum
                or not required.issubset(parquet.schema_arrow.names)
                or len(parquet.schema_arrow.names) > 128):
            raise ValueError("AUDIT_OUTPUT_TABLE_SCOPE_MISMATCH")
        plans.append(PinnedAuditTable(path=root / relative, source_rows=parquet.metadata.num_rows,
            source_digest=source_digest, definition=ArtifactTableSchema(table_kind=table_kind,
                schema_version="research.pinned-audit-native-table.v1", arrow_schema=parquet.schema_arrow)))
    if plans[1].source_rows != result["n_folds"]:
        raise ValueError("AUDIT_OUTPUT_FOLD_COUNT_MISMATCH")
    documents = {"audit_result": result, "audit_selection": selected,
        "audit_config": config, "audit_metrics": _document(root, "metrics.json", pins),
        "audit_account_contract": _document(root, "wfo/account_contract.v1.json", pins),
        "audit_lifecycle_contract": _document(root, "wfo/strategy_lifecycle_contract.v1.json", pins),
        "audit_target": {**target.model_dump(mode="json", exclude={"source_config_raw", "source_selection_raw"}),
            "target_digest": target.target_digest()}}
    documents["audit_source_files"] = {"schema_version": "research.pinned-audit-source-files.v1", "sha256": pins}
    return PinnedAuditOutput(tuple(plans), documents, pins)


def verify_audit_output_unchanged(root: Path, output: PinnedAuditOutput) -> None:
    for relative, digest in output.files.items():
        if hashlib.sha256(_source_bytes(root, relative, 16 * 1024 ** 2)).hexdigest() != digest:
            raise ValueError("AUDIT_OUTPUT_BYTES_CHANGED_DURING_RETENTION")
