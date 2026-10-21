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
  ROW_CAP, SORT_KEYS, branchReasonText, countLine, currenciesOf, degradedBranches, filterRows, parseSort, readDomainFilter, sortRows, toRows, writeSort,
  type DomainFilter, type SortKey,
} from "./listModel";
import { OPTIONAL_COLUMNS, PortfolioTable, UNPUBLISHED, readHidden, writeHidden, type ColumnId } from "./PortfolioTable";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES, FROM_LIST, joinQuery, type PortfolioRoutes } from "./routes";
import { COMPARE_MAX, COMPARE_MIN, IN_PARAM, partitionByCurrency, selectionFrom, withSelection } from "./selection";
import { useRead } from "./useRead";

import "../../css/portfolios.css";
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
  owner: "Owner",
  allocations: "Allocations",
  deployments: "Deployments",
  allocated: "Allocated capital",
  updated: "Last updated",
};

const LOAD_MORE_REASON = "The read publishes no cursor.";
/** What the register does not carry, said once (the ids and reasons are in the line's title). */
const UNPUBLISHED_MEASURES: readonly UnavailableFact[] = [
  { label: "NAV", id: "FE-013" },
  { label: "Net PnL", id: "FE-005", why: "Windowed; needs FE-025" },
  { label: "Return", id: "FE-006", why: "Windowed; methodology is per source" },
  { label: "Drawdown", id: "FE-013", why: "Needs the NAV series" },
  { label: "Concentration", id: "FE-005" },
  { label: "Score", id: "FE-011" },
];
const SORT_RULES: readonly (readonly [string, string])[] = [
  ["Money", "Sorts inside one currency; pick the currency first"],
  ["Rows with no value", "Sort last in both directions"],
  ["Unallocated", "Always last, and not comparable"],
];

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
  const reasonId = useId();
  const permitted = capabilities === undefined || holds(capabilities, { allOf: [V2_NAV_TOKEN.portfolios] });

  const read = useRead(api, permitted, "list", (scoped) => scoped.listPortfolios());
  const envelope = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;

  const { q, sort: sortRaw, ccy } = url.value;
  const domain: DomainFilter | null = readDomainFilter(params.get("domain"));
  const hidden = readHidden(params.get("hide"));
  const compact = params.get("density") === "compact";
  const { sort } = parseSort(sortRaw);
  const picked = selectionFrom(params);
  const selected = useMemo(() => new Set(picked.ids), [picked.ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── rows ─────────────────────────────────────────────────────────── */
  const loaded = useMemo(() => (envelope ? toRows(envelope.items) : []), [envelope]);
  const currencies = useMemo(() => currenciesOf(loaded), [loaded]);
  const filtered = q !== null || domain !== null;
  const visible = useMemo(
    () => sortRows(filterRows(loaded, q, domain), sort, ccy).slice(0, ROW_CAP),
    [loaded, q, domain, sort, ccy],
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
    for (const key of ["q", "domain"]) next.delete(key);
    setParams(next);
  };

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
  const sortFallsBack = sort.key === "allocated" && ccy === null;
  const compareOn = routes.compare !== null;
  const comparable = compareOn && chosen.length >= COMPARE_MIN && chosen.length <= COMPARE_MAX && unknownChosen.length === 0;
  const compareHref = routes.compare === null ? null : withContext(joinQuery(routes.compare, `${IN_PARAM}=${picked.ids.join(",")}&from=${FROM_LIST}`), params);

  const selectionMessage = (() => {
    if (!compareOn) return picked.ids.length === 0 ? COMPARE_OFF_REASON : `${picked.ids.length} selected. ${COMPARE_OFF_REASON}.`;
    if (picked.ids.length === 0) return `Select ${COMPARE_MIN} to ${COMPARE_MAX} portfolios to compare`;
    const head = `${picked.ids.length} selected`;
    if (unknownChosen.length > 0) return `${head}. ${unknownChosen.length === 1 ? "One is" : `${unknownChosen.length} are`} not in the loaded portfolios.`;
    if (partitions.length > 1) {
      return `${head}. Base currencies differ (${partitions.map((p) => p.currency).join(", ")}): Compare lists them apart and never combines them.`;
    }
    return head;
  })();
  const compareWhy = !compareOn ? COMPARE_OFF_REASON : picked.ids.length < COMPARE_MIN ? `Select at least ${COMPARE_MIN} portfolios` : unknownChosen.length > 0 ? "Some selected portfolios are not loaded" : "";

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
          {fresh && fresh.kind !== "ok" ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {envelope ? <span>{envelope.sourceAsOf ? `As of ${formatInstant(envelope.sourceAsOf)}` : "Source time not published"}</span> : null}
        </div>
      </header>

      <NotAvailableLine facts={UNPUBLISHED_MEASURES} className="exec-pf-na-line" />
      {(incomplete && envelope) || degraded.length > 0 ? (
        <div className="exec-pf-banner" role="status">
          {incomplete && envelope ? (
            <p className="exec-pf-banner-line">
              <Flag kind="partial" label="Partial" size="sm" /> <span>Some portfolios or figures may be missing</span><GapWhy name="Why portfolios or figures may be missing" rows={[`The read is ${humanize(envelope.completeness).toLowerCase()}`]} next={null} />
            </p>
          ) : null}
          {degraded.length > 0 ? (
            <p className="exec-pf-banner-line">
              <Flag kind="partial" label="Branch not whole" size="sm" /> {degraded.map((d, i) => (
                <span key={d.environment} className="exec-pf-branch">
                  {i > 0 ? " · " : ""}{humanize(d.environment)}: {humanize(d.state)}{d.reasonCode ? ` (${branchReasonText(d.reasonCode).text})` : ""}{d.reasonCode ? <GapWhy name={`Reason code for ${humanize(d.environment)}`} rows={[`Reason code: ${d.reasonCode}`]} next={null} /> : null}
                </span>
              ))}
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
                    <option key={key} value={key} disabled={key === "allocated" && ccy === null}>
                      Sort: {SORT_LABEL[key]}{key === "allocated" && ccy === null ? " (pick a currency)" : ""}
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
              <summary className="exec-pf-btn">Columns</summary>
              <div className="exec-pf-menu" role="group" aria-label="Columns">
                <label className="exec-pf-menuitem"><input type="checkbox" checked disabled title="Portfolio is always shown" /> Portfolio</label>
                {OPTIONAL_COLUMNS.filter((c) => UNPUBLISHED[c.id] === undefined).map((c) => (
                  <label key={c.id} className="exec-pf-menuitem">
                    <input type="checkbox" checked={!hidden.has(c.id)} onChange={(event) => toggleColumn(c.id, event.target.checked)} /> {c.label}
                  </label>
                ))}
              </div>
            </details>
            <button type="button" className="exec-pf-btn" aria-pressed={compact} onClick={() => setLocal("density", compact ? null : "compact")}>Compact</button>
            {filtered ? <button type="button" className="exec-pf-btn" onClick={clearFilters}>Clear filters</button> : null}
          </div>

          {sortFallsBack ? (
            <p className="exec-pf-note" role="status" data-testid="sort-fallback">Sorted by name. Pick a currency to sort by allocated capital.</p>
          ) : null}

          <div className="exec-pf-selbar" role="status" aria-live="polite">
            <span>{selectionMessage}</span>
            <span className="exec-pf-spacer" />
            {picked.ids.length > 0 ? <button type="button" className="exec-pf-btn" onClick={clearSelection}>Clear selection</button> : null}
            {comparable && compareHref !== null ? (
              <Link className="exec-pf-link-btn" data-variant="primary" to={compareHref}>Compare {chosen.length}</Link>
            ) : (
              <>
                <button type="button" className="exec-pf-btn" disabled aria-describedby={reasonId}>Compare</button>
                <GapWhy name="Why Compare is off" rows={[compareWhy]} next={null} />
              </>
            )}
          </div>
          <p id={reasonId} className="exec-pf-sr">
            Compare: {compareWhy || "ready"}
          </p>

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
          />

          <div className="exec-pf-foot">
            <span className="exec-pf-count-line" role="status" aria-live="polite">{line ? line.text : null}</span>
            {envelope.truncated ? (
              <button type="button" className="exec-pf-btn" disabled aria-describedby={reasonId}>Load more</button>
            ) : null}
            {envelope.truncated ? <span className="exec-pf-note">{LOAD_MORE_REASON}</span> : null}
            {capped ? <span className="exec-pf-note">Showing the first {ROW_CAP} rows. Narrow the filters to see the rest.</span> : null}
          </div>
          {filtered || envelope.truncated ? (
            <p className="exec-pf-note" title="The read has no server filter: search, domain and sort apply to the loaded portfolios.">Filters cover the {loaded.length} loaded {loaded.length === 1 ? "portfolio" : "portfolios"} only.</p>
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
