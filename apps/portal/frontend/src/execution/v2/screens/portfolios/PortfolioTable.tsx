/**
 * The portfolio register table: identity and allocation columns the read publishes, the measures of the Manager dataset's
 * portfolio groups (Economic capital, Net PnL, Return, Drawdown, HHI) and the PORTFOLIO SCORE (direct from the portfolio NAV,
 * published: band, value, evidence, provisional, policy). A measure the groups do not publish keeps its `Not published (FE-xxx)`
 * cell. Every column but Portfolio is hideable from the column chooser.
 *
 * It is a real table above 660px and stacked cards at or below it (CardsTable).
 * Money is a list of exact per-currency strings; there is no total column, and
 * no cell ever prints a dash or a made-up zero.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { CardsTable, type CardsColumn, type CardsSort } from "../../cardsTable";
import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { PF_FE, npText, type Unpublished } from "./fe";
import { PartitionFigures, publishes } from "./PartitionFigures";
import { ScoreList } from "./ScoreCell";
import { SCORE_KEYS } from "./registerMetrics";
import { Absent, MoneyList } from "./format";
import type { PortfolioRow, SortKey } from "./listModel";
import type { PortfolioRoutes } from "./routes";
import { COMPARE_OFF_REASON } from "./routes";
import { COMPARE_MAX } from "./selection";

import "../../css/portfolios.css";
import "./register.css";

export type ColumnId =
  | "owner" | "alphas" | "allocations" | "domain" | "nav" | "allocated"
  | "pnl" | "ret" | "dd" | "hhi" | "score" | "state";

export interface ColumnSpec {
  id: ColumnId;
  label: string;
  numeric?: boolean;
  /** Follows the page window: the header says which one. */
  windowed?: boolean;
  /** Said once in the column chooser (title). */
  hint?: string;
}

/** In display order (the M02 guide row: Manager, Alphas/Dep., Allocations, Domain, Economic capital, Allocated, PnL, Return, DD, HHI, Score, Health). The Portfolio column is always shown and is not listed. */
export const OPTIONAL_COLUMNS: readonly ColumnSpec[] = [
  { id: "owner", label: "Manager" },
  { id: "alphas", label: "Alphas / Dep.", numeric: true, hint: "Alpha rows in the selected environment (published group count) / deployments across all environments" },
  { id: "allocations", label: "Allocations", numeric: true },
  { id: "domain", label: "Domain" },
  { id: "nav", label: "NAV", numeric: true, hint: "Economic capital: the current NAV per economic partition; budget and exposure are other figures" },
  { id: "allocated", label: "Allocated capital", numeric: true },
  { id: "pnl", label: "Net PnL", numeric: true, windowed: true },
  { id: "ret", label: "Return", numeric: true, windowed: true },
  { id: "dd", label: "Drawdown", numeric: true, windowed: true },
  { id: "hhi", label: "Concentration", numeric: true, hint: "HHI, the concentration of allocation, 0 to 1: a diagnostic, not part of the score" },
  { id: "score", label: "Portfolio score", numeric: true, windowed: true, hint: "Direct from the portfolio NAV: 0.45 P + 0.30 R + 0.25 B. Published, never computed here" },
  { id: "state", label: "Health", hint: "The portfolio state the read publishes" },
];

/**
 * Measures the read does not publish. They stay as columns (hi-fi and the "Source not qualified" frame keep every column
 * and print "Not available" in each cell, the request id behind the cell's disclosure). The day a fact is published,
 * delete it from this table and add its `cell` case.
 */
export const UNPUBLISHED: Readonly<Partial<Record<ColumnId, Unpublished>>> = {
  score: PF_FE.score,
  nav: PF_FE.nav,
  pnl: PF_FE.netPnl, // kept only while the Manager dataset (FLEET, group_by portfolio_id) is not served; see `figures`
  ret: PF_FE.ret,
  dd: PF_FE.drawdown,
  hhi: PF_FE.concentration,
};

