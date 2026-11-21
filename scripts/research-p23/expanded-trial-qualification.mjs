#!/usr/bin/env node
/** Every indexed recipe has exact product proof;1h additionally proves all3symbols. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {privateJson,savePrivate,loadSessions,makeClient,ensureOwnedOperatorSession,ensureOwnedTestSession,withOwnedReadSessionRenewal} from './api-client.mjs';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
import {sealedCosts,assertModeTruth} from './full04-qualification.mjs';
import {validateHome} from './cell.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const tablePath='apps/portal/registry/research-execution-recipes.v1.json';
const packet='upgrade/research_loop/evidence/P10/EXPANDED_TRIAL_PRODUCT_QUALIFICATION_2026-10-06.md';
const sha=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'
 ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export async function compileExpanded(home){
 home=validateHome(home);assert(home.endsWith('/expanded'),'OWNED_EXPANDED_CELL');
 assert(!existsSync(join(root,packet)),'IMMUTABLE_PACKET_ALREADY_EXISTS');
 const table=JSON.parse(readFileSync(join(root,tablePath)));
 const old=JSON.parse(execFileSync('git',['show','ee3663d2330f7590b006412c235f8bbc17ffd7d6:'+tablePath],{cwd:root,maxBuffer:4*1024**2}));
 assert.deepEqual(table.recipes.slice(0,161),old.recipes,'ALL_161_OLD_DESCRIPTORS_UNCHANGED');
 assert.deepEqual(table.qualification_references.slice(0,161),old.qualification_references,'ALL_161_OLD_PROOFS_UNCHANGED');
 assert.equal(JSON.stringify(table.recipes.slice(0,161)),JSON.stringify(old.recipes),'OLD_DESCRIPTOR_SERIALIZED_BYTES_UNCHANGED');
 assert.equal(JSON.stringify(table.qualification_references.slice(0,161)),JSON.stringify(old.qualification_references),'OLD_PROOF_SERIALIZED_BYTES_UNCHANGED');
 const records=readdirSync(home).filter(f=>/^qualification-.*\.json$/.test(f))
  .map(file=>({file,record:privateJson(join(home,file))})).filter(i=>i.record.passed);
 const rows=table.recipes.filter(r=>r.descriptor.schema_version==='research.expanded-trial-profile.v1'
   && (r.public_profile.timeframe==='1h'?['BTCUSDT','ETHUSDT','SOLUSDT']:['BTCUSDT'])
     .every(symbol=>records.some(i=>i.record.profile_id===r.profile_id&&i.record.run.requested_spec.data.symbol===symbol)));
 assert.equal(rows.length,153,'EVERY_EXPANDED_INDEXED_RECIPE_REQUIRES_PRODUCT_PROOF');
 const facts=rows.flatMap(row=>records.filter(i=>i.record.profile_id===row.profile_id).map(({file,record})=>{
   const f=row.public_profile.optimization_mode==='mode_1_decay'?assertOrdinaryProductReceipt(row,record):assertModeTruth(row,record),search=record.reads['current-source/search'].body;
   assert.equal(search.search_contract.optuna_trials_per_study,record.run.requested_spec.optuna_trials);
   assert.deepEqual(record.reads['current-source/freeze'].body.stage4_binding.pairs,{params:'MATCH',bundle:'MATCH'});
   return {...f,trials_per_study:record.run.requested_spec.optuna_trials,retained_trial_rows:search.ledger.source_trial_count,
     private_receipt:file,receipt_sha256:sha(readFileSync(join(home,file)))};
 }));
 assert(facts.some(f=>f.trials_per_study===100)&&facts.some(f=>f.trials_per_study===400),'REAL_100_AND_400_TRIAL_PROOFS_REQUIRED');
 for(const [profile,trials] of [
   ['p10.delta-causal-inner-1h.v2',400],
   ['p10.imported-wfo-temporal-1h.v2',100],
   ['p10.delta-mode5-global-1h.v2',100],
   ['p10.delta-mode3-global-1h.v2',400],
 ])assert(facts.some(f=>f.profile_id===profile&&f.symbol==='BTCUSDT'&&f.trials_per_study===trials),
   'EXACT_HIGH_TRIAL_FAMILY_PROOF_REQUIRED:'+profile);
 const costs=sealedCosts(facts.map(f=>f.run_id)),imported=privateJson(join(home,'imported-registration.json'));
 assert.equal(imported.registration.lifecycle_state,'DRAFT');assert.equal(imported.gates.all_pass,true);
 for(const f of facts){const caps=rows.find(r=>r.profile_id===f.profile_id).budgets,c=costs[f.run_id];
   assert(c.engine.version==='1.1.1'&&c.resource.cpu_seconds<=caps.cpu_seconds+1&&c.resource.elapsed_seconds<=caps.wall_seconds+1);
   assert(c.resource.peak_rss_bytes>0&&c.resource.peak_rss_bytes<=caps.memory_bytes);
   assert.equal(c.resource.enforced_limits.cpu_seconds,caps.cpu_seconds);
   assert.equal(c.resource.enforced_limits.scratch_bytes,caps.scratch_bytes);
   assert.equal(c.resource.enforced_limits.address_space_bytes,caps.memory_bytes);
   if(rows.find(r=>r.profile_id===f.profile_id).source_requirement==='IMPORTED_IMMUTABLE_SEARCH_BINDING'){
    assert.equal(c.alpha_version_id,imported.registration.alpha_version_id);
    assert.equal(c.imported_search_binding.source_digest,imported.source_digest);
    assert.equal(c.imported_search_binding.entrypoint,imported.declaration.entrypoint);
    assert.equal(c.imported_search_binding.declaration_digest,sha(JSON.stringify(canonical(c.imported_search_binding.declaration))));
    assert.equal(c.imported_search_binding.parameter_space_digest,sha(JSON.stringify(canonical(c.imported_search_binding.parameter_space))));
    Object.assign(f,{imported_source_digest:imported.source_digest,
     declaration_digest:c.imported_search_binding.declaration_digest,
     parameter_space_digest:c.imported_search_binding.parameter_space_digest});
   }
   Object.assign(f,{cpu_seconds:c.resource.cpu_seconds,wall_seconds:c.resource.elapsed_seconds,rss_bytes:c.resource.peak_rss_bytes});
 }
 const owner=withOwnedReadSessionRenewal(makeClient(loadSessions(home).identities.find(u=>u.username==='p23-owner')),home),
  other=withOwnedReadSessionRenewal(makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01')),home);
 await ensureOwnedOperatorSession(owner,home);await ensureOwnedTestSession(other,home);
 const w=(await owner.call('GET','/api/workspaces')).body;const first=(Array.isArray(w)?w:w.workspaces)[0];
 for(const f of facts)await other.call('GET',`/api/v1/quantbt/runs/${f.run_id}/current-source/search?workspace_id=${encodeURIComponent(first.workspace_id??first.workspaceId)}`,undefined,[404]);
 const summaryPath=join(home,'qualified-products-summary.json');
 assert(!existsSync(summaryPath),'IMMUTABLE_EXPANDED_SUMMARY_EXISTS');
 savePrivate(summaryPath,{schema_version:'research.expanded-qualified-products.v1',passed:true,
   scope:'ORDINARY_PRODUCT_API_NOT_BROWSER_OR_RELEASE',recorded_at_utc:new Date().toISOString(),facts});
 const markdown=['# Expanded trials — exact product qualification','',
  `Verdict: **${rows.length}/153 new recipes PRODUCT_RUN_QUALIFIED**, ${facts.length} ordinary product runs. All27 indexed1h recipes have BTCUSDT, ETHUSDT and SOLUSDT receipts; the other126 recipes have exact BTCUSDT/clock receipts, not a claim that every symbol/clock combination was run. Not every engine route or browser acceptance.`,
  'P08 → P10 → confined pinned QuantBT1.1.1 → P05 → eight bounded screen reads. Real100/400-trial proofs; per-study count preserved, complete ledger paged200, chart capped600 with theta retained. Actual PRUNED states are not fabricated COMPLETE trials.',
  'All161 historical descriptors/proofs remain byte-equivalent. Neither old seals nor AlphaVersion bindings are rewritten. Foreign workspace404 and malformed cursor400; source fee/funding absence remains null.',
  '', '| Exact recipe | Symbol | Requested/study | Retained rows | Run | CPU /wall s | Receipt SHA-256 |',
  '| --- | --- | ---: | ---: | --- | --- | --- |',
  ...facts.map(f=>`| ${f.profile_id} | ${f.symbol} | ${f.trials_per_study} | ${f.retained_trial_rows} | ${f.run_id} | ${f.cpu_seconds.toFixed(3)} /${f.wall_seconds.toFixed(3)} | ${f.receipt_sha256} |`),
  '',...new Set(facts.map(f=>`- Worker image: \`${f.child_image_id}\`.`)),...new Set(facts.map(f=>`- Control API image: \`${f.api_image_id}\`.`)),
  '', '[Delivery, remaining required native routes and frontend handoff](FULL_06_APPROVED_EXPANSION_2026-10-06.md).',''].join('\n');
 writeFileSync(join(root,packet),markdown,{flag:'wx'});const hash=sha(markdown);
 for(const row of rows){const q=table.qualification_references.find(q=>q.profile_id===row.profile_id);assert(q.kind==='CANDIDATE_NOT_QUALIFIED');
  Object.assign(q,{kind:'PRODUCT_RUN_QUALIFIED',receipt_path:packet,receipt_sha256:hash});}
 writeFileSync(join(root,tablePath),JSON.stringify(table,null,2)+'\n');
 console.log(JSON.stringify({qualified:rows.length,runs:facts.length,receipt_sha256:hash}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))compileExpanded(process.argv.find(a=>a.startsWith('--home='))?.slice(7))
 .catch(e=>{console.error('Expanded qualification refused:',e.message);process.exitCode=1;});
