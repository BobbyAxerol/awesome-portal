#!/usr/bin/env node
/** Final-image retained parity. Read only; never repeat an accepted child. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {privateJson,savePrivate,loadSessions,makeClient,refreshTestSessions,withOwnedReadSessionRenewal} from './api-client.mjs';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
import {assertModeTruth} from './full04-qualification.mjs';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function finalReadPlan(table,expanded,native){
 const facts=[...expanded.facts,...native.facts];
 assert(expanded.passed&&native.passed,'PASSED_IMMUTABLE_SUMMARIES_REQUIRED');
 assert.equal(new Set(expanded.facts.map(f=>f.profile_id)).size,153);
 assert.equal(native.facts.length,9);
 assert.equal(new Set(native.facts.map(f=>f.profile_id)).size,3);
 return facts.map(fact=>{
  const row=table.recipes.find(r=>r.profile_id===fact.profile_id);
  assert(row&&row.profile_digest===fact.profile_digest,'EXACT_PROFILE_DIGEST');
  const proof=table.qualification_references.find(r=>r.profile_id===fact.profile_id);
  assert.equal(proof?.kind,'PRODUCT_RUN_QUALIFIED','CANDIDATE_READS_ARE_NOT_FINAL_QUALIFICATION');
  return {fact,row,native:row.descriptor.schema_version==='research.native-route-profile.v1'};
 });
}
export async function finalReadReceipt(home){
 home=validateHome(home);assert(home.endsWith('/expanded'),'OWNED_EXPANDED_CELL_ONLY');
 const target=join(home,'expanded-final-image-read-receipt.json');
 assert(!existsSync(target),'IMMUTABLE_FINAL_READ_RECEIPT');
 const table=JSON.parse(readFileSync(new URL('../../apps/portal/registry/research-execution-recipes.v1.json',import.meta.url)));
 const plan=finalReadPlan(table,privateJson(join(home,'qualified-products-summary.json')),
  privateJson(join(home,'native-qualified-products-summary.json')));
 await refreshTestSessions(home);
 const client=withOwnedReadSessionRenewal(makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true}),home);
 const record={schema_version:'research.expanded-final-read-receipt.v1',passed:false,
  scope:'FINAL_IMAGE_RETAINED_PARITY_NOT_RECOMPUTE_OR_BROWSER',
  identity:privateJson(join(home,'identity.json')),recorded_at_utc:new Date().toISOString(),reads:[],session_renewals:client.sessionRenewals};
 try{
  for(const {fact,row,native}of plan){
   const old=privateJson(join(home,fact.private_receipt)),current={...old,reads:{}};
   for(const route of Object.keys(old.reads)){
    const path=native&&route==='replay'?'execute/replay':route;
    const read=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/${path}`);
    assert(Buffer.byteLength(JSON.stringify(read.body))<=1048576,'ONE_MIB_NAMED_READ_BOUND');
    current.reads[route]=read;
    record.reads.push({profile_id:fact.profile_id,run_id:fact.run_id,route,status:read.status,body_sha256:digest(read.body)});
   }
   if(native){
    assert.deepEqual(current.reads.evidence.body.core.native_execution,old.reads.evidence.body.core.native_execution);
    assert.equal(current.reads.freeze.body.provenance.manifest_digest,old.reads.freeze.body.provenance.manifest_digest,'NATIVE_SEAL_BYTES_UNCHANGED');
    assert.deepEqual(current.reads.freeze.body.freeze.frozen_parameters,old.reads.freeze.body.freeze.frozen_parameters);
    assert.equal(current.reads.evidence.body.availability.state,'AVAILABLE');
    const absence=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/search`);
    assert.equal(absence.body.availability.state,'NOT_APPLICABLE','NO_NATIVE_FIXED_WFO_ALIAS');
   }else{
    current.final_audit=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/final-audit`,undefined,[200,409]);
    const truth=row.public_profile.optimization_mode==='mode_1_decay'
     ?assertOrdinaryProductReceipt(row,current):assertModeTruth(row,current);
    assert.equal(truth.retained_manifest_digest,fact.retained_manifest_digest,'EXPANDED_SEAL_BYTES_UNCHANGED');
    assert.deepEqual(current.reads['current-source/freeze'].body.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'});
    if(row.source_requirement==='IMPORTED_IMMUTABLE_SEARCH_BINDING'){
     const authority=current.reads['current-source/freeze'].body.parameter_authority.code_fixed;
     assert.equal(authority.hash_scope,'SOURCE_CODE_SHA256');
     assert.equal(authority.code_digest,fact.imported_source_digest,'IMPORTED_DECLARATION_NOT_BUILTIN_ALIAS');
    }
    if(row.public_profile.execution_route==='pct_equity'){
     const execution=current.reads['current-source/replay'].body.execution;
     for(const cost of ['fee','funding','turnover'])assert.equal(execution.totals[cost],null,'NO_INVENTED_COST:'+cost);
    }
   }
  }
  record.passed=true;
  console.log(JSON.stringify({passed:true,qualified_recipes:156,product_runs:plan.length,
   named_reads:record.reads.length,recomputed_children:0}));
 }finally{record.finished_at_utc=new Date().toISOString();savePrivate(target,record);}
}
if(process.argv[1]===fileURLToPath(import.meta.url))finalReadReceipt(
 process.argv.find(a=>a.startsWith('--home='))?.slice(7))
 .catch(error=>{console.error('Expanded final reads refused:',error.message);process.exitCode=1;});
