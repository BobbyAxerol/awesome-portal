from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from time import perf_counter
from types import ModuleType
from typing import Callable, Mapping, Protocol

import numpy as np
import pandas as pd

from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError, DateRangeError
from portal_api.domain.requests import ThreeWindowConfig

REQUIRED_MARKET_COLUMNS = ("open", "high", "low", "close", "volume")
CRYPTO_BINANCE_DATASET_ID = "crypto-binance-1m"
_SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
_TIMEFRAME_PATTERN = re.compile(
    r"^[1-9]\d*(?:s|sec|secs|second|seconds|min|minute|minutes|h|hour|hours|d|day|days)$",
    re.IGNORECASE,
)
_LOADER_IMPORT_LOCK = threading.Lock()
_LOADER_MODULES: dict[Path, ModuleType] = {}


@dataclass(frozen=True, slots=True)
class DatasetDescriptor:
    dataset_id: str
    symbol: str | None
    venue: str
    timeframe: str | None
    source_path: Path | None = None
    dynamic_query: bool = False
    supported_timeframes: tuple[str, ...] = ()


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

    def load(
        self,
        dataset_id: str,
        *,
        symbol: str | None = None,
        timeframe: str | None = None,
    ) -> PreparedMarketData: ...


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

    def load(
        self,
        dataset_id: str,
        *,
        symbol: str | None = None,
        timeframe: str | None = None,
    ) -> PreparedMarketData:
        try:
            descriptor, frame = self._datasets[dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}") from exc
        if symbol is not None and descriptor.symbol is not None and symbol != descriptor.symbol:
            raise DataSchemaError(f"dataset {dataset_id} does not provide symbol {symbol}")
        if timeframe is not None and descriptor.timeframe is not None and timeframe != descriptor.timeframe:
            raise DataSchemaError(f"dataset {dataset_id} does not provide timeframe {timeframe}")
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

    def load(
        self,
        dataset_id: str,
        *,
        symbol: str | None = None,
        timeframe: str | None = None,
    ) -> PreparedMarketData:
        try:
            descriptor = self._descriptors[dataset_id]
        except KeyError as exc:
            raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}") from exc
        if symbol is not None and descriptor.symbol is not None and symbol != descriptor.symbol:
            raise DataSchemaError(f"dataset {dataset_id} does not provide symbol {symbol}")
        if timeframe is not None and descriptor.timeframe is not None and timeframe != descriptor.timeframe:
            raise DataSchemaError(f"dataset {dataset_id} does not provide timeframe {timeframe}")
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


def _load_external_data_loader(loader_root: Path) -> ModuleType:
    root = loader_root.resolve()
    cached = _LOADER_MODULES.get(root)
    if cached is not None:
        return cached

    module_path = root / "data_loader.py"
    if not module_path.is_file():
        raise DatasetNotFoundError(f"data_loader.py not found under {root}")

    with _LOADER_IMPORT_LOCK:
        cached = _LOADER_MODULES.get(root)
        if cached is not None:
            return cached
        existing_loaders = sys.modules.get("loaders")
        if existing_loaders is not None:
            existing_file = getattr(existing_loaders, "__file__", None)
            if existing_file is not None and not Path(existing_file).resolve().is_relative_to(root):
                raise DataSchemaError("an incompatible top-level loaders package is already imported")

        module_name = f"portal_external_data_loader_{hashlib.sha256(str(root).encode()).hexdigest()[:12]}"
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise DatasetNotFoundError(f"cannot load data_loader.py from {root}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        sys.path.insert(0, str(root))
        try:
            spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(module_name, None)
            raise
        finally:
            try:
                sys.path.remove(str(root))
            except ValueError:  # pragma: no cover - defensive against external mutation
                pass
        _LOADER_MODULES[root] = module
        return module


class CryptoBinanceMarketDataProvider:
    """Portal adapter over the canonical CryptoBinance1m resample hot path."""

    SUPPORTED_TIMEFRAMES = ("1min", "5min", "15min", "30min", "1h", "4h", "1D")

    def __init__(
        self,
        loader_root: str | Path,
        *,
        loader_factory: Callable[[], object] | None = None,
        check_val: bool = True,
        engine: str = "duckdb",
    ) -> None:
        self._loader_root = Path(loader_root).resolve()
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
            ),
        )

    def _new_loader(self):
        if self._loader_factory is not None:
            return self._loader_factory()
        module = _load_external_data_loader(self._loader_root)
        try:
            loader_class = module.CryptoBinance1m
        except AttributeError as exc:
            raise DatasetNotFoundError("data_loader.py does not expose CryptoBinance1m") from exc
        return loader_class()

    def load(
        self,
        dataset_id: str,
        *,
        symbol: str | None = None,
        timeframe: str | None = None,
    ) -> PreparedMarketData:
        if dataset_id != CRYPTO_BINANCE_DATASET_ID:
            raise DatasetNotFoundError(f"unknown dataset_id: {dataset_id}")
        normalized_symbol = str(symbol or "").strip().upper()
        if not _SYMBOL_PATTERN.fullmatch(normalized_symbol):
            raise DataSchemaError("symbol must contain 2-32 uppercase venue characters")
        normalized_timeframe = str(timeframe or "").strip()
        if not _TIMEFRAME_PATTERN.fullmatch(normalized_timeframe):
            raise DataSchemaError("timeframe must be a positive interval such as 15min, 1h or 1D")

        started = perf_counter()
        raw = self._new_loader().load_resampled(
            normalized_symbol,
            timeframe=normalized_timeframe,
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
        )
        return prepare_market_data(
            frame,
            descriptor,
            load_metadata={
                "provider": "CryptoBinance1m",
                "source_resolution": "1min",
                "requested_timeframe": normalized_timeframe,
                "resample_engine": self._engine,
                "check_val": self._check_val,
                "load_seconds": round(load_seconds, 6),
            },
        )
