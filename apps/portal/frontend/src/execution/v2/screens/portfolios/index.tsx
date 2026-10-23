/**
 * Portfolios, the register (UXM-07 S2, flag key `portfolios`).
 *
 * Reads `GET /portfolios` (execution.portfolio-list.v1) through the
 * ExecutionApi port and prints what it publishes: name, owner, state, domain,
 * the counts, and `allocatedByCurrency` as exact per-currency strings, never
 * added. NAV, Net PnL, Return, Drawdown and Concentration are columns that say
 * `Not published (FE-xxx)`; the Unallocated bucket is a row of the same, and
 * cannot be selected. Search, domain, currency and sort apply to the loaded
 * rows (the read has no query); a truncated read prints `top N / total` and
 * its Load more is off, with the reason (the read has no cursor).
 *
 * Selecting 2 to 4 portfolios writes `in=a,b` to the URL; "Compare N" is a
 * link to the Compare screen with that selection.
 *
 * URL: `q`, `sort` (`key` or `key:desc`), `ccy` (the currency money sorts in),
 * plus the screen-local `domain` (`real`|`simulated`), `hide` (hidden
 * columns), `density` (`compact`) and `in` (the Compare selection). Defaults are omitted.
 *
 * | Cell | Value |
 * |---|---|
 * | Cardinality | hi-fi 7 rows; real 10 to 100 portfolios; the schema caps one read at 100 |
 * | Break point | >200 DOM rows; 12 columns unreadable under 900px |
 * | Degradation | rows capped at 200; cards at or below 660px; columns hideable; truncated read prints `top N / total` |
 * | Server contract | `/portfolios` has `total_portfolios` and `truncated` but no cursor, sort or filter: cursor + `q` + environment-split `allocated_by_currency` are requested |
 * | Invariant | per-currency strings never summed; Real-funded and Simulated never merged (a mixed portfolio is flagged); an unavailable branch is named, not hidden |
 * | Perf budget | one read; at most 200 table rows; 60 interactive elements per screenful |
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { GapWhy, NotAvailableLine, type UnavailableFact } from "../../blocks";
import { Flag } from "../../Flag";
import { holds, V2_NAV_TOKEN } from "../../shell/roleNav";
import { useExecUrlState, withContext } from "../../urlState";
import { freshnessFlag, humanize } from "./format";
import {
  MONEY_SORT_KEYS, ROW_CAP, SORT_KEYS, branchReasonText, countLine, currenciesOf, degradedBranches, filterRows, parseSort, readDomainFilter, sortRows, toRows, writeSort,
  type DomainFilter, type SortKey,
} from "./listModel";
import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import { useManagerDataset } from "../manager/useManagerDataset";
import { PartitionFigures, groupsByPortfolio, publishes, rowCountsByPortfolio, servesDataset } from "./PartitionFigures";
import { EXPORT_REASON } from "./fe";
import { FilterChips, RangeFilters, type FilterChip } from "./RangeFilters";
import { applyServerOrder, groupAsk } from "./serverOrder";
import { RANGES, SCORE_KEYS, SCORE_MISSING, SCORE_STATE_PARAM, readRangeState, rangeText, writeRange, type Range, type RangeId } from "./registerMetrics";
import { OPTIONAL_COLUMNS, PortfolioTable, readHidden, writeHidden, type ColumnId, type PortfolioFigures } from "./PortfolioTable";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES, FROM_LIST, joinQuery, type PortfolioRoutes } from "./routes";
import { COMPARE_MAX, COMPARE_MIN, IN_PARAM, partitionByCurrency, selectionFrom, withSelection } from "./selection";
import { useRead } from "./useRead";

import "../../css/portfolios.css";
import "./register.css";
import { formatInstant } from "../../boundary";

export const PORTFOLIOS_SCREEN_KEY = "portfolios" as const;

export interface PortfolioListScreenProps {
  api: ExecutionApi;
  /**
   * The session's capability list. When given, a caller without
   * `nav:EXECUTION_PORTFOLIOS` (menu token) is told so instead of seeing the register;
   * omitted, the route guard is the only gate (the server refuses regardless).
   */
  capabilities?: ReadonlySet<string>;
  /** Route set; defaults to the registry's canonical routes. */
  routes?: PortfolioRoutes;
}

const SEARCH_DEBOUNCE_MS = 300;

