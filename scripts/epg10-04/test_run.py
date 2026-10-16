"""Pure safety tests; mocks only, no Docker, network, Cargo or source queries."""
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

import run as qualification


class RunnerSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '04')

    def result(self, code=0, stdout=b'', stderr=b''):
        return subprocess.CompletedProcess([], code, stdout, stderr)

    def source_fixture(self, profile, private_prefix=None):
        private = (tempfile.TemporaryDirectory(prefix=private_prefix, dir='/tmp')
                   if private_prefix is not None else tempfile.TemporaryDirectory())
        self.addCleanup(private.cleanup)
        source = Path(private.name) / 'source'
        names = ['Cargo.toml', 'Cargo.lock', *qualification.owned_rust(profile),
                 'crates/projection-store-pg/migrations/0019_scoped_bootstrap.sql']
        if profile in ('07', '08'):
            names.append(qualification.COMMAND_MIGRATION)
        if profile != '04':
            names.append('crates/projection-store-pg/migrations/0020_scoped_read.sql')
            names = [qualification.RUST_WORKSPACE + '/' + name for name in names]
            names.append(qualification.SHARED_FIXTURE)
        if profile in ('06', '07', '08'):
            names.extend(qualification.RESOURCE_SHARED_FIXTURES)
            names.extend(qualification.RESOURCE_COMPILE_INPUTS)
            names.extend(qualification.RUST_WORKSPACE + '/' + name
                         for name in qualification.RESOURCE_BUILD_SCRIPTS)
        if profile in ('07', '08'):
            names.extend(qualification.COMMAND_SHARED_FIXTURES)
        if profile == '08':
            names.extend(qualification.SECURITY_COMPILE_INPUTS)
        for name in names:
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('TEST_ONLY\n')
        return source

    def test_profile_defaults_to04_and_requires_exact_04_or05_or06_or07_or08(self):
        with patch.dict(qualification.os.environ, {}, clear=True):
            self.assertEqual(qualification.test_profile(), '04')
        for value in ('04', '05', '06', '07', '08'):
            self.assertEqual(qualification.test_profile(value), value)
        for value in ('', '4', '5', '6', '7', '8', '09', '04,05', '05 ', '07 ', '08 ', 5, True):
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

    def test_profile06_cleanup_and_private_paths_do_not_select_previous_targets(self):
        helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '06')
        self.assertTrue(helper.PG.startswith('epg10-06-pg-'))
        self.assertTrue(helper.OWNER.startswith('codex-epg10-06-'))
        for path in ('/home/bobby', '/tmp/epg10-04-test', '/tmp/epg10-05-test',
                     '/tmp/epg10-06-', '/tmp/epg10-06-test/../foreign'):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.validate_base(Path(path), '06')

    def test_profile06_has_six_unit_packages_without_changing_prior_profiles(self):
        self.assertEqual(qualification.package_arguments('06'), [
            '-p', 'projection-core', '-p', 'manager-projection', '-p', 'query-api',
            '-p', 'realtime-sse', '-p', 'authoritative-event-core', '-p', 'projection-store-pg'])
        row = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results('\n'.join([row]*6), 6)['passed'], 12)
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results('\n'.join([row]*4), 6)

    def test_profile06_resource_and_manager_counts_are_explicit_bounded_and_exact(self):
        row = 'test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        for kind in ('RESOURCE', 'MANAGER'):
            self.assertEqual(qualification.expected_test_count('8', kind), 8)
            self.assertEqual(qualification.parse_rust_results(row, 1, 8, count_kind=kind)['passed'], 8)
            for invalid in (None, '', '0', '129', '-1', '1.0', '08', True):
                with self.subTest(kind=kind, value=invalid), self.assertRaisesRegex(ValueError, 'EXACT_BOUNDED'):
                    qualification.expected_test_count(invalid, kind)
            with self.assertRaisesRegex(ValueError, 'EXACT_' + kind):
                qualification.parse_rust_results(row, 1, 7, count_kind=kind)

    def test_profile06_source_hashes_require_every_owned_input_and_shared_fixture(self):
        source = self.source_fixture('06')
        hashes = qualification.source_hashes(source, '06')
        required = [qualification.RUST_WORKSPACE + '/' + name
                    for name in qualification.RESOURCE_OWNED_RUST] + [qualification.SHARED_FIXTURE,
                        *qualification.RESOURCE_SHARED_FIXTURES, *qualification.RESOURCE_COMPILE_INPUTS,
                        *(qualification.RUST_WORKSPACE + '/' + name
                          for name in qualification.RESOURCE_BUILD_SCRIPTS)]
        for name in required:
            self.assertIn(name, hashes)
            path = source / name
            path.unlink()
            with self.subTest(missing=name), self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
                qualification.source_hashes(source, '06')
            path.write_text('TEST_ONLY\n')
        (source / qualification.RUST_WORKSPACE / qualification.RESOURCE_OWNED_RUST[1]).write_text('TEST_ONLY_CHANGED\n')
        changed = qualification.source_hashes(source, '06')
        self.assertNotEqual(hashes, changed)

    def test_profile06_public_compile_inputs_have_separate_exact_bounded_caps(self):
        source = self.source_fixture('06')
        self.assertEqual(len(qualification.RESOURCE_COMPILE_INPUTS), 14)
        for name, size in ((qualification.CONTRACT_PACK + 'extract/vocabularies.json', 86131),
                           (qualification.CONTRACT_PACK + 'extract/response-shapes.json', 332122)):
            (source / name).write_bytes(b'x' * size)
        qualification.source_hashes(source, '06')
        for name, cap in qualification.RESOURCE_COMPILE_INPUTS.items():
            for size in (0, cap + 1):
                (source / name).write_bytes(b'x' * size)
                with self.subTest(path=name, size=size), self.assertRaisesRegex(
                        ValueError, 'BOUNDED_PUBLIC_COMPILE_INPUT_REQUIRED'):
                    qualification.source_hashes(source, '06')
            (source / name).write_text('TEST_ONLY\n')

    def test_profile06_workspace_contract_lock_is_required_bounded_and_hash_bound(self):
        source = self.source_fixture('06')
        name = qualification.RUST_WORKSPACE + '/contract-pack.lock.json'
        self.assertEqual(qualification.RESOURCE_COMPILE_INPUTS[name], 64 * 1024)
        before = qualification.source_hashes(source, '06')
        path = source / name
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '06')
        for size in (0, 64 * 1024 + 1):
            path.write_bytes(b'x' * size)
            with self.subTest(size=size), self.assertRaisesRegex(
                    ValueError, 'BOUNDED_PUBLIC_COMPILE_INPUT_REQUIRED'):
                qualification.source_hashes(source, '06')
        path.write_text('TEST_ONLY_CHANGED\n')
        self.assertNotEqual(before[name], qualification.source_hashes(source, '06')[name])

    def test_profile06_original_nine_shared_fixture_caps_are_not_relaxed(self):
        source = self.source_fixture('06')
        self.assertEqual(qualification.MAX_SHARED_FIXTURE_BYTES, 64 * 1024)
        for name in (qualification.SHARED_FIXTURE, *qualification.RESOURCE_SHARED_FIXTURES):
            (source / name).write_bytes(b'x' * (64 * 1024 + 1))
            with self.subTest(path=name), self.assertRaisesRegex(
                    ValueError, 'BOUNDED_SHARED_FIXTURE_REQUIRED'):
                qualification.source_hashes(source, '06')
            (source / name).write_text('TEST_ONLY\n')

    def test_profile06_edge_bin_tests_execute_separately_from_six_lib_summaries(self):
        self.assertEqual(qualification.EDGE_TEST_ARGUMENTS, (
            'cargo', 'test', '--offline', '--locked', '-p', 'edge-service',
            '--bins', '--', '--test-threads=1'))
        row = 'test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        result = qualification.parse_rust_results(row, 1)
        self.assertEqual(result['passed'], 17)
        self.assertEqual(result['test_binaries'], 1)
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results(row + '\n' + row, 1)

    def test_profile06_copied_input_mtimes_refresh_without_changing_bytes_or_cache(self):
        source = self.source_fixture('06', private_prefix='epg10-06-')
        before = qualification.source_hashes(source, '06')
        cache = source.parent / 'target'
        cache.mkdir()
        sentinel = cache / 'untouched'
        sentinel.write_text('TEST_ONLY_CACHE\n')
        cache_mtime = sentinel.stat().st_mtime_ns
        stamp = 2_000_000_000_000_000_000
        with patch.object(qualification.time, 'time_ns', return_value=stamp):
            receipt = qualification.refresh_copied_input_mtimes(source.parent, source, before)
        self.assertEqual(receipt['touched_files'], len(before))
        self.assertEqual(receipt['refreshed_at_ns'], stamp)
        self.assertTrue(receipt['bytes_unchanged'])
        self.assertFalse(receipt['target_or_cache_touched'])
        self.assertEqual(qualification.source_hashes(source, '06'), before)
        self.assertTrue(all((source / name).stat().st_mtime_ns == stamp for name in before))
        self.assertEqual(sentinel.stat().st_mtime_ns, cache_mtime)

    def test_profile06_mtime_refresh_rejects_escape_wrong_profile_and_manifest_bounds(self):
        source = self.source_fixture('06', private_prefix='epg10-06-')
        before = qualification.source_hashes(source, '06')
        with patch.object(qualification.os, 'utime') as mutate:
            for base in (Path('/home/bobby'), Path('/tmp/epg10-04-test'),
                         Path('/tmp/epg10-05-test')):
                with self.subTest(base=base), self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                    qualification.refresh_copied_input_mtimes(base, source, before)
            with self.assertRaisesRegex(ValueError, 'EXACT_PRIVATE_SOURCE_PATH'):
                qualification.refresh_copied_input_mtimes(source.parent, source / '..', before)
            for manifest in ({}, {'../outside': '0' * 64},
                             {str(index): '0' * 64 for index in range(10001)}):
                with self.assertRaisesRegex(ValueError, 'EXACT_VALIDATED_INPUT_MANIFEST'):
                    qualification.refresh_copied_input_mtimes(source.parent, source, manifest)
            mutate.assert_not_called()

    def test_profile06_mtime_refresh_rejects_symlink_and_hardlinked_source(self):
        source = self.source_fixture('06', private_prefix='epg10-06-')
        before = qualification.source_hashes(source, '06')
        path = source / qualification.RUST_WORKSPACE / 'Cargo.toml'
        original = path.read_bytes()
        outside = source.parent / 'outside'
        outside.write_bytes(original)
        outside_mtime = outside.stat().st_mtime_ns
        path.unlink()
        path.symlink_to(outside)
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'SOURCE_SYMLINK_NOT_ALLOWED'):
                qualification.refresh_copied_input_mtimes(source.parent, source, before)
            mutate.assert_not_called()
        path.unlink()
        qualification.os.link(outside, path)
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'PRIVATE_UNLINKED_SOURCE_FILE'):
                qualification.refresh_copied_input_mtimes(source.parent, source, before)
            mutate.assert_not_called()
        self.assertEqual(outside.stat().st_mtime_ns, outside_mtime)

    def test_profile06_does_not_accept_profile05_source_inventory_as_complete(self):
        source = self.source_fixture('05')
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '06')
        warning = {'message': {'level': 'warning', 'code': {'code': 'clippy::resource'},
            'spans': [{'is_primary': True, 'file_name': qualification.RESOURCE_OWNED_RUST[1]}]}}
        self.assertEqual(qualification.clippy_findings(json.dumps(warning), '06')['owned_warnings'],
                         ['clippy::resource'])

    def test_profile07_cleanup_and_private_paths_cannot_select_other_profiles(self):
        helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '07')
        self.assertTrue(helper.PG.startswith('epg10-07-pg-'))
        self.assertTrue(helper.OWNER.startswith('codex-epg10-07-'))
        self.assertNotEqual(helper.PG, self.helper.PG)
        for path in ('/home/bobby', '/tmp/epg10-04-test', '/tmp/epg10-05-test',
                     '/tmp/epg10-06-test', '/tmp/epg10-07-',
                     '/tmp/epg10-07-test/child', '/tmp/epg10-07-test/../foreign'):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.validate_base(Path(path), '07')

    def test_profile07_adds_command_and_auth_units_to_all_six06_packages(self):
        packages = qualification.package_arguments('07')
        self.assertEqual(packages, ['-p', 'command-relay', '-p', 'edge-auth',
                                    *qualification.package_arguments('06')])
        self.assertEqual(len(packages), 16)
        self.assertEqual(len(set(packages[1::2])), 8)
        row = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results('\n'.join([row]*8), 8)['passed'], 16)
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results('\n'.join([row]*6), 8)

    def test_profile07_unit_timeout_is_bounded_without_changing_prior_profiles_or_own_lock(self):
        self.assertEqual({profile: qualification.UNIT_TEST_TIMEOUT_SECONDS[profile]
                          for profile in ('04', '05', '06', '07')},
                         {'04': 240, '05': 240, '06': 240, '07': 600})
        self.assertEqual(qualification.LOCK_SECONDS, 1500)
        self.assertLess(qualification.UNIT_TEST_TIMEOUT_SECONDS['07'], qualification.LOCK_SECONDS - 30)

    def test_profile07_command_count_is_explicit_bounded_exact_and_unskippable(self):
        for value in ('1', '12', '128'):
            self.assertEqual(qualification.expected_test_count(value, 'COMMAND'), int(value))
        for invalid in (None, '', '0', '129', '-1', '1.0', '01', 1, True):
            with self.subTest(value=invalid), self.assertRaisesRegex(ValueError, 'EXACT_BOUNDED_COMMAND'):
                qualification.expected_test_count(invalid, 'COMMAND')
        row = 'test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results(row, 1, 12, count_kind='COMMAND')['passed'], 12)
        with self.assertRaisesRegex(ValueError, 'EXACT_COMMAND_TEST_COUNT'):
            qualification.parse_rust_results(row, 1, 11, count_kind='COMMAND')
        for invalid in ('', row.replace('0 ignored', '1 ignored'),
                        row.replace('0 filtered out', '1 filtered out')):
            with self.subTest(result=invalid), self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
                qualification.parse_rust_results(invalid, 1, 12, count_kind='COMMAND')

    def test_profile07_requires_and_hash_binds_every_command_source_and_migration(self):
        source = self.source_fixture('07')
        before = qualification.source_hashes(source, '07')
        for name in (*qualification.COMMAND_OWNED_RUST, qualification.COMMAND_MIGRATION):
            relative = qualification.RUST_WORKSPACE + '/' + name
            self.assertIn(relative, before)
            path = source / relative
            path.unlink()
            with self.subTest(missing=name), self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
                qualification.source_hashes(source, '07')
            path.write_text('TEST_ONLY_CHANGED\n')
            self.assertNotEqual(before[relative], qualification.source_hashes(source, '07')[relative])
            path.write_text('TEST_ONLY\n')

    def test_profile07_does_not_accept06_inventory_but06_keeps_its_original_requirements(self):
        source = self.source_fixture('06')
        before = qualification.source_hashes(source, '06')
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '07')
        self.assertEqual(qualification.source_hashes(source, '06'), before)
        self.assertFalse(set(qualification.COMMAND_OWNED_RUST) & set(qualification.owned_rust('06')))
        self.assertTrue(set(qualification.owned_rust('06')) < set(qualification.owned_rust('07')))

    def test_profile07_legacy_denied_fixture_is_required_bounded_and_hash_bound(self):
        source = self.source_fixture('07')
        name = 'packages/contracts/fixtures/execution-command-relay-denied.valid.json'
        self.assertEqual(qualification.COMMAND_SHARED_FIXTURES, (name,))
        before = qualification.source_hashes(source, '07')
        path = source / name
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '07')
        for size in (0, 64 * 1024 + 1):
            path.write_bytes(b'x' * size)
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, 'BOUNDED_SHARED_FIXTURE'):
                qualification.source_hashes(source, '07')
        path.write_text('TEST_ONLY_CHANGED\n')
        self.assertNotEqual(before[name], qualification.source_hashes(source, '07')[name])
        # The newly required07 fixture is not a06 prerequisite.
        path.unlink()
        qualification.source_hashes(source, '06')

    def test_profile07_retains_exact_public_compile_inputs_and_original_fixture_bounds(self):
        source = self.source_fixture('07')
        before = qualification.source_hashes(source, '07')
        for name in (*qualification.RESOURCE_SHARED_FIXTURES, *qualification.RESOURCE_COMPILE_INPUTS,
                     *(qualification.RUST_WORKSPACE + '/' + path
                       for path in qualification.RESOURCE_BUILD_SCRIPTS)):
            self.assertIn(name, before)
        for name, cap in ((qualification.SHARED_FIXTURE, qualification.MAX_SHARED_FIXTURE_BYTES),
                          *qualification.RESOURCE_COMPILE_INPUTS.items()):
            path = source / name
            path.write_bytes(b'x' * (cap + 1))
            with self.subTest(path=name), self.assertRaisesRegex(ValueError, 'BOUNDED_'):
                qualification.source_hashes(source, '07')
            path.write_text('TEST_ONLY\n')

    def test_profile07_mtime_refresh_uses_explicit_profile_and_never_changes_bytes(self):
        source = self.source_fixture('07', private_prefix='epg10-07-')
        before = qualification.source_hashes(source, '07')
        stamp = 2_000_000_000_000_000_001
        with patch.object(qualification.time, 'time_ns', return_value=stamp):
            receipt = qualification.refresh_copied_input_mtimes(source.parent, source, before, '07')
        self.assertEqual(receipt['touched_files'], len(before))
        self.assertTrue(receipt['bytes_unchanged'])
        self.assertFalse(receipt['target_or_cache_touched'])
        self.assertEqual(qualification.source_hashes(source, '07'), before)
        self.assertTrue(all((source / name).stat().st_mtime_ns == stamp for name in before))
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.refresh_copied_input_mtimes(source.parent, source, before)
            mutate.assert_not_called()

    def test_profile07_mtime_refresh_rejects_escape_drift_and_linked_source(self):
        source = self.source_fixture('07', private_prefix='epg10-07-')
        before = qualification.source_hashes(source, '07')
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'EXACT_PRIVATE_SOURCE_PATH'):
                qualification.refresh_copied_input_mtimes(source.parent, source / '..', before, '07')
            for manifest in ({}, {'../outside': '0' * 64}, dict(before, injected='0' * 64)):
                with self.assertRaisesRegex(ValueError, 'EXACT_VALIDATED_INPUT_MANIFEST'):
                    qualification.refresh_copied_input_mtimes(source.parent, source, manifest, '07')
            mutate.assert_not_called()
        path = source / qualification.RUST_WORKSPACE / qualification.COMMAND_OWNED_RUST[0]
        outside = source.parent / 'outside'
        path.rename(outside)
        qualification.os.link(outside, path)
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'PRIVATE_UNLINKED_SOURCE_FILE'):
                qualification.refresh_copied_input_mtimes(source.parent, source, before, '07')
            mutate.assert_not_called()

    def test_profile07_command_and_prior_resource_warnings_are_owned(self):
        for path in (*qualification.COMMAND_OWNED_RUST, *qualification.RESOURCE_OWNED_RUST):
            warning = {'message': {'level': 'warning', 'code': {'code': 'clippy::command'},
                'spans': [{'is_primary': True, 'file_name': path}]}}
            with self.subTest(path=path):
                self.assertEqual(qualification.clippy_findings(json.dumps(warning), '07')['owned_warnings'],
                                 ['clippy::command'])

    def test_profile07_unconfirmed_optional_orchestration_paths_are_not_required_but_are_hashed(self):
        source = self.source_fixture('07')
        before = qualification.source_hashes(source, '07')
        for name in ('crates/command-relay/src/relay.rs', 'crates/edge-service/src/command_relay.rs'):
            self.assertNotIn(name, qualification.COMMAND_OWNED_RUST)
            path = source / qualification.RUST_WORKSPACE / name
            self.assertFalse(path.exists())
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('TEST_ONLY_OPTIONAL_SOURCE\n')
            relative = qualification.RUST_WORKSPACE + '/' + name
            after = qualification.source_hashes(source, '07')
            self.assertIn(relative, after)
            self.assertEqual(after[relative], qualification.hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertTrue(set(before) < set(after))

    def test_profile08_cleanup_and_private_paths_cannot_select_other_profiles(self):
        helper = qualification.load_cleanup_helpers(Path(__file__).resolve().parent, '08')
        self.assertTrue(helper.PG.startswith('epg10-08-pg-'))
        self.assertTrue(helper.OWNER.startswith('codex-epg10-08-'))
        self.assertNotEqual(helper.PG, self.helper.PG)
        for path in ('/home/bobby', '/tmp/epg10-04-test', '/tmp/epg10-05-test',
                     '/tmp/epg10-06-test', '/tmp/epg10-07-test', '/tmp/epg10-08-',
                     '/tmp/epg10-08-test/child', '/tmp/epg10-08-test/../foreign'):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.validate_base(Path(path), '08')

    def test_profile08_adds_transport_and_manager_units_to_all_eight07_packages(self):
        packages = qualification.package_arguments('08')
        self.assertEqual(packages, ['-p', 'ts-transport', '-p', 'manager-v2-client',
                                    *qualification.package_arguments('07')])
        self.assertEqual(len(packages), 20)
        self.assertEqual(len(set(packages[1::2])), 10)
        row = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results('\n'.join([row]*10), 10)['passed'], 20)
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results('\n'.join([row]*8), 10)

    def test_profile08_tls_count_is_explicit_bounded_exact_and_unskippable(self):
        for value in ('1', '6', '128'):
            self.assertEqual(qualification.expected_test_count(value, 'TLS'), int(value))
        for invalid in (None, '', '0', '129', '-1', '1.0', '01', 1, True):
            with self.subTest(value=invalid), self.assertRaisesRegex(ValueError, 'EXACT_BOUNDED_TLS'):
                qualification.expected_test_count(invalid, 'TLS')
        row = 'test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        self.assertEqual(qualification.parse_rust_results(row, 1, 6, count_kind='TLS')['passed'], 6)
        with self.assertRaisesRegex(ValueError, 'EXACT_TLS_TEST_COUNT'):
            qualification.parse_rust_results(row, 1, 5, count_kind='TLS')
        for invalid in ('', row.replace('0 ignored', '1 ignored'),
                        row.replace('0 filtered out', '1 filtered out')):
            with self.subTest(result=invalid), self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
                qualification.parse_rust_results(invalid, 1, 6, count_kind='TLS')

    def test_profile08_requires_and_hash_binds_every_security_source_and_compile_fixture(self):
        source = self.source_fixture('08')
        before = qualification.source_hashes(source, '08')
        required = [qualification.RUST_WORKSPACE + '/' + name
                    for name in qualification.SECURITY_OWNED_RUST]
        required.extend(qualification.SECURITY_COMPILE_INPUTS)
        for relative in required:
            self.assertIn(relative, before)
            path = source / relative
            path.unlink()
            with self.subTest(missing=relative), self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
                qualification.source_hashes(source, '08')
            path.write_text('TEST_ONLY_CHANGED\n')
            self.assertNotEqual(before[relative], qualification.source_hashes(source, '08')[relative])
            path.write_text('TEST_ONLY\n')

    def test_profile08_does_not_accept07_inventory_and_reuses_existing_pg_suites(self):
        source = self.source_fixture('07')
        before = qualification.source_hashes(source, '07')
        with self.assertRaisesRegex(ValueError, 'EXACT_OWNED_INPUT_MISSING'):
            qualification.source_hashes(source, '08')
        self.assertEqual(qualification.source_hashes(source, '07'), before)
        self.assertTrue(set(qualification.owned_rust('07')) < set(qualification.owned_rust('08')))
        self.assertIn('crates/projection-store-pg/tests/epg10_05_scoped_read.rs',
                      qualification.owned_rust('08'))
        self.assertNotIn('crates/projection-store-pg/tests/epg10_08_security.rs',
                         qualification.owned_rust('08'))
        with self.assertRaisesRegex(ValueError, 'EXPLICIT_TEST_COUNT_KIND'):
            qualification.expected_test_count('1', 'SECURITY')

    def test_profile08_transport_fixtures_have_individual_64k_caps_and_original_caps_stay_strict(self):
        source = self.source_fixture('08')
        self.assertEqual(len(qualification.SECURITY_COMPILE_INPUTS), 7)
        for name, cap in qualification.SECURITY_COMPILE_INPUTS.items():
            self.assertEqual(cap, 64 * 1024)
            for size in (0, cap + 1):
                (source / name).write_bytes(b'x' * size)
                with self.subTest(path=name, size=size), self.assertRaisesRegex(
                        ValueError, 'BOUNDED_PUBLIC_COMPILE_INPUT_REQUIRED'):
                    qualification.source_hashes(source, '08')
            (source / name).write_text('TEST_ONLY\n')
        for name in (qualification.SHARED_FIXTURE, *qualification.RESOURCE_SHARED_FIXTURES,
                     *qualification.COMMAND_SHARED_FIXTURES):
            (source / name).write_bytes(b'x' * (64 * 1024 + 1))
            with self.subTest(path=name), self.assertRaisesRegex(ValueError, 'BOUNDED_SHARED_FIXTURE'):
                qualification.source_hashes(source, '08')
            (source / name).write_text('TEST_ONLY\n')

    def test_profile08_mtime_refresh_is_explicit_and_never_changes_bytes(self):
        source = self.source_fixture('08', private_prefix='epg10-08-')
        before = qualification.source_hashes(source, '08')
        stamp = 2_000_000_000_000_000_002
        with patch.object(qualification.time, 'time_ns', return_value=stamp):
            receipt = qualification.refresh_copied_input_mtimes(source.parent, source, before, '08')
        self.assertEqual(receipt['touched_files'], len(before))
        self.assertTrue(receipt['bytes_unchanged'])
        self.assertFalse(receipt['target_or_cache_touched'])
        self.assertEqual(qualification.source_hashes(source, '08'), before)
        self.assertTrue(all((source / name).stat().st_mtime_ns == stamp for name in before))
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'PRIVATE_DISPOSABLE'):
                qualification.refresh_copied_input_mtimes(source.parent, source, before)
            mutate.assert_not_called()

    def test_profile08_mtime_refresh_rejects_escape_and_manifest_drift_before_mutation(self):
        source = self.source_fixture('08', private_prefix='epg10-08-')
        before = qualification.source_hashes(source, '08')
        with patch.object(qualification.os, 'utime') as mutate:
            with self.assertRaisesRegex(ValueError, 'EXACT_PRIVATE_SOURCE_PATH'):
                qualification.refresh_copied_input_mtimes(source.parent, source / '..', before, '08')
            for manifest in ({}, {'../outside': '0' * 64}, dict(before, injected='0' * 64)):
                with self.assertRaisesRegex(ValueError, 'EXACT_VALIDATED_INPUT_MANIFEST'):
                    qualification.refresh_copied_input_mtimes(source.parent, source, manifest, '08')
            mutate.assert_not_called()

    def test_profile08_security_warnings_are_owned_and_tls_executes_exactly_one_binary(self):
        for path in qualification.SECURITY_OWNED_RUST:
            warning = {'message': {'level': 'warning', 'code': {'code': 'clippy::security'},
                'spans': [{'is_primary': True, 'file_name': path}]}}
            with self.subTest(path=path):
                self.assertEqual(qualification.clippy_findings(json.dumps(warning), '08')['owned_warnings'],
                                 ['clippy::security'])
        self.assertEqual(qualification.TLS_TEST_ARGUMENTS, (
            'cargo', 'test', '--offline', '--locked', '-p', 'manager-v2-client',
            '--test', 'epg10_08_tls', '--', '--nocapture', '--test-threads=1'))
        row = 'test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out'
        with self.assertRaisesRegex(ValueError, 'ALL_REQUIRED'):
            qualification.parse_rust_results(row + '\n' + row, 1, 6, count_kind='TLS')

    def test_profile08_unit_timeout_stays_bounded_and_preserves_all_prior_profiles(self):
        self.assertEqual(qualification.UNIT_TEST_TIMEOUT_SECONDS,
                         {'04': 240, '05': 240, '06': 240, '07': 600, '08': 600})
        self.assertEqual(qualification.LOCK_SECONDS, 1500)
        self.assertLess(qualification.UNIT_TEST_TIMEOUT_SECONDS['08'], qualification.LOCK_SECONDS - 30)

    @staticmethod
    def child_usage(user=1.0, system=0.5, rss=100, reads=2, writes=4):
        return SimpleNamespace(ru_utime=user, ru_stime=system, ru_maxrss=rss,
                               ru_inblock=reads, ru_oublock=writes)

    def test_child_resource_deltas_label_cumulative_rss_and_block_operations(self):
        result = qualification.child_resource_delta(self.child_usage(),
            self.child_usage(user=1.25, system=0.75, rss=120, reads=3, writes=7))
        self.assertEqual(result['user_cpu_seconds'], 0.25)
        self.assertEqual(result['system_cpu_seconds'], 0.25)
        self.assertEqual(result['maxrss_before_kib'], 100)
        self.assertEqual(result['maxrss_after_kib'], 120)
        self.assertEqual(result['maxrss_cumulative_highwater_delta_kib'], 20)
        self.assertEqual(result['block_input_operations'], 1)
        self.assertEqual(result['block_output_operations'], 3)
        self.assertTrue(result['tainted_for_capacity'])
        self.assertIn('NOT_INDIVIDUAL_STAGE_PEAK', result['limitations'][0])
        unchanged = qualification.child_resource_delta(self.child_usage(), self.child_usage())
        self.assertEqual(unchanged['maxrss_cumulative_highwater_delta_kib'], 0)

    def test_child_resource_deltas_reject_regressions_nonfinite_and_non_numeric_values(self):
        for field, invalid in (('ru_utime', float('nan')), ('ru_stime', float('inf')),
                               ('ru_maxrss', -1), ('ru_inblock', True), ('ru_oublock', '1')):
            after = self.child_usage()
            setattr(after, field, invalid)
            with self.subTest(field=field), self.assertRaises(ValueError):
                qualification.child_resource_delta(self.child_usage(), after)
        with self.assertRaisesRegex(ValueError, 'REGRESSED'):
            qualification.child_resource_delta(self.child_usage(), self.child_usage(rss=99))
        with self.assertRaises(ValueError):
            qualification.metric_number(10**1000, integer=True)

    @staticmethod
    def manager_cost_fixture():
        return dict(schema='epg10.manager-cost.v1', provenance='TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL',
            tainted_for_capacity=True, entities=128, changed_entities=1,
            baseline_record_lookup_commands=128, baseline_record_lookup_elapsed_us=12.5,
            candidate_current_bulk_reads=1, candidate_unchanged_record_lookups=0,
            applied_entities=1, removed_entities=0, unchanged_entities=127,
            candidate_cycle_elapsed_us=8, candidate_wal_bytes=1024,
            baseline_full_snapshot_elapsed_us=16, baseline_full_snapshot_wal_bytes=8192,
            baseline_full_snapshot_applied_entities=128)

    def test_manager_cost_parser_accepts_one_exact_bounded_test_only_line(self):
        value = self.manager_cost_fixture()
        result = qualification.parse_manager_cost('test prelude\nEPG10_COST_JSON=' + json.dumps(value) + '\nok\n')
        self.assertEqual(result['values'], value)
        self.assertTrue(result['tainted_for_capacity'])
        self.assertFalse(result['performance_acceptance'])
        self.assertIn('NOT_TOTAL_SQL', result['basis'])

    def test_manager_cost_parser_rejects_missing_duplicate_prefixed_or_unbounded_lines(self):
        line = 'EPG10_COST_JSON=' + json.dumps(self.manager_cost_fixture())
        for text in ('', line + '\n' + line, 'test fixture ... ' + line,
                     'EPG10_COST_JSON=' + 'x'*qualification.MAX_COST_LINE_BYTES):
            with self.subTest(text=text[:40]), self.assertRaises(ValueError):
                qualification.parse_manager_cost(text)
        with self.assertRaisesRegex(ValueError, 'BOUNDED_MANAGER_COST_LOG'):
            qualification.parse_manager_cost('x'*(qualification.MAX_LOG_BYTES + 1))

    def test_manager_cost_parser_rejects_extra_keys_wrong_provenance_or_duplicate_json_fields(self):
        for key, invalid in (('schema', 'unknown'), ('provenance', 'PRODUCTION'),
                             ('tainted_for_capacity', False), ('secret', 'DO_NOT_PUBLISH')):
            value = self.manager_cost_fixture()
            value[key] = invalid
            with self.subTest(field=key), self.assertRaisesRegex(ValueError, 'EXACT_TEST_ONLY'):
                qualification.parse_manager_cost('EPG10_COST_JSON=' + json.dumps(value))
        text = json.dumps(self.manager_cost_fixture())
        with self.assertRaisesRegex(ValueError, 'DUPLICATE_METRIC_KEY'):
            qualification.parse_manager_cost('EPG10_COST_JSON=' + text[:-1] + ',"entities":128}')

    def test_manager_cost_parser_rejects_bad_numbers_and_inconsistent_fixture_counts(self):
        for key, invalid in (('entities', True), ('candidate_wal_bytes', -1),
                             ('candidate_cycle_elapsed_us', float('nan')),
                             ('baseline_record_lookup_elapsed_us', float('inf')),
                             ('candidate_current_bulk_reads', 2), ('unchanged_entities', 128),
                             ('baseline_full_snapshot_applied_entities', 127),
                             ('changed_entities', 0), ('baseline_record_lookup_commands', 127)):
            value = self.manager_cost_fixture()
            value[key] = invalid
            with self.subTest(field=key), self.assertRaises(ValueError):
                qualification.parse_manager_cost('EPG10_COST_JSON=' + json.dumps(value))

    @staticmethod
    def wal_fixture(**changes):
        value = dict(database='portal_projection_test_epg10_04', wal_records=4,
                     wal_fpi=2, wal_bytes=4096, stats_reset='2026-10-16 00:00:00+00')
        return dict(value, **changes)

    def test_owned_wal_query_is_readonly_and_requires_immutable_identity(self):
        helper = MagicMock()
        helper.docker.return_value.stdout = json.dumps(self.wal_fixture()).encode()
        self.assertEqual(qualification.owned_wal_stats(helper, 'a'*64), self.wal_fixture())
        args = helper.docker.call_args.args
        self.assertEqual(args[:2], ('exec', 'a'*64))
        self.assertIn('BEGIN READ ONLY', args[-1])
        self.assertIn('pg_stat_wal', args[-1])
        helper.docker.reset_mock()
        with self.assertRaisesRegex(ValueError, 'IMMUTABLE_OWNED'):
            qualification.owned_wal_stats(helper, 'operational-name')
        helper.docker.assert_not_called()

    def test_owned_wal_parser_rejects_wrong_target_extra_keys_boolean_or_unbounded_output(self):
        helper = MagicMock()
        for value in (self.wal_fixture(database='production'), self.wal_fixture(wal_bytes=True),
                      self.wal_fixture(extra='DO_NOT_PUBLISH'), self.wal_fixture(stats_reset=None)):
            helper.docker.return_value.stdout = json.dumps(value).encode()
            with self.subTest(value=value), self.assertRaises(ValueError):
                qualification.owned_wal_stats(helper, 'a'*64)
        helper.docker.return_value.stdout = b'x'*4097
        with self.assertRaisesRegex(ValueError, 'BOUNDED_OWNED_WAL'):
            qualification.owned_wal_stats(helper, 'a'*64)

    def test_owned_wal_observation_reports_counter_delta_not_transaction_or_capacity_proof(self):
        before = self.wal_fixture()
        after = self.wal_fixture(wal_records=8, wal_fpi=3, wal_bytes=8192)
        result = qualification.wal_observation(before, after)
        self.assertEqual(result['delta'], dict(wal_records=4, wal_fpi=1, wal_bytes=4096))
        self.assertTrue(result['tainted_for_capacity'])
        self.assertIn('NOT_PER_TEST_TRANSACTION', result['basis'])
        self.assertIn('STATISTICS_FLUSH_LAG_POSSIBLE', result['limitations'])
        with self.assertRaisesRegex(ValueError, 'EPOCH_CHANGED'):
            qualification.wal_observation(before, self.wal_fixture(stats_reset='different'))
        with self.assertRaisesRegex(ValueError, 'REGRESSED'):
            qualification.wal_observation(before, self.wal_fixture(wal_records=3))


if __name__ == '__main__':
    unittest.main()
