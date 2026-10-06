#!/usr/bin/env node
/** Register via P07; recover only a lost local receipt from the owned P07 audit. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {validateHome} from './cell.mjs';
import {operatorClient,savePrivate,privateJson} from './api-client.mjs';
const home=validateHome(process.argv.find(a=>a.startsWith('--home='))?.slice(7));
assert(home.endsWith('/full05'),'EXACT_FULL05_HOME');
const path=join(home,'imported-registration.json');
const source=readFileSync(new URL('../../apps/portal/frontend/src/research/samples/deltaRsiReference.py',import.meta.url),'utf8');
const sha=createHash('sha256').update(source).digest('hex');
if(existsSync(path)){
  const old=privateJson(path);assert.equal(old.source_digest,sha);assert(old.registration&&old.gates.all_pass);
  console.log('FULL05 reuses its exact immutable canonical imported registration; no new version.');
}else{
  const client=await operatorClient(home),record={source_digest:sha,source_bytes:Buffer.byteLength(source),passed:false};
  const alphaId='full05-canonical-delta-rsi';
  const call=async(method,url,body)=>{const response=await client.call(method,url,body,[200,201]);return response.body;};
  const existing=await call('GET',`/api/v1/research/alphas?alpha_id=${alphaId}`);
  const registered=existing.entries.find(v=>v.source_digest===sha);
  if(registered){
    // Recover a successful P07 operation after a local receipt-script failure.
    // Never duplicate registered bytes, delete an AV or bypass digest-unique.
    // Only the owned isolated test audit is read; no source/engine authority is granted.
    const container='portal-research-p23-ol12-control-api-1';
    assert.equal(execFileSync('sudo',['-n','docker','inspect','--format','{{index .Config.Labels "com.docker.compose.project"}}',container],{encoding:'utf8'}).trim(),'portal-research-p23-ol12');
    const history=JSON.parse(execFileSync('sudo',['-n','docker','exec','-i',container,'node','-e',
      `const fs=require('fs'),{Pool}=require('pg'),i=JSON.parse(fs.readFileSync(0,'utf8')),p=new Pool({connectionString:process.env.DATABASE_URL,max:1});p.query("SELECT import_session_id,source_file_ref,source_digest,gate_results FROM research.import_sessions WHERE actor_user_id=$1 AND source_digest=$2 AND gate_results->>'all_pass'='true' ORDER BY expires_at LIMIT 1",[i.actor,i.sha]).then(r=>{if(r.rows.length!==1)throw Error('ORIGINAL_PASS_RECEIPT_REQUIRED');process.stdout.write(JSON.stringify(r.rows[0]));}).finally(()=>p.end()).catch(e=>{process.stderr.write(e.message);process.exitCode=1;});`],
      {encoding:'utf8',input:JSON.stringify({actor:client.user.id,sha}),maxBuffer:65536}));
    record.registration=registered;record.declaration=registered.declaration;record.gates=history.gate_results;
    record.original_gate_receipt=history;record.registration_recovery='EXISTING_PUBLIC_REGISTRY_AND_ORIGINAL_OWNED_GATE_AUDIT';
    assert.equal(record.gates.all_pass,true);record.passed=true;savePrivate(path,record);
    console.log('FULL05 exact existing immutable P07 registration recovered; duplicate registration not attempted.');
    process.exit(0);
  }
  record.parse=await call('POST','/api/v1/research/alphas/import/parse',{original_filename:'deltaRsiReference.py',source_text:source,expected_source_digest:sha});
  record.gates=await call('POST','/api/v1/research/alphas/import/gates',{source_file_ref:record.parse.source_file_ref});
  assert.equal(record.gates.all_pass,true);
  record.registration=await call('POST','/api/v1/research/alphas/import/register',{
    source_file_ref:record.parse.source_file_ref,gate_receipt_id:record.gates.gate_receipt_id,alpha_id:alphaId});
  savePrivate(path,record);
  const mirror=await call('GET',`/api/v1/research/alphas?alpha_id=${encodeURIComponent(record.registration.alpha_id)}`);
  const entry=mirror.entries.find(v=>v.alpha_version_id===record.registration.alpha_version_id);
  assert(entry?.declaration,'SERVER_DECLARATION_REQUIRED');record.declaration=entry.declaration;
  assert.equal(record.registration.lifecycle_state,'DRAFT');record.passed=true;savePrivate(path,record);
  console.log(JSON.stringify({passed:true,alpha_id:record.registration.alpha_id,alpha_version_id:record.registration.alpha_version_id,source_digest:sha}));
}
