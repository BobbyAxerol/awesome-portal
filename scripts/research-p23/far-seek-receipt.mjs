#!/usr/bin/env node
/** P23-T11: real, GET-only far-seek while twenty owned principals inspect the same sealed run. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_HOME, operatorClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { runReadLoad, validateManifest } from './read-load.mjs';
import { dbQuery, docker } from './runtime-tools.mjs';

const digest = value => createHash('sha256').update(String(value)).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function namedReadPaths({ workspaceId, libraryCursor, wfoRunId, p04RunId,
  replayCursor, replayBefore, playbackCursor }) {
  const workspace = encodeURIComponent(workspaceId);
  const wfo = `/api/v1/quantbt/runs/${wfoRunId}`;
  const replay = `${wfo}/current-source/replay?workspace_id=${workspace}&limit=100`;
  return [
    ['library_deep', `/api/v1/quantbt/runs?workspace_id=${workspace}&limit=1&cursor=${encodeURIComponent(libraryCursor)}`],
    ['p04_sparkline', `/api/v1/quantbt/runs/${p04RunId}/sparkline?workspace_id=${workspace}`],
    ['wfo_report', `${wfo}/report?workspace_id=${workspace}`],
    ['wfo_search', `${wfo}/current-source/search?workspace_id=${workspace}&limit=20`],
    ['replay_deep_page', `${replay}&cursor=${encodeURIComponent(replayCursor)}`],
    ['replay_previous_page', `${replay}&before=${encodeURIComponent(replayBefore)}`],
    ['replay_far_playhead', `${replay}&at=${encodeURIComponent(playbackCursor)}`],
  ];
}

/** Traverse only signed keysets the named API actually returned. */
export async function deepPage(client, basePath, select, reached, maxPages = 30) {
  let cursor = null;
  const seen = new Set();
  let first = null;
  for (let index = 0; index < maxPages; index++) {
    const body = (await client.call('GET', basePath + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''))).body;
    const { page, rows, sourceCount } = select(body);
    assert(page && Array.isArray(rows) && rows.length > 0, 'REAL_NONEMPTY_PAGE_REQUIRED');
    first ??= rows[0];
    if (reached({ index, page, rows, sourceCount })) {
      assert(cursor, 'DEEP_PAGE_MUST_USE_A_REAL_CURSOR');
      return { first, rows, page, sourceCount, cursor, depth: index + 1 };
    }
    assert(page.has_more && typeof page.next_cursor === 'string', 'REAL_DEEP_PAGE_NOT_REACHED');
    assert(!seen.has(page.next_cursor), 'CURSOR_CYCLE_REFUSED');
    seen.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  throw new Error('BOUNDED_DEEP_PAGE_NOT_REACHED');
}

function pinnedImages(identity) {
  assert.equal(identity.project, PROJECT);
  assert.equal(identity.base_url, BASE_URL);
  assert.equal(identity.dirty, false, 'CLEAN_APPLICATION_IDENTITY_REQUIRED');
  const imageIds = {};
  for (const [service, pinned] of Object.entries(identity.images)) {
    const name = `${PROJECT}-${service}-1`;
    const meta = JSON.parse(docker(['inspect', '--format', '{{json .}}', name]));
    assert.equal(meta.Config.Labels['com.docker.compose.project'], PROJECT, 'FOREIGN_CONTAINER_REFUSED');
    assert.equal(meta.State.Running, true, `SERVICE_NOT_RUNNING:${service}`);
    assert.equal(meta.Image, pinned.image_id, `IMAGE_PIN_DRIFT:${service}`);
    imageIds[service] = meta.Image;
  }
  assert.equal(Object.keys(imageIds).length, 7, 'SEVEN_PINNED_SERVICES_REQUIRED');
  return digest(JSON.stringify(imageIds));
}

