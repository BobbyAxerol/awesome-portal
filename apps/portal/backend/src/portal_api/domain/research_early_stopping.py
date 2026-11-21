"""Engine-owned optional patience; declared trials remain a bounded ceiling."""
from typing import Any, Mapping


def admitted_early_stopping(spec: Mapping[str, Any], *, optimizing: bool = True) -> int | None:
    value = spec.get("early_stopping")
    if value is None:
        return None
    trials = spec.get("optuna_trials")
    if not optimizing:
        raise ValueError("early stopping is not applicable to a fixed execution recipe")
    if type(value) is not int or type(trials) is not int or not 1 <= value <= trials:
        raise ValueError("early stopping must be an integer from 1 to the declared trials per study")
    return value


def study_trial_count_admitted(actual: int, budget: int, patience: int | None) -> bool:
    return type(actual) is int and (actual == budget if patience is None else 1 <= actual <= budget)


def validate_study_trial_count(actual: int, budget: int, patience: int | None) -> None:
    if not study_trial_count_admitted(actual, budget, patience):
        raise ValueError("source trial count does not match its admitted per-study budget")
