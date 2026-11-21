"""Bounded source-time observation of Optuna's public sampler API.

This is not a TPE implementation or a reconstruction from a trial ledger. The
isolated, serial QuantBT child delegates each original public sampler method
exactly once and observes its actual return. No private sampler/RNG/density
attributes are read. Historical seals are never enriched by this observer.
"""

from __future__ import annotations

import hashlib
import inspect
import json
import math
import re
import time
from decimal import Decimal
from pathlib import Path
from typing import Any, Callable, Mapping


SAMPLER_TRACE_SCHEMA = "research.sampler-public-observer.v1"
SAMPLER_TRACE_SCOPE = "OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY"
SAMPLER_TRACE_PATH = "wfo/sampler_public_trace.v1.json"
SAMPLER_TRACE_MAX_BYTES = 256 * 1024
SAMPLER_TRACE_SUMMARY_MAX_BYTES = 8 * 1024
_MAX_STUDIES = 16
_MAX_TRIALS = 400
_MAX_PARAMETERS = 32
_TOKEN = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
_DECIMAL = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
_METHODS = (
    "before_trial", "infer_relative_search_space", "sample_relative",
    "sample_independent", "after_trial", "reseed_rng",
)


def _encoded(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _decimal(value: object) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise ValueError("Sampler observations require finite numeric source values")
    text = format(Decimal(str(value)), "f")
    if len(text) > 96:
        raise ValueError("Sampler observation exceeds exact-decimal bound")
    return "0" if Decimal(text) == 0 else text


def _parameter_name(name: object) -> str:
    if not isinstance(name, str) or not _TOKEN.fullmatch(name):
        raise ValueError("Sampler parameter name is outside source token bounds")
    return name


def _source_decimal(value: object) -> bool:
    return isinstance(value, str) and len(value) <= 96 and bool(_DECIMAL.fullmatch(value))


class SamplerPublicTrace:
    """One child-local observer; restores every patched method in ``finally``.

    Hooking the actual instance (rather than a proxy sampler) preserves class
    identity and all implementation-specific behaviour. Observation errors are
    isolated from the objective and reported as an incomplete trace.
    """

    def __init__(self, *, run_id: str, engine_version: str) -> None:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", run_id):
            raise ValueError("Sampler observer run identity is invalid")
        self.run_id = run_id
        self.engine_version = engine_version
        self.studies: list[dict[str, Any]] = []
        self.trials: list[dict[str, Any]] = []
        self._active: dict[tuple[int, int], dict[str, Any]] = {}
        self._restore_methods: list[Callable[[], None]] = []
        self._invocations = 0
        self._omitted = 0
        self._capture_complete = True
        self._installed = False
        self._optuna_version = "UNKNOWN"

    def install(self, *, source_study_id: Callable[[], str | None]) -> Callable[[], None]:
        import optuna

        if self._installed:
            raise ValueError("Sampler observer is already installed")
        self._installed = True
        self._optuna_version = optuna.__version__
        original_create = optuna.create_study

        def observed_create(*args: Any, **kwargs: Any) -> Any:
            # Creating a Study and selecting its effective sampler is the
            # source's operation, never this observer's.
            study = original_create(*args, **kwargs)
            try:
                self._attach(study, source_study_id())
            except Exception:  # noqa: BLE001 -- observation is never computation
                self._capture_complete = False
            return study

        optuna.create_study = observed_create

        def restore() -> None:
            optuna.create_study = original_create
            for restore_method in reversed(self._restore_methods):
                restore_method()
            self._restore_methods.clear()
            self._installed = False

        return restore

    def _attach(self, study: Any, source_study_id: str | None) -> None:
        if len(self.studies) >= _MAX_STUDIES:
            self._capture_complete = False
            return
        if source_study_id is not None and not re.fullmatch(r"[0-9]{1,12}", source_study_id):
            raise ValueError("Source study identity is not an observed native integer")
        index = len(self.studies)
        sampler = study.sampler
        entry = {
            "observer_study_index": index,
            "source_study_id": source_study_id,
            "sampler_class": _parameter_name(type(sampler).__name__),
            "pruner_class": _parameter_name(type(study.pruner).__name__),
            "directions": [direction.name for direction in study.directions],
            "effective_configuration_state": "NOT_PUBLISHED",
            "distributions": {},
        }
        self.studies.append(entry)
        for name in _METHODS:
            original = getattr(sampler, name)
            had_instance = name in vars(sampler)
            original_instance = vars(sampler).get(name)

            def observed(*args: Any, _method: str = name, _original: Callable[..., Any] = original, **kwargs: Any) -> Any:
                # Invoke the source once, before recording. Its exact exception
                # and return value are preserved; no new random draw occurs.
                result = _original(*args, **kwargs)
                try:
                    self._record(index, _method, args, kwargs, result, _original)
                except Exception:  # noqa: BLE001 -- observation is never computation
                    self._capture_complete = False
                return result

            setattr(sampler, name, observed)

            def restore_method(_sampler: Any = sampler, _name: str = name,
                               _had: bool = had_instance, _value: Any = original_instance) -> None:
                if _had:
                    setattr(_sampler, _name, _value)
                else:
                    delattr(_sampler, _name)

            self._restore_methods.append(restore_method)

    def _record(self, index: int, method: str, args: tuple[Any, ...], kwargs: Mapping[str, Any],
                result: Any, original: Callable[..., Any]) -> None:
        self._invocations += 1
        if method == "reseed_rng":
            # This serial child should not invoke reseeding. If the source
            # later does, disclose it without inventing a trial identity.
            self._capture_complete = False
            return
        bound = inspect.signature(original).bind(*args, **kwargs)
        trial = bound.arguments["trial"]
        number = trial.number
        if type(number) is not int or not 0 <= number < 100_000:
            raise ValueError("Native sampler trial number is invalid")
        key = (index, number)
        if method == "before_trial":
            if len(self.trials) + len(self._active) >= _MAX_TRIALS:
                self._omitted += 1
                self._capture_complete = False
                return
            self._active[key] = {
                "observer_study_index": index,
                "source_study_id": self.studies[index]["source_study_id"],
                "trial_number": number,
                "started_at_utc_ms": time.time_ns() // 1_000_000,
                "completed_at_utc_ms": None,
                "state": "RUNNING",
                "invocation_kinds": [],
                "invocation_count": 0,
                "returned_parameters": {},
                "values": None,
            }
        row = self._active.get(key)
        if row is None:
            return
        row["invocation_count"] += 1
        if method not in row["invocation_kinds"]:
            row["invocation_kinds"].append(method)
        if method in {"infer_relative_search_space", "sample_relative"}:
            space = result if method == "infer_relative_search_space" else bound.arguments["search_space"]
            if len(space) > _MAX_PARAMETERS:
                raise ValueError("Sampler search space exceeds source bounds")
            for name, distribution in space.items():
                self._distribution(index, name, distribution)
            if method == "sample_relative":
                for name, value in result.items():
                    row["returned_parameters"][_parameter_name(name)] = _decimal(value)
        elif method == "sample_independent":
            name = _parameter_name(bound.arguments["param_name"])
            self._distribution(index, name, bound.arguments["param_distribution"])
            row["returned_parameters"][name] = _decimal(result)
        elif method == "after_trial":
            state = bound.arguments["state"].name
            if state not in {"COMPLETE", "PRUNED", "FAIL"}:
                raise ValueError("Unexpected sampler terminal state")
            values = bound.arguments["values"]
            try:
                outcome = None if values is None else [_decimal(value) for value in values]
            except ValueError:
                outcome = None
                self._capture_complete = False
            row.update(state=state, completed_at_utc_ms=time.time_ns() // 1_000_000,
                       values=outcome)
            self.trials.append(self._active.pop(key))

    def _distribution(self, index: int, name: object, distribution: Any) -> None:
        name = _parameter_name(name)
        spaces = self.studies[index]["distributions"]
        if len(spaces) >= _MAX_PARAMETERS and name not in spaces:
            raise ValueError("Sampler distribution count exceeds bounds")
        kind = type(distribution).__name__
        if kind not in {"IntDistribution", "FloatDistribution"}:
            raise ValueError("Current Delta observer supports numeric source distributions")
        value = {
            "kind": kind, "low": _decimal(distribution.low), "high": _decimal(distribution.high),
            "step": None if distribution.step is None else _decimal(distribution.step), "log": bool(distribution.log),
        }
        if name in spaces and spaces[name] != value:
            raise ValueError("Sampler distribution changed within the same source study")
        spaces[name] = value

    def document(self) -> dict[str, Any]:
        complete = self._capture_complete and not self._active
        payload = {
            "schema_version": SAMPLER_TRACE_SCHEMA,
            "scope": SAMPLER_TRACE_SCOPE,
            "run_id": self.run_id,
            "engine_version": self.engine_version,
            "optuna_version": self._optuna_version,
            "capture_complete": complete,
            "invocation_count": self._invocations,
            "omitted_trial_count": self._omitted + len(self._active),
            "studies": self.studies,
            "trials": self.trials,
        }
        # Bounded semantic document size also leaves headroom for the P05
        # canonical writer. Tail omission is explicit, never COMPLETE.
        while len(_encoded(payload)) > SAMPLER_TRACE_MAX_BYTES - 4096 and payload["trials"]:
            payload["trials"] = payload["trials"][:-1]
            payload["omitted_trial_count"] += 1
            payload["capture_complete"] = False
        return payload

    def write(self, *, artifacts: Any, run_id: str) -> Path:
        if run_id != self.run_id:
            raise ValueError("Sampler trace cannot be attached to a different run")
        # Reuse the repository's contained-path and durable atomic writer. This
        # new document is compact canonical JSON, exactly the bytes P05 will
        # seal; pretty printing would unnecessarily truncate a 400-trial trace.
        path = artifacts._artifact_path(run_id, SAMPLER_TRACE_PATH, create_parent=True)  # noqa: SLF001 -- same source custody boundary
        artifacts._atomic_write(path, _encoded(self.document()))  # noqa: SLF001
        return path


def retain_sampler_trace(path: Path, *, run_id: str, trial_count: int) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Validate a fresh child's bounded source document and project its summary.

    Absence returns ``None`` so old seals and source-transform identities stay
    byte/semantically unchanged. Unknown fields are refused, not exposed.
    """

    if not path.exists():
        return None
    if path.is_symlink() or path.stat().st_size > SAMPLER_TRACE_MAX_BYTES:
        raise ValueError("Sampler source document exceeds custody bounds")
    raw = path.read_bytes()
    value = json.loads(raw)
    expected = {"schema_version", "scope", "run_id", "engine_version", "optuna_version",
                "capture_complete", "invocation_count", "omitted_trial_count", "studies", "trials"}
    if not isinstance(value, dict) or set(value) != expected or value["schema_version"] != SAMPLER_TRACE_SCHEMA:
        raise ValueError("Sampler source document has incompatible schema")
    if value["scope"] != SAMPLER_TRACE_SCOPE or value["run_id"] != run_id or value["engine_version"] != "1.1.1":
        raise ValueError("Sampler source document has foreign source binding")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value["optuna_version"]):
        raise ValueError("Sampler source version is invalid")
    if type(value["capture_complete"]) is not bool:
        raise ValueError("Sampler completeness is invalid")
    for field in ("invocation_count", "omitted_trial_count"):
        if type(value[field]) is not int or not 0 <= value[field] <= 131_072:
            raise ValueError("Sampler counter exceeds bounds")
    if not isinstance(value["studies"], list) or len(value["studies"]) > _MAX_STUDIES:
        raise ValueError("Sampler source study list exceeds bounds")
    if not isinstance(value["trials"], list) or len(value["trials"]) > _MAX_TRIALS:
        raise ValueError("Sampler source trial list exceeds bounds")
    # Re-validate the public numeric fields and identities before sealing.
    pairs: set[tuple[int, int]] = set()
    for index, study in enumerate(value["studies"]):
        if set(study) != {"observer_study_index", "source_study_id", "sampler_class", "pruner_class",
                          "directions", "effective_configuration_state", "distributions"}:
            raise ValueError("Sampler study fields are incompatible")
        if type(study["observer_study_index"]) is not int or study["observer_study_index"] != index or study["effective_configuration_state"] != "NOT_PUBLISHED":
            raise ValueError("Sampler study order/configuration scope is incompatible")
        for name in ("sampler_class", "pruner_class"):
            _parameter_name(study[name])
        if study["source_study_id"] is not None and not re.fullmatch(r"[0-9]{1,12}", study["source_study_id"]):
            raise ValueError("Sampler source study identifier is invalid")
        if not isinstance(study["directions"], list) or not 1 <= len(study["directions"]) <= 2 or any(
                direction not in {"MAXIMIZE", "MINIMIZE"} for direction in study["directions"]):
            raise ValueError("Sampler source direction is invalid")
        if not isinstance(study["distributions"], dict) or len(study["distributions"]) > _MAX_PARAMETERS:
            raise ValueError("Sampler source distribution map is invalid")
        for name, distribution in study["distributions"].items():
            _parameter_name(name)
            if set(distribution) != {"kind", "low", "high", "step", "log"} or distribution["kind"] not in {"IntDistribution", "FloatDistribution"}:
                raise ValueError("Sampler distribution fields are incompatible")
            for field in ("low", "high", "step"):
                if distribution[field] is not None and not _source_decimal(distribution[field]):
                    raise ValueError("Sampler distribution value is invalid")
            if type(distribution["log"]) is not bool:
                raise ValueError("Sampler distribution log flag is invalid")
    trial_fields = {"observer_study_index", "source_study_id", "trial_number", "started_at_utc_ms",
                    "completed_at_utc_ms", "state", "invocation_kinds", "invocation_count", "returned_parameters", "values"}
    for trial in value["trials"]:
        if not isinstance(trial, dict) or set(trial) != trial_fields:
            raise ValueError("Sampler trial fields are incompatible")
        index, number = trial["observer_study_index"], trial["trial_number"]
        if type(index) is not int or not 0 <= index < len(value["studies"]) or type(number) is not int or not 0 <= number < 100_000:
            raise ValueError("Sampler trial identity is invalid")
        if (index, number) in pairs or trial["source_study_id"] != value["studies"][index]["source_study_id"]:
            raise ValueError("Sampler trial source identity is duplicated or foreign")
        pairs.add((index, number))
        for field in ("started_at_utc_ms", "completed_at_utc_ms", "invocation_count"):
            if type(trial[field]) is not int or not 0 <= trial[field] <= 9_007_199_254_740_991:
                raise ValueError("Sampler trial source timing/counter is invalid")
        if trial["completed_at_utc_ms"] < trial["started_at_utc_ms"] or trial["state"] not in {"COMPLETE", "PRUNED", "FAIL"}:
            raise ValueError("Sampler trial source terminal state is invalid")
        if not isinstance(trial["invocation_kinds"], list) or len(trial["invocation_kinds"]) > 5 or any(
                kind not in _METHODS[:-1] for kind in trial["invocation_kinds"]) or len(set(trial["invocation_kinds"])) != len(trial["invocation_kinds"]):
            raise ValueError("Sampler trial method scope is invalid")
        params = trial["returned_parameters"]
        if not isinstance(params, dict) or len(params) > _MAX_PARAMETERS:
            raise ValueError("Sampler trial returned parameters exceed bounds")
        for name, numeric in params.items():
            _parameter_name(name)
            if not _source_decimal(numeric):
                raise ValueError("Sampler trial returned parameter is invalid")
        if trial["values"] is not None and (not isinstance(trial["values"], list) or len(trial["values"]) > 2 or any(
                not _source_decimal(item) for item in trial["values"])):
            raise ValueError("Sampler trial outcome values are invalid")
    if type(trial_count) is not int or trial_count < len(value["trials"]):
        raise ValueError("Sampler trace exceeds the actual source trial census")
    if value["capture_complete"] and (len(value["trials"]) != trial_count or value["omitted_trial_count"] != 0):
        raise ValueError("Complete sampler trace does not match the source trial census")
    if value["capture_complete"] and value["invocation_count"] != sum(trial["invocation_count"] for trial in value["trials"]):
        raise ValueError("Complete sampler trace does not match its invocation census")
    canonical = _encoded(value)
    if raw != canonical:
        raise ValueError("Sampler source document is not the canonical immutable capture")
    summary = {key: value[key] for key in ("schema_version", "scope", "engine_version", "optuna_version",
                                          "capture_complete", "invocation_count", "omitted_trial_count")}
    available = bool(value["trials"])
    summary.update(
        state="AVAILABLE" if available and value["capture_complete"] else "PARTIAL" if available else "NOT_PUBLISHED",
        reason_code=None if available and value["capture_complete"] else "SAMPLER_PUBLIC_OBSERVER_CAPTURE_INCOMPLETE" if available else "SAMPLER_PUBLIC_OBSERVER_DID_NOT_CAPTURE_TRIALS",
        recorded_trial_count=len(value["trials"]), study_count=len(value["studies"]),
        artifact_sha256=hashlib.sha256(canonical).hexdigest(), size_bytes=len(canonical),
        studies=[{key: entry[key] for key in ("observer_study_index", "source_study_id", "sampler_class", "pruner_class", "directions", "effective_configuration_state")}
                 for entry in value["studies"]],
        sample_trials=value["trials"][:4] + value["trials"][-4:] if len(value["trials"]) > 8 else list(value["trials"]),
    )
    summary["sampled_trial_count"] = len(summary["sample_trials"])
    summary["omitted_sample_trial_count"] = len(value["trials"]) - len(summary["sample_trials"])
    while len(_encoded(summary)) > SAMPLER_TRACE_SUMMARY_MAX_BYTES and summary["sample_trials"]:
        summary["sample_trials"].pop(len(summary["sample_trials"]) // 2)
        summary["sampled_trial_count"] -= 1
        summary["omitted_sample_trial_count"] += 1
    if len(_encoded(summary)) > SAMPLER_TRACE_SUMMARY_MAX_BYTES:
        raise ValueError("Sampler summary exceeds its retained bound")
    return value, summary
