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

/** Additive served projection; the durable/event grammar above is unchanged.
 * Never feed this DTO into persistence or source receipt comparison.
 * `recipient_account_id` is the owning recipient account bound by the verified
 * ORIGINAL intent (equal to the verified authorization's recipient); null for a
 * PORTFOLIO recipient. Never a live source lookup and never guessed from a label. */
export const publicPendingControlStatus = pendingControlStatus.innerType().extend({ currency: pendingSourceText,
  recipient_account_id: pendingSourceText.nullable() })
  .superRefine((value, context) => {
    const { currency: _currency, recipient_account_id: account, ...stored } = value;
    // PORTFOLIO resource <-> PORTFOLIO recipient (null); DEPLOYMENT <-> DEPLOYMENT_ACCOUNT (non-null).
    if ((value.resource.kind === "DEPLOYMENT") !== (account !== null))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_RECIPIENT_INVALID", path: ["recipient_account_id"] });
    const result = pendingControlStatus.safeParse(stored);
    if (!result.success) for (const issue of result.error.issues) context.addIssue(issue);
  });
export type PublicPendingControlStatus = z.infer<typeof publicPendingControlStatus>;
/** Caller must already have validated original provenance via pendingRecord,
 * or the exact submitted intent + current mutation/COMMIT correlation. */
export function publishPendingControlStatus(intent: PendingControlIntent, status: PendingControlStatus): PublicPendingControlStatus {
  const body = intent.business_payload;
  return publicPendingControlStatus.parse({ ...status, currency: body.currency,
    recipient_account_id: body.recipient_kind === "DEPLOYMENT_ACCOUNT" ? body.recipient_account_id : null });
}

/* FE-062 (R-1): discovery of still-open recalls the Portal itself controlled.
 * Read-only projection of the Portal's own pending-control history for ONE exact
 * authorized resource. It is NOT a census of source recalls: a recall nobody
 * has controlled through the Portal has no Portal record, so it is not listed
 * and the contract says so in a typed field instead of implying completeness. */
export const pendingRecallDiscoveryQuery = z.object({ workspace_id: pendingText,
  resource_kind: z.enum(["PORTFOLIO", "DEPLOYMENT"]), resource_id: pendingText, environment: executionEnvironment }).strict();
