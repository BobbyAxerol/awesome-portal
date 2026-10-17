/** PRIVATE opt-in RESTATED coordinator. No timer, caller installation, public
 * selector, source ACK, legacy head replacement or operational-current score. */
import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { ManagerModelRepository, prepareManagerProjection } from "./manager-model.store";
import { fenceManagerProjection, ManagerProjectionLeases, type ManagerProjectionLease } from "./manager-lease";
import { ManagerScoreOriginalCustody, type ManagerScoreOriginalCustodySnapshot,
  type ManagerScoreOriginalInput, type PreparedManagerScoreOriginalCustody } from "./manager-score-original-custody";
import { managerScorePublication, managerScoreBinding } from "./manager-score-publication.contract";
import { managerScoreRestatementPolicy, managerScoreHistoricalPolicyState, type ApprovedManagerScorePolicy, type ManagerScoreRuntime,
  type ManagerScoreRuntimeTask, type ManagerScoreHistoricalRestatement,
  type ManagerScoreWithheldMetricReasons } from "./manager-score-runtime";
import type { ManagerScoreRecalculationConfig } from "./manager-score-recalculation";
import type { ManagerProjectionSource, ManagerConsumerDelivery } from "./manager-consumer";
import { datasetPublication } from "./publication.contract";
import { qualifyDatasetPublication, publicationCommissioningCurrent, publicationCommissioningDeadline,
  type PublicationCommissioning } from "./publication-adapter";
import type { ExecutionReadPublicationRequest } from "./read-publication";
import { restoreManagerCompositionOriginalAllocation,
  type ManagerCompositionOriginalAllocationCustody,type ManagerCompositionOriginalAllocationCapture,
  type RetainedManagerAllocationInputs } from "./manager-composition-runtime";
import { managerCompositionBinding,type ManagerCompositionBinding } from "./manager-composition-publication.contract";
import { MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION,decodeRetainedManagerCompositionRestatement,
  type ManagerCompositionHistoricalRuntime,type ManagerCompositionHistoricalRestatement } from "./manager-composition-restatement";
type CompositionCustodyOmissionReason=Extract<ManagerCompositionOriginalAllocationCapture,{status:"NOT_PUBLISHED"}>["reason_code"];

type Policy = NonNullable<ReturnType<typeof managerScoreRestatementPolicy>>;
type Original = ManagerScoreOriginalCustodySnapshot;
type Item = Original["retained_tasks"][number];
type Task = Omit<ManagerScoreRuntimeTask,"policy">;
type Entry = {
  slot: Item["slot"]; binding: Task["binding"]; original_input_digest: string;
  availability: "AVAILABLE"|"PARTIAL"|"NOT_PUBLISHED";
  reason_codes: string[]; historical: ManagerScoreHistoricalRestatement|null;
};
export interface ManagerScoreRestatementV1Snapshot {
  schema_version: "portal.execution.manager-score-restatement.v1";
  revision_mode: "RESTATED_CURRENT_POLICY"; purpose: "HISTORICAL_ANALYSIS_ONLY"; operational_current:false;
  source: Original["source"]; original_custody_key:string; original_inputs_digest:string;
  policy:Policy; calculation_revision:string; input_method_revision:string;
  knowledge_cutoff_ms:number; computed_at_ms:number; entries:Entry[];
  calculation_key:string; supersedes_calculation_key:string|null;
}
export interface ManagerScoreRestatementV2Snapshot extends Omit<ManagerScoreRestatementV1Snapshot,"schema_version"> {
  schema_version:"portal.execution.manager-score-restatement.v2";
  composition_worker_schema_version:typeof MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION;
  composition_calculation_revision:string;
  composition_entries:{binding:ManagerCompositionBinding;allocation_custody_digest:string;
    historical:ManagerCompositionHistoricalRestatement}[];
}
export type ManagerScoreRestatementSnapshot=ManagerScoreRestatementV1Snapshot|ManagerScoreRestatementV2Snapshot;
/** Explicit private installation only. This does not construct a worker or
 * approve a calibration/source by default. */
export interface ManagerScoreDependentComposition {
  runtime:ManagerCompositionHistoricalRuntime;calculation_revision:string;
}
export interface ManagerScoreRestatementRead {key:string|null;view:ManagerScoreRestatementSnapshot|null}
const hash=(s:string)=>"sha256:"+createHash("sha256").update(s).digest("hex");
function fail(s:string):never {throw new Error(s);}
const ms=z.number().int().nonnegative().safe();
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const text=z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const keys=(d:Pick<ManagerModelDocument,"workspace_id"|"environment"|"profile_id">)=>[d.workspace_id,d.environment,d.profile_id];
const rowParams=(d:ManagerModelDocument)=>[...keys(d),d.revision];
const bindingKey=(b:Task["binding"])=>accessDigest({...b,stage_filter:[...b.stage_filter].sort()});
const itemKey=(i:Pick<Item,"slot"|"task">)=>accessDigest({slot:i.slot,binding:bindingKey(i.task.binding)});
const semanticKey=(o:Original,p:Policy,c:Pick<ManagerScoreRecalculationConfig,"calculation_revision"|"input_method_revision">)=>accessDigest({
  mode:"RESTATED_CURRENT_POLICY",source:o.source,original_custody_key:o.calculation_key,
  original_inputs_digest:o.inputs_digest,policy_identity_digest:p.identity_digest,
  calculation_revision:c.calculation_revision,input_method_revision:c.input_method_revision,
});
const compositionKey=(binding:ManagerCompositionBinding)=>accessDigest({...binding,stage_filter:[...binding.stage_filter].sort()});
function combinedKey(o:Original,p:Policy,c:Pick<ManagerScoreRecalculationConfig,"calculation_revision"|"input_method_revision">,
  compositionRevision:string):string {
  if(o.schema_version!=="portal.execution.manager-score-original-inputs.v3"||o.retained_compositions.length===0)
    fail("MANAGER_RESTATED_COMPOSITION_ORIGINAL_REQUIRED");
  return accessDigest({domain:"portal.execution.manager-score-restatement.v2",
    composition_worker_schema_version:MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION,
    composition_calculation_revision:compositionRevision,score_semantic_key:semanticKey(o,p,c),
    original_composition_custody_digests:o.retained_compositions.map(item=>item.custody_digest)});
}
const selectHead="SELECT calculation_key FROM execution_manager_score_mode_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='RESTATED_CURRENT_POLICY'";
const selectRevision="SELECT calculation_key,payload,payload_digest FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND calculation_key=$5";
type StoredRow={calculation_key:string;payload:unknown;payload_digest:string};

