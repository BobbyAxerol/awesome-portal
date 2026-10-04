/** Generated named audit operations only. A browser never supplies source facts. */
import type { components, operations } from "../../../../../packages/contracts/generated/research-final-audit";
import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { withWorkspace } from "./runLinks";

export type LinkedAuditRead = components["schemas"]["Read"];
export type LinkedAuditCreate = operations["researchLinkedFinalAuditCreateV1"]["requestBody"]["content"]["application/json"];
export type LinkedAuditProof = components["schemas"]["VerifiedPinnedAudit"];

export const linkedAuditPath = (runId: string, workspaceId?: string): string =>
  withWorkspace(`/api/v1/quantbt/runs/${encodeURIComponent(runId)}/final-audit`, workspaceId);

async function call(runId: string, workspaceId?: string, signal?: AbortSignal, body?: LinkedAuditCreate): Promise<LinkedAuditRead> {
  const csrf = body ? csrfTokenFromCookie() : null;
  const response = await fetch(linkedAuditPath(runId, workspaceId), {
    method: body ? "POST" : "GET", credentials: "same-origin", signal,
    headers: body ? { "content-type": "application/json", ...(csrf ? { [CSRF_HEADER]: csrf } : {}) } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let code: string | null = null;
    let requestId = response.headers.get("x-request-id");
    try {
      const problem = await response.json() as Partial<components["schemas"]["Problem"]>;
      code = problem.error?.code ?? null;
      requestId = problem.request_id ?? requestId;
    } catch { /* HTTP refusal is still a fact; raw server prose is never UI copy. */ }
    if (response.status === 401) reportSessionExpired();
    throw new PortalApiError("Audit request refused.", response.status, code, requestId);
  }
  const read = await response.json() as LinkedAuditRead;
  // Guard identity/state at the consumer boundary; do not call a wrong-target receipt VERIFIED.
  if (read.schema_version !== "research.linked-final-audit.v1" || read.parent_run_id !== runId
    || !["READY_TO_ADMIT", "QUEUED", "RUNNING", "AWAITING_VERIFICATION", "VERIFIED", "FAILED", "CANCELLED"].includes(read.state)
    || read.profile_id !== "p23.delta-pinned-final-audit.v1"
    || read.profile_digest !== "457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491"
    || typeof read.may_create !== "boolean"
    || (read.state === "READY_TO_ADMIT" ? read.child_run_id !== null || read.progress_href !== null : typeof read.child_run_id !== "string")
    || !/^[a-f0-9]{64}$/.test(read.target_digest)
    || (body && read.target_digest !== body.target_digest)
    || (read.state === "VERIFIED") !== (read.verification !== null)
    || (read.verification && (read.verification.result.parent_run_id !== runId
      || read.verification.child_run_id !== read.child_run_id
      || read.verification.result.run_id !== read.child_run_id
      || read.verification.result.target_digest !== read.target_digest
      || read.verification.result.schema_version !== "research.pinned-selection-audit-result.v1"
      || read.verification.result.engine_release_id !== "er_quantbt_111"
      || read.verification.result.engine_version !== "1.1.1"
      || read.verification.result.optimizer_reinvoked !== false
      || read.verification.result.optimizer_trials !== 0))) {
    throw new PortalApiError("Audit response identity mismatch.", 502, "RESEARCH_FINAL_AUDIT_RESPONSE_MISMATCH", null);
  }
  return read;
}

export const linkedAuditApi = {
  /** researchLinkedFinalAuditGetV1: read only, no job allocation. */
  read: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call(runId, options.workspaceId, options.signal),
  /** researchLinkedFinalAuditCreateV1: explicit confirmed intent only. */
  create: (runId: string, body: LinkedAuditCreate, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call(runId, options.workspaceId, options.signal, body),
};

export interface LinkedAuditFailure { status: number; code: string | null; requestId: string | null; message: string; retryable: boolean }
export function linkedAuditFailure(error: unknown): LinkedAuditFailure {
  const status = error instanceof PortalApiError ? error.status : 0;
  const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
  return {
    status, code: error instanceof PortalApiError ? error.code : null,
    requestId: error instanceof PortalApiError ? error.requestId : null,
    retryable,
    message: status === 401 ? "Your session ended — sign in again."
      : status === 403 || status === 404 ? "Audit not available to this workspace and reader."
        : status === 409 ? "This source does not admit a linked audit of this selection."
          : retryable ? "Audit service is temporarily unavailable — no verification is inferred."
            : "Audit request was refused — review the request.",
  };
}
