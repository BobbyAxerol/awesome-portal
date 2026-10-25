/** TEST_ONLY private files/PKI and explicit schema/ledger doubles. No PG,
 * source registration, listener, ROOT receipt, grant or commissioning proof. */
import {createHash,generateKeyPairSync} from "node:crypto";
import {chmod,mkdtemp,rm,stat,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {FactoryProvider} from "@nestjs/common";
import type {Pool} from "pg";
import {afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {AppModule,type ControlApiDependencies} from "../src/app.module";
import type {ControlApiConfig} from "../src/config";
import type {AccessTrustProvider} from "../src/execution-v2/access-trust";
import {unqualifiedAccessTrust} from "../src/execution-v2/access-trust";
import * as schema from "../src/execution-v2/current-human-schema";
import type {CurrentHumanCandidate} from "../src/execution-v2/current-human-candidate";
import {CurrentHumanMutations} from "../src/execution-v2/current-human-mutations";
import {selectPrivateCorePoolProfile} from "../src/execution-v2/financial-source-bootstrap";
import * as coreRuntime from "../src/execution-v2/native-core-runtime";
import {nativeRootCanonical} from "../src/execution-v2/native-root-codec";
import {NativeRootReceiptProvider} from "../src/execution-v2/native-root-provider";
import {NativeRootRuntimeError,nativeRootRuntimeReference,prepareNativeRootRuntime,prepareNativeRootApplication,
 type NativeRootRuntimeReference} from "../src/execution-v2/native-root-runtime";
import {NativeRootSourceClient} from "../src/execution-v2/native-root-source-client";
import {commonName,testCertificate,type TestAuthority} from "./fixtures/elp210-test-certificates";

const hash=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
const owner="TEST_ONLY-root-owner",workspace="TEST_ONLY-root-workspace",workload="TEST_ONLY-native-ROOT";
const roots=new Set<string>();
let ca:Buffer,key:Buffer,cert:Buffer,terminal:Buffer;
beforeAll(()=>{
 const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY-root-ca");
 const authority:TestAuthority={key:pair.privateKey,name,certificate:testCertificate(name,pair,{name,key:pair.privateKey},true)};
 ca=authority.certificate;
 const leaf=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
 key=Buffer.from(leaf.privateKey.export({type:"pkcs8",format:"pem"}));
 cert=testCertificate(commonName("TEST_ONLY-root-client"),leaf,authority,false,"root.research.test");
 terminal=Buffer.from(generateKeyPairSync("ed25519").privateKey.export({type:"pkcs8",format:"pem"}));
});
afterEach(async()=>{vi.restoreAllMocks();for(const root of roots)await rm(root,{recursive:true,force:true});roots.clear();});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"TEST_ONLY-native-root-runtime-"));roots.add(root);await chmod(root,0o700);let count=0;
 const leaf=async(bytes:string|Buffer):Promise<NativeRootRuntimeReference>=>{
  const path=join(root,`private-${count++}`);await writeFile(path,bytes,{mode:0o600,flag:"wx"});await chmod(path,0o600);
  return{path,sha256:hash(bytes)};
 };
 const value={schema_version:"portal.execution.native-root-runtime.v1",target:{kind:"RESEARCH",environment:"paper"},
  schema_target:{database_name:"TEST_ONLY-control",database_system_identifier:"123456",role_name:"TEST_ONLY-role",
   protected_owner_user_id:owner,workspace_id:workspace,principal_workspace_pins:[{user_id:owner,workspace_id:workspace}]},
  pool_profile:{max:3,connectionTimeoutMillis:5000,statement_timeout:4000,query_timeout:5000,idle_in_transaction_session_timeout:5000},
  purpose:"QUALIFIED_ROOT_RECEIPT",provider:{source:{human_issuer:"TEST_ONLY-core",subject:owner,workspace_id:workspace,environment:"paper",workload_id:workload},
   registration:{correspondence_id:"TEST_ONLY-ROOT-correspondence",expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
   original:{grant_id:"TEST_ONLY-ROOT-grant",accepted_fact_digest:`sha256:${"b".repeat(64)}`},
   correspondence:{registry_revision:`sha256:${"c".repeat(64)}`,payload_sha256:"d".repeat(64),approval_ref:"TEST_ONLY-not-owner-approval"},
   maximum_retained:128,maximum_unresolved:4,maximum_recoveries:4,attempt_ms:30000},
  terminal:{issuer:"TEST_ONLY-root-terminal",audience:"TEST_ONLY-pm-root-terminal",key_id:"TEST_ONLY-root-key",ttl_seconds:30,private_key_ref:await leaf(terminal)},
  transport:{origin:"https://10.70.0.2:29455",edge_leaf_sha256:`sha256:${"f".repeat(64)}`,workload_id:workload,
   tls:{key_ref:await leaf(key),cert_ref:await leaf(cert),ca_ref:await leaf(ca)},deadline_ms:5000,request_bytes:32768,response_bytes:65536,max_inflight:2}};
 return{root,value,leaf,manifest:(input:unknown=value)=>leaf(nativeRootCanonical(input))};
}
async function refused(pin:NativeRootRuntimeReference){
 const error=await prepareNativeRootRuntime(pin).catch(error=>error);
 expect(error).toBeInstanceOf(NativeRootRuntimeError);
 expect(error).toMatchObject({code:"NATIVE_ROOT_RUNTIME_CONFIG_INVALID",message:"The private root receipt composition is not available."});
 expect(error.message).not.toContain(pin.path);expect(error.message).not.toContain("PRIVATE KEY");
}