/** Reject callbacks/prototypes/getters/undefined before serialization. The
 * original exact task bytes are already normalized by the custody codec. */
function capture<T>(value:T,limit:number,rejectProxies=false):T {
  let nodes=0,bytes=0;const path=new Set<object>();
  const visit=(v:unknown,depth=0):void=>{
    if(++nodes>1_000_000||depth>64)fail("MANAGER_RESTATED_INPUT_BOUND");
    if(typeof v==="string")bytes+=Buffer.byteLength(v)+2;
    else if(v===null||typeof v==="boolean"||typeof v==="number"&&Number.isFinite(v))bytes+=24;
    else if(v&&typeof v==="object"){
      if(rejectProxies&&isProxy(v))fail("MANAGER_RESTATED_INPUT_INVALID");
      if(path.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))||
        Object.getOwnPropertySymbols(v).length)fail("MANAGER_RESTATED_INPUT_INVALID");
      path.add(v);const descriptors=Object.entries(Object.getOwnPropertyDescriptors(v));
      if(Array.isArray(v)&&descriptors.length!==v.length+1)fail("MANAGER_RESTATED_INPUT_INVALID");
      for(const [k,d] of descriptors){
        if(Array.isArray(v)&&k==="length")continue;
        if(!d.enumerable||!("value"in d)||Array.isArray(v)&&(!/^(?:0|[1-9]\d*)$(?![\s\S])/.test(k)||Number(k)>=v.length))
          fail("MANAGER_RESTATED_INPUT_INVALID");
        bytes+=Buffer.byteLength(k)+4;visit(d.value,depth+1);
      }path.delete(v);
    }else fail("MANAGER_RESTATED_INPUT_INVALID");
    if(bytes>limit)fail("MANAGER_RESTATED_INPUT_BOUND");
  };
  visit(value);const json=JSON.stringify(value);if(Buffer.byteLength(json)>limit)fail("MANAGER_RESTATED_INPUT_BOUND");
  return JSON.parse(json) as T;
}
function sameDelta(a:string,b:string):boolean {
  const normalize=(s:string)=>{const [whole,fraction=""]=s.split(".");return whole+"."+fraction.replace(/0+$/,"");};
  return normalize(a)===normalize(b);
}
/** Actual historical method evidence comes ONLY from original hash-bound
 * dependency custody, not a newly approved normalization artifact. */
function work(item:Item,p:Policy,revision:string,computed:number):
  {task:Task;withheld:ManagerScoreWithheldMetricReasons;reasons:string[]}|{absence:string} {
  if(item.task.input.kind==="PATH"){
    // This state is REBUILT from an actual immutable v2 ORIGINAL source row,
    // including manifest bytes/input/scope/binding/source/availability pins.
    if(item.method_custody.state!=="BOUND_PATH_DEPENDENCY"||!item.path_dependency)
      return {absence:"PATH_METHOD_PROOF_NOT_RETAINED"};
    if(item.method_custody.method_digest!==p.method_digest)
      return {absence:"INPUT_METHOD_NOT_RETAINED_FOR_POLICY"};
    const task=JSON.parse(item.input_json) as Task;
    if(task.input.kind!=="PATH")return fail("MANAGER_RESTATED_INPUT_INVALID");
    task.expected_policy_revision=p.policy_revision;task.calculation_revision=revision;task.computed_at_ms=computed;
    // The ONLY path edit already permitted by calculateRestated. Preserve all
    // original grid/cost/gap/turnover/subperiod facts, including their absence.
    task.input.path.stress_delta_bps=p.stress_delta_bps;
    return {task,withheld:{},reasons:[]};
  }
  const dep=item.metrics_dependency;
  if(item.method_custody.state!=="BOUND_METRICS_DEPENDENCY"||!dep)
    return {absence:"METRIC_DEPENDENCIES_NOT_RETAINED"};
  if(dep.method_digest!==p.method_digest)return {absence:"INPUT_METHOD_NOT_RETAINED_FOR_POLICY"};
  const task=JSON.parse(item.input_json) as Task;
  if(task.input.kind!=="METRICS")return fail("MANAGER_RESTATED_INPUT_INVALID");
  task.expected_policy_revision=p.policy_revision;task.calculation_revision=revision;task.computed_at_ms=computed;
  const withheld:ManagerScoreWithheldMetricReasons={},reasons:string[]=[];
  if(!sameDelta(dep.stress_delta_bps,p.stress_delta_bps)){
    if(task.input.quality.metrics.stress_excess_twr!==null){
      task.input.quality.metrics.stress_excess_twr=null;
      withheld.stress_excess_twr=["STRESS_INPUTS_NOT_RETAINED_FOR_POLICY"];
    }
    reasons.push("STRESS_INPUTS_NOT_RETAINED_FOR_POLICY");
  }
  return {task,withheld,reasons};
}
function availability(result:ManagerScoreHistoricalRestatement,reasons:readonly string[]):Entry["availability"] {
  return result.result.quality.value!==null&&reasons.length===0?"AVAILABLE":"PARTIAL";
}
const header=z.object({
  schema_version:z.literal("portal.execution.manager-score-restatement.v1"),revision_mode:z.literal("RESTATED_CURRENT_POLICY"),
  purpose:z.literal("HISTORICAL_ANALYSIS_ONLY"),operational_current:z.literal(false),
  source:z.unknown(),original_custody_key:digest,original_inputs_digest:digest,
  policy:z.object({identity_digest:digest,method_digest:digest,policy_revision:text,stress_delta_bps:z.string().max(512)
    .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/),approved_at_ms:ms,valid_until_ms:ms}).strict(),
  calculation_revision:text,input_method_revision:text,knowledge_cutoff_ms:ms,computed_at_ms:ms,
  entries:z.array(z.object({slot:z.enum(["RAW","DIRECT_NAV"]),binding:managerScoreBinding,original_input_digest:digest,
    availability:z.enum(["AVAILABLE","PARTIAL","NOT_PUBLISHED"]),reason_codes:z.array(text).max(8),historical:z.unknown().nullable()}).strict()).min(1).max(128),
  calculation_key:digest,supersedes_calculation_key:digest.nullable(),
}).strict();
const storedPathSummary=z.object({sample_count:ms,complete_block_count:ms,incomplete_tail_duration_ms:ms,
  reason_codes:z.array(text).max(32).refine(v=>new Set(v).size===v.length)}).strict();
