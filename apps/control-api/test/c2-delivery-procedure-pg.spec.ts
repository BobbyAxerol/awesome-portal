/** Disposable synthetic ACL/lock and loopback HTTP test; no authentic source or human. */
import {createHash,generateKeyPairSync,randomBytes,randomUUID,X509Certificate} from "node:crypto";
import {fork} from "node:child_process";
import {once} from "node:events";
import {readFile} from "node:fs/promises";
import {createServer,get} from "node:http";
import {request as httpsRequest} from "node:https";
import {join} from "node:path";
import {Pool} from "pg";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrateTestDatabase} from "./harness";
import {deliverC2TestResponse} from "../src/execution-v2/c2-p7-http-delivery-candidate";
import {createC2TestStatusDelivery} from "../src/execution-v2/c2-status-http-delivery-test-candidate";
import {createCommandSourceAssertionTestCustodyTransport} from "../src/execution-v2/command-source-assertion-transport";
import {accessDigest} from "../src/execution-v2/access-digest";
import {commonName,testCertificate,type TestAuthority} from "./fixtures/elp210-test-certificates";

const database=process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("TEST_ONLY delivery authority-first procedure",()=>{
  let admin:Pool,caller:Pool,login:string,expiry:number,authorityRevision:number,duplicateScopeRejected=false;
  const p7Intent=randomUUID(),p7Lease="TEST-lease-p7",p7Second="TEST-lease-p7-2",p7Third="TEST-lease-p7-3",p7Gap="TEST-lease-p7-gap";
  const statusHttpLease="TEST-status-http",contextToken="T".repeat(43),httpAssertion="TEST_ONLY_status_assertion";
  let httpIssued:number,httpExpiry:number;
  const request=`sha256:${"1".repeat(64)}`,payload=`sha256:${"2".repeat(64)}`,registration="a".repeat(64);
  const original=(digit:string)=>`sha256:${digit.repeat(64)}`;
  const args=(action:string,lease:string,orig:string)=>[action,lease,"TEST-workspace","TEST-owner","TEST-source",request,orig,payload,128,expiry,"TEST-reg",registration];
  const call="SELECT elp210_c2_delivery_candidate.apply_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS result";
  beforeAll(async()=>{
    const url=new URL(database!);
    if(process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS"||
      !["postgres:","postgresql:"].includes(url.protocol)||!/^\/portal_restore_rls_[a-f0-9]{8}$/.test(url.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const guard=new Pool({connectionString:database,connectionTimeoutMillis:2000,query_timeout:6000});
    try{
      const r=await guard.query("SELECT current_database() AS name,to_regnamespace('elp210_candidate') AS existing");
      if(r.rows[0].name!==url.pathname.slice(1)||r.rows[0].existing!==null)throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    }finally{await guard.end();}
    await migrateTestDatabase(database!);
    admin=new Pool({connectionString:database,max:5,connectionTimeoutMillis:2000,query_timeout:12000});
    login=`test_delivery_app_${randomBytes(6).toString("hex")}`;
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    const sql=["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql",
      "c2-p7-owner-intent-candidate.sql","c2-b2-custody.sql","c2-block-new-fence-candidate.sql",
      "c2-block-new-procedure-acl-candidate.sql","c2-delivery-obligation-candidate.sql","c2-delivery-procedure-acl-candidate.sql"];
    for(const name of sql)await admin.query(await readFile(join(__dirname,"../src/execution-v2",name),"utf8"));
    expiry=Date.now()+55000;
    await admin.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES('TEST-owner','TEST-owner','TEST','USER','ACTIVE',false,7)");
    await admin.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
      VALUES('TEST-session','TEST-token','TEST-owner','ACTIVE','TEST-csrf',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`);
    await admin.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER','TEST-owner')");
    await admin.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES('TEST-workspace','TEST','TEST-owner')");
    authorityRevision=Number((await admin.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision);
    await admin.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-app',$3,'ACTIVE',$2)`,[registration,expiry,authorityRevision]);
    await admin.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner','TEST-source','OPEN')`,[registration]);
    await admin.query(`INSERT INTO elp210_c2_fence_candidate.procedure_scope_pin
      (registration_key,registration_sha256,workspace_id,owner_user_id) VALUES('TEST-reg',$1,'TEST-workspace','TEST-owner')`,[registration]);
    // The source schema has UNIQUE(workspace,owner,workload); prove that a
    // second registration cannot silently attach a competing scope.
    for(const [reg,hash] of [["TEST-ambiguous-1","b".repeat(64)],["TEST-ambiguous-2","c".repeat(64)]]){
      await admin.query(`INSERT INTO elp210_c2_p7_candidate.registrations
        (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
        VALUES($1,$2,'TEST-workspace','TEST-ambiguous-owner','TEST-app',$4,'ACTIVE',$3)`,[reg,hash,expiry,authorityRevision]);
      try {
        await admin.query(`INSERT INTO elp210_c2_fence_candidate.scopes
          (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
          VALUES($1,$2,'TEST-workspace','TEST-ambiguous-owner','TEST-ambiguous-source','OPEN')`,[reg,hash]);
        if(reg==="TEST-ambiguous-2")throw new Error("TEST_DUPLICATE_SCOPE_WAS_ACCEPTED");
      } catch(error) {
        const candidate=error as {code?:string;constraint?:string};
        if(reg!=="TEST-ambiguous-2"||candidate.code!=="23505"||
          candidate.constraint!=="scopes_workspace_id_owner_user_id_workload_id_key")throw error;
        duplicateScopeRejected=true;
      }
    }
    // Begin P5 capture after synthetic public identity setup, with a clean
    // baseline; do not suppress its unrecorded-revision issuance fence.
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/c2-p5-revision-outbox.sql"),"utf8"));
    await admin.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(10,10)");
    for(const lease of ["TEST-lease-1","TEST-lease-2","TEST-lease-3","TEST-lease-crash"])await admin.query(`INSERT INTO elp210_candidate.leases
      (lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES($1,$5,'TEST-owner','TEST-session',7,'TEST-workspace','paper','TEST-source',$2,'TEST-fingerprint',$3,$4)`,
      [lease,request,Date.now(),expiry,authorityRevision]);
    // Populate synthetic P7 originals before enabling the local generation
    // fence; the database owner is intentionally NOT an admitted writer.
    const b1="9".repeat(64),cycle="8".repeat(64);
    await admin.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents
      (intent_id,proof_sha256,idempotency_sha256,action,workspace_id,owner_user_id,session_id,session_generation,
       registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms)
      VALUES($1,$2,$3,'REGISTER','TEST-workspace','TEST-owner','TEST-session',7,'TEST-reg',$4,$5,$6,'{}',$7,$8)`,
      [p7Intent,"5".repeat(64),"6".repeat(64),registration,"4".repeat(64),b1,authorityRevision,expiry]);
    await admin.query(`INSERT INTO elp210_c2_p7_candidate.records
      (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,
       delegation_json,delegation_sha256,owner_intent_id,confirmation_sha256)
      VALUES($1,$2,$3,$4,$5,'{}',$6,'{}',$7,$8,$9)`,[cycle,"3".repeat(64),b1,randomUUID(),randomUUID(),
      "2".repeat(64),"1".repeat(64),p7Intent,"a".repeat(64)]);
    const statusLease="TEST-status-lease";
    for(const id of [p7Lease,p7Second,p7Third,p7Gap,statusLease])await admin.query(`INSERT INTO elp210_candidate.leases
      (lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
       request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,c2_p7_binding_digest,c2_p7_owner_intent_id,
       c2_custody_binding_digest,human_assertion_digest)
      VALUES($1,$2,'TEST-owner','TEST-session',7,'TEST-workspace','paper','TEST-source',$3,'TEST-fingerprint',$4,$5,$6,$7,$8,$9)`,
      [id,authorityRevision,request,Date.now(),expiry,`sha256:${"7".repeat(64)}`,p7Intent,
        `sha256:${"8".repeat(64)}`,`sha256:${"9".repeat(64)}`]);
    httpIssued=Date.now();httpExpiry=Math.min(httpIssued+30000,expiry);
    await admin.query(`INSERT INTO elp210_candidate.leases
      (lease_id,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
       request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,c2_p7_binding_digest,c2_p7_owner_intent_id,
       c2_custody_binding_digest,human_assertion_digest)
      VALUES($1,$2,'TEST-owner','TEST-session',7,'TEST-workspace','paper','TEST-source',$3,'TEST-fingerprint',$4,$5,$6,$7,$8,$9)`,
    [statusHttpLease,authorityRevision,request,httpIssued,httpExpiry,`sha256:${"7".repeat(64)}`,p7Intent,
      `sha256:${"8".repeat(64)}`,accessDigest(httpAssertion)]);
    // Synthetic immutable STATUS link; the procedure must derive these two
    // fields from the lease, not accept them from its restricted caller.
    await admin.query(`INSERT INTO execution_command_status_context_links
      (context_digest,context_nonce,delivery_sequence,lease_id,previous_lease_id,original_digest,call_digest,binding_digest,
       authority_fingerprint,assertion_digest,status_token_digest,status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
      VALUES($1,$2,0,$3,NULL,$4,$5,$5,$5,$6,$5,$5,$7,$8,'TEST-receiver',$9)`,
      [`sha256:${"3".repeat(64)}`,"a".repeat(43),statusLease,original("4"),`sha256:${"5".repeat(64)}`,
        `sha256:${"9".repeat(64)}`,Date.now()-1000,request,expiry]);
    await admin.query(`INSERT INTO execution_command_status_context_links
      (context_digest,context_nonce,delivery_sequence,lease_id,previous_lease_id,original_digest,call_digest,binding_digest,
       authority_fingerprint,assertion_digest,status_token_digest,status_request_digest,status_issued_at_ms,request_digest,receiver_id,context_expires_at_ms)
      VALUES($1,$2,0,$3,NULL,$4,$5,$5,$5,$6,$5,$5,$7,$8,'TEST-receiver',$9)`,
    [accessDigest(contextToken),"b".repeat(43),statusHttpLease,original("6"),original("5"),accessDigest(httpAssertion),
      httpIssued,request,httpExpiry]);
    // TEST ONLY: a narrow synthetic revoke entry point used to exercise the
    // exact admitted session_user under the generation fence. No source or
    // real owner authorization is represented by this function.
    await admin.query(`CREATE FUNCTION elp210_c2_p7_candidate.test_only_revoke(p_intent uuid) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
        UPDATE elp210_candidate.authority SET drain_id=drain_id WHERE singleton;
        INSERT INTO elp210_c2_p7_candidate.owner_intent_revocations(intent_id,actor_user_id) VALUES(p_intent,'TEST-owner');
      END $$;
      REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.test_only_revoke(uuid) FROM PUBLIC;
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO ${login};
      GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.test_only_revoke(uuid) TO ${login}`);
    for(const name of ["restore-local-generation-fence-candidate.sql","restore-local-generation-c2-extension-candidate.sql",
      "restore-local-generation-delivery-extension-candidate.sql"])
      await admin.query(await readFile(join(__dirname,"../src/execution-v2",name),"utf8"));
    const suffix=url.pathname.slice(-8);
    await admin.query(`GRANT test_delivery_caller_${suffix},test_c2_caller_${suffix} TO ${login}`);
    const role=(await admin.query("SELECT oid::text AS oid FROM pg_roles WHERE rolname=$1",[login])).rows[0].oid;
    await admin.query("SELECT portal_local_write_fence.rotate(0,$1::oid)",[role]);
    const u=new URL(database!);u.username=login;u.password="TEST_ONLY_PASSWORD";
    caller=new Pool({connectionString:u.toString(),max:4,connectionTimeoutMillis:2000,query_timeout:12000});
    await caller.query(call,args("RESERVE","TEST-lease-1",original("a")));
    await caller.query(call,args("RESERVE","TEST-lease-2",original("b")));
    // Upgrade the candidate only after legacy obligations exist; preserve the
    // exact rows and keep the restricted generic procedure usable afterward.
    const before=(await admin.query(`SELECT lease_id,original_digest,state FROM elp210_c2_delivery_candidate.obligations
      ORDER BY lease_id`)).rows;
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/c2-status-delivery-sequence-candidate.sql"),"utf8"));
    expect((await admin.query(`SELECT has_function_privilege($1,
      'elp210_c2_delivery_candidate.guard_status_sequence()','EXECUTE') AS allowed`,[login])).rows[0].allowed).toBe(false);
    // Qualification of this read-only grant is deliberately confined to the
    // test NOLOGIN definer; it is not a production role or source grant.
    await admin.query(`GRANT SELECT ON execution_command_status_context_links,execution_command_status_delivery_acks
      TO test_delivery_definer_${suffix}`);
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/c2-status-reader-acl-candidate.sql"),"utf8"));
    const after=(await admin.query(`SELECT lease_id,original_digest,state,status_context_digest,status_delivery_sequence
      FROM elp210_c2_delivery_candidate.obligations ORDER BY lease_id`)).rows;
    expect(after).toEqual(before.map(row=>({...row,status_context_digest:null,status_delivery_sequence:null})));
    expect((await caller.query(call,args("RESERVE",statusLease,original("4")))).rows[0].result).toBe("RESERVED_NOT_DELIVERED");
    expect((await admin.query(`SELECT status_context_digest,status_delivery_sequence FROM elp210_c2_delivery_candidate.obligations
      WHERE lease_id=$1`,[statusLease])).rows[0]).toEqual({status_context_digest:`sha256:${"3".repeat(64)}`,status_delivery_sequence:0});
  },120000);
  afterAll(async()=>{await caller?.end();await admin?.end();});

  it("denies raw DML, unsafe inherited DML, bad binding and repeat original",async()=>{
    expect(duplicateScopeRejected).toBe(true);
    const readStatus=`SELECT * FROM elp210_c2_delivery_candidate.read_status_candidate(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`;
    const readerArgs=[accessDigest(contextToken),0,statusHttpLease,null,original("5"),"TEST-receiver",request,
      accessDigest(httpAssertion),httpIssued,httpExpiry,authorityRevision,"TEST-workspace","TEST-owner","TEST-source"];
    await expect(caller.query("SELECT original_digest FROM execution_command_status_context_links"))
      .rejects.toThrow(/permission denied/i);
    await expect(caller.query("SELECT human_assertion_digest FROM elp210_candidate.leases"))
      .rejects.toThrow(/permission denied/i);
    expect((await caller.query(readStatus,readerArgs)).rows).toEqual([
      {original_digest:original("6"),expires_at_ms:String(httpExpiry)}]);
    const mismatches: [number,unknown][]=[
      [0,original("7")],[1,1],[2,"TEST-wrong-lease"],[3,"TEST-wrong-previous"],
      [4,original("7")],[5,"TEST-wrong-receiver"],[6,original("7")],[7,original("7")],
      [8,httpIssued-1],[9,httpExpiry-1],[10,authorityRevision+1],
      [11,"TEST-wrong-workspace"],[12,"TEST-wrong-owner"],[13,"TEST-wrong-workload"]];
    for(const [index,value] of mismatches) {
      const changed=[...readerArgs];changed[index]=value;
      expect((await caller.query(readStatus,changed)).rows,`mismatch at input ${index}`).toEqual([]);
    }
    // Even a reachable NOINHERIT role with metadata SELECT is refused; it
    // cannot be treated as the bounded reader merely because it is inactive.
    const readBridge=`test_status_read_${randomBytes(5).toString("hex")}`;
    await admin.query(`CREATE ROLE ${readBridge} NOLOGIN NOINHERIT`);
    try {
      await admin.query(`GRANT SELECT ON public.execution_command_status_context_links TO ${readBridge}; GRANT ${readBridge} TO ${login}`);
      await expect(caller.query(readStatus,readerArgs)).rejects.toThrow("C2_STATUS_READER_UNSAFE_CALLER");
    } finally {
      await admin.query(`REVOKE ${readBridge} FROM ${login}; REVOKE SELECT ON public.execution_command_status_context_links FROM ${readBridge}; DROP ROLE ${readBridge}`);
    }
    await expect(caller.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN'")).rejects.toThrow(/permission denied/i);
    // Both newly consulted STATUS tables are part of the authorization
    // boundary: the delivery caller must not be able to forge links or ACKs.
    for(const [table,column] of [["execution_command_status_context_links","receiver_id"],
      ["execution_command_status_delivery_acks","response_digest"]]) {
      for(const privilege of ["INSERT",`UPDATE (${column})`]) {
        await admin.query(`GRANT ${privilege} ON public.${table} TO ${login}`);
        try {
          await expect(caller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
            .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
        } finally {await admin.query(`REVOKE ${privilege} ON public.${table} FROM ${login}`);}
      }
    }
    // NOINHERIT is not isolation: the login may SET ROLE through this chain.
    // Check every reachable role, not merely the login's effective grants.
    const bridge=`test_status_bridge_${randomBytes(5).toString("hex")}`;
    const parent=`test_status_parent_${randomBytes(5).toString("hex")}`;
    const deliveryCaller=`test_delivery_caller_${new URL(database!).pathname.slice(-8)}`;
    await admin.query(`CREATE ROLE ${bridge} NOLOGIN NOINHERIT; CREATE ROLE ${parent} NOLOGIN`);
    try {
      await admin.query(`GRANT INSERT ON public.execution_command_status_delivery_acks TO ${parent}`);
      await admin.query(`GRANT ${deliveryCaller} TO ${parent}; GRANT ${parent} TO ${bridge}; GRANT ${bridge} TO ${login}`);
      const flags=(await admin.query(`SELECT pg_has_role($1,$2,'MEMBER') AS reachable,
        has_table_privilege($1,'public.execution_command_status_delivery_acks','INSERT') AS effective`,[login,parent])).rows[0];
      expect(flags).toEqual({reachable:true,effective:false});
      await expect(caller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
        .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
      const switched=await caller.connect();
      try {
        await switched.query(`SET ROLE ${parent}`);
        expect((await switched.query(`SELECT has_table_privilege(current_user,
          'public.execution_command_status_delivery_acks','INSERT') AS allowed`)).rows[0].allowed).toBe(true);
        await expect(switched.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
          .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
      } finally {await switched.query("RESET ROLE").catch(()=>{});switched.release();}
    } finally {
      await admin.query(`REVOKE ${bridge} FROM ${login}; REVOKE ${parent} FROM ${bridge};
        REVOKE ${deliveryCaller} FROM ${parent}; REVOKE INSERT ON public.execution_command_status_delivery_acks FROM ${parent};
        DROP ROLE ${bridge}; DROP ROLE ${parent}`);
    }
    // A parameter-level SET grant can disable ordinary triggers and foreign
    // keys without making the login a superuser.  The security-definer must
    // reject that caller even before it can reserve an unbound lease.
    await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${login}`);
    const parameterCaller=await caller.connect();
    try {
      await expect(parameterCaller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
        .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
      await parameterCaller.query("SET session_replication_role = replica");
      await expect(parameterCaller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
        .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
      // REVOKE does not reset an already-set session parameter.
      await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${login}`);
      await expect(parameterCaller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
        .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
    } finally {
      await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${login}`);
      // Discard a session whose parameter privilege was revoked; it cannot
      // safely reset the privileged setting itself.
      parameterCaller.release(true);
    }
    const replicationRole=`test_replication_${randomBytes(5).toString("hex")}`;
    await admin.query(`CREATE ROLE ${replicationRole} NOLOGIN NOINHERIT`);
    try {
      await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${replicationRole}`);
      await admin.query(`GRANT ${replicationRole} TO ${login}`);
      await expect(caller.query(call,args("RESERVE","TEST-no-such-lease",original("d"))))
        .rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
    } finally {
      await admin.query(`REVOKE ${replicationRole} FROM ${login}`);
      await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${replicationRole}`);
      await admin.query(`DROP ROLE ${replicationRole}`);
    }
    await admin.query(`GRANT SET ON PARAMETER session_replication_role TO ${login}`);
    const revoker=await caller.connect();
    try {
      await revoker.query("BEGIN");
      await revoker.query("SET LOCAL session_replication_role = replica");
      await expect(revoker.query("SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6)",
        ["TEST-reg",registration,"TEST-owner","TEST-session",7,"TEST-workspace"]))
        .rejects.toThrow("C2_PROC_UNSAFE_CALLER");
    } finally {
      await revoker.query("ROLLBACK");
      revoker.release();
      await admin.query(`REVOKE SET ON PARAMETER session_replication_role FROM ${login}`);
    }
    const ambiguous=args("RESERVE","TEST-lease-3",original("c")).map((value,index)=>
      index===3?"TEST-ambiguous-owner":index===4?"TEST-ambiguous-source":index===10?"TEST-ambiguous-2":index===11?"c".repeat(64):value);
    await expect(caller.query(call,ambiguous)).rejects.toThrow("C2_DELIVERY_PROC_DENIED");
    await admin.query(`GRANT INSERT ON elp210_c2_delivery_candidate.events TO ${login}`);
    try {
      await expect(caller.query(call,args("RESERVE","TEST-lease-3",original("c")))).rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
    } finally {
      await admin.query(`REVOKE INSERT ON elp210_c2_delivery_candidate.events FROM ${login}`);
    }
    await admin.query(`GRANT UPDATE(drain_id) ON elp210_candidate.authority TO ${login}`);
    try {
      await expect(caller.query(call,args("RESERVE","TEST-lease-3",original("c")))).rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
    } finally {
      await admin.query(`REVOKE UPDATE(drain_id) ON elp210_candidate.authority FROM ${login}`);
    }
    await expect(caller.query(call,args("RESERVE","TEST-lease-3",original("c")).map((v,i)=>i===5?original("f"):v)))
      .rejects.toThrow("C2_DELIVERY_BINDING_OR_FENCE_INVALID");
    await expect(caller.query(call,args("RESERVE","TEST-lease-3",original("a")))).rejects.toThrow();
    expect((await caller.query(call,args("RESERVE","TEST-lease-3",original("c")))).rows[0].result).toBe("RESERVED_NOT_DELIVERED");
  });
  it("takes authority before obligation: concurrent transition waits without an ABBA lock",async()=>{
    const first=await caller.connect(),second=await caller.connect();let pending:Promise<unknown>|undefined;
    try{
      await first.query("BEGIN");
      await first.query("SELECT set_config('portal.c2_send_token',$1,false)",[randomBytes(32).toString("hex")]);
      expect((await first.query(call,args("SENDING","TEST-lease-1",original("a")))).rows[0].result).toBe("SENDING_NOT_ACKNOWLEDGED");
      const wp=Number((await first.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const rp=Number((await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      pending=second.query(call,args("UNKNOWN","TEST-lease-1",original("a")));
      await expect.poll(async()=> (await admin.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[wp,rp])).rows[0].blocked).toBe(true);
      await first.query("COMMIT");
      expect((await pending as {rows:{result:string}[]}).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
    }finally{await first.query("ROLLBACK").catch(()=>{});await pending?.catch(()=>{});first.release();second.release();}
    await expect(caller.query(call,args("SENDING","TEST-lease-1",original("a")))).rejects.toThrow("C2_DELIVERY_TRANSITION_INVALID");
  },30000);
  it("keeps a finished HTTP delivery uncertain when its process dies before commit",async()=>{
    const lease="TEST-lease-crash",orig=original("0"),bytes=Buffer.from("X".repeat(128));
    const payloadDigest=`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    const binding={lease_id:lease,workspace_id:"TEST-workspace",owner_user_id:"TEST-owner",workload_id:"TEST-source",
      request_digest:request,original_digest:orig,valid_until_ms:expiry,registration_key:"TEST-reg",registration_sha256:registration};
    const db=new URL(database!);db.username=login;db.password="TEST_ONLY_PASSWORD";
    const child=fork(join(__dirname,"fixtures/c2-delivery-kill-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>
      child.once("exit",(code,signal)=>resolve({code,signal})));
    try {
      await new Promise<void>((resolve,reject)=>{
        let received=false,finished=false,settled=false;
        const timer=setTimeout(()=>done(new Error("TEST_CHILD_TIMEOUT")),15000);
        const done=(error?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve();};
        const complete=()=>{if(received&&finished)done();};
        child.on("error",()=>done(new Error("TEST_CHILD_ERROR")));
        child.on("exit",()=>done(new Error("TEST_CHILD_EARLY_EXIT")));
        child.on("message",(message:{type?:string;port?:number})=>{
          if(message.type==="REFUSED")return done(new Error("TEST_CHILD_REFUSED"));
          if(message.type==="AFTER_FINISH_BEFORE_COMMIT"){finished=true;return complete();}
          if(message.type!=="READY"||!Number.isInteger(message.port))return;
          get(`http://127.0.0.1:${message.port}/`,response=>{
            const chunks:Buffer[]=[];response.on("data",chunk=>chunks.push(Buffer.from(chunk)));
            response.on("error",()=>done(new Error("TEST_HTTP_ERROR")));
            response.on("end",()=>{
              if(response.statusCode!==200||!Buffer.concat(chunks).equals(bytes))return done(new Error("TEST_HTTP_PAYLOAD_MISMATCH"));
              received=true;complete();
            });
          }).on("error",()=>done(new Error("TEST_HTTP_ERROR")));
        });
        child.send({type:"START",database:db.toString(),binding});
      });
      expect(child.kill("SIGKILL")).toBe(true);
      expect(await exited).toEqual({code:null,signal:"SIGKILL"});
      // SENDING was committed before egress; the later HOLD transaction may
      // roll back, but cannot roll the durable claim back to RESERVED.
      expect((await admin.query("SELECT state,original_digest FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[lease])).rows)
        .toEqual([{state:"SENDING",original_digest:orig}]);
      expect((await admin.query("SELECT state FROM elp210_c2_delivery_candidate.events WHERE lease_id=$1 ORDER BY event_id",[lease])).rows)
        .toEqual([{state:"RESERVED"},{state:"SENDING"}]);
      const crashArgs=(action:string)=>[action,lease,"TEST-workspace","TEST-owner","TEST-source",request,orig,
        payloadDigest,bytes.length,expiry,"TEST-reg",registration];
      await expect(caller.query(call,crashArgs("RESERVE"))).rejects.toThrow();
      await expect(caller.query(call,crashArgs("SENDING"))).rejects.toThrow("C2_DELIVERY_TRANSITION_INVALID");
      // A new connection cannot take over the old backend's in-flight claim.
      await expect(caller.query(call,crashArgs("HOLD"))).rejects.toThrow("C2_DELIVERY_PROC_BINDING_MISMATCH");
      expect((await caller.query(call,crashArgs("UNKNOWN"))).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
      await expect(caller.query(call,crashArgs("SENDING"))).rejects.toThrow("C2_DELIVERY_TRANSITION_INVALID");
      expect((await admin.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[lease])).rows[0].n).toBe(0);
      expect((await admin.query("SELECT state,original_digest FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[lease])).rows)
        .toEqual([{state:"UNKNOWN",original_digest:orig}]);
    } finally {
      if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await exited;}
      bytes.fill(0);
    }
  },30000);
  it("composes P7 revoke with the restricted delivery procedure and serializes SENDING",async()=>{
    const suffix=new URL(database!).pathname.slice(-8),definer=`test_p7_delivery_guard_${suffix}`;
    await admin.query(await readFile(join(__dirname,"../src/execution-v2/c2-p7-delivery-fence-candidate.sql"),"utf8"));
    const installer=await readFile(join(__dirname,"../src/execution-v2/c2-p7-delivery-definer-candidate.sql"),"utf8");
    await expect(admin.query(installer)).rejects.toThrow("C2_P7_DELIVERY_DEFINER_UNSAFE");
    await admin.query(`CREATE ROLE ${definer} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_candidate,elp210_c2_fence_candidate,elp210_c2_p7_candidate,elp210_c2_delivery_candidate TO ${definer};
      GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${definer};
      GRANT SELECT ON elp210_candidate.leases,elp210_c2_fence_candidate.scopes,elp210_c2_p7_candidate.owner_intent_revocations TO ${definer};
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO ${definer};
      GRANT SELECT,UPDATE(confirmation_sha256) ON elp210_c2_p7_candidate.records TO ${definer};
      GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO ${definer};
      ALTER FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery() OWNER TO ${definer}`);
    const installerDb=await admin.connect();let gap:import("pg").PoolClient|undefined;
    try {
      await admin.query(`GRANT ${definer} TO ${login}`);
      await installerDb.query("BEGIN");await installerDb.query(`SET LOCAL ROLE ${definer}`);
      await expect(installerDb.query(installer)).rejects.toThrow("C2_P7_DELIVERY_DEFINER_UNSAFE");
      await installerDb.query("ROLLBACK");await admin.query(`REVOKE ${definer} FROM ${login}`);
      // A row-lock grant must not silently become authority to rewrite the
      // registration identity or any other non-whitelisted column.
      await admin.query(`GRANT UPDATE(registration_key) ON elp210_c2_p7_candidate.registrations TO ${definer}`);
      await installerDb.query("BEGIN");await installerDb.query(`SET LOCAL ROLE ${definer}`);
      await expect(installerDb.query(installer)).rejects.toThrow("C2_P7_DELIVERY_DEFINER_UNSAFE");
      await installerDb.query("ROLLBACK");
      await admin.query(`REVOKE UPDATE(registration_key) ON elp210_c2_p7_candidate.registrations FROM ${definer}`);
      await installerDb.query("BEGIN");await installerDb.query(`SET LOCAL ROLE ${definer}`);
      await installerDb.query(installer);await installerDb.query("COMMIT");
      // TEST_ONLY connected mTLS transport + restricted DB delivery. The
      // issuer and privileged metadata reader are synthetic, so this is not
      // source qualification or an actual Edge recipient ACK.
      const caPair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),caName=commonName("TEST_ONLY-status-ca");
      const ca:TestAuthority={key:caPair.privateKey,name:caName,certificate:testCertificate(caName,caPair,{name:caName,key:caPair.privateKey},true)};
      const identity=(name:string)=>{const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
        return {key:Buffer.from(pair.privateKey.export({type:"pkcs8",format:"pem"})),
          cert:testCertificate(commonName(name),pair,ca,false)};};
      const core=identity("TEST_ONLY-status-core"),edge=identity("TEST_ONLY-status-edge");
      const pin=`sha256:${createHash("sha256").update(new X509Certificate(edge.cert).raw).digest("hex")}`;
      const statusBody={schema_version:"portal.execution.command-source-assertion-request.v1" as const,binding_digest:original("5"),
        receiver_id:"TEST-receiver",workload_id:"TEST-source",method:"POST" as const,path:"/internal/elp210/pm-command/status" as const,
        body_utf8:"{}",request_digest:request,delivery_sequence:0,previous_lease_id:null};
      let assertion=httpAssertion;
      const transport=createCommandSourceAssertionTestCustodyTransport({
        issue:async()=>({schema_version:"portal.execution.command-source-assertion-response.v1" as const,
          binding_digest:statusBody.binding_digest,receiver_id:statusBody.receiver_id,workload_id:statusBody.workload_id,
          method:"POST" as const,path:statusBody.path,request_digest:statusBody.request_digest,assertion,
          lease_id:statusHttpLease,issued_at_ms:httpIssued,expires_at_ms:httpExpiry,authority_revision:authorityRevision,
          delivery_sequence:0,previous_lease_id:null}),
        complete:async()=>{throw new Error("TEST_ONLY_NO_COMPLETION");},
      },{tls:{key:core.key,cert:core.cert,ca:ca.certificate},peer:{certificate_sha256:pin,dns_name:"localhost",workload_id:"TEST-source"},
        limits:{maximum_in_flight:1,request_bytes:4096,response_bytes:32768,deadline_ms:5000}},
      createC2TestStatusDelivery(caller,caller,{workspace_id:"TEST-workspace",owner_user_id:"TEST-owner",workload_id:"TEST-source",
        registration_key:"TEST-reg",registration_sha256:registration}));
      transport.server.on("tlsClientError",()=>undefined);
      try {
        transport.server.listen(0,"127.0.0.1");await once(transport.server,"listening");
        const address=transport.server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_SERVER_ADDRESS");
        const post=()=>new Promise<{status:number;body:string;contentType:string|undefined}>((resolve,reject)=>{
          const raw=JSON.stringify(statusBody),client=httpsRequest({host:"127.0.0.1",port:address.port,
            path:"/internal/elp210/command-source/assertion",method:"POST",agent:false,key:edge.key,cert:edge.cert,ca:ca.certificate,
            minVersion:"TLSv1.3",maxVersion:"TLSv1.3",headers:{"content-type":"application/json",
              "content-length":Buffer.byteLength(raw),authorization:`Bearer ${contextToken}`}},res=>{
              const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
              res.on("end",()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString("utf8"),
                contentType:res.headers["content-type"]}));res.on("error",reject);
            });client.on("error",reject);client.end(raw);
        });
        assertion="TEST_ONLY_wrong_assertion";
        expect((await post()).status).toBe(503);
        expect((await admin.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[statusHttpLease])).rows[0].n).toBe(0);
        assertion=httpAssertion;
        const served=await post();expect(served.status).toBe(200);expect(served.contentType).toBe("application/json");
        expect(JSON.parse(served.body)).toMatchObject({lease_id:statusHttpLease,assertion:httpAssertion});
        // The client can receive bytes before the delivery transaction commits
        // its UNKNOWN outcome; await the actual transport/custody settlement.
        await expect.poll(()=>transport.snapshot().in_flight).toBe(0);
        expect(transport.snapshot().accepted).toBe(1);
        expect((await admin.query("SELECT original_digest,state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[statusHttpLease])).rows[0])
          .toEqual({original_digest:original("6"),state:"UNKNOWN"});
        expect((await admin.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[statusHttpLease])).rows[0].n).toBe(0);
      } finally {await new Promise<void>((resolve,reject)=>transport.server.close(error=>error?reject(error):resolve()));}
      const payloadBytes=Buffer.from("TEST_ONLY_NOT_A_BEARER"),binding={lease_id:p7Lease,workspace_id:"TEST-workspace",
        owner_user_id:"TEST-owner",workload_id:"TEST-source",request_digest:request,original_digest:original("f"),
        valid_until_ms:expiry,registration_key:"TEST-reg",registration_sha256:registration};
      let delivered:Promise<string>|undefined;
      const server=createServer((_req,res)=>{delivered=deliverC2TestResponse(caller,res,binding,payloadBytes,2000);});
      try {
        server.listen(0,"127.0.0.1");await once(server,"listening");
        const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_SERVER_ADDRESS");
        const body=await new Promise<string>((resolve,reject)=>{
          get({host:"127.0.0.1",port:address.port,path:"/"},res=>{
            const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
            res.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));res.on("error",reject);
          }).on("error",reject);
        });
        expect(body).toBe("TEST_ONLY_NOT_A_BEARER");
        expect(await delivered).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
        expect((await admin.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[p7Lease])).rows[0].state).toBe("UNKNOWN");
      } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
      expect((await caller.query(call,args("RESERVE",p7Second,original("d")))).rows[0].result).toBe("RESERVED_NOT_DELIVERED");
      // Claim is durable, but revoke may win before HOLD. No bytes have been
      // sent; the later same-session HOLD must still recheck P7 authority.
      gap=await caller.connect();
      await gap.query("SELECT set_config('portal.c2_send_token',$1,false)",[randomBytes(32).toString("hex")]);
      expect((await gap.query(call,args("RESERVE",p7Gap,original("7")))).rows[0].result).toBe("RESERVED_NOT_DELIVERED");
      await gap.query("BEGIN");
      expect((await gap.query(call,args("SENDING",p7Gap,original("7")))).rows[0].result).toBe("SENDING_NOT_ACKNOWLEDGED");
      await gap.query("SAVEPOINT same_transaction");
      await expect(gap.query(call,args("HOLD",p7Gap,original("7")))).rejects.toThrow("C2_DELIVERY_CLAIM_NOT_COMMITTED");
      await gap.query("ROLLBACK TO SAVEPOINT same_transaction");
      await gap.query("COMMIT");
      const first=await caller.connect(),revoker=await caller.connect();let pending:Promise<unknown>|undefined;
      try {
        await first.query("BEGIN");
        await first.query("SELECT set_config('portal.c2_send_token',$1,false)",[randomBytes(32).toString("hex")]);
        expect((await first.query(call,args("SENDING",p7Second,original("d")))).rows[0].result).toBe("SENDING_NOT_ACKNOWLEDGED");
        const firstPid=Number((await first.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        const revokePid=Number((await revoker.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
        await revoker.query("BEGIN");
        pending=revoker.query("SELECT elp210_c2_p7_candidate.test_only_revoke($1)",[p7Intent]);
        await expect.poll(async()=> (await admin.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked",[firstPid,revokePid])).rows[0].blocked).toBe(true);
        await first.query("ROLLBACK");await pending;
        await revoker.query("COMMIT");
      } finally {await first.query("ROLLBACK").catch(()=>{});await revoker.query("ROLLBACK").catch(()=>{});
        await pending?.catch(()=>{});first.release();revoker.release();}
      await expect(gap.query(call,args("HOLD",p7Gap,original("7")))).rejects.toThrow("C2_P7_DELIVERY_INTENT_NOT_CURRENT");
      expect((await gap.query(call,args("UNKNOWN",p7Gap,original("7")))).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
      await expect(caller.query(call,args("SENDING",p7Second,original("d")))).rejects.toThrow("C2_P7_DELIVERY_INTENT_NOT_CURRENT");
      await expect(caller.query(call,args("RESERVE",p7Third,original("e")))).rejects.toThrow("C2_P7_DELIVERY_INTENT_NOT_CURRENT");
      expect((await caller.query(call,args("UNKNOWN",p7Second,original("d")))).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
      let denied:Promise<string>|undefined;
      const deniedServer=createServer((_req,res)=>{denied=deliverC2TestResponse(caller,res,
        {...binding,lease_id:p7Third,original_digest:original("e")},payloadBytes,2000).catch(error=>(error as Error).message);});
      try {
        deniedServer.listen(0,"127.0.0.1");await once(deniedServer,"listening");
        const address=deniedServer.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_SERVER_ADDRESS");
        const received=await new Promise<string>((resolve,reject)=>{
          get({host:"127.0.0.1",port:address.port,path:"/"},res=>{
            const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
            res.on("end",()=>resolve(Buffer.concat(chunks).toString("utf8")));res.on("error",reject);
          }).on("error",(error:NodeJS.ErrnoException)=>error.code==="ECONNRESET"?resolve(""):reject(error));
        });
        expect(received).toBe("");
        expect(await denied).toBe("C2_TEST_DELIVERY_OUTCOME_UNCERTAIN");
        expect((await admin.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[p7Third])).rows[0].n).toBe(0);
      } finally {await new Promise<void>((resolve,reject)=>deniedServer.close(error=>error?reject(error):resolve()));}
      await expect(caller.query(`SET ROLE ${definer}`)).rejects.toThrow(/permission denied/i);
    } finally {
      gap?.release(true);
      await installerDb.query("ROLLBACK").catch(()=>{});installerDb.release();
      await admin.query(`DROP TRIGGER c2_p7_delivery_guard ON elp210_c2_delivery_candidate.obligations;
        DROP FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery(); DROP OWNED BY ${definer}; DROP ROLE ${definer}`);
    }
  },30000);
  it("rejects new SENDING after revocation but preserves UNKNOWN for the exact original",async()=>{
    expect((await caller.query("SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS result",
      ["TEST-reg",registration,"TEST-owner","TEST-session",7,"TEST-workspace"])).rows[0].result).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
    await expect(caller.query(call,args("SENDING","TEST-lease-2",original("b")))).rejects.toThrow("C2_DELIVERY_PROC_DENIED");
    await expect(caller.query(call,args("UNKNOWN","TEST-lease-2",original("b")).map((v,i)=>i===11?"b".repeat(64):v)))
      .rejects.toThrow("C2_DELIVERY_PROC_DENIED");
    await expect(caller.query(call,args("UNKNOWN","TEST-lease-2",original("c")))).rejects.toThrow("C2_DELIVERY_PROC_BINDING_MISMATCH");
    expect((await caller.query(call,args("UNKNOWN","TEST-lease-2",original("b")))).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
    const before=(await admin.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.events WHERE lease_id='TEST-lease-2'")).rows[0].n;
    const retries=await Promise.all([1,2].map(()=>caller.query(call,args("UNKNOWN","TEST-lease-2",original("b")))));
    expect(retries.map(r=>r.rows[0].result)).toEqual(["UNKNOWN_NOT_ACKNOWLEDGED","UNKNOWN_NOT_ACKNOWLEDGED"]);
    expect((await admin.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.events WHERE lease_id='TEST-lease-2'")).rows[0].n).toBe(before);
    await expect(caller.query(call,args("UNKNOWN","TEST-lease-2",original("b")).map((v,i)=>i===7?original("f"):v)))
      .rejects.toThrow("C2_DELIVERY_PROC_BINDING_MISMATCH");
  });
});
