#!/usr/bin/env node
/** Compile immutable, sanitized qualification from ordinary private product receipts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateJson,savePrivate,operatorClient,loadSessions,makeClient} from './api-client.mjs';
import {validateHome} from './cell.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const TABLE='apps/portal/registry/research-execution-recipes.v1.json';
const PACKET='upgrade/research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function assertOrdinaryProductReceipt(row,record){
  assert(record.passed&&record.profile_id===row.profile_id&&record.profile_digest===row.profile_digest,'EXACT_PASSED_RECIPE');
  const run=record.run,spec=run.requested_spec,preflight=run.preflight.body,step=row.descriptor.source_clock.bar_interval_ms;
  const start=Date.parse(spec.walk_forward?.start??spec.windows.is.start),end=Date.parse(spec.walk_forward?.end_exclusive??spec.windows.holdout.end_exclusive);
  assert.equal(spec.alpha_binding.alpha_version_id,row.descriptor.alpha_binding_requirements.alpha_version_id);
  assert.equal(spec.data.dataset_id,row.descriptor.dataset_id);assert.equal(spec.data.timeframe,row.public_profile.timeframe);
  assert.equal(preflight.snapshot.warmup.bars,300);assert.equal(preflight.snapshot.warmup.requested_bars,300);
  assert.equal(preflight.snapshot.warmup.start_utc_ms,start-300*step);
  assert.equal(preflight.snapshot.warmup.end_exclusive_utc_ms,start);
  assert(preflight.snapshot.row_count<=row.budgets.planning_max_bars&&preflight.snapshot.quality.passed,'ACTUAL_BAR_BUDGET_AND_GAP_SCAN');
  assert(start%step===0&&end%step===0,'SOURCE_ALIGNED_HALF_OPEN_EDGES');
  assert.equal(preflight.dataset_binding.closed_bar_policy,'CLOSED_BARS_ONLY');
  assert.equal(preflight.dataset_binding.provenance.metadata_index_source_manifest_digest,preflight.dataset_binding.source_manifest_digest);
  assert(end<=preflight.dataset_binding.provenance.metadata_index_as_of_utc_ms,'NO_UNOBSERVED_FUTURE_COVERAGE');
  assert.equal(run.final.body.current.effective_status,'COMPLETED');assert.equal(run.final.body.current.terminal_materialization,'READY');
  assert.equal(record.reads['current-source/freeze'].body.integrity.state,'MATCH');
  for(const [route,result]of Object.entries(record.reads)){
    assert.equal(result.status,200);assert(Buffer.byteLength(JSON.stringify(result.body))<=1048576,'BOUNDED_NAMED_READ');
    if(route.startsWith('current-source/'))assert.deepEqual(
      {profile_id:result.body.provenance.profile_id,source_adapter_id:result.body.provenance.source_adapter_id},row.descriptor.current_source);
  }
  assert.equal(Object.keys(record.reads).length,8);assert.equal(record.negative_cursor.status,400);
  return {profile_id:row.profile_id,profile_digest:row.profile_digest,run_id:run.run_id,timeframe:spec.data.timeframe,
    dataset_id:spec.data.dataset_id,symbol:spec.data.symbol,start_utc_ms:start,end_exclusive_utc_ms:end,
    warmup_bars:preflight.snapshot.warmup.bars,snapshot_rows:preflight.snapshot.row_count,
    index_revision:preflight.dataset_binding.provenance.metadata_index_revision,
    source_manifest_digest:preflight.dataset_binding.source_manifest_digest,
    source_profile_id:row.descriptor.current_source.profile_id,
    api_image_id:record.identity.images['control-api'].image_id,
    child_image_id:record.identity.images['quant-worker-py'].image_id,
    requested_spec_digest:preflight.requested_spec_digest,
    retained_manifest_digest:record.reads['current-source/freeze'].body.provenance.manifest_digest};
}
export async function compileQualification(home){
  home=validateHome(home);assert(home.endsWith('/full03'),'EXACT_FULL03_OWNED_CELL');
  const path=join(ROOT,TABLE),table=JSON.parse(readFileSync(path)),rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.full03-delta-profile.v1');
  assert.equal(rows.length,28);assert(!existsSync(join(ROOT,PACKET)),'IMMUTABLE_PRODUCT_PACKET_ALREADY_EXISTS');
  const files=readdirSync(home).filter(f=>f.startsWith('qualification-')&&f.endsWith('.json'));
  const facts=rows.map(row=>{
    const candidates=files.map(file=>({file,record:privateJson(join(home,file))}))
      .filter(item=>item.record.passed&&item.record.profile_id===row.profile_id)
      .sort((a,b)=>a.record.finished_at_utc.localeCompare(b.record.finished_at_utc));
    assert(candidates.length,'MISSING_PRODUCT_PROOF:'+row.profile_id);
    const item=candidates.at(-1);return {...assertOrdinaryProductReceipt(row,item.record),
      private_receipt:item.file,private_receipt_sha256:sha(readFileSync(join(home,item.file)))};
  });
  // A real foreign workspace with a valid identity, not omission of a required key.
  const owner=await operatorClient(home),other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
  const response=(await owner.call('GET','/api/workspaces')).body;
  const workspaces=Array.isArray(response)?response:response.workspaces;
  assert(workspaces.length);const workspace=workspaces[0].workspace_id??workspaces[0].workspaceId;
  assert(typeof workspace==='string'&&workspace.length);
  const isolation=[];
  for(const fact of facts){
    const result=await other.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/search?workspace_id=${encodeURIComponent(workspace)}`,undefined,[404]);
    isolation.push({profile_id:fact.profile_id,run_id:fact.run_id,status:result.status});
  }
  const proof={schema_version:'research.full03-qualified-products.v1',scope:'ORDINARY_PRODUCT_API_NOT_BROWSER_OR_RELEASE',
    recorded_at_utc:new Date().toISOString(),passed:true,facts,isolation};
  const privatePath=join(home,'qualified-products-summary.json');assert(!existsSync(privatePath),'PRIOR_SUMMARY_MUST_NOT_BE_OVERWRITTEN');
  savePrivate(privatePath,proof);
  const markdown=[
    '# FULL-03 — Immutable exact product qualification',
    '',
    'Verdict: **28/28 PRODUCT_RUN_QUALIFIED**. Scope: ordinary authenticated',
    'P08 preflight → P10 admission → isolated pinned QuantBT 1.1.1 child →',
    'P05 immutable retention → eight named product reads. Not browser, production',
    'or release acceptance. Private response/credential artifacts stay outside Git.',
    '',
    'Dataset `crypto-binance-1m`, symbol `BTCUSDT` (perpetual source). All seven',
    'indexed UTC resolutions: 1m/5m/15m/30m/1h/4h/1d. Three real trials per study.',
    'Every preflight proves 300 **target-bar** predecessors, aligned half-open',
    'edges, observed closed coverage, zero gaps and input <=100,000 bars.',
    'Daily uses 2024-01-01…2025-03-01 Advanced / 2024-01-01…2025-01-01 Three Window;',
    'other resolutions use 2026-06-01…2026-07-15 Advanced / 2026-06-01…2026-07-06 Three Window.',
    'Engine-built folds remain authoritative. Global/causal/decay/Three Window',
    'selection scope is checked separately; Three Window holdout is not used for selection.',
    '',
    `Index revision: \`${facts[0].index_revision}\`.`,
    `Source manifest: \`${facts[0].source_manifest_digest}\`.`,
    `Private sanitized summary SHA-256: \`${sha(readFileSync(privatePath))}\`.`,
    'All current-source reads are AVAILABLE with their exact source/profile pair;',
    'retained byte custody and Stage4 params/bundle match, RC missing count is zero.',
    'Each malformed cursor returns 400 and all 28 foreign-workspace reads return 404.',
    '',
    '| Exact profile | Real run | Snapshot rows including warmup | Private receipt SHA-256 |',
    '| --- | --- | ---: | --- |',
    ...facts.map(f=>`| ${f.profile_id} | ${f.run_id} | ${f.snapshot_rows} | ${f.private_receipt_sha256} |`),
    '',
    '## Immutable runtime identities',
    '',
    ...[...new Set(facts.map(f=>f.child_image_id))].map(id=>`- Child/worker image: \`${id}\`.`),
    ...[...new Set(facts.map(f=>f.api_image_id))].map(id=>`- Control API proof image: \`${id}\`.`),
    '',
    'Recipe descriptors and numeric strategy are unchanged by qualification. The proof',
    'records each exact worker image (including bounded 1m storage/display fixes).',
    'The final activation image additionally records these receipts; it does not rerun or',
    'replace any old seal/AV/index. Migration 100 appends product proof to the candidate',
    'history created by 098. Old 096/097 FULL-02 proof stays byte-identical.',
    '',
    'Source-clock boundary evidence and implementation/rollback/cleanup receipt:',
    '[source discovery](FULL_03_SOURCE_CLOCK_DISCOVERY_2026-10-06.md),',
    '[delivery](FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md).',
    '',
  ].join('\n');
  writeFileSync(join(ROOT,PACKET),markdown,{flag:'wx'});
  const receipt_sha256=sha(Buffer.from(markdown));
  for(const row of rows){const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);
    assert.equal(ref.recipe_digest,sha(JSON.stringify(canonical(row))));
    assert.equal(ref.kind,'CANDIDATE_NOT_QUALIFIED');Object.assign(ref,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:PACKET,receipt_sha256});}
  writeFileSync(path,JSON.stringify(table,null,2)+'\n');
  console.log(JSON.stringify({passed:true,recipes:facts.length,foreign_workspace_checks:isolation.length,receipt_sha256}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))compileQualification(
  process.argv.find(a=>a.startsWith('--home='))?.slice(7)).catch(error=>{console.error('FULL03 qualification compiler refused:',error.message);process.exitCode=1;});
