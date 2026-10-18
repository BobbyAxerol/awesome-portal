/**
 * Operations queue V2 (S1c), flag key `ops`.
 *
 * Reads `portal.execution.operational-queue.v2` through the ExecutionApi port.
 * The grain is one `operation_id`. Everything on the screen is a published
 * field or a count the server stated; what is not published (assignee, audit,
 * intent and display axes, amounts, source health, exceptions) is a sentence
 * with its request id, and the controls that would act on it are disabled with
 * a reason.
 *
 * Filters are forwarded to the read, never applied to loaded rows, so the
 * counts stay the server's. The 24H window is the one local control (review2/07):
 * it hides loaded rows older than the window and says how many it hid.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { PanelState } from "../../../components/states";
import type { ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { useDockMode, useDockSelection } from "../../Drawer";
import { formatAsOf } from "../../boundary";
import {
  SEVERITIES_V2, TARGET_TYPES_V2, TRIAGE_STATES_V2, VERIFICATION_RESULTS_V2,
  type OperationalQueueQueryV2, type OperationalQueueV2, type OperationV2, type SeverityV2,
  type TargetTypeV2, type TriageStateV2, type VerificationResultV2,
} from "../../readers/operationalQueue";
import { ENV_LABEL, EXEC_ENVS, useExecUrlState, type ExecEnv } from "../../urlState";
import { IncidentRootDrawer } from "./IncidentRootDrawer";
import { FE, NotPublished, notPublishedReason } from "./notPublished";
import { OperationDock } from "./OperationDock";
import { humanize, TARGET_LABEL } from "./outcome";
import { QueueTable } from "./QueueTable";

import "../../css/operations.css";

export const PAGE_LIMIT = 50;
/** DOM budget (S1 card): more than this and the reader narrows the filters instead. */
export const ROW_CAP = 200;

export const MINE_REASON = notPublishedReason(
  FE.assignee,
  "The queue has no assignee or creator, so it cannot be filtered to you.",
);

export type OpsWindow = "24H" | "7D" | "30D" | "ALL";
const WINDOWS: readonly OpsWindow[] = ["24H", "7D", "30D", "ALL"];
const WINDOW_MS: Readonly<Record<OpsWindow, number | null>> = {
  "24H": 24 * 3_600_000,
  "7D": 7 * 24 * 3_600_000,
  "30D": 30 * 24 * 3_600_000,
  ALL: null,
};

type Lens = "attention" | "all";
type View = "commands" | "exceptions" | "audit";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "exceptions", label: "Exceptions" },
  { id: "audit", label: "Audit" },
];

interface Filters {
  lens: Lens;
  triage: TriageStateV2 | "";
  severity: SeverityV2 | "";
  verification: VerificationResultV2 | "";
  targetType: TargetTypeV2 | "";
  env: ExecEnv | "";
  commandKey: string;
}
const NO_FILTERS: Filters = { lens: "attention", triage: "", severity: "", verification: "", targetType: "", env: "", commandKey: "" };

/** The query a set of filters stands for. The Needs attention lens is `triage_state=UNACKNOWLEDGED`. */
export function queryFor(filters: Filters, workspaceId?: string): OperationalQueueQueryV2 {
  const triage = filters.triage || (filters.lens === "attention" ? "UNACKNOWLEDGED" : undefined);
  return {
    workspaceId,
    limit: PAGE_LIMIT,
    triageState: triage || undefined,
    severity: filters.severity || undefined,
    verificationResult: filters.verification || undefined,
    targetType: filters.targetType || undefined,
    environment: filters.env || undefined,
    commandKey: filters.commandKey || undefined,
  };
}

type Load =
  | { phase: "loading" }
  | { phase: "failed"; status: Exclude<PanelStatus, "ok">; reason: string }
  | { phase: "unsupported"; schemaVersion: string | null }
  | {
      phase: "ready";
      queue: OperationalQueueV2;
      rows: readonly OperationV2[];
      loadingMore: boolean;
      moreError: string | null;
      /** A refresh failed; the rows are the last good ones. */
      stale: string | null;
    };

