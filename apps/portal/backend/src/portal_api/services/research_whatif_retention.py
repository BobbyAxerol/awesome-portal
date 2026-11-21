"""W5a A10c: seal one what-if diagnostic's results as a P05 WHATIF_GRID relation.

Order (all before the P11 ``run_completed`` event):

1. ``POST artifacts/reserve``        -- P05 reservation under the live lease
2. local P05 Parquet ``whatif_results`` + the results document, sealed on disk
3. ``POST artifacts/seal``           -- P05 manifest registration
4. ``POST artifacts/what-if/seal``   -- the immutable WHATIF_GRID relation

The worker owns only local bytes; Control API owns every state transition and
checks that the results answer exactly the admitted evaluations. The frozen
parent run is never written.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

import pyarrow as pa

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ArtifactSchemaRegistry,
    ArtifactTableSchema,
    ResearchArtifactStore,
    _sequence_transport_value,
)
from portal_api.services.research_progress_relay import _service_principal
from portal_api.services.research_retained_receipt import _problem_code


class ResearchWhatIfRetentionError(RuntimeError):
    """The what-if P05 retention lane failed closed."""

    code = "ARTIFACT_COMMIT_FAILED"


_RESULT_SCHEMA = pa.schema([
    pa.field("evaluation_key", pa.string(), nullable=False),
    pa.field("trial_id", pa.string(), nullable=False),
    pa.field("state", pa.string(), nullable=False),
    pa.field("objective", pa.string(), nullable=True),
])
_DECIMAL_TEXT = __import__("re").compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")


@dataclass(frozen=True, slots=True)
class WhatIfRetentionResult:
    manifest_digest: str
    artifact_id: str
    artifact_revision: int
    results: tuple[Mapping[str, Any], ...]


def read_whatif_results(path: Path, *, grid_key: str, evaluation_keys: set[str]) -> list[dict[str, Any]]:
    """Validate the child's bounded results document against the admitted job."""

    if path.is_symlink() or not path.is_file() or path.stat().st_size > 256 * 1024:
        raise ResearchWhatIfRetentionError("P16 what-if results document is missing or oversized")
    document = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(document, dict) or document.get("schema_version") != "research.whatif-results.v1":
        raise ResearchWhatIfRetentionError("P16 what-if results document is incompatible")
    if document.get("grid_key") != grid_key:
        raise ResearchWhatIfRetentionError("P16 what-if results answer a different grid")
    results = document.get("results")
    if not isinstance(results, list) or not 1 <= len(results) <= 81:
        raise ResearchWhatIfRetentionError("P16 what-if results are not a bounded list")
    seen: set[str] = set()
    clean: list[dict[str, Any]] = []
    for entry in results:
        if not isinstance(entry, dict):
            raise ResearchWhatIfRetentionError("P16 what-if result is invalid")
        key = entry.get("evaluation_key")
        state = entry.get("state")
        objective = entry.get("objective")
        trial_id = entry.get("trial_id")
        if not isinstance(key, str) or key in seen or key not in evaluation_keys:
            raise ResearchWhatIfRetentionError("P16 what-if result names an evaluation that was not admitted")
        if state not in {"COMPLETE", "PRUNED", "FAILED"} or not isinstance(trial_id, str) or not trial_id.isdigit():
            raise ResearchWhatIfRetentionError("P16 what-if result state is invalid")
        if state == "COMPLETE":
            if not isinstance(objective, str) or not _DECIMAL_TEXT.fullmatch(objective):
                raise ResearchWhatIfRetentionError("P16 a COMPLETE what-if result carries an exact objective")
        elif objective is not None:
            raise ResearchWhatIfRetentionError("P16 an undefined what-if result carries no objective")
        seen.add(key)
        clean.append({"evaluation_key": key, "trial_id": trial_id, "state": state, "objective": objective})
    if seen != evaluation_keys:
        raise ResearchWhatIfRetentionError("P16 what-if results do not answer every admitted evaluation")
    return sorted(clean, key=lambda item: item["evaluation_key"])


