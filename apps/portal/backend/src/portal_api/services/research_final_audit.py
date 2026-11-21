"""Compute-only pinned audit adapter below the existing P06 confinement.

No admission, optimizer, account policy or parent write authority lives here.
Calling this function alone does not create an AUDIT_OF_SELECTION child.
"""
from __future__ import annotations

import hashlib
import json
import math
from decimal import Decimal
from pathlib import Path
from typing import Any

import pandas as pd

from portal_api.adapters.market_data import DatasetDescriptor, prepare_market_data
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.requests import ParameterSpaceConfig, ParameterSpec, PortalRunRequest
from portal_api.domain.research_final_audit import PinnedAuditPreparation, PinnedSelectionAuditTarget, audit_digest, exact_parameter
from portal_api.repositories.artifacts import ArtifactRepository, with_portal_provenance
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner


def pinned_audit_request(target: PinnedSelectionAuditTarget) -> PortalRunRequest:
    from strategy.specification import DELTA_RSI_SPECIFICATION

    source = target.source_request()
    parameters = target.parameters()
    declared = DELTA_RSI_SPECIFICATION.parameter_space
    if set(parameters) != set(declared):
        raise ValueError("AUDIT_INSTALLED_PARAMETER_SURFACE_MISMATCH")
    fixed = {}
    for name, text in parameters.items():
        low, high, _step = declared[name]
        exact = Decimal(text)
        if not Decimal(str(low)) <= exact <= Decimal(str(high)):
            raise ValueError("AUDIT_SELECTION_OUTSIDE_INSTALLED_DECLARATION")
        if isinstance(low, int) and isinstance(high, int):
            if exact != exact.to_integral_value():
                raise ValueError("AUDIT_INTEGER_PARAMETER_REQUIRED")
            value = int(exact)
        else:
            value = float(exact)
            if not math.isfinite(value) or exact_parameter(value) != text:
                raise ValueError("AUDIT_PARAMETER_ENGINE_ROUNDTRIP_MISMATCH")
        fixed[name] = ParameterSpec(kind="fixed", value=value)
    raw = source.model_dump(mode="json")
    # Preserve all resolved source account, seed, span, scoring and guard facts.
    # Only change the execution intent from search to pinned evaluation.
    raw["parameter_space"] = ParameterSpaceConfig(fixed).model_dump(mode="json")
    raw["calibration"].update(optimization_mode="none", optimization_schedule="global",
        optuna_trials=0, optuna_early_stopping=None)
    return PortalRunRequest.model_validate(raw)


