/**
 * Sandbox Overview — hi-fi "Sandbox Overview (entry for WF 1d)".
 *
 * The entry screen of the certification workflow: which deployments are in
 * certification, how far each one got, what is holding it, and what the next
 * step is. Rows derive from the deployment registry — a new sandbox deployment
 * appears here with zero code — and a row opens its certification workbench.
 *
 * Reads `sandbox.smoke.ts` until BR-EX-60 publishes `sandbox-overview.v1`.
 * Every figure on this screen is smoke and the page says so at the bottom.
 */
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { sbAge, sbClock } from "../clock";
import { sbPct } from "../sbFormat";
import type { SandboxDemo, SandboxTick, SbLink, SbRow } from "../sandbox.smoke";
import type { ProfileEnvelope } from "../api/profileRead";
import type { PanelStatus } from "../contracts";
import { utcStamp } from "../time";

export const SANDBOX_FILTERS = ["all", "halted", "findings"] as const;
export type SandboxFilter = (typeof SANDBOX_FILTERS)[number];
const LABEL: Record<SandboxFilter, string> = { all: "All", halted: "Halted", findings: "Open findings" };
const str = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;
const isOpenFinding = (row: Record<string, unknown>) => !["RESOLVED", "CLOSED"].includes((str(row.status) ?? "").toUpperCase());
const isHalted = (row: Record<string, unknown>) => ["HALTED", "PAUSED", "STOPPED"].includes((str(row.state) ?? "").toUpperCase());

