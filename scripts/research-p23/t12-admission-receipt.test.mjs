import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAdmission } from './t12-admission-receipt.mjs';
import { BASE_URL, PROJECT } from './cell.mjs';

function receipt() {
  return { project: PROJECT, base_url: BASE_URL, candidate_source_sha: 'b'.repeat(40),
    owner_active_before: 0, other_actor_active_before: 0, active_jobs_before: 0,
    owner_attempts: [
      ...Array.from({ length: 8 }, (_, index) => ({ ordinal: index + 1, status: 201, token_sha256: 'a'.repeat(64) })),
      { ordinal: 9, status: 503, code: 'RESEARCH_PREFLIGHT_UNAVAILABLE' },
    ], owner_active_after: 8, other_actor: { status: 201, token_sha256: 'c'.repeat(64) }, other_actor_active_after: 1,
    jobs_before: 42, jobs_after: 42, active_jobs_after: 0,
    samples: Array.from({ length: 11 }, () => ({ all_active_services_bounded: true, within_base_limit: true })) };
}

test('finite real quota proof requires 8 accepted, 9th typed refusal and a separate actor', () => {
  assert.equal(assessAdmission(receipt()).scoped_passed, true);
  assert.equal(assessAdmission(receipt()).full_t12_passed, false);
});
test('never calls this utility quota or a whole-T12 pass', () => {
  for (const changed of [
    { owner_attempts: receipt().owner_attempts.slice(0, 8) },
    { owner_attempts: [...receipt().owner_attempts.slice(0, 8), { ordinal: 9, status: 201 }] },
    { owner_active_after: 9 }, { other_actor_active_after: 0 }, { jobs_after: 43 },
    { samples: receipt().samples.slice(0, 10) },
  ]) assert.equal(assessAdmission({ ...receipt(), ...changed }).scoped_passed, false);
});
