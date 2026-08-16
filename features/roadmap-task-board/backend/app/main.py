"""FastAPI application with legacy compatibility and a safe v1 task API."""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from backend.app.api.schemas import (
    PlanningSummaryResponse,
    RestoreRequest,
    RoadmapMove,
    RoadmapPhaseCreate,
    RoadmapPhaseUpdate,
    SnapshotImport,
    TaskCreate,
    TaskMove,
    TaskTransition,
    TaskUpdate,
)
from backend.app.config import Settings
from backend.app.domain.constants import ENTITY_ROADMAP_PHASE, ENTITY_TASK
from backend.app.domain.errors import DomainError, ReadinessError
from backend.app.infrastructure.discord import DiscordWebhookService
from backend.app.infrastructure.repository import PortalRepository


LOGGER = logging.getLogger("portal.api")


class JsonLogFormatter(logging.Formatter):
    """Small structured log format that excludes request bodies and secrets."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ("request_id", "method", "path", "status_code", "duration_ms", "delivery_id", "attempt"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(level: str) -> None:
    """Configure portal loggers once without changing the host application's root logger."""
    for name in ("portal.api", "portal.discord"):
        logger = logging.getLogger(name)
        logger.setLevel(level)
        logger.propagate = False
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(JsonLogFormatter())
            logger.addHandler(handler)


def _actor(value: Optional[str], settings: Settings) -> str:
    return (value or settings.default_actor).strip()[:160] or settings.default_actor


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def _error_response(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    details: Optional[Any] = None,
) -> JSONResponse:
    error: Dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    response = JSONResponse(status_code=status_code, content={"error": error, "request_id": _request_id(request)})
    response.headers["X-Request-ID"] = _request_id(request)
    return response


