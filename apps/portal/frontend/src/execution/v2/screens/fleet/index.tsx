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
 * All lens (FE-CAT-3): when the Manager dataset answers `environment=ALL` (the authorized rows of every environment, each labelled, with
 * per-environment coverage and no combined money) the All lens, and a stage selection across environments, read it like any other
 * dataset view, with an Environment column and one strip that types every environment (included with its own count, or Not available
 * with the reason). When the dataset does not answer ALL the All lens is today's fleet read, with its typed absences: never faked.
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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { useDockMode, useDockSelection } from "../../Drawer";
import { GapWhy, Kpi, KpiStrip } from "../../blocks";
import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { isV2Screen } from "../../flags";
import { FleetStreamChip } from "../../fleetStream/FleetStreamChip";
import type { FleetSessionDeps } from "../../fleetStream/fleetStreamSession";
import { withOrigin } from "../../backTo";
import { serializeUrlParams, useExecUrlState, withContext } from "../../urlState";
import { MANAGER_STATEMENT_SCOPE } from "../../readers/managerDataset";
import { ColumnsMenu, FilterChips, MultiPick, type FilterChip } from "./fleetControls";
import { OptionFilter } from "./OptionFilter";
import { FleetBoard } from "./FleetBoard";
import { FleetDatasetBoard } from "./FleetDatasetBoard";
import { FleetDatasetDrawer } from "./FleetDatasetDrawer";
import { FleetDatasetTable } from "./FleetDatasetTable";
import { FleetEnvironmentCoverage } from "./FleetEnvironmentCoverage";
import { BasisSelect, DatasetColumnsMenu, DensityToggle, EquityScalarSelect, EvidenceSelect, RangeFilter, rangeText } from "./FleetMetricControls";
import {
  BASIS_PARAM, DATASET_COLUMNS, OPTIONAL_SHOWN_PARAM, askableSorts, basisOf, basisOptions, relabelBasis, cycleSort, equityScalarOf, evidenceOf, parseRanges, parseShownOptional, parseSorts,
  serializeRanges, serializeShownOptional, serializeSorts, EVIDENCE_FILTERS, type BasisOption,
} from "./fleetMetricsModel";
import { useFleetSparks } from "./useFleetSparks";
import { FleetMap } from "./FleetMap";
import { FleetDrawer } from "./FleetDrawer";
import { FleetTable } from "./FleetTable";
import {
  FE_STAGE_ENTRY, datasetCountLine, datasetGroupOptions, datasetKey, datasetQuery, datasetScopeOf, datasetSortOptions, groupFieldOf,
  groupLabel, healthWord, moneyProvenanceRows, parseHealths, serializeHealths, type DatasetFilters,
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
import "./fleetMetrics.css";
import { formatInstant } from "../../boundary";

export const FLEET_SCREEN_KEY = "fleet" as const;

/**
 * The dark flag key of the Fleet realtime STREAM (ELP2-09, FIXTURE_LAB evidence only). OFF unless the manifest names `fleet-stream`
 * (and, as for every key, the umbrella is on). With it off nothing below mounts and no request is made: the DOM is the one the screen
 * had before the key existed.
 */
const FLEET_STREAM_FLAG = isV2Screen("fleet-stream");

export interface FleetScreenProps {
  api: ExecutionApi;
  /** Accepted for the mount contract; `GET /alphas` takes no workspace parameter and the server scopes it. */
  workspaceId?: string;
  /** Tests only: override the build-time `fleet-stream` key. */
  streamFlag?: boolean;
  /** Tests only: the fetch, timers and clock the stream uses. Stable identity. */
  streamDeps?: FleetSessionDeps;
}

const SEARCH_DEBOUNCE_MS = 300;
/** The URL codec's bound for `sel` (urlState `token(256)`). */
const SEL_MAX = 256;

/** A dataset time inside 1970-01-01 is the zero value of an unset field, not a moment: it prints as "Source time not published", never "As of 1970-01-01". */
const EPOCH_DAY_MS = 86_400_000;

function freshnessFlag(freshness: string): { kind: FlagKind; label: string } {
  switch (freshness) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "STALE": return { kind: "stale", label: "Stale" };
    default: return { kind: "unknown", label: humanize(freshness) };
  }
}

const COUNTS_SOURCE_TITLE = "The figures above and the tab counts are the fleet read:one count per alpha over everything you may see, not narrowed by the lens or the filters. The table is the Manager dataset: one row per alpha version in a portfolio, in the lens's environment.";

const DATASET_COLUMNS_OPTIONAL: ReadonlySet<string> = new Set(DATASET_COLUMNS.filter((column) => column.optional).map((column) => column.key));
/** A sort field in the words of its column. */
const sortLabel = (field: string): string => (field === "return_30d_pct" ? "Return 30D" : DATASET_COLUMNS.find((column) => column.sortField === field)?.label ?? field);

