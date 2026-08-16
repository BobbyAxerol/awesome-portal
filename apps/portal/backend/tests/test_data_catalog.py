from __future__ import annotations

import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

import httpx
import pandas as pd
import pytest

from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.data_catalog import (
    CANDLE_COLUMNS,
    DataCatalogError,
    DataCatalogLoadError,
    DataCatalogService,
    SnapshotStore,
    compute_quality,
    sha256_bytes,
)


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    if mutate is not None:
        source = _load_json(root / "data-catalog.v1.json")
        mutate(source)
        (root / "data-catalog.v1.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return root


def _activate_candles(root: Path) -> Path:
    def mutate(source: dict[str, object]) -> None:
        for family in source["families"]:
            if family["kind"] == "candle":
                family["activated"] = True

    return _root(root / "activated", mutate)


def _candle_frame(
    rows: int = 240,
    *,
    with_gap: bool = False,
    gap_size: int = 5,
    duplicates: int = 0,
) -> pd.DataFrame:
    index = pd.date_range("2026-01-01", periods=rows, freq="1h", tz="UTC")
    close = pd.Series(range(rows), dtype="float64", index=index)
    frame = pd.DataFrame(
        {
            "open": close + 0.1,
            "high": close + 1.0,
            "low": close - 1.0,
            "close": close,
            "volume": 100.0,
        },
        index=index,
    )
    if with_gap and rows > 10:
        frame = pd.concat(
            [frame.iloc[: rows // 2], frame.iloc[rows // 2 + gap_size :]]
        )
    if duplicates:
        frame = pd.concat([frame, frame.iloc[:duplicates]])
    return frame


def _service(registry_root: Path = REGISTRY_ROOT) -> DataCatalogService:
    return DataCatalogService(registry_root)


# ------------------------------------------------------------------ catalog


def test_catalog_lists_every_u13_family_with_kinds_and_quality_profiles() -> None:
    catalog = _service().catalog
    kinds = {family.family_id: family.kind for family in catalog.families}

    assert kinds["binance-perp-1m"] == "candle"
    assert kinds["binance-daily-matrix"] == "matrix"
    assert kinds["binance-futures-metrics-5m"] == "metrics"
    assert kinds["binance-orderbook-1h"] == "orderbook"
    assert kinds["vn-equity-daily"] == "candle"
    assert kinds["vn-daily-matrix"] == "matrix"
    assert kinds["vn30f1m-continuous"] == "candle"
    assert "deribit-options" in kinds
    assert "vn-raw-1m" in kinds

    # Pending real manifest confirmation: nothing is activated by default.
    assert all(not family.activated for family in catalog.families)
    for family in catalog.families:
        assert 0 < family.quality.max_gap_ratio <= 1
        assert family.quality.max_duplicate_rows >= 0


def test_unlisted_and_inactive_families_fail_closed(tmp_path: Path) -> None:
    service = _service()
    with pytest.raises(DataCatalogError, match="not in the data catalog"):
        service.activated_family("crafted-family")
    with pytest.raises(DataCatalogError, match="not activated"):
        service.activated_family("binance-perp-1m")

    activated = DataCatalogService(_activate_candles(tmp_path))
    family = activated.activated_family("binance-perp-1m")
    assert family.kind == "candle"


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (
            lambda source: source["families"][0].update({"kind": "crafted"}),
            "CATALOG_SOURCE_INVALID",
        ),
        (
            lambda source: source["families"].append({**source["families"][0]}),
            "duplicate family",
        ),
        (
            lambda source: source.update({"schema_version": "data-catalog.v2"}),
            "CATALOG_SOURCE_INVALID",
        ),
        (
            lambda source: source["families"][0]["quality"].update({"max_gap_ratio": 2.0}),
            "CATALOG_SOURCE_INVALID",
        ),
    ],
)
def test_invalid_catalogs_fail_closed(tmp_path: Path, mutate, expected: str) -> None:
    with pytest.raises(DataCatalogLoadError) as error:
        DataCatalogService(_root(tmp_path, mutate))
    assert expected in str(error.value)


# ------------------------------------------------------------------ quality


def test_quality_report_detects_gaps_and_duplicates() -> None:
    clean = compute_quality(
        _candle_frame(),
        snapshot_id="dss_1",
        max_gap_ratio=0.05,
        max_duplicate_rows=0,
        expected_frequency="1h",
    )
    assert clean.passed is True
    assert clean.gaps == 0

    gapped = compute_quality(
        _candle_frame(with_gap=True),
        snapshot_id="dss_2",
        max_gap_ratio=0.001,
        max_duplicate_rows=0,
        expected_frequency="1h",
    )
    assert gapped.passed is False
    assert "GAP_RATIO_EXCEEDED" in gapped.reason_codes

    duplicated = compute_quality(
        _candle_frame(duplicates=2),
        snapshot_id="dss_3",
        max_gap_ratio=0.05,
        max_duplicate_rows=0,
        expected_frequency="1h",
    )
    assert duplicated.passed is False
    assert "DUPLICATE_ROWS_EXCEEDED" in duplicated.reason_codes


# ---------------------------------------------------------------- snapshots


def test_snapshot_register_reopen_and_crafted_quality_block(tmp_path: Path) -> None:
    activated = DataCatalogService(_activate_candles(tmp_path))
    family = activated.activated_family("binance-perp-1m")
    store = SnapshotStore(tmp_path / "store")

    identity, quality = store.register(
        frame=_candle_frame(),
        family=family,
        lineage=("manifest:accepted", "collector:v1"),
        expected_frequency="1h",
    )
    assert identity.snapshot_id.startswith("dss_")
    assert identity.kind == "candle"
    assert quality.passed is True

    reopened, reopened_quality, frame = store.open(identity.snapshot_id)
    assert reopened.content_hash == identity.content_hash
    assert list(frame.columns) == list(CANDLE_COLUMNS)
    assert reopened_quality.passed is True

    # Crafted submission with a quality violation must not register.
    with pytest.raises(DataCatalogError, match="failed quality"):
        store.register(
            frame=_candle_frame(duplicates=2),
            family=family,
            lineage=("manifest:accepted",),
            expected_frequency="1h",
        )


def test_snapshot_is_immutable_and_repair_creates_a_new_one(tmp_path: Path) -> None:
    activated = DataCatalogService(_activate_candles(tmp_path))
    family = activated.activated_family("binance-perp-1m")
    store = SnapshotStore(tmp_path / "store")

    first, _ = store.register(
        frame=_candle_frame(rows=120),
        family=family,
        lineage=("manifest:accepted", "collector:v1"),
        expected_frequency="1h",
    )
    # Repair (corrected data) registers a NEW digest-addressed snapshot; the
    # original stays immutable and reopenable.
    repaired, _ = store.register(
        frame=_candle_frame(rows=121),
        family=family,
        lineage=("manifest:accepted", "collector:v1", "repair:v2"),
        expected_frequency="1h",
    )
    assert repaired.snapshot_id != first.snapshot_id
    assert store.open(first.snapshot_id)[0].content_hash == first.content_hash
    assert len(store.list()) == 2

    # Tampering the stored frame is detected on reopen.
    frame_path = store.snapshot_path(first.snapshot_id) / "frame.parquet"
    frame_path.write_bytes(b"tampered")
    with pytest.raises(DataCatalogError, match="corrupt"):
        store.open(first.snapshot_id)


def test_query_contract_returns_pagination_and_downsampling_metadata(
    tmp_path: Path,
) -> None:
    activated = DataCatalogService(_activate_candles(tmp_path))
    family = activated.activated_family("binance-perp-1m")
    store = SnapshotStore(tmp_path / "store")
    identity, _ = store.register(
        frame=_candle_frame(rows=480),
        family=family,
        lineage=("manifest:accepted",),
        expected_frequency="1h",
    )

    result = store.query(identity.snapshot_id, max_points=50)
    assert result["original_points"] == 480
    assert result["returned_points"] <= 50
    assert result["downsample_stride"] >= 9
    assert result["content_hash"] == identity.content_hash
    assert result["quality"]["passed"] is True

    ranged = store.query(
        identity.snapshot_id,
        start="2026-01-01T00:00:00+00:00",
        end_exclusive="2026-01-01T12:00:00+00:00",
    )
    assert ranged["original_points"] == 12
    assert ranged["returned_points"] == 12


# -------------------------------------------------------------- endpoints


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_data_endpoints_are_read_only_and_safe() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            catalog = await client.get("/api/v1/data/catalog")
            snapshots = await client.get("/api/v1/data/snapshots")
            missing = await client.get("/api/v1/data/snapshots/dss_missing/quality")
            mutation = await client.post("/api/v1/data/catalog")
    finally:
        app.state.run_manager.shutdown()

    assert catalog.status_code == 200
    payload = catalog.json()
    assert payload["schema_version"] == "data-catalog.v1"
    assert len(payload["families"]) == 11
    assert all("manifest_sha256" in item["release_manifest"] for item in payload["families"])
    assert snapshots.status_code == 200
    assert missing.status_code == 404
    assert mutation.status_code == 405


def test_public_catalog_never_leaks_quality_thresholds_as_secrets() -> None:
    document = _service().public_document()
    encoded = json.dumps(document)
    assert "/srv/" not in encoded
    assert "token=" not in encoded
    assert "password" not in encoded
