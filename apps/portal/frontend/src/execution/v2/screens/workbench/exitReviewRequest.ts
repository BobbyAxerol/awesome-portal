/**
 * The Paper exit review REQUEST, as pure rules (RV-10): what the request is bound to, when it may be sent, what a settled answer
 * must match before the screen says "requested", and how a review is read back.
 *
 * The write is `POST /governance/paper-exit/create` (`createPaperExit`). Its inputs are not the screen's to invent: the parent R2
 * approval, its version and the source projection digest come from the parent R2 review's `capture_context` (`CaptureContext`),
 * and nothing else. This deployment's own Paper profile publishes none of them, and no route maps a deployment to its R2 parent,
 * so `bindExitReview` gets `null` there and the control is shut with the typed gap `R2_PARENT_NOT_PUBLISHED_FOR_DEPLOYMENT`
 * instead of a guessed approval id. The moment a read does carry the context (the R2 review does), the same rules bind it.
 *
 * Advisory eligibility (`paper.exit_review_request`) never appears here as a boolean: it can only change the words of a control
 * that is already shut (see `stageActionReason`).
 */
import type { CaptureContext, ContextRead } from "../../../api/governanceContext";
import { reasonWords } from "../../../api/governanceContext";
import type { ReviewCapture } from "../../../api/reviewCapture";
import type { GovernanceParentRead } from "../../readers/dispatch";
import { unsafeText } from "../../../unsafeText";

/** The server's published bounds for the summary (`PaperExitCreateRequest.summary`). */
export const EXIT_SUMMARY_MIN = 8;
export const EXIT_SUMMARY_MAX = 1000;

/** The typed gap: this deployment's profile names no R2 parent. */
export const R2_PARENT_GAP = "R2_PARENT_NOT_PUBLISHED_FOR_DEPLOYMENT";

export interface ExitReviewBinding {
  workspaceId: string;
  parentApprovalId: string;
  expectedParentVersion: number;
  projectionDigest: string;
  deploymentId: string;
}

export type ExitBind = { state: "bound"; binding: ExitReviewBinding } | { state: "shut"; reason: string; code: string };

/**
 * Bind the request to the parent's capture context, or say why it cannot be bound. Every check is a refusal of a mismatch the server
 * would also refuse; the screen never repairs one (it does not pick another workspace, another deployment or another version).
 */
export function bindExitReview(input: { context: ContextRead<CaptureContext> | null; workspaceId: string | null; deploymentId: string }): ExitBind {
  const { context, workspaceId, deploymentId } = input;
  if (workspaceId === null) return { state: "shut", code: "WORKSPACE_NOT_PUBLISHED", reason: "No workspace is named for this read." };
  if (context === null) return { state: "shut", code: R2_PARENT_GAP, reason: "The R2 review behind this deployment is not published." };
  if (context.kind === "absent") return { state: "shut", code: "CAPTURE_CONTEXT_ABSENT", reason: "The R2 review published no next-review context." };
  if (context.kind === "invalid") return { state: "shut", code: "CAPTURE_CONTEXT_INVALID", reason: "The next-review context could not be validated." };
  const c = context.value;
  if (c.action !== "PAPER_EXIT_CREATE") return { state: "shut", code: "CAPTURE_CONTEXT_OTHER_ACTION", reason: "That context is for another review." };
  if (c.workspaceId !== workspaceId) return { state: "shut", code: "CAPTURE_CONTEXT_OTHER_WORKSPACE", reason: "That context belongs to another workspace." };
  if (!c.availability.available) return { state: "shut", code: c.availability.reasonCode ?? "CAPTURE_BLOCKED", reason: `Not available: ${reasonWords(c.availability.reasonCode)}.` };
  if (c.projectionDigest === null) return { state: "shut", code: "CAPTURE_DIGEST_MISSING", reason: "The source review published no digest to bind to." };
  // The deployment is one of the accepted choices, never "the first one": a bounded list that lacks it cannot vouch for it.
  if (!c.candidates.some((candidate) => candidate.deploymentId === deploymentId)) {
    return { state: "shut", code: "CAPTURE_DEPLOYMENT_NOT_ACCEPTED", reason: c.truncated ? "This deployment is not among the first accepted choices." : "This deployment is not an accepted choice." };
  }
  return {
    state: "bound",
    binding: { workspaceId: c.workspaceId, parentApprovalId: c.parentApprovalId, expectedParentVersion: c.expectedParentVersion, projectionDigest: c.projectionDigest, deploymentId },
  };
}

/* ── the summary ──────────────────────────────────────────────────────────────── */

export const summaryLength = (summary: string): number => [...summary.trim()].length;

