#!/usr/bin/env node
/** Freeze only independent authenticated imported-product receipts. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateHome} from './cell.mjs';
import {privateJson,operatorClient,makeClient,loadSessions,savePrivate} from './api-client.mjs';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
import {assertModeTruth,sealedCosts} from './full04-qualification.mjs';
const ROOT=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const TABLE='apps/portal/registry/research-execution-recipes.v1.json';
const PACKET='upgrade/research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function compileFull05(home){
  home=validateHome(home);assert(home.endsWith('/full05'),'EXACT_FULL05_HOME');
  const table=JSON.parse(readFileSync(join(ROOT,TABLE))),rows=table.recipes.filter(r=>r.source_requirement==='IMPORTED_IMMUTABLE_SEARCH_BINDING');
  assert.equal(rows.length,27);assert(!existsSync(join(ROOT,PACKET)),'IMMUTABLE_PACKET_EXISTS');
  const source=privateJson(join(home,'imported-registration.json'));
  assert.equal(source.registration.lifecycle_state,'DRAFT');assert.equal(source.gates.all_pass,true);
  assert.equal(sha(readFileSync(join(ROOT,'apps/portal/frontend/src/research/samples/deltaRsiReference.py'))),source.source_digest);
  const files=readdirSync(home).filter(f=>f.startsWith('qualification-')&&f.endsWith('.json'));
  const facts=rows.map(row=>{
    const records=files.map(file=>({file,record:privateJson(join(home,file))})).filter(i=>i.record.passed&&i.record.profile_id===row.profile_id);
    assert(records.length,'MISSING_IMPORTED_PRODUCT:'+row.profile_id);
    const item=records.at(-1),base=row.public_profile.optimization_mode==='mode_1_decay'?assertOrdinaryProductReceipt(row,item.record):assertModeTruth(row,item.record);
    assert.equal(item.record.run.requested_spec.alpha_binding.alpha_version_id,source.registration.alpha_version_id);
    return {...base,alpha_version_id:source.registration.alpha_version_id,source_digest:source.source_digest,
      private_receipt:item.file,private_receipt_sha256:sha(readFileSync(join(home,item.file)))};
  });
  const costs=sealedCosts(facts.map(f=>f.run_id));
  for(const f of facts){const cost=costs[f.run_id],caps=rows.find(r=>r.profile_id===f.profile_id).budgets;
    assert.equal(cost.alpha_version_id,source.registration.alpha_version_id);assert.equal(cost.imported_search_binding.source_digest,source.source_digest);
    assert.equal(cost.imported_search_binding.entrypoint,source.declaration.entrypoint);
    assert.equal(cost.imported_search_binding.declaration_digest,sha(JSON.stringify(canonical(cost.imported_search_binding.declaration))));
    assert.equal(cost.imported_search_binding.parameter_space_digest,sha(JSON.stringify(canonical(cost.imported_search_binding.parameter_space))));
    assert.equal(cost.engine.version,'1.1.1');assert(cost.resource.cpu_seconds<=caps.cpu_seconds+1&&cost.resource.elapsed_seconds<=caps.wall_seconds+1);
    assert(cost.resource.peak_rss_bytes>0&&cost.resource.peak_rss_bytes<=caps.memory_bytes);
    assert.equal(cost.resource.enforced_limits.scratch_bytes,caps.scratch_bytes);Object.assign(f,{cost,configured_caps:caps,
      declaration_digest:cost.imported_search_binding.declaration_digest,parameter_space_digest:cost.imported_search_binding.parameter_space_digest});
  }
  const owner=await operatorClient(home),other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
  const ws=(await owner.call('GET','/api/workspaces')).body;const workspace=(Array.isArray(ws)?ws:ws.workspaces)[0];
  const workspaceId=workspace.workspace_id??workspace.workspaceId;assert(typeof workspaceId==='string');
  const isolation=[];
  for(const f of facts){const result=await other.call('GET',`/api/v1/quantbt/runs/${f.run_id}/current-source/search?workspace_id=${encodeURIComponent(workspaceId)}`,undefined,[404]);isolation.push({run_id:f.run_id,status:result.status});}
  const summary={schema_version:'research.full05-qualified-products.v1',scope:'ORDINARY_PRODUCT_API_NOT_BROWSER_OR_RELEASE',passed:true,
    recorded_at_utc:new Date().toISOString(),source_digest:source.source_digest,alpha_version_id:source.registration.alpha_version_id,facts,isolation};
  const summaryPath=join(home,'qualified-products-summary.json');assert(!existsSync(summaryPath));savePrivate(summaryPath,summary);
  const markdown=['# FULL-05 — Immutable imported-source product qualification','',
    'Verdict: **27/27 PRODUCT_RUN_QUALIFIED**. Authenticated P07 import/register (DRAFT) → P08 → P10 → confined QuantBT 1.1.1 → P05 → eight named screen reads.',
    'This is backend product qualification, not browser/production/release acceptance. No built-in Delta receipt is reused.',
    `Imported AV: \`${source.registration.alpha_version_id}\`. Source SHA-256: \`${source.source_digest}\`.`,
    'Canonical purpose-separated Delta/RSI source; declared 256 target-bar warmup, 1h/4h/1d fixed-UTC indexed BTCUSDT history. Numeric ranges/steps, pins and numeric categories supported; nonnumeric optimizer parameters and categorical centroids have explicit incompatibility refusals, never encoded as fake decimals.',
    `Private summary SHA-256: \`${sha(readFileSync(summaryPath))}\`.`,
    '| Exact recipe | Real run | Bars | CPU s / wall s / RSS MiB | Receipt SHA-256 |','| --- | --- | ---: | --- | --- |',
    ...facts.map(f=>`| ${f.profile_id} | ${f.run_id} | ${f.snapshot_rows} | ${f.cost.resource.cpu_seconds.toFixed(3)} / ${f.cost.resource.elapsed_seconds.toFixed(3)} / ${(f.cost.resource.peak_rss_bytes/1048576).toFixed(1)} | ${f.private_receipt_sha256} |`),
    '', 'All exact caps remain 120 CPU/240 wall seconds,4GiB address space,128MiB scratch. Scratch high-water is NOT_MEASURED. Native mode/schedule selection is retained; no causal-inner claim for global/mode3/mode5; independent Three Window Holdout is not selection input.',
    'All27 foreign-workspace reads return404; malformed cursors400, retained byte/Stage4 params/bundle MATCH, RC missing count0. Source bytes/immutable declaration live under the same lease; private credentials/DSNs stay outside Git.',
    '',...new Set(facts.map(f=>`- Worker image: \`${f.child_image_id}\`.`)),...new Set(facts.map(f=>`- Control API image: \`${f.api_image_id}\`.`)),
    '', '[Implementation and frontend handoff](FULL_05_IMPORTED_ALPHA_2026-10-06.md).',''].join('\n');
  writeFileSync(join(ROOT,PACKET),markdown,{flag:'wx'});const receipt_sha256=sha(markdown);
  for(const row of rows){const ref=table.qualification_references.find(r=>r.profile_id===row.profile_id);assert.equal(ref.recipe_digest,sha(JSON.stringify(canonical(row))));assert.equal(ref.kind,'CANDIDATE_NOT_QUALIFIED');Object.assign(ref,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:PACKET,receipt_sha256});}
  writeFileSync(join(ROOT,TABLE),JSON.stringify(table,null,2)+'\n');console.log(JSON.stringify({passed:true,recipes:27,receipt_sha256}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))compileFull05(process.argv.find(a=>a.startsWith('--home='))?.slice(7)).catch(e=>{console.error(e.message);process.exitCode=1;});
