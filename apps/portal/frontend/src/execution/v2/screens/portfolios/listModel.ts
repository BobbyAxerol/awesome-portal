/**
 * Portfolio list model (UXM-07 S2, flag key `portfolios`): what
 * `GET /portfolios` (execution.portfolio-list.v1) publishes about WHO a
 * portfolio is and what is allocated to it, turned into what the table prints.
 *
 * What the read gives: name, owner, state, base currency, the environments it
 * has books in, counts, and `allocatedByCurrency` as exact decimal strings.
 * What it does not give: NAV, windowed PnL, return, drawdown, concentration,
 * score, health. Those are `Not published (FE-xxx)` columns, never a number
 * the client worked out.
 *
 * Two honest limits are carried to the screen instead of being smoothed over:
 * - `allocatedByCurrency` is one list per portfolio across ALL its
 *   environments. When a portfolio has both a live and a paper book the figure
 *   mixes Real-funded and Simulated capital and the model says so
 *   (`mixedBooks`); it cannot be split here.
 * - the read has no query and no cursor. Search, domain and sort are applied
 *   to the rows that were loaded (at most 100 by the schema), and a truncated
 *   read prints `top N / total`, with no way to ask for the rest yet.
 *
 * Pure functions, no React.
 */
import type { CurrencyValue, PortfolioHealthRead, PortfolioListEnvelope, PortfolioListItem } from "../../../api/profileRead";
import { readDecimal } from "../../boundary";
import { compareDecimal } from "../../charts/decimal";
import type { FlagKind } from "../../flagKinds";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { DOMAIN_LABEL, domainOf, humanize, type Domain } from "./format";
import { RANGES, SCORE_KEYS, inRange, measureValue, scoreMissing, type Range, type RangeId } from "./registerMetrics";

/** The DOM budget. The schema caps a page at 100 items; this holds if it ever grows. */
export const ROW_CAP = 200;

/** The source's name for the bucket of capital that no portfolio holds. */
export const UNALLOCATED_ID = "pf_unallocated";

export interface PortfolioRow {
  key: string;
  portfolioId: string;
  /** What the table prints as the name. */
  label: string;
  owner: string | null;
  state: string;
  stateKind: FlagKind;
  stateLabel: string;
  /** The published health roll-up (WP-K), or `null` when the read carries none. The lifecycle `state` above is a different fact. */
  health: PortfolioHealthRead | null;
  baseCurrency: string;
  environments: readonly string[];
  domain: Domain;
  domainLabel: string;
  allocationCount: number;
  deploymentCount: number;
  allocated: readonly CurrencyValue[];
  updatedAt: string;
  /** The capital bucket no portfolio holds: every figure is Not published and it cannot be compared. */
  unallocated: boolean;
  /** Real-funded and Simulated books share one `allocatedByCurrency` list; the figure is not split. */
  mixedBooks: boolean;
  /** Can be put side by side with another portfolio. */
  comparable: boolean;
  /** Why not, when not. */
  notComparableReason: string | null;
}

function stateView(state: string): { kind: FlagKind; label: string } {
  switch (state.toUpperCase()) {
    case "ACTIVE": return { kind: "ok", label: "Active" };
    case "PAUSED": case "SUSPENDED": return { kind: "paused", label: humanize(state) };
    case "UNKNOWN": return { kind: "unknown", label: "Unknown" };
    default: return { kind: "neutral", label: humanize(state) };
  }
}

export function toRow(item: PortfolioListItem): PortfolioRow {
  const unallocated = item.portfolioId === UNALLOCATED_ID;
  const domain = domainOf(item.environments);
  const view = stateView(item.state);
  return {
    key: item.portfolioId,
    portfolioId: item.portfolioId,
    label: unallocated ? "Unallocated" : item.name,
    owner: item.owner,
    state: item.state,
    stateKind: view.kind,
    stateLabel: view.label,
    health: item.health ?? null,
    baseCurrency: item.baseCurrency,
    environments: item.environments,
    domain,
    domainLabel: DOMAIN_LABEL[domain],
    allocationCount: item.allocationCount,
    deploymentCount: item.deploymentCount,
    allocated: item.allocatedByCurrency,
    updatedAt: item.updatedAt,
    unallocated,
    mixedBooks: domain === "mixed" && item.allocatedByCurrency.length > 0,
    comparable: !unallocated,
    notComparableReason: unallocated ? "Unallocated is not a portfolio, so it has nothing to compare" : null,
  };
}

