/**
 * V2 reader for `governance.approval-request-lookup.v1` (FE-069, Claude BE-P5 f48a97c6):
 * `GET /api/v1/execution/governance/approvals/request-lookup?request_key=[&workspace_id][&alpha_id&evidence_run_id&methodology_claim_id&summary]`,
 * operationId `executionApprovalRequestLookupV1`.
 *
 * It answers one question, read-only: "what would replaying this `request_key` do?", for the CALLER'S OWN requests (another actor's
 * request under the same key is indistinguishable from `NONE`). It writes nothing, refreshes nothing and creates nothing. The New
 * request screen uses it after an uncertain submit, instead of sending the reader to the Inbox to look for the request by eye.
 *
 * Three states, said plainly by `lookupSentence`:
 * - `NONE`: no request exists under this key, so a replay would CREATE. It is the only answer that makes a same-key retry a first send;
 * - `FOUND`: a request exists. `result` is exactly the `governance.approval-create.v1` body a replay returns (`replayed: true`). With
 *   `payload_check: MATCH` the four payload fields were supplied and equal the stored request; with `NOT_COMPARED` they were not
 *   supplied, so FOUND only says a request exists under the key and NOT that it is the one being retried;
 * - `KEY_PAYLOAD_CONFLICT`: all four fields were supplied and differ from the stored request. A replay would answer 409
 *   `REQUEST_KEY_PAYLOAD_CONFLICT` and no approval body. `result` is `null`.
 *
 * Runtime rules the schema states (checked here; a violation voids the read): FOUND carries a body and `NOT_COMPARED | MATCH`;
 * CONFLICT carries `MISMATCH` and no body; NONE carries `NOT_COMPARED` and no body. The reader never infers a match, and an answer for
 * another key or another workspace than the one asked is not an answer (`approvalRequestLookupAnswers`). Closed keys; another
 * `schema_version` is `unsupported_shape`; never throws.
 */
import type { ApprovalCreateOutcome } from "../../api/ports";
import { readApprovalCreated } from "../../api/rows";
import { closed, oneOf, plain, rec, type UnsupportedStatusShape } from "./commandCurrency";

export const APPROVAL_REQUEST_LOOKUP_SCHEMA = "governance.approval-request-lookup.v1";
export const APPROVAL_REQUEST_LOOKUP_PATH = "/api/v1/execution/governance/approvals/request-lookup";
export const LOOKUP_STATES = ["NONE", "FOUND", "KEY_PAYLOAD_CONFLICT"] as const;
export type LookupState = (typeof LOOKUP_STATES)[number];
export const PAYLOAD_CHECKS = ["NOT_COMPARED", "MATCH", "MISMATCH"] as const;
export type PayloadCheck = (typeof PAYLOAD_CHECKS)[number];

const REQUEST_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
/** `alpha_id`, `evidence_run_id`, `methodology_claim_id`: the schema bounds them at 1 to 191 characters and states no other grammar. */
const idOk = (value: string): boolean => value.length >= 1 && value.length <= 191 && plain(value, 191) !== null;

/** The replayed outcome (the same shape `createApprovalRequest` answers with for a replay). */
export type ReplayedApproval = Extract<ApprovalCreateOutcome, { kind: "created" | "replayed" }>;

export type ApprovalRequestLookup =
  | { state: "NONE"; payloadCheck: "NOT_COMPARED"; workspaceId: string; requestKey: string; result: null }
  | { state: "FOUND"; payloadCheck: "NOT_COMPARED" | "MATCH"; workspaceId: string; requestKey: string; result: ReplayedApproval }
  | { state: "KEY_PAYLOAD_CONFLICT"; payloadCheck: "MISMATCH"; workspaceId: string; requestKey: string; result: null };

export type ApprovalRequestLookupRead = { kind: "approval_request_lookup"; lookup: ApprovalRequestLookup } | UnsupportedStatusShape;

const BODY_KEYS = ["schema_version", "workspace_id", "request_key", "state", "payload_check", "result"] as const;

function workspaceText(value: unknown): string | null {
  const text = plain(value, 96);
  return text !== null && text.length >= 3 ? text : null;
}

/** `result` of a FOUND: exactly the replay body. Closed envelope, then the same reader a replay uses (`readApprovalCreated`). */
function readReplay(raw: unknown): ReplayedApproval | null {
  const envelope = closed(raw, ["schema_version", "replayed", "approval"]);
  if (envelope === null || envelope.schema_version !== "governance.approval-create.v1" || envelope.replayed !== true) return null;
  const approval = rec(envelope.approval);
  // `readApprovalCreated` defaults an absent status to PENDING; a lookup states what the server stored, so an absent status is refused.
  if (approval === null || typeof approval.status !== "string" || approval.status === "") return null;
  const outcome = readApprovalCreated(envelope);
  return outcome !== null && outcome.kind === "replayed" ? outcome : null;
}

/**
 * Lookup body -> typed read. `null` is "malformed" (the reader says it could not check, and the retry rule stays as it was); another
 * `schema_version` is `unsupported_shape`.
 */
