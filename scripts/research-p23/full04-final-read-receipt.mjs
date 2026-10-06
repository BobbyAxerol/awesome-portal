#!/usr/bin/env node
/** Read-only final-image parity; never rerun the already accepted children. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {loadSessions,makeClient,privateJson,refreshTestSessions,savePrivate} from './api-client.mjs';
import {assertModeTruth} from './full04-qualification.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full04'),'EXACT_FULL04_HOME');
const attempt=process.argv.find(a=>a.startsWith('--attempt='))?.slice(10);
assert(attempt===undefined||/^[1-9][0-9]*$/.test(attempt),'BOUNDED_RECEIPT_ATTEMPT_NAME');
const path=join(home,`final-image-read-receipt${attempt?'-attempt'+attempt:''}.json`);
assert(!existsSync(path),'IMMUTABLE_READ_RECEIPT');
const table=JSON.parse(readFileSync(join(root,'apps/portal/registry/research-execution-recipes.v1.json')));
const facts=privateJson(join(home,'qualified-products-summary.json')).facts;
assert.equal(facts.length,35);
await refreshTestSessions(home);
const client=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true});
const result={schema_version:'research.full04-final-read-receipt.v1',recorded_at_utc:new Date().toISOString(),
  scope:'FINAL_IMAGE_RETAINED_READS_NOT_RECOMPUTE_OR_BROWSER',identity:privateJson(join(home,'identity.json')),
  passed:false,reads:[],extras:{}};
try{
  for(const fact of facts){
    const old=privateJson(join(home,fact.private_receipt)),record={...old,reads:{}};
    for(const route of Object.keys(old.reads)){
      const read=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/${route}`);
      assert(Buffer.byteLength(JSON.stringify(read.body))<=1048576,'BOUNDED_NAMED_READ');
      record.reads[route]=read;
      result.reads.push({profile_id:fact.profile_id,run_id:fact.run_id,route,status:read.status,
        body_sha256:createHash('sha256').update(JSON.stringify(read.body)).digest('hex')});
    }
    record.final_audit=await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/final-audit`,undefined,[200,409]);
    const truth=assertModeTruth(table.recipes.find(r=>r.profile_id===fact.profile_id),record);
    assert.equal(truth.retained_manifest_digest,fact.retained_manifest_digest,'UNCHANGED_SEAL_BYTES');
    assert.deepEqual(record.reads['current-source/freeze'].body.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'});
    if(fact.mode==='mode_5_full_robust'){
      const report=record.reads.report.body.frozen_core;
      assert.equal(report.equity.scope,'FULL_SAMPLE_CALIBRATION');
      assert(report.headline.every(m=>['FULL_SAMPLE','NOT_PUBLISHED'].includes(m.scope)));
      assert.equal(report.final_audit.reason_code,'FULL_SAMPLE_CALIBRATION_HAS_NO_UNTOUCHED_FINAL_AUDIT');
      assert.match(record.final_audit.body.error.message,/Full-sample calibration/);
    }
  }
  const full=facts.filter(f=>f.mode==='mode_5_full_robust');
  const ids=new URLSearchParams(full.map(f=>['ids',f.run_id]));
  const library=(await client.call('GET','/api/v1/quantbt/runs?'+ids)).body;
  assert.equal(library.items.length,7);
  for(const item of library.items){assert(full.some(f=>f.run_id===item.run_id));
    assert(item.stats.some(m=>m.scope==='FULL_SAMPLE'),'LIBRARY_FULL_SAMPLE_SCOPE');
    assert(item.stats.every(m=>m.scope===null||m.scope==='FULL_SAMPLE'),'NO_LIBRARY_OOS_ALIAS');}
  result.extras.library=library;
  const compare=(await client.call('GET','/api/v1/research/alphas/delta-rsi-polynomial-alpha/compare?mode=attempts')).body;
  const matched=compare.result.attempts.filter(a=>full.some(f=>f.run_id===a.run_id));
  assert.equal(matched.length,7);
  for(const attempt of matched)assert(attempt.original_metrics.every(m=>m.scope==='FULL_SAMPLE'),'COMPARE_FULL_SAMPLE_SCOPE');
  result.extras.compare=compare;
  result.extras.lineage=(await client.call('GET','/api/v1/research/alphas/delta-rsi-polynomial-alpha/lineage')).body;
  const example=full.find(f=>f.timeframe==='1h');
  result.extras.progress=(await client.call('GET',`/api/v1/research/runs/${example.run_id}/progress`)).body;
  result.passed=true;
  console.log(JSON.stringify({passed:true,retained_reads:result.reads.length,full_sample_library:7,full_sample_compare:7,
    additional_named_reads:4,recomputed_children:0}));
}finally{result.finished_at_utc=new Date().toISOString();savePrivate(path,result);}
