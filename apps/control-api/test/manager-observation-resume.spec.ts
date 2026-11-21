/** Pure SAME-codec/coordinate tests only: no claim of controller, policy,
 * journal-race, installed native source or physical delivery acceptance.
 * Requires the approved d2ac observation dataset contract overlay. */
import { describe,it,expect,vi } from "vitest";
import { ScopedReplayCursorCodec,ScopedReplayError,encodeScopedReplayContinuation,
  decodeScopedReplayContinuation,decodeScopedReplayContinuationWithBinding } from "../src/execution-v2/scoped-replay-cursor";
import { encodeManagerObservationCoordinate,decodeManagerObservationCoordinate,
  type ManagerObservationCoordinate } from "../src/execution-v2/manager-observation-coordinate";
import type { ScopedReplayBinding } from "../src/execution-v2/realtime.contract";

const digest=(c:string)=>"sha256:"+c.repeat(64),key="TEST_ONLY-original-snapshot-key-32-bytes";
const epoch="12345678-1234-1234-1234-123456789abc",snapshot=digest("a");
const coordinate:ManagerObservationCoordinate={version:1,projection_epoch:epoch,
  original_snapshot_id:snapshot,baseline_sequence:10,after_sequence:10};
const binding:ScopedReplayBinding={workspace_id:"TEST_ONLY-workspace",environment:"paper",profile_id:"PAPER_TEST_ONLY",
  principal_scope_digest:digest("b"),app_policy_revision:"TEST_ONLY-app-r1",field_policy_revision:"TEST_ONLY-fields-r1",
  model_revision:"portal.manager-observation.baseline.v1",schema_revision:"portal.execution.scoped-realtime.v1",
  dataset:"execution_profile_observation",query_digest:digest("c"),source_set_digest:digest("d"),
  source_continuity_epoch:epoch,projection_generation:epoch,snapshot_id:snapshot,window:null};
function setup(){
  let now=1000;
  const codec=new ScopedReplayCursorCodec("current",{current:key},300_000,()=>now);
  return {codec,setNow:(value:number)=>{now=value;}};
}
const restore=(source:string):ScopedReplayBinding=>({...binding,snapshot_id:decodeManagerObservationCoordinate(source).original_snapshot_id});
const source=()=>encodeManagerObservationCoordinate(coordinate);

