"""P10's private, bounded Research-run intake contract.

This model is deliberately separate from :class:`PortalRunRequest`.  The
legacy request remains the public compatibility format; this contract is only
accepted after Control API has attached a short-lived signed internal
principal.  It carries immutable identifiers and digests, never a source path,
raw candle row, credential or generic Python entrypoint.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import Field, model_serializer, model_validator

from .requests import PortalModel
from .research_delta_wfo_profile import (
    DELTA_WFO_MAX_SPAN_DAYS,
    DELTA_WFO_PROFILE,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
    P04_FIXED_QUALIFICATION_PROFILE_ID,
)


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
    # W1 §1.1: absent ⇒ the unchanged P04 fixed qualification.  The P04 wire
    # never carries these two fields (see the serializer below), so the P04
    # durable request, its spec digest and the child receipt stay byte-equal.
    execution_profile_id: Literal[
        "p04.fixed-qualification.v1", "p10.delta-signal-notional-wfo.v1"
    ] = P04_FIXED_QUALIFICATION_PROFILE_ID
    execution_profile_digest: str | None = Field(default=None, pattern=_DIGEST)
    p04_parameters: Annotated[dict[str, int | float], Field(min_length=8, max_length=8)] | None = None
    work_digest: str = Field(pattern=_DIGEST)

    @property
    def is_delta_wfo(self) -> bool:
        return self.execution_profile_id == DELTA_WFO_PROFILE_ID

    @model_serializer(mode="wrap")
    def _serialize_without_p04_profile_fields(self, handler: Any) -> dict[str, Any]:
        data = handler(self)
        if self.execution_profile_id == P04_FIXED_QUALIFICATION_PROFILE_ID and self.execution_profile_digest is None:
            data.pop("execution_profile_id", None)
            data.pop("execution_profile_digest", None)
        if self.p04_parameters is None:
            data.pop("p04_parameters", None)
        return data

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
        if self.execution_profile_id == DELTA_WFO_PROFILE_ID:
            self._validate_delta_wfo_profile()
            return self
        if self.execution_profile_digest is not None:
            raise ValueError("the P04 fixed qualification profile carries no execution profile digest")
        if self.p04_parameters is None:
            raise ValueError("P10 must retain exactly the installed P04 parameter map")
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

    def _validate_delta_wfo_profile(self) -> None:
        """Accept only the exact W1 §1.1 Delta signal-notional WFO profile."""

        profile = DELTA_WFO_PROFILE
        spec = self.requested_spec
        if self.execution_profile_digest != DELTA_WFO_PROFILE_DIGEST:
            raise ValueError("the Delta WFO execution profile digest does not match the installed profile")
        if self.p04_parameters is not None:
            raise ValueError("the Delta WFO profile searches its parameters and carries no P04 parameter map")
        if self.execution_adapter_id != profile["adapter_id"] or self.adapter_contract_digest != profile["adapter_contract_digest"]:
            raise ValueError("the Delta WFO profile is bound to the installed P04 Delta adapter contract")
        if spec.get("execution_route") != profile["execution_route"]:
            raise ValueError("the Delta WFO profile accepts only signal_notional")
        if spec.get("protocol") != profile["protocol"]:
            raise ValueError("the Delta WFO profile accepts only the advanced protocol")
        if "windows" in spec:
            raise ValueError("the Delta WFO profile forbids three-window boundaries")
        if spec.get("optuna_trials") != profile["optuna_trials"] or isinstance(spec.get("optuna_trials"), bool):
            raise ValueError("the Delta WFO profile accepts exactly 3 Optuna trials")
        if spec.get("random_seed") != profile["random_seed"] or isinstance(spec.get("random_seed"), bool):
            raise ValueError("the Delta WFO profile accepts exactly random seed 42")
        if spec.get("optimization_mode") != profile["optimization_mode"] or spec.get("optimization_schedule") != profile["optimization_schedule"]:
            raise ValueError("the Delta WFO profile accepts only mode_1_decay/global")
        if spec.get("early_stopping") is not None:
            raise ValueError("the Delta WFO profile does not admit early stopping")
        if spec.get("parameter_space_overrides") not in ([], None):
            raise ValueError("the Delta WFO profile searches the installed Delta parameter space only")
        data = spec.get("data")
        if not isinstance(data, dict) or data.get("timeframe") != profile["timeframe"]:
            raise ValueError("the Delta WFO profile accepts only the 1h timeframe")
        client = spec.get("client")
        if not isinstance(client, dict) or client.get("engine_release_id") != profile["engine_release_id"]:
            raise ValueError("the Delta WFO profile is bound to engine release er_quantbt_111")
        walk_forward = spec.get("walk_forward")
        if not isinstance(walk_forward, dict):
            raise ValueError("requested_spec must retain its walk_forward boundaries")
        if walk_forward.get("frequency") != profile["frequency"] or walk_forward.get("window_mode") != profile["window_mode"]:
            raise ValueError("the Delta WFO profile accepts only weekly expanding folds")
        start = _utc_instant(walk_forward.get("start"), "walk_forward start")
        end = _utc_instant(walk_forward.get("end_exclusive"), "walk_forward end")
        split = _utc_instant(walk_forward.get("split_mode"), "walk_forward split_mode")
        if not start < split < end:
            raise ValueError("the Delta WFO first OOS boundary must lie strictly inside the walk-forward span")
        if (end - start).total_seconds() > DELTA_WFO_MAX_SPAN_DAYS * 86_400:
            raise ValueError("the Delta WFO span exceeds the admitted 92 days")


def _utc_instant(value: object, label: str) -> datetime:
    if not isinstance(value, str) or not 1 <= len(value) <= 64:
        raise ValueError(f"{label} is invalid")
    try:
        instant = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{label} is invalid") from exc
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=UTC)
    return instant.astimezone(UTC)


class ResearchRunProducerRequest(PortalModel):
    """Exact private payload sent by Control API through the existing facade."""

    strategy_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    dataset_id: str = Field(pattern=_IDENTIFIER, max_length=191)
    protocol: Literal["three_window_decay", "advanced"]
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
        if requested.get("protocol") != self.protocol:
            raise ValueError("legacy protocol does not match the immutable requested spec")
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
