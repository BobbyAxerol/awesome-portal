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

import { useCallback, useMemo, useRef, useState } from "react";

import {
  type RunCreateRefusal,
  type RunCreateResponse,
  newClientIntentId,
  outcomeIsUnknown,
  runCreateApi,
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

export function useNewRun(
  initial: RunDraft,
  limits: DraftConstraints,
  workspaceId?: string,
): NewRunController {
  const [draft, setDraft] = useState<RunDraft>(initial);
  const [created, setCreated] = useState<RunCreateResponse | null>(null);
  const [createRefusal, setCreateRefusal] = useState<RunCreateRefusal | null>(null);
  const [pending, setPending] = useState(false);

  /** One id per submission attempt, reused by `recheck`. */
  const intentId = useRef<string | null>(null);

  const patch = useCallback((change: Partial<RunDraft>) => {
    setDraft((previous) => ({ ...previous, ...change }));
    /* A changed declaration invalidates a created run's relevance to the form,
       but never the run itself — so the receipt is cleared, not cancelled. */
    setCreated(null);
    setCreateRefusal(null);
    intentId.current = null;
  }, []);

  const requestedSpec = useMemo(() => serializeRequestedSpec(draft), [draft]);
  const blocking = useMemo(() => blockingProblems(draft, limits), [draft, limits]);

  /* The preflight container owns the token and drops it whenever the spec
     changes; this screen never holds a second copy of that rule. */
  const preflight = usePreflight(blocking.length === 0 ? requestedSpec : null, workspaceId);

  const mayCreateRun = preflight.preflight?.may_create_run === true;
  const canSubmit = preflight.preflight !== null && blocking.length === 0;

  const send = useCallback(() => {
    const token = preflight.preflight?.preflight_token;
    if (!token) return;
    if (intentId.current === null) intentId.current = newClientIntentId();

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
      })
      .then((response) => {
        setCreated(response);
        setPending(false);
      })
      .catch((error: unknown) => {
        const refusal = toRunCreateRefusal(error);
        setCreateRefusal(refusal);
        setPending(false);
        /* A dead preflight means a fresh one is owed before another attempt;
           the intent id goes with it, because it belonged to that preview. */
        if (refusal.invalidatesPreflight) intentId.current = null;
      });
  }, [preflight.preflight, requestedSpec, workspaceId]);

  const createState: ResearchState = pending
    ? researchState({ kind: "in-flight", hasAcceptedResponse: false })
    : createRefusal
      ? {
          state: createRefusal.state,
          reason: createRefusal.message,
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
