/**
 * Incident page (WP-B, hi-fi `incident`): the routed screen at `/execution/operations/incidents/:incidentId`. The drawer over the
 * queue (`IncidentRootDrawer`, reached with `?peek=1`) stays the in-queue peek; this page is the deep link every other screen writes.
 *
 * Only published readers feed it:
 *   - `getIncidentRootV2` (`portal.execution.incident-current-root.v2`): state, severity, target, version, the lifecycle timestamps;
 *   - `listOperationalQueueV2`, read page by page (never filtered by the client): the operations whose published `incident_links`
 *     (FE-042) name this incident. That is a many-to-many join over the rows READ; the page says how many operations it searched,
 *     and an operation that links more than three incidents lists only its newest three (the server's bound), so a missing link is
 *     never proof of no link.
 * What no reader publishes is a typed absence with its request id, never a figure: the evidence per source, the assignee, the
 * dry-run evidence, per-event actors and versions, the original target of a child (`ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED`).
 * The four resolution gates print the fact the root publishes (acknowledged, mitigated) or a typed gap; the server's verdict on
 * "may resolve" is not published (FE-015), so the page does not say the incident can or cannot be resolved.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PanelState } from "../../../components/states";
import type { ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { DockAction } from "../../Drawer";
import { NotAvailableLine, SectionPanel } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import type { IncidentRootV2, InstantV2, OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL, withContext } from "../../urlState";
import { INCIDENT_ACTION_REASONS, railFor, STATE_FLAG } from "./IncidentRootDrawer";
import { ACCESS_PATH, AccessLink, FE, FE_B1, notPublishedReason } from "./notPublished";
import { commandLabel, humanize, receiptOutcome } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";
import "../../css/operationsIncident.css";

/** Operations the page searches for links: pages of the server's largest size, up to this many pages. */
export const SCAN_PAGE_ROWS = 250;
export const SCAN_PAGES = 4;

export const EXPOSURE_REASON = notPublishedReason(FE.eligibility, "ADMIN-only write with evidence, not offered yet.");
export const EVIDENCE_REASON = notPublishedReason(FE.events, "No evidence attach route is published.");

/** The four evidence sources of the hi-fi, each unpublished today (FE-031). */
export const EVIDENCE_SOURCES = ["Findings", "Alerts", "Dead letters", "Order trace"] as const;

type RootLoad =
  | { phase: "loading" }
  | { phase: "failed"; status: Exclude<PanelStatus, "ok">; reason: string }
  | { phase: "unsupported"; schemaVersion: string | null }
  | { phase: "ready"; incident: IncidentRootV2 };

export type ScanLoad =
  | { phase: "loading" }
  | { phase: "failed"; reason: string }
  | { phase: "ready"; rows: readonly OperationV2[]; matching: number; complete: boolean };

/** One operation that names this incident, with the relationship its link carries. */
export interface LinkedOperation {
  row: OperationV2;
  relationship: "TRIGGERED_BY" | "MITIGATES" | "RELATED";
  linkedAt: InstantV2;
}

/** The loaded rows whose published links name `incidentId`, newest link first. */
export function linkedOperationsOf(rows: readonly OperationV2[], incidentId: string): readonly LinkedOperation[] {
  const hits: LinkedOperation[] = [];
  for (const row of rows) {
    for (const link of row.incidentLinks?.items ?? []) {
      if (link.state === "LINKED" && link.incidentId === incidentId) hits.push({ row, relationship: link.relationship, linkedAt: link.linkedAt });
    }
  }
  return hits.sort((a, b) => b.linkedAt.ms - a.linkedAt.ms || a.row.operationId.localeCompare(b.row.operationId));
}

const RELATION_WORD = { TRIGGERED_BY: "Triggered by this incident", MITIGATES: "Mitigates this incident", RELATED: "Related to this incident" } as const;

function instant(value: InstantV2 | null, absent: string) {
  return value === null ? absent : <time dateTime={value.iso} title={value.iso}>{formatAsOf(value.ms)}</time>;
}

