#!/usr/bin/env node
/**
 * §16.6 scenario receipts, ONE browser / owned disposable P23 cell only.
 *
 * node scripts/research-preview/p24-scenario-closeout.mjs --config=<0600.json>
 * Config: { project, base_url, origin, username, credential_path, workspace_id,
 *   out, runs?: { global, causal, fixed }, write_negative_probes?: true,
 *   playwright_module?: <installed playwright/index.mjs> }.
 *
 * Authentication and receipt outputs are private. No password/session/token is
 * written to a receipt. Reads never launch compute. Negative write probes are
 * explicit and only available on 127.0.0.1:8096. An assertion proves only its
 * named scope: a partial drill does not turn an entire §16.6 row green.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { container, dbQuery, docker } from '../research-p23/runtime-tools.mjs';
import { PROJECT, BASE_URL, validateHome } from '../research-p23/cell.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PREFIX = '/research/quantbt';
export const SCENARIOS = Object.freeze(Array.from({ length: 24 }, (_, i) => `SC-${String(i + 1).padStart(2, '0')}`));
const HASH = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function requireOwnedConfig(config) {
  assert.equal(config.project, PROJECT, 'OWNED_P23_PROJECT_ONLY');
  assert.equal(config.base_url, BASE_URL, 'SHARED_OR_PRODUCTION_PORT_REFUSED');
  assert.equal(config.origin, BASE_URL, 'SAME_ORIGIN_REQUIRED');
  assert.match(config.username, /^p23-reader-[0-9]{2}$/, 'EPHEMERAL_QA_ONLY');
  assert.equal(typeof config.workspace_id, 'string');
  assert(config.workspace_id.length > 0, 'WORKSPACE_REQUIRED');
  assert(config.write_negative_probes === undefined || typeof config.write_negative_probes === 'boolean');
  assert(config.technical_fixture_probes === undefined || typeof config.technical_fixture_probes === 'boolean');
  assert(config.selected_scenarios === undefined || (Array.isArray(config.selected_scenarios)
    && config.selected_scenarios.every(id => SCENARIOS.includes(id))), 'KNOWN_SCENARIO_SUBSET_REQUIRED');
  config.out = validateHome(config.out);
  assert(!config.runs || Object.values(config.runs).every(id => /^rrun_[a-f0-9]{32}$/.test(id)), 'PUBLIC_RUN_IDS_ONLY');
  return config;
}
export function privateRead(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'PRIVATE_0600_REGULAR_FILE_REQUIRED');
  return readFileSync(path, 'utf8');
}
export function safeRecordedPath(url) {
  const parsed = new URL(url, BASE_URL);
  const query = new URLSearchParams(parsed.search);
  for (const key of [...query.keys()]) if (/token|credential|cursor|key/i.test(key)) query.set(key, '[REDACTED]');
  return parsed.pathname + (query.size ? `?${query}` : '');
}
export function scenarioTotals(rows) {
  assert.deepEqual(rows.map(row => row.id), SCENARIOS, 'SCENARIO_DENOMINATOR_MUST_REMAIN_24');
  return rows.reduce((out, row) => ({ ...out, [row.status]: (out[row.status] ?? 0) + 1 }), {});
}
export function causalSelection(body) {
  const picked = body.selection ?? body.frozen_selection;
  return picked ? {
    selected_trial_id: picked.selected_trial_id,
    selected_trial_ordinal: picked.selected_trial_ordinal,
    selected_trial_ordinal_scope: picked.selected_trial_ordinal_scope,
    fold_id: picked.fold_id,
    scope: picked.scope,
    parameters: picked.parameters,
  } : null;
}
function save(path, value) {
  assert(!existsSync(path) || !lstatSync(path).isSymbolicLink(), 'RECEIPT_SYMLINK_REFUSED');
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600);
}
function ownedImage(service) {
  if (service !== 'portal-web') return docker(['inspect', '--format', '{{.Image}}', container(service)]).trim();
  // runtime-tools intentionally allows only fault/DB targets, not Web. Keep
  // that shared allowlist untouched and bind this readonly lookup twice.
  const name = `${PROJECT}-portal-web-1`;
  const inspect = JSON.parse(docker(['inspect', name]))[0];
  assert.equal(inspect.Config.Labels['com.docker.compose.project'], PROJECT, 'OWNED_WEB_PROJECT_REQUIRED');
  assert.equal(inspect.Config.Labels['com.docker.compose.service'], 'portal-web', 'OWNED_WEB_SERVICE_REQUIRED');
  assert.match(inspect.Image, /^sha256:[a-f0-9]{64}$/, 'OWNED_WEB_IMMUTABLE_IMAGE_REQUIRED');
  return inspect.Image;
}
/** SQL is an ops-only before/after oracle, never a browser's source route. */
function custody(workspace) {
  const names = ['alphas', 'alpha_versions', 'attempts', 'runs', 'jobs', 'selection_records',
    'artifacts', 'current_source_seals_v1', 'run_report_manifests_v1', 'release_candidate_packs_v1',
    'release_candidate_publications_v1', 'attempt_promotion_pick_facts_v1'];
  const result = {};
  for (const name of names) {
    const available = dbQuery('SELECT to_regclass($1) IS NOT NULL AS present', [`research.${name}`]).rows[0].present;
    assert(available, `REQUIRED_CUSTODY_TABLE_MISSING:${name}`);
    result[name] = dbQuery(`SELECT count(*)::int count,
      md5(coalesce(string_agg(to_jsonb(row)::text, E'\\n' ORDER BY to_jsonb(row)::text), '')) digest
      FROM research.${name} row WHERE workspace_id=$1`, [workspace]).rows[0];
  }
  return result;
}
async function main() {
  const path = process.argv.find(arg => arg.startsWith('--config='))?.slice(9);
  assert(path, 'PRIVATE_CONFIG_REQUIRED');
  const rawConfig = JSON.parse(privateRead(path));
  const outputOverride = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
  const scenarioOverride = process.argv.find(arg => arg.startsWith('--scenarios='))?.slice(12);
  const config = requireOwnedConfig({ ...rawConfig,
    ...(outputOverride ? { out: outputOverride } : {}),
    ...(scenarioOverride ? { selected_scenarios: scenarioOverride.split(',') } : {}),
  });
  mkdirSync(config.out, { recursive: true, mode: 0o700 }); chmodSync(config.out, 0o700);
  assert(!existsSync(join(config.out, 'p24-scenario-receipt.json')), 'PRIOR_SCENARIO_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const { chromium, expect } = await import(pathToFileURL(config.playwright_module ?? join(ROOT, 'apps/portal/frontend/node_modules/@playwright/test/index.mjs')).href);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'x-dev-access-email': `${config.username}@azdag.com` } });
  const page = await context.newPage();
  const rows = SCENARIOS.map(id => ({ id, status: 'NEEDS_RUN', lane: 'REAL_API', scopes: [], assertions: [], reason: 'Full scenario has not run on this candidate.' }));
  const receipt = { schema_version: 'research.p24-scenarios.v1', generated_at_utc: new Date().toISOString(),
    project: PROJECT, base_url: BASE_URL, workspace_id: config.workspace_id,
    actor: config.username, git_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    source_dirty: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0,
    harness_sha256: HASH(readFileSync(fileURLToPath(import.meta.url), 'utf8')), images: {}, bundle: null, rows,
    authentication_cleanup: 'ROOT_MUST_DISABLE_AND_REVOKE_EPHEMERAL_QA_AFTER_ALL_COORDINATED_LANES',
    fixture_claims: [], failed_assertions: [], requests: [], page_errors: [], console_errors: [] };
  const actions = [];
  const pageErrors = [];
  const allRequests = [];
  receipt.requests = allRequests;
  let activeScenario = null;
  page.on('request', request => {
    if (!new URL(request.url()).pathname.startsWith('/api/')) return;
    const record = { scenario: activeScenario, method: request.method(), path: safeRecordedPath(request.url()) };
    actions.push(record); allRequests.push(record);
  });
  page.on('pageerror', error => { pageErrors.push({ scenario: activeScenario, text: String(error).slice(0, 500) }); });
  page.on('console', message => { if (message.type() === 'error') receipt.console_errors.push({ scenario: activeScenario, text: message.text().slice(0, 300) }); });
  // A refused attempt is still recorded. No hidden method is silently allowed.
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.continue();
    return route.abort('blockedbyclient');
  });
  const get = async path => {
    assert(path.startsWith('/api/'), 'NAMED_GET_ONLY');
    // Chromium treats HTTP loopback as trustworthy, while Playwright's API
    // request transport otherwise omits Secure cookies. Preserve the real
    // owned browser session explicitly; do not weaken production cookie flags.
    const cookie = (await context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
    const response = await page.request.get(`${BASE_URL}${path}`, { headers: { cookie } });
    const body = await response.json();
    const record = { scenario: activeScenario, method: 'GET', path: safeRecordedPath(path), status: response.status(), response_sha256: HASH(body) };
    allRequests.push(record);
    assert.equal(response.status(), 200, `READ:${safeRecordedPath(path)}:${response.status()}:${body.error?.code ?? 'UNEXPECTED'}`);
    return body;
  };
  const probe = async (id, scope, full, body) => {
    if (config.selected_scenarios && !config.selected_scenarios.includes(id)) return;
    activeScenario = id;
    const row = rows.find(row => row.id === id);
    const start = actions.length, beforeErrors = pageErrors.length;
    const before = custody(config.workspace_id);
    const began = Date.now();
    try {
      await body();
      assert.equal(pageErrors.length, beforeErrors, 'BROWSER_PAGE_ERROR');
      const attemptedWrites = actions.slice(start).filter(request => request.method !== 'GET');
      assert.deepEqual(attemptedWrites, [], 'NO_IMPLICIT_API_MUTATION');
      const after = custody(config.workspace_id);
      assert.deepEqual(after, before, 'NO_JOB_SELECTION_APPROVAL_LIFECYCLE_OR_IMMUTABLE_DB_MUTATION');
      row.scopes.push({ scope, status: 'PASS', elapsed_ms: Date.now() - began, before, after,
        request_count: actions.length - start, forbidden_method_count: attemptedWrites.length });
      // A later fixture/browser subcase must never erase a failed real subcase.
      if (!row.scopes.some(value => value.status === 'FAIL')) {
        row.status = full ? 'PASS' : 'SCOPED_PASS';
        row.reason = full ? null : 'Named scope passed; the unexercised scenario branch remains required.';
      }
      await page.screenshot({ path: join(config.out, `${id}-${row.scopes.length}.png`), fullPage: true });
    } catch (error) {
      row.status = 'FAIL'; row.reason = String(error.message).slice(0, 600);
      row.scopes.push({ scope, status: 'FAIL', elapsed_ms: Date.now() - began });
      receipt.failed_assertions.push({ id, scope, reason: row.reason });
      await page.screenshot({ path: join(config.out, `${id}-failed.png`), fullPage: true }).catch(() => {});
    } finally { activeScenario = null; save(join(config.out, 'p24-scenario-receipt.json'), receipt); }
  };
  const scopedUrl = path => {
    const url = new URL(path, BASE_URL);
    assert.equal(url.origin, BASE_URL, 'OWNED_BROWSER_ORIGIN_ONLY');
    url.searchParams.set('workspace_id', config.workspace_id);
    return url.href;
  };
  const go = async (run, tail, hash = '') => {
    await page.goto(scopedUrl(`${PREFIX}/runs/${run}/${tail}${hash}`), { waitUntil: 'domcontentloaded' });
    await page.locator('[data-screen]').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(500);
  };
  try {
    const login = await context.request.post(`${BASE_URL}/api/auth/login`, {
      headers: { origin: config.origin }, data: { username: config.username,
        credential: config.user?.password ?? privateRead(config.credential_path).trim() },
    });
    assert(login.ok(), `OWNED_QA_SIGNIN:${login.status()}`);
    // Do not persist the response's cookies or its authentication payload.
    await page.goto(scopedUrl(`${PREFIX}/runs`), { waitUntil: 'domcontentloaded' });
    const auth = await get('/api/auth/context');
    assert.equal(auth.state, 'AUTHENTICATED');
    receipt.actor_id = auth.principal.principalId;
    for (const service of ['control-api', 'portal-api', 'quant-worker-py', 'portal-web']) receipt.images[service] = ownedImage(service);
    for (const [service, expected] of Object.entries(config.expected_images ?? {})) {
      assert.equal(receipt.images[service], expected, `DECLARED_CANDIDATE_PIN_MISMATCH:${service}`);
    }
    receipt.bundle = await page.locator('script[src*="/assets/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    const library = await get(`/api/v1/quantbt/runs?limit=50&workspace_id=${encodeURIComponent(config.workspace_id)}`);
    const find = label => library.items.find(row => row.display_label === label)?.run_id;
    const runs = { global: find('R-WFO-023'), causal: find('R-WFO-027'), fixed: find('R-P04-022'), ...config.runs };
    receipt.runs = runs;
    assert(runs.global && runs.causal && runs.fixed, 'THREE_REAL_INPUT_LANES_REQUIRED');
    const api = (run, tail) => `/api/v1/quantbt/runs/${run}/${tail}?workspace_id=${encodeURIComponent(config.workspace_id)}`;
    await probe('SC-05', 'source study/trials scopes across global and per-fold progress; no synthetic denominator', false, async () => {
      const observed = [];
      for (const run of [runs.global, runs.causal]) {
        const search = await get(api(run, 'current-source/search'));
        const progress = await get(`/api/v1/research/runs/${run}/progress?workspace_id=${encodeURIComponent(config.workspace_id)}`);
        assert(progress.progress, 'RETAINED_PROGRESS_REQUIRED');
        const contract = search.search_contract;
        assert(Number.isInteger(contract.n_studies) && contract.n_studies > 0, 'SOURCE_STUDY_COUNT_REQUIRED');
        assert(['global', 'per_fold'].includes(contract.optuna_trials_scope), 'SOURCE_TRIAL_SCOPE_REQUIRED');
        assert(progress.progress.overall.trials_done <= progress.progress.overall.trials_declared, 'SOURCE_COUNTER_EXCEEDS_DECLARATION');
        await go(run, 'progress');
        await expect(page.locator('[data-progress-text]').first()).toContainText(`${progress.progress.overall.trials_done}`);
        await go(run, 'search');
        observed.push({ run_id: run, schedule: contract.optimization_schedule, n_studies: contract.n_studies,
          optuna_trials_scope: contract.optuna_trials_scope, optuna_trials_per_study: contract.optuna_trials_per_study,
          source_counters: progress.progress.overall });
      }
      receipt.rows.find(row => row.id === 'SC-05').observed_budget_scopes = observed;
    });
    await probe('SC-01', 'non-selected pick -> Freeze -> Report -> RC -> Back, immutable custody and GET-only', true, async () => {
      await go(runs.global, 'search', '#fold=3');
      const search = await get(api(runs.global, 'current-source/search'));
      const freeze = await get(api(runs.global, 'current-source/freeze'));
      const rc = await get(api(runs.global, 'release-candidate'));
      const trial = page.locator('[data-trial][data-trial-selected="false"]').first();
      await trial.waitFor({ state: 'visible', timeout: 20000 });
      const id = await trial.getAttribute('data-trial');
      await trial.click();
      await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('pick')).toBe(id);
      const pickedUrl = page.url();
      for (const screen of ['freeze', 'report', 'release-candidate']) await go(runs.global, screen, new URL(pickedUrl).hash);
      await page.goBack(); await page.goBack(); await page.goBack();
      assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('pick'), id);
      assert.deepEqual(causalSelection(await get(api(runs.global, 'current-source/search'))), causalSelection(search));
      assert.deepEqual(causalSelection(await get(api(runs.global, 'current-source/freeze'))), causalSelection(freeze));
      const after = await get(api(runs.global, 'release-candidate'));
      assert.deepEqual(after.selected_params, rc.selected_params); assert.deepEqual(after.local_seal, rc.local_seal);
    });
    await probe('SC-09', 'per-fold causal navigation and study-local selection, no global/fold-last substitution', false, async () => {
      await go(runs.causal, 'search', '#fold=2');
      await page.locator('[data-study-pick]').first().waitFor({ state: 'visible', timeout: 20000 });
      // Public F2 is one-based; the source's fold id/query is zero-based 1.
      const search = await get(`/api/v1/quantbt/runs/${runs.causal}/current-source/search?fold=1&workspace_id=${encodeURIComponent(config.workspace_id)}`);
      assert.equal(search.selection.selected_trial_ordinal_scope, 'STUDY_LOCAL');
      // LAST_FOLD_DEPLOYMENT is a legitimate, explicit output of a causal
      // schedule. It must not be confused with inspection of another study.
      // Do not make the receipt forbid the source's honest deployment scope.
      assert.equal(search.selection.scope, 'LAST_FOLD_DEPLOYMENT');
      assert.equal(search.ledger.fold_filter.fold_id, '1');
      const study = search.surfaces_by_study.find(value => value.fold_id === '1');
      assert(study, 'INSPECTED_FOLD_MUST_HAVE_ITS_OWN_STUDY_SURFACE');
      assert.equal(study.scope, 'INNER_VALIDATION_OUTER_STUDY');
      await expect(page.locator('[data-study-pick][aria-current="true"]').first()).toHaveText('F2');
      for (const screen of ['freeze', 'execute', 'release-candidate']) await go(runs.causal, screen, '#fold=2');
      const rc = await get(api(runs.causal, 'release-candidate'));
      assert.equal(rc.selected_params?.selected_trial_number_scope, 'STUDY_LOCAL');
      receipt.rows.find(row => row.id === 'SC-09').causal_selection_observed = causalSelection(search);
      receipt.rows.find(row => row.id === 'SC-09').inspected_study_observed = {
        fold_filter: search.ledger.fold_filter, fold_id: study.fold_id, study_id: study.study_id, scope: study.scope };
    });
    await probe('SC-11', 'sealed holdout card remains metadata-only with no invented unlock', true, async () => {
      const split = await get(api(runs.fixed, 'split'));
      assert.equal(split.windows.holdout.child_input_state, 'NOT_EXPOSED_TO_CHILD_TAPE');
      assert.equal(split.windows.holdout.evaluation_state, 'NOT_EVALUATED');
      assert.equal(split.actions.holdout_unlock.state, 'NOT_PUBLISHED');
      assert.equal(split.actions.holdout_unlock.href, null);
      await go(runs.fixed, 'split');
      const holdout = page.locator('[data-action-unlock]').first();
      await holdout.waitFor({ state: 'attached', timeout: 20000 });
      assert.equal(await holdout.getAttribute('data-action-unlock'), 'NOT_PUBLISHED');
      assert.equal(await holdout.getAttribute('aria-disabled'), 'true');
      const wording = await page.locator('[data-holdout-rule="unlock"]').first().innerText();
      assert.match(wording, /unlock|holdout/i);
    });
    await probe('SC-15', 'mount / cursor / refresh on existing what-if panel produce no compute', false, async () => {
      await go(runs.global, 'freeze');
      await page.locator('[data-frozen-table]').first().waitFor({ state: 'visible', timeout: 20000 });
      const widgets = page.locator('[role="slider"], input[type="range"]');
      if (await widgets.count()) { await widgets.first().focus(); await page.keyboard.press('ArrowRight'); }
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-screen="freeze-detail"]').waitFor({ state: 'visible' });
      await page.locator('[data-frozen-table]').first().waitFor({ state: 'visible', timeout: 20000 });
    });
    await probe('SC-17', 'causal Reveal -> seek through window -> fold change; frozen digest unchanged', false, async () => {
      await go(runs.causal, 'execute', '#fold=2');
      const reveal = page.locator('[data-action="causal-reveal"]');
      await reveal.waitFor({ state: 'visible', timeout: 25000 });
      if ((await reveal.getAttribute('aria-pressed')) !== 'true') await reveal.click();
      const slider = page.locator('[data-seek]').first(); await slider.focus(); await page.keyboard.press('End');
      const next = page.locator('[aria-label="next fold"]').first();
      assert(await next.isEnabled(), 'CAUSAL_SECOND_FOLD_REQUIRED'); await next.click();
      await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('fold')).not.toBe('2');
      await expect(reveal).toHaveAttribute('aria-pressed', 'true');
      const summaries = page.locator('[data-fold-end-equity], [data-reveal-hidden]');
      assert((await summaries.count()) > 0, 'REVEAL_SCOPE_LABELS_REQUIRED');
      const folds = page.locator('button[data-fold]');
      const active = await folds.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-pressed') === 'true'));
      assert(active >= 0, 'ACTUAL_ACTIVE_FOLD_REQUIRED');
      const hiddenFoldSummaries = [];
      for (let index = active; index < await folds.count(); index++) {
        const fold = folds.nth(index);
        assert.equal(await fold.locator('[data-fold-end-equity]').count(), 0, 'ACTIVE_OR_FUTURE_EQUITY_MUST_BE_REDACTED');
        assert.equal(await fold.locator('[data-reveal-hidden]').count(), 1, 'ACTIVE_OR_FUTURE_FOLD_REDACTION_LABEL_REQUIRED');
        const title = await fold.getAttribute('title');
        assert.doesNotMatch(title ?? '', /Sharpe|equity\s+.*→|\d+\s+transitions/i, 'TOOLTIP_MUST_NOT_LEAK_FUTURE_RESULT');
        hiddenFoldSummaries.push(await fold.getAttribute('data-fold'));
      }
      await expect(page.locator('[data-cost-total]').first()).toHaveAttribute('data-cost-total', 'hidden');
      receipt.rows.find(row => row.id === 'SC-17').redacted_fold_ids = hiddenFoldSummaries;
    });
    await probe('SC-16', 'retained replay next/prev follows exact source ordinals, not timestamp interpolation', false, async () => {
      await go(runs.causal, 'execute', '#fold=2');
      const readout = page.locator('[data-playhead-readout]').first();
      await readout.waitFor({ state: 'visible', timeout: 25000 });
      const first = Number(await readout.getAttribute('data-playhead-readout'));
      assert(Number.isInteger(first) && first >= 0, 'SOURCE_ORDINAL_REQUIRED');
      for (const ordinal of [first + 1, first + 2]) {
        await page.locator('[aria-label="step forward"]').first().click();
        await expect(readout).toHaveAttribute('data-playhead-readout', String(ordinal));
      }
      await page.locator('[aria-label="step back"]').first().click();
      await expect(readout).toHaveAttribute('data-playhead-readout', String(first + 1));
      await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('seq')).toBe(String(first + 2));
      receipt.rows.find(row => row.id === 'SC-16').source_ordinals_observed = [first, first + 1, first + 2, first + 1];
    });
    await probe('SC-18', 'six fresh deep links / conflicting aliases / history preserve frozen selection', false, async () => {
      const links = [
        ['search', '#fold=2&trial=1&pick=2&study=fold_02'], ['freeze', '#fold=2&trial=1'],
        ['execute', '#fold=2&seq=6'], ['execute', '#fold=2&event_seq=6'],
        ['execute', '#fold=2&seq=6&event_seq=7'], ['execute', '#fold=2&trade=1&seq=6'],
      ];
      for (const [tail, hash] of links) {
        const fresh = await context.newPage();
        await fresh.route('**/api/**', route => route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient'));
        fresh.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) {
          const record = { scenario: activeScenario, method: request.method(), path: safeRecordedPath(request.url()) };
          actions.push(record); allRequests.push(record);
        } });
        await fresh.goto(scopedUrl(`${PREFIX}/runs/${runs.causal}/${tail}${hash}`), { waitUntil: 'domcontentloaded' });
        await fresh.locator('[data-screen]').first().waitFor({ state: 'visible', timeout: 25000 });
        await fresh.waitForTimeout(500);
        assert(!await fresh.locator('[data-screen]').first().innerText().then(text => text.trim().length === 0), 'DEEP_LINK_RENDER_REQUIRED');
        // A nonempty guard/refusal page is not evidence that a valid link
        // resolved. Require the product lane's actual source-backed content.
        const contentSelector = tail === 'search' ? '[data-trial]' : tail === 'freeze'
          ? '[data-frozen-table]' : '[data-playhead-readout]';
        await fresh.locator(contentSelector).first().waitFor({ state: 'visible', timeout: 25000 });
        if (hash.includes('event_seq=7')) assert((await fresh.locator('[data-cursor-notice], [data-cursor-code], [data-cursor-problem]').count()) > 0 || !new URL(fresh.url()).hash.includes('event_seq=7'), 'CONFLICT_MUST_BE_TYPED_OR_NORMALIZED');
        await fresh.close();
      }
      await go(runs.causal, 'search', '#fold=2');
      const picks = page.locator('[data-study-pick]');
      await picks.filter({ hasText: /^F3$/ }).first().click();
      await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('fold')).toBe('3');
      await page.goBack();
      await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.slice(1)).get('fold')).toBe('2');
    });
    await probe('SC-20', 'existing publication and lineage read-only; no Research reset/revoke/max metric pick', false, async () => {
      const before = await get(api(runs.causal, 'release-candidate'));
      await page.goto(scopedUrl(`${PREFIX}/alphas/delta-rsi-polynomial-alpha/lineage`), { waitUntil: 'domcontentloaded' });
      await page.locator('[data-screen="attempt-lineage"]').waitFor({ state: 'visible' });
      await go(runs.causal, 'release-candidate');
      const after = await get(api(runs.causal, 'release-candidate'));
      assert.deepEqual(after.local_seal, before.local_seal);
      assert.deepEqual(after.selected_params, before.selected_params);
    });
    await probe('SC-21', 'old run opens Engine Atlas without changing source evidence or activating route', false, async () => {
      await page.goto(scopedUrl(`${PREFIX}/atlas?run=${runs.global}`), { waitUntil: 'domcontentloaded' });
      await page.locator('[data-screen="engine-atlas"]').waitFor({ state: 'visible' });
      const atlas = await get('/api/v1/research/quantbt/atlas');
      assert.equal(atlas.atlas.current_release.expected_version, '1.1.1');
    });
    if (config.technical_fixture_probes) {
      await probe('SC-14', 'typed Compare zero-variance / no-overlap absence, browser mapping only', false, async () => {
        const fixturePath = join(ROOT, 'packages/contracts/fixtures/research-compare.pair-nocorr.valid.json');
        const canonical = JSON.parse(readFileSync(fixturePath, 'utf8'));
        const reasonCodes = ['P20_ZERO_VARIANCE_RAW_RETURNS', 'P20_NO_COMMON_RAW_RETURN_WINDOW'];
        const pattern = '**/api/v1/research/alphas/**/compare?**';
        for (const reasonCode of reasonCodes) {
          const fixture = structuredClone(canonical);
          fixture.result.pair.correlation.availability.reason_code = reasonCode;
          fixture.result.pair.correlation.value = null;
          if (reasonCode === 'P20_NO_COMMON_RAW_RETURN_WINDOW') {
            const absent = { state: 'NOT_PUBLISHED', reason_code: reasonCode };
            fixture.result.pair.correlation.n = 0;
            fixture.result.pair.correlation.common_window_start_utc_ms = null;
            fixture.result.pair.correlation.common_window_end_utc_ms = null;
            Object.assign(fixture.result.pair.common_window, { state: 'NOT_PUBLISHED', matched_observation_count: 0,
              start_utc_ms: null, end_utc_ms: null, availability: absent });
            for (const metric of fixture.result.pair.common_window.metrics) {
              if (metric.availability.state !== 'NOT_APPLICABLE') Object.assign(metric, {
                left_value: null, right_value: null, delta: null, availability: absent });
            }
            Object.assign(fixture.result.pair.overlay, { state: 'NOT_PUBLISHED', sampling: 'NOT_APPLICABLE',
              source_observation_count: null, emitted_point_count: null, points: [], availability: absent });
            fixture.result.state = 'PARTIAL'; fixture.availability = { state: 'PARTIAL', reason_code: reasonCode };
          }
          assert(!/\b(?:NaN|Infinity)\b/.test(JSON.stringify(fixture)), 'FIXTURE_TYPED_NULL_NOT_SPECIAL_NUMBER');
          await page.route(pattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
          try {
            await page.goto(scopedUrl(`${PREFIX}/alphas/${fixture.alpha.alpha_id}/compare?mode=pair&runs=${fixture.result.pair.runs.map(run => run.run_id).join(',')}`), { waitUntil: 'domcontentloaded' });
            await page.locator('[data-correlation-absent]').waitFor({ state: 'visible', timeout: 20000 });
            assert.equal(await page.locator('[data-rho]').count(), 0, 'ABSENT_CORRELATION_MUST_NOT_RENDER_ZERO');
            assert.equal(await page.locator('[data-correlation]').getAttribute('data-correlation'), 'NOT_PUBLISHED');
            assert.doesNotMatch(await page.locator('[data-correlation]').innerText(), /(?:\bNaN\b|ρ\s*=\s*0)/);
            receipt.fixture_claims.push({ scenario: 'SC-14', lane: 'TECHNICAL_FIXTURE_BROWSER',
              reason_code: reasonCode, canonical_fixture_sha256: HASH(readFileSync(fixturePath, 'utf8')),
              injected_response_sha256: HASH(fixture), source_data_or_engine_claim: false });
            await page.screenshot({ path: join(config.out, `SC-14-${reasonCode}.png`), fullPage: true });
          } finally { await page.unroute(pattern); }
        }
      });
      const numeric = rows.find(row => row.id === 'SC-14');
      numeric.lane = 'TECHNICAL_FIXTURE_BROWSER';
      if (numeric.status === 'SCOPED_PASS') numeric.reason = 'Two typed absence mapping cases passed; no-loss/infinity, missing benchmark and categorical-permutation branches still require their named fixture/source proofs.';
      await probe('SC-16', 'technical typed sequence-gap refusal with no invented replay row or compute', false, async () => {
        const problem = { error: { code: 'RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP',
          message: 'A retained replay window is missing a sealed observation; no row is invented to close the gap.' },
          request_id: 'p24-technical-sequence-gap' };
        const pattern = `**/api/v1/quantbt/runs/${runs.causal}/current-source/replay?**`;
        let intercepted = 0;
        await page.route(pattern, route => {
          assert.equal(route.request().method(), 'GET', 'FIXTURE_NAMED_REPLAY_GET_ONLY');
          intercepted++;
          return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify(problem) });
        });
        try {
          await go(runs.causal, 'execute', '#fold=2');
          // A same-path fragment change may legitimately reuse the loaded
          // read window. Force a fresh document for this synthetic transport
          // negative so the named GET actually consumes the injected 503.
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.locator('[data-screen="execute-replay"] [data-state="unavailable"]').first()
            .waitFor({ state: 'visible', timeout: 20000 });
          assert(intercepted > 0, 'DECLARED_SEQUENCE_GAP_FIXTURE_MUST_BE_CONSUMED');
          assert.equal(await page.locator('[data-playhead-readout]').count(), 0, 'REFUSED_REPLAY_MUST_NOT_INVENT_ROWS');
          await page.locator('[data-action="retry-retained"]').waitFor({ state: 'visible', timeout: 20000 });
          receipt.fixture_claims.push({ scenario: 'SC-16', lane: 'TECHNICAL_FIXTURE_BROWSER',
            reason_code: problem.error.code,
            problem_schema_sha256: HASH(readFileSync(join(ROOT, 'packages/contracts/openapi/research-current-source.openapi.json'), 'utf8')),
            injected_response_sha256: HASH(problem), source_data_or_engine_claim: false });
        } finally { await page.unroute(pattern); }
      });
      const ordinal = rows.find(row => row.id === 'SC-16');
      if (ordinal.scopes.some(value => value.scope.startsWith('technical typed sequence-gap'))) {
        ordinal.lane = 'REAL_API_AND_TECHNICAL_FIXTURE_BROWSER';
        if (ordinal.status === 'SCOPED_PASS') ordinal.reason = 'Actual ordinal stepping and typed gap consumer mapping passed; equal event timestamps/raw-event gaps were not manufactured from dense market-bar observations.';
      }
    }
    if (config.write_negative_probes) await runNegativeApiProbes({ config, context, page, expect, scopedUrl,
      setActiveScenario: id => { activeScenario = id; }, receipt, rows, get, runs });
  } finally {
    receipt.requests = allRequests; receipt.page_errors = pageErrors;
    try {
      receipt.images_final = Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py', 'portal-web'].map(service =>
        [service, ownedImage(service)]));
      receipt.bundle_final = await page.locator('script[src*="/assets/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
      receipt.candidate_images_stable = JSON.stringify(receipt.images_final) === JSON.stringify(receipt.images)
        && JSON.stringify(receipt.bundle_final) === JSON.stringify(receipt.bundle);
      if (!receipt.candidate_images_stable) receipt.failed_assertions.push({ id: 'CANDIDATE_IDENTITY',
        reason: 'Runtime images changed during the lane; this is not an exact-candidate aggregate receipt.' });
    } catch {
      receipt.candidate_images_stable = false;
      receipt.failed_assertions.push({ id: 'CANDIDATE_IDENTITY', reason: 'Final owned image identity could not be verified.' });
    }
    receipt.totals = scenarioTotals(rows);
    save(join(config.out, 'p24-scenario-receipt.json'), receipt);
    const cookie = (await context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
    await context.request.post(`${BASE_URL}/api/auth/logout`, { headers: { origin: config.origin, cookie } }).catch(() => {});
    await browser.close();
    console.log(JSON.stringify({ receipt: join(config.out, 'p24-scenario-receipt.json'), totals: receipt.totals,
      failed_assertion_count: receipt.failed_assertions.length }));
    if (receipt.failed_assertions.length) process.exitCode = 1;
  }
}
async function runNegativeApiProbes({ config, context, page, expect, scopedUrl, setActiveScenario, receipt, rows, get, runs }) {
  const allowed = id => !config.selected_scenarios || config.selected_scenarios.includes(id);
  const csrf = (await context.cookies()).find(cookie => cookie.name === '__Host-portal_csrf')?.value;
  assert(csrf, 'REAL_CSRF_COOKIE_REQUIRED');
  const post = async (path, data) => {
    const cookie = (await context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
    const response = await context.request.post(`${BASE_URL}${path}`, { headers: { origin: config.origin, 'x-portal-csrf': csrf, cookie },
      data: { ...data, workspace_id: config.workspace_id } });
    const body = await response.json();
    receipt.requests.push({ method: 'POST', path, status: response.status(), response_sha256: HASH(body) });
    return { status: response.status(), body };
  };
  // This is specifically an API-side stale-receipt edge, not the browser edit
  // half. Parsing/gates may add source/validation telemetry; registration may not.
  if (allowed('SC-02')) {
  const row = rows.find(row => row.id === 'SC-02');
  const before = custody(config.workspace_id);
  const source = `ALPHA_CONTRACT = {"schema_version":"research.alpha-source.v1","version":"0.1.0","entrypoint":"generate_signals","timeframes":["1h"],"required_columns":["open","high","low","close","volume"],"warmup_bars":2,"determinism":{"seed_required":True},"parameter_space":{"scale":{"kind":"int_range","low":100,"high":1000,"step":100}}}\ndef generate_signals(context):\n    return {"schema_version":"research.imported-signal-notional-output.v1","signal_notional": context["parameters"]["scale"]}\n# ${randomUUID()}\n`;
  try {
    const old = await post('/api/v1/research/alphas/import/parse', { original_filename: 'p24-scenario.py', source_text: source, expected_source_digest: HASH(source) });
    assert.equal(old.status, 201);
    const gates = await post('/api/v1/research/alphas/import/gates', { source_file_ref: old.body.source_file_ref });
    assert.equal(gates.status, 200); assert.equal(gates.body.all_pass, true);
    const edited = `${source}# bytes changed after validating\n`;
    const changed = await post('/api/v1/research/alphas/import/parse', { original_filename: 'p24-scenario-edited.py', source_text: edited, expected_source_digest: HASH(edited) });
    assert.equal(changed.status, 201); assert.notEqual(changed.body.source_file_ref, old.body.source_file_ref);
    const refused = await post('/api/v1/research/alphas/import/register', { source_file_ref: changed.body.source_file_ref,
      gate_receipt_id: gates.body.gate_receipt_id, alpha_id: 'p24-stale-receipt' });
    assert([400, 409].includes(refused.status), 'STALE_IMPORT_RECEIPT_MUST_BE_REFUSED');
    assert.equal(typeof refused.body.error?.code, 'string');
    assert.deepEqual(custody(config.workspace_id), before, 'STALE_REGISTER_CREATED_NO_ALPHA_VERSION_ATTEMPT_JOB_OR_PACK');
    row.status = 'SCOPED_PASS'; row.reason = 'Real API stale-bytes refusal passed; browser readonly mirror branch remains required.';
    row.scopes.push({ scope: 'real API stale source gate receipt cannot register a version', status: 'PASS',
      reason_code: refused.body.error.code, source_sha256: HASH(source), edited_source_sha256: HASH(edited), before, after: custody(config.workspace_id) });
    setActiveScenario('SC-02');
    const acceptedBrowserPaths = ['/api/v1/research/alphas/import/parse', '/api/v1/research/alphas/import/gates'];
    for (const path of acceptedBrowserPaths) await page.route(`**${path}`, route => {
      assert.equal(new URL(route.request().url()).origin, BASE_URL, 'OWNED_BROWSER_WRITE_ONLY');
      return route.continue();
    });
    try {
      await page.goto(scopedUrl(`${PREFIX}/alpha-import`), { waitUntil: 'domcontentloaded' });
      const screen = page.locator('[data-screen="alpha-import"]');
      await screen.waitFor({ state: 'visible', timeout: 20000 });
      await screen.getByLabel('Alpha source text').fill(source);
      const posted = async (path, selector, status) => {
        const response = page.waitForResponse(answer => new URL(answer.url()).pathname === path
          && answer.request().method() === 'POST', { timeout: 20000 });
        await screen.locator(selector).click();
        const answer = await response; const body = await answer.json();
        assert.equal(answer.status(), status, `BROWSER_WRITE_REFUSED:${path}:${body.error?.code ?? 'NONE'}`);
        return body;
      };
      const parsed = await posted(acceptedBrowserPaths[0], '[data-action="parse"]', 201);
      await expect(screen.locator('[data-mirror-field]')).toHaveCount(parsed.mirror.length);
      assert(parsed.mirror.length > 0, 'ACTUAL_SOURCE_MIRROR_REQUIRED');
      assert.equal(await screen.locator('[data-mirror] input, [data-mirror] textarea, [data-mirror] select, [data-mirror] [contenteditable="true"]').count(), 0, 'MIRROR_MUST_REMAIN_READONLY');
      await screen.locator('[data-step-marker="2"]').click();
      const gateReply = await posted(acceptedBrowserPaths[1], '[data-action="run-gates"]', 200);
      assert.equal(gateReply.all_pass, true, 'ACTUAL_SEVEN_GATES_REQUIRED');
      await expect(screen.locator('[data-gate-state="PASS"]')).toHaveCount(7);
      await screen.locator('[data-step-marker="1"]').click();
      await screen.getByLabel('Alpha source text').fill(edited);
      await screen.locator('[data-step-marker="3"]').click();
      await screen.getByLabel('Alpha id').fill('p24-browser-stale-receipt');
      await expect(screen.locator('[data-action="register"]')).toBeDisabled();
      assert.equal(await screen.locator('[data-gate-state="PASS"]').count(), 0, 'SOURCE_EDIT_MUST_INVALIDATE_OLD_UI_GATE_RECEIPT');
      assert.deepEqual(custody(config.workspace_id), before, 'BROWSER_PARSE_EDIT_CREATED_NO_CORE_STATE_OR_JOB');
      row.status = 'PASS'; row.reason = null;
      row.scopes.push({ scope: 'real browser parse + seven gates; mirror readonly; source edit disables Register, no valid registration',
        status: 'PASS', mirror_rows: parsed.mirror.length, source_sha256: HASH(source), edited_source_sha256: HASH(edited),
        before, after: custody(config.workspace_id) });
      await page.screenshot({ path: join(config.out, 'SC-02-stale-register-disabled.png'), fullPage: true });
    } finally {
      for (const path of acceptedBrowserPaths) await page.unroute(`**${path}`);
      setActiveScenario(null);
    }
  } catch (error) { row.status = 'FAIL'; row.reason = error.message; receipt.failed_assertions.push({ id: 'SC-02', reason: error.message }); }
  }
  if (!allowed('SC-03') && !allowed('SC-04')) return;
  const request = (await get(`/api/v1/research/runs/${runs.global}/requested-spec?workspace_id=${encodeURIComponent(config.workspace_id)}`)).requested_spec;
  if (allowed('SC-03')) {
  const declaration = await get(`/api/v1/research/alphas?alpha_id=${encodeURIComponent(request.alpha_binding.alpha_id)}&workspace_id=${encodeURIComponent(config.workspace_id)}`);
  const version = declaration.entries.find(entry => entry.alpha_version_id === request.alpha_binding.alpha_version_id);
  const range = Object.entries(version?.declaration?.parameter_space ?? {}).find(([, value]) => ['int_range', 'float_range'].includes(value.kind));
  const narrowRow = rows.find(row => row.id === 'SC-03');
  const narrowBefore = custody(config.workspace_id);
  if (range) {
    try {
      const [name, value] = range;
      const narrow = structuredClone(request);
      narrow.parameter_space_overrides = narrow.parameter_space_overrides.filter(override => override.name !== name);
      narrow.parameter_space_overrides.push({ kind: 'pin', name, value: value.low });
      const accepted = await post('/api/v1/research/preflights', { requested_spec: narrow });
      assert.equal(accepted.status, 201, 'WITHIN_DECLARATION_PREFLIGHT_MUST_VALIDATE');
      const gate = accepted.body.gates?.find(gate => gate.key === 'alpha_declaration');
      assert(!gate || ['PASS', 'NOT_APPLICABLE'].includes(gate.state), 'WITHIN_DECLARATION_GATE_FAILED');
      const wide = structuredClone(narrow);
      wide.parameter_space_overrides[wide.parameter_space_overrides.length - 1].value = value.high + value.step;
      const refused = await post('/api/v1/research/preflights', { requested_spec: wide });
      assert.equal(refused.status, 409, 'OUTSIDE_DECLARATION_PIN_MUST_BE_REFUSED');
      assert.equal(refused.body.error?.code, 'RESEARCH_PREFLIGHT_INVALID');
      assert.deepEqual(custody(config.workspace_id), narrowBefore, 'PINNING_PREFLIGHTS_MUST_NOT_MODIFY_OLD_RUN_OR_JOB');
      narrowRow.status = 'SCOPED_PASS'; narrowRow.reason = 'Actual within-declaration pin and outside-declaration refusal passed; new-intent and UI widen-link branches remain required.';
      narrowRow.scopes.push({ scope: 'real preflight within declared pin / invalid widened pin', status: 'PASS', parameter: name,
        version_id: version.alpha_version_id, declaration_sha256: HASH(version.declaration), reason_code: refused.body.error.code,
        producer_may_create: accepted.body.may_create_run, before: narrowBefore, after: custody(config.workspace_id) });
    } catch (error) { narrowRow.status = 'FAIL'; narrowRow.reason = error.message; receipt.failed_assertions.push({ id: 'SC-03', reason: error.message }); }
  } else narrowRow.reason = 'The actual bound version publishes no range that can exercise narrow/widen; no range was invented.';
  }
  if (!allowed('SC-04')) return;
  const aliasBefore = custody(config.workspace_id);
  const malformed = structuredClone(request);
  malformed.optimization_config = { ...(malformed.optimization_config ?? {}), n_trials: malformed.optuna_trials + 1 };
  const alias = await post('/api/v1/research/preflights', { requested_spec: malformed });
  const aliasRow = rows.find(row => row.id === 'SC-04');
  if ([400, 409].includes(alias.status) && typeof alias.body.error?.code === 'string') {
    assert.deepEqual(custody(config.workspace_id), aliasBefore);
    aliasRow.status = 'SCOPED_PASS'; aliasRow.reason = 'Conflicting n_trials alias refused on real API; UI sync/create/effective-worker equality still required.';
    aliasRow.scopes.push({ scope: 'crafted conflicting trials alias refused, no job/immutable state write', status: 'PASS', reason_code: alias.body.error.code, before: aliasBefore, after: custody(config.workspace_id) });
  } else { aliasRow.status = 'FAIL'; aliasRow.reason = `CONFLICTING_ALIAS_ACCEPTED:${alias.status}:${alias.body.error?.code ?? 'NONE'}`; receipt.failed_assertions.push({ id: 'SC-04', reason: aliasRow.reason }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`P24_SCENARIO_HARNESS_REFUSED:${String(error.message).slice(0, 300)}`); process.exitCode = 1;
});