/**
 * Columns hidden until the reader asks: Domain, which the Domain filter above the table already says, and Allocations and Alphas / Dep.
 * (counts, also on the 360 and in the row's title). Concentration (the HHI) is shown, as in the hi-fi. All are one click away in the column
 * chooser and in the address (`hide=none`).
 */
export const DEFAULT_HIDDEN: readonly ColumnId[] = ["alphas", "allocations", "domain"];

/**
 * Below ~1180px the sidebar leaves the table about 680px: Score and Health must stay in view without an inner scroll (QA6 R1-07), so
 * the lower-priority figures wait in the chooser until the reader asks. The page says which ones, and the address keeps the choice.
 */
export const NARROW_HIDDEN: readonly ColumnId[] = ["alphas", "allocations", "domain", "owner", "allocated", "pnl", "hhi"];

/** Viewport width at or below which the narrow default applies. */
export const NARROW_QUERY = "(min-width: 661px) and (max-width: 1180px)";

/** The `hide` value that means "hide nothing", so a reader can switch the default off. */
export const HIDE_NONE = "none";

/** WP-K (N3): how a published health roll-up class is drawn. */
const HEALTH_FLAG = {
  HEALTHY: { kind: "ok", label: "Healthy" },
  ATTENTION: { kind: "attention", label: "Attention" },
  DEGRADED: { kind: "partial", label: "Degraded" },
  HALTED: { kind: "paused", label: "Halted" },
} as const;

/**
 * The hidden set the address names. An absent `hide` is the default set; a
 * name it does not know is ignored; `none` (or any list with no known name) is
 * every column shown.
 */
export function readHidden(raw: string | null, narrow = false): ReadonlySet<ColumnId> {
  if (raw === null) return new Set(narrow ? NARROW_HIDDEN : DEFAULT_HIDDEN);
  const known = new Set<string>(OPTIONAL_COLUMNS.map((c) => c.id));
  return new Set(raw.split(",").map((p) => p.trim()).filter((p): p is ColumnId => known.has(p)));
}

/** The `hide` value for a hidden set: omitted when it is the default, `none` when empty. */
export function writeHidden(hidden: ReadonlySet<ColumnId>, narrow = false): string | null {
  const ids = OPTIONAL_COLUMNS.filter((c) => hidden.has(c.id)).map((c) => c.id);
  const standard = OPTIONAL_COLUMNS.filter((c) => (narrow ? NARROW_HIDDEN : DEFAULT_HIDDEN).includes(c.id)).map((c) => c.id);
  if (ids.join(",") === standard.join(",")) return null;
  return ids.length === 0 ? HIDE_NONE : ids.join(",");
}

/** The sort key each header drives (hi-fi th.s). State, Domain and the five unpublished measures have none. */
const SORT_OF: Readonly<Partial<Record<ColumnId | "portfolio", SortKey>>> = {
  portfolio: "name",
  owner: "owner",
  allocations: "allocations",
  alphas: "deployments",
  allocated: "allocated",
  nav: "nav",
  pnl: "pnl",
  ret: "ret",
  dd: "dd",
  hhi: "hhi",
  score: "score",
};

/** Money orders inside one currency: these headers sort only once the page currency is picked. */
const MONEY_COLUMNS: readonly ColumnId[] = ["allocated", "nav", "pnl"];

export interface PortfolioTableProps {
  rows: readonly PortfolioRow[];
  hidden: ReadonlySet<ColumnId>;
  routes: PortfolioRoutes;
  /** The page's own query string, so context params ride along on every link. */
  search: URLSearchParams;
  selected: ReadonlySet<string>;
  onToggle(portfolioId: string, next: boolean): void;
  empty?: ReactNode;
  /** The applied order, and the header click. Money sorts inside one currency, so Allocated capital needs `currency`. */
  sort?: CardsSort | null;
  onSort?(key: SortKey): void;
  currency?: string | null;
  /** The page window (`7D`, `30D`, `90D`, `ALL`): the windowed headers say which one. */
  windowLabel?: string;
  /**
   * The Manager dataset's portfolio groups (FLEET, `group_by=portfolio_id`) for the page's environment, or `null` when the dataset
   * is not served. Feeds Net PnL, one line per economic partition; a column the groups do not carry keeps its `Not published`.
   */
  figures?: PortfolioFigures | null;
}

