#!/usr/bin/env node
/** Compile immutable product evidence. Unit/fixture/direct-engine runs are refused. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {privateJson,savePrivate,operatorClient,loadSessions,makeClient} from './api-client.mjs';
import {validateHome} from './cell.mjs';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const TABLE='apps/portal/registry/research-execution-recipes.v1.json';
const PACKET='upgrade/research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function assertModeTruth(row,record){
  const facts=assertOrdinaryProductReceipt(row,record);
  const search=record.reads['current-source/search'].body,freeze=record.reads['current-source/freeze'].body;
  const disclosure=record.reads['current-source/evidence'].body.optimizer_disclosure;
  assert(disclosure,'MODE_NATIVE_DISCLOSURE_REQUIRED');
  assert.equal(disclosure.optimization_mode,row.descriptor.optimization_mode);
  assert.equal(disclosure.optimization_schedule,row.descriptor.optimization_schedule);
  assert.equal(disclosure.mode_evidence.kind,{mode_2_sbb:'BOOTSTRAP_PROXY',mode_3_flat_minima:'PLATEAU',
    mode_4_is_only_robust:'IS_ONLY_DISPERSION',mode_5_full_robust:'FULL_SAMPLE_ROBUST'}[row.descriptor.optimization_mode]);
  assert.equal(search.search_contract.optuna_trials_per_study,row.public_profile.trial_default);
  if(disclosure.selection_target.kind==='SYNTHETIC_CENTROID'){
    assert.equal(disclosure.selection_target.trial_id,null);assert.equal(freeze.frozen_selection.selected_trial_id,null);
    assert.equal(freeze.frozen_selection.selected_trial_ordinal,null);assert(disclosure.centroid?.state==='AVAILABLE');
  }
  if(row.descriptor.optimization_mode==='mode_4_is_only_robust'){
    assert.equal(disclosure.calibration_sample,'IS_ONLY');assert.equal(disclosure.oos_used_for_selection,false);
    if(row.descriptor.optimization_schedule==='per_fold_causal')assert.equal(freeze.frozen_selection.selected_trial_ordinal_scope,'STUDY_LOCAL');
  }
  if(row.descriptor.optimization_mode==='mode_2_sbb'){
    assert.equal(disclosure.calibration_sample,'BOOTSTRAP_PROXY');
    assert.equal(disclosure.mode_evidence.kind,'BOOTSTRAP_PROXY');assert.equal(disclosure.mode_evidence.sbb_samples,32);
  }
  if(row.descriptor.optimization_mode==='mode_5_full_robust'){
    assert.equal(disclosure.calibration_sample,'FULL_SAMPLE');assert.equal(disclosure.full_sample_used_for_selection,true);
    assert.equal(record.reads['current-source/split'].body.fold_plan.folds.length,1);
    assert.equal(record.reads.report.body.final_audit_applicable,false);
    assert.equal(record.final_audit.status,409);
  }
  assert([200,409].includes(record.final_audit?.status),'EXPLICIT_FINAL_AUDIT_PROFILE_RESPONSE');
  return {...facts,mode:disclosure.optimization_mode,schedule:disclosure.optimization_schedule,
    selection_target_kind:disclosure.selection_target.kind,native_mode_evidence:disclosure.mode_evidence.kind,
    calibration_sample:disclosure.calibration_sample,full_sample_used_for_selection:disclosure.full_sample_used_for_selection,
    oos_used_for_selection:disclosure.oos_used_for_selection,final_audit_status:record.final_audit.status};
}
function sealedCosts(runIds){
  const container='portal-research-p23-ol12-portal-api-1';
  const docker=args=>execFileSync('sudo',['-n','docker',...args],{encoding:'utf8',maxBuffer:4*1024*1024});
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container]).trim(),'portal-research-p23-ol12');
  // Read only own immutable bundle/receipt blobs. No HMD rows or shared DB.
  return JSON.parse(execFileSync('sudo',['-n','docker','exec','-i',container,'python','-c',`
import hashlib,json,re,sys
from pathlib import Path
root=Path('/var/lib/portal/artifacts/runs/durable-store'); out={}
for run in json.load(sys.stdin):
 assert re.fullmatch(r'rrun_[0-9a-f]{32}',run)
 bundles=list(root.glob('runs/'+run+'/attempts/*/bundle/*/manifest.json'))
 assert len(bundles)==1, 'EXACT_COMPLETED_BUNDLE:'+run
 raw=bundles[0].read_bytes(); manifest=json.loads(raw)
 assert hashlib.sha256(raw).hexdigest()==bundles[0].parent.name
 hashes={digest for name,digest in manifest['files'].items() if name=='research/p10-receipt.json' or name.endswith('/research/p10-receipt.json')}
 assert len(hashes)==1, 'EXACT_CHILD_RECEIPT:'+run
 digest=next(iter(hashes)); blob=(root/'blobs'/digest).read_bytes()
 assert len(blob)<=16384 and hashlib.sha256(blob).hexdigest()==digest
 receipt=json.loads(blob); assert receipt['run_id']==run
 out[run]={'bundle_sha256':bundles[0].parent.name,'child_receipt_sha256':digest,'resource':receipt['resource'],'engine':receipt['engine']}
print(json.dumps(out))`],{input:JSON.stringify(runIds),encoding:'utf8',maxBuffer:4*1024*1024}));
}
export async function compileFull04(home){
  home=validateHome(home);assert(home.endsWith('/full04'),'EXACT_FULL04_HOME');
  const path=join(ROOT,TABLE),table=JSON.parse(readFileSync(path));
  const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full04-delta-profile.v1');
  assert.equal(rows.length,35);assert(!existsSync(join(ROOT,PACKET)),'IMMUTABLE_PACKET_EXISTS');
  const files=readdirSync(home).filter(f=>f.startsWith('qualification-')&&f.endsWith('.json'));
  const facts=rows.map(row=>{
    const items=files.map(file=>({file,record:privateJson(join(home,file))}))
      .filter(i=>i.record.passed&&i.record.profile_id===row.profile_id)
      .sort((a,b)=>a.record.finished_at_utc.localeCompare(b.record.finished_at_utc));
    assert(items.length,'MISSING_ORDINARY_PRODUCT_PROOF:'+row.profile_id);
    const item=items.at(-1);return {...assertModeTruth(row,item.record),private_receipt:item.file,
      private_receipt_sha256:sha(readFileSync(join(home,item.file)))};
  });
  const costs=sealedCosts(facts.map(f=>f.run_id));
  for(const fact of facts){const cost=costs[fact.run_id],caps=rows.find(r=>r.profile_id===fact.profile_id).budgets;
    assert(cost&&cost.engine.version==='1.1.1','PINNED_ENGINE_RESOURCE_RECEIPT');
    assert(cost.resource.elapsed_seconds<=caps.wall_seconds+1&&cost.resource.cpu_seconds<=caps.cpu_seconds+1,'MEASURED_TIME_WITHIN_EXACT_CAPS');
    assert(cost.resource.peak_rss_bytes>0&&cost.resource.peak_rss_bytes<=caps.memory_bytes,'MEASURED_RSS_WITHIN_EXACT_CAP');
    assert.equal(cost.resource.enforced_limits.cpu_seconds,caps.cpu_seconds);
    assert.equal(cost.resource.enforced_limits.scratch_bytes,caps.scratch_bytes);
    Object.assign(fact,{cost,configured_caps:caps,scratch_high_water:{state:'NOT_MEASURED',reason:'ENFORCED_TMPFS_CAP_NOT_PEAK_USAGE'}});
  }
  const owner=await operatorClient(home),other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
  const response=(await owner.call('GET','/api/workspaces')).body;
  const workspaces=Array.isArray(response)?response:response.workspaces;
  const workspace=workspaces[0].workspace_id??workspaces[0].workspaceId;assert(typeof workspace==='string');
  const isolation=[];
  for(const fact of facts){
    const result=await other.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/search?workspace_id=${encodeURIComponent(workspace)}`,undefined,[404]);
    isolation.push({profile_id:fact.profile_id,run_id:fact.run_id,status:result.status});
  }
  const summary={schema_version:'research.full04-qualified-products.v1',scope:'ORDINARY_PRODUCT_API_NOT_BROWSER_OR_RELEASE',
    recorded_at_utc:new Date().toISOString(),passed:true,facts,isolation};
  const privatePath=join(home,'qualified-products-summary.json');assert(!existsSync(privatePath),'IMMUTABLE_SUMMARY_EXISTS');savePrivate(privatePath,summary);
  const markdown=['# FULL-04 — Immutable exact product qualification','',
    'Verdict: **35/35 PRODUCT_RUN_QUALIFIED**, ordinary authenticated P08 → P10 → confined pinned QuantBT 1.1.1 → P05 → eight named screen reads.',
    'Not browser/production/release acceptance. Seven indexed UTC target clocks; 300 predecessor bars and <=100,000 input bars per recipe.',
    'Mode3 native plateau/centroid, Mode2 bounded proxy bootstrap with explicit IS candidate ranking, Mode4 IS-only global/fold-local, Mode5 full-sample calibration.',
    'No Mode1 inner fold or ranking is substituted. A synthetic centroid is not an Optuna trial; Mode5 has one full-span fold and no untouched OOS/Final Audit claim.',
    'The separate legacy linked-audit executor preserves its exact historical adapter fence (typed 409); native selection/retention/final-audit disclosure is readable through this chain.',
    '',`Private summary SHA-256: \`${sha(readFileSync(privatePath))}\`.`,
    '| Exact recipe | Real run | Bars | Native evidence | Target | CPU s / wall s / RSS MiB | Private receipt SHA-256 |','| --- | --- | ---: | --- | --- | --- | --- |',
    ...facts.map(f=>`| ${f.profile_id} | ${f.run_id} | ${f.snapshot_rows} | ${f.native_mode_evidence} | ${f.selection_target_kind} | ${f.cost.resource.cpu_seconds.toFixed(3)} / ${f.cost.resource.elapsed_seconds.toFixed(3)} / ${(f.cost.resource.peak_rss_bytes/1048576).toFixed(1)} | ${f.private_receipt_sha256} |`),
    '', 'All recipes retain 120 CPU /240 wall seconds,4GiB address-space and128MiB enforced scratch ceilings; no preview-long exception. Scratch high-water is NOT_MEASURED, not inferred from output bytes. Native engine trial/fold/output counts and blob hashes are bound by each immutable child receipt in the private summary.',
    '', 'All35 foreign-workspace reads return404; malformed cursors return400. Byte custody/Stage4 params+bundle MATCH; RC missing count0.',
    '',...new Set(facts.map(f=>`- Worker image: \`${f.child_image_id}\`.`)),
    ...new Set(facts.map(f=>`- Control API image: \`${f.api_image_id}\`.`)),
    '', '[Implementation, activation, rollback, cleanup and frontend handoff](FULL_04_OTHER_MODES_2026-10-06.md).',''].join('\n');
  writeFileSync(join(ROOT,PACKET),markdown,{flag:'wx'});const receipt_sha256=sha(markdown);
  for(const row of rows){const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
    assert.equal(ref.recipe_digest,sha(JSON.stringify(canonical(row))));assert.equal(ref.kind,'CANDIDATE_NOT_QUALIFIED');
    Object.assign(ref,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:PACKET,receipt_sha256});}
  writeFileSync(path,JSON.stringify(table,null,2)+'\n');
  console.log(JSON.stringify({passed:true,recipes:facts.length,isolation:isolation.length,receipt_sha256}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))compileFull04(
  process.argv.find(a=>a.startsWith('--home='))?.slice(7)).catch(error=>{console.error('FULL04 qualification refused:',error.message);process.exitCode=1;});
