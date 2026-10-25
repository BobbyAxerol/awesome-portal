/** Private original08 runtime-reference adapter. Configuration selects existing
 * components; it never installs policy, creates authority or opens a listener.
 * Root-only owner artifacts remain offline and are never read by this module. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, normalize } from "node:path";
import { importPKCS8, exportJWK, type KeyLike } from "jose";
import { z } from "zod";
import type { Pool } from "pg";
import type { CorePoolProfile } from "../db/pool";
import type { ControlApiDependencies } from "../app.module";
import { captureNativeBusinessReadSelectedPins } from "./native-business-read-codec";
import { SelectedNativeBusinessReadSource } from "./native-business-read-selected-source";
import { composeNativeCore, type NativeCoreSelection, type NativeCoreCompositionInput } from "./native-core-composition";
import { unqualifiedAccessTrust } from "./access-trust";
import { nativeCoreSchemaTarget, type NativeCoreSchemaTarget } from "./current-human-schema";
import { planBGrantWindow, type PlanBGrantWindow } from "./core-owner-commissioning";
import type { CurrentHumanReverseRecoveryParticipant, CurrentHumanCurrentReadRecoveryPort } from "./current-human-mutations";

export class NativeCoreRuntimeError extends Error {
  readonly code="CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID";
  constructor(){super("The private native Core configuration is not available.");}
}
const fail=():never=>{throw new NativeCoreRuntimeError();};
const text=z.string().min(1).max(256).refine(v=>!/[\u0000-\u001f\u007f]/u.test(v));
const hash=z.string().length(64).regex(/^[a-f0-9]{64}$/);
const path=z.string().min(1).max(4096).refine(v=>isAbsolute(v)&&normalize(v)===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const ref=z.object({path,sha256:hash}).strict();
export type NativeCoreRuntimeReference=z.infer<typeof ref>;
const positive=z.number().int().positive().safe();
const boundedMs=positive.max(60000);
const environment=z.enum(["paper","sandbox","live"]);
const domain=z.object({profile_id:text,catalogue_sha256:hash,profile_sha256:hash,field_policy_sha256:hash}).strict();
const poolProfile=z.object({max:positive.max(10),connectionTimeoutMillis:boundedMs,
  statement_timeout:boundedMs,query_timeout:boundedMs,idle_in_transaction_session_timeout:boundedMs})
  .strict().refine(p=>p.query_timeout>p.statement_timeout);
const selector=z.object({portal_user_id:text,human_issuer:text,subject:text,workspace_id:text,environment,domain}).strict();
const source=z.object({
  transport:z.object({origin:text,tls:z.object({ca_ref:ref,cert_ref:ref,key_ref:ref}).strict(),
    pm_leaf_sha256:z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/),workload_id:text,
    deadline_ms:positive,request_bytes:positive,response_bytes:positive,max_inflight:positive}).strict(),
  pins:z.unknown().transform(value=>captureNativeBusinessReadSelectedPins(value)),
  installation_expires_at_utc_ms:positive,
}).strict();
const selection=z.object({selector,config:z.object({
  issuer:text,audience:text,key_id:text,private_key_ref:ref,selected_source:source,
  limits:z.object({ttl_ms:positive,maximum_unresolved:positive,maximum_retained:positive}).strict(),
  installation_scope:z.object({workspace_id:text,environment,valid_until_ms:positive}).strict(),
  terminal:z.object({issuer:text,audience:text,key_id:text,private_key_ref:ref,ttl_seconds:positive}).strict(),
  egress:z.object({maximum_response_bytes:positive,maximum_inflight:positive,send_timeout_ms:positive,quiesce_timeout_ms:positive}).strict(),
}).strict()}).strict();
const target=z.object({database_name:text,database_system_identifier:z.string().regex(/^[0-9]{1,20}$/),
  role_name:text,protected_owner_user_id:text,workspace_id:text,
  principal_workspace_pins:z.array(z.object({user_id:text,workspace_id:text}).strict()).min(1).max(65)}).strict();
const ownerIntake=z.object({artifact_path:path,approved_sha256:hash,target,
  intake_not_before_ms:z.number().int().nonnegative().safe(),intake_not_after_ms:positive,
  /** Plan B (READ+STREAM together, finite, <=2h, within trust). Optional so the
   * serving path and pre-Plan-B manifests are unchanged; the Research offline
   * installer REQUIRES it (researchGrantWindow). */
  grant_window:planBGrantWindow.optional()}).strict()
  .refine(p=>p.intake_not_before_ms<p.intake_not_after_ms);
