/**
 * Phase 8 — Incident Detail (hi-fi 4d, WF 4d, ops dark).
 *
 * The screen where somebody decides an incident is over, which makes its two
 * refusals more important than anything it draws.
 *
 * FORWARD ONLY. `OPEN → MITIGATED → RESOLVED` and no reverse, no reopen. The
 * rail is built from `incidentRail`, which derives the steps from the state
 * rather than from buttons, so a screen cannot render a transition the data
 * does not support. A state the reader does not recognise yields NO rail — a
 * plausible-looking one would be worse than none.
 *
 * RESOLVING CLOSES A PORTAL RECORD. It does not resume a deployment, and the
 * hi-fi is explicit that resume is its own plan → apply → verify with fresh
 * sync. `deployment_resume_requested` is read and rendered so that claim is the
 * server's rather than this file's, and there is deliberately no Resume control
 * anywhere on this screen — codex's stop gates name that exact affordance.
 *
 * The four source panels — findings, alerts, dead-letters, trace-order — are
 * the eight unpublished `ops` capabilities. They render `unavailable`, one
 * frame each, never merged and never empty: "we looked and there is nothing" is
 * a claim a dark source cannot support.
 */
import type { ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import type { PanelStatus } from "../contracts";
import {
  blockerText,
  incidentRail,
  type IncidentCollection,
  type IncidentDetail as Incident,
} from "../operations";

const PANEL_TITLE: Record<string, string> = {
  findings: "Findings",
  alerts: "Alerts",
  dead_letters: "Dead letters",
  trace_order: "Order trace",
};

/** A collection's own counts, said rather than implied by the row count. */
function CountNote({ collection, noun }: { collection: IncidentCollection<unknown>; noun: string }) {
  const { totalCount, returnedCount, truncated } = collection;
  if (totalCount === null) {
    return <p className="exec-inc-note">{noun} count not published.</p>;
  }
  return (
    <p className="exec-inc-note">
      {truncated
        ? `showing ${returnedCount ?? collection.rows.length} of ${totalCount} ${noun} — the rest were not sent`
        : `${totalCount} ${noun}`}
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
  children,
}: {
  incident: Incident | null;
  status?: PanelStatus;
  reason?: string;
  onResolve?: () => void;
  onAcknowledge?: () => void;
  /** Required: an operation row opens its plan/verify surface (the Action Drawer). */
  onOpenOperation: (operationId: string) => void;
  conflict?: boolean;
  children?: ReactNode;
}) {
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

  return (
    <ExecutionSurface kind="deployments" className="exec-inc">
      <header className="exec-inc-head">
        <span className="exec-inc-kicker">INCIDENT</span>
        <h1>
          {incident.incidentId} <span className="exec-inc-subject">— {incident.title}</span>
        </h1>
        <p className="exec-inc-meta">
          {incident.workflowState ?? "state not stated"} · {incident.severity ?? "severity not stated"}{" "}
          · {incident.environment ?? "environment not stated"} ·{" "}
          {incident.target.id ?? "target not stated"}
          {incident.assignedTo ? ` · owner ${incident.assignedTo}` : " · no assignee"}
        </p>
        <p className="exec-inc-note">{incident.summary}</p>
      </header>

      {/* Forward-only, and empty when the state is unreadable. */}
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
        <PanelState
          status="unavailable"
          reason="This incident's workflow state is not one this screen recognises, so no rail is drawn. A plausible-looking rail over an unknown state would be worse than none."
        />
      )}
      <p className="exec-inc-note">forward-only · each transition audited</p>

      {conflict ? (
        <p className="exec-inc-conflict" role="alert">
          This incident changed while you were looking at it. Reload and review before deciding.
        </p>
      ) : null}

      <div className="exec-inc-panels">
        {/* Four frames, one per source. Never merged, never empty. */}
        {incident.sourcePanels.map((panel) => (
          <section className="exec-inc-source" key={panel.panelId} aria-label={PANEL_TITLE[panel.panelId] ?? panel.panelId}>
            <h2>{PANEL_TITLE[panel.panelId] ?? panel.panelId}</h2>
            {panel.panelState === "ok" ? (
              // Reachable only if a future profile publishes this source. There
              // is no body to draw yet, so the panel says it is readable rather
              // than pretending to content — which is still true, and still not
              // a claim that there are no findings.
              <p className="exec-inc-note">
                Readable · {panel.authority ?? "authority not stated"} ·{" "}
                {panel.freshness ?? "freshness not stated"}
              </p>
            ) : (
              <PanelState
                status={panel.panelState}
                reason={
                  panel.panelState === "unavailable"
                    ? "The Trading System publishes no route for this source, so the Portal has nothing to show. This is missing evidence, not an absence of findings."
                    : undefined
                }
              />
            )}
          </section>
        ))}
      </div>

      <section className="exec-inc-ops" aria-label="Operations taken">
        <h2>Operations taken</h2>
        <CountNote collection={incident.correlatedOperations} noun="operations" />
        <ul>
          {incident.correlatedOperations.rows.map((op) => (
            <li key={op.operationId}>
              <button type="button" className="exec-linkbtn" onClick={() => onOpenOperation(op.operationId)}>
                {op.operationId}
              </button>
              <span className="exec-inc-note">
                {op.relationship ?? "link not stated"} · {op.commandKey ?? "—"} · source{" "}
                {op.sourceStatus ?? "not stated"} · verify {op.verificationResult ?? "not stated"}
              </span>
            </li>
          ))}
        </ul>
        <p className="exec-inc-note">
          all mutations run plan → apply → verify in the Action Drawer · this panel only links them
        </p>
      </section>

      <section className="exec-inc-evidence" aria-label="Evidence">
        <h2>Evidence</h2>
        <CountNote collection={incident.evidence} noun="references" />
        <ul>
          {incident.evidence.rows.map((e) => (
            <li key={e.evidenceId}>
              <code>{e.hash ?? "hash not stated"}</code>
              {e.label ? <span className="exec-inc-note"> · {e.label}</span> : null}
            </li>
          ))}
        </ul>
        {/* The API stores references, never bodies. Said so nobody looks for a
            download that does not exist. */}
        <p className="exec-inc-note">
          References only — this API stores a SHA-256 and metadata, never an artifact body.
        </p>
      </section>

      <section className="exec-inc-annotations" aria-label="Annotations">
        <h2>Annotations</h2>
        <CountNote collection={incident.annotations} noun="notes" />
        <ul>
          {incident.annotations.rows.map((a) => (
            <li key={a.annotationId}>
              <p>{a.body}</p>
              <span className="exec-inc-note">
                {a.author ?? "author not stated"} · {a.createdAt ?? "time not stated"}
                {a.redactionState && a.redactionState !== "CLEAR"
                  ? ` · ${a.redactionState}`
                  : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="exec-inc-timeline" aria-label="Timeline">
        <h2>Timeline</h2>
        <CountNote collection={incident.timeline} noun="events" />
        <ol>
          {incident.timeline.rows.map((event) => (
            <li key={event.eventId}>
              <span className="exec-inc-note">{event.createdAt ?? "time not stated"}</span>{" "}
              {event.action ?? "action not stated"}
              <span className="exec-inc-note">
                {" "}
                · {event.actor ?? "actor not stated"} · v{event.versionBefore ?? "—"}→v
                {event.versionAfter ?? "—"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="exec-inc-footer">
        {isAdmin ? (
          <div className="exec-inc-actions">
            <button type="button" disabled={!onAcknowledge || incident.acknowledgedAt !== null} onClick={onAcknowledge}>
              Acknowledge
            </button>
            <button type="button" disabled={!gate?.eligible || !onResolve} onClick={onResolve}>
              Mark RESOLVED
            </button>
          </div>
        ) : (
          <p className="exec-disabled-reason">
            Incident actions are available to Admin operators only.
          </p>
        )}

        {gate && !gate.eligible ? (
          <div className="exec-disabled-reason">
            {/* Which of the four, not merely "blocked". */}
            {gate.blockerCodes.map((code) => (
              <div key={code}>{blockerText(code)}</div>
            ))}
          </div>
        ) : null}

        {/* Stated whether or not the incident is resolved: the absence of a
            Resume control is a decision, and a decision nobody can see is one
            an operator will assume was an oversight. */}
        <p className="exec-inc-note">
          Resolving closes the Portal incident only. It never resumes a deployment and never changes
          Trading System state — resume is its own plan → apply → verify with a fresh sync.
        </p>
        {resolved && !incident.deploymentResumeRequested ? (
          <p className="exec-inc-halted">
            The deployment remains halted. Resume is deliberately left to the operator.
          </p>
        ) : null}
      </footer>
      {children}
    </ExecutionSurface>
  );
}
