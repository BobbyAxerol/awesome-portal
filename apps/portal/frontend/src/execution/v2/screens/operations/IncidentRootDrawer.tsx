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
import { NotAvailableLine } from "../../blocks";
import type { IncidentDetail } from "../../../operations";
import { IncidentSections } from "./IncidentSections";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { formatAsOf } from "../../boundary";
import type { IncidentRootReadV2, IncidentRootV2, IncidentStateV2, InstantV2 } from "../../readers/operationalQueue";
import { INCIDENT_STATES_V2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { ACCESS_PATH, AccessLink, FE, notPublishedReason } from "./notPublished";
import { humanize } from "./outcome";
import { TargetLink } from "./TargetLink";

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
  resolve: notPublishedReason(FE.eligibility, "ADMIN-only write, not offered yet."),
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
  /** Where "My access" lives; the footer's blocked actions and a denied read point there. */
  accessHref?: string;
}

export function IncidentRootDrawer({ api, incidentId, workspaceId, mode, onClose, accessHref = ACCESS_PATH }: IncidentRootDrawerProps) {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  /** The incident detail (`execution.incident-detail.v1`), when the server published it beside the root. */
  const [detail, setDetail] = useState<IncidentDetail | null>(null);

  useEffect(() => {
    let live = true;
    setLoad({ phase: "loading" });
    setDetail(null);
    // Best effort and separate from the root: a route that answers only the root, or a failed detail read, leaves
    // each section with its own typed absence. Test doubles that predate the method are tolerated.
    if (typeof api.getIncident === "function") {
      api.getIncident(incidentId, workspaceId).then(
        (result) => { if (live && result.ok) setDetail(result.value); },
        () => undefined,
      );
    }
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
      <DockAction label="Acknowledge" reason={INCIDENT_ACTION_REASONS.acknowledge} accessHref={accessHref} />
      <DockAction label="Assign to me" reason={INCIDENT_ACTION_REASONS.assign} accessHref={accessHref} />
      <DockAction label="Mark mitigated" reason={INCIDENT_ACTION_REASONS.mitigate} accessHref={accessHref} />
      <DockAction label="Mark resolved" reason={INCIDENT_ACTION_REASONS.resolve} variant="primary" accessHref={accessHref} />
    </>
  );

  if (load.phase !== "ready") {
    return (
      <Drawer title="Incident" subtitle={incidentId} onClose={onClose} mode={mode} actions={actions}>
        {load.phase === "loading" ? <PanelState status="loading" /> : null}
        {load.phase === "failed" ? <PanelState status={load.status} reason={load.reason} actions={load.status === "denied" ? <AccessLink href={accessHref} /> : undefined} /> : null}
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
  // The four HIFI sections (Evidence, Operations taken, Resolution gates, Timeline) each keep their place in the body
  // with their own content or their own typed absence. Only the assignee, a fact of the head, rides the priority slot.
  const notPublished = detail === null
    ? <NotAvailableLine className="exec-ops-na-line" facts={[{ label: "Assignee", id: FE.assignee }]} />
    : undefined;
  return (
    <Drawer
      title={`Incident ${incident.incidentId}`}
      subtitle={(
        <>
          <Flag kind={flag.kind} label={`${flag.label} · ${humanize(incident.severity)}`} size="sm" />
          <span className="exec-ops-subline"><TargetLink type={incident.targetType} id={incident.targetId} environment={incident.environment} /> · {ENV_LABEL[incident.environment]}</span>
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
        Forward only. Mitigated and resolved are Portal records, not a safety statement.
      </p>
      <dl className="exec-ops-facts">
        <dt>Target</dt>
        <dd><TargetLink className="exec-ops-mono" type={incident.targetType} id={incident.targetId} environment={incident.environment} /></dd>
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
        {detail ? (
          <>
            <dt>Assignee</dt>
            <dd>{detail.assignedTo ?? "Unassigned"}</dd>
          </>
        ) : null}
        <dt>Version</dt>
        <dd><span className="exec-ops-mono">{incident.workflowVersion}</span></dd>
        <dt>Source</dt>
        <dd title="Nothing was asked of the source.">Integration {humanize(incident.sourceIntegrationState).toLowerCase()}</dd>
      </dl>
      <IncidentSections detail={detail} reasonCode={children.reasonCode} />
      <p className="exec-ops-reason">Resolving closes the incident only. It never resumes a deployment.</p>
    </Drawer>
  );
}
