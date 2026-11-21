/** Isolated PG + ephemeral TEST_ONLY keys. No installed Research authority,
 * source acceptance, live token delivery or Edge ACK is proved here. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeJwt, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { RestoreIndependentCustodyCandidate } from "../src/execution-v2/restore-independent-custody-candidate";
import { C2SourceProofVault } from "../src/execution-v2/restore-c2-source-proof-vault";
import { C2CustodiedIssuerCandidate } from "../src/execution-v2/c2-custodied-issuer-candidate";
import { C2CustodiedTerminalCandidate } from "../src/execution-v2/c2-custodied-terminal-candidate";
import { pmHttpRequestDigest, type PmHttpRequestBytes } from "../src/execution-v2/pm-http-request-binding";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database || process.env.PORTAL_TEST_RESTORE_RLS!=="TEST_ONLY_DISPOSABLE_RLS")("C2 protected owner request identity on disposable PG", () => {
  let pool: Pool, authority: Pool | undefined, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let sourceSystem: string, authoritySystem: string;
  let own: Awaited<ReturnType<typeof generateKeyPair>>, source: Awaited<ReturnType<typeof generateKeyPair>>;
  let actor: AccessActor, other: AccessActor, workspace: string;
  const limit = { request_bytes: 4096 };
  const request = (): PmHttpRequestBytes => ({ method: "POST", raw_path: Buffer.from("/test-only/capital/root/apply"),
    query_string: Buffer.from("source=one"), body: Buffer.from('{"idempotency_key":"test-only-original"}') });
  const issue = (r: PmHttpRequestBytes = request()) => candidate.issueC2ProtectedOwner(actor, actor.user_id, r, limit);
  const independentStore = async (scope:CurrentHumanCandidateConfig) => {
    if(!authority)throw new Error("TEST_ONLY_TWO_CLEAN_CLUSTERS_REQUIRED");
    const custody_id=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head
      (custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[custody_id,sourceSystem,authoritySystem]);
    return new RestoreIndependentCustodyCandidate(pool,authority,{custody_id,source_system_identifier:sourceSystem,
      authority_system_identifier:authoritySystem,workspace_id:workspace,workload_id:scope.source.workload_id,
      protected_owner_subject:actor.user_id,maximum_events:50,
      source_proof_vault:new C2SourceProofVault(randomBytes(32),"test-only-key"),
      original:{issuer:scope.issuer,audience:scope.audience,key_id:scope.key_id,public_key:own.publicKey},
      source:{issuer:scope.source.issuer,audience:scope.source.audience,key_id:scope.source.key_id,public_key:source.publicKey}});
  };
  beforeAll(async () => {
    const target=new URL(database!);
    if(!/^\/portal_restore_rls_[a-f0-9]{8}$/.test(target.pathname))throw new Error("C2_OWNER_DB_NOT_DEDICATED");
    const guard=new Pool({connectionString:database,connectionTimeoutMillis:2000,query_timeout:6000});
    try {
      const observed=await guard.query("SELECT current_database() AS name, to_regnamespace('elp210_candidate') AS existing");
      if(observed.rows[0]?.name!==target.pathname.slice(1)||observed.rows[0]?.existing!==null)throw new Error("C2_OWNER_DB_NOT_DEDICATED");
    } finally {await guard.end();}
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 4, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    if(process.env.TEST_AUTHORITY_DATABASE_URL){
      const targetAuthority=new URL(process.env.TEST_AUTHORITY_DATABASE_URL);
      if(targetAuthority.pathname!==target.pathname)throw new Error("TEST_ONLY_TWO_CLEAN_CLUSTERS_REQUIRED");
      authority=new Pool({connectionString:process.env.TEST_AUTHORITY_DATABASE_URL,max:3,connectionTimeoutMillis:2000,query_timeout:6000});
      const [src,independent,clean]=await Promise.all([pool.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
        authority.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
        authority.query("SELECT to_regnamespace('portal_restore_original_custody') IS NULL AS clean")]);
      sourceSystem=src.rows[0].id;authoritySystem=independent.rows[0].id;
      if(sourceSystem===authoritySystem||!clean.rows[0].clean)throw new Error("TEST_ONLY_TWO_CLEAN_CLUSTERS_REQUIRED");
      await authority.query(await readFile(join(__dirname,"../src/execution-v2/restore-independent-custody-candidate.sql"),"utf8"));
    }
    [own, source] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    const suffix = randomUUID(); workspace = `test-only-workspace-${suffix}`;
    actor = { user_id: `test-only-owner-${suffix}`, session_id: `test-only-session-${suffix}`, session_generation: 7 };
    other = { user_id: `test-only-other-${suffix}`, session_id: `test-only-other-session-${suffix}`, session_generation: 7 };
    for (const person of [actor, other]) {
      await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
        VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [person.user_id]);
      await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
        idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
        clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [person.session_id, person.user_id]);
    }
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, actor.user_id]);
    for (const person of [actor, other]) await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, person.user_id]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/c2-p7-acceptance.sql"), "utf8"));
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/c2-p7-registration-table-candidate.sql"), "utf8"));
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/c2-block-new-fence-candidate.sql"), "utf8"));
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-only-registry',$1,$2,$3,'test-only-app',0,'ACTIVE',$4)`,["a".repeat(64),workspace,actor.user_id,Date.now()+120000]);
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-only-registry',$1,$2,$3,'test-only-source-workload','OPEN')`,["a".repeat(64),workspace,actor.user_id]);
    config = { issuer: "test-only-portal", audience: "test-only-pm", key_id: "test-only-human-key", private_key: own.privateKey,
      source: { issuer: "test-only-source", audience: "test-only-portal-authority", key_id: "test-only-source-key",
        public_key: source.publicKey, workload_id: "test-only-source-workload" },
      limits: { ttl_ms: 30_000, maximum_unresolved: 10, maximum_retained: 20 },
      installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: Date.now() + 120_000 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  afterEach(async () => {
    await pool.query("DROP SCHEMA IF EXISTS elp210_c2_delivery_candidate CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS elp210_c2_fence_candidate CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS elp210_c2_p7_candidate CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' AND user_id=$1", [actor.user_id]);
    for (const person of [actor, other]) await pool.query("DELETE FROM portal_users WHERE user_id=$1", [person.user_id]);
  });
  afterAll(async () => { await pool?.end();await authority?.end(); });

  it("does not clear a drain while a retired C2 lease retains an uncertain delivery", async () => {
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/c2-delivery-obligation-candidate.sql"),"utf8"));
    await pool.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(8,8)");
    const original=await issue();
    await pool.query(`INSERT INTO elp210_c2_delivery_candidate.obligations
      (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
      SELECT lease_id,workspace_id,subject_id,workload_id,request_digest,$2,$3,12,expires_at_ms,'RESERVED'
      FROM elp210_candidate.leases WHERE lease_id=$1`,[original.lease_id,`sha256:${"a".repeat(64)}`,`sha256:${"b".repeat(64)}`]);
    const drainId="test-only-retained-delivery",drain=await candidate.beginDrain(drainId);
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[original.lease_id])).rows[0].phase).toBe("RETIRED");
    expect(drain).toMatchObject({status:"DRAIN_UNKNOWN",pending:1});
    await expect(candidate.endDrain(drainId,drain.authority_revision)).rejects.toMatchObject({code:"CURRENT_HUMAN_DRAIN_UNRESOLVED"});
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBe(drainId);
    await pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id=$1",[original.lease_id]);
    expect(await candidate.drainStatus(drainId)).toMatchObject({status:"DRAIN_UNKNOWN",pending:1});
    await expect(candidate.endDrain(drainId,drain.authority_revision)).rejects.toMatchObject({code:"CURRENT_HUMAN_DRAIN_UNRESOLVED"});
    await pool.query("ALTER TABLE elp210_c2_delivery_candidate.obligations ENABLE ROW LEVEL SECURITY");
    await expect(candidate.drainStatus(drainId)).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
    await expect(candidate.endDrain(drainId,drain.authority_revision)).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
    await pool.query("ALTER TABLE elp210_c2_delivery_candidate.obligations DISABLE ROW LEVEL SECURITY");
    await pool.query("ALTER TABLE elp210_candidate.leases ENABLE ROW LEVEL SECURITY");
    await expect(candidate.drainStatus(drainId)).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
    await pool.query("ALTER TABLE elp210_candidate.leases DISABLE ROW LEVEL SECURITY");
    await pool.query("ALTER TABLE elp210_c2_delivery_candidate.obligations RENAME TO test_only_hidden_obligations");
    await expect(candidate.drainStatus(drainId)).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  },30000);

  it("requires delivery schema for a pinned C2 deployment even when no local original exists", async () => {
    const pinned=await CurrentHumanCandidate.create(pool,{...config,c2_delivery_schema_required:true});
    expect(pinned.requiresC2DeliverySchema()).toBe(true);
    await expect(pinned.beginDrain("test-only-require-delivery")).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
    expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
    expect(candidate.requiresC2DeliverySchema()).toBe(false);
    expect(await candidate.beginDrain("test-only-legacy-without-delivery")).toMatchObject({status:"DRAIN_READY",pending:0});
  },30000);

  it("refuses generic and STATUS issuance in a P7-required C2 composition", async () => {
    const pinned=await CurrentHumanCandidate.create(pool,{...config,c2_delivery_schema_required:true});
    const binding={workspace_id:workspace,environment:"paper" as const,workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit)};
    const link={context_id:"test-only-context",original_digest:`sha256:${"a".repeat(64)}`};
    await expect(pinned.issue(actor,binding)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    await expect(pinned.issueCommandStatus(actor,binding,link as never)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    await expect(pinned.resumeCommandStatusIssue(actor,binding,"test-only-lease")).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    expect(Number((await pool.query("SELECT count(*) AS n FROM elp210_candidate.leases")).rows[0].n)).toBe(0);
  });

  it("does not revalidate or ENTER an older generic lease after C2 is pinned, but settles its signed rollback", async () => {
    const binding={workspace_id:workspace,environment:"paper" as const,workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit)};
    const old=await candidate.issue(actor,binding);
    const pinned=await CurrentHumanCandidate.create(pool,{...config,c2_delivery_schema_required:true});
    await expect(pinned.revalidateIssue(actor,binding,old)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    const now=Math.floor(Date.now()/1000),attempt=`test-only-${randomUUID()}`;
    const proof=async(phase:"ENTER"|"ROLLED_BACK")=>new SignJWT({iss:config.source.issuer,aud:config.source.audience,
      sub:config.source.workload_id,jti:randomUUID(),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",
      lease_id:old.lease_id,attempt_id:attempt,...binding,phase,
      source_receipt_id:phase==="ROLLED_BACK"?"test-only-rollback":null,
      source_receipt_digest:phase==="ROLLED_BACK"?`sha256:${"a".repeat(64)}`:null})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(source.privateKey);
    await expect(pinned.enter(old.token,await proof("ENTER"))).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    expect(await pinned.resolve(await proof("ROLLED_BACK"))).toEqual({replayed:false,phase:"ROLLED_BACK"});
    expect(await pinned.resolve(await proof("ROLLED_BACK"))).toEqual({replayed:true,phase:"ROLLED_BACK"});
  });

  it("mints for the current protected owner with the raw request digest and exact 16 claims", async () => {
    // The validated signing config and database must remain pinned after
    // composition; an ordinary JS property must neither reveal the key nor
    // redirect a later owner issuance to a substituted trust/pool.
    expect(Reflect.get(candidate,"config")).toBeUndefined();
    expect(Reflect.set(candidate,"config",{...config,issuer:"test-only-substitute"})).toBe(true);
    expect(Reflect.set(candidate,"pool",null)).toBe(true);
    expect(Reflect.set(candidate,"humanPublicKey",null)).toBe(true);
    expect(Reflect.set(candidate,"reverseTrustDigest",null)).toBe(true);
    expect(Reflect.set(candidate,"humanSigningKeyDigest",null)).toBe(true);
    expect(candidate.usesPool(pool)).toBe(true);
    const req = request(), result = await issue(req), verified = await jwtVerify(result.token, own.publicKey);
    expect(Object.keys(verified.payload).sort()).toEqual(["iss", "aud", "sub", "sid", "jti", "iat", "nbf", "exp", "purpose",
      "principal_kind", "session_revision", "authority_revision", "workspace_id", "environment", "workload_id", "request_digest"].sort());
    expect(verified.payload).toMatchObject({ sub: actor.user_id, sid: actor.session_id, jti: result.lease_id,
      workspace_id: workspace, environment: "paper", workload_id: config.source.workload_id,
      request_digest: pmHttpRequestDigest(req, limit), purpose: "pma.identity.v1", principal_kind: "human" });
    expect(verified.payload.nbf).toBe(verified.payload.iat);
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBeLessThanOrEqual(60);
    const stored=await pool.query("SELECT human_issuer,source_trust_digest,human_signing_key_digest FROM elp210_candidate.leases WHERE lease_id=$1",[result.lease_id]);
    expect(stored.rows[0]?.human_issuer).toBe(config.issuer);
    expect(stored.rows[0]?.source_trust_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stored.rows[0]?.human_signing_key_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const rotated=await CurrentHumanCandidate.create(pool,{...config,issuer:"test-only-other-issuer"});
    await expect(rotated.revalidateIssue(actor,{workspace_id:workspace,environment:"paper",workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(req,limit)},result)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
  });

  it("holds the owner session lock during C2 issue revalidation", async () => {
    const req = request(), issued = await issue(req), blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT session_id FROM auth_sessions WHERE session_id=$1 FOR UPDATE", [actor.session_id]);
      // A concurrent session mutation may be in flight. An unlocked MVCC read
      // can observe the old ACTIVE row and incorrectly finish revalidation.
      await expect(candidate.revalidateC2ProtectedOwnerIssue(actor, actor.user_id, req, limit, issued))
        .rejects.toMatchObject({code:"55P03"});
      await blocker.query("ROLLBACK");
      await expect(candidate.revalidateC2ProtectedOwnerIssue(actor, actor.user_id, req, limit, issued)).resolves.toBeUndefined();
    } finally { await blocker.query("ROLLBACK").catch(() => {}); blocker.release(); }
  });

  it("caps identity at registration expiry, blocks later ENTER, and still settles an entered original",async()=>{
    const expiry=Date.now()+8000,workload="test-only-short-source";
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-only-short',$1,$2,$3,'test-only-app',0,'ACTIVE',$4)`,["b".repeat(64),workspace,actor.user_id,expiry]);
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-only-short',$1,$2,$3,$4,'OPEN')`,["b".repeat(64),workspace,actor.user_id,workload]);
    const scoped={...config,source:{...config.source,workload_id:workload}};
    const issuer=await CurrentHumanCandidate.create(pool,scoped),first=request();
    const custody=await independentStore(scoped),writer=new C2CustodiedIssuerCandidate(issuer,custody);
    const terminal=new C2CustodiedTerminalCandidate(pool,issuer,custody);
    const second={...request(),body:Buffer.from('{"idempotency_key":"test-only-second"}')};
    const entered=await writer.issue(actor,actor.user_id,first,limit);
    const waiting=await writer.issue(actor,actor.user_id,second,limit);
    expect(entered.expires_at_ms).toBeLessThanOrEqual(expiry);
    expect(waiting.expires_at_ms).toBeLessThanOrEqual(expiry);
    const attempt=`test-only-${entered.lease_id}`;
    const proof=async(phase:"ENTER"|"COMMITTED")=>{const now=Math.floor(Date.now()/1000);
      return new SignJWT({iss:scoped.source.issuer,aud:scoped.source.audience,sub:workload,jti:randomUUID(),
        iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:entered.lease_id,attempt_id:attempt,
        workspace_id:workspace,environment:"paper",workload_id:workload,request_digest:pmHttpRequestDigest(first,limit),phase,
        source_receipt_id:phase==="COMMITTED"?"test-only-terminal":null,
        source_receipt_digest:phase==="COMMITTED"?`sha256:${"d".repeat(64)}`:null})
        .setProtectedHeader({alg:"EdDSA",kid:scoped.source.key_id,typ:"JWT"}).sign(source.privateKey);};
    await terminal.enter(entered.token,await proof("ENTER"));
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,expiry-Date.now()+100)));
    await expect(pool.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
      [waiting.lease_id,`test-only-${waiting.lease_id}`])).rejects.toThrow("C2_FENCE_BLOCK_NEW");
    await expect(issuer.issueC2ProtectedOwner(actor,actor.user_id,{...request(),body:Buffer.from("new")},limit))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FENCE_REQUIRED"});
    expect((await terminal.resolve(await proof("COMMITTED"))).phase).toBe("COMMITTED");
  },20000);

  it("refuses a registration whose authority revision no longer matches",async()=>{
    await pool.query("UPDATE elp210_candidate.authority SET revision=1 WHERE singleton");
    await expect(issue()).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FENCE_REQUIRED"});
    const now=Date.now();
    // Legacy writers may still submit the stale matching lease/registration
    // revision; the DB fence must compare against the locked current authority.
    await expect(pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES($1,0,$2,$3,7,$4,'paper',$5,$6,'test-only',$7,$8)`,
      [`test-only-stale-${randomUUID()}`,actor.user_id,actor.session_id,workspace,config.source.workload_id,
        `sha256:${"e".repeat(64)}`,now,now+30000])).rejects.toThrow("C2_FENCE_BLOCK_NEW");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
  });

  it("refuses a different human signing key under the same issuer while preserving exact-source terminal settlement", async () => {
    const custody=await independentStore(config),writer=new C2CustodiedIssuerCandidate(candidate,custody);
    const result=await writer.issue(actor,actor.user_id,request(),limit), replacement=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const rotated=await CurrentHumanCandidate.create(pool,{...config,private_key:replacement.privateKey});
    const binding={workspace_id:workspace,environment:"paper" as const,workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit)};
    await expect(rotated.revalidateIssue(actor,binding,result)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    const renamed=await CurrentHumanCandidate.create(pool,{...config,key_id:"test-only-renamed-human-key"});
    await expect(renamed.revalidateIssue(actor,binding,result)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    const forged=await new SignJWT(decodeJwt(result.token)).setProtectedHeader({alg:"EdDSA",kid:config.key_id,typ:"JWT"})
      .sign(replacement.privateKey);
    const attempt=`test-only-${result.lease_id}`,now=Math.floor(Date.now()/1000);
    const proof=async(phase:"ENTER"|"COMMITTED")=>new SignJWT({iss:config.source.issuer,aud:config.source.audience,
      sub:config.source.workload_id,jti:randomUUID(),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",
      lease_id:result.lease_id,attempt_id:attempt,workspace_id:workspace,environment:"paper",
      workload_id:config.source.workload_id,request_digest:binding.request_digest,phase,
      source_receipt_id:phase==="COMMITTED"?"test-only-terminal":null,
      source_receipt_digest:phase==="COMMITTED"?`sha256:${"d".repeat(64)}`:null})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(source.privateKey);
    await expect(rotated.enterWithCustody(forged,await proof("ENTER"),custody)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_CUSTODY_REQUIRED"});
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[result.lease_id])).rows[0].phase).toBe("ISSUED");
    await expect(pool.query("UPDATE elp210_candidate.leases SET human_signing_key_digest=$2 WHERE lease_id=$1",
      [result.lease_id,`sha256:${"a".repeat(64)}`])).rejects.toThrow("CURRENT_HUMAN_TRANSITION_INVALID");
    await new C2CustodiedTerminalCandidate(pool,candidate,custody).enter(result.token,await proof("ENTER"));
    await pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'");
    // A human key change must not strand a transaction that already ENTERED:
    // source-authenticated terminal settlement remains possible after revoke.
    expect((await new C2CustodiedTerminalCandidate(pool,rotated,custody).resolve(await proof("COMMITTED"))).phase).toBe("COMMITTED");
  });

  it("rejects another workspace owner, spoofed subject and revoked owner session without an issue", async () => {
    await expect(candidate.issueC2ProtectedOwner(other, actor.user_id, request(), limit)).rejects.toMatchObject({ code: "CURRENT_HUMAN_C2_OWNER_REQUIRED" });
    await expect(candidate.issueC2ProtectedOwner(other, other.user_id, request(), limit)).rejects.toMatchObject({ code: "CURRENT_HUMAN_C2_OWNER_REQUIRED" });
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
    await expect(issue()).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
  });

  it("serializes concurrent duplicate requests, and a restarted candidate never replaces a lost original", async () => {
    const settled = await Promise.allSettled([issue(), issue()]);
    expect(settled.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(r => r.status === "rejected")).toHaveLength(1);
    const restarted = await CurrentHumanCandidate.create(pool, config);
    await expect(restarted.issueC2ProtectedOwner(actor, actor.user_id, request(), limit))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
  });

  it("resumes only the exact still-authorized original assertion after restart",async()=>{
    const original=await issue(),restarted=await CurrentHumanCandidate.create(pool,config);
    await expect(restarted.revalidateC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,original)).resolves.toBeUndefined();
    const invalidSignature=original.token.slice(0,original.token.lastIndexOf(".")+1)+"A".repeat(86);
    await expect(restarted.revalidateC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,
      {...original,token:invalidSignature})).rejects.toMatchObject({code:"CURRENT_HUMAN_ASSERTION_CHANGED"});
    const resumed=await restarted.resumeC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,original.lease_id);
    expect(resumed).toEqual(original);
    expect(await restarted.resumeC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit)).toEqual(original);
    const altered={...request(),body:Buffer.from('{"idempotency_key":"different"}')};
    await expect(restarted.resumeC2ProtectedOwnerIssue(actor,actor.user_id,altered,limit,original.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(restarted.resumeC2ProtectedOwnerIssue(other,actor.user_id,request(),limit,original.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_OWNER_REQUIRED"});
    const replacement=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const rotated=await CurrentHumanCandidate.create(pool,{...config,private_key:replacement.privateKey});
    await expect(rotated.resumeC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,original.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(restarted.beginDrain("test-only-c2-resume-revoke")).resolves.toMatchObject({status:"DRAIN_READY"});
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id]);
    await expect(restarted.resumeC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,original.lease_id)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
  });

  it("upgrades a disposable legacy candidate without inventing a historical issuer", async () => {
    const prior=await issue();
    // This destructive simulation is confined to the name-checked disposable
    // test database; it is not an instruction to alter a running installation.
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN human_issuer, DROP COLUMN source_trust_digest, DROP COLUMN human_signing_key_digest, DROP COLUMN human_assertion_digest, DROP COLUMN c2_p7_binding_digest, DROP COLUMN c2_p7_owner_intent_id");
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/c2-human-issuer-upgrade-candidate.sql"),"utf8"));
    const saved=await pool.query("SELECT human_issuer,source_trust_digest,human_signing_key_digest,human_assertion_digest,c2_p7_binding_digest,c2_p7_owner_intent_id,subject_id,request_digest FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id]);
    expect(saved.rows).toEqual([{human_issuer:null,source_trust_digest:null,human_signing_key_digest:null,human_assertion_digest:null,c2_p7_binding_digest:null,c2_p7_owner_intent_id:null,subject_id:actor.user_id,request_digest:pmHttpRequestDigest(request(),limit)}]);
    await expect(candidate.resumeC2ProtectedOwnerIssue(actor,actor.user_id,request(),limit,prior.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    // A previous candidate may already have the issuer column but lack the
    // newer source pin. This simulation is also disposable-only.
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN source_trust_digest");
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/c2-human-issuer-upgrade-candidate.sql"),"utf8"));
    const partial=await pool.query("SELECT human_issuer,source_trust_digest,subject_id FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id]);
    expect(partial.rows).toEqual([{human_issuer:null,source_trust_digest:null,subject_id:actor.user_id}]);
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN human_signing_key_digest");
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/c2-human-issuer-upgrade-candidate.sql"),"utf8"));
    expect((await pool.query("SELECT human_signing_key_digest FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id])).rows[0])
      .toEqual({human_signing_key_digest:null});
    const rotated=await CurrentHumanCandidate.create(pool,config);
    await expect(rotated.revalidateIssue(actor,{workspace_id:workspace,environment:"paper",workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit)},prior)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    // A partially present nullable text column is not sufficient: accepting
    // it without its original digest constraint would silently bless drift.
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN source_trust_digest, DROP COLUMN human_signing_key_digest");
    await pool.query("ALTER TABLE elp210_candidate.leases ADD COLUMN source_trust_digest text");
    const upgrade=await readFile(join(__dirname,"../src/execution-v2/c2-human-issuer-upgrade-candidate.sql"),"utf8");
    const refuseUpgrade=async (reason:string)=>{
      const client=await pool.connect();
      try { await expect(client.query(upgrade)).rejects.toThrow(reason); }
      finally { await client.query("ROLLBACK"); client.release(); }
    };
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_CONSTRAINT_INVALID");
    const untouched=await pool.query(`SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
      AND attname='human_signing_key_digest' AND NOT attisdropped`);
    expect(untouched.rows[0].n).toBe(0);
    await pool.query("ALTER TABLE elp210_candidate.leases ADD CONSTRAINT test_weak_pin CHECK (source_trust_digest IS NULL OR true)");
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_CONSTRAINT_INVALID");
    await pool.query("ALTER TABLE elp210_candidate.leases DROP CONSTRAINT test_weak_pin");
    await pool.query("ALTER TABLE elp210_candidate.leases ADD CONSTRAINT test_unvalidated_pin CHECK (source_trust_digest IS NULL OR source_trust_digest ~ '^sha256:[a-f0-9]{64}$') NOT VALID");
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_CONSTRAINT_INVALID");
    await pool.query("ALTER TABLE elp210_candidate.leases DROP CONSTRAINT test_unvalidated_pin");
    await pool.query("ALTER TABLE elp210_candidate.leases ALTER COLUMN source_trust_digest SET DEFAULT 'sha256:0000000000000000000000000000000000000000000000000000000000000000'");
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_COLUMN_INVALID");
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN source_trust_digest");
    await pool.query(upgrade);
    expect((await pool.query("SELECT source_trust_digest,human_signing_key_digest FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id])).rows[0])
      .toEqual({source_trust_digest:null,human_signing_key_digest:null});
    // Never overwrite a drifted installed trigger function during upgrade.
    // Preserve its body and the still-missing column on refusal; the test
    // deliberately changes only the disposable schema.
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN source_trust_digest");
    const functionDdl=(await pool.query("SELECT pg_get_functiondef('elp210_candidate.c2_custody_binding_immutable()'::regprocedure) AS ddl")).rows[0].ddl as string;
    await pool.query("CREATE OR REPLACE FUNCTION elp210_candidate.c2_custody_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$");
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_FUNCTION_INVALID");
    expect((await pool.query("SELECT prosrc FROM pg_proc WHERE oid='elp210_candidate.c2_custody_binding_immutable()'::regprocedure")).rows[0].prosrc)
      .toContain("BEGIN RETURN NEW; END");
    expect((await pool.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass AND attname='source_trust_digest' AND NOT attisdropped")).rows[0].n).toBe(0);
    await pool.query(functionDdl);
    await pool.query("ALTER FUNCTION elp210_candidate.c2_custody_binding_immutable() SECURITY DEFINER");
    await refuseUpgrade("C2_ISSUER_UPGRADE_EXISTING_FUNCTION_INVALID");
    expect((await pool.query("SELECT prosecdef FROM pg_proc WHERE oid='elp210_candidate.c2_custody_binding_immutable()'::regprocedure")).rows[0].prosecdef).toBe(true);
    await pool.query("ALTER FUNCTION elp210_candidate.c2_custody_binding_immutable() SECURITY INVOKER");
    await pool.query(upgrade);
    expect((await pool.query("SELECT source_trust_digest FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id])).rows[0])
      .toEqual({source_trust_digest:null});
    // A truly older schema may have neither function nor trigger; creation
    // remains supported without replacing a pre-existing object.
    await pool.query("DROP TRIGGER c2_custody_binding_immutable ON elp210_candidate.leases");
    await pool.query("DROP FUNCTION elp210_candidate.c2_custody_binding_immutable()");
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN source_trust_digest");
    await pool.query(upgrade);
    expect((await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='elp210_candidate.leases'::regclass AND tgname='c2_custody_binding_immutable' AND tgenabled='O'")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT source_trust_digest FROM elp210_candidate.leases WHERE lease_id=$1",[prior.lease_id])).rows[0])
      .toEqual({source_trust_digest:null});
    // A concurrent owner must not be able to change a previously checked
    // constraint while the upgrade waits for its first ALTER TABLE lock.
    // Both connections are confined to this name-checked disposable DB.
    await pool.query("ALTER TABLE elp210_candidate.leases DROP COLUMN human_signing_key_digest");
    const blocker=await pool.connect(),runner=await pool.connect();
    let pending:Promise<{ok:boolean;error?:unknown}>|undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE elp210_candidate.leases IN ACCESS EXCLUSIVE MODE");
      const runnerPid=(await runner.query("SELECT pg_backend_pid() AS pid")).rows[0].pid as number;
      pending=runner.query(upgrade).then(()=>({ok:true}),error=>({ok:false,error}));
      let waiting=false;
      for(let i=0;i<100;i++) {
        const observation=await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[runnerPid]);
        if(observation.rows[0]?.wait_event_type==="Lock"){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
      await blocker.query("ALTER TABLE elp210_candidate.leases DROP CONSTRAINT leases_source_trust_digest_check");
      await blocker.query("ALTER TABLE elp210_candidate.leases ADD CONSTRAINT test_concurrent_weak_pin CHECK (source_trust_digest IS NULL OR true)");
      await blocker.query("COMMIT");
      const outcome=await pending;
      expect(outcome.ok).toBe(false);
      expect(String(outcome.error)).toContain("C2_ISSUER_UPGRADE_EXISTING_CONSTRAINT_INVALID");
      await runner.query("ROLLBACK");
      expect((await pool.query("SELECT count(*)::int AS n FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass AND attname='human_signing_key_digest' AND NOT attisdropped")).rows[0].n).toBe(0);
    } finally {
      await blocker.query("ROLLBACK").catch(()=>undefined);
      await pending?.catch(()=>undefined);
      await runner.query("ROLLBACK").catch(()=>undefined);
      blocker.release();runner.release();
    }
  });

  it("binds exact raw path, query and body bytes rather than parsed or reserialized values", async () => {
    const original = request(), changes: PmHttpRequestBytes[] = [original,
      { ...original, raw_path: Buffer.from("/test-only/capital/%72oot/apply") },
      { ...original, query_string: Buffer.from("source=%6Fne") },
      { ...original, body: Buffer.from('{ "idempotency_key":"test-only-original"}') }];
    // This is a raw-byte binding test, not a concurrent-admission test.
    // Await each completed attempt so no rejected Promise.all can leave work
    // running when afterEach tears down the dedicated schema.
    const result:Awaited<ReturnType<typeof issue>>[]=[];
    for (const change of changes) result.push(await issue(change));
    const digests = result.map(r => decodeJwt(r.token).request_digest);
    expect(new Set(digests).size).toBe(changes.length);
    expect(digests).toEqual(changes.map(r => pmHttpRequestDigest(r, limit)));
  });

  it("never treats a signed UNKNOWN or terminal as client delivery or permission to mint a replacement", async () => {
    const custody=await independentStore(config),writer=new C2CustodiedIssuerCandidate(candidate,custody);
    const terminal=new C2CustodiedTerminalCandidate(pool,candidate,custody);
    const result = await writer.issue(actor,actor.user_id,request(),limit), attempt = `test-only-attempt-${result.lease_id}`, now = Math.floor(Date.now() / 1000);
    const claim = { iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: result.lease_id, attempt_id: attempt, workspace_id: workspace, environment: "paper",
      workload_id: config.source.workload_id, request_digest: pmHttpRequestDigest(request(), limit) };
    const proof = async (phase: "ENTER" | "UNKNOWN" | "COMMITTED") => new SignJWT({ ...claim, jti: randomUUID(), phase,
      source_receipt_id: phase === "COMMITTED" ? "test-only-source-terminal" : null,
      source_receipt_digest: phase === "COMMITTED" ? `sha256:${"a".repeat(64)}` : null })
      .setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
    await terminal.enter(result.token, await proof("ENTER"));
    await terminal.resolve(await proof("UNKNOWN"));
    await expect(issue()).rejects.toMatchObject({ code: "CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED" });
    await terminal.resolve(await proof("COMMITTED"));
    await expect(issue()).rejects.toMatchObject({ code: "CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED" });
  });
  it("blocks fresh C2 issue and legacy ENTER after registry revoke without changing revision or drain",async()=>{
    const result=await issue(), attempt=`test-only-attempt-${result.lease_id}`, now=Math.floor(Date.now()/1000);
    const proof=await new SignJWT({iss:config.source.issuer,aud:config.source.audience,sub:config.source.workload_id,
      jti:randomUUID(),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:result.lease_id,
      attempt_id:attempt,workspace_id:workspace,environment:"paper",workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit),phase:"ENTER",source_receipt_id:null,source_receipt_digest:null})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(source.privateKey);
    await pool.query("UPDATE elp210_candidate.authority SET revision=9007199254740991,drain_id='test-only-drain' WHERE singleton");
    await pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'");
    expect((await pool.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0])
      .toMatchObject({revision:"9007199254740991",drain_id:"test-only-drain"});
    expect((await pool.query("SELECT state FROM elp210_c2_fence_candidate.scopes WHERE registration_key='test-only-registry'")).rows[0].state).toBe("BLOCK_NEW");
    // Trigger independently fences old processes; this direct legacy-style
    // transition cannot bypass a stateful newer issuer implementation.
    await expect(pool.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",[result.lease_id,attempt])).rejects.toThrow("C2_FENCE_BLOCK_NEW");
    await expect(candidate.enter(result.token,proof)).rejects.toThrow();
    await expect(issue()).rejects.toThrow();
    // Another principal outside the pinned scope is not blocked by this fence.
    const nowMs=Date.now();
    await expect(pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES($1,9007199254740991,$2,$3,7,$4,'paper',$5,$6,'test-only',$7,$8)`,
      [`test-only-generic-${randomUUID()}`,other.user_id,other.session_id,workspace,config.source.workload_id,
        `sha256:${"b".repeat(64)}`,nowMs,nowMs+30000])).resolves.toBeDefined();
  });
  it("refuses guard activation over unclassified legacy work and fails C2 issue without guard schema",async()=>{
    const nowMs=Date.now();
    await pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
      VALUES($1,0,$2,$3,7,$4,'paper',$5,$6,'test-only',$7,$8)`,
      [`test-only-legacy-${randomUUID()}`,other.user_id,other.session_id,workspace,config.source.workload_id,
        `sha256:${"c".repeat(64)}`,nowMs,nowMs+30000]);
    await pool.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-only-other-registry',$1,$2,$3,'test-only-app',0,'ACTIVE',$4)`,["b".repeat(64),workspace,other.user_id,nowMs+60000]);
    await expect(pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-only-other-registry',$1,$2,$3,$4,'OPEN')`,["b".repeat(64),workspace,other.user_id,config.source.workload_id]))
      .rejects.toThrow("C2_FENCE_LEGACY_UNCLASSIFIED");
    await pool.query("DROP SCHEMA elp210_c2_fence_candidate CASCADE");
    await expect(issue()).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FENCE_REQUIRED"});
  });
  it("permits authenticated exact-original UNKNOWN and terminal after BLOCK_NEW",async()=>{
    const custody=await independentStore(config),writer=new C2CustodiedIssuerCandidate(candidate,custody);
    const terminal=new C2CustodiedTerminalCandidate(pool,candidate,custody);
    const result=await writer.issue(actor,actor.user_id,request(),limit),attempt=`test-only-${result.lease_id}`,now=Math.floor(Date.now()/1000);
    const claim={iss:config.source.issuer,aud:config.source.audience,sub:config.source.workload_id,
      iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:result.lease_id,attempt_id:attempt,
      workspace_id:workspace,environment:"paper",workload_id:config.source.workload_id,
      request_digest:pmHttpRequestDigest(request(),limit)};
    const proof=async(phase:"ENTER"|"UNKNOWN"|"COMMITTED")=>new SignJWT({...claim,jti:randomUUID(),phase,
      source_receipt_id:phase==="COMMITTED"?"test-only-terminal":null,
      source_receipt_digest:phase==="COMMITTED"?`sha256:${"d".repeat(64)}`:null})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(source.privateKey);
    await terminal.enter(result.token,await proof("ENTER"));
    await pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'");
    expect((await terminal.resolve(await proof("UNKNOWN"))).phase).toBe("UNKNOWN");
    const committed=await proof("COMMITTED");
    expect((await terminal.resolve(committed)).phase).toBe("COMMITTED");
    expect((await terminal.resolve(committed)).replayed).toBe(true);
  });
  it("refuses to return a C2 token if revoke commits between ISSUE and revalidation",async()=>{
    let signalCommitted!:()=>void,release!:()=>void,intercepted=false;
    const committed=new Promise<void>(resolve=>{signalCommitted=resolve;});
    const gate=new Promise<void>(resolve=>{release=resolve;});
    const guardedPool={options:pool.options,connect:async()=>{
      const client=await pool.connect();return new Proxy(client,{get(target,key){
        if(key==="query")return async(...args:unknown[])=>{
          const query=target.query.bind(target) as unknown as (...values:unknown[])=>Promise<unknown>;
          const result=await query(...args);
          if(args[0]==="COMMIT"&&!intercepted){intercepted=true;signalCommitted();await gate;}
          return result;
        };
        const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
      }});
    }} as unknown as Pool;
    const issuer=await CurrentHumanCandidate.create(guardedPool,config);
    const attempt=issuer.issueC2ProtectedOwner(actor,actor.user_id,request(),limit);
    try {
      await Promise.race([committed,attempt.then(()=>{throw new Error("TEST_ISSUE_DID_NOT_PAUSE");})]);
      await pool.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'");
      release();
      await expect(attempt).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FENCE_REQUIRED"});
      // A locally committed original is retained, not silently erased, ACKed,
      // replaced or represented as source rollback when delivery is refused.
      const rows=await pool.query("SELECT phase FROM elp210_candidate.leases");
      expect(rows.rows).toEqual([{phase:"ISSUED"}]);
    } finally {release();await attempt.catch(()=>{});}
  });
  it("refuses delivery if the final clock crosses expiry while checking the C2 fence",async()=>{
    let committed=false,fenceRead=false;
    const guardedPool={options:pool.options,connect:async()=>{
      const client=await pool.connect();return new Proxy(client,{get(target,key){
        if(key==="query")return async(...args:unknown[])=>{
          const query=target.query.bind(target) as unknown as (...values:unknown[])=>Promise<unknown>;
          const result=await query(...args);
          if(args[0]==="COMMIT")committed=true;
          if(committed&&String(args[0]).includes("FROM elp210_c2_fence_candidate.scopes s JOIN"))fenceRead=true;
          if(fenceRead&&String(args[0]).includes("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms"))
            return {rowCount:1,rows:[{ms:Number.MAX_SAFE_INTEGER}]};
          return result;
        };
        const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
      }});
    }} as unknown as Pool;
    const issuer=await CurrentHumanCandidate.create(guardedPool,config);
    await expect(issuer.issueC2ProtectedOwner(actor,actor.user_id,request(),limit))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    expect(fenceRead).toBe(true);
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases")).rows).toEqual([{phase:"ISSUED"}]);
  });
  it("serializes an old-process raw INSERT against revocation, with no revision bump",async()=>{
    const writer=await pool.connect();let attempt:Promise<string>|undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      await writer.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'");
      const nowMs=Date.now();
      attempt=pool.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES($1,0,$2,$3,7,$4,'paper',$5,$6,'test-only',$7,$8)`,
      [`test-only-old-${randomUUID()}`,actor.user_id,actor.session_id,workspace,config.source.workload_id,
        `sha256:${"e".repeat(64)}`,nowMs,nowMs+30000]).then(()=>"incorrect success",()=>"blocked");
      let waiting=false;
      for(let i=0;i<40;i++){
        const count=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%INSERT INTO elp210_candidate.leases%'`);
        if(count.rows[0].n>0){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      await writer.query("COMMIT");
      expect(await attempt).toBe("blocked");
      expect((await pool.query("SELECT revision::text FROM elp210_candidate.authority WHERE singleton")).rows[0].revision).toBe("0");
    } finally {await writer.query("ROLLBACK").catch(()=>{});writer.release();await attempt?.catch(()=>{});}
  });
  it("does not grant an unprivileged DB role access to change or erase the scope",async()=>{
    const role=`test_c2_fence_${workspace.replace(/-/g,"").slice(-8)}`;
    if(!/^test_c2_fence_[a-f0-9]{8}$/.test(role))throw new Error("C2_TEST_ROLE_INVALID");
    await pool.query(`CREATE ROLE ${role} NOLOGIN`);
    const db=await pool.connect();
    try {
      await db.query("BEGIN");await db.query(`SET LOCAL ROLE ${role}`);
      await expect(db.query("UPDATE elp210_c2_fence_candidate.scopes SET state='BLOCK_NEW'")).rejects.toThrow();
    } finally {await db.query("ROLLBACK").catch(()=>{});db.release();await pool.query(`DROP OWNED BY ${role}`);await pool.query(`DROP ROLE ${role}`);}
  });
  it("limits local revoke to a fixed-scope authority-first SECURITY DEFINER routine",async()=>{
    const name=(await pool.query("SELECT current_database() AS name")).rows[0].name as string;
    if(!/^portal_restore_rls_[a-f0-9]{8}$/.test(name))throw new Error("C2_OWNER_DB_NOT_DEDICATED");
    const definer=`test_c2_definer_${name.slice(-8)}`,caller=`test_c2_caller_${name.slice(-8)}`;
    const login=`test_c2_login_${name.slice(-8)}`;
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/c2-block-new-procedure-acl-candidate.sql"),"utf8"));
    try {
      await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD 'TEST_ONLY_PASSWORD' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS`);
      await pool.query(`GRANT ${caller} TO ${login}`);
      await pool.query(`INSERT INTO elp210_c2_fence_candidate.procedure_scope_pin
        (registration_key,registration_sha256,workspace_id,owner_user_id) VALUES('test-only-registry',$1,$2,$3)`,
      ["a".repeat(64),workspace,actor.user_id]);
      const loginUrl=new URL(database!);loginUrl.username=login;loginUrl.password="TEST_ONLY_PASSWORD";
      const callerPool=new Pool({connectionString:loginUrl.toString(),connectionTimeoutMillis:2000,query_timeout:6000});
      const db=await callerPool.connect();
      const call=async(params:unknown[])=>{
        await db.query("BEGIN");
        try {await db.query(`SET LOCAL ROLE ${caller}`);
          const result=await db.query(`SELECT elp210_c2_fence_candidate.revoke_registered_scope_candidate($1,$2,$3,$4,$5,$6) AS state`,params);
          await db.query("COMMIT");return result.rows[0].state;
        } catch(error) {await db.query("ROLLBACK");throw error;}
      };
      const args=["test-only-registry","a".repeat(64),actor.user_id,actor.session_id,actor.session_generation,workspace];
      try {
        await expect(call([args[0],"b".repeat(64),...args.slice(2)])).rejects.toThrow();
        await expect(call([args[0],args[1],other.user_id,other.session_id,other.session_generation,workspace])).rejects.toThrow();
        await expect(call([args[0],args[1],actor.user_id,actor.session_id,actor.session_generation,"test-only-other-workspace"])).rejects.toThrow();
        await db.query("BEGIN");await db.query(`SET LOCAL ROLE ${caller}`);
        await expect(db.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED' WHERE registration_key='test-only-registry'")).rejects.toThrow();
        await db.query("ROLLBACK");
        // The anchor's emergency reduction is still available when workspace
        // membership was removed; it does not reinstate any read/stream grant.
        await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[workspace,actor.user_id]);
        expect(await call(args)).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
        expect(await call(args)).toBe("REGISTRATION_REVOKED_BLOCK_NEW");
        expect((await pool.query("SELECT state FROM elp210_c2_fence_candidate.scopes WHERE registration_key='test-only-registry'")).rows[0].state).toBe("BLOCK_NEW");
        await expect(issue()).rejects.toThrow();
      } finally {db.release();await callerPool.end();}
    } finally {
      // Disposable cluster and deterministic role names; detach the candidate
      // routine before dropping its NOLOGIN owner and its narrowly held grants.
      await pool.query("DROP FUNCTION IF EXISTS elp210_c2_fence_candidate.revoke_registered_scope_candidate(text,text,text,text,bigint,text)");
      await pool.query(`DROP ROLE IF EXISTS ${login}`);
      await pool.query(`DROP OWNED BY ${caller}`);await pool.query(`DROP OWNED BY ${definer}`);
      await pool.query(`DROP ROLE ${caller}`);await pool.query(`DROP ROLE ${definer}`);
    }
  });
});
