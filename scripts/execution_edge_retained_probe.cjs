/* EPG10-01 operations probe, NOT a new Portal implementation or HTTP/auth test.
 * Run from stdin in the pinned existing SGP preview API image. Real retained
 * rows stay in memory; stdout contains bounded counts/hashes/metrics only.
 */
'use strict';
const {createHash}=require('node:crypto');
const {performance}=require('node:perf_hooks');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function quantiles(values) {
  assert(values.length>0 && values.every(n=>Number.isFinite(n)&&n>=0));
  const a=[...values].sort((x,y)=>x-y), at=q=>a[Math.ceil(q*a.length)-1];
  return {n:a.length,p50_ms:at(.5),p95_ms:at(.95),p99_ms:a.length>=100?at(.99):null,max_ms:a.at(-1),method:'FULL_WINDOW_NEAREST_RANK'};
}
function safePlan(node) {
  const keys=['Node Type','Relation Name','Index Name','Plan Rows','Total Cost',
    'Actual Rows','Actual Loops','Actual Total Time','Rows Removed by Filter',
    'Shared Hit Blocks','Shared Read Blocks','Shared Dirtied Blocks','Shared Written Blocks',
    'Temp Read Blocks','Temp Written Blocks','WAL Records','WAL Bytes','Sort Method','Sort Space Type','Sort Space Used'];
  return {...Object.fromEntries(keys.filter(k=>k in node).map(k=>[k,node[k]])),
    ...(node.Plans?{Plans:node.Plans.map(safePlan)}:{})};
}
function summary(value,maxBytes) {
  const bytes=Buffer.byteLength(JSON.stringify(value));
  assert(bytes<=maxBytes,'RESULT_BYTE_BOUND');
  return {bytes,sha256:hash(value)};
}
function hourBefore(exactUtc) {
  assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(exactUtc));
  return new Date(Date.parse(exactUtc)-3600_000).toISOString().replace(/\.\d{3}Z$/,exactUtc.slice(19));
}
const TABLES=['execution_workspace_references','execution_durable_mirror_batches',
  'execution_durable_mirror_revisions','execution_durable_mirror_current_entities',
  'execution_profile_projection_snapshots','execution_timeseries_history'];
