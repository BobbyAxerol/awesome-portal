/** TEST_ONLY two disposable PostgreSQL clusters; fixtures are not source proof. */
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import {createServer,request as httpsRequest, type Server} from "node:https";
import { join } from "node:path";
import { decodeJwt, exportSPKI, generateKeyPair, SignJWT, type KeyLike } from "jose";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RestoreIndependentCustodyCandidate } from "../src/execution-v2/restore-independent-custody-candidate";
import { C2SourceProofVault } from "../src/execution-v2/restore-c2-source-proof-vault";
import { C2JournalAuthenticatorCandidate } from "../src/execution-v2/restore-c2-journal-authenticator-candidate";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { C2CustodiedIssuerCandidate, C2CustodyPendingError } from "../src/execution-v2/c2-custodied-issuer-candidate";
import { C2CustodiedTerminalCandidate } from "../src/execution-v2/c2-custodied-terminal-candidate";
import { prepareC2IssuerPublicAndReverse } from "../src/execution-v2/c2-human-issuer-composition";
import { createC2CustodiedCurrentHumanTransport } from "../src/execution-v2/current-human-transport";
import { CoreRestoreQuiescence, newRestoreDrainId } from "../src/execution-v2/restore-core-quiescence";
import { CurrentHumanRecoveryClient } from "../src/execution-v2/current-human-recovery-client";
import { RestoreC2OriginalRecovery } from "../src/execution-v2/restore-c2-original-recovery";
import {commonName,testCertificate} from "./fixtures/elp210-test-certificates";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { migrateTestDatabase } from "./harness";

