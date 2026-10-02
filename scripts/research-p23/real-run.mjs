#!/usr/bin/env node
/** Real public producer path in the fixed P23-owned cell. No engine shortcut. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { PROJECT, BASE_URL, validateHome } from './cell.mjs';

export function requestedSpec(binding, release, profile) {
  assert(['p04', 'wfo', 'wfo-v2', 'wfo-causal-inner'].includes(profile), 'P23_NAMED_EXECUTION_PROFILE_REQUIRED');
  const wfo = profile !== 'p04';
  const causal = profile === 'wfo-causal-inner';
  return {
    schema_version: profile === 'wfo-v2' || causal ? 'research.requested-spec.v2' : 'research.requested-spec.v1',
    alpha_binding: { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id },
    not_publishable: false, strategy_id: binding.alpha_id, execution_route: 'signal_notional', route_params: {},
    data: { dataset_id: 'crypto-binance-1m', symbol: 'BTCUSDT', timeframe: '1h' },
    ...(wfo ? { protocol: 'advanced', walk_forward: {
      start: '2026-06-01T00:00:00Z', end_exclusive: '2026-07-15T00:00:00Z',
      split_mode: '2026-07-01T00:00:00Z', frequency: 'weekly', window_mode: profile === 'wfo-v2' ? 'rolling' : 'expanding',
      ...(profile === 'wfo-v2' ? { train_window: '14D', label_horizon_bars: 1, purge_bars: 2, embargo_bars: 3 } : {}),
      ...(causal ? { inner: { split_frequency: 'weekly', window_mode: 'rolling', train_window: '14D', min_folds: 2 } } : {}),
    } } : { protocol: 'three_window_decay', windows: {
      is: { start: '2026-06-01T00:00', end_exclusive: '2026-06-08T00:00' },
      oos: { start: '2026-06-08T00:00', end_exclusive: '2026-06-15T00:00' },
      holdout: { start: '2026-06-15T00:00', end_exclusive: '2026-06-17T00:00' },
    } }),
    optimization_mode: 'mode_1_decay', optimization_schedule: causal ? 'per_fold_causal' : 'global',
    parameter_space_overrides: [], optuna_trials: wfo ? 3 : 1,
    early_stopping: null, random_seed: wfo ? 42 : null, optimization_config: {},
    client: { engine_release_id: release.release_id, config_digest: release.config_digest },
  };
}
export async function admitRealRun(home, profile, label, operator = 'p23-owner', authenticatedClient, specFactory = requestedSpec) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  assert(typeof specFactory === 'function', 'NAMED_OPERATOR_SPEC_FACTORY_REQUIRED');
  const client = authenticatedClient ?? await operatorClient(home, operator);
  assert.equal(client.user.username, operator, 'EXACT_TEST_OPERATOR_REQUIRED');
  const path = join(home, `run-${label}.json`);
  let prior;
  try { prior = privateJson(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (prior) {
    assert(prior.project === PROJECT && prior.profile === profile && (prior.operator ?? 'p23-owner') === operator, 'P23_RUN_RECEIPT_MISMATCH');
    if (prior.created) {
      assert(/^rrun_[a-z0-9]+$/.test(prior.run_id), 'P23_REAL_RUN_ID_REQUIRED');
      return { client, path, receipt: prior };
    }
  }
  const receipt = prior ?? {
    schema_version: 'research.p23-real-run.v1', project: PROJECT, base_url: BASE_URL,
    identity: privateJson(join(home, 'identity.json')), profile, label, operator, created_at_utc: new Date().toISOString(),
    client_intent_id: `p23-${label}-${randomUUID()}`,
  };
  if (!receipt.requested_spec) {
    receipt.binding = await client.call('POST', '/api/v1/research/run-producer/p04-delta/install', {}, [200, 201]);
    receipt.atlas = await client.call('GET', '/api/v1/research/quantbt/atlas');
    // Operator-only presets can qualify a second real source range without
    // changing the public producer or treating a cached run as a fresh one.
    receipt.requested_spec = specFactory(receipt.binding.body, receipt.atlas.body.atlas.current_release, profile);
    savePrivate(path, receipt);
  }
  if (!receipt.preflight) {
    receipt.preflight = await client.call('POST', '/api/v1/research/preflights', { requested_spec: receipt.requested_spec }, [201]);
    assert(receipt.preflight.body.may_create_run === true, 'P23_PREFLIGHT_MAY_NOT_CREATE');
    savePrivate(path, receipt);
  }
  receipt.created = await client.call('POST', '/api/v1/research/runs', {
    schema_version: 'research.run-create.v1', client_intent_id: receipt.client_intent_id,
    preflight_token: receipt.preflight.body.preflight_token, requested_spec: receipt.requested_spec,
  }, [202]);
  receipt.run_id = receipt.created.body.run_id;
  assert(/^rrun_[a-z0-9]+$/.test(receipt.run_id), 'P23_REAL_RUN_ID_REQUIRED');
  savePrivate(path, receipt);
  console.log('P23 admitted real', profile, receipt.run_id);
  return { client, path, receipt };
}
export async function waitForRun(client, path, receipt, timeoutMs = 480000) {
  const deadline = Date.now() + timeoutMs;
  let previous = '';
  while (Date.now() < deadline) {
    const progress = await client.call('GET', `/api/v1/research/runs/${receipt.run_id}/progress`);
    const status = progress.body.current.effective_status;
    const materialization = progress.body.current.terminal_materialization;
    const key = `${status}/${materialization}`;
    if (key !== previous) {
      console.log('P23 run progress', receipt.run_id, key);
      (receipt.transitions ??= []).push({ at_utc: new Date().toISOString(), progress });
      savePrivate(path, receipt); previous = key;
    }
    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status) && materialization !== 'PENDING') {
      receipt.final = progress; receipt.finished_at_utc = new Date().toISOString();
      savePrivate(path, receipt); return receipt;
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw new Error(`P23_REAL_RUN_NOT_TERMINAL:${receipt.run_id}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const home = process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME;
  const profile = process.argv.find(arg => arg.startsWith('--profile='))?.slice(10) ?? 'p04';
  const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? profile;
  admitRealRun(home, profile, label).then(async ({ client, path, receipt }) => {
    if (!process.argv.includes('--admit-only')) await waitForRun(client, path, receipt);
  }).catch(error => { console.error('P23 real producer refused:', error.message); process.exitCode = 1; });
}
