#!/usr/bin/env node
/**
 * OL-12 / P23 qualification orchestrator.
 *
 * It is deliberately conservative: without a real, hashed receipt from the
 * isolated P23 project every test is BLOCKED. It never runs fault injection,
 * never touches a shared project, and never treats a fixture as a qualification.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { evaluateContainers } from './resource-snapshot.mjs';
import { evaluateReadSlo } from './read-load.mjs';

export const P23_TESTS = Object.freeze([
  ['P23-T01', 'Mixed load20users trong aggregate5GB.'],
  ['P23-T02', 'Repeated jobs không tăng memory vô hạn sau warmup.'],
  ['P23-T03', 'Disk high-water/full có behavior bounded.'],
  ['P23-T04', 'Process/DB/NATS outages được recovery.'],
  ['P23-T05', 'IDOR/cache/files/exports tenant isolation.'],
  ['P23-T06', 'Corrupt part và restore có hash verification.'],
  ['P23-T07', 'Engine upgrade/default rollback/in-flight pinning đúng.'],
  ['P23-T08', 'Cold-cache measurement không ảnh hưởng shared execution host.'],
  ['P23-T09', 'Research load không thay execution behavior hoặc quyền.'],
  ['P23-T10', 'Toàn bộ required regression suites chạy và có raw results.'],
  ['P23-T11', '20users inspection/slider/far-seek đồng thời không tạo implicit heavy jobs; aggregate5GB vẫn đo đúng.'],
  ['P23-T12', 'Audit/what-if/verify/export cạnh primary đều qua quotas/backpressure; no API-process bypass.'],
  ['P23-T13', 'Upgrade new route/default không auto-enable unsupported mapper hoặc làm reproduce đổi semantics.'],
  ['P23-T14', 'Restore/GC giữ exposure, final-audit child target, selection/null-trial và publication source pins.'],
  ['P23-T15', 'Browser reveal/cursor/deep-link tests pass cùng cold-cache workload; no future-state or cross-run leakage.'],
]);

const BASE_LIMIT_BYTES = 5_000_000_000;
const SAFE_PROJECT = /^portal-research-p23(?:-[a-z0-9-]+)?$/;
const SAFE_URL = /^http:\/\/127\.0\.0\.1:8096\/$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function validateQualificationConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('P23_CONFIG_OBJECT_REQUIRED');
  if (typeof input.project !== 'string' || !SAFE_PROJECT.test(input.project)) throw new Error('P23_PROJECT_ISOLATION_REQUIRED');
  if (typeof input.base_url !== 'string' || !SAFE_URL.test(input.base_url)) throw new Error('P23_LOOPBACK_8096_REQUIRED');
  if (input.shared_preview === true || input.production === true || input.stable === true) throw new Error('P23_SHARED_OR_PRODUCTION_TARGET_REFUSED');
  if (input.evidence_dir !== undefined && !isAbsolute(input.evidence_dir)) throw new Error('P23_EVIDENCE_PATH_MUST_BE_ABSOLUTE');
  if (typeof input.candidate_source_sha !== 'string' || !/^[0-9a-f]{40}$/.test(input.candidate_source_sha)) {
    throw new Error('P23_CANDIDATE_SOURCE_SHA_REQUIRED');
  }
  return input;
}

function privateFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error(`P23_PRIVATE_EVIDENCE_0600_REQUIRED:${path}`);
  if (stat.size > 16 * 1024 * 1024) throw new Error('P23_EVIDENCE_SIZE_EXCEEDED');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function verifiedBytes(item) {
  try {
    const stat = lstatSync(item.locator);
    return stat.isFile() && (stat.mode & 0o077) === 0 && stat.size <= 16 * 1024 * 1024
      && createHash('sha256').update(readFileSync(item.locator)).digest('hex') === item.sha256;
  } catch { return false; }
}

function validReceipt(testId, receipt, locator, config) {
  if (!receipt || typeof receipt !== 'object' || receipt.test_id !== testId || receipt.status !== 'PASS') return null;
  if (receipt.project !== config.project || receipt.base_url !== config.base_url
    || receipt.candidate_source_sha !== config.candidate_source_sha) return null;
  if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0 || receipt.evidence.length > 16) return null;
  if (receipt.evidence.some(item => !item || typeof item !== 'object'
    || !['actual_command', 'receipt', 'browser', 'restore', 'fault'].includes(item.kind)
    || typeof item.locator !== 'string' || !isAbsolute(item.locator)
    || typeof item.command !== 'string' || item.command.includes('SECRET')
    || item.exit_code !== 0 || typeof item.sha256 !== 'string' || !HEX64.test(item.sha256)
    || !verifiedBytes(item))) return null;
  return { ...receipt, description: P23_TESTS.find(([id]) => id === testId)[1], source: locator };
}

export function readEvidence(evidenceDir, config) {
  if (typeof evidenceDir !== 'string' || !isAbsolute(evidenceDir)) return new Map();
  const out = new Map();
  for (const [testId] of P23_TESTS) {
    const path = resolve(evidenceDir, `${testId}.json`);
    try { out.set(testId, validReceipt(testId, privateFile(path), path, config)); } catch { /* absent/invalid stays blocked */ }
  }
  return out;
}

