/**
 * The scope bar, made real (P0-2).
 *
 * The bar has always said "every panel below obeys this scope". Until now it
 * did not: the four selects wrote to state, the state reached two chart titles,
 * and every row in every panel stayed exactly where it was. A control that
 * changes a caption and nothing else is worse than no control, because the
 * reader believes the numbers they are looking at have been narrowed.
 *
 * Scoping happens on the facts, once, before any panel is derived from them:
 * every panel then obeys it by construction rather than by remembering to.
 *
 * What it will not do: invent a dimension a row does not carry. A row with no
 * venue is not silently dropped when a venue is chosen — it is kept and stays
 * visible, because dropping rows on a field the source never published would
 * quietly shrink the truth. Only rows that carry the field and disagree with it
 * are excluded.
 */

export interface AlphaScopeSelection {
  portfolio: string;
  mode: string;
  venue: string;
  window: string;
}

export const SCOPE_WINDOWS = ["30d", "90d", "1y", "All"] as const;

const ALL = "ALL";
const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value)
    : null;

/** Milliseconds a window covers, or null for "All" and anything unrecognised. */
export function windowSpanMs(window: string): number | null {
  switch (window) {
    case "30d": return 30 * 86_400_000;
    case "90d": return 90 * 86_400_000;
    case "1y": return 365 * 86_400_000;
    default: return null;
  }
}

/** The timestamp fields a row may carry, most specific first. */
const TIME_FIELDS = [
  "trade_time", "submitted_at", "updated_at", "closed_at", "opened_at",
  "started_at", "created_at", "event_time", "as_of", "ts",
] as const;

function rowTimeMs(row: Record<string, unknown>): number | null {
  for (const field of TIME_FIELDS) {
    const raw = row[field];
    const ms = typeof raw === "number" && Number.isFinite(raw) ? raw
      : typeof raw === "string" ? Date.parse(raw) : Number.NaN;
    if (Number.isFinite(ms)) return ms;
    const msField = row[`${field}_ms`];
    if (typeof msField === "number" && Number.isFinite(msField)) return msField;
  }
  return null;
}

/** Case-insensitive match on a field the row may not carry: absent means "keep". */
function agrees(row: Record<string, unknown>, fields: readonly string[], wanted: string): boolean {
  if (wanted === ALL) return true;
  const target = wanted.toLowerCase();
  let carried = false;
  for (const field of fields) {
    const value = text(row[field]);
    if (value === null) continue;
    carried = true;
    if (value.toLowerCase() === target) return true;
  }
  return !carried;
}

export interface ScopeContext {
  /** account ids that belong to the chosen portfolio, when the resource publishes the mapping */
  portfolioAccounts?: readonly string[] | null;
  /** clock for the window, injected so tests are not tied to today */
  nowMs?: number;
}

/** True when one row survives the scope. */
export function rowInScope(row: Record<string, unknown>, scope: AlphaScopeSelection, context: ScopeContext = {}): boolean {
  if (!agrees(row, ["venue"], scope.venue)) return false;
  if (!agrees(row, ["mode", "stage", "profile_environment", "environment"], scope.mode)) return false;
  if (scope.portfolio !== ALL) {
    const portfolio = text(row.portfolio_id);
    if (portfolio !== null) {
      if (portfolio !== scope.portfolio) return false;
    } else if (context.portfolioAccounts && context.portfolioAccounts.length > 0) {
      const account = text(row.account_id);
      // Only a row that names an account can be placed in a portfolio; one that
      // names none stays, labelled by the panel that shows it.
      if (account !== null && !context.portfolioAccounts.includes(account)) return false;
    }
  }
  const span = windowSpanMs(scope.window);
  if (span !== null) {
    const at = rowTimeMs(row);
    // A row with no timestamp is not evidence of being outside the window.
    if (at !== null && at < (context.nowMs ?? Date.now()) - span) return false;
  }
  return true;
}

/** True when the scope selects everything — the cheap path, and the honest label. */
export function scopeIsAll(scope: AlphaScopeSelection): boolean {
  return scope.portfolio === ALL && scope.mode === ALL && scope.venue === ALL && windowSpanMs(scope.window) === null;
}

/** How many rows a scope removed, per fact key — what the screen says out loud. */
export interface ScopeEffect { kept: number; removed: number }

/**
 * Apply the scope to every fact array. Returns the narrowed facts and what was
 * removed, so a panel can say "12 of 48 in scope" rather than pretending the
 * smaller number is all there ever was.
 */
export function scopeFacts<T extends Readonly<Record<string, readonly Record<string, unknown>[]>>>(
  facts: T | null | undefined,
  scope: AlphaScopeSelection,
  context: ScopeContext = {},
): { facts: Record<string, readonly Record<string, unknown>[]>; effect: Record<string, ScopeEffect>; removedTotal: number } {
  const out: Record<string, readonly Record<string, unknown>[]> = {};
  const effect: Record<string, ScopeEffect> = {};
  let removedTotal = 0;
  for (const [key, rows] of Object.entries(facts ?? {})) {
    if (!Array.isArray(rows)) continue;
    const kept = rows.filter((row) => rowInScope(row, scope, context));
    out[key] = kept;
    effect[key] = { kept: kept.length, removed: rows.length - kept.length };
    removedTotal += rows.length - kept.length;
  }
  return { facts: out, effect, removedTotal };
}

/** The account ids of one portfolio, read from the rows the resource already carries. */
export function accountsOfPortfolio(
  rows: readonly Record<string, unknown>[] | null | undefined,
  portfolioId: string,
): string[] {
  if (portfolioId === ALL || !rows) return [];
  const accounts = new Set<string>();
  for (const row of rows) {
    if (text(row.portfolio_id) !== portfolioId) continue;
    const account = text(row.account_id);
    if (account) accounts.add(account);
  }
  return [...accounts];
}

/** One line naming what the scope is doing, for the bar itself. */
export function scopeSummary(scope: AlphaScopeSelection, removedTotal: number): string {
  if (scopeIsAll(scope)) return "every panel below obeys this scope · nothing is filtered out right now";
  const parts = [
    scope.portfolio === ALL ? null : `portfolio ${scope.portfolio}`,
    scope.mode === ALL ? null : `mode ${scope.mode}`,
    scope.venue === ALL ? null : `venue ${scope.venue}`,
    windowSpanMs(scope.window) === null ? null : `last ${scope.window}`,
  ].filter((part): part is string => part !== null);
  const rows = removedTotal === 1 ? "1 row outside this scope is hidden" : `${removedTotal} rows outside this scope are hidden`;
  return `${parts.join(" · ")} — ${rows}`;
}
