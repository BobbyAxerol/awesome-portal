/** Real disposable PG + real loopback mTLS/HTTP. Source relation payloads are
 * SYNTHETIC component vectors, never a native-source commissioning receipt. */
import {createHash,generateKeyPairSync,randomUUID,X509Certificate} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {createServer,request,type ServerResponse} from "node:http";
import {createServer as createTlsServer,request as tlsRequest} from "node:https";
import type {Socket} from "node:net";
import type {Duplex} from "node:stream";
import {generateKeyPair,jwtVerify} from "jose";
import {Pool} from "pg";
import fastify from "fastify";
import type {ExecutionContext} from "@nestjs/common";
import {afterAll,afterEach,beforeAll,describe,expect,it} from "vitest";
import {AuthService} from "../src/auth/auth.service";
import {OwnerAccessRepository} from "../src/repos/owner-access";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import {accessDigest} from "../src/execution-v2/access-digest";
import {evaluateBusinessRead} from "../src/execution-v2/access-policy";
import {grantBindingDigest,type CurrentAccessRelations} from "../src/execution-v2/access-current-relations";
import type {AccessAction} from "../src/execution-v2/access.contract";
import type {NativeCurrentRelationsSourceBase} from "../src/execution-v2/native-current-relations-codec";
import type {NativeCurrentRelationsPurpose} from "../src/execution-v2/native-current-relations-port";
import {unqualifiedAccessTrust,type ReviewedPolicyArtifact} from "../src/execution-v2/access-trust";
import {NativeReadEgress} from "../src/execution-v2/native-read-egress";
import {CurrentHumanCandidate} from "../src/execution-v2/current-human-candidate";
import {CurrentHumanMutations} from "../src/execution-v2/current-human-mutations";
import {NativeCurrentRelationsProvider,type NativeCurrentRelationsProviderConfig} from "../src/execution-v2/native-current-relations-provider";
import {CurrentViewCoreComposition,type CurrentViewCompositionConfig} from "../src/execution-v2/current-view-composition";
import {ExecutionReadScopes,type ReadScopePrincipal} from "../src/execution-v2/read-scope";
import {ManagerCurrentAccounts} from "../src/execution-v2/manager-current-accounts";
import {ApprovalEvidenceNativeDelivery,type ApprovalEvidenceNativePlan} from "../src/approval-evidence/approval-evidence-native-delivery";
import type {CurrentViewSelection} from "../src/execution-v2/current-view-authority";
import {SiblingSourceDarkController} from "../src/execution-v2/sibling-source-dark.controller";
import {SiblingNativeDelivery,type SiblingNativePlan} from "../src/execution-v2/sibling-native-delivery";
import {SiblingPageCursorCodec} from "../src/execution-v2/sibling-page-cursor";
import {WorkspacesRepository} from "../src/repos/workspaces";
import {SessionGuard} from "../src/facade/session.guard";
import {SESSION_COOKIE} from "../src/auth/cookies";
import {loadManagerCurrentCommissioning,managerCurrentMetadataDigest,withManagerCurrentPublications,type ManagerCurrentMetadata} from "../src/execution-v2/manager-current-publication";
import {loadPublicationCommissioning,withCataloguePublications} from "../src/execution-v2/publication-adapter";
import {ExecutionManagerRuntime} from "../src/execution-v2/manager-runtime";
import {EXECUTION_PUBLICATION_CATALOGUE} from "../src/execution-v2/publication-source.generated";
import {setupApp,teardownApp,migrateTestDatabase} from "./harness";
import {rootWireFacts} from "./fixtures/elp210-native-root-wire";
import {currentRelationsWireReply} from "./fixtures/elp210-native-current-relations-wire";
import {currentRelationsTestEndpoint} from "./fixtures/elp210-native-current-relations-server";
import {commonName,testCertificate,type TestAuthority} from "./fixtures/elp210-test-certificates";

