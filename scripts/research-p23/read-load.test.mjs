import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readPrivateManifest, runReadLoad, validateManifest } from './read-load.mjs';

const input = {
  base_url: 'http://127.0.0.1:8096',
  users: Array.from({ length: 20 }, (_, n) => ({ id: `user_${n}`, cookie: `portal_session=private-${n}` })),
  paths: ['/api/v1/research/runs?limit=1'],
};

test('20 distinct sessions, loopback and GET-only named Research paths are mandatory', () => {
  assert.doesNotThrow(() => validateManifest(input));
  assert.throws(() => validateManifest({ ...input, users: input.users.slice(1) }), /EXACTLY_20/);
  assert.throws(() => validateManifest({ ...input, users: input.users.map(user => ({ ...user, cookie: 'same cookie' })) }), /SESSION_REUSE/);
  assert.throws(() => validateManifest({ ...input, base_url: 'https://portal.primusspark.com' }), /ISOLATED_P23/);
  assert.throws(() => validateManifest({ ...input, base_url: 'http://127.0.0.1:8095' }), /ISOLATED_P23/);
  assert.throws(() => validateManifest({ ...input, paths: ['/api/v1/research/release-candidates/rc_x/publish'] }), /NAMED_READ/);
  assert.throws(() => validateManifest({ ...input, paths: ['/api/v1/execution/commands'] }), /NAMED_READ/);
});

test('private session manifest must be a regular 0600 file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'portal-p23-manifest-'));
  const path = join(dir, 'sessions.json');
  try {
    writeFileSync(path, JSON.stringify(input), { mode: 0o600 });
    assert.equal(readPrivateManifest(path).users.length, 20);
    chmodSync(path, 0o644);
    assert.throws(() => readPrivateManifest(path), /PRIVATE_MANIFEST_0600/);
  } finally {
    unlinkSync(path);
    rmdirSync(dir);
  }
});

test('read load records only status and latency, refusing auth failures', async () => {
  const calls = [];
  const result = await runReadLoad(input, async (url, init) => {
    calls.push({ url: String(url), method: init.method });
    if (String(url).endsWith('/api/auth/context')) return {
      status: 200, json: async () => ({ state: 'AUTHENTICATED', principal: {
        principalId: `user_${init.headers.cookie.split('-').at(-1)}`,
      } }),
    };
    return { status: 200, body: { cancel: async () => undefined } };
  });
  assert.equal(calls.length, 40);
  assert.ok(calls.every(call => call.method === 'GET'));
  assert.equal(result.passed, true);
  assert.equal(result.by_path[input.paths[0]].requests, 20);
  assert.equal(JSON.stringify(result).includes('private-'), false);
  const failed = await runReadLoad(input, async (url, init) => String(url).endsWith('/api/auth/context')
    ? { status: 200, json: async () => ({ state: 'AUTHENTICATED', principal: { principalId: `user_${init.headers.cookie.split('-').at(-1)}` } }) }
    : { status: 401, body: null });
  assert.equal(failed.passed, false);
  await assert.rejects(runReadLoad(input, async () => ({ status: 200, json: async () => ({
    state: 'AUTHENTICATED', principal: { principalId: 'bobby' },
  }) })), /IDENTITY_MISMATCH/);
});
