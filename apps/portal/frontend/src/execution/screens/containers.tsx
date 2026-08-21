/**
 * Containers — where the port meets the screens.
 *
 * The screens themselves take props and know nothing about transport. These
 * components own the calls, and they exist now, before `EX-BE-05a`, because the
 * wiring is the part with the interesting mistakes in it: what a failure maps
 * to, when a 202 stops being interesting, whether a filter change discards a
 * cursor. Building that against `createFixtureApi` and swapping in
 * `createHttpApi` later is a one-line change; discovering it against a live
 * endpoint under time pressure is not.
 *
 * One rule runs through all of it: a `Result` that is not `ok` becomes a panel
 * state with the server's reason attached. It never becomes an empty list, and
 * it never becomes a thrown error the shell has to guess about.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { newRequestKey } from "../adapter";
import type { KeysetPage, PanelStatus } from "../contracts";
import {
  decisionReducer,
  initialDecision,
  outstanding,
  shouldPoll,
  type DecisionState,
} from "../decision";
import type { ExecutionApi } from "../api/ports";
import type { GateR1Detail } from "../api/rows";
import { ApprovalInbox, type ApprovalRow, type InboxCounts, type InboxFilter } from "./ApprovalInbox";
import { GateR1Review } from "./GateR1Review";

const EMPTY_PAGE: KeysetPage<ApprovalRow> = { rows: [], totalCount: 0 };

interface LoadState<T> {
  status: PanelStatus;
  reason?: string;
  value: T | null;
  warnings: readonly string[];
}

function loading<T>(): LoadState<T> {
  return { status: "loading", value: null, warnings: [] };
}

export function ApprovalInboxContainer({
  api,
  onOpenRequest,
}: {
  api: ExecutionApi;
  onOpenRequest?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<InboxFilter>("INBOX");
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const [state, setState] = useState<
    LoadState<{ page: KeysetPage<ApprovalRow>; counts: InboxCounts | null; inertCount?: number | null }>
  >(loading);

  useEffect(() => {
    let cancelled = false;
    setState(loading);
    void api.listApprovals({ filter, ...cursor }).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? {
              // A page that came back with mapping gaps is `partial`, not `ok`:
              // the rows are real, some were dropped, and the footer count will
              // say so by disagreeing with them.
              status: result.warnings?.length ? "partial" : "ok",
              value: result.value,
              warnings: result.warnings ?? [],
            }
          : { status: result.status, reason: result.reason, value: null, warnings: [] },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, filter, cursor]);

  const changeFilter = useCallback((next: InboxFilter) => {
    // A cursor is only meaningful inside the query that produced it. Carrying
    // one across a filter change would page through a list that no longer
    // exists.
    setCursor({});
    setFilter(next);
  }, []);

  return (
    <ApprovalInbox
      page={state.value?.page ?? EMPTY_PAGE}
      counts={state.value?.counts ?? null}
      inertCount={state.value?.inertCount ?? null}
      filter={filter}
      onFilterChange={changeFilter}
      status={state.status}
      reason={state.reason}
      partialReason={
        state.warnings.length
          ? `${state.warnings.length} row ${state.warnings.length === 1 ? "field" : "fields"} could not be read: ${state.warnings.join("; ")}.`
          : undefined
      }
      onOpenRequest={onOpenRequest ? (id) => onOpenRequest(id) : undefined}
      onLoadOlder={
        state.value?.page.nextCursor
          ? () => setCursor({ after: state.value?.page.nextCursor ?? undefined })
          : undefined
      }
      onLoadNewer={
        state.value?.page.prevCursor
          ? () => setCursor({ before: state.value?.page.prevCursor ?? undefined })
          : undefined
      }
    />
  );
}

/** Polling cadence. Bounded here so the reducer stays pure. */
const POLL_MS = 1_500;
const MAX_POLLS = 40;

