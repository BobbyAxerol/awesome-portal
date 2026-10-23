/**
 * Audit tab (WP-B): the workflow record of the operations that were read, newest first. Every line is a timestamp the queue row
 * itself publishes (created, acknowledged, resolved in the Portal). WHO did it is not published (FE-021: the audit source is
 * unavailable and the queue drops actors on purpose), so the actor is said once for the whole table, never as a name, a dash or a
 * guess per line. The list is bounded (`AUDIT_CAP`) and says how many events the loaded rows held.
 */
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { FE, NotPublished } from "./notPublished";
import { AUDIT_WORD, auditEventsOf, type AuditEvent } from "./opsViews";
import { commandLabel } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";

/** DOM budget of the tab: a longer record narrows by filter or window, it does not grow the table. */
export const AUDIT_CAP = 100;
const number = (n: number) => n.toLocaleString("en-US");

export interface AuditPanelProps {
  rows: readonly OperationV2[];
  /** Opens the operation in the Commands tab drawer. */
  onOpenOperation(operationId: string): void;
}

function columnsFor(onOpenOperation: (id: string) => void): readonly CardsColumn<AuditEvent>[] {
  return [
    {
      key: "time",
      label: "Time",
      render: (event) => <time className="exec-ops-time" dateTime={event.at.iso}>{formatAsOf(event.at.ms)}</time>,
    },
    {
      key: "event",
      label: "Event",
      render: (event) => <Flag kind={event.kind === "created" ? "operation" : "neutral"} label={AUDIT_WORD[event.kind]} size="sm" />,
    },
    {
      key: "operation",
      label: "Operation",
      render: (event) => (
        <span className="exec-ops-target">
          <button type="button" className="exec-ops-linkbtn" onClick={(e) => { e.stopPropagation(); onOpenOperation(event.operation.operationId); }}>
            {commandLabel(event.operation.commandKey)}
          </button>
          <span className="exec-ops-meta">{event.operation.operationId} · {ENV_LABEL[event.operation.environment]}</span>
        </span>
      ),
    },
    {
      key: "target",
      label: "Target",
      render: (event) => (
        <TargetLink className="exec-ops-id" type={event.operation.targetType} id={event.operation.targetId} environment={event.operation.environment} />
      ),
    },
  ];
}

export function AuditPanel({ rows, onOpenOperation }: AuditPanelProps) {
  const all = auditEventsOf(rows);
  const shown = all.slice(0, AUDIT_CAP);
  return (
    <div className="exec-ops-panel" data-view="audit">
      <h2 className="exec-ops-panel-title">Audit</h2>
      <p className="exec-ops-reason">
        The Portal workflow record of the {number(rows.length)} loaded {rows.length === 1 ? "operation" : "operations"}: when each was created, acknowledged and resolved.
        {" "}
        <NotPublished id={FE.audit}>Who did it is not shown: the audit source is unavailable.</NotPublished>
      </p>
      <div className="exec-ops-table">
        <CardsTable
          columns={columnsFor(onOpenOperation)}
          rows={shown}
          rowKey={(event) => event.key}
          label="Audit"
          empty="No operation is loaded, so there is no workflow record to show."
        />
        <div className="exec-ops-foot">
          <span>
            {all.length > AUDIT_CAP
              ? `${number(AUDIT_CAP)} newest of ${number(all.length)} events in the loaded operations. Narrow the window or the filters to see the rest.`
              : `${number(all.length)} ${all.length === 1 ? "event" : "events"} in the loaded operations.`}
          </span>
        </div>
      </div>
    </div>
  );
}
