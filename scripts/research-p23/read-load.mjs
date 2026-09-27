#!/usr/bin/env node
/** Read-only, authorized W06 sampler. The private manifest must stay outside Git. */
import { lstatSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

export function validateManifest(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.users) || input.users.length !== 20) {
    throw new Error('EXACTLY_20_AUTHORIZED_USERS_REQUIRED');
  }
  if (new Set(input.users.map(user => user.id)).size !== 20 || input.users.some(user =>
    typeof user.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(user.id)
    || typeof user.cookie !== 'string' || user.cookie.length < 8)) {
    throw new Error('DISTINCT_USER_IDENTITIES_AND_SESSIONS_REQUIRED');
  }
  if (new Set(input.users.map(user => user.cookie)).size !== 20) throw new Error('SESSION_REUSE_IS_NOT_20_USERS');
  if (input.users.some(user => user.access_email !== undefined
    && !/^p23-reader-(?:0[1-9]|1[0-9]|20)@azdag\.com$/.test(user.access_email))) {
    throw new Error('OWNED_TEST_ACCESS_IDENTITY_REQUIRED');
  }
  const url = new URL(input.base_url);
  if (input.temperature !== undefined && !['warm','cold'].includes(input.temperature)) throw new Error('NAMED_READ_TEMPERATURE_REQUIRED');
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '8096'
    || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('ISOLATED_P23_URL_REQUIRED');
  }
  if (!Array.isArray(input.paths) || input.paths.length < 1 || input.paths.length > 12 || input.paths.some(path => {
    if (typeof path !== 'string' || !/^\/api\/v1\/[a-z0-9/?=&_%.-]+$/i.test(path)) return true;
    const resolved = new URL(path, url);
    const namedQuantbtRead = /^\/api\/v1\/quantbt\/runs(?:\/[A-Za-z0-9_.-]{1,128}\/(?:sparkline|report|execute\/replay|evidence(?:\/series)?|split|search|freeze|current-source\/(?:evidence(?:\/series)?|split|search|freeze|replay)))?$/.test(resolved.pathname);
    return !(resolved.pathname.startsWith('/api/v1/research/') || namedQuantbtRead) || resolved.hash !== ''
      || /(?:publish|create|verify|evaluate|export|cancel|activate)/i.test(resolved.pathname);
  })) {
    throw new Error('NAMED_READ_PATHS_ONLY');
  }
  return input;
}

export function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

/** Guide §16.3, verified again at aggregation; HTTP 200 is not an SLO PASS. */
export function evaluateReadSlo(receipt) {
  const temperature = receipt.temperature ?? 'warm';
  if (!['warm','cold'].includes(temperature)) return { passed:false,reason:'INVALID_TEMPERATURE' };
  const byPath = Object.fromEntries(Object.entries(receipt.by_path ?? {}).map(([path,row]) => {
    const pathname = new URL(path,'http://127.0.0.1:8096').pathname;
    const kind = pathname.endsWith('/execute/replay') ? 'REPLAY' : pathname.endsWith('/search') ? 'TRIAL' : 'SUMMARY';
    const target = temperature === 'cold' ? (kind === 'SUMMARY' ? 1500 : 2000)
      : kind === 'REPLAY' ? 1000 : kind === 'TRIAL' ? 750 : 500;
    return [path,{kind,target_p95_ms:target,observed_p95_ms:row.p95_ms,
      passed:Number.isSafeInteger(row.p95_ms) && row.p95_ms >= 0 && row.p95_ms <= target}];
  }));
  return { schema_version:'research.p23-read-slo.v1',temperature,by_path:byPath,
    passed:Object.keys(byPath).length>0 && Object.values(byPath).every(row=>row.passed) };
}

export function readPrivateManifest(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error('PRIVATE_MANIFEST_0600_REQUIRED');
  return validateManifest(JSON.parse(readFileSync(path, 'utf8')));
}

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
async function consumeBounded(response) {
  if (!response.body || !response.headers?.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('NAMED_READ_JSON_RESPONSE_REQUIRED');
  }
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await response.body.cancel().catch(() => undefined);
      throw new Error('NAMED_READ_EXCEEDED_2MIB');
    }
  }
  return bytes;
}

export async function runReadLoad(input, fetchFn = fetch) {
  const manifest = validateManifest(input);
  const startedAt = new Date().toISOString();
  const origin = new URL(manifest.base_url).origin;
  const samples = [];
  await Promise.all(manifest.users.map(async user => {
    const headers = { cookie: user.cookie, accept: 'application/json',
      ...(user.access_email ? { 'x-dev-access-email': user.access_email } : {}) };
    const identity = await fetchFn(new URL('/api/auth/context', origin), {
      method: 'GET', redirect: 'manual', headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (identity.status !== 200) throw new Error('IDENTITY_CHECK_REFUSED');
    const context = await identity.json();
    if (context?.state !== 'AUTHENTICATED' || context?.principal?.principalId !== user.id) {
      throw new Error('IDENTITY_MISMATCH_OR_PREVIEW_AUTO_LOGIN');
    }
    for (const path of manifest.paths) {
      const url = new URL(path, origin);
      const start = performance.now();
      const response = await fetchFn(url, {
        method: 'GET', redirect: 'manual', headers,
        signal: AbortSignal.timeout(10_000),
      });
      // Measure the complete bounded JSON response, but never retain or print business rows.
      const bytes = await consumeBounded(response);
      samples.push({ path, status: response.status, bytes, duration_ms: Math.round(performance.now() - start) });
    }
  }));
  const byPath = Object.fromEntries(manifest.paths.map(path => {
    const data = samples.filter(sample => sample.path === path);
    const durations = data.map(sample => sample.duration_ms).sort((a, b) => a - b);
    return [path, { requests: data.length, p50_ms: percentile(durations, .5), p95_ms: percentile(durations, .95),
      max_response_bytes: Math.max(...data.map(sample => sample.bytes)),
      statuses: Object.fromEntries([...new Set(data.map(sample => sample.status))].map(status =>
        [status, data.filter(sample => sample.status === status).length])) }];
  }));
  const receipt = { schema_version: 'research.p23-read-load.v1', sampled_at_utc: new Date().toISOString(),
    base_url:manifest.base_url, started_at_utc:startedAt, completed_at_utc:new Date().toISOString(),
    temperature:manifest.temperature ?? 'warm',distinct_users:20,by_path:byPath,
    http_passed:samples.every(sample => sample.status === 200) };
  const slo=evaluateReadSlo(receipt);
  return {...receipt,slo,passed:receipt.http_passed && slo.passed};
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    const result = await runReadLoad(readPrivateManifest(process.argv[2]));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`P23 read load refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}
