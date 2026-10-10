/** UDB-03 scoped real-preview + explicitly injected context-failure regression. No engine/business writes. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
// Public preview adds Cloudflare's site analytics script; separate telemetry from inter-cell/business-data requests.
const telemetryOrigin='https://static.cloudflareinsights.com';
if(process.argv[2]==='--verify-receipt') {
  const file=resolve(process.argv[3]);assert(file.startsWith('/home/bobby/.local/state/portal-udb03/'));
  const raw=readFileSync(file), r=JSON.parse(raw);
  for(const key of ['errors','console','streams','writes'])assert.deepEqual(r[key],[]);
  assert(r.external.every(origin=>origin===telemetryOrigin));assert.equal(r.logout,201);assert.equal(r.cells.length,6);
  assert.deepEqual(r.faults.map(f=>f.name),['503','malformed-clock','401']);
  assert(r.faults.slice(0,2).every(f=>f.retained===true&&f.quietSeconds===16));assert.equal(r.faults[2].contextRebound,true);
  for(const width of [1280,660])assert.equal(r.cells.filter(c=>c.width===width&&c.overflow===0).length,3);
  for(const cell of r.cells){assert(/^\d+-\d+\.png$/.test(cell.screenshot));assert.equal(createHash('sha256').update(readFileSync(resolve(dirname(file),cell.screenshot))).digest('hex'),cell.sha256);}
  const result={status:'PASS_AFTER_PUBLIC_TELEMETRY_CLASSIFICATION',raw_status:r.status,raw_sha256:createHash('sha256').update(raw).digest('hex'),
    cells:r.cells.length,faults:r.faults.length,external_business_data_requests:0,cloudflare_script_requests:r.external.length,logout:r.logout,
    reason:'Original final harness reached all functional/fault checks, then rejected configured Cloudflare analytics; raw receipt and screenshots are unchanged.'};
  writeFileSync(resolve(dirname(file),'browser-qualification.json'),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result));process.exit(0);
}
const require=createRequire(resolve('apps/portal/frontend/package.json'));
const {chromium}=require('playwright');
const origin=process.env.UDB_BROWSER_ORIGIN??'https://research-portal.primusspark.com';
const output=process.env.UDB_BROWSER_OUTPUT;
assert(output?.startsWith('/home/bobby/.local/state/portal-udb03/'));
mkdirSync(output,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();const page=await context.newPage();
const receipt={origin,lane:'REAL_PREVIEW_WITH_EXPLICIT_CONTEXT_FAULT_INJECTION',cells:[],requests:[],streams:[],writes:[],external:[],errors:[],console:[],expectedFaultConsole:[],faults:[],logout:null};
let fault=null;
page.on('pageerror',e=>receipt.errors.push(e.message));
page.on('console',m=>{if(!['warning','error'].includes(m.type()))return;
  const item={type:m.type(),text:m.text(),url:m.location().url};
  if(fault&&item.url.includes('/execution/retained-review'))receipt.expectedFaultConsole.push(item);else receipt.console.push(item);});
page.on('request',r=>{const u=new URL(r.url());if(u.origin!==origin&&!['data:','blob:'].includes(u.protocol))receipt.external.push(u.origin);
  if(u.pathname.includes('/stream')||u.pathname.includes('/realtime-snapshot'))receipt.streams.push(u.pathname);
  if(u.pathname.startsWith('/api/'))receipt.requests.push({path:u.pathname,method:r.method()});
  if(u.pathname.startsWith('/api/')&&!['GET','HEAD','OPTIONS'].includes(r.method()))receipt.writes.push({path:u.pathname,method:r.method()});});
const reviewPath='/api/v1/execution/retained-review';
const banner=()=>page.locator('[data-execution-preview="retained"]');
const reviewReads=()=>receipt.requests.filter(r=>r.path===reviewPath).length;
const quiet=async()=>{const n=receipt.requests.length;await page.waitForTimeout(16_000);assert.equal(receipt.requests.length,n,'unexpected periodic API read');};
const refresh=async()=>{
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===reviewPath);
  await banner().getByRole('button',{name:'Refresh',exact:true}).click();
  await (await response).finished();
};
try {
  await page.goto(origin+'/deployments/alphas',{waitUntil:'networkidle'});await banner().waitFor();
  const fleet=await page.evaluate(async()=>{const r=await fetch('/api/v1/execution/alphas?environment=all&limit=1');if(!r.ok)throw new Error('fleet '+r.status);return r.json();});
  const alpha=fleet.page.rows[0]?.alpha_id;assert(alpha,'retained alpha required');
  let baseline;
  for(const width of [1280,660]) {
    await page.setViewportSize({width,height:900});
    for(const path of ['/deployments/alphas',`/deployments/alphas/${encodeURIComponent(alpha)}`,'/deployments/paper']) {
      const before=reviewReads();await page.goto(origin+path,{waitUntil:'networkidle'});await banner().waitFor();
      assert.equal(reviewReads()-before,1,'one context read per document');
      assert.match(await banner().innerText(),/RETAINED REVIEW · STALE · PARTIAL/);
      const info=await page.evaluate(async()=>{const r=await fetch('/api/v1/execution/retained-review',{cache:'no-store'});return r.json();});
      baseline=info;assert.equal(info.stream_enabled,false);assert.equal(info.mutation_enabled,false);
      const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));assert.equal(overflow,0,path);
      const filename=`${width}-${receipt.cells.length}.png`;await page.screenshot({path:resolve(output,filename),fullPage:true});
      receipt.cells.push({width,path,overflow,screenshot:filename,sha256:createHash('sha256').update(readFileSync(resolve(output,filename))).digest('hex')});
    }
  }
  await quiet();
  // These are declared fault injections into the context response; all screen/data APIs still use the real isolated preview.
  for(const [name,payload,status] of [['503',{},503],['malformed-clock',{...baseline,profiles:baseline.profiles.map((p,i)=>i===0?{...p,source_as_of_ms:1e100}:p)},200]]) {
    fault=name;await page.route('**/api/v1/execution/retained-review',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)}));
    const before=reviewReads();await refresh();
    assert.equal(reviewReads()-before,1);await banner().waitFor();
    if(!await banner().locator('.exec-preview-details').evaluate(e=>e.open))await banner().getByText('Details',{exact:true}).click();
    assert.match(await banner().innerText(),/access not revalidated/);
    await quiet();receipt.faults.push({name,expectedStatus:status,retained:true,quietSeconds:16});
    await page.unroute('**/api/v1/execution/retained-review');fault=null;
    await refresh();
    await page.waitForFunction(()=>!document.querySelector('[data-execution-preview="retained"]')?.textContent.includes('access not revalidated'));
    assert.doesNotMatch(await banner().innerText(),/access not revalidated/);
  }
  fault='401';await page.route('**/api/v1/execution/retained-review',r=>r.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await banner().getByRole('button',{name:'Refresh',exact:true}).click();
  await page.locator('[data-problem="SESSION_EXPIRED"]').waitFor();assert.equal(await banner().count(),0);
  await page.unroute('**/api/v1/execution/retained-review');fault=null;
  await page.getByRole('button',{name:'Sign in again',exact:true}).click();await banner().waitFor();
  receipt.faults.push({name:'401',sessionGate:'SESSION_EXPIRED',contextRebound:true});
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.console,[]);assert.deepEqual(receipt.streams,[]);
  assert(receipt.external.every(origin=>origin===telemetryOrigin),'unexpected external business-data request');
  assert.deepEqual(receipt.writes,[]);receipt.status='PASS';
} finally {
  const csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;
  const response=await context.request.post(origin+'/api/auth/logout',{headers:{origin,...(csrf?{'x-portal-csrf':csrf}:{})}}).catch(()=>null);
  receipt.logout=response?.status()??null;
  if(receipt.logout!==201)receipt.status='CLEANUP_FAILED';
  writeFileSync(resolve(output,'browser.json'),JSON.stringify(receipt,null,2),{mode:0o600});
  await browser.close();
  console.log(JSON.stringify({status:receipt.status??'FAIL',cells:receipt.cells.length,faults:receipt.faults.length,errors:receipt.errors.length,console:receipt.console.length,streams:receipt.streams.length,writes:receipt.writes.length,logout:receipt.logout,output}));
}
