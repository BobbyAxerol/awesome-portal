import { describe,it,expect } from 'vitest';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../schemas/execution-visit-digest.v1.schema.json';
import fixture from '../fixtures/execution-visit-digest.synthetic.valid.json';
import { composeVisitDigest, makeBaseline, makeDigestSnapshot, safeDigestHref, type DigestFact } from '../../../apps/control-api/src/command-center/visit-digest';
import { createVisitDigestFixture } from '../../../apps/portal/fixture-bff/review-visit-digest';
import { createFixtureServer, loadConfig } from '../../../apps/portal/fixture-bff/app';
import { setFixtureScale, scaled } from '../../../apps/portal/frontend/e2e/bffScale';
const ajv=new Ajv({strict:false});addFormats(ajv);const valid=ajv.compile(schema);
const facts=[fixture.input.fact as DigestFact];
const snapshot=()=>makeDigestSnapshot('ws_TEST_ONLY',facts[0].as_of!,facts);
describe('visit digest contract and linked fixture',()=>{
  it('canonical first/changed/seen examples equal the real projection',()=>{
    const s=snapshot();
    expect(composeVisitDigest(s,null)).toEqual(fixture.cases.first_visit);
    expect(composeVisitDigest(s,fixture.input.baseline)).toEqual(fixture.cases.changed);
    expect(composeVisitDigest(s,makeBaseline(s,2,s.observed_at))).toEqual(fixture.cases.seen);
    for(const example of Object.values(fixture.cases)) expect(valid(example),JSON.stringify(valid.errors)).toBe(true);
  });
  it('does not count new observations as new objects or disappeared rows as resolved',()=>{
    const b=makeBaseline(snapshot(),1,facts[0].as_of!);
    const empty=makeDigestSnapshot('ws_TEST_ONLY',facts[0].as_of!,[]);
    expect(composeVisitDigest(empty,b).items).toEqual([]);
    const other=makeDigestSnapshot('ws_TEST_ONLY',facts[0].as_of!,[{...facts[0],id:'other'}]);
    expect(composeVisitDigest(other,b).items[0].change).toBe('NEW_OBSERVATION');
  });
  it('stable facts do not change revision with observation time or input ordering',()=>{
    expect(makeDigestSnapshot('ws_TEST_ONLY','2026-10-24T00:00:00Z',[{...facts[0],as_of:'2026-10-24T00:00:00Z'}]).revision).toBe(snapshot().revision);
    expect(makeDigestSnapshot('other',facts[0].as_of!,facts).revision).not.toBe(snapshot().revision);
  });
  it('has bounded unique facts and safe workspace-pinned links',()=>{
    expect(()=>makeDigestSnapshot('ws_TEST_ONLY',facts[0].as_of!,[...facts,...facts])).toThrow('DIGEST_DUPLICATE_FACT');
    expect(()=>makeDigestSnapshot('ws_TEST_ONLY',facts[0].as_of!,Array(201).fill(facts[0]))).toThrow('DIGEST_INPUT_BOUND');
    for(const href of ['https://evil.test','//evil.test','/execution/../../admin','/execution/\\evil','javascript:alert(1)'])
      expect(safeDigestHref(href,'w')).toBe('/execution?workspace_id=w');
    expect(safeDigestHref('/governance/r1/x?workspace_id=other','w')).toBe('/governance/r1/x?workspace_id=w');
  });
  it('rejects contradictory state, unknown fields and complete-history claims',()=>{
    for(const bad of [{...fixture.cases.changed,coverage:'COMPLETE'}, {...fixture.cases.changed,baseline:null},
      {...fixture.cases.first_visit,items:fixture.cases.changed.items}, {...fixture.cases.changed,can_trade:true}])expect(valid(bad)).toBe(false);
  });
  it('serves linked stage/operation changes, marks seen idempotently and isolates workspace/user',()=>{
    setFixtureScale('medium');
    try{
      const serve=createVisitDigestFixture();const config=loadConfig({FIXTURE_REVIEW_PROFILE:'populated',FIXTURE_SCALE:'medium'});
      const request={method:'GET',path:'/api/v1/execution/visit-digest',search:'?workspace_id=ws_TEST_ONLY',body:null,headers:{}};
      const before=serve(config,request)!.body as any;
      expect(valid(before),JSON.stringify(valid.errors)).toBe(true);expect(before.state).toBe('READY');
      for(const item of before.items) {
        if(item.kind==='STAGE') expect(scaled().alphas.flatMap(a=>a.deployments).some(d=>`stage:${d.id}`===item.id)).toBe(true);
        if(item.kind==='OPERATION') expect(scaled().operations.some(o=>`operation:${o.id}`===item.id)).toBe(true);
      }
      const post={...request,method:'POST',path:request.path+'/seen',body:before.mark_seen};
      const seen=serve(config,post)!;expect(seen.status).toBe(200);expect((seen.body as any).state).toBe('EMPTY');
      expect(serve(config,post)).toEqual(seen);
      expect((serve({...config,userId:'another'},request)!.body as any).state).toBe('READY');
      expect((serve(config,{...request,search:'?workspace_id=another'})!.body as any).state).toBe('READY');
      expect(serve(config,{...post,body:{...before.mark_seen,snapshot_revision:'0'.repeat(64)}})!.status).toBe(409);
      expect(serve(config,{...request,search:'?workspace_id=ws_TEST_DENIED'})!.status).toBe(404);
      expect(serve(config,{...request,search:'?user_id=other'})!.status).toBe(400);
    }finally{setFixtureScale('small');}
  });
  it('mounts GET and explicit seen over the fixture HTTP port; new server starts a new fixture scenario',async()=>{
    const config=loadConfig({PORT:'0',FIXTURE_REVIEW_PROFILE:'populated',FIXTURE_SCALE:'medium'});
    const server=createFixtureServer(config);
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    try {
      const address=server.address() as {port:number};const url=`http://127.0.0.1:${address.port}/api/v1/execution/visit-digest`;
      const first=await fetch(url);expect(first.status).toBe(200);expect(first.headers.get('cache-control')).toContain('no-store');
      const body=await first.json() as any;expect(body.state).toBe('READY');
      const post=await fetch(url+'/seen',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body.mark_seen)});
      expect(post.status).toBe(200);expect((await post.json() as any).state).toBe('EMPTY');
      const read=await fetch(url);expect((await read.json() as any).state).toBe('EMPTY');
    } finally { server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));setFixtureScale('small'); }
  });
});
