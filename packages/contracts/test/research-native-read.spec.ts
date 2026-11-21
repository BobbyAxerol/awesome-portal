import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import {describe,it,expect} from 'vitest';
const root=resolve(__dirname,'..');
describe('Native retained read contracts / real P05 candidate fixtures',()=>{
 for(const [api,name,type] of [['research-search','search','NativeSearch'],['research-freeze','freeze','NativeFreeze'],['research-report','report','NativeReport']]){
  it(`${name} canonical public DTO matches OpenAPI and generated type`,()=>{
   const doc=JSON.parse(readFileSync(resolve(root,`openapi/${api}.openapi.json`),'utf8'));
   const defs=JSON.parse(JSON.stringify(doc.components.schemas).replaceAll('#/components/schemas/','#/$defs/'));
   const validate=new Ajv2020({strict:false,allErrors:true,unicodeRegExp:false}).compile({$defs:defs,$ref:`#/$defs/${type}`});
   const value=JSON.parse(readFileSync(resolve(root,`fixtures/research-native-${name}.valid.json`),'utf8'));
   expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
   expect(readFileSync(resolve(root,`generated/${api}.d.ts`),'utf8')).toContain(`${type}:`);
   expect(JSON.stringify(value)).not.toMatch(/lease_token|worker_attempt_id|source_path|private_key/);
   if(name==='search'){
    expect(value.ledger.rows).toHaveLength(100);expect(value.selected_trial_number).toBe(41);
    expect(value.selected_trial_ordinal).toBe(42);expect(value.selection_process.retained_source_metadata.medoid_trial_number).toBe(41);
    expect(doc.paths['/api/v1/quantbt/runs/{runId}/search'].get.parameters.map(p=>p.name)).toContain('native_cursor');
   }
   if(name==='report'){
    expect(value.windows).toHaveLength(3);expect(value.kind).toBe('NATIVE_OPTIMIZED');
    expect(validate({...value,windows:value.windows.slice(0,2)})).toBe(false);
   }
  });
 }
});
