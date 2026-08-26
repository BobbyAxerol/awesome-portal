/**
 * Portfolio 360 · Overview panels from the hi-fi (WF 3a): live KPI strip,
 * equity vs benchmark segmented by configuration revision (30d · 90d · All),
 * cross-portfolio table, configuration log. All figures come from
 * `portfolio360.smoke.ts` until BR-EX-51; the honest contract KPIs are kept
 * on the screen below the strip.
 */
import { useState } from "react";
import { PF_SMOKE_TABS as T, pfSmoke, usePfTick } from "../portfolio360.smoke";

const fmt0 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmt2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PfLiveStrip() {
  const smoke = pfSmoke();
  const { now, j } = usePfTick();
  if (!smoke) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const asOf = now.getTime() === 0 ? "—" : `${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}Z`;
  const k = smoke.kpis;
  return (
    <div className="exec-pf2-kpis" data-smoke="true">
      <div className="exec-pf2-kpi" data-wide="true"><div className="exec-pf2-kpilabel"><span className="exec-pf2-livedot" aria-hidden="true" />NAV · marks live</div><div className="exec-pf2-kpival" data-size="lg">{fmt0(k.nav.base + j * 2.4)} <span className="exec-pf2-kpiccy">{k.nav.ccy}</span></div><div className="exec-pf2-kpisub" data-tone="good">+{fmt2(k.nav.todayBase + j * 1.1)} today · as_of {asOf}</div></div>
      <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Allocated</div><div className="exec-pf2-kpival">{k.allocated.value}</div><div className="exec-pf2-kpisub">{k.allocated.sub}</div></div>
      <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Exposure</div><div className="exec-pf2-kpival">{fmt0(k.exposure.base + j * 3)}</div><div className="exec-pf2-kpisub">{k.exposure.sub}</div></div>
      <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Return 30d</div><div className="exec-pf2-kpival" data-tone="good">{k.ret.value}</div><div className="exec-pf2-kpisub">{k.ret.sub}</div></div>
      <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Max DD 30d</div><div className="exec-pf2-kpival" data-tone="bad">{k.dd.value}</div><div className="exec-pf2-kpisub">{k.dd.sub}</div></div>
      <div className="exec-pf2-kpi" data-tint="true"><div className="exec-pf2-kpilabel" data-tone="warn">Attention</div><div className="exec-pf2-kpival exec-pf2-pulse" data-tone="bad">{k.attention.value} <span className="exec-pf2-kpiccy" data-tone="bad">{k.attention.label}</span></div><div className="exec-pf2-kpisub"><a href={k.attention.link.href}>{k.attention.link.label}</a> · {k.attention.sub}</div></div>
    </div>
  );
}

export function PfEraChart() {
  const smoke = pfSmoke();
  const [win, setWin] = useState<"30d" | "90d" | "all">("90d");
  if (!smoke) return null;
  const w = smoke.windows.find((x) => x.key === win)!;
  return (
    <section className="exec-pf2-panel" aria-label="Equity vs benchmark">
      <header className="exec-pf2-head">
        <span className="exec-pf2-title">Equity vs benchmark — segmented by config revision</span>
        <span className="exec-pf2-spacer" />
        <span role="group" aria-label="Window" className="exec-pf2-wins">
          {smoke.windows.map((x) => <button key={x.key} type="button" className="exec-pf2-chip" data-active={win === x.key ? "true" : undefined} aria-pressed={win === x.key} onClick={() => setWin(x.key)}>{x.key === "all" ? "All" : x.key}</button>)}
        </span>
        <span className="exec-pf2-note">1d buckets · TWR</span>
      </header>
      <div className="exec-pf2-plot">
        <svg viewBox="0 0 1120 170" preserveAspectRatio="none" className="exec-pf2-svg" role="img" aria-label={`PF-CRYPTO vs benchmark, ${w.label}`}>
          {w.eras.map((e) => <rect key={e.label} x={e.x0} y="0" width={e.x1 - e.x0} height="150" className="exec-pf2-era" data-tone={e.tone} />)}
          {w.cuts.map((c) => <line key={c} x1={c} y1="0" x2={c} y2="150" stroke="var(--line-strong)" strokeDasharray="3,3" />)}
          <polyline points={w.nav} fill="none" stroke="var(--good)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          <polyline points={w.bench} fill="none" stroke="var(--ink-faint)" strokeWidth="1.2" strokeDasharray="4,3" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="exec-pf2-eralabels">
          {w.eras.map((e) => <span key={e.label} style={{ left: `${(e.x0 / 1120) * 100}%` }}>{e.label}</span>)}
        </div>
      </div>
      <footer className="exec-pf2-foot">era shading = config revision in force — performance is attributable to a configuration, not just to time · solid PF-CRYPTO · dashed benchmark · window {w.label}</footer>
    </section>
  );
}

