/** Private optional original-input custody; not an installed source or calibration authority. */
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { accessDigest } from "./access-policy";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { ManagerModelRepository, prepareManagerProjection, type ManagerModelHead } from "./manager-model.store";
import { fenceManagerProjection, ManagerProjectionLeases, type ManagerProjectionLease } from "./manager-lease";
import { qualifyDatasetPublication, publicationCommissioningCurrent, publicationCommissioningDeadline,
  type PublicationCommissioning } from "./publication-adapter";
import { datasetPublication } from "./publication.contract";
import { managerScorePublication, type ManagerScorePublication } from "./manager-score-publication.contract";
import { managerScoreRecalculationPolicy, managerScorePublicationPolicyCurrent,
  type ManagerScoreRuntime, type ManagerScoreRuntimeTask, type ApprovedManagerScorePolicy } from "./manager-score-runtime";
import type { ManagerConsumerDelivery, ManagerProjectionSource } from "./manager-consumer";
import type { ExecutionReadPublicationRequest } from "./read-publication";

/** Supplied by the qualified private metrics adapter from its retained source
 * artifact. Current normalization policy alone is NOT evidence of these pins. */
export interface ManagerScoreMetricsDependency {
  source_revision:string; source_set_digest:string; source_as_of_ms:number;
  metrics_input_digest:string; method_digest:string; stress_delta_bps:string;
  source_locator:string;
}
export interface ManagerScoreRecalculationTask {
  slot:"RAW"|"DIRECT_NAV"; task:Omit<ManagerScoreRuntimeTask,"policy">;
  metrics_dependency?:ManagerScoreMetricsDependency;
}
type Task=ManagerScoreRecalculationTask;
type RetainedTask=Task&{input_json:string};
type Policy = NonNullable<ReturnType<typeof managerScoreRecalculationPolicy>>;
export interface ManagerScoreRecalculationConfig {
  calculation_revision:string; input_method_revision:string;
  maximum_bundle_bytes:number; maximum_revisions_per_source:number; maximum_retained_bytes_per_source:number;
}
interface Bundle {
  schema_version:"portal.execution.manager-score-recalculation.v1";
  source:ReturnType<typeof sourcePin>; policy:Policy; input_method_digest:string; input_digest:string;
  retained_tasks:RetainedTask[]; scores:ManagerScorePublication[]; calculation_key:string; computed_at_ms:number;
  calculation_revision:string; input_method_revision:string;
}
export interface ManagerScoreRecalculationRead { key:string|null; document:ManagerModelDocument }
const attached=new WeakMap<object,{bundle:Bundle;current:()=>void}>();
const hash=(s:string)=>`sha256:${createHash("sha256").update(s).digest("hex")}`;
const keys=(d:Pick<ManagerModelDocument,"workspace_id"|"environment"|"profile_id">)=>[d.workspace_id,d.environment,d.profile_id];
const fail=(s:string):never=>{throw new Error(s);};
const slotKey=(s:Task["slot"],b:ManagerScoreRuntimeTask["binding"])=>accessDigest({slot:s,binding:{...b,stage_filter:[...b.stage_filter].sort()}});
const sourcePin=(d:ManagerModelDocument)=>({workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,
  revision:d.revision,payload_digest:accessDigest(d),source_epoch:d.source_epoch,source_sequence:d.source_sequence,
  projection_generation:d.projection_generation,catalogue_digest:d.catalogue_digest,source_set_digest:d.source_set_digest,as_of_ms:d.as_of_ms});
const workKey=(b:Pick<Bundle,"source"|"input_digest"|"policy"|"calculation_revision"|"input_method_revision">)=>
  accessDigest({source:b.source,input_digest:b.input_digest,policy:b.policy.identity_digest,
    calculation_revision:b.calculation_revision,input_method_revision:b.input_method_revision});
