#!/usr/bin/env node
/** GET-only owned :8096 refusals against one already completed causal run. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSessions, makeClient, privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { CAUSAL_PROFILE } from './b8-causal-inner-receipt.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const INVALID = 'RESEARCH_CURRENT_SOURCE_INVALID';
const NOT_FOUND = 'RESEARCH_CURRENT_SOURCE_NOT_FOUND';
const labelValid = label => typeof label === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(label);
const sha = value => createHash('sha256').update(value).digest('hex');
const cursorValid = cursor => typeof cursor === 'string'
  && /^kc1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(cursor) && cursor.length <= 4096;

export function tamperCursor(cursor) {
  assert(cursorValid(cursor), 'FRESH_OPAQUE_CURSOR_REQUIRED');
  const parts = cursor.split('.');
  // Change the first signature character, never a possibly insignificant last base64 bit.
  parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
  return parts.join('.');
}

/** Pure request matrix; callers supply fresh cursors, not receipt-era tokens. */
export function negativeGetMatrix({ workspace, foreignWorkspace, runId, foldId, searchCursor, replayCursor }) {
  for (const value of [workspace, foreignWorkspace]) assert(/^[A-Za-z0-9._-]{1,128}$/.test(value), 'WORKSPACE_ID');
  assert.notEqual(workspace, foreignWorkspace, 'EXACT_FOREIGN_WORKSPACE_REQUIRED');
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId), 'RUN_ID');
  assert(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(foldId), 'ACTUAL_FOLD_ID');
  assert(cursorValid(searchCursor) && cursorValid(replayCursor), 'FRESH_OPAQUE_CURSOR_REQUIRED');
  const path = (route, query = {}) => `/api/v1/quantbt/runs/${runId}/current-source/${route}?${new URLSearchParams({ workspace_id: workspace, ...query })}`;
  const row = (name, route, query, status = 400, code = INVALID) => ({ name, method: 'GET', path: path(route, query), status, code });
  return [
    { ...row('UNAUTHENTICATED_GET', 'evidence', {}, 401, 'SESSION_REQUIRED'), anonymous: true },
    row('FOREIGN_WORKSPACE_GET', 'evidence', { workspace_id: foreignWorkspace }, 404, NOT_FOUND),
    row('SEARCH_LIMIT_ABOVE_200', 'search', { limit: '201' }),
    row('REPLAY_LIMIT_ABOVE_200', 'replay', { limit: '201' }),
    row('SEARCH_MALFORMED_CURSOR', 'search', { limit: '1', cursor: 'not-an-opaque-cursor' }),
    row('REPLAY_MALFORMED_CURSOR', 'replay', { limit: '1', cursor: 'not-an-opaque-cursor' }),
    row('SEARCH_TAMPERED_CURSOR', 'search', { limit: '1', cursor: tamperCursor(searchCursor) }),
    row('REPLAY_TAMPERED_CURSOR', 'replay', { limit: '1', cursor: tamperCursor(replayCursor) }),
    row('SEARCH_CURSOR_CHANGED_FOLD_FILTER', 'search', { limit: '1', cursor: searchCursor, fold: foldId }),
    row('SEARCH_CURSOR_USED_FOR_REPLAY', 'replay', { limit: '1', cursor: searchCursor }),
    row('SEARCH_MUTUALLY_EXCLUSIVE_NAVIGATION', 'search', { limit: '1', cursor: searchCursor, before: searchCursor }),
    // Current contract refuses an unknown search filter with 400; it is not an empty page.
    row('SEARCH_UNKNOWN_FOLD', 'search', { limit: '1', fold: 'unknown-causal-fold' }),
    row('CHILD_AUDIT_UNKNOWN_FOLD', 'replay/child-audit', { fold: 'unknown-causal-fold' }, 404, NOT_FOUND),
  ];
}

