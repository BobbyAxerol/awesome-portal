/** Private authenticated client for the owned P23 cell, never a browser adapter. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, PROJECT, TEST_USERS, validateHome } from './cell.mjs';

export const DEFAULT_HOME = '/home/bobby/.local/state/portal-research-p23/20260927/runtime';
export function privateJson(path) {
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0, 'PRIVATE_JSON_0600_REQUIRED');
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function savePrivate(path, value) {
  if (existsSync(path)) privateJson(path);
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600);
}
export async function readBoundedJson(response, maximum = 2 * 1024 * 1024) {
  assert(response.headers.get('content-type')?.includes('application/json'), 'NAMED_JSON_REQUIRED');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert(size <= maximum, 'NAMED_RESPONSE_BOUND_EXCEEDED');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally { await reader.cancel(); }
}
export function makeClient(user, { connectionClose = false } = {}) {
  assert(/^p23-(owner|approver|reader-[0-9]{2})$/.test(user.username), 'TEST_IDENTITY_REQUIRED');
  assert(typeof connectionClose === 'boolean', 'EXPLICIT_CONNECTION_POLICY_REQUIRED');
  const jar = new Map(Object.entries(user.cookies ?? {}));
  return {
    user, jar,
    async call(method, path, body, statuses = [200]) {
      assert(path.startsWith('/api/') && new URL(path, BASE_URL).origin === BASE_URL, 'NAMED_SAME_ORIGIN_REQUIRED');
      const response = await fetch(new URL(path, BASE_URL), {
        method, redirect: 'manual', signal: AbortSignal.timeout(45000),
        headers: { origin: BASE_URL, accept: 'application/json', 'content-type': 'application/json',
          ...(connectionClose ? { connection: 'close' } : {}),
          'x-dev-access-email': `${user.username}@azdag.com`,
          cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(method !== 'GET' ? { 'x-portal-csrf': jar.get('__Host-portal_csrf') ?? '' } : {}),
        }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0], boundary = pair.indexOf('=');
        jar.set(pair.slice(0, boundary), pair.slice(boundary + 1));
      }
      const json = await readBoundedJson(response);
      assert(statuses.includes(response.status), `P23_API:${method}:${path}:${response.status}:${json.error?.code ?? 'UNEXPECTED_RESPONSE'}`);
      user.cookies = Object.fromEntries(jar);
      return { status: response.status, body: json };
    },
  };
}
export function loadSessions(home = DEFAULT_HOME) {
  home = validateHome(home);
  const result = privateJson(join(home, 'sessions.json'));
  assert(result.project === PROJECT && result.base_url === BASE_URL, 'FOREIGN_SESSION_FILE');
  return result;
}
export async function prepareSessions(home = DEFAULT_HOME) {
  home = validateHome(home);
  const target = join(home, 'sessions.json');
  const input = privateJson(join(home, 'activation-credentials.json'));
  assert(input.project === PROJECT && input.base_url === BASE_URL, 'FOREIGN_ACTIVATION_FILE');
  const sessions = existsSync(target) ? loadSessions(home) : { project: PROJECT, base_url: BASE_URL, created_at_utc: new Date().toISOString(),
    identities: [], cleanup_state: 'PENDING_REVOKE_AT_QUALIFICATION_END' };
  assert(!sessions.preparation_complete, 'SESSIONS_ALREADY_CREATED_DO_NOT_RESET');
  // Store incremental progress privately: interruption must not consume a token
  // twice or reset a credential. A partial file is explicitly not acceptance.
  for (const entry of TEST_USERS) {
    let user = sessions.identities.find(identity => identity.username === entry.username);
    if (user?.id) continue;
    if (!user) {
      user = { username: entry.username, password: `P23!${randomBytes(24).toString('hex')}`,
        cookies: {}, preparation_stage: 'ACTIVATION_PENDING' };
      sessions.identities.push(user);
      savePrivate(target, sessions);
    }
    const client = makeClient(user);
    let login;
    // A dropped password-change ACK must reuse the privately saved password,
    // not reset the identity or regenerate its consumed activation token.
    if (user.preparation_stage === 'PASSWORD_CHANGE_MAY_HAVE_COMMITTED') {
      const attempt = await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201, 401]);
      if (attempt.status === 201) login = attempt.body;
    }
    if (!login) {
      await client.call('POST', '/api/auth/login', { username: user.username, credential: input.credentials[user.username] }, [201]);
      user.preparation_stage = 'PASSWORD_CHANGE_MAY_HAVE_COMMITTED';
      savePrivate(target, sessions);
      await client.call('POST', '/api/auth/change-password', {
        current_password: input.credentials[user.username], new_password: user.password,
      }, [201]);
      login = (await client.call('POST', '/api/auth/login', { username: user.username, credential: user.password }, [201])).body;
    }
    const context = (await client.call('GET', '/api/auth/context')).body;
    assert.equal(context.state, 'AUTHENTICATED');
    assert.equal(context.principal.username, user.username);
    user.id = context.principal.principalId;
    user.absolute_expires_at = login.absolute_expires_at;
    user.preparation_stage = 'AUTHENTICATED';
    savePrivate(target, sessions);
    console.log('P23 authenticated test principal', user.username);
  }
  assert.equal(new Set(sessions.identities.map(user => user.id)).size, 22);
  sessions.preparation_complete = true;
  savePrivate(target, sessions);
  return sessions;
}
export async function operatorClient(home = DEFAULT_HOME, username = 'p23-owner') {
  assert(['p23-owner', 'p23-approver'].includes(username), 'OWNED_TEST_OPERATOR_REQUIRED');
  const sessions = loadSessions(home);
  assert(sessions.preparation_complete, 'SESSION_PREPARATION_INCOMPLETE');
  const user = sessions.identities.find(user => user.username === username);
  const client = makeClient(user);
  const identity = (await client.call('GET', '/api/auth/context')).body;
  assert(identity.state === 'AUTHENTICATED' && identity.principal.principalId === user.id, 'OWNER_SESSION_EXPIRED');
  return client;
}
/** Renew ONLY owned test sessions using their existing private password.
 * No activation reset, password change, DB expiry edit or production identity.
 */
