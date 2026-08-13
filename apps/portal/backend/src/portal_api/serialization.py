"""Canonical JSON-safe serialization for QuantBT-facing values (Phase P0, B2).

Everything that leaves the domain as an audit artifact goes through
:func:`canonicalize`. It deliberately has **no repr fallback**: values without
a canonical JSON-safe representation raise :class:`SerializationError` instead
of leaking arbitrary Python object shapes into artifacts (plan §11.4).

Read-only diagnostic API projections use :func:`canonicalize_nullable`. It
keeps the same type contract but maps non-finite numeric sentinels from Parquet
(for example a pruned trial's ``-inf`` objective) to JSON ``null``. The strict
artifact writer never uses this relaxed projection.

Supported types:

- ``None``, ``bool``, ``int``, finite ``float``, ``str``;
- ``Enum`` (by value, recursively);
- ``datetime`` / ``date`` / ``pd.Timestamp`` (ISO-8601);
- ``numpy`` scalars and arrays;
- ``Path`` (string form);
- ``pd.Series`` (value list) and ``pd.DataFrame`` (row records; a non-default
  index is included under ``index`` / its name);
- ``Mapping`` (stringifiable keys) and sequences.

``DataFrame``/``datetime``/NumPy values in QuantBT metadata are converted
here before they reach ``ArtifactRepository.write_json``; tabular series
themselves are persisted as Parquet, not through this module.
"""

from __future__ import annotations

import math
from datetime import date, datetime
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd


class SerializationError(TypeError):
    """Raised when a value has no canonical JSON-safe representation."""


def _canonical_key(key: Any) -> str | int | float | bool | None:
    if key is None or isinstance(key, (bool, int, float, str)):
        return key
    if isinstance(key, (np.generic,)) and isinstance(key.item(), (bool, int, float, str)):
        return key.item()
    raise SerializationError(f"unsupported mapping key type: {type(key).__name__}")


def canonicalize(value: Any) -> Any:
    """Return a JSON-safe canonical form of ``value`` or raise."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise SerializationError(f"non-finite float {value!r} cannot be canonicalized")
        return value
    if isinstance(value, Enum):
        return canonicalize(value.value)
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.generic):
        return canonicalize(value.item())
    if isinstance(value, np.ndarray):
        return [canonicalize(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        records = value.to_dict(orient="records")
        if not isinstance(value.index, pd.RangeIndex):
            index_name = value.index.name or "index"
            records = [
                {index_name: canonicalize(timestamp), **record}
                for record, timestamp in zip(records, value.index, strict=True)
            ]
        return [canonicalize(record) for record in records]
    if isinstance(value, pd.Series):
        return [canonicalize(item) for item in value.tolist()]
    if isinstance(value, Mapping):
        return {_canonical_key(key): canonicalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [canonicalize(item) for item in value]
    raise SerializationError(f"no canonical JSON representation for {type(value).__name__}")


def canonicalize_nullable(value: Any) -> Any:
    """Canonicalize a diagnostic projection, mapping missing numerics to null."""
    if value is pd.NA or value is pd.NaT:
        return None
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Enum):
        return canonicalize_nullable(value.value)
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.generic):
        return canonicalize_nullable(value.item())
    if isinstance(value, np.ndarray):
        return [canonicalize_nullable(item) for item in value.tolist()]
    if isinstance(value, pd.DataFrame):
        records = value.to_dict(orient="records")
        if not isinstance(value.index, pd.RangeIndex):
            index_name = value.index.name or "index"
            records = [
                {index_name: canonicalize_nullable(timestamp), **record}
                for record, timestamp in zip(records, value.index, strict=True)
            ]
        return [canonicalize_nullable(record) for record in records]
    if isinstance(value, pd.Series):
        return [canonicalize_nullable(item) for item in value.tolist()]
    if isinstance(value, Mapping):
        return {
            _canonical_key(key): canonicalize_nullable(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [canonicalize_nullable(item) for item in value]
    raise SerializationError(f"no canonical JSON representation for {type(value).__name__}")
