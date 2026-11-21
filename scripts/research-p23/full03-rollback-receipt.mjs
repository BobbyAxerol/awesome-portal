#!/usr/bin/env node
/** Owned-cell flag-off admission and retained read proof; no historical mutation. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {loadSessions,makeClient,privateJson,savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
const slice=process.argv.find(a=>a.startsWith('--slice='))?.slice(8)??'full03';
assert(['full03','full04','full05','full06'].includes(slice)&&home.endsWith('/'+slice),'EXACT_RECIPE_CELL');
const target=join(home,'flag-off-retained-read-receipt.json');
assert(!existsSync(target),'IMMUTABLE_ROLLBACK_RECEIPT');
const facts=privateJson(join(home,'qualified-products-summary.json')).facts;
const client=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true});
const record={scope:'OWNED_CELL_FLAGS_OFF_RETAINED_READS',passed:false,reads:[],recorded_at_utc:new Date().toISOString()};
try{
  const atlas=await client.call('GET','/api/v1/research/quantbt/atlas');
  assert.equal(atlas.body.portal_admission.profiles.filter(p=>facts.some(f=>f.profile_id===p.profile_id)).length,0);
  for(const fact of facts){
    for(const route of ['search','freeze']){
      const result=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/${route}`);
      assert.equal(result.body.availability.state,'AVAILABLE');
      assert.equal(result.body.provenance.profile_id,fact.source_profile_id);
      const expected=fact.retained_manifest_digest??privateJson(join(home,fact.private_receipt))
        .reads['current-source/freeze'].body.integrity.expected_manifest_digest;
      assert.equal(result.body.integrity?.expected_manifest_digest??result.body.provenance.source_manifest_digest,expected);
      if(route==='freeze')assert.equal(result.body.integrity.state,'MATCH');
      record.reads.push({run_id:fact.run_id,route,status:result.status,manifest_digest:fact.retained_manifest_digest,
        body_sha256:createHash('sha256').update(JSON.stringify(result.body)).digest('hex')});
    }
  }
  const fact=facts.find(f=>f.profile_id===(slice==='full06'?'p10.delta-pct-equity-mode4-causal-4h.v1':slice==='full05'?'p10.imported-mode4-causal-4h.v1':slice==='full04'?'p10.delta-mode4-causal-4h.v1':'p10.delta-wfo-temporal-4h.v1'));
  assert(fact,'EXACT_FLAG_OFF_RECIPE_REQUIRED');
  const spec=privateJson(join(home,fact.private_receipt)).run.requested_spec;
  const preflight=await client.call('POST','/api/v1/research/preflights',{requested_spec:spec},[201]);
  assert.equal(preflight.body.may_create_run,false);
  const create=await client.call('POST','/api/v1/research/runs',{
    schema_version:'research.run-create.v1',client_intent_id:slice+'-flag-off-'+randomUUID(),
    requested_spec:spec,preflight_token:preflight.body.preflight_token},[409]);
  assert.equal(create.body.error.code,'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE');
  record.admission={preflight,create};record.passed=true;
  console.log(JSON.stringify({passed:true,retained_reads:record.reads.length,new_run_refused:create.body.error.code}));
}finally{savePrivate(target,record);}
