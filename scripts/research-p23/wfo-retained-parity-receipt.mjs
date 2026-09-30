#!/usr/bin/env node
/** Read-only P23 receipt: sealed WFO Parquet -> retained DB seal -> owner BFF. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, ownerClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';

const RUN_RECEIPT = 'run-w07-single-2-20260929.json';
const KINDS = { candidates: 'CANDIDATE', folds: 'FOLD', observations: 'OBSERVATION', selection: 'SELECTION', trials: 'TRIAL' };
const PYTHON = String.raw`
import hashlib, json, pathlib, sys
import pyarrow.parquet as parquet
source = json.loads(sys.stdin.read())
run_id, artifact_id = source['run_id'], source['artifact_id']
assert run_id.startswith('rrun_') and run_id.replace('_','').isalnum()
assert artifact_id.startswith('rart_') and artifact_id.replace('_','').isalnum()
path = pathlib.Path('/var/lib/portal/artifacts/runs/durable-store/research-retained/artifacts') / artifact_id
manifest_bytes = (path / 'manifest.json').read_bytes()
manifest = json.loads(manifest_bytes)
assert manifest['run_id'] == run_id and manifest['artifact_id'] == artifact_id
counts = {}
parts = 0
for table in manifest['tables']:
    rows = 0
    for part in table['parts']:
        relative = pathlib.PurePosixPath(part['relative_path'])
        assert not relative.is_absolute() and '..' not in relative.parts
        blob = (path / relative).read_bytes()
        assert len(blob) == part['bytes'] and hashlib.sha256(blob).hexdigest() == part['sha256'], 'PARQUET_PART_HASH_MISMATCH'
        assert parquet.read_metadata(path / relative).num_rows == part['rows'], 'PARQUET_ROW_COUNT_MISMATCH'
        rows += part['rows']
        parts += 1
    assert rows == table['rows'], 'MANIFEST_TABLE_COUNT_MISMATCH'
    counts[table['table_kind']] = rows
assert sum(counts.values()) == manifest['totals']['rows'], 'MANIFEST_TOTAL_COUNT_MISMATCH'
document = next(d for d in manifest['documents'] if d['name'] == 'current_source_summary')
relative = pathlib.PurePosixPath(document['relative_path'])
assert not relative.is_absolute() and '..' not in relative.parts
summary_bytes = (path / relative).read_bytes()
assert len(summary_bytes) == document['bytes'] and hashlib.sha256(summary_bytes).hexdigest() == document['sha256'], 'SUMMARY_HASH_MISMATCH'
print(json.dumps({'manifest_sha256': hashlib.sha256(manifest_bytes).hexdigest(), 'table_rows': counts,
                  'total_rows': manifest['totals']['rows'], 'part_count': parts,
                  'summary_sha256': document['sha256'], 'summary': json.loads(summary_bytes)}))
`;

export function compareWfoRetainedParity(runId, seal, artifact, source, api) {
  assert.equal(artifact.state, 'SEALED', 'ARTIFACT_NOT_SEALED');
  assert.equal(api.run_id, runId, 'BFF_RUN_MISMATCH');
  assert.equal(api.availability?.state, 'AVAILABLE', 'BFF_NOT_AVAILABLE');
  assert.equal(api.read_authority, 'PORTAL_RETAINED_CURRENT_SOURCE', 'BFF_AUTHORITY_DRIFT');
  assert.equal(source.manifest_sha256, artifact.manifest_digest, 'ARTIFACT_MANIFEST_HASH_MISMATCH');
  assert.equal(source.manifest_sha256, seal.manifest_digest, 'SEAL_MANIFEST_HASH_MISMATCH');
  assert.deepEqual(seal.summary, source.summary, 'RETAINED_SUMMARY_DIFF');
  for (const [kind, dbKind] of Object.entries(KINDS)) {
    assert.equal(source.table_rows[kind], seal.table_rows[dbKind], `${dbKind}_SEAL_COUNT_DIFF`);
    assert.equal(source.table_rows[kind], Number(artifact.table_rows[dbKind] ?? 0), `${dbKind}_DATABASE_COUNT_DIFF`);
    assert.equal(source.table_rows[kind], api.passport.artifact_table_rows[kind], `${dbKind}_BFF_COUNT_DIFF`);
  }
  assert.equal(source.total_rows, Number(seal.total_rows), 'SEAL_TOTAL_COUNT_DIFF');
  assert.equal(source.total_rows, Number(artifact.total_rows), 'ARTIFACT_TOTAL_COUNT_DIFF');
  for (const metric of ['initial_equity', 'final_equity', 'net_return_fraction', 'max_drawdown_fraction']) {
    assert.equal(source.summary.metrics[metric], api.passport[metric], `${metric}_BFF_VALUE_DIFF`);
  }
  assert.equal(api.provenance?.source_manifest_digest, source.manifest_sha256, 'BFF_MANIFEST_PIN_DIFF');
  assert.equal(api.provenance?.retained_import_digest, seal.retained_import_digest, 'BFF_IMPORT_PIN_DIFF');
  assert.equal(api.provenance?.source_transform_digest, seal.source_transform_digest, 'BFF_TRANSFORM_PIN_DIFF');
  return { table_rows: source.table_rows, total_rows: source.total_rows, part_count: source.part_count,
    exact_metrics: ['initial_equity', 'final_equity', 'net_return_fraction', 'max_drawdown_fraction'] };
}

export async function wfoRetainedParityReceipt(home = DEFAULT_HOME) {
  home = validateHome(home);
  const run = privateJson(join(home, RUN_RECEIPT));
  assert.equal(run.project, PROJECT);
  assert.equal(run.profile, 'wfo');
  assert.equal(run.final?.body?.current?.effective_status, 'COMPLETED');
  const runId = run.run_id;
  assert(/^rrun_[a-z0-9]+$/.test(runId));
  const seals = dbQuery('SELECT * FROM research.current_source_seals_v1 WHERE run_id=$1', [runId]).rows;
  const artifacts = dbQuery('SELECT artifact_id,artifact_revision,state,manifest_digest,total_rows FROM research.artifacts WHERE run_id=$1', [runId]).rows;
  assert.equal(seals.length, 1, 'ONE_WFO_SEAL_REQUIRED');
  assert.equal(artifacts.length, 1, 'ONE_WFO_ARTIFACT_REQUIRED');
  const seal = seals[0], artifact = artifacts[0];
  assert.equal(String(seal.artifact_revision), String(artifact.artifact_revision));
  assert(/^rart_[a-z0-9]+$/.test(artifact.artifact_id));
  const source = JSON.parse(docker(['exec', '-i', container('portal-api'), 'python', '-c', PYTHON],
    JSON.stringify({ run_id: runId, artifact_id: artifact.artifact_id })));
  const api = (await (await ownerClient(home)).call('GET', `/api/v1/quantbt/runs/${runId}/current-source/evidence`)).body;
  const compared = compareWfoRetainedParity(runId, seal, { ...artifact, table_rows: dbQuery(
    `SELECT table_kind,count(*) AS count FROM research.current_source_rows_v1 WHERE run_id=$1 AND artifact_revision=$2 GROUP BY table_kind`,
    [runId, Number(seal.artifact_revision)]).rows.reduce((counts, row) => ({ ...counts, [row.table_kind]: row.count }), {}) }, source, api);
  const receipt = { schema_version: 'research.p23-wfo-retained-parity.v1', project: PROJECT, base_url: BASE_URL,
    run_id: runId, tested_at_utc: new Date().toISOString(), identity: privateJson(join(home, 'identity.json')),
    artifact_id: artifact.artifact_id, artifact_revision: Number(seal.artifact_revision),
    manifest_sha256: source.manifest_sha256, summary_sha256: source.summary_sha256,
    retained_import_digest: seal.retained_import_digest, bff_revision: api.revision,
    scope: 'ONE_REAL_WFO_SEALED_PARQUET_TO_DB_TO_OWNER_BFF_NOT_DIRECT_ENGINE_RECOMPUTATION',
    compared, passed: true };
  const path = join(home, 'v11-p23-wfo-retained-parity.json');
  savePrivate(path, receipt);
  console.log(`V11-P23-DR WFO retained subset PASS; receipt sha256:${createHash('sha256').update(JSON.stringify(receipt, null, 2) + '\n').digest('hex')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  wfoRetainedParityReceipt(process.argv.find(arg => arg.startsWith('--home='))?.slice(7) ?? DEFAULT_HOME)
    .catch(error => { console.error('V11-P23-DR WFO retained refused:', error.message); process.exitCode = 1; });
}
