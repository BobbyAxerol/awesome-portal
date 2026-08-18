from __future__ import annotations

import asyncio
import re
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, Protocol

from portal_api.adapters.market_data import HISTORICAL_READER_VERSION, MarketDataProvider
from portal_api.domain.enums import RunState
from portal_api.domain.portal_registry import PortalRegistryDocument
from portal_api.domain.portal_summary import (
    AvailabilityAuthority,
    AvailabilityProvenance,
    CapabilityAvailability,
    CurrentRunInventory,
    CurrentRunSnapshot,
    CurrentRunSummaryPort,
    EvidenceValue,
    HistoricalCapabilityPort,
    HistoricalCapabilitySnapshot,
    PortalSummaryContribution,
    PortalSummarySection,
    PriorityItem,
    SummaryClock,
    SummaryContext,
    SummaryLinkItem,
    SummaryWarning,
)


MAX_CURRENT_RUNS = 100
MAX_RECENT_ITEMS = 5
_RUN_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
_KNOWN_RUN_STATES = {state.value for state in RunState}
_TERMINAL_RUN_STATES = {
    RunState.COMPLETED.value,
    RunState.FAILED.value,
    RunState.CANCELLED.value,
}


class QuantBTSummaryContractError(RuntimeError):
    """The validated registry/current read model cannot satisfy BE3."""


class _RunListSource(Protocol):
    def list_runs(self) -> list[dict[str, Any]]: ...


@dataclass(frozen=True, slots=True)
class QuantBTSummaryRoutes:
    new_run: str
    run_library: str
    run_detail_template: str

    @classmethod
    def from_registry(cls, registry: PortalRegistryDocument) -> "QuantBTSummaryRoutes":
        screens = {screen.screen_id: screen for screen in registry.screens}
        required = {
            "QUANTBT_NEW_RUN_SCREEN",
            "QUANTBT_RUN_LIBRARY_SCREEN",
            "QUANTBT_RUN_DETAIL_SCREEN",
        }
        if missing := required - screens.keys():
            raise QuantBTSummaryContractError(
                f"QuantBT summary routes are missing screen contracts: {sorted(missing)}"
            )
        selected = {screen_id: screens[screen_id] for screen_id in required}
        if any(screen.feature_id != "QUANTBT_RESEARCH" for screen in selected.values()):
            raise QuantBTSummaryContractError(
                "QuantBT summary routes must belong to QUANTBT_RESEARCH"
            )
        detail_template = selected["QUANTBT_RUN_DETAIL_SCREEN"].route
        if detail_template.count(":runId") != 1:
            raise QuantBTSummaryContractError(
                "QuantBT run detail route must contain one :runId placeholder"
            )
        return cls(
            new_run=selected["QUANTBT_NEW_RUN_SCREEN"].route,
            run_library=selected["QUANTBT_RUN_LIBRARY_SCREEN"].route,
            run_detail_template=detail_template,
        )

    def run_detail(self, run_id: str) -> str:
        if not _RUN_ID_PATTERN.fullmatch(run_id):
            raise QuantBTSummaryContractError("current run ID cannot be linked safely")
        return self.run_detail_template.replace(":runId", run_id)


class CurrentRunSummaryReader(CurrentRunSummaryPort):
    """Typed bounded projection over the prototype RunManager read contract."""

    def __init__(self, source: _RunListSource) -> None:
        self._source = source

    def read_current_runs(self, *, limit: int) -> CurrentRunInventory:
        if not 1 <= limit <= MAX_CURRENT_RUNS:
            raise ValueError(f"run summary limit must be between 1 and {MAX_CURRENT_RUNS}")
        records = self._source.list_runs()
        if not isinstance(records, list):
            raise TypeError("current run source must return a list")
        snapshots = tuple(CurrentRunSnapshot.model_validate(item) for item in records)
        ordered = tuple(
            sorted(
                snapshots,
                key=lambda run: run.observed_at.timestamp()
                if run.observed_at
                else float("-inf"),
                reverse=True,
            )
        )
        return CurrentRunInventory(
            total_runs=len(ordered),
            state_counts=Counter(run.status for run in ordered),
            recent_runs=ordered[:limit],
            truncated=len(ordered) > limit,
        )


