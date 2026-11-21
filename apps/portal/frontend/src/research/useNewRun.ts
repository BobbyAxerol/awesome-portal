/**
 * Screen 02 container — declaration, preflight, create (P10).
 *
 * Holds the draft and the two server steps that turn it into a run. Three
 * rules from the P10 handoff live here rather than in the view:
 *
 *  - **`may_create_run` is display state, not a gate.** It says what the
 *    server published a moment ago; admission is re-evaluated atomically at
 *    submit, so a typed `FORBIDDEN` afterwards is a normal outcome and not a
 *    contradiction. The control is offered when the preflight is valid, and
 *    the published flag is shown beside it rather than used to hide it.
 *  - **Valid fields survive a refusal.** `ADAPTER_UNAVAILABLE` in particular
 *    must not silently downgrade rich route parameters to the fixed ones —
 *    that would submit something the reader never declared.
 *  - **An unknown outcome is not retried.** If the transport did not say
 *    whether the run exists, re-sending blindly is how one declaration becomes
 *    two runs. The same `client_intent_id` is kept so the server can answer
 *    `replayed`, and the screen asks the reader to check rather than retrying
 *    on its own.
 *
 * P11 owns progress. Nothing here fabricates a timer, a terminal state or a
 * worker status from a `202`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type RunCreateRefusal,
  type RunCreateResponse,
  newClientIntentId,
  outcomeIsUnknown,
  runCreateApi,
  runCreateRefusalFacts,
  toRunCreateRefusal,
} from "./runCreateClient";
import { type DraftConstraints, type RunDraft, blockingProblems, serializeRequestedSpec } from "./runDraft";
import { usePreflight } from "./usePreflight";
import { researchState, type ResearchState } from "./state";

export interface NewRunController {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;

  /** Exactly what preview, preflight and submit all use. */
  requestedSpec: ReturnType<typeof serializeRequestedSpec>;
  blocking: readonly { step: string; message: string }[];

  preflight: ReturnType<typeof usePreflight>;

  /** The server's published admission for this preview. Display only. */
  mayCreateRun: boolean;
  /** True once a valid preflight exists for the current declaration. */
  canSubmit: boolean;

  created: RunCreateResponse | null;
  createState: ResearchState;
  createRefusal: RunCreateRefusal | null;
  /** True when the run's existence is unknown and only a re-check is safe. */
  outcomeUnknown: boolean;

  submit: () => void;
  /** Re-sends the same intent so the server can answer `replayed`. */
  recheck: () => void;
}

/** W5a · P19: a Screen-07 what-if fork this draft was opened from. */
export interface SiblingLineage {
  relation: "SIBLING_OF";
  parent_run_id: string;
  what_if_cell_id: string;
}

/**
 * E13 · P19: the run a `?from=` draft was copied from.
 *
 * Declaring it is what gives the new attempt a `parent_attempt_id`, so
 * Screen 10 can nest it under its parent and show a diff. It changes nothing
 * about the submission itself — still a NEW intent, still a fresh preflight,
 * still its own digests.
 */
export interface CloneLineage {
  relation: "CLONE_OF";
  parent_run_id: string;
}

export type RunLineage = SiblingLineage | CloneLineage;

/**
 * What this draft may claim about where it came from.
 *
 * A what-if fork names its cell and wins — it is the more specific claim. A
 * plain `?from=` copy names only its parent, and only once the copy actually
 * landed: a read that failed copied nothing, and a draft the reader filled in
 * by hand has no parent to point at. Saying otherwise would write a lineage
 * edge the data cannot back, which is the same class of lie as a substituted
 * zero.
 */
export function runLineageFor(
  fork: { runId: string; cellId: string; ready: boolean } | null,
  clone: { runId: string; copied: boolean } | null,
): RunLineage | null {
  if (fork?.ready) {
    return { relation: "SIBLING_OF", parent_run_id: fork.runId, what_if_cell_id: fork.cellId };
  }
  if (clone?.copied) return { relation: "CLONE_OF", parent_run_id: clone.runId };
  return null;
}

