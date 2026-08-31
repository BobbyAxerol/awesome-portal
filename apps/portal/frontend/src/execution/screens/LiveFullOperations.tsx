/**
 * Live Full Operations (HiFi 1f) on the V2 Paper anatomy.
 *
 * Priority order: portfolio risk → broker truth → exposure → incidents →
 * contribution; research via drill-down only. One guard band. Broker truth
 * replaces presentation: while consistency is unverified every broker-derived
 * value is withheld (suppressed, not blank) and the MISMATCH banner takes the
 * chart slot. Protective ladder in the rail; risk-increasing actions under
 * the guard rules, lighter — and both stay disabled unless the server's
 * policy says otherwise.
 */
import { useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { BarsChart } from "../components/marketChart";
import type { LiveDemo } from "../live.smoke";
import { PanelState } from "../components/states";
import { EquityChart } from "../components/EquityChart";
import { CapGauges, DailyBarsChart, HistogramChart, PositionsTable, SparkTile } from "../components/visuals";
import type { StageVisuals } from "../stage.types";
import { SourceTile, StageGuardBand } from "../components/stageWorkbench";
import { ExecutionSectionTitle } from "../components/typography";
import { ExecutionContextRail, ExecutionDecisionStrip, ExecutionProvenanceDrawer, ExecutionTabs, ExecutionWorkspace, shortDigest, type RailBlocker } from "../components/workspace";
import type { PanelStatus } from "../contracts";
import { liveGuardRules, type LiveActionPolicy, type LiveFullOperations } from "../liveFull";

export function LiveActionGroup({ policy, title, gapDetected }: { policy: LiveActionPolicy; title: string; gapDetected: boolean | null }) {
  const blockedByGap = policy.sourceGapBlocks && gapDetected !== false;
  return (
    <section className="exec-live-actions" aria-label={title}>
      <h3 className="exec-role-section">
        {title} <span className="exec-live-note exec-role-meta">{policy.riskTier ?? "tier not stated"}</span>
      </h3>
      <button type="button" className="exec-role-control exec-btn-ghost" disabled={!policy.enabled || blockedByGap}>
        {title}
      </button>
      {blockedByGap ? <p className="exec-disabled-reason">Blocked while projection continuity is unverified.</p> : null}
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

const TABS = ["Exposure & orders", "Continuity", "Predecessor envelope", "Guard rules"] as const;
type Tab = (typeof TABS)[number];

export function LiveFullOperationsScreen({
  live,
  status = "ok",
  reason,
  onCopyProvenance,
  visuals,
  children,
  demo,
}: {
  live: LiveFullOperations | null;
  demo?: LiveDemo | null;
  status?: PanelStatus;
  reason?: string;
  /** Stage visuals (smoke until BR-EX-41). Absent = honest states only. */
  visuals?: StageVisuals;
  onCopyProvenance?: (full: string) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Exposure & orders");
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-live">
        <PanelState status={status} reason={reason} />
      </ExecutionSurface>
    );
  }
  if (!live) {
    return (
      <ExecutionSurface kind="deployments" className="exec-live">
        <PanelState status="loading" reason="Loading live full operations." />
      </ExecutionSurface>
    );
  }
  const rules = liveGuardRules(live);
  const smoke = demo ?? null;
  const policy = live.commandPolicy;
  const gap = live.projectionContinuity?.gapDetected ?? null;
  const consistency = live.brokerConsistency;
  const mismatch = consistency !== null && consistency.brokerValuesVisible === false;
  const brokerPanel = live.panels.broker;
  const blockers: RailBlocker[] = [
    ...live.lifecycleBlockers.map((c) => ({ label: c, detail: "lifecycle", severity: "blocking" as const })),
    ...(consistency?.blockerCodes ?? []).map((c) => ({ label: c, detail: "broker consistency", severity: "blocking" as const })),
    ...(live.projectionContinuity?.blockerCodes ?? []).map((c) => ({ label: c, detail: "projection continuity", severity: "blocking" as const })),
    ...live.realtimeBlockers.map((c) => ({ label: c, detail: "realtime", severity: "watch" as const })),
    ...(live.suppressedBrokerFields.length ? [{ label: `${live.suppressedBrokerFields.length} broker figure(s) withheld`, detail: live.suppressedBrokerFields.join(", "), severity: "watch" as const }] : []),
  ];
  const provenanceItems = [
    ...live.lineage.map((l) => ({ label: l.kind, short: l.value.startsWith("sha256:") ? shortDigest(l.value) : l.value, full: l.value.startsWith("sha256:") ? l.value : null, href: l.href })),
    { label: "profile", short: live.deliveryProfile ?? "not stated", full: null },
    ...(live.activatedAt ? [{ label: "activated", short: live.activatedAt, full: null }] : []),
  ];
  const rail = (
    <ExecutionContextRail
      next={{
        title: "Protective ladder — halt → reduce → emergency close",
        detail: <span className="exec-role-body">admin · step-up · plan / apply / verify. {rules.gapRule}</span>,
        action: policy?.protective?.visible ? (
          <div className="exec-stage-actions" data-weight="protective">
            <LiveActionGroup policy={policy.protective} title="Protective action" gapDetected={gap} />
          </div>
        ) : (
          <p className="exec-live-note exec-role-meta">
            No command controls are shown: production command authority is inactive for this profile. A protective action being unblocked by the gap rule is not the same as it being executable.
          </p>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {live.deliveryProfile ?? "profile not stated"} · {live.productionCommandActive ? "PRODUCTION COMMAND ACTIVE" : "PRODUCTION INACTIVE"} · realtime {live.realtimeActive ? "active" : "inactive"}
          {brokerPanel?.envelope.asOf ? ` · broker as_of ${brokerPanel.envelope.asOf}` : ""}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance ?? (() => undefined)} />}
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-live exec-a3 exec-ac exec-lf" data-hifi-exact="live-full">
      {/* The shared guard band stays for the stage anatomy (sr-only here): the
          hi-fi 1f masthead frame is the visible guard on this screen. */}
      <StageGuardBand stage="LIVE · FULL" note="full production capital when active · every action needs step-up auth and dual approval" />
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-live-head">
          {/* Hi-fi 1f: the live masthead wears the 3px red frame with the shield.
              The badges keep the contract's four axes; the smoke adds the
              alpha/portfolio/venue words the contract does not carry yet. */}
          <header className="exec-masthead exec-ac-masthead exec-360-guard" data-live="true" aria-label="LIVE — full production capital when active · every action needs step-up auth and dual approval">
            <svg viewBox="0 0 16 18" className="exec-ac-shield" aria-hidden="true"><path d="M8 1 L15 4 V9 C15 13.5 12 16.5 8 17.5 C4 16.5 1 13.5 1 9 V4 Z" fill="var(--bad-bg)" stroke="var(--bad)" strokeWidth="1.5" /></svg>
            <span className="exec-ac-live">LIVE</span>
            <div className="exec-ac-h1" role="heading" aria-level={1}>{smoke?.full.title ?? (live.deploymentId ?? "deployment not stated")} <span className="exec-a3-id">· {smoke?.full.sub ?? `${live.portfolioId ?? "portfolio not stated"} · ${live.venue ?? "venue not stated"}`}</span></div>
            <span className="exec-ac-sync" data-tone={live.runtimeState === "ACTIVE" ? "good" : "warn"}>● {live.runtimeState ?? "runtime not stated"}</span>
            <span className="exec-ac-sync" data-tone={mismatch || gap ? "bad" : "good"}><span aria-hidden="true">{mismatch || gap ? "✗" : "✓"}</span> <span>{mismatch ? "MISMATCH" : gap ? "GAP" : "READY"}</span></span>
            <span className="exec-a3-wf">WF 1f</span>
            <span className="exec-a3-spacer" />
            <span className="exec-ac-facts">stage <b>{live.declaredStage ?? "not stated"}</b> · {smoke?.full.facts.tail ?? `activated ${live.activatedAt ?? "not stated"}`}</span>
          </header>
          {smoke ? (
            <>
              <div className="exec-lf-meta">
                {smoke.full.meta.map((m) => <span key={m.k}>{m.k} <a href={m.k === "deployment" ? `/deployments/live/${live.deploymentId ?? m.v}` : m.href}>{m.k === "deployment" ? (live.deploymentId ?? m.v) : m.v}</a></span>)}
                <span className="exec-af-mute">{smoke.full.metaNote}</span>
              </div>
              <div className="exec-lf-life">
                {smoke.full.lifecycle.map((l) => <span key={l.k}><span data-tone="good">{l.k} ✓ <a href={l.href}>{l.v}</a></span> <span className="exec-lf-arrow">→</span></span>)}
                <span className="exec-lf-now">{smoke.full.lifecycleNow}</span>
                <span className="exec-af-spacer" />
                <span>lifecycle · ✓ links its decision · ● current stage</span>
              </div>
              <div className="exec-pf2-kpis" data-cols="5">
                {smoke.full.kpis.map((k) => <div key={k.label} className="exec-pf2-kpi"><div className="exec-pf2-kpilabel">{k.label}</div><div className="exec-pf2-kpival" data-tone={k.tone}>{k.value}{k.sub ? <> <span className="exec-pf2-kpisubval" data-tone={k.subTone}>{k.sub}</span></> : null}</div></div>)}
              </div>
            </>
          ) : null}
        </div>
        <details className="exec-pf2-contract exec-lf-contractstrip" open>
          <summary>published KPIs · live-full.v1 contract — the strip above is smoke until BR-EX-57</summary>
        <ExecutionDecisionStrip
          metrics={live.kpis.map((kpi) => {
            const sm = kpi.value === null && !kpi.suppressed ? visuals?.kpis[kpi.key] : undefined;
            return { label: kpi.label, value: sm?.value ?? kpi.value, unit: sm ? (sm.unit || null) : kpi.unit, note: sm ? "smoke" : kpi.value === null ? (kpi.suppressed ? "suppressed" : null) : kpi.authority };
          })}
        />
        </details>
        {visuals ? (
          <details className="exec-pf2-contract exec-lf-telemetry">
            <summary>stage telemetry · smoke until BR-EX-41 (contribution bars, envelope gauges, ACK latency, sparklines)</summary>
            <div className="exec-visual-grid">
              {visuals.contribution ? <DailyBarsChart title="Contribution & edge evidence · 30d" bars={visuals.contribution} unit="USDT" height={240} warning={visuals.warning} /> : null}
              <CapGauges title="Risk envelope · consumed" items={visuals.caps} warning={visuals.warning} />
            </div>
            <div className="exec-visual-row">
              <HistogramChart hist={visuals.latency} warning={visuals.warning} />
              {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
            </div>
          </details>
        ) : null}
        {mismatch ? (
          <section className="exec-mismatch-slot" role="alert" aria-label="Broker mismatch">
            <ExecutionSectionTitle>MISMATCH — broker truth replaces presentation</ExecutionSectionTitle>
            <p className="exec-role-body">{rules.suppression}</p>
            <p className="exec-role-meta">
              state {consistency?.state ?? "not stated"} · behaviour {consistency?.mismatchBehavior ?? "not stated"}
              {consistency?.findingHref ? (
                <>
                  {" · "}
                  <a href={consistency.findingHref}>open finding</a>
                </>
              ) : null}
              {consistency?.dryRunReconcileHref ? (
                <>
                  {" · "}
                  <a href={consistency.dryRunReconcileHref}>dry-run reconcile</a>
                </>
              ) : null}
            </p>
          </section>
        ) : visuals ? null : (
          <EquityChart
            title="Contribution / edge evidence — 30d contribution vs portfolio"
            envelope={{ window: "30d", interval: "1d", currency: null, asOf: brokerPanel?.envelope.asOf ?? "", authority: "ANALYTICS" as never, formulaVersion: null, sourceRows: null, returnedRows: null, coverage: null }}
            series={null}
            unavailableReason="Contribution series not published for this profile — BR-EX-34. Research lineage stays in the provenance drawer; it does not occupy live safety space."
          />
        )}
        {smoke ? (
          <>
            <div className="exec-pf2-grid" data-ratio="1">
              <section className="exec-pf2-panel" aria-label="Broker & reconciliation truth (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Broker &amp; reconciliation truth</span><span className="exec-pf2-spacer" /><span className="exec-a3-source"><b>BROKER</b> · as_of {smoke.full.broker.asOf}</span></header>
                <div className="exec-lf-kv">{smoke.full.broker.rows.map((r) => <span key={r.k} className="exec-bd-k" data-k={r.k}>{r.k}</span>).flatMap((k, i) => { const r = smoke.full.broker.rows[i]; return [k, <span key={r.k + "v"} data-tone={r.tone}>{r.v}{r.link ? <a href={r.link.href}>{r.link.label}</a> : null}</span>]; })}</div>
                <footer className="exec-pf2-foot">{smoke.full.broker.foot}</footer>
              </section>
              <section className="exec-pf2-panel" aria-label="Open exposure & orders (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Open exposure &amp; orders</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">{smoke.full.exposure.meta}</span></header>
                <div className="exec-scroll-x"><table className="exec-pf2-table"><thead><tr><th>symbol</th><th>side</th><th data-numeric="true">qty</th><th data-numeric="true">uPnL</th><th data-numeric="true">leverage</th></tr></thead>
                  <tbody>{smoke.full.exposure.rows.map((r) => <tr key={r.s}><td>{r.s}</td><td data-tone={r.side === "LONG" ? "good" : "bad"}>{r.side}</td><td data-numeric="true">{r.qty}</td><td data-numeric="true" data-tone={r.upnl.startsWith("−") ? "bad" : "good"}>{r.upnl}</td><td data-numeric="true">{r.lev}</td></tr>)}</tbody></table></div>
                <footer className="exec-pf2-foot exec-lf-facts"><span>{smoke.full.exposure.foot}</span><span className="exec-pf2-spacer" /><a href="/deployments/blotter">full blotter →</a></footer>
              </section>
            </div>
            <div className="exec-pf2-grid" data-ratio="1">
              <section className="exec-pf2-panel" aria-label="Incidents & protective actions (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Incidents &amp; protective actions</span></header>
                <div className="exec-lf-kv">
                  <span className="exec-bd-k">active incidents</span><span data-tone={mismatch ? "bad" : "good"}>{mismatch ? "1 — reconciliation mismatch" : smoke.full.incidents.active}</span>
                  <span className="exec-bd-k">protective ladder</span><span>{smoke.full.incidents.ladder.a}<a href={smoke.full.incidents.ladder.link.href}>{smoke.full.incidents.ladder.link.label}</a>{smoke.full.incidents.ladder.b}</span>
                  <span className="exec-bd-k">last operation</span><span>{smoke.full.incidents.last.a}<span data-tone="good">{smoke.full.incidents.last.verdict}</span>{smoke.full.incidents.last.b}</span>
                </div>
                <div className="exec-lf-actions">
                  <button type="button" className="exec-lf-halt" disabled={!policy?.protective?.enabled} title={policy?.protective?.enabled ? "plan → apply → verify" : "production command authority is inactive for this profile"}>Halt ▾</button>
                  <button type="button" className="exec-lf-danger" disabled={!policy?.protective?.enabled} title={policy?.protective?.enabled ? "plan → apply → verify" : "production command authority is inactive for this profile"}>Reduce ▾</button>
                  <button type="button" className="exec-lf-danger" disabled={!policy?.protective?.enabled} title={policy?.protective?.enabled ? "plan → apply → verify" : "production command authority is inactive for this profile"}>Emergency close ▾</button>
                </div>
                <footer className="exec-pf2-foot">{smoke.full.incidents.foot}</footer>
              </section>
              <section className="exec-pf2-panel" aria-label="Contribution & edge evidence (hi-fi)">
                <header className="exec-pf2-head"><span className="exec-pf2-title">Contribution &amp; edge evidence · 30d</span><span className="exec-pf2-spacer" /><span className="exec-pf2-note">{smoke.full.contribution.meta}</span></header>
                <div className="exec-lf-bars exec-pw-chartplot">
                  <div className="exec-pf2-note exec-lf-bartitle">{smoke.full.contribution.title}</div>
                  {/* Real bars on a real scale: each bar hovers to its date and
                      exact figure, and the series is scaled so it sums to the
                      30d total printed under it — a chart that disagrees with
                      its own caption is worse than no chart. */}
                  <BarsChart
                    height={170}
                    points={(() => {
                      const bars = smoke.full.contribution.bars;
                      const scale = 3102.44 / bars.reduce((a, b) => a + b, 0);
                      return bars.map((v, i) => {
                        const day = new Date(Date.UTC(2026, 7, 22) - (bars.length - 1 - i) * 86_400_000);
                        return [day.toISOString().slice(5, 10), Math.round(v * scale * 100) / 100] as const;
                      });
                    })()}
                    yFormatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    provenance={{ authority: "DERIVED", asOf: "2026-08-22", formula: "contrib.v1 · net of fees" }}
                    ariaLabel="Daily PnL contribution, 30 days"
                  />
                </div>
                <div className="exec-lf-facts"><span>30d contribution <b data-tone="good">{smoke.full.contribution.total}</b></span><span>cost drag {smoke.full.contribution.drag}</span><span className="exec-pf2-dim">detailed edge decomposition → <a href={`/deployments/portfolios/${live.portfolioId ?? "PF-CRYPTO"}`}>Portfolio 360°</a> · research evidence → <a href="/deployments/alphas/av_2041?tab=Audit">Artifact Passport</a> (drill-down)</span></div>
              </section>
            </div>
            <p className="exec-af-smoke">! {smoke.warning}</p>
          </>
        ) : null}
        <ExecutionTabs
          tabs={[
            { key: "Exposure & orders", label: "Exposure & orders" },
            { key: "Continuity", label: "Continuity" },
            { key: "Predecessor envelope", label: "Predecessor envelope" },
            { key: "Guard rules", label: "Guard rules" },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
          label="Live sections"
        >
          {tab === "Exposure & orders" ? (
            <div className="exec-fixtures-stack">
            {visuals ? <PositionsTable rows={visuals.positions} caption="Open exposure & orders · BROKER" warning={visuals.warning} /> : null}
            <div className="exec-source-grid exec-live-panels">
              {(["internal", "broker", "difference"] as const).map((id) => (
                <SourceTile key={id} title={id === "internal" ? "Internal" : id === "broker" ? "Broker" : "Difference"} envelope={live.panels[id]?.envelope} suppressed={live.panels[id]?.suppressed} warnings={live.panels[id]?.warningCodes} />
              ))}
            </div>
            </div>
          ) : null}
          {tab === "Continuity" ? (
            <section className="exec-live-continuity" aria-label="Projection continuity">
              <ExecutionSectionTitle>Projection continuity</ExecutionSectionTitle>
              <p className="exec-live-note exec-role-meta">
                state {live.projectionContinuity?.state ?? "not stated"} · gap {gap === null ? "not stated" : gap ? "detected" : "none"}
              </p>
              <table className="exec-360-sync">
                <tbody>
                  <tr><th scope="row">state</th><td>{live.projectionContinuity?.state ?? "not stated"}</td></tr>
                  <tr><th scope="row">gap</th><td>{gap === null ? "not stated" : gap ? "detected" : "none"}</td></tr>
                  <tr><th scope="row">epoch · sequence</th><td className="exec-num">{live.projectionContinuity?.epoch ?? "—"} · {live.projectionContinuity?.sequence ?? "—"}</td></tr>
                  <tr><th scope="row">affected authorities</th><td>{live.projectionContinuity?.affectedAuthorities.join(", ") || "—"}</td></tr>
                </tbody>
              </table>
              {live.projectionContinuity?.blockerCodes.length ? (
                <div className="exec-disabled-reason">
                  {live.projectionContinuity.blockerCodes.map((code) => (
                    <div key={code}>{code}</div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
          {tab === "Predecessor envelope" ? (
            live.predecessorEnvelope ? (
              <section className="exec-live-predecessor" aria-label="Predecessor canary envelope">
                <ExecutionSectionTitle>
                  Canary envelope (predecessor) <span className="exec-role-meta">rev {live.predecessorEnvelope.revision ?? "not stated"} · {live.predecessorEnvelope.status ?? "status not stated"}</span>
                </ExecutionSectionTitle>
                <p className="exec-role-body">
                  <strong>{live.predecessorEnvelope.activeForLiveFull ? "active for Live Full" : "NOT active for Live Full"}</strong>
                </p>
                <table className="exec-360-sync exec-live-limits">
                  <tbody>
                    {([["capital cap", live.predecessorEnvelope.capitalCap], ["gross notional cap", live.predecessorEnvelope.grossNotionalCap], ["daily loss cap", live.predecessorEnvelope.dailyLossCap]] as const).map(([label, value]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        <td className="exec-num">{value ?? "—"}{value && live.predecessorEnvelope?.currency ? ` ${live.predecessorEnvelope.currency}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : (
              <PanelState status="unavailable" reason="No predecessor canary envelope was published for this deployment. Live Full rests on a canary exit, so its absence is a gap rather than a default." />
            )
          ) : null}
          {tab === "Guard rules" ? (
            <section className="exec-live-guardrule" aria-label="Guard rules">
              <ExecutionSectionTitle>Guard rules</ExecutionSectionTitle>
              <p className="exec-live-note exec-role-meta">{policy?.guardSemantics ?? "guard semantics not stated"}</p>
              <p className="exec-role-body">{rules.suppression}</p>
              <p className="exec-role-body">{rules.gapRule}</p>
              {live.suppressedBrokerFields.length > 0 ? <p className="exec-live-note exec-role-meta">{live.suppressedBrokerFields.length} broker figure(s) were withheld before reaching this screen.</p> : null}
              {/* Risk-increasing actions live here, lighter and away from the protective ladder. */}
              {policy?.riskIncreasing?.visible ? (
                <div className="exec-stage-actions" data-weight="risk">
                  <LiveActionGroup policy={policy.riskIncreasing} title="Risk-increasing action" gapDetected={gap} />
                </div>
              ) : null}
            </section>
          ) : null}
        </ExecutionTabs>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