describe("private ROOT Research runtime preparation",()=>{
 it("is OFF without both refs and refuses partial/noncanonical selection before I/O",()=>{
  const read=vi.spyOn(coreRuntime,"readNativeRuntimeReference");
  expect(nativeRootRuntimeReference({})).toBeUndefined();
  const path="/TEST_ONLY/root.json",sha="a".repeat(64);
  expect(nativeRootRuntimeReference({CONTROL_API_NATIVE_ROOT_CONFIG_FILE:path,CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha})).toEqual({path,sha256:sha});
  for(const env of [{CONTROL_API_NATIVE_ROOT_CONFIG_FILE:path},{CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha},
   {CONTROL_API_NATIVE_ROOT_CONFIG_FILE:"",CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha},
   {CONTROL_API_NATIVE_ROOT_CONFIG_FILE:"relative",CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha},
   {CONTROL_API_NATIVE_ROOT_CONFIG_FILE:"/private/../root",CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha},
   {CONTROL_API_NATIVE_ROOT_CONFIG_FILE:path,CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha+"\n"},
   {CONTROL_API_NATIVE_ROOT_CONFIG_FILE:path,CONTROL_API_NATIVE_ROOT_CONFIG_SHA256:sha.toUpperCase()}])
   expect(()=>nativeRootRuntimeReference(env)).toThrow(NativeRootRuntimeError);
  expect(read).not.toHaveBeenCalled();
 });
 it("hydrates ROOT-specific registration/original and actual keys without DB/source work",async()=>{
  const f=await fixture(),call=vi.spyOn(NativeRootSourceClient.prototype,"call"),prepared=await prepareNativeRootRuntime(await f.manifest());
  expect(prepared.schemaTarget).toEqual(f.value.schema_target);expect(prepared.poolProfile).toEqual(f.value.pool_profile);
  expect(prepared.provider.source).toEqual(f.value.provider.source);expect(prepared.provider.original).toEqual(f.value.provider.original);
  expect(prepared.provider.registration).toEqual(f.value.provider.registration);
  expect(prepared.provider.terminal.private_key).toMatchObject({type:"private",asymmetricKeyType:"ed25519"});
  expect(prepared.provider.terminal).not.toHaveProperty("private_key_ref");expect(prepared.transport.tls).toEqual({key,cert,ca});
  expect(Object.isFrozen(prepared.schemaTarget)).toBe(true);expect(Object.isFrozen(prepared.poolProfile)).toBe(true);
  expect(prepared).not.toHaveProperty("currentRelations");expect(prepared).not.toHaveProperty("session");expect(call).not.toHaveBeenCalled();
 });
 it("wipes raw private inputs and failure outputs, keeping only successful separate TLS copies",async()=>{
  const f=await fixture(),read=coreRuntime.readNativeRuntimeReference,inputs:Buffer[]=[];
  vi.spyOn(coreRuntime,"readNativeRuntimeReference").mockImplementation(async(...args)=>{const bytes=await read(...args);inputs.push(bytes);return bytes;});
  const prepared=await prepareNativeRootRuntime(await f.manifest());expect(inputs).toHaveLength(5);
  expect(inputs.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);expect(prepared.transport.tls.key).toEqual(key);
  expect(prepared.transport.tls.key).not.toBe(inputs[1]);inputs.length=0;
  f.value.terminal.private_key_ref=await f.leaf("TEST_ONLY-invalid-key");await refused(await f.manifest());
  expect(inputs).toHaveLength(5);expect(inputs.every(bytes=>bytes.every(byte=>byte===0))).toBe(true);
 });
 it("pins every file by owner, nofollow, exact mode, hash and size",async()=>{
  const f=await fixture(),pin=await f.manifest();await refused({...pin,sha256:"0".repeat(64)});
  await chmod(pin.path,0o640);await refused(pin);await chmod(pin.path,0o600);
  const alias=join(f.root,"alias");await symlink(pin.path,alias);await refused({...pin,path:alias});
  await refused({...pin,path:f.root});await refused(await f.leaf(" ".repeat(65537)));
  await writeFile(f.value.transport.tls.cert_ref.path,"TEST_ONLY-replaced");await refused(pin);
  const uid=process.geteuid!();vi.spyOn(process,"geteuid").mockReturnValue(uid+1);await refused(pin);
 });
 it("accepts existing 0400 material without changing ownership or mode",async()=>{
  const f=await fixture(),pin=await f.manifest();await chmod(pin.path,0o400);await prepareNativeRootRuntime(pin);
  expect((await stat(pin.path)).mode&0o7777).toBe(0o400);
 });
 it("refuses duplicate, malformed, noncanonical and unknown fields at an exact matching outer hash",async()=>{
  const f=await fixture(),raw=nativeRootCanonical(f.value);
  for(const bytes of [Buffer.from([0xff]),raw+"\n",JSON.stringify(f.value),JSON.stringify(f.value,null,2),
   raw.replace('"purpose":','"purpose":"wrong","purpose":'),
   nativeRootCanonical({...f.value,extra:true}),nativeRootCanonical({...f.value,terminal:{...f.value.terminal,private_key:"TEST_ONLY-inline"}})])
   await refused(await f.leaf(bytes));
 });
 it("never accepts a CURRENT or generic READ original/config as ROOT authority",async()=>{
  const f=await fixture();
  for(const value of [{...f.value,schema_version:"portal.execution.native-current-runtime.v1"},{...f.value,purpose:"READ"},
   {...f.value,provider:{...f.value.provider,bindings:[]}},{...f.value,provider:{...f.value.provider,original:{current:true}}}])
   await refused(await f.manifest(value));
 });
 it("requires exact sole Research/Paper owner/workspace/source/workload",async()=>{
  const f=await fixture();
  for(const change of [(v:typeof f.value)=>{v.target.kind="STABLE";},(v:typeof f.value)=>{v.target.environment="live";},
   (v:typeof f.value)=>{v.schema_target.role_name="role\n";},(v:typeof f.value)=>{v.schema_target.protected_owner_user_id="TEST_ONLY-other";},
   (v:typeof f.value)=>{v.schema_target.principal_workspace_pins[0].user_id="TEST_ONLY-other";},
   (v:typeof f.value)=>{v.schema_target.principal_workspace_pins.push({user_id:owner,workspace_id:workspace});},
   (v:typeof f.value)=>{v.provider.source.subject="TEST_ONLY-other";},(v:typeof f.value)=>{v.provider.source.workspace_id="TEST_ONLY-other";},
   (v:typeof f.value)=>{v.provider.source.environment="sandbox";},(v:typeof f.value)=>{v.provider.source.workload_id="TEST_ONLY-other";}]){
   const value=structuredClone(f.value);change(value);await refused(await f.manifest(value));
  }
 });
 it("requires a private HTTPS origin without URL auth, paths, query, public DNS or public IP",async()=>{
  const f=await fixture();
  for(const origin of ["http://10.70.0.2","https://8.8.8.8","https://example.com","https://user@10.70.0.2","https://10.70.0.2/path","https://10.70.0.2/?x=1","https://10.70.0.2/#x"])
   await refused(await f.manifest({...f.value,transport:{...f.value.transport,origin}}));
 });
 it("enforces all bounded transport/pool/provider limits and exact source revisions",async()=>{
  const f=await fixture();
  for(const change of [(v:typeof f.value)=>{v.pool_profile.max=11;},(v:typeof f.value)=>{v.pool_profile.query_timeout=v.pool_profile.statement_timeout;},
   (v:typeof f.value)=>{v.transport.deadline_ms=5001;},(v:typeof f.value)=>{v.transport.max_inflight=17;},
   (v:typeof f.value)=>{v.transport.request_bytes=32769;},(v:typeof f.value)=>{v.transport.response_bytes=65537;},
   (v:typeof f.value)=>{v.provider.maximum_retained=4097;},(v:typeof f.value)=>{v.provider.maximum_unresolved=129;},
   (v:typeof f.value)=>{v.provider.maximum_recoveries=17;},(v:typeof f.value)=>{v.provider.attempt_ms=60001;},
   (v:typeof f.value)=>{v.provider.registration.expected_version="01";},(v:typeof f.value)=>{v.provider.original.accepted_fact_digest+="\n";},
   (v:typeof f.value)=>{v.terminal.ttl_seconds=61;}]){
   const value=structuredClone(f.value);change(value);await refused(await f.manifest(value));
  }
 });
 it("rejects non-Ed25519 terminal, TLS key mismatch, malformed/unrelated/non-CA roots",async()=>{
  const f=await fixture(),original=structuredClone(f.value.transport.tls);
  f.value.terminal.private_key_ref=await f.leaf(key);await refused(await f.manifest());f.value.terminal.private_key_ref=await f.leaf(terminal);
  for(const tls of [{...original,key_ref:await f.leaf(terminal)},{...original,ca_ref:await f.leaf(cert)},
   {...original,cert_ref:await f.leaf(ca)},{...original,ca_ref:await f.leaf("TEST_ONLY-malformed")}]){
   f.value.transport.tls=tls;await refused(await f.manifest());
  }
  const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY-other-ca");
  f.value.transport.tls={...original,ca_ref:await f.leaf(testCertificate(name,pair,{name,key:pair.privateKey},true))};await refused(await f.manifest());
 });
 it("rejects expired/not-yet-valid TLS without resetting any source deadline",async()=>{
  const f=await fixture(),pin=await f.manifest(),now=Date.now(),time=vi.spyOn(Date,"now").mockReturnValue(now+2*86400000);
  await refused(pin);time.mockReturnValue(now-2*86400000);await refused(pin);
 });
});