/** Synthetic-testable refusal oracle; status and typed code are both exact. */
export function assertNegativeGetReceipt({ matrix, responses, before, after }) {
  assert.equal(matrix.length, 13, 'EXACT_GET_REFUSAL_MATRIX');
  assert.equal(new Set(matrix.map(row => row.name)).size, matrix.length, 'UNIQUE_REFUSALS');
  assert.equal(responses.length, matrix.length, 'COMPLETE_REFUSAL_RESPONSES');
  for (const [ordinal, row] of matrix.entries()) {
    assert.equal(row.method, 'GET', 'NO_ADMISSION_OR_CHILD_REQUEST');
    assert.equal(responses[ordinal].name, row.name, 'REFUSAL_IDENTITY');
    assert.equal(responses[ordinal].response.status, row.status, `${row.name}:HTTP_STATUS`);
    assert.equal(responses[ordinal].response.body.error?.code, row.code, `${row.name}:TYPED_CODE`);
  }
  for (const key of ['workspace_jobs', 'run_jobs', 'workspace_preflights']) {
    assert(Number.isSafeInteger(before[key]) && before[key] >= 0, `BEFORE_${key}_COUNT`);
    assert.equal(after[key], before[key], `NEGATIVE_GET_CHANGED_${key}`);
  }
  assert.equal(before.run_jobs, 1, 'EXACT_EXISTING_RUN_JOB');
  return { definition: 'COMPLETED_CAUSAL_RUN_GET_ONLY_REFUSALS_V1', refusal_count: matrix.length,
    no_job_or_preflight_creation: true, preflight_post_scope: 'NOT_EXECUTED_P08_MAY_PERSIST_PREFLIGHT_ONLY' };
}

async function unauthenticatedGet(path) {
  assert(path.startsWith('/api/') && new URL(path, BASE_URL).origin === BASE_URL, 'OWNED_SAME_ORIGIN_ONLY');
  const response = await fetch(new URL(path, BASE_URL), { method: 'GET', redirect: 'manual',
    signal: AbortSignal.timeout(30000), headers: { origin: BASE_URL, accept: 'application/json',
      'x-dev-access-email': 'p23-owner@azdag.com' } });
  return { status: response.status, body: await readBoundedJson(response) };
}

function counts(workspace, runId) {
  const result = dbQuery(`SELECT
    (SELECT count(*)::int FROM research.jobs WHERE workspace_id=$1) AS workspace_jobs,
    (SELECT count(*)::int FROM research.jobs WHERE workspace_id=$1 AND run_id=$2) AS run_jobs,
    (SELECT count(*)::int FROM research.preflight_manifests WHERE workspace_id=$1) AS workspace_preflights`, [workspace, runId]).rows;
  assert.equal(result.length, 1, 'ONE_SCOPED_COUNT_ROW'); return result[0];
}

