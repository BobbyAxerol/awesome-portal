"""Image-owned recipe facts only; no engine, source lookup or authorization."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from .research_execution_recipes_generated import EXECUTION_RECIPE_TABLE, EXECUTION_RECIPE_REVISION


def recipe_digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()


def assert_execution_recipe_table(table: dict[str, Any], revision: str) -> None:
    if recipe_digest(table) != revision:
        raise ValueError("execution recipe table revision mismatch")
    ids: set[str] = set()
    for row in table["recipes"]:
        if row["profile_id"] in ids:
            raise ValueError("ambiguous execution recipe")
        ids.add(row["profile_id"])
        refs = [ref for ref in table["qualification_references"] if ref["profile_id"] == row["profile_id"]]
        if len(refs) != 1 or refs[0]["recipe_digest"] != recipe_digest(row) \
                or row["descriptor"]["profile_id"] != row["profile_id"] \
                or row["profile_digest"] is not None and recipe_digest(row["descriptor"]) != row["profile_digest"]:
            raise ValueError("execution recipe qualification/profile mismatch")


assert_execution_recipe_table(EXECUTION_RECIPE_TABLE, EXECUTION_RECIPE_REVISION)
# Private canonical bytes, not a mutable public module-global authority.
_RECIPES = {r["profile_id"]: json.dumps(r, sort_keys=True, separators=(",", ":")) for r in EXECUTION_RECIPE_TABLE["recipes"]}
_QUALIFICATIONS = {r["profile_id"]: json.dumps(r, sort_keys=True, separators=(",", ":")) for r in EXECUTION_RECIPE_TABLE["qualification_references"]}
EXECUTION_MAX_WARMUP_BARS = max(r["budgets"]["max_warmup_bars"] for r in EXECUTION_RECIPE_TABLE["recipes"])
EXECUTION_PLANNING_MAX_BARS = max(r["budgets"]["planning_max_bars"] for r in EXECUTION_RECIPE_TABLE["recipes"])
EXECUTION_MAX_CPU_SECONDS = max(r["budgets"]["cpu_seconds"] for r in EXECUTION_RECIPE_TABLE["recipes"])
del EXECUTION_RECIPE_TABLE
_UNSPECIFIED = object()


def execution_recipe(profile_id: str, profile_digest: object = _UNSPECIFIED) -> dict[str, Any]:
    if profile_id not in _RECIPES:
        raise ValueError("unknown execution recipe")
    row = json.loads(_RECIPES[profile_id])
    if profile_digest is not _UNSPECIFIED and row["profile_digest"] != profile_digest:
        raise ValueError("tampered execution recipe digest")
    return row


def execution_recipe_budgets(profile_id: str, env: Mapping[str, str]) -> dict[str, int]:
    row = execution_recipe(profile_id)
    result, override = row["budgets"], row["preview_override"]
    if override is not None and env.get(override["python_flag"], "false").strip().lower() == "true":
        if env.get("PORTAL_ENV", "").strip() != override["required_environment"]:
            raise ValueError("preview recipe budget is outside local environment")
        result.update(cpu_seconds=override["cpu_seconds"], wall_seconds=override["wall_seconds"])
    return result


def execution_recipe_qualification(profile_id: str) -> dict[str, Any]:
    execution_recipe(profile_id)
    return json.loads(_QUALIFICATIONS[profile_id])
