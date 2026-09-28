import test from 'node:test';
import assert from 'node:assert/strict';
import { assessExecutionIsolation, stableExecutionShape } from './t09-execution-isolation.mjs';

test('T09 hashes a published Execution read without volatile observation time', () => {
  const original = { schema_version: 'x', read_at: 'A', read_at_ms: 10,
    capabilities: [{ enabled: false }] };
  assert.deepEqual(stableExecutionShape(original), {
    schema_version: 'x', capabilities: [{ enabled: false }],
  });
  assert.equal(original.read_at, 'A');
});

test('T09 requires one active plus four queued and unchanged authority/health', () => {
  const baseline = { execution: [{ status: 200, body_sha256: 'a' }],
    outside: [{ id: 'stable', restart_count: 0, health: 'healthy' }],
    health: [{ status: 200, body_sha256: 'h' }], queue: { active: 0, queued: 0 } };
  const during = { ...baseline, queue: { active: 1, queued: 4 } };
  const after = { ...baseline, queue: { active: 0, queued: 0 } };
  assert.equal(assessExecutionIsolation(baseline, during, after).passed, true);
  assert.equal(assessExecutionIsolation(baseline,
    { ...during, execution: [{ status: 403, body_sha256: 'a' }] }, after).passed, false);
  assert.equal(assessExecutionIsolation(baseline,
    { ...during, queue: { active: 1, queued: 3 } }, after).passed, false);
});
