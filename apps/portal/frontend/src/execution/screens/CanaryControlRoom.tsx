/**
 * Live Canary Control Room (HiFi 1e) on the V2 Paper anatomy.
 *
 * mode=live, stage=LIVE_CANARY — a guard treatment, not a new hue: exactly
 * one solid guard band (text + shield + double border), the rest of the page
 * is ordinary Carbon. The protective/scale-up asymmetry is a placement and
 * weight difference: protective actions sit in the rail's Next section;
 * scale-up sits under the guard rule, lighter. Commands stay disabled unless
 * the server's policy enables them — nothing here can enable itself.
 */
import { useState, type ReactNode } from "react";
import { Hint } from "../components/hint";
import { ExecutionSurface } from "../ExecutionSurface";
import { canarySmoke, clockZ, exitIn, fmtPlus, useCanaryTick } from "../canary.smoke";
import { PanelState } from "../components/states";
import { EquityChart } from "../components/EquityChart";
import { CapGauges, HistogramChart, PositionsTable, SparkTile, StageLinesChart } from "../components/visuals";
import type { StageVisuals } from "../stage.smoke";
import { SourceTile, StageGuardBand } from "../components/stageWorkbench";
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionWorkspace,
  shortDigest,
  type RailBlocker,
} from "../components/workspace";
import type { PanelStatus } from "../contracts";
import { guardAsymmetry, type CanaryActionPolicy, type CanaryControlRoom, type PanelEnvelope } from "../certification";

