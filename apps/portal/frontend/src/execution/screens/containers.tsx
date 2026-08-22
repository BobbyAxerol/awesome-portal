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

import {
  OPERATION_STATUSES,
  VERIFICATION_RESULTS,
  intentKey,
  newRequestKey,
  readEnum,
} from "../adapter";
import { readCursorFailure } from "../cursorFailure";
import { cursorStillValid, type CursorScope, type KeysetPage, type PanelStatus } from "../contracts";
import {
  decisionReducer,
  initialDecision,
  outstanding,
  shouldPoll,
  type DecisionState,
} from "../decision";
import type { CapitalPreviewInput, ExecutionApi } from "../api/ports";
import { capitalDeltasFromPreview } from "../api/rows";
import type { GateR1Detail, GateR2Detail, PaperExitDetail } from "../api/rows";
import type { AnalyticsEnvelope, CapitalPreview } from "../analytics";

/**
 * The preview is a third state, not a boolean.
 *
 * `null` is in flight, `{ failed }` is an engine that answered but not with a
 * preview, and the served shape is the only one that may drive a decision. A
 * two-state model would make "still loading" and "the engine refused" the same
 * thing on the panel where they must not be.
 */
type CapitalPreviewState =
  | null
  | { failed: string }
  | { preview: CapitalPreview; envelope: AnalyticsEnvelope };
import { stageRail } from "../components/lifecycle";
import type { TypedCondition } from "../components/conditions";
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

/**
 * The sort the inbox asks for, and the only one the server will honour.
 *
 * Exported so a test can hold it against the server's allowlist rather than
 * against a copy of itself.
 */
/**
 * Pull one lineage entry out as a rail chip.
 *
 * The lineage is a labelled list because it is rendered as one; the rail wants
 * two specific members of it, and matching on the label is how the payload
 * names them.
 */
function lineageChip(
  lineage: readonly { label: string; value: string; href: string | null }[] | undefined,
  label: string,
): { label: string; href?: string } | undefined {
  const found = lineage?.find((entry) => entry.label.toUpperCase() === label);
  return found ? { label: found.value, ...(found.href ? { href: found.href } : {}) } : undefined;
}

/**
 * One typed condition, rendered as the sentence the plan payload carries.
 *
 * The schema takes a single string today, and a typed condition is an owner, a
 * deadline and an expiry as well as its text. Flattening loses structure the
 * server cannot then enforce, so it is written out in full rather than reduced
 * to the text — and BR-EX-29 asks for `data.conditions[]` so the structure
 * survives the wire.
 */
function describeCondition(condition: {
  text: string;
  owner?: string | null;
  deadline?: string | null;
  expiresAt?: string | null;
}): string {
  const parts = [condition.text];
  if (condition.owner) parts.push(`owner ${condition.owner}`);
  if (condition.deadline) parts.push(`deadline ${condition.deadline}`);
  if (condition.expiresAt) parts.push(`expires ${condition.expiresAt}`);
  return parts.join(" · ");
}

