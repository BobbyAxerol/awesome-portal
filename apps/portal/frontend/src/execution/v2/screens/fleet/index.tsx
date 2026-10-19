/**
 * Alpha Fleet, identity (UXM-07 S1a, flag key `fleet`).
 *
 * One Fleet: lens tabs (All, Real-funded, Sandbox, Paper, Archived), search,
 * Owner / Health / Sort selects, a KPI strip of counts only, and the table
 * with a peek drawer; `view=board` arranges the same loaded rows by stage
 * (FleetBoard). It reads `GET /alphas` through the ExecutionApi port and
 * prints identity: no money, no equity line, no PnL column. What the backend
 * has not published is named with its FE id and its control is disabled with
 * the reason; it is never an empty cell or a zero.
 *
 * URL: `q`, `stage` (a lens is a named set of stage words), `sort`, `sel`,
 * `view`, plus `tab=archived` for the Archived lens and the screen-local
 * `owner` and `health`. Defaults are omitted.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { utcStamp } from "../../../time";
import { useDockMode, useDockSelection } from "../../Drawer";
import { Kpi, KpiStrip } from "../../blocks";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { withOrigin } from "../../backTo";
import { serializeUrlParams, useExecUrlState, withContext } from "../../urlState";
import { ColumnsMenu, FilterChips, type FilterChip } from "./fleetControls";
import { FleetBoard } from "./FleetBoard";
import { FleetDrawer } from "./FleetDrawer";
import { FleetTable } from "./FleetTable";
import {
  ARCHIVED_TAB, FE, FLEET_LENSES, alphaHref, HIDDEN_COLUMNS_PARAM, ROW_CAP, SORT_OPTIONS, fleetKpis, humanize, inStages, lensCounts,
  lensForStages, lensLabel, healthView, notPublished, parseHiddenColumns, queryKey, fleetQuery, serializeHiddenColumns,
  sortValueOf, stageLabel, stagesForLens, toFleetRow,
  type FleetColumnKey, type FleetFilters, type FleetLens,
} from "./fleetModel";
import { useFleetRead } from "./useFleetRead";

import "../../css/fleet.css";

export const FLEET_SCREEN_KEY = "fleet" as const;

export interface FleetScreenProps {
  api: ExecutionApi;
  /** Accepted for the mount contract; `GET /alphas` takes no workspace parameter and the server scopes it. */
  workspaceId?: string;
}

const SEARCH_DEBOUNCE_MS = 300;

function freshnessFlag(freshness: string): { kind: FlagKind; label: string } {
  switch (freshness) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "STALE": return { kind: "stale", label: "Stale" };
    default: return { kind: "unknown", label: humanize(freshness) };
  }
}

const NOT_PUBLISHED_LIST = [FE.group, FE.map, FE.window, FE.readiness, FE.compare, FE.archived];

function mergeSeen(current: readonly string[], next: readonly string[]): readonly string[] {
  const merged = [...new Set([...current, ...next])].sort((a, b) => a.localeCompare(b));
  return merged.length === current.length ? current : merged;
}

