/** Public fixture validation, independent of product/activation proof. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import {describe,it,expect} from 'vitest';
const root=join(__dirname,'..');
const value=JSON.parse(readFileSync(join(root,'fixtures/research-full05-imported-public.valid.json'),'utf8'));
function validator(file:string,name:string){
  const schemas=JSON.parse(readFileSync(join(root,'openapi/'+file+'.openapi.json'),'utf8')).components.schemas;
  return new Ajv2020({allErrors:true,strict:false}).compile(JSON.parse(JSON.stringify({...schemas[name],$defs:schemas})
    .replaceAll('#/components/schemas/','#/$defs/')));
}
describe('FULL05 imported public typed contracts',()=>{
  it('carries a real declared-search profile without changing fixed-import policy',()=>{
    expect(value.scope).toBe('SANITIZED_PUBLIC_CONTRACT_FIXTURE_NOT_ACTIVATION_PROOF');
    const valid=validator('research-run-setup','Profile');
    expect(valid(value.profile),JSON.stringify(valid.errors)).toBe(true);
    expect(value.profile.parameter_policy).toBe('DECLARED_SEARCH_WITH_PINS');
    expect(valid({...value.profile,parameter_policy:'ARBITRARY_PYTHON_EXECUTION'})).toBe(false);
  });
  it('binds both append-only sets of 27 imported profile/source pairs and refuses invented pairs',()=>{
    const table=JSON.parse(readFileSync(join(root,'../../apps/portal/registry/research-execution-recipes.v1.json'),'utf8'));
    const rows=table.recipes.filter((r:any)=>r.adapter_kind==='IMPORTED_SEARCH');expect(rows).toHaveLength(54);
    expect(rows.filter((r:any)=>r.descriptor.schema_version==='research.full05-imported-profile.v1')).toHaveLength(27);
    expect(rows.filter((r:any)=>r.descriptor.schema_version==='research.expanded-trial-profile.v1')).toHaveLength(27);
    const valid=validator('research-current-source','Provenance');
    for(const row of rows)expect(valid({...value.provenance,...row.descriptor.current_source}),JSON.stringify(valid.errors)).toBe(true);
    expect(valid({...value.provenance,...rows[0].descriptor.current_source,
      profile_id:rows[27].descriptor.current_source.profile_id})).toBe(false);
    expect(valid({...value.provenance,profile_id:'full05.guessed.v1'})).toBe(false);
  });
  it('labels a source-code digest as source bytes, not as an adapter digest or parameter list',()=>{
    const valid=validator('research-current-source','ParameterAuthority');
    expect(valid(value.parameter_authority),JSON.stringify(valid.errors)).toBe(true);
    expect(value.parameter_authority.code_fixed).toMatchObject({state:'NOT_PUBLISHED',hash_scope:'SOURCE_CODE_SHA256',
      code_digest:value.source_digest,values:[]});
    expect(valid({...value.parameter_authority,code_fixed:{...value.parameter_authority.code_fixed,hash_scope:'GUESSED_CODE_VALUES'}})).toBe(false);
    expect(readFileSync(join(root,'generated/research-run-setup.d.ts'),'utf8')).toContain('DECLARED_SEARCH_WITH_PINS');
  });
});
