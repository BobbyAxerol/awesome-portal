/** TEST_ONLY correctness; actual results belong to the owning phase receipt.
 * Actual disposable PostgreSQL + real loopback
 * TLS1.3/mTLS + finite HTTP, with a synthetic in-memory PM protocol endpoint.
 * NOT production/source-authoritative/native-PM or installed authority evidence.
 * Requires the internal disposable harness; normal full gate has no opt-in
 * skip for these cases. Never use a runtime/deployed database. */
import{randomUUID,createHash,generateKeyPairSync,X509Certificate,type KeyObject}from"node:crypto";
import{readFile}from"node:fs/promises";import{join}from"node:path";
import{createServer,request,ServerResponse,type ClientRequest,type IncomingHttpHeaders}from"node:http";
import{createServer as createHttpsServer,type Server as HttpsServer}from"node:https";
import{Socket}from"node:net";import{generateKeyPair,decodeJwt,jwtVerify,SignJWT,type KeyLike}from"jose";
import{Pool,type PoolClient}from"pg";import{beforeAll,beforeEach,afterEach,afterAll,describe,it,expect,vi}from"vitest";
import{CurrentHumanCandidate,type CurrentHumanNativeHTTPConfig}from"../src/execution-v2/current-human-candidate";
import{CurrentHumanMutations}from"../src/execution-v2/current-human-mutations";
import{SelectedNativeBusinessReadSource,selectedNativeBusinessReadSelection}from"../src/execution-v2/native-business-read-selected-source";
import{prepareNativeBusinessReadRequest,nativeBusinessReadUtcMicroseconds}from"../src/execution-v2/native-business-read-codec";
import{commonName,testCertificate}from"./fixtures/elp210-test-certificates";
import{migrateTestDatabase,truncateAll}from"./harness";
const hash=(c:string)=>"sha256:"+c.repeat(64),raw=(c:string)=>c.repeat(64);
const actor={user_id:"TEST_ONLY-human",session_id:"TEST_ONLY-session",session_generation:7};
const domain={profile_id:"TEST_ONLY-manager",catalogue_sha256:raw("a"),profile_sha256:raw("b"),field_policy_sha256:raw("c")};
function context(){return{schema_version:"pma.native-business-read.request.v1" as const,
 binding:{lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:"TEST_ONLY-issuer",subject:actor.user_id,
 workspace_id:"TEST_ONLY-workspace",environment:"paper" as const,workload_id:"TEST_ONLY-pm",request_digest:raw("d"),operation:"READ" as const},
 domain:{...domain},manager_intent:{schema_version:"pma.manager-read-intent.v1" as const,action:"catalogue" as const,digest:raw("d")},
 deadline:new Date(Math.floor((Date.now()+15000)/1000)*1000).toISOString()};}
type Authority={key:KeyObject;name:Buffer;cert:Buffer};
type Identity={key:Buffer;cert:Buffer;ca:Buffer;pin:string};
function authority():Authority{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),dn=commonName("TEST_ONLY_FINITE_ROOT");
 return{key:keys.privateKey,name:dn,cert:testCertificate(dn,keys,{name:dn,key:keys.privateKey},true)};}
function identity(label:string,ca:Authority):Identity{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 const cert=testCertificate(commonName(label),keys,ca,false,"localhost");return{key:Buffer.from(keys.privateKey.export({type:"pkcs8",format:"pem"})),cert,ca:ca.cert,
 pin:"sha256:"+createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")};}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("TEST_ONLY_HTTP_DEADLINE")), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("TEST_ONLY_QUIESCENCE_DEADLINE");
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
}
type Received = { complete: boolean; body: Buffer; headers: IncomingHttpHeaders };
type Exchange = { response: ServerResponse; client: ClientRequest; received: Promise<Received> };
async function exchange(run: (context: Exchange) => Promise<void>, method = "GET"): Promise<void> {
  const accepted = deferred<ServerResponse>(), received = deferred<Received>(), sockets = new Set<Socket>();
  const server = createServer((_req, response) => accepted.resolve(response));
  server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  let client: ClientRequest | undefined;
  try {
    await bounded(new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    }));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN_ADDRESS");
    client = request({ host: "127.0.0.1", port: address.port, path: "/TEST_ONLY", method, agent: false,
      headers: { connection: "close" } }, reply => {
      const chunks: Buffer[] = [];
      reply.on("data", (chunk: Buffer) => chunks.push(chunk));
      reply.once("end", () => received.resolve({ complete: reply.complete, body: Buffer.concat(chunks), headers: reply.headers }));
      reply.once("error", () => received.resolve({ complete: false, body: Buffer.concat(chunks), headers: reply.headers }));
      reply.once("aborted", () => received.resolve({ complete: false, body: Buffer.concat(chunks), headers: reply.headers }));
    });
    client.on("error", () => received.resolve({ complete: false, body: Buffer.alloc(0), headers: {} }));
    client.end();
    await bounded(run({ response: await bounded(accepted.promise), client, received: received.promise }));
  } finally {
    client?.destroy();
    // ONLY this test's server/socket set; never touch another listener/job.
    for (const socket of sockets) socket.destroy();
    server.closeAllConnections();
    await bounded(new Promise<void>(resolve => server.close(() => resolve())));
  }
}



