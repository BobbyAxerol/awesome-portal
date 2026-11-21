/** Additive Replay navigation facts, separate from immutable source revisions. */
import { z } from "zod";

const Ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Availability = z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: Reason.nullable() }).strict();
export const ReplayIdentitySchema = z.object({
  alpha_id: z.string().min(1).max(191).nullable(),
  alpha_version_id: z.string().min(1).max(191).nullable(),
  basis: z.enum(["IMMUTABLE_REQUEST_ALPHA_BINDING", "HUB_BOUND_ALPHA_IDENTITY"]),
  availability: Availability,
}).strict().superRefine((value, ctx) => {
  const available = value.availability.state === "AVAILABLE";
  if (available !== (value.alpha_id !== null && value.alpha_version_id !== null)
    || available === (value.availability.reason_code !== null)
    || !available && (value.alpha_id !== null || value.alpha_version_id !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Replay identity must carry exact IDs or typed absence" });
  }
});
export const ReplayWindowDisclosureSchema = z.object({
  window: z.enum(["IS", "OOS", "HOLDOUT"]),
  /** An envelope only for retained folds; it does not assert contiguous coverage. */
  start_utc_ms: Ms.nullable(), end_utc_ms: Ms.nullable(), bars: Count.nullable(),
  bounds_semantics: z.enum(["START_INCLUSIVE_END_EXCLUSIVE", "SOURCE_RETAINED_FOLD_BOUNDS"]).nullable(),
  count_basis: z.enum(["FULL_SOURCE_WINDOW_OBSERVATIONS", "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP"]).nullable(),
  segments: z.array(z.object({ fold_id: z.string().min(1).max(191),
    start_utc_ms: Ms, end_utc_ms: Ms, bars: Count.nullable() }).strict()).max(256),
  basis: z.enum(["BOUND_WINDOW_METADATA", "DECLARED_IS_WINDOW", "DECLARED_OOS_WINDOW", "DECLARED_HOLDOUT_WINDOW",
    "RETAINED_FOLD_TRAIN_WINDOWS", "RETAINED_FOLD_TEST_WINDOWS"]),
  availability: Availability,
  access_basis: z.literal("COMPLETED_THREE_WINDOW_RETAINED_ACCOUNT").optional(),
}).strict().superRefine((value, ctx) => {
  const bounds = value.start_utc_ms !== null && value.end_utc_ms !== null;
  const available = value.availability.state === "AVAILABLE";
  if ((value.start_utc_ms === null) !== (value.end_utc_ms === null)
    || bounds !== (value.bounds_semantics !== null)
    || bounds && (value.start_utc_ms! > value.end_utc_ms!
      || value.bounds_semantics === "START_INCLUSIVE_END_EXCLUSIVE" && value.start_utc_ms === value.end_utc_ms)
    || (value.bars === null) !== (value.count_basis === null)
    || available && (!bounds || value.bars === null)
    || available === (value.availability.reason_code !== null)
    || value.window === "HOLDOUT" && (value.segments.length !== 0
      || available && value.access_basis !== "COMPLETED_THREE_WINDOW_RETAINED_ACCOUNT"
      || !available && value.bars !== null)
    || value.segments.some(row => row.start_utc_ms > row.end_utc_ms)
    || value.segments.length > 0 && (value.bounds_semantics !== "SOURCE_RETAINED_FOLD_BOUNDS"
      || value.start_utc_ms !== Math.min(...value.segments.map(row => row.start_utc_ms))
      || value.end_utc_ms !== Math.max(...value.segments.map(row => row.end_utc_ms))
      || value.bars !== null && (value.segments.some(row => row.bars === null)
        || value.bars !== value.segments.reduce((sum, row) => sum + row.bars!, 0)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Replay window disclosure must preserve exact bounds/count scope and withheld holdout" });
  }
});
export const ReplayNavigationShape = {
  identity: ReplayIdentitySchema.optional(),
  is_window: ReplayWindowDisclosureSchema.optional(),
  oos_window: ReplayWindowDisclosureSchema.optional(),
  holdout_window: ReplayWindowDisclosureSchema.optional(),
  /** Presentation-only: source revisions, cursors, seals and Report pins are unchanged. */
  presentation_revision: z.literal("research.replay-navigation.v1").optional(),
  presentation_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
};
export const ReplayNavigationSchema = z.object(ReplayNavigationShape).strict();
export type ReplayIdentity = z.infer<typeof ReplayIdentitySchema>;
export type ReplayWindowDisclosure = z.infer<typeof ReplayWindowDisclosureSchema>;
