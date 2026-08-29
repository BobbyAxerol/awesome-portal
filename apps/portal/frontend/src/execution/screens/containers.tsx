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
import { useNavigate } from "react-router-dom";

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
import type { ReactNode } from "react";

import type { CapitalPreviewInput, ExecutionApi, InsightBatchInput, Result } from "../api/ports";
import type { CapitalLedger, InsightBatch } from "../analytics";
import { OrderFunnelStrip } from "./FullBlotter";
import { AdminActionDrawerScreen, type TierFilter } from "./AdminActionDrawer";
import { HeadroomBanner } from "./AccountBroker360";
import { CorrelationPanel } from "./PortfolioThreeSixty";
import {
  OperationsQueueScreen,
  TriagePanel,
  type QueueFilter,
} from "./OperationsQueue";
import { IncidentDetailScreen } from "./IncidentDetail";
import { SandboxCertificationScreen } from "./SandboxCertification";
import { CanaryControlRoomScreen } from "./CanaryControlRoom";
import { LiveFullOperationsScreen } from "./LiveFullOperations";
import { STAGE_SMOKE, stageVisuals } from "../stage.smoke";
import { CommandCenterScreen } from "./CommandCenter";
import { useCommandCentreStream } from "../commandCenterStream";
import type { CommandCenter } from "../commandCenter";
import type { SseFactory } from "../sse";
import { workflowEffectText, type QueueRow, type WorkflowResult } from "../operations";
import { PanelState } from "../components/states";
import { aggregateHeadroomFrom, envelopeFromAnalytics } from "../analytics";
import type { CatalogEntry } from "../adminCatalog";
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
import { ApprovalInbox, type ApprovalRow, type DecidedRow, type InboxCounts, type InboxFilter, type ApprovalGate } from "./ApprovalInbox";
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
export const INBOX_SCOPE_SORT = "sla_due_at:asc,approval_id:asc";

/**
 * One read, its four states, and nothing else.
 *
 * The four analytics screens each needed the same effect — set loading, call
 * the port, drop the answer if the component moved on, map ok/partial from the
 * warnings — and four copies of that is four places for the cancellation guard
 * to be forgotten. `deps` is explicit rather than derived from `read`, because
 * a closure changes identity every render and depending on it would re-fetch
 * forever.
 */
