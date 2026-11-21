import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mixedWindow } from './t15-browser-real.mjs';

const rows = () => [
  { workspace_id: 'owned', job_id: 'a', run_id: 'r1', state: 'RUNNING' },
  ...['b', 'c', 'd', 'e'].map(job_id => ({ workspace_id: 'owned', job_id, run_id: job_id, state: 'QUEUED' })),
];

test('mixed browser gate requires one running WFO and four distinct queued jobs', () => {
  assert.deepEqual(mixedWindow(rows()), {
    active_job_id: 'a', active_run_id: 'r1', queued_job_ids: ['b', 'c', 'd', 'e'],
  });
  assert.equal(mixedWindow(rows().slice(0, 4)), null);
  assert.equal(mixedWindow([...rows(), { workspace_id: 'owned', job_id: 'f', run_id: 'r6', state: 'RUNNING' }]), null);
});

test('mixed browser gate refuses duplicate IDs or cross-workspace jobs', () => {
  assert.throws(() => mixedWindow(rows().map((row, index) => index === 4 ? { ...row, job_id: 'd' } : row)),
    /DUPLICATE_MIXED_JOB/);
  assert.throws(() => mixedWindow(rows().map((row, index) => index === 4 ? { ...row, workspace_id: 'foreign' } : row)),
    /MIXED_WORKSPACE_MISMATCH/);
});
