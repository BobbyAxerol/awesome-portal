/** Wire validation is not a replacement for the 63 actual product receipts. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import {describe,it,expect} from 'vitest';
const root=join(__dirname,'..');
const fixture=JSON.parse(readFileSync(join(root,'fixtures/research-full06-percent-equity-public.valid.json'),'utf8'));
function validator(file:string,name:string){
  const schemas=JSON.parse(readFileSync(join(root,'openapi/'+file+'.openapi.json'),'utf8')).components.schemas;
  return new Ajv2020({allErrors:true,strict:false}).compile(JSON.parse(JSON.stringify({...schemas[name],$defs:schemas})
    .replaceAll('#/components/schemas/','#/$defs/')));
}
describe('FULL06 exact percent-equity public contracts',()=>{
  it('does not label percentage allocation as currency or silently accept a cost override',()=>{
    const valid=validator('research-run-setup','Profile');
    expect(valid(fixture.profile),JSON.stringify(valid.errors)).toBe(true);
    expect(fixture.profile).toMatchObject({execution_route:'pct_equity',account_model:'QUANTBT_PERCENT_EQUITY_V1',
      account:{allocation_unit:'EQUITY_FRACTION',alloc_per_trade:0.1,slippage:0,funding_enabled:false}});
    for(const change of [{alloc_per_trade:2000},{allocation_unit:'NOTIONAL'},{slippage:0.0001},{funding_enabled:true}])
      expect(valid({...fixture.profile,account:{...fixture.profile.account,...change}})).toBe(false);
    const {account,...missingAccount}=fixture.profile;
    const {account_model,...missingModel}=fixture.profile;
    expect(valid(missingAccount)).toBe(false);expect(valid(missingModel)).toBe(false);
    const {account:ignoredAccount,account_model:ignoredModel,...missingBoth}=fixture.profile;
    expect(valid(missingBoth)).toBe(false);
    expect(valid({...fixture.profile,execution_route:'signal_notional'})).toBe(false);
  });
  it('binds all 63 exact route/source pairs without changing the old notional source pairs',()=>{
    const table=JSON.parse(readFileSync(join(root,'../../apps/portal/registry/research-execution-recipes.v1.json'),'utf8'));
    const rows=table.recipes.filter((r:any)=>r.descriptor.schema_version==='research.full06-delta-profile.v1');
    expect(rows).toHaveLength(63);expect(table.recipes).toHaveLength(161);
    const valid=validator('research-current-source','Provenance');
    for(const row of rows)expect(valid({...fixture.provenance,...row.descriptor.current_source}),JSON.stringify(valid.errors)).toBe(true);
    expect(valid({...fixture.provenance,profile_id:'full06.guessed.v1'})).toBe(false);
    expect(readFileSync(join(root,'generated/research-run-setup.d.ts'),'utf8')).toContain('QUANTBT_PERCENT_EQUITY_V1');
  });
  it('publishes the new immutable account model in Atlas, not generic permission to run any route',()=>{
    const schemas=JSON.parse(readFileSync(join(root,'openapi/research-foundation.openapi.json'),'utf8')).components.schemas;
    expect(JSON.stringify(schemas.PortalAdmission)).toContain('QUANTBT_PERCENT_EQUITY_V1');
    expect(fixture.stage4_binding.pairs).toEqual({params:'MATCH',bundle:'MATCH'});
  });
});
