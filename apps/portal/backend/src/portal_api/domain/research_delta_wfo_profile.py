"""W1 locked Delta signal-notional WFO run execution profile (§1.1).

One object, one pinned digest, shared with the Control API
(``delta-wfo.profile.ts``).  The digest is recomputed from the object at
import time with the P08 canonical JSON form
(:func:`portal_api.services.research_preflight_snapshot.canonical_json`:
sorted keys, ``(",", ":")`` separators, no ASCII escaping) and must equal the
pinned hex; a drift in either side fails the import rather than admitting a
different profile under the old identity.

This module is deliberately dependency-free: the isolated child imports it
to re-verify the profile before it runs QuantBT.
"""

from __future__ import annotations

import hashlib
import json
import os
from types import MappingProxyType
from typing import Any, Final, Mapping

P04_FIXED_QUALIFICATION_PROFILE_ID: Final = "p04.fixed-qualification.v1"
DELTA_WFO_PROFILE_ID: Final = "p10.delta-signal-notional-wfo.v1"
EXECUTION_PROFILE_IDS: Final = (P04_FIXED_QUALIFICATION_PROFILE_ID, DELTA_WFO_PROFILE_ID)

DELTA_WFO_PROFILE_DIGEST: Final = "b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca"

_PROFILE: dict[str, Any] = {
    "schema_version": "research.p10.delta-wfo-profile.v1",
    "profile_id": DELTA_WFO_PROFILE_ID,
    "adapter_id": "p04.delta-rsi.v1",
    "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
    "engine_release_id": "er_quantbt_111",
    "execution_route": "signal_notional",
    "protocol": "advanced",
    "frequency": "weekly",
    "window_mode": "expanding",
    "timeframe": "1h",
    "max_span_days": 92,
    "fold_bounds": {"min": 2, "max": 16},
    "optimization_mode": "mode_1_decay",
    "optimization_schedule": "global",
    "optuna_trials": 3,
    "random_seed": 42,
    "current_source": {
        "source_adapter_id": "rs02.quantbt-signal-notional-wfo.v1",
        "profile_id": "rs02.delta-signal-notional-wfo.v1",
    },
    "child_limits": {"cpu_seconds": 120, "wall_seconds": 240},
}


def _canonical_json(value: object) -> str:
    # Byte-identical to research_preflight_snapshot.canonical_json (asserted
    # by test_research_delta_wfo_profile); duplicated to keep this module
    # importable by the isolated child without pandas/data-catalog imports.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def delta_wfo_profile() -> dict[str, Any]:
    """Return a fresh deep copy of the locked profile object."""

    return json.loads(_canonical_json(_PROFILE))


def delta_wfo_profile_digest(profile: Mapping[str, Any] | None = None) -> str:
    value = _PROFILE if profile is None else dict(profile)
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


_COMPUTED = delta_wfo_profile_digest()
if _COMPUTED != DELTA_WFO_PROFILE_DIGEST:  # pragma: no cover - import-time pin
    raise RuntimeError(
        f"Delta WFO profile digest drifted: computed {_COMPUTED}, pinned {DELTA_WFO_PROFILE_DIGEST}"
    )

DELTA_WFO_PROFILE: Final[Mapping[str, Any]] = MappingProxyType(delta_wfo_profile())
DELTA_WFO_CPU_SECONDS: Final[int] = int(_PROFILE["child_limits"]["cpu_seconds"])
DELTA_WFO_WALL_SECONDS: Final[int] = int(_PROFILE["child_limits"]["wall_seconds"])
DELTA_WFO_OPTUNA_TRIALS: Final[int] = int(_PROFILE["optuna_trials"])
DELTA_WFO_RANDOM_SEED: Final[int] = int(_PROFILE["random_seed"])
DELTA_WFO_MIN_FOLDS: Final[int] = int(_PROFILE["fold_bounds"]["min"])
DELTA_WFO_MAX_FOLDS: Final[int] = int(_PROFILE["fold_bounds"]["max"])
DELTA_WFO_MAX_SPAN_DAYS: Final[int] = int(_PROFILE["max_span_days"])