export default function FleetScreen({ api }: FleetScreenProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const reasonId = useId();
  const searchId = useId();

  const { q, stage, sort, view, tab } = url.value;
  const owner = params.get("owner")?.trim() || null;
  const health = params.get("health")?.trim() || null;
  const archived = tab === ARCHIVED_TAB;
  const lens: FleetLens | null = archived ? "archived" : lensForStages(stage);
  // D7: a `view` the screen does not know is the table. The read is enabled by the view being table or board, so a stray
  // value (`?view=foo`, `?view=Board`) must never switch it off and leave the page on a skeleton.
  const mapView = view === "map";
  const boardView = view === "board";
  const tableView = !boardView && !mapView;
  const hiddenColumns = useMemo(() => parseHiddenColumns(params.get(HIDDEN_COLUMNS_PARAM)), [params]);

  const filters: FleetFilters = useMemo(
    () => ({ q, stages: stage, owner, health, sort: sortValueOf(sort) }),
    [q, stage, owner, health, sort],
  );
  const key = queryKey(filters);
  const read = useFleetRead(api, !archived && (tableView || boardView), key, (after) => fleetQuery(filters, after));

  /* ── derived rows ─────────────────────────────────────────────────── */
  const loaded = useMemo(() => read.items.map(toFleetRow), [read.items]);
  const visible = useMemo(() => loaded.filter((row) => inStages(row, stage)).slice(0, ROW_CAP), [loaded, stage]);
  const selected = selection === null ? null : loaded.find((row) => row.alphaId === selection) ?? null;
  const counts = useMemo(() => lensCounts(read.summary), [read.summary]);
  const kpis = useMemo(() => fleetKpis(read.summary), [read.summary]);

  // Owner and Health options come from rows the page has shown, and are kept
  // while filtering: choosing one health must not remove the others.
  const [seenOwners, setSeenOwners] = useState<readonly string[]>([]);
  const [seenHealths, setSeenHealths] = useState<readonly string[]>([]);
  useEffect(() => {
    setSeenOwners((c) => mergeSeen(c, read.items.flatMap((i) => (i.owner ? [i.owner] : []))));
    setSeenHealths((c) => mergeSeen(c, read.items.map((i) => i.health)));
  }, [read.items]);
  const ownerOptions = useMemo(() => mergeSeen(seenOwners, owner ? [owner] : []), [seenOwners, owner]);
  const healthOptions = useMemo(() => mergeSeen(seenHealths, health ? [health] : []), [seenHealths, health]);

  /* ── url writers ─────────────────────────────────────────────────── */
  const setColumn = (column: FleetColumnKey, shown: boolean) => {
    const next = new Set(hiddenColumns);
    if (shown) next.delete(column);
    else next.add(column);
    const value = serializeHiddenColumns(next);
    const params2 = new URLSearchParams(params);
    if (value === null) params2.delete(HIDDEN_COLUMNS_PARAM);
    else params2.set(HIDDEN_COLUMNS_PARAM, value);
    setParams(params2, { replace: true });
  };
  const setLocal = (name: "owner" | "health", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "") next.delete(name);
    else next.set(name, value);
    next.delete("sel");
    setParams(next, { replace: true });
  };
  const pickLens = (next: FleetLens) =>
    url.set({ stage: stagesForLens(next), tab: next === "archived" ? ARCHIVED_TAB : null, sel: null });
  const clearFilters = () => {
    const next = serializeUrlParams({ q: null, stage: [], tab: null, sel: null }, params);
    next.delete("owner");
    next.delete("health");
    setParams(next);
  };

  // The search box commits on Enter or after a pause; the URL is the state.
  // The timer calls the newest setter, never the one from the render that
  // started it: by then the URL may have gained a lens or a sort of its own.
  const [text, setText] = useState(q ?? "");
  const setUrl = useRef(url.set);
  setUrl.current = url.set;
  useEffect(() => setText(q ?? ""), [q]);
  useEffect(() => {
    const next = text.trim() === "" ? null : text.trim();
    if (next === q) return;
    const timer = setTimeout(() => setUrl.current({ q: next, sel: null }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);
  const searchInput = useRef<HTMLInputElement>(null);
  const commitNow = () => url.set({ q: text.trim() === "" ? null : text.trim(), sel: null }, { replace: true });

  const filtered = q !== null || owner !== null || health !== null || stage.length > 0;
  // One chip per thing the URL filters by, as the HIFI #chips row; each clears only itself.
  const chips: FilterChip[] = [];
  if (archived) chips.push({ id: "lens", name: "lens", value: "Archived", clear: () => pickLens("all") });
  else if (stage.length > 0) {
    chips.push({
      id: "lens",
      name: lens === null ? "stage" : "lens",
      value: lens === "real" ? "Real-funded (Canary + Live)" : lens === null ? stage.map((s) => stageLabel(s)).join(", ") : lensLabel(lens),
      clear: () => pickLens("all"),
    });
  }
  if (owner !== null) chips.push({ id: "owner", name: "owner", value: owner, clear: () => setLocal("owner", "") });
  if (health !== null) chips.push({ id: "health", name: "health", value: healthView(health).label, clear: () => setLocal("health", "") });
  if (q !== null) chips.push({ id: "q", name: "search", value: q, clear: () => url.set({ q: null, sel: null }, { replace: true }) });
  const urlText = params.toString() === "" ? "No parameters" : `?${decodeURIComponent(params.toString().replace(/\+/g, " "))}`;
  const customStage = lens === null;
  const envelope = read.envelope;
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const incomplete = envelope !== null && envelope.completeness.toUpperCase() !== "COMPLETE";
  const stageNarrowedHere = !archived && stage.length > 1;
  const capped = read.items.length >= ROW_CAP;

  /* ── pieces ──────────────────────────────────────────────────────── */
  const countLine = (() => {
    if (!envelope || read.state.phase !== "ready") return null;
    const { filteredCount, totalCount } = envelope.page;
    if (stageNarrowedHere) {
      return `${visible.length} ${customStage ? "selected-stage" : lensLabel(lens!)} of ${read.items.length} loaded, ${filteredCount} on the server. The server filters one stage at a time, so this lens is narrowed on the loaded rows.`;
    }
    const scope = filteredCount !== totalCount ? `, ${totalCount} in your scope` : "";
    const head = capped && visible.length >= ROW_CAP ? `Top ${visible.length} of ${filteredCount}` : `${visible.length} of ${filteredCount}`;
    return `${head} ${filteredCount === 1 ? "alpha" : "alphas"}${scope}`;
  })();

  const emptyBlock = (() => {
    if (read.state.phase !== "ready") return undefined;
    if (!filtered) return <PanelState status="empty" reason="The fleet read published no alphas." />;
    return (
      <div className="exec-fleet-empty">
        <p>
          {stageNarrowedHere && read.nextCursor
            ? `None of the ${read.items.length} loaded rows is in this lens. Load more to keep looking.`
            : "No alphas match these filters."}
        </p>
        <button type="button" className="exec-fleet-btn" onClick={clearFilters}>Clear filters</button>
      </div>
    );
  })();

  const unpublishedView = (fact: { fe: string; what: string }) => (
    <div className="exec-fleet-nppanel" role="status">
      <strong>{fact.what}</strong>
      <p>{notPublished(fact)}</p>
    </div>
  );

  return (
    <div className="exec-fleet-v2" data-screen="alpha-fleet-v2">
      <header className="exec-fleet-head">
        <div>
          <h1 className="exec-fleet-title">Alpha Fleet</h1>
          <p className="exec-fleet-sub">Identity only. Allocation, PnL and equity are not shown on this screen.</p>
        </div>
        <div className="exec-fleet-fresh">
          <span className="exec-fleet-seg" role="group" aria-label="View">
            <button type="button" className="exec-fleet-segbtn" aria-pressed={tableView} onClick={() => url.set({ view: null })}>Table</button>
            <button type="button" className="exec-fleet-segbtn" aria-pressed={boardView} onClick={() => url.set({ view: "board" })}>Board</button>
            <button type="button" className="exec-fleet-segbtn" aria-pressed={mapView} disabled title={notPublished(FE.map)} aria-describedby={reasonId}>Map</button>
          </span>
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {envelope ? (
            <span>
              {envelope.sourceAsOf ? `As of ${utcStamp(envelope.sourceAsOf)}` : "Source time not published"}
            </span>
          ) : null}
        </div>
      </header>

      {incomplete && envelope ? (
        <div className="exec-fleet-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>The read is {humanize(envelope.completeness).toLowerCase()}: some rows or counts may be missing.</span>
        </div>
      ) : null}

      {!archived ? (
        <KpiStrip label="Fleet counts">
          {kpis.map((kpi) => (
            <Kpi
              key={kpi.id}
              label={kpi.label}
              value={kpi.value === null ? undefined : String(kpi.value)}
              basis={kpi.note}
            />
          ))}
        </KpiStrip>
      ) : null}

      <div className="exec-fleet-main" data-docked={selection !== null && mode === "dock" ? "true" : undefined}>
        <div className="exec-fleet-body">
          <div className="exec-fleet-tabs" role="tablist" aria-label="Fleet lens">
            {FLEET_LENSES.map((spec) => {
              const count = counts[spec.id];
              return (
                <button
                  key={spec.id}
                  type="button"
                  role="tab"
                  id={`${searchId}-tab-${spec.id}`}
                  aria-selected={lens === spec.id}
                  aria-controls={`${searchId}-panel`}
                  className="exec-fleet-tab"
                  onClick={() => pickLens(spec.id)}
                >
                  {spec.label}
                  {count.text !== null ? (
                    <span className="exec-fleet-tab-count" title={count.approximate ? "Upper bound: an alpha in both Canary and Live is counted in each." : undefined}>
                      {count.approximate ? `~${count.text}` : count.text}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="exec-fleet-tool" role="search">
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Search alpha</span>
              <input
                ref={searchInput}
                className="exec-fleet-input"
                type="search"
                placeholder="Search alpha"
                value={text}
                disabled={archived}
                title={archived ? notPublished(FE.archived) : undefined}
                aria-describedby={archived ? reasonId : undefined}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitNow();
                }}
              />
            </label>
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Owner</span>
              <select className="exec-fleet-select" value={owner ?? ""} disabled={archived} title={archived ? notPublished(FE.archived) : undefined} aria-describedby={archived ? reasonId : undefined} onChange={(event) => setLocal("owner", event.target.value)}>
                <option value="">Owner: all</option>
                {ownerOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Health</span>
              <select className="exec-fleet-select" value={health ?? ""} disabled={archived} title={archived ? notPublished(FE.archived) : undefined} aria-describedby={archived ? reasonId : undefined} onChange={(event) => setLocal("health", event.target.value)}>
                <option value="">Health: all</option>
                {healthOptions.map((code) => <option key={code} value={code}>{healthView(code).label}</option>)}
              </select>
            </label>
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Sort</span>
              <select
                className="exec-fleet-select"
                value={sortValueOf(sort) ?? ""}
                disabled={archived}
                title={archived ? notPublished(FE.archived) : undefined}
                aria-describedby={archived ? reasonId : undefined}
                onChange={(event) => url.set({ sort: event.target.value === "" ? null : event.target.value, sel: null })}
              >
                {SORT_OPTIONS.map((option) => <option key={option.id} value={option.value ?? ""}>Sort: {option.label}</option>)}
              </select>
            </label>
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Group by</span>
              <select className="exec-fleet-select" disabled title={notPublished(FE.group)} aria-describedby={reasonId} value="">
                <option value="">Group: none</option>
              </select>
            </label>
            <button type="button" className="exec-fleet-btn" disabled title={notPublished(FE.window)} aria-describedby={reasonId}>Window</button>
            <button type="button" className="exec-fleet-btn" disabled title={notPublished(FE.compare)} aria-describedby={reasonId}>Compare</button>
            <span className="exec-fleet-grow" />
            <ColumnsMenu hidden={hiddenColumns} onToggle={setColumn} />
          </div>
          <FilterChips chips={chips} onClearAll={clearFilters} urlText={urlText} onFocusFallback={() => searchInput.current?.focus()} />
          <p id={reasonId} className="exec-fleet-unpub">
            Not published yet: {NOT_PUBLISHED_LIST.map((fact) => `${fact.what} (${fact.fe})`).join(", ")}.
          </p>

          <div role="tabpanel" id={`${searchId}-panel`} aria-labelledby={`${searchId}-tab-${lens ?? "all"}`} className="exec-fleet-panel">
            {archived ? (
              <div className="exec-fleet-nppanel" role="status">
                <strong>Archived alphas</strong>
                <p>{notPublished(FE.archived)}. This lens makes no request until the backend publishes the list.</p>
              </div>
            ) : mapView ? (
              <>
                {unpublishedView(FE.map)}
                <button type="button" className="exec-fleet-btn" onClick={() => url.set({ view: null })}>Back to Table</button>
              </>
            ) : read.state.phase === "loading" || read.state.phase === "idle" ? (
              <PanelState status="loading" />
            ) : read.state.phase === "error" ? (
              <PanelState status={read.state.status} reason={read.state.reason} />
            ) : (
              <>
                {boardView ? (
                  <>
                    <p className="exec-fleet-note exec-fleet-board-note">
                      Loaded rows only: {visible.length} {visible.length === 1 ? "alpha" : "alphas"} placed by highest published stage.
                      Stage counts are for your whole scope. Readiness and days in stage are not published ({FE.readiness.fe}).
                    </p>
                    {visible.length === 0 ? emptyBlock : (
                      <FleetBoard
                        rows={visible}
                        summary={read.summary}
                        selectedKey={selection}
                        hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "fleet" }, params), params)}
                        onOpen={(row) => select(row.alphaId)}
                      />
                    )}
                  </>
                ) : (
                  <FleetTable
                    rows={visible}
                    hidden={hiddenColumns}
                    selectedKey={selection}
                    onOpen={(row) => select(row.alphaId)}
                    empty={emptyBlock}
                  />
                )}
                <div className="exec-fleet-foot">
                  <span className="exec-fleet-count-line" role="status" aria-live="polite">{countLine}</span>
                  {read.nextCursor && !capped ? (
                    <button type="button" className="exec-fleet-btn" disabled={read.loadingMore} title={read.loadingMore ? "Loading the next page" : "Load the next page"} onClick={read.loadMore}>
                      {read.loadingMore ? "Loading" : "Load more"}
                    </button>
                  ) : null}
                  {read.nextCursor && capped ? (
                    <span className="exec-fleet-note">Showing the first {ROW_CAP} rows. Narrow the filters to see the rest.</span>
                  ) : null}
                </div>
                {read.moreError ? (
                  <p className="exec-fleet-note" role="alert">The next page could not be read ({read.moreError}). The rows above are unchanged.</p>
                ) : null}
              </>
            )}
          </div>
        </div>

        {selection !== null ? (
          <FleetDrawer
            alphaId={selection}
            row={selected}
            loading={read.state.phase === "loading"}
            mode={mode}
            onClose={close}
          />
        ) : null}
      </div>
    </div>
  );
}
