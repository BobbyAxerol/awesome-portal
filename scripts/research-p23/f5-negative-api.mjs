#!/usr/bin/env node
/** Real same-origin S02/S14 refusal subset on the owned, isolated P23 cell. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, operatorClient, privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const jobs = workspace => dbQuery('SELECT count(*)::int count FROM research.jobs WHERE workspace_id=$1', [workspace]).rows[0].count;

function acceptedSource(alphaId) {
  const fixture = readFileSync(join(ROOT, 'scripts/research-preview/e17-imported-receipt.mjs'), 'utf8');
  const match = fixture.match(/const source = `([\s\S]*?)`;/);
  assert(match, 'ACCEPTED_E17_SOURCE_FIXTURE_REQUIRED');
  return `# P23 F5 negative subject ${alphaId}\n${match[1]}`;
}

async function raw(method, path, { cookies = {}, csrf = false, body } = {}) {
  assert(path.startsWith('/api/') && new URL(path, BASE_URL).origin === BASE_URL, 'OWNED_SAME_ORIGIN_ONLY');
  const response = await fetch(new URL(path, BASE_URL), {
    method, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { origin: BASE_URL, accept: 'application/json', 'content-type': 'application/json',
      'x-dev-access-email': 'p23-owner@azdag.com',
      cookie: Object.entries(cookies).map(([key, value]) => `${key}=${value}`).join('; '),
      ...(csrf ? { 'x-portal-csrf': cookies['__Host-portal_csrf'] ?? '' } : {}),
    }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await readBoundedJson(response) };
}

function record(receipt, name, response, status, code) {
  assert.equal(response.status, status, `${name}:HTTP_STATUS`);
  assert.equal(response.body.error?.code, code, `${name}:TYPED_CODE`);
  receipt.refusals.push({ name, status, code });
}

export async function negativeApiReceipt({ home = DEFAULT_HOME, label = 'f5-negative-api' } = {}) {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,63}$/.test(label), 'P23_RECEIPT_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_F5_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false
    && Object.keys(identity.images).length === 7, 'CLEAN_PINNED_CELL_REQUIRED');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const sessions = loadSessions(home);
  const readerUser = sessions.identities.find(user => user.username === 'p23-reader-01');
  assert(readerUser?.id && sessions.preparation_complete, 'OWNED_TEST_READER_REQUIRED');
  const owner = await operatorClient(home);
  const reader = makeClient(readerUser);
  const alphaId = `p23-neg-${randomUUID().slice(0, 8)}`;
  const source = acceptedSource(alphaId);
  const receipt = {
    schema_version: 'research.p23-f5-negative-api.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha,
    image_ids: Object.fromEntries(Object.entries(identity.images).map(([name, pin]) => [name, pin.image_id])),
    tested_at_utc: new Date().toISOString(), alpha_id: alphaId,
    source_sha256: sha256(source), jobs_before: jobs(workspace), refusals: [], checks: {},
    scope: 'S02_S14_REAL_API_400_401_403_404_409_ONLY', scoped_passed: false,
    full_f5_passed: false, full_p23_passed: false,
  };
  try {
    record(receipt, 'S02 malformed preflight',
      await owner.call('POST', '/api/v1/research/preflights', { requested_spec: {} }, [400]),
      400, 'RESEARCH_PREFLIGHT_INVALID');
    record(receipt, 'S14 malformed source',
      await owner.call('POST', '/api/v1/research/alphas/import/parse', { original_filename: 'bad.txt', source_text: 'x' }, [400]),
      400, 'RESEARCH_ALPHA_IMPORT_INVALID');
    record(receipt, 'S02 anonymous preflight',
      await raw('POST', '/api/v1/research/preflights', { body: { requested_spec: {} } }),
      401, 'SESSION_REQUIRED');
    record(receipt, 'S14 anonymous parse',
      await raw('POST', '/api/v1/research/alphas/import/parse', { body: { original_filename: 'test.py', source_text: 'x' } }),
      401, 'SESSION_REQUIRED');
    record(receipt, 'S02 missing CSRF',
      await raw('POST', '/api/v1/research/preflights', { cookies: Object.fromEntries(owner.jar), body: { requested_spec: {} } }),
      403, 'RESEARCH_PREFLIGHT_INVALID');
    record(receipt, 'S14 missing CSRF',
      await raw('POST', '/api/v1/research/alphas/import/parse', {
        cookies: Object.fromEntries(owner.jar), body: { original_filename: 'test.py', source_text: 'x' },
      }), 403, 'RESEARCH_ALPHA_IMPORT_INVALID');
    record(receipt, 'S02 missing preflight token',
      await owner.call('GET', `/api/v1/research/preflights/rpft_missing-${randomUUID()}`, undefined, [404]),
      404, 'RESEARCH_PREFLIGHT_NOT_FOUND');
    record(receipt, 'S14 missing Alpha version',
      await owner.call('POST', `/api/v1/research/alphas/av_missing-${randomUUID()}/activate`,
        { expected_alpha_revision: 1 }, [404]),
      404, 'RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND');

    const parsed = await owner.call('POST', '/api/v1/research/alphas/import/parse',
      { original_filename: `${alphaId}.py`, source_text: source }, [201]);
    assert.equal(parsed.body.source_digest, receipt.source_sha256, 'SOURCE_DIGEST_MISMATCH');
    const gates = await owner.call('POST', '/api/v1/research/alphas/import/gates',
      { source_file_ref: parsed.body.source_file_ref }, [200]);
    assert.equal(gates.body.all_pass, true, 'TEST_ALPHA_GATES_REQUIRED');
    const registered = await owner.call('POST', '/api/v1/research/alphas/import/register',
      { source_file_ref: parsed.body.source_file_ref, alpha_id: alphaId, gate_receipt_id: gates.body.gate_receipt_id }, [201]);
    assert.equal(registered.body.lifecycle_state, 'DRAFT');
    const activatePath = `/api/v1/research/alphas/${registered.body.alpha_version_id}/activate`;
    record(receipt, 'S14 nonadmin activation',
      await reader.call('POST', activatePath, { expected_alpha_revision: registered.body.alpha_revision }, [403]),
      403, 'RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN');
    record(receipt, 'S14 stale activation CAS',
      await owner.call('POST', activatePath, { expected_alpha_revision: registered.body.alpha_revision + 77 }, [409]),
      409, 'RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT');
    const readback = await owner.call('GET', `/api/v1/research/alphas?alpha_id=${alphaId}`);
    assert.equal(readback.body.entries.length, 1);
    assert.equal(readback.body.entries[0].lifecycle_state, 'DRAFT');
    assert.equal(readback.body.entries[0].alpha_revision, registered.body.alpha_revision);
    receipt.checks.stale_cas_preserved_draft = true;
    receipt.checks.refusal_count = receipt.refusals.length;
    receipt.jobs_after = jobs(workspace);
    assert.equal(receipt.jobs_after, receipt.jobs_before, 'NEGATIVE_LANE_CREATED_ENGINE_JOB');
    receipt.scoped_passed = true;
  } catch (error) {
    receipt.error = { code: error.code ?? error.name, message: String(error.message).slice(0, 500) };
    throw error;
  } finally {
    receipt.jobs_after ??= jobs(workspace);
    savePrivate(target, receipt);
    console.log('P23 F5 real API negative subset', receipt.scoped_passed ? 'PASS' : 'FAIL',
      `sha256:${sha256(JSON.stringify(receipt, null, 2) + '\n')}`);
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  negativeApiReceipt({
    home: process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME,
    label: process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'f5-negative-api',
  }).catch(error => { console.error('P23 F5 negative API refused:', error.message); process.exitCode = 1; });
}
