#!/usr/bin/env python3
"""SGP disposable native TS qualification; no production/source requests.

Input is a private temporary directory containing exact git-archived TS source,
this runner, the Edge test extension and execution_edge_observe.py. Stdout is a
bounded sanitized receipt. Compiler logs and synthetic rows stay private there.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
import execution_edge_observe as obs

OWNER = 'codex-epg10-03-native-20261016'
PG = 'epg10-03-native-pg-20261016'
IMAGE = 'sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
LABEL = 'portal.measurement.owner'
TOOLCHAIN = '/home/bobby/.rustup/toolchains/1.85.1-x86_64-unknown-linux-gnu/bin'
SAFETY_TEST_COUNT = 16
MIGRATIONS = ['48-v2-source-change-journal.sql', '58-v2-semantic-journal-coverage.sql',
              '59-v2-source-commit-order-replay.sql', '60-v2-source-journal-paper-reader.sql',
              '67-v2-p16-consumer-publication-controls.sql']


def command(args, **kw):
    return subprocess.run(args, check=True, timeout=kw.pop('timeout', 30), **kw)


def docker(*args, **kw):
    return command(['sudo', '-n', 'docker', *args], **kw)


def free_bytes():
    stat = os.statvfs('/')
    return stat.f_bavail * stat.f_frsize


def remove_owned_pg():
    result = subprocess.run(['sudo','-n','docker','inspect','--format',
        '{{.Id}}|{{index .Config.Labels "'+LABEL+'"}}',PG],
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10)
    if result.returncode:
        if b'no such' in result.stderr.lower():
            return False
        raise ValueError('CLEANUP_TARGET_NOT_PROVEN_ABSENT')
    container_id, owner = result.stdout.decode().strip().split('|')
    if owner != OWNER or not re.fullmatch('[0-9a-f]{64}',container_id):
        raise ValueError('OWNERSHIP_CHANGED_DO_NOT_REMOVE')
    # Address immutable identity, not a name which could have been replaced.
    docker('rm','--force',container_id,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    return True


def no_foreign_cpu_job():
    # Not a claim that normal services are idle; exclude active developer jobs.
    rows = command(['ps', '-eo', 'comm=,args='], stdout=subprocess.PIPE).stdout.decode().splitlines()
    patterns = ('rustc ', 'cargo test', 'cargo build', 'pytest', 'p184_n1_capacity_run', 'read-load.mjs')
    if any(any(p in row for p in patterns) for row in rows if 'run.py' not in row):
        raise RuntimeError('FOREIGN_JOB_ACTIVE_MEASUREMENT_NOT_STARTED')


def finish_cleanup(receipt, create_attempted, lock_context, base):
    """Always attempt both owned cleanups and retain the original failure."""
    removed = False
    errors = []
    try:
        if create_attempted:
            removed = remove_owned_pg()
    except Exception as exc:
        errors.append(dict(stage='container_cleanup', error_type=type(exc).__name__))
    finally:
        try:
            if lock_context is not None:
                lock_context.__exit__(None, None, None)
        except Exception as exc:
            errors.append(dict(stage='lock_release', error_type=type(exc).__name__))
    try:
        receipt['disk_after_container'] = free_bytes()
    except Exception as exc:
        errors.append(dict(stage='disk_observation', error_type=type(exc).__name__))
    receipt['cleanup'] = dict(owned_container_removed=removed, images_built=0,
        images_pulled=0, volumes_created=0, volumes_removed=0,
        private_build_dir_pending_removal=str(base), errors=errors)
    if errors:
        receipt['status'] = 'FAIL'
        receipt.setdefault('failed_stage', errors[0]['stage'])
        receipt.setdefault('error_type', errors[0]['error_type'])


def main():
    os.umask(0o077)
    base = Path(__file__).resolve().parent
    if not re.fullmatch(r'/tmp/epg10-03-[A-Za-z0-9_.-]+', str(base)):
        raise ValueError('PRIVATE_DISPOSABLE_PATH_REQUIRED')
    source = base / 'ts'
    extension = base / 'capture.rs'
    original = source / 'rust/crates/trading-runtime/tests/p13_logical_replication.rs'
    target = original.with_name('epg10_03_capture.rs')
    if target.exists() and not target.read_bytes().startswith(original.read_bytes()+b'\n'):
        raise ValueError('GENERATED_TEST_OWNERSHIP_MISMATCH')
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(InterruptedError('QUALIFICATION_STOP')))
    signal.alarm(1500)
    revision = os.environ['EPG10_TS_REVISION']
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise ValueError('EXACT_SOURCE_REVISION_REQUIRED')
    receipt = dict(schema='epg10.capture-proof.v1', provenance='TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL',
                   source_revision=revision,
                   pg_image=IMAGE, runtime_activation=False, disk_before=free_bytes(),
                   performance_acceptance=False, tainted_for_capacity=True)
    created = False
    create_attempted = False
    lock_context = None
    lock_acquired = False
    stage = 'preflight'
    started = time.monotonic()
    try:
        activity_path = obs.ACTIVITY_DIR / (OWNER + '.json')
        lock_context = obs.correctness_activity(activity_path, owner=OWNER, seconds=1500,
            purpose='EPG10-03 isolated native Rust/PG correctness; no HK requests; not capacity', cpu_cap=1.5)
        activity = lock_context.__enter__()
        lock_acquired = True
        receipt['correctness_activity'] = activity
        if activity:
            assert free_bytes() > 100*1024**3, 'DISK_HEADROOM'
            absent = subprocess.run(['sudo','-n','docker','inspect',PG], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            if absent.returncode == 0 or b'no such' not in absent.stderr.lower():
                raise ValueError('TARGET_NOT_PROVEN_ABSENT')
            actual = docker('image','inspect','--format','{{.Id}}',IMAGE,stdout=subprocess.PIPE).stdout.decode().strip()
            assert actual == IMAGE
            # Build artifact only: exact old test + owned extension, no TS edit.
            target.write_bytes(original.read_bytes()+b'\n'+extension.read_bytes())
            pin_paths = ['rust/Cargo.toml','rust/Cargo.lock',
                'rust/crates/trading-core/src/error.rs','rust/crates/trading-core/src/canonical.rs',
                'rust/crates/trading-core/src/source_journal.rs','rust/crates/trading-core/src/source_journal_replay.rs',
                'rust/crates/trading-runtime/src/logical_replication.rs','rust/crates/trading-runtime/src/publication.rs',
                'rust/crates/trading-runtime/tests/p13_logical_replication.rs',
                'rust/crates/trading-runtime/tests/support/p13_publication_snapshot.rs']
            pin_paths += ['init-db/'+name for name in MIGRATIONS]
            receipt['input_hashes']={name:hashlib.sha256((source/name).read_bytes()).hexdigest() for name in pin_paths}
            receipt['generated_test_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
            receipt['extension_sha256']=hashlib.sha256(extension.read_bytes()).hexdigest()
            env=os.environ.copy()
            env.update(PATH=TOOLCHAIN+':'+env['PATH'], CARGO_HOME=str(base/'cargo'),
                       CARGO_TARGET_DIR=str(base/'target'), CARGO_BUILD_JOBS='1')
            core = min(os.sched_getaffinity(0))
            cargo = ['nice', '-n', '15', 'taskset', '--cpu-list', str(core), 'cargo']
            receipt['resources'] = dict(cargo_cpu_affinity=[core], cargo_jobs=1,
                cargo_nice=15, pg_cpu_limit=0.5, pg_memory_limit_bytes=512*1024**2)
            stage='runner_safety_tests'
            with (base/'safety.log').open('wb') as log:
                command([sys.executable,'-B','-m','unittest','-v','test_run'],cwd=base,
                        env=env,stdout=log,stderr=log)
            safety=(base/'safety.log').read_text()
            assert f'Ran {SAFETY_TEST_COUNT} tests' in safety and safety.rstrip().endswith('OK')
            receipt['runner_safety_tests']=dict(passed=SAFETY_TEST_COUNT,failed=0,skipped=0)
            stage='rustfmt'
            command([TOOLCHAIN+'/rustfmt','--check','--edition','2021',str(extension)],
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            stage='compile'
            with (base/'compile.log').open('wb') as log:
                build=command(cargo+['test','--locked','-p','trading-runtime',
                    '--test','epg10_03_capture','--no-run'],cwd=source/'rust',env=env,stdout=log,stderr=log,timeout=900)
            stage='clippy'
            with (base/'clippy.log').open('wb') as log:
                command(cargo+['clippy','--offline','--locked','-p','trading-runtime',
                    '--test','epg10_03_capture','--message-format=json'],cwd=source/'rust',env=env,
                    stdout=log,stderr=log,timeout=240)
            upstream_warnings=0
            own_warnings=[]
            for line in (base/'clippy.log').read_text().splitlines():
                if not line.startswith('{'): continue
                message=json.loads(line).get('message',{})
                if not isinstance(message,dict) or message.get('level')!='warning': continue
                owned=any(s.get('is_primary') and s['file_name'].endswith('/epg10_03_capture.rs')
                    and s['line_start']>len(original.read_text().splitlines())+1 for s in message.get('spans',[]))
                if owned: own_warnings.append(message.get('code',{}).get('code','warning'))
                else: upstream_warnings+=1
            assert not own_warnings, 'OWNED_EXTENSION_CLIPPY_WARNINGS:'+str(own_warnings)
            receipt.update(rustfmt='PASS',clippy=dict(owned_extension_warnings=0,
                upstream_advisory_warnings=upstream_warnings,
                status='OWNED_EXTENSION_PASS_NOT_UPSTREAM_LINT_CERTIFICATION'))
            obs.verify_activity(activity_path, activity)
            stage='create_owned_pg'
            create_attempted=True
            docker('run','--detach','--rm','--pull=never','--name',PG,'--label',LABEL+'='+OWNER,
                   '--publish','127.0.0.1::5432','--memory','512m','--memory-swap','512m',
                   '--cpus','.5','--pids-limit','128','--security-opt','no-new-privileges',
                   '--tmpfs','/var/lib/postgresql/data:rw,exec,mode=0700,size=512m',
                   '-e','POSTGRES_DB=epg10_capture','-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE,
                   '-c','wal_level=logical','-c','max_replication_slots=8','-c','max_wal_senders=8',
                   '-c','max_connections=24','-c','shared_buffers=16MB','-c','max_wal_size=64MB',
                   '-c','max_slot_wal_keep_size=64MB',stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            created=True
            for _ in range(60):
                # Entrypoint's temporary initialization server has only a Unix
                # socket. Wait for final TCP server, not a transient readiness.
                ready=subprocess.run(['sudo','-n','docker','exec',PG,'pg_isready','-h','127.0.0.1','-U','postgres','-d','epg10_capture'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                if ready.returncode==0: break
                time.sleep(.25)
            else: raise ValueError('PG_NOT_READY')
            port=docker('port',PG,'5432/tcp',stdout=subprocess.PIPE).stdout.decode().strip()
            assert re.fullmatch(r'127\.0\.0\.1:[0-9]+',port)
            env.update(P13_LOGICAL_REQUIRED='YES',P13_LOGICAL_ENDPOINT=port,
                       P13_LOGICAL_DATABASE='epg10_capture',P13_LOGICAL_USER='postgres',
                       P13_LOGICAL_POSTGRES_DSN='host=127.0.0.1 port='+port.split(':')[1]+' user=postgres dbname=epg10_capture',
                       TMPDIR=str(base))
            stage='migrate'
            for migration in MIGRATIONS:
                stage='migrate:'+migration
                sql=(source/'init-db'/migration).read_bytes()
                with (base/'migrate.log').open('ab') as log:
                    docker('exec','-i',PG,'psql','-X','-U','postgres','-d','epg10_capture',
                           '-v','ON_ERROR_STOP=1','-1',input=sql,stdout=log,stderr=log)
            stage='native_tests'
            with (base/'tests.log').open('wb') as log:
                command(cargo+['test','--offline','--locked','-p','trading-runtime',
                         '--test','epg10_03_capture','--','--nocapture','--test-threads=1'],
                        cwd=source/'rust',env=env,stdout=log,stderr=log,timeout=240)
            logs=(base/'tests.log').read_text()
            facts=[]
            for line in logs.splitlines():
                if 'EPG10_RESULT=' in line:
                    facts.append(json.loads(line.split('EPG10_RESULT=',1)[1]))
            assert len(facts)==4, 'EXPECTED_FOUR_OWNED_NATIVE_RECEIPTS'
            count=re.findall(r'test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored;.*?(\d+) filtered out',logs)
            assert count==[('6','0','0','0')], 'ALL_SIX_NATIVE_TESTS_REQUIRED'
            receipt.update(status='PASS_SCOPED_PROOF_WITH_PRODUCER_FENCE_GAP', facts=facts,
                           rust_tests=dict(passed=6,failed=0,ignored=0,filtered_out=0))
            receipt['pg_version']=docker('exec',PG,'psql','-X','-U','postgres','-d','epg10_capture','-Atqc','SHOW server_version',stdout=subprocess.PIPE).stdout.decode().strip()
            receipt['slots_after_tests']=int(docker('exec',PG,'psql','-X','-U','postgres','-d','epg10_capture','-Atqc','SELECT count(*) FROM pg_replication_slots',stdout=subprocess.PIPE).stdout)
            obs.verify_activity(activity_path, activity)
    except Exception as exc:
        receipt.update(status='FAIL',failed_stage=stage,error_type=type(exc).__name__)
        # Logs stay private; operator can inspect bounded exact failures.
    finally:
        finish_cleanup(receipt, create_attempted,
                       lock_context if lock_acquired else None, base)
        receipt['elapsed_seconds'] = round(time.monotonic()-started,3)
    (base/'receipt.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
    print(json.dumps({k:v for k,v in receipt.items() if k!='input_hashes'},sort_keys=True))
    return 0 if receipt['status'].startswith('PASS_') else 1


if __name__=='__main__':
    raise SystemExit(main())