export function PfCrossPortfolio({ portfolioId }: { portfolioId: string }) {
  const smoke = pfSmoke();
  const { j } = usePfTick();
  if (!smoke) return null;
  return (
    <section className="exec-pf2-panel" aria-label="Cross-portfolio">
      <header className="exec-pf2-head"><span className="exec-pf2-title">Cross-portfolio — same window, same formulas</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">30d · per-currency, never FX-mixed</span></header>
      <div className="exec-scroll-x">
        <table className="exec-pf2-table">
          <thead><tr><th>portfolio</th><th data-numeric="true">nav</th><th data-numeric="true">30d</th><th data-numeric="true">max dd</th><th data-numeric="true">alphas</th><th data-numeric="true">live exp</th><th>30d shape</th></tr></thead>
          <tbody>
            {smoke.cross.map((r, i) => (
              <tr key={i} data-this={r.this ? "true" : undefined}>
                <td>{r.this ? <><b>{portfolioId}</b> <span className="exec-pf2-this">this</span></> : r.href ? <a href={r.href}>{r.id}</a> : <span className="exec-pf2-dim">{r.id}</span>}{r.sleeve ? <> <span className="exec-pf2-sleeve">{r.sleeve}</span></> : null}</td>
                <td data-numeric="true">{r.this ? fmt0(smoke.kpis.nav.base + j * 2.4) : r.nav}{r.navCcy ? <> <span data-tone="warn">{r.navCcy}</span></> : null}</td>
                <td data-numeric="true" data-tone="good">{r.ret}</td>
                <td data-numeric="true" className="exec-pf2-dim">{r.dd}</td>
                <td data-numeric="true">{r.alphas}</td>
                <td data-numeric="true" data-tone={r.liveTone}>{r.live}</td>
                <td><svg viewBox="0 0 80 20" preserveAspectRatio="none" className="exec-pf2-spark" aria-hidden="true"><polyline points={r.spark} fill="none" stroke="var(--good)" strokeWidth="1.4" /></svg></td>
              </tr>
            ))}
            <tr><td className="exec-pf2-dim">cross-portfolio corr</td><td colSpan={6} className="exec-pf2-corr">{smoke.crossCorr.text} <b>{smoke.crossCorr.value}</b> · {smoke.crossCorr.tail} · <span className="exec-pf2-dim">{smoke.crossCorr.note}</span></td></tr>
          </tbody>
        </table>
      </div>
      <footer className="exec-pf2-foot">rank is within same base currency only · VND sleeve listed, never summed · row → that portfolio's 360°</footer>
    </section>
  );
}

