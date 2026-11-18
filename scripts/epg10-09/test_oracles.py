"""TEST_ONLY driver-flow doubles; no Research calculator, Vitest, PG or child job.

Only small disposable filesystem fixtures are real. Source reads/hashes,
reference execution/results and subprocess boundaries are explicitly doubled;
these tests are not numerical or connected acceptance evidence.
"""
from contextlib import ExitStack
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch


SPEC = importlib.util.spec_from_file_location('epg09_test_only_oracles',
    Path(__file__).with_name('oracles.py'))
oracle = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(oracle)


class OracleActivityTests(unittest.TestCase):
    def flow(self, *, pg_status='PASS_ISOLATED_CORRECTNESS_ONLY', rust_changed=False,
             verify_failure_at=None, corrupt_source=False, vitest_error=False,
             enter_error=None):
        pins_before = dict(oracle.PINS)
        with tempfile.TemporaryDirectory(prefix='epg10-09-oracle-test-') as directory:
            base = Path(directory)
            for name in ('run.py', 'test_run.py', 'epg03_run.py',
                         'execution_edge_observe.py', 'oracles.py'):
                (base / name).write_bytes(b'TEST_ONLY_DRIVER_INPUT')
            original = {'status': pg_status, 'input_hashes': {'TEST_ONLY_RUST': 'unchanged'}}
            (base / 'receipt.json').write_text(json.dumps(original))
            research = base / 'TEST_ONLY_research'
            dependency = research / 'apps/control-api/node_modules/vitest'
            dependency.mkdir(parents=True)
            (dependency / 'package.json').write_text('{"version":"TEST_ONLY"}')
            runner, observer = MagicMock(), MagicMock()
            observer.ACTIVITY_DIR = base / 'TEST_ONLY_activity'
            payload = {'class': 'correctness', 'owner': 'codex-epg10-09-shared-oracles',
                       'cpu_cap': 1, 'until_utc': '2099-01-01T00:00:00Z'}
            context = observer.correctness_activity.return_value
            context.__enter__.return_value = payload
            context.__enter__.side_effect = enter_error
            observer.measurement_lock.side_effect = AssertionError('TEST_ONLY_NO_MEASUREMENT_LEASE')
            observer.verify_lock.side_effect = AssertionError('TEST_ONLY_NO_MEASUREMENT_LEASE')
            if verify_failure_at is not None:
                observer.verify_activity.side_effect = (
                    [None] * (verify_failure_at - 1) + [ValueError('TEST_ONLY_ACTIVITY_CHANGED')])
            runner.source_hashes.return_value = ({'TEST_ONLY_RUST': 'changed'} if rust_changed
                                                 else original['input_hashes'])
            runner.isolated_environment.return_value = {'TEST_ONLY': '1'}
            runner.parse_safety_results.return_value = {'passed': 1}
            checked = subprocess.CompletedProcess([], 0, b'TEST_ONLY_RUNNER_SAFETY')
            source_bytes = {name: ('TEST_ONLY_SOURCE_' + str(i)).encode()
                            for i, name in enumerate(oracle.PINS)}
            fake_source_hashes = {source_bytes[name]: expected for name, expected in oracle.PINS.items()}
            actual_sha256 = hashlib.sha256

            def source_digest(data=b''):
                if data in fake_source_hashes:
                    return SimpleNamespace(hexdigest=lambda: fake_source_hashes[data])
                return actual_sha256(data)

            def git_source(args, **_kwargs):
                name = args[-1].split(':', 1)[1]
                return b'TEST_ONLY_CHANGED_SOURCE' if corrupt_source else source_bytes[name]

            def reference(data):
                if data.endswith(b'\nALTERED'):
                    raise ValueError('TEST_ONLY_ALTERED_GUIDE')
                return 'pass  # TEST_ONLY inert block; numerical source never executes\n'

            reference_module = ModuleType('epg10_exact_reference')
            reference_module.ScoreTests = unittest.TestCase
            reference_result = SimpleNamespace(testsRun=47, failures=[], errors=[], skipped=[],
                                               wasSuccessful=lambda: True)

            def vitest(_args, report, **_kwargs):
                if vitest_error:
                    raise RuntimeError('TEST_ONLY_CHILD_BOUNDARY_FAILURE')
                report.write_text(json.dumps({'numTotalTests': 1, 'numPassedTests': 1,
                    'numFailedTests': 0, 'numPendingTests': 0, 'success': True,
                    'testResults': [{'assertionResults': [{'fullName': 'TEST_ONLY_fixture'}]}]}))
                return {'returncode': 0}

            runner.run_logged.side_effect = vitest
            with ExitStack() as stack:
                stack.enter_context(patch.dict(sys.modules,
                    {'run': runner, 'execution_edge_observe': observer}))
                stack.enter_context(patch.object(sys, 'path', list(sys.path)))
                stack.enter_context(patch.object(oracle, '__file__', str(base / 'oracles.py')))
                stack.enter_context(patch.object(oracle, 'RESEARCH', research))
                stack.enter_context(patch.object(oracle.os, 'umask'))
                stack.enter_context(patch.object(oracle.hashlib, 'sha256', side_effect=source_digest))
                child = stack.enter_context(patch.object(oracle.subprocess, 'run', return_value=checked))
                git = stack.enter_context(patch.object(oracle.subprocess, 'check_output', side_effect=git_source))
                extract = stack.enter_context(patch.object(oracle, 'reference_block', side_effect=reference))
                stack.enter_context(patch.object(oracle.importlib.util, 'module_from_spec',
                                                 return_value=reference_module))
                stack.enter_context(patch.object(oracle.unittest.defaultTestLoader,
                                                 'loadTestsFromTestCase', return_value=object()))
                text_runner = stack.enter_context(patch.object(oracle.unittest, 'TextTestRunner'))
                text_runner.return_value.run.return_value = reference_result
                stack.enter_context(patch.object(oracle, 'rolling_peak_exit'))
                stack.enter_context(patch('builtins.print'))
                if enter_error is not None:
                    with self.assertRaises(type(enter_error)):
                        oracle.main()
                    status, receipt = None, None
                else:
                    status = oracle.main()
                    receipt = json.loads((base / 'oracles-receipt.json').read_text())
            expected_activity = observer.ACTIVITY_DIR / (payload['owner'] + '.json')
            self.assertEqual(oracle.PINS, pins_before, 'Never mutate production numerical source pins')
        self.assertFalse(base.exists(), 'Exact disposable fixtures must be removed')
        return SimpleNamespace(status=status, receipt=receipt, runner=runner, observer=observer,
            context=context, child=child, git=git, extract=extract,
            activity_path=expected_activity, payload=payload)

    def test_full_doubled_flow_uses_only_owned_correctness_activity(self):
        case = self.flow()
        self.assertEqual(case.status, 0)
        self.assertEqual(case.receipt['status'], 'PASS_SHARED_TEST_ONLY_ORACLES')
        case.observer.correctness_activity.assert_called_once_with(case.activity_path,
            owner=case.payload['owner'], seconds=600,
            purpose='EPG10-09 exact shared Research/reference correctness; no capacity claim', cpu_cap=1)
        self.assertEqual(case.receipt['correctness_activity'], case.payload)
        self.assertEqual(case.receipt['correctness_activity_window_seconds'], 600)
        self.assertFalse(case.receipt['performance_acceptance'])
        self.assertFalse(case.receipt['production_calibration'])
        self.assertEqual(case.receipt['runtime_mutations'], 0)
        self.assertEqual(case.observer.verify_activity.call_count, 8)
        for call in case.observer.verify_activity.call_args_list:
            self.assertEqual(call.args, (case.activity_path, case.payload))
        case.context.__exit__.assert_called_once_with(None, None, None)
        case.observer.measurement_lock.assert_not_called()
        case.observer.verify_lock.assert_not_called()
        case.child.assert_called_once()
        self.assertEqual(case.git.call_count, len(oracle.PINS))
        case.runner.run_logged.assert_called_once()

    def test_full_pg_prerequisite_or_changed_rust_stops_before_any_child(self):
        for kwargs in ({'pg_status': 'FAIL'}, {'rust_changed': True}):
            with self.subTest(kwargs=kwargs):
                case = self.flow(**kwargs)
                self.assertEqual(case.status, 1)
                case.child.assert_not_called(); case.git.assert_not_called()
                case.runner.run_logged.assert_not_called()
                case.context.__exit__.assert_called_once_with(None, None, None)

    def test_activity_failure_before_each_stage_prevents_that_stage_and_releases_own_context(self):
        for boundary in (1, 2, 6, 7, 8):
            with self.subTest(boundary=boundary):
                case = self.flow(verify_failure_at=boundary)
                self.assertEqual(case.status, 1)
                self.assertEqual(case.receipt['error_type'], 'ValueError')
                self.assertEqual(case.observer.verify_activity.call_count, boundary)
                if boundary == 1:
                    case.child.assert_not_called()
                if boundary <= 2:
                    case.git.assert_not_called()
                if boundary <= 7:
                    case.runner.run_logged.assert_not_called()
                case.context.__exit__.assert_called_once_with(None, None, None)
                case.observer.measurement_lock.assert_not_called()

    def test_changed_source_pin_stops_before_reference_or_vitest_and_cleans_activity(self):
        case = self.flow(corrupt_source=True)
        self.assertEqual(case.status, 1)
        self.assertEqual(case.receipt['error_type'], 'ValueError')
        self.assertEqual(case.git.call_count, 1)
        case.extract.assert_not_called(); case.runner.run_logged.assert_not_called()
        case.context.__exit__.assert_called_once_with(None, None, None)

    def test_child_boundary_exception_preserves_failure_and_releases_only_own_activity(self):
        case = self.flow(vitest_error=True)
        self.assertEqual(case.status, 1)
        self.assertEqual(case.receipt['error_type'], 'RuntimeError')
        case.runner.run_logged.assert_called_once()
        case.context.__exit__.assert_called_once_with(None, None, None)
        case.observer.measurement_lock.assert_not_called()

    def test_unacquired_activity_is_not_released_and_starts_no_child(self):
        case = self.flow(enter_error=FileExistsError('TEST_ONLY_EXISTING_OWNER_ACTIVITY'))
        case.context.__exit__.assert_not_called()
        case.child.assert_not_called(); case.git.assert_not_called()
        case.runner.run_logged.assert_not_called()
        case.observer.measurement_lock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