const CURSOR_GONE = /OPERATIONAL_READ_(CHANGED|CURSOR_INVALID)/;

function number(n: number): string {
  return n.toLocaleString("en-US");
}

function appendRows(have: readonly OperationV2[], more: readonly OperationV2[]): readonly OperationV2[] {
  const seen = new Set(have.map((row) => row.operationId));
  return [...have, ...more.filter((row) => !seen.has(row.operationId))];
}

interface SelectProps<T extends string> {
  label: string;
  value: T | "";
  options: readonly { value: T; label: string }[];
  onChange(value: T | ""): void;
}

function Select<T extends string>({ label, value, options, onChange }: SelectProps<T>) {
  const id = useId();
  return (
    <div className="exec-ops-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T | "")}>
        <option value="">Any</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

export interface OperationsV2Props {
  api: ExecutionApi;
  workspaceId?: string;
  /** The clock for the 24H window; injected so a test is not a race with midnight. */
  now?: Date;
  /** `?operation=`: the operation a link named. Selected once; shown if it is on a loaded page. */
  requestedOperation?: string | null;
  /** Route `:incidentId`: opens the incident root drawer over the queue. */
  incidentId?: string | null;
  /** Where closing the incident drawer returns to. */
  queuePath?: string;
}

export default function OperationsV2({
  api, workspaceId, now, requestedOperation = null, incidentId = null, queuePath = "/execution/operations",
}: OperationsV2Props) {
  const mode = useDockMode();
  const { selection, select, close } = useDockSelection();
  const url = useExecUrlState();
  const navigate = useNavigate();
  const location = useLocation();
  const mineReasonId = useId();

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draftKey, setDraftKey] = useState("");
  const [range, setRange] = useState<OpsWindow>("24H");
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [reloadTick, setReloadTick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const lastKey = useRef("");

  const view: View = VIEWS.some((v) => v.id === url.value.view) ? (url.value.view as View) : "commands";
  const query = useMemo(() => queryFor(filters, workspaceId), [filters, workspaceId]);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    const gen = ++generation.current;
    const refresh = lastKey.current === queryKey;
    lastKey.current = queryKey;
    if (!refresh) setNotice(null);
    setLoad((prev) => (refresh && prev.phase === "ready" ? prev : { phase: "loading" }));
    api.listOperationalQueueV2(query).then(
      (result) => {
        if (gen !== generation.current) return;
        if (!result.ok) {
          setLoad((prev) => (prev.phase === "ready"
            ? { ...prev, stale: result.reason }
            : { phase: "failed", status: result.status, reason: result.reason }));
          return;
        }
        if (result.value.kind !== "queue") {
          setLoad({ phase: "unsupported", schemaVersion: result.value.schemaVersion });
          return;
        }
        const queue = result.value.queue;
        setLoad({ phase: "ready", queue, rows: queue.page.rows, loadingMore: false, moreError: null, stale: null });
      },
      () => {
        if (gen !== generation.current) return;
        setLoad({ phase: "failed", status: "unavailable", reason: "The operations read never reached the Portal." });
      },
    );
    return () => { generation.current += 1; };
    // `query` is derived from queryKey; the key is the dependency so an equal query never refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, queryKey, reloadTick]);

  // A link that names an operation opens it once; it is not re-forced after the reader closes it.
  const requested = useRef(requestedOperation);
  useEffect(() => {
    if (requested.current && !selection) select(requested.current);
    requested.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (load.phase !== "ready" || load.loadingMore || !load.queue.page.nextCursor) return;
    const gen = generation.current;
    const after = load.queue.page.nextCursor;
    setLoad((prev) => (prev.phase === "ready" ? { ...prev, loadingMore: true, moreError: null } : prev));
    const result = await api.listOperationalQueueV2({ ...query, after });
    if (gen !== generation.current) return;
    if (!result.ok) {
      if (CURSOR_GONE.test(result.reason)) {
        // The server voids a cursor when the read changed under it: start over, and say so.
        setNotice("The queue changed while you were reading it, so it was reloaded from the first page.");
        setReloadTick((tick) => tick + 1);
        return;
      }
      setLoad((prev) => (prev.phase === "ready" ? { ...prev, loadingMore: false, moreError: result.reason } : prev));
      return;
    }
    if (result.value.kind !== "queue") {
      setLoad((prev) => (prev.phase === "ready"
        ? { ...prev, loadingMore: false, moreError: "The next page arrived in a shape this build does not read." }
        : prev));
      return;
    }
    const queue = result.value.queue;
    setLoad((prev) => (prev.phase === "ready"
      ? { phase: "ready", queue, rows: appendRows(prev.rows, queue.page.rows), loadingMore: false, moreError: null, stale: null }
      : prev));
  }, [api, load, query]);

  const nowMs = (now ?? new Date()).getTime();
  const windowMs = WINDOW_MS[range];
  const rows = load.phase === "ready" ? load.rows : [];
  const visible = windowMs === null ? rows : rows.filter((row) => row.createdAt.ms >= nowMs - windowMs);
  const hidden = rows.length - visible.length;

  const patch = (next: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...next }));
  const setView = (next: View) => url.set({ view: next === "commands" ? null : next, sel: null });

  const tabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = VIEWS.findIndex((v) => v.id === view);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = VIEWS[(at + step + VIEWS.length) % VIEWS.length];
    setView(next.id);
    requestAnimationFrame(() => document.getElementById(`exec-ops-tab-${next.id}`)?.focus());
  };

  const incidentOpen = incidentId !== null && incidentId !== "";
  const operationOpen = !incidentOpen && view === "commands" && selection !== null;
  const dockOpen = (incidentOpen || operationOpen) && mode === "dock";

  const closeIncident = () => navigate({ pathname: queuePath, search: location.search });
  const selectedRow = load.phase === "ready" && selection ? load.rows.find((row) => row.operationId === selection) ?? null : null;

  const ready = load.phase === "ready" ? load : null;
  const page = ready?.queue.page;

  const emptyNode = ready
    ? hidden > 0
      ? `All ${number(hidden)} loaded rows are older than ${range}. Widen the window to see them.`
      : ready.queue.readTruth.state === "EMPTY"
        ? `Nothing matched these filters${ready.queue.readTruth.reasonCode ? ` (${ready.queue.readTruth.reasonCode})` : ""}.`
        : "No rows on this page."
    : null;

  return (
    <div className="exec-ops">
      <div className="exec-ops-head">
        <div>
          <h1 className="exec-ops-title">Operations</h1>
          <p className="exec-ops-subtitle">Commands, exceptions and audit</p>
        </div>
        {ready ? (
          <div className="exec-ops-chips">
            <span className="exec-ops-chip">Observed {formatAsOf(ready.queue.observedAtMs)}</span>
            <span className="exec-ops-chip">Source journal unavailable</span>
          </div>
        ) : null}
      </div>

      {ready ? (
        <dl className="exec-ops-kpis" aria-label="Queue counts">
          <div className="exec-ops-kpi">
            <dt>In scope</dt>
            <dd className="exec-ops-kpi-value">{number(ready.queue.page.totalCount)}</dd>
            <dd className="exec-ops-kpi-note">Operations you may see, before filters</dd>
          </div>
          <div className="exec-ops-kpi">
            <dt>Matching</dt>
            <dd className="exec-ops-kpi-value">{number(ready.queue.page.filteredCount)}</dd>
            <dd className="exec-ops-kpi-note">After the filters below</dd>
          </div>
          <div className="exec-ops-kpi">
            <dt>Loaded</dt>
            <dd className="exec-ops-kpi-value">{number(ready.rows.length)}</dd>
            <dd className="exec-ops-kpi-note">of {number(ready.queue.page.filteredCount)} matching</dd>
          </div>
          <div className="exec-ops-kpi">
            <dt>Read</dt>
            <dd className="exec-ops-kpi-value">{humanize(ready.queue.readTruth.state)}</dd>
            <dd className="exec-ops-kpi-note">{ready.queue.readTruth.reasonCode ?? "For this request"}</dd>
          </div>
        </dl>
      ) : null}

      <details className="exec-ops-panel">
        <summary>Source health</summary>
        <p className="exec-ops-np">
          <NotPublished id={FE.audit}>
            Source integration is {ready ? humanize(ready.queue.sourceIntegrationState).toLowerCase() : "unavailable"}; no source journal is qualified, so nothing is assumed healthy.
          </NotPublished>
        </p>
      </details>

      <div className="exec-ops-lay" data-dock={dockOpen ? "true" : undefined}>
        <div className="exec-ops-main">
          <div className="exec-ops-tabs" role="tablist" aria-label="Operations views" onKeyDown={tabKeys}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                id={`exec-ops-tab-${v.id}`}
                type="button"
                role="tab"
                className="exec-ops-tab"
                aria-selected={view === v.id}
                aria-controls="exec-ops-panel"
                tabIndex={view === v.id ? 0 : -1}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div id="exec-ops-panel" role="tabpanel" aria-labelledby={`exec-ops-tab-${view}`}>
            {view === "exceptions" ? (
              <div className="exec-ops-panel">
                <h2 className="exec-ops-panel-title">Exceptions</h2>
                <p className="exec-ops-np">
                  <NotPublished id={FE.events}>
                    No exceptions feed is published, so none is drawn. Incidents open from their own link.
                  </NotPublished>
                </p>
              </div>
            ) : null}

            {view === "audit" ? (
              <div className="exec-ops-panel">
                <h2 className="exec-ops-panel-title">Audit</h2>
                <p className="exec-ops-np">
                  <NotPublished id={FE.audit}>
                    The queue drops actors on purpose and the audit source is unavailable, so who did what is not shown.
                  </NotPublished>
                </p>
              </div>
            ) : null}

            {view === "commands" ? (
              <>
                <div className="exec-ops-tool">
                  <div className="exec-ops-field">
                    <span id="exec-ops-lens-label">Lens</span>
                    <div className="exec-ops-seg" role="group" aria-labelledby="exec-ops-lens-label">
                      <button
                        type="button"
                        aria-pressed={filters.lens === "attention" && filters.triage === ""}
                        onClick={() => patch({ lens: "attention", triage: "" })}
                      >
                        Needs attention
                      </button>
                      <button
                        type="button"
                        disabled
                        aria-describedby={mineReasonId}
                      >
                        Mine
                      </button>
                      <button
                        type="button"
                        aria-pressed={filters.lens === "all" && filters.triage === ""}
                        onClick={() => patch({ lens: "all", triage: "" })}
                      >
                        All
                      </button>
                    </div>
                  </div>
                  <div className="exec-ops-field">
                    <span id="exec-ops-window-label">Window</span>
                    <div className="exec-ops-seg" role="group" aria-labelledby="exec-ops-window-label">
                      {WINDOWS.map((w) => (
                        <button key={w} type="button" aria-pressed={range === w} onClick={() => setRange(w)}>
                          {w === "ALL" ? "All time" : w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Select<TriageStateV2>
                    label="Triage"
                    value={filters.triage}
                    options={TRIAGE_STATES_V2.map((t) => ({ value: t, label: humanize(t) }))}
                    onChange={(triage) => patch({ triage, lens: "all" })}
                  />
                  <Select<SeverityV2>
                    label="Severity"
                    value={filters.severity}
                    options={SEVERITIES_V2.map((s) => ({ value: s, label: humanize(s) }))}
                    onChange={(severity) => patch({ severity })}
                  />
                  <Select<VerificationResultV2>
                    label="Verification"
                    value={filters.verification}
                    options={VERIFICATION_RESULTS_V2.map((v) => ({ value: v, label: humanize(v) }))}
                    onChange={(verification) => patch({ verification })}
                  />
                  <Select<TargetTypeV2>
                    label="Target type"
                    value={filters.targetType}
                    options={TARGET_TYPES_V2.map((t) => ({ value: t, label: TARGET_LABEL[t] }))}
                    onChange={(targetType) => patch({ targetType })}
                  />
                  <Select<ExecEnv>
                    label="Environment"
                    value={filters.env}
                    options={EXEC_ENVS.map((e) => ({ value: e, label: ENV_LABEL[e] }))}
                    onChange={(env) => patch({ env })}
                  />
                  <form
                    className="exec-ops-field"
                    onSubmit={(event) => {
                      event.preventDefault();
                      patch({ commandKey: draftKey.trim() });
                    }}
                  >
                    <label htmlFor="exec-ops-command-key">Command key</label>
                    <span>
                      <input
                        id="exec-ops-command-key"
                        value={draftKey}
                        placeholder="account/sync"
                        onChange={(event) => setDraftKey(event.target.value)}
                      />
                      {" "}
                      <button type="submit" className="exec-ops-apply">Apply</button>
                    </span>
                  </form>
                </div>
                <p id={mineReasonId} className="exec-ops-reason">Mine: {MINE_REASON}</p>

                <ul className="exec-ops-np-list" aria-label="Not published on this table">
                  <li><NotPublished id={FE.intent}>Intent axis.</NotPublished></li>
                  <li><NotPublished id={FE.receipts}>Display axis and amounts.</NotPublished></li>
                </ul>

                {notice ? <p className="exec-ops-banner" role="status">{notice}</p> : null}
                {ready?.stale ? (
                  <p className="exec-ops-banner" role="status">
                    Stale: the refresh failed ({ready.stale}). These are the last rows that loaded.
                  </p>
                ) : null}

                <div className="exec-ops-table">
                  {load.phase === "loading" ? <PanelState status="loading" /> : null}
                  {load.phase === "failed" ? (
                    <PanelState
                      status={load.status}
                      reason={load.reason}
                      actions={<button type="button" className="exec-ops-apply" onClick={() => setReloadTick((t) => t + 1)}>Try again</button>}
                    />
                  ) : null}
                  {load.phase === "unsupported" ? (
                    <PanelState
                      status="unavailable"
                      reason={`The server answered a queue shape this build does not read (${load.schemaVersion ?? "no schema version"}). This screen reads portal.execution.operational-queue.v2 only, so nothing is shown rather than a wrong reading.`}
                    />
                  ) : null}
                  {ready && page ? (
                    <>
                      <QueueTable
                        rows={visible}
                        selectedKey={operationOpen ? selection : null}
                        onOpen={(row) => select(row.operationId)}
                        empty={emptyNode}
                      />
                      <div className="exec-ops-foot">
                        <span>
                          {number(ready.rows.length)} of {number(page.filteredCount)} matching · {number(page.totalCount)} in scope
                        </span>
                        {hidden > 0 && visible.length > 0 ? (
                          <span>{number(hidden)} loaded older than {range} hidden.</span>
                        ) : null}
                        {page.hasMore ? (
                          ready.rows.length >= ROW_CAP ? (
                            <>
                              <button type="button" className="exec-ops-more" disabled aria-describedby="exec-ops-cap">Load more</button>
                              <span id="exec-ops-cap" className="exec-ops-reason">
                                {number(ROW_CAP)} rows are loaded. Narrow the filters to see the rest.
                              </span>
                            </>
                          ) : (
                            <button type="button" className="exec-ops-more" disabled={ready.loadingMore} aria-busy={ready.loadingMore} onClick={() => void loadMore()}>
                              {ready.loadingMore ? "Loading" : "Load more"}
                            </button>
                          )
                        ) : (
                          <span>End of the list.</span>
                        )}
                        <button type="button" className="exec-ops-apply" onClick={() => setReloadTick((tick) => tick + 1)}>Refresh</button>
                        {ready.moreError ? <span className="exec-ops-reason" role="alert">The next page failed: {ready.moreError}</span> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </div>

        {incidentOpen ? (
          <IncidentRootDrawer api={api} incidentId={incidentId} workspaceId={workspaceId} mode={mode} onClose={closeIncident} />
        ) : null}
        {operationOpen && selection ? (
          <OperationDock
            operationId={selection}
            row={selectedRow}
            loading={load.phase === "loading"}
            mode={mode}
            onClose={close}
          />
        ) : null}
      </div>
    </div>
  );
}
