"""Run, artifact and export API routes (Phase P4, plan §9/§12/§20)."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse

from portal_api.domain.enums import RunState
from portal_api.domain.errors import PortalDomainError
from portal_api.domain.requests import PortalRunRequest
from portal_api.repositories.artifacts import with_portal_provenance
from portal_api.services.export_service import export_bundle

router = APIRouter(prefix="/api/runs")

_SEGMENT_KEYS = ("is", "oos", "holdout_live", "stitched")
_PRESENTATION_KEYS = {
    "calendar": "presentation/calendar_equity.parquet",
    "rebased": "presentation/rebased_equity.parquet",
}
_CANONICAL_STAGE_ORDER = (
    "QUEUED",
    "VALIDATING_DATA",
    "WARMING_KERNEL",
    "OPTIMIZING_IS",
    "RANKING_IS_CANDIDATES",
    "REPLAYING_CANDIDATES_ON_OOS",
    "SELECTING_PARAMS",
    "FREEZING_PARAMS",
    "BACKTESTING_IS",
    "BACKTESTING_OOS",
    "BACKTESTING_HOLDOUT_LIVE",
    "BUILDING_ARTIFACTS",
    "COMPLETED",
)
_TERMINAL_STAGES = {"FAILED", "CANCELLED"}


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
    from portal_api.serialization import canonicalize_nullable

    try:
        import pandas as pd

        frame = pd.read_parquet(_artifacts(request).run_directory(run_id) / path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"artifact {path} not found") from exc
    return canonicalize_nullable(frame.to_dict(orient="records"))


def _require_completed(request: Request, run_id: str) -> dict:
    status = _manager(request).status(run_id)
    if status is None:
        raise HTTPException(status_code=404, detail="run not found")
    if status.get("state") != RunState.COMPLETED.value:
        raise HTTPException(status_code=409, detail=f"run state is {status.get('state')}")
    return status


def _optional_frame_records(request: Request, run_id: str, path: str) -> list[dict]:
    try:
        return _read_frame_records(request, run_id, path)
    except HTTPException as exc:
        if exc.status_code == 404:
            return []
        raise


def _normalize_stage_events(events: list[dict]) -> list[dict]:
    """Return a monotonic stage ledger while preserving source timestamps.

    Early prototype artifacts may contain duplicated runner callbacks or a
    lower stage after a higher worker stage. The raw status artifact remains
    untouched; this API projection exposes the canonical execution timeline.
    """
    rank = {stage: index for index, stage in enumerate(_CANONICAL_STAGE_ORDER)}
    normalized: list[dict] = []
    highest_rank = -1
    seen_terminal: set[str] = set()
    for event in events:
        state = str(event.get("state", ""))
        if state in _TERMINAL_STAGES:
            if state not in seen_terminal:
                normalized.append(event)
                seen_terminal.add(state)
            continue
        current_rank = rank.get(state)
        if current_rank is None:
            normalized.append(event)
            continue
        if current_rank <= highest_rank:
            continue
        normalized.append(event)
        highest_rank = current_rank
    return normalized


def _unique_trial_rows(rows: list[dict]) -> list[dict]:
    """Keep one search record per trial and leave candidate replays separate."""
    unique: list[dict] = []
    seen: set[tuple[object, ...]] = set()
    for row in rows:
        scope = tuple(
            row.get(key)
            for key in ("study_id", "schedule_fold_id", "fold_id")
            if key in row
        )
        trial_id = row.get("trial_id")
        key = (*scope, trial_id)
        if trial_id is not None and key in seen:
            continue
        if trial_id is not None:
            seen.add(key)
        unique.append(row)
    return unique


def _trial_stage(row: dict) -> str | None:
    direct = row.get("stage")
    if direct is not None:
        return str(direct)
    metadata = row.get("selection_metadata")
    if isinstance(metadata, dict) and metadata.get("stage") is not None:
        return str(metadata["stage"])
    raw = row.get("selection_metadata_json")
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict) and parsed.get("stage") is not None:
            return str(parsed["stage"])
    return None


def _downsample_frame(frame, max_points: int | None) -> tuple[Any, int]:
    """Return ``(frame, stride)`` where stride is 1 when no downsampling ran."""
    if max_points is None or len(frame) <= max_points:
        return frame, 1
    import math

    import numpy as np

    stride = len(frame) / max_points
    keep = {int(i * stride) for i in range(max_points - 1)} | {len(frame) - 1}
    # Preserve every null/non-null boundary so independent account segments
    # never look connected after presentation downsampling.
    for column in frame.columns:
        valid = frame[column].notna().to_numpy(dtype=bool)
        transitions = np.flatnonzero(valid[1:] != valid[:-1]) + 1
        for index in transitions:
            keep.update({max(0, int(index) - 1), int(index)})
    return frame.iloc[sorted(keep)], math.ceil(len(frame) / max_points)


def _frame_series_payload(
    frame,
    *,
    segment: str,
    source_rows: int | None = None,
    downsample_stride: int = 1,
) -> dict:
    """Build the series payload envelope.

    ``source_rows`` is the row count of the segment **before** downsampling
    (and before start/end clipping), ``returned_rows`` is the number of rows
    actually carried, and ``downsample_stride`` tells consumers whether the
    payload was thinned (1 = untouched). The frontend uses the envelope to
    present "source rows vs rendered rows" truthfully.
    """
    import pandas as pd

    return {
        "segment": segment,
        "source_rows": source_rows if source_rows is not None else len(frame),
        "returned_rows": len(frame),
        "downsample_stride": downsample_stride,
        "timestamps": [str(ts) for ts in frame.index],
        "series": {
            column: [None if pd.isna(value) else value for value in frame[column].tolist()]
            for column in frame.columns
        },
    }


@router.post("", status_code=202)
async def create_run(payload: PortalRunRequest, request: Request) -> dict:
    # Synchronous preflight: the submitted configuration must already be valid.
    preflight = request.app.state.preflight_service.run(payload)
    if not preflight.valid:
        raise HTTPException(status_code=422, detail="preflight failed")
    run_id = _manager(request).submit(payload)
    # Write the deterministic fold plan immediately so the UI can render the
    # fold timeline from second zero (the worker re-writes the same artifact).
    if preflight.fold_plan is not None:
        source_digest = (
            preflight.data_quality.get("analysis", {}).get("content_hash")
            if preflight.data_quality
            else None
        )
        _artifacts(request).write_json(
            run_id,
            "config/fold_plan.json",
            with_portal_provenance(
                "fold_plan.json",
                preflight.fold_plan,
                as_of=datetime.now(UTC).isoformat(),
                source_digest=source_digest,
            ),
        )
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


@router.get("/{run_id}/config")
async def run_config(run_id: str, request: Request) -> dict:
    if _manager(request).status(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    try:
        return _read_artifact(request, run_id, "config/request.json")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        return _read_artifact(request, run_id, "config.json")


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

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}/console")
async def run_console(run_id: str, request: Request, tail: int = 2000) -> dict:
    """Tail of the worker's captured stdout/stderr (per-trial Optuna output).

    Operational capture only — it is never parsed into structured audit
    events; the structured ledger stays the source of truth.
    """
    if _manager(request).status(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    log_path = _artifacts(request).run_directory(run_id) / "status" / "console.log"
    if not log_path.is_file():
        return {"run_id": run_id, "lines": []}
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    return {"run_id": run_id, "lines": lines[-max(1, tail):]}


@router.get("/{run_id}/progress")
async def run_progress(run_id: str, request: Request, tail: int = 200_000) -> dict:
    """Operational progress counters parsed from the worker's console capture
    (v0.1.1). Display-only estimates — the structured ledger stays the audit
    source of truth. Server-side so long runs never overflow the client tail."""
    if _manager(request).status(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    import re

    log_path = _artifacts(request).run_directory(run_id) / "status" / "console.log"
    if not log_path.is_file():
        return {"run_id": run_id, "studyStarts": 0, "trialsDone": 0, "bestByStudy": []}
    lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-max(1, tail):]

    study_starts = 0
    trials_done = 0
    best_by_study: list[int | None] = []
    pending_best: int | None = None
    trial_re = re.compile(r"Trial\s+\d+\s+finished with value:")
    best_re = re.compile(r"Best is trial\s+(\d+)")
    for line in lines:
        if "A new study created" in line:
            if study_starts > 0:
                best_by_study.append(pending_best)
            study_starts += 1
            pending_best = None
            continue
        if trial_re.search(line):
            trials_done += 1
        match = best_re.search(line)
        if match:
            pending_best = int(match.group(1))
    if study_starts > 0:
        best_by_study.append(pending_best)
    return {
        "run_id": run_id,
        "studyStarts": study_starts,
        "trialsDone": trials_done,
        "bestByStudy": best_by_study,
    }


@router.get("/{run_id}/fold-plan")
async def run_fold_plan(run_id: str, request: Request) -> dict:
    """Fold timeline artifact (v0.1.1) — available while the run executes."""
    if _manager(request).status(run_id) is None:
        raise HTTPException(status_code=404, detail="run not found")
    try:
        return _read_artifact(request, run_id, "config/fold_plan.json")
    except HTTPException as exc:
        if exc.status_code != 404:
            raise
        raise HTTPException(status_code=404, detail="fold plan not available yet") from exc


@router.get("/{run_id}/ledger")
async def run_ledger(run_id: str, request: Request) -> dict:
    """Structured stage and optimization ledger; available before completion."""
    status = _manager(request).status(run_id)
    if status is None:
        raise HTTPException(status_code=404, detail="run not found")
    trials = _unique_trial_rows(
        _optional_frame_records(request, run_id, "wfo/trials.parquet")
    )
    candidates = _optional_frame_records(request, run_id, "wfo/candidates.parquet")
    return {
        "run_id": run_id,
        "status": status.get("state", "UNKNOWN"),
        "stage_events": _normalize_stage_events(status.get("events", [])),
        "trial_events": trials,
        "candidate_events": candidates,
        "trial_ledger_ready": bool(trials),
    }


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
    stage: str | None = None,
    pruned: bool | None = None,
    top_n: Annotated[int | None, Query(ge=1)] = None,
    sort_by: str | None = None,
    sort_order: Literal["asc", "desc"] = "desc",
) -> dict:
    """Trial rows wrapped in an envelope that discloses the full population.

    ``total_rows`` is the number of unique trials stored in the artifact
    (before any filter or ``top_n`` cap), so consumers never have to *infer*
    "there may be more trials than this page" from ``len(rows) == top_n``.
    """
    _require_completed(request, run_id)
    rows = _unique_trial_rows(
        _read_frame_records(request, run_id, "wfo/trials.parquet")
    )
    total_rows = len(rows)
    if fold_id is not None:
        rows = [row for row in rows if row.get("fold_id") == fold_id or row.get("study_id") == fold_id]
    if stage is not None:
        rows = [row for row in rows if _trial_stage(row) == stage]
    if pruned is not None:
        rows = [row for row in rows if bool(row.get("pruned")) is pruned]
    if sort_by and rows:
        populated = [row for row in rows if row.get(sort_by) is not None]
        missing = [row for row in rows if row.get(sort_by) is None]
        rows = sorted(
            populated,
            key=lambda row: row.get(sort_by),
            reverse=sort_order == "desc",
        ) + missing
    if top_n is not None:
        rows = rows[:top_n]
    return {"total_rows": total_rows, "returned_rows": len(rows), "rows": rows}


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
    source_rows = len(frame)
    frame, downsample_stride = _downsample_frame(frame, max_points)
    return _frame_series_payload(
        frame,
        segment=segment,
        source_rows=source_rows,
        downsample_stride=downsample_stride,
    )


@router.get("/{run_id}/presentation/{mode}")
async def presentation_series(
    run_id: str,
    mode: str,
    request: Request,
    max_points: Annotated[int | None, Query(ge=10, le=100_000)] = None,
) -> dict:
    _require_completed(request, run_id)
    path = _PRESENTATION_KEYS.get(mode)
    if path is None:
        raise HTTPException(status_code=404, detail=f"unknown presentation mode: {mode}")
    import pandas as pd

    try:
        frame = pd.read_parquet(_artifacts(request).run_directory(run_id) / path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"presentation {mode} not available") from exc
    source_rows = len(frame)
    frame, downsample_stride = _downsample_frame(frame, max_points)
    return _frame_series_payload(
        frame,
        segment=mode,
        source_rows=source_rows,
        downsample_stride=downsample_stride,
    )


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
