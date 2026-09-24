"""Private P08 data-snapshot and effective-spec authority.

The public Research browser never calls this service.  Control API is the
sole caller, authenticated through the existing internal principal envelope.
This module has one narrow job:

* read the already-authorized historical HMD source once, with a bounded
  half-open query;
* place an immutable, content-addressed shared snapshot behind an opaque ref;
* derive source facts, topology and a server-owned effective specification;
* return metadata only -- never candles, a filesystem path, or holdout values.

It deliberately does *not* submit a QuantBT run, evaluate a strategy, fit a
transform, attach a worker, or provide a browser-facing dataset query.  P10
owns production of a run and P14 owns display of a completed split artifact.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Mapping

import pandas as pd

from portal_api.adapters.market_data import (
    REQUIRED_MARKET_COLUMNS,
    MarketDataProvider,
    MarketDataQuery,
    PreparedMarketData,
    inferred_end_exclusive,
)
from portal_api.services.data_catalog import (
    DataCatalogError,
    DataFamily,
    QualityProfile,
    ReleaseManifestRef,
    SnapshotStore,
)
from portal_api.domain.errors import PortalDomainError
from portal_api.services.research_engine_catalog import (
    ResearchEngineCatalogService,
    WalkForwardOptions,
)

PREFLIGHT_SNAPSHOT_SCHEMA_VERSION = "research.preflight-snapshot.v1"
EFFECTIVE_SPEC_SCHEMA_VERSION = "research.effective-spec.v1"
PREFLIGHT_MAXIMUM_WARMUP_BARS = 100_000
# A topology is persisted as one metadata document in Control API. Keeping it
# comfortably below the database document bound means a valid request is
# explicitly refused instead of being silently truncated or failing later with
# an unrelated persistence-size error. This is a preflight limit, not a worker
# capability claim.
PREFLIGHT_MAXIMUM_FOLD_ROWS = 128
PREFLIGHT_MAXIMUM_SNAPSHOT_ROWS = 2_000_000
PREFLIGHT_MAXIMUM_SNAPSHOT_BYTES = 512 * 1024 * 1024
PREFLIGHT_MAXIMUM_METADATA_BYTES = 60 * 1024
PREFLIGHT_REQUIRED_COLUMNS = tuple(REQUIRED_MARKET_COLUMNS)
PREFLIGHT_SAFE_PROVENANCE_KEYS = frozenset(
    {
        "source_class",
        "usage_scope",
        "reader_distribution",
        "reader_version",
        "reader_wheel_sha256",
        "loader_contract",
        "manifest_digest",
        "environment_id",
        "release_commit",
        "release_tag",
        "dataset_release_id",
        "adapter_version",
    }
)

_TIMEFRAME_PATTERN = re.compile(
    r"^(?P<count>[1-9][0-9]*)(?P<unit>s|sec|secs|second|seconds|min|minute|minutes|h|hour|hours|d|day|days)$",
    re.IGNORECASE,
)


class ResearchPreflightSnapshotError(ValueError):
    """Known, typed P08 refusal from the private data authority."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


