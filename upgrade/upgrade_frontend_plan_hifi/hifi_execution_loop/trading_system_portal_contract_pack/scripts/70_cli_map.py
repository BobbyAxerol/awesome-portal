#!/usr/bin/env python3
"""70_cli_map.py — CLI command -> underlying access path (HTTP / Postgres / Redis).

Handoff §7.6: "CLI chỉ là client" — the Portal must call the same underlying API the
CLI calls, never a shell. That only holds for CLI actions that go over HTTP. This
script classifies every CLI subcommand by the access path its handler actually uses,
so the Portal knows which operator capabilities have NO safe API equivalent today.

Method: AST-parse `cli/__main__.py`; build the argparse subcommand tree; for each
`cmd_*` handler, walk the call graph one level and record HTTP helper calls
(`_get`/`_post`/`_patch`/…), direct `psql`/asyncpg usage and `redis` usage.

READ-ONLY: AST only. No CLI command is executed.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

CLI = TS_ROOT / "cli" / "__main__.py"

HTTP_HELPERS = re.compile(r"^_?(get|post|patch|put|delete|request|api_|http_)", re.I)
# Precise call-site markers. Loose substrings like "redis" produce false positives:
# `_show()` merely *prints* the word "redis" when rendering a health payload.
PG_MARKERS = re.compile(r"\b(asyncpg\.|psycopg|_pg_conn|_db_conn|_pg_fetch|"
                        r"\.fetchrow\(|\.fetchval\(|\.fetch\(|psql)\b")
REDIS_MARKERS = re.compile(r"\b(_redis_client\(|redis_sync\.|\.xadd\(|\.xlen\(|\.xrange\(|"
                           r"\.hset\(|\.hget\(|\.hgetall\(|\.smembers\(|\.sismember\(|"
                           r"\.scan_iter\(|\.keys\()")
# Presentation/transport helpers carry no access semantics of their own.
NEUTRAL_HELPERS = {"_show", "_table", "_print", "_emit", "_confirm_mutation", "_clean_payload",
                   "_parse_json_arg", "_split_csv", "_base_url", "_admin_headers"}

# Risk tiers per handoff §6.5. NOTE: these tiers are a PROPOSED Portal-side mapping —
# Trading System does not declare a risk tier on any command. Ordered most-severe first
# so a protective/expansion verb is never swallowed by a generic read verb.
TIER_RULES = [
    (re.compile(r"(emergency|halt|reduce|close)", re.I), "R3_LIVE_PROTECTIVE"),
    (re.compile(r"(activate|promote|scale)", re.I), "R4_LIVE_EXPANSION"),
    (re.compile(r"(sync|reconcile|certif)", re.I), "R2_SANDBOX"),
    (re.compile(r"(seed|allocate|create|register|upsert|rebalance|withdraw|release|"
                r"resume|start|apply|run|set-|^set$|deposit)", re.I), "R1_PAPER_MUTATION"),
    (re.compile(r"(inspect|list|get|state|history|show|report|findings|dashboard|summary|"
                r"trace|health|bindings|exposure|decision|events|compare|jobs|lifecycle|"
                r"export|diff|alerts|activity|journal|dead-letters|streams|retention|scan|"
                r"profile|policies|audit|account|portfolio|instrument|plan|authority|"
                r"alpha-auth|trading-state)", re.I), "R0_READ"),
]


def classify_tier(cmd: str, action: str) -> str:
    text = f"{cmd} {action}"
    for rx, tier in TIER_RULES:
        if rx.search(text):
            return tier
    return "UNCLASSIFIED"


def build_parser_tree(tree: ast.AST) -> dict:
    """Recover `sub.add_parser("x")` / nested `x_sub.add_parser("y")` structure."""
    var_to_name: dict[str, str] = {}
    parent_of_subparsers: dict[str, str] = {}
    commands: dict[str, dict] = {}

    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.Call):
            continue
        call = node.value
        fn = getattr(call.func, "attr", "")
        target = node.targets[0]
        tname = target.id if isinstance(target, ast.Name) else None
        if fn == "add_subparsers":
            owner = getattr(call.func.value, "id", None)
            if tname and owner:
                parent_of_subparsers[tname] = var_to_name.get(owner, owner)
        elif fn == "add_parser" and call.args:
            arg = call.args[0]
            if not (isinstance(arg, ast.Constant) and isinstance(arg.value, str)):
                continue
            name = arg.value
            owner = getattr(call.func.value, "id", "")
            parent = parent_of_subparsers.get(owner)
            if tname:
                var_to_name[tname] = name
            if parent in (None, "parser", "sub"):
                commands.setdefault(name, {"command": name, "actions": [], "line": node.lineno})
            else:
                commands.setdefault(parent, {"command": parent, "actions": [], "line": node.lineno})
                commands[parent]["actions"].append({"action": name, "line": node.lineno})

    # bare `x_sub.add_parser("y")` used as an expression (no assignment)
    for node in ast.walk(tree):
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if getattr(call.func, "attr", "") == "add_parser" and call.args:
                arg = call.args[0]
                owner = getattr(call.func.value, "id", "")
                parent = parent_of_subparsers.get(owner)
                if isinstance(arg, ast.Constant) and parent and parent not in ("parser", "sub"):
                    commands.setdefault(parent, {"command": parent, "actions": [], "line": node.lineno})
                    if arg.value not in [a["action"] for a in commands[parent]["actions"]]:
                        commands[parent]["actions"].append({"action": arg.value,
                                                            "line": node.lineno})
    return commands


def handler_access(tree: ast.AST) -> dict[str, dict]:
    """Per `cmd_*` handler: which HTTP paths / DB / Redis surfaces it touches."""
    funcs = {n.name: n for n in ast.walk(tree)
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    out: dict[str, dict] = {}
    for name, node in funcs.items():
        if not name.startswith("cmd_"):
            continue
        seg = ast.unparse(node)
        paths = sorted(set(re.findall(r'["\'](/v1/[^"\'\s]*)["\']', seg)))
        # follow one level into local helpers this handler calls
        called = {getattr(c.func, "id", "") for c in ast.walk(node) if isinstance(c, ast.Call)}
        for helper in called:
            if helper in funcs and helper != name and helper not in NEUTRAL_HELPERS:
                hseg = ast.unparse(funcs[helper])
                paths.extend(re.findall(r'["\'](/v1/[^"\'\s]*)["\']', hseg))
                seg += "\n" + hseg
        uses_http = bool(paths) or any(
            HTTP_HELPERS.match(h) for h in called if h.startswith("_"))
        uses_pg = bool(PG_MARKERS.search(seg))
        uses_redis = bool(REDIS_MARKERS.search(seg))
        access = [k for k, v in (("HTTP", uses_http), ("POSTGRES_DIRECT", uses_pg),
                                 ("REDIS_DIRECT", uses_redis)) if v]
        out[name] = {
            "handler": name,
            "source": f"cli/__main__.py:{node.lineno}",
            "access_paths": access or ["UNKNOWN"],
            "http_paths": sorted(set(paths)),
            "portal_reachable": "YES" if access == ["HTTP"] else (
                "NO — no HTTP equivalent" if "HTTP" not in access else "PARTIAL — mixed access"),
        }
    return out


def main() -> int:
    tree = ast.parse(CLI.read_text(errors="replace"))
    commands = build_parser_tree(tree)
    handlers = handler_access(tree)

    api_paths = set()
    api_file = OUT_DIR / "api-surface.json"
    if api_file.exists():
        api_paths = {o["path"] for o in json.loads(api_file.read_text())["operations"]}

    rows = []
    for cmd, meta in sorted(commands.items()):
        h = handlers.get(f"cmd_{cmd.replace('-', '_')}", {})
        actions = meta["actions"] or [{"action": "<root>", "line": meta["line"]}]
        for a in actions:
            hp = h.get("http_paths", [])
            unknown = [p for p in hp if p.rstrip("/") not in api_paths and
                       not any(p.startswith(x.split("{")[0]) for x in api_paths)]
            rows.append({
                "command": cmd,
                "action": a["action"],
                "risk_tier_proposed": classify_tier(cmd, a["action"]),
                "handler": h.get("handler"),
                "access_paths": h.get("access_paths", ["UNKNOWN"]),
                "http_paths": hp,
                "portal_reachable": h.get("portal_reachable", "UNKNOWN"),
                "http_paths_not_in_openapi": unknown,
                "source": h.get("source"),
            })

    by_access: dict[str, int] = {}
    for r in rows:
        by_access[",".join(r["access_paths"])] = by_access.get(",".join(r["access_paths"]), 0) + 1

    payload = {
        "provenance": provenance("scripts/70_cli_map.py",
                                 ["cli/__main__.py", "extract/api-surface.json"]),
        "summary": {
            "cli_command_groups": len(commands),
            "cli_actions": len(rows),
            "by_access_path": dict(sorted(by_access.items())),
            "actions_with_no_http_equivalent": sum(
                1 for r in rows if "HTTP" not in r["access_paths"]),
            "by_risk_tier_proposed": {t: sum(1 for r in rows if r["risk_tier_proposed"] == t)
                             for t in sorted({r["risk_tier_proposed"] for r in rows})},
        },
        "note": "`portal_reachable: NO` means the operator capability exists only through "
                "direct Postgres/Redis access from the CLI host. The Portal is forbidden from "
                "that path (handoff §2.3), so these are genuine capability gaps, not just "
                "convenience gaps.",
        "commands": rows,
        "handlers": handlers,
    }
    p = write_json("cli-command-map.json", payload)

    md = ["# CLI → underlying access path", "",
          "Portal may only use the HTTP column. `POSTGRES_DIRECT` / `REDIS_DIRECT` rows have no",
          "API equivalent and are therefore capability gaps for the Portal.", "",
          "| Command | Action | Tier (proposed) | Access | HTTP paths | Portal reachable |",
          "|---|---|---|---|---|---|"]
    for r in rows:
        md.append("| `{c}` | `{a}` | {t} | {ac} | {hp} | {pr} |".format(
            c=r["command"], a=r["action"], t=r["risk_tier_proposed"],
            ac=", ".join(r["access_paths"]),
            hp=", ".join(f"`{x}`" for x in r["http_paths"][:3]) or "—",
            pr=r["portal_reachable"]))
    write_text("cli-command-map.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
