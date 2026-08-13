"""Canonical serializer tests (Phase P0, B2)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from enum import Enum
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from portal_api.serialization import SerializationError, canonicalize, canonicalize_nullable


class _SampleEnum(Enum):
    MODE_1_DECAY = "mode_1_decay"
    COUNT = 3


def test_primitives_round_trip_unchanged() -> None:
    assert canonicalize(None) is None
    assert canonicalize(True) is True
    assert canonicalize(42) == 42
    assert canonicalize(3.25) == 3.25
    assert canonicalize("text") == "text"


def test_non_finite_float_is_rejected() -> None:
    for value in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(SerializationError):
            canonicalize(value)


def test_nullable_projection_maps_diagnostic_non_finite_values_to_null() -> None:
    projected = canonicalize_nullable(
        {
            "objective": float("-inf"),
            "temporal_score": np.float64("nan"),
            "nested": [1.0, float("inf"), pd.NA],
        }
    )
    assert projected == {
        "objective": None,
        "temporal_score": None,
        "nested": [1.0, None, None],
    }


def test_timestamps_become_iso8601() -> None:
    stamp = datetime(2024, 1, 1, 12, 30, tzinfo=UTC)
    assert canonicalize(stamp) == "2024-01-01T12:30:00+00:00"
    assert canonicalize(date(2024, 1, 1)) == "2024-01-01"
    assert canonicalize(pd.Timestamp("2024-01-01 00:00:00+00:00")) == "2024-01-01T00:00:00+00:00"


def test_enum_unwraps_to_value() -> None:
    assert canonicalize(_SampleEnum.MODE_1_DECAY) == "mode_1_decay"
    assert canonicalize(_SampleEnum.COUNT) == 3


def test_numpy_scalars_and_arrays() -> None:
    assert canonicalize(np.float64(1.25)) == 1.25
    assert canonicalize(np.int64(7)) == 7
    assert canonicalize(np.bool_(True)) is True
    assert canonicalize(np.array([1.0, 2.0])) == [1.0, 2.0]
    assert canonicalize(np.array([[1, 2], [3, 4]])) == [[1, 2], [3, 4]]
    with pytest.raises(SerializationError):
        canonicalize(np.float64("nan"))


def test_nested_mapping_and_sequences() -> None:
    payload = {"trial_id": np.int64(5), "params": {"window": 32}, "ok": None}
    assert canonicalize(payload) == {"trial_id": 5, "params": {"window": 32}, "ok": None}
    assert canonicalize((1, "a", 2.5)) == [1, "a", 2.5]


def test_dataframe_with_default_index_becomes_records() -> None:
    frame = pd.DataFrame({"equity": [100.0, 101.0], "trial_id": [1, 2]})
    assert canonicalize(frame) == [
        {"equity": 100.0, "trial_id": 1},
        {"equity": 101.0, "trial_id": 2},
    ]


def test_dataframe_with_datetime_index_preserves_timestamps() -> None:
    index = pd.date_range("2024-01-01", periods=2, freq="1h", tz="UTC")
    frame = pd.DataFrame({"close": [100.0, 101.0]}, index=index)
    records = canonicalize(frame)
    assert records[0]["index"] == "2024-01-01T00:00:00+00:00"
    assert records[1]["close"] == 101.0


def test_series_becomes_value_list() -> None:
    series = pd.Series([1.0, 2.0, 3.0])
    assert canonicalize(series) == [1.0, 2.0, 3.0]


def test_path_becomes_string() -> None:
    assert canonicalize(Path("/tmp/artifacts/runs/abc")) == "/tmp/artifacts/runs/abc"


def test_unknown_type_has_no_repr_fallback() -> None:
    class Opaque:
        def __repr__(self) -> str:
            return "<opaque repr>"

    with pytest.raises(SerializationError):
        canonicalize(Opaque())
    with pytest.raises(SerializationError):
        canonicalize({"key": Opaque()})


def test_unsupported_mapping_key_is_rejected() -> None:
    with pytest.raises(SerializationError):
        canonicalize({object(): 1})


def test_json_round_trip_through_artifact_repository(tmp_path) -> None:
    from portal_api.repositories import ArtifactRepository

    repository = ArtifactRepository(tmp_path / "runs")
    repository.write_json(
        "run_001",
        "audit.json",
        {
            "selected_at": datetime(2024, 1, 1, tzinfo=UTC),
            "objective": np.float64(1.35),
            "mode": _SampleEnum.MODE_1_DECAY,
        },
    )
    assert repository.read_json("run_001", "audit.json") == {
        "selected_at": "2024-01-01T00:00:00+00:00",
        "objective": 1.35,
        "mode": "mode_1_decay",
    }
