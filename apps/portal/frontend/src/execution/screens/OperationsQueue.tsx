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
import { mirrorIntegritySentence, type MirrorIntegrity } from "../mirrorIntegrity";
import { useEffect, useState, type ReactNode } from "react";

import { ExecutionSurface } from "../ExecutionSurface";
import { SparkLine } from "../components/marketChart";
import { PanelState } from "../components/states";
import { formatAge } from "../components/badges";
import { ExecutionWorkspace } from "../components/workspace";
import { usePresentationChrome } from "../../app/presentation";
import type { PanelStatus } from "../contracts";
import { emptyScopeLine } from "../readTruthCopy";
import type { OperationsQueue, QueueRow, TriageState } from "../operations";
import { fmtAge, throughputSeries } from "../clock";
import type { DetailPart, QueueDemo, QueueSmokeRow } from "../operationsQueue.smoke";
import { pulses, useArrivals, useIds, useNow } from "../listMotion";
import { sourceTone } from "../sourceTone";
import { targetHrefFor } from "../idLinks";

/** The hi-fi's three chips. Applied server-side; they never filter loaded rows. */
export const QUEUE_FILTERS = ["NEEDS_ATTENTION", "MINE", "ALL_24H"] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];

const FILTER_LABEL: Record<QueueFilter, string> = {
  NEEDS_ATTENTION: "Needs attention",
  MINE: "Mine",
  ALL_24H: "All retained",
};

/**
 * All retained has no invented 24h restriction; Mine is assigned_to=me on
 * the server, including counts and continuation scope.
 */
export const UNSUPPORTED_FILTERS: Record<QueueFilter, string | null> = {
  NEEDS_ATTENTION: null,
  MINE: null,
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
  return Number.isNaN(ms) ? "age not stated" : (formatAge(Math.floor(ms / 1000)) ?? "age not stated");
}

