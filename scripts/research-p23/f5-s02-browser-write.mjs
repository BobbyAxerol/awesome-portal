#!/usr/bin/env node
/** F5: real S02 clone/preflight/create through the owned P23 browser gateway. */
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

async function posted(page, path, action) {
  const pending = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === BASE_URL && url.pathname === path && response.request().method() === 'POST';
  }, { timeout: 45000 });
  await action();
  const response = await pending;
  const body = await response.json();
  assert(response.ok(), `S02_WRITE_REFUSED:${path}:${response.status()}:${body.error?.code ?? 'UNKNOWN'}`);
  return { status: response.status(), body, request: JSON.parse(response.request().postData() ?? '{}') };
}

export async function browserCreateReceipt({ home = DEFAULT_HOME, cloneRun, label = 'f5-s02-browser-real',
  width = 1280, diagnostic = false } = {}) {
  home = validateHome(home);
  assert(/^rrun_[a-z0-9]{16,64}$/.test(cloneRun ?? ''), 'OWNED_CLONE_RUN_REQUIRED');
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  assert([660, 1280].includes(width), 'PINNED_BROWSER_VIEWPORT_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F5_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL
    && Object.keys(identity.images).length === 7, 'OWNED_PINNED_CELL_REQUIRED');
  assert(!identity.dirty || diagnostic, 'CLEAN_PINNED_CELL_REQUIRED');
  const sessions = privateJson(join(home, 'sessions.json'));
  const user = sessions.identities.find(entry => entry.username === 'p23-owner');
  assert(user?.password && sessions.preparation_complete, 'OWNED_TEST_LOGIN_REQUIRED');
  const owner = await operatorClient(home);
  const source = await owner.call('GET', `/api/v1/research/runs/${cloneRun}/requested-spec`);
  assert.equal(source.body.run_id, cloneRun);
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const receipt = {
    schema_version: 'research.p23-f5-s02-browser-write.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha, identity_dirty: identity.dirty,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), viewport: { width, height: 900 }, clone_run_id: cloneRun,
    clone_spec_sha256: sha256(JSON.stringify(source.body.requested_spec)), jobs_before: jobCount(workspace),
    writes: [], page_errors: [], checks: {}, diagnostic_only: diagnostic,
    scope: 'OWNED_CELL_REAL_BROWSER_S02_CLONE_PREFLIGHT_CREATE',
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
      if (url.origin === BASE_URL && url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()))
        receipt.writes.push(`${request.method()} ${url.pathname}`);
    });
    const login = await page.request.post('/api/auth/login', {
      data: { username: user.username, credential: user.password }, headers: { origin: BASE_URL },
    });
    assert.equal(login.status(), 201, 'OWNED_REAL_LOGIN_REQUIRED');
    await page.goto(`/research/quantbt/runs/new?from=${encodeURIComponent(cloneRun)}&step=review`);
    const root = page.locator('[data-screen="new-run"]');
    await root.waitFor({ timeout: 30000 });
    await root.locator(`[data-clone-source="${cloneRun}"][data-clone-state="available"]`).waitFor({ timeout: 30000 });
    await page.waitForFunction(() => {
      const action = document.querySelector('[data-screen="new-run"] [data-action="preflight"]');
      return action instanceof HTMLButtonElement && !action.disabled;
    }, { timeout: 30000 });
    assert.equal(await root.locator('[data-blocking]').count(), 0, 'COPIED_DECLARATION_BLOCKED');
    const preflight = await posted(page, '/api/v1/research/preflights', () => root.locator('[data-action="preflight"]').click());
    assert.equal(preflight.status, 201);
    assert.equal(preflight.body.may_create_run, true, 'REAL_PREFLIGHT_MAY_NOT_CREATE');
    receipt.checks.preflight = { status: preflight.status, token_issued: Boolean(preflight.body.preflight_token),
      requested_spec_sha256: sha256(JSON.stringify(preflight.request.requested_spec)) };
    await root.locator('[data-may-create="true"]').waitFor({ timeout: 30000 });
    const create = await posted(page, '/api/v1/research/runs', () => root.locator('[data-action="create-run"]').click());
    assert.equal(create.status, 202);
    assert.deepEqual(create.request.requested_spec, preflight.request.requested_spec,
      'BROWSER_CHANGED_SPEC_BETWEEN_PREFLIGHT_AND_CREATE');
    assert.equal(create.request.preflight_token, preflight.body.preflight_token);
    assert.equal(create.request.lineage?.relation, 'CLONE_OF', 'CLONE_LINEAGE_NOT_SENT');
    assert.equal(create.request.lineage?.parent_run_id, cloneRun, 'CLONE_PARENT_MISMATCH');
    assert(/^rrun_[a-z0-9]{16,64}$/.test(create.body.run_id ?? ''), 'DURABLE_RUN_ID_REQUIRED');
    receipt.run_id = create.body.run_id;
    receipt.checks.create = { status: create.status, run_id: create.body.run_id,
      replayed: create.body.replayed, client_intent_id: create.request.client_intent_id,
      requested_spec_sha256: sha256(JSON.stringify(create.request.requested_spec)) };
    await page.waitForURL(url => url.pathname === `/research/quantbt/runs/${create.body.run_id}/progress`,
      { timeout: 30000 });
    receipt.checks.progress_route = true;
    assert.deepEqual(receipt.writes, ['POST /api/v1/research/preflights', 'POST /api/v1/research/runs'],
      'UNEXPECTED_BROWSER_WRITE');
    assert.deepEqual(receipt.page_errors, [], 'BROWSER_PAGE_ERROR');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `HORIZONTAL_OVERFLOW:${overflow}`);
    receipt.checks.viewport_overflow_px = overflow;
    receipt.jobs_after = jobCount(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before + 1, 'EXACTLY_ONE_DURABLE_JOB_REQUIRED');
    const progress = await owner.call('GET', `/api/v1/research/runs/${create.body.run_id}/progress`);
    assert.equal(progress.body.run_id, create.body.run_id);
    receipt.checks.progress_readback = { status: progress.status,
      effective_status: progress.body.current.effective_status };
    let final = progress.body;
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(final.current.effective_status)) {
      await new Promise(resolve => setTimeout(resolve, 2500));
      final = (await owner.call('GET', `/api/v1/research/runs/${create.body.run_id}/progress`)).body;
    }
    assert.equal(final.current.effective_status, 'COMPLETED', 'BROWSER_CREATED_RUN_NOT_COMPLETED');
    assert.equal(final.current.terminal_materialization, 'READY', 'BROWSER_CREATED_RUN_NOT_MATERIALIZED');
    receipt.checks.terminal = { status: final.current.effective_status,
      materialization: final.current.terminal_materialization };
    receipt.scoped_passed = !diagnostic;
    await context.close();
  } catch (error) {
    receipt.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    throw error;
  } finally {
    receipt.jobs_after ??= jobCount(workspace);
    savePrivate(target, receipt);
    await browser?.close();
    console.log('P23 F5 S02 browser-real receipt', receipt.scoped_passed ? 'PASS' : diagnostic ? 'DIAGNOSTIC' : 'FAIL',
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  browserCreateReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    cloneRun: process.argv.find(arg => arg.startsWith('--clone-run='))?.slice(12),
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f5-s02-browser-real',
    width: Number(process.argv.find(arg => arg.startsWith('--width='))?.slice(8) ?? 1280),
    diagnostic: process.argv.includes('--diagnostic'),
  }).catch(error => { console.error('P23 F5 S02 browser-real refused:', error.message); process.exitCode = 1; });
}
