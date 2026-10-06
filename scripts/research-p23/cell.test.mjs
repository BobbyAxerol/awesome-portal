import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BASE_URL, PROJECT, TEST_USERS, composeArguments, executionPreviewBuildArg, validateHome, retainedImageTag, imageReplacements, stampedComposePrefix } from './cell.mjs';

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
test('sudo-safe test-only Execution UI build arg is explicit and bounded', () => {
  assert.equal(executionPreviewBuildArg(undefined), 'EXECUTION_PREVIEW_ENABLED=false');
  assert.equal(executionPreviewBuildArg('false'), 'EXECUTION_PREVIEW_ENABLED=false');
  assert.equal(executionPreviewBuildArg('true'), 'EXECUTION_PREVIEW_ENABLED=true');
  assert.throws(() => executionPreviewBuildArg('1'), /P23_EXECUTION_PREVIEW_BUILD_ARG_INVALID/);
  assert.throws(() => executionPreviewBuildArg('true --build-arg FEATURE_EXECUTION_COMMAND_RELAY=true'),
    /P23_EXECUTION_PREVIEW_BUILD_ARG_INVALID/);
});
test('FULL02 candidate uses separate named custody, never an older P23 data volume', () => {
  const args = composeArguments('/home/bobby/.local/state/portal-research-p23/20261006/full02/preview.env', 'full02');
  assert(args.at(-1).endsWith('compose.research-full02-cell.yaml'));
  assert.throws(() => composeArguments('/tmp/preview.env', 'other'), /UNKNOWN_QUALIFICATION_SLICE/);
  const yaml = readFileSync(new URL('../../deploy/research-preview/compose.research-full02-cell.yaml', import.meta.url), 'utf8');
  for (const name of ['artifacts', 'postgres', 'nats', 'roadmap']) assert(yaml.includes(`name: portal-research-full02-20261006-${name}`));
  assert(!yaml.includes('external:'));
});
test('sudo forwards only validated non-secret source stamps to the owned Compose invocation', () => {
  const sha = 'a'.repeat(40);
  assert.deepEqual(stampedComposePrefix(['docker'], sha, false), ['docker']);
  assert.deepEqual(stampedComposePrefix(['sudo', '-n', 'docker'], sha, false),
    ['sudo', '-n', 'env', `PORTAL_BUILD_COMMIT=${sha}`, 'PORTAL_BUILD_DIRTY=false', 'docker']);
  assert.throws(() => stampedComposePrefix(['sudo', '-E', 'docker'], sha, false));
  assert.throws(() => stampedComposePrefix(['sudo', '-n', 'docker'], 'main SECRET=x', false));
  assert.throws(() => stampedComposePrefix(['docker'], sha, 'false'));
});
test('isolated activation uses private credentials, disables auto-login and adds no Execution authority or ports', () => {
  const source = readFileSync(new URL('../../deploy/research-preview/compose.research-p23-activation.yaml', import.meta.url), 'utf8');
  assert.match(source, /P23_DATABASE_PASSWORD:\?P23/);
  assert.match(source, /PREVIEW_AUTO_LOGIN_USERNAME: ""/);
  assert.match(source, /FEATURE_RESEARCH_ARTIFACT_BYTE_VERIFY: "true"/);
  assert.match(source, /FEATURE_RESEARCH_WHATIF: "true"/);
  assert.match(source, /quant-worker-py:[\s\S]*PORTAL_FEATURE_RESEARCH_WHATIF: "true"/);
  assert.match(source, /quant-worker-py:[\s\S]*RESEARCH_IS_QUALIFICATION_CAPTURE: \$\{RESEARCH_IS_QUALIFICATION_CAPTURE:-false\}/);
  assert(!source.includes('FEATURE_EXECUTION_'));
  assert(!source.includes('ports:'));
  assert(!source.includes('external:'));
});
test('API replacement refreshes only the owned static-DNS gateway', () => {
  const source = readFileSync(new URL('./cell.mjs', import.meta.url), 'utf8');
  assert(source.includes('previousControl && previousControl !== currentControl'));
  assert(source.includes("'--no-deps', '--force-recreate', '--wait', '--wait-timeout', '90', 'portal-web'"));
  assert(!source.includes("'--force-recreate', 'portal-postgres'"));
});
test('active immutable image indexes are retained before export and exact drift is targeted',()=>{
  const a='sha256:'+'a'.repeat(64),b='sha256:'+'b'.repeat(64);
  assert.equal(retainedImageTag('portal-api',a),'local/portal-research-p23-retained-portal-api:'+'a'.repeat(64));
  assert.throws(()=>retainedImageTag('stable',a));
  assert.throws(()=>retainedImageTag('portal-api','latest'));
  assert.deepEqual(imageReplacements([{service:'portal-api',actual:a,desired:b},
    {service:'portal-postgres',actual:a,desired:a}]),['portal-api']);
  assert.throws(()=>imageReplacements([{service:'stable',actual:a,desired:b}]));
  const source=readFileSync(new URL('./cell.mjs',import.meta.url),'utf8');
  assert(source.indexOf("docker(['image','tag'")<source.indexOf("compose(['build'"));
  assert(!source.includes("['image','rm'"));
});
