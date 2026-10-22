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
 *
 * The window and the filters live in the URL (opsUrl.ts), written with replace
 * so a refresh and a pasted link land on the same list. `?operation=<id>` (the
 * deep link every other screen writes) selects the operation once and is then
 * removed from the URL; the selection itself is `sel`. V1's `?filter=` is
 * answered with a sentence, never applied.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams, type To } from "react-router-dom";

import { PanelState } from "../../../components/states";
import type { ExecutionApi } from "../../../api/ports";
import type { PanelStatus } from "../../../contracts";
import { useDockMode, useDockSelection } from "../../Drawer";
import { Kpi, KpiStrip, NotAvailableLine, QuietIds } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import {
  SEVERITIES_V2, TARGET_TYPES_V2, TRIAGE_STATES_V2, VERIFICATION_RESULTS_V2,
  type OperationalQueueQueryV2, type OperationalQueueV2, type OperationV2, type SeverityV2,
  type TargetTypeV2, type TriageStateV2, type VerificationResultV2,
} from "../../readers/operationalQueue";
import { ENV_LABEL, EXEC_ENVS, serializeUrlParams, useExecUrlState, type ExecEnv } from "../../urlState";
import { IncidentRootDrawer } from "./IncidentRootDrawer";
import { ACCESS_PATH, AccessLink, FE, NotPublished, notPublishedReason } from "./notPublished";
import { OperationDock } from "./OperationDock";
import {
  invalidNotice, legacyFilterNotice, OPS_WINDOWS, readOpsUrl, writeOpsUrl, type Filters, type OpsWindow,
} from "./opsUrl";
import { profileLabel } from "../../profileLabel";
import { humanize, TARGET_LABEL } from "./outcome";
import { QueueTable } from "./QueueTable";
import { StatusCounts } from "./StatusCounts";
import { sourceHealthSummary, useSourceHealth } from "./useSourceHealth";

import "../../css/operations.css";

export const PAGE_LIMIT = 50;
/** DOM budget (S1 card): more than this and the reader narrows the filters instead. */
export const ROW_CAP = 200;

export const MINE_REASON = notPublishedReason(
  FE.assignee,
  "No assignee or creator is published, so it cannot be filtered to you.",
);

export type { OpsWindow } from "./opsUrl";
const WINDOWS = OPS_WINDOWS;
const WINDOW_MS: Readonly<Record<OpsWindow, number | null>> = {
  "24H": 24 * 3_600_000,
  "7D": 7 * 24 * 3_600_000,
  "30D": 30 * 24 * 3_600_000,
  "90D": 90 * 24 * 3_600_000,
  ALL: null,
};

type View = "commands" | "exceptions" | "audit";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "exceptions", label: "Exceptions" },
  { id: "audit", label: "Audit" },
];

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
  /** Where "My access" lives, for a denied read (D9). */
  accessHref?: string;
}

