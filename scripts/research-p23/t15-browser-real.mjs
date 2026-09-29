#!/usr/bin/env node
/** P23-T15 scoped browser-real replay check on the owned, loopback-only cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const requireFrontend = createRequire(join(ROOT, 'apps/portal/frontend/package.json'));
const { chromium } = requireFrontend('playwright');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jobCount = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;

export async function browserReplayReceipt({ home = DEFAULT_HOME, wfoRun, p04Run, label = 't15-browser-real', width = 1280 }) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  assert([660, 1280].includes(width), 'PINNED_BROWSER_VIEWPORT_REQUIRED');
  for (const run of [wfoRun, p04Run]) assert(/^rrun_[a-z0-9]{16,64}$/.test(run ?? ''), 'OWNED_RUN_ID_REQUIRED');
  assert.notEqual(wfoRun, p04Run, 'TWO_DISTINCT_RUNS_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_T15_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const owner = await operatorClient(home);
  const wfoApi = (await owner.call('GET', `/api/v1/quantbt/runs/${wfoRun}/current-source/replay`)).body;
  const p04Api = (await owner.call('GET', `/api/v1/quantbt/runs/${p04Run}/execute/replay`)).body;
  assert.equal(wfoApi.availability?.state, 'AVAILABLE', 'RETAINED_WFO_REQUIRED');
  assert(wfoApi.execution && p04Api.availability?.state === 'AVAILABLE', 'TWO_REAL_REPLAY_LANES_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const before = jobCount(workspace);
  const receipt = {
    schema_version: 'research.p23-t15-browser-real.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), viewport: { width, height: 900 },
    wfo_run_id: wfoRun, p04_run_id: p04Run,
    wfo_api_sha256: sha256(JSON.stringify(wfoApi)), p04_api_sha256: sha256(JSON.stringify(p04Api)),
    jobs_before: before, checks: {}, requests: [], page_errors: [], scope: 'OWNED_CELL_BROWSER_REAL_REPLAY_NO_COLD_OR_MIXED_LOAD',
    scoped_passed: false, full_t15_passed: false, full_p23_passed: false,
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: BASE_URL,
      extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' },
      viewport: { width, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => receipt.page_errors.push(String(error)));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin === BASE_URL && url.pathname.startsWith('/api/'))
        receipt.requests.push(`${request.method()} ${url.pathname}`);
    });
    const login = await page.request.post('/api/auth/login', {
      data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
    });
    assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
    const wfoUrl = `/research/quantbt/runs/${wfoRun}/execute#fold=1`;
    await page.goto(wfoUrl);
    const root = page.locator('[data-screen="execute-replay"]');
    await root.waitFor({ timeout: 30000 });
    await root.locator('[data-candle-row]').first().waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-run'), wfoRun);
    assert.equal(await root.getAttribute('data-lane'), 'retained');
    const fullWindow = await root.locator('[data-candle-row]').count();
    assert(fullWindow > 1, 'MULTIBAR_RETAINED_WINDOW_REQUIRED');
    const beforeReadout = await root.locator('[data-readout]').textContent();
    await root.locator('[data-action="causal-reveal"]').click();
    assert.equal(await root.locator('[data-action="causal-reveal"]').getAttribute('aria-pressed'), 'true');
    const cutAtFirst = await root.locator('[data-candle-row]').count();
    assert.equal(cutAtFirst, 1, 'FUTURE_CANDLES_VISIBLE_AT_FIRST_CURSOR');
    await root.getByRole('button', { name: 'step forward' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-screen="execute-replay"] [data-candle-row]').length === 2);
    const afterReadout = await root.locator('[data-readout]').textContent();
    assert.notEqual(afterReadout, beforeReadout, 'CURSOR_DID_NOT_ADVANCE');
    receipt.checks.causal_prefix = { full_window_bars: fullWindow, first_cursor_bars: cutAtFirst,
      second_cursor_bars: 2, readout_changed: true };
    await page.reload();
    await root.waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-run'), wfoRun, 'DEEP_LINK_RUN_CHANGED');
    assert(new URL(page.url()).hash.includes('fold=1'), 'DEEP_LINK_FOLD_LOST');
    receipt.checks.deep_link = true;
    await page.goto(`/research/quantbt/runs/${p04Run}/execute`);
    await root.waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-run'), p04Run, 'CROSS_RUN_STALE_HEADER');
    assert.equal(await root.getAttribute('data-lane'), 'hub', 'P04_LANE_MISMATCH');
    await page.goBack();
    await root.waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-run'), wfoRun, 'BACK_NAVIGATION_RUN_MISMATCH');
    await root.locator('[data-candle-row]').first().waitFor({ timeout: 30000 });
    assert.equal(await root.getAttribute('data-lane'), 'retained', 'CROSS_RUN_STALE_REPLAY');
    receipt.checks.cross_run_navigation = true;
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, 'HORIZONTAL_OVERFLOW:' + overflow);
    receipt.checks.viewport_overflow_px = overflow;
    assert.deepEqual(receipt.page_errors, [], 'BROWSER_PAGE_ERROR');
    assert(receipt.requests.every(request => request.startsWith('GET ') || request === 'POST /api/auth/login'),
      'UNEXPECTED_BROWSER_MUTATION');
    assert(receipt.requests.every(request => !request.includes('/internal/')), 'PRIVATE_ROUTE_EXPOSED_TO_BROWSER');
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, before, 'BROWSER_CREATED_IMPLICIT_JOB');
    receipt.checks.no_implicit_jobs = true;
    receipt.scoped_passed = true;
    await context.close();
  } catch (error) {
    receipt.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    throw error;
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 T15 scoped browser receipt', receipt.scoped_passed ? 'PASS' : 'FAIL', `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserReplayReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    wfoRun: process.argv.find(arg => arg.startsWith('--wfo-run='))?.slice(10),
    p04Run: process.argv.find(arg => arg.startsWith('--p04-run='))?.slice(10),
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 't15-browser-real',
    width: Number(process.argv.find(arg => arg.startsWith('--width='))?.slice(8) ?? 1280),
  }).catch(error => { console.error('P23 T15 browser-real refused:', error.message); process.exitCode = 1; });
}
