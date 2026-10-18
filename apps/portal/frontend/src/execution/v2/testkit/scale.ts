/**
 * L2 scale (Rules 9.8.3): 200 rows, many groups, cursors, 1 MiB.
 *
 * Everything is derived from a canonical row (cloned, then given a unique id
 * and sort key), never written by hand, so the shape stays the one Codex
 * published. Pages are keyset pages: each carries the opaque cursor of its
 * last row and the filter it was cut under.
 */

export const MIB = 1024 * 1024;

const encoder = new TextEncoder();
export function serializedBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

export const pad = (index: number, width = 5): string => String(index).padStart(width, "0");

/** `count` copies of `template`; `uniquify` gives each its id, sort key and group. */
export function cloneRows<R>(template: R, count: number, uniquify: (row: R, index: number) => void): R[] {
  return Array.from({ length: count }, (_, index) => {
    const row = structuredClone(template);
    uniquify(row, index);
    return row;
  });
}

/** Opaque, bound to the filter it was issued under: a cursor from another filter differs from this one. */
export function keysetCursor(filterKey: string, afterKey: string): string {
  return btoa(JSON.stringify({ f: filterKey, k: afterKey })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function cursorFilter(cursor: string): string | null {
  try {
    const text = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
    const parsed = JSON.parse(text) as { f?: unknown };
    return typeof parsed.f === "string" ? parsed.f : null;
  } catch {
    return null;
  }
}

export interface PageInfo {
  index: number;
  pages: number;
  total: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
}

/** Cuts `rows` into keyset pages of `size`; `build` places the rows and the paging fields into the envelope. */
export function splitIntoPages<R, E>(
  rows: readonly R[],
  size: number,
  filterKey: string,
  rowKey: (row: R) => string,
  build: (pageRows: R[], info: PageInfo) => E,
): { pages: E[]; cursors: string[] } {
  const pages: E[] = [];
  const cursors: string[] = [];
  const count = Math.max(1, Math.ceil(rows.length / size));
  for (let index = 0; index < count; index += 1) {
    const slice = rows.slice(index * size, (index + 1) * size);
    const last = slice[slice.length - 1];
    const hasMore = index < count - 1;
    const next = hasMore && last !== undefined ? keysetCursor(filterKey, rowKey(last)) : null;
    const before = rows[index * size - 1];
    const prev = index > 0 && before !== undefined ? keysetCursor(filterKey, rowKey(before)) : null;
    if (next) cursors.push(next);
    pages.push(build(slice, { index, pages: count, total: rows.length, nextCursor: next, prevCursor: prev, hasMore, hasPrevious: index > 0 }));
  }
  return { pages, cursors };
}

/**
 * Grows `build(factor)` until its serialized size reaches `target` bytes, then
 * returns the smallest factor tried that does. Used to reach the 1 MiB line
 * with realistic fat rows (more deployments, more reasons) instead of padding.
 */
export function fillToBytes<T>(build: (factor: number) => T, target: number, maxFactor = 4096): { value: T; factor: number; bytes: number } {
  let low = 1;
  let high = 1;
  while (serializedBytes(build(high)) < target) {
    low = high;
    high *= 2;
    if (high > maxFactor) throw new Error(`cannot reach ${target} bytes within factor ${maxFactor}`);
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (serializedBytes(build(mid)) >= target) high = mid;
    else low = mid;
  }
  const value = build(high);
  return { value, factor: high, bytes: serializedBytes(value) };
}

export function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}
