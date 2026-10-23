/**
 * The four sections of the HIFI incident page below the facts: Evidence, Operations taken, Resolution gates, Timeline.
 *
 * Each section is read from the incident DETAIL (`execution.incident-detail.v1`, the `getIncident` port method) when
 * the server published it, and otherwise says on its own that it is not available, with the reason code the incident
 * root gave (`historicalChildren.reasonCode`). One section missing never hides another, and an empty collection the
 * server did publish (total 0) is a stated zero, not an absence. Nothing is derived, counted or invented here.
 */
import type { ReactNode } from "react";

import { NotAvailableLine } from "../../blocks";
import { formatAsOf } from "../../boundary";
import type { UtcEpochMs } from "../../../screenDataContract";
import type { IncidentCollection, IncidentDetail } from "../../../operations";
import { FE } from "./notPublished";
import { humanize } from "./outcome";

import "../../css/operations.css";

export const INCIDENT_SECTIONS = ["Evidence", "Operations taken", "Resolution gates", "Timeline"] as const;
export type IncidentSectionName = (typeof INCIDENT_SECTIONS)[number];

function instantText(iso: string | null): ReactNode {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return <time dateTime={iso} title={iso}>{formatAsOf(ms as UtcEpochMs)}</time>;
}

function Section({ name, children }: { name: IncidentSectionName; children: ReactNode }) {
  return (
    <section aria-label={name} data-section={name}>
      <h4 className="exec-ops-section">{name}</h4>
      {children}
    </section>
  );
}

function Absent({ name, reasonCode }: { name: IncidentSectionName; reasonCode: string }) {
  return <NotAvailableLine className="exec-ops-na-line" facts={[{ label: name, id: FE.events, why: reasonCode }]} />;
}

/** The server bounded this collection: say how many of how many are shown, never infer the rest. */
function bound<T>(c: IncidentCollection<T>): string | null {
  if (!c.truncated) return null;
  const shown = c.returnedCount ?? c.rows.length;
  return c.totalCount === null ? `Showing ${shown}; the server bounded this list.` : `Showing ${shown} of ${c.totalCount}.`;
}

function Collection<T>({ c, empty, row }: { c: IncidentCollection<T>; empty: string; row(item: T): ReactNode }) {
  const note = bound(c);
  return (
    <>
      {c.rows.length === 0 ? <p className="exec-ops-reason">{empty}</p> : <ul className="exec-ops-dim-list" role="list">{c.rows.map(row)}</ul>}
      {note ? <p className="exec-ops-reason">{note}</p> : null}
    </>
  );
}

export interface IncidentSectionsProps {
  /** `null` = the detail was not read (the route answered the root only, or the read failed). */
  detail: IncidentDetail | null;
  /** The root's stated reason the children are not published. */
  reasonCode: string;
}

export function IncidentSections({ detail, reasonCode }: IncidentSectionsProps) {
  if (detail === null) {
    return <>{INCIDENT_SECTIONS.map((name) => <Section key={name} name={name}><Absent name={name} reasonCode={reasonCode} /></Section>)}</>;
  }
  const gate = detail.resolutionGate;
  return (
    <>
      <Section name="Evidence">
        <Collection
          c={detail.evidence}
          empty="No evidence references are recorded on this incident."
          row={(e) => (
            <li key={e.evidenceId} className="exec-ops-dim-row">
              <span>{e.label ?? "Evidence reference"} <span className="exec-ops-mono">{e.hash ?? e.evidenceId}</span></span>
              <span>{instantText(e.addedAt)}</span>
            </li>
          )}
        />
      </Section>
      <Section name="Operations taken">
        <Collection
          c={detail.correlatedOperations}
          empty="No operation is linked to this incident."
          row={(o) => (
            <li key={o.operationId} className="exec-ops-dim-row">
              <span>
                <span className="exec-ops-mono">{o.commandKey ?? o.operationId}</span>
                {o.relationship ? ` · ${humanize(o.relationship)}` : ""}
                {o.verificationResult ? ` · ${humanize(o.verificationResult)}` : ""}
              </span>
              <span>{instantText(o.linkedAt)}</span>
            </li>
          )}
        />
      </Section>
      <Section name="Resolution gates">
        {gate === null ? <Absent name="Resolution gates" reasonCode="resolution_gate was not in this read" /> : (
          <>
            <p className="exec-ops-reason">{gate.eligible ? "The server reports this incident eligible to resolve." : "The server reports this incident not yet eligible to resolve."}</p>
            {gate.blockerCodes.length > 0 ? (
              <ul className="exec-ops-dim-list" role="list" aria-label="Blockers">
                {gate.blockerCodes.map((code) => <li key={code} className="exec-ops-dim-row"><span>{humanize(code)}</span></li>)}
              </ul>
            ) : null}
            <p className="exec-ops-reason">
              {gate.cleanDryRunEvidencePresent ? "Clean dry-run evidence is present." : "Clean dry-run evidence is not present."}
              {gate.reasonRequired ? " A resolution reason is required." : ""}
              {" Resolving never resumes a deployment."}
            </p>
          </>
        )}
      </Section>
      <Section name="Timeline">
        <Collection
          c={detail.timeline}
          empty="No workflow event is recorded on this incident."
          row={(t) => (
            <li key={t.eventId} className="exec-ops-dim-row">
              <span>
                {humanize(t.action ?? "unknown event")}
                {t.versionBefore !== null && t.versionAfter !== null ? ` · v${t.versionBefore} to v${t.versionAfter}` : ""}
                {t.actor ? ` · ${t.actor}` : ""}
              </span>
              <span>{instantText(t.createdAt)}</span>
            </li>
          )}
        />
      </Section>
    </>
  );
}
