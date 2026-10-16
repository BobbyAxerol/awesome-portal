"""Offline operational-contract drill/validation, NOT a runtime alert service.

Only bounded public manifests and symbolic reason codes; no DB/network/secret.
"""
import json
from pathlib import Path

MANIFEST = 'deploy/manifests/execution-edge-operations.v1.json'
REGISTRY = 'services/portal-execution-edge-rs/contracts/execution-catalogue-v1/registry.json'
ALERTS = {'source-gap', 'source-backlog', 'stale-data', 'cursor-expired', 'slow-client',
          'authority', 'revoke-channel', 'unknown-command', 'projection-integrity',
          'tls', 'storage', 'watch-backlog', 'score-backlog', 'policy-revision', 'correction'}
RETURNS = {'SOURCE', 'TRUST', 'COMMAND', 'RESEARCH', 'LOAD', 'RELEASE'}


def load(root, relative):
    path = Path(root) / relative
    if path.is_symlink() or path.resolve() != path.absolute() or not path.is_file():
        raise ValueError('EXACT_PUBLIC_FILE_REQUIRED')
    if not 0 < path.stat().st_size <= 256 * 1024:
        raise ValueError('BOUNDED_PUBLIC_FILE_REQUIRED')
    return json.loads(path.read_text())


def transition(alert, value):
    """Exercise written triage routing; unknown telemetry is never CLEAR."""
    if not isinstance(value, str):
        raise ValueError('SYMBOLIC_SIGNAL_REQUIRED')
    if value in alert['fire']:
        state = 'FIRING'
    elif value in alert['clear']:
        state = 'RECOVERED'
    else:
        state = 'UNKNOWN_CONTAIN'
    return dict(state=state, owner=alert['owner'], reason=alert['id'],
                action=alert['recovery'] if state == 'RECOVERED' else alert['action'])


def validate(root):
    doc = load(root, MANIFEST)
    registry = load(root, REGISTRY)
    if (doc['schema'] != 'execution.edge-operations.v1'
            or doc['status'] != 'INDEPENDENT_HANDOFF_SOURCE_DARK'
            or set(doc['activation']) != {'source', 'read_route', 'commands', 'live_traffic', 'alerts_installed'}
            or any(value is not False for value in doc['activation'].values())
            or doc['production_budget'] is not None
            or doc['production_on_call'] != 'UNBOUND_PRIVATE_RELEASE_INPUT'):
        raise ValueError('NO_RUNTIME_AUTHORITY_OR_INVENTED_BUDGET')
    ids = {family['id'] for family in registry['families']}
    policies = doc['retention']
    if len(ids) != 42 or {p['id'] for p in policies} != ids or len(policies) != len(ids):
        raise ValueError('EXACT_FULL_CATALOGUE_REQUIRED')
    for p in policies:
        original = next(f for f in registry['families'] if f['id'] == p['id'])
        if (p['owner'] != original['owner'] or p['source_history_scope'] != original['history_scope']
                or p['retention_seconds'] is not None or p['archive_floor'] is not None
                or p['state'] != 'UNQUALIFIED_NOT_RUNTIME_BOUND'
                or p['quality'] != 'SOURCE_COVERAGE_REQUIRED'):
            raise ValueError('NO_INVENTED_HISTORY_RETENTION_OR_QUALITY')
    alerts = doc['alerts']
    if len(alerts) != 15 or {a['id'] for a in alerts} != ALERTS:
        raise ValueError('EXACT_ALERT_MATRIX_REQUIRED')
    for a in alerts:
        if (not all(a[k] for k in ('id', 'owner', 'signal', 'fire', 'clear', 'action', 'recovery'))
                or set(a['fire']) & set(a['clear']) or 'UNKNOWN' in a['clear']):
            raise ValueError('ACTIONABLE_FAIL_CLOSED_ALERT_REQUIRED')
        for value in a['fire']:
            assert transition(a, value)['state'] == 'FIRING'
        for value in a['clear']:
            assert transition(a, value)['state'] == 'RECOVERED'
        assert transition(a, 'MISSING_TELEMETRY')['state'] == 'UNKNOWN_CONTAIN'
    for relative in doc['references']:
        if not isinstance(relative, str) or '..' in Path(relative).parts or Path(relative).is_absolute():
            raise ValueError('REPOSITORY_REFERENCE_REQUIRED')
        path = Path(root) / relative
        if path.is_symlink() or not path.is_file():
            raise ValueError('REFERENCE_NOT_RESOLVED')
    if set(doc['xlc']) != {f'XLC-{i:02d}' for i in range(1, 12)}:
        raise ValueError('COMPLETE_XLC_TRACEABILITY_REQUIRED')
    if (len(doc['acceptance']) != 5
            or {case['id'] for case in doc['acceptance']} != {f'T11-{i:02d}' for i in range(1, 6)}):
        raise ValueError('EXACT_ACCEPTANCE_CASES_REQUIRED')
    for case in doc['acceptance']:
        if (case['connected'] != 'NOT_MET' or not case['returns']
                or not set(case['returns']) <= RETURNS):
            raise ValueError('NO_UNEARNED_CONNECTED_PASS')
    return dict(status='PASS_OFFLINE_OPERATIONS_CONTRACT_ONLY', alerts=len(alerts),
                catalogue_families=len(policies), xlc=len(doc['xlc']),
                connected_acceptance=False, alert_installation=False)
