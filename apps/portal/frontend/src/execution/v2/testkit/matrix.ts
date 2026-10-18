/**
 * L1 state matrix (Rules 9.8.3): valid transformations of one canonical
 * object that together cover availability x status x reason x freshness x
 * completeness.
 *
 * A `Dimension` is one axis (a path and the values it may take, or a custom
 * mutation for an axis that moves several fields together). `cartesian` builds
 * every combination; `pairwise` builds a small set in which every pair of
 * values from two different axes meets at least once (greedy cover over the
 * combinations an `exclude` rule allows). `coverage` reports the numbers so a
 * suite can print them and a reviewer can see what was not multiplied out.
 *
 * Every state has a stable name, `axis=value axis=value`, so a failure names
 * the exact combination and a rerun reproduces it.
 */

export type Path = readonly (string | number)[];
export const ABSENT: unique symbol = Symbol("absent");
export type Absent = typeof ABSENT;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Draft = any;

export function getPath(root: unknown, path: Path): unknown {
  let node: unknown = root;
  for (const step of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string | number, unknown>)[step];
  }
  return node;
}

/** In place. `ABSENT` deletes the key. A missing parent is a bug in the generator and throws. */
export function setPath(root: unknown, path: Path, value: unknown): void {
  if (path.length === 0) throw new Error("setPath needs a non-empty path");
  const parent = getPath(root, path.slice(0, -1));
  if (typeof parent !== "object" || parent === null) throw new Error(`no parent for path ${path.join(".")}`);
  const last = path[path.length - 1]!;
  if (value === ABSENT) {
    if (Array.isArray(parent) && typeof last === "number") parent.splice(last, 1);
    else delete (parent as Record<string | number, unknown>)[last];
  } else {
    (parent as Record<string | number, unknown>)[last] = value;
  }
}

export function withPath<T>(root: T, path: Path, value: unknown): T {
  const copy = structuredClone(root);
  setPath(copy, path, value);
  return copy;
}

export function labelOf(value: unknown): string {
  if (value === ABSENT) return "absent";
  if (value === null) return "null";
  if (typeof value === "string") return value.length === 0 ? "empty" : value.length > 40 ? `${value.slice(0, 37)}...` : value;
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "function") return "function";
  if (typeof value === "undefined") return "undefined";
  return JSON.stringify(value);
}

export interface Option { label: string; apply(draft: Draft): void }
export interface Dimension { id: string; options: readonly Option[] }

/** One axis that sets one path to each of `values`. */
export function dimension(id: string, path: Path, values: readonly unknown[], label: (value: unknown) => string = labelOf): Dimension {
  return { id, options: values.map((value) => ({ label: label(value), apply: (draft: Draft) => setPath(draft, path, value === ABSENT ? value : structuredClone(value)) })) };
}

/** One axis whose options each run their own mutation (several fields that must move together). */
export function dimensionOf(id: string, options: readonly Option[]): Dimension {
  return { id, options };
}

export interface MatrixState<T> {
  /** `axis=value axis=value`, in axis order. */
  name: string;
  picks: Readonly<Record<string, string>>;
  value: T;
}

export interface MatrixOptions {
  /** True for a combination that is not a valid state (e.g. a value beside UNAVAILABLE). */
  exclude?(picks: Readonly<Record<string, string>>): boolean;
}

const COMBINATION_LIMIT = 60_000;

function picksOf(dims: readonly Dimension[], tuple: readonly number[]): Record<string, string> {
  const picks: Record<string, string> = {};
  dims.forEach((dim, axis) => { picks[dim.id] = dim.options[tuple[axis]!]!.label; });
  return picks;
}

