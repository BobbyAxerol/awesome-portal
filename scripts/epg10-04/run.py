#!/usr/bin/env python3
"""One isolated SGP Rust/PG correctness run; never performance acceptance.

Private input: /tmp/epg10-{04,05}-*/{source/,run.py,test_run.py,
execution_edge_observe.py,epg03_run.py}. For04 source/ is the exact Rust
workspace; for05 it preserves services/portal-execution-edge-rs plus the exact
shared packages/contracts/fixtures/keyset-page.valid.json monorepo layout.
EPG10_TEST_PROFILE is explicitly 04 or 05 (default04). Root supplies
EPG10_PORTAL_REVISION, EPG10_EXPECT_BOOTSTRAP_TESTS and, for05,
EPG10_EXPECT_READ_TESTS. Only an
explicit EPG10_ALLOW_DEPENDENCY_FETCH=1 permits the first locked compile to fetch;
every subsequent Cargo command is offline. No production/source credentials are
inherited. Logs/rows/ephemeral DB credentials remain private, never stdout.
"""
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import subprocess
import sys
import threading
import time

IMAGE = 'sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'
LABEL = 'portal.measurement.owner'
TOOLCHAIN = '/home/bobby/.rustup/toolchains/1.85.1-x86_64-unknown-linux-gnu/bin'
MAX_LOG_BYTES = 8 * 1024 * 1024
LOCK_SECONDS = 1500
RUST_WORKSPACE = 'services/portal-execution-edge-rs'
SHARED_FIXTURE = 'packages/contracts/fixtures/keyset-page.valid.json'
MAX_SHARED_FIXTURE_BYTES = 64 * 1024
OWNED_RUST = (
    'crates/authoritative-event-core/src/bootstrap.rs',
    'crates/authoritative-event-core/src/bootstrap/tests.rs',
    'crates/projection-store-pg/src/bootstrap.rs',
    'crates/projection-store-pg/tests/epg10_04_bootstrap.rs',
    'crates/projection-store-pg/tests/epg10_04_bootstrap/edge_cases.rs',
)
SCOPED_OWNED_RUST = (
    'crates/query-api/src/scoped.rs',
    'crates/realtime-sse/src/scoped.rs',
    'crates/projection-store-pg/src/scoped_read.rs',
    'crates/projection-store-pg/tests/epg10_05_scoped_read.rs',
)


def test_profile(profile=None):
    value = os.environ.get('EPG10_TEST_PROFILE', '04') if profile is None else profile
    if value not in ('04', '05'):
        raise ValueError('EXPLICIT_TEST_PROFILE_04_OR_05_REQUIRED')
    return value


def owned_rust(profile=None):
    return OWNED_RUST + (SCOPED_OWNED_RUST if test_profile(profile) == '05' else ())


def package_arguments(profile=None):
    packages = ['authoritative-event-core', 'projection-store-pg']
    if test_profile(profile) == '05':
        packages = ['query-api', 'realtime-sse', *packages]
    return [argument for package in packages for argument in ('-p', package)]


def expected_test_count(value, kind):
    if kind not in ('BOOTSTRAP', 'READ'):
        raise ValueError('EXPLICIT_TEST_COUNT_KIND_REQUIRED')
    if not isinstance(value, str) or not re.fullmatch('[1-9][0-9]{0,2}', value) or int(value) > 128:
        raise ValueError('EXACT_BOUNDED_' + kind + '_TEST_COUNT_REQUIRED')
    return int(value)


