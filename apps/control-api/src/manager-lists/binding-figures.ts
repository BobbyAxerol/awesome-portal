/**
 * FE-CAT-4 / DEBT-UXM07-052 · optional list figures and counts on `execution.bindings-list.v1`.
 *
 * Pure functions, no I/O. Three rules hold everywhere in this file:
 *
 *  1. Omitted is not null. A figure key that is ABSENT from the source object means this producer has no owning source for
 *     it (the reader then keeps its per-row fallback). A key that is `null`, or present but not usable, is published as
 *     `null`: the owning source did not report a figure we can vouch for. Zero is only ever a published zero.
 *  2. One currency per figure. A mixed-currency binding is several entries, one per currency, sorted by currency. Two entries
 *     for one currency are ambiguous and the whole figure becomes `null`; nothing here adds amounts, converts or merges.
 *  3. Authorization precedes aggregation. `bindingCounts` filters rows through `authorize` before it classifies or counts
 *     them, so a hidden row never contributes to a count, an issue or a headroom.
 *
 * The projection column that carries the figures (`list_figures`, jsonb) does not exist yet. `bindingsResource` does not
 * select it, so on today's database the key is never present and nothing here is published. Edge/Core own the input; see
 * upgrade/execution_loop/evidence/ELP2-10/FE_CAT_4_BINDINGS_LIST_FIGURES_2026-10-23.md.
 */

export type FigureCoverage = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type CountEnvironment = "paper" | "sandbox" | "live";
export const COUNT_ENVIRONMENTS: readonly CountEnvironment[] = ["paper", "sandbox", "live"];

export interface AmountFigure {
  currency: string;
  value: string;
  observed_at: string;
  coverage: FigureCoverage;
}

export interface SleeveFigure {
  count: number;
  observed_at: string;
  coverage: FigureCoverage;
}

export interface BindingFigures {
  native_equity?: AmountFigure[] | null;
  virtual_used?: AmountFigure[] | null;
  virtual_headroom?: AmountFigure[] | null;
  sleeve_count?: SleeveFigure | null;
}

export interface BindingCounts {
  basis: "AUTHORIZED_SNAPSHOT";
  observed_at: string;
  coverage: FigureCoverage;
  all: number | null;
  issues: number | null;
  by_environment: Partial<Record<CountEnvironment, number | null>>;
}

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const COVERAGE: readonly string[] = ["COMPLETE", "PARTIAL", "UNKNOWN"];
const MAX_ENTRIES = 8;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function instant(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function amount(raw: unknown): AmountFigure | null {
  if (!isRecord(raw)) return null;
  const { currency, value, coverage } = raw;
  const observedAt = instant(raw.observed_at);
  if (typeof currency !== "string" || currency.length < 1 || currency.length > 191) return null;
  if (typeof value !== "string" || value.length > 128 || !DECIMAL.test(value)) return null;
  if (observedAt === null || typeof coverage !== "string" || !COVERAGE.includes(coverage)) return null;
  return { currency, value, observed_at: observedAt, coverage: coverage as FigureCoverage };
}

/** One entry per currency, sorted; `null` for anything we cannot vouch for (never a repaired or summed value). */
function amounts(raw: unknown): AmountFigure[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ENTRIES) return null;
  const entries = raw.map(amount);
  if (entries.some((entry) => entry === null)) return null;
  const list = entries as AmountFigure[];
  if (new Set(list.map((entry) => entry.currency)).size !== list.length) return null;
  return [...list].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
}

function sleeves(raw: unknown): SleeveFigure | null {
  if (!isRecord(raw)) return null;
  const observedAt = instant(raw.observed_at);
  if (typeof raw.count !== "number" || !Number.isSafeInteger(raw.count) || raw.count < 0) return null;
  if (observedAt === null || typeof raw.coverage !== "string" || !COVERAGE.includes(raw.coverage)) return null;
  return { count: raw.count, observed_at: observedAt, coverage: raw.coverage as FigureCoverage };
}

/**
 * Map the projection row's `list_figures` value to the published `figures` object.
 * Returns `undefined` (publish no `figures`) when the row carries none. Keys outside the four published ones
 * (for example a wallet balance) are never copied.
 */
export function mapBindingFigures(raw: unknown): BindingFigures | undefined {
  if (!isRecord(raw)) return undefined;
  const out: BindingFigures = {};
  for (const key of ["native_equity", "virtual_used", "virtual_headroom"] as const) {
    if (Object.hasOwn(raw, key)) out[key] = raw[key] === null ? null : amounts(raw[key]);
  }
  if (Object.hasOwn(raw, "sleeve_count")) out.sleeve_count = raw.sleeve_count === null ? null : sleeves(raw.sleeve_count);
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface CountSnapshot<Row> {
  /** Every projection row of this environment's snapshot, BEFORE authorization. */
  rows: readonly Row[];
  /** When the snapshot's owning source was observed; `null` when it published no instant. */
  observedAt: Date | null;
  complete: boolean;
}

/**
 * Counts for the tab strip, from the SAME authorized snapshots as the page.
 *
 * - `authorize` runs first. `isIssue` is never called on a row the caller may not see.
 * - An environment with no snapshot (`undefined`/`null`) is `null`, not 0.
 * - `all` and `issues` are `null` unless every environment is countable (a partial sum would read as a total).
 * - `isIssue` returns `null` when the owning facts do not decide it; the environment's issue count, and `issues`, then
 *   become `null` instead of an under-count.
 * - Returns `undefined` (publish no `counts`) when nothing is computable or no snapshot published an observation instant.
 */
export function bindingCounts<Row>(input: {
  snapshots: Partial<Record<CountEnvironment, CountSnapshot<Row> | null>>;
  authorize: (row: Row) => boolean;
  isIssue: (row: Row) => boolean | null;
}): BindingCounts | undefined {
  const byEnvironment: Partial<Record<CountEnvironment, number | null>> = {};
  const issuesBy: Partial<Record<CountEnvironment, number | null>> = {};
  const used: CountSnapshot<Row>[] = [];
  for (const environment of COUNT_ENVIRONMENTS) {
    const snapshot = input.snapshots[environment];
    if (!snapshot) { byEnvironment[environment] = null; issuesBy[environment] = null; continue; }
    const visible = snapshot.rows.filter(input.authorize);
    byEnvironment[environment] = visible.length;
    let issues: number | null = 0;
    for (const row of visible) {
      const verdict = input.isIssue(row);
      if (verdict === null) { issues = null; break; }
      if (verdict) issues += 1;
    }
    issuesBy[environment] = issues;
    used.push(snapshot);
  }
  if (used.length === 0 || used.some((snapshot) => snapshot.observedAt === null)) return undefined;
  const total = (values: Partial<Record<CountEnvironment, number | null>>): number | null => {
    let sum = 0;
    for (const environment of COUNT_ENVIRONMENTS) {
      const value = values[environment];
      if (value === null || value === undefined) return null;
      sum += value;
    }
    return sum;
  };
  const oldest = used.reduce((at, snapshot) => (snapshot.observedAt!.getTime() < at ? snapshot.observedAt!.getTime() : at), Infinity);
  return {
    basis: "AUTHORIZED_SNAPSHOT",
    observed_at: new Date(oldest).toISOString(),
    coverage: used.length === COUNT_ENVIRONMENTS.length && used.every((snapshot) => snapshot.complete) ? "COMPLETE" : "PARTIAL",
    all: total(byEnvironment),
    issues: total(issuesBy),
    by_environment: byEnvironment,
  };
}
