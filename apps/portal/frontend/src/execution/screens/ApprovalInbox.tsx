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
import { slaOverdue, type ApprovalId, type KeysetPage, type PanelStatus, type Sla } from "../contracts";
import { emptyScopeLine, emptyScopeTitle } from "../readTruthCopy";
import { StatusChip } from "../components/badges";
import { GateTrack } from "../components/gateFrame";
import { Segmented } from "../components/choiceMenu";
import { QuietEmpty } from "../components/quietEmpty";
import { serverSaysEmpty } from "../readTruthCopy";
import { KeysetTable, type Column } from "../components/table";
import { preciseAge, useAgeTick } from "../liveTick";

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

/** The gate-scoped filters, drawn as chips: one click to narrow, the same click to clear. */
const GATE_CHIP_LABEL: Record<(typeof GATE_FILTERS)[number], string> = { R1: "R1", R2: "R2", PAPER: "Paper", SANDBOX: "Sandbox", LIVE_GATES: "Live", EXIT_REVIEWS: "Exit" };
const GATE_FILTERS = ["R1", "R2", "PAPER", "SANDBOX", "LIVE_GATES", "EXIT_REVIEWS"] as const;

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
      // Owner-commissioned 2026-08-30 (ROADMAP §H.2.2): the live gate has its
      // own review room — canary evidence, not the R2 capital composition.
      return `/governance/approvals/${row.id}/live`;
  }
}

const INERT_LABEL: Record<InertReason, string> = {
  SELF: "not you (separation-of-duty)",
  QUORUM: "awaiting another approver",
  BLOCKED: "blocked before review",
};

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

/** A duration a person can read at a glance: minutes under 90, hours under two days, then days. */
function span(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 90) return `${m}m`;
  if (m < 48 * 60) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

/**
 * The SLA as a sentence: "overdue 2h" or "22h left". The verdict is the server's (`slaOverdue` knows paused clocks and extensions);
 * the amount is only the arithmetic of its own age and budget, and is left out when the two disagree rather than guessed.
 */
function SlaPhrase({ sla }: { sla: Sla }) {
  const overdue = slaOverdue(sla);
  const known = sla.ageMinutes >= 0 && sla.budgetMinutes > 0;
  const remaining = known ? sla.budgetMinutes - sla.ageMinutes : null;
  if (!known && !overdue) return <span className="exec-inbox-nocount">SLA not published</span>;
  return (
    <span className="exec-sla" data-overdue={overdue}>
      <span className="exec-inbox-sla-text" data-tone={overdue ? "bad" : sla.state === "DUE_SOON" ? "warn" : undefined}>
        {overdue ? (remaining !== null && remaining < 0 ? `overdue ${span(-remaining)}` : "overdue") : `${span(remaining ?? 0)} left`}
      </span>
      {known ? (
        <span className="exec-sla-bar" aria-hidden="true">
          <span className="exec-sla-fill" style={{ width: `${Math.min(100, Math.round((sla.ageMinutes / Math.max(1, sla.budgetMinutes)) * 100))}%` }} />
        </span>
      ) : null}
    </span>
  );
}

/** What this row asks of the reader, in one place: who it waits on, and the leading blocker if the server counted one. */
function Next({ row }: { row: ApprovalRow }) {
  const approvers =
    row.quorumMet !== null && row.quorumRequired !== null ? `${row.quorumMet} of ${row.quorumRequired} approvers` : "approvers not published";
  return (
    <span className="exec-inbox-next">
      {row.inert ? (
        <span className="exec-inbox-inert" title={INERT_LABEL[row.inert]}>{INERT_LABEL[row.inert]}</span>
      ) : row.needsYou ? (
        <b className="exec-inbox-needsyou">needs you</b>
      ) : null}
      {row.blockerCount < 0 ? (
        <span className="exec-inbox-nocount">blocker count not published</span>
      ) : row.blockerCount > 0 ? (
        <span data-blocking="true">
          {row.blockerCount} blocker{row.blockerCount === 1 ? "" : "s"}
          {row.blockerSummary ? ` — ${row.blockerSummary}` : ""}
        </span>
      ) : (
        // a counted zero is stated: "no blocker" is a claim the server made, and a blank cell would read as an unanswered question
        <span>{row.blockerSummary && !/^none$/i.test(row.blockerSummary.trim()) ? `no blocker — ${row.blockerSummary}` : "no blocker"}</span>
      )}
      <span className="exec-gov-meta">{approvers}</span>
    </span>
  );
}

