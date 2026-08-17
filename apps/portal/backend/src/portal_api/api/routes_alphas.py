from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

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


__all__ = ["router"]
