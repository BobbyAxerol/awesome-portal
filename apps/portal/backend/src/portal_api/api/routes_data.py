from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from portal_api.services.data_catalog import DataCatalogError

router = APIRouter(prefix="/api/v1/data", tags=["data"])

# P08 seals HMD frames for a future worker under this family.  A Research
# preflight response contains an opaque snapshot reference as immutable
# provenance, not a browser capability.  Keep legacy public Data Catalog
# series/quality/list endpoints from turning that reference into a raw-frame
# bypass (especially for sealed holdout bars).
_BROWSER_OPAQUE_SNAPSHOT_FAMILIES = frozenset({"research-hmd-ohlcv"})


def _require_browser_readable_snapshot(family_id: str) -> None:
    if family_id in _BROWSER_OPAQUE_SNAPSHOT_FAMILIES:
        # Match an absent object: callers must not learn whether an opaque
        # research snapshot exists, nor cause its frame to be opened.
        raise HTTPException(status_code=404, detail="snapshot not found")


@router.get("/catalog")
async def data_catalog(request: Request) -> dict:
    return request.app.state.data_catalog.public_document()


@router.get("/snapshots")
async def data_snapshots(request: Request) -> dict:
    store = request.app.state.snapshot_store
    return {
        "snapshots": [
            snapshot
            for snapshot in store.list()
            if snapshot.get("family_id") not in _BROWSER_OPAQUE_SNAPSHOT_FAMILIES
        ]
    }


@router.get("/snapshots/{snapshot_id}/quality")
async def snapshot_quality(snapshot_id: str, request: Request) -> dict:
    try:
        identity, quality = request.app.state.snapshot_store.describe(snapshot_id)
        _require_browser_readable_snapshot(identity.family_id)
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
        identity, _ = request.app.state.snapshot_store.describe(snapshot_id)
        _require_browser_readable_snapshot(identity.family_id)
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
