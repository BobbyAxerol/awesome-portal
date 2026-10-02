"""Source-only observed-date custody; does not qualify a P08/P10 profile."""
from __future__ import annotations

import copy
import hashlib
import sys
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.adapters.market_data import VnStockDailyQualificationProvider
from portal_api.services.enrich_dataset_catalog import (
    DatasetIndexError, DatasetIndexStore, bar_summary, build_bar_index, canonical,
    declaration_estimate, merge_index_documents, validate_document, window_metadata,
)

DAY = 86_400_000


def local_ms(date: str) -> int:
    return int(pd.Timestamp(date, tz="Asia/Ho_Chi_Minh").value // 1_000_000)


class Loader:
    """Synthetic observed labels, not an exchange calendar authority."""
    def load(self, symbol, *, start_date, end_date, check_val):
        assert symbol == "FPT" and check_val is True
        labels = pd.bdate_range(pd.Timestamp(start_date), pd.Timestamp(end_date))
        return pd.DataFrame({"time": labels, "symbol": symbol, "open": 100.,
            "high": 102., "low": 99., "close": 101., "volume": 1000.})


def observed_index():
    return build_bar_index(VnStockDailyQualificationProvider(loader_factory=Loader),
        dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
        start_ms=local_ms("2026-07-30"), end_ms=local_ms("2026-08-05"),
        as_of_ms=local_ms("2026-08-05"))


def observed_document():
    return {"schema_version": "research.dataset-index.v2", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": local_ms("2026-08-05"), "entries": [{"dataset_id": "vn-stock-daily",
            "symbol": "FPT", "index": observed_index()}]}


def legacy_document():
    end = local_ms("2026-08-05")
    return {"schema_version": "research.dataset-index.v1", "source_manifest_digest": "a" * 64,
        "as_of_utc_ms": local_ms("2026-08-05"), "entries": [{"dataset_id": "crypto-binance-1m",
            "symbol": "BTCUSDT", "index": {"timeframe": "1h", "resolution_ms": 3600000,
                "start_utc_ms": end - DAY, "end_exclusive_utc_ms": end,
                "as_of_utc_ms": local_ms("2026-08-05"), "duplicate_bar_count": 0,
                "runs": [[end - DAY, end - 3600000]]}}]}


def test_new_clock_requires_v2_without_relabelling_historical_index():
    doc = observed_document()
    assert validate_document(doc) is doc
    with pytest.raises(DatasetIndexError, match="OBSERVED_DATE_REQUIRES_V2"):
        validate_document({**doc, "schema_version": "research.dataset-index.v1"})
    with pytest.raises(DatasetIndexError):
        validate_document({**doc, "entries": [{**doc["entries"][0], "dataset_id": "crypto-binance-1m"}]})
    shifted = copy.deepcopy(doc)
    shifted["entries"][0]["index"]["as_of_utc_ms"] += DAY
    with pytest.raises(DatasetIndexError):
        validate_document(shifted)


def test_immutable_mixed_revision_preserves_old_namespace_bytes_and_rollback_pointer(tmp_path):
    old = legacy_document()
    original = canonical(old)
    store = DatasetIndexStore(tmp_path)
    old_hash = store.publish(old)
    mixed = merge_index_documents(old, observed_document())
    assert mixed["schema_version"] == "research.dataset-index.v2"
    assert canonical(next(row for row in mixed["entries"] if row["dataset_id"] == "crypto-binance-1m")) == canonical(old["entries"][0])
    new_hash = store.publish(mixed)
    assert new_hash != old_hash
    assert (tmp_path / f"{old_hash}.json").read_bytes() == original
    assert store.read("a" * 64)[1] == mixed
    assert store.read("b" * 64)[1:] == (None, "HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED")
    # Re-publish the existing immutable V1 revision for an old-reader rollback.
    assert store.publish(old) == old_hash
    assert store.read("a" * 64)[1] == old
    assert hashlib.sha256((tmp_path / f"{new_hash}.json").read_bytes()).hexdigest() == new_hash
    # A subsequent UTC append must never downgrade away the VN discriminator.
    assert merge_index_documents(mixed, old)["schema_version"] == "research.dataset-index.v2"
    with pytest.raises(DatasetIndexError, match="SOURCE_CLOCK_MISMATCH"):
        merge_index_documents(old, {**observed_document(), "source_manifest_digest": "b" * 64})


