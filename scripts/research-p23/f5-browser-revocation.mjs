#!/usr/bin/env node
/** Real server-side session revocation while S02/S14 keep the stale cookie. */
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
const CLONE_RUN = 'rrun_60d8225bff3da70df696c5abd2c6d784';
const jobs = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function revoke(context) {
  const cookies = await context.cookies();
  assert(cookies.some(cookie => cookie.name === '__Host-portal_session'), 'ACTIVE_COOKIE_REQUIRED');
  // A separate Node request revokes the server row, but deliberately does not
  // apply logout's Set-Cookie to Chromium. The next browser POST presents the
  // actual stale session, not an absent-cookie surrogate.
  const response = await fetch(new URL('/api/auth/logout', BASE_URL), {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { origin: BASE_URL, 'x-dev-access-email': 'p23-owner@azdag.com',
      cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') },
  });
  assert.equal(response.status, 201, 'REAL_SERVER_LOGOUT_REQUIRED');
  assert.equal((await response.json()).state, 'LOGGED_OUT');
  assert((await context.cookies()).some(cookie => cookie.name === '__Host-portal_session'),
    'STALE_COOKIE_MUST_REMAIN_IN_BROWSER');
}

async function oneCase(browser, user, screen, width) {
  const record = { screen, width, page_errors: [], off_origin: [] };
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 900 },
    extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' } });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => record.page_errors.push(String(error).slice(0, 300)));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== BASE_URL) record.off_origin.push(`${request.method()} ${url.origin}${url.pathname}`);
    });
    const login = await page.request.post('/api/auth/login', {
      data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
    });
    assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
    let root;
    let path;
    if (screen === 'S14') {
      await page.goto('/research/quantbt/alpha-import');
      root = page.locator('[data-screen="alpha-import"]');
      await root.waitFor();
      await root.getByLabel('Alpha source file').setInputFiles({ name: 'not-python.txt',
        mimeType: 'text/plain', buffer: Buffer.from('x') });
      await page.waitForFunction(() => document.querySelector('[data-screen="alpha-import"] textarea[aria-label="Alpha source text"]')?.value === 'x');
      path = '/api/v1/research/alphas/import/parse';
    } else {
      await page.goto(`/research/quantbt/runs/new?from=${CLONE_RUN}&step=review`);
      root = page.locator('[data-screen="new-run"]');
      await root.waitFor();
      await root.locator(`[data-clone-source="${CLONE_RUN}"][data-clone-state="available"]`).waitFor();
      await page.waitForFunction(() => {
        const action = document.querySelector('[data-screen="new-run"] [data-action="preflight"]');
        return action instanceof HTMLButtonElement && !action.disabled;
      });
      path = '/api/v1/research/preflights';
    }
    await revoke(context);
    const refusal = page.waitForResponse(response => new URL(response.url()).pathname === path
      && response.request().method() === 'POST', { timeout: 30000 });
    await root.locator(`[data-action="${screen === 'S14' ? 'parse' : 'preflight'}"]`).click();
    const response = await refusal;
    assert.equal(response.status(), 401, 'REVOKED_SESSION_MUST_REFUSE');
    assert(response.headers()['content-type']?.includes('application/json'), 'TYPED_JSON_REQUIRED');
    const body = await response.json();
    assert.equal(body.error?.code, 'SESSION_REQUIRED');
    const frame = page.locator('[data-testid="access-problem-screen"][data-problem="SESSION_EXPIRED"]');
    await frame.waitFor();
    record.visible_copy = (await frame.innerText()).trim();
    assert(record.visible_copy.includes('Portal session expired'), 'VISIBLE_SESSION_EXPIRED_REQUIRED');
    assert(!record.visible_copy.includes(body.error?.message), 'RAW_SERVER_MESSAGE_LEAK');
    assert.equal(await root.count(), 0, 'REVOKED_SHELL_MUST_UNMOUNT');
    assert.equal(new URL(page.url()).pathname, screen === 'S14'
      ? '/research/quantbt/alpha-import' : '/research/quantbt/runs/new', 'DEEP_LINK_LOST');
    record.overflow_px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(record.overflow_px <= 1, 'HORIZONTAL_OVERFLOW');
    assert.deepEqual(record.page_errors, [], 'BROWSER_PAGE_ERROR');
    assert.deepEqual(record.off_origin, [], 'OFF_ORIGIN_BROWSER_REQUEST');
    record.status = 401; record.code = 'SESSION_REQUIRED'; record.passed = true;
  } catch (error) {
    record.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    record.passed = false;
  } finally { await context.close(); }
  return record;
}

export async function browserRevocationReceipt({ home = DEFAULT_HOME, label = 'f5-browser-revocation' } = {}) {
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
  const receipt = { schema_version: 'research.p23-f5-browser-revocation.v1', project: PROJECT,
    base_url: BASE_URL, candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), cases: [], jobs_before: jobs(workspace),
    scoped_passed: false, full_f5_passed: false, full_p23_passed: false };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 660]) for (const screen of ['S14', 'S02']) {
      receipt.cases.push(await oneCase(browser, user, screen, width));
    }
    receipt.jobs_after = jobs(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'REVOKED_SESSION_CREATED_JOB');
    receipt.scoped_passed = receipt.cases.length === 4 && receipt.cases.every(record => record.passed);
  } finally {
    receipt.jobs_after ??= jobs(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F5 real browser revocation', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `${receipt.cases.filter(record => record.passed).length}/${receipt.cases.length}`,
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserRevocationReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f5-browser-revocation',
  }).then(receipt => { if (!receipt.scoped_passed) process.exitCode = 1; })
    .catch(error => { console.error('P23 F5 browser revocation test failed:', error.message); process.exitCode = 1; });
}