function capture<T>(value:T,limit:number,omitUndefinedObjectProperties=false):T {
  let nodes=0;const ancestors=new WeakSet<object>();
  const inspect=(v:unknown,depth=0):void=>{
    if(++nodes>1_000_000||depth>64)fail("MANAGER_DERIVED_INPUT_BOUND");
    if(v===null||["boolean","number","string"].includes(typeof v)){
      if(typeof v==="number"&&!Number.isFinite(v))fail("MANAGER_DERIVED_INPUT_INVALID");return;
    }
    if(typeof v!=="object"||(!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v)))||
      Object.getOwnPropertySymbols(v).length)fail("MANAGER_DERIVED_INPUT_INVALID");
    if(ancestors.has(v as object))fail("MANAGER_DERIVED_INPUT_INVALID");
    ancestors.add(v as object);
    const entries=Object.entries(Object.getOwnPropertyDescriptors(v));
    if(Array.isArray(v)&&entries.length!==v.length+1)fail("MANAGER_DERIVED_INPUT_INVALID");
    for(const [k,d] of entries){
      if(Array.isArray(v)&&k==="length")continue;
      if(Array.isArray(v)&&(!/^(?:0|[1-9]\d*)$/.test(k)||Number(k)>=v.length))fail("MANAGER_DERIVED_INPUT_INVALID");
      if(!d.enumerable||!("value"in d))fail("MANAGER_DERIVED_INPUT_INVALID");
      // Only original tasks use the existing worker's JSON object semantics.
      // Publication/stored-bundle validation remains strict by default.
      if(omitUndefinedObjectProperties&&!Array.isArray(v)&&d.value===undefined)continue;
      inspect(d.value,depth+1);
    }
    ancestors.delete(v as object);
  };
  inspect(value);const s=JSON.stringify(value);
  if(Buffer.byteLength(s)>limit)fail("MANAGER_DERIVED_INPUT_BOUND");return JSON.parse(s) as T;
}
function taskSource(t:Task["task"],d:ManagerModelDocument) {
  if(accessDigest(t.scope)!==accessDigest({workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,catalogue_digest:d.catalogue_digest})||
    t.source_revision!==d.revision||t.source_set_digest!==d.source_set_digest||t.source_qualification!=="SOURCE_VERIFIED"||
    t.input.quality.as_of_ms!==d.as_of_ms)fail("MANAGER_DERIVED_SOURCE_MISMATCH");
}
const text=z.string().min(1).max(256),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/),ms=z.number().int().nonnegative().safe();
// Private source identifiers/locators must not accept log/header controls or
// JavaScript `$`'s special pre-final-newline match. Preserve bytes; never trim
// or normalize a value before binding its producer digest.
const dependencyText=z.string().min(1).max(256)
  .regex(/^[^\u0000-\u001f\u007f\u0085\u2028\u2029]+$(?![\s\S])/).refine(s=>s.trim().length>0);
const dependencyDigest=z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const metricsDependencySchema=z.object({source_revision:dependencyText,source_set_digest:dependencyDigest,source_as_of_ms:ms,
  metrics_input_digest:dependencyDigest,method_digest:dependencyDigest,
  stress_delta_bps:z.string().max(512).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/),source_locator:dependencyText}).strict();
