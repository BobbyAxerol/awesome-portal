import { z } from "zod";
import { managerDisplaySafe } from "../execution-v2/manager-dataset-invariants";

/** WP-K slice 2: approval evidence (`portal.execution.approval-evidence.v1`).
 * Mirrors packages/contracts/schemas/execution-approval-evidence.v1.schema.json. Each section is OMITTED (no owning source), `null` (source not
 * read) or published; a count of 0 is a published true zero. No value here is ever defaulted or invented. */
export const APPROVAL_EVIDENCE_SCHEMA = "portal.execution.approval-evidence.v1" as const;
// JSON Schema and the consumer bound text by Unicode code points, while
// JavaScript string.length (and Zod's string.max) count UTF-16 code units.
const text = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/)
  .refine(managerDisplaySafe, "EVIDENCE_TEXT_UNSAFE")
  .refine(value => [...value].length <= 256, "EVIDENCE_TEXT_TOO_LONG");
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/);
export const APPROVAL_ID_PATTERN = /^[A-Za-z0-9._:-]{1,191}$/;
// UI formats these as ECMAScript Dates; counts retain the larger safe-int limit.
const ms = z.number().int().min(0).max(8_640_000_000_000_000);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const decimal = z.string().max(80).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/)
  .refine(value => !/^-0(?:\.0+)?$/.test(value), "EVIDENCE_DECIMAL_NEGATIVE_ZERO");
const nonPositive = z.string().max(80).regex(/^(?:0(?:\.0+)?|-(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)$/);

const history = z.object({
  subject: z.object({ subject_type: z.enum(["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT"]), subject_id: id }).strict(),
  metric: z.enum(["NAV", "NET_PNL", "RETURN", "DRAWDOWN"]), unit: z.enum(["MONEY", "RATIO"]),
  currency: text.nullable(), ratio_scale: z.enum(["FRACTION", "PERCENT"]).nullable(),
  window: z.object({ from_ms: ms, to_ms: ms }).strict(), methodology_ref: text,
  points: z.array(z.object({ ts_ms: ms, value: decimal }).strict()).max(2000), as_of_ms: ms,
}).strict().superRefine((v, c) => {
  const bad = (message: string, path: (string | number)[]) => c.addIssue({ code: z.ZodIssueCode.custom, message, path });
  // WP-K EV-1: the consumer requires one nonempty interval with ordered,
  // unique samples inside it. Both endpoints are inclusive for observations.
  if (v.window.from_ms >= v.window.to_ms) bad("HISTORY_WINDOW_INVALID", ["window"]);
  v.points.forEach((p, i) => {
    if (p.ts_ms < v.window.from_ms || p.ts_ms > v.window.to_ms || (i > 0 && p.ts_ms <= v.points[i - 1].ts_ms))
      bad("HISTORY_POINTS_OUTSIDE_OR_NOT_STRICTLY_ASCENDING", ["points", i, "ts_ms"]);
  });
  if (v.metric === "RETURN" || v.metric === "DRAWDOWN") {
    if (v.unit !== "RATIO") bad("HISTORY_RATIO_METRIC_NEEDS_RATIO_UNIT", ["unit"]);
    if (v.currency !== null) bad("HISTORY_RATIO_HAS_NO_CURRENCY", ["currency"]);
    if (v.ratio_scale === null) bad("HISTORY_RATIO_NEEDS_SCALE", ["ratio_scale"]);
  } else {
    if (v.unit !== "MONEY") bad("HISTORY_MONEY_METRIC_NEEDS_MONEY_UNIT", ["unit"]);
    if (v.currency === null) bad("HISTORY_MONEY_NEEDS_CURRENCY", ["currency"]);
    if (v.ratio_scale !== null) bad("HISTORY_MONEY_HAS_NO_RATIO_SCALE", ["ratio_scale"]);
  }
  if (v.metric === "DRAWDOWN") v.points.forEach((p, i) => { if (!nonPositive.safeParse(p.value).success) bad("HISTORY_DRAWDOWN_ABOVE_ZERO", ["points", i, "value"]); });
});
const diff = z.object({
  previous_revision: text,
  changes: z.array(z.object({ label: text, before: text.nullable(), after: text.nullable(),
    unit: z.enum(["MONEY", "RATIO", "COUNT", "TEXT", "TIMESTAMP_MS"]) }).strict()).max(64),
}).strict().superRefine((v, c) => {
  // WP-K EV-3: an unchanged pair is not an evidence-diff row.
  v.changes.forEach((change, i) => {
    if (change.before === change.after)
      c.addIssue({ code: z.ZodIssueCode.custom, message: "EVIDENCE_DIFF_UNCHANGED", path: ["changes", i] });
  });
});
const obligations = z.object({ open_positions: count, working_orders: count, reservations: count, unknown_outcomes: count, settlement_pending: count }).strict();
const preview = z.object({ what_changes: text, counts_as: z.object({ met_after: count, required: count }).strict() }).strict();

export const approvalEvidenceSections = {
  prior_economic_history: history.nullable().optional(), evidence_diff: diff.nullable().optional(),
  obligations_after_approval: obligations.nullable().optional(), receipt_preview: preview.nullable().optional(),
} as const;
export const approvalEvidenceResponse = z.object({
  schema_version: z.literal(APPROVAL_EVIDENCE_SCHEMA), workspace_id: text, approval_id: id,
  record_authority: z.literal("PORTAL_PROJECTION"), read_at_ms: ms, ...approvalEvidenceSections,
}).strict();
export type ApprovalEvidenceResponse = z.infer<typeof approvalEvidenceResponse>;
export type ApprovalEvidenceSectionName = keyof typeof approvalEvidenceSections;
export const APPROVAL_EVIDENCE_SECTION_NAMES = Object.keys(approvalEvidenceSections) as ApprovalEvidenceSectionName[];
export const approvalEvidenceQuery = z.object({ workspace_id: text.optional() }).strict();
