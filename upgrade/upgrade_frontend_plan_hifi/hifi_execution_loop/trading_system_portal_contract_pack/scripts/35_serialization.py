#!/usr/bin/env python3
"""35_serialization.py — PostgreSQL type → JSON wire type → Rust type.

The single most codegen-hostile fact about this API: every repository passes rows
through a `_jsonable()` helper that converts `Decimal -> str` and any object with
`.isoformat()` (date/time/timestamptz) to a string. So a column typed `numeric` in
`extract/db-schema.json` arrives on the wire as a JSON **string**, not a number.

A Rust client generated naively from the DB types would declare `f64` for `quantity`
and `price` and fail to deserialize on the first response. This script:

  1. finds every `_jsonable`-style serializer in the gateway and diffs their rules
     (they are near-duplicates and one handles UUID while others do not);
  2. builds the authoritative pg_type -> JSON -> Rust mapping;
  3. applies it to every field in `extract/response-shapes.json`, emitting a ready
     field->rust_type table per endpoint.

READ-ONLY: ast.parse + previously extracted local JSON.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

GW = TS_ROOT / "services" / "gateway"

# pg type -> (JSON wire type after _jsonable, recommended Rust type, why)
TYPE_MAP: dict[str, tuple[str, str, str]] = {
    "numeric":                     ("string", "rust_decimal::Decimal (serde with str)",
                                    "Decimal -> str by _jsonable; NEVER f64 (precision + type error)"),
    "double precision":            ("number", "f64", "float passes through untouched"),
    "real":                        ("number", "f32", "float passes through untouched"),
    "integer":                     ("number", "i32", "int passes through"),
    "bigint":                      ("number", "i64", "int passes through"),
    "smallint":                    ("number", "i16", "int passes through"),
    "boolean":                     ("bool", "bool", "passes through"),
    "text":                        ("string", "String", "passes through"),
    "character varying":           ("string", "String", "passes through"),
    "uuid":                        ("string", "uuid::Uuid or String",
                                    "str() in event_store only; other repos leak a UUID object"),
    "timestamp with time zone":    ("string", "chrono::DateTime<Utc>",
                                    "isoformat() -> RFC3339-ish; offset present"),
    "timestamp without time zone": ("string", "chrono::NaiveDateTime",
                                    "isoformat() -> NO offset; do not assume UTC"),
    "date":                        ("string", "chrono::NaiveDate", "isoformat()"),
    "time without time zone":      ("string", "chrono::NaiveTime", "isoformat()"),
    "interval":                    ("string", "String", "isoformat() not defined; verify"),
    "jsonb":                       ("object|array|scalar", "serde_json::Value",
                                    "already decoded; some repos json.loads() raw* columns again"),
    "json":                        ("object|array|scalar", "serde_json::Value", "as above"),
    "ARRAY":                       ("array", "Vec<T>", "recursed element-wise"),
    "bytea":                       ("string", "String", "not observed in Portal-relevant tables"),
}


def serializer_rules() -> list[dict]:
    """Extract each _jsonable variant's isinstance branches so differences are visible."""
    out = []
    for py in sorted(GW.rglob("*.py")):
        if "__pycache__" in py.parts:
            continue
        try:
            tree = ast.parse(py.read_text(errors="replace"))
        except SyntaxError:
            continue
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if fn.name not in {"_jsonable", "_record", "_row", "_record_to_dict"}:
                continue
            rules = []
            for n in ast.walk(fn):
                if isinstance(n, ast.If):
                    try:
                        rules.append(ast.unparse(n.test))
                    except Exception:
                        pass
            out.append({
                "function": fn.name,
                "module": str(py.relative_to(TS_ROOT)),
                "line": fn.lineno,
                "branches": rules,
                "handles_decimal": any("Decimal" in r for r in rules),
                "handles_uuid": any("UUID" in r for r in rules),
                "handles_isoformat": any("isoformat" in r for r in rules),
            })
    return out


