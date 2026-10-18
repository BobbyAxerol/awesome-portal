/**
 * Incident root drawer (S1d): the one thing the backend publishes about an
 * incident today, the current Portal root.
 *
 * `portal.execution.incident-current-root.v2` carries state, severity, target,
 * version and timestamps. Its children (evidence, operations taken, gates,
 * timeline, assignee) are `NOT_PUBLISHED` with a reason code, so each is a
 * panel that says so and no timeline is drawn from nothing. MITIGATED and
 * RESOLVED are local triage records, not broker safety, and the drawer says so.
 *
 * It mounts over the queue (the route keeps the queue mounted), so in overlay
 * mode the shared Drawer is the modal dialog and in dock mode it sits beside
 * the table.
 */
import { useEffect, useState } from "react";

import { PanelState } from "../../../components/states";
import type { ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { DockAction, Drawer, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { formatAsOf } from "../../boundary";
import type { IncidentRootReadV2, IncidentRootV2, IncidentStateV2, InstantV2 } from "../../readers/operationalQueue";
import { INCIDENT_STATES_V2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { FE, NotPublished, notPublishedReason } from "./notPublished";
import { humanize, TARGET_LABEL } from "./outcome";

import "../../css/operations.css";

type Load =
  | { phase: "loading" }
  | { phase: "failed"; status: Exclude<PanelStatus, "ok">; reason: string }
  | { phase: "unsupported"; schemaVersion: string | null }
  | { phase: "ready"; incident: IncidentRootV2 };

export const INCIDENT_ACTION_REASONS = {
  acknowledge: notPublishedReason(FE.eligibility, "Acknowledging an incident is an ADMIN-only Portal write and this screen does not offer it yet."),
  assign: notPublishedReason(FE.assignee, "The incident root has no assignee, so there is nobody to assign."),
  mitigate: notPublishedReason(FE.eligibility, "Marking mitigated is an ADMIN-only Portal write and this screen does not offer it yet."),
  resolve: notPublishedReason(FE.eligibility, "Resolving needs every gate met, and no gate is published."),
} as const;

function instant(value: InstantV2 | null, absent: string) {
  return value === null ? absent : <time dateTime={value.iso} title={value.iso}>{formatAsOf(value.ms)}</time>;
}

const STATE_FLAG: Readonly<Record<IncidentStateV2, { kind: FlagKind; label: string }>> = {
  OPEN: { kind: "attention", label: "Open" },
  MITIGATED: { kind: "neutral", label: "Mitigated" },
  // A Portal record. It is never green: the source may still be diverged.
  RESOLVED: { kind: "neutral", label: "Resolved in the Portal" },
};

export interface StepView {
  state: IncidentStateV2;
  step: "done" | "current" | "todo";
}

/** Forward-only rail: a state the reader does not know yields no rail, never a plausible one. */
export function railFor(state: IncidentStateV2): readonly StepView[] {
  const at = INCIDENT_STATES_V2.indexOf(state);
  return INCIDENT_STATES_V2.map((s, i) => ({ state: s, step: i < at ? "done" : i === at ? "current" : "todo" }));
}

export interface IncidentRootDrawerProps {
  api: ExecutionApi;
  incidentId: string;
  workspaceId?: string;
  mode: DockMode;
  onClose(): void;
}

export function IncidentRootDrawer({ api, incidentId, workspaceId, mode, onClose }: IncidentRootDrawerProps) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ phase: "loading" });
    api.getIncidentRootV2(incidentId, workspaceId).then(
      (result) => {
        if (!live) return;
        if (!result.ok) {
          setLoad({ phase: "failed", status: result.status, reason: result.reason });
          return;
        }
        const read: IncidentRootReadV2 = result.value;
        setLoad(read.kind === "incident"
          ? { phase: "ready", incident: read.incident }
          : { phase: "unsupported", schemaVersion: read.schemaVersion });
      },
      () => {
        if (live) setLoad({ phase: "failed", status: "unavailable", reason: "The incident read never reached the Portal." });
      },
    );
    return () => { live = false; };
  }, [api, incidentId, workspaceId]);

  const actions = (
    <>
      <DockAction label="Acknowledge" reason={INCIDENT_ACTION_REASONS.acknowledge} />
      <DockAction label="Assign to me" reason={INCIDENT_ACTION_REASONS.assign} />
      <DockAction label="Mark mitigated" reason={INCIDENT_ACTION_REASONS.mitigate} />
      <DockAction label="Mark resolved" reason={INCIDENT_ACTION_REASONS.resolve} variant="primary" />
    </>
  );

  if (load.phase !== "ready") {
    return (
      <Drawer title="Incident" subtitle={incidentId} onClose={onClose} mode={mode} actions={actions}>
        {load.phase === "loading" ? <PanelState status="loading" /> : null}
        {load.phase === "failed" ? <PanelState status={load.status} reason={load.reason} /> : null}
        {load.phase === "unsupported" ? (
          <PanelState
            status="unavailable"
            reason={`The server answered an incident shape this build does not read (${load.schemaVersion ?? "no schema version"}). Nothing is shown rather than a wrong reading.`}
          />
        ) : null}
      </Drawer>
    );
  }

  const incident = load.incident;
  const flag = STATE_FLAG[incident.workflowState];
  const children = incident.historicalChildren;
  return (
    <Drawer
      title={`Incident ${incident.incidentId}`}
      subtitle={`${TARGET_LABEL[incident.targetType]} ${incident.targetId} · ${ENV_LABEL[incident.environment]}`}
      onClose={onClose}
      mode={mode}
      actions={actions}
    >
      <ol className="exec-ops-rail" aria-label="Workflow state">
        {railFor(incident.workflowState).map((s) => (
          <li key={s.state} data-step={s.step} aria-current={s.step === "current" ? "step" : undefined}>
            {s.step === "done" ? <span aria-hidden="true">✓ </span> : null}
            {humanize(s.state)}
          </li>
        ))}
      </ol>
      <p className="exec-ops-reason">
        Forward only. Mitigated and resolved are Portal records; they do not say the position or the source is safe.
      </p>
      <dl className="exec-ops-facts">
        <dt>State</dt>
        <dd><Flag kind={flag.kind} label={flag.label} size="sm" /></dd>
        <dt>Severity</dt>
        <dd>{humanize(incident.severity)}</dd>
        <dt>Target</dt>
        <dd><span className="exec-ops-mono">{TARGET_LABEL[incident.targetType]} {incident.targetId}</span></dd>
        <dt>Environment</dt>
        <dd>{ENV_LABEL[incident.environment]}</dd>
        <dt>Created</dt>
        <dd>{instant(incident.createdAt, "")}</dd>
        <dt>Updated</dt>
        <dd>{instant(incident.updatedAt, "")}</dd>
        <dt>Acknowledged</dt>
        <dd>{instant(incident.acknowledgedAt, "Not acknowledged")}</dd>
        <dt>Mitigated</dt>
        <dd>{instant(incident.mitigatedAt, "Not mitigated")}</dd>
        <dt>Resolved</dt>
        <dd>{instant(incident.resolvedAt, "Not resolved")}</dd>
        <dt>Version</dt>
        <dd><span className="exec-ops-mono">{incident.workflowVersion}</span></dd>
        <dt>Source</dt>
        <dd>Integration {humanize(incident.sourceIntegrationState).toLowerCase()}; nothing was asked of the source.</dd>
      </dl>
      <p className="exec-ops-reason">Resolving closes the incident only. It never resumes a deployment.</p>

      <h3 className="exec-ops-section">Not published</h3>
      <ul className="exec-ops-np-list">
        <li><NotPublished id={FE.events} reasonCode={children.reasonCode}>Evidence.</NotPublished></li>
        <li><NotPublished id={FE.events} reasonCode={children.reasonCode}>Operations taken.</NotPublished></li>
        <li><NotPublished id={FE.events} reasonCode={children.reasonCode}>Resolution gates.</NotPublished></li>
        <li><NotPublished id={FE.events} reasonCode={children.reasonCode}>Timeline.</NotPublished></li>
        <li><NotPublished id={FE.assignee} reasonCode={children.reasonCode}>Assignee.</NotPublished></li>
      </ul>
    </Drawer>
  );
}
