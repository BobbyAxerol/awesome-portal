/** Owner-approved, read-only unified preview receipt. No fixture or engine run. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROJECT = 'portal-research-preview';
const ORIGIN = 'https://research-portal.primusspark.com';
const OUT = '/home/bobby/.local/state/portal-research-unified-preview/20261010';
const ATTEMPT = process.argv.includes('--before') ? OUT : resolve(OUT, new Date().toISOString().replaceAll(':', '-'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const docker = args => execFileSync('sudo', ['-n', 'docker', ...args], { encoding: 'utf8', timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
const query = sql => JSON.parse(docker(['exec', `${PROJECT}-control-api-1`, 'node', '-e',
  `const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
  p.query(${JSON.stringify(sql)}).then(r=>process.stdout.write(JSON.stringify(r.rows))).finally(()=>p.end());`]));
const inspect = service => JSON.parse(docker(['inspect', `${PROJECT}-${service}-1`]))[0];
function snapshot() {
  const services = Object.fromEntries(['portal-postgres', 'portal-nats', 'portal-api', 'quant-worker-py', 'roadmap-task-board-api', 'control-api', 'portal-web'].map(service => {
    const item = inspect(service);
    assert.equal(item.Config.Labels['com.docker.compose.project'], PROJECT);
    return [service, { container: item.Id, image: item.Image, mounts: item.Mounts.map(m => ({ type: m.Type, name: m.Name ?? null, source: m.Source, target: m.Destination })) }];
  }));
  const custody = Object.fromEntries(['runs', 'current_source_seals_v1', 'release_candidate_packs_v1', 'release_candidate_publications_v1'].map(table => [table,
    query(`SELECT count(*)::int rows, md5(coalesce(string_agg(to_jsonb(r)::text, E'\\n' ORDER BY to_jsonb(r)::text),'')) digest FROM research.${table} r`)[0]]));
  custody.users = query('SELECT count(*)::int rows, md5(string_agg(to_jsonb(u)::text, E\'\\n\' ORDER BY user_id)) digest FROM portal_users u')[0];
  return { services, custody, execution_snapshots: query('SELECT count(*)::int rows FROM execution_profile_projection_snapshots')[0].rows };
}
mkdirSync(OUT, { recursive: true, mode: 0o700 });
mkdirSync(ATTEMPT, { recursive: true, mode: 0o700 });
const record = (name, value) => writeFileSync(resolve(ATTEMPT, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
if (process.argv.includes('--before')) {
  record('before.json', snapshot());
  console.log(JSON.stringify({ stage: 'BEFORE_RECORDED', out: OUT }));
} else {
  const before = JSON.parse(readFileSync(resolve(OUT, 'before.json'), 'utf8'));
  const current = snapshot();
  for (const service of ['portal-postgres', 'portal-nats', 'portal-api', 'quant-worker-py', 'roadmap-task-board-api']) assert.deepEqual(current.services[service], before.services[service], `${service} must remain unchanged`);
  // An owner password login used for the separately audited, scoped read grants
  // updates portal_users.updated_at/resetLoginCounters. Keep the original hash
  // as evidence; do not call that auth bookkeeping a lost Research record.
  const researchCustody = custody => Object.fromEntries(Object.entries(custody).filter(([key]) => key !== 'users'));
  assert.deepEqual(researchCustody(current.custody), researchCustody(before.custody), 'Research custody must not change');
  assert.equal(current.custody.users.rows, before.custody.users.rows, 'no preview account may be added/deleted');
  assert.equal(current.execution_snapshots, before.execution_snapshots);
  const env = Object.fromEntries(inspect('control-api').Config.Env.map(item => [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)]));
  assert.equal(env.FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT, 'true');
  for (const key of ['EDGE', 'CURRENT_SOURCE_PAPER', 'CURRENT_SOURCE_SANDBOX', 'CURRENT_SOURCE_LIVE', 'LOCAL_PROJECTION', 'DURABLE_MIRROR', 'DURABLE_MIRROR_READS', 'REALTIME_SSE', 'ANALYTICS_QUERY', 'SHADOW_QUERY', 'MARKET_CONTEXT', 'PUBLIC_MARKET_CANDLES', 'COMMAND_RELAY', 'LOCAL_R0_TASKS']) assert.equal(env[`FEATURE_EXECUTION_${key}`], 'false', key);
  assert.equal(env.AUTH_MODE, 'dev');
  assert.equal(env.PORTAL_ENV, 'local');
  assert.equal(env.PORTAL_PUBLIC_ORIGIN, ORIGIN);
  const publication = query("SELECT release_candidate_id,run_id,workspace_id,approval_id FROM research.release_candidate_publications_v1 WHERE state='DELIVERED' AND actor_username='claude-preview' ORDER BY published_at DESC LIMIT 1")[0];
  assert(publication, 'existing published Research RC is required');
  const { chromium } = await import(new URL('../../apps/portal/frontend/node_modules/playwright/index.mjs', import.meta.url));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const receipt = { project: PROJECT, origin: ORIGIN, source: env.PORTAL_BUILD_COMMIT,
    source_dirty: env.PORTAL_BUILD_DIRTY, browser: browser.version(), publication,
    before, after: current, cells: [], api_checks: [], page_errors: [], console: [], failed_reads: [],
    execution_stream_requests: [], product_writes: [], external_requests: [], external_telemetry_requests: [], handoff_workspace_query: [], session_revoked: false };
  const jobs = [];
  let cell = null;
  page.on('pageerror', error => receipt.page_errors.push({ cell, message: error.message }));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) receipt.console.push({ cell, type: message.type(), text: message.text() }); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN && !['data:', 'blob:'].includes(url.protocol)) {
      const item = { cell, origin: url.origin, path: url.pathname };
      if (url.origin === 'https://static.cloudflareinsights.com' && url.pathname.startsWith('/beacon.min.js/')) receipt.external_telemetry_requests.push(item);
      else receipt.external_requests.push(item);
    }
    if (url.pathname.startsWith('/api/v1/execution/') && /stream|\/events(?:\/|$)/.test(url.pathname)) receipt.execution_stream_requests.push(url.pathname);
    if (url.pathname.startsWith('/api/') && request.method() !== 'GET' && !['/api/auth/logout', '/api/v1/research/datasets/declaration-estimates'].includes(url.pathname)) receipt.product_writes.push({ cell, path: url.pathname, method: request.method() });
  });
  page.on('response', response => {
    const url = new URL(response.url());
    const responseCell = cell;
    if (url.origin === ORIGIN && url.pathname.startsWith('/api/') && response.status() >= 400) jobs.push((async () => {
      const body = await response.json().catch(() => ({}));
      receipt.failed_reads.push({ cell: responseCell, path: url.pathname, status: response.status(), code: body.error?.code ?? body.code ?? null });
    })());
  });
  const workspace = encodeURIComponent(publication.workspace_id);
  const api = async path => {
    const result = await page.evaluate(async path => {
      const response = await fetch(path, { credentials: 'same-origin' });
      return { status: response.status, body: await response.json() };
    }, path);
    receipt.api_checks.push({ path, status: result.status, schema: result.body.schema_version ?? null,
      state: result.body.state ?? null, reason: result.body.reason_code ?? null });
    assert.equal(result.status, 200, `required local read failed: ${path}`);
    return result.body;
  };
  try {
    await page.goto(`${ORIGIN}/research/quantbt/runs`, { waitUntil: 'networkidle' });
    const index = await page.content();
    receipt.entry_bundle = index.match(/\/assets\/index-[^"']+\.js/)?.[0] ?? null;
    await api('/api/auth/context');
    await api('/api/v1/execution/command-center');
    await api('/api/v1/execution/screen-contracts');
    for (const environment of ['paper', 'sandbox', 'live']) {
      const envelope = await api(`/api/v1/execution/screens/${environment}?workspace_id=${workspace}`);
      assert(JSON.stringify(envelope).includes('DISABLED') || JSON.stringify(envelope).includes('UNAVAILABLE'), 'disabled source must retain typed absence');
    }
    const published = await api(`/api/v1/research/release-candidates/${publication.release_candidate_id}/publication?workspace_id=${workspace}`);
    assert.equal(published.state, 'DELIVERED');
    assert.equal(published.approval?.approval_id, publication.approval_id);
    assert.equal(published.approval_read, 'AVAILABLE');
    const r1 = published.approval.href;
    assert.equal(r1, `/governance/approvals/${publication.approval_id}/r1`);
    await api(`/api/v1/execution/governance/approvals/${publication.approval_id}/r1?workspace_id=${workspace}`);
    const routes = ['/research/quantbt/runs', '/research/quantbt/atlas', '/execution', '/execution/operations',
      '/governance/approvals', '/governance/waivers', '/deployments/alphas', '/deployments/portfolios',
      '/deployments/accounts', '/deployments/paper', '/deployments/sandbox', '/deployments/live', '/deployments/blotter', '/administration/actions',
      `/research/quantbt/runs/${publication.run_id}/release-candidate?workspace_id=${workspace}`, `${r1}?workspace_id=${workspace}`];
    for (const width of [1280, 660]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        cell = `${width}:${path}`;
        await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
        await page.locator('#portal-content').waitFor();
        const text = await page.locator('#portal-content').innerText();
        assert(text.length > 40, `blank route: ${path}`);
        assert(!text.includes('The Feature Registry could not be loaded'));
        const execution = !path.startsWith('/research/');
        if (execution) assert.equal(await page.locator('[data-execution-preview]').count(), 1, `product Execution router absent: ${path}`);
        if (path.includes('/release-candidate?')) {
          const link = page.locator(`a[href^="${r1}"]`).first();
          await link.waitFor();
          const linkedWorkspace = new URL(await link.getAttribute('href'), ORIGIN).searchParams.get('workspace_id');
          receipt.handoff_workspace_query.push({ width, linked_workspace: linkedWorkspace, expected_workspace: publication.workspace_id });
          // Existing mirror href is bare; own-workspace resolution remains valid.
          // Record the separate cross-workspace URL propagation gap, not a fake PASS.
          if (linkedWorkspace !== null) assert.equal(linkedWorkspace, publication.workspace_id);
          await link.click();
          await page.waitForURL(url => url.pathname === r1);
          assert.equal(new URL(page.url()).searchParams.get('workspace_id'), linkedWorkspace);
          await page.goBack({ waitUntil: 'networkidle' });
        }
        const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
        const file = `${width}-${receipt.cells.length}.png`;
        await page.screenshot({ path: resolve(ATTEMPT, file), fullPage: true });
        receipt.cells.push({ path, width, execution_router: execution, heading: await page.locator('#portal-content h1').allTextContents(), overflow,
          screenshot: file, sha256: sha256(readFileSync(resolve(ATTEMPT, file))) });
      }
    }
    cell = 'R1-refresh';
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-execution-preview]').count(), 1);
    await Promise.all(jobs);
    assert.deepEqual(receipt.page_errors, [], 'no uncaught browser error');
    assert.deepEqual(receipt.product_writes, [], 'read-only review must not mutate product');
    assert.deepEqual(receipt.external_requests, [], 'all browser reads remain same-origin');
    assert.deepEqual(receipt.execution_stream_requests, [], 'Execution streams must remain off');
    receipt.after = snapshot();
    assert.deepEqual(receipt.after.custody, current.custody, 'read-only browser review must preserve all rows, including user metadata');
    receipt.status = 'FUNCTIONAL_PREVIEW_PASS';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.failure = String(error.message); process.exitCode = 1;
  } finally {
    cell = 'session-revoke';
    const csrf = (await context.cookies()).find(cookie => cookie.name === '__Host-portal_csrf')?.value;
    const logout = await context.request.post(`${ORIGIN}/api/auth/logout`, { headers: { origin: ORIGIN, ...(csrf ? { 'x-portal-csrf': csrf } : {}) } }).catch(() => null);
    receipt.session_revoked = logout?.status() === 201 || logout?.status() === 200;
    if (!receipt.session_revoked) { receipt.status = 'FAIL'; receipt.failure ??= 'QA_SESSION_REVOKE_FAILED'; process.exitCode = 1; }
    await browser.close();
    record('receipt.json', receipt);
    console.log(JSON.stringify({ status: receipt.status, failure: receipt.failure, cells: receipt.cells.length,
      failed_reads: receipt.failed_reads.length, console: receipt.console.length, session_revoked: receipt.session_revoked, out: ATTEMPT }));
  }
}
