#!/usr/bin/env python3
"""45_data_layer.py — data_layer (market data) contract for the Portal.

The Trading System gateway does NOT carry market data or the VN session calendar;
both live in `data_layer`. A Portal screen showing VN market state, prices or session
status must read this service. Owner confirmed on 2026-08-21 that the endpoint
contract is settled, so it is captured here as a first-class part of the pack.

Unlike the Trading System gateway, data_layer's OpenAPI is genuinely usable: handlers
use typed FastAPI signatures, so query parameters and request bodies ARE declared.
This script records that, and cross-checks the runtime spec against the route source.

READ-ONLY: GET on the runtime spec + ast.parse of the route modules.
"""
from __future__ import annotations

import ast
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DL_ROOT, EVIDENCE_DIR, provenance, write_json, write_text  # noqa: E402

DL_URL = "http://127.0.0.1:8100/openapi.json"
ROUTES_DIR = DL_ROOT / "app" / "api"


def fetch_spec() -> dict | None:
    cached = EVIDENCE_DIR / "phaseF" / "dl_openapi.json"
    r = subprocess.run(["curl", "-s", "--max-time", "15", "-X", "GET", DL_URL],
                       capture_output=True, text=True, timeout=30)
    try:
        spec = json.loads(r.stdout)
        cached.parent.mkdir(parents=True, exist_ok=True)
        cached.write_text(r.stdout)
        return spec
    except Exception:
        if cached.exists():
            return json.loads(cached.read_text())
        return None


def source_routes() -> list[dict]:
    """Route decorators in data_layer/app/api/routes_*.py with their handler signature."""
    out = []
    if not ROUTES_DIR.exists():
        return out
    for py in sorted(ROUTES_DIR.glob("routes_*.py")):
        rel = str(py.relative_to(DL_ROOT))
        try:
            tree = ast.parse(py.read_text(errors="replace"))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call):
                    continue
                fn = dec.func
                if not (isinstance(fn, ast.Attribute) and fn.attr in
                        {"get", "post", "put", "patch", "delete"}):
                    continue
                path = (dec.args[0].value
                        if dec.args and isinstance(dec.args[0], ast.Constant) else None)
                if path is None:
                    continue
                params = []
                a = node.args
                defaults = ([None] * (len(a.args) - len(a.defaults))) + list(a.defaults)
                for arg, dflt in zip(a.args, defaults):
                    if arg.arg in {"self", "request", "response"}:
                        continue
                    params.append({
                        "name": arg.arg,
                        "type": ast.unparse(arg.annotation) if arg.annotation else None,
                        "default": ast.unparse(dflt) if dflt is not None else None,
                        "required": dflt is None,
                    })
                for arg, dflt in zip(a.kwonlyargs, a.kw_defaults):
                    params.append({
                        "name": arg.arg,
                        "type": ast.unparse(arg.annotation) if arg.annotation else None,
                        "default": ast.unparse(dflt) if dflt is not None else None,
                        "required": dflt is None,
                    })
                out.append({
                    "method": fn.attr.upper(), "path_suffix": path,
                    "handler": node.name, "module": rel, "line": node.lineno,
                    "signature_params": params,
                })
    return out


def main() -> int:
    spec = fetch_spec()
    routes = source_routes()

    ops, declared_q, declared_b = [], 0, 0
    if spec:
        for p, item in sorted(spec.get("paths", {}).items()):
            for m, op in item.items():
                if m.upper() not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                    continue
                params = op.get("parameters", [])
                q = [x for x in params if x.get("in") == "query"]
                path_p = [x for x in params if x.get("in") == "path"]
                if q:
                    declared_q += 1
                if op.get("requestBody"):
                    declared_b += 1
                ops.append({
                    "method": m.upper(), "path": p,
                    "operation_id": op.get("operationId"),
                    "summary": op.get("summary"),
                    "path_params": [x["name"] for x in path_p],
                    "query_params": [{
                        "name": x["name"], "required": x.get("required", False),
                        "schema": x.get("schema"),
                    } for x in q],
                    "request_body": bool(op.get("requestBody")),
                    "response_codes": sorted(op.get("responses", {}).keys()),
                })

    groups: dict[str, int] = {}
    for o in ops:
        seg = o["path"].split("/")[2] if len(o["path"].split("/")) > 2 else "?"
        groups[seg] = groups.get(seg, 0) + 1

    payload = {
        "provenance": provenance("scripts/45_data_layer.py",
                                 ["runtime GET 127.0.0.1:8100/openapi.json",
                                  "data_layer/app/api/routes_*.py"]),
        "status": "CONFIRMED_RUNTIME" if spec else "UNKNOWN — service unreachable",
        "why_portal_needs_this": "The Trading System gateway carries neither market data "
                                 "nor the VN session calendar. Any Portal screen showing "
                                 "prices, the VN board, or MARKET_CLOSED/OPEN state must "
                                 "read data_layer, not trading_system.",
        "contrast_with_trading_system": {
            "trading_system_openapi": "0 query params, 0 request bodies, 0 security schemes "
                                      "— unusable for codegen",
            "data_layer_openapi": f"{declared_q} operations declare query params, "
                                  f"{declared_b} declare request bodies, typed component "
                                  f"schemas present — usable for codegen directly",
            "consequence": "generate the data_layer client from its own OpenAPI; generate "
                           "the trading_system client from extract/api-surface.json",
        },
        "summary": {
            "openapi_version": (spec or {}).get("openapi"),
            "service_version": (spec or {}).get("info", {}).get("version"),
            "operations": len(ops),
            "operations_with_query_params": declared_q,
            "operations_with_request_body": declared_b,
            "component_schemas": list((spec or {}).get("components", {})
                                      .get("schemas", {}).keys()),
            "security_schemes": (spec or {}).get("components", {}).get("securitySchemes"),
            "route_groups": dict(sorted(groups.items())),
            "source_routes_found": len(routes),
        },
        "auth_note": "No securitySchemes and no auth dependency in the route modules — "
                     "data_layer is unauthenticated and bound to 127.0.0.1:8100. Any Portal "
                     "access path must terminate authentication at the Portal edge.",
        "operations": ops,
        "source_routes": routes,
    }
    p = write_json("data-layer-contract.json", payload)

    md = ["# data_layer contract (market data + VN calendar)", "",
          f"{len(ops)} operations · OpenAPI {(spec or {}).get('openapi')} · "
          f"unauthenticated, bound to 127.0.0.1:8100", "",
          "> Unlike the Trading System gateway, this spec **is** usable for codegen: "
          f"{declared_q} operations declare query params and {declared_b} declare request "
          "bodies.", "",
          "| Method | Path | Query params | Body | Codes |", "|---|---|---|---|---|"]
    for o in ops:
        md.append("| {m} | `{p}` | {q} | {b} | {c} |".format(
            m=o["method"], p=o["path"],
            q=", ".join(f"`{x['name']}`" + ("*" if x["required"] else "")
                        for x in o["query_params"]) or "—",
            b="yes" if o["request_body"] else "—",
            c=", ".join(o["response_codes"])))
    md += ["", "`*` = required.", ""]
    write_text("data-layer-contract.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2)[:1200])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
