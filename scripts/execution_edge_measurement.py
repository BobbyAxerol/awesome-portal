#!/usr/bin/env python3
"""Offline EPG10-01/06 comparison/sizing helpers, NOT a load or runtime admission tool.

Reuse TS/DL native workload/sampling tools on their approved isolated target.
This script never starts them, queries a database, contacts a service or writes.
All example/test numbers have TEST_ONLY provenance, never production defaults.
"""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_CEILING, localcontext
import json
from pathlib import Path
import re

PARTS = ('queues', 'inflight_copies', 'decompressed', 'cache', 'pool_tasks',
         'runtime', 'allocator_reserve')
PIN_KEYS = ('fixture_sha256', 'source_set_sha256', 'common_config_sha256',
            'hardware_sha256', 'coverage_sha256', 'cache_regime', 'seed',
            'event_rate', 'duration_seconds', 'duration_tolerance_seconds', 'repeat')
BUDGET_IDS = {'B-TS-CPU', 'B-TS-RAM', 'B-TS-DB', 'B-TS-IO', 'B-TRADE',
              'B-RS', 'B-FRESH', 'B-REVOKE', 'B-RECOVERY', 'B-CMD',
              'B-HISTORY', 'B-DL', 'B-EDGE', 'B-ANALYTICS'}
INPUT_IDS = {'CLEAN_HK_WINDOW', 'CLEAN_SGP_WINDOW', 'ISOLATED_B0_B1_B2_TARGET',
             'PAIR_RUNTIME_AND_COVERAGE', 'FIXTURE_AND_CARDINALITY', 'CLOCK_CALIBRATION'}


def number(value):
    if not isinstance(value, str) or len(value) > 64:
        raise ValueError('DECIMAL_STRING_REQUIRED')
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError('INVALID_DECIMAL') from exc
    if (not result.is_finite() or result < 0 or result.adjusted() > 24
            or abs(result.as_tuple().exponent) > 24 or len(result.as_tuple().digits) > 32):
        raise ValueError('INVALID_NONNEGATIVE_FINITE_DECIMAL')
    return result


def integer(value):
    if type(value) is not int or not 0 <= value <= 10**24:
        raise ValueError('NONNEGATIVE_INTEGER_REQUIRED')
    return value


def delta(baseline, candidate, near_zero):
    b, c, epsilon = map(number, (baseline, candidate, near_zero))
    with localcontext() as ctx:
        ctx.prec = 128
        absolute = c - b
        return {'absolute': str(absolute),
                'percent': str(absolute / b * 100) if b > epsilon else None,
                'relative_status': 'AVAILABLE' if b > epsilon else 'ABSOLUTE_ONLY'}


def percentiles(samples, population):
    if not isinstance(samples, list) or not 1 <= len(samples) <= 100_000:
        raise ValueError('BOUNDED_NONEMPTY_WINDOW_REQUIRED')
    if integer(population) != len(samples):
        raise ValueError('FULL_WINDOW_REQUIRED_NOT_SAMPLED_TAIL')
    ordered = sorted(number(x) for x in samples)

    def nearest(q):
        rank = int((Decimal(q) * len(ordered)).to_integral_value(rounding=ROUND_CEILING))
        return str(ordered[max(1, rank) - 1])

    return {'n': len(samples), 'p50': nearest('.50'), 'p95': nearest('.95'),
            'p99': nearest('.99') if len(samples) >= 100 else None,
            'max': str(ordered[-1]), 'method': 'FULL_WINDOW_NEAREST_RANK'}


def elapsed_ns(start, end):
    if integer(end) <= integer(start):
        raise ValueError('MONOTONIC_WINDOW_REQUIRED')
    return Decimal(end - start) / Decimal(1_000_000_000)


def backlog(peak_bytes_per_second, outage_seconds, amplification, reserve_bytes):
    rate, seconds, amp = map(number, (peak_bytes_per_second, outage_seconds, amplification))
    if seconds <= 0 or amp < 1:
        raise ValueError('POSITIVE_OUTAGE_AND_MEASURED_AMPLIFICATION_REQUIRED')
    with localcontext() as ctx:
        ctx.prec = 128
        return int((rate * seconds * amp).to_integral_value(rounding=ROUND_CEILING)) + integer(reserve_bytes)


