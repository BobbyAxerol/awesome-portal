#!/usr/bin/env python3
"""30_db_schema.py — full canonical DB contract for a read-only Portal adapter.

Two independent sources, cross-checked:
  1. SOURCE  — parses `init-db/*.sql` DDL (tables, columns, PK/FK/unique, indexes,
     hypertables, retention/compression policies, views).
  2. RUNTIME — optional read-only `information_schema` / TimescaleDB catalog query,
     run inside the DB container with `psql -c` SELECT statements ONLY.
     Enable with `--runtime`. No DDL, no DML, no role creation.

Also merges `contracts/schema/table-ownership.generated.json` (canonical vs legacy)
when present, which is the authority for what a Portal projection may read.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TS_ROOT, provenance, write_json, write_text  # noqa: E402

INIT_DB = TS_ROOT / "init-db"
OWNERSHIP = TS_ROOT / "contracts" / "schema" / "table-ownership.generated.json"
DB_CONTAINER = "live_data_executor"
DB_NAME = "live_data_executor"
DB_USER = "bobby"

CREATE_TABLE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_.\"]+)\s*\((.*?)\n\s*\);",
    re.S | re.I,
)
CREATE_VIEW = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"([A-Za-z0-9_.\"]+)", re.I)
CREATE_INDEX = re.compile(
    r"CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"
    r"([A-Za-z0-9_\"]+)\s+ON\s+([A-Za-z0-9_.\"]+)\s*(?:USING\s+\w+\s*)?\(([^;]*?)\)\s*(?:WHERE[^;]*)?;",
    re.S | re.I)
HYPERTABLE = re.compile(r"create_hypertable\(\s*'([^']+)'\s*,\s*'([^']+)'([^)]*)\)", re.I)
RETENTION = re.compile(r"add_retention_policy\(\s*'([^']+)'\s*,\s*([^)]+)\)", re.I)
COMPRESSION = re.compile(r"add_compression_policy\(\s*'([^']+)'\s*,\s*([^)]+)\)", re.I)
ALTER_ADD_COL = re.compile(
    r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_.\"]+)\s+ADD\s+COLUMN\s+"
    r"(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z0-9_\"]+)\s+([^;,]+)", re.I)
DROP_TABLE = re.compile(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z0-9_.\"]+)", re.I)

CONSTRAINT_LINE = re.compile(
    r"^\s*(CONSTRAINT\s+\S+\s+)?(PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK)\b", re.I)


def clean(name: str) -> str:
    return name.strip().strip('"').split(".")[-1]


def split_columns(body: str) -> list[str]:
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return [p.strip() for p in parts if p.strip()]


def parse_sql_sources() -> dict:
    tables: dict[str, dict] = {}
    views: dict[str, dict] = {}
    indexes: list[dict] = []
    hypertables: dict[str, dict] = {}
    dropped: list[dict] = []
    files: list[str] = []

    for sql in sorted(INIT_DB.glob("*.sql")):
        files.append(f"init-db/{sql.name}")
        text = sql.read_text(errors="replace")
        # strip line comments so regexes do not trip on commented DDL
        stripped = re.sub(r"--[^\n]*", "", text)

        for m in CREATE_TABLE.finditer(stripped):
            tname = clean(m.group(1))
            cols, constraints = [], []
            for raw in split_columns(m.group(2)):
                if CONSTRAINT_LINE.match(raw):
                    constraints.append(" ".join(raw.split()))
                    continue
                mm = re.match(r'^"?([A-Za-z0-9_]+)"?\s+(.+)$', raw, re.S)
                if not mm:
                    continue
                cname, rest = mm.group(1), " ".join(mm.group(2).split())
                cols.append({
                    "name": cname,
                    "type": rest.split(" DEFAULT ")[0].split(" NOT NULL")[0]
                            .split(" PRIMARY KEY")[0].split(" UNIQUE")[0]
                            .split(" REFERENCES")[0].strip(),
                    "not_null": bool(re.search(r"\bNOT\s+NULL\b", rest, re.I)),
                    "default": (re.search(r"\bDEFAULT\s+(.+?)(?:\s+NOT\s+NULL|\s+REFERENCES|$)",
                                          rest, re.I).group(1).strip()
                                if re.search(r"\bDEFAULT\b", rest, re.I) else None),
                    "primary_key": bool(re.search(r"\bPRIMARY\s+KEY\b", rest, re.I)),
                    "unique": bool(re.search(r"\bUNIQUE\b", rest, re.I)),
                    "references": (re.search(r"\bREFERENCES\s+([A-Za-z0-9_.\"]+\s*\([^)]*\))",
                                             rest, re.I).group(1).strip()
                                   if re.search(r"\bREFERENCES\b", rest, re.I) else None),
                })
            entry = tables.setdefault(tname, {
                "name": tname, "columns": [], "table_constraints": [],
                "defined_in": [], "altered_in": [],
            })
            existing = {c["name"] for c in entry["columns"]}
            entry["columns"].extend(c for c in cols if c["name"] not in existing)
            entry["table_constraints"].extend(constraints)
            entry["defined_in"].append(f"init-db/{sql.name}")

        for m in ALTER_ADD_COL.finditer(stripped):
            tname, cname, ctype = clean(m.group(1)), clean(m.group(2)), " ".join(m.group(3).split())
            entry = tables.setdefault(tname, {
                "name": tname, "columns": [], "table_constraints": [],
                "defined_in": [], "altered_in": [],
            })
            if cname not in {c["name"] for c in entry["columns"]}:
                entry["columns"].append({
                    "name": cname, "type": ctype.split(" DEFAULT ")[0].strip(),
                    "not_null": bool(re.search(r"\bNOT\s+NULL\b", ctype, re.I)),
                    "default": None, "primary_key": False, "unique": False,
                    "references": None, "added_by_alter": True,
                })
            if f"init-db/{sql.name}" not in entry["altered_in"]:
                entry["altered_in"].append(f"init-db/{sql.name}")

        for m in CREATE_VIEW.finditer(stripped):
            vname = clean(m.group(2))
            views[vname] = {"name": vname, "materialized": bool(m.group(1)),
                            "defined_in": f"init-db/{sql.name}"}

        for m in CREATE_INDEX.finditer(stripped):
            indexes.append({
                "name": clean(m.group(2)), "table": clean(m.group(3)),
                "unique": bool(m.group(1)),
                "columns": " ".join(m.group(4).split()),
                "defined_in": f"init-db/{sql.name}",
            })

        for m in HYPERTABLE.finditer(stripped):
            hypertables[clean(m.group(1))] = {
                "table": clean(m.group(1)), "time_column": m.group(2),
                "options": " ".join(m.group(3).split()).strip(", "),
                "defined_in": f"init-db/{sql.name}",
            }
        for m in RETENTION.finditer(stripped):
            hypertables.setdefault(clean(m.group(1)), {"table": clean(m.group(1))})[
                "retention_policy"] = " ".join(m.group(2).split())
        for m in COMPRESSION.finditer(stripped):
            hypertables.setdefault(clean(m.group(1)), {"table": clean(m.group(1))})[
                "compression_policy"] = " ".join(m.group(2).split())

        for m in DROP_TABLE.finditer(stripped):
            dropped.append({"table": clean(m.group(1)), "dropped_in": f"init-db/{sql.name}"})

    for d in dropped:
        if d["table"] in tables:
            tables[d["table"]]["dropped_by_migration"] = d["dropped_in"]

    return {"tables": tables, "views": views, "indexes": indexes,
            "hypertables": hypertables, "dropped": dropped, "files": files}


def psql(sql: str) -> str:
    """Run one read-only SELECT inside the DB container. SELECT statements only."""
    if not re.match(r"^\s*(SELECT|WITH)\b", sql, re.I):
        raise ValueError("30_db_schema.py refuses non-SELECT SQL")
    # read-only enforced via PGOPTIONS so the session tag does not pollute output
    cmd = ["docker", "exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
           DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
           "-At", "-F", "\t", "-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        return f"__ERROR__ {r.stderr.strip()[:400]}"
    return r.stdout


def runtime_metadata() -> dict:
    """Read-only catalog inspection: names, types, counts and policies — never rows."""
    q_tables = """
      SELECT c.relname, c.relkind,
             pg_size_pretty(pg_total_relation_size(c.oid)),
             COALESCE(s.n_live_tup, 0)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
      ORDER BY c.relname
    """
    q_cols = """
      SELECT table_name, column_name, data_type, is_nullable, column_default,
             ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    """
    q_hyper = """
      SELECT hypertable_name, num_chunks, compression_enabled
      FROM timescaledb_information.hypertables ORDER BY hypertable_name
    """
    q_jobs = """
      SELECT proc_name, hypertable_name, schedule_interval::text, config::text
      FROM timescaledb_information.jobs ORDER BY job_id
    """
    q_ver = """
      SELECT current_setting('server_version'),
             (SELECT extversion FROM pg_extension WHERE extname='timescaledb')
    """
    q_ledger = """
      SELECT version, applied_at::text
      FROM schema_migration_ledger ORDER BY applied_at DESC LIMIT 5
    """

    def rows(sql: str) -> list[list[str]]:
        raw = psql(sql)
        if raw.startswith("__ERROR__"):
            return [[raw]]
        return [ln.split("\t") for ln in raw.strip().splitlines() if ln.strip()]

    relkind = {"r": "table", "v": "view", "m": "matview", "p": "partitioned"}
    objs = {}
    for r in rows(q_tables):
        if len(r) >= 4:
            objs[r[0]] = {"kind": relkind.get(r[1], r[1]), "total_size": r[2],
                          "approx_live_rows": int(r[3]) if r[3].isdigit() else None}
    cols: dict[str, list[dict]] = {}
    for r in rows(q_cols):
        if len(r) >= 6:
            cols.setdefault(r[0], []).append({
                "name": r[1], "data_type": r[2], "nullable": r[3] == "YES",
                "default": r[4] or None, "position": int(r[5]) if r[5].isdigit() else None})
    hypers = {r[0]: {"num_chunks": r[1], "compression_enabled": r[2]}
              for r in rows(q_hyper) if len(r) >= 3}
    jobs = [{"proc": r[0], "hypertable": r[1], "interval": r[2],
             "config": r[3] if len(r) > 3 else None}
            for r in rows(q_jobs) if len(r) >= 3]
    ver = rows(q_ver)
    ledger = [{"version": r[0], "applied_at": r[1]} for r in rows(q_ledger) if len(r) >= 2]

    return {
        "engine": {"postgres": ver[0][0] if ver and len(ver[0]) > 0 else None,
                   "timescaledb": ver[0][1] if ver and len(ver[0]) > 1 else None},
        "object_count": len(objs),
        "objects": objs,
        "columns": cols,
        "hypertables": hypers,
        "background_jobs": jobs,
        "migration_ledger_latest": ledger,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runtime", action="store_true",
                    help="also query read-only catalog metadata inside the DB container")
    args = ap.parse_args()

    src = parse_sql_sources()
    ownership = json.loads(OWNERSHIP.read_text()) if OWNERSHIP.exists() else None
    rt = runtime_metadata() if args.runtime else None

    live_tables = {k: v for k, v in src["tables"].items() if "dropped_by_migration" not in v}
    crosscheck = None
    if rt and rt.get("objects"):
        rt_names = set(rt["objects"])
        crosscheck = {
            "runtime_objects": len(rt_names),
            "source_tables": len(live_tables),
            "runtime_only": sorted(rt_names - set(live_tables) - set(src["views"])),
            "source_only": sorted(set(live_tables) - rt_names),
        }

    payload = {
        "provenance": provenance(
            "scripts/30_db_schema.py",
            src["files"] + (["contracts/schema/table-ownership.generated.json"] if ownership else [])
            + (["runtime: information_schema + timescaledb_information (SELECT only)"] if rt else [])),
        "summary": {
            "migration_files": len(src["files"]),
            "tables_defined": len(src["tables"]),
            "tables_live": len(live_tables),
            "tables_dropped_by_migration": len(src["tables"]) - len(live_tables),
            "views": len(src["views"]),
            "indexes": len(src["indexes"]),
            "hypertables": len(src["hypertables"]),
            "total_columns": sum(len(t["columns"]) for t in live_tables.values()),
            "runtime_verified": bool(rt),
        },
        "engine": (rt or {}).get("engine"),
        "migration_ledger_latest": (rt or {}).get("migration_ledger_latest"),
        "crosscheck_source_vs_runtime": crosscheck,
        "hypertables": src["hypertables"],
        "runtime_hypertables": (rt or {}).get("hypertables"),
        "background_jobs": (rt or {}).get("background_jobs"),
        "table_ownership_contract": ownership,
        "tables": live_tables,
        "tables_dropped": {k: v for k, v in src["tables"].items() if "dropped_by_migration" in v},
        "views": src["views"],
        "indexes": src["indexes"],
        "runtime_objects": (rt or {}).get("objects"),
        "runtime_columns": (rt or {}).get("columns"),
    }
    p = write_json("db-schema.json", payload)
    print(json.dumps(payload["summary"], indent=2))
    if crosscheck:
        print(json.dumps(crosscheck, indent=2)[:900])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