class HistoricalCapabilityReader(HistoricalCapabilityPort):
    """Safe capability projection; raw provider failure details never escape."""

    def __init__(self, provider: MarketDataProvider) -> None:
        self._provider = provider

    def read_historical_capability(self) -> HistoricalCapabilitySnapshot:
        descriptors = self._provider.list_datasets()
        historical = tuple(
            descriptor
            for descriptor in descriptors
            if descriptor.source_class == "historical_market_data"
            and {"backtest", "research"}.issubset(descriptor.usage_scopes)
        )
        available_ids = tuple(
            sorted(
                descriptor.dataset_id
                for descriptor in historical
                if descriptor.availability == "available"
            )
        )
        if not available_ids:
            return HistoricalCapabilitySnapshot(
                state="unavailable",
                dataset_count=0,
                dataset_ids=(),
                source_revision=HISTORICAL_READER_VERSION if historical else None,
            )
        return HistoricalCapabilitySnapshot(
            state="available",
            dataset_count=len(available_ids),
            dataset_ids=available_ids,
            source_revision=HISTORICAL_READER_VERSION,
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


def _evidence(
    availability: CapabilityAvailability,
    value: float | int | str | None,
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


class QuantBTSummaryAdapter:
    """Temporary read-only BAR-01 bridge over current QuantBT authorities."""

    source_id = "quantbt_current"

    def __init__(
        self,
        *,
        run_reader: CurrentRunSummaryPort,
        historical_reader: HistoricalCapabilityPort,
        routes: QuantBTSummaryRoutes,
        clock: SummaryClock = _utc_now,
    ) -> None:
        self._run_reader = run_reader
        self._historical_reader = historical_reader
        self._routes = routes
        self._clock = clock

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummaryContribution:
        del context  # registry/environment aggregation belongs to BAR-01-BE5
        loop = asyncio.get_running_loop()
        checked_at = self._clock()
        if deadline <= loop.time():
            timeout = TimeoutError("summary deadline expired")
            return self._build_contribution(timeout, timeout, checked_at=checked_at)
        await asyncio.sleep(0)

        results: dict[str, object] = {}
        readers = (
            ("runs", lambda: self._run_reader.read_current_runs(limit=MAX_CURRENT_RUNS)),
            ("historical", self._historical_reader.read_historical_capability),
        )
        for name, reader in readers:
            if loop.time() >= deadline:
                results[name] = TimeoutError("summary source deadline exceeded")
                continue
            try:
                results[name] = reader()
            except Exception as exc:  # typed unavailable mapping happens below
                results[name] = exc

        return self._build_contribution(
            results["runs"],
            results["historical"],
            checked_at=checked_at,
        )

    def unavailable_contribution(
        self,
        *,
        reason_code: Literal["UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE"],
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        failure: BaseException = (
            TimeoutError("summary deadline expired")
            if reason_code == "UPSTREAM_TIMEOUT"
            else RuntimeError("summary adapter failed")
        )
        return self._build_contribution(failure, failure, checked_at=checked_at)

    def _build_contribution(
        self,
        runs_result: object,
        historical_result: object,
        *,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        run_metrics, recent_items, run_warnings, run_priorities, run_available = (
            self._run_projection(runs_result, checked_at=checked_at)
        )
        historical_metrics, historical_warnings, historical_priorities, data_available = (
            self._historical_projection(historical_result, checked_at=checked_at)
        )
        availability = self._section_availability(
            run_available=run_available,
            data_available=data_available,
            checked_at=checked_at,
            results=(runs_result, historical_result),
        )
        return PortalSummaryContribution(
            section=PortalSummarySection(
                source_id=self.source_id,
                feature_id="QUANTBT_RESEARCH",
                label="QuantBT Backtest",
                availability=availability,
                metrics={**run_metrics, **historical_metrics},
                recent_items=recent_items,
                warnings=(*run_warnings, *historical_warnings)[:MAX_RECENT_ITEMS],
            ),
            priority_items=(*run_priorities, *historical_priorities),
        )

    def _run_projection(
        self,
        result: object,
        *,
        checked_at: datetime,
    ) -> tuple[
        dict[str, EvidenceValue],
        tuple[SummaryLinkItem, ...],
        tuple[SummaryWarning, ...],
        tuple[PriorityItem, ...],
        bool,
    ]:
        authority = AvailabilityAuthority(
            service="portal-api",
            contract="quantbt-current-runs.v1",
            endpoint="/api/runs",
        )
        if isinstance(result, BaseException):
            unavailable = self._failure_availability(
                result,
                checked_at=checked_at,
                authority=authority,
                source_revision="prototype-run-files.v1",
                unavailable_detail="Current QuantBT run metadata is unavailable.",
            )
            metric_keys = (
                "total_runs",
                "active_runs",
                "queued_runs",
                "completed_runs",
                "failed_runs",
                "cancelled_runs",
                "latest_run_id",
                "latest_run_status",
                "latest_run_protocol",
                "latest_run_strategy",
                "latest_run_observed_at",
            ) + tuple(f"runs_state_{state.value.lower()}" for state in RunState)
            metrics = {
                key: _evidence(
                    unavailable,
                    None,
                    unit="runs"
                    if key.endswith("_runs") or key.startswith("runs_state_")
                    else None,
                )
                for key in metric_keys
            }
            warning = SummaryWarning(
                code="RUN_SUMMARY_UNAVAILABLE",
                severity="error",
                title="Run summary unavailable",
                detail="Current QuantBT run metadata could not be read safely.",
                observed_at=checked_at,
                evidence_digest=None,
            )
            return metrics, (), (warning,), (), False

        if not isinstance(result, CurrentRunInventory):
            return self._run_projection(
                TypeError("incompatible run summary result"),
                checked_at=checked_at,
            )
        if any(state not in _KNOWN_RUN_STATES for state in result.state_counts):
            return self._run_projection(
                ValueError("incompatible run state"),
                checked_at=checked_at,
            )

        runs = result.recent_runs
        latest = runs[0] if runs else None
        as_of = latest.observed_at if latest and latest.observed_at else checked_at
        available = _availability(
            state="available",
            checked_at=checked_at,
            as_of=as_of,
            authority=authority,
            source_revision="prototype-run-files.v1",
        )
        counts = {
            "total_runs": result.total_runs,
            "active_runs": sum(
                count
                for state, count in result.state_counts.items()
                if state not in _TERMINAL_RUN_STATES
            ),
            "queued_runs": result.state_counts.get(RunState.QUEUED.value, 0),
            "completed_runs": result.state_counts.get(RunState.COMPLETED.value, 0),
            "failed_runs": result.state_counts.get(RunState.FAILED.value, 0),
            "cancelled_runs": result.state_counts.get(RunState.CANCELLED.value, 0),
        }
        metrics = {
            key: _evidence(available, value, unit="runs") for key, value in counts.items()
        }
        metrics.update(
            {
                "latest_run_id": _evidence(available, latest.run_id if latest else None),
                "latest_run_status": _evidence(available, latest.status if latest else None),
                "latest_run_protocol": _evidence(
                    available, latest.protocol if latest else None
                ),
                "latest_run_strategy": _evidence(
                    available, latest.strategy_id if latest else None
                ),
                "latest_run_observed_at": _evidence(
                    available,
                    latest.observed_at.isoformat()
                    if latest and latest.observed_at
                    else None,
                ),
            }
        )
        metrics.update(
            {
                f"runs_state_{state.value.lower()}": _evidence(
                    available,
                    result.state_counts.get(state.value, 0),
                    unit="runs",
                )
                for state in RunState
            }
        )
        recent_items = tuple(
            SummaryLinkItem(
                id=f"quantbt-run:{run.run_id}",
                label=f"Run {run.run_id} · {run.status}",
                route=self._routes.run_detail(run.run_id),
                resource_id=run.run_id,
                observed_at=run.observed_at or checked_at,
                authority=self.source_id,
            )
            for run in runs[:MAX_RECENT_ITEMS]
        )
        failed = tuple(run for run in runs if run.status == RunState.FAILED.value)[
            :MAX_RECENT_ITEMS
        ]
        warnings = tuple(
            SummaryWarning(
                code="RUN_FAILED",
                severity="error",
                title="QuantBT run failed",
                detail=f"Run {run.run_id} is in the FAILED state.",
                observed_at=run.observed_at or checked_at,
                evidence_digest=None,
            )
            for run in failed
        )
        priorities = tuple(
            PriorityItem(
                id=f"quantbt:run-failed:{run.run_id}",
                type="RUN_FAILED",
                severity="warning",
                title=f"Review failed QuantBT run {run.run_id}",
                feature_id="QUANTBT_RESEARCH",
                resource_id=run.run_id,
                observed_at=run.observed_at or checked_at,
                authority=self.source_id,
                route=self._routes.run_detail(run.run_id),
                evidence_digest=None,
            )
            for run in failed
        )
        return metrics, recent_items, warnings, priorities, True

    def _historical_projection(
        self,
        result: object,
        *,
        checked_at: datetime,
    ) -> tuple[
        dict[str, EvidenceValue],
        tuple[SummaryWarning, ...],
        tuple[PriorityItem, ...],
        bool,
    ]:
        authority = AvailabilityAuthority(
            service="portal-api",
            contract="historical-capability.v1",
            endpoint="/api/datasets",
        )
        if isinstance(result, BaseException):
            unavailable = self._failure_availability(
                result,
                checked_at=checked_at,
                authority=authority,
                source_revision=None,
                unavailable_detail="Historical backtest/research capability is unavailable.",
            )
        elif isinstance(result, HistoricalCapabilitySnapshot):
            if result.state == "available":
                available = _availability(
                    state="available",
                    checked_at=checked_at,
                    as_of=checked_at,
                    authority=authority,
                    source_revision=result.source_revision,
                )
                return (
                    {
                        "historical_dataset_count": _evidence(
                            available, result.dataset_count, unit="datasets"
                        ),
                        "historical_data_state": _evidence(available, "available"),
                    },
                    (),
                    (),
                    True,
                )
            unavailable = _availability(
                state="unavailable",
                checked_at=checked_at,
                as_of=None,
                authority=authority,
                source_revision=result.source_revision,
                reason_code="SOURCE_DATA_UNAVAILABLE",
                detail="Historical backtest/research data is unavailable.",
                retryable=True,
            )
        else:
            return self._historical_projection(
                TypeError("incompatible historical summary result"),
                checked_at=checked_at,
            )

        metrics = {
            "historical_dataset_count": _evidence(unavailable, None, unit="datasets"),
            "historical_data_state": _evidence(unavailable, None),
        }
        warning = SummaryWarning(
            code="HISTORICAL_DATA_UNAVAILABLE",
            severity="warning",
            title="Historical data unavailable",
            detail="Backtest and research data cannot currently be queried.",
            observed_at=checked_at,
            evidence_digest=None,
        )
        priority = PriorityItem(
            id="quantbt:historical-data-unavailable",
            type="HISTORICAL_DATA_UNAVAILABLE",
            severity="warning",
            title="Restore Historical Market Data for QuantBT",
            feature_id="QUANTBT_RESEARCH",
            resource_id=None,
            observed_at=checked_at,
            authority=self.source_id,
            route=self._routes.new_run,
            evidence_digest=None,
        )
        return metrics, (warning,), (priority,), False

    @staticmethod
    def _failure_availability(
        failure: BaseException,
        *,
        checked_at: datetime,
        authority: AvailabilityAuthority,
        source_revision: str | None,
        unavailable_detail: str,
    ) -> CapabilityAvailability:
        if isinstance(failure, TimeoutError):
            reason_code = "UPSTREAM_TIMEOUT"
        elif isinstance(failure, (TypeError, ValueError)):
            reason_code = "INCOMPATIBLE_CONTRACT"
        else:
            reason_code = "UPSTREAM_UNAVAILABLE"
        return _availability(
            state="unavailable",
            checked_at=checked_at,
            as_of=None,
            authority=authority,
            source_revision=source_revision,
            reason_code=reason_code,
            detail=unavailable_detail,
            retryable=True,
        )

    @staticmethod
    def _section_availability(
        *,
        run_available: bool,
        data_available: bool,
        checked_at: datetime,
        results: tuple[object, object],
    ) -> CapabilityAvailability:
        authority = AvailabilityAuthority(
            service="portal-api",
            contract="quantbt-summary-contribution.v1",
            endpoint=None,
        )
        if run_available and data_available:
            return _availability(
                state="available",
                checked_at=checked_at,
                as_of=checked_at,
                authority=authority,
                source_revision="BAR-01-BE3",
            )
        if run_available or data_available:
            return _availability(
                state="degraded",
                checked_at=checked_at,
                as_of=checked_at,
                authority=authority,
                source_revision="BAR-01-BE3",
                reason_code="PARTIAL_SOURCE_FAILURE",
                detail="One QuantBT summary source is unavailable.",
                retryable=True,
            )
        all_timed_out = all(isinstance(result, TimeoutError) for result in results)
        return _availability(
            state="unavailable",
            checked_at=checked_at,
            as_of=None,
            authority=authority,
            source_revision="BAR-01-BE3",
            reason_code="UPSTREAM_TIMEOUT" if all_timed_out else "UPSTREAM_UNAVAILABLE",
            detail="Current QuantBT summary sources are unavailable.",
            retryable=True,
        )


__all__ = [
    "CurrentRunSummaryReader",
    "HistoricalCapabilityReader",
    "QuantBTSummaryAdapter",
    "QuantBTSummaryContractError",
    "QuantBTSummaryRoutes",
]
