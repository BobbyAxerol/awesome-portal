"""In-memory/fake-lock observer tests; no Docker, load or real business data."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import execution_edge_observe as m


class Tests(unittest.TestCase):
    def doc(self):
        group=dict(cpu={'usage_usec':0,'throttled_usec':0},memory_bytes=10,
                   anonymous_bytes=5,file_bytes=5,memory_events={'oom':0},io={},
                   network={'rx_bytes':0,'tx_bytes':0},pids=1)
        row=dict(monotonic_ns=0,utc_ns=0,groups={'test':group},
                 host=dict(memory_available_bytes=100,load_average=[1,2,3]))
        last=deepcopy(row); last['monotonic_ns']=last['utc_ns']=1_000_000_000
        last['groups']['test']['cpu']['usage_usec']=100_000
        return dict(schema='epg10.passive-observation.v1',status='TEST_ONLY',
                    roster=[{'name':'test'}],samples=[row,last],runtime_acceptance=False)

    def test_exact_cpu_duration(self):
        r=m.summarize(self.doc())
        self.assertEqual(r['groups'][0]['cpu_core_seconds'],.1)
        self.assertEqual(r['groups'][0]['average_cores'],.1)
        self.assertFalse(r['runtime_acceptance'])

    def test_host_cpu_busy_and_iowait_are_separate(self):
        doc=self.doc()
        doc['samples'][0]['host']['cpu_ticks']=[0]*8
        doc['samples'][1]['host']['cpu_ticks']=[20,0,10,60,10,0,0,0]
        host=m.summarize(doc)['host_summary']
        self.assertEqual(host['cpu_busy_fraction'],.3)
        self.assertEqual(host['cpu_iowait_fraction'],.1)

    def test_host_cpu_empty_window_is_rejected(self):
        doc=self.doc()
        for s in doc['samples']: s['host']['cpu_ticks']=[0]*8
        with self.assertRaisesRegex(ValueError,'HOST_CPU_WINDOW_REQUIRED'): m.summarize(doc)

    def test_counter_reset_rejected(self):
        doc=self.doc(); doc['samples'][0]['groups']['test']['cpu']['usage_usec']=200_000
        with self.assertRaises(ValueError): m.summarize(doc)

    def test_intermediate_reset_and_regrowth_rejected(self):
        doc=self.doc(); middle=deepcopy(doc['samples'][0])
        middle['monotonic_ns']=middle['utc_ns']=500_000_000
        doc['samples'][0]['groups']['test']['cpu']['usage_usec']=1
        doc['samples'].insert(1,middle)
        with self.assertRaisesRegex(ValueError,'COUNTER_RESET'): m.summarize(doc)

    def test_intermediate_clock_regression_rejected(self):
        doc=self.doc(); doc['samples'].insert(1,deepcopy(doc['samples'][0]))
        with self.assertRaisesRegex(ValueError,'NONMONOTONIC_SAMPLE'): m.summarize(doc)

    def test_inspect_requests_no_environment_or_mounts(self):
        row=dict(Name='/test',Id='id',Image='image',Running=True,Pid=12,
                 RestartCount=0,config='hash',revision=None,project='test')
        with patch.object(m.subprocess,'check_output',return_value=json.dumps(row).encode()) as call:
            with patch.object(m,'process_identity',return_value=(42,'/test')):
                with patch.object(m.os,'readlink',return_value='net:[42]'):
                    self.assertEqual(m.inspect(['test'])[0]['network_namespace'],'net:[42]')
        argv=call.call_args.args[0]
        self.assertIn('--format',argv)
        self.assertNotIn('.Config.Env',argv[3]); self.assertNotIn('.Mounts',argv[3])
        self.assertIn('{{json (index .Config.Labels "com.docker.compose.config-hash")}}',argv[3])

    def test_sampled_max_not_historical_peak(self):
        doc=self.doc(); doc['samples'][1]['groups']['test']['memory_bytes']=20
        self.assertEqual(m.summarize(doc)['groups'][0]['sampled_memory_max_bytes'],20)

    def test_full_positive_window_required(self):
        for mutation in ['short','clock']:
            doc=self.doc()
            if mutation=='short': doc['samples']=doc['samples'][:1]
            else: doc['samples'][1]['monotonic_ns']=0
            with self.assertRaises(ValueError): m.summarize(doc)

    def test_duplicate_invalid_counter_rejected(self):
        for text in ['a 1\na 2','a -1','a nan']:
            with self.assertRaises(ValueError): m.counters(text)

    def test_roster_rejected_before_docker(self):
        for names in [[],['a','a'],['--help'],['a/b'],['a']*49]:
            with self.assertRaises(ValueError): m.inspect(names)

    def test_owned_lock_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='epg10-observe-test-') as d:
            path=Path(d)/'lock'
            with m.measurement_lock(path,'TEST_ONLY',10) as payload:
                self.assertTrue(path.exists())
                self.assertEqual(payload['class'], 'measurement')
            self.assertFalse(path.exists())

    def test_foreign_lock_never_overwritten(self):
        with tempfile.TemporaryDirectory(prefix='epg10-observe-test-') as d:
            path=Path(d)/'lock'; path.write_text('foreign')
            with self.assertRaises(FileExistsError):
                with m.measurement_lock(path,'TEST_ONLY',10): pass
            self.assertEqual(path.read_text(),'foreign')

    def test_replaced_owner_lock_not_deleted(self):
        with tempfile.TemporaryDirectory(prefix='epg10-observe-test-') as d:
            path=Path(d)/'lock'
            with self.assertRaisesRegex(ValueError,'LOCK_REPLACED'):
                with m.measurement_lock(path,'TEST_ONLY',10):
                    value=json.loads(path.read_text()); value['owner']='foreign'; path.write_text(json.dumps(value))
            self.assertTrue(path.exists())

    def test_missing_owner_lock_rejected(self):
        with tempfile.TemporaryDirectory(prefix='epg10-observe-test-') as d:
            path=Path(d)/'lock'
            with self.assertRaisesRegex(ValueError,'LOCK_DISAPPEARED'):
                with m.measurement_lock(path,'TEST_ONLY',10): path.unlink()

    def test_expired_lock_rejected_during_observation(self):
        with tempfile.TemporaryDirectory(prefix='epg10-observe-test-') as d:
            path=Path(d)/'lock'; value={'until_utc':'2020-01-01T00:00:00+00:00'}
            path.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError,'LOCK_EXPIRED'): m.verify_lock(path,value)

    def test_network_io_and_oom_deltas(self):
        doc=self.doc(); g=doc['samples'][1]['groups']['test']
        g['network']['tx_bytes']=15; g['io']={'1:1':{'rbytes':100}}; g['memory_events']['oom']=1
        r=m.summarize(doc)['groups'][0]
        self.assertEqual(r['network_delta']['tx_bytes'],15)
        self.assertEqual(r['io_delta']['rbytes'],100)
        self.assertEqual(r['memory_events_delta']['oom'],1)

    def activity(self, path, owner='TEST_ONLY', **overrides):
        args = dict(owner=owner, seconds=30, purpose='TEST_ONLY capped correctness', cpu_cap=1.5)
        args.update(overrides)
        return m.correctness_activity(path, **args)

    def test_correctness_coexists_with_active_measurement_without_touching_it(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            root = Path(d); lock = root / 'measurement.lock'; activity = root / 'TEST_ONLY.json'
            with m.measurement_lock(lock, 'foreign-measurement', 10):
                original = lock.read_bytes(); inode = lock.stat().st_ino
                with patch.object(m, 'LOCK', lock), self.activity(activity) as value:
                    self.assertEqual(value['class'], 'correctness')
                    self.assertEqual(value['cpu_cap'], 1.5)
                    self.assertEqual(activity.stat().st_mode & 0o777, 0o600)
                    m.verify_activity(activity, value)
                    self.assertEqual(lock.read_bytes(), original)
                self.assertEqual(lock.stat().st_ino, inode)
                self.assertEqual(lock.read_bytes(), original)
            self.assertFalse(activity.exists())

    def test_independent_correctness_owners_run_together(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            a = Path(d) / 'TEST_ONLY.json'; b = Path(d) / 'OTHER.json'
            with self.activity(a) as first, self.activity(b, owner='OTHER') as second:
                m.verify_activity(a, first); m.verify_activity(b, second)
            self.assertFalse(a.exists()); self.assertFalse(b.exists())

    def test_existing_correctness_owner_never_overwritten(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.activity(path) as original:
                with self.assertRaises(FileExistsError), self.activity(path):
                    self.fail('same owner must not replace a running activity')
                m.verify_activity(path, original)

    def test_correctness_exception_releases_own_metadata(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.assertRaisesRegex(RuntimeError, 'TEST_ONLY_FAILURE'), self.activity(path):
                raise RuntimeError('TEST_ONLY_FAILURE')
            self.assertFalse(path.exists())

    def test_failed_activity_write_cleans_only_created_inode(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with patch.object(m.os, 'fsync', side_effect=OSError('TEST_ONLY')):
                with self.assertRaises(OSError), self.activity(path):
                    self.fail('failed visibility write cannot enter the job')
            self.assertFalse(path.exists())

    def test_changed_activity_payload_is_retained(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'), self.activity(path) as value:
                path.write_text(json.dumps({**value, 'owner': 'OTHER'}))
                with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'):
                    m.verify_activity(path, value)
            self.assertTrue(path.exists())

    def test_same_payload_replacement_inode_is_retained(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'; original = Path(d) / 'held.json'
            with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'), self.activity(path) as value:
                path.rename(original)
                path.write_text(json.dumps(value)); path.chmod(0o600)
                with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'):
                    m.verify_activity(path, value)
            self.assertTrue(path.exists()); self.assertTrue(original.exists())

    def test_missing_activity_is_not_silently_recreated(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.assertRaisesRegex(ValueError, 'ACTIVITY_DISAPPEARED'), self.activity(path):
                path.unlink()

    def test_expired_activity_refuses_next_stage_but_cleans_on_exit(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.activity(path) as value:
                future = datetime.now(timezone.utc) + timedelta(seconds=60)
                with patch.object(m, 'datetime') as clock:
                    clock.fromisoformat.side_effect = datetime.fromisoformat
                    clock.now.return_value = future
                    with self.assertRaisesRegex(ValueError, 'ACTIVITY_EXPIRED'):
                        m.verify_activity(path, value)
            self.assertFalse(path.exists())

    def test_correctness_rejects_unbounded_or_foreign_names(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            for changes in ({'owner': '../other'}, {'seconds': 0}, {'seconds': 10801},
                            {'seconds': True}, {'cpu_cap': 0}, {'cpu_cap': float('nan')},
                            {'cpu_cap': True}, {'purpose': ''}):
                with self.subTest(changes=changes), self.assertRaises(ValueError), self.activity(path, **changes):
                    self.fail('invalid activity')
            self.assertFalse(path.exists())

    def test_activity_symlink_and_writable_directory_are_refused(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            root = Path(d); target = root / 'untouched'; target.write_text('TEST_ONLY')
            path = root / 'TEST_ONLY.json'; path.symlink_to(target)
            with self.assertRaises(FileExistsError), self.activity(path):
                self.fail('no-follow activity')
            self.assertEqual(target.read_text(), 'TEST_ONLY')
            path.unlink(); root.chmod(0o777)
            try:
                with self.assertRaisesRegex(ValueError, 'ACTIVITY_DIRECTORY_REFUSED'), self.activity(path):
                    self.fail('unsafe activity directory')
            finally:
                root.chmod(0o700)

    def test_activity_verifier_refuses_widened_permissions(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'
            with self.activity(path) as value:
                path.chmod(0o644)
                with self.assertRaisesRegex(ValueError, 'ACTIVITY_FILE_REFUSED'):
                    m.verify_activity(path, value)
                path.chmod(0o600)

    def test_fifo_replacement_is_refused_without_waiting_for_a_writer(self):
        with tempfile.TemporaryDirectory(prefix='epg10-activity-test-') as d:
            path = Path(d) / 'TEST_ONLY.json'; held = Path(d) / 'held.json'
            with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'), self.activity(path) as value:
                path.rename(held); os.mkfifo(path, 0o600)
                with self.assertRaisesRegex(ValueError, 'ACTIVITY_REPLACED'):
                    m.verify_activity(path, value)


if __name__=='__main__': unittest.main()