const cellConnection={host:'/run/epg10-socket',database:'epg10_retained_cell',user:'postgres',max:1};
const columnsSql=`SELECT attname AS name,format_type(atttypid,atttypmod) AS type FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`;
function fixture() {
  assert(fs.statSync('/run/epg10-fixture.json').size<=32*1024**2,'FIXTURE_BYTES');
  const f=JSON.parse(fs.readFileSync('/run/epg10-fixture.json','utf8'));
  assert.equal(f.schema,'epg10.captured-retained-fixture.v1'); return f;
}
async function capture() {
  const deadline=setTimeout(()=>{console.log(JSON.stringify({status:'FAIL',reason:'SOURCE_CAPTURE_WALL_DEADLINE'}));process.exit(2);},25000);
  const cfg=require('/opt/control-api/dist/config.js').loadConfig(process.env);
  assert.equal(cfg.EXECUTION_READ_PROFILE,'retained_review_v1');
  const scope=[cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,'paper',cfg.EXECUTION_EDGE_PAPER_PROFILE_ID];
  assert(scope.every(Boolean));
  const {Pool}=require('/opt/control-api/node_modules/pg');
  const pool=new Pool({connectionString:cfg.EXECUTION_DATABASE_URL,max:1,connectionTimeoutMillis:2000,
    options:'-c default_transaction_read_only=on -c statement_timeout=250 -c lock_timeout=100 -c idle_in_transaction_session_timeout=3000'});
  const client=await pool.connect(),tables={},columns={}; let total=0;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); await client.query("SET LOCAL TIME ZONE 'UTC'");
    assert.equal((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only,'on');
    assert.equal((await client.query('SELECT current_database() AS db')).rows[0].db,'portal_execution','SOURCE_DB_IDENTITY');
    const where='t.workspace_id=$1 AND t.environment=$2 AND t.profile_id=$3';
    const collect=async(table,predicate,params,order,bound)=>{
      assert(TABLES.includes(table));
      columns[table]=(await client.query(columnsSql,[table])).rows;
      const r=await client.query(`SELECT to_jsonb(t)::text AS row FROM ${table} t WHERE ${predicate} ORDER BY ${order} LIMIT ${bound+1}`,params);
      assert(r.rows.length<=bound,'CAPTURE_CARDINALITY');
      tables[table]=r.rows.map(x=>x.row);
      for(const row of tables[table]) {total+=Buffer.byteLength(row);assert(total<=32*1024**2,'CAPTURE_BYTES');}
      return tables[table].map(x=>JSON.parse(x)); // only use UUID/text keys; never reserialize these parsed rows.
    };
    await collect(TABLES[0],'t.workspace_id=$1',scope.slice(0,1),'workspace_id',1);
    await collect(TABLES[4],where,scope,'workspace_id',1); assert.equal(tables[TABLES[4]].length,1);
    const entities=await collect(TABLES[3],where,scope,'relation_key,entity_key',10000);
    const revisionIds=[...new Set(entities.map(x=>x.last_read_model_revision))];
    const revisions=await collect(TABLES[2],where+' AND t.read_model_revision=ANY($4::uuid[])',[...scope,revisionIds],'read_model_revision',10000);
    assert.equal(revisions.length,revisionIds.length,'REVISION_CLOSURE');
    const batchIds=[...new Set([...entities.flatMap(x=>[x.first_observed_batch_id,x.last_observed_batch_id]),...revisions.map(x=>x.batch_id)])];
    const batches=await collect(TABLES[1],where+' AND t.batch_id=ANY($4::uuid[])',[...scope,batchIds],'batch_id',30000);
    assert.equal(batches.length,batchIds.length,'BATCH_CLOSURE');
    const relation='manager.performance:account_equity_snapshots';
    const latest=(await client.query(`SELECT to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_ts,fields->>'account_id' AS account_id FROM execution_timeseries_history WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4 ORDER BY ts DESC,row_id DESC LIMIT 1`,[...scope,relation])).rows[0];
    assert(latest?.account_id); const to=latest.exact_ts,from=hourBefore(to);
    await collect(TABLES[5],where+" AND t.relation_key=$4 AND t.ts >= $5::timestamptz AND t.ts <= $6::timestamptz AND t.fields->>'account_id'=$7",[...scope,relation,from,to,latest.account_id],'ts,row_id',200);
    assert(tables[TABLES[5]].length>0);
    await client.query('ROLLBACK');
    const output=JSON.stringify({schema:'epg10.captured-retained-fixture.v1',captured_utc:new Date().toISOString(),
      provenance:'PORTAL_SGP_HISTORY_MIRROR_PARTIAL',scope,tables,columns,raw_row_bytes:total});
    assert(Buffer.byteLength(output)<=32*1024**2,'CAPTURE_FILE_BOUND');
    // PRIVATE stdout: orchestrator writes directly to0600 disposable capture.
    process.stdout.write(output);
  } finally { try {try{await client.query('ROLLBACK');}finally{client.release();await pool.end();}}finally{clearTimeout(deadline);} }
}
async function seedCell() {
  const deadline=setTimeout(()=>{console.log(JSON.stringify({status:'FAIL',reason:'ISOLATED_SEED_WALL_DEADLINE'}));process.exit(2);},25000);
  const f=fixture(),{Pool}=require('/opt/control-api/node_modules/pg');
  const pool=new Pool(cellConnection); let client;
  try {
    assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'epg10_retained_cell');
    assert.equal((await pool.query("SELECT to_regclass('portal_users') AS core,to_regclass('execution_store_migrations') AS ledger")).rows[0].ledger,null);
    const migrate=require('/opt/control-api/dist/execution/store-schema.js').migrateExecutionStore;
    const schemaHash=await migrate(pool); assert.equal(await migrate(pool),schemaHash,'MIGRATION_IDEMPOTENCY');
    assert((await pool.query("SELECT to_regclass('portal_users') AS users,to_regclass('workspaces') AS workspaces")).rows.every(x=>x.users===null&&x.workspaces===null));
    client=await pool.connect(); await client.query('BEGIN'); await client.query("SET LOCAL TIME ZONE 'UTC'");
    const parity=[];
    for(const table of TABLES) {
      assert.deepEqual((await client.query(columnsSql,[table])).rows,f.columns[table],'SOURCE_TARGET_COLUMNS');
      const rows=f.tables[table];
      for(let i=0;i<rows.length;i+=100) {
        const r=await client.query(`INSERT INTO ${table} SELECT r.* FROM jsonb_populate_recordset(NULL::${table},$1::jsonb) r`,['['+rows.slice(i,i+100).join(',')+']']);
        assert.equal(r.rowCount,Math.min(100,rows.length-i));
      }
      const back=(await client.query(`SELECT to_jsonb(t)::text AS row FROM ${table} t`)).rows.map(x=>x.row).sort();
      const expected=[...rows].sort(); assert.deepEqual(back,expected,'SOURCE_TARGET_ROW_BYTES');
      parity.push({table,rows:rows.length,sha256:hash(expected)});
    }
    await client.query(`CREATE ROLE exec_runtime LOGIN; ALTER ROLE exec_runtime SET default_transaction_read_only=on;
      GRANT USAGE ON SCHEMA public TO exec_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO exec_runtime`);
    await client.query('COMMIT');
    console.log(JSON.stringify({status:'PASS_ISOLATED_SEED',schema_sha256:schemaHash,migration_idempotency:true,
      no_core_tables:true,source_target_parity:parity,production_writes:0,isolated_fixture_writes:parity.reduce((n,x)=>n+x.rows,0)}));
  } finally {try{if(client){try{await client.query('ROLLBACK');}finally{client.release();}} await pool.end();}finally{clearTimeout(deadline);}}
}
async function main() {
  if(process.argv.includes('--capture')) return capture();
  if(process.argv.includes('--seed-cell')) return seedCell();
  if(process.argv.includes('--self-test')) {
    assert.equal(quantiles([2,1]).p95_ms,2);
    assert.equal(quantiles([2,1]).p99_ms,null);
    assert.equal(quantiles(Array.from({length:100},(_,i)=>i)).p99_ms,98);
    assert.throws(()=>quantiles([NaN]));
    const clean=safePlan({'Node Type':'Index Scan','Index Cond':'PRIVATE','Filter':'PRIVATE',Plans:[{'Node Type':'Result',Output:['PRIVATE']}]});
    assert(!JSON.stringify(clean).includes('PRIVATE'));
    assert.throws(()=>summary({data:'oversize'},1));
    assert.equal(summary({a:1},100).sha256,hash({a:1}));
    assert.equal(hourBefore('2026-10-15T18:00:00.123456Z'),'2026-10-15T17:00:00.123456Z');
    assert.equal(hourBefore('2026-10-15T00:00:00.000001Z'),'2026-10-14T23:00:00.000001Z');
    assert.throws(()=>hourBefore('2026-10-15T18:00:00.123Z'));
    console.log(JSON.stringify({status:'PASS_TEST_ONLY',assertions:10,database_calls:0})); return;
  }
  const started=new Date().toISOString(),cpu=process.cpuUsage(),begin=performance.now();
  const isolated=process.argv.includes('--isolated'),f=isolated?fixture():null;
  const cfg=isolated?{EXECUTION_READ_PROFILE:'retained_review_v1',FEATURE_EXECUTION_DURABLE_MIRROR:'false',
    FEATURE_EXECUTION_DURABLE_MIRROR_READS:'false',EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:f.scope[0],EXECUTION_EDGE_PAPER_PROFILE_ID:f.scope[2]}:
    require('/opt/control-api/dist/config.js').loadConfig(process.env);
  assert.equal(cfg.EXECUTION_READ_PROFILE,'retained_review_v1');
  assert.equal(cfg.FEATURE_EXECUTION_DURABLE_MIRROR_READS,'false');
  const workspace=cfg.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,profile=cfg.EXECUTION_EDGE_PAPER_PROFILE_ID;
  assert(workspace&&profile&&(isolated||cfg.EXECUTION_DATABASE_URL));
  const {Pool}=require('/opt/control-api/node_modules/pg');
  const {ExecutionProfileProjectionRepository:Repository}=require('/opt/control-api/dist/execution/profile-projection.repository.js');
  const pool=new Pool({...isolated?{...cellConnection,user:'exec_runtime'}:{connectionString:cfg.EXECUTION_DATABASE_URL},max:1,connectionTimeoutMillis:2000,
    application_name:'epg10_01_retained_read_probe',options:'-c default_transaction_read_only=on -c statement_timeout=250 -c lock_timeout=100 -c idle_in_transaction_session_timeout=3000'});
  let client,queries=0; const plans=[],seen=new Set(),results=[];
  const watchdog=setTimeout(()=>{console.log(JSON.stringify({status:'FAIL',reason:'PROBE_WALL_DEADLINE',runtime_changes:0}));process.exit(2);},30000);
  try {
    client=await pool.connect(); await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity=await client.query("SELECT current_user AS role,current_database() AS database,current_setting('transaction_read_only') AS read_only,current_setting('statement_timeout') AS statement_timeout");
    assert.equal(identity.rows[0].read_only,'on'); assert.equal(identity.rows[0].database,isolated?'epg10_retained_cell':'portal_execution');
    const adapter={query:async(text,values)=>{
      assert(typeof text==='string'&&/^\s*(?:SELECT|WITH)\b/i.test(text),'FIXED_READS_ONLY');
      assert(++queries<=160,'QUERY_COUNT_BOUND');
      const sqlHash=hash(text);
      if(!seen.has(sqlHash)) {
        seen.add(sqlHash);
        const plan=await client.query((isolated?'EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) ':'EXPLAIN (FORMAT JSON) ')+text,values);
        plans.push({sql_sha256:sqlHash,full_plan_sha256:hash(plan.rows),plan:safePlan(plan.rows[0]['QUERY PLAN'][0].Plan)});
      }
      return client.query(text,values);
    }};
    const scope=[workspace,'paper',profile], relation='manager.performance:account_equity_snapshots';
    const metadata=await client.query('SELECT octet_length(payload::text) AS bytes FROM execution_profile_projection_snapshots WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 LIMIT 1',scope);
    assert.equal(metadata.rows.length,1,'RETAINED_SNAPSHOT_REQUIRED');
    // Do not alias the formatted text as "ts": ORDER BY would bind that alias
    // and sort the entire scope instead of using the native timestamp index.
    const latest=await adapter.query(`SELECT to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS exact_ts,fields->>'account_id' AS account_id FROM execution_timeseries_history WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4 ORDER BY ts DESC,row_id DESC LIMIT 1`,[...scope,relation]);
    assert.equal(latest.rows.length,1,'GENUINE_HISTORY_REQUIRED');
    const to=latest.rows[0].exact_ts,from=hourBefore(to);
    assert(latest.rows[0].account_id,'EXACT_ENTITY_REQUIRED');
    const entity={field:'account_id',value:latest.rows[0].account_id},query={from,to,entity,limit:200,order:'DESC'};
    const census=await adapter.query(`WITH bounded AS (SELECT fields FROM execution_timeseries_history WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4 AND ts >= $5::timestamptz AND ts <= $6::timestamptz AND fields->>'account_id'=$7 LIMIT 2001) SELECT count(*)::integer AS rows,coalesce(sum(octet_length(fields::text)),0)::text AS bytes FROM bounded`,[...scope,relation,from,to,entity.value]);
    assert(census.rows[0].rows<=2000&&Number(census.rows[0].bytes)<=1024**2,'HISTORY_INPUT_BOUND');
    const repo=new Repository(adapter,undefined,cfg);
    const read=()=>repo.timeSeriesHistory(...scope,relation,query);
    const first=await read(); assert(first.rows.length>0&&first.rows.length<=200);
    const digest=summary(first,1024**2),timings=[]; const before=queries;
    for(let i=0;i<100;i++) {
      const t=performance.now(),v=await read(); timings.push(performance.now()-t);
      assert.equal(summary(v,1024**2).sha256,digest.sha256,'REPEATABLE_READ_DIGEST_MISMATCH');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    results.push({case:'real_repository_history_100_sequential',status:'PASS',...digest,rows:first.rows.length,has_more:first.hasMore,db_calls:queries-before,...quantiles(timings)});
    const beforeConcurrent=queries,t=performance.now();
    const shared=await Promise.all(Array.from({length:16},read));
    for(const v of shared) assert.equal(summary(v,1024**2).sha256,digest.sha256);
    assert.equal(queries-beforeConcurrent,1,'SAME_QUERY_NOT_COALESCED');
    results.push({case:'real_repository_16_same_query_inflight',status:'PASS',callers:16,db_calls:queries-beforeConcurrent,elapsed_ms:performance.now()-t});
    const chart=await repo.timeSeriesHistoryDownsampled(...scope,relation,{from,to,entity,seriesField:'account_id',valueField:'equity',targetPoints:200});
    assert(chart.rows.length<=512); assert(chart.sourceRows>=chart.rows.length);
    results.push({case:'real_repository_narrow_chart',status:'PASS',source_rows:chart.sourceRows,output_rows:chart.rows.length,downsample:chart.downsample,...summary(chart,1024**2)});
    const entityCensus=await adapter.query(`WITH bounded AS (SELECT fields FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 LIMIT 10001) SELECT count(*)::integer AS rows,coalesce(sum(octet_length(fields::text)),0)::text AS bytes FROM bounded`,scope);
    const inputBytes=metadata.rows[0].bytes+Number(entityCensus.rows[0].bytes);
    if(inputBytes<=16*1024**2&&entityCensus.rows[0].rows<=10000) {
      const beforeCold=queries,tc=performance.now(),cold=await repo.snapshot(...scope);
      assert(cold); const snapDigest=summary(cold,16*1024**2);
      const coldCalls=queries-beforeCold,coldMs=performance.now()-tc,beforeWarm=queries,tw=performance.now();
      const warm=await Promise.all(Array.from({length:16},()=>repo.snapshot(...scope)));
      for(const v of warm) assert.equal(v,cold,'IMMUTABLE_CACHED_VIEW_IDENTITY');
      assert.equal(queries-beforeWarm,0);
      results.push({case:'real_repository_snapshot_cold_then16_cache_reads',status:'PASS',cold_db_calls:coldCalls,cold_ms:coldMs,warm_db_calls:0,warm_elapsed_ms:performance.now()-tw,...snapDigest});
    } else results.push({case:'real_repository_snapshot_cold_then16_cache_reads',status:'NOT_RUN',reason:'RETAINED_INPUT_ABOVE_16MIB_OR_10000_ENTITIES_PROBE_BOUND',payload_bytes:metadata.rows[0].bytes,input_bytes:inputBytes,entities:entityCensus.rows[0].rows});
    await client.query('ROLLBACK');
    // Read-only timeout drill on our own session only; no service/fault injection.
    let timeoutCode=null;
    try { await client.query('SELECT pg_sleep(0.5)'); } catch(e) { timeoutCode=e.code; }
    assert.equal(timeoutCode,'57014');
    assert.equal((await client.query('SELECT 1 AS ok')).rows[0].ok,1);
    results.push({case:'own_read_session_statement_timeout_then_recovery',status:'PASS',sqlstate:timeoutCode,timeout_ms:250});
    const isolatedDb=isolated?(await client.query(`SELECT pg_database_size(current_database())::text AS database_bytes,
      wal_records::text,wal_bytes::text FROM pg_stat_wal`)).rows[0]:null;
    const usage=process.cpuUsage(cpu);
    console.log(JSON.stringify({schema:'epg10.retained-probe.v1',status:'PASS_SCOPED_REPOSITORY_PROBE',started_utc:started,ended_utc:new Date().toISOString(),
      provenance:'PORTAL_SGP_HISTORY_MIRROR_PARTIAL_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_TS_HISTORY',
      target:isolated?'DISPOSABLE_UNIX_SOCKET_CAPTURE_REPLAY':'EXISTING_PREVIEW_READ_ONLY_SESSION',
      scope_sha256:hash(scope),relation,range_seconds:3600,history_census:census.rows[0],snapshot_input_bytes:inputBytes,identity:identity.rows[0],
      module_sha256:hash(fs.readFileSync('/opt/control-api/dist/execution/profile-projection.repository.js','utf8')),
      results,plans,explain_mode:isolated?'ANALYZE_BUFFERS_WAL_ISOLATED_ONLY':'ESTIMATES_ONLY',isolated_db_counters:isolatedDb,
      instrumented_fixed_read_calls:queries,explain_calls:plans.length,elapsed_ms:performance.now()-begin,
      observer_cpu_ms:(usage.user+usage.system)/1000,max_rss_kib:process.resourceUsage().maxRSS,
      runtime_changes:0,auth_session_writes:0,business_writes:0,source_http_calls:0,
      limitations:['Internal repository only, not HTTP/mTLS/RBAC or browser acceptance','One private retained Paper scope, not current TS truth or all profiles','No source polling/transport cost or TS/DL trading latency measured','100 reads are not a sustained/concurrent capacity claim',isolated?'Plans actually execute once before timings; DB/OS cache warm, not cold-disk proof':'EXPLAIN without ANALYZE: estimated rows/costs, not observed scans/buffers','Freshly instantiated cache is separate from existing service cache; no production cache reset']}));
  } finally { try { if(client){try{await client.query('ROLLBACK');}finally{client.release();}} await pool.end(); } finally { clearTimeout(watchdog); } }
}
main().catch(e=>{console.log(JSON.stringify({status:'FAIL',reason:e.code&&/^[A-Z0-9_]{1,64}$/.test(e.code)?e.code:'PROBE_ASSERTION_OR_RUNTIME_ERROR',runtime_changes:0}));process.exitCode=2;});
