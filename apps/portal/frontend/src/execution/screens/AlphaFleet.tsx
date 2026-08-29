/**
 * Alpha Fleet — hi-fi "Alpha Fleet (list)", the entry screen for WF 2a.
 *
 * Every row is an alpha (`strategies`), expanding to its deployments
 * (`strategy_deployments`). Nothing here is published yet (registry feature
 * `EXECUTION_ALPHA_FLEET` is COMMISSIONED) — the page reads `alphaFleet.smoke.ts`
 * and says so at the foot. When BR-EX-49 delivers `fleet-list.v1`, the smoke
 * module is deleted and this screen reads the contract with the same shape.
 */
import { useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { SparkLine } from "../components/marketChart";
import { ExecutionWorkspace } from "../components/workspace";
import { PanelState } from "../components/states";
import { fleetSmoke, fmt2, useFleetTick, type FleetDeployment, type FleetRow, type StageChip , fleetSparkSeries } from "../alphaFleet.smoke";

export const FLEET_FILTERS = ["all", "live", "canary", "sandbox", "paper", "research"] as const;
export type FleetFilter = (typeof FLEET_FILTERS)[number];
const FILTER_LABEL: Record<FleetFilter, string> = { all: "All", live: "Live", canary: "Canary", sandbox: "Sandbox", paper: "Paper", research: "Research" };

function A({ href, children, className, bold }: { href: string | null; children: ReactNode; className?: string; bold?: boolean }) {
  if (!href) return <span className={className} style={bold ? { fontWeight: 600 } : undefined}>{children}</span>;
  return <a href={href} className={className} style={bold ? { fontWeight: 600 } : undefined}>{children}</a>;
}

function Chip({ chip }: { chip: StageChip }) {
  return <span className="exec-af-stage" data-tone={chip.tone} data-strong={chip.strong ? "true" : undefined} data-dashed={chip.dashed ? "true" : undefined}>{chip.label}</span>;
}

function Spark({ pts }: { pts: number[] }) {
  return <SparkLine points={fleetSparkSeries(pts)} tone="good" height={24} width={90} />;
}

function Note({ text, links }: { text: string; links?: { label: string; href: string }[] }) {
  if (!links?.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let rest = text;
  for (const l of links) {
    const i = rest.indexOf(l.label);
    if (i < 0) continue;
    parts.push(rest.slice(0, i), <a key={l.label} href={l.href}>{l.label}</a>);
    rest = rest.slice(i + l.label.length);
  }
  parts.push(rest);
  return <>{parts}</>;
}

function pnlOf(row: FleetRow, j: number): string | null {
  if (row.pnl === null) return null;
  if (row.pnlKey === "grid") return `+${fmt2(2066.4 + j * 1.4)}`;
  if (row.pnlKey === "mm") return `+${fmt2(18.6 + j * 0.5)}`;
  return row.pnl;
}
function depPnl(d: FleetDeployment, j: number): string | null {
  if (d.pnl === null) return null;
  if (d.pnlKey === "live") return `+${fmt2(1954.0 + j)}`;
  if (d.pnlKey === "canary") return `+${fmt2(112.4 + j * 0.4)}`;
  return d.pnl;
}

export interface AlphaFleetProps {
  filter?: FleetFilter;
  onFilterChange?: (f: FleetFilter) => void;
}

export function AlphaFleet({ filter: controlled, onFilterChange }: AlphaFleetProps) {
  const smoke = fleetSmoke();
  const { now, j } = useFleetTick();
  const [local, setLocal] = useState<FleetFilter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({ av_2041: true });
  const filter = controlled ?? local;
  const setFilter = (f: FleetFilter) => { setLocal(f); onFilterChange?.(f); };
  if (!smoke) {
    return (
      <ExecutionSurface kind="deployments" className="exec-fleet">
        <PanelState status="unavailable" reason="No fleet list is published — the Alpha Fleet feature is commissioned (BR-EX-49)." />
      </ExecutionSurface>
    );
  }
  const p2 = (n: number) => String(n).padStart(2, "0");
  const asOf = now.getTime() === 0 ? "—" : `${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}Z`;
  const hICT = (now.getUTCHours() + 7) % 24;
  const inSession = hICT >= 9 && (hICT < 14 || (hICT === 14 && now.getUTCMinutes() <= 45));
  const syncAge = `${(0.4 + ((now.getTime() / 1000) % 4.6)).toFixed(1)}s`;
  const rows = smoke.rows.filter((r) => filter === "all" || r.stageKeys.includes(filter));
  const sc = smoke.counts;
  return (
    <ExecutionSurface kind="deployments" className="exec-fleet exec-af" data-hifi-exact="alpha-fleet">
      <ExecutionWorkspace layout="dense">
        <div className="exec-af-page">
          <header className="exec-af-masthead">
            <h1 className="exec-af-h1">Alpha Fleet</h1>
            <span className="exec-af-sum">{smoke.summary.alphas} alphas · {smoke.summary.deployments} deployments · <span data-tone="bad">{smoke.summary.live} live</span></span>
            <span className="exec-af-wf">entry screen for WF 2a</span>
            <span className="exec-af-spacer" />
            <span className="exec-af-source"><span className="exec-af-livedot" aria-hidden="true" /><b>EXECUTION</b> · as_of <span className="exec-af-num">{asOf}</span></span>
          </header>
          <div className="exec-af-kpis">
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Live exposure</div><div className="exec-af-kpival" data-tone="bad">{smoke.kpis.exposure.value} <span className="exec-af-kpiccy">{smoke.kpis.exposure.ccy}</span></div><div className="exec-af-kpisub">{smoke.kpis.exposure.sub}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Fleet PnL · session</div><div className="exec-af-kpival" data-tone="good">+{fmt2(smoke.kpis.pnl.base + j * 1.9)} USDT</div><div className="exec-af-kpisub">{smoke.kpis.pnl.sub}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Deployments</div><div className="exec-af-kpival">{smoke.kpis.deployments.value}</div><div className="exec-af-kpisub">{smoke.kpis.deployments.sub}</div></div>
            <div className="exec-af-kpi" data-tint="true"><div className="exec-af-kpilabel" data-tone="warn">Needs attention</div><div className="exec-af-kpival exec-af-pulse" data-tone="bad">{smoke.kpis.attention.value} <span className="exec-af-kpiccy" data-tone="bad">{smoke.kpis.attention.label}</span></div><div className="exec-af-kpisub">{smoke.kpis.attention.sub}</div></div>
            <div className="exec-af-kpi"><div className="exec-af-kpilabel">Portfolios</div><div className="exec-af-kpiports">{smoke.kpis.portfolios.items.map((p, i) => <span key={p.label}>{i ? " · " : ""}<A href={p.href}>{p.label}</A></span>)}</div><div className="exec-af-kpisub">{smoke.kpis.portfolios.sub}</div></div>
          </div>
          <div className="exec-af-filters" role="group" aria-label="Stage">
            {FLEET_FILTERS.map((f) => (
              <button key={f} type="button" className="exec-af-chip" data-active={filter === f ? "true" : undefined} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {FILTER_LABEL[f]} ({sc[f]})
              </button>
            ))}
            <span className="exec-af-filternote">an alpha appears in every stage it holds a deployment in · sort: live exposure first, then furthest stage</span>
            <span className="exec-af-spacer" />
            <button type="button" className="exec-af-chip" disabled title="Venue and owner filters need fleet-list.v1 (BR-EX-49)">Venue All ▾</button>
            <button type="button" className="exec-af-chip" disabled title="Venue and owner filters need fleet-list.v1 (BR-EX-49)">Owner All ▾</button>
          </div>
          <div className="exec-af-panel">
            <div className="exec-scroll-x">
              <table className="exec-af-table" aria-label="Alpha fleet">
                <thead>
                  <tr>
                    <th className="exec-af-th-mark" />
                    <th>alpha · version</th><th>owner · portfolio</th><th>stage presence (deployments)</th>
                    <th data-numeric="true">alloc Σ</th><th data-numeric="true">net pnl · 30d</th><th data-numeric="true">max dd</th>
                    <th>equity 30d</th><th>health · next gate</th><th className="exec-af-th-go" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const expandable = Boolean(row.deployments?.length);
                    const isOpen = expandable && open[row.id] !== false && Boolean(open[row.id]);
                    const pnl = pnlOf(row, j);
                    return (
                      <FleetRows key={row.id} row={row} pnl={pnl} expandable={expandable} isOpen={isOpen} onToggle={() => setOpen((m) => ({ ...m, [row.id]: !isOpen }))} j={j} syncAge={syncAge} inSession={inSession} />
                    );
                  })}
                  {rows.length === 0 ? <tr><td colSpan={10} className="exec-af-empty">No alpha holds a deployment at this stage.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <footer className="exec-af-foot">
              <span>source: strategies (alpha_id = strategy_id) ⋈ strategy_deployments ⋈ portfolio_allocations ⋈ performance_snapshots / account_equity_snapshots (by deployment_id)</span>
              <span className="exec-af-spacer" />
              <span>row → Alpha 360° · deployment row → its stage workbench · per-currency PnL never FX-mixed</span>
            </footer>
          </div>
          <p className="exec-af-smoke">! {smoke.warning}</p>
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function FleetRows({ row, pnl, expandable, isOpen, onToggle, j, syncAge, inSession }: { row: FleetRow; pnl: string | null; expandable: boolean; isOpen: boolean; onToggle: () => void; j: number; syncAge: string; inSession: boolean }) {
  const health = row.health;
  return (
    <>
      <tr className="exec-af-row" data-dim={row.dim ? "true" : undefined} onClick={expandable ? onToggle : undefined} role={expandable ? "button" : undefined} tabIndex={expandable ? 0 : undefined} aria-expanded={expandable ? isOpen : undefined} onKeyDown={expandable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } } : undefined}>
        <td className="exec-af-mark">{expandable ? (isOpen ? "▾" : "▸") : ""}</td>
        <td><A href={row.href} bold>{row.alpha}</A><div className="exec-af-sub"><A href={row.href}>{row.id}</A> · {row.digest}{row.status ? ` · ${row.status}` : ""}</div></td>
        <td className="exec-af-dim">{row.owner}{row.portfolios.length ? <div className="exec-af-sub exec-af-sub-link">{row.portfolios.map((p, i) => <span key={p.label}>{i ? " → " : ""}<A href={p.href}>{p.label}</A></span>)}</div> : null}</td>
        <td><span className="exec-af-stages">{row.stages.map((c) => <Chip key={c.label} chip={c} />)}</span></td>
        <td data-numeric="true">{row.alloc ?? <span className="exec-af-mute">—</span>}{row.allocCcy ? <> <span data-tone="warn">{row.allocCcy}</span></> : null}</td>
        <td data-numeric="true">{pnl ? <><span data-tone="good">{pnl}</span> <span className="exec-af-mute" data-tone={row.pnlCcy === "VND" ? "warn" : undefined}>{row.pnlCcy}</span>{row.pnlNote ? <div className="exec-af-sub" data-tone="warn">{row.pnlNote}</div> : null}</> : <span className="exec-af-mute">—</span>}</td>
        <td data-numeric="true" data-tone={row.ddTone}>{row.dd ?? <span className="exec-af-mute">—</span>}</td>
        <td>{row.spark ? <Spark pts={row.spark} /> : <span className="exec-af-mute">{row.sparkNote ?? "—"}</span>}</td>
        <td>
          {health.sessionClock ? <span className="exec-af-mute">{inSession ? "market OPEN · session live" : "SUSPENDED_BY_CALENDAR — resumes 09:00 ICT"}</span> : (
            <><span data-tone={health.tone}>{health.text}</span>{health.link ? <>{health.text.endsWith(" ") ? null : health.tail}<a href={health.link.href}>{health.link.label}</a>{health.text.endsWith(" ") ? health.tail : null}</> : health.tail}</>
          )}
        </td>
        <td className="exec-af-go">{row.href ? <a href={row.href} aria-label={`Open ${row.alpha}`}>→</a> : <span className="exec-af-mute">—</span>}</td>
      </tr>
      <tr className="exec-af-note" data-dim={row.dim ? "true" : undefined}><td colSpan={10}>{expandable ? `${row.deployments!.length} deployments (strategy_deployments) · click to ${isOpen ? "collapse" : "expand"}` : <Note text={row.note} links={row.noteLinks} />}</td></tr>
      {isOpen && row.deployments ? row.deployments.map((d, i) => {
        const p = depPnl(d, j);
        return (
          <tr key={d.id} className="exec-af-dep" data-last={i === row.deployments!.length - 1 ? "true" : undefined}>
            <td />
            <td>└ <a href={d.href}>{d.id}</a></td>
            <td className="exec-af-mute">{d.venueMode}</td>
            <td><Chip chip={d.chip} /> <span className="exec-af-mute" data-tone={d.chipNoteTone}><Note text={d.chipNote} links={d.chipNoteLinks} /></span></td>
            <td data-numeric="true">{d.alloc}</td>
            <td data-numeric="true">{p ? <span data-tone="good">{p}{d.pnlCcy ? <> <span data-tone="warn">{d.pnlCcy}</span></> : null}</span> : <span className="exec-af-mute">—</span>}</td>
            <td data-numeric="true" className="exec-af-dim">{d.dd ?? <span className="exec-af-mute">—</span>}</td>
            <td className="exec-af-mute"><a href={d.accountHref}>{d.account}</a> · {d.portfolio}</td>
            <td><span data-tone={d.healthTone}>{d.healthLink ? d.health.replace(d.healthLink.label, "") : d.health}{d.syncTick ? ` ${syncAge}` : ""}</span>{d.healthLink ? <a href={d.healthLink.href}>{d.healthLink.label}</a> : null}</td>
            <td className="exec-af-go"><a href={d.href} aria-label={`Open ${d.id}`}>→</a></td>
          </tr>
        );
      }) : null}
    </>
  );
}