def catchup(backlog_events, replay_events_per_second, producer_events_per_second):
    with localcontext() as ctx:
        ctx.prec = 128
        net = number(replay_events_per_second) - number(producer_events_per_second)
        if net <= 0:
            raise ValueError('NO_SUSTAINABLE_CATCHUP_CAPACITY')
        return str(Decimal(integer(backlog_events)) / net)


def memory_total(groups):
    if not isinstance(groups, list) or not groups:
        raise ValueError('ALL_PROCESS_GROUPS_REQUIRED')
    result, seen = 0, set()
    for g in groups:
        if not g.get('owner') or not g.get('id') or g['id'] in seen:
            raise ValueError('UNIQUE_GROUP_AND_OWNER_REQUIRED')
        seen.add(g['id'])
        parts = g.get('bytes', {})
        if set(parts) != set(PARTS) or integer(g['replicas']) < 1:
            raise ValueError('ALL_COPIES_POOLS_QUEUES_RESERVES_REQUIRED')
        result += g['replicas'] * sum(integer(parts[k]) for k in PARTS)
    return result


def prepare_target(target):
    """Prepare EPG10-06 offline; unknown observations never become zero/budgets.

    Logical admission charges are NOT malloc/RSS limits. Cache/hub registrations
    are already inside the shared envelope, not additional envelope-sized pools.
    This does not launch a target, collect metrics or authorize any measurement.
    """
    if target['schema'] != 'epg10-06-target/v1' or target['provenance'] != 'TEST_ONLY':
        raise ValueError('VERSIONED_TEST_ONLY_TARGET_REQUIRED')
    e, w, cache, hub = (target[k] for k in ('envelope', 'work', 'cache', 'fanout'))
    for config in (e, w, cache, hub):
        for value in config.values():
            if integer(value) < 1:
                raise ValueError('POSITIVE_LOGICAL_TARGET_LIMIT_REQUIRED')
    for axis in ('active', 'entries', 'bytes'):
        if e['foreground_reserved_' + axis] >= e['max_' + axis]:
            raise ValueError('FOREGROUND_AND_BACKGROUND_RESERVE_REQUIRED')
    if (w['group_bytes'] > 8 * 1024**2 or w['group_events'] > 1000
            or w['query_bytes'] > 1024**2 or w['page_bytes'] > 1024**2
            or w['manifest_bytes'] > min(1024**2, w['page_bytes'])
            or w['query_rows'] > 200 or w['page_rows'] > 200):
        raise ValueError('RUST_WORK_LIMIT_MISMATCH')
    if (not 1 <= cache['max_entries'] <= 4096 or not 1 <= cache['max_flights'] <= 64
            or cache['max_bytes'] > 64 * 1024**2
            or not 1 <= hub['clients'] <= 4096 or not 1 <= hub['queue_entries'] <= 4096
            or not 1 <= hub['notice_bytes'] <= 1024**2
            or not hub['notice_bytes'] <= hub['client_queue_bytes'] <= hub['total_queue_bytes'] <= 64 * 1024**2):
        raise ValueError('RUST_CACHE_FANOUT_LIMIT_MISMATCH')
    # Must cover each admitted work shape, including bootstrap's actual manifest
    # and page bounds. Commit charges configured group_events, not actual rows.
    charge_bytes = max(4 * w['group_bytes'], 3 * w['manifest_bytes'],
                       4 * w['query_bytes'], 3 * w['page_bytes'], 4 * 1024**2)
    charge_entries = max(w['group_events'], w['manifest_datasets'],
                         w['query_rows'], w['page_rows'], 200)
    static_bytes = cache['max_bytes'] + hub['total_queue_bytes']
    static_entries = cache['max_entries'] + cache['max_flights'] + hub['clients'] * hub['queue_entries']
    all_bytes = static_bytes + e['max_active'] * charge_bytes
    all_entries = static_entries + e['max_active'] * charge_entries
    bg_active = e['max_active'] - e['foreground_reserved_active']
    bg_bytes = static_bytes + bg_active * charge_bytes
    bg_entries = static_entries + bg_active * charge_entries
    if (all_bytes > e['max_bytes'] or all_entries > e['max_entries']
            or bg_bytes > e['max_bytes'] - e['foreground_reserved_bytes']
            or bg_entries > e['max_entries'] - e['foreground_reserved_entries']
            or charge_bytes > e['foreground_reserved_bytes']
            or charge_entries > e['foreground_reserved_entries']):
        raise ValueError('LOGICAL_CONCURRENCY_DOES_NOT_FIT_SHARED_ENVELOPE')
    replicas = integer(target['replicas'])
    pool = target['pool']
    if not replicas or not e['max_active'] <= integer(pool['per_replica']) <= 64:
        raise ValueError('GOVERNED_POOL_MUST_COVER_ACTIVE_WORK')
    connections = replicas * pool['per_replica'] + integer(pool['other_connections'])
    if connections > integer(pool['isolated_database_max_connections']):
        raise ValueError('ALL_REPLICA_POOLS_EXCEED_DATABASE_CAP')

    unknown, subtotal, seen = [], 0, set()
    for group in target['memory_groups']:
        name = group['id']
        if not name or name in seen or not group['owner'] or not integer(group['replicas']):
            raise ValueError('UNIQUE_OWNED_MEMORY_GROUP_REQUIRED')
        seen.add(name)
        if set(group['bytes']) != set(PARTS):
            raise ValueError('ALL_MEMORY_PARTS_REQUIRED_EVEN_IF_UNKNOWN')
        missing = {k for k, v in group['bytes'].items() if v is None}
        if set(group['unknown_reasons']) != missing or any(not group['unknown_reasons'][k] for k in missing):
            raise ValueError('UNKNOWN_MEMORY_NEEDS_EXPLICIT_REASON')
        unknown.extend(name + ':' + key for key in sorted(missing))
        subtotal += group['replicas'] * sum(integer(v) for v in group['bytes'].values() if v is not None)
    if not seen:
        raise ValueError('MEMORY_GROUPS_REQUIRED')
    if (len(target['required_memory_groups']) != len(seen)
            or set(target['required_memory_groups']) != seen):
        raise ValueError('ALL_DECLARED_TARGET_MEMORY_GROUPS_REQUIRED')
    matching = [g for g in target['memory_groups'] if g['id'] == target['memory_group_id']]
    if len(matching) != 1 or matching[0]['replicas'] != replicas:
        raise ValueError('GOVERNED_MEMORY_GROUP_MUST_COVER_ALL_REPLICAS')
    if {b['id'] for b in target['budget_collectors']} != BUDGET_IDS or len(target['budget_collectors']) != 14:
        raise ValueError('ALL_FOURTEEN_BUDGET_COLLECTION_MAPPINGS_REQUIRED')
    for row in target['budget_collectors']:
        for key in ('collector', 'population', 'availability', 'missing'):
            if not isinstance(row[key], str) or not row[key]:
                raise ValueError('EXPLICIT_COLLECTOR_POPULATION_AND_AVAILABILITY_REQUIRED')

    pins = target['pins']
    if set(pins) != set(PIN_KEYS) - {'event_rate', 'duration_seconds', 'repeat'}:
        raise ValueError('EXACT_COMMON_CAMPAIGN_PINS_REQUIRED')
    blockers = ['UNKNOWN_MEMORY:' + key for key in unknown]
    for key, value in pins.items():
        if value is None:
            blockers.append('UNBOUND_PIN:' + key)
        elif key.endswith('_sha256'):
            if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
                raise ValueError('FULL_DIGEST_REQUIRED:' + key)
        elif key == 'seed':
            integer(value)
        elif key == 'duration_tolerance_seconds':
            if number(value) >= 600:
                raise ValueError('BOUNDED_DURATION_TOLERANCE_REQUIRED')
        elif not isinstance(value, str) or not value:
            raise ValueError('EXPLICIT_CACHE_REGIME_REQUIRED')
    stages = target['stage_artifacts']
    if set(stages) != {'B0', 'B1', 'B2'}:
        raise ValueError('ALL_THREE_STAGE_ARTIFACTS_REQUIRED')
    for stage, artifact in stages.items():
        if set(artifact) != {'image_sha256', 'config_sha256', 'composition_ref'}:
            raise ValueError('EXACT_STAGE_ARTIFACT_PINS_REQUIRED')
        for key, value in artifact.items():
            if value is None:
                blockers.append('UNBOUND_STAGE:' + stage + ':' + key)
            elif key.endswith('_sha256'):
                if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
                    raise ValueError('FULL_STAGE_DIGEST_REQUIRED')
            elif not isinstance(value, str) or not value:
                raise ValueError('STAGE_COMPOSITION_REFERENCE_REQUIRED')
    # Counterbalanced order for independent repeats; never shorten to a smoke
    # window or reinterpret TRADE events/s as dashboard/users/financial orders.
    cells = [{'stage': stage, 'event_rate': rate, 'duration_seconds': '600',
              'repeat': repeat, 'pins': pins, 'artifacts': stages[stage]}
             for rate in ('6000', '9000') for repeat, order in
             ((1, ('B0', 'B1', 'B2')), (2, ('B2', 'B1', 'B0'))) for stage in order]
    return {'status': 'OFFLINE_TARGET_PREPARED_NOT_EXECUTED',
            'logical': {'per_replica_static_bytes': static_bytes, 'per_work_bytes': charge_bytes,
                        'per_work_entries': charge_entries, 'all_active_bytes': all_bytes,
                        'all_active_entries': all_entries, 'background_bytes': bg_bytes,
                        'background_entries': bg_entries, 'all_replica_bytes': replicas * all_bytes,
                        'all_connections_including_other': connections},
            'memory': {'known_subtotal_bytes': subtotal, 'unknown': unknown,
                       'total_bytes': None if unknown else subtotal,
                       'logical_charges_are_not_rss': True},
            'cells': cells, 'execution_blockers': blockers,
            'requires_existing_measurement_preflight_and_runtime_binding': True,
            'runtime_acceptance': False, 'starts_any_job': False}


