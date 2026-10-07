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
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

import pyarrow as pa
import pyarrow.parquet as pq

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.serialization import canonicalize
from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactStore,
    _sequence_transport_value,
    _canonical_json_bytes,
)
from portal_api.services.research_progress_relay import _service_principal
from portal_api.services.research_fixed_replay import (
    REPLAY_SCHEMA, iter_parquet_rows, rows_to_batch, validate_source_metadata, verify_fixed_replay_file,
)
from portal_api.services.research_fixed_replay_retention import (
    TABLE_SCHEMA_VERSION, fixed_replay_market_symbol, fixed_replay_profile, retain_fixed_replay_companion,
)


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
        fixed_replay_path: Path | None = None,
        window_execution_path: Path | None = None,
        audit_source_root: Path | None = None,
    ) -> str:
        research = request.research
        from portal_api.services.research_window_execution import (
            ROW_SCHEMA as window_schema, TABLE as window_table, TABLE_VERSION as window_version,
            read_rows as window_read_rows, verify_source as verify_window_source, storage_batch as window_batch,
            retain_companion,
        )
        window_source = receipt.get("window_execution_source")
        window_rows = None
        if window_source is not None:
            if window_execution_path is None or not research.is_native_fixed:
                raise ResearchRetainedReceiptError("native window execution requires its exact source file/profile")
            window_rows = window_read_rows(window_execution_path)
            verify_window_source(window_source, window_rows)
        elif window_execution_path is not None:
            raise ResearchRetainedReceiptError("window execution source file has no bound receipt")
        audit_output = None
        if research.is_final_audit:
            if audit_source_root is None or fixed_replay_path is not None:
                raise ResearchRetainedReceiptError("Pinned audit requires its own source output, not fixed replay")
            from portal_api.services.research_final_audit_retention import pinned_audit_output
            try:
                audit_output = pinned_audit_output(request, receipt, audit_source_root)
            except (OSError, ValueError, TypeError, KeyError) as exc:
                raise ResearchRetainedReceiptError("Pinned audit source custody validation failed") from exc
        elif audit_source_root is not None:
            raise ResearchRetainedReceiptError("Pinned audit output cannot enter another retention profile")
        replay_source = receipt.get("fixed_replay_source")
        replay_available = False
        if replay_source is not None:
            try:
                validate_source_metadata(replay_source)
                fixed_replay_profile(research)
                fixed_replay_market_symbol(research)
                replay_available = replay_source["state"] == "AVAILABLE"
                if fixed_replay_path is not None:
                    if not replay_available:
                        raise ValueError("fixed replay absent source unexpectedly supplied a file")
                    verify_fixed_replay_file(fixed_replay_path, replay_source)
            except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
                raise ResearchRetainedReceiptError("fixed replay source failed byte/row custody validation") from exc
        elif fixed_replay_path is not None:
            raise ResearchRetainedReceiptError("fixed replay source file has no bound metadata")
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
            engine_release_id="quantbt-engine-1.1.0" if research.qualification_binding is not None else "quantbt-engine-1.1.1",
            engine_build_ref=research.adapter_contract_digest,
            request_spec_digest=research.requested_spec_digest,
            effective_spec_digest=research.effective_spec_digest,
            dataset_binding_digest=research.dataset_binding_digest,
        )
        store = ResearchArtifactStore(artifact_root / "research-retained")
        definitions = [
            ArtifactTableSchema(
                table_kind="run_receipt",
                schema_version="research.run-receipt.v1",
                arrow_schema=_RECEIPT_SCHEMA,
                id_column="run_id",
            )
        ]
        if replay_available:
            definitions.append(ArtifactTableSchema(
                table_kind="fixed_replay", schema_version=TABLE_SCHEMA_VERSION,
                arrow_schema=REPLAY_SCHEMA, sequence_column="source_ordinal", id_column="source_ordinal",
            ))
        if window_rows is not None:
            definitions.append(ArtifactTableSchema(table_kind=window_table, schema_version=window_version,
                arrow_schema=window_schema, sequence_column="source_ordinal", id_column="source_ordinal"))
        if audit_output is not None:
            definitions.extend(table.definition for table in audit_output.tables)
        registry = ArtifactSchemaRegistry(definitions)
        encoded = json.dumps(canonicalize(receipt), sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(encoded) > 256 * 1024:
            raise ResearchRetainedReceiptError("P05 run receipt exceeds small-document bound")
        if replay_source is not None and len(encoded) > 196_608:
            raise ResearchRetainedReceiptError("fixed replay exact receipt proof exceeds private wire bound")
        receipt_digest = hashlib.sha256(encoded).hexdigest()
        # A timeout after byte seal but before Control API ACK must reuse the
        # original immutable candidate. Rewriting it would change completed_at
        # and turn an at-least-once callback into a false digest conflict.
        final_dir = store.artifacts_dir / identity.artifact_id
        if not final_dir.exists():
            if replay_available and fixed_replay_path is None:
                raise ResearchRetainedReceiptError("fresh fixed replay retention requires verified source bytes")
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
                if window_rows is not None:
                    for start in range(0, len(window_rows), 8192):
                        writer.append_batch(window_table, window_batch(window_rows[start:start + 8192]))
                    writer.write_small_document("window_execution_source", window_source)
                if audit_output is not None:
                    from portal_api.services.research_final_audit_retention import verify_audit_output_unchanged
                    assert audit_source_root is not None
                    for table in audit_output.tables:
                        parquet = pq.ParquetFile(table.path)
                        rows = 0
                        for batch in parquet.iter_batches(batch_size=128):
                            writer.append_batch(table.definition.table_kind, batch)
                            rows += batch.num_rows
                        if rows != table.source_rows:
                            raise ResearchRetainedReceiptError("Pinned audit source row count changed")
                    for name, body in audit_output.documents.items():
                        writer.write_small_document(name, body)
                    verify_audit_output_unchanged(audit_source_root, audit_output)
                if replay_available:
                    assert fixed_replay_path is not None
                    for rows in iter_parquet_rows(fixed_replay_path):
                        writer.append_batch("fixed_replay", rows_to_batch(rows))
                    # Recheck the exact raw file after streaming; its byte SHA
                    # is not the writer's rewritten Parquet part SHA.
                    verify_fixed_replay_file(fixed_replay_path, replay_source)
                writer.seal()
            except BaseException:
                writer.abort()
                raise
        manifest, digest = store._load_and_verify_manifest(identity.artifact_id, verify_parts=True)
        tables = {table.get("table_kind"): table for table in manifest.get("tables", [])}
        expected_tables = {"run_receipt", "fixed_replay"} if replay_available else {"run_receipt"}
        if window_rows is not None:
            expected_tables.add(window_table)
            if tables.get(window_table, {}).get("rows") != len(window_rows):
                raise ResearchRetainedReceiptError("native window execution sealed population changed")
        if audit_output is not None:
            expected_tables.update(table.definition.table_kind for table in audit_output.tables)
            if any(tables.get(table.definition.table_kind, {}).get("rows") != table.source_rows
                    or tables.get(table.definition.table_kind, {}).get("schema_version") != table.definition.schema_version
                    for table in audit_output.tables):
                raise ResearchRetainedReceiptError("Pinned audit sealed table scope changed")
            documents = {doc["name"]: doc for doc in manifest.get("documents", [])}
            if any(documents.get(name, {}).get("sha256") != hashlib.sha256(_canonical_json_bytes(body)).hexdigest()
                    for name, body in audit_output.documents.items()):
                raise ResearchRetainedReceiptError("Pinned audit sealed receipt changed")
        if (
            manifest.get("artifact_revision") != revision
            or manifest.get("workspace_id") != request.workspace_id
            or manifest.get("run_id") != request.run_id
            or manifest.get("worker_attempt_id") != request.worker_attempt_id
            or manifest.get("lease_epoch") != request.lease_epoch
            or manifest.get("input", {}).get("request_spec_digest") != research.requested_spec_digest
            or manifest.get("input", {}).get("effective_spec_digest") != research.effective_spec_digest
            or manifest.get("input", {}).get("dataset_binding_digest") != research.dataset_binding_digest
            or len(manifest.get("tables", [])) != len(expected_tables)
            or set(tables) != expected_tables
            or tables.get("run_receipt", {}).get("rows") != 1
            or (replay_available and (tables["fixed_replay"].get("schema_version") != TABLE_SCHEMA_VERSION
                or tables["fixed_replay"].get("rows") != replay_source["row_count"]))
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
                "sequence_min": _sequence_transport_value(part.get("sequence_min")),
                "sequence_max": _sequence_transport_value(part.get("sequence_max")),
            }
            for table in manifest["tables"] for part in table["parts"]
        ]
        if not fence_validator(fence):
            raise ResearchRetainedReceiptError("FENCE_REJECTED: P05 seal lease is stale")
        result = self._post("seal", {
            **identity_fields,
            "manifest_digest": digest,
            "manifest_schema_version": manifest["schema_version"],
            "total_rows": manifest["totals"]["rows"],
            "total_bytes": manifest["totals"]["bytes"],
            "parts": parts,
            # The run_receipt JSON document is manifest-bound and its bytes
            # are in totals.bytes; Control API checks totals = parts + documents.
            "documents": [
                {
                    "name": document["name"],
                    "relative_path": document["relative_path"],
                    "document_digest": document["sha256"],
                    "byte_count": document["bytes"],
                }
                for document in manifest.get("documents", [])
            ],
        })
        if result.get("schema_version") != "research.artifact-seal.v1" or result.get("sealed") is not True:
            raise ResearchRetainedReceiptError("P05 seal acknowledgement is incompatible")
        if audit_output is not None:
            if not fence_validator(fence):
                raise ResearchRetainedReceiptError("FENCE_REJECTED: audit proof lease is stale")
            verified = self._post("audit/seal", {**identity_fields, "artifact_revision": revision,
                "manifest_digest": digest, "result": audit_output.documents["audit_result"]})
            if verified.get("schema_version") != "research.pinned-audit-seal.v1" or verified.get("verified") is not True:
                raise ResearchRetainedReceiptError("Pinned audit proof acknowledgement is incompatible")
        if replay_source is not None:
            try:
                retain_fixed_replay_companion(
                    request=request, source=replay_source, artifact_root=final_dir, artifact_manifest=manifest,
                    artifact_manifest_digest=digest, identity_fields=identity_fields, artifact_revision=revision,
                    fence=fence, fence_validator=fence_validator, post=self._post,
                )
            except (OSError, ValueError, TypeError, KeyError) as exc:
                raise ResearchRetainedReceiptError("fixed replay private companion retention failed closed") from exc
        if window_rows is not None:
            retain_companion(root=final_dir, artifact_manifest=manifest, manifest_digest=digest,
                binding={"workspace_id": request.workspace_id, "run_id": request.run_id,
                    "artifact_id": identity.artifact_id, "artifact_revision": revision, "manifest_digest": digest,
                    "requested_spec_digest": research.requested_spec_digest, "effective_spec_digest": research.effective_spec_digest,
                    "dataset_binding_digest": research.dataset_binding_digest, "execution_profile_id": research.execution_profile_id,
                    "execution_profile_digest": research.execution_profile_digest},
                identity=identity_fields, post=self._post, fence_validator=fence_validator, fence=fence)
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
        except urllib.error.HTTPError as exc:
            # A refusal is not an outage: name the operation and the Problem
            # code (never the message or body) so the terminal event says why.
            raise ResearchRetainedReceiptError(
                f"P05 {operation} was refused ({exc.code}{_problem_code(exc)})"
            ) from exc
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



def _problem_code(exc: urllib.error.HTTPError) -> str:
    try:
        decoded = json.loads(exc.read(2048).decode("utf-8"))
    except Exception:  # an unreadable body must not mask the refusal itself
        return ""
    code = decoded.get("error", {}).get("code") if isinstance(decoded, dict) else None
    return f" {code}" if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]{1,96}", code) else ""

__all__ = ["ResearchRetainedReceiptClient", "ResearchRetainedReceiptError"]
