"""Fast, in-memory TEST_ONLY helper tests; not the six real EPG10-T01 cases."""
from datetime import datetime, timezone
from copy import deepcopy
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

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

    def test_baseline_preparation_does_not_wait_for_any_host_lock(self):
        for extra in ({}, {'class': 'measurement'}, {'class': 'correctness'},
                      {'class': 'TEST_ONLY_UNKNOWN'}, {'class': None}):
            lock = dict(owner='foreign', until_utc='2099-01-01T00:00:00Z', **extra)
            original = deepcopy(lock)
            with self.subTest(lock_class=extra):
                r = m.preflight(self.plan(), lock, datetime.now(timezone.utc), 'baseline')
                self.assertEqual(r['blockers'], [])
                self.assertEqual(r['status'], 'BASELINE_PREPARATION_ONLY_NOT_AUTHORIZATION')
                self.assertFalse(r['starts_any_job']); self.assertFalse(r['runtime_acceptance'])
                self.assertEqual(lock, original)

    def test_candidate_absolute_readiness_blocks_active_measurement_and_legacy_locks(self):
        for extra in ({}, {'class': 'measurement'}):
            lock = dict(owner='foreign', until_utc='2099-01-01T00:00:00Z', **extra)
            with self.subTest(lock_class=extra):
                r = m.preflight(self.plan(), lock, datetime.now(timezone.utc))
                self.assertEqual(r['status'], 'BLOCKED')
                self.assertEqual(r['blockers'], ['ACTIVE_HOST_MEASUREMENT_LOCK:foreign'])
                self.assertFalse(r['starts_any_job']); self.assertFalse(r['runtime_acceptance'])

    def test_candidate_absolute_readiness_does_not_wait_for_correctness_activity(self):
        lock = {'owner': 'foreign', 'class': 'correctness', 'until_utc': '2099-01-01T00:00:00Z'}
        r = m.preflight(self.plan(), lock, datetime.now(timezone.utc))
        self.assertEqual(r['status'], 'INPUTS_COMPLETE_NOT_AUTHORIZATION')
        self.assertEqual(r['blockers'], [])
        self.assertFalse(r['starts_any_job']); self.assertFalse(r['runtime_acceptance'])

    def test_candidate_expired_measurement_or_legacy_lock_is_not_removed_or_blocking(self):
        for extra in ({}, {'class': 'measurement'}):
            lock = dict(owner='foreign', until_utc='2026-10-19T00:00:00Z', **extra)
            original = deepcopy(lock)
            with self.subTest(lock_class=extra):
                r = m.preflight(self.plan(), lock, datetime(2026, 10, 20, tzinfo=timezone.utc))
                self.assertEqual(r['status'], 'INPUTS_COMPLETE_NOT_AUTHORIZATION')
                self.assertEqual(r['blockers'], [])
                self.assertEqual(lock, original)

    def test_candidate_unknown_lock_class_fails_closed(self):
        for value in ('TEST_ONLY_UNKNOWN', None, True, 1, {}, []):
            lock = {'owner': 'foreign', 'class': value, 'until_utc': '2099-01-01T00:00:00Z'}
            with self.subTest(class_type=type(value).__name__), \
                    self.assertRaisesRegex(ValueError, 'UNKNOWN_HOST_LOCK_CLASS'):
                m.preflight(self.plan(), lock, datetime.now(timezone.utc))

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