function jobCounts(workspaceId) {
  const total = dbQuery('SELECT count(*)::int AS count FROM research.jobs WHERE workspace_id=$1', [workspaceId]).rows[0].count;
  const active = dbQuery("SELECT count(*)::int AS count FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')").rows[0].count;
  return { total, active };
}

function resourceSampler() {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./resource-snapshot.mjs', import.meta.url)),
    PROJECT, '--require-limits', '--samples=24', '--interval-ms=1000'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.length > 16 * 1024 * 1024) child.kill('SIGTERM');
  });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-1500); });
  const result = new Promise((resolveSample, rejectSample) => {
    child.on('error', rejectSample);
    child.on('close', code => code === 0 ? resolveSample(JSON.parse(stdout))
      : rejectSample(new Error(`CAPPED_RESOURCE_SAMPLE_FAILED:${stderr.slice(0, 200)}`)));
  });
  void result.catch(() => undefined);
  return { child, result };
}

export function assessFarSeek({ read, resources, before, after, imagePinBefore, imagePinAfter }) {
  const overlapped = resources.samples?.some(sample => sample.sampled_at_utc >= read.started_at_utc
    && sample.sampled_at_utc <= read.completed_at_utc) ?? false;
  return { passed: read.passed && resources.passed && resources.sample_count >= 2 && overlapped
      && before.total === after.total && before.active === 0 && after.active === 0
      && imagePinBefore === imagePinAfter,
    resource_overlapped_reads: overlapped, no_implicit_jobs: before.total === after.total,
    no_active_compute: before.active === 0 && after.active === 0,
    image_pin_unchanged: imagePinBefore === imagePinAfter };
}