# Research-preview-only long WFO (Bobby 2026-09-30). The locked profile above,
# its identity and digest are unchanged; a preview run records its real trial
# count in its requested spec. Off by default; refused outside PORTAL_ENV=local.
DELTA_WFO_PREVIEW_LONG_FLAG: Final = "PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO"
DELTA_WFO_PREVIEW_LONG_MIN_TRIALS: Final[int] = 2
DELTA_WFO_PREVIEW_LONG_MAX_TRIALS: Final[int] = 400
DELTA_WFO_PREVIEW_LONG_CPU_SECONDS: Final[int] = 1800
DELTA_WFO_PREVIEW_LONG_WALL_SECONDS: Final[int] = 3600


class DeltaWfoPreviewLongMisconfigured(RuntimeError):
    """The preview-only flag is set on a stack that is not the local preview."""


def delta_wfo_preview_long_enabled(env: Mapping[str, str] | None = None) -> bool:
    """True only on a PORTAL_ENV=local stack that sets the preview flag.

    A set flag anywhere else is a configuration error, never a silent no-op.
    """

    source = os.environ if env is None else env
    if source.get(DELTA_WFO_PREVIEW_LONG_FLAG, "false").strip().lower() != "true":
        return False
    if source.get("PORTAL_ENV", "").strip() != "local":
        raise DeltaWfoPreviewLongMisconfigured(
            f"{DELTA_WFO_PREVIEW_LONG_FLAG}=true is only allowed with PORTAL_ENV=local"
        )
    return True


def delta_wfo_admitted_trials(requested_spec: Mapping[str, Any], env: Mapping[str, str] | None = None) -> int:
    """The WFO trial count this worker runs for one admitted requested spec.

    Flag off: the locked profile's 3, whatever the spec says (Control API
    already refused anything else). Flag on: the spec's own count, 2..400.
    """

    if not delta_wfo_preview_long_enabled(env):
        return DELTA_WFO_OPTUNA_TRIALS
    trials = requested_spec.get("optuna_trials")
    if (
        isinstance(trials, bool) or not isinstance(trials, int)
        or not DELTA_WFO_PREVIEW_LONG_MIN_TRIALS <= trials <= DELTA_WFO_PREVIEW_LONG_MAX_TRIALS
    ):
        raise ValueError(
            "The preview long walk-forward admits "
            f"{DELTA_WFO_PREVIEW_LONG_MIN_TRIALS} to {DELTA_WFO_PREVIEW_LONG_MAX_TRIALS} Optuna trials."
        )
    return trials


def delta_wfo_child_cpu_seconds(env: Mapping[str, str] | None = None) -> int:
    return DELTA_WFO_PREVIEW_LONG_CPU_SECONDS if delta_wfo_preview_long_enabled(env) else DELTA_WFO_CPU_SECONDS


__all__ = [
    "DELTA_WFO_CPU_SECONDS",
    "DELTA_WFO_PREVIEW_LONG_CPU_SECONDS",
    "DELTA_WFO_PREVIEW_LONG_FLAG",
    "DELTA_WFO_PREVIEW_LONG_MAX_TRIALS",
    "DELTA_WFO_PREVIEW_LONG_MIN_TRIALS",
    "DELTA_WFO_PREVIEW_LONG_WALL_SECONDS",
    "DeltaWfoPreviewLongMisconfigured",
    "delta_wfo_admitted_trials",
    "delta_wfo_child_cpu_seconds",
    "delta_wfo_preview_long_enabled",
    "DELTA_WFO_MAX_FOLDS",
    "DELTA_WFO_MAX_SPAN_DAYS",
    "DELTA_WFO_MIN_FOLDS",
    "DELTA_WFO_OPTUNA_TRIALS",
    "DELTA_WFO_PROFILE",
    "DELTA_WFO_PROFILE_DIGEST",
    "DELTA_WFO_PROFILE_ID",
    "DELTA_WFO_RANDOM_SEED",
    "DELTA_WFO_WALL_SECONDS",
    "EXECUTION_PROFILE_IDS",
    "P04_FIXED_QUALIFICATION_PROFILE_ID",
    "delta_wfo_profile",
    "delta_wfo_profile_digest",
]
