/** TEST ONLY: isolated DB, synthetic identities and Ed25519 attestation. */
import "reflect-metadata";
import fastifyCookie from "@fastify/cookie";
import {Module} from "@nestjs/common";
import {NestFactory} from "@nestjs/core";
import {FastifyAdapter,type NestFastifyApplication} from "@nestjs/platform-fastify";
import type {FastifyInstance} from "fastify";
import {createCipheriv,createHash,generateKeyPairSync,sign,randomUUID,randomBytes,X509Certificate} from "node:crypto";
import {request as httpsRequest} from "node:https";
import {fork} from "node:child_process";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {Pool,type PoolClient} from "pg";
import {exportPKCS8,exportSPKI,generateKeyPair,SignJWT} from "jose";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {migrateTestDatabase} from "./harness";
import {C2P7OwnerIntentCandidate} from "../src/execution-v2/c2-p7-owner-intent-candidate";
import {createC2P7RegisteredSourceCandidate} from "../src/execution-v2/c2-p7-registered-source-candidate";
import {C2P7RegistrationWriterCandidate} from "../src/execution-v2/c2-p7-registration-writer-candidate";
import {C2P7RecordCandidate,verifiedBinding} from "../src/execution-v2/c2-p7-acceptance";
import {C2P7IssuerFenceCandidate} from "../src/execution-v2/c2-p7-issuer-fence-candidate";
import {assertC2P7RestrictedRoleCandidate} from "../src/execution-v2/c2-p7-schema-observation";
import {C2P7OwnerConfirmationVerifier,type C2P7ConfirmationClaims} from "../src/execution-v2/c2-p7-owner-confirmation-proof";
import {C2P7OwnerWitnessCustodyCandidate} from "../src/execution-v2/c2-p7-owner-witness-custody-candidate";
import {C2P7OwnerConfirmSignerCandidate} from "../src/execution-v2/c2-p7-owner-confirm-signer-candidate";
import {C2P7OwnerAuthAttestationCandidate,type C2P7OwnerAuthClaims} from "../src/execution-v2/c2-p7-owner-auth-attestation-candidate";
import {C2P7OwnerConfirmSignerCandidateController} from "../src/execution-v2/c2-p7-owner-confirm-signer-candidate.controller";
import {lockCurrentHumanSnapshot} from "../src/execution-v2/current-human-snapshot";
import {CurrentHumanCandidate,type CurrentHumanCandidateConfig} from "../src/execution-v2/current-human-candidate";
import {pmHttpRequestDigest} from "../src/execution-v2/pm-http-request-binding";
import {RestoreIndependentCustodyCandidate} from "../src/execution-v2/restore-independent-custody-candidate";
import {C2SourceProofVault} from "../src/execution-v2/restore-c2-source-proof-vault";
import {C2JournalAuthenticatorCandidate} from "../src/execution-v2/restore-c2-journal-authenticator-candidate";
import {C2CustodiedIssuerCandidate,C2CustodyPendingError} from "../src/execution-v2/c2-custodied-issuer-candidate";
import {C2CommandStatusAuthorityAdapter} from "../src/execution-v2/c2-command-status-authority-adapter";
import {C2FinancialAuthorityAdapter} from "../src/execution-v2/c2-financial-authority-adapter";
import {C2FinancialAssertionInnerCandidate} from "../src/execution-v2/c2-financial-assertion-inner-candidate";
import {C2FinancialDurableInnerCandidate} from "../src/execution-v2/c2-financial-durable-inner-candidate";
import {FinancialSourceAssertionAuthority} from "../src/execution-v2/financial-source-assertion";
import {C2FinancialOriginalCandidate} from "../src/execution-v2/c2-financial-original-candidate";
import {C2FinancialOriginalRecoveryCandidate} from "../src/execution-v2/c2-financial-original-recovery-candidate";
import {C2FinancialParentCandidate} from "../src/execution-v2/c2-financial-parent-candidate";
import {C2FinancialParentOrchestratorCandidate} from "../src/execution-v2/c2-financial-parent-orchestrator-candidate";
import {createC2CommandStatusInnerCandidate} from "../src/execution-v2/c2-command-status-inner-candidate";
import {createCommandSourceAssertionTestCustodyTransport} from "../src/execution-v2/command-source-assertion-transport";
import {createC2TestStatusDelivery} from "../src/execution-v2/c2-status-http-delivery-test-candidate";
import {createC2TestFinancialDelivery} from "../src/execution-v2/c2-financial-http-delivery-test-candidate";
import {createFinancialSourceAssertionTestCustodyTransport} from "../src/execution-v2/financial-source-assertion-transport";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import {C2CustodiedTerminalCandidate} from "../src/execution-v2/c2-custodied-terminal-candidate";
import {createC2CustodiedCurrentHumanTransport} from "../src/execution-v2/current-human-transport";
import {commonName,testCertificate,type TestAuthority} from "./fixtures/elp210-test-certificates";
import {C2P7ReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";
import {C2P7CandidateNoStoreGuard,C2P7ReviewCandidateController} from "../src/execution-v2/c2-p7-review-candidate.controller";
import {AuthService} from "../src/auth/auth.service";
import {sha256} from "../src/auth/argon";
import {CSRF_COOKIE,SESSION_COOKIE} from "../src/auth/cookies";
import {loadConfig} from "../src/config";
import {SessionGuard} from "../src/facade/session.guard";
import {HttpErrorFilter} from "../src/http-error.filter";
import {WorkspacesRepository} from "../src/repos/workspaces";
import type {C2P7SourceVerifier} from "../src/execution-v2/c2-p7-acceptance";
import type {ReviewedAccessPolicy} from "../src/execution-v2/access.contract";
import {accessDigest} from "../src/execution-v2/access-digest";
import {makeTestStatusCoreAuthority} from "./fixtures/c2-status-core-authority-fixture";

/** Test-only, unbound until this explicitly allocated loopback listener. */
async function withTestReverse(issuer:CurrentHumanCandidate,terminal:C2CustodiedTerminalCandidate,
  run:(post:(path:string,body:unknown,foreign?:boolean)=>Promise<{status:number;json:Record<string,unknown>}>,
    snapshot:()=>Readonly<{denied:number}>)=>Promise<void>):Promise<void> {
  const caKey=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),caName=commonName("TEST_ONLY-C2-status-ca");
  const ca:TestAuthority={key:caKey.privateKey,name:caName,certificate:testCertificate(caName,caKey,{name:caName,key:caKey.privateKey},true)};
  const identity=(label:string)=>{
    const key=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
    return {key:Buffer.from(key.privateKey.export({type:"pkcs8",format:"pem"})),
      cert:testCertificate(commonName(label),key,ca,false)};
  };
  const serverIdentity=identity("TEST_ONLY-Core"),sourceIdentity=identity("TEST_ONLY-source"),otherIdentity=identity("TEST_ONLY-other");
  const reverse=createC2CustodiedCurrentHumanTransport(issuer,terminal,{tls:{...serverIdentity,ca:ca.certificate},
    source_certificate_sha256:`sha256:${createHash("sha256").update(new X509Certificate(sourceIdentity.cert).raw).digest("hex")}`,
    limits:{maximum_in_flight:2,request_bytes:32768,deadline_ms:5000}});
  await new Promise<void>((resolve,reject)=>{reverse.server.once("error",reject);reverse.server.listen(0,"127.0.0.1",()=>resolve());});
  try {
    const address=reverse.server.address();if(!address||typeof address==="string")throw Error("TEST_ONLY_ADDRESS_REQUIRED");
    const post=(path:string,body:unknown,foreign=false)=>new Promise<{status:number;json:Record<string,unknown>}>((resolve,reject)=>{
      const client=foreign?otherIdentity:sourceIdentity;
      const bytes=JSON.stringify(body),req=httpsRequest({host:"127.0.0.1",port:address.port,path,method:"POST",
        key:client.key,cert:client.cert,ca:ca.certificate,rejectUnauthorized:true,agent:false,minVersion:"TLSv1.3",maxVersion:"TLSv1.3",
        headers:{"content-type":"application/json","content-length":Buffer.byteLength(bytes)}},res=>{
          const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
          res.on("end",()=>{try{resolve({status:res.statusCode??0,json:JSON.parse(Buffer.concat(chunks).toString())});}catch(error){reject(error);}});
          res.on("error",reject);
        });
      req.on("error",reject);req.setTimeout(10000,()=>req.destroy(Error("TEST_ONLY_REVERSE_TIMEOUT")));req.end(bytes);
    });
    await run(post,()=>reverse.snapshot());
  } finally {await new Promise<void>(resolve=>reverse.server.close(()=>resolve()));}
}
@Module({}) class TestOnlyP7PgHttpModule {}
const enabled=process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE"&&!!process.env.TEST_DATABASE_URL&&
  !!process.env.C2_B1_PREFLIGHT_TEST_FILE&&!!process.env.C2_B1_PREFLIGHT_TEST_SHA256;
