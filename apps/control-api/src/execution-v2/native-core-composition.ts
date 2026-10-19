/** PRIVATE original08 composition, NOT a route, authority, session or enable flag.
 * Existing authenticated consumers must derive selectors from their real actor
 * and reviewed binding. Selecting a Candidate never grants READ/STREAM access.
 * Retained old sources are recovery-only; expiry never clears durable custody.
 * Caller owns exact DB/schema/role commissioning, app mounting and compatibility.
 */
import { types } from "node:util";
import type { Pool } from "pg";
import { accessDigest } from "./access-digest";
import { CurrentHumanCandidate, CurrentHumanLeaseError,
  type CurrentHumanNativeHTTPConfig,type CurrentHumanNativeReadRecoveryAttempt } from "./current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanNativeReadRecoveryPort,
  type CurrentHumanRecoveryPort } from "./current-human-mutations";
import { selectedNativeBusinessReadSelection } from "./native-business-read-selected-source";
import { privateOwnerCommissioning, type PrivateOwnerCommissioningPin } from "./core-owner-commissioning";
import type { AccessTrustProvider } from "./access-trust";
import type { ExecutionAccessService } from "./access.service";
import { NativeManagerReadConsumer, type NativeManagerRealtimeOptions } from "./native-manager-consumer";
import type { MaximumDataOperationService } from "../execution/maximum-data-operation.service";

export interface NativeCorePersonProfileSelector {
  portal_user_id:string;human_issuer:string;subject:string;workspace_id:string;
  environment:"paper"|"sandbox"|"live";
  domain:{
    profile_id:string;catalogue_sha256:string;profile_sha256:string;field_policy_sha256:string;
  };
}
export interface NativeCoreSelection {
  selector:NativeCorePersonProfileSelector;
  config:CurrentHumanNativeHTTPConfig;
}
export interface NativeCoreCompositionInput {
  expected_workload_id:string;
  selections:readonly NativeCoreSelection[];
  retained_recovery:readonly NativeCoreSelection[];
  owner_intakes:readonly PrivateOwnerCommissioningPin[];
  mutation_limits:{maximum_intents:number;maximum_recoveries_per_request:number};
}
const managerBindings=new WeakMap<object,{
  pool:Pool;trust:AccessTrustProvider;mutations:CurrentHumanMutations;
  selections:readonly NativeCoreSelection[];
}>();

/** Private app DI only: select the genuine composition and the SAME authority,
 * pool and recovery coordinator. A copied/fake object cannot mount a reader.
 * This does not install policies, start a source or authorize any request. */
export function nativeCoreManagerReadConsumer(
  composition:Awaited<ReturnType<typeof composeNativeCore>>,pool:Pool,
  operations:MaximumDataOperationService,
  dependencies:{executionAccessTrust?:AccessTrustProvider;currentHumanMutations?:CurrentHumanMutations},
  realtime?:NativeManagerRealtimeOptions,
):NativeManagerReadConsumer{
  const binding=managerBindings.get(composition);
  if(!binding||binding.pool!==pool||binding.trust!==dependencies.executionAccessTrust||
    binding.mutations!==dependencies.currentHumanMutations)return invalid();
  return new NativeManagerReadConsumer(pool,operations,composition,binding.selections,realtime);
}
const invalid=():never=>{throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CONFIG_INVALID");};
function own(value:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!value||typeof value!=="object"||types.isProxy(value)||Array.isArray(value)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))return invalid();
  const names=Reflect.ownKeys(value);
  if(names.length!==keys.length||names.some(k=>typeof k!=="string"||!keys.includes(k)))return invalid();
  const result:Record<string,unknown>=Object.create(null);
  for(const key of keys){const p=Object.getOwnPropertyDescriptor(value,key);
    if(!p||!p.enumerable||!Object.hasOwn(p,"value"))return invalid();result[key]=p.value;}
  return result;
}
function selector(value:unknown):NativeCorePersonProfileSelector{
  const s=own(value,["portal_user_id","human_issuer","subject","workspace_id","environment","domain"]);
  const d=own(s.domain,["profile_id","catalogue_sha256","profile_sha256","field_policy_sha256"]);
  if([s.portal_user_id,s.human_issuer,s.subject,s.workspace_id,d.profile_id].some(v=>
    typeof v!=="string"||v.length<1||v.length>256||/[\u0000-\u001f\u007f]/u.test(v))||
    !["paper","sandbox","live"].includes(String(s.environment))||
    [d.catalogue_sha256,d.profile_sha256,d.field_policy_sha256].some(v=>typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v)))return invalid();
  return Object.freeze({...s,domain:Object.freeze(d)}) as unknown as NativeCorePersonProfileSelector;
}
function capture(value:unknown){
  const entry=own(value,["selector","config"]),s=selector(entry.selector);
  const c=own(entry.config,["issuer","audience","key_id","private_key","selected_source","limits","installation_scope","terminal","egress"]);
  // These are the existing Candidate's own configuration shapes. Capture all
  // entries synchronously BEFORE its first asynchronous key import/export.
  const config={...c,limits:{...own(c.limits,["ttl_ms","maximum_unresolved","maximum_retained"])},
    installation_scope:{...own(c.installation_scope,["workspace_id","environment","valid_until_ms"])},
    terminal:{...own(c.terminal,["issuer","audience","key_id","private_key","ttl_seconds"])},
    egress:{...own(c.egress,["maximum_response_bytes","maximum_inflight","send_timeout_ms","quiesce_timeout_ms"])}} as unknown as CurrentHumanNativeHTTPConfig;
  const source=selectedNativeBusinessReadSelection(config.selected_source);
  if(s.portal_user_id!==source.human.portal_user_id||s.human_issuer!==source.binding.human_issuer||
    s.subject!==source.binding.subject||s.workspace_id!==source.binding.workspace_id||
    s.environment!==source.binding.environment||accessDigest(s.domain)!==accessDigest(source.domain))return invalid();
  return {selector:s,config,source,key:accessDigest(s)};
}

