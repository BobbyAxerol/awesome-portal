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
 *
 * Manager dataset (FE-012, FE-027, RV-09): the source is chosen by the data, not by a toggle. When the lens is ONE environment
 * (Real-funded, Sandbox, Paper), the view is the table and the Manager dataset is published for the caller there, the table reads
 * the dataset through `getManagerDataset`: one row per alpha version and portfolio, the server's own filters (search, owner,
 * health with `IN`, the lens's stages), `Current stage` sort and group, keyset paging with honest "Showing N of M". Everywhere
 * else (the All lens, the board, an unpublished dataset) it reads the fleet read, one row per alpha. ONE chip names the source and
 * its population. The two populations differ, so there is no silent switch: the only way across is the explicit "Use the fleet
 * read" on a failed dataset read (`src=fleet`, screen-local, as are `group` and a comma list in `health`).
 *
 * Counts (Bobby, 2026-10-20): the KPI strip and the lens counts stay on every lens that is not Archived. They are ALWAYS the fleet read's
 * summary (the whole authorized scope, whatever the lens or the table filters: the same "statement before table filters" the dataset
 * states, ELP2-REQ-FE-010). On a dataset table a second, one-row fleet read (`limit` 1, no filter) supplies them, and ONE small line
 * says which population each number is: counts = alphas (fleet read), table = alpha versions in a portfolio (Manager dataset).
 *
 * Owner and Health choices: the whole authorized population when the dataset published it (a group list over the whole filtered
 * query), otherwise the rows loaded so far, worded as such, with a typed value that the server filters on (`useFleetOptions`).
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
import { MANAGER_STATEMENT_SCOPE } from "../../readers/managerDataset";
import { ColumnsMenu, FilterChips, MultiPick, type FilterChip } from "./fleetControls";
import { OptionFilter } from "./OptionFilter";
import { FleetBoard } from "./FleetBoard";
import { FleetDatasetDrawer } from "./FleetDatasetDrawer";
import { FleetDatasetTable } from "./FleetDatasetTable";
import { FleetDrawer } from "./FleetDrawer";
import { FleetTable } from "./FleetTable";
import {
  FE_STAGE_ENTRY, datasetCountLine, datasetGroupOptions, datasetKey, datasetQuery, datasetScopeOf, datasetSortOf, datasetSortOptions, groupFieldOf,
  groupLabel, healthWord, parseHealths, serializeHealths, type DatasetFilters,
} from "./fleetDatasetModel";
import { useDatasetPublication, useFleetDataset } from "./useFleetDataset";
import { useDatasetOptions } from "./useFleetOptions";
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
/** The URL codec's bound for `sel` (urlState `token(256)`). */
const SEL_MAX = 256;

function freshnessFlag(freshness: string): { kind: FlagKind; label: string } {
  switch (freshness) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "STALE": return { kind: "stale", label: "Stale" };
    default: return { kind: "unknown", label: humanize(freshness) };
  }
}

const COUNTS_SOURCE_TITLE = "The figures above and the tab counts are the fleet read:one count per alpha over everything you may see, not narrowed by the lens or the filters. The table is the Manager dataset: one row per alpha version in a portfolio, in the lens's environment.";

const NOT_PUBLISHED_LIST = [FE.group, FE.map, FE.window, FE.readiness, FE.compare, FE.archived];

function mergeSeen(current: readonly string[], next: readonly string[]): readonly string[] {
  const merged = [...new Set([...current, ...next])].sort((a, b) => a.localeCompare(b));
  return merged.length === current.length ? current : merged;
}

/** Why a dataset-only note exists: the contract's own constants, in words (never re-derived). */
const STAGE_RULE_SENTENCE = "Current stage is the single active stage of the alpha version in this environment; a row with several active stages has none, and the stage entry time is not published";