export function PfConfigLog() {
  const smoke = pfSmoke();
  if (!smoke) return null;
  return (
    <section className="exec-pf2-panel" aria-label="Configuration log">
      <header className="exec-pf2-head"><span className="exec-pf2-title">Configuration log — what changed, when, by whose approval</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">append-only · rev = era on the chart above · full money trail in Capital Ledger</span></header>
      <div className="exec-scroll-x">
        <table className="exec-pf2-table exec-pf2-config">
          <thead><tr><th>rev</th><th>date</th><th>change</th><th>detail</th><th>evidence</th><th data-numeric="true">since rev · pnl</th></tr></thead>
          <tbody>
            {smoke.config.map((r) => (
              <tr key={r.rev} data-current={r.current ? "true" : undefined} data-retired={r.retired ? "true" : undefined}>
                <td className="exec-pf2-rev"><b>{r.rev}</b>{r.current ? <> <span className="exec-pf2-current">current</span></> : null}</td>
                <td className="exec-pf2-dim">{r.date}</td>
                <td><span className="exec-pf2-change" data-tone={r.change.tone} data-dashed={r.change.dashed ? "true" : undefined}>{r.change.label}</span></td>
                <td className="exec-pf2-dim">{r.detail}{r.link ? <a href={r.link.href}>{r.link.label}</a> : null}{r.detailTail}</td>
                <td><a href={`/execution/operations?operation=${r.evidence.op}`}>{r.evidence.op}</a>{r.evidence.tail}</td>
                <td data-numeric="true" data-tone={r.pnlTone}>{r.pnl}{r.pnlCcy ? <> <span data-tone="warn">{r.pnlCcy}</span></> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="exec-pf2-foot">every rev = one verified operation + its approval — config history is replayable · "since rev" attributes PnL to the era it ran under</footer>
    </section>
  );
}

export function PfStructureExtras() {
  const smoke = pfSmoke();
  if (!smoke) return null;
  return (
    <>
      <div className="exec-pf2-kpis" data-cols="5">
        {smoke.structureKpis.map((k) => <div key={k.label} className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">{k.label}</div><div className="exec-pf2-kpival" data-tone={k.tone}>{k.value}{k.sub ? <> <span className="exec-pf2-kpisubval" data-tone={k.subTone}>{k.sub}</span></> : null}</div></div>)}
      </div>
    </>
  );
}

export function PfWhatIf() {
  const smoke = pfSmoke();
  if (!smoke) return null;
  return (
    <section className="exec-pf2-panel" aria-label="Leader impact">
      <header className="exec-pf2-head"><span className="exec-pf2-title">Leader impact — what if</span></header>
      <div className="exec-pf2-whatif">
        {smoke.whatIf.map((w) => <div key={w.label} className="exec-pf2-whatifrow"><span className="exec-pf2-kpilabel">{w.label}</span><span>{w.text}<b data-tone="good">{w.b}</b>{w.tail}</span></div>)}
        <p className="exec-pf2-note">local what-if estimates — marginal.v1 · labeled estimates, not certainties · apply via Rebalance plan → plan/apply/verify</p>
      </div>
      <header className="exec-pf2-head" data-mid="true"><span className="exec-pf2-title">Symbol overlap · duplicate exposure</span></header>
      <table className="exec-pf2-table exec-pf2-overlap"><tbody>
        {smoke.overlap.map((o) => <tr key={o.symbol}><td className="exec-pf2-dim">{o.symbol}</td><td className="exec-pf2-dim">{o.who}</td><td data-tone={o.tone}>{o.note}</td></tr>)}
      </tbody></table>
    </section>
  );
}

export function PfFooterLinks() {
  const smoke = pfSmoke();
  if (!smoke) return null;
  return <div className="exec-pf2-links">{smoke.links.map((l) => <a key={l.label} href={l.href} className="exec-pf2-btn">{l.label}</a>)}</div>;
}

export function PfSmokeNote() {
  const smoke = pfSmoke();
  return smoke ? <p className="exec-pf2-smoke">! {smoke.warning}</p> : null;
}

const opHref = (op: string) => `/execution/operations?operation=${op}`;
const Panel = ({ title, note, children, label }: { title: string; note?: React.ReactNode; children: React.ReactNode; label?: string }) => (
  <section className="exec-pf2-panel" aria-label={label ?? title}>
    <header className="exec-pf2-head"><span className="exec-pf2-title">{title}</span><span className="exec-pf2-spacer" />{note ? <span className="exec-pf2-note">{note}</span> : null}</header>
    {children}
  </section>
);

export function PfCorrMatrix() {
  if (!pfSmoke()) return null;
  const c = T.corr;
  return (
    <Panel title="Cross-alpha correlation · rolling 30d" note="★ benchmark pinned in-matrix" label="Cross-alpha correlation (hi-fi)">
      <table className="exec-pf2-table exec-pf2-corrm">
        <thead><tr><th /> {c.labels.map((l) => <th key={l} data-numeric="true">{l}</th>)}<th data-numeric="true" data-tone="warn">{c.bm}</th></tr></thead>
        <tbody>
          {c.rows.map((r, i) => (
            <tr key={r.label}>
              <td className="exec-pf2-dim">{r.label}</td>
              {r.cells.map((v, j) => <td key={j} data-numeric="true" data-self={i === j ? "true" : undefined} className={v === "—" ? "exec-pf2-dim" : undefined}>{v}</td>)}
              <td data-numeric="true" data-hot={r.bmHot ? "true" : undefined} className={r.bm === "—" ? "exec-pf2-dim" : undefined}>{r.bm}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="exec-pf2-foot">{c.foot.a}<span data-tone="warn">{c.foot.warn}</span>{c.foot.b}</footer>
    </Panel>
  );
}

export function PfMarketCorr() {
  if (!pfSmoke()) return null;
  const m = T.market;
  return (
    <Panel title={m.title} note={m.sub}>
      <div className="exec-pf2-plotpad">
        <svg viewBox="0 0 640 200" className="exec-pf2-svgauto" role="img" aria-label={m.sub} style={{ fontFamily: "var(--font-mono)" }}>
          <line x1="0" y1={m.thresholdY} x2="640" y2={m.thresholdY} stroke="var(--warn)" strokeWidth="1" strokeDasharray="4 4" />
          <text x="4" y={m.thresholdY - 5} fontSize="9" fill="var(--warn)">{m.thresholdLabel}</text>
          <rect x={m.band.x} y="16" width={m.band.w} height="168" fill="var(--warn)" opacity="0.07" />
          <polyline points={m.line} fill="none" stroke="var(--accent)" strokeWidth="2" />
          <text x={m.band.x + 2} y="180" fontSize="9" fill="var(--warn)">{m.band.label}</text>
          <text x={m.now.x} y={m.now.y} fontSize="9" fill="var(--accent)">{m.now.label}</text>
        </svg>
      </div>
      <div className="exec-pf2-facts">{m.facts.map((f) => <span key={f.k}>{f.k} <b data-tone={f.tone}>{f.v}</b>{f.tail}</span>)}<span className="exec-pf2-dim">{m.meta}</span></div>
    </Panel>
  );
}

export function PfLeadership({ lens, onLens }: { lens: boolean; onLens: () => void }) {
  if (!pfSmoke()) return null;
  const l = T.leadership;
  return (
    <section className="exec-pf2-panel" aria-label="Alpha leadership (hi-fi)">
      <header className="exec-pf2-head"><span className="exec-pf2-title">Alpha leadership — who drives the book</span><span className="exec-pf2-spacer" /><button type="button" className="exec-pf2-chip exec-pf2-lens" data-active={lens ? "true" : undefined} aria-pressed={lens} onClick={onLens}>Leader lens</button></header>
      <div className="exec-pf2-bars">
        {l.bars.map((b) => (
          <div key={b.value + b.label}>
            <div className="exec-pf2-barrow"><span>{b.label}{b.b ? <b>{b.b}</b> : null}{b.tail ? <span className="exec-pf2-dim">{b.tail}</span> : null}</span><span className="exec-pf2-barval">{b.value}</span></div>
            <div className="exec-pf2-bar"><div className="exec-pf2-barfill" data-tone={b.tone} style={{ width: `${b.pct}%` }} /></div>
          </div>
        ))}
        <p className="exec-pf2-note">{l.meta}</p>
        <div className="exec-pf2-insight"><b data-tone="warn">{l.insight.code}</b> · {l.insight.grade} · <a href="/deployments/portfolios/PF-CRYPTO?tab=Audit">evidence refs →</a><br /><span className="exec-pf2-dim">{l.insight.text}</span></div>
      </div>
    </section>
  );
}

export function PfInfluence() {
  if (!pfSmoke()) return null;
  const m = T.influence;
  const stroke = (t: string) => (t === "warn" ? "var(--warn)" : "var(--accent)");
  return (
    <Panel title="Influence map" note="node = exposure · edge = |ρ| > 0.15" label="Influence map (hi-fi)">
      <div className="exec-pf2-plotpad">
        <svg viewBox="0 0 400 150" className="exec-pf2-svgauto" role="img" aria-label="Influence map" style={{ fontFamily: "var(--font-mono)" }}>
          {m.edges.map((e, i) => <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={stroke(e.tone)} strokeWidth={e.w} opacity="0.75" />)}
          {m.nodes.map((n) => <g key={n.label}><circle cx={n.cx} cy={n.cy} r={n.r} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" /><text x={n.cx} y={n.cy + 4} textAnchor="middle" fontSize={n.r > 20 ? 10 : 9} fill="var(--ink)">{n.label}</text></g>)}
          <circle cx={m.insufficient.cx} cy={m.insufficient.cy} r={m.insufficient.r} fill="none" stroke="var(--ink-mute)" strokeWidth="1.5" strokeDasharray="3 3" />
          <text x={m.insufficient.cx} y={m.insufficient.cy + 21} textAnchor="middle" fontSize="9" fill="var(--ink-mute)">{m.insufficient.label}</text>
          <rect x={m.bm.x} y={m.bm.y} width="28" height="28" fill="var(--warn-bg)" stroke="var(--warn)" strokeWidth="1.5" />
          <text x={m.bm.x + 14} y={m.bm.y + 17} textAnchor="middle" fontSize="9" fill="var(--warn)">{m.bm.label}</text>
          {m.labels.map((l) => <text key={l.t + l.x} x={l.x} y={l.y} fontSize="9" fill={stroke(l.tone)}>{l.t}</text>)}
        </svg>
      </div>
      <footer className="exec-pf2-foot">{m.foot}</footer>
    </Panel>
  );
}

export function PfDdOverlap() {
  if (!pfSmoke()) return null;
  const d = T.ddOverlap;
  return (
    <Panel title="Drawdown overlap — do they sink together?" note="bar = DD episode · depth in label" label="Drawdown overlap (hi-fi)">
      <div className="exec-pf2-plotpad">
        <svg viewBox="0 0 640 130" className="exec-pf2-svgauto" role="img" aria-label="Drawdown overlap" style={{ fontFamily: "var(--font-mono)" }}>
          <rect x={d.band.x} y="0" width={d.band.w} height="130" fill="var(--warn)" opacity="0.07" />
          {d.rows.map((r) => (
            <g key={r.label}>
              <text x="4" y={r.y} fontSize="10" fill={r.insufficient ? "var(--ink-mute)" : "var(--ink-soft)"}>{r.label}</text>
              {r.bars?.map((b, i) => <g key={i}><rect x={b.x} y={r.y - 8} width={b.w} height="10" fill="var(--bad-bg)" stroke="var(--bad)" />{b.depth ? <text x={b.x + b.w + 6} y={r.y} fontSize="9" fill="var(--bad)">{b.depth}</text> : null}</g>)}
              {r.insufficient ? <text x="120" y={r.y} fontSize="9" fill="var(--ink-mute)">{r.insufficient}</text> : null}
            </g>
          ))}
          <text x={d.band.x} y="126" fontSize="9" fill="var(--warn)">{d.bandLabel}</text>
        </svg>
      </div>
      <footer className="exec-pf2-foot">{d.foot}</footer>
    </Panel>
  );
}

export function PfLedgerHifi() {
  if (!pfSmoke()) return null;
  const l = T.ledger;
  return (
    <Panel title="Capital ledger — append-only" note={<>allocated <b className="exec-pf2-ink">{l.head.allocated}</b> / max {l.head.max} · free {l.head.free} {l.head.ccy}</>} label="Capital ledger (hi-fi)">
      <div className="exec-scroll-x"><table className="exec-pf2-table exec-pf2-config"><thead><tr><th>time (UTC)</th><th>type</th><th>account</th><th data-numeric="true">amount</th><th data-numeric="true">allocated →</th><th>operation</th><th>actor</th></tr></thead>
        <tbody>{l.rows.map((r) => <tr key={r.op}><td className="exec-pf2-dim">{r.t}</td><td><span className="exec-pf2-change" data-tone={r.tone}>{r.type}</span></td><td><a href={`/deployments/accounts/${r.account}`}>{r.account}</a></td><td data-numeric="true" data-tone={r.amountTone}>{r.amount}</td><td data-numeric="true">{r.alloc}</td><td><a href={opHref(r.op)}>{r.op}</a></td><td className="exec-pf2-dim">{r.actor}</td></tr>)}</tbody></table></div>
      <footer className="exec-pf2-foot">{l.foot}</footer>
    </Panel>
  );
}

export function PfApprovalsHifi() {
  if (!pfSmoke()) return null;
  const a = T.approvals;
  return (
    <Panel title="Approvals touching this portfolio" note="row → gate review screen · full inbox in Governance" label="Approvals (hi-fi)">
      <div className="exec-scroll-x"><table className="exec-pf2-table exec-pf2-config"><thead><tr><th>id</th><th>gate</th><th>subject</th><th>decision</th><th>approvers</th><th>decided</th><th data-numeric="true">conditions</th></tr></thead>
        <tbody>{a.rows.map((r) => <tr key={r.id}><td><a href={r.href}>{r.id}</a></td><td data-tone={r.gateTone === "paper" ? undefined : r.gateTone} className={r.gateTone === "paper" ? "exec-pf2-paper" : undefined}>{r.gate}</td><td className="exec-pf2-dim">{r.subject}</td><td><span className="exec-pf2-decision">{r.decision}</span></td><td className="exec-pf2-dim">{r.approvers}</td><td className="exec-pf2-dim">{r.decided}</td><td data-numeric="true">{r.conditions}</td></tr>)}</tbody></table></div>
      <footer className="exec-pf2-foot">{a.foot}</footer>
    </Panel>
  );
}

export function PfIncidentsHifi() {
  if (!pfSmoke()) return null;
  const i = T.incidents;
  return (
    <section className="exec-pf2-panel" aria-label="Incidents (hi-fi)">
      <header className="exec-pf2-head"><span className="exec-pf2-title">Incidents</span><span className="exec-pf2-spacer" /><span className="exec-pf2-decision">{i.open} OPEN</span></header>
      <p className="exec-pf2-incnote">{i.note}</p>
      <div className="exec-scroll-x"><table className="exec-pf2-table exec-pf2-config"><thead><tr><th>id</th><th>type</th><th>scope</th><th>opened</th><th>resolved</th><th data-numeric="true">duration</th></tr></thead>
        <tbody>{i.rows.map((r) => <tr key={r.id}><td><a href={r.href}>{r.id}</a></td><td data-tone="warn">{r.type}</td><td className="exec-pf2-dim">{r.scope}</td><td className="exec-pf2-dim">{r.opened}</td><td data-tone="good">{r.resolved}</td><td data-numeric="true">{r.duration}</td></tr>)}</tbody></table></div>
      <footer className="exec-pf2-foot">{i.foot}</footer>
    </section>
  );
}

export function PfAuditHifi() {
  if (!pfSmoke()) return null;
  const a = T.audit;
  return (
    <Panel title="Audit — portfolio-scoped trail" note="portfolio_audit_log + command journal · append-only" label="Audit (hi-fi)">
      <div className="exec-scroll-x"><table className="exec-pf2-table exec-pf2-config"><thead><tr><th>time (UTC)</th><th>actor</th><th>action</th><th>resource</th><th>evidence</th><th>state</th></tr></thead>
        <tbody>{a.rows.map((r) => <tr key={r.t}><td className="exec-pf2-dim">{r.t}</td><td className="exec-pf2-dim">{r.actor}</td><td>{r.action}</td><td className="exec-pf2-dim">{r.resource}</td><td>{r.evidence.op ? <><a href={opHref(r.evidence.op)}>{r.evidence.op}</a>{r.evidence.tail}</> : <span className="exec-pf2-dim">{r.evidence.text}</span>}</td><td><span className="exec-pf2-state" data-tone={r.stateTone}>{r.state}</span></td></tr>)}</tbody></table></div>
      <footer className="exec-pf2-foot">{a.foot}</footer>
    </Panel>
  );
}
