/** Synthetic refusal-oracle units, not authenticated runtime proof. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertNegativeGetReceipt, negativeGetMatrix, tamperCursor } from './b8-causal-inner-negative.mjs';

const input = { workspace: 'ws_synthetic_owner', foreignWorkspace: 'ws_synthetic_foreign', runId: 'rrun_synthetic',
  foldId: '0', searchCursor: 'kc1.synthetic.eyJmb2xkIjowfQ.ABCDEF', replayCursor: 'kc1.synthetic.eyJiYXIiOjB9.FEDCBA' };
function fixture() {
  const matrix = negativeGetMatrix(input), before = { workspace_jobs: 5, run_jobs: 1, workspace_preflights: 7 };
  return { matrix, before, after: { ...before }, responses: matrix.map(row => ({ name: row.name,
    response: { status: row.status, body: { error: { code: row.code } } } })) };
}

test('synthetic matrix fixes exact bounded GET-only statuses and codes', () => {
  const value = fixture(); assert.equal(assertNegativeGetReceipt(value).refusal_count, 13);
  for (const row of value.matrix) {
    assert.equal(row.method, 'GET'); assert(row.path.startsWith('/api/v1/quantbt/runs/rrun_synthetic/current-source/'));
  }
  assert.equal(value.matrix.find(row => row.name === 'UNAUTHENTICATED_GET').code, 'SESSION_REQUIRED');
  assert.equal(value.matrix.find(row => row.name === 'FOREIGN_WORKSPACE_GET').status, 404);
  assert.equal(value.matrix.find(row => row.name === 'SEARCH_UNKNOWN_FOLD').status, 400);
  assert.equal(value.matrix.find(row => row.name === 'CHILD_AUDIT_UNKNOWN_FOLD').status, 404);
  for (const name of ['SEARCH_LIMIT_ABOVE_200', 'REPLAY_LIMIT_ABOVE_200']) {
    const row = value.matrix.find(row => row.name === name);
    assert.equal(new URL(row.path, 'http://127.0.0.1:8096').searchParams.get('limit'), '201');
    assert.equal(row.status, 400);
  }
});

test('synthetic changed filter keeps fresh unfiltered cursor and actual fold', () => {
  const row = negativeGetMatrix(input).find(row => row.name === 'SEARCH_CURSOR_CHANGED_FOLD_FILTER');
  const query = new URL(row.path, 'http://127.0.0.1:8096').searchParams;
  assert.equal(query.get('cursor'), input.searchCursor); assert.equal(query.get('fold'), '0');
});

test('synthetic tamper changes signature not payload and refuses malformed input', () => {
  const original = input.searchCursor.split('.'), tampered = tamperCursor(input.searchCursor).split('.');
  assert.deepEqual(tampered.slice(0, 3), original.slice(0, 3));
  assert.notEqual(tampered[3][0], original[3][0]); assert.equal(tampered[3].slice(1), original[3].slice(1));
  assert.throws(() => tamperCursor('invalid'), /FRESH_OPAQUE_CURSOR_REQUIRED/);
});

for (const [name, mutate, reason] of [
  ['success in refusal lane', value => { value.responses[0].response.status = 200; }, 'HTTP_STATUS'],
  ['wrong typed refusal', value => { value.responses[1].response.body.error.code = 'ACCESS_DENIED'; }, 'TYPED_CODE'],
  ['unknown fold relaxed to empty page', value => { value.responses[11].response.status = 200; }, 'HTTP_STATUS'],
  ['engine job created', value => { value.after.workspace_jobs++; }, 'NEGATIVE_GET_CHANGED_workspace_jobs'],
  ['new preflight persisted', value => { value.after.workspace_preflights++; }, 'NEGATIVE_GET_CHANGED_workspace_preflights'],
  ['run job count changed', value => { value.after.run_jobs++; }, 'NEGATIVE_GET_CHANGED_run_jobs'],
  ['second existing run job', value => { value.before.run_jobs = value.after.run_jobs = 2; }, 'EXACT_EXISTING_RUN_JOB'],
  ['incomplete matrix', value => { value.responses.pop(); }, 'COMPLETE_REFUSAL_RESPONSES'],
  ['write added', value => { value.matrix[1].method = 'POST'; }, 'NO_ADMISSION_OR_CHILD_REQUEST'],
]) test(`synthetic oracle refuses ${name}`, () => {
  const value = fixture(); mutate(value); assert.throws(() => assertNegativeGetReceipt(value), new RegExp(reason));
});

test('entry requires explicit home, existing credentials, fresh cookies, finally logout and private receipt', () => {
  const code = readFileSync(new URL('./b8-causal-inner-negative.mjs', import.meta.url), 'utf8');
  assert(code.includes('EXPLICIT_OWNED_HOME_REQUIRED') && code.includes('cookies: {}'));
  assert(code.includes('COMPLETED_OWNED_SOURCE_RECEIPT') && code.includes('PRIOR_NEGATIVE_RECEIPT_MUST_NOT_BE_OVERWRITTEN'));
  assert(code.includes("'/api/auth/logout'") && code.includes('savePrivate(target, receipt)'));
  assert(code.includes('WHERE workspace_id=$1 AND run_id=$2'));
  assert(code.includes('NOT EXISTS(SELECT 1 FROM public.workspace_members'));
  assert(code.includes('search.ledger.page.next_cursor') && code.includes('replay.replay.page.next_cursor'));
  assert(!code.includes('replay.ledger.page'));
  assert(!code.includes('8095') && !code.includes('prepareSessions(') && !code.includes('change-password'));
  assert(!code.includes('admitRealRun(') && !code.includes('/api/v1/research/preflights'));
  assert.deepEqual([...code.matchAll(/client\.call\('POST', '([^']+)'/g)].map(match => match[1]), ['/api/auth/login', '/api/auth/logout']);
  assert(!/\b(?:UPDATE|DELETE|TRUNCATE|DROP|INSERT)\s/i.test(code));
});
