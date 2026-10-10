import "reflect-metadata";
import {afterAll,beforeAll,describe,it,expect} from "vitest";
import {Pool} from "pg";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {randomUUID} from "node:crypto";
import {migrateExecutionStore} from "../src/execution/store-schema";
import {exportRetainedStore,importRetainedStore,RETAINED_TABLES} from "../src/execution/retained-store-transfer";
import {provisionRetainedWorkspace} from "../src/execution/retained-workspace";
import {runControlApiMigrations} from "../src/cli/migrate";
import {buildExecutionPool,buildPool,getPool} from "../src/db/pool";
import {createControlApiApp} from "../src/app";
import {CONTROL_API_POOL,EXECUTION_DATA_POOL} from "../src/tokens";
import {AuthService} from "../src/auth/auth.service";
import {ManagerListsRepository} from "../src/manager-lists/manager-lists.repository";
import {testConfig} from "./harness";

describe("UDB02 actual separated domain store",()=>{
  const base=process.env.TEST_DATABASE_URL??"postgres://portal:portal@127.0.0.1:5432/portal_control_test";
  const db="udb_exec_"+randomUUID().replaceAll("-","");
  const coreDb="udb_core_"+randomUUID().replaceAll("-","");
  const url=(name:string)=>{const u=new URL(base);u.pathname="/"+name;return u.toString();};
  let target:Pool,core:Pool,dir:string,manifest:Awaited<ReturnType<typeof exportRetainedStore>>;
  const workspace="ws_udb02test";
  beforeAll(async()=>{
    const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query(`CREATE DATABASE ${db}`);await admin.query(`CREATE DATABASE ${coreDb}`);}finally{await admin.end();}
    core=buildPool(url(coreDb));target=new Pool({connectionString:url(db),max:2});
    dir=await mkdtemp(join(tmpdir(),"udb02-transfer-"));
    await runControlApiMigrations(url(coreDb),undefined,()=>{});
    await migrateExecutionStore(target);
    await core.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password)
      VALUES('usr_udb02','udb02','Owner','ADMIN','ACTIVE',false);
      INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','usr_udb02');`);
    await provisionRetainedWorkspace(core,testConfig({AUTH_MODE:"dev",DATABASE_URL:url(coreDb),EXECUTION_DATABASE_URL:url(db)}),workspace);
    await core.query(`INSERT INTO execution_binding_projection(scope_id,workspace_id,environment,binding_id,account_id,venue,state,credential_state,updated_at,source_as_of,projection_refreshed_at)
      VALUES($1,$2,'paper','binding_udb','account_udb','BINANCE','ACTIVE','READY','2026-09-01T00:00:00.123456Z','2026-08-31T00:00:00.456789Z','2026-09-01T00:00:00Z')`,[workspace+":paper",workspace]);
    await core.query(`INSERT INTO execution_timeseries_history(workspace_id,environment,profile_id,relation_key,row_id,ts,fields,first_seen_at)
      VALUES($1,'paper','PAPER_BINANCE_USDM','manager.performance:account_equity_snapshots','eq_exact','2026-09-01T00:00:00.123456Z',
        '{"account_id":"account_udb","equity":"1234567890.1234567890123456789"}','2026-09-02T00:00:00.000123Z')`,[workspace]);
    manifest=await exportRetainedStore(core,workspace,"udb02-fixture",join(dir,"current"));
  },90_000);
  afterAll(async()=>{
    await Promise.all([core?.end(),target?.end()]);
    const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);await admin.query(`DROP DATABASE IF EXISTS ${coreDb} WITH (FORCE)`);}finally{await admin.end();}
    if(dir)await rm(dir,{recursive:true,force:true});
  });
  it("T01/T02 imports exact decimals and UTC microseconds, no authority/cache, reruns idempotently",async()=>{
    await importRetainedStore(target,core,join(dir,"current"));
    await importRetainedStore(target,core,join(dir,"current"));
    expect((await target.query("SELECT ts::text,fields->>'equity' AS equity FROM execution_timeseries_history")).rows[0]).toEqual({ts:"2026-09-01 00:00:00.123456+00",equity:"1234567890.1234567890123456789"});
    expect((await target.query("SELECT count(*)::int AS n FROM execution_retained_imports")).rows[0].n).toBe(1);
    expect((await target.query("SELECT to_regclass('portal_users') AS users,to_regclass('workspaces') AS workspaces,to_regclass('research.runs') AS research")).rows[0]).toEqual({users:null,workspaces:null,research:null});
    expect((await target.query("SELECT count(*)::int AS n FROM execution_shared_read_cache")).rows[0].n).toBe(0);
    expect((await target.query("SELECT count(*)::int AS n FROM execution_profile_relation_cursors")).rows[0].n).toBe(0);
    expect(await migrateExecutionStore(target)).toMatch(/^[a-f0-9]{64}$/);
    await expect(migrateExecutionStore(core)).rejects.toThrow("EXECUTION_SCHEMA_CORE_TARGET_REFUSED");
  });
  it("T01 rejects changed bytes/run IDs/extra authority table before writing",async()=>{
    const copy=join(dir,"bad"),contents=await readFile(join(dir,"current.ndjson"),"utf8");
    await writeFile(copy+".ndjson",contents+" ");await writeFile(copy+".manifest.json",JSON.stringify(manifest));
    await expect(importRetainedStore(target,core,copy)).rejects.toThrow("UDB_TRANSFER_FILE_DIGEST_MISMATCH");
    await writeFile(copy+".ndjson",contents);await writeFile(copy+".manifest.json",JSON.stringify({...manifest,captured_at:"changed"}));
    await expect(importRetainedStore(target,core,copy)).rejects.toThrow("UDB_TRANSFER_RUN_ID_CONFLICT");
    await writeFile(copy+".manifest.json",JSON.stringify({...manifest,tables:{...manifest.tables,portal_users:{rows:0}}}));
    await expect(importRetainedStore(target,core,copy)).rejects.toThrow("UDB_TRANSFER_MANIFEST_INVALID");
  });
  it("T02 provisioning preserves owner and denies production/unclaimed anchor/wrong workspace",async()=>{
    const cfg=testConfig({AUTH_MODE:"dev",DATABASE_URL:url(coreDb),EXECUTION_DATABASE_URL:url(db)});
    expect((await provisionRetainedWorkspace(core,cfg,workspace)).created).toBe(false);
    await expect(provisionRetainedWorkspace(core,{...cfg,PORTAL_ENV:"research"},workspace)).rejects.toThrow("UDB_REVIEW_PROVISIONING_REFUSED");
    await core.query("UPDATE portal_users SET status='DISABLED' WHERE user_id='usr_udb02'");
    await expect(provisionRetainedWorkspace(core,cfg,"ws_noowner")).rejects.toThrow("UDB_CORE_OWNER_REQUIRED");
    await core.query("UPDATE portal_users SET status='ACTIVE' WHERE user_id='usr_udb02'");
    expect((await new ManagerListsRepository(target).binding(workspace+":paper","binding_udb"))?.accountId).toBe("account_udb");
    expect(await new ManagerListsRepository(target).binding("ws_wrong:paper","binding_udb")).toBeNull();
    expect(await new ManagerListsRepository(target).binding(workspace+":live","binding_udb")).toBeNull();
    expect(await new ManagerListsRepository(target).binding(workspace+":paper","binding_wrong")).toBeNull();
  });
  it("T03 real pool queue is bounded while Core load cannot consume Execution slots",async()=>{
    const cfg=testConfig({AUTH_MODE:"dev",DATABASE_URL:url(coreDb),EXECUTION_DATABASE_URL:url(db),EXECUTION_DATABASE_POOL_MAX:"1",EXECUTION_DATABASE_POOL_QUEUE_MAX:"1"});
    const exec=buildExecutionPool(cfg),held=await exec.connect(),queued=exec.connect();
    await new Promise(resolve=>setTimeout(resolve,20));
    await expect(exec.connect()).rejects.toThrow("EXECUTION_POOL_BUSY");
    await expect(exec.query("SELECT 1")).rejects.toThrow("EXECUTION_POOL_BUSY");
    expect((await core.query("SELECT 1 AS n")).rows[0].n).toBe(1);
    held.release();(await queued).release();
    const coreHeld=await core.connect();await coreHeld.query("BEGIN; SELECT pg_sleep(0.05)");
    expect((await exec.query("SELECT 2 AS n")).rows[0].n).toBe(2);
    await coreHeld.query("ROLLBACK");coreHeld.release();await exec.end();
    expect(getPool()).toBe(core);expect(buildPool(url(coreDb))).toBe(core);
  });
  it("T03 DI uses explicit domain pool while session/auth stay on Core",async()=>{
    const cfg=testConfig({AUTH_MODE:"dev",DATABASE_URL:url(coreDb),EXECUTION_DATABASE_URL:url(db)});
    const app=await createControlApiApp(cfg,core,target);
    try{
      expect(app.get(CONTROL_API_POOL)).toBe(core);expect(app.get(EXECUTION_DATA_POOL)).toBe(target);
      expect(app.get(ManagerListsRepository).pool).toBe(target);
      expect(await app.get(AuthService).users.findByUsername("udb02")).not.toBeNull();
      const r=await app.getHttpAdapter().getInstance().inject({method:"GET",url:"/api/control/readyz"});expect(r.statusCode).toBe(200);
    }finally{await app.close();}
  });
  it("manifest lists every retained table and marks bounded history rather than full replay",()=>{
    expect(Object.keys(manifest.tables)).toEqual([...RETAINED_TABLES]);expect(manifest.live_state_imported).toBe(false);
    expect(manifest.history_reader).toBe("execution_timeseries_history");
  });
  it("T03 config refuses aliases of the Core database and unbounded queues",()=>{
    const c=new URL(url(coreDb));c.username="other_role";c.protocol="postgresql:";
    expect(()=>testConfig({DATABASE_URL:url(coreDb),EXECUTION_DATABASE_URL:c.toString()})).toThrow("EXECUTION_DATABASE_MUST_BE_ISOLATED");
    expect(()=>testConfig({EXECUTION_DATABASE_POOL_MAX:"11"})).toThrow();
    expect(()=>testConfig({EXECUTION_DATABASE_POOL_QUEUE_MAX:"33"})).toThrow();
    expect(()=>testConfig({EXECUTION_DATABASE_URL_FILE:"/tmp/not-a-secret"})).toThrow("EXECUTION_DATABASE_FILE_INVALID");
  });
  it("T01 supplements current entities with their exact FK receipts, never mirror history",async()=>{
    const batch="11111111-1111-4111-8111-111111111111",revision="22222222-2222-4222-8222-222222222222";
    const epoch="33333333-3333-4333-8333-333333333333",digest="sha256:"+"0".repeat(64);
    await core.query(`INSERT INTO execution_durable_mirror_batches(batch_id,workspace_id,environment,profile_id,
      source_contract_revision,source_epoch,source_cursor_digest,received_at,completeness,projection_epoch,
      projection_sequence,payload_digest,read_model_revision,relation_count,state,committed_at)
      VALUES($1,$2,'paper','PAPER_BINANCE_USDM','test-only','epoch',$3,'2026-09-01T00:00:00Z','PARTIAL',$4,1,$3,$5,1,'COMMITTED','2026-09-01T00:00:00Z')`,[batch,workspace,digest,epoch,revision]);
    await core.query(`INSERT INTO execution_durable_mirror_revisions(read_model_revision,batch_id,workspace_id,
      environment,profile_id,projection_epoch,projection_sequence,payload_digest,state,is_current)
      VALUES($1,$2,$3,'paper','PAPER_BINANCE_USDM',$4,1,$5,'COMMITTED',true)`,[revision,batch,workspace,epoch,digest]);
    await core.query(`INSERT INTO execution_durable_mirror_current_entities(workspace_id,environment,profile_id,
      relation_key,entity_key,account_id,source_row_digest,fields,first_observed_batch_id,last_observed_batch_id,
      last_read_model_revision,first_observed_at,last_observed_at)
      VALUES($1,'paper','PAPER_BINANCE_USDM','manager.accounts:accounts','account_udb','account_udb',$2,
      '{"account_id":"account_udb","exact":"1.000000000000000001"}',$3,$3,$4,'2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')`,[workspace,digest,batch,revision]);
    const prefix=join(dir,"current-entities");
    const current=await exportRetainedStore(core,workspace,"udb02-current-fixture",prefix,"current-entities");
    expect(current.lane).toBe("current-entities");expect(Object.keys(current.tables)).not.toContain("execution_durable_mirror_range_rows");
    await importRetainedStore(target,core,prefix);await importRetainedStore(target,core,prefix);
    const row=(await target.query("SELECT fields->>'exact' AS exact FROM execution_durable_mirror_current_entities WHERE workspace_id=$1",[workspace])).rows[0];
    expect(row.exact).toBe("1.000000000000000001");
    expect((await target.query("SELECT count(*)::int AS n FROM execution_durable_mirror_range_rows")).rows[0].n).toBe(0);
    expect((await target.query("SELECT count(*)::int AS n FROM execution_durable_mirror_current_entities WHERE workspace_id='ws_wrong' OR profile_id='LIVE_BINANCE_USDM'")).rows[0].n).toBe(0);
  });
});
