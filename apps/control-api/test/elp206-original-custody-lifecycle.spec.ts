/** Pure lifecycle intake/order tests. SYNTHETIC inputs only, NOT PG/source,
 * economic COMMIT/ACK, current human authority or production qualification. */
import {createHash,randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
import {describe,expect,it,vi} from "vitest";
import {ManagerOriginalCustodyLifecycle,type ManagerOriginalIdleInput} from "../src/execution-v2/manager-original-custody-lifecycle";
import {ManagerScoreRuntime} from "../src/execution-v2/manager-score-runtime";
import type {ManagerScoreRecalculationTask} from "../src/execution-v2/manager-score-recalculation";

const digest=(text:string)=>"sha256:"+createHash("sha256").update(text).digest("hex");
const caps={maximum_bundle_bytes:65_536,maximum_revisions_per_source:8,maximum_retained_bytes_per_source:1_048_576};
function task():ManagerScoreRecalculationTask {
  return {slot:"RAW",task:{scope:{workspace_id:"SYNTHETIC:one-custody",environment:"paper",profile_id:"SYNTHETIC:paper",catalogue_digest:digest("catalogue")},
    binding:{subject_type:"alpha",subject_id:"SYNTHETIC:alpha",tuple_population_digest:digest("population"),partition_digest:digest("partition"),stage_filter:["PAPER"],
      window_start_ms:100,window_end_ms:500,comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:evidence"},
    source_revision:"SYNTHETIC:r1",source_set_digest:digest("source"),source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:original",
    computed_at_ms:510,expected_policy_revision:null,input:{kind:"METRICS",quality:{comparable_basis_id:"SYNTHETIC:basis",
      individual_evidence_binding_id:"SYNTHETIC:evidence",window_start_ms:100,window_end_ms:500,as_of_ms:500,observed_duration_ms:400,
      currency:"USDT",required_costs_complete:true,stale:false,data_valid:true,sample_count:4,complete_block_count:2,
      metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}}};
}
function idleInput():ManagerOriginalIdleInput {
  return {lease:Object.freeze({workspace_id:"SYNTHETIC:one-custody",environment:"paper",profile_id:"SYNTHETIC:paper",
    holder_id:randomUUID(),lease_epoch:randomUUID(),fencing_token:"1"}),signal:new AbortController().signal,
    deadline_ms:performance.now()+10_000,transaction_timeout_ms:1000,lease_ttl_ms:5000};
}
describe("ELP2-06 shared original lifecycle — pure intake/order, synthetic only",()=>{
  it("constructs independently of any Score policy/runtime/pool/timer and has no implicit worker",async()=>{
    const lifecycle=new ManagerOriginalCustodyLifecycle(caps);
    expect(lifecycle.status()).toEqual({state:"NOT_RUN",reason_code:null});
    expect(lifecycle.originalCustodyByteLimit()).toBe(caps.maximum_bundle_bytes);
    await lifecycle.idle(idleInput());expect(lifecycle.status().state).toBe("NOT_RUN");
  });
  it.each([
    {maximum_bundle_bytes:32_768},
    {maximum_revisions_per_source:7},
    {maximum_retained_bytes_per_source:1_048_577},
  ])("requires identical existing shared custody caps for every serial delegate: %j",difference=>{
    const idle=vi.fn(async()=>undefined);
    expect(()=>new ManagerOriginalCustodyLifecycle(caps,[{caps:{...caps,...difference},idle}]))
      .toThrow("MANAGER_ORIGINAL_LIFECYCLE_CAPS_MISMATCH");expect(idle).not.toHaveBeenCalled();
  });
  it("rejects own-data config getters and proxies without invoking their traps",()=>{
    let traps=0;const getter={...caps};Object.defineProperty(getter,"maximum_bundle_bytes",{enumerable:true,get(){traps++;return 1;}});
    expect(()=>new ManagerOriginalCustodyLifecycle(getter)).toThrow("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
    const proxy=new Proxy(caps,{getPrototypeOf(){traps++;return Object.prototype;},ownKeys(){traps++;return Reflect.ownKeys(caps);}});
    expect(()=>new ManagerOriginalCustodyLifecycle(proxy)).toThrow("MANAGER_ORIGINAL_LIFECYCLE_INVALID");expect(traps).toBe(0);
  });
  it("detaches worker and exact original task JSON synchronously before provider mutation",()=>{
    const lifecycle=new ManagerOriginalCustodyLifecycle(caps),provided=[task()],before=JSON.stringify(provided[0].task);
    const captured=lifecycle.captureScoreInputs(provided,65_536);provided[0].task.binding.subject_id="SYNTHETIC:mutated";
    expect(captured.omission).toBeNull();expect(captured.originals![0].input_json).toBe(before);
    expect(JSON.stringify(captured.tasks[0].task)).toBe(before);expect(captured.tasks).not.toBe(provided);
  });
  it("preserves opaque original JSON and undefined-object omission without altering worker input",()=>{
    const item=task();Object.assign(item.task,{opaque:{text:"SYNTHETIC:   ",absent:undefined}});
    const before=JSON.stringify(item.task),captured=new ManagerOriginalCustodyLifecycle(caps).captureScoreInputs([item],65_536);
    expect(captured.originals![0].input_json).toBe(before);expect(JSON.stringify(captured.tasks[0].task)).toBe(before);
  });
  it("bad optional method proof omits whole custody but still runs exact detached original worker bytes",async()=>{
    const item=task();item.path_dependency={manifest_json:"{}",manifest_sha256:digest("not-the-manifest")};
    const before=JSON.stringify(item.task),capture=new ManagerOriginalCustodyLifecycle(caps).captureScoreInputs([item],65_536);
    expect(capture).toMatchObject({originals:null,omission:"ORIGINAL_SCORE_PROOF_NOT_RETAINED"});
    const runtime=new ManagerScoreRuntime({maximum_observations:10,maximum_blocks:10,maximum_stress_subperiods:10,
      maximum_input_bytes:65_536,maximum_in_flight:1});
    const result=await runtime.calculate({...capture.tasks[0].task,policy:null});
    expect(result.provenance.input_digest).toBe(digest(before));expect(result.quality.status).toBe("policy_pending");
  });
  it.each(["NaN","cycle","proxy","getter","unknown-key","oversized"] as const)(
    "unsafe optional proof %s omits custody, never invokes traps or suppresses genuine worker admission",async fault=>{
      const item=task(),before=JSON.stringify(item.task);let traps=0;
      if(fault==="NaN")Object.assign(item,{metrics_dependency:{value:Number.NaN}});
      if(fault==="cycle"){const cycle:Record<string,unknown>={};cycle.self=cycle;Object.assign(item,{path_dependency:cycle});}
      if(fault==="proxy")Object.assign(item,{path_dependency:new Proxy({},{ownKeys(){traps++;throw Error("PRIVATE");},get(){traps++;throw Error("PRIVATE");}})});
      if(fault==="getter")Object.defineProperty(item,"path_dependency",{enumerable:true,get(){traps++;throw Error("PRIVATE");}});
      if(fault==="unknown-key")Object.defineProperty(item,"private_future_proof",{enumerable:true,get(){traps++;throw Error("PRIVATE");}});
      if(fault==="oversized")Object.assign(item,{metrics_dependency:{proof:"x".repeat(65_536)}});
      const capture=new ManagerOriginalCustodyLifecycle(caps).captureScoreInputs([item],65_536);
      expect(capture).toMatchObject({originals:null,omission:"ORIGINAL_SCORE_PROOF_NOT_RETAINED"});
      expect(Object.keys(capture.tasks[0]).sort()).toEqual(["slot","task"]);
      const runtime=new ManagerScoreRuntime({maximum_observations:10,maximum_blocks:10,maximum_stress_subperiods:10,
        maximum_input_bytes:65_536,maximum_in_flight:1});
      const result=await runtime.calculate({...capture.tasks[0].task,policy:null});
      expect(result.provenance.input_digest).toBe(digest(before));expect(result.quality.status).toBe("policy_pending");expect(traps).toBe(0);
    });
  it("rejects invalid worker JSON without converting it into optional proof absence",()=>{
    const item=task();Object.assign(item.task,{opaque:Number.NaN});
    expect(()=>new ManagerOriginalCustodyLifecycle(caps).captureScoreInputs([item],65_536)).toThrow("MANAGER_SCORE_TASK_INVALID");
  });
  it("rejects source input bytes over their existing cap rather than using the optional custody cap",()=>{
    const item=task(),bytes=Buffer.byteLength(JSON.stringify([item])),lifecycle=new ManagerOriginalCustodyLifecycle(caps);
    expect(lifecycle.captureScoreInputs([item],bytes).originals).not.toBeNull();
    expect(()=>lifecycle.captureScoreInputs([item],bytes-1)).toThrow("MANAGER_SCORE_TASK_BOUND");
  });
  it("rejects source array Proxy and nested getters with zero trap execution",()=>{
    let traps=0;const lifecycle=new ManagerOriginalCustodyLifecycle(caps),items=[task()];
    const proxy=new Proxy(items,{get(){traps++;return undefined;},ownKeys(){traps++;return [];}});
    expect(()=>lifecycle.captureScoreInputs(proxy,65_536)).toThrow("MANAGER_SCORE_TASK_INVALID");
    Object.defineProperty(items[0].task,"opaque",{enumerable:true,get(){traps++;return "secret";}});
    expect(()=>lifecycle.captureScoreInputs(items,65_536)).toThrow("MANAGER_SCORE_TASK_INVALID");expect(traps).toBe(0);
  });
  it("runs delegates serially on the same existing lease, deadline and signal",async()=>{
    const input=idleInput(),order:string[]=[];let captured:ManagerOriginalIdleInput|undefined;
    const first=vi.fn(async(i:ManagerOriginalIdleInput)=>{captured=i;expect(i).toEqual(input);expect(i).not.toBe(input);
      expect(Object.isFrozen(i)).toBe(true);expect(i.lease).toBe(input.lease);expect(i.signal).toBe(input.signal);
      order.push("first-start");await Promise.resolve();order.push("first-end");});
    const second=vi.fn(async(i:ManagerOriginalIdleInput)=>{expect(i).toBe(captured);order.push("second");});
    await new ManagerOriginalCustodyLifecycle(caps,[{caps,idle:first},{caps,idle:second}]).idle(input);
    expect(order).toEqual(["first-start","first-end","second"]);
  });
  it("a refused Score delegate does not starve an independent delegate or hide its first failure",async()=>{
    const input=idleInput(),failure=new Error("SYNTHETIC:Score-policy-refused"),second=vi.fn(async()=>undefined);
    const lifecycle=new ManagerOriginalCustodyLifecycle(caps,[{caps,idle:async()=>{throw failure;}},{caps,idle:second}]);
    await expect(lifecycle.idle(input)).rejects.toBe(failure);expect(second).toHaveBeenCalledOnce();
  });
  it("never starts a delegate after cancellation or exhaustion of the existing deadline",async()=>{
    const idle=vi.fn(async()=>undefined),lifecycle=new ManagerOriginalCustodyLifecycle(caps,[{caps,idle}]),input=idleInput();
    await lifecycle.idle({...input,deadline_ms:performance.now()-1});expect(idle).not.toHaveBeenCalled();
    const cancellation=new AbortController(),reason=new Error("SYNTHETIC:aborted");cancellation.abort(reason);
    await expect(lifecycle.idle({...input,signal:cancellation.signal})).rejects.toBe(reason);expect(idle).not.toHaveBeenCalled();
  });
});
