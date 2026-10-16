#!/usr/bin/env node
/** Offline P05 custody/census preparation, NOT a calculator, approval or runtime
 * loader. No DB/network/discovery. Run in an existing approved QuantBT adapter
 * environment with pyarrow installed; never installs dependencies.
 *
 * Input: {schema_version:'portal.elp2-10.calibration-census-input.v1', snapshot_id,
 * cutoff_ms, scope:{workspace_id,environment,profile_id,catalogue_digest,currency,
 * comparable_basis_id}, population:{source_locator,expected_runs}, runs:[{
 * run_id,alpha_id,alpha_version_id,status,evidence_domain,domain_source_locator,
 * selection:'INCLUDED'|'EXCLUDED',exclusion_reason:null|CODE,artifacts:[{
 * artifact_id,artifact_revision,manifest:{path,sha256,bytes},expected_rows,
 * first_ordinal,last_ordinal,window:{kind,start_ms,end_ms,expected_observations},
 * missing_inputs:[{input,reason_code,source_locator}]}]}]}.
 * Paths are strict relative paths below one explicit artifact root. All source
 * files, not just observation parts, are verified by the Parquet helper.
 * CLI: node calibration-census.mjs --root=/explicit/custody --inventory=/input.json
 *      --python=/existing/venv/bin/python [--output=/new/report.json]
 * Split environment: --prepare-extractor=true emits bounded stdin for the same
 * helper in an already approved pyarrow image. Capture its stdout explicitly,
 * then pass --extraction=/receipt.json --extraction-sha256=sha256:<exact hash>.
 * Default writes stdout only; explicit output is create-exclusive, never overwrite.
 */
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const CENSUS_LIMITS = Object.freeze({ inventory_bytes: 1_048_576, runs: 64, artifacts: 128,
  manifest_bytes: 1_048_576, part_bytes: 67_108_864, total_source_bytes: 268_435_456,
  rows: 2_000_000, parts: 1024, output_bytes: 2_097_152, timeout_ms: 60_000 });
const HASH = /^sha256:[a-f0-9]{64}$(?![\s\S])/;
const CODE = /^[A-Z][A-Z0-9_]{2,127}$(?![\s\S])/;
const text = v => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/[\u0000-\u001f\u007f]/.test(v);
const count = v => Number.isSafeInteger(v) && v >= 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const shape = (v, keys) => object(v) && keys.every(k => Object.hasOwn(v, k)) && Object.keys(v).length === keys.length;
const canonical = v => JSON.stringify(Array.isArray(v) ? v.map(x => JSON.parse(canonical(x))) : object(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))])) : v);
export const censusSha256 = v => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const fail = code => { throw new Error(code); };
const assert = (v, code) => { if (!v) fail(code); };
const safeRelative = path => text(path) && !isAbsolute(path) && !path.includes('\\')
  && !path.split('/').some(part => !part || part === '.' || part === '..');
const INPUTS = ['cash_reference', 'flow_adjusted_returns', 'cost_completeness', 'stress_cost_grid',
  'predeclared_blocks', 'ownership_partition', 'calendar_grid', 'runtime_calibration_approval'];
const DOMAINS = ['HISTORICAL_RESEARCH', 'FORWARD_PAPER', 'LIVE_ACTUAL', 'SYNTHETIC'];
const STATUSES = ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];
const helperPath = join(dirname(fileURLToPath(import.meta.url)), 'calibration-census-parquet.py');

