/** Private policy-independent ORIGINAL input custody. No source/policy authority,
 * worker scheduling, current-score publication, connection ownership or ACK. */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import { accessDigest } from "./access-policy";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { managerScorePublication, type ManagerScorePublication } from "./manager-score-publication.contract";
import { managerScoreMethodDescriptor,managerScoreMethodDigest,type ManagerScoreRuntimeTask } from "./manager-score-runtime";
import type { ManagerScoreMetricsDependency, ManagerScorePathDependency,ManagerScoreRecalculationConfig, ManagerScoreRecalculationTask } from "./manager-score-recalculation";

type OriginalTask = Omit<ManagerScoreRuntimeTask, "policy">;
export interface ManagerScoreOriginalInput {
  slot: "RAW" | "DIRECT_NAV";
  /** Exact JSON emitted by the original worker's payload capture, before any
   * policy handle. Do not serialize a Zod/JSONB-reordered task as these bytes. */
  input_json: string;
  task: OriginalTask;
  metrics_dependency?: ManagerScoreMetricsDependency;
  path_dependency?: ManagerScorePathDependency;
}
type Limits = Pick<ManagerScoreRecalculationConfig, "maximum_bundle_bytes" |
  "maximum_revisions_per_source" | "maximum_retained_bytes_per_source">;
// Match the actual original worker's accepted byte grammar. These are retained
// original inputs, not a newly designed public identifier contract: do not trim
// or normalize a genuine original's input hash.
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
// Newly introduced dependency metadata has no legacy worker-byte grammar.
// Retain its deliberately stricter intake separately from original tasks.
const dependencyText = z.string().min(1).max(256)
  .regex(/^[^\u0000-\u001f\u007f\u0085\u2028\u2029]+$(?![\s\S])/).refine(s => s.trim().length > 0);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().nonnegative().safe();
const decimal = z.string().max(512).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const scopeSchema = z.object({ workspace_id:text, environment:z.enum(["paper","sandbox","live"]),
  profile_id:text, catalogue_digest:digest }).strict();
const bindingSchema = z.object({
  subject_type:z.enum(["alpha","deployment","account","portfolio","manager_book"]), subject_id:text,
  tuple_population_digest:digest, partition_digest:digest,
  stage_filter:z.array(z.enum(["PAPER","SANDBOX","CANARY","LIVE"])).min(1).max(4),
  window_start_ms:ms, window_end_ms:ms, comparable_basis_id:text, individual_evidence_binding_id:text,
}).strict().refine(b => b.window_start_ms < b.window_end_ms && new Set(b.stage_filter).size === b.stage_filter.length);
const metricSchema = z.object({ net_excess_twr:decimal.nullable(), sharpe_period:decimal.nullable(),
  mdd:decimal.nullable(), add:decimal.nullable(), positive_block_ratio:decimal.nullable(), stress_excess_twr:decimal.nullable() }).strict();
const quality = { comparable_basis_id:text, individual_evidence_binding_id:text.nullable(),
  window_start_ms:ms, window_end_ms:ms, as_of_ms:ms, observed_duration_ms:ms, currency:text,
  required_costs_complete:z.boolean(), stale:z.boolean(), data_valid:z.boolean(), reason_codes:z.array(text).max(32).optional() };
const stress = z.object({ net_return:decimal, opening_capital:decimal,
  gross_executed_notional:decimal.nullable(), turnover_verified:z.boolean() }).strict();
