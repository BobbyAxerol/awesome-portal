#!/usr/bin/env python3
"""Bounded passive EPG10-01 host/cgroup observer; no source calls or load.

Reads an explicit existing-container roster; never starts/restarts containers,
reads credentials or resets counters. JSON stdout is bounded private evidence.
Use --summary on a saved observation to export sanitized metrics, not raw rows.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import signal
import subprocess
import time

LOCK = Path('/home/bobby/.local/state/host-measurement-window.lock')


def docker_metadata_limits():
    # Go's virtual reservation is not RSS. Bound its two short metadata calls
    # separately; keep the collecting Python process at 128 MiB address space.
    resource.setrlimit(resource.RLIMIT_AS,(2*1024**3,2*1024**3))
    resource.setrlimit(resource.RLIMIT_CPU,(2,2))


def read(path):
    with Path(path).open('rb') as f:
        data = f.read(16385)
    if len(data) > 16384:
        raise ValueError('COUNTER_FILE_TOO_LARGE')
    return data.decode('ascii')


def counters(text):
    result = {}
    for line in text.splitlines():
        key, value = line.split()
        if key in result or not re.fullmatch(r'[0-9]+', value):
            raise ValueError('INVALID_COUNTER')
        result[key] = int(value)
    return result


def process_identity(pid):
    # comm may contain spaces/parentheses; fields after the final ') ' are fixed.
    fields = read(f'/proc/{pid}/stat').rpartition(') ')[2].split()
    start = int(fields[19])
    groups = [line[3:] for line in read(f'/proc/{pid}/cgroup').splitlines() if line.startswith('0::')]
    if len(groups) != 1 or not groups[0].startswith('/') or any(x in ('', '.', '..') for x in groups[0][1:].split('/')):
        raise ValueError('INVALID_CGROUP')
    return start, groups[0]


def inspect(names):
    if not 1 <= len(names) <= 48 or len(set(names)) != len(names):
        raise ValueError('EXPLICIT_UNIQUE_ROSTER_REQUIRED')
    if any(not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}', n) for n in names):
        raise ValueError('INVALID_CONTAINER_NAME')
    # Whitelist at Docker, never load Config.Env, mounts or arbitrary labels.
    fields = {'Name': '.Name', 'Id': '.Id', 'Image': '.Image',
              'Running': '.State.Running', 'Pid': '.State.Pid', 'RestartCount': '.RestartCount',
              'config': 'index .Config.Labels "com.docker.compose.config-hash"',
              'revision': 'index .Config.Labels "org.opencontainers.image.revision"',
              'project': 'index .Config.Labels "com.docker.compose.project"'}
    template = '{' + ','.join('"'+k+'":{{json ('+v+')}}' for k,v in fields.items()) + '}'
    data = subprocess.check_output(['docker', 'inspect', '--format', template, *names],
                                   timeout=10, preexec_fn=docker_metadata_limits)
    if len(data) > 4 * 1024 * 1024:
        raise ValueError('INSPECT_TOO_LARGE')
    result = []
    for r in (json.loads(line) for line in data.splitlines()):
        if not r['Running'] or r['Pid'] <= 0:
            raise ValueError('CONTAINER_NOT_RUNNING')
        start, group = process_identity(r['Pid'])
        result.append(dict(name=r['Name'].lstrip('/'), container_id=r['Id'], image=r['Image'],
            config_sha256=r['config'], revision=r['revision'],
            project=r['project'], pid=r['Pid'],
            restarts=r['RestartCount'], start_ticks=start, cgroup=group,
            network_namespace=os.readlink(f"/proc/{r['Pid']}/ns/net")))
    if {r['name'] for r in result} != set(names):
        raise ValueError('ROSTER_MISMATCH')
    return sorted(result, key=lambda r: r['name'])


def verify_lock(path, payload):
    if json.loads(read(path)) != payload:
        raise ValueError('LOCK_REPLACED_DO_NOT_REMOVE')
    if datetime.fromisoformat(payload['until_utc']) <= datetime.now(timezone.utc):
        raise ValueError('LOCK_EXPIRED')


@contextmanager
def measurement_lock(path, owner, seconds, purpose='EPG10-01 passive observation; no generator/source requests'):
    payload = dict(owner=owner, purpose=purpose,
                   started_utc=datetime.now(timezone.utc).isoformat(),
                   until_utc=(datetime.now(timezone.utc) + timedelta(seconds=seconds+90)).isoformat())
    # Never unlink or overwrite a foreign lock, including an expired one here.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    identity = os.fstat(fd)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(payload, f); f.flush(); os.fsync(f.fileno())
        yield payload
    finally:
        if path.exists():
            current = path.stat()
            if (current.st_dev, current.st_ino) != (identity.st_dev, identity.st_ino) or json.loads(path.read_text()) != payload:
                raise ValueError('LOCK_REPLACED_DO_NOT_REMOVE')
            path.unlink()
        else:
            raise ValueError('LOCK_DISAPPEARED')


def sample(roster):
    groups = {}
    for r in roster:
        if process_identity(r['pid']) != (r['start_ticks'], r['cgroup']):
            raise ValueError('PROCESS_IDENTITY_CHANGED')
        base = Path('/sys/fs/cgroup') / r['cgroup'][1:]
        cpu = counters(read(base/'cpu.stat'))
        mem = counters(read(base/'memory.stat'))
        events = counters(read(base/'memory.events'))
        io = {}
        for line in read(base/'io.stat').splitlines():
            device, *values = line.split()
            io[device] = {k: int(v) for k, v in (x.split('=') for x in values)}
        net = {'rx_bytes': 0, 'tx_bytes': 0}
        for line in read(f"/proc/{r['pid']}/net/dev").splitlines()[2:]:
            interface, values = line.split(':'); values = values.split()
            if interface.strip() != 'lo':
                net['rx_bytes'] += int(values[0]); net['tx_bytes'] += int(values[8])
        groups[r['name']] = dict(cpu=cpu, memory_bytes=int(read(base/'memory.current')),
            anonymous_bytes=mem['anon'], file_bytes=mem['file'], memory_events=events,
            io=io, network=net, pids=int(read(base/'pids.current')))
    meminfo = {k: int(v.strip().split()[0])*1024 for k,v in
               (line.split(':',1) for line in read('/proc/meminfo').splitlines())}
    cpu = [int(v) for v in read('/proc/stat').splitlines()[0].split()[1:9]]
    return dict(monotonic_ns=time.monotonic_ns(), utc_ns=time.time_ns(), groups=groups,
                host=dict(cpu_ticks=cpu, memory_available_bytes=meminfo['MemAvailable'],
                          load_average=os.getloadavg()))


def difference(first, last):
    if last < first:
        raise ValueError('COUNTER_RESET')
    return last-first


def summarize(doc):
    if doc['schema'] != 'epg10.passive-observation.v1' or len(doc['samples']) < 2:
        raise ValueError('FULL_OBSERVATION_REQUIRED')
    rows = doc['samples']; seconds=(rows[-1]['monotonic_ns']-rows[0]['monotonic_ns'])/1e9
    if seconds <= 0: raise ValueError('MONOTONIC_WINDOW_REQUIRED')
    for a,b in zip(rows, rows[1:]):
        if b['monotonic_ns'] <= a['monotonic_ns']:
            raise ValueError('NONMONOTONIC_SAMPLE')
        if set(a['groups']) != set(b['groups']) or set(a['groups']) != {r['name'] for r in doc['roster']}:
            raise ValueError('SAMPLE_ROSTER_CHANGED')
        for name,first in a['groups'].items():
            last=b['groups'][name]
            for kind in ('cpu','memory_events','network'):
                if set(first[kind]) != set(last[kind]): raise ValueError('COUNTER_SCHEMA_CHANGED')
                for key in first[kind]: difference(first[kind][key],last[kind][key])
            for device in set(first['io'])|set(last['io']):
                for key in ('rbytes','wbytes','rios','wios'):
                    difference(first['io'].get(device,{}).get(key,0),last['io'].get(device,{}).get(key,0))
    result = {k: v for k,v in doc.items() if k != 'samples'}
    result.update(duration_seconds=round(seconds,6), sample_count=len(rows), groups=[])
    for r in doc['roster']:
        name=r['name']; values=[s['groups'][name] for s in rows]; first,last=values[0],values[-1]
        cpu=difference(first['cpu']['usage_usec'],last['cpu']['usage_usec'])/1e6
        io={k: sum(difference(first['io'].get(d,{}).get(k,0),last['io'].get(d,{}).get(k,0))
                   for d in set(first['io'])|set(last['io'])) for k in ('rbytes','wbytes','rios','wios')}
        result['groups'].append(dict(name=name,cpu_core_seconds=round(cpu,6),average_cores=round(cpu/seconds,6),
            sampled_memory_max_bytes=max(v['memory_bytes'] for v in values),
            memory_start_bytes=first['memory_bytes'],memory_end_bytes=last['memory_bytes'],
            anonymous_max_bytes=max(v['anonymous_bytes'] for v in values),
            pids_max=max(v['pids'] for v in values), io_delta=io,
            network_delta={k:difference(first['network'][k],last['network'][k]) for k in first['network']},
            throttled_usec=difference(first['cpu']['throttled_usec'],last['cpu']['throttled_usec']),
            memory_events_delta={k:difference(first['memory_events'][k],last['memory_events'][k]) for k in first['memory_events']}))
    result['host_summary'] = dict(memory_available_min_bytes=min(s['host']['memory_available_bytes'] for s in rows),
        memory_available_max_bytes=max(s['host']['memory_available_bytes'] for s in rows),
        load_one_minute_min=min(s['host']['load_average'][0] for s in rows),
        load_one_minute_max=max(s['host']['load_average'][0] for s in rows))
    if all('cpu_ticks' in s['host'] for s in rows):
        ticks=[difference(a,b) for a,b in zip(rows[0]['host']['cpu_ticks'],rows[-1]['host']['cpu_ticks'])]
        if sum(ticks)<=0: raise ValueError('HOST_CPU_WINDOW_REQUIRED')
        result['host_summary']['cpu_busy_fraction']=round((sum(ticks)-ticks[3]-ticks[4])/sum(ticks),6)
        result['host_summary']['cpu_iowait_fraction']=round(ticks[4]/sum(ticks),6)
    result['maximum_sampling_gap_seconds']=round(max((b['monotonic_ns']-a['monotonic_ns'])/1e9 for a,b in zip(rows,rows[1:])),6)
    result['wall_vs_monotonic_drift_ms']=round(((rows[-1]['utc_ns']-rows[0]['utc_ns'])/1e9-seconds)*1000,6)
    result['limitations']=['PASS means stable observation only, not capacity/latency acceptance',
        'sampled memory maximum is not true transient peak or per-process RSS',
        'network counters are per namespace; do not sum shared namespaces',
        'no DB query/WAL/lock/allocations/business freshness counter in this observation',
        'host clocks not calibrated by local wall-vs-monotonic drift',
        'not controlled W-IDLE, B0/B1/B2 or performance G2']
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--names',nargs='+'); p.add_argument('--owner')
    p.add_argument('--seconds',type=int,default=120); p.add_argument('--summary',type=Path)
    args=p.parse_args()
    try:
        if args.summary:
            with args.summary.open('rb') as stream:
                data=stream.read(8*1024*1024+1)
            if len(data)>8*1024*1024: raise ValueError('OBSERVATION_TOO_LARGE')
            result=summarize(json.loads(data)); result['raw_sha256']=hashlib.sha256(data).hexdigest()
        else:
            if not args.owner or not 10<=args.seconds<=120: raise ValueError('BOUNDED_OWNER_WINDOW_REQUIRED')
            resource.setrlimit(resource.RLIMIT_AS,(128*1024*1024,2*1024**3))
            resource.setrlimit(resource.RLIMIT_CPU,(10,10)); os.nice(10)
            def interrupt(signum, frame):
                raise InterruptedError('OBSERVER_INTERRUPTED')
            signal.signal(signal.SIGTERM, interrupt)
            signal.signal(signal.SIGINT, interrupt)
            with measurement_lock(LOCK,args.owner,args.seconds) as lock:
                roster=inspect(args.names or [])
                begin=time.monotonic(); rows=[sample(roster)]
                for i in range(1,args.seconds+1):
                    time.sleep(max(0,begin+i-time.monotonic()))
                    verify_lock(LOCK,lock); rows.append(sample(roster))
                end=inspect(args.names)
                if roster!=end: raise ValueError('RUNTIME_CHANGED_DURING_OBSERVATION')
                verify_lock(LOCK,lock)
                result=dict(schema='epg10.passive-observation.v1',status='PASS_OBSERVATION_ONLY',
                    captured_at=datetime.now(timezone.utc).isoformat(),roster=roster,samples=rows,
                    lock=lock,observer_cpu_seconds=round(sum(resource.getrusage(resource.RUSAGE_SELF)[:2]),6),
                    observer_max_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                    host_capacity=dict(logical_cpu_count=os.cpu_count(),physical_memory_bytes=os.sysconf('SC_PHYS_PAGES')*os.sysconf('SC_PAGE_SIZE')),
                    runtime_acceptance=False,source_requests=0,runtime_changes=0)
                summarize(result)  # Reject counter resets before exporting a successful receipt.
        output=json.dumps(result,sort_keys=True)
        if len(output.encode())>8*1024*1024: raise ValueError('OBSERVATION_TOO_LARGE')
        print(output)
        return 0
    except (OSError,ValueError,KeyError,TypeError,subprocess.SubprocessError) as e:
        print(json.dumps(dict(status='BLOCKED_OR_INVALID',error=type(e).__name__+':'+str(e),runtime_acceptance=False)))
        return 2


if __name__=='__main__':
    raise SystemExit(main())
