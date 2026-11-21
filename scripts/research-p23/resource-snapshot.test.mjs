import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BASE_LIMIT_BYTES, RUNTIME_BUDGET_BYTES, evaluateContainers } from './resource-snapshot.mjs';

const overlay = readFileSync(new URL('../../deploy/research-preview/compose.research-p23-5gb.yaml', import.meta.url), 'utf8');
const rows = Object.entries(RUNTIME_BUDGET_BYTES).map(([service, limit]) => ({
  service, currentBytes: Math.floor(limit / 2), limitBytes: limit, swapLimitBytes: limit, pids: 64,
}));

test('every runtime service has exact decimal-byte memory and no-swap caps in overlay', () => {
  const sum = Object.values(RUNTIME_BUDGET_BYTES).reduce((a, b) => a + b, 0);
  assert.equal(sum, 4_600_000_000);
  assert.ok(sum < BASE_LIMIT_BYTES);
  for (const [service, limit] of Object.entries(RUNTIME_BUDGET_BYTES)) {
    const block = overlay.split(/\n(?=  [a-z][a-z0-9-]*:)/).find(section => section.startsWith(`  ${service}:\n`));
    assert.ok(block, `${service} is in overlay`);
    assert.match(block, new RegExp(`^    mem_limit: ${limit}$`, 'm'));
    assert.match(block, new RegExp(`^    memswap_limit: ${limit}$`, 'm'));
    assert.match(block, /^    pids_limit: [1-9][0-9]*$/m);
  }
});

test('cgroup accounting includes all rows and refuses unbounded or duplicate services', () => {
  const result = evaluateContainers(rows, { requireLimits: true });
  assert.equal(result.total_current_bytes, 2_300_000_000);
  assert.equal(result.within_base_limit, true);
  assert.equal(result.all_active_services_bounded, true);
  assert.throws(() => evaluateContainers([{ ...rows[0], limitBytes: 0 }], { requireLimits: true }), /UNBOUNDED_CGROUP/);
  assert.throws(() => evaluateContainers([rows[0], rows[0]]), /DUPLICATE_SERVICE/);
  assert.throws(() => evaluateContainers([{ ...rows[0], service: 'execution-edge' }]), /UNEXPECTED_SERVICE/);
  assert.equal(evaluateContainers([{ ...rows[0], currentBytes: 5_000_000_001 }]).within_base_limit, false);
});

test('strict receipt refuses a missing required service and accounts for the one-shot overlap', () => {
  assert.throws(() => evaluateContainers(rows.slice(1), { requireLimits: true, requireComplete: true }),
    /MISSING_REQUIRED_SERVICE:quant-worker-py/);
  const oneShot = { service: 'control-api-migrate', currentBytes: 200_000_000,
    limitBytes: 350_000_000, swapLimitBytes: 350_000_000, pids: 64 };
  const sample = evaluateContainers([...rows, oneShot], { requireLimits: true, requireComplete: true });
  assert.equal(sample.provisioned_runtime_budget_bytes, 4_950_000_000);
  assert.throws(() => evaluateContainers([...rows, oneShot, { ...oneShot, service: 'control-api-bootstrap' }]),
    /CONCURRENT_ONE_SHOTS/);
});
