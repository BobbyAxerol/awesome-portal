#!/usr/bin/env node
/** Ordinary FULL02 product qualification. No direct engine, DB write or shared runtime. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitRealRun, waitForRun } from './real-run.mjs';
import { operatorClient, privateJson, savePrivate, loadSessions, makeClient } from './api-client.mjs';
import { validateHome } from './cell.mjs';

const PROFILE = {
  'wfo-per-fold-decay': 'p10.delta-signal-notional-per-fold-decay.v1',
  'three-window-optimized': 'p10.delta-signal-notional-three-window-optimized.v1',
};
const ROUTES = ['evidence','current-source/evidence','current-source/split','current-source/search',
  'current-source/freeze','current-source/replay','report','final-audit','release-candidate'];
export async function full02Receipt(home, profile, attempt=1) {
  home=validateHome(home);
  assert(home.endsWith('/full02') && PROFILE[profile], 'EXACT_FULL02_CELL_PROFILE_REQUIRED');
  assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=5,'BOUNDED_QUALIFICATION_ATTEMPT');
  const suffix=attempt===1?'':`-${attempt}`;
  const path=join(home,`qualification-${profile}${suffix}.json`);
  const identity=privateJson(join(home,'identity.json'));
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  const candidateDiff=execFileSync('git',['diff','--binary','HEAD'],{cwd:root,maxBuffer:8*1024*1024});
  const source_diff_sha256=createHash('sha256').update(candidateDiff).digest('hex');
  const newSources=execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'})
    .trim().split('\n').filter(p=>p.startsWith('apps/')||p.startsWith('deploy/')).sort();
  const source_additions_sha256=createHash('sha256').update(JSON.stringify(newSources.map(p=>({path:p,
    sha256:createHash('sha256').update(readFileSync(join(root,p))).digest('hex')})))).digest('hex');
  const client=await operatorClient(home);
  const record={schema_version:'research.full02-product-receipt.v1',profile_id:PROFILE[profile],identity,
    source_diff_sha256,source_additions_sha256,started_at_utc:new Date().toISOString(),reads:{},passed:false};
  try {
    const admitted=await admitRealRun(home,profile,`full02-${profile}${suffix}`,'p23-owner',client);
    const run=await waitForRun(client,admitted.path,admitted.receipt);
    record.run=run;savePrivate(path,record);
    assert.equal(run.final.body.current.effective_status,'COMPLETED','REAL_PRODUCT_CHILD_NOT_COMPLETED');
    for(const route of ROUTES) {
      record.reads[route]=await client.call('GET',`/api/v1/quantbt/runs/${run.run_id}/${route}`,undefined,
        route==='final-audit'?[200,409]:[200]);
      savePrivate(path,record);
    }
    if(record.reads['final-audit'].status===409) assert.equal(record.reads['final-audit'].body.error.code,
      'RESEARCH_FINAL_AUDIT_NOT_APPLICABLE','ONLY_SCOPED_RUN_GLOBAL_AUDIT_ABSENCE_ALLOWED');
    for(const route of ROUTES.filter(r=>r.startsWith('current-source/'))) {
      const response=record.reads[route].body;
      assert.equal(response.availability.state,'AVAILABLE',`CORE_NAMED_READ_NOT_AVAILABLE:${route}`);
      assert.equal(response.provenance.profile_id,profile==='wfo-per-fold-decay'
        ?'full02.delta-signal-notional-per-fold-decay.v1':'full02.delta-signal-notional-three-window.v1');
      assert(Buffer.byteLength(JSON.stringify(response))<=1_048_576,'PUBLIC_PAGE_BOUND');
    }
    const search=record.reads['current-source/search'].body, freeze=record.reads['current-source/freeze'].body;
    const replay=record.reads['current-source/replay'].body, report=record.reads.report.body;
    assert.equal(freeze.integrity.state,'MATCH','RETAINED_CUSTODY_MUST_MATCH');
    assert.deepEqual(freeze.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'},'ACTUAL_REPLAY_BINDING');
    assert.equal(record.reads['release-candidate'].body.pack_counts.missing,0,'RC_REQUIRED_READ_CHAIN');
    assert.equal(search.search_contract.optuna_trials_per_study,3,'REAL_MULTI_TRIAL_STUDY');
    assert.equal(search.search_contract.oos_used_for_selection,true,'NEVER_PRESENT_CALIBRATION_AS_UNTOUCHED_OOS');
    const trials=search.ledger.trials;
    assert.equal(trials.length,profile==='wfo-per-fold-decay'?6:3,'REAL_TRIAL_COUNT_OF_THIS_QUALIFICATION_RANGE');
    if(profile==='wfo-per-fold-decay') {
      assert.equal(search.search_contract.n_studies,2);
      assert.equal(search.search_contract.optuna_trials_scope,'per_fold');
      assert.equal(search.search_contract.top_is_k,null,'NO_FICTIONAL_GLOBAL_K');
      assert.equal(freeze.frozen_selection.selected_trial_ordinal_scope,'STUDY_LOCAL');
      assert.equal(run.final.body.progress.claim.handoff_cursor.trial_scope,'STUDY_LOCAL');
      assert.equal(run.final.body.progress.claim.handoff_cursor.params_digest,freeze.stage4_binding.sealed_params_sha256);
    } else {
      assert.equal(search.search_contract.n_studies,1);
      assert.equal(freeze.frozen_selection.selected_trial_ordinal_scope,'RUN_GLOBAL');
      const disclosure=search.protocol_disclosure;
      assert.equal(disclosure.engine_operation,'train_test_split');
      assert.equal(disclosure.calibration_scope,'IS_OOS_ONLY');
      assert.equal(disclosure.independent_holdout.holdout_used_for_selection,false);
      assert.equal(disclosure.independent_holdout.freeze_before_holdout,true);
      assert.equal(disclosure.independent_holdout.selected_params_digest,freeze.stage4_binding.sealed_params_sha256);
      assert.deepEqual(replay.protocol_disclosure,disclosure,'SCREEN_PROTOCOL_FACT_PARITY');
      for(const [name,window] of Object.entries(disclosure.windows)) {
        assert(window.bar_count>0 && window.start_utc_ms<window.end_exclusive_utc_ms);
        assert(disclosure.window_series[name].every(r=>r.at_utc_ms>=window.start_utc_ms&&r.at_utc_ms<window.end_exclusive_utc_ms));
      }
    }
    // Three Window has an actual independent Holdout proof in this same run.
    // That makes the audit target applicable, not the legacy Advanced audit intake.
    assert.equal(report.final_audit_applicable,profile==='three-window-optimized','METHOD_SCOPED_AUDIT_TARGET');
    assert.equal(report.frozen_core.final_audit.kind,'REUSED_ORIGINAL');
    assert.equal(report.frozen_core.final_audit.optimizer_basis,profile==='three-window-optimized'
      ?'THREE_WINDOW_HOLDOUT_RAN_FROZEN_CALIBRATION_SELECTION':'EVERY_OOS_GENERATION_CHILD_RAN_ITS_FOLD_SELECTED_CANDIDATE');
    record.negative_reads={};
    for(const route of ['current-source/search?cursor=invalid','current-source/replay?cursor=invalid']) {
      const result=await client.call('GET',`/api/v1/quantbt/runs/${run.run_id}/${route}`,undefined,[400]);
      assert.equal(result.body.error.code,'RESEARCH_CURRENT_SOURCE_INVALID');
      record.negative_reads[route]=result;
    }
    const workspaceResponse=await client.call('GET','/api/workspaces');
    const workspaces=Array.isArray(workspaceResponse.body)?workspaceResponse.body:workspaceResponse.body.workspaces;
    assert(Array.isArray(workspaces)&&workspaces.length>0,'ACTUAL_OWNER_WORKSPACE_REQUIRED');
    const workspaceId=workspaces[0].workspace_id??workspaces[0].workspaceId;
    assert(typeof workspaceId==='string'&&workspaceId.length>0,'TYPED_ACTUAL_WORKSPACE_ID_REQUIRED');
    const other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
    record.negative_reads.foreign_workspace=await other.call('GET',
      `/api/v1/quantbt/runs/${run.run_id}/current-source/search?workspace_id=${encodeURIComponent(workspaceId)}`,
      undefined,[404]);
    // Use an existing actual workspace fact; a missing contract key is not a security proof.
    assert.equal(record.negative_reads.foreign_workspace.status,404,'FOREIGN_WORKSPACE_MUST_NOT_DISCLOSE_ROWS');
    record.passed=true;record.scope='EXACT_1H_RECIPE_ADMISSION_CHILD_RETENTION_NAMED_READS_NOT_BROWSER_OR_RELEASE';
    console.log(JSON.stringify({passed:true,profile_id:record.profile_id,run_id:run.run_id,named_reads:ROUTES.length}));
    return record;
  } catch(error) {record.failure=error.message;throw error;}
  finally {record.finished_at_utc=new Date().toISOString();savePrivate(path,record);}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  full02Receipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),
    process.argv.find(a=>a.startsWith('--profile='))?.slice(10),
    Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??'1'))
    .catch(error=>{console.error('FULL02 qualification refused:',error.message);process.exitCode=1;});
}
