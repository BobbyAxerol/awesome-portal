import { z } from "zod";

const text = z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+$/u)
  .refine(value => [...value].length <= 256, "TEXT_TOO_LONG");
const stamp = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const profile = { environment: z.enum(["paper", "sandbox", "live"]), profile_id: text };

export const technicalHealthSchema = z.object({
  schema_version: z.literal("portal.execution.technical-health.v1"),
  read_scope: z.literal("TECHNICAL_AUTHORIZED"), ...profile,
  component: z.literal("DURABLE_MIRROR"), state: z.enum(["READY", "PARTIAL", "UNAVAILABLE"]),
  reason_code: text.nullable(), revision: text.nullable(), observed_at: stamp.nullable(),
}).strict();

export const technicalDiagnosticsSchema = z.object({
  schema_version: z.literal("portal.execution.technical-diagnostics.v1"),
  read_scope: z.literal("TECHNICAL_AUTHORIZED"),
  profiles: z.array(z.object({ ...profile, component: z.literal("LOCAL_PROJECTION"),
    state: text, health: z.enum(["OBSERVED", "NOT_PUBLISHED"]),
    lag_ms: stamp.nullable(), last_error_code: text.nullable(),
  }).strict()).min(1).max(3),
}).strict();

/** Local technical observations only. Core scope is never replaced by the
 * separately authorized projection-storage workspace. No source readiness. */
export const executionScopedRuntimeManifestSchema = z.object({
  schema_version: z.literal("portal.execution.runtime-manifest.v2"),
  workspace_id: text,
  read_scope: z.literal("TECHNICAL_AUTHORIZED"),
  read_at_ms: stamp,
  local_projection: technicalDiagnosticsSchema,
  durable_mirror: z.array(technicalHealthSchema).min(1).max(3),
}).strict().superRefine((value, context) => {
  const local=value.local_projection.profiles, mirrors=value.durable_mirror;
  const order=["paper","sandbox","live"];
  if(local.length!==mirrors.length || local.some((item,index) => {
    const mirror=mirrors[index];
    return !mirror || item.environment!==mirror.environment || item.profile_id!==mirror.profile_id ||
      index>0 && order.indexOf(item.environment)<=order.indexOf(local[index-1].environment) ||
      (item.health==="NOT_PUBLISHED" ? item.lag_ms!==null : item.lag_ms===null) ||
      mirror.observed_at!==null && mirror.observed_at>value.read_at_ms;
  })) context.addIssue({code:z.ZodIssueCode.custom,message:"RUNTIME_PROFILE_CORRELATION_INVALID",path:["local_projection"]});
});
