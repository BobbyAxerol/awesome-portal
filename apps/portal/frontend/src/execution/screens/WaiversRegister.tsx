/**
 * Waivers & Conditions — the fleet-wide obligations register, now the N29
 * consumer (codex handoff 2026-08-31): rows, exact counts, bidirectional
 * keyset cursors and the four states OPEN/WAIVED/EXPIRING/LAPSED all come
 * from `governance.conditions-register.v1`. The client renders server state
 * and never re-derives it; every due display counts from the server's own
 * `read_at`, not the browser clock.
 *
 * The composition keeps the owner-approved reading order: how much and how
 * urgent (strip) → what lapses when (runway) → where the debt sits (subject
 * chips) → the register itself, each row expandable to its source decision.
 * LAPSED is BLOCKING: it renders as a blocking finding, exactly as it enters
 * the Command Center `today` feed as CONDITION_EXPIRY.
 */
import { Fragment, useEffect, useMemo, useState } from "react";

import type { ConditionRow, ConditionsPage, ExecutionApi, WaiverStateCode } from "../api/ports";
import { readConditionsPage } from "../api/rows";
import { CrossEvidence } from "../components/CrossEvidence";
import type { OperationalComposition } from "../operationalComposition";
import { useAgeTick } from "../liveTick";
import { ExecutionDecisionStrip } from "../components/workspace";
import { PanelState } from "../components/states";
import { reviewRouteFor, type ApprovalGate } from "./ApprovalInbox";
import type { PanelStatus } from "../contracts";

const FILTERS = ["ALL", "OPEN", "EXPIRING", "LAPSED", "WAIVED"] as const;
type Filter = (typeof FILTERS)[number];

const STATE_FILL: Record<WaiverStateCode, "warn" | "bad" | "good"> = {
  OPEN: "warn",
  EXPIRING: "bad",
  LAPSED: "bad",
  WAIVED: "good",
};

const PAGE_SIZE = 5;