def compare_target_runs(target, runs, epsilon):
    prepared = prepare_target(target)
    if prepared['execution_blockers']:
        raise ValueError('TARGET_NOT_BOUND_FOR_COMPARISON')
    if not isinstance(runs, list) or len(runs) != 12:
        raise ValueError('ALL_TWELVE_COEXISTENCE_CELLS_REQUIRED')
    cells = {(r['event_rate'], r['repeat'], r['stage']): r for r in runs}
    expected = {(c['event_rate'], c['repeat'], c['stage']) for c in prepared['cells']}
    if set(cells) != expected:
        raise ValueError('DUPLICATE_MISSING_OR_CHANGED_COEXISTENCE_CELL')
    for row in runs:
        if row.get('metric_units') != runs[0].get('metric_units'):
            raise ValueError('CAMPAIGN_METRIC_UNIT_MISMATCH')
        if row['duration_seconds'] != '600':
            raise ValueError('ORIGINAL_SIX_HUNDRED_SECOND_WINDOW_REQUIRED')
        if any(row.get(k) != v for k, v in target['pins'].items()):
            raise ValueError('CAMPAIGN_COMMON_PIN_MISMATCH')
        if row.get('artifacts') != target['stage_artifacts'][row['stage']]:
            raise ValueError('STAGE_ARTIFACT_MISMATCH')
    return {rate + ':' + str(repeat): compare(
                [cells[rate, repeat, stage] for stage in ('B0', 'B1', 'B2')], epsilon)
            for rate in ('6000', '9000') for repeat in (1, 2)}