export interface PortfolioFigures {
  environment: string;
  groups: ReadonlyMap<string, readonly ManagerPartitionedMetrics[]>;
  /** `unique_row_count` per portfolio group (alpha rows in `environment`). */
  rows?: ReadonlyMap<string, number>;
}

export function PortfolioTable({ rows, hidden, routes, search, selected, onToggle, empty, sort, onSort, currency = null, windowLabel, figures = null }: PortfolioTableProps) {
  const full = selected.size >= COMPARE_MAX;
  const columns: CardsColumn<PortfolioRow>[] = [
    {
      key: "select",
      label: "Compare",
      render: (row) => {
        const checked = selected.has(row.portfolioId);
        const off = routes.compare === null;
        const blocked = off || !row.comparable || (!checked && full);
        const why = off ? COMPARE_OFF_REASON : !row.comparable ? row.notComparableReason : !checked && full ? `At most ${COMPARE_MAX} can be compared` : null;
        return (
          <input
            type="checkbox"
            className="exec-pf-check"
            aria-label={`Select ${row.label} to compare`}
            checked={checked}
            disabled={blocked}
            title={why ?? undefined}
            onChange={(event) => onToggle(row.portfolioId, event.target.checked)}
          />
        );
      },
    },
    {
      key: "portfolio",
      label: "Portfolio",
      sortKey: SORT_OF.portfolio,
      render: (row) => (
        <span className="exec-pf-name">
          <span className="exec-pf-nameline">
            {row.unallocated ? (
              <span className="exec-pf-title">{row.label}</span>
            ) : (
              <Link className="exec-pf-title" to={withContext(routes.portfolio(row.portfolioId), search)}>{row.label}</Link>
            )}
            {/* The base currency is its own visible mark (QA1 PF-01): a figure in it prints bare, in any other currency with its unit. */}
            {row.unallocated ? null : <span className="exec-pf-ccy" title={`Base currency ${row.baseCurrency}`}>{row.baseCurrency}</span>}
          </span>
          <span className="exec-pf-id" title={row.portfolioId}>{row.portfolioId}</span>
        </span>
      ),
    },
    ...OPTIONAL_COLUMNS.filter((c) => !hidden.has(c.id)).map<CardsColumn<PortfolioRow>>((c) => {
      const money = MONEY_COLUMNS.includes(c.id);
      return {
        key: c.id,
        label: c.windowed && windowLabel ? `${c.label} \u00b7 ${windowLabel}` : c.label,
        numeric: c.numeric,
        sortKey: money && currency === null ? undefined : SORT_OF[c.id],
        sortOffReason: money && currency === null ? "Money sorts inside one currency; pick the currency first" : undefined,
        render: (row) => cell(c.id, row, figures),
      };
    }),
  ];
  return (
    <CardsTable
      label="Portfolios"
      className="exec-pf-reg"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      empty={empty}
      sort={sort}
      onSort={onSort ? (key) => onSort(key as SortKey) : undefined}
    />
  );
}

/** The dataset group metric each measure column reads (one line per economic partition; never totalled). */
const GROUP_KEY: Readonly<Partial<Record<ColumnId, { key: string; signed: boolean }>>> = {
  nav: { key: "current_nav", signed: false },
  pnl: { key: "net_pnl", signed: true },
  ret: { key: "return_30d_pct", signed: true },
  dd: { key: "max_drawdown_pct", signed: true },
  hhi: { key: "concentration_hhi", signed: false },
};

/** The fact a figure column stands for, for the visible "Not published: <what>". */
const WHAT: Partial<Record<ColumnId, string>> = { nav: "NAV", pnl: "Net PnL", ret: "Return", dd: "Drawdown", hhi: "Concentration", score: "Score" };

