#!/usr/bin/env node
/** P23 read-only cgroup receipt. Never prints environment or credentials. */
import { execFileSync } from 'node:child_process';

export const BASE_LIMIT_BYTES = 5_000_000_000;
export const RUNTIME_BUDGET_BYTES = Object.freeze({
  'quant-worker-py': 1_500_000_000,
  'portal-api': 800_000_000,
  'control-api': 650_000_000,
  'portal-postgres': 900_000_000,
  'portal-nats': 150_000_000,
  'roadmap-task-board-api': 200_000_000,
  'portal-web': 100_000_000,
  'portal-minio': 300_000_000,
});

let dockerPrefix;
function docker(args) {
  if (!dockerPrefix) {
    try { execFileSync('docker', ['info'], { stdio: 'pipe', timeout: 15_000 }); dockerPrefix = ['docker']; }
    catch { execFileSync('sudo', ['-n', 'docker', 'info'], { stdio: 'pipe', timeout: 15_000 }); dockerPrefix = ['sudo', '-n', 'docker']; }
  }
  return execFileSync(dockerPrefix[0], [...dockerPrefix.slice(1), ...args], { encoding: 'utf8', timeout: 15_000 }).trim();
}

export function evaluateContainers(containers, { requireLimits = false } = {}) {
  const seen = new Set();
  let totalBytes = 0;
  let budgetSum = 0;
  const rows = containers.map(({ service, currentBytes, limitBytes, swapLimitBytes, pids }) => {
    if (!Object.hasOwn(RUNTIME_BUDGET_BYTES, service)) throw new Error(`UNEXPECTED_SERVICE:${service}`);
    if (seen.has(service)) throw new Error(`DUPLICATE_SERVICE:${service}`);
    seen.add(service);
    for (const [name, value] of Object.entries({ currentBytes, limitBytes, swapLimitBytes, pids })) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error(`INVALID_${name}:${service}`);
    }
    const budget = RUNTIME_BUDGET_BYTES[service];
    budgetSum += budget;
    totalBytes += currentBytes;
    if (requireLimits && (limitBytes !== budget || swapLimitBytes !== budget || pids < 1)) {
      throw new Error(`UNBOUNDED_CGROUP:${service}`);
    }
    return { service, current_bytes: currentBytes, limit_bytes: limitBytes, swap_limit_bytes: swapLimitBytes, pids_limit: pids };
  });
  if (budgetSum > BASE_LIMIT_BYTES) throw new Error('PROFILE_EXCEEDS_5GB');
  return {
    schema_version: 'research.p23-resource-snapshot.v1',
    sampled_at_utc: new Date().toISOString(),
    total_current_bytes: totalBytes,
    base_limit_bytes: BASE_LIMIT_BYTES,
    provisioned_runtime_budget_bytes: budgetSum,
    within_base_limit: totalBytes <= BASE_LIMIT_BYTES,
    all_active_services_bounded: rows.every(row => row.limit_bytes === RUNTIME_BUDGET_BYTES[row.service] && row.swap_limit_bytes === RUNTIME_BUDGET_BYTES[row.service] && row.pids_limit > 0),
    containers: rows.sort((a, b) => a.service.localeCompare(b.service)),
  };
}

function takeSnapshot(project, requireLimits) {
  if (!/^portal-research-(?:preview|p23(?:-[a-z0-9-]+)?)$/.test(project)) throw new Error('PROJECT_NOT_RESEARCH_SCOPED');
  const ids = docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`]).split('\n').filter(Boolean);
  if (ids.length === 0) throw new Error('NO_RUNNING_CONTAINERS');
  const containers = ids.map(id => {
    const meta = JSON.parse(docker(['inspect', '--format', '{{json .}}', id]));
    const service = meta.Config.Labels['com.docker.compose.service'];
    const currentBytes = Number(docker(['exec', id, 'cat', '/sys/fs/cgroup/memory.current']));
    const limitBytes = Number(meta.HostConfig.Memory);
    const swapLimitBytes = Number(meta.HostConfig.MemorySwap);
    const pids = Number(meta.HostConfig.PidsLimit ?? 0);
    return { service, currentBytes, limitBytes, swapLimitBytes, pids };
  });
  return { project, ...evaluateContainers(containers, { requireLimits }) };
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const project = process.argv[2];
  const requireLimits = process.argv.includes('--require-limits');
  try {
    const receipt = takeSnapshot(project, requireLimits);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    if (!receipt.within_base_limit || (requireLimits && !receipt.all_active_services_bounded)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`P23 resource snapshot refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
