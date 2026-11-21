#!/usr/bin/env node
/** Exact preview import/setup/admission/rollback proof; never production or UI edits. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateHome} from './cell.mjs';
import {privateJson,savePrivate,readBoundedJson} from './api-client.mjs';
import {previewCustodySnapshot} from './full03-preview-receipt.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full05'),'EXACT_FULL05_PRIVATE_HOME');
const action=process.argv.find(a=>a.startsWith('--action='))?.slice(9);
assert(['before','enabled','disabled','final','after'].includes(action),'EXPLICIT_PREVIEW_ACTION');
const attempt=Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1);
assert(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=8,'BOUNDED_RECEIPT_ATTEMPT');
const path=join(home,`preview-${action}${attempt===1?'':'-attempt'+attempt}.json`);assert(!existsSync(path),'IMMUTABLE_PREVIEW_RECEIPT');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
if(action==='after'){
  const before=privateJson(join(home,'preview-before.json')).custody,after=previewCustodySnapshot();
  for(const key of ['seals','users_md5','legacy_av_md5','alpha_pointer_md5','index','web_image_id'])
    assert.deepEqual(after[key],before[key],'PREVIEW_CUSTODY_UNCHANGED:'+key);
  savePrivate(path,{passed:true,scope:'UNCHANGED_EXISTING_DATA_IDENTITIES_WEB_AND_INDEX',custody:after});
  console.log('FULL05 preview custody unchanged; no web/account/seal/index replacement.');
}else{
  const origin=readFileSync('/home/bobby/.config/portal-research-preview/preview.env','utf8').split('\n')
    .find(s=>s.startsWith('PORTAL_PUBLIC_ORIGIN='))?.slice('PORTAL_PUBLIC_ORIGIN='.length);
  assert(['https://research-portal.primusspark.com','http://localhost:8095'].includes(origin),'EXACT_PREVIEW_ORIGIN');
  const jar=new Map(),result={schema_version:'research.full05-preview-receipt.v1',action,attempt,recorded_at_utc:new Date().toISOString(),passed:false,calls:{},request_count:0,qualified_conditions:[]};
  async function call(method,url,body){
    const response=await fetch('http://localhost:8095'+url,{method,redirect:'manual',signal:AbortSignal.timeout(45000),
      headers:{origin,accept:'application/json','content-type':'application/json',connection:'close',cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),
        ...(method==='GET'?{}:{'x-portal-csrf':jar.get('__Host-portal_csrf')??''})},body:body===undefined?undefined:JSON.stringify(body)});
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
    const value=await readBoundedJson(response);result.calls[method+' '+url]={status:response.status,body:value};result.request_count++;
    assert(response.ok,'PREVIEW_NAMED_API:'+response.status+':'+(value.error?.code??'UNKNOWN'));return value;
  }
  await call('GET','/api/auth/context');
  try{
    if(action==='before'){
      const source=readFileSync(join(root,'apps/portal/frontend/src/research/samples/deltaRsiReference.py'),'utf8'),sha=digest(source);
      let registry=await call('GET','/api/v1/research/alphas');
      let registration=registry.entries.find(row=>row.source_digest===sha&&row.declaration);
      for(let page=1;!registration&&registry.next_cursor&&page<20;page++){
        registry=await call('GET','/api/v1/research/alphas?'+new URLSearchParams({cursor:registry.next_cursor}));
        registration=registry.entries.find(row=>row.source_digest===sha&&row.declaration);
      }
      assert(registration||!registry.next_cursor,'BOUNDED_REGISTRY_SCAN_INCOMPLETE');
      if(!registration){
        const parsed=await call('POST','/api/v1/research/alphas/import/parse',{original_filename:'deltaRsiReference.py',source_text:source,expected_source_digest:sha});
        const gates=await call('POST','/api/v1/research/alphas/import/gates',{source_file_ref:parsed.source_file_ref});
        assert.equal(gates.all_pass,true,'REAL_P07_PREVIEW_GATES');
        registration=await call('POST','/api/v1/research/alphas/import/register',{source_file_ref:parsed.source_file_ref,gate_receipt_id:gates.gate_receipt_id,alpha_id:'full05-preview-canonical-delta-rsi'});
        result.registration_scope='NEW_OWNED_P07_DRAFT_NO_ACTIVATION';
      }else result.registration_scope='REUSE_EXACT_EXISTING_SOURCE_NO_MUTATION';
      result.registration=registration;result.source_digest=sha;
      // New owned intake, if necessary, precedes the activation custody baseline.
      result.custody=previewCustodySnapshot();
    }else{
      const enabled=action!=='disabled',registration=privateJson(join(home,'preview-before.json')).registration;
      const table=JSON.parse(readFileSync(join(root,'apps/portal/registry/research-execution-recipes.v1.json')));
      const rows=table.recipes.filter(r=>r.adapter_kind==='IMPORTED_SEARCH'),ids=rows.map(r=>r.profile_id);assert.equal(ids.length,27);
      const atlas=await call('GET','/api/v1/research/quantbt/atlas');
      assert.equal(atlas.portal_admission.profiles.filter(r=>ids.includes(r.profile_id)&&r.state==='ENABLED').length,enabled?27:0);
      for(const timeframe of ['1h','4h','1d']){
        const query=new URLSearchParams({alpha_id:registration.alpha_id,alpha_version_id:registration.alpha_version_id,dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe});
        const setup=await call('GET','/api/v1/research/runs/setup-options?'+query);
        const active=setup.profiles.filter(r=>r.state==='ENABLED'&&ids.includes(r.profile_id));assert.equal(active.length,enabled?9:0);
        for(const r of active){assert.equal(r.parameter_policy,'DECLARED_SEARCH_WITH_PINS');assert.equal(r.budget.qualification,'PRODUCT_RUN_QUALIFIED');}
      }
      if(action==='enabled'){
        const facts=privateJson(join(home,'qualified-products-summary.json')).facts;
        for(const fact of facts){
          const spec=structuredClone(privateJson(join(home,fact.private_receipt)).run.requested_spec);
          spec.alpha_binding={alpha_id:registration.alpha_id,alpha_version_id:registration.alpha_version_id};spec.strategy_id=registration.alpha_id;
          spec.client={engine_release_id:atlas.atlas.current_release.release_id,config_digest:atlas.atlas.current_release.config_digest};
          const estimate=await call('POST','/api/v1/research/datasets/declaration-estimates',{requested_spec:spec});
          assert.equal(estimate.ready_for_preflight,true,'PREVIEW_CONDITIONS:'+fact.profile_id);
          assert.equal(estimate.profile_id,fact.profile_id,'EXACT_IMPORTED_PREVIEW_PROFILE');
          result.qualified_conditions.push({profile_id:fact.profile_id,ready_for_preflight:true,evaluation_scope:estimate.metadata.planned_folds.evaluation_scope??'WALK_FORWARD_OR_THREE_WINDOW'});
          if(['p10.imported-wfo-temporal-1h.v1','p10.imported-three-window-optimized-4h.v1','p10.imported-mode5-global-1d.v1'].includes(fact.profile_id)){
            const preflight=await call('POST','/api/v1/research/preflights',{requested_spec:spec});
            assert.equal(preflight.may_create_run,true,'PREVIEW_MAY_CREATE:'+fact.profile_id);
          }
        }
      }
    }
    result.passed=true;
  }finally{
    await call('POST','/api/auth/logout',{});savePrivate(path,result);
  }
  console.log(JSON.stringify({passed:result.passed,action,request_count:result.request_count,qualified_conditions:result.qualified_conditions.length,scope:'BACKEND_API_NOT_BROWSER_OR_PRODUCTION'}));
}
