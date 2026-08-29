/**
 * Phase 1 — Approval Inbox (hi-fi 4a), UI states only.
 *
 * Lane A: this renders from props and fixtures. Real integration waits on
 * `EX-BE-04a` (keyset over control-plane PostgreSQL) and `EX-BE-05a`
 * (governance workflow), neither of which needs the Rust edge, AWS, or the
 * Trading System — which is why this screen can be finished ahead of them and
 * wired with a mapping rather than a redesign.
 *
 * Three things this screen must get right, all of them about honesty rather
 * than layout:
 *
 *   1. **A row you cannot approve still appears.** Separation of duties makes
 *      some requests un-actionable by the current actor. Hiding them would make
 *      the queue lie about its own size and leave a request nobody sees is
 *      stuck. It is dimmed and labelled, never filtered out.
 *   2. **The counts are the server's.** `5 PENDING · 1 overdue` describes the
 *      whole queue, not the loaded page (mechanism M7).
 *   3. **A pending approval and a decided one are different lists.** The hi-fi
 *      puts "Recently decided" in its own section for a reason: a decided
 *      request in the pending table would be an action item that is not one.
 */
import type { ReactNode } from "react";

import { slaOverdue, type ApprovalId, type KeysetPage, type PanelStatus, type Sla } from "../contracts";
import { StatusChip } from "../components/badges";
import { SlaCell } from "../components/evidence";
import { KeysetTable, type Column } from "../components/table";
import { PanelState } from "../components/states";
import { preciseAge, useInboxTick } from "../approvalInbox.smoke";

/** The gate a request is asking to pass. Portal-owned workflow vocabulary. */
export type ApprovalGate = "R1" | "R2" | "PAPER_EXIT" | "SANDBOX_EXIT" | "LIVE_GATE";

/**
 * Why this actor cannot act on a row.
 *
 * `SELF` is separation of duties — the actor created the artifact. `QUORUM` is
 * waiting for someone else. `BLOCKED` is an unmet precondition on the request
 * itself. Three different reasons a row is inert, and an operator responds to
 * each differently, so they are three values rather than one `disabled` flag.
 */
export type InertReason = "SELF" | "QUORUM" | "BLOCKED";

export interface ApprovalRow {
  id: ApprovalId;
  gate: ApprovalGate;
  /** `Carry v3.2 → PF-MAIN` */
  subject: string;
  /** `paper · BINANCE` */
  target: string;
  /** Server-counted, with the leading blocker named. */
  blockerCount: number;
  blockerSummary: string | null;
  sla: Sla;
  /** `null` when unpublished — never 0, which claims nobody has approved. */
  quorumMet: number | null;
  quorumRequired: number | null;
  /** Absent when the actor can act on this row. */
  inert: InertReason | null;
  needsYou: boolean;
}

/**
 * One row of `governance.approval-history.v1` — the decided list.
 *
 * A decided approval is not a pending one wearing a decision: its columns are
 * outcome, decider and time, and its sort is `decided_at desc`. Reusing the
 * pending row shape squeezed the outcome into `blocker_summary`, which is how
 * "approved with conditions" ended up in a column titled blockers.
 */
export interface DecidedRow {
  id: ApprovalId;
  gate: ApprovalGate;
  subject: string;
  outcome: "APPROVED" | "APPROVED_WITH_CONDITION" | "DENIED" | "CHANGES_REQUESTED";
  decidedBy: string;
  /** ISO timestamp, date part printed. */
  decidedAt: string;
  policyVersion: string | null;
}

export interface InboxCounts {
  /** Whole queue, from the server. */
  pending: number;
  /** `null` when unpublished. "0 overdue" is a claim the queue is clear. */
  overdue: number | null;
  dueSoon: number | null;
  /** Rows the current actor can decide, counted over the whole queue — the hi-fi's "Mine (3)". */
  mine?: number | null;
}

