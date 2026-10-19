/** TEST_ONLY loader/security/orchestration; NOT_RUN. Mocked filesystem and
 * compose boundary, actual SHA/jose/selected-source/consumer construction.
 * Metadata SELECT is mocked; no actual DB/TLS/session/source authority or
 * factory acceptance is claimed. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { generateKeyPair, exportPKCS8 } from "jose";
import type { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../src/execution-v2/native-core-runtime";
import { composeNativeCore } from "../src/execution-v2/native-core-composition";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
vi.mock("node:fs/promises",async original=>({...await original<typeof import("node:fs/promises")>(),lstat:vi.fn(),open:vi.fn()}));
vi.mock("../src/execution-v2/native-core-composition",()=>({composeNativeCore:vi.fn()}));
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex"),raw=(c:string)=>c.repeat(64);
type File={bytes:Buffer;uid:number;mode:number;ino:number;link?:boolean;size?:number;replaceOnOpen?:boolean};
const files=new Map<string,File>(),opened:string[]=[];
let edPem:string,ecPem:string,serial=0;
const uid=()=>process.geteuid?.()??-1;
function stat(f:File){return{uid:f.uid,mode:f.mode,ino:f.ino,dev:1,size:f.size??f.bytes.length,
  isFile:()=>true,isSymbolicLink:()=>Boolean(f.link)};}
function register(path:string,value:string|Buffer){
  const bytes=Buffer.isBuffer(value)?Buffer.from(value):Buffer.from(value,"utf8");
  files.set(path,{bytes,uid:uid(),mode:0o100400,ino:++serial});return{path,sha256:sha(bytes)};
}
function fixture(){
  files.clear();opened.length=0;
  const keyRef=register("/TEST_ONLY/native-runtime/human.key",edPem),terminalRef=register("/TEST_ONLY/native-runtime/terminal.key",edPem);
  const caRef=register("/TEST_ONLY/native-runtime/ca.crt","TEST_ONLY-CA-NO-SOCKET"),
    certRef=register("/TEST_ONLY/native-runtime/client.crt","TEST_ONLY-CERT-NO-SOCKET"),
    tlsKeyRef=register("/TEST_ONLY/native-runtime/client.key","TEST_ONLY-CLIENT-KEY-NO-SOCKET");
  const now=Date.now(),until=now+60000,person="TEST_ONLY-bobby",workspace="TEST_ONLY-workspace",
    workload="TEST_ONLY-native-pm",issuer="TEST_ONLY-core-human";
  const domain={profile_id:"TEST_ONLY-profile",catalogue_sha256:raw("a"),profile_sha256:raw("b"),field_policy_sha256:raw("c")};
  const selected={transport:{origin:"https://10.70.0.2:28445",tls:{ca_ref:caRef,cert_ref:certRef,key_ref:tlsKeyRef},
    pm_leaf_sha256:"sha256:"+raw("f"),workload_id:workload,deadline_ms:1000,request_bytes:32768,response_bytes:32768,max_inflight:2},
    pins:{binding:{human_issuer:issuer,subject:person,workspace_id:workspace,environment:"paper",workload_id:workload},domain,
      human:{issuer,subject:person,portal_user_id:person,ts_user_id:"33333333-3333-3333-3333-333333333333",
        mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1"},
      native:{revision:"1",receipt_id:"44444444-4444-4444-4444-444444444444",receipt_digest:"sha256:"+raw("1"),
        document_digest:"sha256:"+raw("2"),policy_revision:"1",owner_mapping_revision:"ts-user:33333333-3333-3333-3333-333333333333:1",
        semantic_revision:"sha256:"+raw("3"),effective_from:new Date(now-1000).toISOString(),expires_at:new Date(until).toISOString()},
      source_fingerprint:raw("e")},installation_expires_at_utc_ms:until};
  const value={schema_version:"portal.native-core-runtime.v1",pool_profile:{max:4,connectionTimeoutMillis:2000,
    statement_timeout:3000,query_timeout:6000,idle_in_transaction_session_timeout:3000},
    composition:{expected_workload_id:workload,selections:[{selector:{portal_user_id:person,human_issuer:issuer,
      subject:person,workspace_id:workspace,environment:"paper",domain},config:{issuer,audience:"TEST_ONLY-pm-human",key_id:"TEST_ONLY-human-key",
      private_key_ref:keyRef,selected_source:selected,limits:{ttl_ms:10000,maximum_unresolved:4,maximum_retained:32},
      installation_scope:{workspace_id:workspace,environment:"paper",valid_until_ms:until},
      terminal:{issuer:"TEST_ONLY-terminal",audience:"TEST_ONLY-pm-terminal",key_id:"TEST_ONLY-terminal-key",private_key_ref:terminalRef,ttl_seconds:30},
      egress:{maximum_response_bytes:1048576,maximum_inflight:2,send_timeout_ms:1000,quiesce_timeout_ms:1000}}}],
      retained_recovery:[],owner_intakes:[{artifact_path:"/root/TEST_ONLY-OFFLINE-owner-artifact.json",approved_sha256:raw("8"),
        target:{database_name:"TEST_ONLY-control",database_system_identifier:"7675333655652302882",role_name:"TEST_ONLY-runtime-role",
          protected_owner_user_id:person,workspace_id:workspace,principal_workspace_pins:[{user_id:person,workspace_id:workspace}]},
        intake_not_before_ms:now-1000,intake_not_after_ms:until}],mutation_limits:{maximum_intents:64,maximum_recoveries_per_request:8}}};
  return{value,pin:()=>register("/TEST_ONLY/native-runtime/config.json",JSON.stringify(value)),keyRef,terminalRef,caRef,certRef,tlsKeyRef};
}
beforeAll(async()=>{
  edPem=await exportPKCS8((await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true})).privateKey);
  ecPem=await exportPKCS8((await generateKeyPair("ES256",{extractable:true})).privateKey);
});
beforeEach(()=>{
  files.clear();opened.length=0;vi.clearAllMocks();
  vi.mocked(lstat).mockImplementation((async(path:unknown)=>{
    const f=files.get(String(path));if(!f)throw Error("TEST_ONLY-unmounted-file");return stat(f);
  })as any);
  vi.mocked(open).mockImplementation((async(path:unknown,flags:unknown)=>{
    const name=String(path),f=files.get(name);if(!f)throw Error("TEST_ONLY-unmounted-file");
    expect(flags).toBe(constants.O_RDONLY|constants.O_NOFOLLOW);opened.push(name);
    if(f.replaceOnOpen)f.ino++;
    let offset=0;
    return{stat:async()=>stat(f),close:vi.fn(async()=>undefined),
      read:async(buffer:Buffer,start:number,length:number,_position:null)=>{
        const count=Math.min(length,f.bytes.length-offset);
        if(count>0)f.bytes.copy(buffer,start,offset,offset+count);offset+=count;return{bytesRead:count,buffer};
      }};
  })as any);
  vi.mocked(composeNativeCore).mockResolvedValue({dependencies:{executionAccessTrust:unqualifiedAccessTrust},
    selectedCandidate:vi.fn(),installOwnerPolicies:vi.fn()}as never);
});
function runtimePool(){
  const metadata={database_name:"TEST_ONLY-control",role_name:"TEST_ONLY-runtime-role",
    session_role_name:"TEST_ONLY-runtime-role",database_system_identifier:"7675333655652302882"};
  const query=vi.fn().mockResolvedValue({rowCount:1,rows:[metadata]});
  const pool={options:{connectionTimeoutMillis:2000,query_timeout:6000},query,connect:vi.fn()}as unknown as Pool;
  return{pool,query,metadata};
}
describe("TEST_ONLY closed native runtime refs",()=>{
  it("keeps absent optional env pair on the untouched legacy path with no file or compose work",()=>{
    expect(nativeCoreRuntimeReference({})).toBeUndefined();
    expect(lstat).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses partial, empty and malformed env pairs rather than silently selecting legacy",()=>{
    for(const env of[
      {CONTROL_API_NATIVE_CORE_CONFIG_FILE:"/TEST_ONLY/runtime.json"},
      {CONTROL_API_NATIVE_CORE_CONFIG_SHA256:raw("a")},
      {CONTROL_API_NATIVE_CORE_CONFIG_FILE:"",CONTROL_API_NATIVE_CORE_CONFIG_SHA256:raw("a")},
      {CONTROL_API_NATIVE_CORE_CONFIG_FILE:"relative.json",CONTROL_API_NATIVE_CORE_CONFIG_SHA256:raw("a")},
      {CONTROL_API_NATIVE_CORE_CONFIG_FILE:"/TEST_ONLY/runtime.json",CONTROL_API_NATIVE_CORE_CONFIG_SHA256:raw("a")+"\n"},
    ])expect(()=>nativeCoreRuntimeReference(env)).toThrowError("The private native Core configuration is not available.");
    expect(open).not.toHaveBeenCalled();expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("requires independent exact manifest SHA before opening any TLS or signing reference",async()=>{
    const f=fixture(),pin=f.pin();
    await expect(prepareNativeCoreRuntime({...pin,sha256:raw("0")})).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    expect(opened).toEqual([pin.path]);expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses symlink, wrong UID/mode, oversized and inode-replaced reference files",async()=>{
    const axes=["symlink","uid","mode","oversized","inode"]as const;
    for(const axis of axes){
      const f=fixture(),pin=f.pin(),file=files.get(pin.path)!;
      if(axis==="symlink")file.link=true;
      if(axis==="uid")file.uid=uid()+1;
      if(axis==="mode")file.mode=0o100640;
      if(axis==="oversized")file.size=131073;
      if(axis==="inode")file.replaceOnOpen=true;
      await expect(prepareNativeCoreRuntime(pin)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("rejects unknown fields, extra references and noncanonical/duplicate/invalid-UTF8 manifest bytes",async()=>{
    for(const alter of[
      (v:any)=>{v.schema_version="portal.native-core-runtime.v2";},
      (v:any)=>{v.extra=true;},
      (v:any)=>{v.composition.selections[0].config.private_key="TEST_ONLY-inline-key";},
      (v:any)=>{v.composition.selections[0].config.selected_source.transport.tls.issuer_key_ref={path:"/TEST_ONLY/not-allowed",sha256:raw("a")};},
    ]){
      const f=fixture();alter(f.value);
      await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
    // Each malformed representation has its OWN matching SHA: this proves
    // the byte/parse guard, not merely the independent file-hash check.
    for(const axis of["duplicate","pretty","invalid-utf8"]){
      const f=fixture(),json=JSON.stringify(f.value),invalidUtf8=Buffer.from(json);
      invalidUtf8[json.indexOf("TEST_ONLY-OFFLINE")]=0xff;
      const bytes=axis==="duplicate"
        ?Buffer.from(json.replace('{"schema_version":','{"schema_version":"TEST_ONLY-ignored-duplicate","schema_version":'))
        :axis==="pretty"?Buffer.from(JSON.stringify(f.value,null,2))
        :invalidUtf8;
      const pin=register("/TEST_ONLY/native-runtime/config.json",bytes);
      await expect(prepareNativeCoreRuntime(pin)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(opened).toEqual([pin.path]);
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("validates explicit pool limits before materializing source keys or permitting buildPool",async()=>{
    for(const change of[
      {max:11},{connectionTimeoutMillis:0},{statement_timeout:60001},{query_timeout:3000},
    ]){
      const f=fixture();Object.assign(f.value.pool_profile,change);
      await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(opened).toEqual(["/TEST_ONLY/native-runtime/config.json"]);
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("independently pins TLS and signing bytes without reflecting material or paths in errors",async()=>{
    for(const axis of["ca","human"]){
      const f=fixture(),bad=axis==="ca"?f.caRef:f.keyRef;
      files.get(bad.path)!.bytes=Buffer.from("TEST_ONLY-do-not-echo-secret");
      const error=(await prepareNativeCoreRuntime(f.pin()).catch(error=>error))as Error&{code:string};
      expect(error).toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(error.message).not.toContain("TEST_ONLY-do-not-echo-secret");expect(error.message).not.toContain(bad.path);
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("imports only actual Ed25519 private PKCS8 keys before any Core composition",async()=>{
    const f=fixture(),replacement=register(f.keyRef.path,ecPem);
    f.value.composition.selections[0]!.config.private_key_ref=replacement;
    await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("retains existing selected-source issuer, workload and strict pin validators",async()=>{
    for(const alter of[
      (v:ReturnType<typeof fixture>["value"])=>{v.composition.selections[0]!.config.selected_source.pins.human.subject="TEST_ONLY-other";},
      (v:ReturnType<typeof fixture>["value"])=>{v.composition.selections[0]!.config.selected_source.transport.workload_id="TEST_ONLY-other";},
      (v:ReturnType<typeof fixture>["value"])=>{v.composition.selections[0]!.config.selected_source.pins.native.receipt_digest="sha256:invalid";},
    ]){
      const f=fixture();alter(f.value);
      await expect(prepareNativeCoreRuntime(f.pin())).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    }
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
  it("refuses wrong actual database/system/current-role/session-role and unavailable introspection before app mounting",async()=>{
    for(const axis of["database","system","current-role","session-role","introspection"]){
      const f=fixture(),prepared=await prepareNativeCoreRuntime(f.pin()),actual=runtimePool();
      if(axis==="database")actual.metadata.database_name="TEST_ONLY-other-database";
      if(axis==="system")actual.metadata.database_system_identifier="1111111111111111111";
      if(axis==="current-role")actual.metadata.role_name="TEST_ONLY-other-role";
      if(axis==="session-role")actual.metadata.session_role_name="TEST_ONLY-other-session-role";
      if(axis==="introspection")actual.query.mockRejectedValueOnce(Error("TEST_ONLY-no-introspection"));
      await expect(prepared.compose(actual.pool)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(actual.query).toHaveBeenCalledTimes(1);expect(actual.pool.connect).not.toHaveBeenCalled();
    }
  });
  it("prepares inert components then verifies actual DB target before SAME-pool injection without owner artifact I/O",async()=>{
    const f=fixture(),pin=f.pin(),prepared=await prepareNativeCoreRuntime(pin);
    expect(prepared.poolProfile).toEqual(f.value.pool_profile);expect(Object.isFrozen(prepared.poolProfile)).toBe(true);
    expect(composeNativeCore).not.toHaveBeenCalled();
    const {pool,query}=runtimePool();
    const dependencies=await prepared.compose(pool);
    expect(composeNativeCore).toHaveBeenCalledTimes(1);expect(vi.mocked(composeNativeCore).mock.calls[0]![0]).toBe(pool);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith("SELECT current_database() AS database_name,current_user AS role_name,session_user AS session_role_name,(pg_control_system()).system_identifier::text AS database_system_identifier");
    expect(pool.connect).not.toHaveBeenCalled();
    expect(opened).not.toContain("/root/TEST_ONLY-OFFLINE-owner-artifact.json");
    expect(vi.mocked(composeNativeCore).mock.results).toHaveLength(1);
    const composed=await vi.mocked(composeNativeCore).mock.results[0]!.value;
    expect(dependencies.nativeManagerRead).toBe(composed);
    expect(dependencies.executionAccessTrust).toBe(composed.dependencies.executionAccessTrust);
    expect(dependencies.currentHumanMutations).toBe(composed.dependencies.currentHumanMutations);
    expect(dependencies).not.toHaveProperty("nativeManagerConsumer");
    expect(dependencies).not.toHaveProperty("nativeManagerRealtimeLimits");
    expect(composed.installOwnerPolicies).not.toHaveBeenCalled();
    expect(new Set(opened)).toEqual(new Set([pin.path,f.caRef.path,f.certRef.path,f.tlsKeyRef.path,f.keyRef.path,f.terminalRef.path]));
  });
  it("passes optional explicit SSE limits without changing finite composition or installing policy",async()=>{
    const f=fixture(),limits={maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:32768,
      maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:8,readTimeoutMs:1000};
    const value={...f.value,realtime_limits:limits};
    const pin=register("/TEST_ONLY/native-runtime/config.json",JSON.stringify(value));
    const prepared=await prepareNativeCoreRuntime(pin),{pool}=runtimePool();
    const dependencies=await prepared.compose(pool);
    expect(dependencies.nativeManagerRealtimeLimits).toEqual(limits);
    expect(Object.isFrozen(dependencies.nativeManagerRealtimeLimits)).toBe(true);
    expect(dependencies.nativeManagerRead).toBe(await vi.mocked(composeNativeCore).mock.results[0]!.value);
    expect(dependencies.nativeManagerRead!.installOwnerPolicies).not.toHaveBeenCalled();
  });
  it("rejects partial, excessive, unknown and incoherent SSE bounds before source materialization",async()=>{
    const valid={maximumClients:2,maximumEntriesPerClient:4,maximumFrameBytes:32768,
      maximumClientBytes:65536,maximumTotalBytes:131072,maximumNoticesPerRead:8,readTimeoutMs:1000};
    for(const change of[{maximumClients:0},{maximumNoticesPerRead:201},{maximumTotalBytes:67108865},
      {maximumClientBytes:32767},{maximumTotalBytes:65535},{extra:1}]){
      const f=fixture(),pin=register("/TEST_ONLY/native-runtime/config.json",JSON.stringify({...f.value,realtime_limits:{...valid,...change}}));
      await expect(prepareNativeCoreRuntime(pin)).rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
      expect(opened).toEqual([pin.path]);
    }
    const f=fixture(),{readTimeoutMs:_,...partial}=valid;
    await expect(prepareNativeCoreRuntime(register("/TEST_ONLY/native-runtime/config.json",JSON.stringify({...f.value,realtime_limits:partial}))))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID"});
    expect(composeNativeCore).not.toHaveBeenCalled();
  });
});
