#!/usr/bin/env python3
"""Bounded read-only source/runtime/resource metadata, never Config.Env/rows."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def call(args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, timeout=30)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source(path, journal=None):
    root = Path(path)
    git = lambda *args: call(['git', *args], cwd=root)
    untracked = git('ls-files', '--others', '--exclude-standard', '-z')
    result = dict(path=path, branch=git('branch', '--show-current').decode().strip(),
        head=git('rev-parse', 'HEAD').decode().strip(),
        staged_sha256=digest(git('diff', '--cached', '--binary')),
        unstaged_sha256=digest(git('diff', '--binary')),
        untracked_paths_sha256=digest(untracked), untracked_count=untracked.count(b'\0'))
    if journal:
        result['journal_sha256'] = digest((root/journal).read_bytes())
    return result


def main():
    host = sys.argv[1]
    if host not in ('HK', 'SGP'):
        raise ValueError('EXPLICIT_HOST_REQUIRED')
    docker = ['sudo', '-n', 'docker']
    names = call(docker+['ps', '--format', '{{.Names}}']).decode().splitlines()
    if host == 'HK':
        selected = sorted(n for n in names if n.startswith('portal-execution-edge-'))
        repos = [('/home/bobby/.worktrees/trading-system-next-upgrade','TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md'),
            ('/home/bobby/.worktrees/trading-system-pm-v1_1','TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md'),
            ('/home/bobby/.worktrees/data-layer-p184-closure','DATA_LAYER_UNIFIED_IMPLEMENTATION_PLAN.md'),
            ('/home/bobby/.worktrees/portal-execution-manager-v2',None)]
    else:
        selected = sorted(n for n in names if n in ('portal-research-preview-control-api-1',
            'portal-research-preview-portal-api-1','portal-control-api-1',
            'portal-stable-v1-0-1-control-api-1','portal-portal-web-1'))
        repos = [('/home/bobby/portal-research',None),('/home/bobby/portal-main-release',None)]
    fmt='{"name":{{json .Name}},"image":{{json .Image}},"config":{{json (index .Config.Labels "com.docker.compose.config-hash")}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},"release_path":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}},"restarts":{{.RestartCount}}}'
    runtime = [json.loads(line) for line in call(docker+['inspect','--format',fmt,*selected]).splitlines()]
    lock = Path('/home/bobby/.local/state/host-measurement-window.lock')
    disk = __import__('os').statvfs('/')
    result = dict(schema='epg10.source-runtime-metadata.v1', host=host,
        at_utc=datetime.now(timezone.utc).isoformat(),sources=[source(*r) for r in repos],
        runtime=runtime, running_container_count=len(names),
        docker_inventory=[json.loads(line) for line in call(docker+['system','df','--format','{{json .}}']).splitlines()],
        disk_available_bytes=disk.f_bavail*disk.f_frsize,
        host_lock=json.loads(lock.read_bytes()) if lock.exists() else None,
        owned_epg03_containers=[n for n in names if n.startswith('epg10-03-')])
    if host == 'HK':
        result['worktrees'] = call(['git','worktree','list','--porcelain'],cwd=repos[-1][0]).decode()
    else:
        root=Path('/home/bobby/portal-research')
        result['research_contracts']={name:digest((root/name).read_bytes()) for name in (
            'packages/contracts/schemas/execution-v2-foundation.v1.schema.json',
            'packages/contracts/fixtures/execution-v2-foundation.synthetic.valid.json',
            'apps/control-api/src/execution-v2/read-publication.ts')}
    print(json.dumps(result,indent=2,sort_keys=True))


if __name__ == '__main__':
    main()
