import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { verifyReaderFacts } from './p22-reader-receipt.mjs';

const fixture = JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/research-release-candidate.stale-seal.valid.json', import.meta.url)));
function facts() {
  const { composed, published } = structuredClone(fixture);
  return { composed, published, entry: { label: 'R-WFO-022', run: composed.run.id, rc: published.release_candidate_id } };
}
test('canonical stale fixture validates real reader checks; fixture is not runtime evidence', () => {
  const { composed, published, entry } = facts();
  assert.equal(verifyReaderFacts(composed, published, entry).blocked_action, 'CREATE_NEW_RUN_AND_SEAL');
});
test('reader mismatch and missing typed guidance are refused', () => {
  const { composed, published, entry } = facts();
  composed.actions.publish.blocked_reason = 'P22_LOCAL_SEAL_REQUIRED';
  assert.throws(() => verifyReaderFacts(composed, published, entry));
  composed.actions.publish.blocked_reason = published.blocked_reason;
  delete published.blocked_action;
  assert.throws(() => verifyReaderFacts(composed, published, entry));
});
test('ordinal must be the existing native trial number and typed scope', () => {
  const { composed, published, entry } = facts();
  const rail = composed.rail.find(node => node.key === 'selected_params');
  Object.assign(rail, { selected_trial_ordinal: 7, selected_trial_ordinal_scope: 'STUDY_LOCAL', selected_trial_ordinal_reason_code: null });
  composed.selected_params.selected_trial_number = 7;
  assert.equal(verifyReaderFacts(composed, published, entry).selected_trial_ordinal_scope, 'STUDY_LOCAL');
  rail.selected_trial_ordinal = 8;
  assert.throws(() => verifyReaderFacts(composed, published, entry));
});
test('missing reason on absent ordinal is not accepted', () => {
  const { composed, published, entry } = facts();
  delete composed.rail.find(node => node.key === 'selected_params').selected_trial_ordinal_reason_code;
  assert.throws(() => verifyReaderFacts(composed, published, entry));
});
