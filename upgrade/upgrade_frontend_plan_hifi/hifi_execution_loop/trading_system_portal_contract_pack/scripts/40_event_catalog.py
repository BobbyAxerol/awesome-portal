#!/usr/bin/env python3
"""40_event_catalog.py — complete event/outbox contract for the Portal relay.

Combines four evidence layers:
  1. committed JSON Schemas in `contracts/events/*.schema.json` (v2 polyglot contracts)
  2. `domain/events.py` dataclasses (canonical in-process event shapes)
  3. event_type string literals emitted by services (source grep, AST-anchored)
  4. RUNTIME aggregates: `SELECT event_type, count(*), min/max(event_ts)` from
     domain_events + outbox status counts + Redis XLEN/XINFO. Counts and timestamps
     only — no payload row is ever read.

READ-ONLY: SELECT / XLEN / XINFO STREAM only.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TS_ROOT, provenance, write_json  # noqa: E402

CONTRACT_EVENTS = TS_ROOT / "contracts" / "events"
DOMAIN_EVENTS = TS_ROOT / "domain" / "events.py"
SCAN_DIRS = [TS_ROOT / "services", TS_ROOT / "core", TS_ROOT / "domain"]
DB_CONTAINER, DB_NAME, DB_USER = "live_data_executor", "live_data_executor", "bobby"
REDIS_CONTAINER = "redis_service"

# Durable command + outbox surface the Portal must be able to observe (handoff 7.5/7.6).
OUTBOX_TABLES = ["copy_event_outbox", "command_dispatch_outbox", "execution_command_outbox",
                 "copy_event_dead_letters", "event_idempotency",
                 "command_journal", "command_ack_evidence", "command_delivery_attempts",
                 "command_broker_attempts", "command_stream_trim_audit",
                 "operator_operations", "reconciliation_findings"]
# tables use either `status` or `state` as the lifecycle column
LIFECYCLE_COLUMNS = ("status", "state", "delivery_stage", "outcome")
EVENT_TYPE_RE = re.compile(r'event_type\s*=\s*["\']([A-Z][A-Z0-9_.]+)["\']')


def psql(sql: str) -> str:
    if not re.match(r"^\s*(SELECT|WITH)\b", sql, re.I):
        raise ValueError("refuses non-SELECT SQL")
    r = subprocess.run(
        ["docker", "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
         DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-At", "-F", "\t", "-c", sql],
        capture_output=True, text=True, timeout=120)
    return r.stdout if r.returncode == 0 else f"__ERROR__ {r.stderr.strip()[:300]}"


def redis_cmd(*args: str) -> str:
    r = subprocess.run(["docker", "exec", REDIS_CONTAINER, "redis-cli", *args],
                       capture_output=True, text=True, timeout=30)
    return (r.stdout or r.stderr).strip()


def committed_schemas() -> list[dict]:
    out = []
    if not CONTRACT_EVENTS.exists():
        return out
    for f in sorted(CONTRACT_EVENTS.glob("*.schema.json")):
        try:
            doc = json.loads(f.read_text())
        except Exception:
            continue
        props = doc.get("properties", {})
        out.append({
            "file": f"contracts/events/{f.name}",
            "schema_id": doc.get("$id"),
            "title": doc.get("title"),
            "version": doc.get("version") or doc.get("x-version"),
            "required": doc.get("required", []),
            "field_count": len(props),
            "fields": {k: {"type": v.get("type"), "enum": v.get("enum"),
                           "format": v.get("format"), "description": v.get("description")}
                       for k, v in props.items()},
            "additional_properties": doc.get("additionalProperties"),
        })
    return out


def domain_event_classes() -> list[dict]:
    if not DOMAIN_EVENTS.exists():
        return []
    tree = ast.parse(DOMAIN_EVENTS.read_text(errors="replace"))
    out = []
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            fields = []
            for s in node.body:
                if isinstance(s, ast.AnnAssign) and isinstance(s.target, ast.Name):
                    fields.append({
                        "name": s.target.id,
                        "type": ast.unparse(s.annotation),
                        "required": s.value is None,
                    })
            out.append({
                "class": node.name,
                "bases": [ast.unparse(b) for b in node.bases],
                "source": f"domain/events.py:{node.lineno}",
                "fields": fields,
            })
    return out


def emitted_event_types() -> dict[str, list[str]]:
    found: dict[str, set[str]] = {}
    for root in SCAN_DIRS:
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            if "__pycache__" in py.parts:
                continue
            for m in EVENT_TYPE_RE.finditer(py.read_text(errors="replace")):
                found.setdefault(m.group(1), set()).add(str(py.relative_to(TS_ROOT)))
    return {k: sorted(v) for k, v in sorted(found.items())}


def runtime_events() -> dict:
    rows = psql("""
      SELECT event_type, count(*), min(event_ts)::text, max(event_ts)::text,
             count(DISTINCT producer), count(DISTINCT schema_version)
      FROM domain_events GROUP BY event_type ORDER BY count(*) DESC
    """)
    types = []
    if not rows.startswith("__ERROR__"):
        for ln in rows.strip().splitlines():
            p = ln.split("\t")
            if len(p) >= 6:
                types.append({"event_type": p[0], "count": int(p[1]),
                              "first_event_ts": p[2], "last_event_ts": p[3],
                              "distinct_producers": int(p[4]),
                              "distinct_schema_versions": int(p[5])})

    meta = psql("""
      SELECT DISTINCT producer, schema_version, canonical_contract_version
      FROM domain_events ORDER BY producer
    """)
    producers = []
    if not meta.startswith("__ERROR__"):
        for ln in meta.strip().splitlines():
            p = ln.split("\t")
            if len(p) >= 3:
                producers.append({"producer": p[0], "schema_version": p[1],
                                  "canonical_contract_version": p[2]})

    outbox = {}
    for t in OUTBOX_TABLES:
        q = psql(f"SELECT count(*) FROM {t}")
        if q.startswith("__ERROR__"):
            outbox[t] = {"error": q[:160]}
            continue
        entry = {"row_count": int(q.strip() or 0)}
        st = psql(f"""
          SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='{t}' ORDER BY ordinal_position
        """)
        entry["columns"] = [c for c in st.strip().splitlines()] if not st.startswith("__ERROR__") else []
        for col in LIFECYCLE_COLUMNS:
            if col not in entry["columns"]:
                continue
            sc = psql(f"SELECT {col}, count(*) FROM {t} GROUP BY {col} ORDER BY 2 DESC LIMIT 40")
            if not sc.startswith("__ERROR__"):
                entry.setdefault("lifecycle_breakdown", {})[col] = {
                    ln.split("\t")[0]: int(ln.split("\t")[1])
                    for ln in sc.strip().splitlines() if "\t" in ln}
        outbox[t] = entry

    stream = {"key": "copy:events:v1"}
    xlen = redis_cmd("XLEN", "copy:events:v1")
    stream["xlen"] = xlen
    if xlen.isdigit() and int(xlen) > 0:
        info = redis_cmd("XINFO", "STREAM", "copy:events:v1")
        stream["xinfo_summary"] = info.splitlines()[:24]
        groups = redis_cmd("XINFO", "GROUPS", "copy:events:v1")
        stream["consumer_groups_raw"] = groups.splitlines()[:40]
    else:
        stream["note"] = "stream absent or empty — no copy-event traffic to observe"

    keyspace = redis_cmd("INFO", "keyspace")
    return {"domain_event_types": types, "producers": producers,
            "outbox_tables": outbox, "copy_event_stream": stream,
            "redis_keyspace": keyspace.splitlines()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runtime", action="store_true")
    args = ap.parse_args()

    schemas = committed_schemas()
    classes = domain_event_classes()
    emitted = emitted_event_types()
    rt = runtime_events() if args.runtime else None

    payload = {
        "provenance": provenance("scripts/40_event_catalog.py", [
            "contracts/events/*.schema.json", "domain/events.py",
            "services/**/*.py (event_type literals)",
            *(["runtime: domain_events aggregates, outbox counts, redis XLEN/XINFO"] if rt else []),
        ]),
        "summary": {
            "committed_json_schemas": len(schemas),
            "domain_event_classes": len(classes),
            "event_type_literals_in_source": len(emitted),
            "runtime_event_types_observed": len(rt["domain_event_types"]) if rt else None,
            "runtime_verified": bool(rt),
        },
        "delivery_contract": {
            "durable_source": "domain_events (TimescaleDB hypertable) is the append-only "
                              "event log; copy_event_outbox is the only transactional outbox "
                              "that publishes to a Redis stream (copy:events:v1).",
            "portal_read_path": "GET /v1/events (alpha replay scope) and GET /v1/admin/events "
                                "(admin) — both ORDER BY event_ts ASC, created_at ASC.",
            "cursor": "(event_ts, created_at) time cursor via from/to params; event_id is the "
                      "dedupe key but is NOT a filterable cursor.",
            "ordering": "ascending append order per query; no global monotonic sequence column "
                        "on domain_events. copy_event_outbox has sequence_id per row.",
            "delivery_semantics": "at-least-once (outbox retry -> dead letter after max attempts)",
            "dedupe": "event_id (domain_events) / copy_event_id (outbox) / event_idempotency "
                      "(scope, idempotency_key, payload_hash)",
            "synthetic_projection": "EventStoreRepository.synthetic_projection_events() "
                                    "reconstructs ORDER_STATUS / ORDER_FILLED / "
                                    "ORDER_BRACKET_STATE / ORDER_BRACKET_LEG_STATE from the "
                                    "canonical orders/fills/brackets tables when domain_events "
                                    "has no row — replay stays complete even for gaps.",
            "limits": "limit default 500, maximum 5000 (event_store.py:_limit)",
        },
        "committed_schemas": schemas,
        "domain_event_classes": classes,
        "event_type_literals": emitted,
        "runtime": rt,
    }
    p = write_json("event-catalog.json", payload)
    print(json.dumps(payload["summary"], indent=2))
    if rt:
        print("runtime event types:", json.dumps(rt["domain_event_types"][:12], indent=1)[:1400])
        print("outbox:", json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "columns"}
                                     for k, v in rt["outbox_tables"].items()}, indent=1)[:900])
        print("stream:", json.dumps(rt["copy_event_stream"], indent=1)[:500])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
