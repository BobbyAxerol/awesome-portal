import { createHash } from "node:crypto";
import { types } from "node:util";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import { currentAccessRelations } from "./access-current-relations";
import { accessAction } from "./access.contract";
import { nativeBusinessReadUtcMicroseconds } from "./native-business-read-codec";

/** Private candidate wire. A decoded JSON object is not an authority witness;
 * only the matching authenticated Edge transport may qualify its provenance. */
export class NativeCurrentRelationsSourceCodecError extends Error {
  readonly code = "NATIVE_CURRENT_RELATIONS_SOURCE_WIRE_INVALID";
  constructor() { super("The native registered-relations message is not available."); }
}
const fail = (): never => { throw new NativeCurrentRelationsSourceCodecError(); };
const hash = z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/);
const identifier = z.string().min(1).max(512).refine(s => Buffer.byteLength(s,"utf8")<=512 &&
  !/[\u0000-\u001f\u007f]/u.test(s) && s.trim()===s && !/[\ud800-\udfff]/u.test(s));
const revision = z.string().regex(/^[1-9][0-9]{0,18}$(?![\s\S])/)
  .refine(s => BigInt(s)<9223372036854775808n);
const utc = z.string().refine(s=>{ try { nativeBusinessReadUtcMicroseconds(s); return true; } catch { return false; } });
export const nativeCurrentRelationsBinding = z.object({ lease_id:uuid, attempt_id:uuid,
  human_issuer:identifier, subject:identifier, workspace_id:identifier,
  environment:z.literal("paper"), workload_id:identifier.refine(s=>[...s].length<=128),
  request_digest:hash, operation:z.literal("READ") }).strict();
export const nativeCurrentRelationsRegistration = z.object({ correspondence_id:identifier,
  expected_version:revision, manifest_sha256:hash }).strict();
export const nativeCurrentRelationsOriginal = z.object({ grant_id:identifier, accepted_fact_digest:digest }).strict();
export const nativeCurrentRelationsPurpose=z.object({kind:z.literal("CURRENT_POLICY"),actor_id:identifier,principal_id:identifier,
  workspace_id:identifier,environment:z.literal("paper"),action:accessAction,resource_digest:digest,flight_id:uuid}).strict();
const baseSchema=z.object({schema_version:z.literal("pma.registered-current-relations.request.v1"),binding:nativeCurrentRelationsBinding,
  registration:nativeCurrentRelationsRegistration,original:nativeCurrentRelationsOriginal,purpose:nativeCurrentRelationsPurpose,deadline:utc}).strict()
  .superRefine((v,c)=>{if(v.purpose.workspace_id!==v.binding.workspace_id)c.addIssue({code:z.ZodIssueCode.custom,message:"NATIVE_CURRENT_RELATIONS_PURPOSE_INVALID"});});
export type NativeCurrentRelationsSourceBase = z.infer<typeof baseSchema>;
export type NativeCurrentRelationsSourceAction = "issue"|"enter"|"unknown"|"status"|"cancel-unentered"|"resolve";
const common = z.object({ schema_version:z.literal("pma.registered-current-relations.result.v1"), binding:nativeCurrentRelationsBinding });
const issued = common.extend({ state:z.literal("ISSUED"), relations:currentAccessRelations,
  correspondence:z.object({ registry_revision:digest, manifest_sha256:hash, payload_sha256:hash, approval_ref:identifier }).strict(),
  lease:z.object({source_digest:hash,source_fingerprint:hash,expires_at:utc}).strict() }).strict();
const recorded = z.object({state:z.literal("RECORDED"),phase:z.enum(["ISSUED","ENTERED","UNKNOWN","RETIRED","COMMITTED","ROLLED_BACK","SERVED","ABORTED"]),
  source_digest:hash,expires_at:utc,terminal_authority:z.literal(false),release_permitted:z.literal(false)}).strict();
const observation = common.extend({state:z.literal("OBSERVATION"),recovery:z.union([
  z.object({state:z.literal("ABSENT"),terminal_authority:z.literal(false),release_permitted:z.literal(false)}).strict(),
  z.object({state:z.literal("RECORDED"),phase:z.literal("CANCELLED"),terminal_authority:z.literal(false),release_permitted:z.literal(false)}).strict(),recorded])}).strict();
