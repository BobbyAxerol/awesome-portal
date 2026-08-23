/**
 * Phase 11 — Canary Control Room (hi-fi 1e, WF 1e, ops dark).
 *
 * Real capital, or it would be. The contract says
 * `production_command_active: false` and every action group `visible: false`,
 * so this screen's job today is to be unmistakably NOT a running canary while
 * showing what the envelope would permit.
 *
 * THE GUARD IS NOT A COLOUR. The hi-fi draws a double-red band with a shield
 * and the words `LIVE · CANARY`, and the handoff requires it cannot be missed
 * or represented by colour alone — so it is a labelled banner with text a
 * screen reader reaches, beside an explicit `fixture · PRODUCTION INACTIVE`.
 *
 * THE ASYMMETRY IS THE SCREEN. A stale broker blocks scaling up and does not
 * block protective actions, because staleness affects what the Portal can SEE
 * rather than what the guardrails enforce locally. That rule is read from each
 * group's own `broker_sync_blocks` rather than from the summary string, and
 * rendered as two separate statements so it cannot be flattened into one.
 *
 * ABSENT, NOT DISABLED. While `visible` is false the action groups are not
 * drawn at all. A greyed "Request scale" advertises a capability that does not
 * exist and teaches an operator that the blocker is negotiable.
 */
