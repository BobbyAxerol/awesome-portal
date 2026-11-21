/** PRIVATE opt-in shared ORIGINAL writer. No pool/timer/source/ACK ownership.
 * Historical delegates use only the consumer's existing serial IDLE lease. */
import { isProxy } from "node:util/types";
import { performance } from "node:perf_hooks";
import type { PoolClient } from "pg";
import type { ManagerConsumerDelivery } from "./manager-consumer";
import type { ManagerProjectionLease } from "./manager-lease";
import type { ManagerModelDocument } from "./manager-model.contract";
import { ManagerScoreOriginalCustody,captureManagerScoreOriginalInputs,
  type ManagerScoreOriginalInput,type PreparedManagerScoreOriginalCustody } from "./manager-score-original-custody";
import type { ManagerScoreRecalculationTask } from "./manager-score-recalculation";
import type { ManagerCompositionOriginalAllocationCustody } from "./manager-composition-runtime";
import type { ManagerRegimeOriginalCustody } from "./manager-regime-runtime";

export interface ManagerOriginalCustodyCaps {
  maximum_bundle_bytes:number;
  maximum_revisions_per_source:number;
  maximum_retained_bytes_per_source:number;
}
export interface ManagerOriginalIdleInput {
  lease:ManagerProjectionLease;signal:AbortSignal;deadline_ms:number;
  transaction_timeout_ms:number;lease_ttl_ms:number;
}
export interface ManagerOriginalIdleDelegate {
  caps:ManagerOriginalCustodyCaps;
  idle(input:ManagerOriginalIdleInput):Promise<void>;
}
export type ManagerOriginalCustodyOmission =
  "ORIGINAL_INPUT_BOUND_NOT_RETAINED"|"ORIGINAL_INPUT_INVALID_NOT_RETAINED"|
  "ORIGINAL_SCORE_PROOF_NOT_RETAINED"|"ORIGINAL_COMPOSITION_CAPTURE_NOT_RETAINED"|
  "ORIGINAL_REGIME_CAPTURE_NOT_RETAINED"|"ORIGINAL_INPUTS_NOT_SUPPLIED"|
  "ORIGINAL_RETENTION_CAP_NOT_RETAINED";
