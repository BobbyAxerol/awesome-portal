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
import { PanelState } from "../components/states";
import { KeysetTable, type Column } from "../components/table";

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
  quorumMet: number;
  quorumRequired: number;
  /** Absent when the actor can act on this row. */
  inert: InertReason | null;
  needsYou: boolean;
}

export interface InboxCounts {
  /** Whole queue, from the server. */
  pending: number;
  overdue: number;
  dueSoon: number;
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
        {counts.overdue > 0 ? ` · ${counts.overdue} overdue` : null}
        {counts.dueSoon > 0 ? ` · ${counts.dueSoon} due < 8h` : null}
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
  "PAPER",
  "SANDBOX",
  "LIVE_GATES",
  "EXIT_REVIEWS",
  "OVERDUE",
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

const FILTER_LABEL: Record<InboxFilter, string> = {
  INBOX: "Inbox",
  ALL: "All",
  R1: "Research · R1",
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
  const text = `${row.quorumMet}/${row.quorumRequired}`;
  if (row.inert) {
    return (
      <span className="exec-inbox-inert" title={INERT_LABEL[row.inert]}>
        {text} · {INERT_LABEL[row.inert]}
      </span>
    );
  }
  return (
    <span>
      {text} {row.needsYou ? <StatusChip label="needs you" tone="warn" /> : null}
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
  { key: "id", header: "request", render: (r) => r.id },
  { key: "gate", header: "gate", render: (r) => r.gate },
  { key: "subject", header: "subject", truncate: true, title: (r) => r.subject, render: (r) => r.subject },
  { key: "target", header: "target", render: (r) => r.target },
  {
    key: "blockers",
    header: "blockers",
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
          {r.blockerCount} — {r.blockerSummary ?? "none"}
        </span>
      ),
  },
  { key: "sla", header: "age / SLA", render: (r) => <SlaCell sla={r.sla} /> },
  { key: "quorum", header: "quorum", render: quorum },
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
}: {
  page: KeysetPage<ApprovalRow>;
  /**
   * Whole-queue counts from the server, not from `page.rows`. `null` while
   * loading or when the queue could not be counted — never substituted with 0.
   */
  counts: InboxCounts | null;
  filter: InboxFilter;
  onFilterChange?: (next: InboxFilter) => void;
  status?: PanelStatus;
  reason?: string;
  /**
   * Why the queue is partial. `partial` keeps the table — some rows arrived and
   * they are real — and states what is missing above it. Blanking the screen
   * because one linked fact timed out would withhold work that can be done.
   */
  partialReason?: string;
  /** `approval.v3` — which policy version judged these requests. */
  policyVersion?: string;
  actor?: string;
  actorRoles?: readonly string[];
  onOpenRequest?: (id: ApprovalId) => void;
  /** Its own section. A decided request in the pending table is a false action item. */
  decided?: KeysetPage<ApprovalRow> | null;
  /**
   * The window the decided list covers. Stated because decided history is
   * unbounded (scale doc §6, Phase 1) and a list with no window silently claims
   * to be all of it.
   */
  decidedWindow?: string;
  /**
   * How many rows of the current selection the actor cannot act on, counted by
   * the server over the whole filter.
   *
   * Here so that a server-side filter dropping separation-of-duty rows becomes
   * visible: the count and the rows would disagree. Their visibility is the
   * proof that separation of duties is working, so losing them silently is the
   * one filtering bug this screen must not be able to hide.
   */
  inertCount?: number | null;
  /**
   * Set when a page reference stopped applying and the list reset to the start.
   *
   * It is announced rather than absorbed. A cursor voided by a query change is
   * a normal, contractual event (`EX-BE-04b`), but from the reader's side the
   * list silently jumps back to page one — and a reader who does not know that
   * happened will assume the rows they were looking at were deleted.
   */
  cursorNotice?: string | null;
  onDismissCursorNotice?: () => void;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
}) {
  // Empty because a view narrowed it, versus empty because there is nothing.
  // The server's filtered count is what separates them; without it the screen
  // cannot tell, so it says the weaker thing.
  const emptyInThisView =
    page.rows.length === 0 &&
    ((page.filteredCount ?? 0) === 0) &&
    (counts?.pending ?? 0) > 0;

  return (
    <section className="exec-inbox" aria-label="Approval Inbox">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">Approval Inbox</div>
        <CountLine counts={counts} status={status} />
        {/* Who is judging, and by which policy. Without it an operator cannot
            tell whether a blocked Approve is their role or the request. */}
        {policyVersion || actor ? (
          <div className="exec-inbox-policy">
            {policyVersion ? `policy ${policyVersion}` : null}
            {policyVersion && actor ? " · " : null}
            {actor ? `you are ${actor}` : null}
            {actorRoles?.length ? ` · ${actorRoles.join(" + ")}` : null}
          </div>
        ) : null}
      </header>

      {status === "partial" ? (
        <div className="exec-inbox-partial">
          {partialReason ?? "Some linked facts could not be read. The rows below are real; the queue may be incomplete."}
        </div>
      ) : null}

      {status === "stale" ? (
        <div className="exec-inbox-partial">
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
            data-active={f === filter ? "true" : undefined}
            aria-pressed={f === filter}
            disabled={status === "loading" || status === "denied" || status === "unavailable"}
            onClick={() => onFilterChange?.(f)}
          >
            {FILTER_LABEL[f]}
          </button>
        ))}
        <span className="exec-inbox-sort">sort: overdue → due-soon → age</span>
      </div>

      <KeysetTable
        label="Pending approvals"
        columns={COLUMNS}
        page={page}
        rowKey={(r) => r.id}
        rowEmphasis={rowEmphasis}
        // A work queue past 200 rows is an operational problem, not a rendering
        // one (scale doc §6). Paginating it away would hide exactly that.
        neverVirtualize
        overflowNotice="This queue is over 200 pending items. That is an operational condition, not a display limit — it is shown in full on purpose."
        status={status}
        reason={
          reason ??
          (status === "ok" && page.rows.length === 0
            ? // "Inbox zero" is a claim about the QUEUE. Saying it under an
              // active filter announces the queue is clear while five requests
              // sit in it — the filtered-empty result and the empty queue look
              // identical and mean opposite things.
              emptyInThisView
              ? `Nothing in ${FILTER_LABEL[filter]}. ${counts?.pending ?? 0} still pending in the queue.`
              : "Inbox zero."
            : undefined)
        }
        onRowClick={onOpenRequest ? (r) => onOpenRequest(r.id) : undefined}
        onLoadOlder={onLoadOlder}
        onLoadNewer={onLoadNewer}
      />

      {/* The hi-fi's footer strip. The third clause is the one that matters:
          it is the sentence that explains why un-actionable rows are still on
          screen, and without it the dimming reads as a rendering bug. */}
      <div className="exec-inbox-strip">
        {counts ? (
          <span>
            {counts.overdue} overdue · {counts.dueSoon} due soon
          </span>
        ) : null}
        <span>sort: overdue → due-soon → age</span>
        {inertCount !== null ? (
          <span title="Rows you cannot act on are still counted and still shown.">
            {inertCount} not yours
          </span>
        ) : null}
        <strong>visibility ≠ authority</strong>
      </div>

      {decided ? (
        <div className="exec-inbox-decided">
          <div className="exec-tile-title">
            Recently decided
            {decidedWindow ? <span className="exec-inbox-window"> · {decidedWindow}</span> : null}
          </div>
          <KeysetTable
            label="Recently decided"
            columns={COLUMNS}
            page={decided}
            rowKey={(r) => r.id}
            reason="Nothing decided in this window."
          />
        </div>
      ) : null}
    </section>
  );
}

/**
 * The inbox with no table at all — used when the whole screen, rather than one
 * panel, is unavailable. Kept separate so a caller cannot accidentally render
 * counts from a queue it could not read.
 */
export function ApprovalInboxUnavailable({
  status,
  reason,
}: {
  status: Exclude<PanelStatus, "ok">;
  reason: string;
}) {
  return (
    <section className="exec-inbox" aria-label="Approval Inbox">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">Approval Inbox</div>
      </header>
      <PanelState status={status} reason={reason} />
    </section>
  );
}
