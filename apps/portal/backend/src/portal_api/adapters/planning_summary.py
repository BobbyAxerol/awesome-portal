from __future__ import annotations

import asyncio
import inspect
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, cast

import httpx
from pydantic import ValidationError

from portal_api.domain.portal_registry import PortalRegistryDocument
from portal_api.domain.portal_summary import (
    PLANNING_TASK_STATUSES,
    AvailabilityAuthority,
    AvailabilityProvenance,
    CapabilityAvailability,
    EvidenceValue,
    PlanningSummaryReadPort,
    PlanningSummarySnapshot,
    PortalSummaryContribution,
    PortalSummarySection,
    SummaryClock,
    SummaryContext,
    SummaryLinkItem,
    SummaryWarning,
)


PlanningSummaryMode = Literal["api", "local"]
MAX_RECENT_ITEMS = 5
DEFAULT_TIMEOUT_SECONDS = 0.5
DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024
HARD_MAX_RESPONSE_BYTES = 100 * 1024
_METRIC_KEYS = (
    "total_tasks",
    "tasks_backlog",
    "tasks_ready",
    "tasks_in_progress",
    "tasks_validating",
    "tasks_done",
    "roadmap_phase_count",
    "current_phase_id",
    "current_phase_name",
)
_STATUS_METRIC_KEYS = {
    "Backlog": "tasks_backlog",
    "Ready": "tasks_ready",
    "In Progress": "tasks_in_progress",
    "Validating": "tasks_validating",
    "Done": "tasks_done",
}


class PlanningSummaryContractError(RuntimeError):
    """The fixed Planning source cannot satisfy planning.summary.v1."""


class PlanningSummaryPayloadTooLarge(PlanningSummaryContractError):
    """The decompressed Planning response exceeded its hard body limit."""


class PlanningSummaryDeadlineExceeded(TimeoutError):
    """No safe request budget remained for the Planning summary source."""


@dataclass(frozen=True, slots=True)
class PlanningSummarySettings:
    mode: PlanningSummaryMode = "local"
    api_base_url: str | None = None
    request_timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES

    def __post_init__(self) -> None:
        if self.mode not in {"api", "local"}:
            raise ValueError("Planning summary mode must be api or local")
        if self.mode == "api" and not self.api_base_url:
            raise ValueError("Planning API mode requires a server-owned base URL")
        if not 0.1 <= self.request_timeout_seconds <= 2.0:
            raise ValueError("Planning summary timeout must be between 0.1 and 2 seconds")
        if not 1024 <= self.max_response_bytes <= HARD_MAX_RESPONSE_BYTES:
            raise ValueError(
                "Planning summary response limit must be between 1 KB and 100 KB"
            )

    @classmethod
    def from_environment(cls) -> "PlanningSummarySettings":
        mode = os.getenv("PORTAL_PLANNING_SUMMARY_MODE", "local").strip().lower()
        if mode not in {"api", "local"}:
            raise ValueError("Planning summary mode must be api or local")
        timeout_ms = os.getenv("PORTAL_PLANNING_SUMMARY_TIMEOUT_MS", "500").strip()
        max_bytes = os.getenv(
            "PORTAL_PLANNING_SUMMARY_MAX_BYTES",
            str(DEFAULT_MAX_RESPONSE_BYTES),
        ).strip()
        try:
            timeout_seconds = int(timeout_ms) / 1000
            response_limit = int(max_bytes)
        except ValueError as exc:
            raise ValueError(
                "Planning summary timeout and response limit must be integers"
            ) from exc
        return cls(
            mode=cast(PlanningSummaryMode, mode),
            api_base_url=(
                os.getenv("PORTAL_PLANNING_API_BASE_URL", "").strip() or None
            ),
            request_timeout_seconds=timeout_seconds,
            max_response_bytes=response_limit,
        )


