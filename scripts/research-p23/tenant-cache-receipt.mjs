#!/usr/bin/env node
/** T05: live authenticated read/cache isolation on the owned P23 cell only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSessions, privateJson, readBoundedJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeCache = value => typeof value === 'string'
  && /(?:^|,)\s*private\b/i.test(value)
  && (/(?:^|,)\s*no-store\b/i.test(value)
    || /(?:^|,)\s*no-cache\b/i.test(value)
    || (/(?:^|,)\s*max-age=0\b/i.test(value) && /(?:^|,)\s*must-revalidate\b/i.test(value)));

export function assessTenantCache(checks) {
  const missingPolicy = checks.filter(x => !safeCache(x.owner.cache_control)).map(x => x.name);
  const badRevalidation = checks.filter(x => x.should_revalidate
    && (x.owner_revalidate?.status !== 304 || !safeCache(x.owner_revalidate.cache_control)))
    .map(x => x.name);
  const refused = checks.filter(x => x.owner.status !== 200 || x.nonmember.status !== 404
    || x.anonymous.status !== 401 || x.nonmember.error_code === null
    || x.anonymous.error_code === null).map(x => x.name);
  return { actual_route_count: checks.length, member_boundary_passed: checks.length >= 9 && refused.length === 0,
    cache_policy_passed: missingPolicy.length === 0, revalidation_passed: badRevalidation.length === 0,
    missing_policy: missingPolicy, bad_revalidation: badRevalidation, bad_authority: refused,
    full_t05_passed: false }; // File/export and raw-object boundaries have separate receipts.
}

async function get(user, path, candidate) {
  assert(path.startsWith('/api/v1/') && new URL(path, BASE_URL).origin === BASE_URL,
    'EXACT_SAME_ORIGIN_RESEARCH_GET_REQUIRED');
  const response = await fetch(new URL(path, BASE_URL), {
    method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000),
    headers: { origin: BASE_URL, accept: 'application/json',
      ...(user ? { 'x-dev-access-email': `${user.username}@azdag.com`,
        cookie: Object.entries(user.cookies ?? {}).map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
      ...(candidate ? { 'if-none-match': candidate } : {}) },
  });
  if (user) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], boundary = pair.indexOf('=');
      user.cookies ??= {};
      user.cookies[pair.slice(0, boundary)] = pair.slice(boundary + 1);
    }
  }
  const body = response.status === 304 ? null : await readBoundedJson(response);
  if (response.status === 304) await response.body?.cancel();
  return { body, summary: { status: response.status, etag: response.headers.get('etag'),
    cache_control: response.headers.get('cache-control'),
    body_sha256: body === null ? null : sha(body), error_code: body?.error?.code ?? null } };
}

export async function tenantCacheReceipt(home, label = 't05-cache-19a8e813') {
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_T05_LABEL_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_T05_RECEIPT_MUST_BE_REVIEWED');
  const identity = privateJson(join(home, 'identity.json'));
  assert(identity.project === PROJECT && identity.base_url === BASE_URL && identity.dirty === false,
    'CLEAN_OWNED_APPLICATION_REQUIRED');
  const actual = JSON.parse(docker(['inspect', '--format', '{{json .}}', container('control-api')]));
  assert(actual.Image === identity.images['control-api'].image_id,
    'PINNED_CONTROL_API_IMAGE_REQUIRED');
  const sessions = loadSessions(home);
  const owner = sessions.identities.find(x => x.username === 'p23-owner');
  const nonmember = sessions.identities.find(x => x.username === 'p23-approver');
  const workspace = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  const p04 = privateJson(join(home, 'run-integrity-original.json')).run_id;
  const candidate = privateJson(join(home, 'publication-replay-19a8e813.json')).release_candidate_id;
  assert(owner?.id && nonmember?.id && owner.id !== nonmember.id
    && /^ws_[A-Za-z0-9]+$/.test(workspace) && /^rrun_[a-f0-9]{32}$/.test(p04)
    && /^rc_[A-Za-z0-9]+$/.test(candidate), 'EXACT_EXISTING_TEST_FACTS_REQUIRED');
  const memberships = dbQuery(`SELECT user_id FROM public.workspace_members
    WHERE workspace_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id`,
  [workspace, [owner.id, nonmember.id]]).rows;
  assert(memberships.length === 1 && memberships[0].user_id === owner.id,
    'OWNER_MEMBER_AND_FOREIGN_NONMEMBER_REQUIRED');
  const packPath = `/api/v1/research/release-candidates/${candidate}?workspace_id=${workspace}`;
  const pack = await get(owner, packPath);
  assert(pack.summary.status === 200 && /^rrun_[a-f0-9]{32}$/.test(pack.body.run_id),
    'ACTUAL_PUBLISHED_WFO_RUN_REQUIRED');
  const wfo = pack.body.run_id;
  const pathFor = suffix => `/api/v1/quantbt/runs/${suffix}?workspace_id=${workspace}`;
  const routes = [
    ['library', `/api/v1/quantbt/runs?workspace_id=${workspace}`],
    ['sparkline', pathFor(`${p04}/sparkline`)],
    ['split', pathFor(`${p04}/split`)],
    ['freeze', pathFor(`${p04}/freeze`)],
    ['current_evidence', pathFor(`${wfo}/current-source/evidence`)],
    ['current_search', pathFor(`${wfo}/current-source/search`)],
    ['current_freeze', pathFor(`${wfo}/current-source/freeze`)],
    ['report', pathFor(`${wfo}/report`)],
    ['candidate_pack', packPath],
    ['publication', `/api/v1/research/release-candidates/${candidate}/publication?workspace_id=${workspace}`],
  ];
  const receipt = { schema_version: 'research.p23-tenant-cache.v1', project: PROJECT, base_url: BASE_URL,
    candidate_source_sha: identity.candidate_source_sha, candidate_image_id: actual.Image,
    workspace_id: workspace, owner_id: owner.id, nonmember_id: nonmember.id,
    p04_run_id: p04, wfo_run_id: wfo, release_candidate_id: candidate,
    started_at_utc: new Date().toISOString(), checks: [], assessment: null,
    scope: 'Named GET/cache only; prior export and file proofs remain separate.' };
  savePrivate(target, receipt);
  try {
    for (const [name, path] of routes) {
      const positive = await get(owner, path);
      const foreign = await get(nonmember, path, positive.summary.etag);
      const anonymous = await get(null, path, positive.summary.etag);
      const shouldRevalidate = !!positive.summary.etag
        && !/(?:^|,)\s*no-store\b/i.test(positive.summary.cache_control ?? '');
      const revalidated = shouldRevalidate ? await get(owner, path, positive.summary.etag) : null;
      const strongControl = ['freeze', 'report'].includes(name) && typeof positive.body?.etag === 'string'
        && positive.body.etag !== positive.summary.etag
        ? await get(owner, path, positive.body.etag) : null;
      receipt.checks.push({ name, route: path.split('?')[0], owner: positive.summary,
        nonmember: foreign.summary, anonymous: anonymous.summary,
        should_revalidate: shouldRevalidate, owner_revalidate: revalidated?.summary ?? null,
        strong_body_validator_control: strongControl?.summary ?? null });
      savePrivate(target, receipt);
    }
    receipt.assessment = assessTenantCache(receipt.checks);
    receipt.completed_at_utc = new Date().toISOString();
    savePrivate(target, receipt);
    console.log(JSON.stringify(receipt.assessment));
    assert(receipt.assessment.member_boundary_passed && receipt.assessment.cache_policy_passed
      && receipt.assessment.revalidation_passed, 'T05_CACHE_POLICY_GAP_RECORDED_NOT_PASS');
    return receipt;
  } catch (error) {
    receipt.failure = error.message; receipt.failed_at_utc = new Date().toISOString();
    savePrivate(target, receipt); throw error;
  } finally {
    savePrivate(join(home, 'sessions.json'), sessions);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  tenantCacheReceipt(process.argv.find(x => x.startsWith('--home='))?.slice(7),
    process.argv.find(x => x.startsWith('--label='))?.slice(8))
    .catch(error => { console.error('P23 tenant cache refused:', error.message); process.exitCode = 1; });
}