def compare(runs, epsilon):
    if not isinstance(runs, list) or len(runs) != 3:
        raise ValueError('ONE_B0_B1_B2_TRIPLET_REQUIRED')
    by_stage = {r['stage']: r for r in runs}
    if set(by_stage) != {'B0', 'B1', 'B2'}:
        raise ValueError('DUPLICATE_OR_MISSING_STAGE')
    first = by_stage['B0']
    for key in PIN_KEYS:
        if key not in first or any(r.get(key) != first[key] for r in runs):
            raise ValueError('PAIR_PIN_MISMATCH:' + key)
        if key.endswith('_sha256') and not re.fullmatch('[0-9a-f]{64}', first[key]):
            raise ValueError('FULL_DIGEST_REQUIRED:' + key)
    declared = number(first['duration_seconds'])
    tolerance = number(first['duration_tolerance_seconds'])
    if declared <= 0 or tolerance >= declared:
        raise ValueError('POSITIVE_DURATION_AND_BOUNDED_TOLERANCE_REQUIRED')
    number(first['event_rate'])  # W-IDLE legitimately has zero business events.
    integer(first['seed'])
    if integer(first['repeat']) < 1:
        raise ValueError('POSITIVE_REPEAT_REQUIRED')
    expected = first.get('metric_units')
    if not expected or not isinstance(expected, dict):
        raise ValueError('NAMED_METRICS_AND_UNITS_REQUIRED')
    for r in runs:
        if r.get('foreign_jobs_active') is not False or r.get('measurement_lock_owned') is not True:
            raise ValueError('TAINTED_OR_UNOWNED_WINDOW')
        if r.get('correctness') != {'lost': 0, 'duplicate': 0, 'unauthorized': 0,
                                    'digest_match': True}:
            raise ValueError('CORRECTNESS_BEFORE_PERFORMANCE')
        if r.get('metric_units') != expected or set(r.get('metrics', {})) != set(expected):
            raise ValueError('INCOMPLETE_METRICS_OR_UNIT_MISMATCH')
        if abs(elapsed_ns(r['monotonic_start_ns'], r['monotonic_end_ns']) - declared) > tolerance:
            raise ValueError('ACTUAL_DURATION_OUTSIDE_DECLARED_TOLERANCE')
    if set(epsilon) != set(expected) or any(not isinstance(u, str) or not u for u in expected.values()):
        raise ValueError('EXACT_METRIC_THRESHOLDS_AND_UNITS_REQUIRED')
    # Different dashboard client counts are intentional between B1 and B2;
    # source coverage/seed/hardware/history MUST remain identical.
    return {a + '_minus_' + b: {key: delta(by_stage[b]['metrics'][key],
            by_stage[a]['metrics'][key], epsilon[key]) for key in expected}
            for a, b in [('B1', 'B0'), ('B2', 'B1'), ('B2', 'B0')]}


