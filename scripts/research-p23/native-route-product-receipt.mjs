#!/usr/bin/env node
/** Ordinary authenticated native product path, not a direct engine proof. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {selectExactCandidate} from './full03-product-receipt.mjs';
import {privateJson,savePrivate,loadSessions,makeClient,ensureOwnedOperatorSession,ensureOwnedTestSession} from './api-client.mjs';
import {admitRealRun,waitForRun,requestedSpec} from './real-run.mjs';
import {validateHome} from './cell.mjs';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const bindings=JSON.parse(readFileSync(join(root,'apps/portal/registry/research-native-delta-bindings.v1.json')));
const routes=['evidence','split','search','freeze','replay','report','release-candidate'];
export async function nativeReceipt(home,id,symbol,attempt=1){
 home=validateHome(home);assert(home.endsWith('/expanded')&&['BTCUSDT','ETHUSDT','SOLUSDT'].includes(symbol));
 assert(Number.isInteger(attempt)&&attempt>=1&&attempt<=16);
 const row=selectExactCandidate(home,id,'expanded');assert.equal(row.descriptor.schema_version,'research.native-route-profile.v1');
 const binding=bindings.find(b=>b.alpha_version_id===row.descriptor.alpha_binding_requirements.alpha_version_id);assert(binding);
 const revision=id.match(/\.v([0-9]+)$/)?.[1];assert(revision,'EXACT_NATIVE_REVISION');
 const edition=revision==='1'?'':`-v${revision}`;
 const label=`native-${row.descriptor.execution_route.replaceAll('_','-')}${edition}-${symbol.toLowerCase()}-${attempt}`;
 const path=join(home,`qualification-${label}.json`);
 const user=loadSessions(home).identities.find(u=>u.username==='p23-owner'),client=makeClient(user,{connectionClose:true});
 const context=await ensureOwnedOperatorSession(client,home);
 assert(context?.state==='AUTHENTICATED'&&context.principal.principalId===user.id,'EXACT_NATIVE_TEST_OWNER');
 const record={schema_version:'research.native-product-receipt.v1',profile_id:id,profile_digest:row.profile_digest,
  identity:privateJson(join(home,'identity.json')),symbol,started_at_utc:new Date().toISOString(),reads:{},passed:false,
  source_diff_sha256:createHash('sha256').update(execFileSync('git',['diff','HEAD'],{cwd:root,maxBuffer:24*1024**2})).digest('hex')};
 record.added_source_sha256=Object.fromEntries(execFileSync('git',['ls-files','--others','--exclude-standard'],{cwd:root,encoding:'utf8'})
  .trim().split('\n').filter(Boolean).sort().map(file=>[file,createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
 const save=()=>savePrivate(path,record);
 try{
  const completed=readdirSync(home).filter(file=>new RegExp(`^run-native-${row.descriptor.execution_route.replaceAll('_','-')}${edition}-${symbol.toLowerCase()}-[1-8]\\.json$`).test(file))
   .map(file=>({path:join(home,file),receipt:privateJson(join(home,file))}))
   .filter(item=>item.receipt.created&&item.receipt.final?.body.current.effective_status==='COMPLETED'
    &&item.receipt.requested_spec.alpha_binding.alpha_version_id===binding.alpha_version_id
    &&item.receipt.requested_spec.execution_route===row.descriptor.execution_route
    &&item.receipt.requested_spec.data.symbol===symbol
    &&item.receipt.identity.images['quant-worker-py'].image_id===record.identity.images['quant-worker-py'].image_id).at(-1);
  assert(completed||attempt<=8,'AFTER_EIGHT_ATTEMPTS_ONLY_RESUME_COMPLETED_RUN_READS');
  const admitted=completed??await admitRealRun(home,'p04',label,'p23-owner',client,(_old,release)=>{
   const spec=requestedSpec(binding,release,'p04');spec.execution_route=row.descriptor.execution_route;spec.data.symbol=symbol;
   for(const w of Object.values(spec.windows)){w.start+=':00Z';w.end_exclusive+=':00Z';}
   return spec;
  });
  record.run=await waitForRun(client,admitted.path,admitted.receipt);save();
  assert.equal(record.run.final.body.current.effective_status,'COMPLETED','ORDINARY_NATIVE_CHILD_COMPLETED');
  for(const route of routes){
   for(let readAttempt=0;readAttempt<4;readAttempt++){
    const result=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/${route==='replay'?'execute/replay':route}`,undefined,route==='report'?[200,503]:[200]);
    if(result.status===200){record.reads[route]=result;break;}
    assert.equal(result.body.error?.code,'RESEARCH_REPORT_UNAVAILABLE','ONLY_TYPED_REPORT_RETRY');
    (record.report_refusals??=[]).push(result);save();
    assert(readAttempt<3,'REPORT_RETRY_EXHAUSTED');
    await new Promise(resolve=>setTimeout(resolve,20000));
   }
   save();
   assert(Buffer.byteLength(JSON.stringify(record.reads[route].body))<=1048576,'BOUNDED_NATIVE_SCREEN_READ');
  }
  const facts=record.reads.evidence.body.core.native_execution;
  assert(facts&&facts.execution_route===row.descriptor.execution_route,'EXACT_NATIVE_ROUTE_SOURCE_FACT');
  assert.equal(facts.clock,row.descriptor.native_input.execution_clock);
  assert.equal(record.reads.evidence.body.availability.state,'AVAILABLE');
  assert.equal(record.reads.freeze.body.freeze.frozen_parameters.length,8,'FIXED_PARAMETER_BINDING_RETAINED');
  record.wfo_refusal=await client.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/current-source/search`,undefined,[200]);
  assert.equal(record.wfo_refusal.body.availability.state,'NOT_APPLICABLE','NATIVE_FIXED_IS_NOT_SCALAR_WFO');
  const workspaces=(await client.call('GET','/api/workspaces')).body;
  const workspace=(Array.isArray(workspaces)?workspaces:workspaces.workspaces)[0];
  const other=makeClient(loadSessions(home).identities.find(u=>u.username==='p23-reader-01'));
  await ensureOwnedTestSession(other,home);
  record.foreign_workspace=await other.call('GET',`/api/v1/quantbt/runs/${record.run.run_id}/evidence?workspace_id=${encodeURIComponent(workspace.workspace_id??workspace.workspaceId)}`,undefined,[404]);
  record.passed=true;console.log(JSON.stringify({passed:true,route:row.descriptor.execution_route,symbol,run_id:record.run.run_id,reads:routes.length}));
 }catch(e){record.failure=e.message;throw e;}finally{record.finished_at_utc=new Date().toISOString();save();}
 return record;
}
if(process.argv[1]===fileURLToPath(import.meta.url))nativeReceipt(process.argv.find(a=>a.startsWith('--home='))?.slice(7),process.argv.find(a=>a.startsWith('--id='))?.slice(5),process.argv.find(a=>a.startsWith('--symbol='))?.slice(9)??'BTCUSDT',Number(process.argv.find(a=>a.startsWith('--attempt='))?.slice(10)??1)).catch(e=>{console.error('Native product refused:',e.message);process.exitCode=1;});