const realtimeLimits=z.object({maximumClients:positive.max(4096),maximumEntriesPerClient:positive.max(4096),
  maximumFrameBytes:positive.max(1048576),maximumClientBytes:positive,
  maximumTotalBytes:positive.max(64*1048576),maximumNoticesPerRead:positive.max(200),readTimeoutMs:boundedMs})
  .strict().refine(v=>v.maximumClientBytes>=v.maximumFrameBytes&&v.maximumTotalBytes>=v.maximumClientBytes);
const manifest=z.object({schema_version:z.literal("portal.native-core-runtime.v1"),pool_profile:poolProfile,
  realtime_limits:realtimeLimits.optional(),
  cache_observation:z.object({schema_version:z.literal("portal.native-cache-observation-config.v1"),directory:path}).strict().optional(),
  composition:z.object({expected_workload_id:text,selections:z.array(selection).min(1).max(64),
    retained_recovery:z.array(selection).max(63),owner_intakes:z.array(ownerIntake).min(1).max(2),
    mutation_limits:z.object({maximum_intents:positive.max(4096),maximum_recoveries_per_request:positive.max(16)}).strict(),
  }).strict().refine(c=>c.selections.length+c.retained_recovery.length<=64),
}).strict();

/** Exported for the offline preparation validator and its tests only; the
 * runtime itself still parses through prepareNativeCoreRuntime. */
export const nativeCoreRuntimeManifest=manifest;

/** The only new env pair. Empty, partial or malformed values fail closed.
 * Existing loadConfig remains unchanged and never receives secret values. */
export function nativeCoreRuntimeReference(env:NodeJS.ProcessEnv=process.env):NativeCoreRuntimeReference|undefined {
  const file=env.CONTROL_API_NATIVE_CORE_CONFIG_FILE,sha=env.CONTROL_API_NATIVE_CORE_CONFIG_SHA256;
  if(file===undefined&&sha===undefined)return undefined;
  try{return ref.parse({path:file,sha256:sha});}catch{return fail();}
}

/** Offline DDL intent has its own input. It must not require the future
 * TLS/source/grant bundle that this schema enables. Never used by startup,
 * composition or policy installation. */
export function nativeResearchSchemaReference(env:NodeJS.ProcessEnv=process.env):NativeCoreRuntimeReference|undefined {
  const file=env.CONTROL_API_NATIVE_SCHEMA_TARGET_FILE,sha=env.CONTROL_API_NATIVE_SCHEMA_TARGET_SHA256;
  if(file===undefined&&sha===undefined)return undefined;
  try{return ref.parse({path:file,sha256:sha});}catch{return fail();}
}
const researchSchemaInstall=z.object({schema_version:z.literal("portal.native-research-schema-install.v1"),
  environment:z.literal("paper"),profile_id:z.literal("PAPER_BINANCE_USDM"),
  pool_profile:poolProfile,target:nativeCoreSchemaTarget}).strict();
export async function prepareNativeResearchSchemaInstall(input:NativeCoreRuntimeReference,workspaceId:string):Promise<{
  readonly poolProfile:CorePoolProfile;readonly target:NativeCoreSchemaTarget;
}>{
  try{
    const bytes=await readReference(input,CONFIG_BYTES);
    try{
      const value:unknown=JSON.parse(bytes.toString("utf8"));
      if(!Buffer.from(JSON.stringify(value),"utf8").equals(bytes))return fail();
      const parsed=researchSchemaInstall.parse(value),target=parsed.target;
      if(!workspaceId||target.workspace_id!==workspaceId||target.principal_workspace_pins[0]!.workspace_id!==workspaceId)return fail();
      return Object.freeze({poolProfile:Object.freeze({...parsed.pool_profile}),target:Object.freeze(target)});
    }finally{bytes.fill(0);}
  }catch{return fail();}
}

