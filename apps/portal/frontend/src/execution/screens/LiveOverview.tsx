/**
 * Live Overview — hi-fi "Live Overview (entry)", entry screen for WF 1f/1e.
 *
 * The product passes the published `execution.live-overview.v1` envelope and
 * every panel shows exactly what it carries — a valid empty Live is empty.
 * The lab passes `demo` (the reviewed hi-fi bundle) instead.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { SparkLine } from "../components/marketChart";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { usePresentationChrome } from "../../app/presentation";
import { clockOfDate as clockOf } from "../clock";
import { fmt0, fmtPnl, sparkSeries } from "../liveFormat";
import type { LiveDemo, LiveRow, LiveTick } from "../live.smoke";
import type { ProfileEnvelope } from "../api/profileRead";
import type { PanelStatus } from "../contracts";
import { utcStamp } from "../time";

export const LIVE_FILTERS = ["all", "full", "canary", "issues"] as const;
export type LiveFilter = (typeof LIVE_FILTERS)[number];
const LABEL: Record<LiveFilter, string> = { all: "All", full: "Full", canary: "Canary", issues: "Issues" };

function Note({ text, links }: { text: string; links?: { label: string; href: string }[] }) {
  if (!links?.length) return <>{text}</>;
  const out: ReactNode[] = []; let rest = text;
  for (const l of links) { const i = rest.indexOf(l.label); if (i < 0) continue; out.push(rest.slice(0, i), <a key={l.label} href={l.href}>{l.label}</a>); rest = rest.slice(i + l.label.length); }
  out.push(rest); return <>{out}</>;
}

export interface LiveOverviewProps {
  /** `execution.live-overview.v1` — the published truth. Empty is a fact. */
  envelope?: ProfileEnvelope | null;
  status?: PanelStatus;
  reason?: string;
  /** Reviewed hi-fi bundle — the lab passes it; the product never does. */
  demo?: LiveDemo | null;
  demoTick?: LiveTick;
}

