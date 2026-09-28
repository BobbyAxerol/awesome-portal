/**
 * P22 · Alpha-version publication lookup (`researchAlphaVersionPublicationGetV1`),
 * used on Screen 01 (the rc chip) and Screen 02 ("last published rc").
 *
 * The Codex P22 closeout (`upgrade/research_loop/evidence/P22/frontend-handoff-codex-closeout.md`)
 * places this read on both screens. The server answers with the latest
 * delivered publication of one Alpha version, or a typed absence
 * (`availability: NOT_PUBLISHED` with its `reason_code`). The browser:
 *
 *  - asks once per Alpha version it is showing, and never polls;
 *  - never lists or scans release candidates, and never calls a mirror or
 *    reconcile route (there are none);
 *  - prints the server's strings as sent: `candidate_relation`, the raw
 *    `approval.status` and, separately, `effective_status`;
 *  - never renders the server's `error.message`. On a refusal it shows its own
 *    words, and 403 and 404 read the same (audit F-04). A `401` goes to the
 *    shell's Frame 01D sign-in path (`reportSessionExpired`), like every other
 *    Research read.
 */

import { useEffect, useState } from "react";

import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import {
  alphaVersionPublicationPath,
  releaseCandidateApi,
  type RcAlphaVersionPublication,
  type RcPublication,
} from "./releaseCandidateClient";
import { REFUSAL_COPY } from "./researchRefusal";

export type AlphaVersionPublication = RcAlphaVersionPublication;
export type AlphaVersionPublicationRecord = RcPublication;

/* The request itself lives in the Screen 11 client, the one Research module
   allowed to reach this API family (researchBoundary allowlist). */
export { alphaVersionPublicationPath };

/** `researchAlphaVersionPublicationGetV1`. A refusal carries only status, code and request id, never the server's prose. */
export function readAlphaVersionPublication(
  alphaVersionId: string,
  options: { workspaceId?: string; signal?: AbortSignal } = {},
): Promise<AlphaVersionPublication> {
  return releaseCandidateApi.alphaVersionPublication(alphaVersionId, options);
}

export type AlphaVersionPublicationFailureState = "session" | "denied" | "unavailable" | "terminal";

export type AlphaVersionPublicationView =
  | { state: "loading" }
  | { state: "available"; read: AlphaVersionPublication }
  | { state: AlphaVersionPublicationFailureState; status: number; code: string | null; requestId: string | null };

/** The screen's own words for a refused lookup. 403 and 404 share one sentence (F-04). */
export const ALPHA_VERSION_PUBLICATION_WORDS: Record<AlphaVersionPublicationFailureState, string> = {
  session: REFUSAL_COPY.session,
  denied: REFUSAL_COPY.denied,
  unavailable: "the publication lookup did not answer",
  terminal: "the publication lookup was refused as invalid",
};

/** Pure: status → state. 401 session, 403/404 denied, no answer/408/429/5xx unavailable, the rest terminal. */
export function alphaVersionPublicationFailure(error: unknown): Exclude<AlphaVersionPublicationView, { state: "loading" | "available" }> {
  if (!(error instanceof PortalApiError)) return { state: "unavailable", status: 0, code: null, requestId: null };
  const { status, code, requestId } = error;
  const state: AlphaVersionPublicationFailureState =
    status === 401
      ? "session"
      : status === 403 || status === 404
        ? "denied"
        : status === 408 || status === 429 || status >= 500
          ? "unavailable"
          : "terminal";
  return { state, status, code, requestId };
}

/**
 * One lookup per distinct Alpha version id, in the order given. An id that
 * leaves the list is dropped. Nothing is re-read on a timer. The map has no
 * entry until the first render after an id appears; callers treat a missing
 * entry as loading.
 */
export function useAlphaVersionPublications(
  alphaVersionIds: readonly string[],
  options: { workspaceId?: string } = {},
): ReadonlyMap<string, AlphaVersionPublicationView> {
  const { workspaceId } = options;
  const key = [...new Set(alphaVersionIds)].join("\u0000");
  const [views, setViews] = useState<ReadonlyMap<string, AlphaVersionPublicationView>>(() => new Map());

  useEffect(() => {
    const ids = key === "" ? [] : key.split("\u0000");
    if (ids.length === 0) {
      setViews((prior) => (prior.size === 0 ? prior : new Map()));
      return;
    }
    let stopped = false;
    const controller = new AbortController();
    setViews(new Map(ids.map((id) => [id, { state: "loading" } as const])));
    for (const id of ids) {
      readAlphaVersionPublication(id, { workspaceId, signal: controller.signal })
        .then((read): AlphaVersionPublicationView => ({ state: "available", read }))
        .catch((error: unknown): AlphaVersionPublicationView => alphaVersionPublicationFailure(error))
        .then((view) => {
          if (stopped || controller.signal.aborted) return;
          if (view.state === "session") reportSessionExpired();
          setViews((prior) => new Map(prior).set(id, view));
        });
    }
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [key, workspaceId]);

  return views;
}

/** The mirror's approval status words when no approval body was read (`approval_read`). */
export const APPROVAL_READ_WORDS: Record<AlphaVersionPublicationRecord["approval_read"], string> = {
  AVAILABLE: "approval read",
  NOT_PUBLISHED: "approval not published",
  DENIED: "approval not readable with your access",
  NOT_FOUND: "approval not found in the governance store",
  UNAVAILABLE: "approval read did not answer",
};

/** The raw Governance status when the approval was read, otherwise the read's own words. Never a guessed status. */
export function approvalStatusWords(publication: AlphaVersionPublicationRecord): { raw: string | null; words: string } {
  if (publication.approval_read === "AVAILABLE" && publication.approval !== null) {
    return { raw: publication.approval.status, words: publication.approval.status };
  }
  return { raw: null, words: APPROVAL_READ_WORDS[publication.approval_read] };
}
