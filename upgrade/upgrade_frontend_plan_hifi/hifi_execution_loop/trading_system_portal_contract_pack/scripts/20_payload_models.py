#!/usr/bin/env python3
"""20_payload_models.py — recover request/response payload models the OpenAPI omits.

The gateway declares `requestBody` for 0 of 104 operations; the real payload shape
lives in Pydantic models (`services/gateway/schemas/*.py`) and domain dataclasses
(`domain/*.py`). This script AST-parses those modules and emits a field-level
contract: name, type annotation, required/optional, default, alias, validators.

READ-ONLY: `ast.parse` only; nothing is imported or executed.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import TS_ROOT, provenance, write_json, write_text  # noqa: E402

TARGET_DIRS = [
    ("gateway_schemas", TS_ROOT / "services" / "gateway" / "schemas"),
    ("domain", TS_ROOT / "domain"),
    ("gateway_contracts", TS_ROOT / "services" / "gateway" / "contracts"),
    ("venues", TS_ROOT / "services" / "venues"),
]

BASE_HINTS = ("BaseModel", "Enum", "StrEnum", "IntEnum", "TypedDict", "NamedTuple")


def ann_str(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    try:
        return ast.unparse(node)
    except Exception:  # pragma: no cover
        return None


def default_str(node: ast.AST | None) -> str | None:
    if node is None:
        return None
    try:
        txt = ast.unparse(node)
    except Exception:  # pragma: no cover
        return None
    return txt if len(txt) <= 160 else txt[:157] + "..."


def field_meta(value: ast.AST | None) -> dict:
    """Unpack pydantic Field(...) kwargs (alias, gt, ge, default_factory, ...)."""
    meta: dict = {}
    if isinstance(value, ast.Call):
        fn = value.func
        fname = fn.id if isinstance(fn, ast.Name) else getattr(fn, "attr", "")
        if fname == "Field":
            for kw in value.keywords:
                if kw.arg:
                    meta[kw.arg] = default_str(kw.value)
            if value.args:
                meta["default"] = default_str(value.args[0])
    return meta


def parse_class(node: ast.ClassDef, module: str) -> dict | None:
    bases = [ann_str(b) or "" for b in node.bases]
    is_model = any(any(h in b for h in BASE_HINTS) for b in bases)
    is_dataclass = any(
        (isinstance(d, ast.Name) and d.id == "dataclass")
        or (isinstance(d, ast.Call) and getattr(d.func, "id", "") == "dataclass")
        or (isinstance(d, ast.Attribute) and d.attr == "dataclass")
        for d in node.decorator_list
    )
    if not (is_model or is_dataclass):
        return None

    is_enum = any("Enum" in b for b in bases)
    fields: list[dict] = []
    members: list[dict] = []
    validators: list[dict] = []

    for stmt in node.body:
        if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
            name = stmt.target.id
            if name.startswith("model_config") or name.startswith("_"):
                continue
            meta = field_meta(stmt.value)
            ann = ann_str(stmt.annotation)
            # `x: T = Field(gt=0)` carries constraints but NO default -> still required.
            is_bare_field = isinstance(stmt.value, ast.Call) and (
                getattr(stmt.value.func, "id", getattr(stmt.value.func, "attr", "")) == "Field"
            )
            has_default = stmt.value is not None and not (
                is_bare_field and "default" not in meta and "default_factory" not in meta
            )
            fields.append({
                "name": name,
                "type": ann,
                "required": not has_default and not (ann or "").endswith("| None"),
                "nullable": bool(ann and ("| None" in ann or "Optional[" in ann)),
                "default": meta.get("default") if meta else default_str(stmt.value),
                "alias": meta.get("alias"),
                "constraints": {k: v for k, v in meta.items()
                                if k not in {"default", "alias", "description"}} or None,
                "description": meta.get("description"),
            })
        elif isinstance(stmt, ast.Assign) and is_enum:
            for t in stmt.targets:
                if isinstance(t, ast.Name):
                    members.append({"name": t.id, "value": default_str(stmt.value)})
        elif isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for d in stmt.decorator_list:
                dtxt = ann_str(d) or ""
                if "validator" in dtxt:
                    targets = []
                    if isinstance(d, ast.Call):
                        targets = [a.value for a in d.args
                                   if isinstance(a, ast.Constant) and isinstance(a.value, str)]
                    validators.append({"function": stmt.name, "kind": dtxt.split("(")[0],
                                       "applies_to": targets or ["<model>"]})

    return {
        "name": node.name,
        "module": module,
        "source": f"{module}:{node.lineno}",
        "bases": bases,
        "kind": "enum" if is_enum else ("dataclass" if is_dataclass else "pydantic_model"),
        "docstring": (ast.get_docstring(node) or "").strip().split("\n")[0] or None,
        "fields": fields,
        "enum_members": members or None,
        "validators": validators or None,
    }


def main() -> int:
    models: list[dict] = []
    scanned: list[str] = []
    for _label, d in TARGET_DIRS:
        if not d.exists():
            continue
        for py in sorted(d.rglob("*.py")):
            if "__pycache__" in py.parts:
                continue
            rel = str(py.relative_to(TS_ROOT))
            scanned.append(rel)
            try:
                tree = ast.parse(py.read_text(errors="replace"))
            except SyntaxError:
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    parsed = parse_class(node, rel)
                    if parsed:
                        models.append(parsed)

    models.sort(key=lambda m: (m["module"], m["name"]))
    payload = {
        "provenance": provenance("scripts/20_payload_models.py", scanned),
        "summary": {
            "modules_scanned": len(scanned),
            "models": len(models),
            "by_kind": {k: sum(1 for m in models if m["kind"] == k)
                        for k in sorted({m["kind"] for m in models})},
            "total_fields": sum(len(m["fields"]) for m in models),
        },
        "models": models,
    }
    p = write_json("payload-models.json", payload)

    md = ["# Payload models (source-derived — OpenAPI declares no requestBody)", ""]
    md.append(f"{len(models)} models / {payload['summary']['total_fields']} fields "
              f"from {len(scanned)} modules.\n")
    for m in models:
        if not m["fields"] and not m["enum_members"]:
            continue
        md.append(f"### `{m['name']}` — {m['kind']}  \n<sub>{m['source']}</sub>\n")
        if m["enum_members"]:
            md.append("Members: " + ", ".join(f"`{x['name']}={x['value']}`"
                                              for x in m["enum_members"]) + "\n")
        if m["fields"]:
            md.append("| Field | Type | Req | Default | Alias |")
            md.append("|---|---|---|---|---|")
            for f in m["fields"]:
                md.append("| `{n}` | `{t}` | {r} | {d} | {a} |".format(
                    n=f["name"], t=f["type"] or "—",
                    r="**yes**" if f["required"] else "no",
                    d=f"`{f['default']}`" if f["default"] else "—",
                    a=f"`{f['alias']}`" if f["alias"] else "—"))
            md.append("")
    write_text("payload-models.md", "\n".join(md))
    print(json.dumps(payload["summary"], indent=2))
    print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
