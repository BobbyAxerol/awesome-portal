// UDB03 read-only real-browser existing rich routes. No baseline updates/FE edits.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=process.argv[2];assert(output?.startsWith('/home/bobby/.local/state/portal-udb03/'));
mkdirSync(output,{recursive:true,mode:0o700});
const origin='https://research-portal.primusspark.com';
const sql=text=>JSON.parse(execFileSync('sudo',['-n','docker','exec','portal-research-preview-portal-postgres-1','psql','-U','portal','-d','portal_control','-Atc',text],{encoding:'utf8'}));
const publication=sql(`SELECT row_to_json(t) FROM (SELECT run_id,workspace_id,approval_id,release_candidate_id FROM research.release_candidate_publications_v1
  WHERE actor_username='claude-preview' AND state='DELIVERED' ORDER BY published_at DESC LIMIT 1)t`);
const {chromium}=await import(new URL('../../apps/portal/frontend/node_modules/playwright/index.mjs',import.meta.url));
const browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
const receipt={status:'IN_PROGRESS',origin,browser:browser.version(),cells:[],api:[],errors:[],console:[],failed:[],streams:[],writes:[],external:[],logout:null};
let cell='entry';
page.on('pageerror',e=>receipt.errors.push({cell,message:e.message}));
page.on('console',m=>{if(['error','warning'].includes(m.type()))receipt.console.push({cell,type:m.type(),text:m.text()});});
page.on('request',r=>{const u=new URL(r.url());
  if(u.pathname.startsWith('/api/v1/execution/')&&/stream|\/events(?:\/|$)/.test(u.pathname))receipt.streams.push({cell,path:u.pathname});
  if(u.pathname.startsWith('/api/')&&r.method()!=='GET'&&!['/api/auth/logout'].includes(u.pathname))receipt.writes.push({cell,path:u.pathname,method:r.method()});
  if(u.origin!==origin&&!['blob:','data:'].includes(u.protocol)&&u.origin!=='https://static.cloudflareinsights.com')receipt.external.push({cell,origin:u.origin,path:u.pathname});
});
page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/api/')&&r.status()>=400)receipt.failed.push({cell,path:u.pathname,status:r.status()});});
async function api(path){const r=await page.evaluate(async path=>{const r=await fetch(path,{credentials:'same-origin'});return{status:r.status,body:await r.json()};},path);
  receipt.api.push({path,status:r.status,schema:r.body.schema_version??null});assert.equal(r.status,200,path);return r.body;}
try{
  await page.goto(origin+'/research/quantbt/runs',{waitUntil:'networkidle'});
  receipt.bundle=(await page.content()).match(/\/assets\/index-[^"']+\.js/)?.[0];
  const review=await api('/api/v1/execution/retained-review');assert.equal(review.read_profile,'retained_review_v1');
  receipt.profile=review.read_profile;receipt.source_workspace=review.workspace_id;receipt.profile_permissions=review.permissions;
  const fleet=await api('/api/v1/execution/alphas?environment=all&limit=1');const alpha=fleet.page.rows[0].alpha_id;
  const portfolios=await api('/api/v1/execution/portfolios?environment=all');const portfolio=portfolios.items[0].portfolio_id;
  const scope='workspace_id='+encodeURIComponent(publication.workspace_id);
  const r1=`/governance/approvals/${publication.approval_id}/r1?${scope}`;
  await api(`/api/v1/execution/governance/approvals/${publication.approval_id}/r1?${scope}`);
  const routes=['/research/quantbt/runs','/research/quantbt/atlas','/execution','/execution/operations','/governance/approvals','/governance/waivers',
    '/deployments/alphas',`/deployments/alphas/${encodeURIComponent(alpha)}`,'/deployments/portfolios',`/deployments/portfolios/${encodeURIComponent(portfolio)}`,
    '/deployments/accounts','/deployments/paper','/deployments/sandbox','/deployments/live','/deployments/blotter','/administration/actions',
    `/research/quantbt/runs/${publication.run_id}/release-candidate?${scope}`,r1];
  for(const width of [1280,660]){
    await page.setViewportSize({width,height:900});
    for(const path of routes){
      cell=width+':'+path;await page.goto(origin+path,{waitUntil:'networkidle'});await page.locator('#portal-content').waitFor();
      const text=await page.locator('#portal-content').innerText();assert(text.length>40,'blank rich route: '+cell);
      const item={width,path,headings:await page.locator('#portal-content h1').allTextContents(),
        overflow:await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth})),
        tabs:await page.getByRole('tab').allTextContents(),text_sha256:createHash('sha256').update(text).digest('hex')};
      if(path==='/deployments/alphas'||path.includes(alpha)||path.includes(portfolio)||path===r1||path==='/execution'){
        item.screenshot=`${width}-${receipt.cells.length}.png`;await page.screenshot({path:resolve(output,item.screenshot),fullPage:true});
        item.screenshot_sha256=createHash('sha256').update(readFileSync(resolve(output,item.screenshot))).digest('hex');
      }
      receipt.cells.push(item);
      if(path.includes(alpha)||path.includes(portfolio)){
        for(const name of item.tabs.map(name=>name.trim())){
          const tab=page.getByRole('tab',{name,exact:true}).first();if(await tab.isDisabled())continue;
          cell=width+':'+path+':'+name;await tab.click();await page.waitForLoadState('networkidle');
          const panel=await page.locator('#portal-content').innerText();assert(panel.length>40,'blank subpanel: '+cell);
          receipt.cells.push({width,path:page.url().slice(origin.length),tab:name,text_sha256:createHash('sha256').update(panel).digest('hex')});
        }
      }
      if(path===r1){await page.reload({waitUntil:'networkidle'});assert.equal(new URL(page.url()).searchParams.get('workspace_id'),publication.workspace_id);}
    }
  }
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.streams,[]);assert.deepEqual(receipt.writes,[]);assert.deepEqual(receipt.external,[]);
  receipt.status=receipt.console.length||receipt.failed.length?'FUNCTIONAL_READS_WITH_CONSUMER_HANDOFF':'EXISTING_RICH_ROUTES_PASS';
}finally{
  const csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;
  const response=await context.request.post(origin+'/api/auth/logout',{headers:{origin,...(csrf?{'x-portal-csrf':csrf}:{})}}).catch(()=>null);
  receipt.logout=response?.status()??null;writeFileSync(resolve(output,'browser.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  await browser.close();console.log(JSON.stringify({status:receipt.status,cells:receipt.cells.length,console:receipt.console.length,
    failed:receipt.failed.length,streams:receipt.streams.length,writes:receipt.writes.length,logout:receipt.logout,output}));
}