function PhaseTrail({ phases }: { phases: QueueSmokeRow["phases"] }) {
  // A glyph, not a value: the phase name is printed beside it, so the dash
  // decorates the word "pending" rather than standing in for a missing one.
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
        <td className="exec-oq-target">{targetHrefFor(item.row.target.type, item.row.target.id, item.row.environment) ? <a href={targetHrefFor(item.row.target.type, item.row.target.id, item.row.environment)!}>{item.row.target.id}</a> : item.row.target.id}</td>
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

function ContractRow({ row, now, onOpen, selected, arrived }: { row: QueueRow; now: Date; onOpen: (row: QueueRow) => void; selected: boolean; arrived?: boolean }) {
  return (
    <tr className="exec-oq-row exec-oq-contract" data-arrived={arrived ? "true" : undefined} data-attention={needsAttention(row) ? "true" : undefined} data-selected={selected ? "true" : undefined} aria-selected={selected || undefined}>
      {/*
        * The contract row has no priority: `execution-operations.v1` publishes
        * none, and the smoke row above it does. A dash in this column looked
        * like a priority that happened to be blank; the word says which of the
        * two it is.
        */}
      <td className="exec-oq-pri"><span className="exec-queue-dim">no priority published</span></td>
      <th scope="row"><button type="button" className="exec-linkbtn exec-oq-oplink" onClick={() => onOpen(row)}>{row.operationId}</button></th>
      <td className="exec-oq-cmd">{row.commandKey || <span className="exec-queue-dim">command not published</span>}</td>
      <td className="exec-oq-target">{targetHrefFor(row.target.type, row.target.id, row.environment) ? <a href={targetHrefFor(row.target.type, row.target.id, row.environment)!}>{row.target.id}</a> : (row.target.id ?? <span className="exec-queue-dim">target not published</span>)}{row.target.type ? <span className="exec-queue-dim"> · {row.target.type}</span> : null}</td>
      <td className="exec-oq-three"><span className="exec-oq-state" data-tone={sourceTone(row.sourceStatus) ?? "mute"} data-pulse={pulses(sourceTone(row.sourceStatus)) ? "true" : undefined} data-col="source">{row.sourceStatus ?? "not stated"}</span> <span className="exec-oq-dim">verify <span data-col="verify">{row.verificationResult ?? "not stated"}</span></span> <span className="exec-oq-dim" data-col="triage">{row.triageState ? TRIAGE_LABEL[row.triageState] : "not stated"}</span></td>
      <td className="exec-oq-age" data-tone="mute">{ageFrom(row.createdAt, now)}</td>
      <td className="exec-oq-next" data-muted="true">{row.acknowledgedBy ?? row.resolvedBy ?? <span className="exec-queue-dim">nobody yet</span>}</td>
    </tr>
  );
}



export function OperationsQueueScreen({
  queue,
  mirrorIntegrity = [],
  status = "ok",
  reason,
  filter = "NEEDS_ATTENTION",
  onFilterChange,
  onOpen,
  onLoadNext,
  onLoadPrevious,
  now: nowProp,
  followNotice = null,
  alertRail,
  triage,
  selectedId = null,
  children,
  demo,
  demoTick,
}: {
  /**
   * PHASE 2B (round 2) · the mirror's own gap and conflict aggregate.
   *
   * Null when the caller did not read it; the panel then says so rather than
   * reporting a mirror with nothing wrong.
   */
  /** One entry per environment; the route serves all three. */
  mirrorIntegrity?: readonly { environment: string; integrity: MirrorIntegrity | null }[];
  queue: OperationsQueue | null;
  status?: PanelStatus;
  reason?: string;
  filter?: QueueFilter;
  onFilterChange?: (filter: QueueFilter) => void;
  onOpen: (row: QueueRow) => void;
  onLoadNext?: () => void;
  onLoadPrevious?: () => void;
  /** Fixed clock for tests and the fixtures page; absent = a live one-second clock. */
  now?: Date;
  /** Set when `?operation=` named a row this page does not hold. */
  followNotice?: string | null;
  alertRail?: ReactNode;
  /** Triage of the selected row — the rail follows the selection (EL-V2-07). */
  triage?: ReactNode;
  selectedId?: string | null;
  children?: ReactNode;
  /** Lab-injected demo bundle + its motion; product routes pass neither. */
  demo?: QueueDemo | null;
  demoTick?: { elapsed: number; sub: number };
}) {
  const smoke = demo ?? null;
  const { elapsed, sub } = demoTick ?? { elapsed: 0, sub: 66 };
  const [railOpen, setRailOpen] = useState(true);
  const chrome = usePresentationChrome();
  const page = queue?.page;
  const rows = page?.rows ?? [];
  // Goal 6: ages count against a clock that actually advances. The route used
  // to hand this screen a `new Date()` evaluated once, so every age froze at
  // first paint — an eleven-minute-old operation still read "11m" an hour
  // later, which is the reassuring direction to be wrong in.
  const clock = useNow();
  const at = nowProp ?? clock;
  const arrivals = useArrivals(useIds(rows, (row) => row.operationId), Boolean(queue) && status === "ok");
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
          {/*
            * PHASE 2B (round 2) · the mirror says what it knows it is missing.
            *
            * `0 gaps` appears only for a READY measurement. For anything else the
            * panel says why there is no count, because a zero here would claim a
            * clean mirror that was never looked at.
            */}
          <section className="exec-oq-panel" aria-label="Mirror integrity">
            <header className="exec-af-kpilabel">Mirror integrity</header>
            {mirrorIntegrity.length === 0
              ? <PanelState status="unavailable" reason="The mirror integrity report was not read for this screen." />
              : mirrorIntegrity.map(({ environment, integrity }) => (
                <div key={environment} className="exec-af-sub">
                  <b>{environment.toUpperCase()}</b>{" · "}
                  {integrity
                    ? (
                      <>
                        <span data-state={integrity.state}>{integrity.state}</span>
                        {integrity.state === "READY" || integrity.state === "PARTIAL"
                          ? <span className="exec-af-dim">{` · ${integrity.totalFindings} finding(s)`}</span>
                          : null}
                        <div className="exec-af-dim">{mirrorIntegritySentence(integrity)}</div>
                        {integrity.findings.map((finding) => (
                          <div key={`${finding.kind}:${finding.relationKey}:${finding.reasonCode}`} className="exec-af-dim">
                            {`${finding.kind} · ${finding.relationKey} · ${finding.reasonCode} · ${finding.findings}`}
                          </div>
                        ))}
                      </>
                    )
                    : <span className="exec-af-absent" title="This environment's report was not read.">not read</span>}
                </div>
              ))}
          </section>
          <section className="exec-oq-triage" aria-label="Triage">
            <div className="exec-oq-triagehead">{selectedId ? `Triage · ${selectedId}` : "Select an operation"}</div>
            {followNotice ? <p className="exec-oq-dim" role="status">{followNotice}</p> : null}
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
                <div className="exec-oq-cardlevel">WARN · {ageFrom(r.createdAt, at)}</div>
                <div className="exec-oq-cardtitle">{r.operationId} {r.verificationResult ?? r.sourceStatus ?? ""}</div>
                <div className="exec-oq-cardmeta">{r.commandKey || "command not published"} · {r.target.id ?? "target not published"}</div>
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
                {page?.filteredCount ?? "an unstated number of"} in this view · {page?.totalCount ?? "an unstated number of"} total · source {queue.sourceIntegrationState ?? "not stated"}
                {/* The contract pins `delivery_profile` to the literal
                    "fixture" for this queue (execution-operations.v1), and
                    the word stays — §7 keeps it visible so nobody
                    mistakes this for source data — but on its own it told an
                    operator the rows were made up. They are not: they are the
                    Portal's own triage records, and the queue is empty because
                    nothing has been filed. That is a different fact, and it is
                    the one that decides whether they go looking elsewhere. */}
                {` · profile ${queue.deliveryProfile ?? "not stated"}`}
                {queue.deliveryProfile === "fixture"
                  ? " — Portal-authored triage records; no source integration publishes into this queue yet"
                  : null}
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
                  <div className="exec-oq-kpi" key={String(label)}><div className="exec-oq-kpilabel" data-tone="mute">{String(label)}</div><div className="exec-oq-kpivalue" data-tone="ink">{v === null || v === undefined ? <span className="exec-queue-dim">not published</span> : String(v)}</div></div>
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
                        {rows.map((row) => <ContractRow key={row.operationId} row={row} now={at} onOpen={onOpen} selected={row.operationId === selectedId} arrived={arrivals.has(row.operationId)} />)}
                      </tbody>
                    </table>
                  </div>
                  {/*
                    * Measured on dev-portal: as a `colSpan` row this sentence
                    * wrapped to three lines across the table's full 920px while
                    * the scroller showing it is 746px, so the right 174px of
                    * every line sat in the horizontally scrolled-off region —
                    * the reader saw "…are part of the reque". An empty-state
                    * message has no columns to align with anyway, so it sits
                    * outside the scroller and wraps to what is actually visible.
                    */}
                  {rows.length === 0 ? (
                    <p className="exec-oq-emptyrow">
                      {smokeRows.length > 0 ? "published rows: none — " : ""}
                      {emptyScopeLine(page?.readTruth, "this view", null, "operation")}
                    </p>
                  ) : null}
                  <footer className="exec-oq-foot">
                    <span>one row = one operation_id from plan → apply → verify · nothing ages silently — PARTIAL &gt;15m auto-escalates</span>
                    <span className="exec-oq-spacer" />
                    <span>every row links its audit evidence</span>
                    <span className="exec-oq-nav">
                      <button type="button" className="exec-oq-filter" disabled={!page?.hasPrevious || !onLoadPrevious}
                        title={page?.hasPrevious && onLoadPrevious ? undefined : "Already at the newest operation in the published window."}
                        onClick={onLoadPrevious}>▲ newer</button>
                      <button type="button" className="exec-oq-filter" disabled={!page?.hasMore || !onLoadNext}
                        title={page?.hasMore && onLoadNext ? undefined : "No older operation is published beyond this page."}
                        onClick={onLoadNext}>▼ older</button>
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
