"""Ops-only HMD audit child proof below admission, never product acceptance.

Read the exact accepted P23 parent and its original P05/config/snapshot bytes;
run the pinned evaluation in P06 confinement. No DB, HTTP, job, seal, reseal,
parent mutation, session or credential authority is present in this helper.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile

import pandas as pd

from portal_api.domain.research_final_audit import PinnedSelectionAuditTarget
from portal_api.services.research_final_audit import _retained_bytes, verify_retained_target
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, PinnedAuditChildReceipt


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    args = json.load(sys.stdin)
    if set(args) != {"run_id", "artifact_id", "manifest_digest"}:
        raise ValueError("EXACT_HMD_PROOF_INPUT_REQUIRED")
    if args != {"run_id": "rrun_c3bc2113431102c1715a9d6d28d7b2bf",
        "artifact_id": "rart_b0ebb6b61bc853b98a0b84ccadf27c07d3ed5091",
        "manifest_digest": "6e6ef7547f247f2ee6c9e87da8ca672159f6f6658abe1f03e08bdaac4f277ccc"}:
        raise ValueError("ONLY_ACCEPTED_OWNED_P23_SOURCE_REQUIRED")
    store = Path("/var/lib/portal/artifacts/runs/durable-store")
    root = store / "research-retained/artifacts" / args["artifact_id"]
    manifest_raw = _retained_bytes(root, "manifest.json", 256 * 1024)
    if sha(manifest_raw) != args["manifest_digest"]:
        raise ValueError("PARENT_MANIFEST_PIN_CHANGED")
    manifest = json.loads(manifest_raw)

    def document(name):
        matches = [entry for entry in manifest["documents"] if entry["name"] == name]
        if len(matches) != 1:
            raise ValueError("ONE_ORIGINAL_DOCUMENT_REQUIRED")
        row = matches[0]
        raw = _retained_bytes(root, row["relative_path"], 65536)
        if sha(raw) != row["sha256"] or len(raw) != row["bytes"]:
            raise ValueError("ORIGINAL_DOCUMENT_BYTE_PIN_CHANGED")
        return raw

    config_raw = document("source_config")
    selection = [table for table in manifest["tables"] if table["table_kind"] == "selection"]
    if len(selection) != 1 or selection[0]["rows"] != 1 or len(selection[0]["parts"]) != 1:
        raise ValueError("ONE_FROZEN_GLOBAL_SELECTION_REQUIRED")
    part = selection[0]["parts"][0]
    part_raw = _retained_bytes(root, part["relative_path"], 16 * 1024 ** 2)
    if sha(part_raw) != part["sha256"]:
        raise ValueError("SELECTION_PART_PIN_CHANGED")
    import io
    frame = pd.read_parquet(io.BytesIO(part_raw))
    parameters_raw = str(frame.iloc[0]["parameters_json"])
    bundles = list((store / "runs" / args["run_id"] / "attempts").glob("*/bundle/*/manifest.json"))
    if len(bundles) != 1:
        raise ValueError("ONE_ORIGINAL_NATIVE_BUNDLE_REQUIRED")
    bundle_raw = _retained_bytes(store, str(bundles[0].relative_to(store)), 65536)
    bundle = json.loads(bundle_raw)
    if bundle["run_id"] != args["run_id"] or bundle["status"] != "succeeded":
        raise ValueError("ORIGINAL_BUNDLE_IDENTITY_CHANGED")

    def blob(name):
        digest = bundle["files"][name]
        import re
        if not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("SOURCE_BLOB_DIGEST_REQUIRED")
        raw = _retained_bytes(store, "blobs/" + digest, 65536)
        if sha(raw) != digest:
            raise ValueError("SOURCE_BLOB_BYTE_PIN_CHANGED")
        return json.loads(raw)

    request = blob("config/request.json")
    binding = blob("research/dataset-binding-receipt.json")
    if request["run_id"] != args["run_id"] or binding["run_id"] != args["run_id"]:
        raise ValueError("ORIGINAL_REQUEST_BINDING_CHANGED")
    target = PinnedSelectionAuditTarget.model_validate({
        "schema_version": "research.pinned-selection-audit-target.v1", "parent_run_id": args["run_id"],
        "parent_artifact_id": args["artifact_id"], "parent_artifact_revision": manifest["artifact_revision"],
        "parent_manifest_digest": args["manifest_digest"], "dataset_binding_digest": request["dataset_binding_digest"],
        "snapshot_id": binding["snapshot_id"], "snapshot_content_hash": binding["snapshot_content_hash"],
        "engine_release_id": request["requested_spec"]["client"]["engine_release_id"], "engine_version": "1.1.1",
        "alpha_version_id": request["alpha_version_id"], "execution_adapter_id": request["execution_adapter_id"],
        "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
        "source_config_digest": sha(config_raw), "source_config_raw": config_raw.decode(),
        "source_selection_kind": "P05_SELECTION_PARAMETERS_JSON", "source_selection_raw": parameters_raw,
        "source_selection_digest": sha(parameters_raw.encode()), "source_selection_part_digest": sha(part_raw),
        "source_selection_part_relative_path": part["relative_path"],
    })
    verify_retained_target(target, store)
    snapshot_root = store.parent / "snapshots/snapshots" / target.snapshot_id
    snapshot = snapshot_root / "frame.parquet"
    identity = json.loads(_retained_bytes(snapshot_root, "identity.json", 65536))
    snapshot_before = sha(_retained_bytes(snapshot_root, "frame.parquet", 64 * 1024 ** 2))
    if identity["content_hash"] != snapshot_before or snapshot_before != target.snapshot_content_hash:
        raise ValueError("ORIGINAL_SNAPSHOT_PIN_CHANGED")
    with tempfile.TemporaryDirectory(prefix="p23-pinned-audit-") as directory:
        supervisor = IsolatedResearchSupervisor(Path(directory) / "scratch", allowed_market_root=snapshot_root)
        receipt = PinnedAuditChildReceipt(job_id="rjob_p23_final_audit_proof", run_id="rrun_p23_final_audit_proof",
            worker_attempt_id="rwa_p23_final_audit_proof", lease_epoch=1, market_path=snapshot,
            artifact_root=store, target=target, expected_target_digest=target.target_digest())
        result = supervisor.run_delta_wfo(receipt)
        if result.network_namespace == os.readlink("/proc/self/ns/net") or result.trial_rows != 0:
            raise ValueError("ISOLATED_NO_OPTIMIZER_PROOF_REQUIRED")
        output_hashes = {str(path.relative_to(result.output_root)): sha(path.read_bytes())
            for path in result.output_root.rglob("*") if path.is_file()}
        audit = result.audit_receipt
        retired = supervisor.retire_terminal_scratch(job_id=receipt.job_id, run_id=receipt.run_id,
            worker_attempt_id=receipt.worker_attempt_id, lease_epoch=receipt.lease_epoch)
        if not retired:
            raise ValueError("EXACT_TERMINAL_SCRATCH_CLEANUP_REQUIRED")
    verify_retained_target(target, store)
    if sha(_retained_bytes(snapshot_root, "frame.parquet", 64 * 1024 ** 2)) != snapshot_before:
        raise ValueError("ORIGINAL_SNAPSHOT_BYTES_CHANGED")
    source = target.source_request()
    print(json.dumps({"schema_version": "research.p23-pinned-audit-child-proof.v1", "passed": True,
        "scope": "REAL_HMD_PINNED_CHILD_BELOW_ADMISSION_NOT_PRODUCT_ACCEPTANCE", "parent_run_id": target.parent_run_id,
        "parent_artifact_id": target.parent_artifact_id, "parent_manifest_digest": target.parent_manifest_digest,
        "native_bundle_digest": sha(bundle_raw), "target_digest": target.target_digest(), "dataset": source.dataset_id,
        "symbol": source.symbol, "timeframe": source.timeframe, "window": {
            "start": source.calibration.data_start.isoformat(), "end_exclusive": source.calibration.data_end_exclusive.isoformat()},
        "seed": source.calibration.random_seed, "snapshot_id": target.snapshot_id, "snapshot_byte_digest": snapshot_before,
        "selection_part_byte_digest": target.source_selection_part_digest, "engine_version": result.engine_version,
        "audit_receipt": audit, "isolated_network_namespace": True, "limits": result.enforced_limits,
        "elapsed_seconds": result.elapsed_seconds, "peak_rss_bytes": result.peak_rss_bytes,
        "output_files": result.output_files, "output_bytes": result.output_bytes, "output_sha256": output_hashes,
        "parent_bytes_unchanged": True, "scratch_retired": retired, "child_alive": False,
        "admission_connected": False, "retention_registered": False}))


if __name__ == "__main__":
    main()
