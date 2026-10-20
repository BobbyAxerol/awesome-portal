/**
 * V2 reader for `portal.execution.pending-recall-preview.v1` and its refusal envelope (RV-10, FE-062 consumer):
 * `POST /api/v1/execution/pending-recalls/preview`, operationId `executionPendingControlPreviewV1`.
 *
 * What the body IS: a rollback-only PREVIEW of one named continuation (APPLY_PENDING or CANCEL_REMAINING) of a recall the Portal
 * already controlled. `allowed: true` carries a complete source-derived prediction and a digest that expires; `allowed: false`
 * carries one typed reason and nothing else.
 *
 * What it is NOT, and what this reader keeps as constants a screen cannot turn into an effect:
 * - `business_applied` and `reserved` are `false`. They are READ: any other value voids the body, never a "partly applied" screen;
 * - a preview digest is a proof of THIS preview, not a permission. Nothing here sends, and a screen that shows the digest says so;
 * - the amounts are exact decimal strings in the unit of the recall (the body has no unit of its own: the caller passes the unit of
 *   the recall it asked about, and the preview must answer that recall and that operation, see `previewAnswers`).
 *
 * Rules the schema cannot say and the server enforces (a violation voids the read, nothing is repaired): the amount partition holds
 * exactly (requested = applied + pending + cancelled + rejected, no floats) and the state's settled shape holds; the digest
 * is `sha256:` + 64 lowercase hex; the five versions are int64 strings.
 *
 * The refusal envelope (`PendingControlProblem`) keeps a closed `code`; the free-text `message` is validated and DROPPED (the words a
 * screen shows are `pendingControlWords`, its own dictionary). A code outside the closed vocabulary voids the envelope: it is a contract
 * violation, not a new word to print.
 */
import {
  PENDING_BUSINESS_STATES, PENDING_OPERATIONS, PENDING_VERSION_KEYS,
  closed, counter, instant, money, nullable, oneOf, partitionHolds, plain, pm, readAmounts, rec, statePartitionHolds,
  type MoneyAmount, type PendingBusinessState, type PendingOperation, type PendingVersionKey, type StatusAmounts, type UnsupportedStatusShape,
} from "./commandCurrency";
import type { UtcEpochMs } from "../../screenDataContract";

export const PENDING_CONTROL_PREVIEW_SCHEMA = "portal.execution.pending-recall-preview.v1";
export const PENDING_CONTROL_PREVIEW_PATH = "/pending-recalls/preview";
export const MAX_PREVIEW_BLOCKERS = 128;

/** `PendingControlPreview.reason_code`: why a preview was not allowed. */
export const PREVIEW_REASON_CODES = [
  "PENDING_CONTROL_NOT_QUALIFIED", "PENDING_CONTROL_CONTEXT_INVALID", "PENDING_CONTROL_CONTEXT_EXPIRED", "PENDING_CONTROL_PREVIEW_CHANGED",
  "PENDING_CONTROL_IDEMPOTENCY_CONFLICT", "PENDING_CONTROL_NOT_FOUND", "PENDING_CONTROL_CAPACITY_EXCEEDED", "PENDING_CONTROL_RECEIPT_UNVERIFIED",
  "PENDING_CONTROL_UNAVAILABLE",
] as const;
export type PreviewReasonCode = (typeof PREVIEW_REASON_CODES)[number];

/** `PendingControlProblem.error.code`: the closed vocabulary of the refusal envelope (FE-061). */
export const PENDING_PROBLEM_CODES = [
  ...PREVIEW_REASON_CODES,
  "PENDING_CONTROL_INPUT_INVALID", "POLICY_PENDING", "CURRENT_ACTOR_AUTHORITY_REQUIRED", "ACCESS_DENIED", "DELEGATION_CEILING_EXCEEDED",
  "SELF_PRIVILEGE_CHANGE_DENIED", "PROTECTED_OWNER_CHANGE_DENIED", "OWNER_RECOVERY_NOT_APPROVED", "POLICY_REVISION_CONFLICT",
  "GRANT_REVISION_CONFLICT", "TS_MEMBERSHIP_NOT_ACCEPTED", "TS_MEMBERSHIP_REVISION_CONFLICT", "SOURCE_RELATION_NOT_QUALIFIED",
  "RESEARCHER_FIELD_POLICY_PENDING", "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", "RECEIPT_NOT_QUALIFIED", "RECEIPT_BINDING_MISMATCH",
  "RECEIPT_REVISION_CONFLICT", "RECEIPT_PAYLOAD_CONFLICT", "STEP_UP_REQUIRED", "STEP_UP_REJECTED", "ACCESS_RESOURCE_NOT_FOUND",
  "ACCESS_RETRY_REQUIRED", "ACCESS_SCOPE_LIMIT_EXCEEDED", "ACCESS_CURSOR_INVALID", "ORIGIN_MISSING", "ORIGIN_DENIED", "CSRF_MISSING",
  "CSRF_INVALID", "SESSION_REQUIRED", "WORKSPACE_PROVISIONING_CONFLICT", "PORTAL_AUTHORITY_UNAVAILABLE", "REQUEST_REJECTED",
  "PORTAL_READ_STORE_UNAVAILABLE", "INTERNAL_ERROR",
] as const;
export type PendingProblemCode = (typeof PENDING_PROBLEM_CODES)[number];

