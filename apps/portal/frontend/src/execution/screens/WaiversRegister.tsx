/**
 * Waivers & Conditions — the fleet-wide obligations register
 * (owner-commissioned 2026-08-30, ROADMAP §H.2.3). Conditions are created at
 * R1/R2 and resurface only on their own deployment's exit review; this screen
 * answers the risk reviewer's question none of those can: "what does the whole
 * fund owe right now, and which of it is about to expire?"
 *
 * Register rows are DECLARED SMOKE (WAIVER_ROWS) mirroring conditions that
 * already exist in the cast — nothing here invents an obligation. The
 * cross-fleet query ships with BR-EX-71; filters here narrow the loaded demo
 * rows and say so, because pretending a server query exists would be a lie
 * about scale.
 */
import { useState } from "react";

import { WAIVER_ROWS, type WaiverState } from "../governance.smoke";

const FILTERS = ["ALL", "OPEN", "EXPIRING", "WAIVED", "SATISFIED"] as const;
type Filter = (typeof FILTERS)[number];

const STATE_FILL: Record<WaiverState, "warn" | "bad" | "good"> = {
  OPEN: "warn",
  EXPIRING: "bad",
  WAIVED: "good",
  SATISFIED: "good",
};

export function WaiversRegisterScreen() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const rows = WAIVER_ROWS.filter((r) => filter === "ALL" || r.state === filter);
  const open = WAIVER_ROWS.filter((r) => r.state === "OPEN" || r.state === "EXPIRING").length;
  const expiring = WAIVER_ROWS.filter((r) => r.state === "EXPIRING").length;

  return (
    <section className="exec-gate exec-gov" aria-label="Waivers and conditions register" data-hifi-exact="waivers-register">
      <div className="exec-gate-kicker">GOVERNANCE · Obligations Register</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">Waivers &amp; Conditions <span className="exec-gov-dim">—</span> what the fund owes, fleet-wide</h1>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill="warn">{open} OPEN</span>
        {expiring > 0 ? <span className="exec-gov-chip" data-fill="bad">{expiring} EXPIRING</span> : null}
        <span className="exec-gov-meta">
          every row was created by a decision — R1/R2 conditions, exit-review carried questions,
          policy-bound waivers · a condition closes only by a decision, never by scrolling past it
        </span>
      </div>
      <p className="exec-af-smoke">
        ! SMOKE DATA — register rows mirror the cast&apos;s existing conditions; the cross-fleet
        query, due-clock and state transitions ship with BR-EX-71. Filters narrow these demo rows
        only. Delete when BR-EX-71 ships
      </p>

      <div className="exec-gov-panel">
        <div className="exec-gov-panelhead">
          <span className="exec-gov-paneltitle">Register</span>
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
                <tr key={r.id} data-state={r.state}>
                  <th scope="row">{r.text}</th>
                  <td><a href={r.source.href}>{r.source.label}</a></td>
                  <td>{r.deployment ? <a href={r.deployment.href}>{r.deployment.label}</a> : <span className="exec-gate-unverified">binding-scoped</span>}</td>
                  <td><span className="exec-gov-chip" data-fill="good">{r.stage}</span></td>
                  <td className="exec-num" data-tone={r.dueTone}>{r.due}</td>
                  <td><span className="exec-gov-chip" data-fill={STATE_FILL[r.state]}>{r.state}</span></td>
                  <td>{r.owner}</td>
                </tr>
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
