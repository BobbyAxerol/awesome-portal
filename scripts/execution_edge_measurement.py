#!/usr/bin/env python3
"""Offline EPG10-01 comparison/sizing helpers, NOT a load or runtime admission tool.

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


def preflight(plan, lock, now):
    if (len(plan['external_inputs']) != len(INPUT_IDS)
            or {x['id'] for x in plan['external_inputs']} != INPUT_IDS):
        raise ValueError('ALL_EXTERNAL_INPUT_IDS_REQUIRED')
    if len(plan['budgets']) != len(BUDGET_IDS) or {b['id'] for b in plan['budgets']} != BUDGET_IDS:
        raise ValueError('ALL_FOURTEEN_UNIQUE_BUDGET_IDS_REQUIRED')
    blockers = [x['id'] for x in plan['external_inputs'] if x['ready'] is not True]
    if lock:
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
            blockers.append('UNDECIDED:' + b['id'])
    return {'status': 'BLOCKED' if blockers else 'INPUTS_COMPLETE_NOT_AUTHORIZATION',
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
    p.add_argument('--lock', type=Path, default=Path('/home/bobby/.local/state/host-measurement-window.lock'))
    args = p.parse_args()
    try:
        plan = read_json(args.plan)
        lock = read_json(args.lock) if args.lock.exists() else None
        result = preflight(plan, lock, datetime.now(timezone.utc))
        if args.runs and result['blockers']:
            print(json.dumps(result)); return 2
        if args.runs:
            result['comparison'] = compare(read_json(args.runs), plan['near_zero_by_metric'])
        print(json.dumps(result, sort_keys=True))
        return 2 if result['blockers'] else 0
    except (ValueError, TypeError, KeyError, OSError, AttributeError) as exc:
        print(json.dumps({'status': 'FAIL', 'reason': str(exc), 'runtime_acceptance': False}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
