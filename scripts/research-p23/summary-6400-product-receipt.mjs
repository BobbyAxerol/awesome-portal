#!/usr/bin/env node
/** BR-S02-22: the failed range through ordinary product admission again. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {full03Receipt} from './full03-product-receipt.mjs';
import {loadSessions,makeClient,ensureOwnedOperatorSession,savePrivate} from './api-client.mjs';
import {validateHome} from './cell.mjs';
export async function summary6400Receipt(home,attempt=1){
 home=validateHome(home);
 assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=5,'BOUNDED_EXPLICIT_ATTEMPT');
 const record=await full03Receipt(home,'p10.delta-per-fold-decay-1h.v2',attempt,'expanded',{trials:400,
  walk_forward:{start:'2026-01-05T00:00:00Z',end_exclusive:'2026-09-28T00:00:00Z',
   split_mode:'2026-06-08T00:00:00Z',frequency:'weekly',window_mode:'expanding'}});
 const client=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner'),{connectionClose:true});
 await ensureOwnedOperatorSession(client,home);
 const proof={schema_version:'research.summary-6400-product-receipt.v1',profile_id:record.profile_id,
  run_id:record.run.run_id,identity:record.identity,requested_spec:record.run.requested_spec,pages:[],candidate_pages:[],passed:false};
 const path=join(home,'summary-6400.json');
 try{
  const split=record.reads['current-source/split'].body,search=record.reads['current-source/search'].body;
  assert.equal(split.fold_plan.folds.length,16,'REAL_ENGINE_FOLD_COUNT');
  assert.equal(search.search_contract.optuna_trials_per_study,400);
  let cursor=null;const ids=new Set();
  do{
   assert(proof.pages.length<40,'BOUNDED_6400_PAGE_COUNT');
   const page=await client.call('GET',`/api/v1/quantbt/runs/${proof.run_id}/current-source/search?limit=200${cursor?'&cursor='+encodeURIComponent(cursor):''}`);
   assert.equal(page.body.availability.state,'AVAILABLE');
   assert(Buffer.byteLength(JSON.stringify(page.body))<=1048576,'SEARCH_PAGE_BYTE_BOUND');
   for(const trial of page.body.ledger.trials){assert(!ids.has(trial.trial_id),'NO_DUPLICATE_TRIAL');ids.add(trial.trial_id);}
   proof.pages.push(page);savePrivate(path,proof);cursor=page.body.ledger.page.next_cursor;
  }while(cursor);
  assert.equal(ids.size,6400,'ALL_REAL_TRIAL_ROWS_RETAINED_AND_PAGED');
  proof.trial_count=ids.size;proof.fold_count=16;
  cursor=null;const candidateIds=new Set();
  do{
   assert(proof.candidate_pages.length<128,'BOUNDED_CANDIDATE_PAGE_COUNT');
   const page=await client.call('GET',`/api/v1/quantbt/runs/${proof.run_id}/current-source/search?limit=1${cursor?'&candidate_cursor='+encodeURIComponent(cursor):''}`);
   assert(Buffer.byteLength(JSON.stringify(page.body))<=1048576,'CANDIDATE_PAGE_BYTE_BOUND');
   for(const row of page.body.candidates.rows){assert(!candidateIds.has(row.candidate_id),'NO_DUPLICATE_CANDIDATE');candidateIds.add(row.candidate_id);}
   proof.candidate_pages.push(page);savePrivate(path,proof);cursor=page.body.candidates.page.next_cursor;
  }while(cursor);
  assert.equal(candidateIds.size,search.candidates.source_candidate_count,'FULL_CANDIDATE_CENSUS_READABLE');
  proof.candidate_count=candidateIds.size;
  proof.cross_cursor=await client.call('GET',`/api/v1/quantbt/runs/${proof.run_id}/current-source/search?limit=1&candidate_cursor=${encodeURIComponent(proof.pages[0].body.ledger.page.next_cursor)}`,undefined,[400]);
  proof.freeze=record.reads['current-source/freeze'];proof.passed=true;
  console.log(JSON.stringify({passed:true,run_id:proof.run_id,folds:16,trials:ids.size,pages:proof.pages.length}));
 }catch(e){proof.failure=e.message;throw e;}finally{proof.finished_at_utc=new Date().toISOString();savePrivate(path,proof);}
 return proof;
}
if(process.argv[1]===fileURLToPath(import.meta.url))summary6400Receipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),
 Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1))
 .catch(e=>{console.error('Summary 6400 refused:',e.message);process.exitCode=1;});
