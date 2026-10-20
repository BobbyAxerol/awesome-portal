"""Safety regressions for the disposable runner; no Docker/network actions."""
from contextlib import ExitStack
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import MagicMock, patch

import run as qualification


class RunnerSafety(unittest.TestCase):
    def activity_preflight(self, enter_error=None):
        with ExitStack() as stack:
            stack.enter_context(patch.dict(qualification.os.environ,
                {'EPG10_TS_REVISION': 'a' * 40}, clear=True))
            stack.enter_context(patch.object(Path, 'resolve',
                return_value=Path('/tmp/epg10-03-TEST_ONLY/run.py')))
            stack.enter_context(patch.object(Path, 'exists', return_value=False))
            written = stack.enter_context(patch.object(Path, 'write_text'))
            stack.enter_context(patch.object(qualification.signal, 'signal'))
            stack.enter_context(patch.object(qualification.signal, 'alarm'))
            # Stop at the unchanged disk gate after activity entry, before all
            # Docker/source/Cargo operations. Cleanup still observes its disk.
            stack.enter_context(patch.object(qualification, 'free_bytes',
                side_effect=[200 * 1024**3, 0, 123]))
            context = stack.enter_context(patch.object(qualification.obs, 'correctness_activity'))
            context.return_value.__enter__.return_value = {'class': 'correctness', 'cpu_cap': 1.5}
            context.return_value.__enter__.side_effect = enter_error
            old_lock = stack.enter_context(patch.object(qualification.obs, 'measurement_lock',
                side_effect=AssertionError('TEST_ONLY_NO_MEASUREMENT_LOCK')))
            peer_ban = stack.enter_context(patch.object(qualification, 'no_foreign_cpu_job',
                side_effect=AssertionError('TEST_ONLY_NO_FOREIGN_JOB_BAN')))
            job = stack.enter_context(patch.object(qualification, 'command',
                side_effect=AssertionError('TEST_ONLY_NO_JOB')))
            remove = stack.enter_context(patch.object(qualification, 'remove_owned_pg'))
            stack.enter_context(patch('builtins.print'))
            result = qualification.main()
        written.assert_called_once()
        return result, json.loads(written.call_args.args[0]), context, old_lock, peer_ban, job, remove

    def test_capture_correctness_does_not_claim_measurement_or_ban_peer_work(self):
        status, receipt, context, old_lock, peer_ban, job, remove = self.activity_preflight()
        self.assertEqual(status, 1)  # TEST_ONLY deliberate disk-gate stop.
        self.assertEqual(receipt['error_type'], 'AssertionError')
        context.assert_called_once_with(qualification.obs.ACTIVITY_DIR / (qualification.OWNER + '.json'),
            owner=qualification.OWNER, seconds=1500,
            purpose='EPG10-03 isolated native Rust/PG correctness; no HK requests; not capacity', cpu_cap=1.5)
        context.return_value.__exit__.assert_called_once_with(None, None, None)
        old_lock.assert_not_called(); peer_ban.assert_not_called(); job.assert_not_called(); remove.assert_not_called()
        self.assertEqual(receipt['correctness_activity']['class'], 'correctness')
        self.assertFalse(receipt['performance_acceptance']); self.assertTrue(receipt['tainted_for_capacity'])

    def test_capture_activity_entry_failure_starts_and_cleans_no_job(self):
        status, receipt, context, old_lock, peer_ban, job, remove = self.activity_preflight(OSError('TEST_ONLY'))
        self.assertEqual(status, 1); self.assertEqual(receipt['error_type'], 'OSError')
        context.return_value.__exit__.assert_not_called()
        old_lock.assert_not_called(); peer_ban.assert_not_called(); job.assert_not_called(); remove.assert_not_called()

    def test_capture_source_declares_one_core_cargo_affinity_and_disposable_pg(self):
        # Public driver source inspection only, not a resource/capacity run.
        source = Path(qualification.__file__).read_text()
        self.assertIn("cargo = ['nice', '-n', '15', 'taskset', '--cpu-list', str(core), 'cargo']", source)
        self.assertEqual(source.count('command(cargo+['), 3)
        self.assertIn("docker('run','--detach','--rm'", source)

    def test_capture_exact_safety_count_matches_this_suite(self):
        self.assertEqual(qualification.SAFETY_TEST_COUNT,
            unittest.defaultTestLoader.loadTestsFromTestCase(type(self)).countTestCases())

    def inspect_result(self, code=0, stdout=b'', stderr=b''):
        return subprocess.CompletedProcess([], code, stdout, stderr)

    def test_known_absent_never_removes(self):
        with patch.object(qualification.subprocess, 'run', return_value=self.inspect_result(1, stderr=b'Error: No such object')):
            with patch.object(qualification, 'docker') as docker:
                self.assertFalse(qualification.remove_owned_pg())
                docker.assert_not_called()

    def test_permission_failure_is_not_absence(self):
        with patch.object(qualification.subprocess, 'run', return_value=self.inspect_result(1, stderr=b'permission denied')):
            with patch.object(qualification, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'NOT_PROVEN_ABSENT'):
                    qualification.remove_owned_pg()
                docker.assert_not_called()

    def test_foreign_owner_is_retained(self):
        result = self.inspect_result(stdout=(('a'*64)+'|foreign\n').encode())
        with patch.object(qualification.subprocess, 'run', return_value=result):
            with patch.object(qualification, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'OWNERSHIP_CHANGED'):
                    qualification.remove_owned_pg()
                docker.assert_not_called()

    def test_owned_cleanup_uses_immutable_id(self):
        identity = 'a'*64
        result = self.inspect_result(stdout=(identity+'|'+qualification.OWNER+'\n').encode())
        with patch.object(qualification.subprocess, 'run', return_value=result):
            with patch.object(qualification, 'docker') as docker:
                self.assertTrue(qualification.remove_owned_pg())
                self.assertEqual(docker.call_args.args[:3], ('rm', '--force', identity))

    def test_invalid_identity_is_retained(self):
        result = self.inspect_result(stdout=('not-an-id|'+qualification.OWNER+'\n').encode())
        with patch.object(qualification.subprocess, 'run', return_value=result):
            with patch.object(qualification, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'OWNERSHIP_CHANGED'):
                    qualification.remove_owned_pg()
                docker.assert_not_called()

    def test_active_foreign_test_fails_closed(self):
        with patch.object(qualification, 'command', return_value=self.inspect_result(stdout=b'python pytest private/test.py\n')):
            with self.assertRaisesRegex(RuntimeError, 'FOREIGN_JOB_ACTIVE'):
                qualification.no_foreign_cpu_job()

    def test_normal_services_not_treated_as_test_load(self):
        with patch.object(qualification, 'command', return_value=self.inspect_result(stdout=b'postgres postgres\nnode portal-api\n')):
            qualification.no_foreign_cpu_job()

    def test_container_failure_still_releases_lock_and_retains_receipt(self):
        receipt = dict(status='PASS_SCOPED')
        lock = MagicMock()
        with patch.object(qualification, 'remove_owned_pg', side_effect=ValueError('foreign')):
            with patch.object(qualification, 'free_bytes', return_value=123):
                qualification.finish_cleanup(receipt, True, lock, '/tmp/epg10-03-test')
        lock.__exit__.assert_called_once_with(None, None, None)
        self.assertEqual(receipt['status'], 'FAIL')
        self.assertEqual(receipt['failed_stage'], 'container_cleanup')
        self.assertFalse(receipt['cleanup']['owned_container_removed'])
        self.assertEqual(receipt['disk_after_container'], 123)

    def test_lock_failure_still_records_removed_container(self):
        receipt = dict(status='PASS_SCOPED')
        lock = MagicMock()
        lock.__exit__.side_effect = ValueError('replaced lock')
        with patch.object(qualification, 'remove_owned_pg', return_value=True):
            with patch.object(qualification, 'free_bytes', return_value=123):
                qualification.finish_cleanup(receipt, True, lock, '/tmp/epg10-03-test')
        self.assertEqual(receipt['status'], 'FAIL')
        self.assertEqual(receipt['failed_stage'], 'lock_release')
        self.assertTrue(receipt['cleanup']['owned_container_removed'])

    def test_both_cleanup_failures_preserve_original_failure(self):
        receipt = dict(status='FAIL', failed_stage='native_tests', error_type='AssertionError')
        lock = MagicMock()
        lock.__exit__.side_effect = ValueError('foreign lock')
        with patch.object(qualification, 'remove_owned_pg', side_effect=PermissionError):
            with patch.object(qualification, 'free_bytes', return_value=123):
                qualification.finish_cleanup(receipt, True, lock, '/tmp/epg10-03-test')
        self.assertEqual(receipt['failed_stage'], 'native_tests')
        self.assertEqual(receipt['error_type'], 'AssertionError')
        self.assertEqual([e['stage'] for e in receipt['cleanup']['errors']],
                         ['container_cleanup', 'lock_release'])

    def test_unacquired_resources_are_not_cleaned(self):
        receipt = dict(status='FAIL', failed_stage='preflight')
        with patch.object(qualification, 'remove_owned_pg') as remove:
            with patch.object(qualification, 'free_bytes', return_value=123):
                qualification.finish_cleanup(receipt, False, None, '/tmp/epg10-03-test')
        remove.assert_not_called()
        self.assertEqual(receipt['cleanup']['errors'], [])

    def test_disk_failure_cannot_skip_resource_cleanup(self):
        receipt = dict(status='PASS_SCOPED')
        lock = MagicMock()
        with patch.object(qualification, 'remove_owned_pg', return_value=True):
            with patch.object(qualification, 'free_bytes', side_effect=OSError):
                qualification.finish_cleanup(receipt, True, lock, '/tmp/epg10-03-test')
        lock.__exit__.assert_called_once_with(None, None, None)
        self.assertEqual(receipt['failed_stage'], 'disk_observation')
        self.assertEqual(receipt['status'], 'FAIL')


if __name__ == '__main__':
    unittest.main()
