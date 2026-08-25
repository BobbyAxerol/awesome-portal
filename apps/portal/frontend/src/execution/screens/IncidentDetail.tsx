/**
 * Incident Detail (HiFi 4d) on the V2 anatomy — the respond loop's workspace.
 *
 * One incident = finding + operations taken + what closed it. The current
 * containment and the next action are pinned in the rail; the state rail is
 * forward-only and audited; resolution never resumes a deployment. The
 * decision (Acknowledge / Mark RESOLVED) lives in the sticky bar with the
 * gate's blocker codes as its reasons.
 */
import { useState, type ReactNode } from "react";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { ExecutionDecisionBar } from "../components/decisionBar";
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
import { blockerText, incidentRail, type IncidentCollection, type IncidentDetail as Incident } from "../operations";

const PANEL_TITLE: Record<string, string> = {
  findings: "Findings",
  alerts: "Alerts",
  dead_letters: "Dead letters",
  trace_order: "Order trace",
};
const TABS = ["Evidence", "Timeline", "Operations"] as const;
type Tab = (typeof TABS)[number];

function CountNote({ collection, noun }: { collection: IncidentCollection<unknown>; noun: string }) {
  const { totalCount, returnedCount, truncated } = collection;
  if (totalCount === null) return <p className="exec-inc-note exec-role-meta">{noun} count not published.</p>;
  return (
    <p className="exec-inc-note exec-role-meta">
      {truncated ? `showing ${returnedCount ?? collection.rows.length} of ${totalCount} ${noun} — the rest were not sent` : `${totalCount} ${noun}`}
    </p>
  );
}

