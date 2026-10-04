#!/usr/bin/env node
/** Finite follow-up scenario inputs. Secrets stay in private 0600 custody. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { privateJson, savePrivate } from './api-client.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const home = validateHome(process.argv[2]);
const audit = process.argv.includes('--audit');
const retake = process.argv.includes('--retake');
const retry = process.argv.includes('--audit-retry');
const verify = process.argv.includes('--audit-verify');
const finalRead = process.argv.includes('--final-read');
const absence = process.argv.includes('--absence-retake');
assert([audit, retake, retry, verify, finalRead, absence].filter(Boolean).length <= 1 && process.argv.slice(3).every(value =>
  ['--audit', '--retake', '--audit-retry', '--audit-verify', '--final-read', '--absence-retake'].includes(value)), 'FINITE_CONFIG_MODE_ONLY');
const suffix = audit ? 'audit-scenarios' : retry ? 'audit-retry' : verify ? 'audit-verify' : absence ? 'remaining-absence' : finalRead ? 'remaining-final-read' : retake ? 'remaining-scenarios-retake' : 'remaining-scenarios';
const output = join(home, `${suffix}-config.json`);
assert(!existsSync(output), 'NEVER_OVERWRITE_PRIVATE_SCENARIO_INPUTS');
const consumer = privateJson(join(home, 'p24-write-consumer-config.json'));
const producer = privateJson(join(home, 'p24-write-producer-config.json'));
for (const input of [consumer, producer]) {
  assert.equal(input.project, PROJECT); assert.equal(input.base_url, BASE_URL);
  assert.equal(input.prepared, true, 'FRESH_NORMAL_QA_MUST_BE_PREPARED');
}
const actors = { ...consumer.actors, producer: producer.user };
for (const [key, username] of Object.entries({ a: 'p24-round2-a', b: 'p24-round2-b', producer: 'p24-round2-producer' }))
  assert.equal(actors[key].username, username, 'EXACT_ROUND2_ACTOR_ONLY');
const workspace = 'ws_06GCVTHWC9WVPGEPR85AB15K82';
const deniedWorkspace = 'ws_06GCX7BHTH3CJDJZ9AGJM9WJ56';
assert.equal(dbQuery('SELECT count(*)::int n FROM public.workspaces WHERE workspace_id=$1', [deniedWorkspace]).rows[0].n, 1);
for (const actor of Object.values(actors)) {
  assert.equal(dbQuery('SELECT count(*)::int n FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [deniedWorkspace, actor.id]).rows[0].n, 0);
  assert.equal(dbQuery("SELECT count(*)::int n FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND role='MEMBER'", [workspace, actor.id]).rows[0].n, 1);
}
const runs = { global: 'rrun_a76afa62adb6c427ba2f4cec44bb43bd',
  causal: 'rrun_686af4b1d64472591b6a64a1db1233a3',
  fixed: 'rrun_9ec42333b812f7e41e389a36e06328df',
  budget: 'rrun_3258a4c450816129d2d285f25b801061' };
assert.equal(dbQuery('SELECT count(*)::int n FROM research.run_producers WHERE workspace_id=$1 AND run_id=ANY($2::text[])', [workspace, Object.values(runs)]).rows[0].n, 4);
const images = {};
for (const service of ['control-api', 'portal-api', 'portal-web', 'quant-worker-py']) {
  const name = service === 'portal-web' ? `${PROJECT}-portal-web-1` : container(service);
  assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "com.docker.compose.project"}}', name]).trim(), PROJECT);
  images[service] = docker(['inspect', '--format', '{{.Image}}', name]).trim();
  assert.match(images[service], /^sha256:[a-f0-9]{64}$/);
}
assert.equal(docker(['inspect', '--format', '{{.State.Running}}', container('quant-worker-py')]).trim(), retry ? 'true' : 'false', 'EXACT_FINITE_WORKER_PHASE');
savePrivate(output, { project: PROJECT, base_url: BASE_URL, origin: BASE_URL,
  mode: audit ? 'AUDIT_ALLOCATE' : retry ? 'AUDIT_RETRY' : verify ? 'AUDIT_VERIFY' : 'READ_AND_TECHNICAL',
  ...((audit || retry || verify) ? { audit_parent: runs.global } : {}),
  ...(retry ? { previous_failed_child: 'rrun_529acb9966b568e3c93f125340f26b9a',
    expected_audit_target: '3a5ae58b456d1495f940127dea8ea34a471ec152773daa44fa7cf4bd6e2aa681' } : {}),
  ...(finalRead ? { selected_cells: ['SC08-none-four-screen', 'SC09-centroid-four-screen',
    'SC05-sampler-configuration-observations-not-internal-trace'] } : {}),
  ...(absence ? { selected_cells: ['SC08-none-four-screen', 'SC09-centroid-four-screen'] } : {}),
  ...(retake ? { selected_cells: ['SC08-none-four-screen', 'SC09-centroid-four-screen',
    'SC14-report-no_downside_observations', 'SC14-report-zero_variance_returns',
    'SC14-report-benchmark_not_published', 'SC12-two-actor-read-scan-exposure-isolation',
    'SC21-new-route-unmapped-informational-no-enable', 'SC04-single-canonical-main-native-fields',
    'SC03-outside-declaration-pin-refused-no-old-run-change'] } : {}),
  out: join(home, audit ? 'audit-allocate-r01' : retry ? 'audit-retry-r02' : verify ? 'audit-verify-r02' : absence ? 'remaining-absence-r04' : finalRead ? 'remaining-final-read-r03' : retake ? 'remaining-read-r02' : 'remaining-read-r01'), actors,
  workspace_id: workspace, alternate_workspace_id: deniedWorkspace, runs, expected_images: images });
console.log(JSON.stringify({ config: output, sha256: createHash('sha256').update(readFileSync(output)).digest('hex'),
  expected_images: images, runs, workspace_id: workspace, denied_workspace_id: deniedWorkspace }));
