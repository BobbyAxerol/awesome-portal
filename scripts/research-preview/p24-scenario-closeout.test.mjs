import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { SCENARIOS, causalSelection, requireOwnedConfig, safeRecordedPath, scenarioTotals } from './p24-scenario-closeout.mjs';

const owned = () => ({ project: 'portal-research-p23-ol12', base_url: 'http://127.0.0.1:8096',
  origin: 'http://127.0.0.1:8096', username: 'p23-reader-95', workspace_id: 'ws-test',
  out: '/home/bobby/.local/state/portal-research-p23/20261004/scenario-tests' });
test('never admits shared preview, remote production, changed Origin or existing member identity', () => {
  for (const value of ['http://localhost:8095', 'https://portal.primusspark.com', 'http://127.0.0.1:8095']) {
    assert.throws(() => requireOwnedConfig({ ...owned(), base_url: value }));
  }
  assert.throws(() => requireOwnedConfig({ ...owned(), username: 'bobby' }));
  assert.throws(() => requireOwnedConfig({ ...owned(), origin: 'https://portal.primusspark.com' }));
  assert.equal(requireOwnedConfig(owned()).project, 'portal-research-p23-ol12');
});
test('opaque cursor and tokens never enter the persisted request log', () => {
  assert.equal(safeRecordedPath('/api/x?cursor=opaque-secret&limit=5&token=secret'), '/api/x?cursor=%5BREDACTED%5D&limit=5&token=%5BREDACTED%5D');
  assert(!safeRecordedPath('/api/x?cursor=opaque-secret').includes('opaque-secret'));
});
test('24 mandatory scenarios cannot be removed or counted as full PASS by scoped tests', () => {
  assert.equal(SCENARIOS.length, 24);
  const rows = SCENARIOS.map(id => ({ id, status: 'NEEDS_RUN' }));
  rows[0].status = 'SCOPED_PASS'; rows[1].status = 'PASS';
  assert.deepEqual(scenarioTotals(rows), { SCOPED_PASS: 1, PASS: 1, NEEDS_RUN: 22 });
  assert.throws(() => scenarioTotals(rows.slice(1)));
});
test('selection comparison retains causal scope/study and explicit nulls, not only a trial number', () => {
  const selection = { selected_trial_id: null, selected_trial_ordinal: 2, selected_trial_ordinal_scope: 'STUDY_LOCAL',
    fold_id: 'fold_02', scope: 'PER_FOLD_CAUSAL', parameters: { window: 13 } };
  assert.deepEqual(causalSelection({ selection }), selection);
  assert.deepEqual(causalSelection({ frozen_selection: selection }), selection);
  assert.notDeepEqual(causalSelection({ selection }), causalSelection({ selection: { ...selection, fold_id: 'fold_03' } }));
});
test('SC13/14 technical guard: category label permutation never creates numeric position or ordinal importance', () => {
  // These are the already-built current Control helpers, not a duplicated
  // algorithm or a claim that an engine ran any categorical search.
  const require = createRequire(import.meta.url);
  const { boundWarning } = require('../../apps/control-api/dist/research/bound-warning.js');
  const { DeclaredSpaceParameterSchema } = require('../../apps/control-api/dist/research/current-source-surface.js');
  const canonical = JSON.parse(readFileSync(new URL('../../packages/contracts/fixtures/research-current-source.search-surface.valid.json', import.meta.url)));
  for (const labels of [['fast', 'slow', 'medium'], ['medium', 'fast', 'slow'], ['0', '999', '-1']]) {
    for (const label of labels) {
      const warning = boundWarning({ kind: 'CATEGORICAL', value: label, minimum: null, maximum: null });
      assert.equal(warning.state, 'NOT_APPLICABLE');
      assert.equal(warning.side, null);
      assert.equal(warning.reason_code, 'BOUND_WARNING_CATEGORICAL_PARAMETER');
      // The named numeric-only surface schema must not accept a category as
      // a rank/axis. Imported categorical chips remain a different typed lane.
      assert.equal(DeclaredSpaceParameterSchema.safeParse({ ...canonical.declared_space.parameters[0],
        kind: 'CATEGORICAL', value: label }).success, false);
    }
  }
});
