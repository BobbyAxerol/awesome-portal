#!/usr/bin/env node
/** Read-only final contract/custody proof. Not frontend visual acceptance. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';
import Ajv from '../../apps/control-api/node_modules/ajv/dist/2020.js';
import {previewCustodySnapshot} from '../research-p23/full03-preview-receipt.mjs';

const packet='/home/bobby/.local/state/portal-research-p23/window-execution-20261007';
const output=resolve(packet,'final-readback');assert(!existsSync(output),'IMMUTABLE_RECEIPT');
mkdirSync(output,{recursive:true,mode:0o700});
const apiContract=JSON.parse(readFileSync('packages/contracts/openapi/research-window-execution.openapi.json'));
const ajv=new Ajv({strict:false,allErrors:true}),validators={};
for(const name of ['WindowExecutionPage','WindowCompare'])validators[name]=ajv.compile({$ref:'#/components/schemas/'+name,components:apiContract.components});
const save=(name,body)=>writeFileSync(resolve(output,name),JSON.stringify(body,null,2)+'\n',{mode:0o600});
const calls=[],base='http://localhost:8095';
const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];
assert(origin);const browser=await chromium.launch(),context=await browser.newContext({extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
let csrf;
try{
  const login=await context.request.post(base+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});
  assert(login.ok());csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;assert(csrf);
  async function get(name,path,{schema='WindowExecutionPage',status=200}={}){
    const result=await context.request.get(base+path,{timeout:90000}),body=await result.json();
    assert.equal(result.status(),status,path);if(status===200)assert(validators[schema](body),JSON.stringify(validators[schema].errors));
    save(name,{path,status:result.status(),body});calls.push({path,status:result.status()});return body;
  }
  const runs={};
  for(const kind of ['three-a-final','three-b','wfo-accepted','bracket-qualified','reactive','event_driven']){
    const receipt=JSON.parse(readFileSync(resolve(packet,kind,'receipt.json'))),id=receipt.run_id;runs[kind]=id;
    const root=`/api/v1/quantbt/runs/${id}`;
    for(const window of ['IS','OOS','HOLDOUT']){
      if(kind==='wfo-accepted'&&window==='IS')continue;
      const analytics=await get(kind+'-'+window+'.json',root+'/windows/analytics?window='+window);
      if(kind.startsWith('three'))assert.equal(analytics.availability.state,'AVAILABLE');
      if(kind==='wfo-accepted'&&window==='HOLDOUT')assert.equal(analytics.availability.state,'NOT_APPLICABLE');
    }
    if(kind==='wfo-accepted'){
      for(const foldId of ['0','1','2']){
        const a=await get('wfo-fold-'+foldId+'.json',root+'/windows/analytics?window=IS&fold_id='+foldId);
        assert.equal(a.availability.state,'AVAILABLE');assert.equal(a.descriptor.authority,'FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC');
      }
    }
    if(['bracket-qualified','reactive','event_driven'].includes(kind)){
      const journal=await get(kind+'-journal.json',root+'/execution/records?window=OOS&limit=200');
      assert.equal(journal.availability.state,'AVAILABLE');assert(journal.rows.some(r=>r.payload.record_kind==='FILL'));
      if(kind==='bracket-qualified'){
        const fills=journal.rows.filter(r=>r.payload.record_kind==='FILL');
        assert(fills.every(r=>r.payload.fill_price===r.payload.price&&r.payload.fill_qty===r.payload.qty));
        const absent=await get('bracket-order-absence.json',root+'/execution/records?window=OOS&record_kind=ORDER');
        assert.equal(absent.availability.state,'NOT_PUBLISHED');assert.equal(absent.counts.matching,null);
      }
    }
  }
  for(const window of ['IS','OOS','HOLDOUT']){
    const c=await get('compare-'+window+'.json','/api/v1/quantbt/windows/compare?'+new URLSearchParams({runs:[runs['three-a-final'],runs['three-b']].join(','),window}),{schema:'WindowCompare'});
    assert(c.runs.every(r=>r.analysis.window===window));
  }
  const root=`/api/v1/quantbt/runs/${runs['three-a-final']}`;
  const page=await get('holdout-page.json',root+'/windows/observations?window=HOLDOUT&limit=10');assert(page.next_cursor);
  await get('foreign-workspace.json',root+'/windows/analytics?window=HOLDOUT&workspace_id=foreign-workspace',{status:404});
  await get('changed-limit-cursor.json',root+'/windows/observations?'+new URLSearchParams({window:'HOLDOUT',limit:'11',cursor:page.next_cursor}),{status:400});
  const anonymous=await browser.newContext();try{
    const denied=await anonymous.request.get(base+root+'/windows/analytics?window=HOLDOUT');assert.equal(denied.status(),401);
    save('anonymous-denied.json',{status:denied.status()});
  }finally{await anonymous.close();}
  const before=JSON.parse(readFileSync(resolve(packet,'custody-before.json'))),after=previewCustodySnapshot();
  for(const key of ['users_md5','legacy_av_md5','indexed_av_md5','alpha_pointer_md5','web_image_id','index'])assert.deepEqual(after[key],before[key],key);
  for(const prior of before.seals){const next=after.seals.find(s=>s.workspace_id===prior.workspace_id&&s.run_id===prior.run_id);assert.deepEqual(next,prior,'OLD_SEAL_IMMUTABLE:'+prior.run_id);}
  save('custody-after.json',after);
  const images={};for(const service of ['portal-api','control-api','portal-web','quant-worker-py']){
    const row=JSON.parse(execFileSync('sudo',['-n','docker','inspect','--format','{{json .}}','portal-research-preview-'+service+'-1'],{encoding:'utf8'}));
    assert.equal(row.Config.Labels['com.docker.compose.project'],'portal-research-preview');images[service]=row.Image;
    if(service==='control-api'||service==='portal-api'||service==='quant-worker-py'){
      const env=Object.fromEntries(row.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
      assert(!env.RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID,'QUALIFICATION_OVERRIDE_REMOVED');
    }
  }
  const protectedPath='apps/portal/strategy/main.py';
  const receipt={at_utc:new Date().toISOString(),result:'PASS',calls:calls.length,runs,images,old_seals_preserved:before.seals.length,
    protected_strategy_sha256:createHash('sha256').update(readFileSync(protectedPath)).digest('hex'),
    frontend_visual_acceptance:'NOT_RUN_BACKEND_SLICE_ONLY'};
  save('receipt.json',receipt);console.log(JSON.stringify(receipt));
}finally{
  if(csrf){const result=await context.request.post(base+'/api/auth/logout',{headers:{origin,'x-portal-csrf':csrf}});assert(result.ok(),'OWN_REVIEW_SESSION_REVOKED');}
  await browser.close();
}