describe.skipIf(!enabled)("P7 owner intent candidate, isolated PG",()=>{
  let pool:Pool,b1:Buffer,service:C2P7OwnerIntentCandidate,proof:Buffer,source:C2P7SourceVerifier,firstCycleIntent:string;
  let issuer:CurrentHumanCandidate,issuedLease:string,issuedAssertion:{token:string;lease_id:string;expires_at_ms:number;authority_revision:number};
  let authority:Pool,sourceSystem:string,authoritySystem:string,terminal:C2CustodiedTerminalCandidate;
  let issuerCustody:RestoreIndependentCustodyCandidate;
  let statusCore:Awaited<ReturnType<typeof makeTestStatusCoreAuthority>>;
  let directCore:Awaited<ReturnType<typeof makeTestStatusCoreAuthority>>;
  let lostCore:Awaited<ReturnType<typeof makeTestStatusCoreAuthority>>;
  let policy:ReviewedAccessPolicy;
  let sourceRegistration:unknown,sourceApprovalPem:string,sourceApprovalPin:string;
  let secondLease:string,secondAttempt:string,peerPrivate:Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  let firstFence:C2P7IssuerFenceCandidate;
  let firstWitness:{verifier:C2P7OwnerConfirmationVerifier;proof:Buffer;issued_at_ms:number;expires_at_ms:number};
  const request={method:"POST" as const,raw_path:Buffer.from("/test-only/c2"),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
  const secondRequest={...request,raw_path:Buffer.from("/test-only/c2-second")};
  const sourceProof=async(phase:"ENTER"|"COMMITTED",lease:string,attempt:string,req:typeof request)=>{
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({iss:"TEST_ONLY-peer",aud:"TEST_ONLY-portal",sub:"TEST_ONLY-source",jti:randomUUID(),
      iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:lease,attempt_id:attempt,
      workspace_id:workspace,environment:"paper",workload_id:"TEST_ONLY-source",request_digest:pmHttpRequestDigest(req,{request_bytes:4096}),
      phase,source_receipt_id:phase==="COMMITTED"?"TEST_ONLY-terminal":null,
      source_receipt_digest:phase==="COMMITTED"?`sha256:${"a".repeat(64)}`:null})
      .setProtectedHeader({alg:"EdDSA",kid:"TEST_ONLY-peer-key",typ:"JWT"}).sign(peerPrivate);
  };
  const owner="TEST_ONLY-owner",session="TEST_ONLY-session",workspace="TEST_ONLY-workspace";
  const httpSession="TEST_ONLY-http-session",httpToken="TEST_ONLY_HTTP_SESSION",httpCsrf="TEST_ONLY_HTTP_CSRF";
  const actor={user_id:owner,session_id:session,session_generation:7},pin=process.env.C2_B1_PREFLIGHT_TEST_SHA256!;
  const authKeys=generateKeyPairSync("ed25519"),authPin=createHash("sha256").update(authKeys.publicKey.export({type:"spki",format:"der"})).digest("hex");
  const ownerAuth=new C2P7OwnerAuthAttestationCandidate(authKeys.publicKey.export({type:"spki",format:"pem"}).toString(),
    authPin,"TEST_ONLY-independent-auth","TEST_ONLY-p7");
  const attest=(who:typeof actor,cycle:string,confirmation:string,idempotency:string)=>{
    const now=Date.now(),value:C2P7OwnerAuthClaims={schema:"portal.c2-p7.owner-auth-attestation.candidate.v1",
      issuer:"TEST_ONLY-independent-auth",audience:"TEST_ONLY-p7",workspace_id:workspace,owner_user_id:who.user_id,
      session_id:who.session_id,session_generation:who.session_generation,cycle_sha256:cycle,b1_sha256:pin,
      confirmation_sha256:confirmation,idempotency_sha256:createHash("sha256").update(idempotency).digest("hex"),
      issued_at_ms:now-1000,expires_at_ms:now+60000};
    const payload=Buffer.from(JSON.stringify(value));return Buffer.from(JSON.stringify({payload:payload.toString("base64url"),
      signature:sign(null,payload,authKeys.privateKey).toString("base64url")}));
  };
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL!);
    if(!/^\/portal_c2_p7_[a-f0-9]{8}$/.test(url.pathname))throw new Error("C2_P7_DB_NOT_DEDICATED");
    pool=new Pool({connectionString:url.toString(),max:5,connectionTimeoutMillis:5000,query_timeout:10000});
    if(!process.env.TEST_AUTHORITY_DATABASE_URL)throw new Error("TEST_ONLY_TWO_PG_REQUIRED");
    const au=new URL(process.env.TEST_AUTHORITY_DATABASE_URL);
    if(au.pathname!==url.pathname)throw new Error("TEST_ONLY_TWO_PG_REQUIRED");
    authority=new Pool({connectionString:au.toString(),max:3,connectionTimeoutMillis:5000,query_timeout:10000});
    const [sourceId,authorityId,clean]=await Promise.all([pool.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT system_identifier::text AS id FROM pg_control_system()"),
      authority.query("SELECT to_regnamespace('portal_restore_original_custody') IS NULL AS clean")]);
    sourceSystem=sourceId.rows[0].id;authoritySystem=authorityId.rows[0].id;
    if(sourceSystem===authoritySystem||clean.rows[0].clean!==true)throw new Error("TEST_ONLY_TWO_PG_REQUIRED");
    await authority.query(await readFile(join(process.cwd(),"src/execution-v2/restore-independent-custody-candidate.sql"),"utf8"));
    await authority.query(await readFile(join(process.cwd(),"src/execution-v2/restore-c2-journal-authentication-candidate.sql"),"utf8"));
    await authority.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-owner-witness-custody-candidate.sql"),"utf8"));
    await authority.query(await readFile(join(process.cwd(),"src/execution-v2/c2-financial-parent-candidate.sql"),"utf8"));
    await authority.query("INSERT INTO elp210_c2_financial_parent_candidate.limits(maximum_retained) VALUES(8)");
    const check=await pool.query("SELECT current_database() AS name, to_regnamespace('elp210_c2_p7_candidate') AS existing");
    if(check.rows[0]?.name!==url.pathname.slice(1)||check.rows[0]?.existing!==null)throw new Error("C2_P7_DB_NOT_DEDICATED");
    await migrateTestDatabase(url.toString());
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`,[owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,[session,owner]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,
      idle_expires_at,absolute_expires_at) VALUES($1,$2,$3,'ACTIVE',$4,7,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
      [httpSession,sha256(httpToken),owner,sha256(httpCsrf)]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,owner]);
    // Create this before establishing the synthetic authority revision: a
    // later workspace mutation intentionally advances the global revision.
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",
      ["TEST_ONLY-foreign-status-workspace",owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[workspace,owner]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY')",[owner]);
    policy={workspace_id:workspace,revision:"TEST_ONLY",artifact_digest:"sha256:"+"a".repeat(64),approval_ref:"TEST_ONLY",
      state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,researcher_fields:{state:"PENDING",policy_ref:null,fields:[]}};
    await pool.query("INSERT INTO portal_access_policy_state(workspace_id,revision,policy) VALUES($1,$2,$3::jsonb)",[workspace,policy.revision,JSON.stringify(policy)]);
    statusCore=await makeTestStatusCoreAuthority(pool,actor,workspace,policy,"TEST_ONLY-source","TEST_ONLY-status-edge");
    directCore=await makeTestStatusCoreAuthority(pool,actor,workspace,policy,"TEST_ONLY-source","TEST_ONLY-status-edge");
    lostCore=await makeTestStatusCoreAuthority(pool,actor,workspace,policy,"TEST_ONLY-source","TEST_ONLY-status-edge");
    await pool.query(`INSERT INTO owner_step_up_grants(step_up_id,session_id,user_id,expires_at)
      VALUES('TEST_ONLY-stepup',$1,$2,clock_timestamp()+interval '30 minutes')`,[session,owner]);
    await pool.query(`INSERT INTO owner_step_up_grants(step_up_id,session_id,user_id,expires_at)
      VALUES('TEST_ONLY-http-stepup',$1,$2,clock_timestamp()+interval '30 minutes')`,[httpSession,owner]);
    for(const file of ["current-human-candidate.sql","c2-p7-acceptance.sql","c2-p7-record-lock-candidate.sql","c2-p7-owner-intent-candidate.sql","c2-p7-review-lock-candidate.sql",
      "c2-p7-registration-table-candidate.sql","c2-p7-registration-read-lock-candidate.sql","c2-block-new-fence-candidate.sql","c2-p7-bound-lease-fence-candidate.sql",
      "c2-delivery-obligation-candidate.sql","c2-p7-delivery-fence-candidate.sql","c2-status-delivery-sequence-candidate.sql",
      "c2-financial-original-candidate.sql"])
      await pool.query(await readFile(join(process.cwd(),"src/execution-v2",file),"utf8"));
    // Synthetic test baseline only; this is not a real authority mutation or
    // proof that a live owner/grant exists. The STATUS authority refuses epoch 0.
    await pool.query("UPDATE elp210_candidate.authority SET revision=1 WHERE singleton");
    await pool.query("INSERT INTO elp210_c2_delivery_candidate.limits(maximum_retained,maximum_active) VALUES(10,10)");
    const revision=Number((await pool.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision),now=Date.now();
    b1=await readFile(process.env.C2_B1_PREFLIGHT_TEST_FILE!);
    const registration={b1_sha256:pin,a1_sha256:"2".repeat(64),jwks_sha256:"3".repeat(64),p8_spki_sha256:"4".repeat(64),
      workspace_id:workspace,owner_user_id:owner,issuer:"TEST_ONLY-issuer",subject:owner,current_workload_ref:"TEST_ONLY-workload",
      source_workload_id:"TEST_ONLY-source",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",environment:"paper",
      visibility:"BUSINESS",fields:["business_report"],operations:["HISTORY","READ"],scopes:[
        {environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}],
      application_revision:"TEST_ONLY-app",authority_revision:revision,mapping_sha256:"a".repeat(64),signer_kid:"TEST_ONLY-kid",
      effective_from_ms:now-1000,expires_at_ms:now+3600000};
    const keys=generateKeyPairSync("ed25519"),payload=Buffer.from(JSON.stringify(registration));
    proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:sign(null,payload,keys.privateKey).toString("base64url")}));
    const publicKey=keys.publicKey.export({type:"spki",format:"pem"}).toString();
    const publicPin=createHash("sha256").update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    sourceRegistration=registration;sourceApprovalPem=publicKey;sourceApprovalPin=publicPin;
    source=createC2P7RegisteredSourceCandidate(registration,publicKey,publicPin);
    service=new C2P7OwnerIntentCandidate(pool,source,"TEST_ONLY-key");
  },120000);
  afterAll(async()=>{await pool?.end();await authority?.end();});
  it("composes review, owner intent, registry and P7 preparation under actual PG locks",async()=>{
    // Entire cell, identity and attestation are TEST_ONLY; this cannot approve
    // a real delegation or commission the unmounted Research route.
    const writer=new C2P7RegistrationWriterCandidate(pool,source,service,"TEST_ONLY-key");
    const records=new C2P7RecordCandidate(pool,source,"TEST_ONLY-key");
    const review=new C2P7ReviewCandidateService(pool,source,service,writer,records,{enabled:true,environment:"RESEARCH",
      workspace_id:workspace,cycle_sha256:"1".repeat(64),b1_sha256:pin,b1_bytes:b1,source_proof:proof});
    const preview=await review.preview(actor);
    expect(preview.state).toBe("REVIEW_ONLY_NOT_AUTHORIZED");
    for(const key of ["source","intents","registrations","records","pool","workspace","enabled"])
      expect(Reflect.set(review,key,null)).toBe(true);
    expect(review.usesInstallation(pool,workspace)).toBe(true);
    const result=await review.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-composed");
    expect(result.state).toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
    if(result.state!=="P7_PREPARATION_RECORDED_NOT_AUTHORIZED")throw new Error("TEST_ONLY_P7_RECORD_REQUIRED");
    firstCycleIntent=result.intent_id;
    expect((await pool.query("SELECT state FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-key'")).rows)
      .toEqual([{state:"ACTIVE"}]);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records")).rows[0].n).toBe(1);
    const linked=await pool.query(`SELECT r.owner_intent_id::text,r.confirmation_sha256,i.decision_json
      FROM elp210_c2_p7_candidate.records r JOIN elp210_c2_p7_candidate.owner_intents i ON i.intent_id=r.owner_intent_id
      WHERE r.cycle_sha256=$1`,["1".repeat(64)]);
    expect(linked.rows).toHaveLength(1);
    expect(linked.rows[0].owner_intent_id).toBe(result.intent_id);
    expect(linked.rows[0].confirmation_sha256).toBe(preview.confirmation_sha256);
    expect(linked.rows[0].decision_json.review_binding).toEqual({cycle_sha256:"1".repeat(64),
      confirmation_sha256:preview.confirmation_sha256});
    // Synthetic witness only: its signer is not a commissioned owner or a
    // production authority. Exercise the real issuer against exact DB facts.
    const witnessKeys=generateKeyPairSync("ed25519");
    const witnessPin=createHash("sha256").update(witnessKeys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    const verifier=new C2P7OwnerConfirmationVerifier(witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),witnessPin);
    const selected=(await pool.query(`SELECT i.*,r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256,
      floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
      FROM elp210_c2_p7_candidate.owner_intents i JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id
      WHERE i.intent_id=$1`,[result.intent_id])).rows[0];
    const witnessIssued=Number(selected.now_ms),witnessExpires=witnessIssued+120000;
    const claims:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:"1".repeat(64),
      confirmation_sha256:selected.confirmation_sha256,intent_id:result.intent_id,registration_key:selected.registration_key,
      registration_sha256:selected.registration_sha256,source_evidence_sha256:selected.source_evidence_sha256,
      b1_sha256:selected.b1_sha256,workspace_id:selected.workspace_id,owner_user_id:selected.owner_user_id,
      session_id:selected.session_id,session_generation:Number(selected.session_generation),authority_revision:Number(selected.authority_revision),
      acceptance_sha256:selected.acceptance_sha256,delegation_sha256:selected.delegation_sha256,
      issued_at_ms:witnessIssued,expires_at_ms:witnessExpires};
    const witnessBytes=Buffer.from(JSON.stringify(claims));
    firstWitness={verifier,proof:Buffer.from(JSON.stringify({payload:witnessBytes.toString("base64url"),
      signature:sign(null,witnessBytes,witnessKeys.privateKey).toString("base64url")})),
      issued_at_ms:witnessIssued,expires_at_ms:witnessExpires};
    const vaultKey=randomBytes(32),vaultSelection={custody_id:randomUUID(),source_system_identifier:sourceSystem,
      authority_system_identifier:authoritySystem,signer_spki_sha256:witnessPin,vault_key_id:"TEST_ONLY-witness-key",maximum_witnesses:1};
    const witnessStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,vaultSelection,vaultKey,verifier);
    // New writes without a request-bound reservation must never create an
    // orphan, even when the signed witness itself is otherwise valid.
    await expect(witnessStore.retain(claims,firstWitness.proof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1",
      [vaultSelection.custody_id])).rows[0].n).toBe(0);
    // Seed a TEST_ONLY legacy envelope directly in the dedicated disposable
    // authority DB to verify existing orphan records still fail closed. This
    // recreates the old storage format; it is not an owner acceptance.
    const legacyHash=createHash("sha256").update(firstWitness.proof).digest("hex"),legacyNonce=randomBytes(12);
    const legacyCipher=createCipheriv("aes-256-gcm",vaultKey,legacyNonce);
    legacyCipher.setAAD(Buffer.from(JSON.stringify(["portal.c2-p7-witness-custody.v1",vaultSelection.custody_id,
      sourceSystem,authoritySystem,witnessPin,vaultSelection.vault_key_id,claims.cycle_sha256,claims.intent_id,
      legacyHash,claims.expires_at_ms]),"utf8"));
    const legacyEncrypted=Buffer.concat([legacyCipher.update(firstWitness.proof),legacyCipher.final()]);
    const legacyEnvelope={version:"c2-p7-witness-v1",key_id:vaultSelection.vault_key_id,nonce:legacyNonce.toString("base64url"),
      ciphertext:legacyEncrypted.toString("base64url"),tag:legacyCipher.getAuthTag().toString("base64url")};
    await authority.query(`INSERT INTO elp210_c2_p7_witness_candidate.witnesses
      (custody_id,cycle_sha256,intent_id,signer_spki_sha256,proof_sha256,expires_at_ms,envelope)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[vaultSelection.custody_id,claims.cycle_sha256,claims.intent_id,
      witnessPin,legacyHash,claims.expires_at_ms,JSON.stringify(legacyEnvelope)]);
    await expect(witnessStore.retain(claims,firstWitness.proof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    // A legacy witness alone is not an authenticated reservation of this
    // request. Do not guess its request binding or make a replacement intent.
    await expect(witnessStore.reserveIntent(claims.cycle_sha256,"a".repeat(64)))
      .rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const stored=(await authority.query("SELECT envelope FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1",
      [vaultSelection.custody_id])).rows[0].envelope;
    expect(JSON.stringify(stored)).not.toContain(firstWitness.proof.toString("utf8"));
    await expect(witnessStore.recover({...claims,owner_user_id:"TEST_ONLY-wrong-owner"}))
      .rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    await expect(authority.query("UPDATE elp210_c2_p7_witness_candidate.witnesses SET proof_sha256=repeat('f',64)"))
      .rejects.toThrow("C2_P7_WITNESS_IMMUTABLE");
    expect(()=>new C2P7OwnerWitnessCustodyCandidate(pool,pool,vaultSelection,vaultKey,verifier))
      .toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const wrongStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,vaultSelection,randomBytes(32),verifier);
    await expect(wrongStore.recover(claims)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    await expect(wrongStore.retainedIntent(claims.cycle_sha256)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const wrongCluster=new C2P7OwnerWitnessCustodyCandidate(pool,authority,
      {...vaultSelection,source_system_identifier:"123456789"},vaultKey,verifier);
    await expect(wrongCluster.recover(claims)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const expired={...claims,issued_at_ms:witnessIssued-2000,expires_at_ms:witnessIssued-1000};
    const expiredBytes=Buffer.from(JSON.stringify(expired));
    const expiredProof=Buffer.from(JSON.stringify({payload:expiredBytes.toString("base64url"),
      signature:sign(null,expiredBytes,witnessKeys.privateKey).toString("base64url")}));
    await expect(witnessStore.retain(expired,expiredProof)).rejects.toThrow("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
    const otherClaims={...claims,cycle_sha256:"b".repeat(64),intent_id:randomUUID()};
    const otherBytes=Buffer.from(JSON.stringify(otherClaims));
    const otherProof=Buffer.from(JSON.stringify({payload:otherBytes.toString("base64url"),
      signature:sign(null,otherBytes,witnessKeys.privateKey).toString("base64url")}));
    await expect(witnessStore.retain(otherClaims,otherProof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const concurrentSelection={...vaultSelection,custody_id:randomUUID()};
    const concurrentA=new C2P7OwnerWitnessCustodyCandidate(pool,authority,concurrentSelection,vaultKey,verifier);
    const concurrentB=new C2P7OwnerWitnessCustodyCandidate(pool,authority,concurrentSelection,vaultKey,verifier);
    const concurrent=await Promise.allSettled([concurrentA.reserveIntent(claims.cycle_sha256,"a".repeat(64)),
      concurrentB.reserveIntent(otherClaims.cycle_sha256,"a".repeat(64))]);
    expect(concurrent.filter(out=>out.status==="fulfilled")).toHaveLength(1);
    expect(concurrent.filter(out=>out.status==="rejected")).toHaveLength(1);
    expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_p7_witness_candidate.reservations WHERE custody_id=$1",
      [concurrentSelection.custody_id])).rows[0].n).toBe(1);
    const wrongIntentSelection={...vaultSelection,custody_id:randomUUID()};
    const wrongIntentStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,wrongIntentSelection,vaultKey,verifier);
    const selectedIntent=await wrongIntentStore.reserveIntent(claims.cycle_sha256,"a".repeat(64));
    expect(selectedIntent.intent_id).not.toBe(claims.intent_id);
    await expect(wrongIntentStore.retain(claims,firstWitness.proof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1",
      [wrongIntentSelection.custody_id])).rows[0].n).toBe(0);
    const reservationSelection={...vaultSelection,custody_id:randomUUID()};
    const reservationA=new C2P7OwnerWitnessCustodyCandidate(pool,authority,reservationSelection,vaultKey,verifier);
    const reservationB=new C2P7OwnerWitnessCustodyCandidate(pool,authority,reservationSelection,vaultKey,verifier);
    const reserved=await Promise.all([reservationA.reserveIntent("d".repeat(64),"a".repeat(64)),
      reservationB.reserveIntent("d".repeat(64),"a".repeat(64))]);
    expect(reserved.filter(x=>x.created)).toHaveLength(1);
    expect(reserved[0].intent_id).toBe(reserved[1].intent_id);
    await expect(reservationB.reserveIntent("d".repeat(64),"b".repeat(64))).rejects.toThrow();
    await expect(reservationB.reserveIntent("e".repeat(64),"a".repeat(64))).rejects.toThrow("C2_P7_WITNESS_CAPACITY_EXHAUSTED");
    await expect(authority.query("DELETE FROM elp210_c2_p7_witness_candidate.reservations WHERE custody_id=$1",[reservationSelection.custody_id]))
      .rejects.toThrow("C2_P7_WITNESS_IMMUTABLE");
    const wrongReservationKey=new C2P7OwnerWitnessCustodyCandidate(pool,authority,reservationSelection,randomBytes(32),verifier);
    await expect(wrongReservationKey.reserveIntent("d".repeat(64),"a".repeat(64))).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    // A role able to INSERT fabricated rows in the isolated authority DB
    // cannot turn an arbitrary intent ID into an authenticated reservation.
    const forgedSelection={...vaultSelection,custody_id:randomUUID()},forgedId=randomUUID();
    const forgedStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,forgedSelection,vaultKey,verifier);
    await authority.query(`INSERT INTO elp210_c2_p7_witness_candidate.reservations
      (custody_id,cycle_sha256,intent_id,request_sha256,signer_spki_sha256,reservation_mac) VALUES($1,$2,$3,$4,$5,$6)`,
      [forgedSelection.custody_id,"e".repeat(64),forgedId,"a".repeat(64),witnessPin,"0".repeat(64)]);
    await expect(forgedStore.reserveIntent("e".repeat(64),"a".repeat(64))).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const badReservationSelection={...vaultSelection,custody_id:randomUUID()};
    const badReservationStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,badReservationSelection,vaultKey,verifier);
    await authority.query(`INSERT INTO elp210_c2_p7_witness_candidate.reservations
      (custody_id,cycle_sha256,intent_id,request_sha256,signer_spki_sha256,reservation_mac) VALUES($1,$2,$3,$4,$5,$6)`,
      [badReservationSelection.custody_id,claims.cycle_sha256,claims.intent_id,"a".repeat(64),witnessPin,"0".repeat(64)]);
    await expect(badReservationStore.retain(claims,firstWitness.proof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1",
      [badReservationSelection.custody_id])).rows[0].n).toBe(0);
    const restartedStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,vaultSelection,vaultKey,verifier);
    // Legacy witness exists without a request-bound reservation: even a
    // valid signature/envelope must not escape via the recovery or locator
    // APIs. It must be reconciled, never silently treated as owner authority.
    await expect(restartedStore.recover(claims)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    await expect(restartedStore.retainedIntent(claims.cycle_sha256)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    // The signer signs only the result of this exact synthetic owner-confirm
    // path. No generic caller-selected claims or proof is accepted.
    const signerCycle="c".repeat(64),signerReview=new C2P7ReviewCandidateService(pool,source,service,writer,records,
      {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:signerCycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
    const signerStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,{...vaultSelection,custody_id:randomUUID()},vaultKey,verifier);
    const signerSelection={workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:"TEST_ONLY-key",
      cycle_sha256:signerCycle,b1_sha256:pin,signer_spki_sha256:witnessPin};
    // A genuinely signed source is not an independently authenticated owner.
    // Its attestor key must never double as the owner-auth key.
    const sameSourceOwner=new C2P7OwnerAuthAttestationCandidate(sourceApprovalPem,sourceApprovalPin,
      "TEST_ONLY-independent-auth","TEST_ONLY-p7");
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,proof,
      signerSelection,witnessKeys.privateKey,sameSourceOwner)).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    // A second verifier, even for the same signed registration, is not the
    // one used by the reviewed composition. Nor may different proof bytes be
    // substituted after owner preview.
    const alternateSource=createC2P7RegisteredSourceCandidate(sourceRegistration,sourceApprovalPem,sourceApprovalPin);
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,alternateSource,proof,
      signerSelection,witnessKeys.privateKey,ownerAuth)).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,Buffer.from("different"),
      signerSelection,witnessKeys.privateKey,ownerAuth)).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,{verify:source.verify},proof,
      signerSelection,witnessKeys.privateKey,ownerAuth)).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,proof,
      {...signerSelection,cycle_sha256:"f".repeat(64)},witnessKeys.privateKey,ownerAuth)).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    expect(()=>new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,proof,
      {workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:"TEST_ONLY-key",
        cycle_sha256:signerCycle,b1_sha256:pin,signer_spki_sha256:witnessPin},witnessKeys.privateKey,
      new C2P7OwnerAuthAttestationCandidate(witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),
        witnessPin,"TEST_ONLY-independent-auth","TEST_ONLY-p7"))).toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    const signer=new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,proof,
      {workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:"TEST_ONLY-key",
        cycle_sha256:signerCycle,b1_sha256:pin,signer_spki_sha256:witnessPin},witnessKeys.privateKey,ownerAuth);
    const signerPreview=await signerReview.preview(actor);
    const signerAttestation=attest(actor,signerCycle,signerPreview.confirmation_sha256,"TEST_ONLY-signer");
    const staleDigest="f".repeat(64);
    await expect(signer.confirmOwner(actor,staleDigest,"TEST_ONLY-signer",
      attest(actor,signerCycle,staleDigest,"TEST_ONLY-signer"))).rejects.toThrow();
    expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_p7_witness_candidate.reservations WHERE cycle_sha256=$1",[signerCycle])).rows[0].n).toBe(0);
    // Crash immediately after independent reservation, before Core dispatch:
    // a restart must stay pending, not invent a replacement original.
    const pendingCycle="e".repeat(64),pendingSelection={workspace_id:workspace,owner_user_id:owner,
      workload_id:"TEST_ONLY-source",registration_key:"TEST_ONLY-key",cycle_sha256:pendingCycle,b1_sha256:pin,signer_spki_sha256:witnessPin};
    const pendingReview=new C2P7ReviewCandidateService(pool,source,service,writer,records,
      {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:pendingCycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
    const pendingStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,{...vaultSelection,custody_id:randomUUID()},vaultKey,verifier);
    const pendingSigner=new C2P7OwnerConfirmSignerCandidate(pool,pendingReview,pendingStore,source,proof,pendingSelection,witnessKeys.privateKey,ownerAuth);
    const pendingPreview=await pendingReview.preview(actor),pendingKey="TEST_ONLY-pending";
    const pendingExpected={workspace_id:workspace,owner_user_id:owner,session_id:session,session_generation:actor.session_generation,
      cycle_sha256:pendingCycle,b1_sha256:pin,confirmation_sha256:pendingPreview.confirmation_sha256,
      idempotency_sha256:createHash("sha256").update(pendingKey).digest("hex")};
    const pendingHash=createHash("sha256").update(JSON.stringify(["portal.c2-p7-reservation.v1",pendingSelection,pendingExpected,authPin])).digest("hex");
    const pendingReservation=await pendingStore.reserveIntent(pendingCycle,pendingHash);
    const pendingCount=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    await expect(pendingSigner.confirmOwner(actor,pendingPreview.confirmation_sha256,pendingKey,
      attest(actor,pendingCycle,pendingPreview.confirmation_sha256,pendingKey))).rejects.toThrow();
    expect((await pendingStore.reserveIntent(pendingCycle,pendingHash)).intent_id).toBe(pendingReservation.intent_id);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(pendingCount);
    await expect(signer.confirmOwner({...actor,user_id:"TEST_ONLY-other"},signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation))
      .rejects.toThrow("C2_P7_CONFIRM_SIGNER_UNAVAILABLE");
    await expect(signer.confirmOwner(actor,"f".repeat(64),"TEST_ONLY-signer",signerAttestation)).rejects.toThrow();
    await expect(signer.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",Buffer.from("forged"))).rejects.toThrow();
    await expect(signer.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-other-key",signerAttestation)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1",[signerCycle])).rows[0].n).toBe(0);
    const signed=await signer.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation);
    expect(signed.state).toBe("WITNESS_RETAINED_NOT_AUTHORIZED");
    // Once a witness exists, reserveIntent must still authenticate the
    // reservation and require the identical request hash before resume.
    await expect(signerStore.reserveIntent(signerCycle,"f".repeat(64)))
      .rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    const savedReservation=(await authority.query(`SELECT custody_id::text,reservation_mac FROM
      elp210_c2_p7_witness_candidate.reservations WHERE cycle_sha256=$1`,[signerCycle])).rows[0];
    await authority.query("ALTER TABLE elp210_c2_p7_witness_candidate.reservations DISABLE TRIGGER USER");
    try {
      await authority.query(`UPDATE elp210_c2_p7_witness_candidate.reservations SET reservation_mac=$2 WHERE custody_id=$1`,
        [savedReservation.custody_id,"0".repeat(64)]);
      await expect(signer.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation))
        .rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
      await expect(signerStore.retainedIntent(signerCycle)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    } finally {
      await authority.query(`UPDATE elp210_c2_p7_witness_candidate.reservations SET reservation_mac=$2 WHERE custody_id=$1`,
        [savedReservation.custody_id,savedReservation.reservation_mac]);
      await authority.query("ALTER TABLE elp210_c2_p7_witness_candidate.reservations ENABLE TRIGGER USER");
    }
    const signerAfterRestart=new C2P7OwnerConfirmSignerCandidate(pool,signerReview,signerStore,source,proof,
      {workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:"TEST_ONLY-key",
        cycle_sha256:signerCycle,b1_sha256:pin,signer_spki_sha256:witnessPin},witnessKeys.privateKey,ownerAuth);
    expect(await signerAfterRestart.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation)).toEqual(signed);
    // A retry must work even when the source pool has only one connection;
    // witness custody checks that same locked connection rather than trying
    // to borrow a second connection from the exhausted pool.
    const singlePool=new Pool({connectionString:process.env.TEST_DATABASE_URL!,max:1,
      connectionTimeoutMillis:300,query_timeout:10000});
    try {
      const singleIntents=new C2P7OwnerIntentCandidate(singlePool,source,"TEST_ONLY-key");
      const singleWriter=new C2P7RegistrationWriterCandidate(singlePool,source,singleIntents,"TEST_ONLY-key");
      const singleRecords=new C2P7RecordCandidate(singlePool,source,"TEST_ONLY-key");
      const singleReview=new C2P7ReviewCandidateService(singlePool,source,singleIntents,singleWriter,singleRecords,
        {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:signerCycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
      const singleStore=new C2P7OwnerWitnessCustodyCandidate(singlePool,authority,
        {...vaultSelection,custody_id:savedReservation.custody_id},vaultKey,verifier);
      const singleSigner=new C2P7OwnerConfirmSignerCandidate(singlePool,singleReview,singleStore,source,proof,
        signerSelection,witnessKeys.privateKey,ownerAuth);
      expect(await singleSigner.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation)).toEqual(signed);
      expect(await singleStore.retainedIntent(signerCycle)).toBe(signed.intent_id);
      let escaped:((claims:C2P7ConfirmationClaims,proof:Uint8Array)=>Promise<unknown>)|undefined;
      await singleStore.withVerifiedSource(async(_db,retain)=>{escaped=retain;});
      await expect(escaped!(claims,firstWitness.proof)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    } finally {await singlePool.end();}
    // Stall the independent witness DB after the source session takes its
    // locks. An idle source transaction must be terminated so a revoke can
    // proceed; an ambiguously retained witness is not a successful response.
    await authority.query(`CREATE FUNCTION elp210_c2_p7_witness_candidate.test_only_slow_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2.7); RETURN NEW; END $$`);
    await authority.query(`CREATE TRIGGER test_only_slow_insert BEFORE INSERT ON elp210_c2_p7_witness_candidate.witnesses
      FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_witness_candidate.test_only_slow_insert()`);
    const stalled=signerAfterRestart.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation)
      .then(()=>null,error=>error);
    let revoker:PoolClient|undefined;
    try {
      let observed=false;
      for(let i=0;i<100;i++) {
        const waiting=await authority.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event='PgSleep' AND query LIKE '%INSERT INTO elp210_c2_p7_witness_candidate.witnesses%'`);
        if(waiting.rows[0].n>0){observed=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(observed).toBe(true);
      revoker=await pool.connect();await revoker.query("BEGIN");
      await revoker.query("SET LOCAL statement_timeout='5000ms'");
      const revoked=await revoker.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1 RETURNING session_id",[session]);
      expect(revoked.rowCount).toBe(1);
      // Roll back only this synthetic session so later isolated tests retain
      // their original shared setup; acquisition itself proves lock release.
      await revoker.query("ROLLBACK");
      expect(await stalled).toBeInstanceOf(Error);
      expect(await signerStore.retainedIntent(signerCycle)).toBe(signed.intent_id);
    } finally {
      if(revoker){await revoker.query("ROLLBACK").catch(()=>{});revoker.release();}
      await stalled;
      await authority.query("DROP TRIGGER test_only_slow_insert ON elp210_c2_p7_witness_candidate.witnesses");
      await authority.query("DROP FUNCTION elp210_c2_p7_witness_candidate.test_only_slow_insert()");
    }
    // The independent store already holds this cycle. Even a separately
    // authenticated retry with a different key may locate only the original;
    // it must not create a replacement intent before custody rejects it.
    const differentAttestation=attest(actor,signerCycle,signerPreview.confirmation_sha256,"TEST_ONLY-new-key");
    const countBefore=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    await expect(signerAfterRestart.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-new-key",differentAttestation)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(countBefore);
    expect(await signerStore.retainedIntent(signerCycle)).toBe(signed.intent_id);
    expect(await signerStore.retainedIntent("f".repeat(64))).toBeNull();
    // Simulate a Core copy that cannot locate the retained original by the
    // SAME key. Only this disposable DB is modified and the row is restored;
    // the signer must fail before inserting a replacement intent.
    const savedIdem=(await pool.query("SELECT idempotency_sha256 FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1",[signed.intent_id])).rows[0].idempotency_sha256;
    await pool.query("ALTER TABLE elp210_c2_p7_candidate.owner_intents DISABLE TRIGGER USER");
    try {
      await pool.query("UPDATE elp210_c2_p7_candidate.owner_intents SET idempotency_sha256=$2 WHERE intent_id=$1",[signed.intent_id,"f".repeat(64)]);
      await expect(signerAfterRestart.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation)).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(countBefore);
    } finally {
      await pool.query("UPDATE elp210_c2_p7_candidate.owner_intents SET idempotency_sha256=$2 WHERE intent_id=$1",[signed.intent_id,savedIdem]);
      await pool.query("ALTER TABLE elp210_c2_p7_candidate.owner_intents ENABLE TRIGGER USER");
    }
    expect(Object.keys(signed).sort()).toEqual(["acceptance_id","delegation_id","intent_id","proof_sha256","state"]);
    const signerRow=(await pool.query(`SELECT i.*,r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256,
      floor(extract(epoch FROM i.created_at)*1000)::bigint::text AS created_ms
      FROM elp210_c2_p7_candidate.owner_intents i JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id
      WHERE i.intent_id=$1`,[signed.intent_id])).rows[0];
    const signedClaims:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:signerCycle,
      confirmation_sha256:signerRow.confirmation_sha256,intent_id:signed.intent_id,registration_key:signerRow.registration_key,
      registration_sha256:signerRow.registration_sha256,source_evidence_sha256:signerRow.source_evidence_sha256,
      b1_sha256:signerRow.b1_sha256,workspace_id:signerRow.workspace_id,owner_user_id:signerRow.owner_user_id,
      session_id:signerRow.session_id,session_generation:Number(signerRow.session_generation),authority_revision:Number(signerRow.authority_revision),
      acceptance_sha256:signerRow.acceptance_sha256,delegation_sha256:signerRow.delegation_sha256,
      issued_at_ms:Number(signerRow.created_ms),expires_at_ms:Number(signerRow.expires_at_ms)};
    const signedProof=await signerStore.recover(signedClaims);
    expect((await signerStore.retain(signedClaims,signedProof)).proof_sha256).toBe(signed.proof_sha256);
    await expect(signerStore.recover({...signedClaims,owner_user_id:"TEST_ONLY-wrong-owner"}))
      .rejects.toThrow("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
    await authority.query("ALTER TABLE elp210_c2_p7_witness_candidate.reservations DISABLE TRIGGER USER");
    try {
      await authority.query(`UPDATE elp210_c2_p7_witness_candidate.reservations SET reservation_mac=$2 WHERE custody_id=$1`,
        [savedReservation.custody_id,"0".repeat(64)]);
      await expect(signerStore.recover(signedClaims)).rejects.toThrow("C2_P7_WITNESS_CUSTODY_INVALID");
    } finally {
      await authority.query(`UPDATE elp210_c2_p7_witness_candidate.reservations SET reservation_mac=$2 WHERE custody_id=$1`,
        [savedReservation.custody_id,savedReservation.reservation_mac]);
      await authority.query("ALTER TABLE elp210_c2_p7_witness_candidate.reservations ENABLE TRIGGER USER");
    }
    const signedFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key",signerCycle,pin,proof,
      {verifier,proof:signedProof,issued_at_ms:signedClaims.issued_at_ms,expires_at_ms:signedClaims.expires_at_ms});
    // Ephemeral test proof for the separately guarded subprocess below.
    const subprocessWitness=Buffer.from(signedProof);
    signedProof.fill(0);
    const fence=firstFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,firstWitness);
    // Even a correctly signed witness must not outlive the original owner's
    // intent. The source and this synthetic witness may otherwise be current.
    const extendedClaims={...claims,expires_at_ms:Number(selected.expires_at_ms)+1000};
    const extendedBytes=Buffer.from(JSON.stringify(extendedClaims));
    const extendedProof=Buffer.from(JSON.stringify({payload:extendedBytes.toString("base64url"),
      signature:sign(null,extendedBytes,witnessKeys.privateKey).toString("base64url")}));
    const extendedFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,
      {verifier,proof:extendedProof,issued_at_ms:extendedClaims.issued_at_ms,expires_at_ms:extendedClaims.expires_at_ms});
    const expiryDb=await pool.connect();
    try {
      await expiryDb.query("BEGIN");
      await expect(extendedFence.checkAuthenticatedLocked(expiryDb,actor,workspace,"TEST_ONLY-source"))
        .rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
      await expiryDb.query("ROLLBACK");await expiryDb.query("BEGIN");
      // TEST_ONLY: create an expired historical row without waiting 30 min;
      // rollback restores the immutable trigger and all original bytes.
      await expiryDb.query("ALTER TABLE elp210_c2_p7_candidate.owner_intents DISABLE TRIGGER owner_intents_immutable");
      await expiryDb.query("UPDATE elp210_c2_p7_candidate.owner_intents SET expires_at_ms=$2 WHERE intent_id=$1",
        [result.intent_id,Date.now()-1000]);
      await expect(fence.checkLocked(expiryDb,actor,workspace,"TEST_ONLY-source"))
        .rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
    } finally {await expiryDb.query("ROLLBACK").catch(()=>{});expiryDb.release();extendedBytes.fill(0);extendedProof.fill(0);}
    await pool.query(`INSERT INTO elp210_c2_fence_candidate.scopes
      (registration_key,registration_sha256,workspace_id,owner_user_id,workload_id,state)
      SELECT registration_key,registration_sha256,workspace_id,owner_user_id,'TEST_ONLY-source','OPEN'
      FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-key'`);
    const locked=await pool.connect();
    try {
      // Autocommit is never a held authority transaction.
      await expect(fence.checkLocked(locked,actor,workspace,"TEST_ONLY-source")).rejects.toThrow();
      await locked.query("BEGIN");
      await expect(fence.checkLocked(locked,actor,workspace,"TEST_ONLY-source")).resolves.toMatchObject({
        state:"P7_PREPARATION_CURRENT_NOT_AUTHORIZED",acceptance_id:result.acceptance_id,delegation_id:result.delegation_id});
      // A locator is not authority: model a stale/changed read at the DB
      // boundary while using the real locks and actual rows for all queries.
      for(const tamper of ["locator","locked-record"] as const) {
        const changed=new Proxy(locked,{get(target,property) {
          if(property==="query")return async (...args:unknown[])=>{
            const out=await Reflect.apply(target.query,target,args);
            const sql=String(args[0]);
            if((tamper==="locator"&&sql.includes("SELECT owner_intent_id::text FROM elp210_c2_p7_candidate.records"))||
              (tamper==="locked-record"&&sql.includes("FROM elp210_c2_p7_candidate.lock_record_by_cycle")))
              return {...out,rows:out.rows.map((row:Record<string,unknown>)=>({...row,owner_intent_id:randomUUID()}))};
            return out;
          };
          const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
        }});
        await expect(fence.checkLocked(changed,actor,workspace,"TEST_ONLY-source")).rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
      }
      await expect(fence.checkLocked(locked,actor,workspace,"TEST_ONLY-other-source")).rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
      await locked.query("COMMIT");
    } finally {await locked.query("ROLLBACK").catch(()=>{});locked.release();}
    const own=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const peer=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    peerPrivate=peer.privateKey;
    const custodyId=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head
      (custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[custodyId,sourceSystem,authoritySystem]);
    const subprocessVaultKey=randomBytes(32),subprocessJournalKey=randomBytes(32);
    const custodyConfig={custody_id:custodyId,
      source_system_identifier:sourceSystem,authority_system_identifier:authoritySystem,workspace_id:workspace,
      workload_id:"TEST_ONLY-source",protected_owner_subject:owner,maximum_events:50,
      source_proof_vault:new C2SourceProofVault(subprocessVaultKey,"TEST_ONLY-key"),
      original:{issuer:"TEST_ONLY-portal",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-human",public_key:own.publicKey},
      source:{issuer:"TEST_ONLY-peer",audience:"TEST_ONLY-portal",key_id:"TEST_ONLY-peer-key",public_key:peer.publicKey}};
    issuerCustody=new RestoreIndependentCustodyCandidate(pool,authority,{...custodyConfig,
      journal_authenticator:new C2JournalAuthenticatorCandidate(subprocessJournalKey,"TEST_ONLY-journal-key")});
    const legacyCustody=new RestoreIndependentCustodyCandidate(pool,authority,custodyConfig);
    const custodyBinding=issuerCustody.bindingDigest();
    const issuerConfig:CurrentHumanCandidateConfig={issuer:"TEST_ONLY-portal",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-human",
      private_key:own.privateKey,source:{issuer:"TEST_ONLY-peer",audience:"TEST_ONLY-portal",key_id:"TEST_ONLY-peer-key",
        public_key:peer.publicKey,workload_id:"TEST_ONLY-source"},
      limits:{ttl_ms:30000,maximum_unresolved:10,maximum_retained:20},
      c2_delivery_schema_required:true,
      c2_owner_confirmation_spki_sha256:witnessPin,
      installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:Date.now()+120000}};
    issuer=await CurrentHumanCandidate.create(pool,issuerConfig);
    // STATUS's legacy generic path must not bypass C2 P7/custody.
    await expect(issuer.issueCommandStatus(actor,{} as never,{} as never))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    expect(Reflect.get(issuer,"issueBound")).toBeUndefined();
    expect(Reflect.get(issuer,"revalidateBoundIssue")).toBeUndefined();
    expect(Reflect.get(issuer,"checkC2P7")).toBeUndefined();
    expect(Reflect.get(issuer,"c2P7Digest")).toBeUndefined();
    Reflect.set(issuer,"checkC2P7",async()=>({intent_id:result.intent_id,expires_at_ms:Date.now()+60000}));
    Reflect.set(issuer,"c2P7Digest",()=>"sha256:"+"f".repeat(64));
    await expect(issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    const unconfirmed=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof);
    await expect(issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096},custodyBinding,unconfirmed,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_INVALID"});
    const wrongKeys=generateKeyPairSync("ed25519"),wrongPin=createHash("sha256")
      .update(wrongKeys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    const wrongVerifier=new C2P7OwnerConfirmationVerifier(wrongKeys.publicKey.export({type:"spki",format:"pem"}).toString(),wrongPin);
    const attackerFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,
      {...firstWitness,verifier:wrongVerifier});
    issuerConfig.c2_owner_confirmation_spki_sha256=wrongPin;
    await expect(issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096},custodyBinding,attackerFence,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_INVALID"});
    issuerConfig.c2_owner_confirmation_spki_sha256=witnessPin;
    const replacedMethod=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,firstWitness);
    Reflect.set(replacedMethod,"checkAuthenticatedLocked",async()=>({intent_id:result.intent_id,expires_at_ms:Date.now()+60000}));
    await expect(issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096},custodyBinding,replacedMethod,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_INVALID"});
    const tampered=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,
      {...firstWitness,proof:Buffer.from(firstWitness.proof.toString().replace(/.$/,"x"))});
    await expect(issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096},custodyBinding,tampered,issuerCustody))
      .rejects.toThrow("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
    const signerRequest={...request,raw_path:Buffer.from("/test-only/confirmed-signer")};
    await expect(issuer.issueC2ProtectedOwner(actor,owner,signerRequest,{request_bytes:4096},legacyCustody.bindingDigest(),signedFence,legacyCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_CUSTODY_REQUIRED"});
    // Simulate an original created by the earlier candidate before this
    // stronger admission policy. Its exact legacy binding remains recoverable;
    // no replacement original is created or silently upgraded to a MAC.
    const legacyId=randomUUID();
    await authority.query(`INSERT INTO portal_restore_original_custody.head
      (custody_id,source_system_identifier,authority_system_identifier,generation,event_hash)
      VALUES($1,$2,$3,0,repeat('0',64))`,[legacyId,sourceSystem,authoritySystem]);
    const oldCustody=new RestoreIndependentCustodyCandidate(pool,authority,{...custodyConfig,custody_id:legacyId});
    const oldIssuer=await CurrentHumanCandidate.create(pool,{...issuerConfig,c2_delivery_schema_required:undefined});
    const oldWriter=new C2CustodiedIssuerCandidate(oldIssuer,oldCustody,signedFence);
    const oldRequest={...request,raw_path:Buffer.from("/test-only/legacy-original")};
    const oldOriginal=await oldWriter.issue(actor,owner,oldRequest,{request_bytes:4096});
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,oldRequest,{request_bytes:4096},oldOriginal.lease_id,
      oldCustody.bindingDigest(),signedFence,oldCustody)).resolves.toMatchObject({lease_id:oldOriginal.lease_id,token:oldOriginal.token});
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[oldOriginal.lease_id]);
    await expect(issuer.issueC2ProtectedOwner(actor,owner,signerRequest,{request_bytes:4096},custodyBinding,signedFence))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_CUSTODY_REQUIRED"});
    // TEST_ONLY financial adapter: exact path/bytes and same lease after a new
    // instance; selection is not a qualified source or HTTP delivery authority.
    const financialPaths=["/test-only/confirmed-signer","/test-only/financial-2","/test-only/financial-3",
      "/test-only/financial-4","/test-only/financial-5","/test-only/financial-6"];
    const financialWriter=new C2CustodiedIssuerCandidate(issuer,issuerCustody,signedFence);
    // An adapter selection is not proof that its issuer is installed in that
    // workspace: reject a mismatched configuration before issuing a lease.
    expect(()=>new C2FinancialAuthorityAdapter(issuer,financialWriter,
      {owner,workspace:"TEST_ONLY-other",workload:"TEST_ONLY-source",paths:financialPaths}))
      .toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    expect(()=>new C2FinancialAuthorityAdapter(issuer,financialWriter,
      {owner,workspace,workload:"TEST_ONLY-other",paths:financialPaths}))
      .toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    const badSelection={owner,workspace,workload:"TEST_ONLY-source",paths:financialPaths};
    Object.defineProperty(badSelection,"paths",{enumerable:true,get(){throw new Error("TEST_ONLY_GETTER_MUST_NOT_RUN");}});
    expect(()=>new C2FinancialAuthorityAdapter(issuer,financialWriter,badSelection))
      .toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    const badPaths=[...financialPaths];
    Object.defineProperty(badPaths,"0",{enumerable:true,get(){throw new Error("TEST_ONLY_GETTER_MUST_NOT_RUN");}});
    expect(()=>new C2FinancialAuthorityAdapter(issuer,financialWriter,{owner,workspace,workload:"TEST_ONLY-source",paths:badPaths}))
      .toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    const financial=new C2FinancialAuthorityAdapter(issuer,financialWriter,
      {owner,workspace,workload:"TEST_ONLY-source",paths:financialPaths});
    const financialBinding={workspace_id:workspace,environment:"paper" as const,workload_id:"TEST_ONLY-source",
      request_digest:pmHttpRequestDigest(signerRequest,{request_bytes:1_048_576})};
    financialPaths[0]="/test-only/replaced-after-construction";
    await expect(financial.issue({...actor,user_id:"TEST_ONLY-other"},financialBinding,signerRequest)).rejects.toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    await expect(financial.issue(actor,{...financialBinding,workspace_id:"TEST_ONLY-other"},signerRequest)).rejects.toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    await expect(financial.issue(actor,financialBinding,{...signerRequest,raw_path:Buffer.from("/test-only/other")})).rejects.toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    await expect(financial.issue(actor,financialBinding,{...signerRequest,query_string:Buffer.from("x=1")})).rejects.toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    // Exercise the actual financial context authority through the unmounted
    // C2/P7 issuer; this remains a synthetic source, not a runtime grant.
    const financialInner=new C2FinancialAssertionInnerCandidate(financial);
    const financialAuthority=new FinancialSourceAssertionAuthority(financialInner,
      {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
    const financialSelection={workspace_id:workspace,environment:"paper" as const,workload_id:"TEST_ONLY-source",
      receiver_id:"TEST_ONLY-receiver",binding_digest:`sha256:${"a".repeat(64)}`,paths:[...financialPaths]};
    // The adapter snapshotted the original paths; registration uses that same
    // original selection even if the caller later mutates its own array.
    financialSelection.paths[0]="/test-only/confirmed-signer";
    const financialContext=financialAuthority.register(actor,financialSelection);
    const financialRequest={schema_version:"portal.execution.financial-source-assertion-request.v1",
      binding_digest:financialSelection.binding_digest,receiver_id:financialSelection.receiver_id,
      workload_id:financialSelection.workload_id,method:"POST",path:"/test-only/confirmed-signer",body_utf8:"{}",
      request_digest:financialBinding.request_digest,delivery_sequence:0,previous_lease_id:null};
    const financialResult=await financialAuthority.issue(financialContext.original_context,financialRequest);
    const signedLease={token:financialResult.assertion,lease_id:financialResult.lease_id,
      expires_at_ms:financialResult.expires_at_ms,authority_revision:financialResult.authority_revision};
    expect(await financialAuthority.issue(financialContext.original_context,financialRequest)).toEqual(financialResult);
    await expect(financialAuthority.issue(financialContext.original_context,{...financialRequest,body_utf8:'{"changed":true}'}))
      .rejects.toMatchObject({code:"FINANCIAL_ASSERTION_REQUEST_DIGEST_MISMATCH"});
    await financial.revalidate(actor,financialBinding,signerRequest,signedLease);
    await expect(financial.revalidate(actor,financialBinding,signerRequest,{...signedLease,token:signedLease.token+"x"}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ASSERTION_CHANGED"});
    // The financial authority rejoins a known custody-pending lease without
    // allocating a replacement. Both source and independent custody here are
    // disposable; this is not a real Edge completion or process restart.
    const pendingContext=financialAuthority.register(actor,financialSelection);
    const pendingPath="/test-only/financial-2";
    const pendingBytes={method:"POST" as const,raw_path:Buffer.from(pendingPath),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const pendingRequest={...financialRequest,path:pendingPath,request_digest:pmHttpRequestDigest(pendingBytes,{request_bytes:1_048_576})};
    const financialHold=await authority.connect();let financialPending:C2CustodyPendingError|undefined;
    try {
      await financialHold.query("BEGIN");
      await financialHold.query("SELECT custody_id FROM portal_restore_original_custody.head WHERE custody_id=$1 FOR UPDATE",[custodyId]);
      try {await financialAuthority.issue(pendingContext.original_context,pendingRequest);}
      catch(error) {expect(error).toBeInstanceOf(C2CustodyPendingError);financialPending=error as C2CustodyPendingError;}
      expect(financialPending).toBeInstanceOf(C2CustodyPendingError);
    } finally {await financialHold.query("ROLLBACK").catch(()=>{});financialHold.release();}
    const financialRecovered=await financialAuthority.issue(pendingContext.original_context,pendingRequest);
    expect(financialRecovered.lease_id).toBe(financialPending!.lease_id);
    expect((await issuerCustody.inventory()).events.filter(e=>e.lease_id===financialRecovered.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION")).toHaveLength(1);
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[financialRecovered.lease_id]);
    // A separate durable locator binds context and lease in the ISSUE
    // transaction. Restarted helpers can find only the exact original; the
    // issuer still enforces live session, P7, source and custody independently.
    const durablePath="/test-only/financial-3";
    const durableBytes={method:"POST" as const,raw_path:Buffer.from(durablePath),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const originalInput={subject_id:actor.user_id,session_id:actor.session_id,session_revision:actor.session_generation,
      workspace_id:workspace,workload_id:"TEST_ONLY-source",receiver_id:"TEST_ONLY-receiver",binding_digest:`sha256:${"a".repeat(64)}`,
      request_digest:pmHttpRequestDigest(durableBytes,{request_bytes:1_048_576}),expires_at_ms:Date.now()+60000};
    // Expired never-issued reservations cannot permanently consume capacity;
    // live or linked originals must not be collected by this operation.
    const expiredContext=accessDigest("TEST_ONLY-expired-unbound");
    await pool.query(`INSERT INTO elp210_c2_financial_candidate.originals
      (context_digest,subject_id,session_id,session_revision,workspace_id,workload_id,receiver_id,binding_digest,request_digest,expires_at_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[expiredContext,originalInput.subject_id,originalInput.session_id,
      originalInput.session_revision,originalInput.workspace_id,originalInput.workload_id,originalInput.receiver_id,
      originalInput.binding_digest,originalInput.request_digest,Date.now()-1000]);
    const originalStore=new C2FinancialOriginalCandidate(pool,1);
    const originalRecovery=new C2FinancialOriginalRecoveryCandidate(originalStore,financialWriter),prepared=await originalRecovery.prepare(originalInput);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1",[expiredContext])).rows[0].n).toBe(0);
    // Retrying a lost reservation is idempotent even when the store is at
    // capacity; neither a different request nor actor may reuse the locator.
    expect(await Promise.all([originalRecovery.reserve(prepared.context,originalInput),originalRecovery.reserve(prepared.context,originalInput)]))
      .toEqual([{lease_id:null},{lease_id:null}]);
    await expect(originalStore.reserve(prepared.context,{...originalInput,request_digest:`sha256:${"f".repeat(64)}`}))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    await expect(originalStore.reserve(prepared.context,{...originalInput,subject_id:"TEST_ONLY-other"}))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    await expect(pool.query("DELETE FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1",[accessDigest(prepared.context)]))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_IMMUTABLE");
    await expect(originalStore.locate(prepared.context,originalInput)).rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    // A database writer cannot bind a different already-issued request to
    // this context merely by selecting an otherwise valid C2 lease.
    await expect(pool.query("UPDATE elp210_c2_financial_candidate.originals SET lease_id=$2 WHERE context_digest=$1",
      [accessDigest(prepared.context),signedLease.lease_id])).rejects.toThrow("C2_FINANCIAL_ORIGINAL_LEASE_MISMATCH");
    const financialOriginal={context_digest:accessDigest(prepared.context),receiver_id:originalInput.receiver_id,
      binding_digest:originalInput.binding_digest,expires_at_ms:originalInput.expires_at_ms};
    await expect(issuer.issueC2ProtectedOwner(actor,owner,{...durableBytes,body:Buffer.from('{"different":true}')},
      {request_bytes:1_048_576},custodyBinding,signedFence,issuerCustody,financialOriginal))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID"});
    const durableHold=await authority.connect();let durablePending:C2CustodyPendingError|undefined;
    try {
      await durableHold.query("BEGIN");
      await durableHold.query("SELECT custody_id FROM portal_restore_original_custody.head WHERE custody_id=$1 FOR UPDATE",[custodyId]);
      try {await originalRecovery.issue(actor,owner,durableBytes,{request_bytes:1_048_576},prepared.context,originalInput);}
      catch(error) {expect(error).toBeInstanceOf(C2CustodyPendingError);durablePending=error as C2CustodyPendingError;}
      expect(durablePending).toBeInstanceOf(C2CustodyPendingError);
    } finally {await durableHold.query("ROLLBACK").catch(()=>{});durableHold.release();}
    const restartedFinancialOriginalStore=new C2FinancialOriginalCandidate(pool,4);
    await expect(restartedFinancialOriginalStore.locate(prepared.context,{...originalInput,workspace_id:"TEST_ONLY-other"}))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    await expect(restartedFinancialOriginalStore.locate(prepared.context,{...originalInput,request_digest:financialBinding.request_digest}))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    await expect(restartedFinancialOriginalStore.locate("A".repeat(43),originalInput))
      .rejects.toThrow("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
    const recoveredLease=await restartedFinancialOriginalStore.locate(prepared.context,originalInput);
    expect(recoveredLease).toBe(durablePending!.lease_id);
    expect(await originalStore.reserve(prepared.context,originalInput)).toEqual({lease_id:recoveredLease});
    const resumedIssuer=await CurrentHumanCandidate.create(pool,issuerConfig);
    const restartedRecovery=new C2FinancialOriginalRecoveryCandidate(restartedFinancialOriginalStore,
      new C2CustodiedIssuerCandidate(resumedIssuer,issuerCustody,signedFence));
    await expect(resumedIssuer.resumeC2ProtectedOwnerIssue(actor,owner,durableBytes,{request_bytes:1_048_576},
      recoveredLease,custodyBinding,signedFence,issuerCustody)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID"});
    await expect(resumedIssuer.resumeC2ProtectedOwnerIssue(actor,owner,durableBytes,{request_bytes:1_048_576},
      recoveredLease,custodyBinding,signedFence,issuerCustody,undefined,{...financialOriginal,receiver_id:"TEST_ONLY-other"}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID"});
    const resumed=await restartedRecovery.recover(actor,owner,durableBytes,{request_bytes:1_048_576},prepared.context,originalInput);
    expect(resumed.lease_id).toBe(recoveredLease);
    // A separate OS process reconstructs only the candidate store/issuer and
    // synthetic P7/custody. It receives no parent in-memory financial state.
    const financialChild=fork(join(__dirname,"fixtures/c2-status-p7-restart-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    const financialChildExit=new Promise<number|null>(resolve=>financialChild.once("exit",resolve));
    try {
      const childResult=new Promise<{lease_id:string;assertion_digest:string}>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("TEST_ONLY_FINANCIAL_CHILD_TIMEOUT")),20000);
        financialChild.once("error",error=>{clearTimeout(timer);reject(error);});
        financialChild.once("exit",code=>{if(code!==0){clearTimeout(timer);reject(new Error("TEST_ONLY_FINANCIAL_CHILD_EXIT"));}});
        financialChild.on("message",(message:{type:string;lease_id:string;assertion_digest:string;code?:string})=>{
          if(message.type==="FINANCIAL_RECOVERED"){clearTimeout(timer);resolve(message);}
          else if(message.type==="REFUSED"){clearTimeout(timer);reject(new Error(message.code));}
        });
      });
      const {private_key:_financialPrivate,source:financialIssuerSource,...financialIssuerPlain}=issuerConfig;
      const {public_key:_financialSourcePublic,...financialIssuerSourcePlain}=financialIssuerSource;
      const {source_proof_vault:_financialVault,original:financialCustodyOriginal,source:financialCustodySource,...financialCustodyPlain}=custodyConfig;
      const {public_key:_financialOriginalPublic,...financialCustodyOriginalPlain}=financialCustodyOriginal;
      const {public_key:_financialPeerPublic,...financialCustodySourcePlain}=financialCustodySource;
      financialChild.send({type:"RECOVER_FINANCIAL",database:process.env.TEST_DATABASE_URL,authorityDatabase:process.env.TEST_AUTHORITY_DATABASE_URL,
        humanPrivate:await exportPKCS8(own.privateKey),humanPublic:await exportSPKI(own.publicKey),sourcePublic:await exportSPKI(peer.publicKey),relation:{},
        registration:sourceRegistration,registrationPublic:sourceApprovalPem,registrationPin:sourceApprovalPin,
        witnessPublic:witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),witnessPin,
        witnessProof:subprocessWitness.toString("base64"),witnessIssued:signedClaims.issued_at_ms,witnessExpires:signedClaims.expires_at_ms,
        cycle:signerCycle,b1:pin,sourceProof:proof.toString("base64"),vaultKey:subprocessVaultKey.toString("base64"),journalKey:subprocessJournalKey.toString("base64"),
        custody:{...financialCustodyPlain,original:financialCustodyOriginalPlain,source:financialCustodySourcePlain},
        issuer:{...financialIssuerPlain,source:financialIssuerSourcePlain},actor,owner,context:prepared.context,input:originalInput,path:durablePath,body:"{}"});
      expect(await childResult).toMatchObject({lease_id:recoveredLease,assertion_digest:accessDigest(resumed.token)});
      let financialExitTimer:ReturnType<typeof setTimeout>|undefined;
      try {expect(await Promise.race([financialChildExit,new Promise<never>((_,reject)=>{
        financialExitTimer=setTimeout(()=>reject(new Error("TEST_ONLY_FINANCIAL_CHILD_EXIT_TIMEOUT")),8000);
      })])).toBe(0);} finally {if(financialExitTimer)clearTimeout(financialExitTimer);}
    } finally {if(financialChild.exitCode===null&&financialChild.signalCode===null)financialChild.kill();}
    await expect(resumedIssuer.resumeC2ProtectedOwnerIssue(actor,owner,durableBytes,{request_bytes:1_048_576},
      recoveredLease,custodyBinding,signedFence,issuerCustody,undefined,financialOriginal)).resolves.toMatchObject({lease_id:recoveredLease,token:resumed.token});
    await expect(resumedIssuer.revalidateC2ProtectedOwnerIssue(actor,owner,durableBytes,{request_bytes:1_048_576},
      resumed,custodyBinding,signedFence)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID"});
    await expect(resumedIssuer.revalidateC2ProtectedOwnerIssue(actor,owner,durableBytes,{request_bytes:1_048_576},
      resumed,custodyBinding,signedFence,financialOriginal)).resolves.toBeUndefined();
    await expect(pool.query("UPDATE elp210_candidate.leases SET c2_financial_context_digest=NULL WHERE lease_id=$1",[recoveredLease]))
      .rejects.toThrow("C2_FINANCIAL_LEASE_CONTEXT_IMMUTABLE");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",[originalInput.request_digest])).rows[0].n).toBe(1);
    expect((await issuerCustody.inventory()).events.filter(e=>e.lease_id===recoveredLease&&e.kind==="ISSUED_HUMAN_ASSERTION")).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1 AND lease_id=$2",
      [accessDigest(prepared.context),recoveredLease])).rows[0].n).toBe(1);
    await expect(pool.query("DELETE FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1",[accessDigest(prepared.context)]))
      .rejects.toThrow();
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[recoveredLease]);
    // The actual financial authority now selects the opt-in durable inner
    // adapter. Its same private context + delivery ordinal produces one
    // original, while issuer/P7/custody remain the real candidate objects.
    const durableInnerStore=new C2FinancialOriginalCandidate(pool,8);
    const durableInnerRecovery=new C2FinancialOriginalRecoveryCandidate(durableInnerStore,financialWriter);
    const durableInner=new C2FinancialDurableInnerCandidate(financial,durableInnerRecovery,financialWriter,
      {owner,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest});
    const durableAuthority=new FinancialSourceAssertionAuthority(durableInner,
      {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
    const parentContext=durableAuthority.register(actor,financialSelection),innerPath="/test-only/financial-4";
    const innerBytes={method:"POST" as const,raw_path:Buffer.from(innerPath),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const innerBinding={...financialBinding,request_digest:pmHttpRequestDigest(innerBytes,{request_bytes:1_048_576})};
    const innerRequest={...financialRequest,path:innerPath,request_digest:innerBinding.request_digest};
    const innerOriginal={original_context:parentContext.original_context,expires_at_ms:parentContext.expires_at_ms,
      delivery_sequence:0,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest};
    const innerReassembled=new C2FinancialDurableInnerCandidate(financial,
      new C2FinancialOriginalRecoveryCandidate(new C2FinancialOriginalCandidate(pool,8),financialWriter),financialWriter,
      {owner,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest});
    // Queue two independent adapters behind the source authority lock so both
    // can reserve the same exact, initially unbound original before either
    // ISSUE obtains that lock. The loser must recover the winner's lease, not
    // issue a replacement or fail merely because it lost that race.
    const heldFinancialAuthority=await pool.connect();
    let concurrentFinancial:Promise<PromiseSettledResult<Awaited<ReturnType<typeof innerReassembled.issueBoundDelivery>>>[]>|undefined;
    try {
      await heldFinancialAuthority.query("BEGIN");
      await heldFinancialAuthority.query("SELECT revision FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      concurrentFinancial=Promise.allSettled([
        durableInner.issueBoundDelivery(actor,innerBinding,innerBytes,innerOriginal),
        innerReassembled.issueBoundDelivery(actor,innerBinding,innerBytes,innerOriginal),
      ]);
      let queued=false;
      for(let i=0;i<40;i++) {
        const state=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE%'`);
        if(state.rows[0].n>=2){queued=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(queued).toBe(true);
      await heldFinancialAuthority.query("ROLLBACK");
      const settled=await concurrentFinancial;
      for(const item of settled)if(item.status==="rejected")throw item.reason;
      expect(settled.map(item=>item.status)).toEqual(["fulfilled","fulfilled"]);
      if(settled[0].status!=="fulfilled"||settled[1].status!=="fulfilled")throw Error("TEST_ONLY_FINANCIAL_RACE_FAILED");
      expect(settled[0].value).toEqual(settled[1].value);
    } finally {
      await heldFinancialAuthority.query("ROLLBACK").catch(()=>{});heldFinancialAuthority.release();
      if(concurrentFinancial)await concurrentFinancial;
    }
    const innerResult=await durableAuthority.issue(parentContext.original_context,innerRequest);
    expect(await durableAuthority.issue(parentContext.original_context,innerRequest)).toEqual(innerResult);
    // Reconstruct the actual financial authority with no in-memory parent.
    // This explicitly supplied context is a locator, not an independent
    // authority or permission to restore a successor/Edge ACK.
    const rebuiltAuthority=new FinancialSourceAssertionAuthority(innerReassembled,
      {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
    await expect(rebuiltAuthority.recoverFirstDelivery({...actor,user_id:"TEST_ONLY-other"},financialSelection,
      parentContext.original_context,parentContext.expires_at_ms,innerRequest,innerResult.lease_id)).rejects.toThrow();
    await expect(rebuiltAuthority.recoverFirstDelivery(actor,financialSelection,parentContext.original_context,
      parentContext.expires_at_ms,innerRequest,"TEST_ONLY-other-lease")).rejects.toThrow();
    await expect(rebuiltAuthority.recoverFirstDelivery(actor,financialSelection,parentContext.original_context,
      parentContext.expires_at_ms,innerRequest,innerResult.lease_id)).resolves.toEqual(innerResult);
    expect(await rebuiltAuthority.issue(parentContext.original_context,innerRequest)).toEqual(innerResult);
    await expect(rebuiltAuthority.issue(parentContext.original_context,{...innerRequest,delivery_sequence:1,
      previous_lease_id:innerResult.lease_id})).rejects.toMatchObject({code:"FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED"});
    expect(await innerReassembled.issueBoundDelivery(actor,innerBinding,innerBytes,innerOriginal))
      .toMatchObject({lease_id:innerResult.lease_id,token:innerResult.assertion});
    const innerCount=Number((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_financial_candidate.originals")).rows[0].n);
    await expect(innerReassembled.revalidateBoundDelivery(actor,innerBinding,{token:innerResult.assertion,lease_id:innerResult.lease_id,
      expires_at_ms:innerResult.expires_at_ms,authority_revision:innerResult.authority_revision},innerBytes,
      {...innerOriginal,delivery_sequence:1})).rejects.toThrow();
    expect(Number((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_financial_candidate.originals")).rows[0].n)).toBe(innerCount);
    await expect(innerReassembled.issueBoundDelivery(actor,innerBinding,innerBytes,{...innerOriginal,receiver_id:"TEST_ONLY-other"})).rejects.toThrow();
    await expect(durableAuthority.issue(parentContext.original_context,{...innerRequest,delivery_sequence:1,previous_lease_id:innerResult.lease_id}))
      .rejects.toMatchObject({code:"FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED"});
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",[innerBinding.request_digest])).rows[0].n).toBe(1);
    const innerIssued={token:innerResult.assertion,lease_id:innerResult.lease_id,expires_at_ms:innerResult.expires_at_ms,
      authority_revision:innerResult.authority_revision};
    await expect(innerReassembled.verifyBoundTerminal(actor,innerBinding,innerIssued,innerBytes,innerOriginal)).rejects.toThrow();
    // A correctly signed source terminal for a financial original is NOT a
    // command-STATUS original or an Edge delivery ACK. The generic STATUS
    // helper must not be able to launder it into the STATUS ACK ledger.
    const financialTerminal=new C2CustodiedTerminalCandidate(pool,issuer,issuerCustody,signedFence);
    const financialAttempt=randomUUID();
    await financialTerminal.enter(innerResult.assertion,await sourceProof("ENTER",innerResult.lease_id,financialAttempt,innerBytes));
    await financialTerminal.resolve(await sourceProof("COMMITTED",innerResult.lease_id,financialAttempt,innerBytes));
    await expect(innerReassembled.verifyBoundTerminal(actor,innerBinding,innerIssued,innerBytes,innerOriginal))
      .resolves.toEqual({state:"VERIFIED_NOT_ACK",phase:"COMMITTED"});
    // A stalled independent custody read must not keep the source authority
    // and session locks past the bounded idle transaction interval. The
    // competing session lock is rolled back so the remaining checks use the
    // same fixture. Actual revocation additionally requires the drain policy;
    // the verifier itself must fail, never return proof.
    const heldCustody=await authority.connect();
    let financialRevoker:PoolClient|undefined;
    let stalledFinancial:Promise<unknown>|undefined;
    try {
      await heldCustody.query("BEGIN");
      await heldCustody.query("LOCK TABLE portal_restore_original_custody.events IN ACCESS EXCLUSIVE MODE");
      stalledFinancial=innerReassembled.verifyBoundTerminal(actor,innerBinding,innerIssued,innerBytes,innerOriginal)
        .then(()=>null,error=>error);
      let waiting=false;
      for(let i=0;i<100;i++) {
        const state=await authority.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%FROM portal_restore_original_custody.events e%'`);
        if(state.rows[0].n>0){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      expect(waiting).toBe(true);
      financialRevoker=await pool.connect();
      await financialRevoker.query("BEGIN");
      await financialRevoker.query("SET LOCAL statement_timeout='2600ms'");
      expect((await financialRevoker.query("SELECT session_id FROM auth_sessions WHERE session_id=$1 FOR UPDATE",[session])).rowCount).toBe(1);
      await financialRevoker.query("ROLLBACK");
      await heldCustody.query("ROLLBACK");
      expect(await stalledFinancial).toBeInstanceOf(Error);
    } finally {
      if(financialRevoker){await financialRevoker.query("ROLLBACK").catch(()=>{});financialRevoker.release();}
      await heldCustody.query("ROLLBACK").catch(()=>{});heldCustody.release();
      if(stalledFinancial)await stalledFinancial;
    }
    await expect(innerReassembled.verifyBoundTerminal(actor,innerBinding,{...innerIssued,token:innerIssued.token+"x"},innerBytes,innerOriginal)).rejects.toThrow();
    await expect(innerReassembled.verifyBoundTerminal({...actor,user_id:"TEST_ONLY-other"},innerBinding,innerIssued,innerBytes,innerOriginal)).rejects.toThrow();
    await expect(innerReassembled.verifyBoundTerminal(actor,innerBinding,innerIssued,innerBytes,{...innerOriginal,delivery_sequence:1})).rejects.toThrow();
    await expect(innerReassembled.verifyBoundTerminal(actor,innerBinding,innerIssued,innerBytes,{...innerOriginal,receiver_id:"TEST_ONLY-other"})).rejects.toThrow();
    // Even verified terminal is not a recipient ACK, nor a permit to create a successor.
    await expect(durableAuthority.complete(parentContext.original_context,{schema_version:"portal.execution.financial-source-assertion-completion-request.v1",
      binding_digest:innerRequest.binding_digest,receiver_id:innerRequest.receiver_id,workload_id:innerRequest.workload_id,
      delivery_sequence:0,lease_id:innerResult.lease_id,request_digest:innerRequest.request_digest,
      response_digest:accessDigest("TEST_ONLY-response")})).rejects.toMatchObject({code:"FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED"});
    await expect(durableAuthority.issue(parentContext.original_context,{...innerRequest,delivery_sequence:1,previous_lease_id:innerResult.lease_id}))
      .rejects.toMatchObject({code:"FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED"});
    const financialIdentity={lease_id:innerResult.lease_id,expires_at_ms:innerResult.expires_at_ms,
      authority_revision:innerResult.authority_revision};
    const crossPurpose=await Promise.allSettled([
      issuer.canReplaceResolvedIssue(actor,innerBinding,financialIdentity),
      issuer.acknowledgeCommandStatusIssue(actor,innerBinding,financialIdentity,accessDigest("TEST_ONLY-not-status")),
    ]);
    expect(crossPurpose.map(item=>item.status)).toEqual(["rejected","rejected"]);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",
      [innerResult.lease_id])).rows[0].n).toBe(0);
    financialPaths[0]="/test-only/confirmed-signer";
    const restartedFinancialIssuer=await CurrentHumanCandidate.create(pool,issuerConfig);
    const restartedFinancial=new C2FinancialAuthorityAdapter(restartedFinancialIssuer,
      new C2CustodiedIssuerCandidate(restartedFinancialIssuer,issuerCustody,signedFence),
      {owner,workspace,workload:"TEST_ONLY-source",paths:financialPaths});
    await expect(restartedFinancial.resume(actor,financialBinding,signerRequest,signedLease.lease_id))
      .resolves.toMatchObject({lease_id:signedLease.lease_id,token:signedLease.token});
    await expect(restartedFinancial.resume(actor,financialBinding,signerRequest,""))
      .rejects.toThrow("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    await expect(restartedFinancial.issue(actor,financialBinding,signerRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED"});
    expect((await issuerCustody.inventory()).events.some(e=>e.lease_id===signedLease.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION")).toBe(true);
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,signerRequest,{request_bytes:4096},signedLease.lease_id,custodyBinding,signedFence))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_CUSTODY_REQUIRED"});
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,signerRequest,{request_bytes:4096},signedLease.lease_id,custodyBinding,signedFence,issuerCustody))
      .resolves.toMatchObject({lease_id:signedLease.lease_id,token:signedLease.token});
    // Real selected C2 configuration: a lost/unavailable custody append must
    // not release a bearer. After the authority lock clears, restart the
    // issuer and resume the exact original rather than allocating a new one.
    const interruptedRequest={...request,raw_path:Buffer.from("/test-only/confirmed-custody-interrupted")};
    const hold=await authority.connect();let pending:C2CustodyPendingError|undefined;
    try {
      await hold.query("BEGIN");
      await hold.query("SELECT custody_id FROM portal_restore_original_custody.head WHERE custody_id=$1 FOR UPDATE",[custodyId]);
      try {await issuer.issueC2ProtectedOwner(actor,owner,interruptedRequest,{request_bytes:4096},custodyBinding,signedFence,issuerCustody);}
      catch(error) {expect(error).toBeInstanceOf(C2CustodyPendingError);pending=error as C2CustodyPendingError;}
      expect(pending).toBeInstanceOf(C2CustodyPendingError);
      expect(Object.keys(pending!)).not.toContain("token");
    } finally {await hold.query("ROLLBACK").catch(()=>{});hold.release();}
    const restartedAfterCustodyLoss=await CurrentHumanCandidate.create(pool,issuerConfig);
    const recovered=await restartedAfterCustodyLoss.resumeC2ProtectedOwnerIssue(actor,owner,interruptedRequest,
      {request_bytes:4096},pending!.lease_id,custodyBinding,signedFence,issuerCustody);
    expect(recovered.lease_id).toBe(pending!.lease_id);
    expect((await issuerCustody.inventory()).events.filter(e=>e.lease_id===recovered.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION")).toHaveLength(1);
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[recovered.lease_id]);
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[signedLease.lease_id]);
    // A separate process owns the first financial authority. After ISSUE, the
    // parent supplies a stable operation ref before the child begins and kills
    // that child; after OS exit it loads the encrypted locator and finds lease.
    // This does not prove old-holder fencing or durable parent discovery.
    const childPath="/test-only/financial-5";
    const childBytes={method:"POST" as const,raw_path:Buffer.from(childPath),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const childRequest={...financialRequest,path:childPath,request_digest:pmHttpRequestDigest(childBytes,{request_bytes:1_048_576})};
    const childParentKey=randomBytes(32);
    const childParentRef=randomUUID();
    const authorityChild=fork(join(__dirname,"fixtures/c2-status-p7-restart-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    let childKillRequested=false;
    const authorityChildExit=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>
      authorityChild.once("exit",(code,signal)=>resolve({code,signal})));
    try {
      const childIssued=new Promise<{parent_ref:string;assertion_digest:string}>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("TEST_ONLY_FINANCIAL_AUTHORITY_CHILD_TIMEOUT")),20000);
        authorityChild.once("error",error=>{clearTimeout(timer);reject(error);});
        authorityChild.once("exit",code=>{if(code!==0&&!childKillRequested){clearTimeout(timer);reject(new Error("TEST_ONLY_FINANCIAL_AUTHORITY_CHILD_EXIT"));}});
        authorityChild.on("message",(message:{type:string;parent_ref:string;assertion_digest:string;code?:string})=>{
          if(message.type==="FINANCIAL_AUTHORITY_ISSUED"){clearTimeout(timer);resolve(message);}
          else if(message.type==="REFUSED"){clearTimeout(timer);reject(new Error(message.code));}
        });
      });
      const {private_key:_childPrivate,source:childIssuerSource,...childIssuerPlain}=issuerConfig;
      const {public_key:_childSourcePublic,...childIssuerSourcePlain}=childIssuerSource;
      const {source_proof_vault:_childVault,original:childCustodyOriginal,source:childCustodySource,...childCustodyPlain}=custodyConfig;
      const {public_key:_childOriginalPublic,...childCustodyOriginalPlain}=childCustodyOriginal;
      const {public_key:_childPeerPublic,...childCustodySourcePlain}=childCustodySource;
      authorityChild.send({type:"ISSUE_FINANCIAL_AUTHORITY",database:process.env.TEST_DATABASE_URL,authorityDatabase:process.env.TEST_AUTHORITY_DATABASE_URL,
        humanPrivate:await exportPKCS8(own.privateKey),humanPublic:await exportSPKI(own.publicKey),sourcePublic:await exportSPKI(peer.publicKey),relation:{},
        registration:sourceRegistration,registrationPublic:sourceApprovalPem,registrationPin:sourceApprovalPin,
        witnessPublic:witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),witnessPin,
        witnessProof:subprocessWitness.toString("base64"),witnessIssued:signedClaims.issued_at_ms,witnessExpires:signedClaims.expires_at_ms,
        cycle:signerCycle,b1:pin,sourceProof:proof.toString("base64"),vaultKey:subprocessVaultKey.toString("base64"),journalKey:subprocessJournalKey.toString("base64"),
        custody:{...childCustodyPlain,original:childCustodyOriginalPlain,source:childCustodySourcePlain},
        issuer:{...childIssuerPlain,source:childIssuerSourcePlain},actor,owner,selection:financialSelection,request:childRequest,
        parentKey:childParentKey.toString("base64"),parentRef:childParentRef,hold_after_issued:true});
      const child=await childIssued;
      expect(child.parent_ref).toBe(childParentRef);
      childKillRequested=true;
      expect(authorityChild.kill("SIGKILL")).toBe(true);
      let childExitTimer:ReturnType<typeof setTimeout>|undefined;
      try {expect(await Promise.race([authorityChildExit,new Promise<never>((_,reject)=>{
        childExitTimer=setTimeout(()=>reject(new Error("TEST_ONLY_FINANCIAL_AUTHORITY_CHILD_EXIT_TIMEOUT")),8000);
      })])).toEqual({code:null,signal:"SIGKILL"});} finally {if(childExitTimer)clearTimeout(childExitTimer);}
      const parentStore=new C2FinancialParentCandidate(authority,childParentKey,"TEST_ONLY-parent-key",8);
      // A rejected save cannot expose a context or permit an ISSUE. This is
      // a real DB limit mismatch, not a fake authority response.
      const rejectedBegin=new C2FinancialParentOrchestratorCandidate(
        new C2FinancialParentCandidate(authority,childParentKey,"TEST_ONLY-parent-key",7),innerReassembled,
        {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
      const rejectedRef=randomUUID();
      await expect(rejectedBegin.begin(rejectedRef,actor,financialSelection)).rejects.toThrow();
      await expect(rejectedBegin.issue(rejectedRef,actor,financialSelection,childRequest)).rejects.toThrow();
      expect((await authority.query("SELECT count(*)::int AS n FROM elp210_c2_financial_parent_candidate.parents WHERE parent_id=$1",[rejectedRef])).rows[0].n).toBe(0);
      rejectedBegin.shutdown();
      await expect(parentStore.load(child.parent_ref,{...actor,user_id:"TEST_ONLY-other"},financialSelection)).rejects.toThrow();
      await expect(parentStore.load(child.parent_ref,actor,{...financialSelection,receiver_id:"TEST_ONLY-other"})).rejects.toThrow();
      await expect(new C2FinancialParentCandidate(authority,randomBytes(32),"TEST_ONLY-parent-key",8)
        .load(child.parent_ref,actor,financialSelection)).rejects.toThrow();
      const persisted=await parentStore.load(child.parent_ref,actor,financialSelection);
      // Same-ref retry after an ambiguous save commit must rejoin the exact
      // encrypted parent, while changed context/expiry cannot be rebound.
      await expect(parentStore.save(childParentRef,actor,financialSelection,persisted.original_context,persisted.expires_at_ms))
        .resolves.toBe(childParentRef);
      await expect(parentStore.save(childParentRef,actor,financialSelection,randomBytes(32).toString("base64url"),persisted.expires_at_ms))
        .rejects.toThrow();
      await expect(parentStore.save(childParentRef,actor,financialSelection,persisted.original_context,persisted.expires_at_ms+1))
        .rejects.toThrow();
      const storedParent=await authority.query("SELECT * FROM elp210_c2_financial_parent_candidate.parents WHERE parent_id=$1",[child.parent_ref]);
      expect(JSON.stringify(storedParent.rows)).not.toContain(persisted.original_context);
      const record=storedParent.rows[0];
      const alteredCipher=(record.ciphertext[0]==="A"?"B":"A")+record.ciphertext.slice(1);
      const tamperedDb={query:async()=>({rowCount:1,rows:[{...record,expires_at_ms:String(record.expires_at_ms),ciphertext:alteredCipher}]})};
      await expect(new C2FinancialParentCandidate(tamperedDb as unknown as Pool,childParentKey,"TEST_ONLY-parent-key",8)
        .load(child.parent_ref,actor,financialSelection)).rejects.toThrow();
      await expect(authority.query("UPDATE elp210_c2_financial_parent_candidate.parents SET ciphertext='tampered' WHERE parent_id=$1",[child.parent_ref])).rejects.toThrow();
      await expect(authority.query("DELETE FROM elp210_c2_financial_parent_candidate.parents WHERE parent_id=$1",[child.parent_ref])).rejects.toThrow();
      const childBinding={...financialBinding,request_digest:childRequest.request_digest};
      const childOriginal={original_context:persisted.original_context,expires_at_ms:persisted.expires_at_ms,
        delivery_sequence:0,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest};
      const childLease=await innerReassembled.locateBoundDelivery(actor,childBinding,childBytes,childOriginal);
      const differentBytes={...childBytes,raw_path:Buffer.from("/test-only/financial-6")};
      const differentBinding={...childBinding,request_digest:pmHttpRequestDigest(differentBytes,{request_bytes:1_048_576})};
      await expect(innerReassembled.locateBoundDelivery(actor,differentBinding,differentBytes,childOriginal)).rejects.toThrow();
      // Crash after parent save but before ISSUE is not permission to create a
      // replacement during recovery; there is no bound original to locate.
      const unusedAuthority=new FinancialSourceAssertionAuthority(innerReassembled,
        {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
      const unused=unusedAuthority.register(actor,financialSelection),unusedRef=randomUUID();
      await parentStore.save(unusedRef,actor,financialSelection,unused.original_context,unused.expires_at_ms);
      const unusedReloaded=await parentStore.load(unusedRef,actor,financialSelection);
      await expect(innerReassembled.locateBoundDelivery(actor,differentBinding,differentBytes,
        {original_context:unusedReloaded.original_context,expires_at_ms:unusedReloaded.expires_at_ms,
          delivery_sequence:0,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest})).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",[differentBinding.request_digest])).rows[0].n).toBe(0);
      unusedAuthority.shutdown();
      const afterExit=new C2FinancialParentOrchestratorCandidate(parentStore,innerReassembled,
        {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
      // A saved parent without a bound first ISSUE must never allocate a new
      // lease during recovery. Wrong actor/request is equally fail-closed.
      await expect(afterExit.restoreFirst(unusedRef,actor,financialSelection,{...childRequest,
        path:"/test-only/financial-6",request_digest:differentBinding.request_digest})).rejects.toThrow();
      await expect(afterExit.restoreFirst(childParentRef,{...actor,user_id:"TEST_ONLY-other"},financialSelection,childRequest)).rejects.toThrow();
      await expect(afterExit.restoreFirst(childParentRef,actor,financialSelection,{...childRequest,
        path:"/test-only/financial-6",request_digest:differentBinding.request_digest})).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",[differentBinding.request_digest])).rows[0].n).toBe(0);
      const restored=await afterExit.restoreFirst(childParentRef,actor,financialSelection,childRequest);
      expect(restored.lease_id).toBe(childLease);
      expect(accessDigest(restored.assertion)).toBe(child.assertion_digest);
      expect(await afterExit.issue(childParentRef,actor,financialSelection,childRequest)).toEqual(restored);
      await expect(afterExit.issue(childParentRef,{...actor,user_id:"TEST_ONLY-other"},financialSelection,childRequest)).rejects.toThrow();
      await expect(afterExit.issue(childParentRef,actor,financialSelection,{...childRequest,delivery_sequence:1,previous_lease_id:childLease}))
        .rejects.toMatchObject({code:"FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED"});
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",[childRequest.request_digest])).rows[0].n).toBe(1);
      afterExit.shutdown();
      await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[childLease]);
    } finally {if(authorityChild.exitCode===null&&authorityChild.signalCode===null)authorityChild.kill();}
    // TEST_ONLY positive C2 STATUS candidate: original link and assertion are
    // committed together, bearer retained independently before it escapes.
    // This is not Edge source authority or an authenticated delivery ACK.
    const statusRequest={method:"POST" as const,raw_path:Buffer.from(directCore.issue.path),
      query_string:Buffer.alloc(0),body:Buffer.from(directCore.issue.body_utf8)};
    const now=Date.now(),statusLink={context_digest:`sha256:${"1".repeat(64)}`,context_nonce:"a".repeat(43),
      original_digest:accessDigest(directCore.input.original),call_digest:directCore.input.call_digest,
      binding_digest:directCore.issue.binding_digest,authority_fingerprint:`sha256:${"5".repeat(64)}`,
      status_token_digest:`sha256:${"6".repeat(64)}`,status_request_digest:`sha256:${"7".repeat(64)}`,
      status_issued_at_ms:now-1000,receiver_id:directCore.issue.receiver_id,delivery_sequence:0,previous_lease_id:null,
      context_expires_at_ms:now+30000};
    await expect(issuer.issueC2ProtectedOwnerCommandStatus(actor,owner,{...statusRequest,raw_path:Buffer.from("/other")},
      {request_bytes:4096},statusLink,custodyBinding,signedFence,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID"});
    const statusWriter=new C2CustodiedIssuerCandidate(issuer,issuerCustody,signedFence);
    const statusBinding={workspace_id:workspace,environment:"paper" as const,workload_id:"TEST_ONLY-source",
      request_digest:pmHttpRequestDigest(statusRequest,{request_bytes:4096})};
    // Real Core access/command-store paths with explicitly synthetic TS facts;
    // no source request, production grant or live command was created.
    const statusAccess=statusCore.access;
    const statusAuthorityConfig={issuer:"TEST_ONLY-status-core",audience:"TEST_ONLY-status-edge",key_id:"TEST_ONLY-status-key",
      key:own.privateKey,workload_id:"TEST_ONLY-source",ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4};
    const assemble=(config=issuerConfig,selectedOwner=owner,selectedCustody=issuerCustody,selectedP7=signedFence)=>
      createC2CommandStatusInnerCandidate(pool,statusAccess,config,statusAuthorityConfig,selectedOwner,selectedCustody,selectedP7);
    await expect(createC2CommandStatusInnerCandidate(pool,{usesPool:(p:Pool)=>p===pool} as ExecutionAccessService,
      issuerConfig,statusAuthorityConfig,owner,issuerCustody,signedFence)).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    const forgedAccess=Object.create(ExecutionAccessService.prototype) as ExecutionAccessService;
    Reflect.set(forgedAccess,"pool",pool);
    await expect(createC2CommandStatusInnerCandidate(pool,forgedAccess,issuerConfig,statusAuthorityConfig,
      owner,issuerCustody,signedFence)).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    const otherPool=new Pool({connectionString:process.env.TEST_DATABASE_URL!,max:1});
    Reflect.set(statusAccess,"pool",otherPool);
    try {await expect(assemble()).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");}
    finally {Reflect.set(statusAccess,"pool",pool);await otherPool.end();}
    Reflect.set(statusAccess,"readContext",async()=>({}));
    try {await expect(assemble()).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");}
    finally {Reflect.deleteProperty(statusAccess,"readContext");}
    const racedAccess=assemble();
    Reflect.set(statusAccess,"confirmReadContext",async()=>({}));
    try {await expect(racedAccess).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");}
    finally {Reflect.deleteProperty(statusAccess,"confirmReadContext");}
    await expect(assemble(issuerConfig,"TEST_ONLY-other-owner")).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble({...issuerConfig,installation_scope:{...issuerConfig.installation_scope!,workspace_id:"TEST_ONLY-other"}}))
      .rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble(issuerConfig,owner,legacyCustody)).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble(issuerConfig,owner,issuerCustody,unconfirmed)).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble({...issuerConfig,private_key:peer.privateKey})).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble({...issuerConfig,source:{...issuerConfig.source,public_key:own.publicKey}}))
      .rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    const foreignKey=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    // A matching kid/issuer is not proof of the same key at either end.
    await expect(assemble({...issuerConfig,private_key:foreignKey.privateKey})).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    await expect(assemble({...issuerConfig,source:{...issuerConfig.source,public_key:foreignKey.publicKey}}))
      .rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");
    const racedAssembly=assemble();
    Reflect.set(signedFence,"checkAuthenticatedLocked",async()=>({intent_id:randomUUID(),expires_at_ms:Date.now()+60000}));
    try {await expect(racedAssembly).rejects.toThrow("C2_STATUS_INNER_CONFIG_INVALID");}
    finally {Reflect.deleteProperty(signedFence,"checkAuthenticatedLocked");}
    const statusInner=await assemble(),statusAdapter=statusInner.adapter;
    expect(statusInner.authority.snapshot()).toMatchObject({contexts:0,pending:0,stopped:false});
    expect(Reflect.get(statusInner.authority,"candidate")).toBe(statusAdapter);
    expect(statusInner.terminal.usesCandidate(statusInner.candidate)).toBe(true);
    const syntheticOriginal={original:async()=>structuredClone(statusCore.input.original)};
    statusInner.authority.bindRecoverySource(syntheticOriginal,statusCore.input.contract);
    const wrongCall=accessDigest("TEST_ONLY:noncanonical-call");
    await expect(statusInner.authority.prepare({...statusCore.input,call_digest:wrongCall},
      JSON.stringify({...JSON.parse(statusCore.body),call_digest:wrongCall})))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_BINDING_MISMATCH",status:403});
    const wrongActor={...actor,user_id:"TEST_ONLY-wrong-owner"};
    const wrongActorCall=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(wrongActor),
      original:statusCore.input.original,authorization_digest:accessDigest(statusCore.input.authorization),
      intent_hash:statusCore.input.authorization.intent_hash});
    await expect(statusInner.authority.prepare({...statusCore.input,actor:wrongActor,call_digest:wrongActorCall},
      JSON.stringify({...JSON.parse(statusCore.body),call_digest:wrongActorCall})))
      .rejects.toThrow();
    const preparedStatus=await statusInner.authority.prepare(statusCore.input,statusCore.body);
    // An internal caller must not alter a durable preparation while keeping
    // its context digest. A row match alone is not the reviewed STATUS link.
    const preparedRow=(await pool.query("SELECT * FROM execution_command_status_preparations WHERE context_digest=$1",
      [accessDigest(preparedStatus.original_context)])).rows[0];
    const preparedLink={context_digest:preparedRow.context_digest,context_nonce:preparedRow.context_nonce,
      original_digest:preparedRow.original_digest,call_digest:preparedRow.call_digest,binding_digest:preparedRow.binding_digest,
      authority_fingerprint:preparedRow.authority_fingerprint,status_token_digest:preparedRow.status_token_digest,
      status_request_digest:preparedRow.status_request_digest,status_issued_at_ms:Number(preparedRow.status_issued_at_ms),
      receiver_id:preparedRow.receiver_id,delivery_sequence:0,previous_lease_id:null,
      context_expires_at_ms:Number(preparedRow.context_expires_at_ms)};
    const preparedRequest={method:"POST" as const,raw_path:Buffer.from(statusCore.issue.path),query_string:Buffer.alloc(0),
      body:Buffer.from(statusCore.issue.body_utf8)};
    const preparedBinding={workspace_id:workspace,environment:"paper" as const,workload_id:"TEST_ONLY-source",
      request_digest:statusCore.issue.request_digest};
    const mismatchCases=[{context_digest:`sha256:${"b".repeat(64)}`},{context_nonce:"b".repeat(43)},
      {original_digest:`sha256:${"b".repeat(64)}`},{call_digest:`sha256:${"d".repeat(64)}`},
      {binding_digest:`sha256:${"e".repeat(64)}`},{authority_fingerprint:`sha256:${"f".repeat(64)}`},
      {status_token_digest:`sha256:${"a".repeat(64)}`},{status_request_digest:`sha256:${"b".repeat(64)}`},
      {status_issued_at_ms:preparedLink.status_issued_at_ms+1},{receiver_id:"TEST_ONLY-other"},
      {context_expires_at_ms:preparedLink.context_expires_at_ms+1000}];
    for(const mismatch of mismatchCases)await expect(statusAdapter.issueCommandStatus(actor,preparedBinding,
      {...preparedLink,...mismatch},preparedRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    const actualStatus=await statusInner.authority.issue(preparedStatus.original_context,statusCore.issue);
    expect(await statusInner.authority.issue(preparedStatus.original_context,statusCore.issue)).toEqual(actualStatus);
    const actualLink=(await pool.query(`SELECT original_digest,assertion_digest,lease_id FROM execution_command_status_context_links
      WHERE context_digest=$1`,[accessDigest(preparedStatus.original_context)])).rows;
    expect(actualLink).toEqual([{original_digest:accessDigest(statusCore.input.original),
      assertion_digest:accessDigest(actualStatus.assertion),lease_id:actualStatus.lease_id}]);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",
      [actualStatus.lease_id])).rows[0].n).toBe(0);
    // New assembly has no in-memory contexts. It must re-read the original
    // from the TEST_ONLY recovery source and resume the exact persisted P7
    // assertion, without minting a second lease or fake terminal/ACK.
    const statusRestart=await assemble();
    statusRestart.authority.bindRecoverySource(syntheticOriginal,statusCore.input.contract);
    expect(await statusRestart.authority.issue(preparedStatus.original_context,statusCore.issue)).toEqual(actualStatus);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_context_links WHERE context_digest=$1",
      [accessDigest(preparedStatus.original_context)])).rows[0].n).toBe(1);
    statusRestart.authority.shutdown();
    statusInner.authority.shutdown();
    // A real separate OS process reconstructs all Core/P7/custody objects
    // from synthetic facts and test-only keys. It gets no parent contexts.
    // Its dedicated-DB guard prevents use against a shared/runtime database.
    const child=fork(join(__dirname,"fixtures/c2-status-p7-restart-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    const childExit=new Promise<number|null>(resolve=>child.once("exit",resolve));
    try {
      const result=new Promise<unknown>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("TEST_ONLY_C2_CHILD_TIMEOUT")),20000);
        child.once("error",error=>{clearTimeout(timer);reject(error);});
        child.once("exit",code=>{if(code!==0){clearTimeout(timer);reject(new Error("TEST_ONLY_C2_CHILD_EXIT"));}});
        child.on("message",(message:{type:string;result?:unknown;code?:string})=>{
          if(message.type==="RECOVERED"){clearTimeout(timer);resolve(message.result);}
          else if(message.type==="REFUSED"){clearTimeout(timer);reject(new Error(message.code));}
        });
      });
      const {private_key:_private,source:issuerSource,...issuerPlain}=issuerConfig;
      const {public_key:_sourcePublic,...issuerSourcePlain}=issuerSource;
      const {source_proof_vault:_vault,original:custodyOriginal,source:custodySource,...custodyPlain}=custodyConfig;
      const {public_key:_originalPublic,...custodyOriginalPlain}=custodyOriginal;
      const {public_key:_custodySourcePublic,...custodySourcePlain}=custodySource;
      const {key:_authorityKey,...statusAuthorityPlain}=statusAuthorityConfig;
      child.send({type:"RECOVER",database:process.env.TEST_DATABASE_URL,authorityDatabase:process.env.TEST_AUTHORITY_DATABASE_URL,
        humanPrivate:await exportPKCS8(own.privateKey),humanPublic:await exportSPKI(own.publicKey),
        sourcePublic:await exportSPKI(peer.publicKey),relation:statusCore.source,registration:sourceRegistration,
        registrationPublic:sourceApprovalPem,registrationPin:sourceApprovalPin,witnessPublic:witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),
        witnessPin,witnessProof:subprocessWitness.toString("base64"),witnessIssued:signedClaims.issued_at_ms,
        witnessExpires:signedClaims.expires_at_ms,cycle:signerCycle,b1:pin,sourceProof:proof.toString("base64"),
        custody:{...custodyPlain,original:custodyOriginalPlain,source:custodySourcePlain},
        vaultKey:subprocessVaultKey.toString("base64"),journalKey:subprocessJournalKey.toString("base64"),
        issuer:{...issuerPlain,source:issuerSourcePlain},statusAuthority:statusAuthorityPlain,owner,
        original:statusCore.input.original,contract:statusCore.input.contract,context:preparedStatus.original_context,request:statusCore.issue});
      expect(await result).toEqual(actualStatus);
      let exitTimer:ReturnType<typeof setTimeout>|undefined;
      try {
        const exitCode=await Promise.race([childExit,new Promise<never>((_,reject)=>{
          exitTimer=setTimeout(()=>reject(new Error("TEST_ONLY_C2_CHILD_EXIT_TIMEOUT")),8000);
        })]);
        expect(exitCode).toBe(0);
      } finally {if(exitTimer)clearTimeout(exitTimer);}
    } finally {
      subprocessWitness.fill(0);subprocessVaultKey.fill(0);subprocessJournalKey.fill(0);
      if(child.exitCode===null && child.signalCode===null)child.kill();
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_context_links WHERE context_digest=$1",
      [accessDigest(preparedStatus.original_context)])).rows[0].n).toBe(1);
    // Compose the actual Core/P7 authority with the restricted HTTP reader and
    // writer, in this disposable cell only. No terminal or ACK is fabricated.
    const suffix=new URL(process.env.TEST_DATABASE_URL!).pathname.slice(-8);
    const deliverySql=await readFile(join(process.cwd(),"src/execution-v2/c2-delivery-procedure-acl-candidate.sql"),"utf8");
    const readerSql=await readFile(join(process.cwd(),"src/execution-v2/c2-status-reader-acl-candidate.sql"),"utf8");
    const financialReaderSql=await readFile(join(process.cwd(),"src/execution-v2/c2-financial-reader-acl-candidate.sql"),"utf8");
    const installDb=await pool.connect();
    try {
      await expect(installDb.query(deliverySql)).rejects.toThrow("C2_DELIVERY_PROC_DISPOSABLE_DATABASE_REQUIRED");
      await installDb.query("ROLLBACK");
      await expect(installDb.query(readerSql)).rejects.toThrow("C2_STATUS_READER_DISPOSABLE_DATABASE_REQUIRED");
      await installDb.query("ROLLBACK");
      await expect(installDb.query(financialReaderSql)).rejects.toThrow("C2_FINANCIAL_READER_DISPOSABLE_DATABASE_REQUIRED");
      await installDb.query("ROLLBACK");
      await installDb.query("SELECT set_config('portal.test_only_p7_delivery','TEST_ONLY_C2_P7_DEDICATED_DATABASE',false)");
      await installDb.query(deliverySql);
      await installDb.query(`GRANT SELECT ON execution_command_status_context_links,execution_command_status_delivery_acks
        TO test_delivery_definer_${suffix}`);
      await installDb.query(readerSql);
      await installDb.query(`GRANT USAGE ON SCHEMA elp210_c2_financial_candidate TO test_delivery_definer_${suffix};
        GRANT SELECT ON elp210_c2_financial_candidate.originals TO test_delivery_definer_${suffix}`);
      await installDb.query(financialReaderSql);
      await installDb.query("RESET portal.test_only_p7_delivery");
    } finally {installDb.release();}
    const guard=`test_p7_delivery_guard_${suffix}`,login=`test_p7_http_${suffix}`,password=randomBytes(24).toString("hex");
    await pool.query(`CREATE ROLE ${guard} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_candidate,elp210_c2_fence_candidate,elp210_c2_p7_candidate,elp210_c2_delivery_candidate TO ${guard};
      GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${guard};
      GRANT SELECT ON elp210_candidate.leases,elp210_c2_fence_candidate.scopes,elp210_c2_p7_candidate.owner_intent_revocations TO ${guard};
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO ${guard};
      GRANT SELECT,UPDATE(confirmation_sha256) ON elp210_c2_p7_candidate.records TO ${guard};
      GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO ${guard};
      ALTER FUNCTION elp210_c2_delivery_candidate.guard_p7_delivery() OWNER TO ${guard};
      CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT test_delivery_caller_${suffix} TO ${login}`);
    const guardDb=await pool.connect();
    try {
      await guardDb.query("BEGIN");await guardDb.query(`SET LOCAL ROLE ${guard}`);
      await guardDb.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-delivery-definer-candidate.sql"),"utf8"));
      await guardDb.query("COMMIT");
    } finally {await guardDb.query("ROLLBACK").catch(()=>{});guardDb.release();}
    const restrictedUrl=new URL(process.env.TEST_DATABASE_URL!);restrictedUrl.username=login;restrictedUrl.password=password;
    const restricted=new Pool({connectionString:restrictedUrl.toString(),max:3,connectionTimeoutMillis:5000,query_timeout:10000});
    const caPair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),caName=commonName("TEST_ONLY-p7-http-ca");
    const ca:TestAuthority={key:caPair.privateKey,name:caName,certificate:testCertificate(caName,caPair,{name:caName,key:caPair.privateKey},true)};
    const identity=(name:string)=>{const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
      return {key:Buffer.from(pair.privateKey.export({type:"pkcs8",format:"pem"})),cert:testCertificate(commonName(name),pair,ca,false)};};
    const coreIdentity=identity("TEST_ONLY-core"),edgeIdentity=identity("TEST_ONLY-edge");
    const registrationHash=(await pool.query("SELECT registration_sha256 FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-key'")).rows[0].registration_sha256;
    // Actual unmounted financial authority -> restricted metadata reader ->
    // committed HTTP custody on loopback mTLS. All source/keys are TEST_ONLY;
    // a socket finish is not source completion or recipient ACK.
    const httpFinancialInner=new C2FinancialDurableInnerCandidate(financial,
      new C2FinancialOriginalRecoveryCandidate(new C2FinancialOriginalCandidate(pool,16),financialWriter),financialWriter,
      {owner,receiver_id:financialSelection.receiver_id,binding_digest:financialSelection.binding_digest});
    const httpFinancialAuthority=new C2FinancialParentOrchestratorCandidate(
      new C2FinancialParentCandidate(authority,randomBytes(32),"TEST_ONLY-http-parent-key",8),httpFinancialInner,
      {ttl_ms:60000,maximum_contexts:2,maximum_requests_per_context:4});
    const httpFinancialRef=randomUUID();
    await httpFinancialAuthority.begin(httpFinancialRef,actor,financialSelection);
    const httpFinancialPath="/test-only/financial-6";
    const httpFinancialBytes={method:"POST" as const,raw_path:Buffer.from(httpFinancialPath),query_string:Buffer.alloc(0),body:Buffer.from("{}")};
    const httpFinancialRequest={...financialRequest,path:httpFinancialPath,
      request_digest:pmHttpRequestDigest(httpFinancialBytes,{request_bytes:1_048_576})};
    let alterFinancialAssertion=true;
    let pauseFinancial=false,signalFinancial:()=>void=()=>{},resumeFinancial:()=>void=()=>{};
    let financialPaused=Promise.resolve();
    const deliverFinancial=createC2TestFinancialDelivery(restricted,restricted,actor,financialSelection,
      {registration_key:"TEST_ONLY-key",registration_sha256:registrationHash});
    const transportAuthority=httpFinancialAuthority.testTransportAuthority();
    const financialTransport=createFinancialSourceAssertionTestCustodyTransport(transportAuthority,{
      tls:{...coreIdentity,ca:ca.certificate},peer:{certificate_sha256:`sha256:${createHash("sha256").update(new X509Certificate(edgeIdentity.cert).raw).digest("hex")}`,
        dns_name:"localhost",workload_id:"TEST_ONLY-source"},
      limits:{maximum_in_flight:1,request_bytes:32768,response_bytes:32768,deadline_ms:5000}},
      httpFinancialAuthority.guardTestTransportDelivery(async(context,request,output,response,remaining)=>{
        if(pauseFinancial){signalFinancial();await financialPaused;}
        return deliverFinancial(context,request,
          alterFinancialAssertion?{...output,assertion:"TEST_ONLY-wrong-assertion"}:output,response,remaining);
      }));
    try {
      await expect(restricted.query("SELECT context_digest FROM elp210_c2_financial_candidate.originals")).rejects.toThrow(/permission denied/i);
      await new Promise<void>((resolve,reject)=>{financialTransport.server.once("error",reject);financialTransport.server.listen(0,"127.0.0.1",()=>resolve());});
      const address=financialTransport.server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_ADDRESS_REQUIRED");
      const postFinancial=(context:string)=>new Promise<{status:number;body:string}>((resolve,reject)=>{
        const bytes=JSON.stringify(httpFinancialRequest),req=httpsRequest({host:"127.0.0.1",port:address.port,
          path:"/internal/elp210/financial-source/assertion",method:"POST",agent:false,...edgeIdentity,ca:ca.certificate,
          minVersion:"TLSv1.3",maxVersion:"TLSv1.3",headers:{"content-type":"application/json",
            "content-length":Buffer.byteLength(bytes),authorization:`Bearer ${context}`}},res=>{
            const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
            res.on("end",()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString("utf8")}));res.on("error",reject);
          });req.on("error",reject);req.setTimeout(8000,()=>req.destroy(new Error("TEST_ONLY_HTTP_TIMEOUT")));req.end(bytes);
      });
      let retainedContext="";
      // End the owner scope after the assertion was validated but before the
      // custody callback can send bytes. The real loopback socket is closed,
      // and reopening the same operation uses a distinct transport token.
      pauseFinancial=true;
      financialPaused=new Promise<void>(resolve=>{resumeFinancial=resolve;});
      const started=new Promise<void>(resolve=>{signalFinancial=resolve;});
      let cancelled!:Promise<{error?:unknown;value?:{status:number;body:string}}>;
      await httpFinancialAuthority.withTestTransportContext(httpFinancialRef,actor,financialSelection,async context=>{
        retainedContext=context;cancelled=postFinancial(context).then(value=>({value}),error=>({error}));await started;
      });
      expect((await cancelled).error).toMatchObject({code:"ECONNRESET"});
      pauseFinancial=false;resumeFinancial();
      await expect.poll(()=>financialTransport.snapshot().in_flight).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.obligations WHERE request_digest=$1",
        [httpFinancialRequest.request_digest])).rows[0].n).toBe(0);
      const oldContext=retainedContext;
      await httpFinancialAuthority.withTestTransportContext(httpFinancialRef,actor,financialSelection,async context=>{
      expect(context).not.toBe(oldContext);
      await expect(transportAuthority.issue(oldContext,httpFinancialRequest)).rejects.toThrow();
      retainedContext=context;
      await expect(httpFinancialAuthority.withTestTransportContext(httpFinancialRef,actor,financialSelection,async()=>undefined)).rejects.toThrow();
      await expect(httpFinancialAuthority.withTestTransportContext(httpFinancialRef,{...actor,user_id:"TEST_ONLY-other"},financialSelection,async()=>undefined)).rejects.toThrow();
      expect((await postFinancial(context)).status).toBe(503);
      const boundLease=(await pool.query("SELECT lease_id FROM elp210_candidate.leases WHERE request_digest=$1 AND phase='ISSUED'",
        [httpFinancialRequest.request_digest])).rows;
      expect(boundLease).toHaveLength(1);
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",
        [boundLease[0].lease_id])).rows[0].n).toBe(0);
      alterFinancialAssertion=false;
      const served=await postFinancial(context);expect(served.status).toBe(200);
      const servedFinancial=JSON.parse(served.body);
      expect(servedFinancial).toMatchObject({lease_id:boundLease[0].lease_id,request_digest:httpFinancialRequest.request_digest});
      await expect.poll(()=>financialTransport.snapshot().in_flight).toBe(0);
      expect((await pool.query("SELECT state FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",
        [boundLease[0].lease_id])).rows).toEqual([{state:"UNKNOWN"}]);
      const contextRow=(await pool.query("SELECT context_digest FROM elp210_c2_financial_candidate.originals WHERE lease_id=$1",
        [boundLease[0].lease_id])).rows[0];
      const readFinancial="SELECT * FROM elp210_c2_delivery_candidate.read_financial_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)";
      const readerArgs=[contextRow.context_digest,servedFinancial.lease_id,servedFinancial.binding_digest,servedFinancial.receiver_id,
        servedFinancial.request_digest,accessDigest(servedFinancial.assertion),servedFinancial.issued_at_ms,servedFinancial.expires_at_ms,
        servedFinancial.authority_revision,workspace,owner,actor.session_id,actor.session_generation,"TEST_ONLY-source"];
      expect((await restricted.query(readFinancial,readerArgs)).rows).toMatchObject([{original_digest:contextRow.context_digest}]);
      for(const index of [0,1,2,3,4,5,6,7,8,9,10,11,12,13]) {
        const changed=[...readerArgs];changed[index]=typeof changed[index]==="number"?(changed[index] as number)+1:"TEST_ONLY-mismatch";
        expect((await restricted.query(readFinancial,changed)).rowCount).toBe(0);
      }
      // An unsafe grant on the financial original cannot be hidden behind the
      // restricted reader or UNKNOWN replay. Test only; no runtime ACL change.
      const readUnknown="SELECT elp210_c2_delivery_candidate.apply_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS result";
      const unknownArgs=["UNKNOWN",servedFinancial.lease_id,workspace,owner,"TEST_ONLY-source",servedFinancial.request_digest,
        contextRow.context_digest,`sha256:${createHash("sha256").update(served.body).digest("hex")}`,Buffer.byteLength(served.body),
        servedFinancial.expires_at_ms,"TEST_ONLY-key",registrationHash];
      expect((await restricted.query(readUnknown,unknownArgs)).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
      await pool.query(`GRANT INSERT ON elp210_c2_financial_candidate.originals TO ${login}`);
      try {
        await expect(restricted.query(readFinancial,readerArgs)).rejects.toThrow("C2_FINANCIAL_READER_UNSAFE_CALLER");
        await expect(restricted.query(readUnknown,unknownArgs)).rejects.toThrow("C2_DELIVERY_PROC_UNSAFE_CALLER");
      } finally {await pool.query(`REVOKE INSERT ON elp210_c2_financial_candidate.originals FROM ${login}`);}
      expect((await restricted.query(readUnknown,unknownArgs)).rows[0].result).toBe("UNKNOWN_NOT_ACKNOWLEDGED");
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",
        [boundLease[0].lease_id])).rows[0].n).toBe(0);
      await expect(transportAuthority.complete(context,{})).rejects.toMatchObject({code:"FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED"});
      await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[boundLease[0].lease_id]);
      });
      await expect(transportAuthority.issue(retainedContext,httpFinancialRequest)).rejects.toThrow();
    } finally {await new Promise<void>(resolve=>financialTransport.server.close(()=>resolve()));httpFinancialAuthority.shutdown();}
    const statusHttp=await assemble();statusHttp.authority.bindRecoverySource(syntheticOriginal,statusCore.input.contract);
    const httpTransport=createCommandSourceAssertionTestCustodyTransport(statusHttp.authority,{
      tls:{...coreIdentity,ca:ca.certificate},peer:{certificate_sha256:`sha256:${createHash("sha256").update(new X509Certificate(edgeIdentity.cert).raw).digest("hex")}`,
        dns_name:"localhost",workload_id:"TEST_ONLY-source"},
      limits:{maximum_in_flight:1,request_bytes:32768,response_bytes:32768,deadline_ms:5000}},
      createC2TestStatusDelivery(restricted,restricted,{workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",
        registration_key:"TEST_ONLY-key",registration_sha256:registrationHash}));
    try {
      await expect(restricted.query("SELECT original_digest FROM execution_command_status_context_links")).rejects.toThrow(/permission denied/i);
      await new Promise<void>((resolve,reject)=>{httpTransport.server.once("error",reject);httpTransport.server.listen(0,"127.0.0.1",()=>resolve());});
      const address=httpTransport.server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_ADDRESS_REQUIRED");
      const post=(path:string,body:unknown)=>new Promise<{status:number;body:string}>((resolve,reject)=>{
        const bytes=JSON.stringify(body),req=httpsRequest({host:"127.0.0.1",port:address.port,
          path,method:"POST",agent:false,...edgeIdentity,ca:ca.certificate,
          minVersion:"TLSv1.3",maxVersion:"TLSv1.3",headers:{"content-type":"application/json",
            "content-length":Buffer.byteLength(bytes),authorization:`Bearer ${preparedStatus.original_context}`}},res=>{
            const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));
            res.on("end",()=>resolve({status:res.statusCode??0,body:Buffer.concat(chunks).toString("utf8")}));res.on("error",reject);
          });req.on("error",reject);req.setTimeout(8000,()=>req.destroy(new Error("TEST_ONLY_HTTP_TIMEOUT")));req.end(bytes);
      });
      const response=await post("/internal/elp210/command-source/assertion",statusCore.issue);
      expect(response.status).toBe(200);expect(JSON.parse(response.body)).toEqual(actualStatus);
      await expect.poll(()=>httpTransport.snapshot().in_flight).toBe(0);
      expect((await pool.query("SELECT state,original_digest FROM elp210_c2_delivery_candidate.obligations WHERE lease_id=$1",[actualStatus.lease_id])).rows)
        .toEqual([{state:"UNKNOWN",original_digest:accessDigest(statusCore.input.original)}]);
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[actualStatus.lease_id])).rows[0].n).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_context_links WHERE context_digest=$1",[accessDigest(preparedStatus.original_context)])).rows[0].n).toBe(1);
      const completion={schema_version:"portal.execution.command-source-assertion-completion-request.v1",
        binding_digest:statusCore.issue.binding_digest,receiver_id:statusCore.issue.receiver_id,workload_id:statusCore.issue.workload_id,
        delivery_sequence:0,lease_id:actualStatus.lease_id,request_digest:actualStatus.request_digest,
        response_digest:accessDigest("TEST_ONLY recipient response")};
      expect((await post("/internal/elp210/command-source/complete",completion)).status).not.toBe(200);
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[actualStatus.lease_id])).rows[0].n).toBe(0);
      // Complete the synthetic source lifecycle through its authenticated
      // reverse listener before an independently authenticated synthetic ACK.
      // The preceding zero-ACK assertion remains essential: HTTP finish alone
      // is never evidence that the recipient or the source committed.
      const actualRequest={method:"POST" as const,raw_path:Buffer.from(statusCore.issue.path),
        query_string:Buffer.alloc(0),body:Buffer.from(statusCore.issue.body_utf8)},attempt=randomUUID();
      await withTestReverse(statusHttp.candidate,statusHttp.terminal,async(reverse)=>{
        const entered=await reverse("/internal/elp210/current-human/enter",{schema_version:"pma.current-human-enter.v1",
          human_token:actualStatus.assertion,source_assertion:await sourceProof("ENTER",actualStatus.lease_id,attempt,actualRequest)});
        expect(entered.status).toBe(200);
        const resolved=await reverse("/internal/elp210/current-human/resolve",{schema_version:"pma.current-human-resolve.v1",
          source_assertion:await sourceProof("COMMITTED",actualStatus.lease_id,attempt,actualRequest)});
        expect(resolved.status).toBe(200);expect(resolved.json).toMatchObject({phase:"COMMITTED",replayed:false});
      });
      const ack=await post("/internal/elp210/command-source/complete",completion);
      expect(ack.status).toBe(200);expect(JSON.parse(ack.body)).toMatchObject({lease_id:actualStatus.lease_id,completed:true});
      const retryAck=await post("/internal/elp210/command-source/complete",completion);
      expect(retryAck.status).toBe(200);expect(JSON.parse(retryAck.body)).toEqual(JSON.parse(ack.body));
      expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[actualStatus.lease_id])).rows[0].n).toBe(1);
    } finally {
      await new Promise<void>(resolve=>httpTransport.server.close(()=>resolve()));statusHttp.authority.shutdown();await restricted.end();
    }
    const seedPreparation=async(fixture:typeof directCore,link:typeof statusLink,requestDigest:string)=>{
      // TEST_ONLY fixture: correlation row joins a real synthetic command and
      // fingerprint; it is not owner acceptance or source authority.
      await pool.query(`INSERT INTO execution_command_status_preparations
        (command_id,context_digest,context_nonce,subject_id,session_id,session_revision,workspace_id,workload_id,receiver_id,
         original_digest,call_digest,binding_digest,authority_fingerprint,pm_request_digest,status_request_digest,
         status_token_digest,status_issued_at_ms,context_expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [fixture.record.id,link.context_digest,link.context_nonce,actor.user_id,actor.session_id,actor.session_generation,workspace,
        "TEST_ONLY-source",link.receiver_id,link.original_digest,link.call_digest,link.binding_digest,link.authority_fingerprint,
        requestDigest,link.status_request_digest,link.status_token_digest,link.status_issued_at_ms,link.context_expires_at_ms]);
    };
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,statusLink)).rejects.toThrow("C2_STATUS_ADAPTER_UNAVAILABLE");
    await expect(statusAdapter.issueCommandStatus(actor,{...statusBinding,workspace_id:"TEST_ONLY-wrong"},statusLink,statusRequest))
      .rejects.toThrow("C2_STATUS_ADAPTER_UNAVAILABLE");
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,statusLink,{...statusRequest,body:Buffer.from("changed")}))
      .rejects.toThrow("C2_STATUS_ADAPTER_UNAVAILABLE");
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,statusLink,statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    await seedPreparation(directCore,statusLink,statusBinding.request_digest);
    // TEST_ONLY corruption: a preparation in this workspace is pointed at a
    // separately inserted immutable original from another workspace, while
    // its digests are otherwise identical. Normal reserve/find rejects this;
    // the issuer must independently reject it too, including after recovery.
    const foreignWorkspace="TEST_ONLY-foreign-status-workspace",foreignCommand=`ecm_${randomUUID().replaceAll("-","")}`;
    await pool.query(`INSERT INTO execution_trusted_commands
      (command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,attempt_id,created_at_ms,updated_at_ms)
      SELECT $1,$2,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,attempt_id,created_at_ms,updated_at_ms
      FROM execution_trusted_commands WHERE command_id=$3`,[foreignCommand,foreignWorkspace,directCore.record.id]);
    await pool.query(`INSERT INTO execution_command_status_original_fingerprints
      (command_id,binding_digest,original_digest,status_bytes_digest,pm_status_request_digest)
      SELECT $1,binding_digest,original_digest,status_bytes_digest,pm_status_request_digest
      FROM execution_command_status_original_fingerprints WHERE command_id=$2`,[foreignCommand,directCore.record.id]);
    await pool.query("UPDATE execution_command_status_preparations SET command_id=$1 WHERE context_digest=$2",
      [foreignCommand,statusLink.context_digest]);
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,statusLink,statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    await pool.query("UPDATE execution_command_status_preparations SET command_id=$1 WHERE context_digest=$2",
      [directCore.record.id,statusLink.context_digest]);
    const status=await statusAdapter.issueCommandStatus(actor,statusBinding,statusLink,statusRequest);
    // The human assertion cannot outlive its durable STATUS context, even
    // when the normal human-token TTL is longer than the remaining context.
    expect(status.expires_at_ms).toBeLessThanOrEqual(statusLink.context_expires_at_ms);
    // Direct INSERT is confined to the disposable test owner; it does not
    // qualify an application writer or authenticate external delivery.
    const reserveStatus=`INSERT INTO elp210_c2_delivery_candidate.obligations
      (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,
       valid_until_ms,state,status_context_digest,status_delivery_sequence)
      SELECT lease_id,workspace_id,subject_id,workload_id,request_digest,$2,$3,128,expires_at_ms,'RESERVED',$4,$5
      FROM elp210_candidate.leases WHERE lease_id=$1`;
    await expect(pool.query(reserveStatus,[status.lease_id,`sha256:${"9".repeat(64)}`,`sha256:${"a".repeat(64)}`,
      statusLink.context_digest,0])).rejects.toThrow("C2_STATUS_DELIVERY_LINK_MISMATCH");
    await pool.query(reserveStatus,[status.lease_id,statusLink.original_digest,`sha256:${"a".repeat(64)}`,statusLink.context_digest,0]);
    await expect(statusAdapter.revalidateIssue(actor,statusBinding,status,statusLink)).resolves.toBeUndefined();
    await expect(statusWriter.revalidateStatus(actor,owner,statusBinding,status,statusLink)).resolves.toBeUndefined();
    await expect(statusWriter.revalidateStatus(actor,owner,statusBinding,status,{...statusLink,receiver_id:"TEST_ONLY-other"}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID"});
    expect((await issuerCustody.inventory()).events.filter(e=>e.lease_id===status.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION")).toHaveLength(1);
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,statusRequest,{request_bytes:4096},status.lease_id,
      custodyBinding,signedFence,issuerCustody)).rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID"});
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,statusRequest,{request_bytes:4096},status.lease_id,
      custodyBinding,signedFence,issuerCustody,{...statusLink,original_digest:`sha256:${"9".repeat(64)}`}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID"});
    const restartedStatus=await CurrentHumanCandidate.create(pool,issuerConfig);
    const restartedWriter=new C2CustodiedIssuerCandidate(restartedStatus,issuerCustody,signedFence);
    expect(()=>new C2CommandStatusAuthorityAdapter(restartedStatus,restartedWriter,
      {owner,workspace:"TEST_ONLY-other",workload:"TEST_ONLY-source"})).toThrow("C2_STATUS_ADAPTER_UNAVAILABLE");
    expect(()=>new C2CommandStatusAuthorityAdapter(restartedStatus,restartedWriter,
      {owner,workspace,workload:"TEST_ONLY-other"})).toThrow("C2_STATUS_ADAPTER_UNAVAILABLE");
    const restartedAdapter=new C2CommandStatusAuthorityAdapter(restartedStatus,restartedWriter,{owner,workspace,workload:"TEST_ONLY-source"});
    await expect(restartedAdapter.resumeCommandStatusIssue(actor,statusBinding,status.lease_id,statusRequest,statusLink)).resolves.toEqual(status);
    await pool.query("UPDATE execution_command_status_preparations SET command_id=$1 WHERE context_digest=$2",
      [foreignCommand,statusLink.context_digest]);
    try {
      await expect(restartedAdapter.resumeCommandStatusIssue(actor,statusBinding,status.lease_id,statusRequest,statusLink))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
      await expect(restartedWriter.revalidateStatus(actor,owner,statusBinding,status,statusLink))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    } finally {
      await pool.query("UPDATE execution_command_status_preparations SET command_id=$1 WHERE context_digest=$2",
        [directCore.record.id,statusLink.context_digest]);
    }
    // Hold a later scope check so revalidation has already read preparation.
    // A separate uncoordinated writer may not change that row until the same
    // revalidation transaction releases its authority and preparation locks.
    const scopeHolder=await pool.connect(),directWriter=await pool.connect();
    try {
      await scopeHolder.query("BEGIN");
      await scopeHolder.query(`SELECT 1 FROM elp210_c2_fence_candidate.scopes
        WHERE workspace_id=$1 AND owner_user_id=$2 AND workload_id=$3 FOR UPDATE`,[workspace,owner,"TEST_ONLY-source"]);
      const ongoing=restartedWriter.revalidateStatus(actor,owner,statusBinding,status,statusLink)
        .then(()=>({ok:true as const}),error=>({ok:false as const,error}));
      let waiting=false;
      for(let i=0;i<60;i++) {
        const activity=await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%elp210_c2_fence_candidate.scopes s JOIN%' LIMIT 1`);
        if(activity.rowCount){waiting=true;break;}
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waiting).toBe(true);
      await directWriter.query("BEGIN");await directWriter.query("SET LOCAL lock_timeout='100ms'");
      await expect(directWriter.query("UPDATE execution_command_status_preparations SET consumed_at=clock_timestamp() WHERE context_digest=$1",
        [statusLink.context_digest])).rejects.toMatchObject({code:"55P03"});
      await directWriter.query("ROLLBACK");await scopeHolder.query("ROLLBACK");
      expect(await ongoing).toEqual({ok:true});
    } finally {
      await directWriter.query("ROLLBACK").catch(()=>undefined);directWriter.release();
      await scopeHolder.query("ROLLBACK").catch(()=>undefined);scopeHolder.release();
    }
    // TEST_ONLY privileged corruption: the normal consume path refuses an
    // unresolved lease. A restarted writer must still fail closed if the
    // preparation is retired or changed by another writer/restore.
    await pool.query("UPDATE execution_command_status_preparations SET consumed_at=clock_timestamp() WHERE context_digest=$1",[statusLink.context_digest]);
    try {
      await expect(restartedAdapter.resumeCommandStatusIssue(actor,statusBinding,status.lease_id,statusRequest,statusLink))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
      await expect(statusWriter.revalidateStatus(actor,owner,statusBinding,status,statusLink))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    } finally {
      await pool.query("UPDATE execution_command_status_preparations SET consumed_at=NULL WHERE context_digest=$1",[statusLink.context_digest]);
    }
    await expect(issuer.issueC2ProtectedOwnerCommandStatus(actor,owner,statusRequest,{request_bytes:4096},
      statusLink,custodyBinding,signedFence,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED"});
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[status.lease_id])).rows[0].n).toBe(0);
    // TEST_ONLY signed source lifecycle and explicit receiver ACK: a terminal
    // alone never authorizes another STATUS delivery. This does not establish
    // a real Edge source or ACK.
    const successorLink={...statusLink,delivery_sequence:1,previous_lease_id:status.lease_id};
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,successorLink,statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    const statusTerminal=statusInner.terminal,statusAttempt=randomUUID();
    // TEST_ONLY loopback TLS: exercise the real reverse transport on the same
    // candidate and independent custody, not a fabricated Edge receipt.
    await withTestReverse(statusInner.candidate,statusTerminal,async(post,snapshot)=>{
      const entered={schema_version:"pma.current-human-enter.v1",human_token:status.token,
        source_assertion:await sourceProof("ENTER",status.lease_id,statusAttempt,statusRequest)};
      // The reverse listener rejects a foreign leaf before HTTP parsing, so
      // the client observes a reset rather than an application 403 response.
      await expect(post("/internal/elp210/current-human/enter",entered,true))
        .rejects.toMatchObject({code:"ECONNRESET"});
      expect(snapshot().denied).toBeGreaterThan(0);
      const accepted=await post("/internal/elp210/current-human/enter",entered);
      expect(accepted.status).toBe(200);expect(accepted.json).toMatchObject({lease_id:status.lease_id,attempt_id:statusAttempt});
      const resolved={schema_version:"pma.current-human-resolve.v1",
        source_assertion:await sourceProof("COMMITTED",status.lease_id,statusAttempt,statusRequest)};
      const first=await post("/internal/elp210/current-human/resolve",resolved);
      expect(first.status).toBe(200);expect(first.json).toMatchObject({phase:"COMMITTED",replayed:false});
      const replay=await post("/internal/elp210/current-human/resolve",resolved);
      expect(replay.status).toBe(200);expect(replay.json).toMatchObject({phase:"COMMITTED",replayed:true});
    });
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,successorLink,statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    const ackDigest=`sha256:${"e".repeat(64)}`;
    await expect(statusAdapter.acknowledgeCommandStatusIssue(actor,statusBinding,status,ackDigest)).resolves.toBe(true);
    await expect(statusAdapter.acknowledgeCommandStatusIssue(actor,statusBinding,status,`sha256:${"f".repeat(64)}`))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_ACK_MISMATCH"});
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,{...successorLink,context_digest:`sha256:${"b".repeat(64)}`},statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED"});
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,{...successorLink,previous_lease_id:randomUUID()},statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_PREVIOUS_REQUIRED"});
    await expect(statusAdapter.issueCommandStatus(actor,statusBinding,{...successorLink,
      context_expires_at_ms:successorLink.context_expires_at_ms+1000},statusRequest))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    // Two Core callers racing the same settled predecessor must not mint two
    // successor leases. Both use the same TEST_ONLY original and P7 intent.
    const raced=await Promise.allSettled([
      statusAdapter.issueCommandStatus(actor,statusBinding,successorLink,statusRequest),
      statusAdapter.issueCommandStatus(actor,statusBinding,successorLink,statusRequest),
    ]);
    const winners=raced.filter(result=>result.status==="fulfilled");
    const losers=raced.filter(result=>result.status==="rejected");
    expect(winners).toHaveLength(1);expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({reason:{code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"}});
    const successor=(winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof statusAdapter.issueCommandStatus>>>).value;
    expect(successor.lease_id).not.toBe(status.lease_id);
    expect(successor.expires_at_ms).toBeLessThanOrEqual(statusLink.context_expires_at_ms);
    await expect(statusAdapter.revalidateIssue(actor,statusBinding,successor,successorLink)).resolves.toBeUndefined();
    // Even an ACK cannot admit the next delivery while the prior HTTP
    // obligation has not recorded its uncertain send outcome.
    await expect(pool.query(reserveStatus,[successor.lease_id,statusLink.original_digest,`sha256:${"b".repeat(64)}`,
      statusLink.context_digest,1])).rejects.toThrow("C2_STATUS_DELIVERY_PREVIOUS_NOT_ACKNOWLEDGED");
    await expect(pool.query(reserveStatus,[successor.lease_id,statusLink.original_digest,`sha256:${"b".repeat(64)}`,
      null,null])).rejects.toThrow("C2_STATUS_DELIVERY_PREVIOUS_NOT_ACKNOWLEDGED");
    await pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id=$1",[status.lease_id]);
    // Removing the synthetic ACK inside a rolled-back disposable transaction
    // must still block successor reservation, even with a terminal/UNKNOWN.
    const withoutAck=await pool.connect();
    try {
      await withoutAck.query("BEGIN");
      await withoutAck.query("ALTER TABLE execution_command_status_delivery_acks DISABLE TRIGGER command_status_delivery_ack_immutable");
      await withoutAck.query("DELETE FROM execution_command_status_delivery_acks WHERE lease_id=$1",[status.lease_id]);
      await expect(withoutAck.query(reserveStatus,[successor.lease_id,statusLink.original_digest,`sha256:${"b".repeat(64)}`,
        statusLink.context_digest,1])).rejects.toThrow("C2_STATUS_DELIVERY_PREVIOUS_NOT_ACKNOWLEDGED");
    } finally {await withoutAck.query("ROLLBACK").catch(()=>{});withoutAck.release();}
    await expect(pool.query(reserveStatus,[successor.lease_id,`sha256:${"8".repeat(64)}`,`sha256:${"b".repeat(64)}`,
      null,1])).rejects.toMatchObject({code:"23514"});
    await expect(pool.query(reserveStatus,[successor.lease_id,statusLink.original_digest,`sha256:${"b".repeat(64)}`,
      null,null])).resolves.toMatchObject({rowCount:1});
    expect((await pool.query(`SELECT status_delivery_sequence,state FROM elp210_c2_delivery_candidate.obligations
      WHERE status_context_digest=$1 ORDER BY status_delivery_sequence`,[statusLink.context_digest])).rows)
      .toEqual([{status_delivery_sequence:0,state:"UNKNOWN"},{status_delivery_sequence:1,state:"RESERVED"}]);
    statusInner.authority.shutdown();
    // Lost custody response: keep the committed original/link, release no
    // assertion, and after restart retain the *same* lease and bytes once.
    const lostRequest={method:"POST" as const,raw_path:Buffer.from(lostCore.issue.path),query_string:Buffer.alloc(0),
      body:Buffer.from(lostCore.issue.body_utf8)};
    const lostLink={...statusLink,context_digest:`sha256:${"a".repeat(64)}`,
      original_digest:accessDigest(lostCore.input.original),call_digest:lostCore.input.call_digest,
      binding_digest:lostCore.issue.binding_digest,receiver_id:lostCore.issue.receiver_id,context_expires_at_ms:Date.now()+30000};
    await seedPreparation(lostCore,lostLink,pmHttpRequestDigest(lostRequest,{request_bytes:4096}));
    const lostLock=await authority.connect();let statusPending:C2CustodyPendingError|undefined;
    try {
      await lostLock.query("BEGIN");
      await lostLock.query("SELECT custody_id FROM portal_restore_original_custody.head WHERE custody_id=$1 FOR UPDATE",[custodyId]);
      try {await statusWriter.issueStatus(actor,owner,lostRequest,{request_bytes:4096},lostLink);}
      catch(error) {expect(error).toBeInstanceOf(C2CustodyPendingError);statusPending=error as C2CustodyPendingError;}
      expect(statusPending).toBeInstanceOf(C2CustodyPendingError);
      expect(Object.keys(statusPending!)).not.toContain("token");
    } finally {await lostLock.query("ROLLBACK").catch(()=>{});lostLock.release();}
    const lostRecovered=await restartedWriter.resumeStatus(actor,owner,lostRequest,{request_bytes:4096},statusPending!.lease_id,lostLink);
    expect(lostRecovered.lease_id).toBe(statusPending!.lease_id);
    expect((await issuerCustody.inventory()).events.filter(e=>e.lease_id===lostRecovered.lease_id&&e.kind==="ISSUED_HUMAN_ASSERTION")).toHaveLength(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[lostRecovered.lease_id])).rows[0].n).toBe(0);
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[lostRecovered.lease_id]);
    await service.revoke(actor,workspace,signed.intent_id);
    await expect(statusWriter.revalidateStatus(actor,owner,statusBinding,successor,successorLink)).rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
    await expect(restartedAdapter.resumeCommandStatusIssue(actor,statusBinding,successor.lease_id,statusRequest,successorLink))
      .rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[successor.lease_id]);
    await expect(signer.confirmOwner(actor,signerPreview.confirmation_sha256,"TEST_ONLY-signer",signerAttestation)).rejects.toThrow();
    const issued=await issuer.issueC2ProtectedOwner(actor,owner,request,{request_bytes:4096},custodyBinding,fence,issuerCustody);
    issuedLease=issued.lease_id;issuedAssertion=issued;
    const enterProof=await sourceProof("ENTER",issuedLease,randomUUID(),request);
    await expect(issuer.enter(issued.token,enterProof)).rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    expect((await pool.query("SELECT phase,c2_p7_binding_digest,c2_p7_owner_intent_id::text FROM elp210_candidate.leases WHERE lease_id=$1",[issuedLease])).rows[0])
      .toEqual({phase:"ISSUED",c2_p7_binding_digest:fence.bindingDigest(),c2_p7_owner_intent_id:firstCycleIntent});
    await expect(pool.query("UPDATE elp210_candidate.leases SET c2_p7_binding_digest=NULL WHERE lease_id=$1",[issuedLease]))
      .rejects.toThrow("C2_CUSTODY_BINDING_IMMUTABLE");
    await expect(pool.query("UPDATE elp210_candidate.leases SET c2_p7_owner_intent_id=NULL WHERE lease_id=$1",[issuedLease]))
      .rejects.toThrow("C2_CUSTODY_BINDING_IMMUTABLE");
    // Simulate an old issuer inserting without the newly-required P7 columns.
    await expect(pool.query(`INSERT INTO elp210_candidate.leases SELECT (jsonb_populate_record(NULL::elp210_candidate.leases,
      to_jsonb(l)||jsonb_build_object('lease_id',gen_random_uuid(),'c2_p7_binding_digest',NULL,
        'c2_p7_owner_intent_id',NULL))).* FROM elp210_candidate.leases l WHERE lease_id=$1`,[issuedLease]))
      .rejects.toThrow("C2_P7_DB_BOUND_INTENT_REQUIRED");
    await expect(pool.query(`INSERT INTO elp210_candidate.leases SELECT (jsonb_populate_record(NULL::elp210_candidate.leases,
      to_jsonb(l)||jsonb_build_object('lease_id',gen_random_uuid(),'c2_p7_owner_intent_id',gen_random_uuid()))).*
      FROM elp210_candidate.leases l WHERE lease_id=$1`,[issuedLease])).rejects.toThrow("C2_P7_DB_INTENT_NOT_CURRENT");
    await expect(pool.query(`INSERT INTO elp210_candidate.leases SELECT (jsonb_populate_record(NULL::elp210_candidate.leases,
      to_jsonb(l)||jsonb_build_object('lease_id',gen_random_uuid(),'phase','ENTERED','attempt_id',gen_random_uuid()))).*
      FROM elp210_candidate.leases l WHERE lease_id=$1`,[issuedLease])).rejects.toThrow("C2_P7_DB_INITIAL_PHASE_REQUIRED");
    const upgrading=await pool.connect();
    try {
      await expect(upgrading.query(await readFile(join(process.cwd(),"src/execution-v2/c2-p7-bound-lease-fence-candidate.sql"),"utf8")))
        .rejects.toThrow("C2_P7_DB_UNCLASSIFIED_LEGACY");
    } finally {await upgrading.query("ROLLBACK").catch(()=>{});upgrading.release();}
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},issuedLease))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_C2_P7_FENCE_REQUIRED"});
    // The legacy synthetic witness above is no longer recoverable from
    // custody without a reservation; this check compares binding of its
    // original test bytes only. The properly reserved witness was recovered
    // through signerStore.recover above.
    const recoveredProof=Buffer.from(firstWitness.proof);
    const restartedFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","1".repeat(64),pin,proof,
      {...firstWitness,proof:recoveredProof});
    recoveredProof.fill(0);
    expect(restartedFence.bindingDigest()).toBe(fence.bindingDigest());
    const differentFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-key","f".repeat(64),pin,proof,firstWitness);
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},issuedLease,custodyBinding,differentFence,issuerCustody))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},issuedLease,custodyBinding,restartedFence,issuerCustody))
      .resolves.toMatchObject({lease_id:issuedLease,token:issued.token});
    // New service object and retained proof model a restart without minting a
    // fresh assertion or accepting a different signer. This is not an actual
    // peer ACK or durable witness-store qualification.
    const restartedIssuer=await CurrentHumanCandidate.create(pool,issuerConfig);
    await expect(restartedIssuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},issuedLease,custodyBinding,restartedFence,issuerCustody))
      .resolves.toMatchObject({lease_id:issuedLease,token:issued.token});
    const custody=issuerCustody;
    const issuerWriter=new C2CustodiedIssuerCandidate(issuer,custody,fence);
    terminal=new C2CustodiedTerminalCandidate(pool,issuer,custody,fence);
    const issued2=await issuerWriter.issue(actor,owner,secondRequest,{request_bytes:4096});
    secondLease=issued2.lease_id;secondAttempt=randomUUID();
    await expect(terminal.enter(issued2.token,await sourceProof("ENTER",secondLease,secondAttempt,secondRequest)))
      .resolves.toEqual({lease_id:secondLease,attempt_id:secondAttempt});
    // Crossing 9 -> 10 must order the BIGINT column numerically, not its
    // returned text alias; both inventory and the next append use this chain.
    const multiDigitJournal=await custody.inventory();
    expect(multiDigitJournal.events.length).toBeGreaterThanOrEqual(10);
    expect(multiDigitJournal.events.map(event=>event.generation))
      .toEqual(multiDigitJournal.events.map((_event,index)=>String(index+1)));
    await expect(pool.query("UPDATE elp210_c2_p7_candidate.records SET owner_intent_id=NULL WHERE cycle_sha256=$1",["1".repeat(64)]))
      .rejects.toThrow();
    const duplicate=`INSERT INTO elp210_c2_p7_candidate.records
      (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,
       delegation_json,delegation_sha256,owner_intent_id,confirmation_sha256)
      SELECT $1,binding_sha256,b1_sha256,gen_random_uuid(),gen_random_uuid(),acceptance_json,acceptance_sha256,
       delegation_json,delegation_sha256,CASE WHEN $2='MISSING' THEN NULL WHEN $2='ORPHAN' THEN gen_random_uuid()
         ELSE owner_intent_id END,confirmation_sha256 FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$3`;
    await expect(pool.query(duplicate,["a".repeat(64),"REUSED","1".repeat(64)])).rejects.toThrow(/unique constraint/i);
    await expect(pool.query(duplicate,["b".repeat(64),"ORPHAN","1".repeat(64)])).rejects.toThrow(/foreign key constraint/i);
    await expect(pool.query(duplicate,["c".repeat(64),"MISSING","1".repeat(64)])).rejects.toThrow(/check constraint/i);
    const otherIntent=await review.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-different-intent");
    expect(otherIntent.state).toBe("REGISTRATION_RECORDED_P7_NOT_CONFIRMED");
    await expect(review.resume(actor,preview.confirmation_sha256,otherIntent.intent_id)).rejects.toThrow("C2_P7_RECORD_BINDING_MISMATCH");
    await expect(review.preview({...actor,user_id:"TEST_ONLY-other"})).rejects.toThrow();
    await expect(review.confirm(actor,"f".repeat(64),"TEST_ONLY-bad")).rejects.toThrow();
  },120000); // Includes a second isolated Node process; no runtime TTL is changed.
  it("executes P7 review through a real restricted login and separately owned lock functions",async()=>{
    // TEST ONLY: auth-table grants below are deliberately broader than a
    // production allowlist; registry INSERT/UPDATE is still an open trust gap.
    // This test proves composition with no direct UPDATE of the immutable
    // intent/record, not safety against a compromised app or a real approval.
    const suffix=new URL(process.env.TEST_DATABASE_URL!).pathname.slice(-8);
    const login=`p7_full_test_${suffix}`,intentOwner=`p7_intent_lock_${suffix}`,
      recordOwner=`p7_record_lock_${suffix}`,registryOwner=`p7_registry_lock_${suffix}`;
    await pool.query(`CREATE ROLE ${login} LOGIN PASSWORD 'TEST_ONLY_P7_FULL' NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${intentOwner} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${recordOwner} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${registryOwner} NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public,elp210_candidate,elp210_c2_p7_candidate TO ${login};
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${login};
      GRANT UPDATE(user_id) ON public.portal_users TO ${login};
      GRANT UPDATE(state) ON public.auth_sessions TO ${login};
      GRANT UPDATE(user_id) ON public.portal_owner_anchor,public.workspace_members TO ${login};
      GRANT UPDATE(owner_user_id) ON public.workspaces TO ${login};
      GRANT UPDATE(revision) ON public.portal_access_policy_state TO ${login};
      GRANT UPDATE(expires_at) ON public.owner_step_up_grants TO ${login};
      GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${login};
      GRANT SELECT,INSERT ON elp210_c2_p7_candidate.owner_intents,elp210_c2_p7_candidate.records TO ${login};
      GRANT SELECT ON elp210_c2_p7_candidate.owner_intent_revocations TO ${login};
      GRANT SELECT,INSERT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO ${login};
      GRANT EXECUTE ON FUNCTION pg_catalog.pg_control_system() TO ${login};
      GRANT USAGE ON SCHEMA elp210_c2_p7_candidate TO ${intentOwner},${recordOwner},${registryOwner};
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO ${intentOwner};
      GRANT SELECT,UPDATE(binding_sha256) ON elp210_c2_p7_candidate.records TO ${recordOwner};
      GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO ${registryOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) OWNER TO ${intentOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) OWNER TO ${intentOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) OWNER TO ${recordOwner};
      ALTER FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(text) OWNER TO ${registryOwner}`);
    const installer=await pool.connect();
    try {
      for(const [role,file] of [[intentOwner,"c2-p7-review-lock-definer-candidate.sql"],
        [recordOwner,"c2-p7-record-lock-definer-candidate.sql"],[registryOwner,"c2-p7-registration-read-lock-definer-candidate.sql"]]) {
        await installer.query("BEGIN");await installer.query(`SET LOCAL ROLE ${role}`);
        await installer.query(await readFile(join(process.cwd(),"src/execution-v2",file!),"utf8"));await installer.query("COMMIT");
      }
    } finally {await installer.query("ROLLBACK").catch(()=>undefined);installer.release();}
    await pool.query(`GRANT EXECUTE ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid),
      elp210_c2_p7_candidate.lock_owner_intent_by_proof(text),elp210_c2_p7_candidate.lock_record_by_cycle(text),
      elp210_c2_p7_candidate.lock_registration_for_read(text) TO ${login}`);
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username=login;url.password="TEST_ONLY_P7_FULL";
    const limited=new Pool({connectionString:url.toString(),max:3,connectionTimeoutMillis:5000,query_timeout:10000});
    try {
      // This is the same service role used for the positive flow below. A
      // successfully composed service must not be mistaken for a qualified
      // least-privilege role when it can write P7 provenance directly.
      await expect(assertC2P7RestrictedRoleCandidate(limited,{database_name:url.pathname.slice(1),
        database_system_identifier:sourceSystem,role_name:login,protected_owner_user_id:owner,
        workspace_id:workspace,principal_workspace_pins:[{user_id:owner,workspace_id:workspace}]}))
        .rejects.toThrow("C2_P7_RUNTIME_ROLE_UNSAFE");
      const intent=new C2P7OwnerIntentCandidate(limited,source,"TEST_ONLY-restricted-full");
      const writer=new C2P7RegistrationWriterCandidate(limited,source,intent,"TEST_ONLY-restricted-full");
      const records=new C2P7RecordCandidate(limited,source,"TEST_ONLY-restricted-full");
      const cycle="9".repeat(64),review=new C2P7ReviewCandidateService(limited,source,intent,writer,records,
        {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:cycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
      const preview=await review.preview(actor);
      expect(preview.state).toBe("REVIEW_ONLY_NOT_AUTHORIZED");
      const result=await review.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-restricted-full");
      expect(result.state).toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
      expect((await review.resumeByKey(actor,preview.confirmation_sha256,"TEST_ONLY-restricted-full")).intent_id).toBe(result.intent_id);
      const fence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-restricted-full",cycle,pin,proof),db=await limited.connect();
      const witnessKeys=generateKeyPairSync("ed25519");
      const verifier=new C2P7OwnerConfirmationVerifier(witnessKeys.publicKey.export({type:"spki",format:"pem"}).toString(),
        createHash("sha256").update(witnessKeys.publicKey.export({type:"spki",format:"der"})).digest("hex"));
      let witnessProof:Buffer,witnessIssued:number,witnessExpires:number;
      try {await db.query("BEGIN");
        expect((await fence.checkLocked(db,actor,workspace,"TEST_ONLY-source")).intent_id).toBe(result.intent_id);
        await expect(fence.checkAuthenticatedLocked(db,actor,workspace,"TEST_ONLY-source"))
          .rejects.toThrow("C2_P7_OWNER_CONFIRMATION_REQUIRED");
        const selected=(await db.query(`SELECT i.*,r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256,
          floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
          FROM elp210_c2_p7_candidate.owner_intents i JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id
          WHERE i.intent_id=$1`,[result.intent_id])).rows[0];
        witnessIssued=Number(selected.now_ms);witnessExpires=witnessIssued+60000;
        const witness:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:cycle,
          confirmation_sha256:selected.confirmation_sha256,intent_id:result.intent_id,registration_key:selected.registration_key,
          registration_sha256:selected.registration_sha256,source_evidence_sha256:selected.source_evidence_sha256,
          b1_sha256:selected.b1_sha256,workspace_id:selected.workspace_id,owner_user_id:selected.owner_user_id,
          session_id:selected.session_id,session_generation:Number(selected.session_generation),authority_revision:Number(selected.authority_revision),
          acceptance_sha256:selected.acceptance_sha256,delegation_sha256:selected.delegation_sha256,
          issued_at_ms:witnessIssued,expires_at_ms:witnessExpires};
        const witnessBytes=Buffer.from(JSON.stringify(witness));
        witnessProof=Buffer.from(JSON.stringify({payload:witnessBytes.toString("base64url"),
          signature:sign(null,witnessBytes,witnessKeys.privateKey).toString("base64url")}));
        const authenticated=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-restricted-full",cycle,pin,proof,
          {verifier,proof:witnessProof,issued_at_ms:witnessIssued,expires_at_ms:witnessExpires});
        expect((await authenticated.checkAuthenticatedLocked(db,actor,workspace,"TEST_ONLY-source")).intent_id).toBe(result.intent_id);
        expect(authenticated.bindingDigest()).not.toBe(fence.bindingDigest());
        await db.query("ROLLBACK");
        await expect(db.query("UPDATE elp210_c2_p7_candidate.records SET binding_sha256=repeat('f',64) WHERE cycle_sha256=$1",[cycle])).rejects.toThrow(/permission denied/i);
        await expect(db.query("UPDATE elp210_c2_p7_candidate.owner_intents SET action='REVOKE' WHERE intent_id=$1",[result.intent_id])).rejects.toThrow(/permission denied/i);
        // Explicitly demonstrate the remaining gap rather than mistaking
        // this restricted-lock test for provenance or anti-forgery proof.
        // The forged row is local to this disposable transaction and rolled
        // back; it must never be treated as a real source registration.
        await db.query("BEGIN");
        expect((await db.query(`INSERT INTO elp210_c2_p7_candidate.registrations
          (registration_key,registration_sha256,workspace_id,owner_user_id,application_revision,authority_revision,state,expires_at_ms)
          VALUES('TEST_ONLY-FORGED',repeat('f',64),$1,$2,'TEST_ONLY',0,'ACTIVE',9999999999999)`,[workspace,owner])).rowCount).toBe(1);
        // Exercise a stronger counterexample, still entirely inside the
        // rollback-only cell: reuse a genuine synthetic source binding but
        // fabricate a NEW review cycle and owner intent through SQL, without
        // calling confirm(). The issuer is NOT enabled by this test.
        const oldIntent=(await db.query("SELECT * FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1",[result.intent_id])).rows[0];
        const oldRecord=(await db.query("SELECT * FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1",[cycle])).rows[0];
        const fakeCycle="8".repeat(64),fakeConfirmation="7".repeat(64),fakeIntent=randomUUID();
        const decision=structuredClone(oldIntent.decision_json);
        decision.review_binding={cycle_sha256:fakeCycle,confirmation_sha256:fakeConfirmation};
        const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
        await db.query(`INSERT INTO elp210_c2_p7_candidate.owner_intents
          (intent_id,proof_sha256,idempotency_sha256,action,workspace_id,owner_user_id,session_id,session_generation,
           registration_key,registration_sha256,source_evidence_sha256,b1_sha256,decision_json,authority_revision,expires_at_ms,created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16)`,
        [fakeIntent,digest(randomUUID()),digest(randomUUID()),oldIntent.action,oldIntent.workspace_id,oldIntent.owner_user_id,
          oldIntent.session_id,oldIntent.session_generation,oldIntent.registration_key,oldIntent.registration_sha256,
          oldIntent.source_evidence_sha256,oldIntent.b1_sha256,JSON.stringify(decision),oldIntent.authority_revision,oldIntent.expires_at_ms,
          oldIntent.created_at]);
        const delegation=JSON.parse(oldRecord.delegation_json),acceptance=JSON.parse(oldRecord.acceptance_json);
        delegation.delegation_id=randomUUID();
        const delegationJson=JSON.stringify(delegation),delegationSha=digest(delegationJson);
        acceptance.acceptance_id=randomUUID();acceptance.delegation_id=delegation.delegation_id;
        acceptance.delegation_record_digest=delegationSha;
        const acceptanceJson=JSON.stringify(acceptance);
        const snapshot=await lockCurrentHumanSnapshot(db,actor,workspace);
        const binding=digest(JSON.stringify([fakeCycle,pin,verifiedBinding.parse(source.verify(proof)),
          snapshot.authority_fingerprint,fakeIntent,fakeConfirmation]));
        await db.query(`INSERT INTO elp210_c2_p7_candidate.records
          (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,
           delegation_json,delegation_sha256,owner_intent_id,confirmation_sha256)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[fakeCycle,binding,pin,acceptance.acceptance_id,
          delegation.delegation_id,acceptanceJson,digest(acceptanceJson),delegationJson,delegationSha,fakeIntent,fakeConfirmation]);
        const forgedFence=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-restricted-full",fakeCycle,pin,proof);
        expect((await forgedFence.checkLocked(db,actor,workspace,"TEST_ONLY-source")).intent_id).toBe(fakeIntent);
        const forgedWithWitness=new C2P7IssuerFenceCandidate(source,"TEST_ONLY-restricted-full",fakeCycle,pin,proof,
          {verifier,proof:witnessProof!,issued_at_ms:witnessIssued!,expires_at_ms:witnessExpires!});
        await expect(forgedWithWitness.checkAuthenticatedLocked(db,actor,workspace,"TEST_ONLY-source"))
          .rejects.toThrow("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
        await db.query("ROLLBACK");
      } finally {await db.query("ROLLBACK").catch(()=>undefined);db.release();}
      expect((await pool.query("SELECT 1 FROM elp210_c2_p7_candidate.registrations WHERE registration_key='TEST_ONLY-FORGED'")).rowCount).toBe(0);
      expect((await pool.query("SELECT 1 FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1",["8".repeat(64)])).rowCount).toBe(0);
    } finally {await limited.end();}
  },120000);
  it("tests the P7 row-lock and revoke boundary with a limited login and separate NOLOGIN definers",async()=>{
    // Dedicated, disposable cluster only. These test grants deliberately do
    // not claim that the legacy lease/event triggers have production-safe ACLs.
    const guard="test_only_p7_guard",legacyGuard="test_only_p7_legacy_guard",event="test_only_p7_event";
    const writer="test_only_p7_writer",password="test_only_p7_password";
    const installer=await readFile(join(process.cwd(),"src/execution-v2/c2-p7-bound-lease-definer-candidate.sql"),"utf8");
    const legacyInstaller=await readFile(join(process.cwd(),"src/execution-v2/c2-p7-legacy-lease-trigger-definer-candidate.sql"),"utf8");
    await expect(pool.query(installer)).rejects.toThrow("C2_P7_DB_DEFINER_UNSAFE");
    await expect(pool.query(legacyInstaller)).rejects.toThrow("C2_P7_LEGACY_DEFINER_UNSAFE");
    await pool.query(`CREATE ROLE ${guard} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${legacyGuard} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${event} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      CREATE ROLE ${writer} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA elp210_candidate,elp210_c2_fence_candidate,elp210_c2_p7_candidate TO ${guard},${legacyGuard},${event},${writer};
      GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${guard};
      GRANT SELECT,UPDATE(state) ON elp210_c2_fence_candidate.scopes TO ${guard};
      GRANT SELECT,UPDATE(action) ON elp210_c2_p7_candidate.owner_intents TO ${guard};
      GRANT SELECT,UPDATE(confirmation_sha256) ON elp210_c2_p7_candidate.records TO ${guard};
      GRANT SELECT,UPDATE(state) ON elp210_c2_p7_candidate.registrations TO ${guard};
      GRANT SELECT ON elp210_c2_p7_candidate.owner_intent_revocations TO ${guard};
      GRANT SELECT,UPDATE(drain_id) ON elp210_candidate.authority TO ${legacyGuard};
      GRANT SELECT ON elp210_c2_fence_candidate.scopes,elp210_c2_p7_candidate.registrations TO ${legacyGuard};
      GRANT SELECT,UPDATE(lease_epoch) ON elp210_candidate.authority TO ${event};
      GRANT SELECT ON elp210_candidate.native_read_obligations TO ${event};
      GRANT INSERT ON elp210_candidate.events TO ${event};
      GRANT USAGE,SELECT ON SEQUENCE elp210_candidate.events_event_id_seq TO ${event};
      GRANT SELECT,INSERT ON elp210_candidate.leases TO ${writer};
      GRANT UPDATE(phase,attempt_id) ON elp210_candidate.leases TO ${writer};
      ALTER FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() OWNER TO ${guard};
      ALTER FUNCTION elp210_c2_fence_candidate.guard_lease() OWNER TO ${legacyGuard};
      ALTER FUNCTION elp210_candidate.lease_event() OWNER TO ${event}`);
    const admin=await pool.connect();
    const url=new URL(process.env.TEST_DATABASE_URL!);url.username=writer;url.password=password;
    const limited=new Pool({connectionString:url.toString(),max:2,connectionTimeoutMillis:5000,query_timeout:10000});
    try {
      // Installation must fail if the runtime can assume the definer, or if
      // the definer acquired destructive table privileges beyond row locking.
      await pool.query(`GRANT ${guard} TO ${writer}`);
      await admin.query("BEGIN");await admin.query(`SET LOCAL ROLE ${guard}`);
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_DB_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query(`REVOKE ${guard} FROM ${writer}; GRANT DELETE ON elp210_c2_p7_candidate.records TO ${guard}`);
      await admin.query("BEGIN");await admin.query(`SET LOCAL ROLE ${guard}`);
      await expect(admin.query(installer)).rejects.toThrow("C2_P7_DB_DEFINER_UNSAFE");await admin.query("ROLLBACK");
      await pool.query(`REVOKE DELETE ON elp210_c2_p7_candidate.records FROM ${guard}`);
      await admin.query("BEGIN");await admin.query(`SET LOCAL ROLE ${guard}`);await admin.query(installer);await admin.query("COMMIT");
      await pool.query(`GRANT UPDATE(drain_id) ON elp210_candidate.authority TO ${event}`);
      await expect(admin.query(legacyInstaller)).rejects.toThrow("C2_P7_LEGACY_DEFINER_UNSAFE");
      await pool.query(`REVOKE UPDATE(drain_id) ON elp210_candidate.authority FROM ${event}`);
      await pool.query(`GRANT ${legacyGuard} TO ${writer}`);
      await expect(admin.query(legacyInstaller)).rejects.toThrow("C2_P7_LEGACY_DEFINER_UNSAFE");
      await pool.query(`REVOKE ${legacyGuard} FROM ${writer}`);
      await admin.query("BEGIN");await admin.query(legacyInstaller);await admin.query("COMMIT");
      const client=await limited.connect();
      try {
        await expect(client.query(`SET ROLE ${guard}`)).rejects.toThrow(/permission denied/i);
        await expect(client.query(`SET ROLE ${legacyGuard}`)).rejects.toThrow(/permission denied/i);
        await expect(client.query(`SET ROLE ${event}`)).rejects.toThrow(/permission denied/i);
        await expect(client.query("UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton"))
          .rejects.toThrow(/permission denied/i);
        await expect(client.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton"))
          .rejects.toThrow(/permission denied/i);
        await expect(client.query("INSERT INTO elp210_candidate.events(lease_id,phase) VALUES('fake','ISSUED')"))
          .rejects.toThrow(/permission denied/i);
        await expect(client.query("UPDATE elp210_c2_p7_candidate.registrations SET state='REVOKED'"))
          .rejects.toThrow(/permission denied/i);
        await expect(client.query("UPDATE elp210_c2_p7_candidate.records SET confirmation_sha256=repeat('f',64)"))
          .rejects.toThrow(/permission denied/i);
        await expect(client.query("ALTER TABLE elp210_candidate.leases DISABLE TRIGGER c2_guard_p7_bound_lease"))
          .rejects.toThrow(/must be owner/i);
        const clone=`INSERT INTO elp210_candidate.leases SELECT (jsonb_populate_record(NULL::elp210_candidate.leases,
          to_jsonb(l)||jsonb_build_object('lease_id',$2::text,'c2_p7_owner_intent_id',$3::text))).*
          FROM elp210_candidate.leases l WHERE lease_id=$1`;
        await client.query("BEGIN");
        await expect(client.query(clone,[issuedLease,randomUUID(),null])).rejects.toThrow("C2_P7_DB_BOUND_INTENT_REQUIRED");
        await client.query("ROLLBACK");
        // A direct DB writer can clone a row, but cannot turn the original
        // signed assertion into authority for its different lease ID.
        const forgedLease=randomUUID();
        await client.query("BEGIN");await client.query(clone,[issuedLease,forgedLease,firstCycleIntent]);await client.query("COMMIT");
        const fence=firstFence;
        await expect(issuer.revalidateC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},
          {...issuedAssertion,lease_id:forgedLease},issuerCustody.bindingDigest(),fence)).rejects.toMatchObject({code:"CURRENT_HUMAN_ASSERTION_CHANGED"});
        await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},forgedLease,issuerCustody.bindingDigest(),fence,issuerCustody))
          .rejects.toMatchObject({code:"CURRENT_HUMAN_ASSERTION_CHANGED"});
        await client.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[forgedLease]);
        const lease=randomUUID();await client.query("BEGIN");
        await client.query(clone,[issuedLease,lease,firstCycleIntent]);
        await client.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",[lease,randomUUID()]);
        await client.query("ROLLBACK");

        // Give this race an independent synthetic preparation: revoking it
        // must not alter the first original used by the later settlement test.
        const records=new C2P7RecordCandidate(pool,source,"TEST_ONLY-key");
        const writerService=new C2P7RegistrationWriterCandidate(pool,source,service,"TEST_ONLY-key");
        const review=new C2P7ReviewCandidateService(pool,source,service,writerService,records,{enabled:true,environment:"RESEARCH",
          workspace_id:workspace,cycle_sha256:"e".repeat(64),b1_sha256:pin,b1_bytes:b1,source_proof:proof});
        const preview=await review.preview(actor);
        const raced=await review.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-limited-revoke-race");
        expect(raced.state).toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
        const racedLease=randomUUID(),unreservedLease=randomUUID();
        await client.query("BEGIN");await client.query(clone,[issuedLease,racedLease,raced.intent_id]);
        await client.query(clone,[issuedLease,unreservedLease,raced.intent_id]);await client.query("COMMIT");
        const reserve=`INSERT INTO elp210_c2_delivery_candidate.obligations
          (lease_id,workspace_id,owner_user_id,workload_id,request_digest,original_digest,payload_digest,payload_bytes,valid_until_ms,state)
          SELECT lease_id,workspace_id,subject_id,workload_id,request_digest,$2,$3,128,expires_at_ms,'RESERVED'
          FROM elp210_candidate.leases WHERE lease_id=$1`;
        await pool.query(reserve,[racedLease,`sha256:${"e".repeat(64)}`,`sha256:${"f".repeat(64)}`]);
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        await client.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[racedLease]);
        const held=await limited.connect();let revoke:Promise<unknown>|undefined;
        try {
          await held.query("BEGIN");
          await held.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
            [racedLease,randomUUID()]);
          revoke=service.revoke(actor,workspace,raced.intent_id);
          let observed=false;
          for(let i=0;i<80;i++){
            const waiting=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
              AND wait_event_type='Lock' AND query LIKE '%elp210_candidate.authority%FOR UPDATE%'`);
            if(waiting.rows[0].n>0){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
          }
          expect(observed).toBe(true);
          // Roll back the competing ENTER; revoke can then commit. The old
          // REPEATABLE READ transaction must not use its pre-revoke snapshot.
          await held.query("ROLLBACK");await revoke;
        } finally {await held.query("ROLLBACK").catch(()=>{});held.release();await revoke?.catch(()=>{});}
        await expect(client.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
          [racedLease,randomUUID()])).rejects.toMatchObject({code:"40001"});
        await client.query("ROLLBACK");
        await expect(client.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
          [racedLease,randomUUID()])).rejects.toThrow("C2_P7_DB_INTENT_NOT_CURRENT");
        // Revoking just the P7 intent leaves the registration/scope OPEN;
        // neither a fresh reservation nor starting a reserved send is safe.
        await expect(pool.query(reserve,[unreservedLease,`sha256:${"d".repeat(64)}`,`sha256:${"f".repeat(64)}`]))
          .rejects.toThrow("C2_P7_DELIVERY_INTENT_NOT_CURRENT");
        await expect(pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='SENDING' WHERE lease_id=$1",[racedLease]))
          .rejects.toThrow("C2_P7_DELIVERY_INTENT_NOT_CURRENT");
        // An uncertain exact original must remain recordable after revoke;
        // this is NOT an ACK or proof that its response was delivered.
        await expect(pool.query("UPDATE elp210_c2_delivery_candidate.obligations SET state='UNKNOWN' WHERE lease_id=$1",[racedLease]))
          .resolves.toMatchObject({rowCount:1});
        // Preserve audit, but do not leave a synthetic unresolved lease.
        await client.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[racedLease]);
        await client.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1",[unreservedLease]);
      } finally {await client.query("ROLLBACK").catch(()=>{});client.release();}
    } finally {
      await admin.query("ROLLBACK").catch(()=>{});admin.release();await limited.end();
      await pool.query(`ALTER FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() SECURITY INVOKER;
        ALTER FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() RESET ALL;
        ALTER FUNCTION elp210_c2_fence_candidate.guard_p7_bound_lease() OWNER TO CURRENT_USER;
        ALTER FUNCTION elp210_c2_fence_candidate.guard_lease() SECURITY INVOKER;
        ALTER FUNCTION elp210_c2_fence_candidate.guard_lease() RESET ALL;
        ALTER FUNCTION elp210_c2_fence_candidate.guard_lease() OWNER TO CURRENT_USER;
        ALTER FUNCTION elp210_candidate.lease_event() SECURITY INVOKER;
        ALTER FUNCTION elp210_candidate.lease_event() RESET ALL;
        ALTER FUNCTION elp210_candidate.lease_event() OWNER TO CURRENT_USER;
        DROP OWNED BY ${writer}; DROP OWNED BY ${guard}; DROP OWNED BY ${legacyGuard}; DROP OWNED BY ${event};
        DROP ROLE ${writer}; DROP ROLE ${guard}; DROP ROLE ${legacyGuard}; DROP ROLE ${event}`);
    }
  });
  it("recovers the same registered intent after a lost P7 write, without minting another intent",async()=>{
    const writer=new C2P7RegistrationWriterCandidate(pool,source,service,"TEST_ONLY-key");
    const records=new C2P7RecordCandidate(pool,source,"TEST_ONLY-key");
    const pins={enabled:true,environment:"RESEARCH" as const,workspace_id:workspace,cycle_sha256:"2".repeat(64),
      b1_sha256:pin,b1_bytes:b1,source_proof:proof};
    const interrupted={recordFromIntent:async()=>{throw new Error("TEST_ONLY interrupted");}};
    const first=new C2P7ReviewCandidateService(pool,source,service,writer,interrupted as never,pins);
    const preview=await first.preview(actor);
    const partial=await first.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-recover");
    expect(partial.state).toBe("REGISTRATION_RECORDED_P7_NOT_CONFIRMED");
    const intentId=partial.intent_id;
    const before=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    const restarted=new C2P7ReviewCandidateService(pool,source,service,writer,records,pins);
    await expect(restarted.resume(actor,preview.confirmation_sha256,firstCycleIntent)).rejects.toThrow("C2_P7_INTENT_MISMATCH");
    const recovered=await restarted.resumeByKey(actor,preview.confirmation_sha256,"TEST_ONLY-recover");
    expect(recovered).toMatchObject({state:"P7_PREPARATION_RECORDED_NOT_AUTHORIZED",intent_id:intentId});
    expect((await pool.query("SELECT owner_intent_id::text AS intent FROM elp210_c2_p7_candidate.records WHERE cycle_sha256=$1",
      ["2".repeat(64)])).rows).toEqual([{intent:intentId}]);
    expect(await restarted.resume(actor,preview.confirmation_sha256,intentId)).toEqual(recovered);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(before);
    await expect(restarted.resume({...actor,session_id:"other"},preview.confirmation_sha256,intentId)).rejects.toThrow();
    await expect(restarted.resume(actor,preview.confirmation_sha256,"00000000-0000-4000-8000-000000000000")).rejects.toThrow();
    await expect(restarted.resumeByKey(actor,preview.confirmation_sha256,"TEST_ONLY-wrong-key")).rejects.toThrow();
    await service.revoke(actor,workspace,intentId);
    await expect(restarted.resumeByKey(actor,preview.confirmation_sha256,"TEST_ONLY-recover")).rejects.toThrow("C2_P7_INTENT_MISMATCH");
    await expect(restarted.confirm(actor,preview.confirmation_sha256,"TEST_ONLY-recover")).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(before);

    // A failed registration rolls back its intent in the SAME transaction;
    // retrying the original key after a transient failure creates one intent.
    const missingKey="TEST_ONLY-missing-registration",missingIntent=new C2P7OwnerIntentCandidate(pool,source,missingKey);
    const missingRecords=new C2P7RecordCandidate(pool,source,missingKey),missingPins={...pins,cycle_sha256:"3".repeat(64)};
    const missingWriter=new C2P7RegistrationWriterCandidate(pool,source,missingIntent,missingKey);
    const missing=new C2P7ReviewCandidateService(pool,source,missingIntent,missingWriter,missingRecords,missingPins);
    const missingPreview=await missing.preview(actor);
    const intentCount=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    await pool.query(`CREATE FUNCTION elp210_c2_p7_candidate.test_fail_registration() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.registration_key='TEST_ONLY-missing-registration' THEN RAISE EXCEPTION 'TEST_ONLY failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_registration BEFORE INSERT ON elp210_c2_p7_candidate.registrations
      FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_candidate.test_fail_registration()`);
    try {
      await expect(missing.confirm(actor,missingPreview.confirmation_sha256,"TEST_ONLY-missing")).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(intentCount);
      expect((await pool.query("SELECT 1 FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[missingKey])).rowCount).toBe(0);
      await expect(missing.resumeByKey(actor,missingPreview.confirmation_sha256,"TEST_ONLY-missing")).rejects.toThrow();
    } finally {
      await pool.query("DROP TRIGGER test_fail_registration ON elp210_c2_p7_candidate.registrations");
      await pool.query("DROP FUNCTION elp210_c2_p7_candidate.test_fail_registration()");
    }
    expect((await missing.confirm(actor,missingPreview.confirmation_sha256,"TEST_ONLY-missing")).state)
      .toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(intentCount+1);

    // The server commits both rows, but its COMMIT response is lost. Confirm
    // must locate and revalidate the original by the same key.
    let loseCommit=false;
    const proxyPool={options:pool.options,query:pool.query.bind(pool),connect:async()=>{
      const client=await pool.connect();
      return {query:async(sql:string,params?:unknown[])=>{
        const result=await client.query(sql,params);
        if(loseCommit&&sql==="COMMIT"){loseCommit=false;throw new Error("TEST_ONLY lost commit response");}
        return result;
      },release:(discard?:boolean)=>client.release(discard)};
    }} as unknown as Pool;
    const ambiguousKey="TEST_ONLY-ambiguous-registration";
    const ambiguousIntent=new C2P7OwnerIntentCandidate(proxyPool,source,ambiguousKey);
    const ambiguousWriter=new C2P7RegistrationWriterCandidate(proxyPool,source,ambiguousIntent,ambiguousKey);
    const ambiguousRecords=new C2P7RecordCandidate(proxyPool,source,ambiguousKey);
    const ambiguous=new C2P7ReviewCandidateService(proxyPool,source,ambiguousIntent,ambiguousWriter,ambiguousRecords,
      {...pins,cycle_sha256:"4".repeat(64)});
    const ambiguousPreview=await ambiguous.preview(actor);
    const beforeAmbiguous=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    loseCommit=true;
    const original=await ambiguous.confirm(actor,ambiguousPreview.confirmation_sha256,"TEST_ONLY-ambiguous");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeAmbiguous+1);
    expect((await pool.query("SELECT 1 FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[ambiguousKey])).rowCount).toBe(1);
    expect(original.state).toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
    expect(await ambiguous.resumeByKey(actor,ambiguousPreview.confirmation_sha256,"TEST_ONLY-ambiguous")).toEqual(original);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeAmbiguous+1);

    // Two simultaneous confirmations with the same key must converge on the
    // same original, not produce a second registered intent or record.
    const concurrentKey="TEST_ONLY-concurrent-registration";
    const concurrentIntent=new C2P7OwnerIntentCandidate(pool,source,concurrentKey);
    const concurrentWriter=new C2P7RegistrationWriterCandidate(pool,source,concurrentIntent,concurrentKey);
    const concurrentRecords=new C2P7RecordCandidate(pool,source,concurrentKey);
    const concurrent=new C2P7ReviewCandidateService(pool,source,concurrentIntent,concurrentWriter,concurrentRecords,
      {...pins,cycle_sha256:"5".repeat(64)});
    const concurrentPreview=await concurrent.preview(actor);
    const beforeConcurrent=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
    const outcomes=await Promise.all([
      concurrent.confirm(actor,concurrentPreview.confirmation_sha256,"TEST_ONLY-concurrent"),
      concurrent.confirm(actor,concurrentPreview.confirmation_sha256,"TEST_ONLY-concurrent"),
    ]);
    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0].state).toBe("P7_PREPARATION_RECORDED_NOT_AUTHORIZED");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeConcurrent+1);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.registrations WHERE registration_key=$1",[concurrentKey])).rows[0].n).toBe(1);
  });
  it("fences the same preparation against owner-intent revocation",async()=>{
    const fence=firstFence;
    const held=await pool.connect(),stale=await pool.connect();let revoke:Promise<unknown>|undefined;
    try {
      await stale.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await stale.query("SELECT revision,lease_epoch FROM elp210_candidate.authority WHERE singleton");
      await held.query("BEGIN");
      await expect(fence.checkLocked(held,actor,workspace,"TEST_ONLY-source")).resolves
        .toMatchObject({state:"P7_PREPARATION_CURRENT_NOT_AUTHORIZED"});
      revoke=service.revoke(actor,workspace,firstCycleIntent);
      let observed=false;
      for(let i=0;i<40;i++){
        const count=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%elp210_candidate.authority%FOR UPDATE%'`);
        if(count.rows[0].n>0){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);
      await held.query("COMMIT");await revoke;
      // A transaction whose snapshot predates revoke cannot enter under the
      // old snapshot, even if it attempts the update after revoke commits.
      await expect(stale.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
        [issuedLease,randomUUID()])).rejects.toMatchObject({code:"40001"});
    } finally {await stale.query("ROLLBACK").catch(()=>{});stale.release();
      await held.query("ROLLBACK").catch(()=>{});held.release();await revoke?.catch(()=>{});}
    // A stale writer trying the phase transition directly is rejected by the
    // database even if it does not run the application P7 revalidation.
    await expect(pool.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1",
      [issuedLease,randomUUID()])).rejects.toThrow("C2_P7_DB_INTENT_NOT_CURRENT");
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[issuedLease])).rows[0].phase).toBe("ISSUED");
    const after=await pool.connect();
    try {await after.query("BEGIN");
      await expect(fence.checkLocked(after,actor,workspace,"TEST_ONLY-source")).rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
    } finally {await after.query("ROLLBACK").catch(()=>{});after.release();}
    await expect(issuer.resumeC2ProtectedOwnerIssue(actor,owner,request,{request_bytes:4096},issuedLease,issuerCustody.bindingDigest(),fence,issuerCustody))
      .rejects.toThrow("C2_P7_ISSUER_FENCE_DENIED");
    // Once entered, revocation blocks new ENTER but cannot discard an
    // authenticated terminal for this exact original.
    await withTestReverse(issuer,terminal,async post=>{
      // Verify the new ENTER is rejected while this test assertion still has
      // time left; expiry alone must not satisfy the revoke test.
      expect(issuedAssertion.expires_at_ms).toBeGreaterThan(Date.now()+1000);
      const denied=await post("/internal/elp210/current-human/enter",{
        schema_version:"pma.current-human-enter.v1",human_token:issuedAssertion.token,
        source_assertion:await sourceProof("ENTER",issuedLease,randomUUID(),request)});
      expect([409,503]).toContain(denied.status);
      expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[issuedLease])).rows[0].phase).toBe("ISSUED");
      const result=await post("/internal/elp210/current-human/resolve",{
        schema_version:"pma.current-human-resolve.v1",
        source_assertion:await sourceProof("COMMITTED",secondLease,secondAttempt,secondRequest)});
      expect(result.status).toBe(200);expect(result.json).toMatchObject({phase:"COMMITTED"});
    });
    // Isolate the following HTTP test without opening a drain: the earlier
    // test deliberately retained an UNKNOWN delivery, so a drain must NOT
    // claim READY. Retire only this never-entered TEST_ONLY lease; preserve
    // the UNKNOWN custody row and assert its drain fence in the final test.
    await pool.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1 AND phase='ISSUED'",[issuedLease]);
  });
  it("pins signed synthetic source, refuses replay/tampering and preserves append-only records",async()=>{
    const first=await service.approve(actor,workspace,"REGISTER",b1,pin,proof,"one");
    const db=await pool.connect();try{await db.query("BEGIN");
      expect(await service.verifyLocked(db,first.proof)).toMatchObject({owner_user_id:owner,action:"REGISTER"});await db.query("COMMIT");
    }finally{await db.query("ROLLBACK").catch(()=>{});db.release();}
    await expect(service.approve(actor,workspace,"REGISTER",b1,pin,proof,"one")).rejects.toThrow("REPLAY_NO_SECRET");
    const bad=Buffer.from(proof);bad[bad.length-3]^=1;
    await expect(service.approve(actor,workspace,"REGISTER",b1,pin,bad,"bad")).rejects.toThrow();
    await expect(pool.query("DELETE FROM elp210_c2_p7_candidate.owner_intents WHERE intent_id=$1",[first.intent_id])).rejects.toThrow();
    await expect(pool.query("TRUNCATE elp210_c2_p7_candidate.owner_intents CASCADE")).rejects.toThrow();
    await service.revoke(actor,workspace,first.intent_id);
    const after=await pool.connect();try{await after.query("BEGIN");await expect(service.verifyLocked(after,first.proof)).rejects.toThrow();}
    finally{await after.query("ROLLBACK").catch(()=>{});after.release();}
  });
  it("serializes revoke against verifier's held intent lock",async()=>{
    const record=await service.approve(actor,workspace,"REGISTER",b1,pin,proof,"race");
    const db=await pool.connect();let revoke:Promise<unknown>|undefined;
    try{
      await db.query("BEGIN");await service.verifyLocked(db,record.proof);
      revoke=service.revoke(actor,workspace,record.intent_id);
      let observed=false;
      for(let i=0;i<40;i++){
        const count=await pool.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
          AND wait_event_type='Lock' AND query LIKE '%SELECT owner_user_id,workspace_id%'`);
        if(count.rows[0].n>0){observed=true;break;}await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(observed).toBe(true);await db.query("COMMIT");await revoke;
    }finally{await db.query("ROLLBACK").catch(()=>{});db.release();await revoke?.catch(()=>{});}
    const verify=await pool.connect();try{await verify.query("BEGIN");await expect(service.verifyLocked(verify,record.proof)).rejects.toThrow();}
    finally{await verify.query("ROLLBACK").catch(()=>{});verify.release();}
  });
  it("enforces real HTTP session and CSRF against the same isolated PostgreSQL preparation",async()=>{
    const key="TEST_ONLY-http-registration",intent=new C2P7OwnerIntentCandidate(pool,source,key);
    const writer=new C2P7RegistrationWriterCandidate(pool,source,intent,key);
    const records=new C2P7RecordCandidate(pool,source,key);
    const review=new C2P7ReviewCandidateService(pool,source,intent,writer,records,{enabled:true,environment:"RESEARCH",
      workspace_id:workspace,cycle_sha256:"6".repeat(64),b1_sha256:pin,b1_bytes:b1,source_proof:proof});
    // A second, unmounted candidate tests the signer through the actual HTTP
    // guards. The keys, session and both databases remain synthetic.
    const signedKey="TEST_ONLY-http-signed-registration",signedIntent=new C2P7OwnerIntentCandidate(pool,source,signedKey);
    const signedWriter=new C2P7RegistrationWriterCandidate(pool,source,signedIntent,signedKey);
    const signedRecords=new C2P7RecordCandidate(pool,source,signedKey),signedCycle="d".repeat(64);
    const signedReview=new C2P7ReviewCandidateService(pool,source,signedIntent,signedWriter,signedRecords,
      {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:signedCycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
    const keys=generateKeyPairSync("ed25519"),keyPin=createHash("sha256")
      .update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    const verifier=new C2P7OwnerConfirmationVerifier(keys.publicKey.export({type:"spki",format:"pem"}).toString(),keyPin);
    const signedStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,{custody_id:randomUUID(),
      source_system_identifier:sourceSystem,authority_system_identifier:authoritySystem,signer_spki_sha256:keyPin,
      vault_key_id:"TEST_ONLY-http-key",maximum_witnesses:1},randomBytes(32),verifier);
    const signer=new C2P7OwnerConfirmSignerCandidate(pool,signedReview,signedStore,source,proof,
      {workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:signedKey,
        cycle_sha256:signedCycle,b1_sha256:pin,signer_spki_sha256:keyPin},keys.privateKey,ownerAuth);
    const config={...loadConfig({PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"}),
      PORTAL_PUBLIC_ORIGIN:"https://portal.test"};
    const auth=new AuthService(pool,config,{} as never);
    const app=await NestFactory.create<NestFastifyApplication>({module:TestOnlyP7PgHttpModule,
      controllers:[C2P7ReviewCandidateController,C2P7OwnerConfirmSignerCandidateController],providers:[C2P7CandidateNoStoreGuard,SessionGuard,
        {provide:AuthService,useValue:auth},{provide:WorkspacesRepository,useValue:new WorkspacesRepository(pool)},
        {provide:C2P7ReviewCandidateService,useValue:review},{provide:C2P7OwnerConfirmSignerCandidate,useValue:signer}]},
      new FastifyAdapter(),{logger:false,abortOnError:false});
    try {
      await app.register(fastifyCookie as never);app.useGlobalFilters(new HttpErrorFilter());await app.init();
      const http=app.getHttpAdapter().getInstance() as FastifyInstance;await http.ready();
      const path="/api/admin/c2-p7-candidate",cookie=`${SESSION_COOKIE}=${httpToken}; ${CSRF_COOKIE}=${httpCsrf}`;
      const headers={cookie,origin:"https://portal.test","x-portal-csrf":httpCsrf,"x-portal-idempotency-key":"TEST_ONLY-http-key"};
      const absent=await http.inject({method:"GET",url:`${path}/preview`});
      expect(absent.statusCode).toBe(401);expect(absent.headers["cache-control"]).toBe("private, no-store");
      const preview=await http.inject({method:"GET",url:`${path}/preview`,headers:{cookie}});
      expect(preview.statusCode).toBe(200);expect(preview.json().state).toBe("REVIEW_ONLY_NOT_AUTHORIZED");
      const payload={confirmation_sha256:preview.json().confirmation_sha256};
      const badCsrf=await http.inject({method:"POST",url:`${path}/confirm`,headers:{...headers,"x-portal-csrf":"WRONG"},payload});
      expect(badCsrf.statusCode).toBe(403);
      const widened=await http.inject({method:"POST",url:`${path}/confirm`,headers,payload:{...payload,workspace_id:"other"}});
      expect(widened.statusCode).toBe(400);
      const beforeUnsigned=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
      const confirmed=await http.inject({method:"POST",url:`${path}/confirm`,headers,payload});
      expect(confirmed.statusCode).toBe(503);expect(confirmed.json().error.code).toBe("C2_P7_OWNER_ATTESTATION_REQUIRED");
      expect(confirmed.headers["cache-control"]).toBe("private, no-store");
      expect(confirmed.body).not.toContain(httpToken);expect(confirmed.body).not.toContain("proof");
      const unsignedResume=await http.inject({method:"POST",url:`${path}/resume-by-key`,headers,payload});
      expect(unsignedResume.statusCode).toBe(503);
      const unsignedById=await http.inject({method:"POST",url:`${path}/resume`,headers,
        payload:{...payload,intent_id:randomUUID()}});
      expect(unsignedById.statusCode).toBe(503);
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeUnsigned);
      const signedPreview=await signedReview.preview({user_id:owner,session_id:httpSession,session_generation:7});
      const signedPayload={confirmation_sha256:signedPreview.confirmation_sha256,
        owner_attestation:attest({user_id:owner,session_id:httpSession,session_generation:7},signedCycle,
          signedPreview.confirmation_sha256,"TEST_ONLY-http-signer-key").toString("base64url")};
      const signedHeaders={...headers,"x-portal-idempotency-key":"TEST_ONLY-http-signer-key"};
      const signedAbsent=await http.inject({method:"POST",url:`${path}/confirm-signed`,payload:signedPayload});
      expect(signedAbsent.statusCode).toBe(401);
      expect((await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:{...signedHeaders,"x-portal-csrf":"WRONG"},payload:signedPayload})).statusCode).toBe(403);
      expect((await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:{...signedHeaders,origin:"https://other.test"},payload:signedPayload})).statusCode).toBe(403);
      expect((await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:signedHeaders,
        payload:{...signedPayload,owner_user_id:"TEST_ONLY-other"}})).statusCode).toBe(400);
      expect((await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:signedHeaders,
        payload:{...signedPayload,owner_attestation:Buffer.from("forged").toString("base64url")}})).statusCode).toBe(503);
      const signedResponse=await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:signedHeaders,payload:signedPayload});
      expect(signedResponse.statusCode).toBe(200);
      expect(signedResponse.json().state).toBe("WITNESS_RETAINED_NOT_AUTHORIZED");
      expect(signedResponse.headers["cache-control"]).toBe("private, no-store");
      expect(signedResponse.body).not.toContain(httpToken);expect(signedResponse.body).not.toContain(httpCsrf);
      expect(signedResponse.body).not.toContain("signature");expect(signedResponse.body).not.toContain("payload");
      const retry=await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:signedHeaders,payload:signedPayload});
      expect(retry.statusCode).toBe(200);expect(retry.json()).toEqual(signedResponse.json());
      // TEST_ONLY: delay the FIRST witness for a distinct reviewed cycle, then
      // commit the synthetic session revoke while independent custody writes.
      // The earlier signed HTTP flow remains a separate positive regression.
      const firstCycle="f".repeat(64),httpActor={user_id:owner,session_id:httpSession,session_generation:7};
      const firstReview=new C2P7ReviewCandidateService(pool,source,signedIntent,signedWriter,signedRecords,
        {enabled:true,environment:"RESEARCH",workspace_id:workspace,cycle_sha256:firstCycle,b1_sha256:pin,b1_bytes:b1,source_proof:proof});
      const firstStore=new C2P7OwnerWitnessCustodyCandidate(pool,authority,{custody_id:randomUUID(),
        source_system_identifier:sourceSystem,authority_system_identifier:authoritySystem,signer_spki_sha256:keyPin,
        vault_key_id:"TEST_ONLY-http-first",maximum_witnesses:1},randomBytes(32),verifier);
      const firstSigner=new C2P7OwnerConfirmSignerCandidate(pool,firstReview,firstStore,source,proof,
        {workspace_id:workspace,owner_user_id:owner,workload_id:"TEST_ONLY-source",registration_key:signedKey,
          cycle_sha256:firstCycle,b1_sha256:pin,signer_spki_sha256:keyPin},keys.privateKey,ownerAuth);
      const firstPreview=await firstReview.preview(httpActor),firstKey="TEST_ONLY-first-witness";
      const firstAttestation=attest(httpActor,firstCycle,firstPreview.confirmation_sha256,firstKey);
      await authority.query(`CREATE FUNCTION elp210_c2_p7_witness_candidate.test_only_http_slow_insert()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2.7); RETURN NEW; END $$`);
      await authority.query(`CREATE TRIGGER test_only_http_slow_insert BEFORE INSERT ON elp210_c2_p7_witness_candidate.witnesses
        FOR EACH ROW EXECUTE FUNCTION elp210_c2_p7_witness_candidate.test_only_http_slow_insert()`);
      let firstAttempt:Promise<unknown>|undefined;
      try {
        const beforeRevoke=(await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n;
        firstAttempt=firstSigner.confirmOwner(httpActor,firstPreview.confirmation_sha256,firstKey,firstAttestation)
          .then(()=>null,error=>error);
        let observed=false;
        for(let i=0;i<100;i++) {
          const waiting=await authority.query(`SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname=current_database() AND wait_event='PgSleep' AND query LIKE '%INSERT INTO elp210_c2_p7_witness_candidate.witnesses%'`);
          if(waiting.rows[0].n>0){observed=true;break;}
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        expect(observed).toBe(true);
        const committed=await pool.query("UPDATE auth_sessions SET state='REVOKED',revoked_at=clock_timestamp(),revoke_reason='TEST_ONLY' WHERE session_id=$1 RETURNING session_id",[httpSession]);
        expect(committed.rowCount).toBe(1);
        expect(await firstAttempt).toBeInstanceOf(Error);
        expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1",[httpSession])).rows[0].state).toBe("REVOKED");
        expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeRevoke+1);
        const row=(await pool.query(`SELECT i.intent_id::text,i.registration_key,i.registration_sha256,i.source_evidence_sha256,
          i.b1_sha256,i.workspace_id,i.owner_user_id,i.session_id,i.session_generation::text,i.authority_revision::text,
          i.expires_at_ms::text,floor(extract(epoch FROM i.created_at)*1000)::bigint::text AS created_at_ms,
          r.confirmation_sha256,r.acceptance_sha256,r.delegation_sha256 FROM elp210_c2_p7_candidate.owner_intents i
          JOIN elp210_c2_p7_candidate.records r ON r.owner_intent_id=i.intent_id WHERE r.cycle_sha256=$1`,[firstCycle])).rows[0];
        expect(row).toBeDefined();expect(await firstStore.retainedIntent(firstCycle)).toBe(row.intent_id);
        const firstClaims:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:firstCycle,
          confirmation_sha256:row.confirmation_sha256,intent_id:row.intent_id,registration_key:row.registration_key,
          registration_sha256:row.registration_sha256,source_evidence_sha256:row.source_evidence_sha256,b1_sha256:row.b1_sha256,
          workspace_id:row.workspace_id,owner_user_id:row.owner_user_id,session_id:row.session_id,
          session_generation:Number(row.session_generation),authority_revision:Number(row.authority_revision),
          acceptance_sha256:row.acceptance_sha256,delegation_sha256:row.delegation_sha256,
          issued_at_ms:Number(row.created_at_ms),expires_at_ms:Number(row.expires_at_ms)};
        const retainedProof=await firstStore.recover(firstClaims);
        try {
          const fence=new C2P7IssuerFenceCandidate(source,signedKey,firstCycle,pin,proof,
            {verifier,proof:retainedProof,issued_at_ms:firstClaims.issued_at_ms,expires_at_ms:firstClaims.expires_at_ms});
          const locked=await pool.connect();try {await locked.query("BEGIN");
            await expect(fence.checkAuthenticatedLocked(locked,httpActor,workspace,"TEST_ONLY-source")).rejects.toThrow();
          } finally {await locked.query("ROLLBACK").catch(()=>{});locked.release();}
        } finally {retainedProof.fill(0);}
        await expect(firstSigner.confirmOwner(httpActor,firstPreview.confirmation_sha256,firstKey,firstAttestation)).rejects.toThrow();
        expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_p7_candidate.owner_intents")).rows[0].n).toBe(beforeRevoke+1);
        await expect(signer.confirmOwner({user_id:owner,session_id:httpSession,session_generation:7},
          signedPreview.confirmation_sha256,"TEST_ONLY-http-signer-key",Buffer.from(signedPayload.owner_attestation,"base64url"))).rejects.toThrow();
      } finally {
        await firstAttempt?.catch(()=>{});
        await authority.query("DROP TRIGGER test_only_http_slow_insert ON elp210_c2_p7_witness_candidate.witnesses");
        await authority.query("DROP FUNCTION elp210_c2_p7_witness_candidate.test_only_http_slow_insert()");
      }
      const revoked=await http.inject({method:"POST",url:`${path}/resume-by-key`,headers,payload});
      expect(revoked.statusCode).toBe(401);expect(revoked.headers["cache-control"]).toBe("private, no-store");
      expect((await http.inject({method:"POST",url:`${path}/confirm-signed`,headers:signedHeaders,payload:signedPayload})).statusCode).toBe(401);
    } finally {await app.close();}
  });
  it("keeps a retained UNKNOWN delivery fenced during drain",async()=>{
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_c2_delivery_candidate.obligations WHERE state='UNKNOWN'")).rows[0].n).toBeGreaterThan(0);
    const drained=await issuer.beginDrain("TEST_ONLY-p7-fence-drain");
    expect(drained.status).toBe("DRAIN_UNKNOWN");
    await expect(issuer.endDrain("TEST_ONLY-p7-fence-drain",drained.authority_revision)).rejects.toMatchObject({code:"CURRENT_HUMAN_DRAIN_UNRESOLVED"});
  });
});
