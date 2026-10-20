import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {describe,expect,it} from 'vitest';
import {scopedManagerResponseSchema} from '../../../apps/control-api/src/manager-lists/scoped-manager.contract';
// RV-12 / BE-P14: the canonical scoped scenarios and refusals. The positive pages are the real reader's answers (control-api spec
// elp2-manager-scoped-fixtures.spec.ts); here every page is judged again by the published schema AND the producer's validator, and each negative is
// judged exactly as the generator recorded it.
const load=(name:string)=>JSON.parse(readFileSync(new URL(`../fixtures/${name}`,import.meta.url),'utf8'));
const schema=JSON.parse(readFileSync(new URL('../schemas/execution-manager-scoped.v1.schema.json',import.meta.url),'utf8'));
const scenarios=load('execution-manager-scoped.scenarios.synthetic.valid.json'),bounded=load('execution-manager-scoped.bounded.synthetic.valid.json'),
  refusals=load('execution-manager-scoped.refusals.synthetic.negative.json');
const ajv=new Ajv2020({strict:false,allErrors:true});ajv.addSchema(schema);
const validate=ajv.getSchema(`${schema.$id}#/$defs/ManagerScopedResponse`)!;
const pages=[...scenarios.scenarios,...bounded.scenarios].flatMap((s:any)=>s.pages.map((p:any,i:number)=>[`${s.id} page ${i+1}`,p.response] as const));
const find=(id:string)=>scenarios.scenarios.find((s:any)=>s.id===id);
const apply=(base:any,ops:any[])=>{
  const value=structuredClone(base);
  for(const {op,path,value:next} of ops){
    const parent=path.slice(0,-1).reduce((node:any,key:any)=>node[key],value),last=path.at(-1);
    if(op==='set')parent[last]=next;else delete parent[last];
  }
  return value;
};

