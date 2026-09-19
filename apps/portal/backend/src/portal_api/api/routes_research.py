"""Read-only Research Loop API surfaces introduced by P04."""

from __future__ import annotations

from fastapi import APIRouter, Request

from portal_api.services.research_engine_catalog import ResearchEngineAtlasDocument


router = APIRouter(prefix="/api/v1/research/quantbt", tags=["research"])


@router.get("/atlas", response_model=ResearchEngineAtlasDocument)
async def research_quantbt_atlas(request: Request) -> ResearchEngineAtlasDocument:
    """Return the safe, manifest-driven Engine Atlas document.

    The document deliberately contains no wheel hashes, file paths, runtime
    handles or a callable dispatch surface. Browser code can render capability
    and refusal facts, but only a later authenticated Research operation may
    submit a typed run request.
    """
    return request.app.state.research_engine_catalog.public_document()


__all__ = ["router"]