const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("ordinary native CURRENT actual custody/finite egress, TEST_ONLY PG",()=>{
 let ctx:Awaited<ReturnType<typeof setupApp>>,pool:Pool,owner:string;
 const endpoints:Array<Awaited<ReturnType<typeof currentRelationsTestEndpoint>>>=[];
 beforeAll(async()=>{await migrateTestDatabase(url!);ctx=await setupApp({DATABASE_URL:url!});
  pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:2000,query_timeout:6000});owner=`TEST_ONLY-current-owner-${randomUUID()}`;
  await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES($1,$1,$1,'USER','ACTIVE',false)",[owner]);
  await new OwnerAccessRepository(pool).claimOwner({userId:owner,claimedBy:"TEST_ONLY_CURRENT_COMPONENT"});});
 afterEach(async()=>{for(const endpoint of endpoints.splice(0))await endpoint.close();
  if(pool){await pool.query("TRUNCATE portal_native_current_read_obligations");await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");}});
 afterAll(async()=>{if(pool)await pool.end();if(ctx)await teardownApp(ctx);});
 async function fixture(futureTransition=false,options:{actions?:AccessAction[];maximum_unresolved?:number;policyFields?:string[];
  relationsForPurpose?:(purpose:NativeCurrentRelationsSourceBase["purpose"],relations:CurrentAccessRelations)=>CurrentAccessRelations}={}){
  await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
  const id=randomUUID(),now=Date.now(),workspace=`TEST_ONLY-current-${id}`,session=`TEST_ONLY-current-session-${id}`;
  await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY Current',$2)",[workspace,owner]);
  const generation=Number((await pool.query("SELECT session_version FROM portal_users WHERE user_id=$1",[owner])).rows[0].session_version);
  await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
   VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',$3,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[session,owner,generation]);
  const actor={user_id:owner,session_id:session,session_generation:generation},facts=rootWireFacts(now),policy={workspace_id:workspace,
   revision:`TEST_ONLY-policy-${id}`,artifact_digest:accessDigest(id),approval_ref:"TEST_ONLY-owner-reviewed",state:"REVIEWED" as const,
   qualification:"TEST_ONLY" as const,protected_owner_user_id:owner,researcher_fields:{state:"QUALIFIED" as const,policy_ref:"TEST_ONLY-fields",fields:options.policyFields??["portfolio_id"]}},
   grant={...facts.grant,grant_id:`TEST_ONLY-current-grant-${id}`,subject_user_id:owner,issued_by:owner,workspace_id:workspace,policy_revision:policy.revision};
  const futureDeny={...grant,grant_id:`TEST_ONLY-future-deny-${id}`,effect:"DENY" as const,requires_ts_acceptance:false,
   valid_from_ms:now+1200,valid_until_ms:now+600000};
  const artifact:ReviewedPolicyArtifact={policy,root_grants:futureTransition?[grant,futureDeny]:[grant],provenance_ref:"TEST_ONLY-component"},baseTrust={...unqualifiedAccessTrust,
   verifyPolicy:async(input:unknown)=>input===artifact?artifact:null};
  await new ExecutionAccessService(pool,ctx.app.get(AuthService),baseTrust,true).installReviewedPolicy(artifact);
  const fact={...facts.fact,portal_user_id:owner,human_requester_user_id:owner,workspace_id:workspace,grant_id:grant.grant_id,
   policy_revision:policy.revision,grant_digest:accessDigest(grant),policy_artifact_digest:policy.artifact_digest,
   policy_install_digest:accessDigest(artifact),approval_ref:policy.approval_ref},relations={...facts.relations,subject_user_id:owner,workspace_id:workspace,
    grants:[{...facts.relations.grants[0],grant_id:grant.grant_id,binding_digest:grantBindingDigest(grant),accepted:fact}]};
  const terminal=generateKeyPairSync("ed25519"),states=new Map<string,string>(),terminals:Array<Record<string,unknown>>=[];
  let loseIssue=false,loseResolve=0,loseEnterBefore=false,loseCancel=false,onIssue:(()=>Promise<void>)|undefined;
  const endpoint=await currentRelationsTestEndpoint(async(base,action,res,body)=>{
   // Pool1 proves no source network wait retains Core's client.
   expect((await pool.query("SELECT 1 AS n")).rows[0].n).toBe(1);
   const lease=base.binding.lease_id,reply=currentRelationsWireReply(base,action,
    options.relationsForPurpose?.(base.purpose,relations)??relations),state=states.get(lease);
   if(action==="issue"){expect(state).toBeUndefined();states.set(lease,"ISSUED");if(onIssue)await onIssue();if(loseIssue){loseIssue=false;res.destroy();}}
   else if(action==="enter"){expect(state).toBe("ISSUED");if(loseEnterBefore){loseEnterBefore=false;res.destroy();return null;}states.set(lease,"ENTERED");}
   else if(action==="unknown"){expect(["ENTERED","UNKNOWN"]).toContain(state);states.set(lease,"UNKNOWN");}
   else if(action==="cancel-unentered"){expect([undefined,"ISSUED","CANCELLED"]).toContain(state);states.set(lease,"CANCELLED");if(loseCancel){loseCancel=false;res.destroy();}}
   else if(action==="status")return state==="CANCELLED"?{...reply,recovery:{state:"RECORDED",phase:"CANCELLED",terminal_authority:false,release_permitted:false}}:
    {...reply,recovery:{state:"RECORDED",phase:state,source_digest:"c".repeat(64),expires_at:base.deadline,terminal_authority:false,release_permitted:false}};
   else if(action==="resolve"){
    const claims=(await jwtVerify(String(body.signed_terminal),terminal.publicKey,{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-pm-terminal",algorithms:["EdDSA"]})).payload;
    expect(claims).toMatchObject({purpose:"pma.native-business-to-core-terminal.v1",operation:"READ",lease_id:lease,
     attempt_id:base.binding.attempt_id,binding_digest:accessDigest(base.binding).slice(7),source_digest:"c".repeat(64)});
    expect(["SERVED","ABORTED"]).toContain(claims.phase);expect(claims.evidence_kind).toBe(claims.phase==="SERVED"?"FINAL_HTTP_SEND_COMPLETED":"FINAL_HTTP_ABORT_CONFIRMED");
    terminals.push({...claims});states.set(lease,String(claims.phase));if(loseResolve>0){loseResolve--;res.destroy();}
    return{...reply,recovery:{state:"SETTLED",phase:claims.phase,terminal_authority:true,release_permitted:true}};
   }return reply;
  });endpoints.push(endpoint);
  const config:NativeCurrentRelationsProviderConfig={bindings:[{actor_id:owner,principal_id:owner,
   source:{human_issuer:"TEST_ONLY-core",subject:"TEST_ONLY-independent-native-human",workspace_id:workspace,environment:"paper",workload_id:"TEST_ONLY-native-current"},
   registration:{correspondence_id:`TEST_ONLY-correspondence-${id}`,expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
   original:{grant_id:grant.grant_id,accepted_fact_digest:accessDigest(fact)},correspondence:{registry_revision:accessDigest("TEST_ONLY-registry"),payload_sha256:"b".repeat(64),approval_ref:"TEST_ONLY-independent-review"},
   allowed_actions:options.actions??["access.read","portfolio.read"]}],maximum_retained:128,
   maximum_unresolved:options.maximum_unresolved??8,maximum_recoveries:8,maximum_principals:Math.min(8,options.maximum_unresolved??8),attempt_ms:30000,
   terminal:{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-pm-terminal",key_id:"TEST_ONLY-terminal",private_key:terminal.privateKey,ttl_seconds:30}};
  const egress=new NativeReadEgress({maximum_response_bytes:65536,maximum_inflight:2,send_timeout_ms:5000,quiesce_timeout_ms:50}),
   provider=new NativeCurrentRelationsProvider(pool,endpoint.client,egress,config),access=new ExecutionAccessService(pool,ctx.app.get(AuthService),provider.compose(baseTrust),true),
   observe=()=>provider.observe({actor,workspace_id:workspace,principal_ids:[owner],action:"access.read",resource_digest:accessDigest({kind:"CURRENT_POLICY_CONTEXT"})}),
   rows=async()=> (await pool.query("SELECT * FROM portal_native_current_read_obligations WHERE source_config_digest=$1 ORDER BY created_at,lease_id",[provider.source_config_digest])).rows;
  return{provider,config,actor,workspace,access,baseTrust,observe,rows,endpoint,terminals,relations,states,fact,
   loseIssue(){loseIssue=true;},loseResolve(count=1){loseResolve=count;},loseEnterBefore(){loseEnterBefore=true;},loseCancel(){loseCancel=true;},onIssue(callback:()=>Promise<void>){onIssue=callback;}};
 }
 async function http(operation:(res:ServerResponse)=>Promise<void>){
  let finish!:(result:{error?:unknown})=>void;const completion=new Promise<{error?:unknown}>(resolve=>{finish=resolve;}),sockets=new Set<Socket>();
  const server=createServer((_req,res)=>{res.on("error",()=>{});void operation(res).then(()=>finish({}),error=>{res.destroy();finish({error});});});
  server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const addr=server.address();if(!addr||typeof addr==="string")throw Error("TEST_ONLY_HTTP");
  const received=new Promise<{body:Buffer;complete:boolean}>(resolve=>{const req=request(`http://127.0.0.1:${addr.port}/`,{method:"GET",agent:false},res=>{
   const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("error",()=>resolve({body:Buffer.concat(chunks),complete:false}));
   res.once("end",()=>resolve({body:Buffer.concat(chunks),complete:res.complete}));res.once("aborted",()=>resolve({body:Buffer.concat(chunks),complete:false}));});
   req.on("error",()=>resolve({body:Buffer.alloc(0),complete:false}));req.end();});
  try{return{completion:await completion,received:await received};}finally{for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 }
 it("public153 default remains functional with no private candidate; no authority is seeded",async()=>{
  expect((await pool.query("SELECT to_regclass('elp210_candidate.authority') AS r")).rows[0].r).toBeNull();
  await expect(pool.query("UPDATE portal_users SET display_name=display_name WHERE user_id=$1",[owner])).resolves.toBeDefined();
  await expect(pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1",[owner])).resolves.toBeDefined();
  expect((await pool.query("SELECT count(*)::int AS n FROM portal_native_current_read_obligations")).rows[0].n).toBe(0);
 });
 it("advisory current READ uses actual native subject, cancels unentered, never borrows ROOT/STREAM or mutation",async()=>{
  const f=await fixture(),context=await f.access.readContext(f.actor,f.workspace);
  expect(context.relationsFor(owner).current_authority).toEqual(f.relations);
  expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);expect(f.terminals).toEqual([]);
  expect((await f.rows())[0]).toMatchObject({phase:"CANCELLED",source_settled:true});
  const count=f.endpoint.requests.length;
  await expect(f.provider.observe({actor:f.actor,workspace_id:f.workspace,principal_ids:["TEST_ONLY-other-issuer"],action:"access.read",resource_digest:accessDigest("TEST_ONLY")})).rejects.toMatchObject({code:"NATIVE_CURRENT_NOT_QUALIFIED"});
  expect(f.endpoint.requests).toHaveLength(count);
 });
 it("real finite HTTP commits SENDING before bytes and durable actual SERVED before same-original native ACK",async()=>{
  const f=await fixture(),result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,
   build:async context=>{expect(context.relationsFor(owner).current_authority).toEqual(f.relations);return Buffer.from('{"TEST_ONLY":"native-current"}');},
   assertAllowed:context=>{expect(context.actor_current).toBe(true);expect(context.principal_id).toBe(owner);}}));
  expect(result.completion.error).toBeUndefined();expect(result.received).toEqual({body:Buffer.from('{"TEST_ONLY":"native-current"}'),complete:true});
  const row=(await f.rows())[0];expect(row).toMatchObject({phase:"SERVED",source_settled:true});expect(row.terminal_fact.observation.outcome).toBe("FINISHED");
  expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","enter","status","resolve"]);expect(f.terminals[0].phase).toBe("SERVED");
  await expect(pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1",[owner])).resolves.toBeDefined();
 });
 it("joins Account profile, current field authority, mTLS and native PG custody to a physical HTTP send",async()=>{
  // The only doubles are the isolated native/Edge sources and their authority
  // fixtures. This is NOT a receipt from the deployed Edge or a real grant.
  const f=await fixture(false,{actions:["access.read","business.read_all"],policyFields:["portfolio_id","reconciliation_run_id","obligation_id"]}),now=Date.now();
  const account=`TEST_ONLY-account-${randomUUID()}`,entity=`TEST_ONLY-entity-${randomUUID()}`;
  const resource={kind:"ACCOUNT" as const,id:account},root=f.relations.resources[0]!.roots[0]!;
  root.resources.push(resource);
  const target=f.relations.grants[0]!.targets[0]!;
  f.relations.grants[0]!.targets.push({...target,resource,native_reference_digest:accessDigest(["TEST_ONLY",resource])});
  // Install the explicitly synthetic receipt through the same Core intake as a
  // real original; never update the grant directly or bypass authorization.
  const input=Object.freeze({TEST_ONLY_root_receipt:randomUUID()}),fact=f.fact;
  const intake=new ExecutionAccessService(pool,ctx.app.get(AuthService),{...f.baseTrust,
   verifyRootReceipt:async(candidate:unknown)=>candidate===input?{fact,
    mapping:{ts_user_id:fact.ts_user_id,revision:fact.mapping_revision},
    membership:{receipt_id:fact.receipt_id,revision:fact.membership_revision,mapping_revision:fact.mapping_revision},
    current_authority:f.relations,assertCurrent:()=>{if(Date.now()>=fact.expires_at_ms!)throw Error("TEST_ONLY_ROOT_RECEIPT_EXPIRED");},
    release:async()=>{}}:null},true);
  expect((await intake.acceptRootTsReceipt(input)).receipt.outcome).toBe("TS_APPLIED");
  const binding={dataset_id:"manager-current:ACCOUNT",source_revision:"TEST_ONLY-cycle",projection_generation:"TEST_ONLY-generation",
   catalogue_revision:"TEST_ONLY-catalogue",window:null};
  const rowDigest=accessDigest("TEST_ONLY-committed-entity");
  const metadata:ManagerCurrentMetadata={schema_version:"portal.execution.manager-current-metadata.v1",
   scope:{workspace_id:f.workspace,environment:"paper",profile_id:"TEST_ONLY-profile"},binding,
   source_workspace_id:"TEST_ONLY-source-workspace",adapter_revision:"TEST_ONLY-adapter",publication_revision:"TEST_ONLY-publication",
   state:"ACTIVE",issued_at_ms:now-1000,expires_at_ms:now+60000,source_read_at_ms:now-1000,observed_at_ms:now-500,
   receipt_pins:{source_read:"TEST_ONLY-read",transport_trust:"TEST_ONLY-transport",privacy:"TEST_ONLY-privacy",field_policy:"TEST_ONLY-fields"},
   grains:[{grain:"manager.account",source_fields:["account_id"],fields:["account_id"],
    selections:[{resource_ref:"accounts",resource,entity_ids:[entity]}],entities:[{entity_id:entity,account_id:account,payload_digest:rowDigest}]},
    {grain:"relation.account_balances",source_fields:["account_id"],fields:["account_id"],selections:[],entities:[]},
    {grain:"relation.account_policies",source_fields:["account_id"],fields:["account_id"],selections:[],entities:[]}]};
  const artifact=JSON.stringify({schema_version:"portal.execution.manager-current-commissioning.v1",scope:metadata.scope,binding,
   source_workspace_id:metadata.source_workspace_id,adapter_revision:metadata.adapter_revision,
   source_metadata_digest:managerCurrentMetadataDigest(metadata),receipt_pins:metadata.receipt_pins});
  const commissioning=loadManagerCurrentCommissioning(artifact,{artifact_sha256:`sha256:${createHash("sha256").update(artifact).digest("hex")}`,
   approval_ref:"TEST_ONLY-approval",approved_at_ms:now-2000,valid_until_ms:now+60000},now);
  // Exercise the real installed Manager runtime delegate as AppModule does,
  // before the catalogue and Manager CURRENT publication decorators.
  const publicationArtifact=JSON.stringify({schema_version:"portal.execution.publication-commissioning.v1",scope:metadata.scope,
   catalogue_digest:EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,adapter_id:"TEST_ONLY-manager-adapter",
   family_ids:["alpha_fleet_overview"],purposes:["BUSINESS"],receipt_pins:{source_read:"TEST_ONLY-read",
    transport_trust:"TEST_ONLY-transport",privacy:"TEST_ONLY-privacy",field_policy:"TEST_ONLY-fields"}});
  const publicationCommissioning=loadPublicationCommissioning(publicationArtifact,{artifact_sha256:`sha256:${createHash("sha256").update(publicationArtifact).digest("hex")}`,
   adapter_id:"TEST_ONLY-manager-adapter",approval_ref:"TEST_ONLY-not-owner-approval",approved_at_ms:now-1000,valid_until_ms:now+60000},now);
  const nativeTrust=f.provider.compose(f.baseTrust),managerRuntime=new ExecutionManagerRuntime(pool,{trust:nativeTrust,cadence_ms:1000,
   maximum_publication_reads:1,partitions:[{scope:metadata.scope,commissioning:publicationCommissioning,source:{} as never,
    publication:async()=>null,bounds:{maximum_documents_per_tick:1,maximum_document_bytes:1048576,maximum_document_rows:200,
     maximum_tick_ms:5000,source_timeout_ms:1000,transaction_timeout_ms:1000,lease_ttl_ms:2000}}]});
  const source=async()=>structuredClone(metadata),auth=ctx.app.get(AuthService),catalogue=withCataloguePublications(
   managerRuntime.accessTrust(nativeTrust)!,async()=>null,{purpose:"BUSINESS"}),trust=withManagerCurrentPublications(catalogue,source,{commissioning});
  const access=new ExecutionAccessService(pool,auth,trust,true),scopes=new ExecutionReadScopes(pool,access,ctx.config);
  const user=(await pool.query("SELECT * FROM portal_users WHERE user_id=$1",[owner])).rows[0],session=(await pool.query(
   "SELECT * FROM auth_sessions WHERE session_id=$1",[f.actor.session_id])).rows[0];
  const principal:ReadScopePrincipal={workspaceId:f.workspace,viewerWorkspaceId:f.workspace,
   user:{userId:user.user_id,username:user.username,displayName:user.display_name,role:user.role,status:user.status,
    mustChangePassword:user.must_change_password,failedLoginCount:user.failed_login_count,lockedUntil:user.locked_until,
    sessionVersion:user.session_version,createdAt:user.created_at,updatedAt:user.updated_at,disabledAt:user.disabled_at,
    accountRevision:user.account_revision,archivedAt:user.archived_at},
   session:{sessionId:session.session_id,userId:session.user_id,state:session.state,sessionVersion:session.session_version,
    authenticationTime:session.created_at,idleExpiresAt:session.idle_expires_at,absoluteExpiresAt:session.absolute_expires_at}};
  const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY-ca"),ca:TestAuthority={key:keys.privateKey,name,
   certificate:testCertificate(name,keys,{name,key:keys.privateKey},true)};
  const identity=(label:string)=>{const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),cert=testCertificate(commonName(label),pair,ca,false);
   return{key:Buffer.from(pair.privateKey.export({type:"pkcs8",format:"pem"})),cert,ca:ca.certificate,
    pin:`sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}`};};
  const core=identity("TEST_ONLY-core"),edge=identity("TEST_ONLY-edge"),sockets=new Set<Duplex>();
  let origin="",hits=0;
  const server=createTlsServer({...edge,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
   hits++;const context=req.headers.authorization?.slice(7),body=JSON.stringify({schema_version:"portal.execution.current-view-resolve.v1",
    original_context:context,workload_id:"TEST_ONLY-workload",operation:"CURRENT",resource_ref:"accounts"});
   const upstream=tlsRequest(`${origin}/internal/elp210/current-view/resolve`,{...edge,method:"POST",agent:false,rejectUnauthorized:true,
    minVersion:"TLSv1.3",maxVersion:"TLSv1.3",headers:{"content-type":"application/json","content-length":Buffer.byteLength(body)}},reply=>{
    reply.resume();reply.once("end",()=>{if(reply.statusCode!==200){res.writeHead(403);res.end();return;}
     const page=JSON.stringify({schema_version:"portal.execution.manager-current.v1",projection_generation:binding.projection_generation,
      source_continuity_epoch:binding.source_revision,source_read_at_ms:metadata.source_read_at_ms,produced_at_ms:now,
      availability:"AVAILABLE",source_basis:"MANAGER_COMMITTED_POLL_BOUNDED_SNAPSHOT",history_capability:"UNAVAILABLE",
      coverage:"CURRENT_PAGE_ONLY",count_status:"COMPLETE_AUTHORIZED_SELECTION",rows:[{entity_id:entity,revision:rowDigest,
       payload:{account_id:{kind:"TEXT",value:account}}}],next_cursor:null,resume_cursor:null});
     res.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(page),connection:"close"});res.end(page);});});
   upstream.on("error",()=>{res.writeHead(503);res.end();});upstream.end(body);
  });
  server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();
  if(!address||typeof address==="string")throw Error("TEST_ONLY_TLS_ADDRESS");
  const config:CurrentViewCompositionConfig={authority:{ttl_ms:30000,maximum_contexts:8},shutdown_deadline_ms:2000,
   transport:{tls:core,peer:{certificate_sha256:edge.pin,dns_name:"localhost",workload_id:"TEST_ONLY-workload"},
    limits:{maximum_in_flight:2,request_bytes:8192,response_bytes:65536,deadline_ms:2000}},
   edge:{origin:`https://127.0.0.1:${address.port}`,tls:core,peer:{certificate_sha256:edge.pin,dns_name:"localhost"},
    limits:{maximum_in_flight:2,deadline_ms:2000,response_bytes:8192}}};
  const composition=new CurrentViewCoreComposition(auth,scopes,config);
  try{
   const listening=await composition.start({host:"127.0.0.1",port:0});origin=`https://127.0.0.1:${listening.port}`;
   const service=new ManagerCurrentAccounts({request:{...metadata.scope,binding},commissioning,source,core:composition});
   const actualContext=await access.readContext(f.actor,f.workspace);
   expect(evaluateBusinessRead(actualContext,"business.read_all",resource,"paper")).toMatchObject({allowed:true});
   const result=await http(res=>service.readNativeProfile(principal,account,"paper",res,()=>undefined));
   if(result.completion.error)throw result.completion.error;
   expect(result.completion.error).toBeUndefined();expect(result.received.complete).toBe(true);
   expect(JSON.parse(result.received.body.toString())).toMatchObject({schema_version:"portal.execution.account-profile.v1",account_id:account,workspace_id:f.workspace});
   expect(hits).toBe(1);const obligations=await f.rows();expect(obligations.length).toBeGreaterThan(0);
   expect(obligations.some(row=>row.phase==="SERVED"&&row.source_settled)).toBe(true);
   expect(obligations.every(row=>row.source_settled)).toBe(true);
   // The successful identity-only response must not become a workspace-wide
   // or account enumeration grant; neither denial may contact the data source.
   const wrongWorkspace=await http(res=>service.readNativeProfile({...principal,workspaceId:"TEST_ONLY-other-workspace"},account,"paper",res,()=>undefined));
   expect(wrongWorkspace.completion.error).toMatchObject({status:404});
   expect(wrongWorkspace.received.body).toHaveLength(0);
   const wrongAccount=await http(res=>service.readNativeProfile(principal,"TEST_ONLY-other-account","paper",res,()=>undefined));
   expect(wrongAccount.completion.error).toMatchObject({status:404});
   expect(wrongAccount.received.body).toHaveLength(0);expect(hits).toBe(1);
   // Exercise actual SessionGuard and Fastify reply/hijack with a synthetic
   // cookie whose hash and membership are stored in this disposable database.
   // Only the upstream original and field publication remain synthetic.
   await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')",[f.workspace,owner]);
   await pool.query("UPDATE auth_sessions SET session_token_hash=$2 WHERE session_id=$1",
    [f.actor.session_id,createHash("sha256").update(f.actor.session_id).digest("hex")]);
   const web=fastify({logger:false});
   const routeConfig={...ctx.config,EXECUTION_READ_PROFILE:"native_manager_review_v1" as const,
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:f.workspace},workspaces=new WorkspacesRepository(pool,routeConfig);
   const controller=new SiblingSourceDarkController(workspaces,service);
   const guard=new SessionGuard(auth,workspaces,routeConfig,undefined,undefined,undefined,service);
   let finishRoute!:()=>void;const routeFinished=new Promise<void>(resolve=>{finishRoute=resolve;});
   web.get("/api/v1/execution/accounts/:account_id/profile",async(req,reply)=>{
    try{
     Object.assign(req,{cookies:{[SESSION_COOKIE]:f.actor.session_id}});
     await guard.canActivate({switchToHttp:()=>({getRequest:()=>req,getResponse:()=>reply})} as ExecutionContext);
     return await controller.account(req as never,account,req.query,reply);
    }finally{finishRoute();}
   });
   try{
    await web.listen({host:"127.0.0.1",port:0});
    const address=web.server.address();if(!address||typeof address==="string")throw Error("TEST_ONLY_FASTIFY_ADDRESS");
    const response=await new Promise<{status:number|undefined;body:Buffer}>((resolve,reject)=>{
     const req=request(`http://127.0.0.1:${address.port}/api/v1/execution/accounts/${account}/profile?environment=paper&workspace_id=${encodeURIComponent(f.workspace)}`,{agent:false},res=>{
      const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("error",reject);
      res.on("end",()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));});req.on("error",reject);req.end();});
    expect(response.status).toBe(200);expect(JSON.parse(response.body.toString())).toMatchObject({account_id:account,workspace_id:f.workspace});
    expect(hits).toBe(2);await routeFinished;
    const afterRoute=await f.rows();expect(afterRoute.filter(row=>row.phase==="SERVED"&&row.source_settled)).toHaveLength(2);
    expect(afterRoute.every(row=>row.source_settled)).toBe(true);
   }finally{await web.close();}
   // Exercise two Approval sections from ONE selected source read while the
   // actual native lease is held through HTTP dispatch. The source facts,
   // section mapping and qualifier are deliberately synthetic, not a real
   // Approval field-policy or connected Edge qualification.
   const selection:CurrentViewSelection={resource_ref:"accounts",binding:{environment:"paper",profileId:metadata.scope.profile_id},
    read_requirement:{action:"business.read_all",resource,dataset:structuredClone(binding),requireWholePopulation:true},fields:["account_id"]};
   const paths=["receipt_preview.what_changes","receipt_preview.counts_as.met_after","receipt_preview.counts_as.required",
    "obligations_after_approval.open_positions","obligations_after_approval.working_orders","obligations_after_approval.reservations",
    "obligations_after_approval.unknown_outcomes","obligations_after_approval.settlement_pending"];
   const proofs=Object.fromEntries(paths.map(path=>[path,{selection:0,field:"account_id",detail:false}]));
   const fieldPolicy=(prefix:string)=>Object.fromEntries(paths.filter(path=>path.startsWith(prefix)).map(path=>[path,{field:"account_id",detail:false}]));
   let revoked=false;
   const qualifier={prepare:async(scope:ApprovalEvidenceNativePlan["scope"]):Promise<ApprovalEvidenceNativePlan>=>({scope,selections:[selection],
    sections:["receipt_preview","obligations_after_approval"],fieldProofs:proofs,read:async read=>{
     const result=await read({authority:selection,resource:"accounts",query:{limit:1,max_bytes:8192,entity_id:entity}});
     const page=JSON.parse(result.body.toString());const count=page.rows.length;
     return{identity:{workspaceId:scope.workspaceId,approvalId:scope.approvalId},sections:{
      receipt_preview:{what_changes:page.rows[0].payload.account_id.value,counts_as:{met_after:count,required:count}},
      obligations_after_approval:{open_positions:count,working_orders:count,reservations:count,unknown_outcomes:count,settlement_pending:count}}};
    }}),revalidate:async()=>{},revalidateBeforeDispatch:()=>{if(revoked)throw Error("TEST_ONLY_APPROVAL_REVOKED");}};
   const approval=new ApprovalEvidenceNativeDelivery(composition,qualifier,{visible:async()=>true},
    {receipt_preview:fieldPolicy("receipt_preview."),obligations_after_approval:fieldPolicy("obligations_after_approval.")});
   const beforeApproval=await f.rows(),sourceHits=hits;
   const delivered=await http(res=>approval.deliver(principal,"TEST_ONLY-approval",{workspace_id:f.workspace},res,()=>{}));
   if(delivered.completion.error)throw delivered.completion.error;
   const body=JSON.parse(delivered.received.body.toString());
   expect(delivered.received.complete).toBe(true);expect(body.receipt_preview.what_changes).toBe(account);
   expect(body.obligations_after_approval.open_positions).toBe(1);expect(hits-sourceHits).toBe(1);
   const afterApproval=await f.rows();
   expect(afterApproval.filter(row=>row.phase==="SERVED"&&row.source_settled)).toHaveLength(
    beforeApproval.filter(row=>row.phase==="SERVED"&&row.source_settled).length+1);
   expect(afterApproval.every(row=>row.source_settled)).toBe(true);
   revoked=true;
   const denied=await http(res=>approval.deliver(principal,"TEST_ONLY-approval",{workspace_id:f.workspace},res,()=>{}));
   expect(denied.received.body).toHaveLength(0);
   const afterRevoke=await f.rows();
   expect(afterRevoke.filter(row=>row.phase==="SERVED")).toHaveLength(afterApproval.filter(row=>row.phase==="SERVED").length);
   expect(afterRevoke.filter(row=>row.phase==="ABORTED"&&row.source_settled)).toHaveLength(
    afterApproval.filter(row=>row.phase==="ABORTED"&&row.source_settled).length+1);
   // Drop the terminal response after the synthetic source records it. A new
   // provider instance must recover the persisted original, not issue a new
   // lease or send the Approval body a second time. This simulates a restart
   // of the provider instance; it is not an OS/process or real Edge receipt.
   revoked=false;f.loseResolve(2);
   const lostAck=await http(res=>approval.deliver(principal,"TEST_ONLY-approval",{workspace_id:f.workspace},res,()=>{}));
   expect(lostAck.received.complete).toBe(true);expect(JSON.parse(lostAck.received.body.toString()).receipt_preview.what_changes).toBe(account);
   const beforeRecovery=await f.rows(),issuedBefore=f.endpoint.requests.filter(request=>request.action==="issue").length;
   expect(beforeRecovery.some(row=>row.phase==="SERVED"&&!row.source_settled)).toBe(true);
   const recoveryEgress=new NativeReadEgress({maximum_response_bytes:65536,maximum_inflight:2,send_timeout_ms:5000,quiesce_timeout_ms:50});
   const restarted=new NativeCurrentRelationsProvider(pool,f.endpoint.client,recoveryEgress,f.config);
   await restarted.recover();const afterRecovery=await f.rows();
   expect(f.endpoint.requests.filter(request=>request.action==="issue")).toHaveLength(issuedBefore);
   expect(afterRecovery.map(row=>[row.base_body,row.terminal_receipt_id,row.terminal_receipt_digest])).toEqual(
    beforeRecovery.map(row=>[row.base_body,row.terminal_receipt_id,row.terminal_receipt_digest]));
   expect(afterRecovery.every(row=>row.source_settled)).toBe(true);
   // The same disposable PG/mTLS/native HTTP fence for all three sibling
   // families. The order relationship and mapped values here are synthetic:
   // no Edge publication or order-to-account authority is being claimed.
   const siblingSelection={...selection,detail_fields:["filled_quantity","reconciliation_run_id","obligation_id"]};
   const codec=new SiblingPageCursorCodec("TEST_ONLY",{TEST_ONLY:"x".repeat(40)},60000);
   const digest=accessDigest("TEST_ONLY-sibling-snapshot"),positions:string[]=[];
   let siblingRevoked=false;
   const siblingQualifier={prepare:async(scope:SiblingNativePlan["scope"],pageSize?:number):Promise<SiblingNativePlan>=>{
    const family=scope.kind,field=family==="order-detail"?"filled_quantity":family==="reconciliation"?"reconciliation_run_id":"obligation_id";
    const path=family==="order-detail"?"filled_quantity":family==="reconciliation"?"runs":"items";
    const isPaged=pageSize!==undefined;
    return{scope,selections:[siblingSelection],fieldProofs:{[path]:{selection:0,field,detail:true}},
     ...(isPaged?{page:{codec,binding:{workspace_id:scope.workspaceId,principal_id:scope.principalId,session_id:scope.sessionId,
      session_generation:scope.sessionGeneration,environment:"paper" as const,kind:family as "reconciliation"|"obligations",
      target_type:scope.targetType,target_id:scope.targetId,app_policy_revision:"TEST_ONLY-app",field_policy_revision:"TEST_ONLY-field",
      source_set_digest:digest,snapshot_id:"TEST_ONLY-snapshot",query_digest:digest,page_size:pageSize!}}}:{}),
     read:async(read,page)=>{await read({authority:siblingSelection,resource:"accounts",query:{limit:1,max_bytes:8192,entity_id:entity}});
      if(page)positions.push(page.position??"first");
      const base={schema_version:`portal.execution.${family}.v1`,workspace_id:scope.workspaceId,record_authority:"PORTAL_PROJECTION",read_at_ms:now};
      const body=family==="order-detail"?{...base,order_id:scope.targetId,filled_quantity:"5"}:
       {...base,subject:{type:"ACCOUNT",id:scope.targetId},...(family==="reconciliation"?{runs:[]}:{items:[]})};
      return{scope,body,complete:!page||page.position!==null,...(page?{snapshot_id:"TEST_ONLY-snapshot",next_source:page.position?null:"TEST_ONLY-next"}:{})};
     }};
   },revalidate:async()=>{},revalidateBeforeDispatch:()=>{if(siblingRevoked)throw Error("TEST_ONLY_SIBLING_REVOKED");}};
   const sibling=new SiblingNativeDelivery(composition,siblingQualifier);
   for(const family of ["order-detail","reconciliation","obligations"] as const){
    const paged=family!=="order-detail",id=paged?account:"TEST_ONLY-order",type=paged?"ACCOUNT":"ORDER";
    const requestPage=(cursor:string|null)=>http(res=>sibling.deliver(principal,family,type,id,res,()=>{},paged?{cursor,pageSize:1}:undefined));
    const first=await requestPage(null);if(first.completion.error)throw first.completion.error;
    expect(first.received.complete).toBe(true);const firstBody=JSON.parse(first.received.body.toString());
    if(paged){expect(firstBody.next_cursor).toBeTruthy();expect(firstBody.next_cursor).not.toContain("TEST_ONLY-next");
     const foreign=await http(res=>sibling.deliver({...principal,workspaceId:"TEST_ONLY-foreign"},family,type,id,res,()=>{},
      {cursor:firstBody.next_cursor,pageSize:1}));
     expect(foreign.received.body).toHaveLength(0);
     const next=await requestPage(firstBody.next_cursor);if(next.completion.error)throw next.completion.error;
     expect(JSON.parse(next.received.body.toString()).next_cursor).toBeNull();}
    const beforeDenial=await f.rows();siblingRevoked=true;const deniedSibling=await requestPage(null);
    expect(deniedSibling.received.body).toHaveLength(0);siblingRevoked=false;
    const afterDenial=await f.rows();expect(afterDenial.filter(row=>row.phase==="SERVED")).toHaveLength(beforeDenial.filter(row=>row.phase==="SERVED").length);
    expect(afterDenial.filter(row=>row.phase==="ABORTED"&&row.source_settled)).toHaveLength(
     beforeDenial.filter(row=>row.phase==="ABORTED"&&row.source_settled).length+1);
   }
   expect(positions).toEqual(["first","TEST_ONLY-next","first","first","TEST_ONLY-next","first"]);
  }finally{await composition.shutdown();await managerRuntime.beforeApplicationShutdown();for(const socket of sockets)socket.destroy();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
 const seriesPurposes:NativeCurrentRelationsPurpose[]=[
  {action:"business.read_all",resources:[{kind:"ROOT",id:"TEST_ONLY-root"}]},
  {action:"portfolio.read",resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio-a"}]},
  {action:"portfolio.read",resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio-b"}]},
  {action:"alpha.read",resources:[{kind:"ALPHA",id:"TEST_ONLY-alpha"}]},
 ];
 const scopeDigest=accessDigest("TEST_ONLY-four-genuine-scope-proofs");
 it("mixed four-purpose composition reserves ALL original cuts before source I/O, then uses ONE HTTP observation to settle every cut",async()=>{
  const f=await fixture(false,{actions:["access.read","business.read_all","portfolio.read","alpha.read"]}),body=Buffer.from('{"TEST_ONLY":"all-four-subjects"}');
  let inspected=false;
  f.onIssue(async()=>{if(!inspected){inspected=true;const prepared=await f.rows();expect(prepared).toHaveLength(4);
   expect(prepared.filter(r=>r.phase==="PREPARED")).toHaveLength(3);expect(prepared.filter(r=>r.phase==="ISSUE_REQUESTED")).toHaveLength(1);}});
  const result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,purposes:seriesPurposes,
   scope_digest:scopeDigest,response:res,build:async contexts=>{expect(contexts).toHaveLength(4);return body;},assertAllowed:contexts=>{expect(contexts).toHaveLength(4);}}));
  expect(result.completion.error).toBeUndefined();expect(result.received).toEqual({body,complete:true});expect(inspected).toBe(true);
  const rows=await f.rows(),issued=f.endpoint.requests.filter(r=>r.action==="issue");
  expect(rows).toHaveLength(4);expect(new Set(rows.map(r=>r.flight_id)).size).toBe(1);expect(new Set(rows.map(r=>r.lease_id)).size).toBe(4);
  expect(issued.map(r=>r.base.purpose.action)).toEqual(seriesPurposes.map(p=>p.action));
  const composition=accessDigest({actor:f.actor,workspace_id:f.workspace,purposes:seriesPurposes,scope_digest:scopeDigest});
  issued.forEach((request,index)=>expect(request.base.purpose.resource_digest).toBe(accessDigest({composition,purpose_index:index,
   action:seriesPurposes[index].action,resources:seriesPurposes[index].resources})));
  expect(new Set(rows.map(r=>r.terminal_fact.observation.binding.scope_digest)).size).toBe(1);
  expect(new Set(rows.map(r=>r.terminal_fact.observation.binding.lease_id)).size).toBe(1);
  for(const row of rows){expect(row).toMatchObject({phase:"SERVED",source_settled:true});
   expect(row.terminal_fact.observation).toMatchObject({outcome:"FINISHED",bytes:body.length});}
  expect(f.terminals).toHaveLength(4);expect(new Set(f.terminals.map(t=>t.lease_id)).size).toBe(4);
 });
 it("a later action lacking its own configured source permission refuses BEFORE any source call or partial custody",async()=>{
  const f=await fixture();const result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,
   purposes:seriesPurposes.slice(1),scope_digest:scopeDigest,response:res,build:async()=>Buffer.from('{}'),assertAllowed:()=>{}}));
  expect(result.completion.error).toMatchObject({code:"NATIVE_CURRENT_NOT_QUALIFIED"});
  expect(result.received.body).toHaveLength(0);expect(f.endpoint.requests).toHaveLength(0);expect(await f.rows()).toHaveLength(0);
 });
 it("capacity counts every purpose/principal cut atomically, not just the first subject",async()=>{
  const f=await fixture(false,{maximum_unresolved:1});const result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,
   purposes:seriesPurposes.slice(1,3),scope_digest:scopeDigest,response:res,build:async()=>Buffer.from('{}'),assertAllowed:()=>{}}));
  expect(result.completion.error).toMatchObject({code:"NATIVE_CURRENT_CAPACITY_EXHAUSTED"});
  expect(result.received.body).toHaveLength(0);expect(f.endpoint.requests).toHaveLength(0);expect(await f.rows()).toHaveLength(0);
 });
 it("a later purpose keeps its OWN source relation cut and cannot borrow the first cut at final policy check",async()=>{
  const f=await fixture(false,{actions:["portfolio.read","alpha.read"],relationsForPurpose:(purpose,relations)=>
   purpose.action==="alpha.read"?{...relations,grants:relations.grants.map(grant=>({...grant,targets:[]}))}:relations});
  const targets=(contexts:readonly import("../src/execution-v2/access-policy").AccessEvaluationContext[])=>
   contexts.map(context=>context.relationsFor(owner).current_authority!.grants[0].targets.length);
  const result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,
   purposes:[seriesPurposes[1],seriesPurposes[3]],scope_digest:scopeDigest,response:res,
   build:async contexts=>{expect(targets(contexts)[0]).toBeGreaterThan(0);expect(targets(contexts)[1]).toBe(0);return Buffer.from('{"TEST_ONLY":"unsent"}');},
   assertAllowed:contexts=>{expect(targets(contexts)[0]).toBeGreaterThan(0);if(targets(contexts)[1]===0)throw Error("TEST_ONLY-later-purpose-refused");}}));
  expect(result.completion.error).toBeDefined();expect(result.received.body).toHaveLength(0);
  for(const row of await f.rows())expect(row).toMatchObject({phase:"ABORTED",source_settled:true});
  expect(f.terminals.map(t=>t.phase)).toEqual(["ABORTED","ABORTED"]);
 });
 it("lost mixed-purpose terminal ACK recovers each SAME original without a second response or replacement lease",async()=>{
  const f=await fixture();f.loseResolve();const body=Buffer.from('{"TEST_ONLY":"sent-once"}');
  const result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,purposes:seriesPurposes.slice(1,3),
   scope_digest:scopeDigest,response:res,build:async()=>body,assertAllowed:()=>{}}));
  expect(result.received).toEqual({body,complete:true});const before=await f.rows();await f.provider.recover();const after=await f.rows();
  expect(f.endpoint.requests.filter(r=>r.action==="issue")).toHaveLength(2);expect(after).toHaveLength(2);
  expect(after.map(r=>[r.base_body,r.terminal_receipt_id,r.terminal_receipt_digest])).toEqual(before.map(r=>[r.base_body,r.terminal_receipt_id,r.terminal_receipt_digest]));
  for(const row of after)expect(row).toMatchObject({phase:"SERVED",source_settled:true});
 });
 it("mixed-purpose final dispatch remains synchronous: an async callback aborts all originals with zero bytes",async()=>{
  const f=await fixture(),result=await http(res=>f.provider.sendFiniteComposition({actor:f.actor,workspace_id:f.workspace,
   purposes:seriesPurposes.slice(1,3),scope_digest:scopeDigest,response:res,build:async()=>Buffer.from('{}'),assertAllowed:()=>{},
   beforeDispatch:(async()=>{}) as unknown as ()=>void}));
  expect(result.received.body).toHaveLength(0);for(const row of await f.rows())expect(row).toMatchObject({phase:"ABORTED",source_settled:true});
 });
 it("Core revoke is actually fenced during native source I/O, then allowed only after authenticated settlement",async()=>{
  const f=await fixture();f.onIssue(async()=>{
   await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[f.actor.session_id])).rejects.toMatchObject({code:"P0001"});
   expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1",[f.actor.session_id])).rows[0].state).toBe("ACTIVE");
  });await f.observe();
  await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[f.actor.session_id])).resolves.toBeDefined();
 });
 it("publication validation runs after actual ENTER without a Core client and before physical SENDING/dispatch",async()=>{
  const f=await fixture(),order:string[]=[];
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,
   build:async()=>{order.push("body");expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue"]);return Buffer.from('{}');},
   afterEnter:async()=>{order.push("entered");expect(f.endpoint.requests.at(-1)?.action).toBe("enter");
    expect((await f.rows())[0].phase).toBe("ENTERED");expect((await pool.query("SELECT 1 AS n")).rows[0].n).toBe(1);},
   assertAllowed:()=>{order.push("policy");},beforeDispatch:()=>{if(!order.includes("dispatch"))expect(res.headersSent).toBe(false);order.push("dispatch");}}));
  expect(result.completion.error).toBeUndefined();expect(order.slice(0,4)).toEqual(["body","entered","policy","dispatch"]);
  expect((await f.rows())[0]).toMatchObject({phase:"SERVED",source_settled:true});
 });
 it("failed publication check after ENTER sends zero bytes and settles actual ABORTED, not SERVED",async()=>{
  const f=await fixture();let dispatched=false;
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async()=>Buffer.from('{}'),
   afterEnter:async()=>{throw Error("TEST_ONLY-head-changed");},assertAllowed:()=>{},beforeDispatch:()=>{dispatched=true;}}));
  expect(result.completion.error).toBeDefined();expect(result.received.body).toHaveLength(0);expect(dispatched).toBe(false);
  expect((await f.rows())[0]).toMatchObject({phase:"ABORTED",source_settled:true});expect(f.terminals[0].phase).toBe("ABORTED");
 });
 it("physical dispatch refusal closes the reserved socket and never publishes SERVED",async()=>{
  const f=await fixture();let dispatchChecks=0;
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async()=>Buffer.from('{}'),
   assertAllowed:()=>{},beforeDispatch:()=>{dispatchChecks++;throw Error("TEST_ONLY-publication-expired");}}));
  // The physical writer reports its genuine ABORTED witness rather than
  // leaking a callback exception. Successful settlement is not SERVED.
  expect(result.completion.error).toBeUndefined();expect(dispatchChecks).toBe(1);expect(result.received.body).toHaveLength(0);
  expect((await f.rows())[0]).toMatchObject({phase:"ABORTED",source_settled:true});
  expect(f.terminals[0].phase).toBe("ABORTED");
 });
 it("shutdown joins the actual in-flight source call, refuses new work and keeps real custody",async()=>{
  const f=await fixture();let release!:()=>void,entered!:()=>void;
  const enteredSource=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
  f.onIssue(async()=>{entered();await held;});
  const operation=f.observe();await enteredSource;
  let closed=false;const closing=f.provider.shutdown(5000).then(()=>{closed=true;});
  await new Promise(resolve=>setTimeout(resolve,10));expect(closed).toBe(false);
  await expect(f.observe()).rejects.toMatchObject({code:"NATIVE_CURRENT_RECOVERY_REQUIRED"});
  release();await operation;await closing;expect(closed).toBe(true);
  expect((await f.rows())[0]).toMatchObject({phase:"CANCELLED",source_settled:true});expect(f.terminals).toEqual([]);
 });
 it("lost ISSUE response retires same frozen attempt without ENTER/new identity or terminal",async()=>{
  const f=await fixture();f.loseIssue();await expect(f.observe()).rejects.toBeDefined();
  const row=(await f.rows())[0];expect(row).toMatchObject({phase:"CANCELLED",source_settled:true});
  expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);expect(f.endpoint.requests[0].base).toEqual(f.endpoint.requests[1].base);expect(f.terminals).toEqual([]);
 });
 it("final policy rejection permanently closes unsent HTTP and publishes only actual ABORTED",async()=>{
  const f=await fixture(),result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async()=>Buffer.from('{"TEST_ONLY":"must-not-send"}'),
   assertAllowed:()=>{throw Error("TEST_ONLY_FINAL_REFUSAL");}}));
  expect(result.completion.error).toBeDefined();expect(result.received.body.length).toBe(0);
  expect((await f.rows())[0]).toMatchObject({phase:"ABORTED",source_settled:true});expect(f.terminals[0].evidence_kind).toBe("FINAL_HTTP_ABORT_CONFIRMED");
 });
 it("immutable original and terminal cannot be edited/deleted; unsupported STREAM emits no source issue",async()=>{
  const f=await fixture();await f.observe();const row=(await f.rows())[0];
  for(const sql of ["UPDATE portal_native_current_read_obligations SET base_body='{}' WHERE lease_id=$1", "DELETE FROM portal_native_current_read_obligations WHERE lease_id=$1"])
   await expect(pool.query(sql,[row.lease_id])).rejects.toMatchObject({code:"P0001"});
  const count=f.endpoint.requests.length;
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"stream.subscribe",resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],
   response:res,build:async()=>Buffer.from('{}'),assertAllowed:()=>{}}));expect(result.completion.error).toMatchObject({code:"NATIVE_CURRENT_FINITE_ONLY"});expect(f.endpoint.requests).toHaveLength(count);
 });
 it("future DENY transition shortens actual transport deadline rather than borrowing the longer source/session lease",async()=>{
  const f=await fixture(true),before=Date.now();
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async context=>{
    const deny=context.grants.find(g=>g.effect==="DENY")!;
    // No new source/authority is invented: wait beyond the actual Core fact's
    // activation, still far inside the genuine source/session lease.
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,deny.valid_from_ms-Date.now()+20)));
    return Buffer.from('{"TEST_ONLY":"must-not-cross-deny-start"}');},assertAllowed:()=>{}}));
  expect(Date.now()-before).toBeLessThan(5000);expect(result.completion.error).toMatchObject({code:"NATIVE_CURRENT_AUTHORITY_CHANGED"});
  expect(result.received.body.length).toBe(0);expect((await f.rows())[0]).toMatchObject({phase:"CANCELLED",source_settled:true});
  expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","cancel-unentered"]);expect(f.terminals).toEqual([]);
 });
 it("lost cancellation ACK after an unentered source preserves actual ABORTED original and recovers recorded CANCELLED",async()=>{
  const f=await fixture();f.loseEnterBefore();f.loseCancel();
  const result=await http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async()=>Buffer.from('{"TEST_ONLY":"unsent"}'),assertAllowed:()=>{}}));
  expect(result.completion.error).toBeDefined();expect(result.received.body.length).toBe(0);
  const before=(await f.rows())[0];expect(before).toMatchObject({phase:"ABORTED",source_settled:false});expect(f.terminals).toEqual([]);
  await f.provider.recover();const after=(await f.rows())[0];expect(after).toMatchObject({phase:"ABORTED",source_settled:true,
   base_body:before.base_body,terminal_receipt_id:before.terminal_receipt_id,terminal_receipt_digest:before.terminal_receipt_digest});
  expect(f.endpoint.requests.map(r=>r.action)).toEqual(["issue","enter","status","cancel-unentered","status","cancel-unentered"]);
  expect(f.endpoint.requests.every(r=>r.base.binding.lease_id===before.lease_id)).toBe(true);expect(f.terminals).toEqual([]);
 });
 it("ordinary READ drain keeps the original mutation PENDING; authenticated ACK permits same-key retry, not replacement intent",async()=>{
  const f=await fixture(),human=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),source=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
  const candidate=await CurrentHumanCandidate.create(pool,{issuer:"TEST_ONLY-core",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-human",private_key:human.privateKey,
   source:{issuer:"TEST_ONLY-pm",audience:"TEST_ONLY-core",key_id:"TEST_ONLY-source",public_key:source.publicKey,workload_id:"TEST_ONLY-old-source"},
   limits:{ttl_ms:30000,maximum_unresolved:8,maximum_retained:128}}),
   coordinator=new CurrentHumanMutations(pool,candidate,{recover:async()=>{}},{maximum_intents:16,maximum_recoveries_per_request:4},undefined,[],f.provider);
  const key=accessDigest(["TEST_ONLY-current-read-drain",randomUUID()]),binding={family:"AUTH_SESSION" as const,operation:"REVOKE_SESSION",
   actor_id:f.actor.user_id,session_id:f.actor.session_id,session_revision:f.actor.session_generation,key_digest:key,
   request_digest:accessDigest({session:f.actor.session_id}),target_id:f.actor.session_id};
  let applications=0,intent:string|undefined;
  const hooks={authorize:async(db:import("pg").PoolClient)=>{expect((await db.query("SELECT state FROM auth_sessions WHERE session_id=$1",[f.actor.session_id])).rows[0].state).toBe("ACTIVE");},
   apply:async(db:import("pg").PoolClient)=>{applications++;await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[f.actor.session_id]);return"TEST_ONLY-revoked";},
   terminal:()=>({outcome:"APPLIED" as const,receipt_ref:"TEST_ONLY-current-revocation",reason_code:null})};
  f.onIssue(async()=>{
   await expect(coordinator.execute(binding,hooks)).rejects.toMatchObject({state:"DRAIN_PENDING"});
   const original=(await pool.query("SELECT * FROM elp210_candidate.mutations WHERE key_digest=$1",[key])).rows[0];intent=original.mutation_id;
   expect(original.state).toBe("PENDING");expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBe(intent);expect(applications).toBe(0);
  });
  await f.observe();expect((await f.rows())[0].source_settled).toBe(true);
  expect(await coordinator.execute(binding,hooks)).toBe("TEST_ONLY-revoked");expect(applications).toBe(1);
  const completed=(await pool.query("SELECT * FROM elp210_candidate.mutations WHERE key_digest=$1",[key])).rows[0];expect(completed).toMatchObject({mutation_id:intent,state:"FINISHED"});
  expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
 });
 it("overlapping finite/advisory flights keep separate real custody and do not cancel a locally active reader",async()=>{
  const f=await fixture();let started!:()=>void,release!:()=>void;
  const building=new Promise<void>(resolve=>{started=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const delivery=http(res=>f.provider.sendFinite({actor:f.actor,workspace_id:f.workspace,action:"portfolio.read",
   resources:[{kind:"PORTFOLIO",id:"TEST_ONLY-portfolio"}],response:res,build:async()=>{started();await gate;return Buffer.from('{"TEST_ONLY":"concurrent"}');},assertAllowed:()=>{}}));
  await building;
  try{await f.observe();const rows=await f.rows();expect(rows).toHaveLength(2);expect(rows[0]).toMatchObject({phase:"ISSUED",source_settled:false});
   expect(rows[1]).toMatchObject({phase:"CANCELLED",source_settled:true});
   await expect(f.provider.recover()).rejects.toMatchObject({code:"NATIVE_CURRENT_RECOVERY_REQUIRED"});
  }finally{release();}
  const result=await delivery;expect(result.completion.error).toBeUndefined();expect(result.received.complete).toBe(true);
  expect((await f.rows()).map(r=>[r.phase,r.source_settled])).toEqual([["SERVED",true],["CANCELLED",true]]);
 });
});
