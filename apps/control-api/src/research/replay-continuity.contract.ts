/** §58: read-side facts only; never a new execution/accounting authority. */
import { z } from "zod";

export const REPLAY_MAX_BARS = 400;
const Count = z.number().int().nonnegative().max(2_000_000);
const Id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Cursor = z.string().regex(/^kc1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/).max(4096);

export const ReplaySplitShapeSchema = z.object({
  schema_version: z.literal("research.replay-split-shape.v1"),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  window_kind: z.enum(["FOLD_WINDOWS", "SINGLE_FULL_WINDOW"]).nullable(),
  oos_applicable: z.boolean().nullable(), independent_holdout: z.boolean().nullable(),
  ordinal_basis: z.literal("SEALED_ACCOUNT_OBSERVATION_ORDINALS"),
  windows: z.array(z.object({ fold_id: Id, window: z.enum(["OOS", "FULL_SAMPLE"]),
    first_ordinal: Count, last_ordinal: Count, bars: Count.positive(),
  }).strict()).max(256),
}).strict().superRefine((v, c) => {
  const bad = (message: string) => c.addIssue({ code: z.ZodIssueCode.custom, message });
  if (v.state === "NOT_PUBLISHED") {
    if (!v.reason_code || v.window_kind !== null || v.oos_applicable !== null || v.independent_holdout !== null || v.windows.length)
      bad("Absent split must not assert window semantics");
    return;
  }
  if (v.reason_code !== null || !v.window_kind || v.oos_applicable === null || v.independent_holdout === null || !v.windows.length
    || new Set(v.windows.map(w => w.fold_id)).size !== v.windows.length
    || v.windows.some((w, i) => w.last_ordinal - w.first_ordinal + 1 !== w.bars
      || i > 0 && w.first_ordinal <= v.windows[i - 1]!.last_ordinal)) bad("Invalid retained split spans");
  if (v.window_kind === "SINGLE_FULL_WINDOW"
    ? v.windows.length !== 1 || v.oos_applicable !== false || v.independent_holdout !== false || v.windows[0]?.window !== "FULL_SAMPLE"
    : v.oos_applicable !== true || v.windows.some(w => w.window !== "OOS")) bad("Full sample is not a held-out OOS window");
});

const Selection = z.object({
  params_digest: Digest.nullable(), selected_trial_id: Id.nullable(), study_id: Id.nullable(),
  selected_trial_reason_code: Reason.nullable(), study_reason_code: Reason.nullable(),
}).strict().refine(v => (v.selected_trial_id === null) === (v.selected_trial_reason_code !== null)
  && (v.study_id === null) === (v.study_reason_code !== null), "Missing identity requires a reason");
export const ReplayBoundaryFactSchema = z.object({
  previous_fold_id: Id, fold_id: Id, first_ordinal: Count,
  params_digest_changed: z.boolean().nullable(), params_digest_reason_code: Reason.nullable(),
  comparison_basis: z.literal("SEALED_SELECTED_PARAMETERS_NOT_RUNTIME_BINDING"),
  previous_selection: Selection, selection: Selection,
  previous_end_equity: Decimal, previous_end_position: Decimal,
  // Observational baseline only; PREVIOUS_OBSERVATION is not a carry policy.
  start_basis: z.enum(["PREVIOUS_OBSERVATION", "FIRST_WINDOW_OBSERVATION"]),
  equity_start_policy: z.enum(["CARRIED", "RESET", "NOT_ASSERTED"]),
  position_start_policy: z.enum(["CARRIED", "RESET_FLAT", "CLOSED_AT_BOUNDARY", "NOT_ASSERTED"]),
  carry_policy_reason_code: Reason.nullable(),
}).strict().superRefine((v, c) => {
  const before = v.previous_selection.params_digest, after = v.selection.params_digest;
  const missing = before === null || after === null;
  if (v.previous_fold_id === v.fold_id || (v.params_digest_reason_code !== null) !== missing
    || (missing ? v.params_digest_changed !== null : v.params_digest_changed !== (before !== after))
    || ((v.equity_start_policy === "NOT_ASSERTED" || v.position_start_policy === "NOT_ASSERTED") !== (v.carry_policy_reason_code !== null)))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "Boundary facts must agree with retained identities/policy" });
});

export const ReplayWindowCursorSchema = z.object({
  schema_version: z.literal("research.replay-window-cursor.v1"),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]), reason_code: Reason.nullable(),
  order: z.literal("SOURCE_TABLE_ORDINAL_ASC"),
  crossed_fold_boundary: z.boolean().nullable(),
  first_fold_id: Id.nullable(), last_fold_id: Id.nullable(),
  next_fold_id: Id.nullable(), previous_fold_id: Id.nullable(),
  next_window_cursor: Cursor.nullable(), previous_window_cursor: Cursor.nullable(),
}).strict().refine(v => v.state === "AVAILABLE"
  ? v.reason_code === null && v.crossed_fold_boundary !== null
  : v.reason_code !== null && v.crossed_fold_boundary === null && v.first_fold_id === null
    && v.last_fold_id === null && v.next_fold_id === null && v.previous_fold_id === null,
"Absent fold ownership must not become a no-boundary assertion");