const sourceUrl=process.env.TEST_DATABASE_URL, authorityUrl=process.env.TEST_AUTHORITY_DATABASE_URL;
const enabled=process.env.PORTAL_TEST_RESTORE_CHECKPOINT==="TEST_ONLY_DISPOSABLE_TWO_CLUSTERS"&&!!sourceUrl&&!!authorityUrl;
describe.skipIf(!enabled)("TEST_ONLY independent original/terminal custody candidate",()=>{
  let source:Pool,authority:Pool,restored:Pool,admin:Pool,store:RestoreIndependentCustodyCandidate,originalToken:string,alternateOriginal:string,terminalToken:string,wrongTerminal:string,wrongAttempt:string,enterToken:string,missingOriginal:string,wrongOwner:string;
  const cloneName=`portal_restore_clone_${randomBytes(4).toString("hex")}`;
  let config:ConstructorParameters<typeof RestoreIndependentCustodyCandidate>[2];
  let issuer:CurrentHumanCandidate,issuerConfig:CurrentHumanCandidateConfig;
  let sourceSigningKey:KeyLike;
  const custody_id=randomUUID(), originalId=randomUUID(), terminalId=randomUUID(), wrongId=randomUUID();
  const actor={user_id:"test-only-owner",session_id:"test-only-session",session_generation:7};
  const workspace="test-only-workspace", workload="test-only-source-workload";
  beforeAll(async()=>{
    for(const value of [sourceUrl!,authorityUrl!])if(!/^\/portal_restore_checkpoint_[a-f0-9]{8}$/.test(new URL(value).pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    source=new Pool({connectionString:sourceUrl,max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    authority=new Pool({connectionString:authorityUrl,max:3,connectionTimeoutMillis:2000,query_timeout:6000});
    const [s,a,empty]=await Promise.all([source.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT to_regnamespace('portal_restore_original_custody') IS NULL AS clean")]);
    if(s.rows[0].id===a.rows[0].id||!empty.rows[0].clean)throw new Error("TEST_ONLY_TWO_CLEAN_CLUSTERS_REQUIRED");
    await migrateTestDatabase(sourceUrl!);
    await source.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`,[actor.user_id]);
    await source.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[actor.session_id,actor.user_id]);
    await source.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)",[actor.user_id]);
    await source.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,actor.user_id]);
    await source.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,actor.user_id]);
    for(const file of ["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-registration-table-candidate.sql","c2-block-new-fence-candidate.sql"])
      await source.query(await readFile(join(__dirname,"../src/execution-v2",file),"utf8"));
    await source.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-only-registry',$1,$2,$3,'test-only-app',0,'ACTIVE',$4)`,["a".repeat(64),workspace,actor.user_id,Date.now()+180000]);
    await source.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-only-registry',$1,$2,$3,$4,'OPEN')`,["a".repeat(64),workspace,actor.user_id,workload]);
    await authority.query(await readFile(join(__dirname,"../src/execution-v2/restore-independent-custody-candidate.sql"),"utf8"));
    await authority.query(await readFile(join(__dirname,"../src/execution-v2/restore-c2-journal-authentication-candidate.sql"),"utf8"));
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[custody_id,s.rows[0].id,a.rows[0].id]);
    const [orig,src]=await Promise.all([generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true})]);
    sourceSigningKey=src.privateKey;
    issuerConfig={issuer:"test-core",audience:"test-pm",key_id:"test-original",private_key:orig.privateKey,
      source:{issuer:"test-source",audience:"test-core",key_id:"test-source",public_key:src.publicKey,workload_id:workload},
      limits:{ttl_ms:60000,maximum_unresolved:10,maximum_retained:20},
      installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:Date.now()+180000}};
    issuer=await CurrentHumanCandidate.create(source,issuerConfig);
    const request={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),
      query_string:Buffer.from("source=one"),body:Buffer.from('{"idempotency_key":"test-only-original"}')};
    config={custody_id,source_system_identifier:s.rows[0].id,
      authority_system_identifier:a.rows[0].id,workspace_id:workspace,workload_id:workload,protected_owner_subject:actor.user_id,maximum_events:4,
      source_proof_vault:new C2SourceProofVault(randomBytes(32),"test-only-key"),
      original:{issuer:"test-core",audience:"test-pm",key_id:"test-original",public_key:orig.publicKey},
      source:{issuer:"test-source",audience:"test-core",key_id:"test-source",public_key:src.publicKey}};
    store=new RestoreIndependentCustodyCandidate(source,authority,config);
    const issued=await issuer.issueC2ProtectedOwner(actor,actor.user_id,request,{request_bytes:4096},store.bindingDigest());
    originalToken=issued.token;
    const shared={lease_id:issued.lease_id,workspace_id:workspace,environment:"paper",workload_id:workload,
      request_digest:pmHttpRequestDigest(request,{request_bytes:4096})};
    const now=Math.floor(Date.now()/1000);
    const claims=decodeJwt(originalToken);
    alternateOriginal=await new SignJWT(claims).setProtectedHeader({alg:"EdDSA",kid:"test-original",typ:"JWT",cty:"test-only"}).sign(orig.privateKey);
    missingOriginal=await new SignJWT({...claims,jti:randomUUID()}).setProtectedHeader({alg:"EdDSA",kid:"test-original",typ:"JWT"}).sign(orig.privateKey);
    wrongOwner=await new SignJWT({...claims,sub:"test-only-not-owner"}).setProtectedHeader({alg:"EdDSA",kid:"test-original",typ:"JWT"}).sign(orig.privateKey);
    const makeTerminal=(request_digest:string)=>new SignJWT({...shared,request_digest,purpose:"pma.current-human-lease.v1",attempt_id:"test-attempt",
      phase:"COMMITTED",source_receipt_id:"test-receipt",source_receipt_digest:`sha256:${"b".repeat(64)}`,
      iss:"test-source",aud:"test-core",sub:shared.workload_id,jti:"test-proof-terminal",iat:now,nbf:now,exp:now+60})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(src.privateKey);
    terminalToken=await makeTerminal(shared.request_digest);
    wrongTerminal=await makeTerminal(`sha256:${"c".repeat(64)}`);
    wrongAttempt=await new SignJWT({...decodeJwt(terminalToken),attempt_id:"test-other-attempt"})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(src.privateKey);
    enterToken=await new SignJWT({...decodeJwt(terminalToken),phase:"ENTER",source_receipt_id:null,source_receipt_digest:null})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(src.privateKey);
    await expect(store.append("SIGNED_SOURCE_TERMINAL",wrongId,"0",wrongTerminal)).rejects.toThrow("RESTORE_CUSTODY_ORIGINAL_MISMATCH");
    // Clone an actual pre-terminal DB snapshot inside this disposable source
    // cluster. A database template is not a backup or cross-cluster restore.
    const dbName=new URL(sourceUrl!).pathname.slice(1);
    if(!/^portal_restore_checkpoint_[a-f0-9]{8}$/.test(dbName)||!/^portal_restore_clone_[a-f0-9]{8}$/.test(cloneName))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    const adminUrl=new URL(sourceUrl!);adminUrl.pathname="/postgres";
    admin=new Pool({connectionString:adminUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    await source.end();
    await admin.query(`CREATE DATABASE "${cloneName}" TEMPLATE "${dbName}"`);
    const cloneUrl=new URL(sourceUrl!);cloneUrl.pathname=`/${cloneName}`;
    restored=new Pool({connectionString:cloneUrl.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
    source=new Pool({connectionString:sourceUrl,max:2,connectionTimeoutMillis:2000,query_timeout:6000});
    issuer=await CurrentHumanCandidate.create(source,issuerConfig);
    store=new RestoreIndependentCustodyCandidate(source,authority,config);
  },30000);
  afterAll(async()=>{
    await restored?.end();
    if(admin) {try {await admin.query(`DROP DATABASE IF EXISTS "${cloneName}"`);} finally {await admin.end();}}
    await source?.end();await authority?.end();
  });
  it("upgrades a legacy custody helper without public execute and refuses drift",async()=>{
    const upgrade=await readFile(join(__dirname,"../src/execution-v2/restore-custody-catalog-lock-upgrade-candidate.sql"),"utf8");
    await authority.query("DROP FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write()");
    await expect(store.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
    await authority.query(upgrade);await authority.query(upgrade);
    const acl=await authority.query(`SELECT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p,
      LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      WHERE p.oid='portal_restore_original_custody.lock_guard_catalog_for_write()'::regprocedure
      AND a.grantee=0 AND a.privilege_type='EXECUTE') AS no_public`);
    expect(acl.rows[0].no_public).toBe(true);
    await expect(store.preflightOriginal()).resolves.toBeUndefined();
    const original=(await authority.query(`SELECT pg_get_functiondef(
      'portal_restore_original_custody.lock_guard_catalog_for_write()'::regprocedure) AS definition`)).rows[0].definition;
    await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN; END $$`);
    try {await expect(authority.query(upgrade)).rejects.toThrow("RESTORE_CUSTODY_HELPER_UPGRADE_UNSAFE");}
    finally {await authority.query("ROLLBACK");await authority.query(original);}
  });
  it("requires the bounded custody writer privileges before issuing an original",async()=>{
    // The role, password and database exist only in the disposable authority
    // cluster. A schema owner/superuser test cannot expose missing grants.
    const role=`custody_test_${randomBytes(8).toString("hex")}`;
    const password=randomBytes(24).toString("hex");
    const boundedId=randomUUID();
    const url=new URL(authorityUrl!);url.username=role;url.password=password;
    let bounded:Pool|undefined;
    await authority.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    try {
      await authority.query(`GRANT USAGE ON SCHEMA portal_restore_original_custody TO "${role}"`);
      await authority.query(`GRANT SELECT ON portal_restore_original_custody.head TO "${role}"`);
      await authority.query(`GRANT UPDATE (generation,event_hash) ON portal_restore_original_custody.head TO "${role}"`);
      await authority.query(`GRANT SELECT,INSERT ON portal_restore_original_custody.events, portal_restore_original_custody.source_proofs TO "${role}"`);
      await authority.query(`GRANT SELECT,INSERT ON portal_restore_original_custody.event_authentication TO "${role}"`);
      await authority.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO "${role}"`);
      await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
        VALUES($1,$2,$3,0,repeat('0',64))`,[boundedId,config.source_system_identifier,config.authority_system_identifier]);
      bounded=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:2000,query_timeout:6000});
      const restricted=new RestoreIndependentCustodyCandidate(source,bounded,{...config,custody_id:boundedId});
      await expect(restricted.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      await authority.query(`GRANT EXECUTE ON FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() TO "${role}"`);
      await expect(restricted.preflightOriginal()).resolves.toBeUndefined();
      await authority.query(`REVOKE INSERT ON portal_restore_original_custody.events FROM "${role}"`);
      await expect(restricted.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      await authority.query(`GRANT INSERT ON portal_restore_original_custody.events TO "${role}"`);
      await authority.query(`REVOKE UPDATE (generation) ON portal_restore_original_custody.head FROM "${role}"`);
      await expect(restricted.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      await authority.query(`GRANT UPDATE (generation) ON portal_restore_original_custody.head TO "${role}"`);
      await authority.query(`REVOKE UPDATE (event_hash) ON portal_restore_original_custody.head FROM "${role}"`);
      await expect(restricted.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      await authority.query(`GRANT UPDATE (event_hash) ON portal_restore_original_custody.head TO "${role}"`);
      await authority.query(`REVOKE INSERT ON portal_restore_original_custody.source_proofs FROM "${role}"`);
      await expect(restricted.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      await authority.query(`GRANT INSERT ON portal_restore_original_custody.source_proofs TO "${role}"`);
      await expect(restricted.preflightOriginal()).resolves.toBeUndefined();
      const request={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),
        query_string:Buffer.from("source=one"),body:Buffer.from('{"idempotency_key":"restricted-custody-original"}')};
      const issued=await issuer.issueC2ProtectedOwner(actor,actor.user_id,request,{request_bytes:4096},restricted.bindingDigest());
      const operation=randomUUID();
      await expect(restricted.append("ISSUED_HUMAN_ASSERTION",operation,"0",issued.token))
        .resolves.toMatchObject({generation:"1",replayed:false});
      await expect(restricted.append("ISSUED_HUMAN_ASSERTION",operation,"0",issued.token))
        .resolves.toMatchObject({generation:"1",replayed:true});
      await expect(bounded.query("DELETE FROM portal_restore_original_custody.events WHERE custody_id=$1",[boundedId]))
        .rejects.toMatchObject({code:"42501"});
      await expect(bounded.query("ALTER TABLE portal_restore_original_custody.events DISABLE TRIGGER events_immutable"))
        .rejects.toMatchObject({code:"42501"});
      // Counterexample, not a security PASS: the minimally useful writer can
      // still insert a fabricated event and advance the head directly. An
      // unkeyed hash chain alone cannot establish an independent authority.
      const prior=await restricted.inventory();
      const forged={operation_id:randomUUID(),generation:"2",kind:"ISSUED_HUMAN_ASSERTION",
        lease_id:"test-only-forged-original",body:prior.events[0].body,proof_hash:"a".repeat(64),predecessor_hash:prior.event_hash};
      const stableBody=JSON.stringify(Object.fromEntries(Object.entries(forged.body).sort(([a],[b])=>a<b?-1:a>b?1:0)));
      const forgedHash=createHash("sha256").update(JSON.stringify(["portal.restore-original-custody.candidate.v1",
        boundedId,forged.operation_id,forged.generation,forged.kind,forged.lease_id,stableBody,forged.proof_hash,forged.predecessor_hash])).digest("hex");
      await bounded.query(`INSERT INTO portal_restore_original_custody.events
        (custody_id,operation_id,generation,kind,lease_id,body,proof_hash,predecessor_hash,event_hash)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,[boundedId,forged.operation_id,forged.generation,forged.kind,
        forged.lease_id,JSON.stringify(forged.body),forged.proof_hash,forged.predecessor_hash,forgedHash]);
      await bounded.query("UPDATE portal_restore_original_custody.head SET generation=2,event_hash=$2 WHERE custody_id=$1",[boundedId,forgedHash]);
      await expect(restricted.inventory()).resolves.toMatchObject({state:"INVENTORY_NOT_CUTOVER",generation:"2",event_hash:forgedHash});
      await expect(restricted.compareRetainedToCore(10)).rejects.toThrow("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
      // A new, separately keyed journal refuses unsigned history and an SQL
      // writer's forged MAC. This is not an anti-rollback or operator proof.
      const authenticator=new C2JournalAuthenticatorCandidate(randomBytes(32),"test-only-independent-key");
      const legacyAuthenticated=new RestoreIndependentCustodyCandidate(source,bounded,{...config,custody_id:boundedId,journal_authenticator:authenticator});
      await expect(legacyAuthenticated.inventory()).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      const authenticatedId=randomUUID();
      await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
        VALUES($1,$2,$3,0,repeat('0',64))`,[authenticatedId,config.source_system_identifier,config.authority_system_identifier]);
      const authenticated=new RestoreIndependentCustodyCandidate(source,bounded,{...config,custody_id:authenticatedId,journal_authenticator:authenticator});
      expect(authenticated.hasAuthenticatedJournal()).toBe(true);
      await expect(authenticated.preflightOriginal()).resolves.toBeUndefined();
      await authority.query(`REVOKE INSERT ON portal_restore_original_custody.event_authentication FROM "${role}"`);
      await expect(authenticated.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_STORE_NOT_READY");
      await authority.query(`GRANT INSERT ON portal_restore_original_custody.event_authentication TO "${role}"`);
      const secondRequest={...request,body:Buffer.from('{"idempotency_key":"authenticated-custody-original"}')};
      const secondIssued=await issuer.issueC2ProtectedOwner(actor,actor.user_id,secondRequest,{request_bytes:4096},authenticated.bindingDigest());
      const secondOp=randomUUID();
      await expect(authenticated.append("ISSUED_HUMAN_ASSERTION",secondOp,"0",secondIssued.token))
        .resolves.toMatchObject({generation:"1",replayed:false});
      await expect(authenticated.append("ISSUED_HUMAN_ASSERTION",secondOp,"0",secondIssued.token))
        .resolves.toMatchObject({generation:"1",replayed:true});
      const legitimate=await authenticated.inventory();
      const wrongAuth=new RestoreIndependentCustodyCandidate(source,bounded,{...config,custody_id:authenticatedId,
        journal_authenticator:new C2JournalAuthenticatorCandidate(randomBytes(32),"test-only-independent-key")});
      expect(wrongAuth.bindingDigest()).not.toBe(authenticated.bindingDigest());
      expect(legacyAuthenticated.bindingDigest()).not.toBe(restricted.bindingDigest());
      await expect(wrongAuth.inventory()).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      const fake={...forged,operation_id:randomUUID(),body:legitimate.events[0].body,predecessor_hash:legitimate.event_hash};
      const fakeBody=JSON.stringify(Object.fromEntries(Object.entries(fake.body).sort(([a],[b])=>a<b?-1:a>b?1:0)));
      const fakeHash=createHash("sha256").update(JSON.stringify(["portal.restore-original-custody.candidate.v1",authenticatedId,
        fake.operation_id,fake.generation,fake.kind,fake.lease_id,fakeBody,fake.proof_hash,fake.predecessor_hash])).digest("hex");
      const oldMac=(await bounded.query("SELECT event_mac FROM portal_restore_original_custody.event_authentication WHERE custody_id=$1 AND operation_id=$2",
        [authenticatedId,secondOp])).rows[0].event_mac;
      await bounded.query(`INSERT INTO portal_restore_original_custody.events
        (custody_id,operation_id,generation,kind,lease_id,body,proof_hash,predecessor_hash,event_hash)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,[authenticatedId,fake.operation_id,fake.generation,fake.kind,
        fake.lease_id,JSON.stringify(fake.body),fake.proof_hash,fake.predecessor_hash,fakeHash]);
      await bounded.query(`INSERT INTO portal_restore_original_custody.event_authentication(custody_id,operation_id,key_id,event_mac)
        VALUES($1,$2,$3,$4)`,[authenticatedId,fake.operation_id,"test-only-independent-key",oldMac]);
      await bounded.query("UPDATE portal_restore_original_custody.head SET generation=2,event_hash=$2 WHERE custody_id=$1",[authenticatedId,fakeHash]);
      await expect(authenticated.inventory()).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      await expect(authenticated.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      await expect(authenticated.append("ISSUED_HUMAN_ASSERTION",secondOp,"0",secondIssued.token)).rejects.toThrow("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      await source.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[secondIssued.lease_id]);
    } finally {
      await bounded?.end();
      await authority.query(`DROP OWNED BY "${role}"`);
      await authority.query(`DROP ROLE "${role}"`);
    }
  });
  it("holds the catalog fence through custody append and rejects a no-op helper",async()=>{
    const custodyId=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[custodyId,config.source_system_identifier,config.authority_system_identifier]);
    const selected=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:custodyId});
    const request={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),query_string:Buffer.from("source=one"),
      body:Buffer.from('{"idempotency_key":"custody-catalog-race"}')};
    const issued=await issuer.issueC2ProtectedOwner(actor,actor.user_id,request,{request_bytes:4096},selected.bindingDigest());
    const operation=randomUUID();
    const definition=(await authority.query(`SELECT pg_get_functiondef(
      'portal_restore_original_custody.lock_guard_catalog_for_write()'::regprocedure) AS definition`)).rows[0].definition;
    await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_original_custody.lock_guard_catalog_for_write() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN; END $$`);
    try {await expect(selected.append("ISSUED_HUMAN_ASSERTION",operation,"0",issued.token)).rejects.toThrow("RESTORE_CUSTODY_JOURNAL_UNSAFE");}
    finally {await authority.query(definition);}
    let probeCode:string|undefined;
    const racingAuthority={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args);
          if(typeof args[0]==="string"&&args[0].includes("AS expected(table_name,trigger_name,function_name,function_body)")) {
            const attacker=await authority.connect();
            try {
              await attacker.query("BEGIN");await attacker.query("SET LOCAL lock_timeout='150ms'");
              try {await attacker.query(`CREATE OR REPLACE FUNCTION portal_restore_original_custody.immutable_event() RETURNS trigger
                LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);probeCode="UNEXPECTED_SUCCESS";}
              catch(error) {probeCode=(error as {code?:string}).code;}
              await attacker.query("ROLLBACK");
            } finally {attacker.release();}
          }
          return result;};
        const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
      }});}} as unknown as Pool;
    const fenced=new RestoreIndependentCustodyCandidate(source,racingAuthority,{...config,custody_id:custodyId});
    await expect(fenced.append("ISSUED_HUMAN_ASSERTION",operation,"0",issued.token)).resolves.toMatchObject({generation:"1",replayed:false});
    expect(probeCode).toBe("55P03");
    await expect(fenced.append("ISSUED_HUMAN_ASSERTION",operation,"0",issued.token)).resolves.toMatchObject({generation:"1",replayed:true});
    // This synthetic lease is unrelated to the subsequent capacity race.
    await source.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[issued.lease_id]);
  },15000);
  it("binds the exact custody but refuses issuance without qualified P7",async()=>{
    // Core committed this exact lease before independent append in beforeAll.
    // A custody-to-Core-only scan previously returned an empty, misleading
    // census even though recovery must account for the escaped local lease.
    expect((await store.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:decodeJwt(originalToken).jti,state:"CUSTODY_ORIGINAL_MISSING"}]);
    const pem=await exportSPKI(issuerConfig.source.public_key);
    const registration={source_issuer:issuerConfig.source.issuer,source_key_id:issuerConfig.source.key_id,
      source_spki_sha256:createHash("sha256").update(createPublicKey(pem).export({type:"spki",format:"der"})).digest("hex"),
      source_audience:issuerConfig.source.audience,source_workload_id:workload,source_client_csr_sha256:"1".repeat(64),
      server_hostname:"test.invalid",server_certificate_der_sha256:"2".repeat(64),workspace_id:workspace,protected_owner_subject:actor.user_id};
    const prepared=await prepareC2IssuerPublicAndReverse(source,issuerConfig,registration);
    const wrong=new RestoreIndependentCustodyCandidate(source,authority,{...config,protected_owner_subject:"test-only-not-owner"});
    expect(()=>prepared.bind_custodied_issuer(wrong)).toThrow("C2_HUMAN_ISSUER_COMPOSITION_INVALID");
    const noVault=new RestoreIndependentCustodyCandidate(source,authority,{...config,source_proof_vault:undefined});
    expect(()=>prepared.bind_custodied_issuer(noVault)).toThrow("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const custody_id=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[custody_id,config.source_system_identifier,config.authority_system_identifier]);
    const selected=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id});
    await expect(selected.preflightOriginal()).resolves.toBeUndefined();
    await authority.query("ALTER TABLE portal_restore_original_custody.source_proofs DISABLE TRIGGER source_proof_immutable");
    try {
      await expect(selected.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
    } finally {
      await authority.query("ALTER TABLE portal_restore_original_custody.source_proofs ENABLE TRIGGER source_proof_immutable");
    }
    await authority.query("ALTER TABLE portal_restore_original_custody.events DISABLE TRIGGER events_immutable");
    try {await expect(selected.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");}
    finally {await authority.query("ALTER TABLE portal_restore_original_custody.events ENABLE TRIGGER events_immutable");}
    // CREATE OR REPLACE preserves each trigger's OID and enabled state. A
    // no-op body must refuse both advisory preflight and the actual append.
    for(const functionName of ["immutable_event","immutable_source_proof"] as const) {
      const definition=(await authority.query(`SELECT pg_get_functiondef(
        'portal_restore_original_custody.${functionName}()'::regprocedure) AS definition`)).rows[0].definition;
      await authority.query(`CREATE OR REPLACE FUNCTION portal_restore_original_custody.${functionName}() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
      try {
        await expect(selected.preflightOriginal()).rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
        await expect(store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken)).rejects.toThrow("RESTORE_CUSTODY_JOURNAL_UNSAFE");
      } finally {await authority.query(definition);}
    }
    await expect(selected.preflightOriginal()).resolves.toBeUndefined();
    const selectedDigest=selected.bindingDigest();
    const bound=prepared.bind_custodied_issuer(selected);
    // TypeScript `private readonly` alone does not protect runtime fields.
    // Shadow attempts must not redirect already-bound issuance to another pool
    // or alter its workspace/custody binding while asynchronous work runs.
    expect(Reflect.set(selected,"source",authority)).toBe(true);
    expect(Reflect.set(selected,"authority",source)).toBe(true);
    expect(Reflect.set(selected,"c",{...config,custody_id:randomUUID(),workspace_id:"other-workspace"})).toBe(true);
    expect(selected.usesSourcePool(source)).toBe(true);
    expect(selected.usesSourcePool(authority)).toBe(false);
    expect(selected.bindingDigest()).toBe(selectedDigest);
    const request={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),query_string:Buffer.from("source=one"),
      body:Buffer.from('{"idempotency_key":"prepared-composed-original"}')};
    await expect(bound.issue({...actor,user_id:"test-only-other"},request,{request_bytes:4096})).rejects.toThrow("C2_P7_AUTHORITY_NOT_COMMISSIONED");
    await expect(bound.issue(actor,request,{request_bytes:4096})).rejects.toThrow("C2_P7_AUTHORITY_NOT_COMMISSIONED");
    await expect(bound.resume(actor,request,{request_bytes:4096})).rejects.toThrow("C2_P7_AUTHORITY_NOT_COMMISSIONED");
    const events=await authority.query("SELECT kind,lease_id,body::text FROM portal_restore_original_custody.events WHERE custody_id=$1",[custody_id]);
    expect(events.rows).toHaveLength(0);
    const leases=await source.query("SELECT 1 FROM elp210_candidate.leases WHERE request_digest=$1",
      [pmHttpRequestDigest(request,{request_bytes:4096})]);
    expect(leases.rows).toHaveLength(0);
  });
  it("does not release the assertion on ambiguous custody and resumes the same original after restart",async()=>{
    const guardedCustody=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[guardedCustody,config.source_system_identifier,config.authority_system_identifier]);
    let commits=0;
    const lostCommit={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&++commits===3)throw new Error("TEST_ONLY_LOST_CUSTODY_COMMIT_RESPONSE");return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const uncertain=new RestoreIndependentCustodyCandidate(source,lostCommit,{...config,custody_id:guardedCustody});
    const guarded=new C2CustodiedIssuerCandidate(issuer,uncertain);
    const request={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),
      query_string:Buffer.from("source=one"),body:Buffer.from('{"idempotency_key":"guarded-original"}')};
    let pending:unknown;
    try {await guarded.issue(actor,actor.user_id,request,{request_bytes:4096});} catch(error) {pending=error;}
    expect(pending).toBeInstanceOf(C2CustodyPendingError);
    const lease=(pending as C2CustodyPendingError).lease_id;
    expect(lease).toMatch(/^[0-9a-f-]{36}$/);
    const restarted=await CurrentHumanCandidate.create(source,issuerConfig);
    const recovered=new C2CustodiedIssuerCandidate(restarted,new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:guardedCustody}));
    const result=await recovered.resume(actor,actor.user_id,request,{request_bytes:4096});
    expect(result.lease_id).toBe(lease);
    const stored=await authority.query("SELECT operation_id::text,lease_id,body::text FROM portal_restore_original_custody.events WHERE custody_id=$1",[guardedCustody]);
    expect(stored.rows).toHaveLength(1);expect(stored.rows[0].operation_id).toBe(lease);expect(stored.rows[0].lease_id).toBe(lease);
    expect(stored.rows[0].body).not.toContain(result.token);
    expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",
      [pmHttpRequestDigest(request,{request_bytes:4096})])).rows[0].n).toBe(1);
  });
  it("stores an assertion issued by Core, verifies its durable original, and retains the exact operation after loss",async()=>{
    await expect(store.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",wrongOwner)).rejects.toThrow("RESTORE_CUSTODY_PROOF_INVALID");
    await expect(store.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",missingOriginal)).rejects.toThrow("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
    const tooSmall=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[tooSmall,config.source_system_identifier,config.authority_system_identifier]);
    const constrained=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:tooSmall,maximum_events:3});
    await expect(constrained.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",originalToken))
      .rejects.toThrow("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
    const sameStoreTooSmall=new RestoreIndependentCustodyCandidate(source,authority,{...config,maximum_events:3});
    await expect(sameStoreTooSmall.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",originalToken))
      .rejects.toThrow("RESTORE_CUSTODY_CAPACITY_RESERVATION_REQUIRED");
    const concurrent=await Promise.allSettled([store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken),
      store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken)]);
    expect(concurrent.filter(r=>r.status==="fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken)).toMatchObject({generation:"1",replayed:true});
    await expect(store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",alternateOriginal)).rejects.toThrow("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
    await expect(store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_PROOF_INVALID");
    await expect(store.append("SIGNED_SOURCE_TERMINAL",randomUUID(),"0",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_GENERATION_CONFLICT");
    await expect(store.append("SIGNED_SOURCE_TERMINAL",wrongId,"1",wrongTerminal)).rejects.toThrow("RESTORE_CUSTODY_ORIGINAL_MISMATCH");
    await expect(store.append("SIGNED_SOURCE_TERMINAL",wrongId,"1",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
    const lockCustody=randomUUID();
    const lockBinding=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:lockCustody});
    const lockOriginal=await issuer.issueC2ProtectedOwner(actor,actor.user_id,{method:"POST",
      raw_path:Buffer.from("/test-only/capital/root/apply"),query_string:Buffer.from("source=one"),
      body:Buffer.from('{"idempotency_key":"lock-test-original"}')},{request_bytes:4096},lockBinding.bindingDigest());
    // Once the original is independently appended it no longer appears as
    // missing. Another custody's lease must not appear in this census.
    expect((await store.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:decodeJwt(originalToken).jti,state:"SOURCE_TERMINAL_NOT_RETAINED"}]);
    await expect(issuer.enter(originalToken,enterToken)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_CUSTODY_REQUIRED"});
    await issuer.enterWithCustody(originalToken,enterToken,store);
    await expect(store.append("SIGNED_SOURCE_TERMINAL",wrongId,"1",wrongAttempt)).rejects.toThrow("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
    let inject=true;
    const lostCommit={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&inject){inject=false;throw new Error("TEST_ONLY_LOST_COMMIT_RESPONSE");}return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const uncertain=new RestoreIndependentCustodyCandidate(source,lostCommit,config);
    await expect(uncertain.append("SIGNED_SOURCE_TERMINAL",terminalId,"1",terminalToken)).rejects.toThrow("TEST_ONLY_LOST_COMMIT_RESPONSE");
    expect(await store.append("SIGNED_SOURCE_TERMINAL",terminalId,"1",terminalToken)).toMatchObject({generation:"2",replayed:true});
    await expect(issuer.resolve(terminalToken)).rejects.toMatchObject({code:"CURRENT_HUMAN_RESTORE_C2_CUSTODY_REQUIRED"});
    await issuer.resolveWithCustody(terminalToken,store);
    const restoredCensus=await store.compareRetainedToRestoredCore(10,restored,config.source_system_identifier,cloneName);
    expect(restoredCensus).toMatchObject({state:"OBSERVED_NOT_CUTOVER",observation_target:"RESTORED_CANDIDATE",
      observed_system_identifier:config.source_system_identifier,observed_database:cloneName,originals:[
        {lease_id:decodeJwt(originalToken).jti,state:"CORE_TERMINAL_MISSING_OR_DIFFERENT"}]});
    await expect(store.compareRetainedToRestoredCore(10,restored,config.authority_system_identifier,cloneName))
      .rejects.toThrow("RESTORE_CUSTODY_SOURCE_MISMATCH");
    await expect(store.compareRetainedToRestoredCore(10,restored,config.source_system_identifier,"other_database"))
      .rejects.toThrow("RESTORE_CUSTODY_SOURCE_MISMATCH");
    await expect(store.compareRetainedToRestoredCore(10,source,config.source_system_identifier,cloneName))
      .rejects.toThrow("RESTORE_CUSTODY_OBSERVATION_TARGET_INVALID");
    await expect(store.compareRetainedToRestoredCore(10,restored,"not-a-system-id",cloneName))
      .rejects.toThrow("RESTORE_CUSTODY_OBSERVATION_TARGET_INVALID");
    expect(await store.append("SIGNED_SOURCE_TERMINAL",terminalId,"1",terminalToken)).toMatchObject({generation:"2",replayed:true});
    await expect(store.append("SIGNED_SOURCE_TERMINAL",randomUUID(),"2",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_ORIGINAL_CONFLICT");
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1",[custody_id])).rows[0].n).toBe(2);
    const rows=await authority.query("SELECT body::text,proof_hash FROM portal_restore_original_custody.events WHERE custody_id=$1",[custody_id]);
    expect(JSON.stringify(rows.rows)).not.toContain(originalToken);
    expect(JSON.stringify(rows.rows)).not.toContain(terminalToken);
    const unavailableSource={options:source.options,connect:async()=>{throw new Error("TEST_ONLY_SOURCE_UNAVAILABLE");}} as unknown as Pool;
    const independentReader=new RestoreIndependentCustodyCandidate(unavailableSource,authority,config);
    const inventory=await independentReader.inventory();
    expect(inventory).toMatchObject({state:"INVENTORY_NOT_CUTOVER",generation:"2"});
    expect(inventory.events.map(event=>event.kind)).toEqual(["ISSUED_HUMAN_ASSERTION","SIGNED_SOURCE_TERMINAL"]);
    expect(JSON.stringify(inventory)).not.toContain(originalToken);
    // Compatibility with a previously written candidate chain: its original
    // event has no canonical assertion commitment. An exact original can
    // replay, but a census must explicitly report that fact as unrecorded.
    const legacyCustody=randomUUID(),legacyOperation=randomUUID(),legacyOriginal=inventory.events[0];
    const legacyBody={...legacyOriginal.body};delete legacyBody.human_assertion_digest;
    const stableLegacy=JSON.stringify(Object.fromEntries(Object.entries(legacyBody).sort(([a],[b])=>a<b?-1:a>b?1:0)));
    const legacyHash=createHash("sha256").update(JSON.stringify(["portal.restore-original-custody.candidate.v1",
      legacyCustody,legacyOperation,"1","ISSUED_HUMAN_ASSERTION",legacyOriginal.lease_id,stableLegacy,
      legacyOriginal.proof_hash,"0".repeat(64)])).digest("hex");
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,1,$4)`,[legacyCustody,config.source_system_identifier,config.authority_system_identifier,legacyHash]);
    await authority.query(`INSERT INTO portal_restore_original_custody.events(custody_id,operation_id,generation,kind,lease_id,body,proof_hash,predecessor_hash,event_hash)
      VALUES($1,$2,1,'ISSUED_HUMAN_ASSERTION',$3,$4::jsonb,$5,$6,$7)`,
      [legacyCustody,legacyOperation,legacyOriginal.lease_id,JSON.stringify(legacyBody),legacyOriginal.proof_hash,"0".repeat(64),legacyHash]);
    // This is a separate simulated custody installation: the source proxy
    // presents its matching binding without rewriting an immutable DB row.
    let legacyBinding="";
    const legacySource={options:source.options,connect:async()=>{const client=await source.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args) as {rows:Array<Record<string,unknown>>};
          if(typeof args[0]==="string"&&args[0].includes("FROM elp210_candidate.leases WHERE"))
            result.rows=result.rows.map(row=>({...row,c2_custody_binding_digest:legacyBinding}));
          return result;};
        const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
      }});}} as unknown as Pool;
    const legacyStore=new RestoreIndependentCustodyCandidate(legacySource,authority,{...config,custody_id:legacyCustody});
    legacyBinding=legacyStore.bindingDigest();
    expect(await legacyStore.append("ISSUED_HUMAN_ASSERTION",legacyOperation,"0",originalToken)).toMatchObject({generation:"1",replayed:true});
    expect((await legacyStore.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:legacyOriginal.lease_id,state:"CORE_ASSERTION_NOT_RECORDED"}]);
    // A concurrent authority/revision change cannot cross the independent
    // commit. This lock is local only; it does not fence a restored old host.
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[lockCustody,config.source_system_identifier,config.authority_system_identifier]);
    let signal!:()=>void, release!:()=>void;
    const atInsert=new Promise<void>(resolve=>{signal=resolve;});
    const proceed=new Promise<void>(resolve=>{release=resolve;});
    const delayed={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(typeof args[0]==="string"&&args[0].includes("INSERT INTO portal_restore_original_custody.events")){signal();await proceed;}
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const locked=new RestoreIndependentCustodyCandidate(source,delayed,{...config,custody_id:lockCustody});
    const inFlight=locked.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",lockOriginal.token);
    try {
      await atInsert;
      const updater=await source.connect();
      try {
        await updater.query("BEGIN");await updater.query("SET LOCAL lock_timeout='150ms'");
        await expect(updater.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton"))
          .rejects.toThrow(/lock timeout/i);
        await updater.query("ROLLBACK");
        await updater.query("BEGIN");await updater.query("SET LOCAL lock_timeout='150ms'");
        await expect(updater.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[lockOriginal.lease_id]))
          .rejects.toThrow(/lock timeout/i);
        await updater.query("ROLLBACK");
      } finally {updater.release();}
    } finally {release();}
    expect(await inFlight).toMatchObject({generation:"1",replayed:false});
    // A real concurrent ENTER advances the independent chain after its first
    // inventory but before the source observation completes. The census must
    // reject the mixed view, not silently certify the stale snapshot.
    const raceCustody=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[raceCustody,config.source_system_identifier,config.authority_system_identifier]);
    const raceStore=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:raceCustody});
    const raceRequest={method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),query_string:Buffer.from("source=one"),
      body:Buffer.from('{"idempotency_key":"census-head-race"}')};
    const raceIssued=await new C2CustodiedIssuerCandidate(issuer,raceStore).issue(actor,actor.user_id,raceRequest,{request_bytes:4096});
    const raceNow=Math.floor(Date.now()/1000),raceClaims=decodeJwt(raceIssued.token);
    const raceBase={purpose:"pma.current-human-lease.v1",lease_id:raceIssued.lease_id,attempt_id:"test-census-race",
      workspace_id:workspace,environment:"paper",workload_id:workload,request_digest:raceClaims.request_digest,
      iss:"test-source",aud:"test-core",sub:workload,jti:"test-census-race",iat:raceNow,nbf:raceNow,exp:raceNow+60};
    const raceEnter=await new SignJWT({...raceBase,phase:"ENTER",source_receipt_id:null,source_receipt_digest:null})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(sourceSigningKey);
    const raceCoordinator=new C2CustodiedTerminalCandidate(source,issuer,raceStore);
    let advanced=false;
    const racingSource={options:source.options,connect:async()=>{const client=await source.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(!advanced&&typeof args[0]==="string"&&args[0].includes("FROM elp210_candidate.leases WHERE lease_id=ANY")) {
            advanced=true;await raceCoordinator.enter(raceIssued.token,raceEnter);
          }return result;};
        const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
      }});}} as unknown as Pool;
    const racingReader=new RestoreIndependentCustodyCandidate(racingSource,authority,{...config,custody_id:raceCustody});
    await expect(racingReader.compareRetainedToCore(10)).rejects.toThrow("RESTORE_CUSTODY_CENSUS_CHANGED");
    expect(advanced).toBe(true);
    const raceTerminal=await new SignJWT({...raceBase,phase:"COMMITTED",source_receipt_id:"test-census-receipt",
      source_receipt_digest:`sha256:${"a".repeat(64)}`})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(sourceSigningKey);
    await raceCoordinator.resolve(raceTerminal);
    const staleCustody=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[staleCustody,config.source_system_identifier,config.authority_system_identifier]);
    await source.query("UPDATE elp210_candidate.authority SET revision=revision+1 WHERE singleton");
    const stale=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:staleCustody});
    await expect(stale.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",lockOriginal.token)).rejects.toThrow("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
    expect(await store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken)).toMatchObject({generation:"1",replayed:true});
    // An exact acknowledgement retry remains safe after phase advancement, but
    // a different custody cannot retroactively assert it protected pre-send.
    await source.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[lockOriginal.lease_id]);
    expect(await store.append("ISSUED_HUMAN_ASSERTION",originalId,"0",originalToken)).toMatchObject({generation:"1",replayed:true});
    const otherCustody=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head(custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[otherCustody,config.source_system_identifier,config.authority_system_identifier]);
    const late=new RestoreIndependentCustodyCandidate(source,authority,{...config,custody_id:otherCustody});
    await expect(late.append("ISSUED_HUMAN_ASSERTION",randomUUID(),"0",lockOriginal.token)).rejects.toThrow("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
  });
  it("detects historical tampering; hashes cannot protect against a trusted admin rewriting the entire chain",async()=>{
    await expect(authority.query("UPDATE portal_restore_original_custody.events SET body=jsonb_set(body,'{lease_id}', '\"changed\"') WHERE custody_id=$1 AND generation=1",[custody_id]))
      .rejects.toThrow("RESTORE_CUSTODY_EVENT_IMMUTABLE");
    await expect(authority.query("DELETE FROM portal_restore_original_custody.events WHERE custody_id=$1",[custody_id]))
      .rejects.toThrow("RESTORE_CUSTODY_EVENT_IMMUTABLE");
    await expect(authority.query("TRUNCATE portal_restore_original_custody.events CASCADE"))
      .rejects.toThrow("RESTORE_CUSTODY_EVENT_IMMUTABLE");
    await authority.query("ALTER TABLE portal_restore_original_custody.events DISABLE TRIGGER events_immutable");
    await expect(store.append("SIGNED_SOURCE_TERMINAL",terminalId,"1",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_JOURNAL_UNSAFE");
    await authority.query("UPDATE portal_restore_original_custody.events SET body=jsonb_set(body,'{lease_id}', '\"changed\"') WHERE custody_id=$1 AND generation=1",[custody_id]);
    await authority.query("ALTER TABLE portal_restore_original_custody.events ENABLE TRIGGER events_immutable");
    await expect(store.append("SIGNED_SOURCE_TERMINAL",terminalId,"1",terminalToken)).rejects.toThrow("RESTORE_CUSTODY_HISTORY_INVALID");
    await expect(store.inventory()).rejects.toThrow("RESTORE_CUSTODY_HISTORY_INVALID");
  });
  it("holds delivery on unavailable custody or revocation before final revalidation",async()=>{
    // The prior test advances the global authority; use a new, separately
    // registered test-only workload at its current revision, never roll back
    // a revision or mutate the old immutable registration.
    const nextWorkload="test-only-next-workload";
    const revision=(await source.query("SELECT revision::text FROM elp210_candidate.authority WHERE singleton")).rows[0].revision;
    await source.query(`INSERT INTO elp210_c2_p7_candidate.registrations
      (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
      VALUES('test-only-next-registry',$1,$2,$3,'test-only-app',$4,'ACTIVE',$5)`,["b".repeat(64),workspace,actor.user_id,revision,Date.now()+120000]);
    await source.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      VALUES('test-only-next-registry',$1,$2,$3,$4,'OPEN')`,["b".repeat(64),workspace,actor.user_id,nextWorkload]);
    const current=await CurrentHumanCandidate.create(source,{...issuerConfig,source:{...issuerConfig.source,workload_id:nextWorkload}});
    const currentConfig={...config,workload_id:nextWorkload,maximum_events:4};
    const request=(key:string)=>({method:"POST" as const,raw_path:Buffer.from("/test-only/capital/root/apply"),
      query_string:Buffer.from("source=one"),body:Buffer.from(JSON.stringify({idempotency_key:key}))});
    const newHead=async()=>{const id=randomUUID();await authority.query(`INSERT INTO portal_restore_original_custody.head
      (custody_id,source_system_identifier,authority_system_identifier,generation,event_hash) VALUES($1,$2,$3,0,repeat('0',64))`,
      [id,config.source_system_identifier,config.authority_system_identifier]);return id;};
    const first=await newHead(),offline={options:authority.options,connect:async()=>{throw new Error("TEST_ONLY_CUSTODY_OFFLINE");}} as unknown as Pool;
    const dark=new C2CustodiedIssuerCandidate(current,new RestoreIndependentCustodyCandidate(source,offline,{...currentConfig,custody_id:first}));
    const offlineRequest=request("custody-offline");
    await expect(dark.issue(actor,actor.user_id,offlineRequest,{request_bytes:4096})).rejects.toThrow("TEST_ONLY_CUSTODY_OFFLINE");
    expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",
      [pmHttpRequestDigest(offlineRequest,{request_bytes:4096})])).rows[0].n).toBe(0);
    const fresh=new C2CustodiedIssuerCandidate(current,new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:first}));
    expect((await fresh.issue(actor,actor.user_id,offlineRequest,{request_bytes:4096})).lease_id).toMatch(/^[0-9a-f-]{36}$/);
    const capacityHead=await newHead(),capacityRequest=request("custody-capacity-preflight");
    const constrainedIssuer=new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:capacityHead,maximum_events:3}));
    await expect(constrainedIssuer.issue(actor,actor.user_id,capacityRequest,{request_bytes:4096}))
      .rejects.toThrow("RESTORE_CUSTODY_CAPACITY_RESERVATION_REQUIRED");
    expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",
      [pmHttpRequestDigest(capacityRequest,{request_bytes:4096})])).rows[0].n).toBe(0);
    const copiedHead=await newHead(),mutableRequest=request("snapshot-before-preflight"),mutableActor={...actor};
    const originalDigest=pmHttpRequestDigest(mutableRequest,{request_bytes:4096});
    let signalSnapshot!:()=>void,releaseSnapshot!:()=>void;
    const atSnapshot=new Promise<void>(resolve=>{signalSnapshot=resolve;});
    const proceedSnapshot=new Promise<void>(resolve=>{releaseSnapshot=resolve;});
    const delayedAuthority={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(typeof args[0]==="string"&&args[0].includes("SELECT source_system_identifier,authority_system_identifier,generation"))
            {signalSnapshot();await proceedSnapshot;}
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const snapshotIssuer=new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(source,delayedAuthority,{...currentConfig,custody_id:copiedHead}));
    const inFlightSnapshot=snapshotIssuer.issue(mutableActor,actor.user_id,mutableRequest,{request_bytes:4096});
    try {await atSnapshot;mutableRequest.body.fill(0);mutableActor.session_id="test-only-mutated-session";}
    finally {releaseSnapshot();}
    const frozen=await inFlightSnapshot;
    expect(decodeJwt(frozen.token).request_digest).toBe(originalDigest);
    expect(decodeJwt(frozen.token).sid).toBe(actor.session_id);
    // Force both issuers to observe the same available preflight snapshot.
    // Only the append transaction reserves the capacity authoritatively.
    const raceHead=await newHead(),raceRequests=[request("capacity-race-a"),request("capacity-race-b")];
    let preflightCommits=0,releaseRace!:()=>void;
    const bothPreflight=new Promise<void>(resolve=>{releaseRace=resolve;});
    const racingAuthority={options:authority.options,connect:async()=>{const client=await authority.connect();
      let readOnly=false;
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(args[0]==="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")readOnly=true;
          if(args[0]==="COMMIT"&&readOnly&&preflightCommits<2){preflightCommits++;if(preflightCommits===2)releaseRace();await bothPreflight;}
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const raceIssuer=new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(source,racingAuthority,{...currentConfig,custody_id:raceHead}));
    const raced=await Promise.allSettled(raceRequests.map(value=>raceIssuer.issue(actor,actor.user_id,value,{request_bytes:4096})));
    expect(raced.filter(value=>value.status==="fulfilled")).toHaveLength(1);
    const pendingIndex=raced.findIndex(value=>value.status==="rejected");
    const pendingRace=raced[pendingIndex];
    expect(pendingRace.status).toBe("rejected");
    if(pendingRace.status!=="rejected")throw new Error("TEST_ONLY_PENDING_REQUIRED");
    expect(pendingRace.reason).toBeInstanceOf(C2CustodyPendingError);
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1",[raceHead])).rows[0].n).toBe(1);
    const expanded=new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:raceHead,maximum_events:8}));
    const resumedRace=await expanded.resume(actor,actor.user_id,raceRequests[pendingIndex],{request_bytes:4096},pendingRace.reason.lease_id);
    expect(resumedRace.lease_id).toBe(pendingRace.reason.lease_id);
    const wrongCustody=new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:first}));
    await expect(wrongCustody.resume(actor,actor.user_id,raceRequests[pendingIndex],{request_bytes:4096},resumedRace.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(current.resumeC2ProtectedOwnerIssue(actor,actor.user_id,raceRequests[pendingIndex],{request_bytes:4096},resumedRace.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(source.query("UPDATE elp210_candidate.leases SET c2_custody_binding_digest=$2 WHERE lease_id=$1",
      [resumedRace.lease_id,`sha256:${"f".repeat(64)}`])).rejects.toThrow("C2_CUSTODY_BINDING_IMMUTABLE");
    await expect(source.query("UPDATE elp210_candidate.leases SET human_assertion_digest=NULL WHERE lease_id=$1",
      [resumedRace.lease_id])).rejects.toThrow("C2_CUSTODY_BINDING_IMMUTABLE");
    for(const racedRequest of raceRequests) expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",
      [pmHttpRequestDigest(racedRequest,{request_bytes:4096})])).rows[0].n).toBe(1);
    // An already-entered original must still settle after the authority is
    // drained: the source terminal is not a new human authorization.
    const enteredHead=await newHead();
    const enteredStore=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:enteredHead});
    const enteredIssuer=new C2CustodiedIssuerCandidate(current,enteredStore);
    const enteredRequest=request("entered-before-revoke");
    const entered=await enteredIssuer.issue(actor,actor.user_id,enteredRequest,{request_bytes:4096});
    const observedBeforeTerminal=await enteredStore.compareRetainedToCore(10);
    expect(observedBeforeTerminal).toMatchObject({state:"OBSERVED_NOT_CUTOVER",originals:[
      {lease_id:entered.lease_id,state:"SOURCE_TERMINAL_NOT_RETAINED"}]});
    await expect(enteredStore.compareRetainedToCore(0)).rejects.toThrow("RESTORE_CUSTODY_CENSUS_INPUT_INVALID");
    // Simulate the row being absent in a restored Core snapshot; the source
    // query is filtered only in this TEST_ONLY proxy, not deleted from PG.
    const observedCore=(change:(rows:Array<Record<string,unknown>>)=>Array<Record<string,unknown>>)=>
      ({options:source.options,connect:async()=>{const client=await source.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args) as {rows:Array<Record<string,unknown>>};
          if(typeof args[0]==="string"&&args[0].includes("FROM elp210_candidate.leases WHERE lease_id=ANY"))
            result.rows=change(result.rows);
          return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool);
    const observedStore=(change:(rows:Array<Record<string,unknown>>)=>Array<Record<string,unknown>>)=>
      new RestoreIndependentCustodyCandidate(observedCore(change),authority,{...currentConfig,custody_id:enteredHead});
    const missingOriginal=observedStore(()=>[]);
    expect((await missingOriginal.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:entered.lease_id,state:"CORE_ORIGINAL_MISSING"}]);
    expect((await observedStore(rows=>rows.map(row=>({...row,workspace_id:"TEST_ONLY_wrong"})))
      .compareRetainedToCore(10)).originals).toEqual([{lease_id:entered.lease_id,state:"CORE_BINDING_MISMATCH"}]);
    // A restored copy must not tie an original whose actual signing key,
    // token digest or issuance timestamp differs, even if all business
    // identifiers and the independently retained event still match.
    for(const altered of [{human_signing_key_digest:`sha256:${"d".repeat(64)}`},
      {human_assertion_digest:`sha256:${"e".repeat(64)}`},{issued_at_ms:"1"}])
      expect((await observedStore(rows=>rows.map(row=>({...row,...altered}))).compareRetainedToCore(10)).originals)
        .toEqual([{lease_id:entered.lease_id,state:"CORE_BINDING_MISMATCH"}]);
    expect((await observedStore(rows=>rows.map(row=>({...row,phase:"COMMITTED"})))
      .compareRetainedToCore(10)).originals).toEqual([{lease_id:entered.lease_id,state:"CUSTODY_TERMINAL_MISSING"}]);
    const issuedClaims=decodeJwt(entered.token),now=Math.floor(Date.now()/1000);
    const proof={purpose:"pma.current-human-lease.v1",lease_id:entered.lease_id,attempt_id:"entered-before-revoke",
      workspace_id:workspace,environment:"paper",workload_id:nextWorkload,request_digest:issuedClaims.request_digest,
      iss:"test-source",aud:"test-core",sub:nextWorkload,jti:"test-revoke-proof",iat:now,nbf:now,exp:now+60};
    const signProof=(body:Record<string,unknown>)=>new SignJWT(body)
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(sourceSigningKey);
    // TS may journal an attempt before ENTER reaches Core, then provide an
    // authentic ROLLED_BACK proof. The Core lease is RETIRED and its exact
    // terminal lives in the unentered event, not on the lease row.
    const unenteredHead=await newHead();
    const unenteredStore=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:unenteredHead});
    const unentered=await new C2CustodiedIssuerCandidate(current,unenteredStore)
      .issue(actor,actor.user_id,request("unentered-rollback-census"),{request_bytes:4096});
    const unenteredProof=await signProof({...proof,lease_id:unentered.lease_id,attempt_id:"test-unentered-rollback",
      request_digest:decodeJwt(unentered.token).request_digest,phase:"ROLLED_BACK",source_receipt_id:"test-unentered-receipt",
      source_receipt_digest:`sha256:${"c".repeat(64)}`});
    const unenteredCoordinator=new C2CustodiedTerminalCandidate(source,current,unenteredStore);
    expect(await unenteredCoordinator.resolve(unenteredProof)).toEqual({replayed:false,phase:"ROLLED_BACK"});
    expect((await unenteredStore.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:unentered.lease_id,state:"TERMINAL_TIED_ACK_UNVERIFIED"}]);
    const unenteredHistory=(change:(rows:Array<Record<string,unknown>>)=>Array<Record<string,unknown>>)=>
      ({options:source.options,connect:async()=>{const client=await source.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          const result=await Reflect.apply(target.query,target,args) as {rows:Array<Record<string,unknown>>};
          if(typeof args[0]==="string"&&args[0].includes("FROM elp210_candidate.events")&&
            args[0].includes("SOURCE_ROLLED_BACK_UNENTERED"))
            result.rows=change(result.rows);
          return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool);
    for(const change of [
      (rows:Array<Record<string,unknown>>)=>rows.map(row=>({...row,attempt_id:"test-wrong-attempt"})),
      (rows:Array<Record<string,unknown>>)=>rows.map(row=>({...row,terminal_receipt_digest:`sha256:${"f".repeat(64)}`})),
      (_rows:Array<Record<string,unknown>>)=>[],
      (rows:Array<Record<string,unknown>>)=>[...rows,...rows],
      (rows:Array<Record<string,unknown>>)=>[...rows,...rows.map(row=>({...row,phase:"ENTERED"}))],
    ]) expect((await new RestoreIndependentCustodyCandidate(unenteredHistory(change),authority,{...currentConfig,custody_id:unenteredHead})
      .compareRetainedToCore(10)).originals).toEqual([{lease_id:unentered.lease_id,state:"CORE_TERMINAL_MISSING_OR_DIFFERENT"}]);
    const lostEnterHead=await newHead();
    const lostEnterStore=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:lostEnterHead});
    const lostIssued=await new C2CustodiedIssuerCandidate(current,lostEnterStore)
      .issue(actor,actor.user_id,request("lost-enter"),{request_bytes:4096});
    const lostEnterProof=await signProof({...proof,lease_id:lostIssued.lease_id,attempt_id:"test-lost-enter",
      request_digest:decodeJwt(lostIssued.token).request_digest,phase:"ENTER",source_receipt_id:null,source_receipt_digest:null});
    let enterCommits=0;
    const enterLostCommit={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&++enterCommits===3)throw new Error("TEST_ONLY_ENTER_COMMIT_RESPONSE_LOST");return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const lostEnter=new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,enterLostCommit,{...currentConfig,custody_id:lostEnterHead}));
    await expect(lostEnter.enter(lostIssued.token,lostEnterProof)).rejects.toThrow("TEST_ONLY_ENTER_COMMIT_RESPONSE_LOST");
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lostIssued.lease_id])).rows[0].phase).toBe("ENTERED");
    await expect(new C2CustodiedTerminalCandidate(source,current,lostEnterStore).enter(lostIssued.token,lostEnterProof))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[lostEnterHead])).rows[0].n).toBe(1);
    // Recovery observes the same retained proof after a lost response, but is
    // deliberately not an ENTER acknowledgement and never enters again.
    const recoverLostEnter=new C2CustodiedTerminalCandidate(source,current,lostEnterStore);
    expect(await recoverLostEnter.retainEnteredProof(lostEnterProof)).toEqual({state:"RETAINED_NOT_ENTRY_ACK"});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[lostEnterHead])).rows[0].n).toBe(1);
    const unretainedHead=await newHead();
    const unretainedStore=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:unretainedHead});
    const unretainedIssued=await new C2CustodiedIssuerCandidate(current,unretainedStore)
      .issue(actor,actor.user_id,request("unretained-enter"),{request_bytes:4096});
    const unretainedProof=await signProof({...proof,lease_id:unretainedIssued.lease_id,attempt_id:"test-unretained-enter",
      request_digest:decodeJwt(unretainedIssued.token).request_digest,phase:"ENTER",source_receipt_id:null,source_receipt_digest:null});
    let rejectEnterProof=0;
    const rejectEnterAuthority={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(typeof args[0]==="string"&&args[0].startsWith("INSERT INTO portal_restore_original_custody.source_proofs")) {
            rejectEnterProof++;throw new Error("TEST_ONLY_ENTER_PROOF_WRITE_FAILED");
          }
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    await expect(new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,rejectEnterAuthority,{...currentConfig,custody_id:unretainedHead}))
      .enter(unretainedIssued.token,unretainedProof)).rejects.toThrow("TEST_ONLY_ENTER_PROOF_WRITE_FAILED");
    expect(rejectEnterProof).toBe(1);
    expect((await source.query("SELECT phase,attempt_id FROM elp210_candidate.leases WHERE lease_id=$1",[unretainedIssued.lease_id])).rows[0])
      .toMatchObject({phase:"ENTERED",attempt_id:"test-unretained-enter"});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[unretainedHead])).rows[0].n).toBe(0);
    const recoverUnretained=new C2CustodiedTerminalCandidate(source,current,unretainedStore);
    const wrongAttempt=await signProof({...proof,lease_id:unretainedIssued.lease_id,attempt_id:"wrong-attempt",
      request_digest:decodeJwt(unretainedIssued.token).request_digest,phase:"ENTER",source_receipt_id:null,source_receipt_digest:null});
    await expect(recoverUnretained.retainEnteredProof(wrongAttempt)).rejects.toThrow("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
    const forgedKey=generateKeyPairSync("ed25519").privateKey;
    const forgedProof=await new SignJWT({...decodeJwt(unretainedProof)})
      .setProtectedHeader({alg:"EdDSA",kid:"test-source",typ:"JWT"}).sign(forgedKey);
    await expect(recoverUnretained.retainEnteredProof(forgedProof)).rejects.toThrow("RESTORE_CUSTODY_PROOF_INVALID");
    const wrongPhase=await signProof({...proof,lease_id:unretainedIssued.lease_id,attempt_id:"test-unretained-enter",
      request_digest:decodeJwt(unretainedIssued.token).request_digest,phase:"UNKNOWN",source_receipt_id:null,source_receipt_digest:null});
    await expect(recoverUnretained.retainEnteredProof(wrongPhase)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[unretainedHead])).rows[0].n).toBe(0);
    // Leave this proof unretained to exercise the recovery coordinator only
    // after a committed drain below.
    expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='ENTERED'",[unretainedIssued.lease_id])).rows[0].n).toBe(1);
    let rejectedVaultWrites=0;
    const rejectVaultWrite={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(typeof args[0]==="string"&&args[0].startsWith("INSERT INTO portal_restore_original_custody.source_proofs")) {
            rejectedVaultWrites++;
            throw new Error("TEST_ONLY_SOURCE_PROOF_WRITE_FAILED");
          }
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const failedTerminal=await signProof({...proof,lease_id:lostIssued.lease_id,attempt_id:"test-lost-enter",
      request_digest:decodeJwt(lostIssued.token).request_digest,phase:"ROLLED_BACK",source_receipt_id:"test-only-receipt",
      source_receipt_digest:`sha256:${"e".repeat(64)}`});
    const failClosed=new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,rejectVaultWrite,{...currentConfig,custody_id:lostEnterHead}));
    await expect(failClosed.resolve(failedTerminal)).rejects.toThrow("TEST_ONLY_SOURCE_PROOF_WRITE_FAILED");
    expect(rejectedVaultWrites).toBe(1);
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_TERMINAL'",[lostEnterHead])).rows[0].n).toBe(0);
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lostIssued.lease_id])).rows[0].phase).toBe("ENTERED");
    // Deterministically inject two known conflicts after ENTER has committed,
    // at the independent transaction's head lock. They exercise the full
    // bounded retry and are not a claim of actual concurrent PG scheduling.
    // The coordinator may retry only the same custody append, never ENTER.
    let serializationAttempts=0;
    const serializationAuthority={options:authority.options,connect:async()=>{const client=await authority.connect();let serial=false;
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{
          if(args[0]==="BEGIN ISOLATION LEVEL SERIALIZABLE")serial=true;
          if(serial&&typeof args[0]==="string"&&args[0].includes("portal_restore_original_custody.head")&&args[0].includes("FOR UPDATE")) {
            serializationAttempts++;
            if(serializationAttempts===1)throw Object.assign(new Error("TEST_ONLY serialization conflict"),{code:"40001"});
            if(serializationAttempts===2)throw new Error("RESTORE_CUSTODY_GENERATION_CONFLICT");
          }
          return Reflect.apply(target.query,target,args) as unknown;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const enteredCoordinator=new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,serializationAuthority,{...currentConfig,custody_id:enteredHead}));
    const enterProof=await signProof({...proof,phase:"ENTER",source_receipt_id:null,source_receipt_digest:null});
    const enterCaKeys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),enterCaName=commonName("TEST_ONLY_ENTER_CA");
    const enterCa=testCertificate(enterCaName,enterCaKeys,{name:enterCaName,key:enterCaKeys.privateKey},true);
    const enterLeaf=(name:string)=>{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});return {
      key:keys.privateKey.export({type:"pkcs8",format:"pem"}),
      cert:testCertificate(commonName(name),keys,{name:enterCaName,key:enterCaKeys.privateKey},false)};};
    const enterServer=enterLeaf("TEST_ONLY_ENTER_SERVER"),enterClient=enterLeaf("TEST_ONLY_ENTER_CLIENT");
    const enterLane=createC2CustodiedCurrentHumanTransport(current,enteredCoordinator,{tls:{...enterServer,ca:enterCa},
      source_certificate_sha256:`sha256:${createHash("sha256").update(new X509Certificate(enterClient.cert).raw).digest("hex")}`,
      limits:{maximum_in_flight:2,request_bytes:32768,deadline_ms:3000}});
    // After transport validation, shadowing the old TS-private properties must
    // not replace either of the dependencies used by ENTER and later retry.
    expect(Reflect.set(enteredCoordinator,"candidate",null)).toBe(true);
    expect(Reflect.set(enteredCoordinator,"custody",null)).toBe(true);
    expect(enteredCoordinator.usesCandidate(current)).toBe(true);
    await new Promise<void>((ok,bad)=>{enterLane.server.once("error",bad);enterLane.server.listen(0,"127.0.0.1",()=>ok());});
    try {
      const address=enterLane.server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_LISTEN_REQUIRED");
      const reply=await new Promise<{status:number;body:string}>((ok,bad)=>{
        const body=Buffer.from(JSON.stringify({schema_version:"pma.current-human-enter.v1",human_token:entered.token,source_assertion:enterProof}));
        const req=httpsRequest({hostname:"127.0.0.1",port:address.port,path:"/internal/elp210/current-human/enter",method:"POST",
          ...enterClient,ca:enterCa,rejectUnauthorized:true,agent:false,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
          headers:{"content-type":"application/json","content-length":String(body.length),connection:"close"}},res=>{
          const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("error",bad);
          res.on("end",()=>ok({status:res.statusCode??0,body:Buffer.concat(chunks).toString()}));});
        req.on("error",bad);req.setTimeout(4000,()=>req.destroy(new Error("TEST_ONLY_DEADLINE")));req.end(body);
      });
      expect(reply.status).toBe(200);
      expect(JSON.parse(reply.body)).toMatchObject({lease_id:entered.lease_id,attempt_id:proof.attempt_id});
      expect(serializationAttempts).toBe(3);
    } finally {enterLane.server.closeAllConnections();await new Promise<void>(done=>enterLane.server.close(()=>done()));}
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[enteredHead])).rows[0].n).toBe(1);
    const retained=await authority.query(`SELECT e.operation_id::text,e.generation::text,e.kind,e.lease_id,e.proof_hash,p.envelope
      FROM portal_restore_original_custody.events e JOIN portal_restore_original_custody.source_proofs p USING(custody_id,operation_id)
      WHERE e.custody_id=$1 AND e.kind='SIGNED_SOURCE_ENTER'`,[enteredHead]);
    expect(retained.rows).toHaveLength(1);
    const saved=retained.rows[0];
    expect(JSON.stringify(saved.envelope)).not.toContain(enterProof);
    const recovered=config.source_proof_vault!.open({custody_id:enteredHead,operation_id:saved.operation_id,
      generation:saved.generation,kind:saved.kind,lease_id:saved.lease_id,proof_hash:saved.proof_hash},saved.envelope);
    expect(recovered.toString("utf8")).toBe(enterProof);recovered.fill(0);
    // Reconstruct the reader as a fresh process would. Only metadata leaves
    // the verification boundary; neither the bearer nor proof is returned.
    const restarted=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:enteredHead});
    const checked=await restarted.verifyRetainedSourceProof(saved.operation_id);
    expect(checked).toMatchObject({state:"VERIFIED_NOT_CUTOVER",generation:saved.generation});
    expect(JSON.stringify(checked)).not.toContain(enterProof);
    const wrongVault=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:enteredHead,
      source_proof_vault:new C2SourceProofVault(randomBytes(32),"test-only-key")});
    await expect(wrongVault.verifyRetainedSourceProof(saved.operation_id)).rejects.toThrow("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    const wrongSourceKey=(await generateKeyPair("EdDSA",{crv:"Ed25519"})).publicKey;
    const wrongSigner=new RestoreIndependentCustodyCandidate(source,authority,{...currentConfig,custody_id:enteredHead,
      source:{...currentConfig.source,public_key:wrongSourceKey}});
    await expect(wrongSigner.verifyRetainedSourceProof(saved.operation_id)).rejects.toThrow("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    await expect(restarted.verifyRetainedSourceProof(randomUUID())).rejects.toThrow("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    await expect(authority.query("UPDATE portal_restore_original_custody.source_proofs SET envelope=envelope WHERE custody_id=$1",[enteredHead]))
      .rejects.toThrow("RESTORE_CUSTODY_SOURCE_PROOF_IMMUTABLE");
    await expect(enteredCoordinator.enter(entered.token,enterProof)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    const afterRevokeTerminal=await signProof({...proof,phase:"COMMITTED",source_receipt_id:"test-revoke-receipt",
      source_receipt_digest:`sha256:${"d".repeat(64)}`});
    const afterRevokeUnknown=await signProof({...proof,phase:"UNKNOWN",source_receipt_id:null,source_receipt_digest:null});
    const otherUnknown=await signProof({...proof,phase:"UNKNOWN",attempt_id:"test-other-attempt",source_receipt_id:null,source_receipt_digest:null});
    const second=await newHead(),drainId=newRestoreDrainId();let sourceCommits=0;
    const beforeReturn={options:source.options,connect:async()=>{const client=await source.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&++sourceCommits===3)await current.beginDrain(drainId);return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    expect(()=>new C2CustodiedIssuerCandidate(current,
      new RestoreIndependentCustodyCandidate(beforeReturn,authority,{...currentConfig,custody_id:second})))
      .toThrow("C2_CUSTODIED_ISSUER_CONFIG_INVALID");
    const proxyCurrent=await CurrentHumanCandidate.create(beforeReturn,{...issuerConfig,source:{...issuerConfig.source,workload_id:nextWorkload}});
    const revoked=new C2CustodiedIssuerCandidate(proxyCurrent,new RestoreIndependentCustodyCandidate(beforeReturn,authority,{...currentConfig,custody_id:second}));
    let pending:unknown;
    try {await revoked.issue(actor,actor.user_id,request("revoked-before-return"),{request_bytes:4096});}catch(error){pending=error;}
    expect(pending).toBeInstanceOf(C2CustodyPendingError);
    const lease=(pending as C2CustodyPendingError).lease_id;
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lease])).rows[0].phase).toBe("RETIRED");
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1",[second])).rows[0].n).toBe(1);
    const unsafeRestore=new CoreRestoreQuiescence(source,current);
    await expect(unsafeRestore.retainEnteredOriginal(drainId,unretainedIssued.lease_id,"test-unretained-enter",unretainedProof))
      .rejects.toThrow("V2_RESTORE_C2_CUSTODY_REQUIRED");
    const enterRestore=new CoreRestoreQuiescence(source,current,new C2CustodiedTerminalCandidate(source,current,unretainedStore));
    expect(Reflect.set(enterRestore,"status",async()=>({state:"FAKE"}))).toBe(true);
    await expect(enterRestore.retainEnteredOriginal(drainId,unretainedIssued.lease_id,"wrong-attempt",unretainedProof))
      .rejects.toThrow("V2_RESTORE_ENTER_ROUTING_INVALID");
    await expect(enterRestore.retainEnteredOriginal(newRestoreDrainId(),unretainedIssued.lease_id,"test-unretained-enter",unretainedProof))
      .rejects.toThrow();
    expect(await enterRestore.retainEnteredOriginal(drainId,unretainedIssued.lease_id,"test-unretained-enter",unretainedProof))
      .toMatchObject({retention:"RETAINED_NOT_ENTRY_ACK",progress:{state:"CORE_ONLY_NO_CUTOVER",old_holder_fence:"NOT_VERIFIED"}});
    expect(await enterRestore.retainEnteredOriginal(drainId,unretainedIssued.lease_id,"test-unretained-enter",unretainedProof))
      .toMatchObject({retention:"RETAINED_NOT_ENTRY_ACK"});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_ENTER'",[unretainedHead])).rows[0].n).toBe(1);
    expect((await source.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='ENTERED'",[unretainedIssued.lease_id])).rows[0].n).toBe(1);
    await expect(unsafeRestore.reconcileOriginal(drainId,entered.lease_id,proof.attempt_id,afterRevokeTerminal))
      .rejects.toThrow("V2_RESTORE_C2_CUSTODY_REQUIRED");
    await expect(current.resolve(afterRevokeTerminal)).rejects.toMatchObject({code:"CURRENT_HUMAN_RESTORE_C2_CUSTODY_REQUIRED"});
    await expect(current.resolveWithCustody(afterRevokeTerminal,enteredStore))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED"});
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[entered.lease_id])).rows[0].phase).toBe("ENTERED");
    const lostEnterUnknown=await signProof({...decodeJwt(lostEnterProof),phase:"UNKNOWN",jti:"test-lost-enter-recovery"});
    const custodyRestore=new CoreRestoreQuiescence(source,current,new C2CustodiedTerminalCandidate(source,current,lostEnterStore));
    expect(await custodyRestore.reconcileOriginal(drainId,lostIssued.lease_id,"test-lost-enter",lostEnterUnknown))
      .toMatchObject({terminal:"UNKNOWN",progress:{state:"CORE_ONLY_NO_CUTOVER"}});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_UNKNOWN'",[lostEnterHead])).rows[0].n).toBe(1);
    let terminalCommits=0;
    const terminalLostCommit={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&++terminalCommits===2)throw new Error("TEST_ONLY_TERMINAL_COMMIT_RESPONSE_LOST");return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const uncertainTerminal=new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,terminalLostCommit,{...currentConfig,custody_id:enteredHead}));
    const restartedTerminal=new C2CustodiedTerminalCandidate(source,current,enteredStore);
    expect(Reflect.set(restartedTerminal,"candidate",null)).toBe(true);
    expect(Reflect.set(restartedTerminal,"custody",null)).toBe(true);
    expect(restartedTerminal.usesCandidate(current)).toBe(true);
    const caKeys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),caName=commonName("TEST_ONLY_C2_CA");
    const ca=testCertificate(caName,caKeys,{name:caName,key:caKeys.privateKey},true);
    const makeLeaf=(name:string)=>{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
      return {key:keys.privateKey.export({type:"pkcs8",format:"pem"}),
        cert:testCertificate(commonName(name),keys,{name:caName,key:caKeys.privateKey},false)};};
    const serverIdentity=makeLeaf("TEST_ONLY_C2_SERVER"),clientIdentity=makeLeaf("TEST_ONLY_C2_CLIENT");
    const transportConfig={tls:{...serverIdentity,ca},source_certificate_sha256:`sha256:${createHash("sha256")
      .update(new X509Certificate(clientIdentity.cert).raw).digest("hex")}`,
      limits:{maximum_in_flight:2,request_bytes:32768,deadline_ms:3000}};
    const exchange=async(terminal:C2CustodiedTerminalCandidate,count:number,proofBytes=afterRevokeTerminal)=>{
      const lane=createC2CustodiedCurrentHumanTransport(current,terminal,transportConfig),server:Server=lane.server;
      await new Promise<void>((ok,bad)=>{server.once("error",bad);server.listen(0,"127.0.0.1",()=>ok());});
      try {
        const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_LISTEN_REQUIRED");
        const replies=[];
        for(let i=0;i<count;i++) replies.push(await new Promise<{status:number;body:string}>((ok,bad)=>{
          const body=Buffer.from(JSON.stringify({schema_version:"pma.current-human-resolve.v1",source_assertion:proofBytes}));
          const req=httpsRequest({hostname:"127.0.0.1",port:address.port,path:"/internal/elp210/current-human/resolve",method:"POST",
            ...clientIdentity,ca,rejectUnauthorized:true,agent:false,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
            headers:{"content-type":"application/json","content-length":String(body.length),connection:"close"}},res=>{
            const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("error",bad);
            res.on("end",()=>ok({status:res.statusCode??0,body:Buffer.concat(chunks).toString()}));});
          req.on("error",bad);req.setTimeout(4000,()=>req.destroy(new Error("TEST_ONLY_DEADLINE")));req.end(body);
        }));
        return replies;
      } finally {server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
    };
    expect((await exchange(restartedTerminal,1,otherUnknown))[0].status).toBe(503);
    let unknownCommits=0;
    const unknownLostCommit={options:authority.options,connect:async()=>{const client=await authority.connect();
      return new Proxy(client,{get(target,property){
        if(property==="query")return async(...args:unknown[])=>{const result=await Reflect.apply(target.query,target,args) as unknown;
          if(args[0]==="COMMIT"&&++unknownCommits===2)throw new Error("TEST_ONLY_UNKNOWN_COMMIT_RESPONSE_LOST");return result;};
        const v=Reflect.get(target,property,target);return typeof v==="function"?v.bind(target):v;
      }});}} as unknown as Pool;
    const uncertainUnknown=new C2CustodiedTerminalCandidate(source,current,
      new RestoreIndependentCustodyCandidate(source,unknownLostCommit,{...currentConfig,custody_id:enteredHead}));
    expect((await exchange(uncertainUnknown,1,afterRevokeUnknown))[0].status).toBe(503);
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[entered.lease_id])).rows[0].phase).toBe("ENTERED");
    const renewedUnknown=await signProof({...decodeJwt(afterRevokeUnknown),jti:"test-reissued-unknown",exp:now+58});
    const unknownReply=(await exchange(restartedTerminal,1,renewedUnknown))[0];
    expect(unknownReply.status).toBe(200);
    expect(JSON.parse(unknownReply.body)).toEqual({phase:"UNKNOWN",replayed:false});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_UNKNOWN'",[enteredHead])).rows[0].n).toBe(1);
    expect((await exchange(uncertainTerminal,1))[0].status).toBe(503);
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[entered.lease_id])).rows[0].phase).toBe("UNKNOWN");
    const altered=await signProof({...decodeJwt(afterRevokeTerminal),jti:"test-reissued-altered",
      source_receipt_digest:`sha256:${"e".repeat(64)}`});
    expect((await exchange(restartedTerminal,1,altered))[0].status).toBe(503);
    expect((await source.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[entered.lease_id])).rows[0].phase).toBe("UNKNOWN");
    const renewed=await signProof({...decodeJwt(afterRevokeTerminal),jti:"test-reissued-same-terminal",exp:now+59});
    const replies=await exchange(restartedTerminal,2,renewed);
    expect(replies.map(r=>r.status)).toEqual([200,200]);
    expect(replies.map(r=>JSON.parse(r.body))).toEqual([{phase:"COMMITTED",replayed:false},{phase:"COMMITTED",replayed:true}]);
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_TERMINAL'",[enteredHead])).rows[0].n).toBe(1);
    const retainedOutcomes=(await authority.query(`SELECT operation_id::text,kind FROM portal_restore_original_custody.events
      WHERE custody_id=$1 AND kind IN ('SIGNED_SOURCE_UNKNOWN','SIGNED_SOURCE_TERMINAL') ORDER BY generation`,[enteredHead])).rows;
    expect(retainedOutcomes.map(e=>e.kind)).toEqual(["SIGNED_SOURCE_UNKNOWN","SIGNED_SOURCE_TERMINAL"]);
    const verifiedUnknown=await restarted.verifyRetainedSourceProof(retainedOutcomes[0].operation_id);
    expect(verifiedUnknown).toMatchObject({state:"VERIFIED_NOT_CUTOVER",phase:"UNKNOWN",terminal_receipt_digest:null});
    const verifiedTerminal=await restarted.verifyRetainedSourceProof(retainedOutcomes[1].operation_id);
    const persistedLease=(await source.query("SELECT terminal_receipt_digest FROM elp210_candidate.leases WHERE lease_id=$1",
      [entered.lease_id])).rows[0];
    expect(verifiedTerminal).toMatchObject({state:"VERIFIED_NOT_CUTOVER",phase:"COMMITTED",lease_id:entered.lease_id,
      attempt_id:proof.attempt_id,terminal_receipt_digest:persistedLease.terminal_receipt_digest});
    const observedAfterTerminal=await enteredStore.compareRetainedToCore(10);
    expect(observedAfterTerminal).toMatchObject({state:"OBSERVED_NOT_CUTOVER",originals:[
      {lease_id:entered.lease_id,state:"TERMINAL_TIED_ACK_UNVERIFIED"}]});
    // TEST_ONLY stale snapshot: custody contains the signed terminal but the
    // supplied Core observation predates it. Never turn this into an ACK.
    const missingTerminal=observedStore(rows=>rows.map(row=>({...row,phase:"ENTERED",terminal_receipt_digest:null})));
    expect((await missingTerminal.compareRetainedToCore(10)).originals).toEqual([
      {lease_id:entered.lease_id,state:"CORE_TERMINAL_MISSING_OR_DIFFERENT"}]);
    const safeRestore=new CoreRestoreQuiescence(source,current,restartedTerminal);
    expect(Reflect.set(safeRestore,"status",async()=>({state:"FAKE"}))).toBe(true);
    await expect(safeRestore.reconcileOriginal(newRestoreDrainId(),entered.lease_id,proof.attempt_id,renewed)).rejects.toThrow();
    expect(await safeRestore.reconcileOriginal(drainId,entered.lease_id,proof.attempt_id,renewed))
      .toMatchObject({terminal:"CORE_REPLAYED",progress:{state:"CORE_ONLY_NO_CUTOVER"}});
    expect((await authority.query("SELECT count(*)::int AS n FROM portal_restore_original_custody.events WHERE custody_id=$1 AND kind='SIGNED_SOURCE_TERMINAL'",[enteredHead])).rows[0].n).toBe(1);
    // Separate TEST_ONLY pinned mTLS source: the ACK says phase only. The
    // independently held original source proof supplies the exact digest.
    const recoveryServer=createServer({key:serverIdentity.key,cert:serverIdentity.cert,ca,requestCert:true,
      rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
      const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(Buffer.from(chunk)));
      req.on("end",()=>{const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if(body.attempt?.lease_id!==entered.lease_id||body.attempt?.attempt_id!==proof.attempt_id){res.writeHead(403);res.end();return;}
        const response=JSON.stringify({schema_version:"pma.current-human-recover-ack.v1",lease_id:entered.lease_id,
          attempt_id:proof.attempt_id,phase:"COMMITTED",portal_acknowledged:true});
        res.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(response)});res.end(response);});
    });
    recoveryServer.on("tlsClientError",()=>{});
    await new Promise<void>((ok,bad)=>{recoveryServer.once("error",bad);recoveryServer.listen(0,"127.0.0.1",()=>ok());});
    try {
      const address=recoveryServer.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_LISTEN_REQUIRED");
      const client=new CurrentHumanRecoveryClient({origin:`https://127.0.0.1:${address.port}`,
        tls:{...clientIdentity,ca},source_certificate_sha256:`sha256:${createHash("sha256").update(new X509Certificate(serverIdentity.cert).raw).digest("hex")}`,
        deadline_ms:3000,response_bytes:4096});
      const both=new RestoreC2OriginalRecovery(source,current,client,restarted);
      expect(await both.reconcile(drainId,entered.lease_id,proof.attempt_id)).toMatchObject({
        state:"TERMINAL_PROOF_MATCH_ACK_CENSUS_NOT_VERIFIED",progress:{state:"CORE_ONLY_NO_CUTOVER",
          independent_checkpoint:"NOT_VERIFIED",old_holder_fence:"NOT_VERIFIED",post_snapshot_ack_coverage:"NOT_VERIFIED"}});
      const absent=new RestoreC2OriginalRecovery(source,current,client,lostEnterStore);
      // This store belongs to a different binding, even if it shares source,
      // workload and key pins. It cannot stand in for the exact original.
      await expect(absent.reconcile(drainId,entered.lease_id,proof.attempt_id))
        .rejects.toThrow("V2_RESTORE_RECOVERY_CUSTODY_BINDING_CHANGED");
      const corrupt=new RestoreC2OriginalRecovery(source,current,client,wrongVault);
      await expect(corrupt.reconcile(drainId,entered.lease_id,proof.attempt_id)).rejects.toThrow("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    } finally {recoveryServer.closeAllConnections();await new Promise<void>(ok=>recoveryServer.close(()=>ok()));}
  });
});
