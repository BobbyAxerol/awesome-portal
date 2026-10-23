/**
 * Exceptions tab (WP-B): the open incidents the loaded operations link to (FE-042), one row per incident, with the operations that name
 * it. The server's own count of open exceptions (FE-CAT-2 `health.openException`) is printed above the list and is never replaced by
 * the list's length: the list is only as long as the rows READ, and the sentence under the heading says so.
 *
 * "From the existing queue" is the design's own wording for this source: there is no separate exception feed (FE-031), so an
 * exception here is an incident a command row links to, and an incident no loaded row links to is not shown.
 */
import { Link, useNavigate, type To } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { HealthCountV2, OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { FE, NotPublished } from "./notPublished";
import { openExceptionsOf, type IncidentSummary } from "./opsViews";
import { commandLabel, humanize, severityWord } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";

const number = (n: number) => n.toLocaleString("en-US");

export interface ExceptionsPanelProps {
  rows: readonly OperationV2[];
  /** The server's count for this scope and filters; `undefined` = the producer published none. */
  serverCount: HealthCountV2 | undefined;
  /** The incident page for an id. */
  incidentTo(incidentId: string): To;
  /** The operation list is bounded: more rows exist than were loaded. */
  moreRows: boolean;
  /** Operations the read loaded, before the range cut (the Commands tab's own "loaded" figure). */
  loadedCount?: number;
}

export function serverCountSentence(count: HealthCountV2 | undefined): string {
  if (count === undefined) return "The queue read publishes no open-exception count.";
  if (count.count === null) return "The owning source did not report an open-exception count.";
  return `The server counts ${number(count.count)} open ${count.count === 1 ? "exception" : "exceptions"} in scope${count.coverage === "PARTIAL" ? " (at least: some rows did not report)" : ""}.`;
}

function columnsFor(incidentTo: (id: string) => To): readonly CardsColumn<IncidentSummary>[] {
  return [
    {
      key: "incident",
      label: "Incident",
      render: (row) => (
        <span className="exec-ops-target">
          <Link className="exec-ops-id exec-ops-link-id" to={incidentTo(row.incidentId)} aria-label={`Open incident ${row.incidentId}`}>{row.incidentId}</Link>
          <span className="exec-ops-meta">{severityWord(row.severity)} · {ENV_LABEL[row.environment]}</span>
        </span>
      ),
    },
    {
      key: "state",
      label: "State",
      render: (row) => <Flag kind="attention" label={humanize(row.workflowState)} size="sm" />,
    },
    {
      key: "target",
      label: "Target",
      render: (row) => <TargetLink className="exec-ops-id" type={row.targetType} id={row.targetId} environment={row.environment} />,
    },
    {
      key: "operations",
      label: "Linked operations",
      render: (row) => (
        <ul className="exec-ops-link-list" role="list" aria-label={`Operations linked to ${row.incidentId}`}>
          {row.edges.map((edge) => (
            <li key={edge.operation.operationId} className="exec-ops-link">
              <span className="exec-ops-id">{commandLabel(edge.operation.commandKey)}</span>
              <span className="exec-ops-meta">{humanize(edge.relationship)}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "linked",
      label: "Last linked",
      render: (row) => <time className="exec-ops-time" dateTime={row.edges[0].linkedAt.iso}>{formatAsOf(row.edges[0].linkedAt.ms)}</time>,
    },
  ];
}

export function ExceptionsPanel({ rows, serverCount, incidentTo, moreRows, loadedCount }: ExceptionsPanelProps) {
  const navigate = useNavigate();
  const exceptions = openExceptionsOf(rows);
  const empty = serverCount?.count !== undefined && serverCount.count !== null && serverCount.count > 0
    ? `${serverCount.count === 1 ? "The server counts 1 open exception" : `The server counts ${number(serverCount.count)} open exceptions`}; none of the ${number(rows.length)} loaded operations links to one. Load more operations to find them.`
    : serverCount?.count === 0
      ? "No open exceptions in this scope."
      : "No loaded operation links to an open incident.";
  return (
    <div className="exec-ops-panel" data-view="exceptions">
      <h2 className="exec-ops-panel-title">Exceptions</h2>
      <p className="exec-ops-reason" data-role="server-count">{serverCountSentence(serverCount)}</p>
      <p className="exec-ops-reason">
        From the incident links of the {number(rows.length)} {rows.length === 1 ? "operation" : "operations"} in this range{loadedCount !== undefined && loadedCount !== rows.length ? ` (${number(loadedCount)} loaded)` : ""}; the list shows {number(exceptions.length)} open {exceptions.length === 1 ? "incident" : "incidents"}.
        {moreRows ? " More operations exist than are loaded, so the list can be shorter than the count." : ""}
        {" "}
        {serverCount === undefined ? <NotPublished id={FE.events}>No exception feed beyond incident links.</NotPublished> : null}
      </p>
      <div className="exec-ops-table">
        <CardsTable
          columns={columnsFor(incidentTo)}
          rows={exceptions}
          rowKey={(row) => row.incidentId}
          label="Exceptions"
          onRowOpen={(row) => navigate(incidentTo(row.incidentId))}
          empty={empty}
        />
      </div>
    </div>
  );
}
