/** Private bootstrap seam. Loading a manifest does NOT issue a human context
 * or prove PM financial authority. Both sources join ONE mutation coordinator;
 * no standalone financial coordinator may silently replace native recovery. */
import type { Pool } from "pg";
import type { CorePoolProfile } from "../db/pool";
import { assertRegisteredResearchCurrentHumanSchema } from "./current-human-schema";
import { CurrentHumanRecoveryClient } from "./current-human-recovery-client";
import { FinancialSourceComposition } from "./financial-source-composition";
import type { PreparedFinancialSourceRuntime } from "./financial-source-runtime";

export function selectPrivateCorePoolProfile(native?: {poolProfile:CorePoolProfile}, current?: {poolProfile:CorePoolProfile},
  financial?: PreparedFinancialSourceRuntime): CorePoolProfile | undefined {
  // Reverse-only operation is not independently commissioned by this loader.
  // Require the existing native application's owner/trust/mutation composition.
  if (financial && !native) throw new Error("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
  const profiles = [native?.poolProfile,current?.poolProfile,financial?.poolProfile].filter((x):x is CorePoolProfile=>!!x);
  const first=profiles[0];
  if(first && profiles.some(p=>Object.keys(first).some(key=>p[key as keyof CorePoolProfile]!==first[key as keyof CorePoolProfile])))
    throw new Error("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
  return first;
}

/** Validate the actual existing Research schema before creating either private
 * listener. Constructors perform no source request, grant/session write or
 * withPrincipal call. PEM outputs are erased after their owners copy them. */
export async function prepareFinancialSourceApplication(pool:Pool,runtime:PreparedFinancialSourceRuntime) {
  try {
    await assertRegisteredResearchCurrentHumanSchema(pool,runtime.schemaTarget);
    const copy=(value:unknown):unknown=>Buffer.isBuffer(value)?Buffer.from(value):Array.isArray(value)?value.map(copy):value;
    const recovery=new CurrentHumanRecoveryClient({...runtime.recovery,tls:{
      key:copy(runtime.recovery.tls.key) as typeof runtime.recovery.tls.key,
      cert:copy(runtime.recovery.tls.cert) as typeof runtime.recovery.tls.cert,
      ca:copy(runtime.recovery.tls.ca) as typeof runtime.recovery.tls.ca,
    }});
    const composition=await FinancialSourceComposition.create(pool,runtime.config);
    const participant=composition.reverseRecoveryParticipant(recovery);
    return Object.freeze({composition,participant,listeners:runtime.listeners});
  } finally {
    for(const tls of [runtime.config.assertion_transport.tls,runtime.config.current_human_transport.tls,runtime.recovery.tls])
      for(const value of [tls.key,tls.cert,tls.ca]) if(Buffer.isBuffer(value))value.fill(0);
  }
}
export type PreparedFinancialSourceApplication=Awaited<ReturnType<typeof prepareFinancialSourceApplication>>;
