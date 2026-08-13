from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from portal_api.domain.errors import ArtifactPathError
from portal_api.repositories import ArtifactRepository


def test_json_and_parquet_round_trip(tmp_path) -> None:
    repository = ArtifactRepository(tmp_path / "runs")
    repository.write_json("run_001", "manifest.json", {"value": np.float64(1.25)})
    frame = pd.DataFrame({"equity": [100.0, 101.0]})
    path = repository.write_frame("run_001", "series/is.parquet", frame)

    assert repository.read_json("run_001", "manifest.json") == {"value": 1.25}
    pd.testing.assert_frame_equal(pd.read_parquet(path), frame)


def test_repository_rejects_path_traversal(tmp_path) -> None:
    repository = ArtifactRepository(tmp_path / "runs")
    with pytest.raises(ArtifactPathError):
        repository.write_json("../escape", "manifest.json", {})
    with pytest.raises(ArtifactPathError):
        repository.write_json("run_001", "../escape.json", {})
