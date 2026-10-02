import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFreshRestoreTarget, assertRestoreParity, assessRestoredArtifacts, globalsForFreshPortalDatabase, restoreVolumes, CONSTRAINT_INVENTORY_SQL } from './restore-receipt.mjs';

test('restore refuses shared, original, nonempty or non-mounted database targets',()=>{
  const label='test-copy',v=restoreVolumes(label);
  const mounts=[{Name:v.db,Destination:'/var/lib/postgresql/data'}];
  assertFreshRestoreTarget(v.db,label,mounts,0);
  assert.throws(()=>restoreVolumes('../stable'));
  assert.throws(()=>assertFreshRestoreTarget('portal-research-p23-ol12_portal-postgres-data',label,mounts,0));
  assert.throws(()=>assertFreshRestoreTarget(v.db,label,[],0));
  assert.throws(()=>assertFreshRestoreTarget(v.db,label,mounts,1));
});
test('globals preserve role grants but never copy a password or re-create initdb role',()=>{
  const raw='CREATE ROLE portal;\nALTER ROLE portal WITH SUPERUSER LOGIN;\nCREATE ROLE portal_research_runtime;\nGRANT portal_research_runtime TO portal;\n';
  const result=globalsForFreshPortalDatabase(raw);
  assert(!result.includes('CREATE ROLE portal;'));
  assert(result.includes('CREATE ROLE portal_research_runtime;'));
  assert(result.includes('GRANT portal_research_runtime TO portal;'));
  assert.throws(()=>globalsForFreshPortalDatabase(raw+"ALTER ROLE portal PASSWORD 'secret';"));
  assert.throws(()=>globalsForFreshPortalDatabase('CREATE ROLE unexpected;'));
});
test('restore compares all data/auth/roles/schema/sequence bytes, not just artifact counts',()=>{
  const before={data:[{table:'public.portal_users',sha256:'a'}],roles:['portal'],parts:['part']};
  assertRestoreParity(before,structuredClone(before));
  assert.throws(()=>assertRestoreParity(before,{...before,data:[{table:'public.portal_users',sha256:'b'}]}));
  assert.throws(()=>assertRestoreParity(before,{...before,roles:[]}));
});
test('restore uses fixed source images, sequential capped utility, private backups and no volume deletion',()=>{
  const code=readFileSync(new URL('./restore-receipt.mjs',import.meta.url),'utf8');
  assert(code.includes("'--memory', '350000000'"));
  assert(code.includes("'--memory-swap', '350000000'"));
  assert(code.includes("'--no-build','--no-deps'"));
  assert(code.includes("'--no-role-passwords'"));
  assert(!code.includes("['volume','rm'"));
  assert(!code.includes("'--volumes'"));
  assert(code.includes("receipt.restored_worker_off=true"));
  assert(code.includes('ORDER BY schema,table_name,type_name,name,definition'));
  assert(code.includes('LEFT JOIN pg_class t ON t.oid=c.conrelid'));
  assert(code.includes('c.convalidated,c.condeferrable,c.condeferred'));
});
test('CHECK restore equivalence is source parser roundtrip, not term stripping or ignored constraints',()=>{
  assert(CONSTRAINT_INVENTORY_SQL.includes('CREATE TEMP TABLE p23_check_parser (LIKE %I.%I)'));
  assert(CONSTRAINT_INVENTORY_SQL.includes('ADD CONSTRAINT p23_check_parser_fact %s'));
  assert(CONSTRAINT_INVENTORY_SQL.includes('pg_get_constraintdef'));
  assert(CONSTRAINT_INVENTORY_SQL.includes('convalidated'));
  assert(!CONSTRAINT_INVENTORY_SQL.includes('CREATE TABLE research.'));
  assert(!CONSTRAINT_INVENTORY_SQL.includes('UPDATE '));
});
test('preserved pre-existing missing manifests never turn full restore integrity green',()=>{
  const healthy={tree_sha256:'a',verified:[{artifact_id:'a'}],missing_manifests:[]};
  assert.equal(assessRestoredArtifacts(healthy,structuredClone(healthy)).passed,true);
  const partial={...healthy,missing_manifests:[{artifact_id:'b',state:'MISSING',expected_manifest_digest:'b'}]};
  const result=assessRestoredArtifacts(partial,structuredClone(partial));
  assert.equal(result.passed,false);
  assert.equal(result.all_sealed_artifacts_verified,false);
  assert.equal(result.verified_artifacts,1);
  assert.deepEqual(result.missing_manifests,partial.missing_manifests);
  assert.throws(()=>assessRestoredArtifacts(partial,healthy));
  assert.throws(()=>assessRestoredArtifacts(partial,{...partial,tree_sha256:'changed'}));
  assert.throws(()=>assessRestoredArtifacts({verified:[]},{verified:[]}));
  const code=readFileSync(new URL('./restore-receipt.mjs',import.meta.url),'utf8');
  assert(code.includes('recordMissingManifests=false'));
  assert(code.includes('--record-partial-missing-manifests'));
  assert(code.includes('receipt.passed=receipt.artifact_assessment.passed'));
  assert(code.includes('if(!receipt?.passed)process.exitCode=1'));
});