/**
 * Every item becomes a row, in the order published. A portfolio id that repeats
 * is two rows with two React keys (`id`, then `id#2`): the table shows what the
 * source sent rather than choosing one of them.
 */
export function toRows(items: readonly PortfolioListItem[]): readonly PortfolioRow[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = (seen.get(item.portfolioId) ?? 0) + 1;
    seen.set(item.portfolioId, count);
    const row = toRow(item);
    return count === 1 ? row : { ...row, key: `${row.portfolioId}#${count}` };
  });
}

/* ── filter, sort ──────────────────────────────────────────────────────── */

export const DOMAIN_FILTERS = ["real", "simulated"] as const;
export type DomainFilter = (typeof DOMAIN_FILTERS)[number];

export function readDomainFilter(raw: string | null): DomainFilter | null {
  return (DOMAIN_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as DomainFilter) : null;
}

/** The portfolio groups the Manager dataset published, by portfolio id (null when it is not served). */
export type GroupMap = ReadonlyMap<string, readonly ManagerPartitionedMetrics[]> | null;

export interface RowFilters {
  q: string | null;
  domain: DomainFilter | null;
  /** Inclusive numeric ranges, one per measure; money ranges read the page currency. */
  ranges?: Readonly<Partial<Record<RangeId, Range>>>;
  /** Only portfolios with no published score value (missing, or insufficient evidence). */
  scoreMissing?: boolean;
  currency?: string | null;
  groups?: GroupMap;
}

export function filterRows(rows: readonly PortfolioRow[], q: string | null, domain: DomainFilter | null, extra: Omit<RowFilters, "q" | "domain"> = {}): readonly PortfolioRow[] {
  const needle = q?.trim().toLowerCase() ?? "";
  const currency = extra.currency ?? null;
  const groups = extra.groups ?? null;
  const ranges = RANGES.flatMap((spec) => {
    const range = extra.ranges?.[spec.id];
    return range === undefined ? [] : [{ spec, range }];
  });
  return rows.filter((row) => {
    if (domain === "real" && row.domain !== "real" && row.domain !== "mixed") return false;
    if (domain === "simulated" && row.domain !== "simulated" && row.domain !== "mixed") return false;
    const group = groups?.get(row.portfolioId);
    for (const { spec, range } of ranges) {
      const value = spec.source === "allocated" ? (currency === null ? null : allocatedIn(row, currency)) : row.unallocated ? null : measureValue(group, spec.key!, currency);
      if (!inRange(value, range)) return false;
    }
    if (extra.scoreMissing && (row.unallocated ? false : !scoreMissing(group, currency))) return false;
    if (needle === "") return true;
    return [row.label, row.portfolioId, row.owner ?? ""].some((part) => part.toLowerCase().includes(needle));
  });
}

