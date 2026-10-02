#!/usr/bin/env node
/** One private raw-IS proof through the owned product producer, never shared preview. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, privateJson, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { admitRealRun, requestedSpec, waitForRun } from './real-run.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';
import { verifyIsQualification } from './is-qualification-oracle.mjs';

const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const WINDOW_PRESETS = Object.freeze({
  weekly: { label:'b8-is-oracle-20261002', is_rows:168, boundaries:[
    '2026-06-01T00:00', '2026-06-08T00:00', '2026-06-15T00:00', '2026-06-17T00:00'] },
  monthly: { label:'b8-is-monthly-20261002', is_rows:720, boundaries:[
    '2026-06-01T00:00', '2026-07-01T00:00', '2026-08-01T00:00', '2026-09-01T00:00'] },
});
export function qualificationWindowPreset(name = 'weekly') {
  assert(Object.hasOwn(WINDOW_PRESETS,name), 'NAMED_IS_WINDOW_PRESET_REQUIRED');
  return structuredClone(WINDOW_PRESETS[name]);
}
function presetWindows(name) {
  const { boundaries } = qualificationWindowPreset(name);
  return Object.fromEntries(['is','oos','holdout'].map((kind,index) =>
    [kind,{start:boundaries[index],end_exclusive:boundaries[index+1]}]));
}
export function fixedQualificationRequestedSpec(binding, release, profile, windowPreset = 'weekly') {
  assert.equal(profile,'p04','FIXED_IS_QUALIFICATION_PROFILE_REQUIRED');
  qualificationWindowPreset(windowPreset);
  const spec = requestedSpec(binding,release,profile);
  return windowPreset === 'weekly' ? spec : { ...spec, windows:presetWindows(windowPreset) };
}
export function assertQualificationPreset(spec, windowPreset = 'weekly') {
  assert.deepEqual(fixedQualificationWindows(spec), fixedQualificationWindows({
    protocol:'three_window_decay',windows:presetWindows(windowPreset) }), 'ADMITTED_IS_WINDOW_PRESET_MISMATCH');
}
export function assertQualificationFacts(source, enrichment, windowPreset = 'weekly') {
  assert.equal(source.row_count,qualificationWindowPreset(windowPreset).is_rows,'EXACT_DECLARED_FIXED_IS_POPULATION');
  if(windowPreset === 'monthly') {
    assert.equal(enrichment?.by_window?.is?.facts?.metrics?.sharpe?.state,'AVAILABLE','MONTHLY_REAL_IS_SHARPE_MUST_BE_AVAILABLE');
    const distribution = enrichment?.by_window?.is?.return_distribution;
    assert.equal(distribution?.state,'AVAILABLE','MONTHLY_REAL_IS_HISTOGRAM_MUST_BE_AVAILABLE');
    assert(Number.isSafeInteger(distribution.observation_count) && distribution.observation_count >= 2,
      'MONTHLY_REAL_IS_DAILY_SAMPLE_MUST_BE_AT_LEAST_TWO');
  }
}
const RETRIEVE = String.raw`
import base64,json,os,stat,sys
from pathlib import Path
run,attempt,epoch=sys.argv[1:]
for value in (run,attempt):
    assert value and len(value)<=96 and all(c.isalnum() or c in '_-' for c in value)
assert epoch.isdigit() and int(epoch)>0
root=Path(os.environ['PORTAL_ARTIFACT_ROOT'])
path=root/'durable-store'/'research-is-qualification'/run/attempt/epoch
for p in (path,path/'qualification-metadata.json',path/'is-qualification.ndjson'):
    assert not p.is_symlink() and p.exists()
assert path.is_dir() and (path.stat().st_mode&0o077)==0
def read(name,cap):
    p=path/name; st=p.stat()
    assert stat.S_ISREG(st.st_mode) and (st.st_mode&0o077)==0 and 0<st.st_size<=cap
    with p.open('rb') as f:
        raw=f.read(cap+1)
    assert len(raw)==st.st_size
    return raw
meta=json.loads(read('qualification-metadata.json',8192))
raw=read('is-qualification.ndjson',2*1024*1024)
scratch=Path(os.getenv('PORTAL_RESEARCH_P10_SCRATCH_ROOT',str(root/'p10-scratch')))
market=Path(os.getenv('PORTAL_RESEARCH_P10_MARKET_ROOT',str(root/'p10-market')))
print(json.dumps({'custody':meta,'witness_base64':base64.b64encode(raw).decode(),
    'source_scratch_retired':not(scratch/meta['binding']['job_id']/attempt).exists(),
    'source_market_retired':not(market/meta['binding']['job_id']/attempt).exists()}))
`;

export function fixedQualificationWindows(spec) {
  assert.equal(spec.protocol, 'three_window_decay');
  return Object.fromEntries(['is','oos','holdout'].map(kind => {
    const window = spec.windows[kind];
    const utc = raw => {
      assert(typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z)?$/.test(raw));
      const value = Date.parse(raw.endsWith('Z') ? raw : `${raw}Z`);
      assert(Number.isSafeInteger(value)); return value;
    };
    return [kind, { start_ms:utc(window.start), end_ms:utc(window.end_exclusive),
      source_locator:`P10.immutable_requested_spec.windows.${kind}` }];
  }));
}

export async function isQualificationReceipt(home = DEFAULT_HOME, label, windowPreset = 'weekly') {
  const preset = qualificationWindowPreset(windowPreset);
  label ??= preset.label;
  home = validateHome(home);
  assert(/^[a-z][a-z0-9-]{0,48}$/.test(label));
  const saved = loadSessions(home).identities.find(row => row.username === 'p23-owner');
  assert(saved?.id && saved.password, 'EXISTING_OWNER_ANCHOR_REQUIRED');
  const client = makeClient({ ...saved, cookies:{} });
  const receipt = { schema_version:'research.is-owned-product-qualification.v1', project:PROJECT, base_url:BASE_URL,
    workspace_id:WORKSPACE, at_utc:new Date().toISOString(), label, window_preset:windowPreset, passed:false,
    images:Object.fromEntries(['control-api','portal-api','quant-worker-py'].map(service =>
      [service,docker(['inspect','--format','{{.Image}}',container(service)]).trim()])) };
  let authenticated = false;
  try {
    await client.call('POST','/api/auth/login',{username:saved.username,credential:saved.password},[201]); authenticated=true;
    const context=(await client.call('GET','/api/auth/context')).body;
    assert.equal(context.principal.principalId,saved.id); assert.equal(context.state,'AUTHENTICATED');
    const admitted=await admitRealRun(home,'p04',label,'p23-owner',client,
      (binding,release,profile)=>fixedQualificationRequestedSpec(binding,release,profile,windowPreset));
    assertQualificationPreset(admitted.receipt.requested_spec,windowPreset);
    const run=await waitForRun(client,admitted.path,admitted.receipt);
    receipt.run_id=run.run_id; receipt.producer_receipt=admitted.path;
    assert.equal(run.final.body.current.effective_status,'COMPLETED');
    assert.equal(run.final.body.current.terminal_materialization,'READY');
    const rows=dbQuery(`SELECT workspace_id,run_id,job_id,worker_attempt_id,lease_epoch,
      requested_spec_digest,effective_spec_digest,dataset_binding_digest FROM research.run_producers
      WHERE workspace_id=$1 AND run_id=$2`,[WORKSPACE,run.run_id]).rows;
    assert.equal(rows.length,1); const producer=rows[0]; receipt.producer=producer;
    const extracted=JSON.parse(docker(['exec',container('quant-worker-py'),'python','-c',RETRIEVE,
      run.run_id,producer.worker_attempt_id,String(producer.lease_epoch)]));
    const custody=extracted.custody;
    assert.equal(custody.workspace_id,WORKSPACE);
    for(const key of ['requested_spec_digest','effective_spec_digest','dataset_binding_digest']) assert.equal(custody[key],producer[key]);
    assert(extracted.source_scratch_retired && extracted.source_market_retired, 'SOURCE_SCRATCH_AND_MARKET_MUST_BE_RETIRED');
    const read=suffix=>client.call('GET',`/api/v1/quantbt/runs/${run.run_id}/${suffix}?workspace_id=${WORKSPACE}`);
    receipt.responses={hub:await read('evidence'),report:await read('report')};
    assert.equal(custody.enrichment_input_digest,receipt.responses.hub.body.enriched_analysis.input_digest,
      'CAPTURED_TO_SERVED_ENRICHMENT_ANCESTRY_REQUIRED');
    const witnessBytes=Buffer.from(extracted.witness_base64,'base64');
    savePrivate(join(home,`${label}-raw-private.json`),extracted);
    receipt.private_custody=custody; receipt.source_scratch_retired=true; receipt.source_market_retired=true;
    let oosBaseline;
    if(windowPreset === 'weekly') {
      const previous=privateJson(join(home,'b8-fresh-source-receipt.json')).runs.find(row=>row.profile==='p04');
      assert(previous?.responses.hub.body.enriched_analysis, 'EXISTING_REAL_FIXED_OOS_BASELINE_REQUIRED');
      oosBaseline=previous.responses.hub.body.enriched_analysis;
    }
    receipt.oracle=verifyIsQualification({witnessBytes,metadata:custody.source,
      expectedBinding:{run_id:run.run_id,job_id:producer.job_id,worker_attempt_id:producer.worker_attempt_id,lease_epoch:Number(producer.lease_epoch)},
      expectedWindows:fixedQualificationWindows(admitted.receipt.requested_spec),
      expectedSymbols:['DEFAULT'],expectedPositionColumns:['Position_DEFAULT'],
      expectedBenchmarkLocator:custody.benchmark_locator,hub:receipt.responses.hub,report:receipt.responses.report,
      ...(oosBaseline ? {oosBaseline} : {})});
    assert.equal(receipt.oracle.passed,true,'FULL_RAW_IS_NUMERICAL_ORACLE_REQUIRED');
    assertQualificationFacts(custody.source,receipt.responses.hub.body.enriched_analysis,windowPreset);
    receipt.passed=true; return receipt;
  } finally {
    if(authenticated) await client.call('POST','/api/auth/logout',{},[200,201]);
    receipt.owner_session_revoked=authenticated; receipt.finished_at_utc=new Date().toISOString();
    savePrivate(join(home,`${label}.json`),receipt);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const home=process.argv.find(arg=>arg.startsWith('--home='))?.slice(7)??DEFAULT_HOME;
  const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8);
  const windowPreset=process.argv.find(arg=>arg.startsWith('--window-preset='))?.slice(16)??'weekly';
  isQualificationReceipt(home,label,windowPreset).then(receipt=>console.log(`IS product oracle PASS ${receipt.run_id} ${createHash('sha256').update(JSON.stringify(receipt)).digest('hex')}`))
    .catch(error=>{console.error('IS product oracle refused:',error.message);process.exitCode=1;});
}
