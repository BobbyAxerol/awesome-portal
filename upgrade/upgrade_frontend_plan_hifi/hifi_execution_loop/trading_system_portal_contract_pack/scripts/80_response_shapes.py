#!/usr/bin/env python3
"""80_response_shapes.py — exact response field lists for every read endpoint.

The OpenAPI document types every 200 response as a bare `{}`. The real shape is the
SELECT column list of the repository query behind each handler, wrapped in a small
literal envelope. This script:

  1. AST-parses `services/gateway/repository/*.py`, extracts each method's SQL and
     parses the outermost SELECT list into ordered output field names (including
     `AS` aliases and computed columns);
  2. joins each field to its DB column type from extract/db-schema.json;
  3. maps handler -> repository method -> field list using extract/api-surface.json,
     so each endpoint gets a concrete response contract;
  4. records the literal envelope keys the handler returns around that list.

Result: a Portal connector can generate typed structs without calling the API.
READ-ONLY: source parsing plus already-extracted local JSON.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

REPO_DIR = TS_ROOT / "services" / "gateway" / "repository"
CORE_DIR = TS_ROOT / "services" / "gateway" / "core"
# Endpoints whose body is assembled in Python (replay jobs, compare, lifecycle,
# emergency-close) have no single SELECT to read. Their shape is the dict literal
# the service returns, so those modules are scanned for return-dict keys instead.
EXTRA_SERVICE_DIRS = [TS_ROOT / "services" / "replay",
                      TS_ROOT / "services" / "gateway" / "repository",
                      TS_ROOT / "services" / "gateway" / "core",
                      TS_ROOT / "services" / "sizing"]
GATEWAY = TS_ROOT / "services" / "gateway" / "main.py"

SELECT_RE = re.compile(r"\bSELECT\b(.*?)\bFROM\b\s+([A-Za-z0-9_.\"]+)", re.S | re.I)
ORDER_RE = re.compile(r"\bORDER\s+BY\b(.*?)(?:\bLIMIT\b|$)", re.S | re.I)
LIMIT_RE = re.compile(r"\bLIMIT\b\s*(\$\d+|\d+)", re.I)


# Four replay-job endpoints resolve through a factory (`_replay_service()`) whose
# repository writes with `RETURNING *` rather than `SELECT`, so the AST passes above
# cannot reach a field list. These are hand-verified against source and marked as such
# — they are NOT machine-derived, and they are gated at runtime.
MANUAL_ANNOTATIONS = {
    ("POST", "/v1/admin/replay/jobs"): {
        "returns_table": "execution_replay_jobs",
        "verified_from": "services/replay/repository.py:21 (INSERT ... RETURNING *)",
        "runtime_gate": "503 `replay v2 is disabled` while REPLAY_V2_ENABLED=false "
                        "(services/gateway/main.py:139)",
    },
    ("GET", "/v1/admin/replay/jobs/{replay_id}"): {
        "returns_table": "execution_replay_jobs",
        "verified_from": "services/replay/repository.py:35 (SELECT * ... WHERE replay_id)",
        "runtime_gate": "503 while REPLAY_V2_ENABLED=false",
    },
    ("POST", "/v1/admin/replay/jobs/{replay_id}/run"): {
        "returns_table": "execution_replay_jobs",
        "verified_from": "services/replay/service.py run() -> repository row",
        "runtime_gate": "503 while REPLAY_V2_ENABLED=false",
    },
    ("POST", "/v1/admin/replay/quantbt-diff"): {
        "returns_table": None,
        "verified_from": "composed diff payload; shape not resolvable without a run",
        "runtime_gate": "503 while REPLAY_V2_ENABLED=false",
    },
}


def split_select_list(sel: str) -> list[str]:
    parts, depth, cur = [], 0, []
    for ch in sel:
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
    return [" ".join(p.split()) for p in parts if p.strip()]


def field_name(expr: str) -> tuple[str, str]:
    """Return (output_name, source_expression)."""
    m = re.search(r"\bAS\s+([A-Za-z0-9_\"]+)\s*$", expr, re.I)
    if m:
        return m.group(1).strip('"'), expr
    tail = expr.split(".")[-1].strip()
    if re.match(r"^[A-Za-z0-9_]+$", tail):
        return tail, expr
    return expr, expr


def extract_queries() -> list[dict]:
    out: list[dict] = []
    # services/replay holds its own repository (execution_replay_jobs) — scan it too,
    # otherwise the 4 replay-job endpoints resolve to nothing.
    sources = (list(REPO_DIR.glob("*.py")) + list(CORE_DIR.glob("*.py"))
               + list((TS_ROOT / "services" / "replay").glob("*.py")))
    for py in sorted(sources):
        if py.name == "__init__.py":
            continue
        rel = str(py.relative_to(TS_ROOT))
        try:
            tree = ast.parse(py.read_text(errors="replace"))
        except SyntaxError:
            continue
        for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
            for fn in [n for n in cls.body
                       if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
                sqls = [n.value for n in ast.walk(fn)
                        if isinstance(n, ast.Constant) and isinstance(n.value, str)
                        and re.search(r"\bSELECT\b.*\bFROM\b", n.value, re.S | re.I)]
                if not sqls:
                    continue
                for sql in sqls:
                    m = SELECT_RE.search(sql)
                    if not m:
                        continue
                    fields = []
                    for expr in split_select_list(m.group(1)):
                        name, src = field_name(expr)
                        fields.append({"name": name, "expression": src,
                                       "computed": name != src.split(".")[-1].strip()})
                    om, lm = ORDER_RE.search(sql), LIMIT_RE.search(sql)
                    out.append({
                        "module": rel,
                        "class": cls.name,
                        "method": fn.name,
                        "source": f"{rel}:{fn.lineno}",
                        "from_table": m.group(2).strip('"'),
                        "fields": fields,
                        "field_names": [f["name"] for f in fields],
                        "order_by": " ".join(om.group(1).split()) if om else None,
                        "limit_clause": lm.group(1) if lm else None,
                        "params": sorted({p for p in re.findall(r"\$\d+", sql)},
                                         key=lambda x: int(x[1:])),
                    })
    return out



def dict_return_shapes() -> dict[str, list[dict]]:
    """method name -> keys of the dict literals it returns.

    Complements the SELECT-based extraction for endpoints that compose their response
    in Python. Nested dict values are recorded one level deep so the caller can see
    sub-object keys (e.g. `comparison`, `projection`).
    """
    out: dict[str, list[dict]] = {}
    for root in EXTRA_SERVICE_DIRS:
        if not root.exists():
            continue
        for py in sorted(root.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            rel = str(py.relative_to(TS_ROOT))
            try:
                tree = ast.parse(py.read_text(errors="replace"))
            except SyntaxError:
                continue
            for fn in ast.walk(tree):
                if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                shapes = []
                for n in ast.walk(fn):
                    if not isinstance(n, ast.Return):
                        continue
                    # engine handlers return `(payload, http_code)`; unwrap to the dict
                    ret = n.value
                    if isinstance(ret, ast.Tuple) and ret.elts:
                        ret = next((e for e in ret.elts if isinstance(e, ast.Dict)), None)
                    if isinstance(ret, ast.Dict):
                        keys = []
                        for k, v in zip(ret.keys, ret.values):
                            if isinstance(k, ast.Constant) and isinstance(k.value, str):
                                nested = None
                                if isinstance(v, ast.Dict):
                                    nested = [kk.value for kk in v.keys
                                              if isinstance(kk, ast.Constant)
                                              and isinstance(kk.value, str)]
                                keys.append({"key": k.value, "nested_keys": nested})
                        if keys:
                            shapes.append({"source": f"{rel}:{n.lineno}", "keys": keys})
                if shapes:
                    out.setdefault(fn.name, []).extend(shapes)
    return out


def type_index() -> dict[str, dict[str, str]]:
    f = OUT_DIR / "db-schema.json"
    if not f.exists():
        return {}
    schema = json.loads(f.read_text())
    idx: dict[str, dict[str, str]] = {}
    for t, cols in (schema.get("runtime_columns") or {}).items():
        idx[t] = {c["name"]: c["data_type"] for c in cols}
    if not idx:
        for t, tv in schema.get("tables", {}).items():
            idx[t] = {c["name"]: c["type"] for c in tv["columns"]}
    return idx


def handler_repo_calls() -> dict[str, list[str]]:
    """handler name -> repository methods it calls (Repo(...).method / repo.method)."""
    tree = ast.parse(GATEWAY.read_text(errors="replace"))
    out: dict[str, list[str]] = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        methods = []
        for c in ast.walk(node):
            if isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute):
                v = c.func.value
                if isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and \
                        v.func.id.endswith(("Repository", "Repo", "Service")):
                    methods.append(f"{v.func.id}.{c.func.attr}")
                # local factory: `_replay_service().create(...)`
                elif isinstance(v, ast.Call) and isinstance(v.func, ast.Name) and \
                        v.func.id.startswith("_") and v.func.id.endswith(
                            ("service", "repo", "repository")):
                    methods.append(c.func.attr)
                elif isinstance(v, ast.Name) and v.id in {"repo", "svc", "service", "store",
                                                          "engine"}:
                    methods.append(c.func.attr)
        if methods:
            out[node.name] = sorted(set(methods))
    return out


def main() -> int:
    queries = extract_queries()
    types = type_index()
    calls = handler_repo_calls()
    dict_shapes = dict_return_shapes()

    by_method: dict[str, list[dict]] = {}
    for q in queries:
        cols = types.get(q["from_table"], {})
        # `SELECT *` / `SELECT DISTINCT ON (...) *` returns every column of the table;
        # expand it so the connector sees real field names instead of a star.
        if cols and any(f["name"].rstrip("*").endswith("*") or f["name"] == "*"
                        for f in q["fields"]):
            q["star_expanded"] = True
            q["fields"] = [{"name": c, "expression": f"{q['from_table']}.{c}",
                            "computed": False} for c in cols]
            q["field_names"] = list(cols)
        for f in q["fields"]:
            f["db_type"] = cols.get(f["name"])
        by_method.setdefault(f"{q['class']}.{q['method']}", []).append(q)
        by_method.setdefault(q["method"], []).append(q)

    api_file = OUT_DIR / "api-surface.json"
    endpoints = []
    if api_file.exists():
        for o in json.loads(api_file.read_text())["operations"]:
            methods = calls.get(o["handler"], [])
            shapes = []
            for m in methods:
                for q in by_method.get(m, []):
                    shapes.append({
                        "repository_method": f"{q['class']}.{q['method']}",
                        "from_table": q["from_table"],
                        "fields": q["field_names"],
                        "field_types": {f["name"]: f.get("db_type") for f in q["fields"]},
                        "order_by": q["order_by"],
                        "limit_clause": q["limit_clause"],
                        "source": q["source"],
                    })
            composed = []
            for m in methods:
                bare = m.split(".")[-1]
                for sh in dict_shapes.get(bare, [])[:3]:
                    composed.append({"repository_method": m, **sh})
            manual = MANUAL_ANNOTATIONS.get((o["method"], o["path"]))
            if manual and not shapes:
                tbl = manual.get("returns_table")
                cols = types.get(tbl, {}) if tbl else {}
                if cols:
                    shapes.append({
                        "repository_method": "MANUAL_ANNOTATION",
                        "from_table": tbl,
                        "fields": list(cols),
                        "field_types": cols,
                        "order_by": None,
                        "limit_clause": None,
                        "source": manual["verified_from"],
                        "hand_verified": True,
                    })
            if shapes or composed or manual or o["literal_response_keys"]:
                endpoints.append({
                    "method": o["method"],
                    "path": o["path"],
                    "handler": o["handler"],
                    "envelope_keys": o["literal_response_keys"],
                    "repository_calls": methods,
                    "row_shapes": shapes[:6],
                    "composed_shapes": composed[:6],
                    "manual_annotation": manual,
                })

    payload = {
        "provenance": provenance("scripts/80_response_shapes.py", [
            "services/gateway/repository/*.py", "services/gateway/main.py",
            "extract/db-schema.json", "extract/api-surface.json"]),
        "summary": {
            "repository_queries": len(queries),
            "star_expanded_queries": sum(1 for q in queries if q.get("star_expanded")),
            "distinct_repository_methods": len({f"{q['class']}.{q['method']}" for q in queries}),
            "endpoints_with_row_shape": sum(1 for e in endpoints if e["row_shapes"]),
            "endpoints_with_composed_shape": sum(
                1 for e in endpoints if not e["row_shapes"] and e["composed_shapes"]),
            "endpoints_with_envelope_only": sum(
                1 for e in endpoints if not e["row_shapes"] and not e["composed_shapes"]),
            "hand_verified_endpoints": sum(
                1 for e in endpoints if e.get("manual_annotation")),
            "fields_typed_from_db": sum(
                1 for q in queries for f in q["fields"] if f.get("db_type")),
            "fields_total": sum(len(q["fields"]) for q in queries),
        },
        "note": "OpenAPI types every 200 response as `{}`. `row_shapes[].fields` is the actual "
                "ordered column list returned inside the envelope; `field_types` is the "
                "PostgreSQL type from the live catalog where the column is a plain table column "
                "(null for computed expressions).",
        "endpoints": endpoints,
        "repository_queries": queries,
    }
    p = write_json("response-shapes.json", payload)

    md = ["# Response shapes (repository SELECT lists)", "",
          "| Method | Path | Envelope | Row fields | Order by |", "|---|---|---|---|---|"]
    for e in endpoints:
        if not e["row_shapes"]:
            continue
        s = e["row_shapes"][0]
        md.append("| {m} | `{p}` | {env} | {f} | `{o}` |".format(
            m=e["method"], p=e["path"],
            env=", ".join(f"`{k}`" for k in e["envelope_keys"]) or "—",
            f=", ".join(f"`{x}`" for x in s["fields"][:14]) +
              (f" … (+{len(s['fields']) - 14})" if len(s["fields"]) > 14 else ""),
            o=s["order_by"] or "—"))
    write_text("response-shapes.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