export interface ManagerOriginalScoreCapture {
  tasks:ManagerScoreRecalculationTask[];
  originals:ManagerScoreOriginalInput[]|null;
  omission:"ORIGINAL_SCORE_PROOF_NOT_RETAINED"|null;
}
function fail(code:string):never{throw new Error(code);}
function fields(value:unknown,names:readonly string[]):Record<string,PropertyDescriptor>{
  if(!value||typeof value!=="object"||isProxy(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)
    fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
  const result=Object.getOwnPropertyDescriptors(value);
  if(Object.keys(result).length!==names.length||names.some(name=>!Object.hasOwn(result,name))||
    Object.values(result).some(field=>!field.enumerable||!("value"in field)))
    fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
  return result;
}
function caps(value:ManagerOriginalCustodyCaps):Readonly<ManagerOriginalCustodyCaps>{
  const d=fields(value,["maximum_bundle_bytes","maximum_revisions_per_source","maximum_retained_bytes_per_source"]);
  const result={maximum_bundle_bytes:d.maximum_bundle_bytes.value as number,
    maximum_revisions_per_source:d.maximum_revisions_per_source.value as number,
    maximum_retained_bytes_per_source:d.maximum_retained_bytes_per_source.value as number};
  // Reuse the SAME existing three cap validator, not new defaults/ceilings.
  new ManagerScoreOriginalCustody(result);return Object.freeze(result);
}
function errorCode(error:unknown):string|null{
  if(!error||typeof error!=="object"||isProxy(error))return null;
  const field=Object.getOwnPropertyDescriptor(error,"message");
  return field&&"value"in field&&typeof field.value==="string"?field.value:null;
}
/** New opt-in own-data JSON boundary; optional proof callers MUST catch their
 * own failure. No Proxy/getter reaches reflection/stringify. Undefined own
 * OBJECT properties omit exactly as existing worker/early-capture JSON. */
function detachJson<T>(value:T,maximumBytes:number):T{
  if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>8*1024*1024)
    fail("MANAGER_SCORE_TASK_BOUND");
  let nodes=0,textBytes=0;const active=new Set<object>();
  const visit=(item:unknown,depth:number):void=>{
    if(++nodes>1_000_000||depth>64)fail("MANAGER_SCORE_TASK_BOUND");
    if(typeof item==="string"){textBytes+=Buffer.byteLength(item);if(textBytes>maximumBytes)fail("MANAGER_SCORE_TASK_BOUND");return;}
    if(item===null||typeof item==="boolean"||typeof item==="number"&&Number.isFinite(item))return;
    if(!item||typeof item!=="object"||isProxy(item))fail("MANAGER_SCORE_TASK_INVALID");
    const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
    if(active.has(item)||(array?prototype!==Array.prototype:![Object.prototype,null].includes(prototype))||
      Object.getOwnPropertySymbols(item).length)fail("MANAGER_SCORE_TASK_INVALID");
    const d=Object.getOwnPropertyDescriptors(item),length:unknown=array?d.length?.value:undefined;
    if(array&&(!Number.isSafeInteger(length)||(length as number)<0||(length as number)>1_000_000||
      Object.keys(d).length!==(length as number)+1))fail("MANAGER_SCORE_TASK_BOUND");
    active.add(item);
    for(const [name,field]of Object.entries(d)){
      if(array&&name==="length")continue;
      if(!field.enumerable||!("value"in field)||array&&(!/^(?:0|[1-9]\d*)$(?![\s\S])/.test(name)||Number(name)>=(length as number)))
        fail("MANAGER_SCORE_TASK_INVALID");
      if(!array&&field.value===undefined)continue;
      textBytes+=Buffer.byteLength(name);if(textBytes>maximumBytes)fail("MANAGER_SCORE_TASK_BOUND");
      visit(field.value,depth+1);
    }
    active.delete(item);
  };
  visit(value,0);
  const json=JSON.stringify(value);
  if(Buffer.byteLength(json)>maximumBytes)fail("MANAGER_SCORE_TASK_BOUND");
  return JSON.parse(json) as T;
}
interface WorkerIntake {
  tasks:ManagerScoreRecalculationTask[];
  optional:Record<string,PropertyDescriptor>[];
  proof_eligible:boolean;
}
/** Only slot + task belong to economic worker input. Sidecars and unknown
 * OUTER keys are custody-only: do not read getters/traverse their values here.
 * Preserve every opaque own-data ROOT/INPUT key INSIDE the actual task. */
