from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from portal_api.services.alpha_registry import AlphaRegistryError

router = APIRouter(prefix="/api/v1/alphas", tags=["alphas"])


@router.get("")
async def list_alphas(request: Request) -> dict:
    return request.app.state.alpha_registry.public_document()


@router.get("/{alpha_id}")
async def get_alpha(alpha_id: str, request: Request) -> dict:
    try:
        alpha = request.app.state.alpha_registry.get(alpha_id)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return request.app.state.alpha_registry.public_document()


@router.get("/{alpha_id}/versions/{version}")
async def get_alpha_version(alpha_id: str, version: str, request: Request) -> dict:
    try:
        alpha = request.app.state.alpha_registry.get_version(alpha_id, version)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "alpha_id": alpha.alpha_id,
        "version": alpha.version,
        "name": alpha.name,
        "entrypoint": alpha.entrypoint,
        "artifact_digest": alpha.artifact.digest,
        "lifecycle": alpha.lifecycle.model_dump(mode="json"),
    }


@router.get("/{alpha_id}/versions/{version}/verify")
async def verify_alpha_version(alpha_id: str, version: str, request: Request) -> dict:
    try:
        result = request.app.state.alpha_registry.verify_artifact(alpha_id, version)
    except AlphaRegistryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result


__all__ = ["router"]
