/**
 * Pure derivations of the slice (UXM-08, FIXTURE ONLY): what the banner, the portfolio list and the fleet rows say, from a
 * `ScopedRead` that has already crossed the strict reader. No React, no fetch, no clock.
 *
 * Invariants held here, each with a test in `model.test.ts`:
 * - UX-F02: nothing is computed across rows. The only counts are the server's own `page` counts and a per-portfolio count
 *   of rows ON THIS PAGE, labelled as such. There is no total, no share and no "of N" built from a count the caller may not see;
 * - UX-F05: rows keep their environment; money keeps its currency. Nothing adds Paper or Sandbox to Real-funded, or one
 *   currency to another;
 * - UX-F07: a figure the source did not publish is an absence with the published reason, never 0; a withheld key stays withheld;
 * - UX-F19: the page is the server's page. No client sort, no client "total".
 */
import { readMetric, type Metric } from "../../boundary";
import { ENV_LABEL, type ExecEnv } from "../../urlState";
import type { ScopedDisposition, ScopedItem, ScopedItemEnvironment, ScopedRead } from "./scopedRead";

/** The dataset the candidate stream names (`alpha_fleet_overview`, handoff `evidence/ELP2-09/coverage-and-handoff.md`). */
export const SLICE_DATASET = "alpha_fleet_overview";

/** The URL context the lane is asked to authorize. `null` = the URL said nothing, which authorizes nothing extra. */
export interface SliceContext {
  workspaceId: string | null;
  environment: string | null;
}

/** The authorized context a view is bound to; a change of any part is a new connection (and clears the old data). */
export function connectionKey(context: SliceContext): string {
  return `scoped-slice|ws=${context.workspaceId ?? "-"}|env=${context.environment ?? "-"}|ds=${SLICE_DATASET}`;
}

export const ENVIRONMENT_WORD: Readonly<Record<ScopedItemEnvironment | "all", string>> = {
  all: "All environments",
  live: ENV_LABEL.live,
  paper: ENV_LABEL.paper,
  sandbox: ENV_LABEL.sandbox,
};

export const environmentWord = (env: ScopedItemEnvironment | "all"): string => ENVIRONMENT_WORD[env];

export interface ScopeLines {
  /** Fixed by the contract constants, not by the caller's role. */
  scope: string;
  totals: string;
  completeness: string;
  policy: string;
  page: string;
  morePages: boolean;
}

export function scopeLines(read: ScopedRead): ScopeLines {
  const { page, scope } = read;
  const revisions = scope.policyRevisions.length;
  return {
    scope: "Scoped view: authorized rows only",
    totals: "Totals cover the rows you can see",
    completeness: "Partial: current page of retained data, not total history",
    policy: revisions === 0 ? "No policy revision named" : `${revisions} policy revision${revisions === 1 ? "" : "s"} applied`,
    // The server's own counts, worded as what they are. "visible to you", never "of N".
    page: `${page.returnedCount} on this page, ${page.visibleCount} visible to you, limit ${page.limit}`,
    morePages: page.hasMore,
  };
}

export interface PortfolioRow {
  portfolioId: string;
  /** Rows of THIS page that name the portfolio. Not the portfolio's alpha count. */
  rowsOnThisPage: number;
  environments: readonly ScopedItemEnvironment[];
}

/** Distinct portfolio ids of the rows in view, in the order the server returned them. A row with no portfolio id is not listed. */
export function portfolioRows(read: ScopedRead): PortfolioRow[] {
  const seen = new Map<string, { rows: number; envs: ScopedItemEnvironment[] }>();
  for (const item of read.items) {
    const id = item.identity.portfolio_id;
    if (typeof id !== "string") continue;
    const entry = seen.get(id) ?? { rows: 0, envs: [] };
    entry.rows += 1;
    if (!entry.envs.includes(item.environment)) entry.envs.push(item.environment);
    seen.set(id, entry);
  }
  return [...seen.entries()].map(([portfolioId, entry]) => ({ portfolioId, rowsOnThisPage: entry.rows, environments: entry.envs }));
}

export interface MoneyCell {
  currency: string;
  /** `undefined` never occurs here; `null` = the payload could not be read as a metric. */
  metric: Metric | null;
}

export interface FleetRow {
  key: string;
  alphaId: string | null;
  alphaVersionId: string | null;
  /** `null` = the source published no name (an explicit absence); never the id in its place. */
  alphaName: string | null;
  portfolioId: string | null;
  environment: ScopedItemEnvironment;
  /** One cell per currency, in published order. Empty = no total was published. */
  allocation: readonly MoneyCell[];
  /** The absence to print when there is no cell. */
  allocationAbsent: Metric | null;
  availability: ScopedItem["availability"];
  instances: number;
  isFullResource: boolean;
}