async function main() {
  const home = validateHome(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME);
  const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) ?? 't11-farseek';
  const wfoRunId = process.argv.find(arg => arg.startsWith('--wfo-run='))?.slice(10);
  const p04RunId = process.argv.find(arg => arg.startsWith('--p04-run='))?.slice(10);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label), 'BOUNDED_LABEL_REQUIRED');
  assert(/^rrun_[a-z0-9]{16,64}$/.test(wfoRunId ?? '') && /^rrun_[a-z0-9]{16,64}$/.test(p04RunId ?? ''),
    'EXACT_OWNED_RUN_IDS_REQUIRED');
  const target = join(home, `${label}.json`);
  assert(!existsSync(target), 'PRIOR_T11_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
  const identity = privateJson(join(home, 'identity.json'));
  const imagePinBefore = pinnedImages(identity);
  const client = await operatorClient(home);
  const workspaceId = privateJson(join(home, 'reader-authorization.json')).workspace_id;
  assert(/^ws_[a-zA-Z0-9]+$/.test(workspaceId), 'OWNED_WORKSPACE_REQUIRED');
  const manifest = privateJson(join(home, 'read-manifest.json'));
  const receipt = { schema_version: 'research.p23-t11-far-seek.v1', project: PROJECT,
    candidate_source_sha: identity.candidate_source_sha, image_pin_sha256: imagePinBefore,
    wfo_run_id: wfoRunId, p04_run_id: p04RunId, started_at_utc: new Date().toISOString(), passed: false };
  savePrivate(target, receipt);
  let sampler;
  try {
    const workspace = encodeURIComponent(workspaceId);
    const library = await deepPage(client, `/api/v1/quantbt/runs?workspace_id=${workspace}&limit=1`,
      body => ({ page: body.page, rows: body.items }), ({ index }) => index >= 12);
    assert.notEqual(library.first.run_id, library.rows[0].run_id, 'LIBRARY_DEEP_CURSOR_DID_NOT_ADVANCE');
    const replayBase = `/api/v1/quantbt/runs/${wfoRunId}/current-source/replay?workspace_id=${workspace}&limit=100`;
    const replay = await deepPage(client, replayBase,
      body => ({ page: body.replay?.page, rows: body.replay?.rows,
        sourceCount: body.replay?.source_observation_count }),
      ({ rows, sourceCount }) => Number.isSafeInteger(sourceCount) && sourceCount > 400
        && rows.at(-1).source_ordinal >= Math.floor(sourceCount * .75));
    assert(replay.page.prev_cursor && replay.rows[0].source_ordinal > replay.first.source_ordinal,
      'REPLAY_DEEP_CURSOR_DID_NOT_ADVANCE');
    const playhead = replay.rows[Math.floor(replay.rows.length / 2)];
    const at = (await client.call('GET', `${replayBase}&at=${encodeURIComponent(playhead.playback_cursor)}`)).body;
    assert.equal(at.replay?.state_at_cursor?.source_ordinal, playhead.source_ordinal,
      'FAR_PLAYHEAD_STATE_MISMATCH');
    const previous = (await client.call('GET', `${replayBase}&before=${encodeURIComponent(replay.page.prev_cursor)}`)).body;
    assert(previous.replay?.rows?.length > 0 && previous.replay.rows.at(-1).source_ordinal < replay.rows[0].source_ordinal,
      'PREVIOUS_PAGE_NOT_BEFORE_DEEP_PAGE');
    const paths = namedReadPaths({ workspaceId, libraryCursor: library.cursor, wfoRunId, p04RunId,
      replayCursor: replay.cursor, replayBefore: replay.page.prev_cursor,
      playbackCursor: playhead.playback_cursor });
    const readInput = validateManifest({ ...manifest, temperature: 'warm', paths: paths.map(([, path]) => path) });
    const before = jobCounts(workspaceId);
    assert.equal(before.active, 0, 'ACTIVE_COMPUTE_PRECLUDES_READ_ONLY_T11');
    sampler = resourceSampler();
    await pause(1500);
    const read = await runReadLoad(readInput);
    const after = jobCounts(workspaceId);
    const resources = await sampler.result;
    const imagePinAfter = pinnedImages(identity);
    const assessment = assessFarSeek({ read, resources, before, after, imagePinBefore, imagePinAfter });
    Object.assign(receipt, { completed_at_utc: new Date().toISOString(),
      library_depth_pages: library.depth, library_cursor_sha256: digest(library.cursor),
      replay_depth_pages: replay.depth, replay_source_observations: replay.sourceCount,
      replay_deep_ordinal: replay.rows[0].source_ordinal, far_playhead_ordinal: playhead.source_ordinal,
      replay_cursor_sha256: digest(replay.cursor), playback_cursor_sha256: digest(playhead.playback_cursor),
      previous_page_verified: true, far_playhead_state_verified: true,
      principals: read.distinct_users, before_jobs: before, after_jobs: after,
      resource_sample_count: resources.sample_count, peak_current_bytes: resources.peak_current_bytes,
      read_results: Object.fromEntries(paths.map(([name, path]) => [name, {
        ...read.by_path[path], slo: read.slo.by_path[path],
      }])), ...assessment });
    savePrivate(target, receipt);
    console.log(JSON.stringify({ passed: receipt.passed, image_pin_sha256: receipt.image_pin_sha256,
      principals: receipt.principals, library_depth_pages: receipt.library_depth_pages,
      replay_depth_pages: receipt.replay_depth_pages, far_playhead_ordinal: receipt.far_playhead_ordinal,
      peak_current_bytes: receipt.peak_current_bytes,
      read_results: receipt.read_results }));
    if (!receipt.passed) process.exitCode = 1;
  } catch (error) {
    receipt.failed_at_utc = new Date().toISOString();
    receipt.failure = error.message.replace(/([?&](?:cursor|at|before)=)[^&]+/g, '$1[redacted]');
    savePrivate(target, receipt);
    throw error;
  } finally {
    if (sampler && sampler.child.exitCode === null) sampler.child.kill('SIGTERM');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('P23 far-seek refused:', error.message.replace(/([?&](?:cursor|at|before)=)[^&]+/g, '$1[redacted]'));
    process.exitCode = 1;
  });
}