def map_type(pg: str | None) -> dict:
    if not pg:
        return {"pg_type": None, "json_type": "unknown", "rust_type": "serde_json::Value",
                "note": "computed expression — no table column to type from"}
    key = pg if pg in TYPE_MAP else next(
        (k for k in TYPE_MAP if pg.startswith(k)), None)
    if key is None:
        return {"pg_type": pg, "json_type": "unknown", "rust_type": "serde_json::Value",
                "note": "unmapped PostgreSQL type — verify before codegen"}
    j, r, why = TYPE_MAP[key]
    return {"pg_type": pg, "json_type": j, "rust_type": r, "note": why}


def main() -> int:
    rules = serializer_rules()
    rs_file = OUT_DIR / "response-shapes.json"
    endpoints = []
    hist: dict[str, int] = {}
    decimal_fields: list[str] = []

    if rs_file.exists():
        rs = json.loads(rs_file.read_text())
        for e in rs["endpoints"]:
            if not e["row_shapes"]:
                continue
            s = e["row_shapes"][0]
            fields = []
            for name, pg in s["field_types"].items():
                m = map_type(pg)
                hist[m["json_type"]] = hist.get(m["json_type"], 0) + 1
                if m["pg_type"] == "numeric":
                    decimal_fields.append(f"{s['from_table']}.{name}")
                fields.append({"name": name, **m})
            endpoints.append({"method": e["method"], "path": e["path"],
                              "from_table": s["from_table"], "fields": fields})

    inconsistent = [r for r in rules
                    if r["function"] == "_jsonable" and not r["handles_uuid"]]

    payload = {
        "provenance": provenance("scripts/35_serialization.py", [
            "services/gateway/**/_jsonable", "extract/response-shapes.json"]),
        "summary": {
            "serializer_variants": len(rules),
            "endpoints_typed": len(endpoints),
            "fields_typed": sum(len(e["fields"]) for e in endpoints),
            "json_type_histogram": dict(sorted(hist.items())),
            "numeric_fields_that_arrive_as_string": len(set(decimal_fields)),
        },
        "headline": "Every `numeric` column arrives as a JSON STRING, not a number. "
                    "Generating `f64` from extract/db-schema.json will fail to deserialize. "
                    "Use a string-backed decimal type.",
        "serializer_rules": rules,
        "serializer_inconsistency": {
            "finding": "the `_jsonable` helper is copy-pasted across repositories and the "
                       "copies differ: only services/gateway/repository/event_store.py "
                       "stringifies UUID. Elsewhere a raw UUID reaches the JSON encoder.",
            "variants_without_uuid_handling": [f"{r['module']}:{r['line']}"
                                               for r in inconsistent],
            "portal_impact": "treat any uuid-typed column as `String` and tolerate both "
                             "quoted and unquoted forms until confirmed per endpoint.",
        },
        "type_map": {k: {"json_type": v[0], "rust_type": v[1], "note": v[2]}
                     for k, v in TYPE_MAP.items()},
        "numeric_fields": sorted(set(decimal_fields)),
        "endpoints": endpoints,
    }
    p = write_json("serialization-contract.json", payload)

    md = ["# Serialization contract — PostgreSQL → JSON → Rust", "",
          "> **`numeric` arrives as a JSON string.** `_jsonable()` calls `str()` on every",
          "> `Decimal` before encoding. Declaring `f64` in Rust will fail to deserialize.", "",
          "## Type map", "",
          "| PostgreSQL | JSON wire | Rust | Why |", "|---|---|---|---|"]
    for k, (j, r, why) in TYPE_MAP.items():
        md.append(f"| `{k}` | `{j}` | `{r}` | {why} |")
    md += ["", f"## Fields affected ({len(set(decimal_fields))} numeric columns)", "",
           ", ".join(f"`{x}`" for x in sorted(set(decimal_fields))[:60]), "",
           "## Per-endpoint field types", ""]
    for e in endpoints:
        md.append(f"### {e['method']} `{e['path']}` — `{e['from_table']}`\n")
        md.append("| Field | PostgreSQL | JSON | Rust |")
        md.append("|---|---|---|---|")
        for f in e["fields"]:
            md.append("| `{n}` | `{p}` | `{j}` | `{r}` |".format(
                n=f["name"], p=f["pg_type"] or "—", j=f["json_type"], r=f["rust_type"]))
        md.append("")
    write_text("serialization-contract.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print("inconsistent _jsonable copies:", len(inconsistent))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
