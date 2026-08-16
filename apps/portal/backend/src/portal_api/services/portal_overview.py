from __future__ import annotations

import asyncio
import inspect
import logging
import os
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Mapping, cast

from pydantic import ValidationError

from portal_api.domain.portal_registry import (
    ConcernDefinition,
    PortalEnvironment,
    PortalRegistryDocument,
)
from portal_api.domain.portal_summary import (
    FEATURE_MATURITIES,
    MAX_SUMMARY_PRIORITY_ITEMS,
    MAX_SUMMARY_SECTIONS,
    AvailabilityAuthority,
    AvailabilityProvenance,
    CapabilityAvailability,
    PortalSummaryAdapter,
    PortalSummaryContribution,
    PortalSummarySection,
    PortalSummaryV1,
    PriorityItem,
    RegistryCounts,
    SummaryClock,
    SummaryContext,
)
from portal_api.services.portal_registry import PortalRegistryService

logger = logging.getLogger("portal_api.summary")

PORTAL_ENVIRONMENTS: tuple[PortalEnvironment, ...] = (
    "local",
    "research",
    "paper",
    "sandbox",
    "live",
)
DEFAULT_DEADLINE_SECONDS = 0.5
MIN_DEADLINE_SECONDS = 0.1
MAX_DEADLINE_SECONDS = 2.0
TARGET_PAYLOAD_BYTES = 50 * 1024
HARD_PAYLOAD_BYTES = 100 * 1024
_PRIORITY_TYPE_ORDER = (
    "RUN_FAILED",
    "HISTORICAL_DATA_UNAVAILABLE",
    "REGISTRY_BLOCKING_CONCERN",
)
_BLOCKING_CONCERN_STATUSES = frozenset({"OPEN", "PARTIAL", "BLOCKED"})
_USABLE_SECTION_STATES = frozenset({"available", "degraded", "stale"})
_COMMAND_CENTER_FEATURE_ID = "COMMAND_CENTER"


class PortalSummaryContractError(RuntimeError):
    """The validated registry/adapter set cannot satisfy portal.summary.v1."""

    code = "SUMMARY_CONTRACT_FAILURE"


@dataclass(frozen=True, slots=True)
class PortalSummarySettings:
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS
    environment: PortalEnvironment = "research"

    def __post_init__(self) -> None:
        if not MIN_DEADLINE_SECONDS <= self.deadline_seconds <= MAX_DEADLINE_SECONDS:
            raise ValueError("Portal summary deadline must be between 100 and 2000 ms")
        if self.environment not in PORTAL_ENVIRONMENTS:
            raise ValueError("Portal environment must be a valid PortalEnvironment")

    @classmethod
    def from_environment(cls) -> "PortalSummarySettings":
        raw_deadline = os.getenv("PORTAL_SUMMARY_DEADLINE_MS", "500").strip()
        environment = os.getenv("PORTAL_ENVIRONMENT", "research").strip().lower()
        try:
            deadline_seconds = int(raw_deadline) / 1000
        except ValueError as exc:
            raise ValueError("PORTAL_SUMMARY_DEADLINE_MS must be an integer") from exc
        return cls(
            deadline_seconds=deadline_seconds,
            environment=cast(PortalEnvironment, environment),
        )


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


