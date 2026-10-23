/**
 * What the Exceptions and Audit tabs, the incident page and the row's Next cell can say, built ONLY from published fields of the rows
 * the queue read returned (WP-B). Nothing here counts, scores or infers a state:
 *
 *  - an exception is an incident a loaded row links to (FE-042) whose published `workflowState` is OPEN; the server's own count of open
 *    exceptions (FE-CAT-2 `health.openException`) is printed beside the list and is never replaced by the list's length;
 *  - an audit event is a timestamp a row publishes (`createdAt`, `acknowledgedAt`, `resolvedAt`); who did it is not published (FE-021);
 *  - the linked operations of an incident are the loaded rows whose links name it: a many-to-many join over the rows READ, said as such.
 *
 * A row the reader did not load is not here, and every caller says so (the "loaded" sentence), because a short list never proves a
 * short truth.
 */
import type {
  DeliveryStateV2, DisplayStateV2, IncidentLinkRelationshipV2, IncidentLinkV2, IncidentStateV2, InstantV2, OperationV2, SeverityV2,
  TargetTypeV2,
} from "../../readers/operationalQueue";
import type { ExecEnv } from "../../urlState";
import { receiptOutcome } from "./outcome";

export type LinkedIncident = Extract<IncidentLinkV2, { state: "LINKED" }>;

export interface IncidentEdge {
  incidentId: string;
  relationship: IncidentLinkRelationshipV2;
  linkedAt: InstantV2;
  operation: OperationV2;
}

export interface IncidentSummary {
  incidentId: string;
  targetType: TargetTypeV2;
  targetId: string;
  environment: ExecEnv;
  severity: SeverityV2;
  workflowState: IncidentStateV2;
  /** Newest first. */
  edges: readonly IncidentEdge[];
}

/** Every incident the loaded rows link to, once each, with the operations that name it. */
export function incidentsOf(rows: readonly OperationV2[]): readonly IncidentSummary[] {
  const byId = new Map<string, { head: LinkedIncident; edges: IncidentEdge[] }>();
  for (const row of rows) {
    for (const link of row.incidentLinks?.items ?? []) {
      if (link.state !== "LINKED") continue;
      const hit = byId.get(link.incidentId) ?? { head: link, edges: [] };
      hit.edges.push({ incidentId: link.incidentId, relationship: link.relationship, linkedAt: link.linkedAt, operation: row });
      byId.set(link.incidentId, hit);
    }
  }
  return [...byId.values()]
    .map(({ head, edges }) => ({
      incidentId: head.incidentId,
      targetType: head.incident.targetType,
      targetId: head.incident.targetId,
      environment: head.incident.environment,
      severity: head.incident.severity,
      workflowState: head.incident.workflowState,
      edges: [...edges].sort((a, b) => b.linkedAt.ms - a.linkedAt.ms || a.operation.operationId.localeCompare(b.operation.operationId)),
    }))
    .sort((a, b) => b.edges[0].linkedAt.ms - a.edges[0].linkedAt.ms || a.incidentId.localeCompare(b.incidentId));
}

/** The incidents a reader would call open exceptions: published state OPEN. */
export function openExceptionsOf(rows: readonly OperationV2[]): readonly IncidentSummary[] {
  return incidentsOf(rows).filter((incident) => incident.workflowState === "OPEN");
}

export type AuditKind = "created" | "acknowledged" | "resolved";
export interface AuditEvent {
  key: string;
  kind: AuditKind;
  at: InstantV2;
  operation: OperationV2;
}

/** The workflow timestamps the loaded rows publish, newest first, bounded by the caller. */
export function auditEventsOf(rows: readonly OperationV2[]): readonly AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const row of rows) {
    events.push({ key: `${row.operationId}:created`, kind: "created", at: row.createdAt, operation: row });
    if (row.acknowledgedAt !== null) events.push({ key: `${row.operationId}:acknowledged`, kind: "acknowledged", at: row.acknowledgedAt, operation: row });
    if (row.resolvedAt !== null) events.push({ key: `${row.operationId}:resolved`, kind: "resolved", at: row.resolvedAt, operation: row });
  }
  return events.sort((a, b) => b.at.ms - a.at.ms || a.key.localeCompare(b.key));
}

export const AUDIT_WORD: Readonly<Record<AuditKind, string>> = {
  created: "Created",
  acknowledged: "Acknowledged",
  resolved: "Resolved in the Portal",
};

/**
 * What the Next cell offers. The first matching published fact wins, in the order a manager must act:
 *  - an outcome that is unknown: check the original request (and never send it again);
 *  - a display that is still catching up: nothing to do, the figures are updating;
 *  - a receipt that has not arrived: the obligations on the target are the next place to look;
 *  - otherwise a plain review.
 */
export type NextAction = "check-original" | "display-updating" | "open-obligations" | "review";

export function nextActionOf(row: Pick<OperationV2, "sourceStatus" | "verificationResult" | "deliveryState" | "displayState" | "triageState">): NextAction {
  if (receiptOutcome(row.sourceStatus, row.verificationResult).checkOriginal) return "check-original";
  if (row.displayState === ("CATCHING_UP" satisfies DisplayStateV2)) return "display-updating";
  if (row.deliveryState === ("AWAITING_RECEIPT" satisfies DeliveryStateV2)) return "open-obligations";
  return "review";
}