const sameDelta=(a:string,b:string)=>{
  const normal=(s:string)=>{const [whole,fraction=""]=s.split(".");return `${whole}.${fraction.replace(/0+$/,"")}`;};
  return normal(a)===normal(b);
};
function validateDependency(item:Task,d:ManagerModelDocument,initialPolicy?:Policy):void {
  if(item.metrics_dependency===undefined){
    // A declared binding cannot be silently stripped into legacy absence.
    if(item.task.metrics_dependency_digest!==undefined)fail("MANAGER_DERIVED_METRIC_DEPENDENCY_INVALID");
    return;
  }
  if(item.task.input.kind!=="METRICS")fail("MANAGER_DERIVED_METRIC_DEPENDENCY_INVALID");
  const dep=metricsDependencySchema.parse(item.metrics_dependency);
  if(item.task.metrics_dependency_digest!==accessDigest(dep)||
    dep.source_revision!==d.revision||dep.source_set_digest!==d.source_set_digest||dep.source_as_of_ms!==d.as_of_ms||
    dep.metrics_input_digest!==accessDigest(item.task.input)||initialPolicy&&
    (dep.method_digest!==initialPolicy.method_digest||!sameDelta(dep.stress_delta_bps,initialPolicy.stress_delta_bps)))
    fail("MANAGER_DERIVED_METRIC_DEPENDENCY_INVALID");
}
const bundleSchema=z.object({schema_version:z.literal("portal.execution.manager-score-recalculation.v1"),
  source:z.object({workspace_id:text,environment:z.enum(["paper","sandbox","live"]),profile_id:text,revision:text,
    payload_digest:digest,source_epoch:text,source_sequence:z.string().regex(/^(?:0|[1-9]\d*)$/),projection_generation:text,
    catalogue_digest:digest,source_set_digest:digest,as_of_ms:ms}).strict(),
  policy:z.object({identity_digest:digest,method_digest:digest,policy_revision:text,stress_delta_bps:z.string().min(1).max(512),
    approved_at_ms:ms,valid_until_ms:ms}).strict(),input_method_digest:digest,input_digest:digest,
  retained_tasks:z.array(z.object({slot:z.enum(["RAW","DIRECT_NAV"]),task:z.unknown(),input_json:z.string().min(1).max(8*1024*1024),
    metrics_dependency:metricsDependencySchema.optional()}).strict()).min(1).max(128),
  scores:z.array(managerScorePublication).min(1).max(128),calculation_key:digest,computed_at_ms:ms,
  calculation_revision:text,input_method_revision:text}).strict();