export const INBOX_SCOPE_SORT = "sla_due_at:asc,approval_id:asc";

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
    // The server's own default. `sla_state` is not in its sort allowlist
    // (`governance/contracts.ts` sorts: sla_due_at, created_at, updated_at,
    // requester, approval_id), so claiming it in the cursor scope described a
    // query the server would never have run — and the cursor is scoped by the
    // sort, so the mismatch voids every page reference on the first real call.
    sort: INBOX_SCOPE_SORT,
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
      // A cursor the *server* rejected. The client-side check above only
      // catches scope changes it can see; an expired cursor, a rotated signing
      // key or an epoch cutover are refusals only the server knows about, and
      // keeping the rejected cursor in state re-sent it on every render — a
      // list stuck on an error it could have recovered from by asking for the
      // first page.
      // Three codes, three recoveries. The distinction that matters is
      // `preserveQuery`: a context mismatch means the workspace, filter or sort
      // changed, so the cursor addresses a population that is no longer on
      // screen and must never be replayed here. The other two are the same
      // query with an unusable bookmark.
      if (!result.ok && (after || before)) {
        const failure = readCursorFailure(result.reason);
        if (failure) {
          setCursorReset(failure.notice);
          setCursor({ scope: null });
        }
      }
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
  // Composed on the screen, held here, and sent with the plan. Approving with
  // a condition that never reaches the server is the decision failing to mean
  // the one thing it exists to mean.
  const [conditions, setConditions] = useState<readonly TypedCondition[]>([]);
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
    if (!shouldPoll(decision) || !decision.operationId) return;
    if (decision.polls >= MAX_POLLS) {
      // Say so. The panel used to sit on "Still observing" after the loop had
      // stopped, which is a screen claiming to be doing something it gave up
      // on — and the operation may well still be in flight.
      dispatch({ type: "POLL_BUDGET_EXHAUSTED" });
      return;
    }
    const id = setTimeout(() => {
      void api.pollOperation(decision.operationId as string).then((result) => {
        if (!result.ok) {
          dispatch({ type: "POLL_FAILED", error: result.reason });
          return;
        }
        dispatch({
          type: "POLLED",
          status: (() => {
            const parsed = readEnum(result.value.status, OPERATION_STATUSES);
            // A status this build does not recognise is not a status. It is
            // dropped rather than coerced, and the verification token below is
            // what the reducer actually walks on.
            return parsed?.known ? parsed.value : null;
          })(),
          // Narrowed, not asserted. `known: true` with an `as never` told the
          // reducer every token was recognised — including one this build has
          // never seen — which is exactly the guard `readEnum` exists to be.
          verification: readEnum(result.value.verificationRaw, VERIFICATION_RESULTS),
        });
      });
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [api, decision]);

  const decide = useCallback(
    async (
      verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION",
      reason: string,
      extra?: { condition?: string | null },
    ) => {
      const detail = state.value;
      if (!detail) return;
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId,
        workspaceId: "default",
        decision: verdict,
        reason,
        // The schema refuses this decision without a condition, and refuses a
        // condition with any other — so it travels only where it belongs.
        condition: verdict === "APPROVE_WITH_CONDITION" ? (extra?.condition ?? null) : null,
        expectedApprovalVersion: detail.expectedVersion,
        // Keyed by the intent, so a DENY after an APPROVE is a new command and
        // not an idempotent replay of the one before it (BR-EX-18).
        requestKey: intentKey(decisionRef.current.requestKey, approvalId, verdict, reason),
      });
      if (!planned.ok) {
        dispatch(
          planned.reason.includes("REQUEST_KEY_CONFLICT")
            ? { type: "PLAN_CONFLICT" }
            : { type: "PLAN_FAILED", error: planned.reason },
        );
        return;
      }
      dispatch({ type: "PLANNED", planId: planned.value.operationId });

      // A well-formed plan can still be un-appliable. Applying regardless was
      // the previous behaviour and it showed the reviewer "applying" for a
      // command the server had already refused to authorise.
      if (planned.value.blockers.length > 0 || !planned.value.applyToken) {
        dispatch({
          type: "PLAN_FAILED",
          error: planned.value.blockers.length
            ? `This plan cannot be applied: ${planned.value.blockers.map((b) => b.code).join(", ")}.`
            : "The server issued no apply token for this plan, so it cannot be applied.",
        });
        return;
      }
      dispatch({ type: "APPLY_REQUESTED" });

      const applied = await api.applyPlan(
        planned.value.operationId,
        planned.value.applyToken,
        "default",
      );
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
        creatorId={detail?.creatorId}
        actorId={detail?.actorId}
        decided={detail?.decided ?? null}
        status={state.status}
        reason={state.reason}
        partialReason={state.warnings.length ? state.warnings.join("; ") : undefined}
        onApprove={() => void decide("APPROVE", "Evidence reviewed and accepted.")}
        onDeny={() => void decide("DENY", "Evidence rejected.")}
        conditions={conditions}
        onAttachCondition={(condition) => setConditions((prior) => [...prior, condition])}
        onRequestCondition={() => {
          // The schema refuses APPROVE_WITH_CONDITION without a condition, and
          // the previous version sent none — so the one decision whose whole
          // meaning is the condition attached went out with nothing attached.
          const latest = conditions.at(-1);
          if (!latest) return;
          void decide(
            "APPROVE_WITH_CONDITION",
            "Approved with a condition.",
            { condition: describeCondition(latest) },
          );
        }}
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
  // Until a workspace reaches the client from the registry, one name that the
  // BFF will reject loudly rather than a guess it might accept quietly.
  const workspaceId = "default";

  useEffect(() => {
    if (!shouldPoll(decision) || !decision.operationId) return;
    if (decision.polls >= MAX_POLLS) {
      // Say so. The panel used to sit on "Still observing" after the loop had
      // stopped, which is a screen claiming to be doing something it gave up
      // on — and the operation may well still be in flight.
      dispatch({ type: "POLL_BUDGET_EXHAUSTED" });
      return;
    }
    const id = setTimeout(() => {
      void api.pollOperation(decision.operationId as string).then((result) => {
        if (!result.ok) {
          dispatch({ type: "POLL_FAILED", error: result.reason });
          return;
        }
        dispatch({
          type: "POLLED",
          status: (() => {
            const parsed = readEnum(result.value.status, OPERATION_STATUSES);
            // A status this build does not recognise is not a status. It is
            // dropped rather than coerced, and the verification token below is
            // what the reducer actually walks on.
            return parsed?.known ? parsed.value : null;
          })(),
          // Narrowed, not asserted. `known: true` with an `as never` told the
          // reducer every token was recognised — including one this build has
          // never seen — which is exactly the guard `readEnum` exists to be.
          verification: readEnum(result.value.verificationRaw, VERIFICATION_RESULTS),
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
      expectedApprovalVersion: number | null,
      extra?: { condition?: string | null; workspaceId?: string },
    ) => {
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId: subjectId,
        workspaceId: extra?.workspaceId ?? workspaceId,
        decision: verdict,
        reason,
        condition: extra?.condition ?? null,
        expectedApprovalVersion,
        // Per intent, not per container. One key reused across APPROVE and
        // DENY makes the second call an idempotent replay of the first: the
        // server answers with the original operation and the reviewer is told
        // their refusal succeeded when what was recorded was an approval.
        requestKey: intentKey(ref.current.requestKey, subjectId, verdict, reason),
      });
      if (!planned.ok) {
        dispatch(
          planned.reason.includes("REQUEST_KEY_CONFLICT")
            ? { type: "PLAN_CONFLICT" }
            : { type: "PLAN_FAILED", error: planned.reason },
        );
        return;
      }
      dispatch({ type: "PLANNED", planId: planned.value.operationId });

      // A plan may come back well-formed and un-appliable. Applying anyway was
      // the previous behaviour, and it turned a server's refusal into a request
      // the server then had to refuse a second time — after the reviewer had
      // been shown "applying".
      if (planned.value.blockers.length > 0 || !planned.value.applyToken) {
        dispatch({
          type: "PLAN_FAILED",
          error: planned.value.blockers.length
            ? `This plan cannot be applied: ${planned.value.blockers.map((b) => b.code).join(", ")}.`
            : "The server issued no apply token for this plan, so it cannot be applied.",
        });
        return;
      }

      dispatch({ type: "APPLY_REQUESTED" });
      const applied = await api.applyPlan(
        planned.value.operationId,
        planned.value.applyToken,
        extra?.workspaceId ?? workspaceId,
      );
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

export function GateR2ReviewContainer({
  api,
  approvalId,
  /**
   * What the preview is computed against.
   *
   * A prop rather than local state because the reviewer does not choose it
   * here — it arrives with the request — and the preview is re-requested
   * whenever it changes, which is what EX-BE-07a §2.2 asks for.
   *
   * It is a prop rather than a field of the R2 detail because the R2 review row
   * does not publish `portfolio_id` or `currency` yet, and the preview request
   * requires both. Recorded as a backend request rather than guessed from the
   * capital rows: inferring a portfolio from a currency label would be the
   * screen deciding which portfolio it is looking at.
   */
  preview: previewFor,
}: {
  api: ExecutionApi;
  approvalId: string;
  /**
   * Overrides the scope taken from the review row. Tests use it; screens do not.
   *
   * The default used to be the published fixture's literal — PF-1 / USDT /
   * 50.000000000000000001 — which the H2-hardened endpoint now rejects,
   * because the preview is bound to the approval's own immutable portfolio and
   * currency. Worse than the rejection: against a permissive server it would
   * have shown a reviewer capital figures for a portfolio and an amount nobody
   * had asked about.
   */
  preview?: CapitalPreviewInput;
}) {
  const [state, setState] = useState<LoadState<GateR2Detail>>(loading);
  const [conditions, setConditions] = useState<readonly TypedCondition[]>([]);
  const [preview, setPreview] = useState<CapitalPreviewState>(null);
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

  // Its own request, keyed on the amount. Folding it into the effect above
  // would refetch the whole review whenever the amount moved, and leaving it
  // out of the dependency list would show a preview for an amount the reviewer
  // has already changed — the second being the dangerous one.
  // Taken from the review row, which BR-EX-23 added `portfolio_id` and
  // `currency` to for exactly this. Absent means the request cannot be made —
  // not that a plausible default may be substituted.
  const previewScope: CapitalPreviewInput | null =
    previewFor ??
    (state.value?.portfolioId && state.value?.currency && state.value?.requestedAmount
      ? {
          portfolioId: state.value.portfolioId,
          currency: state.value.currency,
          requestedAmount: state.value.requestedAmount,
        }
      : null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    if (!previewScope) {
      setPreview({
        failed:
          "This review does not publish the portfolio, currency and amount the preview is computed against, so none can be requested.",
      });
      return;
    }
    void api.getCapitalPreview(approvalId, previewScope).then((result) => {
      if (cancelled) return;
      setPreview(result.ok ? result.value : { failed: result.reason });
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the fields, not the object: a caller passing a fresh literal
    // each render would otherwise re-request the preview on every render.
  }, [api, approvalId, previewScope?.portfolioId, previewScope?.requestedAmount, previewScope?.currency]);

  const d = state.value;
  const run = (
    verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION",
    reason: string,
    condition?: string,
  ) => void decide(approvalId, verdict, reason, d?.expectedVersion ?? null, { condition });
  const served = preview && !("failed" in preview) ? preview : null;

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
        capital={served ? capitalDeltasFromPreview(served.preview) : (d?.capital ?? [])}
        // The engine's own envelope, not one assembled here. The previous
        // placeholder asserted DERIVED authority and an unknown freshness for a
        // computation whose real metadata the response carries — an invented
        // attribution on the one panel that must never carry one.
        capitalEnvelope={
          served
            ? {
                authority: served.envelope.authority,
                asOf: served.envelope.inputAsOf,
                freshness: served.envelope.inputFreshnessFloor,
                formulaVersion: served.envelope.formulaVersion,
              }
            : undefined
        }
        eligibility={d?.eligibility}
        capitalReason={preview && "failed" in preview ? preview.failed : undefined}
        capitalDecidable={served ? served.preview.decisionEligible : undefined}
        capitalBlockers={served ? served.preview.blockers : undefined}
        grantName={d?.grantName ?? undefined}
        locks={d?.locks ?? []}
        status={state.status}
        reason={state.reason}
        partialReason={state.warnings.length ? state.warnings.join("; ") : undefined}
        onApprove={() => run("APPROVE", "Operational readiness accepted.")}
        onDeny={() => run("DENY", "Operational readiness rejected.")}
        conditions={conditions}
        onAttachCondition={(condition) => setConditions((prior) => [...prior, condition])}
        onRequestCondition={() => {
          const latest = conditions.at(-1);
          if (!latest) return;
          run("APPROVE_WITH_CONDITION", "Approved with a condition.", describeCondition(latest));
        }}
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
        eligibility={d?.eligibility}
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
        // The rail was built in phase 0 and DS §4 lists exit reviews among its
        // users, but the wired container never passed one — so a reviewer saw
        // the evidence for a promotion with no sight of what the deployment
        // had already cleared to get here. Built from the detail's own stage
        // and the R1/R2 the lineage names; omitted when the stage is
        // unpublished rather than assumed to be paper.
        rail={
          d?.stage
            ? stageRail({
                stage: d.stage,
                r1: lineageChip(d.lineage, "R1"),
                r2: lineageChip(d.lineage, "R2"),
              })
            : undefined
        }
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
