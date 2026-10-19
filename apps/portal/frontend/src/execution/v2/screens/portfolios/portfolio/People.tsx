/**
 * People and Activity: attribution, approvals and incidents scoped to this
 * portfolio, and the activity feed and configuration log the backend has not
 * published.
 *
 * Approvals and Incidents are embeds, not tabs (decision 5). Incidents come
 * from the operations queue filtered to this portfolio as the target, with the
 * incident links the queue publishes (FE-042); a short list never proves there
 * is no other incident. The approvals read cannot be scoped to a portfolio, so
 * that panel says so and links to the whole queue instead of guessing from a
 * subject string.
 */
import { SectionPanel } from "../../../blocks";
import { CardsTable, type CardsColumn } from "../../../cardsTable";
import { Flag } from "../../../Flag";
import type { FlagKind } from "../../../flagKinds";
import { formatAsOf } from "../../../boundary";
import type { IncidentLinkV2, OperationV2 } from "../../../readers/operationalQueue";
import { ENV_LABEL } from "../../../urlState";
import { PF_FE } from "../fe";
import { joinQuery } from "../routes";
import { Absent, Np, humanize } from "../format";
import type { TabCtx } from "./ctx";
import { groupAlphas } from "./model";
import { InternalLink, ReadGate } from "./parts";

import "../../../css/portfolios.css";

/**
 * The incident drawer route over the operations queue. An incident id is not an operation id, so it never
 * rides `?sel=` (that selects an operation row); it has its own path under the queue.
 */
export function incidentRoute(operations: string, incidentId: string): string {
  const queryAt = operations.indexOf("?");
  const path = queryAt < 0 ? operations : operations.slice(0, queryAt);
  const query = queryAt < 0 ? "" : operations.slice(queryAt);
  return `${path}/incidents/${encodeURIComponent(incidentId)}${query}`;
}

const FE_INCIDENT_LINKS = { fe: "FE-042", what: "Operation-to-incident links" } as const;

const SEVERITY_KIND: Readonly<Record<string, FlagKind>> = { CRITICAL: "incident", ERROR: "incident", WARNING: "attention", INFO: "neutral" };

interface PersonRow { key: string; person: string | null; role: string; basis: string }

function Attribution({ ctx }: { ctx: TabCtx }) {
  const groups = groupAlphas(ctx.deployments);
  const rows: PersonRow[] = [
    { key: "owner", person: ctx.identity.owner, role: "Portfolio owner", basis: "Portfolio record" },
    ...groups.map((g) => ({ key: `alpha:${g.key}`, person: g.owner, role: `Alpha owner · ${g.label}`, basis: "Attribution" })),
  ];
  const columns: CardsColumn<PersonRow>[] = [
    { key: "person", label: "Person", render: (r) => r.person ?? <Absent reason="owner not published" /> },
    { key: "role", label: "Role here", render: (r) => r.role },
    { key: "basis", label: "Basis", render: (r) => <Flag kind="neutral" label={r.basis} size="sm" /> },
  ];
  return (
    <SectionPanel title="Attribution">
      <CardsTable label="Attribution" columns={columns} rows={rows} rowKey={(r) => r.key} />
      <p className="exec-pf-note">Who holds the portfolio-manager grant and who may act as a delegate is not published here. <InternalLink to={ctx.routes.access} search={ctx.search}>See your own access</InternalLink>.</p>
    </SectionPanel>
  );
}

const linkedIncidents = (operations: readonly OperationV2[]) => {
  const seen = new Map<string, Extract<IncidentLinkV2, { state: "LINKED" }>>();
  let notAttested = 0;
  for (const op of operations) {
    for (const link of op.incidentLinks?.items ?? []) {
      if (link.state === "LINKED") {
        if (!seen.has(link.incidentId)) seen.set(link.incidentId, link);
      } else notAttested += 1;
    }
  }
  return { incidents: [...seen.values()], notAttested };
};

