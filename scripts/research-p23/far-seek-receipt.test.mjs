import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessFarSeek, deepPage, namedReadPaths } from './far-seek-receipt.mjs';
import { validateManifest } from './read-load.mjs';

test('T11 uses only actual bounded named GET paths and opaque server cursors', () => {
  const paths = namedReadPaths({ workspaceId: 'ws_test', libraryCursor: 'lib_1',
    wfoRunId: 'rrun_abcdef0123456789', p04RunId: 'rrun_1234567890abcdef',
    replayCursor: 'rep_1', replayBefore: 'rep_0', playbackCursor: 'at_1' });
  const users = Array.from({ length: 20 }, (_, n) => ({ id: `reader_${n}`, cookie: `private-${n}` }));
  assert.equal(paths.length, 7);
  assert.equal(validateManifest({ base_url: 'http://127.0.0.1:8096', users,
    paths: paths.map(([, path]) => path) }).paths.length, 7);
  assert(paths.some(([name, path]) => name === 'replay_far_playhead' && path.endsWith('at=at_1')));
});

test('T11 walks real keysets, requires deep pages and refuses cursor cycles', async () => {
  let index = 0;
  const client = { call: async () => ({ body: { page: { has_more: true, next_cursor: `cursor_${index}` },
    items: [{ run_id: `rrun_${index++}` }] } }) };
  const result = await deepPage(client, '/api/v1/quantbt/runs?limit=1',
    body => ({ page: body.page, rows: body.items }), ({ index: page }) => page === 3);
  assert.equal(result.depth, 4);
  assert.equal(result.cursor, 'cursor_2');
  const cycle = { call: async () => ({ body: { page: { has_more: true, next_cursor: 'same' }, items: [{}] } }) };
  await assert.rejects(() => deepPage(cycle, '/api/v1/quantbt/runs?limit=1',
    body => ({ page: body.page, rows: body.items }), () => false), /CURSOR_CYCLE_REFUSED/);
});

test('T11 refuses missing resource overlap, changed job count or image drift', () => {
  const read = { passed: true, started_at_utc: '2026-09-27T00:00:00Z', completed_at_utc: '2026-09-27T00:00:10Z' };
  const resources = { passed: true, sample_count: 2,
    samples: [{ sampled_at_utc: '2026-09-27T00:00:05Z' }] };
  const baseline = { read, resources, before: { total: 20, active: 0 }, after: { total: 20, active: 0 },
    imagePinBefore: 'same', imagePinAfter: 'same' };
  assert.equal(assessFarSeek(baseline).passed, true);
  assert.equal(assessFarSeek({ ...baseline, after: { total: 21, active: 0 } }).passed, false);
  assert.equal(assessFarSeek({ ...baseline, imagePinAfter: 'changed' }).passed, false);
  assert.equal(assessFarSeek({ ...baseline, resources: { ...resources,
    samples: [{ sampled_at_utc: '2026-09-27T00:01:00Z' }] } }).passed, false);
});