function useAnalyticsRead<T>(
  read: () => Promise<Result<T>>,
  deps: readonly unknown[],
): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>(loading);
  useEffect(() => {
    let cancelled = false;
    setState(loading);
    void read().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? {
              // Warnings mean the answer is real but incomplete. `partial`, not
              // `ok`: a screen that showed them as equal would let a gap in the
              // evidence read as evidence.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function ApprovalInboxContainer({
  api,
  onOpenRequest,
}: {
  api: ExecutionApi;
  onOpenRequest?: (id: string, gate: ApprovalGate) => void;
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
      decided?: KeysetPage<DecidedRow> | null;
      actor?: { username: string; roles: readonly string[] } | null;
      policyVersion?: string | null;
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
      onCopyProvenance={(full) => void navigator.clipboard?.writeText(full)}
      page={state.value?.page ?? EMPTY_PAGE}
      counts={state.value?.counts ?? null}
      policyVersion={state.value?.policyVersion ?? undefined}
      actor={state.value?.actor?.username}
      actorRoles={state.value?.actor?.roles}
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
      onOpenRequest={onOpenRequest ? (id, gate) => onOpenRequest(id, gate) : undefined}
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
  const [note, setNote] = useState("");
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
          // Passed through untouched. The reducer decides what a blocker means
          // for the walk; the container's job is not to lose it on the way.
          blockers: result.value.blockers,
          sourceSideEffectRequested: result.value.sourceSideEffectRequested,
        });
      });
    }, POLL_MS);
    return () => clearTimeout(id);
  }, [api, decision]);

  const decide = useCallback(
    async (
      verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION" | "REQUEST_CHANGES",
      reason: string,
      extra?: { conditions?: readonly TypedCondition[] },
    ) => {
      const detail = state.value;
      if (!detail) return;
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId,
        workspaceId: "default",
        decision: verdict,
        reason,
        // The schema refuses this decision without conditions, and refuses
        // conditions with any other — so they travel only where they belong.
        // Typed objects now, never a flattened sentence: the server checks each
        // for an owner, holds its expiry against its deadline and rejects
        // duplicates, and none of that survives being turned into prose.
        conditions: verdict === "APPROVE_WITH_CONDITION" ? (extra?.conditions ?? []) : [],
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
        trail={decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : undefined}
        note={note}
        onNoteChange={setNote}
        onCopyProvenance={(full) => void navigator.clipboard?.writeText(full)}
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
        onApprove={() => void decide("APPROVE", note.trim() || "Evidence reviewed and accepted.")}
        onDeny={() => void decide("DENY", note.trim() || "Evidence rejected.")}
        onRequestChanges={() => void decide("REQUEST_CHANGES", note.trim())}
        conditions={conditions}
        onAttachCondition={(condition) => setConditions((prior) => [...prior, condition])}
        onRequestCondition={() => {
          // The schema refuses APPROVE_WITH_CONDITION without a condition, and
          // the previous version sent none — so the one decision whose whole
          // meaning is the condition attached went out with nothing attached.
          const latest = conditions.at(-1);
          if (!latest) return;
          // Every condition the reviewer composed travels, not just the last
          // one flattened into a sentence. `latest` only gates the click.
          void decide("APPROVE_WITH_CONDITION", note.trim() || "Approved with a condition.", { conditions });
        }}
      />
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
          // Passed through untouched. The reducer decides what a blocker means
          // for the walk; the container's job is not to lose it on the way.
          blockers: result.value.blockers,
          sourceSideEffectRequested: result.value.sourceSideEffectRequested,
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
      extra?: { conditions?: readonly TypedCondition[]; workspaceId?: string },
    ) => {
      dispatch({ type: "PLAN_REQUESTED" });
      const planned = await api.planDecision({
        approvalId: subjectId,
        workspaceId: extra?.workspaceId ?? workspaceId,
        decision: verdict,
        reason,
        conditions: verdict === "APPROVE_WITH_CONDITION" ? (extra?.conditions ?? []) : [],
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
  const [note, setNote] = useState("");
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
    verdict: "APPROVE" | "DENY" | "APPROVE_WITH_CONDITION" | "REQUEST_CHANGES",
    reason: string,
    attached?: readonly TypedCondition[],
  ) =>
    void decide(approvalId, verdict, reason, d?.expectedVersion ?? null, {
      conditions: attached ?? [],
    });
  const served = preview && !("failed" in preview) ? preview : null;

  return (
    <>
      <GateR2Review
        trail={decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : undefined}
        note={note}
        onNoteChange={setNote}
        onCopyProvenance={(full) => void navigator.clipboard?.writeText(full)}
        approvalId={d?.approvalId ?? approvalId}
        subject={d?.subject ?? approvalId}
        r1Id={d?.r1Id ?? null}
        // Absent means MISSING, which blocks. A reference we could not read is
        // not a reference we may proceed on.
        r1State={d?.r1State ?? "MISSING"}
        // Before the detail arrives there is nothing to claim either way, so
        // the optimistic default stands and the loading state governs.
        r1LineagePublished={d?.r1LineagePublished ?? true}
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
        onApprove={() => run("APPROVE", note.trim() || "Operational readiness accepted.")}
        onRequestChanges={() => run("REQUEST_CHANGES", note.trim())}
        onDeny={() => run("DENY", note.trim() || "Operational readiness rejected.")}
        conditions={conditions}
        onAttachCondition={(condition) => setConditions((prior) => [...prior, condition])}
        onRequestCondition={() => {
          const latest = conditions.at(-1);
          if (!latest) return;
          run("APPROVE_WITH_CONDITION", note.trim() || "Approved with a condition.", conditions);
        }}
      />
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
        onCopyProvenance={(full) => void navigator.clipboard?.writeText(full)}
        trail={decision.phase !== "idle" ? <DecisionTrail decision={decision} /> : undefined}
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
    </>
  );
}

/* ---------------------------------------------------------------------------
 * The four analytics screens
 *
 * Each screen was reachable only by passing it props, which meant the port
 * method, the reader and the screen had never been joined anywhere — the join
 * is where a route typo or a mismapped state actually shows up.
 *
 * They stay on Lane A. These containers take an `api`, and the fixtures page
 * hands them the fixture port; nothing here mounts a product route or enables a
 * registry flag.
 * ------------------------------------------------------------------------ */

export function FullBlotterFunnelContainer({
  api,
  orderId,
}: {
  api: ExecutionApi;
  orderId: string;
}) {
  const state = useAnalyticsRead(() => api.getOrderFunnel(orderId), [api, orderId]);
  return (
    <OrderFunnelStrip
      funnel={state.value?.funnel ?? null}
      status={state.status}
      reason={state.reason}
    />
  );
}

export function AlphaInsightContainer({
  api,
  alphaId,
  request,
  render,
}: {
  api: ExecutionApi;
  alphaId: string;
  request: InsightBatchInput;
  /** The screen decides how a batch is drawn; this only supplies it. */
  render: (state: {
    batch: InsightBatch | null;
    envelope: AnalyticsEnvelope | null;
    status: PanelStatus;
    reason?: string;
  }) => ReactNode;
}) {
  // `request` is an object literal at most call sites, so a new identity every
  // render. Depending on it directly would re-fetch forever; the fields that
  // change the answer are the dependency.
  const itemKey = request.items.map((i) => `${i.insightId}:${i.alphaId}`).join(",");
  const state = useAnalyticsRead(
    () => api.getInsightBatch(alphaId, request),
    [api, alphaId, request.portfolioId, itemKey],
  );
  return (
    <>
      {render({
        batch: state.value?.batch ?? null,
        envelope: state.value?.envelope ?? null,
        status: state.status,
        reason: state.reason,
      })}
    </>
  );
}

/**
 * Concrete rather than a render prop.
 *
 * The first draft handed the parsed correlation to a callback so a screen could
 * decide how to draw it, and no screen ever did — the panel already exists and
 * already owns those decisions, including the leader lens and the cell budget.
 * A container whose only consumer is its own test is not a seam, it is an
 * unfinished bridge.
 */
export function CorrelationContainer({
  api,
  portfolioId,
}: {
  api: ExecutionApi;
  portfolioId: string;
}) {
  const [lensIndex, setLensIndex] = useState<number | null>(null);
  const state = useAnalyticsRead(() => api.getCorrelation(portfolioId), [api, portfolioId]);
  if (state.status !== "ok" && state.status !== "partial") {
    return <PanelState status={state.status} reason={state.reason} />;
  }
  return (
    <CorrelationPanel
      correlation={state.value?.correlation ?? null}
      envelope={state.value ? envelopeFromAnalytics(state.value.envelope) : undefined}
      lensIndex={lensIndex}
      onLensChange={setLensIndex}
    />
  );
}

export function CapitalLedgerContainer({
  api,
  portfolioId,
  render,
}: {
  api: ExecutionApi;
  portfolioId: string;
  render: (state: {
    ledger: CapitalLedger | null;
    envelope: AnalyticsEnvelope | null;
    status: PanelStatus;
    reason?: string;
  }) => ReactNode;
}) {
  const state = useAnalyticsRead(() => api.getCapitalLedger(portfolioId), [api, portfolioId]);
  return (
    <>
      {render({
        ledger: state.value?.ledger ?? null,
        envelope: state.value?.envelope ?? null,
        status: state.status,
        reason: state.reason,
      })}
    </>
  );
}

/*
 * `BindingExposureContainer` was here and is gone.
 *
 * It handed the parsed exposure to a render prop and nothing consumed it, while
 * `ExposureHeadroomContainer` below does the job the contract actually answers.
 * Two containers for one endpoint, one of them unused, is not a choice of
 * seams — it is one seam and one leftover.
 */

export function AdminCatalogueContainer({ api }: { api: ExecutionApi }) {
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [tier, setTier] = useState<TierFilter>("ALL");
  // `ALL` sends no filter at all rather than a sentinel the server would have
  // to know about. The chip is the client's word; the query is the contract's.
  const state = useAnalyticsRead(
    () => api.getCommandCatalogue(tier === "ALL" ? undefined : { riskTier: tier }),
    [api, tier],
  );
  return (
    <AdminActionDrawerScreen
      catalogue={state.value}
      status={state.status}
      reason={state.reason}
      selected={selected}
      onSelect={setSelected}
      tier={tier}
      onTierChange={(next) => {
        // The selection belongs to the previous result set; carrying it across
        // would leave a detail pane describing an entry no longer in the list.
        setSelected(null);
        setTier(next);
      }}
    />
  );
}

/**
 * The aggregate headroom banner, fed from the port.
 *
 * Narrow on purpose. `AccountBroker360` needs sync rows, linked accounts and a
 * policy that the exposure endpoint does not carry, so a container for the whole
 * screen would have to invent them. The banner is the part the exposure contract
 * actually answers, and it is the part that decides whether an operator places
 * an order — so it is the part worth wiring first.
 *
 * `aggregateHeadroomFrom` returns null unless every figure is present, and the
 * banner renders null as unavailable with its own reason. Nothing here computes
 * a verdict, and nothing falls back to summing the buckets when one is missing.
 */
export function ExposureHeadroomContainer({
  api,
  bindingId,
}: {
  api: ExecutionApi;
  bindingId: string;
}) {
  const state = useAnalyticsRead(() => api.getBindingExposure(bindingId), [api, bindingId]);
  const exposure = state.value?.exposure ?? null;
  const envelope = state.value?.envelope ?? null;
  const figures = aggregateHeadroomFrom(exposure?.aggregate ?? null);

  if (state.status !== "ok" && state.status !== "partial") {
    return <PanelState status={state.status} reason={state.reason} />;
  }
  return (
    <HeadroomBanner
      // Both or neither: a verdict without its envelope is an unattributed
      // claim about exposure, and this banner is the one place that must not
      // make one.
      aggregate={figures && envelope ? { ...figures, envelope: envelopeFromAnalytics(envelope) } : null}
      exposure={exposure}
    />
  );
}

/* ---------------------------------------------------------------------------
 * Phase 7 and 8
 * ------------------------------------------------------------------------ */

/**
 * The queue, its cursors and its triage.
 *
 * The cursor is held with the query it was issued against, exactly as the
 * inbox's is: changing the filter voids it, and sending a voided one asks the
 * server to page a list that no longer exists.
 */
export function OperationsQueueContainer({
  api,
  workspaceId = "default",
  now,
}: {
  api: ExecutionApi;
  workspaceId?: string;
  now?: Date;
}) {
  const [filter, setFilter] = useState<QueueFilter>("NEEDS_ATTENTION");
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [effect, setEffect] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const requestKey = useRef(newRequestKey());

  const triageState =
    filter === "NEEDS_ATTENTION" ? "UNACKNOWLEDGED" : filter === "MINE" ? undefined : undefined;

  const state = useAnalyticsRead(
    () =>
      api.listOperations({
        workspaceId,
        after: cursor.after,
        before: cursor.before,
        triageState,
      }),
    [api, workspaceId, cursor.after, cursor.before, triageState],
  );

  const queue = state.value;
  const roles = queue?.actorRoles ?? [];

  const runTriage = async (run: () => Promise<Result<WorkflowResult>>) => {
    setConflict(false);
    const result = await run();
    if (!result.ok) {
      // A `stale` result is the typed 409. Refresh and review; nothing here
      // retries, because the record the operator was looking at has moved.
      setConflict(result.status === "stale");
      setEffect(result.reason);
      return;
    }
    // The sentence is the server's, built from the flags it returned — never a
    // reassurance this file composed.
    setEffect(workflowEffectText(result.value));
    if (result.value.operation) setSelected(result.value.operation);
    // A replayed mutation returns the record that already existed. Reusing the
    // same request key is what makes that a replay rather than a second
    // operation, so the key is NOT regenerated here.
  };

  return (
    <>
      <OperationsQueueScreen
        queue={queue}
        status={state.status}
        reason={state.reason}
        filter={filter}
        now={now}
        onFilterChange={(next) => {
          // The cursor belongs to the previous query.
          setCursor({});
          setSelected(null);
          setFilter(next);
        }}
        onOpen={setSelected}
        selectedId={selected?.operationId ?? null}
        onLoadNext={
          queue?.page.hasMore && queue.page.nextCursor
            ? () => setCursor({ after: queue.page.nextCursor ?? undefined })
            : undefined
        }
        onLoadPrevious={
          queue?.page.hasPrevious && queue.page.prevCursor
            ? () => setCursor({ before: queue.page.prevCursor ?? undefined })
            : undefined
        }
        triage={selected ? (
        <TriagePanel
          row={selected}
          roles={roles}
          effectText={effect}
          conflict={conflict}
          onAcknowledge={(row) =>
            void runTriage(() =>
              api.acknowledgeOperation({
                operationId: row.operationId,
                workspaceId,
                requestKey: requestKey.current,
                expectedWorkflowVersion: row.workflowVersion ?? 0,
              }),
            )
          }
          onResolve={(row, reason, evidenceHash) =>
            void runTriage(() =>
              api.resolveOperation({
                operationId: row.operationId,
                workspaceId,
                requestKey: requestKey.current,
                expectedWorkflowVersion: row.workflowVersion ?? 0,
                reason,
                evidenceHash,
              }),
            )
          }
        />
      ) : null}
      />
    </>
  );
}

export function IncidentDetailContainer({
  api,
  incidentId,
  workspaceId,
}: {
  api: ExecutionApi;
  incidentId: string;
  workspaceId?: string;
}) {
  const navigateIncident = useNavigate();
  const state = useAnalyticsRead(
    () => api.getIncident(incidentId, workspaceId),
    [api, incidentId, workspaceId],
  );
  return (
    <IncidentDetailScreen
      // The route names the incident; the fixture's own id (inc_fixture_44)
      // is a fixture fact. The breadcrumb and the masthead must agree.
      incident={{ ...(state.value as NonNullable<typeof state.value>), incidentId }}
      status={state.status}
      reason={state.reason}
    onOpenOperation={(operationId) => navigateIncident(`/administration/actions?operation=${encodeURIComponent(operationId)}`)}
      />
  );
}

/* ---------------------------------------------------------------------------
 * Phase 10 and 11
 * ------------------------------------------------------------------------ */

export function SandboxCertificationContainer({
  api,
  deploymentId,
}: {
  api: ExecutionApi;
  deploymentId: string;
}) {
  const state = useAnalyticsRead(
    () => api.getSandboxCertification(deploymentId),
    [api, deploymentId],
  );
  return (
    <SandboxCertificationScreen
      certification={state.value}
      deploymentId={deploymentId}
      status={state.status}
      reason={state.reason}
      visuals={STAGE_SMOKE ? stageVisuals("sandbox") : undefined}
    />
  );
}

export function CanaryControlRoomContainer({
  api,
  deploymentId,
  brokerStale,
}: {
  api: ExecutionApi;
  deploymentId: string;
  /** The hi-fi's OK / STALE demo state. Drives the asymmetry, not the copy. */
  brokerStale?: boolean;
}) {
  const state = useAnalyticsRead(
    () => api.getCanaryControlRoom(deploymentId),
    [api, deploymentId],
  );
  return (
    <CanaryControlRoomScreen
      room={state.value}
      status={state.status}
      reason={state.reason}
      brokerStale={brokerStale}
      visuals={STAGE_SMOKE ? stageVisuals("canary") : undefined}
    />
  );
}

export function LiveFullOperationsContainer({
  api,
  deploymentId,
}: {
  api: ExecutionApi;
  deploymentId: string;
}) {
  const state = useAnalyticsRead(
    () => api.getLiveFullOperations(deploymentId),
    [api, deploymentId],
  );
  return (
    <LiveFullOperationsScreen live={state.value} status={state.status} reason={state.reason} visuals={STAGE_SMOKE ? stageVisuals("live") : undefined} />
  );
}

/**
 * The Command Centre with its subscription attached.
 *
 * `useCommandCentreStream` existed with no caller: the hook decided whether to
 * open a stream and the screen took a `live` prop, and nothing joined them, so
 * the screen's live branch could never receive state. A bridge built from one
 * bank is not a bridge, and the missing half is always the half nobody tests.
 *
 * Wiring it does not open anything. The hook refuses unless the snapshot says
 * `stream_available` — codex's stop gate — and refuses again unless a factory
 * is supplied, so the fixtures page passes `null` and provably connects
 * nothing while still exercising the composition.
 */
export function CommandCenterLive({
  snapshot,
  factory = null,
  fetchSnapshot,
}: {
  snapshot: CommandCenter;
  factory?: SseFactory | null;
  fetchSnapshot?: () => Promise<{ cursor: string; epoch: string; sequence: number; asOf?: string | null }>;
}) {
  const { live } = useCommandCentreStream({
    snapshot,
    factory,
    // Only ever called to recover from a gap, which requires an open stream.
    // Rejecting is honest: there is no snapshot endpoint behind a null factory,
    // and a resolved stub would hand the reducer an invented resume point.
    fetchSnapshot:
      fetchSnapshot ??
      (() => Promise.reject(new Error("no snapshot endpoint: this Command Centre has no stream"))),
  });
  const navigate = useNavigate();
  // Every ranked row links to its owning screen (HiFi 5a). The href is the
  // server's; a row without one renders disabled inside the screen.
  return <CommandCenterScreen snapshot={snapshot} live={live} onOpen={(item) => item.href && navigate(item.href)} />;
}
