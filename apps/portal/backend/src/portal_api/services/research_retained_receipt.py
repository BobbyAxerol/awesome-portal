"""Lease-bound P05 retention of the current P10 child receipt.

This is deliberately a narrow, real-data table, not a fabricated advanced-WFO
relation. Rich observations/trials remain PENDING_RETENTION until that source
profile actually runs. The private Control API owns reserve/seal authority;
the worker owns only local Parquet bytes on the existing durable volume.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import pyarrow as pa

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.serialization import canonicalize
from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactStore,
)
from portal_api.services.research_progress_relay import _service_principal


class ResearchRetainedReceiptError(RuntimeError):
    """A P05 private authority or sealed-byte operation failed closed."""
    code = "ARTIFACT_COMMIT_FAILED"


_RECEIPT_SCHEMA = pa.schema([
    pa.field("run_id", pa.string(), nullable=False),
    pa.field("alpha_version_id", pa.string(), nullable=False),
    pa.field("receipt_digest", pa.string(), nullable=False),
])


class ResearchRetainedReceiptClient:
    def __init__(self, *, endpoint: str, secret: str, timeout_seconds: float = 2.0) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ResearchRetainedReceiptError("P05 Control API origin is invalid")
        if len(secret.encode("utf-8")) < 16 or not 0.25 <= timeout_seconds <= 10:
            raise ResearchRetainedReceiptError("P05 private credential or timeout is invalid")
        self.endpoint = endpoint.rstrip("/") + "/internal/research/progress/artifacts"
        self.secret = secret
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_environment(cls) -> "ResearchRetainedReceiptClient | None":
        if os.getenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "false").lower() != "true":
            return None
        endpoint = os.getenv("CONTROL_API_INTERNAL_URL", "").strip()
        secret = os.getenv("INTERNAL_PRINCIPAL_SECRET", "")
        if not endpoint or not secret:
            raise ResearchRetainedReceiptError("P05 retention is enabled without a private Control API binding")
        return cls(endpoint=endpoint, secret=secret)

    def retain(
        self,
        *,
        request: ResearchRunProducerRequest,
        receipt: dict[str, Any],
        artifact_root: Path,
        fence_validator: Callable[[ArtifactFence], bool],
    ) -> str:
        research = request.research
        identity_fields = {
            "workspace_id": request.workspace_id,
            "run_id": request.run_id,
            "job_id": request.job_id,
            "worker_attempt_id": request.worker_attempt_id,
            "lease_epoch": request.lease_epoch,
            # Stable across a redelivered exact attempt, never a path supplied
            # by a browser or a source file.
            "artifact_id": "rart_" + hashlib.sha256(
                f"{request.workspace_id}:{request.run_id}:{request.worker_attempt_id}".encode("utf-8")
            ).hexdigest()[:40],
        }
        reservation = self._post("reserve", {**identity_fields, "retention_class": "RESEARCH_EVIDENCE"})
        revision = reservation.get("artifact_revision")
        if (
            reservation.get("schema_version") != "research.artifact-reservation.v1"
            or reservation.get("artifact_id") != identity_fields["artifact_id"]
            or isinstance(revision, bool) or not isinstance(revision, int) or revision < 1
            or reservation.get("state") not in {"WRITING", "SEALED"}
        ):
            raise ResearchRetainedReceiptError("P05 reservation acknowledgement is incompatible")
        fence = ArtifactFence(
            workspace_id=request.workspace_id,
            run_id=request.run_id,
            worker_attempt_id=request.worker_attempt_id,
            lease_epoch=request.lease_epoch,
        )
        identity = ArtifactIdentity(
            artifact_id=identity_fields["artifact_id"],
            artifact_revision=revision,
            workspace_id=request.workspace_id,
            run_id=request.run_id,
            engine_release_id="quantbt-engine-1.1.1",
            engine_build_ref=research.adapter_contract_digest,
            request_spec_digest=research.requested_spec_digest,
            effective_spec_digest=research.effective_spec_digest,
            dataset_binding_digest=research.dataset_binding_digest,
        )
        store = ResearchArtifactStore(artifact_root / "research-retained")
        registry = ArtifactSchemaRegistry([
            ArtifactTableSchema(
                table_kind="run_receipt",
                schema_version="research.run-receipt.v1",
                arrow_schema=_RECEIPT_SCHEMA,
                id_column="run_id",
            )
        ])
        encoded = json.dumps(canonicalize(receipt), sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(encoded) > 256 * 1024:
            raise ResearchRetainedReceiptError("P05 run receipt exceeds small-document bound")
        receipt_digest = hashlib.sha256(encoded).hexdigest()
        # A timeout after byte seal but before Control API ACK must reuse the
        # original immutable candidate. Rewriting it would change completed_at
        # and turn an at-least-once callback into a false digest conflict.
        final_dir = store.artifacts_dir / identity.artifact_id
        if not final_dir.exists():
            writer = store.begin_write(
                identity=identity,
                fence=fence,
                schema_registry=registry,
                fence_validator=fence_validator,
            )
            try:
                writer.append_batch("run_receipt", pa.RecordBatch.from_arrays([
                    pa.array([request.run_id], type=pa.string()),
                    pa.array([research.alpha_version_id], type=pa.string()),
                    pa.array([receipt_digest], type=pa.string()),
                ], schema=_RECEIPT_SCHEMA))
                writer.write_small_document("run_receipt", canonicalize(receipt))
                writer.seal()
            except BaseException:
                writer.abort()
                raise
        manifest, digest = store._load_and_verify_manifest(identity.artifact_id, verify_parts=True)
        if (
            manifest.get("artifact_revision") != revision
            or manifest.get("workspace_id") != request.workspace_id
            or manifest.get("run_id") != request.run_id
            or manifest.get("worker_attempt_id") != request.worker_attempt_id
            or manifest.get("lease_epoch") != request.lease_epoch
            or manifest.get("input", {}).get("request_spec_digest") != research.requested_spec_digest
            or manifest.get("input", {}).get("effective_spec_digest") != research.effective_spec_digest
            or manifest.get("input", {}).get("dataset_binding_digest") != research.dataset_binding_digest
            or len(manifest.get("tables", [])) != 1
            or manifest["tables"][0].get("table_kind") != "run_receipt"
            or manifest["tables"][0].get("rows") != 1
            or next((doc.get("sha256") for doc in manifest.get("documents", []) if doc.get("name") == "run_receipt"), None) != receipt_digest
        ):
            raise ResearchRetainedReceiptError("P05 existing sealed candidate does not match this exact attempt receipt")
        parts = [
            {
                "table_kind": table["table_kind"],
                "schema_version": table["schema_version"],
                "part_ordinal": part["part_ordinal"],
                "relative_path": part["relative_path"],
                "part_digest": part["sha256"],
                "row_count": part["rows"],
                "byte_count": part["bytes"],
                "sequence_min": part.get("sequence_min"),
                "sequence_max": part.get("sequence_max"),
            }
            for table in manifest["tables"] for part in table["parts"]
        ]
        result = self._post("seal", {
            **identity_fields,
            "manifest_digest": digest,
            "manifest_schema_version": manifest["schema_version"],
            "total_rows": manifest["totals"]["rows"],
            "total_bytes": manifest["totals"]["bytes"],
            "parts": parts,
        })
        if result.get("schema_version") != "research.artifact-seal.v1" or result.get("sealed") is not True:
            raise ResearchRetainedReceiptError("P05 seal acknowledgement is incompatible")
        return digest

    def _post(self, operation: str, body: dict[str, Any]) -> dict[str, Any]:
        encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint + "/" + operation,
            data=encoded,
            method="POST",
            headers={
                "content-type": "application/json",
                "accept": "application/json",
                "x-portal-principal": _service_principal(self.secret),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                if response.status != 200:
                    raise ResearchRetainedReceiptError("P05 private authority rejected the operation")
                raw = response.read(8193)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ResearchRetainedReceiptError("P05 private authority is unavailable") from exc
        if len(raw) > 8192:
            raise ResearchRetainedReceiptError("P05 private acknowledgement exceeds bound")
        try:
            result = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchRetainedReceiptError("P05 private acknowledgement is not JSON") from exc
        if not isinstance(result, dict):
            raise ResearchRetainedReceiptError("P05 private acknowledgement is invalid")
        return result


__all__ = ["ResearchRetainedReceiptClient", "ResearchRetainedReceiptError"]
