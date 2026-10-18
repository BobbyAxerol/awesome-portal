/**
 * NF-COUPLED-TEST — SAME NC01 scope, physical send and settlement composition.
 * Canonical integration and execution receipts belong to the ELP2-09 packet.
 *
 * Actual disposable PostgreSQL + actual loopback mTLS1.3 selected-source HTTP
 * and Core SSE socket; PM is a REVIEWED SYNTHETIC in-memory protocol endpoint,
 * NOT deployed/native-PM or installed authority qualification.
 * Genuine Scopes/codec/Candidate/Egress/ACK helper only. No positive scope,
 * physical observation or settlement callback is mocked.
 */
import { createHash, randomUUID, generateKeyPairSync, X509Certificate, type KeyObject } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, request, type ClientRequest, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { join } from "node:path";
import { generateKeyPair, jwtVerify, type KeyLike } from "jose";
import { Pool, type PoolClient } from "pg";
import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";
import { evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { AuthService } from "../src/auth/auth.service";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { accessDigest, type AccessRelations } from "../src/execution-v2/access-policy";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import type { ReviewedAccessPolicy, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { ExecutionReadScopes, nativeExecutionNoticeView, scopeRealtimeIdentity, scopeReplayFieldPolicyRevision,
  managerNativeReplayContext,
  scopeResources,scopeTuples,scopeAllowsFullAccountingPopulation,
  type AuthorizedExecutionReadScope,type PreparedExecutionNativeNotice, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { ScopedReplayCursorCodec, ScopedReplayHub, type ScopedNoticeSource } from "../src/execution-v2/realtime";
import { scopedRealtimeFrame, type ScopedReplayBinding } from "../src/execution-v2/realtime.contract";
import type { ExecutionReadPublication, ExecutionReadPublicationRequest } from "../src/execution-v2/read-publication";
import { CurrentHumanCandidate, type CurrentHumanNativeHTTPConfig } from "../src/execution-v2/current-human-candidate";
import { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import { composeNativeCore, type NativeCoreSelection } from "../src/execution-v2/native-core-composition";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { SelectedNativeBusinessReadSource } from "../src/execution-v2/native-business-read-selected-source";
import { prepareNativeBusinessReadRequest, nativeBusinessReadUtcMicroseconds } from "../src/execution-v2/native-business-read-codec";
import { SessionsRepository } from "../src/repos/sessions";
import { commonName, testCertificate } from "./fixtures/elp210-test-certificates";
import { migrateTestDatabase, setupApp, teardownApp, truncateAll } from "./harness";

const pgUrl=process.env.TEST_DATABASE_URL;
const hash=(c:string)=>"sha256:"+c.repeat(64),raw=(c:string)=>c.repeat(64);
const actor={user_id:"TEST_ONLY-native-frame-human",session_id:"TEST_ONLY-native-frame-session",session_generation:7};
const owner="TEST_ONLY-native-frame-owner",workspace="TEST_ONLY-native-frame-workspace",root="TEST_ONLY-native-frame-root";
const rootResource={kind:"ROOT" as const,id:root};
const domain={profile_id:"TEST_ONLY-native-frame-profile",catalogue_sha256:raw("a"),
  profile_sha256:raw("b"),field_policy_sha256:raw("c")};
const alpha={kind:"ALPHA" as const,id:"TEST_ONLY-native-frame-alpha"};
const tuple={alpha_id:alpha.id,alpha_version_id:"TEST_ONLY-native-frame-av",portfolio_id:"TEST_ONLY-native-frame-p",
  deployment_id:"TEST_ONLY-native-frame-d",account_id:"TEST_ONLY-native-frame-a"};
const resources=[alpha,{kind:"ALPHA_VERSION" as const,id:tuple.alpha_version_id},
  {kind:"PORTFOLIO" as const,id:tuple.portfolio_id},{kind:"DEPLOYMENT" as const,id:tuple.deployment_id},
  {kind:"ACCOUNT" as const,id:tuple.account_id}];
const membership={revision:"TEST_ONLY-membership-r1",receipt_id:"TEST_ONLY-membership-receipt",mapping_revision:"TEST_ONLY-mapping-r1"};
function deferred<T=void>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
async function bounded<T>(value:Promise<T>,ms=8000):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([value,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("TEST_ONLY_FRAME_DEADLINE")),ms);})]);}
  finally{clearTimeout(timer);}
}
async function until(check:()=>boolean){const end=Date.now()+2000;while(!check()){
  if(Date.now()>=end)throw Error("TEST_ONLY_FRAME_QUIESCENCE");await new Promise<void>(done=>setTimeout(done,5));}}
type Authority={key:KeyObject;name:Buffer;cert:Buffer};
type Identity={key:Buffer;cert:Buffer;ca:Buffer;pin:string};
function authority():Authority{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY_FRAME_ROOT");
  return{key:keys.privateKey,name,cert:testCertificate(name,keys,{name,key:keys.privateKey},true)};}
function identity(label:string,ca:Authority):Identity{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  const cert=testCertificate(commonName(label),keys,ca,false,"localhost");
  return{key:Buffer.from(keys.privateKey.export({format:"pem",type:"pkcs8"})),cert,ca:ca.cert,
    pin:"sha256:"+createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")};}

/** Real Core listener. It is intentionally left OPEN across several frames.
 * Only this helper's exact ephemeral server/socket set is closed in finally. */
async function exchange(run:(x:{response:ServerResponse;body:()=>Buffer;client:ClientRequest})=>Promise<void>,runDeadlineMs=8000){
  const accepted=deferred<ServerResponse>(),sockets=new Set<Socket>(),chunks:Buffer[]=[];
  const server=createServer((_request,response)=>accepted.resolve(response));let client:ClientRequest|undefined;
  server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
  try{
    await bounded(new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);}));
    const address=server.address();if(!address||typeof address==="string")throw Error("TEST_ONLY_FRAME_LISTEN");
    client=request({host:"127.0.0.1",port:address.port,path:"/TEST_ONLY-native-frames",method:"GET",agent:false},
      reply=>{reply.on("data",(chunk:Buffer)=>chunks.push(Buffer.from(chunk)));reply.on("error",()=>undefined);});
    client.on("error",()=>undefined);client.end();
    await bounded(run({response:await bounded(accepted.promise),body:()=>Buffer.concat(chunks),client}),runDeadlineMs);
  }finally{client?.destroy();for(const socket of sockets)socket.destroy();server.closeAllConnections();
    await bounded(new Promise<void>(resolve=>server.close(()=>resolve())));}
}

class TestOnlyReadTrust implements AccessTrustProvider {
  constructor(readonly publication:ExecutionReadPublication){}
  async verifyPolicy(){return null;}
  async verifyReceipt(){return null;}
  async verifiedHumanMapping(){return null;}
  async relations():Promise<AccessRelations>{return{qualified:true,revision:"TEST_ONLY-native-frame-relations",
    own_alpha_ids:[],member_portfolio_ids:[],roots:{[root]:structuredClone(resources)},membership:{...membership}};}
  async readPublication(request:ExecutionReadPublicationRequest){
    expect(request).toEqual({workspace_id:workspace,environment:"paper",profile_id:domain.profile_id,
      binding:this.publication.binding});
    return structuredClone(this.publication);
  }
}

