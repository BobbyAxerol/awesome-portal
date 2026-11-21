#!/usr/bin/env node
// Optional patience qualification through ordinary Portal APIs, never direct engine calls.
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';

const [kind,out]=process.argv.slice(2),base='http://localhost:8095';
assert(['three','global','per-fold','null'].includes(kind),'EXPLICIT_BOUNDED_CASE_REQUIRED');
assert(out?.startsWith('/home/bobby/.local/state/portal-research-p23/early-stopping-'),'PRIVATE_RECEIPT_PATH_REQUIRED');
mkdirSync(out,{recursive:true,mode:0o700});
// Receipts contain product facts, never credentials, CSRF or preflight tokens.
const redact=(value)=>Array.isArray(value)?value.map(redact):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).map(([key,row])=>[key,/token|credential|secret|cookie|jwt/i.test(key)?'[REDACTED]':redact(row)])):value;
const save=(name,data)=>{const path=resolve(out,name);assert(!existsSync(path),'IMMUTABLE_RECEIPT');
  writeFileSync(path,JSON.stringify(redact(data),null,2)+'\n',{mode:0o600})};
const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];
assert(origin);
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1280,height:1000},extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
const page=await context.newPage(),errors=[];
const api=page.request;
let csrf;
try {
  const login=await api.post(base+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',
    credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});
  assert(login.ok(),'NORMAL_PREVIEW_REVIEW_SESSION');
  csrf=(await context.cookies()).find(row=>row.name==='__Host-portal_csrf')?.value;
  assert(csrf,'CSRF_REQUIRED');
  const get=async(name,path)=>{const r=await api.get(base+path),body=await r.json();save(name,{status:r.status(),body});
    assert(r.ok(),path+': '+r.status());return body};
  const post=async(name,path,request)=>{const r=await api.post(base+path,{headers:{origin,'x-portal-csrf':csrf},data:request,timeout:180000});
    const body=await r.json();save(name,{status:r.status(),request,body});assert(r.ok(),path+': '+r.status()+' '+(body.error?.code??''));return body};
  const atlas=await get('atlas.json','/api/v1/research/quantbt/atlas');
  const release=atlas.atlas.current_release;
  const binding={alpha_id:'delta-rsi-polynomial-alpha',alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_2'};
  const setup=await get('setup.json','/api/v1/research/runs/setup-options?'+new URLSearchParams({...binding,dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe:'1h'}));
  const profileId=kind==='global'?'p10.delta-pct-equity-wfo-temporal-1h.v2':kind==='per-fold'?'p10.delta-pct-equity-per-fold-decay-1h.v2':'p10.delta-pct-equity-three-window-optimized-1h.v2';
  const profile=setup.profiles.find(row=>row.profile_id===profileId);
  assert.equal(profile?.state,'ENABLED');assert.equal(profile.early_stopping_policy,'OPTIONAL');
  assert.deepEqual(profile.early_stopping_guidance.suggested_range_ratio,[0.5,0.75]);
  let spec;
  if(kind==='three') {
    page.on('pageerror',e=>errors.push(e.message));
    // Forward actual POSTs with deployment Origin, never synthesize an API response.
    await page.route('**/api/**',route=>route.request().method()==='GET'?route.continue():
      route.fetch({headers:{...route.request().headers(),origin},timeout:180000}).then(response=>route.fulfill({response})));
    await page.goto(base+'/research/quantbt/runs/new',{waitUntil:'networkidle'});
    await page.getByLabel('Alpha',{exact:true}).selectOption(binding.alpha_id);
    await page.getByLabel('Alpha version',{exact:true}).selectOption(binding.alpha_version_id);
    await page.locator('[data-step-pill="data"]').click();
    await page.getByLabel('Dataset',{exact:true}).selectOption('crypto-binance-1m');
    await page.getByLabel('Symbol',{exact:true}).fill('BTCUSDT');
    await page.locator('[data-timeframe-chips] button, [data-timeframe-chips] [role=radio]').filter({hasText:/^1h$/}).first().click();
    await page.locator('[data-step-pill="windows"]').click();
    await page.locator(`[data-recipe="${profileId}"]`).click();
    for(const [label,date] of [['IS start (A)','2026-08-01'],['IS end · OOS start (B)','2026-08-22'],
      ['OOS end · Holdout start (C)','2026-08-29'],['Holdout end exclusive (D)','2026-09-05']])
      await page.getByLabel(label,{exact:true}).fill(date);
    await page.locator('[data-step-pill="optimization"]').click();
    await page.getByLabel('Optuna trials',{exact:true}).fill('400');
    assert.equal(await page.getByLabel('Early stopping',{exact:true}).inputValue(),'','SUGGESTION_NOT_AUTO_FILLED');
    assert.match(await page.locator('main').innerText(),/200–300; ≈267 per study/);
    for(const width of [1280,660]) {await page.setViewportSize({width,height:1000});
      await page.screenshot({path:resolve(out,'suggestion-'+width+'.png'),fullPage:true});}
    await page.getByLabel('Early stopping',{exact:true}).fill('200');
    await page.locator('[data-step-pill="review"]').click();
    const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/research/preflights'&&r.request().method()==='POST',{timeout:180000});
    await page.locator('[data-action="preflight"]').click();
    const r=await response,body=await r.json();spec=r.request().postDataJSON().requested_spec;
    save('preflight.json',{status:r.status(),request:r.request().postDataJSON(),body});
    assert(r.ok(),'REAL_BROWSER_PREFLIGHT');assert.equal(body.may_create_run,true);
    assert.equal(body.gates.find(row=>row.gate==='execution_admission')?.state,'PASS');
    assert.equal(spec.early_stopping,200);assert.equal(spec.optuna_trials,400);
    const invalid=await api.post(base+'/api/v1/research/preflights',{
      headers:{origin,'x-portal-csrf':csrf},data:{requested_spec:{...spec,early_stopping:401}}});
    const problem=await invalid.json();save('invalid-patience.json',{status:invalid.status(),body:problem});
    assert([400,409].includes(invalid.status()),'INVALID_PATIENCE_REFUSED_BEFORE_CREATE');
    assert.match(JSON.stringify(problem),/early_stopping/,'EXACT_FIELD_REFUSAL');
    const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/research/runs'&&r.request().method()==='POST',{timeout:60000});
    await page.locator('[data-action="create-run"]').click();
    const cr=await created,cb=await cr.json();save('created.json',{status:cr.status(),request:cr.request().postDataJSON(),body:cb});assert(cr.ok(),'REAL_BROWSER_CREATE');
  } else {
    const first=JSON.parse(readFileSync(resolve(out,'../three/preflight.json'),'utf8')).request.requested_spec;
    spec=structuredClone(first);
    spec.optuna_trials=kind==='null'?3:20;spec.early_stopping=kind==='null'?null:3;
    if(kind!=='null') {
      spec.schema_version='research.requested-spec.v2';spec.route_params={};
      spec.protocol='advanced';spec.optimization_schedule=kind==='global'?'global':'per_fold_decay';delete spec.windows;
      spec.walk_forward={start:'2026-07-01T00:00:00Z',end_exclusive:'2026-08-24T00:00:00Z',
        split_mode:'2026-08-03T00:00:00Z',frequency:'weekly',window_mode:'expanding',label_horizon_bars:0,purge_bars:0,embargo_bars:0};
    }
    const pf=await post('preflight.json','/api/v1/research/preflights',{requested_spec:spec});
    assert.equal(pf.may_create_run,true);assert.equal(pf.gates.find(row=>row.gate==='execution_admission')?.state,'PASS');
    await post('created.json','/api/v1/research/runs',{schema_version:'research.run-create.v1',client_intent_id:randomUUID(),
      intent_kind:'NEW',requested_spec:spec,preflight_token:pf.preflight_token});
  }
  const created=JSON.parse(readFileSync(resolve(out,'created.json'),'utf8')).body,id=created.run_id??created.run?.run_id;
  assert(/^rrun_[a-f0-9]{32}$/.test(id),'ORDINARY_RUN_ID');
  console.log(JSON.stringify({kind,run_id:id,trials:spec.optuna_trials,early_stopping:spec.early_stopping}));
  const timeline=[],deadline=Date.now()+15*60*1000;let state;
  while(Date.now()<deadline) {
    const r=await api.get(base+'/api/v1/research/runs/'+id+'/progress'),body=await r.json();assert(r.ok());
    const entry={at:new Date().toISOString(),state:body.current?.effective_status,materialization:body.current?.terminal_materialization};
    if(!timeline.length||entry.state!==timeline.at(-1).state)console.log(JSON.stringify(entry));timeline.push(entry);state=entry.state;
    if(['COMPLETED','FAILED','CANCELLED'].includes(state)&&entry.materialization!=='PENDING') {save('progress.json',body);break;}
    await new Promise(r=>setTimeout(r,6000));
  }
  save('timeline.json',timeline);assert.equal(state,'COMPLETED');assert.equal(timeline.at(-1).materialization,'READY');
  const search=await get('search.json','/api/v1/quantbt/runs/'+id+'/current-source/search');
  await get('evidence.json','/api/v1/quantbt/runs/'+id+'/current-source/evidence');
  await get('freeze.json','/api/v1/quantbt/runs/'+id+'/current-source/freeze');
  save('identity.json',JSON.parse(readFileSync('/home/bobby/.config/portal-research-preview/identity.json','utf8')));
  const receipt={kind,run_id:id,recorded_at_utc:new Date().toISOString(),requested_trials:spec.optuna_trials,
    early_stopping:spec.early_stopping,source_trial_count:search.ledger.source_trial_count,
    terminal:state,materialization:'READY',errors};
  save('receipt.json',receipt);assert.equal(errors.length,0);console.log(JSON.stringify(receipt));
} finally {
  if(csrf) {const r=await api.post(base+'/api/auth/logout',{headers:{origin,'x-portal-csrf':csrf}});assert(r.ok(),'OWN_REVIEW_SESSION_REVOKED');}
  await browser.close();
}
