#!/usr/bin/env python3
"""25_request_contracts.py — resolve the request body of every mutation.

`10_api_surface.py` recovers body fields only when the handler reads them directly.
19 of 48 mutations do not: they bind the whole body (`data = await request.json()`)
and hand it to a repository method or a Pydantic model. The field contract therefore
lives one level deeper. This script follows that hop:

    handler  ──binds──>  body var  ──passed to──>  Repo.method(payload)
                                   ──validated by──> PydanticModel(**data)

Resolution order per operation:
  1. direct `body.get("x")` in the handler                      (from api-surface.json)
  2. Pydantic model constructed/validated from the body var     (from payload-models.json)
  3. `payload["x"]` / `payload.get("x")` inside the callee      (searched across services/)

READ-ONLY: ast.parse only.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import OUT_DIR, TS_ROOT, provenance, write_json, write_text  # noqa: E402

GATEWAY = TS_ROOT / "services" / "gateway" / "main.py"
SEARCH_ROOTS = [TS_ROOT / "services", TS_ROOT / "core", TS_ROOT / "domain"]
BODY_BINDERS = re.compile(r"^(request\.json|_json_or_empty)$")


def unparse(n: ast.AST) -> str:
    try:
        return ast.unparse(n)
    except Exception:
        return "<unparseable>"


def index_methods() -> dict[str, list[dict]]:
    """All function/method defs across services, keyed by bare name."""
    idx: dict[str, list[dict]] = {}
    for root in SEARCH_ROOTS:
        if not root.exists():
            continue
        for py in sorted(root.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            try:
                tree = ast.parse(py.read_text(errors="replace"))
            except SyntaxError:
                continue
            rel = str(py.relative_to(TS_ROOT))
            for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
                for fn in cls.body:
                    if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        idx.setdefault(fn.name, []).append(
                            {"node": fn, "owner": cls.name, "module": rel})
            for fn in tree.body:
                if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    idx.setdefault(fn.name, []).append(
                        {"node": fn, "owner": None, "module": rel})
    return idx


def fields_from_param(fn: ast.AST, param_names: set[str]) -> list[dict]:
    """`payload["x"]`, `payload.get("x", d)`, `payload.get("x") or y` inside a callee."""
    out: dict[str, dict] = {}
    for n in ast.walk(fn):
        if isinstance(n, ast.Subscript):
            base = n.value
            key = n.slice
            if isinstance(base, ast.Name) and base.id in param_names and \
                    isinstance(key, ast.Constant) and isinstance(key.value, str):
                out.setdefault(key.value, {"name": key.value, "access": "subscript",
                                           "required": True, "default": None})
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and \
                n.func.attr == "get" and isinstance(n.func.value, ast.Name) and \
                n.func.value.id in param_names and n.args:
            k = n.args[0]
            if isinstance(k, ast.Constant) and isinstance(k.value, str):
                e = out.setdefault(k.value, {"name": k.value, "access": "get",
                                             "required": False, "default": None})
                e["required"] = False
                if len(n.args) > 1:
                    e["default"] = unparse(n.args[1])
    return sorted(out.values(), key=lambda x: x["name"])



def _via_callee_model(handler: ast.AST, methods: dict[str, list[dict]],
                      models: dict[str, dict]) -> dict | None:
    """Handler delegates validation (e.g. `engine.validate_single(data)`) and the callee
    is what constructs the Pydantic model (`AlphaOrder(**raw_data)`)."""
    for n in ast.walk(handler):
        if not isinstance(n, ast.Call):
            continue
        callee = getattr(n.func, "attr", None) or getattr(n.func, "id", None)
        for cand in methods.get(callee or "", []):
            for inner in ast.walk(cand["node"]):
                if isinstance(inner, ast.Call):
                    mname = getattr(inner.func, "id", None) or getattr(inner.func, "attr", "")
                    if mname in models and any(k.arg is None for k in inner.keywords):
                        m = models[mname]
                        return {
                            "resolution": "PYDANTIC_MODEL_VIA_CALLEE",
                            "body_vars": [],
                            "model": mname,
                            "model_source": m["source"],
                            "via": f"{cand['owner']}.{callee}" if cand["owner"] else callee,
                            "via_source": f"{cand['module']}:{cand['node'].lineno}",
                            "fields": [{"name": f["name"], "type": f["type"],
                                        "required": f["required"], "default": f["default"],
                                        "alias": f["alias"]} for f in m["fields"]],
                        }
    return None


def resolve(handler: ast.AST, methods: dict[str, list[dict]],
            models: dict[str, dict]) -> dict:
    """Find the body variable, then follow it to a model or a callee."""
    body_vars: set[str] = set()
    for n in ast.walk(handler):
        if isinstance(n, ast.Assign) and len(n.targets) == 1 and \
                isinstance(n.targets[0], ast.Name):
            v = n.value
            inner = v.value if isinstance(v, ast.Await) else v
            if isinstance(inner, ast.Call):
                name = unparse(inner.func)
                if BODY_BINDERS.match(name) or name.endswith("request.json"):
                    body_vars.add(n.targets[0].id)
    # `Model(**(await request.json()))` binds the body inline, with no variable at all.
    for n in ast.walk(handler):
        if isinstance(n, ast.Call):
            fname = getattr(n.func, "id", None) or getattr(n.func, "attr", "")
            if fname in models and any(k.arg is None for k in n.keywords):
                m = models[fname]
                return {
                    "resolution": "PYDANTIC_MODEL_INLINE",
                    "body_vars": sorted(body_vars),
                    "model": fname,
                    "model_source": m["source"],
                    "fields": [{"name": f["name"], "type": f["type"],
                                "required": f["required"], "default": f["default"],
                                "alias": f["alias"]} for f in m["fields"]],
                }

    def _is_body_expr(a: ast.AST) -> bool:
        if isinstance(a, ast.Name) and a.id in body_vars:
            return True
        inner = a.value if isinstance(a, ast.Await) else a
        return isinstance(inner, ast.Call) and (
            BODY_BINDERS.match(unparse(inner.func)) is not None
            or unparse(inner.func).endswith("request.json"))

    has_inline_body = any(
        _is_body_expr(a) for n in ast.walk(handler) if isinstance(n, ast.Call)
        for a in list(n.args) + [k.value for k in n.keywords])

    if not body_vars and not has_inline_body:
        return _via_callee_model(handler, methods, models) or {
            "resolution": "NO_REQUEST_BODY", "body_vars": [], "fields": [],
            "note": "handler reads no request body — path params only"}

    # (a) Pydantic model built from the body var
    for n in ast.walk(handler):
        if isinstance(n, ast.Call):
            fname = getattr(n.func, "id", None) or getattr(n.func, "attr", "")
            uses_body = any(
                (isinstance(a, ast.Name) and a.id in body_vars) or
                (isinstance(a, ast.Starred) and isinstance(a.value, ast.Name)
                 and a.value.id in body_vars) for a in n.args) or \
                any(isinstance(k.value, ast.Name) and k.value.id in body_vars
                    for k in n.keywords) or \
                any(k.arg is None and isinstance(k.value, ast.Name)
                    and k.value.id in body_vars for k in n.keywords)
            if uses_body and fname in models:
                m = models[fname]
                return {
                    "resolution": "PYDANTIC_MODEL",
                    "body_vars": sorted(body_vars),
                    "model": fname,
                    "model_source": m["source"],
                    "fields": [{"name": f["name"], "type": f["type"],
                                "required": f["required"], "default": f["default"],
                                "alias": f["alias"]} for f in m["fields"]],
                }

    # (b) callee that receives the body — either via a variable or inline
    #     (`svc.create(await request.json())` binds nothing to a name).
    for n in ast.walk(handler):
        if not isinstance(n, ast.Call):
            continue
        passes = [i for i, a in enumerate(n.args) if _is_body_expr(a)]
        kw = [k.arg for k in n.keywords if _is_body_expr(k.value)]
        if not passes and not kw:
            continue
        callee = getattr(n.func, "attr", None) or getattr(n.func, "id", None)
        for cand in methods.get(callee or "", []):
            fn = cand["node"]
            args = [a.arg for a in fn.args.args if a.arg != "self"]
            kwonly = [a.arg for a in fn.args.kwonlyargs]
            targets: set[str] = set()
            for i in passes:
                if i < len(args):
                    targets.add(args[i])
            targets |= {k for k in kw if k in args + kwonly}
            if not targets:
                continue
            fields = fields_from_param(fn, targets)
            if fields:
                return {
                    "resolution": "CALLEE_PAYLOAD",
                    "body_vars": sorted(body_vars),
                    "callee": f"{cand['owner']}.{callee}" if cand["owner"] else callee,
                    "callee_source": f"{cand['module']}:{fn.lineno}",
                    "payload_param": sorted(targets),
                    "fields": fields,
                }
    viac = _via_callee_model(handler, methods, models)
    if viac:
        viac["body_vars"] = sorted(body_vars)
        return viac
    return {"resolution": "UNRESOLVED", "body_vars": sorted(body_vars),
            "has_inline_body": has_inline_body, "fields": []}


def main() -> int:
    api = json.loads((OUT_DIR / "api-surface.json").read_text())
    pm = json.loads((OUT_DIR / "payload-models.json").read_text())
    models = {m["name"]: m for m in pm["models"]}

    tree = ast.parse(GATEWAY.read_text(errors="replace"))
    handlers = {n.name: n for n in tree.body
                if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef))}
    methods = index_methods()

    out = []
    for o in api["operations"]:
        if o["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            continue
        entry = {"method": o["method"], "path": o["path"], "handler": o["handler"],
                 "auth": o["auth"]["kinds"], "source": o["source"]}
        if o["body_fields"]:
            entry.update({"resolution": "HANDLER_DIRECT",
                          "fields": [{"name": f, "access": "get", "required": False,
                                      "default": None} for f in o["body_fields"]]})
        else:
            node = handlers.get(o["delegates_to"] or o["handler"]) or handlers.get(o["handler"])
            entry.update(resolve(node, methods, models) if node
                         else {"resolution": "HANDLER_NOT_FOUND", "fields": []})
        entry["field_count"] = len(entry.get("fields") or [])
        out.append(entry)

    by_res: dict[str, int] = {}
    for e in out:
        by_res[e["resolution"]] = by_res.get(e["resolution"], 0) + 1
    resolved = sum(1 for e in out if e["field_count"] > 0)

    payload = {
        "provenance": provenance("scripts/25_request_contracts.py", [
            "services/gateway/main.py", "services/**/*.py",
            "extract/api-surface.json", "extract/payload-models.json"]),
        "summary": {
            "mutations": len(out),
            "with_resolved_fields": resolved,
            "coverage_pct": round(100 * resolved / len(out), 1) if out else 0,
            "by_resolution": dict(sorted(by_res.items())),
            "total_fields": sum(e["field_count"] for e in out),
        },
        "note": "`required` reflects the access form: `payload[\"x\"]` raises on a missing "
                "key (required), `payload.get(\"x\")` does not (optional). Pydantic-resolved "
                "rows carry the declared type and default instead.",
        "operations": out,
    }
    p = write_json("request-contracts.json", payload)

    md = ["# Request body contract per mutation (source-resolved)", "",
          f"{resolved}/{len(out)} mutations resolved to a concrete field list.", "",
          "| Method | Path | Resolved via | Fields |", "|---|---|---|---|"]
    for e in out:
        names = [f["name"] for f in (e.get("fields") or [])]
        md.append("| {m} | `{p}` | {r} | {f} |".format(
            m=e["method"], p=e["path"], r=e["resolution"],
            f=", ".join(f"`{x}`" for x in names[:12]) +
              (f" … (+{len(names) - 12})" if len(names) > 12 else "") or "—"))
    write_text("request-contracts.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