const SAFE_NEXT_ACTIONS = ["QUERY_SAME_INTENT", "REVIEW_BLOCKER"] as const;
export type PendingSafeNextAction = (typeof SAFE_NEXT_ACTIONS)[number];

/** The prediction's state: the five outcomes a continuation can reach (UNKNOWN is not one of them). */
export const PREDICTED_STATES = PENDING_BUSINESS_STATES.filter((state): state is Exclude<PendingBusinessState, "UNKNOWN"> => state !== "UNKNOWN");

export interface PendingControlPrediction {
  state: (typeof PREDICTED_STATES)[number];
  amounts: StatusAmounts;
  /** The change this continuation would make, in the recall's unit (exact). */
  delta: MoneyAmount;
  /** The five counters after the continuation, exact strings. */
  versions: Readonly<Record<PendingVersionKey, string>>;
  blockers: readonly string[];
}

interface PreviewBase {
  operation: PendingOperation;
  originalRecallId: string;
  /** Constant false. */
  businessApplied: false;
  /** Constant false. */
  reserved: false;
}

export type PendingControlPreview =
  | (PreviewBase & {
      allowed: true;
      /** `sha256:` + 64 hex. Binds a later submit to THIS preview; it permits nothing by itself. */
      previewDigest: string;
      expiresAt: UtcEpochMs;
      profileRef: string;
      prediction: PendingControlPrediction;
    })
  | (PreviewBase & { allowed: false; reasonCode: PreviewReasonCode });

export type PendingControlPreviewRead = { kind: "pending_control_preview"; preview: PendingControlPreview } | UnsupportedStatusShape;

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const BODY_KEYS = [
  "schema_version", "operation", "original_recall_id", "allowed", "reason_code", "preview_digest", "expires_at_ms", "profile_ref",
  "prediction", "business_applied", "reserved",
] as const;
const PREDICTION_KEYS = ["state", "amounts", "delta", "versions", "blockers"] as const;

function readPrediction(raw: unknown, currency: string): PendingControlPrediction | null {
  const r = closed(raw, PREDICTION_KEYS);
  const versionsRaw = closed(r?.versions, PENDING_VERSION_KEYS);
  if (r === null || versionsRaw === null) return null;
  const state = oneOf(r.state, PREDICTED_STATES);
  const amounts = readAmounts(r.amounts, currency);
  const delta = money(r.delta, currency);
  if (state === null || amounts === null || delta === null || !partitionHolds(amounts) || !statePartitionHolds(state, amounts)) return null;
  const versions = {} as Record<PendingVersionKey, string>;
  for (const key of PENDING_VERSION_KEYS) {
    const value = counter(versionsRaw[key]);
    if (value === null) return null;
    versions[key] = value;
  }
  if (!Array.isArray(r.blockers) || r.blockers.length > MAX_PREVIEW_BLOCKERS) return null;
  const blockers: string[] = [];
  for (const entry of r.blockers) {
    const text = pm(entry);
    if (text === null) return null;
    blockers.push(text);
  }
  return { state, amounts, delta, versions, blockers };
}

/**
 * Preview body -> typed read. `currency` is the unit of the recall the preview was asked about (the body carries none). `null` is
 * "malformed" and must render as unavailable; a body of another `schema_version` is `unsupported_shape`. Never throws.
 */