const result = z.union([issued,common.extend({state:z.literal("ENTERED")}).strict(),
  common.extend({state:z.literal("UNKNOWN")}).strict(),observation,
  common.extend({state:z.literal("CANCELLED"),recovery:z.object({state:z.literal("CANCELLED"),cancellation_authority:z.literal(true),release_permitted:z.literal(true)}).strict()}).strict(),
  common.extend({state:z.literal("RETIRED"),recovery:z.object({state:z.literal("RETIRED"),cancellation_authority:z.literal(true),release_permitted:z.literal(true)}).strict()}).strict(),
  common.extend({state:z.literal("SETTLED"),recovery:z.object({state:z.literal("SETTLED"),phase:z.enum(["SERVED","ABORTED"]),terminal_authority:z.literal(true),release_permitted:z.literal(true)}).strict()}).strict()]);
export type NativeCurrentRelationsSourceResult = z.infer<typeof result>;
export type NativeCurrentRelationsSourceIssued = z.infer<typeof issued>;

/** Detach caller data without invoking getters, toJSON, Proxy traps or retaining
 * mutable references. Source strings are checked before UTF8 replacement. */
function data(value:unknown, depth=0): unknown {
  if(depth>24) return fail();
  if(value===null||typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isSafeInteger(value)?value:fail();
  if(typeof value==="string") {
    for(let i=0;i<value.length;i++) { const n=value.charCodeAt(i); if(n>=0xd800&&n<=0xdbff) {
      const next=value.charCodeAt(++i); if(!(next>=0xdc00&&next<=0xdfff))return fail();
    } else if(n>=0xdc00&&n<=0xdfff)return fail(); }
    return value;
  }
  if(typeof value!=="object"||types.isProxy(value))return fail();
  if(Array.isArray(value)) {
    if(value.length>1000)return fail();
    const names=Reflect.ownKeys(value); if(names.length!==value.length+1)return fail();
    return Array.from({length:value.length},(_,i)=>{const p=Object.getOwnPropertyDescriptor(value,String(i));
      if(!p||!Object.hasOwn(p,"value"))return fail();return data(p.value,depth+1);});
  }
  if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))return fail();
  const out:Record<string,unknown>=Object.create(null), keys=Reflect.ownKeys(value);
  if(keys.length>256)return fail();
  for(const key of keys) {if(typeof key!=="string")return fail(); const p=Object.getOwnPropertyDescriptor(value,key)!;
    if(!Object.hasOwn(p,"value")||!p.enumerable)return fail();out[key]=data(p.value,depth+1);}
  return out;
}
export function nativeCurrentRelationsCanonical(value:unknown):string {
  const sort=(v:unknown):unknown=>Array.isArray(v)?v.map(sort):v!==null&&typeof v==="object"?
    Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,sort(x)])):v;
  return JSON.stringify(sort(data(value)));
}
/** Full JSON reader with decoded-key duplicate refusal, including escaped key
 * aliases. No ambiguous parser-normalization before closed schema validation. */