function allowedTuples(dims: readonly Dimension[], options: MatrixOptions): number[][] {
  const total = dims.reduce((product, dim) => product * dim.options.length, 1);
  if (total > COMBINATION_LIMIT) throw new Error(`matrix of ${total} combinations is too large to enumerate; add an exclude rule or drop an axis`);
  const out: number[][] = [];
  const tuple = new Array<number>(dims.length).fill(0);
  for (let count = 0; count < total; count += 1) {
    if (!options.exclude?.(picksOf(dims, tuple))) out.push([...tuple]);
    for (let axis = dims.length - 1; axis >= 0; axis -= 1) {
      tuple[axis]! += 1;
      if (tuple[axis]! < dims[axis]!.options.length) break;
      tuple[axis] = 0;
    }
  }
  return out;
}

function build<T>(base: T, dims: readonly Dimension[], tuple: readonly number[]): MatrixState<T> {
  const value = structuredClone(base);
  dims.forEach((dim, axis) => dim.options[tuple[axis]!]!.apply(value));
  const picks = picksOf(dims, tuple);
  return { name: dims.map((dim) => `${dim.id}=${picks[dim.id]}`).join(" "), picks, value };
}

export function cartesian<T>(base: T, dims: readonly Dimension[], options: MatrixOptions = {}): MatrixState<T>[] {
  return allowedTuples(dims, options).map((tuple) => build(base, dims, tuple));
}

function pairsOf(tuple: readonly number[]): string[] {
  const keys: string[] = [];
  for (let a = 0; a < tuple.length; a += 1) {
    for (let b = a + 1; b < tuple.length; b += 1) keys.push(`${a}:${tuple[a]}|${b}:${tuple[b]}`);
  }
  return keys;
}

/** Greedy all-pairs cover over the allowed combinations; deterministic (first best wins). */
export function pairwise<T>(base: T, dims: readonly Dimension[], options: MatrixOptions = {}): MatrixState<T>[] {
  const pool = allowedTuples(dims, options);
  const uncovered = new Set(pool.flatMap(pairsOf));
  const chosen: number[][] = [];
  while (uncovered.size > 0) {
    let best: number[] | null = null;
    let bestGain = 0;
    for (const tuple of pool) {
      const gain = pairsOf(tuple).filter((key) => uncovered.has(key)).length;
      if (gain > bestGain) { best = tuple; bestGain = gain; }
    }
    if (best === null) break;
    chosen.push(best);
    for (const key of pairsOf(best)) uncovered.delete(key);
  }
  return chosen.map((tuple) => build(base, dims, tuple));
}

export interface Coverage {
  axes: number;
  values: number;
  /** Product of the axis sizes, before any exclusion. */
  cartesianRaw: number;
  /** Valid combinations after the exclude rule. */
  cartesianValid: number;
  states: number;
  pairsPossible: number;
  pairsCovered: number;
  valuesCovered: number;
}

export function coverage(dims: readonly Dimension[], states: readonly { picks: Readonly<Record<string, string>> }[], options: MatrixOptions = {}): Coverage {
  const pool = allowedTuples(dims, options);
  const possible = new Set(pool.flatMap(pairsOf));
  const indexOf = (axis: number, label: string) => dims[axis]!.options.findIndex((option) => option.label === label);
  const covered = new Set<string>();
  const seenValues = new Set<string>();
  for (const state of states) {
    const tuple = dims.map((dim, axis) => indexOf(axis, state.picks[dim.id]!));
    tuple.forEach((value, axis) => seenValues.add(`${axis}:${value}`));
    for (const key of pairsOf(tuple)) if (possible.has(key)) covered.add(key);
  }
  return {
    axes: dims.length,
    values: dims.reduce((sum, dim) => sum + dim.options.length, 0),
    cartesianRaw: dims.reduce((product, dim) => product * dim.options.length, 1),
    cartesianValid: pool.length,
    states: states.length,
    pairsPossible: possible.size,
    pairsCovered: covered.size,
    valuesCovered: seenValues.size,
  };
}

export function describeCoverage(label: string, c: Coverage): string {
  return `${label}: ${c.axes} axes, ${c.values} values; cartesian ${c.cartesianRaw} raw, ${c.cartesianValid} valid; `
    + `${c.states} states cover ${c.pairsCovered}/${c.pairsPossible} pairs and ${c.valuesCovered}/${c.values} values`;
}
