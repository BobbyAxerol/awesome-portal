"""W5a A10c locked what-if diagnostic profile (Screen 07 §2.5).

Python twin of Control API ``whatif.profile.ts``: one object, one pinned
digest, recomputed at import time with the P08 canonical JSON form. The
profile names the parent WFO profile it may diagnose, the two declared axes
(HiFi ``entry_z`` → ``rvol``, ``atr_mult`` → ``slpercent``), the 9×9 radius,
the 81-evaluation ceiling and the child limits. Dependency-free: the isolated
child imports it to re-verify the profile before it runs QuantBT.
"""

from __future__ import annotations

import hashlib
import json
from types import MappingProxyType
from typing import Any, Final, Mapping

from .research_delta_wfo_profile import DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID

WHATIF_PROFILE_ID: Final = "p16.delta-whatif-grid.v1"

_PROFILE: dict[str, Any] = {
    "schema_version": "research.p16.delta-whatif-grid-profile.v1",
    "profile_id": WHATIF_PROFILE_ID,
    "parent_profile_id": DELTA_WFO_PROFILE_ID,
    "parent_profile_digest": DELTA_WFO_PROFILE_DIGEST,
    "axes": [
        {"parameter": "rvol", "hifi_name": "entry_z"},
        {"parameter": "slpercent", "hifi_name": "atr_mult"},
    ],
    "radius_steps": 4,
    "grid_size": 9,
    "max_evaluations": 81,
    "objective": "MODE_1_DECAY_J_GLOBAL_STUDY_IS",
    "evaluation": "OPTUNA_ENQUEUED_TRIALS_THROUGH_QUANTBT_OBJECTIVE",
    "child_limits": {"cpu_seconds": 120, "wall_seconds": 240},
}

WHATIF_PROFILE_DIGEST: Final = "3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc"


def _canonical_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def whatif_profile() -> dict[str, Any]:
    return json.loads(_canonical_json(_PROFILE))


def whatif_profile_digest(profile: Mapping[str, Any] | None = None) -> str:
    value = _PROFILE if profile is None else dict(profile)
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


_COMPUTED = whatif_profile_digest()
if _COMPUTED != WHATIF_PROFILE_DIGEST:  # pragma: no cover - import-time pin
    raise RuntimeError(f"what-if profile digest drifted: computed {_COMPUTED}, pinned {WHATIF_PROFILE_DIGEST}")

WHATIF_PROFILE: Final[Mapping[str, Any]] = MappingProxyType(whatif_profile())
WHATIF_CPU_SECONDS: Final[int] = int(_PROFILE["child_limits"]["cpu_seconds"])
WHATIF_WALL_SECONDS: Final[int] = int(_PROFILE["child_limits"]["wall_seconds"])
WHATIF_MAX_EVALUATIONS: Final[int] = int(_PROFILE["max_evaluations"])

__all__ = [
    "WHATIF_CPU_SECONDS",
    "WHATIF_MAX_EVALUATIONS",
    "WHATIF_PROFILE",
    "WHATIF_PROFILE_DIGEST",
    "WHATIF_PROFILE_ID",
    "WHATIF_WALL_SECONDS",
    "whatif_profile",
    "whatif_profile_digest",
]
