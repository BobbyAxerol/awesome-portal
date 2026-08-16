from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from portal_api.services.data_catalog import DataCatalogError

router = APIRouter(prefix="/api/v1/data", tags=["data"])


@router.get("/catalog")
async def data_catalog(request: Request) -> dict:
    return request.app.state.data_catalog.public_document()


@router.get("/snapshots")
async def data_snapshots(request: Request) -> dict:
    store = request.app.state.snapshot_store
    return {"snapshots": store.list()}


@router.get("/snapshots/{snapshot_id}/quality")
async def snapshot_quality(snapshot_id: str, request: Request) -> dict:
    try:
        _, quality, _ = request.app.state.snapshot_store.open(snapshot_id)
    except DataCatalogError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "snapshot_id": quality.snapshot_id,
        "gaps": quality.gaps,
        "duplicates": quality.duplicates,
        "rows": quality.rows,
        "gap_ratio": quality.gap_ratio,
        "passed": quality.passed,
        "reason_codes": list(quality.reason_codes),
    }


@router.get("/snapshots/{snapshot_id}/series")
async def snapshot_series(
    snapshot_id: str,
    request: Request,
    start: str | None = Query(default=None),
    end_exclusive: str | None = Query(default=None),
    max_points: int | None = Query(default=None, ge=1, le=100_000),
) -> dict:
    try:
        result = request.app.state.snapshot_store.query(
            snapshot_id,
            start=start,
            end_exclusive=end_exclusive,
            max_points=max_points,
        )
    except DataCatalogError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result


__all__ = ["router"]
