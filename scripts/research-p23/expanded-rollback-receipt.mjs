#!/usr/bin/env node
/** Flag-off reads/intake proof, restricted to the owned expanded cell. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {privateJson,savePrivate,loadSessions,makeClient,ensureOwnedOperatorSession,withOwnedReadSessionRenewal} from './api-client.mjs';

export async function expandedRollbackReceipt(home,attempt=1){
 home=validateHome(home);assert(home.endsWith('/expanded'),'EXACT_EXPANDED_CELL');
 assert(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=8,'BOUNDED_READ_ONLY_VERIFIER_ATTEMPT');
 const target=join(home,attempt===1?'expanded-flag-off-receipt.json':`expanded-flag-off-receipt.attempt-${attempt}.json`);
 assert(!existsSync(target),'IMMUTABLE_ROLLBACK_RECEIPT');
 const env=Object.fromEntries(readFileSync(join(home,'preview.env'),'utf8').split('\n')
  .filter(s=>/^[A-Z0-9_]+=/.test(s)).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
 assert.equal(env.PORTAL_STACK_NAME,'portal-research-p23-ol12');assert.equal(env.PORTAL_HTTP_PORT,'8096');
 assert(!env.CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID&&!env.PORTAL_RECIPE_QUALIFICATION_PROFILE_ID);
 for(const family of ['FULL03','FULL04','FULL05','FULL06'])for(const prefix of ['CONTROL_API','PORTAL'])
  assert.equal(env[`${prefix}_FEATURE_RESEARCH_${family}_PROFILE`],'false','EXACT_FAMILY_ADMISSION_OFF');
 const expanded=privateJson(join(home,'qualified-products-summary.json')).facts;
 const native=privateJson(join(home,'native-qualified-products-summary.json')).facts;
 const client=withOwnedReadSessionRenewal(makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true}),home);
 await ensureOwnedOperatorSession(client,home);
 const record={scope:'OWNED_CELL_ADMISSION_ROLLBACK_NOT_SOURCE_OR_SEAL_MUTATION',passed:false,
  recorded_at_utc:new Date().toISOString(),reads:[],refusals:[],session_renewals:client.sessionRenewals};
 try{
  const atlas=await client.call('GET','/api/v1/research/quantbt/atlas');
  const ids=new Set([...expanded,...native].map(f=>f.profile_id));
  assert.equal(atlas.body.portal_admission.profiles.filter(p=>ids.has(p.profile_id)).length,0);
  // All exact recipes; multiple same-recipe cost proofs need not duplicate reads.
  const representatives=[...new Map([...expanded,...native].map(f=>[f.profile_id,f])).values()];
  assert.equal(representatives.length,156);
  for(const fact of representatives){
   const isNative=native.some(n=>n.profile_id===fact.profile_id);
   for(const route of isNative?['evidence','freeze']:['current-source/search','current-source/freeze']){
    const result=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/${route}`);
    assert.equal(result.body.availability.state,'AVAILABLE');
    if(route==='current-source/freeze')assert.equal(result.body.integrity.state,'MATCH');
    record.reads.push({run_id:fact.run_id,route,status:result.status,
     body_sha256:createHash('sha256').update(JSON.stringify(result.body)).digest('hex')});
   }
  }
  // One ordinary intake per family plus all three native routes; no child starts.
  for(const id of ['p10.delta-wfo-temporal-1h.v2','p10.delta-mode4-causal-1h.v2',
   'p10.imported-wfo-temporal-1h.v2','p10.delta-pct-equity-mode4-causal-1h.v2',
   ...native.map(f=>f.profile_id).filter((id,i,a)=>a.indexOf(id)===i)]){
   const fact=representatives.find(f=>f.profile_id===id);assert(fact,'EXACT_ROLLBACK_FAMILY');
   const spec=privateJson(join(home,fact.private_receipt)).run.requested_spec;
   const isNative=native.some(n=>n.profile_id===id);
   const preflight=await client.call('POST','/api/v1/research/preflights',{requested_spec:spec},isNative?[201,409]:[201]);
   if(isNative&&preflight.status===409){
    assert.equal(preflight.body.error.code,'RESEARCH_PREFLIGHT_ROUTE_NOT_ADMITTED');
    record.refusals.push({profile_id:id,preflight,create:null,children_started:0});
    continue; // No capability token: never fabricate one to probe create.
   }
   assert.equal(preflight.body.may_create_run,false);
   const create=await client.call('POST','/api/v1/research/runs',{
    schema_version:'research.run-create.v1',client_intent_id:'expanded-rollback-'+randomUUID(),
    requested_spec:spec,preflight_token:preflight.body.preflight_token},[409]);
   assert.equal(create.body.error.code,'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE');
   record.refusals.push({profile_id:id,preflight,create});
  }
  record.passed=true;console.log(JSON.stringify({passed:true,retained_reads:record.reads.length,
   refused_new_runs:record.refusals.length,children_started:0}));
 }finally{savePrivate(target,record);}
}
if(process.argv[1]?.endsWith('/expanded-rollback-receipt.mjs'))expandedRollbackReceipt(
 process.argv.find(a=>a.startsWith('--home='))?.slice(7),
 Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1))
 .catch(e=>{console.error('Expanded rollback refused:',e.message);process.exitCode=1;});
