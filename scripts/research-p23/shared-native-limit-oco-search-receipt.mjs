#!/usr/bin/env node
/** Exact shared Research preview intake; resume the same intent, never reset data. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {privateJson,savePrivate,readBoundedJson} from './api-client.mjs';

const home='/home/bobby/.local/state/portal-research-p23/20261008/shared-limit-oco-search';
const path=join(home,'product.json'),base='http://localhost:8095',origin='https://research-portal.primusspark.com';
mkdirSync(home,{recursive:true,mode:0o700});chmodSync(home,0o700);
const receipt=existsSync(path)?privateJson(path):{schema_version:'research.shared-native-optimization-receipt.v1',
 project:'portal-research-preview',client_intent_id:`limit-oco-search-${randomUUID()}`,started_at_utc:new Date().toISOString()};
assert.equal(receipt.project,'portal-research-preview');
const jar=new Map(),save=()=>savePrivate(path,receipt);
async function call(method,route,body,statuses=[200]){
 assert(route.startsWith('/api/')&&new URL(route,base).origin===base);
 const response=await fetch(new URL(route,base),{method,redirect:'manual',signal:AbortSignal.timeout(45000),
  headers:{origin,'content-type':'application/json',accept:'application/json','x-dev-access-email':'claude-preview@azdag.com',
   cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),
   ...(method!=='GET'?{'x-portal-csrf':jar.get('__Host-portal_csrf')??''}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
 const json=await readBoundedJson(response);assert(statuses.includes(response.status),`SHARED_API:${method}:${route}:${response.status}:${json.error?.code??'UNEXPECTED'}`);
 return {status:response.status,body:json};
}
try{
 await call('POST','/api/auth/login',{username:'claude-preview',credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()},[200,201]);
 receipt.identity=privateJson('/home/bobby/.config/portal-research-preview/identity.json');
 if(!receipt.created){
  receipt.install=await call('POST','/api/v1/research/run-producer/p04-delta/install',{},[200,201]);
  receipt.atlas=await call('GET','/api/v1/research/quantbt/atlas');
  const owned=privateJson('/home/bobby/.local/state/portal-research-p23/20261008/expanded/run-limit-oco-search-btcusdt-100-4.json');
  receipt.requested_spec=structuredClone(owned.requested_spec);
  const release=receipt.atlas.body.atlas.current_release;
  receipt.requested_spec.client={engine_release_id:release.release_id,config_digest:release.config_digest};save();
  const setupQuery=new URLSearchParams({...receipt.requested_spec.alpha_binding,...receipt.requested_spec.data});
  receipt.setup=await call('GET',`/api/v1/research/runs/setup-options?${setupQuery}`);
  const profile=receipt.setup.body.profiles.find(p=>p.profile_id==='p10.delta-event-driven-limit-oco-search-1h.v1');
  assert.equal(profile?.state,'ENABLED');assert.equal(profile.budget.qualification,'PRODUCT_RUN_QUALIFIED');
  assert.deepEqual(profile.trial_count,{min:2,max:400});assert.equal(profile.trial_default,100);
  assert.equal(profile.recipe.family,'NATIVE_OPTIMIZED');assert.deepEqual(profile.allowed_pin_names,[]);
  receipt.workspace_id=receipt.setup.body.context.workspace_id;save();
  receipt.preflight=await call('POST','/api/v1/research/preflights',{requested_spec:receipt.requested_spec},[201]);
  assert.equal(receipt.preflight.body.may_create_run,true);save();
  receipt.created=await call('POST','/api/v1/research/runs',{schema_version:'research.run-create.v1',
   client_intent_id:receipt.client_intent_id,preflight_token:receipt.preflight.body.preflight_token,requested_spec:receipt.requested_spec},[202]);
  receipt.run_id=receipt.created.body.run_id;save();
 }
 assert(/^rrun_[a-z0-9]+$/.test(receipt.run_id));
 const deadline=Date.now()+3700000;let previous='';
 for(;;){
  receipt.progress=await call('GET',`/api/v1/research/runs/${receipt.run_id}/progress`);
  const current=receipt.progress.body.current,key=`${current.effective_status}/${current.terminal_materialization}`;
  if(key!==previous){console.log(JSON.stringify({run_id:receipt.run_id,state:key}));previous=key;save();}
  if(['COMPLETED','FAILED','CANCELLED'].includes(current.effective_status)&&current.terminal_materialization!=='PENDING')break;
  assert(Date.now()<deadline,'SHARED_RUN_TIMEOUT');await new Promise(r=>setTimeout(r,2500));
 }
 assert.equal(receipt.progress.body.current.effective_status,'COMPLETED');
 receipt.reads={};
 for(const read of ['evidence','split','execute/replay'])receipt.reads[read]=await call('GET',`/api/v1/quantbt/runs/${receipt.run_id}/${read}`);
 const facts=receipt.reads.evidence.body.core.native_execution,optimization=facts.optimization;
 assert.equal(optimization.requested_trials,100);assert.equal(optimization.completed_trials,100);assert.equal(optimization.retained_trials,100);
 assert.equal(optimization.holdout_used,false);assert.equal(optimization.sha256,receipt.progress.body.native_execution.optimization.sha256);
 receipt.journals={};
 for(const window of ['IS','OOS'])for(const record_kind of ['COMMAND','LIFECYCLE','FILL']){
  let cursor=null;const pages=[];
  do{const q=new URLSearchParams({window,record_kind,limit:'200'});if(cursor)q.set('cursor',cursor);
   const page=await call('GET',`/api/v1/quantbt/runs/${receipt.run_id}/execution/records?${q}`);
   assert(Buffer.byteLength(JSON.stringify(page.body))<=1048576);pages.push(page);cursor=page.body.next_cursor??null;assert(pages.length<=64);
  }while(cursor);receipt.journals[`${window}:${record_kind}`]=pages;
 }
 const rows=Object.values(receipt.journals).flatMap(pages=>pages.flatMap(p=>p.body.rows.map(r=>r.payload)));
 const commands=rows.filter(r=>r.source_relation==='metadata.command_report');
 const fills=rows.filter(r=>r.source_relation==='result.fills');
 const parents=new Set(commands.filter(r=>r.parent_order_id).map(r=>r.parent_order_id));
 assert(parents.size>=10&&fills.length>=20);assert.equal(fills.length,facts.fills_count);
 receipt.counts={trials:100,distinct_parameters:optimization.distinct_parameter_sets,parent_cycles:parents.size,orders:facts.orders_count,fills:fills.length};
 receipt.public_fact_sha256=createHash('sha256').update(JSON.stringify(facts)).digest('hex');
 receipt.passed=true;receipt.finished_at_utc=new Date().toISOString();save();
 console.log(JSON.stringify({passed:true,run_id:receipt.run_id,counts:receipt.counts,receipt:path}));
}catch(error){receipt.failure=error.message;save();console.error('Shared native proof refused:',error.message);process.exitCode=1;}
finally{
 if(jar.size){const result=await call('POST','/api/auth/logout',{},[200,201]);receipt.session_revoked=result.status<300;save();}
}
