/** P11 orchestration clocks are not engine search, pool-freeze or OOS-read clocks. */
import { z } from "zod";

const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
export const P11_STAGE_EVENT_SEMANTICS = "PORTAL_ORCHESTRATION_NOT_ENGINE_SEARCH_FREEZE_OR_OOS_READ" as const;
export const P11_STAGE_BINDING_ABSENT = "P11_RETAINED_PRODUCER_BINDING_NOT_VERIFIED" as const;
export const POOL_FREEZE_CLOCK_ABSENT = "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_POOL_FREEZE_CLOCK" as const;

export const P11StageEventsSchema = z.object({
  schema_version: z.literal("research.p11-stage-event-clocks.v1"),
  source: z.literal("P11_STAGE_EVENTS"),
  semantics: z.literal(P11_STAGE_EVENT_SEMANTICS),
  /** Hash of exact retained artifact/producer/attempt/profile bindings; no private attempt id. */
  source_binding_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  s3_completed_utc_ms: UtcMs.nullable(),
  s4_started_utc_ms: UtcMs.nullable(),
  s4_completed_utc_ms: UtcMs.nullable(),
  reason_codes: z.object({
    s3_completed: Reason.nullable(),
    s4_started: Reason.nullable(),
    s4_completed: Reason.nullable(),
  }).strict(),
}).strict().superRefine((value, context) => {
  for (const key of ["s3_completed", "s4_started", "s4_completed"] as const) {
    const at = value[`${key}_utc_ms`];
    if ((at === null) !== (value.reason_codes[key] !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [`${key}_utc_ms`], message: "an absent event must carry its reason, a published event must not" });
    }
    if (at !== null && value.source_binding_digest === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: [`${key}_utc_ms`], message: "a stage clock requires an exact retained producer binding" });
    }
  }
});

export type P11StageEvents = z.infer<typeof P11StageEventsSchema>;

export function p11StageEvents(
  bindingDigest: string | null = null,
  clocks: Partial<Pick<P11StageEvents, "s3_completed_utc_ms" | "s4_started_utc_ms" | "s4_completed_utc_ms">> = {},
): P11StageEvents {
  const at = (key: "s3_completed_utc_ms" | "s4_started_utc_ms" | "s4_completed_utc_ms") => bindingDigest === null ? null : clocks[key] ?? null;
  const reason = (value: number | null, stage: string) => value !== null ? null
    : bindingDigest === null ? P11_STAGE_BINDING_ABSENT : `P11_${stage}_EVENT_NOT_RETAINED`;
  const s3 = at("s3_completed_utc_ms");
  const started = at("s4_started_utc_ms");
  const completed = at("s4_completed_utc_ms");
  return P11StageEventsSchema.parse({
    schema_version: "research.p11-stage-event-clocks.v1", source: "P11_STAGE_EVENTS",
    semantics: P11_STAGE_EVENT_SEMANTICS, source_binding_digest: bindingDigest,
    s3_completed_utc_ms: s3, s4_started_utc_ms: started, s4_completed_utc_ms: completed,
    reason_codes: { s3_completed: reason(s3, "S3_COMPLETED"), s4_started: reason(started, "S4_STARTED"), s4_completed: reason(completed, "S4_COMPLETED") },
  });
}
