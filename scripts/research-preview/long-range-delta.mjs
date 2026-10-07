#!/usr/bin/env node
// Bobby's 2020–2026 Delta RSI preview journey; real APIs only, no request mocks.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';

const [stage,out]=process.argv.slice(2), BASE='http://localhost:8095';
assert(['probe','prepare','three','wfo','inspect','report','readback'].includes(stage),'STAGE_REQUIRED');
const inspectionRunIds=process.argv.slice(4);
if(['inspect','report','readback'].includes(stage))assert(inspectionRunIds.length>0&&inspectionRunIds.length<=2&&inspectionRunIds.every(id=>/^rrun_[a-f0-9]{32}$/.test(id)),'EXPLICIT_INSPECTION_RUN_IDS_REQUIRED');
assert(out?.startsWith('/home/bobby/.local/state/portal-research-p23/long-range-delta-'),'PRIVATE_RECEIPT_PATH_REQUIRED');
mkdirSync(out,{recursive:true,mode:0o700});
const save=(name,data)=>{const path=resolve(out,name);assert(!existsSync(path),'IMMUTABLE_RECEIPT');writeFileSync(path,JSON.stringify(data,null,2)+'\n',{mode:0o600})};
const env=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8');
const origin=env.match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];assert(origin);
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:1000},extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
const page=await context.newPage(),errors=[],responses=[];
try{
 const login=await page.request.post(BASE+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});
 assert(login.ok(),'REVIEW_SESSION_REQUIRED');
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().includes('/api/'))responses.push({path:new URL(r.url()).pathname,status:r.status(),method:r.request().method()})});
 // Loopback tests retain the deployment's public Origin for CSRF checks.
 // Fetch the actual upstream response; never synthesize JSON or use fixtures.
 await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():
  route.fetch({headers:{...route.request().headers(),origin},timeout:180000}).then(response=>route.fulfill({response})));
 const get=async(name,path)=>{const r=await page.request.get(BASE+path);const body=await r.json();save(name,{status:r.status(),body});assert(r.ok(),path+': '+r.status());return body};
 if(stage==='readback'){
  for(const id of inspectionRunIds){
   for(const kind of ['EQUITY','RETURNS','POSITIONS','MONTHLY_RETURNS','ROLLING_RETURNS_20','RETURN_DISTRIBUTION']){
    const body=await get(id+'.'+kind+'.json','/api/v1/quantbt/runs/'+id+'/current-source/evidence/series?kind='+kind);
    console.log(JSON.stringify({run_id:id,kind,availability:body.availability,points:body.values?.length}));
   }
   const r=await page.request.get(BASE+'/api/v1/quantbt/runs/'+id+'/final-audit');
   const body=await r.json();save(id+'.final-audit.json',{status:r.status(),body});
   console.log(JSON.stringify({run_id:id,final_audit_status:r.status(),code:body.error?.code??body.code}));
  }
  save('receipt.json',{recorded_at_utc:new Date().toISOString(),errors,responses});
 }else if(stage==='report'){
  for(const id of inspectionRunIds){
   const response=await page.request.get(BASE+'/api/v1/quantbt/runs/'+id+'/report');
   const body=await response.json();save(id+'.report.json',{status:response.status(),body});
   console.log(JSON.stringify({run_id:id,status:response.status(),problem:response.ok()?null:body,keys:Object.keys(body)}));
   if(response.ok()){
    await page.goto(BASE+'/research/quantbt/runs/'+id+'/report',{waitUntil:'networkidle'});
    save(id+'.report-ui.json',{text:await page.locator('main').innerText()});
    await page.screenshot({path:resolve(out,id+'.report.png'),fullPage:true});
   }
  }
  save('browser-closeout.json',{errors,responses});
 }else if(stage==='inspect'){
  const runs=inspectionRunIds;
  const summary=[];
  for(const id of runs){
   const p=await get(id+'.progress.json','/api/v1/research/runs/'+id+'/progress');
   const hub=await get(id+'.hub.json','/api/v1/quantbt/runs/'+id+'/evidence');
   const retained=await get(id+'.retained.json','/api/v1/quantbt/runs/'+id+'/current-source/evidence');
   const split=await get(id+'.split.json','/api/v1/quantbt/runs/'+id+'/current-source/split');
   const freeze=await get(id+'.freeze.json','/api/v1/quantbt/runs/'+id+'/current-source/freeze');
   const replay=await get(id+'.replay.json','/api/v1/quantbt/runs/'+id+'/execute/replay');
   const search=await get(id+'.search.json','/api/v1/quantbt/runs/'+id+'/current-source/search');
   await page.goto(BASE+'/research/quantbt/runs/'+id+'/progress',{waitUntil:'networkidle'});
   save(id+'.progress-ui.json',{text:await page.locator('main').innerText()});
   for(const window of ['is','holdout']){
    await page.goto(BASE+'/research/quantbt/runs/'+id+'/execute?window='+window,{waitUntil:'networkidle'});
    save(id+'.replay-'+window+'-ui.json',{text:await page.locator('main').innerText()});
    await page.screenshot({path:resolve(out,id+'.replay-'+window+'.png'),fullPage:true});
   }
   summary.push({run_id:id,status:p.current.effective_status,fold_reporting:p.current.fold_reporting,
    windows:retained.enriched_analysis?.windows??hub.enriched_analysis?.windows,
    retained_keys:Object.keys(retained),split_keys:Object.keys(split),freeze_keys:Object.keys(freeze),
    replay_keys:Object.keys(replay),search_keys:Object.keys(search),retained_identity:retained.source??retained.identity});
  }
  save('receipt.json',{recorded_at_utc:new Date().toISOString(),summary,errors,responses});
  console.log(JSON.stringify(summary,null,2));
 }else{
 const atlas=await get('atlas.json','/api/v1/research/quantbt/atlas');
 const registry=await get('registry.json','/api/v1/research/alphas');
 const datasets=await get('datasets.json','/api/v1/research/datasets');
 console.log(JSON.stringify({atlas_keys:Object.keys(atlas),registry_keys:Object.keys(registry),datasets:datasets.datasets.map(d=>({id:d.dataset_id,symbols:d.symbols.items.length}))}));
 await page.goto(BASE+'/research/quantbt/runs/new',{waitUntil:'networkidle'});
 if(stage!=='probe'){
  const binding={alpha_id:'delta-rsi-polynomial-alpha',alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_1'};
  const setup=await get('setup.json','/api/v1/research/runs/setup-options?'+new URLSearchParams({...binding,dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe:'1h'}));
  await get('metadata.json','/api/v1/research/datasets/crypto-binance-1m/bar-metadata?'+new URLSearchParams({symbol:'BTCUSDT',timeframe:'1h',warmup_bars:'300',start_utc_ms:String(Date.parse(stage==='prepare'?'2020-01-01T00:00:00Z':'2020-01-14T00:00:00Z')),end_exclusive_utc_ms:String(Date.parse(stage==='prepare'?'2026-10-07T00:00:00Z':'2026-10-01T00:00:00Z'))}));
  await page.getByLabel('Alpha',{exact:true}).selectOption(binding.alpha_id);
  await page.getByLabel('Alpha version',{exact:true}).selectOption(binding.alpha_version_id);
  await page.locator('[data-step-pill="data"]').click();
  await page.getByLabel('Dataset',{exact:true}).selectOption('crypto-binance-1m');
  await page.getByLabel('Symbol',{exact:true}).fill('BTCUSDT');
  await page.locator('[data-timeframe-chips] button, [data-timeframe-chips] [role=radio]').filter({hasText:/^1h$/}).first().click();
  await page.locator('[data-step-pill="windows"]').click();
  await page.waitForTimeout(1500);
  console.log(JSON.stringify({profiles:setup.profiles.filter(p=>p.state==='ENABLED').map(p=>({id:p.profile_id,trial_default:p.trial_default,span:p.max_span_days,folds:p.fold_bounds}))}));
  if(['three','wfo'].includes(stage)){
   const shots=[];
   const shot=async name=>{await page.screenshot({path:resolve(out,name+'.png'),fullPage:true});shots.push(name);save(name+'.ui.json',{text:await page.locator('main').innerText()})};
   for(const step of ['context','strategy','route','data']){
    await page.locator(`[data-step-pill="${step}"]`).click();await shot(step);
   }
   await page.locator('[data-step-pill="windows"]').click();
   const profile=stage==='three'?'p10.delta-three-window-optimized-1h.v2':'p10.delta-wfo-temporal-1h.v2';
   await page.locator(`[data-recipe="${profile}"]`).click();
   const fill=async(label,value)=>{const input=page.getByLabel(label,{exact:true});await input.fill(await input.getAttribute('type')==='date'?value.slice(0,10):value)};
   if(stage==='three'){
    for(const [label,value] of [['IS start (A)','2020-01-14'],['IS end · OOS start (B)','2024-10-01'],['OOS end · Holdout start (C)','2026-01-01'],['Holdout end exclusive (D)','2026-10-01']])await fill(label,value);
   }else{
    await fill('Analysis start','2020-01-14T00:00');await fill('Analysis end exclusive','2026-10-01T00:00');await fill('First OOS instant','2023-01-01T00:00');
    await page.getByLabel('Frequency',{exact:true}).selectOption('quarterly');
    await page.getByLabel('Window mode',{exact:true}).selectOption('expanding');
   }
   await page.waitForTimeout(1600);await shot('windows');
   await page.locator('[data-step-pill="parameters"]').click();await shot('parameters');
   await page.locator('[data-step-pill="optimization"]').click();await shot('optimization');
   assert.equal(await page.getByLabel('Optuna trials',{exact:true}).inputValue(),'3','PUBLISHED_RECIPE_DEFAULT');
   assert.equal(await page.getByLabel('Random seed',{exact:true}).inputValue(),'42');
   await page.locator('[data-step-pill="review"]').click();await shot('review');
   const preflightResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/research/preflights'&&r.request().method()==='POST',{timeout:180000});
   const preflight=page.locator('[data-action="preflight"]');assert(await preflight.isEnabled(),'PREFLIGHT_ENABLED_ON_ACTUAL_REVIEW');await preflight.click();
   const pr=await preflightResponse;const pb=await pr.json();
   save('preflight.json',{status:pr.status(),request:pr.request().postDataJSON(),body:pb});
   if(!pr.ok()){await shot('preflight-refused');throw new Error('PREFLIGHT_REFUSED '+pr.status()+' '+JSON.stringify(pb.error??pb).slice(0,600))}
   await shot('preflight');
   const create=page.locator('[data-action="create-run"]');await create.waitFor({timeout:30000});
   assert(await create.isEnabled(),'CREATE_ENABLED_WITH_FRESH_PREFLIGHT');
   const createdResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/research/runs'&&r.request().method()==='POST',{timeout:60000});
   await create.click();const cr=await createdResponse,cb=await cr.json();
   save('created.json',{status:cr.status(),request:cr.request().postDataJSON(),body:cb});assert(cr.ok(),'ORDINARY_RUN_CREATE');
   const id=cb.run_id??cb.run?.run_id;assert(id,'RUN_ID_REQUIRED');
   console.log(JSON.stringify({stage,run_id:id,create_status:cr.status()}));
   const timeline=[],deadline=Date.now()+45*60*1000;let state;
   while(Date.now()<deadline){
    const p=await page.request.get(BASE+'/api/v1/research/runs/'+id+'/progress');assert(p.ok(),'PROGRESS_READ');
    const body=await p.json();state=body.current?.effective_status;
    const entry={at:new Date().toISOString(),state,materialization:body.current?.terminal_materialization,seq:body.current?.source_latest_sequence};
    timeline.push(entry);if(timeline.length===1||JSON.stringify(timeline.at(-2)?.state)!==JSON.stringify(state))console.log(JSON.stringify(entry));
    if(['COMPLETED','FAILED','CANCELLED'].includes(state)&&entry.materialization!=='PENDING'){
     save('terminal-progress.json',body);break;
    }
    await new Promise(r=>setTimeout(r,6000));
   }
   save('journey.json',{stage,run_id:id,state,shots,timeline,errors,responses});
   await shot('terminal');assert.equal(state,'COMPLETED','ENGINE_COMPLETION');
   assert.equal(timeline.at(-1)?.materialization,'READY','TERMINAL_MATERIALIZATION_READY');
   const hub=await get('hub.json','/api/v1/quantbt/runs/'+id+'/evidence');
   console.log(JSON.stringify({run_id:id,state,windows:hub.enriched_analysis?.windows}));
   for(const screen of ['evidence','split','search','freeze','execute','report','release-candidate']){
    await page.goto(BASE+'/research/quantbt/runs/'+id+'/'+screen,{waitUntil:'networkidle'});await shot(screen);
   }
   for(const window of ['is','oos','holdout']){
    await page.goto(BASE+'/research/quantbt/runs/'+id+'/evidence?window='+window,{waitUntil:'networkidle'});await shot('evidence-'+window);
   }
   save('browser-closeout.json',{errors,responses,shots});
  }
 }
 await page.screenshot({path:resolve(out,'new-run-probe.png'),fullPage:true});
 save('ui.json',{text:await page.locator('main').innerText(),inputs:await page.locator('input').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),type:e.type,value:e.value}))),selects:await page.locator('select').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),id:e.id,options:Array.from(e.options).map(o=>({value:o.value,text:o.text,disabled:o.disabled}))}))),errors,responses});
 console.log((await page.locator('main').innerText()).slice(0,10000));
 }
}finally{await browser.close()}