/**
 * A metric from a scoped total: the availability of the ROW decides AVAILABLE vs PARTIAL; a missing or null figure is an
 * absence with the row's reason. Three different things stay three: a figure ("0" included), an explicit null / withheld key
 * (an absence with the reason), and a currency the total does not state (no cell at all).
 */
function figureMetric(item: ScopedItem, value: string | null | undefined): Metric | null {
  const { state, reasonCode } = item.availability;
  if (typeof value === "string" && state !== "NOT_PUBLISHED") {
    return readMetric({ state: state === "AVAILABLE" ? "AVAILABLE" : "PARTIAL", value, reason_code: state === "AVAILABLE" ? null : reasonCode }, { unit: "money" });
  }
  return readMetric({ state: "UNAVAILABLE", value: null, reason_code: reasonCode }, { unit: "money" });
}

export function fleetRows(read: ScopedRead): FleetRow[] {
  return read.items.map((item, index) => {
    const allocation: MoneyCell[] = item.financialTotals.map((total) => ({
      currency: typeof total.currency === "string" ? total.currency : "",
      metric: figureMetric(item, total.allocation),
    }));
    return {
      key: `${item.environment}:${item.identity.alpha_id ?? "?"}:${item.identity.alpha_version_id ?? "?"}:${item.identity.portfolio_id ?? "?"}:${index}`,
      alphaId: item.identity.alpha_id ?? null,
      alphaVersionId: item.identity.alpha_version_id ?? null,
      alphaName: typeof item.identity.name === "string" ? item.identity.name : null,
      portfolioId: item.identity.portfolio_id ?? null,
      environment: item.environment,
      allocation,
      allocationAbsent: allocation.length === 0 ? figureMetric(item, undefined) : null,
      availability: item.availability,
      instances: item.instances.length,
      isFullResource: item.isFullResource,
    };
  });
}

/* ───────────────────────── dispositions, honest page label ───────────────────────── */

export const DISPOSITION_WORD: Readonly<Record<ScopedDisposition["state"], string>> = { PARTIAL: "Partial", DENIED: "Denied", UNAVAILABLE: "Unavailable" };

/**
 * Short words for the typed reasons the producer publishes on a disposition (BE-P14). A reason this build does not know is
 * shown as its code, never as a guess. There is no DISCONNECTED and no REVOKED disposition: "nothing recorded" is UNAVAILABLE
 * and "never granted or revoked" is DENIED, and the chip says only what the typed state and reason say.
 */
export const DISPOSITION_REASON_WORD: Readonly<Record<string, string>> = {
  AUTHORIZED_RETAINED_FACTS: "Retained facts",
  EXECUTION_READ_POLICY_PENDING: "Policy pending",
  EXECUTION_READ_NOT_AVAILABLE: "Not granted",
  EXECUTION_READ_AUTHORITY_UNAVAILABLE: "Authority unavailable",
  SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED: "Not recorded",
};

/**
 * One plain sentence per typed availability reason of a row's financial data (`SCOPED_AVAILABILITY_REASONS`). The code stays on the cell as its
 * title and as screen-reader text; a reason this build does not know is shown as its code, never as a guess.
 */
export const AVAILABILITY_REASON_SENTENCE: Readonly<Record<string, string>> = {
  AUTHORIZED_RETAINED_FACTS: "Retained facts are published for this row.",
  SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE: "Some financial fields are not published at this grain.",
  SOURCE_FACTS_NOT_PUBLISHED: "The source has not published these facts.",
};

export interface DispositionChip {
  environment: ScopedItemEnvironment;
  state: ScopedDisposition["state"];
  stateWord: string;
  /** `null` = the source published no reason. */
  reasonWord: string | null;
  /** The typed reason as published, for the title. */
  reasonCode: string | null;
}

/** One chip per published disposition, in published order. A withheld environment (DENIED / UNAVAILABLE) is never an empty one. */
export function dispositionChips(read: ScopedRead): DispositionChip[] {
  return read.dispositions.map((d) => ({
    environment: d.environment,
    state: d.state,
    stateWord: DISPOSITION_WORD[d.state],
    reasonWord: d.reasonCode === null ? null : (DISPOSITION_REASON_WORD[d.reasonCode] ?? d.reasonCode),
    reasonCode: d.reasonCode,
  }));
}

/** Environments the page states it did NOT read. */
export const withheldEnvironments = (read: ScopedRead): ScopedItemEnvironment[] =>
  read.dispositions.filter((d) => d.state === "DENIED" || d.state === "UNAVAILABLE").map((d) => d.environment);

