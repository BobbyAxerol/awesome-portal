#!/usr/bin/env node
/** Exact ordinary product proof, no direct engine/data/DB shortcut. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHome} from './cell.mjs';
import {loadSessions,makeClient,privateJson,savePrivate} from './api-client.mjs';
import {admitRealRun,waitForRun,requestedSpec} from './real-run.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const table=JSON.parse(readFileSync(join(ROOT,'apps/portal/registry/research-execution-recipes.v1.json')));
const binding=JSON.parse(readFileSync(join(ROOT,'apps/portal/registry/research-full03-delta-binding.v1.json')));
const routes=['evidence','current-source/evidence','current-source/split','current-source/search',
  'current-source/freeze','current-source/replay','report','release-candidate'];
function productSpec(_oldBinding,release,row,alphaBinding=binding){
  const three=row.descriptor.protocol==='three_window_decay',schedule=row.public_profile.optimization_schedule;
  const kind=three?'three-window-optimized':schedule==='per_fold_causal'?'wfo-causal-inner':schedule==='per_fold_decay'?'wfo-per-fold-decay':'wfo-v2';
  const spec=requestedSpec({alpha_id:alphaBinding.alpha_id,alpha_version_id:alphaBinding.alpha_version_id},release,kind);
  spec.optimization_mode=row.public_profile.optimization_mode;
  spec.optuna_trials=row.public_profile.trial_default;
  spec.data.timeframe=row.public_profile.timeframe;
  const daily=spec.data.timeframe==='1d';
  if(three){
    spec.windows=daily?{
      is:{start:'2024-01-01T00:00:00Z',end_exclusive:'2024-07-01T00:00:00Z'},
      oos:{start:'2024-07-01T00:00:00Z',end_exclusive:'2024-10-01T00:00:00Z'},
      holdout:{start:'2024-10-01T00:00:00Z',end_exclusive:'2025-01-01T00:00:00Z'},
    }:spec.windows;
  }else{
    spec.walk_forward={...spec.walk_forward,
      start:daily?'2024-01-01T00:00:00Z':'2026-06-01T00:00:00Z',
      split_mode:daily?'2025-01-01T00:00:00Z':'2026-07-01T00:00:00Z',
      end_exclusive:daily?'2025-03-01T00:00:00Z':'2026-07-15T00:00:00Z',
      frequency:daily?'monthly':'weekly',window_mode:'expanding',label_horizon_bars:0,purge_bars:0,embargo_bars:0,
      ...(row.descriptor.inner_constraints?{inner:{split_frequency:daily?'monthly':'weekly',window_mode:'rolling',
        train_window:daily?'180D':'14D',min_folds:2}}:{}),
    };
    if(!row.descriptor.inner_constraints)delete spec.walk_forward.inner;
    delete spec.walk_forward.train_window;
  }
  return spec;
}
export function selectExactCandidate(home,id,slice='full03'){
  assert(['full03','full04','full05'].includes(slice),'KNOWN_EXACT_QUALIFICATION_SLICE');
  home=validateHome(home);assert(home.endsWith('/'+slice),'EXACT_PRIVATE_CELL');
  const row=table.recipes.find(r=>r.profile_id===id&&r.descriptor.schema_version===`research.${slice}-${slice==='full05'?'imported':'delta'}-profile.v1`);
  assert(row,'EXACT_FULL03_RECIPE');
  const file=join(home,'preview.env'),stat=lstatSync(file);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0,'PRIVATE_REGULAR_ENV_REQUIRED');
  let value=readFileSync(file,'utf8');
  for(const key of ['CONTROL_API_RESEARCH_RECIPE_QUALIFICATION_PROFILE_ID','PORTAL_RECIPE_QUALIFICATION_PROFILE_ID']){
    assert(value.match(new RegExp(`^${key}=.*$`,'m')),'EXACT_CANDIDATE_SELECTOR_REQUIRED');
    value=value.replace(new RegExp(`^${key}=.*$`,'m'),`${key}=${id}`);
  }
  writeFileSync(file,value,{mode:0o600});
  execFileSync('node',[join(ROOT,'scripts/research-p23/cell.mjs'),'up',`--home=${home}`],
    {cwd:ROOT,stdio:'pipe',timeout:240000,maxBuffer:4*1024*1024});
  return row;
}
export async function full03Receipt(home,id,attempt=1,slice='full03'){
  assert(['full03','full04','full05'].includes(slice),'KNOWN_EXACT_QUALIFICATION_SLICE');
  home=validateHome(home);assert(home.endsWith('/'+slice),'EXACT_PRIVATE_CELL');
  assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=5,'BOUNDED_ATTEMPTS');
  const row=selectExactCandidate(home,id,slice);
  const baseLabel=id.replace(/^p10\./,'').replace(/\.v1$/,'').replaceAll('.','-');
  const label=baseLabel+(attempt>1?`-${attempt}`:'');
  const originalRun=join(home,`run-${baseLabel}.json`);
  // A failed read after completion must resume the original ordinary run,
  // not create a new engine run just to obtain a successful receipt.
  const completed=readdirSync(home).filter(file=>file===`run-${baseLabel}.json`||new RegExp(`^run-${baseLabel}-[1-5]\\.json$`).test(file))
    .map(file=>({file,record:privateJson(join(home,file))}))
    .filter(item=>item.record.created&&item.record.final?.body.current.effective_status==='COMPLETED')
    .sort((a,b)=>a.file.localeCompare(b.file)).at(-1);
  const prior=existsSync(originalRun)?privateJson(originalRun):null;
  const runLabel=completed?completed.file.slice(4,-5):attempt>1&&prior?.created&&prior.final?.body.current.effective_status!=='FAILED'?baseLabel:label;
  const path=join(home,`qualification-${label}.json`);
  // This cell deliberately replaces its gateway between exact candidates.
  // Don't reuse a pooled connection to the previous container generation.
  const user=loadSessions(home).identities.find(u=>u.username==='p23-owner');
  const client=makeClient(user,{connectionClose:true});
  // Compose just replaced this owned gateway. A pooled socket from session
  // renewal can close during replacement: retry only this idempotent GET,
  // never a preflight/create POST or an authorization refusal.
  let context;
  for(let retry=0;retry<3;retry++){
    try{context=(await client.call('GET','/api/auth/context')).body;break;}
    catch(error){
      if(retry===2 || error.message!=='fetch failed')throw error;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
  }
  assert(context.state==='AUTHENTICATED'&&context.principal.principalId===user.id,'EXACT_OWNED_OWNER_REQUIRED');
  const record={schema_version:`research.${slice}-product-receipt.v1`,profile_id:id,profile_digest:row.profile_digest,
    identity:privateJson(join(home,'identity.json')),started_at_utc:new Date().toISOString(),reads:{},passed:false};
  record.source_diff_sha256=createHash('sha256').update(execFileSync('git',['diff','HEAD'],{cwd:ROOT,maxBuffer:16*1024*1024})).digest('hex');
  record.added_source_sha256=Object.fromEntries(execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:ROOT,encoding:'utf8'})
    .trim().split('\n').filter(Boolean).sort().map(file=>[file,createHash('sha256').update(readFileSync(join(ROOT,file))).digest('hex')]));
  const save=()=>savePrivate(path,record);
  try{
    record.atlas=await client.call('GET','/api/v1/research/quantbt/atlas');
    const imported=slice==='full05'?privateJson(join(home,'imported-registration.json')):null;
    if(imported){record.imported_registration=imported;assert.equal(imported.registration.lifecycle_state,'DRAFT');}
    const admitted=await admitRealRun(home,row.descriptor.protocol==='three_window_decay'?'three-window-optimized':'wfo-v2',
      runLabel,'p23-owner',client,(_binding,release)=>productSpec(_binding,release,row,imported?.registration??binding));
    if(imported&&Date.now()-Date.parse(admitted.receipt.created_at_utc)<120000){
      record.idempotent_create=await client.call('POST','/api/v1/research/runs',{
        schema_version:'research.run-create.v1',client_intent_id:admitted.receipt.client_intent_id,
        preflight_token:admitted.receipt.preflight.body.preflight_token,requested_spec:admitted.receipt.requested_spec,
      },[202]);
      assert.equal(record.idempotent_create.body.run_id,admitted.receipt.run_id,'IDEMPOTENT_IMPORTED_INTAKE');
    }
    record.run=await waitForRun(client,admitted.path,admitted.receipt);save();
    assert.equal(record.run.final.body.current.effective_status,'COMPLETED','PRODUCT_CHILD_COMPLETED');
    for(const route of routes){
      const url=`/api/v1/quantbt/runs/${record.run.run_id}/${route}`;
      // Terminal Report materialization can still be finishing bounded named
      // reads. Preserve refusal evidence; retry only this GET, never the child.
      for(let readAttempt=0;readAttempt<4;readAttempt++){
        const result=await client.call('GET',url,undefined,route==='report'?[200,503]:[200]);
        if(result.status===200){record.reads[route]=result;break;}
        assert.equal(result.body.error?.code,'RESEARCH_REPORT_UNAVAILABLE','ONLY_TYPED_REPORT_RETRY');
        (record.report_refusals??=[]).push(result);save();
        assert(readAttempt<3,'REPORT_RETRY_EXHAUSTED');
        await new Promise(resolve=>setTimeout(resolve,20000));
      }
      save();
      assert(Buffer.byteLength(JSON.stringify(record.reads[route].body))<=1048576,'BOUNDED_NAMED_READ');
    }
    for(const route of routes.filter(r=>r.startsWith('current-source/'))){
      const result=record.reads[route].body;
      assert.equal(result.availability.state,'AVAILABLE',`CURRENT_SOURCE_AVAILABLE:${route}`);
      assert.equal(result.provenance.profile_id,row.descriptor.current_source.profile_id);
      assert.equal(result.provenance.source_adapter_id,row.descriptor.current_source.source_adapter_id);
    }
    const freeze=record.reads['current-source/freeze'].body,search=record.reads['current-source/search'].body,
      split=record.reads['current-source/split'].body;
    assert.equal(freeze.integrity.state,'MATCH','REAL_RETAINED_BYTE_CUSTODY');
    assert.deepEqual(freeze.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'},'ACTUAL_STAGE4_BINDING');
    assert.equal(search.search_contract.optuna_trials_per_study,row.public_profile.trial_default,'NATIVE_MULTI_TRIAL');
    assert.equal(record.reads['release-candidate'].body.pack_counts.missing,0,'RC_READ_CHAIN');
    const spec=record.run.requested_spec,step=row.descriptor.source_clock.bar_interval_ms;
    const start=Date.parse(spec.walk_forward?.start??spec.windows.is.start);
    const end=Date.parse(spec.walk_forward?.end_exclusive??spec.windows.holdout.end_exclusive);
    assert(start%step===0&&end%step===0&&end<=Date.now(),'UTC_CLOSED_SOURCE_EDGES');
    const local=row.public_profile.optimization_schedule!=='global';
    if(row.public_profile.optimization_mode!=='mode_3_flat_minima'){
      assert.equal(freeze.frozen_selection.selected_trial_ordinal_scope,local?'STUDY_LOCAL':'RUN_GLOBAL');
      assert.equal(record.run.final.body.progress.claim.handoff_cursor.trial_scope,local?'STUDY_LOCAL':'RUN_GLOBAL');
    }
    if(record.run.final.body.progress.claim.handoff_cursor!==null)
      assert.equal(record.run.final.body.progress.claim.handoff_cursor.params_digest,freeze.stage4_binding.sealed_params_sha256);
    else assert(row.public_profile.optimization_mode==='mode_3_flat_minima'&&freeze.frozen_selection.selected_trial_id===null,
      'ONLY_REAL_CENTROID_HAS_NO_TRIAL_CURSOR');
    if(slice==='full04'||slice==='full05'){
      record.final_audit=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/final-audit`,undefined,[200,409]);
      if(record.final_audit.status===409)assert.equal(record.final_audit.body.error.code,'RESEARCH_FINAL_AUDIT_NOT_APPLICABLE');
      if(row.public_profile.optimization_mode==='mode_5_full_robust')assert.equal(record.reads.report.body.final_audit_applicable,false);
    }
    if(row.descriptor.protocol==='three_window_decay'){
      assert.equal(search.protocol_disclosure.independent_holdout.holdout_used_for_selection,false);
      assert.equal(search.protocol_disclosure.independent_holdout.freeze_before_holdout,true);
      assert.deepEqual(record.reads['current-source/replay'].body.protocol_disclosure,search.protocol_disclosure);
      assert.equal(record.reads.report.body.final_audit_applicable,true);
    }else assert(split.fold_plan.folds.length>=row.public_profile.fold_bounds.min&&
      split.fold_plan.folds.length<=row.public_profile.fold_bounds.max,'ENGINE_FOLDS');
    record.negative_cursor=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/current-source/replay?cursor=invalid`,undefined,[400]);
    record.passed=true;record.scope='EXACT_AV_SOURCE_INTERVAL_RECIPE_PRODUCT_ADMISSION_CHILD_RETENTION_NAMED_READS_NOT_BROWSER';
    console.log(JSON.stringify({passed:true,profile_id:id,run_id:record.run.run_id,named_reads:routes.length}));
  }catch(error){record.failure=error.message;throw error;}
  finally{record.finished_at_utc=new Date().toISOString();save();}
  return record;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  full03Receipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),process.argv.find(a=>a.startsWith('--id='))?.slice(5),
    Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??'1')).catch(error=>{console.error('FULL03 refused:',error.message);process.exitCode=1;});
}
