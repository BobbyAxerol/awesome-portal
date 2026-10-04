#!/usr/bin/env node
/**
 * SC19 transport loss + SC24 re-export/reference exclusion, owned :8096 only.
 * No new engine job, no Governance decision/grant, no GC deletion. One USER
 * publishes one current pinned source; ACK loss is real response loss, never
 * an invented server state. The existing original child/restore proof is reused.
 * node .../p24-publication-export-edges.mjs --config=<private0600.json>
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, chmodSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PROJECT, BASE_URL, validateHome } from '../research-p23/cell.mjs';
import { privateJson, savePrivate, readBoundedJson } from '../research-p23/api-client.mjs';
import { container, dbQuery, docker } from '../research-p23/runtime-tools.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PARENT = 'rrun_3258a4c450816129d2d285f25b801061';
export const CHILD = 'rrun_b47b38cc8abc73eda542da734c827197';
export const CHILD_MANIFEST = '86d8bb2f7e7b529c659621d8d4ad90e4ba7c4b895287302cde843eacd88ec167';
export const hash = value => createHash('sha256').update(Buffer.isBuffer(value) ? value :
  typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function requireConfig(config) {
  assert.equal(config.project, PROJECT, 'OWNED_PROJECT_ONLY');
  assert.equal(config.base_url, BASE_URL, 'OWNED_8096_ONLY');
  assert.equal(config.origin ?? BASE_URL, BASE_URL, 'EXACT_ORIGIN_REQUIRED');
  assert.equal(config.user?.username ?? config.username, 'p24-edge-publish', 'ONE_APPROVED_EPHEMERAL_USER');
  assert.match(config.workspace_id, /^[A-Za-z0-9._-]{1,128}$/);
  assert(config.user?.password, 'PRIVATE_TEMPORARY_PASSWORD_REQUIRED');
  config.lane ??= 'PUBLICATION_AND_EXPORT';
  assert(['PUBLICATION_AND_EXPORT', 'EXPORT_ONLY', 'GET_COMPLETED_EXPORTS'].includes(config.lane), 'BOUNDED_APPROVED_LANE_REQUIRED');
  if (config.lane === 'GET_COMPLETED_EXPORTS') {
    config.continuation_receipt_path = validateHome(config.continuation_receipt_path);
    assert.match(config.continuation_receipt_sha256 ?? '', /^[a-f0-9]{64}$/, 'ORIGINAL_RECEIPT_CHECKSUM_REQUIRED');
  }
  const supplied = config.expected_images ?? {};
  config.expected_images = { 'control-api': supplied['control-api'] ?? supplied.control,
    'portal-api': supplied['portal-api'] ?? supplied.python,
    'quant-worker-py': supplied['quant-worker-py'] ?? supplied.python,
    'portal-web': supplied['portal-web'] ?? supplied.web };
  assert(['control-api', 'portal-api', 'quant-worker-py', 'portal-web']
    .every(service => /^sha256:[a-f0-9]{64}$/.test(config.expected_images[service])), 'FINAL_EXACT_IMAGES_REQUIRED');
  config.out = validateHome(config.out);
  return config;
}
export function publishInput(publication) {
  assert.equal(publication.state, 'NOT_PUBLISHED', 'FRESH_UNPUBLISHED_CANDIDATE_REQUIRED');
  assert.equal(publication.may_publish, true, `PUBLISH_PREREQUISITE:${publication.blocked_reason}`);
  assert.equal(publication.candidate_relation, 'CURRENT');
  assert.equal(publication.source.availability, 'AVAILABLE');
  assert.match(publication.pack_digest, /^[a-f0-9]{64}$/);
  const claims = publication.source.eligible_methodology_claim_ids;
  assert(Array.isArray(claims) && claims.length === 1, 'ONE_SOURCE_PUBLISHED_CLAIM_REQUIRED');
  return { schema_version: 'research.release-candidate-publish-request.v1',
    expected_pack_digest: publication.pack_digest, methodology_claim_id: claims[0] };
}
export function assertDelivered(reply, actorId, candidateId, original) {
  assert.equal(reply.state, 'DELIVERED');
  assert.equal(reply.release_candidate_id, candidateId);
  assert.equal(reply.published?.by_user_id, actorId);
  assert.match(reply.published?.approval_id ?? '', /^apr_[A-Za-z0-9]+$/);
  assert.match(reply.published?.receipt_digest ?? '', /^[a-f0-9]{64}$/);
  if (original) {
    assert.equal(reply.replayed, true, 'TERMINAL_RETRY_MUST_BE_REPLAY');
    assert.deepEqual(reply.published, original.published, 'RECEIPT_AND_R1_MUST_NOT_CHANGE');
    assert.equal(reply.pack_digest, original.pack_digest, 'PACK_MUST_NOT_CHANGE');
  }
}
export function assessDownload(status, bytes) {
  assert.equal(status.state, 'READY');
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 512 * 1024);
  assert.equal(bytes.length, status.size_bytes, 'DOWNLOAD_SIZE_MISMATCH');
  assert.equal(hash(bytes), status.sha256, 'DOWNLOAD_BYTE_HASH_MISMATCH');
  return { size_bytes: bytes.length, sha256: hash(bytes) };
}
export function parseExportWorkerOutput(output, expectedJobIds) {
  const records = [];
  for (const raw of output.trim().split('\n').filter(Boolean)) {
    const line = raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
    if (/^\[Nest\]\s+\d+\s+-\s+.+\s+(LOG|DEBUG|VERBOSE|WARN)\s+\[[^\]]+\]/.test(line)) continue;
    assert(line.startsWith('{'), 'UNRECOGNIZED_EXPORT_CLI_LINE');
    const record = JSON.parse(line);
    if (record.event === 'research_report_export_completed') {
      assert.deepEqual(Object.keys(record).sort(), ['event', 'job_id']);
      assert(expectedJobIds.includes(record.job_id), 'EXPORT_WORKER_PROCESSED_UNOWNED_JOB');
    } else {
      assert.equal(record.event, 'research_report_export_worker_complete', 'UNRECOGNIZED_EXPORT_CLI_EVENT');
      assert.deepEqual(Object.keys(record).sort(), ['event', 'processed']);
      assert.equal(record.processed, expectedJobIds.length);
    }
    records.push(record);
  }
  assert.deepEqual(records.filter(row => row.event === 'research_report_export_completed').map(row => row.job_id).sort(),
    [...expectedJobIds].sort(), 'ALL_AND_ONLY_EXPECTED_EXPORT_JOBS_REQUIRED');
  assert.equal(records.filter(row => row.event === 'research_report_export_worker_complete').length, 1);
  assert.equal(records.at(-1)?.event, 'research_report_export_worker_complete');
  return records;
}
export function validateExportContinuation(prior, config) {
  assert.equal(prior.schema_version, 'research.p24-publication-export-edges.v1');
  assert.equal(prior.project, PROJECT); assert.equal(prior.base_url, BASE_URL);
  assert.equal(prior.actor, 'p24-edge-publish'); assert.equal(prior.workspace_id, config.workspace_id);
  assert.equal(prior.parent_run_id, PARENT); assert.equal(prior.child_run_id, CHILD);
  assert.equal(prior.scenarios['SC-19'].status, 'SCOPED_PASS', 'ACCEPTED_PRIOR_PUBLISH_BRANCH_REQUIRED');
  assert.equal(prior.immutable_source_preserved, true);
  assert.deepEqual(prior.runtime.images, config.expected_images, 'CONTINUATION_REQUIRES_SAME_EXACT_CANDIDATE');
  assert.match(prior.release_candidate_id ?? '', /^rc_[A-Za-z0-9]+$/);
  assert.equal(prior.exports?.length, 2, 'EXACT_EXISTING_EXPORT_IDS_REQUIRED');
  assert.deepEqual(prior.exports.map(item => item.created.format).sort(), ['REPORT_CSV', 'REPORT_JSON']);
  const ids = prior.exports.map(item => {
    assert.equal(item.created.run_id, PARENT);
    assert.equal(item.created.report_revision, prior.original_report_revision);
    assert.match(item.created.job_id, /^rpex_[A-Za-z0-9]+$/);
    return item.created.job_id;
  });
  assert.equal(new Set(ids).size, 2);
  return ids;
}
export function lineageReadPath(compose, workspace) {
  const alpha = compose.run.binding?.alpha_id;
  assert.match(alpha ?? '', /^[a-z][a-z0-9-]{2,63}$/, 'PUBLISHED_ALPHA_LINEAGE_BINDING_REQUIRED');
  assert.match(workspace, /^[A-Za-z0-9._-]{1,128}$/);
  return `/api/v1/research/alphas/${encodeURIComponent(alpha)}/lineage?workspace_id=${encodeURIComponent(workspace)}&limit=128`;
}
function fingerprintTable(name, workspace, target = false) {
  assert(/^(research|public)\.[a-z0-9_]+$/.test(name));
  return dbQuery(`SELECT count(*)::int count,
    md5(coalesce(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY to_jsonb(r)::text),'')) digest
    FROM ${name} r WHERE workspace_id=$1${target ? ' AND run_id=ANY($2::text[])' : ''}`,
  target ? [workspace, [PARENT, CHILD]] : [workspace]).rows[0];
}
function immutableCustody(workspace) {
  const all = ['research.alphas', 'research.alpha_versions', 'research.attempts', 'research.runs',
    'research.jobs', 'research.selection_records', 'research.artifacts', 'research.artifact_parts',
    'research.current_source_seals_v1', 'research.run_report_manifests_v1',
    'research.child_audit_companion_seals_v1', 'research.exposure_facts',
    'public.governance_approval_decisions'];
  return Object.fromEntries(all.map(name => [name, fingerprintTable(name, workspace)]));
}
function publicationCustody(workspace, candidate) {
  const rows = dbQuery(`SELECT release_candidate_id,actor_user_id,request_key,payload_digest,state,
    approval_id,receipt_digest,pack_digest,attempt_count
    FROM research.release_candidate_publications_v1 WHERE workspace_id=$1 AND release_candidate_id=$2`,
  [workspace, candidate]).rows;
  const approvals = dbQuery(`SELECT approval_id,requester_user_id,request_key,request_payload_hash,evidence_set_hash,status
    FROM public.governance_approval_requests WHERE workspace_id=$1 AND request_key=$2`,
  [workspace, `rcpub:${candidate}`]).rows;
  return { intents: rows, approvals };
}
function ownedInspect(service) {
  const name = `${PROJECT}-${service}-1`;
  const actual = JSON.parse(docker(['inspect', name]))[0];
  assert.equal(actual.Config.Labels['com.docker.compose.project'], PROJECT);
  assert.equal(actual.Config.Labels['com.docker.compose.service'], service);
  return actual;
}
function runtimeSafety(config) {
  const inspections = Object.fromEntries(Object.keys(config.expected_images).map(service => [service, ownedInspect(service)]));
  for (const [service, inspection] of Object.entries(inspections))
    assert.equal(inspection.Image, config.expected_images[service], `FINAL_IMAGE_MISMATCH:${service}`);
  assert.equal(inspections['quant-worker-py'].State.Running, false, 'WORKER_MUST_STAY_OFF');
  const env = Object.fromEntries(inspections['control-api'].Config.Env.map(item => [item.slice(0, item.indexOf('=')), item.slice(item.indexOf('=') + 1)]));
  const upstream = new URL(env.PORTAL_API_BASE_URL);
  assert.equal(upstream.hostname, 'portal-api', 'ONLY_CLONE_PORTAL_API_RUNSYNC_ALLOWED');
  assert.equal(upstream.protocol, 'http:');
  for (const [name, value] of Object.entries(env))
    if (/^(FEATURE_EXECUTION_COMMAND_RELAY|EXECUTION_COMMAND_PLANE_ENABLED|FEATURE_EXECUTION_LIVE_MUTATION)$/.test(name))
      assert.notEqual(value, 'true', 'EXECUTION_COMMANDS_MUST_STAY_OFF');
  const postgres = ownedInspect('portal-postgres');
  const volume = postgres.Mounts.find(item => item.Destination.startsWith('/var/lib/postgresql') && item.Type === 'volume');
  assert(volume?.Name, 'OWNED_CLONE_DB_VOLUME_REQUIRED');
  if (config.expected_db_volume) assert.equal(volume.Name, config.expected_db_volume);
  else assert.match(volume.Name, /^portal[-_]research[-_]p23[-_]/, 'PRODUCTION_DATABASE_VOLUME_REFUSED');
  return { images: Object.fromEntries(Object.entries(inspections).map(([key, value]) => [key, value.Image])),
    worker_running: false, database_volume: volume.Name, run_sync_target: upstream.origin };
}
function gcExclusion(workspace) {
  const artifacts = dbQuery(`SELECT artifact_id,run_id,state,retention_class,manifest_digest,
    (SELECT count(*)::int FROM research.artifact_references r WHERE r.workspace_id=a.workspace_id AND r.artifact_id=a.artifact_id) reference_count
    FROM research.artifacts a WHERE workspace_id=$1 AND run_id=ANY($2::text[]) ORDER BY artifact_id`,
  [workspace, [PARENT, CHILD]]).rows;
  assert(artifacts.some(row => row.run_id === CHILD && row.manifest_digest === CHILD_MANIFEST), 'EXISTING_CHILD_BYTES_IDENTITY_REQUIRED');
  const eligible = dbQuery(`SELECT a.artifact_id FROM research.artifacts a WHERE a.workspace_id=$1
    AND a.state='SEALED' AND a.retention_class='EPHEMERAL_DIAGNOSTIC' AND a.not_before_gc_at<=now()
    AND NOT EXISTS(SELECT 1 FROM research.artifact_references r WHERE r.workspace_id=a.workspace_id AND r.artifact_id=a.artifact_id
      AND (r.reference_kind<>'ACTIVE_LEASE' OR r.pinned_until>now()))
    ORDER BY a.not_before_gc_at,a.artifact_id LIMIT 100`, [workspace]).rows.map(row => row.artifact_id);
  for (const row of artifacts) assert(!eligible.includes(row.artifact_id), 'PINNED_PARENT_OR_AUDIT_CHILD_GC_ELIGIBLE');
  assert(artifacts.every(row => row.state === 'SEALED' && row.retention_class === 'RESEARCH_EVIDENCE'), 'IMMUTABLE_RESEARCH_EVIDENCE_REQUIRED');
  return { operation: 'GC_ELIGIBILITY_READ_ONLY', deletion_attempts: 0, artifacts, eligible };
}

async function main() {
  const configPath = process.argv.find(arg => arg.startsWith('--config='))?.slice(9);
  assert(configPath, 'PRIVATE_CONFIG_REQUIRED');
  const config = requireConfig(privateJson(configPath));
  let continuation = null;
  if (config.lane === 'GET_COMPLETED_EXPORTS') {
    const original = readFileSync(config.continuation_receipt_path);
    assert.equal(hash(original), config.continuation_receipt_sha256, 'ORIGINAL_RECEIPT_CHECKSUM_MISMATCH');
    continuation = JSON.parse(original);
    validateExportContinuation(continuation, config);
  }
  mkdirSync(config.out, { recursive: true, mode: 0o700 }); chmodSync(config.out, 0o700);
  const target = join(config.out, 'p24-publication-export-edges.json');
  assert(!existsSync(target), 'OLD_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const receipt = { schema_version: 'research.p24-publication-export-edges.v1', project: PROJECT, base_url: BASE_URL,
    lane: config.lane,
    started_at_utc: new Date().toISOString(), actor: 'p24-edge-publish', workspace_id: config.workspace_id,
    parent_run_id: PARENT, child_run_id: CHILD, source_head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    harness_sha256: hash(readFileSync(fileURLToPath(import.meta.url))), checks: [], requests: [], page_errors: [],
    expected_transport_errors: [], forbidden_api_attempts: [], scenarios: {
      'SC-19': { status: config.lane === 'PUBLICATION_AND_EXPORT' ? 'NOT_RUN' : 'NOT_RUN_IN_LANE', scope: 'Real browser lost response before/after ACK and exact actor retry' },
      'SC-24': { status: 'NOT_RUN', scope: 'Existing child re-export/download and GC reference exclusion; no deletion/new restore' } },
    cleanup: 'ROOT_DISABLE_AND_REVOKE_OWN_EPHEMERAL_QA', passed: false };
  const check = (name, fact) => { receipt.checks.push({ name, passed: Boolean(fact) }); assert(fact, name); };
  let browser, context, page, armed = 'OFF', browserPublishes = 0, forwarded = 0, ack = null, priorBody = null;
  let candidateId = null, publicationPath = null, baseline = null;
  const persist = () => savePrivate(target, receipt);
  try {
    receipt.runtime = runtimeSafety(config);
    const user = dbQuery('SELECT user_id,username,role,status FROM public.portal_users WHERE username=$1', ['p24-edge-publish']).rows[0];
    check('temporary_ordinary_user', user?.role === 'USER' && user.status === 'ACTIVE');
    check('target_workspace_member', dbQuery(`SELECT count(*)::int n FROM public.workspace_members WHERE user_id=$1 AND workspace_id=$2 AND role='MEMBER'`,
      [user.user_id, config.workspace_id]).rows[0].n === 1);
    receipt.actor_id = user.user_id;
    const { chromium, expect } = await import(pathToFileURL(config.playwright_module ?? join(ROOT, 'apps/portal/frontend/node_modules/@playwright/test/index.mjs')).href);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { 'x-dev-access-email': 'p24-edge-publish@azdag.com' } });
    page = await context.newPage();
    const scoped = path => `${path}${path.includes('?') ? '&' : '?'}workspace_id=${encodeURIComponent(config.workspace_id)}`;
    const headers = async write => {
      const cookies = await context.cookies();
      return { origin: BASE_URL, cookie: cookies.map(item => `${item.name}=${item.value}`).join('; '),
        ...(write ? { 'x-portal-csrf': cookies.find(item => item.name === '__Host-portal_csrf')?.value ?? '' } : {}) };
    };
    const call = async (method, path, body, statuses = [200]) => {
      assert(path.startsWith('/api/') && new URL(path, BASE_URL).origin === BASE_URL, 'SAME_ORIGIN_NAMED_PATH_REQUIRED');
      const response = await context.request.fetch(`${BASE_URL}${path}`, { method, headers: await headers(method !== 'GET'),
        ...(body === undefined ? {} : { data: body }), timeout: 30000 });
      const value = await response.json();
      receipt.requests.push({ method, path, status: response.status(), response_sha256: hash(value) });
      assert(statuses.includes(response.status()), `NAMED_REQUEST:${method}:${path}:${response.status()}:${value.error?.code ?? 'UNEXPECTED'}`);
      return value;
    };
    const login = await context.request.post(`${BASE_URL}/api/auth/login`, {
      headers: { origin: BASE_URL }, data: { username: 'p24-edge-publish', credential: config.user.password } });
    check('real_qa_login', login.status() === 201);
    await page.goto(`${BASE_URL}${scoped('/research/quantbt/runs')}`, { waitUntil: 'domcontentloaded' });
    const auth = await call('GET', '/api/auth/context');
    check('real_actor_identity', auth.principal?.principalId === user.user_id);
    if (continuation) check('same_continuation_actor', continuation.actor_id === user.user_id);
    baseline = immutableCustody(config.workspace_id); receipt.immutable_before = baseline;
    if (continuation) assert.deepEqual(baseline, continuation.immutable_final, 'ORIGINAL_IMMUTABLE_SOURCE_MUST_STAY_UNCHANGED');
    const reportPath = scoped(`/api/v1/quantbt/runs/${PARENT}/report`);
    const report = await call('GET', reportPath);
    check('parent_audit_applicable', report.final_audit_applicable === true);
    const audit = await call('GET', scoped(`/api/v1/quantbt/runs/${PARENT}/final-audit`));
    check('existing_child_verified', audit.state === 'VERIFIED' && audit.child_run_id === CHILD
      && audit.verification?.manifest_digest === CHILD_MANIFEST && audit.verification.result.optimizer_trials === 0
      && audit.verification.result.optimizer_reinvoked === false && audit.verification.result.parent_run_id === PARENT);
    receipt.audit = audit; receipt.original_report_revision = report.report_revision;
    receipt.original_report_core_sha256 = hash(report.frozen_core);
    if (continuation) {
      check('same_original_report_revision', report.report_revision === continuation.original_report_revision);
      check('same_original_frozen_core', receipt.original_report_core_sha256 === continuation.original_report_core_sha256);
      receipt.continuation_receipt_sha256 = config.continuation_receipt_sha256;
      receipt.scenarios['SC-19'] = { ...continuation.scenarios['SC-19'], reused_receipt_sha256: config.continuation_receipt_sha256 };
    }
    const composePath = scoped(`/api/v1/quantbt/runs/${PARENT}/release-candidate`);
    let compose = await call('GET', composePath);
    receipt.initial_compose = compose;
    check('existing_child_is_exact_rc_target', compose.fields.some(field => field.key === 'final_audit_run_id' && field.value === CHILD
      && field.availability.state === 'AVAILABLE'));
    const priorPacks = dbQuery('SELECT release_candidate_id FROM research.release_candidate_packs_v1 WHERE workspace_id=$1 AND run_id=$2', [config.workspace_id, PARENT]).rows;
    receipt.prior_pack_count = priorPacks.length;
    if (config.lane === 'PUBLICATION_AND_EXPORT') {
    check('active_pinned_version', compose.run.binding?.lifecycle_state === 'ACTIVE');
    if (!compose.local_seal.release_candidate_id) {
      check('draft_editable_no_reseal', compose.actions.may_edit_draft === true);
      if (!compose.draft.known_limitations || !compose.draft.proposed_use_restrictions) {
        compose = await call('PATCH', scoped(`/api/v1/quantbt/runs/${PARENT}/release-candidate/draft`), {
          expected_revision: compose.draft.revision, expected_source_fingerprint: compose.source_fingerprint,
          known_limitations: 'Isolated P24 transport proof. Existing partial/unpublished facts remain unchanged.',
          proposed_use_restrictions: 'Test-only local R1 intake; no approval, trading, promotion or deployment authorized.',
        });
      }
      check('current_source_may_seal', compose.actions.may_seal === true);
      const sealed = await call('POST', scoped(`/api/v1/quantbt/runs/${PARENT}/release-candidate/seal`), {
        draft_id: compose.draft.draft_id, expected_draft_revision: compose.draft.revision,
        expected_source_fingerprint: compose.source_fingerprint,
      }, [201]);
      candidateId = sealed.release_candidate_id; receipt.local_seal = sealed;
    } else {
      check('current_existing_seal', compose.local_seal.state === 'SEALED_LOCAL' && compose.local_seal.availability.state === 'AVAILABLE');
      candidateId = compose.local_seal.release_candidate_id;
    }
    assert.match(candidateId, /^rc_[A-Za-z0-9]+$/);
    receipt.release_candidate_id = candidateId;
    publicationPath = scoped(`/api/v1/research/release-candidates/${candidateId}/publish`);
    const readPath = scoped(`/api/v1/research/release-candidates/${candidateId}/publication`);
    const publication = await call('GET', readPath);
    const wanted = publishInput(publication); receipt.exact_publish_payload = wanted;
    const initial = publicationCustody(config.workspace_id, candidateId); receipt.publication_before = initial;
    check('no_existing_publication_intent', initial.intents.length === 0 && initial.approvals.length === 0);
    page.on('pageerror', error => receipt.page_errors.push(String(error).slice(0, 300)));
    page.on('console', message => { if (message.type() === 'error' && /net::ERR_/.test(message.text()))
      receipt.expected_transport_errors.push(message.text().slice(0, 180)); });
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) receipt.requests.push({ method: request.method(), path: url.pathname + url.search, browser: true });
    });
    await page.route('**/api/**', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (url.origin !== BASE_URL) { receipt.forbidden_api_attempts.push('OFF_ORIGIN'); return route.abort(); }
      if (request.method() === 'GET') return route.continue();
      if (request.method() !== 'POST' || url.pathname + url.search !== publicationPath || armed === 'OFF') {
        receipt.forbidden_api_attempts.push(`${request.method()} ${url.pathname}`); return route.abort();
      }
      browserPublishes += 1;
      check('browser_publish_bound', browserPublishes <= 4 && forwarded <= 3);
      const body = request.postDataJSON();
      assert.deepEqual(body, wanted, 'UI_PUBLISH_MUST_USE_EXACT_SOURCE_PAYLOAD');
      if (priorBody) assert.deepEqual(body, priorBody, 'RETRY_MUST_KEEP_ORIGINAL_PAYLOAD');
      priorBody = body;
      if (armed === 'BEFORE_ACK') { armed = 'OFF'; return route.abort('timedout'); }
      forwarded += 1;
      const response = await route.fetch(); const answer = await response.json();
      receipt.forwarded_publish_answers ??= []; receipt.forwarded_publish_answers.push({ status: response.status(), body: answer });
      assert.equal(response.status(), 200); assertDelivered(answer, user.user_id, candidateId, ack);
      if (armed === 'AFTER_ACK') { ack = answer; armed = 'OFF'; return route.abort('connectionreset'); }
      return route.fulfill({ response });
    });
    await page.goto(`${BASE_URL}${scoped(`/research/quantbt/runs/${PARENT}/release-candidate`)}`, { waitUntil: 'domcontentloaded' });
    const screen = page.locator('[data-screen="release-candidate"][data-rc-mode="compose"]');
    await screen.waitFor({ timeout: 30000 });
    receipt.bundle = await page.locator('script[src*="/assets/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src')));
    const submit = async mode => {
      const button = screen.locator('[data-action="publish"]');
      await expect(button).toHaveAttribute('data-publish-enabled', 'true', { timeout: 30000 });
      await button.click(); armed = mode;
      await screen.locator('[data-action="confirm-publish"]').click();
    };
    await submit('BEFORE_ACK');
    await screen.locator('[data-write-notice="publish"][data-outcome="unavailable"]').waitFor({ timeout: 15000 });
    await expect(screen).toHaveAttribute('data-rc-chip', 'SEALED');
    receipt.publication_before_ack_loss = publicationCustody(config.workspace_id, candidateId);
    check('before_ack_no_intent_or_r1', receipt.publication_before_ack_loss.intents.length === 0
      && receipt.publication_before_ack_loss.approvals.length === 0);
    check('before_ack_no_false_published', await screen.locator('[data-panel="published"]').count() === 0);
    await page.screenshot({ path: join(config.out, 'SC19-before-ack.png'), fullPage: true });
    await submit('AFTER_ACK');
    await screen.locator('[data-write-notice="publish"][data-outcome="unavailable"]').waitFor({ timeout: 15000 });
    await expect.poll(() => Boolean(ack), { timeout: 30000 }).toBe(true);
    receipt.publication_after_ack_loss = publicationCustody(config.workspace_id, candidateId);
    check('after_ack_one_committed_effect', receipt.publication_after_ack_loss.intents.length === 1
      && receipt.publication_after_ack_loss.approvals.length === 1 && receipt.publication_after_ack_loss.intents[0].state === 'DELIVERED');
    check('lost_ack_not_called_approved', await screen.locator('[data-panel="mirror"] [data-mirror-status="APPROVED"]').count() === 0);
    await page.screenshot({ path: join(config.out, 'SC19-after-ack-loss.png'), fullPage: true });
    await submit('REPLAY');
    await screen.locator('[data-panel="published"]').waitFor({ timeout: 30000 });
    await expect(screen).toHaveAttribute('data-rc-chip', 'PUBLISHED');
    const final = await call('GET', readPath);
    assertDelivered(final, user.user_id, candidateId);
    check('publisher_receipt_without_reviewer_privilege', final.approval_read === 'DENIED' && final.approval === null);
    receipt.publication_after_retry = publicationCustody(config.workspace_id, candidateId);
    assert.deepEqual(receipt.publication_after_retry, receipt.publication_after_ack_loss, 'RETRY_MUST_NOT_REWRITE_PUBLICATION_OR_R1');
    check('real_browser_retry_is_replayed', receipt.forwarded_publish_answers.length === 2 && receipt.forwarded_publish_answers[1].body.replayed === true);
    receipt.scenarios['SC-19'].status = 'SCOPED_PASS';
    await page.screenshot({ path: join(config.out, 'SC19-reconciled.png'), fullPage: true });
    armed = 'OFF';
    } else {
      // Read-only inspection is not a seal/publication prerequisite. No draft,
      // current-source seal, R1 intake or trading authorization is written here.
      receipt.publication_prerequisite_observed_only = {
        may_seal: compose.actions.may_seal,
        missing_evidence_rows: compose.pack.filter(item => item.status === 'MISSING'),
      };
      candidateId = compose.local_seal.release_candidate_id;
      if (continuation) {
        check('same_current_candidate', candidateId === continuation.release_candidate_id);
        receipt.release_candidate_id = candidateId;
        receipt.publication_before = publicationCustody(config.workspace_id, candidateId);
        assert.deepEqual(receipt.publication_before, continuation.publication_after_retry, 'PUBLICATION_OR_R1_MUST_STAY_UNCHANGED');
      }
    }
    const exportsPath = scoped(`/api/v1/quantbt/runs/${PARENT}/report/exports`);
    const pending = () => dbQuery("SELECT count(*)::int n FROM research.run_report_export_jobs_v1 WHERE state IN ('QUEUED','RUNNING')").rows[0].n;
    check('no_unowned_export_queue', pending() === 0);
    receipt.exports = [];
    if (continuation) {
      receipt.exports = continuation.exports.map(item => ({ created: item.created, existing_job_only: true }));
      const jobRows = dbQuery(`SELECT job_id,requested_by_user_id,run_id,report_revision,format,state
        FROM research.run_report_export_jobs_v1 WHERE workspace_id=$1 AND job_id=ANY($2::text[]) ORDER BY job_id`,
      [config.workspace_id, receipt.exports.map(item => item.created.job_id)]).rows;
      check('same_two_owned_terminal_exports', jobRows.length === 2 && jobRows.every(row => row.state === 'READY'
        && row.requested_by_user_id === user.user_id && row.run_id === PARENT && row.report_revision === report.report_revision));
      receipt.existing_export_custody = jobRows;
      receipt.export_worker = { status: 'NOT_RUN_IN_CONTINUATION', original_stdout_sha256: null,
        reason: 'Original CLI completed before harness parsing failed; stdout bytes were not recorded. Existing terminal jobs are verified through GET.' };
    } else {
    for (const format of ['REPORT_JSON', 'REPORT_CSV']) {
      const result = await call('POST', exportsPath, { format }, [202]);
      check('fresh_actor_export_is_queued', result.state === 'QUEUED');
      receipt.exports.push({ created: result }); persist();
    }
    check('exactly_two_owned_export_jobs_queued', pending() === 2);
    const workerOutput = docker(['exec', container('control-api'), 'node', 'dist/cli/research-report-export-worker.js', '--limit=2']);
    receipt.export_worker_stdout_sha256 = hash(workerOutput);
    savePrivate(join(config.out, 'export-worker-stdout.json'), { stdout: workerOutput, sha256: hash(workerOutput) });
    persist();
    receipt.export_worker = parseExportWorkerOutput(workerOutput, receipt.exports.map(item => item.created.job_id));
    }
    for (const item of receipt.exports) {
      const status = await call('GET', scoped(`/api/v1/quantbt/runs/${PARENT}/report/exports/${item.created.job_id}`));
      assert.equal(status.report_revision, report.report_revision);
      assert.equal(status.run_id, PARENT);
      assert(status.download_href?.startsWith(`/api/v1/quantbt/runs/${PARENT}/report/exports/${item.created.job_id}/download?`));
      const download = await context.request.get(`${BASE_URL}${status.download_href}`, { headers: await headers(false) });
      check('prepared_export_download_200', download.status() === 200);
      item.final = status; item.download = assessDownload(status, await download.body());
      check('private_download_cache_policy', /private/.test(download.headers()['cache-control'] ?? ''));
    }
    check('finite_export_queue_drained', pending() === 0);
    const afterReport = await call('GET', reportPath);
    check('report_core_and_revision_not_resealed', afterReport.report_revision === report.report_revision
      && hash(afterReport.frozen_core) === receipt.original_report_core_sha256);
    receipt.gc = gcExclusion(config.workspace_id);
    const refs = candidateId ? dbQuery(`SELECT artifact_id,reference_kind,reference_id,pinned_until FROM research.artifact_references
      WHERE workspace_id=$1 AND reference_kind='RELEASE_CANDIDATE' AND reference_id=$2 ORDER BY artifact_id`,
    [config.workspace_id, candidateId]).rows : [];
    if (candidateId) {
      check('rc_has_permanent_reference', refs.length > 0 && refs.every(row => row.pinned_until === null));
      check('all_rc_artifacts_excluded_from_gc', refs.every(row => !receipt.gc.eligible.includes(row.artifact_id)));
    }
    receipt.rc_reference_graph = { status: candidateId ? 'VERIFIED' : 'NOT_APPLICABLE_NO_CURRENT_CANDIDATE', references: refs };
    if (continuation) assert.deepEqual(publicationCustody(config.workspace_id, candidateId), receipt.publication_before,
      'CONTINUATION_MUST_NOT_TOUCH_PUBLICATION_OR_R1');
    for (const tail of ['report', 'release-candidate'])
      await call('GET', scoped(`/api/v1/quantbt/runs/${PARENT}/${tail}`));
    const lineage = await call('GET', lineageReadPath(compose, config.workspace_id));
    check('same_alpha_lineage_readable', lineage.schema_version === 'research.attempt-lineage.v1'
      && lineage.alpha.alpha_id === compose.run.binding.alpha_id
      && lineage.attempts.some(attempt => attempt.primary_run.run_id === PARENT));
    receipt.lineage_graph = { alpha_id: lineage.alpha.alpha_id, counts: lineage.counts,
      parent_node: lineage.attempts.find(attempt => attempt.primary_run.run_id === PARENT), coverage: lineage.coverage };
    await call('GET', scoped('/api/v1/quantbt/runs?limit=50'));
    receipt.scenarios['SC-24'].status = 'SCOPED_PASS';
    receipt.scenarios['SC-24'].reused_restore_receipt_sha256 = 'c6722fae0a9f60c78ade22e7e4a99b68ebfbc9f688ed6f056efecdcc389016f7';
    receipt.immutable_after = immutableCustody(config.workspace_id);
    assert.deepEqual(receipt.immutable_after, baseline, 'NO_JOB_SELECTION_ALPHA_EXPOSURE_AUDIT_CORE_OR_DECISION_MUTATION');
    check('no_browser_page_errors', receipt.page_errors.length === 0);
    check('no_forbidden_browser_calls', receipt.forbidden_api_attempts.length === 0);
    check('worker_off_and_exact_images_after', hash(runtimeSafety(config)) === hash(receipt.runtime));
    const afterPacks = dbQuery('SELECT release_candidate_id FROM research.release_candidate_packs_v1 WHERE workspace_id=$1 AND run_id=$2', [config.workspace_id, PARENT]).rows;
    check('at_most_one_new_rc', afterPacks.length - receipt.prior_pack_count >= 0 && afterPacks.length - receipt.prior_pack_count <= 1);
    receipt.passed = true;
  } catch (error) {
    receipt.failure = { name: error.name, message: String(error.message).slice(0, 650) };
    if (receipt.scenarios['SC-19'].status === 'NOT_RUN') receipt.scenarios['SC-19'].status = candidateId ? 'FAIL' : 'PREREQUISITE_REFUSED';
    if (page) await page.screenshot({ path: join(config.out, 'failure.png'), fullPage: true }).catch(() => {});
  } finally {
    armed = 'OFF';
    if (baseline) {
      receipt.immutable_final ??= immutableCustody(config.workspace_id);
      receipt.immutable_source_preserved = hash(receipt.immutable_final) === hash(baseline);
      if (!receipt.immutable_source_preserved) receipt.passed = false;
    }
    receipt.browser_publish_attempts = browserPublishes; receipt.actual_publish_posts = forwarded;
    receipt.completed_at_utc = new Date().toISOString(); persist();
    if (context) await context.request.post(`${BASE_URL}/api/auth/logout`, { headers: { origin: BASE_URL,
      cookie: (await context.cookies()).map(item => `${item.name}=${item.value}`).join('; ') } }).catch(() => {});
    await browser?.close();
    console.log(JSON.stringify({ passed: receipt.passed, scenarios: receipt.scenarios, actual_publish_posts: forwarded,
      receipt: target, sha256: hash(readFileSync(target)), failure: receipt.failure ?? null }));
  }
  if (!receipt.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error('P24 owned publication/export refused:', error.name, String(error.message).slice(0, 300)); process.exitCode = 1; });
