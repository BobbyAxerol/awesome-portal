#!/usr/bin/env node
/** Resumable, serial ordinary product matrix. No direct engine substitutions. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {privateJson} from './api-client.mjs';
import {validateHome} from './cell.mjs';
import {full03Receipt} from './full03-product-receipt.mjs';
import {nativeReceipt} from './native-route-product-receipt.mjs';

export function receiptMetadata(record){
 return {profile_id:record.profile_id,profile_digest:record.profile_digest,
  symbol:record.symbol??record.run?.requested_spec.data.symbol,passed:record.passed,
  trials:record.run?.requested_spec.optuna_trials,
  worker_image:record.identity?.images?.['quant-worker-py']?.image_id};
}

export async function runMatrix(home,lane='native'){
 home=validateHome(home);assert(home.endsWith('/expanded'));
 assert(['native','expanded-1h','expanded-indexed'].includes(lane),'EXPLICIT_OWNED_MATRIX');
 const table=JSON.parse(readFileSync(new URL('../../apps/portal/registry/research-execution-recipes.v1.json',import.meta.url)));
 const schema=lane==='native'?'research.native-route-profile.v1':'research.expanded-trial-profile.v1';
 const nativeHash=createHash('sha256').update(readFileSync(new URL('../../apps/portal/backend/src/portal_api/adapters/research_native_routes.py',import.meta.url))).digest('hex');
 const rows=table.recipes.filter(r=>r.descriptor.schema_version===schema
  &&(lane!=='native'||r.descriptor.native_input.adapter_sha256===nativeHash)
  &&(lane==='expanded-indexed'?r.public_profile.timeframe!=='1h':r.public_profile.timeframe==='1h'));
 assert.equal(rows.length,lane==='native'?3:lane==='expanded-indexed'?126:27,'EXACT_EXPECTED_MATRIX_SIZE');
 const symbols=lane==='expanded-indexed'?['BTCUSDT']:['BTCUSDT','ETHUSDT','SOLUSDT'];
 // Read each large response receipt once, retain only bounded scalar metadata.
 // Repeated scans of all bar/chart payloads made a serial matrix quadratic IO.
 const records=readdirSync(home).filter(f=>/^qualification-.*\.json$/.test(f))
  .map(file=>receiptMetadata(privateJson(join(home,file))));
 for(const row of rows)for(const symbol of symbols){
  const prior=records.filter(r=>r.profile_id===row.profile_id&&r.profile_digest===row.profile_digest&&r.symbol===symbol);
  const workerImage=lane==='native'?privateJson(join(home,'identity.json')).images['quant-worker-py'].image_id:null;
  // Fixed/native RSS used a cumulative-parent delta on the previous worker.
  // Reuse native proof only on the current exact worker; never repair a seal.
  if(prior.some(r=>r.passed&&(lane!=='native'||r.worker_image===workerImage))){
   console.log(JSON.stringify({reused:true,profile_id:row.profile_id,symbol}));continue;
  }
  // Preserve failed attempts. The receipt helper resumes a completed same-image
  // run when only a named read failed; no blind retry of intake POSTs.
  const attempt=prior.length+1;assert(attempt<=(lane==='native'?16:5),'BOUNDED_MATRIX_ATTEMPTS');
  const record=lane==='native'?await nativeReceipt(home,row.profile_id,symbol,attempt)
   :await full03Receipt(home,row.profile_id,attempt,'expanded',{symbol});
  records.push(receiptMetadata(record));
 }
 if(lane==='expanded-1h')for(const [id,trials]of [
  ['p10.delta-causal-inner-1h.v2',400],
  ['p10.imported-wfo-temporal-1h.v2',100],
  ['p10.delta-mode5-global-1h.v2',100],
  ['p10.delta-mode3-global-1h.v2',400],
 ]){
  const row=rows.find(r=>r.profile_id===id);assert(row,'EXACT_HIGH_TRIAL_REPRESENTATIVE_RECIPE');
  const prior=records.filter(r=>r.profile_id===id&&r.profile_digest===row.profile_digest
     &&r.symbol==='BTCUSDT'&&r.trials===trials);
  if(prior.some(r=>r.passed)){console.log(JSON.stringify({reused:true,profile_id:id,symbol:'BTCUSDT',trials}));continue;}
  assert(prior.length<5,'BOUNDED_HIGH_TRIAL_ATTEMPTS');
  records.push(receiptMetadata(await full03Receipt(home,id,prior.length+1,'expanded',{symbol:'BTCUSDT',trials})));
 }
 console.log(JSON.stringify({matrix:lane,passed:true,recipes:rows.length,symbols:symbols.length}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))runMatrix(
 process.argv.find(a=>a.startsWith('--home='))?.slice(7),
 process.argv.find(a=>a.startsWith('--lane='))?.slice(7)??'native')
 .catch(e=>{console.error('Product matrix stopped:',e.message);process.exitCode=1;});
