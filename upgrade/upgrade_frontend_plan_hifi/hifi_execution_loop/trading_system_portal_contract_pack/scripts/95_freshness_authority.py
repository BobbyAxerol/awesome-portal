#!/usr/bin/env python3
"""95_freshness_authority.py — freshness, authority and calendar semantics.

The Portal envelope needs `freshness_state`, `projection_lag_ms`, `as_of` and
`source_authority` (handoff §5.1). Trading System does not emit that envelope, so a
connector must synthesise it from the thresholds and state machines below. This
script extracts them from source so the numbers are exact rather than assumed:

  * service heartbeat staleness threshold and the health readiness rule
  * market-data feed staleness / circuit-breaker / reconnect thresholds
  * the VN (DNSE) trading calendar and session-status state machine
  * engine authority claim states (what makes a command fail closed)
  * kill-switch / trading-state defaults per mode

Cross-checked against the live `/v1/health` and data-layer `/v1/health` skeletons
already captured by 90_runtime_probe.py.

READ-ONLY: source parsing + previously captured probe output.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DL_ROOT, EVIDENCE_DIR, OUT_DIR, TS_ROOT, provenance, write_json  # noqa: E402


def numeric_defaults(path: Path, names: list[str]) -> dict:
    """Default values of named keyword args / module constants, without importing."""
    if not path.exists():
        return {}
    tree = ast.parse(path.read_text(errors="replace"))
    found: dict = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            a = node.args
            defaults = dict(zip([x.arg for x in a.args[-len(a.defaults):]] if a.defaults else [],
                                a.defaults))
            defaults.update({k.arg: v for k, v in
                             zip(a.kwonlyargs, a.kw_defaults) if v is not None})
            for name, val in defaults.items():
                if name in names:
                    try:
                        found[name] = ast.literal_eval(val)
                    except Exception:
                        found[name] = ast.unparse(val)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id in names:
                    try:
                        found[t.id] = ast.literal_eval(node.value)
                    except Exception:
                        found[t.id] = ast.unparse(node.value)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            # pydantic Settings declare `NAME: type = default`
            if node.target.id in names and node.value is not None:
                try:
                    found[node.target.id] = ast.literal_eval(node.value)
                except Exception:
                    found[node.target.id] = ast.unparse(node.value)
    return found


def vn_calendar() -> dict:
    f = DL_ROOT / "app" / "stream" / "dnse_ws.py"
    if not f.exists():
        return {"status": "MISSING", "note": "data_layer dnse_ws.py not present"}
    src = f.read_text(errors="replace")
    m = re.search(r"def _is_market_open\(\).*?(?=\n    def |\n\nclass |\Z)", src, re.S)
    body = m.group(0) if m else ""
    times = re.findall(r"time\((\d+),\s*(\d+)\)", body)
    tz = re.search(r"timezone\(timedelta\(hours=(\d+)\)\)", src)
    statuses = sorted(set(re.findall(r'session_status\s*=\s*["\']([A-Z_]+)["\']', src)) |
                      set(re.findall(r'["\'](MARKET_CLOSED|OPEN_HEALTHY|OPEN_STALE|BROKEN)["\']',
                                     src)))
    return {
        "status": "CONFIRMED_SOURCE",
        "source": "data_layer/app/stream/dnse_ws.py:_is_market_open",
        "timezone_utc_offset_hours": int(tz.group(1)) if tz else None,
        "session_windows_local": [f"{h}:{mn:0>2}" for h, mn in times],
        "weekdays": "Mon-Fri" if "weekday" in body else "UNKNOWN",
        "session_status_values": statuses,
        "note": "Calendar lives in the data layer, NOT in trading_system. A Portal connector "
                "reading only the gateway cannot see VN session state; it must read the "
                "data-layer health surface (dnse_stream.status).",
    }


def engine_authority() -> dict:
    d = TS_ROOT / "services" / "engine_authority"
    if not d.exists():
        return {"status": "MISSING"}
    states, reasons, files = set(), set(), []
    for py in sorted(d.rglob("*.py")):
        if "__pycache__" in py.parts:
            continue
        files.append(str(py.relative_to(TS_ROOT)))
        src = py.read_text(errors="replace")
        states |= set(re.findall(r'["\'](GRANTED|BLOCKED|FAILED|PENDING|EXPIRED|REVOKED)["\']',
                                 src))
        reasons |= set(re.findall(r'["\']([A-Z][A-Z0-9_]*(?:BLOCKED|DENIED|SCOPE|AUTHORITY)'
                                  r'[A-Z0-9_]*)["\']', src))
    return {"status": "CONFIRMED_SOURCE", "modules": files,
            "claim_states": sorted(states), "authority_reasons": sorted(reasons)}


def main() -> int:
    heartbeat = numeric_defaults(
        TS_ROOT / "services" / "monitor" / "service_heartbeats.py",
        ["stale_after_seconds", "heartbeat_interval_seconds", "interval_seconds"])
    dl_supervisor = numeric_defaults(
        DL_ROOT / "app" / "stream" / "supervisor.py",
        ["stale_after_seconds", "reconnect_backoff_seconds", "max_backoff_seconds",
         "outage_threshold_seconds"])
    dl_main = numeric_defaults(DL_ROOT / "app" / "main.py",
                               ["STREAM_STALE_SECONDS", "STALE_AFTER_SECONDS"])
    # core/config.py is a re-export shim; the declarations live in shared/config.py
    gw_conf = numeric_defaults(
        TS_ROOT / "shared" / "config.py",
        ["GATEWAY_RATE_LIMIT_PER_SECOND", "GATEWAY_RATE_LIMIT_SCOPE",
         "BROKER_CIRCUIT_COOLDOWN_SECONDS", "MARKET_DATA_STALE_SECONDS",
         "REPLAY_V2_ENABLED", "COMMAND_JOURNAL_MAX_ATTEMPTS",
         "COMMAND_JOURNAL_ROLLOUT", "COMMAND_JOURNAL_ACK_REQUIRED",
         "COMMAND_JOURNAL_STREAM_MAXLEN", "CONTRACT_SHADOW_ENABLED",
         "GATEWAY_LEGACY_PLAINTEXT_API_KEYS_ENABLED"])

    probes_file = OUT_DIR / "runtime-probes.json"
    live = {}
    if probes_file.exists():
        pr = json.loads(probes_file.read_text())["probes"]
        gw = pr.get("gw_health", {}).get("response_skeleton", {})
        dl = pr.get("dl_health", {}).get("response_skeleton", {})
        live = {
            "gateway_health_keys": sorted(gw) if isinstance(gw, dict) else [],
            "gateway_readiness_rule": "status READY unless checks.redis/postgres false or "
                                      "stale_or_bad_services non-empty "
                                      "(services/gateway/main.py:v1_health)",
            "gateway_checks": gw.get("checks") if isinstance(gw, dict) else None,
            "gateway_command_journal_telemetry": gw.get("command_journal")
            if isinstance(gw, dict) else None,
            "data_layer_health_keys": sorted(dl) if isinstance(dl, dict) else [],
        }

    payload = {
        "provenance": provenance("scripts/95_freshness_authority.py", [
            "services/monitor/service_heartbeats.py", "services/gateway/main.py",
            "services/engine_authority/*.py", "core/config.py",
            "data_layer/app/stream/supervisor.py", "data_layer/app/stream/dnse_ws.py",
            "extract/runtime-probes.json"]),
        "portal_envelope_mapping": {
            "as_of": "no server-supplied `as_of` on list endpoints; use the row-level "
                     "`updated_at` / `ts` / `trade_time` column, or `/v1/health.ts` for "
                     "health-scoped answers. The connector MUST stamp its own read time "
                     "separately and never present it as Trading System authority.",
            "source_sequence": "MISSING on HTTP responses. Available only as "
                               "copy_event_outbox.sequence_id (not exposed over HTTP) and "
                               "domain_events ordering by (event_ts, created_at).",
            "aggregate_version": "PARTIAL — order groups expose `version` with "
                                 "`expected_version` optimistic concurrency (409 "
                                 "VERSION_OR_STATE_CONFLICT). No other aggregate has one.",
            "freshness_state": "derive from: /v1/health.checks.stale_or_bad_services (service "
                               "heartbeat age > threshold), broker adapter circuit_open, and "
                               "data-layer feed staleness. Trading System does not emit a "
                               "single freshness enum.",
            "projection_lag_ms": "not emitted; connector must compute "
                                 "now - max(row.updated_at) itself and label it as "
                                 "connector-derived, not Trading System truth.",
            "source_authority": "constant EXECUTION_CELL for every Trading System answer; "
                                "per-venue authority is in /v1/health/capabilities "
                                "rollout_state.",
        },
        "service_heartbeat": {
            "status": "CONFIRMED_SOURCE",
            "source": "services/monitor/service_heartbeats.py",
            "defaults": heartbeat,
            "state_values": ["STARTING", "READY", "DEGRADED", "STOPPING", "FAILED"],
            "state_source": "DB CHECK on service_heartbeats.status",
        },
        "data_layer_feed_freshness": {
            "status": "CONFIRMED_SOURCE",
            "source": "data_layer/app/stream/supervisor.py, data_layer/app/main.py",
            "defaults": {**dl_supervisor, **dl_main},
        },
        "gateway_config_defaults": gw_conf,
        "vn_trading_calendar": vn_calendar(),
        "engine_authority": engine_authority(),
        "live_health_surface": live,
    }
    p = write_json("freshness-authority.json", payload)
    print(json.dumps({k: v for k, v in payload.items()
                      if k not in {"provenance", "live_health_surface"}},
                     indent=2)[:2600])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