export async function causalInnerNegativeReceipt({ home, label = 'b8-causal-inner-negative-20261002', sourceLabel = 'b8-causal-inner-20261002' } = {}) {
  assert(typeof home === 'string' && home.length > 0, 'EXPLICIT_OWNED_HOME_REQUIRED'); home = validateHome(home);
  assert(labelValid(label) && labelValid(sourceLabel) && label !== sourceLabel, 'RECEIPT_LABEL');
  const target = join(home, `${label}.json`), sourcePath = join(home, `${sourceLabel}.json`);
  assert(!existsSync(target), 'PRIOR_NEGATIVE_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const source = privateJson(sourcePath);
  assert(source.schema_version === 'research.b8-causal-inner-owned-api.v1' && source.project === PROJECT
    && source.base_url === BASE_URL && source.passed === true && source.owner_session_revoked === true, 'COMPLETED_OWNED_SOURCE_RECEIPT');
  assert.equal(source.progress.final.body.current.effective_status, 'COMPLETED', 'EXISTING_COMPLETED_RUN_ONLY');
  assert.equal(source.ops_db.producer.execution_profile_id, CAUSAL_PROFILE.execution_id, 'EXACT_CAUSAL_PROFILE');
  assert.equal(source.ops_db.producer.execution_profile_digest, CAUSAL_PROFILE.execution_digest, 'EXACT_CAUSAL_PIN');
  const workspace = source.workspace_id, runId = source.run_id;
  const sessions = loadSessions(home), saved = sessions.identities.find(row => row.username === 'p23-owner');
  assert(saved?.id && saved.password, 'EXISTING_OWNER_ANCHOR_REQUIRED');
  const user = { ...saved, cookies: {} }, client = makeClient(user);
  const receipt = { schema_version: 'research.b8-causal-inner-negative-owned-api.v1', project: PROJECT, base_url: BASE_URL,
    workspace_id: workspace, run_id: runId, label, source_receipt_sha256: sha(readFileSync(sourcePath)),
    started_at_utc: new Date().toISOString(), scope: 'GET_ONLY_EXISTING_COMPLETED_RUN_NO_PREFLIGHT_OR_CHILD_CREATION',
    preflight_posts: 'NOT_EXECUTED_P08_MAY_PERSIST_PREFLIGHT_ONLY', refusals: [], passed: false };
  let authenticated = false;
  try {
    receipt.images = Object.fromEntries(['control-api', 'portal-api', 'quant-worker-py'].map(service =>
      [service, docker(['inspect', '--format', '{{.Image}}', container(service)]).trim()]));
    receipt.before = counts(workspace, runId);
    await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201]); authenticated = true;
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.state, 'AUTHENTICATED'); assert.equal(context.principal.principalId, saved.id);
    receipt.operator = { username: user.username, principal_id: saved.id };
    const otherOwnedPrincipals = sessions.identities.filter(row => /^p23-(approver|reader-[0-9]{2})$/.test(row.username)).map(row => row.id);
    const foreign = dbQuery(`SELECT w.workspace_id FROM public.workspaces w
      WHERE w.owner_user_id=ANY($1::text[]) AND w.workspace_id<>$2
        AND NOT EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=w.workspace_id AND m.user_id=$3)
      ORDER BY w.workspace_id LIMIT 1`, [otherOwnedPrincipals, workspace, saved.id]).rows;
    assert.equal(foreign.length, 1, 'EXISTING_FOREIGN_OWNED_TEST_WORKSPACE_REQUIRED');
    receipt.foreign_workspace_id = foreign[0].workspace_id;
    const freshPath = route => `/api/v1/quantbt/runs/${runId}/current-source/${route}?${new URLSearchParams({ workspace_id: workspace, limit: '1' })}`;
    const search = (await client.call('GET', freshPath('search'))).body;
    const replay = (await client.call('GET', freshPath('replay'))).body;
    for (const page of [search, replay]) {
      assert.equal(page.run_id, runId, 'FRESH_PAGE_RUN'); assert.equal(page.availability.state, 'AVAILABLE', 'FRESH_PAGE_AVAILABLE');
      assert.equal(page.provenance.profile_id, CAUSAL_PROFILE.source_profile, 'FRESH_PAGE_CAUSAL_SOURCE');
      assert.equal(page.provenance.source_manifest_digest, source.ops_db.seal.manifest_digest, 'SAME_IMMUTABLE_SOURCE_SEAL');
    }
    const folds = source.responses.split.body.fold_plan.folds;
    assert.equal(folds.length, 2, 'SOURCE_TWO_OUTER_FOLDS');
    assert(!folds.some(fold => fold.fold_id === 'unknown-causal-fold'), 'UNKNOWN_FOLD_MUST_BE_UNKNOWN');
    const matrix = negativeGetMatrix({ workspace, runId, foreignWorkspace: foreign[0].workspace_id,
      foldId: folds[0].fold_id, searchCursor: search.ledger.page.next_cursor, replayCursor: replay.replay.page.next_cursor });
    const responses = [];
    for (const row of matrix) {
      const response = row.anonymous ? await unauthenticatedGet(row.path) : await client.call('GET', row.path, undefined, [row.status]);
      assert.equal(response.status, row.status, `${row.name}:HTTP_STATUS`);
      assert.equal(response.body.error?.code, row.code, `${row.name}:TYPED_CODE`);
      responses.push({ name: row.name, response });
      // Record no credentials, cookies, cursors, request URLs or unrelated business rows.
      receipt.refusals.push({ name: row.name, status: response.status, code: response.body.error.code });
    }
    receipt.after = counts(workspace, runId);
    receipt.oracle = assertNegativeGetReceipt({ matrix, responses, before: receipt.before, after: receipt.after });
    receipt.passed = true; return receipt;
  } catch (error) {
    receipt.failure = { name: error.name, code: error.code ?? null, message: error.message }; throw error;
  } finally {
    try {
      if (authenticated) { await client.call('POST', '/api/auth/logout', {}, [200, 201]); receipt.owner_session_revoked = true; }
    } finally {
      try { receipt.after ??= counts(workspace, runId); }
      finally { receipt.finished_at_utc = new Date().toISOString(); savePrivate(target, receipt); }
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  causalInnerNegativeReceipt({ home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7),
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'b8-causal-inner-negative-20261002',
    sourceLabel: process.argv.find(arg => arg.startsWith('--source-label='))?.slice(15) ?? 'b8-causal-inner-20261002' })
    .then(receipt => console.log(`Owned causal-inner GET-negative receipt PASS ${sha(JSON.stringify(receipt))}`))
    .catch(() => { console.error('Owned causal-inner GET-negative receipt refused; inspect its private receipt.'); process.exitCode = 1; });
}