def run_pinned_final_audit(
    target: PinnedSelectionAuditTarget,
    *,
    expected_target_digest: str,
    snapshot_path: Path,
    artifacts: ArtifactRepository,
    run_id: str,
    gateway: QuantBTGateway | None = None,
    parent_retained_root: Path | None = None,
) -> dict[str, Any]:
    """Evaluate one original global frozen target through native fixed WFO.

    The caller must be the isolated lease-fenced child, not an API GET. Input
    is the original immutable P08 snapshot (not a newly loaded latest tape).
    Output is scoped to a distinct child run; the parent is never written.
    """
    if run_id == target.parent_run_id or not run_id.startswith("rrun_"):
        raise ValueError("AUDIT_DISTINCT_CHILD_RUN_REQUIRED")
    artifacts.run_directory(run_id)  # Existing strict ID/path boundary, before writes.
    if target.target_digest() != expected_target_digest:
        raise ValueError("AUDIT_TARGET_DIGEST_MISMATCH")
    if target.source_selection_kind == "P05_SELECTION_PARAMETERS_JSON":
        if parent_retained_root is None:
            raise ValueError("AUDIT_ORIGINAL_RETAINED_PART_REQUIRED")
        verify_retained_target(target, parent_retained_root)
    if any(path.is_symlink() for path in (snapshot_path, *snapshot_path.parents)) or not snapshot_path.is_file():
        raise ValueError("AUDIT_IMMUTABLE_SNAPSHOT_FILE_REQUIRED")
    if not 0 < snapshot_path.stat().st_size <= 64 * 1024 * 1024:
        raise ValueError("AUDIT_SNAPSHOT_SIZE_LIMIT")
    sha = hashlib.sha256()
    with snapshot_path.open("rb") as handle:
        for block in iter(lambda: handle.read(64 * 1024), b""):
            sha.update(block)
    if sha.hexdigest() != target.snapshot_content_hash:
        raise ValueError("AUDIT_SNAPSHOT_BYTE_DIGEST_MISMATCH")
    request = pinned_audit_request(target)
    engine = gateway or QuantBTGateway()
    if engine.version() != target.engine_version:
        raise ValueError("AUDIT_ENGINE_PIN_MISMATCH")
    frame = pd.read_parquet(snapshot_path)
    if not 0 < len(frame) <= 10_000:
        raise ValueError("AUDIT_SNAPSHOT_ROW_LIMIT")
    market = prepare_market_data(frame, DatasetDescriptor(dataset_id=request.dataset_id,
        symbol=request.symbol, venue="BINANCE", timeframe=request.timeframe))
    artifacts.write_json(run_id, "audit/target.v1.json", with_portal_provenance(
        "audit/target.v1.json", {"schema_version": target.schema_version,
            "target_digest": expected_target_digest,
            **target.model_dump(mode="json", exclude={"source_config_raw", "source_selection_raw"}),
            "parameters": target.parameters()}))
    summary = AdvancedWalkForwardRunner(gateway=engine, artifacts=artifacts).run(
        request, market, run_id, target_mode="signal_notional")
    selected = artifacts.read_json(run_id, "selection/selected_params.json")
    parameters = selected.get("params")
    if not isinstance(parameters, dict) or {key: exact_parameter(value) for key, value in parameters.items()} != target.parameters():
        raise ValueError("AUDIT_ENGINE_CHANGED_PINNED_SELECTION")
    if selected.get("optimization_mode") != "none" or selected.get("optimization_schedule") != "global":
        raise ValueError("AUDIT_ENGINE_DID_NOT_PUBLISH_FIXED_EVALUATION")
    if not 2 <= int(summary.get("n_folds") or 0) <= 16:
        raise ValueError("AUDIT_SOURCE_FOLD_LIMIT")
    receipt = {"schema_version": "research.pinned-selection-audit-result.v1",
        "run_id": run_id, "parent_run_id": target.parent_run_id,
        "target_digest": expected_target_digest,
        "parameters_digest": audit_digest(target.parameters()),
        "engine_release_id": target.engine_release_id, "engine_version": engine.version(),
        "snapshot_id": target.snapshot_id, "snapshot_content_hash": target.snapshot_content_hash,
        "source_selection_digest": target.source_selection_digest,
        "source_selection_kind": target.source_selection_kind,
        "source_selection_part_digest": target.source_selection_part_digest,
        "source_config_digest": target.source_config_digest,
        "audit_target_kind": "SINGLE_PARAMETER_SET", "optimizer_reinvoked": False,
        "optimizer_trials": 0, "n_folds": int(summary["n_folds"]), "bars": len(frame)}
    artifacts.write_json(run_id, "audit/result.v1.json", with_portal_provenance("audit/result.v1.json", receipt))
    return receipt


def _retained_bytes(root: Path, relative: str, maximum: int) -> bytes:
    path = root / relative
    if (Path(relative).is_absolute() or ".." in Path(relative).parts
        or any(item.is_symlink() for item in (path, *path.parents)) or not path.is_file()):
        raise ValueError("AUDIT_ORIGINAL_RETAINED_FILE_REQUIRED")
    if not 0 < path.stat().st_size <= maximum:
        raise ValueError("AUDIT_ORIGINAL_RETAINED_FILE_SIZE_LIMIT")
    raw = path.read_bytes()
    if not 0 < len(raw) <= maximum:
        raise ValueError("AUDIT_ORIGINAL_RETAINED_FILE_SIZE_LIMIT")
    return raw