function blocked(testId, reason) {
  return { test_id: testId, status: 'BLOCKED', description: P23_TESTS.find(([id]) => id === testId)[1], reason };
}

function interval(start,end) {
  const first = typeof start === 'string' ? Date.parse(start) : NaN;
  const last = typeof end === 'string' ? Date.parse(end) : NaN;
  return Number.isFinite(first) && Number.isFinite(last) && last >= first ? [first,last] : null;
}

export function buildQualificationReceipt(config, evidence = new Map(), runtime = null) {
  validateQualificationConfig(config);
  // Revalidate at final aggregation too: a caller-created Map, or a changed
  // proof file between intake and output, must not bypass byte/scope checks.
  const tests = P23_TESTS.map(([testId]) => validReceipt(testId, evidence.get(testId), evidence.get(testId)?.source, config)
    ?? blocked(testId, 'REAL_ISOLATED_HASHED_CANDIDATE_EVIDENCE_REQUIRED'));
  const resource = runtime?.resource ?? null;
  let resourceValid = false;
  try {
    resourceValid = resource?.schema_version === 'research.p23-resource-series.v1'
      && resource.project === config.project && resource.passed === true
      && resource.sample_count === resource.samples.length && resource.samples.length >= 2
      && resource.samples.length <= 300
      && resource.peak_current_bytes === Math.max(...resource.samples.map(sample => sample.total_current_bytes))
      && resource.samples.every((sample,index) => {
        if (sample.project !== config.project || sample.base_limit_bytes !== BASE_LIMIT_BYTES) return false;
        const sampledAt = Date.parse(sample.sampled_at_utc);
        if (!Number.isFinite(sampledAt) || (index > 0 && sampledAt <= Date.parse(resource.samples[index-1].sampled_at_utc))) return false;
        const checked = evaluateContainers(sample.containers.map(row => ({ service:row.service,
          currentBytes:row.current_bytes,limitBytes:row.limit_bytes,swapLimitBytes:row.swap_limit_bytes,pids:row.pids_limit })),
        { requireLimits:true, requireComplete:true });
        return checked.within_base_limit && checked.total_current_bytes === sample.total_current_bytes;
      });
  } catch { /* malformed, incomplete or uncapped measurement is not proof */ }
  const readLoad = runtime?.read_load;
  const readPaths=Object.keys(readLoad?.by_path ?? {});
  const coverage=['LIBRARY','PROGRESS','REPORT','SEARCH','REPLAY'].every(kind=>readPaths.some(path=>{
    if(typeof path!=='string' || !/^\/api\/v1\/[a-z0-9/?=&_%.-]+$/i.test(path)) return false;
    const pathname=new URL(path,config.base_url).pathname;
    return kind==='LIBRARY' ? pathname==='/api/v1/quantbt/runs'
      : kind==='PROGRESS' ? /^\/api\/v1\/research\/runs\/rrun_[a-z0-9]+\/progress$/.test(pathname)
      : pathname.endsWith(kind==='REPLAY' ? '/execute/replay' : `/${kind.toLowerCase()}`);
  }));
  const readValid = readLoad?.schema_version === 'research.p23-read-load.v1'
    && readLoad.base_url === config.base_url && readLoad.passed === true && readLoad.distinct_users === 20
    && Object.keys(readLoad.by_path ?? {}).length > 0
    && Object.values(readLoad.by_path ?? {}).every(row => row.requests === 20 && row.statuses?.['200'] === 20)
    && coverage && evaluateReadSlo(readLoad).passed;
  const workload = runtime?.workload;
  const workloadValid = workload?.schema_version === 'research.p23-mixed-workload.v1'
    && workload.project === config.project && workload.candidate_source_sha === config.candidate_source_sha
    && workload.diagnostic_only !== true
    && workload.heavy_active_peak === 1 && Number.isSafeInteger(workload.distinct_heavy_intents_queued)
    && workload.distinct_heavy_intents_queued >= 4 && Number.isSafeInteger(workload.completed_heavy_runs)
    && workload.completed_heavy_runs >= 1;
  const viewerJobsValid=workload?.schema_version==='research.p23-mixed-workload.v1'
    && workload.project===config.project && workload.candidate_source_sha===config.candidate_source_sha
    && workload.diagnostic_only!==true && workload.no_implicit_viewer_jobs===true
    && Number.isSafeInteger(workload.viewer_job_count_before) && workload.viewer_job_count_before>=0
    && workload.viewer_job_count_before===workload.viewer_job_count_after;
  const linked = (test,role) => {
    try {
      const path = runtime?.[`${role}_locator`];
      return typeof path === 'string' && test.evidence?.some(item => item.locator === path && verifiedBytes(item))
        && JSON.stringify(privateFile(path)) === JSON.stringify(runtime[role]);
    } catch { return false; }
  };
  const measuredWindow = resourceValid ? interval(resource.samples[0].sampled_at_utc,resource.samples.at(-1).sampled_at_utc) : null;
  const readWindow = interval(readLoad?.started_at_utc,readLoad?.completed_at_utc);
  const workloadWindow = interval(workload?.started_at_utc,workload?.completed_at_utc);
  const overlaps = (...windows) => windows.every(window => window !== null)
    && Math.max(...windows.map(window => window[0])) < Math.min(...windows.map(window => window[1]));
  for (const id of ['P23-T01','P23-T11']) {
    const current = tests.find(test => test.test_id === id);
    const valid = resourceValid && readValid && overlaps(measuredWindow,readWindow)
      && linked(current,'resource') && linked(current,'read_load')
      && viewerJobsValid && linked(current,'workload');
    if (!valid || (id === 'P23-T01' && (!workloadValid || !linked(current,'workload') || !overlaps(measuredWindow,readWindow,workloadWindow)))) {
      current.status = 'BLOCKED';
      current.reason = 'P23_MEASURED_5GB_20_PRINCIPAL_MIXED_WORKLOAD_REQUIRED';
    }
  }
  return {
    schema_version: 'research.p23-qualification.v1',
    project: config.project, base_url: config.base_url,
    candidate_source_sha: config.candidate_source_sha,
    base_limit_bytes: BASE_LIMIT_BYTES,
    generated_at_utc: new Date().toISOString(),
    tests, runtime,
    passed: tests.every(test => test.status === 'PASS'),
    product_active: false,
  };
}