export function ActionGroup({ policy, title, brokerStale }: { policy: CanaryActionPolicy; title: string; brokerStale: boolean }) {
  const blockedByBroker = brokerStale && policy.brokerSyncBlocks;
  return (
    <section className="exec-canary-actions" aria-label={title}>
      <h3 className="exec-role-section">
        {title} <span className="exec-canary-note exec-role-meta">{policy.riskTier ?? "tier not stated"}</span>
      </h3>
      <button type="button" className="exec-role-control exec-btn-ghost" disabled={!policy.enabled || blockedByBroker}>
        {title}
      </button>
      {blockedByBroker ? <p className="exec-disabled-reason">Blocked while the broker snapshot is stale.</p> : null}
      {policy.blockerCodes.length > 0 ? (
        <div className="exec-disabled-reason">
          {policy.blockerCodes.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

const TABS = ["Envelope", "Positions & orders", "Reconciliation", "Guard rule"] as const;
type Tab = (typeof TABS)[number];

export function CanaryControlRoomScreen({
  room,
  status = "ok",
  reason,
  brokerStale = false,
  onCopyProvenance,
  visuals,
  children,
}: {
  room: CanaryControlRoom | null;
  status?: PanelStatus;
  reason?: string;
  brokerStale?: boolean;
  /** Stage visuals (smoke until BR-EX-41). Absent = honest states only. */
  visuals?: StageVisuals;
  onCopyProvenance?: (full: string) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Envelope");
  const smoke = canarySmoke();
  const { now, j } = useCanaryTick();
  const secs = now.getTime() / 1000;
  const wsAge = `${(0.4 + (secs % 4.6)).toFixed(1)}s`;
  const left = exitIn(now);
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-canary">
        <PanelState status={status} reason={reason} />
      </ExecutionSurface>
    );
  }
  if (!room) {
    return (
      <ExecutionSurface kind="deployments" className="exec-canary">
        <PanelState status="loading" reason="Loading the canary control room." />
      </ExecutionSurface>
    );
  }
  const guard = guardAsymmetry(room.commandPolicy);
  const policy = room.commandPolicy;
  const byId = new Map<string, PanelEnvelope>(room.sourcePanels.map((p) => [p.panelId, p]));
  const broker = byId.get("broker") ?? null;
  // Readiness degrades on a stale broker snapshot; an unreadable panel is its own badge.
  const degraded = brokerStale;
  const blockers: RailBlocker[] = [
    ...room.lifecycleBlockers.map((c) => ({ label: c, detail: "lifecycle", severity: "blocking" as const })),
    ...(room.envelope?.blockerCodes ?? []).map((c) => ({ label: c, detail: "canary envelope", severity: "blocking" as const })),
    ...(policy?.scaleUp?.blockerCodes ?? []).map((c) => ({ label: c, detail: "scale-up policy", severity: "watch" as const })),
    ...(brokerStale ? [{ label: "broker snapshot STALE", detail: "scale-up blocked · protective actions remain", severity: "watch" as const }] : []),
  ];
  const provenanceItems = [
    ...room.lineage.map((l) => ({ label: l.kind, short: l.value.startsWith("sha256:") ? shortDigest(l.value) : l.value, full: l.value.startsWith("sha256:") ? l.value : null, href: l.href })),
    ...(room.envelope?.evidenceSetHash ? [{ label: "evidence set", short: shortDigest(room.envelope.evidenceSetHash), full: room.envelope.evidenceSetHash }] : []),
    { label: "profile", short: room.deliveryProfile ?? "not stated", full: null },
  ];
  const limits = room.envelope
    ? [
        ["capital cap", room.envelope.limits.capitalCap, room.envelope.currency],
        ["gross notional cap", room.envelope.limits.grossNotionalCap, room.envelope.currency],
        ["daily loss cap", room.envelope.limits.dailyLossCap, room.envelope.currency],
        ["max open orders", room.envelope.limits.maxOpenOrders === null ? null : String(room.envelope.limits.maxOpenOrders), null],
        ["duration", room.envelope.limits.durationDays === null ? null : String(room.envelope.limits.durationDays), "days"],
      ]
    : [];
  const rail = (
    <ExecutionContextRail
      next={{
        title: "Promotion decision — via Canary Exit Review",
        detail: (
          <span className="exec-role-body">
            hold · reduce · rollback · request scale — evidence pack → Canary Exit Review; elapsed time alone never promotes (day {room.dayIndex ?? "—"} / {room.durationDays ?? "—"}).
          </span>
        ),
        action: policy?.protective?.visible ? (
          <div className="exec-stage-actions" data-weight="protective">
            <ActionGroup policy={policy.protective} title="Protective action" brokerStale={brokerStale} />
          </div>
        ) : (
          <p className="exec-canary-note exec-role-meta">
            No command controls are shown: production command authority is inactive for this profile, so there is nothing here that could be issued.
          </p>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {room.deliveryProfile ?? "profile not stated"} · {room.productionCommandActive ? "PRODUCTION COMMAND ACTIVE" : "PRODUCTION INACTIVE"} — no canary is running and no command can be issued from this screen.
          {broker?.asOf ? ` · broker as_of ${broker.asOf}` : ""}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance ?? (() => undefined)} />}
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-canary exec-a3 exec-ac exec-lf exec-cn" data-hifi-exact="canary-control-room">
      <StageGuardBand stage="LIVE · CANARY" note="real capital at risk when active · every action needs step-up auth and dual approval" />
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-canary-head">
          {/* Hi-fi 1e: double red frame with the shield; chips keep the contract's
              runtime + readiness axes; the smoke adds the words the contract
              does not carry yet (alpha · portfolio · venue, trial day, exit review). */}
          <header className="exec-masthead exec-ac-masthead exec-360-guard" data-live="true" aria-label="LIVE · CANARY — real capital at risk when active · every action needs step-up auth and dual approval">
            <svg viewBox="0 0 16 18" className="exec-ac-shield" aria-hidden="true"><path d="M8 1 L15 4 V9 C15 13.5 12 16.5 8 17.5 C4 16.5 1 13.5 1 9 V4 Z" fill="var(--bad-bg)" stroke="var(--bad)" strokeWidth="1.5" /></svg>
            <span className="exec-ac-live">LIVE · CANARY</span>
            <div className="exec-ac-h1" role="heading" aria-level={1}>{smoke?.title ?? (room.deploymentId ?? "deployment not stated")} <span className="exec-a3-id">· {smoke?.sub ?? `${room.portfolioId ?? "portfolio not stated"} · ${room.venue ?? "venue not stated"}`}</span></div>
            <span className="exec-ac-sync" data-tone={room.runtimeState === "ACTIVE" ? "good" : "warn"}>● {room.runtimeState ?? "runtime not stated"}</span>
            {degraded ? <span className="exec-cn-degraded">READINESS DEGRADED</span> : <span className="exec-cn-guarded">GUARDED</span>}
            <span className="exec-a3-wf">WF 1e</span>
            <span className="exec-a3-spacer" />
            <span className="exec-ac-facts exec-cn-facts">trial · envelope day <b>{room.dayIndex ?? "not stated"} / {room.durationDays ?? "not stated"}</b> · exit review in <b data-tone="warn">{left}</b> · real capital at risk</span>
          </header>
          {smoke ? (
            <>
              <div className="exec-lf-meta">
                {smoke.meta.map((m) => <span key={m.k}>{m.k} <a href={m.href}>{m.v}</a></span>)}
                <span className="exec-af-mute">{smoke.metaTail}</span>
              </div>
              {degraded ? (
                <div className="exec-cn-stale" role="status"><b>Broker sync stale — readiness DEGRADED</b><br />Last broker snapshot 38s old vs BINANCE live policy 5s. Scale requests are blocked; protective actions remain available. Runtime stays ACTIVE — staleness affects what we can SEE, not what the guardrails enforce locally.</div>
              ) : null}
              <div className="exec-lf-life">
                {smoke.lifecycle.map((l) => <span key={l.k}><span data-tone="good">{l.k} ✓ <a href={l.href}>{l.v}</a></span> <span className="exec-lf-arrow">→</span></span>)}
                <span className="exec-lf-now">{smoke.lifecycleNow}</span>
                <span className="exec-lf-arrow">→</span><span>{smoke.lifecycleNext}</span>
                <span className="exec-af-spacer" />
                <span>lifecycle · ✓ links its decision · ● current stage</span>
              </div>
              <div className="exec-pf2-kpis" data-cols="5">
                <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Canary capital · USDT</div><div className="exec-pf2-kpival">{smoke.kpis.capital}</div></div>
                <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Net PnL (9d) · marks live</div><div className="exec-pf2-kpival" data-tone="good">{fmtPlus(smoke.kpis.pnlBase + j * 0.4)}</div></div>
                <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Drawdown</div><div className="exec-pf2-kpival" data-tone="bad">{smoke.kpis.dd}</div></div>
                <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Risk envelope used</div><div className="exec-pf2-kpival">{smoke.kpis.envelope}</div></div>
                <div className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">Broker freshness</div><div className="exec-pf2-kpival" data-tone={degraded ? "warn" : "good"}>{degraded ? "38s STALE" : wsAge}</div></div>
              </div>
              <div className="exec-pf2-grid" data-ratio="1.55">
                <section className="exec-pf2-panel" aria-label="Live vs Paper vs Backtest (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Live vs Paper vs Backtest — same artifact digest</span><span className="exec-pf2-spacer" /><span className="exec-cn-legend">live —— · paper – – · backtest ····</span></header>
                  <div className="exec-pf2-plotpad">
                    <svg viewBox="0 0 640 240" className="exec-cn-svg" role="img" aria-label="Normalized equity: live, paper, backtest" style={{ fontFamily: "var(--font-mono)" }}>
                      <polyline points={smoke.chart.backtest} fill="none" stroke="var(--ink-mute)" strokeWidth="1.5" strokeDasharray="2 4" />
                      <polyline points={smoke.chart.paper} fill="none" stroke="var(--stage-paper)" strokeWidth="1.5" strokeDasharray="6 4" />
                      <polyline points={smoke.chart.live} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
                      <line x1={smoke.chart.start.x} y1="12" x2={smoke.chart.start.x} y2="228" stroke="var(--bad)" strokeWidth="1" strokeDasharray="3 3" />
                      <text x={smoke.chart.start.x + 4} y="28" fontSize="9" fill="var(--bad)">{smoke.chart.start.label}</text>
                      <text x={smoke.chart.liveLabel.x} y={smoke.chart.liveLabel.y} fontSize="9" fill="var(--accent)">{smoke.chart.liveLabel.t}</text>
                    </svg>
                  </div>
                  <footer className="exec-pf2-foot">{smoke.chart.foot}</footer>
                </section>
                <section className="exec-pf2-panel" aria-label="Canary envelope (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Canary envelope · {smoke.envelope.id}</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">breach ⇒ auto-halt</span></header>
                  <div className="exec-pf2-bars">
                    {smoke.envelope.rows.map((r) => <div key={r.k}><div className="exec-pf2-barrow"><span>{r.k}</span><span className="exec-pf2-barval" data-tone={r.tone}>{r.v}</span></div><div className="exec-pf2-bar"><div className="exec-pf2-barfill" data-tone={r.tone ?? "accent"} style={{ width: `${r.pct}%` }} /></div></div>)}
                    <p className="exec-pf2-note">{smoke.envelope.note}</p>
                  </div>
                </section>
              </div>
              <div className="exec-pf2-grid" data-ratio="1.55">
                <section className="exec-pf2-panel" aria-label="Live positions & open orders (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Live positions &amp; open orders</span><span className="exec-pf2-spacer" /><span className="exec-a3-source"><b>BROKER</b> · as_of {clockZ(now)}</span></header>
                  <div className="exec-scroll-x"><table className="exec-pf2-table"><thead><tr><th>symbol</th><th>side</th><th data-numeric="true">qty</th><th data-numeric="true">entry</th><th data-numeric="true">uPnL</th><th data-numeric="true">ack latency</th></tr></thead>
                    <tbody><tr><td>{smoke.position.symbol}</td><td data-tone="good">{smoke.position.side}</td><td data-numeric="true">{smoke.position.qty}</td><td data-numeric="true">{smoke.position.entry}</td><td data-numeric="true" data-tone="good">{fmtPlus(smoke.position.upnlBase + j * 0.3)}</td><td data-numeric="true" className="exec-pf2-dim">{smoke.position.ack}</td></tr></tbody></table></div>
                  <footer className="exec-pf2-foot exec-lf-facts"><span>{smoke.positionsFoot}</span><span className="exec-pf2-spacer" /><a href="/deployments/blotter">full blotter →</a></footer>
                </section>
                <section className="exec-pf2-panel" aria-label="Incidents · reconciliation (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Incidents · reconciliation</span></header>
                  <div className="exec-lf-kv">{smoke.incidents.flatMap((r) => [<span key={r.k} className="exec-bd-k">{r.k}</span>, <span key={r.k + "v"} data-tone={r.k === "scale blockers" && degraded ? "warn" : r.tone}>{r.k === "scale blockers" && degraded ? "broker sync STALE — scale blocked" : r.v}{r.link ? <a href={r.link.href}>{r.link.label}</a> : null}</span>])}</div>
                </section>
              </div>
              <section className="exec-pf2-panel" aria-label="Trial timeline (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Trial timeline — 14-day verdict, not a runtime monitor</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">runtime monitoring lives in <a href="/deployments/live">Live board</a> · this room decides</span></header>
                <div className="exec-cn-timeline" role="img" aria-label={`Trial day ${smoke.timeline.today} of ${smoke.timeline.days}`}>
                  {Array.from({ length: smoke.timeline.days }, (_, i) => i + 1).map((d) => {
                    const cp = (smoke.timeline.checkpoints as Record<number, string>)[d];
                    const kind = d === smoke.timeline.today ? "today" : d === smoke.timeline.days ? "exit" : cp ? "check" : d > smoke.timeline.today ? "future" : d === 1 ? "first" : "past";
                    return <div key={d} className="exec-cn-day" data-kind={kind}>{kind === "first" ? "d1" : kind === "check" ? `d${d} ✓` : kind === "today" ? `d${d} ●` : kind === "exit" ? `d${d} ⚑` : ""}</div>;
                  })}
                </div>
                <div className="exec-cn-tlnotes">
                  {smoke.timeline.notes.map((n) => <span key={n.link.label}>{n.t}<a href={n.link.href}>{n.link.label}</a>{n.tail}</span>)}
                  <span data-tone="ink">d{smoke.timeline.today} today · exit review d{smoke.timeline.days} in <b data-tone="warn">{left}</b></span>
                  <span className="exec-af-spacer" /><span>{smoke.timeline.foot}</span>
                </div>
              </section>
              <div className="exec-pf2-grid" data-ratio="1">
                <section className="exec-pf2-panel" aria-label="Exit readiness (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Exit readiness — gates {smoke.gates.done}/{smoke.gates.total}</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">server-enforced · mirror only</span></header>
                  <div className="exec-cn-gates">{smoke.gates.rows.map((g) => <span key={g.t} data-ok={g.ok ? "true" : "false"}>{g.ok ? "✓" : "✗"} {g.t.includes("{exitIn}") ? <>{g.t.split("{exitIn}")[0]}<b data-tone="warn">{left}</b>{g.t.split("{exitIn}")[1]}</> : g.t}{g.link ? <a href={g.link.href}>{g.link.label}</a> : null}</span>)}</div>
                  <div className="exec-cn-cta"><span>{smoke.gates.cta}</span></div>
                </section>
                <section className="exec-pf2-panel" aria-label="Portfolio marginal contribution (hi-fi)">
                  <header className="exec-pf2-head"><span className="exec-pf2-title">Portfolio marginal contribution</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">PF-CRYPTO · 30d · marginal.v1</span></header>
                  <div className="exec-cn-marginal"><div className="exec-lf-kv">{smoke.marginal.flatMap((m) => [<span key={m.k} className="exec-bd-k">{m.k}</span>, <span key={m.k + "v"} data-tone={m.tone}>{m.href ? <a href={m.href}>{m.v}</a> : m.v}{m.tail ? <span className="exec-pf2-dim">{m.tail}</span> : null}</span>])}</div><p className="exec-pf2-note">{smoke.marginalNote}</p></div>
                </section>
              </div>
              <section className="exec-pf2-panel" aria-label="Promotion decision (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Promotion decision — Canary Exit Review</span></header>
                <div className="exec-cn-decision">
                  <div className="exec-cn-decisionbtns" role="list" aria-label="Decision options (published with BR-EX-59; every option is plan → apply → verify with dual approval)">{smoke.decision.buttons.map((b) => <span key={b} role="listitem" className="exec-cn-option" data-tone={b === "Rollback" ? "bad" : undefined}>{b}</span>)}</div>
                  <div className="exec-cn-decisiontext">{smoke.decision.text}<a href={smoke.decision.packLink.href}>{smoke.decision.packLink.label}</a><br />{smoke.decision.rule}<b>{smoke.decision.ruleB}</b></div>
                </div>
              </section>
              <div className="exec-cn-actionbar">
                <span>{policy?.protective?.visible ? "Protective action · Request scale — issued from the Guard rail (plan → apply → verify)" : "mutation actions hidden — Operator Admin scope required"}</span>
                <span className="exec-af-spacer" /><span>{smoke.actionsFoot}</span>
              </div>
              <p className="exec-af-smoke">! {smoke.warning}</p>
            </>
          ) : null}
        </div>
        <details className="exec-pf2-contract exec-lf-contractstrip" open>
          <summary>published KPIs · canary-control-room.v1 contract — the strip above is smoke until BR-EX-59</summary>
        <ExecutionDecisionStrip
          metrics={room.kpis.map((kpi) => {
            const sm = kpi.value === null ? visuals?.kpis[kpi.key] : undefined;
            return { label: kpi.label, value: sm?.value ?? kpi.value, unit: sm ? (sm.unit || null) : kpi.unit, note: sm ? "smoke" : kpi.value === null ? null : kpi.envelope.authority };
          })}
        />
        </details>
        {visuals ? (
          <details className="exec-pf2-contract exec-lf-telemetry">
            <summary>stage telemetry · smoke until BR-EX-41 (stage lines, envelope gauges, ACK latency, sparklines)</summary>
            <div className="exec-visual-grid">
              <StageLinesChart title={visuals.equity.label} lines={visuals.equity.lines} envelope={visuals.envelope} warning={visuals.warning} />
              <CapGauges title="Canary envelope · consumed" items={visuals.caps} warning={visuals.warning} />
            </div>
            <div className="exec-visual-row">
              <HistogramChart hist={visuals.latency} warning={visuals.warning} />
              {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
            </div>
          </details>
        ) : (
        <EquityChart
          title="Live vs Paper vs Backtest"
          envelope={{ window: "30d", interval: "1h", currency: room.envelope?.currency ?? null, asOf: room.series?.asOf ?? "", authority: (room.series?.authority ?? "EXECUTION") as never, formulaVersion: null, sourceRows: null, returnedRows: null, coverage: null }}
          series={null}
          unavailableReason={
            room.series?.panelState === "ok"
              ? "Series panel is readable but no equity points are published for this profile — BR-EX-34. Stages would differ by line style and label, not colour alone."
              : `Series ${room.series?.panelState ?? "not published"} in this profile — nothing to draw (BR-EX-34).`
          }
        />
        )}
        <ExecutionTabs
          tabs={[
            { key: "Envelope", label: "Envelope" },
            { key: "Positions & orders", label: "Positions & orders" },
            { key: "Reconciliation", label: "Reconciliation" },
            { key: "Guard rule", label: "Guard rule" },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
          label="Canary sections"
        >
          {tab === "Envelope" ? (
            room.envelope ? (
              <section className="exec-canary-envelope" aria-label="Canary envelope">
                <ExecutionSectionTitle>
                  Canary envelope <span className="exec-canary-note exec-role-meta">rev {room.envelope.revision ?? "not stated"} · {room.envelope.status ?? "status not stated"}</span>
                </ExecutionSectionTitle>
                <div className="exec-scroll-x">
                  <table className="exec-360-sync exec-canary-limits">
                    <thead>
                      <tr>
                        <th scope="col">limit</th>
                        <th scope="col">approved</th>
                        <th scope="col">consumed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {limits.map(([label, value, unit]) => (
                        <tr key={label as string}>
                          <th scope="row">{label}</th>
                          <td className="exec-num">{value ?? "—"}{value && unit ? ` ${unit}` : ""}</td>
                          <td className="exec-gate-unverified">unavailable</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="exec-canary-note exec-role-meta">
                  base risk profile {room.envelope.baseRiskProfileRevision ?? "not stated"} · consumed against these caps is unavailable in this profile and is not shown as zero
                </p>
                <div className="exec-source-grid">
                  <SourceTile title="Envelope compliance" envelope={room.envelopeCompliance} />
                  <SourceTile title="Rollback readiness" envelope={room.rollbackReadiness} />
                </div>
              </section>
            ) : (
              <PanelState status="unavailable" reason="No canary envelope was published for this deployment." />
            )
          ) : null}
          {tab === "Positions & orders" ? (
            <div className="exec-fixtures-stack">
            {visuals ? <PositionsTable rows={visuals.positions} caption="Live positions & open orders · BROKER" warning={visuals.warning} /> : null}
            <div className="exec-source-grid">
              <SourceTile title="Positions" envelope={room.positions} />
              <SourceTile title="Blotter" envelope={room.blotter} />
              <SourceTile title="Series" envelope={room.series} />
            </div>
            </div>
          ) : null}
          {tab === "Reconciliation" ? (
            <div className="exec-source-grid exec-canary-panels">
              <SourceTile title="Internal" envelope={byId.get("internal")} />
              <SourceTile title="Broker" envelope={broker} />
              <SourceTile title="Difference" envelope={byId.get("difference")} />
            </div>
          ) : null}
          {tab === "Guard rule" ? (
            <section className="exec-canary-guardrule" aria-label="Guard rule">
              <ExecutionSectionTitle>Guard rule</ExecutionSectionTitle>
              <p className="exec-canary-note exec-role-meta">{policy?.guardSemantics ?? "guard semantics not stated"}</p>
              <p className="exec-role-body">{guard.text}</p>
              <ul className="exec-canary-asym exec-role-body">
                <li>Protective actions {policy?.protective?.brokerSyncBlocks ? "are blocked by a stale broker snapshot" : "are not blocked by a stale broker snapshot"}.</li>
                <li>Scale-up {policy?.scaleUp?.brokerSyncBlocks ? "is blocked by a stale broker snapshot" : "is not blocked by a stale broker snapshot"}.</li>
              </ul>
              {/* Scale-up sits here, lighter and away from the protective group: the asymmetry is placement + weight, not only a disabled flag. */}
              {policy?.scaleUp?.visible ? (
                <div className="exec-stage-actions" data-weight="risk">
                  <ActionGroup policy={policy.scaleUp} title="Request scale" brokerStale={brokerStale} />
                </div>
              ) : null}
              <Hint className="exec-canary-note" label="Promotion rule">promotion to LIVE_FULL requires Canary Exit Review and dual approval — elapsed time alone never promotes</Hint>
            </section>
          ) : null}
        </ExecutionTabs>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
