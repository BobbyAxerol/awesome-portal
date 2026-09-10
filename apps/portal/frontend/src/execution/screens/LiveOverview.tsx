/**
 * Live Overview — hi-fi "Live Overview (entry)", entry screen for WF 1f/1e.
 *
 * The product passes the published `execution.live-overview.v1` envelope and
 * every panel shows exactly what it carries — a valid empty Live is empty.
 * The lab passes `demo` (the reviewed hi-fi bundle) instead.
 */
import { ageFrom, ageLabel } from "../components/FreshnessBanner";
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
import { liveDot, sourceTone } from "../sourceTone";
import { pulses, useArrivals, useIds } from "../listMotion";
import { ID_ROUTES, IdLink } from "../idLinks";

export const LIVE_FILTERS = ["all", "full", "canary", "issues"] as const;
export type LiveFilter = (typeof LIVE_FILTERS)[number];
const LABEL: Record<LiveFilter, string> = { all: "All", full: "Full", canary: "Canary", issues: "Issues" };
const str = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;

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
  /** The projection stream's phase, for the masthead dot. */
  realtimePhase?: string | null;
}

export function LiveOverview({ envelope = null, status = "ok", reason, demo, demoTick, realtimePhase = null }: LiveOverviewProps) {
  const dot = liveDot(realtimePhase);
  const smoke = demo ?? null;
  const { now, j, price, prev, sp } = demoTick ?? { now: new Date(0), j: 0, price: 0, prev: 0, sp: [] };
  const [filter, setFilter] = useState<LiveFilter>("all");
  // Goal 6: deployments that appear between two projection reads flash once.
  // Declared above the smoke branch — a hook inside it would run in one
  // branch and not the other.
  const arrivals = useArrivals(useIds(envelope?.data.deployments ?? [], (row) => (typeof row.deployment_id === "string" ? row.deployment_id : null)), Boolean(envelope) && status === "ok");
  const chrome = usePresentationChrome();
  useEffect(() => {
    if (!smoke) return;
    chrome?.setChrome({ navBadge: { route: "/deployments/live", count: smoke.counts.issues, tone: "bad" }, price: { symbol: "BTCUSDT", value: price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), up: price >= prev } });
    return () => chrome?.setChrome({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price, prev, smoke]);
  if (!smoke) {
    // Product: the reviewed layout over the published envelope. Live is empty
    // in this workspace today, and a valid empty Live renders as empty.
    const deployments = envelope?.data.deployments ?? [];
    const positions = envelope?.data.positions ?? [];
    const balances = envelope?.data.account_balances ?? [];
    const brokerSync = envelope?.data.broker_sync ?? [];
    const brokerStates = [...new Set(brokerSync.map((row) => str(row.status)).filter((value): value is string => value !== null))];
    const brokerLabel = brokerStates.length === 1 ? brokerStates[0] : brokerSync.length > 0 ? `${brokerSync.length} sync rows` : "no sync row";
    const sourceStatus = status !== "ok" && status !== "partial" ? status : !envelope ? "unavailable" : null;
    const sourceReason = reason ?? (!envelope ? "No live overview was published for this workspace." : undefined);
    const notPublished = <span className="exec-gate-unverified">not published</span>;
    // Canary and Full are the source's own mode words; Issues is the row
    // carrying a state the source itself marks as degraded. None is inferred
    // from a number the browser computed.
    const isCanary = (row: Record<string, unknown>) => (str(row.mode) ?? "").toUpperCase().includes("CANARY") || (str(row.state) ?? "").toUpperCase().includes("CANARY");
    const isIssue = (row: Record<string, unknown>) => ["HALTED", "PAUSED", "STOPPED", "DEGRADED", "FAILED"].includes((str(row.state) ?? "").toUpperCase());
    const liveCounts = {
      all: deployments.length,
      canary: deployments.filter(isCanary).length,
      full: deployments.filter((row) => !isCanary(row)).length,
      issues: deployments.filter(isIssue).length,
    };
    const shown = filter === "all" ? deployments
      : filter === "canary" ? deployments.filter(isCanary)
        : filter === "issues" ? deployments.filter(isIssue)
          : deployments.filter((row) => !isCanary(row));
    return (
      <ExecutionSurface kind="deployments" className="exec-lv exec-af" data-hifi-exact="live-overview">
        <ExecutionWorkspace layout="dense">
          <div className="exec-af-page">
            <header className="exec-af-masthead">
              <h1 className="exec-af-h1">Live</h1>
              <span className="exec-af-sum">{deployments.length} live deployment{deployments.length === 1 ? "" : "s"} published</span>
              <span className="exec-af-wf">entry screen for WF 1f/1e</span>
              <span className="exec-af-spacer" />
              <span className="exec-af-source">
                <span className="exec-af-livedot" aria-hidden="true" data-live={dot.live ? undefined : "false"} data-tone={dot.tone ?? undefined} />
                <span className="sr-only">{dot.title}</span>
                <b>{envelope?.sourceAuthority ?? "authority not stated"}</b> · current source · as_of <span className="exec-af-num">{utcStamp(envelope?.asOfMs ?? envelope?.asOf ?? null)}</span> <span className="exec-af-dim">{`(${ageLabel(ageFrom(envelope?.asOfMs ?? null, Date.now()))})`}</span> · <span data-tone={sourceTone(envelope?.state) ?? undefined}>{(envelope?.state ?? "unavailable").toUpperCase()}</span>
              </span>
            </header>
            {sourceStatus ? <div className="exec-af-panel"><PanelState status={sourceStatus} reason={sourceReason} /></div> : null}
            <div className="exec-af-kpis exec-lv-kpis">
              <div className="exec-af-kpi" data-wide="true"><div className="exec-af-kpilabel">Published balances</div><div className="exec-af-kpival">{balances.length}</div><div className="exec-af-kpisub">current balance rows · no cross-currency sum is inferred</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Session PnL</div><div className="exec-af-kpival">{notPublished}</div><div className="exec-af-kpisub">no source PnL aggregate is published</div></div>
              <div className="exec-af-kpi"><div className="exec-af-kpilabel">Published positions</div><div className="exec-af-kpival">{positions.length}</div><div className="exec-af-kpisub">current position rows · no cross-currency sum is inferred</div></div>
              <div className="exec-af-kpi" data-tint={liveCounts.issues > 0 ? "true" : undefined}><div className="exec-af-kpilabel" data-tone={liveCounts.issues > 0 ? "warn" : undefined}>Broker sync</div><div className={liveCounts.issues > 0 ? "exec-af-kpival exec-af-pulse" : "exec-af-kpival"} data-tone={liveCounts.issues > 0 ? "warn" : undefined}>{brokerLabel}</div><div className="exec-af-kpisub">envelope {envelope?.freshness ?? "freshness not stated"} · {envelope?.completeness ?? "completeness not stated"}</div></div>
            </div>
            {/* The reviewed screen filters this table and dev had no filters at
                all, because they were written against the demo rows. They are
                derived from the published rows instead: each chip carries its
                own count, and a chip that can only ever show an empty table is
                disabled and says why rather than looking broken when pressed. */}
            <div className="exec-af-filters" role="group" aria-label="Live filter">
              {LIVE_FILTERS.map((key) => {
                const n = key === "all" ? deployments.length : liveCounts[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className="exec-af-filter"
                    data-active={filter === key ? "true" : undefined}
                    aria-pressed={filter === key}
                    disabled={n === 0}
                    title={n === 0 ? `No published live deployment is ${LABEL[key].toLowerCase()}.` : undefined}
                    onClick={() => setFilter(key)}
                  >
                    {LABEL[key]} <span className="exec-af-dim">{n}</span>
                  </button>
                );
              })}
              <span className="exec-af-spacer" />
              <span className="exec-af-dim">{shown.length} of {deployments.length} shown</span>
            </div>
            <div className="exec-af-panel">
              <div className="exec-scroll-x">
                <table className="exec-af-table exec-lv-table" aria-label="Live deployments">
                  <thead><tr><th>alpha · deployment</th><th>mode</th><th>current source state</th><th>venue · account · portfolio</th></tr></thead>
                  <tbody>
                    {shown.map((row, i) => {
                      const id = typeof row.deployment_id === "string" ? row.deployment_id : `row ${i + 1}`;
                      return (
                        <tr key={id} className="exec-af-row exec-lv-row" data-arrived={arrivals.has(id) ? "true" : undefined}>
                          <td className="exec-lv-edge"><a href={`/deployments/live/${encodeURIComponent(id)}`}><b>{str(row.strategy_id) ?? id}</b></a> <span className="exec-af-dim">· {id}</span></td>
                          <td>{str(row.mode) ?? notPublished}</td>
                          <td data-tone={sourceTone(str(row.state)) ?? undefined} data-pulse={pulses(sourceTone(str(row.state))) ? "true" : undefined}>{str(row.state) ?? "runtime state not published"}</td>
                          <td className="exec-af-dim">{str(row.venue) ?? "venue not published"} · <IdLink id={str(row.account_id)} href={ID_ROUTES.account} absent="account not published" /> · <IdLink id={str(row.portfolio_id)} href={ID_ROUTES.portfolio} absent="portfolio not published" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {shown.length === 0 ? (
                  <p className="exec-po-empty">
                    {deployments.length === 0
                      ? "No live deployment exists in this workspace — the source published an empty set, and nothing here will ever fill that in from a fixture."
                      : `No published live deployment matches ${LABEL[filter]}. The other ${deployments.length} are still there.`}
                  </p>
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
