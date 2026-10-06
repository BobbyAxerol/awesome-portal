#!/usr/bin/env node
/** Immutable native qualification from all nine ordinary product receipts. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateJson,savePrivate} from './api-client.mjs';
import {sealedCosts} from './full04-qualification.mjs';
import {validateHome} from './cell.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const packet='upgrade/research_loop/evidence/P10/NATIVE_ROUTE_PRODUCT_QUALIFICATION_2026-10-06.md';
const tablePath='apps/portal/registry/research-execution-recipes.v1.json';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function compileNative(home){
 home=validateHome(home);assert(home.endsWith('/expanded'),'EXACT_OWNED_NATIVE_CELL');
 assert(!existsSync(join(root,packet)),'IMMUTABLE_PACKET_EXISTS');
 const table=JSON.parse(readFileSync(join(root,tablePath)));
 const adapterHash=sha(readFileSync(join(root,'apps/portal/backend/src/portal_api/adapters/research_native_routes.py')));
 const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1'
  &&r.descriptor.native_input.adapter_sha256===adapterHash);
 assert.equal(rows.length,3);
 const records=readdirSync(home).filter(f=>/^qualification-native-.*\.json$/.test(f))
  .map(file=>({file,record:privateJson(join(home,file))}));
 const facts=rows.flatMap(row=>['BTCUSDT','ETHUSDT','SOLUSDT'].map(symbol=>{
  const item=records.filter(i=>i.record.passed&&i.record.profile_id===row.profile_id
   &&i.record.profile_digest===row.profile_digest&&i.record.symbol===symbol)
   .sort((a,b)=>a.record.finished_at_utc.localeCompare(b.record.finished_at_utc)).at(-1);
  assert(item,'MISSING_NATIVE_PRODUCT_PROOF:'+row.profile_id+':'+symbol);
  const r=item.record,run=r.run,spec=run.requested_spec;
  assert.equal(run.final.body.current.effective_status,'COMPLETED');
  assert.equal(run.final.body.current.terminal_materialization,'READY');
  assert.equal(spec.alpha_binding.alpha_version_id,row.descriptor.alpha_binding_requirements.alpha_version_id);
  assert.equal(spec.execution_route,row.descriptor.execution_route);assert.equal(spec.data.symbol,symbol);
  assert.equal(spec.optuna_trials,1);assert.equal(spec.data.timeframe,'1h');
  assert.equal(run.preflight.body.snapshot.warmup.bars,300);
  assert(run.preflight.body.snapshot.row_count<=20000&&run.preflight.body.snapshot.quality.passed);
  assert.equal(Object.keys(r.reads).length,7);
  for(const read of Object.values(r.reads))assert(read.status===200&&Buffer.byteLength(JSON.stringify(read.body))<=1048576);
  const native=r.reads.evidence.body.core.native_execution;
  assert.equal(native.execution_route,spec.execution_route);assert.equal(native.clock,row.descriptor.native_input.execution_clock);
  assert.equal(native.authority,'PINNED_QUANTBT_ACCOUNTING_NOT_PORTAL_PNL');
  assert.equal(r.reads.evidence.body.availability.state,'AVAILABLE');
  assert.equal(r.reads.freeze.body.freeze.frozen_parameters.length,8);
  assert.equal(r.wfo_refusal.body.availability.state,'NOT_APPLICABLE');
  assert.equal(r.foreign_workspace.status,404);
  return {profile_id:row.profile_id,profile_digest:row.profile_digest,run_id:run.run_id,symbol,
   source_manifest_digest:run.preflight.body.dataset_binding.source_manifest_digest,
   snapshot_rows:run.preflight.body.snapshot.row_count,requested_spec_digest:run.preflight.body.requested_spec_digest,
   worker_image:r.identity.images['quant-worker-py'].image_id,api_image:r.identity.images['control-api'].image_id,
   native_execution:native,adapter_sha256:row.descriptor.native_input.adapter_sha256,
   private_receipt:item.file,private_receipt_sha256:sha(readFileSync(join(home,item.file)))};
 }));
 const costs=sealedCosts(facts.map(f=>f.run_id));
 for(const f of facts){const c=costs[f.run_id],caps=rows.find(r=>r.profile_id===f.profile_id).budgets;
  assert(c.engine.version==='1.1.1'&&c.resource.cpu_seconds<=caps.cpu_seconds+1&&c.resource.elapsed_seconds<=caps.wall_seconds+1);
  assert(c.resource.peak_rss_bytes>0&&c.resource.peak_rss_bytes<=caps.memory_bytes);
  assert.equal(c.resource.enforced_limits.cpu_seconds,caps.cpu_seconds);
  assert.equal(c.resource.enforced_limits.scratch_bytes,caps.scratch_bytes);
  assert.equal(c.resource.enforced_limits.address_space_bytes,caps.memory_bytes);
  assert.deepEqual(c.native_execution,f.native_execution,'RETAINED_NATIVE_FACTS_MATCH_NAMED_READ');
  Object.assign(f,{cpu_seconds:c.resource.cpu_seconds,wall_seconds:c.resource.elapsed_seconds,
   rss_bytes:c.resource.peak_rss_bytes,bundle_sha256:c.bundle_sha256,child_receipt_sha256:c.child_receipt_sha256});
 }
 const text=['# Native required routes — immutable product qualification','',
  'Verdict: **3/3 recipes, nine ordinary product runs PRODUCT_RUN_QUALIFIED**. BTCUSDT, ETHUSDT and SOLUSDT; actual indexed1h source, fixed Three Window, one execution and300 predecessor bars. Not scalar WFO/optimization or browser/release/Production acceptance.',
  'Authenticated P08 → P10 → confined pinned QuantBT1.1.1 → lease-fenced P05 → seven bounded screen reads. Foreign-workspace404. Native source fact equals the original byte-bound child receipt. Holdout rows are not passed into the fixed child.',
  'Bracket: known-close intent, next-open intrabar activation with conservative same-bar behavior. Reactive: actual stateful event-facade callback. Event-driven: explicit server-owned order commands with next-bar-close lifecycle. No arbitrary uploaded order tape or broker replay authority.',
  'Costs are engine-sourced. A missing fee/funding series remains null/NOT_PUBLISHED, never zero. Native fixed reads do not inherit scalar optimizer/WFO methodology claims. Optional source gaps remain typed.',
  '', '| Recipe | Symbol | Run | Source rows | CPU /wall s | Native fills | Receipt SHA-256 |',
  '| --- | --- | --- | ---: | --- | ---: | --- |',
  ...facts.map(f=>`| ${f.profile_id} | ${f.symbol} | ${f.run_id} | ${f.snapshot_rows} | ${f.cpu_seconds.toFixed(3)} /${f.wall_seconds.toFixed(3)} | ${f.native_execution.fills_count} | ${f.private_receipt_sha256} |`),
  '',...new Set(facts.map(f=>`- Worker image: \`${f.worker_image}\`.`)),...new Set(facts.map(f=>`- API image: \`${f.api_image}\`.`)),
  '', '## Exact adapter byte custody','',...new Set(facts.map(f=>`- Adapter SHA-256: \`${f.adapter_sha256}\`.`)),
  '', '[Scope, regression/failure journal, activation and Claude consumer handoff](FULL_06_APPROVED_EXPANSION_2026-10-06.md).',''].join('\n');
 const summaryPath=join(home,'native-qualified-products-summary.json');
 assert(!existsSync(summaryPath),'IMMUTABLE_NATIVE_SUMMARY_EXISTS');
 savePrivate(summaryPath,{schema_version:'research.native-qualified-products.v1',passed:true,
   scope:'ORDINARY_PRODUCT_API_NOT_BROWSER_OR_RELEASE',recorded_at_utc:new Date().toISOString(),facts});
 writeFileSync(join(root,packet),text,{flag:'wx'});const receipt_sha256=sha(text);
 for(const row of rows){const q=table.qualification_references.find(q=>q.profile_id===row.profile_id);
  assert.equal(q.kind,'CANDIDATE_NOT_QUALIFIED');Object.assign(q,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:packet,receipt_sha256});}
 writeFileSync(join(root,tablePath),JSON.stringify(table,null,2)+'\n');
 console.log(JSON.stringify({qualified:3,runs:9,receipt_sha256}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{
 compileNative(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
}catch(e){console.error('Native qualification refused:',e.message);process.exitCode=1;}