export function GateR1ReviewContainer({ api, approvalId }: { api: ExecutionApi; approvalId: string }) {
  const [state, setState] = useState<LoadState<GateR1Detail>>(loading);
  const [decision, dispatch] = useReducer(decisionReducer, undefined, () =>
    initialDecision(newRequestKey()),
  );
  const decisionRef = useRef<DecisionState>(decision);
  decisionRef.current = decision;

  useEffect(() => {
    let cancelled = false;
    setState(loading);
    void api.getGateR1(approvalId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? {
              status: result.warnings?.length ? "partial" : "ok",
              value: result.value,
              warnings: result.warnings ?? [],
            }
          : { status: result.status, reason: result.reason, value: null, warnings: [] },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, approvalId]);

  // The poll loop. It stops on settled and on UNCERTAIN — the latter because
  // the ruling stops the automatic retry there, not because the question is
  // answered — and it stops at a bound so a stuck operation cannot poll for
  // ever.
  useEffect(() => {
    if (!shouldPoll(decision) || !decision.operationId || decision.polls >= MAX_POLLS) return;
    const id = setTimeout(() => {
      void api.pollOperation(decision.operationId as string).then((result) => {
        if (!result.ok) {
          dispatch({ type: "POLL_FAILED", error: result.reason });
          return;
        }
        dispatch({
          type: "POLLED",
          status: null,
          verification: result.value.verificationRaw
            ? { known: true, value: result.value.verificationRaw as never }
            : null,
        });
      });
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [api, decision]);

  const decide = useCallback(
    async (verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION", reason: string) => {
      const detail = state.value;
      if (!detail) return;
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId,
        decision: verdict,
        reason,
        expectedVersion: detail.expectedVersion,
        // The same key for every retry of this intent (BR-EX-18).
        requestKey: decisionRef.current.requestKey,
      });
      if (!planned.ok) {
        dispatch(
          planned.reason.includes("REQUEST_KEY_CONFLICT")
            ? { type: "PLAN_CONFLICT" }
            : { type: "PLAN_FAILED", error: planned.reason },
        );
        return;
      }
      dispatch({ type: "PLANNED", planId: planned.value.planId });
      dispatch({ type: "APPLY_REQUESTED" });

      const applied = await api.applyPlan(planned.value.planId, decisionRef.current.requestKey);
      if (!applied.ok) {
        dispatch({ type: "APPLY_FAILED", error: applied.reason });
        return;
      }
      // 202. The drawer does not close and nothing is called success.
      dispatch({ type: "APPLY_ACCEPTED", ...applied.value });
    },
    [api, approvalId, state.value],
  );

  const detail = state.value;

  return (
    <>
      <GateR1Review
        approvalId={detail?.approvalId ?? approvalId}
        alphaLabel={detail?.alphaLabel ?? approvalId}
        releaseCandidate={detail?.releaseCandidate ?? undefined}
        quorumMet={detail?.quorumMet ?? 0}
        quorumRequired={detail?.quorumRequired ?? 0}
        policyVersion={detail?.policyVersion ?? "unversioned"}
        creator={detail?.creator ?? "unknown"}
        actor={detail?.actor ?? "unknown"}
        sla={detail?.sla ?? undefined}
        passport={detail?.passport ?? []}
        checklist={detail?.checklist ?? []}
        locks={detail?.locks ?? []}
        eligibility={detail?.eligibility}
        decided={detail?.decided ?? null}
        status={state.status}
        reason={state.reason}
        partialReason={state.warnings.length ? state.warnings.join("; ") : undefined}
        onApprove={() => void decide("APPROVE", "Evidence reviewed and accepted.")}
        onDeny={() => void decide("DENY", "Evidence rejected.")}
        onRequestCondition={() => void decide("APPROVE_WITH_CONDITION", "Approved with a condition.")}
      />
      {decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : null}
    </>
  );
}

/**
 * The decision's own state, rendered beside the review rather than replacing it.
 *
 * It stays on screen for `uncertain` in particular. A drawer that closed on a
 * 202, or tidied itself away on an unresolved outcome, would leave the operator
 * with no trace of a command that may still be in flight.
 */
export function DecisionTrail({ decision }: { decision: DecisionState }) {
  return (
    <div className="exec-decision-trail" data-phase={decision.phase}>
      <span className="exec-decision-phase">{decision.phase.toUpperCase()}</span>
      {decision.operationId ? <span>operation {decision.operationId}</span> : null}
      {decision.receipt ? <span>receipt {decision.receipt}</span> : null}
      {decision.verification ? <span>verify {decision.verification}</span> : null}
      {decision.polls > 0 ? <span>{decision.polls} polls</span> : null}
      {decision.note ? <span className="exec-decision-note">{decision.note}</span> : null}
      {decision.error ? <span className="exec-decision-error">{decision.error}</span> : null}
      {outstanding(decision) ? (
        <span className="exec-decision-note">This command has not been confirmed.</span>
      ) : null}
    </div>
  );
}
