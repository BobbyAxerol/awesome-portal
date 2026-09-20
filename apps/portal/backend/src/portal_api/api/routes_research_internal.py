"""Private P07 AST-analysis adapter route.

This route is intentionally outside the public ``/api`` namespace, has no
browser/facade path, and accepts only a Control-API signed internal principal.
It does not persist bytes or connect to the Research database; the Control API
remains the owner of custody, TTL, receipts and immutable version binding.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from portal_api.auth.internal_principal import InternalPrincipalError, require_internal_principal
from portal_api.services.research_alpha_analyzer import MAX_SOURCE_BYTES, analyze_alpha_source

router = APIRouter(prefix="/internal/research", include_in_schema=False)


class AlphaAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    original_filename: str = Field(min_length=1, max_length=128)
    source_text: str = Field(min_length=1, max_length=MAX_SOURCE_BYTES)


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


__all__ = ["router"]