import type { ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { AuthorityWord, FreshnessIndicator } from "../components/badges";
import type { PanelStatus } from "../contracts";
import {
  guardAsymmetry,
  type CanaryActionPolicy,
  type CanaryControlRoom,
  type PanelEnvelope,
} from "../certification";

function Panel({ panel, title }: { panel: PanelEnvelope | null; title: string }) {
  return (
    <section className="exec-canary-panel" aria-label={title}>
      <h2>{title}</h2>
      {!panel ? (
        <PanelState status="unavailable" reason="This panel was not published in the response." />
      ) : panel.panelState === "ok" ? (
        <p className="exec-canary-note">
          Readable · {panel.authority ?? "authority not stated"}
        </p>
      ) : (
        <>
          <PanelState status={panel.panelState} />
          <p className="exec-canary-note">
            {panel.authority ? <AuthorityWord authority={panel.authority} /> : null}{" "}
            {panel.freshness ? <FreshnessIndicator state={panel.freshness} /> : null} profile{" "}
            {panel.deliveryProfile ?? "not stated"}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * Rendered only when the server says the group is visible.
 *
 * Exported so a test can prove the reverse: with `visible: false` this is never
 * called and nothing appears, rather than appearing disabled.
 */
export function ActionGroup({
  policy,
  title,
  brokerStale,
}: {
  policy: CanaryActionPolicy;
  title: string;
  brokerStale: boolean;
}) {
  const blockedByBroker = brokerStale && policy.brokerSyncBlocks;
  return (
    <section className="exec-canary-actions" aria-label={title}>
      <h3>
        {title} <span className="exec-canary-note">{policy.riskTier ?? "tier not stated"}</span>
      </h3>
      <button type="button" disabled={!policy.enabled || blockedByBroker}>
        {title}
      </button>
      {blockedByBroker ? (
        <p className="exec-disabled-reason">
          Blocked while the broker snapshot is stale.
        </p>
      ) : null}
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

export function CanaryControlRoomScreen({
  room,
  status = "ok",
  reason,
  brokerStale = false,
  children,
}: {
  room: CanaryControlRoom | null;
  status?: PanelStatus;
  reason?: string;
  /** Demo state from the hi-fi: OK / STALE. Drives the asymmetry, not the copy. */
  brokerStale?: boolean;
  children?: ReactNode;
}) {
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
  const byId = new Map(room.sourcePanels.map((p) => [p.panelId, p]));

  return (
    <ExecutionSurface kind="deployments" className="exec-canary">
      {/* Text first, colour second. A band that only differs by hue is a band
          half the operators cannot see. */}
      <div className="exec-canary-guard" role="note" aria-label="Stage guard">
        <span className="exec-canary-shield" aria-hidden="true">
          ⛨
        </span>
        <strong>LIVE · CANARY</strong>
        <span className="exec-canary-guardnote">
          real capital at risk when active · every action needs step-up auth and dual approval
        </span>
      </div>

      {/* And immediately, the thing that stops this reading as a live canary. */}
      <p className="exec-canary-inactive">
        {room.deliveryProfile ?? "profile not stated"} ·{" "}
        {room.productionCommandActive ? "PRODUCTION COMMAND ACTIVE" : "PRODUCTION INACTIVE"} — no
        canary is running and no command can be issued from this screen.
      </p>

      <header className="exec-canary-head">
        <h1>
          {room.deploymentId ?? "deployment not stated"}
          <span className="exec-canary-note">
            {" "}
            · {room.portfolioId ?? "portfolio not stated"} · {room.venue ?? "venue not stated"}
          </span>
        </h1>
        <p className="exec-canary-note">
          stage {room.declaredStage ?? "not stated"} · runtime{" "}
          {/* Never RUNNING, never HALTED, never 0. */}
          {room.runtimeState ?? "not stated"} · envelope day{" "}
          {room.dayIndex ?? "not stated"} / {room.durationDays ?? "not stated"}
        </p>
      </header>

      {room.lineage.length > 0 ? (
        <ul className="exec-canary-lineage" aria-label="Lineage">
          {room.lineage.map((item) => (
            <li key={`${item.kind}:${item.value}`}>
              <span className="exec-canary-note">{item.kind}</span> {item.value}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label="KPIs">
        <h2 className="exec-canary-h2">Canary KPIs</h2>
        <div className="exec-canary-kpis">
          {room.kpis.map((kpi) => (
            <div className="exec-canary-kpi" key={kpi.key}>
              <span className="exec-canary-kpilabel">{kpi.label}</span>
              {kpi.value === null ? (
                // Never 0. A KPI slot showing zero is a measurement; this is
                // the absence of one.
                <span className="exec-canary-kpiunavailable">unavailable</span>
              ) : (
                <span className="exec-canary-kpivalue exec-num">
                  {kpi.value}
                  {kpi.unit ? ` ${kpi.unit}` : null}
                </span>
              )}
              <span className="exec-canary-note">
                {kpi.envelope.authority ?? "authority not stated"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {room.envelope ? (
        <section className="exec-canary-envelope" aria-label="Canary envelope">
          <h2 className="exec-canary-h2">
            Canary envelope{" "}
            <span className="exec-canary-note">
              rev {room.envelope.revision ?? "not stated"} · {room.envelope.status ?? "status not stated"}
            </span>
          </h2>
          <dl className="exec-canary-limits">
            {/* Exact strings, printed as given. Formatting a cap is how an
                operator ends up reconciling against a number nobody sent. */}
            {[
              ["capital cap", room.envelope.limits.capitalCap],
              ["gross notional cap", room.envelope.limits.grossNotionalCap],
              ["daily loss cap", room.envelope.limits.dailyLossCap],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt>{label}</dt>
                <dd className="exec-num">
                  {value ?? "—"} {value && room.envelope?.currency ? room.envelope.currency : null}
                </dd>
              </div>
            ))}
            <div>
              <dt>max open orders</dt>
              <dd className="exec-num">{room.envelope.limits.maxOpenOrders ?? "—"}</dd>
            </div>
            <div>
              <dt>duration</dt>
              <dd className="exec-num">{room.envelope.limits.durationDays ?? "—"} days</dd>
            </div>
          </dl>
          <p className="exec-canary-note">
            base risk profile {room.envelope.baseRiskProfileRevision ?? "not stated"} · consumed
            against these caps is unavailable in this profile and is not shown as zero
          </p>
          {room.envelope.blockerCodes.length > 0 ? (
            <div className="exec-disabled-reason">
              {room.envelope.blockerCodes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="exec-canary-panels">
        <Panel panel={byId.get("internal") ?? null} title="Internal" />
        <Panel panel={byId.get("broker") ?? null} title="Broker" />
        <Panel panel={byId.get("difference") ?? null} title="Difference" />
        <Panel panel={room.positions} title="Positions" />
        <Panel panel={room.blotter} title="Blotter" />
        <Panel panel={room.series} title="Series" />
        <Panel panel={room.envelopeCompliance} title="Envelope compliance" />
        <Panel panel={room.rollbackReadiness} title="Rollback readiness" />
      </div>

      <section className="exec-canary-guardrule" aria-label="Guard rule">
        <h2 className="exec-canary-h2">Guard rule</h2>
        <p className="exec-canary-note">
          {policy?.guardSemantics ?? "guard semantics not stated"}
        </p>
        <p>{guard.text}</p>
        {/* Two statements, never one. Flattening them is how the asymmetry
            disappears from the screen it is the point of. */}
        <ul className="exec-canary-asym">
          <li>
            Protective actions{" "}
            {policy?.protective?.brokerSyncBlocks
              ? "are blocked by a stale broker snapshot"
              : "are not blocked by a stale broker snapshot"}
            .
          </li>
          <li>
            Scale-up{" "}
            {policy?.scaleUp?.brokerSyncBlocks
              ? "is blocked by a stale broker snapshot"
              : "is not blocked by a stale broker snapshot"}
            .
          </li>
        </ul>
      </section>

      {/* Absent while invisible. Not a disabled placeholder. */}
      {policy?.protective?.visible ? (
        <ActionGroup policy={policy.protective} title="Protective action" brokerStale={brokerStale} />
      ) : null}
      {policy?.scaleUp?.visible ? (
        <ActionGroup policy={policy.scaleUp} title="Request scale" brokerStale={brokerStale} />
      ) : null}
      {!policy?.protective?.visible && !policy?.scaleUp?.visible ? (
        <p className="exec-canary-note">
          No command controls are shown: production command authority is inactive for this profile,
          so there is nothing here that could be issued.
        </p>
      ) : null}

      {room.lifecycleBlockers.length > 0 ? (
        <div className="exec-disabled-reason">
          {room.lifecycleBlockers.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
      ) : null}

      <p className="exec-canary-note">
        promotion to LIVE_FULL requires Canary Exit Review and dual approval — elapsed time alone
        never promotes
      </p>
      {children}
    </ExecutionSurface>
  );
}