/**
 * "Showing 100 of 101": only when the page holds fewer rows than the server says are visible to this caller. Both numbers
 * are the server's own page counts (`returned_count`, `visible_count`); the second is authorized rows, never a global count.
 * `null` = the page holds every visible row, nothing to say.
 */
export function showingLabel(read: ScopedRead): string | null {
  const { returnedCount, visibleCount, hasMore } = read.page;
  return hasMore || returnedCount < visibleCount ? `Showing ${returnedCount} of ${visibleCount}` : null;
}

/* ───────────────────────── PORTFOLIOS and BINDINGS ───────────────────────── */

export interface PortfolioDatasetRow {
  key: string;
  portfolioId: string | null;
  portfolioName: string | null;
  environment: ScopedItemEnvironment;
  baseCurrency: string | null;
  allocation: readonly MoneyCell[];
  allocationAbsent: Metric | null;
  availability: ScopedItem["availability"];
}

function moneyCells(item: ScopedItem): MoneyCell[] {
  return item.financialTotals.map((total) => ({
    currency: typeof total.currency === "string" ? total.currency : "",
    metric: figureMetric(item, total.allocation),
  }));
}

/**
 * The rows of a PORTFOLIOS read, as published: one per (environment, portfolio). There is deliberately NO balance on a
 * portfolio row: a physical account can be shared by the children of two portfolios, and a balance is a fact of the account's
 * binding (see `bindingRows`). Nothing here adds the rows of one portfolio across environments or currencies.
 */
export function portfolioDatasetRows(read: ScopedRead): PortfolioDatasetRow[] {
  if (read.surface !== "PORTFOLIOS") return [];
  return read.items.map((item) => {
    const allocation = moneyCells(item);
    return {
      key: `${item.environment}:${item.identity.portfolio_id ?? "?"}`,
      portfolioId: item.identity.portfolio_id ?? null,
      portfolioName: typeof item.identity.name === "string" ? item.identity.name : null,
      environment: item.environment,
      baseCurrency: typeof item.identity.base_currency === "string" ? item.identity.base_currency : null,
      allocation,
      allocationAbsent: allocation.length === 0 ? figureMetric(item, undefined) : null,
      availability: item.availability,
    };
  });
}

export interface BalanceCell {
  currency: string;
  total: Metric | null;
  free: Metric | null;
  locked: Metric | null;
}

export interface BindingRow {
  key: string;
  bindingId: string | null;
  bindingName: string | null;
  environment: ScopedItemEnvironment;
  venue: string | null;
  /** Distinct accounts among this binding's instances (an account shared by two instances is one). */
  accounts: number;
  instances: number;
  allocation: readonly MoneyCell[];
  allocationAbsent: Metric | null;
  /** Per currency the total states a balance for. A currency without a balance key has no cell. */
  balances: readonly BalanceCell[];
  availability: ScopedItem["availability"];
}

/**
 * The rows of a BINDINGS / BINDING_DETAIL read. This is the ONE place an account balance is shown: the producer states a
 * shared physical account once, on the binding that owns it, and attributes it to neither portfolio nor alpha. The balance is
 * printed exactly as published, per currency, and is never added to another row's.
 */
export function bindingRows(read: ScopedRead): BindingRow[] {
  if (read.surface !== "BINDINGS" && read.surface !== "BINDING_DETAIL") return [];
  return read.items.map((item) => {
    const allocation = moneyCells(item);
    const balances: BalanceCell[] = item.financialTotals
      .filter((total) => total.balance_total !== undefined || total.balance_free !== undefined || total.balance_locked !== undefined)
      .map((total) => ({
        currency: typeof total.currency === "string" ? total.currency : "",
        total: figureMetric(item, total.balance_total),
        free: figureMetric(item, total.balance_free),
        locked: figureMetric(item, total.balance_locked),
      }));
    const accounts = new Set(item.instances.flatMap((instance) => (typeof instance.account_id === "string" ? [instance.account_id] : [])));
    return {
      key: `${item.environment}:${item.identity.binding_id ?? "?"}`,
      bindingId: item.identity.binding_id ?? null,
      bindingName: typeof item.identity.name === "string" ? item.identity.name : null,
      environment: item.environment,
      venue: typeof item.identity.venue === "string" ? item.identity.venue : null,
      accounts: accounts.size,
      instances: item.instances.length,
      allocation,
      allocationAbsent: allocation.length === 0 ? figureMetric(item, undefined) : null,
      balances,
      availability: item.availability,
    };
  });
}

export const isExecEnv = (value: string): value is ExecEnv => value === "live" || value === "paper" || value === "sandbox";
