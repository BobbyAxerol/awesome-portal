#!/usr/bin/env node
/** GET-only affected consumer / S06 concurrent-read receipt, one browser. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BASE_URL, PROJECT, validateHome } from '../research-p23/cell.mjs';
import { container, dbQuery, docker } from '../research-p23/runtime-tools.mjs';
import { privateRead, safeRecordedPath } from './p24-scenario-closeout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const byteHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const RUN_ID = /^rrun_[a-f0-9]{32}$/;
const IMAGE_ID = /^sha256:[a-f0-9]{64}$/;
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);

export function requireConsumerConfig(config, expected = {}) {
  assert.equal(config.project, PROJECT, 'OWNED_PROJECT_REQUIRED');
  assert.equal(config.base_url, BASE_URL, 'OWNED_8096_ONLY');
  assert.equal(config.origin, BASE_URL, 'SAME_ORIGIN_REQUIRED');
  assert.match(config.username, /^p23-reader-[0-9]{2}$/, 'TEMPORARY_QA_REQUIRED');
  assert.equal(typeof config.workspace_id, 'string');
  assert(config.workspace_id.length > 0, 'WORKSPACE_REQUIRED');
  for (const lane of ['fixed', 'causal', 'global']) assert.match(config.runs?.[lane] ?? '', RUN_ID, `RUN_REQUIRED:${lane}`);
  const images = { ...config.expected_images, ...expected };
  for (const service of ['control-api', 'portal-web']) assert.match(images[service] ?? '', IMAGE_ID, `FINAL_IMAGE_PIN_REQUIRED:${service}`);
  return { ...config, expected_images: images };
}
export const expectedAuditReads = applicable => applicable === true ? 1 : 0;
export function manifestFacts(run) {
  return { source: run.provenance.source_manifest_digest ?? null,
    preflight: run.provenance.manifest_digest ?? null,
    preflight_scope: run.provenance.manifest_digest_scope ?? null };
}
export function loadPaths(run, workspace) {
  assert.match(run, RUN_ID);
  const scope = encodeURIComponent(workspace);
  return [`/api/v1/quantbt/runs?ids=${run}&limit=1&workspace_id=${scope}`,
    `/api/v1/research/runs/${run}/progress?workspace_id=${scope}`];
}
export function readonlyDeclarationRequest(request) {
  return request.cell === 'new-run-clone-scoped' && request.method === 'POST'
    && request.path?.split('?')[0] === '/api/v1/research/datasets/declaration-estimates';
}
export function workspaceBoundRead(path) {
  const pathname = new URL(path, BASE_URL).pathname;
  return pathname.startsWith('/api/v1/research/') || pathname === '/api/v1/quantbt/runs' || pathname.startsWith('/api/v1/quantbt/runs/');
}
export function assertNoApiWrites(requests, allowDeclarationRead = false) {
  assert.deepEqual(requests.filter(request => request.method !== 'GET'
    && !(allowDeclarationRead && readonlyDeclarationRequest(request))), [], 'NO_PRODUCT_API_WRITES');
}
/** Preserve the hash cursor when adding explicit workspace scope. */
export function scopedHref(path, workspace) {
  assert(path.startsWith('/') && !path.startsWith('//'), 'LOCAL_NAMED_ROUTE_REQUIRED');
  const url = new URL(path, BASE_URL);
  url.searchParams.set('workspace_id', workspace);
  return url.pathname + url.search + url.hash;
}
/** A typed non-applicability reply is visible product state, not a JS failure. */
export function expectedRefusalConsole(message, responses) {
  return message.message.startsWith('Failed to load resource')
    && responses.some(response => response.path === message.path
      && response.cell === message.cell
      && response.status === 409 && response.code === 'RESEARCH_FINAL_AUDIT_NOT_APPLICABLE'
      && response.path.split('?')[0].endsWith('/final-audit'));
}
function writeReceipt(path, value) {
  assert(!existsSync(path) || !lstatSync(path).isSymbolicLink(), 'RECEIPT_SYMLINK_REFUSED');
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(path, 0o600);
}
function custody() {
  return Object.fromEntries(['jobs', 'selection_records', 'current_source_seals_v1',
    'run_report_manifests_v1', 'release_candidate_packs_v1', 'release_candidate_publications_v1']
    .map(table => [table, dbQuery(`SELECT count(*)::int AS rows,
      md5(coalesce(string_agg(to_jsonb(row)::text, E'\\n' ORDER BY to_jsonb(row)::text), '')) AS digest
      FROM research.${table} row`).rows[0]]));
}
function binding(config, lane) {
  const runId = config.runs[lane];
  const known = Object.values(config.run_bindings ?? {}).find(value => value.run_id === runId);
  return { run_id: runId, workspace_id: known?.workspace_id ?? config.workspace_id };
}