async def _delivery_loop(app: FastAPI) -> None:
    while True:
        try:
            await asyncio.to_thread(app.state.discord.flush_pending)
        except Exception:  # Worker failure is observable but must not take down API traffic.
            LOGGER.exception("discord_worker_cycle_failed")
        await asyncio.sleep(15)


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    runtime = settings or Settings.from_environment()
    configure_logging(runtime.log_level)
    repository = PortalRepository(runtime.database_path)
    discord = DiscordWebhookService(repository, runtime)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        repository.initialize()
        LOGGER.info("portal_started", extra={"path": str(runtime.database_path)})
        worker = asyncio.create_task(_delivery_loop(app))
        try:
            yield
        finally:
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker
            LOGGER.info("portal_stopped")

    app = FastAPI(
        title="Quant Ecosystem Portal API",
        version="0.2.0",
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
            allow_headers=["Content-Type", "X-Portal-Actor", "X-Request-ID"],
            expose_headers=["X-Request-ID"],
        )

    @app.middleware("http")
    async def observe_request(request: Request, call_next):
        supplied_id = request.headers.get("X-Request-ID", "").strip()
        request.state.request_id = supplied_id[:80] if supplied_id else uuid.uuid4().hex
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            LOGGER.exception(
                "request_failed",
                extra={"request_id": _request_id(request), "method": request.method, "path": request.url.path},
            )
            raise
        response.headers["X-Request-ID"] = _request_id(request)
        LOGGER.info(
            "request_completed",
            extra={
                "request_id": _request_id(request),
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            },
        )
        return response

    @app.exception_handler(DomainError)
    async def domain_error_handler(request: Request, error: DomainError) -> JSONResponse:
        return _error_response(request, error.status_code, error.code, str(error))

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(request: Request, error: RequestValidationError) -> JSONResponse:
        # Pydantic's error locations explain the input issue without echoing a
        # submitted body, which could contain private task notes.
        details = [{"loc": list(item["loc"]), "msg": item["msg"], "type": item["type"]} for item in error.errors()]
        return _error_response(request, 422, "validation_error", "Request validation failed", details)

    @app.exception_handler(HTTPException)
    async def http_error_handler(request: Request, error: HTTPException) -> JSONResponse:
        message = error.detail if isinstance(error.detail, str) else "Request failed"
        code = "not_found" if error.status_code == 404 else "http_error"
        return _error_response(request, error.status_code, code, message)

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, error: Exception) -> JSONResponse:
        LOGGER.exception("unhandled_request_error", extra={"request_id": _request_id(request)})
        return _error_response(request, 500, "internal_error", "An unexpected server error occurred")

    @app.get("/api/health", tags=["compatibility"])
    def health() -> Dict[str, Any]:
        try:
            readiness = repository.readiness()
        except Exception as error:
            raise ReadinessError("Database is not ready") from error
        return {
            "ok": True,
            "service": "quant-ecosystem-portal",
            "storage": "sqlite",
            "tasks": repository.task_count(),
            "roadmap": repository.roadmap_count(),
            "outbox": readiness["outbox"],
        }

    @app.get("/api/ready", tags=["operations"])
    def ready() -> Dict[str, Any]:
        try:
            return repository.readiness()
        except Exception as error:
            raise ReadinessError("Database is not ready") from error

    @app.get(
        "/api/v1/summary",
        response_model=PlanningSummaryResponse,
        tags=["operations"],
    )
    def planning_summary(
        recent_limit: int = Query(default=5, ge=1, le=5),
    ) -> Dict[str, Any]:
        return repository.planning_summary(recent_limit=recent_limit)

    @app.get("/api/tasks", tags=["compatibility"])
    def legacy_tasks() -> Dict[str, Any]:
        initialized, items = repository.legacy_tasks()
        return {"initialized": initialized, "items": items}

    @app.put("/api/tasks", tags=["compatibility"])
    def put_legacy_tasks(items: list[Dict[str, Any]], x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        saved = repository.replace_tasks_snapshot(items, _actor(x_portal_actor, runtime))
        return {"ok": True, "saved": len(saved)}

    @app.get("/api/roadmap", tags=["compatibility"])
    def legacy_roadmap() -> Dict[str, Any]:
        initialized, items = repository.legacy_roadmap()
        return {"initialized": initialized, "items": items}

    @app.put("/api/roadmap", tags=["compatibility"])
    def put_legacy_roadmap(items: list[Dict[str, Any]], x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        saved = repository.replace_roadmap_snapshot(items, _actor(x_portal_actor, runtime))
        return {"ok": True, "saved": len(saved)}

    @app.get("/api/v1/export", tags=["operations"])
    def export_snapshot(include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return repository.export_snapshot(include_deleted=include_deleted)

    @app.get("/api/v1/tasks", tags=["tasks"])
    def list_tasks(include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return {"items": repository.list_tasks(include_deleted=include_deleted)}

    @app.post("/api/v1/tasks", status_code=201, tags=["tasks"])
    def create_task(payload: TaskCreate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.create_task(payload.model_dump(exclude_none=True), _actor(x_portal_actor, runtime))

    @app.post("/api/v1/tasks/import", tags=["tasks"])
    def import_tasks(payload: SnapshotImport, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        saved = repository.replace_tasks_snapshot(payload.items, _actor(x_portal_actor, runtime))
        return {"ok": True, "replaced": len(saved), "items": saved}

    @app.get("/api/v1/tasks/{task_id}", tags=["tasks"])
    def get_task(task_id: str, include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return repository.get_task(task_id, include_deleted=include_deleted)

    @app.patch("/api/v1/tasks/{task_id}", tags=["tasks"])
    def update_task(task_id: str, payload: TaskUpdate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        values = payload.model_dump(exclude_unset=True)
        expected_version = values.pop("expected_version", None)
        return repository.update_task(task_id, values, _actor(x_portal_actor, runtime), expected_version)

    @app.post("/api/v1/tasks/{task_id}/transition", tags=["tasks"])
    def transition_task(task_id: str, payload: TaskTransition, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.transition_task(task_id, payload.status, _actor(x_portal_actor, runtime), payload.expected_version)

    @app.post("/api/v1/tasks/{task_id}/move", tags=["tasks"])
    def move_task(task_id: str, payload: TaskMove, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.move_task(task_id, payload.status, payload.position, _actor(x_portal_actor, runtime), payload.expected_version)

    @app.delete("/api/v1/tasks/{task_id}", tags=["tasks"])
    def delete_task(task_id: str, expected_version: Optional[int] = Query(default=None), x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.delete_task(task_id, _actor(x_portal_actor, runtime), expected_version)

    @app.post("/api/v1/tasks/{task_id}/restore", tags=["tasks"])
    def restore_task(task_id: str, payload: RestoreRequest, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.restore_task(task_id, _actor(x_portal_actor, runtime), payload.expected_version)

    @app.get("/api/v1/tasks/{task_id}/activity", tags=["tasks"])
    def task_activity(task_id: str, limit: int = Query(default=50, ge=1, le=200)) -> Dict[str, Any]:
        repository.get_task(task_id, include_deleted=True)
        return {"items": repository.activity(ENTITY_TASK, task_id, limit=limit)}

    @app.get("/api/v1/roadmap", tags=["roadmap"])
    def list_roadmap(include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return {"items": repository.list_roadmap(include_deleted=include_deleted)}

    @app.post("/api/v1/roadmap", status_code=201, tags=["roadmap"])
    def create_roadmap(payload: RoadmapPhaseCreate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.create_roadmap_phase(payload.model_dump(exclude_none=True), _actor(x_portal_actor, runtime))

    @app.post("/api/v1/roadmap/import", tags=["roadmap"])
    def import_roadmap(payload: SnapshotImport, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        saved = repository.replace_roadmap_snapshot(payload.items, _actor(x_portal_actor, runtime))
        return {"ok": True, "replaced": len(saved), "items": saved}

    @app.get("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def get_roadmap(phase_id: str, include_deleted: bool = Query(default=False)) -> Dict[str, Any]:
        return repository.get_roadmap_phase(phase_id, include_deleted=include_deleted)

    @app.patch("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def update_roadmap(phase_id: str, payload: RoadmapPhaseUpdate, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        values = payload.model_dump(exclude_unset=True)
        expected_version = values.pop("expected_version", None)
        return repository.update_roadmap_phase(phase_id, values, _actor(x_portal_actor, runtime), expected_version)

    @app.post("/api/v1/roadmap/{phase_id}/move", tags=["roadmap"])
    def move_roadmap(phase_id: str, payload: RoadmapMove, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.move_roadmap_phase(phase_id, payload.position, _actor(x_portal_actor, runtime), payload.expected_version)

    @app.delete("/api/v1/roadmap/{phase_id}", tags=["roadmap"])
    def delete_roadmap(phase_id: str, expected_version: Optional[int] = Query(default=None), x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.delete_roadmap_phase(phase_id, _actor(x_portal_actor, runtime), expected_version)

    @app.post("/api/v1/roadmap/{phase_id}/restore", tags=["roadmap"])
    def restore_roadmap(phase_id: str, payload: RestoreRequest, x_portal_actor: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        return repository.restore_roadmap_phase(phase_id, _actor(x_portal_actor, runtime), payload.expected_version)

    @app.get("/api/v1/roadmap/{phase_id}/activity", tags=["roadmap"])
    def roadmap_activity(phase_id: str, limit: int = Query(default=50, ge=1, le=200)) -> Dict[str, Any]:
        repository.get_roadmap_phase(phase_id, include_deleted=True)
        return {"items": repository.activity(ENTITY_ROADMAP_PHASE, phase_id, limit=limit)}

    @app.post("/api/v1/internal/webhooks/flush", tags=["operations"], include_in_schema=False)
    def flush_webhooks() -> Dict[str, Any]:
        return {"delivered": discord.flush_pending(), "outbox": repository.delivery_summary()}

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], include_in_schema=False)
    def api_not_found(path: str) -> None:
        raise HTTPException(status_code=404, detail="API endpoint not found")

    @app.get("/", include_in_schema=False)
    def portal_root() -> FileResponse:
        if not runtime.portal_file.exists():
            raise HTTPException(status_code=500, detail="Portal HTML file not found")
        return FileResponse(runtime.portal_file, media_type="text/html; charset=utf-8", headers={"Cache-Control": "no-store"})

    @app.get("/{path:path}", include_in_schema=False)
    def portal_fallback(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        return portal_root()

    return app


app = create_app()