describe('RV-12 canonical scoped scenarios',()=>{
  it('are the synthetic lane and name every dimension once',()=>{
    for(const file of [scenarios,bounded,refusals])expect(file.lane).toBe('TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT');
    expect(scenarios.scenarios.map((s:any)=>s.id)).toEqual(['portfolios-owner-all','bindings-owner-live','binding-detail-owner-live','fleet-researcher-paper',
      'fleet-owner-paper-chain','fleet-researcher-all-pending-unrecorded','fleet-researcher-all-denied-unavailable']);
    expect(bounded.scenarios.map((s:any)=>s.id)).toEqual(['portfolios-grid-bounded']);
    expect(new Set([...scenarios.scenarios,...bounded.scenarios].map((s:any)=>s.request.surface))).toEqual(new Set(['PORTFOLIOS','BINDINGS','BINDING_DETAIL','ALPHA_FLEET']));
  });
  it.each(pages)('%s validates against the schema and the producer validator',(_name,response)=>{
    expect(validate(response),ajv.errorsText(validate.errors)).toBe(true);
    expect(scopedManagerResponseSchema.safeParse(response).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(1048576-16384);
  });
  it('every environment disposition vocabulary the producer can emit is published once',()=>{
    expect(scenarios.dispositions_covered).toEqual({PARTIAL:['AUTHORIZED_RETAINED_FACTS'],DENIED:['EXECUTION_READ_NOT_AVAILABLE','EXECUTION_READ_POLICY_PENDING'],
      UNAVAILABLE:['EXECUTION_READ_AUTHORITY_UNAVAILABLE','SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED']});
    const seen=new Set(pages.flatMap(([,r]:any)=>r.profile_dispositions.map((d:any)=>`${d.state}:${d.reason_code}`)));
    for(const [state,reasons] of Object.entries(scenarios.dispositions_covered))for(const reason of reasons as string[])expect(seen.has(`${state}:${reason}`),`${state}:${reason}`).toBe(true);
  });
  it('PORTFOLIOS and BINDINGS are non-empty and the three environments are all present',()=>{
    const portfolios=find('portfolios-owner-all').pages[0].response;
    expect(portfolios.environment).toBe('all');expect(portfolios.page.returned_count).toBe(9);
    expect(new Set(portfolios.items.map((i:any)=>i.environment))).toEqual(new Set(['paper','sandbox','live']));
    expect(find('bindings-owner-live').pages[0].response.items).toHaveLength(2);
  });
  it('a shared physical account is stated on exactly one item and totals are never a cross-item sum',()=>{
    const accountBalances=(response:any)=>response.items.flatMap((i:any)=>i.financial_facts.filter((f:any)=>f.kind==='INTERNAL_ACCOUNT_BALANCE').map((f:any)=>f.facts.account_id));
    expect(accountBalances(find('portfolios-owner-all').pages[0].response).filter((a:string)=>a.endsWith('_XS'))).toEqual([]);
    expect(accountBalances(find('bindings-owner-live').pages[0].response).filter((a:string)=>a.endsWith('_XS'))).toHaveLength(1);
    for(const [,response] of pages)expect((response as any).read_scope.totals_scope).toBe('VISIBLE_ROWS_ONLY');
  });
  it('the researcher page carries no peer byte',()=>{
    const text=JSON.stringify(find('fleet-researcher-paper').pages[0].response);
    for(const hidden of ['alpha_TEST_ONLY_A3','portfolio_TEST_ONLY_P3','deployment_TEST_ONLY_D3','Cirrus'])expect(text).not.toContain(hidden);
  });
  it('the 3 page chain has one fingerprint, stable counts and cursors that bind the page edges',()=>{
    const chain=find('fleet-owner-paper-chain').pages.map((p:any)=>p.response);
    expect(chain.map((r:any)=>[r.page.visible_count,r.page.has_more])).toEqual([[3,true],[3,true],[3,false]]);
    const payload=(token:string)=>JSON.parse(Buffer.from(token.split('.')[2],'base64url').toString('utf8'));
    expect(payload(chain[0].page.next_cursor).query_fingerprint).toBe(payload(chain[1].page.next_cursor).query_fingerprint);
    expect(payload(chain[1].page.previous_cursor).direction).toBe('before');
    expect(find('fleet-owner-paper-chain').pages[1].request.query.after).toBe(chain[0].page.next_cursor);
    expect(find('fleet-owner-paper-chain').pages[2].request.query.after).toBe(chain[1].page.next_cursor);
  });
  it('the bounded page is the maximum page of a larger population and one item reaches the 200 total bound',()=>{
    const response=bounded.scenarios[0].pages[0].response;
    expect(response.page).toMatchObject({visible_count:101,returned_count:100,limit:100,has_more:true});
    expect(response.items.some((i:any)=>i.financial_totals.length===200)).toBe(true);
  });
});

describe('RV-12 scoped refusals',()=>{
  const base=find('fleet-researcher-paper').pages[0].response;
  it('the base is the researcher page and every mutation id is unique',()=>{
    expect(new Set(refusals.mutations.map((m:any)=>m.id)).size).toBe(refusals.mutations.length);
  });
  it.each(refusals.mutations.map((m:any)=>[m.id,m] as const))('mutation %s is refused as recorded',(_id,m:any)=>{
    const value=apply(base,m.ops),parsed=scopedManagerResponseSchema.safeParse(value);
    expect(parsed.success).toBe(false);
    if(!parsed.success)expect(parsed.error.issues[0].message==='MANAGER_PAGE_INCONSISTENT'?'MANAGER_PAGE_INCONSISTENT':parsed.error.issues[0].code).toBe(m.code);
    expect(validate(value)?'PRODUCER_ONLY':'SCHEMA_AND_PRODUCER').toBe(m.refused_by);
  });
  it('the schema is looser than the producer in exactly the recorded places',()=>{
    expect(refusals.mutations.filter((m:any)=>m.refused_by==='PRODUCER_ONLY').map((m:any)=>m.id)).toEqual(['no-dispositions','has-more-without-cursor','returned-count-above-items']);
  });
  it('there is no DISCONNECTED or REVOKED disposition anywhere in the schema',()=>{
    const states=schema.$defs.ManagerScopedResponse.properties.profile_dispositions.items.properties.state.enum;
    expect(states).toEqual(['PARTIAL','DENIED','UNAVAILABLE']);
  });
  it('every runtime refusal states a request, an HTTP status, a code and who proved it',()=>{
    expect(refusals.requests.map((r:any)=>r.id)).toEqual(expect.arrayContaining(['cursor/changed-query','cursor/tampered','cursor/expired','cursor/wrong-direction','cursor/other-workspace',
      'cursor/source-moved','read/revoked-mid-request','read/single-environment-not-recorded','read/single-environment-not-granted','read/single-environment-policy-pending',
      'read/all-environments-denied','read/field-policy-pending','read/query-field-not-authorized','read/over-bound-is-refused-not-truncated','read/binding-detail-unknown']));
    for(const r of refusals.requests){
      expect([400,403,404,409,503]).toContain(r.status);expect(r.code).toMatch(/^[A-Z_]+$/);expect(r.proven_by.length).toBeGreaterThan(0);
    }
  });
});
