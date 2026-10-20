/**
 * V2 reader for `governance.paper-exit-parent.v1` (RV-10 follow-up, Claude):
 * `GET /api/v1/execution/governance/paper-exit/parent?deployment_id=[&workspace_id=]`, operationId `executionPaperExitParentV1`.
 *
 * It answers one question, read-only: "which R2 review is the parent of this deployment's Paper exit request, and what is the
 * request bound to?". The body carries the SAME `capture_context` the R2 review publishes for the `PAPER_EXIT_CREATE` capture
 * (parent approval id and version, Paper projection digest, the accepted deployment choice), read by the existing
 * `readCaptureContext`, so the control binds through `bindExitReview` exactly as it would from the R2 review.
 *
 * - `NONE`: the deployment has no R2 review and there is no context. It is a published fact, not a failed read;
 * - `FOUND`: the context is for this workspace, is a `PAPER_EXIT_CREATE` context and lists only this deployment. It may be BLOCKED
 *   with a typed reason (not an administrator, R2 not approved, expired, projection stale...), which then words the shut control.
 *
 * Nothing here enables anything: the write route rechecks every pin and every authority. Closed keys; another `schema_version` is
 * `unsupported_shape`; a context that is invalid, absent or for another workspace, capture or deployment voids the read; never throws.
 */
import { readCaptureContext, type CaptureContext, type ContextRead } from "../../api/governanceContext";
import { closed, oneOf, plain, rec, type UnsupportedStatusShape } from "./commandCurrency";

export const PAPER_EXIT_PARENT_SCHEMA = "governance.paper-exit-parent.v1";
export const PAPER_EXIT_PARENT_PATH = "/api/v1/execution/governance/paper-exit/parent";
export const PAPER_EXIT_PARENT_STATES = ["NONE", "FOUND"] as const;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,192}$/;
const BODY_KEYS = [
  "schema_version", "record_authority", "workspace_id", "deployment_id", "state", "capture_context", "source_side_effect_requested",
] as const;

export interface PaperExitParent {
  workspaceId: string;
  deploymentId: string;
  state: (typeof PAPER_EXIT_PARENT_STATES)[number];
  /** `{ kind: "ok" }` exactly when `state` is FOUND; `{ kind: "absent" }` for NONE. */
  context: ContextRead<CaptureContext>;
}

export type PaperExitParentRead = { kind: "paper_exit_parent"; parent: PaperExitParent } | UnsupportedStatusShape;

function workspaceText(value: unknown): string | null {
  const text = plain(value, 96);
  return text !== null && text.length >= 3 ? text : null;
}

export function readPaperExitParentV1(raw: unknown): PaperExitParentRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== PAPER_EXIT_PARENT_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, BODY_KEYS);
  if (body === null) return null;
  const workspaceId = workspaceText(body.workspace_id);
  const deploymentId = typeof body.deployment_id === "string" && IDENTIFIER.test(body.deployment_id) ? body.deployment_id : null;
  const state = oneOf(body.state, PAPER_EXIT_PARENT_STATES);
  if (workspaceId === null || deploymentId === null || state === null || body.record_authority !== "PORTAL" || body.source_side_effect_requested !== false) return null;
  if (state === "NONE") return body.capture_context === null ? { kind: "paper_exit_parent", parent: { workspaceId, deploymentId, state, context: { kind: "absent" } } } : null;
  const context = readCaptureContext(body.capture_context);
  if (context.kind !== "ok") return null;
  const c = context.value;
  // The producer's cross-field rules, which the wire schema cannot say: this capture, this workspace, only this deployment.
  if (c.action !== "PAPER_EXIT_CREATE" || c.workspaceId !== workspaceId || c.candidates.some((candidate) => candidate.deploymentId !== deploymentId)) return null;
  return { kind: "paper_exit_parent", parent: { workspaceId, deploymentId, state, context } };
}

export interface PaperExitParentQuery {
  deploymentId: string;
  workspaceId?: string;
}

/** The request URL, or `null` when the server would refuse the query (a deployment id outside the identifier grammar, a malformed workspace). */
export function paperExitParentUrl(query: PaperExitParentQuery): string | null {
  if (!IDENTIFIER.test(query.deploymentId)) return null;
  const parts = [`deployment_id=${encodeURIComponent(query.deploymentId)}`];
  if (query.workspaceId !== undefined && query.workspaceId !== "") {
    if (workspaceText(query.workspaceId) === null) return null;
    parts.push(`workspace_id=${encodeURIComponent(query.workspaceId)}`);
  }
  return `${PAPER_EXIT_PARENT_PATH}?${parts.join("&")}`;
}

/** True when the body answers THIS question: the same deployment and, when a workspace was named, the same workspace. */
export function paperExitParentAnswers(parent: PaperExitParent, query: PaperExitParentQuery): boolean {
  if (parent.deploymentId !== query.deploymentId) return false;
  return query.workspaceId === undefined || query.workspaceId === "" || parent.workspaceId === query.workspaceId;
}