export type PendingRecallDiscoveryQuery = z.infer<typeof pendingRecallDiscoveryQuery>;
export const PENDING_DISCOVERY_MAX_ITEMS = 100;
export const pendingRecallDiscoveryItem = z.object({
  original_recall_id: pendingSourceText, currency: pendingSourceText,
  /** Verified recipient account of the ORIGINAL intent (FE-063); null for a PORTFOLIO recipient. */
  recipient_account_id: pendingSourceText.nullable(),
  /** WAITING_ENCUMBRANCE: last known source receipt shows an open remainder.
   * UNKNOWN: a control was sent but no receipt is known yet (query the same intent). */
  state: z.enum(["WAITING_ENCUMBRANCE", "UNKNOWN"]),
  /** Last KNOWN partition (cumulative applied may already be > 0); null while UNKNOWN. Never zero-filled. */
  amounts: pendingAmounts.nullable(),
  /** Five exact CAS counters of the last KNOWN receipt: the starting point for expected_versions, which the next
   * preview rechecks against the source. Null while UNKNOWN. A later source change makes them stale. */
  versions: pendingVersions.nullable(),
  latest_receipt_id: pendingSourceText.nullable(),
  /** Newest control command with a known receipt / newest still-unresolved control command; both are status ids. */
  last_known_command_id: pendingControlId.nullable(),
  unresolved_command_id: pendingControlId.nullable(),
  last_operation: pendingOperation, updated_at_ms: utcMilliseconds,
}).strict().superRefine((v, c) => {
  const known = v.state === "WAITING_ENCUMBRANCE";
  if (known ? v.amounts === null || v.versions === null || v.latest_receipt_id === null || v.last_known_command_id === null :
    v.amounts !== null || v.versions !== null || v.latest_receipt_id !== null || v.last_known_command_id !== null ||
      v.unresolved_command_id === null)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_DISCOVERY_ITEM_INVALID" });
});
export const pendingRecallDiscovery = z.object({
  schema_version: z.literal("portal.execution.pending-recall-discovery.v1"),
  family: z.literal("PENDING_RECALL_CONTROL"),
  /** The list is the Portal's own control history for this resource, never the source's recall census. */
  coverage: z.literal("PORTAL_CONTROLLED_RECALLS_ONLY"),
  untracked_recalls: z.object({ availability: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED") }).strict(),
  resource: pendingControlResource, environment: executionEnvironment,
  items: z.array(pendingRecallDiscoveryItem).max(PENDING_DISCOVERY_MAX_ITEMS),
  /** True when more open recalls matched than the finite page holds; the list is then the newest. */
  truncated: z.boolean(),
  /** Portal evaluation time, not a source observation time. */
  observed_at_ms: utcMilliseconds,
}).strict().superRefine((v, c) => {
  const ids = v.items.map(item => item.original_recall_id);
  if (new Set(ids).size !== ids.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "PENDING_DISCOVERY_DUPLICATE_RECALL", path: ["items"] });
});
export type PendingRecallDiscovery = z.infer<typeof pendingRecallDiscovery>;

type DiscoveryRecord = { id: string; intent: PendingControlIntent; status: PendingControlStatus };
const newer = (a: DiscoveryRecord, b: DiscoveryRecord) =>
  a.status.updated_at_ms !== b.status.updated_at_ms ? a.status.updated_at_ms - b.status.updated_at_ms :
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const recipientOf = (intent: PendingControlIntent) => intent.business_payload.recipient_kind === "DEPLOYMENT_ACCOUNT" ?
  intent.business_payload.recipient_account_id : null;
/** Pure projection of already identity-validated records (pendingRecord) of ONE exact target. */
export function buildPendingRecallDiscovery(target: Pick<PendingControlIntent, "resource" | "environment">,
  records: readonly DiscoveryRecord[], observedAtMs: number): PendingRecallDiscovery {
  const groups = new Map<string, DiscoveryRecord[]>();
  for (const record of records) {
    const key = record.status.original_recall_id;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const open: z.infer<typeof pendingRecallDiscoveryItem>[] = [];
  for (const [originalRecallId, group] of groups) {
    const ordered = [...group].sort(newer), newest = ordered[ordered.length - 1]!;
    const body = newest.intent.business_payload;
    // One original recall has one currency and one recipient. Divergence is corruption: refuse, never choose.
    for (const record of ordered)
      if (record.intent.business_payload.currency !== body.currency || recipientOf(record.intent) !== recipientOf(newest.intent))
        throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503);
    const known = ordered.filter(record => record.status.business.state !== "UNKNOWN");
    const lastKnown = known[known.length - 1];
    const unresolved = ordered.filter(record => record.status.business.state === "UNKNOWN" &&
      record.status.delivery !== "FAILED_BEFORE_SEND" && (lastKnown === undefined || newer(record, lastKnown) > 0));
    const lastUnresolved = unresolved[unresolved.length - 1];
    // A terminal known outcome closes the recall; only a known open remainder or a pure unresolved send is listed.
    if (lastKnown !== undefined ? lastKnown.status.business.state !== "WAITING_ENCUMBRANCE" : lastUnresolved === undefined) continue;
    const receipt = lastKnown?.status.business.receipt ?? null;
    open.push({ original_recall_id: originalRecallId, currency: body.currency, recipient_account_id: recipientOf(newest.intent),
      state: lastKnown ? "WAITING_ENCUMBRANCE" : "UNKNOWN",
      amounts: lastKnown?.status.business.amounts ?? null, versions: receipt?.versions ?? null,
      latest_receipt_id: receipt?.latest_receipt_id ?? null, last_known_command_id: lastKnown?.status.command_id ?? null,
      unresolved_command_id: lastUnresolved?.status.command_id ?? null,
      last_operation: newest.status.operation, updated_at_ms: newest.status.updated_at_ms });
  }
  open.sort((a, b) => b.updated_at_ms - a.updated_at_ms ||
    (a.original_recall_id < b.original_recall_id ? -1 : a.original_recall_id > b.original_recall_id ? 1 : 0));
  return pendingRecallDiscovery.parse({ schema_version: "portal.execution.pending-recall-discovery.v1",
    family: "PENDING_RECALL_CONTROL", coverage: "PORTAL_CONTROLLED_RECALLS_ONLY",
    untracked_recalls: { availability: "NOT_PUBLISHED", reason_code: "RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED" },
    resource: target.resource, environment: target.environment,
    items: open.slice(0, PENDING_DISCOVERY_MAX_ITEMS), truncated: open.length > PENDING_DISCOVERY_MAX_ITEMS,
    observed_at_ms: observedAtMs });
}
