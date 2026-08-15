from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse

from portal_api.domain.portal_registry import PortalRegistryDocument


router = APIRouter(prefix="/api/v1/portal", tags=["portal"])


@router.get(
    "/registry",
    response_model=PortalRegistryDocument,
    responses={304: {"description": "Registry content has not changed."}},
)
async def portal_registry(
    request: Request,
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    service = request.app.state.portal_registry_service
    if service.matches_if_none_match(if_none_match):
        return Response(status_code=304, headers=service.headers)
    return JSONResponse(content=service.response_document(), headers=service.headers)


__all__ = ["router"]
