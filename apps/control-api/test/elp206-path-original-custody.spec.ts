/** Unit custody/codec proof only. Every method manifest, scope, publication and
 * calibration below is SYNTHETIC, NOT accepted/installed PM source authority.
 * Real worker + prepare + retained decoder; no SQL, consumer/ACK or PG proof. */
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import type {ManagerModelDocument} from "../src/execution-v2/manager-model.contract";
import {
  captureManagerScoreOriginalInputs,decodeRetainedManagerScoreOriginal,ManagerScoreOriginalCustody,
  type ManagerScoreOriginalInput,type ManagerScoreOriginalCustodySnapshot,type ManagerScorePathMethodManifest,
} from "../src/execution-v2/manager-score-original-custody";
import type {ManagerScoreRecalculationTask} from "../src/execution-v2/manager-score-recalculation";
import {
  loadApprovedManagerScorePolicy,ManagerScoreRuntime,managerScoreMethodDigest,managerScorePolicyHash,
  type ApprovedManagerScorePolicy,type ManagerScoreMethodDescriptor,type ManagerScoreRuntimePolicyArtifact,
  type ManagerScoreRuntimeTask,
} from "../src/execution-v2/manager-score-runtime";

const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
const limit=65_536;
const limits={maximum_bundle_bytes:limit,maximum_revisions_per_source:4,maximum_retained_bytes_per_source:262_144};
const workerLimits={maximum_observations:20,maximum_blocks:20,maximum_stress_subperiods:40,
  maximum_input_bytes:30_000,maximum_in_flight:1};
const scope={workspace_id:"SYNTHETIC:path-custody",environment:"paper" as const,profile_id:"SYNTHETIC:paper",
  catalogue_digest:hash("SYNTHETIC:catalogue")};
const method:ManagerScoreMethodDescriptor={formula_hash:hash("SYNTHETIC:formula"),comparable_basis_id:"SYNTHETIC:basis",
  duration_key:"SYNTHETIC:four-bars",observation_frequency:"SYNTHETIC:grid",calendar:"SYNTHETIC:calendar",timezone:"UTC",
  currency:"USDT",cash_reference_id:"SYNTHETIC:cash",cost_method:"SYNTHETIC:net-costs",required_costs:["fees"],
  block_manifest_id:"SYNTHETIC:blocks",stress_policy_id:"SYNTHETIC:stress",grid_method_ref:"SYNTHETIC:grid-method",
  flow_adjustment_method_ref:"SYNTHETIC:flow",ownership_method_ref:"SYNTHETIC:ownership",fx_method_ref:"SYNTHETIC:fx"};