export async function refreshTestSessions(home = DEFAULT_HOME) {
  home=validateHome(home);
  const sessions=loadSessions(home);
  assert(sessions.preparation_complete && sessions.identities.length===22,'OWNED_SESSIONS_REQUIRED');
  for(const user of sessions.identities) {
    assert(TEST_USERS.some(entry=>entry.username===user.username),'FOREIGN_TEST_IDENTITY');
    const client=makeClient(user);
    const context=(await client.call('GET','/api/auth/context')).body;
    if(context.state==='AUTHENTICATED') {
      assert.equal(context.principal.principalId,user.id); continue;
    }
    assert.equal(context.state,'APP_LOGIN_REQUIRED','DO_NOT_BYPASS_OTHER_AUTH_REFUSAL');
    const login=await client.call('POST','/api/auth/login',{username:user.username,credential:user.password},[201]);
    const actual=(await client.call('GET','/api/auth/context')).body;
    assert(actual.state==='AUTHENTICATED' && actual.principal.principalId===user.id,'SAME_REAL_TEST_PRINCIPAL_REQUIRED');
    user.absolute_expires_at=login.body.absolute_expires_at;
    user.refreshed_at_utc=new Date().toISOString();
    savePrivate(join(home,'sessions.json'),sessions);
  }
  console.log('P23 owned sessions checked/refreshed through real password login; no credential reset.');
  return sessions;
}
export const ownerClient = home => operatorClient(home);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (process.argv.includes('--refresh') ? refreshTestSessions : prepareSessions)(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME)
    .catch(error => { console.error('P23 session setup refused:', error.message); process.exitCode = 1; });
}
