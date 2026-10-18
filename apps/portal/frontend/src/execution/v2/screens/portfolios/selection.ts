/**
 * The Compare selection, carried in the URL (`in=a,b,c`), so a link to a
 * comparison is the comparison and Back returns to the list that made it.
 *
 * `in` is the screen-local param both the Portfolios list and the Compare
 * screen read and write. `ids` is the spelling review2/07 s1 gave the route;
 * it is read as an alias and never written.
 *
 * Pure functions. A value that is not a clean identifier is dropped and
 * counted, never repaired.
 */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export const IN_PARAM = "in";
const ALIAS_PARAM = "ids";

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,190}$/;

export interface ParsedSelection {
  ids: readonly string[];
  /** Entries that were dropped: not a clean identifier, a repeat, or past the fourth. */
  dropped: number;
}

export function parseSelection(raw: string | null): ParsedSelection {
  if (raw === null || raw.trim() === "") return { ids: [], dropped: 0 };
  const ids: string[] = [];
  let dropped = 0;
  for (const part of raw.split(",").map((piece) => piece.trim()).filter((piece) => piece !== "")) {
    if (!ID.test(part) || ids.includes(part) || ids.length >= COMPARE_MAX) dropped += 1;
    else ids.push(part);
  }
  return { ids, dropped };
}

export function selectionFrom(params: URLSearchParams): ParsedSelection {
  return parseSelection(params.get(IN_PARAM) ?? params.get(ALIAS_PARAM));
}

/** Writes the selection; an empty one removes the key. The alias is always removed. */
export function withSelection(params: URLSearchParams, ids: readonly string[]): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(ALIAS_PARAM);
  if (ids.length === 0) next.delete(IN_PARAM);
  else next.set(IN_PARAM, ids.join(","));
  return next;
}

export type CompareReadiness =
  | { kind: "empty" }
  | { kind: "too-few"; count: number }
  | { kind: "ready"; count: number };

export function readiness(count: number): CompareReadiness {
  if (count === 0) return { kind: "empty" };
  if (count < COMPARE_MIN) return { kind: "too-few", count };
  return { kind: "ready", count };
}

export interface CurrencyPartition {
  /** The base currency the group shares. */
  currency: string;
  ids: readonly string[];
}

/**
 * Groups by base currency, in the order the first member was picked. This is
 * the partition rule of Compare: a figure is only ever read against figures in
 * its own group, and the groups are never merged, converted or ranked against
 * each other.
 */
export function partitionByCurrency(items: readonly { id: string; currency: string }[]): readonly CurrencyPartition[] {
  const groups: { currency: string; ids: string[] }[] = [];
  for (const item of items) {
    const group = groups.find((entry) => entry.currency === item.currency);
    if (group) group.ids.push(item.id);
    else groups.push({ currency: item.currency, ids: [item.id] });
  }
  return groups;
}
