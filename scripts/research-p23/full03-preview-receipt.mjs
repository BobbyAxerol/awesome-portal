#!/usr/bin/env node
/** Preview-only custody/setup probes. Never production login, password or business mutations. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {privateJson,savePrivate,readBoundedJson} from './api-client.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const PROJECT='portal-research-preview',BASE='http://localhost:8095';
const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',maxBuffer:4*1024*1024});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function snapshot(){
  const control=PROJECT+'-control-api-1',api=PROJECT+'-portal-api-1';
  const inspect=JSON.parse(docker(['inspect','--format','{{json .}}',control]));
  assert.equal(inspect.Config.Labels['com.docker.compose.project'],PROJECT);
  const env=Object.fromEntries(inspect.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
  assert.equal(env.AUTH_MODE,'dev');assert.equal(env.PORTAL_ENV,'local');
  const value=JSON.parse(docker(['exec',control,'node','-e',`
const {Pool}=require('pg'),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});
(async()=>{const r=await p.query(\`SELECT json_build_object(
 'seals',(SELECT coalesce(json_agg(x ORDER BY x.workspace_id,x.run_id),'[]') FROM
  (SELECT workspace_id,run_id,artifact_revision,manifest_digest,source_transform_digest,
    retained_import_digest,md5(summary::text) AS summary_md5 FROM research.current_source_seals_v1) x),
 'users_md5',(SELECT md5(string_agg(user_id||':'||status||':'||session_version::text||':'||must_change_password::text,',' ORDER BY user_id)) FROM portal_users),
 'legacy_av_md5',(SELECT md5(coalesce(string_agg(to_jsonb(v)::text,',' ORDER BY v.workspace_id,v.alpha_version_id),'')) FROM research.alpha_versions v WHERE alpha_version_id='av_delta_rsi_polynomial_alpha_1_0_0'),
 'alpha_pointer_md5',(SELECT md5(coalesce(string_agg(workspace_id||':'||alpha_id||':'||coalesce(active_version_id,''),',' ORDER BY workspace_id,alpha_id),'')) FROM research.alphas)
) AS data\`);process.stdout.write(JSON.stringify(r.rows[0].data))})().finally(()=>p.end()).catch(()=>{process.exitCode=1});`]).trim());
  const index=JSON.parse(docker(['exec',api,'python','-c',
    'import hashlib,json;from pathlib import Path;p=Path("/var/lib/portal/artifacts/runs/durable-store/research-dataset-index/current");r=p.read_text().strip();f=p.parent/(r+".json");print(json.dumps({"revision":r,"pointer_sha256":hashlib.sha256(p.read_bytes()).hexdigest(),"index_sha256":hashlib.sha256(f.read_bytes()).hexdigest()}))']).trim());
  const web=docker(['inspect','--format','{{.Image}}',PROJECT+'-portal-web-1']).trim();
  return {recorded_at_utc:new Date().toISOString(),project:PROJECT,...value,index,web_image_id:web};
}
export {snapshot as previewCustodySnapshot};
async function previewProbe(enabled,slice='full03',home){
  // Keep the connection loopback-only, but use the deployment-bound public
  // Origin for CSRF. The served preview is no longer configured as localhost;
  // never weaken its origin guard just to obtain a probe receipt.
  const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8')
    .split('\n').find(line=>line.startsWith('PORTAL_PUBLIC_ORIGIN='))?.slice('PORTAL_PUBLIC_ORIGIN='.length);
  assert(['http://localhost:8095','https://research-portal.primusspark.com'].includes(origin),
    'EXACT_RESEARCH_PREVIEW_ORIGIN_REQUIRED');
  const jar=new Map(),calls={};
  async function call(method,path,body){
    assert(path.startsWith('/api/'));
    const response=await fetch(BASE+path,{method,redirect:'manual',signal:AbortSignal.timeout(45000),
      headers:{origin,accept:'application/json','content-type':'application/json',connection:'close',
        cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),
        ...(method==='GET'?{}:{'x-portal-csrf':jar.get('__Host-portal_csrf')??''})},body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    const json=await readBoundedJson(response);assert(response.ok,'PREVIEW_NAMED_API:'+response.status+':'+(json.error?.code??'UNKNOWN'));
    calls[method+' '+path]={status:response.status,body:json};return json;
  }
  await call('GET','/api/auth/context');
  try{
    if(enabled)await call('POST','/api/v1/research/run-producer/p04-delta/install',{});
    const atlas=await call('GET','/api/v1/research/quantbt/atlas');
    const registry=JSON.parse(readFileSync(join(ROOT,'apps/portal/registry/research-execution-recipes.v1.json')));
    const exactIds=registry.recipes.filter(r=>r.descriptor.schema_version===`research.${slice}-delta-profile.v1`).map(r=>r.profile_id);
    assert.equal(exactIds.length,slice==='full04'?35:28);
    assert.equal(atlas.portal_admission.profiles.filter(r=>exactIds.includes(r.profile_id)).length,enabled?exactIds.length:0);
    for(const timeframe of ['1m','5m','15m','30m','1h','4h','1d']){
      const query=new URLSearchParams({alpha_id:'delta-rsi-polynomial-alpha',alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_1',
        dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe});
      const options=await call('GET','/api/v1/research/runs/setup-options?'+query);
      const active=options.profiles.filter(p=>p.state==='ENABLED'&&exactIds.includes(p.profile_id));
      assert.equal(active.length,enabled?(slice==='full04'?5:4):0);
      for(const profile of active)assert.equal(profile.budget.qualification,'PRODUCT_RUN_QUALIFIED');
      if(slice==='full04')assert.equal(options.profiles.filter(p=>p.state==='ENABLED'&&!exactIds.includes(p.profile_id)).length,4,
        'FULL03_PREDECESSOR_RECIPES_STAY_ENABLED');
    }
    if(slice==='full04'&&enabled){
      const facts=privateJson(join(home,'qualified-products-summary.json')).facts.filter(f=>f.timeframe==='1h');
      assert.equal(facts.length,5);
      for(const fact of facts){
        const spec=privateJson(join(home,fact.private_receipt)).run.requested_spec;
        const preflight=await call('POST','/api/v1/research/preflights',{requested_spec:spec});
        assert.equal(preflight.may_create_run,true,'SERVED_PREVIEW_MAY_CREATE:'+fact.profile_id);
      }
    }
    return {project:PROJECT,enabled,calls,passed:true};
  }finally{await call('POST','/api/auth/logout',{});}
}
export async function runPreviewReceipt(home,action,preserveConcurrentWebImage,slice='full03'){
  assert(['full03','full04'].includes(slice),'EXACT_RECIPE_SLICE');
  home=validateHome(home);assert(home.endsWith('/'+slice),'EXACT_PRIVATE_PROOF_HOME');
  assert(['before','enabled','disabled','after'].includes(action),'EXPLICIT_PREVIEW_PROBE_REQUIRED');
  const path=join(home,`preview-${action}.json`);assert(!existsSync(path),'PRIOR_PREVIEW_EVIDENCE_MUST_NOT_BE_OVERWRITTEN');
  if(action==='enabled'||action==='disabled'){
    const result=await previewProbe(action==='enabled',slice,home);savePrivate(path,result);
    console.log(JSON.stringify({passed:true,action,external_execution_calls:0,setup_checks:7,
      preflight_checks:slice==='full04'&&action==='enabled'?5:0}));
  }else{
    const result=snapshot();
    if(action==='after'){
      const before=privateJson(join(home,'preview-before.json'));
      for(const key of ['seals','users_md5','legacy_av_md5','alpha_pointer_md5','index'])assert.deepEqual(result[key],before[key],'PREVIEW_CUSTODY_CHANGED:'+key);
      if(preserveConcurrentWebImage===undefined){
        assert.equal(result.web_image_id,before.web_image_id,'PREVIEW_CUSTODY_CHANGED:web_image_id');
      }else{
        assert(/^sha256:[a-f0-9]{64}$/.test(preserveConcurrentWebImage),'EXACT_CONCURRENT_FRONTEND_IMAGE_REQUIRED');
        assert.equal(result.web_image_id,preserveConcurrentWebImage,'DO_NOT_OVERWRITE_CONCURRENT_FRONTEND');
        const web=JSON.parse(docker(['inspect','--format','{{json .}}',PROJECT+'-portal-web-1']));
        assert.equal(web.Config.Labels['com.docker.compose.project.working_dir'],'/home/bobby/portal-research-fe',
          'CONCURRENT_FRONTEND_OWNER_PROVENANCE_REQUIRED');
        assert(Date.parse(web.Created)>Date.parse(before.recorded_at_utc)
          &&Date.parse(web.Created)<statSync(join(home,'preview-enabled.json')).mtimeMs,
          'CONCURRENT_WEB_MUST_PREDATE_FULL03_ACTIVATION');
        result.concurrent_frontend={before_image_id:before.web_image_id,preserved_image_id:result.web_image_id,
          created_at_utc:web.Created,source_worktree:'/home/bobby/portal-research-fe',
          scope:'INDEPENDENT_FRONTEND_REBUILD_PRESERVED_NOT_FULL03_UI_CHANGE'};
      }
      result.passed=true;
    }
    savePrivate(path,result);console.log(JSON.stringify({action,seals:result.seals.length,sha256:sha(readFileSync(path)),passed:result.passed??null}));
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))runPreviewReceipt(
  process.argv.find(a=>a.startsWith('--home='))?.slice(7),process.argv.find(a=>a.startsWith('--action='))?.slice(9),
  process.argv.find(a=>a.startsWith('--preserve-concurrent-web-image='))?.slice('--preserve-concurrent-web-image='.length))
  .catch(error=>{console.error('FULL03 preview probe refused:',error.message);process.exitCode=1;});
