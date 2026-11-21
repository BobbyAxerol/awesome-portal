"""E16-R1 producer → P06 boundary, independent malformed-input checks."""

from __future__ import annotations

from copy import deepcopy

import pandas as pd
import pytest

from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchSupervisorError
from portal_api.workers.research_child import _candle_overview, _candle_overview_absence


def _overview(count: int = 48) -> dict:
    start = 1_725_000_000_000
    return {
        "state": "AVAILABLE", "reason_code": None, "scope": "OOS_EQUITY_WINDOW",
        "source_bar_count": count, "emitted_bucket_count": count, "bucket_bars": 1, "sampling": "FULL",
        "envelope": {"max_high": "103", "min_low": "98", "max_high_at_utc_ms": start, "min_low_at_utc_ms": start},
        "values": [{
            "first_ordinal": index, "last_ordinal": index,
            "open_utc_ms": start + index * 60_000, "close_utc_ms": start + index * 60_000,
            "open": "100", "high": "103", "low": "98", "close": "102", "volume": None, "transitions": None,
        } for index in range(count)],
    }


def _evidence(overview: dict) -> dict:
    return {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {"execution_adapter_id": "p04.delta-rsi.v1", "engine_version": "1.1.1",
                   "emitted_equity_points": 1, "source_transform_digest": "a" * 64},
        "direct": {}, "derived": {}, "equity_points": [{}], "unavailable": {}, "candle_overview": overview,
    }


def test_actual_canonical_producer_shape_crosses_the_parent_validator() -> None:
    index = pd.date_range("2026-06-08", periods=168, freq="h", tz="UTC")
    frame = pd.DataFrame({"open": 100.0, "high": 103.0, "low": 98.0, "close": 102.0}, index=index)
    overview = _candle_overview(frame, index, receipt_bytes=0, byte_budget=24 * 1024)
    assert overview["state"] == "AVAILABLE"
    assert 12 < len(overview["values"]) <= 48  # exercises the formerly rejected canonical range
    assert all(row["transitions"] is None for row in overview["values"])
    IsolatedResearchSupervisor._validate_evidence_source(_evidence(overview))


@pytest.mark.parametrize("count", [1, 12, 24, 48])
def test_canonical_bounds_are_accepted(count: int) -> None:
    IsolatedResearchSupervisor._validate_evidence_source(_evidence(_overview(count)))


def test_legacy_receipts_keep_their_original_twelve_bucket_bound_and_position_counts() -> None:
    legacy = _overview(12)
    for key in ("state", "reason_code", "scope"):
        legacy.pop(key)
    for row in legacy["values"]:
        row["transitions"] = 0
    IsolatedResearchSupervisor._validate_evidence_source(_evidence(legacy))
    legacy["values"][0]["transitions"] = None
    with pytest.raises(ResearchSupervisorError, match="markers"):
        IsolatedResearchSupervisor._validate_evidence_source(_evidence(legacy))


def test_typed_absence_is_not_a_failed_child_or_an_available_empty_overview() -> None:
    absence = _candle_overview_absence("P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET")
    IsolatedResearchSupervisor._validate_evidence_source(_evidence(absence))
    absence["state"] = "AVAILABLE"
    with pytest.raises(ResearchSupervisorError):
        IsolatedResearchSupervisor._validate_evidence_source(_evidence(absence))


@pytest.mark.parametrize("path,value", [
    (("scope",), "IS_WINDOW"),
    (("reason_code",), "NOT_RECORDED"),
    (("source_bar_count",), True),
    (("emitted_bucket_count",), True),
    (("bucket_bars",), 2),
    (("sampling",), []),
    (("values", 0, "transitions"), 1),
    (("values", 0, "first_ordinal"), True),
    (("values", 1, "first_ordinal"), 0),
    (("values", 1, "open_utc_ms"), 1_725_000_000_000),
    (("values", 0, "high"), "99"),
    (("values", 0, "high"), "NaN"),
    (("values", 0, "open"), "9" * 97),
    (("envelope", "max_high"), "104"),
    (("envelope", "max_high_at_utc_ms"), 1),
    (("envelope", "min_low_at_utc_ms"), True),
])
def test_canonical_boundary_rejects_malformed_facts(path: tuple, value: object) -> None:
    overview = deepcopy(_overview())
    target = overview
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ResearchSupervisorError):
        IsolatedResearchSupervisor._validate_evidence_source(_evidence(overview))


@pytest.mark.parametrize("canonical,count", [(True, 49), (False, 13)])
def test_neither_contract_can_exceed_its_producer_bound(canonical: bool, count: int) -> None:
    overview = _overview(count)
    if not canonical:
        for key in ("state", "reason_code", "scope"):
            overview.pop(key)
        for row in overview["values"]:
            row["transitions"] = 0
    with pytest.raises(ResearchSupervisorError, match="bounds"):
        IsolatedResearchSupervisor._validate_evidence_source(_evidence(overview))


def test_full_receipt_byte_budget_and_unknown_overview_keys_still_fail_closed() -> None:
    evidence = _evidence(_overview())
    evidence["candle_overview"]["extra"] = "not in the contract"
    with pytest.raises(ResearchSupervisorError, match="shape"):
        IsolatedResearchSupervisor._validate_evidence_source(evidence)
    evidence = _evidence(_overview())
    evidence["direct"]["padding"] = "x" * (28 * 1024)
    with pytest.raises(ResearchSupervisorError, match="budget"):
        IsolatedResearchSupervisor._validate_evidence_source(evidence)
