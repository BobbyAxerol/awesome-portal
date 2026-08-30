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
import { useEffect, useState, type ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { SparkLine } from "../components/marketChart";
import { PanelState } from "../components/states";
import { formatAge } from "../components/badges";
import { ExecutionWorkspace } from "../components/workspace";
import { usePresentationChrome } from "../../app/presentation";
import type { PanelStatus } from "../contracts";
import type { OperationsQueue, QueueRow, TriageState } from "../operations";
import { fmtAge, queueSmoke, throughputSeries, useQueueTick, type DetailPart, type QueueSmokeRow } from "../operationsQueue.smoke";

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

function PhaseTrail({ phases }: { phases: QueueSmokeRow["phases"] }) {
  const glyph = { done: "✓", active: "◐", pending: "—", failed: "◐" } as const;
  return (
    <span className="exec-oq-phases">
      {" · "}
      {phases.map((p, i) => (
        <span key={p.phase}>
          {i > 0 ? " → " : ""}
          <span data-mark={p.mark}>{p.phase} {glyph[p.mark]}</span>
        </span>
      ))}
    </span>
  );
}

function DetailLine({ parts, escalate, planExpiry }: { parts: DetailPart[]; escalate: number; planExpiry: string }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} data-tone={p.tone}>
          {i > 0 ? " · " : ""}
          {p.href ? <a href={p.href}>{p.text}</a> : p.text}
          {p.live === "escalate" ? <> {fmtAge(escalate)}</> : null}
          {p.live === "planExpiry" ? <> <span data-tone="warn">{planExpiry}</span></> : null}
        </span>
      ))}
    </>
  );
}

