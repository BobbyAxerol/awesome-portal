#!/usr/bin/env node
/**
 * Dependency-scoped evidence custody, NOT a replacement for qualify.mjs.
 * No Docker, HTTP, engine, database or Git write is performed. In particular,
 * REUSED_VERIFIED is not fifteen PASS receipts from one candidate image.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORICAL_TEST_MANIFEST_LOSSES } from './historical-manifest-exceptions.mjs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_SCOPE_BYTES = 96 * 1024 * 1024;
const MAX_FILES = 20_000;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const sorted = values => [...new Set(values)].sort();

// Conservative, reviewed minimum scopes. Operators can ADD paths, never omit
// these, substitute a prose hash, or claim whole-gate coverage from one method.
const GROUPS = Object.freeze({
  runtime: ['compose.yaml', '.dockerignore', 'deploy/images/control-api.Dockerfile', 'deploy/images/portal-api.Dockerfile',
    'apps/control-api/package.json', 'apps/control-api/package-lock.json',
    'apps/control-api/src/config.ts', 'apps/control-api/src/app.module.ts', 'apps/control-api/src/app.ts', 'apps/control-api/src/main.ts',
    'apps/portal/backend/pyproject.toml', 'constraints', 'deploy/postgres',
    'deploy/research-preview/compose.research-p23-5gb.yaml', 'scripts/research-p23/qualify.mjs'],
  worker: ['apps/portal/backend/src/portal_api/workers', 'apps/portal/backend/src/portal_api/domain',
    'apps/portal/backend/src/portal_api/services/durable_runs.py'],
  storage: ['apps/control-api/migrations',
    'apps/research-artifact-reader-rs',
    'apps/portal/backend/src/portal_api/services/research_artifacts.py',
    'apps/portal/backend/src/portal_api/services/research_current_source_retention.py',
    'apps/portal/backend/src/portal_api/services/research_retained_receipt.py',
    'apps/control-api/src/research/artifact-verify.service.ts',
    'apps/control-api/src/research/artifact-verify.repository.ts',
    'apps/control-api/src/research/artifact-verify.client.ts'],
  auth: ['apps/control-api/src/auth', 'apps/control-api/src/admin', 'apps/control-api/src/repos',
    'apps/control-api/src/db'],
  reads: ['apps/control-api/src/research', 'apps/control-api/src/execution', 'packages/contracts'],
  governance: ['apps/control-api/src/governance',
    'apps/control-api/src/facade',
    'apps/control-api/src/research/release-candidate.service.ts',
    'apps/control-api/src/research/release-candidate-publication.service.ts',
    'apps/control-api/src/research/release-candidate-publication.repository.ts'],
  browser: ['apps/portal/frontend'],
});
const groupsForGate = [
  ['runtime', 'worker', 'storage', 'auth', 'reads', 'governance'],
  ['runtime', 'worker', 'storage'],
  ['runtime', 'worker', 'storage'],
  ['runtime', 'worker', 'storage', 'auth'],
  ['runtime', 'storage', 'auth', 'reads', 'governance'],
  ['runtime', 'worker', 'storage', 'auth', 'governance'],
  ['runtime', 'worker', 'storage', 'reads'],
  ['runtime', 'worker', 'storage', 'auth', 'reads'],
  ['runtime', 'worker', 'auth', 'reads', 'governance'],
  ['runtime', 'worker', 'storage', 'auth', 'reads', 'governance', 'browser'],
  ['runtime', 'worker', 'auth', 'reads'],
  ['runtime', 'worker', 'storage', 'auth', 'reads'],
  ['runtime', 'worker', 'storage', 'reads'],
  ['runtime', 'worker', 'storage', 'auth', 'reads', 'governance'],
  ['runtime', 'worker', 'storage', 'auth', 'reads', 'governance', 'browser'],
];
const configForGate = [
  ['engine', 'storage', 'security', 'limits', 'features', 'database', 'network'],
  ['engine', 'storage', 'limits', 'features', 'database'],
  ['storage', 'limits', 'features', 'database'],
  ['engine', 'storage', 'security', 'limits', 'database', 'network'],
  ['security', 'storage', 'features', 'database', 'network'],
  ['security', 'storage', 'features', 'database'],
  ['engine', 'storage', 'features', 'limits'],
  ['engine', 'storage', 'security', 'limits', 'features', 'database'],
  ['security', 'limits', 'features', 'database', 'network'],
  ['engine', 'storage', 'security', 'limits', 'features', 'database', 'network'],
  ['engine', 'storage', 'security', 'limits', 'features', 'database'],
  ['engine', 'storage', 'security', 'limits', 'features', 'database'],
  ['engine', 'storage', 'features', 'limits'],
  ['engine', 'storage', 'security', 'features', 'database'],
  ['engine', 'storage', 'security', 'limits', 'features', 'database', 'network'],
];
const harnessForGate = [
  ['mixed-workload.mjs', 'read-load.mjs', 'resource-snapshot.mjs'], ['plateau-receipt.mjs'],
  ['fault-receipt.mjs', 'disk-pressure-probe.py'], ['recovery-receipt.mjs', 'fault-receipt.mjs'],
  ['tenant-cache-receipt.mjs', 'import-attestation-receipt.mjs'],
  ['restore-receipt.mjs', 'historical-manifest-exceptions.mjs'],
  ['portal-engine-transition-receipt.mjs', 'second-engine-receipt.mjs'],
  ['evict-owned-page-cache.py', 'mixed-workload.mjs', 'read-load.mjs', 'resource-snapshot.mjs'],
  ['t09-execution-isolation.mjs'], [], ['far-seek-receipt.mjs'],
  ['utility-receipt.mjs', 't12-admission-receipt.mjs'],
  ['release-rollback-receipt.mjs', 'portal-engine-transition-receipt.mjs'],
  ['approval-graph-receipt.mjs', 'restore-receipt.mjs'], ['t15-browser-real.mjs'],
];
export const RECONCILIATION_POLICY = Object.freeze(Object.fromEntries(groupsForGate.map((groups, index) => [
  `P23-T${String(index + 1).padStart(2, '0')}`, Object.freeze({
    groups: Object.freeze(groups),
    paths: Object.freeze(sorted([...groups.flatMap(group => GROUPS[group]),
      ...harnessForGate[index].map(name => `scripts/research-p23/${name}`)])),
    config_categories: Object.freeze(configForGate[index]),
  }),
])));

function safeRelative(path) {
  if (typeof path !== 'string' || path.length > 300 || !/^[A-Za-z0-9_./-]+$/.test(path)
    || isAbsolute(path) || path.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('P23_RECONCILE_LITERAL_REPOSITORY_PATH_REQUIRED');
  }
  return path;
}
function canonical(value, depth = 0) {
  if (depth > 24) fail('P23_RECONCILE_JSON_DEPTH_EXCEEDED');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => canonical(item, depth + 1)).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(',')}}`;
  }
  fail('P23_RECONCILE_PLAIN_JSON_REQUIRED');
}
function at(value, pointer) {
  if (typeof pointer !== 'string' || pointer.length > 512 || !/^\/(?:[^~]|~[01])+$/.test(pointer)) {
    fail('P23_RECONCILE_EXPLICIT_JSON_POINTER_REQUIRED');
  }
  for (const encoded of pointer.slice(1).split('/')) {
    const key = encoded.replaceAll('~1', '/').replaceAll('~0', '~');
    if (!value || !Object.hasOwn(value, key)) fail('P23_RECONCILE_FACT_NOT_RECORDED');
    value = value[key];
  }
  return value;
}
function inside(root, path) {
  const tail = relative(root, path);
  return tail !== '' && !tail.startsWith(`..${sep}`) && tail !== '..' && !isAbsolute(tail);
}
function noSymlinks(path) {
  let part = resolve(path);
  while (part !== dirname(part)) {
    if (lstatSync(part).isSymbolicLink()) fail('P23_RECONCILE_SYMLINK_REFUSED');
    part = dirname(part);
  }
}
function proofReader(roots) {
  if (!Array.isArray(roots) || roots.length < 1 || roots.length > 16) fail('P23_RECONCILE_EVIDENCE_ROOTS_REQUIRED');
  const checked = roots.map(root => {
    if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root || root.split(sep).length < 4) {
      fail('P23_RECONCILE_NARROW_ABSOLUTE_ROOT_REQUIRED');
    }
    noSymlinks(root);
    if (!lstatSync(root).isDirectory()) fail('P23_RECONCILE_EVIDENCE_DIRECTORY_REQUIRED');
    return root;
  });
  return ref => {
    if (!ref || typeof ref.locator !== 'string' || !isAbsolute(ref.locator)
      || resolve(ref.locator) !== ref.locator || !DIGEST.test(ref.sha256 ?? '')
      || !checked.some(root => inside(root, ref.locator))) fail('P23_RECONCILE_HASHED_CONFINED_EVIDENCE_REQUIRED');
    noSymlinks(ref.locator);
    const fd = openSync(ref.locator, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size > MAX_BYTES || (before.mode & 0o077) !== 0) {
        fail('P23_RECONCILE_PRIVATE_BOUNDED_REGULAR_FILE_REQUIRED');
      }
      const bytes = readFileSync(fd);
      const after = fstatSync(fd);
      if (before.size !== bytes.length || before.ino !== after.ino || before.size !== after.size
        || before.mtimeMs !== after.mtimeMs || digest(bytes) !== ref.sha256
        || (ref.bytes !== undefined && ref.bytes !== bytes.length)) fail('P23_RECONCILE_EVIDENCE_BYTES_CHANGED');
      return { bytes, fact: { locator: ref.locator, bytes: bytes.length, sha256: ref.sha256 } };
    } finally { closeSync(fd); }
  };
}
function git(repo, args, encoding = 'utf8', input = undefined, maxBuffer = 32 * 1024 * 1024) {
  // A bounded regular stdin avoids keeping a bidirectional pipe/event-loop
  // open in the restricted runner. Git still only reads objects; this exact
  // temporary input directory is always removed, including on Git failure.
  let temp, fd;
  try {
    if (input !== undefined) {
      temp = mkdtempSync(join(tmpdir(), 'p23-reconcile-git-input-'));
      const path = join(temp, 'object-ids');
      writeFileSync(path, input, { flag: 'wx', mode: 0o600 }); fd = openSync(path, constants.O_RDONLY);
    }
    return execFileSync('git', ['-C', repo, ...args], {
      encoding, stdio: [fd ?? 'ignore', 'pipe', 'pipe'], timeout: 20_000, maxBuffer,
    });
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (temp) rmSync(temp, { recursive: true, force: false });
  }
}
function checkCommit(repo, sha) {
  if (!SHA.test(sha ?? '') || git(repo, ['rev-parse', '--verify', `${sha}^{commit}`]).trim() !== sha) {
    fail('P23_RECONCILE_FULL_EXISTING_COMMIT_REQUIRED');
  }
}
function blobHashes(repo, objectIds, cache) {
  const missing = sorted(objectIds.filter(id => !cache.has(id)));
  if (!missing.length) return;
  // One bounded Git subprocess per batch, not one subprocess per source file.
  const sizes = git(repo, ['cat-file', '--batch-check'], 'utf8', `${missing.join('\n')}\n`)
    .trim().split('\n').map(row => {
      const parsed = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(row);
      if (!parsed) fail('P23_RECONCILE_BLOB_TYPE_REQUIRED');
      return Number(parsed[2]);
    });
  if (sizes.length !== missing.length || sizes.some(size => !Number.isSafeInteger(size) || size > MAX_BYTES)
    || sizes.reduce((sum, size) => sum + size, 0) > MAX_SCOPE_BYTES) fail('P23_RECONCILE_SOURCE_SCOPE_BYTES_EXCEEDED');
  const bytes = git(repo, ['cat-file', '--batch'], null, `${missing.join('\n')}\n`, MAX_SCOPE_BYTES + MAX_FILES * 128);
  let offset = 0;
  for (let index = 0; index < missing.length; index++) {
    const end = bytes.indexOf(10, offset);
    if (end < 0 || bytes.subarray(offset, end).toString('ascii') !== `${missing[index]} blob ${sizes[index]}`) {
      fail('P23_RECONCILE_GIT_BLOB_FRAMING_MISMATCH');
    }
    offset = end + 1;
    const body = bytes.subarray(offset, offset + sizes[index]);
    if (body.length !== sizes[index] || bytes[offset + sizes[index]] !== 10) fail('P23_RECONCILE_GIT_BLOB_FRAMING_MISMATCH');
    cache.set(missing[index], digest(body)); offset += sizes[index] + 1;
  }
  if (offset !== bytes.length) fail('P23_RECONCILE_GIT_BLOB_FRAMING_MISMATCH');
}
function treeScope(repo, sha, selectors, blobCache) {
  const rows = git(repo, ['ls-tree', '-r', '-z', '--full-tree', sha, '--',
    ...selectors.map(path => `:(literal)${path}`)]).split('\0').filter(Boolean);
  if (rows.length === 0 || rows.length > MAX_FILES) fail('P23_RECONCILE_NONEMPTY_BOUNDED_DEPENDENCY_SCOPE_REQUIRED');
  const entries = rows.map(row => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/.exec(row);
    if (!match) fail('P23_RECONCILE_DEPENDENCY_SYMLINK_OR_SUBMODULE_REFUSED');
    const path = safeRelative(match[3]);
    return { path, mode: match[1], object: match[2] };
  });
  blobHashes(repo, entries.map(row => row.object), blobCache);
  const files = entries.map(row => ({ path: row.path, mode: row.mode, sha256: blobCache.get(row.object) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { files, sha256: digest(canonical(files)),
    missing: selectors.filter(path => !files.some(file => file.path === path || file.path.startsWith(`${path}/`))) };
}
function workingTreeScope(repo, selectors, candidate) {
  if (git(repo, ['ls-files', '--others', '--exclude-standard', '-z', '--',
    ...selectors.map(path => `:(literal)${path}`)]).length !== 0) fail('P23_RECONCILE_UNCOMMITTED_DEPENDENCY_REQUIRED_TO_LAND');
  for (const file of candidate.files) {
    const path = resolve(repo, file.path);
    noSymlinks(path);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.size > MAX_BYTES || Boolean(stat.mode & 0o111) !== (file.mode === '100755')
      || digest(readFileSync(path)) !== file.sha256) {
      fail('P23_RECONCILE_WORKTREE_NOT_CANDIDATE_BYTES');
    }
  }
}
function runtimeProof(read, input, sourceSha) {
  const identity = read(input?.identity);
  const value = JSON.parse(identity.bytes);
  if (at(value, input.source_sha_pointer) !== sourceSha) fail('P23_RECONCILE_RUNTIME_SOURCE_BINDING_MISMATCH');
  // A source_parent/build-before-commit label is not the image's exact source.
  // This fact must already be in the captured build identity, not invented in
  // the reconciliation manifest to make an old receipt reusable.
  if (at(value, input.exact_commit_pointer) !== true) fail('P23_RECONCILE_EXACT_RUNTIME_COMMIT_ATTESTATION_REQUIRED');
  const project = at(value, input.project_pointer);
  if (typeof project !== 'string' || !/^[a-z][a-z0-9-]{2,100}$/.test(project)) fail('P23_RECONCILE_RUNTIME_PROJECT_REQUIRED');
  if (!Array.isArray(input.image_pointers) || input.image_pointers.length < 1 || input.image_pointers.length > 8) {
    fail('P23_RECONCILE_RUNTIME_IMAGE_IDENTITY_REQUIRED');
  }
  const images = input.image_pointers.map(pointer => at(value, pointer));
  if (images.some(image => typeof image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image))) {
    fail('P23_RECONCILE_RUNTIME_IMAGE_IDENTITY_REQUIRED');
  }
  const config = read(input.config);
  const configValue = JSON.parse(config.bytes);
  return { identity: identity.fact, config: config.fact, configValue, config_pointers: input.config_pointers,
    project, images };
}
function configScope(runtime, categories) {
  const facts = {};
  for (const category of categories) facts[category] = at(runtime.configValue, runtime.config_pointers?.[category]);
  return { categories, sha256: digest(canonical(facts)) };
}
function historicalException(read, input) {
  const receipt = read(input?.receipt);
  const value = JSON.parse(receipt.bytes);
  const population = read(input.population);
  const measured = JSON.parse(population.bytes);
  if (value.schema_version !== 'research.p23-historical-test-loss.v1'
    || value.authority !== 'BOBBY_APPROVED_2026_10_03_EXACT_TEST_LOSS_ACCOUNTING'
    || value.state !== 'EXACT_HISTORICAL_EXCEPTION_ACCOUNTED'
    || value.exception_accounting_passed !== true || value.full_store_integrity_passed !== false
    || value.byte_recovery_performed !== false || !Array.isArray(value.details) || value.details.length !== 3
    || at(measured, input.verified_pointer) !== 83) fail('P23_RECONCILE_EXACT_OWNER_EXCEPTION_REQUIRED');
  const missing = at(measured, input.missing_pointer);
  if (!Array.isArray(missing) || missing.length !== 3) fail('P23_RECONCILE_EXACT_OWNER_EXCEPTION_REQUIRED');
  for (const expected of HISTORICAL_TEST_MANIFEST_LOSSES) {
    const details = value.details.filter(row => row.artifact_id === expected.artifact_id);
    const lost = missing.filter(row => row.artifact_id === expected.artifact_id);
    if (details.length !== 1 || lost.length !== 1
      || Object.entries(expected).some(([key, fact]) => details[0][key] !== fact)
      || details[0].state !== 'MISSING' || details[0].recovered !== false
      || lost[0].expected_manifest_digest !== expected.expected_manifest_digest || lost[0].state !== 'MISSING') {
      fail('P23_RECONCILE_EXACT_OWNER_EXCEPTION_REQUIRED');
    }
  }
  return { receipt: receipt.fact, population: population.fact, verified: 83, total: 86,
    full_store_integrity_passed: false, byte_recovery_performed: false,
    exception_ids: HISTORICAL_TEST_MANIFEST_LOSSES.map(row => row.artifact_id) };
}

export function reconcileEvidence(input) {
  if (input?.schema_version !== 'research.p23-evidence-reconciliation-input.v1') fail('P23_RECONCILE_INPUT_VERSION_REQUIRED');
  const repo = input.repository;
  if (typeof repo !== 'string' || !isAbsolute(repo) || realpathSync(repo) !== repo
    || git(repo, ['rev-parse', '--show-toplevel']).trim() !== repo) fail('P23_RECONCILE_EXACT_REPOSITORY_ROOT_REQUIRED');
  const candidateSha = input.candidate?.source_sha;
  checkCommit(repo, candidateSha);
  if (git(repo, ['rev-parse', 'HEAD']).trim() !== candidateSha) fail('P23_RECONCILE_CHECKED_OUT_CANDIDATE_REQUIRED');
  if (!Array.isArray(input.gates) || input.gates.length > 15) fail('P23_RECONCILE_BOUNDED_GATE_LIST_REQUIRED');
  const ids = input.gates.map(row => row.gate_id);
  if (new Set(ids).size !== ids.length || ids.some(id => !Object.hasOwn(RECONCILIATION_POLICY, id))) {
    fail('P23_RECONCILE_UNIQUE_CANONICAL_GATE_IDS_REQUIRED');
  }
  const read = proofReader(input.evidence_roots);
  let candidateRuntime, candidateError;
  try { candidateRuntime = runtimeProof(read, input.candidate.runtime, candidateSha); }
  catch (error) { candidateError = sanitizedReason(error); }
  const snapshots = new Map();
  const blobCache = new Map();
  const snapshot = (sha, paths) => {
    const key = `${sha}:${paths.join('\0')}`;
    if (!snapshots.has(key)) snapshots.set(key, treeScope(repo, sha, paths, blobCache));
    return snapshots.get(key);
  };
  const gates = Object.entries(RECONCILIATION_POLICY).map(([gateId, policy]) => {
    const row = input.gates.find(item => item.gate_id === gateId);
    const result = { gate_id: gateId, disposition: 'UNVERIFIED', scope: row?.scope ?? null,
      minimum_dependency_groups: policy.groups, required_config_categories: policy.config_categories };
    if (!row) return { ...result, reason: 'P23_RECONCILE_ORIGIN_NOT_SUPPLIED' };
    try {
      if (typeof row.scope !== 'string' || row.scope.length < 8 || row.scope.length > 1000) fail('P23_RECONCILE_NAMED_ORIGIN_SCOPE_REQUIRED');
      const originSha = row.origin?.source_sha;
      checkCommit(repo, originSha);
      git(repo, ['merge-base', '--is-ancestor', originSha, candidateSha]);
      result.origin_source_sha = originSha;
      const origin = read(row.origin.receipt);
      result.origin_evidence = origin.fact;
      const value = JSON.parse(origin.bytes);
      if (at(value, row.origin.gate_id_pointer) !== gateId) fail('P23_RECONCILE_ORIGIN_GATE_BINDING_MISMATCH');
      if (![true, 'PASS', 'PASSED', 'SCOPED_PASS', 'READY_FOR_BOBBY_REVIEW'].includes(row.origin.result_equals)) {
        fail('P23_RECONCILE_EXPLICIT_SUCCESS_PREDICATE_REQUIRED');
      }
      const measuredResult = at(value, row.origin.result_pointer);
      if (measuredResult !== row.origin.result_equals) {
        return { ...result, disposition: 'RETAKE_REQUIRED', reason: 'P23_RECONCILE_ORIGIN_DID_NOT_PASS' };
      }
      if (!Array.isArray(row.evidence) || row.evidence.length < 1 || row.evidence.length > 32) fail('P23_RECONCILE_RAW_SUPPORTING_ARTIFACTS_REQUIRED');
      result.supporting_evidence = row.evidence.map(ref => read(ref).fact);
      const originRuntime = runtimeProof(read, row.origin.runtime, originSha);
      result.origin_identity = originRuntime.identity;
      result.origin_config = originRuntime.config;
      result.origin_project = originRuntime.project;
      result.origin_images = originRuntime.images;
      if (candidateError) fail(candidateError);
      result.candidate_identity = candidateRuntime.identity;
      result.candidate_config = candidateRuntime.config;
      result.same_image_ids = canonical(originRuntime.images) === canonical(candidateRuntime.images);
      if (row.additional_paths !== undefined && (!Array.isArray(row.additional_paths) || row.additional_paths.length > 64)) {
        fail('P23_RECONCILE_BOUNDED_ADDITIONAL_PATHS_REQUIRED');
      }
      const paths = sorted([...policy.paths, ...(row.additional_paths ?? []).map(safeRelative)]);
      const before = snapshot(originSha, paths);
      const after = snapshot(candidateSha, paths);
      // A selector absent in one version is a real addition/deletion. A selector
      // absent in both is an unverified dependency declaration, not unchanged.
      if (before.missing.some(path => after.missing.includes(path))) fail('P23_RECONCILE_DECLARED_DEPENDENCY_NOT_FOUND');
      workingTreeScope(repo, paths, after);
      const beforeFiles = new Map(before.files.map(file => [file.path, file]));
      const afterFiles = new Map(after.files.map(file => [file.path, file]));
      const changed = sorted([...beforeFiles.keys(), ...afterFiles.keys()]).filter(path =>
        canonical(beforeFiles.get(path) ?? null) !== canonical(afterFiles.get(path) ?? null));
      const originConfig = configScope(originRuntime, policy.config_categories);
      const candidateConfig = configScope(candidateRuntime, policy.config_categories);
      result.dependency_verification = { paths, origin_sha256: before.sha256, candidate_sha256: after.sha256,
        files_at_origin: before.files.length, files_at_candidate: after.files.length,
        changed_paths: changed, origin_config_scope: originConfig, candidate_config_scope: candidateConfig };
      if (changed.length || originConfig.sha256 !== candidateConfig.sha256) {
        return { ...result, disposition: 'RETAKE_REQUIRED', reason: changed.length
          ? 'P23_RECONCILE_SOURCE_DEPENDENCIES_CHANGED' : 'P23_RECONCILE_RUNTIME_CONFIG_SCOPE_CHANGED' };
      }
      if (row.historical_exception !== undefined) {
        if (gateId !== 'P23-T06') fail('P23_RECONCILE_EXCEPTION_ONLY_FOR_T06');
        result.historical_exception = historicalException(read, row.historical_exception);
        result.disposition = 'APPROVED_EXCEPTION';
      } else {
        result.disposition = originSha === candidateSha ? 'AFFECTED_RETAKE_VERIFIED' : 'REUSED_VERIFIED';
      }
      result.reason = 'P23_RECONCILE_BYTES_AND_DECLARED_SCOPE_VERIFIED_NOT_SAME_IMAGE_QUALIFICATION';
      return result;
    } catch (error) { return { ...result, reason: sanitizedReason(error) }; }
  });
  return { schema_version: 'research.p23-evidence-reconciliation.v1', candidate_source_sha: candidateSha,
    verifier_source_sha256: digest(readFileSync(fileURLToPath(import.meta.url))),
    dependency_policy_sha256: digest(canonical(RECONCILIATION_POLICY)),
    generated_at_utc: new Date().toISOString(), gates,
    reconciliation_complete: gates.every(row => ['REUSED_VERIFIED', 'AFFECTED_RETAKE_VERIFIED', 'APPROVED_EXCEPTION'].includes(row.disposition)),
    qualification_issued: false, same_candidate_all_gates_passed: false, product_active: false,
    strict_historical_integrity: { verified: 83, total: 86, full_store_integrity_passed: false,
      source: 'BOBBY_APPROVED_EXACT_THREE_OLD_TEST_MANIFEST_LOSSES_NOT_NEW_CANDIDATE_MEASUREMENT' },
    limitations: ['SUPPLIED_RAW_BYTES_AND_DECLARED_SCOPE_VERIFICATION_NOT_AN_INDEPENDENT_TEST_EXECUTION',
      'REVIEW_ORIGIN_PREDICATE_AND_RUNTIME_CAPTURE_COMPLETENESS_BEFORE_REUSING',
      'MISSING_PRIVATE_ARTIFACTS_AND_UNRECORDED_CONFIG_ARE_UNVERIFIED_NOT_PROSE_SUBSTITUTES',
      'STRICT_QUALIFY_MJS_AND_OWNER_RELEASE_GATES_UNCHANGED'] };
}
function sanitizedReason(error) {
  return typeof error?.message === 'string' && /^P23_RECONCILE_[A-Z0-9_]+$/.test(error.message)
    ? error.message : 'P23_RECONCILE_ORIGIN_OR_DEPENDENCY_UNVERIFIABLE';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || !isAbsolute(args[0]) || !isAbsolute(args[1])) fail('P23_RECONCILE_USAGE_MANIFEST_ABSOLUTE_OUTPUT_ABSOLUTE');
    noSymlinks(args[0]);
    const stat = lstatSync(args[0]);
    if (!stat.isFile() || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0) fail('P23_RECONCILE_PRIVATE_INPUT_REQUIRED');
    const output = reconcileEvidence(JSON.parse(readFileSync(args[0], 'utf8')));
    noSymlinks(dirname(args[1]));
    writeFileSync(args[1], `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ output: args[1], reconciliation_complete: output.reconciliation_complete,
      qualification_issued: false, counts: Object.fromEntries(['REUSED_VERIFIED', 'AFFECTED_RETAKE_VERIFIED',
        'APPROVED_EXCEPTION', 'RETAKE_REQUIRED', 'UNVERIFIED'].map(status => [status, output.gates.filter(row => row.disposition === status).length])) })}\n`);
    if (!output.reconciliation_complete) process.exitCode = 1;
  } catch (error) { process.stderr.write(`${sanitizedReason(error)}\n`); process.exitCode = 1; }
}
