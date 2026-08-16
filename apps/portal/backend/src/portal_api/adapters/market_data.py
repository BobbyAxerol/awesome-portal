from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import re
from dataclasses import dataclass, field
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
    missing_bar_count: int
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
    )


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
        return (
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

    def _new_loader(self):
        if self._loader_factory is not None:
            return self._loader_factory()
        if self._runtime is None:  # pragma: no cover - constructor invariant
            raise DatasetNotFoundError("historical reader runtime is unavailable")
        return self._runtime.loader_class()

    def load(self, query: MarketDataQuery) -> PreparedMarketData:
        if query.dataset_id != CRYPTO_BINANCE_DATASET_ID:
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
        raw = self._new_loader().load_resampled(
            normalized_symbol,
            timeframe=normalized_timeframe,
            start_date=start.isoformat(),
            end_date=reader_end.isoformat(),
            check_val=self._check_val,
            engine=self._engine,
        )
        load_seconds = perf_counter() - started
        if not isinstance(raw, pd.DataFrame) or raw.empty:
            raise DatasetNotFoundError(
                f"no Binance futures bars for {normalized_symbol} at {normalized_timeframe}"
            )
        if "time" not in raw.columns:
            raise DataSchemaError("CryptoBinance1m output is missing time")

        frame = (
            raw.sort_values("time", kind="stable")
            .rename(columns={"time": "datetime"})
            .set_index("datetime")
        )
        descriptor = DatasetDescriptor(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
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
                "provider": "CryptoBinance1m",
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
