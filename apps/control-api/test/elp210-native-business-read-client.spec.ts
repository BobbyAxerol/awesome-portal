/** Private native READ transport regressions. SYNTHETIC TEST_ONLY.
 * This suite uses actual
 * ephemeral loopback TLS1.3/mTLS and the real request/codec; no openssl binary,
 * checked-in keys, mocked https, source signer/lease/grant or deployment claim. */
import {createHash,generateKeyPairSync,X509Certificate,type KeyObject} from "node:crypto";
import type {IncomingMessage,ServerResponse} from "node:http";
import {createServer,type Server} from "node:https";
import type {Socket} from "node:net";
import type {TLSSocket} from "node:tls";
import {afterAll,afterEach,beforeAll,describe,expect,it} from "vitest";
import {NativeBusinessReadClient,NativeBusinessReadClientError,nativeBusinessReadAuthenticatedResult,type NativeBusinessReadClientConfig}
  from "../src/execution-v2/native-business-read-client";
import {prepareNativeBusinessReadRequest,parseNativeBusinessReadResult,type NativeBusinessReadAction,type PreparedNativeBusinessReadRequest}
  from "../src/execution-v2/native-business-read-codec";
import {commonName,testCertificate} from "./fixtures/elp210-test-certificates";

const digest=(bytes:string|Uint8Array)=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const LIMITS={request_bytes:32768,response_bytes:32768};
const WORKLOAD="TEST_ONLY-native-read",TOKEN="TEST_ONLY-not-a-JWT-or-source-authority";
const nativeBinding=()=>({lease_id:"11111111-1111-1111-1111-111111111111",attempt_id:"22222222-2222-2222-2222-222222222222",
  human_issuer:"urn:TEST_ONLY:portal",subject:"TEST_ONLY-human",workspace_id:"TEST_ONLY-workspace",environment:"paper" as const,
  workload_id:WORKLOAD,request_digest:"a".repeat(64),operation:"READ" as const});