/** Hi-fi 4e row: pri · operation · command·phase · target · state · age · next step, then a detail sub-row. */
function SmokeRow({ item, elapsed, sub, onOpen, selected }: { item: QueueSmokeRow; elapsed: number; sub: number; onOpen: (row: QueueRow) => void; selected: boolean }) {
  const age = item.ageSeconds + elapsed;
  const escalate = Math.max(0, (item.escalateIn ?? 0) - elapsed);
  const planExpiry = `${Math.max(0, 60 - (elapsed % 60))}s`;
  return (
    <>
      <tr className="exec-oq-row" data-edge={item.edge} data-attention={item.edge === "warn" ? "true" : undefined} data-selected={selected ? "true" : undefined} aria-selected={selected || undefined} data-done={item.done ? "true" : undefined}>
        <td className="exec-oq-pri"><span className="exec-oq-prichip" data-pri={item.priority}>{item.priority}</span></td>
        <th scope="row"><button type="button" className="exec-linkbtn exec-oq-oplink" onClick={() => onOpen(item.row)}>{item.row.operationId}</button></th>
        <td className="exec-oq-cmd">{item.row.commandKey}<PhaseTrail phases={item.phases} /></td>
        <td className="exec-oq-target">{targetHref(item.row.target.id) ? <a href={targetHref(item.row.target.id)!}>{item.row.target.id}</a> : item.row.target.id}</td>
        <td><span className="exec-oq-state" data-tone={item.stateChip.tone} data-pulse={item.stateChip.pulse ? "true" : undefined}>{item.stateChip.label}{item.progress ? "" : ""}</span></td>
        <td className="exec-oq-age" data-tone={item.ageTone}>{fmtAge(age)}</td>
        <td className="exec-oq-next" data-muted={item.next.muted ? "true" : undefined}>{item.next.href ? <a href={item.next.href}>{item.next.label}</a> : item.next.label}</td>
      </tr>
      {item.detail.length > 0 || item.progress ? (
        <tr className="exec-oq-detail" data-edge={item.edge}>
          <td colSpan={7}>
            {item.progress ? (
              <span className="exec-oq-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sub} aria-label={`sub-intents ${item.progress.label}`}><span className="exec-oq-barfill" style={{ width: `${sub}%` }} /></span>
            ) : null}
            <DetailLine parts={item.detail} escalate={escalate} planExpiry={planExpiry} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ContractRow({ row, now, onOpen, selected }: { row: QueueRow; now: Date; onOpen: (row: QueueRow) => void; selected: boolean }) {
  return (
    <tr className="exec-oq-row exec-oq-contract" data-attention={needsAttention(row) ? "true" : undefined} data-selected={selected ? "true" : undefined} aria-selected={selected || undefined}>
      <td className="exec-oq-pri"><span className="exec-oq-prichip" data-pri="—">—</span></td>
      <th scope="row"><button type="button" className="exec-linkbtn exec-oq-oplink" onClick={() => onOpen(row)}>{row.operationId}</button></th>
      <td className="exec-oq-cmd">{row.commandKey || "—"}</td>
      <td className="exec-oq-target">{targetHref(row.target.id) ? <a href={targetHref(row.target.id)!}>{row.target.id}</a> : (row.target.id ?? "—")}{row.target.type ? <span className="exec-queue-dim"> · {row.target.type}</span> : null}</td>
      <td className="exec-oq-three"><span className="exec-oq-state" data-tone="mute" data-col="source">{row.sourceStatus ?? "not stated"}</span> <span className="exec-oq-dim">verify <span data-col="verify">{row.verificationResult ?? "not stated"}</span></span> <span className="exec-oq-dim" data-col="triage">{row.triageState ? TRIAGE_LABEL[row.triageState] : "not stated"}</span></td>
      <td className="exec-oq-age" data-tone="mute">{ageFrom(row.createdAt, now)}</td>
      <td className="exec-oq-next" data-muted="true">{row.acknowledgedBy ?? row.resolvedBy ?? "—"}</td>
    </tr>
  );
}

const targetHref = (id: string | null | undefined): string | null =>
  id && id.startsWith("acct-") ? `/deployments/accounts/${id}` : null;

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
  const smoke = queueSmoke();
  const { elapsed, sub } = useQueueTick();
  const [railOpen, setRailOpen] = useState(true);
  const chrome = usePresentationChrome();
  const page = queue?.page;
  const rows = page?.rows ?? [];
  const attentionRows = rows.filter(needsAttention);
  const attention = smoke ? smoke.attentionCount : attentionRows.length;
  const critical = smoke?.criticalCount ?? 0;
  const smokeRows = smoke ? (filter === "NEEDS_ATTENTION" ? smoke.rows.filter((r) => !r.done) : smoke.rows) : [];
  // Chrome: the topbar chip and the sidebar badge, owned by this screen while mounted.
  useEffect(() => {
    if (!chrome) return;
    chrome.setChrome({ alerts: critical > 0 ? { critical, href: "/execution/operations", onToggle: () => setRailOpen((v) => !v) } : null, navBadge: attention > 0 ? { route: "/execution/operations", count: attention, tone: "warn" } : null });
    return () => chrome.setChrome({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [critical, attention]);
  const escalate1251 = Math.max(0, 900 - (360 + elapsed));
  const rail = (
    <aside className={`exec-context-rail exec-oq-rail${railOpen ? "" : " exec-oq-rail-closed"}`} aria-label="Alerts">
      <header className="exec-oq-railhead">
        <span className="exec-oq-railtitle">ALERTS</span>
        <span className="exec-oq-railmeta">badge counts CRITICAL only</span>
        <span className="exec-oq-spacer" />
        <button type="button" className="exec-oq-railclose" aria-label={railOpen ? "Close alerts" : "Open alerts"} onClick={() => setRailOpen((v) => !v)}>{railOpen ? "×" : "⚑"}</button>
      </header>
      {railOpen ? (
        <>
          <section className="exec-oq-triage" aria-label="Triage">
            <div className="exec-oq-triagehead">{selectedId ? `Triage · ${selectedId}` : "Select an operation"}</div>
            {triage ?? <p className="exec-oq-dim">Pick a row to acknowledge or resolve it.</p>}
          </section>
          <div className="exec-oq-cards">
            {smoke
              ? smoke.alerts.map((a) => (
                  <a key={a.title} className="exec-oq-card" data-level={a.level} href={a.href}>
                    <div className="exec-oq-cardlevel" data-pulse={a.pulse ? "true" : undefined}>{a.level} · {typeof a.ageSeconds === "number" ? fmtAge(a.ageSeconds + elapsed) : a.ageSeconds}</div>
                    <div className="exec-oq-cardtitle">{a.title}</div>
                    <div className="exec-oq-cardmeta">{a.meta}{a.live === "escalate" ? ` ${fmtAge(escalate1251)}` : ""}</div>
                  </a>
                ))
              : alertRail ?? (
                  <PanelState status="unavailable" reason="The Trading System publishes no alerts route, so this rail has no source. It is shown empty rather than removed, because an absent rail reads as 'no alerts'." />
                )}
            {attentionRows.map((r) => (
              <a key={r.operationId} className="exec-oq-card" data-level="WARN" href="#" onClick={(e) => { e.preventDefault(); onOpen(r); }}>
                <div className="exec-oq-cardlevel">WARN · {ageFrom(r.createdAt, now)}</div>
                <div className="exec-oq-cardtitle">{r.operationId} {r.verificationResult ?? r.sourceStatus ?? ""}</div>
                <div className="exec-oq-cardmeta">{r.commandKey || "—"} · {r.target.id ?? "—"}</div>
              </a>
            ))}
          </div>
          <footer className="exec-oq-railfoot">
            alert = state change of a typed object (finding · sync · operation · condition), never free text · click lands on the owning screen · ack ≠ resolve
            {smoke ? <span className="exec-oq-railsmoke"> · the Trading System publishes no alerts route — cards above are smoke (BR-EX-43)</span> : null}
          </footer>
        </>
      ) : null}
    </aside>
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-queue exec-oq" data-hifi-exact="operations-queue-4e">
      <ExecutionWorkspace layout="dense">
        <div className="exec-oq-layout" data-rail={railOpen ? "open" : "closed"}>
          <div className="exec-oq-page">
            <header className="exec-oq-masthead">
              <h1 className="exec-oq-h1">Operations Queue</h1>
              {attention > 0 ? <span className="exec-oq-chip" data-tone="warn">{attention} NEED ATTENTION</span> : <span className="exec-oq-chip" data-tone="good">NOTHING STUCK</span>}
              <span className="exec-oq-spacer" />
              <span className="exec-oq-live"><span className="exec-oq-livedot" aria-hidden="true" /><b>{queue?.sourceIntegrationState === "UNAVAILABLE" || !smoke ? (queue?.sourceIntegrationState ?? "SOURCE NOT STATED") : "EXECUTION"}</b> · command journal · {smoke ? "live" : (queue?.deliveryProfile ?? "profile not stated")}</span>
            </header>
            {queue ? (
              <p className="exec-oq-sub">
                {page?.filteredCount ?? "—"} in this view · {page?.totalCount ?? "—"} total · source {queue.sourceIntegrationState ?? "not stated"} · profile {queue.deliveryProfile ?? "not stated"}
              </p>
            ) : null}
            {smoke ? (
              <div className="exec-oq-kpis" aria-label="Queue KPIs">
                {smoke.kpis.map((k) => (
                  <div className="exec-oq-kpi" key={k.key} data-tint={k.tint ? "true" : undefined}>
                    <div className="exec-oq-kpilabel" data-tone={k.tone}>{k.label}</div>
                    <div className="exec-oq-kpivalue" data-tone={k.tone} data-pulse={k.pulse ? "true" : undefined}>{k.value}</div>
                    <div className="exec-oq-kpisub">{k.sub}</div>
                  </div>
                ))}
                <div className="exec-oq-kpi exec-oq-kpiwide">
                  <div className="exec-oq-kpilabel" data-tone="mute">Throughput — verified/h · 24h</div>
                  <SparkLine points={throughputSeries(smoke.throughput)} tone="good" height={26} width="100%" />
                </div>
              </div>
            ) : (
              <div className="exec-oq-kpis" aria-label="Queue KPIs">
                {[
                  ["In this view", page?.filteredCount], ["Total", page?.totalCount], ["Need attention", attention], ["PARTIAL", rows.filter((r) => r.verificationResult === "PARTIAL").length],
                ].map(([label, v]) => (
                  <div className="exec-oq-kpi" key={String(label)}><div className="exec-oq-kpilabel" data-tone="mute">{String(label)}</div><div className="exec-oq-kpivalue" data-tone="ink">{v === null || v === undefined ? "—" : String(v)}</div></div>
                ))}
              </div>
            )}
            {onFilterChange ? (
              <div className="exec-oq-filters" role="group" aria-label="Filter the queue">
                {QUEUE_FILTERS.map((option) => (
                  <button key={option} type="button" className="exec-oq-filter" data-queue-filter={option} aria-pressed={option === filter} disabled={UNSUPPORTED_FILTERS[option] !== null} title={UNSUPPORTED_FILTERS[option] ?? undefined} onClick={() => onFilterChange(option)}>
                    {FILTER_LABEL[option]}
                    {option === "NEEDS_ATTENTION" && attention > 0 ? ` (${attention})` : null}
                  </button>
                ))}
                <span className="exec-oq-filternote">priority = severity × age × blast radius — computed, never assigned by hand</span>
                {Object.entries(UNSUPPORTED_FILTERS).filter(([, r]) => r !== null).map(([option, r]) => (
                  <span className="exec-oq-filternote exec-oq-filterreason" key={option}>{FILTER_LABEL[option as QueueFilter]}: {r}</span>
                ))}
              </div>
            ) : null}
            <div className="exec-oq-panel">
              {status !== "ok" && status !== "partial" ? (
                <PanelState status={status} reason={reason} />
              ) : (
                <>
                  <div className="exec-scroll-x">
                    <table className="exec-queue-table exec-oq-table">
                      <thead>
                        <tr>
                          <th scope="col">pri</th>
                          <th scope="col">operation</th>
                          <th scope="col">command · phase</th>
                          <th scope="col">target</th>
                          <th scope="col">state</th>
                          <th scope="col" className="exec-oq-right">age</th>
                          <th scope="col">next step</th>
                        </tr>
                      </thead>
                      <tbody>
                        {smokeRows.map((item) => <SmokeRow key={item.row.operationId} item={item} elapsed={elapsed} sub={sub} onOpen={onOpen} selected={item.row.operationId === selectedId} />)}
                        {rows.map((row) => <ContractRow key={row.operationId} row={row} now={now} onOpen={onOpen} selected={row.operationId === selectedId} />)}
                        {rows.length === 0 ? (
                          <tr className="exec-oq-emptyrow"><td colSpan={7}>{smokeRows.length > 0 ? "published rows: none — " : ""}No operations match this view. The queue is empty, which is different from a queue that could not be read.</td></tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <footer className="exec-oq-foot">
                    <span>one row = one operation_id from plan → apply → verify · nothing ages silently — PARTIAL &gt;15m auto-escalates</span>
                    <span className="exec-oq-spacer" />
                    <span>every row links its audit evidence</span>
                    <span className="exec-oq-nav">
                      <button type="button" className="exec-oq-filter" disabled={!page?.hasPrevious || !onLoadPrevious} onClick={onLoadPrevious}>▲ newer</button>
                      <button type="button" className="exec-oq-filter" disabled={!page?.hasMore || !onLoadNext} onClick={onLoadNext}>▼ older</button>
                    </span>
                  </footer>
                </>
              )}
            </div>
            {smoke ? <p className="exec-oq-smoke">! {smoke.warning}</p> : null}
            {children}
          </div>
          {rail}
        </div>
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
