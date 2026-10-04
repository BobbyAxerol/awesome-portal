/**
 * Screen 02 `?from=<runId>` — copy a run's admitted requested spec into a new
 * draft (CG-P11-07 read by W2, consumed here by W4).
 *
 * The request itself is W2's `progressApi.requestedSpec`; this module only
 * types the copied document and turns each refusal into the sentence the
 * form shows. A clone is always a NEW intent through a fresh preflight:
 * nothing here carries a token, a digest or the old run into the submission.
 */

import { PortalApiError } from "../lib/api";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { type RunRequestedSpec as GeneratedRunRequestedSpec, progressApi } from "./progressClient";
import type { RequestedSpec } from "./preflightClient";
import type { ResearchState } from "./state";

/**
 * The generated schema leaves `requested_spec` as an open object; the server
 * returns exactly the requested-spec document the run was admitted with.
 */
export type RunRequestedSpec = Omit<GeneratedRunRequestedSpec, "requested_spec"> & { requested_spec: RequestedSpec };

export async function readRunRequestedSpec(runId: string, signal?: AbortSignal, workspaceId?: string): Promise<RunRequestedSpec> {
  return (await progressApi.requestedSpec(runId, workspaceId, signal)) as unknown as RunRequestedSpec;
}

/** Copy for each typed refusal of the clone read; the form stays usable. */
export function cloneFailureState(runId: string, error: unknown): ResearchState {
  if (!(error instanceof PortalApiError)) {
    return { state: "failed-retryable", reason: `Could not reach the server to copy ${runId}.`, mayRetry: true, retainsContent: false };
  }
  if (error.status === 401) reportSessionExpired();
  /* FG-08: 403 and 404 read the same; the reader is not told which one it was. */
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return {
      state: "denied",
      reason: `Run ${runId} was not found in this workspace, or you cannot read its declaration — nothing was copied.`,
      mayRetry: false,
      retainsContent: false,
    };
  }
  if (error.status === 409) {
    return { state: "terminal", reason: `Run ${runId} exists but its requested spec is not retained — nothing was copied.`, mayRetry: false, retainsContent: false };
  }
  return {
    state: error.status >= 500 ? "unavailable" : "terminal",
    /* FG-08: client copy only; the server sentence is never rendered. */
    reason:
      error.status >= 500
        ? `The declaration of ${runId} is unavailable right now — nothing was copied.`
        : `The request to copy ${runId} was refused — nothing was copied.`,
    detail: [error.code, error.requestId ? `request ${error.requestId}` : null].filter(Boolean).join(" · ") || null,
    mayRetry: error.status >= 500,
    retainsContent: false,
  };
}