const nativeDomain=()=>({profile_id:"PAPER_TEST_ONLY",catalogue_sha256:"b".repeat(64),profile_sha256:"c".repeat(64),field_policy_sha256:"d".repeat(64)});
const deadline="2026-10-17T14:00:00.123456+00:00";
function nativeRequest(action:NativeBusinessReadAction="unknown"){
  const base={schema_version:"pma.native-business-read.request.v1",binding:nativeBinding(),domain:nativeDomain(),
    manager_intent:{schema_version:"pma.manager-read-intent.v1",action:"relation_page",digest:"a".repeat(64)},deadline};
  return action==="issue"||action==="enter"?{...base,human_token:TOKEN}:action==="resolve"?{...base,signed_terminal:TOKEN}:base;
}
const prepared=(action:NativeBusinessReadAction="unknown")=>prepareNativeBusinessReadRequest(action,nativeRequest(action),LIMITS);
function nativeReply(action:NativeBusinessReadAction="unknown") {
  const common={schema_version:"pma.native-business-read.result.v1",binding:nativeBinding(),component:"NATIVE_BUSINESS_READ_ONLY"};
  if(action==="issue")return {...common,state:"ISSUED",human:{issuer:nativeBinding().human_issuer,subject:nativeBinding().subject,
    portal_user_id:"TEST_ONLY-human",ts_user_id:"33333333-3333-3333-3333-333333333333",
    mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:9"},domain:{...nativeDomain(),environment:"paper"},
    permission:{scope_kind:"MANAGER_CATALOGUE_DOMAIN",action:"business.read_all",delegable:false},
    native:{revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:digest("receipt"),document_digest:digest("document"),
      policy_revision:"1",owner_mapping_revision:"ts-user:55555555-5555-5555-5555-555555555555:7",semantic_revision:digest("semantic"),
      effective_from:"2026-10-17T13:59:00Z",expires_at:deadline},lease:{source_digest:"e".repeat(64),source_fingerprint:"f".repeat(64),expires_at:deadline}};
  if(action==="enter")return {...common,state:"ENTERED"};
  if(action==="unknown")return {...common,state:"UNKNOWN"};
  if(action==="status")return {...common,state:"OBSERVATION",may_authorize_read:false,recovery:{state:"ABSENT",terminal_authority:false,release_permitted:false}};
  if(action==="cancel-unentered")return {...common,state:"CANCELLED",may_authorize_read:false,
    recovery:{state:"CANCELLED",cancellation_authority:true,release_permitted:true}};
  return {...common,state:"SETTLED",may_authorize_read:false,recovery:{state:"SETTLED",phase:"SERVED",terminal_authority:true,release_permitted:true}};
}
function deferred<T=void>(){let resolve!:(value:T|PromiseLike<T>)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

type Authority={key:KeyObject;name:Buffer;cert:Buffer};
type Identity={key:Buffer;cert:Buffer;ca:Buffer;pin:string};
function authority(label:string):Authority{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),dn=commonName(`TEST_ONLY_${label}`);
  return {key:keys.privateKey,name:dn,cert:testCertificate(dn,keys,{name:dn,key:keys.privateKey},true)};}
function identity(label:string,ca:Authority,host="localhost"):Identity{const keys=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
  const cert=testCertificate(commonName(`TEST_ONLY_${label}`),keys,ca,false,host);return {key:Buffer.from(keys.privateKey.export({type:"pkcs8",format:"pem"})),
    cert,ca:ca.cert,pin:digest(new X509Certificate(cert).raw)};}

describe("ELP2-10 real native business READ TLS transport — synthetic wire, no source authority",()=>{
  let core:Identity,pm:Identity,otherPm:Identity,foreignPm:Identity,foreignCore:Identity,wrongHost:Identity;
  const allocations:Array<{server:Server;sockets:Set<Socket>}>=[];
  beforeAll(()=>{const ca=authority("native_root"),foreign=authority("native_foreign");core=identity("core",ca);pm=identity("pm",ca);
    otherPm=identity("other_pm",ca);foreignPm=identity("foreign_pm",foreign);foreignCore=identity("foreign_core",foreign);
    wrongHost=identity("wrong_host",ca,"not-this-host.invalid");},15000);
  afterEach(async()=>{for(const {server,sockets} of allocations.splice(0)){const closed=new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const socket of sockets)socket.destroy();server.closeAllConnections();await closed;}});
  afterAll(()=>{for(const item of [core,pm,otherPm,foreignPm,foreignCore,wrongHost])item?.key.fill(0);});
  type Handler=(req:IncomingMessage,res:ServerResponse,body:Buffer)=>void;
  async function endpoint(handler:Handler=(_req,res)=>json(res,nativeReply()),options:{identity?:Identity;tls12?:boolean;requestCert?:boolean}={}){
    const id=options.identity??pm,sockets=new Set<Socket>(),received:Array<{path:string;method:string;headers:IncomingMessage["headers"];body:Buffer}>=[];
    let applicationBytes=0;
    const server=createServer({key:id.key,cert:id.cert,ca:core.ca,requestCert:options.requestCert??true,rejectUnauthorized:true,
      minVersion:options.tls12?"TLSv1.2":"TLSv1.3",maxVersion:options.tls12?"TLSv1.2":"TLSv1.3"},(req,res)=>{
      const chunks:Buffer[]=[];req.on("error",()=>{});res.on("error",()=>{});req.on("data",chunk=>chunks.push(Buffer.from(chunk)));
      req.on("end",()=>{const body=Buffer.concat(chunks);received.push({path:req.url??"",method:req.method??"",headers:req.headers,body});handler(req,res,body);});});
    server.on("tlsClientError",()=>{});server.on("clientError",(_error,socket)=>socket.destroy());
    server.on("connection",socket=>{sockets.add(socket);socket.once("close",()=>sockets.delete(socket));});
    server.on("secureConnection",socket=>{socket.on("data",chunk=>{applicationBytes+=chunk.length;});});
    allocations.push({server,sockets});
    await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});});
    const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY_LISTEN");
    return {origin:`https://127.0.0.1:${address.port}`,server,sockets,received,applicationBytes:()=>applicationBytes};
  }
  function json(res:ServerResponse,value:unknown){const body=Buffer.from(JSON.stringify(value));res.writeHead(200,
    {"content-type":"application/json","content-length":String(body.length),"connection":"close","cache-control":"no-store"});res.end(body);}
  function config(origin:string,changes:Partial<NativeBusinessReadClientConfig>={}):NativeBusinessReadClientConfig{return {origin,
    tls:{key:core.key,cert:core.cert,ca:pm.ca},pm_leaf_sha256:pm.pin,workload_id:WORKLOAD,deadline_ms:2000,
    request_bytes:32768,response_bytes:32768,max_inflight:1,...changes};}
  async function refusal(promise:Promise<unknown>,code="NATIVE_BUSINESS_READ_UNAVAILABLE",delivery?:"NOT_ATTEMPTED"|"MAY_HAVE_OCCURRED"){
    let caught:unknown;try{await promise;}catch(error){caught=error;}
    expect(caught).toBeInstanceOf(NativeBusinessReadClientError);expect(caught).toMatchObject({code,
      message:"The native business read transport is not available.",...(delivery?{http_delivery:delivery}:{})});
    expect(String(caught)).not.toMatch(/PRIVATE_|BEGIN |TEST_ONLY-human|127\.0\.0\.1|SSL|CERT|SQL/);return caught;
  }
  const drained=async(client:NativeBusinessReadClient)=>{await expect.poll(()=>client.snapshot().in_flight,{timeout:2000}).toBe(0);};

  it.each(["issue","enter","unknown","status","cancel-unentered","resolve"] as const)("exchanges exact %s POST bytes and closed framing over actual TLS1.3/mTLS",async action=>{
    const lane=await endpoint((_req,res)=>json(res,nativeReply(action))),client=new NativeBusinessReadClient(config(lane.origin)),context=prepared(action);
    expect(client.snapshot()).toEqual({in_flight:0});const reply=await client.call(context);expect(reply).toEqual(nativeReply(action));await drained(client);
    expect(lane.received).toHaveLength(1);expect(lane.received[0]).toMatchObject({method:"POST",path:`/internal/elp210/business-root-read/${action}`});
    expect(lane.received[0].body.equals(Buffer.from(context.body))).toBe(true);
    expect(lane.received[0].headers).toMatchObject({"content-type":"application/json","content-length":String(Buffer.byteLength(context.body)),connection:"close"});
    expect(lane.received[0].headers).not.toHaveProperty("transfer-encoding");expect(Object.isFrozen(reply)).toBe(true);
    expect(reply).not.toHaveProperty("held_handle");expect(reply).not.toHaveProperty("operational_current");
    const witness=nativeBusinessReadAuthenticatedResult(client,reply);
    expect(Object.isFrozen(witness)).toBe(true);expect(witness.result).toBe(reply);
    expect(witness).toMatchObject({action,base_body:context.base_body,binding_digest:context.binding_digest,
      stable_core_digest:context.stable_core_digest,response_sha256:digest(JSON.stringify(nativeReply(action)))});
    expect(JSON.parse(witness.base_body)).not.toHaveProperty("human_token");
    expect(JSON.parse(witness.base_body)).not.toHaveProperty("signed_terminal");
    expect(witness).not.toHaveProperty("release_permitted");expect(witness).not.toHaveProperty("held_handle");
  });
  it("authenticates only this selected client and actual reply identity, not codec-only parses or shaped/cloned witnesses",async()=>{
    const lane=await endpoint(),client=new NativeBusinessReadClient(config(lane.origin)),context=prepared();
    const result=await client.call(context);await drained(client);
    const other=new NativeBusinessReadClient(config(lane.origin));
    expect(()=>nativeBusinessReadAuthenticatedResult(other,result)).toThrowError(expect.objectContaining({code:"NATIVE_BUSINESS_READ_RESULT_UNVERIFIED"}));
    let traps=0;const getter={};Object.defineProperty(getter,"state",{enumerable:true,get(){traps++;throw new Error("PRIVATE_GETTER");}});
    const proxy=new Proxy(result,{get(){traps++;throw new Error("PRIVATE_PROXY");},ownKeys(){traps++;throw new Error("PRIVATE_PROXY");},
      getPrototypeOf(){traps++;throw new Error("PRIVATE_PROXY");}}),revoked=Proxy.revocable(result,{});revoked.revoke();
    const codecOnly=parseNativeBusinessReadResult(context,Buffer.from(JSON.stringify(nativeReply())));
    for(const value of [{...result},JSON.parse(JSON.stringify(result)),codecOnly,getter,proxy,revoked.proxy,null,undefined])
      expect(()=>nativeBusinessReadAuthenticatedResult(client,value)).toThrowError(expect.objectContaining({code:"NATIVE_BUSINESS_READ_RESULT_UNVERIFIED"}));
    expect(traps).toBe(0);expect(lane.received).toHaveLength(1);expect(other.snapshot()).toEqual({in_flight:0});
    expect(nativeBusinessReadAuthenticatedResult(client,result).result).toBe(result);
  });
  it.each(["pin","ca","hostname","tls-version"] as const)("sends zero HTTP application bytes on %s trust failure",async kind=>{
    const selected=kind==="ca"?foreignPm:kind==="hostname"?wrongHost:pm;
    const lane=await endpoint(undefined,{identity:selected,tls12:kind==="tls-version"});
    const client=new NativeBusinessReadClient(config(lane.origin,{pm_leaf_sha256:kind==="pin"?otherPm.pin:selected.pin}));
    await refusal(client.call(prepared()),undefined,"NOT_ATTEMPTED");await drained(client);
    await expect.poll(()=>lane.sockets.size,{timeout:2000}).toBe(0);
    expect(lane.received).toEqual([]);expect(lane.applicationBytes()).toBe(0);
  });
  it("does not reach server HTTP with a foreign client certificate",async()=>{
    const lane=await endpoint(),client=new NativeBusinessReadClient(config(lane.origin,{tls:{key:foreignCore.key,cert:foreignCore.cert,ca:pm.ca}}));
    // TLS1.3 client can emit secureConnect before the server's client-cert alert;
    // do not invent NOT_ATTEMPTED from the server's rejection.
    await refusal(client.call(prepared()));await drained(client);expect(lane.received).toEqual([]);expect(lane.applicationBytes()).toBe(0);
  });
  it("snapshots mutable TLS/config inputs before any caller can change them",async()=>{
    const lane=await endpoint(),key=Buffer.from(core.key),cert=Buffer.from(core.cert),ca=Buffer.from(pm.ca);
    const original=config(lane.origin,{tls:{key,cert,ca}}),client=new NativeBusinessReadClient(original);
    original.origin="https://unapproved.invalid";original.pm_leaf_sha256=otherPm.pin;original.workload_id="other";original.request_bytes=1;
    key.fill(0);cert.fill(0);ca.fill(0);expect(await client.call(prepared())).toEqual(nativeReply());await drained(client);
    expect(lane.received).toHaveLength(1);
  });
  it("refuses forged, cloned, getter and Proxy carriers without reflection or HTTP",async()=>{
    const lane=await endpoint(),client=new NativeBusinessReadClient(config(lane.origin)),context=prepared();let traps=0;
    const getter={};Object.defineProperty(getter,"body",{enumerable:true,get(){traps++;throw new Error("PRIVATE_GETTER");}});
    const proxy=new Proxy(context,{get(){traps++;throw new Error("PRIVATE_PROXY");},getPrototypeOf(){traps++;throw new Error("PRIVATE_PROXY");},
      ownKeys(){traps++;throw new Error("PRIVATE_PROXY");}}),revoked=Proxy.revocable(context,{});revoked.revoke();
    for(const value of [{...context},JSON.parse(JSON.stringify(context)),getter,proxy,revoked.proxy,null])
      await refusal(client.call(value as PreparedNativeBusinessReadRequest),"NATIVE_BUSINESS_READ_REQUEST_INVALID","NOT_ATTEMPTED");
    expect(traps).toBe(0);expect(lane.received).toEqual([]);expect(client.snapshot().in_flight).toBe(0);
  });
  it("refuses workload mismatch and a smaller transport byte cap before opening HTTP",async()=>{
    const lane=await endpoint();for(const changes of [{workload_id:"TEST_ONLY-other"},{request_bytes:1}]){
      const client=new NativeBusinessReadClient(config(lane.origin,changes));
      await refusal(client.call(prepared()),"NATIVE_BUSINESS_READ_REQUEST_INVALID","NOT_ATTEMPTED");expect(client.snapshot().in_flight).toBe(0);}
    expect(lane.received).toEqual([]);
  });
  it("holds quota for a genuinely pending real request and admits again only after completion closes",async()=>{
    const entered=deferred(),release=deferred();const lane=await endpoint(async(_req,res)=>{entered.resolve();await release.promise;json(res,nativeReply());});
    const client=new NativeBusinessReadClient(config(lane.origin)),first=client.call(prepared());
    try{await entered.promise;expect(client.snapshot().in_flight).toBe(1);
      await refusal(client.call(prepared()),"NATIVE_BUSINESS_READ_BUSY","NOT_ATTEMPTED");expect(lane.received).toHaveLength(1);
      release.resolve();expect(await first).toEqual(nativeReply());await drained(client);
      expect(await client.call(prepared())).toEqual(nativeReply());await drained(client);expect(lane.received).toHaveLength(2);
    }finally{release.resolve();await first.catch(()=>{});}
  });
  it("times out after actual HTTP send without fabricating rollback/release, then reuses admission after real close",async()=>{
    const entered=deferred();let reply=false;
    const lane=await endpoint((_req,res)=>{entered.resolve();if(reply)json(res,nativeReply());});
    const client=new NativeBusinessReadClient(config(lane.origin,{deadline_ms:1000}));
    // Attach rejection handling immediately; a saturated cell must fail a
    // handshake-timeout assertion, not create an unhandled rejection/hang.
    const pending=refusal(client.call(prepared()),"NATIVE_BUSINESS_READ_DEADLINE_EXCEEDED","MAY_HAVE_OCCURRED");
    await Promise.race([entered.promise,pending.then(()=>{throw new Error("TEST_ONLY_HTTP_SEND_WAS_NOT_OBSERVED");})]);
    const failure=await pending;
    expect(failure).not.toHaveProperty("release_permitted");expect(failure).not.toHaveProperty("phase");await drained(client);
    reply=true;expect(await client.call(prepared())).toEqual(nativeReply());await drained(client);
  });
  it("treats disconnect after body as uncertain and never retries",async()=>{
    const lane=await endpoint(req=>req.socket.destroy()),client=new NativeBusinessReadClient(config(lane.origin));
    await refusal(client.call(prepared()),undefined,"MAY_HAVE_OCCURRED");await drained(client);expect(lane.received).toHaveLength(1);
  });
  it.each([301,302,307,308,400,401,403,409,500,503])("refuses HTTP %i without redirect/retry or native status invention",async status=>{
    const lane=await endpoint((_req,res)=>{res.writeHead(status,{location:"https://PRIVATE_UNAPPROVED.invalid",connection:"close"});res.end("PRIVATE_SOURCE_DIAGNOSTIC");});
    const client=new NativeBusinessReadClient(config(lane.origin));await refusal(client.call(prepared()),undefined,"MAY_HAVE_OCCURRED");
    await drained(client);expect(lane.received).toHaveLength(1);
  });
  it.each(["encoding","chunked","duplicate-cache","duplicate-length","leading-zero-length","missing-length","wrong-type","wrong-cache","keep-alive","header-cap","byte-cap","truncated","invalid-utf8","duplicate-json","wrong-binding"] as const)(
    "refuses exact raw response boundary %s over real TLS",async kind=>{
      const ordinary=Buffer.from(JSON.stringify(nativeReply()));let body=ordinary,headers=["Content-Type: application/json","Connection: close","Cache-Control: no-store"],length=ordinary.length;
      if(kind==="encoding")headers.push("Content-Encoding: identity");
      if(kind==="chunked")headers.push("Transfer-Encoding: chunked");
      if(kind==="duplicate-cache")headers.push("Cache-Control: no-store");
      if(kind==="wrong-type")headers[0]="Content-Type: application/json; charset=utf-8";
      if(kind==="wrong-cache")headers[2]="Cache-Control: private";
      if(kind==="keep-alive")headers[1]="Connection: keep-alive";
      if(kind==="header-cap")for(let i=0;i<33;i++)headers.push(`X-Test-${i}: bounded`);
      if(kind==="byte-cap")length=32769;
      if(kind==="truncated")length=ordinary.length+1;
      if(kind==="invalid-utf8")body=Buffer.from([0xc3,0x28]);
      if(kind==="duplicate-json")body=Buffer.from(JSON.stringify(nativeReply()).replace('"state":"UNKNOWN"','"state":"UNKNOWN","state":"UNKNOWN"'));
      if(kind==="wrong-binding"){const value=nativeReply();value.binding.subject="TEST_ONLY-other";body=Buffer.from(JSON.stringify(value));}
      if(["invalid-utf8","duplicate-json","wrong-binding"].includes(kind))length=body.length;
      if(kind!=="missing-length")headers.push(`Content-Length: ${kind==="leading-zero-length"?"0":""}${length}`);
      if(kind==="duplicate-length")headers.push(`Content-Length: ${length}`);
      const lane=await endpoint(req=>{const socket=req.socket as TLSSocket;
        socket.end(Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\n${headers.join("\r\n")}\r\n\r\n`),body]));});
      const client=new NativeBusinessReadClient(config(lane.origin));await refusal(client.call(prepared()),undefined,"MAY_HAVE_OCCURRED");
      await drained(client);expect(lane.received).toHaveLength(1);
  });
  it("sanitizes malformed PEM setup failures and releases an actually created request",async()=>{
    const lane=await endpoint(),client=new NativeBusinessReadClient(config(lane.origin,{tls:{key:"PRIVATE_KEY_ERROR",cert:core.cert,ca:pm.ca}}));
    await refusal(client.call(prepared()),undefined,"NOT_ATTEMPTED");await drained(client);expect(lane.received).toEqual([]);
  });
  it("refuses invalid configuration, own getters and Proxy inputs without executing traps",()=>{
    const valid=config("https://127.0.0.1:1"),bad:unknown[]=[null,[],{...valid,extra:true},{...valid,origin:"http://127.0.0.1"},
      {...valid,origin:"https://user:PRIVATE@127.0.0.1"},{...valid,origin:"https://127.0.0.1/path"},
      {...valid,origin:"https://127.0.0.1?x=1"},{...valid,pm_leaf_sha256:"a".repeat(64)},
      ...[0,-1,1.5,NaN,Infinity,17].map(max_inflight=>({...valid,max_inflight})),
      {...valid,deadline_ms:10001},{...valid,response_bytes:32769},{...valid,request_bytes:0},
      {...valid,tls:{...valid.tls,key:Buffer.alloc(0)}},{...valid,tls:{...valid.tls,ca:Buffer.alloc(32769)}},
      {...valid,tls:{key:core.key,ca:pm.ca}}];let traps=0;
    const getter={...valid};Object.defineProperty(getter,"tls",{enumerable:true,get(){traps++;throw new Error("PRIVATE");}});
    bad.push(getter,new Proxy(valid,{get(){traps++;throw new Error("PRIVATE");},ownKeys(){traps++;throw new Error("PRIVATE");},
      getPrototypeOf(){traps++;throw new Error("PRIVATE");}}));
    for(const value of bad){let caught:unknown;try{new NativeBusinessReadClient(value as NativeBusinessReadClientConfig);}catch(error){caught=error;}
      expect(caught).toBeInstanceOf(NativeBusinessReadClientError);expect(caught).toMatchObject({code:"NATIVE_BUSINESS_READ_CONFIG_INVALID",http_delivery:"NOT_ATTEMPTED"});}
    expect(traps).toBe(0);
  });
});
