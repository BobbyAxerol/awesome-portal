"""In-memory/fake-lock observer tests; no Docker, load or real business data."""
from copy import deepcopy
import json
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
            with m.measurement_lock(path,'TEST_ONLY',10): self.assertTrue(path.exists())
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


if __name__=='__main__': unittest.main()
