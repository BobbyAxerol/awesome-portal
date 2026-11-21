#!/usr/bin/env node
/** Narrow real SC23/SC07 and fixed GUI intake; owned8096 only, never production. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT, BASE_URL, validateHome } from '../research-p23/cell.mjs';
import { container, dbQuery, docker } from '../research-p23/runtime-tools.mjs';
import { privateRead, safeRecordedPath } from './p24-scenario-closeout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const flag = key => process.argv.find(value => value.startsWith(`--${key}=`))?.slice(key.length + 3);
const RUN = /^rrun_[a-f0-9]{32}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
export function validateConfig(input) {
  assert.equal(input.project, PROJECT); assert.equal(input.base_url, BASE_URL); assert.equal(input.origin, BASE_URL);
  assert.match(input.run_id, RUN); assert.equal(input.alpha_version_id, 'av_p23_section32_imported_0_1_0');
  assert(input.workspace_id && input.alternate_workspace_id && input.workspace_id !== input.alternate_workspace_id);
  assert(['SC23_AND_GUI', 'GUI_ONLY'].includes(input.mode ?? 'SC23_AND_GUI'));
  if (input.mode === 'GUI_ONLY') assert.equal(input.actors?.producer?.username, 'p24-edge-producer');
  else for (const key of ['a', 'b']) assert.equal(input.actors?.[key]?.username, `p24-edge-${key}`);
  const expected_images = { 'control-api': input.expected_images?.['control-api'] ?? input.expected_images?.control,
    'portal-web': input.expected_images?.['portal-web'] ?? input.expected_images?.web,
    'portal-api': input.expected_images?.['portal-api'] ?? input.expected_images?.python };
  for (const key of ['control-api', 'portal-web', 'portal-api']) assert.match(expected_images[key] ?? '', IMAGE);
  return { ...input, expected_images, out: validateHome(input.out) };
}
export function validateFixedSpec(spec, config) {
  assert.equal(spec.alpha_binding?.alpha_version_id, config.alpha_version_id);
  assert.equal(spec.not_publishable, false); assert.equal(spec.execution_route, 'signal_notional');
  assert.equal(spec.protocol, 'three_window_decay'); assert.equal(spec.optuna_trials, 1); assert.equal(spec.random_seed, 42);
  assert.deepEqual(spec.data, { dataset_id: 'crypto-binance-1m', symbol: 'BTCUSDT', timeframe: '1h' });
  assert.deepEqual(spec.parameter_space_overrides, [{ name: 'scale', kind: 'pin', value: 1000 }]);
  return true;
}
export function classifyWrite(method, path, phase, runId) {
  const pathname = new URL(path, BASE_URL).pathname;
  if (method === 'GET') return 'READ';
  if (method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(pathname)) return 'AUTH';
  if (method === 'POST' && pathname === '/api/v1/research/datasets/declaration-estimates') return 'METADATA_READ';
  if (method === 'PATCH' && pathname === `/api/v1/quantbt/runs/${runId}/release-candidate/draft` && /^cas-[ab][12]$/.test(phase)) return 'DRAFT';
  if (method === 'POST' && pathname === '/api/v1/research/preflights' && ['late-preflight', 'gui-preflight'].includes(phase)) return 'PREFLIGHT';
  if (method === 'POST' && pathname === '/api/v1/research/runs' && phase === 'gui-create') return 'CREATE';
  return 'FORBIDDEN';
}
function save(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600); }
function custody(workspace) {
  return Object.fromEntries(['jobs', 'selection_records', 'current_source_seals_v1', 'run_report_manifests_v1',
    'release_candidate_packs_v1', 'release_candidate_publications_v1'].map(table => [table,
      dbQuery(`SELECT count(*)::int count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) digest FROM research.${table} t WHERE workspace_id=$1`, [workspace]).rows[0]]));
}
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok; }); return { promise, resolve }; };
function scoped(path, workspace) { const url = new URL(path, BASE_URL); url.searchParams.set('workspace_id', workspace); return url.pathname + url.search; }

async function main() {
  assert(flag('config'), 'PRIVATE_CONFIG_REQUIRED');
  const input = JSON.parse(privateRead(flag('config')));
  const config = validateConfig({ ...input, ...(flag('out') ? { out: flag('out') } : {}), ...(flag('mode') ? { mode: flag('mode') } : {}) });
  const guiOnly = config.mode === 'GUI_ONLY';
  const mainActor = guiOnly ? config.actors.producer : config.actors.a;
  mkdirSync(config.out, { recursive: true, mode: 0o700 }); chmodSync(config.out, 0o700);
  const receiptPath = join(config.out, 'producer-cas-receipt.json'); assert(!existsSync(receiptPath), 'NEVER_OVERWRITE_RECEIPT');
  const images = {};
  for (const service of ['control-api', 'portal-api', 'portal-web']) {
    const name = service === 'portal-web' ? `${PROJECT}-portal-web-1` : container(service);
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name]).trim(), PROJECT);
    images[service] = docker(['inspect', '--format', '{{.Image}}', name]).trim(); assert.equal(images[service], config.expected_images[service]);
  }
  assert.equal(docker(['ps', '-q', '--filter', `label=com.docker.compose.project=${PROJECT}`, '--filter', 'label=com.docker.compose.service=quant-worker-py']).trim(), '', 'WORKER_INITIALLY_OFF');
  const receipt = { schema_version: 'research.p24-producer-cas-browser.v1', status: 'FAIL', started_at_utc: new Date().toISOString(),
    images, actors: guiOnly ? { producer: mainActor.username } : { a: config.actors.a.username, b: config.actors.b.username }, workspace_id: config.workspace_id,
    alternate_workspace_id: config.alternate_workspace_id, source_run_id: config.run_id,
    scope: guiOnly ? 'REAL_GUI_ONLY_ONE_DISTINCT_ELIGIBLE_ACTOR_FIXED_CHILD_NO_CAS_REPEAT' : 'REAL_SC23_ACTOR_LOCAL_DRAFT_CAS_AND_ONE_FIXED_GUI_CHILD_NOT_FULL_24_SCENARIOS',
    harness_sha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')), cells: [], requests: [], failures: [],
    writes: { DRAFT: 0, PREFLIGHT: 0, CREATE: 0 }, forbidden: [], guard_errors: [], page_errors: [], custody_before: custody(config.workspace_id) };
  const { chromium, expect } = await import(pathToFileURL(config.playwright_module ?? join(ROOT, 'apps/portal/frontend/node_modules/@playwright/test/index.mjs')).href);
  const browser = await chromium.launch({ headless: true });
  const contexts = [];
  const contextActors = new WeakMap();
  let phase = 'read', delayedPreflight = null, delayedCreate = null, submitted = null;
  let late = null, createHold = null;
  const captured = new Set();
  const record = async (page, name, body) => {
    const cell = { id: name, status: 'FAIL' }; receipt.cells.push(cell);
    try { await body(cell); cell.status = 'PASS'; await page.screenshot({ path: join(config.out, `${name}.png`), fullPage: true }); }
    catch (error) { cell.reason = String(error.message).slice(0, 900); receipt.failures.push({ id: name, reason: cell.reason }); throw error; }
    finally { save(receiptPath, receipt); }
  };
  const setup = async actor => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-dev-access-email': `${actor.username}@azdag.com` } });
    contexts.push(context);
    contextActors.set(context, actor.username);
    await context.route('**/api/**', async route => {
      try {
      const request = route.request(), path = safeRecordedPath(request.url());
      const kind = classifyWrite(request.method(), path, phase, config.run_id);
      const row = { phase, actor: contextActors.get(context), method: request.method(), path, kind }; receipt.requests.push(row);
      if (kind === 'FORBIDDEN') { receipt.forbidden.push(row); await route.abort('blockedbyclient'); return; }
      let body;
      if (['DRAFT', 'PREFLIGHT', 'CREATE'].includes(kind)) {
        body = request.postDataJSON();
        assert.equal(body.workspace_id ?? new URL(request.url()).searchParams.get('workspace_id'), config.workspace_id, 'EXPLICIT_OWNED_SCOPE_REQUIRED');
        receipt.writes[kind] += 1;
        assert(receipt.writes.DRAFT <= (guiOnly ? 0 : 3) && receipt.writes.PREFLIGHT <= (guiOnly ? 1 : 2) && receipt.writes.CREATE <= 1, 'WRITE_BUDGET_EXCEEDED');
        if (kind === 'PREFLIGHT' || kind === 'CREATE') validateFixedSpec(body.requested_spec, config);
      }
      if (kind === 'CREATE' || (kind === 'PREFLIGHT' && phase === 'late-preflight')) {
        const response = await route.fetch(); const answer = await response.json();
        row.status = response.status(); row.code = answer.error?.code ?? null;
        if (kind === 'CREATE') {
          assert.equal(response.status(), 202, 'REAL_CREATE_202_REQUIRED'); assert.match(answer.run_id, RUN);
          submitted = { request: { ...body, preflight_token: '[REDACTED]' }, response: answer };
          delayedCreate = { request, response, answer }; createHold.entered.resolve();
          save(join(config.out, 'validated-intake-awaiting-worker.json'), { run_id: answer.run_id, workspace_id: config.workspace_id,
            expected_images: images, requested_spec: body.requested_spec, response: answer,
            note: 'ONE_REAL_BROWSER_INTAKE_WORKER_MUST_ONLY_BE_STARTED_BY_PARENT' });
          await createHold.release.promise;
        } else {
          assert.equal(response.status(), 201, 'REAL_PREFLIGHT_201_REQUIRED'); delayedPreflight = answer;
          late.entered.resolve(); await late.release.promise;
        }
        await route.fulfill({ response }); return;
      }
      await route.continue();
      } catch (error) {
        receipt.guard_errors.push({ phase, path: safeRecordedPath(route.request().url()), reason: String(error.message).slice(0, 700) });
        save(receiptPath, receipt); late?.entered.resolve(); createHold?.entered.resolve();
        await route.abort('blockedbyclient').catch(() => {});
      }
    });
    context.on('page', page => page.on('pageerror', error => receipt.page_errors.push(String(error).slice(0, 500))));
    return context;
  };
  const login = async (context, actor) => {
    contextActors.set(context, actor.username);
    await context.setExtraHTTPHeaders({ 'x-dev-access-email': `${actor.username}@azdag.com` });
    const answer = await context.request.post(`${BASE_URL}/api/auth/login`, { headers: { origin: config.origin }, data: { username: actor.username,
      credential: actor.password ?? privateRead(actor.credential_path).trim() } }); assert([200, 201].includes(answer.status()), 'NORMAL_LOGIN_REQUIRED');
    const cookies = await context.cookies(); assert(cookies.some(cookie => cookie.name === '__Host-portal_session' && cookie.secure && cookie.httpOnly));
  };
  const api = async (page, path) => page.evaluate(async value => { const response = await fetch(value, { credentials: 'same-origin' });
    return { status: response.status, body: await response.json() }; }, path);
  const logout = async page => { if (new URL(page.url()).origin !== BASE_URL) return; await page.evaluate(async () => {
    const token = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('__Host-portal_csrf='))?.slice('__Host-portal_csrf='.length);
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-portal-csrf': token ? decodeURIComponent(token) : '' } });
  }); };
  const open = async (page, path, workspace = config.workspace_id) => { await page.goto(`${BASE_URL}${scoped(path, workspace)}`, { waitUntil: 'domcontentloaded' }); };
  const windows = async page => { await page.locator('[data-step-pill="windows"]').click(); await expect(page.getByLabel('IS start', { exact: true })).toBeVisible(); };
  const review = async page => { await page.locator('[data-step-pill="review"]').click(); await expect(page.locator('[data-action="preflight"]')).toBeVisible(); };
  const store = page => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('research.quantbt.new-run.draft.v2:')).map(key => {
    const value = JSON.parse(sessionStorage.getItem(key)); return { actor: value.actor_id, workspace: value.workspace_id, start: value.draft.windows.is.start };
  }));
  let a, b, a1, a2, b1;
  try {
    a = await setup(mainActor); await login(a, mainActor); a1 = await a.newPage();
    if (!guiOnly) {
      b = await setup(config.actors.b); await login(b, config.actors.b);
      a2 = await a.newPage(); b1 = await b.newPage();
    }
    await open(a1, `/research/quantbt/runs/new?from=${config.run_id}`);
    await expect(a1.locator('[data-clone-state="available"]')).toBeVisible({ timeout: 30000 }); await windows(a1);
    const authA = await api(a1, '/api/auth/context'); assert.equal(authA.status, 200); assert.equal(authA.body.principal.role, guiOnly ? 'ADMIN' : 'USER');
    receipt.main_actor_normal_principal = authA.body.principal.principalId ?? authA.body.principal.principal_id;
    const originalStart = await a1.getByLabel('IS start', { exact: true }).inputValue(); assert.equal(originalStart, '2026-06-01T00:00');
    if (!guiOnly) {
    await record(a1, 'SC23-real-draft-scope', async cell => {
      for (const value of ['2026-06-01T01:00', '2026-06-01T02:00', '2026-06-01T03:00']) {
        await a1.getByLabel('IS start', { exact: true }).fill(value);
        await expect.poll(async () => (await store(a1)).find(entry => entry.workspace === config.workspace_id)?.start).toBe(value);
      }
      const entries = await store(a1), draftA = entries.find(entry => entry.workspace === config.workspace_id); assert(draftA);
      cell.scope_actor_id = draftA.actor; cell.typed_start = draftA.start; cell.autosave_edits = 3;
      await open(a1, '/research/quantbt/runs/new?step=windows'); await expect(a1.getByLabel('IS start', { exact: true })).toHaveValue(draftA.start);
      await open(a1, '/research/quantbt/runs'); await expect(a1.locator('[data-action="continue-draft"]')).toBeVisible();
      await open(a1, '/research/quantbt/runs/new?step=windows', config.alternate_workspace_id);
      await expect(a1.getByLabel('IS start', { exact: true })).not.toHaveValue(draftA.start);
      await open(a1, '/research/quantbt/runs', config.alternate_workspace_id); await expect(a1.locator('[data-action="continue-draft"]')).toHaveCount(0);
      await logout(a1); await login(a, config.actors.b);
      await open(a1, '/research/quantbt/runs/new?step=windows'); await expect(a1.getByLabel('IS start', { exact: true })).not.toHaveValue(draftA.start);
      await open(a1, '/research/quantbt/runs'); await expect(a1.locator('[data-action="continue-draft"]')).toHaveCount(0);
      await logout(a1); await login(a, config.actors.a);
      await open(a1, '/research/quantbt/runs/new?step=windows'); await expect(a1.getByLabel('IS start', { exact: true })).toHaveValue(draftA.start);
      await a1.getByLabel('IS start', { exact: true }).fill(originalStart);
    });
    await record(a1, 'SC23-real-late-preflight', async cell => {
      late = { entered: deferred(), release: deferred() }; phase = 'late-preflight';
      await review(a1); await expect(a1.locator('[data-action="preflight"]')).toBeEnabled(); await a1.locator('[data-action="preflight"]').click();
      await Promise.race([late.entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('REAL_PREFLIGHT_WAIT_TIMEOUT')), 30000))]);
      assert.deepEqual(receipt.guard_errors, [], 'HARNESS_SCOPE_OR_BUDGET_GUARD_FAILED'); assert(delayedPreflight);
      await windows(a1); await a1.getByLabel('IS start', { exact: true }).fill('2026-06-01T01:00');
      await review(a1);
      const delivered = a1.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/research/preflights');
      late.release.resolve(); await (await delivered).finished();
      await expect(a1.locator('[data-preflight-running]')).toHaveCount(0); await expect(a1.locator('[data-action="create-run"]')).toBeDisabled();
      cell.real_response_status = 201; cell.token_hash = hash(delayedPreflight.preflight_token); cell.stale_preview_not_adopted = true;
      phase = 'read'; await windows(a1); await a1.getByLabel('IS start', { exact: true }).fill(originalStart);
    });
    const rcPath = `/research/quantbt/runs/${config.run_id}/release-candidate`;
    const rcApi = scoped(`/api/v1/quantbt/runs/${config.run_id}/release-candidate`, config.workspace_id);
    await record(a1, 'SC23-real-actor-local-CAS', async cell => {
      await Promise.all([open(a1, rcPath), open(a2, rcPath), open(b1, rcPath)]);
      const initialA = await api(a1, rcApi), initialA2 = await api(a2, rcApi), initialB = await api(b1, rcApi);
      const authB = await api(b1, '/api/auth/context'); assert.equal(authB.status, 200); assert.equal(authB.body.principal.role, 'USER');
      receipt.actor_b_normal_principal = authB.body.principal.principalId ?? authB.body.principal.principal_id;
      for (const answer of [initialA, initialA2, initialB]) {
        assert.equal(answer.status, 200); assert.equal(answer.body.actions.may_edit_draft, true);
        assert.equal(answer.body.local_seal.state, 'UNSEALED'); assert.equal(answer.body.draft.revision, 0);
      }
      const edit = async (page, value) => {
        await page.locator('[data-edit="KNOWN_LIMITATIONS_WAIVERS"]').click();
        await page.locator('[data-declaration-input="KNOWN_LIMITATIONS_WAIVERS"]').fill(value);
      };
      await Promise.all([edit(a1, 'SC23 actor A original declaration'), edit(a2, 'SC23 actor A stale overwrite must refuse'), edit(b1, 'SC23 actor B separate declaration')]);
      const write = async (page, label, status) => {
        phase = label; const reply = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith('/release-candidate/draft'));
        await page.locator('[data-action="save-declaration"]').click(); const response = await reply; const body = await response.json();
        assert.equal(response.status(), status); return body;
      };
      const savedA = await write(a1, 'cas-a1', 200), staleA = await write(a2, 'cas-a2', 409), savedB = await write(b1, 'cas-b1', 200);
      assert.equal(staleA.error.code, 'RESEARCH_RELEASE_CANDIDATE_CONFLICT');
      assert.notEqual(savedA.draft.draft_id, savedB.draft.draft_id);
      const afterA = await api(a1, rcApi), afterB = await api(b1, rcApi);
      assert.equal(afterA.body.draft.known_limitations, 'SC23 actor A original declaration');
      assert.equal(afterB.body.draft.known_limitations, 'SC23 actor B separate declaration');
      assert.equal(afterA.body.draft.revision, 1); assert.equal(afterB.body.draft.revision, 1);
      cell.drafts = { a: savedA.draft.draft_id, b: savedB.draft.draft_id }; cell.conflict = staleA.error.code;
      cell.source_fingerprint_unchanged = afterA.body.source_fingerprint === initialA.body.source_fingerprint && afterB.body.source_fingerprint === initialB.body.source_fingerprint;
      assert(cell.source_fingerprint_unchanged); phase = 'read';
    });
    }
    await record(a1, 'SC04-SC07-real-GUI-fixed-intake-and-late-ACK', async cell => {
      await open(a1, `/research/quantbt/runs/new?from=${config.run_id}`); await expect(a1.locator('[data-clone-state="available"]')).toBeVisible({ timeout: 30000 });
      await review(a1); phase = 'gui-preflight';
      const pendingPreview = a1.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/research/preflights');
      await a1.locator('[data-action="preflight"]').click(); const previewResponse = await pendingPreview;
      assert.equal(previewResponse.status(), 201); const preview = await previewResponse.json(); assert.equal(preview.may_create_run, true);
      const previewRequest = previewResponse.request().postDataJSON(); validateFixedSpec(previewRequest.requested_spec, config);
      await expect(a1.locator('[data-action="create-run"]')).toBeEnabled(); phase = 'gui-create'; createHold = { entered: deferred(), release: deferred() };
      await a1.locator('[data-action="create-run"]').click({ clickCount: 2 });
      await Promise.race([createHold.entered.promise, new Promise((_, reject) => setTimeout(() => reject(new Error('REAL_CREATE_WAIT_TIMEOUT')), 30000))]);
      assert.deepEqual(receipt.guard_errors, [], 'HARNESS_SCOPE_OR_BUDGET_GUARD_FAILED'); assert(submitted);
      assert.deepEqual(submitted.request.requested_spec, previewRequest.requested_spec);
      for (const key of ['requested_spec_digest', 'effective_spec_digest', 'dataset_binding_digest', 'manifest_digest']) assert.equal(submitted.response[key], preview[key]);
      await windows(a1); await a1.getByLabel('IS start', { exact: true }).fill('2026-06-01T01:00');
      const delivered = a1.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/research/runs');
      createHold.release.resolve(); phase = 'read'; await (await delivered).finished(); await review(a1);
      await expect(a1.locator('[data-research-panel="run"][data-state="loading"]')).toHaveCount(0);
      await expect(a1.locator('[data-action="create-run"]')).toBeDisabled();
      assert(new URL(a1.url()).pathname.endsWith('/runs/new'), 'LATE_ACK_MUST_NOT_NAVIGATE_EDITED_DECLARATION');
      cell.submission = submitted; cell.preview = { requested_spec: previewRequest.requested_spec, effective_spec: preview.effective_spec,
        requested_spec_digest: preview.requested_spec_digest, effective_spec_digest: preview.effective_spec_digest };
      cell.single_create_POST = receipt.writes.CREATE === 1; cell.late_ACK_ignored = true;
      assert.equal(custody(config.workspace_id).jobs.count, receipt.custody_before.jobs.count + 1);
      const stored = dbQuery(`SELECT p.run_id,p.client_intent_id,p.requested_spec_digest,p.effective_spec_digest,p.execution_adapter_id,
        p.legacy_request,m.requested_spec,m.effective_spec FROM research.run_producers p JOIN research.preflight_manifests m
        ON m.workspace_id=p.workspace_id AND m.preflight_token=p.preflight_token WHERE p.workspace_id=$1 AND p.run_id=$2`, [config.workspace_id, submitted.response.run_id]).rows;
      assert.equal(stored.length, 1); assert.equal(stored[0].client_intent_id, submitted.request.client_intent_id);
      assert.deepEqual(stored[0].requested_spec, previewRequest.requested_spec); assert.deepEqual(stored[0].effective_spec, preview.effective_spec);
      assert.equal(stored[0].execution_adapter_id, 'p17.imported-signal-notional.v1');
      cell.persisted_intake = { run_id: stored[0].run_id, client_intent_id: stored[0].client_intent_id,
        requested_spec_digest: stored[0].requested_spec_digest, effective_spec_digest: stored[0].effective_spec_digest, execution_adapter_id: stored[0].execution_adapter_id };
      save(join(config.out, 'validated-intake-awaiting-worker.json'), { ...cell.persisted_intake,
        workspace_id: config.workspace_id, requested_spec: previewRequest.requested_spec, effective_spec: preview.effective_spec,
        expected_images: images, status: 'INTAKE_AND_EDITED_FORM_FENCE_VALIDATED_PARENT_MAY_START_ONE_PINNED_WORKER' });
      await open(a1, `/research/quantbt/runs/${submitted.response.run_id}/progress`);
      await expect.poll(async () => {
        const read = await api(a1, scoped(`/api/v1/research/runs/${submitted.response.run_id}/progress`, config.workspace_id));
        return read.status === 200 ? `${read.body.current.effective_status}/${read.body.current.terminal_materialization?.state ?? read.body.current.terminal_materialization}` : `HTTP${read.status}`;
      }, { timeout: 180000, intervals: [1000, 2000, 3000] }).toBe('COMPLETED/READY');
      const finish = await api(a1, scoped(`/api/v1/research/runs/${submitted.response.run_id}/progress`, config.workspace_id)); cell.progress = finish.body;
      await expect(a1.locator('[data-screen="run-progress"]')).toBeVisible(); cell.actual_confined_child_completed = true;
    });
    receipt.custody_after = custody(config.workspace_id);
    for (const key of ['release_candidate_publications_v1', 'release_candidate_packs_v1']) assert.deepEqual(receipt.custody_after[key], receipt.custody_before[key]);
    assert.equal(receipt.custody_after.jobs.count, receipt.custody_before.jobs.count + 1);
    assert.deepEqual(receipt.forbidden, []); assert.deepEqual(receipt.page_errors, []); receipt.status = 'SCOPED_REAL_BROWSER_PASS';
  } catch (error) { receipt.failures.push({ id: 'harness', reason: String(error.message).slice(0, 900) }); }
  finally {
    late?.release.resolve(); createHold?.release.resolve(); await Promise.allSettled([...captured]);
    for (const context of contexts) {
      const page = context.pages().find(page => { try { return new URL(page.url()).origin === BASE_URL; } catch { return false; } });
      if (page) await logout(page).catch(() => {}); await context.close();
    }
    await browser.close(); receipt.finished_at_utc = new Date().toISOString();
    receipt.cleanup = 'BROWSER_CLOSED_AND_OWN_SESSION_LOGOUT_PARENT_DISABLES_NEW_ACTORS_AND_STOPS_OWN_WORKER'; save(receiptPath, receipt);
  }
  console.log(JSON.stringify({ status: receipt.status, cells: receipt.cells.map(cell => ({ id: cell.id, status: cell.status })),
    writes: receipt.writes, failures: receipt.failures, receipt: receiptPath }));
  if (receipt.status !== 'SCOPED_REAL_BROWSER_PASS') process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(String(error.message)); process.exitCode = 1; });
