"""Private, bounded P05 preparation. Never an engine call or browser read."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
import pyarrow.parquet as pq
from .research_artifacts import ResearchArtifactStore, _safe_child, _read_bounded, _canonical_json_bytes
from .research_native_optimization import TABLE, VERSION, ROW_SCHEMA
from .research_window_execution import decimal


def prepare_native_read(root: Path, binding: dict[str, Any]) -> dict[str, Any]:
    if any(not p.is_dir() or p.is_symlink() for p in (root, root / "artifacts", root / "scratch")):
        raise ValueError("NATIVE_RETAINED_STORE_MISSING")
    store = ResearchArtifactStore(root)
    manifest, digest = store._load_and_verify_manifest(binding["artifact_id"], verify_parts=True)
    if digest != binding["manifest_digest"] or any(manifest[k] != binding[k] for k in
            ("workspace_id", "run_id", "artifact_id", "artifact_revision")):
        raise ValueError("NATIVE_MANIFEST_BINDING_MISMATCH")
    if any(manifest["input"][k] != binding[v] for k, v in
            (("request_spec_digest", "requested_spec_digest"), ("effective_spec_digest", "effective_spec_digest"),
             ("dataset_binding_digest", "dataset_binding_digest"))):
        raise ValueError("NATIVE_INPUT_BINDING_MISMATCH")
    artifact = store.artifacts_dir / binding["artifact_id"]
    def document(name: str) -> dict[str, Any]:
        docs = [d for d in manifest["documents"] if d["name"] == name]
        if len(docs) != 1:
            raise ValueError("NATIVE_DOCUMENT_NOT_RETAINED")
        d = docs[0]
        encoded = _read_bounded(_safe_child(artifact, d["relative_path"]), 256 * 1024)
        if hashlib.sha256(encoded).hexdigest() != d["sha256"]:
            raise ValueError("NATIVE_DOCUMENT_DIGEST_MISMATCH")
        return json.loads(encoded)
    summary = document("native_optimization")
    receipt = document("run_receipt")
    if receipt.get("native_execution", {}).get("optimization") != summary:
        raise ValueError("NATIVE_RECEIPT_SELECTION_MISMATCH")
    table = next((t for t in manifest["tables"] if t["table_kind"] == TABLE), None)
    if not table or table["schema_version"] != VERSION or not 1 <= table["rows"] <= 400 or len(table["parts"]) > 4:
        raise ValueError("NATIVE_POPULATION_NOT_RETAINED")
    rows = []
    for part in table["parts"]:
        if part["bytes"] > 8 * 1024 * 1024:
            raise ValueError("NATIVE_PART_EXCEEDS_BOUND")
        parquet=pq.ParquetFile(_safe_child(artifact, part["relative_path"]))
        if not parquet.schema_arrow.equals(ROW_SCHEMA) or parquet.metadata.num_rows != part["rows"]:
            raise ValueError("NATIVE_POPULATION_SCHEMA_MISMATCH")
        unpacked=sum(parquet.metadata.row_group(i).column(j).total_uncompressed_size
            for i in range(parquet.metadata.num_row_groups) for j in range(parquet.metadata.num_columns))
        if unpacked>4*1024*1024:
            raise ValueError("NATIVE_PART_UNCOMPRESSED_BYTES_EXCEED_BOUND")
        p=parquet.read()
        rows.extend(p.to_pylist())
    def metric(value: Any, state: str) -> dict[str, Any]:
        reason = "TRIAL_PRUNED_NO_OBJECTIVE" if state == "PRUNED" else "NATIVE_TRIAL_NOT_COMPLETE" if state != "COMPLETE" else "NATIVE_METRIC_NOT_RETAINED"
        return {"value": value if state == "COMPLETE" else None, "availability": {
            "state": "AVAILABLE" if state == "COMPLETE" and value is not None else "NOT_PUBLISHED",
            "reason_code": None if state == "COMPLETE" and value is not None else reason}}
    trials = [{"source_ordinal": r["source_ordinal"], "trial_number": r["trial_number"],
        "trial_ordinal": r["trial_number"] + 1, "scope": "NATIVE_IS_STUDY", "state": r["state"],
        "parameters": json.loads(r["parameters_json"]), "objective": metric(r["objective"], r["state"]),
        "metrics": {k: metric(v, r["state"]) for k, v in json.loads(r["metrics_json"]).items()},
        "selected": r["trial_number"] == summary["selected_trial_number"]} for r in rows]
    selected = [r for r in rows if r["trial_number"] == summary["selected_trial_number"]]
    if len(selected) != 1 or json.loads(selected[0]["metadata_json"]).get("native_selection_metadata", {}).get("medoid_trial_number") != summary["selected_trial_number"]:
        raise ValueError("NATIVE_ENGINE_SELECTION_IDENTITY_MISMATCH")
    metadata=json.loads(selected[0]["metadata_json"]).get("native_selection_metadata", {})
    fields=("objective_index","medoid_trial_number","cluster_center_trial","top_trials","feasible_trials",
        "neighbor_count","min_neighbor_count","seed_consensus","seed_consensus_count","param_names","fallback_reasons")
    decimal_fields=("top_quantile","neighborhood_radius","plateau_score","median_objective","worst_objective","objective_std")
    evidence=None
    if all(k in metadata for k in (*fields,*decimal_fields)) and metadata.get("selected_by")=="robust_plateau":
        evidence={"selector":"robust_plateau",**{k:metadata[k] for k in fields},**{k:decimal(metadata[k]) for k in decimal_fields}}
    versions = {"quantbt-engine-1.1.1": "1.1.1", "quantbt-engine-1.1.0": "1.1.0"}
    if manifest["engine"]["release_id"] not in versions:
        raise ValueError("NATIVE_ENGINE_RELEASE_NOT_PINNED")
    result = {"schema_version": "research.native-read-custody.v2", "selection_evidence":evidence, **binding,
        "engine_version": versions[manifest["engine"]["release_id"]], "summary": summary,
        "source_parts": [{"ordinal": p["part_ordinal"], "sha256": p["sha256"], "rows": p["rows"], "bytes": p["bytes"]} for p in table["parts"]],
        "trials": trials, "selected_parameters_digest": hashlib.sha256(_canonical_json_bytes(summary["selected_parameters"])).hexdigest(),
        "verification_scope": "P05_MANIFEST_ALL_PARTS_AND_DOCUMENTS_AT_PREPARATION"}
    if len(json.dumps(result).encode()) > 240 * 1024:
        raise ValueError("NATIVE_READ_MODEL_EXCEEDS_BOUND")
    # Catch concurrent disk replacement before acknowledging preparation.
    if store._load_and_verify_manifest(binding["artifact_id"], verify_parts=True)[1] != digest:
        raise ValueError("NATIVE_MANIFEST_CHANGED_DURING_PREPARATION")
    return result