/** Reads the queue page by page, as a person scrolling would, and reports how far it got. */
function useScan(api: ExecutionApi, workspaceId: string | undefined): ScanLoad {
  const [state, setState] = useState<ScanLoad>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    void (async () => {
      const rows: OperationV2[] = [];
      let after: string | undefined;
      let matching = 0;
      let complete = false;
      for (let page = 0; page < SCAN_PAGES; page += 1) {
        const result = await api.listOperationalQueueV2({ workspaceId, limit: SCAN_PAGE_ROWS, after }).catch(() => null);
        if (!live) return;
        if (result === null) {
          setState({ phase: "failed", reason: "The operations read never reached the Portal." });
          return;
        }
        if (!result.ok) {
          setState({ phase: "failed", reason: result.reason });
          return;
        }
        if (result.value.kind !== "queue") {
          setState({ phase: "failed", reason: "The operations read answered a shape this build does not read." });
          return;
        }
        const queue = result.value.queue;
        rows.push(...queue.page.rows);
        matching = queue.page.filteredCount;
        if (queue.page.nextCursor === null || !queue.page.hasMore) {
          complete = true;
          break;
        }
        after = queue.page.nextCursor;
      }
      if (live) setState({ phase: "ready", rows, matching, complete });
    })();
    return () => { live = false; };
  }, [api, workspaceId]);
  return state;
}

export interface IncidentPageProps {
  api: ExecutionApi;
  incidentId: string;
  workspaceId?: string;
  /** The Operations queue this incident was reached from; "Back to Operations" and the operation links go there. */
  queuePath?: string;
  accessHref?: string;
}

function Gate({ label, state, children }: { label: string; state: "met" | "open" | "not-published"; children: ReactNode }) {
  const mark = state === "met" ? "✓" : state === "open" ? "✕" : "○";
  const word = state === "met" ? "Met" : state === "open" ? "Open" : "Not published";
  return (
    <li className="exec-opi-gate" data-state={state}>
      <span className="exec-opi-gate-mark" aria-hidden="true">{mark}</span>
      <span className="exec-opi-gate-text">
        <span className="exec-opi-gate-label">{label}</span>
        <span className="exec-blk-sr"> ({word})</span>
        <span className="exec-ops-meta">{children}</span>
      </span>
    </li>
  );
}

