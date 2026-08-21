#!/usr/bin/env python3
"""10_api_surface.py — extract the REAL HTTP contract of the Trading System gateway.

Why this exists: the runtime OpenAPI 3.1 document declares 91 paths but ZERO query
parameters and ZERO requestBody schemas (FastAPI `Request`-only handlers). A Portal
connector cannot be built from that spec alone. This script reads the handler source
with Python's `ast` module and recovers, per operation:

  * HTTP method + path + handler symbol + source line
  * auth gate actually enforced (admin token / alpha api-key / replay scope / public)
  * query parameters actually read (`request.query_params.get("...")`) + aliases
  * request body fields actually read (`body.get(...)`, `payload.get(...)`, ...)
  * literal response keys returned and explicit HTTP status codes
  * declared OpenAPI response codes for cross-check

READ-ONLY: parses files only. Never imports or executes Trading System code.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TS_ROOT, provenance, write_json, write_text  # noqa: E402

GATEWAY = TS_ROOT / "services" / "gateway" / "main.py"

AUTH_GATES = {
    "require_admin": ("ADMIN", "X-Admin-Token (or admin user/pass)"),
    "_require_alpha_read": ("ALPHA_KEY", "X-API-Key (alpha read scope)"),
    "_require_alpha_replay_scope": ("ALPHA_REPLAY", "X-API-Key (alpha replay scope)"),
    "check_auth_and_rate": ("ALPHA_KEY", "X-API-Key + per-route rate limit"),
}

# engine.* helpers whose implementation calls check_auth_and_rate internally.
# Verified in services/gateway/core/engine.py (validate_single:255, validate_bulk:337,
# validate_update:425, validate_cancel:498, query_order:558, list_* :581).
ENGINE_AUTH_METHODS = re.compile(
    r"engine\.(check_auth_and_rate|validate_single|validate_bulk|validate_update|"
    r"validate_cancel|query_order|submit|submit_bulk|update|cancel|list_orders|"
    r"get_order|list_fills|list_positions|preflight|balances)\b"
)


def _call_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Call):
        f = node.func
        if isinstance(f, ast.Name):
            return f.id
        if isinstance(f, ast.Attribute):
            parts = []
            cur: ast.AST = f
            while isinstance(cur, ast.Attribute):
                parts.append(cur.attr)
                cur = cur.value
            if isinstance(cur, ast.Name):
                parts.append(cur.id)
            return ".".join(reversed(parts))
    return None


def _const_str(node: ast.AST) -> str | None:
    return node.value if isinstance(node, ast.Constant) and isinstance(node.value, str) else None


class HandlerScan(ast.NodeVisitor):
    """Collect params / body fields / headers / responses inside one handler."""

    def __init__(self) -> None:
        self.query_params: list[str] = []
        self.body_fields: list[str] = []
        self.headers: list[str] = []
        self.auth: list[str] = []
        self.status_codes: list[int] = []
        self.response_keys: list[str] = []
        self.calls: list[str] = []

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        name = _call_name(node)
        if name:
            self.calls.append(name)
            base = name.split(".")[-1]
            if name in AUTH_GATES:
                self.auth.append(name)
            elif ENGINE_AUTH_METHODS.search(name):
                self.auth.append("check_auth_and_rate")

            arg0 = _const_str(node.args[0]) if node.args else None
            if arg0:
                if name.endswith("query_params.get") or name.endswith("params.get"):
                    self.query_params.append(arg0)
                elif name.endswith("headers.get"):
                    self.headers.append(arg0)
                elif base == "get" and re.match(
                    r"^(body|payload|data|raw|raw_data|req|request_body|spec|item|entry|doc)"
                    r"(\.[a-z_]+)*\.get$",
                    name,
                ):
                    self.body_fields.append(arg0)

        # JSONResponse(status_code=..., ...)
        for kw in node.keywords:
            if kw.arg == "status_code" and isinstance(kw.value, ast.Constant):
                if isinstance(kw.value.value, int):
                    self.status_codes.append(kw.value.value)
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript) -> None:  # noqa: N802
        # body["field"] / params["field"] style access
        key = _const_str(node.slice)
        val = node.value
        if key and isinstance(val, ast.Name) and val.id in {
            "body", "payload", "data", "raw", "raw_data", "spec",
        }:
            self.body_fields.append(key)
        self.generic_visit(node)

    def visit_Return(self, node: ast.Return) -> None:  # noqa: N802
        if isinstance(node.value, ast.Dict):
            for k in node.value.keys:
                s = _const_str(k) if k is not None else None
                if s:
                    self.response_keys.append(s)
        self.generic_visit(node)


def scan_module(path: Path) -> list[dict]:
    src = path.read_text(errors="replace")
    tree = ast.parse(src)
    # Some routes are thin aliases that delegate to another handler
    # (e.g. POST /v1/execution-sessions/{id} -> v1_update_execution_session).
    # Scanning the alias body alone would report it as unauthenticated, so resolve
    # one level of handler-to-handler delegation before classifying auth.
    handlers = {n.name: n for n in tree.body
                if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))}
    ops: list[dict] = []
    for node in tree.body:
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        for dec in node.decorator_list:
            if not isinstance(dec, ast.Call):
                continue
            fn = dec.func
            if not (isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name)
                    and fn.value.id == "app"):
                continue
            method = fn.attr.upper()
            if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                continue
            route = _const_str(dec.args[0]) if dec.args else None
            if route is None:
                continue

            scan = HandlerScan()
            scan.visit(node)

            delegates_to = None
            if not scan.auth:
                for c in ast.walk(node):
                    if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) \
                            and c.func.id in handlers and c.func.id != node.name:
                        delegates_to = c.func.id
                        inner = HandlerScan()
                        inner.visit(handlers[delegates_to])
                        scan.auth.extend(inner.auth)
                        scan.query_params.extend(inner.query_params)
                        scan.body_fields.extend(inner.body_fields)
                        scan.headers.extend(inner.headers)
                        scan.status_codes.extend(inner.status_codes)
                        scan.response_keys.extend(inner.response_keys)
                        break

            gates = sorted(set(scan.auth))
            if gates:
                kinds = sorted({AUTH_GATES[g][0] for g in gates if g in AUTH_GATES})
                detail = "; ".join(sorted({AUTH_GATES[g][1] for g in gates if g in AUTH_GATES}))
            else:
                kinds, detail = ["PUBLIC"], "no auth gate found in handler body"

            path_params = re.findall(r"\{([^}/]+)\}", route)
            ops.append({
                "method": method,
                "path": route,
                "handler": node.name,
                "delegates_to": delegates_to,
                "source": f"services/gateway/main.py:{node.lineno}",
                "auth": {"kinds": kinds, "gates": gates, "detail": detail},
                "path_params": path_params,
                "query_params": sorted(set(scan.query_params)),
                "body_fields": sorted(set(scan.body_fields)),
                "request_headers_read": sorted(set(scan.headers)),
                "explicit_status_codes": sorted(set(scan.status_codes)),
                "literal_response_keys": sorted(set(scan.response_keys)),
                "internal_calls": sorted({c for c in scan.calls if c.startswith(
                    ("engine.", "repo.", "db.", "svc.", "service."))}),
            })
    return ops


def merge_openapi(ops: list[dict], spec_path: Path) -> dict:
    spec = json.loads(spec_path.read_text())
    declared: dict[tuple[str, str], dict] = {}
    for p, item in spec.get("paths", {}).items():
        for m, op in item.items():
            if m.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                declared[(m.upper(), p)] = op
    for o in ops:
        d = declared.get((o["method"], o["path"]))
        if d is None:
            o["openapi"] = {"declared": False}
        else:
            o["openapi"] = {
                "declared": True,
                "operation_id": d.get("operationId"),
                "summary": d.get("summary"),
                "declared_response_codes": sorted(d.get("responses", {}).keys()),
                "declared_parameters": [q.get("name") for q in d.get("parameters", [])],
                "declared_request_body": bool(d.get("requestBody")),
            }
    seen = {(o["method"], o["path"]) for o in ops}
    return {
        "spec_operation_count": len(declared),
        "source_operation_count": len(ops),
        "in_spec_not_in_source": sorted(f"{m} {p}" for (m, p) in declared if (m, p) not in seen),
        "in_source_not_in_spec": sorted(
            f"{o['method']} {o['path']}" for o in ops if not o["openapi"]["declared"]
        ),
    }


def main() -> int:
    ops = scan_module(GATEWAY)
    ops.sort(key=lambda o: (o["path"], o["method"]))
    spec_path = Path(__file__).resolve().parent.parent / "openapi.sanitized.json"
    crosscheck = merge_openapi(ops, spec_path)

    by_auth: dict[str, int] = {}
    for o in ops:
        for k in o["auth"]["kinds"]:
            by_auth[k] = by_auth.get(k, 0) + 1

    payload = {
        "provenance": provenance("scripts/10_api_surface.py",
                                 ["services/gateway/main.py", "openapi.sanitized.json"]),
        "summary": {
            "operations": len(ops),
            "by_method": {m: sum(1 for o in ops if o["method"] == m)
                          for m in sorted({o["method"] for o in ops})},
            "by_auth_kind": by_auth,
            "operations_with_query_params_in_source": sum(1 for o in ops if o["query_params"]),
            "operations_with_query_params_in_spec": sum(
                1 for o in ops if o["openapi"].get("declared_parameters")),
            "operations_with_body_fields_in_source": sum(1 for o in ops if o["body_fields"]),
            "operations_with_request_body_in_spec": sum(
                1 for o in ops if o["openapi"].get("declared_request_body")),
        },
        "spec_crosscheck": crosscheck,
        "operations": ops,
    }
    p = write_json("api-surface.json", payload)

    lines = ["| Method | Path | Auth | Query params (source) | Body fields (source) | Codes | Handler |",
             "|---|---|---|---|---|---|---|"]
    for o in ops:
        lines.append("| {m} | `{p}` | {a} | {q} | {b} | {c} | `{h}` |".format(
            m=o["method"], p=o["path"], a="/".join(o["auth"]["kinds"]),
            q=", ".join(f"`{x}`" for x in o["query_params"]) or "—",
            b=", ".join(f"`{x}`" for x in o["body_fields"]) or "—",
            c=", ".join(str(x) for x in o["explicit_status_codes"]) or "200",
            h=o["handler"]))
    write_text("api-surface.md",
               "# Trading System gateway — real HTTP surface (source-derived)\n\n"
               f"Operations: {len(ops)} | source: `services/gateway/main.py` "
               f"@ {payload['provenance']['trading_system_commit'][:12]}\n\n"
               "> OpenAPI declares 0 query params and 0 request bodies; the columns below are the\n"
               "> parameters the handlers actually read. This table is the connector contract.\n\n"
               + "\n".join(lines))
    print(json.dumps(payload["summary"], indent=2))
    print(json.dumps(crosscheck, indent=2)[:1200])
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
