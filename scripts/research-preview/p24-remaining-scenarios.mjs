#!/usr/bin/env node
/** Remaining P24 branches only. Owned clone, normal temporary QA, one browser. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT, BASE_URL, validateHome } from '../research-p23/cell.mjs';
import { container, dbQuery, docker } from '../research-p23/runtime-tools.mjs';
import { SCENARIOS, privateRead, safeRecordedPath } from './p24-scenario-closeout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const flag = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const RUN = /^rrun_[a-f0-9]{32}$/;
const IMAGE = /^sha256:[a-f0-9]{64}$/;
const missing = reason_code => ({ state: 'NOT_PUBLISHED', reason_code });
const clone = structuredClone;

export function validateConfig(input) {
  assert.equal(input.project, PROJECT); assert.equal(input.base_url, BASE_URL); assert.equal(input.origin, BASE_URL);
  assert(['READ_AND_TECHNICAL', 'AUDIT_ALLOCATE', 'AUDIT_RETRY', 'AUDIT_VERIFY'].includes(input.mode ?? 'READ_AND_TECHNICAL'));
  for (const [key, name] of Object.entries({ a: 'p24-round2-a', b: 'p24-round2-b', producer: 'p24-round2-producer' }))
    assert.equal(input.actors?.[key]?.username, name, `EXACT_TEMPORARY_QA:${key}`);
  assert(input.workspace_id && input.alternate_workspace_id && input.workspace_id !== input.alternate_workspace_id);
  for (const key of ['global', 'causal', 'fixed']) assert.match(input.runs?.[key] ?? '', RUN);
  for (const service of ['control-api', 'portal-api', 'portal-web', 'quant-worker-py']) assert.match(input.expected_images?.[service] ?? '', IMAGE);
  if (input.audit_parent) assert.match(input.audit_parent, RUN);
  if (input.mode === 'AUDIT_RETRY') {
    assert.equal(input.audit_parent, 'rrun_a76afa62adb6c427ba2f4cec44bb43bd');
    assert.equal(input.previous_failed_child, 'rrun_529acb9966b568e3c93f125340f26b9a');
    assert.equal(input.expected_audit_target, '3a5ae58b456d1495f940127dea8ea34a471ec152773daa44fa7cf4bd6e2aa681');
  }
  if (input.selected_cells) assert(Array.isArray(input.selected_cells) && input.selected_cells.length > 0 &&
    new Set(input.selected_cells).size === input.selected_cells.length &&
    input.selected_cells.every(id => typeof id === 'string' && id.startsWith('SC')));
  return { ...input, mode: input.mode ?? 'READ_AND_TECHNICAL', out: validateHome(input.out) };
}
export function writeKind(method, pathname, phase, auditParent) {
  if (method === 'GET') return 'READ';
  if (method === 'POST' && ['/api/auth/login', '/api/auth/logout'].includes(pathname)) return 'AUTH';
  if (method === 'POST' && pathname === '/api/v1/research/datasets/declaration-estimates') return 'METADATA_READ';
  if (method === 'POST' && pathname === '/api/v1/research/preflights' && phase === 'NEGATIVE_PREFLIGHT') return 'PREFLIGHT';
  if (method === 'POST' && pathname === '/api/v1/research/runs' && phase === 'SCRATCH_REFUSAL') return 'CREATE_REFUSAL';
  if (method === 'POST' && pathname === `/api/v1/quantbt/runs/${auditParent}/final-audit` && phase === 'AUDIT_ALLOCATE') return 'AUDIT';
  return 'FORBIDDEN';
}
const selectionAbsent = (value, reason) => {
  value.selected_trial_id = null; value.objective = null; value.parameters = {}; value.availability = missing(reason);
  if ('selected_trial_ordinal' in value) Object.assign(value, { selected_trial_ordinal: null,
    selected_trial_ordinal_scope: null, selected_trial_ordinal_reason_code: 'SELECTION_HAS_NO_TRIAL' });
};
export function selectionFixture(base, kind) {
  assert(['NONE', 'CENTROID'].includes(kind));
  const value = clone(base), reason = kind === 'NONE' ? 'QUANTBT_SELECTION_NOT_PRODUCED' : 'P21_TRIAL_ORDINAL_NOT_APPLICABLE';
  if (value.surface) {
    value.surface.selected_trial_id = null;
    for (const point of value.surface.points) point.selected = false;
  }
  for (const key of ['selection', 'frozen_selection']) if (value[key]) {
    if (kind === 'NONE') selectionAbsent(value[key], reason);
    else {
      value[key].selected_trial_id = null;
      if ('selected_trial_ordinal' in value[key]) Object.assign(value[key], { selected_trial_ordinal: null,
        selected_trial_ordinal_scope: null, selected_trial_ordinal_reason_code: 'SELECTION_HAS_NO_TRIAL' });
    }
    if (value[key].roles) {
      const role = value[key].roles;
      role.raw_best_is_equals_selected = false;
      role.selected.trial_id = null;
      if (kind === 'NONE') Object.assign(role.selected, { ...missing(reason), objective: null, objective_kind: 'NOT_PUBLISHED' });
      else Object.assign(role.centroid, { state: 'AVAILABLE', reason_code: null, trial_id: null,
        objective: value[key].objective, objective_kind: value[key].objective_kind });
    }
  }
  if (value.pool && kind === 'NONE') value.pool.selected = { ...missing(reason), value: null, source: null };
  if (value.declared_space && kind === 'NONE') Object.assign(value.declared_space,
    { state: 'NOT_PUBLISHED', reason_code: reason, binding: null, parameters: [], grid_size: null });
  if (value.frozen_core) {
    for (const field of value.frozen_core.identity) if (field.key === 'selected_params' && kind === 'NONE') {
      field.value = null; field.availability = missing(reason);
    }
    // A fixture may illustrate the absence but cannot forge an audit proof.
    delete value.linked_final_audit; value.final_audit_applicable = false;
    delete value.frozen_core.final_audit;
  }
  if (value.selected_params) {
    Object.assign(value.selected_params, { selected_trial_number: null, selected_trial_number_availability: missing(reason) });
    for (const key of ['selected_trial_number_scope', 'selected_trial_source_id', 'selected_trial_study_id']) if (key in value.selected_params) value.selected_params[key] = null;
    const rail = value.rail.find(row => row.key === 'selected_params');
    rail.detail = kind === 'NONE' ? 'No selection published by the source.' : 'Centroid parameters; no source trial.';
    if ('selected_trial_ordinal' in rail) Object.assign(rail, { selected_trial_ordinal: null, selected_trial_ordinal_scope: null,
      selected_trial_ordinal_reason_code: 'SELECTION_HAS_NO_TRIAL' });
    value.actions.may_seal = false; value.actions.seal_blocked_reason = reason;
    value.actions.publish.enabled = false; value.actions.publish.blocked_reason = reason;
    // Historical compatibility permits this additive label to be absent.
    delete value.actions.publish.blocked_action;
  }
  return value;
}
export function boundaryFixture(base, variant) {
  assert(['AT_LOWER', 'NARROWED', 'PINNED'].includes(variant));
  const value = clone(base);
  const { boundWarning, positionPercent } = require('../../apps/control-api/dist/research/bound-warning.js');
  for (const parameter of value.declared_space.parameters) {
    if (variant === 'AT_LOWER') parameter.value = parameter.minimum;
    else if (variant === 'NARROWED') {
      // A selected upper endpoint must remain a non-zero-width narrowed
      // range; zero-width is its own named PINNED branch, not an accidental
      // transformation of a different edge case.
      if (parameter.value === parameter.maximum) parameter.maximum = parameter.value;
      else parameter.minimum = parameter.value;
    }
    else { parameter.minimum = parameter.value; parameter.maximum = parameter.value; parameter.levels = 1; }
    parameter.bound_warning = boundWarning({ kind: 'NUMERIC', value: parameter.value, minimum: parameter.minimum, maximum: parameter.maximum });
    parameter.position_percent = positionPercent(parameter.value, parameter.minimum, parameter.maximum) ?? 0;
  }
  value.declared_space.grid_size = String(value.declared_space.parameters.reduce((sum, parameter) => sum * (parameter.levels ?? 1), 1));
  return value;
}
export function undefinedReportFixture(base, reason) {
  const value = clone(base);
  assert(['NO_DOWNSIDE_OBSERVATIONS', 'ZERO_VARIANCE_RETURNS', 'BENCHMARK_NOT_PUBLISHED'].includes(reason));
  const target = value.frozen_core.metrics.find(metric => metric.key.includes('SHARPE'));
  assert(target, 'CANONICAL_RATIO_METRIC_REQUIRED');
  target.value = null; target.availability = missing(reason);
  for (const headline of value.frozen_core.headline) if (headline.key === 'OOS_SHARPE') {
    headline.value = null; headline.availability = missing(reason);
  }
  return value;
}
export function corruptionMirrorFixture(compose, freeze) {
  const rc = clone(compose), integrity = clone(freeze);
  const candidate = 'rc_06GGD779ZN6WBGY4Z947J9H9X0', approval = 'apr_p24_technical_mirror';
  Object.assign(rc.local_seal, { state: 'SEALED_LOCAL', release_candidate_id: candidate,
    pack_digest: 'a'.repeat(64), sealed_at_utc_ms: 1791072000000, delivery_state: 'DELIVERED',
    approval_state: 'APPROVED', availability: { state: 'AVAILABLE', reason_code: null } });
  rc.actions.may_seal = false; rc.actions.publish.enabled = false;
  rc.actions.publish.blocked_reason = 'P22_ALREADY_DELIVERED'; delete rc.actions.publish.blocked_action;
  integrity.integrity.state = 'MISMATCH'; integrity.integrity.observed_manifest_digest = '0'.repeat(64);
  const publication = { schema_version: 'research.release-candidate-publication.v1', release_candidate_id: candidate,
    run_id: rc.run_id, alpha_id: rc.run.binding.alpha_id, alpha_version_id: rc.run.binding.alpha_version_id, pack_digest: 'a'.repeat(64),
    source: { availability: 'PARTIAL', reason_code: 'P05_ARTIFACT_BYTE_MISMATCH', run_status: 'COMPLETED',
      legacy_artifact_sha256: null, artifact_schema_version: null, eligible_methodology_claim_ids: [], captured_at: null },
    state: 'DELIVERED', candidate_relation: 'CURRENT', may_publish: false, blocked_reason: 'P22_ALREADY_DELIVERED',
    published: { by_user_id: 'p24_technical_actor', by_username: 'p24-round2-producer', approval_id: approval,
      at_utc_ms: 1791072000000, receipt_digest: 'b'.repeat(64) }, approval_read: 'AVAILABLE',
    approval: { approval_id: approval, gate: 'R1', status: 'APPROVED', effective_status: 'APPROVED',
      subject_id: rc.run.binding.alpha_id, requester_user_id: 'p24_technical_actor', evidence_set_hash: 'sha256:' + 'a'.repeat(64),
      sla_due_at: '2026-10-05T00:00:00.000Z', expires_at: '2026-11-04T00:00:00.000Z',
      created_at: '2026-10-04T00:00:00.000Z', read_at: '2026-10-04T00:01:00.000Z', conditions: [],
      href: `/governance/approvals/${approval}/r1`,
      assignee_pool_availability: { state: 'NOT_PUBLISHED', reason_code: 'P24_TECHNICAL_MIRROR_NO_GRANTS' } },
    as_of_utc_ms: 1791072060000, replayed: false };
  return { rc, freeze: integrity, publication };
}
export function noPickCodeChangeFixture(base) {
  const value = clone(base); const absent = value.alpha.versions.find(version => version.promotion_pick.state === 'NOT_PUBLISHED');
  assert(absent, 'CANONICAL_TYPED_ABSENT_PICK_REQUIRED');
  for (const version of value.alpha.versions) version.promotion_pick = clone(absent.promotion_pick);
  assert(value.attempts.some(attempt => attempt.semantic_diff.gates_reset &&
    attempt.semantic_diff.changes.some(change => change.kind === 'ALPHA_VERSION')), 'CANONICAL_CODE_CHANGE_REQUIRED');
  return value;
}
export function unmappedAtlasFixture(base) {
  const value = clone(base), route = clone(value.atlas.routes[0]);
  route.route_id = 'p24_unmapped_new_route'; route.default_for_new_runs = false;
  route.reason = 'P24 technical fixture: no qualified Portal mapper or execution profile for this source route.';
  // Only the admission axis changes. Engine/source axes remain informational.
  route.axes.admission = 'NOT_ADMITTED';
  value.atlas.routes.push(route); return value;
}
function schemas() {
  return {
    search: require('../../apps/control-api/dist/research/current-source.contract.js').ResearchCurrentSourceSearchResponseSchema,
    freeze: require('../../apps/control-api/dist/research/current-source.contract.js').ResearchCurrentSourceFreezeResponseSchema,
    report: require('../../apps/control-api/dist/research/report.contract.js').ResearchReportDetailResponseSchema,
    rc: require('../../apps/control-api/dist/research/release-candidate.contract.js').ResearchReleaseCandidateComposeResponseSchema,
    lineage: require('../../apps/control-api/dist/research/lineage.contract.js').ResearchAttemptLineageResponseSchema,
    publication: require('../../apps/control-api/dist/research/release-candidate-publication.contract.js').ResearchReleaseCandidatePublicationResponseSchema,
    atlas: { parse: value => require('../../apps/control-api/dist/research/foundation.contract.js').ResearchEngineAtlasPublicSchema.parse(value.atlas) },
  };
}
function save(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600); }
function custody(workspace, runIds) {
  return Object.fromEntries(['runs', 'selection_records', 'artifacts', 'current_source_seals_v1', 'run_report_manifests_v1',
    'release_candidate_packs_v1', 'release_candidate_publications_v1'].map(table => [table,
      dbQuery(`SELECT count(*)::int count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) digest
        FROM research.${table} t WHERE workspace_id=$1 AND run_id=ANY($2)`, [workspace, runIds]).rows[0]]));
}
export function auditPrerequisite(read, report) {
  assert.equal(report.final_audit_applicable, true, 'REAL_REPORT_EXPLICIT_AUDIT_APPLICABILITY_REQUIRED');
  assert.equal(read.state, 'READY_TO_ADMIT'); assert.equal(read.may_create, true);
  assert.equal(read.child_run_id, null); assert.equal(read.verification, null);
  assert.match(read.target_digest, /^[a-f0-9]{64}$/); return true;
}
export function auditRetryPrerequisite(read, report, config) {
  assert.equal(report.final_audit_applicable, true);
  assert.equal(read.state, 'FAILED'); assert.equal(read.may_create, true);
  assert.equal(read.child_run_id, config.previous_failed_child);
  assert.equal(read.target_digest, config.expected_audit_target);
  return true;
}

async function main() {
  assert(flag('config'), 'PRIVATE_CONFIG_REQUIRED');
  const input = JSON.parse(privateRead(flag('config')));
  const config = validateConfig({ ...input, ...(flag('out') ? { out: flag('out') } : {}), ...(flag('mode') ? { mode: flag('mode') } : {}) });
  mkdirSync(config.out, { recursive: true, mode: 0o700 }); chmodSync(config.out, 0o700);
  const receiptPath = join(config.out, 'remaining-scenarios-receipt.json'); assert(!existsSync(receiptPath), 'NEVER_OVERWRITE_RECEIPT');
  const images = {};
  for (const service of Object.keys(config.expected_images)) {
    assert(['control-api', 'portal-api', 'portal-web', 'quant-worker-py'].includes(service));
    const name = service === 'portal-web' ? `${PROJECT}-portal-web-1` : container(service);
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name]).trim(), PROJECT);
    images[service] = docker(['inspect', '--format', '{{.Image}}', name]).trim(); assert.equal(images[service], config.expected_images[service]);
  }
  const workerRunning = docker(['inspect', '--format', '{{.State.Running}}', container('quant-worker-py')]).trim();
  assert.equal(workerRunning, config.mode === 'AUDIT_RETRY' ? 'true' : 'false', 'EXACT_FINITE_WORKER_PHASE');
  const receipt = { schema_version: 'research.p24-remaining-scenario-branches.v1', status: 'FAIL',
    started_at_utc: new Date().toISOString(), mode: config.mode, images, harness_sha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    mandatory_scenarios: SCENARIOS, denominator: 24, cells: [], failures: [], page_errors: [], requests: [],
    writes: { PREFLIGHT: 0, CREATE_REFUSAL: 0, AUDIT: 0 }, fixture_claims: [], inputs: { runs: config.runs, workspace_id: config.workspace_id },
    custody_before: custody(config.workspace_id, Object.values(config.runs)) };
  const { chromium, expect } = await import(pathToFileURL(join(ROOT, 'apps/portal/frontend/node_modules/@playwright/test/index.mjs')).href);
  const browser = await chromium.launch({ headless: true }); const contexts = [];
  let phase = 'READ', currentCell = null;
  const setup = async key => {
    const actor = config.actors[key]; const context = await browser.newContext({ viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: { 'x-dev-access-email': `${actor.username}@azdag.com` } }); contexts.push(context);
    const login = await context.request.post(`${BASE_URL}/api/auth/login`, { headers: { origin: BASE_URL },
      data: { username: actor.username, credential: actor.password ?? privateRead(actor.credential_path).trim() } });
    assert([200, 201].includes(login.status()), 'NORMAL_QA_SIGNIN_REQUIRED');
    await context.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const kind = writeKind(request.method(), url.pathname, phase, config.audit_parent);
      const row = { cell: currentCell, actor: actor.username, method: request.method(), path: safeRecordedPath(request.url()), kind };
      receipt.requests.push(row);
      if (url.origin !== BASE_URL || kind === 'FORBIDDEN') { receipt.failures.push({ id: currentCell, reason: 'FORBIDDEN_EFFECT', ...row }); return route.abort('blockedbyclient'); }
      if (kind === 'AUDIT') {
        assert.equal(key, 'producer'); assert.equal(new URL(request.url()).searchParams.get('workspace_id'), config.workspace_id);
        const body = request.postDataJSON(); assert.equal(Object.keys(body).sort().join(','), 'client_intent_id,target_digest');
        receipt.writes.AUDIT++; assert(receipt.writes.AUDIT <= 1, 'ONE_NEW_AUDIT_MAXIMUM');
      }
      return route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => receipt.page_errors.push({ cell: currentCell, message: String(error).slice(0, 800) }));
    return { actor, context, page };
  };
  const scoped = (path, workspace = config.workspace_id) => { const url = new URL(path, BASE_URL); url.searchParams.set('workspace_id', workspace); return url.pathname + url.search + url.hash; };
  const get = async (lane, path) => {
    const cookie = (await lane.context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
    const response = await lane.context.request.get(`${BASE_URL}${scoped(path)}`, { headers: { cookie } });
    const body = await response.json(); receipt.requests.push({ cell: currentCell, actor: lane.actor.username,
      method: 'GET', path: safeRecordedPath(path), status: response.status(), response_sha256: hash(body) });
    assert.equal(response.status(), 200, `REAL_NAMED_GET:${path}:${response.status()}:${body.error?.code}`); return body;
  };
  const postProbe = async (lane, path, data, kind = 'PREFLIGHT') => {
    const cookies = await lane.context.cookies(), cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
    const csrf = cookies.find(value => value.name === '__Host-portal_csrf')?.value; assert(csrf);
    phase = kind === 'CREATE_REFUSAL' ? 'SCRATCH_REFUSAL' : 'NEGATIVE_PREFLIGHT';
    assert.equal(writeKind('POST', path, phase, config.audit_parent), kind);
    receipt.writes[kind]++; assert(receipt.writes.PREFLIGHT <= 6 && receipt.writes.CREATE_REFUSAL <= 1, 'BOUNDED_NEGATIVE_PROBES');
    const response = await lane.context.request.post(`${BASE_URL}${path}`, { headers: { origin: BASE_URL, cookie, 'x-portal-csrf': csrf },
      data: { ...data, workspace_id: config.workspace_id } }); const body = await response.json();
    receipt.requests.push({ cell: currentCell, actor: lane.actor.username, method: 'POST', path, kind,
      status: response.status(), code: body.error?.code ?? null, response_sha256: hash(body) }); phase = 'READ';
    return { status: response.status(), body };
  };
  const open = async (lane, path) => {
    await lane.page.goto(`${BASE_URL}${scoped(path)}`, { waitUntil: 'domcontentloaded' });
    await lane.page.locator('[data-screen]').first().waitFor({ state: 'visible', timeout: 30000 });
  };
  const cell = async (id, lane, fn) => {
    if (config.selected_cells && !config.selected_cells.includes(id)) return;
    currentCell = id; const row = { id, status: 'FAIL', lane }; receipt.cells.push(row);
    try { await fn(row); row.status = 'PASS'; }
    catch (error) { row.reason = String(error.message).slice(0, 1300); receipt.failures.push({ id, reason: row.reason }); }
    finally { phase = 'READ'; save(receiptPath, receipt); }
  };
  const named = (run, tail) => `/api/v1/quantbt/runs/${run}/${tail}`;
  const product = (run, tail) => `/research/quantbt/runs/${run}/${tail}`;
  const technical = async (lane, id, run, fixtures, fn) => {
    const seen = []; const validate = schemas();
    const mapping = { search: 'current-source/search', freeze: 'current-source/freeze', report: 'report', rc: 'release-candidate' };
    const patterns = Object.fromEntries(Object.keys(fixtures).map(key => [key,
      key === 'publication' ? `**/api/v1/research/release-candidates/${fixtures.publication.release_candidate_id}/publication?**`
        : key === 'lineage' ? `**/api/v1/research/alphas/${fixtures.lineage.alpha.alpha_id}/lineage?**`
          : key === 'atlas' ? '**/api/v1/research/quantbt/atlas?**' : `**${named(run, mapping[key])}?**`]));
    for (const [key, fixture] of Object.entries(fixtures)) {
      validate[key].parse(fixture);
      const pattern = patterns[key];
      await lane.page.route(pattern, route => { assert.equal(route.request().method(), 'GET'); seen.push(key);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }); });
    }
    try {
      await fn(); assert(seen.length > 0, 'DECLARED_TECHNICAL_FIXTURE_MUST_BE_CONSUMED');
      receipt.fixture_claims.push({ id, lane: 'TECHNICAL_FIXTURE_BROWSER', source_data_or_engine_claim: false,
        consumed_operations: [...new Set(seen)], injected_response_sha256: Object.fromEntries(Object.entries(fixtures).map(([key, value]) => [key, hash(value)])) });
    } finally { for (const pattern of Object.values(patterns)) await lane.page.unroute(pattern); }
  };
  let a, b, producer;
  try {
    producer = await setup('producer'); a = await setup('a'); b = await setup('b');
    const source = config.runs.global;
    if (['AUDIT_ALLOCATE', 'AUDIT_RETRY'].includes(config.mode)) {
      assert(config.audit_parent, 'REAL_ELIGIBLE_AUDIT_PARENT_REQUIRED');
      await cell('SC10-explicit-browser-audit-allocation', 'REAL_API_BROWSER_ONE_NEW_AUDIT', async row => {
        const before = await get(producer, named(config.audit_parent, 'final-audit'));
        const report = await get(producer, named(config.audit_parent, 'report'));
        if (config.mode === 'AUDIT_RETRY') auditRetryPrerequisite(before, report, config);
        else auditPrerequisite(before, report);
        const parentBefore = custody(config.workspace_id, [config.audit_parent]);
        const jobsBefore = dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count;
        await open(producer, product(config.audit_parent, 'report'));
        await expect(producer.page.locator('[data-linked-final-audit]')).toHaveAttribute('data-audit-state', config.mode === 'AUDIT_RETRY' ? 'FAILED' : 'READY_TO_ADMIT');
        await producer.page.locator('[data-action="create-linked-audit"]').click();
        assert.equal(receipt.writes.AUDIT, 0, 'CONFIRMATION_OPEN_IS_NOT_ALLOCATION');
        phase = 'AUDIT_ALLOCATE';
        const response = producer.page.waitForResponse(answer => answer.request().method() === 'POST' && new URL(answer.url()).pathname === named(config.audit_parent, 'final-audit'));
        await producer.page.locator('[data-action="confirm-linked-audit"]').click();
        const answer = await response; assert([200, 201, 202].includes(answer.status())); const read = await answer.json();
        assert.match(read.child_run_id, RUN); assert.equal(read.target_digest, before.target_digest); assert.equal(read.may_create, false);
        const jobsAfter = dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count;
        assert.equal(jobsAfter - jobsBefore, 1); assert.equal(receipt.writes.AUDIT, 1);
        assert.deepEqual(custody(config.workspace_id, [config.audit_parent]), parentBefore);
        Object.assign(row, { parent_run_id: config.audit_parent, child_run_id: read.child_run_id,
          target_digest: before.target_digest, state: read.state, jobs_delta: 1, parent_custody_unchanged: true });
        if (config.mode === 'AUDIT_RETRY') {
          assert.notEqual(read.child_run_id, config.previous_failed_child);
          row.previous_failed_child = config.previous_failed_child;
          row.recovery = 'NEW_NORMAL_CLIENT_INTENT_SAME_IMMUTABLE_TARGET_NO_LEASE_RESET';
        }
        save(join(config.out, 'audit-child-awaiting-parent-worker.json'), { parent_run_id: config.audit_parent,
          child_run_id: read.child_run_id, workspace_id: config.workspace_id, expected_images: images, target_digest: before.target_digest,
          note: 'One actual confirmed GUI allocation; only parent may dispatch/start this validated job.' });
      });
    } else if (config.mode === 'AUDIT_VERIFY') {
      assert(config.audit_parent); await cell('SC10-browser-audit-verified', 'REAL_API_BROWSER_EXISTING_CHILD', async row => {
        const read = await get(producer, named(config.audit_parent, 'final-audit'));
        assert.equal(read.state, 'VERIFIED'); assert.equal(read.verification.result.optimizer_trials, 0);
        assert.equal(read.verification.result.optimizer_reinvoked, false);
        await open(producer, product(config.audit_parent, 'report'));
        await expect(producer.page.locator('[data-audit-proof]')).toContainText('VERIFIED');
        Object.assign(row, { parent_run_id: config.audit_parent, child_run_id: read.child_run_id,
          manifest_digest: read.verification.manifest_digest, result_digest: read.verification.result_digest });
      });
    } else {
      const originals = {};
      for (const [key, path] of Object.entries({ search: 'current-source/search', freeze: 'current-source/freeze', report: 'report', rc: 'release-candidate' }))
        originals[key] = await get(producer, named(source, path));
      await cell('SC05-sampler-configuration-observations-not-internal-trace', 'REAL_API_BROWSER_TYPED_SOURCE_BOUNDARY', async row => {
        const fact = originals.search.sampler_evidence;
        assert.equal(fact.requested_configuration.state, 'AVAILABLE');
        assert.equal(fact.internal_trace.state, 'NOT_PUBLISHED');
        assert.equal(fact.observed_trials.source_trial_count, 400);
        await open(producer, product(source, 'search'));
        await producer.page.locator('[data-cinema-step="2"]').click();
        await expect(producer.page.locator('[data-sampler-configuration="AVAILABLE"]')).toBeVisible();
        await expect(producer.page.locator('[data-sampler-internal-trace="NOT_PUBLISHED"]')).toContainText('not published');
        await expect(producer.page.locator('[data-sampler-observed-trials]')).toContainText('400 retained trials');
        row.sampler_evidence = fact; row.exact_response_sha256 = hash(fact);
      });
      await cell('SC01-cinema-selected-outside-first-ledger-page', 'REAL_API_BROWSER_BOUNDED_OPAQUE_PAGES', async row => {
        const selected = originals.search.surface.selected_trial_id; assert(selected !== null);
        assert(!originals.search.ledger.trials.some(trial => trial.trial_id === selected), 'ACTUAL_SELECTED_TRIAL_MUST_BE_BEYOND_FIRST_PAGE');
        let document = originals.search, pages = 1, trial = null;
        while (!trial && pages <= 4) {
          trial = document.ledger.trials.find(value => value.trial_id === selected) ?? null;
          if (trial) break;
          const cursor = document.ledger.page.next_cursor; assert(cursor, 'ACTUAL_OPAQUE_NEXT_CURSOR_REQUIRED');
          document = await get(producer, `${named(source, 'current-source/search')}?cursor=${encodeURIComponent(cursor)}&limit=100`); pages++;
        }
        assert(trial, 'SELECTED_SOURCE_TRIAL_NOT_FOUND_WITHIN_BOUNDED_SOURCE_CENSUS');
        for (const width of [1280, 660]) {
          await producer.page.setViewportSize({ width, height: 900 }); await open(producer, product(source, 'search'));
          await producer.page.locator('[data-cinema-step="5"]').click();
          await expect(producer.page.locator('[data-beat-seal]')).toContainText(`trial ${selected}`);
          await expect(producer.page.locator('[data-seal-digest]')).toHaveAttribute('title', new RegExp(trial.params_digest), { timeout: 30000 });
          const text = await producer.page.locator('[data-seal-params]').innerText();
          for (const [name, value] of Object.entries(trial.parameters)) assert(text.includes(`${name} ${value}`), `EXACT_SELECTED_PARAMETER:${name}`);
          const link = new URL(await producer.page.locator('[data-action="cinema-to-freeze"]').getAttribute('href'), BASE_URL);
          assert.equal(link.searchParams.get('workspace_id'), config.workspace_id);
          assert.equal(await producer.page.locator('[data-beat-seal] [data-absent="UI_DIGEST_NOT_IN_LOADED_LEDGER_PAGE"]').count(), 0);
          await producer.page.screenshot({ path: join(config.out, `cinema-theta-${width}.png`), fullPage: true });
        }
        await producer.page.setViewportSize({ width: 1280, height: 900 });
        Object.assign(row, { source_selected_trial_id: selected, exact_params_digest: trial.params_digest,
          source_ordinal: trial.source_ordinal, bounded_pages: pages, first_page_rows: originals.search.ledger.returned_rows });
      });
      await cell('SC05-run-declaration-source-pins-three-screens', 'REAL_API_BROWSER_IMMUTABLE_DECLARATION', async row => {
        row.facts = [];
        for (const [screen, path] of [['progress', `/api/v1/research/runs/${source}/progress`],
          ['evidence', named(source, 'current-source/evidence')], ['split', named(source, 'current-source/split')]]) {
          const body = await get(producer, path); const declaration = body.run_declaration ?? body.progress?.run_declaration;
          assert(declaration, `OWNING_READ_DECLARATION:${screen}`); assert.equal(declaration.state, 'AVAILABLE');
          await open(producer, product(source, screen));
          const panel = producer.page.locator('[data-run-declaration="AVAILABLE"]'); await expect(panel).toBeVisible({ timeout: 30000 });
          const summary = panel.locator('summary'); if (await summary.count()) await summary.click();
          await expect(panel.locator('[data-declared-binding]')).toBeVisible();
          assert((await panel.locator('[data-parameter-row]').count()) > 0, 'ACTUAL_DECLARED_PARAMETER_ROWS');
          row.facts.push({ screen, run_declaration_sha256: hash(declaration), binding: declaration.alpha_binding,
            sampler_state: declaration.sampler?.state ?? null });
        }
      });
      await cell('SC03-SC04-SC05-actual-preflight-boundaries', 'REAL_API_TYPED_REFUSALS_NO_JOB', async row => {
        // Use an already retained bounded global3 request, not the400-trial
        // historical read input. New-job admission is deliberately separate.
        const budgetRun = config.runs.budget ?? config.runs.global;
        const read = await get(producer, `/api/v1/research/runs/${budgetRun}/requested-spec`);
        const spec = read.requested_spec; assert(spec?.alpha_binding); const before = custody(config.workspace_id, Object.values(config.runs));
        const jobsBefore = dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count;
        row.results = [];
        for (const [name, patch] of [
          ['conflicting-native-trials', value => { value.optimization_config.n_trials = value.optuna_trials + 1; }],
          ['conflicting-native-seed', value => { value.optimization_config.seed = (value.random_seed ?? 42) + 1; }],
          ['early-stop-outside-installed-profile', value => { value.early_stopping = 1; }],
          ['unmapped-route', value => { value.execution_route = 'orders'; value.route_params = {}; }],
        ]) {
          const request = clone(spec); patch(request); const answer = await postProbe(producer, '/api/v1/research/preflights', { requested_spec: request });
          // A structurally valid declaration may produce a201 preflight
          // while the installed producer explicitly refuses execution.
          // That is not an acceptedjob or an engine early-stop claim.
          if (answer.status === 201) {
            assert(!name.startsWith('conflicting-native'), 'ALIASES_MUST_BE_REJECTED_AT_INTAKE');
            assert.equal(answer.body.may_create_run, false);
            assert.equal(typeof answer.body.run_admission?.code, 'string');
            row.results.push({ name, status: 201, reason_code: answer.body.run_admission.code, may_create_run: false });
          } else {
            assert([400, 409].includes(answer.status), `CRAFTED_REFUSAL_REQUIRED:${name}:${answer.status}`);
            assert.equal(typeof answer.body.error?.code, 'string'); row.results.push({ name, status: answer.status, reason_code: answer.body.error.code });
          }
        }
        assert.equal(dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count, jobsBefore);
        assert.deepEqual(custody(config.workspace_id, Object.values(config.runs)), before);
        row.new_jobs = 0; row.early_stop_disposition = 'SOURCE_PROFILE_NOT_ADMITTED_NOT_FAKE_APPLIED_COUNTERS';
      });
      await cell('SC03-scratch-source-unsupported-nonpublishable', 'REAL_API_TYPED_SOURCE_ADMISSION', async row => {
        const read = await get(producer, `/api/v1/research/runs/${config.runs.budget ?? config.runs.global}/requested-spec`);
        const spec = clone(read.requested_spec); spec.alpha_binding = null; spec.not_publishable = true;
        const before = custody(config.workspace_id, Object.values(config.runs));
        const jobsBefore = dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count;
        const answer = await postProbe(producer, '/api/v1/research/preflights', { requested_spec: spec });
        assert.equal(answer.status, 201); assert.equal(answer.body.may_create_run, false);
        const code = answer.body.run_admission?.code ?? answer.body.run_admission?.reason_code;
        assert.equal(code, 'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE');
        const create = await postProbe(producer, '/api/v1/research/runs', { schema_version: 'research.run-create.v1',
          requested_spec: spec, preflight_token: answer.body.preflight_token, client_intent_id: `p24-scratch:${randomUUID()}`, intent_kind: 'NEW' }, 'CREATE_REFUSAL');
        assert.equal(create.status, 409); assert.equal(create.body.error?.code, 'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE');
        assert.equal(dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count, jobsBefore);
        assert.deepEqual(custody(config.workspace_id, Object.values(config.runs)), before);
        Object.assign(row, { disposition: 'SOURCE_UNSUPPORTED_TYPED', reason_code: code, new_jobs: 0,
          source_locator: 'apps/control-api/src/research/run-admission.service.ts:160' });
      });
      await cell('SC03-outside-declaration-pin-refused-no-old-run-change', 'REAL_API_TYPED_DECLARATION_BOUNDARY', async row => {
        const sourceRun = config.runs.budget ?? config.runs.global;
        const read = await get(producer, `/api/v1/research/runs/${sourceRun}/requested-spec`);
        const progress = await get(producer, `/api/v1/research/runs/${sourceRun}/progress`);
        const declaration = progress.run_declaration ?? progress.progress?.run_declaration;
        assert.equal(declaration?.state, 'AVAILABLE', 'IMMUTABLE_SOURCE_DECLARATION_REQUIRED');
        assert.equal(declaration.alpha_binding.alpha_version_id, read.requested_spec.alpha_binding.alpha_version_id);
        const [name, parameter] = Object.entries(declaration.declaration.parameter_space).find(([, value]) =>
          (['int_range', 'float_range'].includes(value.kind) && Number.isSafeInteger(Number(value.high))) ||
          (value.kind === 'fixed' && typeof value.value === 'number' && Number.isSafeInteger(value.value))) ?? [];
        assert(parameter, 'ACTUAL_NUMERIC_DECLARATION_REQUIRED');
        const maximum = parameter.kind === 'fixed' ? parameter.value : parameter.high;
        const spec = clone(read.requested_spec); const outside = Number(maximum) + 1;
        assert(Number.isSafeInteger(outside));
        spec.parameter_space_overrides = [...spec.parameter_space_overrides.filter(value => value.name !== name),
          { kind: 'pin', name, value: outside }];
        const jobsBefore = dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count;
        const answer = await postProbe(producer, '/api/v1/research/preflights', { requested_spec: spec });
        assert([400, 409].includes(answer.status)); assert.equal(typeof answer.body.error?.code, 'string');
        assert.equal(dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [config.workspace_id]).rows[0].count, jobsBefore);
        Object.assign(row, { parameter: name, immutable_declaration_digest: declaration.declaration_digest,
          declared_maximum: String(maximum), attempted_pin: String(outside),
          reason_code: answer.body.error.code, new_jobs: 0, original_source_immutable: true });
      });
      await cell('SC03-freeze-new-attempt-declaration-navigation', 'REAL_API_BROWSER_READ_ONLY', async row => {
        await open(producer, product(source, 'freeze'));
        const link = producer.page.locator('[data-action="propose-new-attempt"]'); await expect(link).toBeVisible();
        const href = new URL(await link.getAttribute('href'), BASE_URL);
        assert.equal(href.searchParams.get('workspace_id'), config.workspace_id); assert.equal(href.searchParams.get('from'), source);
        await link.click(); await expect(producer.page.locator('[data-clone-state="available"]')).toBeVisible({ timeout: 30000 });
        row.bound_old_run_unchanged = true; row.navigation = href.pathname + href.search;
      });
      await cell('SC04-single-canonical-main-native-fields', 'REAL_API_BROWSER_NO_EXECUTION', async row => {
        const sourceRun = config.runs.budget ?? source;
        const bound = await get(producer, `/api/v1/research/runs/${sourceRun}/requested-spec`);
        const spec = bound.requested_spec; assert(spec && spec.optuna_trials > 0);
        await open(producer, `/research/quantbt/runs/new?from=${sourceRun}&step=optimization`);
        await expect(producer.page.locator('[data-clone-state="available"]')).toBeVisible({ timeout: 30000 });
        const trials = producer.page.getByLabel('Optuna trials', { exact: true });
        const seed = producer.page.getByLabel(/Random seed/, { exact: false });
        await expect(trials).toBeVisible(); assert.equal(await trials.count(), 1); assert.equal(await seed.count(), 1);
        await expect(trials).toHaveValue(String(spec.optuna_trials));
        await expect(seed).toHaveValue(spec.random_seed === null ? '' : String(spec.random_seed));
        const initial = { trials: await trials.inputValue(), seed: await seed.inputValue() };
        // Profile-locked facts are not duplicated as browser-authored native aliases.
        row.profile_locked = { trials: await trials.getAttribute('readonly') !== null, seed: await seed.getAttribute('readonly') !== null };
        if (!row.profile_locked.trials) { await trials.fill(String(Number(initial.trials) + 1)); await expect(trials).toHaveValue(String(Number(initial.trials) + 1)); await trials.fill(initial.trials); }
        if (!row.profile_locked.seed) { await seed.fill(String(Number(initial.seed || '42') + 1)); await seed.fill(initial.seed); }
        assert.equal(await producer.page.locator('input[name="n_trials"],input[name="optuna_trials"],input[name="random_seed"]').count(), 0,
          'NO_SECOND_BROWSER_ALIAS_AUTHOR'); row.canonical_main_values = initial;
      });
      for (const kind of ['NONE', 'CENTROID']) await cell(`SC${kind === 'NONE' ? '08' : '09'}-${kind.toLowerCase()}-four-screen`, 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const fixtures = Object.fromEntries(Object.entries(originals).map(([key, value]) => [key, selectionFixture(value, kind)]));
        await technical(producer, row.id, source, fixtures, async () => {
          for (const screen of ['search', 'freeze', 'report', 'release-candidate']) {
            await open(producer, product(source, screen));
            if (screen === 'search') { await producer.page.locator('[data-trial]').first().waitFor({ state: 'visible', timeout: 20000 });
              assert.equal(await producer.page.locator('[data-trial-selected="true"]').count(), 0, 'NO_BEST_TRIAL_FALLBACK');
              await producer.page.locator('[data-cinema-step="5"]').click();
              if (kind === 'NONE') await expect(producer.page.locator('[data-beat-absent]')).toContainText('not published');
              else { await expect(producer.page.locator('[data-beat-seal]')).toContainText('centroid');
                const text = await producer.page.locator('[data-seal-params]').innerText();
                for (const [name, value] of Object.entries(fixtures.search.selection.parameters)) assert(text.includes(`${name} ${value}`)); }
              assert.equal(await producer.page.locator('[data-seal-digest]').count(), 0, 'NO_INVENTED_TRIAL_DIGEST');
            }
            if (screen === 'freeze') { await producer.page.locator('[data-panel="frozen-parameters"]').waitFor({ state: 'attached', timeout: 20000 });
              if (kind === 'NONE') await expect(producer.page.locator('[data-frozen-empty]')).toContainText('no parameter');
              assert.equal(await producer.page.locator('[data-selected-trial]').count(), 0, 'NULL_SOURCE_TRIAL_MUST_REMAIN_NULL'); }
            if (screen === 'report') { await producer.page.locator('[data-panel="identity"]').waitFor({ state: 'visible', timeout: 20000 }); }
            if (screen === 'release-candidate') { await producer.page.locator('[data-screen="release-candidate"]').waitFor({ state: 'visible', timeout: 20000 });
              assert.equal(await producer.page.locator('[data-action="seal"]:enabled').count(), 0, 'ABSENCE_CANNOT_ENABLE_LOCAL_SEAL'); }
          }
        }); row.source_selected = kind; row.engine_claim = false;
      });
      for (const variant of ['AT_LOWER', 'NARROWED', 'PINNED']) await cell(`SC13-${variant.toLowerCase()}-search-freeze-report`, 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const fixtures = { search: boundaryFixture(originals.search, variant), freeze: boundaryFixture(originals.freeze, variant) };
        await technical(producer, row.id, source, fixtures, async () => {
          for (const screen of ['search', 'freeze']) {
            await open(producer, product(source, screen)); await producer.page.locator('[data-tick-tone]').first().waitFor({ state: 'attached', timeout: 20000 });
            const expected = variant === 'PINNED' ? 'NOT_APPLICABLE' : 'AT_BOUND';
            assert.equal(await producer.page.locator(`[data-tick-tone="${expected}"]`).count(), fixtures.search.declared_space.parameters.length);
            assert.doesNotMatch(await producer.page.locator('[data-screen]').first().innerText(), /not (?:the )?optimum|deploy gate/i);
          }
          await open(producer, product(source, 'report')); await producer.page.locator('[data-panel="identity"]').waitFor({ state: 'visible', timeout: 20000 });
        }); row.definition_id = 'research.bound-warning.v1'; row.engine_claim = false;
      });
      for (const reason of ['NO_DOWNSIDE_OBSERVATIONS', 'ZERO_VARIANCE_RETURNS', 'BENCHMARK_NOT_PUBLISHED']) await cell(`SC14-report-${reason.toLowerCase()}`, 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const report = undefinedReportFixture(originals.report, reason); const metric = report.frozen_core.metrics.find(value => value.key.includes('SHARPE'));
        await technical(producer, row.id, source, { report }, async () => {
          await open(producer, product(source, 'report')); const element = producer.page.locator(`[data-metric="${metric.key}"]`);
          await expect(element).toBeVisible({ timeout: 20000 });
          assert.equal(await element.locator('[data-metric-value]').count(), 0, 'TYPED_ABSENT_RATIO_HAS_NO_NUMERIC_NODE');
          assert.doesNotMatch(await element.innerText(), /\bNaN\b|\bInfinity\b|\b0\.000\b/);
        }); row.typed_reason = reason; row.engine_claim = false;
      });
      await cell('SC12-two-actor-read-scan-exposure-isolation', 'REAL_API_TWO_NORMAL_USERS_READ_ONLY', async row => {
        const path = named(config.runs.fixed, 'split');
        const before = custody(config.workspace_id, [config.runs.fixed]);
        const left = await get(a, path); await open(a, product(config.runs.fixed, 'split'));
        const right = await get(b, path); await open(b, product(config.runs.fixed, 'split'));
        const holdout = left.windows?.holdout;
        assert(holdout, 'ACTUAL_HOLDOUT_METADATA_OR_TYPED_ABSENCE_REQUIRED');
        assert.deepEqual(holdout, right.windows?.holdout, 'SAME_AUTHORIZED_METADATA_DIFFERENT_ACTOR');
        if ('evaluation_state' in holdout) {
          assert.equal(holdout.evaluation_state, 'NOT_EVALUATED');
          assert.equal(holdout.child_input_state, 'NOT_EXPOSED_TO_CHILD_TAPE');
          assert.equal(holdout.result_exposure_state, 'NOT_EXPOSED');
          row.scanning_not_evaluation = true;
        } else {
          assert(holdout.availability && holdout.availability.state !== 'AVAILABLE');
          assert.equal(typeof holdout.reason_code ?? holdout.availability.reason_code, 'string');
          row.holdout_disposition = 'SOURCE_METADATA_TYPED_ABSENCE';
          row.typed_reason = holdout.reason_code ?? holdout.availability.reason_code;
          row.scanning_not_evaluation = 'NOT_ASSERTED_WITHOUT_METADATA';
        }
        for (const lane of [a, b]) {
          const cookie = (await lane.context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
          const denied = await lane.context.request.get(`${BASE_URL}${scoped(path, config.alternate_workspace_id)}`, { headers: { cookie } });
          const body = await denied.json();
          receipt.requests.push({ cell: currentCell, actor: lane.actor.username, method: 'GET',
            path: safeRecordedPath(scoped(path, config.alternate_workspace_id)), status: denied.status(),
            code: body.error?.code ?? null, response_sha256: hash(body) });
          assert([403, 404].includes(denied.status()), `UNGRANTED_WORKSPACE_MUST_NOT_LEAK:${denied.status()}:${body.error?.code}`);
          assert.equal(typeof body.error?.code, 'string'); assert.equal(body.run_id, undefined); assert.equal(body.windows, undefined);
        }
        assert.deepEqual(custody(config.workspace_id, [config.runs.fixed]), before);
        row.no_automatic_holdout_unlock = true;
      });
      await cell('SC20-absent-pick-code-change-no-implicit-reset', 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const lineage = noPickCodeChangeFixture(JSON.parse(readFileSync(join(ROOT, 'packages/contracts/fixtures/research-attempt-lineage.healthy.valid.json'), 'utf8')));
        await technical(producer, row.id, source, { lineage }, async () => {
          await open(producer, `/research/quantbt/alphas/${lineage.alpha.alpha_id}/lineage`);
          await expect(producer.page.locator('[data-pick-state="NOT_PUBLISHED"]').first()).toBeVisible();
          await expect(producer.page.locator('[data-diff-kind="ALPHA_VERSION"][data-gates="true"]').first()).toContainText('GATES RESET');
          assert.equal(await producer.page.locator('[data-pick-state="PUBLISHED"]').count(), 0, 'ABSENT_PICK_CANNOT_MAX_SHARPE_FALLBACK');
          assert.equal(await producer.page.locator('[data-diff-kind="ALPHA_VERSION"] button,[data-diff-kind="ALPHA_VERSION"] a').count(), 0,
            'GATES_RESET_IS_INFORMATIONAL_NOT_RESET_ENDPOINT');
        }); row.no_implicit_reset_revoke_stop = true;
      });
      await cell('SC20-corruption-warning-does-not-revoke-approved-mirror', 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const fixtures = corruptionMirrorFixture(originals.rc, originals.freeze);
        const approvalHash = hash(fixtures.publication.approval);
        await technical(producer, row.id, source, fixtures, async () => {
          await open(producer, product(source, 'freeze'));
          await expect(producer.page.locator('[data-panel="retained-integrity"]')).toHaveAttribute('data-integrity-state', 'MISMATCH');
          await open(producer, product(source, 'release-candidate'));
          await expect(producer.page.locator('[data-mirror-status="APPROVED"]')).toBeVisible({ timeout: 20000 });
          assert.equal(await producer.page.locator('[data-action="seal"]:enabled,[data-action="publish"]:enabled').count(), 0);
          assert.equal(hash(fixtures.publication.approval), approvalHash);
        }); Object.assign(row, { source_approval: 'TECHNICAL_READ_FIXTURE_NOT_AN_ACTUAL_R1_DECISION',
          corrupted_bytes: 'NONE_ORIGINAL_BYTES_UNTOUCHED', approval_mirror_sha256: approvalHash });
      });
      await cell('SC21-new-route-unmapped-informational-no-enable', 'TECHNICAL_FIXTURE_BROWSER', async row => {
        const actual = await get(producer, '/api/v1/research/quantbt/atlas');
        const fixture = unmappedAtlasFixture(actual);
        await technical(producer, row.id, source, { atlas: fixture }, async () => {
          await open(producer, '/research/quantbt/atlas#tab=routes');
          const route = producer.page.locator('[data-route="p24_unmapped_new_route"]');
          await expect(route).toBeVisible(); await expect(route).toHaveAttribute('data-admitted', 'false');
          assert.equal(await route.locator('[data-declare-route]').count(), 0);
          await expect(route.locator('[data-route-reason]')).toContainText('no qualified Portal mapper');
        }); Object.assign(row, { original_release_unchanged: true, source_route_claim: false, no_profile_auto_enable: true });
      });
    }
    if (config.selected_cells) assert.deepEqual(receipt.cells.map(row => row.id).sort(), [...config.selected_cells].sort(),
      'EVERY_REQUESTED_AFFECTED_CELL_MUST_EXECUTE_NO_SILENT_SKIPS');
    assert.deepEqual(receipt.page_errors, [], 'BROWSER_PAGE_ERRORS');
    assert.deepEqual(custody(config.workspace_id, Object.values(config.runs)), receipt.custody_before, 'EXISTING_SOURCE_RUNS_IMMUTABLE');
    receipt.status = receipt.failures.length ? 'FAIL' : 'PASS_SCOPED_REMAINING_BRANCHES';
  } catch (error) { receipt.failures.push({ id: currentCell ?? 'SETUP', reason: String(error.message).slice(0, 1500) }); }
  finally {
    receipt.custody_after = custody(config.workspace_id, Object.values(config.runs));
    for (const [service, expected] of Object.entries(images)) {
      const name = service === 'portal-web' ? `${PROJECT}-portal-web-1` : container(service);
      assert.equal(docker(['inspect', '--format', '{{.Image}}', name]).trim(), expected, 'FINAL_CANDIDATE_PIN_STABLE');
    }
    for (const lane of [a, b, producer].filter(Boolean)) {
      const cookie = (await lane.context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
      await lane.context.request.post(`${BASE_URL}/api/auth/logout`, { headers: { origin: BASE_URL, cookie } }).catch(() => {});
    }
    await browser.close(); receipt.finished_at_utc = new Date().toISOString(); save(receiptPath, receipt);
    console.log(JSON.stringify({ receipt: receiptPath, sha256: hash(readFileSync(receiptPath)), status: receipt.status,
      passed: receipt.cells.filter(row => row.status === 'PASS').length, failed: receipt.failures.length, writes: receipt.writes }));
    if (receipt.failures.length) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(`P24_REMAINING_HARNESS_REFUSED:${String(error.message).slice(0, 500)}`); process.exitCode = 1;
});