export function validateCensusInput(input) {
  assert(shape(input, ['schema_version', 'snapshot_id', 'cutoff_ms', 'scope', 'population', 'runs'])
    && input.schema_version === 'portal.elp2-10.calibration-census-input.v1' && text(input.snapshot_id)
    && count(input.cutoff_ms), 'CENSUS_INPUT_INVALID');
  const s = input.scope;
  assert(shape(s, ['workspace_id', 'environment', 'profile_id', 'catalogue_digest', 'currency', 'comparable_basis_id'])
    && [s.workspace_id, s.profile_id].every(text)
    && ['research', 'paper', 'sandbox', 'live'].includes(s.environment) && HASH.test(s.catalogue_digest)
    && (s.environment === 'research'
      ? [s.currency, s.comparable_basis_id].every(value => value === null || text(value))
      : [s.currency, s.comparable_basis_id].every(text)), 'CENSUS_SCOPE_INVALID');
  assert(shape(input.population, ['source_locator', 'expected_runs']) && text(input.population.source_locator)
    && count(input.population.expected_runs) && Array.isArray(input.runs) && input.runs.length > 0
    && input.runs.length <= CENSUS_LIMITS.runs && input.runs.length === input.population.expected_runs,
  'CENSUS_POPULATION_INVALID');
  const ids = new Set(), paths = new Set(), artifactIds = new Set(); let artifactCount = 0;
  for (const run of input.runs) {
    assert(shape(run, ['run_id', 'alpha_id', 'alpha_version_id', 'status', 'evidence_domain', 'domain_source_locator',
      'selection', 'exclusion_reason', 'artifacts']) && /^rrun_[a-z0-9]{1,64}$(?![\s\S])/.test(run.run_id)
      && [run.alpha_id, run.alpha_version_id, run.domain_source_locator].every(text) && !ids.has(run.run_id)
      && STATUSES.includes(run.status) && DOMAINS.includes(run.evidence_domain)
      && ['INCLUDED', 'EXCLUDED'].includes(run.selection) && Array.isArray(run.artifacts), 'CENSUS_RUN_INVALID');
    ids.add(run.run_id);
    assert(run.selection === 'INCLUDED' ? run.status === 'COMPLETED' && run.exclusion_reason === null && run.artifacts.length > 0
      : CODE.test(run.exclusion_reason) && run.artifacts.length === 0, 'CENSUS_SELECTION_INVALID');
    const windows = [];
    for (const a of run.artifacts) {
      assert(++artifactCount <= CENSUS_LIMITS.artifacts && shape(a, ['artifact_id', 'artifact_revision', 'manifest',
        'expected_rows', 'first_ordinal', 'last_ordinal', 'window', 'missing_inputs'])
        && /^rart_[a-z0-9]{1,64}$(?![\s\S])/.test(a.artifact_id) && count(a.artifact_revision) && a.artifact_revision > 0
        && !artifactIds.has(a.artifact_id), 'CENSUS_ARTIFACT_INVALID');
      artifactIds.add(a.artifact_id);
      assert(shape(a.manifest, ['path', 'sha256', 'bytes']) && safeRelative(a.manifest.path)
        && a.manifest.path.endsWith('/manifest.json') && HASH.test(a.manifest.sha256)
        && count(a.manifest.bytes) && a.manifest.bytes > 0 && a.manifest.bytes <= CENSUS_LIMITS.manifest_bytes
        && !paths.has(a.manifest.path), 'CENSUS_MANIFEST_PIN_INVALID');
      paths.add(a.manifest.path);
      assert(count(a.expected_rows) && a.expected_rows > 0 && a.expected_rows <= CENSUS_LIMITS.rows
        && a.first_ordinal === 0 && a.last_ordinal === a.expected_rows - 1, 'CENSUS_ORDINAL_BOUNDS_INVALID');
      const w = a.window;
      assert(shape(w, ['kind', 'start_ms', 'end_ms', 'expected_observations'])
        && ['IS', 'OOS', 'HOLDOUT', 'FULL_SAMPLE'].includes(w.kind) && count(w.start_ms) && count(w.end_ms)
        && w.start_ms < w.end_ms && w.end_ms <= input.cutoff_ms && count(w.expected_observations)
        && w.expected_observations > 0 && w.expected_observations <= a.expected_rows, 'CENSUS_WINDOW_INVALID');
      assert(!windows.some(other => w.start_ms < other.end_ms && other.start_ms < w.end_ms), 'CENSUS_RUN_WINDOWS_OVERLAP');
      windows.push(w);
      assert(Array.isArray(a.missing_inputs) && a.missing_inputs.length <= INPUTS.length
        && new Set(a.missing_inputs.map(v => v?.input)).size === a.missing_inputs.length
        && a.missing_inputs.every(v => shape(v, ['input', 'reason_code', 'source_locator'])
          && INPUTS.includes(v.input) && CODE.test(v.reason_code) && text(v.source_locator)), 'CENSUS_MISSING_INPUT_INVALID');
    }
  }
  const directories = [...paths].map(path => dirname(path));
  assert(!directories.some((path, index) => directories.slice(0, index)
    .some(other => path.startsWith(`${other}/`) || other.startsWith(`${path}/`))), 'CENSUS_CUSTODY_ROOTS_OVERLAP');
  return input;
}

