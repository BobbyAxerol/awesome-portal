from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import re
from dataclasses import dataclass, field, replace
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Callable, Mapping, Protocol

import numpy as np
import pandas as pd

from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError, DateRangeError
from portal_api.domain.requests import ThreeWindowConfig

REQUIRED_MARKET_COLUMNS = ("open", "high", "low", "close", "volume")
CRYPTO_BINANCE_DATASET_ID = "crypto-binance-1m"
VN_STOCK_DAILY_DATASET_ID = "vn-stock-daily"
VN_STOCK_DAILY_RELEASE_DATASET_ID = "vn_stock_daily"
VN_SOURCE_TIMEZONE = "Asia/Ho_Chi_Minh"
HISTORICAL_READER_DISTRIBUTION = "primus-historical-market-data"
HISTORICAL_READER_VERSION = "0.1.0rc3"
HISTORICAL_READER_WHEEL_SHA256 = (
    "3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663"
)
HISTORICAL_LOADER_CONTRACT = "hmd-loader-v1"
BINANCE_RELEASE_DATASET_ID = "binance_perpetual_spot_quarterly"
HISTORICAL_USAGE_SCOPES = ("backtest", "research")
HISTORICAL_EXCLUDED_SCOPES = (
    "realtime_market_data",
    "paper_execution",
    "paper_account_state",
)
_SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
_TIMEFRAME_PATTERN = re.compile(
    r"^[1-9]\d*(?:s|sec|secs|second|seconds|min|minute|minutes|h|hour|hours|d|day|days)$",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class DatasetDescriptor:
    dataset_id: str
    symbol: str | None
    venue: str
    timeframe: str | None
    source_path: Path | None = None
    dynamic_query: bool = False
    supported_timeframes: tuple[str, ...] = ()
    source_class: str = "fixture"
    data_kind: str = "ohlcv"
    availability: str = "available"
    unavailable_reason: str | None = None
    usage_scopes: tuple[str, ...] = ()
    excluded_scopes: tuple[str, ...] = ()
    source_timezone: str = "UTC"


@dataclass(frozen=True, slots=True)
class MarketDataQuery:
    dataset_id: str
    symbol: str | None
    timeframe: str | None
    start: datetime | pd.Timestamp | str | None = None
    end_exclusive: datetime | pd.Timestamp | str | None = None
    columns: tuple[str, ...] = REQUIRED_MARKET_COLUMNS

    def utc_bounds(self, *, required: bool = False) -> tuple[pd.Timestamp | None, pd.Timestamp | None]:
        if required and (self.start is None or self.end_exclusive is None):
            raise DateRangeError(
                "historical market-data queries require explicit start and end_exclusive"
            )
        start = _utc_timestamp(self.start)
        end = _utc_timestamp(self.end_exclusive)
        if start is not None and end is not None and start >= end:
            raise DateRangeError("market-data query must have positive duration")
        return start, end


@dataclass(frozen=True, slots=True)
class HistoricalDataRuntime:
    storage_root: Path
    reader_version: str
    loader_contract: str
    manifest_digest: str
    environment_id: str
    release_commit: str
    release_tag: str
    dataset_release_id: str
    loader_class: type
    # Additional approved installed OHLCV readers in the same accepted release.
    # No host source/plugin path and no market collector is imported.
    additional_loaders: tuple[tuple[str, type], ...] = ()

    def provenance(self) -> dict[str, str]:
        return {
            "source_class": "historical_market_data",
            "usage_scope": "backtest,research",
            "reader_distribution": HISTORICAL_READER_DISTRIBUTION,
            "reader_version": self.reader_version,
            "reader_wheel_sha256": HISTORICAL_READER_WHEEL_SHA256,
            "loader_contract": self.loader_contract,
            "manifest_digest": self.manifest_digest,
            "environment_id": self.environment_id,
            "release_commit": self.release_commit,
            "release_tag": self.release_tag,
            "dataset_release_id": self.dataset_release_id,
        }


@dataclass(frozen=True, slots=True)
class PreparedMarketData:
    frame: pd.DataFrame
    descriptor: DatasetDescriptor
    content_hash: str
    missing_bar_count: int | None
    load_metadata: Mapping[str, object] = field(default_factory=dict)

    @property
    def quality(self) -> dict[str, object]:
        index = self.frame.index
        return {
            "rows": len(self.frame),
            "first_timestamp": index[0].isoformat(),
            "last_timestamp": index[-1].isoformat(),
            "missing_bar_count": self.missing_bar_count,
            "content_hash": self.content_hash,
            "columns": list(REQUIRED_MARKET_COLUMNS),
            "load_metadata": dict(self.load_metadata),
        }


@dataclass(frozen=True, slots=True)
class MarketWindows:
    is_frame: pd.DataFrame
    oos_frame: pd.DataFrame
    holdout_frame: pd.DataFrame
    holdout_end_exclusive: pd.Timestamp

    def counts(self) -> tuple[int, int, int]:
        return len(self.is_frame), len(self.oos_frame), len(self.holdout_frame)


class MarketDataProvider(Protocol):
    def list_datasets(self) -> tuple[DatasetDescriptor, ...]: ...

    def load(self, query: MarketDataQuery) -> PreparedMarketData: ...


def _utc_timestamp(value: datetime | pd.Timestamp | str | None) -> pd.Timestamp | None:
    if value is None:
        return None
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        raise DateRangeError("market-data query timestamps must include a timezone")
    return timestamp.tz_convert("UTC")


def _bounded_frame(frame: pd.DataFrame, query: MarketDataQuery) -> pd.DataFrame:
    start, end = query.utc_bounds()
    selected = frame
    if start is not None:
        selected = selected.loc[selected.index >= start]
    if end is not None:
        selected = selected.loc[selected.index < end]
    if selected.empty:
        raise DatasetNotFoundError("no market bars exist in the requested bounded window")
    return selected


def normalize_market_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(frame, pd.DataFrame):
        raise DataSchemaError("market data must be a pandas DataFrame")
    missing = [name for name in REQUIRED_MARKET_COLUMNS if name not in frame.columns]
    if missing:
        raise DataSchemaError(f"missing market columns: {missing}")
    if not isinstance(frame.index, pd.DatetimeIndex):
        raise DataSchemaError("market data index must be a DatetimeIndex")
    if frame.empty:
        raise DataSchemaError("market data cannot be empty")

    normalized = frame.loc[:, REQUIRED_MARKET_COLUMNS].copy()
    index = pd.DatetimeIndex(normalized.index)
    if index.tz is None:
        index = index.tz_localize("UTC")
    else:
        index = index.tz_convert("UTC")
    normalized.index = index

    if not normalized.index.is_monotonic_increasing:
        normalized = normalized.sort_index(kind="stable")
    if normalized.index.has_duplicates:
        raise DataSchemaError("market data contains duplicate timestamps")

    values = np.ascontiguousarray(normalized.to_numpy(dtype=np.float64, copy=True))
    if not np.isfinite(values).all():
        raise DataSchemaError("OHLCV values must be finite")

    open_, high, low, close, volume = values.T
    if np.any(open_ <= 0) or np.any(high <= 0) or np.any(low <= 0) or np.any(close <= 0):
        raise DataSchemaError("OHLC prices must be positive")
    if np.any(volume < 0):
        raise DataSchemaError("volume must be non-negative")
    if np.any(high < np.maximum(open_, close)):
        raise DataSchemaError("high must be >= max(open, close)")
    if np.any(low > np.minimum(open_, close)):
        raise DataSchemaError("low must be <= min(open, close)")

    normalized.loc[:, REQUIRED_MARKET_COLUMNS] = values
    return normalized


def market_content_hash(frame: pd.DataFrame) -> str:
    hashed = pd.util.hash_pandas_object(frame.loc[:, REQUIRED_MARKET_COLUMNS], index=True)
    return hashlib.sha256(hashed.to_numpy(copy=False).tobytes()).hexdigest()


def infer_missing_bars(index: pd.DatetimeIndex) -> int:
    if len(index) < 3:
        return 0
    deltas = np.diff(index.asi8)
    positive = deltas[deltas > 0]
    if positive.size == 0:
        return 0
    cadence = int(np.median(positive))
    if cadence <= 0:
        return 0
    return int(np.maximum((positive // cadence) - 1, 0).sum())


def inferred_end_exclusive(index: pd.DatetimeIndex) -> pd.Timestamp:
    """Return the cadence boundary after the final bar, not final timestamp + 1ns."""
    if len(index) < 2:
        return index[-1] + pd.Timedelta(1, unit="ns")
    deltas = np.diff(index.asi8)
    positive = deltas[deltas > 0]
    if positive.size == 0:
        return index[-1] + pd.Timedelta(1, unit="ns")
    return index[-1] + pd.Timedelta(int(np.median(positive)), unit="ns")


def prepare_market_data(
    frame: pd.DataFrame,
    descriptor: DatasetDescriptor,
    *,
    load_metadata: Mapping[str, object] | None = None,
) -> PreparedMarketData:
    normalized = normalize_market_frame(frame)
    return PreparedMarketData(
        frame=normalized,
        descriptor=descriptor,
        content_hash=market_content_hash(normalized),
        missing_bar_count=infer_missing_bars(normalized.index),
        load_metadata=dict(load_metadata or {}),
    )


def prepare_bounded_market_data(
    frame: pd.DataFrame,
    descriptor: DatasetDescriptor,
    query: MarketDataQuery,
    *,
    load_metadata: Mapping[str, object] | None = None,
) -> PreparedMarketData:
    """Normalize, bound and hash once for one service query."""
    normalized = normalize_market_frame(frame)
    bounded = _bounded_frame(normalized, query)
    return PreparedMarketData(
        frame=bounded,
        descriptor=descriptor,
        content_hash=market_content_hash(bounded),
        missing_bar_count=infer_missing_bars(bounded.index),
        load_metadata=dict(load_metadata or {}),
    )


def partition_three_windows(data: PreparedMarketData, config: ThreeWindowConfig) -> MarketWindows:
    frame = data.frame
    index = frame.index

    is_start = pd.Timestamp(config.is_start)
    is_end = pd.Timestamp(config.is_end_exclusive)
    oos_end = pd.Timestamp(config.oos_end_exclusive)
    holdout_end = (
        pd.Timestamp(config.holdout_end_exclusive)
        if config.holdout_end_exclusive is not None
        else inferred_end_exclusive(index)
    )

    if (
        is_start < index[0]
        or holdout_end <= index[0]
        or holdout_end > inferred_end_exclusive(index)
    ):
        raise DateRangeError("requested windows are outside the dataset range")

    boundaries = index.searchsorted(
        pd.DatetimeIndex([is_start, is_end, oos_end, holdout_end]),
        side="left",
    )
    start_i, is_end_i, oos_end_i, holdout_end_i = (int(value) for value in boundaries)

    is_frame = frame.iloc[start_i:is_end_i]
    oos_frame = frame.iloc[is_end_i:oos_end_i]
    holdout_frame = frame.iloc[oos_end_i:holdout_end_i]
    if is_frame.empty or oos_frame.empty or holdout_frame.empty:
        raise DateRangeError("IS, OOS and Holdout Live must each contain at least one bar")

    if not (is_frame.index[-1] < oos_frame.index[0] and oos_frame.index[-1] < holdout_frame.index[0]):
        raise DateRangeError("market windows overlap")

    return MarketWindows(
        is_frame=is_frame,
        oos_frame=oos_frame,
        holdout_frame=holdout_frame,
        holdout_end_exclusive=holdout_end,
    )


def slice_market_range(
    data: PreparedMarketData,
    *,
    start: pd.Timestamp | str | None,
    end_exclusive: pd.Timestamp | str | None,
) -> PreparedMarketData:
    """Return a validated half-open analysis tape without mutating the source."""
    frame = data.frame
    index = frame.index
    start_ts = index[0] if start is None else pd.Timestamp(start)
    end_ts = (
        inferred_end_exclusive(index)
        if end_exclusive is None
        else pd.Timestamp(end_exclusive)
    )
    if start_ts.tzinfo is None:
        start_ts = start_ts.tz_localize("UTC")
    else:
        start_ts = start_ts.tz_convert("UTC")
    if end_ts.tzinfo is None:
        end_ts = end_ts.tz_localize("UTC")
    else:
        end_ts = end_ts.tz_convert("UTC")
    if start_ts < index[0] or end_ts > inferred_end_exclusive(index):
        raise DateRangeError("requested analysis range is outside the dataset range")
    if start_ts >= end_ts:
        raise DateRangeError("analysis range must have positive duration")
    left, right = index.searchsorted(pd.DatetimeIndex([start_ts, end_ts]), side="left")
    selected = frame.iloc[int(left) : int(right)]
    if selected.empty:
        raise DateRangeError("analysis range contains no market bars")
    return prepare_market_data(
        selected,
        data.descriptor,
        load_metadata={
            **dict(data.load_metadata),
            "analysis_start": selected.index[0].isoformat(),
            "analysis_end_exclusive": end_ts.isoformat(),
            "source_content_hash": data.content_hash,
        },
    )


class InMemoryMarketDataProvider:
    def __init__(self, datasets: Mapping[str, tuple[DatasetDescriptor, pd.DataFrame]]):
        self._datasets = dict(datasets)

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return tuple(item[0] for item in self._datasets.values())

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        try:
            descriptor, frame = self._datasets[query.dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {query.dataset_id}") from exc
        if (
            query.symbol is not None
            and descriptor.symbol is not None
            and query.symbol != descriptor.symbol
        ):
            raise DataSchemaError(
                f"dataset {query.dataset_id} does not provide symbol {query.symbol}"
            )
        if (
            query.timeframe is not None
            and descriptor.timeframe is not None
            and query.timeframe != descriptor.timeframe
        ):
            raise DataSchemaError(
                f"dataset {query.dataset_id} does not provide timeframe {query.timeframe}"
            )
        return prepare_bounded_market_data(
            frame,
            descriptor,
            query,
            load_metadata={"query_bounded": True},
        )


class ManifestMarketDataProvider:
    """Load only server-registered local datasets; requests never contain paths."""

    def __init__(self, manifest_path: Path):
        manifest_path = manifest_path.resolve()
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        self._base_dir = manifest_path.parent
        self._descriptors: dict[str, DatasetDescriptor] = {}
        for item in payload.get("datasets", []):
            path = (self._base_dir / item["path"]).resolve()
            if not path.is_relative_to(self._base_dir):
                raise DataSchemaError("dataset path escapes manifest directory")
            descriptor = DatasetDescriptor(
                dataset_id=item["dataset_id"],
                symbol=item["symbol"],
                venue=item["venue"],
                timeframe=item["timeframe"],
                source_path=path,
            )
            if descriptor.dataset_id in self._descriptors:
                raise DataSchemaError(f"duplicate dataset_id: {descriptor.dataset_id}")
            self._descriptors[descriptor.dataset_id] = descriptor

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return tuple(self._descriptors.values())

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        try:
            descriptor = self._descriptors[query.dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {query.dataset_id}") from exc
        if (
            query.symbol is not None
            and descriptor.symbol is not None
            and query.symbol != descriptor.symbol
        ):
            raise DataSchemaError(
                f"dataset {query.dataset_id} does not provide symbol {query.symbol}"
            )
        if (
            query.timeframe is not None
            and descriptor.timeframe is not None
            and query.timeframe != descriptor.timeframe
        ):
            raise DataSchemaError(
                f"dataset {query.dataset_id} does not provide timeframe {query.timeframe}"
            )
        path = descriptor.source_path
        if path is None or not path.is_file():
            raise DatasetNotFoundError(f"dataset file is unavailable: {query.dataset_id}")
        if path.suffix == ".parquet":
            frame = pd.read_parquet(path)
        elif path.suffix == ".csv" or path.name.endswith(".csv.gz"):
            frame = pd.read_csv(path, index_col=0, parse_dates=True)
        else:
            raise DataSchemaError(f"unsupported dataset format: {path.suffix}")
        return prepare_bounded_market_data(
            frame,
            descriptor,
            query,
            load_metadata={"query_bounded": True},
        )


def load_historical_data_runtime(storage_root: str | Path) -> HistoricalDataRuntime:
    """Verify the approved installed wheel and accepted canonical storage release."""
    root = Path(storage_root).resolve()
    configured_root = os.getenv("HISTORICAL_MARKET_DATA_ROOT")
    if not configured_root or Path(configured_root).resolve() != root:
        raise DataSchemaError(
            "HISTORICAL_MARKET_DATA_ROOT must point at the canonical read-only mount"
        )

    try:
        distribution = importlib.metadata.distribution(HISTORICAL_READER_DISTRIBUTION)
    except importlib.metadata.PackageNotFoundError as exc:
        raise DatasetNotFoundError(
            f"approved {HISTORICAL_READER_DISTRIBUTION} reader wheel is not installed"
        ) from exc
    if distribution.version != HISTORICAL_READER_VERSION:
        raise DataSchemaError(
            "historical reader version mismatch: "
            f"expected {HISTORICAL_READER_VERSION}, got {distribution.version}"
        )

    loader_module = importlib.import_module("data_loader")
    manifest_module = importlib.import_module("storage_manifest")
    expected_loader_path = Path(distribution.locate_file("data_loader.py")).resolve()
    actual_loader_path = Path(loader_module.__file__).resolve()
    if actual_loader_path != expected_loader_path:
        raise DataSchemaError(
            "data_loader import is shadowed; Portal requires the installed approved wheel"
        )
    module_storage_root = Path(loader_module.STORAGE_DIR).resolve()
    if module_storage_root != root:
        raise DataSchemaError(
            "installed historical reader was initialized with a different storage root"
        )
    loader_contract = str(loader_module.LOADER_CONTRACT_VERSION)
    if loader_contract != HISTORICAL_LOADER_CONTRACT:
        raise DataSchemaError(
            "historical loader contract mismatch: "
            f"expected {HISTORICAL_LOADER_CONTRACT}, got {loader_contract}"
        )

    try:
        payload = manifest_module.validate_accepted_release_manifest(
            manifest_module.read_release_manifest(root)
        )
        manifest_module.assert_loader_compatible(
            root,
            dataset_id=BINANCE_RELEASE_DATASET_ID,
            loader_contract_version=loader_contract,
        )
    except Exception as exc:
        raise DataSchemaError(
            f"historical storage release is incompatible: {type(exc).__name__}: {exc}"
        ) from exc
    manifest_path = Path(manifest_module.release_manifest_path(root))
    manifest_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    git = payload["git"]
    return HistoricalDataRuntime(
        storage_root=root,
        reader_version=distribution.version,
        loader_contract=loader_contract,
        manifest_digest=manifest_digest,
        environment_id=str(payload["environment_id"]),
        release_commit=str(git["commit"]),
        release_tag=str(git["tag"]),
        dataset_release_id=BINANCE_RELEASE_DATASET_ID,
        loader_class=loader_module.CryptoBinance1m,
        additional_loaders=(("crypto-binance-spot-1m", loader_module.CryptoBinanceSpot1m),
                            ("crypto-binance-quarterly-1m", loader_module.CryptoBinanceQuarterly1m)),
    )


def load_vn_stock_daily_qualification_runtime(storage_root: str | Path) -> HistoricalDataRuntime:
    """Verify this installed release for a source-only VN qualification read.

    This is deliberately outside the active provider factory/registry. An
    accepted loader is not session-calendar, instrument or P10 qualification.
    """
    runtime = load_historical_data_runtime(storage_root)
    loader_module = importlib.import_module("data_loader")
    manifest_module = importlib.import_module("storage_manifest")
    try:
        manifest_module.assert_loader_compatible(runtime.storage_root,
            dataset_id=VN_STOCK_DAILY_RELEASE_DATASET_ID, loader_contract_version=runtime.loader_contract)
    except Exception as exc:
        raise DataSchemaError("VN daily storage release is not reader-compatible") from exc
    return replace(runtime, dataset_release_id=VN_STOCK_DAILY_RELEASE_DATASET_ID,
        loader_class=loader_module.VnStockDaily, additional_loaders=())


class VnStockDailyQualificationProvider:
    """Opt-in source oracle only; never registered as an executable dataset.

    The reader publishes local daily date labels, not session-close timestamps
    or an authoritative exchange calendar. Preserve the observed labels/gaps,
    localize before UTC conversion, and keep session completeness unknown.
    """

    def __init__(self, *, runtime: HistoricalDataRuntime | None = None,
                 loader_factory: Callable[[], object] | None = None) -> None:
        if runtime is None and loader_factory is None:
            root = os.getenv("HISTORICAL_MARKET_DATA_ROOT")
            if not root:
                raise DatasetNotFoundError("HISTORICAL_MARKET_DATA_ROOT is not configured")
            runtime = load_vn_stock_daily_qualification_runtime(root)
        if runtime is not None and runtime.dataset_release_id != VN_STOCK_DAILY_RELEASE_DATASET_ID:
            raise DataSchemaError("VN qualification requires its exact source release namespace")
        self._runtime = runtime
        self._loader_factory = loader_factory

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return (DatasetDescriptor(dataset_id=VN_STOCK_DAILY_DATASET_ID, symbol=None, venue="VN",
            timeframe="1d", dynamic_query=True, supported_timeframes=("1d",),
            source_class="historical_market_data", availability="unavailable",
            unavailable_reason="VN_DAILY_PORTAL_EXECUTION_NOT_QUALIFIED",
            usage_scopes=HISTORICAL_USAGE_SCOPES, excluded_scopes=HISTORICAL_EXCLUDED_SCOPES,
            source_timezone=VN_SOURCE_TIMEZONE),)

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        if query.dataset_id != VN_STOCK_DAILY_DATASET_ID:
            raise DatasetNotFoundError("VN daily qualification admits only its exact source namespace")
        symbol = str(query.symbol or "").strip().upper()
        if not _SYMBOL_PATTERN.fullmatch(symbol):
            raise DataSchemaError("VN daily qualification requires an explicit valid symbol")
        if str(query.timeframe or "").strip().lower() != "1d":
            raise DataSchemaError("VN daily qualification admits source daily bars only, without resampling")
        if tuple(query.columns) != REQUIRED_MARKET_COLUMNS:
            raise DataSchemaError("VN daily qualification requires the complete source OHLCV schema")
        start, end = query.utc_bounds(required=True)
        assert start is not None and end is not None
        local_start, local_end = start.tz_convert(VN_SOURCE_TIMEZONE), end.tz_convert(VN_SOURCE_TIMEZONE)
        if local_start != local_start.normalize() or local_end != local_end.normalize():
            raise DateRangeError("VN daily qualification bounds must be source-local date midnights")
        if local_end - local_start > pd.Timedelta(31, unit="D"):
            raise DateRangeError("VN daily source qualification reads are bounded to 31 local dates")
        # The installed reader compares naive local source labels with inclusive
        # bounds. Never pass UTC strings and silently reinterpret the dates.
        reader_start = local_start.tz_localize(None)
        reader_end = local_end.tz_localize(None) - pd.Timedelta(1, unit="us")
        loader = self._loader_factory() if self._loader_factory else self._runtime.loader_class()
        started = perf_counter()
        raw = loader.load(symbol, start_date=reader_start.isoformat(), end_date=reader_end.isoformat(), check_val=True)
        elapsed = perf_counter() - started
        if not isinstance(raw, pd.DataFrame) or raw.empty:
            raise DatasetNotFoundError("No observed VN daily bars in the requested local-date window")
        if "time" not in raw.columns or "symbol" not in raw.columns:
            raise DataSchemaError("VN daily reader output lacks its source time/symbol identity")
        if any(column not in raw.columns for column in REQUIRED_MARKET_COLUMNS):
            raise DataSchemaError("VN daily reader output lacks the required OHLCV schema")
        if not raw["symbol"].map(lambda value: isinstance(value, str) and value.strip().upper() == symbol).all():
            raise DataSchemaError("VN daily reader returned a different source symbol")
        try:
            labels = pd.DatetimeIndex(pd.to_datetime(raw["time"], format="mixed", errors="raise"))
            if labels.hasnans:
                raise ValueError("missing source date")
            local_labels = labels.tz_localize(VN_SOURCE_TIMEZONE) if labels.tz is None else labels.tz_convert(VN_SOURCE_TIMEZONE)
        except (TypeError, ValueError) as exc:
            raise DataSchemaError("VN daily reader returned invalid source date labels") from exc
        if not (local_labels == local_labels.normalize()).all():
            raise DataSchemaError("VN daily reader labels are not source-local dates")
        if not local_labels.is_monotonic_increasing or local_labels.has_duplicates:
            raise DataSchemaError("VN daily reader source dates are unordered or duplicated")
        frame = raw.loc[:, REQUIRED_MARKET_COLUMNS].copy()
        frame.index = local_labels.tz_convert("UTC")
        normalized = normalize_market_frame(frame)
        bounded = _bounded_frame(normalized, query)
        descriptor = replace(self.list_datasets()[0], symbol=symbol)
        return PreparedMarketData(frame=bounded, descriptor=descriptor, content_hash=market_content_hash(bounded),
            missing_bar_count=None, load_metadata={
                **(self._runtime.provenance() if self._runtime else {"reader_version": "test-double",
                    "loader_contract": HISTORICAL_LOADER_CONTRACT, "dataset_release_id": VN_STOCK_DAILY_RELEASE_DATASET_ID}),
                "provider": "VnStockDaily", "source_resolution": "1d", "source_timezone": VN_SOURCE_TIMEZONE,
                "requested_timeframe": "1d", "requested_start": start.isoformat(), "requested_end_exclusive": end.isoformat(),
                "check_val": True, "load_seconds": round(elapsed, 6),
                "qualification_scope": "SOURCE_READER_ONLY_NOT_P10_ADMISSION",
                "daily_timestamp_basis": "SOURCE_LOCAL_DATE_LABEL_NOT_SESSION_CLOSE",
                "session_quality_state": "NOT_PUBLISHED", "session_quality_reason_code": "VN_SESSION_CALENDAR_NOT_PUBLISHED",
                "instrument_metadata_state": "NOT_PUBLISHED",
                "instrument_metadata_reason_code": "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED",
            })


class VnStockDailyObservedProvider(VnStockDailyQualificationProvider):
    """Explicit read adapter over a verified, immutable observed-date index.

    This is not installed in the default provider factory and grants no P10
    profile, exchange calendar, session-close or instrument authority. The
    service supplies the already verified document/revision and installed
    runtime; construction does not inspect a current pointer or source file.
    The adapter defensively rechecks its own VN branch without importing a
    service (services depend on adapters, never the reverse).
    """

    MAX_CHUNK_DAYS = 31
    MAX_CHUNKS = 100
    MAX_WARMUP_BARS = 100_000
    DAY_MS = 86_400_000
    OFFSET_MS = 7 * 3_600_000
    CLOCK_BASIS = "OBSERVED_SOURCE_LOCAL_DATE_V1"

    def __init__(self, *, index_document: Mapping[str, object], index_revision: str,
                 runtime: HistoricalDataRuntime | None = None,
                 loader_factory: Callable[[], object] | None = None) -> None:
        if runtime is None and loader_factory is None:
            raise DataSchemaError("VN observed adapter requires an explicit installed runtime")
        super().__init__(runtime=runtime, loader_factory=loader_factory)
        try:
            raw = json.dumps(index_document, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
            document = json.loads(raw)
        except (TypeError, ValueError) as exc:
            raise DataSchemaError("VN_OBSERVED_INDEX_DOCUMENT_REJECTED") from exc
        if len(raw) > 8 * 1024 * 1024 or not isinstance(index_revision, str) \
                or not re.fullmatch(r"[0-9a-f]{64}", index_revision) \
                or hashlib.sha256(raw).hexdigest() != index_revision:
            raise DataSchemaError("VN_OBSERVED_INDEX_REVISION_REJECTED")
        if not isinstance(document, dict) or set(document) != {
                "schema_version", "source_manifest_digest", "as_of_utc_ms", "entries"} \
                or document["schema_version"] != "research.dataset-index.v2" \
                or not isinstance(document["source_manifest_digest"], str) \
                or not re.fullmatch(r"[0-9a-f]{64}", document["source_manifest_digest"]):
            raise DataSchemaError("VN_OBSERVED_INDEX_DOCUMENT_REJECTED")
        clock = document["as_of_utc_ms"]
        if not self._is_ms(clock) or not isinstance(document["entries"], list) \
                or len(document["entries"]) > 256 * 16:
            raise DataSchemaError("VN_OBSERVED_INDEX_DOCUMENT_REJECTED")
        self._manifest_digest = document["source_manifest_digest"]
        self._index_revision = index_revision
        self._index_clock = clock
        self._indexes: dict[str, dict] = {}
        for entry in document["entries"]:
            if not isinstance(entry, dict) or set(entry) != {"dataset_id", "symbol", "index"}:
                raise DataSchemaError("VN_OBSERVED_INDEX_DOCUMENT_REJECTED")
            if entry["dataset_id"] != VN_STOCK_DAILY_DATASET_ID:
                continue  # Verified mixed-document namespaces do not grant a VN query.
            symbol, index = entry["symbol"], entry["index"]
            if not isinstance(symbol, str) or not _SYMBOL_PATTERN.fullmatch(symbol) \
                    or symbol in self._indexes:
                raise DataSchemaError("VN_OBSERVED_INDEX_DOCUMENT_REJECTED")
            self._validate_index(index, clock)
            self._indexes[symbol] = index
        if not self._indexes:
            raise DataSchemaError("VN_OBSERVED_INDEX_HAS_NO_VN_ENTRIES")
        self._verify_runtime_pin()

    @staticmethod
    def _is_ms(value: object) -> bool:
        return type(value) is int and 0 <= value <= 9_007_199_254_740_991

    @classmethod
    def _validate_index(cls, index: object, clock: int) -> None:
        rejected = "VN_OBSERVED_INDEX_DOCUMENT_REJECTED"
        fields = {"timeframe", "resolution_ms", "start_utc_ms", "end_exclusive_utc_ms", "as_of_utc_ms",
                  "duplicate_bar_count", "runs", "clock_basis", "source_timezone"}
        if not isinstance(index, dict) or set(index) != fields \
                or index["timeframe"] != "1d" or index["clock_basis"] != cls.CLOCK_BASIS \
                or index["source_timezone"] != VN_SOURCE_TIMEZONE \
                or any(not cls._is_ms(index[key]) for key in
                       ("resolution_ms", "start_utc_ms", "end_exclusive_utc_ms", "as_of_utc_ms")):
            raise DataSchemaError(rejected)
        start, end = index["start_utc_ms"], index["end_exclusive_utc_ms"]
        if index["resolution_ms"] != cls.DAY_MS or index["as_of_utc_ms"] != clock \
                or start >= end or end > clock or (start + cls.OFFSET_MS) % cls.DAY_MS \
                or (end + cls.OFFSET_MS) % cls.DAY_MS \
                or (end - start + cls.MAX_CHUNK_DAYS * cls.DAY_MS - 1) // (cls.MAX_CHUNK_DAYS * cls.DAY_MS) > cls.MAX_CHUNKS \
                or type(index["duplicate_bar_count"]) is not int or index["duplicate_bar_count"] != 0 \
                or not isinstance(index["runs"], list) or len(index["runs"]) > 50_000:
            raise DataSchemaError(rejected)
        previous, rows = start - 2 * cls.DAY_MS, 0
        for pair in index["runs"]:
            if not isinstance(pair, list) or len(pair) != 2 or any(not cls._is_ms(value) for value in pair):
                raise DataSchemaError(rejected)
            first, last = pair
            if first < start or last + cls.DAY_MS > end or first > last \
                    or (first + cls.OFFSET_MS) % cls.DAY_MS or (last + cls.OFFSET_MS) % cls.DAY_MS \
                    or first <= previous + cls.DAY_MS:
                raise DataSchemaError(rejected)
            rows += (last - first) // cls.DAY_MS + 1
            if rows > 10_000_000:
                raise DataSchemaError(rejected)
            previous = last

    def _verify_runtime_pin(self) -> None:
        if self._runtime is not None and self._runtime.manifest_digest != self._manifest_digest:
            raise DataSchemaError("VN_OBSERVED_INDEX_SOURCE_REVISION_CHANGED")

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        self._verify_runtime_pin()
        present = any(index["runs"] for index in self._indexes.values())
        descriptor = super().list_datasets()[0]
        return (replace(descriptor, availability="available" if present else "unavailable",
                        unavailable_reason=None if present else "HMD_INDEXED_RANGE_HAS_NO_BARS"),)

    def research_symbol_catalog(self, dataset_id: str) -> tuple[dict[str, object], ...]:
        if dataset_id != VN_STOCK_DAILY_DATASET_ID:
            raise DatasetNotFoundError("VN observed adapter admits only its exact source namespace")
        self._verify_runtime_pin()
        return tuple({"symbol": symbol, "contract_kind": None, "coverage": None}
                     for symbol, index in sorted(self._indexes.items()) if index["runs"])

    def qualification(self) -> dict[str, object]:
        from portal_api.domain.research_vn_observed_fixed_profile import VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST
        self._verify_runtime_pin()
        ready = bool(self._indexes.get("FPT", {}).get("runs"))
        return {"state": "AVAILABLE" if ready else "NOT_PUBLISHED",
            "reason_code": None if ready else "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
            "profile_id": VN_OBSERVED_FIXED_PROFILE_ID, "profile_digest": VN_OBSERVED_FIXED_PROFILE_DIGEST,
            "dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "timeframe": "1d",
            "source_timezone": VN_SOURCE_TIMEZONE, "clock_basis": self.CLOCK_BASIS,
            "index_revision": self._index_revision if ready else None}

    @classmethod
    def _timestamps(cls, index: dict, start: int, end: int) -> list[int]:
        result: list[int] = []
        for first, last in index["runs"]:
            left, right = max(first, start), min(last, end - cls.DAY_MS)
            if left <= right:
                result.extend(range(left, right + cls.DAY_MS, cls.DAY_MS))
        return result

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        return self.load_with_warmup(query, warmup_bars=0)

    def load_with_warmup(self, query: MarketDataQuery, *, warmup_bars: int) -> PreparedMarketData:
        """Hydrate exactly N observed predecessors and the requested half-open tape."""
        self._verify_runtime_pin()
        if type(warmup_bars) is not int or not 0 <= warmup_bars <= self.MAX_WARMUP_BARS:
            raise DataSchemaError("VN_OBSERVED_WARMUP_INVALID")
        if query.dataset_id != VN_STOCK_DAILY_DATASET_ID:
            raise DatasetNotFoundError("VN observed adapter admits only its exact source namespace")
        symbol = str(query.symbol or "").strip().upper()
        if not _SYMBOL_PATTERN.fullmatch(symbol) or str(query.timeframe or "").strip().lower() != "1d" \
                or tuple(query.columns) != REQUIRED_MARKET_COLUMNS:
            raise DataSchemaError("VN_OBSERVED_QUERY_INVALID")
        start, end = query.utc_bounds(required=True)
        assert start is not None and end is not None
        if start != start.tz_convert(VN_SOURCE_TIMEZONE).normalize().tz_convert("UTC") \
                or end != end.tz_convert(VN_SOURCE_TIMEZONE).normalize().tz_convert("UTC"):
            raise DateRangeError("VN observed query bounds must be source-local date midnights")
        start_ms, end_ms = int(start.value // 1_000_000), int(end.value // 1_000_000)
        index = self._indexes.get(symbol)
        if index is None:
            raise DatasetNotFoundError("HMD_SYMBOL_INTERVAL_NOT_INDEXED")
        if start_ms < index["start_utc_ms"] or end_ms > index["end_exclusive_utc_ms"]:
            raise DateRangeError("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE")
        predecessors = self._timestamps(index, index["start_utc_ms"], start_ms)
        if len(predecessors) < warmup_bars:
            raise DateRangeError("WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE")
        requested = self._timestamps(index, start_ms, end_ms)
        if not requested:
            raise DatasetNotFoundError("No observed VN daily bars in the requested local-date window")
        warmup_start = predecessors[-warmup_bars] if warmup_bars else None
        hydrated_start = warmup_start if warmup_start is not None else start_ms
        expected = (predecessors[-warmup_bars:] if warmup_bars else []) + requested
        frames: list[pd.DataFrame] = []
        cursor, source_seconds, queries = hydrated_start, 0.0, 0
        while cursor < end_ms:
            boundary = min(end_ms, cursor + self.MAX_CHUNK_DAYS * self.DAY_MS)
            queries += 1
            if queries > self.MAX_CHUNKS:
                raise DateRangeError("VN_OBSERVED_HYDRATION_CHUNK_BUDGET")
            self._verify_runtime_pin()
            expected_chunk = self._timestamps(index, cursor, boundary)
            chunk_query = replace(query, symbol=symbol, timeframe="1d",
                start=pd.Timestamp(cursor, unit="ms", tz="UTC"),
                end_exclusive=pd.Timestamp(boundary, unit="ms", tz="UTC"))
            try:
                loaded = super().load(chunk_query)
            except DatasetNotFoundError as exc:
                if str(exc) != "No observed VN daily bars in the requested local-date window" or expected_chunk:
                    raise DataSchemaError("VN_OBSERVED_SOURCE_INDEX_DISAGREEMENT") from exc
            else:
                actual = [int(value) for value in loaded.frame.index.as_unit("ms").asi8]
                if actual != expected_chunk or len(actual) > self.MAX_CHUNK_DAYS:
                    raise DataSchemaError("VN_OBSERVED_SOURCE_INDEX_DISAGREEMENT")
                frames.append(loaded.frame)
                source_seconds += float(loaded.load_metadata["load_seconds"])
            self._verify_runtime_pin()
            cursor = boundary
        frame = pd.concat(frames)
        actual = [int(value) for value in frame.index.as_unit("ms").asi8]
        if actual != expected or not frame.index.is_monotonic_increasing or frame.index.has_duplicates:
            raise DataSchemaError("VN_OBSERVED_SOURCE_INDEX_DISAGREEMENT")
        return PreparedMarketData(frame=frame, descriptor=replace(self.list_datasets()[0], symbol=symbol),
            content_hash=market_content_hash(frame), missing_bar_count=None, load_metadata={
                **(self._runtime.provenance() if self._runtime else {"reader_version": "test-double",
                    "loader_contract": HISTORICAL_LOADER_CONTRACT, "dataset_release_id": VN_STOCK_DAILY_RELEASE_DATASET_ID}),
                "provider": "VnStockDaily", "source_resolution": "1d", "source_timezone": VN_SOURCE_TIMEZONE,
                "requested_timeframe": "1d", "requested_start": start.isoformat(), "requested_end_exclusive": end.isoformat(),
                "check_val": True, "load_seconds": round(source_seconds, 6), "source_queries": queries,
                "qualification_scope": "OBSERVED_DAILY_ADAPTER_ONLY_NOT_P10_ADMISSION",
                "daily_timestamp_basis": "SOURCE_LOCAL_DATE_LABEL_NOT_SESSION_CLOSE", "clock_basis": self.CLOCK_BASIS,
                "metadata_index_revision": self._index_revision, "metadata_index_source_manifest_digest": self._manifest_digest,
                "metadata_index_as_of_utc_ms": self._index_clock, "warmup_start_utc_ms": warmup_start,
                "warmup_bars": warmup_bars, "analysis_bars": len(requested), "hydrated_start_utc_ms": hydrated_start,
                "verified_end_exclusive_utc_ms": index["end_exclusive_utc_ms"],
                "session_quality_state": "NOT_PUBLISHED", "session_quality_reason_code": "VN_SESSION_CALENDAR_NOT_PUBLISHED",
                "instrument_metadata_state": "NOT_PUBLISHED", "instrument_metadata_reason_code": "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED",
            })


class ObservedVnCompositeProvider:
    """Opt-in composition; unchanged crypto reads plus the pinned VN adapter."""
    def __init__(self, primary: MarketDataProvider, observed: VnStockDailyObservedProvider):
        self.primary, self.observed = primary, observed
        self._runtime = getattr(primary, "_runtime", None)
        if self._runtime is None or self._runtime.manifest_digest != observed._manifest_digest:
            raise DataSchemaError("VN composite source revisions disagree")

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return self.primary.list_datasets() + self.observed.list_datasets()

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        return (self.observed if query.dataset_id == VN_STOCK_DAILY_DATASET_ID else self.primary).load(query)

    def load_with_warmup(self, query: MarketDataQuery, *, warmup_bars: int) -> PreparedMarketData:
        if query.dataset_id != VN_STOCK_DAILY_DATASET_ID:
            raise DataSchemaError("observed warmup is reserved for its exact VN source namespace")
        return self.observed.load_with_warmup(query, warmup_bars=warmup_bars)

    def research_symbol_catalog(self, dataset_id: str):
        selected = self.observed if dataset_id == VN_STOCK_DAILY_DATASET_ID else self.primary
        return selected.research_symbol_catalog(dataset_id)

    def qualification(self) -> dict[str, object]:
        return self.observed.qualification()


class UnavailableHistoricalMarketDataProvider:
    """Advertise an intentionally disabled historical capability without fake data."""

    def __init__(self, reason: str) -> None:
        self._reason = str(reason)

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return (
            DatasetDescriptor(
                dataset_id=CRYPTO_BINANCE_DATASET_ID,
                symbol=None,
                venue="BINANCE",
                timeframe=None,
                dynamic_query=True,
                supported_timeframes=HistoricalMarketDataProvider.SUPPORTED_TIMEFRAMES,
                source_class="historical_market_data",
                availability="unavailable",
                unavailable_reason=self._reason,
                usage_scopes=HISTORICAL_USAGE_SCOPES,
                excluded_scopes=HISTORICAL_EXCLUDED_SCOPES,
                source_timezone="UTC",
            ),
        )

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        del query
        raise DatasetNotFoundError(f"historical market data is unavailable: {self._reason}")


class HistoricalMarketDataProvider:
    """Read-only backtest/research adapter over the approved HMD reader wheel."""

    SUPPORTED_TIMEFRAMES = ("1min", "5min", "15min", "30min", "1h", "4h", "1D")

    def __init__(
        self,
        *,
        runtime: HistoricalDataRuntime | None = None,
        loader_factory: Callable[[], object] | None = None,
        check_val: bool = True,
        engine: str = "duckdb",
    ) -> None:
        if runtime is None and loader_factory is None:
            storage_root = os.getenv("HISTORICAL_MARKET_DATA_ROOT")
            if not storage_root:
                raise DatasetNotFoundError("HISTORICAL_MARKET_DATA_ROOT is not configured")
            runtime = load_historical_data_runtime(storage_root)
        self._runtime = runtime
        self._loader_factory = loader_factory
        self._check_val = bool(check_val)
        self._engine = str(engine)
        if self._engine not in {"duckdb", "pandas"}:
            raise ValueError("resample engine must be duckdb or pandas")

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        primary = (
            DatasetDescriptor(
                dataset_id=CRYPTO_BINANCE_DATASET_ID,
                symbol=None,
                venue="BINANCE",
                timeframe=None,
                source_path=None,
                dynamic_query=True,
                supported_timeframes=self.SUPPORTED_TIMEFRAMES,
                source_class="historical_market_data",
                availability="available",
                usage_scopes=HISTORICAL_USAGE_SCOPES,
                excluded_scopes=HISTORICAL_EXCLUDED_SCOPES,
                source_timezone="UTC",
            ),
        )
        additional = []
        for key, loader in getattr(self._runtime, "additional_loaders", ()):
            mounted = self._runtime.storage_root.joinpath(*loader.NEW_PATH_PARTS).is_dir()
            additional.append(DatasetDescriptor(
                dataset_id=key, symbol=None, venue="BINANCE", timeframe=None,
                source_path=None, dynamic_query=True, supported_timeframes=self.SUPPORTED_TIMEFRAMES,
                source_class="historical_market_data",
                availability="available" if mounted else "unavailable",
                unavailable_reason=None if mounted else "HMD_DATASET_COMPONENT_NOT_MOUNTED",
                usage_scopes=HISTORICAL_USAGE_SCOPES,
                excluded_scopes=HISTORICAL_EXCLUDED_SCOPES, source_timezone="UTC",
            ))
        return primary + tuple(additional)

    #: The approved reader's documented layout for the Binance USD-M 1m store
    #: (release manifest: canonical component crypto/binance_futures/1m,
    #: partition_layout_version hive-symbol-year-month-v1).
    FUTURES_1M_COMPONENT = ("crypto", "binance_futures", "1m")
    MAXIMUM_LISTED_SYMBOLS = 512

    def research_symbol_catalog(self, dataset_id: str) -> tuple[dict[str, object], ...]:
        """CG-P08-04: symbols and month-partition coverage, from names only.

        Lists directory names of the accepted storage release; never opens a
        data file. Coverage is partition granularity, not the exact first or
        last bar. A quarterly contract keeps its expiry suffix.
        """
        if self._runtime is None:
            raise DatasetNotFoundError(f"no symbol catalog for dataset_id: {dataset_id}")
        loader = self._loader_class(dataset_id)
        parts = self.FUTURES_1M_COMPONENT if dataset_id == CRYPTO_BINANCE_DATASET_ID else loader.NEW_PATH_PARTS
        root = self._runtime.storage_root.joinpath(*parts)
        quarterly_symbols = set(loader()._discover_symbols()) if dataset_id == "crypto-binance-quarterly-1m" else None
        rows: list[dict[str, object]] = []
        for symbol_dir in sorted(root.glob("symbol=*")):
            if len(rows) >= self.MAXIMUM_LISTED_SYMBOLS or not symbol_dir.is_dir():
                continue
            symbol = symbol_dir.name.split("=", 1)[1].upper()
            if not _SYMBOL_PATTERN.fullmatch(symbol):
                continue
            if quarterly_symbols is not None and symbol not in quarterly_symbols:
                continue
            months = sorted(
                (int(year_dir.name[5:]), int(month_dir.name[6:]))
                for year_dir in symbol_dir.glob("year=*")
                if year_dir.name[5:].isdigit()
                for month_dir in year_dir.glob("month=*")
                if month_dir.name[6:].isdigit()
            )
            rows.append(
                {
                    "symbol": symbol,
                    "contract_kind": None if dataset_id == "crypto-binance-spot-1m" else "QUARTERLY" if re.search(r"_[0-9]{6}$", symbol) else "PERPETUAL",
                    "coverage": None
                    if not months
                    else {
                        "first_month": f"{months[0][0]:04d}-{months[0][1]:02d}",
                        "last_month": f"{months[-1][0]:04d}-{months[-1][1]:02d}",
                        "months": len(months),
                        "granularity": "MONTH_PARTITION",
                    },
                }
            )
        return tuple(rows)

    def _loader_class(self, dataset_id: str):
        if self._runtime is None:
            raise DatasetNotFoundError("historical reader runtime is unavailable")
        if dataset_id == CRYPTO_BINANCE_DATASET_ID:
            return self._runtime.loader_class
        for key, loader in getattr(self._runtime, "additional_loaders", ()):
            if key == dataset_id:
                return loader
        raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}")

    def _new_loader(self, dataset_id: str = CRYPTO_BINANCE_DATASET_ID):
        if self._loader_factory is not None:
            return self._loader_factory()
        if self._runtime is None:  # pragma: no cover - constructor invariant
            raise DatasetNotFoundError("historical reader runtime is unavailable")
        return self._loader_class(dataset_id)()

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        if query.dataset_id not in {d.dataset_id for d in self.list_datasets() if d.availability == "available"}:
            raise DatasetNotFoundError(f"unknown dataset_id: {query.dataset_id}")
        normalized_symbol = str(query.symbol or "").strip().upper()
        if not _SYMBOL_PATTERN.fullmatch(normalized_symbol):
            raise DataSchemaError("symbol must contain 2-32 uppercase venue characters")
        normalized_timeframe = str(query.timeframe or "").strip()
        if not _TIMEFRAME_PATTERN.fullmatch(normalized_timeframe):
            raise DataSchemaError("timeframe must be a positive interval such as 15min, 1h or 1D")
        if tuple(query.columns) != REQUIRED_MARKET_COLUMNS:
            raise DataSchemaError(
                "the certified Binance OHLCV hot path requires open/high/low/close/volume"
            )
        start, end = query.utc_bounds(required=True)
        assert start is not None and end is not None
        # The reader's end_date is inclusive and converts to Python datetime.
        # One microsecond preserves the half-open Portal contract without a
        # nanosecond-truncation warning or admitting the next boundary.
        reader_end = end - pd.Timedelta(1, unit="us")

        started = perf_counter()
        loader = self._new_loader(query.dataset_id)
        raw = loader.load_resampled(
            normalized_symbol,
            timeframe=normalized_timeframe,
            start_date=start.isoformat(),
            end_date=reader_end.isoformat(),
            check_val=self._check_val,
            engine=self._engine,
        )
        load_seconds = perf_counter() - started
        if not isinstance(raw, pd.DataFrame) or raw.empty:
            prefix = "no Binance futures bars" if query.dataset_id == CRYPTO_BINANCE_DATASET_ID else "no historical bars"
            raise DatasetNotFoundError(
                f"{prefix} for {normalized_symbol} at {normalized_timeframe}"
            )
        if "time" not in raw.columns:
            raise DataSchemaError("historical reader output is missing time")

        frame = (
            raw.sort_values("time", kind="stable")
            .rename(columns={"time": "datetime"})
            .set_index("datetime")
        )
        descriptor = DatasetDescriptor(
            dataset_id=query.dataset_id,
            symbol=normalized_symbol,
            venue="BINANCE",
            timeframe=normalized_timeframe,
            dynamic_query=True,
            supported_timeframes=self.SUPPORTED_TIMEFRAMES,
            source_class="historical_market_data",
            availability="available",
            usage_scopes=HISTORICAL_USAGE_SCOPES,
            excluded_scopes=HISTORICAL_EXCLUDED_SCOPES,
            source_timezone="UTC",
        )
        return prepare_bounded_market_data(
            frame,
            descriptor,
            query,
            load_metadata={
                "provider": "CryptoBinance1m" if query.dataset_id == CRYPTO_BINANCE_DATASET_ID else type(loader).__name__,
                "source_resolution": "1min",
                "source_timezone": "UTC",
                "requested_timeframe": normalized_timeframe,
                "requested_start": start.isoformat(),
                "requested_end_exclusive": end.isoformat(),
                "resample_engine": self._engine,
                "check_val": self._check_val,
                "load_seconds": round(load_seconds, 6),
                **(self._runtime.provenance() if self._runtime is not None else {
                    "source_class": "historical_market_data",
                    "usage_scope": "backtest,research",
                    "reader_version": "test-double",
                    "loader_contract": HISTORICAL_LOADER_CONTRACT,
                    "dataset_release_id": BINANCE_RELEASE_DATASET_ID,
                }),
            },
        )