/** Fixed source-boundary caps, not inferred production capacity budgets. */
const CONFIG_BYTES=131072,TLS_BYTES=32768,KEY_BYTES=16384;
export async function readNativeRuntimeReference(input:NativeCoreRuntimeReference,maximumBytes:number):Promise<Buffer>{
  const uid=process.geteuid?.();
  if(uid===undefined)return fail();
  const pin=ref.parse(input),before=await lstat(pin.path);
  const eligible=(s:typeof before)=>s.isFile()&&!s.isSymbolicLink()&&s.uid===uid&&
    ((s.mode&0o7777)===0o400||(s.mode&0o7777)===0o600)&&s.size>0&&s.size<=maximumBytes;
  if(!eligible(before))return fail();
  const file=await open(pin.path,constants.O_RDONLY|constants.O_NOFOLLOW);
  const buffer=Buffer.alloc(maximumBytes+1);
  let length=0,success=false;
  try{
    const actual=await file.stat();
    if(!eligible(actual)||actual.dev!==before.dev||actual.ino!==before.ino||actual.size!==before.size)return fail();
    while(length<buffer.length){
      const part=await file.read(buffer,length,buffer.length-length,null);
      if(part.bytesRead===0)break;
      length+=part.bytesRead;
    }
    const after=await file.stat();
    if(!eligible(after)||after.dev!==actual.dev||after.ino!==actual.ino||after.size!==actual.size||
      length!==actual.size||length>maximumBytes||createHash("sha256").update(buffer.subarray(0,length)).digest("hex")!==pin.sha256)return fail();
    success=true;return buffer.subarray(0,length);
  }finally{await file.close();if(!success)buffer.fill(0);}
}
// Keep the existing native runtime call sites unchanged. New explicit private
// compositions reuse the same owner-only/hash/TOCTOU boundary, not a second
// file-reader implementation or a public configuration surface.
const readReference = readNativeRuntimeReference;
async function signingKey(pin:NativeCoreRuntimeReference):Promise<KeyLike>{
  const bytes=await readReference(pin,KEY_BYTES);
  try{
    const key=await importPKCS8(bytes.toString("utf8"),"EdDSA"),jwk=await exportJWK(key);
    if(jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.d!=="string")return fail();
    return key;
  }finally{bytes.fill(0);}
}
async function hydrate(entry:z.infer<typeof selection>):Promise<NativeCoreSelection>{
  const c=entry.config,s=c.selected_source,t=s.transport;
  const ca=await readReference(t.tls.ca_ref,TLS_BYTES);
  let cert:Buffer|undefined,key:Buffer|undefined;
  try{
    cert=await readReference(t.tls.cert_ref,TLS_BYTES);key=await readReference(t.tls.key_ref,KEY_BYTES);
    const selected_source=new SelectedNativeBusinessReadSource({
      ...s,transport:{origin:t.origin,tls:{ca,cert,key},pm_leaf_sha256:t.pm_leaf_sha256,
        workload_id:t.workload_id,deadline_ms:t.deadline_ms,request_bytes:t.request_bytes,
        response_bytes:t.response_bytes,max_inflight:t.max_inflight}});
    const {private_key_ref,selected_source:_source,terminal,...rest}=c;
    const {private_key_ref:terminalRef,...terminalRest}=terminal;
    return{selector:entry.selector,config:{...rest,private_key:await signingKey(private_key_ref),selected_source,
      terminal:{...terminalRest,private_key:await signingKey(terminalRef)}}};
  }finally{ca.fill(0);cert?.fill(0);key?.fill(0);}
}
/** Pure Research-only ceiling over an ALREADY schema-parsed manifest. No I/O,
 * key/TLS hydration or database access; shared by startup and the offline
 * preparation validator so both enforce the identical single-Paper-actor rule. */