function recomputeTask(item:Task,p:Policy,revision:string,computed:number):{task:Task["task"];reasons:string[]} {
  const t=item.task,common={...t,expected_policy_revision:p.policy_revision,calculation_revision:revision,computed_at_ms:computed};
  if(t.input.kind==="PATH")return {task:{...common,input:{...t.input,path:{...t.input.path,stress_delta_bps:p.stress_delta_bps}}},reasons:[]};
  if(t.input.kind!=="METRICS")return fail("MANAGER_DERIVED_INPUTS_NOT_RETAINED");
  const dep=item.metrics_dependency,metrics={...t.input.quality.metrics},reasons:string[]=[];
  if(!dep||dep.method_digest!==p.method_digest){
    for(const key of Object.keys(metrics) as Array<keyof typeof metrics>)metrics[key]=null;
    reasons.push("METRIC_DEPENDENCIES_NOT_RETAINED");
  }else if(!sameDelta(dep.stress_delta_bps,p.stress_delta_bps)){
    // A scalar stress result cannot reconstruct a different fixed-path delta.
    // The other five metrics keep their original source strings and methods.
    metrics.stress_excess_twr=null;reasons.push("STRESS_INPUTS_NOT_RETAINED_FOR_POLICY");
  }
  return {task:{...common,input:{kind:"METRICS",quality:{...t.input.quality,metrics}}},reasons};
}
function parseBundle(raw:unknown,digest:string,d:ManagerModelDocument,limit:number):Bundle {
  const b=bundleSchema.parse(capture(raw,limit)) as Bundle;
  if(accessDigest(b)!==digest||
    accessDigest(b.source)!==accessDigest(sourcePin(d))||!Array.isArray(b.retained_tasks)||b.retained_tasks.length<1||
    b.retained_tasks.length>128||!Array.isArray(b.scores)||b.scores.length>128||
    b.policy.approved_at_ms>d.as_of_ms||b.policy.valid_until_ms<=b.computed_at_ms||b.computed_at_ms<d.as_of_ms||
    b.input_method_digest!==accessDigest({policy:b.policy.method_digest,revision:b.input_method_revision})||
    b.calculation_key!==workKey(b)||b.input_digest!==accessDigest({method:b.input_method_digest,tasks:b.retained_tasks}))
    fail("MANAGER_DERIVED_DIGEST_MISMATCH");
  const seen=new Set<string>(),scoreKeys=new Set<string>();
  for(const s of b.scores){const k=slotKey(s.slot,s.provenance.binding);
    if(scoreKeys.has(k))fail("MANAGER_DERIVED_INPUT_INVALID");scoreKeys.add(k);}
  for(const t of b.retained_tasks){
    // JSONB changes object-key order. Preserve and validate the actual worker
    // input bytes instead of hashing a later JSONB serialization as if original.
    const task=capture(JSON.parse(t.input_json),limit) as Task["task"];
    if(JSON.stringify(task)!==t.input_json||accessDigest(task)!==accessDigest(t.task))fail("MANAGER_DERIVED_ORIGINAL_INPUT_MISMATCH");
    t.task=task;
    if(!t||!["RAW","DIRECT_NAV"].includes(t.slot)||!["PATH","METRICS"].includes(t.task?.input?.kind))fail("MANAGER_DERIVED_INPUT_INVALID");
    taskSource(t.task,d);validateDependency(t,d);
    const k=slotKey(t.slot,t.task.binding);if(seen.has(k))fail("MANAGER_DERIVED_INPUT_INVALID");seen.add(k);
    const score=b.scores.find(s=>slotKey(s.slot,s.provenance.binding)===k),p=score?.provenance;
    const sourceScore=(d.precomputed_scores??[]).find(s=>slotKey(s.slot,s.provenance.binding)===k);
    // This check is unconditional, including the derived-result path below.
    // Rehashing mutable sidecar metadata/keys cannot rewrite original custody
    // relative to the immutable financial source's worker input digest.
    if(!sourceScore||sourceScore.provenance.input_digest!==hash(t.input_json))
      fail("MANAGER_DERIVED_ORIGINAL_INPUT_MISMATCH");
    const original=score!==undefined&&sourceScore!==undefined&&accessDigest(score)===accessDigest(sourceScore);
    const work=recomputeTask(t,b.policy,b.calculation_revision,b.computed_at_ms);
    const matchesOriginal=original&&p?.input_digest===hash(t.input_json);
    const matchesDerived=p?.input_digest===hash(JSON.stringify(work.task));
    if(!p||p.source_revision!==d.revision||p.source_set_digest!==d.source_set_digest||p.source_as_of_ms!==d.as_of_ms||
      p.source_qualification!=="SOURCE_VERIFIED"||accessDigest(p.scope)!==accessDigest(t.task.scope)||
      p.policy_revision!==b.policy.policy_revision||p.approved_at_ms!==b.policy.approved_at_ms||p.policy_valid_until_ms!==b.policy.valid_until_ms||
      p.calculation_revision!==b.calculation_revision||
      (!matchesOriginal&&!matchesDerived)||!matchesOriginal&&work.reasons.some(reason=>!score!.quality.reason_codes.includes(reason)))
      fail("MANAGER_DERIVED_ORIGINAL_INPUT_MISMATCH");
  }
  b.scores=b.scores.map(s=>managerScorePublication.parse(s));
  return b;
}

