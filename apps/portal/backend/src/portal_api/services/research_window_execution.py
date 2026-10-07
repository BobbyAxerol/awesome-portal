"""Finite, source-backed window/execution custody. Never called by a GET.

Only completed account observations and actual engine journals enter this
companion. No matcher, PnL reconstruction, broker history or synthetic OCO.
"""
from __future__ import annotations

import hashlib
import json
import math
from enum import Enum
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Iterable

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

SCHEMA = "research.window-execution-source.v1"
TABLE = "window_execution"
TABLE_VERSION = "research.window-execution-table.v1"
MAX_ROWS = 200_000
ROW_SCHEMA = pa.schema([
    pa.field("source_ordinal", pa.int64(), nullable=False),
    pa.field("kind", pa.string(), nullable=False),
    pa.field("window", pa.string(), nullable=False),
    pa.field("fold_id", pa.string()),
    pa.field("at_utc_ms", pa.int64()),
    pa.field("payload_json", pa.string(), nullable=False),
])


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def decimal(value: Any) -> str | None:
    from decimal import Decimal
    if value is None or isinstance(value, bool):
        return None
    parsed = Decimal(str(value))
    if not parsed.is_finite():
        return None  # engine's NaN sentinel is an absence, never zero
    return "0" if parsed == 0 else format(parsed, "f")


def token(value: Any) -> str | None:
    if isinstance(value, Enum):
        value = value.value
    if value is None or isinstance(value, float) and not math.isfinite(value):
        return None
    value = str(value)
    if not value:
        return None
    if len(value) > 160 or any(ord(c) < 32 for c in value):
        raise ValueError("execution source token exceeds the closed DTO bound")
    return value