class PortalSummaryService:
    """Deadline-aware concurrent aggregation over read-only summary adapters."""

    def __init__(
        self,
        *,
        registry_service: PortalRegistryService,
        adapters: tuple[PortalSummaryAdapter, ...] | list[PortalSummaryAdapter],
        settings: PortalSummarySettings,
        clock: SummaryClock = _utc_now,
    ) -> None:
        self._registry_service = registry_service
        self._adapters = tuple(adapters)
        self._settings = settings
        self._clock = clock
        source_ids = [adapter.source_id for adapter in self._adapters]
        if len(set(source_ids)) != len(source_ids):
            raise ValueError("summary adapter source IDs must be unique")
        self._source_order = self._source_order_from_registry()

    @property
    def headers(self) -> dict[str, str]:
        return {
            "Cache-Control": "no-store",
            "Vary": "Authorization, Cookie",
        }

    @property
    def settings(self) -> PortalSummarySettings:
        return self._settings

    def _source_order_from_registry(self) -> dict[str, int]:
        document = self._registry_service.document
        command_center = next(
            (
                feature
                for feature in document.features
                if feature.id == _COMMAND_CENTER_FEATURE_ID
            ),
            None,
        )
        if command_center is None:
            return {}
        return {
            source_id: index
            for index, source_id in enumerate(command_center.summary_source_ids)
        }

    async def collect_summary(
        self, requested_at: datetime | None = None
    ) -> PortalSummaryV1:
        checked_at = self._clock()
        requested_at = requested_at or checked_at
        document = self._registry_service.document
        try:
            context = SummaryContext(
                registry_digest=document.content_digest,
                environment=self._settings.environment,
                requested_at=requested_at,
            )
        except ValidationError as exc:
            raise PortalSummaryContractError("summary context is invalid") from exc

        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._settings.deadline_seconds
        contributions = await self._collect_concurrently(context, deadline)
        sections = self._ordered_sections(contributions)
        priorities = self._merged_priorities(contributions)
        try:
            summary = PortalSummaryV1(
                schema_version="portal.summary.v1",
                registry_digest=document.content_digest,
                environment=self._settings.environment,
                requested_at=context.requested_at,
                completed_at=self._clock(),
                overall_availability=self._overall_availability(
                    sections, checked_at=checked_at
                ),
                registry_counts=self._registry_counts(),
                sections=sections,
                priority_items=priorities,
            )
        except ValidationError as exc:
            raise PortalSummaryContractError(
                "summary document failed its own contract"
            ) from exc

        encoded = summary.model_dump_json().encode("utf-8")
        if len(encoded) > HARD_PAYLOAD_BYTES:
            raise PortalSummaryContractError(
                "summary payload exceeded the hard response ceiling"
            )
        if len(encoded) > TARGET_PAYLOAD_BYTES:
            logger.warning(
                "portal summary payload %d bytes exceeds the %d byte target",
                len(encoded),
                TARGET_PAYLOAD_BYTES,
            )
        return summary

    async def _collect_concurrently(
        self, context: SummaryContext, deadline: float
    ) -> Mapping[str, PortalSummaryContribution]:
        loop = asyncio.get_running_loop()
        if not self._adapters:
            return {}
        tasks = {
            asyncio.ensure_future(adapter.collect(context, deadline=deadline)): adapter
            for adapter in self._adapters
        }
        remaining = deadline - loop.time()
        try:
            if remaining > 0:
                done, pending = await asyncio.wait(tasks, timeout=remaining)
            else:
                done, pending = set(), set(tasks)
        except asyncio.CancelledError:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

        contributions: dict[str, PortalSummaryContribution] = {}
        for task in done:
            adapter = tasks[task]
            if task.cancelled():
                failure: BaseException = asyncio.CancelledError()
            else:
                failure = task.exception()
            if failure is not None:
                logger.warning(
                    "portal summary adapter %s failed with %s",
                    adapter.source_id,
                    type(failure).__name__,
                )
                contributions[adapter.source_id] = adapter.unavailable_contribution(
                    reason_code="UPSTREAM_UNAVAILABLE",
                    checked_at=self._clock(),
                )
                continue
            result = task.result()
            if not isinstance(result, PortalSummaryContribution):
                raise PortalSummaryContractError(
                    f"summary adapter {adapter.source_id} returned an invalid contribution"
                )
            contributions[adapter.source_id] = result

        for task in pending:
            adapter = tasks[task]
            task.cancel()
            logger.warning(
                "portal summary adapter %s exceeded the hard request deadline",
                adapter.source_id,
            )
            contributions[adapter.source_id] = adapter.unavailable_contribution(
                reason_code="UPSTREAM_TIMEOUT",
                checked_at=self._clock(),
            )
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        return contributions

    def _ordered_sections(
        self, contributions: Mapping[str, PortalSummaryContribution]
    ) -> tuple[PortalSummarySection, ...]:
        sections = [contribution.section for contribution in contributions.values()]
        if len(sections) > MAX_SUMMARY_SECTIONS:
            raise PortalSummaryContractError(
                "summary produced more sections than the contract allows"
            )
        unknown_order = len(self._source_order) + 1
        return tuple(
            sorted(
                sections,
                key=lambda section: (
                    self._source_order.get(section.source_id, unknown_order),
                    section.source_id,
                ),
            )
        )

    def _merged_priorities(
        self, contributions: Mapping[str, PortalSummaryContribution]
    ) -> tuple[PriorityItem, ...]:
        items = [
            item
            for contribution in contributions.values()
            for item in contribution.priority_items
        ]
        items.extend(self._registry_blocking_concern_priorities())
        for item in items:
            if item.type not in _PRIORITY_TYPE_ORDER:
                raise PortalSummaryContractError(
                    "summary emitted a priority type that is not authorized"
                )
        if len(items) > MAX_SUMMARY_PRIORITY_ITEMS:
            raise PortalSummaryContractError(
                "summary produced more priority items than the contract allows"
            )
        return tuple(
            sorted(
                items,
                key=lambda item: (
                    _PRIORITY_TYPE_ORDER.index(item.type),
                    -item.observed_at.timestamp(),
                    item.id,
                ),
            )
        )

    def _registry_counts(self) -> RegistryCounts:
        features = self._registry_service.document.features
        by_maturity = Counter(feature.maturity for feature in features)
        return RegistryCounts(
            by_maturity={
                maturity: by_maturity.get(maturity, 0) for maturity in FEATURE_MATURITIES
            },
            blocking_concerns=len(self._blocking_concerns()),
        )

    def _blocking_concerns(self) -> tuple[ConcernDefinition, ...]:
        active_feature_ids = {
            feature.id
            for feature in self._registry_service.document.features
            if feature.maturity not in {"HIDDEN", "DEPRECATED"}
        }
        return tuple(
            concern
            for concern in self._registry_service.document.concerns
            if concern.severity == "BLOCKING"
            and concern.status in _BLOCKING_CONCERN_STATUSES
            and any(feature_id in active_feature_ids for feature_id in concern.feature_ids)
        )

    def _registry_blocking_concern_priorities(self) -> tuple[PriorityItem, ...]:
        features = {
            feature.id: feature
            for feature in self._registry_service.document.features
        }
        priorities: list[PriorityItem] = []
        for concern in self._blocking_concerns():
            feature = next(
                (
                    features[feature_id]
                    for feature_id in concern.feature_ids
                    if feature_id in features
                    and features[feature_id].maturity != "DEPRECATED"
                ),
                None,
            )
            if feature is None:
                continue
            try:
                reviewed_at = datetime.fromisoformat(concern.reviewed_at)
            except ValueError as exc:
                raise PortalSummaryContractError(
                    f"concern {concern.id} reviewed_at is invalid"
                ) from exc
            if reviewed_at.tzinfo is None or reviewed_at.utcoffset() is None:
                raise PortalSummaryContractError(
                    f"concern {concern.id} reviewed_at must include a timezone"
                )
            priorities.append(
                PriorityItem(
                    id=f"registry:blocking-concern:{concern.id}",
                    type="REGISTRY_BLOCKING_CONCERN",
                    severity="warning",
                    title=f"Registry concern {concern.id} requires attention",
                    feature_id=feature.id,
                    resource_id=None,
                    observed_at=reviewed_at,
                    authority="registry_current",
                    route=feature.canonical_route,
                    evidence_digest=None,
                )
            )
        return tuple(priorities)

    def _overall_availability(
        self,
        sections: tuple[PortalSummarySection, ...],
        *,
        checked_at: datetime,
    ) -> CapabilityAvailability:
        authority = AvailabilityAuthority(
            service="portal-api",
            contract="portal.summary.v1",
            endpoint="/api/v1/portal/summary",
        )
        if not sections:
            return _availability(
                state="unavailable",
                checked_at=checked_at,
                as_of=None,
                authority=authority,
                source_revision="BAR-01-BE5",
                reason_code="UPSTREAM_UNAVAILABLE",
                detail="No current summary source is available.",
                retryable=True,
            )
        states = {section.availability.state for section in sections}
        if states == {"available"}:
            return _availability(
                state="available",
                checked_at=checked_at,
                as_of=checked_at,
                authority=authority,
                source_revision="BAR-01-BE5",
            )
        if any(state in _USABLE_SECTION_STATES for state in states):
            return _availability(
                state="degraded",
                checked_at=checked_at,
                as_of=checked_at,
                authority=authority,
                source_revision="BAR-01-BE5",
                reason_code="PARTIAL_SOURCE_FAILURE",
                detail="One or more current summary sources are unavailable.",
                retryable=True,
            )
        all_timed_out = all(
            section.availability.reason_code == "UPSTREAM_TIMEOUT"
            for section in sections
        )
        return _availability(
            state="unavailable",
            checked_at=checked_at,
            as_of=None,
            authority=authority,
            source_revision="BAR-01-BE5",
            reason_code="UPSTREAM_TIMEOUT" if all_timed_out else "UPSTREAM_UNAVAILABLE",
            detail="No current summary source is usable.",
            retryable=True,
        )

    async def aclose(self) -> None:
        for adapter in self._adapters:
            close = getattr(adapter, "aclose", None)
            if close is None:
                continue
            result = close()
            if inspect.isawaitable(result):
                await result


__all__ = [
    "DEFAULT_DEADLINE_SECONDS",
    "HARD_PAYLOAD_BYTES",
    "MAX_DEADLINE_SECONDS",
    "MIN_DEADLINE_SECONDS",
    "PortalSummaryContractError",
    "PortalSummaryService",
    "PortalSummarySettings",
    "TARGET_PAYLOAD_BYTES",
]
