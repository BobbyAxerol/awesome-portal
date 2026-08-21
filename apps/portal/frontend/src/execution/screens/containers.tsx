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
import { cursorStillValid, type CursorScope, type KeysetPage, type PanelStatus } from "../contracts";
import {
  decisionReducer,
  initialDecision,
  outstanding,
  shouldPoll,
  type DecisionState,
} from "../decision";
import type { ExecutionApi } from "../api/ports";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "../api/rows";
import { ApprovalInbox, type ApprovalRow, type InboxCounts, type InboxFilter } from "./ApprovalInbox";
import { GateR1Review } from "./GateR1Review";
import { GateR2Review } from "./GateR2Review";
import { PaperExitReview, type ExitOutcome } from "./PaperExitReview";

const EMPTY_PAGE: KeysetPage<ApprovalRow> = { rows: [], totalCount: 0 };

/** Scale doc §3.2. Part of the cursor's scope, so changing it voids one. */
const PAGE_SIZE = 100;

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
  /**
   * A cursor and the query shape it was issued against, kept together.
   *
   * `EX-BE-04b`: "Changing filter, sort, limit, epoch, scope, resource or
   * cursor direction makes an old cursor fail closed." The server enforces
   * that. Tracking it here means a stale cursor is dropped *before* the request
   * rather than bounced after it, and — more importantly — that the reader is
   * told the page reset rather than watching it silently jump to the start.
   */
  const [cursor, setCursor] = useState<{
    after?: string;
    before?: string;
    scope: CursorScope | null;
  }>({ scope: null });
  const [cursorReset, setCursorReset] = useState<string | null>(null);
  const [state, setState] = useState<
    LoadState<{
      page: KeysetPage<ApprovalRow>;
      counts: InboxCounts | null;
      inertCount?: number | null;
      decided?: KeysetPage<ApprovalRow> | null;
    }>
  >(loading);

  // The query shape this render would issue a cursor against.
  const scope: CursorScope = {
    filter,
    sort: "sla_state:desc,approval_id:asc",
    limit: PAGE_SIZE,
    resource: "governance.approvals",
  };

  useEffect(() => {
    let cancelled = false;
    setState(loading);
    // Drop a cursor whose query no longer matches, rather than sending one the
    // server is contractually required to reject.
    const usable = cursorStillValid(cursor.scope, scope);
    const after = usable ? cursor.after : undefined;
    const before = usable ? cursor.before : undefined;
    if (!usable && (cursor.after || cursor.before)) {
      setCursorReset("The list changed, so the page reference no longer applies — showing the first page.");
    }
    void api.listApprovals({ filter, after, before, limit: PAGE_SIZE }).then((result) => {
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
  }, [api, filter, cursor, scope.limit, scope.sort, scope.resource]);

  const changeFilter = useCallback((next: InboxFilter) => {
    // A cursor is only meaningful inside the query that produced it. Carrying
    // one across a filter change would page through a list that no longer
    // exists. Reset silently here — the reader asked for the change, so telling
    // them the page reset would be narrating their own click.
    setCursor({ scope: null });
    setCursorReset(null);
    setFilter(next);
  }, []);

  return (
    <ApprovalInbox
      page={state.value?.page ?? EMPTY_PAGE}
      counts={state.value?.counts ?? null}
      inertCount={state.value?.inertCount ?? null}
      decided={state.value?.decided ?? null}
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
      cursorNotice={cursorReset}
      onDismissCursorNotice={() => setCursorReset(null)}
      onLoadOlder={
        state.value?.page.nextCursor
          ? () => {
              setCursorReset(null);
              setCursor({ after: state.value?.page.nextCursor ?? undefined, scope });
            }
          : undefined
      }
      onLoadNewer={
        state.value?.page.prevCursor
          ? () => {
              setCursorReset(null);
              setCursor({ before: state.value?.page.prevCursor ?? undefined, scope });
            }
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


/**
 * Gate R2 and Paper Exit share the container shape with Gate R1 rather than
 * inventing their own. The decision machine is the same one -- a governance
 * verdict is a plan/apply/poll like any other command, and a 202 means the same
 * thing on all three screens.
 */
function useDecision(api: ExecutionApi) {
  const [decision, dispatch] = useReducer(decisionReducer, undefined, () =>
    initialDecision(newRequestKey()),
  );
  const ref = useRef<DecisionState>(decision);
  ref.current = decision;

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
    async (
      subjectId: string,
      verdict: Parameters<ExecutionApi["planDecision"]>[0]["decision"],
      reason: string,
      expectedVersion: string | null,
    ) => {
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId: subjectId,
        decision: verdict,
        reason,
        expectedVersion,
        requestKey: ref.current.requestKey,
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
      const applied = await api.applyPlan(planned.value.planId, ref.current.requestKey);
      if (!applied.ok) {
        dispatch({ type: "APPLY_FAILED", error: applied.reason });
        return;
      }
      dispatch({ type: "APPLY_ACCEPTED", ...applied.value });
    },
    [api],
  );

  return { decision, decide };
}

export function GateR2ReviewContainer({ api, approvalId }: { api: ExecutionApi; approvalId: string }) {
  const [state, setState] = useState<LoadState<GateR2Detail>>(loading);
  const { decision, decide } = useDecision(api);

  useEffect(() => {
    let cancelled = false;
    setState(loading);
    void api.getGateR2(approvalId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: result.warnings?.length ? "partial" : "ok", value: result.value, warnings: result.warnings ?? [] }
          : { status: result.status, reason: result.reason, value: null, warnings: [] },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, approvalId]);

  const d = state.value;
  const run = (verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION", reason: string) =>
    void decide(approvalId, verdict, reason, d?.expectedVersion ?? null);

  return (
    <>
      <GateR2Review
        approvalId={d?.approvalId ?? approvalId}
        subject={d?.subject ?? approvalId}
        r1Id={d?.r1Id ?? null}
        // Absent means MISSING, which blocks. A reference we could not read is
        // not a reference we may proceed on.
        r1State={d?.r1State ?? "MISSING"}
        r1Href={d?.r1Href}
        r1Expiry={d?.r1Expiry}
        r1Digest={d?.r1Digest}
        r1DecidedBy={d?.r1DecidedBy}
        r1DecidedAt={d?.r1DecidedAt}
        deploymentCandidate={d?.deploymentCandidate ?? undefined}
        releaseCandidate={d?.releaseCandidate ?? undefined}
        artifactDigest={d?.artifactDigest ?? undefined}
        policyVersion={d?.policyVersion ?? "unversioned"}
        planAuthor={d?.planAuthor ?? "unknown"}
        actor={d?.actor ?? "unknown"}
        quorumMet={d?.quorumMet ?? 0}
        quorumRequired={d?.quorumRequired ?? 0}
        sla={d?.sla ?? undefined}
        readiness={d?.readiness ?? []}
        capital={d?.capital ?? []}
        capitalEnvelope={
          d
            ? { authority: "DERIVED", asOf: null, freshness: "UNKNOWN", formulaVersion: "capital.v2" }
            : undefined
        }
        grantName={d?.grantName ?? undefined}
        locks={d?.locks ?? []}
        status={state.status}
        reason={state.reason}
        partialReason={state.warnings.length ? state.warnings.join("; ") : undefined}
        onApprove={() => run("APPROVE", "Operational readiness accepted.")}
        onDeny={() => run("DENY", "Operational readiness rejected.")}
        onRequestCondition={() => run("APPROVE_WITH_CONDITION", "Approved with a condition.")}
      />
      {decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : null}
    </>
  );
}

export function PaperExitReviewContainer({ api, reviewId }: { api: ExecutionApi; reviewId: string }) {
  const [state, setState] = useState<LoadState<PaperExitDetail>>(loading);
  const { decision, decide } = useDecision(api);

  useEffect(() => {
    let cancelled = false;
    setState(loading);
    void api.getPaperExit(reviewId).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: result.warnings?.length ? "partial" : "ok", value: result.value, warnings: result.warnings ?? [] }
          : { status: result.status, reason: result.reason, value: null, warnings: [] },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [api, reviewId]);

  const d = state.value;

  return (
    <>
      <PaperExitReview
        reviewId={d?.reviewId ?? reviewId}
        deploymentId={d?.deploymentId ?? "unknown"}
        subject={d?.subject ?? reviewId}
        promoteTo={d?.promoteTo ?? "the next stage"}
        // Never inferred from the coverage numbers beside it: the policy can
        // require more than they show, and absent means unmet.
        gateMet={d?.gateMet ?? false}
        gateSummary={d?.gateSummary ?? undefined}
        policyId={d?.policyId ?? undefined}
        lineage={d?.lineage}
        quorumMet={d?.quorumMet ?? 0}
        quorumRequired={d?.quorumRequired ?? 0}
        approverRole={d?.approverRole ?? undefined}
        sla={d?.sla ?? undefined}
        panels={d?.panels ?? []}
        recommendation={d?.recommendation ?? undefined}
        status={state.status}
        reason={state.reason}
        partialReason={state.warnings.length ? state.warnings.join("; ") : undefined}
        onDecide={(outcome: ExitOutcome) =>
          void decide(reviewId, outcome, `Exit review decision: ${outcome}.`, d?.expectedVersion ?? null)
        }
      />
      {decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : null}
    </>
  );
}
