import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertLegacyDrSchemaSafe, LEGACY_DR_SCHEMA_PROBE, restoreLegacyCoreGuarded} from './legacy-dr-guard.mjs';

test('legacy DR accepts only an explicitly verified pre-Execution-V2 schema', () => {
  let seen;
  assert.doesNotThrow(() => assertLegacyDrSchemaSafe(sql => {
    seen = sql;
    return {rows:[{has_execution_v2_authority:false,has_execution_v2_migration:false}]};
  }));
  assert.equal(seen, LEGACY_DR_SCHEMA_PROBE);
  // The candidate installer is independent of numbered migrations; its
  // namespace alone is enough to make the legacy custody barrier unsafe.
  for (const namespace of ['elp210_candidate', 'portal_local_write_fence', 'portal_restore_authority',
    'portal_restore_original_custody', 'elp210_c2_']) assert.ok(seen.includes(namespace));
  assert.match(seen, /left\(nspname, 10\) = 'elp210_c2_'/);
});

test('legacy DR refuses new schema, migration-only, unknown and failed probes', () => {
  for (const result of [
    {rows:[{has_execution_v2_authority:true,has_execution_v2_migration:true}]},
    {rows:[{has_execution_v2_authority:true,has_execution_v2_migration:false}]},
    {rows:[{has_execution_v2_authority:false,has_execution_v2_migration:true}]},
    {rows:[{has_execution_v2_authority:null,has_execution_v2_migration:false}]},
    {rows:[]}, {rows:[{},{}]}, undefined,
  ]) assert.throws(() => assertLegacyDrSchemaSafe(() => result), /UDB04_DR_LEGACY_AUTHORITY_BARRIER_UNSUPPORTED/);
  assert.throws(() => assertLegacyDrSchemaSafe(() => { throw new Error('PROBE_FAILED'); }), /PROBE_FAILED/);
});

test('each core archive is checked after restore, before legacy cutover can continue', () => {
  const events=[];
  let v2=false;
  const verify=()=>{events.push('verify');assertLegacyDrSchemaSafe(()=>({rows:[{
    has_execution_v2_authority:v2,has_execution_v2_migration:false,
  }]}));};
  restoreLegacyCoreGuarded(()=>events.push('restore-legacy'),verify);
  assert.deepEqual(events,['verify','restore-legacy','verify']);
  events.length=0;
  assert.throws(()=>restoreLegacyCoreGuarded(()=>{events.push('restore-v2');v2=true;},verify),
    /UDB04_DR_LEGACY_AUTHORITY_BARRIER_UNSUPPORTED/);
  assert.deepEqual(events,['verify','restore-v2','verify']);
  events.length=0;
  assert.throws(()=>restoreLegacyCoreGuarded(()=>events.push('must-not-restore'),verify),
    /UDB04_DR_LEGACY_AUTHORITY_BARRIER_UNSUPPORTED/);
  assert.deepEqual(events,['verify']);
  v2=false;events.length=0;
  assert.throws(()=>restoreLegacyCoreGuarded(()=>{events.push('restore-failed');throw new Error('RESTORE_FAILED');},verify),
    /RESTORE_FAILED/);
  assert.deepEqual(events,['verify','restore-failed']);
});