export default function FleetScreen({ api, workspaceId }: FleetScreenProps) {
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

  /* ── the Manager dataset as the source (only when it is published for this caller) ───────── */
  // `src=fleet` is the explicit way back from a failed dataset read; it is not offered anywhere else.
  const forceFleet = params.get("src") === "fleet";
  const scope = useMemo(() => datasetScopeOf(stage, archived), [stage, archived]);
  const publication = useDatasetPublication(api, scope === null ? null : scope.environment);
  const published = publication.phase === "published" && scope !== null;
  // The legacy read is NOT started while the answer to "is it published?" is pending for a lens the dataset could serve: a
  // request for the fleet read that the dataset then replaces would be a wasted read and a flash of the other table.
  const waitingForDataset = !forceFleet && scope !== null && tableView && publication.phase === "checking";
  const datasetMode = published && !forceFleet && tableView;
  const offered = publication.phase === "published" ? publication.dataset.queryOptions : null;
  const sortOptions = useMemo(() => datasetSortOptions(offered === null ? null : offered.sortFields), [offered]);
  const groupOptions = useMemo(() => datasetGroupOptions(offered === null ? null : offered.groupFields), [offered]);
  const healths = useMemo(() => parseHealths(params.get("health")), [params]);
  const datasetFilters = useMemo<DatasetFilters | null>(() => {
    if (scope === null) return null;
    const field = groupFieldOf(params.get("group"));
    return {
      scope, q, owner, healths, sort: sort,
      group: field !== null && groupOptions.some((option) => option.field === field) ? field : null,
      ...(workspaceId ? { workspaceId } : {}),
    };
  }, [scope, q, owner, healths, sort, params, groupOptions, workspaceId]);
  const offeredSorts = offered === null ? null : offered.sortFields;
  const [datasetNonce, setDatasetNonce] = useState(0);
  const dataset = useFleetDataset(
    api,
    datasetMode && datasetFilters !== null,
    `${datasetFilters === null ? "" : datasetKey(datasetFilters, offeredSorts)}|${datasetNonce}`,
    // Only called while enabled, and enabled needs the filters.
    (after) => datasetQuery(datasetFilters as DatasetFilters, offeredSorts, after),
  );

  const read = useFleetRead(api, !archived && (tableView || boardView) && !datasetMode && !waitingForDataset, key, (after) => fleetQuery(filters, after));
  // The counts' own read: one row, no filter, only while the dataset is the table's source (the fleet read above is then not made). Its
  // summary is the whole authorized scope whatever the lens or the filters; a failed read leaves the strip with typed absences.
  const countsRead = useFleetRead(api, datasetMode, "counts", () => ({ limit: 1 }));

  /* ── derived rows ─────────────────────────────────────────────────── */
  const loaded = useMemo(() => read.items.map(toFleetRow), [read.items]);
  const visible = useMemo(() => loaded.filter((row) => inStages(row, stage)).slice(0, ROW_CAP), [loaded, stage]);
  const datasetRows = useMemo(() => dataset.rows.slice(0, ROW_CAP), [dataset.rows]);
  const selected = selection === null ? null : loaded.find((row) => row.alphaId === selection) ?? null;
  const datasetSelected = selection === null ? null : dataset.rows.find((row) => row.rowKey === selection) ?? null;
  // The lens counts and the KPI strip are the fleet read's summary (the whole scope, whatever the filters): never the dataset's.
  const summary = datasetMode ? countsRead.summary : read.summary;
  const counts = useMemo(() => lensCounts(summary), [summary]);
  const kpis = useMemo(() => fleetKpis(summary), [summary]);

  // Owner and Health options come from rows the page has shown, and are kept
  // while filtering: choosing one health must not remove the others.
  const [seenOwners, setSeenOwners] = useState<readonly string[]>([]);
  const [seenHealths, setSeenHealths] = useState<readonly string[]>([]);
  useEffect(() => {
    setSeenOwners((c) => mergeSeen(c, read.items.flatMap((i) => (i.owner ? [i.owner] : []))));
    setSeenHealths((c) => mergeSeen(c, read.items.map((i) => i.health)));
  }, [read.items]);
  // The dataset's own rows feed their own options (the two sources never share a list).
  const [seenDatasetOwners, setSeenDatasetOwners] = useState<readonly string[]>([]);
  const [seenDatasetHealths, setSeenDatasetHealths] = useState<readonly string[]>([]);
  useEffect(() => {
    setSeenDatasetOwners((c) => mergeSeen(c, dataset.rows.flatMap((r) => (r.ownerUserId ? [r.ownerUserId] : []))));
    setSeenDatasetHealths((c) => mergeSeen(c, dataset.rows.flatMap((r) => (r.health ? [r.health] : []))));
  }, [dataset.rows]);
  // RV-09: the whole authorized population when the dataset published it (a group list over the whole filtered query); otherwise only
  // the rows loaded so far, which is worded as such and never offered as complete.
  const published_ = useDatasetOptions(api, datasetMode, scope, workspaceId, offered === null ? null : offered.groupFields);
  const ownerPublished = datasetMode && published_.owners.basis === "published";
  const healthPublished = datasetMode && published_.healths.basis === "published";
  const ownerComplete = ownerPublished && published_.owners.complete;
  const healthComplete = healthPublished && published_.healths.complete;
  const ownerOptions = useMemo(
    () => (ownerPublished ? mergeSeen(published_.owners.values, owner ? [owner] : [])
      : datasetMode ? mergeSeen(seenDatasetOwners, owner ? [owner] : []) : mergeSeen(seenOwners, owner ? [owner] : [])),
    [ownerPublished, published_.owners.values, datasetMode, seenDatasetOwners, seenOwners, owner],
  );
  const healthOptions = useMemo(() => mergeSeen(seenHealths, health ? [health] : []), [seenHealths, health]);
  const datasetHealthOptions = useMemo(
    () => mergeSeen(healthPublished ? published_.healths.values : seenDatasetHealths, healths),
    [healthPublished, published_.healths.values, seenDatasetHealths, healths],
  );
  // One honest sentence about the choices that are not the whole population (nothing when both are).
  const limitNote = (() => {
    if (archived) return null;
    const loadedNames = [ownerPublished ? null : "Owner", healthPublished ? null : "Health"].filter((name): name is string => name !== null);
    const cutNames = [ownerPublished && !ownerComplete ? "Owner" : null, healthPublished && !healthComplete ? "Health" : null].filter((name): name is string => name !== null);
    const parts: string[] = [];
    if (loadedNames.length > 0) parts.push(`${loadedNames.join(" and ")} choices are the rows loaded so far, not the whole fleet.`);
    if (cutNames.length > 0) parts.push(`${cutNames.join(" and ")} choices may be cut short by the server.`);
    return parts.length === 0 ? null : `${parts.join(" ")} Type a value to filter on the server.`;
  })();

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
  const setLocal = (name: "owner" | "health" | "group", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "") next.delete(name);
    else next.set(name, value);
    next.delete("sel");
    setParams(next, { replace: true });
  };
  // The explicit way across, after a failed dataset read (`src=fleet`) and back. Going to the fleet read drops what only the dataset
  // understands (a group, a health list); going back to the automatic source drops only the override.
  const setSource = (next: "fleet" | "auto") => {
    const params2 = new URLSearchParams(params);
    params2.delete("sel");
    if (next === "auto") params2.delete("src");
    else {
      params2.set("src", "fleet");
      params2.delete("group");
      // The fleet read filters one health at a time: one word stays, a list (the dataset's IN) is dropped, not cut to its first word.
      const words = parseHealths(params.get("health"));
      if (words.length === 1) params2.set("health", words[0]!);
      else params2.delete("health");
    }
    setParams(params2, { replace: true });
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
  if (health !== null) chips.push({ id: "health", name: "health", value: datasetMode ? healths.map(healthWord).join(", ") : healthView(health).label, clear: () => setLocal("health", "") });
  if (q !== null) chips.push({ id: "q", name: "search", value: q, clear: () => url.set({ q: null, sel: null }, { replace: true }) });
  const urlText = params.toString() === "" ? "No parameters" : `?${decodeURIComponent(params.toString().replace(/\+/g, " "))}`;
  const customStage = lens === null;
  // The words that name the table's population in the counts line: the lens, or the stages when the URL names a set that is no lens.
  const scopeWords = lens !== null && lens !== "all" ? lensLabel(lens) : stage.map((s) => stageLabel(s)).join(", ");
  const countTitle = (approximate: boolean): string | undefined => {
    const parts: string[] = [];
    if (approximate) parts.push("Upper bound: an alpha in both Canary and Live is counted in each.");
    if (datasetMode) parts.push("Alphas (fleet read). The table counts alpha versions in a portfolio (Manager dataset).");
    return parts.length === 0 ? undefined : parts.join(" ");
  };
  const envelope = read.envelope;
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const incomplete = envelope !== null && envelope.completeness.toUpperCase() !== "COMPLETE";
  const stageNarrowedHere = !archived && stage.length > 1;
  const capped = read.items.length >= ROW_CAP;

  /* ── pieces ──────────────────────────────────────────────────────── */
  const datasetCapped = datasetMode && dataset.rows.length >= ROW_CAP;
  const datasetCount = datasetMode && dataset.state.phase === "ready"
    ? datasetCountLine(datasetRows.length, dataset.rows.length, dataset.total, dataset.nextCursor !== null, datasetCapped)
    : null;
  const datasetNote = (() => {
    const first = dataset.first;
    if (!datasetMode || first === null) return null;
    const scopeSentence = first.statementScope === MANAGER_STATEMENT_SCOPE
      ? "Counts and groups cover the whole filtered result, not only the loaded rows; capital statements, which this screen does not show, are taken before the table filters."
      : "";
    return `Source: the Manager dataset, ${first.environment}. One row is an alpha version in a portfolio. ${STAGE_RULE_SENTENCE}. ${scopeSentence}`.trim();
  })();
  const countLine = (() => {
    if (datasetMode) return datasetCount;
    if (!envelope || read.state.phase !== "ready") return null;
    const { filteredCount, totalCount } = envelope.page;
    if (stageNarrowedHere) {
      return `${visible.length} ${customStage ? "selected-stage" : lensLabel(lens!)} of ${read.items.length} loaded, ${filteredCount} on the server. The server filters one stage at a time, so this lens is narrowed on the loaded rows.`;
    }
    const scope = filteredCount !== totalCount ? `, ${totalCount} in your scope` : "";
    const head = capped && visible.length >= ROW_CAP ? `Top ${visible.length} of ${filteredCount}` : `${visible.length} of ${filteredCount}`;
    return `${head} ${filteredCount === 1 ? "alpha" : "alphas"}${scope}`;
  })();

  /* ONE chip says where the table comes from and what a row is: the two sources count different things. */
  const sourceChip = (() => {
    if (archived || mapView || waitingForDataset) return null;
    if (datasetMode) {
      return (
        <span className="exec-fleet-source" role="status" data-source="dataset" title={datasetNote ?? "One row per alpha version in a portfolio, filtered and grouped by the server"}>
          Manager dataset · alpha versions
        </span>
      );
    }
    return (
      <span className="exec-fleet-source" role="status" data-source="fleet" title={boardView ? "The board is built from the fleet read: one row per alpha." : "One row per alpha."}>
        Fleet read · alphas
        {published && forceFleet ? <button type="button" className="exec-fleet-link" onClick={() => setSource("auto")}>Use the dataset</button> : null}
      </span>
    );
  })();

  const emptyBlock = (() => {
    if (datasetMode) {
      if (dataset.state.phase !== "ready") return undefined;
      // The lens alone is not a filter the reader chose: with only the lens, no row means the dataset published none for the view.
      if (q === null && owner === null && health === null) return <PanelState status="empty" reason="The Manager dataset published no rows for this view." />;
      return (
        <div className="exec-fleet-empty">
          <p>No rows match these filters.</p>
          <button type="button" className="exec-fleet-btn" onClick={clearFilters}>Clear filters</button>
        </div>
      );
    }
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

  const unpublishedList = datasetMode ? [FE.map, FE.window, FE.readiness, FE_STAGE_ENTRY, FE.compare, FE.archived] : NOT_PUBLISHED_LIST;
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
        </div>
        <div className="exec-fleet-fresh">
          <span className="exec-fleet-seg" role="group" aria-label="View">
            <button type="button" className="exec-fleet-segbtn" aria-pressed={tableView} onClick={() => url.set({ view: null })}>Table</button>
            <button type="button" className="exec-fleet-segbtn" aria-pressed={boardView} onClick={() => url.set({ view: "board" })}>Board</button>
            <button type="button" className="exec-fleet-segbtn" aria-pressed={mapView} disabled title={notPublished(FE.map)} aria-describedby={reasonId}>Map</button>
          </span>
          {sourceChip}
          {datasetMode ? (
            <>
              {dataset.first && dataset.first.quality.freshness !== "FRESH" ? <Flag kind={dataset.first.quality.freshness === "STALE" ? "stale" : "unknown"} label={humanize(dataset.first.quality.freshness)} size="sm" /> : null}
              {dataset.first ? <span>As of {utcStamp(dataset.first.asOfMs)}</span> : null}
            </>
          ) : (
            <>
              {fresh && fresh.kind !== "ok" ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
              {envelope ? (
                <span>
                  {envelope.sourceAsOf ? `As of ${utcStamp(envelope.sourceAsOf)}` : "Source time not published"}
                </span>
              ) : null}
            </>
          )}
        </div>
      </header>

      {datasetMode && dataset.first && (dataset.first.quality.completeness !== "COMPLETE" || dataset.first.quality.freshness !== "FRESH") ? (
        <div className="exec-fleet-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>
            The dataset is {humanize(dataset.first.quality.completeness).toLowerCase()} and {humanize(dataset.first.quality.freshness).toLowerCase()}: some rows or counts may be missing or old.
            {dataset.first.quality.reasons.length > 0 ? ` (${dataset.first.quality.reasons.join(", ")})` : ""}
          </span>
        </div>
      ) : null}

      {!datasetMode && incomplete && envelope ? (
        <div className="exec-fleet-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span title={`The read is ${humanize(envelope.completeness).toLowerCase()}`}>Some rows or counts may be missing</span>
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
      {!archived && datasetMode ? (
        <p className="exec-fleet-counts-src" data-testid="counts-source" title={countsRead.envelope?.sourceAsOf ? `${COUNTS_SOURCE_TITLE} Counts as of ${utcStamp(countsRead.envelope.sourceAsOf)}.` : COUNTS_SOURCE_TITLE}>
          Counts: Fleet read, alphas in your whole scope. Table: Manager dataset, alpha versions in {scopeWords}.
        </p>
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
                    <span className="exec-fleet-tab-count" title={countTitle(count.approximate)}>
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
            <div className="exec-fleet-field">
              <OptionFilter
                name="Owner"
                value={owner}
                options={ownerOptions.map((name) => ({ value: name, label: name }))}
                complete={ownerComplete}
                limit={ownerPublished ? "The server may have cut this list. Type an id to filter on the server." : "These are the owners of the rows loaded so far, not the whole fleet. Type an id to filter on the server."}
                disabled={archived}
                title={archived ? notPublished(FE.archived) : undefined}
                describedBy={archived ? reasonId : undefined}
                onChange={(next) => setLocal("owner", next ?? "")}
              />
            </div>
            {datasetMode ? (
              <div className="exec-fleet-field">
                <MultiPick
                  name="Health"
                  complete={healthComplete}
                  options={datasetHealthOptions.map((code) => ({ value: code, label: healthWord(code) }))}
                  selected={healths}
                  onChange={(next) => setLocal("health", serializeHealths(next) ?? "")}
                />
              </div>
            ) : (
              <div className="exec-fleet-field">
                <OptionFilter
                  name="Health"
                  value={health}
                  options={healthOptions.map((code) => ({ value: code, label: healthView(code).label }))}
                  complete={false}
                  limit="These are the health words of the rows loaded so far, not the whole fleet. Type a word to filter on the server."
                  disabled={archived}
                  title={archived ? notPublished(FE.archived) : undefined}
                  describedBy={archived ? reasonId : undefined}
                  onChange={(next) => setLocal("health", next ?? "")}
                />
              </div>
            )}
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Sort</span>
              {datasetMode ? (
                <select
                  className="exec-fleet-select"
                  value={datasetSortOf(sort, sortOptions).value ?? ""}
                  title="Stages sort by name, not by risk. A row with no single stage comes last in both directions."
                  onChange={(event) => url.set({ sort: event.target.value === "" ? null : event.target.value, sel: null })}
                >
                  {sortOptions.map((option) => <option key={option.id} value={option.value ?? ""}>Sort: {option.label}</option>)}
                </select>
              ) : (
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
              )}
            </label>
            <label className="exec-fleet-field">
              <span className="exec-fleet-sr">Group by</span>
              {datasetMode && groupOptions.some((option) => option.field !== null) ? (
                <select
                  className="exec-fleet-select"
                  value={datasetFilters?.group ?? ""}
                  title="Groups cover the whole filtered result"
                  onChange={(event) => setLocal("group", event.target.value)}
                >
                  {groupOptions.map((option) => <option key={option.id} value={option.field ?? ""}>{option.label}</option>)}
                </select>
              ) : (
                <select className="exec-fleet-select" disabled title={notPublished(FE.group)} aria-describedby={reasonId} value="">
                  <option value="">Group: none</option>
                </select>
              )}
            </label>
            <button type="button" className="exec-fleet-btn" disabled title={notPublished(FE.window)} aria-describedby={reasonId}>Window</button>
            <button type="button" className="exec-fleet-btn" disabled title={notPublished(FE.compare)} aria-describedby={reasonId}>Compare</button>
            <span className="exec-fleet-grow" />
            <ColumnsMenu hidden={hiddenColumns} onToggle={setColumn} />
          </div>
          <FilterChips chips={chips} onClearAll={clearFilters} urlText={urlText} onFocusFallback={() => searchInput.current?.focus()} />
          {/* Tied to every disabled control by aria-describedby: the visible words are the names, the ids are in the title and the hidden text. */}
          <p id={reasonId} className="exec-fleet-unpub" title={unpublishedList.map((fact) => `${fact.what}: ${notPublished(fact)}`).join("\n")}>
            Not available: {unpublishedList.map((fact) => fact.what).join(", ")}
            <span className="exec-fleet-sr"> ({unpublishedList.map((fact) => `${fact.what} (${fact.fe})`).join(", ")})</span>
          </p>
          {datasetNote ? <p className="exec-fleet-sr" data-testid="dataset-note">{datasetNote}</p> : null}
          {limitNote ? <p className="exec-fleet-note exec-fleet-limit" data-testid="options-limit">{limitNote}</p> : null}

          <div role="tabpanel" id={`${searchId}-panel`} aria-labelledby={`${searchId}-tab-${lens ?? "all"}`} className="exec-fleet-panel">
            {archived ? (
              <div className="exec-fleet-nppanel" role="status">
                <strong>Archived alphas</strong>
                <p title="No archived-alpha read is published (FE-034), so this lens asks for nothing.">
                  <span className="exec-fleet-sr">{notPublished(FE.archived)}</span>
                  <span aria-hidden="true">Not available</span>
                </p>
              </div>
            ) : mapView ? (
              <>
                {unpublishedView(FE.map)}
                <button type="button" className="exec-fleet-btn" onClick={() => url.set({ view: null })}>Back to Table</button>
              </>
            ) : datasetMode ? (
              dataset.state.phase === "loading" || dataset.state.phase === "idle" ? (
                <PanelState status="loading" />
              ) : dataset.state.phase === "error" ? (
                <PanelState
                  status={dataset.state.status}
                  reason={dataset.state.reason}
                  actions={
                    <>
                      <button type="button" className="exec-fleet-btn" onClick={() => setDatasetNonce((n) => n + 1)}>Try again</button>
                      <button type="button" className="exec-fleet-btn" onClick={() => setSource("fleet")}>Use the fleet read</button>
                    </>
                  }
                />
              ) : (
                <>
                  {dataset.last && dataset.last.groups.length > 0 ? (
                    <ul className="exec-fleet-chips" role="list" aria-label="Groups" data-testid="dataset-groups">
                      {dataset.last.groups.map((group) => (
                        <li key={JSON.stringify(group.key)} className="exec-fleet-chip">
                          <span>{groupLabel(group)}: {group.uniqueRowCount}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <FleetDatasetTable
                    rows={datasetRows}
                    hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "fleet" }, params), params)}
                    selectedKey={selection}
                    // `sel` is a 256-character token and a row key may be longer: such a row has no peek (its name still opens the alpha).
                    onOpen={(row) => { if (row.rowKey.length <= SEL_MAX) select(row.rowKey); }}
                    empty={emptyBlock}
                  />
                  <div className="exec-fleet-foot">
                    <span className="exec-fleet-count-line" role="status" aria-live="polite">{countLine}</span>
                    {dataset.nextCursor && !datasetCapped ? (
                      <button type="button" className="exec-fleet-btn" disabled={dataset.loadingMore} title={dataset.loadingMore ? "Loading the next page" : "Load the next page"} onClick={dataset.loadMore}>
                        {dataset.loadingMore ? "Loading" : "Load more"}
                      </button>
                    ) : null}
                    {dataset.nextCursor && datasetCapped ? (
                      <span className="exec-fleet-note">Showing the first {ROW_CAP} rows. Narrow the filters to see the rest.</span>
                    ) : null}
                  </div>
                  {dataset.moreError ? (
                    <p className="exec-fleet-note" role="alert">
                      The next page could not be read ({dataset.moreError}). The rows above are unchanged.{" "}
                      <button type="button" className="exec-fleet-link" onClick={() => setDatasetNonce((n) => n + 1)}>Reload</button>
                    </p>
                  ) : null}
                </>
              )
            ) : read.state.phase === "loading" || read.state.phase === "idle" ? (
              <PanelState status="loading" />
            ) : read.state.phase === "error" ? (
              <PanelState status={read.state.status} reason={read.state.reason} />
            ) : (
              <>
                {boardView ? (
                  <>
                    <p className="exec-fleet-note exec-fleet-board-note" title="Stage counts are for your whole scope. Readiness and days in stage are not published.">
                      Loaded rows only: {visible.length} {visible.length === 1 ? "alpha" : "alphas"}; an alpha in several stages is in each of its lanes
                    </p>
                    {visible.length === 0 ? emptyBlock : (
                      <FleetBoard
                        rows={visible}
                        summary={read.summary}
                        stages={stage}
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

        {selection !== null && !datasetMode ? (
          <FleetDrawer
            alphaId={selection}
            row={selected}
            loading={read.state.phase === "loading"}
            mode={mode}
            onClose={close}
          />
        ) : null}
        {selection !== null && datasetMode ? (
          <FleetDatasetDrawer
            rowKey={selection}
            row={datasetSelected}
            loading={dataset.state.phase === "loading" || dataset.state.phase === "idle"}
            mode={mode}
            onClose={close}
          />
        ) : null}
      </div>
    </div>
  );
}
