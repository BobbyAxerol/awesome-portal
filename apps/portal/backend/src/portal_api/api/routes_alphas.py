from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request

from portal_api.api.ingress import ingress_request_id
from portal_api.domain.responses import PortalErrorDetail, PortalErrorResponse
from portal_api.services.alpha_import import (
    AlphaImportError,
    AlphaImportRecord,
    AlphaImportRequest,
    AlphaImportService,
)
from portal_api.services.alpha_registry import (
    AlphaLifecycleDetail,
    AlphaRegistryDocument,
    AlphaRegistryError,
    AlphaVerifyResult,
    AlphaVersionDetail,
)

router = APIRouter(prefix="/api/v1/alphas", tags=["alphas"])


@router.get("", response_model=AlphaRegistryDocument)
async def list_alphas(request: Request) -> AlphaRegistryDocument:
    return request.app.state.alpha_registry.public_document()


@router.get("/imports", response_model=list[AlphaImportRecord])
async def list_alpha_imports(request: Request) -> list[AlphaImportRecord]:
    return list(request.app.state.alpha_import_service.list())


@router.get("/{alpha_id}", response_model=AlphaRegistryDocument)
async def get_alpha(alpha_id: str, request: Request) -> AlphaRegistryDocument:
    try:
        request.app.state.alpha_registry.get(alpha_id)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return request.app.state.alpha_registry.public_document()


@router.get("/{alpha_id}/versions/{version}", response_model=AlphaVersionDetail)
async def get_alpha_version(alpha_id: str, version: str, request: Request) -> AlphaVersionDetail:
    try:
        alpha = request.app.state.alpha_registry.get_version(alpha_id, version)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AlphaVersionDetail(
        alpha_id=alpha.alpha_id,
        version=alpha.version,
        name=alpha.name,
        entrypoint=alpha.entrypoint,
        artifact_digest=alpha.artifact.digest,
        lifecycle=AlphaLifecycleDetail(
            stage=alpha.lifecycle.stage,
            quarantined=alpha.lifecycle.quarantined,
            quarantine_reason=alpha.lifecycle.quarantine_reason,
            certification=alpha.lifecycle.certification,
            promotion_evidence=alpha.lifecycle.promotion_evidence,
        ),
    )


@router.get("/{alpha_id}/versions/{version}/verify", response_model=AlphaVerifyResult)
async def verify_alpha_version(alpha_id: str, version: str, request: Request) -> AlphaVerifyResult:
    try:
        result = request.app.state.alpha_registry.verify_artifact(alpha_id, version)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AlphaVerifyResult(**result)


@router.post(
    "/import",
    response_model=AlphaImportRecord,
    responses={400: {"description": "Import rejected.", "model": PortalErrorResponse}},
)
async def import_alpha(
    payload: AlphaImportRequest, request: Request
) -> AlphaImportRecord:
    """Quarantine ingest via source reference (R11, contract §5).

    The browser never uploads code: it submits a pointer to an artifact that
    CI/owner already staged in the ingest inbox plus the expected digest. The
    server reads that file, verifies the digest, and quarantines it. The
    source registry stays immutable and imported alphas block everything
    until a certification slice promotes them.
    """
    service: AlphaImportService = request.app.state.alpha_import_service
    try:
        record = service.submit(payload)
    except AlphaImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record.state in {"INVALID_MANIFEST", "DIGEST_MISMATCH", "ALREADY_REGISTERED"}:
        raise HTTPException(
            status_code=400,
            detail=PortalErrorResponse(
                error=PortalErrorDetail(
                    code="ALPHA_IMPORT_REJECTED",
                    message=record.reason or record.state,
                ),
                request_id=ingress_request_id(request),
            ).model_dump(mode="json"),
        )
    return record


__all__ = ["router"]