/** Remaining time from the SERVER's read anchor — never the browser clock. */
function remaining(row: ConditionRow, readAt: string | null, tick: number): { text: string; tone: "good" | "warn" | "bad" } {
  if (!row.dueAt) return { text: "no clock", tone: "good" };
  if (!readAt) return { text: "due " + row.dueAt.slice(0, 10), tone: "warn" };
  const left = Math.floor((Date.parse(row.dueAt) - Date.parse(readAt)) / 1000) - tick;
  if (left <= 0) {
    const ago = Math.abs(left);
    return { text: `lapsed ${Math.floor(ago / 86_400)}d ${String(Math.floor((ago % 86_400) / 3600)).padStart(2, "0")}h ago`, tone: "bad" };
  }
  const d = Math.floor(left / 86_400);
  const h = String(Math.floor((left % 86_400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const sec = String(left % 60).padStart(2, "0");
  // A clock a month out ticking seconds reads as noise; the second hand is
  // reserved for the week that matters. EXPIRING/LAPSED always show it.
  if (row.state !== "EXPIRING" && row.state !== "LAPSED" && d >= 7) {
    return { text: `${d}d left`, tone: d < 21 ? "warn" : "good" };
  }
  return { text: `${d}d ${h}:${m}:${sec}`, tone: d < 7 ? "bad" : d < 21 ? "warn" : "good" };
}

function sourceHref(row: ConditionRow): string {
  return reviewRouteFor({ id: row.approvalId, gate: row.gate as ApprovalGate });
}

/** Longest clock drawn on the shared runway axis. */
const RUNWAY_DAYS = 45;

function Runway({ rows, readAt, tick }: { rows: readonly ConditionRow[]; readAt: string | null; tick: number }) {
  const urgent = rows.filter((r) => r.state === "OPEN" || r.state === "EXPIRING" || r.state === "LAPSED");
  const clocked = urgent.filter((r) => r.dueAt !== null);
  const unclocked = urgent.filter((r) => r.dueAt === null);
  const days = (r: ConditionRow) =>
    readAt && r.dueAt ? Math.max(0, (Date.parse(r.dueAt) - Date.parse(readAt)) / 86_400_000) : 0;
  return (
    <div className="exec-gov-panel">
      <div className="exec-gov-panelhead">
        <span className="exec-gov-paneltitle">Runway — what lapses when</span>
        <span className="exec-gov-meta">shared axis 0 → {RUNWAY_DAYS}d · at zero an obligation is a blocking finding, and LAPSED already is one</span>
      </div>
      {/* A panel head with nothing under it reads as a panel that failed to
          load. The two reasons are kept apart: an obligation with no due date
          is event-bound, not missing, and that is a different sentence from
          having nothing owed at all. */}
      {clocked.length === 0 ? (
        <PanelState
          status="empty"
          reason={unclocked.length > 0
            ? `No obligation on this page has a due date — the ${unclocked.length} open here are event-bound.`
            : "No open, expiring or lapsed obligation on this page."}
        />
      ) : (
      <div className="exec-wv-runway" role="list" aria-label="Obligation runway">
        {[...clocked].sort((a, b) => days(a) - days(b)).map((r) => {
          const pct = Math.min(100, Math.round((days(r) / RUNWAY_DAYS) * 100));
          const due = remaining(r, readAt, tick);
          return (
            <div className="exec-wv-lane" role="listitem" key={r.conditionId} data-state={r.state}>
              <span className="exec-wv-lanewho">{r.subjectLabel} · {r.owner}</span>
              <span className="exec-wv-lanetrack" aria-hidden="true">
                <span className="exec-wv-lanefill" data-tone={due.tone} style={{ width: `${pct}%` }} />
                <span className="exec-wv-lanedot" data-tone={due.tone} style={{ left: `${pct}%` }} />
              </span>
              <span className="exec-wv-lanedue" data-tone={due.tone} data-live={r.state === "EXPIRING" || r.state === "LAPSED" ? "true" : undefined}>
                {due.text}
              </span>
              <span className="exec-wv-lanetext">{r.statement}</span>
            </div>
          );
        })}
      </div>
      )}
      {unclocked.length > 0 ? (
        <p className="exec-gate-note">
          {unclocked.length} open obligation{unclocked.length > 1 ? "s are" : " is"} event-bound, not
          clocked — {unclocked.map((r) => `${r.conditionId.replace("cn_", "#")} (${r.label})`).join(" · ")} —
          each closes by its event, and the event is asserted by a decision on its source approval
        </p>
      ) : null}
    </div>
  );
}

export interface WaiverCounts {
  total: number | null;
  /**
   * `number` = the server counted that many. `"unreadable"` = the count query
   * failed. `null`/absent = the source published no count.
   *
   * These were one value before, and a failed count came out as `null` — which
   * on this surface means "not published". So a register that could not be
   * counted looked exactly like a register with nothing in it, and the chip
   * simply vanished. Those are opposite facts for the reader deciding whether
   * anything is owed.
   */
  byState: Partial<Record<WaiverStateCode, number | "unreadable" | null>>;
}

export function WaiversRegisterScreen({
  page,
  counts,
  filter,
  onFilter,
  onNext,
  onPrev,
  status = "ok",
  reason,
}: {
  page: ConditionsPage | null;
  counts: WaiverCounts;
  filter: Filter;
  onFilter: (next: Filter) => void;
  onNext: () => void;
  onPrev: () => void;
  status?: PanelStatus;
  reason?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const tick = useAgeTick();
  const rows = page?.rows ?? [];
  const readAt = page?.readAt ?? null;

  const open = counts.byState.OPEN ?? null;
  const expiring = counts.byState.EXPIRING ?? null;
  const lapsed = counts.byState.LAPSED ?? null;
  const waived = counts.byState.WAIVED ?? null;
  const countOf = (v: number | "unreadable" | null): number | null => (typeof v === "number" ? v : null);
  const unreadable = [
    ["OPEN", open], ["EXPIRING", expiring], ["LAPSED", lapsed], ["WAIVED", waived],
  ].filter(([, v]) => v === "unreadable").map(([k]) => k as string);
  const bySubject = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.state === "WAIVED") continue;
      m.set(r.subjectLabel, (m.get(r.subjectLabel) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <section className="exec-gate exec-gov" aria-label="Waivers and conditions register" data-hifi-exact="waivers-register">
      <div className="exec-gate-kicker">GOVERNANCE · Obligations Register</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">Waivers &amp; Conditions <span className="exec-gov-dim">—</span> what the fund owes, fleet-wide</h1>
      </div>
      <div className="exec-gov-metaline">
        {/* The amber fill is the queue's attention role. An OPEN count of zero
            is not a backlog, so it is drawn plain rather than in the colour
            that means "something is waiting for you". */}
        {countOf(open) !== null ? <span className="exec-gov-chip" data-fill={countOf(open)! > 0 ? "warn" : undefined}>{countOf(open)} OPEN</span> : null}
        {countOf(expiring) ? <span className="exec-gov-chip" data-fill="bad" data-pulse="true">{countOf(expiring)} EXPIRING</span> : null}
        {countOf(lapsed) ? <span className="exec-gov-chip" data-fill="bad">{countOf(lapsed)} LAPSED · BLOCKING</span> : null}
        {countOf(waived) ? <span className="exec-gov-chip" data-fill="good">{countOf(waived)} WAIVED</span> : null}
        {unreadable.length > 0 ? (
          <span className="exec-gov-chip" title="The count query for these states did not return; the register below is still the server's page.">
            {unreadable.join(" · ")} not counted
          </span>
        ) : null}
        {status === "partial" ? (
          <span className="exec-gov-chip" data-fill="warn" title={reason ?? "The source returned part of the register."}>PARTIAL</span>
        ) : null}
        <span className="exec-gov-meta">
          governance.conditions-register.v1 · PORTAL_CONTROL · states computed server-side — this
          screen renders them and never re-derives · a condition closes only by a decision
        </span>
      </div>

      <ExecutionDecisionStrip
        metrics={[
          // A cell whose count could not be read stays absent rather than
          // summing to a number that is missing one of its parts.
          { label: "Open + expiring", value: countOf(open) !== null && countOf(expiring) !== null ? String(countOf(open)! + countOf(expiring)!) : null, tone: (countOf(open) ?? 0) + (countOf(expiring) ?? 0) > 0 ? "warn" : "good" },
          { label: "Lapsed (blocking)", value: countOf(lapsed) !== null ? String(countOf(lapsed)) : null, tone: (countOf(lapsed) ?? 0) > 0 ? "bad" : "good" },
          { label: "Active waivers", value: countOf(waived) !== null ? String(countOf(waived)) : null, tone: "good" },
          { label: "Register total", value: counts.total !== null ? String(counts.total) : null },
          { label: "Read at", value: readAt ? readAt.slice(11, 19) + " UTC" : null },
        ]}
      />

      {status !== "ok" && status !== "partial" ? (
        <PanelState status={status} reason={reason} />
      ) : (
        <>
          <Runway rows={rows} readAt={readAt} tick={tick} />

          <div className="exec-wv-debtrow" role="group" aria-label="Obligations by subject">
            <span className="exec-gov-meta">on this page, the debt sits with:</span>
            {bySubject.map(([label, n]) => (
              <span className="exec-wv-debtchip" key={label}>{label} <b>{n}</b></span>
            ))}
            <span className="exec-gov-meta">· WAIVED excluded · exact fleet totals live in the strip above</span>
          </div>

          {/* The hi-fi puts the state filters on their own row between the header
              and the table, where the Approval Inbox already puts them. Inside
              the panel head they were pushed to the far right and read as a
              property of the panel's title rather than of the register. */}
          <div role="group" aria-label="Filter by state" className="exec-inbox-filters">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="exec-inbox-filter"
                aria-pressed={f === filter}
                data-active={f === filter ? "true" : undefined}
                onClick={() => onFilter(f)}
              >
                {f === "ALL" ? `All${counts.total !== null ? ` (${counts.total})` : ""}` : f}
              </button>
            ))}
          </div>

          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead">
              <span className="exec-gov-paneltitle">Register</span>
              <span className="exec-gov-meta">click a row for its source decision</span>
            </div>
            <div className="exec-gate-criteriawrap">
              <table className="exec-360-sync exec-gate-criteria exec-gate-wvtable">
                <thead>
                  <tr>
                    <th scope="col">condition</th>
                    <th scope="col">source decision</th>
                    <th scope="col">subject</th>
                    <th scope="col">env</th>
                    <th scope="col" data-numeric="true">due</th>
                    <th scope="col">state</th>
                    <th scope="col">owner</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const due = remaining(r, readAt, tick);
                    return (
                      <Fragment key={r.conditionId}>
                        <tr data-state={r.state} data-expanded={expanded === r.conditionId ? "true" : undefined} className="exec-wv-row">
                          <th scope="row">
                            <button
                              type="button"
                              className="exec-wv-rowbtn"
                              aria-expanded={expanded === r.conditionId}
                              onClick={() => setExpanded((cur) => (cur === r.conditionId ? null : r.conditionId))}
                            >
                              <span className="exec-wv-carret" aria-hidden="true">{expanded === r.conditionId ? "▾" : "▸"}</span>
                              {r.statement}
                            </button>
                          </th>
                          <td><a href={sourceHref(r)}>{r.approvalId} · {r.gate}</a></td>
                          <td>{r.subjectLabel}</td>
                          <td><span className="exec-gov-chip" data-fill="good">{r.environment}</span></td>
                          <td className="exec-num"><span className="exec-wv-duenum" data-live={r.state === "EXPIRING" ? "true" : undefined} data-tone={due.tone}>{due.text}</span></td>
                          <td>
                            <span className="exec-gov-chip" data-fill={STATE_FILL[r.state]} data-pulse={r.state === "EXPIRING" ? "true" : undefined}>{r.state}</span>
                            {r.state === "LAPSED" || r.blocking ? <span className="exec-wv-blocking"> BLOCKING</span> : null}
                          </td>
                          <td>{r.owner}</td>
                        </tr>
                        {expanded === r.conditionId ? (
                          <tr className="exec-wv-detailrow" data-state={r.state}>
                            <td colSpan={7}>
                              <div className="exec-wv-detail">
                                <span className="exec-wv-detailk">obligation</span>
                                <span className="exec-wv-detailv">{r.label} · {r.kind} · policy {r.policyVersion}</span>
                                <span className="exec-wv-detailk">closes by</span>
                                <span className="exec-wv-detailv">
                                  a decision on <a href={sourceHref(r)}>{r.approvalId}</a> — this register only watches;
                                  opened {r.createdAt ? r.createdAt.slice(0, 10) : "date not stated"} · owner {r.owner}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <th scope="row" colSpan={7}>no conditions in this state — an empty filter is a fact, not a failure</th>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {/* With no page there is nothing to move within, so a pair of dead
                buttons would be the wrong statement entirely. When there is a
                page, each closed direction says why — the contract publishes
                only the two booleans, so the sentence is ours and says so
                plainly rather than pretending to quote the server. */}
            {page ? (
              <div className="exec-wv-pager">
                <button type="button" className="exec-inbox-filter" disabled={!page.hasPrevious} onClick={onPrev}
                  title={page.hasPrevious ? undefined : "this is the newest page in this filter"}>← newer</button>
                <span className="exec-role-meta">
                  {rows.length} of {page.filteredCount ?? "?"} in this state · register total {page.totalCount ?? "?"} · exact server counts, keyset paged
                </span>
                <button type="button" className="exec-inbox-filter" disabled={!page.hasMore} onClick={onNext}
                  title={page.hasMore ? undefined : "no older page — the register ends here for this filter"}>older →</button>
              </div>
            ) : (
              <p className="exec-role-meta">No page was returned for this filter{reason ? ` — ${reason}` : ""}.</p>
            )}
            <p className="exec-role-meta exec-gate-criteriafoot">
              a WAIVED row names the policy revision that granted it and expires with a policy change ·
              LAPSED is blocking and enters Command Center today as CONDITION_EXPIRY — never a quiet default
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/** Fetches pages + exact per-state counts through the port. */
export function WaiversRegisterContainer({ api }: { api: ExecutionApi }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [cursor, setCursor] = useState<{ after?: string; before?: string }>({});
  const [page, setPage] = useState<ConditionsPage | null>(null);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [counts, setCounts] = useState<WaiverCounts>({ total: null, byState: {} });
  const [composition, setComposition] = useState<OperationalComposition | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    // Goal 9: the composition carries this register *and* the four
    // cross-cutting blocks, and it takes the same filter and cursor, so it
    // replaces the standalone read instead of joining it — the per-state count
    // probes below are unchanged and the request count stays where it was.
    void api
      .getOperationalComposition("waivers", {
        state: filter === "ALL" ? undefined : filter,
        limit: PAGE_SIZE,
        ...cursor,
      })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setComposition(result.value);
          setPage(readConditionsPage(result.value.data.waivers_register));
          setStatus("ok");
        } else {
          setComposition(null);
          setPage(null);
          setStatus(result.status);
          setReason(result.reason);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, filter, cursor]);

  // Exact per-state counts are the SERVER's `filtered_count`, one bounded
  // probe per state — never a client-side tally of a partial page.
  useEffect(() => {
    let cancelled = false;
    const states: WaiverStateCode[] = ["OPEN", "EXPIRING", "LAPSED", "WAIVED"];
    void Promise.all(states.map((state) => api.getWaivers({ state, limit: 1 }))).then((results) => {
      if (cancelled) return;
      const byState: WaiverCounts["byState"] = {};
      let total: number | null = null;
      results.forEach((result, i) => {
        byState[states[i]] = result.ok ? result.value.filteredCount : "unreadable";
        if (result.ok && result.value.totalCount !== null) total = result.value.totalCount;
      });
      setCounts({ total, byState });
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <>
      {/* Goal 9: the composition behind this register also carries the command
          authority that explains why every waiver control is dark, the redacted
          journal of what has run, per-profile source health and the canary twin
          comparison — all four were being fetched and none shown. */}
      <CrossEvidence composition={composition} label="Command authority, journal and cross-profile evidence" />
    <WaiversRegisterScreen
      page={page}
      counts={counts}
      filter={filter}
      onFilter={(next) => {
        setCursor({});
        setFilter(next);
      }}
      onNext={() => page?.nextCursor && setCursor({ after: page.nextCursor })}
      onPrev={() => page?.prevCursor && setCursor({ before: page.prevCursor })}
      status={status}
      reason={reason}
    />
    </>
  );
}