export function IncidentDetailScreen({
  incident,
  status = "ok",
  reason,
  onResolve,
  onAcknowledge,
  onOpenOperation,
  conflict,
  trail,
  children,
}: {
  incident: Incident | null;
  status?: PanelStatus;
  reason?: string;
  onResolve?: () => void;
  onAcknowledge?: () => void;
  onOpenOperation: (operationId: string) => void;
  conflict?: boolean;
  trail?: ReactNode;
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Evidence");
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-inc">
        <PanelState status={status} reason={reason} />
      </ExecutionSurface>
    );
  }
  if (!incident) {
    return (
      <ExecutionSurface kind="deployments" className="exec-inc">
        <PanelState status="loading" reason="Loading the incident." />
      </ExecutionSurface>
    );
  }
  const rail = incidentRail(incident.workflowState);
  const gate = incident.resolutionGate;
  const isAdmin = incident.actorRoles.includes("ADMIN");
  const resolved = incident.workflowState === "RESOLVED";
  const current = rail.find((s) => s.current)?.state ?? incident.workflowState ?? "state not stated";
  const nextOp = incident.correlatedOperations.rows[0] ?? null;
  const badges: HeaderBadge[] = [
    { label: incident.workflowState ?? "STATE NOT STATED", axis: "stage", tone: resolved ? "good" : incident.workflowState === "MITIGATED" ? "warn" : "bad" },
    { label: incident.severity ?? "severity not stated", axis: "other", tone: incident.severity === "CRITICAL" ? "bad" : incident.severity === "ERROR" || incident.severity === "WARNING" ? "warn" : "mute" },
    { label: incident.environment ?? "env not stated", axis: "runtime" },
    ...(conflict ? [{ label: "CHANGED — reload", axis: "broker-sync", tone: "bad" } as HeaderBadge] : []),
  ];
  const blockers: RailBlocker[] = [
    ...(gate && !gate.eligible ? gate.blockerCodes.map((code) => ({ label: code, detail: blockerText(code), severity: "blocking" as const })) : []),
    ...incident.sourcePanels.filter((p) => p.panelState !== "ok").map((p) => ({ label: `${PANEL_TITLE[p.panelId] ?? p.panelId} ${p.panelState}`, detail: "source panel", severity: "watch" as const })),
  ];
  const decisionReasons: string[] = [];
  if (!isAdmin) decisionReasons.push("Incident actions are available to Admin operators only.");
  if (conflict) decisionReasons.push("This incident changed while you were looking at it. Reload and review before deciding.");
  const contextRail = (
    <ExecutionContextRail
      next={{
        title: resolved ? "Resolved — deployment stays halted" : `Containment: ${current}`,
        detail: (
          <span className="exec-role-body">
            {incident.mitigatedAt ? `exposure frozen ${incident.mitigatedAt}. ` : ""}
            {resolved
              ? "Resume is its own plan → apply → verify with a fresh sync."
              : nextOp
                ? `Next: ${nextOp.commandKey ?? nextOp.operationId} — plan / apply / verify in the Action Drawer.`
                : "No operation is linked yet; the next action starts in the Action Drawer."}
          </span>
        ),
        action: nextOp ? (
          <button type="button" className="exec-role-control exec-btn-apply exec-linkbtn" onClick={() => onOpenOperation(nextOp.operationId)}>
            {nextOp.operationId} → Action Drawer
          </button>
        ) : undefined,
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {incident.acknowledgedAt ? `acked ${incident.acknowledgedAt} by ${incident.acknowledgedBy ?? "—"}` : "not acknowledged"} · source {incident.sourceIntegrationState ?? "not stated"} · profile {incident.deliveryProfile ?? "not stated"}
        </span>
      }
      provenance={
        <ExecutionProvenanceDrawer
          items={[
            ...incident.evidence.rows.map((e) => ({ label: e.label ?? e.evidenceId, short: e.hash ? shortDigest(e.hash) : "hash not stated", full: e.hash })),
            ...(incident.mitigationEvidenceHash ? [{ label: "mitigation", short: shortDigest(incident.mitigationEvidenceHash), full: incident.mitigationEvidenceHash }] : []),
            ...(incident.cleanDryRunEvidenceHash ? [{ label: "clean dry-run", short: shortDigest(incident.cleanDryRunEvidenceHash), full: incident.cleanDryRunEvidenceHash }] : []),
            { label: "target", short: `${incident.target.type ?? "—"} ${incident.target.id ?? "—"}`, full: null },
          ]}
          onCopy={(full) => void navigator.clipboard?.writeText(full)}
        />
      }
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-inc">
      <ExecutionWorkspace layout="balanced" rail={contextRail}>
        <div className="exec-inc-head">
          <ExecutionPageHeader
            title={
              <>
                {incident.incidentId} <span className="exec-inc-subject">— {incident.title}</span>
              </>
            }
            badges={badges}
            purpose={incident.summary}
            secondary={<span className="exec-inc-meta exec-role-meta">{incident.target.id ?? "target not stated"}{incident.assignedTo ? ` · owner ${incident.assignedTo}` : " · no assignee"}</span>}
          />
        </div>
        {rail.length > 0 ? (
          <ol className="exec-inc-rail" aria-label="Incident state">
            {rail.map((step) => (
              <li key={step.state} data-done={step.done} data-current={step.current}>
                {step.state}
                {step.state === "MITIGATED" && incident.mitigatedAt ? " — exposure frozen" : null}
              </li>
            ))}
          </ol>
        ) : (
          <PanelState status="unavailable" reason="This incident's workflow state is not one this screen recognises, so no rail is drawn. A plausible-looking rail over an unknown state would be a fabrication." />
        )}
        <p className="exec-inc-note exec-role-meta">forward-only · each transition audited</p>
        {conflict ? (
          <p className="exec-inc-conflict exec-role-body" role="alert">
            This incident changed while you were looking at it. Reload and review before deciding.
          </p>
        ) : null}
        <ExecutionDecisionStrip
          metrics={[
            { label: "Severity", value: incident.severity, tone: incident.severity === "CRITICAL" ? "bad" : undefined },
            { label: "Operations", value: incident.correlatedOperations.totalCount === null ? null : String(incident.correlatedOperations.totalCount) },
            { label: "Evidence refs", value: incident.evidence.totalCount === null ? null : String(incident.evidence.totalCount) },
            { label: "Events", value: incident.timeline.totalCount === null ? null : String(incident.timeline.totalCount) },
            { label: "Resolution gate", value: gate ? (gate.eligible ? "OPEN" : "BLOCKED") : null, tone: gate ? (gate.eligible ? "good" : "bad") : undefined },
          ]}
        />
        <ExecutionTabs
          tabs={[
            { key: "Evidence", label: "Evidence", count: incident.evidence.rows.length },
            { key: "Timeline", label: "Timeline", count: incident.timeline.rows.length },
            { key: "Operations", label: "Operations", count: incident.correlatedOperations.rows.length },
          ]}
          active={tab}
          onChange={(key) => setTab(key as Tab)}
          label="Incident sections"
        >
          {tab === "Evidence" ? (
            <div className="exec-fixtures-stack">
              <div className="exec-inc-panels exec-source-grid">
                {incident.sourcePanels.map((panel) => (
                  <section className="exec-inc-source exec-source-tile" key={panel.panelId} aria-label={PANEL_TITLE[panel.panelId] ?? panel.panelId}>
                    <h3 className="exec-role-section">{PANEL_TITLE[panel.panelId] ?? panel.panelId}</h3>
                    {panel.panelState === "ok" ? (
                      <p className="exec-inc-note exec-role-meta">Readable · {panel.authority ?? "authority not stated"} · {panel.freshness ?? "freshness not stated"}</p>
                    ) : (
                      <PanelState status={panel.panelState} reason={panel.panelState === "unavailable" ? "The Trading System publishes no route for this source, so the Portal has nothing to show. This is missing evidence, not an absence of findings." : undefined} />
                    )}
                  </section>
                ))}
              </div>
              <section className="exec-inc-evidence" aria-label="Evidence">
                <ExecutionSectionTitle>Evidence</ExecutionSectionTitle>
                <CountNote collection={incident.evidence} noun="references" />
                <table className="exec-360-sync">
                  <tbody>
                    {incident.evidence.rows.map((e) => (
                      <tr key={e.evidenceId}>
                        <th scope="row">{e.label ?? e.evidenceId}</th>
                        <td className="exec-num"><code>{e.hash ?? "hash not stated"}</code></td>
                        <td className="exec-num">{e.addedAt ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="exec-inc-note exec-role-meta">References only — this API stores a SHA-256 and metadata, never an artifact body.</p>
              </section>
              <section className="exec-inc-annotations" aria-label="Annotations">
                <ExecutionSectionTitle>Annotations</ExecutionSectionTitle>
                <CountNote collection={incident.annotations} noun="notes" />
                <ul>
                  {incident.annotations.rows.map((a) => (
                    <li key={a.annotationId}>
                      <p className="exec-role-body">{a.body}</p>
                      <span className="exec-inc-note exec-role-meta">
                        {a.author ?? "author not stated"} · {a.createdAt ?? "time not stated"}
                        {a.redactionState && a.redactionState !== "CLEAR" ? ` · ${a.redactionState}` : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : null}
          {tab === "Timeline" ? (
            <section className="exec-inc-timeline" aria-label="Timeline">
              <CountNote collection={incident.timeline} noun="events" />
              <table className="exec-360-sync">
                <thead>
                  <tr>
                    <th scope="col">at</th>
                    <th scope="col">action</th>
                    <th scope="col">actor</th>
                    <th scope="col">version</th>
                  </tr>
                </thead>
                <tbody>
                  {incident.timeline.rows.map((event) => (
                    <tr key={event.eventId}>
                      <td className="exec-num">{event.createdAt ?? "time not stated"}</td>
                      <td>{event.action ?? "action not stated"}</td>
                      <td>{event.actor ?? "actor not stated"}</td>
                      <td className="exec-num">v{event.versionBefore ?? "—"}→v{event.versionAfter ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {tab === "Operations" ? (
            <section className="exec-inc-ops" aria-label="Operations taken">
              <CountNote collection={incident.correlatedOperations} noun="operations" />
              <ul>
                {incident.correlatedOperations.rows.map((op) => (
                  <li key={op.operationId}>
                    <button type="button" className="exec-linkbtn" onClick={() => onOpenOperation(op.operationId)}>
                      {op.operationId}
                    </button>
                    <span className="exec-inc-note exec-role-meta">
                      {op.relationship ?? "link not stated"} · {op.commandKey ?? "—"} · source {op.sourceStatus ?? "not stated"} · verify {op.verificationResult ?? "not stated"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="exec-inc-note exec-role-meta">all mutations run plan → apply → verify in the Action Drawer · this panel only links them</p>
            </section>
          ) : null}
        </ExecutionTabs>
        <footer className="exec-inc-footer">
          <ExecutionDecisionBar
            label={`Incident decision ${incident.incidentId}`}
            verdict={resolved ? "RESOLVED" : gate?.eligible ? "READY TO RESOLVE" : incident.acknowledgedAt ? "ACKNOWLEDGED" : "OPEN"}
            tone={resolved ? "good" : gate?.eligible ? "good" : "warn"}
            reasons={decisionReasons}
            footnote={
              <>
                Resolving closes the Portal incident only. It never resumes a deployment and never changes Trading System state — resume is its own plan → apply → verify with a fresh sync.
                {resolved && !incident.deploymentResumeRequested ? <span className="exec-inc-halted"> The deployment remains halted. Resume is deliberately left to the operator.</span> : null}
              </>
            }
            trail={trail}
            actions={
              isAdmin ? (
                <div className="exec-inc-actions">
                  <button type="button" className="exec-role-control exec-btn-ghost" disabled={!onAcknowledge || incident.acknowledgedAt !== null} onClick={onAcknowledge}>
                    Acknowledge
                  </button>
                  <button type="button" className="exec-role-control exec-btn-apply" disabled={!gate?.eligible || !onResolve} onClick={onResolve}>
                    Mark RESOLVED
                  </button>
                </div>
              ) : null
            }
          />
          {/* The gate's own codes, in the operator's words — the bar carries authority/conflict, this list carries the gate. */}
          {gate && !gate.eligible ? (
            <div className="exec-disabled-reason">
              {gate.blockerCodes.map((code) => (
                <div key={code}>{blockerText(code)}</div>
              ))}
            </div>
          ) : null}
        </footer>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
