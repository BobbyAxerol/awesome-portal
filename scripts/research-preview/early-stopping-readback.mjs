#!/usr/bin/env node
// Readback/negative closeout only. Never creates or reruns an engine job.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';
const [root]=process.argv.slice(2),base='http://localhost:8095';
assert(root?.startsWith('/home/bobby/.local/state/portal-research-p23/early-stopping-'));
const out=resolve(root,'final-readback');mkdirSync(out,{recursive:true,mode:0o700});
const redact=(v)=>Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(
  Object.entries(v).map(([k,x])=>[k,/token|secret|credential|cookie|jwt/i.test(k)?'[REDACTED]':redact(x)])):v;
const save=(name,data)=>{const path=resolve(out,name);assert(!existsSync(path));writeFileSync(path,JSON.stringify(redact(data),null,2)+'\n',{mode:0o600})};
const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];assert(origin);
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1280,height:1000},
  extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}}),page=await context.newPage();
let csrf;const errors=[];
try {
  const api=page.request,login=await api.post(base+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',
    credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});assert(login.ok());
  csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;assert(csrf);
  const spec=JSON.parse(readFileSync(resolve(root,'three/preflight.json'),'utf8')).request.requested_spec;
  const invalid=await api.post(base+'/api/v1/research/preflights',{headers:{origin,'x-portal-csrf':csrf},
    data:{requested_spec:{...spec,early_stopping:401}}});
  const problem=await invalid.json();save('invalid-patience.json',{status:invalid.status(),body:problem});
  assert([400,409].includes(invalid.status()));assert.match(JSON.stringify(problem),/early_stopping/);
  const cases=[];
  for(const kind of ['three','global','per-fold','null']) {
    const receipt=JSON.parse(readFileSync(resolve(root,kind,'receipt.json'),'utf8'));
    const response=await api.get(base+'/api/v1/research/runs/'+receipt.run_id+'/progress');assert(response.ok());
    const progress=await response.json();save(kind+'.progress.json',progress);
    assert.equal(progress.current.effective_status,'COMPLETED');assert.equal(progress.current.terminal_materialization,'READY');
    const search=await api.get(base+'/api/v1/quantbt/runs/'+receipt.run_id+'/current-source/search');assert(search.ok());
    const body=await search.json();save(kind+'.search.json',body);
    assert.equal(body.ledger.source_trial_count,receipt.source_trial_count);
    if(kind==='null')assert.equal(body.ledger.source_trial_count,receipt.requested_trials);
    cases.push({...receipt,study_counts:body.surfaces_by_study?.map(row=>row.surface.source_trial_count)??null});
  }
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  const first=cases[0];
  await page.goto(base+'/research/quantbt/runs/'+first.run_id+'/search',{waitUntil:'networkidle'});
  assert.match(await page.locator('main').innerText(),/390/,'ACTUAL_RETAINED_COUNT_VISIBLE');
  await page.screenshot({path:resolve(out,'three-search.png'),fullPage:true});
  const perFold=cases.find(row=>row.kind==='per-fold');
  await page.goto(base+'/research/quantbt/runs/'+perFold.run_id+'/search',{waitUntil:'networkidle'});
  assert.equal(await page.getByText('Unavailable',{exact:true}).count(),0,'INDEPENDENT_STUDIES_AVAILABLE');
  await page.screenshot({path:resolve(out,'per-fold-search.png'),fullPage:true});
  save('identity.json',JSON.parse(readFileSync('/home/bobby/.config/portal-research-preview/identity.json','utf8')));
  save('receipt.json',{recorded_at_utc:new Date().toISOString(),cases,errors,new_engine_jobs:0});
  assert.equal(errors.length,0);console.log(JSON.stringify({cases,errors:errors.length,new_engine_jobs:0}));
} finally {
  if(csrf){const r=await page.request.post(base+'/api/auth/logout',{headers:{origin,'x-portal-csrf':csrf}});assert(r.ok(),'OWN_REVIEW_SESSION_REVOKED')}
  await browser.close();
}