const path = z.object({
  observations:z.array(z.object({ from_ms:ms,to_ms:ms,net_return:decimal,cash_return:decimal,
    stress_subperiods:z.array(stress).max(100_000).nullable() }).strict()).max(50_000),
  window_start_ms:ms,window_end_ms:ms,expected_observations:ms,grid_verified:z.boolean(),
  required_costs_complete:z.boolean(),currency:text,cash_currency:text,
  blocks:z.array(z.object({from_ms:ms,to_ms:ms,complete:z.boolean(),expected_observations:ms}).strict()).max(10_000),
  block_manifest_registered_at_ms:ms,stress_delta_bps:decimal,
}).strict();
const taskSchema = z.object({
  scope:scopeSchema,binding:bindingSchema,source_revision:text,source_set_digest:digest,
  source_qualification:z.enum(["SOURCE_VERIFIED","TEST_ONLY"]),calculation_revision:text,computed_at_ms:ms,
  expected_policy_revision:text.nullable(),metrics_dependency_digest:digest.optional(),
  input:z.discriminatedUnion("kind",[
    // The original worker hashes but ignores extra root/input own-data keys.
    // Preserve those bounded opaque bytes; never interpret them as authority,
    // method proof, policy or numeric semantics. Inner known DTOs stay strict.
    z.object({kind:z.literal("METRICS"),quality:z.object({...quality,metrics:metricSchema,sample_count:ms,complete_block_count:ms}).strict()}).passthrough(),
    z.object({kind:z.literal("PATH"),quality:z.object(quality).strict(),path}).passthrough(),
  ]),
}).passthrough();
const dependencySchema = z.object({
  source_revision:dependencyText,source_set_digest:digest,source_as_of_ms:ms,metrics_input_digest:digest,method_digest:digest,
  stress_delta_bps:z.string().max(512).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/),source_locator:dependencyText,
}).strict();
const pathDependencySchema=z.object({manifest_json:z.string().min(1).max(65_536),manifest_sha256:digest}).strict();
/** PROPOSED source manifest, not a jointly accepted wire or a JSON authority
 * flag. Scope/binding identifiers preserve the original worker byte grammar;
 * newly introduced manifest refs/locators use strict dependency text. */
const pathMethodManifestSchema=z.object({
  schema_version:z.literal("portal.execution.manager-score-path-method.v1"),
  scope_digest:digest,binding_digest:digest,source_revision:text,source_set_digest:digest,
  source_as_of_ms:ms,path_input_digest:digest,method:managerScoreMethodDescriptor,method_digest:digest,
  method_manifest_ref:dependencyText,available_at_ms:ms,source_locator:dependencyText,
  original_stress_delta_bps:z.string().max(512).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/)
    .refine(v=>Number.isFinite(Number(v))&&Number(v)>0),
}).strict();
export type ManagerScorePathMethodManifest=z.infer<typeof pathMethodManifestSchema>;
const hash = (s:string) => "sha256:" + createHash("sha256").update(s).digest("hex");
function fail(s:string):never { throw new Error(s); }
const scopeKeys = (d:Pick<ManagerModelDocument,"workspace_id"|"environment"|"profile_id">) =>
  [d.workspace_id,d.environment,d.profile_id];
const sourcePin = (d:ManagerModelDocument) => ({
  workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,revision:d.revision,
  payload_digest:accessDigest(d),qualification:d.qualification,source_epoch:d.source_epoch,source_sequence:d.source_sequence,
  projection_generation:d.projection_generation,catalogue_digest:d.catalogue_digest,source_set_digest:d.source_set_digest,as_of_ms:d.as_of_ms,
});
const slotKey = (slot:ManagerScoreOriginalInput["slot"],binding:OriginalTask["binding"]) =>
  accessDigest({slot,binding:{...binding,stage_filter:[...binding.stage_filter].sort()}});
interface RetainedInput extends ManagerScoreOriginalInput {
  input_digest:string;
  original_publication_digest:string;
  method_custody:{
    state:"BOUND_METRICS_DEPENDENCY"|"NOT_RETAINED";
    reason:"PATH_METHOD_PROOF_NOT_RETAINED"|"METRIC_DEPENDENCIES_NOT_RETAINED"|null;
  }|{state:"BOUND_PATH_DEPENDENCY";reason:null;method_digest:string};
}
export interface ManagerScoreOriginalCustodySnapshot {
  schema_version:"portal.execution.manager-score-original-inputs.v1"|"portal.execution.manager-score-original-inputs.v2";
  source:ReturnType<typeof sourcePin>;
  retained_tasks:RetainedInput[];
  inputs_digest:string;
  calculation_key:string;
}
export interface PreparedManagerScoreOriginalCustody {
  readonly calculation_key:string;
  readonly payload_digest:string;
}
const prepared = new WeakMap<PreparedManagerScoreOriginalCustody,{bundle:ManagerScoreOriginalCustodySnapshot;json:string}>();
const keyOf = (b:Pick<ManagerScoreOriginalCustodySnapshot,"source"|"inputs_digest">) =>
  accessDigest({mode:"ORIGINAL_INPUTS",source:b.source,inputs_digest:b.inputs_digest});

