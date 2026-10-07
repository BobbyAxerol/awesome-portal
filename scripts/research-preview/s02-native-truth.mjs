#!/usr/bin/env node
/** BR-S02-14..17: GET-only retake of the three existing real native runs.
 * No new engine run, profile grant, seal rewrite or visual baseline update. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPreviewActivationIdle } from './activation-custody.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const PROJECT='portal-research-preview',BASE='http://localhost:8095';
const [stage,out]=process.argv.slice(2);
assert(['before','verify'].includes(stage),'STAGE_REQUIRED');
assert(out?.startsWith('/home/bobby/.local/state/portal-research-p23/s02-native-truth-'),'PRIVATE_OWNED_RECEIPT_PATH_REQUIRED');
mkdirSync(out,{recursive:true,mode:0o700});
const write=(name,value)=>{
 const path=resolve(out,name);assert(!existsSync(path),'PRIOR_RECEIPT_MUST_NOT_BE_OVERWRITTEN');
 writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});
};
const hash=value=>createHash('sha256').update(value).digest('hex');
const docker=(args,input)=>execFileSync('sudo',['-n','docker',...args],{input,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',PROJECT+'-control-api-1']).trim(),PROJECT);
const query=(sql,params=[])=>JSON.parse(docker(['exec','-i',PROJECT+'-control-api-1','node','-e',`
 const {Pool}=require('pg'),fs=require('fs'),input=JSON.parse(fs.readFileSync(0,'utf8'));
 const p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
 p.query(input.sql,input.params).then(r=>process.stdout.write(JSON.stringify(r.rows)))
 .catch(e=>{process.stderr.write(String(e.code??e.name));process.exitCode=1}).finally(()=>p.end());
 `],JSON.stringify({sql,params})));
const runIds=['rrun_ea0e06b9d56e08757c40d54746982098','rrun_a7c3c23ff88df9f133061d0586c550d9','rrun_e21e324c6ba49393ce82c3603ddc139a'];
const custody=(beforeTimestamp=null)=>Object.fromEntries(['jobs','selection_records','current_source_seals_v1',
 'run_report_manifests_v1','release_candidate_packs_v1','release_candidate_publications_v1'].map(table=>{
 // The public preview is shared. New ordinary jobs/reports after the snapshot
 // are not a rewrite. Still compare every originally captured row byte hash;
 // do not weaken seal/pack/publication custody or hide global growth.
 const filter=!beforeTimestamp?'':table==='jobs'?'WHERE row.created_at <= $1::timestamptz':
  table==='run_report_manifests_v1'?'WHERE NOT EXISTS (SELECT 1 FROM research.jobs newer WHERE newer.workspace_id=row.workspace_id AND newer.run_id=row.run_id AND newer.created_at > $1::timestamptz)':'';
 return [table,query(`SELECT count(*)::int AS rows,md5(coalesce(string_agg(to_jsonb(row)::text,E'\\n' ORDER BY to_jsonb(row)::text),'')) AS digest FROM research.${table} row ${filter}`,
  filter?[beforeTimestamp]:[])[0]];
}));
const pending=()=>query(`SELECT r.run_id,r.state AS run_state,j.state AS job_state,p.dispatch_state,p.worker_attempt_id,
 (SELECT count(*)::int FROM research.worker_attempts a WHERE a.workspace_id=r.workspace_id AND a.job_id=j.job_id) AS attempts,
 md5(to_jsonb(r)::text) AS run_md5,md5(to_jsonb(j)::text) AS job_md5,md5(to_jsonb(p)::text) AS producer_md5
 FROM research.runs r LEFT JOIN research.jobs j USING(workspace_id,run_id)
 LEFT JOIN research.run_producers p USING(workspace_id,run_id)
 WHERE r.state IN ('QUEUED','RUNNING','SEALING') OR j.state IN ('QUEUED','CLAIMED','RUNNING','CANCEL_REQUESTED')`);
if(stage==='before'){
 write('before.json',{recorded_at_utc:new Date().toISOString(),pending:assertPreviewActivationIdle(pending()),custody:custody()});
 console.log('Preview idle; immutable custody captured.');
}else{
 const before=JSON.parse(readFileSync(resolve(out,'before.json'),'utf8'));
 const pendingAtRead=pending();
 assert.deepEqual(pendingAtRead.filter(r=>before.pending.some(old=>old.run_id===r.run_id)),before.pending,'HISTORICAL_FIXTURE_UNCHANGED');
 const bindings=query('SELECT run_id,workspace_id,state FROM research.runs WHERE run_id=ANY($1::text[]) ORDER BY run_id',[runIds]);
 // research.runs READY is immutable registration metadata, not the product's
 // terminal status. Assert COMPLETED on the public progress response below.
 assert.equal(bindings.length,3);assert(bindings.every(r=>r.state==='READY'));
 const {chromium}=await import('../../apps/portal/frontend/node_modules/playwright/index.mjs');
 const browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:1280,height:900},extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
 const page=await context.newPage(),errors=[],failed=[],writes=[];
 const receipt={lane:'REAL_API_EXISTING_NATIVE_RUNS_GET_ONLY',recorded_at_utc:new Date().toISOString(),
  base_sha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
  pending_at_read:pendingAtRead,images:Object.fromEntries(['control-api','portal-api','portal-web','quant-worker-py'].map(service=>[service,
   docker(['inspect','--format','{{.Image}}',PROJECT+'-'+service+'-1']).trim()])),runs:[]};
 try{
  const env=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8');
  const origin=env.match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];assert(origin,'PREVIEW_ORIGIN_REQUIRED');
  const login=await page.request.post(BASE+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',
   credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});
  assert(login.ok(),'EXISTING_PREVIEW_REVIEW_SESSION_REQUIRED');
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()})});
  page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')writes.push({method:r.method(),path:new URL(r.url()).pathname})});
  await page.goto(BASE+'/research/quantbt',{waitUntil:'networkidle'});
  const get=async path=>{
   const response=await page.request.get(BASE+path);assert.equal(response.status(),200,path);
   return response.json();
  };
  const atlas=await get('/api/v1/research/quantbt/atlas');
  for(const route of atlas.atlas.routes){
   assert.equal(route.axes_scope,'PINNED_ENGINE_CATALOGUE_NOT_RUNTIME_ADMISSION');
   assert.deepEqual(route.recipes_enabled,[...new Set(atlas.portal_admission.profiles.filter(p=>p.state==='ENABLED'
    &&p.engine_release_id===atlas.selected_release_id&&p.execution_route===route.route_id).map(p=>p.profile_id))].sort());
  }
  receipt.atlas={etag:atlas.etag,routes:atlas.atlas.routes.map(r=>({route_id:r.route_id,axes:r.axes,axes_scope:r.axes_scope,recipes_enabled:r.recipes_enabled}))};
  write('atlas.response.json',atlas);
  const revalidate=await page.request.get(BASE+'/api/v1/research/quantbt/atlas',{headers:{'if-none-match':atlas.etag}});
  assert.equal(revalidate.status(),304);receipt.atlas.revalidated_status=304;
  for(const binding of bindings){
   const suffix='?workspace_id='+encodeURIComponent(binding.workspace_id),id=binding.run_id;
   const progress=await get('/api/v1/research/runs/'+id+'/progress'+suffix);
   assert.equal(progress.current.effective_status,'COMPLETED');
   const hub=await get('/api/v1/quantbt/runs/'+id+'/evidence'+suffix);
   assert(progress.native_execution,'PROGRESS_NATIVE_FACT_REQUIRED');
   assert.deepEqual(progress.native_execution,hub.core.native_execution,'MATCHING_NATIVE_SOURCE_FACTS_REQUIRED');
   const counter=hub.metrics.find(m=>m.key==='TRADE_COUNT');
   assert.equal(counter.label,'Position regimes (engine)');
   assert.equal(counter.count_semantics,'POSITION_REGIMES_INCLUDING_INITIAL_STATE_NOT_EXECUTIONS');
   if(id===runIds[0]){
    assert.equal(counter.value,'1');assert.equal(hub.core.native_execution.fills_count,0);
    assert.equal(hub.core.native_execution.fees.total,'0');assert.equal(hub.core.native_execution.orders_count,null);
   }
   write(id+'.progress.json',progress);write(id+'.evidence.json',hub);
   for(const width of [1280,660]){
    await page.setViewportSize({width,height:900});
    for(const screen of ['progress','evidence']){
     await page.goto(BASE+'/research/quantbt/runs/'+id+'/'+screen+suffix,{waitUntil:'networkidle'});
     await page.locator('main').waitFor();
     if(screen==='evidence'){
      await page.getByText('Native execution',{exact:true}).first().waitFor();
      await page.getByText('Position regimes (engine)',{exact:true}).first().waitFor();
     }
     await page.screenshot({path:resolve(out,id+'.'+screen+'.'+width+'.png'),fullPage:true});
    }
   }
   receipt.runs.push({run_id:id,workspace_id:binding.workspace_id,status:progress.current.effective_status,
    native_execution:progress.native_execution,engine_counter:counter,progress_sha256:hash(JSON.stringify(progress)),
    hub_sha256:hash(JSON.stringify(hub)),browser_viewports:[1280,660]});
  }
  assert.deepEqual(errors,[],'NO_BROWSER_ERROR');assert.deepEqual(failed,[],'NO_FAILED_API_RESPONSE');
  assert.deepEqual(writes,[],'NO_PRODUCT_WRITE');
  receipt.custody_before=before.custody;receipt.custody_after=custody(before.recorded_at_utc);
  receipt.global_custody_after=custody();
  assert.deepEqual(receipt.custody_after,before.custody,'NO_JOB_SELECTION_SEAL_REPORT_PACK_OR_PUBLICATION_REWRITE');
  receipt.errors=errors;receipt.failed=failed;receipt.writes=writes;receipt.verdict='PASS';
  write('receipt.json',receipt);console.log(JSON.stringify({verdict:receipt.verdict,runs:receipt.runs.length,views:12}));
 }finally{await browser.close()}
}
