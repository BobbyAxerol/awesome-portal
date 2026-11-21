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
  const issuedWorkspace = useRef(workspaceId);
  const mounted = useRef(true);
  const activeRequest = useRef<object | null>(null);
  const context = useRef({ spec: requestedSpec, workspaceId, generation: 0 });
  /* Relevance changes synchronously with render, before a late promise can
     adopt the preceding declaration's token. Equal structural copies remain
     the same declaration; no client digest is invented. */
  if (!sameRequestedSpec(context.current.spec, requestedSpec) || context.current.workspaceId !== workspaceId) {
    context.current = { spec: requestedSpec, workspaceId, generation: context.current.generation + 1 };
  }
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; context.current.generation += 1; };
  }, []);

  /*
   * Any difference in the declaration drops the preview. This runs as an
   * effect rather than inside an onChange handler on purpose: the spec can
   * change from a reproduction, a deep link or a wizard patch, and a rule that
   * only fires on one of those paths is not a rule.
   */
  useEffect(() => {
    if (issuedFor.current === null) return;
    if (sameRequestedSpec(issuedFor.current, requestedSpec) && issuedWorkspace.current === workspaceId) return;
    issuedFor.current = null;
    setPreflight(null);
    setRefusal(null);
    setClearedBecause(SPEC_CHANGED_NOTE);
  }, [requestedSpec, workspaceId]);

  const fail = useCallback((error: unknown) => {
    const next = toPreflightRefusal(error);
    setRefusal(next);
    if (next.invalidatesToken) {
      issuedFor.current = null;
      setPreflight(null);
    }
  }, []);

  const loadPreflight = useCallback((load: () => Promise<PreflightResponse>) => {
    if (activeRequest.current !== null || context.current.workspaceId !== workspaceId || !sameRequestedSpec(context.current.spec, requestedSpec)) return;
    const request = { generation: context.current.generation };
    activeRequest.current = request;
    const relevant = () => mounted.current && context.current.generation === request.generation && context.current.workspaceId === workspaceId && sameRequestedSpec(context.current.spec, requestedSpec);
    setPending(true);
    setRefusal(null);
    setClearedBecause(null);
    load()
      .then((response) => {
        if (!relevant()) return;
        issuedFor.current = requestedSpec;
        issuedWorkspace.current = workspaceId;
        setPreflight(response);
      })
      .catch((error: unknown) => { if (relevant()) fail(error); })
      .finally(() => {
        if (activeRequest.current !== request) return;
        activeRequest.current = null;
        if (mounted.current) setPending(false);
      });
  }, [fail, requestedSpec, workspaceId]);

  const runPreflight = useCallback(() => {
    if (requestedSpec === null) return;
    /* The body carries the spec. The digest is the server's to derive. */
    loadPreflight(() => preflightApi.create({ workspace_id: workspaceId, requested_spec: requestedSpec }));
  }, [loadPreflight, requestedSpec, workspaceId]);

  const reopen = useCallback(
    (token: string) => loadPreflight(() => preflightApi.get(token, workspaceId)),
    [loadPreflight, workspaceId],
  );

  function panelState(): ResearchState {
    if (pending) return researchState({ kind: "in-flight", hasAcceptedResponse: false });
    if (refusal) {
      return {
        state: refusal.state,
        /* FG-08 (A2b): the client sentence for the typed code. The server's
           message stays on `refusal` for diagnostics and is never a reason. */
        reason: refusal.copy,
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
