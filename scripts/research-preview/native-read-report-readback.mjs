#!/usr/bin/env node
/** Deployed backend API acceptance, not frontend/visual acceptance; no engine. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../apps/portal/frontend/node_modules/playwright/index.mjs';
import Ajv from '../../apps/control-api/node_modules/ajv/dist/2020.js';
import {savePrivate} from '../research-p23/api-client.mjs';

const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const [proofPath,out]=process.argv.slice(2);
for(const path of [proofPath,out])assert(path?.startsWith('/home/bobby/.local/state/portal-research-p23/'),'PRIVATE_RECEIPT_PATH_REQUIRED');
assert(!existsSync(out),'IMMUTABLE_RECEIPT');
const proof=JSON.parse(readFileSync(proofPath)),base='http://localhost:8095';
const workspace=proof.binding.workspace_id,run=proof.binding.run_id;
const identity=JSON.parse(readFileSync('/home/bobby/.config/portal-research-preview/identity.json'));
assert.equal(identity.project,'portal-research-preview');
const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').match(/^PORTAL_PUBLIC_ORIGIN=(.+)$/m)?.[1];
assert(origin);
const validators={},ajv=new Ajv({strict:false,allErrors:true});
for(const [file,names] of [['search',['SearchDetail']],['freeze',['FreezeDetail','FreezeVerification']],['report',['ReportDetail']]]){
  const d=JSON.parse(readFileSync(resolve(root,`packages/contracts/openapi/research-${file}.openapi.json`)));
  for(const name of names)validators[name]=ajv.compile({$ref:`#/components/schemas/${name}`,components:d.components});
}
const browser=await chromium.launch(),context=await browser.newContext({extraHTTPHeaders:{'x-dev-access-email':'claude-preview@azdag.com'}});
const calls=[];let csrf;let result;
const at=(id,operation,query={})=>`/api/v1/quantbt/runs/${id}/${operation}?`+new URLSearchParams({workspace_id:workspace,...query});
async function get(path,schema,status=200,headers={}){
  const r=await context.request.get(base+path,{timeout:60000,headers});
  assert.equal(r.status(),status,path);
  calls.push({method:'GET',path,status:r.status()});
  if(status===304)return null;
  const body=await r.json();
  if(schema)assert(validators[schema](body),JSON.stringify(validators[schema].errors));
  return body;
}
try{
  const login=await context.request.post(base+'/api/auth/login',{headers:{origin},data:{username:'claude-preview',credential:readFileSync('/home/bobby/.config/portal-research-preview/claude-preview.password','utf8').trim()}});
  assert(login.ok());csrf=(await context.cookies()).find(c=>c.name==='__Host-portal_csrf')?.value;assert(csrf);
  const auth=await get('/api/auth/context');assert.equal(auth.principal.username,'claude-preview');
  // Installed private signed transport (no source/transport substitution).
  const prepared=JSON.parse(execFileSync('sudo',['-n','docker','exec','portal-research-preview-control-api-1',
    'node','dist/cli/research-native-read-prepare.js','--workspace-id',workspace,'--actor-id',auth.principal.principalId,'--run-id',run],
    {encoding:'utf8',timeout:120000,maxBuffer:1024*1024}).trim().split('\n').at(-1));
  assert.equal(prepared.projection_digest,proof.preparation.digest);
  assert.equal(prepared.report_revision,proof.report.report_revision);
  const search=await get(at(run,'search',{native_limit:'20'}),'SearchDetail');
  const ids=search.native_search.ledger.rows.map(t=>t.trial_number);let cursor=search.native_search.ledger.next_cursor;
  while(cursor){const p=await get(at(run,'search',{native_limit:'20',native_cursor:cursor}),'SearchDetail');
    ids.push(...p.native_search.ledger.rows.map(t=>t.trial_number));cursor=p.native_search.ledger.next_cursor;}
  assert.equal(ids.length,100);assert.equal(new Set(ids).size,100);
  assert.equal(search.native_search.selected_trial_number,41);
  assert.equal(search.native_search.selection_process.retained_source_metadata.medoid_trial_number,41);
  const freeze=await get(at(run,'freeze'),'FreezeDetail'),report=await get(at(run,'report'),'ReportDetail');
  assert.equal(freeze.native_freeze.selected_parameters_digest,search.native_search.selected_parameters_digest);
  assert.equal(report.frozen_core.native_report.freeze.selected_parameters_digest,freeze.native_freeze.selected_parameters_digest);
  assert.equal(report.report_revision,proof.report.report_revision);
  for(const [operation,body] of [['search',search],['freeze',freeze],['report',report]]){
    await get(at(run,operation,operation==='search'?{native_limit:'20'}:{}),null,304,{'if-none-match':body.etag});
  }
  const vr=await context.request.post(base+at(run,'freeze/verify'),{headers:{origin,'x-portal-csrf':csrf},timeout:60000});
  assert.equal(vr.status(),200);const verify=await vr.json();
  assert(validators.FreezeVerification(verify),JSON.stringify(validators.FreezeVerification.errors));
  assert.equal(verify.native_freeze.selected_parameters_digest,freeze.native_freeze.selected_parameters_digest);
  assert.equal(verify.artifact_bytes.state,'MATCH');
  calls.push({method:'POST',path:at(run,'freeze/verify'),status:200});
  const fixed=[];
  for(const f of proof.fixed_native_reports){const r=await get(at(f.run_id,'report'),'ReportDetail');
    assert.equal(r.frozen_core.native_report.kind,'NATIVE_FIXED');assert.equal(r.frozen_core.native_report.optimization,null);
    fixed.push({run_id:f.run_id,revision:r.report_revision});}
  const exports=[];
  for(const entry of proof.exports){
    const path=at(run,`report/exports/${entry.status.job_id}`),status=await get(path);
    assert.equal(status.state,'READY');
    const dl=await context.request.get(base+at(run,`report/exports/${entry.status.job_id}/download`));
    assert.equal(dl.status(),200);const bytes=await dl.body(),sha=createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha,status.sha256);assert.equal(sha,entry.status.sha256);
    assert(bytes.includes(Buffer.from(entry.format==='REPORT_JSON'?'research.native-report.v1':'native_parameters')));
    calls.push({method:'GET',path:at(run,`report/exports/${entry.status.job_id}/download`),status:200});
    exports.push({format:entry.format,bytes:bytes.length,sha256:sha});
  }
  await get(at(run,'search',{native_limit:'20',native_cursor:'forged'}),null,400);
  await get(at(run,'report',{workspace_id:'ws_foreign_native_read_proof'}),null,404);
  const anonymous=await browser.newContext();try{assert.equal((await anonymous.request.get(base+at(run,'search'))).status(),401);}
  finally{await anonymous.close();}
  const wfo=await get(at('rrun_cf5ed033560082488b559baf29be4754','report'),'ReportDetail');
  assert(!wfo.frozen_core.native_report);
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
    ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  const wfoDigest=createHash('sha256').update(JSON.stringify(canonical(wfo.frozen_core))).digest('hex');
  assert.equal(wfoDigest,proof.wfo_digest_unchanged,'WFO_REPORT_CORE_IMMUTABLE');
  result={at_utc:new Date().toISOString(),result:'PASS',authority:'DEPLOYED_SHARED_PREVIEW_AUTHENTICATED_HTTP_AND_INSTALLED_PRIVATE_SIGNED_TRANSPORT',
    identity,calls,run_id:run,workspace_id:workspace,selected_trial_number:41,selected_trial_ordinal:42,trials_seen:ids.length,
    parameter_digest:freeze.native_freeze.selected_parameters_digest,report_revision:report.report_revision,verify,fixed_native_reports:fixed,exports,
    wfo_frozen_core_digest_unchanged:wfoDigest,engine_rerun:false,frontend_visual_acceptance:'PENDING_CLAUDE_CONSUMER',production_dev_main_changed:false};
}finally{
  if(csrf){const logout=await context.request.post(base+'/api/auth/logout',{headers:{origin,'x-portal-csrf':csrf}});assert(logout.ok(),'OWN_REVIEW_SESSION_REVOKED');}
  await browser.close();
}
result.own_review_session_revoked=true;savePrivate(out,result);
console.log(JSON.stringify({result:'PASS',calls:calls.length,run_id:run,trials:result.trials_seen,report_revision:result.report_revision,exports:result.exports,own_review_session_revoked:true}));
