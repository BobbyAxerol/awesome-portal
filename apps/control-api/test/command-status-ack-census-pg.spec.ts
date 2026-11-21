/** TEST_ONLY SQL semantics on isolated PG; synthetic lease rows are not ACKs from Edge. */
import {createHash,randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {COMMAND_STATUS_ACK_CENSUS_SQL} from "../src/execution-v2/command-status-ack-census";
import {PgCommandStatusPreparations} from "../src/execution-v2/command-status-preparations";

const target=process.env.TEST_AUTHORITY_DATABASE_URL;
const enabled=process.env.PORTAL_TEST_RESTORE_CHECKPOINT==="TEST_ONLY_DISPOSABLE_TWO_CLUSTERS"&&!!target;
const hash=(s:string)=>`sha256:${createHash("sha256").update(s).digest("hex")}`;
describe.skipIf(!enabled)("STATUS restored-link ACK census, TEST_ONLY PG",()=>{
  let admin:Pool,db:Pool;
  const name=`portal_status_census_${randomBytes(4).toString("hex")}`;
  const original=hash("original"),call=hash("call"),binding=hash("binding"),request=hash("request"),terminal=hash("terminal");
  const args=(context:string)=>[context,original,call,binding,"owner","session",7,"workspace","workload"];
  async function link(context:string,sequence:number,lease:string,previous:string|null,req=request,
    extra:Partial<{nonce:string;authority:string;statusToken:string;statusRequest:string;statusIssued:number;receiver:string;expires:number}>={}) {
    await db.query(`INSERT INTO execution_command_status_context_links(context_digest,context_nonce,delivery_sequence,lease_id,
      previous_lease_id,original_digest,call_digest,binding_digest,authority_fingerprint,assertion_digest,status_token_digest,
      status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [context,extra.nonce??"A".repeat(43),sequence,lease,previous,original,call,binding,extra.authority??hash("other"),
        hash("other"),extra.statusToken??hash("other"),extra.statusRequest??hash("other"),extra.statusIssued??1,req,
        extra.receiver??"TEST_ONLY:receiver",extra.expires??9999999999999]);
  }
  async function lease(id:string,subject="owner",req=request) {
    await db.query(`INSERT INTO elp210_candidate.leases(lease_id,subject_id,session_id,session_revision,workspace_id,
      environment,workload_id,request_digest,terminal_receipt_digest,phase)
      VALUES($1,$2,'session',7,'workspace','paper','workload',$3,$4,'COMMITTED')`,
      [id,subject,req,terminal]);
  }
  async function ack(id:string,subject="owner",req=request) {
    await db.query(`INSERT INTO execution_command_status_delivery_acks(lease_id,workspace_id,subject_id,session_id,session_revision,
      environment,workload_id,request_digest,response_digest,terminal_receipt_digest)
      VALUES($1,'workspace',$2,'session',7,'paper','workload',$3,$4,$5)`,[id,subject,req,hash("response"),terminal]);
  }
  async function census(context:string) {return (await db.query(COMMAND_STATUS_ACK_CENSUS_SQL,args(context))).rows[0];}
  async function preparation(context:string) {
    await db.query(`INSERT INTO execution_command_status_preparations(context_digest,subject_id,session_id,session_revision,
      workspace_id,workload_id,original_digest,context_expires_at_ms,context_nonce,authority_fingerprint,
      status_token_digest,status_request_digest,status_issued_at_ms,receiver_id,pm_request_digest,call_digest,binding_digest)
      VALUES($1,'owner','session',7,'workspace','workload',$2,9999999999999,$3,$4,$4,$4,1,'TEST_ONLY:receiver',$5,$6,$7)`,
    [context,original,"A".repeat(43),hash("other"),request,call,binding]);
  }
  beforeAll(async()=>{
    if(!/^\/portal_restore_checkpoint_[a-f0-9]{8}$/.test(new URL(target!).pathname)||!/^portal_status_census_[a-f0-9]{8}$/.test(name))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    admin=new Pool({connectionString:target,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    await admin.query(`CREATE DATABASE "${name}"`);
    const url=new URL(target!);url.pathname=`/${name}`;
    db=new Pool({connectionString:url.toString(),max:4,connectionTimeoutMillis:2000,query_timeout:6000});
    for(const file of ["1723680000156_execution-command-status-delivery-acks.sql","1723680000157_execution-command-status-context-links.sql"]) {
      const sql=await readFile(join(__dirname,"../migrations",file),"utf8");
      if(!sql.includes("-- Down Migration"))throw new Error("TEST_ONLY_MIGRATION_INVALID");
      await db.query(sql.split("-- Down Migration")[0]);
    }
    // Only the columns consumed by the census are modelled here. Their values
    // and ACKs are synthetic; this is not a real authority or restore drill.
    await db.query(`CREATE SCHEMA elp210_candidate; CREATE TABLE elp210_candidate.leases(
      lease_id text PRIMARY KEY,subject_id text,session_id text,session_revision bigint,workspace_id text,
      environment text,workload_id text,request_digest text,terminal_receipt_digest text,phase text,human_assertion_digest text,
      c2_custody_binding_digest text,c2_p7_binding_digest text);
      CREATE TABLE elp210_candidate.authority(singleton boolean PRIMARY KEY,revision bigint,drain_id text);
      INSERT INTO elp210_candidate.authority VALUES(true,1,NULL);
      CREATE TABLE execution_command_status_preparations(context_digest text PRIMARY KEY,subject_id text,
        session_id text,session_revision bigint,workspace_id text,workload_id text,original_digest text,
        context_expires_at_ms bigint,consumed_at timestamptz,context_nonce text,authority_fingerprint text,
        status_token_digest text,status_request_digest text,status_issued_at_ms bigint,receiver_id text,
        pm_request_digest text,call_digest text,binding_digest text)`);
  });
  afterAll(async()=>{await db?.end();if(admin){try{await admin.query(`DROP DATABASE IF EXISTS "${name}"`);}finally{await admin.end();}}});
  it("counts an intact two-lease chain and rejects empty custody",async()=>{
    const context=hash("ok");await lease("ok-0");await ack("ok-0");await link(context,0,"ok-0",null);
    await lease("ok-1");await ack("ok-1");await link(context,1,"ok-1","ok-0");
    expect(await census(context)).toEqual({total:2,unresolved:0});
    expect(await census(hash("empty"))).toEqual({total:0,unresolved:0});
  });
  it("counts a missing restored lease instead of dropping it from the join",async()=>{
    const context=hash("missing");await lease("present");await ack("present");await link(context,0,"present",null);
    await link(context,1,"lost", "present");
    // Counterexample to the former INNER JOIN: the intact row makes the
    // incomplete restored context look fully acknowledged.
    const old=(await db.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM execution_command_status_delivery_acks a WHERE a.lease_id=l.lease_id
        AND a.subject_id=l.subject_id AND a.session_id=l.session_id AND a.session_revision=l.session_revision
        AND a.workspace_id=l.workspace_id AND a.environment=l.environment AND a.workload_id=l.workload_id
        AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
        AND l.phase IN ('COMMITTED','ROLLED_BACK')))::int AS unresolved
      FROM execution_command_status_context_links c JOIN elp210_candidate.leases l ON l.lease_id=c.lease_id
      WHERE c.context_digest=$1`,[context])).rows[0];
    expect(old).toEqual({total:1,unresolved:0});
    expect(await census(context)).toEqual({total:2,unresolved:1});
  });
  it("refuses a foreign requester, mismatched request, or absent ACK",async()=>{
    const context=hash("mismatch");
    await lease("foreign","different");await ack("foreign","different");await link(context,0,"foreign",null);
    await lease("wrong-request","owner",hash("other-request"));await ack("wrong-request","owner",hash("other-request"));
    await link(context,1,"wrong-request","foreign");
    await lease("no-ack");await link(context,2,"no-ack","wrong-request");
    expect(await census(context)).toEqual({total:3,unresolved:3});
  });
  it("rejects missing sequence and previous-lease lineage despite matching ACKs",async()=>{
    const context=hash("broken-lineage");await lease("gap-0");await ack("gap-0");await link(context,0,"gap-0",null);
    await lease("gap-2");await ack("gap-2");await link(context,2,"gap-2","not-gap-0");
    expect(await census(context)).toEqual({total:2,unresolved:1});
  });
  it("refuses cross-context metadata drift even when each linked lease has an ACK",async()=>{
    const cases=[
      {nonce:"B".repeat(43)}, {authority:hash("other-authority")}, {statusToken:hash("other-token")},
      {statusRequest:hash("other-status-request")}, {statusIssued:2}, {receiver:"TEST_ONLY:other-receiver"},
      {expires:9999999999998}, {request:hash("other-pm-request")},
    ];
    for(let i=0;i<cases.length;i++) {
      const context=hash(`drift-${i}`),first=`drift-${i}-0`,second=`drift-${i}-1`,variant=cases[i]!;
      const secondRequest="request" in variant && typeof variant.request==="string"?variant.request:request;
      await lease(first);await ack(first);await link(context,0,first,null);
      await lease(second,"owner",secondRequest);await ack(second,"owner",secondRequest);
      const {request: _request,...extra}=variant as typeof variant & {request?:string};
      await link(context,1,second,first,secondRequest,extra);
      expect(await census(context),`variant ${i}`).toEqual({total:2,unresolved:1});
      if(i===0) {
        await preparation(context);
        await expect(new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
          session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original},
        {call_digest:call,binding_digest:binding})).rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
        expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0].consumed_at).toBeNull();
      }
    }
  });
  it("does not consume an internally consistent chain bound to another preparation",async()=>{
    const cases=[
      {nonce:"B".repeat(43)}, {authority:hash("prep-other-authority")}, {statusToken:hash("prep-other-token")},
      {statusRequest:hash("prep-other-status")}, {statusIssued:2}, {receiver:"TEST_ONLY:other-receiver"},
      {expires:9999999999998}, {request:hash("prep-other-pm-request")},
    ];
    for(let i=0;i<cases.length;i++) {
      const context=hash(`preparation-drift-${i}`),first=`prep-drift-${i}-0`,second=`prep-drift-${i}-1`,variant=cases[i]!;
      const req="request" in variant && typeof variant.request==="string"?variant.request:request;
      const {request: _request,...extra}=variant as typeof variant & {request?:string};
      await preparation(context);
      await lease(first,"owner",req);await ack(first,"owner",req);await link(context,0,first,null,req,extra);
      await lease(second,"owner",req);await ack(second,"owner",req);await link(context,1,second,first,req,extra);
      expect(await census(context),`variant ${i}`).toEqual({total:2,unresolved:0});
      await expect(new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
        session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original},
      {call_digest:call,binding_digest:binding})).rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
      expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0].consumed_at).toBeNull();
    }
  });
  it("rechecks restored custody atomically under the ISSUE lock before consuming",async()=>{
    const context=hash("consume-race");
    await preparation(context);
    await lease("race-0");await ack("race-0");await link(context,0,"race-0",null);
    expect(await census(context)).toEqual({total:1,unresolved:0});
    const writer=await db.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT revision FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      const consumption=new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
        session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original},
      {call_digest:call,binding_digest:binding});
      // Observe the competing consumer waiting on the same lock; then commit
      // a linked-but-missing lease exactly between optimistic read and consume.
      let waiting=false;
      for(let i=0;i<20&&!waiting;i++) {
        const observed=await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%authority WHERE singleton FOR UPDATE%' AND pid<>pg_backend_pid()");
        waiting=observed.rowCount===1;
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
      await writer.query(`INSERT INTO execution_command_status_context_links(context_digest,context_nonce,delivery_sequence,lease_id,
        previous_lease_id,original_digest,call_digest,binding_digest,authority_fingerprint,assertion_digest,status_token_digest,
        status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
        VALUES($1,$2,1,'race-missing','race-0',$3,$4,$5,$6,$6,$6,$6,1,$7,'TEST_ONLY:receiver',9999999999999)`,
      [context,"A".repeat(43),original,call,binding,hash("other"),request]);
      await writer.query("COMMIT");
      await expect(consumption).rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
      expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0].consumed_at).toBeNull();
    } finally {await writer.query("ROLLBACK").catch(()=>{});writer.release();}
  });
  it("holds the selected preparation against an uncoordinated writer until consumption commits",async()=>{
    const context=hash("consume-preparation-race");
    await preparation(context);
    const locker=await db.connect(),writer=await db.connect();
    let consumption:Promise<void>|undefined;
    try {
      // Pause the real consume after it has selected the preparation, before
      // its custody census. The unrelated writer deliberately does not take
      // the cooperative authority singleton lock.
      await locker.query("BEGIN");
      await locker.query("LOCK TABLE execution_command_status_context_links IN ACCESS EXCLUSIVE MODE");
      consumption=new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
        session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original});
      let waiting=false;
      for(let i=0;i<40&&!waiting;i++) {
        const observed=await db.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%WITH ordered AS (%' AND pid<>pg_backend_pid()`);
        waiting=observed.rowCount===1;
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout='150ms'");
      await expect(writer.query("UPDATE execution_command_status_preparations SET subject_id='foreign' WHERE context_digest=$1",
        [context])).rejects.toMatchObject({code:"55P03"});
      await writer.query("ROLLBACK");
      await locker.query("COMMIT");
      await expect(consumption).resolves.toBeUndefined();
      const row=(await db.query("SELECT subject_id,consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0];
      expect(row.subject_id).toBe("owner");expect(row.consumed_at).not.toBeNull();
    } finally {
      await writer.query("ROLLBACK").catch(()=>{});writer.release();
      await locker.query("ROLLBACK").catch(()=>{});locker.release();
      await consumption?.catch(()=>{});
    }
  });
  it("refuses a suppressed preparation update instead of reporting successful consumption",async()=>{
    const context=hash("consume-suppressed");await preparation(context);
    // Fault injection only: a BEFORE trigger that suppresses the UPDATE.
    // Production is not expected to have this trigger, but an unexpected
    // zero-row update must never be reported as a successful local receipt.
    await db.query(`CREATE FUNCTION test_only_suppress_preparation_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RETURN NULL; END $$;
      CREATE TRIGGER test_only_suppress_preparation_update BEFORE UPDATE ON execution_command_status_preparations
      FOR EACH ROW EXECUTE FUNCTION test_only_suppress_preparation_update()`);
    try {
      await expect(new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
        session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original}))
        .rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_MISMATCH"});
      expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0].consumed_at).toBeNull();
    } finally {
      await db.query("DROP TRIGGER test_only_suppress_preparation_update ON execution_command_status_preparations");
      await db.query("DROP FUNCTION test_only_suppress_preparation_update()");
    }
  });
  it("consumes an intact restored chain and refuses a missing lease even without a restored flag",async()=>{
    const intact=hash("consume-intact"),missing=hash("consume-missing");
    for(const context of [intact,missing])await preparation(context);
    await lease("consume-ok");await ack("consume-ok");await link(intact,0,"consume-ok",null);
    await link(missing,0,"consume-lost",null);
    const preparations=new PgCommandStatusPreparations(db,8);
    const input=(context_digest:string)=>({context_digest,subject_id:"owner",session_id:"session",session_revision:7,
      workspace_id:"workspace",workload_id:"workload",original_digest:original});
    await expect(preparations.consume(input(intact),{call_digest:call,binding_digest:binding})).resolves.toBeUndefined();
    await expect(preparations.consume(input(missing))).rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
  });
  it("rechecks linked custody for a live context without blocking a no-issue read",async()=>{
    const badMetadata=hash("live-bad-metadata"),badLineage=hash("live-bad-lineage"),
      intact=hash("live-intact"),noIssue=hash("live-no-issue");
    for(const context of [badMetadata,badLineage,intact,noIssue])await preparation(context);
    await lease("live-meta");await ack("live-meta");
    await link(badMetadata,0,"live-meta",null,request,{nonce:"B".repeat(43)});
    await lease("live-gap-0");await ack("live-gap-0");await link(badLineage,0,"live-gap-0",null);
    await lease("live-gap-2");await ack("live-gap-2");await link(badLineage,2,"live-gap-2","live-gap-0");
    await lease("live-ok");await ack("live-ok");await link(intact,0,"live-ok",null);
    const preparations=new PgCommandStatusPreparations(db,8);
    const input=(context_digest:string)=>({context_digest,subject_id:"owner",session_id:"session",session_revision:7,
      workspace_id:"workspace",workload_id:"workload",original_digest:original});
    for(const context of [badMetadata,badLineage]) {
      await expect(preparations.consume(input(context))).rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
      expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[context])).rows[0].consumed_at).toBeNull();
    }
    await expect(preparations.consume(input(intact))).resolves.toBeUndefined();
    await expect(preparations.consume(input(noIssue))).resolves.toBeUndefined();
  });
  it("refuses a C2 link bound to a different assertion than its retained lease",async()=>{
    const good=hash("c2-assertion-good"),bad=hash("c2-assertion-bad");
    for(const context of [good,bad])await preparation(context);
    await lease("c2-good");await ack("c2-good");await link(good,0,"c2-good",null);
    await lease("c2-bad");await ack("c2-bad");await link(bad,0,"c2-bad",null);
    // Synthetic C2 leases keep the assertion digest; the link's default is
    // hash("other"). Legacy leases with NULL remain supported by prior tests.
    await db.query("UPDATE elp210_candidate.leases SET human_assertion_digest=$2 WHERE lease_id=$1",["c2-good",hash("other")]);
    await db.query("UPDATE elp210_candidate.leases SET human_assertion_digest=$2 WHERE lease_id=$1",["c2-bad",hash("wrong-assertion")]);
    expect(await census(good)).toEqual({total:1,unresolved:0});
    expect(await census(bad)).toEqual({total:1,unresolved:1});
    const input={context_digest:bad,subject_id:"owner",session_id:"session",session_revision:7,
      workspace_id:"workspace",workload_id:"workload",original_digest:original};
    await expect(new PgCommandStatusPreparations(db,8).consume(input))
      .rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
    expect((await db.query("SELECT consumed_at FROM execution_command_status_preparations WHERE context_digest=$1",[bad])).rows[0].consumed_at).toBeNull();
    await expect(new PgCommandStatusPreparations(db,8).consume({...input,context_digest:good})).resolves.toBeUndefined();
  });
  it("rejects a marked C2 lease whose assertion digest is missing",async()=>{
    for(const marker of ["c2_p7_binding_digest","c2_custody_binding_digest"] as const) {
      const leaseId=`c2-missing-${marker}`,context=hash(leaseId);
      await preparation(context);await lease(leaseId);await ack(leaseId);await link(context,0,leaseId,null);
      await db.query(`UPDATE elp210_candidate.leases SET ${marker}=$2 WHERE lease_id=$1`,[leaseId,hash("marker")]);
      expect(await census(context)).toEqual({total:1,unresolved:1});
      await expect(new PgCommandStatusPreparations(db,8).consume({context_digest:context,subject_id:"owner",
        session_id:"session",session_revision:7,workspace_id:"workspace",workload_id:"workload",original_digest:original}))
        .rejects.toMatchObject({code:"COMMAND_STATUS_PREPARATION_LEASE_RECOVERY_REQUIRED"});
    }
  });
});
