/**
 * Paper Overview — hi-fi "Paper Overview (entry for WF 1c/4h)", the entry
 * screen at /deployments/paper. It stands in front of the per-alpha
 * workbenches and answers the stage's own question — is each alpha behaving as
 * designed, how far through its window, and what happens next — before an
 * operator commits to one deployment.
 *
 * Two renders of one layout: `demo` (the lab's hi-fi bundle) draws every
 * reviewed panel; the product passes the published `execution.paper-overview.v1`
 * envelope instead, and each panel shows exactly what that envelope carries —
 * the deployments board from the published rows, and one honest state per
 * branch the contract has not published (BR-EX-62 derived insights).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { paperClock, untilVnOpen } from "../clock";
import { poCells, poSparkSeries } from "../poVisual";
import type { PaperOverviewDemo, PoBoardRow } from "../paper.smoke";
import { LinesChart, SparkLine } from "../components/marketChart";
import type { ProfileEnvelope } from "../api/profileRead";
import type { PanelStatus } from "../contracts";
import { utcStamp } from "../time";

export interface PaperOverviewProps {
  /** `execution.paper-overview.v1` — the published truth for this stage. */
  envelope?: ProfileEnvelope | null;
  status?: PanelStatus;
  reason?: string;
  /** Reviewed hi-fi bundle — the lab passes it; the product never does. */
  demo?: PaperOverviewDemo | null;
  demoWarning?: string;
  demoTick?: { now: Date };
}

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function PaperOverview({ envelope = null, status = "ok", reason, demo, demoWarning, demoTick }: PaperOverviewProps) {
  const PO = demo ?? null;
  const now = demoTick?.now ?? new Date(0);
  const [venue, setVenue] = useState("All");
  const navigate = useNavigate();
  if (!PO) {
    // Product: the reviewed layout over the published envelope, panel by panel.
    const deployments = envelope?.data.deployments ?? [];
    const sourceStatus = status !== "ok" && status !== "partial" ? status : !envelope ? "unavailable" : null;
    const sourceReason = reason ?? (!envelope ? "No paper overview was published for this workspace." : undefined);
    const insight = envelope?.capabilities.find((c) => c.capabilityId === "paper.derived-insights");
    const insightReason = insight && insight.state !== "AVAILABLE"
      ? `${insight.capabilityId} is ${insight.state}${insight.reasonCode ? ` · ${insight.reasonCode}` : ""}`
      : "The derived-insight series are not published for this overview (BR-EX-62).";
    return (
      <ExecutionSurface kind="deployments" className="exec-po" data-hifi-exact="paper-overview">
        <ExecutionWorkspace layout="dense">
          <div className="exec-po-page">
            <header className="exec-po-masthead">
              <h1 className="exec-po-h1">Paper</h1>
              <span className="exec-po-spacer" />
              <span className="exec-po-source">
                <b>{envelope?.sourceAuthority ?? "authority not stated"}</b> · as_of{" "}
                <span className="exec-po-num">{utcStamp(envelope?.asOf ?? null)}</span> · {(envelope?.state ?? "unavailable").toUpperCase()} · {envelope?.freshness ?? "freshness not stated"}
              </span>
            </header>

            {sourceStatus ? (
              <section className="exec-po-panel" aria-label="Paper source status">
                <PanelState status={sourceStatus} reason={sourceReason} />
              </section>
            ) : null}

            <div className="exec-po-kpis">
              <div className="exec-po-kpi">
                <div className="exec-po-kpilabel">In observation</div>
                <div className="exec-po-kpival">{deployments.length}</div>
                <div className="exec-po-kpisub">published deployments in paper</div>
              </div>
              <div className="exec-po-kpi">
                <div className="exec-po-kpilabel">Gate met</div>
                <div className="exec-po-kpival"><span className="exec-gate-unverified">not published</span></div>
                <div className="exec-po-kpisub">observation gates are read per workbench</div>
              </div>
              <div className="exec-po-kpi" data-wide="true">
                <div className="exec-po-kpilabel">Next gate ≈</div>
                <div className="exec-po-kpival" data-size="date"><span className="exec-gate-unverified">not published</span></div>
                <div className="exec-po-kpisub">no gate projection is published on this contract</div>
              </div>
              <div className="exec-po-kpi" data-wide="true">
                <div className="exec-po-kpilabel">Paper capital</div>
                <div className="exec-po-kpival" data-size="date"><span className="exec-gate-unverified">not published</span></div>
              </div>
              <div className="exec-po-kpi">
                <div className="exec-po-kpilabel">Drift alerts</div>
                <div className="exec-po-kpival"><span className="exec-gate-unverified">not published</span></div>
              </div>
            </div>

            <div className="exec-po-grid">
              <section className="exec-po-panel" aria-label="Cumulative return, normalized">
                <header className="exec-po-head">
                  <span className="exec-po-title">Cumulative return — normalized, own currency</span>
                </header>
                <div className="exec-po-plot">
                  <PanelState status="unavailable" reason={insightReason} />
                </div>
              </section>
              <section className="exec-po-panel" aria-label="Order funnel">
                <header className="exec-po-head">
                  <span className="exec-po-title">Order funnel — 7d</span>
                </header>
                <div className="exec-po-funnel">
                  <PanelState status="unavailable" reason={insightReason} />
                </div>
              </section>
            </div>

            <section className="exec-po-panel exec-po-runway" aria-label="Observation runway">
              <header className="exec-po-head">
                <span className="exec-po-title">Observation runway — published deployments</span>
                <span className="exec-po-spacer" />
                <span className="exec-po-note">{deployments.length} of {deployments.length} published</span>
              </header>
              <div className="exec-scroll-x"><div className="exec-po-board">
                {deployments.map((row, i) => {
                  const id = str(row.deployment_id) ?? `row ${i + 1}`;
                  const href = `/deployments/paper/${encodeURIComponent(id)}`;
                  return (
                    <div
                      key={id}
                      className="exec-po-row"
                      role="button"
                      tabIndex={0}
                      aria-label={`${id} — open the workbench`}
                      onClick={() => navigate(href)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(href); } }}
                    >
                      <div className="exec-po-id">
                        <div className="exec-po-alpha"><a href={href} onClick={(e) => e.stopPropagation()}><b>{id}</b></a> <span className="exec-po-dim">· {str(row.mode) ?? "mode not published"}</span></div>
                        <div className="exec-po-idline"><span className="exec-gate-unverified">alpha · portfolio · account not published on this contract</span></div>
                      </div>
                      <div className="exec-po-days">
                        <div className="exec-po-gateline"><span className="exec-gate-unverified">observation gate not published</span></div>
                      </div>
                      <div className="exec-po-next">
                        <a href={href} onClick={(e) => e.stopPropagation()}>Open workbench →</a>
                      </div>
                    </div>
                  );
                })}
                {deployments.length === 0 ? <p className="exec-po-empty">No deployment is in paper — the source published an empty set, and an empty set is a fact.</p> : null}
              </div></div>
            </section>
          </div>
        </ExecutionWorkspace>
      </ExecutionSurface>
    );
  }

  const rows = PO.runway.rows.filter((r) => venue === "All" || r.venue === venue);
  return (
    <ExecutionSurface kind="deployments" className="exec-po" data-hifi-exact="paper-overview">
      <ExecutionWorkspace layout="dense">
        <div className="exec-po-page">
          <header className="exec-po-masthead">
            <h1 className="exec-po-h1">Paper</h1>
            <span className="exec-po-gatechip">{PO.gateChip}</span>
            <span className="exec-po-spacer" />
            <span className="exec-po-source"><b>EXECUTION</b> · as_of <span className="exec-po-num">{paperClock(now)}</span></span>
          </header>

          <div className="exec-po-kpis">
            <div className="exec-po-kpi">
              <div className="exec-po-kpilabel">In observation</div>
              <div className="exec-po-kpival">{PO.kpis.observation.value}</div>
              <div className="exec-po-kpisub">{PO.kpis.observation.sub}</div>
            </div>
            <div className="exec-po-kpi">
              <div className="exec-po-kpilabel">Gate met</div>
              <div className="exec-po-kpival" data-tone="good">{PO.kpis.gateMet.value}</div>
              <div className="exec-po-kpisub"><a href={PO.kpis.gateMet.link.href}>{PO.kpis.gateMet.link.label}</a></div>
            </div>
            <div className="exec-po-kpi" data-wide="true">
              <div className="exec-po-kpilabel">Next gate ≈</div>
              <div className="exec-po-kpival" data-size="date">{PO.kpis.nextGate.value}</div>
              <div className="exec-po-kpisub">{PO.kpis.nextGate.sub}</div>
            </div>
            <div className="exec-po-kpi" data-wide="true">
              <div className="exec-po-kpilabel">Paper capital</div>
              <div className="exec-po-kpival" data-size="date">{PO.kpis.capital.value} <span className="exec-po-kpiccy">{PO.kpis.capital.ccy}</span></div>
              {/* Two currencies, two lines, one warning — a VND figure summed
                  into a USDT total would be the screen inventing an FX desk. */}
              <div className="exec-po-kpivnd">{PO.kpis.capital.vnd} <span data-tone="warn">{PO.kpis.capital.vndNote}</span></div>
            </div>
            <div className="exec-po-kpi">
              <div className="exec-po-kpilabel">Drift alerts</div>
              <div className="exec-po-kpival" data-tone="warn">{PO.kpis.drift.value}</div>
              <div className="exec-po-kpisub">{PO.kpis.drift.sub}</div>
            </div>
          </div>

          <div className="exec-po-scope" role="group" aria-label="Paper scope">
            <span className="exec-po-scopelabel">Scope</span>
            <button type="button" className="exec-po-chip" disabled title="Portfolio scope needs BR-EX-62; one portfolio per venue is in paper today">Portfolio All ⌄</button>
            {PO.venues.map((v) => (
              <button key={v} type="button" className="exec-po-chip" data-active={venue === v ? "true" : undefined} aria-pressed={venue === v} onClick={() => setVenue(v)}>{v}</button>
            ))}
            <span className="exec-po-scopenote">{PO.scopeNote}</span>
          </div>

          <div className="exec-po-grid">
            <section className="exec-po-panel" aria-label="Cumulative return, normalized">
              <header className="exec-po-head">
                <span className="exec-po-title">{PO.equity.title}</span>
                <span className="exec-po-spacer" />
                <span className="exec-po-note" data-size="9">{PO.equity.head}</span>
              </header>
              <div className="exec-po-plot">
                {/* A real chart, not a stand-in: axes, hover, and each series
                    normalized in its own currency — the tooltip says so. */}
                <LinesChart
                  height={150}
                  series={PO.returns.map((l) => ({ name: l.name, tone: l.tone, points: l.points }))}
                  zeroLine={{ label: "0%" }}
                  yFormatter={(v) => `${v.toFixed(1)}%`}
                  provenance={{ authority: "DERIVED", asOf: paperClock(now), formula: "equity_projection.v1 · own currency, never mixed" }}
                  ariaLabel="Cumulative return per deployment, own currency"
                />
              </div>
              <footer className="exec-po-legend">
                {PO.equity.legend.map((l) => <span key={l.label} data-tone={l.tone}>{l.label}</span>)}
                <span className="exec-po-spacer" />
                <span className="exec-po-dim">{PO.equity.foot}</span>
              </footer>
            </section>

            <section className="exec-po-panel" aria-label="Order funnel">
              <header className="exec-po-head">
                <span className="exec-po-title">{PO.funnel.title}</span>
                <span className="exec-po-spacer" />
                <span className="exec-po-note" data-size="9">{PO.funnel.head}</span>
              </header>
              <div className="exec-po-funnel">
                {PO.funnel.rows.map((f) => (
                  <div key={f.alpha}>
                    <div className="exec-po-funnelrow">
                      <span data-tone={f.tone}>{f.alpha} · {f.venue}</span>
                      <span>{f.stats.pre}<b data-tone={f.stats.rejTone}>{f.stats.rej}</b>{f.stats.post}</span>
                    </div>
                    <div className="exec-po-funnelbar" role="img" aria-label={`${f.alpha}: ${f.bar.filled}% filled, ${f.bar.working}% working, ${f.bar.rejected}% rejected, ${f.bar.skipped}% skipped`}>
                      <span data-seg="filled" style={{ width: `${f.bar.filled}%` }} />
                      <span data-seg="working" style={{ width: `${f.bar.working}%` }} />
                      <span data-seg="rejected" style={{ width: `${f.bar.rejected}%` }} />
                      <span data-seg="skipped" style={{ width: `${f.bar.skipped}%` }} />
                    </div>
                  </div>
                ))}
                <div className="exec-po-dim">{PO.funnel.legend}<a href={PO.funnel.legendLink.href}>{PO.funnel.legendLink.label}</a></div>
              </div>
            </section>
          </div>

          <section className="exec-po-panel exec-po-runway" aria-label="Observation runway">
            <header className="exec-po-head">
              <span className="exec-po-title">{PO.runway.title}</span>
              <span className="exec-po-spacer" />
              <span className="exec-po-note">{PO.runway.head}</span>
            </header>
            <div className="exec-scroll-x"><div className="exec-po-board">
              {rows.map((r) => <BoardRow key={r.dep} r={r} now={now} onOpen={() => navigate(r.href)} />)}
              {rows.length === 0 ? <p className="exec-po-empty">No deployment on this venue is in paper.</p> : null}
            </div></div>
            <footer className="exec-po-foot">
              <span>{PO.runway.footLeft}</span>
              <span className="exec-po-spacer" />
              <span>{PO.runway.footRight}</span>
            </footer>
          </section>

          <section className="exec-po-panel" aria-label="Left paper, last 90 days">
            <header className="exec-po-head"><span className="exec-po-title">{PO.leftPaper.title}</span></header>
            <div className="exec-po-left">
              {PO.leftPaper.rows.map((row, i) => (
                <span key={i} data-muted={row.muted ? "true" : undefined}>
                  {row.parts.map((p, j) => p.href ? <a key={j} href={p.href}>{p.t}</a> : <span key={j}>{p.t}</span>)}
                </span>
              ))}
            </div>
          </section>

          {demoWarning ? <p className="exec-po-smoke">! {demoWarning}</p> : null}
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function BoardRow({ r, now, onOpen }: { r: PoBoardRow; now: Date; onOpen: () => void }) {
  return (
    <div
      className="exec-po-row"
      data-met={r.gate.met ? "true" : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${r.alpha} on ${r.venue} — ${r.gate.label}`}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
    >
      <div className="exec-po-id">
        <div className="exec-po-alpha"><a href={r.href} onClick={(e) => e.stopPropagation()}><b>{r.alpha}</b></a> <span className="exec-po-dim">· {r.venue}</span></div>
        <div className="exec-po-idline">
          <a href={r.pfHref} onClick={(e) => e.stopPropagation()}>{r.pf}</a> · <a className="exec-po-dimlink" href={r.accountHref} onClick={(e) => e.stopPropagation()}>{r.account}</a> · {r.alloc}
        </div>
        <div className="exec-po-session" data-tone={r.session.tone}>
          {r.session.text}{r.session.countdown ? <b>{untilVnOpen(now)}</b> : null}
        </div>
      </div>
      <div className="exec-po-days">
        <div className="exec-po-gateline">
          <span data-tone={r.gate.met ? "good" : undefined}>{r.gate.label}</span>
          <span>{r.gate.trades}</span>
        </div>
        <div className="exec-po-cells" role="img" aria-label={`${r.days.results.length} of ${r.days.total} trading days observed`}>
          {poCells(r.days).map((c, i) => <span key={i} data-kind={c.kind} />)}
        </div>
        <div className="exec-po-projection">{r.projection}</div>
      </div>
      <div className="exec-po-drift">
        <div className="exec-po-driftlabel">drift · <span data-tone={r.drift.tone}>{r.drift.label}</span></div>
<SparkLine points={poSparkSeries(r.drift.spark.amp, r.drift.spark.drop)} tone={r.drift.tone === "warn" ? "warn" : r.drift.tone === "good" ? "good" : "mute"} height={26} width={130} />
      </div>
      <div className="exec-po-stats">win {r.win}<br />rej {r.rej}<br />fees {r.fees}</div>
      <div className="exec-po-pnl">{r.pnl}<div className="exec-po-pnlsub">net pnl</div></div>
      <div className="exec-po-next">
        <a href={r.next.href} data-met={r.next.met ? "true" : undefined} onClick={(e) => e.stopPropagation()}>{r.next.label}</a>
      </div>
    </div>
  );
}
