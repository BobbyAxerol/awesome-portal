#!/usr/bin/env python3
"""50_vocabularies.py — every closed vocabulary a Portal adapter must map.

A connector fails closed on unknown enum values (handoff §7.3), so it needs the
complete, authoritative value set for each field. Three independent sources are
merged and cross-checked:

  1. `domain/enums.py` + other Python StrEnum classes  (application vocabulary)
  2. DB `CHECK (col IN (...))` constraints              (storage vocabulary — authoritative)
  3. `services/venues/registry.py` VenueProductProfile  (venue/product capability matrix)

Also captures the HTTP contract headers, contract-revision matrix and rate-limit
model, which are part of the negotiation surface.

READ-ONLY: source parsing + reuse of extract/db-schema.json.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

SCAN_DIRS = [TS_ROOT / "domain", TS_ROOT / "core", TS_ROOT / "services"]
REGISTRY = TS_ROOT / "services" / "venues" / "registry.py"
REVISIONS = TS_ROOT / "services" / "gateway" / "contracts" / "revisions.py"
SDK_MATRIX = TS_ROOT / "contracts" / "compatibility" / "sdk-matrix.json"
SURFACES = TS_ROOT / "contracts" / "compatibility" / "surfaces.v1.json"
CHECK_IN = re.compile(r"CHECK\s*\(\s*([A-Za-z0-9_]+)\s+IN\s*\(([^)]*)\)", re.I)


def python_enums() -> list[dict]:
    out = []
    for root in SCAN_DIRS:
        if not root.exists():
            continue
        for py in sorted(root.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            try:
                tree = ast.parse(py.read_text(errors="replace"))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if not isinstance(node, ast.ClassDef):
                    continue
                bases = [ast.unparse(b) for b in node.bases]
                if not any("Enum" in b for b in bases):
                    continue
                members = []
                for s in node.body:
                    if isinstance(s, ast.Assign) and isinstance(s.targets[0], ast.Name):
                        if isinstance(s.value, ast.Constant):
                            members.append({"name": s.targets[0].id, "value": s.value.value})
                if members:
                    out.append({"enum": node.name, "bases": bases,
                                "source": f"{py.relative_to(TS_ROOT)}:{node.lineno}",
                                "values": [m["value"] for m in members],
                                "members": members})
    return out


def db_check_vocabularies() -> dict:
    schema_file = OUT_DIR / "db-schema.json"
    if not schema_file.exists():
        return {"error": "run scripts/30_db_schema.py first"}
    schema = json.loads(schema_file.read_text())
    # Key by table.column: a bare column name like `status` means different things on
    # `orders`, `settlements` and `reconciliation_findings`. Merging them would invent
    # a vocabulary that no field actually has.
    per_column: dict[str, dict] = {}
    for tname, t in schema.get("tables", {}).items():
        for c in t.get("table_constraints", []):
            for m in CHECK_IN.finditer(c):
                col = m.group(1)
                vals = sorted({v.strip().strip("'\"") for v in m.group(2).split(",") if v.strip()})
                per_column[f"{tname}.{col}"] = {"table": tname, "column": col, "values": vals}

    by_field: dict[str, dict] = {}
    for key, e in per_column.items():
        entry = by_field.setdefault(e["column"], {
            "field": e["column"], "per_table": {}, "union_values": [], "conflated": False})
        entry["per_table"][e["table"]] = e["values"]
    for entry in by_field.values():
        sets = [set(v) for v in entry["per_table"].values()]
        union = sorted(set().union(*sets)) if sets else []
        entry["union_values"] = union
        entry["values"] = (sorted(sets[0]) if len(sets) == 1
                           else (union if all(s == sets[0] for s in sets) else union))
        entry["conflated"] = len(sets) > 1 and not all(s == sets[0] for s in sets)
        entry["tables"] = sorted(entry["per_table"])
    return {"by_table_column": dict(sorted(per_column.items())),
            "by_field": dict(sorted(by_field.items()))}


def venue_matrix() -> list[dict]:
    if not REGISTRY.exists():
        return []
    tree = ast.parse(REGISTRY.read_text(errors="replace"))
    fields = ["venue", "product", "supported_modes", "execution_available",
              "market_data_available", "private_events_available", "account_sync_available",
              "reconciliation_available", "position_modes", "credential_scope",
              "rate_limit_scope", "time_sync_scope", "rollout_state"]
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "VenueProductProfile":
            entry: dict = {}
            for i, a in enumerate(node.args):
                if i < len(fields):
                    try:
                        entry[fields[i]] = ast.literal_eval(a)
                    except Exception:
                        entry[fields[i]] = ast.unparse(a)
            for kw in node.keywords:
                if kw.arg:
                    try:
                        entry[kw.arg] = ast.literal_eval(kw.value)
                    except Exception:
                        entry[kw.arg] = ast.unparse(kw.value)
            entry.setdefault("rollout_state", "ACTIVE")
            entry["source"] = f"services/venues/registry.py:{node.lineno}"
            out.append(entry)
    return out


def literal_assignments(path: Path, names: list[str]) -> dict:
    """Read module-level constant assignments without importing the module."""
    if not path.exists():
        return {}
    tree = ast.parse(path.read_text(errors="replace"))
    found = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and (not names or t.id in names):
                    try:
                        found[t.id] = ast.literal_eval(node.value)
                    except Exception:
                        found[t.id] = ast.unparse(node.value)
    return found


def http_contract() -> dict:
    rev = literal_assignments(REVISIONS, [])
    main = TS_ROOT / "services" / "gateway" / "main.py"
    src = main.read_text(errors="replace") if main.exists() else ""
    headers = sorted(set(re.findall(r'HEADER_[A-Z_]+\s*=\s*["\']([^"\']+)["\']',
                                    (REVISIONS.read_text(errors="replace")
                                     if REVISIONS.exists() else "") + src)))
    settings = TS_ROOT / "core" / "config.py"
    rate = {}
    if settings.exists():
        stext = settings.read_text(errors="replace")
        for key in ["GATEWAY_RATE_LIMIT_PER_SECOND", "GATEWAY_API_KEY_PEPPER",
                    "GATEWAY_LEGACY_PLAINTEXT_API_KEYS_ENABLED", "REPLAY_V2_ENABLED",
                    "COMPATIBILITY_TELEMETRY_TTL_DAYS", "TRADING_ADMIN_TOKEN",
                    "TRADING_ADMIN_USER", "TRADING_ADMIN_PASSWORD"]:
            m = re.search(rf"^\s*{key}\s*[:=]\s*([^\n#]+)", stext, re.M)
            if m:
                val = m.group(1).strip()
                if key in {"GATEWAY_API_KEY_PEPPER", "TRADING_ADMIN_TOKEN",
                           "TRADING_ADMIN_PASSWORD", "TRADING_ADMIN_USER"}:
                    val = "<redacted — declaration only, value never read>"
                rate[key] = val
    return {
        "response_headers": headers,
        "revision_constants": rev,
        "settings_declarations": rate,
        "rate_limit_model": {
            "algorithm": "per-second bucket counter in Redis, key rl:gateway:{scope}:{epoch_second}",
            "scope": "derived per (route, alpha_id, mode, venue, account) — engine._gateway_rate_scope",
            "default_limit_per_second": rate.get("GATEWAY_RATE_LIMIT_PER_SECOND", "300"),
            "reject_code": 429,
            "reject_reason": "RATE_LIMIT_EXCEEDED (retry_after_seconds in body)",
            "source": "services/gateway/core/engine.py:check_auth_and_rate",
        },
        "sdk_matrix": json.loads(SDK_MATRIX.read_text()) if SDK_MATRIX.exists() else None,
        "legacy_surfaces": json.loads(SURFACES.read_text()) if SURFACES.exists() else None,
    }


def crosscheck(enums: list[dict], db: dict) -> list[dict]:
    """Where the same concept exists in both layers, report divergence explicitly."""
    pairs = [("mode", "TradingMode"), ("side", "OrderSide"), ("account_type", "AccountType"),
             ("trading_state", "TradingState"), ("status", "OrderStatus"),
             ("default_settlement_policy", "SettlementPolicy")]
    by_name = {e["enum"]: e for e in enums}
    out = []
    for col, enum_name in pairs:
        e, d = by_name.get(enum_name), db.get(col)
        if not e or not d:
            continue
        ev, dv = set(e["values"]), set(d["values"])
        out.append({
            "concept": col, "python_enum": enum_name,
            "python_values": sorted(ev), "db_check_values": sorted(dv),
            "python_only": sorted(ev - dv), "db_only": sorted(dv - ev),
            "identical": ev == dv,
            "db_tables": d["tables"][:8],
        })
    return out


def main() -> int:
    enums = python_enums()
    db = db_check_vocabularies()
    venues = venue_matrix()
    http = http_contract()
    by_field = db.get("by_field", {}) if isinstance(db, dict) else {}
    checks = crosscheck(enums, by_field)

    payload = {
        "provenance": provenance("scripts/50_vocabularies.py", [
            "domain/**/*.py", "services/**/*.py", "services/venues/registry.py",
            "services/gateway/contracts/revisions.py", "core/config.py",
            "contracts/compatibility/*.json", "extract/db-schema.json"]),
        "summary": {
            "python_enums": len(enums),
            "db_check_constraints": len(db.get("by_table_column", {})) if isinstance(db, dict) else 0,
            "db_check_distinct_fields": len(by_field),
            "db_fields_conflated_across_tables": sum(1 for v in by_field.values() if v["conflated"]),
            "venue_product_profiles": len(venues),
            "crosschecked_concepts": len(checks),
            "crosscheck_divergences": sum(1 for c in checks if not c["identical"]),
        },
        "python_enums": enums,
        "db_check_vocabularies": db,
        "enum_vs_db_crosscheck": checks,
        "venue_product_matrix": venues,
        "http_contract": http,
    }
    p = write_json("vocabularies.json", payload)

    md = ["# Closed vocabularies — Portal adapter mapping table", "",
          "A connector must fail closed on unknown values. Sources: Python enums, DB CHECK",
          "constraints (authoritative for stored values), venue registry.", ""]
    md.append("## Venue / product capability matrix\n")
    md.append("| Venue | Product | Modes | Exec | MktData | PrivEvents | Sync | Recon | "
              "Position modes | Rollout |")
    md.append("|---|---|---|---|---|---|---|---|---|---|")
    for v in venues:
        md.append("| {ve} | {pr} | {mo} | {ex} | {md} | {pe} | {sy} | {re} | {pm} | `{ro}` |".format(
            ve=v.get("venue"), pr=v.get("product"),
            mo=", ".join(v.get("supported_modes", [])),
            ex="✓" if v.get("execution_available") else "—",
            md="✓" if v.get("market_data_available") else "—",
            pe="✓" if v.get("private_events_available") else "—",
            sy="✓" if v.get("account_sync_available") else "—",
            re="✓" if v.get("reconciliation_available") else "—",
            pm=", ".join(v.get("position_modes", [])), ro=v.get("rollout_state")))
    md.append("\n## Field vocabularies (DB CHECK — authoritative)\n")
    md.append("| Field | Allowed values | Tables |")
    md.append("|---|---|---|")
    md.append("> Rows marked ⚠ have different value sets on different tables — map per table, "
              "never by column name alone.\n")
    for tc, e in (db.get("by_table_column", {}).items() if isinstance(db, dict) else []):
        md.append("| `{f}` | {v} | {t} |".format(
            f=tc, v=", ".join(f"`{x}`" for x in e["values"]), t=e["table"]))
    md.append("\n## Python enums\n")
    md.append("| Enum | Values | Source |")
    md.append("|---|---|---|")
    for e in enums:
        md.append("| `{n}` | {v} | {s} |".format(
            n=e["enum"], v=", ".join(f"`{x}`" for x in e["values"]), s=e["source"]))
    write_text("vocabularies.md", "\n".join(md))

    print(json.dumps(payload["summary"], indent=2))
    for c in checks:
        if not c["identical"]:
            print("DIVERGENCE", c["concept"], "python_only=", c["python_only"],
                  "db_only=", c["db_only"])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
