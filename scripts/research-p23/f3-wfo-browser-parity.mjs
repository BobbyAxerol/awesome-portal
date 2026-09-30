#!/usr/bin/env node
/** Real WFO Screen 03–08 browser/owner-BFF parity, with no route interception. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const requireFrontend = createRequire(join(ROOT, 'apps/portal/frontend/package.json'));
const { chromium } = requireFrontend('playwright');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const RUN_RECEIPT = 'run-w07-single-2-20260929.json';
const SCREENS = [
  { id: 'S03', leaf: 'progress', root: 'run-progress', api: run => `/api/v1/research/runs/${run}/progress` },
  ...[
    ['S04', 'evidence', 'evidence-flow'], ['S05', 'split', 'split-detail'],
    ['S06', 'search', 'search-detail'], ['S07', 'freeze', 'freeze-detail'],
    ['S08', 'execute', 'execute-replay'],
  ].map(([id, leaf, root]) => ({ id, leaf, root, api: run => `/api/v1/quantbt/runs/${run}/current-source/${id === 'S08' ? 'replay' : leaf}` })),
];
const jobCount = workspace => dbQuery('SELECT count(*)::int AS count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;

async function assertScreenParity(page, item, api) {
  const root = page.locator(`[data-screen="${item.root}"]`).first();
  await root.waitFor({ state: 'visible', timeout: 30000 });
  if (item.id === 'S03') {
    assert.equal(api.current.effective_status, 'COMPLETED', 'WFO_NOT_COMPLETED');
    assert((await root.innerText()).includes(api.run.instrument.symbol), 'PROGRESS_SYMBOL_NOT_RENDERED');
  } else if (item.id === 'S04') {
    await root.locator('[data-retained-verdicts="AVAILABLE"] [data-verdict-row]').first().waitFor();
    assert.equal(await root.locator('[data-retained-verdicts="AVAILABLE"] [data-verdict-row]').count(),
      api.fold_verdicts.rows.length, 'EVIDENCE_FOLD_VERDICTS_DIFF');
    for (const [metric, key] of [['FINAL_EQUITY', 'final_equity'], ['INITIAL_EQUITY', 'initial_equity']]) {
      const value = root.locator(`[data-metric-value="${metric}"]`);
      await value.first().waitFor();
      assert.equal(await value.first().getAttribute('data-exact'), api.passport[key], `${metric}_DECIMAL_DIFF`);
    }
    await root.locator('[data-not-ready]').waitFor({ state: 'detached', timeout: 30000 });
  } else if (item.id === 'S05') {
    await root.locator('[data-fold-table-row]').first().waitFor();
    assert.equal(await root.locator('[data-fold-table-row]').count(), api.fold_plan.folds.length, 'SPLIT_FOLD_COUNT_DIFF');
  } else if (item.id === 'S06') {
    await root.locator('[data-trial] [data-trial-is]').first().waitFor();
    assert.equal(await root.locator('[data-trial] [data-trial-is]').count(), api.ledger.trials.length, 'SEARCH_TRIAL_COUNT_DIFF');
    assert((await root.locator('[data-role-card="selected"]').innerText()).includes(api.selection.selected_trial_id),
      'SEARCH_SELECTED_TRIAL_DIFF');
  } else if (item.id === 'S07') {
    await root.locator('[data-frozen-param], [data-frozen-parameter]').first().waitFor();
    assert.equal(await root.locator('[data-frozen-param], [data-frozen-parameter]').count(),
      Object.keys(api.frozen_selection.parameters).length, 'FREEZE_PARAM_COUNT_DIFF');
    assert.equal(await root.locator('[data-integrity-state]').first().getAttribute('data-integrity-state'),
      api.integrity.state, 'FREEZE_INTEGRITY_DIFF');
  } else if (item.id === 'S08') {
    await page.locator('[data-screen="execute-replay"][data-lane="retained"]').waitFor({ timeout: 30000 });
    await root.locator('[data-route-id="signal_notional"]').first().waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-lane'), 'retained', 'REPLAY_LANE_DIFF');
    assert((await root.locator('[data-route-id]').first().innerText()).includes('signal_notional'), 'REPLAY_ROUTE_DIFF');
    if (api.execution) {
      await root.locator('[data-candle-row]').first().waitFor();
      assert((await root.locator('[data-candle-row]').count()) > 0, 'REPLAY_CANDLES_MISSING');
    } else {
      await root.locator('[data-sample-ledger="retained"]').waitFor();
    }
  }
  return root;
}

export async function wfoBrowserParityReceipt({ home = DEFAULT_HOME, label = 'f3-wfo-browser-parity' } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F3_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim(), '',
    'LIVE_SOURCE_DIRTY');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    identity.candidate_source_sha, 'LIVE_SOURCE_IDENTITY_DRIFT');
  const run = privateJson(join(home, RUN_RECEIPT));
  assert(run.project === PROJECT && run.profile === 'wfo' && run.final?.body?.current?.effective_status === 'COMPLETED',
    'REAL_COMPLETED_WFO_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const owner = await ownerClient(home);
  const receipt = { schema_version: 'research.p23-f3-wfo-browser-parity.v1', project: PROJECT,
    base_url: BASE_URL, candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    run_id: run.run_id, tested_at_utc: new Date().toISOString(), cases: [],
    jobs_before: jobCount(workspace), jobs_after: null, scoped_passed: false,
    full_f3_passed: false, full_p23_passed: false };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 660]) {
      for (const item of SCREENS) {
        const record = { screen: item.id, width, api_path: item.api(run.run_id),
          requests: [], responses: [], page_errors: [], off_origin: [], passed: false };
        receipt.cases.push(record);
        const api = (await owner.call('GET', record.api_path)).body;
        assert.equal(api.run_id, run.run_id, `${item.id}_OWNER_API_RUN_MISMATCH`);
        record.api_sha256 = sha256(JSON.stringify(api));
        const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 900 },
          extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' } });
        try {
          const page = await context.newPage();
          page.on('pageerror', error => record.page_errors.push(String(error).slice(0, 300)));
          page.on('request', request => {
            const url = new URL(request.url());
            if (url.origin !== BASE_URL) record.off_origin.push(`${request.method()} ${url.origin}${url.pathname}`);
            else if (url.pathname.startsWith('/api/')) record.requests.push(`${request.method()} ${url.pathname}`);
          });
          page.on('response', response => {
            const url = new URL(response.url());
            if (url.origin === BASE_URL && url.pathname.startsWith('/api/'))
              record.responses.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
          });
          const login = await page.request.post('/api/auth/login', {
            data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
          });
          assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
          await page.goto(`/research/quantbt/runs/${run.run_id}/${item.leaf}`);
          const root = await assertScreenParity(page, item, api);
          assert(record.requests.includes(`GET ${record.api_path}`), `${item.id}_BROWSER_DID_NOT_READ_NAMED_API`);
          record.overflow_px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(record.overflow_px <= 1, 'HORIZONTAL_OVERFLOW');
          assert.deepEqual(record.page_errors, [], 'BROWSER_PAGE_ERROR');
          assert.deepEqual(record.off_origin, [], 'OFF_ORIGIN_BROWSER_REQUEST');
          assert(record.requests.every(request => request.startsWith('GET ') || request === 'POST /api/auth/login'),
            'IMPLICIT_BROWSER_MUTATION');
          assert(record.responses.every(response => !/ (401|403|500|502|503|504)$/.test(response)),
            'UNEXPECTED_AUTH_OR_SERVER_REFUSAL');
          const screenshot = join(home, `${label}-${item.id}-${width}.png`);
          await root.screenshot({ path: screenshot }); chmodSync(screenshot, 0o600);
          record.screenshot_sha256 = sha256(readFileSync(screenshot));
          record.passed = true;
        } catch (error) {
          record.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
        } finally { await context.close(); }
      }
    }
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'BROWSER_CREATED_IMPLICIT_JOB');
    receipt.scoped_passed = receipt.cases.length === 12 && receipt.cases.every(record => record.passed);
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F3 WFO browser parity', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `${receipt.cases.filter(record => record.passed).length}/${receipt.cases.length}`,
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wfoBrowserParityReceipt({ home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f3-wfo-browser-parity' })
    .then(receipt => { if (!receipt.scoped_passed) process.exitCode = 1; })
    .catch(error => { console.error('P23 F3 WFO parity refused:', error.message); process.exitCode = 1; });
}
