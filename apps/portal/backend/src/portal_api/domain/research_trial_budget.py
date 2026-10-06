"""Trial bounds from the admitted image-owned descriptor, not child defaults."""
from __future__ import annotations

from typing import Any, Mapping


def expanded_trials(row: Mapping[str, Any]) -> bool:
    return row['descriptor'].get('schema_version') == 'research.expanded-trial-profile.v1'


def admitted_study_trials(row: Mapping[str, Any], value: object) -> int:
    bounds = row['public_profile']['trial_count']
    if type(value) is not int or not bounds['min'] <= value <= bounds['max']:
        raise ValueError('trial count is outside the admitted recipe range')
    return value


def child_study_trials(row: Mapping[str, Any], receipt: Mapping[str, Any]) -> int:
    if expanded_trials(row):
        if 'optuna_trials' not in receipt:
            raise ValueError('expanded recipe requires its immutable admitted trial count')
        return admitted_study_trials(row, receipt['optuna_trials'])
    if 'optuna_trials' in receipt:
        raise ValueError('historical recipe forbids a trial override')
    return admitted_study_trials(row, row['public_profile']['trial_default'])


def admitted_total_trials(row: Mapping[str, Any], trials: int, folds: int) -> int:
    trials = admitted_study_trials(row, trials)
    if type(folds) is not int or folds < 1:
        raise ValueError('trial budget requires the actual immutable fold count')
    total = trials * (folds if row['public_profile']['optimization_schedule'] != 'global' else 1)
    cap = row['public_profile'].get('max_total_trials')
    if cap is not None and total > cap:
        raise ValueError('trial count exceeds the admitted total fold budget')
    return total