def test_metadata_dispatch_counts_observed_warmup_across_weekend_without_close_or_gap_claim():
    doc = observed_document()
    summary = bar_summary(doc["entries"][0]["index"])
    assert summary["bar_count"] == 4
    for key in ("expected_bar_count", "missing_ratio", "gap_count", "largest_gap_seconds", "last_closed_bar_end_utc_ms"):
        assert summary[key] is None
    facts = window_metadata(doc, dataset_id="vn-stock-daily", symbol="FPT", timeframe="1d",
        start_ms=local_ms("2026-08-03"), end_ms=local_ms("2026-08-05"), warmup_bars=2)
    assert facts["availability"] == "AVAILABLE" and facts["bars"] == 2
    assert facts["warmup_bars_available_before_start"] == 2
    assert facts["warmup_start_utc_ms"] == local_ms("2026-07-30")
    assert facts["verified_range"]["basis"] == "INDEXED_OBSERVED_LOCAL_DATE_RANGE_V1"
    with pytest.raises(DatasetIndexError):
        window_metadata(doc, dataset_id="vn-stock-daily", symbol="FPT", timeframe="1h",
            start_ms=local_ms("2026-08-03"), end_ms=local_ms("2026-08-05"), warmup_bars=2)


def test_observed_index_does_not_claim_execution_admission_or_fake_fold_plan():
    requested = {"schema_version": "research.requested-spec.v1", "protocol": "three_window_decay",
        "data": {"dataset_id": "vn-stock-daily", "symbol": "FPT", "timeframe": "1d"},
        "windows": {key: {"start": "2026-08-03T00:00:00+07:00", "end_exclusive": "2026-08-05T00:00:00+07:00"}
            for key in ("is", "oos", "holdout")}}
    estimate = declaration_estimate(observed_document(), requested, warmup_bars=300, engine_catalog=None)
    assert estimate["planned_folds"]["availability"] == "NOT_PUBLISHED"
    assert estimate["planned_folds"]["reason_code"] == "VN_DAILY_PORTAL_EXECUTION_NOT_QUALIFIED"
    assert len(estimate["windows"]) == 3 and estimate["earliest_start_utc_ms"] is None
    assert estimate["windows"][0]["availability"] == "NOT_PUBLISHED"
    assert estimate["windows"][1]["bars"] == 2
    assert "clock_basis" not in estimate["windows"][0]


@pytest.mark.parametrize("selection", ["no-private-root", "existing-pointer", "symlink-root"])
def test_qualification_apply_refuses_default_clobber_or_redirect_before_source_io(tmp_path, monkeypatch, selection):
    from portal_api.services import enrich_dataset_catalog as module
    provider = SimpleNamespace(_runtime=SimpleNamespace(manifest_digest="a" * 64))
    monkeypatch.setattr(module, "VnStockDailyQualificationProvider", lambda: provider)
    args = ["index", "--dataset-id", "vn-stock-daily", "--source-only-qualification", "--apply",
        "--symbol", "FPT", "--timeframe", "1d", "--start", "2026-07-30T00:00:00+07:00",
        "--end-exclusive", "2026-08-05T00:00:00+07:00"]
    if selection == "existing-pointer":
        # Existing immutable current revision must not be silently replaced.
        (tmp_path / "current").write_text("a" * 64)
        args += ["--qualification-root", str(tmp_path)]
    elif selection == "symlink-root":
        link = tmp_path / "link"
        link.symlink_to(tmp_path, target_is_directory=True)
        args += ["--qualification-root", str(link)]
    monkeypatch.setattr(sys, "argv", args)
    with pytest.raises(DatasetIndexError):
        module.main()
    assert not hasattr(provider, "load")


@pytest.mark.parametrize("boundary", ["--start", "--end-exclusive"])
def test_qualification_cli_refuses_sub_millisecond_boundary_without_repair(monkeypatch, boundary):
    from portal_api.services import enrich_dataset_catalog as module
    provider = SimpleNamespace(_runtime=SimpleNamespace(manifest_digest="a" * 64))
    monkeypatch.setattr(module, "VnStockDailyQualificationProvider", lambda: provider)
    args = ["index", "--dataset-id", "vn-stock-daily", "--source-only-qualification",
        "--symbol", "FPT", "--timeframe", "1d", "--start", "2026-07-30T00:00:00+07:00",
        "--end-exclusive", "2026-08-05T00:00:00+07:00"]
    args[args.index(boundary) + 1] = "2026-08-01T17:00:00.000000001Z"
    monkeypatch.setattr(sys, "argv", args)
    with pytest.raises(DatasetIndexError, match="DATASET_WINDOW_NOT_BAR_ALIGNED"):
        module.main()
    assert not hasattr(provider, "load")
