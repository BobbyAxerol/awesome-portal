"""Exact P23 old-wheel compatibility binding; no production admission."""
from __future__ import annotations

import hashlib
import json
import os
from typing import Any

ENGINE_110_QUALIFICATION_BINDING = {
    "schema_version": "research.engine-qualification-binding.v1",
    "binding_id": "p23.quantbt-110-fixed-qualification.v1",
    "execution_profile_id": "p04.fixed-qualification.v1",
    "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
    "engine_release_id": "er_quantbt_110", "engine_version": "1.1.0", "native_version": "0.4.1",
    "engine_wheel_sha256": "c319b24325230df99ce1803ae03df09c15acabd834dd2f6ccd17b21e70363e62",
    "native_wheel_sha256": "f26681ad154aea38d9d0fc8f9e828a6c480176cf7f20041cbb86f06e1dd38b3d",
    "execution_route": "signal_notional", "protocol": "three_window_decay", "production_admission": False,
}
ENGINE_110_QUALIFICATION_BINDING_DIGEST = hashlib.sha256(json.dumps(
    ENGINE_110_QUALIFICATION_BINDING, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def engine110_qualification_enabled() -> bool:
    return (os.getenv("PORTAL_ENV") == "local"
            and os.getenv("PORTAL_RESEARCH_ENGINE_QUALIFICATION_VERSION") == "1.1.0")


def confined_engine110_qualification_enabled() -> bool:
    # Supervisor supplies only this non-secret exact hash AFTER validating
    # local opt-in and the immutable receipt; no PORTAL_* or scheduler env
    # may cross the child's clean-environment fence.
    return os.getenv("RESEARCH_ENGINE_QUALIFICATION_CHILD_BINDING_SHA256") == ENGINE_110_QUALIFICATION_BINDING_DIGEST


def validate_engine_qualification_binding(binding: dict[str, Any] | None, *, release_id: str,
                                          profile_id: str, adapter_contract_digest: str,
                                          confined_child: bool = False) -> str:
    """No missing/forged binding, arbitrary version, or default reinterpretation."""
    if release_id == "er_quantbt_111":
        if binding is not None:
            raise ValueError("ENGINE_QUALIFICATION_BINDING_CANNOT_ENTER_CURRENT_RELEASE")
        return "1.1.1"
    expected = {**ENGINE_110_QUALIFICATION_BINDING, "binding_digest": ENGINE_110_QUALIFICATION_BINDING_DIGEST}
    opted_in = confined_engine110_qualification_enabled() if confined_child else engine110_qualification_enabled()
    if (release_id != "er_quantbt_110" or not opted_in
            or binding != expected or profile_id != expected["execution_profile_id"]
            or adapter_contract_digest != expected["adapter_contract_digest"]):
        raise ValueError("ENGINE_QUALIFICATION_EXACT_LOCAL_BINDING_REQUIRED")
    return "1.1.0"
