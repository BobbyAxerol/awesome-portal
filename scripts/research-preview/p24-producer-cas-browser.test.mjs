import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyWrite, validateConfig, validateFixedSpec } from './p24-producer-cas-browser.mjs';
import { BASE_URL, PROJECT } from '../research-p23/cell.mjs';
const run = `rrun_${'a'.repeat(32)}`;
const config = { project: PROJECT, base_url: BASE_URL, origin: BASE_URL, run_id: run,
  alpha_version_id: 'av_p23_section32_imported_0_1_0', workspace_id: 'workspace_a', alternate_workspace_id: 'workspace_b',
  actors: { a: { username: 'p24-edge-a' }, b: { username: 'p24-edge-b' } }, out: '/home/bobby/.local/state/portal-research-p23/20261004/sc23-test',
  expected_images: Object.fromEntries(['control-api', 'portal-web', 'portal-api'].map(name => [name, `sha256:${'b'.repeat(64)}`])) };
const spec = { alpha_binding: { alpha_version_id: config.alpha_version_id }, not_publishable: false, execution_route: 'signal_notional',
  protocol: 'three_window_decay', optuna_trials: 1, random_seed: 42, data: { dataset_id: 'crypto-binance-1m', symbol: 'BTCUSDT', timeframe: '1h' },
  parameter_space_overrides: [{ name: 'scale', kind: 'pin', value: 1000 }] };
test('exact owned candidate/actors accepted', () => assert.equal(validateConfig(config).base_url, BASE_URL));
test('shared8095/prod refused', () => { assert.throws(() => validateConfig({ ...config, base_url: 'http://127.0.0.1:8095' })); assert.throws(() => validateConfig({ ...config, origin: 'https://portal.primusspark.com' })); });
test('no old QA or role guess accepted', () => assert.throws(() => validateConfig({ ...config, actors: { ...config.actors, a: { username: 'bobby' } } })));
test('GUI-only is an exact distinct actor continuation, never normal SC23 actor promotion', () => {
  assert.equal(validateConfig({ ...config, mode: 'GUI_ONLY', actors: { producer: { username: 'p24-edge-producer' } } }).mode, 'GUI_ONLY');
  assert.throws(() => validateConfig({ ...config, mode: 'GUI_ONLY', actors: { producer: { username: 'p24-edge-a' } } }));
  assert.throws(() => validateConfig({ ...config, mode: 'arbitrary' }));
});
test('one cheap exact pinned spec accepted', () => assert.equal(validateFixedSpec(spec, config), true));
test('WFO/trials/unpinned input refused', () => { assert.throws(() => validateFixedSpec({ ...spec, protocol: 'advanced' }, config)); assert.throws(() => validateFixedSpec({ ...spec, optuna_trials: 2 }, config)); assert.throws(() => validateFixedSpec({ ...spec, parameter_space_overrides: [] }, config)); });
test('CAS patch only exact actor-owned product operation/lane', () => { assert.equal(classifyWrite('PATCH', `/api/v1/quantbt/runs/${run}/release-candidate/draft`, 'cas-a1', run), 'DRAFT'); assert.equal(classifyWrite('PATCH', `/api/v1/quantbt/runs/${run}/release-candidate/draft`, 'read', run), 'FORBIDDEN'); });
test('preflight/create only deliberate exact phases', () => { assert.equal(classifyWrite('POST', '/api/v1/research/runs', 'gui-create', run), 'CREATE'); assert.equal(classifyWrite('POST', '/api/v1/research/runs', 'read', run), 'FORBIDDEN'); assert.equal(classifyWrite('POST', '/api/v1/research/preflights', 'late-preflight', run), 'PREFLIGHT'); });
test('seal/publication/CLI/evaluation/cancel all refused', () => { for (const path of ['/api/v1/research/release-candidates/rc_test/publish', `/api/v1/quantbt/runs/${run}/release-candidate/seal`, '/api/v1/research/diagnostics', '/api/cli', `/api/v1/research/runs/${run}/cancel`]) assert.equal(classifyWrite('POST', path, 'gui-create', run), 'FORBIDDEN'); });
