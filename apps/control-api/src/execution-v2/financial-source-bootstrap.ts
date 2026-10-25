/** Private bootstrap seam. Loading a manifest does NOT issue a human context
 * or prove PM financial authority. Both sources join ONE mutation coordinator;
 * no standalone financial coordinator may silently replace native recovery. */
import type { Pool } from "pg";
import type { CorePoolProfile } from "../db/pool";
import { assertRegisteredResearchCurrentHumanSchema } from "./current-human-schema";
import { CurrentHumanRecoveryClient } from "./current-human-recovery-client";
import { FinancialSourceComposition } from "./financial-source-composition";
import type { PreparedFinancialSourceRuntime } from "./financial-source-runtime";
import { createFinancialSourceOwnerCommissioning } from "./financial-source-commissioning";

export function selectPrivateCorePoolProfile(native?: {poolProfile:CorePoolProfile}, current?: {poolProfile:CorePoolProfile},
  financial?: PreparedFinancialSourceRuntime, ...additional: ({poolProfile:CorePoolProfile}|undefined)[]): CorePoolProfile | undefined {
  // Reverse-only operation is not independently commissioned by this loader.
  // Require the existing native application's owner/trust/mutation composition.
  if (financial && !native) throw new Error("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
  if (additional.some(Boolean) && !native) throw new Error("PRIVATE_RUNTIME_SHARED_NATIVE_COMPOSITION_REQUIRED");
  const profiles = [native?.poolProfile,current?.poolProfile,financial?.poolProfile,...additional.map(p=>p?.poolProfile)].filter((x):x is CorePoolProfile=>!!x);
  const first=profiles[0];
  if(first && profiles.some(p=>Object.keys(first).some(key=>p[key as keyof CorePoolProfile]!==first[key as keyof CorePoolProfile])))
    throw new Error("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
  return first;
}

/** Validate the actual existing Research schema before creating either private
 * listener. Constructors perform no source request, grant/session write or
 * withPrincipal call. PEM outputs are erased after their owners copy them. */
export async function prepareFinancialSourceApplication(pool:Pool,runtime:PreparedFinancialSourceRuntime) {
  // Snapshot ALL pins, including PEM buffers/arrays, before the schema await.
  // KeyObjects are immutable handles; never spread or serialize their material.
  const copy=<T>(value:T):T=>Buffer.isBuffer(value)?Buffer.from(value) as T:
    Array.isArray(value)?value.map(copy) as T:value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype?
      Object.fromEntries(Object.entries(value).map(([key,item])=>[key,copy(item)])) as T:value;
  const inputs=[runtime.config.assertion_transport.tls,runtime.config.current_human_transport.tls,runtime.recovery.tls]
    .flatMap(tls=>[tls.key,tls.cert,tls.ca]);
  const erase=(value:unknown):void=>{if(Buffer.isBuffer(value))value.fill(0);else if(Array.isArray(value))value.forEach(erase);};
  let selected:PreparedFinancialSourceRuntime|undefined;
  try {
    selected=copy(runtime);
    await assertRegisteredResearchCurrentHumanSchema(pool,selected.schemaTarget);
    const recovery=new CurrentHumanRecoveryClient({...selected.recovery,tls:copy(selected.recovery.tls)});
    const composition=await FinancialSourceComposition.create(pool,selected.config);
    const participant=composition.reverseRecoveryParticipant(recovery);
    const owner=createFinancialSourceOwnerCommissioning(pool,selected,composition);
    const listeners=Object.freeze({assertion:Object.freeze({...selected.listeners.assertion}),reverse:Object.freeze({...selected.listeners.reverse})});
    return Object.freeze({composition,participant,listeners,owner});
  } finally {
    inputs.forEach(erase);
    if(selected)for(const tls of [selected.config.assertion_transport.tls,selected.config.current_human_transport.tls,selected.recovery.tls])
      [tls.key,tls.cert,tls.ca].forEach(erase);
  }
}
export type PreparedFinancialSourceApplication=Awaited<ReturnType<typeof prepareFinancialSourceApplication>>;
