#!/usr/bin/env node
/** F5: real S14 browser writes on the owned P23 cell, never fixture routing. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

function acceptedSource() {
  const fixture = readFileSync(join(ROOT, 'scripts/research-preview/e17-imported-receipt.mjs'), 'utf8');
  const match = fixture.match(/const source = `([\s\S]*?)`;/);
  assert(match, 'ACCEPTED_E17_SOURCE_FIXTURE_REQUIRED');
  return match[1];
}

async function posted(page, path, action) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === BASE_URL && url.pathname === path && response.request().method() === 'POST';
  }, { timeout: 30000 });
  await action();
  const response = await pending;
  const body = await response.json();
  assert(response.ok(), `S14_WRITE_REFUSED:${path}:${response.status()}:${body.error?.code ?? 'UNKNOWN'}`);
  return { status: response.status(), body };
}

export async function browserImportReceipt({ home = DEFAULT_HOME, label = 'f5-s14-browser-real', width = 1280 } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  assert([660, 1280].includes(width), 'PINNED_BROWSER_VIEWPORT_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F5_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const owner = await operatorClient(home);
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const source = acceptedSource();
  const alphaId = `p23-f5-${randomUUID().slice(0, 8)}`;
  const receipt = {
    schema_version: 'research.p23-f5-s14-browser-write.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), viewport: { width, height: 900 },
    alpha_id: alphaId, source_sha256: sha256(source), jobs_before: jobCount(workspace),
    writes: [], page_errors: [], checks: {},
    scope: 'OWNED_CELL_REAL_BROWSER_IMPORT_WRITE_NOT_FULL_F5_OR_P23',
    scoped_passed: false, full_f5_passed: false, full_p23_passed: false,
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
      if (url.origin !== BASE_URL || !url.pathname.startsWith('/api/')) return;
      if (!['GET', 'HEAD'].includes(request.method())) receipt.writes.push(`${request.method()} ${url.pathname}`);
    });
    const login = await page.request.post('/api/auth/login', {
      data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
    });
    assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
    await page.goto('/research/quantbt/alpha-import');
    const root = page.locator('[data-screen="alpha-import"]');
    await root.waitFor({ timeout: 30000 });
    await root.getByLabel('Alpha source text').fill(source);
    const parse = await posted(page, '/api/v1/research/alphas/import/parse', () => root.locator('[data-action="parse"]').click());
    assert.equal(parse.status, 201);
    assert.equal(parse.body.source_digest, receipt.source_sha256, 'BROWSER_SOURCE_DIGEST_MISMATCH');
    assert(parse.body.mirror?.length > 0, 'SERVER_MIRROR_REQUIRED');
    await root.locator('[data-mirror-field]').first().waitFor();
    assert.equal(await root.locator('[data-mirror-field]').count(), parse.body.mirror.length);
    receipt.checks.parse = { status: parse.status, mirror_rows: parse.body.mirror.length,
      source_digest: parse.body.source_digest };
    await root.locator('[data-nav="2"]').click();
    const gates = await posted(page, '/api/v1/research/alphas/import/gates', () => root.locator('[data-action="run-gates"]').click());
    assert.equal(gates.body.all_pass, true, 'SEVEN_REAL_GATES_MUST_PASS');
    assert.equal(gates.body.gates?.length, 7);
    await page.waitForFunction(() => document.querySelectorAll('[data-screen="alpha-import"] [data-gate-state="PASS"]').length === 7);
    receipt.checks.gates = { status: gates.status, passed: 7, gate_receipt_id: gates.body.gate_receipt_id };
    await root.locator('[data-nav="3"]').click();
    await root.getByLabel('Alpha id').fill(alphaId);
    const registration = await posted(page, '/api/v1/research/alphas/import/register', () => root.locator('[data-action="register"]').click());
    assert.equal(registration.status, 201);
    assert.equal(registration.body.alpha_id, alphaId);
    assert.equal(registration.body.source_digest, receipt.source_sha256);
    assert.equal(registration.body.lifecycle_state, 'DRAFT');
    await root.locator(`[data-registration="${registration.body.alpha_version_id}"]`).waitFor();
    assert.equal(await root.locator('[data-chip]').getAttribute('data-chip'), 'DRAFT');
    receipt.checks.registration = { status: registration.status, alpha_version_id: registration.body.alpha_version_id,
      state: registration.body.lifecycle_state, revision: registration.body.alpha_revision };
    await root.locator('[data-action="activate"]').waitFor();
    const activatePath = `/api/v1/research/alphas/${registration.body.alpha_version_id}/activate`;
    const activation = await posted(page, activatePath, () => root.locator('[data-action="activate"]').click());
    assert.equal(activation.body.lifecycle_state, 'ACTIVE');
    assert(activation.body.alpha_revision > registration.body.alpha_revision, 'ACTIVATION_CAS_REVISION_REQUIRED');
    await root.locator('[data-chip="ACTIVE"]').waitFor();
    receipt.checks.activation = { status: activation.status, state: activation.body.lifecycle_state,
      revision: activation.body.alpha_revision };
    const registry = await owner.call('GET', `/api/v1/research/alphas?alpha_id=${alphaId}`);
    assert.equal(registry.body.entries.length, 1);
    assert.equal(registry.body.entries[0].alpha_version_id, registration.body.alpha_version_id);
    assert.equal(registry.body.entries[0].lifecycle_state, 'ACTIVE');
    receipt.checks.registry_readback = true;
    assert.deepEqual(receipt.writes, [
      'POST /api/v1/research/alphas/import/parse',
      'POST /api/v1/research/alphas/import/gates',
      'POST /api/v1/research/alphas/import/register',
      `POST ${activatePath}`,
    ], 'UNEXPECTED_BROWSER_WRITE');
    assert.deepEqual(receipt.page_errors, [], 'BROWSER_PAGE_ERROR');
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'IMPORT_CREATED_IMPLICIT_JOB');
    receipt.checks.no_implicit_job = true;
    receipt.scoped_passed = true;
    await context.close();
  } catch (error) {
    receipt.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    throw error;
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F5 S14 browser-real receipt', receipt.scoped_passed ? 'PASS' : 'FAIL', `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserImportReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f5-s14-browser-real',
    width: Number(process.argv.find(arg => arg.startsWith('--width='))?.slice(8) ?? 1280),
  }).catch(error => { console.error('P23 F5 S14 browser-real refused:', error.message); process.exitCode = 1; });
}
