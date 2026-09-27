import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASE_URL, PROJECT, TEST_USERS, composeArguments, validateHome } from './cell.mjs';

test('qualification cell has its own fixed project, loopback and 20 distinct readers', () => {
  assert.equal(PROJECT, 'portal-research-p23-ol12');
  assert.equal(BASE_URL, 'http://127.0.0.1:8096');
  assert.equal(TEST_USERS.filter(user => user.role === 'USER').length, 20);
  assert.equal(new Set(TEST_USERS.map(user => user.username)).size, 22);
  assert(TEST_USERS.every(user => user.username.startsWith('p23-')));
  assert.equal(TEST_USERS.filter(user => user.owner).length, 1);
});
test('configuration refuses a shared directory and cannot concatenate duplicate sandbox policies', () => {
  assert.throws(() => validateHome('/home/bobby'), /PRIVATE_STATE/);
  assert.throws(() => validateHome('/home/bobby/.config/portal-research-preview'), /PRIVATE_STATE/);
  assert.throws(() => validateHome('/tmp/test'), /PRIVATE_STATE/);
  const home = '/home/bobby/.local/state/portal-research-p23/20260927/runtime';
  assert.equal(validateHome(home), home);
  const args = composeArguments(home + '/preview.env');
  assert.equal(args[2], PROJECT);
  assert.equal(args.filter(arg => arg.endsWith('compose.research-progress.yaml')).length, 1);
  assert(!args.some(arg => arg.endsWith('compose.research-preview.yaml')));
  assert(args.at(-1).endsWith('compose.research-p23-5gb.yaml'));
});
test('isolated activation uses private credentials, disables auto-login and adds no Execution authority or ports', () => {
  const source = readFileSync(new URL('../../deploy/research-preview/compose.research-p23-activation.yaml', import.meta.url), 'utf8');
  assert.match(source, /P23_DATABASE_PASSWORD:\?P23/);
  assert.match(source, /PREVIEW_AUTO_LOGIN_USERNAME: ""/);
  assert.match(source, /FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY: "true"/);
  assert(!source.includes('FEATURE_EXECUTION_'));
  assert(!source.includes('ports:'));
  assert(!source.includes('external:'));
});