class TargetPreparationTests(unittest.TestCase):
    def target(self):
        return m.read_json(Path(__file__).resolve().parents[1] /
            'upgrade/evidence/execution-edge-v1_2/EPG10-06/isolated-target.json')

    def bound_target(self):
        # TEST_ONLY completeness exercise; never a measured memory/authority pin.
        t = self.target()
        for group in t['memory_groups']:
            group['bytes'] = {k: 1 for k in m.PARTS}
            group['unknown_reasons'] = {}
        for k, v in t['pins'].items():
            if v is None: t['pins'][k] = 'a' * 64
        for stage in t['stage_artifacts'].values():
            stage.update(image_sha256='b'*64, config_sha256='c'*64, composition_ref='TEST_ONLY')
        return t

    def runs(self, target):
        return [dict(stage=c['stage'], event_rate=c['event_rate'], repeat=c['repeat'],
                     duration_seconds='600', **deepcopy(target['pins']),
                     artifacts=deepcopy(c['artifacts']), metrics={'cpu': '1'},
                     metric_units={'cpu': 'core_seconds'}, foreign_jobs_active=False,
                     measurement_lock_owned=True, monotonic_start_ns=1,
                     monotonic_end_ns=600_000_000_001,
                     correctness={'lost': 0, 'duplicate': 0, 'unauthorized': 0, 'digest_match': True})
                for c in m.prepare_target(target)['cells']]

    def test_exact_logical_sizing_no_double_counted_envelope(self):
        r = m.prepare_target(self.target())
        self.assertEqual(r['logical'], dict(per_replica_static_bytes=5242880,
            per_work_bytes=33554432, per_work_entries=1000, all_active_bytes=105906176,
            all_active_entries=3257, background_bytes=72351744, background_entries=2257,
            all_replica_bytes=105906176, all_connections_including_other=5))
        self.assertFalse(r['runtime_acceptance']); self.assertFalse(r['starts_any_job'])

    def test_unknown_memory_stays_unknown_not_zero(self):
        r = m.prepare_target(self.target())
        self.assertIsNone(r['memory']['total_bytes'])
        self.assertEqual(len(r['memory']['unknown']), 21)
        self.assertEqual(r['memory']['known_subtotal_bytes'], 0)
        self.assertEqual(len(r['execution_blockers']), 35)

    def test_all_known_memory_sums_each_copy_and_replica(self):
        t = self.bound_target(); t['replicas'] = 2; t['memory_groups'][0]['replicas'] = 2
        r = m.prepare_target(t)
        self.assertEqual(r['memory']['total_bytes'], 28)
        self.assertEqual(r['logical']['all_replica_bytes'], 211812352)
        self.assertEqual(r['logical']['all_connections_including_other'], 8)
        self.assertFalse(r['runtime_acceptance'])

    def test_memory_group_cannot_omit_replicas_or_parts(self):
        for mutation in ('replicas', 'parts', 'reasons', 'duplicate', 'omit_pg'):
            t = self.target()
            if mutation == 'replicas': t['replicas'] = 2
            elif mutation == 'parts': del t['memory_groups'][0]['bytes']['runtime']
            elif mutation == 'reasons': t['memory_groups'][0]['unknown_reasons'] = {}
            elif mutation == 'omit_pg': t['memory_groups'].pop(1)
            else: t['memory_groups'] *= 2
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.prepare_target(t)

    def test_pool_all_replicas_and_reserved_connections(self):
        for update in ({'per_replica': 2}, {'per_replica': 65},
                       {'other_connections': 22}, {'isolated_database_max_connections': 4}):
            t = self.target(); t['pool'].update(update)
            with self.subTest(update=update), self.assertRaises(ValueError): m.prepare_target(t)

    def test_each_foreground_reserve_and_total_ceiling_enforced(self):
        for update in ({'max_active': 5}, {'max_bytes': 100000000}, {'max_entries': 3000},
                       {'foreground_reserved_bytes': 1}, {'foreground_reserved_entries': 1},
                       {'foreground_reserved_active': 3}):
            t = self.target(); t['envelope'].update(update)
            with self.subTest(update=update), self.assertRaises(ValueError): m.prepare_target(t)

    def test_manifest_cardinality_not_assumed_smaller_than_group(self):
        t = self.target(); t['work']['manifest_datasets'] = 3000
        with self.assertRaisesRegex(ValueError, 'DOES_NOT_FIT'): m.prepare_target(t)

    def test_independent_read_notice_entry_caps_not_omitted(self):
        t = self.target()
        for key in ('group_events', 'manifest_datasets', 'query_rows', 'page_rows'):
            t['work'][key] = 1
        self.assertEqual(m.prepare_target(t)['logical']['per_work_entries'], 200)

    def test_manifest_fits_native_cap_and_bootstrap_page(self):
        for change in ({'manifest_bytes': 2097152}, {'page_bytes': 524288}):
            t = self.target(); t['work'].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError): m.prepare_target(t)

    def test_cache_fanout_and_work_match_rust_bounds(self):
        for section, key, value in [('cache', 'max_flights', 65), ('cache', 'max_bytes', 67108865),
            ('fanout', 'clients', 4097), ('fanout', 'notice_bytes', 1048577),
            ('fanout', 'client_queue_bytes', 1024), ('work', 'group_events', 1001),
            ('work', 'query_rows', 201), ('work', 'group_bytes', 8388609)]:
            t = self.target(); t[section][key] = value
            with self.subTest(section=section, key=key), self.assertRaises(ValueError): m.prepare_target(t)

    def test_zero_negative_bool_limits_rejected(self):
        for value in (0, -1, True, '3'):
            t = self.target(); t['envelope']['max_active'] = value
            with self.subTest(value=value), self.assertRaises(ValueError): m.prepare_target(t)

    def test_all_fourteen_collector_mappings_required(self):
        for mutation in ('missing', 'duplicate', 'unattributed'):
            t = self.target()
            if mutation == 'missing': t['budget_collectors'].pop()
            elif mutation == 'duplicate': t['budget_collectors'][-1] = t['budget_collectors'][0]
            else: t['budget_collectors'][0]['population'] = ''
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.prepare_target(t)

    def test_original_twelve_cells_and_counterbalanced_order(self):
        r = m.prepare_target(self.target())
        self.assertEqual(len(r['cells']), 12)
        self.assertEqual({(x['event_rate'], x['repeat']) for x in r['cells']},
                         {('6000', 1), ('6000', 2), ('9000', 1), ('9000', 2)})
        self.assertTrue(all(c['duration_seconds'] == '600' for c in r['cells']))
        self.assertEqual([c['stage'] for c in r['cells'][:6]], ['B0', 'B1', 'B2', 'B2', 'B1', 'B0'])

    def test_missing_pins_prepare_without_inventing_execution(self):
        r = m.prepare_target(self.target())
        self.assertEqual(r['status'], 'OFFLINE_TARGET_PREPARED_NOT_EXECUTED')
        self.assertIn('UNBOUND_PIN:fixture_sha256', r['execution_blockers'])
        with self.assertRaisesRegex(ValueError, 'TARGET_NOT_BOUND'):
            m.compare_target_runs(self.target(), [], {})

    def test_pin_and_stage_schema_fail_closed(self):
        for mutation in ('digest', 'stage', 'seed', 'tolerance', 'schema', 'provenance'):
            t = self.target()
            if mutation == 'digest': t['pins']['source_set_sha256'] = 'abc'
            elif mutation == 'stage': del t['stage_artifacts']['B2']
            elif mutation == 'seed': t['pins']['seed'] = True
            elif mutation == 'tolerance': t['pins']['duration_tolerance_seconds'] = '600'
            elif mutation == 'schema': t['schema'] = 'unknown'
            else: t['provenance'] = 'PRODUCTION'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError): m.prepare_target(t)

    def test_complete_test_only_matrix_comparison(self):
        t = self.bound_target()
        self.assertEqual(set(m.compare_target_runs(t, self.runs(t), {'cpu': '0'})),
                         {'6000:1', '6000:2', '9000:1', '9000:2'})

    def test_unit_schema_cannot_change_between_complete_triplets(self):
        t = self.bound_target(); runs = self.runs(t)
        for row in runs[-3:]: row['metric_units']['cpu'] = 'percent'
        with self.assertRaisesRegex(ValueError, 'CAMPAIGN_METRIC_UNIT'):
            m.compare_target_runs(t, runs, {'cpu': '0'})

    def test_no_reduced_window_rate_repeat_or_duplicate_cell(self):
        t = self.bound_target()
        for key, value in [('duration_seconds', '1'), ('event_rate', '100'),
                           ('repeat', 3), ('stage', 'B1')]:
            runs = self.runs(t); runs[0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.compare_target_runs(t, runs, {'cpu': '0'})
        with self.assertRaises(ValueError): m.compare_target_runs(t, self.runs(t)[:-1], {'cpu': '0'})

    def test_cross_repeat_pin_changes_and_stage_artifact_mismatch_rejected(self):
        t = self.bound_target()
        for key in ('fixture_sha256', 'coverage_sha256', 'hardware_sha256', 'cache_regime', 'artifacts'):
            runs = self.runs(t); runs[-1][key] = 'different'
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.compare_target_runs(t, runs, {'cpu': '0'})

    def test_tainted_or_incorrect_cell_invalidates_complete_matrix(self):
        t = self.bound_target()
        for update in ({'foreign_jobs_active': True}, {'measurement_lock_owned': False},
                       {'monotonic_end_ns': 1}, {'metrics': {}}, {'correctness': {}}):
            runs = self.runs(t); runs[-1].update(update)
            with self.subTest(update=update), self.assertRaises(ValueError):
                m.compare_target_runs(t, runs, {'cpu': '0'})

    def cli(self, purpose='baseline', lock=None, target=None, runs=None, complete_plan=False):
        plan = MeasurementTests().plan()
        plan['near_zero_by_metric'] = {'cpu': '0'}
        if not complete_plan:
            for row in plan['external_inputs']: row['ready'] = False
            for row in plan['budgets']:
                row['approval_ref'] = None
                row['metrics'][0].update(baseline=None, approved_bound=None)
        files = {'PLAN': plan, 'TARGET': target or self.target(), 'LOCK': lock, 'RUNS': runs}
        argv = ['measurement', '--plan', 'PLAN', '--target', 'TARGET',
                '--purpose', purpose, '--lock', 'LOCK']
        if runs is not None: argv += ['--runs', 'RUNS']
        output = io.StringIO()
        with patch('sys.argv', argv), patch.object(m, 'read_json', side_effect=lambda p: files[str(p)]) as reader, \
                patch.object(Path, 'exists', return_value=lock is not None), redirect_stdout(output):
            status = m.main()
        if purpose == 'baseline' or runs is not None:
            self.assertNotIn(Path('LOCK'), [call.args[0] for call in reader.call_args_list])
        return status, json.loads(output.getvalue())

    def test_cli_prepares_without_publication_or_production_budgets(self):
        status, r = self.cli()
        self.assertEqual(status, 0)
        self.assertEqual(len(r['candidate_missing_inputs']), 20)
        self.assertEqual(len(r['target_preparation']['cells']), 12)
        self.assertFalse(r['runtime_acceptance'])

    def test_cli_foreign_lock_does_not_block_offline_descriptor_preparation(self):
        status, r = self.cli(lock={'owner': 'foreign', 'until_utc': '2099-01-01T00:00:00Z'})
        self.assertEqual(status, 0)
        self.assertEqual(r['blockers'], [])
        self.assertEqual(r['status'], 'BASELINE_PREPARATION_ONLY_NOT_AUTHORIZATION')
        self.assertEqual(r['target_preparation']['status'], 'OFFLINE_TARGET_PREPARED_NOT_EXECUTED')
        self.assertFalse(r['runtime_acceptance']); self.assertFalse(r['starts_any_job'])

    def test_cli_historical_receipts_compare_without_consulting_the_current_lock(self):
        target = self.bound_target()
        for lock_class in ('measurement', 'correctness', 'TEST_ONLY_UNKNOWN'):
            lock = {'owner': 'foreign', 'class': lock_class, 'until_utc': '2099-01-01T00:00:00Z'}
            with self.subTest(lock_class=lock_class):
                status, r = self.cli(purpose='candidate', lock=lock, target=target,
                    runs=self.runs(target), complete_plan=True)
                self.assertEqual(status, 0)
                self.assertEqual(r['host_lock_check'], 'NOT_APPLICABLE_EXISTING_RECEIPTS')
                self.assertEqual(r['blockers'], [])
                self.assertEqual(set(r['comparison']), {'6000:1', '6000:2', '9000:1', '9000:2'})
                self.assertFalse(r['runtime_acceptance']); self.assertFalse(r['starts_any_job'])

    def test_cli_historical_taint_or_missing_run_ownership_still_fails_with_a_current_lock(self):
        target = self.bound_target()
        lock = {'owner': 'foreign', 'class': 'measurement', 'until_utc': '2099-01-01T00:00:00Z'}
        for update in ({'foreign_jobs_active': True}, {'measurement_lock_owned': False}):
            runs = self.runs(target)
            runs[-1].update(update)
            with self.subTest(update=update):
                status, r = self.cli(purpose='candidate', lock=lock, target=target,
                    runs=runs, complete_plan=True)
                self.assertEqual(status, 1)
                self.assertEqual(r['status'], 'FAIL')
                self.assertEqual(r['reason'], 'TAINTED_OR_UNOWNED_WINDOW')
                self.assertNotIn('comparison', r)
                self.assertFalse(r['runtime_acceptance'])

    def test_cli_historical_receipts_do_not_bypass_source_or_budget_gates(self):
        target = self.bound_target()
        lock = {'owner': 'foreign', 'class': 'measurement', 'until_utc': '2099-01-01T00:00:00Z'}
        status, r = self.cli(purpose='candidate', lock=lock, target=target, runs=self.runs(target))
        self.assertEqual(status, 2)
        self.assertEqual(r['host_lock_check'], 'NOT_APPLICABLE_EXISTING_RECEIPTS')
        self.assertEqual(set(r['blockers']), m.INPUT_IDS | {'UNDECIDED:' + key for key in m.BUDGET_IDS})
        self.assertNotIn('comparison', r)
        self.assertFalse(r['runtime_acceptance']); self.assertFalse(r['starts_any_job'])

    def test_cli_candidate_stays_blocked_and_does_not_accept_runs(self):
        status, r = self.cli(purpose='candidate', runs=[])
        self.assertEqual(status, 2)
        self.assertIn('UNKNOWN_MEMORY:governed-edge-instance:runtime', r['blockers'])
        self.assertNotIn('comparison', r)

    def test_cli_malformed_target_and_baseline_acceptance_attempt_fail(self):
        bad = self.target(); bad['replicas'] = True
        for kwargs in ({'target': bad}, {'runs': []}):
            status, r = self.cli(**kwargs)
            self.assertEqual(status, 1)
            self.assertEqual(r['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
