/**
 * Screen 02 preflight container (P08).
 *
 * Holds one token and the rule that keeps it honest: **a token belongs to the
 * exact spec it was issued for.** The moment the declaration on screen differs
 * from the declaration that was submitted, the held token and its result are
 * dropped, because a run built from a stale preview is a run nobody previewed.
 *
 * Nothing retries by itself. `EXPIRED`, `STALE` and `NOT_FOUND` drop the token
 * rather than resending it, and `UNAVAILABLE`/`REJECTED` are offered back to
 * the reader as retryable rather than being retried behind their back.
 *
 * The form is not owned here. P10 owns the authenticated producer wiring for
 * the eight-step declaration; this takes the requested spec as an input so the
 * same container works whether the spec comes from a wizard, a reproduction or
 * a fixture.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type PreflightRefusal,
  type PreflightResponse,
  type RequestedSpec,
  preflightApi,
  sameRequestedSpec,
  toPreflightRefusal,
} from "./preflightClient";
import { researchState, type ResearchState } from "./state";

export interface PreflightController {
  /** The server's preview, or null when none is held for the current spec. */
  preflight: PreflightResponse | null;
  /** Presentation state of the preflight panel's own request. */
  preflightState: ResearchState;
  refusal: PreflightRefusal | null;

  /** True while a request is in flight. */
  pending: boolean;
  /** True when the spec on screen has no valid preview. */
  needsPreflight: boolean;
  /** Why the previous preview was dropped, when it was dropped by an edit. */
  clearedBecause: string | null;

  runPreflight: () => void;
  /** Reopen an unchanged preview by its token. */
  reopen: (token: string) => void;
}

/** Shown when the held preview is dropped because the declaration changed. */
export const SPEC_CHANGED_NOTE =
  "The declaration changed after this preview was taken — run preflight again before creating a run.";

export function usePreflight(
  requestedSpec: RequestedSpec | null,
  workspaceId?: string,
): PreflightController {
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [refusal, setRefusal] = useState<PreflightRefusal | null>(null);
  const [pending, setPending] = useState(false);
  const [clearedBecause, setClearedBecause] = useState<string | null>(null);

  /** The exact spec the held token was issued for. Never sent anywhere. */
  const issuedFor = useRef<RequestedSpec | null>(null);

  /*
   * Any difference in the declaration drops the preview. This runs as an
   * effect rather than inside an onChange handler on purpose: the spec can
   * change from a reproduction, a deep link or a wizard patch, and a rule that
   * only fires on one of those paths is not a rule.
   */
  useEffect(() => {
    if (issuedFor.current === null) return;
    if (sameRequestedSpec(issuedFor.current, requestedSpec)) return;
    issuedFor.current = null;
    setPreflight(null);
    setRefusal(null);
    setClearedBecause(SPEC_CHANGED_NOTE);
  }, [requestedSpec]);

  const fail = useCallback((error: unknown) => {
    const next = toPreflightRefusal(error);
    setRefusal(next);
    if (next.invalidatesToken) {
      issuedFor.current = null;
      setPreflight(null);
    }
    setPending(false);
  }, []);

  const runPreflight = useCallback(() => {
    if (requestedSpec === null) return;
    setPending(true);
    setRefusal(null);
    setClearedBecause(null);
    /* The body carries the spec. The digest is the server's to derive. */
    preflightApi
      .create({ workspace_id: workspaceId, requested_spec: requestedSpec })
      .then((response) => {
        issuedFor.current = requestedSpec;
        setPreflight(response);
        setPending(false);
      })
      .catch(fail);
  }, [fail, requestedSpec, workspaceId]);

  const reopen = useCallback(
    (token: string) => {
      setPending(true);
      setRefusal(null);
      preflightApi
        .get(token, workspaceId)
        .then((response) => {
          /* A reopened preview is only usable for the spec on screen. If the
             two have drifted the metadata is still shown, but the token is not
             adopted as valid for this declaration. */
          issuedFor.current = requestedSpec;
          setPreflight(response);
          setPending(false);
        })
        .catch(fail);
    },
    [fail, requestedSpec, workspaceId],
  );

  function panelState(): ResearchState {
    if (pending) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
    if (refusal) {
      return {
        state: refusal.state,
        reason: refusal.message,
        mayRetry: refusal.mayRetry,
        /* An input-fault refusal keeps nothing on screen: the metadata it
           would retain describes a spec the server just rejected. */
        retainsContent: false,
      };
    }
    if (preflight) return researchState({ kind: "ok", rowCount: 1 });
    return {
      state: "empty",
      reason: clearedBecause ?? "No preflight has been run for this declaration.",
      mayRetry: false,
      retainsContent: false,
    };
  }

  return {
    preflight,
    preflightState: panelState(),
    refusal,
    pending,
    needsPreflight: preflight === null,
    clearedBecause,
    runPreflight,
    reopen,
  };
}
