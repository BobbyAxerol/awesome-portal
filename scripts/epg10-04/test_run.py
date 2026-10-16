"""Pure safety tests; mocks only, no Docker, network, Cargo or source queries."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import run as qualification


class RunnerSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '04')

    def result(self, code=0, stdout=b'', stderr=b''):
        return subprocess.CompletedProcess([], code, stdout, stderr)

    def source_fixture(self, profile):
        private = tempfile.TemporaryDirectory()
        self.addCleanup(private.cleanup)
        source = Path(private.name) / 'source'
        names = ['Cargo.toml', 'Cargo.lock', *qualification.owned_rust(profile),
                 'crates/projection-store-pg/migrations/0019_scoped_bootstrap.sql']
        if profile == '05':
            names.append('crates/projection-store-pg/migrations/0020_scoped_read.sql')
            names = [qualification.RUST_WORKSPACE + '/' + name for name in names]
            names.append(qualification.SHARED_FIXTURE)
        for name in names:
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('TEST_ONLY\n')
        return source

    def test_profile_defaults_to04_and_requires_exact_04_or05(self):
        with patch.dict(qualification.os.environ, {}, clear=True):
            self.assertEqual(qualification.test_profile(), '04')
        for value in ('04', '05'):
            self.assertEqual(qualification.test_profile(value), value)
        for value in ('', '4', '5', '06', '04,05', '05 ', 5, True):
            with self.subTest(profile=value):
                with self.assertRaisesRegex(ValueError, 'EXPLICIT_TEST_PROFILE'):
                    qualification.test_profile(value)
        with patch.dict(qualification.os.environ, {'EPG10_TEST_PROFILE': 'production'}):
            with self.assertRaisesRegex(ValueError, 'EXPLICIT_TEST_PROFILE'):
                qualification.test_profile()

    def test_profile05_cleanup_names_are_separate_and_stable(self):
        helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '05')
        self.assertTrue(helper.PG.startswith('epg10-05-pg-'))
        self.assertTrue(helper.OWNER.startswith('codex-epg10-05-'))
        self.assertEqual(helper.PG.rsplit('-', 1)[1], self.helper.PG.rsplit('-', 1)[1])
        self.assertNotEqual(helper.PG, self.helper.PG)
        with patch.object(helper.subprocess, 'run', return_value=self.result(stdout=b'a'*64+b'|foreign\n')):
            with patch.object(helper, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'OWNERSHIP_CHANGED'):
                    helper.remove_owned_pg()
                docker.assert_not_called()

    def test_profile05_path_cannot_select_04_or_operational_directory(self):
        for path in ('/tmp/epg10-04-test', '/tmp/epg10-05-', '/home/bobby',
                     '/tmp/epg10-05-test/child', '/tmp/epg10-05-test/../foreign'):
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                    qualification.validate_base(Path(path), '05')
        with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
            qualification.validate_base(Path('/tmp/epg10-05-test'), '04')

    def test_profile05_valid_private_owned_path_and_symlink_rejection(self):
        path = MagicMock()
        path.__str__.return_value = '/tmp/epg10-05-test'
        path.is_symlink.return_value = False
        path.resolve.return_value = path
        path.stat.return_value.st_uid = qualification.os.getuid()
        path.stat.return_value.st_mode = 0o700
        qualification.validate_base(path, '05')
        path.is_symlink.return_value = True
        with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
            qualification.validate_base(path, '05')
        path.is_symlink.return_value = False
        path.stat.return_value.st_mode = 0o755
        with self.assertRaisesRegex(ValueError, 'PRIVATE_OWNED'):
            qualification.validate_base(path, '05')

    def test_profile05_has_exactly_four_unit_packages_and_04_is_unchanged(self):
        self.assertEqual(qualification.package_arguments('04'),
                         ['-p', 'authoritative-event-core', '-p', 'projection-store-pg'])
        self.assertEqual(qualification.package_arguments('05'),
                         ['-p', 'query-api', '-p', 'realtime-sse',
                          '-p', 'authoritative-event-core', '-p', 'projection-store-pg'])

    def test_profile05_requires_all_four_rust_unit_summaries(self):
        row = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results('\n'.join([row]*4), 4)['passed'], 8)
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results('\n'.join([row]*2), 4)

    def test_profile05_read_count_is_explicit_bounded_and_exact(self):
        for value in (None, '', '0', '129', '-1', '1.0', '01', 2):
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'EXACT_BOUNDED_READ'):
                    qualification.expected_test_count(value, 'READ')
        self.assertEqual(qualification.expected_test_count('1', 'READ'), 1)
        self.assertEqual(qualification.expected_test_count('128', 'READ'), 128)
        row = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results(row, 1, 2, count_kind='READ')['passed'], 2)
        with self.assertRaisesRegex(ValueError, 'EXACT_READ_TEST_COUNT'):
            qualification.parse_rust_results(row, 1, 3, count_kind='READ')

    def test_profile04_source_inputs_remain_sufficient_only_for04(self):
        source = self.source_fixture('04')
        hashes = qualification.source_hashes(source, '04')
        self.assertIn('crates/authoritative-event-core/src/bootstrap.rs', hashes)
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '05')

    def test_profile05_source_hashes_include_scoped_inputs_and_bootstrap(self):
        source = self.source_fixture('05')
        hashes = qualification.source_hashes(source, '05')
        for name in (*qualification.OWNED_RUST, *qualification.SCOPED_OWNED_RUST,
                     'crates/projection-store-pg/migrations/0020_scoped_read.sql'):
            self.assertIn(qualification.RUST_WORKSPACE + '/' + name, hashes)
        self.assertIn(qualification.SHARED_FIXTURE, hashes)
        for name in (*qualification.SCOPED_OWNED_RUST,
                     'crates/projection-store-pg/migrations/0020_scoped_read.sql'):
            with self.subTest(missing=name):
                path = source / qualification.RUST_WORKSPACE / name
                path.unlink()
                with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
                    qualification.source_hashes(source, '05')
                path.write_text('TEST_ONLY\n')

    def test_profile05_workspace_retains_monorepo_layout_without_changing04(self):
        source = self.source_fixture('05')
        self.assertEqual(qualification.workspace_directory(source, '05'),
                         source / 'services' / 'portal-execution-edge-rs')
        self.assertEqual(qualification.workspace_directory(source, '04'), source)
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source / qualification.RUST_WORKSPACE, '05')

    def test_profile05_missing_shared_fixture_fails_closed(self):
        source = self.source_fixture('05')
        (source / qualification.SHARED_FIXTURE).unlink()
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '05')

    def test_profile05_shared_fixture_symlink_is_not_accepted(self):
        source = self.source_fixture('05')
        fixture = source / qualification.SHARED_FIXTURE
        fixture.unlink()
        fixture.symlink_to(source / qualification.RUST_WORKSPACE / 'Cargo.toml')
        with self.assertRaisesRegex(ValueError, 'SOURCE_SYMLINK'):
            qualification.source_hashes(source, '05')

    def test_profile05_parent_directory_symlink_cannot_escape_private_source(self):
        source = self.source_fixture('05')
        services = source / 'services'
        moved = source.parent / 'external-services'
        services.rename(moved)
        services.symlink_to(moved, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'SOURCE_SYMLINK'):
            qualification.source_hashes(source, '05')

    def test_profile05_empty_or_oversize_shared_fixture_is_rejected_before_read(self):
        source = self.source_fixture('05')
        fixture = source / qualification.SHARED_FIXTURE
        for size in (0, qualification.MAX_SHARED_FIXTURE_BYTES + 1):
            with self.subTest(size=size):
                fixture.write_bytes(b'x' * size)
                with self.assertRaisesRegex(ValueError, 'BOUNDED_SHARED_FIXTURE'):
                    qualification.source_hashes(source, '05')

    def test_profile05_manifest_binds_exact_shared_fixture_and_workspace_bytes(self):
        source = self.source_fixture('05')
        before = qualification.source_hashes(source, '05')
        (source / qualification.SHARED_FIXTURE).write_text('TEST_ONLY_CHANGED\n')
        after = qualification.source_hashes(source, '05')
        changed = [key for key in before if before[key] != after[key]]
        self.assertEqual(changed, [qualification.SHARED_FIXTURE])
        self.assertNotIn('Cargo.toml', after)
        self.assertIn(qualification.RUST_WORKSPACE + '/Cargo.toml', after)

    def test_profile05_scoped_clippy_warning_is_owned(self):
        warning = {'message': {'level': 'warning', 'code': {'code': 'clippy::example'},
                   'spans': [{'is_primary': True, 'file_name': qualification.SCOPED_OWNED_RUST[0]}]}}
        self.assertEqual(qualification.clippy_findings(json.dumps(warning), '05')['owned_warnings'],
                         ['clippy::example'])

    def test_cleanup_target_is_parameterized_not_epg03(self):
        self.assertTrue(self.helper.PG.startswith('epg10-04-pg-'))
        self.assertTrue(self.helper.OWNER.startswith('codex-epg10-04-'))
        self.assertNotIn('epg10-03', self.helper.PG)

    def test_foreign_owner_is_never_removed(self):
        with patch.object(self.helper.subprocess, 'run', return_value=self.result(stdout=b'a'*64+b'|foreign\n')):
            with patch.object(self.helper, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'OWNERSHIP_CHANGED'):
                    self.helper.remove_owned_pg()
                docker.assert_not_called()

    def test_owned_cleanup_uses_immutable_id(self):
        identity = 'a'*64
        with patch.object(self.helper.subprocess, 'run', return_value=self.result(
                stdout=(identity+'|'+self.helper.OWNER+'\n').encode())):
            with patch.object(self.helper, 'docker') as docker:
                self.assertTrue(self.helper.remove_owned_pg())
                self.assertEqual(docker.call_args.args[:3], ('rm', '--force', identity))

    def test_permission_error_is_not_absence(self):
        with patch.object(self.helper.subprocess, 'run', return_value=self.result(1, stderr=b'permission denied')):
            with patch.object(self.helper, 'docker') as docker:
                with self.assertRaisesRegex(ValueError, 'NOT_PROVEN_ABSENT'):
                    self.helper.remove_owned_pg()
                docker.assert_not_called()

    def test_absent_target_is_not_removed(self):
        with patch.object(self.helper.subprocess, 'run', return_value=self.result(1, stderr=b'No such object')):
            with patch.object(self.helper, 'docker') as docker:
                self.assertFalse(self.helper.remove_owned_pg())
                docker.assert_not_called()

    def test_container_cleanup_failure_still_releases_lock(self):
        receipt, lock = {'status': 'PASS_SCOPED'}, MagicMock()
        with patch.object(self.helper, 'remove_owned_pg', side_effect=ValueError):
            with patch.object(self.helper, 'free_bytes', return_value=123):
                self.helper.finish_cleanup(receipt, True, lock, '/tmp/epg10-04-test')
        lock.__exit__.assert_called_once_with(None, None, None)
        self.assertEqual(receipt['status'], 'FAIL')
        self.assertEqual(receipt['failed_stage'], 'container_cleanup')

    def test_lock_cleanup_failure_preserves_original_failure(self):
        receipt = {'status': 'FAIL', 'failed_stage': 'unit_tests', 'error_type': 'OriginalError'}
        lock = MagicMock()
        lock.__exit__.side_effect = ValueError()
        with patch.object(self.helper, 'remove_owned_pg', return_value=True):
            with patch.object(self.helper, 'free_bytes', return_value=123):
                self.helper.finish_cleanup(receipt, True, lock, '/tmp/epg10-04-test')
        self.assertEqual(receipt['failed_stage'], 'unit_tests')
        self.assertEqual(receipt['error_type'], 'OriginalError')
        self.assertEqual(receipt['cleanup']['errors'][0]['stage'], 'lock_release')

    def test_unacquired_resources_are_not_cleaned(self):
        with patch.object(self.helper, 'remove_owned_pg') as remove:
            with patch.object(self.helper, 'free_bytes', return_value=123):
                self.helper.finish_cleanup({}, False, None, '/tmp/epg10-04-test')
        remove.assert_not_called()

    def test_target_preflight_requires_proven_absence(self):
        for result in (self.result(), self.result(1, stderr=b'permission denied')):
            with self.subTest(code=result.returncode):
                with patch.object(qualification.subprocess, 'run', return_value=result):
                    with self.assertRaisesRegex(ValueError, 'TARGET_NOT_PROVEN_ABSENT'):
                        qualification.require_absent(self.helper)

    def test_valid_rust_results_keep_exact_binary_counts(self):
        row = 'test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished'
        self.assertEqual(qualification.parse_rust_results(row, 1, 8)['passed'], 8)
        self.assertEqual(qualification.parse_rust_results(row+'\n'+row, 2)['passed_per_binary'], [8, 8])

    def test_missing_filtered_ignored_or_failed_rust_tests_fail_closed(self):
        for text in ('', 'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out',
                     'test result: ok. 8 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out',
                     'test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out',
                     'test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out'):
            with self.subTest(text=text):
                with self.assertRaises(ValueError):
                    qualification.parse_rust_results(text, 1)

    def test_inexact_bootstrap_count_cannot_pass(self):
        with self.assertRaisesRegex(ValueError, 'EXACT_BOOTSTRAP'):
            qualification.parse_rust_results('test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out', 1, 8)

    def test_safety_skip_or_missing_run_cannot_pass(self):
        for text in ('OK', 'Ran 2 tests in 0.001s\nOK (skipped=1)', 'Ran 0 tests in 0.001s\nOK'):
            with self.assertRaises(ValueError):
                qualification.parse_safety_results(text)
        self.assertEqual(qualification.parse_safety_results('Ran 2 tests in 0.001s\nOK')['passed'], 2)

    def test_no_inherited_database_or_command_credentials(self):
        with patch.dict(qualification.os.environ, {'TEST_PROJECTION_DATABASE_URL': 'private',
                'CORE_DATABASE_URL': 'private', 'JWT_SIGNING_KEY': 'private'}, clear=False):
            env = qualification.isolated_environment(Path('/tmp/epg10-04-test'))
        self.assertNotIn('TEST_PROJECTION_DATABASE_URL', env)
        self.assertNotIn('CORE_DATABASE_URL', env)
        self.assertNotIn('JWT_SIGNING_KEY', env)
        self.assertEqual(env['CARGO_NET_OFFLINE'], 'true')
        self.assertEqual(env['CARGO_BUILD_JOBS'], '1')

    def test_owned_clippy_warning_is_not_hidden_as_upstream(self):
        owned = {'message': {'level': 'warning', 'code': {'code': 'clippy::example'},
                 'spans': [{'is_primary': True, 'file_name': qualification.OWNED_RUST[0]}]}}
        upstream = {'message': {'level': 'warning', 'code': None, 'spans': []}}
        findings = qualification.clippy_findings(json.dumps(owned)+'\n'+json.dumps(upstream))
        self.assertEqual(findings['owned_warnings'], ['clippy::example'])
        self.assertEqual(findings['upstream_advisory_warnings'], 1)

    def test_private_target_rejects_nonphase_or_symlink_path(self):
        for path in (Path('/home/bobby'), Path('/tmp/epg10-03-test')):
            with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.validate_base(path)
        path = MagicMock()
        path.__str__.return_value = '/tmp/epg10-04-test'
        path.is_symlink.return_value = True
        with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
            qualification.validate_base(path)

    def test_process_group_timeout_does_not_leave_children(self):
        process = MagicMock(pid=123)
        process.wait.side_effect = [subprocess.TimeoutExpired('test', 2), 0]
        with patch.object(qualification.os, 'killpg') as kill:
            qualification.stop_process_group(process)
        self.assertEqual([call.args for call in kill.call_args_list],
                         [(123, qualification.signal.SIGTERM), (123, qualification.signal.SIGKILL)])

    def test_sampler_never_exceeds_sample_bound(self):
        helper = MagicMock()
        sampler = qualification.OwnPgSampler(helper, maximum_samples=2)
        with patch.object(sampler, 'process_rss_sum', return_value=123):
            self.assertTrue(sampler.capture())
            self.assertTrue(sampler.capture())
            self.assertFalse(sampler.capture())
        self.assertEqual(len(sampler.rows), 2)
        self.assertEqual(helper.obs.sample.call_count, 2)
        self.assertTrue(sampler.bound_reached)
        for invalid in (0, 1, 1501):
            with self.assertRaisesRegex(ValueError, 'BOUNDED_SAMPLER'):
                qualification.OwnPgSampler(helper, maximum_samples=invalid)

    def test_sampler_error_stops_background_capture(self):
        sampler = qualification.OwnPgSampler(MagicMock())
        sampler.event = MagicMock()
        sampler.event.wait.return_value = False
        with patch.object(sampler, 'capture', side_effect=OSError):
            sampler.poll()
        self.assertEqual(sampler.error_type, 'OSError')
        sampler.event.set.assert_called_once_with()
        with self.assertRaisesRegex(ValueError, 'OBSERVATION_INCOMPLETE'):
            sampler.stop()

    def test_sampler_summary_is_observational_and_exactly_one_owned_group(self):
        helper = MagicMock()
        sampler = qualification.OwnPgSampler(helper)
        sampler.roster, sampler.rows = [dict(name='owned-pg')], [dict(), dict()]
        sampler.rss_sum_max_bytes = 123
        helper.obs.summarize.return_value = dict(duration_seconds=2,
            maximum_sampling_gap_seconds=1, groups=[dict(name='owned-pg', cpu_core_seconds=1)])
        with patch.object(sampler, 'capture', return_value=True):
            result = sampler.stop()
        self.assertEqual(result['status'], 'PASS_OBSERVATION_ONLY')
        self.assertTrue(result['tainted_for_capacity'])
        self.assertEqual(result['sample_count'], 2)
        self.assertEqual(result['process_rss_sum_sampled_max_bytes'], 123)
        self.assertEqual(result['postgresql']['name'], 'owned-pg')
        self.assertEqual(helper.obs.summarize.call_args.args[0]['roster'], sampler.roster)

    def test_sampler_rejects_foreign_container_before_starting_thread(self):
        helper = MagicMock(PG='owned-pg', OWNER='owned')
        helper.docker.return_value.stdout = json.dumps(dict(name='/owned-pg', id='a'*64,
            image=qualification.IMAGE, running=True, pid=123, owner='foreign', restarts=0)).encode()
        sampler = qualification.OwnPgSampler(helper)
        with patch.object(qualification.threading, 'Thread') as thread:
            with self.assertRaisesRegex(ValueError, 'OWNED_PG_IDENTITY'):
                sampler.start()
            thread.assert_not_called()
        helper.obs.sample.assert_not_called()

    def test_observer_stops_before_container_cleanup(self):
        receipt, sampler, helper, order = {}, MagicMock(), MagicMock(), []
        sampler.stop.side_effect = lambda: order.append('observer_stop') or {'status': 'PASS_OBSERVATION_ONLY'}
        def cleanup(target, *_):
            order.append('container_cleanup_and_lock_release')
            target['cleanup'] = {}
        helper.finish_cleanup.side_effect = cleanup
        qualification.finish_observation_and_cleanup(receipt, sampler, helper, True, MagicMock(), '/tmp/epg10-04-test')
        self.assertEqual(order, ['observer_stop', 'container_cleanup_and_lock_release'])
        self.assertTrue(receipt['cleanup']['resource_sampler_stopped_before_container_cleanup'])

    def test_observer_failure_cannot_skip_cleanup_or_hide_original_test_failure(self):
        receipt = {'status': 'FAIL', 'failed_stage': 'bootstrap_tests', 'error_type': 'OriginalError'}
        sampler, helper = MagicMock(), MagicMock()
        sampler.stop.side_effect = ValueError()
        sampler.thread.is_alive.return_value = False
        sampler.error_type, sampler.rows, sampler.bound_reached = 'OSError', [1], False
        helper.finish_cleanup.side_effect = lambda target, *_: target.update(cleanup={})
        qualification.finish_observation_and_cleanup(receipt, sampler, helper, True, MagicMock(), '/tmp/epg10-04-test')
        helper.finish_cleanup.assert_called_once()
        self.assertEqual(receipt['failed_stage'], 'bootstrap_tests')
        self.assertEqual(receipt['error_type'], 'OriginalError')
        self.assertEqual(receipt['postgresql_observation']['error_type'], 'OSError')
        self.assertTrue(receipt['cleanup']['resource_sampler_stopped_before_container_cleanup'])

    def test_owned_db_counts_are_exact_and_readonly(self):
        helper = MagicMock()
        counts = dict(database='portal_projection_test_epg10_04', generations=2, dataset_checkpoints=4,
            current_rows=3, visible_current_rows=2, tombstoned_current_rows=1,
            immutable_facts=7, committed_groups=3, pending_chunks=0, database_size_bytes=8192)
        helper.docker.return_value.stdout = json.dumps(counts).encode()
        result = qualification.owned_db_counts(helper, 'a'*64)
        self.assertEqual(result['values'], counts)
        self.assertTrue(result['tainted_for_capacity'])
        args = helper.docker.call_args.args
        self.assertEqual(args[:2], ('exec', 'a'*64))
        self.assertIn('BEGIN READ ONLY', args[-1])
        self.assertIn("SET LOCAL statement_timeout='2s'", args[-1])
        self.assertIn('POST_SUITE', result['basis'])

    def test_owned_db_counts_reject_wrong_target_or_inconsistent_counts(self):
        helper = MagicMock()
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_OWNED'):
            qualification.owned_db_counts(helper, 'name-not-immutable-id')
        helper.docker.assert_not_called()
        helper.docker.return_value.stdout = json.dumps(dict(database='production')).encode()
        with self.assertRaisesRegex(ValueError, 'EXACT_TEST_DB_COUNTS'):
            qualification.owned_db_counts(helper, 'a'*64)

    def test_cgroup_rss_sum_is_scoped_bounded_and_handles_exited_backends(self):
        helper = MagicMock()
        sampler = qualification.OwnPgSampler(helper)
        sampler.roster = [dict(cgroup='/test-owned')]
        helper.obs.process_identity.side_effect = [(1, '/test-owned'), FileNotFoundError(), (3, '/foreign')]
        helper.obs.read.side_effect = ['11 12 13', 'VmRSS:  7 kB\n']
        self.assertEqual(sampler.process_rss_sum(), 7*1024)
        self.assertEqual(helper.obs.read.call_count, 2)


if __name__ == '__main__':
    unittest.main()
