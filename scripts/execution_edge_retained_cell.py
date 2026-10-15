#!/usr/bin/env python3
"""SGP-only disposable EPG10-01 retained replay cell, no production writes.

Deploy exact source copies of this file, observe.py and retained_probe.cjs to
one private temporary directory; run on SGP only. No image build/pull, network,
Core environment or persistent Docker volume. Raw capture is private/temporary.
"""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import threading
import time
import execution_edge_observe as obs

OWNER='codex-epg10-01-retained-cell-20261015'
PG='epg10-01-retained-pg-20261015'
DRIVER='epg10-01-retained-driver-20261015'
PG_IMAGE='sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
API_IMAGE='sha256:d13cef069471be8b34c7d6f0cda4b6df55e892812c7ea8bf0f17846256e76e6d'
LABEL='portal.measurement.owner'
STAGE='preflight'


def command(args, **kw):
    return subprocess.run(args,check=True,timeout=60,**kw)


def docker(*args, **kw):
    return command(['docker',*args],**kw)


def own_container(name):
    p=subprocess.run(['docker','inspect','--format', '{{index .Config.Labels "'+LABEL+'"}}',name],
                     stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
    if p.returncode:
        error=p.stderr.lower()
        if b'no such object:' in error or b'no such container:' in error: return False
        raise ValueError('DOCKER_INSPECTION_FAILED_NOT_PROVEN_ABSENT')
    if p.stdout.decode().strip()!=OWNER: raise ValueError('TARGET_OWNERSHIP_MISMATCH_DO_NOT_TOUCH')
    return True


def main():
    global STAGE
    os.umask(0o077)
    def interrupted(signum,frame): raise InterruptedError('CELL_WALL_OR_OPERATOR_STOP')
    signal.signal(signal.SIGALRM,interrupted); signal.signal(signal.SIGTERM,interrupted)
    signal.signal(signal.SIGINT,interrupted); signal.alarm(900)
    script=Path(__file__).with_name('execution_edge_retained_probe.cjs').read_bytes()
    results=[]; pg_samples=[]; cleanup=[]; disk_before=os.statvfs('/').f_bavail*os.statvfs('/').f_frsize
    with obs.measurement_lock(obs.LOCK,OWNER,900,'EPG10-01 bounded retained source capture + isolated replay; no production writes/restarts') as lock:
        source_image=docker('inspect','--format','{{.Image}}','portal-research-preview-control-api-1',stdout=subprocess.PIPE)
        if source_image.stdout.decode().strip()!=API_IMAGE: raise ValueError('SOURCE_IMAGE_DRIFT')
        for name in (PG,DRIVER):
            p=subprocess.run(['docker','inspect','--format','{{.Id}}',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
            if p.returncode==0: raise ValueError('TARGET_NAME_ALREADY_EXISTS_DO_NOT_TOUCH')
        for image in (PG_IMAGE,API_IMAGE):
            p=docker('image','inspect','--format','{{.Id}}',image,stdout=subprocess.PIPE)
            if p.stdout.decode().strip()!=image: raise ValueError('EXACT_LOCAL_IMAGE_REQUIRED')
        with tempfile.TemporaryDirectory(prefix='epg10-01-retained-cell-') as tmp:
            base=Path(tmp); socket=base/'socket';socket.mkdir(mode=0o777);socket.chmod(0o777)
            capture=base/'fixture.json'
            sampler=None; sampling_stop=threading.Event(); sampling_errors=[]
            try:
                STAGE='self_test'
                check=command(['docker','exec','-i','portal-research-preview-control-api-1','sh','-c',
                    'ulimit -t 10; exec node --max-old-space-size=256 - --self-test'],
                    input=script,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                results.append(json.loads(check.stdout))
                # A single source capture, never while load is running.
                STAGE='source_capture'
                with capture.open('wb') as stream:
                    try:
                        command(['docker','exec','-i','portal-research-preview-control-api-1','sh','-c',
                            'ulimit -t 10; exec node --max-old-space-size=256 - --capture'],
                            input=script,stdout=stream,stderr=subprocess.PIPE)
                    except subprocess.CalledProcessError:
                        stream.flush()
                        if capture.stat().st_size<1024:
                            error=json.loads(capture.read_bytes())
                            if error.get('status')=='FAIL' and __import__('re').fullmatch('[A-Z0-9_]{1,64}',error.get('reason','')):
                                raise ValueError('SOURCE_CAPTURE_'+error['reason'])
                        raise
                if capture.stat().st_size>32*1024**2: raise ValueError('PRIVATE_CAPTURE_BOUND')
                digest=hashlib.sha256()
                with capture.open('rb') as stream:
                    while chunk:=stream.read(1024*1024): digest.update(chunk)
                capture.chmod(0o444) # host parent0700; mounted file readable inside isolated driver only.
                STAGE='create_owned_pg'
                docker('run','--detach','--pull=never','--name',PG,'--label',LABEL+'='+OWNER,
                    '--network','none','--memory','768m','--memory-swap','768m','--cpus','.5','--pids-limit','128',
                    '--security-opt','no-new-privileges','--tmpfs','/var/lib/postgresql/data:rw,exec,mode=0700,size=512m',
                    '--tmpfs','/tmp:rw,noexec,nosuid,size=16m','--mount',f'type=bind,src={socket},dst=/var/run/postgresql',
                    '-e','POSTGRES_DB=epg10_retained_cell','-e','POSTGRES_HOST_AUTH_METHOD=trust',PG_IMAGE,
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                for _ in range(40):
                    p=subprocess.run(['docker','exec',PG,'pg_isready','-U','postgres','-d','epg10_retained_cell'],
                                     stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=3)
                    if p.returncode==0: break
                    time.sleep(.5)
                else: raise ValueError('OWN_CELL_NOT_READY')
                pg_roster=obs.inspect([PG]); pg_samples.append(obs.sample(pg_roster))
                def sampling():
                    try:
                        while not sampling_stop.wait(1):
                            obs.verify_lock(obs.LOCK,lock); pg_samples.append(obs.sample(pg_roster))
                    except Exception as exc: sampling_errors.append(type(exc).__name__)
                sampler=threading.Thread(target=sampling,daemon=True); sampler.start()
                for flags in ('--seed-cell','--isolated','--isolated'):
                    STAGE=flags.lstrip('-')
                    args=['docker','run','--rm','-i','--pull=never','--name',DRIVER,'--label',LABEL+'='+OWNER,
                        '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
                        '--memory','384m','--memory-swap','384m','--cpus','.5','--pids-limit','64',
                        '--mount',f'type=bind,src={socket},dst=/run/epg10-socket,readonly',
                        '--mount',f'type=bind,src={capture},dst=/run/epg10-fixture.json,readonly',
                        '--entrypoint','node',API_IMAGE,'--max-old-space-size=256','-',flags]
                    p=command(args,input=script,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    if len(p.stdout)>256*1024: raise ValueError('PUBLIC_RESULT_BOUND')
                    results.append(json.loads(p.stdout))
                STAGE='controlled_retained_cell_idle'
                idle_samples=[obs.sample(pg_roster)]; idle_start=time.monotonic(); health=0
                for i in range(1,11):
                    time.sleep(max(0,idle_start+i-time.monotonic()))
                    obs.verify_lock(obs.LOCK,lock)
                    p=docker('exec',PG,'psql','-U','postgres','-d','epg10_retained_cell','-Atqc','SELECT 1',stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                    if p.stdout.strip()!=b'1': raise ValueError('ISOLATED_HEALTH_FAILED')
                    health+=1; idle_samples.append(obs.sample(pg_roster))
                sampling_stop.set(); sampler.join(timeout=3)
                if sampler.is_alive() or sampling_errors: raise ValueError('ISOLATED_SAMPLING_FAILED')
                pg_samples.append(obs.sample(pg_roster)); obs.verify_lock(obs.LOCK,lock)
                if obs.inspect([PG])!=pg_roster: raise ValueError('ISOLATED_RUNTIME_CHANGED')
                result=dict(schema='epg10.isolated-retained-cell.v1',status='PASS_SCOPED_ISOLATED_RETAINED_CELL',
                    owner=OWNER,pg_image=PG_IMAGE,api_image=API_IMAGE,capture_sha256=digest.hexdigest(),
                    capture_bytes=capture.stat().st_size,results=results,network='none',published_ports=0,
                    persistent_volumes=0,core_credentials=0,source_capture_sessions=1,
                    production_writes=0,production_restarts=0,pg_metrics=obs.summarize(dict(
                        schema='epg10.passive-observation.v1',roster=pg_roster,samples=pg_samples,runtime_acceptance=False)),
                    controlled_idle=dict(health_queries=health,business_mutations=0,metrics=obs.summarize(dict(
                        schema='epg10.passive-observation.v1',roster=pg_roster,samples=idle_samples,runtime_acceptance=False))),
                    limitations=['Captured one retained profile snapshot/entity scope and narrow history, not live TS/broker truth',
                      'Unix socket/local tmpfs DB, not network latency or durable-disk/DR evidence',
                      'Repository only: no HTTP/auth/browser/shared analytics or exact P184 workloads',
                      'PG memory sampled at1Hz; not true transient peak or full capacity acceptance',
                      'Controlled idle covers owned retained PG only, not full Edge/TS/BFF W-IDLE'])
            finally:
                sampling_stop.set()
                if sampler: sampler.join(timeout=3)
                failures=[]
                for name in (DRIVER,PG):
                    try:
                        if own_container(name):
                            docker('rm','--force',name,stdout=subprocess.PIPE,stderr=subprocess.PIPE);cleanup.append(name)
                        if own_container(name): raise ValueError('OWNED_CONTAINER_STILL_PRESENT')
                    except Exception: failures.append(name)
                if failures: raise ValueError('OWNED_TEARDOWN_NOT_VERIFIED')
                # PG socket files may be owned by postgres; exact owned tempdir
                # runs as root on SGP and is removed by TemporaryDirectory only.
            result['cleanup']=dict(removed_owned_containers=cleanup,private_capture_and_tmpdir_removed_on_exit=True,
                retained_images=[PG_IMAGE,API_IMAGE],image_builds=0,image_pulls=0,volume_deletions=0)
        result['disk_available_before_bytes']=disk_before
        result['disk_available_after_bytes']=os.statvfs('/').f_bavail*os.statvfs('/').f_frsize
    signal.alarm(0)
    print(json.dumps(result,sort_keys=True))


if __name__=='__main__':
    try: main()
    except Exception as exc:
        # Never publish subprocess output, private path/config or DB messages.
        failure=dict(status='FAIL_ISOLATED_CELL',stage=STAGE,error_type=type(exc).__name__,production_writes=0)
        if isinstance(exc,ValueError) and __import__('re').fullmatch('[A-Z0-9_]{1,128}',str(exc)):
            failure['reason']=str(exc)
        if isinstance(exc,subprocess.CalledProcessError) and exc.stdout and len(exc.stdout)<1024:
            try:
                detail=json.loads(exc.stdout)
                if detail.get('status')=='FAIL' and __import__('re').fullmatch('[A-Z0-9_]{1,64}',detail.get('reason','')):
                    failure['driver_reason']=detail['reason']
            except (ValueError,TypeError): pass
        print(json.dumps(failure))
        raise SystemExit(2)
