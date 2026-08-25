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
  children,
}: {
  room: CanaryControlRoom | null;
  status?: PanelStatus;
  reason?: string;
  brokerStale?: boolean;
  onCopyProvenance?: (full: string) => void;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Envelope");
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
  const badges: HeaderBadge[] = [
    { label: "LIVE · CANARY", axis: "stage", tone: "bad" },
    { label: room.runtimeState ?? "runtime not stated", axis: "runtime", tone: room.runtimeState === "ACTIVE" ? "good" : "mute" },
    { label: degraded ? "READINESS DEGRADED" : "GUARDED", axis: "readiness", tone: degraded ? "bad" : "warn" },
    { label: `broker ${brokerStale ? "STALE" : (broker?.freshness ?? "not stated")}`, axis: "broker-sync", tone: brokerStale ? "bad" : broker?.panelState === "ok" ? "good" : "warn" },
  ];
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
    <ExecutionSurface kind="deployments" className="exec-canary">
      <StageGuardBand stage="LIVE · CANARY" note="real capital at risk when active · every action needs step-up auth and dual approval" />
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-canary-head">
          <ExecutionPageHeader
            title={room.deploymentId ?? "deployment not stated"}
            id={`${room.portfolioId ?? "portfolio not stated"} · ${room.venue ?? "venue not stated"}`}
            badges={badges}
            purpose="Promote, hold, reduce or roll back? Real capital, guarded envelope."
            secondary={
              <span className="exec-role-meta">
                stage {room.declaredStage ?? "not stated"} · runtime {room.runtimeState ?? "not stated"} · envelope day {room.dayIndex ?? "not stated"} / {room.durationDays ?? "not stated"}
              </span>
            }
          />
        </div>
        <ExecutionDecisionStrip
          metrics={room.kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, unit: kpi.unit, note: kpi.value === null ? null : kpi.envelope.authority }))}
        />
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
            <div className="exec-source-grid">
              <SourceTile title="Positions" envelope={room.positions} />
              <SourceTile title="Blotter" envelope={room.blotter} />
              <SourceTile title="Series" envelope={room.series} />
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
              <p className="exec-canary-note exec-role-meta">promotion to LIVE_FULL requires Canary Exit Review and dual approval — elapsed time alone never promotes</p>
            </section>
          ) : null}
        </ExecutionTabs>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
