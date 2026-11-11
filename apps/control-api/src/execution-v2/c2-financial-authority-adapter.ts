import type {AccessActor} from "./access.contract";
import {types} from "node:util";
import {CurrentHumanCandidate,currentHumanBinding,type CurrentHumanBinding} from "./current-human-candidate";
import {C2CustodiedIssuerCandidate} from "./c2-custodied-issuer-candidate";
import {pmHttpRequestDigest,type PmHttpRequestBytes} from "./pm-http-request-binding";

/** SOURCE ONLY, unmounted. This adapter binds exact internal financial POST
 * bytes to one C2 owner/workspace/workload and six preselected source paths.
 * It is not source/field authority, a durable context store, HTTP custody,
 * Edge delivery ACK, or authorization to enable a listener. The caller must
 * provide independently authenticated selection and retain correlation. */
const match=C2CustodiedIssuerCandidate.prototype.matchesIssuer;
const issue=C2CustodiedIssuerCandidate.prototype.issue;
const resume=C2CustodiedIssuerCandidate.prototype.resume;
const revalidate=C2CustodiedIssuerCandidate.prototype.revalidate;
const required=CurrentHumanCandidate.prototype.requiresC2DeliverySchema;
const matchesInstallation=CurrentHumanCandidate.prototype.matchesC2Installation;
const bounds=Object.freeze({request_bytes:1_048_576});
const fail=():never=>{throw new Error("C2_FINANCIAL_ADAPTER_UNAVAILABLE");};
const identifier=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=128&&
  value.trim()===value&&!/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const path=(value:unknown):value is string=>typeof value==="string"&&value.length>=2&&value.length<=512&&
  /^\/[A-Za-z0-9_./-]+$/u.test(value)&&value.split("/").slice(1).every(segment=>segment!==""&&segment!=="."&&segment!=="..");
type Issued=Awaited<ReturnType<CurrentHumanCandidate["issue"]>>;
function captureSelection(value:unknown):{owner:string;workspace:string;workload:string;paths:string[]} {
  if(!value||typeof value!=="object"||types.isProxy(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();
  const keys=["owner","workspace","workload","paths"],actual=Reflect.ownKeys(value),d=Object.getOwnPropertyDescriptors(value);
  if(actual.length!==keys.length||actual.some(key=>typeof key!=="string"||!keys.includes(key))||
    keys.some(key=>!d[key]?.enumerable||!Object.hasOwn(d[key],"value")))return fail();
  const selected=d.paths.value;
  if(!Array.isArray(selected)||types.isProxy(selected)||Object.getPrototypeOf(selected)!==Array.prototype||selected.length!==6||
    Reflect.ownKeys(selected).length!==7)return fail();
  const descriptors=Object.getOwnPropertyDescriptors(selected),paths:string[]=[];
  for(let index=0;index<6;index++) {
    const item=descriptors[String(index)];
    if(!item?.enumerable||!Object.hasOwn(item,"value")||!path(item.value))return fail();
    paths.push(item.value);
  }
  if(![d.owner.value,d.workspace.value,d.workload.value].every(identifier)||new Set(paths).size!==6)return fail();
  return {owner:d.owner.value,workspace:d.workspace.value,workload:d.workload.value,paths};
}

export class C2FinancialAuthorityAdapter {
  readonly #issuer:CurrentHumanCandidate;readonly #custodied:C2CustodiedIssuerCandidate;
  readonly #owner:string;readonly #workspace:string;readonly #workload:string;readonly #paths:readonly string[];
  constructor(issuer:CurrentHumanCandidate,custodied:C2CustodiedIssuerCandidate,
    selection:{owner:string;workspace:string;workload:string;paths:readonly string[]}) {
    const captured=captureSelection(selection);
    if(!issuer||Object.getPrototypeOf(issuer)!==CurrentHumanCandidate.prototype||
      !custodied||Object.getPrototypeOf(custodied)!==C2CustodiedIssuerCandidate.prototype||
      custodied.matchesIssuer!==match||custodied.issue!==issue||custodied.resume!==resume||custodied.revalidate!==revalidate||
      !match.call(custodied,issuer)||!required.call(issuer)||!matchesInstallation.call(issuer,captured.workspace,captured.workload))
      throw new Error("C2_FINANCIAL_ADAPTER_UNAVAILABLE");
    this.#issuer=issuer;this.#custodied=custodied;this.#owner=captured.owner;this.#workspace=captured.workspace;
    this.#workload=captured.workload;this.#paths=Object.freeze(captured.paths);
  }
  #scope(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes):void {
    const selected=currentHumanBinding.parse(binding);
    if(!actor||actor.user_id!==this.#owner||selected.workspace_id!==this.#workspace||
      selected.environment!=="paper"||selected.workload_id!==this.#workload||
      this.#custodied.matchesIssuer!==match||this.#custodied.issue!==issue||this.#custodied.resume!==resume||
      this.#custodied.revalidate!==revalidate||!match.call(this.#custodied,this.#issuer)||
      !required.call(this.#issuer)||!matchesInstallation.call(this.#issuer,this.#workspace,this.#workload)||
      !request||request.method!=="POST"||!Buffer.isBuffer(request.raw_path)||!Buffer.isBuffer(request.query_string)||
      !Buffer.isBuffer(request.body)||request.query_string.length!==0||
      !this.#paths.some(value=>Buffer.from(request.raw_path).equals(Buffer.from(value,"utf8")))||
      pmHttpRequestDigest(request,bounds)!==selected.request_digest)return fail();
  }
  /** Internal composition checks only; neither method grants access. */
  matchesCustodied(issuer:C2CustodiedIssuerCandidate):boolean {return this.#custodied===issuer;}
  validateBoundRequest(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes):void {this.#scope(actor,binding,request);}
  async issue(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes):Promise<Issued> {
    this.#scope(actor,binding,request);
    return issue.call(this.#custodied,actor,this.#owner,request,bounds);
  }
  async resume(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,leaseId:string):Promise<Issued> {
    this.#scope(actor,binding,request);if(!identifier(leaseId))return fail();
    return resume.call(this.#custodied,actor,this.#owner,request,bounds,leaseId);
  }
  async revalidate(actor:AccessActor,binding:CurrentHumanBinding,request:PmHttpRequestBytes,issued:Issued):Promise<void> {
    this.#scope(actor,binding,request);
    return revalidate.call(this.#custodied,actor,this.#owner,request,bounds,issued);
  }
}