function cell(id: ColumnId, row: PortfolioRow, figures: PortfolioFigures | null) {
  if (id === "score" && figures !== null) {
    if (row.unallocated) return <Absent what={WHAT.score} reason="The source publishes no score for capital that no portfolio holds" />;
    const group = figures.groups.get(row.portfolioId);
    if (group === undefined) return <Absent what={WHAT.score} reason={`No ${figures.environment} figures are published for this portfolio`} />;
    if (publishes(group, SCORE_KEYS.score)) return <ScoreList list={group} />;
  }
  if (id === "alphas") {
    const count = figures?.rows?.get(row.portfolioId);
    const where = figures?.environment ?? "the selected environment";
    const title = `${count === undefined ? "Alpha count not published for this environment" : `${count} alpha ${count === 1 ? "row" : "rows"} in ${where}`} / ${row.deploymentCount} ${row.deploymentCount === 1 ? "deployment" : "deployments"} across all environments`;
    return <span className="exec-pf-pair" title={title}>{count === undefined ? <Absent reason="alpha count not published" /> : count} / {row.deploymentCount}</span>;
  }
  const source = GROUP_KEY[id];
  if (source !== undefined && figures !== null) {
    if (row.unallocated) return <Absent what={WHAT[id]} reason="The source publishes no figure for capital that no portfolio holds" />;
    const group = figures.groups.get(row.portfolioId);
    if (group === undefined) return <Absent what={WHAT[id]} reason={`No ${figures.environment} figures are published for this portfolio`} />;
    // A group that does not publish this key keeps the column's own Not published (the contract has not spoken for it).
    if (publishes(group, source.key)) return <PartitionFigures list={group} metricKey={source.key} signed={source.signed} labels="several" omitUnit={row.baseCurrency} />;
  }
  const fact = UNPUBLISHED[id];
  if (fact) return <Absent what={WHAT[id] ?? fact.what} reason={`${npText(fact)}: ${fact.what}`} />;
  switch (id) {
    case "owner":
      return row.owner ?? <Absent reason="owner not published" />;
    case "state":
      // WP-K (N3): a published health roll-up is what Health prints, with the lifecycle state beside it; without one, the lifecycle state as before.
      if (row.health !== null && row.health.state === "PUBLISHED") {
        const counts = row.health.deploymentsByHealth;
        return (
          <span className="exec-pf-health" data-testid="health-rollup" title={`Worst of the deployments: ${counts.HEALTHY} healthy, ${counts.ATTENTION} attention, ${counts.DEGRADED} degraded, ${counts.HALTED} halted · as of ${row.health.asOf} · lifecycle ${row.stateLabel}`}>
            <Flag kind={HEALTH_FLAG[row.health.value].kind} label={HEALTH_FLAG[row.health.value].label} size="sm" />
          </span>
        );
      }
      if (row.health !== null) return <span data-testid="health-absent"><Flag kind={row.stateKind} label={row.stateLabel} size="sm" /> <Absent reason={`Health roll-up not published (${row.health.reasonCode}); this is the lifecycle state.`} /></span>;
      return <Flag kind={row.stateKind} label={row.stateLabel} size="sm" />;
    case "domain":
      return row.unallocated ? <Absent reason="no environment published" /> : <span className="exec-pf-domain">{row.domainLabel}<span className="exec-pf-envs">{row.environments.join(", ")}</span></span>;
    case "allocations":
      return String(row.allocationCount);
    case "allocated":
      if (row.unallocated) return <span className="exec-pf-np" title="The source publishes no figure for capital that no portfolio holds">Not published</span>;
      return (
        <span className="exec-pf-alloc">
          <MoneyList entries={row.allocated} empty={<Absent reason="no allocation published" />} omitUnit={row.baseCurrency} />
          {row.mixedBooks ? (
            // Seventeen of twenty-five rows carried the full sentence as a chip: the chip is two words, the sentence is its title and hidden text.
            <span title="Real-funded and Simulated books together">
              <Flag kind="partial" label="Mixed" size="sm" />
              <span className="exec-blk-sr"> (Real-funded and Simulated books together)</span>
            </span>
          ) : null}
        </span>
      );
    default:
      return null;
  }
}
