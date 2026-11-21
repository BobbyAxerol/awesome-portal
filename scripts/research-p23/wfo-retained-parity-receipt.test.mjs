import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareWfoRetainedParity } from './wfo-retained-parity-receipt.mjs';

const runId = 'rrun_owned';
function fixture() {
  const metrics = { initial_equity: '20000', final_equity: '19926.50808204798',
    net_return_fraction: '-0.003674595897601', max_drawdown_fraction: '-0.006740604275658146' };
  const tableRows = { CANDIDATE: 1, FOLD: 2, OBSERVATION: 1056, SELECTION: 1, TRIAL: 3 };
  return {
    seal: { manifest_digest: 'a'.repeat(64), retained_import_digest: 'b'.repeat(64),
      source_transform_digest: 'c'.repeat(64), table_rows: tableRows, total_rows: 1063,
      summary: { metrics } },
    artifact: { state: 'SEALED', manifest_digest: 'a'.repeat(64), table_rows: { ...tableRows }, total_rows: 1063 },
    source: { manifest_sha256: 'a'.repeat(64), table_rows: { candidates: 1, folds: 2,
      observations: 1056, selection: 1, trials: 3 }, total_rows: 1063, part_count: 10,
      summary: { metrics } },
    api: { run_id: runId, availability: { state: 'AVAILABLE' },
      read_authority: 'PORTAL_RETAINED_CURRENT_SOURCE',
      passport: { artifact_table_rows: { candidates: 1, folds: 2, observations: 1056,
        selection: 1, trials: 3 }, ...metrics },
      provenance: { source_manifest_digest: 'a'.repeat(64), retained_import_digest: 'b'.repeat(64),
        source_transform_digest: 'c'.repeat(64) } },
  };
}
function compare(value) { return compareWfoRetainedParity(runId, value.seal, value.artifact, value.source, value.api); }

test('sealed WFO artifact, retained seal and owner BFF agree exactly', () => {
  assert.equal(compare(fixture()).total_rows, 1063);
});
test('refuses a missing or changed retained part count', () => {
  const value = fixture(); value.artifact.table_rows.OBSERVATION = 1055;
  assert.throws(() => compare(value), /OBSERVATION_DATABASE_COUNT_DIFF/);
});
test('refuses a changed BFF decimal, even with unchanged row counts', () => {
  const value = fixture(); value.api.passport.final_equity = '19926.50808204799';
  assert.throws(() => compare(value), /final_equity_BFF_VALUE_DIFF/);
});
test('refuses foreign, absent or wrong-authority BFF truth', () => {
  const value = fixture(); value.api.run_id = 'rrun_foreign';
  assert.throws(() => compare(value), /BFF_RUN_MISMATCH/);
  value.api.run_id = runId; value.api.availability.state = 'NOT_PUBLISHED';
  assert.throws(() => compare(value), /BFF_NOT_AVAILABLE/);
  value.api.availability.state = 'AVAILABLE'; value.api.read_authority = 'FIXTURE';
  assert.throws(() => compare(value), /BFF_AUTHORITY_DRIFT/);
});
test('refuses a manifest or retained import pin drift', () => {
  const value = fixture(); value.seal.manifest_digest = 'd'.repeat(64);
  assert.throws(() => compare(value), /SEAL_MANIFEST_HASH_MISMATCH/);
  value.seal.manifest_digest = 'a'.repeat(64); value.api.provenance.retained_import_digest = 'd'.repeat(64);
  assert.throws(() => compare(value), /BFF_IMPORT_PIN_DIFF/);
});
