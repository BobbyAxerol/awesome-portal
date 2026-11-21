/** Disposable synthetic DB only. No HTTP, source proof, delivery or ACK. */
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrateTestDatabase} from "./harness";

const database=process.env.TEST_DATABASE_URL;
describe.skipIf(!database||process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS")
  ("C2 delivery obligation source-only disposable PG",()=>{
  let pool:Pool,expiry:number;
  const workspace="TEST_ONLY-delivery-workspace",owner="TEST_ONLY-delivery-owner",workload="TEST_ONLY-delivery-source";
  const requestDigest=`sha256:${"1".repeat(64)}`,bodyDigest=`sha256:${"2".repeat(64)}`;
  const original=(digit:string)=>`sha256:${digit.repeat(64)}`;
  beforeAll(async()=>{
    const target=new URL(database!);
    if(!/^\/portal_restore_rls_[a-f0-9]{8}$/.test(target.pathname))throw new Error("C2_DELIVERY_DB_NOT_DEDICATED");
    const guard=new Pool({connectionString:database,connectionTimeoutMillis:2000,query_timeout:6000});
    try {
      const observed=await guard.query("SELECT current_database() AS name,to_regnamespace('elp210_candidate') AS existing");
      if(observed.rows[0]?.name!==target.pathname.slice(1)||observed.rows[0]?.existing!==null)
        throw new Error("C2_DELIVERY_DB_NOT_DEDICATED");
    } finally {await guard.end();}
    await migrateTestDatabase(database!);
    pool=new Pool({connectionString:database,max:4,connectionTimeoutMillis:2000,query_timeout:6000});
    for(const file of ["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql",
      "c2-block-new-fence-candidate.sql","c2-delivery-obligation-candidate.sql"])
      await pool.query(await readFile(join(__dirname,"../src/execution-v2",file),"utf8"));
    expiry=Date.now()+55000;
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('TEST_ONLY-registration',$1,$2,$3,'TEST_ONLY-app',0,'ACTIVE',$4)`,["a".repeat(64),workspace,owner,expiry]);
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('TEST_ONLY-registration',$1,$2,$3,$4,'OPEN')`,["a".repeat(64),workspace,owner,workload]);
    await pool.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(3,2)");
    for(const lease of ["TEST_ONLY-lease-1","TEST_ONLY-lease-2","TEST_ONLY-lease-3"]) {
      const now=Date.now();
      await pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES($1,0,$2,'TEST_ONLY-session',1,$3,'paper',$4,$5,'TEST_ONLY-fingerprint',$6,$7)`,
      [lease,owner,workspace,workload,requestDigest,now,expiry]);
    }
  },120000);
  afterAll(async()=>{await pool?.end();});
  const reserve=(lease:string,orig:string,request=requestDigest)=>pool.query(`INSERT INTO elp210_c2_delivery_candidate.obligations
    (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
    VALUES($1,$2,$3,$4,$5,$6,$7,128,$8,'RESERVED')`,[lease,workspace,owner,workload,request,orig,bodyDigest,expiry]);
  // Direct-DML fixture only: give the guard the same session binding the
  // restricted procedure would establish. This is not an application writer.
  const sendingSql=`WITH token AS MATERIALIZED (SELECT set_config('portal.c2_send_token',$2,false))
    UPDATE elp210_c2_delivery_candidate.obligations SET state='SENDING',sender_backend_pid=pg_backend_pid(),sender_claim_xid=pg_current_xact_id(),
      sender_token_sha256=encode(sha256(convert_to($2,'UTF8')),'hex') FROM token WHERE lease_id=$1`;
  const sendingArgs=(lease:string)=>[lease,"a".repeat(64)];

  it("binds exact lease/request/original, appends immutable states and never retries UNKNOWN",async()=>{
    await expect(reserve("TEST_ONLY-lease-1",original("a"),`sha256:${"3".repeat(64)}`)).rejects.toThrow("C2_DELIVERY_BINDING_OR_FENCE_INVALID");
    await reserve("TEST_ONLY-lease-1",original("a"));
    await pool.query(sendingSql,sendingArgs("TEST_ONLY-lease-1"));
    await pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST_ONLY-lease-1'");
    await expect(pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='SENDING' WHERE lease_id='TEST_ONLY-lease-1'"))
      .rejects.toThrow("C2_DELIVERY_TRANSITION_INVALID");
    await expect(reserve("TEST_ONLY-lease-2",original("a"))).rejects.toThrow();
    await expect(pool.query("DELETE FROM elp210_c2_delivery_candidate.obligations WHERE lease_id='TEST_ONLY-lease-1'")).rejects.toThrow();
    await expect(pool.query("TRUNCATE elp210_c2_delivery_candidate.events")).rejects.toThrow();
    const events=await pool.query("SELECT state FROM elp210_c2_delivery_candidate.events ORDER BY event_id");
    expect(events.rows.map(r=>r.state)).toEqual(["RESERVED","SENDING","UNKNOWN"]);
  });
  it("refuses SENDING when registration expires before an older lease",async()=>{
    const tx=await pool.connect();
    try {
      await tx.query("BEGIN");
      const shortExpiry=Date.now()+1200;
      const shortWorkspace="TEST_ONLY-short-workspace",shortOwner="TEST_ONLY-short-owner",shortWorkload="TEST_ONLY-short-source";
      await tx.query(`INSERT INTO elp210_c2_p7_candidate.registrations
        (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
        VALUES('TEST_ONLY-short-registration',$1,$2,$3,'TEST_ONLY-app',0,'ACTIVE',$4)`,["b".repeat(64),shortWorkspace,shortOwner,shortExpiry]);
      await tx.query(`INSERT INTO elp210_c2_fence_candidate.scopes
        (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
        VALUES('TEST_ONLY-short-registration',$1,$2,$3,$4,'OPEN')`,["b".repeat(64),shortWorkspace,shortOwner,shortWorkload]);
      const now=Date.now(),longExpiry=now+30000;
      await tx.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES('TEST_ONLY-short-lease',0,$1,'TEST_ONLY-session',1,$2,'paper',$3,$4,'TEST_ONLY-fingerprint',$5,$6)`,
      [shortOwner,shortWorkspace,shortWorkload,requestDigest,now,longExpiry]);
      await tx.query("SAVEPOINT long_delivery");
      await expect(tx.query(`INSERT INTO elp210_c2_delivery_candidate.obligations
        (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
        VALUES('TEST_ONLY-short-lease',$1,$2,$3,$4,$5,$6,128,$7,'RESERVED')`,
      [shortWorkspace,shortOwner,shortWorkload,requestDigest,original("d"),bodyDigest,longExpiry]))
        .rejects.toThrow("C2_DELIVERY_BINDING_OR_FENCE_INVALID");
      await tx.query("ROLLBACK TO SAVEPOINT long_delivery");
      await tx.query(`INSERT INTO elp210_c2_delivery_candidate.obligations
        (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
        VALUES('TEST_ONLY-short-lease',$1,$2,$3,$4,$5,$6,128,$7,'RESERVED')`,
      [shortWorkspace,shortOwner,shortWorkload,requestDigest,original("d"),bodyDigest,shortExpiry]);
      await tx.query("SELECT pg_sleep(1.3)");
      await tx.query("SAVEPOINT expired_send");
      await expect(tx.query(sendingSql,sendingArgs("TEST_ONLY-short-lease")))
        .rejects.toThrow("C2_DELIVERY_BINDING_OR_FENCE_INVALID");
      await tx.query("ROLLBACK TO SAVEPOINT expired_send");
      await tx.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST_ONLY-short-lease'");
      expect((await tx.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id='TEST_ONLY-short-lease'"))
        .rows[0].state).toBe("UNKNOWN");
      await tx.query("ROLLBACK");
    } finally {await tx.query("ROLLBACK").catch(()=>{});tx.release();}
  });
  it("counts UNKNOWN against bounded capacity instead of freeing it on time or local finish",async()=>{
    await reserve("TEST_ONLY-lease-2",original("b"));
    await expect(reserve("TEST_ONLY-lease-3",original("c"))).rejects.toThrow("C2_DELIVERY_CAPACITY");
    await expect(pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='FINISHED' WHERE lease_id='TEST_ONLY-lease-2'"))
      .rejects.toThrow();
  });
  it("refuses SENDING after authority revision changes or drain begins",async()=>{
    const tx=await pool.connect();
    try {
      for(const change of ["revision=revision+1", "drain_id='TEST_ONLY-drain'"]) {
        await tx.query("BEGIN");
        await tx.query(`UPDATE elp210_candidate.authority SET ${change} WHERE singleton`);
        await tx.query("SAVEPOINT fenced_send");
        await expect(tx.query(sendingSql,sendingArgs("TEST_ONLY-lease-2")))
          .rejects.toThrow("C2_DELIVERY_BINDING_OR_FENCE_INVALID");
        await tx.query("ROLLBACK TO SAVEPOINT fenced_send");
        await tx.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST_ONLY-lease-2'");
        expect((await tx.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id='TEST_ONLY-lease-2'"))
          .rows[0].state).toBe("UNKNOWN");
        await tx.query("ROLLBACK");
      }
    } finally {await tx.query("ROLLBACK").catch(()=>{});tx.release();}
    expect((await pool.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id='TEST_ONLY-lease-2'"))
      .rows[0].state).toBe("RESERVED");
  });
  it("serializes SENDING against atomic revoke and leaves unsent original UNKNOWN",async()=>{
    const revoke=await pool.connect();let sending:Promise<string>|undefined;
    try {
      await revoke.query("BEGIN");
      await revoke.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      await revoke.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='TEST_ONLY-registration'");
      sending=pool.query(sendingSql,sendingArgs("TEST_ONLY-lease-2"))
        .then(()=>"unexpected send",()=>"blocked");
      let waiting=false;
      for(let i=0;i<40;i++) {
        const activity=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%UPDATE elp210_c2_delivery_candidate.obligations%'`);
        if(activity.rows[0].n>0){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);await revoke.query("COMMIT");expect(await sending).toBe("blocked");
      await pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id='TEST_ONLY-lease-2'");
      expect((await pool.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id='TEST_ONLY-lease-2'")).rows[0].state).toBe("UNKNOWN");
    } finally {await revoke.query("ROLLBACK").catch(()=>{});revoke.release();await sending?.catch(()=>{});}
  });
});
