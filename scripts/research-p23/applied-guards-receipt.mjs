#!/usr/bin/env node
/** BR-F3-02 + W5: read-only retained/native oracle and named BFF proof, owned :8096 only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOME, loadSessions, makeClient, savePrivate } from './api-client.mjs';
import { BASE_URL, PROJECT, validateHome } from './cell.mjs';
import { container, dbQuery, docker } from './runtime-tools.mjs';
const WORKSPACE = 'ws_06GE6XY0SKNPFS7TP8WCE938Z5';
const RUNS = {
  nonzero: 'rrun_6b076ba549a4f8ffef4307afcc2cfeab',
  nonzeroTwoFolds: 'rrun_78d9ef519a64da31aa2fe086cd21b6f7',
  global: 'rrun_49142d25954abd176d3c2bd0f44b51e2',
  causal: 'rrun_becde1e160a2770d49246f7f665208ce',
};
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const PYTHON = String.raw`
import hashlib,inspect,json,pathlib,sys,types,importlib.metadata
import pandas as pd
import pyarrow.parquet as pq
from quantbt.walkforward import _build_fold_v2
source=json.loads(sys.stdin.read())
assert importlib.metadata.version('quantbt-engine')=='1.1.1'
artifact=source['artifact_id'];run=source['run_id']
assert artifact.startswith('rart_') and artifact.replace('_','').isalnum()
root=pathlib.Path('/var/lib/portal/artifacts/runs/durable-store/research-retained/artifacts')/artifact
blob=(root/'manifest.json').read_bytes();m=json.loads(blob)
assert m['run_id']==run and m['artifact_id']==artifact
tables={};parts=[]
for table in m['tables']:
 rows=[]
 for part in table['parts']:
  relative=pathlib.PurePosixPath(part['relative_path'])
  assert not relative.is_absolute() and '..' not in relative.parts
  b=(root/relative).read_bytes()
  assert len(b)==part['bytes'] and hashlib.sha256(b).hexdigest()==part['sha256']
  assert pq.read_metadata(root/relative).num_rows==part['rows']
  parts.append({'table':table['table_kind'],'sha256':part['sha256'],'rows':part['rows']})
  if table['table_kind'] in ('folds','observations'): rows.extend(pq.read_table(root/relative).to_pylist())
 if rows: assert len(rows)==table['rows']
 tables[table['table_kind']]=rows
doc=next(d for d in m['documents'] if d['name']=='current_source_summary')
relative=pathlib.PurePosixPath(doc['relative_path']);assert not relative.is_absolute() and '..' not in relative.parts
summary_bytes=(root/relative).read_bytes()
assert len(summary_bytes)==doc['bytes'] and hashlib.sha256(summary_bytes).hexdigest()==doc['sha256']
summary=json.loads(summary_bytes);config=summary['source_facts']['temporal_guards']
observations=sorted(tables['observations'],key=lambda row:row['source_ordinal'])
assert 0<len(observations)<=100000 and [r['source_ordinal'] for r in observations]==list(range(len(observations)))
index=pd.to_datetime([r['at_utc_ms'] for r in observations],unit='ms',utc=True)
assert index.is_unique and index.is_monotonic_increasing
position={int(t.value//1000000):i for i,t in enumerate(index)}
def window(idx):
 return {'bars':len(idx),'start_utc_ms':int(idx[0].value//1000000) if len(idx) else None,'end_utc_ms':int(idx[-1].value//1000000) if len(idx) else None}
checks=[]
for row in sorted(tables['folds'],key=lambda r:r['source_ordinal']):
 facts=json.loads(row['payload_json'])['fold_facts'];guards=facts['guards']
 start=position[row['train_start_utc_ms']];test_start=position[row['test_start_utc_ms']];test_stop=position[row['test_end_utc_ms']]+1
 native=_build_fold_v2(index,fold_id=int(row['fold_id']),raw_train_start=start,test_start=test_start,test_stop=test_stop,
  config=types.SimpleNamespace(purge_bars=config['purge_bars'],embargo_bars=config['embargo_bars'],label_horizon_bars=config['label_horizon_bars'],
   warmup_policy='none',warmup_bars=0,fold_account_policy=guards['account_policy']))
 assert native is not None
 assert window(native.train_index)=={'bars':facts['train_bars'],'start_utc_ms':row['train_start_utc_ms'],'end_utc_ms':row['train_end_utc_ms']}
 assert window(native.test_index)=={'bars':facts['test_bars'],'start_utc_ms':row['test_start_utc_ms'],'end_utc_ms':row['test_end_utc_ms']}
 for name in ('purge','embargo','label_horizon'): assert guards[name]==window(getattr(native,name+'_index'))
 # Actual native indexes, not an independent reimplementation of the TS verdict helper.
 assert native.train_index.intersection(native.purge_index).empty and native.test_index.intersection(native.purge_index).empty
 assert native.test_index.intersection(native.embargo_index).empty
 checks.append({'fold_id':row['fold_id'],'purge':window(native.purge_index)['bars'],'embargo':window(native.embargo_index)['bars'],
  'clipping':'DATASET_TAIL' if len(native.embargo_index)<config['embargo_bars'] else 'NONE'})
print(json.dumps({'manifest_sha256':hashlib.sha256(blob).hexdigest(),'summary_sha256':doc['sha256'],
 'wheel_version':'1.1.1','native_fold_builder_sha256':hashlib.sha256(inspect.getsource(_build_fold_v2).encode()).hexdigest(),
 'observation_count':len(observations),'config':{k:config[k] for k in ('purge_bars','embargo_bars','label_horizon_bars')},
 'parts':parts,'checks':checks}))
`;
function custody() {
  return dbQuery(`SELECT 'report' kind,run_id,report_revision identity,frozen_core_digest digest FROM research.run_report_manifests_v1
    WHERE workspace_id=$1 UNION ALL SELECT 'rc',run_id,release_candidate_id,pack_digest FROM research.release_candidate_packs_v1
    WHERE workspace_id=$1 UNION ALL SELECT 'retained',run_id,artifact_revision::text,retained_import_digest FROM research.current_source_seals_v1
    WHERE workspace_id=$1 ORDER BY kind,run_id,identity`,[WORKSPACE]).rows;
}
export async function appliedGuardsReceipt(home=DEFAULT_HOME,label='br-f3-02-w5-final-20261003') {
  home=validateHome(home);assert(/^[a-z0-9-]{1,64}$/.test(label));
  const path=join(home,`${label}.json`);assert(!existsSync(path),'IMMUTABLE_RECEIPT_ALREADY_EXISTS');
  assert.equal(docker(['ps','-q','--filter',`label=com.docker.compose.project=${PROJECT}`,'--filter','label=com.docker.compose.service=quant-worker-py']).trim(),'','WORKER_MUST_STAY_OFF');
  const owner=loadSessions(home).identities.find(user=>user.username==='p23-owner');
  const client=makeClient({...owner,cookies:{}}),q=`workspace_id=${WORKSPACE}`;
  const receipt={schema_version:'research.applied-guards-w5-owned-proof.v1',project:PROJECT,base_url:BASE_URL,
    at_utc:new Date().toISOString(),passed:false,reads:{},oracles:{},custody_before:sha(custody()),custody_after:null,
    source_head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    control_image:docker(['inspect','--format','{{.Image}}',container('control-api')]).trim(),
    python_image:docker(['inspect','--format','{{.Image}}',container('portal-api')]).trim(),
    module_sha256:Object.fromEntries(['applied-temporal-guards.ts','current-source.repository.ts','current-source.service.ts','progress.contract.ts','release-candidate.service.ts']
      .map(file=>[file,sha(readFileSync(new URL(`../../apps/control-api/src/research/${file}`,import.meta.url),'utf8'))])),session_revoked:false};
  let authenticated=false;
  const get=async(key,url,statuses)=>{const r=await client.call('GET',url,undefined,statuses);receipt.reads[key]=r;savePrivate(path,receipt);return r.body;};
  try {
    await client.call('POST','/api/auth/login',{username:owner.username,credential:owner.password},[201]);authenticated=true;
    for(const [kind,id] of Object.entries(RUNS)) {
      const row=dbQuery(`SELECT a.artifact_id,s.manifest_digest,s.table_rows FROM research.current_source_seals_v1 s
        JOIN research.artifacts a USING(workspace_id,run_id,artifact_revision) WHERE s.workspace_id=$1 AND s.run_id=$2`,[WORKSPACE,id]).rows[0];
      assert(row);
      const oracle=JSON.parse(docker(['exec','-i',container('portal-api'),'python','-c',PYTHON],JSON.stringify({run_id:id,artifact_id:row.artifact_id})));
      assert.equal(oracle.manifest_sha256,row.manifest_digest);assert.equal(oracle.observation_count,row.table_rows.OBSERVATION);
      receipt.oracles[kind]={run_id:id,artifact_id:row.artifact_id,...oracle};
      const split=await get(`${kind}_split`,`/api/v1/quantbt/runs/${id}/current-source/split?${q}`);
      for(const [guard,name] of [['purge_applied','purge'],['embargo_respected','embargo']]) {
        assert.equal(split.guards[guard].verdict,'PASS');assert.equal(split.guards[guard].folds.length,oracle.checks.length);
        for(const fold of split.guards[guard].folds) {
          const expected=oracle.checks.find(row=>row.fold_id===fold.fold_id);assert(expected);
          assert.equal(fold.observed_bars,expected[name]);assert.equal(fold.configured_bars,oracle.config[`${name}_bars`]);
          assert.equal(fold.clipping,name==='embargo'?expected.clipping:'NONE');assert.equal(fold.reason_code,null);
        }
      }
      const repeated=await get(`${kind}_repeat`,`/api/v1/quantbt/runs/${id}/current-source/split?${q}`);
      assert.equal(repeated.etag,split.etag);assert.equal(repeated.revision,split.revision);
      const conditional=await fetch(new URL(`/api/v1/quantbt/runs/${id}/current-source/split?${q}`,BASE_URL),{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{
        origin:BASE_URL,accept:'application/json','x-dev-access-email':`${owner.username}@azdag.com`,
        cookie:[...client.jar].map(([key,value])=>`${key}=${value}`).join('; '),'if-none-match':split.etag}});
      assert.equal(conditional.status,304);assert.equal(await conditional.text(),'');receipt.reads[`${kind}_conditional`]={status:304};
      if(kind==='global'||kind==='causal') {
        const p=await get(`${kind}_progress`,`/api/v1/research/runs/${id}/progress?${q}`);
        const cursor=p.progress.claim.handoff_cursor;assert(cursor);
        const s=await get(`${kind}_search`,`/api/v1/quantbt/runs/${id}/current-source/search?${q}&limit=1`);
        const f=await get(`${kind}_freeze`,`/api/v1/quantbt/runs/${id}/current-source/freeze?${q}`);
        const rc=await get(`${kind}_rc`,`/api/v1/quantbt/runs/${id}/release-candidate?${q}`);
        const expectedScope=kind==='causal'?'STUDY_LOCAL':'RUN_GLOBAL';
        assert.equal(cursor.trial,s.selection.selected_trial_ordinal);assert.equal(cursor.trial_scope,expectedScope);
        assert.equal(cursor.params_digest,p.progress.folds.find(fold=>fold.fold===cursor.fold).selection.params_digest);
        assert.equal(f.frozen_selection.selected_trial_ordinal,cursor.trial);
        assert.equal(rc.selected_params.selected_trial_number,cursor.trial);
        assert.equal(rc.selected_params.selected_trial_number_scope,expectedScope);
        assert.equal(rc.selected_params.selected_trial_source_id,s.selection.selected_trial_id);
        if(kind==='causal') {assert.equal(cursor.study_id,rc.selected_params.selected_trial_study_id);assert.notEqual(cursor.trial,cursor.progress_trial_ordinal);}
      }
    }
    assert(receipt.oracles.nonzero.checks.some(row=>row.clipping==='DATASET_TAIL'),'REAL_TAIL_CLIPPING_REQUIRED');
    await get('foreign_workspace',`/api/v1/quantbt/runs/${RUNS.nonzero}/current-source/split?workspace_id=ws_guard_foreign`,[404]);
    await makeClient({username:'p23-owner',cookies:{}}).call('GET',`/api/v1/quantbt/runs/${RUNS.nonzero}/current-source/split?${q}`,undefined,[401]);
    receipt.reads.anonymous={status:401};
    receipt.custody_after=sha(custody());assert.equal(receipt.custody_after,receipt.custody_before);
    receipt.passed=true;
  } catch(error) {receipt.failure=error.message;throw error;}
  finally {if(authenticated){await client.call('POST','/api/auth/logout',{},[200,201]);receipt.session_revoked=true;}
    receipt.finished_at_utc=new Date().toISOString();savePrivate(path,receipt);}
  return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  appliedGuardsReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7)??DEFAULT_HOME,
    process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'br-f3-02-w5-final-20261003')
    .then(r=>console.log(`Applied guards + W5 named proof PASS; ${Object.keys(r.reads).length} controls; receipt sha256:${sha(JSON.stringify(r,null,2)+'\n')}`))
    .catch(e=>{console.error('Applied guards/W5 proof refused:',e.message);process.exitCode=1;});
}