/** Server-private opt-in. No public input, formula, timer or source authority. */
export class ManagerScoreRecalculation {
  private readonly models:ManagerModelRepository;
  private readonly leases:ManagerProjectionLeases;
  private readonly config:Readonly<ManagerScoreRecalculationConfig>;
  private disposition="NOT_RUN";
  constructor(private readonly options:{pool:Pool;runtime:ManagerScoreRuntime;currentPolicy():ApprovedManagerScorePolicy|null;
    commissioning:PublicationCommissioning;source:ManagerProjectionSource;
    publication(request:ExecutionReadPublicationRequest,signal:AbortSignal):Promise<unknown|null>;
    config:ManagerScoreRecalculationConfig}) {
    const c=options.config;
    if(!c.calculation_revision||c.calculation_revision.length>256||!c.input_method_revision||c.input_method_revision.length>256||
      !Number.isSafeInteger(c.maximum_bundle_bytes)||c.maximum_bundle_bytes<1||c.maximum_bundle_bytes>8*1024*1024||
      !Number.isSafeInteger(c.maximum_revisions_per_source)||c.maximum_revisions_per_source<1||c.maximum_revisions_per_source>32||
      !Number.isSafeInteger(c.maximum_retained_bytes_per_source)||c.maximum_retained_bytes_per_source<c.maximum_bundle_bytes||
      c.maximum_retained_bytes_per_source>64*1024*1024)fail("MANAGER_DERIVED_LIMIT_INVALID");
    this.config=Object.freeze({...c});this.models=new ManagerModelRepository(options.pool);this.leases=new ManagerProjectionLeases(options.pool);
  }
  status(){return {state:this.disposition};}
  /** Called only after the existing worker calculated genuine original tasks. */
  attach(delivery:ManagerConsumerDelivery,tasks:readonly Task[]):void {
    try {this.attachBounded(delivery,tasks);}
    catch(error){
      // Optional original-input custody capacity cannot suppress independently valid
      // financial projections. Malformed/ambiguous bindings still reject the
      // complete transaction; they must not poison future stored readers.
      if(error instanceof Error&&error.message==="MANAGER_DERIVED_INPUT_BOUND"){
        attached.delete(delivery);this.disposition="DERIVED_INPUT_BOUND_NOT_RETAINED";return;
      }
      throw error;
    }
  }
  private attachBounded(delivery:ManagerConsumerDelivery,tasks:readonly Task[]):void {
    const d=managerModelDocument.parse(delivery.document),now=Date.now(),handle=this.options.currentPolicy();
    const p=managerScoreRecalculationPolicy(handle,d.as_of_ms,now);
    if(!p){this.disposition="DERIVED_POLICY_NOT_ELIGIBLE";return;}
    const detached=capture(tasks,this.config.maximum_bundle_bytes,true);
    const retained=detached.map(item=>({...item,input_json:JSON.stringify(item.task)}));
    if(!retained.length){this.disposition="DERIVED_INPUTS_NOT_RETAINED";return;}
    const scores=(d.precomputed_scores??[]).map(s=>managerScorePublication.parse(s));
    for(const item of retained){
      taskSource(item.task,d);
      validateDependency(item,d,p);
      if(!["PATH","METRICS"].includes(item.task.input.kind))fail("MANAGER_DERIVED_INPUT_INVALID");
      if(item.task.calculation_revision!==this.config.calculation_revision)fail("MANAGER_DERIVED_IMPLEMENTATION_MISMATCH");
      const score=scores.find(s=>slotKey(s.slot,s.provenance.binding)===slotKey(item.slot,item.task.binding));
      if(!score||score.provenance.input_digest!==hash(JSON.stringify(item.task))||
        !managerScorePublicationPolicyCurrent(handle,{quality:{...score.quality,preview:null},provenance:score.provenance},now))
        fail("MANAGER_DERIVED_ORIGINAL_INPUT_MISMATCH");
    }
    const method=accessDigest({policy:p.method_digest,revision:this.config.input_method_revision});
    const base={schema_version:"portal.execution.manager-score-recalculation.v1" as const,source:sourcePin(d),policy:p,
      input_method_digest:method,input_digest:accessDigest({method,tasks:retained}),retained_tasks:retained,scores,
      computed_at_ms:Math.max(...retained.map(t=>t.task.computed_at_ms)),calculation_revision:this.config.calculation_revision,
      input_method_revision:this.config.input_method_revision};
    const captured=capture({...base,calculation_key:workKey(base)},this.config.maximum_bundle_bytes);
    // The initial writer and every restart/reader use the identical validator.
    // Invalid optional custody must never commit an unreadable source/sidecar.
    const bundle=parseBundle(captured,accessDigest(captured),d,this.config.maximum_bundle_bytes);
    const current=()=>this.assertPolicy(bundle);
    current();attached.set(delivery,{bundle,current});this.disposition="INPUTS_CAPTURED_NOT_COMMITTED";
  }
  attachedDeadline(delivery:ManagerConsumerDelivery):number|undefined{return attached.get(delivery)?.bundle.policy.valid_until_ms;}
  assertAttached(delivery:ManagerConsumerDelivery):void{attached.get(delivery)?.current();}
  /** Caller has already persisted the source in this SAME lease-fenced transaction. */
  async persistAttached(client:PoolClient,delivery:ManagerConsumerDelivery):Promise<void>{
    const a=attached.get(delivery);if(!a)return;
    a.current();await this.persist(client,a.bundle,null);a.current();
  }
  private assertPolicy(b:Bundle):void {
    const h=this.options.currentPolicy(),p=managerScoreRecalculationPolicy(h,b.source.as_of_ms,Date.now());
    if(!p||p.identity_digest!==b.policy.identity_digest)fail("MANAGER_DERIVED_POLICY_CHANGED");
    for(const score of b.scores.filter(s=>b.retained_tasks.some(t=>slotKey(t.slot,t.task.binding)===slotKey(s.slot,s.provenance.binding))))
      if(!managerScorePublicationPolicyCurrent(h,{quality:{...score.quality,preview:null},provenance:score.provenance},Date.now()))
        fail("MANAGER_DERIVED_POLICY_CHANGED");
  }
  async snapshot(d:ManagerModelDocument):Promise<ManagerScoreRecalculationRead>{
    const row=(await this.options.pool.query<{calculation_key:string;payload:unknown;payload_digest:string}>(`SELECT h.calculation_key,r.payload,r.payload_digest
      FROM execution_manager_calculation_heads h JOIN execution_manager_calculation_revisions r
      USING(workspace_id,environment,profile_id,source_revision,calculation_key)
      WHERE h.workspace_id=$1 AND h.environment=$2 AND h.profile_id=$3 AND h.source_revision=$4`,[...keys(d),d.revision])).rows[0];
    if(!row)return {key:null,document:structuredClone(d)};
    const b=parseBundle(row.payload,row.payload_digest,d,this.config.maximum_bundle_bytes);
    if(row.calculation_key!==b.calculation_key)fail("MANAGER_DERIVED_DIGEST_MISMATCH");
    // Existing current-policy selectors withhold stale/obsolete slots. Never mutate source bytes.
    return {key:b.calculation_key,document:{...structuredClone(d),precomputed_scores:structuredClone(b.scores)}};
  }
  async unchanged(d:ManagerModelDocument,expected:string|null):Promise<boolean>{
    const row=(await this.options.pool.query<{calculation_key:string}>(`SELECT calculation_key FROM execution_manager_calculation_heads
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4`,[...keys(d),d.revision])).rows[0];
    return (row?.calculation_key??null)===expected;
  }
  /** Reuses physical consumer ownership; no source sequence/ACK is created. */
  async idle(input:{lease:ManagerProjectionLease;signal:AbortSignal;deadline_ms:number;transaction_timeout_ms:number;
    lease_ttl_ms:number}):Promise<void>{
    const check=()=>{if(input.signal.aborted)throw input.signal.reason;if(performance.now()>=input.deadline_ms)fail("MANAGER_DERIVED_TIME_LIMIT");};
    check();const scope={workspace_id:input.lease.workspace_id,environment:input.lease.environment,profile_id:input.lease.profile_id};
    const head=await this.models.head(scope.workspace_id,scope.environment,scope.profile_id);
    if(!head){this.disposition="DERIVED_INPUTS_NOT_RETAINED";return;}
    const d=await this.models.document(scope.workspace_id,scope.environment,scope.profile_id,head.revision);check();
    if(!d||d.qualification!=="SOURCE_VERIFIED"){this.disposition="DERIVED_SOURCE_NOT_QUALIFIED";return;}
    const old=(await this.options.pool.query<{payload:unknown;payload_digest:string;calculation_key:string}>(`SELECT r.payload,r.payload_digest,h.calculation_key
      FROM execution_manager_calculation_heads h JOIN execution_manager_calculation_revisions r
      USING(workspace_id,environment,profile_id,source_revision,calculation_key)
      WHERE h.workspace_id=$1 AND h.environment=$2 AND h.profile_id=$3 AND h.source_revision=$4`,[...keys(d),d.revision])).rows[0];check();
    if(!old){this.disposition="DERIVED_INPUTS_NOT_RETAINED";return;}
    const original=parseBundle(old.payload,old.payload_digest,d,this.config.maximum_bundle_bytes);
    const handle=this.options.currentPolicy(),p=managerScoreRecalculationPolicy(handle,d.as_of_ms,Date.now());
    if(!p){this.disposition="DERIVED_POLICY_NOT_ELIGIBLE";return;}
    if(original.input_method_digest!==accessDigest({policy:p.method_digest,revision:this.config.input_method_revision})){
      this.disposition="DERIVED_INPUT_METHOD_NOT_RETAINED";return;
    }
    const base={...original,policy:p,calculation_revision:this.config.calculation_revision,input_method_revision:this.config.input_method_revision};
    const desiredKey=workKey(base);
    if(desiredKey===old.calculation_key){this.assertPolicy(original);this.disposition="CURRENT_DERIVED_REUSED";return;}
    // Separate accepted BUSINESS read, unchanged source cutoff. No restamped source knowledge.
    const request:ExecutionReadPublicationRequest={workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,
      binding:{dataset_id:d.family_id,source_revision:d.revision,projection_generation:d.projection_generation,
        catalogue_revision:d.catalogue_digest,window:null}};
    const raw=await this.options.publication(request,input.signal);check();
    if(raw===null)fail("MANAGER_DERIVED_PUBLICATION_UNAVAILABLE");
    // Capture before yielding: never retain the provider's mutable object.
    const publication=datasetPublication.parse(capture(raw,this.config.maximum_bundle_bytes));
    const qualified=qualifyDatasetPublication(publication,request,{purpose:"BUSINESS",commissioning:this.options.commissioning,nowMs:Date.now()});
    // Adapter normally returns a DatasetPublication, never only its authority.
    if(!publication.authority||qualified.authority.binding.source_revision!==d.revision)fail("MANAGER_DERIVED_PUBLICATION_INVALID");
    prepareManagerProjection(d,publication,{commissioning:this.options.commissioning,nowMs:Date.now(),lease:input.lease});
    const computed=Date.now(),replacement=new Map<string,ManagerScorePublication>();
    for(const item of original.retained_tasks){
      check();const task=capture(item.task,this.config.maximum_bundle_bytes);
      const work=recomputeTask({...item,task},p,this.config.calculation_revision,computed);
      const result=await this.options.runtime.calculate({...work.task,policy:handle});check();
      const {preview:_private,...quality}=result.quality;
      // Custody reasons are separate from worker input; never truncate original
      // faults to squeeze an extra reason into the worker's 32-reason input cap.
      replacement.set(slotKey(item.slot,task.binding),managerScorePublication.parse({slot:item.slot,
        quality:{...quality,reason_codes:[...new Set([...quality.reason_codes,...work.reasons])]},
        raw_metrics:result.raw_metrics,provenance:result.provenance}));
    }
    const captured=capture({...base,calculation_key:desiredKey,computed_at_ms:computed,
      scores:original.scores.map(s=>replacement.get(slotKey(s.slot,s.provenance.binding))??s)},this.config.maximum_bundle_bytes);
    const bundle=parseBundle(captured,accessDigest(captured),d,this.config.maximum_bundle_bytes);
    this.assertPolicy(bundle);
    const current=await this.options.source.recheck({scope:{workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id},
      document:structuredClone(d),publication:structuredClone(publication),signal:input.signal});check();
    const assertCurrent=()=>{
      check();if(!publicationCommissioningCurrent(this.options.commissioning,scope,Date.now()))fail("MANAGER_COMMISSIONING_EXPIRED");
      if(Date.now()>=publication.expires_at_ms)fail("MANAGER_DERIVED_PUBLICATION_EXPIRED");
      this.assertPolicy(bundle);const r:unknown=current.assertCurrent?.();
      if(r!==undefined){if(r instanceof Promise)void r.catch(()=>undefined);fail("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS");}
    };
    const notAfter=Math.min(publication.expires_at_ms,publicationCommissioningDeadline(this.options.commissioning),p.valid_until_ms);
    if(!await this.leases.renew(input.lease,input.lease_ttl_ms,notAfter))fail("MANAGER_LEASE_LOST");check();
    const client=await this.options.pool.connect();let committed=false;
    try{
      const timeout=Math.max(1,Math.min(input.transaction_timeout_ms,Math.floor(input.deadline_ms-performance.now())));
      const transactionDeadline=performance.now()+timeout;
      check();await client.query("BEGIN");await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[`${timeout}ms`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["manager-model",...keys(d)])]);
      await fenceManagerProjection(client,input.lease,scope);
      const row=(await client.query<ManagerModelHead>(`SELECT revision,payload_digest FROM execution_manager_model_heads
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE`,keys(d))).rows[0];
      if(row?.revision!==head.revision||row.payload_digest!==head.payload_digest)fail("MANAGER_DERIVED_SOURCE_CHANGED");
      await this.persist(client,bundle,old.calculation_key);assertCurrent();
      if(performance.now()>=transactionDeadline)fail("MANAGER_TRANSACTION_TIMEOUT");
      await client.query("COMMIT");committed=true;
      this.disposition="DERIVED_COMMITTED";
    }catch(e){if(!committed)await client.query("ROLLBACK").catch(()=>undefined);throw e;}
    finally{client.release();}
  }
  private async persist(client:PoolClient,b:Bundle,expected:string|null):Promise<void>{
    const params=[...keys(b.source),b.source.revision],payload=JSON.stringify(b),digest=accessDigest(b);
    const head=(await client.query<{calculation_key:string}>(`SELECT calculation_key FROM execution_manager_calculation_heads
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 FOR UPDATE`,params)).rows[0]?.calculation_key??null;
    const existing=(await client.query<{payload_digest:string}>(`SELECT payload_digest FROM execution_manager_calculation_revisions
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND calculation_key=$5`,[...params,b.calculation_key])).rows[0];
    if(existing){
      if(existing.payload_digest!==digest)fail("MANAGER_DERIVED_REVISION_CONFLICT");
      if(head!==b.calculation_key)fail("MANAGER_DERIVED_HISTORICAL_NOT_CURRENT");return;
    }
    if(head!==expected)fail("MANAGER_DERIVED_HEAD_CHANGED");
    const usage=(await client.query<{count:string;bytes:string}>(`SELECT count(*)::text AS count,COALESCE(sum(octet_length(payload::text)),0)::text AS bytes
      FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4`,params)).rows[0];
    // Measure the actual jsonb textual bytes, not only compact JSON bytes.
    const storage=(await client.query<{bytes:string}>("SELECT octet_length($1::jsonb::text)::text AS bytes",[payload])).rows[0];
    if(Number(usage.count)>=this.config.maximum_revisions_per_source||Number(usage.bytes)+Number(storage.bytes)>this.config.maximum_retained_bytes_per_source)
      fail("MANAGER_DERIVED_RETENTION_CAP_REACHED");
    await client.query(`INSERT INTO execution_manager_calculation_revisions
      (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[...params,b.calculation_key,digest,payload]);
    await client.query(`INSERT INTO execution_manager_calculation_heads
      (workspace_id,environment,profile_id,source_revision,calculation_key) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(workspace_id,environment,profile_id,source_revision) DO UPDATE SET calculation_key=EXCLUDED.calculation_key`,[...params,b.calculation_key]);
  }
}
