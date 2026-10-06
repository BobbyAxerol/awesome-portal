#!/usr/bin/env node
/** Extract only named public DTOs; no session/source bytes or private inputs. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {validateHome} from './cell.mjs';
import {privateJson,operatorClient,savePrivate} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));assert(home.endsWith('/full05'));
const attempt=Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1);
assert(Number.isSafeInteger(attempt)&&attempt>=1&&attempt<=8,'BOUNDED_RECEIPT_ATTEMPT');
const receiptPath=join(home,`public-wire-fixture-receipt${attempt===1?'':'-attempt'+attempt}.json`);
assert(!existsSync(receiptPath),'IMMUTABLE_PUBLIC_FIXTURE_RECEIPT');
const summary=privateJson(join(home,'qualified-products-summary.json'));
const fact=summary.facts.find(f=>f.profile_id==='p10.imported-wfo-temporal-1h.v1');assert(fact);
const client=await operatorClient(home),registration=privateJson(join(home,'imported-registration.json')).registration;
const query=new URLSearchParams({alpha_id:registration.alpha_id,alpha_version_id:registration.alpha_version_id,dataset_id:'crypto-binance-1m',symbol:'BTCUSDT',timeframe:'1h'});
const setup=(await client.call('GET','/api/v1/research/runs/setup-options?'+query)).body;
const freeze=(await client.call('GET',`/api/v1/quantbt/runs/${fact.run_id}/current-source/freeze`)).body;
const profile=setup.profiles.find(r=>r.profile_id===fact.profile_id);assert.equal(profile?.state,'ENABLED');
assert.equal(profile.parameter_policy,'DECLARED_SEARCH_WITH_PINS');
assert.equal(freeze.parameter_authority.code_fixed.hash_scope,'SOURCE_CODE_SHA256');
const wire={scope:'SANITIZED_PUBLIC_CONTRACT_FIXTURE_NOT_ACTIVATION_PROOF',run_id:fact.run_id,
  source_digest:summary.source_digest,profile,provenance:freeze.provenance,parameter_authority:freeze.parameter_authority};
const bytes=JSON.stringify(wire,null,2)+'\n';
const calibrationFact=summary.facts.find(f=>f.profile_id==='p10.imported-mode5-global-1d.v1');assert(calibrationFact);
const spec=privateJson(join(home,calibrationFact.private_receipt)).run.requested_spec;
const calibration=(await client.call('POST','/api/v1/research/datasets/declaration-estimates',{requested_spec:spec})).body;
assert.equal(calibration.ready_for_preflight,true);assert.equal(calibration.metadata.planned_folds.evaluation_scope,'FULL_SAMPLE_CALIBRATION');
const calibrationBytes=JSON.stringify(calibration,null,2)+'\n';
savePrivate(receiptPath,{passed:true,named_reads:3,fixture_sha256:createHash('sha256').update(bytes).digest('hex'),
  calibration_fixture_sha256:createHash('sha256').update(calibrationBytes).digest('hex')});
writeFileSync(new URL('../../packages/contracts/fixtures/research-full05-imported-public.valid.json',import.meta.url),bytes);
writeFileSync(new URL('../../packages/contracts/fixtures/research-declaration-estimate.v1.full-sample.valid.json',import.meta.url),calibrationBytes);
console.log('FULL05 generated bounded actual public profile/provenance/parameter-authority fixture.');
