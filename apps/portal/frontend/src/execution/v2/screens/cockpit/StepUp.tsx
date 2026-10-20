/**
 * The step-up block of a cockpit control (FE-015/060, BE-P7): reads ONE row of the self-eligibility batch and, only when the rules in
 * `stepUp.ts` say a password re-check can be started, offers it.
 *
 * What it never does:
 * - enable anything. It prints a sentence and, for `reauth`, one password field and one Confirm button. The control it sits beside
 *   keeps its own reason; a 200 from the step-up route does not turn it on;
 * - infer `ACTIVE`. After a 200 it RE-READS the batch and prints whatever that says;
 * - keep the password. The field is cleared at the moment of submit; the typed value goes to `api.postSessionStepUp` as an argument
 *   and nowhere else (not state, not a URL, not a log, not storage, not another request);
 * - act on a late answer. Every read and every submit belongs to a scope (workspace, environment, resource, action) and a generation;
 *   an answer that arrives after the scope changed or the block unmounted is dropped;
 * - accept a proof for another family than the one asked.
 */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { formatAsOf, readAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { AccessEnvironment, AccessResourceKind } from "../../readers/accessEffective";
import type { EligibilityAction } from "../../readers/accessSelf";
import { batchResult, eligibilityBatchAnswers, type BatchEligibilityRow, type BatchSessionStepUp } from "../../readers/accessSelfBatch";
import { accessStepUpAnswers } from "../../readers/accessStepUp";
import { STEP_UP_COPY, stepUpOffer, stepUpRefusalText } from "./stepUp";

export interface StepUpBlockProps {
  api: Pick<ExecutionApi, "getSelfEligibilityBatch" | "postSessionStepUp">;
  workspaceId: string;
  environment: AccessEnvironment;
  resource: { kind: AccessResourceKind; id: string };
  action: EligibilityAction;
  /** Test seam: how an end time is printed. */
  format?: (ms: number) => string;
}

type Read =
  | { phase: "loading" }
  | { phase: "unread" }
  | { phase: "ready"; row: BatchEligibilityRow | undefined; session: BatchSessionStepUp };

type Attempt = { phase: "idle" } | { phase: "pending" } | { phase: "failed"; text: string };

function defaultFormat(ms: number): string {
  const at = readAsOf(ms);
  return at === null ? `${ms}` : formatAsOf(at);
}

export function StepUpBlock({ api, workspaceId, environment, resource, action, format = defaultFormat }: StepUpBlockProps) {
  const fieldId = useId();
  const [read, setRead] = useState<Read>({ phase: "loading" });
  const [attempt, setAttempt] = useState<Attempt>({ phase: "idle" });
  const [password, setPassword] = useState("");
  // The scope the block is for. It changes the generation; anything started under an older generation is dropped when it answers.
  const scopeKey = `${workspaceId}\u0000${environment}\u0000${resource.kind}\u0000${resource.id}\u0000${action}`;
  const generation = useRef(0);
  const readSeq = useRef(0);
  const pending = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;

  const ask = useCallback(() => {
    const mine = generation.current;
    const seq = ++readSeq.current;
    const request = { workspaceId, environment, resources: [resource], actions: [action] } as const;
    void apiRef.current
      .getSelfEligibilityBatch(request)
      .then((result) => {
        if (mine !== generation.current || seq !== readSeq.current) return; // a scope that has gone, or an older read
        if (!result.ok || result.value.kind !== "eligibility_batch" || !eligibilityBatchAnswers(result.value.batch, request)) {
          setRead({ phase: "unread" });
          return;
        }
        const batch = result.value.batch;
        setRead({ phase: "ready", row: batchResult(batch, resource.kind, resource.id)?.actions.find((row) => row.action === action), session: batch.sessionStepUp });
      })
      .catch(() => {
        if (mine === generation.current && seq === readSeq.current) setRead({ phase: "unread" });
      });
    // The scope key carries every input of the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  useEffect(() => {
    generation.current += 1;
    pending.current = false;
    setRead({ phase: "loading" });
    setAttempt({ phase: "idle" });
    setPassword("");
    ask();
    return () => {
      generation.current += 1; // leaving the scope or unmounting: nothing started here may land
      pending.current = false;
    };
  }, [scopeKey, ask]);

  const offer = read.phase === "ready" ? stepUpOffer(read.row, read.session) : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (offer === null || offer.kind !== "reauth" || pending.current || password === "") return;
    const family = offer.family;
    const typed = password;
    setPassword(""); // the request below holds what it needs; a populated field would be a credential in the DOM
    pending.current = true;
    setAttempt({ phase: "pending" });
    const mine = generation.current;
    void apiRef.current
      .postSessionStepUp({ workspaceId, family, password: typed })
      .then((outcome) => {
        if (mine !== generation.current) return; // late: the scope changed while the server was thinking
        pending.current = false;
        if (outcome.kind === "refused") {
          setAttempt({ phase: "failed", text: stepUpRefusalText(outcome.code) });
          ask(); // the precondition may be gone: show what the batch says now
          return;
        }
        if (outcome.kind === "unavailable") {
          setAttempt({ phase: "failed", text: STEP_UP_COPY.notCompleted });
          return;
        }
        if (!accessStepUpAnswers(outcome.stepUp, family)) {
          setAttempt({ phase: "failed", text: STEP_UP_COPY.wrongFamily });
          return;
        }
        setAttempt({ phase: "idle" });
        ask(); // a 200 is not an ACTIVE row: read the batch again and print what it says
      })
      .catch(() => {
        if (mine !== generation.current) return;
        pending.current = false;
        setAttempt({ phase: "failed", text: STEP_UP_COPY.notCompleted });
      });
  };

  const isPending = attempt.phase === "pending";
  const status =
    read.phase === "loading"
      ? "Reading"
      : read.phase === "unread"
        ? STEP_UP_COPY.unread
        : offer !== null && offer.kind === "none"
          ? offer.why === "ACTIVE"
            ? STEP_UP_COPY.activeUntil(offer.activeUntilMs === null ? "an end time that was not published" : format(offer.activeUntilMs))
            : offer.text
          : STEP_UP_COPY.needsRecheck;

  return (
    <div className="exec-ck-stepup" role="group" aria-label="Step-up confirmation" data-stepup={offer === null ? read.phase : offer.kind === "reauth" ? "reauth" : offer.why}>
      <Flag kind="approval" label="Step-up" size="sm" />
      <p role="status">{status}</p>
      {offer !== null && offer.kind === "reauth" ? (
        <form className="exec-ck-stepup-form" onSubmit={submit}>
          <label className="exec-ck-label" htmlFor={fieldId}>{STEP_UP_COPY.passwordLabel}</label>
          <input
            id={fieldId}
            className="exec-ck-input"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isPending}
          />
          <button
            type="submit"
            className="exec-ck-stepup-go"
            disabled={isPending || password === ""}
            title={isPending ? STEP_UP_COPY.withServer : password === "" ? STEP_UP_COPY.enterFirst : undefined}
          >
            {isPending ? STEP_UP_COPY.checking : STEP_UP_COPY.confirm}
          </button>
        </form>
      ) : null}
      {attempt.phase === "failed" ? <p role="alert" className="exec-ck-stepup-failed">{attempt.text}</p> : null}
    </div>
  );
}
