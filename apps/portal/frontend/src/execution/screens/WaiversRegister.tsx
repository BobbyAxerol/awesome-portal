/**
 * Waivers & Conditions — the fleet-wide obligations register
 * (owner-commissioned 2026-08-30, ROADMAP §H.2.3; polish pass same day after
 * owner review: "sáng tạo, kỹ, động hơn").
 *
 * The screen answers three questions in order, top to bottom:
 *   1. how much does the fund owe, and how urgent is it?  (strip + runway)
 *   2. where does the debt sit?                            (per-deployment chips)
 *   3. what exactly is each obligation, and what CLOSES it? (register + expand)
 *
 * Motion is real and honest: the EXPIRING clock ticks per second
 * (`useInboxTick`, gated by `smokeMotionAllowed` so audits and baselines
 * measure a still page), the runway bars are CSS-animated on mount under the
 * same reduced-motion guard, and nothing else moves — governance reads calm.
 *
 * Register rows are DECLARED SMOKE (`WAIVER_ROWS`) mirroring conditions that
 * already exist in the cast; the cross-fleet query ships with BR-EX-71.
 */
import { Fragment, useMemo, useState } from "react";

import { WAIVER_ROWS, WAIVER_RUNWAY_DAYS, type WaiverRow, type WaiverState } from "../governance.smoke";
import { useInboxTick } from "../approvalInbox.smoke";
import { ExecutionDecisionStrip } from "../components/workspace";

const FILTERS = ["ALL", "OPEN", "EXPIRING", "WAIVED", "SATISFIED"] as const;
type Filter = (typeof FILTERS)[number];

const STATE_FILL: Record<WaiverState, "warn" | "bad" | "good"> = {
  OPEN: "warn",
  EXPIRING: "bad",
  WAIVED: "good",
  SATISFIED: "good",
};

