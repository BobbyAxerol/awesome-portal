/** Compiler predicate tests only; synthetic wire metadata is never product evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOrdinaryProductReceipt} from './full03-qualification.mjs';
const start=Date.UTC(2026,5,1),step=14400000,end=start+14*86400000;
function fixture(){
  const pair={profile_id:'full03.test-4h.v1',source_adapter_id:'full03.test-adapter-4h.v1'};
  const row={profile_id:'p10.test-4h.v1',profile_digest:'a'.repeat(64),public_profile:{timeframe:'4h'},
    descriptor:{source_clock:{bar_interval_ms:step},dataset_id:'crypto-binance-1m',
      alpha_binding_requirements:{alpha_version_id:'av_test_1_0_1'},current_source:pair},budgets:{planning_max_bars:100000}};
  const binding={closed_bar_policy:'CLOSED_BARS_ONLY',source_manifest_digest:'b'.repeat(64),provenance:{
    metadata_index_source_manifest_digest:'b'.repeat(64),metadata_index_as_of_utc_ms:end+step,metadata_index_revision:'c'.repeat(64)}};
  const reads=Object.fromEntries(['evidence','report','release-candidate',...['evidence','split','search','freeze','replay']
    .map(p=>'current-source/'+p)].map(route=>[route,{status:200,body:{provenance:pair,integrity:{state:'MATCH'}}}]));
  const record={passed:true,profile_id:row.profile_id,profile_digest:row.profile_digest,
    identity:{images:{'control-api':{image_id:'control-test'},'quant-worker-py':{image_id:'worker-test'}}},
    run:{run_id:'rrun_test',requested_spec:{alpha_binding:{alpha_version_id:'av_test_1_0_1'},
      data:{dataset_id:'crypto-binance-1m',timeframe:'4h',symbol:'BTCUSDT'},walk_forward:{start:new Date(start).toISOString(),end_exclusive:new Date(end).toISOString()}},
      preflight:{body:{dataset_binding:binding,snapshot:{warmup:{bars:300,requested_bars:300,start_utc_ms:start-300*step,end_exclusive_utc_ms:start},row_count:384,quality:{passed:true}}}},
      final:{body:{current:{effective_status:'COMPLETED',terminal_materialization:'READY'}}}},reads,negative_cursor:{status:400}};
  return {row,record};
}
test('accepts ordinary completion metadata with 300 target-bar predecessors',()=>{
  const {row,record}=fixture();assert.equal(assertOrdinaryProductReceipt(row,record).warmup_bars,300);
});
for(const [name,mutate]of [
  ['300 hours mistaken for 300 four-hour bars',r=>{r.run.preflight.body.snapshot.warmup.start_utc_ms=start-300*3600000;}],
  ['source borrowed from another manifest',r=>{r.run.preflight.body.dataset_binding.source_manifest_digest='d'.repeat(64);}],
  ['end beyond observed closed coverage',r=>{r.run.preflight.body.dataset_binding.provenance.metadata_index_as_of_utc_ms=end-1;}],
  ['market bars exceed configured ceiling',r=>{r.run.preflight.body.snapshot.row_count=100001;}],
  ['report still unavailable',r=>{r.reads.report.status=503;}],
  ['retained profile from another recipe',r=>{r.reads['current-source/search'].body.provenance={profile_id:'other',source_adapter_id:'other'};}],
])test('refuses '+name,()=>{const {row,record}=fixture();mutate(record);assert.throws(()=>assertOrdinaryProductReceipt(row,record));});
