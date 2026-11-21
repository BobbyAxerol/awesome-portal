import { z } from "zod";

// New optional BOTH-anchor purposes only. No actor/prose/private manifest or
// source/economic/effective-stage authorization is inferred from these rows.
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/)
  .refine(value => !/[^A-Za-z0-9._:-]/u.test(value));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const version = count.refine(value => value > 0);
const absentPurpose = z.object({ availability: z.literal("NOT_PUBLISHED"),
  reason_code: z.literal("PARENT_FIELD_PURPOSE_NOT_QUALIFIED") }).strict();
const missing = <T extends string>(reason: T) => z.object({ availability: z.literal("NOT_PUBLISHED"),
  value: z.null(), reason_code: z.literal(reason) }).strict();
const noMetric = missing("SOURCE_STRUCTURED_CRITERION_NOT_RECORDED");
const r2Decision = z.enum(["APPROVE", "APPROVE_WITH_CONDITION", "DENY"]);
const paperDecision = z.enum(["PROMOTE", "EXTEND_OBSERVATION", "REJECT"]);
const activityCommon = { decision_id: id, operation_id: id,
  version_before: version, version_after: version, decided_at_ms: count };
const activityItem = z.union([
  z.object({ ...activityCommon, kind: z.literal("R2_DECISION_RECORDED"), decision: r2Decision }).strict(),
  z.object({ ...activityCommon, kind: z.literal("PAPER_EXIT_DECISION_RECORDED"), decision: paperDecision }).strict(),
]).refine(value => value.version_after === value.version_before + 1, "RECORDED_ACTIVITY_VERSION_INVALID");
export const recordedPortalActivitySection = z.union([
  z.object({ availability: z.literal("AVAILABLE"),
    basis: z.literal("IMMUTABLE_PORTAL_DECISION_ROWS_NOT_SOURCE_OR_STAGE_HISTORY"),
    order_basis: z.literal("POSTGRES_DECIDED_AT_DESC_DECISION_ID_C_ASC"),
    coverage: z.literal("BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY"),
    limit: z.literal(32), has_more: z.boolean(), items: z.array(activityItem).max(32),
  }).strict().refine(value => (!value.has_more || value.items.length === 32) &&
    new Set(value.items.map(item => item.decision_id)).size === value.items.length &&
    new Set(value.items.map(item => item.operation_id)).size === value.items.length &&
    // Public ms ties may contain DIFFERENT original PG microseconds. Do not
    // falsely apply the SQL ID tiebreaker to those rounded public timestamps.
    value.items.every((item, index) => index === 0 || value.items[index - 1]!.decided_at_ms >= item.decided_at_ms),
  "RECORDED_ACTIVITY_COHORT_INVALID"), absentPurpose,
  z.object({ availability: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RECORDED_ACTIVITY_NOT_PUBLIC") }).strict(),
]);
const finding = z.object({ finding_id: id, ordinal: count,
  outcome: z.enum(["PASS", "WATCH", "FAIL", "INSUFFICIENT"]), blocking: z.boolean(),
  evaluated_at_ms: count, criterion_key: noMetric, label_key: noMetric,
  observed: noMetric, limit: noMetric, op: noMetric, unit: noMetric, currency: noMetric,
  source_ref: z.object({ kind: z.literal("PORTAL_STORED_R2_FINDING"), approval_id: id, finding_id: id,
    basis: z.literal("STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE") }).strict(),
}).strict().superRefine((value, context) => {
  if (value.source_ref.finding_id !== value.finding_id ||
    value.blocking && value.outcome !== "FAIL" && value.outcome !== "INSUFFICIENT")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "RECORDED_VERDICT_INVALID" });
});
export const r2RecordedVerdictSection = z.union([
  z.object({ availability: z.literal("AVAILABLE"),
    basis: z.literal("STORED_PORTAL_R2_FINDINGS_NOT_CURRENT_GATE_READINESS"),
    order_basis: z.literal("POSTGRES_ORDINAL_ASC_FINDING_ID_C_ASC"),
    coverage: z.literal("BOUNDED_RECORDED_FINDINGS_NOT_FULL_CRITERIA_HISTORY"),
    limit: z.literal(64), has_more: z.boolean(), items: z.array(finding).max(64),
    admission: z.object({ state: z.literal("NOT_EVALUATED"),
      reason_code: z.literal("CURRENT_DECISION_ADMISSION_REQUIRES_PLAN") }).strict(),
  }).strict().refine(value => (!value.has_more || value.items.length === 64) &&
    new Set(value.items.map(item => item.finding_id)).size === value.items.length &&
    value.items.every((item, index) => index === 0 || value.items[index - 1]!.ordinal < item.ordinal),
  "RECORDED_VERDICT_COHORT_INVALID"), absentPurpose,
  z.object({ availability: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RECORDED_VERDICTS_NOT_PUBLIC") }).strict(),
]);
export interface RawRecordedActivityItem {
  decision_id: string; operation_id: string; decision: string;
  version_before: number; version_after: number; decided_at: string;
}
export interface RawRecordedVerdictItem {
  finding_id: string; ordinal: number; outcome: string; blocking: boolean; evaluated_at: string;
}
export type RawRecordedActivity = { state: "NOT_PUBLIC" } |
  { state: "AVAILABLE"; has_more: boolean; items: RawRecordedActivityItem[] };
export type RawRecordedVerdicts = { state: "NOT_PUBLIC" } |
  { state: "AVAILABLE"; has_more: boolean; items: RawRecordedVerdictItem[] };
export interface ParentRecordedSections { recordedActivity?: boolean; recordedVerdicts?: boolean; }
const absent = () => ({ availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" } as const);
function time(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))
    throw Error("RECORDED_TIME_NOT_PUBLIC");
  const ms = Date.parse(value);
  if (!Number.isSafeInteger(ms) || ms < 0) throw Error("RECORDED_TIME_NOT_PUBLIC");
  return ms;
}
export function recordedParentFacts(family: "R2" | "PAPER_EXIT", approvalId: string,
  sections: ParentRecordedSections, activity?: RawRecordedActivity, verdicts?: RawRecordedVerdicts) {
  let recorded_activity: z.infer<typeof recordedPortalActivitySection> = absent();
  if (sections.recordedActivity) {
    if (!activity) throw Error("RECORDED_ACTIVITY_NOT_LOADED");
    recorded_activity = activity.state === "NOT_PUBLIC"
      ? { availability: "NOT_PUBLISHED", reason_code: "RECORDED_ACTIVITY_NOT_PUBLIC" }
      : recordedPortalActivitySection.parse({ availability: "AVAILABLE",
        basis: "IMMUTABLE_PORTAL_DECISION_ROWS_NOT_SOURCE_OR_STAGE_HISTORY",
        order_basis: "POSTGRES_DECIDED_AT_DESC_DECISION_ID_C_ASC", coverage: "BOUNDED_RECENT_DECISIONS_NOT_FULL_HISTORY",
        limit: 32, has_more: activity.has_more, items: activity.items.map(row => ({
          decision_id: row.decision_id, operation_id: row.operation_id, decision: row.decision,
          kind: family === "R2" ? "R2_DECISION_RECORDED" : "PAPER_EXIT_DECISION_RECORDED",
          version_before: row.version_before, version_after: row.version_after, decided_at_ms: time(row.decided_at),
        })) });
  }
  let recorded_verdicts: z.infer<typeof r2RecordedVerdictSection> = absent();
  if (sections.recordedVerdicts) {
    if (family !== "R2" || !verdicts) throw Error("RECORDED_VERDICTS_NOT_LOADED");
    const metric = () => ({ availability: "NOT_PUBLISHED", value: null,
      reason_code: "SOURCE_STRUCTURED_CRITERION_NOT_RECORDED" } as const);
    recorded_verdicts = verdicts.state === "NOT_PUBLIC"
      ? { availability: "NOT_PUBLISHED", reason_code: "RECORDED_VERDICTS_NOT_PUBLIC" }
      : r2RecordedVerdictSection.parse({ availability: "AVAILABLE",
        basis: "STORED_PORTAL_R2_FINDINGS_NOT_CURRENT_GATE_READINESS",
        order_basis: "POSTGRES_ORDINAL_ASC_FINDING_ID_C_ASC",
        coverage: "BOUNDED_RECORDED_FINDINGS_NOT_FULL_CRITERIA_HISTORY", limit: 64, has_more: verdicts.has_more,
        admission: { state: "NOT_EVALUATED", reason_code: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" },
        items: verdicts.items.map(row => ({ finding_id: row.finding_id, ordinal: row.ordinal,
          outcome: row.outcome, blocking: row.blocking, evaluated_at_ms: time(row.evaluated_at),
          criterion_key: metric(), label_key: metric(), observed: metric(), limit: metric(), op: metric(), unit: metric(), currency: metric(),
          source_ref: { kind: "PORTAL_STORED_R2_FINDING", approval_id: approvalId, finding_id: row.finding_id,
            basis: "STORED_REFERENCE_NOT_SOURCE_ACCEPTANCE" } })) });
  }
  return { recorded_activity, recorded_verdicts };
}