/** `3d 04:07:12` — the live remainder of a due clock, counting down. */
function countdown(row: WaiverRow, tick: number): string {
  if (row.dueDays === null) return row.due;
  const secondsLeft = Math.max(0, row.dueDays * 86_400 - row.dueAnchorSeconds - tick);
  const d = Math.floor(secondsLeft / 86_400);
  const h = String(Math.floor((secondsLeft % 86_400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0");
  const sec = String(secondsLeft % 60).padStart(2, "0");
  return `${d}d ${h}:${m}:${sec}`;
}

function DueCell({ row, tick }: { row: WaiverRow; tick: number }) {
  if (row.dueDays === null) {
    return <span className="exec-wv-duechip" data-tone={row.dueTone}>{row.due}</span>;
  }
  const pct = Math.min(100, Math.round((row.dueDays / WAIVER_RUNWAY_DAYS) * 100));
  return (
    <span className="exec-wv-due" data-tone={row.dueTone}>
      <span className="exec-wv-duenum" data-live={row.state === "EXPIRING" ? "true" : undefined}>
        {row.state === "EXPIRING" ? countdown(row, tick) : row.due}
      </span>
      <span className="exec-sla-bar exec-wv-duebar" aria-hidden="true">
        <span className="exec-wv-duefill" data-tone={row.dueTone} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

/** The runway: every clocked obligation placed on one shared time axis. */
function Runway({ rows, tick }: { rows: readonly WaiverRow[]; tick: number }) {
  const clocked = rows.filter((r) => r.dueDays !== null && (r.state === "OPEN" || r.state === "EXPIRING"));
  const unclocked = rows.filter((r) => r.dueDays === null && (r.state === "OPEN" || r.state === "EXPIRING"));
  return (
    <div className="exec-gov-panel" data-smoke="true">
      <div className="exec-gov-panelhead">
        <span className="exec-gov-paneltitle">Runway — what lapses when</span>
        <span className="exec-gov-meta">shared axis 0 → {WAIVER_RUNWAY_DAYS}d · a bar reaching zero becomes a blocking finding</span>
      </div>
      <div className="exec-wv-runway" role="list" aria-label="Obligation runway">
        {[...clocked].sort((a, b) => (a.dueDays ?? 0) - (b.dueDays ?? 0)).map((r) => {
          const pct = Math.min(100, Math.round(((r.dueDays ?? 0) / WAIVER_RUNWAY_DAYS) * 100));
          return (
            <div className="exec-wv-lane" role="listitem" key={r.id} data-state={r.state}>
              <span className="exec-wv-lanewho">
                {r.deployment ? <a href={r.deployment.href}>{r.deployment.label}</a> : "binding"} · {r.owner}
              </span>
              <span className="exec-wv-lanetrack" aria-hidden="true">
                <span className="exec-wv-lanefill" data-tone={r.dueTone} style={{ width: `${pct}%` }} />
                <span className="exec-wv-lanedot" data-tone={r.dueTone} style={{ left: `${pct}%` }} />
              </span>
              <span className="exec-wv-lanedue" data-tone={r.dueTone} data-live={r.state === "EXPIRING" ? "true" : undefined}>
                {r.state === "EXPIRING" ? countdown(r, tick) : r.due}
              </span>
              <span className="exec-wv-lanetext">{r.text}</span>
            </div>
          );
        })}
      </div>
      {unclocked.length > 0 ? (
        <p className="exec-gate-note">
          {unclocked.length} open obligation{unclocked.length > 1 ? "s are" : " is"} event-bound, not
          clocked — {unclocked.map((r) => `${r.id.replace("cn_", "#")} ${r.due}`).join(" · ")} — they
          close by their event, and the event is asserted by a decision
        </p>
      ) : null}
    </div>
  );
}

export function WaiversRegisterScreen() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [expanded, setExpanded] = useState<string | null>("cn_103");
  const tick = useInboxTick();
  const rows = WAIVER_ROWS.filter((r) => filter === "ALL" || r.state === filter);

  const open = WAIVER_ROWS.filter((r) => r.state === "OPEN").length;
  const expiring = WAIVER_ROWS.filter((r) => r.state === "EXPIRING").length;
  const waived = WAIVER_ROWS.filter((r) => r.state === "WAIVED").length;
  const nearest = useMemo(
    () => [...WAIVER_ROWS].filter((r) => r.dueDays !== null && r.state !== "SATISFIED").sort((a, b) => (a.dueDays ?? 99) - (b.dueDays ?? 99))[0],
    [],
  );
  const byDeployment = useMemo(() => {
    const m = new Map<string, { href: string; open: number }>();
    for (const r of WAIVER_ROWS) {
      if (r.state === "SATISFIED" || !r.deployment) continue;
      const cur = m.get(r.deployment.label) ?? { href: r.deployment.href, open: 0 };
      cur.open += 1;
      m.set(r.deployment.label, cur);
    }
    return [...m.entries()];
  }, []);

  return (
    <section className="exec-gate exec-gov" aria-label="Waivers and conditions register" data-hifi-exact="waivers-register">
      <div className="exec-gate-kicker">GOVERNANCE · Obligations Register</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">Waivers &amp; Conditions <span className="exec-gov-dim">—</span> what the fund owes, fleet-wide</h1>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill="warn">{open} OPEN</span>
        {expiring > 0 ? <span className="exec-gov-chip" data-fill="bad" data-pulse="true">{expiring} EXPIRING</span> : null}
        {waived > 0 ? <span className="exec-gov-chip" data-fill="good">{waived} WAIVED</span> : null}
        <span className="exec-gov-meta">
          every row was created by a decision — R1/R2 conditions, exit-review carried questions,
          policy-bound waivers · a condition closes only by a decision, never by scrolling past it
        </span>
      </div>
      <p className="exec-af-smoke">
        ! SMOKE DATA — register rows mirror the cast&apos;s existing conditions; the cross-fleet
        query, due-clock and state transitions ship with BR-EX-71. Delete when BR-EX-71 ships
      </p>

      <ExecutionDecisionStrip
        metrics={[
          { label: "Open + expiring", value: String(open + expiring), tone: open + expiring > 0 ? "warn" : "good" },
          { label: "Expiring ≤ 7d", value: String(expiring), tone: expiring > 0 ? "bad" : "good" },
          { label: "Next to lapse", value: nearest ? `${nearest.id.replace("cn_", "#")} · ${countdown(nearest, tick)}` : "—", tone: nearest?.dueTone },
          { label: "Active waivers", value: String(waived), tone: "good" },
          { label: "Deployments carrying debt", value: String(byDeployment.length) },
        ]}
      />

      <Runway rows={WAIVER_ROWS} tick={tick} />

      <div className="exec-wv-debtrow" role="group" aria-label="Obligations by deployment">
        <span className="exec-gov-meta">where the debt sits:</span>
        {byDeployment.map(([label, v]) => (
          <a className="exec-wv-debtchip" href={v.href} key={label}>
            {label} <b>{v.open}</b>
          </a>
        ))}
        <span className="exec-gov-meta">· counts exclude SATISFIED · a chip opens the deployment&apos;s workbench</span>
      </div>

      <div className="exec-gov-panel">
        <div className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Register</span>
          <span className="exec-gov-meta">click a row for what closes it</span>
          <div role="group" aria-label="Filter by state" className="exec-gate-wvfilters">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="exec-inbox-filter"
                aria-pressed={f === filter}
                data-active={f === filter ? "true" : undefined}
                onClick={() => setFilter(f)}
              >
                {f === "ALL" ? `All (${WAIVER_ROWS.length})` : f}
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
                <th scope="col">deployment</th>
                <th scope="col">stage</th>
                <th scope="col" data-numeric="true">due</th>
                <th scope="col">state</th>
                <th scope="col">owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr
                    data-state={r.state}
                    data-expanded={expanded === r.id ? "true" : undefined}
                    className="exec-wv-row"
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className="exec-wv-rowbtn"
                        aria-expanded={expanded === r.id}
                        onClick={() => setExpanded((cur) => (cur === r.id ? null : r.id))}
                      >
                        <span className="exec-wv-carret" aria-hidden="true">{expanded === r.id ? "▾" : "▸"}</span>
                        {r.text}
                      </button>
                    </th>
                    <td><a href={r.source.href}>{r.source.label}</a></td>
                    <td>{r.deployment ? <a href={r.deployment.href}>{r.deployment.label}</a> : <span className="exec-gate-unverified">binding-scoped</span>}</td>
                    <td><span className="exec-gov-chip" data-fill="good">{r.stage}</span></td>
                    <td className="exec-num"><DueCell row={r} tick={tick} /></td>
                    <td><span className="exec-gov-chip" data-fill={STATE_FILL[r.state]} data-pulse={r.state === "EXPIRING" ? "true" : undefined}>{r.state}</span></td>
                    <td>{r.owner}</td>
                  </tr>
                  {expanded === r.id ? (
                    <tr className="exec-wv-detailrow" data-state={r.state}>
                      <td colSpan={7}>
                        <div className="exec-wv-detail">
                          <span className="exec-wv-detailk">what closes it</span>
                          <span className="exec-wv-detailv">{r.closes}</span>
                          <span className="exec-wv-detailk">opened</span>
                          <span className="exec-wv-detailv">
                            {r.created} by <a href={r.source.href}>{r.source.label}</a> · owner {r.owner} — closing is a
                            decision on that surface, this register only watches
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <th scope="row" colSpan={7}>no conditions in this state — an empty filter is a fact, not a failure</th>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="exec-role-meta exec-gate-criteriafoot">
          {rows.length} of {WAIVER_ROWS.length} shown · a WAIVED row names the policy revision that
          granted it and expires with a policy change · EXPIRING escalates in Command Center before
          it lapses — a lapsed condition is a blocking finding, never a quiet default
        </p>
      </div>
    </section>
  );
}