type Task=Omit<ManagerScoreRuntimeTask,"policy">;
type PathTask=Task&{input:Extract<Task["input"],{kind:"PATH"}>};
function task(kind:"PATH"|"METRICS"="PATH"):Task{
  const quality={comparable_basis_id:method.comparable_basis_id,individual_evidence_binding_id:"SYNTHETIC:evidence",
    window_start_ms:100,window_end_ms:500,as_of_ms:500,observed_duration_ms:400,currency:"USDT",
    required_costs_complete:true,stale:false,data_valid:true};
  return {scope:{...scope},binding:{subject_type:"alpha",subject_id:"SYNTHETIC:alpha",
    tuple_population_digest:hash("SYNTHETIC:population"),partition_digest:hash("SYNTHETIC:partition"),stage_filter:["PAPER"],
    window_start_ms:100,window_end_ms:500,comparable_basis_id:quality.comparable_basis_id,
    individual_evidence_binding_id:quality.individual_evidence_binding_id},source_revision:"SYNTHETIC:r1",
    source_set_digest:hash("SYNTHETIC:source"),source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:original",
    computed_at_ms:510,expected_policy_revision:null,input:kind==="METRICS"?{kind,quality:{...quality,sample_count:4,complete_block_count:2,
      metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}:
      {kind,quality,path:{observations:["0.02","-0.01","0.015","-0.005"].map((net_return,i)=>({
        from_ms:100+i*100,to_ms:200+i*100,net_return,cash_return:"0",stress_subperiods:[{
          net_return,opening_capital:"100",gross_executed_notional:"100",turnover_verified:true}]})),
        blocks:[{from_ms:100,to_ms:300,complete:true,expected_observations:2},{from_ms:300,to_ms:500,complete:true,expected_observations:2}],
        window_start_ms:100,window_end_ms:500,expected_observations:4,grid_verified:true,required_costs_complete:true,
        currency:"USDT",cash_currency:"USDT",block_manifest_registered_at_ms:0,stress_delta_bps:"5"}}};
}
function manifest(t:Task):ManagerScorePathMethodManifest{
  return {schema_version:"portal.execution.manager-score-path-method.v1",scope_digest:accessDigest(t.scope),
    binding_digest:accessDigest(t.binding),source_revision:t.source_revision,source_set_digest:t.source_set_digest,
    source_as_of_ms:t.input.quality.as_of_ms,path_input_digest:accessDigest(t.input),method:structuredClone(method),
    method_digest:managerScoreMethodDigest(method),method_manifest_ref:"SYNTHETIC:independent-original-artifact",
    available_at_ms:90,source_locator:"SYNTHETIC:fixture-NOT-accepted-source",original_stress_delta_bps:"5"};
}
function bind(t:Task,m=manifest(t)):ManagerScoreRecalculationTask{
  const manifest_json=JSON.stringify(m),path_dependency={manifest_json,manifest_sha256:hash(manifest_json)};
  // Private v2 opt-in: do not widen the public/legacy RuntimeTask interface.
  Object.defineProperty(t,"path_dependency_digest",{value:accessDigest(path_dependency),enumerable:true,writable:true,configurable:true});
  return {slot:"RAW",task:t,path_dependency};
}
function row(document:ManagerModelDocument,item:ManagerScoreOriginalInput){
  const publication=document.precomputed_scores![0],dep=item.path_dependency;
  const retained={...item,input_digest:hash(item.input_json),original_publication_digest:accessDigest(publication),
    method_custody:dep?{state:"BOUND_PATH_DEPENDENCY" as const,reason:null,method_digest:JSON.parse(dep.manifest_json).method_digest as string}:
      {state:"NOT_RETAINED" as const,reason:item.task.input.kind==="PATH"?"PATH_METHOD_PROOF_NOT_RETAINED" as const:"METRIC_DEPENDENCIES_NOT_RETAINED" as const}};
  const {workspace_id,environment,profile_id,revision,qualification,source_epoch,source_sequence,projection_generation,
    catalogue_digest,source_set_digest,as_of_ms}=document;
  const source={workspace_id,environment,profile_id,revision,payload_digest:accessDigest(document),qualification,
    source_epoch,source_sequence,projection_generation,catalogue_digest,source_set_digest,as_of_ms};
  const payload:ManagerScoreOriginalCustodySnapshot={schema_version:dep?"portal.execution.manager-score-original-inputs.v2":
    "portal.execution.manager-score-original-inputs.v1",source,retained_tasks:[retained],inputs_digest:accessDigest([retained]),calculation_key:""};
  return rehash({payload,payload_digest:"",calculation_key:""});
}
function rehash(r:{payload:ManagerScoreOriginalCustodySnapshot;payload_digest:string;calculation_key:string}){
  const b=r.payload;b.inputs_digest=accessDigest(b.retained_tasks);
  b.calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source:b.source,inputs_digest:b.inputs_digest});
  r.calculation_key=b.calculation_key;r.payload_digest=accessDigest(b);return r;
}
async function fixture(item:ManagerScoreRecalculationTask=bind(task()),policy:ApprovedManagerScorePolicy|null=null){
  const captured=captureManagerScoreOriginalInputs([item],limit)[0];
  const result=await new ManagerScoreRuntime(workerLimits).calculate({...captured.task,policy});
  const {preview:_preview,...quality}=result.quality;
  const document:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:scope.workspace_id,
    environment:scope.environment,profile_id:scope.profile_id,qualification:"SOURCE_VERIFIED",family_id:"alpha_fleet_overview",
    revision:captured.task.source_revision,supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",source_sequence:"1",
    projection_generation:"SYNTHETIC:g1",catalogue_digest:scope.catalogue_digest,source_set_digest:captured.task.source_set_digest,
    as_of_ms:500,recorded_through_ms:500,facts_through_ms:500,observed_at_ms:510,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},members:[],facts:[],
    precomputed_scores:[{slot:"RAW",quality,raw_metrics:result.raw_metrics,provenance:result.provenance}]};
  const custody=new ManagerScoreOriginalCustody(limits),prepared=custody.prepare(document,[captured]),stored=row(document,captured);
  // Expected unit envelope is checked against the actual private prepare hash;
  // it is not presented as a PG row or an independently qualified publication.
  expect(prepared).toEqual({calculation_key:stored.calculation_key,payload_digest:stored.payload_digest});
  const restore=()=>decodeRetainedManagerScoreOriginal(document,stored,limit);
  return {captured,result,document,custody,prepared,stored,restore};
}
function approvedPolicy():ApprovedManagerScorePolicy{
  const {grid_method_ref,flow_adjustment_method_ref,ownership_method_ref,fx_method_ref,...economic}=method;
  const artifact:ManagerScoreRuntimePolicyArtifact={schema_version:"portal.execution.manager-score-policy-runtime.v1",scope:{...scope},
    policy:{...economic,formula_id:"qbts_prb_v1_1",qualification:"RUNTIME_APPROVED",policy_id:"SYNTHETIC:policy",
      policy_hash:hash("unsealed"),approved_policy_id:"SYNTHETIC:approval",calibration_snapshot_id:"SYNTHETIC:calibration",
      stress_delta_bps:"5",anchors:{twr:["-0.02","0.08"],sharpe:["0","0.15"],mdd:["0","0.1"],add:["0","0.04"]},
      maturity:{minimum_samples:10,minimum_complete_blocks:4,minimum_duration_ms:400},canonical_decimal_places:12,
      issued_at_ms:5,calibration_cutoff_ms:4},runtime_config:{maximum_input_age_ms:100,minimum_window_ms:100,maximum_window_ms:10_000,
      grid_method_ref,flow_adjustment_method_ref,ownership_method_ref,fx_method_ref}};
  artifact.policy.policy_hash=managerScorePolicyHash(artifact.policy);const bytes=JSON.stringify(artifact);
  const loaded=loadApprovedManagerScorePolicy({artifact_bytes:bytes,scope,as_of_ms:500,approval_pin:{artifact_sha256:hash(bytes),
    policy_id:artifact.policy.policy_id,policy_hash:artifact.policy.policy_hash,formula_hash:artifact.policy.formula_hash,
    approved_policy_id:artifact.policy.approved_policy_id!,policy_revision:"SYNTHETIC:policy-r1",approval_ref:"SYNTHETIC:NOT-owner-approval",
    approved_at_ms:10,valid_until_ms:5000,scope:{...scope}}});
  if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));return loaded.handle;
}