def utc(value: Any) -> int | None:
    if value is None or pd.isna(value):
        return None
    stamp = pd.Timestamp(value)
    if stamp.tzinfo is None:
        raise ValueError("execution source timestamp must publish its timezone")
    return int(stamp.tz_convert("UTC").value // 1_000_000)


def window_analysis(observations: list[dict[str, Any]], *, window: str, fold_id: str | None,
                    start: int, end: int, bar_ms: int) -> dict[str, Any]:
    """D-AN-01 on the complete retained population, not chart samples."""
    from portal_api.services.research_enrich_analysis import enrich_retained
    normalized = [{**row, "source_ordinal": i} for i, row in enumerate(observations)]
    fold = {"test_start_utc_ms": observations[0]["at_utc_ms"],
            "test_end_utc_ms": observations[-1]["at_utc_ms"]}
    # Existing deterministic analytics operate on retained accounting arrays.
    # The temporary analytical scope is relabeled explicitly below; no engine
    # simulation or objective/selection is recomputed.
    analysis = enrich_retained(run_id="rrun_" + "0" * 32, observations=normalized,
                              folds=[fold], nominal_bar_ms=bar_ms)
    identity = digest({"definition": "FULL_RETAINED_WINDOW_DESCRIPTIVE_V1",
                       "window": window, "fold_id": fold_id, "bounds": [start, end], "rows": normalized})
    metrics = {**analysis["facts"]["metrics"], **analysis["facts"]["behaviour"]}
    def fact(value: str | None, reason: str | None = None):
        return {"state": "AVAILABLE" if value is not None else "NOT_PUBLISHED",
                "reason_code": reason, "value": value, "origin": "PORTAL_DERIVED",
                "scope": window, "input_digest": identity,
                "source_ref": "FULL_RETAINED_WINDOW_ACCOUNT_V1"}
    metrics = {key: {"state": value["state"], "reason_code": value["reason_code"],
                    "value": value["value"], "origin": "PORTAL_DERIVED", "scope": window,
                    "input_digest": identity, "source_ref": "FULL_RETAINED_WINDOW_ACCOUNT_V1"}
               for key, value in metrics.items()}
    metrics["return_fraction"] = fact(analysis["library_summary"]["return_fraction"])
    metrics["max_drawdown_fraction"] = fact(analysis["library_summary"]["max_drawdown_fraction"])
    metrics["trade_count"] = fact(None, "RETAINED_ACCOUNT_NOT_AN_AUDITED_TRADE_LEDGER")
    monthly = {**analysis["monthly_returns"],
               "definition_id": "WINDOW_MONTH_CLOSE_OVER_FIRST_WINDOW_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1",
               "values": [{**row, "basis": "FIRST_WINDOW_CLOSE" if row["basis"] == "FIRST_OOS_CLOSE" else row["basis"]}
                          for row in analysis["monthly_returns"]["values"]]}
    return {"schema_version": "research.window-analytics.v1", "window": window, "fold_id": fold_id,
            "basis": "ALL_TIME", "input_digest": identity, "observation_count": len(observations),
            "start_utc_ms": start, "end_exclusive_utc_ms": end,
            "first_observed_utc_ms": observations[0]["at_utc_ms"],
            "last_observed_utc_ms": observations[-1]["at_utc_ms"],
            "metrics": metrics, "curves": analysis["curves"],
            "monthly_returns": monthly,
            "return_distribution": {key: value for key, value in analysis["return_distribution"].items()
                                    if key not in {"mean", "median", "var_95", "cvar_95"}},
            "drawdown_episodes": {**analysis["drawdown_episodes"], "values": [
                {key: value for key, value in row.items() if key != "regime"}
                for row in analysis["drawdown_episodes"]["values"]]}}


def execution_records(*, result: Any, route: str, market: pd.DataFrame, symbol: str) -> list[dict[str, Any]]:
    """Closed projection of public result records and named audit reports.

    Source ordinals belong to each source relation, NOT a global causal clock.
    Milliseconds retain bar-time semantics; intrabar sequence remains separate.
    """
    records: list[dict[str, Any]] = []
    fields = ("order_id", "target_order_id", "parent_order_id", "group_id", "oco_group_id", "trade_id",
              "symbol", "side", "order_type", "tif", "activation_policy", "tag", "action", "status",
              "event_name", "reason_code", "exit_reason", "liquidity", "campaign_id", "cycle_id", "level_id", "reject_code",
              "lifecycle_event_kind", "lifecycle_order_status")
    numbers = ("qty", "price", "trigger_price", "fee", "remaining_qty", "filled_qty", "stop_price",
               "take_profit_price", "avg_entry", "avg_exit", "realized_pnl", "fees", "working_qty", "working_price",
               "working_trigger_price", "fill_qty", "fill_price", "fill_fee")
    times = ("timestamp", "activated_at", "cancelled_at", "filled_at", "expires_at", "opened_at", "closed_at")
    def emit(kind: str, relation: str, values: Iterable[Any]):
        for ordinal, value in enumerate(values):
            raw = value if isinstance(value, dict) else asdict(value) if is_dataclass(value) else vars(value)
            metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
            payload: dict[str, Any] = {"record_kind": kind, "source_relation": relation,
                                      "source_ordinal": ordinal, "execution_route": route}
            for key in fields:
                payload[key] = token(raw.get(key, metadata.get(key)))
            for key in numbers:
                payload[key] = decimal(raw.get(key, metadata.get(key)))
            for key in times:
                payload[key + "_utc_ms"] = utc(raw.get(key, metadata.get(key)))
            # Intrabar source reports signed side, actual fill sequence/reason,
            # not a fabricated order ID/SL/TP order tree.
            if relation in {"result.fills", "metadata.fills_report"} and route == "intrabar_bracket":
                payload["side"] = "BUY" if raw["side"] == 1 else "SELL" if raw["side"] == -1 else None
                payload["exit_reason"] = token(raw.get("reason"))
            payload["bar_index"] = int(raw["bar_index"]) if raw.get("bar_index") is not None else None
            payload["source_sequence"] = int(raw["sequence"]) if raw.get("sequence") is not None else None
            for key in ("reduce_only", "active", "waiting_parent"):
                payload[key] = raw.get(key) if isinstance(raw.get(key), bool) else None
            payload["missing_fields"] = {key: "SOURCE_FIELD_NOT_PUBLISHED" for key, value in payload.items()
                                          if value is None}
            at = payload["timestamp_utc_ms"] if payload["timestamp_utc_ms"] is not None else payload["closed_at_utc_ms"]
            if at is None and raw.get("bar") is not None:
                bar = int(raw["bar"])
                if not 0 <= bar < len(market):
                    raise ValueError("native lifecycle bar exceeds its actual source tape")
                at = int(market.index[bar].value // 1_000_000)
                payload["bar_index"] = bar
                payload["timestamp_utc_ms"] = at
                payload["missing_fields"].pop("timestamp_utc_ms", None)
            # This is source bar time, not an invented sub-bar wall clock.
            if raw.get("fill_bar") is not None and not pd.isna(raw["fill_bar"]):
                bar = int(raw["fill_bar"])
                if bar >= len(market):
                    raise ValueError("native fill bar exceeds the source tape")
                if bar >= 0:  # engine sentinel -1 means not filled, not a time
                    payload["filled_at_utc_ms"] = int(market.index[bar].value // 1_000_000)
                    payload["missing_fields"].pop("filled_at_utc_ms", None)
            if at is None:
                raise ValueError("native execution record has no actual timestamp or source bar")
            if kind == "FILL":
                # Named aliases of the actual fill row, not matching/PnL or a
                # sub-bar wall clock invented by Portal. The raw price/qty/
                # fee remain available and provenance names the same relation.
                for destination, original in (("fill_price", "price"), ("fill_qty", "qty"), ("fill_fee", "fee")):
                    if payload[destination] is None and payload[original] is not None:
                        payload[destination] = payload[original]
                        payload["missing_fields"].pop(destination, None)
                if payload["filled_at_utc_ms"] is None:
                    payload["filled_at_utc_ms"] = at
                    payload["missing_fields"].pop("filled_at_utc_ms", None)
            records.append({"kind": "EXECUTION", "at_utc_ms": at, "payload": payload})
    for kind, relation in (("ORDER", "orders"), ("FILL", "fills"), ("TRADE", "trades")):
        emit(kind, f"result.{relation}", getattr(result, relation, ()) or ())
    metadata = getattr(result, "metadata", {}) or {}
    # Intrabar facade keeps its exact sparse fills in the audit DataFrame;
    # generic BacktestResultV2.fills may be empty. Avoid duplicate fill counts
    # on native-event routes that publish both representations.
    if not getattr(result, "fills", ()) and isinstance(metadata.get("fills_report"), pd.DataFrame):
        emit("FILL", "metadata.fills_report", metadata["fills_report"].to_dict("records"))
    for key, kind in (("command_report", "COMMAND"), ("order_report", "ORDER_REPORT"),
                      ("lifecycle_event_report_v1", "LIFECYCLE")):
        frame = metadata.get(key)
        if isinstance(frame, pd.DataFrame):
            emit(kind, f"metadata.{key}", frame.to_dict("records"))
    return records


def package(windows: list[dict[str, Any]], records: list[dict[str, Any]], *, protocol: str,
            execution_route: str, execution_availability=None) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = [{**row, "source_ordinal": ordinal} for ordinal, row in enumerate(records)]
    if len(rows) > MAX_ROWS or len(windows) > 33:
        raise ValueError("window execution exceeds bounded custody")
    for row in rows:
        if len(canonical(row)) > 65_536:
            raise ValueError("window execution row exceeds bounded custody")
    counts = {key: sum(row["kind"] == key for row in rows) for key in ("OBSERVATION", "ANALYTICS", "EXECUTION")}
    source = {"schema_version": SCHEMA, "protocol": protocol, "execution_route": execution_route,
              "row_count": len(rows), "rows_digest": digest(rows), "counts": counts, "windows": windows,
              "authority": "COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY"}
    if execution_availability is not None:
        source["execution_availability"] = execution_availability
    return source, rows


def storage_batch(rows: list[dict[str, Any]]) -> pa.RecordBatch:
    return pa.RecordBatch.from_pylist([{**row, "payload_json": canonical(row["payload"]).decode()}
                                     for row in rows], schema=ROW_SCHEMA)


def observation_payload(row: dict[str, Any], candle: dict[str, Any] | None = None) -> dict[str, Any]:
    bar = row.get("bar")
    if bar is None and isinstance(row.get("bar_json"), str):
        bar = json.loads(row["bar_json"])
    bar = bar or {}
    return {**{key: row[key] for key in ("equity", "return_fraction", "drawdown_fraction", "accepted_position")},
            "signal_target": row.get("signal_target"), "candle": candle or bar.get("candle"),
            **{key: bar.get(key) for key in ("fee", "funding", "turnover")},
            "active_stop": row.get("active_stop"), "active_take_profit": row.get("active_take_profit")}


def completed_window(*, observations: list[dict[str, Any]], window: str, fold_id: str | None,
                     start: int, end: int, bar_ms: int, authority: str):
    if len(observations) < 2 or any(not start <= row["at_utc_ms"] < end for row in observations):
        raise ValueError("completed window requires full exact half-open source observations")
    records = [{"kind": "OBSERVATION", "window": window, "fold_id": fold_id,
                "at_utc_ms": row["at_utc_ms"], "payload": observation_payload(row)} for row in observations]
    normalized = [{**row, "bar": {"candle": records[i]["payload"]["candle"],
                                  **{key: records[i]["payload"][key] for key in ("fee", "funding", "turnover")}}}
                  for i, row in enumerate(observations)]
    records.append({"kind": "ANALYTICS", "window": window, "fold_id": fold_id, "at_utc_ms": None,
                    "payload": window_analysis(normalized, window=window, fold_id=fold_id, start=start, end=end, bar_ms=bar_ms)})
    descriptor = {"window": window, "fold_id": fold_id, "availability": {"state": "AVAILABLE", "reason_code": None},
                  "start_utc_ms": start, "end_exclusive_utc_ms": end, "observation_count": len(observations), "authority": authority}
    return descriptor, records


def absent_window(window: str, reason: str, *, fold_id: str | None = None, not_applicable: bool = False):
    return {"window": window, "fold_id": fold_id,
            "availability": {"state": "NOT_APPLICABLE" if not_applicable else "NOT_PUBLISHED", "reason_code": reason},
            "start_utc_ms": None, "end_exclusive_utc_ms": None, "observation_count": None,
            "authority": "NO_INDEPENDENT_HOLDOUT" if not_applicable else "FOLD_TRAINING_ACCOUNT"}


def capture_current_windows(*, observations: list[dict[str, Any]], folds: list[dict[str, Any]],
                            windows: dict[str, Any], three_rows: list[dict[str, Any]] | None,
                            raw_dir: Path, route: str, bar_ms: int, full_sample: bool = False):
    descriptors, records = [], []
    if three_rows is not None:
        # These files were emitted by the engine after selected parameters froze.
        # Preserve each window's account baseline and complete observations.
        for role, key, file_key in (("IS", "is", "is"), ("OOS", "oos", "oos"), ("HOLDOUT", "holdout", "holdout_live")):
            frame = pd.read_parquet(raw_dir / "series" / f"{file_key}.parquet")
            subset = [dict(row) for row in three_rows if row["window_role"] == role]
            for row in subset:
                at = pd.Timestamp(row["at_utc_ms"], unit="ms", tz="UTC")
                source = frame.loc[at]
                row["bar"] = {"candle": {k: decimal(source[k]) for k in ("open", "high", "low", "close", "volume")}
                              if {"open", "high", "low", "close"}.issubset(frame.columns) else None}
            bound = windows[key]
            descriptor, rows = completed_window(observations=subset, window=role, fold_id=None,
                start=bound["start_ms"], end=bound["end_ms"], bar_ms=bar_ms, authority="FROZEN_PARAMETER_POST_SELECTION_ACCOUNT")
            descriptors.append(descriptor)
            records.extend(rows)
        protocol = "three_window_decay"
    else:
        role = "FULL_SAMPLE" if full_sample else "OOS"
        bound = windows.get("oos", {})
        # A stitched source tape may include flat training/padding bars before
        # the first OOS fold. Those are real observations but NOT OOS data.
        # Scope by source-published half-open boundaries; do not relabel the
        # full raw account or shift the engine's actual fold boundaries.
        start = observations[0]["at_utc_ms"] if full_sample else bound.get("start_ms",
            min(f["test_start_utc_ms"] for f in folds))
        end = observations[-1]["at_utc_ms"] + bar_ms if full_sample else bound.get("end_ms",
            max(f["test_end_utc_ms"] for f in folds) + bar_ms)
        scoped = [row for row in observations if start <= row["at_utc_ms"] < end]
        descriptor, rows = completed_window(observations=scoped, window=role, fold_id=None,
            start=start, end=end, bar_ms=bar_ms,
            authority="RETAINED_OOS_ACCOUNT")
        descriptors.append(descriptor)
        records.extend(rows)
        # Engine fold summaries alone are NOT training account observations.
        # Consumers keep the already-published independent IS scalar facts.
        disclosure_path = raw_dir / "series" / "training-disclosure.v1.json"
        training_absences = json.loads(disclosure_path.read_text())["absences"] if disclosure_path.is_file() else {}
        for fold in folds:
            path = raw_dir / "series" / f"training-{fold['fold_id']}.parquet"
            if path.is_file():
                frame = pd.read_parquet(path)
                training = frame_observations(frame)
                d, r = completed_window(observations=training, window="IS", fold_id=fold["fold_id"],
                    start=training[0]["at_utc_ms"], end=training[-1]["at_utc_ms"] + bar_ms, bar_ms=bar_ms,
                    authority="FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC")
                descriptors.append(d); records.extend(r)
            else:
                descriptors.append(absent_window("IS", "FULL_SAMPLE_HAS_NO_SEPARATE_TRAINING_WINDOW" if full_sample else
                    training_absences.get(fold["fold_id"], "ENGINE_FOLD_TRAINING_ACCOUNT_NOT_RETAINED"), fold_id=fold["fold_id"],not_applicable=full_sample))
        descriptors.append(absent_window("HOLDOUT", "FULL_SAMPLE_HAS_NO_INDEPENDENT_HOLDOUT" if full_sample else
            "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT", not_applicable=True))
        protocol = "full_sample" if full_sample else "advanced_walk_forward"
    return package(descriptors, records, protocol=protocol, execution_route=route)


def capture_native_windows(*, result: Any, market: pd.DataFrame, route: str, symbol: str,
                           source_windows: dict[str, Any], output_directory: Path):
    descriptors, records = [], []
    for role, key in (("IS", "is"), ("OOS", "oos")):
        bounds = source_windows[key]
        start, end = bounds["start_ms"], bounds["end_ms"]
        indexes = result.equity.index[(result.equity.index >= pd.Timestamp(start, unit="ms", tz="UTC"))
                                    & (result.equity.index < pd.Timestamp(end, unit="ms", tz="UTC"))]
        rows = []
        positions = result.positions
        if len(positions.columns) != 1:
            raise ValueError("native Delta custody requires the actual single-symbol position series")
        peak = float(result.equity.loc[indexes].iloc[0])
        for at in indexes:
            capital = float(result.equity.loc[at])
            peak = max(peak, capital)
            row = {"at_utc_ms": int(at.value // 1_000_000), "equity": decimal(capital),
                   "return_fraction": decimal(result.returns.loc[at]), "drawdown_fraction": decimal(capital / peak - 1),
                   "accepted_position": decimal(positions.loc[at].iloc[0]), "signal_target": None,
                   "bar": {"candle": {k: decimal(market.loc[at, k]) for k in ("open", "high", "low", "close", "volume")}}}
            for field in ("fees", "funding"):
                values = getattr(result, field, None)
                row["bar"]["fee" if field == "fees" else field] = decimal(values.loc[at]) if isinstance(values, pd.Series) else None
            diagnostics = getattr(result, "diagnostics", None)
            if isinstance(diagnostics, pd.DataFrame) and at in diagnostics.index:
                for key in ("active_stop", "active_take_profit"):
                    row[key] = decimal(diagnostics.loc[at, key]) if key in diagnostics.columns else None
            rows.append(row)
        descriptor, window_rows = completed_window(observations=rows, window=role, fold_id=None, start=start, end=end,
                                                   bar_ms=3_600_000, authority="RETAINED_NATIVE_ACCOUNT")
        descriptors.append(descriptor)
        records.extend(window_rows)
    descriptors.append(absent_window("HOLDOUT", "FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT"))
    for record in execution_records(result=result, route=route, market=market, symbol=symbol):
        at = record["at_utc_ms"]
        role = next((d["window"] for d in descriptors if d["start_utc_ms"] is not None
                     and d["start_utc_ms"] <= at < d["end_exclusive_utc_ms"]), None)
        if role is not None:  # warmup events are not relabeled to IS/OOS
            records.append({**record, "window": role, "fold_id": None})
    metadata = getattr(result, "metadata", {}) or {}
    published = {
        "ORDER": bool(getattr(result, "orders", ())),
        "FILL": bool(getattr(result, "fills", ())) or isinstance(metadata.get("fills_report"), pd.DataFrame),
        "TRADE": bool(getattr(result, "trades", ())),
        **{kind: isinstance(metadata.get(key), pd.DataFrame) for kind, key in
           (("COMMAND", "command_report"), ("ORDER_REPORT", "order_report"), ("LIFECYCLE", "lifecycle_event_report_v1"))},
    }
    journal = {kind: {"state": "AVAILABLE" if present else "NOT_PUBLISHED",
                      "reason_code": None if present else "ENGINE_EXECUTION_RELATION_NOT_PUBLISHED"}
               for kind, present in published.items()}
    source, rows = package(descriptors, records, protocol="three_window_decay", execution_route=route,
                           execution_availability=journal)
    output_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_batches([storage_batch(rows)]), output_directory / "window-execution.parquet")
    return source


def read_rows(path: Path) -> list[dict[str, Any]]:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 128 * 1024 * 1024:
        raise ValueError("window execution custody needs a regular source file")
    rows = []
    for batch in pq.ParquetFile(path).iter_batches(batch_size=200):
        for raw in batch.to_pylist():
            rows.append({key: value for key, value in raw.items() if key != "payload_json"}
                        | {"payload": json.loads(raw["payload_json"])})
            if len(rows) > MAX_ROWS:
                raise ValueError("window execution source exceeds its row bound")
    return rows


def verify_source(source: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    if source.get("schema_version") != SCHEMA or source.get("row_count") != len(rows) or source.get("rows_digest") != digest(rows) \
            or any(row["source_ordinal"] != i for i, row in enumerate(rows)):
        raise ValueError("window execution exact normalized source custody mismatch")


def retain_companion(*, root: Path, artifact_manifest: dict[str, Any], manifest_digest: str,
                     binding: dict[str, Any], identity: dict[str, Any], post, fence_validator, fence):
    document = root / "documents" / "window_execution_source.json"
    if not document.exists():
        return  # old immutable seals retain a precise NOT_RECORDED state
    source = json.loads(document.read_text())
    expected = next((d for d in artifact_manifest["documents"] if d["name"] == "window_execution_source"), None)
    if expected is None or hashlib.sha256(document.read_bytes()).hexdigest() != expected["sha256"]:
        raise ValueError("window execution source document does not match P05")
    table = next((t for t in artifact_manifest["tables"] if t["table_kind"] == TABLE), None)
    if table is None or table["schema_version"] != TABLE_VERSION:
        raise ValueError("window execution retained table is missing")
    rows = []
    for part in table["parts"]:
        path = root / part["relative_path"]
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != part["sha256"]:
            raise ValueError("window execution retained source part changed")
        rows.extend(read_rows(path))
    verify_source(source, rows)
    manifest = {"schema_version": "research.window-execution-manifest.v1", **binding, "source": source}
    common = {**{key: identity[key] for key in ("workspace_id", "run_id", "job_id", "worker_attempt_id", "lease_epoch")},
              "manifest": manifest, "companion_digest": digest(manifest),
              "artifact_manifest_json": (root / "manifest.json").read_text(), "source_document_json": document.read_text()}
    def send(operation, body):
        if not fence_validator(fence) or len(canonical(body)) > 1_000_000:
            raise ValueError("window execution ingress lost its fence or exceeded wire budget")
        return post(operation, body)
    start = batch_ordinal = 0
    while start < len(rows):
        stop = min(start + 200, len(rows))
        while stop > start:
            batch = rows[start:stop]
            body = {**common, "schema_version": "research.window-execution-batch.v1",
                    "batch_ordinal": batch_ordinal, "start_ordinal": start, "batch_digest": digest(batch), "rows": batch}
            if len(canonical(body)) <= 1_000_000:
                break
            stop -= 1
        if stop == start:
            raise ValueError("window execution single row exceeds ingress budget")
        ack = send("window-execution/batches", body)
        if ack.get("state") not in {"ACCEPTED", "REPLAYED"} or ack.get("row_count") != len(batch):
            raise ValueError("window execution batch acknowledgement mismatch")
        start, batch_ordinal = stop, batch_ordinal + 1
    ack = send("window-execution/seal", {**common, "schema_version": "research.window-execution-seal.v1"})
    if ack.get("state") not in {"SEALED", "REPLAYED"} or ack.get("companion_digest") != common["companion_digest"]:
        raise ValueError("window execution seal acknowledgement mismatch")


def frame_observations(frame: pd.DataFrame) -> list[dict[str, Any]]:
    """Actual source frames only; never estimate accounting from prices/signals."""
    return [{"at_utc_ms": int(at.value // 1_000_000), "equity": decimal(row["equity"]),
             "return_fraction": decimal(row["returns"]), "drawdown_fraction": decimal(row["drawdown"]),
             "accepted_position": decimal(row["accepted_position"]), "signal_target": decimal(row["signal_target"]),
             "bar": {"candle": {k: decimal(row[k]) for k in ("open", "high", "low", "close", "volume")}}}
            for at, row in frame.iterrows()]
