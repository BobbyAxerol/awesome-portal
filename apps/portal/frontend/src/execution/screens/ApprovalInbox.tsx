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

import type { ApprovalId, KeysetPage, PanelStatus, Sla } from "../contracts";
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
    // an unanswered question.
    render: (r) => `${r.blockerCount} — ${r.blockerSummary ?? "none"}`,
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
  policyVersion,
  actor,
  actorRoles,
  onOpenRequest,
  decided,
  onLoadOlder,
  onLoadNewer,
}: {
  page: KeysetPage<ApprovalRow>;
  /** Whole-queue counts from the server, not from `page.rows`. */
  counts: InboxCounts;
  filter: InboxFilter;
  onFilterChange?: (next: InboxFilter) => void;
  status?: PanelStatus;
  reason?: string;
  /** `approval.v3` — which policy version judged these requests. */
  policyVersion?: string;
  actor?: string;
  actorRoles?: readonly string[];
  onOpenRequest?: (id: ApprovalId) => void;
  /** Its own section. A decided request in the pending table is a false action item. */
  decided?: KeysetPage<ApprovalRow> | null;
  onLoadOlder?: () => void;
  onLoadNewer?: () => void;
}) {
  return (
    <section className="exec-inbox" aria-label="Approval Inbox">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">Approval Inbox</div>
        <div className="exec-inbox-counts">
          <strong>{counts.pending}</strong> PENDING
          {counts.overdue > 0 ? ` · ${counts.overdue} overdue` : null}
          {counts.dueSoon > 0 ? ` · ${counts.dueSoon} due < 8h` : null}
        </div>
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

      <div className="exec-inbox-filters" role="group" aria-label="Filters">
        {INBOX_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="exec-inbox-filter"
            data-active={f === filter ? "true" : undefined}
            aria-pressed={f === filter}
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
        status={status}
        reason={reason ?? (status === "ok" && page.rows.length === 0 ? "Inbox zero." : undefined)}
        onRowClick={onOpenRequest ? (r) => onOpenRequest(r.id) : undefined}
        onLoadOlder={onLoadOlder}
        onLoadNewer={onLoadNewer}
      />

      {decided ? (
        <div className="exec-inbox-decided">
          <div className="exec-tile-title">Recently decided</div>
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