def preflight(plan, lock, now, purpose='candidate'):
    if purpose not in ('candidate','baseline'):
        raise ValueError('UNKNOWN_MEASUREMENT_PURPOSE')
    if (len(plan['external_inputs']) != len(INPUT_IDS)
            or {x['id'] for x in plan['external_inputs']} != INPUT_IDS):
        raise ValueError('ALL_EXTERNAL_INPUT_IDS_REQUIRED')
    if len(plan['budgets']) != len(BUDGET_IDS) or {b['id'] for b in plan['budgets']} != BUDGET_IDS:
        raise ValueError('ALL_FOURTEEN_UNIQUE_BUDGET_IDS_REQUIRED')
    missing = [x['id'] for x in plan['external_inputs'] if x['ready'] is not True]
    blockers = missing.copy() if purpose == 'candidate' else []
    # Baseline mode only prepares an offline descriptor. Future absolute
    # measurement readiness respects exclusive windows, not correctness work.
    if purpose == 'candidate' and lock:
        lock_class = lock.get('class', 'measurement')  # Legacy locks were exclusive.
        if lock_class not in ('measurement', 'correctness'):
            raise ValueError('UNKNOWN_HOST_LOCK_CLASS')
        if lock_class == 'measurement':
            deadline = datetime.fromisoformat(lock['until_utc'].replace('Z', '+00:00'))
            if deadline.tzinfo is None:
                raise ValueError('UTC_LOCK_DEADLINE_REQUIRED')
            if deadline > now:
                blockers.append('ACTIVE_HOST_MEASUREMENT_LOCK:' + lock['owner'])
    for b in plan['budgets']:
        if not b.get('metrics') or len({x['id'] for x in b['metrics']}) != len(b['metrics']):
            raise ValueError('NONEMPTY_UNIQUE_BUDGET_METRICS_REQUIRED')
        undecided = False
        for metric in b['metrics']:
            if not metric.get('unit') or not metric.get('bound_kind'):
                raise ValueError('BUDGET_UNITS_AND_BOUND_KIND_REQUIRED')
            for key in ('baseline', 'approved_bound'):
                if metric[key] is not None:
                    number(metric[key])
            undecided |= any(metric[k] is None for k in ('baseline', 'approved_bound'))
        if undecided or not b['approval_ref']:
            missing.append('UNDECIDED:' + b['id'])
            if purpose == 'candidate': blockers.append('UNDECIDED:' + b['id'])
    return {'status': 'BLOCKED' if blockers else ('BASELINE_PREPARATION_ONLY_NOT_AUTHORIZATION'
                if purpose == 'baseline' else 'INPUTS_COMPLETE_NOT_AUTHORIZATION'),
            'purpose':purpose,'candidate_missing_inputs':missing,
            'blockers': blockers, 'runtime_acceptance': False, 'starts_any_job': False}


