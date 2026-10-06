#!/usr/bin/env node
/** Only exact authenticated pct-equity product receipts grant a recipe authority. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHome} from './cell.mjs';
import {privateJson,operatorClient,makeClient,loadSessions,savePrivate} from './api-client.mjs';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
import {assertModeTruth,sealedCosts} from './full04-qualification.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const tablePath='apps/portal/registry/research-execution-recipes.v1.json';
const packet='upgrade/research_loop/evidence/P10/FULL_06_PERCENT_EQUITY_PRODUCT_QUALIFICATION_2026-10-06.md';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function sealedAccounts(facts){
 const container='portal-research-p23-ol12-portal-api-1';
 assert.equal(execFileSync('sudo',['-n','docker','inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container],{encoding:'utf8'}).trim(),'portal-research-p23-ol12');
 return JSON.parse(execFileSync('sudo',['-n','docker','exec','-i',container,'python','-c',`
import hashlib,json,re,sys
from pathlib import Path
root=Path('/var/lib/portal/artifacts/runs/durable-store/research-retained/artifacts');out={}
index={}
for path in root.glob('*/manifest.json'):
 raw=path.read_bytes();manifest=json.loads(raw);index.setdefault(manifest['run_id'],[]).append((path,raw,manifest))
for fact in json.load(sys.stdin):
 run=fact['run_id']
 assert re.fullmatch(r'rrun_[0-9a-f]{32}',run)
 matches=index.get(run,[]);assert len(matches)==1,'EXACT_P05_ARTIFACT:'+run
 path,raw,manifest=matches[0];assert hashlib.sha256(raw).hexdigest()==fact['retained_manifest_digest'],'P05_MANIFEST_CUSTODY:'+run
 configs=[d for d in manifest['documents'] if d['name']=='source_config'];assert len(configs)==1
 document=configs[0];assert document['relative_path']=='documents/source_config.json'
 raw=(path.parent/document['relative_path']).read_bytes();digest=document['sha256']
 assert len(raw)==document['bytes'] and len(raw)<=1048576 and hashlib.sha256(raw).hexdigest()==digest
 config=json.loads(raw);out[run]={'manifest_sha256':fact['retained_manifest_digest'],'config_sha256':digest,'account':config['account'],'execution':config['execution']}
