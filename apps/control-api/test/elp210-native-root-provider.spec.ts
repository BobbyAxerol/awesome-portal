/** Real disposable Core PG + real loopback mTLS; PM replies are explicitly
 * synthetic component input. This is NOT connected/native-source acceptance. */
import { generateKeyPairSync,randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateKeyPair,jwtVerify } from "jose";
import { Pool } from "pg";
import { afterAll,afterEach,beforeAll,describe,expect,it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { withTransaction } from "../src/db/pool";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { AccessRepository } from "../src/execution-v2/access.repository";
import type { ReviewedAccessPolicy,ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-digest";
import { grantBindingDigest } from "../src/execution-v2/access-current-relations";
import { acceptRootMembershipReceipt } from "../src/execution-v2/access-root-receipt";
import { unqualifiedAccessTrust,type ReviewedPolicyArtifact } from "../src/execution-v2/access-trust";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { NativeRootReceiptProvider,type NativeRootProviderConfig } from "../src/execution-v2/native-root-provider";
import { carryNativeRootFenceIdentity } from "../src/execution-v2/native-root-fence";
import type { NativeRootSourceBase } from "../src/execution-v2/native-root-codec";
import { setupApp,teardownApp,migrateTestDatabase } from "./harness";
import { rootWireFacts,rootWireReply } from "./fixtures/elp210-native-root-wire";
import { rootTestEndpoint } from "./fixtures/elp210-native-root-server";

const DATABASE_URL=process.env.TEST_DATABASE_URL;
describe.skipIf(!DATABASE_URL)("registered native ROOT real coordinator/custody, TEST_ONLY PG",()=>{
  let ctx:Awaited<ReturnType<typeof setupApp>>,pool:Pool,owner:string;
  const endpoints:Array<Awaited<ReturnType<typeof rootTestEndpoint>>>=[];
  beforeAll(async()=>{
    await migrateTestDatabase(DATABASE_URL!);ctx=await setupApp({DATABASE_URL:DATABASE_URL!});
    pool=new Pool({connectionString:DATABASE_URL,max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    owner=`TEST_ONLY-native-root-owner-${randomUUID()}`;
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES($1,$1,$1,'USER','ACTIVE',false)",[owner]);
    await new OwnerAccessRepository(pool).claimOwner({userId:owner,claimedBy:"TEST_ONLY_NATIVE_ROOT_COMPONENT"});
  });
  afterEach(async()=>{for(const endpoint of endpoints.splice(0))await endpoint.close();
    if(pool){await pool.query("TRUNCATE public.portal_native_root_obligations");
      await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");}});
  afterAll(async()=>{if(pool)await pool.end();if(ctx)await teardownApp(ctx);});
  async function fixture(){
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    const id=randomUUID(),now=Date.now(),workspace=`TEST_ONLY-native-root-${id}`;
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY Native Root',$2)",[workspace,owner]);
    const policy:ReviewedAccessPolicy={workspace_id:workspace,revision:`TEST_ONLY-policy-${id}`,artifact_digest:accessDigest(id),
      approval_ref:"TEST_ONLY-independent-owner-approval",state:"REVIEWED",qualification:"TEST_ONLY",protected_owner_user_id:owner,
      researcher_fields:{state:"QUALIFIED",policy_ref:"TEST_ONLY-fields",fields:["portfolio_id"]}};
    const facts=rootWireFacts(now),grant:ScopedAccessGrant={...facts.grant,grant_id:`TEST_ONLY-grant-${id}`,subject_user_id:owner,
      issued_by:owner,workspace_id:workspace,policy_revision:policy.revision};
    const artifact:ReviewedPolicyArtifact={policy,root_grants:[grant],provenance_ref:"TEST_ONLY-no-runtime-approval"};
    const baseTrust={...unqualifiedAccessTrust,verifyPolicy:async(input:unknown)=>input===artifact?artifact:null};
    await new ExecutionAccessService(pool,ctx.app.get(AuthService),baseTrust,true).installReviewedPolicy(artifact);
    const fact={...facts.fact,portal_user_id:owner,human_requester_user_id:owner,workspace_id:workspace,grant_id:grant.grant_id,
      receipt_id:`TEST_ONLY-receipt-${id}`,policy_revision:policy.revision,policy_artifact_digest:policy.artifact_digest,
      policy_install_digest:accessDigest(artifact),approval_ref:policy.approval_ref,grant_digest:accessDigest(grant)};
    const relations={...facts.relations,subject_user_id:owner,workspace_id:workspace,
      grants:[{...facts.relations.grants[0],grant_id:grant.grant_id,binding_digest:grantBindingDigest(grant),accepted:fact}]};
    const terminal=generateKeyPairSync("ed25519"),source=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),
      human=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const candidate=await CurrentHumanCandidate.create(pool,{issuer:"TEST_ONLY-core",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-human",
      private_key:human.privateKey,source:{issuer:"TEST_ONLY-pm",audience:"TEST_ONLY-core",key_id:"TEST_ONLY-source",public_key:source.publicKey,
        workload_id:"TEST_ONLY-native-root"},limits:{ttl_ms:30000,maximum_unresolved:4,maximum_retained:100}});
    const states=new Map<string,"ISSUED"|"ENTERED"|"COMMITTED"|"ROLLED_BACK"|"CANCELLED">(),terminals:Array<Record<string,unknown>>=[];
    let dropIssue=false,dropEnter=false,dropEnterBefore=false,dropResolve=false;
    const endpoint=await rootTestEndpoint(async(base,action,res,body)=>{
      // With max=1, this DB read proves source I/O never holds Core's client.
      expect((await pool.query("SELECT 1 AS outside_core")).rows[0].outside_core).toBe(1);
      const lease=base.binding.lease_id,current=states.get(lease),reply=rootWireReply(base,action,relations);
      if(action==="issue") {expect(current).toBeUndefined();states.set(lease,"ISSUED");if(dropIssue){dropIssue=false;res.destroy();}}
      else if(action==="enter") {expect(current).toBe("ISSUED");if(dropEnterBefore){dropEnterBefore=false;res.destroy();return null;}
        states.set(lease,"ENTERED");if(dropEnter){dropEnter=false;res.destroy();}}
      else if(action==="cancel-unentered") {expect([undefined,"ISSUED","CANCELLED"]).toContain(current);states.set(lease,"CANCELLED");}
      else if(action==="status") {expect(current).toBeDefined();return{...reply,recovery:{state:"RECORDED",phase:current,
        source_digest:"c".repeat(64),expires_at:base.deadline,terminal_authority:false,release_permitted:false}};}
      else if(action==="resolve") {
        const verified=await jwtVerify(String(body.signed_terminal),terminal.publicKey,{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-pm-terminal",algorithms:["EdDSA"]});
        const claims=verified.payload;expect(claims).toMatchObject({purpose:"pma.native-business-to-core-terminal.v1",operation:"MUTATION",
          lease_id:lease,attempt_id:base.binding.attempt_id,binding_digest:accessDigest(base.binding).slice(7),source_digest:"c".repeat(64)});
        expect(["ENTERED","COMMITTED","ROLLED_BACK"]).toContain(current);expect(["COMMITTED","ROLLED_BACK"]).toContain(claims.phase);
        if(current!=="ENTERED")expect(claims.phase).toBe(current);
        terminals.push({...claims});states.set(lease,claims.phase as "COMMITTED"|"ROLLED_BACK");
        if(dropResolve){dropResolve=false;res.destroy();}
        return{...reply,recovery:{state:"SETTLED",phase:claims.phase,terminal_authority:true,release_permitted:true}};
      }
      return reply;
    });endpoints.push(endpoint);
    const config:NativeRootProviderConfig={source:{human_issuer:"TEST_ONLY-core",subject:owner,workspace_id:workspace,environment:"paper",workload_id:"TEST_ONLY-native-root"},
      registration:{correspondence_id:`TEST_ONLY-correspondence-${id}`,expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
      original:{grant_id:grant.grant_id,accepted_fact_digest:accessDigest(fact)},correspondence:{registry_revision:accessDigest("TEST_ONLY-registry"),payload_sha256:"b".repeat(64),approval_ref:"TEST_ONLY-independent-review"},
      maximum_retained:256,maximum_unresolved:8,maximum_recoveries:8,attempt_ms:30000,
      terminal:{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-pm-terminal",key_id:"TEST_ONLY-terminal",private_key:terminal.privateKey,ttl_seconds:30}};
    const provider=new NativeRootReceiptProvider(pool,endpoint.client,config),trust=provider.compose(baseTrust);
    const coordinator=new CurrentHumanMutations(pool,candidate,{recover:async()=>{}},
      {maximum_intents:32,maximum_recoveries_per_request:4},undefined,[],undefined,provider);
    const accept=()=>acceptRootMembershipReceipt(pool,trust.verifyRootReceipt,config.original,true,coordinator);
    const rows=async()=> (await pool.query("SELECT * FROM portal_native_root_obligations WHERE source_config_digest=$1 ORDER BY created_at,lease_id",[provider.source_config_digest])).rows;
    const stored=async()=> (await pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE grant_id=$1",[grant.grant_id])).rows[0].grant_fact;
    return{pool,provider,coordinator,candidate,endpoint,trust,config,grant,fact,relations,accept,rows,stored,terminals,
      loseIssue(){dropIssue=true;},loseEnter(){dropEnter=true;},loseEnterBefore(){dropEnterBefore=true;},loseResolve(){dropResolve=true;},
      async waitTransport(){await expect.poll(()=>endpoint.client.snapshot().in_flight).toBe(0);}};
  }
  async function owningMutation(f:Awaited<ReturnType<typeof fixture>>) {
    const mutation_id=randomUUID(),key_digest=accessDigest(["ROOT_RECEIPT",f.fact.source,f.fact.receipt_id]),
      request_digest=accessDigest(f.fact),binding={family:"QUALIFIED_ROOT_RECEIPT" as const,operation:"ROOT_RECEIPT",
        key_digest,request_digest,target_id:f.fact.workspace_id};
    const context={mutation_id,binding_digest:accessDigest(binding),key_digest,request_digest,
      family:"QUALIFIED_ROOT_RECEIPT" as const,target_id:f.fact.workspace_id};
    await pool.query(`INSERT INTO elp210_candidate.mutations(mutation_id,key_digest,binding_digest,replay_digest,family)
      VALUES($1,$2,$3,$3,'QUALIFIED_ROOT_RECEIPT')`,[mutation_id,key_digest,context.binding_digest]);
    await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[mutation_id]);return context;
  }
  it("qualifies/cancels unentered, reacquires exact persisted mutation, physically COMMITs, then source ACKs",async()=>{
    const f=await fixture(),result=await f.accept();expect(result.replayed).toBe(false);expect((await f.stored()).ts_receipt.receipt_id).toBe(f.fact.receipt_id);
    expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered","issue","enter","status","resolve"]);
    const rows=await f.rows();expect(rows).toHaveLength(2);expect(rows.map(r=>r.phase)).toEqual(["CANCELLED","COMMITTED"]);
    expect(rows.every(r=>r.source_settled)).toBe(true);expect(rows[0].mutation_id).toBeNull();expect(rows[1].root_operation_id).toBe(result.receipt.operation_id);
    const m=(await pool.query("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1",[rows[1].mutation_id])).rows[0];
    expect(m.state).toBe("FINISHED");expect(f.terminals).toHaveLength(1);expect(f.terminals[0].phase).toBe("COMMITTED");
    const before=await f.rows();expect((await f.accept()).replayed).toBe(true);
    expect((await f.rows()).filter(r=>r.phase==="COMMITTED")).toEqual(before.filter(r=>r.phase==="COMMITTED"));
  });
  it("does not mutate authority without the real coordinator; QUALIFY release retires only unentered source",async()=>{
    const f=await fixture();await expect(acceptRootMembershipReceipt(pool,f.trust.verifyRootReceipt,f.config.original,true))
      .rejects.toMatchObject({code:"RECEIPT_NOT_QUALIFIED"});expect((await f.stored()).ts_receipt).toBeNull();
    expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);
    expect((await f.rows())[0]).toMatchObject({phase:"CANCELLED",source_settled:true,mutation_id:null});expect(f.terminals).toEqual([]);
  });
  it("lost ISSUE retains exact frozen attempt and cancels it before any later new admission",async()=>{
    const f=await fixture();f.loseIssue();await expect(f.provider.verify(f.config.original,{phase:"QUALIFY"})).rejects.toBeDefined();await f.waitTransport();
    await f.provider.recover();const first=(await f.rows())[0];expect(first).toMatchObject({phase:"CANCELLED",source_settled:true});
    const source=f.endpoint.requests.filter(r=>r.base.binding.lease_id===first.lease_id);expect(source.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);
    expect(source[0].base).toEqual(source[1].base);const next=await f.provider.verify(f.config.original,{phase:"QUALIFY"});await next!.release();
    expect((await f.rows()).every(r=>r.phase==="CANCELLED"&&r.source_settled)).toBe(true);expect((await f.stored()).ts_receipt).toBeNull();
  });
  it("lost ENTER produces physical same-original rollback tombstone; retry reuses root mutation, not source attempt",async()=>{
    const f=await fixture();f.loseEnter();await expect(f.accept()).rejects.toBeDefined();await f.waitTransport();await f.provider.recover();
    const failed=(await f.rows()).find(r=>r.purpose==="COMMIT")!;expect(failed).toMatchObject({phase:"ROLLED_BACK",source_settled:true});
    expect((await f.stored()).ts_receipt).toBeNull();const result=await f.accept();expect(result.replayed).toBe(false);
    const rows=await f.rows(),old=rows.find(r=>r.lease_id===failed.lease_id)!;expect(old).toEqual(failed);
    const committed=rows.find(r=>r.phase==="COMMITTED")!;expect(committed.mutation_id).toBe(failed.mutation_id);expect(committed.lease_id).not.toBe(failed.lease_id);
    expect(f.terminals.map(t=>t.phase)).toEqual(["ROLLED_BACK","COMMITTED"]);
  });
  it("lost source ACK after physical COMMIT recovers same immutable terminal and never applies root twice",async()=>{
    const f=await fixture();f.loseResolve();await expect(f.accept()).rejects.toMatchObject({code:"ACCESS_RETRY_REQUIRED"});await f.waitTransport();
    const old=(await f.rows()).find(r=>r.phase==="COMMITTED")!;expect(old.source_settled).toBe(false);expect((await f.stored()).ts_receipt).not.toBeNull();
    const result=await f.accept();expect(result.replayed).toBe(true);const recovered=(await f.rows()).find(r=>r.lease_id===old.lease_id)!;
    expect(recovered).toMatchObject({source_settled:true,base_body:old.base_body,base_digest:old.base_digest,terminal_receipt_id:old.terminal_receipt_id,terminal_receipt_digest:old.terminal_receipt_digest});
    expect(f.terminals).toHaveLength(2);expect(f.terminals[1]).toMatchObject({lease_id:f.terminals[0].lease_id,attempt_id:f.terminals[0].attempt_id,
      receipt_id:f.terminals[0].receipt_id,receipt_digest:f.terminals[0].receipt_digest,phase:"COMMITTED"});
    expect(Number((await pool.query("SELECT count(*) AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='TS_RECEIPT'",[f.fact.workspace_id])).rows[0].n)).toBe(1);
  });
  it("new provider/coordinator instances resume the same pending root after lost ENTER",async()=>{
    const f=await fixture();f.loseEnter();await expect(f.accept()).rejects.toBeDefined();await f.waitTransport();
    const failed=(await f.rows()).find(r=>r.purpose==="COMMIT")!;
    const restarted=new NativeRootReceiptProvider(pool,f.endpoint.client,f.config),
      coordinator=new CurrentHumanMutations(pool,f.candidate,{recover:async()=>{}},
        {maximum_intents:32,maximum_recoveries_per_request:4},undefined,[],undefined,restarted);
    const result=await acceptRootMembershipReceipt(pool,restarted.compose(f.trust).verifyRootReceipt,f.config.original,true,coordinator);
    expect(result.replayed).toBe(false);
    const rows=await f.rows(),old=rows.find(r=>r.lease_id===failed.lease_id)!,committed=rows.find(r=>r.phase==="COMMITTED")!;
    expect(old).toMatchObject({base_body:failed.base_body,base_digest:failed.base_digest,phase:"ROLLED_BACK",source_settled:true});
    expect(committed.mutation_id).toBe(failed.mutation_id);expect(committed.lease_id).not.toBe(failed.lease_id);
    expect(Number((await pool.query("SELECT count(*) AS n FROM elp210_candidate.mutations")).rows[0].n)).toBe(1);
    expect(Number((await pool.query("SELECT count(*) AS n FROM portal_access_policy_events WHERE workspace_id=$1 AND operation='TS_RECEIPT'",[f.fact.workspace_id])).rows[0].n)).toBe(1);
  });
  it("an ENTER which never reached native transition uses serialized cancellation, never fake source ENTER/terminal",async()=>{
    const f=await fixture();f.loseEnterBefore();await expect(f.accept()).rejects.toBeDefined();await f.waitTransport();await f.provider.recover();
    const failed=(await f.rows()).find(r=>r.purpose==="COMMIT")!;expect(failed).toMatchObject({phase:"ROLLED_BACK",source_settled:true});
    const source=f.endpoint.requests.filter(r=>r.base.binding.lease_id===failed.lease_id);
    expect(source.map(r=>r.action)).toEqual(["issue","enter","status","cancel-unentered"]);
    expect(f.terminals).toHaveLength(0);expect((await f.stored()).ts_receipt).toBeNull();
  });
  it("restart recovery serializes a rollback tombstone before the old entered holder can apply",async()=>{
    const f=await fixture(),context=await owningMutation(f);
    const lease=await f.provider.verify(f.config.original,{phase:"COMMIT",mutation:context});
    expect(lease!.beforeApply).toBeTypeOf("function");
    // The recovery actor represents an abandoned process; retain the old
    // object ONLY to assert a late apply is refused after real tombstoning.
    // No custody is cleared manually and no terminal is fabricated.
    const restarted=new NativeRootReceiptProvider(pool,f.endpoint.client,f.config);await restarted.recover();
    await expect(withTransaction(pool,db=>lease!.beforeApply!(db))).rejects.toMatchObject({code:"NATIVE_ROOT_CUSTODY_CONFLICT"});
    await lease!.release();expect((await f.stored()).ts_receipt).toBeNull();expect((await f.rows())[0]).toMatchObject({phase:"ROLLED_BACK",source_settled:true});
  });
  it("only a genuine carried own COMMIT fence exempts its exact locked custody row",async()=>{
    const f=await fixture(),context=await owningMutation(f),lease=await f.provider.verify(f.config.original,{phase:"COMMIT",mutation:context});
    const row=(await f.rows())[0],wrapped={assertCurrent:()=>{},release:async()=>{}};
    expect(await withTransaction(pool,db=>f.provider.validateOwnCommitFence(db,context,wrapped))).toBeNull();
    carryNativeRootFenceIdentity({...lease!},wrapped);
    expect(await withTransaction(pool,db=>f.provider.validateOwnCommitFence(db,context,wrapped))).toBeNull();
    carryNativeRootFenceIdentity(lease!,wrapped);
    expect(await withTransaction(pool,db=>f.provider.validateOwnCommitFence(db,context,wrapped))).toBe(row.lease_id);
    const foreign=new NativeRootReceiptProvider(pool,f.endpoint.client,f.config);
    expect(await withTransaction(pool,db=>foreign.validateOwnCommitFence(db,context,wrapped))).toBeNull();
    await expect(withTransaction(pool,db=>f.provider.validateOwnCommitFence(db,{...context,request_digest:accessDigest("TEST_ONLY-changed")},wrapped)))
      .rejects.toMatchObject({code:"NATIVE_ROOT_CUSTODY_CONFLICT"});
    await lease!.release();
    await expect(withTransaction(pool,db=>f.provider.validateOwnCommitFence(db,context,wrapped))).rejects.toBeDefined();
  });
  it("live COMMIT recovery and recoverAbandoned stay pending without tombstoning the active owner",async()=>{
    const f=await fixture(),context=await owningMutation(f),lease=await f.provider.verify(f.config.original,{phase:"COMMIT",mutation:context});
    const before=await f.rows(),requests=f.endpoint.requests.length;
    await expect(f.provider.recover()).rejects.toMatchObject({code:"NATIVE_ROOT_RECOVERY_REQUIRED"});
    expect(await f.coordinator.recoverAbandoned(context.mutation_id)).toEqual({state:"DRAIN_PENDING"});
    expect(await f.rows()).toEqual(before);expect(f.endpoint.requests).toHaveLength(requests);
    expect((await f.rows())[0]).toMatchObject({phase:"ENTERED",source_settled:false});
    await lease!.release();expect(await f.coordinator.recoverAbandoned(context.mutation_id)).toEqual({state:"ABORTED"});
  });
  it("QUALIFY cannot reserve after a foreign drain or create a second concurrent live holder",async()=>{
    const f=await fixture();await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[randomUUID()]);
    await expect(f.provider.verify(f.config.original,{phase:"QUALIFY"})).rejects.toMatchObject({code:"NATIVE_ROOT_CUSTODY_CONFLICT"});
    expect(await f.rows()).toEqual([]);expect(f.endpoint.requests).toEqual([]);
    await pool.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    const first=f.provider.verify(f.config.original,{phase:"QUALIFY"});
    await expect(f.provider.verify(f.config.original,{phase:"QUALIFY"})).rejects.toMatchObject({code:"NATIVE_ROOT_RECOVERY_REQUIRED"});
    const held=await first;await expect(f.provider.recover()).rejects.toMatchObject({code:"NATIVE_ROOT_RECOVERY_REQUIRED"});
    await Promise.all([held!.release(),held!.release()]);
    expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);
    expect((await f.rows())[0]).toMatchObject({phase:"CANCELLED",source_settled:true});
  });
  it("COMMIT rejects mismatched drain and FINISHED mutations without any source attempt",async()=>{
    const f=await fixture(),context=await owningMutation(f);
    await pool.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    await expect(f.provider.verify(f.config.original,{phase:"COMMIT",mutation:context})).rejects.toMatchObject({code:"NATIVE_ROOT_CUSTODY_CONFLICT"});
    await pool.query(`UPDATE elp210_candidate.mutations SET state='FINISHED',terminal_digest=$2,finished_at=clock_timestamp()
      WHERE mutation_id=$1`,[context.mutation_id,accessDigest("TEST_ONLY-finished")]);
    await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton",[context.mutation_id]);
    await expect(f.provider.verify(f.config.original,{phase:"COMMIT",mutation:context})).rejects.toMatchObject({code:"NATIVE_ROOT_CUSTODY_CONFLICT"});
    expect(await f.rows()).toEqual([]);expect(f.endpoint.requests).toEqual([]);
  });
  it("shutdown retires the same held qualification and joins transport before returning",async()=>{
    const f=await fixture(),held=await f.provider.verify(f.config.original,{phase:"QUALIFY"}),before=(await f.rows())[0];
    const closing=f.provider.shutdown();expect(f.provider.shutdown()).toBe(closing);
    await expect(f.provider.verify(f.config.original,{phase:"QUALIFY"})).rejects.toMatchObject({code:"NATIVE_ROOT_RECOVERY_REQUIRED"});
    await closing;await held!.release();
    expect(f.provider.snapshot()).toEqual({closing:true,active_operations:0,live_holders:0,recoveries:0});
    expect(f.endpoint.client.snapshot().in_flight).toBe(0);
    expect((await f.rows())[0]).toMatchObject({lease_id:before.lease_id,base_body:before.base_body,phase:"CANCELLED",source_settled:true});
    expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);
    expect((await pool.query("SELECT 1 AS pool_still_owned_by_caller")).rows[0].pool_still_owned_by_caller).toBe(1);
  });
  it("immutable custody rejects editing originals, terminal identity or deleting retained attempts",async()=>{
    const f=await fixture();await f.accept();const row=(await f.rows()).find(r=>r.phase==="COMMITTED")!;
    for(const sql of ["UPDATE portal_native_root_obligations SET base_body='{}' WHERE lease_id=$1",
      "UPDATE portal_native_root_obligations SET terminal_receipt_id=gen_random_uuid() WHERE lease_id=$1",
      "DELETE FROM portal_native_root_obligations WHERE lease_id=$1"])
      await expect(pool.query(sql,[row.lease_id])).rejects.toMatchObject({code:"P0001"});
    expect((await f.rows()).find(r=>r.lease_id===row.lease_id)).toEqual(row);
  });
});