export function nativeCurrentRelationsDecode(bytes:Uint8Array,maximum=65536):unknown {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>maximum||maximum>65536)return fail();
  let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return fail();}
  let i=0,nodes=0;
  const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??"x"))i++;};
  const string=():string=>{if(text[i++]!=="\"")return fail();const start=i-1;
    while(i<text.length){const c=text[i++];if(c==="\""){try{return JSON.parse(text.slice(start,i));}catch{return fail();}}
      if(c==="\\")i++;}return fail();};
  const parse=(depth:number):unknown=>{if(depth>24||++nodes>10000)return fail();ws();const c=text[i];
    if(c==="\"")return string();
    if(c==="{"){i++;ws();const v:Record<string,unknown>=Object.create(null),keys=new Set<string>();
      if(text[i]==="}"){i++;return v;}while(true){ws();const k=string();if(keys.has(k))return fail();keys.add(k);ws();if(text[i++]!==":")return fail();v[k]=parse(depth+1);ws();const t=text[i++];if(t==="}")return v;if(t!==",")return fail();}}
    if(c==="["){i++;ws();const v:unknown[]=[];if(text[i]==="]"){i++;return v;}while(true){v.push(parse(depth+1));if(v.length>1000)return fail();ws();const t=text[i++];if(t==="]")return v;if(t!==",")return fail();}}
    for(const [s,v] of [["true",true],["false",false],["null",null]] as const)if(text.startsWith(s,i)){i+=s.length;return v;}
    const m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if(!m)return fail();i+=m[0].length;const v=Number(m[0]);return Number.isSafeInteger(v)?v:fail();};
  const parsed=parse(0);ws();if(i!==text.length)return fail();return data(parsed);
}
export function nativeCurrentRelationsBase(input:unknown):Readonly<NativeCurrentRelationsSourceBase> {
  const parsed=baseSchema.safeParse(data(input));if(!parsed.success)return fail();const b=parsed.data;
  const {request_digest:_digest,...binding}=b.binding;
  if(accessDigest({registration:b.registration,original:b.original,purpose:b.purpose,deadline:b.deadline,binding}).slice(7)!==b.binding.request_digest)return fail();
  if(Buffer.byteLength(nativeCurrentRelationsCanonical(b),"utf8")>32768)return fail();
  return Object.freeze(b);
}
export function nativeCurrentRelationsSourceWorkloadId(input:unknown):string {
  const value=identifier.refine(s=>[...s].length<=128).safeParse(input);return value.success?value.data:fail();
}
export interface PreparedNativeCurrentRelationsSourceRequest {readonly native_current_relations_source_request:true;}
const prepared=new WeakMap<object,{action:NativeCurrentRelationsSourceAction;base:Readonly<NativeCurrentRelationsSourceBase>;body:string}>();
export function prepareNativeCurrentRelationsSourceRequest(input:unknown,action:NativeCurrentRelationsSourceAction,signedTerminal?:string):PreparedNativeCurrentRelationsSourceRequest {
  if(!["issue","enter","unknown","status","cancel-unentered","resolve"].includes(action))return fail();
  const base=nativeCurrentRelationsBase(input);
  if(action==="resolve" ? typeof signedTerminal!=="string"||signedTerminal.length>8192||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$(?![\s\S])/.test(signedTerminal) : signedTerminal!==undefined)return fail();
  const body=nativeCurrentRelationsCanonical({...base,...(action==="resolve"?{signed_terminal:signedTerminal}:{})});
  if(Buffer.byteLength(body,"utf8")>32768)return fail();
  const out=Object.freeze({native_current_relations_source_request:true as const});prepared.set(out,{action,base,body});return out;
}
export function nativeCurrentRelationsSourceTransportRequest(input:PreparedNativeCurrentRelationsSourceRequest) {
  const p=prepared.get(input);if(!p)return fail();return Object.freeze({action:p.action,body:p.body,
    base_body:nativeCurrentRelationsCanonical(p.base),path:`/internal/elp210/native-current-relations/${p.action}`,
    workload_id:p.base.binding.workload_id,binding_digest:accessDigest(p.base.binding),stable_core_digest:accessDigest(p.base)});
}
export function parseNativeCurrentRelationsSourceResult(input:PreparedNativeCurrentRelationsSourceRequest,bytes:Uint8Array):NativeCurrentRelationsSourceResult {
  const p=prepared.get(input);if(!p)return fail();const parsed=result.safeParse(nativeCurrentRelationsDecode(bytes));if(!parsed.success)return fail();
  const r=parsed.data;if(accessDigest(r.binding)!==accessDigest(p.base.binding))return fail();
  const expected:Record<NativeCurrentRelationsSourceAction,readonly string[]>={issue:["ISSUED"],enter:["ENTERED"],unknown:["UNKNOWN"],status:["OBSERVATION"],"cancel-unentered":["CANCELLED","RETIRED"],resolve:["SETTLED"]};
  if(!expected[p.action].includes(r.state))return fail();
  if(r.state==="ISSUED"&&(r.relations.workspace_id!==p.base.binding.workspace_id||r.relations.subject_user_id!==p.base.purpose.principal_id||
    r.correspondence.manifest_sha256!==p.base.registration.manifest_sha256||
    nativeBusinessReadUtcMicroseconds(r.lease.expires_at)>nativeBusinessReadUtcMicroseconds(p.base.deadline)))return fail();
  const freeze=(v:unknown):void=>{if(v!==null&&typeof v==="object"){for(const x of Object.values(v))freeze(x);Object.freeze(v);}};
  freeze(r);return r;
}
export const nativeCurrentRelationsSha256=(value:string|Uint8Array):string=>createHash("sha256").update(value).digest("hex");
