/**
 * Phase 12 — Live Full Operations (hi-fi 1f, WF 1f, ops dark).
 *
 * The last screen in the promotion chain and the one where a wrong number costs
 * the most. Three things it does that the others do not:
 *
 * IT SHOWS NO BROKER FIGURE AT ALL. Not blanked, not dashed — the values never
 * reach this component, because `readLiveFullOperations` drops them while
 * `broker_values_visible` is false. A screen that merely omitted them would
 * still hold them, and a held value reaches the DOM eventually.
 *
 * IT SEPARATES SUPPRESSED FROM UNAVAILABLE. The broker panel is `suppressed`:
 * the Portal has something and policy forbids showing it. Rendering that as
 * "unavailable" would answer "why can't I see broker equity" with "it is
 * missing", when the truth is "a mismatch suppresses every broker-derived
 * value" — a different problem with a different fix.
 *
 * IT TREATS "WE DO NOT KNOW" AS BLOCKING. `gap_detected` is `null`, and R4 is
 * blocked on that basis. Not knowing whether a projection gap exists is not the
 * same as knowing there is none, and this is the one screen where the
 * difference is worth real money.
 */
import type { ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { AuthorityWord, FreshnessIndicator } from "../components/badges";
import type { PanelStatus } from "../contracts";
import {
  liveGuardRules,
  type LiveActionPolicy,
  type LiveFullOperations,
  type LivePanel,
} from "../liveFull";

function Panel({ panel, title }: { panel: LivePanel | undefined; title: string }) {
  return (
    <section className="exec-live-panel" aria-label={title} data-suppressed={panel?.suppressed}>
      <h2>{title}</h2>
      {!panel ? (
        <PanelState status="unavailable" reason="This panel was not published in the response." />
      ) : panel.suppressed ? (
        // Its own state, and its own sentence. "Unavailable" would send an
        // operator looking for a connection problem that does not exist.
        <>
          <PanelState
            status="denied"
            reason="Suppressed by policy: while broker consistency is unverified, no broker-derived value is shown anywhere on this screen."
          />
          <p className="exec-live-note">
            The Portal is withholding this, not failing to read it.
          </p>
        </>
      ) : panel.envelope.panelState === "ok" ? (
        <p className="exec-live-note">
          Readable · {panel.envelope.authority ?? "authority not stated"}
        </p>
      ) : (
        <>
          <PanelState status={panel.envelope.panelState} />
          <p className="exec-live-note">
            {panel.envelope.authority ? <AuthorityWord authority={panel.envelope.authority} /> : null}{" "}
            {panel.envelope.freshness ? <FreshnessIndicator state={panel.envelope.freshness} /> : null}{" "}
            profile {panel.envelope.deliveryProfile ?? "not stated"}
          </p>
        </>
      )}
      {panel && panel.warningCodes.length > 0 ? (
        <p className="exec-live-note">{panel.warningCodes.join(" · ")}</p>
      ) : null}
    </section>
  );
}

export function LiveActionGroup({
  policy,
  title,
  gapDetected,
}: {
  policy: LiveActionPolicy;
  title: string;
  gapDetected: boolean | null;
}) {
  // `null` blocks: not knowing is not the same as knowing there is no gap.
  const blockedByGap = policy.sourceGapBlocks && gapDetected !== false;
  return (
    <section className="exec-live-actions" aria-label={title}>
      <h3>
        {title} <span className="exec-live-note">{policy.riskTier ?? "tier not stated"}</span>
      </h3>
      <button type="button" disabled={!policy.enabled || blockedByGap}>
        {title}
      </button>
      {blockedByGap ? (
        <p className="exec-disabled-reason">
          Blocked while projection continuity is unverified.
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

export function LiveFullOperationsScreen({
  live,
  status = "ok",
  reason,
  children,
}: {
  live: LiveFullOperations | null;
  status?: PanelStatus;
  reason?: string;
  children?: ReactNode;
}) {
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

  return (
    <ExecutionSurface kind="deployments" className="exec-live">
      <div className="exec-live-guard" role="note" aria-label="Stage guard">
        <span className="exec-live-shield" aria-hidden="true">
          ⛨
        </span>
        <strong>LIVE · FULL</strong>
        <span className="exec-live-guardnote">
          full production capital when active · every action needs step-up auth and dual approval
        </span>
      </div>

      <p className="exec-live-inactive">
        {live.deliveryProfile ?? "profile not stated"} ·{" "}
        {live.productionCommandActive ? "PRODUCTION COMMAND ACTIVE" : "PRODUCTION INACTIVE"} · realtime{" "}
        {live.realtimeActive ? "active" : "inactive"} — nothing is running and no command can be
        issued from this screen.
      </p>

      <header className="exec-live-head">
        <h1>
          {live.deploymentId ?? "deployment not stated"}
          <span className="exec-live-note">
            {" "}
            · {live.portfolioId ?? "portfolio not stated"} · {live.venue ?? "venue not stated"}
          </span>
        </h1>
        <p className="exec-live-note">
          stage {live.declaredStage ?? "not stated"} · runtime{" "}
          {/* null, and never HALTED. */}
          {live.runtimeState ?? "not stated"} · activated{" "}
          {live.activatedAt ?? "not stated"}
        </p>
      </header>

      {live.lineage.length > 0 ? (
        <ul className="exec-live-lineage" aria-label="Lineage">
          {live.lineage.map((item) => (
            <li key={`${item.kind}:${item.value}`}>
              <span className="exec-live-note">{item.kind}</span> {item.value}
            </li>
          ))}
        </ul>
      ) : null}

      {live.predecessorEnvelope ? (
        <section className="exec-live-predecessor" aria-label="Predecessor canary envelope">
          <h2 className="exec-live-h2">Canary envelope (predecessor)</h2>
          <p className="exec-live-note">
            rev {live.predecessorEnvelope.revision ?? "not stated"} ·{" "}
            {live.predecessorEnvelope.status ?? "status not stated"} ·{" "}
            {/* The label the handoff asks for: this envelope does not govern
                Live Full, and showing its caps without saying so would read as
                the limits in force. */}
            <strong>
              {live.predecessorEnvelope.activeForLiveFull
                ? "active for Live Full"
                : "NOT active for Live Full"}
            </strong>
          </p>
          <dl className="exec-live-limits">
            {[
              ["capital cap", live.predecessorEnvelope.capitalCap],
              ["gross notional cap", live.predecessorEnvelope.grossNotionalCap],
              ["daily loss cap", live.predecessorEnvelope.dailyLossCap],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt>{label}</dt>
                <dd className="exec-num">
                  {value ?? "—"}{" "}
                  {value && live.predecessorEnvelope?.currency
                    ? live.predecessorEnvelope.currency
                    : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <PanelState
          status="unavailable"
          reason="No predecessor canary envelope was published for this deployment. Live Full rests on a canary exit, so its absence is a gap rather than a default."
        />
      )}

      <section aria-label="KPIs">
        <h2 className="exec-live-h2">Live KPIs</h2>
        <div className="exec-live-kpis">
          {live.kpis.map((kpi) => (
            <div className="exec-live-kpi" key={kpi.key} data-suppressed={kpi.suppressed}>
              <span className="exec-live-kpilabel">{kpi.label}</span>
              {kpi.value === null ? (
                <span className="exec-live-kpiunavailable">
                  {kpi.suppressed ? "suppressed" : "unavailable"}
                </span>
              ) : (
                <span className="exec-live-kpivalue exec-num">
                  {kpi.value}
                  {kpi.unit ? ` ${kpi.unit}` : null}
                </span>
              )}
              <span className="exec-live-note">{kpi.authority ?? "authority not stated"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="exec-live-guardrule" aria-label="Guard rules">
        <h2 className="exec-live-h2">Guard rules</h2>
        <p className="exec-live-note">{policy?.guardSemantics ?? "guard semantics not stated"}</p>
        {/* Two rules in one token, said as two sentences. */}
        <p>{rules.suppression}</p>
        <p>{rules.gapRule}</p>
        {live.suppressedBrokerFields.length > 0 ? (
          <p className="exec-live-note">
            {live.suppressedBrokerFields.length} broker figure(s) were withheld before reaching this
            screen.
          </p>
        ) : null}
      </section>

      <section className="exec-live-continuity" aria-label="Projection continuity">
        <h2 className="exec-live-h2">Projection continuity</h2>
        <p className="exec-live-note">
          state {live.projectionContinuity?.state ?? "not stated"} · gap{" "}
          {/* `null` says "not stated", never "no". */}
          {gap === null ? "not stated" : gap ? "detected" : "none"}
        </p>
        {live.projectionContinuity?.blockerCodes.length ? (
          <div className="exec-disabled-reason">
            {live.projectionContinuity.blockerCodes.map((code) => (
              <div key={code}>{code}</div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="exec-live-panels">
        <Panel panel={live.panels.internal} title="Internal" />
        <Panel panel={live.panels.broker} title="Broker" />
        <Panel panel={live.panels.difference} title="Difference" />
      </div>

      {policy?.protective?.visible ? (
        <LiveActionGroup policy={policy.protective} title="Protective action" gapDetected={gap} />
      ) : null}
      {policy?.riskIncreasing?.visible ? (
        <LiveActionGroup policy={policy.riskIncreasing} title="Risk-increasing action" gapDetected={gap} />
      ) : null}
      {!policy?.protective?.visible && !policy?.riskIncreasing?.visible ? (
        <p className="exec-live-note">
          No command controls are shown: production command authority is inactive for this profile.
          A protective action being unblocked by the gap rule is not the same as it being executable.
        </p>
      ) : null}

      {live.lifecycleBlockers.length > 0 ? (
        <div className="exec-disabled-reason">
          {live.lifecycleBlockers.map((code) => (
            <div key={code}>{code}</div>
          ))}
        </div>
      ) : null}
      {children}
    </ExecutionSurface>
  );
}
