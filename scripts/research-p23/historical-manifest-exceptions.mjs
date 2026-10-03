/** Owner-approved accounting for exactly three lost disposable-test manifests. */
import assert from 'node:assert/strict';
import { PROJECT } from './cell.mjs';

export const HISTORICAL_TEST_MANIFEST_LOSSES = Object.freeze([
  ['rart_0a356b7ee5c8e6f85ebeeb9ca416c1a347229b0f', 'rrun_1690a9830787332de93d93d457c8aa0e',
    '56c8b524678fadc63d9dd6c03b3c566197648a3a7699828fa75d00a3cdd17039'],
  ['rart_64469653604a37d46833ed048ba75c1d7e864b60', 'rrun_e2c3a4d31decb9f5d77b77fe49616fdb',
    '1a19fbcd9a32ebe38b1a87267060eb1441e59ba2dcfb1ecdb9f96fd3cd626866'],
  ['rart_830fa0d721d3817db2c4881b54c1cd84fa3306a0', 'rrun_c93896666b0f3f1647aaa4967ce8c792',
    '1bec68a3dee37597557a42fa10a0af5b258e09a516a7367dcd4e92363be47a53'],
].map(([artifact_id, run_id, expected_manifest_digest]) => Object.freeze({
  artifact_id, run_id, expected_manifest_digest, artifact_revision: 1,
  workspace_id: 'ws_06GE6XY0SKNPFS7TP8WCE938Z5', expected_part_records: 10,
})));
export const REQUIRED_REFERENCE_COUNTS = Object.freeze(['retention_refs', 'retained_seals',
  'report_manifests', 'rc_packs', 'rc_publications', 'promotion_picks', 'selections', 'exposures', 'audit_children']);
// The old runs DO have one retained DB seal and one frozen Report each.
// Account for those copies explicitly; they are not proof of lost Parquet
// custody. No new seal/Report or governance/retention dependency is exempted.
export const EXPECTED_HISTORICAL_REFERENCE_COUNTS = Object.freeze(Object.fromEntries(
  REQUIRED_REFERENCE_COUNTS.map(key => [key, key === 'retained_seals' || key === 'report_manifests' ? 1 : 0]),
));

export function assessHistoricalManifestExceptions(project, assessment, database) {
  assert.equal(project, PROJECT, 'EXCEPTIONS_ARE_FOR_THE_OWNED_TEST_CELL_ONLY');
  assert.equal(assessment.verified_artifacts > 0, true, 'NONEMPTY_VERIFIED_POPULATION_REQUIRED');
  const actual = assessment.missing_manifests;
  assert.equal(actual?.length, HISTORICAL_TEST_MANIFEST_LOSSES.length, 'EXACT_HISTORICAL_MISSING_SET_REQUIRED');
  assert.equal(database.artifacts.length,assessment.verified_artifacts+actual.length,'COMPLETE_SEALED_POPULATION_REQUIRED');
  const details = HISTORICAL_TEST_MANIFEST_LOSSES.map(expected => {
    const matches = actual.filter(row => row.artifact_id === expected.artifact_id);
    assert.equal(matches.length, 1, 'UNIQUE_HISTORICAL_MISSING_ID_REQUIRED');
    assert.equal(matches[0].state, 'MISSING');
    assert.equal(matches[0].expected_manifest_digest, expected.expected_manifest_digest, 'HISTORICAL_DIGEST_DRIFT_REFUSED');
    const artifact = database.artifacts.find(row => row.artifact_id === expected.artifact_id);
    assert(artifact && artifact.workspace_id === expected.workspace_id && artifact.run_id === expected.run_id
      && Number(artifact.artifact_revision) === expected.artifact_revision
      && artifact.manifest_digest === expected.expected_manifest_digest, 'HISTORICAL_BINDING_DRIFT_REFUSED');
    assert.equal(database.parts.filter(row => row.artifact_id === expected.artifact_id).length,
      expected.expected_part_records, 'HISTORICAL_PART_RECORD_DRIFT_REFUSED');
    const references = database.artifact_links?.find(row => row.artifact_id === expected.artifact_id);
    assert(references && REQUIRED_REFERENCE_COUNTS.every(key => references[key] === EXPECTED_HISTORICAL_REFERENCE_COUNTS[key]),
      'REFERENCED_OR_UNATTESTED_LOSS_CANNOT_BE_EXEMPTED');
    return { ...expected, state: 'MISSING', recovered: false,
      retained_db_copies_are_not_artifact_byte_proof: true, references };
  });
  // This closes exception accounting, never full-store integrity. The strict
  // receipt and default CLI still fail; no DB state/bytes/digest is repaired.
  return { schema_version: 'research.p23-historical-test-loss.v1',
    project, authority: 'BOBBY_APPROVED_2026_10_03_EXACT_TEST_LOSS_ACCOUNTING',
    state: 'EXACT_HISTORICAL_EXCEPTION_ACCOUNTED', exception_accounting_passed: true,
    scoped_verified_population_passed: true, full_store_integrity_passed: false,
    byte_recovery_performed: false, details };
}
