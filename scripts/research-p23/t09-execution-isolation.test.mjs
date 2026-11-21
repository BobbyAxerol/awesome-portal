import test from 'node:test';
import assert from 'node:assert/strict';
import { assessExecutionIsolation, readerManifestMatchesSessions, stableExecutionShape } from './t09-execution-isolation.mjs';

test('T09 hashes a published Execution read without volatile observation time', () => {
  const original = { schema_version: 'x', read_at: 'A', read_at_ms: 10,
    capabilities: [{ enabled: false }] };
  assert.deepEqual(stableExecutionShape(original), {
    schema_version: 'x', capabilities: [{ enabled: false }],
  });
  assert.equal(original.read_at, 'A');
});

test('T09 requires one active plus four queued and unchanged authority/health', () => {
  const baseline = { execution: [{ status: 200, body_sha256: 'a' }],
    outside: [{ id: 'stable', restart_count: 0, health: 'healthy' }],
    health: [{ status: 200, body_sha256: 'h' }], queue: { active: 0, queued: 0 } };
  const during = { ...baseline, queue: { active: 1, queued: 4 } };
  const after = { ...baseline, queue: { active: 0, queued: 0 } };
  assert.equal(assessExecutionIsolation(baseline, during, after).passed, true);
  assert.equal(assessExecutionIsolation(baseline,
    { ...during, execution: [{ status: 403, body_sha256: 'a' }] }, after).passed, false);
  assert.equal(assessExecutionIsolation(baseline,
    { ...during, queue: { active: 1, queued: 3 } }, after).passed, false);
});

test('T09 refuses stale reader cookies before admitting a heavy workload', () => {
  const identities = Array.from({length:20},(_,index)=>({
    id:'reader-'+index, username:'p23-reader-'+String(index+1).padStart(2,'0'),
    cookies:{session:'token-'+index},
  }));
  const manifest={users:identities.map(user=>({
    id:user.id, access_email:user.username+'@azdag.com',
    cookie:'session='+user.cookies.session,
  }))};
  assert.equal(readerManifestMatchesSessions(manifest,{identities}),true);
  assert.equal(readerManifestMatchesSessions({...manifest,users:[...manifest.users.slice(0,19),
    {...manifest.users[19],cookie:'session=expired'}]},{identities}),false);
});
