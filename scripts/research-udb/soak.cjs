// Real PG/repository fixture lane, NOT a source/engine/product qualification.
// 15 cache requests/s, cross-replica sharing, a permanently live sentinel and
// continuously changed ~2MiB bodies. Finite condition-based qualification;
// never label this shorter lane as a 24h soak.
require('/opt/control-api/node_modules/reflect-metadata');
const {Pool}=require('/opt/control-api/node_modules/pg');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs');
const {loadConfig}=require('/opt/control-api/dist/config');
const {ExecutionSharedReadRepository}=require('/opt/control-api/dist/execution/shared-read.repository');
const {runSharedReadCacheSweep}=require('/opt/control-api/dist/execution/shared-read-cache-maintenance');
const {runControlApiMigrations}=require('/opt/control-api/dist/cli/migrate');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,Math.max(0,ms)));
const duration=Number(process.env.UDB_DURATION_SECONDS??1200);
if (!Number.isInteger(duration)||duration<600||duration>1800) throw new Error('Invalid bounded UDB duration');
const reportDir=process.env.UDB_REPORT_DIR;
const summary={lane:'CACHE_FIXTURE_REAL_POSTGRES_CONDITION_BASED',maximum_seconds:duration,minimum_seconds:600,target_rps:15,
  source_requests:0,requests:0,hits:0,leaders:0,denied:0,max_physical_bytes:0,
  max_live_bytes:0,samples:0,failures:[],conditions:{},status:'RUNNING',started_at:new Date().toISOString()};