export function readPendingControlPreviewV1(raw: unknown, currency: string): PendingControlPreviewRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== PENDING_CONTROL_PREVIEW_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const r = closed(root, BODY_KEYS);
  if (r === null || currency === "") return null;
  const operation = oneOf(r.operation, PENDING_OPERATIONS);
  const originalRecallId = pm(r.original_recall_id);
  // Danger flags: only the published `false` says nothing was applied or held.
  if (operation === null || originalRecallId === null || typeof r.allowed !== "boolean" || r.business_applied !== false || r.reserved !== false) return null;
  const base = { operation, originalRecallId, businessApplied: false, reserved: false } as const;

  if (!r.allowed) {
    const reasonCode = oneOf(r.reason_code, PREVIEW_REASON_CODES);
    if (reasonCode === null || r.preview_digest !== null || r.expires_at_ms !== null || r.profile_ref !== null || r.prediction !== null) return null;
    return { kind: "pending_control_preview", preview: { ...base, allowed: false, reasonCode } };
  }

  const digest = typeof r.preview_digest === "string" && DIGEST.test(r.preview_digest) ? r.preview_digest : null;
  const expiresAt = instant(r.expires_at_ms);
  const profileRef = plain(r.profile_ref);
  const prediction = readPrediction(r.prediction, currency);
  if (r.reason_code !== null || digest === null || expiresAt === null || profileRef === null || prediction === null) return null;
  return { kind: "pending_control_preview", preview: { ...base, allowed: true, previewDigest: digest, expiresAt, profileRef, prediction } };
}

/** True when the body answers THIS request (the operation and the recall asked). A body that reads is not yet an answer. */
export function previewAnswers(preview: PendingControlPreview, asked: { operation: PendingOperation; originalRecallId: string }): boolean {
  return preview.operation === asked.operation && preview.originalRecallId === asked.originalRecallId;
}

/* ───────────────────────────── the refusal envelope ───────────────────────────── */

export interface PendingControlProblem {
  code: PendingProblemCode;
  requestId: string;
  safeNextAction: PendingSafeNextAction | null;
}

/**
 * `{ error: { code, message }, request_id, public_copy_key?, safe_next_action? }`. The message is validated and dropped; a code outside
 * the closed vocabulary, an unknown key or a bad `safe_next_action` voids the envelope (`null`).
 */
export function readPendingControlProblemV1(raw: unknown): PendingControlProblem | null {
  const r = rec(raw);
  if (r === null) return null;
  const keys = Object.keys(r);
  const allowed = ["error", "request_id", "public_copy_key", "safe_next_action"];
  if (!keys.includes("error") || !keys.includes("request_id") || keys.some((key) => !allowed.includes(key))) return null;
  const error = closed(r.error, ["code", "message"]);
  if (error === null || typeof error.message !== "string") return null;
  const code = oneOf(error.code, PENDING_PROBLEM_CODES);
  const requestId = plain(r.request_id, 191);
  const copyKey = r.public_copy_key === undefined ? null : plain(r.public_copy_key, 128);
  const next = nullable(r.safe_next_action === undefined ? null : r.safe_next_action, (value) => oneOf(value, SAFE_NEXT_ACTIONS));
  if (code === null || requestId === null || (r.public_copy_key !== undefined && copyKey === null) || next === undefined) return null;
  return { code, requestId, safeNextAction: next };
}

const WORDS: Partial<Record<PendingProblemCode, string>> = {
  PENDING_CONTROL_NOT_QUALIFIED: "The source for this target is not qualified for this control, so nothing can be previewed.",
  PENDING_CONTROL_CONTEXT_INVALID: "The preview does not match the current recall context. Reload the recall and preview again.",
  PENDING_CONTROL_CONTEXT_EXPIRED: "The preview context has expired. Preview again.",
  PENDING_CONTROL_PREVIEW_CHANGED: "The recall changed since it was read. Reload it and preview again.",
  PENDING_CONTROL_IDEMPOTENCY_CONFLICT: "This request reference was already used for a different request.",
  PENDING_CONTROL_NOT_FOUND: "No such recall is visible to you in this workspace.",
  PENDING_CONTROL_CAPACITY_EXCEEDED: "The control is at capacity. Try again later.",
  PENDING_CONTROL_RECEIPT_UNVERIFIED: "The last receipt for this recall could not be verified, so nothing can be previewed.",
  PENDING_CONTROL_UNAVAILABLE: "The control is not available right now.",
  PENDING_CONTROL_INPUT_INVALID: "The server did not accept the request as built.",
  POLICY_REVISION_CONFLICT: "The access policy changed since this screen was read. Reload it.",
  STEP_UP_REQUIRED: "A fresh step-up is required for this control.",
  SESSION_REQUIRED: "Sign in again to preview.",
  ACCESS_DENIED: "You do not have access to preview this control.",
  CURRENT_ACTOR_AUTHORITY_REQUIRED: "Your current grant does not allow this control.",
  CSRF_MISSING: "The request lacked its session check. Reload the page.",
  CSRF_INVALID: "The request failed its session check. Reload the page.",
  ORIGIN_DENIED: "The request came from an origin the Portal does not accept.",
};

/** The Portal's own sentence for a code. A code with no sentence reads as the generic refusal, never as the server's text. */
export function pendingControlWords(code: string): string {
  return (WORDS as Record<string, string | undefined>)[code] ?? "The Portal did not accept this request.";
}
