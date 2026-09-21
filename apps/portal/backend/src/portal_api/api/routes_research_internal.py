"""Private Research Loop adapter routes.

This route is intentionally outside the public ``/api`` namespace, has no
browser/facade path, and accepts only a Control-API signed internal principal.
It does not persist bytes or connect to the Research database; the Control API
remains the owner of custody, TTL, receipts and immutable version binding.
"""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from portal_api.auth.internal_principal import InternalPrincipalError, require_internal_principal
from portal_api.services.research_alpha_analyzer import MAX_SOURCE_BYTES, analyze_alpha_source
from portal_api.services.durable_runs import AttemptRegistry, DurableRunError
from portal_api.services.research_preflight_snapshot import (
    ResearchPreflightSnapshotError,
)

router = APIRouter(prefix="/internal/research", include_in_schema=False)


class AlphaAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    original_filename: str = Field(min_length=1, max_length=128)
    source_text: str = Field(min_length=1, max_length=MAX_SOURCE_BYTES)


class PreflightSnapshotRequest(BaseModel):
    """Bounded private request from Control API, never a browser DTO."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    requested_spec: dict[str, Any] = Field(min_length=1, max_length=64)
    requested_spec_digest: str = Field(pattern=r"^[0-9a-f]{64}$")
    required_columns: tuple[str, ...] = Field(default=("open", "high", "low", "close", "volume"), min_length=1, max_length=16)
    warmup_bars: int = Field(default=0, ge=0, le=100_000)
    requires_funding: bool = False


class ProgressCancellationRequest(BaseModel):
    """Control-API-to-worker cancellation marker, never a browser DTO."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    worker_attempt_id: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
    lease_epoch: int = Field(ge=1, le=2_147_483_647)


@router.post("/alpha-analysis")
async def analyze_imported_alpha(
    request: Request,
    body: AlphaAnalysisRequest,
) -> dict[str, object]:
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        # This is a private service-to-service boundary.  Never turn an
        # arbitrary browser header into a useful authentication oracle.
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        return analyze_alpha_source(body.source_text, body.original_filename).as_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid single-file import contract") from exc


@router.get("/engine-atlas")
async def read_engine_atlas(request: Request) -> dict[str, object]:
    """Return the already-loaded P04 manifest document to Control API only.

    This route imports no QuantBT package, starts no engine and performs no
    side effect.  The public descriptive P04 route remains unchanged; P09's
    browser-facing consumer must use Control API's same-origin boundary.
    """
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    return request.app.state.research_engine_catalog.public_document().model_dump(mode="json")


@router.post("/preflight-snapshots")
async def create_preflight_snapshot(
    request: Request,
    body: PreflightSnapshotRequest,
) -> dict[str, object]:
    """Create or reopen one shared P08 immutable snapshot.

    The Control API owns browser authentication, token TTL, manifest custody
    and later worker handoff.  This private route deliberately returns only
    metadata and never mounts under ``/api``.
    """
    try:
        require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    try:
        service = request.app.state.research_preflight_snapshot_service
        return service.build(body.model_dump(mode="python"))
    except ResearchPreflightSnapshotError as exc:
        # Control API maps this fixed private vocabulary to its same-origin
        # typed problem codes. No raw market data, source path or stack leaks.
        raise HTTPException(status_code=409, detail={"code": exc.code}) from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail="invalid preflight snapshot contract") from exc


@router.post("/progress/{run_id}/cancel")
async def request_progress_cancellation(
    run_id: str,
    request: Request,
    body: ProgressCancellationRequest,
) -> dict[str, object]:
    """Persist a bounded P11 cancel marker beside the durable worker ledger.

    Control API already performed the user/session/CSRF authorization and
    durable-job CAS before calling here. This route only accepts its signed
    private principal and cannot inspect data, invoke CLI, or mutate an
    artifact bundle.
    """

    try:
        principal = require_internal_principal(request.headers)
    except InternalPrincipalError as exc:
        raise HTTPException(status_code=401, detail="private service authentication failed") from exc
    if principal.role != "ADMIN" or "research_progress_cancel" not in principal.authn_methods:
        raise HTTPException(status_code=403, detail="private research cancellation is not authorized")
    if not run_id or len(run_id) > 160:
        raise HTTPException(status_code=400, detail="invalid durable run identity")
    root = Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "durable"
    try:
        status = AttemptRegistry(root).request_cancellation(
            run_id,
            body.worker_attempt_id,
            lease_epoch=body.lease_epoch,
        )
    except DurableRunError as exc:
        # The Control API treats a source side terminal/missing marker as a
        # bounded operational outcome, never as a reason to mutate DB state
        # back or disclose a local path.
        detail = "durable cancellation marker was not accepted"
        code = 404 if "not found" in str(exc) else 409
        raise HTTPException(status_code=code, detail=detail) from exc
    return {
        "schema_version": "research.p11.cancel-marker.v1",
        "run_id": run_id,
        "worker_attempt_id": body.worker_attempt_id,
        "status": status,
    }


__all__ = ["router"]
