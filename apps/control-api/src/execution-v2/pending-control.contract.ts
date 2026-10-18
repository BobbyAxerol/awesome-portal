/** Additive source-dark implementation. Complete named control of an existing recall;
 * this is not a new recall, money transfer or a widened capital-operation union. */
import { z } from "zod";
import { executionEnvironment, opaqueRevision, pmText, unsignedDecimal, utcMilliseconds, assertAmountPartition } from "./foundation.contract";
import { commandKey, commandId } from "./command.contract";

const wholeText = (s: string) => !/[\u0000-\u001f\u007f]/u.test(s) && Buffer.from(s, "utf8").toString("utf8") === s;
export const pendingText = z.string().min(1).refine(s => [...s].length <= 256 && wholeText(s), "PENDING_TEXT_INVALID");
export const pendingSourceText = pmText.refine(wholeText, "PENDING_SOURCE_TEXT_INVALID");
const exactCounter = /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u;
export const pendingCounter = z.string().regex(exactCounter).refine(s => exactCounter.test(s) && BigInt(s) <= 9223372036854775807n, "PM_COUNTER_OVERFLOW");
export const pendingDigest = z.string().regex(/^sha256:[a-f0-9]{64}(?![\s\S])/u);
export const pendingOperation = z.enum(["APPLY_PENDING", "CANCEL_REMAINING"]);
export const pendingSourceOperation = z.enum(["IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "APPLY_PENDING", "CANCEL_REMAINING"]);
export const pendingVersions = z.object({ budget: pendingCounter, source: pendingCounter,
  parent: pendingCounter, book: pendingCounter, command: pendingCounter }).strict();
const base = { schema_version: z.literal("pma.operator-control.v1"), operation: pendingOperation,
  idempotency_key: commandKey.refine(wholeText), currency: pendingSourceText, reason: pendingSourceText,
  command_id: pendingSourceText, expected_versions: pendingVersions };
export const pendingControlBody = z.discriminatedUnion("recipient_kind", [
  z.object({ ...base, recipient_kind: z.literal("PORTFOLIO") }).strict(),
  z.object({ ...base, recipient_kind: z.literal("DEPLOYMENT_ACCOUNT"),
    recipient_account_id: pendingSourceText, recipient_deployment_id: pendingSourceText }).strict(),
]);
export const pendingControlResource = z.object({ kind: z.enum(["PORTFOLIO", "DEPLOYMENT"]), id: pendingText }).strict();
export const pendingControlIntent = z.object({ schema_version: z.literal("portal.execution.pending-recall-intent.v1"),
  workspace_id: pendingText, resource: pendingControlResource, environment: executionEnvironment,
  expected_policy_revision: opaqueRevision.refine(wholeText), business_payload: pendingControlBody,
}).strict().superRefine((i, c) => {
  const b = i.business_payload;
  if (i.resource.kind === "PORTFOLIO" ? b.recipient_kind !== "PORTFOLIO" :
    b.recipient_kind !== "DEPLOYMENT_ACCOUNT" || b.recipient_deployment_id !== i.resource.id)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_TARGET_MISMATCH", path: ["business_payload"] });
});
export type PendingControlIntent = z.infer<typeof pendingControlIntent>;
export const pendingControlSubmit = z.object({ intent: pendingControlIntent, preview_digest: pendingDigest }).strict();
export const pendingControlQuery = z.object({ workspace_id: pendingText }).strict();
export const pendingControlId = commandId.refine(wholeText);
export const pendingControlReason = z.enum(["PENDING_CONTROL_NOT_QUALIFIED", "PENDING_CONTROL_CONTEXT_INVALID",
  "PENDING_CONTROL_CONTEXT_EXPIRED", "PENDING_CONTROL_PREVIEW_CHANGED", "PENDING_CONTROL_IDEMPOTENCY_CONFLICT",
  "PENDING_CONTROL_NOT_FOUND", "PENDING_CONTROL_CAPACITY_EXCEEDED", "PENDING_CONTROL_RECEIPT_UNVERIFIED", "PENDING_CONTROL_UNAVAILABLE"]);
export class PendingControlError extends Error {
  constructor(readonly code: z.infer<typeof pendingControlReason>, readonly status = 409) { super(code); }
}
const exactDecimal = unsignedDecimal.refine(s => /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?![\s\S])/u.test(s));
export const pendingAmounts = z.object({ requested: exactDecimal, applied: exactDecimal, pending: exactDecimal,
  cancelled: exactDecimal, rejected: exactDecimal }).strict().superRefine((a, c) => {
  try { assertAmountPartition(a); }
  catch { c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_PARTITION_INVALID" }); }
});
export const pendingState = z.enum(["UNKNOWN", "WAITING_ENCUMBRANCE", "PARTIALLY_APPLIED_CANCELLED", "CANCELLED", "REJECTED", "APPLIED"]);
const settledState = z.enum(["WAITING_ENCUMBRANCE", "PARTIALLY_APPLIED_CANCELLED", "CANCELLED", "REJECTED", "APPLIED"]);
export const pendingPrediction = z.object({ state: settledState, amounts: pendingAmounts, delta: exactDecimal,
  versions: pendingVersions, blockers: z.array(pendingSourceText).max(128) }).strict();
export type PendingPrediction = z.infer<typeof pendingPrediction>;
export const pendingControlPreview = z.object({ schema_version: z.literal("portal.execution.pending-recall-preview.v1"),
  operation: pendingOperation, original_recall_id: pendingSourceText, allowed: z.boolean(), reason_code: pendingControlReason.nullable(),
  preview_digest: pendingDigest.nullable(), expires_at_ms: utcMilliseconds.nullable(), profile_ref: pendingText.nullable(),
  prediction: pendingPrediction.nullable(), business_applied: z.literal(false), reserved: z.literal(false),
}).strict().superRefine((v, c) => {
  const facts = [v.preview_digest, v.expires_at_ms, v.profile_ref, v.prediction];
  if (v.allowed ? v.reason_code !== null || facts.some(f => f === null) : v.reason_code === null || facts.some(f => f !== null))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_PREVIEW_INVALID" });
});
export const pendingRecallReceipt = z.object({ control_receipt_id: pendingSourceText, latest_receipt_id: pendingSourceText,
  latest_operation: pendingSourceOperation.nullable(), latest_operation_availability: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  latest_operation_reason: z.literal("SOURCE_OPERATION_NOT_PUBLISHED").nullable(), source_event_id: pendingSourceText,
  original_payload_sha256: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u), versions: pendingVersions }).strict().superRefine((v, c) => {
    if (v.latest_operation_availability === "AVAILABLE" ? v.latest_operation === null || v.latest_operation_reason !== null :
      v.latest_operation !== null || v.latest_operation_reason !== "SOURCE_OPERATION_NOT_PUBLISHED")
      c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_SOURCE_OPERATION_INVALID" });
  });
export const pendingControlStatus = z.object({ schema_version: z.literal("portal.execution.pending-recall-status.v1"),
  family: z.literal("PENDING_RECALL_CONTROL"), command_id: pendingControlId, operation: pendingOperation,
  original_recall_id: pendingSourceText, resource: pendingControlResource, environment: executionEnvironment, profile_ref: pendingText,
  delivery: z.enum(["PREPARED", "SENDING", "ACKNOWLEDGED", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"]),
  business: z.object({ state: pendingState, business_applied: z.boolean().nullable(),
    amounts: pendingAmounts.nullable(), receipt: pendingRecallReceipt.nullable(), blockers: z.array(pendingSourceText).max(128) }).strict(),
  economic_cash_changed: z.literal(false), physical_transfer_performed: z.literal(false),
  projection: z.literal("UNKNOWN"), venue: z.literal("NOT_APPLICABLE"),
  next_action: z.enum(["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"]),
  authority: z.enum(["OWNER_VERIFIED", "TEST_ONLY"]), created_at_ms: utcMilliseconds, updated_at_ms: utcMilliseconds,
}).strict().superRefine((v, c) => {
  const b = v.business;
  if (b.state === "UNKNOWN" ? b.business_applied !== null || b.amounts !== null || b.receipt !== null || b.blockers.length !== 0 :
    b.business_applied !== (b.state === "APPLIED") || b.amounts === null || b.receipt === null || v.delivery !== "ACKNOWLEDGED")
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_RECEIPT_REQUIRED" });
  if (v.updated_at_ms < v.created_at_ms ||
    (v.delivery === "ACKNOWLEDGED") !== (b.state !== "UNKNOWN") ||
    v.next_action !== (b.state !== "UNKNOWN" ? b.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT" :
      v.delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT"))
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_STATUS_INVALID" });
});
export type PendingControlStatus = z.infer<typeof pendingControlStatus>;
