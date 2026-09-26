#!/usr/bin/env node
/**
 * OL-12 / P23 qualification orchestrator.
 *
 * It is deliberately conservative: without a real, hashed receipt from the
 * isolated P23 project every test is BLOCKED. It never runs fault injection,
 * never touches a shared project, and never treats a fixture as a qualification.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

export const P23_TESTS = Object.freeze([
  ['P23-T01', 'mixed 20-user GET load and aggregate 5 GB peak'],
  ['P23-T02', 'one heavy slot plus queued diagnostic/export/audit admission'],
  ['P23-T03', 'isolated project, loopback port and no shared-host mutation'],
  ['P23-T04', 'IDOR, secret, path and export isolation'],
  ['P23-T05', 'corrupt artifact and typed refusal handling'],
  ['P23-T06', 'PostgreSQL/NATS/worker restart and recovery'],
  ['P23-T07', 'disk, file descriptor, I/O and pool budgets'],
  ['P23-T08', 'backup, restore and actual readback'],
  ['P23-T09', 'cache TTL, GC pin and retained-artifact cleanup'],
  ['P23-T10', 'lease fencing, duplicate, gap and resume correctness'],
  ['P23-T11', 'historical reads while workers are stopped'],
  ['P23-T12', 'old/new engine and archived-data compatibility'],
  ['P23-T13', 'browser auth, cursor and stale-response isolation'],
  ['P23-T14', 'Execution/Planning regression while Research is under load'],
  ['P23-T15', 'drain, rollback, cleanup and post-qualification receipt'],
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
  return input;
}

function privateFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw new Error(`P23_PRIVATE_EVIDENCE_0600_REQUIRED:${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validReceipt(testId, receipt, locator) {
  if (!receipt || typeof receipt !== 'object' || receipt.test_id !== testId || receipt.status !== 'PASS') return null;
  if (!Array.isArray(receipt.evidence) || receipt.evidence.length === 0) return null;
  if (receipt.evidence.some(item => !item || typeof item !== 'object'
    || !['actual_command', 'receipt', 'browser', 'restore', 'fault'].includes(item.kind)
    || typeof item.locator !== 'string' || !isAbsolute(item.locator)
    || typeof item.command !== 'string' || item.command.includes('SECRET')
    || item.exit_code !== 0 || typeof item.sha256 !== 'string' || !HEX64.test(item.sha256))) return null;
  return { test_id: testId, status: 'PASS', description: P23_TESTS.find(([id]) => id === testId)[1], evidence: receipt.evidence, source: locator };
}

export function readEvidence(evidenceDir) {
  if (typeof evidenceDir !== 'string' || !isAbsolute(evidenceDir)) return new Map();
  const out = new Map();
  for (const [testId] of P23_TESTS) {
    const path = resolve(evidenceDir, `${testId}.json`);
    try { out.set(testId, validReceipt(testId, privateFile(path), path)); } catch { /* absent/invalid stays blocked */ }
  }
  return out;
}

function blocked(testId, reason) {
  return { test_id: testId, status: 'BLOCKED', description: P23_TESTS.find(([id]) => id === testId)[1], reason };
}

export function buildQualificationReceipt(config, evidence = new Map(), runtime = null) {
  validateQualificationConfig(config);
  const tests = P23_TESTS.map(([testId]) => evidence.get(testId) ?? blocked(testId, 'REAL_ISOLATED_EVIDENCE_REQUIRED'));
  const resource = runtime?.resource ?? null;
  if (resource && (resource.base_limit_bytes !== BASE_LIMIT_BYTES || resource.passed !== true)) {
    const current = tests.find(test => test.test_id === 'P23-T01');
    if (current?.status === 'PASS') current.status = 'BLOCKED';
    if (current) current.reason = 'P23_RESOURCE_RECEIPT_FAILED_OR_WRONG_LIMIT';
  }
  return {
    schema_version: 'research.p23-qualification.v1',
    project: config.project, base_url: config.base_url,
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

export function runQualification({ configPath, evidenceDir, resourceProject, readManifest, outputPath }) {
  const config = validateQualificationConfig(privateFile(configPath));
  const evidence = readEvidence(evidenceDir ?? config.evidence_dir);
  let runtime = null;
  if (resourceProject) {
    if (resourceProject !== config.project) throw new Error('P23_RESOURCE_PROJECT_MISMATCH');
    runtime = { resource: runJson(process.execPath, ['scripts/research-p23/resource-snapshot.mjs', resourceProject, '--require-limits']) };
  }
  if (readManifest) {
    const manifest = privateFile(readManifest);
    runtime = { ...(runtime ?? {}), read_load: runJson(process.execPath, ['scripts/research-p23/read-load.mjs', readManifest]) };
    if (manifest.base_url !== config.base_url) throw new Error('P23_READ_MANIFEST_URL_MISMATCH');
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
    const receipt = runQualification({ configPath, evidenceDir: arg('--evidence-dir'), resourceProject: arg('--resource-project'), readManifest: arg('--read-manifest'), outputPath: arg('--out') });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}
`);
    if (!receipt.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`P23 qualification refused: ${error.message}
`);
    process.exitCode = 1;
  }
}
