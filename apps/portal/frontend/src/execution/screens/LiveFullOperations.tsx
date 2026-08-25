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
import { PanelState } from "../components/states";
import { EquityChart } from "../components/EquityChart";
import { SourceTile, StageGuardBand } from "../components/stageWorkbench";
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionWorkspace,
  shortDigest,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";
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
  children,
}: {
  live: LiveFullOperations | null;
  status?: PanelStatus;
  reason?: string;
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
  const policy = live.commandPolicy;
  const gap = live.projectionContinuity?.gapDetected ?? null;
  const consistency = live.brokerConsistency;
  const mismatch = consistency !== null && consistency.brokerValuesVisible === false;
  const brokerPanel = live.panels.broker;
  const badges: HeaderBadge[] = [
    { label: "LIVE · FULL", axis: "stage", tone: "bad" },
    { label: live.runtimeState ?? "runtime not stated", axis: "runtime", tone: live.runtimeState === "ACTIVE" ? "good" : "mute" },
    { label: mismatch ? "MISMATCH" : gap ? "GAP" : "READY", axis: "readiness", tone: mismatch || gap ? "bad" : "good" },
    { label: `broker ${consistency?.state ?? "consistency not stated"}`, axis: "broker-sync", tone: mismatch ? "bad" : consistency?.state ? "good" : "warn" },
  ];
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
    <ExecutionSurface kind="deployments" className="exec-live">
      <StageGuardBand stage="LIVE · FULL" note="full production capital when active · every action needs step-up auth and dual approval" />
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-live-head">
          <ExecutionPageHeader
            title={live.deploymentId ?? "deployment not stated"}
            id={`${live.portfolioId ?? "portfolio not stated"} · ${live.venue ?? "venue not stated"}`}
            badges={badges}
            purpose="Portfolio risk → broker truth → exposure → incidents → contribution."
            secondary={<span className="exec-role-meta">stage {live.declaredStage ?? "not stated"} · activated {live.activatedAt ?? "not stated"}</span>}
          />
        </div>
        <ExecutionDecisionStrip
          metrics={live.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, unit: kpi.unit, note: kpi.value === null ? (kpi.suppressed ? "suppressed" : null) : kpi.authority }))}
        />
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
        ) : (
          <EquityChart
            title="Contribution / edge evidence — 30d contribution vs portfolio"
            envelope={{ window: "30d", interval: "1d", currency: null, asOf: brokerPanel?.envelope.asOf ?? "", authority: "ANALYTICS" as never, formulaVersion: null, sourceRows: null, returnedRows: null, coverage: null }}
            series={null}
            unavailableReason="Contribution series not published for this profile — BR-EX-34. Research lineage stays in the provenance drawer; it does not occupy live safety space."
          />
        )}
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
            <div className="exec-source-grid exec-live-panels">
              {(["internal", "broker", "difference"] as const).map((id) => (
                <SourceTile key={id} title={id === "internal" ? "Internal" : id === "broker" ? "Broker" : "Difference"} envelope={live.panels[id]?.envelope} suppressed={live.panels[id]?.suppressed} warnings={live.panels[id]?.warningCodes} />
              ))}
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