/** Inert construction: no DB query, source request, policy install or listener.
 * ONE workload is intentional: existing recoverableObligations enumerates that
 * workload, whereas mutation pendingState checks ALL durable unresolved rows.
 * Other/missing custody therefore remains closed, never fabricated as settled.
 */
export async function composeNativeCore(pool:Pool,baseTrust:AccessTrustProvider,input:NativeCoreCompositionInput){
  const root=own(input,["expected_workload_id","selections","retained_recovery","owner_intakes","mutation_limits"]);
  if(typeof root.expected_workload_id!=="string"||!Array.isArray(root.selections)||!Array.isArray(root.retained_recovery)||
    !Array.isArray(root.owner_intakes)||root.selections.length<1||root.selections.length+root.retained_recovery.length>64||
    root.owner_intakes.length<1||root.owner_intakes.length>2)return invalid();
  const active=root.selections.map(capture),retained=root.retained_recovery.map(capture),all=[...active,...retained];
  const pins=structuredClone(root.owner_intakes) as PrivateOwnerCommissioningPin[];
  const limits={...own(root.mutation_limits,["maximum_intents","maximum_recoveries_per_request"])} as unknown as NativeCoreCompositionInput["mutation_limits"];
  const identities=new Set<string>(),routes=new Set<string>(),workspaces=new Set<string>();
  const commonLimits=accessDigest(all[0]!.config.limits);
  for(const entry of all){
    if(entry.source.binding.workload_id!==root.expected_workload_id||identities.has(entry.source.source_identity_digest)||
      accessDigest(entry.config.limits)!==commonLimits)return invalid();
    identities.add(entry.source.source_identity_digest);
  }
  for(const entry of active){if(routes.has(entry.key))return invalid();routes.add(entry.key);}
  for(const pin of pins){
    if(!pin?.target||workspaces.has(pin.target.workspace_id)||
      pin.target.database_name!==pins[0]!.target.database_name||pin.target.database_system_identifier!==pins[0]!.target.database_system_identifier||
      pin.target.role_name!==pins[0]!.target.role_name||pin.target.protected_owner_user_id!==pins[0]!.target.protected_owner_user_id)return invalid();
    workspaces.add(pin.target.workspace_id);
  }
  for(const entry of active){
    const pin=pins.find(p=>p.target.workspace_id===entry.selector.workspace_id);
    if(!pin||!pin.target.principal_workspace_pins.some(p=>p.user_id===entry.selector.portal_user_id&&p.workspace_id===entry.selector.workspace_id))return invalid();
  }
  const recoveryRegistry=new Map<string,CurrentHumanCandidate>(),admissionRegistry=new Map<string,CurrentHumanCandidate>();
  let enumerator:CurrentHumanCandidate|undefined;
  for(const entry of all){
    const candidate=await CurrentHumanCandidate.createNativeRead(pool,entry.config);
    if(!candidate.usesPool(pool))return invalid();
    enumerator??=candidate;recoveryRegistry.set(entry.source.source_identity_digest,candidate);
    if(routes.has(entry.key)&&active.includes(entry))admissionRegistry.set(entry.key,candidate);
  }
  const reverse:CurrentHumanRecoveryPort=Object.freeze({recover:async()=>{
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_REVERSE_PURPOSE_REQUIRED");
  }});
  const native:CurrentHumanNativeReadRecoveryPort=Object.freeze({recover:async(attempt:CurrentHumanNativeReadRecoveryAttempt)=>{
    if(attempt.lifecycle_kind!=="MANAGER_HTTP"&&attempt.lifecycle_kind!=="MANAGER_SSE_FRAME")
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_INVALID");
    const candidate=recoveryRegistry.get(attempt.source_identity_digest);
    if(!candidate)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_INVALID");
    // Original Candidate rereads/pins durable original Base before actual
    // source status/cancel/resolve and genuine source ACK persistence. The
    // coordinator ignores this return and checks durable global pending state.
    return candidate.reconcileNativeRead(attempt.lease_id);
  }});
  const mutations=new CurrentHumanMutations(pool,enumerator!,reverse,limits,native);
  let trust=baseTrust;
  const intakes=pins.map(pin=>{const prepared=privateOwnerCommissioning(trust,pool,pin);trust=prepared.trust;return prepared;});
  const composition=Object.freeze({
    dependencies:Object.freeze({executionAccessTrust:trust,currentHumanMutations:mutations}),
    /** Explicit offline maintenance only. A failed later intake preserves
     * earlier immutable receipts; exact manual retry replays. Runtime selection
     * never invokes installation, repairs policy or consults historical ACKs.
     * Selection is not permission: admission/final send read current DB facts. */
    installOwnerPolicies:async(access:ExecutionAccessService)=>{
      const receipts=[];
      for(const intake of intakes)receipts.push(await intake.install(access));
      return Object.freeze(receipts);
    },
    selectedCandidate:(inputSelector:NativeCorePersonProfileSelector)=>{
      const candidate=admissionRegistry.get(accessDigest(selector(inputSelector)));
      if(!candidate)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_INVALID");
      return candidate;
    },
  });
  managerBindings.set(composition,{pool,trust,mutations,
    selections:Object.freeze(active.map(entry=>Object.freeze({selector:entry.selector,config:entry.config})))});
  return composition;
}
