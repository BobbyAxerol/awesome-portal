#!/usr/bin/env python3
"""60_error_catalog.py — every rejection/error signal a Portal connector must map.

The gateway has no RFC-7807 problem envelope; it returns bare JSON bodies whose
`reason` / `status` / `detail` strings ARE the error contract. This script recovers
that contract from source, anchored to the exact expression that produces it:

  * `_rejected_content(reason)` / `{"status": "REJECTED", "reason": ...}` literals
  * `return False, "<REASON>", <code>` tuples from the auth/risk/validation path
  * `HTTPException(status_code=..., detail=...)`
  * `RiskDenyReason` and other deny/reject enums
  * observed HTTP status codes per operation (from extract/api-surface.json)

READ-ONLY: AST + regex over source. Nothing is executed.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

SCAN = [TS_ROOT / "services", TS_ROOT / "core", TS_ROOT / "domain"]
CODE_LIKE = re.compile(r"^[A-Z][A-Z0-9_]{3,}$")


class ErrorScan(ast.NodeVisitor):
    def __init__(self, rel: str) -> None:
        self.rel = rel
        self.reasons: dict[str, dict] = {}
        self.http_exceptions: list[dict] = []

    def _add(self, code: str, kind: str, line: int, http: int | None = None) -> None:
        if not CODE_LIKE.match(code):
            return
        e = self.reasons.setdefault(code, {"code": code, "kinds": set(), "sites": [],
                                           "http_codes": set()})
        e["kinds"].add(kind)
        if len(e["sites"]) < 6:
            e["sites"].append(f"{self.rel}:{line}")
        if http:
            e["http_codes"].add(http)

    def visit_Return(self, node: ast.Return) -> None:  # noqa: N802
        v = node.value
        # `return False, "REASON", 403`
        if isinstance(v, ast.Tuple) and len(v.elts) >= 2:
            strs = [e.value for e in v.elts
                    if isinstance(e, ast.Constant) and isinstance(e.value, str)]
            ints = [e.value for e in v.elts
                    if isinstance(e, ast.Constant) and isinstance(e.value, int)
                    and 100 <= e.value < 600]
            for s in strs:
                self._add(s, "auth/validation tuple", node.lineno, ints[0] if ints else None)
        # `return {"status": "REJECTED", "reason": "X"}`
        if isinstance(v, ast.Dict):
            self._scan_dict(v, node.lineno)
        self.generic_visit(node)

    def _scan_dict(self, d: ast.Dict, line: int) -> None:
        pairs = {}
        for k, val in zip(d.keys, d.values):
            if isinstance(k, ast.Constant) and isinstance(val, ast.Constant):
                pairs[k.value] = val.value
        for key in ("reason", "status", "code", "error"):
            v = pairs.get(key)
            if isinstance(v, str):
                self._add(v, f"response body `{key}`", line)

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        fname = getattr(node.func, "id", getattr(node.func, "attr", ""))
        if fname == "_rejected_content" and node.args:
            a = node.args[0]
            if isinstance(a, ast.Constant) and isinstance(a.value, str):
                self._add(a.value, "_rejected_content", node.lineno)
        if fname == "HTTPException":
            code = detail = None
            for kw in node.keywords:
                if kw.arg == "status_code" and isinstance(kw.value, ast.Constant):
                    code = kw.value.value
                if kw.arg == "detail" and isinstance(kw.value, ast.Constant):
                    detail = kw.value.value
            self.http_exceptions.append({"http_status": code, "detail": detail,
                                         "site": f"{self.rel}:{node.lineno}"})
        if fname == "JSONResponse":
            for kw in node.keywords:
                if kw.arg == "content" and isinstance(kw.value, ast.Dict):
                    self._scan_dict(kw.value, node.lineno)
        self.generic_visit(node)



def handler_line_ranges() -> list[dict]:
    """(start, end, handler) for each gateway handler, so a reason-code site can be
    attributed to the endpoint that emits it."""
    gw = TS_ROOT / "services" / "gateway" / "main.py"
    if not gw.exists():
        return []
    tree = ast.parse(gw.read_text(errors="replace"))
    out = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            out.append({"handler": node.name, "start": node.lineno,
                        "end": getattr(node, "end_lineno", node.lineno)})
    return out


def attribute_sites(reasons: dict, ranges: list[dict], api_ops: list[dict]) -> dict:
    """reason code -> the endpoints whose handler body contains one of its call sites."""
    by_handler: dict[str, list[str]] = {}
    for o in api_ops:
        by_handler.setdefault(o["handler"], []).append(f"{o['method']} {o['path']}")
    out: dict[str, list[str]] = {}
    for code, e in reasons.items():
        eps: set[str] = set()
        for site in e["sites"]:
            if not site.startswith("services/gateway/main.py:"):
                continue
            try:
                line = int(site.rsplit(":", 1)[1])
            except ValueError:
                continue
            for r in ranges:
                if r["start"] <= line <= r["end"]:
                    eps.update(by_handler.get(r["handler"], []))
        if eps:
            out[code] = sorted(eps)
    return out


def main() -> int:
    reasons: dict[str, dict] = {}
    https: list[dict] = []
    scanned = 0
    for root in SCAN:
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
            scanned += 1
            sc = ErrorScan(rel)
            sc.visit(tree)
            https.extend(sc.http_exceptions)
            for code, e in sc.reasons.items():
                tgt = reasons.setdefault(code, {"code": code, "kinds": set(), "sites": [],
                                                "http_codes": set()})
                tgt["kinds"] |= e["kinds"]
                tgt["http_codes"] |= e["http_codes"]
                tgt["sites"].extend(e["sites"][:3])

    for e in reasons.values():
        e["kinds"] = sorted(e["kinds"])
        e["http_codes"] = sorted(e["http_codes"])
        e["sites"] = e["sites"][:8]

    # deny reasons declared as an enum are a first-class, closed vocabulary
    vocab_file = OUT_DIR / "vocabularies.json"
    deny_enums = {}
    if vocab_file.exists():
        v = json.loads(vocab_file.read_text())
        for e in v.get("python_enums", []):
            if re.search(r"(Deny|Reject|Error|Reason)", e["enum"]):
                deny_enums[e["enum"]] = {"values": e["values"], "source": e["source"]}

    # HTTP status codes actually emitted per operation
    api_file = OUT_DIR / "api-surface.json"
    status_map = {}
    if api_file.exists():
        api = json.loads(api_file.read_text())
        for o in api["operations"]:
            codes = sorted(set(o["explicit_status_codes"]) | {200})
            status_map[f"{o['method']} {o['path']}"] = codes

    api_ops = json.loads(api_file.read_text())["operations"] if api_file.exists() else []
    reason_to_endpoints = attribute_sites(reasons, handler_line_ranges(), api_ops)
    endpoint_to_reasons: dict[str, list[str]] = {}
    for code, eps in reason_to_endpoints.items():
        for ep in eps:
            endpoint_to_reasons.setdefault(ep, []).append(code)
    endpoint_to_reasons = {k: sorted(v) for k, v in sorted(endpoint_to_reasons.items())}

    code_hist: dict[str, int] = {}
    for codes in status_map.values():
        for c in codes:
            code_hist[str(c)] = code_hist.get(str(c), 0) + 1

    payload = {
        "provenance": provenance("scripts/60_error_catalog.py",
                                 ["services/**/*.py", "core/**/*.py", "domain/**/*.py",
                                  "extract/api-surface.json", "extract/vocabularies.json"]),
        "summary": {
            "modules_scanned": scanned,
            "distinct_reason_codes": len(reasons),
            "http_exception_sites": len(https),
            "deny_reason_enums": len(deny_enums),
            "reason_codes_attributed_to_an_endpoint": len(reason_to_endpoints),
            "endpoints_with_known_reason_codes": len(endpoint_to_reasons),
            "http_status_histogram": dict(sorted(code_hist.items())),
        },
        "envelope_contract": {
            "problem_json_rfc7807": "MISSING — no application/problem+json anywhere in the "
                                    "gateway; errors are bare JSON objects.",
            "reject_shape": '{"status": "REJECTED", "reason": "<REASON_CODE>", ...}'
                            " — services/gateway/main.py:_rejected_content",
            "validation_shape": 'FastAPI default {"detail": [ValidationError...]} with HTTP 422; '
                                "the only two component schemas in the whole OpenAPI document "
                                "(HTTPValidationError, ValidationError).",
            "admin_auth_shape": '{"detail": "invalid admin credentials"} HTTP 403; '
                                '{"detail": "admin auth is not configured"} HTTP 503',
            "contract_revision_shape": '{"status": "UNSUPPORTED_CONTRACT_REVISION", '
                                       '"requested_revision", "supported_revisions", '
                                       '"authoritative_revision"} HTTP 406',
            "rate_limit_shape": '{"status": "REJECTED", "reason": "RATE_LIMIT_EXCEEDED", '
                                '"retry_after_seconds": N} HTTP 429',
            "portal_mapping_note": "A Portal connector must key on `reason` (not on HTTP status "
                                   "alone) — the same 403 carries UNAUTHORIZED_ALPHA, "
                                   "INVALID_API_KEY and ACCOUNT_ALPHA_MISMATCH.",
        },
        "reason_codes": dict(sorted(reasons.items())),
        "deny_reason_enums": deny_enums,
        "http_exception_sites": https,
        "status_codes_per_operation": status_map,
        "reason_code_to_endpoints": reason_to_endpoints,
        "endpoint_to_reason_codes": endpoint_to_reasons,
        "attribution_note": "Attribution covers reason codes raised directly inside a "
                            "gateway handler body. Codes raised deeper (engine, risk, "
                            "repositories) reach many endpoints and are listed in "
                            "`reason_codes` with their defining call site instead.",
    }
    p = write_json("error-catalog.json", payload)

    md = ["# Error / rejection contract", "",
          "No RFC-7807. The `reason` string is the contract. HTTP status alone is ambiguous.", "",
          "| Reason code | Kinds | HTTP | Endpoints | Site |", "|---|---|---|---|---|"]
    for c, e in payload["reason_codes"].items():
        eps = reason_to_endpoints.get(c, [])
        md.append("| `{c}` | {k} | {h} | {e} | {s} |".format(
            c=c, k=", ".join(e["kinds"]),
            h=", ".join(str(x) for x in e["http_codes"]) or "—",
            e=(", ".join(f"`{x}`" for x in eps[:3]) +
               (f" (+{len(eps) - 3})" if len(eps) > 3 else "")) or "shared/deep",
            s=e["sites"][0] if e["sites"] else "—"))
    md += ["", "## Reason codes per endpoint", "",
           "| Endpoint | Reason codes |", "|---|---|"]
    for ep, codes in endpoint_to_reasons.items():
        md.append("| `{e}` | {c} |".format(
            e=ep, c=", ".join(f"`{x}`" for x in codes)))
    write_text("error-catalog.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