def prepare_pinned_audit_target(store_root: Path, pins: PinnedAuditPreparation) -> PinnedSelectionAuditTarget:
    """Read exact original P05 bytes once. No HMD/engine/parent write occurs."""
    import io
    import pyarrow.parquet as pq
    root = store_root / "artifacts" / pins.parent_artifact_id
    manifest_raw = _retained_bytes(root, "manifest.json", 262_144)
    if hashlib.sha256(manifest_raw).hexdigest() != pins.parent_manifest_digest:
        raise ValueError("AUDIT_PARENT_MANIFEST_DIGEST_MISMATCH")
    manifest = json.loads(manifest_raw)
    if (manifest.get("run_id") != pins.parent_run_id or manifest.get("artifact_id") != pins.parent_artifact_id
            or manifest.get("artifact_revision") != pins.parent_artifact_revision):
        raise ValueError("AUDIT_PARENT_MANIFEST_IDENTITY_MISMATCH")
    configs = [doc for doc in manifest.get("documents", []) if doc.get("name") == "source_config"]
    selections = [table for table in manifest.get("tables", []) if table.get("table_kind") == "selection"]
    if len(configs) != 1 or len(selections) != 1 or selections[0].get("rows") != 1 or len(selections[0].get("parts", [])) != 1:
        raise ValueError("AUDIT_EXACT_GLOBAL_SELECTION_REQUIRED")
    config = configs[0]
    part = selections[0]["parts"][0]
    config_raw = _retained_bytes(root, config["relative_path"], 65_536)
    part_raw = _retained_bytes(root, part["relative_path"], 16 * 1024 ** 2)
    if (hashlib.sha256(config_raw).hexdigest() != config["sha256"] or len(config_raw) != config["bytes"]
            or hashlib.sha256(part_raw).hexdigest() != part["sha256"] or len(part_raw) != part["bytes"]):
        raise ValueError("AUDIT_ORIGINAL_RETAINED_DIGEST_MISMATCH")
    parquet = pq.ParquetFile(io.BytesIO(part_raw))
    if parquet.metadata.num_rows != 1 or len(parquet.schema_arrow.names) > 32:
        raise ValueError("AUDIT_EXACT_GLOBAL_SELECTION_REQUIRED")
    row = parquet.read(columns=["source_ordinal", "parameters_json"]).to_pylist()[0]
    if row["source_ordinal"] != 0 or not isinstance(row["parameters_json"], str):
        raise ValueError("AUDIT_EXACT_GLOBAL_SELECTION_REQUIRED")
    target = PinnedSelectionAuditTarget.model_validate({**pins.model_dump(mode="json"),
        "schema_version": "research.pinned-selection-audit-target.v1", "engine_version": "1.1.1",
        "source_config_raw": config_raw.decode("utf-8"), "source_config_digest": config["sha256"],
        "source_selection_kind": "P05_SELECTION_PARAMETERS_JSON", "source_selection_raw": row["parameters_json"],
        "source_selection_digest": hashlib.sha256(row["parameters_json"].encode("utf-8")).hexdigest(),
        "source_selection_part_digest": part["sha256"], "source_selection_part_relative_path": part["relative_path"]})
    # API preparation receives the retained root; the confined child receives
    # the outer artifact-store root. Share the verifier at the resolved
    # artifact boundary, never append research-retained twice.
    _verify_retained_artifact(target, root)
    pinned_audit_request(target)  # Validate the installed fixed surface without running it.
    return target


def verify_retained_target(target: PinnedSelectionAuditTarget, store_root: Path) -> None:
    """Rehash the original P05 manifest, config document and selection part.

    Older writers kept the selected map as the exact parameters_json column
    of a sealed Parquet row, not an engine JSON document. Bind that original
    column text and part bytes explicitly; do not regenerate an old artifact.
    """
    _verify_retained_artifact(target, store_root / "research-retained" / "artifacts" / target.parent_artifact_id)


def _verify_retained_artifact(target: PinnedSelectionAuditTarget, root: Path) -> None:
    """Same byte/custody checks for API and namespace-child root conventions."""
    manifest_raw = _retained_bytes(root, "manifest.json", 256 * 1024)
    if hashlib.sha256(manifest_raw).hexdigest() != target.parent_manifest_digest:
        raise ValueError("AUDIT_PARENT_MANIFEST_DIGEST_MISMATCH")
    manifest = json.loads(manifest_raw)
    if (manifest.get("run_id") != target.parent_run_id or manifest.get("artifact_id") != target.parent_artifact_id
        or manifest.get("artifact_revision") != target.parent_artifact_revision):
        raise ValueError("AUDIT_PARENT_MANIFEST_IDENTITY_MISMATCH")
    config = [doc for doc in manifest.get("documents", []) if doc.get("name") == "source_config"]
    if len(config) != 1 or config[0].get("sha256") != target.source_config_digest:
        raise ValueError("AUDIT_PARENT_CONFIG_PIN_MISMATCH")
    raw = _retained_bytes(root, config[0]["relative_path"], 65536)
    if raw != target.source_config_raw.encode() or len(raw) != config[0].get("bytes"):
        raise ValueError("AUDIT_PARENT_CONFIG_BYTE_MISMATCH")
    tables = [table for table in manifest.get("tables", []) if table.get("table_kind") == "selection"]
    if len(tables) != 1 or tables[0].get("rows") != 1 or len(tables[0].get("parts", [])) != 1:
        raise ValueError("AUDIT_ONE_GLOBAL_SELECTION_PART_REQUIRED")
    part = tables[0]["parts"][0]
    if (part.get("rows") != 1 or part.get("relative_path") != target.source_selection_part_relative_path
        or part.get("sha256") != target.source_selection_part_digest):
        raise ValueError("AUDIT_PARENT_SELECTION_PART_PIN_MISMATCH")
    raw = _retained_bytes(root, part["relative_path"], 16 * 1024 ** 2)
    if len(raw) != part.get("bytes") or hashlib.sha256(raw).hexdigest() != target.source_selection_part_digest:
        raise ValueError("AUDIT_PARENT_SELECTION_PART_BYTE_MISMATCH")
    import io
    # Decode the already rehashed bytes, never reopen a different file.
    frame = pd.read_parquet(io.BytesIO(raw))
    if len(frame) != 1 or int(frame.iloc[0]["source_ordinal"]) != 0 or frame.iloc[0]["parameters_json"] != target.source_selection_raw:
        raise ValueError("AUDIT_PARENT_SELECTION_ROW_MISMATCH")