function parseV1(row:StoredRow,o:Original,c:Pick<ManagerScoreRecalculationConfig,"maximum_bundle_bytes">):ManagerScoreRestatementV1Snapshot {
  const b=header.parse(capture(row.payload,c.maximum_bundle_bytes)) as ManagerScoreRestatementV1Snapshot;
  if(row.calculation_key!==b.calculation_key||accessDigest(b)!==row.payload_digest||
    accessDigest(o.source)!==accessDigest(b.source)||o.calculation_key!==b.original_custody_key||o.inputs_digest!==b.original_inputs_digest||
    b.calculation_key!==semanticKey(o,b.policy,{calculation_revision:b.calculation_revision,input_method_revision:b.input_method_revision})||b.entries.length!==o.retained_tasks.length||
    b.knowledge_cutoff_ms<b.source.as_of_ms||b.computed_at_ms<b.knowledge_cutoff_ms||
    b.policy.approved_at_ms>b.knowledge_cutoff_ms||b.policy.valid_until_ms<=b.computed_at_ms||b.computed_at_ms>Date.now())
    fail("MANAGER_RESTATED_DIGEST_MISMATCH");
  validateScoreEntries(b,o);return b;
}
/** Same legacy Score validator for both versions; no calculator on decode. */
function validateScoreEntries(b:ManagerScoreRestatementV1Snapshot|ManagerScoreRestatementV2Snapshot,o:Original):void {
  const seen=new Set<string>();
  for(const entry of b.entries){
    const original=o.retained_tasks.find(t=>t.slot===entry.slot&&bindingKey(t.task.binding)===bindingKey(entry.binding));
    if(!original||entry.original_input_digest!==original.input_digest||hash(original.input_json)!==original.input_digest||
      original.task.computed_at_ms>b.knowledge_cutoff_ms||seen.has(itemKey(original)))fail("MANAGER_RESTATED_ORIGINAL_MISMATCH");
    seen.add(itemKey(original));
    const expected=work(original,b.policy,b.calculation_revision,b.computed_at_ms);
    if("absence"in expected){
      if(entry.historical!==null||entry.availability!=="NOT_PUBLISHED"||accessDigest(entry.reason_codes)!==accessDigest([expected.absence]))
        fail("MANAGER_RESTATED_METHOD_MISMATCH");continue;
    }
    const h=entry.historical;
    if(!h||!h.result||!h.result.quality||!h.feed_freshness||Object.keys(h).sort().join(",")!==["schema_version","revision_mode","purpose","source_method_compatibility","knowledge_cutoff_ms",
      "economic_as_of_ms","original_input_digest","derived_input_digest","policy_identity_digest","derivation_context_digest",
      "checked_at_ms","operational_current","feed_freshness","withheld_metric_reasons","result"].sort().join(",")||
      h.schema_version!=="portal.execution.manager-score-restatement-worker.v1"||h.revision_mode!=="RESTATED_CURRENT_POLICY"||
      h.purpose!=="HISTORICAL_ANALYSIS_ONLY"||h.operational_current!==false||h.source_method_compatibility!=="CALLER_CUSTODY_REQUIRED"||
      h.knowledge_cutoff_ms!==b.knowledge_cutoff_ms||h.economic_as_of_ms!==b.source.as_of_ms||
      h.original_input_digest!==original.input_digest||h.derived_input_digest!==hash(JSON.stringify(expected.task))||
      h.policy_identity_digest!==b.policy.identity_digest||h.checked_at_ms<b.computed_at_ms||h.checked_at_ms>=b.policy.valid_until_ms||h.checked_at_ms>Date.now()||
      accessDigest(h.withheld_metric_reasons)!==accessDigest(expected.withheld))
      fail("MANAGER_RESTATED_RESULT_MISMATCH");
    const derivation={revision_mode:h.revision_mode,purpose:h.purpose,source_method_compatibility:h.source_method_compatibility,
      knowledge_cutoff_ms:h.knowledge_cutoff_ms,economic_as_of_ms:h.economic_as_of_ms,original_input_digest:h.original_input_digest,
      derived_input_digest:h.derived_input_digest,policy_identity_digest:h.policy_identity_digest,withheld_metric_reasons:h.withheld_metric_reasons};
    if(h.derivation_context_digest!==accessDigest(derivation)||
      Object.keys(h.result).sort().join(",")!=="path_summary,provenance,quality,raw_metrics"||h.result.quality.preview!==null||
      !ms.safeParse(h.checked_at_ms).success||
      Object.keys(h.feed_freshness).sort().join(",")!=="maximum_input_age_ms,source_age_ms,status"||
      !ms.safeParse(h.feed_freshness.maximum_input_age_ms).success||h.feed_freshness.maximum_input_age_ms<1||
      h.feed_freshness.source_age_ms!==h.checked_at_ms-b.source.as_of_ms||
      h.feed_freshness.status!==(h.feed_freshness.source_age_ms>h.feed_freshness.maximum_input_age_ms?
        "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS":"WITHIN_CURRENT_FEED_FRESHNESS"))
      fail("MANAGER_RESTATED_RESULT_MISMATCH");
    if(expected.task.input.kind==="METRICS"){
      if(h.result.path_summary!==null||accessDigest(h.result.raw_metrics)!==accessDigest(expected.task.input.quality.metrics))
        fail("MANAGER_RESTATED_RESULT_MISMATCH");
    }else{
      // GET restores an already immutable named-worker result. Validate the
      // closed shape/count bounds and exact provenance; DO NOT recompute PATH
      // metrics or F(PRB) here. Stored worker intake is the numeric boundary.
      const summary=storedPathSummary.parse(h.result.path_summary),path=expected.task.input.path;
      if(h.result.raw_metrics===null||summary.sample_count!==path.observations.length||
        summary.complete_block_count>path.blocks.length||
        summary.incomplete_tail_duration_ms>path.window_end_ms-path.window_start_ms||
        summary.reason_codes.some(r=>!h.result.quality.reason_codes.includes(r)))
        fail("MANAGER_RESTATED_RESULT_MISMATCH");
    }
    const {preview:_preview,...quality}=h.result.quality;
    const validated=managerScorePublication.parse({slot:entry.slot,quality,raw_metrics:h.result.raw_metrics,provenance:h.result.provenance});
    const p=validated.provenance;
    if(accessDigest(p.scope)!==accessDigest(expected.task.scope)||bindingKey(p.binding)!==bindingKey(expected.task.binding)||
      p.source_revision!==b.source.revision||p.source_set_digest!==b.source.source_set_digest||p.source_as_of_ms!==b.source.as_of_ms||
      p.source_qualification!=="SOURCE_VERIFIED"||p.input_digest!==h.derived_input_digest||p.computed_at_ms!==b.computed_at_ms||
      p.calculation_revision!==b.calculation_revision||p.policy_revision!==b.policy.policy_revision||
      p.approved_at_ms!==b.policy.approved_at_ms||p.policy_valid_until_ms!==b.policy.valid_until_ms||
      entry.availability!==availability(h,expected.reasons)||accessDigest(entry.reason_codes)!==accessDigest(expected.reasons))
      fail("MANAGER_RESTATED_RESULT_MISMATCH");
  }
}
const combinedHeader=header.extend({
  schema_version:z.literal("portal.execution.manager-score-restatement.v2"),
  composition_worker_schema_version:z.literal(MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION),
  composition_calculation_revision:text,
  entries:z.array(header.shape.entries.element).max(128),
  composition_entries:z.array(z.object({binding:managerCompositionBinding,allocation_custody_digest:digest,
    historical:z.unknown()}).strict()).min(1).max(128),
}).strict();
function originalCompositionInputs(o:Original,d:ManagerModelDocument,maximumBytes:number):{
  binding:ManagerCompositionBinding;custody_digest:string;allocation:RetainedManagerAllocationInputs;
}[]{
  if(o.schema_version!=="portal.execution.manager-score-original-inputs.v3"||o.retained_compositions.length===0||
    accessDigest(d)!==o.source.payload_digest||d.revision!==o.source.revision)
    fail("MANAGER_RESTATED_COMPOSITION_ORIGINAL_REQUIRED");
  // Original decoder already enforces bounded complete v3 census and parent
  // child digest. Restore AGAIN from ACTUAL135, never today's allocation.
  const seen=new Set<string>();
  return o.retained_compositions.map(item=>{
    const key=compositionKey(item.custody.binding);
    if(seen.has(key))fail("MANAGER_RESTATED_COMPOSITION_CENSUS_MISMATCH");seen.add(key);
    const restored=restoreManagerCompositionOriginalAllocation({custody:item.custody,
      expected_custody_digest:item.custody_digest,document:d,maximum_bytes:maximumBytes});
    if(restored.status!=="READY")fail("MANAGER_RESTATED_COMPOSITION_ORIGINAL_INVALID");
    return {binding:item.custody.binding,custody_digest:item.custody_digest,allocation:restored.handle};
  });
}
function parse(row:StoredRow,o:Original,c:Pick<ManagerScoreRecalculationConfig,"maximum_bundle_bytes">,
  document?:ManagerModelDocument):ManagerScoreRestatementSnapshot {
  const raw=row.payload;
  // Do not reflect through an attacker-controlled Proxy merely to dispatch.
  if(raw&&typeof raw==="object"&&isProxy(raw))fail("MANAGER_RESTATED_INPUT_INVALID");
  const version=raw&&typeof raw==="object"?Object.getOwnPropertyDescriptor(raw,"schema_version"):undefined;
  if(!version||!("value"in version)||version.value!=="portal.execution.manager-score-restatement.v2")
    return parseV1(row,o,c);
  const b=combinedHeader.parse(capture(raw,c.maximum_bundle_bytes,true)) as ManagerScoreRestatementV2Snapshot;
  if(!document)fail("MANAGER_RESTATED_COMPOSITION_SOURCE_REQUIRED");
  const d=managerModelDocument.parse(capture(document,8*1024*1024,true));
  const inputs=originalCompositionInputs(o,d,c.maximum_bundle_bytes);
  const originalCutoff=Math.max(d.as_of_ms,d.observed_at_ms,d.recorded_through_ms,
    ...o.retained_tasks.map(item=>item.task.computed_at_ms),
    ...(o.schema_version==="portal.execution.manager-score-original-inputs.v3"?
      o.retained_compositions.flatMap(item=>[item.custody.original_computed_at_ms,item.custody.captured_at_ms]):[]));
  if(row.calculation_key!==b.calculation_key||accessDigest(b)!==row.payload_digest||
    accessDigest(o.source)!==accessDigest(b.source)||o.calculation_key!==b.original_custody_key||o.inputs_digest!==b.original_inputs_digest||
    b.calculation_key!==combinedKey(o,b.policy,b,b.composition_calculation_revision)||
    b.entries.length!==o.retained_tasks.length||b.composition_entries.length!==inputs.length||
    b.knowledge_cutoff_ms<originalCutoff||b.computed_at_ms<b.knowledge_cutoff_ms||
    b.policy.approved_at_ms>b.knowledge_cutoff_ms||b.policy.valid_until_ms<=b.computed_at_ms||b.computed_at_ms>Date.now())
    fail("MANAGER_RESTATED_DIGEST_MISMATCH");
  validateScoreEntries(b,o);
  const seen=new Set<string>();
  for(const entry of b.composition_entries){
    const key=compositionKey(entry.binding),input=inputs.find(item=>compositionKey(item.binding)===key);
    if(!input||seen.has(key)||entry.allocation_custody_digest!==input.custody_digest)
      fail("MANAGER_RESTATED_COMPOSITION_CENSUS_MISMATCH");seen.add(key);
    entry.historical=decodeRetainedManagerCompositionRestatement(entry.historical,{allocation:input.allocation,
      original_custody_key:o.calculation_key,original_inputs_digest:o.inputs_digest,policy:b.policy,
      knowledge_cutoff_ms:b.knowledge_cutoff_ms,computed_at_ms:b.computed_at_ms,
      calculation_revision:b.composition_calculation_revision,raw_entries:b.entries},c.maximum_bundle_bytes);
  }
  return b;
}

