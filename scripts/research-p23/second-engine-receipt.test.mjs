import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessEnginePair} from './second-engine-receipt.mjs';
import {HISTORICAL_TEST_MANIFEST_LOSSES} from './historical-manifest-exceptions.mjs';

const old=()=>({engine_version:'1.1.0',native_version:'0.4.1',run_id:'same',
  request_sha256:'a',binding_sha256:'b',manifest_sha256:'c',snapshot_sha256:'d',snapshot_id:'same',
  dataset:{symbol:'ETHUSDT'},windows:{},original_bytes_unchanged:true,
  direct:{bars:'636',final_equity:'20001.25',num_trades:'4'},portal_gateway:{state:'REFUSED'}});
const current=()=>({...old(),engine_version:'1.1.1',native_version:'0.4.2',portal_gateway:{state:'ACCEPTED'}});

test('real public engine qualification never upgrades into Portal admission proof',()=>{
  const result=assessEnginePair(old(),current());
  assert.equal(result.t07_t13_p24_t05_passed,false);
  assert.equal(result.numerical_differences.final_equity,'0');
});
test('a differently built current wheel is not an old engine',()=>{
  assert.throws(()=>assessEnginePair(current(),current()),/REAL_OLD_ENGINE_REQUIRED/);
});
test('input drift, rewritten bytes and implicit old admission invalidate qualification',()=>{
  for(const override of [{request_sha256:'wrong'},{original_bytes_unchanged:false},
    {portal_gateway:{state:'ACCEPTED'}},{dataset:{symbol:'BTCUSDT'}}]) {
    assert.throws(()=>assessEnginePair({...old(),...override},current()));
  }
});

test('owner exception is exactly the attested three IDs, never strict integrity or product GO',()=>{
  const root=new URL('../../upgrade/research_loop/evidence/P24/',import.meta.url);
  const candidate=JSON.parse(readFileSync(new URL('current-source-candidate-manifest.v5.json',root)));
  const original=readFileSync(new URL(candidate.inherits.file,root));
  assert.equal(createHash('sha256').update(original).digest('hex'),candidate.inherits.sha256);
  assert.deepEqual(candidate.owner_scope_exception.run_ids,HISTORICAL_TEST_MANIFEST_LOSSES.map(x=>x.run_id));
  assert.deepEqual(candidate.owner_scope_exception.artifact_ids,HISTORICAL_TEST_MANIFEST_LOSSES.map(x=>x.artifact_id));
  assert.equal(candidate.owner_scope_exception_approved,true);
  assert.equal(candidate.verified_historical_manifests,83);
  assert.equal(candidate.required_historical_manifests,86);
  for(const key of ['full_store_integrity','full_p23_passed','full_p24_passed','signed_release',
    'actual_second_portal_qualified_engine']) assert.equal(candidate[key],false);
});
