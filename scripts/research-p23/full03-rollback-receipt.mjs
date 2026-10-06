#!/usr/bin/env node
/** Owned-cell flag-off admission and retained read proof; no historical mutation. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {loadSessions,makeClient,privateJson,savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full03'),'EXACT_FULL03_CELL');
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
      assert.equal(result.body.provenance.manifest_digest,fact.retained_manifest_digest);
      if(route==='freeze')assert.equal(result.body.integrity.state,'MATCH');
      record.reads.push({run_id:fact.run_id,route,status:result.status,manifest_digest:fact.retained_manifest_digest,
        body_sha256:createHash('sha256').update(JSON.stringify(result.body)).digest('hex')});
    }
  }
  const fact=facts.find(f=>f.profile_id==='p10.delta-wfo-temporal-4h.v1');
  const spec=privateJson(join(home,fact.private_receipt)).run.requested_spec;
  const preflight=await client.call('POST','/api/v1/research/preflights',{requested_spec:spec},[201]);
  assert.equal(preflight.body.may_create_run,false);
  const create=await client.call('POST','/api/v1/research/runs',{
    schema_version:'research.run-create.v1',client_intent_id:'full03-flag-off-'+randomUUID(),
    requested_spec:spec,preflight_token:preflight.body.preflight_token},[409]);
  assert.equal(create.body.error.code,'RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE');
  record.admission={preflight,create};record.passed=true;
  console.log(JSON.stringify({passed:true,retained_reads:record.reads.length,new_run_refused:create.body.error.code}));
}finally{savePrivate(target,record);}
