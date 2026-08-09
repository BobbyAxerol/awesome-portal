from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Protocol

import numpy as np
import pandas as pd

from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError, DateRangeError
from portal_api.domain.requests import ThreeWindowConfig

REQUIRED_MARKET_COLUMNS = ("open", "high", "low", "close", "volume")


@dataclass(frozen=True, slots=True)
class DatasetDescriptor:
    dataset_id: str
    symbol: str
    venue: str
    timeframe: str
    source_path: Path | None = None


@dataclass(frozen=True, slots=True)
class PreparedMarketData:
    frame: pd.DataFrame
    descriptor: DatasetDescriptor
    content_hash: str
    missing_bar_count: int

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

    def load(self, dataset_id: str) -> PreparedMarketData: ...


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


def prepare_market_data(frame: pd.DataFrame, descriptor: DatasetDescriptor) -> PreparedMarketData:
    normalized = normalize_market_frame(frame)
    return PreparedMarketData(
        frame=normalized,
        descriptor=descriptor,
        content_hash=market_content_hash(normalized),
        missing_bar_count=infer_missing_bars(normalized.index),
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
        else index[-1] + pd.Timedelta(1, unit="ns")
    )

    if is_start < index[0] or holdout_end <= index[0] or holdout_end > index[-1] + pd.Timedelta(1, unit="ns"):
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


class InMemoryMarketDataProvider:
    def __init__(self, datasets: Mapping[str, tuple[DatasetDescriptor, pd.DataFrame]]):
        self._datasets = dict(datasets)

    def list_datasets(self) -> tuple[DatasetDescriptor, ...]:
        return tuple(item[0] for item in self._datasets.values())

    def load(self, dataset_id: str) -> PreparedMarketData:
        try:
            descriptor, frame = self._datasets[dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}") from exc
        return prepare_market_data(frame, descriptor)


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

    def load(self, dataset_id: str) -> PreparedMarketData:
        try:
            descriptor = self._descriptors[dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}") from exc
        path = descriptor.source_path
        if path is None or not path.is_file():
            raise DatasetNotFoundError(f"dataset file is unavailable: {dataset_id}")
        if path.suffix == ".parquet":
            frame = pd.read_parquet(path)
        elif path.suffix == ".csv" or path.name.endswith(".csv.gz"):
            frame = pd.read_csv(path, index_col=0, parse_dates=True)
        else:
            raise DataSchemaError(f"unsupported dataset format: {path.suffix}")
        return prepare_market_data(frame, descriptor)