const COLUMNS: readonly Column<ApprovalRow>[] = [
  // The subject leads (what is being decided); the request id is a real anchor beneath it, so middle-click and copy-link still work.
  {
    key: "id",
    header: "request",
    title: (r) => `${r.subject} · ${r.target}`,
    render: (r) => (
      <span className="exec-inbox-request">
        <span className="exec-inbox-subject">{r.subject}</span>
        <span className="exec-gov-meta">
          <a href={reviewRouteFor(r)} onClick={(e) => e.stopPropagation()}>{r.id}</a> · {r.target}
        </span>
      </span>
    ),
  },
  {
    key: "gate",
    header: "gate",
    width: "8rem",
    render: (r) => (
      <span className="exec-inbox-gatecell">
        <span className="exec-inbox-gate" data-gate={r.gate}>{r.gate === "LIVE_GATE" ? "LIVE · CANARY" : r.gate}</span>
        <GateTrack at={r.gate === "R1" ? "R1" : r.gate === "R2" ? "R2" : r.gate === "PAPER_EXIT" ? "PAPER" : r.gate === "SANDBOX_EXIT" ? "SANDBOX" : "LIVE"} />
      </span>
    ),
  },
  { key: "next", header: "what's next", width: "18rem", render: (r) => <Next row={r} /> },
  { key: "sla", header: "SLA", width: "9rem", render: (r) => <SlaPhrase sla={r.sla} /> },
];