describe.skipIf(!pgUrl)("TEST_ONLY native scoped-notice actual PG/TLS/HTTP coupled lifecycle",()=>{
  let app:Awaited<ReturnType<typeof setupApp>>,pool:Pool,auth:AuthService,scopes:ExecutionReadScopes,
    principal:ReadScopePrincipal,publication:ExecutionReadPublication,codec:ScopedReplayCursorCodec;
  let candidate:CurrentHumanCandidate,config:CurrentHumanNativeHTTPConfig,streamGrant:ScopedAccessGrant;
  let selectedInput:ConstructorParameters<typeof SelectedNativeBusinessReadSource>[0];
  const fixturePeople=new Map<string,{human:typeof selectedInput.pins.human;session_id:string}>();
  let ca:Authority,core:Identity,pm:Identity,server:HttpsServer,humanKey:KeyLike,terminalKey:KeyLike;
  const peerSockets=new Set<Duplex>(),phases=new Map<string,string>(),receipts=new Map<string,string>();
  const calls:Array<{action:string;lease_id:string}>=[],terminalKinds:string[]=[],peerErrors:unknown[]=[];
  let holdResolve:ReturnType<typeof deferred>|undefined,resolveArrived:ReturnType<typeof deferred>|undefined;
  let holdEnter:ReturnType<typeof deferred>|undefined,enterArrived:ReturnType<typeof deferred>|undefined;
  let dropEnter=false,dropResolve=false;
  const rows=async()=>(await pool.query("SELECT * FROM elp210_candidate.native_read_obligations ORDER BY issued_at_ms,lease_id")).rows;
  const frameRow=async(ordinal="1")=>(await pool.query(
    "SELECT * FROM elp210_candidate.native_read_obligations WHERE base_body::jsonb#>>'{manager_intent,frame_ordinal}'=$1",[ordinal])).rows[0];
  const pending=async()=>Number((await pool.query("SELECT count(*)::int n FROM elp210_candidate.obligations WHERE unresolved")).rows[0].n);
  const actionCount=(action:string)=>calls.filter(value=>value.action===action).length;
  function json(response:ServerResponse,value:unknown){const body=Buffer.from(JSON.stringify(value));response.writeHead(200,{
    "content-type":"application/json","content-length":String(body.length),"cache-control":"no-store","connection":"close"});response.end(body);}

  beforeAll(async()=>{
    const target=new URL(pgUrl!);
    if(!["postgres:","postgresql:"].includes(target.protocol)||!/^control-api-test-postgres-[0-9]+$/.test(target.hostname)||
      target.pathname!=="/portal_control_test")throw Error("TEST_ONLY_DISPOSABLE_INTERNAL_DATABASE_REQUIRED");
    // Guard exact internal disposable target BEFORE constructing a client or migration.
    await migrateTestDatabase(pgUrl!);app=await setupApp({DATABASE_URL:pgUrl!});auth=app.app.get(AuthService);
    // Candidate and genuine scope issuer share this genuinely bounded pool.
    // Do not mutate the app pool's options to pretend its existing clients
    // acquired query deadlines. Auth reads still use the same disposable DB.
    pool=new Pool({connectionString:pgUrl,max:4,connectionTimeoutMillis:2000,query_timeout:6000,
      statement_timeout:5000,idle_in_transaction_session_timeout:5000});
    ca=authority();core=identity("TEST_ONLY_FRAME_CORE",ca);pm=identity("TEST_ONLY_FRAME_PM",ca);
  },20000);

  async function sourceFixture(){
    const human=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),
      terminal=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    humanKey=human.publicKey;terminalKey=terminal.publicKey;
    const tsUser="33333333-3333-3333-3333-333333333333";
    const humanPins={issuer:"TEST_ONLY-frame-issuer",subject:actor.user_id,portal_user_id:actor.user_id,
      ts_user_id:tsUser,mapping_revision:"ts-user:"+tsUser+":1"};
    fixturePeople.set(actor.user_id,{human:humanPins,session_id:actor.session_id});
    const nativePins={revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:hash("1"),document_digest:hash("2"),
      policy_revision:"1",owner_mapping_revision:"ts-user:"+tsUser+":1",semantic_revision:hash("3"),
      effective_from:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+120000).toISOString()};
    server=createHttpsServer({key:pm.key,cert:pm.cert,ca:core.ca,requestCert:true,rejectUnauthorized:true,
      minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
      const chunks:Buffer[]=[];req.on("error",()=>undefined);res.on("error",()=>undefined);
      req.on("data",chunk=>chunks.push(Buffer.from(chunk)));
      req.on("end",async()=>{try{
        const input=JSON.parse(Buffer.concat(chunks).toString("utf8")),action=(req.url??"").split("/").pop()!,
          leaseId=input.binding.lease_id,current=phases.get(leaseId);
        const person=fixturePeople.get(input.binding.subject);
        if(!person)throw Error("TEST_ONLY_CONFIGURED_PERSON_REQUIRED");
        expect(req.method).toBe("POST");expect(["issue","enter","status","unknown","cancel-unentered","resolve"]).toContain(action);
        // Real selected-source calls must never run with a Core client held.
        expect(pool.idleCount).toBe(pool.totalCount);
        expect(input.manager_intent).toMatchObject({schema_version:"pma.manager-read-intent.v2",action:"scoped_notice"});
        calls.push({action,lease_id:leaseId});
        const common={schema_version:"pma.native-business-read.result.v1",binding:input.binding,component:"NATIVE_BUSINESS_READ_ONLY"};
        if(action==="issue"||action==="enter"){
          const jwt=await jwtVerify(input.human_token,humanKey,{algorithms:["EdDSA"],issuer:"TEST_ONLY-frame-issuer",audience:"TEST_ONLY-frame-human"});
          const encoded=prepareNativeBusinessReadRequest(action,input,{request_bytes:32768,response_bytes:32768});
          expect(jwt.payload).toMatchObject({purpose:"pma.identity.v1",sub:person.human.subject,sid:person.session_id,
            session_revision:7,request_digest:encoded.provider_delivery_digest});
          expect(Number.isSafeInteger(jwt.payload.exp)).toBe(true);
          expect(nativeBusinessReadUtcMicroseconds(input.deadline)<=BigInt(jwt.payload.exp!)*1000000n).toBe(true);
          expect(nativeBusinessReadUtcMicroseconds(input.deadline)>BigInt(Date.now())*1000n).toBe(true);
        }
        if(action==="issue"){
          if(current)throw Error("TEST_ONLY_NO_REISSUE");phases.set(leaseId,"ISSUED");
          json(res,{...common,state:"ISSUED",human:person.human,domain:{...input.domain,environment:input.binding.environment},
            permission:{scope_kind:"MANAGER_CATALOGUE_DOMAIN",action:"business.read_all",delegable:false},native:nativePins,
            lease:{source_digest:raw("f"),source_fingerprint:raw("e"),expires_at:input.deadline}});return;
        }
        if(action==="enter"){
          if(current!=="ISSUED")throw Error("TEST_ONLY_ENTER_ORDER");phases.set(leaseId,"ENTERED");
          enterArrived?.resolve(undefined);if(holdEnter)await bounded(holdEnter.promise,5000);
          if(dropEnter){dropEnter=false;req.socket.destroy();return;}json(res,{...common,state:"ENTERED"});return;
        }
        if(action==="status"){
          json(res,{...common,state:"OBSERVATION",may_authorize_read:false,recovery:current===undefined?
            {state:"ABSENT",terminal_authority:false,release_permitted:false}:current==="CANCELLED"?
            {state:"RECORDED",phase:"CANCELLED",terminal_authority:false,release_permitted:false}:
            {state:"RECORDED",phase:current,source_digest:raw("f"),expires_at:input.deadline,terminal_authority:false,release_permitted:false}});return;
        }
        if(action==="cancel-unentered"){
          if(current&&!["ISSUED","RETIRED","CANCELLED"].includes(current))throw Error("TEST_ONLY_NO_CANCEL_ENTERED");
          phases.set(leaseId,"CANCELLED");json(res,{...common,state:"CANCELLED",may_authorize_read:false,
            recovery:{state:"CANCELLED",cancellation_authority:true,release_permitted:true}});return;
        }
        if(action==="resolve"){
          const jwt=await jwtVerify(input.signed_terminal,terminalKey,{algorithms:["EdDSA"],issuer:"TEST_ONLY-frame-terminal",audience:"TEST_ONLY-frame-native-terminal"}),
            encoded=prepareNativeBusinessReadRequest("resolve",input,{request_bytes:32768,response_bytes:32768});
          expect(jwt.payload).toMatchObject({purpose:"pma.native-business-to-core-terminal.v1",lease_id:leaseId,
            attempt_id:input.binding.attempt_id,workload_id:input.binding.workload_id,binding_digest:encoded.binding_digest,
            source_digest:raw("f"),operation:"READ"});
          expect(["SERVED","ABORTED"]).toContain(jwt.payload.phase);
          const kind=jwt.payload.phase==="SERVED"?"FINAL_SSE_FRAME_WRITE_COMPLETED":"FINAL_SSE_FRAME_ABORT_CONFIRMED";
          expect(jwt.payload.evidence_kind).toBe(kind);terminalKinds.push(kind);
          const receipt=String(jwt.payload.receipt_id)+":"+String(jwt.payload.receipt_digest),previous=receipts.get(leaseId);
          if(previous)expect(receipt).toBe(previous);
          receipts.set(leaseId,receipt);phases.set(leaseId,String(jwt.payload.phase));
          resolveArrived?.resolve(undefined);if(holdResolve)await bounded(holdResolve.promise,5000);
          if(dropResolve){dropResolve=false;req.socket.destroy();return;}
          json(res,{...common,state:"SETTLED",may_authorize_read:false,
            recovery:{state:"SETTLED",phase:String(jwt.payload.phase),terminal_authority:true,release_permitted:true}});return;
        }
        throw Error("TEST_ONLY_ACTION_NOT_EXPECTED");
      }catch(error){peerErrors.push(error);res.writeHead(500,{"connection":"close"});res.end();}});
    });
    server.on("tlsClientError",()=>undefined);server.on("clientError",(_error,socket)=>socket.destroy());
    server.on("connection",socket=>{peerSockets.add(socket);socket.once("close",()=>peerSockets.delete(socket));});
    await bounded(new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);}));
    const address=server.address();if(!address||typeof address==="string")throw Error("TEST_ONLY_FRAME_PEER_LISTEN");
    const installation=Date.now()+110000;
    selectedInput={transport:{
      origin:"https://127.0.0.1:"+address.port,tls:{key:core.key,cert:core.cert,ca:pm.ca},pm_leaf_sha256:pm.pin,
      workload_id:"TEST_ONLY-frame-pm",deadline_ms:5000,request_bytes:32768,response_bytes:32768,max_inflight:4},
      pins:{binding:{human_issuer:"TEST_ONLY-frame-issuer",subject:actor.user_id,workspace_id:workspace,
        environment:"paper",workload_id:"TEST_ONLY-frame-pm"},domain:{...domain},human:humanPins,native:nativePins,source_fingerprint:raw("e")},
      installation_expires_at_utc_ms:installation};
    const selected=new SelectedNativeBusinessReadSource(selectedInput);
    config={issuer:"TEST_ONLY-frame-issuer",audience:"TEST_ONLY-frame-human",key_id:"TEST_ONLY-frame-human-key",private_key:human.privateKey,
      selected_source:selected,limits:{ttl_ms:30000,maximum_unresolved:4,maximum_retained:32},
      installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:installation},
      terminal:{issuer:"TEST_ONLY-frame-terminal",audience:"TEST_ONLY-frame-native-terminal",key_id:"TEST_ONLY-frame-terminal-key",
        private_key:terminal.privateKey,ttl_seconds:30},
      egress:{maximum_response_bytes:1048576,maximum_inflight:2,send_timeout_ms:2500,quiesce_timeout_ms:200}};
    candidate=await CurrentHumanCandidate.createNativeRead(pool,config);
  }

  beforeEach(async()=>{
    await truncateAll(pool);phases.clear();receipts.clear();fixturePeople.clear();calls.length=0;terminalKinds.length=0;peerErrors.length=0;
    holdResolve=undefined;resolveArrived=undefined;dropEnter=false;dropResolve=false;
    holdEnter=undefined;enterArrived=undefined;
    const now=Date.now(),repo=new AccessRepository(pool);
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) "+
      "VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7),($2,$2,'TEST_ONLY','USER','ACTIVE',false,7)",[actor.user_id,owner]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) "+
      "VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')",[actor.session_id,actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER'),($1,$3,'MEMBER')",[workspace,owner,actor.user_id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY-DISPOSABLE')",[owner]);
    const fields=["alpha_id","alpha_version_id","portfolio_id","deployment_id","account_id","display_name","lifecycle"];
    // OWNER_VERIFIED is the literal required by the real domain evaluator.
    // This is a reviewed SYNTHETIC fixture, NOT actual owner/producer acceptance.
    const policy:ReviewedAccessPolicy={workspace_id:workspace,revision:"TEST_ONLY-frame-policy",artifact_digest:hash("8"),
      approval_ref:"TEST_ONLY-NOT-REAL-APPROVAL",state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,
      researcher_fields:{state:"QUALIFIED",policy_ref:"TEST_ONLY-frame-fields",fields},
      manager_read_domains:[{environment:"paper",domain:{...domain},field_policy_ref:"TEST_ONLY-frame-fields",
        valid_from_ms:now-1000,valid_until_ms:now+180000}]};
    await repo.putPolicy(policy);
    const grant=(action:"business.read_all"|"stream.subscribe",grantId:string):ScopedAccessGrant=>({
      grant_id:grantId,workspace_id:workspace,subject_user_id:actor.user_id,issued_by:owner,parent_grant_id:null,
      revision:"TEST_ONLY-frame-grant-r1",policy_revision:policy.revision,action,effect:"ALLOW",
      selector:action==="business.read_all"?{kind:"ROOT_SCOPE",root_id:root}:
        {kind:"EXPLICIT_RESOURCE_SET",resource_kind:"ROOT",ids:[root]},environments:["paper"],
      valid_from_ms:now-1000,valid_until_ms:now+150000,revoked_at_ms:null,delegable_actions:[],
      requires_ts_acceptance:true,field_policy_ref:policy.researcher_fields.policy_ref,
      ts_receipt:{receipt_id:membership.receipt_id,membership_revision:membership.revision,mapping_revision:membership.mapping_revision,
        effective_at_ms:now-1000,expires_at_ms:now+150000}});
    await repo.saveGrant(grant("business.read_all","TEST_ONLY-frame-business"),true);
    streamGrant=grant("stream.subscribe","TEST_ONLY-frame-stream");await repo.saveGrant(streamGrant,true);
    await repo.saveManagerDomainGrant({schema_version:"portal.manager-domain-grant.v1",grant_id:"TEST_ONLY-frame-domain",
      workspace_id:workspace,subject_user_id:actor.user_id,issued_by:owner,parent_grant_id:null,revision:"TEST_ONLY-frame-domain-r1",
      policy_revision:policy.revision,action:"business.read_all",effect:"ALLOW",environment:"paper",domain:{...domain},
      field_policy_ref:"TEST_ONLY-frame-fields",valid_from_ms:now-1000,valid_until_ms:now+150000,revoked_at_ms:null},true);
    publication={workspace_id:workspace,environment:"paper",profile_id:domain.profile_id,qualification:"TEST_ONLY",
      publication_revision:"TEST_ONLY-frame-population",binding:{dataset_id:"alpha_fleet_overview",source_revision:"TEST_ONLY-document",
        projection_generation:"TEST_ONLY-frame-generation",window:{from_ms:now-3600000,to_ms:now}},
      population_coverage:"COMPLETE_FOR_DATASET_WINDOW",provenance_ref:"TEST_ONLY-NOT-A-REAL-SOURCE",
      current_linkage:{qualification:"TEST_ONLY",revision:"TEST_ONLY-linkage",provenance_ref:"TEST_ONLY-NOT-A-REAL-LINKAGE",
        pairs:[{alpha_id:alpha.id,portfolio_id:tuple.portfolio_id}]},resources:structuredClone(resources),tuples:[structuredClone(tuple)]};
    const trust=new TestOnlyReadTrust(publication),access=new ExecutionAccessService(pool,auth,trust,true);
    scopes=new ExecutionReadScopes(pool,access,app.config);
    const user=await auth.users.findById(actor.user_id),session=await new SessionsRepository(pool).findByTokenHash(actor.session_id);
    if(!user||!session)throw Error("TEST_ONLY_REAL_PRINCIPAL_REQUIRED");
    principal={user,session,workspaceId:workspace,viewerWorkspaceId:workspace};
    codec=new ScopedReplayCursorCodec("test",{test:"TEST_ONLY_FRAME_REPLAY_NOT_RUNTIME_".repeat(3)},60000);
    // SAME actual private installer with Main's reviewed frame extension.
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    await sourceFixture();
  });
  afterEach(async()=>{
    holdResolve?.resolve(undefined);holdEnter?.resolve(undefined);vi.restoreAllMocks();vi.useRealTimers();
    try{
      if(server){const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
        for(const socket of peerSockets)socket.destroy();server.closeAllConnections();await bounded(closed);}
    }finally{
      // Exact schema belongs solely to this isolated disposable cell. Always
      // clean it before asserting so a failed peer check cannot leak to a test.
      await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    }
    expect(peerErrors).toEqual([]);
  });
  afterAll(async()=>{
    try{try{if(pool)await pool.end();}finally{if(app)await teardownApp(app);}}
    finally{core?.key.fill(0);pm?.key.fill(0);}
  });

  const currentScope=()=>scopes.authorize(principal,{environment:"paper",profileId:domain.profile_id},
    {action:"business.read_all",resource:rootResource,dataset:structuredClone(publication.binding)});
  function replayBinding(scope:Awaited<ReturnType<typeof currentScope>>):ScopedReplayBinding{
    if(scope.mode!=="SCOPED_V2"||!scope.policyRevision)throw Error("TEST_ONLY_CURRENT_V2_POLICY_REQUIRED");
    return{workspace_id:workspace,environment:"paper",profile_id:domain.profile_id,
      principal_scope_digest:scopeRealtimeIdentity(scope),app_policy_revision:scope.policyRevision,
      field_policy_revision:scopeReplayFieldPolicyRevision(scope),model_revision:"TEST_ONLY-model",
      schema_revision:"portal.execution.scoped-realtime.v1",dataset:"alpha_fleet_overview",query_digest:hash("4"),
      source_set_digest:hash("5"),source_continuity_epoch:"TEST_ONLY-continuity",
      projection_generation:publication.binding.projection_generation!,snapshot_id:"TEST_ONLY-snapshot",window:publication.binding.window};
  }
  const quality=()=>({completeness:"PARTIAL" as const,freshness:"UNKNOWN" as const,coverage:"AUTHORIZED_ONLY" as const,
    source_as_of_ms:null,portal_observed_at_ms:Date.now(),source_set_ref:"TEST_ONLY-notification-source",
    confidence:"PROVISIONAL" as const,reasons:["TEST_ONLY"]});
  async function notice(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>,sourceCursor="TEST_ONLY.scan1"){
    const scope=await currentScope(),binding=replayBinding(scope);
    return scopes.prepareNativeNotice(scope,rootResource,codec,noticeInput(stream,sourceCursor,binding));
  }
  function noticeInput(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>,sourceCursor:string,binding:ScopedReplayBinding){
    const frame=scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
      event_type:"revalidate",terminal:false,reconnect_required:false,resume_cursor:codec.encode(binding,sourceCursor),
      projection_generation:binding.projection_generation,quality:quality(),next_action:"READ_NAMED_SNAPSHOT",reason_code:null});
    return{delivery_json:JSON.stringify(candidate.nextNativeNoticeDelivery(stream)),
      replay_binding_json:JSON.stringify(binding),source_cursor:sourceCursor,frame_json:JSON.stringify(frame)};
  }
  function blocked(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>){
    expect(()=>candidate.nextNativeNoticeDelivery(stream)).toThrow();
  }
  async function send(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>,cursor:string){
    const n=await notice(stream,cursor),payload=nativeExecutionNoticeView(n).payload,h=await candidate.acquireNativeFrame(stream,n);
    const result=await candidate.sendNativeFrame(h);expect(result.state).toBe("RECONCILED");
    return{n,h,payload,result};
  }
  /** A reviewed synthetic notification adapter, not an installed Edge source.
   * Scopes, encrypted continuation, Candidate, PG and physical egress remain
   * the actual implementations; no positive delivery/settlement port is faked. */
  async function hubFixture(response:ServerResponse){
    const binding=replayBinding(await currentScope()),reads:string[]=[];
    const source:ScopedNoticeSource={read:async(received,after)=>{
      expect(received).toEqual(binding);expect(pool.idleCount).toBe(pool.totalCount);reads.push(after);
      return{notices:after==="TEST_ONLY.scan0"?["TEST_ONLY.scan1","TEST_ONLY.scan2"].map(resume_cursor=>({
        resume_cursor,projection_generation:binding.projection_generation,quality:quality()})):[],
        next_cursor:"TEST_ONLY.scan2",caught_up:true};
    }};
    const hub=new ScopedReplayHub(source,codec,{maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:16384,
      maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:2,readTimeoutMs:2000},{candidate,scopes});
    const subscription=await hub.subscribeNative({binding,resource:rootResource,response,current:currentScope,
      baselineCursor:"TEST_ONLY.scan0"});
    return{hub,subscription,binding,reads};
  }
  function receivedFrames(body:Buffer){
    // Ignore an actual partial trailing socket chunk; do not pretend it is a
    // received frame. Tests wait for the complete expected frame delimiter.
    return body.toString("utf8").split("\n\n").slice(0,-1).map(chunk=>{
      const data=chunk.split("\n").find(line=>line.startsWith("data: "));
      if(!data)throw Error("TEST_ONLY_SSE_DATA_REQUIRED");return scopedRealtimeFrame.parse(JSON.parse(data.slice(6)));
    });
  }

  /** Scheduling instrumentation only. Every SQL result/COMMIT comes from the
   * actual PG client unmodified; real withTransaction still owns finally release.
   * It cannot mint/return a fake positive scope, native ACK or settlement proof. */
  function sqlFault(mode:"ACK_HOLD"|"SENDING_LOSS"|"ACK_LOSS"){
    const arrived=deferred(),resume=deferred();let used=false,releaseBlocked:boolean|undefined;
    const actualConnect=pool.connect.bind(pool) as()=>Promise<PoolClient>;
    vi.spyOn(pool,"connect").mockImplementation(((callback?:unknown)=>{
      if(typeof callback==="function")return( actualConnect as any)(callback);
      return actualConnect().then(db=>{
        const actualQuery=db.query.bind(db),actualRelease=db.release.bind(db);let transition="",heldThisClient=false;
        (db as any).query=async(sql:string,params?:unknown[])=>{
          if(sql.startsWith("UPDATE elp210_candidate.native_read_obligations SET phase='SENDING'"))transition="SENDING";
          if(sql.includes("SET phase=$2,source_reconciled=true"))transition="ACK";
          const result=await actualQuery(sql,params);
          if(sql==="COMMIT"&&!used&&((mode==="SENDING_LOSS"&&transition==="SENDING")||
            (mode!=="SENDING_LOSS"&&transition==="ACK"))){
            used=true;heldThisClient=mode==="ACK_HOLD";arrived.resolve(undefined);
            if(mode==="ACK_HOLD")await bounded(resume.promise,5000);
            else throw Error("TEST_ONLY_"+mode);
          }
          return result;
        };
        db.release=(error?:Error|boolean)=>{
          // Assigned by the test only for its ACK-held client. Record a real
          // synchronous check BEFORE actual pool release; never fake a proof.
          try{if(heldThisClient){heldThisClient=false;onRelease?.();}}
          finally{(db as any).query=actualQuery;db.release=actualRelease;actualRelease(error);}
        };return db;
      });
    })as any);
    let onRelease:(()=>void)|undefined;
    return{arrived:arrived.promise,resume:()=>resume.resolve(),used:()=>used,
      observeRelease:(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>)=>{
        onRelease=()=>{if(mode==="ACK_HOLD"&&used&&releaseBlocked===undefined){try{candidate.nextNativeNoticeDelivery(stream);releaseBlocked=false;}
          catch{releaseBlocked=true;}}};},releaseBlocked:()=>releaseBlocked};
  }

  it("real scopes+codec → original native source → actual frame1/frame2 on SAME socket with exclusive SSE terminals",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),first=await send(stream,"TEST_ONLY.scan1");
      const firstRow=await frameRow("1");expect(firstRow).toMatchObject({lifecycle_kind:"MANAGER_SSE_FRAME",phase:"SERVED",
        source_reconciled:true,source_ack_action:"resolve"});
      const base=JSON.parse(firstRow.base_body);expect(base.manager_intent.frame_ordinal).toBe("1");
      expect(firstRow.scope_digest).toBe(accessDigest({schema:"portal.native-frame-scope.v1",
        domain_scope_digest:firstRow.frame_domain_scope_digest,notice_scope_digest:firstRow.frame_notice_scope_digest}));
      expect(firstRow.body_digest).toBe("sha256:"+base.manager_intent.frame_sha256);
      expect(candidate.nextNativeNoticeDelivery(stream)).toMatchObject({stream_id:base.manager_intent.stream_id,frame_ordinal:"2"});
      const second=await send(stream,"TEST_ONLY.scan2");
      expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("3");
      await until(()=>body().length===first.payload.length+second.payload.length);
      expect(body()).toEqual(Buffer.concat([first.payload,second.payload]));
      expect(terminalKinds).toEqual(["FINAL_SSE_FRAME_WRITE_COMPLETED","FINAL_SSE_FRAME_WRITE_COMPLETED"]);
      expect(await pending()).toBe(0);expect((await rows())).toHaveLength(2);
      expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
      candidate.closeNativeNoticeStream(stream);
    });
  });
  it("actual physical bytes do NOT unlock frame2 while authenticated source resolve ACK is held",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),h=await candidate.acquireNativeFrame(stream,n);
      holdResolve=deferred();resolveArrived=deferred();const sending=candidate.sendNativeFrame(h);void sending.catch(()=>undefined);
      try{
        await bounded(resolveArrived.promise);await until(()=>body().length>0);
        expect(await frameRow()).toMatchObject({phase:"SERVED",source_reconciled:false});expect(await pending()).toBe(1);
        blocked(stream);await expect(candidate.acquireNativeFrame(stream,n)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_STREAM_BUSY"});
        expect(actionCount("issue")).toBe(1);
        await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id]))
          .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
      }finally{holdResolve.resolve(undefined);}
      expect((await sending).state).toBe("RECONCILED");expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("2");
      candidate.closeNativeNoticeStream(stream);
    });
  });
  it("real local ACK COMMIT with response/release held cannot retire the original active frame",async()=>{
    await exchange(async({response})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),h=await candidate.acquireNativeFrame(stream,n),
        fault=sqlFault("ACK_HOLD");fault.observeRelease(stream);
      const sending=candidate.sendNativeFrame(h);void sending.catch(()=>undefined);
      try{
        await bounded(fault.arrived);
        expect(await frameRow()).toMatchObject({phase:"SERVED",source_reconciled:true});
        expect(await pending()).toBe(0);expect(pool.idleCount).toBeLessThan(pool.totalCount);
        blocked(stream);expect(actionCount("issue")).toBe(1);
      }finally{fault.resume();}
      expect((await sending).state).toBe("RECONCILED");expect(fault.used()).toBe(true);
      expect(fault.releaseBlocked()).toBe(true);
      expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("2");candidate.closeNativeNoticeStream(stream);
    });
  });
  it("current real stream grant revoked after opaque preparation yields zero Core bytes, native calls or obligations",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),write=vi.spyOn(response,"write");
      await new AccessRepository(pool).saveGrant({...streamGrant,revision:"TEST_ONLY-revoked",revoked_at_ms:Date.now()});
      await expect(candidate.acquireNativeFrame(stream,n)).rejects.toBeDefined();
      expect(write).not.toHaveBeenCalled();expect(response.headersSent).toBe(false);expect(body()).toHaveLength(0);
      expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(await pending()).toBe(0);
    });
  });
  it("lost actual ENTER ACK stays original-owner AND cold UNKNOWN; status is never ENTER or physical evidence",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream);dropEnter=true;
      await expect(candidate.acquireNativeFrame(stream,n)).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
      const original=await frameRow(),id=original.lease_id;expect(original.enter_response_digest).toBeNull();
      // Requires Main's narrowly recorded frame-only missing-ENTER recovery fix.
      expect((await candidate.reconcileNativeRead(id)).state).toBe("UNKNOWN");
      const cold=await CurrentHumanCandidate.createNativeRead(pool,config);
      expect((await cold.reconcileNativeRead(id)).state).toBe("UNKNOWN");
      expect(await frameRow()).toMatchObject({phase:"UNKNOWN",source_reconciled:false,receipt_id:null,receipt_digest:null,
        base_body:original.base_body,binding_digest:original.binding_digest});
      expect(actionCount("issue")).toBe(1);expect(actionCount("enter")).toBe(1);
      expect(actionCount("resolve")).toBe(0);expect(actionCount("cancel-unentered")).toBe(0);
      expect(await pending()).toBe(1);expect(body()).toHaveLength(0);blocked(stream);
      expect(await candidate.recoverableObligations()).toMatchObject([{family:"NATIVE_READ",
        attempt:{lease_id:id,lifecycle_kind:"MANAGER_SSE_FRAME"}}]);
    });
  });
  it("lost source ACK preserves one terminal; cold durable settlement cannot itself advance original Egress",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),h=await candidate.acquireNativeFrame(stream,n),
        write=vi.spyOn(response,"write");dropResolve=true;
      await expect(candidate.sendNativeFrame(h)).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
      const original=await frameRow();expect(original).toMatchObject({phase:"SERVED",source_reconciled:false});
      await until(()=>body().length>0);const actualBytes=Buffer.from(body());blocked(stream);
      const cold=await CurrentHumanCandidate.createNativeRead(pool,config);
      expect((await cold.reconcileNativeRead(original.lease_id)).state).toBe("RECONCILED");
      blocked(stream); // cold replica has no actual original physical owner
      expect((await candidate.reconcileNativeRead(original.lease_id)).state).toBe("RECONCILED");
      expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("2");
      expect(await frameRow()).toMatchObject({receipt_id:original.receipt_id,receipt_digest:original.receipt_digest,source_reconciled:true});
      expect(body()).toEqual(actualBytes);expect(write).toHaveBeenCalledTimes(1);
      expect(actionCount("issue")).toBe(1);expect(actionCount("enter")).toBe(1);expect(actionCount("resolve")).toBe(2);
      expect(receipts.size).toBe(1);expect(await pending()).toBe(0);candidate.closeNativeNoticeStream(stream);
    });
  });
  it("SENDING COMMIT ACK loss uses actual reserved close, zero frame bytes and immutable SSE ABORTED",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),h=await candidate.acquireNativeFrame(stream,n),
        write=vi.spyOn(response,"write"),fault=sqlFault("SENDING_LOSS");
      await expect(candidate.sendNativeFrame(h)).rejects.toThrow("TEST_ONLY_SENDING_LOSS");
      expect(fault.used()).toBe(true);expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      expect(await frameRow()).toMatchObject({phase:"ABORTED",source_reconciled:true,terminal_reason:"UNSENT_RESERVATION_QUIESCENT"});
      expect(terminalKinds).toEqual(["FINAL_SSE_FRAME_ABORT_CONFIRMED"]);expect(await pending()).toBe(0);blocked(stream);
    });
  });
  it("local ACK COMMIT response loss mints no early release; original exact persisted readback unlocks without resend",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream),h=await candidate.acquireNativeFrame(stream,n),
        write=vi.spyOn(response,"write"),fault=sqlFault("ACK_LOSS");
      await expect(candidate.sendNativeFrame(h)).rejects.toThrow("TEST_ONLY_ACK_LOSS");
      const original=await frameRow();expect(fault.used()).toBe(true);expect(original.source_reconciled).toBe(true);blocked(stream);
      const sourceCalls=calls.length;
      expect((await candidate.reconcileNativeRead(original.lease_id)).state).toBe("RECONCILED");
      expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("2");expect(calls).toHaveLength(sourceCalls);
      expect(write).toHaveBeenCalledTimes(1);await until(()=>body().length>0);
      expect(await frameRow()).toMatchObject({receipt_id:original.receipt_id,receipt_digest:original.receipt_digest});
      expect(await pending()).toBe(0);candidate.closeNativeNoticeStream(stream);
    });
  });
  it("altered field revision, copied Notice and another stream cannot produce admission/source/send authority",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await notice(stream);
      const scope=await currentScope(),altered={...replayBinding(scope),field_policy_revision:"TEST_ONLY-not-the-served-field-revision"};
      // This is an authentically encrypted token under the SAME real codec,
      // but it does not match the actual served full-business field revision.
      await expect(scopes.prepareNativeNotice(scope,rootResource,codec,noticeInput(stream,"TEST_ONLY.scan1",altered)))
        .rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED"});
      await expect(candidate.acquireNativeFrame(stream,{} as PreparedExecutionNativeNotice)).rejects.toMatchObject({code:"EXECUTION_READ_SCOPE_REQUIRED"});
      await exchange(async({response:second,body:secondBody})=>{
        const foreign=candidate.openNativeNoticeStream(second);
        await expect(candidate.acquireNativeFrame(foreign,n)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_BINDING_INVALID"});
        expect(secondBody()).toHaveLength(0);candidate.closeNativeNoticeStream(foreign);
      });
      expect(await rows()).toEqual([]);expect(calls).toEqual([]);expect(body()).toHaveLength(0);candidate.closeNativeNoticeStream(stream);
    });
  });
  it("actual Hub queue/continuation waits through real PM ACK AND local ACK COMMIT-release before frame2",async()=>{
    await exchange(async({response,body})=>{
      const {hub,binding,reads}=await hubFixture(response),fault=sqlFault("ACK_HOLD");
      holdResolve=deferred();resolveArrived=deferred();let completed=false;
      const polling=hub.poll().finally(()=>{completed=true;});void polling.catch(()=>undefined);
      try{
        await bounded(resolveArrived.promise);await until(()=>receivedFrames(body()).length===1);
        const retained=hub.diagnostics().queued_bytes;
        expect(retained).toBeGreaterThan(0);expect(completed).toBe(false);expect(actionCount("issue")).toBe(1);
        expect(reads).toEqual(["TEST_ONLY.scan0"]);expect((await frameRow()).source_reconciled).toBe(false);
        await hub.poll();expect(actionCount("issue")).toBe(1);expect(hub.diagnostics().queued_bytes).toBe(retained);
        holdResolve.resolve(undefined);await bounded(fault.arrived);
        expect((await frameRow()).source_reconciled).toBe(true);expect(pool.idleCount).toBeLessThan(pool.totalCount);
        expect(completed).toBe(false);expect(actionCount("issue")).toBe(1);expect(receivedFrames(body())).toHaveLength(1);
        expect(hub.diagnostics().queued_bytes).toBe(retained);await hub.poll();expect(reads).toEqual(["TEST_ONLY.scan0"]);
      }finally{holdResolve.resolve(undefined);fault.resume();}
      await bounded(polling);await until(()=>receivedFrames(body()).length===2);
      expect(hub.diagnostics()).toMatchObject({clients:1,queued_bytes:0,source_flights:0});
      expect(receivedFrames(body()).map(frame=>codec.decode(frame.resume_cursor!,binding)))
        .toEqual(["TEST_ONLY.scan1","TEST_ONLY.scan2"]);
      expect(actionCount("issue")).toBe(2);expect((await rows()).every(row=>row.source_reconciled)).toBe(true);
      // Only the genuine owner's settled frames can move the next source read.
      await bounded(hub.poll());await until(()=>receivedFrames(body()).length===3);
      expect(reads).toEqual(["TEST_ONLY.scan0","TEST_ONLY.scan2"]);
      expect(receivedFrames(body())[2].event_type).toBe("heartbeat");
      expect(body().toString("utf8")).not.toContain("TEST_ONLY.scan");expect(await pending()).toBe(0);hub.stop();
    });
  });
  it.each(["ACK","LOST_ACK"] as const)("actual Hub close during ENTER %s never raw-writes or advances queued continuation",async(mode)=>{
    await exchange(async({response,body})=>{
      const {hub,reads}=await hubFixture(response),write=vi.spyOn(response,"write");
      holdEnter=deferred();enterArrived=deferred();dropEnter=mode==="LOST_ACK";
      const polling=hub.poll();void polling.catch(()=>undefined);
      try{
        await bounded(enterArrived.promise);expect(await pending()).toBe(1);expect(phases.size).toBe(1);
        // A fast revoke hint is not falsely described as a committed policy
        // mutation; the independent test above exercises real grant revocation.
        if(mode==="ACK")hub.stop();else hub.revoke(value=>value.workspace_id===workspace);
        expect(hub.diagnostics()).toMatchObject({clients:0,queued_bytes:0});
        expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      }finally{holdEnter.resolve(undefined);}
      await bounded(polling);expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      expect(actionCount("issue")).toBe(1);expect(actionCount("enter")).toBe(1);
      expect(await rows()).toHaveLength(1);expect(reads).toEqual(["TEST_ONLY.scan0"]);
      if(mode==="ACK"){
        expect(await frameRow()).toMatchObject({phase:"ABORTED",source_reconciled:true});
        expect(terminalKinds).toEqual(["FINAL_SSE_FRAME_ABORT_CONFIRMED"]);expect(await pending()).toBe(0);
      }else{
        // Main's same-row missing-ENTER fix is required here as in the direct
        // Candidate test. A status observation is never an ENTER ACK/terminal.
        expect(await frameRow()).toMatchObject({phase:"UNKNOWN",source_reconciled:false,enter_response_digest:null,
          receipt_id:null,receipt_digest:null});expect(await pending()).toBe(1);
        expect(actionCount("resolve")).toBe(0);expect(actionCount("cancel-unentered")).toBe(0);
      }
      await hub.poll();expect(reads).toEqual(["TEST_ONLY.scan0"]);expect(actionCount("issue")).toBe(1);hub.stop();
    });
  });
  /** Manager-only additional cases. Original entity/coupled definitions above
   * are preserved. All grants and PM protocol replies remain TEST_ONLY. */
  async function managerOnly(){
    const repo=new AccessRepository(pool);
    await pool.query("DELETE FROM portal_access_grants_v2 WHERE workspace_id=$1 AND grant_fact->>'schema_version' IS DISTINCT FROM 'portal.manager-domain-grant.v1'",[workspace]);
    const read=(await repo.storedGrants(workspace)).find(row=>row.kind==="MANAGER_DOMAIN");
    if(!read||read.kind!=="MANAGER_DOMAIN")throw Error("TEST_ONLY_READ_DOMAIN_REQUIRED");
    await repo.saveManagerDomainGrant({...read.fact,grant_id:"TEST_ONLY-manager-stream",action:"stream.subscribe"},true);
    vi.spyOn(TestOnlyReadTrust.prototype,"relations").mockRejectedValue(Error("TEST_ONLY_NO_ENTITY_RELATIONS"));
    vi.spyOn(TestOnlyReadTrust.prototype,"readPublication").mockRejectedValue(Error("TEST_ONLY_NO_ENTITY_PUBLICATION"));
  }
  const managerCurrent=()=>scopes.authorizeManagerNativeStream(principal,
    {environment:"paper",profileId:domain.profile_id},config.selected_source);
  const managerSelection=(selectedConfig=config):NativeCoreSelection=>({selector:{
    portal_user_id:actor.user_id,human_issuer:selectedInput.pins.binding.human_issuer,
    subject:actor.user_id,workspace_id:workspace,environment:"paper",domain:{...domain}},config:selectedConfig});
  function managerConsumer(selections=[managerSelection()],selected=candidate){
    // Only the composition LOOKUP is a test spy. Scope minting, selected-source
    // construction, Candidate and pool are genuine. No physical delivery or
    // production composition/commissioning acceptance follows from this seam.
    const lookup=vi.fn((_selector:NativeCoreSelection["selector"])=>selected);
    return {lookup,consumer:new NativeManagerReadConsumer(pool,app.app.get(MaximumDataOperationService),
      {selectedCandidate:lookup},selections)};
  }
  async function currentComposition(){
    const actual=(await pool.query<{database_name:string;database_system_identifier:string;role_name:string}>(
      "SELECT current_database() AS database_name, system_identifier::text AS database_system_identifier, current_user AS role_name FROM pg_control_system()")).rows[0];
    const target={...actual,protected_owner_user_id:owner,workspace_id:workspace,
      principal_workspace_pins:[{user_id:actor.user_id,workspace_id:workspace}]};
    return composeNativeCore(pool,new TestOnlyReadTrust(publication),{
      expected_workload_id:selectedInput.pins.binding.workload_id,selections:[managerSelection()],retained_recovery:[],
      owner_intakes:[{artifact_path:"/TEST_ONLY-never-opened-owner-intake",approved_sha256:raw("a"),target,
        intake_not_before_ms:Date.now()-1000,intake_not_after_ms:Date.now()+60000}],
      mutation_limits:{maximum_intents:16,maximum_recoveries_per_request:16}});
  }
  function selfLogout(composition:Awaited<ReturnType<typeof currentComposition>>,applied:()=>void){
    // TEST_ONLY current self-session eligibility, not operator/financial power.
    // Both checks and UPDATE use the coordinator's actual held PG transaction.
    return composition.dependencies.currentHumanMutations.execute({family:"AUTH_SESSION",operation:"LOGOUT",
      actor_id:actor.user_id,session_id:actor.session_id,session_revision:actor.session_generation,
      key_digest:accessDigest({test:"TEST_ONLY-composed-logout",session:actor.session_id}),
      request_digest:accessDigest({test:"TEST_ONLY-composed-logout-request",session:actor.session_id}),target_id:actor.session_id},{
      authorize:async db=>{
        const result=await db.query("SELECT session_id FROM auth_sessions WHERE session_id=$1 AND user_id=$2 AND session_version=$3 AND state='ACTIVE' FOR UPDATE",
          [actor.session_id,actor.user_id,actor.session_generation]);
        if(result.rowCount!==1)throw Error("TEST_ONLY_SELF_SESSION_NOT_CURRENT");
      },
      apply:async db=>{
        const result=await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1 AND user_id=$2 AND state='ACTIVE' RETURNING session_id",
          [actor.session_id,actor.user_id]);
        if(result.rowCount!==1)throw Error("TEST_ONLY_SELF_SESSION_NOT_REVOKED");
        applied();return actor.session_id;
      },terminal:session=>({outcome:"APPLIED",receipt_ref:session,reason_code:null})});
  }
  it("SAME composition recovers an actual frame terminal ACK before self-session revoke COMMIT without resend",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),handle=await candidate.acquireNativeFrame(stream,await notice(stream)),
        write=vi.spyOn(response,"write");dropResolve=true;
      await expect(candidate.sendNativeFrame(handle)).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
      const original=await frameRow();expect(original).toMatchObject({phase:"SERVED",source_reconciled:false});
      await until(()=>body().length>0);const sent=Buffer.from(body()),composition=await currentComposition();
      let applied=0;expect(await selfLogout(composition,()=>applied++)).toBe(actor.session_id);expect(applied).toBe(1);
      expect(await frameRow()).toMatchObject({phase:"SERVED",source_reconciled:true,
        receipt_id:original.receipt_id,receipt_digest:original.receipt_digest,base_body:original.base_body});
      expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1",[actor.session_id])).rows[0].state).toBe("REVOKED");
      expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
      expect(await pending()).toBe(0);expect(write).toHaveBeenCalledTimes(1);expect(body()).toEqual(sent);
      expect(actionCount("issue")).toBe(1);expect(actionCount("enter")).toBe(1);expect(actionCount("resolve")).toBe(2);
      blocked(stream);candidate.closeNativeNoticeStream(stream);
    });
  });
  it("SAME composition preserves lost ENTER ACK UNKNOWN and denies self-session revoke with zero bytes",async()=>{
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),write=vi.spyOn(response,"write");dropEnter=true;
      await expect(candidate.acquireNativeFrame(stream,await notice(stream))).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
      const original=await frameRow(),composition=await currentComposition();let applied=0;
      await expect(selfLogout(composition,()=>applied++)).rejects.toMatchObject({code:"CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN"});
      expect(applied).toBe(0);expect(await frameRow()).toMatchObject({phase:"UNKNOWN",source_reconciled:false,
        receipt_id:null,receipt_digest:null,base_body:original.base_body,binding_digest:original.binding_digest});
      expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1",[actor.session_id])).rows[0].state).toBe("ACTIVE");
      expect(await pending()).toBe(1);expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      expect(actionCount("issue")).toBe(1);expect(actionCount("enter")).toBe(1);
      expect(actionCount("resolve")).toBe(0);expect(actionCount("cancel-unentered")).toBe(0);
      blocked(stream);candidate.closeNativeNoticeStream(stream);
    });
  });
  it("Manager consumer selects the same genuine Candidate from its reviewed entry",async()=>{
    await managerOnly();const {consumer,lookup}=managerConsumer(),scope=await managerCurrent();
    expect(consumer.managerNoticeCandidate(scope)).toBe(candidate);
    expect(lookup).toHaveBeenCalledExactlyOnceWith(managerSelection().selector);
    expect(calls).toEqual([]);expect(await rows()).toEqual([]);
  });
  it("Manager consumer rejects forged and cloned scopes before selected lookup",async()=>{
    await managerOnly();const {consumer,lookup}=managerConsumer(),scope=await managerCurrent();
    for(const value of [{},structuredClone(scope)])
      expect(()=>consumer.managerNoticeCandidate(value as typeof scope)).toThrow();
    expect(lookup).not.toHaveBeenCalled();expect(calls).toEqual([]);expect(await rows()).toEqual([]);
  });
  it("Manager consumer refuses an unselected source identity before lookup",async()=>{
    await managerOnly();
    const otherSource=new SelectedNativeBusinessReadSource({...selectedInput,pins:{...selectedInput.pins,source_fingerprint:raw("f")}}),
      {consumer,lookup}=managerConsumer([managerSelection({...config,selected_source:otherSource})]);
    const scope=await managerCurrent();
    expect(()=>consumer.managerNoticeCandidate(scope)).toThrow();expect(lookup).not.toHaveBeenCalled();
    expect(calls).toEqual([]);expect(await rows()).toEqual([]);
  });
  it("Manager consumer rejects a genuine Candidate bound to another pool",async()=>{
    await managerOnly();const otherPool=new Pool({connectionString:pgUrl,max:1,connectionTimeoutMillis:1000,
      query_timeout:2000,statement_timeout:2000,idle_in_transaction_session_timeout:2000});
    try{
      const wrong=await CurrentHumanCandidate.createNativeRead(otherPool,config),{consumer,lookup}=managerConsumer(undefined,wrong),
        scope=await managerCurrent();
      expect(()=>consumer.managerNoticeCandidate(scope)).toThrow();expect(lookup).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([]);expect(await rows()).toEqual([]);
    }finally{await otherPool.end();}
  });
  it("Manager consumer refuses duplicate reviewed selections before lookup",async()=>{
    await managerOnly();const lookup=vi.fn(()=>candidate),entry=managerSelection();
    expect(()=>new NativeManagerReadConsumer(pool,app.app.get(MaximumDataOperationService),
      {selectedCandidate:lookup},[entry,entry])).toThrow();
    expect(lookup).not.toHaveBeenCalled();expect(calls).toEqual([]);expect(await rows()).toEqual([]);
  });
  async function managerBinding(current=managerCurrent){
    const scope=await current();
    return {workspace_id:workspace,environment:"paper" as const,profile_id:domain.profile_id,
      principal_scope_digest:scopeRealtimeIdentity(scope),app_policy_revision:"TEST_ONLY-frame-policy",
      field_policy_revision:scopeReplayFieldPolicyRevision(scope),model_revision:"TEST_ONLY-manager-observation-v1",
      schema_revision:"portal.execution.scoped-realtime.v1" as const,dataset:"execution_profile_observation" as const,
      query_digest:hash("4"),source_set_digest:hash("5"),source_continuity_epoch:"TEST_ONLY-manager-epoch",
      projection_generation:"TEST_ONLY-manager-generation",snapshot_id:"TEST_ONLY-manager-snapshot",window:null};
  }
  function managerInput(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>,binding:ScopedReplayBinding,cursor="TEST_ONLY.manager1",owner:CurrentHumanCandidate=candidate){
    const frame=scopedRealtimeFrame.parse({schema_version:"portal.execution.scoped-realtime.v1",semantics:"NOTIFICATION_ONLY",
      event_type:"revalidate",terminal:false,reconnect_required:false,resume_cursor:codec.encode(binding,cursor),
      projection_generation:binding.projection_generation,quality:{...quality(),coverage:"CURRENT_PAGE_ONLY"},
      next_action:"READ_NAMED_SNAPSHOT",reason_code:null});
    return {delivery_json:JSON.stringify(owner.nextNativeNoticeDelivery(stream)),
      replay_binding_json:JSON.stringify(binding),source_cursor:cursor,frame_json:JSON.stringify(frame)};
  }
  async function managerNotice(stream:ReturnType<CurrentHumanCandidate["openNativeNoticeStream"]>){
    const scope=await managerCurrent(),binding=await managerBinding();
    return scopes.prepareManagerNativeNotice(scope,codec,managerInput(stream,binding));
  }
  async function revokeDomain(action:"business.read_all"|"stream.subscribe"){
    const repo=new AccessRepository(pool),row=(await repo.storedGrants(workspace)).find(
      row=>row.kind==="MANAGER_DOMAIN"&&row.fact.action===action);
    if(!row||row.kind!=="MANAGER_DOMAIN")throw Error("TEST_ONLY_DOMAIN_GRANT_REQUIRED");
    await repo.saveManagerDomainGrant({...row.fact,revoked_at_ms:Date.now(),revision:"TEST_ONLY-revoked"},false);
  }

  it("Manager-only Notice uses no ROOT/publication/census and entity helpers reject its opaque scope",async()=>{
    await managerOnly();
    const scope=await managerCurrent();
    expect(Object.keys(scope)).toEqual([]);
    for(const read of [scopeResources,scopeTuples,scopeAllowsFullAccountingPopulation])
      expect(()=>read(scope as unknown as AuthorizedExecutionReadScope)).toThrow();
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await managerNotice(stream),view=nativeExecutionNoticeView(n);
      expect(view.manager).toMatchObject({domain,source_identity_digest:expect.stringMatching(/^sha256:/),
        read_scope_digest:expect.stringMatching(/^sha256:/)});
      const h=await candidate.acquireNativeFrame(stream,n);
      expect((await candidate.sendNativeFrame(h)).state).toBe("RECONCILED");
      await until(()=>body().length===view.payload.length);
      expect(body()).toEqual(view.payload);expect(await pending()).toBe(0);
      expect(candidate.nextNativeNoticeDelivery(stream).frame_ordinal).toBe("2");
      candidate.closeNativeNoticeStream(stream);
    });
    expect(TestOnlyReadTrust.prototype.relations).not.toHaveBeenCalled();
    expect(TestOnlyReadTrust.prototype.readPublication).not.toHaveBeenCalled();
  });
  it.each(["profile_id","catalogue_sha256","profile_sha256","field_policy_sha256","source_identity"] as const)(
    "Manager mismatched full selected %s denies before PM/admission/bytes",async(key)=>{
      await managerOnly();
      await exchange(async({response,body})=>{
        const otherPins={...selectedInput.pins,domain:{...selectedInput.pins.domain}};
        if(key==="source_identity")otherPins.source_fingerprint=raw("f");
        else otherPins.domain[key]=key==="profile_id"?"TEST_ONLY-wrong-profile":raw("d");
        const otherSource=new SelectedNativeBusinessReadSource({...selectedInput,pins:otherPins});
        const other=await CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:otherSource}),
          stream=other.openNativeNoticeStream(response);
        const scope=await managerCurrent(),binding=await managerBinding(),
          input=managerInput(stream,binding,"TEST_ONLY.manager1",other),n=await scopes.prepareManagerNativeNotice(scope,codec,input);
        await expect(other.acquireNativeFrame(stream,n)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_BINDING_INVALID"});
        expect(await rows()).toEqual([]);expect(calls).toEqual([]);expect(body()).toHaveLength(0);
        other.closeNativeNoticeStream(stream);
      });
    });
  it.each(["business.read_all","stream.subscribe"] as const)("Manager %s revoke after Notice denies before PM/bytes",async(action)=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await managerNotice(stream);
      await revokeDomain(action);
      await expect(candidate.acquireNativeFrame(stream,n)).rejects.toThrow();
      expect(await rows()).toEqual([]);expect(calls).toEqual([]);expect(body()).toHaveLength(0);
      candidate.closeNativeNoticeStream(stream);
    });
  });
  it.each(["business.read_all","stream.subscribe"] as const)("Manager %s revoke after ENTER waits for physical ABORTED before writer COMMIT",async(action)=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),h=await candidate.acquireNativeFrame(stream,await managerNotice(stream)),
        write=vi.spyOn(response,"write");
      const drain="TEST_ONLY-manager-revoke-"+action;
      expect((await candidate.beginDrain(drain)).status).toBe("DRAIN_PENDING");
      // Real writer fence forbids revocation COMMIT while the held source is
      // unresolved. Do not bypass this trigger to manufacture a revoke race.
      await expect(revokeDomain(action)).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
      await expect(candidate.sendNativeFrame(h)).rejects.toThrow();
      expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      expect(await frameRow()).toMatchObject({phase:"ABORTED",source_reconciled:true});
      expect(await pending()).toBe(0);blocked(stream);
      expect((await candidate.drainStatus(drain)).status).toBe("DRAIN_READY");
      await revokeDomain(action);
      const ready=await candidate.drainStatus(drain);
      await candidate.endDrain(drain,ready.authority_revision);
      await expect(managerCurrent()).rejects.toThrow();
    });
  });
  it("Manager cloned/proxied scope, Notice and accessor input deny without invoking traps",async()=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const scope=await managerCurrent(),binding=await managerBinding(),stream=candidate.openNativeNoticeStream(response);
      const input=managerInput(stream,binding);let traps=0;
      const proxy=new Proxy({}, {get(){traps++;throw Error("TEST_ONLY_PROXY");},getPrototypeOf(){traps++;throw Error("TEST_ONLY_PROXY");}});
      for(const fake of [{},proxy])await expect(scopes.prepareManagerNativeNotice(fake as typeof scope,codec,input)).rejects.toThrow();
      const accessor=Object.defineProperty({...input},"frame_json",{enumerable:true,get(){traps++;throw Error("TEST_ONLY_ACCESSOR");}});
      await expect(scopes.prepareManagerNativeNotice(scope,codec,accessor)).rejects.toThrow();
      const n=await managerNotice(stream);
      for(const fake of [{...n},proxy])await expect(candidate.acquireNativeFrame(stream,fake as typeof n)).rejects.toThrow();
      expect(traps).toBe(0);expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(body()).toHaveLength(0);
      candidate.closeNativeNoticeStream(stream);
    });
  });
  it("Manager SENDING COMMIT lost ACK closes actual reservation before zero-byte ABORTED",async()=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),h=await candidate.acquireNativeFrame(stream,await managerNotice(stream)),
        write=vi.spyOn(response,"write"),fault=sqlFault("SENDING_LOSS");
      await expect(candidate.sendNativeFrame(h)).rejects.toThrow("TEST_ONLY_SENDING_LOSS");
      expect(fault.used()).toBe(true);expect(write).not.toHaveBeenCalled();expect(body()).toHaveLength(0);
      expect(await frameRow()).toMatchObject({phase:"ABORTED",source_reconciled:true});
      expect(await pending()).toBe(0);blocked(stream);
    });
  });
  it("Manager SAME Hub two frames retain PM ACK and local COMMIT-release fence",async()=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const binding=await managerBinding(),reads:string[]=[];
      const source:ScopedNoticeSource={read:async(received,after)=>{
        expect(received).toEqual(binding);reads.push(after);
        const cursors=after==="TEST_ONLY.manager0"?["TEST_ONLY.manager1","TEST_ONLY.manager2"]:[];
        return {notices:cursors.map(resume_cursor=>({resume_cursor,projection_generation:binding.projection_generation,
          quality:{...quality(),coverage:"CURRENT_PAGE_ONLY"}})),next_cursor:"TEST_ONLY.manager2",caught_up:true};
      }};
      const hub=new ScopedReplayHub(source,codec,{maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:16384,
        maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:2,readTimeoutMs:2000},{candidate,scopes});
      await hub.subscribeNative({kind:"MANAGER",binding,response,current:managerCurrent,baselineCursor:"TEST_ONLY.manager0"});
      const fault=sqlFault("ACK_HOLD");holdResolve=deferred();resolveArrived=deferred();
      const polling=hub.poll();void polling.catch(()=>undefined);
      try{
        await bounded(resolveArrived.promise);await until(()=>receivedFrames(body()).length===1);
        expect(actionCount("issue")).toBe(1);expect(hub.diagnostics().queued_bytes).toBeGreaterThan(0);
        await hub.poll();expect(reads).toEqual(["TEST_ONLY.manager0"]);
        holdResolve.resolve(undefined);await bounded(fault.arrived);
        expect((await frameRow()).source_reconciled).toBe(true);expect(actionCount("issue")).toBe(1);
      }finally{holdResolve.resolve(undefined);fault.resume();}
      await bounded(polling);await until(()=>receivedFrames(body()).length===2);
      expect(receivedFrames(body()).map(frame=>codec.decode(frame.resume_cursor!,binding)))
        .toEqual(["TEST_ONLY.manager1","TEST_ONLY.manager2"]);
      expect(actionCount("issue")).toBe(2);expect(await pending()).toBe(0);
      expect(body().toString()).not.toContain("TEST_ONLY.manager");hub.stop();
    });
  });

  it.each(["matching","mismatch","raw64","legacy"] as const)(
    "Manager finite READ-only expected scope %s preserves admission compatibility",async(mode)=>{
      await managerOnly();await revokeDomain("stream.subscribe");
      await expect(managerCurrent()).rejects.toThrow();
      const d=await withTransaction(pool,db=>evaluateManagerDomainRead(db,{actor,workspace_id:workspace,environment:"paper",domain}));
      const binding={lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:config.issuer,subject:actor.user_id,
        workspace_id:workspace,environment:"paper" as const,workload_id:"TEST_ONLY-frame-pm",operation:"READ" as const},
        deadline=new Date(Math.floor((d.now_ms+20000)/1000)*1000).toISOString(),
        intent={schema_version:"pma.manager-read-intent.v1" as const,action:"catalogue" as const},
        requestDigest=accessDigest({binding,domain,deadline,manager_intent:intent}).slice(7),
        base={schema_version:"pma.native-business-read.request.v1",binding:{...binding,request_digest:requestDigest},
          domain,deadline,manager_intent:{...intent,digest:requestDigest}};
      const expected=mode==="legacy"?undefined:mode==="raw64"?d.scope_digest.slice(7):mode==="mismatch"?hash("0"):d.scope_digest;
      if(mode==="matching"||mode==="legacy"){
        const handle=await candidate.prepareNativeRead(actor,base,expected);
        expect(Object.keys(handle)).toEqual([]);
        expect(await rows()).toHaveLength(1);
        expect((await rows())[0]).toMatchObject({lifecycle_kind:"MANAGER_HTTP",scope_digest:d.scope_digest});
      }else{
        await expect(candidate.prepareNativeRead(actor,base,expected)).rejects.toThrow();
        expect(await rows()).toEqual([]);
      }
      expect(calls).toEqual([]);
    });

  it("Manager viewer context cannot reuse another viewer's opaque replay binding",async()=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const first=await managerCurrent(),other=await scopes.authorizeManagerNativeStream(
        {...principal,viewerWorkspaceId:"TEST_ONLY-independent-viewer"},
        {environment:"paper",profileId:domain.profile_id},config.selected_source);
      expect(scopeRealtimeIdentity(other)).not.toBe(scopeRealtimeIdentity(first));
      const stream=candidate.openNativeNoticeStream(response),input=managerInput(stream,await managerBinding());
      await expect(scopes.prepareManagerNativeNotice(other,codec,input)).rejects.toThrow();
      expect(nativeExecutionNoticeView(await scopes.prepareManagerNativeNotice(first,codec,input)).manager).toBeDefined();
      expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(body()).toHaveLength(0);
      candidate.closeNativeNoticeStream(stream);
    });
  });
  it("Manager session generation change after Notice denies admission and late bytes",async()=>{
    await managerOnly();
    await exchange(async({response,body})=>{
      const stream=candidate.openNativeNoticeStream(response),n=await managerNotice(stream);
      await pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1",[actor.user_id]);
      await expect(candidate.acquireNativeFrame(stream,n)).rejects.toThrow();
      expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(body()).toHaveLength(0);
      candidate.closeNativeNoticeStream(stream);
    });
  });

  async function secondManager(){
    const person={user_id:"TEST_ONLY-manager-second-person",session_id:"TEST_ONLY-manager-second-session"};
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) "+
      "VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)",[person.user_id]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) "+
      "VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')",
      [person.session_id,person.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'MEMBER')",[workspace,person.user_id]);
    const repo=new AccessRepository(pool);
    for(const row of await repo.storedGrants(workspace))if(row.kind==="MANAGER_DOMAIN")
      await repo.saveManagerDomainGrant({...row.fact,grant_id:row.fact.grant_id+"-second",subject_user_id:person.user_id},true);
    const tsUser="55555555-5555-5555-5555-555555555555",
      human={...selectedInput.pins.human,subject:person.user_id,portal_user_id:person.user_id,
        ts_user_id:tsUser,mapping_revision:"ts-user:"+tsUser+":1"};
    fixturePeople.set(person.user_id,{human,session_id:person.session_id});
    const selected=new SelectedNativeBusinessReadSource({...selectedInput,pins:{...selectedInput.pins,human,
      binding:{...selectedInput.pins.binding,subject:person.user_id}}});
    const other=await CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:selected}),
      user=await auth.users.findById(person.user_id),session=await new SessionsRepository(pool).findByTokenHash(person.session_id);
    if(!user||!session)throw Error("TEST_ONLY_REAL_SECOND_PERSON_REQUIRED");
    const p:ReadScopePrincipal={user,session,workspaceId:workspace,viewerWorkspaceId:workspace};
    return{candidate:other,current:()=>scopes.authorizeManagerNativeStream(p,
      {environment:"paper",profileId:domain.profile_id},selected)};
  }
  const managerLimits={maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:16384,
    maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:1,readTimeoutMs:2000};
  it.each(["COMPLETE","FAIL_BEFORE_SECOND_RELEASE"] as const)("two real disposable Manager people keep exact Candidates and joined cleanup: %s",async mode=>{
    await managerOnly();const other=await secondManager();
    let pollCompleted=false;
    const run=()=>exchange(async a=>exchange(async b=>{
      const first=await managerBinding(),second=await managerBinding(other.current),
        firstContext=managerNativeReplayContext(await managerCurrent()),secondContext=managerNativeReplayContext(await other.current());
      expect(firstContext.source_identity_digest).not.toBe(secondContext.source_identity_digest);
      const selected=new Map([[firstContext.source_identity_digest,candidate],[secondContext.source_identity_digest,other.candidate]]),
        lookups:string[]=[],releaseSecond=deferred(),source:ScopedNoticeSource={read:async(binding,after)=>{
          if(binding.principal_scope_digest===second.principal_scope_digest)await bounded(releaseSecond.promise);
          return{notices:[{resume_cursor:"TEST_ONLY.selected1",projection_generation:binding.projection_generation,
            quality:{...quality(),coverage:"CURRENT_PAGE_ONLY"}}],next_cursor:"TEST_ONLY.selected1",caught_up:true};
        }};
      const hub=new ScopedReplayHub(source,codec,managerLimits,{candidate,scopes,selectManagerCandidate:scope=>{
        const key=managerNativeReplayContext(scope).source_identity_digest;lookups.push(key);
        const result=selected.get(key);if(!result)throw Error("TEST_ONLY_NO_CONFIGURED_SELECTION");return result;
      }});
      let polling:Promise<void>|undefined,failure:unknown;
      try{
        await hub.subscribeNative({kind:"MANAGER",binding:first,response:a.response,current:managerCurrent,baselineCursor:"TEST_ONLY.selected0"});
        await hub.subscribeNative({kind:"MANAGER",binding:second,response:b.response,current:other.current,baselineCursor:"TEST_ONLY.selected0"});
        expect(hub.diagnostics()).toMatchObject({clients:2,pending_subscriptions:0});
        await expect(hub.subscribeNative({kind:"MANAGER",binding:first,response:a.response,current:managerCurrent,
          baselineCursor:"TEST_ONLY.selected0"})).rejects.toMatchObject({code:"RECONNECT_LIMIT"});
        // A later registry change must NEVER move an already-open stream to B.
        selected.set(firstContext.source_identity_digest,other.candidate);
        polling=hub.poll().finally(()=>{pollCompleted=true;});void polling.catch(()=>undefined);
        try{
          await until(()=>receivedFrames(a.body()).length===1&&actionCount("resolve")===1);
          await bounded((async()=>{while(await pending())await new Promise<void>(done=>setTimeout(done,5));})());
          if(mode==="FAIL_BEFORE_SECOND_RELEASE")throw Error("TEST_ONLY_FORCED_PRE_B_RELEASE_FAILURE");
        }finally{releaseSecond.resolve(undefined);}
        await bounded(polling);await until(()=>receivedFrames(b.body()).length===1);
        expect(lookups).toEqual([firstContext.source_identity_digest,secondContext.source_identity_digest]);
        expect(actionCount("issue")).toBe(2);expect(await pending()).toBe(0);
        for(const row of await rows())expect(row).toMatchObject({source_reconciled:true,phase:"SERVED"});
        expect(hub.diagnostics().queued_bytes).toBe(0);
        const subjects=(await rows()).map(row=>JSON.parse(row.base_body).binding.subject);
        expect(new Set(subjects)).toEqual(new Set([actor.user_id,"TEST_ONLY-manager-second-person"]));
      }catch(error){failure=error;throw error;}
      finally{
        releaseSecond.resolve(undefined);hub.stop();
        // Source gate is released and all production I/O remains bounded.
        // Join the ACTUAL promise before exchange/afterEach closes or drops
        // anything; a timer expiry/Hub.stop alone is never settlement.
        if(polling)try{await polling;}catch(error){if(failure===undefined)throw error;}
      }
    },20000),25000);
    if(mode==="FAIL_BEFORE_SECOND_RELEASE")await expect(run()).rejects.toThrow("TEST_ONLY_FORCED_PRE_B_RELEASE_FAILURE");
    else await run();
    expect(pollCompleted).toBe(true);expect(await pending()).toBe(0);
  },30000);
  it.each(["LOOKUP_FAILURE","SCOPE_MISMATCH"] as const)("Manager %s restores pending count before source/physical bytes",async mode=>{
    await managerOnly();await exchange(async({response,body})=>{
      const binding=await managerBinding(),source:ScopedNoticeSource={read:vi.fn(async()=>({notices:[],next_cursor:"TEST_ONLY.selected0",caught_up:true}))},
        select=vi.fn(()=>{throw Error("TEST_ONLY_MISSING_SELECTION");}),
        hub=new ScopedReplayHub(source,codec,managerLimits,{candidate,scopes,selectManagerCandidate:select});
      if(mode==="SCOPE_MISMATCH")binding.principal_scope_digest=hash("0");
      try{
        await expect(hub.subscribeNative({kind:"MANAGER",binding,response,current:managerCurrent,baselineCursor:"TEST_ONLY.selected0"})).rejects.toThrow();
        expect(hub.diagnostics()).toMatchObject({clients:0,pending_subscriptions:0,queued_bytes:0});
        expect(select).toHaveBeenCalledTimes(mode==="LOOKUP_FAILURE"?1:0);expect(source.read).not.toHaveBeenCalled();
        expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(body()).toHaveLength(0);expect(response.headersSent).toBe(false);
      }finally{hub.stop();}
    });
  });
  it("wrong genuine selected Candidate rejects Manager Notice before native issue or physical bytes",async()=>{
    await managerOnly();await exchange(async({response,body})=>{
      const wrongSource=new SelectedNativeBusinessReadSource({...selectedInput,pins:{...selectedInput.pins,source_fingerprint:raw("f")}}),
        wrong=await CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:wrongSource}),binding=await managerBinding(),
        source:ScopedNoticeSource={read:async()=>({notices:[{resume_cursor:"TEST_ONLY.selected1",
          projection_generation:binding.projection_generation,quality:{...quality(),coverage:"CURRENT_PAGE_ONLY"}}],
          next_cursor:"TEST_ONLY.selected1",caught_up:true})},
        hub=new ScopedReplayHub(source,codec,managerLimits,{candidate,scopes,selectManagerCandidate:()=>wrong});
      try{
        await hub.subscribeNative({kind:"MANAGER",binding,response,current:managerCurrent,baselineCursor:"TEST_ONLY.selected0"});
        await hub.poll();expect(hub.diagnostics()).toMatchObject({clients:0,pending_subscriptions:0,queued_bytes:0});
        expect(calls).toEqual([]);expect(await rows()).toEqual([]);expect(body()).toHaveLength(0);
      }finally{hub.stop();}
    });
  });

});