describe("Manager original-snapshot intrinsic resume",()=>{
  it("restores original baseline identity and preserves the existing decoder/wire",()=>{
    const {codec}=setup(),cursor=source(),token=encodeScopedReplayContinuation(codec,binding,cursor);
    expect(token.startsWith("sr1.current.")).toBe(true);
    expect(decodeScopedReplayContinuation(codec,token,binding)).toBe(cursor);
    const resumed=decodeScopedReplayContinuationWithBinding(codec,token,restore);
    expect(resumed.binding).toEqual(binding);expect(resumed.source).toBe(cursor);
  });
  it("head advancement changes only after_sequence, never the original snapshot",()=>{
    const {codec}=setup();
    for(const after_sequence of [11,12,200]){
      const cursor=encodeManagerObservationCoordinate({...coordinate,after_sequence});
      const result=decodeScopedReplayContinuationWithBinding(codec,encodeScopedReplayContinuation(codec,binding,cursor),restore);
      expect(result.binding.snapshot_id).toBe(snapshot);
      expect(decodeManagerObservationCoordinate(result.source)).toEqual({...coordinate,after_sequence});
    }
  });
  it.each([
    {workspace_id:"OTHER-workspace"},{environment:"live" as const},{profile_id:"OTHER-profile"},
    {principal_scope_digest:digest("e")},{query_digest:digest("f")},{source_set_digest:digest("0")},
    {app_policy_revision:"OTHER-policy"},{field_policy_revision:"OTHER-fields"},
    {source_continuity_epoch:"OTHER-epoch"},{projection_generation:"OTHER-generation"},{snapshot_id:digest("1")},
  ])("rejects changed complete current binding %j",changed=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source());
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,s=>({...restore(s),...changed})))
      .toThrow(ScopedReplayError);
  });
  it("READ-baseline cannot be relabeled STREAM without a newly authorized token",()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source());
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,s=>({...restore(s),
      model_revision:"portal.manager-observation.stream.v1"}))).toThrow(ScopedReplayError);
  });
  it("authenticates GCM before invoking the trusted source resolver",()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source()),resolve=vi.fn(restore);
    const altered=token.slice(0,-1)+(token.endsWith("A")?"B":"A");
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,altered,resolve)).toThrow(ScopedReplayError);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("expires before source interpretation and never refreshes original token TTL",()=>{
    const {codec,setNow}=setup(),token=encodeScopedReplayContinuation(codec,binding,source()),resolve=vi.fn(restore);
    setNow(301000);
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,resolve)).toThrow(ScopedReplayError);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("retains the existing key-rotation overlap behavior",()=>{
    const old=new ScopedReplayCursorCodec("old",{old:key},300_000,()=>1000);
    const rotated=new ScopedReplayCursorCodec("next",{old:key,next:key+"-next"},300_000,()=>1001);
    const token=encodeScopedReplayContinuation(old,binding,source());
    expect(decodeScopedReplayContinuationWithBinding(rotated,token,restore).binding).toEqual(binding);
  });
  it("intrinsic entrypoints ignore overridden instance encode/decode methods",()=>{
    const {codec}=setup();codec.encode=vi.fn(()=>"TEST_ONLY-forged");codec.decode=vi.fn(()=>"TEST_ONLY-forged");
    const token=encodeScopedReplayContinuation(codec,binding,source());
    expect(decodeScopedReplayContinuationWithBinding(codec,token,restore).source).toBe(source());
    expect(codec.encode).not.toHaveBeenCalled();expect(codec.decode).not.toHaveBeenCalled();
  });
  it("forged, cloned and proxy codec instances cannot use a genuine token",()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source());let traps=0;
    const proxy=new Proxy(codec,{get(){traps++;throw Error("TEST_ONLY_PROXY");}});
    for(const fake of [{...codec},Object.create(Object.getPrototypeOf(codec)) as unknown,proxy])
      expect(()=>decodeScopedReplayContinuationWithBinding(fake as ScopedReplayCursorCodec,token,restore)).toThrow(ScopedReplayError);
    expect(traps).toBe(0);
  });
  it("requires a synchronous valid binding and emits only the uniform safe error",()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source());
    const asyncResolver=(()=>Promise.resolve(binding)) as unknown as (source:string)=>ScopedReplayBinding;
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,asyncResolver)).toThrow("Execution updates require a current authorized snapshot.");
    expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,()=>{throw Error(source());})).toThrow("Execution updates require a current authorized snapshot.");
  });
  it("returns detached frozen verified binding and coordinate",()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source());
    const restored=decodeScopedReplayContinuationWithBinding(codec,token,restore);
    expect(Object.isFrozen(restored)).toBe(true);expect(Object.isFrozen(restored.binding)).toBe(true);
    expect(Object.isFrozen(decodeManagerObservationCoordinate(restored.source))).toBe(true);
  });
  it("refuses a rejecting async resolver without an unhandled rejection",async()=>{
    const {codec}=setup(),token=encodeScopedReplayContinuation(codec,binding,source()),unhandled:unknown[]=[];
    const observe=(reason:unknown)=>{unhandled.push(reason);};process.on("unhandledRejection",observe);
    try{
      const resolver=(()=>Promise.reject(Error("TEST_ONLY_ASYNC_REFUSED"))) as unknown as (source:string)=>ScopedReplayBinding;
      expect(()=>decodeScopedReplayContinuationWithBinding(codec,token,resolver)).toThrow(ScopedReplayError);
      await new Promise<void>(resolve=>setImmediate(resolve));expect(unhandled).toEqual([]);
    }finally{process.removeListener("unhandledRejection",observe);}
  });
});

describe("Closed bounded Manager observation coordinate",()=>{
  it("accepts only the exact canonical versioned serialization",()=>{
    const token=source();expect(decodeManagerObservationCoordinate(token)).toEqual(coordinate);
    const pretty="mo1."+Buffer.from(JSON.stringify(coordinate,null,1)).toString("base64url");
    expect(()=>decodeManagerObservationCoordinate(pretty)).toThrow(ScopedReplayError);
  });
  it.each([
    {...coordinate,version:2},{...coordinate,extra:"TEST_ONLY"},{...coordinate,projection_epoch:"not-an-epoch"},
    {...coordinate,original_snapshot_id:"not-a-snapshot"},{...coordinate,after_sequence:9},
    {...coordinate,after_sequence:Number.MAX_SAFE_INTEGER+1},
    {...coordinate,projection_epoch:epoch+"\n"},{...coordinate,original_snapshot_id:snapshot+"\n"},
  ])("rejects invalid closed coordinate %j",value=>{
    const token="mo1."+Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(()=>decodeManagerObservationCoordinate(token)).toThrow(ScopedReplayError);
  });
  it.each(["mo1.","mo1."+"a".repeat(2048),"mo1.abc="])("rejects malformed/oversize source token %s",token=>{
    expect(()=>decodeManagerObservationCoordinate(token)).toThrow(ScopedReplayError);
  });
  it("retains safe-integer sequence boundaries without rounding or inventing a baseline",()=>{
    const token=encodeManagerObservationCoordinate({...coordinate,after_sequence:Number.MAX_SAFE_INTEGER});
    expect(decodeManagerObservationCoordinate(token).after_sequence).toBe(Number.MAX_SAFE_INTEGER);
    expect(()=>encodeManagerObservationCoordinate({...coordinate,baseline_sequence:0})).toThrow(ScopedReplayError);
  });
});