describe("inert ROOT application factory (schema/ledger TEST_ONLY doubles)",()=>{
 async function application(){
  const f=await fixture(),runtime=await prepareNativeRootRuntime(await f.manifest());
  const query=vi.fn().mockResolvedValueOnce({rows:[{custody:"portal_native_root_obligations",ledger:"pgmigrations",guard:"portal_guard_native_root_original()",guarded:true}]})
   .mockResolvedValueOnce({rows:[{name:"1723680000152_execution-native-root-custody"}]});
  const pool={query,connect:vi.fn(),end:vi.fn()} as unknown as Pool;
  const assertion=vi.spyOn(schema,"assertRegisteredResearchCurrentHumanSchema").mockResolvedValue({schema_version:"TEST_ONLY",schema_sha256:"TEST_ONLY",catalogue_sha256:"TEST_ONLY",installed:false});
  return{f,runtime,pool,query,assertion};
 }
 it("requires registered exact target and migration152 with enabled guard before actual inert constructors",async()=>{
  const f=await application(),call=vi.spyOn(NativeRootSourceClient.prototype,"call"),prepared=await prepareNativeRootApplication(f.pool,f.runtime);
  expect(f.assertion).toHaveBeenCalledExactlyOnceWith(f.pool,f.runtime.schemaTarget);expect(f.query).toHaveBeenCalledTimes(2);
  expect(f.query.mock.calls[0][0]).toContain("tgfoid=to_regprocedure('public.portal_guard_native_root_original()')");
  expect(f.query.mock.calls[0][0]).toContain("tgtype=27");
  expect(f.query.mock.calls[1]).toEqual(["SELECT name FROM public.pgmigrations WHERE name=$1",["1723680000152_execution-native-root-custody"]]);
  expect(prepared.provider).toBeInstanceOf(NativeRootReceiptProvider);expect(prepared.provider.usesPool(f.pool)).toBe(true);
  expect(prepared.provider.usesPool({} as Pool)).toBe(false);expect(call).not.toHaveBeenCalled();
  expect(f.pool.connect).not.toHaveBeenCalled();expect(f.pool.end).not.toHaveBeenCalled();
  expect(Object.values(f.runtime.transport.tls).every(bytes=>Buffer.isBuffer(bytes)&&bytes.every(byte=>byte===0))).toBe(true);
  expect(prepared).not.toHaveProperty("participant");expect(prepared).not.toHaveProperty("listener");
 });
 it("refuses wrong target/missing custody, ledger, function, trigger or migration before any source call",async()=>{
  const first=await application(),call=vi.spyOn(NativeRootSourceClient.prototype,"call");first.assertion.mockRejectedValueOnce(Error("TEST_ONLY-private-target-detail"));
  await expect(prepareNativeRootApplication(first.pool,first.runtime)).rejects.toBeInstanceOf(NativeRootRuntimeError);expect(first.query).not.toHaveBeenCalled();
  for(const change of [{custody:null},{ledger:null},{guard:null},{guarded:false}]){
   const f=await application();f.query.mockReset().mockResolvedValue({rows:[{custody:"present",ledger:"present",guard:"present",guarded:true,...change}]});
   await expect(prepareNativeRootApplication(f.pool,f.runtime)).rejects.toBeInstanceOf(NativeRootRuntimeError);expect(f.query).toHaveBeenCalledTimes(1);
   expect(Object.values(f.runtime.transport.tls).every(bytes=>Buffer.isBuffer(bytes)&&bytes.every(byte=>byte===0))).toBe(true);
  }
  const missing=await application();missing.query.mockReset().mockResolvedValueOnce({rows:[{custody:"present",ledger:"present",guard:"present",guarded:true}]}).mockResolvedValueOnce({rows:[]});
  await expect(prepareNativeRootApplication(missing.pool,missing.runtime)).rejects.toBeInstanceOf(NativeRootRuntimeError);expect(call).not.toHaveBeenCalled();
 });
 it("preserves all independently installed trust surfaces; no CURRENT/READ/financial/STATUS substitution",async()=>{
  const f=await application(),prepared=await prepareNativeRootApplication(f.pool,f.runtime),owner={marker:"TEST_ONLY-original-owner"};
  const methods={verifyPolicy:vi.fn(async function(this:unknown){expect(this).toBe(base);return null;}),
   verifyReceipt:vi.fn(async function(this:unknown){expect(this).toBe(base);return null;}),
   relations:vi.fn(async function(this:unknown){expect(this).toBe(base);return unqualifiedAccessTrust.relations("u","w");}),
   verifiedHumanMapping:vi.fn(async function(this:unknown){expect(this).toBe(base);return null;}),
   qualifyDelegatedReceipt:vi.fn(async function(this:unknown){expect(this).toBe(base);return null;}),
   readPublication:vi.fn(async function(this:unknown){expect(this).toBe(base);return null;})};
  const base={...methods,currentRelations:owner,verifyRootReceipt:vi.fn()} as unknown as AccessTrustProvider;
  const root=vi.spyOn(prepared.provider,"verify").mockResolvedValue(null),trust=prepared.composeTrust(base);
  expect(trust.currentRelations).toBe(owner);await trust.verifyPolicy({});await trust.verifyReceipt({});await trust.relations("u","w");
  await trust.verifiedHumanMapping("u","w");await trust.qualifyDelegatedReceipt!({},{} as never);await trust.readPublication!({} as never);
  const context={phase:"QUALIFY"} as const;await trust.verifyRootReceipt!(f.runtime.provider.original,context);
  expect(root).toHaveBeenCalledExactlyOnceWith(f.runtime.provider.original,context);expect(base.verifyRootReceipt).not.toHaveBeenCalled();
  for(const method of Object.values(methods))expect(method).toHaveBeenCalledOnce();
  expect(base.currentRelations).toBe(owner);expect(trust).not.toHaveProperty("verifyStatus");expect(trust).not.toHaveProperty("shutdown");
 });
 it("recovery delegates to SAME actual provider; failure cannot settle custody or close shared pool",async()=>{
  const f=await application(),prepared=await prepareNativeRootApplication(f.pool,f.runtime);
  const recover=vi.spyOn(prepared.provider,"recover").mockResolvedValueOnce({remaining:0});
  await expect(prepared.recover()).resolves.toEqual({remaining:0});expect(recover).toHaveBeenCalledOnce();
  const error=Error("TEST_ONLY-unresolved-original");recover.mockRejectedValueOnce(error);
  await expect(prepared.recover()).rejects.toBe(error);expect(f.pool.end).not.toHaveBeenCalled();
 });
 function dependencies(pool:Pool,prepared:Awaited<ReturnType<typeof prepareNativeRootApplication>>):ControlApiDependencies{
  const candidate={usesPool:(selected:Pool)=>selected===pool} as CurrentHumanCandidate;
  return{nativeRoot:prepared,nativeManagerRead:{} as NonNullable<ControlApiDependencies["nativeManagerRead"]>,
   executionAccessTrust:prepared.composeTrust(unqualifiedAccessTrust),nativeManagerRealtimeLimits:{maximumClients:2,maximumEntriesPerClient:4,
    maximumFrameBytes:32768,maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:8,readTimeoutMs:1000},
   currentHumanMutations:new CurrentHumanMutations(pool,candidate,{recover:vi.fn()},
    {maximum_intents:16,maximum_recoveries_per_request:2},undefined,[],undefined,prepared.provider)};
 }
 const config={NODE_ENV:"test",EXECUTION_READ_PROFILE:"native_manager_review_v1",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:workspace} as ControlApiConfig;
 function lifecycle(module:ReturnType<typeof AppModule.register>):FactoryProvider{
  const found=module.providers?.find((value):value is FactoryProvider=>typeof value==="object"&&value!==null&&
   "provide" in value&&value.provide===NativeRootReceiptProvider&&"useFactory" in value);
  if(!found)throw Error("TEST_ONLY-root-lifecycle-missing");return found;
 }
 it("keeps no-opt-in ordinary runtime unchanged and requires exact shared native profile",async()=>{
  const f=await application(),prepared=await prepareNativeRootApplication(f.pool,f.runtime);
  const absent=AppModule.register({NODE_ENV:"test"} as ControlApiConfig,f.pool);
  expect(absent.providers?.some(value=>typeof value==="object"&&value!==null&&"provide" in value&&value.provide===NativeRootReceiptProvider)).toBe(false);
  expect(()=>selectPrivateCorePoolProfile(undefined,undefined,undefined,f.runtime)).toThrow("PRIVATE_RUNTIME_SHARED_NATIVE_COMPOSITION_REQUIRED");
  expect(selectPrivateCorePoolProfile({poolProfile:f.runtime.poolProfile},undefined,undefined,f.runtime)).toBe(f.runtime.poolProfile);
  expect(()=>selectPrivateCorePoolProfile({poolProfile:{...f.runtime.poolProfile,max:4}},undefined,undefined,f.runtime))
   .toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
  expect(prepared.provider.usesPool(f.pool)).toBe(true);expect(f.pool.connect).not.toHaveBeenCalled();
 });
 it("refuses foreign pool, non-Research, unregistered/structural-copy or another actual ROOT provider",async()=>{
  const f=await application(),prepared=await prepareNativeRootApplication(f.pool,f.runtime),deps=dependencies(f.pool,prepared);
  expect(()=>AppModule.register({NODE_ENV:"test"} as ControlApiConfig,f.pool,undefined,deps)).toThrow("NATIVE_ROOT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
  const candidate={usesPool:(selected:Pool)=>selected===f.pool} as CurrentHumanCandidate;
  const withoutRoot=new CurrentHumanMutations(f.pool,candidate,{recover:vi.fn()},{maximum_intents:16,maximum_recoveries_per_request:2});
  expect(()=>AppModule.register(config,f.pool,undefined,{...deps,currentHumanMutations:withoutRoot})).toThrow("NATIVE_ROOT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
  const cloned={...prepared,provider:{usesPool:()=>true} as NativeRootReceiptProvider};
  expect(()=>AppModule.register(config,f.pool,undefined,{...deps,nativeRoot:cloned})).toThrow("NATIVE_ROOT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
  const other=await application(),otherPrepared=await prepareNativeRootApplication(other.pool,other.runtime);
  expect(()=>AppModule.register(config,f.pool,undefined,{...deps,nativeRoot:otherPrepared})).toThrow("NATIVE_ROOT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
  expect(()=>AppModule.register(config,f.pool,undefined,{...deps,nativeManagerRead:undefined})).toThrow("NATIVE_RESEARCH_REVIEW_COMPOSITION_REQUIRED");
  expect(f.pool.end).not.toHaveBeenCalled();expect(other.pool.end).not.toHaveBeenCalled();
 });
 it("mounts SAME provider only, never startup ISSUE/intake; shutdown joins before disposal and propagates failure",async()=>{
  const f=await application(),prepared=await prepareNativeRootApplication(f.pool,f.runtime),deps=dependencies(f.pool,prepared);
  const call=vi.spyOn(NativeRootSourceClient.prototype,"call"),verify=vi.spyOn(prepared.provider,"verify"),recover=vi.spyOn(prepared.provider,"recover");
  const stop=vi.spyOn(prepared.provider,"shutdown");
  let finish!:()=>void;stop.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const mounted=lifecycle(AppModule.register(config,f.pool,undefined,deps)).useFactory() as NativeRootReceiptProvider&{beforeApplicationShutdown():Promise<void>};
  expect(mounted).toBe(prepared.provider);expect(mounted).not.toHaveProperty("onModuleInit");
  expect(deps.currentHumanMutations?.hasRootRecoveryParticipant(prepared.provider)).toBe(true);
  expect(call).not.toHaveBeenCalled();expect(verify).not.toHaveBeenCalled();expect(recover).not.toHaveBeenCalled();
  let joined=false;const closing=mounted.beforeApplicationShutdown().then(()=>{joined=true;});
  expect(stop).toHaveBeenCalledOnce();expect(joined).toBe(false);expect(f.pool.end).not.toHaveBeenCalled();
  finish();await closing;expect(joined).toBe(true);
  const failure=Error("TEST_ONLY-ROOT-UNKNOWN");stop.mockRejectedValueOnce(failure);
  await expect(mounted.beforeApplicationShutdown()).rejects.toBe(failure);expect(f.pool.end).not.toHaveBeenCalled();
 });
});