@dataclass(frozen=True, slots=True)
class PlanningSummaryRoutes:
    roadmap: str
    task_board: str

    @classmethod
    def from_registry(cls, registry: PortalRegistryDocument) -> "PlanningSummaryRoutes":
        screens = {screen.screen_id: screen for screen in registry.screens}
        required = {"PLANNING_ROADMAP_SCREEN", "PLANNING_TASK_BOARD_SCREEN"}
        if missing := required - screens.keys():
            raise PlanningSummaryContractError(
                f"Planning summary routes are missing screen contracts: {sorted(missing)}"
            )
        selected = {screen_id: screens[screen_id] for screen_id in required}
        if any(screen.feature_id != "PLANNING" for screen in selected.values()):
            raise PlanningSummaryContractError(
                "Planning summary routes must belong to PLANNING"
            )
        return cls(
            roadmap=selected["PLANNING_ROADMAP_SCREEN"].route,
            task_board=selected["PLANNING_TASK_BOARD_SCREEN"].route,
        )


class PlanningSummaryHTTPClient(PlanningSummaryReadPort):
    """Fixed-destination, size-limited private client for planning.summary.v1."""

    def __init__(
        self,
        settings: PlanningSummarySettings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if settings.mode != "api" or settings.api_base_url is None:
            raise ValueError("Planning HTTP client requires API mode")
        base_url = self._validate_base_url(settings.api_base_url)
        self._endpoint_url = (
            f"{str(base_url).rstrip('/')}/api/v1/summary?recent_limit={MAX_RECENT_ITEMS}"
        )
        self._timeout_seconds = settings.request_timeout_seconds
        self._max_response_bytes = settings.max_response_bytes
        self._client = httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,
        )

    @staticmethod
    def _validate_base_url(value: str) -> httpx.URL:
        try:
            url = httpx.URL(value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Planning API base URL is invalid") from exc
        if url.scheme not in {"http", "https"} or not url.host:
            raise ValueError("Planning API base URL must be an HTTP(S) origin")
        if url.username or url.password:
            raise ValueError("Planning API base URL cannot contain credentials")
        if url.path not in {"", "/"} or url.query or url.fragment:
            raise ValueError(
                "Planning API base URL cannot contain path, query or fragment"
            )
        return url

    async def read_planning_summary(
        self, *, deadline: float
    ) -> PlanningSummarySnapshot:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise PlanningSummaryDeadlineExceeded("Planning summary deadline expired")
        timeout = httpx.Timeout(min(self._timeout_seconds, remaining))
        async with self._client.stream(
            "GET",
            self._endpoint_url,
            headers={"Accept": "application/json"},
            timeout=timeout,
        ) as response:
            if response.status_code != 200:
                raise httpx.HTTPStatusError(
                    "Planning summary returned a non-success status",
                    request=response.request,
                    response=response,
                )
            media_type = response.headers.get("content-type", "").partition(";")[0]
            if media_type.strip().lower() != "application/json":
                raise PlanningSummaryContractError(
                    "Planning summary response must be application/json"
                )
            content_length = response.headers.get("content-length")
            if content_length is not None:
                try:
                    declared_length = int(content_length)
                except ValueError as exc:
                    raise PlanningSummaryContractError(
                        "Planning summary Content-Length is invalid"
                    ) from exc
                if declared_length < 0:
                    raise PlanningSummaryContractError(
                        "Planning summary Content-Length cannot be negative"
                    )
                if declared_length > self._max_response_bytes:
                    raise PlanningSummaryPayloadTooLarge(
                        "Planning summary response exceeded the body limit"
                    )

            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > self._max_response_bytes:
                    raise PlanningSummaryPayloadTooLarge(
                        "Planning summary response exceeded the body limit"
                    )
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PlanningSummaryContractError(
                "Planning summary response is not valid UTF-8 JSON"
            ) from exc
        try:
            return PlanningSummarySnapshot.model_validate(decoded)
        except ValidationError as exc:
            raise PlanningSummaryContractError(
                "Planning summary response does not match planning.summary.v1"
            ) from exc

    async def aclose(self) -> None:
        await self._client.aclose()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _availability(
    *,
    state: str,
    checked_at: datetime,
    as_of: datetime | None,
    authority: AvailabilityAuthority,
    source_revision: str | None,
    reason_code: str | None = None,
    detail: str | None = None,
    retryable: bool = False,
) -> CapabilityAvailability:
    return CapabilityAvailability(
        state=state,
        reason_code=reason_code,
        detail=detail,
        retryable=retryable,
        checked_at=checked_at,
        as_of=as_of,
        stale_after_seconds=None,
        authority=authority,
        provenance=AvailabilityProvenance(
            source_revision=source_revision,
            content_digest=None,
        ),
    )


def _evidence(
    availability: CapabilityAvailability,
    value: int | str | None,
    *,
    unit: str | None = None,
) -> EvidenceValue:
    return EvidenceValue(
        availability=availability,
        value=value,
        unit=unit,
        timezone=None,
        segment=None,
        source_artifact_digest=None,
    )


class PlanningSummaryAdapter:
    """Temporary read-only BAR-01 bridge over the private Planning API."""

    source_id = "planning_current"

    def __init__(
        self,
        *,
        mode: PlanningSummaryMode,
        routes: PlanningSummaryRoutes,
        reader: PlanningSummaryReadPort | None = None,
        clock: SummaryClock = _utc_now,
    ) -> None:
        if mode == "api" and reader is None:
            raise ValueError("Planning API mode requires a summary reader")
        self._mode = mode
        self._routes = routes
        self._reader = reader
        self._clock = clock

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummaryContribution:
        del context  # registry/environment aggregation belongs to BAR-01-BE5
        checked_at = self._clock()
        if self._mode == "local":
            return self._unavailable_contribution(
                state="unavailable",
                reason_code="LOCAL_ONLY_STATE",
                detail="Planning state is browser-local and has no shared server authority.",
                warning_code="PLANNING_LOCAL_ONLY",
                warning_title="Planning is in local-only mode",
                retryable=False,
                checked_at=checked_at,
            )
        assert self._reader is not None
        try:
            snapshot = await self._reader.read_planning_summary(deadline=deadline)
        except Exception as exc:
            return self._failure_contribution(exc, checked_at=checked_at)
        return self._available_contribution(snapshot, checked_at=checked_at)

    async def aclose(self) -> None:
        if self._reader is None:
            return
        close = getattr(self._reader, "aclose", None)
        if close is None:
            return
        result = close()
        if inspect.isawaitable(result):
            await result

    @staticmethod
    def _authority() -> AvailabilityAuthority:
        return AvailabilityAuthority(
            service="roadmap-task-board-api",
            contract="planning.summary.v1",
            endpoint="/api/v1/summary",
        )

    def _available_contribution(
        self,
        snapshot: PlanningSummarySnapshot,
        *,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        available = _availability(
            state="available",
            checked_at=checked_at,
            as_of=snapshot.observed_at,
            authority=self._authority(),
            source_revision=snapshot.schema_version,
        )
        current_phase_unavailable = _availability(
            state="unavailable",
            checked_at=checked_at,
            as_of=snapshot.observed_at,
            authority=AvailabilityAuthority(
                service="roadmap-task-board-api",
                contract="planning.current-phase-marker",
                endpoint=None,
            ),
            source_revision=snapshot.schema_version,
            reason_code="CAPABILITY_NOT_IMPLEMENTED",
            detail="Planning v1 has no authoritative current-phase marker.",
            retryable=False,
        )
        metrics = {
            "total_tasks": _evidence(available, snapshot.total_tasks, unit="tasks"),
            "roadmap_phase_count": _evidence(
                available,
                snapshot.roadmap_phase_count,
                unit="phases",
            ),
            "current_phase_id": _evidence(current_phase_unavailable, None),
            "current_phase_name": _evidence(current_phase_unavailable, None),
        }
        metrics.update(
            {
                _STATUS_METRIC_KEYS[status]: _evidence(
                    available,
                    snapshot.task_counts[status],
                    unit="tasks",
                )
                for status in PLANNING_TASK_STATUSES
            }
        )
        recent_items = [
            SummaryLinkItem(
                id=f"planning-task:{item.id}",
                label=f"Task {item.id} · {item.status}",
                route=self._routes.task_board,
                resource_id=item.id,
                observed_at=item.updated_at,
                authority=self.source_id,
            )
            for item in snapshot.recent_tasks
        ]
        recent_items.extend(
            SummaryLinkItem(
                id=f"planning-roadmap:{item.id}",
                label=f"Roadmap phase {item.id}",
                route=self._routes.roadmap,
                resource_id=item.id,
                observed_at=item.updated_at,
                authority=self.source_id,
            )
            for item in snapshot.recent_roadmap
        )
        bounded_items = tuple(
            sorted(
                recent_items,
                key=lambda item: (item.observed_at.timestamp(), item.id),
                reverse=True,
            )[:MAX_RECENT_ITEMS]
        )
        return PortalSummaryContribution(
            section=PortalSummarySection(
                source_id=self.source_id,
                feature_id="PLANNING",
                label="Roadmap & Task Board",
                availability=available,
                metrics=metrics,
                recent_items=bounded_items,
                warnings=(),
            ),
            priority_items=(),
        )

    def _failure_contribution(
        self,
        failure: Exception,
        *,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        if isinstance(
            failure,
            (
                PlanningSummaryDeadlineExceeded,
                TimeoutError,
                httpx.TimeoutException,
            ),
        ):
            return self._unavailable_contribution(
                state="unavailable",
                reason_code="UPSTREAM_TIMEOUT",
                detail="Planning summary did not respond within its deadline.",
                warning_code="PLANNING_SUMMARY_TIMEOUT",
                warning_title="Planning summary timed out",
                retryable=True,
                checked_at=checked_at,
            )
        if isinstance(failure, httpx.HTTPStatusError):
            status_code = failure.response.status_code
            if status_code in {408, 504}:
                return self._unavailable_contribution(
                    state="unavailable",
                    reason_code="UPSTREAM_TIMEOUT",
                    detail="Planning summary did not respond within its deadline.",
                    warning_code="PLANNING_SUMMARY_TIMEOUT",
                    warning_title="Planning summary timed out",
                    retryable=True,
                    checked_at=checked_at,
                )
            if status_code in {401, 403}:
                return self._unavailable_contribution(
                    state="denied",
                    reason_code="PERMISSION_DENIED",
                    detail="Planning summary access was denied.",
                    warning_code="PLANNING_SUMMARY_DENIED",
                    warning_title="Planning summary access denied",
                    retryable=False,
                    checked_at=checked_at,
                )
            if status_code != 429 and status_code < 500:
                return self._contract_failure(checked_at=checked_at)
        if isinstance(failure, (PlanningSummaryContractError, ValidationError)):
            return self._contract_failure(checked_at=checked_at)
        return self._unavailable_contribution(
            state="unavailable",
            reason_code="UPSTREAM_UNAVAILABLE",
            detail="Planning summary is currently unavailable.",
            warning_code="PLANNING_SUMMARY_UNAVAILABLE",
            warning_title="Planning summary unavailable",
            retryable=True,
            checked_at=checked_at,
        )

    def _contract_failure(self, *, checked_at: datetime) -> PortalSummaryContribution:
        return self._unavailable_contribution(
            state="unavailable",
            reason_code="INCOMPATIBLE_CONTRACT",
            detail="Planning summary did not match its expected contract.",
            warning_code="PLANNING_SUMMARY_INCOMPATIBLE",
            warning_title="Planning summary contract mismatch",
            retryable=False,
            checked_at=checked_at,
        )

    def _unavailable_contribution(
        self,
        *,
        state: str,
        reason_code: str,
        detail: str,
        warning_code: str,
        warning_title: str,
        retryable: bool,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        unavailable = _availability(
            state=state,
            checked_at=checked_at,
            as_of=None,
            authority=self._authority(),
            source_revision=None,
            reason_code=reason_code,
            detail=detail,
            retryable=retryable,
        )
        metrics = {
            key: _evidence(
                unavailable,
                None,
                unit="tasks"
                if key == "total_tasks" or key.startswith("tasks_")
                else "phases"
                if key == "roadmap_phase_count"
                else None,
            )
            for key in _METRIC_KEYS
        }
        return PortalSummaryContribution(
            section=PortalSummarySection(
                source_id=self.source_id,
                feature_id="PLANNING",
                label="Roadmap & Task Board",
                availability=unavailable,
                metrics=metrics,
                recent_items=(),
                warnings=(
                    SummaryWarning(
                        code=warning_code,
                        severity="warning",
                        title=warning_title,
                        detail=detail,
                        observed_at=checked_at,
                        evidence_digest=None,
                    ),
                ),
            ),
            priority_items=(),
        )


__all__ = [
    "PlanningSummaryAdapter",
    "PlanningSummaryContractError",
    "PlanningSummaryDeadlineExceeded",
    "PlanningSummaryHTTPClient",
    "PlanningSummaryPayloadTooLarge",
    "PlanningSummaryRoutes",
    "PlanningSummarySettings",
]
