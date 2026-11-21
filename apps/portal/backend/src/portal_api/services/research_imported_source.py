"""Lease-bound E17 fetch of exact immutable P07 source bytes.

The worker never reads Control API's database or an upload locator. It asks
the private authority with its current job lease and verifies both digest and
entrypoint before writing one short-lived 0600 child input.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlparse

from portal_api.domain.research_imported_alpha_profile import IMPORTED_ALPHA_MAX_SOURCE_BYTES
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_progress_relay import _service_principal


class ResearchImportedSourceError(RuntimeError):
    """Exact imported source could not be obtained or verified."""

    code = "ALPHA_IMPORT_FAILED"


@dataclass(frozen=True, slots=True)
class ImportedSource:
    source_bytes: bytes
    source_digest: str
    entrypoint: str


class ResearchImportedSourceClient:
    def __init__(self, *, endpoint: str, secret: str, timeout_seconds: float = 2.0) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ResearchImportedSourceError("E17 Control API source origin is invalid")
        if len(secret.encode("utf-8")) < 16 or not 0.25 <= timeout_seconds <= 10:
            raise ResearchImportedSourceError("E17 source credential or timeout is invalid")
        self.endpoint = endpoint.rstrip("/") + "/internal/research/progress/sources/imported"
        self.secret = secret
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_environment(cls) -> "ResearchImportedSourceClient | None":
        if os.getenv("PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION", "false").strip().lower() != "true":
            return None
        endpoint = os.getenv("CONTROL_API_INTERNAL_URL", "").strip()
        secret = os.getenv("INTERNAL_PRINCIPAL_SECRET", "")
        if not endpoint or not secret:
            raise ResearchImportedSourceError("E17 imported execution is enabled without private Control API binding")
        return cls(endpoint=endpoint, secret=secret)

    def fetch(self, request: ResearchRunProducerRequest) -> ImportedSource:
        research = request.research
        if not research.is_imported_alpha or not research.imported_source_digest or not research.imported_entrypoint:
            raise ResearchImportedSourceError("E17 producer request has no imported source identity")
        body = {
            "schema_version": "research.imported-source-resolve.v1",
            "workspace_id": request.workspace_id,
            "run_id": request.run_id,
            "job_id": request.job_id,
            "worker_attempt_id": request.worker_attempt_id,
            "lease_epoch": request.lease_epoch,
            "source_digest": research.imported_source_digest,
            "entrypoint": research.imported_entrypoint,
        }
        encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        http_request = urllib.request.Request(
            self.endpoint,
            data=encoded,
            method="POST",
            headers={
                "content-type": "application/json",
                "accept": "application/json",
                "x-portal-principal": _service_principal(self.secret),
            },
        )
        try:
            with urllib.request.urlopen(http_request, timeout=self.timeout_seconds) as response:  # noqa: S310
                if response.status != 200:
                    raise ResearchImportedSourceError("E17 source authority rejected the current lease")
                raw = response.read(512 * 1024)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ResearchImportedSourceError("E17 source authority is unavailable") from exc
        try:
            payload = json.loads(raw.decode("utf-8"))
            source_bytes = base64.b64decode(payload["source_base64"], validate=True)
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError, binascii.Error) as exc:
            raise ResearchImportedSourceError("E17 source authority returned an invalid receipt") from exc
        if (
            payload.get("schema_version") != "research.imported-source.v1"
            or payload.get("source_digest") != research.imported_source_digest
            or payload.get("entrypoint") != research.imported_entrypoint
            or payload.get("byte_count") != len(source_bytes)
            or not 1 <= len(source_bytes) <= IMPORTED_ALPHA_MAX_SOURCE_BYTES
            or hashlib.sha256(source_bytes).hexdigest() != research.imported_source_digest
        ):
            raise ResearchImportedSourceError("E17 source receipt does not match the immutable run binding")
        return ImportedSource(
            source_bytes=source_bytes,
            source_digest=research.imported_source_digest,
            entrypoint=research.imported_entrypoint,
        )


__all__ = ["ImportedSource", "ResearchImportedSourceClient", "ResearchImportedSourceError"]