function OperationsPanel({ ctx }: { ctx: TabCtx }) {
  return (
    <ReadGate state={ctx.reads.operations} idle={<p className="exec-pf-note">Read when this tab opens.</p>}>
      {(read) => {
        if (read.kind !== "queue") return <p className="exec-pf-note"><Absent reason={`the operations read answered a shape this screen does not read (${read.schemaVersion ?? "no schema_version"})`} /></p>;
        const { rows, filteredCount } = read.queue.page;
        const published = rows.some((op) => op.incidentLinks !== undefined);
        const { incidents, notAttested } = linkedIncidents(rows);
        const opColumns: CardsColumn<OperationV2>[] = [
          { key: "when", label: "When · UTC", render: (op) => formatAsOf(op.createdAt.ms) },
          { key: "command", label: "Operation", render: (op) => <InternalLink to={joinQuery(ctx.routes.operations, `operation=${encodeURIComponent(op.operationId)}`)} search={ctx.search}>{humanize(op.commandKey.replace(/[/.]/g, " "))}</InternalLink> },
          { key: "environment", label: "Environment", render: (op) => ENV_LABEL[op.environment] },
          { key: "severity", label: "Severity", render: (op) => <Flag kind={SEVERITY_KIND[op.severity] ?? "unknown"} label={humanize(op.severity)} size="sm" /> },
          { key: "source", label: "Queue state", render: (op) => humanize(op.sourceStatus) },
          { key: "verification", label: "Verification", render: (op) => humanize(op.verificationResult) },
        ];
        return (
          <div className="exec-pf-stack">
            <SectionPanel title="Incidents" aside={<InternalLink to={ctx.routes.operations} search={ctx.search}>Operations</InternalLink>}>
              <div id="incidents">
                {!published ? (
                  <p className="exec-pf-note"><Np fact={FE_INCIDENT_LINKS}>The queue publishes no incident links, so no incident can be attached to this portfolio.</Np></p>
                ) : incidents.length === 0 ? (
                  <p className="exec-pf-note">No incident is linked to the latest {rows.length} operations on this portfolio. A short list never proves there is no other incident.</p>
                ) : (
                  <ul className="exec-pf-list" aria-label="Linked incidents">
                    {incidents.map((link) => (
                      <li key={link.incidentId}>
                        <Flag kind={link.incident.workflowState === "OPEN" ? "incident" : "neutral"} label={humanize(link.incident.workflowState)} size="sm" />{" "}
                        <InternalLink to={incidentRoute(ctx.routes.operations, link.incidentId)} search={ctx.search}>{link.incidentId}</InternalLink>
                        <span className="exec-pf-dim"> · {humanize(link.incident.severity)} · {humanize(link.relationship)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {notAttested > 0 ? <p className="exec-pf-note">{notAttested} {notAttested === 1 ? "link is" : "links are"} not attested and name no incident.</p> : null}
              </div>
            </SectionPanel>
            <SectionPanel title="Operations on this portfolio" aside={`${rows.length} of ${filteredCount}`}>
              {rows.length === 0 ? (
                <p className="exec-pf-note">The operations queue published no operation that targets this portfolio.</p>
              ) : (
                <CardsTable label="Operations on this portfolio" columns={opColumns} rows={rows} rowKey={(op) => op.operationId} />
              )}
            </SectionPanel>
          </div>
        );
      }}
    </ReadGate>
  );
}

export function PeopleTab({ ctx }: { ctx: TabCtx }) {
  return (
    <div className="exec-pf-stack">
      <div className="exec-pf-grid2">
        <SectionPanel title="Activity" aside="Receipt and display are separate">
          <p className="exec-pf-note"><Np fact={PF_FE.activity}>There is no feed of what happened to this portfolio yet.</Np></p>
        </SectionPanel>
        <Attribution ctx={ctx} />
      </div>
      <div className="exec-pf-grid2">
        <SectionPanel title="Approvals" aside={<InternalLink to={ctx.routes.approvals} search={ctx.search}>All approvals</InternalLink>}>
          <div id="approvals">
            <p className="exec-pf-note"><Absent reason="the approvals read cannot be limited to one portfolio" /></p>
            <p className="exec-pf-note">Open the approval queue to see requests that name {ctx.identity.name}.</p>
          </div>
        </SectionPanel>
        <OperationsPanel ctx={ctx} />
      </div>
      <SectionPanel title="Configuration log">
        <p className="exec-pf-note"><Np fact={PF_FE.audit}>Who changed the allocation lock or the approved budget, and when, has no source yet.</Np></p>
      </SectionPanel>
    </div>
  );
}
