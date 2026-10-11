#!/usr/bin/env node
/** UDB04 real child + durable queue + twenty readers of BOTH local stores. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,statfsSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requestedSpec} from '../research-p23/real-run.mjs';
import {evaluateReadSlo,percentile,consumeBounded} from '../research-p23/read-load.mjs';
import {ORIGIN,PROJECT,SERVICES,docker,owned,inControl,coreQuery,privateWrite,readPrivate} from './acceptance-cell.mjs';
import {client,namedClient,sessions,authSetup,refreshSessions} from './acceptance-api.mjs';

export function resourceSnapshot(){
  const planned=readPrivate('identity.json');let researchCurrent=0,executionCurrent=0,capSum=0;
  const rows=SERVICES.map(service=>{
    const c=JSON.parse(docker(['inspect','--format','{{json .}}',owned(service)]));
    assert.equal(c.Image,planned.images[service].image_id,'IMAGE_DRIFT:'+service);
    const path=readFileSync(`/proc/${c.State.Pid}/cgroup`,'utf8').trim().split('\n').find(l=>l.startsWith('0::')).slice(3);
    const cg='/sys/fs/cgroup'+path;
    const read=name=>readFileSync(cg+'/'+name,'utf8').trim();
    const current=Number(read('memory.current')),peak=existsSync(cg+'/memory.peak')?Number(read('memory.peak')):null,events=read('memory.events');
    assert(current<=c.HostConfig.Memory&&(peak===null||peak<=c.HostConfig.Memory),'CGROUP_LIMIT:'+service);
    capSum+=c.HostConfig.Memory;if(service==='execution-postgres')executionCurrent+=current;else researchCurrent+=current;
    return {service,current_bytes:current,peak_bytes:peak,limit_bytes:c.HostConfig.Memory,
      no_oom_kill:!/oom_kill [1-9]/.test(events),memory_events:events,memory_stat:read('memory.stat'),cpu_stat:read('cpu.stat'),io_stat:read('io.stat')};
  });
  const fs=statfsSync('/home/bobby');
  assert(researchCurrent<=5000000000&&executionCurrent<=536870912&&capSum<=5000000000);
  return {at_utc:new Date().toISOString(),research_current_bytes:researchCurrent,execution_current_bytes:executionCurrent,
    aggregate_current_bytes:researchCurrent+executionCurrent,enforced_aggregate_cap_bytes:capSum,
    kernel_lifetime_peak_available:rows.every(row=>row.peak_bytes!==null),
    memory_includes_pagecache:true,host_meminfo:readFileSync('/proc/meminfo','utf8'),
    host_loadavg:readFileSync('/proc/loadavg','utf8'),host_disk_free_bytes:fs.bavail*fs.bsize,
    host_disk_size_bytes:fs.blocks*fs.bsize,rows};
}

export async function readLoad(paths,readers,rounds=5){
  assert.equal(readers.length,20);assert.equal(new Set(readers.map(r=>r.id)).size,20);
  for(const u of readers){const context=(await client(u).call('GET','/api/auth/context')).body;
    assert.equal(context.state,'AUTHENTICATED','AUTHENTICATED_PRINCIPAL_REQUIRED');
    assert.equal(context.principal?.principalId,u.id,'DISTINCT_REAL_PRINCIPAL_BARRIER');}
  // Full JSON bodies are consumed within the normal 2MiB bound; neither
  // response headers nor deliberately empty personal libraries qualify.
  // Validate the DTO oracle, then warm EVERY real principal: Atlas is scoped
  // per principal. Warming only reader01 mislabels the other19 cold Atlas
  // reads as a warm summary SLO. Preserve their first reads as a separate
  // measured cold lane rather than dropping them or changing the warm gate.
  for(const path of paths)await client(readers[0]).call('GET',path);
  const samples=Object.fromEntries(paths.map(p=>[p,[]])),errors=[];
  async function measure(target,iterations){
  await Promise.all(readers.map(async u=>{const c=client(u);for(let i=0;i<iterations;i++)for(const path of paths){
    const start=performance.now();try{
      // The locked P23 SLO measures FULL bounded JSON transport, not twenty
      // browsers' JSON.parse work serialized on this one generator thread.
      // DTOs are parsed above for the actual warm oracle and by browser gates.
      const response=await fetch(ORIGIN+path,{redirect:'manual',signal:AbortSignal.timeout(45000),headers:{
        accept:'application/json',origin:ORIGIN,'x-dev-access-email':u.username+'@azdag.com',
        cookie:Object.entries(c.user.cookies).map(([k,v])=>k+'='+v).join('; ')}});
      const {errorCode}=await consumeBounded(response);assert.equal(response.status,200,errorCode??'HTTP_REFUSAL');
      target[path].push(performance.now()-start);
    }
    catch(e){errors.push({path,user_id:u.id,message:e.message});}
  }}));
  }
  const coldSamples=Object.fromEntries(paths.map(p=>[p,[]]));
  await measure(coldSamples,1);await measure(samples,rounds);
  const summarize=values=>Object.fromEntries(Object.entries(values).map(([path,ms])=>{ms.sort((a,b)=>a-b);
    return [path,{count:ms.length,p50_ms:Math.ceil(percentile(ms,.5)),p95_ms:Math.ceil(percentile(ms,.95)),
      p99_ms:Math.ceil(percentile(ms,.99)),max_ms:Math.ceil(ms.at(-1))}];}));
  const byPath=summarize(samples),cold=summarize(coldSamples);
  return {distinct_principals:20,rounds,consumption:'LOCKED_P23_FULL_JSON_BODY_2MIB_NO_HEADERS_ONLY',
    warmup_basis:'ONE_MEASURED_READ_PER_PATH_PER_REAL_PRINCIPAL',cold_by_path:cold,
    cold_slo:evaluateReadSlo({temperature:'cold',by_path:cold}),by_path:byPath,errors,
    slo:evaluateReadSlo({temperature:'warm',by_path:byPath})};
}
async function main(){
  await refreshSessions();
  const original=readPrivate('identity.json'),all=sessions(),readers=all.identities.filter(u=>/^udb04-reader-/.test(u.username));
  const pub=coreQuery("SELECT run_id,workspace_id,approval_id,release_candidate_id FROM research.release_candidate_publications_v1 WHERE actor_username='claude-preview' AND state='DELIVERED' ORDER BY published_at DESC LIMIT 1").rows[0];
  assert(pub,'REAL_EXISTING_RC_R1_REQUIRED');
  // Namespaced test memberships only in a private DB clone. This explicit
  // fixture never changes shared product grants/owner or claims a Stan login.
  const membership=inControl(authSetup+`
let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{try{
const {workspace,ids}=JSON.parse(input);await p.query('BEGIN');
const q=await p.query("INSERT INTO workspace_members(workspace_id,user_id,role) SELECT $1,user_id,'MEMBER' FROM portal_users WHERE user_id=ANY($2::text[]) AND username LIKE 'udb04-reader-%' ON CONFLICT DO NOTHING RETURNING user_id",[workspace,ids]);
assert([0,20].includes(q.rowCount));const actual=await p.query("SELECT count(*)::int n FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2::text[])",[workspace,ids]);assert.equal(actual.rows[0].n,20);
await auth.audit.record({eventType:'udb04_test_membership_fixture',result:'SUCCESS',metadata:{workspace_id:workspace,count:q.rowCount,scope:'PRIVATE_CLONE_ONLY'}});
await p.query('COMMIT');console.log(JSON.stringify({members:q.rowCount,workspace}));}finally{await p.end();}});`,
    JSON.stringify({workspace:pub.workspace_id,ids:readers.map(u=>u.id)}));
  for(const reader of readers)docker(['exec',owned('control-api'),'node','dist/cli/execution-store.js','grant-review',reader.username]);
  privateWrite('reader-authority.json',{membership,retained_only_grants:20,product_authority_changed:false,publication:pub});
  const suffix='workspace_id='+encodeURIComponent(pub.workspace_id),r=pub.run_id;
  const portfolios=(await client(readers[0]).call('GET','/api/v1/execution/portfolios?environment=all')).body;
  assert(portfolios.items.length>0,'RETAINED_PORTFOLIO_REQUIRED');
  const portfolio=encodeURIComponent(portfolios.items[0].portfolio_id);
  const paths=[`/api/v1/quantbt/runs?${suffix}&limit=20`,`/api/v1/research/runs/${r}/progress?${suffix}`,
    `/api/v1/quantbt/runs/${r}/evidence?${suffix}`,`/api/v1/quantbt/runs/${r}/search?${suffix}`,
    `/api/v1/quantbt/runs/${r}/report?${suffix}`,`/api/v1/quantbt/runs/${r}/execute/replay?${suffix}`,
    '/api/v1/execution/retained-review','/api/v1/execution/alphas?environment=all&limit=20',
    '/api/v1/execution/broker-bindings?environment=paper&limit=20','/api/v1/execution/command-center',
    '/api/v1/execution/portfolios?environment=all',`/api/v1/execution/resources/portfolios/${portfolio}`];
  assert.equal(coreQuery("SELECT count(*)::int n FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')").rows[0].n,0);
  const operator=namedClient('udb04-operator'),receipt={project:PROJECT,identity:original,started_at_utc:new Date().toISOString(),
    archived_read_run:r,archived_workspace:pub.workspace_id,jobs:[],before:resourceSnapshot(),passed:false};
  privateWrite('mixed-load.json',receipt);docker(['stop','--time','20',owned('quant-worker-py')]);
  try{
    const binding=(await operator.call('POST','/api/v1/research/run-producer/p04-delta/install',{},[200,201])).body;
    const atlas=(await operator.call('GET','/api/v1/research/quantbt/atlas')).body;
    const spec=requestedSpec(binding,atlas.atlas.current_release,'wfo');
    spec.walk_forward.end_exclusive='2026-09-01T00:00:00Z';spec.walk_forward.split_mode='2026-06-08T00:00:00Z';spec.optuna_trials=64;
    const preflight=await operator.call('POST','/api/v1/research/preflights',{requested_spec:spec},[201]);
    assert.equal(preflight.body.may_create_run,true);receipt.spec=spec;receipt.preflight=preflight;
    for(let i=0;i<5;i++){
      const client_intent_id='udb04-mixed-'+randomUUID();
      const response=await operator.call('POST','/api/v1/research/runs',{schema_version:'research.run-create.v1',
        client_intent_id,preflight_token:preflight.body.preflight_token,requested_spec:spec},[202,503]);
      const job=coreQuery('SELECT run_id,workspace_id,job_id FROM research.run_producers WHERE client_intent_id=$1',[client_intent_id]).rows[0];
      assert(job,'DURABLE_INTENT_REQUIRED');receipt.jobs.push({...job,client_intent_id,response});privateWrite('mixed-load.json',receipt);
    }
    const jobs=()=>coreQuery('SELECT job_id,queue_class,state FROM research.jobs WHERE job_id=ANY($1::text[])',[receipt.jobs.map(j=>j.job_id)]).rows;
    receipt.queue_before=jobs();assert.equal(receipt.queue_before.filter(j=>j.state==='QUEUED').length,4);
    assert(receipt.queue_before.every(j=>j.queue_class==='HEAVY'));
    docker(['start',owned('quant-worker-py')]);
    const deadline=Date.now()+90000;
    while(Date.now()<deadline){const progress=await operator.call('GET',`/api/v1/research/runs/${receipt.jobs[0].run_id}/progress`);
      if(progress.body.current.effective_status==='RUNNING'&&progress.body.current.source_latest_sequence>0){receipt.child_running=progress;break;}
      await new Promise(r=>setTimeout(r,500));}
    assert(receipt.child_running,'REAL_PINNED_CHILD_MUST_RUN');
    // Sample in a separate process: synchronous Docker metadata reads must
    // not block the client event loop and inflate HTTP latency measurements.
    const monitor=spawn(process.execPath,[fileURLToPath(import.meta.url),'--resources'],{stdio:['ignore','ignore','pipe']});
    let monitorError='';monitor.stderr.on('data',b=>monitorError+=b);
    const ended=new Promise((resolve,reject)=>{monitor.on('error',reject);monitor.on('close',code=>code===0?resolve():reject(new Error('RESOURCE_MONITOR_FAILED')));});
    try{receipt.load=await readLoad(paths,readers);}finally{monitor.kill('SIGTERM');await ended;}
    receipt.resources=readPrivate('resources.json').samples;
    receipt.queue_after=jobs();receipt.after=resourceSnapshot();
    receipt.pool_activity=coreQuery('SELECT state,count(*)::int n FROM pg_stat_activity GROUP BY state').rows;
    // Source-disabled reads must never write cache/lease/cursor/source clocks.
    const stateSource=readFileSync(new URL('./store-inventory.cjs',import.meta.url),'utf8');
    receipt.execution=inControl(stateSource);assert.equal(receipt.execution.empty.execution_shared_read_cache,0);
    assert.equal(receipt.execution.empty.execution_shared_read_flights,0);
    receipt.passed=receipt.load.slo.passed&&receipt.load.cold_slo.passed&&receipt.load.errors.length===0&&
      [...receipt.resources,receipt.before,receipt.after].every(s=>s.rows.every(row=>row.no_oom_kill));
    privateWrite('mixed-load.json',receipt);
  }finally{
    docker(['start',owned('quant-worker-py')]);
    for(const job of receipt.jobs.slice(1)){
      const row=coreQuery('SELECT state FROM research.jobs WHERE job_id=$1',[job.job_id]).rows[0];
      if(row&&['QUEUED','CLAIMED','RUNNING'].includes(row.state))
        await operator.call('POST',`/api/v1/research/runs/${job.run_id}/cancel`,{workspace_id:job.workspace_id,reason:'UDB04 owned queue cleanup'},[202]);
    }
    privateWrite('mixed-load.json',receipt);
  }
  console.log(JSON.stringify({passed:receipt.passed,paths:receipt.load?.by_path,heavy_run:receipt.jobs[0]?.run_id,
    measured_cgroup_peak_bytes:Math.max(...receipt.resources.map(s=>s.aggregate_current_bytes),receipt.after.aggregate_current_bytes),
    enforced_cap_bytes:receipt.after.enforced_aggregate_cap_bytes}));
  assert(receipt.passed,'CROSS_LOOP_WARM_SLO_FAILED');
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
  if(process.argv.includes('--resources')){
    let stop=false;process.on('SIGTERM',()=>{stop=true;});const samples=[];
    for(let i=0;i<120&&!stop;i++){samples.push(resourceSnapshot());privateWrite('resources.json',{samples});
      await new Promise(r=>setTimeout(r,1000));}
  }else await main();
}
