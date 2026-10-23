/**
 * Compare model (UXM-07 S2, flag key `compare`): which portfolios are being put
 * side by side, which of them can share one basis, and which rows of the metric
 * table the backend publishes.
 *
 * The partition rule is the point of this file. Two portfolios can be read on
 * one axis only when they share a base currency (and, when series exist, a
 * methodology and a window). The basis is the currency of the FIRST portfolio
 * picked; every other currency is a partition of its own, listed apart with the
 * reason, never converted, never ranked against the basis, never summed. A
 * portfolio whose single allocation list mixes Real-funded and Simulated books
 * is not comparable on any basis, because that figure is not split.
 *
 * Identity and scalars come from the portfolio list read (names, owner, state,
 * counts, `allocatedByCurrency`). The aligned series and the windowed measures
 * are FE-033 / FE-005 / FE-006 / FE-013 / FE-025 and print as such. Nothing
 * here computes a best-in-row mark: a mark would need a value it does not have.
 *
 * Pure functions, no React.
 */
import type { PortfolioRow } from "../portfolios/listModel";
import { COMPARE_MAX } from "../portfolios/selection";

export interface ResolvedSelection {
  /** Rows found in the loaded list, in the order they were picked. */
  rows: readonly PortfolioRow[];
  /** Ids named in the URL that the loaded list does not contain. */
  unresolved: readonly string[];
}

export function resolveSelection(all: readonly PortfolioRow[], ids: readonly string[]): ResolvedSelection {
  const rows: PortfolioRow[] = [];
  const unresolved: string[] = [];
  for (const id of ids) {
    const row = all.find((candidate) => candidate.portfolioId === id);
    if (row === undefined) unresolved.push(id);
    else rows.push(row);
  }
  return { rows, unresolved };
}

export interface Partition {
  key: string;
  currency: string;
  domain: PortfolioRow["domain"];
  domainLabel: string;
  ids: readonly string[];
}

export interface Basis {
  /** The currency the comparison is read in; `null` until something comparable is picked. */
  currency: string | null;
  /** The domain it is read in (Real-funded or Simulated); `null` with the currency. */
  domain: PortfolioRow["domain"] | null;
  /** Portfolios on the basis. */
  comparable: readonly PortfolioRow[];
  /** Portfolios outside it, each with the reason. */
  apart: readonly { row: PortfolioRow; reason: string }[];
  /** Every (currency, domain) group among the picks, in the order its first member was picked. */
  partitions: readonly Partition[];
}

const partKey = (row: PortfolioRow): string => `${row.baseCurrency}|${row.domain}`;

export function basisOf(rows: readonly PortfolioRow[]): Basis {
  const eligible = rows.filter((row) => row.comparable);
  const partitions: Partition[] = [];
  for (const row of eligible) {
    const group = partitions.find((entry) => entry.key === partKey(row));
    if (group) partitions[partitions.indexOf(group)] = { ...group, ids: [...group.ids, row.portfolioId] };
    else partitions.push({ key: partKey(row), currency: row.baseCurrency, domain: row.domain, domainLabel: row.domainLabel, ids: [row.portfolioId] });
  }
  // An environment word the Portal does not know never sets the basis: it would print a domain nobody published.
  const known = eligible.filter((row) => row.domain !== "unknown");
  const first = known.find((row) => !row.mixedBooks) ?? known[0];
  const currency = first?.baseCurrency ?? null;
  const domain = first?.domain ?? null;
  const comparable: PortfolioRow[] = [];
  const apart: { row: PortfolioRow; reason: string }[] = [];
  for (const row of rows) {
    if (!row.comparable) apart.push({ row, reason: row.notComparableReason ?? "Not comparable" });
    else if (row.mixedBooks) apart.push({ row, reason: "Real-funded and Simulated books share one allocation figure, so it cannot be read on one basis" });
    else if (row.domain === "unknown") apart.push({ row, reason: "Domain not published; it cannot be placed on a Real-funded or Simulated basis" });
    else if (row.baseCurrency !== currency) apart.push({ row, reason: `Other currency (${row.baseCurrency}); cannot be compared on a ${currency ?? "common"} basis` });
    else if (row.domain !== domain) apart.push({ row, reason: `${row.domainLabel} book; the basis is ${first?.domainLabel ?? "another domain"}, and the two are never combined` });
    else comparable.push(row);
  }
  return { currency, domain, comparable, apart, partitions };
}

export type SelectionState =
  | { kind: "empty" }
  | { kind: "too-few"; count: number }
  | { kind: "ready"; count: number }
  | { kind: "full"; count: number };

export function selectionState(count: number): SelectionState {
  if (count === 0) return { kind: "empty" };
  if (count < 2) return { kind: "too-few", count };
  if (count >= COMPARE_MAX) return { kind: "full", count };
  return { kind: "ready", count };
}

export const selectionHint = (state: SelectionState): string => {
  switch (state.kind) {
    case "empty": return "Pick two to four portfolios to compare.";
    case "too-few": return "Pick at least one more to compare.";
    case "full": return `${COMPARE_MAX} selected. Remove one to change.`;
    case "ready": return "";
  }
};

/** Where Back goes, from the `from` the link carried. */
export function backTarget(from: string | null): { kind: "list" } | { kind: "portfolio"; portfolioId: string } | { kind: "fleet" } {
  if (from === "fleet") return { kind: "fleet" };
  if (from !== null && from.startsWith("portfolio:") && from.length > "portfolio:".length) return { kind: "portfolio", portfolioId: from.slice("portfolio:".length) };
  return { kind: "list" };
}

/**
 * The best value of a row, by comparing the published exact strings of columns that share one basis (same currency, same partition).
 * It is an ordering of strings read as decimals (bigint, no float, nothing added or converted): higher is better. Fewer than two
 * published values, or all of them equal, mark nothing. Returns the indexes of the best cells (several only on an exact tie).
 */
export function bestIndexes(values: readonly (string | null)[]): ReadonlySet<number> {
  const parsed = values.map((value) => {
    if (value === null || !/^-?\d+(\.\d+)?$/.test(value)) return null;
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace("-", "").split(".");
    return { negative, whole: whole!, fraction };
  });
  const known = parsed.flatMap((entry, index) => (entry === null ? [] : [{ entry, index }]));
  if (known.length < 2) return new Set();
  const places = Math.max(...known.map(({ entry }) => entry.fraction.length));
  const scaled = known.map(({ entry, index }) => {
    const n = BigInt(entry.whole + entry.fraction.padEnd(places, "0"));
    return { index, n: entry.negative ? -n : n };
  });
  const top = scaled.reduce((a, b) => (b.n > a ? b.n : a), scaled[0]!.n);
  const best = scaled.filter((entry) => entry.n === top);
  return best.length === scaled.length ? new Set() : new Set(best.map((entry) => entry.index));
}