function detachWorkerTasks(value:readonly ManagerScoreRecalculationTask[],maximumBytes:number):WorkerIntake{
  if(!value||typeof value!=="object"||isProxy(value)||!Array.isArray(value)||
    Object.getPrototypeOf(value)!==Array.prototype||Object.getOwnPropertySymbols(value).length)
    fail("MANAGER_SCORE_TASK_INVALID");
  const array=Object.getOwnPropertyDescriptors(value as object),length:unknown=array.length?.value;
  if(!Number.isSafeInteger(length)||(length as number)<0||(length as number)>128||
    Object.keys(array).length!==(length as number)+1)fail("MANAGER_SCORE_TASK_BOUND");
  const tasks:ManagerScoreRecalculationTask[]=[],optional:Record<string,PropertyDescriptor>[]=[];
  let eligible=true;
  for(let i=0;i<(length as number);i++){
    const item=array[String(i)];
    if(!item?.enumerable||!("value"in item)||!item.value||typeof item.value!=="object"||isProxy(item.value)||
      ![Object.prototype,null].includes(Object.getPrototypeOf(item.value)))fail("MANAGER_SCORE_TASK_INVALID");
    const d=Object.getOwnPropertyDescriptors(item.value);
    if(!d.slot?.enumerable||!("value"in d.slot)||!d.task?.enumerable||!("value"in d.task))
      fail("MANAGER_SCORE_TASK_INVALID");
    tasks.push({slot:d.slot.value as ManagerScoreRecalculationTask["slot"],task:d.task.value as ManagerScoreRecalculationTask["task"]});
    if(Object.getOwnPropertySymbols(item.value).length||
      Object.keys(d).some(name=>!["slot","task","path_dependency","metrics_dependency"].includes(name)))eligible=false;
    optional.push(d);
  }
  // This source/worker envelope never contains optional proof bytes. A bad or
  // oversized optional sidecar cannot suppress otherwise valid economic work.
  return {tasks:detachJson(tasks,maximumBytes),optional,proof_eligible:eligible};
}
function proofItems(intake:WorkerIntake,maximumBytes:number):ManagerScoreRecalculationTask[]{
  if(!intake.proof_eligible)fail("MANAGER_ORIGINAL_OUTER_PROOF_INVALID");
  const items=intake.tasks.map((task,index)=>{
    const result:ManagerScoreRecalculationTask={...task},d=intake.optional[index]!;
    for(const name of ["path_dependency","metrics_dependency"] as const){
      const field=d[name];if(!field)continue;
      if(!field.enumerable||!("value"in field))fail("MANAGER_ORIGINAL_OUTER_PROOF_INVALID");
      if(field.value!==undefined)Object.defineProperty(result,name,{value:field.value,enumerable:true,writable:true,configurable:true});
    }
    return result;
  });
  // Validate/detach optional data BEFORE the legacy proof helper can inspect it.
  // Failure is caught ONLY by the optional caller, with no Proxy/getter invoked.
  return detachJson(items,maximumBytes);
}

