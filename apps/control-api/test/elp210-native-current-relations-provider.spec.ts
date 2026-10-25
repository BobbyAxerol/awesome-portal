/** Real disposable PG + real loopback mTLS/HTTP. Source relation payloads are
 * SYNTHETIC component vectors, never a native-source commissioning receipt. */
import {generateKeyPairSync,randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {createServer,request,type ServerResponse} from "node:http";
import type {Socket} from "node:net";
import {generateKeyPair,jwtVerify} from "jose";
import {Pool} from "pg";
import {afterAll,afterEach,beforeAll,describe,expect,it} from "vitest";
import {AuthService} from "../src/auth/auth.service";
import {OwnerAccessRepository} from "../src/repos/owner-access";
import {ExecutionAccessService} from "../src/execution-v2/access.service";
import {accessDigest} from "../src/execution-v2/access-digest";
import {grantBindingDigest} from "../src/execution-v2/access-current-relations";
import {unqualifiedAccessTrust,type ReviewedPolicyArtifact} from "../src/execution-v2/access-trust";
import {NativeReadEgress} from "../src/execution-v2/native-read-egress";
import {CurrentHumanCandidate} from "../src/execution-v2/current-human-candidate";
import {CurrentHumanMutations} from "../src/execution-v2/current-human-mutations";
import {NativeCurrentRelationsProvider,type NativeCurrentRelationsProviderConfig} from "../src/execution-v2/native-current-relations-provider";
import {setupApp,teardownApp,migrateTestDatabase} from "./harness";
import {rootWireFacts} from "./fixtures/elp210-native-root-wire";
import {currentRelationsWireReply} from "./fixtures/elp210-native-current-relations-wire";
import {currentRelationsTestEndpoint} from "./fixtures/elp210-native-current-relations-server";

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
 async function fixture(futureTransition=false){
  await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
  const id=randomUUID(),now=Date.now(),workspace=`TEST_ONLY-current-${id}`,session=`TEST_ONLY-current-session-${id}`;
  await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY Current',$2)",[workspace,owner]);
  const generation=Number((await pool.query("SELECT session_version FROM portal_users WHERE user_id=$1",[owner])).rows[0].session_version);
  await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at)
   VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',$3,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[session,owner,generation]);
  const actor={user_id:owner,session_id:session,session_generation:generation},facts=rootWireFacts(now),policy={workspace_id:workspace,
   revision:`TEST_ONLY-policy-${id}`,artifact_digest:accessDigest(id),approval_ref:"TEST_ONLY-owner-reviewed",state:"REVIEWED" as const,
   qualification:"TEST_ONLY" as const,protected_owner_user_id:owner,researcher_fields:{state:"QUALIFIED" as const,policy_ref:"TEST_ONLY-fields",fields:["portfolio_id"]}},
   grant={...facts.grant,grant_id:`TEST_ONLY-current-grant-${id}`,subject_user_id:owner,issued_by:owner,workspace_id:workspace,policy_revision:policy.revision};
  const futureDeny={...grant,grant_id:`TEST_ONLY-future-deny-${id}`,effect:"DENY" as const,requires_ts_acceptance:false,
   valid_from_ms:now+1200,valid_until_ms:now+600000};
  const artifact:ReviewedPolicyArtifact={policy,root_grants:futureTransition?[grant,futureDeny]:[grant],provenance_ref:"TEST_ONLY-component"},baseTrust={...unqualifiedAccessTrust,
   verifyPolicy:async(input:unknown)=>input===artifact?artifact:null};
  await new ExecutionAccessService(pool,ctx.app.get(AuthService),baseTrust,true).installReviewedPolicy(artifact);
  const fact={...facts.fact,portal_user_id:owner,human_requester_user_id:owner,workspace_id:workspace,grant_id:grant.grant_id,
   policy_revision:policy.revision,grant_digest:accessDigest(grant)},relations={...facts.relations,subject_user_id:owner,workspace_id:workspace,
    grants:[{...facts.relations.grants[0],grant_id:grant.grant_id,binding_digest:grantBindingDigest(grant),accepted:fact}]};
  const terminal=generateKeyPairSync("ed25519"),states=new Map<string,string>(),terminals:Array<Record<string,unknown>>=[];
  let loseIssue=false,loseResolve=false,loseEnterBefore=false,loseCancel=false,onIssue:(()=>Promise<void>)|undefined;
  const endpoint=await currentRelationsTestEndpoint(async(base,action,res,body)=>{
   // Pool1 proves no source network wait retains Core's client.
   expect((await pool.query("SELECT 1 AS n")).rows[0].n).toBe(1);
   const lease=base.binding.lease_id,reply=currentRelationsWireReply(base,action,relations),state=states.get(lease);
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
    terminals.push({...claims});states.set(lease,String(claims.phase));if(loseResolve){loseResolve=false;res.destroy();}
    return{...reply,recovery:{state:"SETTLED",phase:claims.phase,terminal_authority:true,release_permitted:true}};
   }return reply;
  });endpoints.push(endpoint);
  const config:NativeCurrentRelationsProviderConfig={bindings:[{actor_id:owner,principal_id:owner,
   source:{human_issuer:"TEST_ONLY-core",subject:"TEST_ONLY-independent-native-human",workspace_id:workspace,environment:"paper",workload_id:"TEST_ONLY-native-current"},
   registration:{correspondence_id:`TEST_ONLY-correspondence-${id}`,expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
   original:{grant_id:grant.grant_id,accepted_fact_digest:accessDigest(fact)},correspondence:{registry_revision:accessDigest("TEST_ONLY-registry"),payload_sha256:"b".repeat(64),approval_ref:"TEST_ONLY-independent-review"},
   allowed_actions:["access.read","portfolio.read"]}],maximum_retained:128,maximum_unresolved:8,maximum_recoveries:8,maximum_principals:8,attempt_ms:30000,
   terminal:{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-pm-terminal",key_id:"TEST_ONLY-terminal",private_key:terminal.privateKey,ttl_seconds:30}};
  const egress=new NativeReadEgress({maximum_response_bytes:65536,maximum_inflight:2,send_timeout_ms:5000,quiesce_timeout_ms:50}),
   provider=new NativeCurrentRelationsProvider(pool,endpoint.client,egress,config),access=new ExecutionAccessService(pool,ctx.app.get(AuthService),provider.compose(baseTrust),true),
   observe=()=>provider.observe({actor,workspace_id:workspace,principal_ids:[owner],action:"access.read",resource_digest:accessDigest({kind:"CURRENT_POLICY_CONTEXT"})}),
   rows=async()=> (await pool.query("SELECT * FROM portal_native_current_read_obligations WHERE source_config_digest=$1 ORDER BY created_at,lease_id",[provider.source_config_digest])).rows;
  return{provider,config,actor,workspace,access,observe,rows,endpoint,terminals,relations,states,
   loseIssue(){loseIssue=true;},loseResolve(){loseResolve=true;},loseEnterBefore(){loseEnterBefore=true;},loseCancel(){loseCancel=true;},onIssue(callback:()=>Promise<void>){onIssue=callback;}};
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