export function nativeCoreResearchReviewTarget(parsed:Pick<z.infer<typeof manifest>,"realtime_limits"|"composition">,
  workspaceId:string):Readonly<z.infer<typeof target>>{
  const entries=parsed.composition.selections,intakes=parsed.composition.owner_intakes;
  if(!parsed.realtime_limits||!workspaceId||entries.length!==1||intakes.length!==1||
    [...entries,...parsed.composition.retained_recovery].some(entry=>entry.selector.environment!=="paper"||
      entry.selector.workspace_id!==workspaceId||entry.selector.domain.profile_id!=="PAPER_BINANCE_USDM"||
      entry.selector.portal_user_id!==entry.selector.subject||
      entry.config.installation_scope.workspace_id!==workspaceId||entry.config.installation_scope.environment!=="paper")||
    intakes[0]!.target.workspace_id!==workspaceId||
    intakes[0]!.target.principal_workspace_pins.length!==1||
    intakes[0]!.target.principal_workspace_pins[0]!.user_id!==entries[0]!.selector.portal_user_id||
    intakes[0]!.target.principal_workspace_pins[0]!.workspace_id!==workspaceId)return fail();
  return Object.freeze(structuredClone(intakes[0]!.target));
}
export interface PreparedNativeCoreRuntime {
  readonly poolProfile:CorePoolProfile;
  /** Closed approval ceiling for the Research-only operator path. No I/O or
   * grant creation; target identity is still checked on the actual Core pool. */
  researchReviewTarget(workspaceId:string):Readonly<z.infer<typeof target>>;
  /** Plan B caps pinned for the workspace's single owner intake. Throws (fail
   * closed) when the manifest does not carry them. Used by the offline installer. */
  researchGrantWindow(workspaceId:string):Readonly<PlanBGrantWindow>;
  compose(pool:Pool, reverseParticipants?:readonly CurrentHumanReverseRecoveryParticipant[],
    currentReadRecovery?:CurrentHumanCurrentReadRecoveryPort):Promise<ControlApiDependencies>;
}
export async function prepareNativeCoreRuntime(input:NativeCoreRuntimeReference):Promise<PreparedNativeCoreRuntime>{
  try{
    const bytes=await readReference(input,CONFIG_BYTES);
    let parsed:z.infer<typeof manifest>;
    try{
      const value:unknown=JSON.parse(bytes.toString("utf8"));
      if(!Buffer.from(JSON.stringify(value),"utf8").equals(bytes))return fail();
      parsed=manifest.parse(value);
    }finally{bytes.fill(0);}
    // Observation is opt-in and Research single-Paper-only. Validate before
    // hydration; never interpret this as an owner/grant/source installation.
    if(parsed.cache_observation!==undefined)
      nativeCoreResearchReviewTarget(parsed,parsed.composition.owner_intakes[0]!.target.workspace_id);
    const selections:NativeCoreSelection[]=[],retained:NativeCoreSelection[]=[];
    // Sequential bounded construction: no source request, Core DB query,
    // listener, owner-artifact read, policy installation or background job.
    for(const entry of parsed.composition.selections)selections.push(await hydrate(entry));
    for(const entry of parsed.composition.retained_recovery)retained.push(await hydrate(entry));
    const compositionInput:NativeCoreCompositionInput={...parsed.composition,selections,retained_recovery:retained};
    const profile=Object.freeze({...parsed.pool_profile});
    return Object.freeze({poolProfile:profile,researchReviewTarget:(workspaceId:string)=>
      nativeCoreResearchReviewTarget(parsed,workspaceId),
      researchGrantWindow:(workspaceId:string)=>{
        nativeCoreResearchReviewTarget(parsed,workspaceId);
        const window=parsed.composition.owner_intakes[0]!.grant_window;
        return window?Object.freeze({...window}):fail();
      },compose:async(pool:Pool,reverseParticipants:readonly CurrentHumanReverseRecoveryParticipant[]=[],
        currentReadRecovery?:CurrentHumanCurrentReadRecoveryPort)=>{
      try{
        const composed=await composeNativeCore(pool,unqualifiedAccessTrust,compositionInput,reverseParticipants,currentReadRecovery);
        // Constructors above validate the SAME already-bounded pool. Target
        // metadata is not proof of where this connection actually points.
        const actual=await pool.query<{database_name:string;role_name:string;session_role_name:string;database_system_identifier:string}>(
          "SELECT current_database() AS database_name,current_user AS role_name,session_user AS session_role_name,(pg_control_system()).system_identifier::text AS database_system_identifier");
        const observed=actual.rows[0];
        if(actual.rowCount!==1||!observed||compositionInput.owner_intakes.some(({target})=>
          observed.database_name!==target.database_name||observed.database_system_identifier!==target.database_system_identifier||
          observed.role_name!==target.role_name||observed.session_role_name!==target.role_name))return fail();
        // AppModule's existing private factory verifies SAME pool/trust/mutation
        // and genuine composition provenance. Never construct another consumer
        // here or expose an unrecognized dependency property that mounts nothing.
        return Object.freeze({...composed.dependencies,nativeManagerRead:composed,
          ...(parsed.realtime_limits===undefined?{}:{nativeManagerRealtimeLimits:Object.freeze({...parsed.realtime_limits})}),
          ...(parsed.cache_observation===undefined?{}:{nativeManagerCacheObservation:Object.freeze({directory:parsed.cache_observation.directory})})
        }) satisfies ControlApiDependencies;
      }catch{return fail();}
    }});
  }catch{return fail();}
}
