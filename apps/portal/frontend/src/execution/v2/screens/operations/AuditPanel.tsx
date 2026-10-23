/**
 * Audit tab (WP-B): the workflow record of the operations that were read, newest first. Every line is a timestamp the queue row
 * itself publishes (created, acknowledged, resolved in the Portal). WHO did it is not published (FE-021: the audit source is
 * unavailable and the queue drops actors on purpose), so the actor is said once for the whole table, never as a name, a dash or a
 * guess per line. The list is bounded (`AUDIT_CAP`) and says how many events the loaded rows held.
 */
import { useEffect, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import type { AuditFeedRow, OperationsAuditPage } from "../../readers/incidentChildren";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { FE, NotPublished } from "./notPublished";
import { AUDIT_WORD, auditEventsOf, type AuditEvent } from "./opsViews";
import { commandLabel, humanize } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";

/** DOM budget of the tab: a longer record narrows by filter or window, it does not grow the table. */
export const AUDIT_CAP = 100;
const number = (n: number) => n.toLocaleString("en-US");

/** The published audit feed (WP-K `portal.execution.operations-audit.v1`). A port without the read, a refusal or a throw is `null`: the tab keeps the record of the loaded rows. */
function useAuditFeed(api: ExecutionApi | undefined, workspaceId: string | undefined): OperationsAuditPage | null {
  const [page, setPage] = useState<OperationsAuditPage | null>(null);
  useEffect(() => {
    setPage(null);
    if (api === undefined || api.getOperationsAudit === undefined) return;
    let live = true;
    let pending: ReturnType<NonNullable<ExecutionApi["getOperationsAudit"]>>;
    try { pending = api.getOperationsAudit({ ...(workspaceId ? { workspaceId } : {}), limit: AUDIT_CAP }); } catch { return; }
    void pending.then((result) => { if (live && result.ok) setPage(result.value); }, () => undefined);
    return () => { live = false; };
  }, [api, workspaceId]);
  return page;
}

const feedColumns: readonly CardsColumn<AuditFeedRow>[] = [
  { key: "time", label: "Time", render: (row) => <time className="exec-ops-time" dateTime={new Date(row.atMs).toISOString()}>{formatAsOf(row.atMs)}</time> },
  { key: "actor", label: "Actor", render: (row) => <span className="exec-ops-mono">{row.actor}</span> },
  { key: "action", label: "Action", render: (row) => <Flag kind="neutral" label={humanize(row.action)} size="sm" /> },
  { key: "subject", label: "Subject", render: (row) => <span className="exec-ops-target"><span>{humanize(row.subject.type)}</span><span className="exec-ops-meta">{row.subject.id}</span></span> },
  { key: "receipt", label: "Receipt", render: (row) => (row.receiptRef === null ? <span className="exec-ops-meta">No receipt written</span> : <span className="exec-ops-mono">{row.receiptRef}</span>) },
];

export interface AuditPanelProps {
  rows: readonly OperationV2[];
  /** When given, the published audit feed (actor, action, subject, receipt) is read and shown; without it the tab is the workflow record of the loaded rows. */
  api?: ExecutionApi;
  workspaceId?: string;
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

export function AuditPanel({ rows, api, workspaceId, onOpenOperation }: AuditPanelProps) {
  const feed = useAuditFeed(api, workspaceId);
  if (feed !== null) {
    return (
      <div className="exec-ops-panel" data-view="audit" data-source="feed">
        <h2 className="exec-ops-panel-title">Audit</h2>
        <p className="exec-ops-reason">The audit feed of the operations workflow, newest first: who did what, to which subject, and the receipt it wrote.</p>
        <div className="exec-ops-table">
          <CardsTable columns={feedColumns} rows={feed.items} rowKey={(row) => row.auditId} label="Audit feed" empty="The audit feed has no event." />
          <div className="exec-ops-foot">
            <span>{feed.items.length === 0 ? "0 events." : `${number(feed.items.length)} ${feed.items.length === 1 ? "event" : "events"} shown${feed.hasMore ? "; older events exist and are not loaded." : "."}`}</span>
          </div>
        </div>
      </div>
    );
  }
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
