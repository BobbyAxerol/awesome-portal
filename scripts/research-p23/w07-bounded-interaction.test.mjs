import assert from 'node:assert/strict';
import test from 'node:test';
import { assessW07, projectionRunId } from './w07-bounded-interaction.mjs';

const valid = () => ({
  running: { effective_status: 'RUNNING', source_latest_sequence: 1 },
  running_at_reads: { effective_status: 'RUNNING', source_latest_sequence: 2 },
  export: { status: 200, paused_ms: 3000, bytes: 128, digest_matches: true },
  replay: { depth: 13, ordinal: 1700 },
  reads: Array.from({ length: 8 }, (_, index) => ({ status: 200,
    kind: index % 2 ? 'evidence_projection' : 'deep_replay',
    projection_state: index % 2 ? 'AVAILABLE' : null,
    revision_present: index % 2 ? true : null, replay_ordinal: 1700 })),
  jobs_before: 5, jobs_after: 5,
  resources: [0, 1].map(() => ({ within_base_limit: true, all_active_services_bounded: true })),
});

test('W07 scoped receipt requires real overlap, bounded body and unchanged jobs', () => {
  assert.equal(assessW07(valid()).scoped_passed, true);
  for (const mutation of [
    r => { r.running_at_reads.effective_status = 'COMPLETED'; },
    r => { r.export.paused_ms = 2499; },
    r => { r.export.bytes = 512 * 1024 + 1; },
    r => { r.export.digest_matches = false; },
    r => { r.replay.depth = 1; },
    r => { r.reads[0].replay_ordinal = 1699; },
    r => { r.jobs_after++; },
    r => { r.reads[1].projection_state = 'NOT_PUBLISHED'; },
    r => { r.resources[1].within_base_limit = false; },
  ]) {
    const r = valid(); mutation(r);
    assert.equal(assessW07(r).scoped_passed, false);
  }
  assert.equal(assessW07(valid()).full_p23_passed, false);
});

test('W07 projection is owned P04, never inferred from the archived WFO', () => {
  const scope = { project: 'portal-research-p23-ol12',
    base_url: 'http://127.0.0.1:8096', named_run_id: 'rrun_' + 'a'.repeat(32) };
  assert.equal(projectionRunId(scope), scope.named_run_id);
  assert.throws(() => projectionRunId({ ...scope, named_run_id: undefined }));
  assert.throws(() => projectionRunId({ ...scope, project: 'portal-research-preview' }));
});