const NOT_PUBLISHED_LIST = [FE.group, FE.map, FE.window, FE.readiness, FE.compare, FE.archived];

function mergeSeen(current: readonly string[], next: readonly string[]): readonly string[] {
  const merged = [...new Set([...current, ...next])].sort((a, b) => a.localeCompare(b));
  return merged.length === current.length ? current : merged;
}

/** Why a dataset-only note exists: the contract's own constants, in words (never re-derived). */
const STAGE_RULE_SENTENCE = "Current stage is the single active stage of the alpha version in this environment; a row with several active stages has none, and the stage entry time is not published";

export default function FleetScreen({ api, workspaceId, streamFlag = FLEET_STREAM_FLAG, streamDeps }: FleetScreenProps) {
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
  // The Map reads the same dataset rows as the table (its tile size is the published allocation), so it is a dataset view too.
  const waitingForDataset = !forceFleet && scope !== null && (tableView || mapView || boardView) && publication.phase === "checking";
  const datasetMode = published && !forceFleet && (tableView || mapView || boardView);
  // The map and the board have their own switches and lanes: the table-only controls (group, ranges scalar, density, columns, compare, export) stay with the table.
  const gridless = mapView || boardView;
  const offered = publication.phase === "published" ? publication.dataset.queryOptions : null;
  const sortOptions = useMemo(() => datasetSortOptions(offered === null ? null : offered.sortFields), [offered]);
  const groupOptions = useMemo(() => datasetGroupOptions(offered === null ? null : offered.groupFields), [offered]);
  const healths = useMemo(() => parseHealths(params.get("health")), [params]);
  // Alpha Fleet metrics (guide M03 8.2). Every one is a screen-local URL param, so a link reproduces the view; defaults leave the URL clean.
  const sorts = useMemo(() => parseSorts(params.get("sorts") ?? sort), [params, sort]);
  const ranges = useMemo(() => parseRanges(params.get("rng")), [params]);
  const basisId = params.get(BASIS_PARAM);
  const portfolios = useMemo(() => parseHealths(params.get("portfolio")), [params]);
  const venues = useMemo(() => parseHealths(params.get("venue")), [params]);
  const sources = useMemo(() => parseHealths(params.get("source")), [params]);
  const version = params.get("version")?.trim() || null;
  const lifecycleFilter = params.get("lifecycle")?.trim() || null;
  const evidence = evidenceOf(params.get("evidence"));
  const equityScalar = equityScalarOf(params.get("eq")).id;
  const compact = params.get("density") === "compact";
  const hiddenDataset = useMemo(() => new Set((params.get("dhide") ?? "").split(",").map((part) => part.trim()).filter(Boolean)), [params]);
  const shownOptional = useMemo(() => parseShownOptional(params.get(OPTIONAL_SHOWN_PARAM)), [params]);
  // The partitions the loaded rows publish (kept while filtering): the Basis choices, and the partition a money order or range pins.
  const [seenBasis, setSeenBasis] = useState<readonly BasisOption[]>([]);
  const basis = useMemo(() => basisOf(basisId, seenBasis), [basisId, seenBasis]);
  const datasetFilters = useMemo<DatasetFilters | null>(() => {
    if (scope === null) return null;
    const field = boardView && groupOptions.some((option) => option.field === "stage_presence") ? "stage_presence" as const : groupFieldOf(params.get("group"));
    const group = field !== null && groupOptions.some((option) => option.field === field) ? field : null;
    const second = groupFieldOf(params.get("then"));
    return {
      scope, q, owner, healths, sort: sort,
      group,
      then: group !== null && second !== null && second !== group && groupOptions.some((option) => option.field === second) ? second : null,
      sorts, ranges, basis, portfolios, venues, sources, version, lifecycle: lifecycleFilter, evidence,
      ...(workspaceId ? { workspaceId } : {}),
    };
  }, [scope, q, owner, healths, sort, params, groupOptions, boardView, workspaceId, sorts, ranges, basis, portfolios, venues, sources, version, lifecycleFilter, evidence]);
  const offeredSorts = offered === null ? null : offered.sortFields;
  const [datasetNonce, setDatasetNonce] = useState(0);
  const dataset = useFleetDataset(
    api,
    datasetMode && datasetFilters !== null,
    `${datasetFilters === null ? "" : datasetKey(datasetFilters, offeredSorts)}|${datasetNonce}`,
    // Only called while enabled, and enabled needs the filters.
    (after) => datasetQuery(datasetFilters as DatasetFilters, offeredSorts, after),
  );

  // The stream's way to re-read the table: first page, in place, and the lineage it carries (`null`: it did not succeed).
  const refreshDataset = dataset.refresh;
  const refreshLineage = useCallback((signal: AbortSignal) => refreshDataset(signal).then((next) => (next === null ? null : next.lineage.revision)), [refreshDataset]);
  const afterAccessEnded = useCallback(() => void refreshDataset(), [refreshDataset]);
  // The Fleet STREAM is one environment's (ELP2-09); the ALL read has no single stream to follow.
  const allMode = datasetMode && scope !== null && scope.environment === "ALL";
  const streamOn = streamFlag && datasetMode && scope !== null && scope.environment !== "ALL";

  const read = useFleetRead(api, !archived && (tableView || boardView) && !datasetMode && !waitingForDataset, key, (after) => fleetQuery(filters, after));
  // The counts' own read: one row, no filter, only while the dataset is the table's source (the fleet read above is then not made). Its
  // summary is the whole authorized scope whatever the lens or the filters; a failed read leaves the strip with typed absences.
  const countsRead = useFleetRead(api, datasetMode, "counts", () => ({ limit: 1 }));

  /* ── derived rows ─────────────────────────────────────────────────── */
  const loaded = useMemo(() => read.items.map(toFleetRow), [read.items]);
  const visible = useMemo(() => loaded.filter((row) => inStages(row, stage)).slice(0, ROW_CAP), [loaded, stage]);
  const datasetRows = useMemo(() => dataset.rows.slice(0, ROW_CAP), [dataset.rows]);
  // Rows per stage over the whole filtered query, from the server's stage_presence groups (board lanes state their total, never 0 for "not loaded").
  const laneTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const group of dataset.last === null ? [] : dataset.last.groups) {
      const part = group.key.length === 1 ? group.key[0]! : null;
      // A group is a stage COMBINATION ("CANARY,LIVE" is one alpha in both): a lane counts every group whose key contains it, the same membership the cards of the lane use (never "10 of 9").
      if (part !== null && part.field === "stage_presence" && part.value !== null) for (const lane of part.value.split(",")) out[lane] = (out[lane] ?? 0) + group.uniqueRowCount;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  }, [dataset.last]);
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
  const probed = publication.phase === "published" ? publication.dataset : null;
  useEffect(() => {
    const options = basisOptions([...dataset.rows, ...(probed === null ? [] : probed.items)]);
    setSeenBasis((current) => {
      const merged = [...current, ...options.filter((option) => !current.some((entry) => entry.id === option.id))];
      return merged.length === current.length ? current : relabelBasis(merged);
    });
  }, [dataset.rows, probed]);
  // The loaded rows' portfolios, venues and source states: honest "loaded so far" choices (the server filters on the typed value either way).
  const [seenFacets, setSeenFacets] = useState<{ portfolio: readonly string[]; venue: readonly string[]; source: readonly string[]; lifecycle: readonly string[] }>({ portfolio: [], venue: [], source: [], lifecycle: [] });
  useEffect(() => {
    setSeenFacets((c) => {
      const next = {
        portfolio: mergeSeen(c.portfolio, dataset.rows.map((r) => r.portfolioId)),
        venue: mergeSeen(c.venue, dataset.rows.flatMap((r) => (r.venue ? [r.venue] : []))),
        source: mergeSeen(c.source, dataset.rows.flatMap((r) => (r.sourceState ? [r.sourceState] : []))),
        lifecycle: mergeSeen(c.lifecycle, dataset.rows.flatMap((r) => (r.lifecycle ? [r.lifecycle] : []))),
      };
      // Same lists: the same object, so nothing re-renders for a page that taught us nothing new.
      return next.portfolio === c.portfolio && next.venue === c.venue && next.source === c.source && next.lifecycle === c.lifecycle ? c : next;
    });
  }, [dataset.rows]);
  const offeredFields = offered === null ? null : offered.sortFields;
  const askable = useMemo(() => askableSorts(sorts, offeredFields, basis !== null), [sorts, offeredFields, basis]);
  const sparks = useFleetSparks(api, datasetMode && tableView, datasetRows, scope === null ? "ALL" : scope.environment, workspaceId, dataset.first === null ? null : dataset.first.lineage.revision);
  const selectionReasonId = useId();
  const mapReasonId = useId();
  const exportReasonId = useId();
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
  const setLocal = (name: "owner" | "health" | "group" | "then", value: string) => {
    const next = new URLSearchParams(params);
    if (value === "") next.delete(name);
    else next.set(name, value);
    // The second level follows the first: no first level, or the same field, leaves no second.
    if (name === "group" && (value === "" || value === next.get("then"))) next.delete("then");
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
      params2.delete("then");
      // The fleet read filters one health at a time: one word stays, a list (the dataset's IN) is dropped, not cut to its first word.
      const words = parseHealths(params.get("health"));
      if (words.length === 1) params2.set("health", words[0]!);
      else params2.delete("health");
    }
    setParams(params2, { replace: true });
  };
  /** Several screen-local params at once; a null or empty value removes the param. A new view drops the open peek. */
  const setMany = (updates: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(name);
      else next.set(name, value);
    }
    next.delete("sel");
    setParams(next, { replace: true });
  };
  const setSorts = (keys: readonly import("./fleetMetricsModel").SortKey[]) => setMany({ sorts: serializeSorts(keys), sort: null });
  const setDatasetColumn = (key: string, shown: boolean) => {
    const optional = DATASET_COLUMNS_OPTIONAL.has(key);
    if (optional) {
      const next = new Set(shownOptional);
      if (shown) next.add(key); else next.delete(key);
      setMany({ [OPTIONAL_SHOWN_PARAM]: serializeShownOptional(next) });
    } else {
      const next = new Set(hiddenDataset);
      if (shown) next.delete(key); else next.add(key);
      setMany({ dhide: next.size === 0 ? null : [...next].sort().join(",") });
    }
  };
  const [versionText, setVersionText] = useState(version ?? "");
  useEffect(() => setVersionText(version ?? ""), [version]);
  const pickLens = (next: FleetLens) =>
    url.set({ stage: stagesForLens(next), tab: next === "archived" ? ARCHIVED_TAB : null, sel: null });
  const clearFilters = () => {
    const next = serializeUrlParams({ q: null, stage: [], tab: null, sel: null }, params);
    next.delete("owner");
    next.delete("health");
    for (const name of ["rng", "basis", "portfolio", "venue", "source", "version", "lifecycle", "evidence"]) next.delete(name);
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

  const metricFiltered = ranges.length > 0 || portfolios.length > 0 || venues.length > 0 || sources.length > 0 || version !== null || lifecycleFilter !== null || evidence !== null;
  const filtered = q !== null || owner !== null || health !== null || stage.length > 0 || (datasetMode && metricFiltered);
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
  if (datasetMode) {
    if (portfolios.length > 0) chips.push({ id: "portfolio", name: "portfolio", value: portfolios.join(", "), clear: () => setMany({ portfolio: null }) });
    if (venues.length > 0) chips.push({ id: "venue", name: "venue", value: venues.join(", "), clear: () => setMany({ venue: null }) });
    if (sources.length > 0) chips.push({ id: "source", name: "source", value: sources.map(humanize).join(", "), clear: () => setMany({ source: null }) });
    if (version !== null) chips.push({ id: "version", name: "version", value: version, clear: () => setMany({ version: null }) });
    if (lifecycleFilter !== null) chips.push({ id: "lifecycle", name: "lifecycle", value: humanize(lifecycleFilter), clear: () => setMany({ lifecycle: null }) });
    if (evidence !== null) chips.push({ id: "evidence", name: "evidence", value: EVIDENCE_FILTERS.find((entry) => entry.id === evidence)!.label, clear: () => setMany({ evidence: null }) });
    for (const range of ranges) {
      chips.push({ id: `range-${range.field}`, name: "range", value: rangeText(range, basis === null ? null : basis.label),
        clear: () => setMany({ rng: serializeRanges(ranges.filter((entry) => entry.field !== range.field)) }) });
    }
    if (basis !== null) chips.push({ id: "basis", name: "basis", value: basis.label, clear: () => setMany({ basis: null }) });
  }
  if (q !== null) chips.push({ id: "q", name: "search", value: q, clear: () => url.set({ q: null, sel: null }, { replace: true }) });
  const urlText = params.toString() === "" ? "No parameters" : `?${decodeURIComponent(params.toString().replace(/\+/g, " "))}`;
  const customStage = lens === null;
  // The words that name the table's population in the counts line: the lens, or the stages when the URL names a set that is no lens.
  const scopeWords = lens !== null && lens !== "all" ? lensLabel(lens) : stage.length === 0 ? "all environments, each separate" : stage.map((s) => stageLabel(s)).join(", ");
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
  // FE-CAT-7: where the money cells come from (partition, basis, profile, coverage), from the loaded rows' own published facts.
  const moneyLines = useMemo(
    () => (datasetMode ? moneyProvenanceRows(datasetRows, dataset.first === null ? null : dataset.first.queryOptions.metricKeys) : []),
    [datasetMode, datasetRows, dataset.first],
  );
  const datasetCount = datasetMode && dataset.state.phase === "ready"
    ? datasetCountLine(datasetRows.length, dataset.rows.length, dataset.total, dataset.nextCursor !== null, datasetCapped)
    : null;
  const datasetNote = (() => {
    const first = dataset.first;
    if (!datasetMode || first === null) return null;
    const scopeSentence = first.statementScope === MANAGER_STATEMENT_SCOPE
      ? "Counts and groups cover the whole filtered result, not only the loaded rows; capital statements, which this screen does not show, are taken before the table filters."
      : "";
    const where = first.environment === "ALL" ? "all environments, each row in its own environment and partition, no figure combined across them" : first.environment;
    return `Source: the Manager dataset, ${where}. One row is an alpha version in a portfolio${first.environment === "ALL" ? " in one environment" : ""}. ${STAGE_RULE_SENTENCE}. ${scopeSentence}`.trim();
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
    if (archived || (mapView && !datasetMode) || waitingForDataset) return null;
    if (datasetMode) {
      return (
        <span className="exec-fleet-source" role="status" data-source="dataset" title={datasetNote ?? "One row per alpha version in a portfolio, filtered and grouped by the server"}>
          Manager dataset · alpha versions{allMode ? " · all environments" : ""}
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
      if (q === null && owner === null && health === null && !metricFiltered) return <PanelState status="empty" reason="The Manager dataset published no rows for this view." />;
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

  // Group by is a control only when the dataset can group; otherwise the gap is one word on this line, not a disabled select.
  const canGroup = datasetMode && groupOptions.some((option) => option.field !== null);
  const unpublishedList = datasetMode ? [...(canGroup ? [] : [FE.group]), FE.window, FE.readiness, ...(dataset.first?.stageTimingPublished === true ? [] : [FE_STAGE_ENTRY]), FE.compare, FE.archived] : NOT_PUBLISHED_LIST;
  const unpublishedView = (fact: { fe: string; what: string }) => (
    <div className="exec-fleet-nppanel" role="status">
      <strong>{fact.what}</strong>
      <p>{notPublished(fact)}</p>
    </div>
  );

  return (
    <div className={compact && datasetMode ? "exec-fleet-v2 exec-fleet-compact" : "exec-fleet-v2"} data-screen="alpha-fleet-v2">
      <header className="exec-fleet-head">
        <div>
          <h1 className="exec-fleet-title">Alpha Fleet</h1>
        </div>
        <div className="exec-fleet-fresh">
          <span className="exec-fleet-seg" role="group" aria-label="View">
            <button type="button" className="exec-fleet-segbtn" aria-pressed={tableView} onClick={() => url.set({ view: null })}>Table</button>
            <button type="button" className="exec-fleet-segbtn" aria-pressed={boardView} onClick={() => url.set({ view: "board" })}>Board</button>
            {/* The Map exists only where the Manager dataset is the source: its tiles are sized by the published allocation. A control that cannot work stays out (DEBT-048). */}
            {published && !forceFleet
              ? <button type="button" className="exec-fleet-segbtn" aria-pressed={mapView} onClick={() => url.set({ view: "map" })}>Map</button>
              : <button type="button" className="exec-fleet-segbtn" aria-pressed="false" disabled aria-describedby={mapReasonId} title={notPublished(FE.map)}>Map</button>}
            <span id={mapReasonId} className="exec-fleet-sr">{notPublished(FE.map)}: the Map reads the Manager dataset, which is not published here.</span>
          </span>
          {sourceChip}
          {streamOn && scope !== null ? (
            <FleetStreamChip
              key={`${scope.environment}|${workspaceId ?? "-"}`}
              scope={{ environment: scope.environment as "paper" | "sandbox" | "live", workspaceId: workspaceId ?? null }}
              lineage={dataset.first === null ? null : dataset.first.lineage.revision}
              refresh={refreshLineage}
              onAccessEnded={afterAccessEnded}
              deps={streamDeps}
            />
          ) : null}
          {datasetMode ? (
            <>
              {dataset.first && dataset.first.quality.freshness !== "FRESH" ? <Flag kind={dataset.first.quality.freshness === "STALE" ? "stale" : "unknown"} label={humanize(dataset.first.quality.freshness)} size="sm" /> : null}
              {dataset.first ? <span>{dataset.first.asOfMs < EPOCH_DAY_MS ? "Source time not published" : `As of ${formatInstant(dataset.first.asOfMs)}`}</span> : null}
            </>
          ) : (
            <>
              {fresh && fresh.kind !== "ok" ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
              {envelope ? (
                <span>
                  {envelope.sourceAsOf ? `As of ${formatInstant(envelope.sourceAsOf)}` : "Source time not published"}
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
          </span>
          {dataset.first.quality.reasons.length > 0 ? <GapWhy name="Why rows or counts may be missing or old" rows={dataset.first.quality.reasons} next={null} /> : null}
        </div>
      ) : null}

      {!datasetMode && incomplete && envelope ? (
        <div className="exec-fleet-banner" role="status">
          <Flag kind="partial" label="Partial" size="sm" />
          <span>Some rows or counts may be missing</span><GapWhy name="Why rows or counts may be missing" rows={[`The read is ${humanize(envelope.completeness).toLowerCase()}`]} next={null} />
        </div>
      ) : null}

      {!archived ? (
        <KpiStrip label="Fleet counts" columns={4}>
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
        <p className="exec-fleet-counts-src" data-testid="counts-source" title={countsRead.envelope?.sourceAsOf ? `${COUNTS_SOURCE_TITLE} Counts as of ${formatInstant(countsRead.envelope.sourceAsOf)}.` : COUNTS_SOURCE_TITLE}>
          Counts: Fleet read, alphas in your whole scope. Table: Manager dataset, alpha versions in {scopeWords}.{dataset.total === null || dataset.total === undefined ? "" : ` ${dataset.total} rows match, one per alpha version in a portfolio. Alphas (tabs), deployments (header) and rows (table) are three units: none has to equal another.`}
          <GapWhy name="How these counts relate" next={null} rows={[
            "Alphas, Deployments, Portfolios and the stage tabs are the Fleet read over your whole scope: the unit is an alpha (Deployments: running deployments).",
            "An alpha in two stages is counted in each of its tabs, so the stage tabs do not add up to Alphas, and Real-funded (Canary + Live) is an upper bound.",
            "The environment strip and the table are the Manager dataset: the unit is a row, one alpha version in one portfolio, so rows and alphas differ by design (one alpha in two portfolios is two rows).",
            "Showing N of M counts rows of the table: N loaded, M over the whole filtered query. An environment the dataset does not read says Not available there, whatever the tab counts.",
          ]} />
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
                  title="Tab counts are alphas in that stage over your whole scope (Fleet read); the table counts rows, one per alpha version in a portfolio, so the two can differ. A ~ marks an upper bound."
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

          {archived ? null : <div className="exec-fleet-tool" role="search">
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
                  value={serializeSorts(sorts) ?? ""}
                  title="Stages sort by name, not by risk. A row with no single stage comes last in both directions. Click a column header to add a key."
                  onChange={(event) => setSorts(parseSorts(event.target.value))}
                >
                  {sorts.length > 0 && !sortOptions.some((option) => option.value === serializeSorts(sorts)) ? (
                    <option value={serializeSorts(sorts) ?? ""}>Sort: custom ({sorts.length} {sorts.length === 1 ? "key" : "keys"})</option>
                  ) : null}
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
            {canGroup && !gridless ? (
              <label className="exec-fleet-field">
                <span className="exec-fleet-sr">Group by</span>
                <select
                  className="exec-fleet-select"
                  value={datasetFilters?.group ?? ""}
                  title="Groups cover the whole filtered result"
                  onChange={(event) => setLocal("group", event.target.value)}
                >
                  {groupOptions.map((option) => <option key={option.id} value={option.field ?? ""}>{option.label}</option>)}
                </select>
              </label>
            ) : null}
            {canGroup && !gridless && datasetFilters?.group != null ? (
              <label className="exec-fleet-field">
                <span className="exec-fleet-sr">Then group by</span>
                <select
                  className="exec-fleet-select"
                  value={datasetFilters.then ?? ""}
                  title="A second level inside each group"
                  onChange={(event) => setLocal("then", event.target.value)}
                >
                  <option value="">Then: none</option>
                  {groupOptions.filter((option) => option.field !== null && option.field !== datasetFilters.group).map((option) => <option key={option.id} value={option.field ?? ""}>{option.label.replace("Group:", "Then:")}</option>)}
                </select>
              </label>
            ) : null}
            <span className="exec-fleet-grow" />
            {datasetMode && gridless ? null : datasetMode ? <DatasetColumnsMenu showEnvironment={allMode} hidden={hiddenDataset} shownOptional={shownOptional} onToggle={setDatasetColumn} /> : <ColumnsMenu hidden={hiddenColumns} onToggle={setColumn} />}
          </div>}
          {archived || !datasetMode ? null : (
            <div className="exec-fleet-tool2" role="group" aria-label="Metric filters">
              <MultiPick name="Portfolio" complete={false} options={mergeSeen(seenFacets.portfolio, portfolios).map((value) => ({ value, label: value }))} selected={portfolios} onChange={(next) => setMany({ portfolio: serializeHealths(next) })} />
              <MultiPick name="Venue" complete={false} options={mergeSeen(seenFacets.venue, venues).map((value) => ({ value, label: value }))} selected={venues} onChange={(next) => setMany({ venue: serializeHealths(next) })} />
              <MultiPick name="Source" complete={false} options={mergeSeen(seenFacets.source, sources).map((value) => ({ value, label: humanize(value) }))} selected={sources} onChange={(next) => setMany({ source: serializeHealths(next) })} />
              <div className="exec-fleet-field">
                <OptionFilter
                  name="Lifecycle"
                  value={lifecycleFilter}
                  options={mergeSeen(seenFacets.lifecycle, lifecycleFilter ? [lifecycleFilter] : []).map((value) => ({ value, label: humanize(value) }))}
                  complete={false}
                  limit="These are the lifecycle words of the rows loaded so far. Type a word to filter on the server."
                  onChange={(next) => setMany({ lifecycle: next })}
                />
              </div>
              <label className="exec-fleet-field">
                <span className="exec-fleet-sr">Version</span>
                <input
                  className="exec-fleet-input"
                  type="text"
                  placeholder="Version (exact)"
                  value={versionText}
                  onChange={(event) => setVersionText(event.target.value)}
                  onBlur={() => setMany({ version: versionText.trim() === "" ? null : versionText.trim() })}
                  onKeyDown={(event) => { if (event.key === "Enter") setMany({ version: versionText.trim() === "" ? null : versionText.trim() }); }}
                />
              </label>
              <EvidenceSelect value={evidence} onChange={(next) => setMany({ evidence: next })} />
              <BasisSelect options={seenBasis} value={basis === null ? null : basis.id} onChange={(next) => setMany({ basis: next })} />
              <RangeFilter ranges={ranges} offered={offeredFields} basis={basis} onChange={(next) => setMany({ rng: serializeRanges(next) })} />
              {/* Table-only controls: the map has its own size and colour switches. */}
              {gridless ? null : <EquityScalarSelect value={equityScalar} onChange={(next) => setMany({ eq: next === "value" ? null : next })} />}
              {gridless ? null : <DensityToggle compact={compact} onChange={(next) => setMany({ density: next ? "compact" : null })} />}
            </div>
          )}
          {archived || !datasetMode || gridless ? null : (
            <div className="exec-fleet-sortbar" data-testid="sortbar">
              {sorts.length === 0
                ? <span>Server order. Click a column header to sort; again to reverse; again to remove. Up to three keys, in the order you click them.</span>
                : (
                  <>
                    <span>Sorted by {sorts.map((key, index) => `${sortLabel(key.field)} ${key.dir === "asc" ? "ascending" : "descending"}${sorts.length > 1 ? ` (${index + 1})` : ""}`).join(", then ")}. Empty values go last in both directions.</span>
                    <button type="button" className="exec-fleet-link" onClick={() => setSorts([])}>Clear sort</button>
                  </>
                )}
              {basis === null && seenBasis.length > 0
                ? <span className="exec-fleet-note" data-testid="money-sort-hint">Alloc, PNL, Unrealized, Balance and Equity 30D sort inside one economic partition: choose a Basis to enable their headers.</span>
                : null}
              {askable.unaskable.map(({ key, why }) => <span key={key.field} className="exec-fleet-np">{sortLabel(key.field)} is not applied: {why}</span>)}
              <button type="button" className="exec-fleet-btn" disabled aria-describedby={selectionReasonId}>Compare selected</button>
              <button type="button" className="exec-fleet-btn" disabled aria-describedby={exportReasonId}>Export</button>
              <span id={exportReasonId} className="exec-fleet-note">Export reflects the filter, snapshot, fields, basis and as-of, and is reauthorized when made: Not published (export action).</span>
              <span id={selectionReasonId} className="exec-fleet-note">Select 2 to 4 alphas to compare: {notPublished(FE.compare)}.</span>
            </div>
          )}
          {archived ? null : <FilterChips chips={chips} onClearAll={clearFilters} urlText={urlText} onFocusFallback={() => searchInput.current?.focus()} />}
          {/* Tied to every disabled control by aria-describedby: the visible words are the names, the ids are in the title and the hidden text. The Archived lens has no list to filter, so its panel says the one thing and this line is for assistive tech only. */}
          <p id={reasonId} className={archived ? "exec-fleet-sr" : "exec-fleet-unpub"}>
            Not available: {unpublishedList.map((fact) => fact.what).join(", ")}
            <span className="exec-fleet-sr"> ({unpublishedList.map((fact) => `${fact.what}`).join(", ")})</span>
            {archived ? null : <GapWhy name="Why these are not available" rows={unpublishedList.map((fact) => notPublished(fact))} />}
          </p>
          {datasetNote ? <p className="exec-fleet-sr" data-testid="dataset-note">{datasetNote}</p> : null}
          {limitNote ? <p className="exec-fleet-note exec-fleet-limit" data-testid="options-limit">{limitNote}</p> : null}

          <div role="tabpanel" id={`${searchId}-panel`} aria-labelledby={`${searchId}-tab-${lens ?? "all"}`} className="exec-fleet-panel">
            {archived ? (
              <div className="exec-fleet-nppanel" role="status">
                <strong>Archived alphas</strong>
                <p title="No archived-alpha read is published, so this lens asks for nothing.">
                  <span className="exec-fleet-sr">{notPublished(FE.archived)}</span>
                  <span aria-hidden="true">Not available</span>
                </p>
              </div>
            ) : mapView && !datasetMode ? (
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
                  {allMode && dataset.first && dataset.first.environmentCoverage ? <FleetEnvironmentCoverage coverage={dataset.first.environmentCoverage} /> : null}
                  {moneyLines.length > 0 ? (
                    <p className="exec-fleet-note" data-testid="money-provenance">
                      Money columns: one figure per economic partition, never added across partitions or environments
                      <GapWhy name="Where the money columns come from" rows={moneyLines} next={null} />
                    </p>
                  ) : null}
                  {dataset.last && dataset.last.groups.length > 0 ? (
                    <ul className="exec-fleet-chips" role="list" aria-label="Groups" data-testid="dataset-groups">
                      {dataset.last.groups.map((group) => (
                        <li key={JSON.stringify(group.key)} className="exec-fleet-chip">
                          <span>{groupLabel(group)}: {group.uniqueRowCount}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {dataset.last && dataset.last.groups.length > 0 ? (
                    <p className="exec-fleet-note" data-testid="group-note">
                      Group counts are rows (alpha versions in a portfolio) over the whole filtered result, not the loaded page. A stage group is a membership: an alpha in two stages is in both, so groups are never added into a total.
                    </p>
                  ) : null}
                  {boardView ? (
                    datasetRows.length === 0 ? emptyBlock : (
                      <FleetDatasetBoard
                        rows={datasetRows}
                        stages={stage}
                        metricKeys={dataset.first === null ? null : dataset.first.queryOptions.metricKeys}
                        showEnvironment={allMode}
                        selectedKey={selection}
                        hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "fleet" }, params), params)}
                        onOpen={(row) => { if (row.rowKey.length <= SEL_MAX) select(row.rowKey); }}
                        laneTotals={laneTotals}
                        hasMore={dataset.nextCursor !== null}
                        loadingMore={dataset.loadingMore}
                        onLoadMore={datasetCapped ? undefined : dataset.loadMore}
                      />
                    )
                  ) : mapView ? (
                    datasetRows.length === 0 ? emptyBlock : (
                      <FleetMap
                        rows={datasetRows}
                        metricKeys={dataset.first === null ? null : dataset.first.queryOptions.metricKeys}
                        hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "fleet" }, params), params)}
                        selectedKey={selection}
                        onOpen={(row) => { if (row.rowKey.length <= SEL_MAX) select(row.rowKey); }}
                      />
                    )
                  ) : (
                    <>
                    <p className="exec-fleet-scrollhint" data-testid="scroll-hint">Health, Source and more columns sit to the right: scroll the table sideways (the Alpha column stays).</p>
                    <FleetDatasetTable
                      rows={datasetRows}
                      groupFields={datasetFilters === null ? [] : [datasetFilters.group, datasetFilters.then ?? null].filter((field): field is NonNullable<typeof field> => field !== null)}
                      groups={dataset.last === null ? [] : dataset.last.groups}
                      showEnvironment={allMode}
                      shownOptional={shownOptional}
                      hidden={hiddenDataset}
                      offeredSorts={offeredFields}
                      basisPinned={basis !== null}
                      sorts={sorts}
                      onSort={(field) => setSorts(cycleSort(sorts, field))}
                      equityScalar={equityScalar}
                      sparks={sparks}
                      datasetEnvironment={scope === null ? undefined : scope.environment}
                      selectionReasonId={selectionReasonId}
                      metricKeys={dataset.first === null ? null : dataset.first.queryOptions.metricKeys}
                      hrefFor={(row) => withContext(withOrigin(alphaHref(row.alphaId), { kind: "fleet" }, params), params)}
                      selectedKey={selection}
                      // `sel` is a 256-character token and a row key may be longer: such a row has no peek (its name still opens the alpha).
                      onOpen={(row) => { if (row.rowKey.length <= SEL_MAX) select(row.rowKey); }}
                      empty={emptyBlock}
                    />
                    </>
                  )}
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
                    <p className="exec-fleet-note exec-fleet-board-note">
                      Loaded rows only: {visible.length} {visible.length === 1 ? "alpha" : "alphas"}; an alpha in several stages is in each of its lanes
                      <GapWhy name="Why only loaded rows" rows={["Stage counts are for your whole scope. Readiness and days in stage are not published."]} next={null} />
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