/** Historical bytes only: preserve historical K/compute expiry checks inside
 * parse(). Do not assert today's policy, calculation version or source head. */
export function decodeRetainedManagerScoreRestatement(row:{
  calculation_key:string;payload:unknown;payload_digest:string;
},original:ManagerScoreOriginalCustodySnapshot,maximumBundleBytes:number,
  document?:ManagerModelDocument):ManagerScoreRestatementSnapshot {
  if(!Number.isSafeInteger(maximumBundleBytes)||maximumBundleBytes<1||maximumBundleBytes>8*1024*1024)
    fail("MANAGER_RESTATED_LIMIT_INVALID");
  return structuredClone(parse(row,original,{maximum_bundle_bytes:maximumBundleBytes},document));
}

/** One privately owned IDLE call; never invoked by a GET. Existing source and
 * lease owner must explicitly opt in. Legacy v1 continues unchanged by default. */
export class ManagerScoreRestatement {
  private readonly config:Readonly<ManagerScoreRecalculationConfig>;
  private readonly models:ManagerModelRepository;
  private readonly leases:ManagerProjectionLeases;
  private readonly custody:ManagerScoreOriginalCustody;
  private readonly attached=new WeakMap<ManagerConsumerDelivery,PreparedManagerScoreOriginalCustody>();
  private disposition="NOT_RUN";
  private compositionCustodyOmission:CompositionCustodyOmissionReason|null=null;
  constructor(private readonly options:{pool:Pool;runtime:ManagerScoreRuntime;currentPolicy():ApprovedManagerScorePolicy|null;
    commissioning:PublicationCommissioning;source:ManagerProjectionSource;
    publication(request:ExecutionReadPublicationRequest,signal:AbortSignal):Promise<unknown|null>;
    config:ManagerScoreRecalculationConfig;composition?:ManagerScoreDependentComposition}) {
    const c=options.config;text.parse(c.calculation_revision);text.parse(c.input_method_revision);
    if(options.composition){text.parse(options.composition.calculation_revision);
      if(typeof options.composition.runtime?.calculateHistoricalComposition!=="function")fail("MANAGER_RESTATED_COMPOSITION_RUNTIME_REQUIRED");}
    this.custody=new ManagerScoreOriginalCustody(c); // identical pinned caps for ALL138 modes
    this.config=Object.freeze({...c});this.options=Object.freeze({...options,config:this.config,
      ...(options.composition?{composition:Object.freeze({...options.composition})}:{})});
    this.models=new ManagerModelRepository(options.pool);this.leases=new ManagerProjectionLeases(options.pool);
  }
  status(){return this.disposition==="ORIGINAL_COMPOSITION_CUSTODY_NOT_RETAINED"&&this.compositionCustodyOmission!==null?
    {state:this.disposition,reason_code:this.compositionCustodyOmission}:{state:this.disposition};}
  /** Existing frozen optional bundle cap, not a new source/input budget. */
  originalCustodyByteLimit():number{return this.config.maximum_bundle_bytes;}
  /** Whole optional bundle only. No partial v3, fallback original, source/ACK
   * mutation, grant or current-policy dependency is created by this omission. */
  omitCompositionOriginal(delivery:ManagerConsumerDelivery,reason:CompositionCustodyOmissionReason):void{
    this.attached.delete(delivery);this.compositionCustodyOmission=reason;
    this.disposition="ORIGINAL_COMPOSITION_CUSTODY_NOT_RETAINED";
  }
  /** Read-only archive classification; never requires today's eligibility for
   * the immutable fact to exist, and never asserts current economic data. */
  classifyPolicy(view:ManagerScoreRestatementSnapshot):"CURRENT"|"NOT_CURRENT"|"UNKNOWN" {
    return managerScoreHistoricalPolicyState(this.options.currentPolicy(),{workspace_id:view.source.workspace_id,
      environment:view.source.environment,profile_id:view.source.profile_id,catalogue_digest:view.source.catalogue_digest},
      view.policy.identity_digest,view.policy.valid_until_ms,Date.now());
  }
  /** The caller has ALREADY captured these exact task bytes before its first
   * yield and invoked the original worker from that detached capture. This
   * after-materialization verifier cannot replace that early caller capture. */
  prepareOriginal(document:ManagerModelDocument,tasks:readonly ManagerScoreOriginalInput[],
    compositions?:readonly ManagerCompositionOriginalAllocationCustody[]):PreparedManagerScoreOriginalCustody {
    // Forward identities intact: serializing here would destroy first-write proof.
    return this.custody.prepare(document,tasks,compositions);
  }
  /** Caller-owned SAME source transaction, lease/final source/authority fences,
   * physical COMMIT/release then ACK. Never invoke alongside legacy initial writer. */
  persistOriginal(client:PoolClient,prepared:PreparedManagerScoreOriginalCustody):Promise<"INSERTED"|"DUPLICATE"> {
    return this.custody.persist(client,prepared);
  }
  attach(delivery:ManagerConsumerDelivery,tasks:readonly ManagerScoreOriginalInput[],
    compositions?:readonly ManagerCompositionOriginalAllocationCustody[]):void {
    // Do not inspect new optional records/array getters here. The ORIGINAL
    // codec validates that boundary and all first-write identities synchronously.
    if(tasks.length===0&&compositions===undefined){this.disposition="ORIGINAL_INPUTS_NOT_SUPPLIED";return;}
    try{this.attached.set(delivery,this.prepareOriginal(delivery.document as ManagerModelDocument,tasks,compositions));}
    catch(error){
      if(error instanceof Error&&error.message==="MANAGER_ORIGINAL_INPUT_BOUND"){
        this.attached.delete(delivery);this.disposition="ORIGINAL_INPUT_BOUND_NOT_RETAINED";return;
      }
      if(compositions!==undefined){
        // New optional v3 intake cannot suppress an otherwise valid economic
        // source. Reject the WHOLE custody, never retain a forged/partial subset.
        this.omitCompositionOriginal(delivery,"COMPOSITION_ORIGINAL_CUSTODY_INVALID");return;
      }
      throw error; // Existing v1/v2 semantic/tamper failure behavior is unchanged.
    }
  }
  // Original custody makes no new policy claim and imposes no policy expiry on
  // a financial source. Existing source/lease/publication final fences apply.
  attachedDeadline(_delivery:ManagerConsumerDelivery):number|undefined{return undefined;}
  assertAttached(_delivery:ManagerConsumerDelivery):void{}
  async persistAttached(client:PoolClient,delivery:ManagerConsumerDelivery):Promise<void>{
    const prepared=this.attached.get(delivery);if(!prepared)return;
    await client.query("SAVEPOINT manager_optional_original_custody");
    try{
      await this.persistOriginal(client,prepared);
      await client.query("RELEASE SAVEPOINT manager_optional_original_custody");
      this.disposition="ORIGINAL_INPUTS_STAGED"; // NOT a physical-COMMIT receipt
    }catch(error){
      if(!(error instanceof Error)||error.message!=="MANAGER_DERIVED_RETENTION_CAP_REACHED")throw error;
      await client.query("ROLLBACK TO SAVEPOINT manager_optional_original_custody");
      await client.query("RELEASE SAVEPOINT manager_optional_original_custody");
      this.disposition="ORIGINAL_RETENTION_CAP_NOT_RETAINED";
    }
  }
  /** Re-evaluate exact approved identity at persisted K, never original as-of.
   * Real handle validation remains in runtime; no JSON artifact becomes authority. */
  assertCurrent(view:ManagerScoreRestatementSnapshot):void {
    if(view.calculation_revision!==this.config.calculation_revision||view.input_method_revision!==this.config.input_method_revision)
      fail("MANAGER_RESTATED_IMPLEMENTATION_REVISION_NOT_CURRENT");
    if(view.schema_version==="portal.execution.manager-score-restatement.v2"&&
      (!this.options.composition||view.composition_calculation_revision!==this.options.composition.calculation_revision||
        view.composition_worker_schema_version!==MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION))
      fail("MANAGER_RESTATED_IMPLEMENTATION_REVISION_NOT_CURRENT");
    const p=managerScoreRestatementPolicy(this.options.currentPolicy(),{workspace_id:view.source.workspace_id,
      environment:view.source.environment,profile_id:view.source.profile_id,catalogue_digest:view.source.catalogue_digest},
      view.knowledge_cutoff_ms,Date.now());
    if(!p||accessDigest(p)!==accessDigest(view.policy))fail("MANAGER_RESTATED_POLICY_CHANGED");
  }
  private async original(d:ManagerModelDocument):Promise<Original|null> {
    const client=await this.options.pool.connect();
    try{
      const head=await client.query("SELECT calculation_key FROM execution_manager_score_mode_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='ORIGINAL_INPUTS'",rowParams(d));
      // Optional byte-budget omission is honest absence, not corrupted data.
      // If a pointer DOES exist, preserve the complete strict restore checks.
      if(head.rows.length===0)return null;
      return await this.custody.restore(client,d);
    }finally{client.release();}
  }
  private async head(d:ManagerModelDocument):Promise<string|null>{
    return (await this.options.pool.query<{calculation_key:string}>(selectHead,rowParams(d))).rows[0]?.calculation_key??null;
  }
  /** Exact finite historical lookup, NOT enumeration/permission or currentness.
   * Revalidates actual immutable source/custody plus derived hashes at original
   * computation/K. Caller must perform current named authority/source fences
   * and label superseded/revoked/expired policy; GET never computes or mutates. */
  async restoreRetained(document:ManagerModelDocument,exactKey:string):Promise<ManagerScoreRestatementSnapshot|null>{
    digest.parse(exactKey);
    const d=managerModelDocument.parse(capture(document,8*1024*1024));
    const o=await this.original(d);if(!o)fail("MANAGER_RESTATED_ORIGINAL_MISSING");
    const row=(await this.options.pool.query<StoredRow>(selectRevision,[...rowParams(d),exactKey])).rows[0];
    if(!row)return null;
    return structuredClone(parse(row,o,this.config,d));
  }
  /** Private latest-view selector ONLY; future authorized API must apply all
   * named resource/field/source fences and final synchronous assertCurrent. */
  async snapshot(document:ManagerModelDocument):Promise<ManagerScoreRestatementRead>{
    const d=managerModelDocument.parse(capture(document,8*1024*1024)),head=await this.head(d);
    if(head===null)return {key:null,view:null};
    const view=await this.restoreRetained(d,head);
    if(!view)fail("MANAGER_RESTATED_HEAD_CORRUPT");
    this.assertCurrent(view);return {key:head,view};
  }
  async unchanged(d:ManagerModelDocument,expected:string|null):Promise<boolean>{return await this.head(d)===expected;}
  async idle(input:{lease:ManagerProjectionLease;signal:AbortSignal;deadline_ms:number;transaction_timeout_ms:number;lease_ttl_ms:number}):Promise<void>{
    if(!Number.isFinite(input.deadline_ms)||!Number.isSafeInteger(input.transaction_timeout_ms)||input.transaction_timeout_ms<1||
      input.transaction_timeout_ms>60_000||!Number.isSafeInteger(input.lease_ttl_ms)||input.lease_ttl_ms<1||input.lease_ttl_ms>300_000)
      fail("MANAGER_RESTATED_LIMIT_INVALID");
    const check=()=>{if(input.signal.aborted)throw input.signal.reason??new Error("MANAGER_RESTATED_ABORTED");
      if(performance.now()>=input.deadline_ms)fail("MANAGER_RESTATED_TIME_LIMIT");};
    check();const scope={workspace_id:input.lease.workspace_id,environment:input.lease.environment,profile_id:input.lease.profile_id};
    const head=await this.models.head(scope.workspace_id,scope.environment,scope.profile_id);check();
    if(!head){this.disposition="RESTATED_ORIGINAL_NOT_RETAINED";return;}
    const d=await this.models.document(scope.workspace_id,scope.environment,scope.profile_id,head.revision);check();
    if(!d||d.qualification!=="SOURCE_VERIFIED"){this.disposition="RESTATED_SOURCE_NOT_QUALIFIED";return;}
    const o=await this.original(d);check();if(!o){this.disposition="RESTATED_ORIGINAL_NOT_RETAINED";return;}
    const dependent=o.schema_version==="portal.execution.manager-score-original-inputs.v3"&&
      o.retained_compositions.length>0?this.options.composition:undefined;
    // Legacy default is exact: mixed originals continue RAW-only v1 and a
    // Composition-only original remains typed absent without this opt-in.
    if(o.retained_tasks.length===0&&!dependent){this.disposition="RESTATED_DEPENDENT_WORKER_NOT_INSTALLED";return;}
    // K captured once for a NEW semantic result. An existing row preserves its
    // original K, compute time and result; clock alone never changes work key.
    const candidateK=Date.now(),handle=this.options.currentPolicy(),p=managerScoreRestatementPolicy(handle,{...scope,catalogue_digest:d.catalogue_digest},candidateK,Date.now());
    if(!p){this.disposition="RESTATED_POLICY_NOT_ELIGIBLE";return;}
    if(dependent&&o.schema_version==="portal.execution.manager-score-original-inputs.v3"&&
      candidateK<Math.max(d.observed_at_ms,d.recorded_through_ms,...o.retained_tasks.map(item=>item.task.computed_at_ms),
        ...o.retained_compositions.flatMap(item=>[item.custody.original_computed_at_ms,item.custody.captured_at_ms])))
      fail("MANAGER_RESTATED_ORIGINAL_NOT_AVAILABLE_AS_OF");
    const desired=dependent?combinedKey(o,p,this.config,dependent.calculation_revision):semanticKey(o,p,this.config);
    const previous=await this.head(d);check();
    const existing=(await this.options.pool.query<StoredRow>(selectRevision,[...rowParams(d),desired])).rows[0];check();
    // Accepted BUSINESS read and exact detached publication precede borrowing
    // transaction locks. This is current source acceptance, not a new grant.
    const request:ExecutionReadPublicationRequest={...scope,binding:{dataset_id:d.family_id,source_revision:d.revision,
      projection_generation:d.projection_generation,catalogue_revision:d.catalogue_digest,window:null}};
    const raw=await this.options.publication(request,input.signal);check();
    if(raw===null)fail("MANAGER_RESTATED_PUBLICATION_UNAVAILABLE");
    const publication=datasetPublication.parse(capture(raw,this.config.maximum_bundle_bytes));
    qualifyDatasetPublication(publication,request,{purpose:"BUSINESS",commissioning:this.options.commissioning,nowMs:Date.now()});
    prepareManagerProjection(d,publication,{commissioning:this.options.commissioning,nowMs:Date.now(),lease:input.lease});
    const eligible=managerScoreRestatementPolicy(this.options.currentPolicy(),{...scope,catalogue_digest:d.catalogue_digest},candidateK,Date.now());
    if(!eligible||accessDigest(eligible)!==accessDigest(p))fail("MANAGER_RESTATED_POLICY_CHANGED");
    let bundle:ManagerScoreRestatementSnapshot;
    let dependentSource:Awaited<ReturnType<ManagerProjectionSource["recheck"]>>|undefined;
    if(existing){
      bundle=parse(existing,o,this.config,d);this.assertCurrent(bundle);
      if(previous!==desired)fail("MANAGER_RESTATED_HISTORICAL_NOT_CURRENT");
    }else{
      const computed=Date.now(),entries:Entry[]=[];
      for(const item of o.retained_tasks){
        check();const next=work(item,p,this.config.calculation_revision,computed);
        if("absence"in next){entries.push({slot:item.slot,binding:item.task.binding,original_input_digest:item.input_digest,
          availability:"NOT_PUBLISHED",reason_codes:[next.absence],historical:null});continue;}
        const historical=await this.options.runtime.calculateRestated({task:{...next.task,policy:handle},
          original_input_json:item.input_json,original_input_digest:item.input_digest,knowledge_cutoff_ms:candidateK,
          withheld_metric_reasons:next.withheld});check();
        entries.push({slot:item.slot,binding:item.task.binding,original_input_digest:item.input_digest,
          availability:availability(historical,next.reasons),reason_codes:next.reasons,historical});
      }
      const base={revision_mode:"RESTATED_CURRENT_POLICY" as const,
        purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,source:o.source,original_custody_key:o.calculation_key,
        original_inputs_digest:o.inputs_digest,policy:p,calculation_revision:this.config.calculation_revision,
        input_method_revision:this.config.input_method_revision,knowledge_cutoff_ms:candidateK,computed_at_ms:computed,
        entries,calculation_key:desired,supersedes_calculation_key:previous} as const;
      if(!dependent){
        bundle=capture({schema_version:"portal.execution.manager-score-restatement.v1" as const,...base},this.config.maximum_bundle_bytes);
      }else{
        const inputs=originalCompositionInputs(o,d,this.config.maximum_bundle_bytes);
        dependentSource=await this.options.source.recheck({scope,document:structuredClone(d),publication:structuredClone(publication),signal:input.signal});check();
        if(typeof dependentSource.assertCurrent!=="function")fail("MANAGER_RESTATED_SOURCE_FENCE_REQUIRED");
        const rawCurrent=()=>{
          check();const currentPolicy=managerScoreRestatementPolicy(this.options.currentPolicy(),{...scope,catalogue_digest:d.catalogue_digest},candidateK,Date.now());
          if(!currentPolicy||accessDigest(currentPolicy)!==accessDigest(p))fail("MANAGER_RESTATED_POLICY_CHANGED");
          if(!publicationCommissioningCurrent(this.options.commissioning,scope,Date.now())||Date.now()>=publication.expires_at_ms)
            fail("MANAGER_RESTATED_PUBLICATION_EXPIRED");
          const value:unknown=dependentSource!.assertCurrent!();
          if(value!==undefined){if(value instanceof Promise)void value.catch(()=>undefined);fail("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS");}
        };
        // Only identities validated against actual original/method custody,
        // same source/policy/K/C enter the callback. No JSON authority flag.
        validateScoreEntries({...base,schema_version:"portal.execution.manager-score-restatement.v1"},o);
        const accepted=new Set(entries),rawFence={accepts:(entry:Entry)=>{rawCurrent();return accepted.has(entry);}};
        const composition_entries:ManagerScoreRestatementV2Snapshot["composition_entries"]=[];
        for(const original of inputs){
          rawCurrent();const historical=await dependent.runtime.calculateHistoricalComposition({allocation:original.allocation,
            original_custody_key:o.calculation_key,original_inputs_digest:o.inputs_digest,policy:handle,
            knowledge_cutoff_ms:candidateK,computed_at_ms:computed,calculation_revision:dependent.calculation_revision,
            raw_entries:entries},rawFence,input.signal);rawCurrent();
          composition_entries.push({binding:original.binding,allocation_custody_digest:original.custody_digest,historical});
        }
        bundle=capture({schema_version:"portal.execution.manager-score-restatement.v2" as const,...base,
          composition_worker_schema_version:MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION,
          composition_calculation_revision:dependent.calculation_revision,composition_entries},this.config.maximum_bundle_bytes,true);
      }
      bundle=parse({calculation_key:desired,payload:bundle,payload_digest:accessDigest(bundle)},o,this.config,d);
      this.assertCurrent(bundle);
    }
    const current=dependentSource??await this.options.source.recheck({scope,document:structuredClone(d),publication:structuredClone(publication),signal:input.signal});check();
    if(typeof current.assertCurrent!=="function")fail("MANAGER_RESTATED_SOURCE_FENCE_REQUIRED");
    const assertCurrent=()=>{
      check();if(!publicationCommissioningCurrent(this.options.commissioning,scope,Date.now()))fail("MANAGER_COMMISSIONING_EXPIRED");
      if(Date.now()>=publication.expires_at_ms)fail("MANAGER_RESTATED_PUBLICATION_EXPIRED");
      this.assertCurrent(bundle);
      const r:unknown=current.assertCurrent!();
      if(r!==undefined){if(r instanceof Promise)void r.catch(()=>undefined);fail("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS");}
    };
    assertCurrent();
    const notAfter=Math.min(publication.expires_at_ms,publicationCommissioningDeadline(this.options.commissioning),bundle.policy.valid_until_ms);
    if(!await this.leases.renew(input.lease,input.lease_ttl_ms,notAfter))fail("MANAGER_LEASE_LOST");check();
    const client=await this.options.pool.connect();let committed=false,usedExisting=false;
    try{
      const timeout=Math.max(1,Math.min(input.transaction_timeout_ms,Math.floor(input.deadline_ms-performance.now())));
      const transactionDeadline=performance.now()+timeout;
      assertCurrent();await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[String(timeout)+"ms"]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["manager-model",...keys(d)])]);
      await fenceManagerProjection(client,input.lease,scope);
      const source=(await client.query<{revision:string;payload_digest:string}>("SELECT revision,payload_digest FROM execution_manager_model_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE",keys(d))).rows[0];
      if(source?.revision!==head.revision||source.payload_digest!==head.payload_digest)fail("MANAGER_RESTATED_SOURCE_CHANGED");
      const restored=await this.custody.restore(client,d);
      if(!restored||accessDigest(restored)!==accessDigest(o))fail("MANAGER_RESTATED_ORIGINAL_CHANGED");
      const actual=(await client.query<{calculation_key:string}>(selectHead+" FOR UPDATE",rowParams(d))).rows[0]?.calculation_key??null;
      if(actual!==previous)fail("MANAGER_RESTATED_HEAD_CHANGED");
      const duplicate=(await client.query<StoredRow>(selectRevision,[...rowParams(d),desired])).rows[0];
      if(duplicate){
        const prior=parse(duplicate,restored,this.config,d);
        if(actual!==desired||duplicate.payload_digest!==accessDigest(bundle)||accessDigest(prior)!==accessDigest(bundle))
          fail("MANAGER_RESTATED_REVISION_CONFLICT");
        usedExisting=true;
      }else{
        const params=rowParams(d),payload=JSON.stringify(bundle);
        const usage=(await client.query<{count:string;bytes:string}>("SELECT count(*)::text AS count,COALESCE(sum(octet_length(payload::text)),0)::text AS bytes FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4",params)).rows[0];
        const storage=(await client.query<{bytes:string}>("SELECT octet_length($1::jsonb::text)::text AS bytes",[payload])).rows[0];
        if(BigInt(usage.count)>=BigInt(this.config.maximum_revisions_per_source)||
          BigInt(usage.bytes)+BigInt(storage.bytes)>BigInt(this.config.maximum_retained_bytes_per_source))fail("MANAGER_DERIVED_RETENTION_CAP_REACHED");
        await client.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [...params,desired,accessDigest(bundle),payload]);
        if(actual===null)await client.query("INSERT INTO execution_manager_score_mode_heads (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key) VALUES($1,$2,$3,$4,'RESTATED_CURRENT_POLICY',$5)",[...params,desired]);
        else if((await client.query("UPDATE execution_manager_score_mode_heads SET calculation_key=$5 WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='RESTATED_CURRENT_POLICY' AND calculation_key=$6",
          [...params,desired,previous])).rowCount!==1)fail("MANAGER_RESTATED_HEAD_CHANGED");
      }
      assertCurrent();if(performance.now()>=transactionDeadline)fail("MANAGER_TRANSACTION_TIMEOUT");
      await client.query("COMMIT");committed=true;
      this.disposition=usedExisting?"CURRENT_RESTATED_REUSED":"RESTATED_COMMITTED";
    }catch(error){if(!committed)await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
  }
}
