#!/usr/bin/env node
/** Real authenticated P10 -> isolated child -> P05/RS02 -> public BFF proof. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admitRealRun, waitForRun } from './real-run.mjs';
import { DEFAULT_HOME, privateJson, savePrivate } from './api-client.mjs';
import { validateHome, PROJECT } from './cell.mjs';
import { dbQuery } from './runtime-tools.mjs';

export async function temporalProductReceipt(home=DEFAULT_HOME, label='temporal-product') {
  home=validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,40}$/.test(label));
  const path=join(home,`${label}.json`);
  assert(!existsSync(path),'INSPECT_EXISTING_RECEIPT_DO_NOT_REPEAT');
  const identity=privateJson(join(home,'identity.json'));
  assert(identity.project===PROJECT && identity.dirty===false,'CLEAN_OWNED_CANDIDATE_REQUIRED');
  const runs=[];
  for(const profile of ['wfo-v2','p04']) {
    const admitted=await admitRealRun(home,profile,`${label}-${profile}`);
    const run=await waitForRun(admitted.client,admitted.path,admitted.receipt);
    assert(run.final.body.current.effective_status==='COMPLETED','REAL_PRODUCT_RUN_DID_NOT_COMPLETE');
    const reads={};
    const routes=profile==='wfo-v2'
      ? ['evidence','current-source/evidence','current-source/split','current-source/search','current-source/freeze','current-source/replay','report']
      : ['evidence','report'];
    for(const route of routes) reads[route]=await admitted.client.call('GET',`/api/v1/quantbt/runs/${run.run_id}/${route}`);
    reads.lineage=await admitted.client.call('GET',`/api/v1/research/alphas/${run.binding.body.alpha_id}/lineage`);
    const exposures=dbQuery(`SELECT exposure_id,snapshot_digest,evaluation_role,source_fact_ref,
      floor(extract(epoch FROM source_as_of)*1000)::bigint AS source_as_of_utc_ms
      FROM research.exposure_facts WHERE run_id=$1 ORDER BY exposure_id`,[run.run_id]).rows;
    const producer=dbQuery(`SELECT snapshot_content_hash,execution_profile_id,execution_profile_digest
      FROM research.run_producers WHERE run_id=$1`,[run.run_id]).rows[0];
    if(profile==='wfo-v2') {
      assert.equal(producer.execution_profile_id,'p10.delta-signal-notional-wfo.v2');
      assert.equal(exposures.length,1,'NEW_COMPLETED_WFO_REQUIRES_ONE_EXPOSURE');
      assert.equal(exposures[0].snapshot_digest,producer.snapshot_content_hash);
      assert.equal(exposures[0].evaluation_role,'SELECTION_INPUT');
      assert(exposures[0].source_fact_ref.endsWith(':PORTAL_ADAPTER_ENGINE_CALL_COMPLETED'));
    }
    runs.push({profile,run_id:run.run_id,requested_spec:run.requested_spec,preflight:run.preflight,created:run.created,
      final:run.final,reads,exposures,producer});
  }
  const receipt={schema_version:'research.temporal-product-receipt.v1',project:PROJECT,identity,runs,
    scope:'REAL_PUBLIC_ADMISSION_CHILD_RETENTION_BFF_ONLY_NOT_WHOLE_P23_OR_BROWSER_ACCEPTANCE',
    passed:true,completed_at_utc:new Date().toISOString()};
  savePrivate(path,receipt);
  console.log(JSON.stringify({passed:true,runs:runs.map(({profile,run_id,exposures})=>({profile,run_id,exposures:exposures.length}))}));
  return receipt;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  temporalProductReceipt(process.argv.find(arg=>arg.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)??'temporal-product')
    .catch(error=>{console.error('Temporal product receipt refused:',error.message);process.exitCode=1;});
}
