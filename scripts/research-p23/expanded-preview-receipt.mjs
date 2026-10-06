#!/usr/bin/env node
/** Qualified preview setup/custody only. Never build/replace the frontend. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateJson,savePrivate,readBoundedJson} from './api-client.mjs';
import {validateHome} from './cell.mjs';
import {previewCustodySnapshot} from './full03-preview-receipt.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),base='http://localhost:8095';
const representativeIds=[
 'p10.delta-wfo-temporal-1h.v2','p10.delta-pct-equity-mode5-global-4h.v2',
 'p10.imported-wfo-temporal-1h.v2','p10.imported-three-window-optimized-4h.v2','p10.imported-mode5-global-1d.v2',
 'p10.delta-intrabar-bracket-fixed-1h.v3','p10.delta-reactive-fixed-1h.v3','p10.delta-event-driven-fixed-1h.v3'];
export function previewRepresentatives(facts){
 // High-budget/cost proofs deliberately share a recipe. Re-probing every
 // run would consume the actor's eight unbound tokens, not prove more routes.
 const byId=new Map();
 for(const fact of facts)if(fact.symbol==='BTCUSDT'&&representativeIds.includes(fact.profile_id)&&!byId.has(fact.profile_id))
  byId.set(fact.profile_id,fact);
 assert.equal(byId.size,8,'EXACT_PREVIEW_REPRESENTATIVE_FAMILIES');
 return representativeIds.map(id=>byId.get(id));
}
export async function expandedPreviewReceipt(home,action,attempt=1){
 home=validateHome(home);assert(home.endsWith('/expanded'));
 assert(['before','enabled','after'].includes(action),'EXPLICIT_PREVIEW_CHECK');
 assert(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=8,'BOUNDED_PREVIEW_VERIFIER_ATTEMPT');
 assert(action==='enabled'||attempt===1,'CUSTODY_SNAPSHOT_CANNOT_BE_REPLACED');
 const path=join(home,`expanded-preview-${action}${attempt===1?'':`.attempt-${attempt}`}.json`);
 assert(!existsSync(path),'IMMUTABLE_PREVIEW_RECEIPT');
 if(action!=='enabled'){
  const record=previewCustodySnapshot();
  if(action==='after'){
   const before=privateJson(join(home,'expanded-preview-before.json'));
   for(const key of ['seals','users_md5','legacy_av_md5','indexed_av_md5','alpha_pointer_md5','index','web_image_id'])
    assert.deepEqual(record[key],before[key],'PREVIEW_CUSTODY_CHANGED:'+key);
   record.passed=true;
  }
  savePrivate(path,record);console.log(JSON.stringify({action,passed:record.passed??null,seals:record.seals.length}));return;
 }
 const env=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8');
 const origin=env.split('\n').find(v=>v.startsWith('PORTAL_PUBLIC_ORIGIN='))?.slice(21);
 assert(['http://localhost:8095','https://research-portal.primusspark.com'].includes(origin),'DEPLOYMENT_BOUND_ORIGIN');
 const jar=new Map(),record={passed:false,scope:'RESEARCH_PREVIEW_SETUP_NOT_BROWSER_ACCEPTANCE',
  recorded_at_utc:new Date().toISOString(),calls:{},setup_checks:0,preflight_checks:0};
 async function call(method,path,body){
  assert(path.startsWith('/api/'));
  const response=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(45000),
   headers:{origin,accept:'application/json','content-type':'application/json',connection:'close',
    cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),
    ...(method==='GET'?{}:{'x-portal-csrf':jar.get('__Host-portal_csrf')??''})},
   body:body===undefined?undefined:JSON.stringify(body)});
  for(const cookie of response.headers.getSetCookie()){
   const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));
  }
  const json=await readBoundedJson(response);
  // Keep every response, including a typed refusal and repeated POSTs. Never
  // overwrite evidence or retry create/mutation merely to turn a receipt green.
  record.calls[`${Object.keys(record.calls).length+1} ${method} ${path}`]={status:response.status,body:json};
  assert(response.ok,'PREVIEW_API:'+response.status+':'+json.error?.code+':'+JSON.stringify(json.error?.details??{}));
  return json;
 }
 try{
  assert.equal((await call('GET','/api/auth/context')).state,'AUTHENTICATED');
  await call('POST','/api/v1/research/run-producer/p04-delta/install',{});
  const atlas=await call('GET','/api/v1/research/quantbt/atlas');
  const table=JSON.parse(readFileSync(join(root,'apps/portal/registry/research-execution-recipes.v1.json')));
  const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.expanded-trial-profile.v1'
   ||r.descriptor.schema_version==='research.native-route-profile.v1'&&r.profile_id.endsWith('.v3'));
  assert.equal(rows.length,156);
  assert.equal(atlas.portal_admission.profiles.filter(p=>rows.some(r=>r.profile_id===p.profile_id)).length,156);
  for(const av of ['av_delta_rsi_polynomial_alpha_1_0_1','av_delta_rsi_polynomial_alpha_1_0_2'])
   for(const timeframe of ['1m','5m','15m','30m','1h','4h','1d']){
    const query=new URLSearchParams({alpha_id:'delta-rsi-polynomial-alpha',alpha_version_id:av,
     dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe});
    const options=await call('GET','/api/v1/research/runs/setup-options?'+query);
    record.setup_checks++;
    const active=options.profiles.filter(p=>p.state==='ENABLED'&&rows.some(r=>r.profile_id===p.profile_id));
    assert.equal(active.length,9,'EXACT_NINE_EXPANDED_MODE_SCHEDULE_RECIPES');
    for(const p of active){assert.equal(p.trial_count.max,400);assert.equal(p.budget.qualification,'PRODUCT_RUN_QUALIFIED');}
   }
  for(const row of rows.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1'))
   for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
    const query=new URLSearchParams({alpha_id:'delta-rsi-polynomial-alpha',
     alpha_version_id:row.descriptor.alpha_binding_requirements.alpha_version_id,
     dataset_id:'crypto-binance-1m',symbol,timeframe:'1h'});
    const options=await call('GET','/api/v1/research/runs/setup-options?'+query);
    record.setup_checks++;
    const p=options.profiles.find(p=>p.profile_id===row.profile_id);
    assert.equal(p?.state,'ENABLED');assert.equal(p.execution_route,row.descriptor.execution_route);
    assert.equal(p.native_input.execution_clock,row.descriptor.native_input.execution_clock);
    assert.deepEqual(p.trial_count,{min:1,max:1});
   }
  const summaries=[privateJson(join(home,'qualified-products-summary.json')),
   privateJson(join(home,'native-qualified-products-summary.json'))];
  const importedSource=privateJson(join(home,'imported-registration.json')).source_digest;
  let registry=await call('GET','/api/v1/research/alphas');
  let imported=registry.entries.find(p=>p.source_digest===importedSource&&p.declaration);
  for(let page=1;!imported&&registry.next_cursor&&page<20;page++){
   registry=await call('GET','/api/v1/research/alphas?'+new URLSearchParams({cursor:registry.next_cursor}));
   imported=registry.entries.find(p=>p.source_digest===importedSource&&p.declaration);
  }
  assert(imported,'EXACT_EXISTING_PREVIEW_IMPORT_REQUIRED_NO_NEW_ALPHA_CREATED');
  record.imported_binding={alpha_id:imported.alpha_id,alpha_version_id:imported.alpha_version_id,source_digest:importedSource};
  for(const [timeframe,symbol]of [['1h','BTCUSDT'],['4h','BTCUSDT'],['1d','BTCUSDT'],['1h','ETHUSDT'],['1h','SOLUSDT']]){
   const query=new URLSearchParams({alpha_id:imported.alpha_id,alpha_version_id:imported.alpha_version_id,
    dataset_id:'crypto-binance-1m',symbol,timeframe});
   const options=await call('GET','/api/v1/research/runs/setup-options?'+query);record.setup_checks++;
   const active=options.profiles.filter(p=>p.state==='ENABLED'&&rows.some(r=>r.profile_id===p.profile_id));
   assert.equal(active.length,9,'EXACT_IMPORTED_RECIPE_COUNT');
   for(const p of active){assert.equal(p.trial_count.max,400);assert.equal(p.parameter_policy,'DECLARED_SEARCH_WITH_PINS');}
  }
  const representatives=previewRepresentatives(summaries.flatMap(s=>s.facts));
  for(const fact of representatives){
   const spec=structuredClone(privateJson(join(home,fact.private_receipt)).run.requested_spec);
   if(fact.imported_source_digest){
    spec.alpha_binding={alpha_id:imported.alpha_id,alpha_version_id:imported.alpha_version_id};
    spec.strategy_id=imported.alpha_id;
   }
   spec.client={engine_release_id:atlas.atlas.current_release.release_id,config_digest:atlas.atlas.current_release.config_digest};
   const estimate=await call('POST','/api/v1/research/datasets/declaration-estimates',{requested_spec:spec});
   assert.equal(estimate.ready_for_preflight,true);assert.equal(estimate.profile_id,fact.profile_id);
   assert.equal((await call('POST','/api/v1/research/preflights',{requested_spec:spec})).may_create_run,true);
   record.preflight_checks++;
  }
  record.passed=true;console.log(JSON.stringify({passed:true,setup_checks:record.setup_checks,qualified_recipes:156,
   preflight_checks:representatives.length,external_execution_calls:0,frontend_rebuilt:false}));
 }finally{
  try{await call('POST','/api/auth/logout',{});}finally{savePrivate(path,record);}
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url))expandedPreviewReceipt(
 process.argv.find(v=>v.startsWith('--home='))?.slice(7),process.argv.find(v=>v.startsWith('--action='))?.slice(9),
 Number(process.argv.find(v=>v.startsWith('--attempt='))?.slice(10)??1))
 .catch(e=>{console.error('Expanded preview refused:',e.message);process.exitCode=1;});
