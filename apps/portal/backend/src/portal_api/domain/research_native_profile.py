"""Exact native profile facts, independent of the QuantBT import boundary."""
from __future__ import annotations
import hashlib
import json
from datetime import datetime
from typing import Any
from .research_execution_recipes import execution_recipe, execution_recipe_qualification


def is_native_profile(profile_id: str) -> bool:
    try:
        return execution_recipe(profile_id)['descriptor']['schema_version'] == 'research.native-route-profile.v1'
    except ValueError:
        return False


def native_profile(profile_id: str, digest: str | None) -> dict[str, Any]:
    row = execution_recipe(profile_id, digest)
    if not is_native_profile(profile_id):
        raise ValueError('exact installed native profile required')
    return row


def native_enabled(profile_id: str, env: dict[str, str]) -> bool:
    if not is_native_profile(profile_id) or env.get('PORTAL_FEATURE_RESEARCH_FULL06_PROFILE') != 'true':
        return False
    return execution_recipe_qualification(profile_id)['kind'] == 'PRODUCT_RUN_QUALIFIED' or (
        env.get('PORTAL_ENV') == 'local' and env.get('PORTAL_RECIPE_QUALIFICATION_PROFILE_ID') == profile_id)


def validate_native_spec(spec: dict[str, Any], row: dict[str, Any]) -> None:
    p = row['descriptor']
    if (spec.get('schema_version') != p['requested_spec_version']
            or spec.get('execution_route') != p['execution_route'] or spec.get('protocol') != p['protocol']
            or spec.get('optimization_mode') != 'mode_1_decay' or spec.get('optimization_schedule') != 'global'
            or type(spec.get('optuna_trials')) is not int or spec['optuna_trials'] != 1
            or any(spec.get(k) is not None for k in ('walk_forward', 'random_seed', 'early_stopping'))
            or any(spec.get(k) for k in ('route_params', 'optimization_config', 'parameter_space_overrides'))
            or spec.get('client', {}).get('engine_release_id') != 'er_quantbt_111'
            or spec.get('data', {}).get('dataset_id') != p['dataset_id']
            or spec.get('data', {}).get('timeframe') != '1h'
            or spec.get('data', {}).get('symbol') not in {'BTCUSDT', 'ETHUSDT', 'SOLUSDT'}
            or spec.get('alpha_binding', {}).get('alpha_version_id') != p['alpha_binding_requirements']['alpha_version_id']):
        raise ValueError('native fixed request does not match immutable input/route/Alpha recipe')
    windows = spec.get('windows')
    if not isinstance(windows, dict) or set(windows) != {'is', 'oos', 'holdout'}:
        raise ValueError('native fixed request requires its three exact window bounds')
    edges = []
    for name in ('is', 'oos', 'holdout'):
        window = windows[name]
        if not isinstance(window, dict) or set(window) != {'start', 'end_exclusive'}:
            raise ValueError('native fixed window boundary is invalid')
        pair = [datetime.fromisoformat(window[key].replace('Z', '+00:00')) for key in ('start', 'end_exclusive')]
        if any(t.tzinfo is None or int(t.timestamp()*1000) % 3_600_000 for t in pair) or pair[0] >= pair[1]:
            raise ValueError('native fixed window requires closed UTC 1h edges')
        edges.extend(pair)
    if edges[1] != edges[2] or edges[3] != edges[4] or (edges[5]-edges[0]).total_seconds() > 92*86400:
        raise ValueError('native fixed chronology/span does not match its bounded recipe')


def native_work_payload(research: Any) -> dict[str, Any]:
    return dict(schema_version='research.native-fixed-work.v1',
        requested_spec_digest=research.requested_spec_digest, effective_spec_digest=research.effective_spec_digest,
        dataset_binding_digest=research.dataset_binding_digest, manifest_digest=research.manifest_digest,
        snapshot=dict(snapshot_id=research.snapshot_id, snapshot_content_hash=research.snapshot_content_hash),
        alpha=dict(alpha_id=research.alpha_id, alpha_version_id=research.alpha_version_id,
                   adapter_id=research.execution_adapter_id, adapter_contract_digest=research.adapter_contract_digest,
                   fixed_parameters=research.p04_parameters),
        execution_profile=dict(profile_id=research.execution_profile_id, profile_digest=research.execution_profile_digest),
        engine_release_id=research.requested_spec['client']['engine_release_id'], requested_spec=research.requested_spec)


def native_work_digest(research: Any) -> str:
    return hashlib.sha256(json.dumps(native_work_payload(research), sort_keys=True,
                         separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
