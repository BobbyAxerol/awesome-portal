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
import { useInboxTick } from "../approvalInbox.smoke";
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
  byState: Partial<Record<WaiverStateCode, number | null>>;
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
  const tick = useInboxTick();
  const rows = page?.rows ?? [];
  const readAt = page?.readAt ?? null;

  const open = counts.byState.OPEN ?? null;
  const expiring = counts.byState.EXPIRING ?? null;
  const lapsed = counts.byState.LAPSED ?? null;
  const waived = counts.byState.WAIVED ?? null;
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
        {open !== null ? <span className="exec-gov-chip" data-fill="warn">{open} OPEN</span> : null}
        {expiring !== null && expiring > 0 ? <span className="exec-gov-chip" data-fill="bad" data-pulse="true">{expiring} EXPIRING</span> : null}
        {lapsed !== null && lapsed > 0 ? <span className="exec-gov-chip" data-fill="bad">{lapsed} LAPSED · BLOCKING</span> : null}
        {waived !== null && waived > 0 ? <span className="exec-gov-chip" data-fill="good">{waived} WAIVED</span> : null}
        <span className="exec-gov-meta">
          governance.conditions-register.v1 · PORTAL_CONTROL · states computed server-side — this
          screen renders them and never re-derives · a condition closes only by a decision
        </span>
      </div>

      <ExecutionDecisionStrip
        metrics={[
          { label: "Open + expiring", value: open !== null && expiring !== null ? String(open + expiring) : null, tone: (open ?? 0) + (expiring ?? 0) > 0 ? "warn" : "good" },
          { label: "Lapsed (blocking)", value: lapsed !== null ? String(lapsed) : null, tone: (lapsed ?? 0) > 0 ? "bad" : "good" },
          { label: "Active waivers", value: waived !== null ? String(waived) : null, tone: "good" },
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

          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead">
              <span className="exec-gov-paneltitle">Register</span>
              <span className="exec-gov-meta">click a row for its source decision</span>
              <div role="group" aria-label="Filter by state" className="exec-gate-wvfilters">
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
            <div className="exec-wv-pager">
              <button type="button" className="exec-inbox-filter" disabled={!page?.hasPrevious} onClick={onPrev}>← newer</button>
              <span className="exec-role-meta">
                {rows.length} of {page?.filteredCount ?? "?"} in this state · register total {page?.totalCount ?? "?"} · exact server counts, keyset paged
              </span>
              <button type="button" className="exec-inbox-filter" disabled={!page?.hasMore} onClick={onNext}>older →</button>
            </div>
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

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void api
      .getWaivers({ state: filter === "ALL" ? undefined : filter, limit: PAGE_SIZE, ...cursor })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setPage(result.value);
          setStatus("ok");
        } else {
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
        byState[states[i]] = result.ok ? result.value.filteredCount : null;
        if (result.ok && result.value.totalCount !== null) total = result.value.totalCount;
      });
      setCounts({ total, byState });
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
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
  );
}