describe("ELP2-06 PATH original custody — real unit boundary / SYNTHETIC proof only",()=>{
  it("preserves the prior exact canonical method tuple/hash without adding normalization policy fields",()=>{
    const m={...method,required_costs:["funding","fees"]};
    // Independent copy of the PRE-extraction tuple/canonical-byte recipe. Keep
    // the explicit keys: spreading a new descriptor field here would hide a
    // compatibility regression in the shared identity helper.
    const priorTuple={formula_hash:m.formula_hash,comparable_basis_id:m.comparable_basis_id,
      duration_key:m.duration_key,observation_frequency:m.observation_frequency,calendar:m.calendar,timezone:m.timezone,
      currency:m.currency,cash_reference_id:m.cash_reference_id,cost_method:m.cost_method,required_costs:[...m.required_costs].sort(),
      block_manifest_id:m.block_manifest_id,stress_policy_id:m.stress_policy_id,grid_method_ref:m.grid_method_ref,
      flow_adjustment_method_ref:m.flow_adjustment_method_ref,ownership_method_ref:m.ownership_method_ref,fx_method_ref:m.fx_method_ref};
    function priorCanonical(value:unknown):string{
      if(Array.isArray(value))return `[${value.map(priorCanonical).join(",")}]`;
      if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(key=>
        `${JSON.stringify(key)}:${priorCanonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
      return JSON.stringify(value);
    }
    expect(managerScoreMethodDigest(m)).toBe(hash(priorCanonical(priorTuple)));
    expect(managerScoreMethodDigest({...m,required_costs:["fees","funding"]})).toBe(managerScoreMethodDigest(m));
    expect(()=>managerScoreMethodDigest({...m,required_costs:["fees","fees"]})).toThrow();
    for(const extra of [{anchors:{twr:["-0.02","0.08"]}},{maturity:{minimum_samples:4}},
      {stress_delta_bps:"5"},{unrecognized_method_field:"SYNTHETIC:unknown"}])
      expect(()=>managerScoreMethodDigest(Object.assign({},m,extra))).toThrow();
  });
  it.each(["PATH","METRICS"] as const)("keeps v1 %s root/input marker-named opaque bytes without opting in",async kind=>{
    const t=task(kind);Object.defineProperty(t,"path_dependency_digest",{enumerable:true,value:{opaque:["not a digest","\u2028","   "]}});
    Object.defineProperty(t,"path_dependency",{enumerable:true,value:{opaque:true}});
    Object.defineProperty(t.input,"path_dependency",{enumerable:true,value:["not a manifest",null]});
    const original=JSON.stringify(t),f=await fixture({slot:"RAW",task:t}),restored=f.restore();
    expect(f.result.provenance.input_digest).toBe(hash(original));
    expect(restored.schema_version).toBe("portal.execution.manager-score-original-inputs.v1");
    expect(restored.retained_tasks[0].input_json).toBe(original);
    expect(JSON.stringify(restored.retained_tasks[0].task)).toBe(original);
    expect(restored.retained_tasks[0].method_custody).toEqual({state:"NOT_RETAINED",
      reason:kind==="PATH"?"PATH_METHOD_PROOF_NOT_RETAINED":"METRIC_DEPENDENCIES_NOT_RETAINED"});
    expect(restored.retained_tasks[0].path_dependency).toBeUndefined();
  });
  it("retains an independently supplied v2 manifest before the original pending-policy worker",async()=>{
    const f=await fixture(),restored=f.restore(),entry=restored.retained_tasks[0];
    expect(f.result.quality).toMatchObject({status:"policy_pending",value:null});
    expect(restored.schema_version).toBe("portal.execution.manager-score-original-inputs.v2");
    expect(entry.method_custody).toEqual({state:"BOUND_PATH_DEPENDENCY",reason:null,method_digest:managerScoreMethodDigest(method)});
    expect(entry.path_dependency).toEqual(f.captured.path_dependency);
    expect(entry.input_json).toBe(f.captured.input_json);expect(entry.input_digest).toBe(f.result.provenance.input_digest);
    expect(entry.task.input).toEqual(f.captured.task.input);
  });
  it("detaches task and sidecar synchronously, before caller mutation or worker yield",async()=>{
    const item=bind(task()),before=JSON.stringify(item),captured=captureManagerScoreOriginalInputs([item],limit);
    item.path_dependency!.manifest_json="{}";item.task.binding.subject_id="mutated";
    expect(JSON.stringify(captured.map(({input_json:_json,...value})=>value)[0])).toBe(before);
    const f=await fixture(captured[0]);expect(f.restore().retained_tasks[0].task.binding.subject_id).toBe("SYNTHETIC:alpha");
  });
  const faults:Array<[string,(m:ManagerScorePathMethodManifest)=>void]>=[
    ["scope",m=>{m.scope_digest=hash("other");}],["binding",m=>{m.binding_digest=hash("other");}],
    ["source revision",m=>{m.source_revision="SYNTHETIC:other";}],["source set",m=>{m.source_set_digest=hash("other");}],
    ["source cutoff",m=>{m.source_as_of_ms=499;}],["path input",m=>{m.path_input_digest=hash("other");}],
    ["method digest",m=>{m.method_digest=hash("other");}],["method basis",m=>{m.method.comparable_basis_id="other";m.method_digest=managerScoreMethodDigest(m.method);}],
    ["method currency",m=>{m.method.currency="USD";m.method_digest=managerScoreMethodDigest(m.method);}],
    ["stress delta",m=>{m.original_stress_delta_bps="6";}],["zero stress",m=>{m.original_stress_delta_bps="0";}],
    ["future availability",m=>{m.available_at_ms=501;}],["pre-block availability",m=>{m.available_at_ms=0;}],
    ["locator newline",m=>{m.source_locator+="\n";}],["blank manifest ref",m=>{m.method_manifest_ref="   ";}],
  ];
  it.each(faults)("refuses coherent-rehashed %s proof synchronously before worker",(_name,change)=>{
    const t=task() as PathTask;if(_name==="pre-block availability")t.input.path.block_manifest_registered_at_ms=1;
    const m=manifest(t);change(m);const item=bind(t,m);
    expect(()=>captureManagerScoreOriginalInputs([item],limit)).toThrow();
  });
  it.each(["missing-marker","wrong-marker","hash","malformed-json","schema","manifest-extra","method-extra",
    "outer-extra","oversize","surrogate","metrics-kind","both-dependencies"] as const)("refuses closed intake fault %s",fault=>{
    const t=task(fault==="metrics-kind"?"METRICS":"PATH"),item=bind(t);
    if(fault==="missing-marker")delete (t as unknown as Record<string,unknown>).path_dependency_digest;
    if(fault==="wrong-marker")Object.defineProperty(t,"path_dependency_digest",{value:hash("other")});
    if(fault==="hash")item.path_dependency!.manifest_sha256=hash("other");
    if(["malformed-json","schema","manifest-extra","method-extra","oversize","surrogate"].includes(fault)){
      const m=manifest(t) as unknown as Record<string,unknown>;
      if(fault==="schema")m.schema_version="portal.execution.manager-score-path-method.v99";
      if(fault==="manifest-extra")m.verified=true;
      if(fault==="method-extra")(m.method as Record<string,unknown>).verified=true;
      if(fault==="oversize")m.source_locator="\u20ac".repeat(24_000);
      const json=fault==="malformed-json"?"{":fault==="surrogate"?JSON.stringify(m)+"\ud800":JSON.stringify(m);
      item.path_dependency={manifest_json:json,manifest_sha256:hash(json)};
      Object.defineProperty(t,"path_dependency_digest",{value:accessDigest(item.path_dependency)});
    }
    if(fault==="outer-extra")Object.defineProperty(item.path_dependency!,"verified",{value:true,enumerable:true});
    if(fault==="both-dependencies")item.metrics_dependency={source_revision:t.source_revision,source_set_digest:t.source_set_digest,
      source_as_of_ms:500,metrics_input_digest:accessDigest(t.input),method_digest:hash("other"),stress_delta_bps:"5",source_locator:"SYNTHETIC:other"};
    expect(()=>captureManagerScoreOriginalInputs([item],limit)).toThrow();
  });
  it("rejects sidecar accessors without invoking them and rejects forged prototype/symbol/cycle inputs",()=>{
    let calls=0;const item=bind(task());Object.defineProperty(item.path_dependency!,"manifest_json",{enumerable:true,get(){calls++;return "{}";}});
    expect(()=>captureManagerScoreOriginalInputs([item],limit)).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");expect(calls).toBe(0);
    for(const malformed of [Object.assign(Object.create({inherited:true}),bind(task())),
      Object.assign(bind(task()),{[Symbol("authority")]:true})])
      expect(()=>captureManagerScoreOriginalInputs([malformed],limit)).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");
    const cycle=bind(task());Object.defineProperty(cycle.task,"opaque",{enumerable:true,value:cycle});
    expect(()=>captureManagerScoreOriginalInputs([cycle],limit)).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");
  });
  it.each(["v1-to-v2","v2-to-v1"] as const)("does not accept a rehashed schema-only %s retrofit",async direction=>{
    const f=await fixture(direction==="v1-to-v2"?{slot:"RAW",task:task()}:bind(task()));
    f.stored.payload.schema_version=direction==="v1-to-v2"?"portal.execution.manager-score-original-inputs.v2":"portal.execution.manager-score-original-inputs.v1";
    rehash(f.stored);expect(f.restore).toThrow("MANAGER_ORIGINAL_INPUT_MISMATCH");
  });
  it("cannot attach today's manifest after the immutable original worker hash was published",async()=>{
    const f=await fixture({slot:"RAW",task:task()}),forged=bind(structuredClone(f.captured.task));
    const replacement=captureManagerScoreOriginalInputs([forged],limit)[0];
    expect(()=>f.custody.prepare(f.document,[replacement])).toThrow("MANAGER_ORIGINAL_SOURCE_MISMATCH");
  });
  it("refuses coherent sidecar/task/envelope rehash while the actual source publication remains unchanged",async()=>{
    const f=await fixture(),entry=f.stored.payload.retained_tasks[0],originalSource=accessDigest(f.document);
    const m=JSON.parse(entry.path_dependency!.manifest_json) as ManagerScorePathMethodManifest;
    m.method.grid_method_ref="SYNTHETIC:substituted-today";m.method_digest=managerScoreMethodDigest(m.method);
    const substitute=bind(entry.task,m);entry.path_dependency=substitute.path_dependency;
    entry.input_json=JSON.stringify(entry.task);entry.input_digest=hash(entry.input_json);
    rehash(f.stored);expect(f.restore).toThrow("MANAGER_ORIGINAL_SOURCE_MISMATCH");
    expect(accessDigest(f.document)).toBe(originalSource);
  });
  it.each(["missing-turnover","incomplete-grid","missing-costs","stale","invalid-data"] as const)
    ("retains authentic approved-worker %s null/partial outputs without curing original facts",async fault=>{
      const t=task() as PathTask;t.expected_policy_revision="SYNTHETIC:policy-r1";
      if(fault==="missing-turnover")t.input.path.observations[2].stress_subperiods=null;
      if(fault==="incomplete-grid")t.input.path.grid_verified=false;
      if(fault==="missing-costs"){t.input.path.required_costs_complete=false;t.input.quality.required_costs_complete=false;}
      if(fault==="stale")t.input.quality.stale=true;
      if(fault==="invalid-data")t.input.quality.data_valid=false;
      const f=await fixture(bind(t),approvedPolicy()),restored=f.restore();
      expect(f.result.quality.value).toBeNull();expect(f.result.quality.status).not.toBe("policy_pending");
      expect(restored.retained_tasks[0].method_custody.state).toBe("BOUND_PATH_DEPENDENCY");
      expect(restored.retained_tasks[0].input_json).toBe(f.captured.input_json);
      expect(restored.retained_tasks[0].original_publication_digest).toBe(accessDigest(f.document.precomputed_scores![0]));
      if(fault==="missing-turnover")expect(f.result.raw_metrics?.stress_excess_twr).toBeNull();
    });

it.each(["v1","v2"] as const)("keeps existing %s exact original bytes/keys when optional Composition capture is omitted or empty",async version=>{
  const source=task();Object.defineProperty(source,"SYNTHETIC_opaque",{enumerable:true,value:{items:["\u0085","\u2028","   ",null]}});
  const f=await fixture(version==="v2"?bind(source):{slot:"RAW",task:source});
  const before=JSON.stringify(f.stored),ordinary=f.custody.prepare(f.document,[f.captured]);
  const omitted=f.custody.prepare(f.document,[f.captured],undefined),empty=f.custody.prepare(f.document,[f.captured],[]);
  expect(omitted).toEqual(ordinary);expect(empty).toEqual(ordinary);expect(ordinary).toEqual(f.prepared);
  expect(f.restore().schema_version).toBe(`portal.execution.manager-score-original-inputs.${version}`);
  expect(f.restore().retained_tasks[0].input_json).toBe(f.captured.input_json);
  expect(f.restore().retained_tasks[0].input_digest).toBe(f.result.provenance.input_digest);
  expect(JSON.stringify(f.stored)).toBe(before);expect(f.restore()).not.toHaveProperty("retained_compositions");
});
});