const pgUrl=process.env.TEST_DATABASE_URL;
describe.skipIf(!pgUrl)("TEST_ONLY NC03 native-family finite HTTP actual-PG integration",()=>{
 let pool:Pool,candidate:CurrentHumanCandidate,config:CurrentHumanNativeHTTPConfig,ctx:ReturnType<typeof context>;
 let selectedConfig:ConstructorParameters<typeof SelectedNativeBusinessReadSource>[0];
 let ca:Authority,core:Identity,pm:Identity,server:HttpsServer,humanKey:KeyLike,terminalPublic:KeyLike;
 const owner="TEST_ONLY-native-read-owner",workspace="TEST_ONLY-workspace",policyRevision="TEST_ONLY-native-read-policy",grantId="TEST_ONLY-native-read-domain-grant";
 const sockets=new Set<Socket>(),phases=new Map<string,string>(),receipts=new Map<string,string>(),calls:string[]=[];
 // Token-free observations from the actual TEST_ONLY TLS verifier. No JWT,
 // private key or operational authority is copied into these observations.
 const humanAssertions:Array<{action:"issue"|"enter";exp:number;deadline:string;base_body:string}>=[];
 let holdResolve:ReturnType<typeof deferred<void>>|undefined,resolveArrived:ReturnType<typeof deferred<void>>|undefined;
 let dropResolve=false,dropEnter=false,leaseShortenMs=0;
 const row=async()=> (await pool.query("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1",[ctx.binding.lease_id])).rows[0];
 const pending=async()=>Number((await pool.query("SELECT count(*)::int n FROM elp210_candidate.obligations WHERE unresolved")).rows[0].n);
 function json(response:ServerResponse,value:unknown){const body=Buffer.from(JSON.stringify(value));response.writeHead(200,{
  "content-type":"application/json","content-length":String(body.length),"connection":"close","cache-control":"no-store"});response.end(body);}
 beforeAll(async()=>{
  let target:URL;try{target=new URL(pgUrl!);}catch{throw Error("TEST_ONLY_INTERNAL_DATABASE_REQUIRED");}
  if(!["postgres:","postgresql:"].includes(target.protocol)||!/^control-api-test-postgres-[0-9]+$/.test(target.hostname)
    ||target.pathname!=="/portal_control_test")throw Error("TEST_ONLY_INTERNAL_DATABASE_REQUIRED");
  // Validate the disposable internal target BEFORE any migration or DB client.
  await migrateTestDatabase(pgUrl!);pool=new Pool({connectionString:pgUrl,max:4,connectionTimeoutMillis:2000,query_timeout:6000});
  ca=authority();core=identity("TEST_ONLY_CORE",ca);pm=identity("TEST_ONLY_PM",ca);
 },15000);
 async function createFixture(){
  ctx=context();phases.clear();receipts.clear();calls.length=0;humanAssertions.length=0;dropResolve=false;dropEnter=false;leaseShortenMs=0;holdResolve=undefined;resolveArrived=undefined;
  const key=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true}),terminal=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
  humanKey=key.publicKey;terminalPublic=terminal.publicKey;
  const user="33333333-3333-3333-3333-333333333333";
  const humanPins={issuer:ctx.binding.human_issuer,subject:ctx.binding.subject,portal_user_id:actor.user_id,
    ts_user_id:user,mapping_revision:"ts-user:"+user+":1"};
  const nativePins={revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:hash("1"),document_digest:hash("2"),
    policy_revision:"1",owner_mapping_revision:"ts-user:"+user+":1",semantic_revision:hash("3"),
    effective_from:new Date(Date.now()-1000).toISOString(),expires_at:new Date(Date.now()+60000).toISOString()};
  server=createHttpsServer({key:pm.key,cert:pm.cert,ca:core.ca,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
   const chunks:Buffer[]=[];req.on("error",()=>{});res.on("error",()=>{});req.on("data",chunk=>chunks.push(Buffer.from(chunk)));
   req.on("end",async()=>{try{
    const input=JSON.parse(Buffer.concat(chunks).toString("utf8")),action=(req.url??"").split("/").pop()!;
    expect(req.method).toBe("POST");expect(["issue","enter","status","unknown","cancel-unentered","resolve"]).toContain(action);
    expect(pool.idleCount).toBe(pool.totalCount);calls.push(action);
    const id=input.binding.lease_id,current=phases.get(id),common={schema_version:"pma.native-business-read.result.v1",binding:input.binding,component:"NATIVE_BUSINESS_READ_ONLY"};
    if(action==="issue"||action==="enter"){
     const jwt=await jwtVerify(input.human_token,humanKey,{algorithms:["EdDSA"],issuer:"TEST_ONLY-issuer",audience:"TEST_ONLY-pm-human"});
     const encoded=prepareNativeBusinessReadRequest(action,input,{request_bytes:32768,response_bytes:32768});
     expect(jwt.payload).toMatchObject({purpose:"pma.identity.v1",sub:actor.user_id,sid:actor.session_id,session_revision:7,request_digest:encoded.provider_delivery_digest});
     // PM compares the ORIGINAL Base deadline, not the shorter returned lease.
     // Date.parse truncates microseconds; it is not a valid upper-bound check.
     const deadlineUs=nativeBusinessReadUtcMicroseconds(input.deadline),exp=jwt.payload.exp;
     expect(typeof exp).toBe("number");expect(Number.isSafeInteger(exp)).toBe(true);
     if(typeof exp!=="number"||!Number.isSafeInteger(exp))throw Error("TEST_ONLY_HUMAN_EXP_REQUIRED");
     const iat=jwt.payload.iat,nbf=jwt.payload.nbf;
     if(typeof iat!=="number"||!Number.isSafeInteger(iat)||typeof nbf!=="number"||!Number.isSafeInteger(nbf))
      throw Error("TEST_ONLY_HUMAN_TIME_REQUIRED");
     // Same cached HumanTrustPolicy default ceiling, not only JOSE's
     // expiration check. A covering second must not widen the signed lifetime.
     expect(iat<=nbf&&nbf<exp&&exp<=iat+60).toBe(true);
     expect(BigInt(Date.now())*1000n<deadlineUs).toBe(true);
     expect(deadlineUs<=BigInt(exp)*1000000n).toBe(true);
     humanAssertions.push({action,exp,deadline:input.deadline,base_body:encoded.base_body});
    }
    if(action==="issue"){
     if(current){res.writeHead(409);res.end();return;}
     phases.set(id,"ISSUED");
     json(res,{...common,state:"ISSUED",human:humanPins,
      domain:{...input.domain,environment:input.binding.environment},permission:{scope_kind:"MANAGER_CATALOGUE_DOMAIN",action:"business.read_all",delegable:false},
      native:nativePins,
      lease:{source_digest:raw("f"),source_fingerprint:raw("e"),expires_at:new Date(Date.parse(input.deadline)-leaseShortenMs).toISOString()}});return;
    }
    if(action==="enter"){
     if(current!=="ISSUED"){res.writeHead(409);res.end();return;}phases.set(id,"ENTERED");
     if(dropEnter){dropEnter=false;req.socket.destroy();return;}json(res,{...common,state:"ENTERED"});return;
    }
    if(action==="status"){json(res,{...common,state:"OBSERVATION",may_authorize_read:false,recovery:current===undefined?
     {state:"ABSENT",terminal_authority:false,release_permitted:false}:current==="CANCELLED"?
     {state:"RECORDED",phase:"CANCELLED",terminal_authority:false,release_permitted:false}:
     {state:"RECORDED",phase:current,source_digest:raw("f"),expires_at:input.deadline,terminal_authority:false,release_permitted:false}});return;}
    if(action==="cancel-unentered"){
     if(current&& !["ISSUED","RETIRED","CANCELLED"].includes(current)){res.writeHead(409);res.end();return;}
     phases.set(id,"CANCELLED");json(res,{...common,state:"CANCELLED",may_authorize_read:false,
      recovery:{state:"CANCELLED",cancellation_authority:true,release_permitted:true}});return;
    }
    if(action==="resolve"){
     const jwt=await jwtVerify(input.signed_terminal,terminalPublic,{algorithms:["EdDSA"],issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-native-terminal"});
     const encoded=prepareNativeBusinessReadRequest("resolve",input,{request_bytes:32768,response_bytes:32768});
     expect(jwt.payload).toMatchObject({purpose:"pma.native-business-to-core-terminal.v1",lease_id:id,attempt_id:input.binding.attempt_id,
      workload_id:input.binding.workload_id,binding_digest:encoded.binding_digest,source_digest:raw("f"),operation:"READ"});
     expect(["SERVED","ABORTED"]).toContain(jwt.payload.phase);
     expect(jwt.payload.evidence_kind).toBe(jwt.payload.phase==="SERVED"?"FINAL_HTTP_SEND_COMPLETED":"FINAL_HTTP_ABORT_CONFIRMED");
     const receipt=String(jwt.payload.receipt_id)+":"+String(jwt.payload.receipt_digest),previous=receipts.get(id);
     if(previous)expect(receipt).toBe(previous);receipts.set(id,receipt);phases.set(id,String(jwt.payload.phase));
     resolveArrived?.resolve();if(holdResolve)await holdResolve.promise;
     if(dropResolve){dropResolve=false;req.socket.destroy();return;}
     json(res,{...common,state:"SETTLED",may_authorize_read:false,recovery:{state:"SETTLED",phase:String(jwt.payload.phase),terminal_authority:true,release_permitted:true}});return;
    }
    res.writeHead(409);res.end();
   }catch{res.writeHead(500,{"connection":"close"});res.end();}});
  });
  server.on("tlsClientError",()=>{});server.on("clientError",(_error,socket)=>socket.destroy());
  server.on("connection",socket=>{if(!(socket instanceof Socket))throw Error("TEST_ONLY_SOCKET_REQUIRED");sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
  await bounded(new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve());}));
  const address=server.address();if(!address||typeof address==="string")throw Error("TEST_ONLY_LISTEN");
  const installationUntil=Date.now()+55000;
  selectedConfig={
   transport:{origin:"https://127.0.0.1:"+address.port,tls:{key:core.key,cert:core.cert,ca:pm.ca},
    pm_leaf_sha256:pm.pin,workload_id:ctx.binding.workload_id,deadline_ms:3000,request_bytes:32768,response_bytes:32768,max_inflight:4},
   pins:{binding:{human_issuer:ctx.binding.human_issuer,subject:ctx.binding.subject,workspace_id:workspace,environment:"paper",workload_id:ctx.binding.workload_id},
    domain:{...domain},human:humanPins,native:nativePins,source_fingerprint:raw("e")},installation_expires_at_utc_ms:installationUntil};
  const selectedSource=new SelectedNativeBusinessReadSource(selectedConfig);
  config={issuer:ctx.binding.human_issuer,audience:"TEST_ONLY-pm-human",key_id:"TEST_ONLY-human-key",private_key:key.privateKey,selected_source:selectedSource,
   limits:{ttl_ms:30000,maximum_unresolved:4,maximum_retained:32},installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:installationUntil},
   terminal:{issuer:"TEST_ONLY-core-terminal",audience:"TEST_ONLY-native-terminal",key_id:"TEST_ONLY-terminal-key",private_key:terminal.privateKey,ttl_seconds:30},
   egress:{maximum_response_bytes:1048576,maximum_inflight:2,send_timeout_ms:1000,quiesce_timeout_ms:200}};
  candidate=await CurrentHumanCandidate.createNativeRead(pool,config);
 }
  beforeEach(async()=>{
    await truncateAll(pool);
    const now=Date.now();
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7),($2,$2,'TEST_ONLY','USER','ACTIVE',false,7)",[actor.user_id,owner]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')",[actor.session_id,actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)",[workspace,owner]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER'),($1,$3,'MEMBER')",[workspace,owner,actor.user_id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id,claimed_by) VALUES('PORTAL_OWNER',$1,'TEST_ONLY-DISPOSABLE')",[owner]);
    // The literal OWNER_VERIFIED is required to exercise the real evaluator;
    // it describes ONLY these synthetic isolated facts, not real owner approval.
    const seal={environment:"paper",domain:{...domain},field_policy_ref:"TEST_ONLY-manager-fields",valid_from_ms:now-1000,valid_until_ms:now+120000};
    const policy={workspace_id:workspace,revision:policyRevision,artifact_digest:hash("8"),approval_ref:"TEST_ONLY-NOT-REAL-APPROVAL",
      state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:owner,
      researcher_fields:{state:"PENDING",policy_ref:null,fields:[]},manager_read_domains:[seal]};
    const grant={schema_version:"portal.manager-domain-grant.v1",grant_id:grantId,workspace_id:workspace,subject_user_id:actor.user_id,
      issued_by:owner,parent_grant_id:null,revision:"TEST_ONLY-grant-r1",policy_revision:policyRevision,action:"business.read_all",
      effect:"ALLOW",environment:"paper",domain:{...domain},field_policy_ref:seal.field_policy_ref,
      valid_from_ms:now-1000,valid_until_ms:now+90000,revoked_at_ms:null};
    await pool.query("INSERT INTO portal_access_policy_state(workspace_id,revision,policy) VALUES($1,$2,$3::jsonb)",[workspace,policyRevision,JSON.stringify(policy)]);
    await pool.query("INSERT INTO portal_access_grants_v2(grant_id,workspace_id,subject_user_id,issued_by,parent_grant_id,revision,grant_fact) VALUES($1,$2,$3,$4,NULL,$5,$6::jsonb)",
      [grantId,workspace,actor.user_id,owner,grant.revision,JSON.stringify(grant)]);
    await pool.query(await readFile(join(__dirname,"../src/execution-v2/current-human-candidate.sql"),"utf8"));
    await createFixture();
  });
  afterEach(async()=>{
    holdResolve?.resolve();vi.restoreAllMocks();vi.useRealTimers();
    if(server){const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
      for(const socket of sockets)socket.destroy();server.closeAllConnections();await bounded(closed);}
    // Exact disposable schema and exact TEST_ONLY rows only.
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM portal_access_grants_v2 WHERE workspace_id=$1",[workspace]);
    await pool.query("DELETE FROM portal_access_policy_state WHERE workspace_id=$1",[workspace]);
    await pool.query("DELETE FROM workspace_members WHERE workspace_id=$1",[workspace]);
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1",[workspace]);
    await pool.query("DELETE FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' AND user_id=$1",[owner]);
    await pool.query("DELETE FROM portal_users WHERE user_id=ANY($1::text[])",[[actor.user_id,owner]]);
  });
  afterAll(async()=>{await pool?.end();core?.key.fill(0);pm?.key.fill(0);});

 // All mutations below prepare genuine TEST_ONLY authority facts BEFORE
 // admission; no mocked evaluator, fake clock, production DB or raw bypass.
 type JwtCapAxis="app"|"grant+field chain"|"session"|"installation";
 const jwtCapAxes:JwtCapAxis[]=["app","grant+field chain","session","installation"];
 function fractionalBase(){return ctx.deadline.slice(0,19)+".123456+00:00";}
 function baseExpMs(){return Number(((nativeBusinessReadUtcMicroseconds(ctx.deadline)+999999n)/1000000n)*1000n);}
 async function capJwtAuthority(axis:JwtCapAxis,until:number){
  if(axis==="session"){
   await pool.query("UPDATE auth_sessions SET idle_expires_at=to_timestamp($2::double precision/1000) WHERE session_id=$1",[actor.session_id,until]);
  }else if(axis==="installation"){
   const source=new SelectedNativeBusinessReadSource({...selectedConfig,installation_expires_at_utc_ms:until});
   candidate=await CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:source,
    installation_scope:{...config.installation_scope!,valid_until_ms:until}});
  }else{
   await pool.query("UPDATE portal_access_grants_v2 SET grant_fact=jsonb_set(grant_fact,'{valid_until_ms}',to_jsonb($2::bigint)) WHERE grant_id=$1",[grantId,until]);
   if(axis==="grant+field chain")await pool.query("UPDATE portal_access_policy_state SET policy=jsonb_set(policy,'{manager_read_domains,0,valid_until_ms}',to_jsonb($2::bigint)) WHERE workspace_id=$1",[workspace,until]);
  }
 }
 function assertOriginalJwtCeiling(record:{issued_at_ms:string|number;base_body:string},frozenTtlMs:number){
  const expMs=baseExpMs();
  expect(humanAssertions.map(x=>x.action)).toEqual(["issue","enter"]);
  for(const observed of humanAssertions){
   expect(observed.exp*1000).toBe(expMs);
   expect(observed.deadline).toBe(ctx.deadline);expect(observed.base_body).toBe(record.base_body);
   // Original admitted TTL, not a new now+ttl on ENTER after a source await.
   expect(BigInt(observed.exp)*1000n<=BigInt(record.issued_at_ms)+BigInt(frozenTtlMs)).toBe(true);
  }
 }



 function faults(...targets:string[]){
  const remaining=new Set(targets),connect=pool.connect.bind(pool) as()=>Promise<PoolClient>;
  vi.spyOn(pool,"connect").mockImplementation(((callback?:any)=>{
   if(typeof callback==="function")return(connect as any)(callback);
   return connect().then(db=>{const query=db.query.bind(db),release=db.release.bind(db);let transition="";
    (db as any).query=async(sql:string,p?:any[])=>{
     if(sql.startsWith("INSERT INTO elp210_candidate.native_read_obligations"))transition="ADMIT";
     if(sql.startsWith("UPDATE elp210_candidate.native_read_obligations SET phase='SENDING'"))transition="SENDING";
     if(sql.startsWith("UPDATE elp210_candidate.native_read_obligations SET phase=$2,receipt_id="))transition="TERMINAL";
     if(sql.includes("SET phase=$2,source_reconciled=true"))transition="ACK";
     const result=await query(sql,p); // actual server COMMIT completes before this application ACK fault
     if(sql==="COMMIT"&&remaining.delete(transition))throw Error("TEST_ONLY_"+transition+"_ACK_LOST");
     return result;
    };
    db.release=(error?:Error|boolean)=>{(db as any).query=query;db.release=release;release(error);};return db;
   });
  })as any);return remaining;
 }
 it.each(["prepareNativeRead","acquireNativeRead"] as const)(
  "refuses valid frame v2 at %s before finite custody/sign/send",async method=>{
   const {request_digest:_requestDigest,...binding}=ctx.binding;
   const intent={schema_version:"pma.manager-read-intent.v2",action:"scoped_notice",
    stream_id:randomUUID(),frame_ordinal:"1",dataset_id:"TEST_ONLY-dataset",
    query_digest:raw("1"),field_set_digest:raw("2"),
    projection_generation:"TEST_ONLY-generation",source_cursor_digest:raw("3"),
    frame_sha256:raw("4"),stream_scope_digest:raw("5")};
   const canonical=(value:unknown):string=>value&&typeof value==="object"
    ?"{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+
      canonical((value as Record<string,unknown>)[key])).join(",")+"}"
    :JSON.stringify(value);
   const digest=createHash("sha256").update(canonical({binding,domain:ctx.domain,
    deadline:ctx.deadline,manager_intent:intent})).digest("hex");
   const input={...ctx,binding:{...ctx.binding,request_digest:digest},
    manager_intent:{...intent,digest}};
   const cap={request_bytes:32768,response_bytes:32768};
   expect(JSON.parse(prepareNativeBusinessReadRequest("status",input,cap).base_body)
    .manager_intent.schema_version).toBe("pma.manager-read-intent.v2");
   const snapshot=async()=>({
    authority:(await pool.query("SELECT * FROM elp210_candidate.authority ORDER BY singleton")).rows,
    obligations:(await pool.query("SELECT * FROM elp210_candidate.native_read_obligations ORDER BY lease_id")).rows,
    events:(await pool.query("SELECT * FROM elp210_candidate.native_read_events ORDER BY event_id")).rows,
    leases:(await pool.query("SELECT * FROM elp210_candidate.leases ORDER BY lease_id")).rows,
   });
   const before=await snapshot();
   const connect=vi.spyOn(pool,"connect"),sign=vi.spyOn(SignJWT.prototype,"sign");
   const signRequest=vi.spyOn(candidate,"signNativeReadRequest");
   try{
    await expect(candidate[method](actor,input)).rejects.toMatchObject({
     code:"CURRENT_HUMAN_NATIVE_FRAME_LIFECYCLE_REQUIRED"});
    expect(connect).not.toHaveBeenCalled();
    expect(signRequest).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
   }finally{connect.mockRestore();signRequest.mockRestore();sign.mockRestore();}
   expect(await snapshot()).toEqual(before);
   expect(await pending()).toBe(0);expect(calls).toEqual([]);
   expect(humanAssertions).toEqual([]);expect(receipts.size).toBe(0);
  });
 it("admits once in NC01 native family; no reverse row or HTTP authority from returned carrier",async()=>{
  const h=await candidate.prepareNativeRead(actor,ctx),r=await row();
  expect(r).toMatchObject({lifecycle_kind:"MANAGER_HTTP",phase:"ADMITTED",subject_id:actor.user_id,no_send_fenced:false,source_reconciled:false});
  expect(r.base_body).toBe(prepareNativeBusinessReadRequest("status",ctx,{request_bytes:32768,response_bytes:32768}).base_body);
  expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
  expect(await pending()).toBe(1);expect(calls).toEqual([]);
  await expect(candidate.signNativeReadRequest(h,"enter")).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
  const recovered=await candidate.reconcileNativeRead(ctx.binding.lease_id);
  expect(recovered.state).toBe("RECONCILED");expect(calls).toEqual(["status","cancel-unentered"]);expect(await pending()).toBe(0);
 });
 it("retains actual physical SENDING through HTTP finish AND authenticated PM resolve ACK",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);holdResolve=deferred<void>();resolveArrived=deferred<void>();
  await exchange(async({response,received})=>{
   const actualEnd=ServerResponse.prototype.end;
   vi.spyOn(response,"end").mockImplementation(function(this:ServerResponse,...args:any[]){
    expect(pool.idleCount).toBe(pool.totalCount);return(actualEnd as any).apply(this,args);
   });
   const sending=candidate.sendNativeRead(h,response,Buffer.from('{"ok":true}'));
   await bounded(resolveArrived!.promise);expect((await bounded(received)).complete).toBe(true);
   expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:false});expect(await pending()).toBe(1);
   await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
   holdResolve!.resolve();expect((await sending).state).toBe("RECONCILED");
   expect(await pending()).toBe(0);expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:true,source_ack_action:"resolve"});
  });
 });
 it("physical SENDING ACK loss uses actual reserved close, zero HTTP bytes and SAME-key ABORTED",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);faults("SENDING");
  await exchange(async({response})=>{
   const end=vi.spyOn(response,"end");
   await expect(candidate.sendNativeRead(h,response,Buffer.from("{}"))).rejects.toThrow("TEST_ONLY_SENDING_ACK_LOST");
   expect(end).not.toHaveBeenCalled();expect(response.headersSent).toBe(false);expect(response.destroyed).toBe(true);
   expect(await row()).toMatchObject({phase:"ABORTED",terminal_reason:"UNSENT_RESERVATION_QUIESCENT",source_reconciled:true});
   expect(calls.filter(x=>x==="issue")).toHaveLength(1);expect(calls.filter(x=>x==="enter")).toHaveLength(1);
   expect(calls.filter(x=>x==="resolve")).toHaveLength(1);expect(await pending()).toBe(0);
  });
 });
 it("owner pre-SENDING refusal aborts only after the exact reserved response and socket really close",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);
  expect((await candidate.beginDrain("TEST_ONLY-before-SENDING-drain")).status).toBe("DRAIN_PENDING");
  await exchange(async({response,received})=>{
   const socket=response.socket!;let responseClosed=false,socketClosed=false;
   response.once("close",()=>{responseClosed=true;});socket.once("close",()=>{socketClosed=true;});
   const end=vi.spyOn(response,"end"),body=Buffer.from('{"TEST_ONLY":"never-sent"}');
   await expect(candidate.sendNativeRead(h,response,body)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
   expect(end).not.toHaveBeenCalled();expect(response.headersSent).toBe(false);
   expect(responseClosed).toBe(true);expect(socketClosed).toBe(true);
   expect(response.destroyed).toBe(true);expect(socket.destroyed).toBe(true);
   expect((await received).complete).toBe(false);
   const terminal=await row();expect(terminal).toMatchObject({phase:"ABORTED",no_send_fenced:true,
    body_digest:"sha256:"+createHash("sha256").update(body).digest("hex"),source_reconciled:true,
    terminal_reason:"UNSENT_RESERVATION_QUIESCENT"});
   expect(terminal.receipt_id).toMatch(/^[0-9a-f-]{36}$/);
   expect(calls.filter(x=>x==="resolve")).toHaveLength(1);expect(await pending()).toBe(0);
  });
 });
 it("real-PG terminal shape rejects bodyless or missing-proof aborts and immutable terminal rewrites",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx),admitted=await row(),id=ctx.binding.lease_id;
  expect(admitted).toMatchObject({lifecycle_kind:"MANAGER_HTTP",phase:"ADMITTED",body_digest:null,receipt_id:null});
  expect(admitted.issue_response_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(admitted.enter_response_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET phase='ABORTED',receipt_id=$2,receipt_digest=$3,terminal_reason='TEST_ONLY-invalid-bodyless' WHERE lease_id=$1",
   [id,randomUUID(),hash("9")])).rejects.toMatchObject({code:"23514"});
  expect(await row()).toEqual(admitted);expect(await pending()).toBe(1);
  // PostgreSQL checks the terminal shape BEFORE its AFTER UPDATE trigger.
  // Missing ISSUE/ENTER evidence must fail without relying on later repair.
  for(const missing of["issue_response_digest","enter_response_digest"] as const){
   await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET phase='ABORTED',body_digest=$2,receipt_id=$3,receipt_digest=$4,terminal_reason='TEST_ONLY-invalid-proof',"+missing+"=NULL WHERE lease_id=$1",
    [id,hash("9"),randomUUID(),hash("8")])).rejects.toMatchObject({code:"23514"});
   expect(await row()).toEqual(admitted);expect(await pending()).toBe(1);
  }
  expect(calls).toEqual(["issue","enter"]);expect(receipts.size).toBe(0);
  expect((await candidate.beginDrain("TEST_ONLY-shape-drain")).status).toBe("DRAIN_PENDING");dropResolve=true;
  await exchange(async({response,received})=>{
   const end=vi.spyOn(response,"end");
   await expect(candidate.sendNativeRead(h,response,Buffer.from('{"TEST_ONLY":"genuine-unsent-close"}'))).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
   expect(end).not.toHaveBeenCalled();expect(response.destroyed).toBe(true);expect((await received).complete).toBe(false);
  });
  const terminal=await row();expect(terminal).toMatchObject({phase:"ABORTED",no_send_fenced:true,source_reconciled:false});
  expect(terminal.body_digest).toMatch(/^sha256:[0-9a-f]{64}$/);expect(terminal.receipt_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await pending()).toBe(1);
  const attempts=[
   {set:"body_digest=$2",value:hash("9")},{set:"receipt_id=$2",value:randomUUID()},
   {set:"receipt_digest=$2",value:hash("8")},{set:"no_send_fenced=$2",value:false},
  ];
  for(const attempt of attempts){
   await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET "+attempt.set+" WHERE lease_id=$1",[id,attempt.value]))
    .rejects.toMatchObject({code:"P0001",message:"CURRENT_HUMAN_NATIVE_TRANSITION_INVALID"});
   expect(await row()).toEqual(terminal);expect(await pending()).toBe(1);
  }
  const cold=await CurrentHumanCandidate.createNativeRead(pool,config);
  expect((await cold.reconcileNativeRead(id)).state).toBe("RECONCILED");
  expect(await row()).toMatchObject({phase:"ABORTED",source_reconciled:true,body_digest:terminal.body_digest,
   receipt_id:terminal.receipt_id,receipt_digest:terminal.receipt_digest,no_send_fenced:true});
  expect(calls.filter(x=>x==="resolve")).toHaveLength(2);expect(receipts.size).toBe(1);expect(await pending()).toBe(0);
 });
 it("cold SENDING without physical witness stays UNKNOWN until the owning actual HTTP finishes",async()=>{
  // TEST_ONLY scheduling allowance for the extra real-PG cold-read boundary;
  // no production default/cap is changed and exchange remains bounded at 3s.
  candidate=await CurrentHumanCandidate.createNativeRead(pool,{...config,egress:{...config.egress,send_timeout_ms:2500}});
  const h=await candidate.acquireNativeRead(actor,ctx);
  await exchange(async({response,received})=>{
   const socket=response.socket!,endReached=deferred<void>();let flush:(()=>void)|undefined;
   const closed=Promise.all([new Promise<void>(resolve=>response.once("close",()=>resolve())),
    new Promise<void>(resolve=>socket.once("close",()=>resolve()))]);
   const actualEnd=response.end;
   const end=vi.spyOn(response,"end").mockImplementation(function(this:ServerResponse,...args:any[]){
    flush=()=>{(actualEnd as any).apply(response,args);};endReached.resolve();return this;
   });
   const sending=candidate.sendNativeRead(h,response,Buffer.from('{"TEST_ONLY":"owner-finishes"}'));
   // Attach immediately so a genuine unexpected rejection is never unhandled.
   void sending.catch(()=>undefined);
   try{
    await bounded(endReached.promise);expect(end).toHaveBeenCalledTimes(1);
    expect(response.writableFinished).toBe(false);expect(response.headersSent).toBe(false);
    expect(await row()).toMatchObject({phase:"SENDING",source_reconciled:false,receipt_id:null,receipt_digest:null});
    const cold=await CurrentHumanCandidate.createNativeRead(pool,config);
    expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("UNKNOWN");
    expect(await row()).toMatchObject({phase:"UNKNOWN",source_reconciled:false,receipt_id:null,receipt_digest:null});
    expect(calls).toEqual(["issue","enter"]);expect(receipts.size).toBe(0);expect(await pending()).toBe(1);
    // Restore and call Node's original end on this exact captured response.
    // No fabricated finish/close event, reconstructed permit or source DTO.
    end.mockRestore();expect(flush).toBeTypeOf("function");flush!();
    expect((await bounded(sending)).state).toBe("RECONCILED");
    expect((await bounded(received)).complete).toBe(true);await bounded(closed);
    expect(response.writableFinished).toBe(true);expect(socket.destroyed).toBe(true);
    expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:true});
    expect(calls.filter(x=>x==="resolve")).toHaveLength(1);expect(await pending()).toBe(0);
   }finally{
    end.mockRestore();if(!response.destroyed)response.destroy();
    await bounded(sending.catch(()=>undefined));
   }
  });
 });
 it("SENDING and terminal ACK loss retain one immutable receipt; cold recovery never resends",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx),remaining=faults("SENDING","TERMINAL");
  await exchange(async({response})=>{
   const end=vi.spyOn(response,"end");
   await expect(candidate.sendNativeRead(h,response,Buffer.from("{}"))).rejects.toThrow("TEST_ONLY_SENDING_ACK_LOST");
   expect(remaining.size).toBe(0);expect(end).not.toHaveBeenCalled();const before=await row();
   expect(before).toMatchObject({phase:"ABORTED",source_reconciled:false});expect(await pending()).toBe(1);
   const cold=await CurrentHumanCandidate.createNativeRead(pool,config);expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
   const after=await row();expect(after.receipt_id).toBe(before.receipt_id);expect(after.receipt_digest).toBe(before.receipt_digest);
   expect(await pending()).toBe(0);expect(calls.filter(x=>x==="issue")).toHaveLength(1);
  });
 });
 it("finished HTTP with terminal ACK loss recovers durable receipt after release, no second end",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);faults("TERMINAL");
  await exchange(async({response})=>{
   const end=vi.spyOn(response,"end");
   await expect(candidate.sendNativeRead(h,response,Buffer.from("{}"))).rejects.toThrow("TEST_ONLY_TERMINAL_ACK_LOST");
   expect(end).toHaveBeenCalledTimes(1);expect(response.writableFinished).toBe(true);
   const before=await row();expect(before).toMatchObject({phase:"SERVED",source_reconciled:false});
   const cold=await CurrentHumanCandidate.createNativeRead(pool,config);expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
   expect((await row()).receipt_id).toBe(before.receipt_id);expect(calls.filter(x=>x==="issue")).toHaveLength(1);
  });
 });
 it("actual PM response disconnect after terminal keeps global pending until repeated authentic resolve ACK",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);dropResolve=true;
  await exchange(async({response})=>{
   await expect(candidate.sendNativeRead(h,response,Buffer.from("{}"))).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
   expect(response.writableFinished).toBe(true);const before=await row();
   expect(before).toMatchObject({phase:"SERVED",source_reconciled:false});expect(await pending()).toBe(1);
   const cold=await CurrentHumanCandidate.createNativeRead(pool,config);expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
   expect((await row()).receipt_id).toBe(before.receipt_id);expect(calls.filter(x=>x==="resolve")).toHaveLength(2);
   expect(calls.filter(x=>x==="issue")).toHaveLength(1);expect(await pending()).toBe(0);
  });
 });
 it("local source-ACK COMMIT loss reads actual reconciled state, no reissue or repeated source call",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);faults("ACK");
  await exchange(async({response})=>{
   await expect(candidate.sendNativeRead(h,response,Buffer.from("{}"))).rejects.toThrow("TEST_ONLY_ACK_ACK_LOST");
   expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:true});expect(await pending()).toBe(0);
   const count=calls.length,cold=await CurrentHumanCandidate.createNativeRead(pool,config);
   expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");expect(calls).toHaveLength(count);
  });
 });
 it("lost ENTER with no owning HTTP witness stays UNKNOWN; cold status cannot fabricate an abort",async()=>{
  dropEnter=true;await expect(candidate.acquireNativeRead(actor,ctx)).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
  expect(await row()).toMatchObject({phase:"ADMITTED",enter_response_digest:null,body_digest:null,source_reconciled:false});
  const cold=await CurrentHumanCandidate.createNativeRead(pool,config);expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("UNKNOWN");
  expect(await row()).toMatchObject({phase:"UNKNOWN",no_send_fenced:true,body_digest:null,source_reconciled:false,receipt_id:null,receipt_digest:null});
  expect(calls).toEqual(["issue","enter","status"]);expect(receipts.size).toBe(0);expect(await pending()).toBe(1);
 });
 it("admission physical ACK loss stays discoverable in existing combined queue; ABSENT needs actual cancel ACK",async()=>{
  faults("ADMIT");await expect(candidate.prepareNativeRead(actor,ctx)).rejects.toThrow("TEST_ONLY_ADMIT_ACK_LOST");
  expect(calls).toEqual([]);expect(await pending()).toBe(1);
  expect(await candidate.recoverableObligations()).toMatchObject([{family:"NATIVE_READ",attempt:{lease_id:ctx.binding.lease_id,lifecycle_kind:"MANAGER_HTTP"}}]);
  const cold=await CurrentHumanCandidate.createNativeRead(pool,config);expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
  expect(calls).toEqual(["status","cancel-unentered"]);expect(await row()).toMatchObject({phase:"CANCELLED",no_send_fenced:true,source_reconciled:true});
 });
 it("shaped/copied/Proxy selected source can NEVER supply actual native response authority",async()=>{
  for(const source of[{},Object.assign({},config.selected_source),new Proxy(config.selected_source,{})]){
   await expect(CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:source as SelectedNativeBusinessReadSource}))
    .rejects.toMatchObject({code:"NATIVE_READ_INSTANCE_UNVERIFIED"});
  }
  expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.native_read_obligations")).rows[0].n).toBe(0);
  expect(calls).toEqual([]);
 });

 it("all replicas share native-family global capacity instead of local-only slots",async()=>{
  const cfg={...config,limits:{...config.limits,maximum_unresolved:1,maximum_retained:4}},
   first=await CurrentHumanCandidate.createNativeRead(pool,cfg),second=await CurrentHumanCandidate.createNativeRead(pool,cfg),
   other=context();other.deadline=ctx.deadline;
  const results=await Promise.allSettled([first.prepareNativeRead(actor,ctx),second.prepareNativeRead(actor,other)]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
  expect((results.find(x=>x.status==="rejected")as PromiseRejectedResult).reason).toMatchObject({code:"CURRENT_HUMAN_CAPACITY_EXHAUSTED"});
  expect(await pending()).toBe(1);expect(calls).toEqual([]);
  const winner=results[0].status==="fulfilled"?first:second,winningContext=results[0].status==="fulfilled"?ctx:other;
  const cold=await CurrentHumanCandidate.createNativeRead(pool,cfg);
  expect((await cold.reconcileNativeRead(winningContext.binding.lease_id)).state).toBe("RECONCILED");
  expect(await pending()).toBe(0);
  // Original instance must read back the durable foreign ACK, not stay full
  // forever, discard unresolved state by TTL, or create a second recovery worker.
  await expect(winner.prepareNativeRead(actor,context())).resolves.toBeDefined();
  expect(await pending()).toBe(1);
 });
 it("default CUSTODY_ONLY SQL and carrier remain unchanged; cannot be converted or settled by HTTP factory",async()=>{
  const legacy=await CurrentHumanCandidate.create(pool,{issuer:config.issuer,audience:config.audience,key_id:config.key_id,private_key:config.private_key,
   source:{issuer:"TEST_ONLY-reverse",audience:"TEST_ONLY-reverse-aud",key_id:"TEST_ONLY-reverse-key",public_key:terminalPublic,workload_id:ctx.binding.workload_id},
   limits:config.limits,native_read_custody:(()=>{
    const source=selectedNativeBusinessReadSelection(config.selected_source);
    return{workspace_id:source.binding.workspace_id,environment:source.binding.environment,domain:source.domain,
      source_identity_digest:source.source_identity_digest};
   })()});
  const carrier=await legacy.admitNativeRead(actor,ctx);expect(carrier).not.toHaveProperty("lifecycle_kind");
  expect(await row()).toMatchObject({lifecycle_kind:"CUSTODY_ONLY",phase:"ADMITTED",sender_id:null,scope_digest:null,no_send_fenced:false,source_reconciled:false});
  await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET phase='SERVED' WHERE lease_id=$1",[ctx.binding.lease_id])).rejects.toMatchObject({code:"23514"});
  await expect(pool.query("UPDATE elp210_candidate.native_read_obligations SET lifecycle_kind='MANAGER_HTTP',sender_id=$2,scope_digest=$3 WHERE lease_id=$1",
   [ctx.binding.lease_id,randomUUID(),hash("8")])).rejects.toThrow("CURRENT_HUMAN_NATIVE_TRANSITION_INVALID");
  await expect(candidate.reconcileNativeRead(ctx.binding.lease_id)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_BINDING_INVALID"});
  expect(calls).toEqual([]);expect(await pending()).toBe(1);
 });
 it("future explicit domain DENY clamps deadline before SENDING, without waiting for wall-clock activation",async()=>{
  const fact=(await pool.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE grant_id=$1",[grantId])).rows[0].grant_fact;
  const deny={...fact,grant_id:grantId+"-future-deny",effect:"DENY",valid_from_ms:Date.now()+5000};
  await pool.query("INSERT INTO portal_access_grants_v2(grant_id,workspace_id,subject_user_id,issued_by,parent_grant_id,revision,grant_fact) VALUES($1,$2,$3,$4,NULL,$5,$6::jsonb)",
   [deny.grant_id,workspace,actor.user_id,owner,deny.revision,JSON.stringify(deny)]);
  await expect(candidate.prepareNativeRead(actor,ctx)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_DEADLINE_INVALID"});
  expect(await pending()).toBe(0);expect(calls).toEqual([]);
 });
 it("actual raw session/field/identity writes remain blocked from admission onward",async()=>{
  await candidate.prepareNativeRead(actor,ctx);
  await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  await expect(pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1",[actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  await expect(pool.query("UPDATE portal_access_policy_state SET policy=jsonb_set(policy,'{manager_read_domains,0,field_policy_ref}',to_jsonb('TEST_ONLY-changed'::text)) WHERE workspace_id=$1",[workspace])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  expect((await candidate.beginDrain("TEST_ONLY-native-drain")).status).toBe("DRAIN_PENDING");
  expect((await candidate.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
  expect((await candidate.drainStatus("TEST_ONLY-native-drain")).status).toBe("DRAIN_READY");
 });
 it("existing mutation coordinator repeats authentic resolve for durable SERVED, then revokes once",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);dropResolve=true;
  await exchange(async({response,received})=>{
   await expect(candidate.sendNativeRead(h,response,Buffer.from('{"TEST_ONLY":"served"}'))).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
   expect(response.writableFinished).toBe(true);expect((await received).complete).toBe(true);
  });
  const original=await row();expect(original).toMatchObject({phase:"SERVED",source_reconciled:false});
  expect(original.receipt_id).toMatch(/^[0-9a-f-]{36}$/);expect(await pending()).toBe(1);
  await pool.query("CREATE TABLE elp210_candidate.test_native_revoke_receipts(receipt_id text PRIMARY KEY)");
  const reverse=vi.fn(),native=vi.fn((attempt:any)=>candidate.reconcileNativeRead(attempt.lease_id));
  const coordinator=new CurrentHumanMutations(pool,candidate,{recover:reverse},{maximum_intents:4,maximum_recoveries_per_request:4},{recover:native});
  const apply=vi.fn(async(db:PoolClient)=>{
   expect(calls.filter(x=>x==="resolve")).toHaveLength(2);
   await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1",[actor.session_id]);
   await db.query("INSERT INTO elp210_candidate.test_native_revoke_receipts(receipt_id) VALUES('TEST_ONLY-revoked')");return{receipt:"TEST_ONLY-revoked"};
  });
  const result=await coordinator.execute({family:"AUTH_SESSION",operation:"REVOKE_SESSION",actor_id:actor.user_id,
   session_id:actor.session_id,session_revision:7,key_digest:hash("7"),request_digest:hash("8"),target_id:actor.session_id},{
   authorize:async(db)=>{expect((await db.query("SELECT 1 FROM auth_sessions WHERE session_id=$1 AND state='ACTIVE' AND session_version=7",[actor.session_id])).rowCount).toBe(1);},
   apply,terminal:r=>({outcome:"APPLIED",receipt_ref:r.receipt,reason_code:null})});
  expect(result).toEqual({receipt:"TEST_ONLY-revoked"});expect(apply).toHaveBeenCalledTimes(1);expect(native).toHaveBeenCalledTimes(1);expect(reverse).not.toHaveBeenCalled();
  expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:true,receipt_id:original.receipt_id,receipt_digest:original.receipt_digest});
  expect(receipts.size).toBe(1);expect(await pending()).toBe(0);
  expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1",[actor.session_id])).rows[0].state).toBe("REVOKED");
  expect((await pool.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0].drain_id).toBeNull();
 });
 it("actual shorter PM expiry clamps send while exact microseconds/+00:00 Base survives recovery",async()=>{
  ctx.deadline=ctx.deadline.slice(0,19)+".123456+00:00";leaseShortenMs=4000;
  const frozenTtlMs=config.limits.ttl_ms;
  const h=await candidate.acquireNativeRead(actor,ctx),r=await row();
  expect(Number(r.native_valid_until_ms)).toBe(Date.parse(ctx.deadline)-4000);
  expect(Number(r.expires_at_ms)).toBe(Date.parse(ctx.deadline));
  expect(r.deadline).toBe(ctx.deadline);
  assertOriginalJwtCeiling(r,frozenTtlMs);
  expect(humanAssertions[1].exp*1000).toBeGreaterThan(Number(r.native_valid_until_ms));
  await exchange(async({response,received})=>{
   expect((await candidate.sendNativeRead(h,response,Buffer.from("{}"))).state).toBe("RECONCILED");
   expect((await received).complete).toBe(true);
  });
  expect(await pending()).toBe(0);
 });
 it.each(jwtCapAxes)("rejects fractional Base before ISSUE when %s cap covers Base but not its JWT-second ceiling",async(axis)=>{
  ctx.deadline=fractionalBase();const expMs=baseExpMs(),cap=expMs-1;
  expect(nativeBusinessReadUtcMicroseconds(ctx.deadline)<BigInt(cap)*1000n).toBe(true);
  expect(BigInt(cap)*1000n<BigInt(expMs)*1000n).toBe(true);
  await capJwtAuthority(axis,cap);
  await expect(candidate.acquireNativeRead(actor,ctx)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_DEADLINE_INVALID"});
  expect(calls).toEqual([]);expect(humanAssertions).toEqual([]);
  expect(await row()).toBeUndefined();expect(await pending()).toBe(0);
 });
 it.each(jwtCapAxes)("accepts exact JWT-second %s cap with original fractional Base and original admitted TTL",async(axis)=>{
  ctx.deadline=fractionalBase();const expMs=baseExpMs(),frozenTtlMs=config.limits.ttl_ms;
  await capJwtAuthority(axis,expMs);
  const h=await candidate.acquireNativeRead(actor,ctx),record=await row();
  assertOriginalJwtCeiling(record,frozenTtlMs);
  expect(humanAssertions.every(x=>x.exp*1000===expMs)).toBe(true);
  expect(record.deadline).toBe(ctx.deadline);
  await exchange(async({response,received})=>{
   expect((await candidate.sendNativeRead(h,response,Buffer.from("{}"))).state).toBe("RECONCILED");
   expect((await received).complete).toBe(true);
  });
  expect(calls).toEqual(["issue","enter","status","resolve"]);expect(await pending()).toBe(0);
 });
 it("rechecks actual Core eligibility after real human signing; drain during await prevents ISSUE",async()=>{
  const sign=SignJWT.prototype.sign;let changed=0;
  const intercepted=vi.spyOn(SignJWT.prototype,"sign").mockImplementation(async function(this:SignJWT,...args:Parameters<typeof sign>){
   const token=await sign.apply(this,args);
   if(decodeJwt(token).purpose==="pma.identity.v1"){
    changed++;expect(pool.idleCount).toBe(pool.totalCount);
    expect((await candidate.beginDrain("TEST_ONLY-post-sign-drain")).status).toBe("DRAIN_PENDING");
   }
   return token;
  });
  try{
   await expect(candidate.acquireNativeRead(actor,ctx)).rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
  }finally{intercepted.mockRestore();}
  expect(changed).toBe(1);expect(calls).toEqual([]);expect(humanAssertions).toEqual([]);
  expect(await row()).toMatchObject({phase:"ADMITTED",source_reconciled:false,body_digest:null});
  expect(await pending()).toBe(1);
  // Keep the same admitted key discoverable; no forged ABORTED/TTL release.
  expect((await candidate.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
  expect(calls).toEqual(["status","cancel-unentered"]);expect(await pending()).toBe(0);
 });
 it("configured delivery installation cannot outlive actual selected wrapper or native interval",async()=>{
  await expect(CurrentHumanCandidate.createNativeRead(pool,{...config,
   installation_scope:{...config.installation_scope,valid_until_ms:config.installation_scope.valid_until_ms+1}}))
   .rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_CONFIG_INVALID"});
  const shortNative=new SelectedNativeBusinessReadSource({...selectedConfig,pins:{...selectedConfig.pins,
   native:{...selectedConfig.pins.native,expires_at:new Date(config.installation_scope.valid_until_ms-1).toISOString()}}});
  await expect(CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:shortNative}))
   .rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_CONFIG_INVALID"});
  expect(calls).toEqual([]);
  expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.native_read_obligations")).rows[0].n).toBe(0);
 });
 it("expired installation denies NEW reads but reconciles the genuine durable SERVED receipt",async()=>{
  const h=await candidate.acquireNativeRead(actor,ctx);dropResolve=true;
  await exchange(async({response,received})=>{
   await expect(candidate.sendNativeRead(h,response,Buffer.from('{"TEST_ONLY":"served-before-expiry"}'))).rejects.toMatchObject({code:"NATIVE_BUSINESS_READ_UNAVAILABLE"});
   expect(response.writableFinished).toBe(true);expect((await received).complete).toBe(true);
  });
  const original=await row();expect(original).toMatchObject({phase:"SERVED",source_reconciled:false});
  expect(original.receipt_id).toMatch(/^[0-9a-f-]{36}$/);expect(await pending()).toBe(1);
  const expired=Date.now()-1;
  const source=new SelectedNativeBusinessReadSource({...selectedConfig,installation_expires_at_utc_ms:expired});
  const cold=await CurrentHumanCandidate.createNativeRead(pool,{...config,selected_source:source,
   installation_scope:{...config.installation_scope,valid_until_ms:expired}});
  const fresh=context();fresh.deadline=ctx.deadline;
  await expect(cold.acquireNativeRead(actor,fresh)).rejects.toMatchObject({code:"CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID"});
  expect((await cold.reconcileNativeRead(ctx.binding.lease_id)).state).toBe("RECONCILED");
  expect(await row()).toMatchObject({phase:"SERVED",source_reconciled:true,receipt_id:original.receipt_id,receipt_digest:original.receipt_digest});
  expect(calls.filter(action=>action==="issue")).toHaveLength(1);
  expect(calls.filter(action=>action==="enter")).toHaveLength(1);
  expect(calls.filter(action=>action==="resolve")).toHaveLength(2);expect(receipts.size).toBe(1);expect(await pending()).toBe(0);
 });
});