function noSymlinks(path) {
  const absolute = resolve(path); let current = absolute.startsWith('/') ? '/' : dirname(absolute);
  for (const part of absolute.split('/').filter(Boolean)) {
    current = join(current, part);
    assert(!lstatSync(current).isSymbolicLink(), 'CENSUS_SYMLINK_FORBIDDEN');
  }
  return absolute;
}
function readBoundedJson(path, maximumBytes) {
  const safe = noSymlinks(path), fd = openSync(safe, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    assert(stat.isFile() && stat.size > 0 && stat.size <= maximumBytes, 'CENSUS_INVENTORY_BYTE_LIMIT');
    const buffer = Buffer.alloc(stat.size + 1); let length = 0, read;
    while ((read = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += read;
    const bytes = buffer.subarray(0, length);
    assert(bytes.length === stat.size && fstatSync(fd).size === stat.size, 'CENSUS_INVENTORY_CHANGED');
    const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return { input, inventory_sha256: censusSha256(bytes) };
  } finally { closeSync(fd); }
}
export function readCensusInventory(path) {
  const loaded = readBoundedJson(path, CENSUS_LIMITS.inventory_bytes);
  validateCensusInput(loaded.input); return loaded;
}
export function calibrationExtractionRequest(input, root) {
  validateCensusInput(input);
  assert(text(root) && isAbsolute(root) && resolve(root) === root && root !== '/', 'CENSUS_ROOT_INVALID');
  return { root, inventory: input, limits: CENSUS_LIMITS };
}

/** Actual subprocess extractor is the default. Injection is a unit-test seam,
 * never a CLI option and never independent source/approval evidence. */
export function extractParquetCensus({ root, input, python = 'python3' }) {
  const safeRoot = noSymlinks(root);
  assert(lstatSync(safeRoot).isDirectory() && realpathSync(safeRoot) === safeRoot, 'CENSUS_ROOT_INVALID');
  const helper = readFileSync(helperPath);
  const result = spawnSync(python, ['-I', '-B', helperPath], { encoding: 'utf8', timeout: CENSUS_LIMITS.timeout_ms,
    maxBuffer: CENSUS_LIMITS.output_bytes, input: JSON.stringify(calibrationExtractionRequest(input, safeRoot)),
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONNOUSERSITE: '1',
      OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', ARROW_NUM_THREADS: '1' } });
  if (result.error || result.signal || result.status !== 0) {
    const code = (result.stderr ?? '').trim();
    fail(CODE.test(code) ? code : 'CENSUS_PARQUET_EXTRACTION_FAILED');
  }
  assert(censusSha256(readFileSync(helperPath)) === censusSha256(helper), 'CENSUS_EXTRACTOR_CHANGED');
  const receipt = JSON.parse(result.stdout);
  assert(receipt.extractor_sha256 === censusSha256(helper), 'CENSUS_EXTRACTOR_HASH_MISMATCH');
  return receipt;
}

export function buildCalibrationCensus(input, { root, python, extractor = extractParquetCensus } = {}) {
  validateCensusInput(input);
  const extracted = extractor({ root, input, python });
  const expected = input.runs.flatMap(run => run.artifacts.map(artifact => ({ run, artifact })));
  assert(shape(extracted, ['schema_version', 'artifacts', 'verified_source_bytes', 'extractor_sha256', 'inventory_content_sha256', 'custody_root'])
    && extracted.schema_version === 'portal.elp2-10.parquet-census.v1' && HASH.test(extracted.extractor_sha256)
    && extracted.inventory_content_sha256 === censusSha256(canonical(input))
    && text(extracted.custody_root) && isAbsolute(extracted.custody_root)
    && (root === undefined || extracted.custody_root === resolve(root))
    && count(extracted.verified_source_bytes) && extracted.verified_source_bytes <= CENSUS_LIMITS.total_source_bytes
    && Array.isArray(extracted.artifacts) && extracted.artifacts.length === expected.length, 'CENSUS_EXTRACTOR_INVALID');
  const byId = new Map();
  for (const row of extracted.artifacts) {
    assert(object(row) && !byId.has(row.artifact_id), 'CENSUS_EXTRACTOR_DUPLICATE'); byId.set(row.artifact_id, row);
  }
  const observations = [];
  for (const { run, artifact: a } of expected) {
    const row = byId.get(a.artifact_id);
    assert(object(row) && row.run_id === run.run_id && row.artifact_revision === a.artifact_revision
      && row.manifest_sha256 === a.manifest.sha256 && row.rows === a.expected_rows
      && row.first_ordinal === a.first_ordinal && row.last_ordinal === a.last_ordinal
      && row.window_rows === a.window.expected_observations && count(row.first_at_ms) && count(row.last_at_ms)
      && row.first_at_ms >= a.window.start_ms && row.last_at_ms < a.window.end_ms && row.first_at_ms <= row.last_at_ms
      && HASH.test(row.observation_values_sha256), 'CENSUS_EXTRACTOR_BINDING_MISMATCH');
    const supplied = new Map(a.missing_inputs.map(v => [v.input, v]));
    observations.push({ run_id: run.run_id, artifact_id: a.artifact_id, artifact_revision: a.artifact_revision,
      manifest_sha256: row.manifest_sha256, observation_values_sha256: row.observation_values_sha256,
      window: a.window, retained_rows: row.rows, window_rows: row.window_rows,
      first_at_ms: row.first_at_ms, last_at_ms: row.last_at_ms,
      source_kind: run.evidence_domain, domain_source_locator: run.domain_source_locator,
      domain_verification: 'DECLARED_NOT_INDEPENDENTLY_VERIFIED',
      missing_inputs: INPUTS.map(name => supplied.get(name) ?? { input: name,
        reason_code: 'NOT_VERIFIED_BY_CUSTODY_CENSUS', source_locator: a.manifest.path }) });
  }
  const horizon = new Map();
  for (const row of observations) {
    const key = `${row.source_kind}:${row.window.kind}:${row.window.end_ms - row.window.start_ms}`;
    const item = horizon.get(key) ?? { evidence_domain: row.source_kind, window_kind: row.window.kind,
      duration_ms: row.window.end_ms - row.window.start_ms, run_ids: new Set(), artifact_count: 0, observations: 0 };
    item.run_ids.add(row.run_id); item.artifact_count += 1; item.observations += row.window_rows; horizon.set(key, item);
  }
  const runCensus = input.runs.map(run => ({ run_id: run.run_id, alpha_id: run.alpha_id,
    alpha_version_id: run.alpha_version_id, status: run.status, evidence_domain: run.evidence_domain,
    selection: run.selection, exclusion_reason: run.exclusion_reason }));
  const limitations = ['EXPLICIT_INVENTORY_NOT_INDEPENDENT_POPULATION_CENSUS', 'NO_RUNTIME_CALIBRATION_OR_APPROVAL',
    'CUSTODY_AND_COUNTS_DO_NOT_PROVE_CALENDAR_COST_OR_ECONOMIC_OWNERSHIP',
    'FILE_MANIFEST_NOT_RUNTIME_DATABASE_SEAL_OR_AUTHORITY_PROOF',
    'DECLARED_SOURCE_DOMAIN_NOT_FORWARD_EVIDENCE_PROOF', 'DECLARED_ALPHA_CURRENCY_BASIS_NOT_SOURCE_VERIFIED',
    'NO_CALIBRATION_PARAMETERS_OR_SCORE_INFERRED'];
  if (input.runs.some(run => run.evidence_domain === 'HISTORICAL_RESEARCH')) limitations.push('RETROSPECTIVE_RESEARCH_NOT_FORWARD_AS_PUBLISHED');
  if (input.scope.environment === 'research') limitations.push('RESEARCH_INPUT_NOT_RUNTIME_SCOPE');
  if (input.scope.currency === null) limitations.push('SOURCE_CURRENCY_NOT_PUBLISHED');
  if (input.scope.comparable_basis_id === null) limitations.push('SOURCE_COMPARABLE_BASIS_NOT_PUBLISHED');
  if (input.runs.some(run => run.evidence_domain === 'SYNTHETIC')) limitations.push('SYNTHETIC_INPUT_NOT_EMPIRICAL_CALIBRATION');
  if (new Set(input.runs.map(run => run.evidence_domain)).size > 1) limitations.push('MIXED_DOMAINS_NOT_A_COMPARABLE_CALIBRATION_SET');
  if (observations.some((row, index) => observations.slice(0, index).some(other => other.run_id !== row.run_id
    && other.window.start_ms < row.window.end_ms && row.window.start_ms < other.window.end_ms)))
    limitations.push('OVERLAPPING_RUN_WINDOWS_NOT_INDEPENDENT_EPISODES');
  return { schema_version: 'portal.elp2-10.calibration-census.v1', status: observations.length
    ? (input.scope.environment === 'research' ? 'RESEARCH_INPUT_NOT_RUNTIME_SCOPE'
      : 'CUSTODY_VERIFIED_CALIBRATION_INPUTS_UNRESOLVED') : 'NO_INCLUDED_RETAINED_ARTIFACTS',
    snapshot_id: input.snapshot_id, cutoff_ms: input.cutoff_ms, scope: structuredClone(input.scope),
    inventory_content_sha256: censusSha256(canonical(input)), extractor_sha256: extracted.extractor_sha256,
    custody_root: extracted.custody_root,
    population: { ...input.population, run_ids_sha256: censusSha256(canonical([...runCensus.map(r => r.run_id)].sort())),
      included: runCensus.filter(r => r.selection === 'INCLUDED').length,
      excluded: runCensus.filter(r => r.selection === 'EXCLUDED').length, independently_verified_complete: false },
    run_census: runCensus, verified_source_bytes: extracted.verified_source_bytes,
    verified_artifacts: structuredClone(observations), horizon_coverage: [...horizon.values()]
      .map(({ run_ids, ...row }) => ({ ...row, run_count: run_ids.size }))
      .sort((a, b) => canonical(a).localeCompare(canonical(b))),
    limitations, runtime_authorized: false, capacity_certified: false, calibration_approved: false };
}

export function calibrationCensusCli(args = process.argv.slice(2)) {
  const options = {};
  for (const arg of args) {
    const match = /^--(root|inventory|python|output|prepare-extractor|extraction|extraction-sha256)=(.+)$/.exec(arg);
    assert(match && !Object.hasOwn(options, match[1]), 'CENSUS_ARGUMENT_INVALID'); options[match[1]] = match[2];
  }
  assert(options.root && options.inventory, 'CENSUS_EXPLICIT_INPUT_REQUIRED');
  const { input, inventory_sha256 } = readCensusInventory(options.inventory);
  if (options['prepare-extractor']) {
    assert(options['prepare-extractor'] === 'true' && !options.output && !options.extraction
      && !options['extraction-sha256'] && !options.python, 'CENSUS_ARGUMENT_INVALID');
    process.stdout.write(JSON.stringify(calibrationExtractionRequest(input, resolve(options.root))) + '\n'); return;
  }
  if (options.extraction || options['extraction-sha256']) {
    assert(options.extraction && HASH.test(options['extraction-sha256']) && !options.python, 'CENSUS_EXTRACTION_PIN_REQUIRED');
    const captured = readBoundedJson(options.extraction, CENSUS_LIMITS.output_bytes);
    assert(captured.inventory_sha256 === options['extraction-sha256'], 'CENSUS_EXTRACTION_RECEIPT_HASH_MISMATCH');
    assert(captured.input.extractor_sha256 === censusSha256(readFileSync(helperPath)), 'CENSUS_EXTRACTOR_HASH_MISMATCH');
    options.extractor = () => captured.input;
  }
  const result = buildCalibrationCensus(input, options); result.inventory_sha256 = inventory_sha256;
  if (options.extraction) result.extraction_receipt_sha256 = options['extraction-sha256'];
  const encoded = JSON.stringify(result, null, 2) + '\n';
  assert(Buffer.byteLength(encoded) <= CENSUS_LIMITS.output_bytes, 'CENSUS_OUTPUT_BYTE_LIMIT');
  if (options.output) {
    const parent = noSymlinks(dirname(resolve(options.output))), output = resolve(options.output);
    assert(relative(parent, output) && !isAbsolute(relative(parent, output)), 'CENSUS_OUTPUT_PATH_INVALID');
    // Protect all custody, even if someone chose a misleading new output name.
    const sourceRoot = options.extraction ? resolve(options.root) : realpathSync(options.root), rel = relative(sourceRoot, output);
    assert(rel.startsWith('..' + '/') || isAbsolute(rel), 'CENSUS_OUTPUT_WITHIN_SOURCE_ROOT');
    writeFileSync(output, encoded, { flag: 'wx', mode: 0o600 });
  } else process.stdout.write(encoded);
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { calibrationCensusCli(); } catch (error) {
    console.error(CODE.test(error?.message ?? '') ? error.message : 'CENSUS_INPUT_OR_CUSTODY_INVALID'); process.exitCode = 1;
  }
}