/** The source runtime must call synchronously after its provider returns and
 * BEFORE yielding/calculating. Use the source's existing input bound, not the
 * optional custody quota: declining custody must not change worker inputs. */
export function captureManagerScoreOriginalInputs(items:readonly ManagerScoreRecalculationTask[],maximumBytes:number):ManagerScoreOriginalInput[] {
  if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>8*1024*1024)
    fail("MANAGER_ORIGINAL_LIMIT_INVALID");
  const detached=capture(items,maximumBytes,true,true);
  return detached.map(item=>{
    // Synchronous, detached intake BEFORE the caller's first yield/worker.
    // A same-named opaque ROOT/INPUT key does not opt in to the new protocol.
    if(item.path_dependency!==undefined){
      taskSchema.parse(item.task);
      if(item.metrics_dependency!==undefined)fail("MANAGER_ORIGINAL_DEPENDENCY_MISMATCH");
      pathMethod(item.task,item.path_dependency);
    }
    return {...item,input_json:JSON.stringify(item.task)};
  });
}

/** Closed JSON, before stringify; only a caller's original task may omit its
 * undefined object properties, exactly like the existing worker capture. */
function capture<T>(value:T,limit:number,task=false,exactJsonBound=false):T {
  let bytes=0,nodes=0;const ancestors=new Set<object>();
  const visit=(v:unknown,depth=0):void=>{
    if(++nodes>1_000_000||depth>64)fail("MANAGER_ORIGINAL_INPUT_BOUND");
    if(typeof v==="string")bytes+=Buffer.byteLength(v)+2;
    else if(v===null||typeof v==="boolean"||typeof v==="number"&&Number.isFinite(v))bytes+=24;
    else if(v&&typeof v==="object"){
      if(ancestors.has(v)||!Array.isArray(v)&&![Object.prototype,null].includes(Object.getPrototypeOf(v))||
        Object.getOwnPropertySymbols(v).length)fail("MANAGER_ORIGINAL_INPUT_INVALID");
      ancestors.add(v);const fields=Object.entries(Object.getOwnPropertyDescriptors(v));
      if(Array.isArray(v)&&fields.length!==v.length+1)fail("MANAGER_ORIGINAL_INPUT_INVALID");
      for(const [k,d] of fields){
        if(Array.isArray(v)&&k==="length")continue;
        if(!d.enumerable||!("value"in d)||Array.isArray(v)&&(!/^(?:0|[1-9]\d*)$(?![\s\S])/.test(k)||Number(k)>=v.length))
          fail("MANAGER_ORIGINAL_INPUT_INVALID");
        if(task&&!Array.isArray(v)&&d.value===undefined)continue;
        bytes+=Buffer.byteLength(k)+4;visit(d.value,depth+1);
      }
      ancestors.delete(v);
    }else fail("MANAGER_ORIGINAL_INPUT_INVALID");
    // Early worker capture keeps the existing actual-JSON byte admission
    // domain. Optional stored envelopes retain their conservative defense.
    if(bytes>limit&&!exactJsonBound)fail("MANAGER_ORIGINAL_INPUT_BOUND");
  };
  visit(value);const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>limit)fail("MANAGER_ORIGINAL_INPUT_BOUND");
  return JSON.parse(json) as T;
}
function originalDocument(raw:unknown,limit:number):ManagerModelDocument {
  const d=managerModelDocument.parse(capture(raw,limit));
  // This verifies a claimed value only; caller still supplies real qualified
  // intake + lease/source fences. Never upgrade TEST_ONLY into SOURCE_VERIFIED.
  if(d.qualification!=="SOURCE_VERIFIED")fail("MANAGER_ORIGINAL_SOURCE_NOT_QUALIFIED");
  return d;
}
function sourceScores(d:ManagerModelDocument):Map<string,ManagerScorePublication> {
  const result=new Map<string,ManagerScorePublication>();
  for(const value of d.precomputed_scores??[]){
    const s=managerScorePublication.parse(value),key=slotKey(s.slot,s.provenance.binding);
    if(result.has(key))fail("MANAGER_ORIGINAL_DUPLICATE_SLOT");
    result.set(key,s);
  }
  return result;
}
/** Caller supplies bounded own-data capture, never a live source object. No
 * current-policy handle is consulted; this cannot manufacture past knowledge. */