export class ManagerOriginalCustodyLifecycle {
  private readonly custody:ManagerScoreOriginalCustody;
  private readonly attached=new WeakMap<ManagerConsumerDelivery,PreparedManagerScoreOriginalCustody>();
  private readonly delegates:readonly ManagerOriginalIdleDelegate[];
  private state:"NOT_RUN"|"ORIGINAL_INPUTS_PREPARED"|"ORIGINAL_INPUTS_STAGED"|"ORIGINAL_INPUTS_NOT_RETAINED"="NOT_RUN";
  private reason:ManagerOriginalCustodyOmission|null=null;
  private readonly limits:Readonly<ManagerOriginalCustodyCaps>;
  constructor(config:ManagerOriginalCustodyCaps,idleDelegates:readonly ManagerOriginalIdleDelegate[]=[]){
    this.limits=caps(config);this.custody=new ManagerScoreOriginalCustody(this.limits);
    if(!idleDelegates||typeof idleDelegates!=="object"||isProxy(idleDelegates)||!Array.isArray(idleDelegates)||
      Object.getPrototypeOf(idleDelegates)!==Array.prototype||Object.getOwnPropertySymbols(idleDelegates).length)
      fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
    const d=Object.getOwnPropertyDescriptors(idleDelegates as object),length:unknown=d.length?.value;
    if(!Number.isSafeInteger(length)||(length as number)<0||(length as number)>2||
      Object.keys(d).length!==(length as number)+1)fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
    const delegates:ManagerOriginalIdleDelegate[]=[];
    for(let i=0;i<(length as number);i++){
      const item=d[String(i)];if(!item?.enumerable||!("value"in item))fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
      const record=fields(item.value,["caps","idle"]),limits=caps(record.caps.value as ManagerOriginalCustodyCaps);
      if(Object.keys(this.limits).some(name=>this.limits[name as keyof ManagerOriginalCustodyCaps]!==limits[name as keyof ManagerOriginalCustodyCaps]))
        fail("MANAGER_ORIGINAL_LIFECYCLE_CAPS_MISMATCH");
      const idle:unknown=record.idle.value;
      if(typeof idle!=="function"||isProxy(idle))fail("MANAGER_ORIGINAL_LIFECYCLE_INVALID");
      delegates.push(Object.freeze({caps:limits,idle:idle as ManagerOriginalIdleDelegate["idle"]}));
    }
    this.delegates=Object.freeze(delegates);
  }
  status(){return {state:this.state,reason_code:this.reason};}
  originalCustodyByteLimit():number{return this.limits.maximum_bundle_bytes;}
  captureScoreInputs(tasks:readonly ManagerScoreRecalculationTask[],maximumInputBytes:number):ManagerOriginalScoreCapture{
    // Actual worker invalidity is NOT swallowed. Only optional proof retention
    // below is caught, after genuine own-data worker bytes are already detached.
    const detached=detachWorkerTasks(tasks,maximumInputBytes);
    try{
      const originals=captureManagerScoreOriginalInputs(proofItems(detached,maximumInputBytes),maximumInputBytes);
      return {tasks:detached.tasks,originals,omission:null};
    }catch{
      // This omits ONLY proof retention. Detached tasks still go through ALL
      // original source-binding and worker validation; no successful worker,
      // valid input, method approval or current grant is fabricated here.
      return {tasks:detached.tasks,originals:null,omission:"ORIGINAL_SCORE_PROOF_NOT_RETAINED"};
    }
  }
  omit(delivery:ManagerConsumerDelivery,reason:ManagerOriginalCustodyOmission):void{
    this.attached.delete(delivery);this.state="ORIGINAL_INPUTS_NOT_RETAINED";this.reason=reason;
  }
  attach(delivery:ManagerConsumerDelivery,tasks:readonly ManagerScoreOriginalInput[],
    compositions:readonly ManagerCompositionOriginalAllocationCustody[],
    regimes:readonly ManagerRegimeOriginalCustody[]):void{
    try{
      const prepared=this.custody.prepare(delivery.document as ManagerModelDocument,tasks,compositions,regimes);
      this.attached.set(delivery,prepared);this.state="ORIGINAL_INPUTS_PREPARED";this.reason=null;
    }catch(error){this.omit(delivery,errorCode(error)==="MANAGER_ORIGINAL_INPUT_BOUND"?
      "ORIGINAL_INPUT_BOUND_NOT_RETAINED":"ORIGINAL_INPUT_INVALID_NOT_RETAINED");}
  }
  // ORIGINAL custody makes no current policy claim. Economic source/current
  // authority/lease fences remain in the existing consumer COMMIT path.
  attachedDeadline(_delivery:ManagerConsumerDelivery):number|undefined{return undefined;}
  assertAttached(_delivery:ManagerConsumerDelivery):void{}
  async persistAttached(client:PoolClient,delivery:ManagerConsumerDelivery):Promise<void>{
    const prepared=this.attached.get(delivery);if(!prepared)return;
    await client.query("SAVEPOINT manager_optional_original_custody");
    try{
      await this.custody.persist(client,prepared);
      await client.query("RELEASE SAVEPOINT manager_optional_original_custody");
      this.state="ORIGINAL_INPUTS_STAGED";this.reason=null; // NOT physical COMMIT
    }catch(error){
      // Never swallow source/head/corruption/DB/final-authority failure. Only
      // the existing shared OPTIONAL retention refusal may preserve source.
      if(errorCode(error)!=="MANAGER_DERIVED_RETENTION_CAP_REACHED")throw error;
      await client.query("ROLLBACK TO SAVEPOINT manager_optional_original_custody");
      await client.query("RELEASE SAVEPOINT manager_optional_original_custody");
      this.omit(delivery,"ORIGINAL_RETENTION_CAP_NOT_RETAINED");
    }
  }
  async idle(input:ManagerOriginalIdleInput):Promise<void>{
    const captured=Object.freeze({...input});
    let firstError:unknown;let failed=false;
    for(const delegate of this.delegates){
      if(captured.signal.aborted)throw captured.signal.reason??new Error("MANAGER_ORIGINAL_IDLE_ABORTED");
      if(performance.now()>=captured.deadline_ms)break;
      try{await delegate.idle(captured);}
      catch(error){if(!failed){failed=true;firstError=error;}}
      // Pending/refused Score policy cannot starve a separate independent
      // delegate; fatal cancellation/deadline still ends the SAME serial tick.
    }
    if(captured.signal.aborted)throw captured.signal.reason??new Error("MANAGER_ORIGINAL_IDLE_ABORTED");
    if(failed)throw firstError;
  }
}
