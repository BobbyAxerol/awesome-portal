"""Lease-fenced private ingress for the same freshly sealed P05 artifact."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable, Iterator

from portal_api.domain.research_imported_alpha_profile import IMPORTED_ALPHA_PROFILE_DIGEST, IMPORTED_ALPHA_PROFILE_ID
from portal_api.domain.research_vn_observed_fixed_profile import VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST
from portal_api.services.research_artifacts import ArtifactFence
from portal_api.services.research_fixed_replay import (
    BATCH_ROWS, MAX_BYTES, canonical_rows_json, iter_parquet_rows, validate_source_metadata, verify_normalized_rows,
)

TABLE_SCHEMA_VERSION = "research.fixed-replay-table.v1"
SCOPE = "FIXED_OOS_RETAINED_MARKET_AND_ACCOUNT_NOT_EXECUTION_LEDGER"
_P04_PROFILE = "p04.fixed-qualification.v1"


def fixed_replay_profile(research: Any) -> tuple[str, str | None]:
    profile_id, profile_digest = research.execution_profile_id, research.execution_profile_digest
    if (profile_id, profile_digest) not in {(_P04_PROFILE, None), (IMPORTED_ALPHA_PROFILE_ID, IMPORTED_ALPHA_PROFILE_DIGEST),
            (VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST)}:
        raise ValueError("fixed replay requires an admitted digest-pinned fixed profile")
    return profile_id, profile_digest


def fixed_replay_market_symbol(research: Any) -> str:
    from portal_api.services.research_fixed_replay import _SYMBOL

    spec = research.requested_spec
    data = spec.get("data") if isinstance(spec, dict) else None
    symbol = data.get("symbol") if isinstance(data, dict) else None
    if not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol):
        raise ValueError("fixed replay requires the exact immutable requested market symbol")
    return symbol


def retained_replay_rows(root: Path, artifact_manifest: dict[str, Any]) -> Iterator[list[dict[str, Any]]]:
    tables = [table for table in artifact_manifest["tables"] if table["table_kind"] == "fixed_replay"]
    if len(tables) != 1 or tables[0]["schema_version"] != TABLE_SCHEMA_VERSION \
            or not 1 <= len(tables[0]["parts"]) <= 100:
        raise ValueError("fixed replay retained table is incompatible")
    for ordinal, part in enumerate(tables[0]["parts"], start=1):
        if part["part_ordinal"] != ordinal or not 1 <= part["bytes"] <= MAX_BYTES:
            raise ValueError("fixed replay retained part exceeds custody bounds")
        # Store._load_and_verify_manifest(verify_parts=True) already verifies
        # safe relative paths, exact rewritten part SHA, sizes and row counts.
        yield from iter_parquet_rows(root / part["relative_path"])


def retain_fixed_replay_companion(*, request: Any, source: dict[str, Any], artifact_root: Path,
                                 artifact_manifest: dict[str, Any], artifact_manifest_digest: str,
                                 identity_fields: dict[str, Any], artifact_revision: int,
                                 fence: ArtifactFence, fence_validator: Callable[[ArtifactFence], bool],
                                 post: Callable[[str, dict[str, Any]], dict[str, Any]]) -> None:
    validate_source_metadata(source)
    research = request.research
    profile_id, profile_digest = fixed_replay_profile(research)
    proof: dict[str, str] = {}
    for field, path in (("artifact_manifest_json", artifact_root / "manifest.json"),
                        ("run_receipt_json", artifact_root / "documents" / "run_receipt.json")):
        if path.is_symlink() or not path.is_file() or not 1 <= path.stat().st_size <= 196_608:
            raise ValueError("fixed replay sealed byte proof exceeds bound")
        proof[field] = path.read_text(encoding="utf-8")
    if hashlib.sha256(proof["artifact_manifest_json"].encode("utf-8")).hexdigest() != artifact_manifest_digest:
        raise ValueError("fixed replay artifact manifest proof mismatch")
    receipt = json.loads(proof["run_receipt_json"])
    if receipt.get("fixed_replay_source") != source or receipt.get("run_id") != request.run_id \
            or receipt.get("requested_spec_digest") != research.requested_spec_digest \
            or receipt.get("effective_spec_digest") != research.effective_spec_digest \
            or receipt.get("dataset_binding_digest") != research.dataset_binding_digest:
        raise ValueError("fixed replay source is not bound to this sealed run receipt")
    if source["state"] == "AVAILABLE":
        verify_normalized_rows(retained_replay_rows(artifact_root, artifact_manifest), source)
    elif any(table["table_kind"] == "fixed_replay" for table in artifact_manifest["tables"]):
        raise ValueError("fixed replay absent source unexpectedly has retained parts")
    manifest = {"schema_version": "research.fixed-replay-companion-manifest.v1",
        "workspace_id": request.workspace_id, "run_id": request.run_id,
        "artifact_id": identity_fields["artifact_id"], "artifact_revision": artifact_revision,
        "manifest_digest": artifact_manifest_digest, "requested_spec_digest": research.requested_spec_digest,
        "effective_spec_digest": research.effective_spec_digest, "dataset_binding_digest": research.dataset_binding_digest,
        "execution_profile_id": profile_id, "execution_profile_digest": profile_digest,
        "market_symbol": fixed_replay_market_symbol(research),
        "source": source, "scope": SCOPE}
    digest = hashlib.sha256(canonical_rows_json(manifest)).hexdigest()
    common = {**identity_fields, "artifact_revision": artifact_revision, "manifest_digest": artifact_manifest_digest,
        "companion_digest": digest, "manifest": manifest, **proof}

    def send(operation: str, body: dict[str, Any]) -> dict[str, Any]:
        if not fence_validator(fence):
            raise ValueError("FENCE_REJECTED: fixed replay private ingress lease is stale")
        if len(canonical_rows_json(body)) > 1024 * 1024:
            raise ValueError("fixed replay private ingress exceeds wire bound")
        return post(operation, body)

    if source["state"] == "AVAILABLE":
        # Writer produced bounded parts, but make transport chunking independent
        # of part boundaries so every batch has the exact agreed 200-row length.
        rows: list[dict[str, Any]] = []
        ordinal = 0

        def send_batch(batch: list[dict[str, Any]], batch_ordinal: int) -> None:
            result = send("fixed-replay/batches", {**common,
                "schema_version": "research.fixed-replay-companion-batch.v1", "batch_ordinal": batch_ordinal,
                "batch_digest": hashlib.sha256(canonical_rows_json(batch)).hexdigest(), "rows": batch})
            if result.get("schema_version") != "research.fixed-replay-companion-batch-receipt.v1" \
                    or result.get("state") not in {"ACCEPTED", "REPLAYED"} \
                    or type(result.get("batch_ordinal")) is not int or result["batch_ordinal"] != batch_ordinal \
                    or type(result.get("row_count")) is not int or result["row_count"] != len(batch):
                raise ValueError("fixed replay batch acknowledgement is incompatible")

        for part_rows in retained_replay_rows(artifact_root, artifact_manifest):
            for row in part_rows:
                rows.append(row)
                if len(rows) == BATCH_ROWS:
                    send_batch(rows, ordinal)
                    ordinal += 1
                    rows = []
        if rows:
            send_batch(rows, ordinal)
    result = send("fixed-replay/seal", {**common, "schema_version": "research.fixed-replay-companion-seal.v1"})
    if result.get("schema_version") != "research.fixed-replay-companion-seal-receipt.v1" \
            or result.get("state") not in {"SEALED", "REPLAYED"} or result.get("companion_digest") != digest:
        raise ValueError("fixed replay seal acknowledgement is incompatible")
