from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, Request, Response
from fastapi.responses import JSONResponse

from portal_api.domain.portal_links import PortalLinksDocument
from portal_api.domain.portal_registry import PortalRegistryDocument
from portal_api.domain.portal_summary import PortalSummaryV1
from portal_api.domain.responses import PortalErrorResponse


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


@router.get(
    "/summary",
    response_model=PortalSummaryV1,
    responses={
        500: {
            "description": "Summary internal contract failure.",
            "model": PortalErrorResponse,
        }
    },
)
async def portal_summary(request: Request) -> JSONResponse:
    service = request.app.state.portal_summary_service
    summary = await service.collect_summary()
    return JSONResponse(content=summary.model_dump(mode="json"), headers=service.headers)


@router.get("/capabilities")
async def portal_capabilities(request: Request) -> JSONResponse:
    return JSONResponse(content=request.app.state.engine_capabilities.public_document())


@router.get(
    "/links",
    response_model=PortalLinksDocument,
    responses={304: {"description": "Links content has not changed."}},
)
async def portal_links(
    request: Request,
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    service = request.app.state.portal_links_service
    if service.matches_if_none_match(if_none_match):
        return Response(status_code=304, headers=service.headers)
    return JSONResponse(content=service.response_document(), headers=service.headers)


__all__ = ["router"]