const SORT_LABEL: Readonly<Record<SortKey, string>> = {
  name: "Name",
  owner: "Manager",
  allocations: "Allocations",
  deployments: "Deployments",
  allocated: "Allocated capital",
  updated: "Last updated",
  nav: "Economic capital",
  pnl: "Net PnL",
  ret: "Return",
  dd: "Drawdown",
  hhi: "HHI",
  score: "Portfolio score",
};

const LOAD_MORE_REASON = "The read publishes no cursor.";
/** The score is a column; this line only appears while no portfolio group publishes it (then the column says Not published too). */
const UNPUBLISHED_MEASURES: readonly UnavailableFact[] = [
  { label: "Score", id: "FE-011", why: "Policy not set" },
];
const SORT_RULES: readonly (readonly [string, string])[] = [
  ["Money", "Sorts inside one currency; pick the currency first"],
  ["Numbers", "Compared as exact decimals, never as text or floats"],
  ["Rows with no value", "Sort last in both directions (a missing score is never 0)"],
  ["Several partitions", "A portfolio with figures in more than one economic partition has no single figure until a currency is picked: it sorts and filters as having none"],
  ["Score", "Direct from the portfolio NAV, as published. The band is the spec's band for the published value; the page never computes a score"],
  ["Unallocated", "Always last, and not comparable"],
];
/** Where sort and filter run, said once: the published portfolio read has no query. */
const LOCAL_ORDER_NOTE = "Sort and filters apply to the loaded portfolios and their published group figures. When the server answers the group sort and range filters, the order is the server's and a note says so.";

export function DeniedPortfolios({ routes }: { routes: PortfolioRoutes }) {
  return (
    <div className="exec-pf-v2" data-screen="portfolios-v2">
      <header className="exec-pf-head">
        <h1 className="exec-pf-h1">Portfolios</h1>
      </header>
      <section className="exec-pf-denied" aria-label="Access">
        <PanelState status="denied" reason="Portfolios is not listed in your navigation read." />
        <Link to={routes.access}>See what you can access</Link>
      </section>
    </div>
  );
}

