#!/usr/bin/env node
/** GET-only product consumer check; normal login/logout and no engine rerun. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {chromium} from '../../apps/portal/frontend/node_modules/@playwright/test/index.mjs';
const run=process.argv.find(a=>a.startsWith('--run='))?.slice(6),workspace=process.argv.find(a=>a.startsWith('--workspace='))?.slice(12);
assert(/^rrun_[a-z0-9]+$/.test(run)&&/^ws_[a-zA-Z0-9]+$/.test(workspace));
const home=`/home/bobby/.local/state/portal-research-p23/20261008/shared-limit-oco-search/${run}`;
mkdirSync(home,{recursive:true,mode:0o700});chmodSync(home,0o700);
const origin='https://research-portal.primusspark.com',baseURL='http://localhost:8095';
const receipt={run_id:run,workspace_id:workspace,started_at_utc:new Date().toISOString(),viewports:[],passed:false};
const save=()=>writeFileSync(`${home}/browser.json`,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1280,660]){
  const context=await browser.newContext({baseURL,viewport:{width,height:900},timezoneId:'UTC',locale:'en-US',
   extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
  const item={width,errors:[],warnings:[],failures:[],writes:[],passed:false};receipt.viewports.push(item);
  try{
   const login=await context.request.post('/api/auth/login',{headers:{origin},data:{username:'claude-preview',
    credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});assert(login.status()<300);
   const page=await context.newPage();page.on('pageerror',e=>item.errors.push(e.message));
   page.on('console',m=>{if(m.type()==='error')item.errors.push(m.text());if(m.type()==='warning')item.warnings.push(m.text());});
   page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)item.failures.push(`${r.status()} ${new URL(r.url()).pathname}`);});
   page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')item.writes.push(`${r.method()} ${new URL(r.url()).pathname}`);});
   await page.goto(`/research/quantbt/runs/${run}/execute?workspace_id=${workspace}`,{waitUntil:'networkidle',timeout:60000});
   item.bundle=await page.locator('script[type="module"][src]').getAttribute('src');
   const card=page.locator('[data-window-replay]');await card.waitFor({state:'visible',timeout:30000});
   if(!(await card.evaluate(e=>e.open)))await card.locator('summary').click();
   await card.locator('[data-window="IS"]').click();
   await page.waitForFunction(()=>document.querySelector('[data-window-replay]')?.getAttribute('data-window-replay-state')==='ready');
   await card.locator('[data-record-kind="COMMAND"]').click();
   await card.locator('[data-journal-table="COMMAND"]').waitFor({state:'visible'});
   item.command_copy=await card.locator('[data-journal-table="COMMAND"]').innerText();
   assert(item.command_copy.includes('OCO')&&item.command_copy.includes('on parent full fill'),'SOURCE_PARENT_OCO_CONSUMED');
   await card.locator('[data-record-kind="LIFECYCLE"]').click();
   await card.locator('[data-journal-table="LIFECYCLE"]').waitFor({state:'visible'});
   item.lifecycle_copy=await card.locator('[data-journal-table="LIFECYCLE"]').innerText();
   assert(['activate','fill','cancel'].every(v=>item.lifecycle_copy.includes(v)),'SOURCE_LIFECYCLE_CONSUMED');
   item.no_overflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);assert(item.no_overflow);
   await page.screenshot({path:`${home}/s08-is-${width}.png`,fullPage:true});
   await card.locator('[data-window="HOLDOUT"]').click();await card.locator('[data-window-absent="NOT_PUBLISHED"]').waitFor({state:'visible'});
   item.holdout_reason=await card.locator('[data-window-absent="NOT_PUBLISHED"]').getAttribute('data-reason-code');
   assert.deepEqual(item.errors,[]);assert.deepEqual(item.warnings,[]);assert.deepEqual(item.failures,[]);assert.deepEqual(item.writes,[]);item.passed=true;
  }finally{
   const logout=await context.request.post('/api/auth/logout',{headers:{origin},data:{}});item.session_revoked=logout.status()<300;
   await context.close();save();
  }
  console.log(JSON.stringify({width,passed:item.passed,bundle:item.bundle}));
 }
 receipt.passed=receipt.viewports.every(i=>i.passed&&i.session_revoked);
}catch(e){receipt.failure=e.message;console.error('Shared S08 browser refused:',e.message);process.exitCode=1;}
finally{await browser.close();receipt.finished_at_utc=new Date().toISOString();save();}