/**
 * What the header says while the queue is still loading, or could not be read.
 *
 * `null` counts render as a stated gap rather than as zeros. "0 PENDING" is a
 * specific, checkable claim — inbox zero — and showing it before the server has
 * answered tells an operator their queue is clear when nobody knows yet. This is
 * rule §3.3: never render `0` in place of an absent number.
 */
function CountLine({ counts, status }: { counts: InboxCounts | null; status: PanelStatus }) {
  if (counts) {
    return (
      <div className="exec-inbox-counts">
        <strong>{counts.pending}</strong> PENDING
        {counts.overdue === null
          ? " · overdue not counted"
          : counts.overdue > 0
            ? ` · ${counts.overdue} overdue`
            : null}
        {counts.dueSoon === null
          ? " · due-soon not counted"
          : counts.dueSoon > 0
            ? ` · ${counts.dueSoon} due < 8h`
            : null}
      </div>
    );
  }
  return (
    <div className="exec-inbox-counts exec-inbox-counts-absent">
      {status === "loading"
        ? "counting…"
        : status === "denied"
          ? "queue size withheld"
          : "queue size unavailable"}
    </div>
  );
}

/** The hi-fi's filter chips. Applied server-side (BR-EX-02), never in the browser. */
export const INBOX_FILTERS = [
  "INBOX",
  "ALL",
  "R1",
  // R2 was missing while the server had served this view all along
  // (`approvalListQuery`), so an operator could filter to research gates and
  // not to the capital gates beside them — on the one screen whose job is
  // routing them to both. IMPLEMENTATION_PHASES phase 1 lists it explicitly.
  "R2",
  "PAPER",
  "SANDBOX",
  "LIVE_GATES",
  "EXIT_REVIEWS",
  "OVERDUE",
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

const FILTER_LABEL: Record<InboxFilter, string> = {
  INBOX: "Mine",
  ALL: "All",
  R1: "Research · R1",
  R2: "Ops · R2",
  PAPER: "Paper",
  SANDBOX: "Sandbox",
  LIVE_GATES: "Live gates",
  EXIT_REVIEWS: "Exit reviews",
  OVERDUE: "Overdue",
};

/**
 * Which review screen a row opens.
 *
 * Phase 1's spec names the journey precisely: AP-201 to R1, AP-352 to R2,
 * EX-771 to Paper Exit Review. The gate decides, not the id — deriving it from
 * the identifier would work for the cast and fail on the first real approval.
 */
export function reviewRouteFor(row: { id: string; gate: ApprovalGate }): string {
  switch (row.gate) {
    case "R1":
      return `/governance/approvals/${row.id}/r1`;
    case "R2":
      return `/governance/approvals/${row.id}/r2`;
    case "PAPER_EXIT":
    case "SANDBOX_EXIT":
      return `/governance/exit-reviews/${row.id}`;
    case "LIVE_GATE":
      return `/governance/approvals/${row.id}/r2`;
  }
}

const INERT_LABEL: Record<InertReason, string> = {
  SELF: "not you (separation-of-duty)",
  QUORUM: "awaiting another approver",
  BLOCKED: "blocked before review",
};

function quorum(row: ApprovalRow): ReactNode {
  // A missing count is stated, not zeroed. "0/2" says two approvals are needed
  // and none have arrived — a claim about the state of a decision — while the
  // truth was that the server did not publish the numbers at all.
  const text =
    row.quorumMet !== null && row.quorumRequired !== null
      ? `${row.quorumMet}/${row.quorumRequired}`
      : "quorum not published";
  if (row.inert) {
    return (
      <span className="exec-inbox-inert" title={INERT_LABEL[row.inert]}>
        {text} · {INERT_LABEL[row.inert]}
      </span>
    );
  }
  return (
    <span>
      {text} {row.needsYou ? <b className="exec-inbox-needsyou">needs you</b> : null}
    </span>
  );
}

/**
 * Row emphasis, copied from the hi-fi rather than invented.
 *
 * `IMPLEMENTATION_PHASES` Phase 1 names three treatments and asks for them
 * exactly: an overdue row is red-tinted with a 3px red left border, a row with
 * blockers shows them red, and an inert row is dimmed. All three are *row*
 * treatments because the thing an operator scans is the row, not a cell — and
 * the overdue one has a border as well as a tint so it survives a reader who
 * cannot separate the tint from the background.
 */
function rowEmphasis(row: ApprovalRow): "overdue" | "inert" | undefined {
  if (slaOverdue(row.sla)) return "overdue";
  if (row.inert) return "inert";
  return undefined;
}

const COLUMNS: readonly Column<ApprovalRow>[] = [
  // A real anchor, not a click-only row: middle-click and copy-link work, and
  // the row stays clickable around it.
  { key: "id", header: "request", render: (r) => <a href={reviewRouteFor(r)} onClick={(e) => e.stopPropagation()}>{r.id}</a> },
  { key: "gate", header: "gate", width: "8rem", render: (r) => <span className="exec-inbox-gate" data-gate={r.gate}>{r.gate === "LIVE_GATE" ? "LIVE · CANARY" : r.gate}</span> },
  { key: "subject", header: "subject", truncate: true, title: (r) => r.subject, render: (r) => r.subject },
  { key: "target", header: "target", width: "10rem", truncate: true, title: (r) => r.target, render: (r) => r.target },
  {
    key: "blockers",
    header: "blockers",
    width: "12rem",
    truncate: true,
    title: (r) => r.blockerSummary ?? "none",
    // The count is the server's and the summary names the first one. "0 —
    // observation gate met" reads as a cleared gate; a blank cell would read as
    // an unanswered question, and a count the server never sent is neither.
    render: (r) =>
      r.blockerCount < 0 ? (
        <span className="exec-inbox-nocount">blocker count not published</span>
      ) : (
        <span data-blocking={r.blockerCount > 0 ? "true" : undefined}>
          {r.blockerSummary ? `${r.blockerCount} → ${r.blockerSummary}` : String(r.blockerCount)}
        </span>
      ),
  },
  { key: "sla", header: "age / SLA", width: "10.5rem", render: (r) => <SlaCell sla={r.sla} /> },
  { key: "quorum", header: "quorum", width: "12rem", render: quorum },
];

/** COLUMNS with the live age (hi-fi 4a): same cells, the SLA one ticking. */
function columnsWithTick(tick: number): readonly Column<ApprovalRow>[] {
  return COLUMNS.map((c) =>
    c.key === "sla"
      ? { ...c, render: (r: ApprovalRow) => <SlaCell sla={r.sla} preciseAgeText={r.sla.ageMinutes >= 0 ? preciseAge(r.sla.ageMinutes, tick) : undefined} /> }
      : c,
  );
}

const OUTCOME_TONE: Record<DecidedRow["outcome"], "good" | "bad"> = {
  APPROVED: "good",
  APPROVED_WITH_CONDITION: "good",
  DENIED: "bad",
  CHANGES_REQUESTED: "bad",
};

/** The decided list's own columns — outcome, decider, time; never blockers/SLA. */
const DECIDED_COLUMNS: readonly Column<DecidedRow>[] = [
  { key: "id", header: "request", render: (r) => <a href={reviewRouteFor(r)} onClick={(e) => e.stopPropagation()}>{r.id}</a> },
  { key: "what", header: "gate · subject", truncate: true, title: (r) => `${r.gate} · ${r.subject}`, render: (r) => `${r.gate} · ${r.subject}` },
  { key: "outcome", header: "outcome", render: (r) => <StatusChip label={r.outcome} tone={OUTCOME_TONE[r.outcome]} /> },
  {
    key: "decided",
    header: "decided",
    render: (r) => (
      <span className="exec-inbox-decidedmeta">
        {r.decidedAt.slice(0, 10)} · {r.decidedBy}
        {r.policyVersion ? ` · ${r.policyVersion}` : ""}
      </span>
    ),
  },
];

export function ApprovalInbox({
  page,
  counts,
  filter,
  onFilterChange,
  status = "ok",
  reason,
  partialReason,
  policyVersion,
  actor,
  actorRoles,
  onOpenRequest,
  decided,
  decidedWindow = "last 30 days",
  inertCount = null,
  cursorNotice,
  onDismissCursorNotice,
  onLoadOlder,
  onLoadNewer,
  onLoadOlderDecided,
}: {
  page: KeysetPage<ApprovalRow>;
  counts: InboxCounts | null;
  filter: InboxFilter;
  onFilterChange?: (next: InboxFilter) => void;
  status?: PanelStatus;
  reason?: string;
  partialReason?: string;
  policyVersion?: string;
  actor?: string;
  actorRoles?: readonly string[];
  /** Row → the review its gate owns. The gate travels with the id so the caller never guesses the route. */
  onOpenRequest?: (id: ApprovalId, gate: ApprovalGate) => void;
  decided?: KeysetPage<DecidedRow> | null;
  decidedWindow?: string;
  inertCount?: number | null;
  cursorNotice?: string | null;
  onDismissCursorNotice?: () => void;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
  /** Loads the older half of `governance.approval-history.v1` when its page says has_more. */
  onLoadOlderDecided?: () => void;
  /** Kept in the contract for the container; the hi-fi page has no provenance drawer. */
  onCopyProvenance?: (full: string) => void;
}) {
  // SMOKE motion — ages and the breach countdown tick; 0 under fixtures/gates.
  const tick = useInboxTick();
  const emptyInThisView =
    page.rows.length === 0 &&
    ((page.filteredCount ?? 0) === 0) &&
    (counts?.pending ?? 0) > 0;
  // The next row to breach its SLA: smallest remaining budget among the
  // not-yet-overdue. Derived from the server's own age/budget, never invented.
  const nextBreach = page.rows
    .filter((r) => !slaOverdue(r.sla) && r.sla.ageMinutes >= 0 && r.sla.budgetMinutes > 0)
    .map((r) => ({ id: r.id, secondsLeft: Math.max(0, (r.sla.budgetMinutes - r.sla.ageMinutes) * 60 - tick) }))
    .sort((a, b) => a.secondsLeft - b.secondsLeft)[0] ?? null;
  return (
    <section className="exec-inbox exec-gov" aria-label="Approval Inbox" data-hifi-exact="approval-inbox-4a">
      {/* Hi-fi 4a header: title · count chips · WF marker · policy line right. */}
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">Approval Inbox</h1>
        {counts ? <span className="exec-gov-chip" data-fill="warn">{counts.pending} PENDING</span> : <CountLine counts={counts} status={status} />}
        {counts && (counts.overdue ?? 0) > 0 ? (
          <span className="exec-gov-chip" data-fill="bad" data-pulse="true">{counts.overdue} OVERDUE</span>
        ) : null}
        {counts && counts.overdue === null ? <span className="exec-gov-meta">overdue not counted</span> : null}
        {status === "stale" ? <span className="exec-gov-chip" data-fill="bad">STALE</span> : null}
        {status === "partial" ? <span className="exec-gov-chip" data-fill="warn">PARTIAL</span> : null}
        <span className="exec-gov-wf">WF 4a</span>
        <span className="exec-gov-spacer" />
        {policyVersion || actor ? (
          <span className="exec-inbox-policy exec-gov-meta">
            {policyVersion ? `policy ${policyVersion}` : null}
            {policyVersion && actor ? " · " : null}
            {actor ? `you are ${actor}` : null}
            {actorRoles?.length ? ` · ${actorRoles.join(" + ")}` : null}
          </span>
        ) : null}
      </div>
      {status === "partial" ? (
        <div className="exec-inbox-partial" role="status">
          {partialReason ?? "Some linked facts could not be read. The rows below are real; the queue may be incomplete."}
        </div>
      ) : null}
      {status === "stale" ? (
        <div className="exec-inbox-partial" role="status">
          {reason ?? "This queue is older than its freshness budget. Decide from it only after refreshing."}
        </div>
      ) : null}
      {cursorNotice ? (
        <div className="exec-inbox-cursor-notice" role="status">
          <span>{cursorNotice}</span>
          {onDismissCursorNotice ? (
            <button type="button" className="exec-btn-ghost" onClick={onDismissCursorNotice}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="exec-inbox-filters" role="group" aria-label="Filters">
        {INBOX_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="exec-inbox-filter"
            data-filter={f}
            data-active={f === filter ? "true" : undefined}
            aria-pressed={f === filter}
            disabled={status === "loading" || status === "denied" || status === "unavailable"}
            onClick={() => onFilterChange?.(f)}
          >
            {f === "INBOX" && counts?.mine !== null && counts?.mine !== undefined ? `Mine (${counts.mine})` : FILTER_LABEL[f]}
          </button>
        ))}
      </div>
      {/* Hi-fi: the pending table and Recently decided are both on the page —
          a decided request never hides behind a tab, and neither does history. */}
      <div className="exec-gov-panel">
        <KeysetTable
          label="Pending approvals"
          columns={columnsWithTick(tick)}
          page={page}
          rowKey={(r) => r.id}
          rowEmphasis={rowEmphasis}
          neverVirtualize
          overflowNotice="This queue is over 200 pending items. That is an operational condition, not a display limit — it is shown in full on purpose."
          status={status}
          reason={
            reason ??
            (status === "ok" && page.rows.length === 0
              ? emptyInThisView
                ? `Nothing in ${FILTER_LABEL[filter]}. ${counts?.pending ?? 0} still pending in the queue.`
                : "Inbox zero. Nothing waits on you — pending requests owned by other approvers stay in All."
              : undefined)
          }
          onRowClick={onOpenRequest ? (r) => onOpenRequest(r.id, r.gate) : undefined}
          onLoadOlder={onLoadOlder}
          onLoadNewer={onLoadNewer}
        />
        {/* The sentence that explains why un-actionable rows are still on
            screen; without it the dimming reads as a rendering bug. */}
        <div className="exec-inbox-strip exec-role-meta">
          {counts ? (
            <span>
              {counts.overdue === null ? "overdue not counted" : `${counts.overdue} overdue`} · {counts.dueSoon === null ? "due-soon not counted" : `${counts.dueSoon} due soon`}
              {nextBreach ? (
                <>
                  {" · next SLA breach in "}
                  <span className="exec-inbox-breach">{preciseAge(0, nextBreach.secondsLeft)}</span> ({nextBreach.id})
                </>
              ) : null}
            </span>
          ) : null}
          <span>sort: overdue → due-soon → age</span>
          {inertCount !== null ? (
            <span title="Rows you cannot act on are still counted and still shown.">{inertCount} not yours</span>
          ) : null}
          <strong>visibility ≠ authority</strong>
          <span className="exec-inbox-rownote">row → gate review screen</span>
        </div>
      </div>
      <div className="exec-gov-panel exec-inbox-decided">
        <div className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Recently decided</span>
          <span className="exec-gov-meta">{decidedWindow}</span>
          <span className="exec-gov-spacer" />
          {/* `governance.approval-history.v1` is a keyset page: when it says
              has_more the control loads it; when it says the window is whole,
              the screen states that instead of rendering a dead promise. */}
          {decided?.hasMore ? (
            <button type="button" className="exec-role-control exec-btn-ghost" onClick={onLoadOlderDecided} disabled={!onLoadOlderDecided}>
              Full history →
            </button>
          ) : decided ? (
            <span className="exec-gov-meta">full history loaded · {decided.rows.length} decisions in {decidedWindow}</span>
          ) : null}
        </div>
        {decided ? (
          <KeysetTable
            label="Recently decided"
            columns={DECIDED_COLUMNS}
            page={decided}
            rowKey={(r) => r.id}
            reason={`Nothing decided in this window (${decidedWindow}).`}
          />
        ) : (
          <PanelState status="empty" reason={`No decided list was published for ${decidedWindow}.`} />
        )}
      </div>
    </section>
  );
}