def read_json(path):
    # Bound evidence input before parsing; never slurp unbounded raw logs.
    with path.open('rb') as stream:
        raw = stream.read(8 * 1024 * 1024 + 1)
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('EVIDENCE_INPUT_TOO_LARGE')
    return json.loads(raw)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--plan', type=Path, required=True)
    p.add_argument('--runs', type=Path)
    p.add_argument('--target', type=Path, help='Optional offline EPG10-06 sizing/target descriptor; never starts jobs.')
    p.add_argument('--purpose',choices=('candidate','baseline'),default='candidate',
                   help='Baseline preparation does not require the baseline to exist already; actual collector enforces its host lock.')
    p.add_argument('--lock', type=Path, default=Path('/home/bobby/.local/state/host-measurement-window.lock'))
    args = p.parse_args()
    try:
        plan = read_json(args.plan)
        if args.runs and args.purpose != 'candidate':
            raise ValueError('BASELINE_PREPARATION_CANNOT_ACCEPT_CANDIDATE_RUNS')
        # No job is started here. Only future absolute-readiness reporting
        # consults today's host lock; existing receipts carry their own taint.
        lock = (read_json(args.lock) if args.purpose == 'candidate' and
                not args.runs and args.lock.exists() else None)
        result = preflight(plan, lock, datetime.now(timezone.utc),args.purpose)
        if args.runs:
            result['host_lock_check'] = 'NOT_APPLICABLE_EXISTING_RECEIPTS'
        if args.target:
            result['target_preparation'] = prepare_target(read_json(args.target))
            if args.purpose == 'candidate':
                result['blockers'].extend(result['target_preparation']['execution_blockers'])
                if result['blockers']:
                    result['status'] = 'BLOCKED'
        if args.runs and result['blockers']:
            print(json.dumps(result)); return 2
        if args.runs:
            runs = read_json(args.runs)
            result['comparison'] = (compare_target_runs(read_json(args.target), runs, plan['near_zero_by_metric'])
                                    if args.target else compare(runs, plan['near_zero_by_metric']))
        print(json.dumps(result, sort_keys=True))
        return 2 if result['blockers'] else 0
    except (ValueError, TypeError, KeyError, OSError, AttributeError) as exc:
        print(json.dumps({'status': 'FAIL', 'reason': str(exc), 'runtime_acceptance': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