export default function OperationsV2({
  api, workspaceId, now, requestedOperation = null, incidentId = null, queuePath = "/execution/operations", accessHref = ACCESS_PATH,
}: OperationsV2Props) {
  const mode = useDockMode();
  const { selection, select, close } = useDockSelection();
  const url = useExecUrlState();
  const navigate = useNavigate();
  const location = useLocation();
  const mineReasonId = useId();
  const sourceHealth = useSourceHealth(api, workspaceId);

  const [params, setParams] = useSearchParams();
  const urlState = useMemo(() => readOpsUrl(params), [params]);
  const { filters, range } = urlState;
  const [draftKey, setDraftKey] = useState(filters.commandKey);
  const [urlNotices, setUrlNotices] = useState<readonly string[]>([]);
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

  // The Back button and a pasted link can change the command key under the draft the reader was typing.
  useEffect(() => setDraftKey(filters.commandKey), [filters.commandKey]);

  // What the link carried that is not state yet, settled in one write (replace, so Back does not return to it):
  //  - `operation`: a link that names an operation opens it once, as `sel`, and the param is removed, so closing the
  //    dock does not re-open it and Back does not stack an entry per click. A `sel` already in the URL wins.
  //  - `filter`: V1's command-center filters have no equivalent here; say so and drop it.
  //  - a value of ours that is not valid: drop it and say so.
  // The base is the canonical form of the URL, so this write also carries the rewrite `useExecUrlState` queued.
  const operationParam = params.get("operation");
  const wanted = operationParam ?? requestedOperation;
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    const next = serializeUrlParams(url.value, params);
    const notices: string[] = [];
    let changed = false;
    if (wanted) {
      if (consumed.current !== wanted) {
        consumed.current = wanted;
        if (!params.get("sel")) {
          next.set("sel", wanted);
          changed = true;
        }
      }
      if (operationParam !== null) {
        next.delete("operation");
        changed = true;
      }
    } else consumed.current = null;
    if (urlState.legacyFilter !== null) {
      notices.push(legacyFilterNotice(urlState.legacyFilter));
      next.delete("filter");
      changed = true;
    }
    if (urlState.invalid.length > 0) {
      notices.push(invalidNotice(urlState.invalid));
      for (const key of urlState.invalid) next.delete(key);
      changed = true;
    }
    if (notices.length > 0) setUrlNotices((prev) => [...prev, ...notices.filter((text) => !prev.includes(text))]);
    if (changed) setParams(next, { replace: true });
    // `url` is a new object per render; its value is read through `params`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, wanted]);

  /** Writes a change of window or filters to the URL, replacing the entry: a filter is not a page. */
  const commit = (next: { filters?: Filters; range?: OpsWindow }) => {
    setUrlNotices([]);
    setParams(writeOpsUrl(serializeUrlParams(url.value, params), { filters: next.filters ?? filters, range: next.range ?? range }), { replace: true });
  };

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

  const patch = (next: Partial<Filters>) => commit({ filters: { ...filters, ...next } });
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

  /** The incident drawer route, over this queue, keeping the context in the query string (FE-042 links). */
  const incidentTo = useCallback(
    (id: string): To => ({ pathname: `${queuePath}/incidents/${encodeURIComponent(id)}`, search: location.search }),
    [queuePath, location.search],
  );
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
        </div>
        {ready ? (
          <div className="exec-ops-chips">
            <span className="exec-ops-chip">Observed {formatAsOf(ready.queue.observedAtMs)}</span>
            <span className="exec-ops-chip">Source journal unavailable</span>
          </div>
        ) : null}
      </div>

      {ready ? (
        <KpiStrip label="Queue counts" columns={4}>
          <Kpi label="In scope" value={number(ready.queue.page.totalCount)} />
          <Kpi label="Matching" value={number(ready.queue.page.filteredCount)} />
          <Kpi label="Loaded" value={number(ready.rows.length)} basis={`of ${number(ready.queue.page.filteredCount)} matching`} />
          <div className="exec-blk-kpi">
            <dt className="exec-blk-kpi-label">Read</dt>
            <dd className="exec-blk-kpi-body">
              {/* A state word, not a figure: body role, not the 24px KPI numeral (OP-9). */}
              <span className="exec-blk-kpi-value"><span className="exec-ops-kpi-word">{humanize(ready.queue.readTruth.state)}</span></span>
              {ready.queue.readTruth.reasonCode ? <span className="exec-blk-kpi-note">{ready.queue.readTruth.reasonCode}</span> : null}
            </dd>
          </div>
        </KpiStrip>
      ) : null}

      {ready ? (
        <StatusCounts
          counts={ready.queue.page.statusCounts}
          appliedFilters={ready.queue.page.appliedFilters}
          observed={formatAsOf(ready.queue.observedAtMs)}
        />
      ) : null}

      <details className="exec-ops-panel">
        <summary>
          Source health
          {sourceHealth.phase === "ready" && sourceHealth.profiles.length > 0 ? (
            <span className="exec-ops-sum"> · {sourceHealthSummary(sourceHealth.profiles)}</span>
          ) : sourceHealth.phase === "loading" ? null : (
            <span className="exec-ops-sum"> · Not available</span>
          )}
        </summary>
        {sourceHealth.phase === "ready" && sourceHealth.profiles.length > 0 ? (
          <table className="exec-ops-profiles" aria-label="Source health by profile">
            <thead>
              <tr><th scope="col">Profile</th><th scope="col">State</th></tr>
            </thead>
            <tbody>
              {sourceHealth.profiles.map((p) => {
                const state = (p.state ?? "").toUpperCase();
                return (
                  <tr key={p.profile}>
                    <td title={p.profile}>{profileLabel(p.profile)}</td>
                    <td>
                      <Flag kind={state === "AVAILABLE" ? "ok" : state === "PARTIAL" ? "partial" : "unknown"} label={p.state ? humanize(p.state) : "State not stated"} size="sm" />
                      {p.reasonCode ? <span className="exec-ops-np-reason">{p.reasonCode}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <p className="exec-ops-np">
          <NotPublished id={FE.audit}>
            Source journal: integration is {ready ? humanize(ready.queue.sourceIntegrationState).toLowerCase() : "unavailable"}; nothing is assumed healthy.
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
                    No exceptions feed. Incidents open from their own link.
                  </NotPublished>
                </p>
              </div>
            ) : null}

            {view === "audit" ? (
              <div className="exec-ops-panel">
                <h2 className="exec-ops-panel-title">Audit</h2>
                <p className="exec-ops-np">
                  <NotPublished id={FE.audit}>
                    Who did what is not shown: the audit source is unavailable.
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
                        <button key={w} type="button" aria-pressed={range === w} onClick={() => commit({ range: w })}>
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
                <p id={mineReasonId} className="exec-ops-reason">Mine: <QuietIds text={MINE_REASON} /></p>
                <NotAvailableLine
                  className="exec-ops-na-line"
                  facts={[
                    ...(ready?.rows.some((row) => row.incidentLinks === undefined) ? [{ label: "Linked incidents", id: "FE-042" as const, why: "An older server body omits the field" }] : []),
                  ]}
                />

                {urlNotices.map((text) => <p key={text} className="exec-ops-banner" role="status">{text}</p>)}
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
                      actions={(
                        <>
                          {load.status === "denied" ? <AccessLink href={accessHref} /> : null}
                          <button type="button" className="exec-ops-apply" onClick={() => setReloadTick((t) => t + 1)}>Try again</button>
                        </>
                      )}
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
                        incidentTo={incidentTo}
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
          <IncidentRootDrawer api={api} incidentId={incidentId} workspaceId={workspaceId} mode={mode} onClose={closeIncident} accessHref={accessHref} />
        ) : null}
        {operationOpen && selection ? (
          <OperationDock
            operationId={selection}
            row={selectedRow}
            loading={load.phase === "loading"}
            mode={mode}
            onClose={close}
            api={api}
            workspaceId={ready?.queue.workspaceId ?? workspaceId}
          />
        ) : null}
      </div>
    </div>
  );
}