export type SummaryBlock = { code: "hostile" | "short" | "long"; text: string };

/** Why Send is off for the text, or `null` when it may be pressed. */
export function summaryBlock(summary: string): SummaryBlock | null {
  if (unsafeText(summary, { allowLayout: true })) return { code: "hostile", text: "The text has a control or direction character. Remove it." };
  const n = summaryLength(summary);
  if (n < EXIT_SUMMARY_MIN) return { code: "short", text: `At least ${EXIT_SUMMARY_MIN} characters (${n} so far)` };
  if (n > EXIT_SUMMARY_MAX) return { code: "long", text: `At most ${EXIT_SUMMARY_MAX} characters (${n} so far)` };
  return null;
}

/** A retry of the same intent replays under the same key; a changed intent (binding or text) is a new key. */
export function exitFingerprint(binding: ExitReviewBinding, summary: string): string {
  return JSON.stringify([binding.workspaceId, binding.parentApprovalId, binding.expectedParentVersion, binding.projectionDigest, binding.deploymentId, summary.trim()]);
}

const KEY_SHAPE = /^[A-Za-z0-9._:-]{1,192}$/;
export function newExitKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const key = `paper_exit:${random}`;
  return KEY_SHAPE.test(key) ? key : `paper_exit:${Date.now().toString(16)}`;
}

/* ── what a settled answer must match ─────────────────────────────────────────── */

export type CaptureCheck = { ok: true; reviewId: string } | { ok: false; reason: string };

/**
 * A 2xx answer is shown as "requested" only when it is the answer to THIS request: a Paper exit capture, in the workspace and for
 * the deployment asked, naming the review it created. Anything else is an unreadable outcome (the request may have been recorded).
 */
export function checkCapture(capture: ReviewCapture, binding: ExitReviewBinding): CaptureCheck {
  if (capture.action !== "PAPER_EXIT_CREATE") return { ok: false, reason: "The answer is for another kind of review." };
  if (capture.workspace_id !== binding.workspaceId) return { ok: false, reason: "The answer is for another workspace." };
  const reviewId = capture.review_id;
  if (typeof reviewId !== "string" || reviewId !== capture.aggregate_id) return { ok: false, reason: "The answer does not name the review it created." };
  return { ok: true, reviewId };
}

/* ── status read back ─────────────────────────────────────────────────────────── */

export type ExitStatus =
  | { kind: "ok"; text: string; reviewId: string }
  | { kind: "mismatch"; reason: string };

/**
 * The review as the server now states it, for the line under the receipt: `0 of 2 approvers` (V1 quorum) or `Pending · 0 of 2 approvers` (V2
 * approval status). A read for another review, another workspace or another deployment is refused, not shown; a quorum the body does not
 * publish stays absent (never 0).
 */
export function exitStatusOf(read: GovernanceParentRead, expect: { reviewId: string; workspaceId: string; deploymentId: string }): ExitStatus {
  if (read.kind !== "exit") return { kind: "mismatch", reason: "The read is not a Paper exit review." };
  const body = read.read;
  if (body.kind === "unsupported") return { kind: "mismatch", reason: "The review could not be read." };
  if (body.kind === "v1") {
    const d = body.value;
    if (d.reviewId !== expect.reviewId) return { kind: "mismatch", reason: "The read is for another review." };
    if (d.workspaceId !== null && d.workspaceId !== expect.workspaceId) return { kind: "mismatch", reason: "The read is for another workspace." };
    if (d.deploymentId !== expect.deploymentId) return { kind: "mismatch", reason: "The review is for another deployment." };
    // The V1 read publishes the quorum, not a status word: no "Pending" is claimed from it.
    const quorum = d.quorumMet === null || d.quorumRequired === null ? "Approvers not published" : `${d.quorumMet} of ${d.quorumRequired} approvers`;
    return { kind: "ok", reviewId: d.reviewId, text: quorum };
  }
  const p = body.value;
  if (p.review.reviewId !== expect.reviewId) return { kind: "mismatch", reason: "The read is for another review." };
  if (p.header.workspaceId !== expect.workspaceId) return { kind: "mismatch", reason: "The read is for another workspace." };
  if (p.anchors.deploymentId !== expect.deploymentId) return { kind: "mismatch", reason: "The review is for another deployment." };
  const status = p.approval.status.replace(/_/g, " ").toLowerCase();
  const word = status.charAt(0).toUpperCase() + status.slice(1);
  return { kind: "ok", reviewId: p.review.reviewId, text: `${word} · ${p.approval.quorumMet} of ${p.approval.quorumRequired} approvers` };
}
