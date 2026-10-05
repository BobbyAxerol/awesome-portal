"""S02 editable index-only hints. No OHLCV, engine evaluation or input writes.

Splits use actual bar rank, not a fabricated market calendar. Fold construction
stays in the existing declaration estimator/P08 planner after applying the hint.
"""
from __future__ import annotations

from portal_api.services.enrich_dataset_catalog import (
    earliest_start_with_warmup, timeframe_ms, window_metadata,
)


def window_suggestion(document: dict | None, revision: str | None, request: dict) -> dict:
    dataset, symbol, timeframe = (request[key] for key in ("dataset_id", "symbol", "timeframe"))
    warmup = request["warmup_bars"]
    explicit = "start_utc_ms" in request
    result = {"schema_version": "research.window-suggestion-metadata.v1",
        "state": "NOT_PUBLISHED", "reason_code": "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
        "dataset_id": dataset, "symbol": symbol, "timeframe": timeframe,
        "catalog_revision": revision, "as_of_utc_ms": document["as_of_utc_ms"] if document else None,
        "source_timezone": "Asia/Ho_Chi_Minh" if dataset == "vn-stock-daily" else "UTC",
        "warmup_bars": warmup, "range_origin": "EXPLICIT_UNCHANGED" if explicit else "PROFILE_BOUNDED_AUTOMATIC",
        "patch": None}
    def refused(reason):
        return {**result, "reason_code": reason}
    if document is None:
        return result
    if revision != request["expected_catalog_revision"]:
        return refused("HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED")
    index = next((row["index"] for row in document["entries"] if
        (row["dataset_id"], row["symbol"], row["index"]["timeframe"]) == (dataset, symbol, timeframe)), None)
    if index is None or not index["runs"]:
        return result
    step = timeframe_ms(timeframe)
    observed = index.get("clock_basis") == "OBSERVED_SOURCE_LOCAL_DATE_V1"
    offset = 7 * 3_600_000 if observed else 0
    earliest = earliest_start_with_warmup(index, warmup, step)
    if earliest is None:
        return refused("INSUFFICIENT_INDEXED_WARMUP")
    max_days = request["max_span_days"]
    if explicit:
        left, right = request["start_utc_ms"], request["end_exclusive_utc_ms"]
        if (left + offset) % step or (right + offset) % step:
            return refused("WINDOW_BOUND_NOT_ALIGNED")
    else:
        right = index["runs"][-1][1] + step
        # A bounded UI starting suggestion, not a new execution limit/default.
        days = min(max_days, 60) if max_days else 60
        left = max(earliest, right - days * 86_400_000)
        left = ((left + offset + step - 1) // step) * step - offset
        # Use a real target bar with sufficient actual predecessors. For UTC
        # bars warmup must be contiguous; for observed dates it is last-N bars.
        candidate = next((max(first + (0 if observed else warmup * step), left)
            for first, last in index["runs"]
            if max(first + (0 if observed else warmup * step), left) <= last), None)
        if candidate is None:
            return refused("INSUFFICIENT_INDEXED_WARMUP")
        left = candidate
    if left >= right or max_days and right - left > max_days * 86_400_000:
        return refused("PROFILE_RANGE_EXCEEDS_LIMIT")
    metadata = window_metadata(document, dataset_id=dataset, symbol=symbol, timeframe=timeframe,
        start_ms=left, end_ms=right, warmup_bars=warmup)
    if metadata["availability"] != "AVAILABLE":
        return refused(metadata["reason_code"])
    if metadata["warmup_bars_available_before_start"] < warmup:
        return refused("INSUFFICIENT_INDEXED_WARMUP")
    # Rank/select compressed observed runs. Cost is O(index runs), not O(bars).
    runs = [(max(first, left), min(last, right - step)) for first, last in index["runs"]
        if max(first, left) <= min(last, right - step)]
    total = sum((last - first) // step + 1 for first, last in runs)
    if total > 100_000:
        return refused("DECLARATION_TIMESTAMP_PLAN_BUDGET_EXCEEDED")
    if total < 3:
        return refused("WINDOW_SUGGESTION_INSUFFICIENT_BARS")
    def stamp(rank):
        for first, last in runs:
            length = (last - first) // step + 1
            if rank < length:
                return first + rank * step
            rank -= length
        raise ValueError("bar ordinal outside verified range")
    def span(start, end, bars):
        return {"start_utc_ms": start, "end_exclusive_utc_ms": end, "bars": bars}
    if request["protocol"] == "three_window_decay":
        is_count = min(total - 2, max(1, total * 70 // 100))
        oos_end = min(total - 1, max(is_count + 1, total * 90 // 100))
        b, c = stamp(is_count), stamp(oos_end)
        patch = {"protocol": "three_window_decay", "windows": {
            "is": span(left, b, is_count), "oos": span(b, c, oos_end - is_count),
            "holdout": span(c, right, total - oos_end)}}
    else:
        train = request.get("initial_train_bars", total // 2)
        if not 1 <= train < total:
            return refused("INITIAL_TRAIN_LEAVES_NO_OOS_BARS")
        patch = {"protocol": "advanced", "walk_forward": {
            **span(left, right, total), "first_oos_utc_ms": stamp(train),
            "frequency": request.get("frequency", "weekly"), "window_mode": request.get("window_mode", "expanding"),
            "train_window": request.get("train_window")}}
    return {**result, "state": "AVAILABLE", "reason_code": None, "patch": patch}
