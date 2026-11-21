#!/usr/bin/env node
/** Resumable ordinary producer proof; never a direct engine invocation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {selectExactCandidate} from './full03-product-receipt.mjs';
import {makeClient,privateJson,savePrivate} from './api-client.mjs';
import {container,dbQuery,docker} from './runtime-tools.mjs';
import {admitRealRun,waitForRun,requestedSpec} from './real-run.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const id='p10.delta-event-driven-limit-oco-search-1h.v1';
const home=process.argv.find(a=>a.startsWith('--home='))?.slice(7);
const symbol=process.argv.find(a=>a.startsWith('--symbol='))?.slice(9)??'BTCUSDT';
const trials=Number(process.argv.find(a=>a.startsWith('--trials='))?.slice(9)??100);
const attempt=Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1);assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=8);
assert(['BTCUSDT','ETHUSDT','SOLUSDT'].includes(symbol)&&Number.isInteger(trials)&&trials>=2&&trials<=400);
const row=selectExactCandidate(home,id,'expanded');
const bindings=JSON.parse(readFileSync(join(root,'apps/portal/registry/research-native-delta-bindings.v1.json')));
const binding=bindings.find(b=>b.alpha_version_id===row.descriptor.alpha_binding_requirements.alpha_version_id);assert(binding);
const path=join(home,`native-limit-oco-search-${symbol.toLowerCase()}-${trials}-${attempt}.json`);
const record={schema_version:'research.native-optimized-product-receipt.v1',profile_id:id,
 profile_digest:row.profile_digest,identity:privateJson(join(home,'identity.json')),symbol,trials,
 started_at_utc:new Date().toISOString(),reads:{},passed:false};
record.source_diff_sha256=createHash('sha256').update(execFileSync('git',['diff','HEAD'],{cwd:root,maxBuffer:24*1024**2})).digest('hex');
record.added_source_sha256=Object.fromEntries(execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean)
 .map(f=>[f,createHash('sha256').update(readFileSync(join(root,f))).digest('hex')]));
const save=()=>savePrivate(path,record);
try{
 // Previous QA credentials were deliberately destroyed at cleanup. Create a
 // distinct disposable actor through the existing bootstrap/auth services;
 // never reset the owner or reactivate a disabled test identity.
 const actorPath=join(home,'limit-oco-search-actor.json'),username='p23-reader-95';
 let user;
 if(existsSync(actorPath))user=privateJson(actorPath);
 else{
  assert.equal(dbQuery('SELECT count(*)::int n FROM portal_users WHERE username=$1',[username]).rows[0].n,0,'NO_QA_RESET');
  user={username,password:randomBytes(32).toString('hex'),cookies:{}};savePrivate(actorPath,user);
  const output=docker(['exec','-i',container('control-api'),'node','dist/cli/bootstrap.js','--file','/dev/stdin','--print-one-time-credentials'],`- username: ${username}\n  role: ADMIN\n`);
  const activation=output.split('\n').find(l=>l.startsWith(`ONE_TIME ${username} `))?.split(' ')[2];assert(activation);
  user.id=dbQuery('SELECT user_id FROM portal_users WHERE username=$1',[username]).rows[0].user_id;
  const c=makeClient(user);await c.call('POST','/api/auth/login',{username,credential:activation},[201]);
  await c.call('POST','/api/auth/change-password',{current_password:activation,new_password:user.password},[201]);savePrivate(actorPath,user);
 }
 const client=makeClient(user,{connectionClose:true});
 if((await client.call('GET','/api/auth/context')).body.state==='APP_LOGIN_REQUIRED')
  await client.call('POST','/api/auth/login',{username,credential:user.password},[201]);
 savePrivate(actorPath,user);
 const admitted=await admitRealRun(home,'p04',`limit-oco-search-${symbol.toLowerCase()}-${trials}-${attempt}`,username,client,(_old,release)=>{
  const s=requestedSpec(binding,release,'p04');s.execution_route='event_driven';s.data.symbol=symbol;
  s.optimization_mode='mode_4_is_only_robust';s.optuna_trials=trials;s.random_seed=42;
  s.windows={is:{start:'2026-06-01T00:00:00Z',end_exclusive:'2026-08-03T00:00:00Z'},
   oos:{start:'2026-08-03T00:00:00Z',end_exclusive:'2026-08-21T00:00:00Z'},
   holdout:{start:'2026-08-21T00:00:00Z',end_exclusive:'2026-08-30T00:00:00Z'}};
  return s;
 });
 record.run=await waitForRun(client,admitted.path,admitted.receipt,3700000);save();
 assert.equal(record.run.final.body.current.effective_status,'COMPLETED');
 for(const route of ['evidence','split','search','freeze','execute/replay']){
  record.reads[route]=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/${route}`);save();
 }
 const facts=record.reads.evidence.body.core.native_execution,optimization=facts.optimization;
 assert.equal(facts.input_protocol,'DELTA_CLOSE_MULTICYCLE_LIMIT_OCO_COMMANDS_V1');
 assert.equal(optimization.requested_trials,trials);assert.equal(optimization.retained_trials,trials);
 assert(optimization.completed_trials>1&&optimization.distinct_parameter_sets>1);
 assert.equal(optimization.holdout_used,false);assert.equal(optimization.train_end_exclusive_utc_ms,Date.parse('2026-08-03T00:00:00Z'));
 assert.equal(record.run.final.body.native_execution.optimization.sha256,optimization.sha256);
 const owner=dbQuery('SELECT workspace_id,worker_attempt_id FROM research.run_producers WHERE run_id=$1',[record.run.run_id]).rows[0];assert(owner?.worker_attempt_id);
 const artifact='rart_'+createHash('sha256').update(`${owner.workspace_id}:${record.run.run_id}:${owner.worker_attempt_id}`).digest('hex').slice(0,40);
 const custodyProgram=`import sys,json,hashlib
from pathlib import Path
import pyarrow.parquet as pq
root=Path('/var/lib/portal/artifacts/runs/durable-store/research-retained/artifacts')/sys.argv[1]
manifest_path=root/'manifest.json'
manifest=json.loads(manifest_path.read_text())
assert manifest['run_id']==sys.argv[2]
table=next(t for t in manifest['tables'] if t['table_kind']=='native_optimizer_trials')
rows=[];parts=[]
for part in table['parts']:
 p=root/part['relative_path'];h=hashlib.sha256(p.read_bytes()).hexdigest();assert h==part['sha256']
 rows.extend(pq.read_table(p).to_pylist());parts.append({'sha256':h,'bytes':p.stat().st_size})
assert len(rows)==int(table['rows']) and [r['source_ordinal'] for r in rows]==list(range(len(rows)))
selected=[r for r in rows if r['trial_number']==int(sys.argv[3])];assert len(selected)==1
print(json.dumps({'artifact_id':sys.argv[1],'manifest_sha256':hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
 'rows':len(rows),'parts':parts,'selected_row':selected[0]}))`;
 record.custody=JSON.parse(docker(['exec',container('quant-worker-py'),'python','-c',custodyProgram,artifact,record.run.run_id,String(optimization.selected_trial_number)]));
 assert.equal(record.custody.rows,trials);assert.equal(record.custody.selected_row.objective,optimization.selected_objective);
 assert.deepEqual(JSON.parse(record.custody.selected_row.parameters_json),optimization.selected_parameters);save();
 record.journals={};
 for(const window of ['IS','OOS'])for(const kind of ['ORDER','COMMAND','LIFECYCLE','FILL']){
  const pages=[];let cursor=null;
  do{
   const q=new URLSearchParams({window,record_kind:kind,limit:'200'});if(cursor)q.set('cursor',cursor);
   const page=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/execution/records?${q}`);
   assert(Buffer.byteLength(JSON.stringify(page.body))<=1048576);pages.push(page);
   cursor=page.body.next_cursor??null;assert(pages.length<=64,'BOUNDED_ALL_JOURNAL_PAGES');
  }while(cursor);
  record.journals[`${window}:${kind}`]=pages;save();
 }
 const payloads=Object.values(record.journals).flatMap(pages=>pages.flatMap(p=>p.body.rows.map(r=>r.payload)));
 const commands=payloads.filter(r=>r.source_relation==='metadata.command_report');
 const lifecycle=payloads.filter(r=>r.source_relation==='metadata.lifecycle_event_report_v1');
 const fills=payloads.filter(r=>r.source_relation==='result.fills');
 const groups=new Map();
 for(const r of commands)if(r.parent_order_id){const v=groups.get(r.parent_order_id)??[];v.push(r);groups.set(r.parent_order_id,v);}
 assert(groups.size>=10,'MANY_ACTUAL_PARENT_OCO_CYCLES_REQUIRED');assert(fills.length>=20,'MANY_ACTUAL_FILLS_REQUIRED');
 assert.equal(fills.length,facts.fills_count);
 let terminalPairs=0;
 for(const [parent,children]of groups){
  assert.equal(children.length,2);assert(children.every(c=>c.oco_group_id===children[0].oco_group_id&&c.reduce_only&&c.activation_policy==='on_parent_full_fill'));
  const filled=children.filter(c=>lifecycle.some(e=>e.order_id===c.order_id&&e.event_name==='fill'));
  assert(filled.length<=1,'OCO_SIBLINGS_MUST_NOT_BOTH_FILL');
  if(filled.length===1&&children.some(c=>c.order_id!==filled[0].order_id&&lifecycle.some(e=>e.order_id===c.order_id&&e.event_name==='cancel')))terminalPairs++;
 }
 assert(terminalPairs>=5,'MANY_REAL_OCO_FILL_CANCEL_PAIRS_REQUIRED');
 record.counts={parent_cycles:groups.size,oco_terminal_pairs:terminalPairs,orders:facts.orders_count,
  fills:fills.length,command_rows:commands.length,lifecycle_rows:lifecycle.length,
  pages:Object.values(record.journals).reduce((n,p)=>n+p.length,0)};
 record.holdout=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/execution/records?window=HOLDOUT&limit=200`);
 assert.equal(record.holdout.body.availability.state,'NOT_PUBLISHED');assert.equal(record.holdout.body.rows.length,0);
 record.passed=true;record.finished_at_utc=new Date().toISOString();save();
 console.log(JSON.stringify({passed:true,run_id:record.run.run_id,symbol,optimization,counts:record.counts,receipt:path}));
}catch(e){record.failure=e.message;save();console.error('Native multi-cycle product proof refused:',e.message);process.exitCode=1;}
