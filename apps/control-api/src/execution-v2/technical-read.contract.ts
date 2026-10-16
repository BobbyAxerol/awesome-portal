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
