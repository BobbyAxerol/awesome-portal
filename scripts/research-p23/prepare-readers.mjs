#!/usr/bin/env node
/** Authorize exactly the real namespaced readers in an owned test workspace. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DEFAULT_HOME, loadSessions, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

const home = validateHome(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
const sessions = loadSessions(home);
assert(sessions.preparation_complete, 'REAL_SESSIONS_REQUIRED');
const owner = sessions.identities.find(user => user.username === 'p23-owner');
const readers = sessions.identities.filter(user => /^p23-reader-(?:0[1-9]|1[0-9]|20)$/.test(user.username));
assert.equal(readers.length, 20);
const seed = privateJson(join(home, 'run-integrity-original.json'));
assert(seed.final.body.current.effective_status === 'COMPLETED', 'REAL_ARCHIVED_RUN_REQUIRED');
const workspace = dbQuery(`SELECT p.workspace_id FROM research.run_producers p
  JOIN public.workspaces w USING(workspace_id) WHERE p.run_id=$1 AND p.actor_user_id=$2 AND w.owner_user_id=$2`,
[seed.run_id, owner.id]).rows[0];
assert(workspace, 'OWNED_TEST_WORKSPACE_REQUIRED');
const membership = dbQuery(`INSERT INTO public.workspace_members(workspace_id,user_id,role)
  SELECT $1,user_id,'MEMBER' FROM public.portal_users
  WHERE user_id=ANY($2::text[]) AND username LIKE 'p23-reader-%'
  ON CONFLICT(workspace_id,user_id) DO NOTHING RETURNING user_id`, [workspace.workspace_id, readers.map(user => user.id)]);
const actual = dbQuery(`SELECT m.user_id,m.role FROM public.workspace_members m JOIN public.portal_users u USING(user_id)
  WHERE m.workspace_id=$1 AND u.username LIKE 'p23-reader-%' ORDER BY m.user_id`, [workspace.workspace_id]).rows;
assert.equal(actual.length, 20); assert(actual.every(row => row.role === 'MEMBER'));
const suffix = `workspace_id=${workspace.workspace_id}`;
const manifest = { base_url: BASE_URL + '/', users: readers.map(user => ({ id: user.id,
  cookie: Object.entries(user.cookies).map(([key, value]) => `${key}=${value}`).join('; '),
  access_email: `${user.username}@azdag.com` })), paths: [
  `/api/v1/quantbt/runs?${suffix}&limit=20`,
  `/api/v1/research/runs/${seed.run_id}/progress?${suffix}`,
  `/api/v1/quantbt/runs/${seed.run_id}/evidence?${suffix}`,
  `/api/v1/quantbt/runs/${seed.run_id}/search?${suffix}`,
  `/api/v1/quantbt/runs/${seed.run_id}/report?${suffix}`,
  `/api/v1/quantbt/runs/${seed.run_id}/execute/replay?${suffix}`,
] };
savePrivate(join(home, 'read-manifest.json'), manifest);
savePrivate(join(home, 'reader-authorization.json'), { project: PROJECT, base_url: BASE_URL,
  at_utc: new Date().toISOString(), workspace_id: workspace.workspace_id, named_run_id: seed.run_id,
  inserted_memberships: membership.rowCount, actual_memberships: actual, distinct_principals: 20,
  grant_scope: 'Only namespaced test identities in the test owner workspace; approver excluded for IDOR controls.' });
console.log('P23 twenty real readers authorized to the one owned archived-run workspace; private manifest saved.');