export default function IncidentPage({ api, incidentId, workspaceId, queuePath = "/execution/operations", accessHref = ACCESS_PATH }: IncidentPageProps) {
  const [params] = useSearchParams();
  const [root, setRoot] = useState<RootLoad>({ phase: "loading" });
  const scan = useScan(api, workspaceId);

  useEffect(() => {
    let live = true;
    setRoot({ phase: "loading" });
    api.getIncidentRootV2(incidentId, workspaceId).then(
      (result) => {
        if (!live) return;
        if (!result.ok) {
          setRoot({ phase: "failed", status: result.status, reason: result.reason });
          return;
        }
        const read = result.value;
        setRoot(read.kind === "incident" ? { phase: "ready", incident: read.incident } : { phase: "unsupported", schemaVersion: read.schemaVersion });
      },
      () => { if (live) setRoot({ phase: "failed", status: "unavailable", reason: "The incident read never reached the Portal." }); },
    );
    return () => { live = false; };
  }, [api, incidentId, workspaceId]);

  const back = (
    <p className="exec-opi-back">
      <Link to={withContext(queuePath, withoutPeek(params))}>Operations</Link>
      <span aria-hidden="true"> / </span>
      <span>Incident</span>
    </p>
  );

  if (root.phase !== "ready") {
    return (
      <div className="exec-opi" data-page="incident">
        {back}
        <h1 className="exec-ops-title">Incident <span className="exec-ops-mono">{incidentId}</span></h1>
        {root.phase === "loading" ? <PanelState status="loading" /> : null}
        {root.phase === "failed" ? <PanelState status={root.status} reason={root.reason} actions={root.status === "denied" ? <AccessLink href={accessHref} /> : undefined} /> : null}
        {root.phase === "unsupported" ? (
          <PanelState
            status="unavailable"
            reason={`The server answered an incident shape this build does not read (${root.schemaVersion ?? "no schema version"}). Nothing is shown rather than a wrong reading.`}
          />
        ) : null}
      </div>
    );
  }

  const incident = root.incident;
  const flag = STATE_FLAG[incident.workflowState];
  const linked = scan.phase === "ready" ? linkedOperationsOf(scan.rows, incident.incidentId) : [];
  const anyTruncated = scan.phase === "ready" && scan.rows.some((row) => row.incidentLinks?.truncated === true);
  const anyUnpublished = scan.phase === "ready" && scan.rows.some((row) => row.incidentLinks === undefined);
  const events: { key: string; word: string; at: InstantV2 }[] = [
    { key: "created", word: "Created", at: incident.createdAt },
    ...(incident.acknowledgedAt ? [{ key: "acknowledged", word: "Acknowledged", at: incident.acknowledgedAt }] : []),
    ...(incident.mitigatedAt ? [{ key: "mitigated", word: "Mitigated", at: incident.mitigatedAt }] : []),
    ...(incident.resolvedAt ? [{ key: "resolved", word: "Resolved in the Portal", at: incident.resolvedAt }] : []),
  ].sort((a, b) => a.at.ms - b.at.ms);

  return (
    <div className="exec-opi" data-page="incident" data-state={incident.workflowState}>
      {back}
      <header className="exec-opi-head">
        <div className="exec-opi-title">
          <span className="exec-opi-tag"><Flag kind="incident" label="Incident" size="md" /></span>
          <h1 className="exec-ops-title">Incident <span className="exec-ops-mono">{incident.incidentId}</span></h1>
          <p className="exec-opi-sub">
            <TargetLink type={incident.targetType} id={incident.targetId} environment={incident.environment} />
            <span> · {ENV_LABEL[incident.environment]} · version <span className="exec-ops-mono">{incident.workflowVersion}</span> · </span>
            <span className="exec-blk-na">No assignee published</span>
          </p>
        </div>
        <div className="exec-opi-chips">
          <Flag kind={flag.kind} label={`${flag.label} · ${humanize(incident.severity)}`} size="md" />
          <span className="exec-ops-chip">Observed {formatAsOf(incident.observedAtMs)}</span>
        </div>
      </header>

      <section className="exec-opi-rail" aria-label="Workflow state">
        <ol className="exec-ops-rail" aria-label="Workflow state steps">
          {railFor(incident.workflowState).map((s) => (
            <li key={s.state} data-step={s.step} aria-current={s.step === "current" ? "step" : undefined}>
              {s.step === "done" ? <span aria-hidden="true">✓ </span> : null}
              {humanize(s.state)}
            </li>
          ))}
        </ol>
        <p className="exec-ops-reason">Forward only. Mitigated and resolved are Portal records, not a safety statement.</p>
      </section>

      <div className="exec-opi-grid">
        <SectionPanel title="Evidence" level={2} aside="Not published">
          <ul className="exec-opi-chiplist" role="list" aria-label="Evidence sources">
            {EVIDENCE_SOURCES.map((name) => (
              <li key={name} className="exec-opi-gapchip" data-source={name}>{name} · Not available</li>
            ))}
          </ul>
          <NotAvailableLine
            className="exec-ops-na-line"
            facts={EVIDENCE_SOURCES.map((name) => ({ label: name, id: FE.events, why: incident.historicalChildren.reasonCode }))}
          />
          <p className="exec-ops-reason">Missing evidence, not an absence of findings. References only: a digest and metadata, never the artifact itself.</p>
        </SectionPanel>

        <SectionPanel title="Operations taken" level={2} aside={scan.phase === "ready" ? `${linked.length} ${linked.length === 1 ? "operation" : "operations"}` : undefined}>
          {scan.phase === "loading" ? <PanelState status="loading" /> : null}
          {scan.phase === "failed" ? <PanelState status="unavailable" reason={scan.reason} /> : null}
          {scan.phase === "ready" ? (
            <>
              {linked.length === 0 ? (
                <p className="exec-ops-reason" data-role="no-linked">No searched operation links to this incident.</p>
              ) : (
                <ul className="exec-opi-ops" role="list" aria-label="Linked operations">
                  {linked.map(({ row, relationship, linkedAt }) => {
                    const outcome = receiptOutcome(row.sourceStatus, row.verificationResult);
                    return (
                      <li key={row.operationId} className="exec-opi-op">
                        <span className="exec-opi-op-head">
                          <Link className="exec-ops-link-id" to={withContext(`${queuePath}?operation=${encodeURIComponent(row.operationId)}`, withoutPeek(params))}>{commandLabel(row.commandKey)}</Link>
                          <Flag kind={outcome.kind} label={outcome.label} size="sm" />
                        </span>
                        <span className="exec-ops-meta">{RELATION_WORD[relationship]} · linked {instant(linkedAt, "")}</span>
                        <span className="exec-ops-meta">
                          Target now <TargetLink type={row.targetType} id={row.targetId} environment={row.environment} />
                          {" · "}Original target: not attested ({incident.historicalChildren.reasonCode})
                        </span>
                        {row.deliveryState ? <span className="exec-ops-meta">Receipt: {humanize(row.deliveryState)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="exec-ops-reason" data-role="scan">
                Found in the newest {scan.rows.length.toLocaleString("en-US")} of {scan.matching.toLocaleString("en-US")} operations{scan.complete ? "" : "; older operations were not searched"}.
                {anyTruncated ? " An operation that links more than three incidents lists only its newest three." : ""}
                {anyUnpublished ? ` Incident links are not published for some rows (${FE_B1.links}).` : ""}
              </p>
              <p className="exec-ops-reason">Changes run plan, apply, then verify in Operations. This page only links to them.</p>
            </>
          ) : null}
        </SectionPanel>

        <SectionPanel title="Resolution gates" level={2} aside="Server verdict not published">
          <ul className="exec-opi-gates" role="list" aria-label="Resolution gates">
            <Gate label="Somebody has acknowledged this incident" state={incident.acknowledgedAt ? "met" : "open"}>
              {incident.acknowledgedAt ? <>Acknowledged {instant(incident.acknowledgedAt, "")}</> : "Not acknowledged"}
            </Gate>
            <Gate label="This incident has an assignee" state="not-published">Not available ({FE.assignee})</Gate>
            <Gate label="Exposure is recorded as mitigated" state={incident.mitigatedAt ? "met" : "open"}>
              {incident.mitigatedAt ? <>Mitigated {instant(incident.mitigatedAt, "")}</> : "Not mitigated"}
            </Gate>
            <Gate label="A clean dry-run evidence reference is attached" state="not-published">Not available ({FE.events})</Gate>
          </ul>
          <p className="exec-ops-reason">Resolve unlocks only when every gate is met. The server enforces the gates and does not publish its verdict ({FE.eligibility}); this list mirrors the facts the incident root does publish.</p>
        </SectionPanel>

        <SectionPanel title="Timeline" level={2} aside={`${events.length} ${events.length === 1 ? "event" : "events"}`}>
          <ol className="exec-opi-timeline" aria-label="Timeline">
            {events.map((event) => (
              <li key={event.key} className="exec-opi-event">
                <span className="exec-opi-event-time">{instant(event.at, "")}</span>
                <span className="exec-opi-event-word">{event.word}</span>
              </li>
            ))}
          </ol>
          <NotAvailableLine className="exec-ops-na-line" facts={[{ label: "Actor", id: FE.audit }, { label: "Version per event", id: FE.events }]} />
        </SectionPanel>
      </div>

      <SectionPanel title="Children and original targets" level={2} aside="Not published">
        <NotAvailableLine
          className="exec-ops-na-line"
          facts={[
            { label: "Original incident target", id: FE.events, why: incident.historicalChildren.reasonCode },
            { label: "Child records", id: FE.events, why: incident.historicalChildren.reasonCode },
          ]}
        />
        <p className="exec-ops-reason">
          The incident root is the current record, not the historical lineage ({incident.historicalChildren.reasonCode}). The target above is the one it holds now.
        </p>
      </SectionPanel>

      <SectionPanel title="Actions" level={2}>
        <div className="exec-ops-actions" role="group" aria-label="Incident actions">
          <DockAction label="Acknowledge" reason={INCIDENT_ACTION_REASONS.acknowledge} accessHref={accessHref} />
          <DockAction label="Assign to me" reason={INCIDENT_ACTION_REASONS.assign} accessHref={accessHref} />
          <DockAction label="Record exposure mitigated" reason={EXPOSURE_REASON} accessHref={accessHref} />
          <DockAction label="Attach dry-run evidence" reason={EVIDENCE_REASON} accessHref={accessHref} />
          <DockAction label="Mark mitigated" reason={INCIDENT_ACTION_REASONS.mitigate} accessHref={accessHref} />
          <DockAction label="Mark resolved" reason={INCIDENT_ACTION_REASONS.resolve} variant="primary" accessHref={accessHref} />
        </div>
        <p className="exec-ops-reason">Resolving closes the incident only. It never resumes a deployment; resuming is its own plan, apply and verify with a fresh sync.</p>
      </SectionPanel>
    </div>
  );
}

function withoutPeek(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("peek");
  next.delete("sel");
  return next;
}