export function LiveOverview({ envelope = null, status = "ok", reason, demo, demoTick }: LiveOverviewProps) {
  const smoke = demo ?? null;
  const { now, j, price, prev, sp } = demoTick ?? { now: new Date(0), j: 0, price: 0, prev: 0, sp: [] };
  const [filter, setFilter] = useState<LiveFilter>("all");
  const chrome = usePresentationChrome();
  useEffect(() => {
    if (!smoke) return;
    chrome?.setChrome({ navBadge: { route: "/deployments/live", count: smoke.counts.issues, tone: "bad" }, price: { symbol: "BTCUSDT", value: price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), up: price >= prev } });
    return () => chrome?.setChrome({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, prev, smoke]);
  if (!smoke && status !== "ok" && status !== "partial") {
    return <ExecutionSurface kind="deployments" className="exec-lv"><PanelState status={status} reason={reason} /></ExecutionSurface>;
  }
  if (!smoke && !envelope) {
    return <ExecutionSurface kind="deployments" className="exec-lv"><PanelState status="unavailable" reason="No live overview was published for this workspace." /></ExecutionSurface>;
  }
  if (!smoke) {
    // Product: the reviewed layout over the published envelope. Live is empty
    // in this workspace today, and a valid empty Live renders as empty.
    const deployments = envelope!.data.deployments ?? [];
    const notPublished = <span className="exec-gate-unverified">not published</span>;
    return (
      <ExecutionSurface kind="deployments" className="exec-lv exec-af" data-hifi-exact="live-overview">
        <ExecutionWorkspace layout="dense">
          <div className="exec-af-page">
            <header className="exec-af-masthead">
              <h1 className="exec-af-h1">Live</h1>
              <span className="exec-af-sum">{deployments.length} live deployment{deployments.length === 1 ? "" : "s"} published</span>
              <span className="exec-af-wf">entry screen for WF 1f/1e</span>
              <span className="exec-af-spacer" />
              <span className="exec-af-source"><b>{envelope!.sourceAuthority ?? "authority not stated"}</b> · real capital · as_of <span className="exec-af-num">{utcStamp(envelope!.asOf)}</span> · {envelope!.state.toUpperCase()}</span>
            </header>
            <div className="exec-af-kpis exec-lv-kpis">
              <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Live capital Σ</div><div className="exec-af-kpival">{notPublished}</div><div className="exec-af-kpisub">account balances are published per deployment</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Session PnL</div><div className="exec-af-kpival">{notPublished}</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Gross exposure</div><div className="exec-af-kpival">{notPublished}</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Broker sync</div><div className="exec-af-kpival">{envelope!.freshness ?? "not stated"}</div><div className="exec-af-kpisub">envelope freshness · {envelope!.completeness ?? "completeness not stated"}</div></div>
            </div>
            <div className="exec-af-panel">
              <div className="exec-scroll-x">
                <table className="exec-af-table exec-lv-table" aria-label="Live deployments">
                  <thead><tr><th>deployment</th><th>mode</th><th>stage</th><th>venue · account · portfolio</th></tr></thead>
                  <tbody>
                    {deployments.map((row, i) => {
                      const id = typeof row.deployment_id === "string" ? row.deployment_id : `row ${i + 1}`;
                      return (
                        <tr key={id} className="exec-af-row exec-lv-row">
                          <td className="exec-lv-edge"><a href={`/deployments/live/${encodeURIComponent(id)}`}><b>{id}</b></a></td>
                          <td>{typeof row.mode === "string" ? row.mode : notPublished}</td>
                          <td>{notPublished}</td>
                          <td className="exec-af-dim">{notPublished}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {deployments.length === 0 ? (
                  <p className="exec-po-empty">No live deployment exists in this workspace — the source published an empty set, and nothing here will ever fill that in from a fixture.</p>
                ) : null}
              </div>
            </div>
          </div>
        </ExecutionWorkspace>
      </ExecutionSurface>
    );
  }
  const secs = now.getTime() / 1000;
  const wsAge = `${(0.4 + (secs % 4.6)).toFixed(1)}s`;
  const incAge = `${Math.floor((secs / 60) % 20) + 2}m`;
  const t1 = new Date(now.getTime() - 9000), t2 = new Date(now.getTime() - 26000);
  const rows = smoke.rows.filter((r) => filter === "all" || r.filters.includes(filter));
  return (
    <ExecutionSurface kind="deployments" className="exec-lv exec-af" data-hifi-exact="live-overview">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Live</h1>
            <span className="exec-af-sum">{smoke.summary}</span>
            <span className="exec-af-wf">entry screen for WF 1f/1e</span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source"><span className="exec-af-livedot" aria-hidden="true" /><b>EXECUTION + BROKER</b> · real capital · as_of <span className="exec-af-num">{clockOf(now)}</span></span>
          </header>
          <div className="exec-af-kpis exec-lv-kpis">
            <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Live capital Σ</div><div className="exec-af-kpival">{smoke.kpis.capital.value} <span className="exec-af-kpiccy">USDT</span></div><div className="exec-af-kpisub">{smoke.kpis.capital.sub}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Session PnL</div><div className="exec-af-kpival" data-tone="good">{fmtPnl(smoke.kpis.pnlBase + j * 1.1)}</div><div className="exec-af-kpisub">marks live · fees included</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Gross exposure</div><div className="exec-af-kpival">{fmt0(smoke.kpis.expBase + j * 4)}</div><div className="exec-af-kpisub">{(smoke.kpis.expPctBase + j * 0.02).toFixed(1)}% of live capital</div></div>
            <div className="exec-af-kpi" data-tint="true"><div className="exec-af-kpilabel" data-tone="warn">Fail-closed</div><div className="exec-af-kpival exec-af-pulse" data-tone="bad">{smoke.kpis.failClosed.n} <span className="exec-af-kpiccy" data-tone="bad">of {smoke.kpis.failClosed.of}</span></div><div className="exec-af-kpisub">{smoke.kpis.failClosed.sub}<a href={smoke.kpis.failClosed.link.href}>{smoke.kpis.failClosed.link.label}</a></div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Protective ladder</div><div className="exec-af-kpival" data-tone="good">{smoke.kpis.ladder.value}</div><div className="exec-af-kpisub">{smoke.kpis.ladder.sub}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Broker sync</div><div className="exec-af-kpival">ws {wsAge}</div><div className="exec-af-kpisub">{smoke.kpis.sync.sub}</div></div>
          </div>
          <div className="exec-af-filters" role="group" aria-label="Live filter">
            {LIVE_FILTERS.map((f) => <button key={f} type="button" className="exec-af-chip" data-active={filter === f ? "true" : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>{LABEL[f]} ({smoke.counts[f]})</button>)}
            <span className="exec-af-filternote">venue:</span>
            <button type="button" className="exec-af-chip" data-active="true" aria-pressed="true" disabled title="Venue filter needs live-overview.v1 (BR-EX-56); one venue is live today">All</button>
            <button type="button" className="exec-af-chip" disabled title="Venue filter needs live-overview.v1 (BR-EX-56)">BINANCE</button>
            <span className="exec-af-chip exec-lv-dashed">OKX · DERIBIT · VNM — none live yet, rows appear from registry</span>
          </div>
          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table exec-lv-table" aria-label="Live deployments">
                <thead><tr><th>alpha · deployment</th><th>stage</th><th>venue · account · portfolio</th><th data-numeric="true">alloc</th><th data-numeric="true">exposure</th><th data-numeric="true">session pnl</th><th data-numeric="true">dd</th><th>pulse 60m</th><th>health</th></tr></thead>
                <tbody>
                  {rows.map((r: LiveRow) => (
                    <LiveRows key={r.dep} r={r} j={j} sp={sp} incAge={incAge} />
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>row → stage workbench (Live Full / Canary Control Room) · account → Account 360° · portfolio → Portfolio 360°</span>
              <span className="exec-af-spacer" />
              <span>pnl &amp; exposure re-price with broker marks · health from freshness + recon, judged per-venue policy</span>
            </footer>
          </div>
          <div className="exec-lv-tape" aria-label="Live tape">
            <span className="exec-lv-tapelabel">Live tape</span>
            <span><span className="exec-af-mute">{clockOf(t1, false)}</span> dep_live_c32 · FILL BTCUSDT 0.0080 @ {price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            <span><span className="exec-af-mute">{clockOf(t2, false)}</span> dep_63 · quote refresh 12 symbols · spread 2.1bp</span>
            <span><span className="exec-af-mute">10:41:52</span> <span data-tone="bad">dep_live · MISMATCH — fail-closed</span></span>
            <span className="exec-af-spacer" /><a href="/deployments/blotter">full blotter →</a>
          </div>
          <p className="exec-af-smoke">! {smoke.warning}</p>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function LiveRows({ r, j, sp, incAge }: { r: LiveRow; j: number; sp: number[]; incAge: string }) {
  return (
    <>
      <tr className="exec-af-row exec-lv-row" data-hot={r.hot ? "true" : undefined}>
        <td className="exec-lv-edge"><a href={r.alphaHref}><b>{r.alpha}</b></a> · {r.dep}<div className="exec-af-sub"><Note text={r.sub} links={r.subLinks} /></div></td>
        <td><span className="exec-ab-chip" data-tone="bad" data-strong="true" data-shield={r.stage.canary ? "true" : undefined}>{r.stage.label}</span></td>
        <td className="exec-af-dim">{r.venue} · <a href={r.accountHref}>{r.account}</a> · <a href={`/deployments/portfolios/${r.portfolio}`}>{r.portfolio}</a></td>
        <td data-numeric="true">{r.alloc}</td>
        <td data-numeric="true" className="exec-af-dim">{r.exposure}</td>
        <td data-numeric="true" data-tone="good">{fmtPnl(r.pnlBase + j * r.pnlK)}</td>
        <td data-numeric="true" className="exec-af-dim">{r.dd}</td>
        <td><SparkLine points={sparkSeries(sp, r.sparkScale, r.sparkOff)} tone={r.sparkTone} height={20} width={90} /></td>
        <td><span className="exec-lv-health" data-tone={r.health.tone} data-pulse={r.health.pulse ? "true" : undefined}>{r.health.label}</span></td>
      </tr>
      <tr className="exec-af-note exec-lv-note" data-hot={r.hot ? "true" : undefined}><td colSpan={9}><Note text={r.note.replace("{incAge}", incAge)} links={r.noteLinks} /></td></tr>
    </>
  );
}