function pathMethod(task:OriginalTask,raw:ManagerScorePathDependency):ManagerScorePathMethodManifest {
  const dep=pathDependencySchema.parse(raw),bytes=Buffer.from(dep.manifest_json,"utf8");
  if(bytes.length>65_536||hash(dep.manifest_json)!==dep.manifest_sha256||
    new TextDecoder("utf-8",{fatal:true}).decode(bytes)!==dep.manifest_json)
    fail("MANAGER_ORIGINAL_PATH_MANIFEST_MISMATCH");
  const m=pathMethodManifestSchema.parse(JSON.parse(dep.manifest_json));
  // Inspect the marker only under the explicit OUTER v2 intake. Do not reserve
  // or retype this key in the historical worker's accepted opaque envelope.
  const marker=Object.getOwnPropertyDescriptor(task,"path_dependency_digest");
  if(task.input.kind!=="PATH"||!marker||!("value"in marker)||marker.value!==accessDigest(dep)||
    m.scope_digest!==accessDigest(task.scope)||m.binding_digest!==accessDigest(task.binding)||
    m.source_revision!==task.source_revision||m.source_set_digest!==task.source_set_digest||
    m.source_as_of_ms!==task.input.quality.as_of_ms||m.path_input_digest!==accessDigest(task.input)||
    m.method_digest!==managerScoreMethodDigest(m.method)||m.method.comparable_basis_id!==task.binding.comparable_basis_id||
    m.method.currency!==task.input.path.currency||m.method.currency!==task.input.quality.currency||
    m.original_stress_delta_bps!==task.input.path.stress_delta_bps||
    m.available_at_ms>m.source_as_of_ms||m.available_at_ms>task.computed_at_ms||
    task.input.path.block_manifest_registered_at_ms>m.available_at_ms)
    fail("MANAGER_ORIGINAL_PATH_DEPENDENCY_MISMATCH");
  return m;
}
function bindInput(raw:ManagerScoreOriginalInput,d:ManagerModelDocument,scores:Map<string,ManagerScorePublication>,limit:number):RetainedInput {
  const allowed=new Set(["slot","input_json","task","metrics_dependency","path_dependency"]);
  // Stored RetainedInput adds derived fields; those are checked by the final
  // rebuilt-envelope digest below, not trusted as producer method evidence.
  const retainedOnly=new Set(["input_digest","original_publication_digest","method_custody"]);
  if(!raw||Object.keys(raw).some(k=>!allowed.has(k)&&!retainedOnly.has(k)))fail("MANAGER_ORIGINAL_INPUT_INVALID");
  // Normalize undefined only in the original task, never source publication or
  // stored envelope; restore original order from exact input_json after JSONB.
  const item={...capture({slot:raw.slot,input_json:raw.input_json,
    ...(raw.metrics_dependency===undefined?{}:{metrics_dependency:raw.metrics_dependency}),
    ...(raw.path_dependency===undefined?{}:{path_dependency:raw.path_dependency})},limit),
    task:capture(raw.task,limit,true)};
  const closed=z.object({slot:z.enum(["RAW","DIRECT_NAV"]),input_json:z.string().min(1),
    task:z.unknown(),metrics_dependency:dependencySchema.optional(),path_dependency:pathDependencySchema.optional()}).strict().parse(item);
  const ordered=capture(JSON.parse(closed.input_json),limit) as OriginalTask;
  taskSchema.parse(ordered);
  if(JSON.stringify(ordered)!==closed.input_json||accessDigest(ordered)!==accessDigest(closed.task))
    fail("MANAGER_ORIGINAL_INPUT_MISMATCH");
  const t=ordered,q=t.input.quality,b=t.binding,p=scores.get(slotKey(closed.slot,b))?.provenance;
  const score=scores.get(slotKey(closed.slot,b)),inputDigest=hash(closed.input_json);
  const domain=d.environment==="paper"?["PAPER"]:d.environment==="sandbox"?["SANDBOX"]:["CANARY","LIVE"];
  if(!p||!score||accessDigest(t.scope)!==accessDigest({workspace_id:d.workspace_id,environment:d.environment,
    profile_id:d.profile_id,catalogue_digest:d.catalogue_digest})||t.source_revision!==d.revision||
    t.source_set_digest!==d.source_set_digest||t.source_qualification!==d.qualification||q.as_of_ms!==d.as_of_ms||
    b.stage_filter.some(s=>!domain.includes(s))||b.window_start_ms!==q.window_start_ms||b.window_end_ms!==q.window_end_ms||
    b.comparable_basis_id!==q.comparable_basis_id||b.individual_evidence_binding_id!==q.individual_evidence_binding_id||
    q.as_of_ms>t.computed_at_ms||p.input_digest!==inputDigest||p.computed_at_ms!==t.computed_at_ms||
    p.calculation_revision!==t.calculation_revision||p.source_revision!==d.revision||p.source_set_digest!==d.source_set_digest||
    p.source_as_of_ms!==d.as_of_ms||p.source_qualification!==d.qualification||
    accessDigest(p.scope)!==accessDigest(t.scope)||accessDigest({...p.binding,stage_filter:[...p.binding.stage_filter].sort()})!==
      accessDigest({...t.binding,stage_filter:[...t.binding.stage_filter].sort()}))
    fail("MANAGER_ORIGINAL_SOURCE_MISMATCH");
  let method:RetainedInput["method_custody"];
  const dep=closed.metrics_dependency;
  const pathDep=closed.path_dependency;
  if(pathDep!==undefined){
    if(dep!==undefined)fail("MANAGER_ORIGINAL_DEPENDENCY_MISMATCH");
    const manifest=pathMethod(t,pathDep);
    method={state:"BOUND_PATH_DEPENDENCY",reason:null,method_digest:manifest.method_digest};
  }else if(dep===undefined){
    if(t.metrics_dependency_digest!==undefined)fail("MANAGER_ORIGINAL_DEPENDENCY_MISMATCH");
    method={state:"NOT_RETAINED",reason:t.input.kind==="PATH"?"PATH_METHOD_PROOF_NOT_RETAINED":"METRIC_DEPENDENCIES_NOT_RETAINED"};
  }else{
    if(t.input.kind!=="METRICS"||t.metrics_dependency_digest!==accessDigest(dep)||dep.source_revision!==d.revision||
      dep.source_set_digest!==d.source_set_digest||dep.source_as_of_ms!==d.as_of_ms||dep.metrics_input_digest!==accessDigest(t.input))
      fail("MANAGER_ORIGINAL_DEPENDENCY_MISMATCH");
    method={state:"BOUND_METRICS_DEPENDENCY",reason:null};
  }
  return {slot:closed.slot,input_json:closed.input_json,task:ordered,input_digest:inputDigest,
    original_publication_digest:accessDigest(score),method_custody:method,
    ...(dep===undefined?{}:{metrics_dependency:dep}),...(pathDep===undefined?{}:{path_dependency:pathDep})};
}
function bundleFrom(d:ManagerModelDocument,tasks:readonly ManagerScoreOriginalInput[],limit:number):ManagerScoreOriginalCustodySnapshot {
  if(!Array.isArray(tasks)||tasks.length<1||tasks.length>128)fail("MANAGER_ORIGINAL_INPUT_BOUND");
  const scores=sourceScores(d),seen=new Set<string>();
  const retained=tasks.map(raw=>{
    const item=bindInput(raw,d,scores,limit),k=slotKey(item.slot,item.task.binding);
    if(seen.has(k))fail("MANAGER_ORIGINAL_DUPLICATE_SLOT");seen.add(k);return item;
  }).sort((a,b)=>{const x=slotKey(a.slot,a.task.binding),y=slotKey(b.slot,b.task.binding);return x<y?-1:x>y?1:0;});
  if(scores.size!==seen.size)fail("MANAGER_ORIGINAL_INCOMPLETE_INPUT_SET");
  // Only an explicit new outer proof chooses v2. Historical opaque root/input
  // keys, even with the same names, remain byte-exact v1 NOT_RETAINED inputs.
  const version:ManagerScoreOriginalCustodySnapshot["schema_version"]=retained.some(t=>t.path_dependency!==undefined)?
    "portal.execution.manager-score-original-inputs.v2":"portal.execution.manager-score-original-inputs.v1";
  const base={schema_version:version,
    source:sourcePin(d),retained_tasks:retained,inputs_digest:accessDigest(retained)};
  return capture({...base,calculation_key:keyOf(base)},limit);
}
function parseBundle(raw:unknown,payloadDigest:string,d:ManagerModelDocument,limit:number):ManagerScoreOriginalCustodySnapshot {
  const b=capture(raw,limit) as ManagerScoreOriginalCustodySnapshot;
  if(!b||!["portal.execution.manager-score-original-inputs.v1","portal.execution.manager-score-original-inputs.v2"].includes(b.schema_version)||
    Object.keys(b).sort().join(",")!=="calculation_key,inputs_digest,retained_tasks,schema_version,source"||
    accessDigest(b)!==payloadDigest||accessDigest(b.source)!==accessDigest(sourcePin(d)))
    fail("MANAGER_ORIGINAL_DIGEST_MISMATCH");
  const rebuilt=bundleFrom(d,b.retained_tasks,limit);
  // Rebuild derives method/slot/publication facts from the actual immutable
  // source score every time. Rehashing sidecar+head cannot substitute new input.
  if(accessDigest(rebuilt)!==payloadDigest||b.calculation_key!==rebuilt.calculation_key)
    fail("MANAGER_ORIGINAL_INPUT_MISMATCH");
  return rebuilt;
}

