"""FastAPI application with legacy compatibility for the current static portal."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from backend.app.api.schemas import (
    RestoreRequest,
    RoadmapMove,
    RoadmapPhaseCreate,
    RoadmapPhaseUpdate,
    TaskCreate,
    TaskMove,
    TaskTransition,
    TaskUpdate,
)
from backend.app.config import Settings
from backend.app.domain.constants import ENTITY_ROADMAP_PHASE, ENTITY_TASK
from backend.app.domain.errors import NotFoundError, ValidationError, VersionConflictError
from backend.app.infrastructure.discord import DiscordWebhookService
from backend.app.infrastructure.repository import PortalRepository


def _actor(value: Optional[str], settings: Settings) -> str:
    return (value or settings.default_actor).strip()[:160] or settings.default_actor


def _exception(error: Exception) -> HTTPException:
    if isinstance(error, NotFoundError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, VersionConflictError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, ValidationError):
        return HTTPException(status_code=422, detail=str(error))
    raise error


async def _delivery_loop(app: FastAPI) -> None:
    while True:
        await asyncio.to_thread(app.state.discord.flush_pending)
        await asyncio.sleep(15)


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    runtime = settings or Settings.from_environment()
    repository = PortalRepository(runtime.database_path)
    discord = DiscordWebhookService(repository, runtime)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        repository.initialize()
        worker = asyncio.create_task(_delivery_loop(app))
        try:
            yield
        finally:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker

    app = FastAPI(
        title="Quant Ecosystem Portal API",
        version="0.1.0",
        description="Lightweight Task Board, Roadmap and Discord notification backend.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = runtime
    app.state.repository = repository
    app.state.discord = discord
    if runtime.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(runtime.cors_origins),
            allow_credentials=False,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "X-Portal-Actor"],
        )

    @app.get("/api/health", tags=["compatibility"])
    def health() -> Dict[str, Any]:
        return {
            "ok": True,
            "service": "quant-ecosystem-portal",
            "storage": "sqlite",
            "tasks": repository.task_count(),
            "roadmap": repository.roadmap_count(),
        }

    @app.get("/api/tasks", tags=["compatibility"])
    def legacy_tasks() -> Dict[str, Any]:
        initialized, items = repository.legacy_tasks()
        return {"initialized": initialized, "items": items}

    @app.put("/api/tasks", tags=["compatibility"])
    def put_legacy_tasks(items: List[Dict[str, Any]], x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            saved = repository.replace_tasks_snapshot(items, _actor(x_portal_actor, runtime))
        except Exception as error:  # mapped domain errors only
            raise _exception(error)
        return {"ok": True, "saved": len(saved)}

    @app.get("/api/roadmap", tags=["compatibility"])
    def legacy_roadmap() -> Dict[str, Any]:
        initialized, items = repository.legacy_roadmap()
        return {"initialized": initialized, "items": items}

    @app.put("/api/roadmap", tags=["compatibility"])
    def put_legacy_roadmap(items: List[Dict[str, Any]], x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            saved = repository.replace_roadmap_snapshot(items, _actor(x_portal_actor, runtime))
        except Exception as error:
            raise _exception(error)
        return {"ok": True, "saved": len(saved)}

    @app.get("/api/v1/tasks", tags=["tasks"])
    def list_tasks(include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return {"items": repository.list_tasks(include_deleted=include_deleted)}

    @app.post("/api/v1/tasks", status_code=201, tags=["tasks"])
    def create_task(payload: TaskCreate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.create_task(payload.model_dump(exclude_none=True), _actor(x_portal_actor, runtime))
        except Exception as error:
            raise _exception(error)

    @app.get("/api/v1/tasks/{task_id}", tags=["tasks"])
    def get_task(task_id: str, include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        try:
            return repository.get_task(task_id, include_deleted=include_deleted)
        except Exception as error:
            raise _exception(error)

    @app.patch("/api/v1/tasks/{task_id}", tags=["tasks"])
    def update_task(task_id: str, payload: TaskUpdate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        values = payload.model_dump(exclude_unset=True)
        expected_version = values.pop("expected_version", None)
        try:
            return repository.update_task(task_id, values, _actor(x_portal_actor, runtime), expected_version)
        except Exception as error:
            raise _exception(error)

    @app.post("/api/v1/tasks/{task_id}/transition", tags=["tasks"])
    def transition_task(task_id: str, payload: TaskTransition, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.transition_task(task_id, payload.status, _actor(x_portal_actor, runtime), payload.expected_version)
        except Exception as error:
            raise _exception(error)

    @app.post("/api/v1/tasks/{task_id}/move", tags=["tasks"])
    def move_task(task_id: str, payload: TaskMove, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.move_task(task_id, payload.status, payload.position, _actor(x_portal_actor, runtime), payload.expected_version)
        except Exception as error:
            raise _exception(error)

    @app.delete("/api/v1/tasks/{task_id}", tags=["tasks"])
    def delete_task(task_id: str, expected_version: Optional[int] = Query(default=None), x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.delete_task(task_id, _actor(x_portal_actor, runtime), expected_version)
        except Exception as error:
            raise _exception(error)

    @app.post("/api/v1/tasks/{task_id}/restore", tags=["tasks"])
    def restore_task(task_id: str, payload: RestoreRequest, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.restore_task(task_id, _actor(x_portal_actor, runtime), payload.expected_version)
        except Exception as error:
            raise _exception(error)

    @app.get("/api/v1/tasks/{task_id}/activity", tags=["tasks"])
    def task_activity(task_id: str) -> Dict[str, Any]:
        try:
            repository.get_task(task_id, include_deleted=True)
        except Exception as error:
            raise _exception(error)
        return {"items": repository.activity(ENTITY_TASK, task_id)}

    @app.get("/api/v1/roadmap", tags=["roadmap"])
    def list_roadmap(include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return {"items": repository.list_roadmap(include_deleted=include_deleted)}

    @app.post("/api/v1/roadmap", status_code=201, tags=["roadmap"])
    def create_roadmap(payload: RoadmapPhaseCreate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.create_roadmap_phase(payload.model_dump(exclude_none=True), _actor(x_portal_actor, runtime))
        except Exception as error:
            raise _exception(error)

    @app.get("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def get_roadmap(phase_id: str, include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        try:
            return repository.get_roadmap_phase(phase_id, include_deleted=include_deleted)
        except Exception as error:
            raise _exception(error)

    @app.patch("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def update_roadmap(phase_id: str, payload: RoadmapPhaseUpdate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        values = payload.model_dump(exclude_unset=True)
        expected_version = values.pop("expected_version", None)
        try:
            return repository.update_roadmap_phase(phase_id, values, _actor(x_portal_actor, runtime), expected_version)
        except Exception as error:
            raise _exception(error)

    @app.post("/api/v1/roadmap/{phase_id}/move", tags=["roadmap"])
    def move_roadmap(phase_id: str, payload: RoadmapMove, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.move_roadmap_phase(phase_id, payload.position, _actor(x_portal_actor, runtime), payload.expected_version)
        except Exception as error:
            raise _exception(error)

    @app.delete("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def delete_roadmap(phase_id: str, expected_version: Optional[int] = Query(default=None), x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.delete_roadmap_phase(phase_id, _actor(x_portal_actor, runtime), expected_version)
        except Exception as error:
            raise _exception(error)

    @app.post("/api/v1/roadmap/{phase_id}/restore", tags=["roadmap"])
    def restore_roadmap(phase_id: str, payload: RestoreRequest, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        try:
            return repository.restore_roadmap_phase(phase_id, _actor(x_portal_actor, runtime), payload.expected_version)
        except Exception as error:
            raise _exception(error)

    @app.get("/api/v1/roadmap/{phase_id}/activity", tags=["roadmap"])
    def roadmap_activity(phase_id: str) -> Dict[str, Any]:
        try:
            repository.get_roadmap_phase(phase_id, include_deleted=True)
        except Exception as error:
            raise _exception(error)
        return {"items": repository.activity(ENTITY_ROADMAP_PHASE, phase_id)}

    @app.post("/api/v1/internal/webhooks/flush", tags=["operations"], include_in_schema=False)
    def flush_webhooks() -> Dict[str, Any]:
        return {"delivered": discord.flush_pending()}

    @app.get("/", include_in_schema=False)
    def portal_root() -> FileResponse:
        if not runtime.portal_file.exists():
            raise HTTPException(status_code=500, detail="Portal HTML file not found")
        return FileResponse(runtime.portal_file, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"})

    @app.get("/{path:path}", include_in_schema=False)
    def portal_fallback(path: str) -> FileResponse:
        return portal_root()

    return app


app = create_app()
