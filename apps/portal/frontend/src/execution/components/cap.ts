/**
 * M5 — honest capping.
 *
 * The obvious cap is `rows.slice(0, limit)`, and on this surface it is wrong in
 * a specific and dangerous way: the rows worth seeing are rarely the first
 * ones. A sync history capped to its ten most recent entries drops the one
 * `STALE` row in the window and becomes an advertisement. A fill list capped to
 * its head loses the terminal fill. A linked-account list capped by arrival
 * order loses the account that breached.
 *
 * So capping here keeps every exceptional row and spends what is left of the
 * budget on the rest, in original order. `CLAUDE.md` §8 states the invariant
 * this implements: degradation must not become a lie — downsampling may not
 * lose the extrema, and a capped list must say what it capped.
 *
 * Written once, here, because three screens needed it within a day of each
 * other and seventeen will need it eventually.
 */

export interface CappedList<T> {
  /** What to render, in the original order. */
  shown: readonly T[];
  /** How many rows existed. Server-provided where the list is a page. */
  total: number;
  capped: boolean;
  /**
   * Exceptional rows kept that a head-cap would have dropped.
   *
   * Reported rather than silent: "showing 10 of 4,120" and "showing 10 of
   * 4,120, including 2 outside the most recent 10" are different claims, and
   * only the second explains why the visible rows are not contiguous.
   */
  rescued: number;
  /** True when the exceptions alone did not fit. The worst case, and it is said. */
  exceptionsTruncated: boolean;
}

/**
 * Cap `rows` to `limit`, keeping every row `isException` marks.
 *
 * `total` defaults to `rows.length` but should be passed when the caller holds
 * a page of a larger set — the notice must describe the population, not the
 * page. Order is always the input's order, so a capped list still reads
 * chronologically even though it is no longer contiguous.
 */
export function capPreserving<T>(
  rows: readonly T[],
  limit: number,
  isException: (row: T) => boolean = () => false,
  total: number = rows.length,
): CappedList<T> {
  if (limit <= 0) {
    return { shown: [], total, capped: total > 0, rescued: 0, exceptionsTruncated: total > 0 };
  }
  if (rows.length <= limit) {
    return {
      shown: rows,
      total,
      // A full local list can still be a page of a bigger population.
      capped: total > rows.length,
      rescued: 0,
      exceptionsTruncated: false,
    };
  }

  const indexed = rows.map((row, index) => ({ row, index }));
  const exceptions = indexed.filter((entry) => isException(entry.row));
  const ordinary = indexed.filter((entry) => !isException(entry.row));

  // Exceptions first, because they are the reason anyone opened the list. If
  // there are more of them than the budget, that is itself the finding and is
  // reported rather than hidden behind an ordinary-looking cap.
  const keptExceptions = exceptions.slice(0, limit);
  const remaining = limit - keptExceptions.length;
  const keptOrdinary = ordinary.slice(0, Math.max(0, remaining));

  const kept = [...keptExceptions, ...keptOrdinary].sort((a, b) => a.index - b.index);
  // Only exceptions the head would have missed count as rescued; one inside
  // the first `limit` rows would have been shown anyway.
  const rescued = keptExceptions.filter((entry) => entry.index >= limit).length;

  return {
    shown: kept.map((entry) => entry.row),
    total,
    capped: true,
    rescued,
    exceptionsTruncated: exceptions.length > limit,
  };
}

/**
 * The sentence a capped list must carry.
 *
 * Returns `null` when nothing was capped, so a caller can render it
 * unconditionally without a truthful list picking up a caveat it does not need.
 * Counts are grouped and never abbreviated, for the same reason blotter
 * figures are not: `4,120` is checkable and `4.1k` is not.
 */
export function capNotice(list: CappedList<unknown>, noun: string): string | null {
  if (!list.capped) return null;
  const shown = list.shown.length.toLocaleString("en-US");
  const total = list.total.toLocaleString("en-US");
  const parts = [`showing ${shown} of ${total} ${noun}`];
  if (list.rescued > 0) {
    parts.push(
      `including ${list.rescued.toLocaleString("en-US")} outside the most recent ${shown}, kept because they are not routine`,
    );
  }
  if (list.exceptionsTruncated) {
    parts.push("more non-routine rows exist than fit here — open the full history");
  }
  return parts.join(" · ");
}
