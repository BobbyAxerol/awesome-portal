from __future__ import annotations

import json

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from portal_api.domain.responses import PortalErrorDetail, PortalErrorResponse
from portal_api.services.alpha_import import (
    AlphaImportError,
    AlphaImportRecord,
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
    request: Request,
    manifest: UploadFile = File(description="alpha-manifest.v1 JSON document"),
    artifact: UploadFile = File(description="alpha artifact (wheel or source bundle)"),
) -> AlphaImportRecord:
    """Quarantine ingest: verify digest, never execute code.

    The source registry stays immutable; imports land in the runtime
    quarantine store and block everything until a certification slice
    promotes them.
    """
    service: AlphaImportService = request.app.state.alpha_import_service
    try:
        payload = json.loads((await manifest.read()).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=PortalErrorResponse(
                error=PortalErrorDetail(
                    code="ALPHA_IMPORT_INVALID_JSON", message="manifest is not valid JSON"
                )
            ).model_dump(mode="json"),
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail=PortalErrorResponse(
                error=PortalErrorDetail(
                    code="ALPHA_IMPORT_INVALID_MANIFEST",
                    message="manifest must be a JSON object",
                )
            ).model_dump(mode="json"),
        )
    try:
        record = service.submit(payload, await artifact.read())
    except AlphaImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if record.state in {"INVALID_MANIFEST", "DIGEST_MISMATCH", "ALREADY_REGISTERED"}:
        raise HTTPException(
            status_code=400,
            detail=PortalErrorResponse(
                error=PortalErrorDetail(
                    code="ALPHA_IMPORT_REJECTED",
                    message=record.reason or record.state,
                )
            ).model_dump(mode="json"),
        )
    return record


__all__ = ["router"]
