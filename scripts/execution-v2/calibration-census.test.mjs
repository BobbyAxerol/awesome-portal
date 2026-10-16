import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCalibrationCensus, CENSUS_LIMITS, censusSha256, extractParquetCensus,
  calibrationExtractionRequest, readCensusInventory, validateCensusInput } from './calibration-census.mjs';

// All data below is synthetic isolated custody data, not calibration evidence.
const here = dirname(fileURLToPath(import.meta.url));
const projectPython = resolve(here, '../../apps/portal/.venv/bin/python');
const python = process.env.PORTAL_RESEARCH_PYTHON ?? (existsSync(projectPython) ? projectPython : 'python3');
const arrowProbe = spawnSync(python, ['-I', '-B', '-c', 'import pyarrow'], { encoding: 'utf8', timeout: 10_000 });
// Sandboxed EPERM is NOT evidence that pyarrow is absent and must never turn
// the actual helper tests into silent skips or a false file-level runner PASS.
if (arrowProbe.error && arrowProbe.error.code !== 'ENOENT') throw arrowProbe.error;
const hasArrow = !arrowProbe.error && arrowProbe.status === 0;
function fixture() {
  return { schema_version: 'portal.elp2-10.calibration-census-input.v1', snapshot_id: 'synthetic-census', cutoff_ms: 10_000,
    scope: { workspace_id: 'synthetic-workspace', environment: 'paper', profile_id: 'synthetic-paper',
      catalogue_digest: censusSha256('synthetic-catalogue'), currency: 'USDT', comparable_basis_id: 'synthetic-basis' },
    population: { source_locator: 'synthetic run inventory including failures', expected_runs: 2 }, runs: [
      { run_id: 'rrun_unit', alpha_id: 'synthetic-alpha', alpha_version_id: 'av_synthetic', status: 'COMPLETED',
        evidence_domain: 'HISTORICAL_RESEARCH', domain_source_locator: 'synthetic historical QuantBT run',
        selection: 'INCLUDED', exclusion_reason: null, artifacts: [{ artifact_id: 'rart_unit', artifact_revision: 1,
          manifest: { path: 'one/rart_unit/manifest.json', sha256: censusSha256('synthetic manifest'), bytes: 100 },
          expected_rows: 4, first_ordinal: 0, last_ordinal: 3,
          window: { kind: 'OOS', start_ms: 1000, end_ms: 5000, expected_observations: 4 },
          missing_inputs: [{ input: 'cash_reference', reason_code: 'SOURCE_CASH_PATH_NOT_PUBLISHED', source_locator: 'P05.OBSERVATION' }] }] },
      { run_id: 'rrun_failed', alpha_id: 'synthetic-alpha', alpha_version_id: 'av_synthetic', status: 'FAILED',
        evidence_domain: 'HISTORICAL_RESEARCH', domain_source_locator: 'synthetic failed run inventory',
        selection: 'EXCLUDED', exclusion_reason: 'FAILED_RUN_HAS_NO_SEALED_ACCOUNT', artifacts: [] },
    ] };
}
function syntheticExtractor({ input, root = '/explicit/readonly/retained' }) {
  const canonical = v => JSON.stringify(Array.isArray(v) ? v.map(x => JSON.parse(canonical(x)))
    : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, JSON.parse(canonical(v[k]))])) : v);
  return { schema_version: 'portal.elp2-10.parquet-census.v1', extractor_sha256: censusSha256('synthetic injected extractor'),
    inventory_content_sha256: censusSha256(canonical(input)),
    custody_root: root,
    verified_source_bytes: 100, artifacts: input.runs.flatMap(run => run.artifacts.map(a => ({ run_id: run.run_id,
      artifact_id: a.artifact_id, artifact_revision: a.artifact_revision, manifest_sha256: a.manifest.sha256,
      rows: a.expected_rows, first_ordinal: a.first_ordinal, last_ordinal: a.last_ordinal,
      window_rows: a.window.expected_observations, first_at_ms: a.window.start_ms, last_at_ms: a.window.end_ms - 1,
      observation_values_sha256: censusSha256('synthetic source observations') }))) };
}
test('census retains excluded failures, exact scope, horizons and every unresolved input; never approval', () => {
  const input = fixture(), report = buildCalibrationCensus(input, { extractor: syntheticExtractor });
  assert.equal(report.population.included, 1); assert.equal(report.population.excluded, 1);
  assert.equal(report.run_census[1].exclusion_reason, 'FAILED_RUN_HAS_NO_SEALED_ACCOUNT');
  assert.equal(report.verified_artifacts[0].missing_inputs[0].reason_code, 'SOURCE_CASH_PATH_NOT_PUBLISHED');
  assert.equal(report.verified_artifacts[0].missing_inputs.length, 8);
  assert.deepEqual(report.horizon_coverage, [{ evidence_domain: 'HISTORICAL_RESEARCH', window_kind: 'OOS',
    duration_ms: 4000, artifact_count: 1, observations: 4, run_count: 1 }]);
  assert.deepEqual(report.scope, input.scope);
  assert.equal(report.population.independently_verified_complete, false);
  for (const key of ['runtime_authorized', 'capacity_certified', 'calibration_approved']) assert.equal(report[key], false);
  assert(report.limitations.includes('RETROSPECTIVE_RESEARCH_NOT_FORWARD_AS_PUBLISHED'));
  assert.equal(Object.hasOwn(report, 'anchors'), false); assert.equal(Object.hasOwn(report, 'score'), false);
});
test('rejects malformed, over-limit and duplicate population rather than silently omitting it', () => {
  for (const change of [i => { i.population.expected_runs = 1; }, i => { i.runs.push(i.runs[0]); i.population.expected_runs++; },
    i => { i.runs[0].status = 'FAILED'; }, i => { i.runs[1].exclusion_reason = null; },
    i => { i.runs = Array(CENSUS_LIMITS.runs + 1).fill(i.runs[0]); i.population.expected_runs = i.runs.length; },
    i => { i.runtime_approved = true; }]) {
    const input = fixture(); change(input); assert.throws(() => validateCensusInput(input), /CENSUS_/);
  }
});
test('historical Research stays outside runtime scope and preserves unpublished currency/basis', () => {
  const input = fixture(); input.scope.environment = 'research';
  input.scope.currency = null; input.scope.comparable_basis_id = null;
  const report = buildCalibrationCensus(input, { extractor: syntheticExtractor });
  assert.equal(report.status, 'RESEARCH_INPUT_NOT_RUNTIME_SCOPE');
  assert.equal(report.scope.environment, 'research');
  assert.equal(report.scope.currency, null); assert.equal(report.scope.comparable_basis_id, null);
  assert(report.limitations.includes('SOURCE_CURRENCY_NOT_PUBLISHED'));
  assert(report.limitations.includes('SOURCE_COMPARABLE_BASIS_NOT_PUBLISHED'));
  assert.equal(report.runtime_authorized, false);
  input.scope.environment = 'paper';
  assert.throws(() => validateCensusInput(input), /CENSUS_SCOPE_INVALID/);
});
test('rejects unsafe paths, unsupported schemas, invalid decimals metadata and ordinal bounds', () => {
  for (const path of ['/etc/manifest.json', '../rart_unit/manifest.json', 'one/../manifest.json', 'one//manifest.json',
    'one/./manifest.json', 'one\\manifest.json']) {
    const input = fixture(); input.runs[0].artifacts[0].manifest.path = path;
    assert.throws(() => validateCensusInput(input), /CENSUS_MANIFEST_PIN_INVALID/);
  }
  for (const change of [a => { a.first_ordinal = 1; }, a => { a.last_ordinal = 4; },
    a => { a.manifest.bytes = CENSUS_LIMITS.manifest_bytes + 1; }, a => { a.window.end_ms = 10001; },
    a => { a.missing_inputs.push({ input: 'cash_reference', reason_code: 'DUPLICATE', source_locator: 'unit' }); }]) {
    const input = fixture(); change(input.runs[0].artifacts[0]); assert.throws(() => validateCensusInput(input), /CENSUS_/);
  }
});
test('overlapping same-run windows and nested custody roots are rejected', () => {
  const input = fixture(), a = structuredClone(input.runs[0].artifacts[0]);
  a.artifact_id = 'rart_other'; a.manifest.path = 'two/rart_other/manifest.json'; input.runs[0].artifacts.push(a);
  assert.throws(() => validateCensusInput(input), /CENSUS_RUN_WINDOWS_OVERLAP/);
  const second = structuredClone(input.runs[0]); second.run_id = 'rrun_other'; second.artifacts = [a];
  a.manifest.path = 'one/rart_unit/child/rart_other/manifest.json'; input.runs[0].artifacts.pop();
  input.runs.push(second); input.population.expected_runs++;
  assert.throws(() => validateCensusInput(input), /CENSUS_CUSTODY_ROOTS_OVERLAP/);
});
test('different real experiments with overlapping windows remain censused but not independent episodes', () => {
  const input = fixture(), run = structuredClone(input.runs[0]); run.run_id = 'rrun_other';
  run.artifacts[0].artifact_id = 'rart_other'; run.artifacts[0].manifest.path = 'two/rart_other/manifest.json';
  input.runs.push(run); input.population.expected_runs++;
  const report = buildCalibrationCensus(input, { extractor: syntheticExtractor });
  assert(report.limitations.includes('OVERLAPPING_RUN_WINDOWS_NOT_INDEPENDENT_EPISODES'));
  assert.equal(report.horizon_coverage[0].run_count, 2);
});
test('mixed claimed domains and synthetic inputs are never promoted or merged as comparable evidence', () => {
  const input = fixture(); input.runs[1].evidence_domain = 'SYNTHETIC';
  const report = buildCalibrationCensus(input, { extractor: syntheticExtractor });
  assert(report.limitations.includes('MIXED_DOMAINS_NOT_A_COMPARABLE_CALIBRATION_SET'));
  assert(report.limitations.includes('SYNTHETIC_INPUT_NOT_EMPIRICAL_CALIBRATION'));
  assert.equal(report.verified_artifacts[0].domain_verification, 'DECLARED_NOT_INDEPENDENTLY_VERIFIED');
});
test('extractor output must match every original pin, population and window', () => {
  for (const change of [r => { r.artifacts = []; }, r => { r.artifacts[0].manifest_sha256 = censusSha256('wrong'); },
    r => { r.artifacts[0].window_rows--; }, r => { r.artifacts[0].first_at_ms = 0; },
    r => { r.artifacts[0].run_id = 'rrun_wrong'; }, r => { r.verified_source_bytes = CENSUS_LIMITS.total_source_bytes + 1; },
    r => { r.inventory_content_sha256 = censusSha256('different cutoff or population'); }]) {
    assert.throws(() => buildCalibrationCensus(fixture(), { extractor: args => { const r = syntheticExtractor(args); change(r); return r; } }), /CENSUS_/);
  }
});
test('inventory loader is byte-bounded and forbids symlinks', t => {
  const root = mkdtempSync(join(tmpdir(), 'elp210-census-inventory-')); t.after(() => rmSync(root, { recursive: true }));
  const input = fixture(), path = join(root, 'inventory.json'); writeFileSync(path, JSON.stringify(input));
  assert.equal(readCensusInventory(path).inventory_sha256, censusSha256(readFileSync(path)));
  const link = join(root, 'link.json'); symlinkSync(path, link);
  assert.throws(() => readCensusInventory(link), /CENSUS_SYMLINK_FORBIDDEN/);
  writeFileSync(path, Buffer.alloc(CENSUS_LIMITS.inventory_bytes + 1));
  assert.throws(() => readCensusInventory(path), /CENSUS_INVENTORY_BYTE_LIMIT/);
});
test('split-environment request and exact receipt pins work without importing pyarrow or granting authority', t => {
  const root = mkdtempSync(join(tmpdir(), 'elp210-census-split-')); t.after(() => rmSync(root, { recursive: true }));
  const input = fixture(), inventory = join(root, 'input.json'); writeFileSync(inventory, JSON.stringify(input));
  const args = [join(here, 'calibration-census.mjs'), '--root=/explicit/readonly/retained', `--inventory=${inventory}`];
  const prepare = spawnSync(process.execPath, [...args, '--prepare-extractor=true'], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(prepare.error);
  assert.equal(prepare.status, 0, prepare.stderr);
  assert.deepEqual(JSON.parse(prepare.stdout), calibrationExtractionRequest(input, '/explicit/readonly/retained'));
  // Synthetic extractor receipt: unit plumbing only, never a real Parquet result.
  const receipt = syntheticExtractor({ input });
  receipt.extractor_sha256 = censusSha256(readFileSync(join(here, 'calibration-census-parquet.py')));
  const capture = join(root, 'capture.json'); writeFileSync(capture, JSON.stringify(receipt));
  const extra = [`--extraction=${capture}`, `--extraction-sha256=${censusSha256(readFileSync(capture))}`];
  const consume = spawnSync(process.execPath, [...args, ...extra], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(consume.error);
  assert.equal(consume.status, 0, consume.stderr);
  const report = JSON.parse(consume.stdout); assert.equal(report.calibration_approved, false);
  assert.equal(report.extraction_receipt_sha256, censusSha256(readFileSync(capture)));
  const wrong = spawnSync(process.execPath, [...args, `--extraction=${capture}`, `--extraction-sha256=${censusSha256('wrong')}`],
    { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(wrong.error);
  assert.equal(wrong.status, 1); assert.match(wrong.stderr, /CENSUS_EXTRACTION_RECEIPT_HASH_MISMATCH/);
  input.cutoff_ms++; writeFileSync(inventory, JSON.stringify(input));
  const stale = spawnSync(process.execPath, [...args, ...extra], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(stale.error);
  assert.equal(stale.status, 1); assert.match(stale.stderr, /CENSUS_EXTRACTOR_INVALID/);
});

// Actual Parquet extraction, when an existing approved Python environment is
// available. No Docker/load/dependency install. A skip is not an integration PASS.
const PARQUET_FIXTURE = String.raw`
import hashlib,json,pathlib,sys
import pyarrow as pa
import pyarrow.parquet as pq
root=pathlib.Path(sys.argv[1]);base=root/'one'/'rart_unit';base.mkdir(parents=True)
rows=[{'source_ordinal':i,'at_utc_ms':1000+i*1000,'equity':str(100+i),'return_fraction':'0.01'} for i in range(4)]
pq.write_table(pa.Table.from_pylist(rows),base/'observations.parquet',row_group_size=2,compression='zstd')
pq.write_table(pa.Table.from_pylist([{'trial_id':'source-trial'}]),base/'trials.parquet',compression='zstd')
tables=[]
for kind,count in [('observations',4),('trials',1)]:
 p=base/(kind+'.parquet');blob=p.read_bytes();part={'table_kind':kind,'part_ordinal':1,'relative_path':p.name,'sha256':hashlib.sha256(blob).hexdigest(),'rows':count,'bytes':len(blob),'sequence_min':0,'sequence_max':count-1}
 tables.append({'table_kind':kind,'schema_version':'research.current-source-observations.v1' if kind=='observations' else 'synthetic-trials.v1','sequence_column':'source_ordinal','rows':count,'bytes':len(blob),'parts':[part]})
doc=b'{"synthetic":true}';(base/'summary.json').write_bytes(doc)
manifest={'schema_version':'research.artifact-manifest.v1','workspace_id':'synthetic-workspace','run_id':'rrun_unit','artifact_id':'rart_unit','artifact_revision':1,'completed_at':'1970-01-01T00:00:06+00:00','tables':tables,'documents':[{'name':'summary','relative_path':'summary.json','sha256':hashlib.sha256(doc).hexdigest(),'bytes':len(doc)}],'totals':{'rows':5,'bytes':sum(t['bytes'] for t in tables)+len(doc)}}
blob=json.dumps(manifest,separators=(',',':')).encode();(base/'manifest.json').write_bytes(blob)
print(json.dumps({'path':'one/rart_unit/manifest.json','sha256':'sha256:'+hashlib.sha256(blob).hexdigest(),'bytes':len(blob)}))
`;
function realFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'elp210-census-parquet-')); t.after(() => rmSync(root, { recursive: true }));
  const setup = spawnSync(python, ['-I', '-B', '-c', PARQUET_FIXTURE, root], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(setup.error);
  assert.equal(setup.status, 0, setup.stderr);
  const input = fixture(); input.runs[0].artifacts[0].manifest = JSON.parse(setup.stdout);
  return { root, input, base: join(root, 'one/rart_unit') };
}
function repin(input, base, manifest) {
  const path = join(base, 'manifest.json'); writeFileSync(path, JSON.stringify(manifest));
  const bytes = readFileSync(path); input.runs[0].artifacts[0].manifest = {
    path: 'one/rart_unit/manifest.json', sha256: censusSha256(bytes), bytes: bytes.length };
}
test('actual pyarrow verifies all original parts/documents and streams source values', { skip: !hasArrow }, t => {
  const { root, input } = realFixture(t), report = buildCalibrationCensus(input, { root, python });
  assert.equal(report.verified_artifacts[0].window_rows, 4);
  assert.equal(report.verified_artifacts[0].first_at_ms, 1000); assert.equal(report.verified_artifacts[0].last_at_ms, 4000);
  assert(report.verified_source_bytes > input.runs[0].artifacts[0].manifest.bytes);
  assert.equal(report.extractor_sha256, censusSha256(readFileSync(join(here, 'calibration-census-parquet.py'))));
});
test('canonical P05 writer seals 1-based parts accepted by the actual census helper', { skip: !hasArrow }, t => {
  const root = mkdtempSync(join(tmpdir(), 'elp210-census-p05-writer-'));
  t.after(() => rmSync(root, { recursive: true }));
  const program = String.raw`
import hashlib,importlib.util,json,pathlib,sys
from datetime import datetime,UTC
sys.path.insert(0,sys.argv[2])
import pyarrow as pa
# Load the canonical dependency-light writer file directly. Importing the
# services package would start unrelated strategy registry discovery; no fake
# writer or stubbed domain module replaces the source implementation here.
spec=importlib.util.spec_from_file_location('calibration_census_p05_writer',pathlib.Path(sys.argv[2])/'portal_api/services/research_artifacts.py')
module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
ArtifactFence,ArtifactIdentity,ArtifactSchemaRegistry,ArtifactTableSchema,ResearchArtifactStore=(getattr(module,name) for name in ('ArtifactFence','ArtifactIdentity','ArtifactSchemaRegistry','ArtifactTableSchema','ResearchArtifactStore'))
root=pathlib.Path(sys.argv[1]);digest=hashlib.sha256(b'synthetic-p05-writer').hexdigest()
schema=pa.schema([('source_ordinal',pa.int64()),('at_utc_ms',pa.int64()),('equity',pa.string()),('return_fraction',pa.string())])
store=ResearchArtifactStore(root,clock=lambda:datetime.fromtimestamp(6,UTC))
identity=ArtifactIdentity('rart_unit',1,'synthetic-workspace','rrun_unit','synthetic-engine','synthetic-build',digest,digest,digest)
fence=ArtifactFence('synthetic-workspace','rrun_unit','synthetic-attempt',1)
writer=store.begin_write(identity=identity,fence=fence,schema_registry=ArtifactSchemaRegistry([ArtifactTableSchema('observations','research.current-source-observations.v2',schema,sequence_column='source_ordinal')]),fence_validator=lambda _:True)
for start in (0,2):
 rows=[{'source_ordinal':i,'at_utc_ms':1000+i*1000,'equity':str(100+i),'return_fraction':'0.01'} for i in range(start,start+2)]
 writer.append_batch('observations',pa.RecordBatch.from_pylist(rows,schema=schema))
writer.write_small_document('summary',{'synthetic':True})
writer.seal()
path=root/'artifacts/rart_unit/manifest.json';blob=path.read_bytes();manifest=json.loads(blob)
assert [p['part_ordinal'] for p in manifest['tables'][0]['parts']]==[1,2]
print(json.dumps({'path':'artifacts/rart_unit/manifest.json','sha256':'sha256:'+hashlib.sha256(blob).hexdigest(),'bytes':len(blob)}))
`;
  const setup = spawnSync(python, ['-I', '-B', '-c', program, root,
    resolve(here, '../../apps/portal/backend/src')], { encoding: 'utf8', timeout: 10_000 });
  assert.ifError(setup.error); assert.equal(setup.status, 0, setup.stderr);
  const input = fixture(); input.runs[0].artifacts[0].manifest = JSON.parse(setup.stdout);
  const report = buildCalibrationCensus(input, { root, python });
  assert.equal(report.verified_artifacts[0].retained_rows, 4);
  assert.equal(report.verified_artifacts[0].window_rows, 4);
});
test('actual custody rejects hash/size drift even in a non-observation part or document', { skip: !hasArrow }, t => {
  const { root, input, base } = realFixture(t);
  for (const filename of ['trials.parquet', 'summary.json']) {
    const path = join(base, filename), bytes = readFileSync(path), corrupt = Buffer.from(bytes); corrupt[0] ^= 1;
    writeFileSync(path, corrupt);
    assert.throws(() => extractParquetCensus({ root, input, python }), /CENSUS_SOURCE_HASH_MISMATCH/);
    writeFileSync(path, bytes);
  }
});
test('actual custody rejects symlinks and hardlink aliases', { skip: !hasArrow }, t => {
  const { root, input, base } = realFixture(t), file = join(base, 'trials.parquet'), bytes = readFileSync(file);
  const outside = join(root, 'outside.parquet'); writeFileSync(outside, bytes); rmSync(file); symlinkSync(outside, file);
  assert.throws(() => extractParquetCensus({ root, input, python }), /CENSUS_SYMLINK_FORBIDDEN/);
  rmSync(file); writeFileSync(file, bytes);
  const manifest = JSON.parse(readFileSync(join(base, 'manifest.json')));
  linkSync(join(base, 'observations.parquet'), join(base, 'alias.parquet'));
  manifest.tables[1].parts[0] = { ...manifest.tables[0].parts[0], table_kind: 'trials', relative_path: 'alias.parquet' };
  repin(input, base, manifest);
  assert.throws(() => extractParquetCensus({ root, input, python }), /CENSUS_CUSTODY_FILE_ALIAS/);
});
test('actual custody rejects ordinal, count, cutoff and manifest scope conflicts', { skip: !hasArrow }, t => {
  const { root, input, base } = realFixture(t), original = JSON.parse(readFileSync(join(base, 'manifest.json')));
  for (const [change, code] of [
    [m => { m.tables[0].parts[0].part_ordinal = 0; }, 'CENSUS_PART_SEQUENCE_INVALID'],
    [m => { m.tables[0].parts[0].sequence_min = 1; }, 'CENSUS_PART_ORDINAL_MISMATCH'],
    [m => { m.workspace_id = 'another-workspace'; }, 'CENSUS_MANIFEST_BINDING_MISMATCH'],
    [m => { m.completed_at = '1970-01-02T00:00:00+00:00'; }, 'CENSUS_SOURCE_NOT_AVAILABLE_AT_CUTOFF'],
    [m => { m.tables[0].parts[0].rows = 5; }, 'CENSUS_PARQUET_COUNT_MISMATCH'],
    [m => { m.tables[0].parts[0].relative_path = '../escape.parquet'; }, 'CENSUS_CUSTODY_PATH_INVALID'],
  ]) {
    const manifest = structuredClone(original); change(manifest); repin(input, base, manifest);
    assert.throws(() => extractParquetCensus({ root, input, python }), new RegExp(code));
  }
});
test('CLI emits only explicit private output, never overwrites source or existing report', { skip: !hasArrow }, t => {
  const { root, input } = realFixture(t), directory = mkdtempSync(join(tmpdir(), 'elp210-census-output-'));
  t.after(() => rmSync(directory, { recursive: true }));
  const inventory = join(directory, 'inventory.json'); writeFileSync(inventory, JSON.stringify(input));
  const output = join(directory, 'report.json');
  const args = [join(here, 'calibration-census.mjs'), `--root=${root}`, `--inventory=${inventory}`, `--python=${python}`];
  const run = spawnSync(process.execPath, [...args, `--output=${output}`], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout, '');
  assert.equal(JSON.parse(readFileSync(output)).calibration_approved, false);
  const retry = spawnSync(process.execPath, [...args, `--output=${output}`], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(retry.error);
  assert.equal(retry.status, 1);
  const unsafe = spawnSync(process.execPath, [...args, `--output=${join(root, 'new-report.json')}`], { encoding: 'utf8', timeout: 15_000 });
  assert.ifError(unsafe.error);
  assert.equal(unsafe.status, 1); assert.match(unsafe.stderr, /CENSUS_OUTPUT_WITHIN_SOURCE_ROOT/);
  assert.equal(existsSync(join(root, 'new-report.json')), false);
});