async function main() {
  const configPath = arg('config');
  assert(configPath, 'PRIVATE_CONFIG_REQUIRED');
  const expected = {};
  if (arg('expected-control')) expected['control-api'] = arg('expected-control');
  if (arg('expected-web')) expected['portal-web'] = arg('expected-web');
  const config = requireConsumerConfig(JSON.parse(privateRead(configPath)), expected);
  const selectedCells = arg('cells') ? new Set(arg('cells').split(',').filter(Boolean)) : null;
  if (selectedCells) for (const id of selectedCells) assert(['library-filter-workspace', 'evidence-deep-link-scoped', 'cold-stage-shell-label-scope'].includes(id), 'ONLY_AFFECTED_SCOPE_RETAKES_ADMITTED');
  const out = validateHome(arg('out') ?? config.consumer_out ?? join(dirname(configPath), 'p24-consumer-real'));
  mkdirSync(out, { recursive: true, mode: 0o700 }); chmodSync(out, 0o700);
  assert(!existsSync(join(out, 'p24-consumer-real-receipt.json')), 'PRIOR_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const { chromium, expect } = await import(pathToFileURL(config.playwright_module ?? join(ROOT, 'apps/portal/frontend/node_modules/@playwright/test/index.mjs')).href);
  const webName = `${PROJECT}-portal-web-1`;
  assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', webName]).trim(), PROJECT);
  const images = { 'control-api': docker(['inspect', '--format', '{{.Image}}', container('control-api')]).trim(),
    'portal-web': docker(['inspect', '--format', '{{.Image}}', webName]).trim() };
  for (const service of Object.keys(images)) assert.equal(images[service], config.expected_images[service], `FINAL_IMAGE_MISMATCH:${service}`);
  const receipt = { schema_version: 'research.p24-consumer-real.v1', started_at_utc: new Date().toISOString(),
    source_sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    source_dirty: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0,
    harness_sha256: byteHash(readFileSync(fileURLToPath(import.meta.url))), images, actor: config.username,
    lane: 'REAL_API_E2E_RECEIPT', scope: selectedCells ? 'AFFECTED_SCOPE_ONLY_RETAKE_NO_LOAD_OR_PRIOR_PASS_REPEAT' : '20_AFFECTED_CONSUMER_CELLS_AND_S06_TWENTY_CONCURRENT_READ_LANES_NOT_FULL_228_GATE',
    allowed_read_post: { operation: 'researchDeclarationEstimatePostV1', path: '/api/v1/research/datasets/declaration-estimates',
      scope: 'new-run-clone-scoped only', proof: 'dataset-index.controller.ts:67-103 and routes_research_internal.py:163-185: authenticated scope/Alpha/Atlas/index reads plus bounded metadata-only estimate cache; no preflight token/job/seal/publication write' },
    status: 'FAIL', cells: [], requests: [], page_errors: [], console_errors: [], attempted_api_writes: [], failures: [],
    auth_cleanup: 'ROOT_REVOKES_AND_DISABLES_SHARED_EPHEMERAL_QA_AFTER_ALL_COORDINATED_LANES' };
  const before = custody(); receipt.custody_before = before;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-dev-access-email': `${config.username}@azdag.com` } });
  const page = await context.newPage();
  const responseJobs = new Set();
  let cellId = null;
  page.on('request', request => {
    if (!new URL(request.url()).pathname.startsWith('/api/')) return;
    const record = { cell: cellId, method: request.method(), path: safeRecordedPath(request.url()) };
    receipt.requests.push(record);
    if (request.method() !== 'GET' && !readonlyDeclarationRequest(record)) receipt.attempted_api_writes.push(record);
    if (readonlyDeclarationRequest(record)) {
      record.operation = 'researchDeclarationEstimatePostV1';
      try { record.workspace_id = request.postDataJSON()?.workspace_id ?? null; } catch { record.workspace_id = null; }
    }
  });
  page.on('response', response => {
    if (!new URL(response.url()).pathname.startsWith('/api/') || response.status() < 400) return;
    const capturedCell = cellId;
    const pending = response.json().catch(() => null).then(body => {
      receipt.requests.push({ cell: capturedCell, method: response.request().method(), path: safeRecordedPath(response.url()),
        status: response.status(), code: body?.error?.code ?? 'UNTYPED' });
    });
    responseJobs.add(pending); pending.finally(() => responseJobs.delete(pending));
  });
  page.on('pageerror', error => receipt.page_errors.push({ cell: cellId, message: String(error).slice(0, 500) }));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') receipt.console_errors.push({ cell: cellId,
      message: message.text().slice(0, 300), path: message.location().url ? safeRecordedPath(message.location().url) : null });
  });
  await page.route('**/api/**', route => route.request().method() === 'GET'
    || readonlyDeclarationRequest({ cell: cellId, method: route.request().method(), path: new URL(route.request().url()).pathname })
    ? route.continue() : route.abort('blockedbyclient'));
  const scope = scopedHref;
  let apiCookie;
  const get = async path => {
    assert(path.startsWith('/api/'), 'NAMED_API_GET_ONLY');
    assert(apiCookie, 'OWNED_BROWSER_SESSION_REQUIRED');
    const response = await context.request.get(`${BASE_URL}${path}`, { headers: { cookie: apiCookie }, timeout: 30000 });
    const body = await response.json();
    assert.equal(response.status(), 200, `READ_FAILED:${safeRecordedPath(path)}:${response.status()}:${body.error?.code ?? 'UNKNOWN'}`);
    return body;
  };
  const probe = async (id, body) => {
    if (selectedCells && !selectedCells.has(id)) return;
    cellId = id;
    const started = Date.now(), errorCount = receipt.page_errors.length, consoleOffset = receipt.console_errors.length;
    const cell = { id, status: 'FAIL' }; receipt.cells.push(cell);
    try {
      await body(cell);
      await Promise.all([...responseJobs]);
      assert.equal(receipt.page_errors.length, errorCount, 'NO_BROWSER_PAGE_ERROR');
      const noise = receipt.console_errors.slice(consoleOffset);
      cell.expected_typed_refusal_console = noise.filter(message => expectedRefusalConsole(message, receipt.requests));
      assert.deepEqual(noise.filter(message => !expectedRefusalConsole(message, receipt.requests)), [], 'NO_UNEXPECTED_CONSOLE_ERROR_OR_WARNING');
      assertNoApiWrites(receipt.requests, true);
      cell.status = 'PASS';
      await page.screenshot({ path: join(out, `${id}.png`), fullPage: true });
    } catch (error) {
      cell.reason = String(error.message).slice(0, 800); receipt.failures.push({ id, reason: cell.reason });
      await page.screenshot({ path: join(out, `${id}-failed.png`), fullPage: true }).catch(() => {});
    } finally {
      cell.elapsed_ms = Date.now() - started;
      writeReceipt(join(out, 'p24-consumer-real-receipt.json'), receipt);
      cellId = null;
    }
  };
  try {
    const login = await context.request.post(`${BASE_URL}/api/auth/login`, { headers: { origin: config.origin },
      data: { username: config.username, credential: config.user?.password ?? privateRead(config.credential_path).trim() } });
    assert(login.ok(), `EPHEMERAL_QA_LOGIN_FAILED:${login.status()}`);
    // Chromium treats this owned loopback as secure; APIRequestContext does
    // not automatically send Secure __Host cookies over its HTTP transport.
    // Reuse only this owned context's real session; never weaken server flags
    // or persist cookie values in the receipt/config.
    const cookies = await context.cookies();
    assert(cookies.some(cookie => cookie.name === '__Host-portal_session' && cookie.secure && cookie.httpOnly), 'REAL_SECURE_HTTPONLY_SESSION_REQUIRED');
    assert(cookies.every(cookie => cookie.domain === new URL(BASE_URL).hostname), 'OWNED_COOKIE_DOMAIN_REQUIRED');
    apiCookie = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    if (!selectedCells) {
      const bootstrapBinding = binding(config, 'global');
      await page.goto(`${BASE_URL}${scope('/research/quantbt/runs', bootstrapBinding.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      receipt.bundles = await page.locator('script[src*="/assets/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    }
    for (const lane of ['fixed', 'causal', 'global']) {
      const bound = binding(config, lane);
      for (const width of [1280, 660]) for (const screen of ['report', 'release-candidate']) {
        await probe(`${lane}-${screen}-${width}`, async cell => {
          const dto = await get(scope(`/api/v1/quantbt/runs/${bound.run_id}/${screen}`, bound.workspace_id));
          const applicable = dto.final_audit_applicable;
          assert([true, false, null, undefined].includes(applicable), 'APPLICABILITY_MUST_BE_TYPED');
          cell.applicability = applicable ?? null;
          const offset = receipt.requests.length;
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${BASE_URL}${scope(`/research/quantbt/runs/${bound.run_id}/${screen}`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('[data-linked-final-audit]')).toBeVisible({ timeout: 30000 });
          await expect.poll(async () => page.locator('[data-linked-final-audit]').getAttribute('data-audit-state'), { timeout: 30000 }).not.toBe('loading');
          await page.waitForLoadState('networkidle', { timeout: 30000 });
          const audits = receipt.requests.slice(offset).filter(request => request.method === 'GET' && request.path.split('?')[0].endsWith('/final-audit') && request.status === undefined);
          assert.equal(audits.length, expectedAuditReads(applicable), 'AUDIT_GET_EXACT_APPLICABILITY');
          cell.audit_get_count = audits.length;
          assert.equal(await page.locator('[data-action="confirm-linked-audit"]').count(), 0, 'NO_AUTOMATIC_AUDIT_CONFIRMATION');
          const state = await page.locator('[data-linked-final-audit]').getAttribute('data-audit-state');
          if (applicable !== true) assert.equal(state, applicable === false ? 'NOT_APPLICABLE' : 'NOT_PUBLISHED');
          cell.audit_state = state;
          cell.overflow_px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert(cell.overflow_px <= 1, 'NO_HORIZONTAL_OVERFLOW');
        });
      }
    }
    const bound = binding(config, 'global');
    let sourceAlpha;
    const assertOutgoingScope = async (workspace, cell) => {
      const inventory = await page.locator('a[href^="/research/quantbt/"]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute('href'), in_screen: node.closest('[data-screen]') !== null })));
      if (cell) cell.outgoing_scope_inventory = inventory.map(link => ({ path: safeRecordedPath(link.href), in_screen: link.in_screen, has_workspace: new URL(link.href, BASE_URL).searchParams.get('workspace_id') === workspace }));
      const links = inventory.map(link => link.href);
      assert(links.length > 0, 'NAMED_RESEARCH_LINKS_REQUIRED');
      for (const href of links) assert.equal(new URL(href, BASE_URL).searchParams.get('workspace_id'), workspace, `OUTGOING_LINK_WORKSPACE_REQUIRED:${safeRecordedPath(href)}`);
      return links.length;
    };
    if (selectedCells?.has('cold-stage-shell-label-scope')) await probe('cold-stage-shell-label-scope', async cell => {
      const fixed = binding(config, 'fixed');
      const library = await get(scope(`/api/v1/quantbt/runs?ids=${fixed.run_id}&limit=1`, fixed.workspace_id));
      const expectedLabel = library.items.find(row => row.run_id === fixed.run_id)?.display_label;
      assert(expectedLabel, 'PUBLISHED_FIXED_RUN_LABEL_REQUIRED');
      const offset = receipt.requests.length;
      await page.setViewportSize({ width: 1280, height: 900 });
      // No Library/browser navigation has primed the client label registry:
      // this is a cold product deep link, not a cached-label demonstration.
      await page.goto(`${BASE_URL}${scope(`/research/quantbt/runs/${fixed.run_id}/split`, fixed.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-screen="split-detail"]')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('.portal-breadcrumbs a.mono')).toHaveText(expectedLabel, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const reads = receipt.requests.slice(offset).filter(read => read.status === undefined && read.method === 'GET');
      const labelReads = reads.filter(read => {
        const url = new URL(read.path, BASE_URL);
        return url.pathname === '/api/v1/quantbt/runs' && url.searchParams.get('ids') === fixed.run_id;
      });
      // The fixed retained lane renders two existing independent readers:
      // TopBar/useRunLabelRead names it; StageRunBar/useRunStatus reads status.
      // Both use the same bounded list-by-id operation, so network records
      // must not be mislabelled as two shell requests or deduped by the test.
      assert.equal(labelReads.length, 2, 'EXACT_COLD_READERS_SHELL_LABEL_AND_STAGE_STATUS');
      for (const read of reads.filter(read => workspaceBoundRead(read.path))) assert.equal(new URL(read.path, BASE_URL).searchParams.get('workspace_id'), fixed.workspace_id, 'COLD_STAGE_READER_SCOPE');
      cell.label_status_read_count = labelReads.length;
      cell.read_owners = ['TopBar/useRunLabelRead', 'SplitDetail/StageRunBar/useRunStatus'];
      cell.reads_checked = reads.length;
      cell.outgoing_links_checked = await assertOutgoingScope(fixed.workspace_id, cell);
    });
    await probe('library-filter-workspace', async cell => {
      const offset = receipt.requests.length;
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE_URL}${scope('/research/quantbt/runs', bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-screen="run-library"]')).toBeVisible({ timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      await page.getByPlaceholder('run id, alpha, symbol').fill('p24-no-matching-run-for-filter-scope');
      await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 30000 }).toBe('p24-no-matching-run-for-filter-scope');
      assert.equal(new URL(page.url()).searchParams.get('workspace_id'), bound.workspace_id, 'FILTER_REWRITE_RETAINS_SCOPE');
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      await page.getByRole('button', { name: 'clear filters', exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 30000 }).toBe(null);
      assert.equal(new URL(page.url()).searchParams.get('workspace_id'), bound.workspace_id, 'CLEAR_RETAINS_SCOPE');
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const reads = receipt.requests.slice(offset).filter(request => request.status === undefined && request.method === 'GET');
      for (const read of reads.filter(read => workspaceBoundRead(read.path))) assert.equal(new URL(read.path, BASE_URL).searchParams.get('workspace_id'), bound.workspace_id, 'LIBRARY_READER_SCOPE');
      cell.reads_checked = reads.length; cell.outgoing_links_checked = await assertOutgoingScope(bound.workspace_id, cell);
    });
    await probe('new-run-clone-scoped', async cell => {
      const offset = receipt.requests.length;
      await page.goto(`${BASE_URL}${scope(`/research/quantbt/runs/new?from=${bound.run_id}`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-screen="new-run"]')).toBeVisible({ timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const reads = receipt.requests.slice(offset).filter(request => request.status === undefined && request.method === 'GET');
      assert(reads.some(read => read.path.split('?')[0].endsWith('/requested-spec')), 'CLONE_READ_REQUIRED');
      for (const read of reads.filter(read => workspaceBoundRead(read.path))) assert.equal(new URL(read.path, BASE_URL).searchParams.get('workspace_id'), bound.workspace_id, 'CLONE_READER_SCOPE');
      cell.reads_checked = reads.length;
      const estimateReads = receipt.requests.slice(offset).filter(readonlyDeclarationRequest);
      for (const read of estimateReads) assert.equal(read.workspace_id, bound.workspace_id, 'DECLARATION_ESTIMATE_POST_SCOPE');
      cell.declaration_estimate_read_posts = estimateReads.length;
      cell.outgoing_links_checked = await assertOutgoingScope(bound.workspace_id);
      await page.locator('[data-action="start-over"]').click();
      await expect.poll(() => new URL(page.url()).searchParams.get('from'), { timeout: 30000 }).toBe(null);
      assert.equal(new URL(page.url()).searchParams.get('workspace_id'), bound.workspace_id, 'START_OVER_RETAINS_SCOPE');
      await page.waitForLoadState('networkidle', { timeout: 30000 });
    });
    await probe('evidence-deep-link-scoped', async cell => {
      const offset = receipt.requests.length;
      await page.goto(`${BASE_URL}${scope(`/research/quantbt/runs/${bound.run_id}/evidence`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-screen="evidence-flow"]:not([data-run-not-found])')).toBeVisible({ timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const reads = receipt.requests.slice(offset).filter(request => request.status === undefined && request.method === 'GET');
      assert(reads.some(read => read.path.split('?')[0].endsWith('/evidence')), 'EVIDENCE_READ_REQUIRED');
      for (const read of reads.filter(read => workspaceBoundRead(read.path))) assert.equal(new URL(read.path, BASE_URL).searchParams.get('workspace_id'), bound.workspace_id, 'EVIDENCE_READER_SCOPE');
      cell.reads_checked = reads.length; cell.outgoing_links_checked = await assertOutgoingScope(bound.workspace_id, cell);
    });
    await probe('compare-manifest-scope', async cell => {
      const library = await get(scope(`/api/v1/quantbt/runs?ids=${bound.run_id}&limit=1`, bound.workspace_id));
      const row = library.items.find(value => value.run_id === bound.run_id);
      const alpha = row?.binding?.alpha_id;
      assert(alpha, 'SOURCE_ALPHA_ID_REQUIRED');
      sourceAlpha = alpha;
      const body = await get(scope(`/api/v1/research/alphas/${encodeURIComponent(alpha)}/compare?mode=attempts`, bound.workspace_id));
      assert.equal(body.result.mode, 'attempts');
      const offset = receipt.requests.length;
      await page.goto(`${BASE_URL}${scope(`/research/quantbt/alphas/${encodeURIComponent(alpha)}/compare?mode=attempts`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      // Unclaimed attempts are intentionally collapsed and have no RunLine
      // provenance tooltip. Do not force them onto the accepted claim ladder.
      const readyClaimed = body.result.attempts.filter(value => value.run_state === 'READY' && value.claim.family !== 'NOT_PUBLISHED');
      for (const run of readyClaimed) {
        const line = page.locator(`[data-ladder-run="${run.run_id}"] [data-run-line]`);
        await expect(line).toBeVisible({ timeout: 30000 });
        const facts = manifestFacts(run);
        assert.equal(await line.getAttribute('data-source-manifest-digest'), facts.source);
        assert.equal(await line.getAttribute('data-preflight-manifest-digest'), facts.preflight);
        assert.equal(await line.getAttribute('data-preflight-manifest-scope'), facts.preflight_scope);
        assert.equal((await line.getAttribute('title')).includes(`retained artifact manifest ${facts.source ?? 'not published'}`), true);
        assert.equal((await line.getAttribute('title')).includes(`preflight dataset/spec manifest ${facts.preflight ?? 'not published'}`), true);
      }
      const reads = receipt.requests.slice(offset).filter(request => request.status === undefined
        && request.method === 'GET' && new URL(request.path, BASE_URL).pathname.endsWith('/compare'));
      assert.equal(reads.length, 1, 'ONE_NAMED_COMPARE_READ');
      assert.equal(new URL(reads[0].path, BASE_URL).searchParams.get('workspace_id'), bound.workspace_id, 'COMPARE_WORKSPACE_MUST_MATCH_DEEP_LINK');
      cell.outgoing_links_checked = await assertOutgoingScope(bound.workspace_id);
      cell.attempts_returned = body.result.attempts.length;
      cell.unclaimed_not_on_ladder = body.result.attempts.filter(value => value.claim.family === 'NOT_PUBLISHED').length;
      cell.attempts_checked = readyClaimed.length;
      assert(cell.attempts_checked > 0, 'NONEMPTY_COMPARE_REQUIRED');
    });
    await probe('lineage-workspace-and-links', async cell => {
      assert(sourceAlpha, 'SOURCE_ALPHA_ID_REQUIRED');
      const offset = receipt.requests.length;
      await page.goto(`${BASE_URL}${scope(`/research/quantbt/alphas/${encodeURIComponent(sourceAlpha)}/lineage`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
      const root = page.locator('[data-screen="attempt-lineage"]');
      await expect(root).toBeVisible({ timeout: 30000 });
      await expect.poll(() => root.getAttribute('data-lineage-state'), { timeout: 30000 }).not.toBe('loading');
      assert(['available', 'partial'].includes(await root.getAttribute('data-lineage-state')), 'CURRENT_LINEAGE_REQUIRED');
      await page.waitForLoadState('networkidle', { timeout: 30000 });
      const reads = receipt.requests.slice(offset).filter(request => request.status === undefined
        && request.method === 'GET' && new URL(request.path, BASE_URL).pathname.endsWith('/lineage'));
      assert.equal(reads.length, 1, 'ONE_NAMED_LINEAGE_READ');
      assert.equal(new URL(reads[0].path, BASE_URL).searchParams.get('workspace_id'), bound.workspace_id, 'LINEAGE_WORKSPACE_MUST_MATCH_DEEP_LINK');
      cell.outgoing_links_checked = await assertOutgoingScope(bound.workspace_id);
    });
    for (let round = 1; round <= 3; round++) await probe(`s06-mobile-concurrent-read-${round}`, async cell => {
      await page.setViewportSize({ width: 660, height: 900 });
      const requests = loadPaths(bound.run_id, bound.workspace_id);
      const load = Promise.all(Array.from({ length: 20 }, async (_, reader) => {
        const samples = [];
        for (let read = 0; read < 4; read++) {
          const started = Date.now();
          try {
            const response = await context.request.get(`${BASE_URL}${requests[(reader + read) % requests.length]}`, { headers: { cookie: apiCookie }, timeout: 30000 });
            const body = await response.json();
            samples.push({ status: response.status(), code: body.error?.code ?? null, elapsed_ms: Date.now() - started });
          } catch (error) {
            samples.push({ status: 0, code: error.name, elapsed_ms: Date.now() - started });
          }
        }
        return samples;
      }));
      try {
        await page.goto(`${BASE_URL}${scope(`/research/quantbt/runs/${bound.run_id}/search#fold=3`, bound.workspace_id)}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-screen="search-detail"]')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('[data-readiness="READY"]').first()).toBeVisible({ timeout: 30000 });
        await expect(page.locator('[data-role-card="selected"] [data-role-row]')).toHaveCount(4, { timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 30000 });
        cell.overflow_px = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert(cell.overflow_px <= 1, 'S06_MOBILE_HORIZONTAL_OVERFLOW');
      } finally {
        cell.load_results = (await load).flat();
        assert.equal(cell.load_results.length, 80);
        assert(cell.load_results.every(sample => sample.status === 200), 'S06_MIXED_READS_ALL_200');
        cell.read_concurrency = 20; cell.distinct_principals = 1;
      }
    });
    receipt.custody_after = custody();
    assert.deepEqual(receipt.custody_after, before, 'NO_JOB_SELECTION_SEAL_PACK_PUBLICATION_MUTATION');
    assertNoApiWrites(receipt.requests, true);
    assert.deepEqual(receipt.page_errors, [], 'NO_BROWSER_PAGE_ERROR_ON_CANDIDATE');
    assert.deepEqual(receipt.console_errors.filter(message => !expectedRefusalConsole(message, receipt.requests)), [], 'NO_UNEXPECTED_CANDIDATE_CONSOLE_NOISE');
    receipt.status = receipt.failures.length ? 'FAIL' : 'SCOPED_PASS';
  } catch (error) {
    receipt.failures.push({ id: 'candidate-oracle', reason: String(error.message).slice(0, 800) });
    process.exitCode = 1;
  } finally {
    receipt.finished_at_utc = new Date().toISOString();
    await Promise.all([...responseJobs]);
    receipt.bundles ??= await page.locator('script[src*="/assets/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src'))).catch(() => []);
    await context.close(); await browser.close();
    writeReceipt(join(out, 'p24-consumer-real-receipt.json'), receipt);
  }
  if (receipt.failures.length) process.exitCode = 1;
  console.log(JSON.stringify({ status: receipt.status, cells: receipt.cells.length, failures: receipt.failures.length,
    receipt_sha256: byteHash(readFileSync(join(out, 'p24-consumer-real-receipt.json'))), scope: receipt.scope }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`P24_CONSUMER_HARNESS_REFUSED:${String(error.message).slice(0, 600)}`); process.exitCode = 1;
});
