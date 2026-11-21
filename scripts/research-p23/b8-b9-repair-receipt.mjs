#!/usr/bin/env node
/** Scoped actual GET/immutable amendment proof, only the owned P23 cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const RUNS = ['rrun_cc8554d6d2b768a028909cfb0cad50f9', 'rrun_b7ba4ed44f9c3b462a68b34d617941e0'];
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const finiteDecimal = value => typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value);

function originalBinding(runId) {
  return dbQuery(`SELECT
    (SELECT jsonb_agg(jsonb_build_array(artifact_revision,manifest_digest,retained_import_digest,md5(summary::text)) ORDER BY artifact_revision)
       FROM research.current_source_seals_v1 WHERE workspace_id=$1 AND run_id=$2) AS seals,
    (SELECT jsonb_agg(jsonb_build_array(frozen_core_digest,md5(frozen_core::text)) ORDER BY sealed_at)
       FROM research.run_report_manifests_v1 WHERE workspace_id=$1 AND run_id=$2) AS reports,
    (SELECT jsonb_agg(jsonb_build_array(enriched_digest,source_digest,source_revision) ORDER BY created_at)
       FROM research.enriched_analysis_v1 WHERE workspace_id=$1 AND run_id=$2) AS original_enrichments`, [WORKSPACE, runId]).rows[0];
}

function chartOracle(runId, block) {
  const source = dbQuery(`SELECT table_kind,payload FROM research.current_source_rows_v1
    WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=(SELECT max(artifact_revision)
      FROM research.current_source_seals_v1 WHERE workspace_id=$1 AND run_id=$2)
      AND table_kind IN ('FOLD','OBSERVATION') ORDER BY table_kind,source_ordinal LIMIT 10001`, [WORKSPACE, runId]).rows;
  assert(source.length < 10001, 'OWNED_ORACLE_POPULATION_BOUND');
  const folds = source.filter(row => row.table_kind === 'FOLD').map(row => row.payload);
  const rows = source.filter(row => row.table_kind === 'OBSERVATION').map(row => row.payload)
    .filter(row => folds.some(fold => row.at_utc_ms >= fold.test_start_utc_ms && row.at_utc_ms <= fold.test_end_utc_ms));
  assert.equal(rows.length, block.scope.observation_count);
  const closes = new Map(rows.map(row => [Math.floor(row.at_utc_ms / 86400000), Number(row.equity)]));
  const days = [...closes.keys()], prices = []; let prior;
  for (let day = days[0]; day <= days.at(-1); day++) { prior = closes.get(day) ?? prior; prices.push(prior); }
  const daily = prices.slice(1).map((value, index) => value / prices[index] - 1);
  const quantile = (values, probability) => {
    const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * probability, lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.min(lower + 1, sorted.length - 1)] - sorted[lower]) * (position - lower);
  };
  const losses = daily.map(value => -value), var95 = quantile(losses, .95), tail = losses.filter(value => value >= var95);
  const expected = { mean: daily.reduce((a, b) => a + b, 0) / daily.length, median: quantile(daily, .5),
    var_95: var95, cvar_95: tail.reduce((a, b) => a + b, 0) / tail.length };
  assert.equal(daily.length, block.return_distribution.observation_count);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(block.return_distribution[key].state, 'AVAILABLE');
    assert(Math.abs(Number(block.return_distribution[key].value) - value) < 1e-12, `${key}_RAW_DAILY_ORACLE_MISMATCH`);
  }
  assert(Math.abs(Number(block.library_summary.return_fraction) - (Number(rows.at(-1).equity) / Number(rows[0].equity) - 1)) < 1e-12);
  return { definition: 'INDEPENDENT_JS_RETAINED_UTC_DAILY_CLOSE_TYPE7_SIGNED_LOSS_V1',
    oos_rows: rows.length, utc_daily_returns: daily.length, checked: [...Object.keys(expected), 'return_fraction'], tolerance: '0.000000000001' };
}

function amendment(runId, action) {
  assert(['--dry-run', '--apply'].includes(action));
  const control = JSON.parse(docker(['inspect', container('control-api')]))[0];
  const postgres = JSON.parse(docker(['inspect', container('portal-postgres')]))[0];
  assert.equal(control.Config.Labels['com.docker.compose.project'], PROJECT);
  assert.equal(postgres.Config.Labels['com.docker.compose.project'], PROJECT);
  const secret = control.Config.Env.find(value => value.startsWith('DATABASE_URL='));
  const url = new URL(secret.slice('DATABASE_URL='.length));
  assert.equal(url.hostname, 'portal-postgres'); assert.equal(url.pathname, '/portal_control');
  const ips = Object.values(postgres.NetworkSettings.Networks).map(row => row.IPAddress).filter(Boolean);
  assert.equal(ips.length, 1); assert(/^172\.[0-9.]+$/.test(ips[0])); url.hostname = ips[0];
  const result = spawnSync(process.execPath, [join(ROOT, 'apps/control-api/dist/cli/research-enriched-analysis.js'),
    '--workspace-id', WORKSPACE, '--run-id', runId, action, '--amend-charts'], {
    cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 100000,
    env: { PATH: process.env.PATH, PORTAL_ENV: 'local', AUTH_MODE: 'dev', DATABASE_URL: url.toString(),
      RESEARCH_ANALYTICS_PYTHON: '/home/bobby/portal-research/apps/portal/.venv/bin/python' },
  });
  assert.equal(result.status, 0, `OWNED_AMENDMENT_REFUSED:${runId}:${action}`);
  return JSON.parse(result.stdout);
}

export async function repairReceipt(home = DEFAULT_HOME, amend = false) {
  home = validateHome(home);
  const savedOwner = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(savedOwner?.id && savedOwner.password, 'EXISTING_OWNED_OPERATOR_REQUIRED');
  // Reauthenticate only the retained owner anchor; never re-enable the 21 retired users.
  const user = { ...savedOwner, cookies: {} }, client = makeClient(user);
  await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]);
  const receipt = { schema_version: 'research.b8-b9-owned-api.v1', project: PROJECT, base_url: BASE_URL,
    at_utc: new Date().toISOString(), workspace_id: WORKSPACE, source_lane: 'OWNED_RETAINED_HMD_RUNS_NOT_SHARED_PREVIEW',
    image_id: docker(['inspect', '--format', '{{.Image}}', container('control-api')]).trim(), runs: [], pairs: [], passed: false };
  try {
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.state, 'AUTHENTICATED'); assert.equal(context.principal.principalId, savedOwner.id);
    const library = (await client.call('GET', `/api/v1/quantbt/runs?workspace_id=${WORKSPACE}&limit=50`)).body;
    for (const runId of RUNS) {
      const original = originalBinding(runId), item = library.items.find(row => row.run_id === runId);
      assert(item, 'OWNED_LIBRARY_RUN_REQUIRED');
      const attempts = [];
      if (amend) for (const action of ['--dry-run', '--apply', '--apply']) attempts.push(amendment(runId, action));
      if (attempts.length) {
        assert.equal(attempts[0].enriched_digest, attempts[1].enriched_digest);
        assert.equal(attempts[2].state, 'ALREADY_BACKFILLED');
        assert.equal(attempts[1].enriched_digest, attempts[2].enriched_digest);
      }
      const paths = { hub: `/api/v1/quantbt/runs/${runId}/evidence`,
        retained: `/api/v1/quantbt/runs/${runId}/current-source/evidence`,
        progress: `/api/v1/research/runs/${runId}/progress`,
        split: `/api/v1/quantbt/runs/${runId}/current-source/split`,
        sparkline: `/api/v1/quantbt/runs/${runId}/sparkline`,
        report: `/api/v1/quantbt/runs/${runId}/report` };
      const responses = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await client.call('GET', `${path}?workspace_id=${WORKSPACE}`)])));
      assert.equal(responses.hub.body.availability.state, 'AVAILABLE', 'RETAINED_HUB_NOT_READY');
      assert.deepEqual(originalBinding(runId), original, 'ORIGINAL_SEAL_REPORT_OR_B6_CHANGED');
      const block = responses.hub.body.enriched_analysis;
      let oracle;
      if (amend) {
        assert(block?.return_distribution.mean, 'B9_BLOCK_NOT_PUBLISHED');
        assert.equal(block.run_id, runId); assert.equal(block.rolling, null);
        assert.deepEqual(responses.retained.body.enriched_analysis, block);
        assert.deepEqual(responses.report.body.enriched_analysis, block);
        assert.equal(block.windows.oos.source_locator, 'P10.immutable_requested_spec.walk_forward:split_mode..end_exclusive');
        assert.equal(block.library_summary.return_basis.first_at_utc_ms, block.scope.first_at_utc_ms);
        const freshLibrary = (await client.call('GET', `/api/v1/quantbt/runs?workspace_id=${WORKSPACE}&limit=50`)).body;
        assert.deepEqual(freshLibrary.items.find(row => row.run_id === runId)?.analytics_all_time, block.library_summary,
          'LIBRARY_HUB_SUPPLEMENT_PARITY');
        oracle = chartOracle(runId, block);
      }
      receipt.runs.push({ run_id: runId, display_label: item.display_label, alpha_id: item.binding?.alpha_id,
        original, amendments: attempts, paths, responses, ...(oracle ? { oracle } : {}) });
    }
    const alpha = receipt.runs[0].alpha_id;
    assert(alpha && alpha === receipt.runs[1].alpha_id, 'ONE_REAL_BOUND_ALPHA_REQUIRED');
    for (const ids of [RUNS, [...RUNS].reverse()]) {
      const path = `/api/v1/research/alphas/${alpha}/compare?workspace_id=${WORKSPACE}&mode=pair&runs=${ids.join(',')}`;
      const started = performance.now(), response = await client.call('GET', path);
      const pair = response.body.result?.pair;
      assert(pair?.correlation?.value && finiteDecimal(pair.correlation.value), 'EXACT_PAIR_CORRELATION_REQUIRED');
      if (amend) assert(pair.chart_annotations?.every(row => row.availability.state === 'AVAILABLE'), 'B9_COMPARE_NOT_PUBLISHED');
      receipt.pairs.push({ path, elapsed_ms: Math.round(performance.now() - started), response });
    }
    assert.equal(receipt.pairs[0].response.body.result.pair.correlation.value, receipt.pairs[1].response.body.result.pair.correlation.value);
    receipt.passed = true;
  } finally {
    await client.call('POST', '/api/auth/logout', {}, [200, 201, 204]);
    receipt.session_cleanup = 'OWNER_SESSION_LOGGED_OUT_21_RETIRED_TEST_USERS_NOT_REENABLED';
    savePrivate(join(home, 'b8-b9-repair-receipt.json'), receipt);
  }
  console.log(JSON.stringify({ passed: receipt.passed, run_ids: RUNS, pairs: receipt.pairs.length,
    receipt_sha256: createHash('sha256').update(readFileSync(join(home, 'b8-b9-repair-receipt.json'))).digest('hex') }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  repairReceipt(process.argv.find(value => value.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    process.argv.includes('--amend-charts')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
