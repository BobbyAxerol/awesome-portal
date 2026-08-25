/**
 * Phase 7 — Operations Queue (hi-fi 4e, WF 4e, ops dark).
 *
 * One row is one `operation_id` travelling plan → apply → verify, and the
 * hi-fi's own footer states the invariant this screen exists for: *nothing
 * ages silently*.
 *
 * THREE STATES PER ROW, NEVER MERGED
 *
 * `source_status` is what the Trading System is doing. `verification_result`
 * is what verify observed. `triage_state` is what a person in the Portal has
 * done about it. A single "status" column would let `RESOLVED` sit over a
 * `FAILED` source and read as success, which is the failure this whole cluster
 * is built to prevent — so they are three columns with three headings.
 *
 * And acknowledging or resolving here changes NOTHING upstream. The workflow
 * response pins `source_status_unchanged: true` and
 * `source_side_effect_requested: false` as schema constants; every mutation
 * carries that sentence rather than leaving the operator to infer it from a
 * green row.
 *
 * The alert rail the hi-fi draws is rendered unavailable on purpose. Alerts are
 * one of the eight `ops` capabilities the Trading System publishes no route
 * for, and codex's stop gates require it stay visibly unavailable rather than
 * be hidden or filled with something else.
 */
import type { ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { formatAge } from "../components/badges";
import type { PanelStatus } from "../contracts";
import type { OperationsQueue, QueueRow, TriageState } from "../operations";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionWorkspace,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";

/** The hi-fi's three chips. Applied server-side; they never filter loaded rows. */
export const QUEUE_FILTERS = ["NEEDS_ATTENTION", "MINE", "ALL_24H"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

const FILTER_LABEL: Record<QueueFilter, string> = {
  NEEDS_ATTENTION: "Needs attention",
  MINE: "Mine",
  ALL_24H: "All (24h)",
};

/**
 * Chips the server cannot honour yet.
 *
 * `GET /operations` publishes no actor, assignee or owner parameter, so "Mine"
 * would send exactly what "All (24h)" sends and return exactly the same rows.
 * A chip labelled Mine that shows everybody's operations is worse than a chip
 * that is visibly unavailable: the first is a filter the operator trusts, and
 * the second is a gap they can see. Kept visible and disabled, with the reason,
 * rather than deleted — a missing chip reads as a design choice.
 */
export const UNSUPPORTED_FILTERS: Record<QueueFilter, string | null> = {
  NEEDS_ATTENTION: null,
  MINE: "The operations endpoint publishes no actor filter, so this cannot narrow to your own work yet.",
  ALL_24H: null,
};

/**
 * Which rows the hi-fi tints amber.
 *
 * Derived from the SOURCE state, never from triage: an operation a person has
 * acknowledged is still `PARTIAL` at the source, and dimming it because
 * somebody clicked would hide the thing that needs attention.
 */
export function needsAttention(row: QueueRow): boolean {
  return (
    row.verificationResult === "PARTIAL" ||
    row.verificationResult === "UNCERTAIN" ||
    row.sourceStatus === "FAILED" ||
    row.sourceStatus === "UNCERTAIN"
  );
}

const TRIAGE_LABEL: Record<TriageState, string> = {
  UNACKNOWLEDGED: "unacknowledged",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved",
};

function ageFrom(createdAt: string | null, now: Date): string {
  if (!createdAt) return "age not stated";
  const ms = now.getTime() - Date.parse(createdAt);
  return Number.isNaN(ms) ? "age not stated" : (formatAge(Math.floor(ms / 1000)) ?? "—");
}

function QueueTableRow({
  row,
  now,
  onOpen,
  selected = false,
}: {
  row: QueueRow;
  now: Date;
  onOpen: (row: QueueRow) => void;
  selected?: boolean;
}) {
  return (
    <tr data-attention={needsAttention(row) ? "true" : undefined} data-selected={selected ? "true" : undefined} aria-selected={selected || undefined}>
      <th scope="row">
        <button type="button" className="exec-linkbtn" onClick={() => onOpen(row)}>
          {row.operationId}
        </button>
      </th>
      <td>{row.commandKey || "—"}</td>
      <td>
        {row.target.id ?? "—"}
        {row.target.type ? <span className="exec-queue-dim"> · {row.target.type}</span> : null}
      </td>
      {/* Three separate cells. Merging them is the defect this screen guards. */}
      <td data-col="source">{row.sourceStatus ?? "not stated"}</td>
      <td data-col="verify">{row.verificationResult ?? "not stated"}</td>
      <td data-col="triage">{row.triageState ? TRIAGE_LABEL[row.triageState] : "not stated"}</td>
      <td className="exec-num">{ageFrom(row.createdAt, now)}</td>
      <td>{row.acknowledgedBy ?? row.resolvedBy ?? "—"}</td>
    </tr>
  );
}

export function OperationsQueueScreen({
  queue,
  status = "ok",
  reason,
  filter = "NEEDS_ATTENTION",
  onFilterChange,
  onOpen,
  onLoadNext,
  onLoadPrevious,
  now = new Date(),
  alertRail,
  triage,
  selectedId = null,
  children,
}: {
  queue: OperationsQueue | null;
  status?: PanelStatus;
  reason?: string;
  filter?: QueueFilter;
  onFilterChange?: (filter: QueueFilter) => void;
  onOpen: (row: QueueRow) => void;
  onLoadNext?: () => void;
  onLoadPrevious?: () => void;
  now?: Date;
  alertRail?: ReactNode;
  /** Triage of the selected row — the rail follows the selection (EL-V2-07). */
  triage?: ReactNode;
  selectedId?: string | null;
  children?: ReactNode;
}) {
  const page = queue?.page;
  const rows = page?.rows ?? [];
  const attentionRows = rows.filter(needsAttention);
  const attention = attentionRows.length;
  const partial = rows.filter((r) => r.verificationResult === "PARTIAL").length;
  const unacked = rows.filter((r) => r.triageState === "UNACKNOWLEDGED").length;
  const badges: HeaderBadge[] = [
    ...(attention > 0 ? [{ label: `${attention} NEED ATTENTION`, axis: "readiness", tone: "bad" } as HeaderBadge] : [{ label: "NOTHING STUCK", axis: "readiness", tone: "good" } as HeaderBadge]),
    { label: queue?.sourceIntegrationState ?? "SOURCE NOT STATED", axis: "broker-sync", tone: queue?.sourceIntegrationState === "UNAVAILABLE" ? "warn" : queue?.sourceIntegrationState ? "good" : "mute" },
  ];
  const blockers: RailBlocker[] = attentionRows.map((r) => ({
    label: `${r.operationId} ${r.verificationResult ?? r.sourceStatus ?? ""}`.trim(),
    detail: `${r.commandKey || "—"} · ${r.target.id ?? "—"} · ${ageFrom(r.createdAt, now)}`,
    severity: r.verificationResult === "PARTIAL" || r.sourceStatus === "FAILED" ? ("blocking" as const) : ("watch" as const),
  }));
  const rail = (
    <ExecutionContextRail
      next={{
        title: selectedId ? `Triage · ${selectedId}` : "Select an operation",
        detail: triage ?? (
          <span className="exec-role-body">Pick a row to acknowledge or resolve it. Acknowledging and resolving are Portal records — ack ≠ resolve.</span>
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          read {queue?.readAt ?? "not stated"} · sort {page?.appliedSort.map((s) => `${s.field}:${s.direction}`).join(" · ") || "not stated"} · a PARTIAL older than 15m escalates automatically
        </span>
      }
      alerts={
        <div aria-label="Alerts" className="exec-queue-rail">
          {alertRail ?? (
            <PanelState
              status="unavailable"
              reason="The Trading System publishes no alerts route, so this rail has no source. It is shown empty rather than removed, because an absent rail reads as 'no alerts'."
            />
          )}
          <p className="exec-queue-note exec-role-meta">alert = state change of a typed object (finding · sync · operation · condition), never free text · badge counts CRITICAL only · ack ≠ resolve</p>
        </div>
      }
      provenance={
        <ExecutionProvenanceDrawer
          items={[
            { label: "profile", short: queue?.deliveryProfile ?? "not stated", full: null },
            { label: "source", short: queue?.sourceIntegrationState ?? "not stated", full: null },
          ]}
          onCopy={(full) => void navigator.clipboard?.writeText(full)}
        />
      }
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-queue">
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-queue-head">
          <ExecutionPageHeader
            title="Operations Queue"
            badges={badges}
            purpose="What is running, what is stuck — one row per operation_id from plan → apply → verify; nothing ages silently."
            secondary={
              queue ? (
                <span className="exec-queue-sub exec-role-meta">
                  {page?.filteredCount ?? "—"} in this view · {page?.totalCount ?? "—"} total · source {queue.sourceIntegrationState ?? "not stated"} · profile {queue.deliveryProfile ?? "not stated"}
                </span>
              ) : undefined
            }
          />
        </div>
        <ExecutionDecisionStrip
          metrics={[
            { label: "In this view", value: page?.filteredCount === null || page?.filteredCount === undefined ? null : String(page.filteredCount) },
            { label: "Total", value: page?.totalCount === null || page?.totalCount === undefined ? null : String(page.totalCount) },
            { label: "Need attention", value: String(attention), tone: attention ? "bad" : "good" },
            { label: "PARTIAL", value: String(partial), tone: partial ? "warn" : undefined },
            { label: "Unacknowledged", value: String(unacked), tone: unacked ? "warn" : undefined },
          ]}
        />
        {onFilterChange ? (
          <div className="exec-queue-filters" role="group" aria-label="Filter the queue">
            {QUEUE_FILTERS.map((option) => (
              <button
                key={option}
                type="button"
                className="exec-inbox-filter"
                data-queue-filter={option}
                aria-pressed={option === filter}
                disabled={UNSUPPORTED_FILTERS[option] !== null}
                title={UNSUPPORTED_FILTERS[option] ?? undefined}
                onClick={() => onFilterChange(option)}
              >
                {FILTER_LABEL[option]}
                {option === "NEEDS_ATTENTION" && attention > 0 ? ` (${attention})` : null}
              </button>
            ))}
            {Object.entries(UNSUPPORTED_FILTERS)
              .filter(([, r]) => r !== null)
              .map(([option, r]) => (
                <p className="exec-disabled-reason" key={option}>
                  {FILTER_LABEL[option as QueueFilter]}: {r}
                </p>
              ))}
          </div>
        ) : null}
        <div className="exec-queue-body">
          <div className="exec-queue-main">
            {status !== "ok" && status !== "partial" ? (
              <PanelState status={status} reason={reason} />
            ) : !page || page.rows.length === 0 ? (
              <PanelState status="empty" reason="No operations match this view. The queue is empty, which is different from a queue that could not be read." />
            ) : (
              <>
                <div className="exec-scroll-x">
                  <table className="exec-queue-table">
                    <caption className="exec-role-meta">sort: PARTIAL · FAILED → RUNNING → done · every row links its audit evidence</caption>
                    <thead>
                      <tr>
                        <th scope="col">operation</th>
                        <th scope="col">command</th>
                        <th scope="col">target</th>
                        <th scope="col">source</th>
                        <th scope="col">verify</th>
                        <th scope="col">triage</th>
                        <th scope="col">age</th>
                        <th scope="col">actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.rows.map((row) => (
                        <QueueTableRow key={row.operationId} row={row} now={now} onOpen={onOpen} selected={row.operationId === selectedId} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="exec-queue-nav">
                  <button type="button" className="exec-btn-ghost" disabled={!page.hasPrevious || !onLoadPrevious} onClick={onLoadPrevious}>
                    ▲ newer
                  </button>
                  <button type="button" className="exec-btn-ghost" disabled={!page.hasMore || !onLoadNext} onClick={onLoadNext}>
                    ▼ older
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        {children}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
export function triageAffordance(
  row: QueueRow,
  roles: readonly string[],
): { canAcknowledge: boolean; canResolve: boolean; reason: string | null } {
  if (!roles.includes("ADMIN")) {
    return {
      canAcknowledge: false,
      canResolve: false,
      reason: "Triage actions are available to Admin operators only.",
    };
  }
  if (row.triageState === "RESOLVED") {
    return { canAcknowledge: false, canResolve: false, reason: "This operation is already resolved." };
  }
  if (row.triageState === "ACKNOWLEDGED") {
    return { canAcknowledge: false, canResolve: true, reason: null };
  }
  return {
    canAcknowledge: true,
    canResolve: false,
    reason: "Acknowledge this operation before resolving it — the two are different records.",
  };
}

export function TriagePanel({
  row,
  roles,
  onAcknowledge,
  onResolve,
  effectText,
  conflict,
}: {
  row: QueueRow;
  roles: readonly string[];
  onAcknowledge?: (row: QueueRow) => void;
  onResolve?: (row: QueueRow, reason: string, evidenceHash: string) => void;
  /** The sentence the last mutation returned. Never composed here. */
  effectText?: string | null;
  /** A typed 409. Refresh and review — never a blind retry. */
  conflict?: boolean;
}) {
  const affordance = triageAffordance(row, roles);
  return (
    <section className="exec-queue-triage" aria-label={`Triage ${row.operationId}`}>
      <h3>{row.operationId}</h3>
      {/* HiFi 4e links an operation to the incident it serves ("review in
          incident inc_44 →"). The queue contract publishes no incident_id on a
          row, so the hop cannot be built truthfully today: it renders as an
          unavailable control with the reason (§8.1) and BR-EX-33 asks for the
          field. An enabled link to a guessed incident would be worse. */}
      <button
        type="button"
        className="exec-linkbtn"
        disabled
        title="Not published: the operation contract carries no incident reference (BR-EX-33)"
      >
        Open incident — not published (BR-EX-33)
      </button>
      <p className="exec-queue-note">
        source {row.sourceStatus ?? "not stated"} · verify{" "}
        {row.verificationResult ?? "not stated"} · triage{" "}
        {row.triageState ? TRIAGE_LABEL[row.triageState] : "not stated"}
      </p>

      {conflict ? (
        <p className="exec-queue-conflict" role="alert">
          This operation changed while you were looking at it. Reload and review before deciding —
          repeating the request would apply a decision to a record that has moved.
        </p>
      ) : null}

      <div className="exec-queue-actions">
        <button
          type="button"
          disabled={!affordance.canAcknowledge || !onAcknowledge}
          onClick={() => onAcknowledge?.(row)}
        >
          Acknowledge
        </button>
        <button
          type="button"
          disabled={!affordance.canResolve || !onResolve}
          onClick={() => onResolve?.(row, "", "")}
        >
          Resolve
        </button>
      </div>

      {affordance.reason ? <p className="exec-disabled-reason">{affordance.reason}</p> : null}
      {effectText ? <p className="exec-queue-effect">{effectText}</p> : null}
      <p className="exec-queue-note">
        Acknowledging and resolving are Portal records. Neither asks the Trading System to do
        anything.
      </p>
    </section>
  );
}