/** Private retained-read codec. Caller supplies the ACTUAL135 source row after
 * exact DB digest verification and current scoped authorization. No locks,
 * source/policy installation, current-head assertion or grant are added here. */
export function decodeRetainedManagerScoreOriginal(document:ManagerModelDocument,row:{
  calculation_key:string;payload:unknown;payload_digest:string;
},maximumBundleBytes:number):ManagerScoreOriginalCustodySnapshot {
  if(!Number.isSafeInteger(maximumBundleBytes)||maximumBundleBytes<1||maximumBundleBytes>8*1024*1024)
    fail("MANAGER_ORIGINAL_LIMIT_INVALID");
  const d=originalDocument(document,maximumBundleBytes);
  const b=parseBundle(row.payload,row.payload_digest,d,maximumBundleBytes);
  if(row.calculation_key!==b.calculation_key)fail("MANAGER_ORIGINAL_DIGEST_MISMATCH");
  return structuredClone(b);
}

/** Opt-in helper, NOT installed into the legacy v1 initial writer. The future
 * coordinator must select exactly one initial custody writer per delivery. */
export class ManagerScoreOriginalCustody {
  private readonly limits:Readonly<Limits>;
  constructor(limits:Limits){
    if(!Number.isSafeInteger(limits.maximum_bundle_bytes)||limits.maximum_bundle_bytes<1||limits.maximum_bundle_bytes>8*1024*1024||
      !Number.isSafeInteger(limits.maximum_revisions_per_source)||limits.maximum_revisions_per_source<1||limits.maximum_revisions_per_source>32||
      !Number.isSafeInteger(limits.maximum_retained_bytes_per_source)||limits.maximum_retained_bytes_per_source<limits.maximum_bundle_bytes||
      limits.maximum_retained_bytes_per_source>64*1024*1024)fail("MANAGER_ORIGINAL_LIMIT_INVALID");
    this.limits=Object.freeze({...limits});
  }
  prepare(document:ManagerModelDocument,tasks:readonly ManagerScoreOriginalInput[]):PreparedManagerScoreOriginalCustody {
    const d=originalDocument(document,this.limits.maximum_bundle_bytes);
    const detached=capture(tasks,this.limits.maximum_bundle_bytes,true);
    const bundle=bundleFrom(d,detached,this.limits.maximum_bundle_bytes);
    const payload_digest=accessDigest(bundle),value=Object.freeze({calculation_key:bundle.calculation_key,payload_digest});
    prepared.set(value,{bundle,json:JSON.stringify(bundle)});return value;
  }
  private async source(client:PoolClient,expected:ManagerScoreOriginalCustodySnapshot["source"]):Promise<ManagerModelDocument>{
    const row=(await client.query<{payload:unknown;payload_digest:string}>(`SELECT payload,payload_digest FROM execution_manager_model_revisions
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4 FOR SHARE`,
    [...scopeKeys(expected),expected.revision])).rows[0];
    if(!row)fail("MANAGER_ORIGINAL_SOURCE_MISSING");
    const d=originalDocument(row.payload,this.limits.maximum_bundle_bytes);
    if(row.payload_digest!==accessDigest(d)||accessDigest(sourcePin(d))!==accessDigest(expected))
      fail("MANAGER_ORIGINAL_SOURCE_MISMATCH");
    return d;
  }
  /** Caller owns BEGIN/source persist/lease+final authority fences/COMMIT and ACK.
   * No source I/O or new connection is permitted in this helper. */
  async persist(client:PoolClient,input:PreparedManagerScoreOriginalCustody):Promise<"INSERTED"|"DUPLICATE">{
    const p=prepared.get(input);if(!p)fail("MANAGER_ORIGINAL_PREPARED_REQUIRED");
    const b=p.bundle,params=[...scopeKeys(b.source),b.source.revision];
    // Same serialization key as all legacy138 source and derived writers.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["manager-model",...scopeKeys(b.source)])]);
    const d=await this.source(client,b.source);
    parseBundle(b,input.payload_digest,d,this.limits.maximum_bundle_bytes);
    const current=(await client.query<{revision:string;payload_digest:string}>(`SELECT revision,payload_digest FROM execution_manager_model_heads
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE`,scopeKeys(b.source))).rows[0];
    if(current?.revision!==d.revision||current.payload_digest!==b.source.payload_digest)fail("MANAGER_ORIGINAL_SOURCE_NOT_CURRENT");
    const head=(await client.query<{calculation_key:string}>(`SELECT calculation_key FROM execution_manager_score_mode_heads
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='ORIGINAL_INPUTS' FOR UPDATE`,params)).rows[0];
    if(head&&head.calculation_key!==b.calculation_key)fail("MANAGER_ORIGINAL_HEAD_CONFLICT");
    const existing=(await client.query<{payload:unknown;payload_digest:string}>(`SELECT payload,payload_digest FROM execution_manager_calculation_revisions
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND calculation_key=$5`,[...params,b.calculation_key])).rows[0];
    if(existing){
      parseBundle(existing.payload,existing.payload_digest,d,this.limits.maximum_bundle_bytes);
      if(existing.payload_digest!==input.payload_digest)fail("MANAGER_ORIGINAL_REVISION_CONFLICT");
    }else{
      if(head)fail("MANAGER_ORIGINAL_HEAD_CORRUPT");
      // ALL138 rows share the original cap; no separate quota for this mode.
      const usage=(await client.query<{count:string;bytes:string}>(`SELECT count(*)::text AS count,COALESCE(sum(octet_length(payload::text)),0)::text AS bytes
        FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4`,params)).rows[0];
      const storage=(await client.query<{bytes:string}>("SELECT octet_length($1::jsonb::text)::text AS bytes",[p.json])).rows[0];
      if(BigInt(usage.count)>=BigInt(this.limits.maximum_revisions_per_source)||
        BigInt(usage.bytes)+BigInt(storage.bytes)>BigInt(this.limits.maximum_retained_bytes_per_source))
        fail("MANAGER_DERIVED_RETENTION_CAP_REACHED");
      await client.query(`INSERT INTO execution_manager_calculation_revisions
        (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,[...params,b.calculation_key,input.payload_digest,p.json]);
    }
    if(!head)await client.query(`INSERT INTO execution_manager_score_mode_heads
      (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key)
      VALUES($1,$2,$3,$4,'ORIGINAL_INPUTS',$5)`,[...params,b.calculation_key]);
    return existing?"DUPLICATE":"INSERTED";
  }
  /** Private restart restore, not an authorized public/history API. Caller must
   * supply exact retained source and apply all current source/identity fences. */
  async restore(client:PoolClient,document:ManagerModelDocument):Promise<ManagerScoreOriginalCustodySnapshot|null>{
    const expected=originalDocument(document,this.limits.maximum_bundle_bytes),d=await this.source(client,sourcePin(expected));
    const row=(await client.query<{calculation_key:string;payload:unknown;payload_digest:string}>(`SELECT h.calculation_key,r.payload,r.payload_digest
      FROM execution_manager_score_mode_heads h JOIN execution_manager_calculation_revisions r
      USING(workspace_id,environment,profile_id,source_revision,calculation_key)
      WHERE h.workspace_id=$1 AND h.environment=$2 AND h.profile_id=$3 AND h.source_revision=$4 AND h.head_kind='ORIGINAL_INPUTS'`,
    [...scopeKeys(d),d.revision])).rows[0];
    if(!row)return null;
    const b=parseBundle(row.payload,row.payload_digest,d,this.limits.maximum_bundle_bytes);
    if(row.calculation_key!==b.calculation_key)fail("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    return structuredClone(b);
  }
}
