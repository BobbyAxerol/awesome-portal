import assert from 'node:assert/strict';
import test from 'node:test';
import { HISTORICAL_TEST_MANIFEST_LOSSES as losses, EXPECTED_HISTORICAL_REFERENCE_COUNTS, assessHistoricalManifestExceptions } from './historical-manifest-exceptions.mjs';
import { PROJECT } from './cell.mjs';

function fixture() {
  return { assessment: { verified_artifacts: 1, missing_manifests: losses.map(row => ({ artifact_id: row.artifact_id,
    expected_manifest_digest: row.expected_manifest_digest, state: 'MISSING' })) }, database: {
    artifacts: [...losses.map(row => ({ ...row, manifest_digest: row.expected_manifest_digest })),{artifact_id:'healthy'}],
    parts: losses.flatMap(row => Array.from({ length: 10 }, () => ({ artifact_id: row.artifact_id }))),
    artifact_links: losses.map(row => ({ artifact_id: row.artifact_id, ...EXPECTED_HISTORICAL_REFERENCE_COUNTS })),
  } };
}
test('exact historical exception accounting never claims recovery or full-store integrity', () => {
  const input = fixture(); const before = structuredClone(input);
  const result = assessHistoricalManifestExceptions(PROJECT,input.assessment,input.database);
  assert.equal(result.exception_accounting_passed,true);
  assert.equal(result.full_store_integrity_passed,false);
  assert.equal(result.byte_recovery_performed,false);
  assert.equal(result.details.length,3);
  assert.deepEqual(input,before);
});
test('extra, missing, duplicate, altered-digest and foreign-cell exceptions fail closed', () => {
  for(const mutate of [
    x=>x.assessment.missing_manifests.push({...x.assessment.missing_manifests[0],artifact_id:'new_loss'}),
    x=>x.assessment.missing_manifests.pop(),
    x=>x.assessment.missing_manifests[1]={...x.assessment.missing_manifests[0]},
    x=>x.assessment.missing_manifests[0].expected_manifest_digest='a'.repeat(64),
    x=>x.database.artifacts[0].run_id='another_run',
    x=>x.database.artifacts[0].artifact_revision=2,
    x=>x.database.parts.pop(),
    x=>x.database.artifact_links[0].retention_refs=1,
    x=>x.database.artifact_links[0].rc_packs=1,
    x=>x.database.artifact_links[0].retained_seals=2,
    x=>x.database.artifact_links[0].report_manifests=0,
    x=>delete x.database.artifact_links,
    x=>delete x.database.artifact_links[0].audit_children,
    x=>x.assessment.verified_artifacts=0,
  ]) { const x=fixture();mutate(x);assert.throws(()=>assessHistoricalManifestExceptions(PROJECT,x.assessment,x.database)); }
  const x=fixture();assert.throws(()=>assessHistoricalManifestExceptions('production',x.assessment,x.database));
});
