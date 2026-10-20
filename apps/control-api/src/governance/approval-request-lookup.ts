/**
 * FE-069 · read-only lookup of the CALLER'S OWN approval request by request_key.
 *
 * POST /governance/approvals is idempotent per (workspace, requester, request_key).
 * This read answers what a replay would, without the replay's side effects:
 *   NONE                  a replay would create a new request;
 *   FOUND                 a replay with the same payload returns `result` (the exact
 *                         governance.approval-create.v1 body, replayed=true);
 *   KEY_PAYLOAD_CONFLICT  only when the caller supplied the four payload fields and they
 *                         differ from the stored request: a replay would answer 409
 *                         REQUEST_KEY_PAYLOAD_CONFLICT and no approval body.
 * Without payload fields the stored payload is NOT compared (`payload_check: NOT_COMPARED`),
 * so FOUND then says "a request exists under this key", not "it is the request you meant".
 *
 * Scope is the caller's own requests: the key is looked up under the caller's user id, so
 * another actor's request, even with the same key, is indistinguishable from NONE.
 */
import { z } from "zod";

const requestKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const payloadFields = {
  alpha_id: z.string().trim().min(1).max(191), evidence_run_id: z.string().trim().min(1).max(191),
  methodology_claim_id: z.string().trim().min(1).max(191), summary: z.string().trim().min(8).max(2000),
};
export const approvalRequestLookupQuery = z.object({
  workspace_id: z.string().min(3).max(96).optional(),
  request_key: requestKey,
  alpha_id: payloadFields.alpha_id.optional(), evidence_run_id: payloadFields.evidence_run_id.optional(),
  methodology_claim_id: payloadFields.methodology_claim_id.optional(), summary: payloadFields.summary.optional(),
}).strict().superRefine((value, ctx) => {
  const given = [value.alpha_id, value.evidence_run_id, value.methodology_claim_id, value.summary].filter(v => v !== undefined).length;
  if (given !== 0 && given !== 4)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "LOOKUP_PAYLOAD_ALL_OR_NONE" });
});
export type ApprovalRequestLookupQuery = z.infer<typeof approvalRequestLookupQuery>;

export const approvalRequestLookup = z.object({
  schema_version: z.literal("governance.approval-request-lookup.v1"),
  workspace_id: z.string().min(3).max(96), request_key: requestKey,
  state: z.enum(["NONE", "FOUND", "KEY_PAYLOAD_CONFLICT"]),
  payload_check: z.enum(["NOT_COMPARED", "MATCH", "MISMATCH"]),
  /** Exactly the body a replay returns; null unless state is FOUND. */
  result: z.object({ schema_version: z.literal("governance.approval-create.v1"), replayed: z.literal(true),
    approval: z.record(z.unknown()) }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const ok = value.state === "FOUND" ? value.result !== null && value.payload_check !== "MISMATCH" :
    value.state === "KEY_PAYLOAD_CONFLICT" ? value.result === null && value.payload_check === "MISMATCH" :
      value.result === null && value.payload_check === "NOT_COMPARED";
  if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "LOOKUP_STATE_INCONSISTENT" });
});
export type ApprovalRequestLookup = z.infer<typeof approvalRequestLookup>;

/** Pure: the same decision the replay branch of createApproval makes. */
export function approvalRequestLookupOutcome(input: { workspace_id: string; request_key: string;
  stored: { payloadHash: string; approval: Record<string, unknown> } | null; payloadHash: string | null }): ApprovalRequestLookup {
  const base = { schema_version: "governance.approval-request-lookup.v1" as const, workspace_id: input.workspace_id,
    request_key: input.request_key };
  if (!input.stored) return approvalRequestLookup.parse({ ...base, state: "NONE", payload_check: "NOT_COMPARED", result: null });
  if (input.payloadHash !== null && input.payloadHash !== input.stored.payloadHash)
    return approvalRequestLookup.parse({ ...base, state: "KEY_PAYLOAD_CONFLICT", payload_check: "MISMATCH", result: null });
  return approvalRequestLookup.parse({ ...base, state: "FOUND", payload_check: input.payloadHash === null ? "NOT_COMPARED" : "MATCH",
    result: { schema_version: "governance.approval-create.v1", replayed: true, approval: input.stored.approval } });
}
