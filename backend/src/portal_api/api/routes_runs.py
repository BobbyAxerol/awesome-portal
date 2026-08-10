"""Run, artifact and export API routes (Phase P4, plan §9/§12/§20)."""

from __future__ import annotations

import asyncio
import json
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse

from portal_api.domain.enums import RunState
from portal_api.domain.errors import PortalDomainError
from portal_api.domain.requests import PortalRunRequest
from portal_api.services.export_service import export_bundle

router = APIRouter(prefix="/api/runs")

_SEGMENT_KEYS = ("is", "oos", "holdout_live", "stitched")


def _manager(request: Request):
    return request.app.state.run_manager


def _artifacts(request: Request):
    return request.app.state.artifact_repository


def _read_artifact(request: Request, run_id: str, path: str) -> dict:
    try:
        return _artifacts(request).read_json(run_id, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"artifact {path} not found") from exc


def _read_frame_records(request: Request, run_id: str, path: str) -> list[dict]:
    from portal_api.serialization import canonicalize

    try:
        import pandas as pd

        frame = pd.read_parquet(_artifacts(request).run_directory(run_id) / path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"artifact {path} not found") from exc
    return canonicalize(frame.to_dict(orient="records"))


def _require_completed(request: Request, run_id: str) -> dict:
    status = _manager(request).status(run_id)
    if status is None:
        raise HTTPException(status_code=404, detail="run not found")
    if status.get("state") != RunState.COMPLETED.value:
        raise HTTPException(status_code=409, detail=f"run state is {status.get('state')}")
    return status


@router.post("", status_code=202)
async def create_run(payload: PortalRunRequest, request: Request) -> dict:
    # Synchronous preflight: the submitted configuration must already be valid.
    preflight = request.app.state.preflight_service.run(payload)
    if not preflight.valid:
        raise HTTPException(status_code=422, detail="preflight failed")
    run_id = _manager(request).submit(payload)
    return {"run_id": run_id, "status": RunState.QUEUED.value}


@router.get("")
async def list_runs(request: Request) -> list[dict]:
    return _manager(request).list_runs()


@router.get("/{run_id}")
async def get_run(run_id: str, request: Request) -> dict:
    status = _manager(request).status(run_id)
    if status is None:
        raise HTTPException(status_code=404, detail="run not found")
    return {**status, "status": status.get("state", "UNKNOWN")}


@router.get("/{run_id}/events")
async def run_events(run_id: str, request: Request) -> StreamingResponse:
    manager = _manager(request)

    async def stream():
        last = 0
        while True:
            status = manager.status(run_id)
            if status is None:
                yield "event: error\ndata: {\"code\":\"RUN_NOT_FOUND\"}\n\n"
                return
            events = status.get("events", [])
            while last < len(events):
                yield f"data: {json.dumps(events[last], sort_keys=True)}\n\n"
                last += 1
            if status.get("state") in {
                RunState.COMPLETED.value,
                RunState.FAILED.value,
                RunState.CANCELLED.value,
            }:
                yield f"data: {json.dumps({'state': status['state'], 'final': True}, sort_keys=True)}\n\n"
                return
            await asyncio.sleep(0.3)

    return StreamingResponse(stream(), media_type="text/event-stream")


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request) -> dict:
    cancelled = _manager(request).cancel(run_id)
    if not cancelled:
        raise HTTPException(status_code=409, detail="run is already terminal or unknown")
    return {"run_id": run_id, "status": "CANCELLING"}


@router.get("/{run_id}/summary")
async def run_summary(run_id: str, request: Request) -> dict:
    _require_completed(request, run_id)
    return {
        "selected_params": _read_artifact(request, run_id, "selection/selected_params.json"),
        "selection_trace": _read_artifact(request, run_id, "selection/selection_trace.json"),
        "metrics": _read_artifact(request, run_id, "metrics.json"),
    }


@router.get("/{run_id}/wfo/folds")
async def wfo_folds(
    run_id: str,
    request: Request,
    fold_id: int | None = None,
    top_n: Annotated[int | None, Query(ge=1)] = None,
) -> list[dict]:
    _require_completed(request, run_id)
    rows = _read_frame_records(request, run_id, "wfo/folds.parquet")
    if fold_id is not None:
        rows = [row for row in rows if row.get("fold_id") == fold_id]
    if top_n is not None:
        rows = rows[:top_n]
    return rows