class ResearchWhatIfRetentionClient:
    def __init__(self, *, endpoint: str, secret: str, timeout_seconds: float = 5.0) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ResearchWhatIfRetentionError("P16 Control API origin is invalid")
        if len(secret.encode("utf-8")) < 16 or not 0.25 <= timeout_seconds <= 15:
            raise ResearchWhatIfRetentionError("P16 private credential or timeout is invalid")
        self.endpoint = endpoint.rstrip("/") + "/internal/research/progress/artifacts"
        self.secret = secret
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_environment(cls) -> "ResearchWhatIfRetentionClient":
        endpoint = os.getenv("CONTROL_API_INTERNAL_URL", "").strip()
        secret = os.getenv("INTERNAL_PRINCIPAL_SECRET", "")
        if not endpoint or not secret:
            raise ResearchWhatIfRetentionError("P16 what-if retention requires a private Control API binding")
        return cls(endpoint=endpoint, secret=secret)

    def retain(
        self,
        *,
        request: ResearchRunProducerRequest,
        results: list[dict[str, Any]],
        artifact_root: Path,
        fence_validator: Callable[[ArtifactFence], bool],
    ) -> WhatIfRetentionResult:
        research = request.research
        whatif = research.whatif
        if whatif is None:
            raise ResearchWhatIfRetentionError("P16 what-if retention requires a what-if job")
        identity_fields = {
            "workspace_id": request.workspace_id,
            "run_id": request.run_id,
            "job_id": request.job_id,
            "worker_attempt_id": request.worker_attempt_id,
            "lease_epoch": request.lease_epoch,
            "artifact_id": "rart_" + hashlib.sha256(
                f"{request.workspace_id}:{request.run_id}:{request.worker_attempt_id}:whatif".encode("utf-8")
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
            raise ResearchWhatIfRetentionError("P16 reservation acknowledgement is incompatible")
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
                table_kind="whatif_results",
                schema_version="research.whatif-results.v1",
                arrow_schema=_RESULT_SCHEMA,
                id_column="evaluation_key",
            )
        ])
        document = {"schema_version": "research.whatif-results.v1", "grid_key": whatif.grid_key, "results": results}
        final_dir = store.artifacts_dir / identity.artifact_id
        if not final_dir.exists():
            writer = store.begin_write(identity=identity, fence=fence, schema_registry=registry, fence_validator=fence_validator)
            try:
                writer.append_batch("whatif_results", pa.RecordBatch.from_arrays([
                    pa.array([item["evaluation_key"] for item in results], type=pa.string()),
                    pa.array([item["trial_id"] for item in results], type=pa.string()),
                    pa.array([item["state"] for item in results], type=pa.string()),
                    pa.array([item["objective"] for item in results], type=pa.string()),
                ], schema=_RESULT_SCHEMA))
                writer.write_small_document("whatif_results", document)
                writer.seal()
            except BaseException:
                writer.abort()
                raise
        manifest, digest = store._load_and_verify_manifest(identity.artifact_id, verify_parts=True)
        if (
            manifest.get("artifact_revision") != revision
            or manifest.get("run_id") != request.run_id
            or manifest.get("worker_attempt_id") != request.worker_attempt_id
            or manifest.get("lease_epoch") != request.lease_epoch
            or len(manifest.get("tables", [])) != 1
            or manifest["tables"][0].get("table_kind") != "whatif_results"
            or manifest["tables"][0].get("rows") != len(results)
        ):
            raise ResearchWhatIfRetentionError("P16 existing sealed candidate does not match this exact attempt")
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
        sealed = self._post("seal", {
            **identity_fields,
            "manifest_digest": digest,
            "manifest_schema_version": manifest["schema_version"],
            "total_rows": manifest["totals"]["rows"],
            "total_bytes": manifest["totals"]["bytes"],
            "parts": parts,
            "documents": [
                {
                    "name": item["name"],
                    "relative_path": item["relative_path"],
                    "document_digest": item["sha256"],
                    "byte_count": item["bytes"],
                }
                for item in manifest.get("documents", [])
            ],
        })
        if sealed.get("schema_version") != "research.artifact-seal.v1" or sealed.get("sealed") is not True:
            raise ResearchWhatIfRetentionError("P16 P05 seal acknowledgement is incompatible")
        relation = self._post("what-if/seal", {
            "schema_version": "research.whatif-grid-seal.v1",
            **{key: identity_fields[key] for key in ("workspace_id", "run_id", "job_id", "worker_attempt_id", "lease_epoch", "artifact_id")},
            "artifact_revision": revision,
            "manifest_digest": digest,
            "grid_key": whatif.grid_key,
            "results": results,
        })
        if relation.get("schema_version") != "research.whatif-grid-sealed.v1" or relation.get("sealed") is not True:
            raise ResearchWhatIfRetentionError("P16 WHATIF_GRID seal acknowledgement is incompatible")
        return WhatIfRetentionResult(
            manifest_digest=digest,
            artifact_id=identity_fields["artifact_id"],
            artifact_revision=revision,
            results=tuple(results),
        )

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
                    raise ResearchWhatIfRetentionError("P16 private authority rejected the operation")
                raw = response.read(8193)
        except urllib.error.HTTPError as exc:
            raise ResearchWhatIfRetentionError(f"P16 {operation} was refused ({exc.code}{_problem_code(exc)})") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ResearchWhatIfRetentionError("P16 private authority is unavailable") from exc
        if len(raw) > 8192:
            raise ResearchWhatIfRetentionError("P16 private acknowledgement exceeds bound")
        try:
            result = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchWhatIfRetentionError("P16 private acknowledgement is not JSON") from exc
        if not isinstance(result, dict):
            raise ResearchWhatIfRetentionError("P16 private acknowledgement is invalid")
        return result


__all__ = [
    "ResearchWhatIfRetentionClient",
    "ResearchWhatIfRetentionError",
    "WhatIfRetentionResult",
    "read_whatif_results",
]
