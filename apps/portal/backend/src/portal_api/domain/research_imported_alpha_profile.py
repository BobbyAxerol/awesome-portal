"""E17's one digest-pinned imported Alpha execution profile.

This is the Python twin of Control API's ``imported-alpha.profile.ts``. It
contains neither source bytes nor a source path; the worker fetches exact
bytes through the current-lease internal authority just before child launch.
"""

from __future__ import annotations
from portal_api.domain.research_execution_recipes import execution_recipe


import hashlib
import json
from types import MappingProxyType
from typing import Any, Final, Mapping

IMPORTED_ALPHA_ADAPTER_ID: Final = "p17.imported-signal-notional.v1"
IMPORTED_ALPHA_PROFILE_ID: Final = "p17.imported-signal-notional.v1"
IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST: Final = (
    "b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6"
)
IMPORTED_ALPHA_PROFILE_DIGEST: Final = (
    "f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298"
)

_ADAPTER_CONTRACT: dict[str, Any] = {
    "schema_version": "research.p17.imported-adapter-binding.v1",
    "adapter_id": IMPORTED_ALPHA_ADAPTER_ID,
    "source_contract": "research.alpha-source.v1",
    "context_contract": "research.imported-alpha-context.v1",
    "output_contract": "research.imported-signal-notional-output.v1",
    "execution_route": "signal_notional",
    "engine_release_id": "er_quantbt_111",
    "security_policy": "research.imported-python-restricted.v1",
}

_PROFILE = execution_recipe(IMPORTED_ALPHA_PROFILE_ID)["descriptor"]


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def imported_alpha_digest(value: Mapping[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(dict(value)).encode("utf-8")).hexdigest()


if imported_alpha_digest(_ADAPTER_CONTRACT) != IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST:
    raise RuntimeError("Imported Alpha adapter contract digest drifted")
if imported_alpha_digest(_PROFILE) != IMPORTED_ALPHA_PROFILE_DIGEST:
    raise RuntimeError("Imported Alpha execution profile digest drifted")

IMPORTED_ALPHA_ADAPTER_CONTRACT: Final[Mapping[str, Any]] = MappingProxyType(_ADAPTER_CONTRACT)
IMPORTED_ALPHA_PROFILE: Final[Mapping[str, Any]] = MappingProxyType(_PROFILE)
IMPORTED_ALPHA_CPU_SECONDS: Final[int] = int(_PROFILE["child_limits"]["cpu_seconds"])
IMPORTED_ALPHA_WALL_SECONDS: Final[int] = int(_PROFILE["child_limits"]["wall_seconds"])
IMPORTED_ALPHA_MAX_SOURCE_BYTES: Final[int] = int(_PROFILE["child_limits"]["max_source_bytes"])
IMPORTED_ALPHA_MAX_SIGNAL_POINTS: Final[int] = int(_PROFILE["child_limits"]["max_signal_points"])


__all__ = [
    "IMPORTED_ALPHA_ADAPTER_CONTRACT",
    "IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST",
    "IMPORTED_ALPHA_ADAPTER_ID",
    "IMPORTED_ALPHA_CPU_SECONDS",
    "IMPORTED_ALPHA_MAX_SIGNAL_POINTS",
    "IMPORTED_ALPHA_MAX_SOURCE_BYTES",
    "IMPORTED_ALPHA_PROFILE",
    "IMPORTED_ALPHA_PROFILE_DIGEST",
    "IMPORTED_ALPHA_PROFILE_ID",
    "IMPORTED_ALPHA_WALL_SECONDS",
    "imported_alpha_digest",
]
