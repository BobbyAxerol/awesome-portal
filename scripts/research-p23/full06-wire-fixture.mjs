#!/usr/bin/env node
/** Extract named public facts only; credentials and private artifacts stay private. */
import assert from 'node:assert/strict';
import {existsSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {privateJson,operatorClient,savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full06'),'EXACT_PERCENT_EQUITY_HOME');
const receipt=join(home,'public-wire-fixture-receipt.json');assert(!existsSync(receipt),'IMMUTABLE_FIXTURE_RECEIPT');
const fact=privateJson(join(home,'qualified-products-summary.json')).facts
  .find(f=>f.profile_id==='p10.delta-pct-equity-wfo-temporal-1h.v1');assert(fact);
const client=await operatorClient(home);
const context=new URLSearchParams({alpha_id:'delta-rsi-polynomial-alpha',
  alpha_version_id:'av_delta_rsi_polynomial_alpha_1_0_2',dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe:'1h'});
const setup=(await client.call('GET','/api/v1/research/runs/setup-options?'+context)).body;
const freeze=(await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/freeze`)).body;
const profile=setup.profiles.find(p=>p.profile_id===fact.profile_id);
assert.equal(profile.state,'ENABLED');assert.equal(profile.execution_route,'pct_equity');
const wire={scope:'SANITIZED_PUBLIC_CONTRACT_FIXTURE_NOT_ACTIVATION_PROOF',run_id:fact.run_id,
  profile,provenance:freeze.provenance,stage4_binding:freeze.stage4_binding};
const bytes=JSON.stringify(wire,null,2)+'\n';
writeFileSync(new URL('../../packages/contracts/fixtures/research-full06-percent-equity-public.valid.json',import.meta.url),bytes);
savePrivate(receipt,{passed:true,fixture_sha256:createHash('sha256').update(bytes).digest('hex'),named_reads:2});
console.log('FULL06 published actual public profile/account/provenance fixture; no raw inputs or credential fields.');