print(json.dumps(out))`],{input:JSON.stringify(facts),encoding:'utf8',maxBuffer:4*1024*1024}));
}
export async function compileFull06(home){
 home=validateHome(home);assert(home.endsWith('/full06'),'EXACT_FULL06_HOME');
 const table=JSON.parse(readFileSync(join(root,tablePath))),rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full06-delta-profile.v1');
 assert.equal(rows.length,63);assert(!existsSync(join(root,packet)),'IMMUTABLE_PACKET_EXISTS');
 const predecessorBytes=execFileSync('git',['show','5e8549331234c101f42ae1bd6fcfec39f678682e:'+tablePath],
   {cwd:root,maxBuffer:4*1024*1024});
 const predecessor=JSON.parse(predecessorBytes);assert.equal(predecessor.recipes.length,98);
 assert.deepEqual(table.recipes.slice(0,98),predecessor.recipes,'PRESERVE_ALL_98_RECIPE_DESCRIPTORS');
 assert.deepEqual(table.qualification_references.slice(0,98),predecessor.qualification_references,'PRESERVE_ALL_98_QUALIFICATIONS');
 const files=readdirSync(home).filter(f=>f.startsWith('qualification-')&&f.endsWith('.json'));
 const records=files.map(file=>({file,record:privateJson(join(home,file))}));
 const facts=rows.map(row=>{
  const items=records.filter(i=>i.record.passed&&i.record.profile_id===row.profile_id).sort((a,b)=>a.record.finished_at_utc.localeCompare(b.record.finished_at_utc));
  assert(items.length,'MISSING_PERCENT_EQUITY_PRODUCT:'+row.profile_id);const item=items.at(-1);
  assert.equal(item.record.run.requested_spec.execution_route,'pct_equity');
  assert.equal(item.record.run.requested_spec.alpha_binding.alpha_version_id,'av_delta_rsi_polynomial_alpha_1_0_2');
  assert.deepEqual(item.record.reads['current-source/freeze'].body.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'});
  const execution=item.record.reads['current-source/replay'].body.execution;
  assert.equal(execution.totals.fee,null);assert.equal(execution.totals.funding,null);assert.equal(execution.totals.turnover,null);
  assert.equal(execution.counts.bars_with_turnover,null);
  if(execution.route.engine_id==='unknown')assert.equal(execution.route.accounting_certified,null,'NO_INVENTED_NATIVE_ACCOUNT_CERTIFICATION');
  const base=row.public_profile.optimization_mode==='mode_1_decay'?assertOrdinaryProductReceipt(row,item.record):assertModeTruth(row,item.record);
  return {...base,execution_route:'pct_equity',private_receipt:item.file,private_receipt_sha256:sha(readFileSync(join(home,item.file)))};
 });
 const costs=sealedCosts(facts.map(f=>f.run_id)),accounts=sealedAccounts(facts.map(({run_id,retained_manifest_digest})=>({run_id,retained_manifest_digest})));
 for(const f of facts){const row=rows.find(r=>r.profile_id===f.profile_id),cost=costs[f.run_id],account=accounts[f.run_id];
  assert.equal(cost.engine.version,'1.1.1');assert(cost.resource.cpu_seconds<=row.budgets.cpu_seconds+1&&cost.resource.elapsed_seconds<=row.budgets.wall_seconds+1);
  assert(cost.resource.peak_rss_bytes>0&&cost.resource.peak_rss_bytes<=row.budgets.memory_bytes);
  assert.equal(cost.resource.enforced_limits.scratch_bytes,row.budgets.scratch_bytes);
  for(const key of ['initial_capital','leverage','alloc_per_trade','canonical_one_way_fee_rate','funding_enabled'])assert.equal(account.account[key],row.descriptor.account[key],key);
  assert.equal(account.execution.target_mode,'pct_equity');assert.equal(account.execution.slippage,0);assert.equal(account.execution.backend,'auto');
  Object.assign(f,{cost,account,configured_caps:row.budgets});
 }
 const owner=await operatorClient(home),other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
 const ws=(await owner.call('GET','/api/workspaces')).body,w=(Array.isArray(ws)?ws:ws.workspaces)[0],workspace=w.workspace_id??w.workspaceId;
 assert(typeof workspace==='string');const isolation=[];
 for(const f of facts){const r=await other.call('GET',`/api/v1/quantbt/runs/${f.run_id}/current-source/search?workspace_id=${encodeURIComponent(workspace)}`,undefined,[404]);isolation.push({run_id:f.run_id,status:r.status});}
 const summary={schema_version:'research.full06-qualified-products.v1',scope:'EXACT_PERCENT_EQUITY_PRODUCT_API_NOT_ALL_ROUTE_FAMILIES_OR_BROWSER',recorded_at_utc:new Date().toISOString(),passed:true,
   predecessor:{commit:'5e8549331234c101f42ae1bd6fcfec39f678682e',table_sha256:sha(predecessorBytes),descriptors_and_qualifications_unchanged:98},facts,isolation};
 const summaryPath=join(home,'qualified-products-summary.json');assert(!existsSync(summaryPath));savePrivate(summaryPath,summary);
 const markdown=['# FULL-06 /6a — Immutable percent-equity product qualification','',
  'Verdict: **63/63 PRODUCT_RUN_QUALIFIED** for percent-equity only. Ordinary authenticated P08 → P10 → confined pinned QuantBT1.1.1 → P05 → eight named reads through RC.',
  'Not acceptance of6b–6f, browser, production or release. Other route input adapters and genuine inputs are listed in the implementation ledger.',
  `All98 predecessor recipes and their qualification rows deep-equal FULL05 at5e854933; predecessor table SHA-256: \`${sha(predecessorBytes)}\`.`,
  'AV `av_delta_rsi_polynomial_alpha_1_0_2` is separate from protected historical notional AV1.0.1. Allocation0.1 is10% of live equity on signal changes, not2,000 currency units. Capital20,000; leverage3; canonical one-way fee0.0005; slippage0; fundingoff. Sealed config bytes are compared for each actual run.',
  'Percent-equity results do not emit per-bar fees/funding/turnover: these remain null, never zero or invented fills. Absent order/fill/trade fields remain null; an actually source-published empty collection counts zero. Source equity/positions/candles and independently emitted lifecycle audit are retained; positions retain legacy engine semantics, not an assertion of native target units. Source unknown/unspecified execution tokens and null accounting certification are preserved, not converted into a native account certification. The native-prepared-WFO clock token does not certify a final native account runtime.',
  `Private summary SHA-256: \`${sha(readFileSync(summaryPath))}\`.`,
  '| Exact recipe | Real run | Bars | CPU /wall seconds /RSS MiB | Receipt SHA-256 |','| --- | --- | ---: | --- | --- |',
  ...facts.map(f=>`| ${f.profile_id} | ${f.run_id} | ${f.snapshot_rows} | ${f.cost.resource.cpu_seconds.toFixed(3)} /${f.cost.resource.elapsed_seconds.toFixed(3)} /${(f.cost.resource.peak_rss_bytes/1048576).toFixed(1)} | ${f.private_receipt_sha256} |`),
  '', 'Each exact recipe retains120CPU/240wall seconds,4GiB address space,128MiB scratch and100,000 target bars. Scratch high-water NOT_MEASURED; no preview-long override. Each uses300 actual indexed target-bar predecessors,7 closed fixed-UTC HMD clocks. Native mode/selection/holdout disclosure stays unchanged.',
  'All63 foreign-workspace reads404; malformed cursors400; retained byte custody and Stage4 params/bundle MATCH; RC missing count0. Old AV/seals/candidate qualifications are never rewritten.',
  '',...new Set(facts.map(f=>`- Worker image: \`${f.child_image_id}\`.`)),...new Set(facts.map(f=>`- Control API image: \`${f.api_image_id}\`.`)),
  '', '[Delivery, exact remaining route gaps, rollback and frontend handoff](FULL_06_ROUTE_FAMILIES_2026-10-06.md).',''].join('\n');
 writeFileSync(join(root,packet),markdown,{flag:'wx'});const receipt_sha256=sha(markdown);
 for(const row of rows){const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);assert.equal(ref.kind,'CANDIDATE_NOT_QUALIFIED');assert.equal(ref.recipe_digest,sha(JSON.stringify(canonical(row))));Object.assign(ref,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:packet,receipt_sha256});}
 writeFileSync(join(root,tablePath),JSON.stringify(table,null,2)+'\n');console.log(JSON.stringify({passed:true,recipes:63,receipt_sha256}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))compileFull06(process.argv.find(a=>a.startsWith('--home='))?.slice(7)).catch(e=>{console.error('FULL06 refused:',e.message);process.exitCode=1;});
