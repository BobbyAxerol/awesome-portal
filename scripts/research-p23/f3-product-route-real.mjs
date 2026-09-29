#!/usr/bin/env node
/** Exact-candidate, read-only S00–S14 route/API/browser sweep on the owned P23 cell. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const requireFrontend = createRequire(join(ROOT, 'apps/portal/frontend/package.json'));
const { chromium } = requireFrontend('playwright');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jobCount = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;
const RUN = 'rrun_60d8225bff3da70df696c5abd2c6d784';
const ALPHA = 'delta-rsi-polynomial-alpha';
const Q = '/research/quantbt';
const CASES = [
  ['S00', `${Q}/journey`, 'journey-map'],
  ['S01', `${Q}/runs`, 'run-library'],
  ['S02', `${Q}/runs/new?from=${RUN}`, 'new-run'],
  ['S03', `${Q}/runs/${RUN}/progress`, 'run-progress'],
  ['S04', `${Q}/runs/${RUN}/evidence`, 'evidence-flow'],
  ['S05', `${Q}/runs/${RUN}/split`, 'split-detail'],
  ['S06', `${Q}/runs/${RUN}/search`, 'search-detail'],
  ['S07', `${Q}/runs/${RUN}/freeze`, 'freeze-detail'],
  ['S08', `${Q}/runs/${RUN}/execute`, 'execute-replay'],
  ['S09', `${Q}/runs/${RUN}/report`, 'run-report'],
  ['S10', `${Q}/alphas/${ALPHA}/lineage`, 'attempt-lineage'],
  ['S11', `${Q}/runs/${RUN}/release-candidate`, 'release-candidate'],
  ['S12', `${Q}/atlas`, 'engine-atlas'],
  ['S13', `${Q}/alphas/${ALPHA}/compare?mode=attempts`, 'compare'],
  ['S14', `${Q}/alpha-import`, 'alpha-import'],
];

export async function realProductRouteReceipt({ home = DEFAULT_HOME, label = 'f3-product-route-real' } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F3_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const receipt = {
    schema_version: 'research.p23-f3-product-route-real.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), run_id: RUN, alpha_id: ALPHA,
    cases: [], jobs_before: jobCount(workspace), jobs_after: null,
    scoped_passed: false, full_f3_passed: false, full_f5_passed: false, full_p23_passed: false,
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 660]) {
      for (const [screen, path, rootName] of CASES) {
        const record = { screen, width, path, root: rootName, root_visible: false,
          requests: [], api_responses: [], page_errors: [], off_origin: [], overflow_px: null, error: null };
        receipt.cases.push(record);
        // Fresh context is deliberate: each deep link must load without another route warming its client cache.
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
              record.api_responses.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
          });
          const login = await page.request.post('/api/auth/login', {
            data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
          });
          assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
          await page.goto(path);
          const root = page.locator(`[data-screen="${rootName}"]`).first();
          await root.waitFor({ state: 'visible', timeout: 30000 });
          record.root_visible = true;
          // Request quiescence is useful evidence but is not a pass prerequisite for polling/SSE screens.
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
          record.overflow_px = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(record.overflow_px <= 1, `HORIZONTAL_OVERFLOW:${record.overflow_px}`);
          assert.deepEqual(record.page_errors, [], 'BROWSER_PAGE_ERROR');
          assert.deepEqual(record.off_origin, [], 'OFF_ORIGIN_BROWSER_REQUEST');
          assert(record.requests.every(request => request.startsWith('GET ') || request === 'POST /api/auth/login'),
            'IMPLICIT_BROWSER_MUTATION');
          assert(record.requests.every(request => !request.includes('/internal/')), 'PRIVATE_ROUTE_EXPOSED');
          assert(record.api_responses.every(response => !/ (401|403|500|502|503|504)$/.test(response)),
            'UNEXPECTED_AUTH_OR_SERVER_REFUSAL');
          record.passed = true;
        } catch (error) {
          record.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 350) };
          record.passed = false;
        } finally { await context.close(); }
      }
    }
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'ROUTE_SWEEP_CREATED_IMPLICIT_JOB');
    receipt.scoped_passed = receipt.cases.length === 30 && receipt.cases.every(record => record.passed);
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F3 real route sweep', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `${receipt.cases.filter(record => record.passed).length}/${receipt.cases.length}`,
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  realProductRouteReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f3-product-route-real',
  }).then(receipt => { if (!receipt.scoped_passed) process.exitCode = 1; })
    .catch(error => { console.error('P23 F3 route sweep refused:', error.message); process.exitCode = 1; });
}