const record=()=>fs.writeFileSync(`${reportDir}/summary.json`,JSON.stringify(summary,null,2));
function plateau(samples) {
  if(samples.length<29) return null;
  const baseline=Math.max(...samples.slice(0,10).map(s=>s.physicalBytes));
  const latest=Math.max(...samples.slice(-10).map(s=>s.physicalBytes));
  const tolerance=Math.max(4*1024*1024,baseline*0.10);
  return {baseline_bytes:baseline,latest_bytes:latest,tolerance_bytes:tolerance,
    growth_bytes:latest-baseline,pass:latest-baseline<=tolerance};
}
async function main() {
  await runControlApiMigrations(process.env.DATABASE_URL,'/opt/control-api/migrations',()=>{});
  const pools=[new Pool({connectionString:process.env.DATABASE_URL,max:3}),
    new Pool({connectionString:process.env.DATABASE_URL,max:3})];
  const pool=pools[0];
  try {
    await pool.query(`INSERT INTO portal_users (user_id,username,display_name,role,status,must_change_password)
      VALUES ('usr_udb_soak','udb-soak','Disposable UDB Fixture','ADMIN','ACTIVE',false);
      INSERT INTO workspaces (workspace_id,name,owner_user_id) VALUES ('ws_udb_soak','UDB Fixture','usr_udb_soak');`);
    const makeConfig=ttl=>loadConfig({DATABASE_URL:process.env.DATABASE_URL,PORTAL_ENV:'local',AUTH_MODE:'dev',
      EXECUTION_EDGE_CURRENT_SOURCE_CACHE_TTL_MS:String(ttl),
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND:'15',
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES:String(2*1024*1024),
      EXECUTION_SHARED_READ_CACHE_SWEEPER_DRY_RUN:'false'});
    const normal=makeConfig(50);
    const replicas=pools.map(p=>new ExecutionSharedReadRepository(p,normal));
    const scope={sourceId:'udb-fixture',profileId:'PAPER_BINANCE_USDM',workspaceId:'ws_udb_soak',
      principalId:'usr_udb_soak',principalRole:'ADMIN',adapterRevision:'UDB01',requestPath:'/udb/fixture/sentinel'};
    const metadata={authority:'UDB_FIXTURE',freshness:'FRESH',completeness:'COMPLETE',as_of:'2026-10-10T00:00:00.000Z'};
    const seed=await replicas[0].begin(scope);
    if(seed.kind!=='LEADER') throw new Error('sentinel admission failed');
    await replicas[0].complete(scope,seed,metadata);
    await pool.query("UPDATE execution_shared_read_cache SET expires_at=clock_timestamp()+($1::int * interval '1 second')",[duration+600]);
    if((await replicas[1].begin(scope)).kind!=='CACHE_HIT') throw new Error('cross-pool sentinel absent');
    // Fixture-only pressure injection, preserving live hits and no source call.
    const guarded=new ExecutionSharedReadRepository(pools[1],{...normal,EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES:1048576});
    const pressureScope={...scope,requestPath:'/udb/fixture/pressure'};
    const denied=await guarded.begin(pressureScope);
    if(denied.kind!=='DENIED'||denied.reasonCode!=='N21_SHARED_CACHE_CAPACITY_EXHAUSTED') throw new Error('pressure did not deny leader');
    if((await guarded.begin(scope)).kind!=='CACHE_HIT') throw new Error('pressure evicted live hit');
    const recovered=await replicas[1].begin(pressureScope);
    if(recovered.kind!=='LEADER') throw new Error('pressure removal did not recover admission');
    await replicas[1].complete(pressureScope,recovered,metadata);
    summary.conditions.pressure_denial_live_hit_and_recovery=true;
    const payload=randomBytes(1535*1024).toString('base64');
    summary.body_bytes=Buffer.byteLength(JSON.stringify({...metadata,revision:9999999,payload}));
    if(summary.body_bytes>normal.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES) throw new Error('fixture exceeds page bound');
    const toastStats=async()=> (await pool.query(`SELECT s.autovacuum_count::integer AS vacuum_cycles,
      s.n_tup_ins::text AS inserted_chunks,s.n_dead_tup::text AS dead_chunks
      FROM pg_class c JOIN pg_stat_all_tables s ON s.relid=c.reltoastrelid
      WHERE c.oid='execution_shared_read_cache'::regclass`)).rows[0];
    const initialStats=await toastStats();
    const samples=[];
    const began=Date.now(),end=began+duration*1000;
    let next=began,lastSample=0,lastLeader=began;
    const pending=new Set();
    let failure;
    const write=async ordinal=> {
      const repository=replicas[ordinal%2];
      const request={...scope,requestPath:`/udb/fixture/key-${ordinal%24}`};
      const admission=await repository.begin(request);
      if(admission.kind==='LEADER') {
        await delay(admission.waitMs);
        await repository.complete(request,admission,{...metadata,revision:ordinal+1,payload});
        summary.leaders++; lastLeader=Date.now();
      } else if(admission.kind==='CACHE_HIT') summary.hits++;
      else if(admission.kind==='DENIED') summary.denied++;
      else throw new Error('unexpected unfinished follower');
    };
    const settings=(await pool.query("SELECT name,setting,unit FROM pg_settings WHERE name IN ('shared_buffers','autovacuum_work_mem','max_connections','autovacuum_naptime','work_mem') ORDER BY name")).rows;
    fs.writeFileSync(`${reportDir}/settings.json`,JSON.stringify(settings,null,2));
    while(Date.now()<end) {
      await delay(next-Date.now()); next+=1000/15;
      // No catch-up burst if CPU/IO was slow; measured requests expose misses.
      if(next<Date.now()-1000) next=Date.now();
      // Dispatch at15/s independently of individual response latency, with
      // at most4 in-flight jobs. Sequential await underloads two real replicas.
      if(pending.size>=4) await Promise.race(pending);
      if(failure) throw failure;
      const ordinal=summary.requests++;
      const task=write(ordinal).catch(error=>{failure=error;}).finally(()=>pending.delete(task));
      pending.add(task);
      if(Date.now()-lastSample>=10000) {
        const sweep=await runSharedReadCacheSweep(replicas[0],normal,{dryRun:false});
        const sample=await replicas[0].inventory(128);
        summary.samples++; summary.max_physical_bytes=Math.max(summary.max_physical_bytes,sample.physicalBytes);
        summary.max_live_bytes=Math.max(summary.max_live_bytes,sample.activeBytes);
        if(sample.physicalBytes>normal.EXECUTION_SHARED_READ_CACHE_PHYSICAL_LIMIT_BYTES) throw new Error('physical bound exceeded');
        if(sample.activeBytes>normal.EXECUTION_SHARED_READ_CACHE_MAXIMUM_BYTES) throw new Error('logical bound exceeded');
        if(sample.activeRows>normal.EXECUTION_SHARED_READ_CACHE_MAXIMUM_ROWS) throw new Error('logical row bound exceeded');
        if(sweep.physicalReclaim.reclaimed) throw new Error('TRUNCATE used despite live sentinel');
        if((await replicas[0].begin(scope)).kind!=='CACHE_HIT') throw new Error('live sentinel lost');
        if(Date.now()-lastLeader>120000) throw new Error('physical pressure failed to recover bounded refresh');
        const resource=(await pool.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
          (SELECT wal_bytes::text FROM pg_stat_wal) AS wal_bytes,
          (SELECT count(*)::integer FROM pg_stat_activity) AS connections,
          (SELECT temp_bytes::text FROM pg_stat_database WHERE datname=current_database()) AS temp_bytes,
          (SELECT sum(reads)::text FROM pg_stat_io) AS io_reads,
          (SELECT sum(writes)::text FROM pg_stat_io) AS io_writes,
          (SELECT sum(write_time)::text FROM pg_stat_io) AS io_write_ms`)).rows[0];
        const stats=await toastStats(),at=Date.now();
        samples.push({at,physicalBytes:sample.physicalBytes});
        while(samples.length&&samples[0].at<at-300000) samples.shift();
        summary.vacuum_cycles=stats.vacuum_cycles-initialStats.vacuum_cycles;
        summary.inserted_toast_chunks=Number(stats.inserted_chunks)-Number(initialStats.inserted_chunks);
        summary.elapsed_seconds=(at-began)/1000;
        summary.observed_rps=summary.requests/summary.elapsed_seconds;
        summary.plateau=plateau(samples);
        summary.conditions={...summary.conditions,minimum_load_window:summary.elapsed_seconds>=600,
          sustained_changed_bodies:summary.leaders/summary.elapsed_seconds>=14,
          repeated_vacuum:summary.vacuum_cycles>=3,final_5min_plateau:summary.plateau?.pass===true,
          physical_logical_budgets:true,live_entry_no_truncate:true};
        fs.appendFileSync(`${reportDir}/samples.jsonl`,JSON.stringify({at:new Date().toISOString(),physicalBytes:sample.physicalBytes,
          activeBytes:sample.activeBytes,requests:summary.requests,leaders:summary.leaders,denied:summary.denied,stats,resource})+'\n');
        lastSample=at; record();
        if(Object.values(summary.conditions).every(Boolean)) {
          await Promise.all(pending);
          if(failure) throw failure;
          summary.status='PASS_BOUNDED_QUALIFICATION_NOT_24H';
          summary.finished_at=new Date().toISOString(); record(); return;
        }
      }
    }
    throw new Error('bounded qualification ended without every required condition');
  } finally {await Promise.all(pools.map(p=>p.end()));}
}
main().catch(error=>{summary.status='FAIL';summary.failures.push(String(error.message).slice(0,200));record();process.exitCode=1;});
