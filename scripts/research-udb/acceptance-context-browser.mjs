#!/usr/bin/env node
/** Scoped retained bootstrap fault proof. Responses are explicitly injected,
 * not relabelled as backend receipts; no permission/stream source is enabled. */
import assert from 'node:assert/strict';
import {privateWrite} from './acceptance-cell.mjs';
const {chromium}=await import(new URL('../../apps/portal/frontend/node_modules/playwright/index.mjs',import.meta.url));
const origin='https://research-portal.primusspark.com';
const browser=await chromium.launch({headless:true});
const checks=[];let passed=false;
try{
  for(const fault of [
    {name:'unavailable',status:503,body:{error:{code:'PORTAL_READ_STORE_UNAVAILABLE',message:'Read store unavailable.'}}},
    {name:'malformed',status:200,body:{schema_version:'execution.retained-review.v1',stream_enabled:true}},
    {name:'unauthorized',status:401,body:{error:{code:'AUTH_REQUIRED',message:'Authentication required.'}}},
    {name:'forbidden',status:403,body:{error:{code:'READ_DENIED',message:'Access denied.'}}},
  ]){
    const context=await browser.newContext(),page=await context.newPage();
    const calls=[],streams=[],console=[],errors=[],injectedHttpConsole=[];
    page.on('request',r=>{const path=new URL(r.url()).pathname;
      if(path==='/api/v1/execution/retained-review')calls.push(path);
      if(/\/(?:stream|realtime-snapshot)$/.test(path))streams.push(path);});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{
      if(!['warning','error'].includes(m.type()))return;
      // Chromium emits an HTTP resource error for the intentionally injected
      // refusal. Classify only this exact URL/status, never React/app warnings.
      if(fault.status>=400&&m.type()==='error'&&m.location().url===origin+'/api/v1/execution/retained-review'
        &&m.text().startsWith('Failed to load resource:')&&m.text().includes('status of '+fault.status))
        injectedHttpConsole.push(m.text());
      else console.push(m.text());
    });
    await page.route(origin+'/api/v1/execution/retained-review',async route=>{
      // A pending request must not permit a historical published stream bit.
      await new Promise(r=>setTimeout(r,300));
      await route.fulfill({status:fault.status,contentType:'application/json',body:JSON.stringify(fault.body)});
    });
    try{
      await page.goto(origin+'/execution',{waitUntil:'networkidle'});
      if(fault.status===401){
        await page.getByText('Portal session expired',{exact:true}).waitFor();
        assert.equal(await page.locator('#portal-content').count(),0,'EXPIRED_SESSION_MUST_UNMOUNT_SHELL');
        assert.equal(await page.getByRole('button',{name:'Sign in again',exact:true}).count(),1);
      }else{
        await page.locator('#portal-content').waitFor();
        assert((await page.locator('#portal-content').innerText()).length>40,'RETAINED_FAILURE_BLANK_SCREEN');
      }
      await page.waitForTimeout(1000);
      assert.equal(calls.length,1,'CONTEXT_ONCE');assert.deepEqual(streams,[]);
      assert.deepEqual(errors,[]);assert.deepEqual(console,[]);
      assert(injectedHttpConsole.length<=1,'UNEXPECTED_EXTRA_INJECTED_HTTP_ERROR');
      checks.push({name:fault.name,status:fault.status,context_reads:calls.length,bootstrap_or_stream_calls:0,
        errors:0,application_console:0,injected_http_console:injectedHttpConsole.length,
        expired_session_unmount:fault.status===401,passed:true});
    }finally{
      const csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;
      const logout=await context.request.post(origin+'/api/auth/logout',{headers:{origin,...(csrf?{'x-portal-csrf':csrf}:{})}});
      assert.equal(logout.status(),201);
      if(checks.at(-1)?.name===fault.name)checks.at(-1).logout=201;
      await context.close();
    }
  }
  passed=true;
  console.log(JSON.stringify({passed:true,cases:checks.length,bootstrap_or_stream_calls:0}));
}finally{
  privateWrite('context-browser-faults.json',{passed,origin,injected_not_source_authority:true,checks});
  await browser.close();
}
