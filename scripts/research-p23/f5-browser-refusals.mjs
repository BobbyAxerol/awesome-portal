#!/usr/bin/env node
/** Real S02/S14 refusal presentation through the owned P23 browser gateway. */
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
const jobs = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;
const CLONE_RUN = 'rrun_60d8225bff3da70df696c5abd2c6d784';

async function captureRefusal(page, path, action) {
  const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === path
    && response.request().method() === 'POST', { timeout: 30000 });
  await action();
  const response = await responsePromise;
  assert.equal(response.headers()['content-type']?.includes('application/json'), true, 'TYPED_JSON_REQUIRED');
  const body = await response.json();
  assert(typeof body.error?.code === 'string' && body.error.code.length > 0, 'TYPED_REFUSAL_REQUIRED');
  return { status: response.status(), code: body.error.code, request_id: body.request_id ?? null,
    server_message: body.error.message ?? null };
}

export async function browserRefusalReceipt({ home = DEFAULT_HOME, label = 'f5-browser-refusals' } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F5_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const receipt = { schema_version: 'research.p23-f5-browser-refusals.v1', project: PROJECT,
    base_url: BASE_URL, candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), cases: [], jobs_before: jobs(workspace),
    scoped_passed: false, full_f5_passed: false, full_p23_passed: false };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 660]) {
      for (const [screen, scenario] of [['S14', 'invalid_source'], ['S02', 'missing_csrf'],
        ['S14', 'session_expired'], ['S02', 'session_expired']]) {
        const record = { screen, scenario, width, page_errors: [], off_origin: [], requests: [] };
        receipt.cases.push(record);
        const context = await browser.newContext({ baseURL: BASE_URL,
          viewport: { width, height: 900 }, extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' } });
        try {
          const page = await context.newPage();
          page.on('pageerror', error => record.page_errors.push(String(error).slice(0, 300)));
          page.on('request', request => {
            const url = new URL(request.url());
            if (url.origin !== BASE_URL) record.off_origin.push(`${request.method()} ${url.origin}${url.pathname}`);
            else if (url.pathname.startsWith('/api/')) record.requests.push(`${request.method()} ${url.pathname}`);
          });
          const login = await page.request.post('/api/auth/login', {
            data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
          });
          assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
          if (screen === 'S14') {
            await page.goto('/research/quantbt/alpha-import');
            const root = page.locator('[data-screen="alpha-import"]');
            await root.waitFor();
            await root.getByLabel('Alpha source file').setInputFiles({ name: 'not-python.txt',
              mimeType: 'text/plain', buffer: Buffer.from('x') });
            await root.getByLabel('Alpha source text').waitFor();
            await page.waitForFunction(() => {
              const input = document.querySelector('[data-screen="alpha-import"] textarea[aria-label="Alpha source text"]');
              return input instanceof HTMLTextAreaElement && input.value === 'x';
            });
            if (scenario === 'session_expired') await context.clearCookies();
            record.api = await captureRefusal(page, '/api/v1/research/alphas/import/parse',
              () => root.locator('[data-action="parse"]').click());
            assert.equal(record.api.status, scenario === 'session_expired' ? 401 : 400);
            assert.equal(record.api.code, scenario === 'session_expired'
              ? 'SESSION_REQUIRED' : 'RESEARCH_ALPHA_IMPORT_INVALID');
            const alert = root.locator(`[role="alert"][data-refusal="${record.api.code}"]`);
            await alert.waitFor();
            record.visible_copy = (await alert.innerText()).trim();
            assert(record.visible_copy.length > 20, 'VISIBLE_REFUSAL_COPY_REQUIRED');
            assert(!record.visible_copy.includes(record.api.server_message), 'SERVER_DETAIL_RENDERED_AS_COPY');
          } else {
            await page.goto(`/research/quantbt/runs/new?from=${CLONE_RUN}&step=review`);
            const root = page.locator('[data-screen="new-run"]');
            await root.waitFor();
            await root.locator(`[data-clone-source="${CLONE_RUN}"][data-clone-state="available"]`).waitFor();
            await page.waitForFunction(() => {
              const action = document.querySelector('[data-screen="new-run"] [data-action="preflight"]');
              return action instanceof HTMLButtonElement && !action.disabled;
            });
            // Test a dead session separately from a live session missing only CSRF.
            if (scenario === 'session_expired') await context.clearCookies();
            else await context.clearCookies({ name: '__Host-portal_csrf' });
            record.api = await captureRefusal(page, '/api/v1/research/preflights',
              () => root.locator('[data-action="preflight"]').click());
            assert.equal(record.api.status, scenario === 'session_expired' ? 401 : 403);
            assert.equal(record.api.code, scenario === 'session_expired'
              ? 'SESSION_REQUIRED' : 'RESEARCH_PREFLIGHT_INVALID');
            const alert = root.locator('[role="alert"] [data-refusal-copy]');
            await alert.waitFor();
            record.visible_copy = (await alert.innerText()).trim();
            assert(record.visible_copy.length > 20, 'VISIBLE_REFUSAL_COPY_REQUIRED');
            assert(!record.visible_copy.includes(record.api.server_message), 'SERVER_DETAIL_RENDERED_AS_COPY');
          }
          record.overflow_px = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(record.overflow_px <= 1, 'HORIZONTAL_OVERFLOW');
          assert.deepEqual(record.page_errors, [], 'BROWSER_PAGE_ERROR');
          assert.deepEqual(record.off_origin, [], 'OFF_ORIGIN_BROWSER_REQUEST');
          assert(record.requests.every(request => request.startsWith('GET ')
            || request === 'POST /api/auth/login'
            || request === 'POST /api/v1/research/alphas/import/parse'
            || request === 'POST /api/v1/research/preflights'), 'UNEXPECTED_BROWSER_WRITE');
          record.passed = true;
        } catch (error) {
          record.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
          record.passed = false;
        } finally { await context.close(); }
      }
    }
    receipt.jobs_after = jobs(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'REFUSAL_CREATED_ENGINE_JOB');
    receipt.scoped_passed = receipt.cases.length === 8 && receipt.cases.every(record => record.passed);
  } finally {
    receipt.jobs_after ??= jobs(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F5 real browser refusals', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `${receipt.cases.filter(record => record.passed).length}/${receipt.cases.length}`,
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserRefusalReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f5-browser-refusals',
  }).then(receipt => { if (!receipt.scoped_passed) process.exitCode = 1; })
    .catch(error => { console.error('P23 F5 browser refusal test failed:', error.message); process.exitCode = 1; });
}
