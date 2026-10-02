"""W1 row G: lease-bound RS-02 current-source retention for a Delta WFO run.

Order (all before the P11 ``run_completed`` event):

1. ``POST artifacts/reserve``            -- P05 reservation under the live lease
2. local RS-02 export                    -- QuantBT WFO output -> sealed P05 Parquet
3. ``POST artifacts/seal``               -- P05 manifest registration
4. ``POST artifacts/current-source/batches`` x N (<= 200 rows, <= 1,000,000 B)
5. ``POST artifacts/current-source/seal``
6. optional full lifecycle companion batches/seal (same fenced P05 identity)

The worker owns only local bytes; Control API owns every state transition.
Each request body is serialized once and re-sent byte-identically on a
transport failure (up to three retries).  A 409 is an immutable conflict and
fails closed immediately; so does any other non-retryable HTTP status.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping
from urllib.parse import urlparse

from portal_api.domain.research_delta_wfo_profile import delta_wfo_admitted_trials
from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter,
    CurrentSourceArtifactReceipt,
    iter_current_source_retention_batches,
    signal_notional_current_source_admission,
    causal_inner_current_source_admission,
)
from portal_api.services.research_artifacts import (
    ArtifactFence,
    ArtifactIdentity,
    ResearchArtifactStore,
    _sequence_transport_value,
)
from portal_api.services.research_progress_relay import _service_principal
from portal_api.services.research_child_audit_companion import ChildAuditCompanionCapture, digest as child_audit_digest


MAX_INGEST_BODY_BYTES = 1_000_000
TRANSPORT_RETRIES = 3
BATCH_SCHEMA_VERSION = "research.current-source-batch.v1"
SEAL_SCHEMA_VERSION = "research.current-source-seal.v1"
_TABLE_KIND_BY_ARTIFACT = {
    "observations": "OBSERVATION",
    "folds": "FOLD",
    "trials": "TRIAL",
    "candidates": "CANDIDATE",
    "selection": "SELECTION",
}
# Transient gateway/unavailable statuses are retried like a transport error
# (bounded, same bytes).  Every other non-200 status -- 400/403/404/413 and
# above all 409 -- is a deterministic refusal and fails closed at once.
_RETRYABLE_STATUSES = frozenset({502, 503, 504})



def _problem_code(exc: urllib.error.HTTPError) -> str:
    """The Control API Problem code only (bounded; never the message or body)."""

    try:
        decoded = json.loads(exc.read(2048).decode("utf-8"))
    except Exception:  # an unreadable body must not mask the refusal itself
        return ""
    code = decoded.get("error", {}).get("code") if isinstance(decoded, dict) else None
    if isinstance(code, str) and re.fullmatch(r"[A-Z0-9_]{1,96}", code):
        return f" {code}"
    return ""


class ResearchCurrentSourceRetentionError(RuntimeError):
    """The RS-02 private retention lane failed closed."""

    code = "ARTIFACT_COMMIT_FAILED"

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True, slots=True)
class CurrentSourceRetentionResult:
    receipt: CurrentSourceArtifactReceipt
    manifest_digest: str
    retained_import_digest: str
    table_rows: Mapping[str, int]
    batch_count: int
    # Retained TRIAL row states in source order (drives P11 trial events).
    trial_states: tuple[str | None, ...] = ()
    causal_trials: tuple[Mapping[str, Any], ...] = ()
    causal_fold_selections: tuple[Mapping[str, Any], ...] = ()


def retained_import_digest(batches: list[Mapping[str, Any]]) -> str:
    """Python twin of Control API ``currentSourceImportDigest``."""

    ordered = sorted(batches, key=lambda item: (str(item["table_kind"]), int(item["batch_ordinal"])))
    encoded = json.dumps(
        [
            {
                "table_kind": item["table_kind"],
                "batch_ordinal": int(item["batch_ordinal"]),
                "batch_digest": item["batch_digest"],
                "row_count": int(item["row_count"]),
            }
            for item in ordered
        ],
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _declared_wfo_oos_window(requested: Mapping[str, Any]) -> dict[str, Any]:
    """Only the immutable OOS span; WFO train windows are an interval union.

    A single initial IS interval cannot describe expanding/rolling per-fold
    training, and advanced RequestedSpec declares no holdout.
    """
    import pandas as pd
    from portal_api.services.research_enrich_analysis import declared_source_windows
    walk_forward = requested["walk_forward"]
    def utc(value: str) -> str:
        at = pd.Timestamp(value)
        return (at.tz_localize("UTC") if at.tzinfo is None else at.tz_convert("UTC")).isoformat()
    windows = declared_source_windows({"oos": {
        "start": utc(walk_forward["split_mode"]), "end_exclusive": utc(walk_forward["end_exclusive"]),
    }})
    windows["oos"]["source_locator"] = "P10.immutable_requested_spec.walk_forward:split_mode..end_exclusive"
    return windows


def encode_ingest_body(body: Mapping[str, Any]) -> bytes:
    """Serialize once; refuse a body above the 1,000,000-byte ingress cap."""

    encoded = json.dumps(body, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_INGEST_BODY_BYTES:
        raise ResearchCurrentSourceRetentionError(
            f"RS-02 private ingest body is {len(encoded)} bytes, above the {MAX_INGEST_BODY_BYTES}-byte cap"
        )
    return encoded


class ResearchCurrentSourceRetentionClient:
    def __init__(
        self,
        *,
        endpoint: str,
        secret: str,
        timeout_seconds: float = 5.0,
        retry_backoff_seconds: float = 0.25,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ResearchCurrentSourceRetentionError("RS-02 Control API origin is invalid")
        if len(secret.encode("utf-8")) < 16 or not 0.25 <= timeout_seconds <= 30:
            raise ResearchCurrentSourceRetentionError("RS-02 private credential or timeout is invalid")
        self.endpoint = endpoint.rstrip("/") + "/internal/research/progress/artifacts"
        self.secret = secret
        self.timeout_seconds = timeout_seconds
        self.retry_backoff_seconds = retry_backoff_seconds
        self._sleep = sleep

    @classmethod
    def from_environment(cls) -> "ResearchCurrentSourceRetentionClient":
        """Always required for a WFO run: there is no dark fallback."""

        if os.getenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "false").strip().lower() != "true":
            raise ResearchCurrentSourceRetentionError("RS-02 retention requires PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")
        endpoint = os.getenv("CONTROL_API_INTERNAL_URL", "").strip()
        secret = os.getenv("INTERNAL_PRINCIPAL_SECRET", "")
        if not endpoint or not secret:
            raise ResearchCurrentSourceRetentionError("RS-02 retention is enabled without a private Control API binding")
        return cls(endpoint=endpoint, secret=secret)

    def retain(
        self,
        *,
        request: ResearchRunProducerRequest,
        source_root: Path,
        artifact_root: Path,
        fence_validator: Callable[[ArtifactFence], bool],
    ) -> CurrentSourceRetentionResult:
        research = request.research
        identity_fields = {
            "workspace_id": request.workspace_id,
            "run_id": request.run_id,
            "job_id": request.job_id,
            "worker_attempt_id": request.worker_attempt_id,
            "lease_epoch": request.lease_epoch,
            "artifact_id": "rart_" + hashlib.sha256(
                f"{request.workspace_id}:{request.run_id}:{request.worker_attempt_id}".encode("utf-8")
            ).hexdigest()[:40],
        }
        # 1. reserve
        reservation = self._post("reserve", {**identity_fields, "retention_class": "RESEARCH_EVIDENCE"})
        revision = reservation.get("artifact_revision")
        if (
            reservation.get("schema_version") != "research.artifact-reservation.v1"
            or reservation.get("artifact_id") != identity_fields["artifact_id"]
            or isinstance(revision, bool) or not isinstance(revision, int) or revision < 1
            or reservation.get("state") != "WRITING"
        ):
            raise ResearchCurrentSourceRetentionError("P05 reservation acknowledgement is incompatible")

        # 2. export actual QuantBT output into sealed P05 Parquet
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
        if (store.artifacts_dir / identity.artifact_id).exists():
            # One attempt exports once. A reclaimed attempt is fenced by P11
            # and a P12 retry creates a new attempt (hence a new artifact id).
            raise ResearchCurrentSourceRetentionError("RS-02 artifact for this attempt already exists; refusing to re-export")
        export = CurrentSourceArtifactAdapter(
            source_artifacts=ArtifactRepository(source_root),
            retained_artifacts=store,
        ).export_advanced_walkforward(
            run_id=request.run_id,
            identity=identity,
            fence=fence,
            # The locked 3, or the preview long WFO's admitted count (flag on only).
            admission=(causal_inner_current_source_admission() if research.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID
                       else signal_notional_current_source_admission(delta_wfo_admitted_trials(research.requested_spec))),
            fence_validator=fence_validator,
            source_windows=_declared_wfo_oos_window(research.requested_spec),
        )
        receipt = export.receipt

        # 3. P05 seal
        manifest, manifest_digest = store._load_and_verify_manifest(identity.artifact_id, verify_parts=True)  # noqa: SLF001
        if manifest_digest != receipt.manifest_digest or manifest.get("artifact_revision") != revision:
            raise ResearchCurrentSourceRetentionError("P05 sealed manifest does not match the exported candidate")
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
            "manifest_digest": manifest_digest,
            "manifest_schema_version": manifest["schema_version"],
            "total_rows": manifest["totals"]["rows"],
            "total_bytes": manifest["totals"]["bytes"],
            "parts": parts,
            # The RS-02 export also writes manifest-bound JSON documents; their
            # bytes are in totals.bytes, so the seal names them.
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
        if sealed.get("schema_version") != "research.artifact-seal.v1" or sealed.get("sealed") is not True:
            raise ResearchCurrentSourceRetentionError("P05 seal acknowledgement is incompatible")

        # 4. batches, in the generator's fixed table order
        common = {
            **identity_fields,
            "artifact_revision": revision,
            "manifest_digest": manifest_digest,
            "source_transform_digest": receipt.source_transform_digest,
        }
        accepted: list[dict[str, Any]] = []
        trial_states: list[str | None] = []
        causal_trials: list[Mapping[str, Any]] = []
        causal_fold_selections: list[Mapping[str, Any]] = []
        for batch in iter_current_source_retention_batches(
            retained_artifacts=store,
            receipt=receipt,
            cursor_secret=os.urandom(32),
        ):
            self._post("current-source/batches", {
                **common,
                "schema_version": BATCH_SCHEMA_VERSION,
                "table_kind": batch.table_kind,
                "batch_ordinal": batch.batch_ordinal,
                "batch_digest": batch.batch_digest,
                "rows": [dict(row) for row in batch.rows],
            })
            if batch.table_kind == "TRIAL":
                for row in batch.rows:
                    state = row.get("payload", {}).get("state")
                    trial_states.append(state if isinstance(state, str) else None)
                    if research.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID:
                        payload = row["payload"]
                        facts = payload["trial_facts"]
                        causal_trials.append({"trial_id": payload["trial_id"], "source_trial_id": facts["source_trial_id"],
                                              "study_id": facts["study_id"], "state": state, "objective": payload["objective"]})
            if batch.table_kind == "FOLD" and research.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID:
                causal_fold_selections.extend({"fold_id": row["payload"]["fold_id"], **row["payload"]["causal_selection"]} for row in batch.rows)
            accepted.append({
                "table_kind": batch.table_kind,
                "batch_ordinal": batch.batch_ordinal,
                "batch_digest": batch.batch_digest,
                "row_count": len(batch.rows),
            })

        # 5. current-source seal
        table_rows = {
            portal_kind: int(receipt.table_rows[artifact_kind])
            for artifact_kind, portal_kind in _TABLE_KIND_BY_ARTIFACT.items()
        }
        import_digest = retained_import_digest(accepted)
        self._post("current-source/seal", {
            **common,
            "schema_version": SEAL_SCHEMA_VERSION,
            "source_adapter_id": receipt.source_adapter_id,
            "profile_id": receipt.profile_id,
            "retained_import_digest": import_digest,
            "table_rows": table_rows,
            "total_rows": sum(table_rows.values()),
            "summary": dict(receipt.summary),
        })
        # Additive full audit custody after the immutable five-table seal.
        # It runs in the credential-owning durable parent, never in the child.
        if export.child_audit_companion is not None:
            self._retain_child_audit(export.child_audit_companion, binding={"workspace_id": request.workspace_id, "run_id": request.run_id,
                "artifact_id": identity.artifact_id, "artifact_revision": revision,
                "manifest_digest": manifest_digest, "source_transform_digest": receipt.source_transform_digest,
                "requested_spec_digest": research.requested_spec_digest, "effective_spec_digest": research.effective_spec_digest,
                "dataset_binding_digest": research.dataset_binding_digest,
                "execution_profile_id": research.execution_profile_id, "execution_profile_digest": research.execution_profile_digest,
                "source_adapter_id": receipt.source_adapter_id, "profile_id": receipt.profile_id}, identity_fields=identity_fields)
        return CurrentSourceRetentionResult(
            receipt=receipt,
            manifest_digest=manifest_digest,
            retained_import_digest=import_digest,
            table_rows=table_rows,
            batch_count=len(accepted),
            trial_states=tuple(trial_states),
            causal_trials=tuple(causal_trials),
            causal_fold_selections=tuple(causal_fold_selections),
        )

    def _retain_child_audit(self, audit: ChildAuditCompanionCapture, *, binding: Mapping[str, Any], identity_fields: Mapping[str, Any]) -> None:
        audit_manifest = audit.bind(binding)
        envelope = {**identity_fields, "artifact_revision": binding["artifact_revision"], "manifest_digest": binding["manifest_digest"],
            "companion_digest": child_audit_digest(audit_manifest), "manifest": audit_manifest}
        for batch in audit.batches():
            ack = self._post("child-audit/batches", {"schema_version": "research.child-audit-companion-batch.v1", **envelope, **batch})
            if (ack.get("schema_version") != "research.child-audit-companion-batch-receipt.v1"
                or ack.get("accepted") is not True or ack.get("batch_ordinal") != batch["batch_ordinal"]
                or ack.get("row_count") != len(batch["rows"])):
                raise ResearchCurrentSourceRetentionError("Child-audit batch acknowledgement is incompatible")
        ack = self._post("child-audit/seal", {"schema_version": "research.child-audit-companion-seal.v1", **envelope})
        if (ack.get("schema_version") != "research.child-audit-companion-seal-receipt.v1"
            or ack.get("sealed") is not True or ack.get("companion_digest") != envelope["companion_digest"]):
            raise ResearchCurrentSourceRetentionError("Child-audit seal acknowledgement is incompatible")

    def _post(self, operation: str, body: Mapping[str, Any]) -> dict[str, Any]:
        encoded = encode_ingest_body(body)
        last_error: Exception | None = None
        for attempt in range(TRANSPORT_RETRIES + 1):
            if attempt:
                self._sleep(self.retry_backoff_seconds * attempt)
            request = urllib.request.Request(
                self.endpoint + "/" + operation,
                data=encoded,
                method="POST",
                headers={
                    "content-type": "application/json",
                    "accept": "application/json",
                    # A fresh short-lived principal per send; the body bytes
                    # are identical across retries.
                    "x-portal-principal": _service_principal(self.secret),
                },
            )
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    if response.status != 200:
                        raise ResearchCurrentSourceRetentionError(
                            f"RS-02 {operation} returned {response.status}", status=response.status
                        )
                    raw = response.read(8193)
            except urllib.error.HTTPError as exc:
                if exc.code == 409:
                    raise ResearchCurrentSourceRetentionError(
                        f"RS-02 {operation} conflicts with immutable retained facts (409{_problem_code(exc)})", status=409
                    ) from exc
                if exc.code in _RETRYABLE_STATUSES:
                    last_error = exc
                    continue
                raise ResearchCurrentSourceRetentionError(
                    f"RS-02 {operation} was refused ({exc.code}{_problem_code(exc)})", status=exc.code
                ) from exc
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
                last_error = exc
                continue
            if len(raw) > 8192:
                raise ResearchCurrentSourceRetentionError("RS-02 private acknowledgement exceeds bound")
            try:
                result = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ResearchCurrentSourceRetentionError("RS-02 private acknowledgement is not JSON") from exc
            if not isinstance(result, dict):
                raise ResearchCurrentSourceRetentionError("RS-02 private acknowledgement is invalid")
            return result
        raise ResearchCurrentSourceRetentionError(
            f"RS-02 {operation} private authority is unavailable after {TRANSPORT_RETRIES} retries"
        ) from last_error


__all__ = [
    "BATCH_SCHEMA_VERSION",
    "CurrentSourceRetentionResult",
    "MAX_INGEST_BODY_BYTES",
    "ResearchCurrentSourceRetentionClient",
    "ResearchCurrentSourceRetentionError",
    "SEAL_SCHEMA_VERSION",
    "TRANSPORT_RETRIES",
    "encode_ingest_body",
    "retained_import_digest",
]
