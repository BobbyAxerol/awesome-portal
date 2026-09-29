#!/usr/bin/env node
/** P22→F3: real sealed RC publication and R1 mirror browser/API parity. */
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
const RC = 'rc_06GE8RZMKKJKK9WD166GZZ1EN0';

export async function publicationGovernanceReceipt({ home = DEFAULT_HOME, label = 'f3-publication-governance-real' } = {}) {
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
  const owner = await operatorClient(home);
  const pack = (await owner.call('GET', `/api/v1/research/release-candidates/${RC}`)).body;
  const publication = (await owner.call('GET', `/api/v1/research/release-candidates/${RC}/publication`)).body;
  assert.equal(pack.release_candidate_id, RC);
  assert.equal(publication.release_candidate_id, RC);
  assert.equal(publication.state, 'DELIVERED');
  assert.equal(publication.approval_read, 'AVAILABLE');
  assert.equal(publication.approval?.status, 'APPROVED');
  assert.equal(publication.published?.approval_id, publication.approval?.approval_id);
  const href = publication.approval.href;
  assert.equal(href, `/governance/approvals/${publication.approval.approval_id}/r1`);
  const approval = (await owner.call('GET', `/api/v1/execution/governance/approvals/${publication.approval.approval_id}/r1`)).body;
  assert.equal(approval.data?.approval?.approval_id, publication.approval.approval_id);
  assert.equal(approval.data.approval.status, publication.approval.status);
  assert.equal(approval.data.approval.evidence_set_hash, publication.approval.evidence_set_hash);
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const receipt = {
    schema_version: 'research.p23-f3-publication-governance-real.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), release_candidate_id: RC,
    run_id: pack.run_id, display_label: pack.display_label,
    approval_id: publication.approval.approval_id, approval_status: publication.approval.status,
    evidence_set_hash: publication.approval.evidence_set_hash,
    route: href, jobs_before: jobCount(workspace), jobs_after: null,
    checks: [], scoped_passed: false, full_f3_passed: false, full_p23_passed: false,
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of [1280, 660]) {
      const check = { width, page_errors: [], requests: [], off_origin: [], overflow_px: {}, passed: false };
      receipt.checks.push(check);
      const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width, height: 900 },
        extraHTTPHeaders: { 'x-dev-access-email': 'p23-owner@azdag.com' } });
      try {
        const page = await context.newPage();
        page.on('pageerror', error => check.page_errors.push(String(error).slice(0, 300)));
        page.on('request', request => {
          const url = new URL(request.url());
          if (url.origin !== BASE_URL) check.off_origin.push(`${request.method()} ${url.origin}${url.pathname}`);
          else if (url.pathname.startsWith('/api/')) check.requests.push(`${request.method()} ${url.pathname}`);
        });
        const login = await page.request.post('/api/auth/login', {
          data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
        });
        assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
        await page.goto(`/research/quantbt/release-candidates/${RC}`);
        const root = page.locator('[data-screen="release-candidate"][data-rc-mode="pack"]');
        await root.waitFor({ state: 'visible', timeout: 30000 });
        const mirror = root.locator('[data-panel="mirror"][data-mirror-read="AVAILABLE"]');
        await mirror.waitFor({ state: 'visible', timeout: 30000 });
        await mirror.locator('[data-mirror-status="APPROVED"]').waitFor();
        assert.equal(await root.getAttribute('data-rc-chip'), 'PUBLISHED');
        assert.equal((await root.locator('[data-rail-node="run"] .v').textContent())?.trim(), pack.display_label);
        const link = mirror.locator('[data-action="open-approval"]');
        assert.equal(await link.getAttribute('href'), href, 'S11_R1_HREF_MISMATCH');
        check.overflow_px.pack = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        await link.click();
        await page.waitForURL(url => url.pathname === href, { timeout: 30000 });
        const review = page.locator(`[aria-label="Gate R1 review ${publication.approval.approval_id}"]`);
        await review.waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(id => {
          const node = document.querySelector(`[aria-label="Gate R1 review ${id}"]`);
          return node?.textContent?.includes('APPROVED') && node.textContent.includes(id);
        }, publication.approval.approval_id, { timeout: 30000 });
        check.overflow_px.r1 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(check.overflow_px.pack <= 1 && check.overflow_px.r1 <= 1, 'HORIZONTAL_OVERFLOW');
        assert.deepEqual(check.page_errors, [], 'BROWSER_PAGE_ERROR');
        assert.deepEqual(check.off_origin, [], 'OFF_ORIGIN_BROWSER_REQUEST');
        assert(check.requests.every(request => request.startsWith('GET ') || request === 'POST /api/auth/login'),
          'IMPLICIT_BROWSER_MUTATION');
        check.passed = true;
      } catch (error) {
        check.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 350) };
      } finally { await context.close(); }
    }
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'BROWSER_CREATED_IMPLICIT_JOB');
    receipt.scoped_passed = receipt.checks.length === 2 && receipt.checks.every(check => check.passed);
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F3 publication/Governance bridge', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `${receipt.checks.filter(check => check.passed).length}/2`,
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  publicationGovernanceReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f3-publication-governance-real',
  }).then(receipt => { if (!receipt.scoped_passed) process.exitCode = 1; })
    .catch(error => { console.error('P23 F3 publication bridge refused:', error.message); process.exitCode = 1; });
}