export const SORT_KEYS = ["name", "owner", "allocations", "deployments", "allocated", "updated", "nav", "pnl", "ret", "dd", "hhi", "score"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export interface SortSpec { key: SortKey; dir: "asc" | "desc" }
export const DEFAULT_SORT: SortSpec = { key: "name", dir: "asc" };

/** `name`, `allocations:desc`. A value it cannot read is the default, reported by `valid`. */
export function parseSort(raw: string | null): { sort: SortSpec; valid: boolean } {
  if (raw === null || raw === "") return { sort: DEFAULT_SORT, valid: true };
  const [key, dir = "asc"] = raw.split(":");
  if (!(SORT_KEYS as readonly string[]).includes(key) || (dir !== "asc" && dir !== "desc")) return { sort: DEFAULT_SORT, valid: false };
  return { sort: { key: key as SortKey, dir }, valid: true };
}

/** The default sort stays out of the URL. */
export function writeSort(sort: SortSpec): string | null {
  return sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir ? null : `${sort.key}:${sort.dir}`;
}

/** The exact allocation in one currency, or null when the row has none in it (or the string is unreadable). */
export function allocatedIn(row: PortfolioRow, currency: string): string | null {
  const entry = row.allocated.find((item) => item.currency === currency);
  return entry !== undefined && readDecimal(entry.value, { unit: "money" }) !== null ? entry.value : null;
}

export function currenciesOf(rows: readonly PortfolioRow[]): readonly string[] {
  return [...new Set(rows.flatMap((row) => row.allocated.map((entry) => entry.currency)))].sort((a, b) => a.localeCompare(b));
}

/**
 * Sort the loaded rows. A row with no value for the key sorts last in BOTH
 * directions (the hi-fi rule), money sorts inside one currency, and the
 * Unallocated bucket always sorts after real portfolios.
 */
export function sortRows(rows: readonly PortfolioRow[], sort: SortSpec, currency: string | null, groups: GroupMap = null): readonly PortfolioRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const text = (a: string, b: string) => a.localeCompare(b) * sign;
  /** Exact decimal order with the rows that have no value last in BOTH directions. */
  const decimals = (x: string | null, y: string | null): number => {
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return compareDecimal(x, y) * sign;
  };
  const measure = (row: PortfolioRow, key: string): string | null => (row.unallocated ? null : measureValue(groups?.get(row.portfolioId), key, currency));
  const compare = (a: PortfolioRow, b: PortfolioRow): number => {
    if (a.unallocated !== b.unallocated) return a.unallocated ? 1 : -1;
    switch (sort.key) {
      case "name": return text(a.label, b.label);
      case "owner": {
        if (a.owner === null || b.owner === null) return a.owner === b.owner ? 0 : a.owner === null ? 1 : -1;
        return text(a.owner, b.owner);
      }
      case "allocations": return (a.allocationCount - b.allocationCount) * sign;
      case "deployments": return (a.deploymentCount - b.deploymentCount) * sign;
      case "updated": return text(a.updatedAt, b.updatedAt);
      case "allocated": return decimals(currency === null ? null : allocatedIn(a, currency), currency === null ? null : allocatedIn(b, currency));
      case "nav": return decimals(measure(a, "current_nav"), measure(b, "current_nav"));
      case "pnl": return decimals(measure(a, "net_pnl"), measure(b, "net_pnl"));
      case "ret": return decimals(measure(a, "return_30d_pct"), measure(b, "return_30d_pct"));
      case "dd": return decimals(measure(a, "max_drawdown_pct"), measure(b, "max_drawdown_pct"));
      case "hhi": return decimals(measure(a, "concentration_hhi"), measure(b, "concentration_hhi"));
      case "score": return decimals(measure(a, SCORE_KEYS.score), measure(b, SCORE_KEYS.score));
    }
  };
  return [...rows].sort((a, b) => compare(a, b) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

/** Sort keys whose figure is money: they order inside one currency, so they need the page currency. */
export const MONEY_SORT_KEYS: readonly SortKey[] = ["allocated", "nav", "pnl"];

/* ── words for the footer and the header ───────────────────────────────── */

export interface CountLine {
  /** What is on screen. */
  text: string;
  /** The read stopped before the end of the population. */
  truncated: boolean;
}

export function countLine(env: PortfolioListEnvelope, loaded: number, shown: number, filtered: boolean): CountLine {
  const noun = (n: number) => (n === 1 ? "portfolio" : "portfolios");
  if (env.truncated) {
    const head = filtered ? `${shown} of the top ${loaded} / ${env.totalPortfolios} ${noun(env.totalPortfolios)}` : `Top ${loaded} / ${env.totalPortfolios} ${noun(env.totalPortfolios)}`;
    return { text: head, truncated: true };
  }
  const head = filtered ? `${shown} of ${loaded} ${noun(loaded)}` : `${loaded} ${noun(loaded)}`;
  return { text: head, truncated: false };
}

/** Environment branches the read says are not whole. */
export function degradedBranches(env: PortfolioListEnvelope): readonly { environment: string; state: string; reasonCode: string | null }[] {
  return Object.entries(env.environmentBranches)
    .filter(([, branch]) => branch.state === "UNAVAILABLE" || branch.state === "PARTIAL")
    .map(([environment, branch]) => ({ environment, state: branch.state, reasonCode: branch.reasonCode }));
}

/**
 * Branch reason codes the server sends, in words. A code that is not here reads as "not in this
 * build's dictionary"; the code itself only ever goes in a hover title, never as the visible text.
 */
export const BRANCH_REASON_COPY: Readonly<Record<string, string>> = {
  N31_PROJECTION_LAGGING: "the data feed is running behind",
  N31_PROJECTION_NOT_READY: "the data feed has not produced a first read yet",
  N31_PROJECTION_STALE_CEILING_EXCEEDED: "the data feed is older than its allowed age",
  N31_PROJECTION_HISTORY_GAP: "the data feed has a gap in its history",
};

export function branchReasonText(code: string): { text: string; known: boolean } {
  const text = Object.hasOwn(BRANCH_REASON_COPY, code) ? BRANCH_REASON_COPY[code] : undefined;
  return text === undefined ? { text: "reason not in this build's dictionary", known: false } : { text, known: true };
}
