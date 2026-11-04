import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertLegacyDrSchemaSafe, LEGACY_DR_SCHEMA_PROBE} from './legacy-dr-guard.mjs';

test('legacy DR accepts only an explicitly verified pre-Execution-V2 schema', () => {
  let seen;
  assert.doesNotThrow(() => assertLegacyDrSchemaSafe(sql => {
    seen = sql;
    return {rows:[{has_execution_v2_authority:false,has_execution_v2_migration:false}]};
  }));
  assert.equal(seen, LEGACY_DR_SCHEMA_PROBE);
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