export function useNewRun(
  initial: RunDraft,
  limits: DraftConstraints,
  workspaceId?: string,
  lineage?: RunLineage | null,
): NewRunController {
  const [draft, setDraft] = useState<RunDraft>(initial);
  const [created, setCreated] = useState<RunCreateResponse | null>(null);
  const [createRefusal, setCreateRefusal] = useState<RunCreateRefusal | null>(null);
  const [pending, setPending] = useState(false);

  /** One id per submission attempt, reused by `recheck`. */
  const intentId = useRef<string | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<object | null>(null);
  const mounted = useRef(true);
  const currentWorkspace = useRef(workspaceId);
  currentWorkspace.current = workspaceId;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);

  const patch = useCallback((change: Partial<RunDraft>) => {
    generation.current += 1;
    setDraft((previous) => ({ ...previous, ...change }));
    /* A changed declaration invalidates a created run's relevance to the form,
       but never the run itself — so the receipt is cleared, not cancelled. */
    setCreated(null);
    setCreateRefusal(null);
    intentId.current = null;
  }, []);

  const requestedSpec = useMemo(() => serializeRequestedSpec(draft), [draft]);
  const currentDeclaration = useRef(requestedSpec);
  currentDeclaration.current = requestedSpec;
  const blocking = useMemo(() => blockingProblems(draft, limits), [draft, limits]);

  /* The preflight container owns the token and drops it whenever the spec
     changes; this screen never holds a second copy of that rule. */
  const preflight = usePreflight(blocking.length === 0 ? requestedSpec : null, workspaceId);

  const mayCreateRun = preflight.preflight?.may_create_run === true;
  const canSubmit = preflight.preflight !== null && blocking.length === 0 && !pending;

  const send = useCallback(() => {
    const token = preflight.preflight?.preflight_token;
    if (!token || blocking.length !== 0 || activeRequest.current !== null || currentWorkspace.current !== workspaceId || currentDeclaration.current !== requestedSpec) return;
    if (intentId.current === null) intentId.current = newClientIntentId();
    const request = { generation: generation.current, token };
    activeRequest.current = request;
    const relevant = () => mounted.current && generation.current === request.generation && currentDeclaration.current === requestedSpec && currentWorkspace.current === workspaceId;

    setPending(true);
    setCreateRefusal(null);
    runCreateApi
      .create({
        schema_version: "research.run-create.v1",
        workspace_id: workspaceId,
        client_intent_id: intentId.current,
        preflight_token: token,
        requested_spec: requestedSpec,
        intent_kind: "NEW",
        ...(lineage ? { lineage } : {}),
      })
      .then((response) => {
        if (relevant()) setCreated(response);
      })
      .catch((error: unknown) => {
        if (!relevant()) return;
        const refusal = toRunCreateRefusal(error);
        setCreateRefusal(refusal);
        /* A dead preflight means a fresh one is owed before another attempt;
           the intent id goes with it, because it belonged to that preview. */
        if (refusal.invalidatesPreflight) intentId.current = null;
      })
      .finally(() => {
        if (activeRequest.current !== request) return;
        activeRequest.current = null;
        if (mounted.current) setPending(false);
      });
  }, [preflight.preflight, requestedSpec, workspaceId, lineage, blocking.length]);

  const createState: ResearchState = pending
    ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
    : createRefusal
      ? {
          state: createRefusal.state,
          /* FG-08 (A2b): client copy keyed by the typed code; the server's
             message is never rendered. Only typed facts go to `detail`. */
          reason: createRefusal.copy,
          detail: runCreateRefusalFacts(createRefusal),
          mayRetry: createRefusal.mayRetry,
          /* Nothing of the attempt is retained: the declaration is still on
             screen in the form, which is where the reader will fix it. */
          retainsContent: false,
        }
      : created
        ? researchState({ kind: "ok", rowCount: 1 })
        : {
            state: "empty",
            reason: "No run has been created from this declaration.",
            mayRetry: false,
            retainsContent: false,
          };

  return {
    draft,
    patch,
    requestedSpec,
    blocking,
    preflight,
    mayCreateRun,
    canSubmit,
    created,
    createState,
    createRefusal,
    outcomeUnknown: createRefusal !== null && outcomeIsUnknown(createRefusal),
    submit: send,
    recheck: send,
  };
}