export default function PortfolioListScreen({ api, capabilities, routes = DEFAULT_ROUTES }: PortfolioListScreenProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const searchId = useId();
  const permitted = capabilities === undefined || holds(capabilities, { allOf: [V2_NAV_TOKEN.portfolios] });

  const read = useRead(api, permitted, "list", (scoped) => scoped.listPortfolios());
  const envelope = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;

  // The Manager dataset grouped by portfolio (FLEET, group_by=portfolio_id) for the page's environment and window: Net PnL per
  // economic partition. Groups cover the whole query, so one row is enough to ask. Not served = the column keeps its `Not published`.
  const datasetQuery = useMemo<ManagerDatasetQuery>(
    () => ({ surface: "FLEET", environment: url.value.env, window: url.value.window, groupBy: ["portfolio_id"], limit: 1 }),
    [url.value.env, url.value.window],
  );
  const dataset = useManagerDataset(api, permitted && servesDataset(api), datasetQuery);
  const figures = useMemo<PortfolioFigures | null>(
    () => (dataset.phase === "ready" ? { environment: url.value.env, groups: groupsByPortfolio(dataset.value), rows: rowCountsByPortfolio(dataset.value) } : null),
    [dataset, url.value.env],
  );

  const { q, sort: sortRaw, ccy } = url.value;
  const domain: DomainFilter | null = readDomainFilter(params.get("domain"));
  const hidden = readHidden(params.get("hide"));
  const compact = params.get("density") === "compact";
  // A range in the address is a range, nothing, or INVALID (not decimals, or a minimum above the maximum): an invalid one is said on the page
  // and never read as "no filter" (Codex post-freeze review, change 1).
  const { ranges, invalidRanges } = useMemo(() => {
    const out: Partial<Record<RangeId, Range>> = {};
    const bad: { id: RangeId; label: string; raw: string; reason: string }[] = [];
    for (const spec of RANGES) {
      const state = readRangeState(params.get(spec.param));
      if (state.kind === "range") out[spec.id] = state.range;
      else if (state.kind === "invalid") bad.push({ id: spec.id, label: spec.label, raw: state.raw, reason: state.reason });
    }
    return { ranges: out, invalidRanges: bad };
  }, [params]);
  const scoreMissingOnly = params.get(SCORE_STATE_PARAM) === SCORE_MISSING;
  const { sort } = parseSort(sortRaw);
  const picked = selectionFrom(params);
  const selected = useMemo(() => new Set(picked.ids), [picked.ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── rows ─────────────────────────────────────────────────────────── */
  const loaded = useMemo(() => (envelope ? toRows(envelope.items) : []), [envelope]);
  const currencies = useMemo(() => currenciesOf(loaded), [loaded]);
  const rangeCount = Object.keys(ranges).length + invalidRanges.length + (scoreMissingOnly ? 1 : 0);
  const filtered = q !== null || domain !== null || rangeCount > 0;
  const groups = figures?.groups ?? null;
  // The dataset's own capital statement of the environment (one entry per economic partition): the "Total · NAV" line of the hi-fi, as published.
  const statementList = dataset.phase === "ready" ? dataset.value.capitalStatements : null;
  const scopeNav = statementList !== null && publishes(statementList, "current_nav") ? statementList : null;
  // WP-K slice 6: the server sorts and range-filters the portfolio groups (`group_sort` / `group_filters`). Asked only when it can answer exactly what the register
  // shows (see serverOrder.ts); its answer is trusted for order and membership, never for a figure. Not asked, not served or failed = the local order below.
  const ask = useMemo(() => groupAsk({ sort, ranges, currency: ccy, groups }), [sort, ranges, ccy, groups]);
  const serverQuery = useMemo<ManagerDatasetQuery | null>(() => (ask === null ? null : { ...datasetQuery, ...ask }), [datasetQuery, ask]);
  const serverRead = useManagerDataset(api, permitted && servesDataset(api) && serverQuery !== null, serverQuery);
  const serverIds = useMemo(
    // A body that does not say it applied the group query (a server that predates it) is not used as an order.
    () => (serverRead.phase === "ready" && serverQuery !== null && serverRead.value.groupQuery !== undefined && serverRead.value.groupQuery.groupsReturned === serverRead.value.groups.length ? serverRead.value.groups.flatMap((group) => (group.key[0]?.value ? [group.key[0].value] : [])) : null),
    [serverRead, serverQuery],
  );
  const serverApplied = serverIds !== null && ask !== null;
  const visible = useMemo(() => {
    if (invalidRanges.length > 0) return []; // an invalid range is refused visibly (F1): nothing is filtered by a guess
    if (serverIds !== null && ask !== null) {
      const base = filterRows(loaded, q, domain, { scoreMissing: scoreMissingOnly, currency: ccy, groups });
      const sortedByServer = ask.groupSort.length > 0;
      const ordered = applyServerOrder(base, serverIds, { sorted: sortedByServer, filtered: ask.groupFilters.length > 0, rest: (left) => sortRows(left, sort, ccy, groups) });
      return (sortedByServer ? ordered : sortRows(ordered, sort, ccy, groups)).slice(0, ROW_CAP);
    }
    return sortRows(filterRows(loaded, q, domain, { ranges, scoreMissing: scoreMissingOnly, currency: ccy, groups }), sort, ccy, groups).slice(0, ROW_CAP);
  }, [loaded, q, domain, ranges, invalidRanges, scoreMissingOnly, sort, ccy, groups, serverIds, ask]);
  // Portfolios that hold nothing in the chosen currency (base currency and every allocation are another one): a count of rows, no money added.
  const otherCurrency = useMemo(
    () => (ccy === null ? 0 : loaded.filter((row) => !row.unallocated && row.baseCurrency !== ccy && !row.allocated.some((entry) => entry.currency === ccy)).length),
    [loaded, ccy],
  );
  // A range is offered when the register has a figure to compare: Allocated capital always; the group measures once a group publishes them.
  const scorePublished = groups !== null && [...groups.values()].some((group) => publishes(group, SCORE_KEYS.score));
  const offered = useMemo<readonly RangeId[]>(
    () => RANGES.filter((spec) => spec.source === "allocated" || (groups !== null && [...groups.values()].some((group) => publishes(group, spec.key!)))).map((spec) => spec.id),
    [groups],
  );
  const domainCounts = useMemo(() => ({
    all: loaded.length,
    real: loaded.filter((row) => row.domain === "real" || row.domain === "mixed").length,
    simulated: loaded.filter((row) => row.domain === "simulated" || row.domain === "mixed").length,
  }), [loaded]);

  const chosen = loaded.filter((row) => selected.has(row.portfolioId));
  const unknownChosen = picked.ids.filter((id) => !loaded.some((row) => row.portfolioId === id));
  const partitions = partitionByCurrency(chosen.map((row) => ({ id: row.portfolioId, currency: row.baseCurrency })));

  /* ── url writers ──────────────────────────────────────────────────── */
  const setLocal = (name: "domain" | "hide" | "density", value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(name);
    else next.set(name, value);
    setParams(next, { replace: true });
  };
  const toggleRow = (portfolioId: string, on: boolean) => {
    const ids = on ? [...picked.ids, portfolioId] : picked.ids.filter((id) => id !== portfolioId);
    setParams(withSelection(params, ids.slice(0, COMPARE_MAX)), { replace: true });
  };
  // A header click: another column sorts ascending first; the same column flips.
  const headerSort = (key: SortKey) => url.set({ sort: writeSort({ key, dir: key === sort.key && sort.dir === "asc" ? "desc" : "asc" }) }, { replace: true });
  const clearSelection = () => setParams(withSelection(params, []), { replace: true });
  const toggleColumn = (id: ColumnId, show: boolean) => {
    const next = new Set(hidden);
    if (show) next.delete(id);
    else next.add(id);
    setLocal("hide", writeHidden(next));
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const key of ["q", "domain", SCORE_STATE_PARAM, ...RANGES.map((spec) => spec.param)]) next.delete(key);
    setParams(next);
  };
  const setRange = (id: RangeId, range: Range | null) => {
    const spec = RANGES.find((entry) => entry.id === id)!;
    const next = new URLSearchParams(params);
    if (range === null) next.delete(spec.param);
    else next.set(spec.param, writeRange(range));
    setParams(next, { replace: true });
  };
  const setScoreMissing = (on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set(SCORE_STATE_PARAM, SCORE_MISSING);
    else next.delete(SCORE_STATE_PARAM);
    setParams(next, { replace: true });
  };
  const chips: FilterChip[] = [
    ...(q !== null ? [{ id: "q", text: `Search: ${q}`, clear: () => url.set({ q: null }, { replace: true }) }] : []),
    ...(domain !== null ? [{ id: "domain", text: `Domain: ${domain === "real" ? "Real-funded" : "Simulated"}`, clear: () => setLocal("domain", null) }] : []),
    ...RANGES.flatMap((spec) => (ranges[spec.id] === undefined ? [] : [{ id: spec.id, text: rangeText(spec, ranges[spec.id]!, ccy), clear: () => setRange(spec.id, null) }])),
    ...invalidRanges.map((bad) => ({ id: `${bad.id}-invalid`, text: `${bad.label} ${bad.raw} (invalid range)`, clear: () => setRange(bad.id, null) })),
    ...(scoreMissingOnly ? [{ id: SCORE_STATE_PARAM, text: "Score missing or insufficient evidence", clear: () => setScoreMissing(false) }] : []),
  ];

  // The search box commits after a pause; the URL is the state. The timer calls
  // the newest setter, never the one from the render that started it.
  const [text, setText] = useState(q ?? "");
  const setUrl = useRef(url.set);
  setUrl.current = url.set;
  useEffect(() => setText(q ?? ""), [q]);
  useEffect(() => {
    const next = text.trim() === "" ? null : text.trim();
    if (next === q) return;
    const timer = setTimeout(() => setUrl.current({ q: next }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, q]);

  if (!permitted) return <DeniedPortfolios routes={routes} />;

  /* ── pieces ───────────────────────────────────────────────────────── */
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const incomplete = envelope !== null && envelope.completeness.toUpperCase() !== "COMPLETE";
  const degraded = envelope ? degradedBranches(envelope) : [];
  const line = envelope && read.phase !== "loading" ? countLine(envelope, loaded.length, visible.length, filtered) : null;
  const capped = loaded.length > ROW_CAP;
  // What is on screen out of what was loaded: a filter that narrows says "N of M loaded", never the loaded count alone.
  const narrowed = filtered && visible.length < loaded.length;
  const subCount = envelope
    ? envelope.truncated
      ? narrowed ? `${visible.length} of the top ${loaded.length} / ${envelope.totalPortfolios} portfolios` : `Top ${loaded.length} / ${envelope.totalPortfolios} portfolios`
      : narrowed ? `${visible.length} of ${loaded.length} loaded portfolios` : `${loaded.length} ${loaded.length === 1 ? "portfolio" : "portfolios"}`
    : "";
  // `sort=allocated:*` in the address with no currency: sortRows has nothing to compare, so the order is the name order. Say so.
  const sortFallsBack = MONEY_SORT_KEYS.includes(sort.key) && ccy === null;
  const compareOn = routes.compare !== null;
  const comparable = compareOn && chosen.length >= COMPARE_MIN && chosen.length <= COMPARE_MAX && unknownChosen.length === 0;
  const compareHref = routes.compare === null ? null : withContext(joinQuery(routes.compare, `${IN_PARAM}=${picked.ids.join(",")}&from=${FROM_LIST}`), params);

  const selectionMessage = (() => {
    if (!compareOn) return picked.ids.length === 0 ? COMPARE_OFF_REASON : `${picked.ids.length} selected. ${COMPARE_OFF_REASON}.`;
    if (picked.ids.length === 0) return `Select ${COMPARE_MIN} to ${COMPARE_MAX} portfolios to compare`;
    const head = `${picked.ids.length} selected`;
    if (picked.ids.length < COMPARE_MIN) return `${head}. Select ${COMPARE_MIN} to ${COMPARE_MAX} portfolios to compare`;
    if (unknownChosen.length > 0) return `${head}. ${unknownChosen.length === 1 ? "One is" : `${unknownChosen.length} are`} not in the loaded portfolios.`;
    if (partitions.length > 1) {
      return `${head}. Base currencies differ (${partitions.map((p) => p.currency).join(", ")}): Compare lists them apart and never combines them.`;
    }
    return head;
  })();

  const empty = (() => {
    if (!envelope) return undefined;
    if (!filtered) return <PanelState status="empty" reason="The portfolio read published no portfolios. An empty set is a fact." />;
    return (
      <div className="exec-pf-empty">
        <p>No portfolios match these filters.</p>
        <button type="button" className="exec-pf-btn" onClick={clearFilters}>Clear filters</button>
      </div>
    );
  })();

  return (
    <div className="exec-pf-v2" data-screen="portfolios-v2">
      <header className="exec-pf-head">
        <div>
          <h1 className="exec-pf-h1">Portfolios</h1>
          <p className="exec-pf-sub" id={`${searchId}-sub`}>
            {envelope ? subCount : "Reading the portfolio register"}
          </p>
        </div>
        <div className="exec-pf-fresh">
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {envelope ? <span>{envelope.sourceAsOf ? `As of ${formatInstant(envelope.sourceAsOf)}` : "Source time not published"}</span> : null}
        </div>
      </header>

      {scorePublished ? null : <NotAvailableLine facts={UNPUBLISHED_MEASURES} className="exec-pf-na-line" />}
      {(incomplete && envelope) || degraded.length > 0 ? (
        <div className="exec-pf-banner" role="status">
          {/* One banner: a degraded branch already says what is missing, so the generic partial line is only for a partial read with no named branch. */}
          {incomplete && envelope && degraded.length === 0 ? (
            <p className="exec-pf-banner-line">
              <Flag kind="partial" label="Partial" size="sm" /> <span>Some portfolios or figures may be missing</span><GapWhy name="Why portfolios or figures may be missing" rows={[`The read is ${humanize(envelope.completeness).toLowerCase()}`]} next={null} />
            </p>
          ) : null}
          {degraded.length > 0 ? (
            <p className="exec-pf-banner-line">
              <Flag kind="partial" label="Branch not whole" size="sm" /> {degraded.map((d, i) => (
                <span key={d.environment} className="exec-pf-branch">
                  {i > 0 ? " · " : ""}{humanize(d.environment)}: {humanize(d.state)}{d.reasonCode ? ` (${branchReasonText(d.reasonCode).text})` : ""}
                </span>
              ))}
              {/* One disclosure for the whole banner: each branch's reason code, then the partial read's sentence. */}
              <GapWhy
                name="Why the branch is not whole"
                rows={[...degraded.flatMap((d) => (d.reasonCode ? [`Reason code: ${d.reasonCode}`] : [])), ...(incomplete && envelope ? [`The read is ${humanize(envelope.completeness).toLowerCase()}`] : [])]}
                next={null}
              />
            </p>
          ) : null}
        </div>
      ) : null}

      {read.phase === "loading" && envelope === null ? <PanelState status="loading" /> : null}
      {read.phase === "error" ? <PanelState status={read.status} reason={read.reason} /> : null}

      {envelope ? (
        <section className="exec-pf-panel" aria-label="Portfolio register" data-density={compact ? "compact" : undefined}>
          <div className="exec-pf-tool" role="search">
            <label className="exec-pf-field">
              <span className="exec-pf-sr">Search portfolio or owner</span>
              <input className="exec-pf-input" type="search" placeholder="Search portfolio or owner" value={text} onChange={(event) => setText(event.target.value)} />
            </label>
            <span className="exec-pf-seg" role="group" aria-label="Domain">
              {([["all", "All", null], ["real", "Real-funded", "real"], ["simulated", "Simulated", "simulated"]] as const).map(([id, label, value]) => (
                <button key={id} type="button" className="exec-pf-segbtn" aria-pressed={domain === value} onClick={() => setLocal("domain", value)}>
                  {label}<span className="exec-pf-count">{domainCounts[id]}</span>
                </button>
              ))}
            </span>
            <label className="exec-pf-field">
              <span className="exec-pf-sr">Currency for money</span>
              <select className="exec-pf-select" value={ccy ?? ""} onChange={(event) => url.set({ ccy: event.target.value === "" ? null : event.target.value }, { replace: true })}>
                <option value="">Currency: any</option>
                {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
                {ccy !== null && !currencies.includes(ccy) ? <option value={ccy}>{ccy}</option> : null}
              </select>
            </label>
            {/* Above 660px the column heads sort (th.s); the cards below it have no head row, so these stay for them. */}
            <span className="exec-pf-sortset">
              <label className="exec-pf-field">
                <span className="exec-pf-sr">Sort by</span>
                <select
                  className="exec-pf-select"
                  value={sort.key}
                  onChange={(event) => url.set({ sort: writeSort({ key: event.target.value as SortKey, dir: sort.dir }) }, { replace: true })}
                >
                  {SORT_KEYS.map((key) => (
                    <option key={key} value={key} disabled={MONEY_SORT_KEYS.includes(key) && ccy === null}>
                      Sort: {SORT_LABEL[key]}{MONEY_SORT_KEYS.includes(key) && ccy === null ? " (pick a currency)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="exec-pf-btn" aria-label={`Sort direction: ${sort.dir === "asc" ? "ascending" : "descending"}`} onClick={() => url.set({ sort: writeSort({ key: sort.key, dir: sort.dir === "asc" ? "desc" : "asc" }) }, { replace: true })}>
                {sort.dir === "asc" ? "Ascending" : "Descending"}
              </button>
            </span>
            <span className="exec-pf-spacer" />
            <details className="exec-pf-pop">
              <summary className="exec-pf-btn">Filters{rangeCount > 0 ? ` (${rangeCount})` : ""}</summary>
              <RangeFilters ranges={ranges} scoreMissing={scoreMissingOnly} currency={ccy} windowLabel={url.value.window} offered={offered} onRange={setRange} onScoreMissing={setScoreMissing} />
            </details>
            <details className="exec-pf-pop">
              <summary className="exec-pf-btn">Columns</summary>
              <div className="exec-pf-menu" role="group" aria-label="Columns">
                <label className="exec-pf-menuitem"><input type="checkbox" checked disabled title="Portfolio is always shown" /> Portfolio</label>
                {OPTIONAL_COLUMNS.map((c) => (
                  <label key={c.id} className="exec-pf-menuitem">
                    <input type="checkbox" checked={!hidden.has(c.id)} onChange={(event) => toggleColumn(c.id, event.target.checked)} /> <span title={c.hint}>{c.label}</span>
                  </label>
                ))}
              </div>
            </details>
            <button type="button" className="exec-pf-btn" aria-pressed={compact} onClick={() => setLocal("density", compact ? null : "compact")}>Compact</button>
            <span className="exec-pf-exportline" data-testid="export-line">
              <GapWhy className="exec-blk-np-word" gap="D20" text="Export: not available yet" name="Export: not available yet, reason" rows={[EXPORT_REASON]} next={null} />
              {" · "}<Link to={withContext(routes.access, params)}>My access</Link>
            </span>
          </div>
          <FilterChips chips={chips} onClearAll={clearFilters} />
          {invalidRanges.length > 0 ? (
            <div className="exec-pf-banner" role="alert" data-testid="invalid-range">
              {invalidRanges.map((bad) => (
                <p key={bad.id} className="exec-pf-banner-line">
                  <Flag kind="attention" label="Invalid range" size="sm" /> <span>{bad.label} {bad.raw}: {bad.reason}. No portfolio is shown until it is corrected or cleared.</span>{" "}
                  <button type="button" className="exec-pf-btn" onClick={() => setRange(bad.id, null)}>Clear {bad.label}</button>
                </p>
              ))}
            </div>
          ) : null}
          <p className="exec-pf-basis" data-testid="basis-text">
            Basis: {url.value.env === "live" ? "Real-funded" : url.value.env === "paper" ? "Paper" : "Sandbox"} · one economic partition per figure, one currency each, never summed · Net PnL, Return, Drawdown and Score follow the {url.value.window === "ALL" ? "ALL window (not published yet)" : `${url.value.window} window`}; Economic capital and Allocated capital are current.
          </p>

          {sortFallsBack ? (
            <p className="exec-pf-note" role="status" data-testid="sort-fallback">Sorted by name. Pick a currency to sort by {SORT_LABEL[sort.key].toLowerCase()}.</p>
          ) : null}

          <div className="exec-pf-selbar" role="status" aria-live="polite">
            <span>{selectionMessage}</span>
            <span className="exec-pf-spacer" />
            {picked.ids.length > 0 ? <button type="button" className="exec-pf-btn" onClick={clearSelection}>Clear selection</button> : null}
            {comparable && compareHref !== null ? <Link className="exec-pf-link-btn" data-variant="primary" to={compareHref}>Compare {chosen.length}</Link> : null}
          </div>

          <PortfolioTable
            rows={visible}
            hidden={hidden}
            routes={routes}
            search={params}
            selected={selected}
            onToggle={toggleRow}
            empty={empty}
            sort={sort}
            onSort={headerSort}
            currency={ccy}
            windowLabel={url.value.window}
            figures={figures}
          />

          {scopeNav !== null ? (
            <div className="exec-pf-total" role="group" aria-label="Scope statement" data-testid="scope-total">
              <span className="exec-pf-dim" title="The Manager's own statement for this environment, before the table filters: one line per economic partition, partitions stay apart. The rows above are separate figures.">Scope statement · Economic capital · {url.value.env === "live" ? "Real-funded" : url.value.env === "paper" ? "Paper" : "Sandbox"}</span>
              <PartitionFigures list={scopeNav} metricKey="current_nav" />
            </div>
          ) : null}

          <div className="exec-pf-foot">
            <span className="exec-pf-count-line" role="status" aria-live="polite">{line ? line.text : null}</span>
            {otherCurrency > 0 ? <span className="exec-pf-note" data-testid="other-currency">{otherCurrency} {otherCurrency === 1 ? "portfolio" : "portfolios"} in another currency · pick "Currency: any" to see {otherCurrency === 1 ? "it" : "them"}</span> : null}
            {envelope.truncated ? <span className="exec-pf-note">{LOAD_MORE_REASON}</span> : null}
            {capped ? <span className="exec-pf-note">Showing the first {ROW_CAP} rows. Narrow the filters to see the rest.</span> : null}
          </div>
          {serverApplied ? (
            <p className="exec-pf-note" data-testid="server-order-note" role="status">
              {serverRead.phase === "ready" && serverRead.value.groupQuery
                ? `Ordered and filtered on the server by the published group figure (${serverRead.value.groupQuery.partitionBasis === "PINNED_PARTITION" ? `the ${ccy} partition` : "each portfolio's only partition"}): ${serverRead.value.groupQuery.groupsReturned} of ${serverRead.value.groupQuery.groupsBeforeFilter} portfolio groups. A portfolio with no figure sorts last.`
                : null}
            </p>
          ) : null}
          {filtered || envelope.truncated ? (
            <p className="exec-pf-note" title={LOCAL_ORDER_NOTE}>Filters cover the {loaded.length} loaded {loaded.length === 1 ? "portfolio" : "portfolios"} only.</p>
          ) : null}

          <details className="exec-pf-rules">
            <summary>Sort and basis rules</summary>
            <table className="exec-pf-rules-table">
              <tbody>
                {SORT_RULES.map(([term, rule]) => (
                  <tr key={term}><th scope="row">{term}</th><td>{rule}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      ) : null}
    </div>
  );
}
