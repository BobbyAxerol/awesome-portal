"""Fast, in-memory TEST_ONLY helper tests; not the six real EPG10-T01 cases."""
from datetime import datetime, timezone
import unittest

import execution_edge_measurement as m


class MeasurementTests(unittest.TestCase):
    def runs(self):
        pins = {k: 'a'*64 if k.endswith('_sha256') else 'TEST_ONLY' for k in m.PIN_KEYS}
        pins.update(seed=110, repeat=1, event_rate='6000', duration_seconds='1',
                    duration_tolerance_seconds='0')
        return [dict(stage=stage, **pins, metric_units={'cpu': 'core_seconds'},
                    metrics={'cpu': value}, foreign_jobs_active=False, measurement_lock_owned=True,
                    correctness={'lost': 0, 'duplicate': 0, 'unauthorized': 0, 'digest_match': True},
                    monotonic_start_ns=1, monotonic_end_ns=1_000_000_001)
                for stage, value in [('B0', '1'), ('B1', '2'), ('B2', '3')]]

    def plan(self):
        return {'external_inputs': [{'id': key, 'ready': True} for key in sorted(m.INPUT_IDS)],
                'budgets': [{'id': key, 'approval_ref': 'TEST_ONLY', 'metrics':
                    [{'id': 'test_metric', 'unit': 'bytes', 'bound_kind': 'MAX_ABSOLUTE',
                      'baseline': '1', 'approved_bound': '2'}]} for key in sorted(m.BUDGET_IDS)]}

    def test_near_zero_absolute_only(self):
        for b in ['0', '.00001', '.001']:
            self.assertIsNone(m.delta(b, '.1', '.001')['percent'])

    def test_baseline_does_not_require_its_own_result(self):
        plan=self.plan()
        for row in plan['external_inputs']: row['ready']=False
        for row in plan['budgets']:
            row['approval_ref']=None
            row['metrics'][0].update(baseline=None,approved_bound=None)
        r=m.preflight(plan,None,datetime.now(timezone.utc),'baseline')
        self.assertEqual(r['status'],'BASELINE_PREPARATION_ONLY_NOT_AUTHORIZATION')
        self.assertEqual(len(r['candidate_missing_inputs']),20)
        self.assertFalse(r['starts_any_job']); self.assertFalse(r['runtime_acceptance'])
        self.assertEqual(m.preflight(plan,None,datetime.now(timezone.utc))['status'],'BLOCKED')

    def test_baseline_still_respects_foreign_host_lock(self):
        lock={'owner':'foreign','until_utc':'2099-01-01T00:00:00Z'}
        r=m.preflight(self.plan(),lock,datetime.now(timezone.utc),'baseline')
        self.assertEqual(r['blockers'],['ACTIVE_HOST_MEASUREMENT_LOCK:foreign'])

    def test_unknown_measurement_purpose_rejected(self):
        with self.assertRaises(ValueError):
            m.preflight(self.plan(),None,datetime.now(timezone.utc),'ignore_safety')

    def test_relative_and_negative_delta(self):
        self.assertEqual(m.delta('10', '8', '.001'),
                         {'absolute': '-2', 'percent': '-20.0', 'relative_status': 'AVAILABLE'})

    def test_invalid_numerics(self):
        for value in [True, 1.0, 'NaN', 'Infinity', '-1', '1e99', '1e-99']:
            with self.subTest(value=value), self.assertRaises(ValueError): m.number(value)

    def test_full_window_percentiles(self):
        r = m.percentiles([str(x) for x in range(1, 101)], 100)
        self.assertEqual((r['p50'], r['p95'], r['p99'], r['max']), ('50', '95', '99', '100'))

    def test_small_n_never_invents_p99(self):
        self.assertIsNone(m.percentiles(['1', '2'], 2)['p99'])

    def test_sampled_tail_not_full_population(self):
        with self.assertRaises(ValueError): m.percentiles(['1'], 500)

    def test_clock_uses_positive_monotonic_duration(self):
        self.assertEqual(m.elapsed_ns(1, 1_000_000_001), 1)
        for end in [0, 1]:
            with self.assertRaises(ValueError): m.elapsed_ns(1, end)

    def test_backlog_includes_amplification_reserve_and_roundup(self):
        self.assertEqual(m.backlog('101', '2.1', '1.5', 10), 329)

    def test_catchup_requires_positive_net_rate(self):
        self.assertEqual(m.catchup(100, '20', '10'), '10')
        for replay in ['9', '10']:
            with self.assertRaises(ValueError): m.catchup(100, replay, '10')

    def test_every_memory_copy_and_replica_counted(self):
        group = {'id': 'TEST_ONLY', 'owner': 'test', 'replicas': 3,
                 'bytes': {k: 10 for k in m.PARTS}}
        self.assertEqual(m.memory_total([group]), 210)
        del group['bytes']['allocator_reserve']
        with self.assertRaises(ValueError): m.memory_total([group])

    def test_no_unowned_duplicate_or_zero_replica_group(self):
        for update in [{'owner': ''}, {'replicas': 0}]:
            group = dict(id='test', owner='test', replicas=1, bytes={k: 0 for k in m.PARTS})
            group.update(update)
            with self.assertRaises(ValueError): m.memory_total([group])

    def test_all_three_deltas(self):
        result = m.compare(self.runs(), {'cpu': '.001'})
        self.assertEqual(set(result), {'B1_minus_B0', 'B2_minus_B1', 'B2_minus_B0'})
        self.assertEqual(result['B2_minus_B0']['cpu']['absolute'], '2')

    def test_every_paired_pin_required(self):
        for key in m.PIN_KEYS:
            r = self.runs(); r[1][key] = 'different'
            with self.subTest(key=key), self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_no_truncated_fixture_digest(self):
        r = self.runs()
        for row in r: row['fixture_sha256'] = 'abcdef'
        with self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_no_foreign_job_or_missing_lock_ownership(self):
        for update in [{'foreign_jobs_active': True}, {'measurement_lock_owned': False}]:
            r = self.runs(); r[1].update(update)
            with self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_correctness_is_hard_gate(self):
        for key in ['lost', 'duplicate', 'unauthorized', 'digest_match']:
            r = self.runs(); r[1]['correctness'][key] = False if key == 'digest_match' else 1
            with self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_metrics_units_and_population_not_silently_dropped(self):
        for update in [{'metrics': {}}, {'metric_units': {'cpu': 'percent'}}]:
            r = self.runs(); r[1].update(update)
            with self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_duplicate_stage_not_complete_triplet(self):
        r = self.runs(); r[2]['stage'] = 'B1'
        with self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_actual_duration_must_match_declared_window(self):
        r = self.runs(); r[1]['monotonic_end_ns'] = 10_000_000_001
        with self.assertRaisesRegex(ValueError, 'ACTUAL_DURATION'): m.compare(r, {'cpu': '0'})

    def test_tolerance_and_numeric_workload_are_validated(self):
        for key, value in [('duration_tolerance_seconds', '1'), ('duration_seconds', '0'),
                           ('event_rate', '-1'), ('seed', True), ('repeat', 0)]:
            r = self.runs()
            for row in r: row[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError): m.compare(r, {'cpu': '0'})

    def test_idle_zero_business_events_is_a_valid_workload(self):
        r = self.runs()
        for row in r: row['event_rate'] = '0'
        self.assertEqual(len(m.compare(r, {'cpu': '0'})), 3)

    def test_foreign_lock_blocks_and_expired_lock_not_removed(self):
        plan = self.plan()
        lock = {'owner': 'other', 'until_utc': '2026-10-16T00:00:00Z'}
        now = datetime(2026, 10, 15, tzinfo=timezone.utc)
        self.assertEqual(m.preflight(plan, lock, now)['status'], 'BLOCKED')
        lock['until_utc'] = '2026-10-14T00:00:00Z'
        self.assertEqual(m.preflight(plan, lock, now)['status'], 'INPUTS_COMPLETE_NOT_AUTHORIZATION')

    def test_missing_external_inputs_and_bounds_not_unlimited(self):
        plan = self.plan()
        plan['external_inputs'][0]['ready'] = False
        budget = next(b for b in plan['budgets'] if b['id'] == 'B-EDGE')
        budget['metrics'][0]['baseline'] = None
        result = m.preflight(plan, None, datetime.now(timezone.utc))
        self.assertEqual(result['blockers'], [plan['external_inputs'][0]['id'], 'UNDECIDED:B-EDGE'])
        self.assertFalse(result['runtime_acceptance'])
        self.assertFalse(result['starts_any_job'])

    def test_empty_missing_or_duplicate_registers_fail_closed(self):
        for key in ['external_inputs', 'budgets']:
            for change in ['empty', 'missing', 'duplicate']:
                plan = self.plan()
                plan[key] = [] if change == 'empty' else plan[key][:-1] if change == 'missing' else plan[key][:-1] + [plan[key][0]]
                with self.subTest(key=key, change=change), self.assertRaises(ValueError):
                    m.preflight(plan, None, datetime.now(timezone.utc))

    def test_invalid_budget_numbers_rejected(self):
        for key in ['baseline', 'approved_bound']:
            for value in ['garbage', '-1', 'NaN', True]:
                plan = self.plan(); plan['budgets'][0]['metrics'][0][key] = value
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    m.preflight(plan, None, datetime.now(timezone.utc))

    def test_budget_metric_metadata_cannot_be_omitted(self):
        for key in ['metrics', 'unit', 'bound_kind']:
            plan = self.plan()
            if key == 'metrics': plan['budgets'][0][key] = []
            else: del plan['budgets'][0]['metrics'][0][key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.preflight(plan, None, datetime.now(timezone.utc))


if __name__ == '__main__':
    unittest.main()
