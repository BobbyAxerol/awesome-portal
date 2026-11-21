#!/usr/bin/env node
/** D1-O1: cold, same-origin browser receipt for server-published run labels. */
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
const WFO = 'rrun_60d8225bff3da70df696c5abd2c6d784';
const P04 = 'rrun_d8e174e6268aedbf868de56edd062b29';
const ALPHA = 'delta-rsi-polynomial-alpha';

export async function browserRunLabelReceipt({ home = DEFAULT_HOME, label = 'd1-o1-browser-real' } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_D1_O1_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const owner = await operatorClient(home);
  const named = {};
  for (const [name, run, segment] of [
    ['wfo_report', WFO, 'report'], ['p04_report', P04, 'report'],
    ['wfo_compose', WFO, 'release-candidate'], ['p04_compose', P04, 'release-candidate'],
  ]) {
    const response = await owner.call('GET', `/api/v1/quantbt/runs/${run}/${segment}`);
    assert.equal(response.body.run_id, run, 'NAMED_READ_RUN_MISMATCH');
    assert(/^R-(WFO|P04)-[0-9]{3}$/.test(response.body.display_label), 'CANONICAL_LABEL_REQUIRED');
    named[name] = { run_id: run, display_label: response.body.display_label };
  }
  const compare = (await owner.call('GET', `/api/v1/research/alphas/${ALPHA}/compare?mode=attempts`)).body;
  assert.equal(compare.availability?.state, 'AVAILABLE', 'REAL_COMPARE_REQUIRED');
  const first = compare.result?.attempts?.[0];
  assert(first?.run_id && first?.display_label, 'REAL_COMPARE_LABEL_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const before = jobCount(workspace);
  const receipt = {
    schema_version: 'research.d1-o1-browser-real.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), named_reads: named,
    compare_first: { run_id: first.run_id, display_label: first.display_label },
    viewport: { width: 1280, height: 900 }, jobs_before: before,
    checks: [], requests: [], page_errors: [], scoped_passed: false,
    full_f3_passed: false, full_p23_passed: false,
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const cases = [
      { name: 's09_wfo', path: `/research/quantbt/runs/${WFO}/report`, root: '[data-screen="run-report"]',
        selector: '[data-run-chip] [data-full-id]', id: WFO, expected: named.wfo_report.display_label },
      { name: 's09_p04', path: `/research/quantbt/runs/${P04}/report`, root: '[data-screen="run-report"]',
        selector: '[data-run-chip] [data-full-id]', id: P04, expected: named.p04_report.display_label },
      { name: 's11_wfo', path: `/research/quantbt/runs/${WFO}/release-candidate`, root: '[data-screen="release-candidate"][data-rc-mode="compose"]',
        selector: '[data-crumb-run]', id: WFO, expected: named.wfo_compose.display_label },
      { name: 's11_p04', path: `/research/quantbt/runs/${P04}/release-candidate`, root: '[data-screen="release-candidate"][data-rc-mode="compose"]',
        selector: '[data-crumb-run]', id: P04, expected: named.p04_compose.display_label },
      { name: 's13_attempts', path: `/research/quantbt/alphas/${ALPHA}/compare?mode=attempts`, root: '[data-screen="compare"]',
        selector: `[data-run-link="${first.run_id}"]`, id: first.run_id, expected: first.display_label },
    ];
    for (const check of cases) {
      // A new context for every URL proves the deep link does not depend on another screen warming the label registry.
      const context = await browser.newContext({ baseURL: BASE_URL, viewport: receipt.viewport,
        extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' } });
      try {
        const page = await context.newPage();
        page.on('pageerror', error => receipt.page_errors.push(`${check.name}:${String(error).slice(0, 300)}`));
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.origin === BASE_URL && url.pathname.startsWith('/api/'))
            receipt.requests.push(`${check.name}:${request.method()} ${url.pathname}`);
        });
        const login = await page.request.post('/api/auth/login', {
          data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
        });
        assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
        await page.goto(check.path);
        const root = page.locator(check.root);
        await root.waitFor({ timeout: 30000 });
        const targetNode = root.locator(check.selector).first();
        await targetNode.waitFor({ timeout: 30000 });
        await page.waitForFunction(({ selector, expected }) => {
          const node = document.querySelector(selector);
          return node?.textContent?.trim() === expected;
        }, { selector: `${check.root} ${check.selector}`, expected: check.expected }, { timeout: 30000 });
        assert.equal((await targetNode.textContent())?.trim(), check.expected, `${check.name}:LABEL_MISMATCH`);
        if (check.name.startsWith('s09')) {
          assert.equal(await targetNode.getAttribute('data-full-id'), check.id);
          assert((await targetNode.getAttribute('title'))?.includes(check.id), 'S09_FULL_ID_TITLE_REQUIRED');
        } else if (check.name.startsWith('s11')) {
          assert.equal(await targetNode.getAttribute('title'), check.id, 'S11_FULL_ID_TITLE_REQUIRED');
          const rail = root.locator('[data-rail-node="run"] [data-rail-value]').first();
          await rail.waitFor();
          assert.equal((await rail.textContent())?.trim(), check.expected, 'S11_RAIL_LABEL_MISMATCH');
        } else {
          assert.equal(await targetNode.getAttribute('title'), check.id, 'S13_FULL_ID_TITLE_REQUIRED');
          assert((await targetNode.getAttribute('href'))?.includes(check.id), 'S13_FULL_ID_LINK_REQUIRED');
        }
        receipt.checks.push({ name: check.name, path: check.path, run_id: check.id,
          displayed_label: check.expected, full_id_preserved: true });
      } finally { await context.close(); }
    }
    assert.deepEqual(receipt.page_errors, [], 'BROWSER_PAGE_ERROR');
    assert(receipt.requests.every(request => /:GET \/api\//.test(request) || /:POST \/api\/auth\/login$/.test(request)),
      'UNEXPECTED_BROWSER_MUTATION');
    assert(receipt.requests.every(request => !request.includes('/internal/')), 'PRIVATE_ROUTE_EXPOSED_TO_BROWSER');
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, before, 'BROWSER_CREATED_IMPLICIT_JOB');
    receipt.scoped_passed = true;
  } catch (error) {
    receipt.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    throw error;
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('D1-O1 scoped browser receipt', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserRunLabelReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'd1-o1-browser-real',
  }).catch(error => { console.error('D1-O1 browser-real refused:', error.message); process.exitCode = 1; });
}
