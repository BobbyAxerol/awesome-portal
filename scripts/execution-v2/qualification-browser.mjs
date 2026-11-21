#!/usr/bin/env node
/** Read-only ELP2-10 observation of the existing preview, not V2 acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const origin = 'https://research-portal.primusspark.com';
const stateRoot = '/home/bobby/.local/state/portal-execution-elp210';
const sha = value => createHash('sha256').update(value).digest('hex');

export function classifyManagerProbe(probe) {
  if (probe.status === 200 && probe.schema_version === 'portal.execution.manager-dataset.v1')
    return 'DATASET_OBSERVED_NOT_WHOLE_PHASE_ACCEPTANCE';
  if (probe.status === 404 && probe.framework_route_absent === true) return 'ROUTE_NOT_MOUNTED';
  if ([400, 401, 403, 404, 409, 503].includes(probe.status) && probe.code)
    return 'TYPED_REFUSAL_NOT_POSITIVE_QUALIFICATION';
  return 'UNEXPECTED_RESPONSE';
}

async function main() {
  const out = process.argv[2];
  assert(out && resolve(out).startsWith(stateRoot + '/') && !out.includes('..'), 'OWNED_OUTPUT_REQUIRED');
  mkdirSync(out, {recursive: true, mode: 0o700});
  const {chromium} = await import(new URL('../../apps/portal/frontend/node_modules/playwright/index.mjs', import.meta.url));
  const {default: AxeBuilder} = await import(new URL('../../apps/portal/frontend/node_modules/@axe-core/playwright/dist/index.mjs', import.meta.url));
  const started = new Date().toISOString();
  const receipt = {schema_version: 'portal.elp2-10.browser-observation.v1', origin, started_at: started,
    evidence_class: 'REAL_EXISTING_PREVIEW_NOT_V2_CONSUMER_ACCEPTANCE', full_phase_pass: false,
    cells: [], manager_probes: [], page_errors: [], console: [], requests: [], streams: [],
    product_writes: [], external_business_requests: [], telemetry: [], logout_status: null};
  const browser = await chromium.launch({headless: true});
  const context = await browser.newContext();
  let cell = 'entry', probing = false;
  try {
    receipt.browser_version = browser.version();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    // Do not execute accidental product writes or source/bootstrap requests.
    await page.route('**/*', async route => {
      const r = route.request(), u = new URL(r.url());
      const stream = u.pathname.startsWith('/api/v1/execution/') && /\/stream$|\/realtime-snapshot$/.test(u.pathname);
      const write = u.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method());
      if (stream) receipt.streams.push({cell, path: u.pathname});
      if (write) receipt.product_writes.push({cell, path: u.pathname, method: r.method()});
      if (stream || write) return route.abort('blockedbyclient');
      if (['http:', 'https:'].includes(u.protocol) && u.origin !== origin) {
        const item = {cell, origin: u.origin, path: u.pathname};
        if (u.origin === 'https://static.cloudflareinsights.com' && u.pathname.startsWith('/beacon.min.js/')) {
          receipt.telemetry.push(item);
          return route.continue();
        }
        receipt.external_business_requests.push(item);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    page.on('pageerror', e => receipt.page_errors.push({cell, message: e.message}));
    page.on('console', m => {
      if (['error', 'warning'].includes(m.type())) receipt.console.push({cell, probe: probing, type: m.type(), text: m.text()});
    });
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.origin === origin && u.pathname.startsWith('/api/')) receipt.requests.push({cell, path: u.pathname, method: r.method()});
    });
    for (const width of [1280, 660]) {
      await page.setViewportSize({width, height: 900});
      for (const path of ['/execution', '/deployments/alphas']) {
        cell = `${width}:${path}`;
        const at = performance.now();
        await page.goto(origin + path, {waitUntil: 'networkidle'});
        await page.locator('#portal-content').waitFor();
        const text = await page.locator('#portal-content').innerText();
        assert(text.trim().length > 40, 'BLANK_PREVIEW');
        const a11y = await new AxeBuilder({page}).include('#portal-content').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        const screenshot = `screen-${width}-${receipt.cells.length}.png`;
        await page.screenshot({path: resolve(out, screenshot), fullPage: true});
        receipt.cells.push({width, path, document_to_analysis_ms: performance.now() - at,
          overflow_px: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
          retained_banner: await page.locator('[data-execution-preview="retained"]').count(),
          text_sha256: sha(text), screenshot, screenshot_sha256: sha(readFileSync(resolve(out, screenshot))),
          a11y_violations: a11y.violations.map(v => ({id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target)}))});
      }
    }
    cell = 'idle-retained-fleet';
    const before = receipt.requests.length;
    await page.waitForTimeout(16000);
    receipt.idle = {seconds: 16, api_requests: receipt.requests.length - before};
    cell = 'explicit-v2-read-probes'; probing = true;
    for (const environment of ['paper', 'sandbox', 'live']) {
      for (const surface of ['fund-overview', 'fleet']) {
        const path = `/api/v1/execution/manager/${surface}?environment=${environment}`;
        const p = await page.evaluate(async path => {
          const at = performance.now(), r = await fetch(path, {credentials: 'same-origin', cache: 'no-store'});
          const body = await r.json().catch(() => ({}));
          return {status: r.status, duration_ms: performance.now() - at, schema_version: body.schema_version ?? null,
            code: body.error?.code ?? body.code ?? null,
            framework_route_absent: r.status === 404 && body.error === 'Not Found' && typeof body.message === 'string' && body.message.startsWith('Cannot GET ')};
        }, path);
        receipt.manager_probes.push({environment, surface, ...p, disposition: classifyManagerProbe(p)});
      }
    }
    receipt.preview_checks_pass = receipt.cells.every(c => c.overflow_px === 0 && c.a11y_violations.length === 0)
      && receipt.page_errors.length === 0 && receipt.product_writes.length === 0 && receipt.streams.length === 0
      && receipt.console.filter(c => !c.probe).length === 0
      && receipt.external_business_requests.length === 0 && receipt.idle.api_requests === 0;
    receipt.manager_positive_reads = receipt.manager_probes.filter(p => p.status === 200 && p.schema_version === 'portal.execution.manager-dataset.v1').length;
    receipt.v2_consumer_accepted = false;
  } catch (error) {
    receipt.failure = String(error.message ?? error); process.exitCode = 1;
  } finally {
    try {
      const csrf = (await context.cookies()).find(c => c.name === '__Host-portal_csrf')?.value;
      const r = await context.request.post(origin + '/api/auth/logout', {headers: {origin, ...(csrf ? {'x-portal-csrf': csrf} : {})}, timeout: 15000});
      receipt.logout_status = r.status();
      if (r.status() !== 201) process.exitCode = 1;
    } catch { receipt.logout_status = 'FAILED'; process.exitCode = 1; }
    await browser.close();
    receipt.finished_at = new Date().toISOString();
    writeFileSync(resolve(out, 'browser.json'), JSON.stringify(receipt, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    console.log(JSON.stringify({out, preview_checks_pass: receipt.preview_checks_pass ?? false, cells: receipt.cells.length,
      manager_positive_reads: receipt.manager_positive_reads ?? 0, probes: receipt.manager_probes.map(p => p.disposition),
      logout_status: receipt.logout_status, full_phase_pass: false, failure: receipt.failure ?? null}));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