/** Splices the note's identifiers into links without inventing new words. */
function Note({ text, links }: { text: string; links: SbLink[] }) {
  if (!links.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let rest = text;
  for (const l of links) {
    const i = rest.indexOf(l.label);
    if (i < 0) continue;
    out.push(rest.slice(0, i), <a key={l.label} href={l.href}>{l.label}</a>);
    rest = rest.slice(i + l.label.length);
  }
  out.push(rest);
  return <>{out}</>;
}

/** The seven certification segments — colour AND position, never colour alone. */
function StepBar({ row }: { row: SbRow }) {
  return (
    <span className="exec-sb-steps" role="img" aria-label={`certification ${row.progress}`}>
      {row.segments.map((s, i) => (
        <span key={i} className="exec-sb-seg" data-seg={s} data-live={s === "warn" || s === "bad" ? "true" : undefined} />
      ))}
    </span>
  );
}

export interface SandboxOverviewProps {
  /** `execution.sandbox-overview.v1` — the published truth. */
  envelope?: ProfileEnvelope | null;
  status?: PanelStatus;
  reason?: string;
  /** Reviewed hi-fi bundle — the lab passes it; the product never does. */
  demo?: SandboxDemo | null;
  demoTick?: SandboxTick;
}

export function SandboxOverview({ envelope = null, status = "ok", reason, demo, demoTick }: SandboxOverviewProps) {
  const smoke = demo ?? null;
  const { now, orders, filled, ack, fill } = demoTick ?? { now: new Date(0), orders: 0, filled: 0, ack: 0, fill: 0 };
  const [filter, setFilter] = useState<SandboxFilter>("all");
  const navigate = useNavigate();
  if (!smoke) {
    // Product: the reviewed layout over the published envelope, panel by panel.
    const deployments = envelope?.data.deployments ?? [];
    const findings = envelope?.data.reconciliation ?? [];
    const halted = deployments.filter(isHalted).length;
    const openFindings = findings.filter(isOpenFinding).length;
    const sourceStatus = status !== "ok" && status !== "partial" ? status : !envelope ? "unavailable" : null;
    const sourceReason = reason ?? (!envelope ? "No sandbox overview was published for this workspace." : undefined);
    const notPublished = <span className="exec-gate-unverified">not published</span>;
    return (
      <ExecutionSurface kind="deployments" className="exec-sb exec-af" data-hifi-exact="sandbox-overview">
        <ExecutionWorkspace layout="dense">
          <div className="exec-af-page">
            <header className="exec-af-masthead">
              <h1 className="exec-af-h1">Sandbox</h1>
              <span className="exec-af-sum">{deployments.length} deployment{deployments.length === 1 ? "" : "s"} published in certification</span>
              <span className="exec-af-wf">entry for WF 1d</span>
              <span className="exec-af-spacer" />
              <span className="exec-af-source">
                <b>{envelope?.sourceAuthority ?? "authority not stated"}</b> · as_of <span className="exec-af-num">{utcStamp(envelope?.asOfMs ?? envelope?.asOf ?? null)}</span> · {(envelope?.state ?? "unavailable").toUpperCase()}
              </span>
            </header>
            {sourceStatus ? <div className="exec-af-panel"><PanelState status={sourceStatus} reason={sourceReason} /></div> : null}
            <div className="exec-af-kpis exec-sb-kpis">
              <div className="exec-af-kpi">
                <div className="exec-af-kpilabel">In certification</div>
                <div className="exec-af-kpival">{deployments.length}</div>
                <div className="exec-af-kpisub">published deployments</div>
              </div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Halted</div><div className="exec-af-kpival" data-tone={halted > 0 ? "warn" : undefined}>{halted}</div><div className="exec-af-kpisub">returned deployment rows</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Open findings</div><div className="exec-af-kpival" data-tone={openFindings > 0 ? "bad" : undefined}>{openFindings}</div><div className="exec-af-kpisub">returned reconciliation rows</div></div>
              <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Test-fund equity</div><div className="exec-af-kpival">{notPublished}</div><div className="exec-af-kpisub">no balance relation is published by this overview profile</div></div>
              <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Broker sync</div><div className="exec-af-kpival">{envelope?.freshness ?? "not stated"}</div><div className="exec-af-kpisub">envelope freshness · {envelope?.completeness ?? "completeness not stated"}</div></div>
            </div>
            <div className="exec-af-panel">
              <div className="exec-scroll-x">
                <table className="exec-af-table exec-sb-table" aria-label="Deployments in certification">
                  <thead><tr><th>alpha · deployment</th><th>venue · account · portfolio</th><th>current source state</th><th>next step</th></tr></thead>
                  <tbody>
                    {deployments.map((row, i) => {
                      const id = typeof row.deployment_id === "string" ? row.deployment_id : `row ${i + 1}`;
                      return (
                        <tr key={id} className="exec-af-row">
                          <td><a href={`/deployments/sandbox/${encodeURIComponent(id)}`}><b>{str(row.strategy_id) ?? id}</b></a> <span className="exec-af-dim">· {id}</span></td>
                          <td className="exec-af-dim">{str(row.venue) ?? "venue not published"} · {str(row.account_id) ?? "account not published"} · {str(row.portfolio_id) ?? "portfolio not published"}</td>
                          <td>{str(row.state) ?? str(row.mode) ?? notPublished}</td>
                          <td><a href={`/deployments/sandbox/${encodeURIComponent(id)}`}>Open certification →</a></td>
                        </tr>
                      );
                    })}
                    {deployments.length === 0 ? (
                      <tr><td colSpan={4}><span className="exec-af-empty">No deployment is in certification — the source published an empty set, and an empty set is a fact.</span></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </ExecutionWorkspace>
      </ExecutionSurface>
    );
  }
  const rows = smoke.rows.filter((r) => filter === "all" || r.filters.includes(filter));
  const c = smoke.connectivity;
  const ackP50 = Math.round(ack), fillP50 = Math.round(fill);
  const carry = smoke.journal;
  const success = sbPct((filled / orders) * 100);
  return (
    <ExecutionSurface kind="deployments" className="exec-sb exec-af" data-hifi-exact="sandbox-overview">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Sandbox</h1>
            <span className="exec-af-sum">{smoke.summary}</span>
            <span className="exec-af-wf">entry for WF <a href="/deployments/sandbox/dep_77">1d</a></span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source">
              <span className="exec-af-livedot" aria-hidden="true" />
              <b>EXECUTION</b> · as_of <span className="exec-af-num">{sbClock(now)}</span>
            </span>
          </header>

          <div className="exec-af-kpis exec-sb-kpis">
            <div className="exec-af-kpi">
              <div className="exec-af-kpilabel">In certification</div>
              <div className="exec-af-kpival">{smoke.kpis.inCert.value}</div>
              <div className="exec-af-kpisub">{smoke.kpis.inCert.sub}</div>
            </div>
            <div className="exec-af-kpi" data-tint="true">
              <div className="exec-af-kpilabel" data-tone="warn">Halted</div>
              <div className="exec-af-kpival exec-af-pulse" data-tone="warn">{smoke.kpis.halted.value}</div>
              <div className="exec-af-kpisub">{smoke.kpis.halted.sub}</div>
            </div>
            <div className="exec-af-kpi">
              <div className="exec-af-kpilabel">Open findings</div>
              <div className="exec-af-kpival" data-tone="bad">{smoke.kpis.findings.value}</div>
              <div className="exec-af-kpisub"><a href={smoke.kpis.findings.link.href}>{smoke.kpis.findings.link.label}</a> recon dry-run · CRITICAL</div>
            </div>
            <div className="exec-af-kpi" data-wide="true">
              <div className="exec-af-kpilabel">Test-fund equity</div>
              <div className="exec-af-kpival">{smoke.kpis.equity.value} <span className="exec-af-kpiccy">{smoke.kpis.equity.ccy}</span></div>
              <div className="exec-af-kpisub">{smoke.kpis.equity.sub}</div>
            </div>
            <div className="exec-af-kpi" data-wide="true">
              <div className="exec-af-kpilabel">Broker sync</div>
              <div className="exec-af-kpival" data-tone="good">{sbAge(now)}</div>
              <div className="exec-af-kpisub">{smoke.kpis.sync.sub}</div>
            </div>
          </div>

          <div className="exec-af-filters" role="group" aria-label="Sandbox filter">
            {SANDBOX_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="exec-af-chip"
                data-active={filter === f ? "true" : undefined}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {LABEL[f]} ({smoke.counts[f]})
              </button>
            ))}
            <span className="exec-af-filternote">venue:</span>
            {/* "All" twice in one toolbar is two different questions with one
                label; the venue chip names its own axis. */}
            <button type="button" className="exec-af-chip" data-active="true" aria-pressed="true" disabled title="Venue filter needs sandbox-overview.v1 (BR-EX-60); one testnet venue is in use today">All venues</button>
            <button type="button" className="exec-af-chip" disabled title="Venue filter needs sandbox-overview.v1 (BR-EX-60)">OKX TESTNET</button>
            <span className="exec-af-chip exec-sb-dashed">BINANCE TESTNET — no deployment in certification, rows appear from the registry</span>
          </div>

          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table exec-sb-table" aria-label="Deployments in certification">
                <thead>
                  <tr>
                    <th>alpha · deployment</th>
                    <th>venue · account</th>
                    <th>portfolio → target</th>
                    <th>certification (7 steps)</th>
                    <th>status</th>
                    <th data-numeric="true">in stage</th>
                    <th>next step</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <SandboxRows key={r.dep} r={r} onOpen={() => navigate(r.href)} />
                  ))}
                  {rows.length === 0 ? (
                    <tr><td colSpan={7}><span className="exec-af-empty">No deployment matches this filter.</span></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>{smoke.tableFoot.left}</span>
              <span className="exec-af-spacer" />
              <span>{smoke.tableFoot.right}</span>
            </footer>
          </div>

          <div className="exec-sb-grid">
            <section className="exec-af-panel exec-sb-panel" aria-label="Testnet order execution — 7d, per deployment">
              <header className="exec-sb-head">
                <span className="exec-sb-title">Testnet order execution — 7d, per deployment</span>
                <span className="exec-af-spacer" />
                <span className="exec-sb-note">{carry.head}</span>
              </header>
              <div className="exec-scroll-x">
                <table className="exec-sb-jtable" aria-label="Testnet order journal">
                  <thead>
                    <tr>
                      <th>deployment</th>
                      <th data-numeric="true">orders</th>
                      <th data-numeric="true">filled</th>
                      <th data-numeric="true">rejected</th>
                      <th data-numeric="true">expired</th>
                      <th data-numeric="true">success</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><a href="/deployments/sandbox/dep_77">dep_77</a> · Carry</td>
                      <td data-numeric="true">{orders}</td>
                      <td data-numeric="true" data-tone="good">{filled}</td>
                      <td data-numeric="true" data-tone="warn">{carry.carryRejected}</td>
                      <td data-numeric="true" data-tone="mute">{carry.carryExpired}</td>
                      <td data-numeric="true" data-tone="good">{success}</td>
                    </tr>
                    <tr>
                      <td><a href="/deployments/sandbox/dep_91">dep_91</a> · Grid</td>
                      <td data-numeric="true">{carry.grid.orders}</td>
                      <td data-numeric="true" data-tone="good">{carry.grid.filled}</td>
                      <td data-numeric="true" data-tone="bad">{carry.grid.rejected}</td>
                      <td data-numeric="true" data-tone="mute">{carry.grid.expired}</td>
                      <td data-numeric="true" data-tone="bad">{carry.grid.success}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="exec-sb-types">
                <span className="exec-sb-typenote">{carry.typesNote}</span>
                <span className="exec-sb-typechips">
                  {carry.types.map((t) => <span key={t.label} className="exec-sb-type" data-tone={t.tone}>{t.label}</span>)}
                </span>
                <span className="exec-sb-note">{carry.rejects}<a href={carry.rejectsLink.href}>{carry.rejectsLink.label}</a></span>
              </div>
            </section>

            <section className="exec-af-panel exec-sb-panel" aria-label="Venue connectivity — testnet, live measures">
              <header className="exec-sb-head">
                <span className="exec-sb-title">Venue connectivity — testnet, live measures</span>
                <span className="exec-af-spacer" />
                <span className="exec-sb-note">{c.head}</span>
              </header>
              <div className="exec-sb-conn">
                <span className="exec-sb-connk">ACK latency</span>
                <span className="exec-sb-track"><span className="exec-sb-fill" data-tone="good" style={{ width: `${Math.round(ackP50 / c.ack.barK)}%` }} /></span>
                <span className="exec-sb-connv">{ackP50}ms / {Math.round(ackP50 * c.ack.k)}ms</span>
                <span className="exec-sb-connk">fill latency</span>
                <span className="exec-sb-track"><span className="exec-sb-fill" data-tone="accent" style={{ width: `${Math.round(fillP50 / c.fill.barK)}%` }} /></span>
                <span className="exec-sb-connv">{fillP50}ms / {Math.round(fillP50 * c.fill.k)}ms</span>
                {c.still.map((s) => (
                  <span key={s.k} className="exec-sb-connrow">
                    <span className="exec-sb-connk">{s.k}</span>
                    <span className="exec-sb-track"><span className="exec-sb-fill" data-tone={s.tone} style={{ width: `${s.pct}%` }} /></span>
                    <span className="exec-sb-connv">{s.v}</span>
                  </span>
                ))}
              </div>
              <footer className="exec-sb-connfoot">{c.note}<b>{c.noteB}</b>{c.noteTail}</footer>
            </section>
          </div>

          <section className="exec-af-panel exec-sb-panel" aria-label="Recently certified — left sandbox in the last 90d">
            <header className="exec-sb-head">
              <span className="exec-sb-title">Recently certified — left sandbox in the last 90d</span>
              <span className="exec-af-spacer" />
              <span className="exec-sb-note">{smoke.recent.head}</span>
            </header>
            <div className="exec-sb-recent">
              {smoke.recent.rows.map((r) => (
                <span key={r.at}>
                  <span className="exec-af-mute">{r.at}</span> <a href={r.subjectHref}>{r.subject}</a> — {r.verdict} · <a href={r.review.href}>{r.review.label}</a>{r.tail}<a href={r.dep.href}>{r.dep.label}</a>{r.close}
                </span>
              ))}
            </div>
          </section>

          <p className="exec-af-smoke">! {smoke.warning}</p>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function SandboxRows({ r, onOpen }: { r: SbRow; onOpen: () => void }) {
  return (
    <>
      <tr
        className="exec-af-row exec-sb-row"
        data-stalled={r.stalled ? "true" : undefined}
        role="button"
        tabIndex={0}
        aria-label={`${r.alpha} ${r.dep} — certification ${r.progress}`}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      >
        <td className="exec-sb-edge"><a href={r.href} onClick={(e) => e.stopPropagation()}><b>{r.alpha}</b></a> · {r.dep}</td>
        <td className="exec-af-dim">{r.venue} · <a href={r.accountHref} onClick={(e) => e.stopPropagation()}>{r.account}</a></td>
        <td className="exec-af-dim">
          <a href={r.portfolioHref} onClick={(e) => e.stopPropagation()}>{r.portfolio}</a>
          {r.target ? <> → {r.target} <span className="exec-af-sub" data-tone="warn">{r.targetNoteHref && r.targetNote ? <a href={r.targetNoteHref}>{r.targetNote}</a> : r.targetNote}</span></> : null}
        </td>
        <td><StepBar row={r} /> <span className="exec-af-dim">{r.progress}</span></td>
        <td><span className="exec-sb-status" data-tone={r.status.tone}>{r.status.label}</span></td>
        <td data-numeric="true" className="exec-af-dim" data-tone={r.stalled ? "warn" : undefined}>{r.inStage}</td>
        <td className="exec-af-go"><a href={r.next.href} onClick={(e) => e.stopPropagation()}>{r.next.label}</a></td>
      </tr>
      <tr className="exec-af-note exec-sb-note-row" data-stalled={r.stalled ? "true" : undefined}>
        <td colSpan={7}>
          <Note text={r.note} links={r.noteLinks} />
          {r.noteWarn ? <span data-tone="warn">{r.noteWarn}</span> : null}
        </td>
      </tr>
    </>
  );
}