/** Kept for callers that tick the age; the phrase is minutes-granular, so the tick no longer changes the cell. */
function columnsWithTick(_tick: number): readonly Column<ApprovalRow>[] {
  return COLUMNS;
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

/** What an empty view says, in one short sentence; the server's own code stays reachable as a tooltip, not printed. */
function emptySentence(readTruth: KeysetPage<ApprovalRow>["readTruth"], view: string, pending: number | null): string {
  if (!serverSaysEmpty(readTruth)) return emptyScopeLine(readTruth, view, pending);
  return typeof pending === "number" && pending > 0
    ? `Nothing matches ${view} — ${pending} pending outside this view.`
    : `Nothing matches ${view}. Other views may still have requests.`;
}

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
  // Goal 6: a real clock, not the smoke one. An approval's SLA age is
  // information, and `useInboxTick` froze it under `prefers-reduced-motion` —
  // hiding an approaching deadline from the one reader who has no other way to
  // notice it. Still 0 on the fixtures page, where baselines must be still.
  const tick = useAgeTick();
  const filtersDisabled = status === "loading" || status === "denied" || status === "unavailable";
  /*
   * §8.59: the server now answers "is this empty?" itself, scoped to the exact
   * request. The screen used to decide it from `rows.length === 0` and print
   * "Inbox zero" — a claim about the workspace, made from a page the server had
   * selected by an opaque cursor. That derivation is gone; `page.readTruth` is
   * the only thing allowed to say the set is empty, and it says it about this
   * request only.
   */
  // The next row to breach its SLA: smallest remaining budget among the
  // not-yet-overdue. Derived from the server's own age/budget, never invented.
  const nextBreach = page.rows
    .filter((r) => !slaOverdue(r.sla) && r.sla.ageMinutes >= 0 && r.sla.budgetMinutes > 0)
    .map((r) => ({ id: r.id, secondsLeft: Math.max(0, (r.sla.budgetMinutes - r.sla.ageMinutes) * 60 - tick) }))
    .sort((a, b) => a.secondsLeft - b.secondsLeft)[0] ?? null;
  return (
    <section className="exec-inbox exec-gov" aria-label="Approval Inbox" data-hifi-exact="approval-inbox-4a">
      <header className="exec-inbox-head">
        <div className="exec-inbox-titlerow">
          <h1 className="exec-gov-h1">Approval Inbox</h1>
          {counts ? <span className="exec-gov-chip" data-fill="warn">{counts.pending} pending</span> : <CountLine counts={counts} status={status} />}
          {counts && (counts.overdue ?? 0) > 0 ? (
            <span className="exec-gov-chip" data-fill="bad" data-pulse="true">{counts.overdue} overdue</span>
          ) : null}
          {counts && counts.overdue === null ? <span className="exec-gov-meta">overdue not counted</span> : null}
          {status === "stale" ? <span className="exec-gov-chip" data-fill="bad">stale</span> : null}
          {status === "partial" ? <span className="exec-gov-chip" data-fill="warn">partial</span> : null}
          <span className="exec-gov-wf">WF 4a</span>
          <span className="exec-gov-spacer" />
          <a className="exec-gov-quiet" href="/governance/waivers">Waivers &amp; conditions</a>
          <a className="exec-btn-apply exec-gov-cta" href="/governance/approvals/new">New request</a>
        </div>
        {policyVersion || actor ? (
          <p className="exec-inbox-policy exec-gov-meta">
            {actor ? `You are ${actor}` : null}
            {actorRoles?.length ? ` · ${actorRoles.join(" + ")}` : null}
            {policyVersion ? ` · policy ${policyVersion}` : null}
          </p>
        ) : null}
      </header>
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
      <div className="exec-inbox-toolbar" role="group" aria-label="Filters">
        {/* One server-side filter at a time (BR-EX-02), drawn as three controls: whose · overdue · which gate. */}
        <Segmented
          label="View"
          value={filter === "INBOX" || filter === "ALL" || filter === "OVERDUE" ? filter : null}
          disabled={filtersDisabled}
          onChange={(next) => onFilterChange?.(next)}
          options={[
            { value: "INBOX", label: "Mine", count: counts?.mine ?? null },
            { value: "ALL", label: "All" },
            { value: "OVERDUE", label: "Overdue", count: counts?.overdue && counts.overdue > 0 ? counts.overdue : null, tone: "bad" },
          ]}
        />
        <div className="exec-gatechips" role="group" aria-label="Gate">
          {GATE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="exec-gatechip"
              data-filter={f}
              data-gate={f}
              data-active={f === filter ? "true" : undefined}
              aria-pressed={f === filter}
              disabled={filtersDisabled}
              title={FILTER_LABEL[f]}
              onClick={() => onFilterChange?.(f === filter ? "ALL" : f)}
            >
              <i aria-hidden="true" />
              {GATE_CHIP_LABEL[f]}
            </button>
          ))}
        </div>
      </div>
      {status === "ok" && page.rows.length === 0 ? (
        <QuietEmpty
          label="Pending approvals"
          title={emptyScopeTitle(page.readTruth)}
          line={emptySentence(page.readTruth, FILTER_LABEL[filter], counts?.pending ?? null)}
          lineTitle={page.readTruth?.reasonCode ?? null}
          // the way in is offered when the whole queue is empty, not when a filter merely hides it
          actions={counts?.pending === 0 ? <a className="exec-btn-apply exec-gov-cta" href="/research/quantbt/runs">Start from a Research run</a> : null}
        />
      ) : (
        <div className="exec-gov-panel exec-inbox-card">
          <KeysetTable
            label="Pending approvals"
            columns={columnsWithTick(tick)}
            page={page}
            rowKey={(r) => r.id}
            rowEmphasis={rowEmphasis}
            neverVirtualize
            emptyTitle={status === "ok" && page.rows.length === 0 ? emptyScopeTitle(page.readTruth) : undefined}
            prominentEmpty
            overflowNotice="This queue is over 200 pending items. That is an operational condition, not a display limit — it is shown in full on purpose."
            status={status}
            reason={
              reason ??
              (status === "ok" && page.rows.length === 0
                ? emptyScopeLine(page.readTruth, FILTER_LABEL[filter], counts?.pending ?? null)
                : undefined)
            }
            onRowClick={onOpenRequest ? (r) => onOpenRequest(r.id, r.gate) : undefined}
            onLoadOlder={onLoadOlder}
            onLoadNewer={onLoadNewer}
          />
          {/* The sentence that explains why un-actionable rows are still on screen; without it the dimming reads as a rendering bug. */}
          {(counts || (inertCount !== null && inertCount > 0)) ? (
            <div className="exec-inbox-strip exec-role-meta">
              {counts && ((counts.overdue ?? 0) > 0 || (counts.dueSoon ?? 0) > 0 || counts.overdue === null || counts.dueSoon === null) ? (
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
              {inertCount !== null && inertCount > 0 ? (
                <span title="Rows you cannot act on are still counted and still shown.">
                  <span>{inertCount} not yours</span> <span className="exec-gov-meta">to decide — shown so the queue never hides its size</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {decided && decided.rows.length > 0 ? (
        <details className="exec-gov-panel exec-inbox-decided">
          <summary className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Recently decided</span>
            <span className="exec-gov-meta">{decidedWindow} · {decided.rows.length} decision{decided.rows.length === 1 ? "" : "s"}</span>
          </summary>
          {decided.hasMore ? (
            <div className="exec-gov-panelhead">
              <span className="exec-gov-spacer" />
              <button type="button" className="exec-role-control exec-btn-ghost" onClick={onLoadOlderDecided} disabled={!onLoadOlderDecided}>
                Full history →
              </button>
            </div>
          ) : null}
          <KeysetTable
            label="Recently decided"
            columns={DECIDED_COLUMNS}
            page={decided}
            rowKey={(r) => r.id}
            reason={`Nothing decided in this window (${decidedWindow}).`}
          />
        </details>
      ) : (
        <p className="exec-inbox-quiet exec-gov-meta" data-decided-quiet>
          {decided ? `Nothing decided in the ${decidedWindow}.` : `No decided list was published for the ${decidedWindow}.`}
        </p>
      )}
    </section>
  );
}
