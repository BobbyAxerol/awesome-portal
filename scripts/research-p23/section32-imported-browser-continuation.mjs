/** Real, GET-only product continuation before the API-created QA is disabled. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, docker } from './runtime-tools.mjs';
import { savePrivate } from './api-client.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const requireFrontend = createRequire(join(root, 'apps/portal/frontend/package.json'));
const digest = value => createHash('sha256').update(value).digest('hex');
const scoped = (path, workspace) => {
  const url = new URL(path, BASE_URL);
  assert.equal(url.origin, BASE_URL);
  url.searchParams.set('workspace_id', workspace);
  return url.pathname + url.search;
};
export function matchesNamedImportedResponse(url, method, status, runId, screen) {
  const parsed = new URL(url, BASE_URL);
  const family = screen === 'progress' ? 'research' : 'quantbt';
  return ['progress', 'report', 'release-candidate'].includes(screen)
    && parsed.origin === BASE_URL && method === 'GET' && status === 200
    && parsed.pathname === `/api/v1/${family}/runs/${runId}/${screen}`;
}

export async function importedBrowserContinuation({ home, user, runId, workspace,
  registration, report, compose, expectedImages }) {
  home = validateHome(home);
  assert.match(runId, /^rrun_[a-f0-9]{32}$/);
  assert.match(user.username, /^p23-reader-[0-9]{2}$/);
  assert.equal(typeof workspace, 'string'); assert(workspace.length > 0);
  assert.equal(registration.lifecycle_state, 'DRAFT');
  assert.equal(report.final_audit_applicable, false);
  assert.equal(compose.final_audit_applicable, false);
  assert.equal(compose.actions.may_seal, false);
  const images = {};
  for (const [key, service] of [['control', 'control-api'], ['web', 'portal-web'], ['python', 'portal-api'], ['worker', 'quant-worker-py']]) {
    const expected = expectedImages[key === 'worker' ? 'python' : key];
    assert.match(expected ?? '', /^sha256:[a-f0-9]{64}$/, `EXPECTED_IMAGE_REQUIRED:${key}`);
    const name = service === 'portal-web' ? `${PROJECT}-portal-web-1` : container(service);
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name]).trim(), PROJECT);
    images[key] = docker(['inspect', '--format', '{{.Image}}', name]).trim();
    assert.equal(images[key], expected, `FINAL_IMAGE_PIN_MISMATCH:${key}`);
  }
  const receipt = { schema_version: 'research.section32-imported-browser-continuation.v1',
    scope: 'API_IMPORT_GATES_DRAFT_PREFLIGHT_CREATE_THEN_REAL_BROWSER_PROGRESS_REPORT_RC_NOT_FULL_GUI_IMPORT',
    tested_at_utc: new Date().toISOString(), project: PROJECT, base_url: BASE_URL, run_id: runId,
    actor: user.username, workspace_id: workspace, alpha_version_id: registration.alpha_version_id,
    image_ids: images, status: 'FAIL', cells: [], requests: [], page_errors: [], console_errors: [],
    attempted_writes: [], responses: [], fixtures_or_mocking_used: false };
  const receiptPath = join(home, `section32-${user.username}-browser-continuation.json`);
  assert(!existsSync(receiptPath), 'PRIOR_BROWSER_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const { chromium } = requireFrontend('playwright');
  const browser = await chromium.launch({ headless: true });
  let context;
  try {
    context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { 'x-dev-access-email': `${user.username}@azdag.com` } });
    const login = await context.request.post('/api/auth/login', { headers: { origin: BASE_URL },
      data: { username: user.username, credential: user.password } });
    assert.equal(login.status(), 201, 'REAL_SAME_QA_LOGIN_REQUIRED');
    assert((await context.cookies()).some(cookie => cookie.name === '__Host-portal_session' && cookie.secure && cookie.httpOnly),
      'SECURE_HTTPONLY_SESSION_REQUIRED');
    const page = await context.newPage();
    const pending = new Set();
    let cell = null;
    page.on('pageerror', error => receipt.page_errors.push({ cell, message: String(error).slice(0, 500) }));
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) receipt.console_errors.push({ cell,
        message: message.text().slice(0, 500) });
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== BASE_URL) receipt.page_errors.push({ cell, message: 'OFF_ORIGIN_REQUEST' });
      if (!url.pathname.startsWith('/api/')) return;
      const fact = { cell, method: request.method(), path: url.pathname, workspace_id: url.searchParams.get('workspace_id') };
      receipt.requests.push(fact);
      if (request.method() !== 'GET') receipt.attempted_writes.push(fact);
    });
    // Prevent accidental publication/activation/other writes while allowing
    // untouched real named GETs. This is not a stub or replacement response.
    await page.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'));
    page.on('response', response => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith('/api/') || response.request().method() !== 'GET') return;
      const captured = cell;
      const job = response.json().then(body => {
        receipt.responses.push({ cell: captured, path: url.pathname, status: response.status(), body });
      }).catch(() => receipt.page_errors.push({ cell: captured, message: `NON_JSON_API:${url.pathname}` }));
      pending.add(job); job.finally(() => pending.delete(job));
    });
    for (const screen of ['progress', 'report', 'release-candidate']) {
      cell = screen;
      const target = join(home, `section32-${user.username}-${screen}.png`);
      assert(!existsSync(target), 'PRIOR_BROWSER_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
      const namedWait = page.waitForResponse(response => matchesNamedImportedResponse(
        response.url(), response.request().method(), response.status(), runId, screen), { timeout: 30000 });
      if (screen === 'release-candidate') {
        const link = page.locator('[data-screen="run-report"] [data-action="release-candidate"]');
        assert.equal(new URL(await link.getAttribute('href'), BASE_URL).searchParams.get('workspace_id'), workspace);
        await link.click();
        await page.waitForURL(url => url.pathname === `/research/quantbt/runs/${runId}/release-candidate`);
      } else await page.goto(scoped(`/research/quantbt/runs/${runId}/${screen}`, workspace), { waitUntil: 'domcontentloaded' });
      const selector = screen === 'progress' ? '[data-screen="run-progress"]'
        : screen === 'report' ? `[data-screen="run-report"][data-run="${runId}"]`
          : `[data-screen="release-candidate"][data-run="${runId}"][data-rc-mode="compose"]`;
      const element = page.locator(selector);
      await element.waitFor({ timeout: 30000 });
      const namedResponse = await namedWait;
      assert.equal(namedResponse.status(), 200, `REAL_NAMED_READ_REQUIRED:${screen}`);
      // Await the exact named API response body, never the HTML navigation
      // whose product pathname also ends with the same run/screen suffix.
      const named = { cell: screen, path: new URL(namedResponse.url()).pathname,
        status: namedResponse.status(), body: await namedResponse.json() };
      receipt.responses.push({ ...named, authority: 'EXACT_NAMED_RESPONSE_AWAITED' });
      if (screen !== 'progress') {
        await page.waitForFunction(({ selector, attribute }) => {
          const node = document.querySelector(selector);
          return node && !['loading', 'idle'].includes(node.getAttribute(attribute) ?? 'loading');
        }, { selector, attribute: screen === 'report' ? 'data-report-state' : 'data-rc-state' }, { timeout: 30000 });
        await page.locator('[data-linked-final-audit][data-audit-state="NOT_APPLICABLE"]').waitFor({ timeout: 30000 });
      }
      await Promise.all([...pending]);
      if (screen === 'progress') {
        assert.equal(named.body.current.effective_status, 'COMPLETED');
        assert.equal(named.body.current.terminal_materialization, 'READY');
        await element.locator('[data-status-pill="COMPLETED"]').waitFor({ timeout: 30000 });
      } else {
        assert.equal(named.body.final_audit_applicable, false);
        if (screen === 'report') {
          assert.equal(named.body.report_revision, report.report_revision);
          assert.equal(await element.getAttribute('data-report-revision'), report.report_revision);
          assert.equal(named.body.source_revision_scope, 'CAPTURED_READ_REPRESENTATION');
        } else {
          assert.equal(named.body.run.binding.alpha_version_id, registration.alpha_version_id);
          assert.equal(named.body.actions.may_seal, false);
          assert.equal(named.body.source_fingerprint, compose.source_fingerprint);
          assert.equal(await element.locator('[data-action="local-seal"]').getAttribute('data-seal-enabled'), 'false');
        }
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(overflow <= 1, `HORIZONTAL_OVERFLOW:${screen}:${overflow}`);
      await page.screenshot({ path: target, fullPage: true });
      chmodSync(target, 0o600);
      receipt.cells.push({ screen, status: 'PASS', api_status: named.status, response_sha256: digest(JSON.stringify(named.body)),
        screenshot: target, screenshot_sha256: digest(readFileSync(target)), overflow_px: overflow });
    }
    await Promise.all([...pending]);
    assert.deepEqual(receipt.attempted_writes, [], 'NO_BROWSER_PRODUCT_WRITES');
    assert.deepEqual(receipt.page_errors, [], 'NO_BROWSER_PAGE_ERRORS');
    assert.deepEqual(receipt.console_errors, [], 'NO_BROWSER_CONSOLE_ERRORS_OR_WARNINGS');
    assert.equal(receipt.requests.filter(row => row.path.endsWith('/final-audit')).length, 0,
      'DRAFT_NON_APPLICABLE_AUDIT_MUST_NOT_BE_FETCHED');
    receipt.status = 'PASS';
    return receipt;
  } catch (error) {
    receipt.error = { message: String(error.message).slice(0, 800) };
    throw error;
  } finally {
    savePrivate(receiptPath, receipt);
    await context?.close(); await browser.close();
  }
}