export function readApprovalRequestLookupV1(raw: unknown): ApprovalRequestLookupRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== APPROVAL_REQUEST_LOOKUP_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, BODY_KEYS);
  if (body === null) return null;
  const workspaceId = workspaceText(body.workspace_id);
  const requestKey = typeof body.request_key === "string" && REQUEST_KEY.test(body.request_key) ? body.request_key : null;
  const state = oneOf(body.state, LOOKUP_STATES);
  const payloadCheck = oneOf(body.payload_check, PAYLOAD_CHECKS);
  if (workspaceId === null || requestKey === null || state === null || payloadCheck === null) return null;
  if (state === "NONE") {
    return payloadCheck === "NOT_COMPARED" && body.result === null
      ? { kind: "approval_request_lookup", lookup: { state, payloadCheck, workspaceId, requestKey, result: null } }
      : null;
  }
  if (state === "KEY_PAYLOAD_CONFLICT") {
    return payloadCheck === "MISMATCH" && body.result === null
      ? { kind: "approval_request_lookup", lookup: { state, payloadCheck, workspaceId, requestKey, result: null } }
      : null;
  }
  const result = readReplay(body.result);
  if (result === null || (payloadCheck !== "NOT_COMPARED" && payloadCheck !== "MATCH")) return null;
  return { kind: "approval_request_lookup", lookup: { state, payloadCheck, workspaceId, requestKey, result } };
}

/** The four payload fields of the request being retried. All four or none: a partial set is never sent. */
export interface LookupPayload {
  alphaId: string;
  evidenceRunId: string;
  methodologyClaimId: string;
  summary: string;
}

export interface ApprovalRequestLookupQuery {
  requestKey: string;
  /** Optional: the server resolves the caller's own workspace when absent. */
  workspaceId?: string;
  /** When given, the server compares it with the stored request (MATCH / MISMATCH); when absent the answer is NOT_COMPARED. */
  payload?: LookupPayload;
}

/** The request URL, or `null` when the server would refuse the query (a malformed key, a partial payload, a summary outside 8..2000). */
export function approvalRequestLookupUrl(query: ApprovalRequestLookupQuery): string | null {
  if (!REQUEST_KEY.test(query.requestKey)) return null;
  const parts = [`request_key=${encodeURIComponent(query.requestKey)}`];
  if (query.workspaceId !== undefined && query.workspaceId !== "") {
    if (workspaceText(query.workspaceId) === null) return null;
    parts.push(`workspace_id=${encodeURIComponent(query.workspaceId)}`);
  }
  const p = query.payload;
  if (p !== undefined) {
    if (!idOk(p.alphaId) || !idOk(p.evidenceRunId) || !idOk(p.methodologyClaimId) || p.summary.length < 8 || p.summary.length > 2000) return null;
    parts.push(
      `alpha_id=${encodeURIComponent(p.alphaId)}`, `evidence_run_id=${encodeURIComponent(p.evidenceRunId)}`,
      `methodology_claim_id=${encodeURIComponent(p.methodologyClaimId)}`, `summary=${encodeURIComponent(p.summary)}`,
    );
  }
  return `${APPROVAL_REQUEST_LOOKUP_PATH}?${parts.join("&")}`;
}

/** True when the body answers THIS question: the same key, and, when a payload was sent, a comparison was made (never NOT_COMPARED). */
export function approvalRequestLookupAnswers(lookup: ApprovalRequestLookup, query: ApprovalRequestLookupQuery): boolean {
  if (lookup.requestKey !== query.requestKey) return false;
  if (query.workspaceId !== undefined && query.workspaceId !== "" && lookup.workspaceId !== query.workspaceId) return false;
  const compared = lookup.payloadCheck !== "NOT_COMPARED";
  // Without a payload nothing can have been compared; with one, only NONE (nothing stored to compare) may honestly say NOT_COMPARED.
  return query.payload === undefined ? !compared : lookup.state === "NONE" || compared;
}

export interface LookupSentence {
  /** What the reader is told, in plain words. */
  text: string;
  /** `true` only for NONE: a retry with the same key and payload would create the request, not replay one. */
  safeToRetrySameKey: boolean;
  /** `true` for FOUND: a request exists under this key. */
  exists: boolean;
  /** `true` when the stored request is known to be the one being retried (MATCH). `false` for NOT_COMPARED. */
  sameRequest: boolean | null;
}

/** The words for an answer. Never says "created" for a request the lookup only found, and never says MATCH for NOT_COMPARED. */
export function lookupSentence(lookup: ApprovalRequestLookup): LookupSentence {
  if (lookup.state === "NONE") {
    return { text: "No request exists under this key. Nothing was created, so retrying with the same key and the same fields creates it.", safeToRetrySameKey: true, exists: false, sameRequest: null };
  }
  if (lookup.state === "KEY_PAYLOAD_CONFLICT") {
    return {
      text: "A request exists under this key, but with different fields from the ones in this form. Retrying with the same key is refused. Change nothing here and open the original request, or discard this one.",
      safeToRetrySameKey: false, exists: true, sameRequest: false,
    };
  }
  if (lookup.payloadCheck === "MATCH") {
    return { text: "The request was created. The fields stored on the server are the ones in this form. This is what a retry would show.", safeToRetrySameKey: false, exists: true, sameRequest: true };
  }
  return {
    text: "A request exists under this key. The fields were not compared, so this only says a request exists, not that it is this one. This is what a retry would show.",
    safeToRetrySameKey: false, exists: true, sameRequest: null,
  };
}
