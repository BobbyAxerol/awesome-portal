"""P10's private, bounded Research-run intake contract.

This model is deliberately separate from :class:`PortalRunRequest`.  The
legacy request remains the public compatibility format; this contract is only
accepted after Control API has attached a short-lived signed internal
principal.  It carries immutable identifiers and digests, never a source path,
raw candle row, credential or generic Python entrypoint.
"""

from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import Field, model_validator

from .requests import PortalModel


_IDENTIFIER = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$"
_OPAQUE = r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"
_DIGEST = r"^[0-9a-f]{64}$"
_PREFLIGHT = r"^rpft_[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"
_SNAPSHOT = r"^dss_[0-9a-f]{32}$"

_P04_DELTA_FIXED_PARAMETERS: dict[str, int | float] = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}


class ResearchRunProducerEnvelope(PortalModel):
    """The server-owned P08/P10 immutable facts needed by the worker."""

    schema_version: Literal["research.run-producer.v1"]
    client_intent_id: str = Field(pattern=_IDENTIFIER, min_length=3, max_length=191)
    intent_kind: Literal["NEW"]
    preflight_token: str = Field(pattern=_PREFLIGHT, max_length=191)
    requested_spec: dict[str, Any] = Field(min_length=1, max_length=64)
    requested_spec_digest: str = Field(pattern=_DIGEST)
    effective_spec_digest: str = Field(pattern=_DIGEST)
    dataset_binding_digest: str = Field(pattern=_DIGEST)
    manifest_digest: str = Field(pattern=_DIGEST)
    snapshot_id: str = Field(pattern=_SNAPSHOT)
    snapshot_content_hash: str = Field(pattern=_DIGEST)
    alpha_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    alpha_version_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    execution_adapter_id: Literal["p04.delta-rsi.v1"]
    adapter_contract_digest: str = Field(pattern=_DIGEST)
    p04_parameters: dict[str, int | float] = Field(min_length=8, max_length=8)
    work_digest: str = Field(pattern=_DIGEST)

    @model_validator(mode="after")
    def validate_bounded_requested_spec(self) -> "ResearchRunProducerEnvelope":
        encoded = json.dumps(
            self.requested_spec,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        if len(encoded) > 60 * 1024:
            raise ValueError("requested_spec exceeds the bounded private producer contract")
        binding = self.requested_spec.get("alpha_binding")
        if not isinstance(binding, dict):
            raise ValueError("requested_spec must retain its explicit AlphaVersion binding")
        if binding.get("alpha_id") != self.alpha_id or binding.get("alpha_version_id") != self.alpha_version_id:
            raise ValueError("requested_spec AlphaVersion does not match the immutable producer binding")
        if self.requested_spec.get("strategy_id") != self.alpha_id:
            raise ValueError("requested_spec strategy_id does not match the immutable Alpha identity")
        if self.requested_spec.get("execution_route") != "signal_notional":
            raise ValueError("the installed P10 adapter accepts only signal_notional")
        if self.requested_spec.get("protocol") != "three_window_decay":
            raise ValueError("the installed P10 adapter accepts only three_window_decay")
        if set(self.p04_parameters) != set(_P04_DELTA_FIXED_PARAMETERS):
            raise ValueError("P10 must retain exactly the installed P04 parameter map")
        for key, expected in _P04_DELTA_FIXED_PARAMETERS.items():
            actual = self.p04_parameters.get(key)
            if isinstance(actual, bool) or not isinstance(actual, (int, float)) or actual != expected:
                raise ValueError("P10 parameter map does not match the installed P04 profile")
        windows = self.requested_spec.get("windows")
        if not isinstance(windows, dict) or not all(isinstance(windows.get(name), dict) for name in ("is", "oos", "holdout")):
            raise ValueError("requested_spec must retain three-window boundaries")
        return self


class ResearchRunProducerRequest(PortalModel):
    """Exact private payload sent by Control API through the existing facade."""

    strategy_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    dataset_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    protocol: Literal["three_window_decay"]
    research_contract_version: Literal["research.run-request.v1"]
    run_id: str = Field(pattern=_OPAQUE, max_length=160)
    workspace_id: str = Field(pattern=_OPAQUE, max_length=160)
    job_id: str = Field(pattern=_OPAQUE, max_length=160)
    worker_attempt_id: str = Field(pattern=_OPAQUE, max_length=160)
    lease_epoch: int = Field(ge=1, le=2_147_483_647)
    research: ResearchRunProducerEnvelope

    @model_validator(mode="after")
    def validate_compatibility_projection(self) -> "ResearchRunProducerRequest":
        requested = self.research.requested_spec
        data = requested.get("data")
        if self.strategy_id != self.research.alpha_id:
            raise ValueError("legacy strategy_id does not match the immutable Alpha identity")
        if not isinstance(data, dict) or data.get("dataset_id") != self.dataset_id:
            raise ValueError("legacy dataset_id does not match the immutable requested spec")
        encoded = json.dumps(
            self.model_dump(mode="json"),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
        if len(encoded) > 64 * 1024:
            raise ValueError("research producer request exceeds the bounded private contract")
        return self


__all__ = ["ResearchRunProducerEnvelope", "ResearchRunProducerRequest"]
