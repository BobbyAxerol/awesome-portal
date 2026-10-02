import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestedSpec } from './real-run.mjs';
const binding = { alpha_id: 'a_test', alpha_version_id: 'av_test' };
const release = { release_id: 'er_quantbt_111', config_digest: 'a'.repeat(64) };
test('fixed regression and WFO use source-pinned named profiles, no direct engine or source path', () => {
  const p04 = requestedSpec(binding, release, 'p04'), wfo = requestedSpec(binding, release, 'wfo');
  assert.equal(p04.protocol, 'three_window_decay'); assert.equal(p04.optuna_trials, 1);
  assert.equal(wfo.protocol, 'advanced'); assert.equal(wfo.optuna_trials, 3);
  assert.equal(wfo.random_seed, 42); assert.equal(wfo.walk_forward.frequency, 'weekly');
  assert.deepEqual(wfo.alpha_binding, p04.alpha_binding); assert.deepEqual(wfo.client, p04.client);
  assert(!JSON.stringify(wfo).includes('/data')); assert(!JSON.stringify(p04).includes('password'));
});
test('unknown profile cannot silently become a smaller fixed regression', () => {
  assert.throws(() => requestedSpec(binding, release, 'unrestricted'), /NAMED_EXECUTION_PROFILE_REQUIRED/);
});
test('v2 rolling and guards are explicit and keep the pinned three real optimizer trials', () => {
  const v2 = requestedSpec(binding, release, 'wfo-v2');
  assert.equal(v2.schema_version, 'research.requested-spec.v2');
  assert.equal(v2.optuna_trials, 3);
  assert.equal(v2.walk_forward.window_mode, 'rolling');
  assert.equal(v2.walk_forward.train_window, '14D');
  assert.equal(v2.walk_forward.purge_bars, 2);
  assert.equal(v2.walk_forward.label_horizon_bars, 1);
  assert.equal(v2.walk_forward.embargo_bars, 3);
});