def canonical_json(value: object) -> str:
    """One cross-language canonical JSON form used for P08 SHA-256 values."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_json(value: object) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _assert_metadata_bound(label: str, value: object) -> None:
    """Refuse overlarge metadata before it reaches Control API persistence."""
    if len(canonical_json(value).encode("utf-8")) > PREFLIGHT_MAXIMUM_METADATA_BYTES:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_RESOURCE_REFUSED",
            f"The authoritative {label} metadata exceeds the bounded preflight contract.",
        )


def _safe_provenance(metadata: Mapping[str, object]) -> dict[str, object]:
    """Project only reviewable HMD provenance, never arbitrary loader metadata."""
    result: dict[str, object] = {}
    for key in sorted(PREFLIGHT_SAFE_PROVENANCE_KEYS):
        value = metadata.get(key)
        if isinstance(value, str) and 0 < len(value) <= 191:
            result[key] = value
        elif isinstance(value, bool):
            result[key] = value
        elif isinstance(value, int) and not isinstance(value, bool):
            result[key] = value
        elif isinstance(value, float) and math.isfinite(value):
            result[key] = value
    return result


def parse_source_instant(value: object, *, source_timezone: str) -> pd.Timestamp:
    """Normalize an input timestamp without silently treating a local time as UTC.

    P02 intentionally retains datetime-local strings.  P08 makes the source
    timezone explicit: crypto-naive inputs are UTC, future Vietnam-source
    adapters can pass Asia/Ho_Chi_Minh, and already-aware values preserve the
    same instant.
    """
    try:
        timestamp = pd.Timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "A data boundary is not a valid timestamp."
        ) from exc
    if timestamp.tzinfo is None:
        try:
            timestamp = timestamp.tz_localize(source_timezone)
        except (TypeError, ValueError) as exc:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_INVALID", "The source timezone cannot normalize this boundary."
            ) from exc
    return timestamp.tz_convert("UTC")


def utc_milliseconds(timestamp: pd.Timestamp) -> int:
    return int(timestamp.value // 1_000_000)


def _iso_utc(timestamp: pd.Timestamp) -> str:
    return timestamp.tz_convert("UTC").isoformat()


def _timeframe_delta(timeframe: str) -> pd.Timedelta:
    match = _TIMEFRAME_PATTERN.fullmatch(timeframe.strip())
    if not match:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "The selected timeframe is not a fixed historical interval."
        )
    count = int(match.group("count"))
    unit = match.group("unit").lower()
    normalized = {
        "s": "s",
        "sec": "s",
        "secs": "s",
        "second": "s",
        "seconds": "s",
        "min": "min",
        "minute": "min",
        "minutes": "min",
        "h": "h",
        "hour": "h",
        "hours": "h",
        "d": "D",
        "day": "D",
        "days": "D",
    }[unit]
    return pd.Timedelta(count, unit=normalized)


def _require_object(value: object, label: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", f"{label} must be an object."
        )
    return value


def _require_text(value: object, label: str, *, maximum: int = 191) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", f"{label} is invalid."
        )
    return value


def _require_nonnegative_integer(value: object, label: str, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > maximum:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", f"{label} is outside the allowed range."
        )
    return value


def _interval(
    value: object,
    *,
    source_timezone: str,
    label: str,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    raw = _require_object(value, label)
    start = parse_source_instant(raw.get("start"), source_timezone=source_timezone)
    end = parse_source_instant(raw.get("end_exclusive"), source_timezone=source_timezone)
    if start >= end:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", f"{label} must be a positive [start, end) interval."
        )
    return start, end


def _range_metadata(start: pd.Timestamp, end: pd.Timestamp, *, bars: int | None = None) -> dict[str, object]:
    result: dict[str, object] = {
        "start_utc": _iso_utc(start),
        "end_exclusive_utc": _iso_utc(end),
        "start_utc_ms": utc_milliseconds(start),
        "end_exclusive_utc_ms": utc_milliseconds(end),
    }
    if bars is not None:
        result["bars"] = bars
    return result


def _bar_count(frame: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> int:
    index = frame.index
    return int(index.searchsorted(end, side="left") - index.searchsorted(start, side="left"))


def _source_manifest_digest(market: PreparedMarketData) -> str:
    candidate = market.load_metadata.get("manifest_digest")
    if isinstance(candidate, str) and re.fullmatch(r"[0-9a-f]{64}", candidate):
        return candidate
    # Test doubles and a deliberately provisional source may lack a release
    # manifest. The market-content hash is still exact, but callers can see
    # this as a content-derived provenance fallback rather than a release claim.
    return market.content_hash


def _snapshot_family(market: PreparedMarketData) -> DataFamily:
    return DataFamily(
        family_id="research-hmd-ohlcv",
        label="Research-approved historical OHLCV snapshot",
        kind="candle",
        schema_version="candle.v1",
        # This is not a Data Catalog UI activation. It is the narrow, P04
        # approved code-only HMD reader binding used only by Research P08.
        activated=True,
        release_manifest=ReleaseManifestRef(
            manifest_sha256=_source_manifest_digest(market),
            accepted_at="2026-09-20T00:00:00+00:00",
        ),
        quality=QualityProfile(max_gap_ratio=0.05, max_duplicate_rows=0),
    )


def _route_capability(
    engine_catalog: ResearchEngineCatalogService,
    requested: Mapping[str, object],
) -> dict[str, object]:
    route_id = _require_text(requested.get("execution_route"), "execution_route", maximum=64)
    requested_mode = _require_text(requested.get("optimization_mode"), "optimization_mode", maximum=64)
    requested_schedule = _require_text(
        requested.get("optimization_schedule"), "optimization_schedule", maximum=64
    )
    client = _require_object(requested.get("client"), "client")
    current = next(release for release in engine_catalog.catalog.releases if release.role == "current")
    client_release_id = _require_text(client.get("engine_release_id"), "client.engine_release_id", maximum=64)
    if client_release_id != current.release_id:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_RELEASE_STALE",
            "The selected engine release is no longer the current admitted preflight release.",
        )
    route = next((item for item in engine_catalog.catalog.routes if item.route_id == route_id), None)
    if route is None:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_ROUTE_UNKNOWN", "The selected execution route is not in the current engine catalog."
        )
    mode = engine_catalog.validate_mode_schedule(mode_id=requested_mode, schedule=requested_schedule)
    axes = route.axes
    # P08 may only create an executable-input manifest for a route whose
    # adapter and evidence surface are published. "P04_BASELINE_ONLY" means
    # preflight is allowed; it does *not* imply a worker/job is admitted.
    if axes.integration != "ADAPTER_AVAILABLE" or axes.evidence != "EVIDENCE_MAPPED":
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED", route.reason
        )
    if axes.admission not in {"P04_BASELINE_ONLY"}:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED", route.reason
        )
    return {
        "engine_release_id": current.release_id,
        "engine_catalog_digest": engine_catalog.catalog_digest,
        "execution_route": route.route_id,
        "required_input_class": route.required_input_class,
        "route_axes": axes.model_dump(mode="json"),
        "preflight_admission": "PREFLIGHT_ONLY",
        "optimization_mode": mode.mode_id,
        "optimization_schedule": requested_schedule,
    }


def _required_inputs(input: Mapping[str, object]) -> tuple[tuple[str, ...], int, bool]:
    columns = input.get("required_columns", PREFLIGHT_REQUIRED_COLUMNS)
    if not isinstance(columns, (list, tuple)):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "required_columns must be an array."
        )
    if any(not isinstance(item, str) for item in columns):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "required_columns must contain only text identifiers."
        )
    normalized = tuple(item.strip() for item in columns)
    if (
        not normalized
        or len(normalized) > 16
        or len(normalized) != len(set(normalized))
        or any(not item or len(item) > 64 for item in normalized)
    ):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "required_columns is invalid."
        )
    warmup_bars = _require_nonnegative_integer(
        input.get("warmup_bars", 0), "warmup_bars", PREFLIGHT_MAXIMUM_WARMUP_BARS
    )
    requires_funding = input.get("requires_funding", False)
    if not isinstance(requires_funding, bool):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_INVALID", "requires_funding must be boolean."
        )
    return normalized, warmup_bars, requires_funding


def _three_window_topology(
    requested: Mapping[str, object],
    frame: pd.DataFrame,
    *,
    source_timezone: str,
) -> tuple[pd.Timestamp, pd.Timestamp, dict[str, object]]:
    windows = _require_object(requested.get("windows"), "windows")
    is_start, is_end = _interval(windows.get("is"), source_timezone=source_timezone, label="windows.is")
    oos_start, oos_end = _interval(windows.get("oos"), source_timezone=source_timezone, label="windows.oos")
    holdout_start, holdout_end = _interval(
        windows.get("holdout"), source_timezone=source_timezone, label="windows.holdout"
    )
    if is_end != oos_start or oos_end != holdout_start:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID",
            "Three-window boundaries must be contiguous: IS→OOS→holdout.",
        )
    if holdout_end > inferred_end_exclusive(frame.index):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
            "The requested holdout end exceeds the available closed-bar source range.",
        )
    is_bars = _bar_count(frame, is_start, is_end)
    oos_bars = _bar_count(frame, oos_start, oos_end)
    holdout_bars = _bar_count(frame, holdout_start, holdout_end)
    if not all(value > 0 for value in (is_bars, oos_bars, holdout_bars)):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
            "Every requested three-window segment needs at least one closed bar.",
        )
    return is_start, holdout_end, {
        "protocol": "three_window_decay",
        "folds": [
            {
                "fold_id": "fold_000",
                "train": _range_metadata(is_start, is_end, bars=is_bars),
                "outer_oos": _range_metadata(oos_start, oos_end, bars=oos_bars),
                "state": "BOUNDARY_FIXED_NOT_EVALUATED",
            }
        ],
        "sealed_holdout": {
            **_range_metadata(holdout_start, holdout_end, bars=holdout_bars),
            "snapshot_read_state": "OPAQUE_SNAPSHOT_ONLY",
            "evaluation_state": "NOT_EVALUATED",
            "disclosure": "Snapshot integrity metadata only; no raw sealed-holdout values, chart, fit, score or result are returned by P08.",
        },
        "topology_digest": sha256_json(
            {
                "protocol": "three_window_decay",
                "is": _range_metadata(is_start, is_end, bars=is_bars),
                "oos": _range_metadata(oos_start, oos_end, bars=oos_bars),
                "holdout": _range_metadata(holdout_start, holdout_end, bars=holdout_bars),
            }
        ),
    }


def _advanced_topology(
    requested: Mapping[str, object],
    frame: pd.DataFrame,
    *,
    source_timezone: str,
    options: WalkForwardOptions,
) -> tuple[pd.Timestamp, pd.Timestamp, dict[str, object]]:
    spec = _require_object(requested.get("walk_forward"), "walk_forward")
    start, end = _interval(spec, source_timezone=source_timezone, label="walk_forward")
    if end > inferred_end_exclusive(frame.index):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
            "The requested walk-forward end exceeds the available closed-bar source range.",
        )
    frequency = _require_text(spec.get("frequency"), "walk_forward.frequency", maximum=32)
    window_mode = _require_text(spec.get("window_mode"), "walk_forward.window_mode", maximum=32)
    split_mode = _require_text(spec.get("split_mode"), "walk_forward.split_mode", maximum=64)
    # RF02-B2: the admitted values are the ones the Atlas publishes, read from
    # the same manifest, so a browser that renders the contract can never be
    # refused a value it was offered, nor offered one preflight refuses.
    if frequency not in options.admitted("frequency"):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", "The selected fold frequency is not certified."
        )
    # P02 has no rolling train-width control. Claiming an exact rolling plan
    # would silently invent an engine default, so fail closed until the
    # manifest owns the width field (published as NOT_ADMITTED with a reason).
    if window_mode not in options.admitted("window_mode"):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED",
            "Rolling walk-forward requires a manifest-owned train width; P08 will not infer one.",
        )
    raw_split = split_mode.removeprefix("walk_forward_")
    try:
        first_oos = parse_source_instant(raw_split, source_timezone=source_timezone)
    except ResearchPreflightSnapshotError as exc:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", "The first out-of-sample boundary is not certified."
        ) from exc
    if not (start < first_oos < end):
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID", "The first out-of-sample boundary must lie inside the selected range."
        )
    offsets: dict[str, pd.DateOffset] = {
        "yearly": pd.DateOffset(years=1),
        "semi_yearly": pd.DateOffset(months=6),
        "quarterly": pd.DateOffset(months=3),
        "monthly": pd.DateOffset(months=1),
        "weekly": pd.DateOffset(weeks=1),
    }
    boundaries: list[tuple[pd.Timestamp, pd.Timestamp]] = []
    if frequency == "single":
        boundaries.append((first_oos, end))
    else:
        cursor = first_oos
        offset = offsets[frequency]
        while cursor < end:
            if len(boundaries) >= PREFLIGHT_MAXIMUM_FOLD_ROWS:
                raise ResearchPreflightSnapshotError(
                    "RESEARCH_PREFLIGHT_RESOURCE_REFUSED",
                    "The selected walk-forward range exceeds the bounded authoritative fold-plan ceiling.",
                )
            next_cursor = min(cursor + offset, end)
            if _bar_count(frame, cursor, next_cursor) > 0:
                boundaries.append((cursor, next_cursor))
            cursor = next_cursor
    if not boundaries:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID", "The selected topology produced no outer folds."
        )
    folds = []
    for index, (test_start, test_end) in enumerate(boundaries):
        train_bars = _bar_count(frame, start, test_start)
        test_bars = _bar_count(frame, test_start, test_end)
        if train_bars <= 0 or test_bars <= 0:
            continue
        folds.append(
            {
                "fold_id": f"fold_{index:03d}",
                "train": _range_metadata(start, test_start, bars=train_bars),
                "outer_oos": _range_metadata(test_start, test_end, bars=test_bars),
                "state": "BOUNDARY_FIXED_NOT_EVALUATED",
            }
        )
    if not folds:
        raise ResearchPreflightSnapshotError(
            "RESEARCH_PREFLIGHT_TOPOLOGY_INVALID", "No fold has both train and outer out-of-sample bars."
        )
    topology = {
        "protocol": "advanced_walk_forward",
        "frequency": frequency,
        "window_mode": window_mode,
        "folds": folds,
        "sealed_holdout": None,
    }
    topology["topology_digest"] = sha256_json(topology)
    return start, end, topology


def _resource_estimate(
    *,
    frame: pd.DataFrame,
    snapshot_bytes: int,
    folds: int,
    trials: int,
) -> dict[str, object]:
    # The estimate is intentionally conservative and declarative. It is not a
    # reservation or queue admission -- P10/P06 own that transition.
    raw_bytes = int(frame.memory_usage(index=True, deep=True).sum())
    estimated_ram = max(8 * 1024 * 1024, raw_bytes * 3 + snapshot_bytes)
    evaluations = max(1, folds) * trials
    estimated_scratch = snapshot_bytes + min(
        256 * 1024 * 1024,
        max(raw_bytes, 1) * min(max(folds, 1), 8),
    )
    estimated_cpu_seconds = max(1, math.ceil(evaluations * max(len(frame), 1) / 100_000))
    admission = (
        "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING"
        if (
            estimated_ram <= 8 * 1024 * 1024 * 1024
            and estimated_scratch <= 512 * 1024 * 1024 * 1024
            and estimated_cpu_seconds <= 86_400
        )
        else "RESOURCE_REFUSED"
    )
    return {
        "schema_version": "research.resource-estimate.v1",
        "scope": "per_study_per_fold_per_seed; no product-wide trial claim is implied",
        "trial_count": trials,
        "seed_count": 1,
        "outer_fold_count": folds,
        "evaluation_count": evaluations,
        "raw_frame_bytes": raw_bytes,
        "snapshot_bytes": snapshot_bytes,
        "estimated_memory_bytes": estimated_ram,
        "estimated_scratch_bytes": estimated_scratch,
        "estimated_cpu_seconds": estimated_cpu_seconds,
        "admission_state": admission,
        "disclosure": "Estimate only. P10/P06 must independently declare and reserve any durable worker resource.",
    }


@dataclass(frozen=True, slots=True)
class ResearchPreflightSnapshotService:
    provider: MarketDataProvider
    snapshots: SnapshotStore
    engine_catalog: ResearchEngineCatalogService

    def build(self, payload: Mapping[str, object]) -> dict[str, object]:
        requested = _require_object(payload.get("requested_spec"), "requested_spec")
        claimed_digest = _require_text(
            payload.get("requested_spec_digest"), "requested_spec_digest", maximum=64
        )
        if not re.fullmatch(r"[0-9a-f]{64}", claimed_digest) or claimed_digest != sha256_json(requested):
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_INVALID", "The submitted requested specification digest is invalid."
            )
        if requested.get("schema_version") != "research.requested-spec.v1":
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_INVALID", "The requested specification version is not supported."
            )
        data = _require_object(requested.get("data"), "requested_spec.data")
        dataset_id = _require_text(data.get("dataset_id"), "data.dataset_id", maximum=128)
        symbol = _require_text(data.get("symbol"), "data.symbol", maximum=64).upper()
        timeframe = _require_text(data.get("timeframe"), "data.timeframe", maximum=32)
        required_columns, warmup_bars, requires_funding = _required_inputs(payload)
        capability = _route_capability(self.engine_catalog, requested)
        if requires_funding:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_FUNDING_UNAVAILABLE",
                "The selected source has no published funding input contract for this preflight.",
            )
        if any(column not in PREFLIGHT_REQUIRED_COLUMNS for column in required_columns):
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE",
                "The selected HMD preflight source cannot supply every required column.",
            )

        try:
            descriptors = {item.dataset_id: item for item in self.provider.list_datasets()}
        except (PortalDomainError, OSError, ValueError) as exc:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
                "The authorized historical source cannot publish its dataset descriptor.",
            ) from exc
        descriptor = descriptors.get(dataset_id)
        if descriptor is None or descriptor.availability != "available":
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE", "The selected historical dataset is unavailable."
            )
        source_timezone = descriptor.source_timezone or "UTC"
        protocol = _require_text(requested.get("protocol"), "protocol", maximum=64)
        # First resolve logical boundaries. The source query gets exactly the
        # warmup lookback plus logical end -- no unbounded discovery scan.
        if protocol == "three_window_decay":
            windows = _require_object(requested.get("windows"), "windows")
            logical_start, _ = _interval(windows.get("is"), source_timezone=source_timezone, label="windows.is")
            _, logical_end = _interval(windows.get("holdout"), source_timezone=source_timezone, label="windows.holdout")
        elif protocol == "advanced":
            logical_start, logical_end = _interval(
                requested.get("walk_forward"), source_timezone=source_timezone, label="walk_forward"
            )
        else:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED", "The selected protocol is not certified for preflight."
            )
        query_start = logical_start - (_timeframe_delta(timeframe) * warmup_bars)
        try:
            market = self.provider.load(
                MarketDataQuery(
                    dataset_id=dataset_id,
                    symbol=symbol,
                    timeframe=timeframe,
                    start=query_start,
                    end_exclusive=logical_end,
                    columns=PREFLIGHT_REQUIRED_COLUMNS,
                )
            )
        except (PortalDomainError, OSError, ValueError) as exc:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
                "The selected bounded historical source cannot satisfy this preflight.",
            ) from exc
        if len(market.frame) > PREFLIGHT_MAXIMUM_SNAPSHOT_ROWS:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE", "The selected bounded source range exceeds the P08 snapshot row ceiling."
            )
        missing = [column for column in required_columns if column not in market.frame.columns]
        if missing:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_REQUIRED_COLUMNS_UNAVAILABLE",
                "The selected source is missing one or more required input columns.",
            )
        # The certified HMD reader validates full OHLCV on its bounded hot
        # path, but an AlphaVersion can legitimately need a strict subset.
        # Seal only that declared subset for the future worker; full-source
        # content is still recorded separately as immutable source provenance.
        snapshot_frame = market.frame.loc[:, list(required_columns)].copy()
        if protocol == "three_window_decay":
            _, _, topology = _three_window_topology(
                requested, market.frame, source_timezone=source_timezone
            )
        else:
            _, _, topology = _advanced_topology(
                requested,
                market.frame,
                source_timezone=source_timezone,
                options=self.engine_catalog.walk_forward_options(),
            )
        _assert_metadata_bound("fold-plan", topology)
        trials = _require_nonnegative_integer(
            requested.get("optuna_trials"), "optuna_trials", 2_147_483_647
        )
        if trials < 1:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_INVALID", "optuna_trials must be at least one."
            )
        published_ceiling = self.engine_catalog.public_document().current_release.trial_ceiling
        if trials > published_ceiling:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", "The requested trial count exceeds the current release's published ceiling."
            )
        # Refuse obviously unadmissible work *before* serializing a snapshot.
        # This keeps a rejected trial budget from accumulating an unreferenced
        # content-addressed frame. The final estimate below rechecks with the
        # actual encoded byte count before any immutable manifest is issued.
        preliminary_resource = _resource_estimate(
            frame=snapshot_frame,
            snapshot_bytes=0,
            folds=len(topology["folds"]),
            trials=trials,
        )
        if preliminary_resource["admission_state"] != "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING":
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_RESOURCE_REFUSED",
                "The declared work exceeds the configured future worker ceiling.",
            )
        warmup_end = logical_start
        warmup_count = _bar_count(market.frame, query_start, warmup_end)
        if warmup_count < warmup_bars:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_WARMUP_UNAVAILABLE",
                "The selected data range does not contain the declared warmup bars."
            )
        query_digest = sha256_json(
            {
                "start": _iso_utc(query_start),
                "end_exclusive": _iso_utc(logical_end),
                "columns": list(PREFLIGHT_REQUIRED_COLUMNS),
            }
        )
        lineage = (
            "contract:research.preflight-snapshot.v1",
            f"dataset:{dataset_id}",
            f"symbol:{symbol}",
            f"timeframe:{timeframe}",
            f"source-content:{market.content_hash}",
            f"source-manifest:{_source_manifest_digest(market)}",
            f"query:{query_digest}",
        )
        try:
            identity, quality = self.snapshots.register(
                frame=snapshot_frame,
                family=_snapshot_family(market),
                lineage=lineage,
                expected_frequency=timeframe,
            )
            snapshot_path = self.snapshots.snapshot_path(identity.snapshot_id) / "frame.parquet"
            snapshot_bytes = snapshot_path.stat().st_size
        except (DataCatalogError, OSError) as exc:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_DATA_UNAVAILABLE",
                "The selected source could not be sealed into an immutable preflight snapshot.",
            ) from exc
        if snapshot_bytes > PREFLIGHT_MAXIMUM_SNAPSHOT_BYTES:
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_SNAPSHOT_TOO_LARGE", "The encoded snapshot exceeds the P08 byte ceiling."
            )
        fold_count = len(topology["folds"])
        resource = _resource_estimate(
            frame=snapshot_frame,
            snapshot_bytes=snapshot_bytes,
            folds=fold_count,
            trials=trials,
        )
        if resource["admission_state"] != "PREFLIGHT_WITHIN_P10_DECLARATION_CEILING":
            raise ResearchPreflightSnapshotError(
                "RESEARCH_PREFLIGHT_RESOURCE_REFUSED", "The declared work exceeds the configured future worker ceiling."
            )
        snapshot = {
            "snapshot_id": identity.snapshot_id,
            "snapshot_content_hash": identity.content_hash,
            "market_content_hash": market.content_hash,
            "source_manifest_digest": _source_manifest_digest(market),
            "row_count": identity.row_count,
            "byte_count": snapshot_bytes,
            "query": _range_metadata(query_start, logical_end),
            "logical_range": _range_metadata(logical_start, logical_end),
            "warmup": {
                **_range_metadata(query_start, warmup_end, bars=warmup_count),
                "requested_bars": warmup_bars,
                "state": "BOUNDARY_ONLY_NOT_FIT",
            },
            "timezone": source_timezone,
            "calendar_policy": "CRYPTO_24_7" if descriptor.venue == "BINANCE" else "SOURCE_DECLARED",
            "closed_bar_policy": "CLOSED_BARS_ONLY",
            "columns": list(required_columns),
            "quality": {
                "rows": quality.rows,
                "gaps": quality.gaps,
                "duplicates": quality.duplicates,
                "gap_ratio": quality.gap_ratio,
                "passed": quality.passed,
                "reason_codes": list(quality.reason_codes),
                "missing_bar_count": market.missing_bar_count,
                "state": "SNAPSHOT_INTEGRITY_ONLY",
            },
            "provenance": _safe_provenance(market.load_metadata),
        }
        effective_spec = {
            "schema_version": EFFECTIVE_SPEC_SCHEMA_VERSION,
            "requested_spec_digest": claimed_digest,
            "engine": capability,
            "data_binding": {
                "snapshot_id": identity.snapshot_id,
                "snapshot_content_hash": identity.content_hash,
                "market_content_hash": market.content_hash,
                "source_manifest_digest": _source_manifest_digest(market),
                "timezone": source_timezone,
                "calendar_policy": snapshot["calendar_policy"],
                "closed_bar_policy": "CLOSED_BARS_ONLY",
                "columns": list(required_columns),
                "warmup_bars": warmup_bars,
                "range_start_utc_ms": utc_milliseconds(query_start),
                "range_end_exclusive_utc_ms": utc_milliseconds(logical_end),
            },
            "topology": topology,
            "optimization": {
                "mode": capability["optimization_mode"],
                "schedule": capability["optimization_schedule"],
                "trial_count": trials,
                "early_stopping": requested.get("early_stopping"),
                "random_seed": requested.get("random_seed"),
                "scope": "per_study_per_fold_per_seed",
            },
            "intent": {
                "kind": "NEW",
                "reproduction_semantics": "P10 must supply archived effective inputs; P08 never substitutes current defaults for a reproduction.",
                "upgrade_semantics": "P10 must create an explicit upgraded effective spec; P08 never silently upgrades a pinned release.",
            },
        }
        effective_digest = sha256_json(effective_spec)
        dataset_binding = {
            "schema_version": "research.dataset-binding.v1",
            "snapshot_id": identity.snapshot_id,
            "snapshot_content_hash": identity.content_hash,
            "market_content_hash": market.content_hash,
            "source_manifest_digest": _source_manifest_digest(market),
            "dataset_id": dataset_id,
            "symbol": symbol,
            "timeframe": timeframe,
            "range_start_utc_ms": utc_milliseconds(query_start),
            "range_end_exclusive_utc_ms": utc_milliseconds(logical_end),
            "timezone": source_timezone,
            "calendar_policy": snapshot["calendar_policy"],
            "closed_bar_policy": "CLOSED_BARS_ONLY",
        }
        for label, value in (
            ("effective-spec", effective_spec),
            ("dataset-binding", dataset_binding),
            ("snapshot", snapshot),
            ("resource-estimate", resource),
        ):
            _assert_metadata_bound(label, value)
        return {
            "schema_version": PREFLIGHT_SNAPSHOT_SCHEMA_VERSION,
            "requested_spec_digest": claimed_digest,
            "effective_spec": effective_spec,
            "effective_spec_digest": effective_digest,
            "dataset_binding": dataset_binding,
            "dataset_binding_digest": sha256_json(dataset_binding),
            "snapshot": snapshot,
            "topology": topology,
            "resource_estimate": resource,
            "capability": capability,
        }


__all__ = [
    "EFFECTIVE_SPEC_SCHEMA_VERSION",
    "PREFLIGHT_SNAPSHOT_SCHEMA_VERSION",
    "ResearchPreflightSnapshotError",
    "ResearchPreflightSnapshotService",
    "canonical_json",
    "parse_source_instant",
    "sha256_json",
]
