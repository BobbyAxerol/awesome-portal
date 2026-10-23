/**
 * The portfolio register table: identity and allocation columns the read
 * publishes, plus the five measures it does not (each a `Not published
 * (FE-xxx)` cell, hideable from the column chooser).
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
import { Absent, MoneyList } from "./format";
import type { PortfolioRow, SortKey } from "./listModel";
import type { PortfolioRoutes } from "./routes";
import { COMPARE_OFF_REASON } from "./routes";
import { COMPARE_MAX } from "./selection";

import "../../css/portfolios.css";

export type ColumnId =
  | "owner" | "state" | "domain" | "allocations" | "deployments" | "allocated"
  | "nav" | "pnl" | "ret" | "dd" | "hhi";

export interface ColumnSpec {
  id: ColumnId;
  label: string;
  numeric?: boolean;
}

/** In display order. The Portfolio column is always shown and is not listed. */
export const OPTIONAL_COLUMNS: readonly ColumnSpec[] = [
  { id: "owner", label: "Owner" },
  { id: "state", label: "State" },
  { id: "domain", label: "Domain" },
  { id: "allocations", label: "Allocations", numeric: true },
  { id: "deployments", label: "Deployments", numeric: true },
  { id: "allocated", label: "Allocated capital", numeric: true },
  { id: "nav", label: "NAV", numeric: true },
  { id: "pnl", label: "Net PnL", numeric: true },
  { id: "ret", label: "Return", numeric: true },
  { id: "dd", label: "Drawdown", numeric: true },
  { id: "hhi", label: "Concentration", numeric: true },
];

/**
 * Measures the read does not publish. They stay as columns (hi-fi and the "Source not qualified" frame keep every column
 * and print "Not available" in each cell, the request id behind the cell's disclosure). The day a fact is published,
 * delete it from this table and add its `cell` case.
 */
export const UNPUBLISHED: Readonly<Partial<Record<ColumnId, Unpublished>>> = {
  nav: PF_FE.nav,
  pnl: PF_FE.netPnl, // kept only while the Manager dataset (FLEET, group_by portfolio_id) is not served; see `figures`
  ret: PF_FE.ret,
  dd: PF_FE.drawdown,
  hhi: PF_FE.concentration,
};

/**
 * Columns hidden until the reader asks (hi-fi `hide={dom:true}`): Domain, which
 * the Domain filter above the table already says. 11 columns fit at 1440; with
 * Domain the register is wider than the page and the five measures scroll away.
 */
export const DEFAULT_HIDDEN: readonly ColumnId[] = ["domain"];

/** The `hide` value that means "hide nothing", so a reader can switch the default off. */
export const HIDE_NONE = "none";

/**
 * The hidden set the address names. An absent `hide` is the default set; a
 * name it does not know is ignored; `none` (or any list with no known name) is
 * every column shown.
 */
export function readHidden(raw: string | null): ReadonlySet<ColumnId> {
  if (raw === null) return new Set(DEFAULT_HIDDEN);
  const known = new Set<string>(OPTIONAL_COLUMNS.map((c) => c.id));
  return new Set(raw.split(",").map((p) => p.trim()).filter((p): p is ColumnId => known.has(p)));
}

/** The `hide` value for a hidden set: omitted when it is the default, `none` when empty. */
export function writeHidden(hidden: ReadonlySet<ColumnId>): string | null {
  const ids = OPTIONAL_COLUMNS.filter((c) => hidden.has(c.id)).map((c) => c.id);
  if (ids.join(",") === DEFAULT_HIDDEN.join(",")) return null;
  return ids.length === 0 ? HIDE_NONE : ids.join(",");
}

/** The sort key each header drives (hi-fi th.s). State, Domain and the five unpublished measures have none. */
const SORT_OF: Readonly<Partial<Record<ColumnId | "portfolio", SortKey>>> = {
  portfolio: "name",
  owner: "owner",
  allocations: "allocations",
  deployments: "deployments",
  allocated: "allocated",
};

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
  /**
   * The Manager dataset's portfolio groups (FLEET, `group_by=portfolio_id`) for the page's environment, or `null` when the dataset
   * is not served. Feeds Net PnL, one line per economic partition; a column the groups do not carry keeps its `Not published`.
   */
  figures?: PortfolioFigures | null;
}

export interface PortfolioFigures {
  environment: string;
  groups: ReadonlyMap<string, readonly ManagerPartitionedMetrics[]>;
}

export function PortfolioTable({ rows, hidden, routes, search, selected, onToggle, empty, sort, onSort, currency = null, figures = null }: PortfolioTableProps) {
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
          {row.unallocated ? (
            <span className="exec-pf-title">{row.label}</span>
          ) : (
            <Link className="exec-pf-title" to={withContext(routes.portfolio(row.portfolioId), search)}>{row.label}</Link>
          )}
          <span className="exec-pf-id">{row.portfolioId}{row.unallocated ? "" : ` · base ${row.baseCurrency}`}</span>
        </span>
      ),
    },
    ...OPTIONAL_COLUMNS.filter((c) => !hidden.has(c.id)).map<CardsColumn<PortfolioRow>>((c) => ({
      key: c.id,
      label: c.label,
      numeric: c.numeric,
      sortKey: c.id === "allocated" && currency === null ? undefined : SORT_OF[c.id],
      sortOffReason: c.id === "allocated" && currency === null ? "Money sorts inside one currency; pick the currency first" : undefined,
      render: (row) => cell(c.id, row, figures),
    })),
  ];
  return (
    <CardsTable
      label="Portfolios"
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

function cell(id: ColumnId, row: PortfolioRow, figures: PortfolioFigures | null) {
  const source = GROUP_KEY[id];
  if (source !== undefined && figures !== null) {
    if (row.unallocated) return <Absent reason="The source publishes no figure for capital that no portfolio holds" />;
    const group = figures.groups.get(row.portfolioId);
    if (group === undefined) return <Absent reason={`No ${figures.environment} figures are published for this portfolio`} />;
    // A group that does not publish this key keeps the column's own Not published (the contract has not spoken for it).
    if (publishes(group, source.key)) return <PartitionFigures list={group} metricKey={source.key} signed={source.signed} />;
  }
  const fact = UNPUBLISHED[id];
  if (fact) return <Absent reason={`${npText(fact)}: ${fact.what}`} />;
  switch (id) {
    case "owner":
      return row.owner ?? <Absent reason="owner not published" />;
    case "state":
      return <Flag kind={row.stateKind} label={row.stateLabel} size="sm" />;
    case "domain":
      return row.unallocated ? <Absent reason="no environment published" /> : <span className="exec-pf-domain">{row.domainLabel}<span className="exec-pf-envs">{row.environments.join(", ")}</span></span>;
    case "allocations":
      return String(row.allocationCount);
    case "deployments":
      return String(row.deploymentCount);
    case "allocated":
      if (row.unallocated) return <span className="exec-pf-np" title="The source publishes no figure for capital that no portfolio holds">Not published</span>;
      return (
        <span className="exec-pf-alloc">
          <MoneyList entries={row.allocated} empty={<Absent reason="no allocation published" />} />
          {row.mixedBooks ? (
            // Seventeen of twenty-five rows carried the full sentence as a chip: the chip is two words, the sentence is its title and hidden text.
            <span title="Real-funded and Simulated books together">
              <Flag kind="partial" label="Mixed books" size="sm" />
              <span className="exec-blk-sr"> (Real-funded and Simulated books together)</span>
            </span>
          ) : null}
        </span>
      );
    default:
      return null;
  }
}