@router.get("/{run_id}/wfo/trials")
async def wfo_trials(
    run_id: str,
    request: Request,
    fold_id: int | None = None,
    pruned: bool | None = None,
    top_n: Annotated[int | None, Query(ge=1)] = None,
    sort_by: str | None = None,
    sort_order: Literal["asc", "desc"] = "desc",
) -> list[dict]:
    _require_completed(request, run_id)
    rows = _read_frame_records(request, run_id, "wfo/trials.parquet")
    if fold_id is not None:
        rows = [row for row in rows if row.get("fold_id") == fold_id or row.get("study_id") == fold_id]
    if pruned is not None:
        rows = [row for row in rows if bool(row.get("pruned")) is pruned]
    if sort_by and rows:
        rows = sorted(rows, key=lambda row: row.get(sort_by) is None, reverse=sort_order == "asc")
        rows = sorted(rows, key=lambda row: row.get(sort_by), reverse=sort_order == "desc")
    if top_n is not None:
        rows = rows[:top_n]
    return rows


@router.get("/{run_id}/wfo/candidates")
async def wfo_candidates(
    run_id: str,
    request: Request,
    top_n: Annotated[int | None, Query(ge=1)] = None,
) -> list[dict]:
    _require_completed(request, run_id)
    rows = _read_frame_records(request, run_id, "wfo/candidates.parquet")
    if top_n is not None:
        rows = rows[:top_n]
    return rows


@router.get("/{run_id}/wfo/parameters")
async def wfo_parameters(run_id: str, request: Request) -> dict:
    _require_completed(request, run_id)
    params_by_fold = {}
    try:
        params_by_fold = _artifacts(request).read_json(run_id, "wfo/params_by_fold.json")
    except FileNotFoundError:
        pass
    return {
        "params_by_fold": params_by_fold,
        "selected": _read_artifact(request, run_id, "selection/selected_params.json"),
    }


@router.get("/{run_id}/selection/trace")
async def selection_trace(run_id: str, request: Request) -> dict:
    _require_completed(request, run_id)
    return _read_artifact(request, run_id, "selection/selection_trace.json")


@router.get("/{run_id}/series/{segment}")
async def segment_series(
    run_id: str,
    segment: str,
    request: Request,
    start: str | None = None,
    end: str | None = None,
    max_points: Annotated[int | None, Query(ge=10, le=100_000)] = None,
) -> dict:
    _require_completed(request, run_id)
    if segment not in _SEGMENT_KEYS:
        raise HTTPException(status_code=404, detail=f"unknown segment: {segment}")
    import pandas as pd

    path = "series/stitched.parquet" if segment == "stitched" else f"series/{segment}.parquet"
    try:
        frame = pd.read_parquet(_artifacts(request).run_directory(run_id) / path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"segment {segment} not available") from exc
    if start:
        frame = frame.loc[frame.index >= pd.Timestamp(start)]
    if end:
        frame = frame.loc[frame.index < pd.Timestamp(end)]
    if max_points and len(frame) > max_points:
        stride = len(frame) / max_points
        keep = sorted({int(i * stride) for i in range(max_points - 1)} | {len(frame) - 1})
        frame = frame.iloc[keep]
    return {
        "segment": segment,
        "timestamps": [str(ts) for ts in frame.index],
        "series": {column: frame[column].tolist() for column in frame.columns},
    }


@router.get("/{run_id}/audit")
async def run_audit(run_id: str, request: Request) -> dict:
    _require_completed(request, run_id)
    return {
        "manifest": _read_artifact(request, run_id, "manifest.json"),
        "config": _read_artifact(request, run_id, "config.json"),
        "strategy": _read_artifact(request, run_id, "strategy.json"),
        "metrics": _read_artifact(request, run_id, "metrics.json"),
    }


@router.get("/{run_id}/export")
async def run_export(run_id: str, request: Request) -> FileResponse:
    _require_completed(request, run_id)
    bundle = export_bundle(_artifacts(request), run_id)
    return FileResponse(bundle, media_type="application/zip", filename=bundle.name)