function runJson(command, args) {
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 }));
}

export function runQualification({ configPath, evidenceDir, resourceProject, readManifest, outputPath,
  resourceReceipt, readReceipt, workloadReceipt }) {
  const config = validateQualificationConfig(privateFile(configPath));
  // Validate both selectors before any read/measurement command is launched.
  if (resourceProject && resourceProject !== config.project) throw new Error('P23_RESOURCE_PROJECT_MISMATCH');
  if (readManifest && privateFile(readManifest).base_url !== config.base_url) throw new Error('P23_READ_MANIFEST_URL_MISMATCH');
  const evidence = readEvidence(evidenceDir ?? config.evidence_dir, config);
  let runtime = null;
  if (resourceProject) {
    if (resourceProject !== config.project) throw new Error('P23_RESOURCE_PROJECT_MISMATCH');
    runtime = { resource: runJson(process.execPath, ['scripts/research-p23/resource-snapshot.mjs', resourceProject, '--require-limits']) };
  }
  if (readManifest) {
    runtime = { ...(runtime ?? {}), read_load: runJson(process.execPath, ['scripts/research-p23/read-load.mjs', readManifest]) };
  }
  for (const [role,path] of [['resource',resourceReceipt],['read_load',readReceipt],['workload',workloadReceipt]]) {
    if (path) runtime = { ...(runtime ?? {}), [role]:privateFile(path), [`${role}_locator`]:resolve(path) };
  }
  const receipt = buildQualificationReceipt(config, evidence, runtime);
  if (outputPath) {
    if (!isAbsolute(outputPath)) throw new Error('P23_OUTPUT_PATH_MUST_BE_ABSOLUTE');
    mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
    writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}
`, { mode: 0o600 });
    chmodSync(outputPath, 0o600);
  }
  return receipt;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
    const configPath = arg('--config');
    if (!configPath || !isAbsolute(configPath)) throw new Error('P23_PRIVATE_CONFIG_0600_REQUIRED');
    const receipt = runQualification({ configPath, evidenceDir: arg('--evidence-dir'), resourceProject: arg('--resource-project'), readManifest: arg('--read-manifest'), outputPath: arg('--out'),
      resourceReceipt:arg('--resource-receipt'),readReceipt:arg('--read-receipt'),workloadReceipt:arg('--workload-receipt') });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}
`);
    if (!receipt.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`P23 qualification refused: ${error.message}
`);
    process.exitCode = 1;
  }
}
