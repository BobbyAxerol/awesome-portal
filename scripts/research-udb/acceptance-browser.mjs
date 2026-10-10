#!/usr/bin/env node
/** Real preview routes, preserved design/baselines; no source or command write. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {docker,SOURCE,HOME,privateWrite} from './acceptance-cell.mjs';
const label=process.argv[2]??'browser';assert(/^[a-z][a-z0-9-]{0,47}$/.test(label));
const origin='https://research-portal.primusspark.com',out=join(HOME,label);mkdirSync(out,{recursive:true,mode:0o700});
const {chromium}=await import(new URL('../../apps/portal/frontend/node_modules/playwright/index.mjs',import.meta.url));
const {default:AxeBuilder}=await import(new URL('../../apps/portal/frontend/node_modules/@axe-core/playwright/dist/index.mjs',import.meta.url));
const publication=JSON.parse(docker(['exec',SOURCE+'-portal-postgres-1','psql','-X','-U','portal','-d','portal_control','-Atc',
  "SELECT row_to_json(x) FROM (SELECT run_id,workspace_id,approval_id,release_candidate_id FROM research.release_candidate_publications_v1 WHERE actor_username='claude-preview' AND state='DELIVERED' ORDER BY published_at DESC LIMIT 1)x"]));
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),page=await context.newPage();
const receipt={origin,browser:browser.version(),cells:[],errors:[],console:[],failed:[],streams:[],writes:[],external:[],a11y:[],passed:false};let cell='entry';
page.on('pageerror',e=>receipt.errors.push({cell,message:e.message}));
page.on('console',m=>{if(['warning','error'].includes(m.type()))receipt.console.push({cell,type:m.type(),text:m.text()});});
page.on('request',r=>{const u=new URL(r.url());if(/\/(?:stream|realtime-snapshot)$/.test(u.pathname))receipt.streams.push({cell,path:u.pathname});
  if(u.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method())&&
    !(u.pathname==='/api/auth/logout'&&r.method()==='POST'))receipt.writes.push({cell,path:u.pathname,method:r.method()});
  if(u.origin!==origin&&!['blob:','data:'].includes(u.protocol)&&u.origin!=='https://static.cloudflareinsights.com')receipt.external.push({cell,origin:u.origin});});
page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/api/')&&r.status()>=400)receipt.failed.push({cell,path:u.pathname,status:r.status()});});
async function api(path){const result=await page.evaluate(async path=>{const r=await fetch(path,{credentials:'same-origin'});return {status:r.status,body:await r.json()};},path);
  assert.equal(result.status,200,path);return result.body;}
try{
  await page.goto(origin+'/deployments/alphas',{waitUntil:'networkidle'});
  receipt.bundle=(await page.content()).match(/\/assets\/index-[^"']+\.js/)?.[0];
  const retained=await api('/api/v1/execution/retained-review');assert.equal(retained.read_profile,'retained_review_v1');
  assert.equal(retained.stream_enabled,false);assert.equal(retained.mutation_enabled,false);
  const alpha=(await api('/api/v1/execution/alphas?environment=all&limit=1')).page.rows[0].alpha_id;
  const portfolio=(await api('/api/v1/execution/portfolios?environment=all')).items[0].portfolio_id;
  const scope='workspace_id='+publication.workspace_id;
  const rc=`/research/quantbt/runs/${publication.run_id}/release-candidate?${scope}`,
    r1=`/governance/approvals/${publication.approval_id}/r1?${scope}`;
  cell='real-RC-to-R1';await page.goto(origin+rc,{waitUntil:'networkidle'});
  const actualLink=page.locator(`a[href*="/governance/approvals/${publication.approval_id}/r1"]`).first();
  assert.equal(await actualLink.count(),1,'REAL_RC_R1_LINK_MISSING');
  await actualLink.click();await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).searchParams.get('workspace_id'),publication.workspace_id);
  await page.reload({waitUntil:'networkidle'});
  assert.equal(new URL(page.url()).searchParams.get('workspace_id'),publication.workspace_id);
  receipt.rc_to_r1={run_id:publication.run_id,release_candidate_id:publication.release_candidate_id,
    approval_id:publication.approval_id,workspace_id:publication.workspace_id,clicked:true,reloaded:true};
  const routes=['/research/quantbt/runs','/research/quantbt/atlas','/execution','/execution/operations','/governance/approvals','/governance/waivers',
    '/deployments/alphas',`/deployments/alphas/${encodeURIComponent(alpha)}`,'/deployments/portfolios',`/deployments/portfolios/${encodeURIComponent(portfolio)}`,
    '/deployments/accounts','/deployments/paper','/deployments/sandbox','/deployments/live','/deployments/blotter','/administration/actions',rc,r1];
  for(const width of [1280,660]){
    await page.setViewportSize({width,height:900});
    for(const path of routes){
      cell=width+':'+path;await page.goto(origin+path,{waitUntil:'networkidle'});await page.locator('#portal-content').waitFor();
      const text=await page.locator('#portal-content').innerText();assert(text.length>40,'BLANK_ROUTE:'+cell);
      const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
      const item={width,path,overflow,text_sha256:createHash('sha256').update(text).digest('hex'),tabs:await page.getByRole('tab').allTextContents()};
      if(['/deployments/alphas','/execution',rc,r1].includes(path)){
        item.screenshot=`${width}-${receipt.cells.length}.png`;await page.screenshot({path:join(out,item.screenshot),fullPage:true});
        item.screenshot_sha256=createHash('sha256').update(readFileSync(join(out,item.screenshot))).digest('hex');
      }
      receipt.cells.push(item);
      if(path.includes(alpha)||path.includes(portfolio))for(const name of item.tabs.map(n=>n.trim())){
        const tab=page.getByRole('tab',{name,exact:true}).first();if(await tab.isDisabled())continue;
        cell=width+':'+path+':'+name;await tab.click();await page.waitForLoadState('networkidle');
        receipt.cells.push({width,path:page.url().slice(origin.length),tab:name,
          overflow:await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))});
      }
      if(path===r1){await page.reload({waitUntil:'networkidle'});assert.equal(new URL(page.url()).searchParams.get('workspace_id'),publication.workspace_id);}
      if(['/deployments/alphas','/execution',rc,r1].includes(path)){
        await page.keyboard.press('Tab');const focus=await page.evaluate(()=>({tag:document.activeElement?.tagName,
          text:document.activeElement?.textContent?.trim().slice(0,80)}));assert(focus.tag&&focus.tag!=='BODY','KEYBOARD_FOCUS_MISSING');
        item.keyboard_focus=focus;
        const a11y=await new AxeBuilder({page}).include('#portal-content').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        receipt.a11y.push({cell,violations:a11y.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
      }
    }
  }
  // New retained mode must be quiet on an idle document. Research polling is
  // intentionally not used as proof of Execution source streaming.
  await page.goto(origin+'/deployments/alphas',{waitUntil:'networkidle'});let idleCalls=0;
  const watch=r=>{if(new URL(r.url()).pathname.startsWith('/api/'))idleCalls++;};page.on('request',watch);
  await page.waitForTimeout(16000);page.off('request',watch);receipt.idle_api_calls=idleCalls;assert.equal(idleCalls,0);
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.console,[]);assert.deepEqual(receipt.failed,[]);
  assert.deepEqual(receipt.streams,[]);assert.deepEqual(receipt.writes,[]);assert.deepEqual(receipt.external,[]);
  receipt.passed=receipt.cells.every(c=>c.overflow===0)&&receipt.a11y.every(c=>c.violations.length===0);
}finally{
  const csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;
  const logout=await context.request.post(origin+'/api/auth/logout',{headers:{origin,...(csrf?{'x-portal-csrf':csrf}:{})}}).catch(()=>null);
  receipt.logout=logout?.status()??null;if(receipt.logout!==201)receipt.passed=false;
  writeFileSync(join(out,'browser.json'),JSON.stringify(receipt,null,2),{mode:0o600});privateWrite(label+'-summary.json',
    {passed:receipt.passed,cells:receipt.cells.length,overflow:receipt.cells.filter(c=>c.overflow>0),
      a11y:receipt.a11y.filter(c=>c.violations.length),console:receipt.console,failed:receipt.failed,
      errors:receipt.errors,streams:receipt.streams.length,writes:receipt.writes.length,logout:receipt.logout,bundle:receipt.bundle});
  await browser.close();console.log(JSON.stringify({passed:receipt.passed,cells:receipt.cells.length,
    overflow:receipt.cells.filter(c=>c.overflow>0).length,a11y:receipt.a11y.filter(c=>c.violations.length).length,
    console:receipt.console.length,failed:receipt.failed.length,logout:receipt.logout}));
}
