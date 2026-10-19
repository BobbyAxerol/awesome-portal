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
import { useEffect, useId, useState } from "react";

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
import { ACCESS_PATH, FE, NotPublished, notPublishedReason } from "./notPublished";
import { humanize, TARGET_LABEL } from "./outcome";

import "../../css/operations.css";

type Load =
  | { phase: "loading" }
  | { phase: "failed"; status: Exclude<PanelStatus, "ok">; reason: string }
  | { phase: "unsupported"; schemaVersion: string | null }
  | { phase: "ready"; incident: IncidentRootV2 };

export const INCIDENT_ACTION_REASONS = {
  // One short line each: the footer must leave the body room to show what is missing.
  acknowledge: notPublishedReason(FE.eligibility, "ADMIN-only write, not offered yet."),
  assign: notPublishedReason(FE.assignee, "No assignee is published."),
  mitigate: notPublishedReason(FE.eligibility, "ADMIN-only write, not offered yet."),
  resolve: notPublishedReason(FE.eligibility, "No gate is published."),
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

/** The four panels of the HIFI incident page that have no published source yet, in its order. */
const GAP_PANELS = ["Evidence", "Operations taken", "Resolution gates", "Timeline"] as const;

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
  const gapId = useId();

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

  // D9: a blocked action says why and where to see the missing grant.
  const actions = (
    <>
      <DockAction label="Acknowledge" reason={INCIDENT_ACTION_REASONS.acknowledge} accessHref={ACCESS_PATH} />
      <DockAction label="Assign to me" reason={INCIDENT_ACTION_REASONS.assign} accessHref={ACCESS_PATH} />
      <DockAction label="Mark mitigated" reason={INCIDENT_ACTION_REASONS.mitigate} accessHref={ACCESS_PATH} />
      <DockAction label="Mark resolved" reason={INCIDENT_ACTION_REASONS.resolve} variant="primary" accessHref={ACCESS_PATH} />
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
  // The facts table below is long: what is missing goes in the drawer's priority slot, above it. The HIFI has
  // four panels here (Evidence, Operations taken, Resolution gates, Timeline), so each keeps its place with its
  // own name and one line; the reason code the server gave is the same for all of them and is printed once.
  const notPublished = (
    <>
      <h3 className="exec-ops-section">Not published</h3>
      <div className="exec-ops-gaps">
        {/* Named by their own heading (one name, not a label plus the same text again) and grouped, not four region landmarks. */}
        {GAP_PANELS.map((panel, index) => (
          <div key={panel} className="exec-ops-gap" role="group" aria-labelledby={`${gapId}-${index}`}>
            <h4 id={`${gapId}-${index}`} className="exec-ops-gap-title">{panel}</h4>
            <p className="exec-ops-np"><NotPublished id={FE.events} /></p>
          </div>
        ))}
      </div>
      <p className="exec-ops-np exec-ops-gap-assignee">
        <span className="exec-ops-gap-title">Assignee</span> <NotPublished id={FE.assignee} />
      </p>
      {children.reasonCode ? <p className="exec-ops-np-reason">Reason: {children.reasonCode}</p> : null}
    </>
  );
  return (
    <Drawer
      title={`Incident ${incident.incidentId}`}
      subtitle={(
        <>
          <Flag kind={flag.kind} label={`${flag.label} · ${humanize(incident.severity)}`} size="sm" />
          <span className="exec-ops-subline">{TARGET_LABEL[incident.targetType]} {incident.targetId} · {ENV_LABEL[incident.environment]}</span>
        </>
      )}
      onClose={onClose}
      mode={mode}
      actions={actions}
      priority={notPublished}
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
    </Drawer>
  );
}