def load_cleanup_helpers(base, profile=None):
    """Reuse the accepted 03 cleanup without editing it or sharing its target."""
    profile = test_profile(profile)
    helper = base / 'epg03_run.py'
    observer_dir = base
    if not helper.exists():
        helper = Path(__file__).resolve().parent.parent / 'epg10-03/run.py'
        observer_dir = helper.parent.parent
    sys.path.insert(0, str(observer_dir))
    spec = importlib.util.spec_from_file_location('epg10_' + profile + '_cleanup_helpers', helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suffix = hashlib.sha256(str(base).encode()).hexdigest()[:12]
    module.OWNER = 'codex-epg10-' + profile + '-' + suffix
    module.PG = 'epg10-' + profile + '-pg-' + suffix
    return module


def validate_base(base, profile=None):
    profile = test_profile(profile)
    if (not re.fullmatch(r'/tmp/epg10-' + profile + r'-[A-Za-z0-9_.-]+', str(base))
            or base.is_symlink() or base.resolve() != base):
        raise ValueError('PRIVATE_DISPOSABLE_PATH_REQUIRED')
    stat = base.stat()
    if stat.st_uid != os.getuid() or stat.st_mode & 0o077:
        raise ValueError('PRIVATE_OWNED_DIRECTORY_REQUIRED')


def workspace_directory(source, profile=None):
    """Preserve shared compile-time paths inside the exact private source root."""
    profile = test_profile(profile)
    if source.is_symlink() or not source.is_dir():
        raise ValueError('EXACT_SOURCE_DIRECTORY_REQUIRED')
    if profile == '04':
        return source
    current = source
    for part in Path(RUST_WORKSPACE).parts:
        current /= part
        if current.is_symlink():
            raise ValueError('SOURCE_SYMLINK_NOT_ALLOWED')
        if not current.is_dir():
            raise ValueError('EXACT_OWNED_INPUT_MISSING')
    return current


def source_hashes(source, profile=None):
    profile = test_profile(profile)
    workspace_directory(source, profile)
    hashes = {}
    total = 0
    for path in sorted(source.rglob('*')):
        relative = path.relative_to(source)
        if any(part in ('target', '.git', 'cargo') for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError('SOURCE_SYMLINK_NOT_ALLOWED')
        if path.is_file():
            if path.name == '.env' or (path.name.startswith('.env.')
                    and path.name not in ('.env.example', '.env.sample', '.env.template')):
                raise ValueError('PRIVATE_CONFIG_NOT_SOURCE_INPUT')
            size = path.stat().st_size
            if profile == '05' and relative.as_posix() == SHARED_FIXTURE:
                if not 0 < size <= MAX_SHARED_FIXTURE_BYTES:
                    raise ValueError('BOUNDED_SHARED_FIXTURE_REQUIRED')
            total += size
            if len(hashes) >= 10000 or total > 128 * 1024 * 1024:
                raise ValueError('SOURCE_INPUT_BOUNDS')
            hashes[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    required = ('Cargo.toml', 'Cargo.lock', *owned_rust(profile),
                'crates/projection-store-pg/migrations/0019_scoped_bootstrap.sql')
    if profile == '05':
        required += ('crates/projection-store-pg/migrations/0020_scoped_read.sql',)
        required = tuple(RUST_WORKSPACE + '/' + path for path in required) + (SHARED_FIXTURE,)
    if any(path not in hashes for path in required):
        raise ValueError('EXACT_OWNED_INPUT_MISSING')
    return hashes


def isolated_environment(base):
    # Do not leak inherited TS/Portal/Core/database/service configuration into
    # tests. HOME remains unchanged solely for standard toolchain lookup.
    env = {key: os.environ[key] for key in ('HOME', 'LANG', 'LC_ALL', 'TZ')
           if key in os.environ}
    env.update(PATH=TOOLCHAIN + ':/usr/local/bin:/usr/bin:/bin',
               CARGO_HOME=str(base / 'cargo'), CARGO_TARGET_DIR=str(base / 'target'),
               CARGO_BUILD_JOBS='1', TMPDIR=str(base), CARGO_NET_OFFLINE='true',
               PYTHONDONTWRITEBYTECODE='1')
    return env


def stop_process_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=2)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait(timeout=2)


def run_logged(args, log_path, *, cwd, env, timeout, check=True):
    """Drain a child into one bounded private log; kill its group on failure."""
    started = time.monotonic()
    process = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, start_new_session=True)
    total = 0
    try:
        with log_path.open('wb') as log, selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = timeout - (time.monotonic() - started)
                if remaining <= 0:
                    raise subprocess.TimeoutExpired(args, timeout)
                for key, _ in selector.select(min(remaining, 0.25)):
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(chunk)
                    if total > MAX_LOG_BYTES:
                        raise ValueError('PRIVATE_LOG_BOUND_EXCEEDED')
                    log.write(chunk)
        code = process.wait(timeout=max(0.1, timeout - (time.monotonic() - started)))
        if check and code:
            raise subprocess.CalledProcessError(code, args)
        return dict(returncode=code, elapsed_seconds=round(time.monotonic() - started, 3),
                    private_log_bytes=total)
    except BaseException:
        stop_process_group(process)
        raise
    finally:
        process.stdout.close()


def parse_rust_results(text, expected_summaries, expected_passed=None, count_kind='BOOTSTRAP'):
    rows = re.findall(r'test result: ok\. (\d+) passed; (\d+) failed; '
                      r'(\d+) ignored; (\d+) measured; (\d+) filtered out', text)
    if (len(rows) != expected_summaries or any(int(value) for row in rows for value in row[1:])
            or any(int(row[0]) == 0 for row in rows)):
        raise ValueError('ALL_REQUIRED_RUST_TESTS_MUST_RUN_AND_PASS')
    passed = sum(int(row[0]) for row in rows)
    if expected_passed is not None and passed != expected_passed:
        raise ValueError('EXACT_' + count_kind + '_TEST_COUNT_REQUIRED')
    return dict(passed=passed, failed=0, ignored=0, measured=0, filtered_out=0,
                test_binaries=len(rows), passed_per_binary=[int(row[0]) for row in rows])


def parse_safety_results(text):
    count = re.findall(r'Ran (\d+) tests? in ', text)
    if len(count) != 1 or int(count[0]) == 0 or not text.rstrip().endswith('OK'):
        raise ValueError('RUNNER_SAFETY_TESTS_REQUIRED')
    return dict(passed=int(count[0]), failed=0, skipped=0)


def clippy_findings(text, profile=None):
    paths = owned_rust(profile)
    owned, upstream = [], 0
    for line in text.splitlines():
        if not line.startswith('{'):
            continue
        value = json.loads(line)
        message = value.get('message', {})
        if not isinstance(message, dict) or message.get('level') != 'warning':
            continue
        if any(span.get('is_primary') and any(span.get('file_name', '').endswith(path)
               for path in paths) for span in message.get('spans', [])):
            owned.append((message.get('code') or {}).get('code', 'warning'))
        else:
            upstream += 1
    return dict(owned_warnings=owned, upstream_advisory_warnings=upstream)


def peer_test_metadata(helper):
    rows = helper.docker('ps', '--format', '{{.ID}} {{.Names}}',
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().splitlines()
    return sorted(row for row in rows if any(marker in row for marker in
                  ('elp204', 'epg10-', 'benchmark')) and helper.PG not in row)


def require_absent(helper):
    result = subprocess.run(['sudo', '-n', 'docker', 'inspect', helper.PG],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=10)
    if result.returncode == 0 or b'no such' not in result.stderr.lower():
        raise ValueError('TARGET_NOT_PROVEN_ABSENT')


class OwnPgSampler:
    """Bounded1Hz observer of exactly the owned test PG; no source requests."""
    def __init__(self, helper, maximum_samples=1500):
        if not isinstance(maximum_samples, int) or not 2 <= maximum_samples <= 1500:
            raise ValueError('BOUNDED_SAMPLER_REQUIRED')
        self.helper, self.maximum_samples = helper, maximum_samples
        self.rows, self.roster = [], []
        self.error_type = None
        self.rss_sum_max_bytes = 0
        self.bound_reached = False
        self.event, self.thread = threading.Event(), None

    def start(self):
        fmt = ('{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},'
               '"running":{{json .State.Running}},"pid":{{.State.Pid}},'
               '"restarts":{{.RestartCount}},"owner":'
               '{{json (index .Config.Labels "' + LABEL + '")}}}')
        result = self.helper.docker('inspect', '--format', fmt, self.helper.PG,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
        if len(result) > 4096:
            raise ValueError('ONE_OWNED_PG_METADATA_REQUIRED')
        value = json.loads(result)
        if (value['name'] != '/' + self.helper.PG or value['owner'] != self.helper.OWNER
                or value['image'] != IMAGE or not value['running'] or value['pid'] <= 0
                or not re.fullmatch('[0-9a-f]{64}', value['id'])):
            raise ValueError('OWNED_PG_IDENTITY_REQUIRED')
        start, group = self.helper.obs.process_identity(value['pid'])
        self.roster = [dict(name=self.helper.PG, container_id=value['id'], image=value['image'],
                           pid=value['pid'], start_ticks=start, cgroup=group,
                           restarts=value['restarts'])]
        self.capture()
        self.thread = threading.Thread(target=self.poll, daemon=True, name=self.helper.PG + '-observer')
        self.thread.start()

    def process_rss_sum(self):
        group = self.roster[0]['cgroup']
        procs = self.helper.obs.read('/sys/fs/cgroup' + group + '/cgroup.procs').split()
        if len(procs) > 128 or any(not re.fullmatch('[1-9][0-9]*', pid) for pid in procs):
            raise ValueError('OWNED_PG_PROCESS_BOUND_EXCEEDED')
        total = 0
        for pid in procs:
            try:
                if self.helper.obs.process_identity(int(pid))[1] != group:
                    continue
                status = self.helper.obs.read('/proc/' + pid + '/status')
            except (FileNotFoundError, ProcessLookupError):
                continue  # A short-lived owned backend exited during sampling.
            match = re.search(r'^VmRSS:\s+([0-9]+) kB$', status, re.MULTILINE)
            if match:
                total += int(match[1]) * 1024
        return total

    def capture(self):
        if len(self.rows) >= self.maximum_samples:
            self.bound_reached = True
            return False
        row = self.helper.obs.sample(self.roster)
        self.rss_sum_max_bytes = max(self.rss_sum_max_bytes, self.process_rss_sum())
        self.rows.append(row)
        return True

    def poll(self):
        while not self.event.wait(1.0):
            try:
                if not self.capture():
                    return
            except Exception as exc:
                self.error_type = type(exc).__name__
                self.event.set()
                return

    def stop(self):
        self.event.set()
        if self.thread is not None:
            self.thread.join(timeout=5)
            if self.thread.is_alive():
                raise RuntimeError('PG_OBSERVER_DID_NOT_STOP')
        if not self.error_type and len(self.rows) < self.maximum_samples and self.roster:
            try:
                self.capture()
            except Exception as exc:
                self.error_type = type(exc).__name__
        if self.error_type or self.bound_reached or len(self.rows) < 2:
            raise ValueError('PG_OBSERVATION_INCOMPLETE')
        summary = self.helper.obs.summarize(dict(schema='epg10.passive-observation.v1',
            roster=self.roster, samples=self.rows))
        return dict(status='PASS_OBSERVATION_ONLY', tainted_for_capacity=True,
            interval_seconds=1, maximum_samples=self.maximum_samples, sample_count=len(self.rows),
            duration_seconds_observational=summary['duration_seconds'],
            maximum_sampling_gap_seconds=summary['maximum_sampling_gap_seconds'],
            postgresql=summary['groups'][0],
            process_rss_sum_sampled_max_bytes=self.rss_sum_max_bytes,
            limitations=['SHARED_HOST_NOT_CAPACITY_OR_PERFORMANCE_ACCEPTANCE',
                'SAMPLED_MAXIMUM_NOT_INSTANTANEOUS_PEAK',
                'PROCESS_RSS_SUM_CAN_DOUBLE_COUNT_SHARED_PAGES',
                'ONLY_TEST_POSTGRESQL_CGROUP_NOT_CARGO_WORKER_RESOURCES'])


def owned_db_counts(helper, container_id):
    """Fixed readonly metadata query; only the immutable disposable PG target."""
    if not re.fullmatch('[0-9a-f]{64}', container_id):
        raise ValueError('IMMUTABLE_OWNED_PG_ID_REQUIRED')
    sql = """BEGIN READ ONLY; SET LOCAL statement_timeout='2s';
SELECT json_build_object(
 'database',current_database(),
 'generations',(SELECT count(*) FROM portal_projection.bootstrap_generations),
 'dataset_checkpoints',(SELECT count(*) FROM portal_projection.bootstrap_datasets),
 'current_rows',(SELECT count(*) FROM portal_projection.bootstrap_rows),
 'visible_current_rows',(SELECT count(*) FROM portal_projection.bootstrap_rows WHERE NOT tombstoned),
 'tombstoned_current_rows',(SELECT count(*) FROM portal_projection.bootstrap_rows WHERE tombstoned),
 'immutable_facts',(SELECT count(*) FROM portal_projection.bootstrap_facts),
 'committed_groups',(SELECT count(*) FROM portal_projection.bootstrap_inputs WHERE kind='GROUP'),
 'pending_chunks',(SELECT count(*) FROM portal_projection.bootstrap_inputs WHERE kind='CHUNK'),
 'database_size_bytes',pg_database_size(current_database())); COMMIT;"""
    started = time.monotonic()
    raw = helper.docker('exec', container_id, 'psql', '-X', '-qAt', '-U', 'postgres',
        '-d', 'portal_projection_test_epg10_04', '-v', 'ON_ERROR_STOP=1', '-c', sql,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
    if len(raw) > 4096:
        raise ValueError('BOUNDED_TEST_DB_METADATA_REQUIRED')
    value = json.loads(raw)
    expected = {'database', 'generations', 'dataset_checkpoints', 'current_rows',
        'visible_current_rows', 'tombstoned_current_rows', 'immutable_facts',
        'committed_groups', 'pending_chunks', 'database_size_bytes'}
    if (set(value) != expected or value['database'] != 'portal_projection_test_epg10_04'
            or any(type(number) is not int or number < 0
                   for key, number in value.items() if key != 'database')
            or value['current_rows'] != value['visible_current_rows'] + value['tombstoned_current_rows']):
        raise ValueError('EXACT_TEST_DB_COUNTS_REQUIRED')
    return dict(basis='POST_SUITE_REMAINING_TEST_STATE_NOT_TOTAL_LIFECYCLE_FACTS',
        values=value, query_seconds_observational=round(time.monotonic() - started, 6),
        tainted_for_capacity=True)


def finish_observation_and_cleanup(receipt, sampler, helper, attempted, lock_context, base):
    """Stop observation first; neither observation failure nor cleanup skips release."""
    stopped = sampler is None
    try:
        if sampler is not None:
            receipt['postgresql_observation'] = sampler.stop()
            stopped = True
    except Exception as exc:
        stopped = sampler.thread is None or not sampler.thread.is_alive()
        receipt['postgresql_observation'] = dict(status='FAIL',
            error_type=sampler.error_type or type(exc).__name__, sample_count=len(sampler.rows),
            sample_bound_reached=sampler.bound_reached, tainted_for_capacity=True)
        receipt['status'] = 'FAIL'
        receipt.setdefault('failed_stage', 'postgresql_observation')
        receipt.setdefault('error_type', type(exc).__name__)
    finally:
        helper.finish_cleanup(receipt, attempted, lock_context, base)
        receipt['cleanup']['resource_sampler_stopped_before_container_cleanup'] = stopped


def main():
    os.umask(0o077)
    base = Path(__file__).absolute().parent
    profile = test_profile()
    validate_base(base, profile)
    helper = load_cleanup_helpers(base, profile)
    source_root = base / 'source'
    receipt = dict(schema=('epg10.bootstrap-correctness.v1' if profile == '04'
                          else 'epg10.scoped-read-correctness.v1'), test_profile=profile, status='FAIL',
                   at_utc=datetime.now(timezone.utc).isoformat(),
                   provenance='TEST_ONLY_SYNTHETIC_REAL_POSTGRESQL', runtime_activation=False,
                   production_mutations=0, source_requests=0, pg_image=IMAGE,
                   performance_acceptance=False, tainted_for_capacity=True,
                   limitation='CORRECTNESS_ONLY_SHARED_HOST_NOT_CAPACITY_OR_PRODUCTION_PROOF',
                   disk_before=helper.free_bytes(), stages={})
    lock_context, lock_acquired, create_attempted = None, False, False
    sampler = None
    started = time.monotonic()
    stage = 'preflight'
    def interrupt(*_):
        raise InterruptedError('QUALIFICATION_STOP')
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
        signal.signal(sig, interrupt)
    signal.alarm(LOCK_SECONDS - 30)
    try:
        revision = os.environ['EPG10_PORTAL_REVISION']
        expected = expected_test_count(os.environ['EPG10_EXPECT_BOOTSTRAP_TESTS'], 'BOOTSTRAP')
        expected_read = (expected_test_count(os.environ.get('EPG10_EXPECT_READ_TESTS'), 'READ')
                         if profile == '05' else None)
        if not re.fullmatch('[0-9a-f]{40}', revision):
            raise ValueError('EXACT_SOURCE_REVISION_REQUIRED')
        receipt['source_revision'] = revision
        receipt['expected_bootstrap_tests'] = expected
        if expected_read is not None:
            receipt['expected_read_tests'] = expected_read
        # Existing observer helper reserves 90s itself; pass1410 for an exact
        # 1500s lease, with a separate30s local cleanup reserve.
        lock_context = helper.obs.measurement_lock(helper.obs.LOCK, helper.OWNER,
            LOCK_SECONDS - 90, 'EPG10-' + profile + ' isolated SGP correctness only; no HK/source requests; not capacity')
        lock = lock_context.__enter__()
        lock_acquired = True
        receipt['lock_window_seconds'] = LOCK_SECONDS
        receipt['foreign_test_metadata_before'] = peer_test_metadata(helper)
        if helper.free_bytes() < 100 * 1024**3:
            raise ValueError('DISK_HEADROOM_REQUIRED')
        require_absent(helper)
        actual = helper.docker('image', 'inspect', '--format', '{{.Id}}', IMAGE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()
        if actual != IMAGE:
            raise ValueError('EXACT_CACHED_PG_IMAGE_REQUIRED')
        receipt['input_hashes'] = source_hashes(source_root, profile)
        source = workspace_directory(source_root, profile)
        receipt['source_workspace_relative'] = source.relative_to(source_root).as_posix()
        receipt['input_manifest_sha256'] = hashlib.sha256(json.dumps(
            receipt['input_hashes'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        receipt['runner_hashes'] = {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
            for name in ('run.py', 'test_run.py', 'epg03_run.py', 'execution_edge_observe.py')}
        core = min(os.sched_getaffinity(0))
        prefix = ['nice', '-n', '15', 'taskset', '--cpu-list', str(core)]
        receipt['resources'] = dict(cargo_jobs=1, cargo_cpu_affinity=[core], cargo_nice=15,
            pg_cpu_limit=0.5, pg_memory_limit_bytes=768*1024**2,
            pg_tmpfs_limit_bytes=512*1024**2, pg_pids_limit=128, pg_max_connections=24,
            private_log_limit_bytes_per_stage=MAX_LOG_BYTES)
        env = isolated_environment(base)
        def logged(name, args, timeout=120, check=True, run_env=None, directory=None):
            helper.obs.verify_lock(helper.obs.LOCK, lock)
            receipt['stages'][name] = run_logged(prefix + args, base / (name + '.log'),
                cwd=directory or source, env=run_env or env, timeout=timeout, check=check)
            return (base / (name + '.log')).read_text(errors='replace')
        stage = 'runner_safety_tests'
        receipt['runner_safety_tests'] = parse_safety_results(logged(stage,
            [sys.executable, '-B', '-m', 'unittest', '-v', 'test_run'], directory=base))
        stage = 'rustfmt'
        logged(stage, ['cargo', 'fmt', '--all', '--', '--check'])
        receipt['rustfmt'] = 'PASS'
        stage = 'compile'
        compile_env = env.copy()
        allow_fetch = os.environ.get('EPG10_ALLOW_DEPENDENCY_FETCH') == '1'
        compile_env['CARGO_NET_OFFLINE'] = 'false' if allow_fetch else 'true'
        receipt['dependency_fetch_allowed_during_compile_only'] = allow_fetch
        packages = package_arguments(profile)
        logged(stage, ['cargo', 'test', '--locked', *packages, '--lib', '--no-run'],
            timeout=900, run_env=compile_env)
        if profile == '05':
            stage = 'compile_integration_tests'
            logged(stage, ['cargo', 'test', '--offline', '--locked', '-p', 'projection-store-pg',
                '--tests', '--no-run'], timeout=240)
        helper.obs.verify_lock(helper.obs.LOCK, lock)
        stage = 'create_owned_pg'
        password = secrets.token_urlsafe(24)
        create_attempted = True
        helper.docker('run', '--detach', '--pull=never', '--name', helper.PG,
            '--label', LABEL + '=' + helper.OWNER, '--publish', '127.0.0.1::5432',
            '--memory', '768m', '--memory-swap', '768m', '--cpus', '.5', '--pids-limit', '128',
            '--security-opt', 'no-new-privileges', '--tmpfs',
            '/var/lib/postgresql/data:rw,exec,mode=0700,size=512m',
            '--env', 'POSTGRES_DB=portal_projection_test_epg10_04', '--env-file', '/dev/stdin', IMAGE,
            '-c', 'max_connections=24', '-c', 'shared_buffers=16MB', '-c', 'max_wal_size=64MB',
            # sudo may discard inherited environment. A pipe-backed env-file
            # avoids both that failure and putting credentials in argv/files.
            input=('POSTGRES_PASSWORD=' + password + '\n').encode(),
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for _ in range(80):
            ready = subprocess.run(['sudo', '-n', 'docker', 'exec', helper.PG,
                'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'portal_projection_test_epg10_04'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(0.25)
        else:
            raise ValueError('PG_FINAL_TCP_SERVER_NOT_READY')
        port = helper.docker('port', helper.PG, '5432/tcp', stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE).stdout.decode().strip()
        if not re.fullmatch(r'127\.0\.0\.1:[1-9][0-9]{0,4}', port):
            raise ValueError('LOOPBACK_DYNAMIC_PG_PORT_REQUIRED')
        env['TEST_PROJECTION_DATABASE_URL'] = 'postgres://postgres:' + password + '@' + port + '/portal_projection_test_epg10_04'
        env['EPG10_TEST_ONLY'] = '1'
        # The legacy04 integration harness intentionally uses this exact DB
        # name for both profiles; container name/owner remain profile-isolated.
        stage = 'postgresql_observer_start'
        sampler = OwnPgSampler(helper)
        sampler.start()
        stage = 'unit_tests'
        receipt['unit_tests'] = parse_rust_results(logged(stage,
            ['cargo', 'test', '--offline', '--locked', *packages,
             '--lib', '--', '--test-threads=1'], timeout=240), 4 if profile == '05' else 2)
        stage = 'bootstrap_tests'
        receipt['bootstrap_tests'] = parse_rust_results(logged(stage,
            ['cargo', 'test', '--offline', '--locked', '-p', 'projection-store-pg',
             '--test', 'epg10_04_bootstrap', '--', '--nocapture', '--test-threads=1'], timeout=240),
             1, expected)
        database_stages = ['unit_tests', 'bootstrap_tests']
        if profile == '05':
            stage = 'read_tests'
            receipt['read_tests'] = parse_rust_results(logged(stage,
                ['cargo', 'test', '--offline', '--locked', '-p', 'projection-store-pg',
                 '--test', 'epg10_05_scoped_read', '--', '--nocapture', '--test-threads=1'], timeout=240),
                 1, expected_read, count_kind='READ')
            database_stages.append(stage)
        stage = 'post_suite_test_db_counts'
        receipt['test_database_counts'] = owned_db_counts(helper, sampler.roster[0]['container_id'])
        receipt['database_test_stage_seconds_observational'] = {
            name: receipt['stages'][name]['elapsed_seconds'] for name in database_stages}
        stage = 'clippy'
        findings = clippy_findings(logged(stage,
            ['cargo', 'clippy', '--offline', '--locked', *packages, '--all-targets',
             '--message-format=json', *(['--', '-D', 'warnings'] if profile == '05' else [])],
            timeout=240, check=False), profile)
        receipt['clippy'] = findings
        if receipt['stages'][stage]['returncode'] or findings['owned_warnings']:
            raise ValueError('CLIPPY_GATE_FAILED_PRIVATE_LOG')
        receipt['clippy']['status'] = ('PASS_STRICT_ZERO_WARNINGS' if profile == '05'
                                       else 'PASS_NO_OWNED_WARNINGS')
        stage = 'input_immutability'
        if source_hashes(source_root, profile) != receipt['input_hashes']:
            raise ValueError('SOURCE_INPUT_CHANGED_DURING_QUALIFICATION')
        receipt['source_input_unchanged'] = True
        receipt['foreign_test_metadata_after'] = peer_test_metadata(helper)
        helper.obs.verify_lock(helper.obs.LOCK, lock)
        receipt['status'] = 'PASS_ISOLATED_CORRECTNESS_ONLY'
    except Exception as exc:
        receipt.update(status='FAIL', failed_stage=stage, error_type=type(exc).__name__)
    finally:
        finish_observation_and_cleanup(receipt, sampler, helper, create_attempted,
                                       lock_context if lock_acquired else None, base)
        signal.alarm(0)
        receipt['elapsed_seconds_observational'] = round(time.monotonic() - started, 3)
    (base / 'receipt.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')
    print(json.dumps({key: value for key, value in receipt.items() if key != 'input_hashes'}, sort_keys=True))
    return 0 if receipt['status'] == 'PASS_ISOLATED_CORRECTNESS_ONLY' else 1


if __name__ == '__main__':
    raise SystemExit(main())
