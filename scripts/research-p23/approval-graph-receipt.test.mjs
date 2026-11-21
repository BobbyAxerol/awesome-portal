import assert from 'node:assert/strict';
import test from 'node:test';
import { assessGraph, graphCounts } from './approval-graph-receipt.mjs';

function graphs() {
  const publication = { release_candidate_id: 'rc_owned', selected_trial_id: null,
    artifact_id: 'art_owned', fact_digest: 'a'.repeat(64) };
  const before = { publication: [publication], packs: [{ release_candidate_id: 'rc_owned' }],
    references: [{ reference_kind: 'RELEASE_CANDIDATE', artifact_id: 'art_owned' }],
    settlements: [{ approval_version: 1, approval_status: 'PENDING' }], promotion: [],
    exposures: [], audit_children: [], selections: [] };
  const after = structuredClone(before);
  after.settlements.push({ approval_version: 2, approval_status: 'APPROVED' });
  after.promotion.push({ run_id: 'rrun_owned', selected_trial_id: null });
  return { before, after };
}
test('actual nonempty approval plus null-trial publication is scoped, not all of T14', () => {
  const { before, after } = graphs();
  assert.equal(graphCounts(after).null_trial, true);
  const result = assessGraph(before, after);
  assert.equal(result.immutable_source_pins, true);
  assert.equal(result.exact_existing_publication, true);
  assert.equal(result.approval_settled_once, true);
  assert.equal(result.null_trial_preserved, true);
  assert.equal(result.actual_exposure_case, false);
  assert.equal(result.actual_audit_child_case, false);
  assert.equal(result.full_t14_passed, false);
});
test('missing or rewritten pin and extra/missing approval facts fail the scoped graph checks', () => {
  for (const mutate of [
    x => { x.references.length = 0; },
    x => { x.publication[0].artifact_id = 'rewritten'; },
    x => { x.settlements[1].approval_status = 'PENDING'; },
    x => { x.settlements.push({ approval_version: 3, approval_status: 'APPROVED' }); },
    x => { x.promotion.length = 0; },
    x => { x.promotion.push({ run_id: 'duplicate' }); },
    x => { x.publication[0].selected_trial_id = 'fabricated'; },
  ]) {
    const { before, after } = graphs(); mutate(after);
    const result = assessGraph(before, after);
    assert.equal(result.immutable_source_pins && result.exact_existing_publication
      && result.approval_settled_once && result.null_trial_preserved, false);
  }
});
