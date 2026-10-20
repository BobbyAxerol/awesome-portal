/**
 * Accounts and Account 360, the pure half: published rows in, view models out.
 *
 * Nothing here reads a store, a route or the DOM, and nothing computes a
 * figure the source did not publish. A Difference is the source's own `delta`,
 * a headroom is the source's own `headroom`, a verdict is the source's own
 * `verdict`; when the source says nothing the model says so (`undefined` for
 * "nothing provided", an absent `Metric` for "the source published an
 * absence", `null` for "the payload was malformed"), and the view prints
 * `Not available`, `Not computed` or `Not published (id)`, never a dash and
 * never 0.
 *
 * Two privacy rules live here because they are about what a row may become:
 * - the physical broker reference (`external_account_ref`) is not read into any
 *   view model. The e2e double strips it; if a payload carries it anyway the
 *   fields below are an allow-list, so it cannot reach the DOM;
 * - a credential is shown as a state word only (alias, scope and secret are
 *   not part of any view).
 */
import type { BindingExposure } from "../../../analytics";
import type { BindingItem, ProfileEnvelope } from "../../../api/profileRead";
import type { SubjectActivityPage } from "../../../api/subjectActivity";
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { ExactUnit } from "../../../formatExact";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { readDecimal, readMetric, type Metric } from "../../boundary";
import type { TriadCell, TriadRow } from "../../blocks";
import type { FlagKind } from "../../flagKinds";
import type { AccountOperation } from "../../readers/accessSelfContext";
import { V2_CAPABILITY, type CapabilityNeed } from "../../shell/roleNav";
import { NOT_COMMISSIONED_WHY } from "../stage/reasons";
import type { SeriesPoint } from "../../charts";

/* ── scale constants (the six-cell table in index.tsx explains them) ────── */

export const PAGE_LIMIT = 50;
/** DOM budget: more rows than this and the reader narrows the filters instead. */
export const ROW_CAP = 200;
export const SYNC_SHOWN = 10;

/* ── what the backend has not published ─────────────────────────────────── */

export interface UnpublishedFact {
  fe: string;
  what: string;
}

/**
 * One table for every gap on these two screens. `FE-nnn` ids are the open
 * requests in FRONTEND_BACKEND_SYNC.md; `A360-n` ids are NEW requests this
 * package proposes (the primary allocates the FE number when it files them).
 */
export const FE = {
  budget: { fe: "FE-017", what: "Budget used and approved for this sleeve" },
  window: { fe: "FE-025", what: "Fees, funding and borrow over a window" },
  audit: { fe: "FE-021", what: "Actor and receipt" },
  events: { fe: "FE-031", what: "Audit events for this account" },
  eligibility: { fe: "FE-015", what: "Whether this action is allowed, and why not" },
  command: { fe: "FE-020", what: "Command preview and the sync and dry-run commands" },
  gross: { fe: "A360-1", what: "Long, short and gross notional by side" },
  marginRatio: { fe: "A360-2", what: "Margin ratio" },
  credential: { fe: "A360-3", what: "Credential alias, scopes and expiry" },
  product: { fe: "A360-4", what: "Product, margin mode and position mode of the binding" },
  export: { fe: "FE-016", what: "Export" },
} as const satisfies Record<string, UnpublishedFact>;

export const notPublished = (fact: UnpublishedFact): string => `Not published (${fact.fe})`;

/** The sentence a disabled control carries. */
export const notPublishedReason = (fact: UnpublishedFact, because: string): string => `${notPublished(fact)}. ${because}`;

/* ── capabilities ───────────────────────────────────────────────────────── */

/**
 * `execution.accounts.read` is the roleNav name (FE-037). There is no "manage" capability: `execution.accounts.manage` was a requested
 * name that nothing ever issued and the server says does not exist (BE-P7 `1449455e`, FE-037/058). The only control it would have
 * gated, "Rotate credential", is the PM `REVISE_BINDING` (credential-only) family, which has no Portal route; it is off for EVERY
 * caller and `rotateCredential` below says why. A navigation or read capability never opens it.
 */
export const ACCOUNT_CAPABILITY = {
  read: V2_CAPABILITY.accountsRead,
} as const;

export const ACCOUNT_NEEDS: Readonly<Record<"read", CapabilityNeed>> = {
  read: { allOf: [ACCOUNT_CAPABILITY.read] },
};

/**
 * "Rotate credential": always disabled, with the reason the Portal published when it has (FE-037/058, `GET /self-context`
 * `account_operations`: `REVISE_BINDING`, `COMMAND_FAMILY_NOT_COMMISSIONED`, the same for every member), else the reason the
 * control carried before the read existed. The published branch is a refusal, never a permission: nothing in `published` can turn
 * the control on, and a published entry that is anything but exactly that refusal is ignored (fail closed to today's reason).
 */
export interface RotateCredential {
  /** The sentence under the disabled control. */
  reason: string;
  /** The "My access" link that goes with it: only for the access-flavoured fallback, never for a typed not-commissioned refusal. */
  accessHref: string | undefined;
  /** True when `reason` came from the Portal's typed `account_operations`. */
  published: boolean;
}

/** The reason the control carried before the typed absence existed. Unchanged for a caller whose read did not publish one. */
export const ROTATE_FALLBACK_REASON = "Not allowed. Your access does not include managing accounts.";

export function rotateCredential(published: readonly AccountOperation[] | null): RotateCredential {
  const typed = published?.find((entry) => entry.operation === "REVISE_BINDING");
  if (typed !== undefined && typed.availability === "NOT_COMMISSIONED" && typed.reasonClass === "COMMAND_FAMILY_NOT_COMMISSIONED") {
    return { reason: NOT_COMMISSIONED_WHY, accessHref: undefined, published: true };
  }
  return { reason: ROTATE_FALLBACK_REASON, accessHref: ACCESS_PATH, published: false };
}

/* ── tiny readers over rows of unknown ──────────────────────────────────── */

export type Row = Readonly<Record<string, unknown>>;

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

export function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `Date`-free instant of a row: `<key>_ms` first, then the ISO text. */
export function timeOf(row: Row, key: string): UtcEpochMs | null {
  const ms = readUtcEpochMs(row[`${key}_ms`]);
  if (ms !== null) return ms;
  const raw = row[key];
  const direct = readUtcEpochMs(raw);
  if (direct !== null) return direct;
  const iso = text(raw);
  if (iso === null) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : readUtcEpochMs(parsed);
}

export function humanize(word: string): string {
  const spaced = word.replace(/[_-]+/g, " ").trim().toLowerCase();
  return spaced === "" ? word : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const REASON = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;

/**
 * A published decimal (or its absence) as the boundary `Metric`.
 * `undefined` = the key was not in the row; `null` = the value was malformed.
 */
export function metricOf(raw: unknown, unit: ExactUnit, absentCode = "NOT_PUBLISHED"): Metric | null | undefined {
  if (raw === undefined) return undefined;
  const code = REASON.test(absentCode) ? absentCode : "NOT_PUBLISHED";
  if (raw === null) return readMetric({ state: "UNAVAILABLE", reason_code: code }, { unit });
  if (typeof raw !== "string") return null;
  return readMetric({ state: "AVAILABLE", value: raw }, { unit });
}

export function countMetric(count: number): Metric | null {
  return readMetric({ state: "AVAILABLE", value: String(count) }, { unit: "count" });
}

/** A string sign test on a published decimal; it never parses a number. */
export const isNegative = (value: string | null | undefined): boolean => typeof value === "string" && value.startsWith("-");

/* ── credential and sync vocabularies ───────────────────────────────────── */

export interface WordView {
  kind: FlagKind;
  label: string;
  /** Needs a person: shown under the Issues lens. */
  issue: boolean;
}

/**
 * The published `credential_state` word -> a flag. Chosen from this table by
 * the exact word, never by pattern-matching its text. An unknown word stays
 * `unknown` with the source's own spelling, so a new state cannot read as ok.
 */
const CREDENTIAL_WORDS: Readonly<Record<string, WordView>> = {
  SYNC_SYNCED: { kind: "ok", label: "Synced", issue: false },
  SYNCED: { kind: "ok", label: "Synced", issue: false },
  VALID: { kind: "ok", label: "Valid", issue: false },
  SYNC_STALE: { kind: "stale", label: "Sync delayed", issue: true },
  STALE: { kind: "stale", label: "Sync delayed", issue: true },
  DEGRADED: { kind: "stale", label: "Degraded", issue: true },
  SYNC_FAILED: { kind: "attention", label: "Sync failed", issue: true },
  FAILED: { kind: "attention", label: "Sync failed", issue: true },
  ERROR: { kind: "attention", label: "Error", issue: true },
  REVOKED: { kind: "attention", label: "Revoked", issue: true },
  EXPIRED: { kind: "attention", label: "Expired", issue: true },
  INVALID: { kind: "attention", label: "Invalid", issue: true },
  MISMATCH: { kind: "attention", label: "Mismatch", issue: true },
  NOT_PUBLISHED: { kind: "unknown", label: "Not published", issue: false },
};

export function credentialView(word: string | null | undefined): WordView {
  if (!word) return { kind: "unknown", label: "Not available", issue: false };
  const key = word.trim().toUpperCase();
  return Object.hasOwn(CREDENTIAL_WORDS, key) ? CREDENTIAL_WORDS[key]! : { kind: "unknown", label: humanize(word), issue: false };
}

const STATE_WORDS: Readonly<Record<string, WordView>> = {
  ACTIVE: { kind: "ok", label: "Active", issue: false },
  SUSPENDED: { kind: "paused", label: "Suspended", issue: true },
  DISABLED: { kind: "paused", label: "Disabled", issue: true },
  INACTIVE: { kind: "paused", label: "Inactive", issue: true },
  REVOKED: { kind: "attention", label: "Revoked", issue: true },
  ERROR: { kind: "attention", label: "Error", issue: true },
};

export function stateView(word: string | null | undefined): WordView {
  if (!word) return { kind: "unknown", label: "Not available", issue: false };
  const key = word.trim().toUpperCase();
  return Object.hasOwn(STATE_WORDS, key) ? STATE_WORDS[key]! : { kind: "unknown", label: humanize(word), issue: false };
}

const SYNC_WORDS: Readonly<Record<string, { kind: FlagKind; label: string }>> = {
  OK: { kind: "applied", label: "Synced" },
  SYNCED: { kind: "applied", label: "Synced" },
  STALE: { kind: "stale", label: "Delayed" },
  DELAYED: { kind: "stale", label: "Delayed" },
  PENDING: { kind: "pending", label: "Reconciling" },
  RECONCILING: { kind: "pending", label: "Reconciling" },
  FAILED: { kind: "rejected", label: "Failed" },
  ERROR: { kind: "rejected", label: "Failed" },
};

export function syncView(word: string | null | undefined): { kind: FlagKind; label: string } {
  if (!word) return { kind: "unknown", label: "Not available" };
  const key = word.trim().toUpperCase();
  return Object.hasOwn(SYNC_WORDS, key) ? SYNC_WORDS[key]! : { kind: "unknown", label: humanize(word) };
}

export function freshnessFlag(word: string | null | undefined): { kind: FlagKind; label: string } {
  switch ((word ?? "").toUpperCase()) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "AGING": return { kind: "partial", label: "Aging" };
    case "STALE": return { kind: "stale", label: "Stale" };
    default: return { kind: "unknown", label: "Freshness unknown" };
  }
}

/** Read age of a source instant, from two PUBLISHED instants (no browser clock). */
export function ageAtRead(asOf: UtcEpochMs | null, readAt: UtcEpochMs | null): string | null {
  if (asOf === null || readAt === null || readAt < asOf) return null;
  const minutes = Math.floor((readAt - asOf) / 60_000);
  if (minutes < 1) return "under 1 min";
  if (minutes < 120) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}

/** HIFI accounts.html `ageW`: a row last updated this many minutes before the read is marked stale. */
export const UPDATED_STALE_MINUTES = 30;

/**
 * "14 min ago" / "3 h ago" for a row's `updated_at`, measured against the instant the list was
 * READ (both published, no browser clock), as hi-fi accounts.html prints it. `null` when either
 * instant is missing or the row claims to be newer than the read: the caller then prints the
 * absolute time instead of inventing an age.
 */
export function updatedAgo(updatedAt: UtcEpochMs | null, readAt: UtcEpochMs | null): { text: string; stale: boolean } | null {
  if (updatedAt === null || readAt === null || readAt < updatedAt) return null;
  const minutes = Math.floor((readAt - updatedAt) / 60_000);
  const text = minutes < 1 ? "under 1 min ago" : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`;
  return { text, stale: minutes >= UPDATED_STALE_MINUTES };
}

/* ── the Accounts list: one environment per read ───────────────────────── */

export type BindingEnv = "paper" | "sandbox" | "live";
/**
 * `GET /broker-bindings` answers ONE environment (`execution.bindings-list.v1`
 * types it paper | sandbox | live), so the environment tabs are three reads and
 * "All environments" is not offered; the shell's `env` param picks the tab.
 */
export const ENV_TABS: readonly BindingEnv[] = ["live", "paper", "sandbox"];
export const ALL_ENVIRONMENTS: UnpublishedFact = { fe: "ELP2-REQ-FE-014", what: "Bindings across environments in one read" };

export const CREDENTIAL_FILTERS = ["ok", "attention"] as const;
export type CredentialFilter = (typeof CREDENTIAL_FILTERS)[number];

export function readCredentialFilter(raw: string | null): CredentialFilter | null {
  return (CREDENTIAL_FILTERS as readonly string[]).includes(raw ?? "") ? (raw as CredentialFilter) : null;
}

export interface BindingRow {
  bindingId: string;
  accountId: string;
  venue: string;
  state: WordView;
  stateWord: string;
  credential: WordView;
  credentialWord: string;
  updatedAt: UtcEpochMs | null;
  /** Needs a person: credential or state the source calls wrong. */
  issue: boolean;
}

export function toBindingRow(item: BindingItem): BindingRow {
  const credential = credentialView(item.credentialState);
  const state = stateView(item.state);
  return {
    bindingId: item.bindingId,
    accountId: item.accountId,
    venue: item.venue,
    state,
    stateWord: item.state,
    credential,
    credentialWord: item.credentialState,
    updatedAt: timeOf({ updated_at: item.updatedAt }, "updated_at"),
    issue: credential.issue || state.issue,
  };
}

/** The credential filter, applied to loaded rows only. */
export function matchesCredential(row: BindingRow, filter: CredentialFilter | null): boolean {
  if (filter === null) return true;
  return filter === "ok" ? row.credential.kind === "ok" : row.credential.kind !== "ok";
}

/** The Issues toggle, applied to loaded rows only. */
export function inScope(row: BindingRow, issuesOnly: boolean): boolean {
  return issuesOnly ? row.issue : true;
}

/** Keyset merge: a later page never repeats a row the reader already has. */
export function mergeBindings(have: readonly BindingItem[], more: readonly BindingItem[]): readonly BindingItem[] {
  const seen = new Set(have.map((row) => row.bindingId));
  return [...have, ...more.filter((row) => !seen.has(row.bindingId))];
}

export function bindingQuery(
  filters: { env: BindingEnv; q: string | null; venue: string | null },
  after?: string | null,
) {
  return {
    environment: filters.env,
    search: filters.q ?? undefined,
    venue: filters.venue ?? undefined,
    limit: PAGE_LIMIT,
    after: after ?? undefined,
  };
}

/* ── the account resource ───────────────────────────────────────────────── */

type BranchState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE" | "UNKNOWN";

export interface Branch {
  state: BranchState;
  reasonCode: string | null;
}

/** Data keys whose capability is published under another relation name. */
const RELATION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  broker_sync: ["broker_sync", "broker_account_sync_effective"],
};

/** What the source said about one relation (`source.<relation>` capability). */
export function branchOf(profile: ProfileEnvelope, relation: string): Branch {
  const names = RELATION_ALIASES[relation] ?? [relation];
  const cap = profile.capabilities.find((entry) => names.some((name) => entry.capabilityId === `source.${name}` || entry.capabilityId.endsWith(`.${name}`)));
  if (!cap) return { state: "UNKNOWN", reasonCode: null };
  const state = cap.state.toUpperCase();
  return {
    state: state === "AVAILABLE" || state === "EMPTY" || state === "PARTIAL" || state === "UNAVAILABLE" ? state : "UNKNOWN",
    reasonCode: cap.reasonCode,
  };
}

/** The reason code to print when a relation produced no row, or `undefined` when the source said nothing. */
export function absentCodeFor(profile: ProfileEnvelope, relation: string): string | undefined {
  const branch = branchOf(profile, relation);
  if (branch.state === "UNAVAILABLE" || branch.state === "EMPTY" || branch.state === "PARTIAL") return branch.reasonCode ?? branch.state;
  return undefined;
}

function rowsOf(profile: ProfileEnvelope, relation: string): readonly Row[] {
  return profile.data[relation] ?? [];
}

/** A row belongs to this account unless it names another one. */
function mine(row: Row, accountId: string): boolean {
  const id = text(row.account_id);
  return id === null || id === accountId;
}

function latestBy(rows: readonly Row[], key: string): Row | null {
  let best: Row | null = null;
  let bestAt = -1;
  for (const row of rows) {
    const at = timeOf(row, key) ?? 0;
    if (best === null || at >= bestAt) {
      best = row;
      bestAt = at;
    }
  }
  return best;
}

export interface Sleeve {
  accountId: string;
  label: string;
  current: boolean;
  portfolio: string | null;
}

export interface BalanceFacts {
  currency: string;
  total: Metric | null | undefined;
  free: Metric | null | undefined;
  locked: Metric | null | undefined;
  asOf: UtcEpochMs | null;
}

export interface MarginFacts {
  initial: Metric | null | undefined;
  maintenance: Metric | null | undefined;
  /** Several instrument rows and no account row: no account total is published. */
  perInstrumentOnly: boolean;
}

export interface HeadroomFacts {
  free: Metric | null | undefined;
  maintenance: Metric | null | undefined;
  headroom: Metric | null | undefined;
  /** The source's own verdict word; the browser never derives one. */
  verdict: "AVAILABLE" | "BREACHED" | "UNKNOWN";
}

export interface DiffFacts {
  internal: Metric | null | undefined;
  broker: Metric | null | undefined;
  delta: Metric | null | undefined;
  /** The source's verdict; `null` when it published none. */
  inSync: boolean | null;
}

export interface BrokerFacts {
  buyingPower: Metric | null | undefined;
  status: string | null;
  asOf: UtcEpochMs | null;
}

export interface PositionFacts {
  id: string;
  symbol: string | null;
  side: string | null;
  quantity: Metric | null | undefined;
  notional: Metric | null | undefined;
  unrealized: Metric | null | undefined;
  currency: string | null;
}

export interface AllocationFacts {
  id: string;
  alpha: string | null;
  deployment: string | null;
  portfolio: string | null;
  mode: string | null;
  allocation: Metric | null | undefined;
  currency: string | null;
}

export interface SyncEntry {
  id: string;
  source: string;
  at: UtcEpochMs | null;
  status: { kind: FlagKind; label: string };
  detail: Metric | null | undefined;
}

export interface AccountIdentity {
  accountId: string;
  label: string;
  venue: string | null;
  baseCurrency: string | null;
  state: string | null;
  /** Published `account_type` / margin mode word, when there is one. */
  marginMode: string | null;
  portfolios: readonly string[];
  environment: BindingEnv | null;
  bindingId: string | null;
}

export interface AccountView {
  identity: AccountIdentity;
  /** Distinct currencies the account's own ledger rows name, sorted. */
  currencies: readonly string[];
  sleeves: readonly Sleeve[];
  deployments: readonly { id: string; mode: string | null; stage: string | null }[];
  positions: readonly PositionFacts[];
  allocations: readonly AllocationFacts[];
  sync: readonly SyncEntry[];
  /** Every relation the source reported unavailable or empty, for the header note. */
  gaps: readonly { relation: string; code: string }[];
}

const SENSITIVE = /(^|_)(secret|credential|password|token|dsn|external_account_ref|raw)(_|$)/;

/** Allow-list read: nothing outside these keys is ever copied into a view. */
export function readAccountView(profile: ProfileEnvelope, accountId: string): AccountView {
  const accountRows = rowsOf(profile, "accounts").filter((row) => mine(row, accountId));
  const account = accountRows.find((row) => text(row.account_id) === accountId) ?? accountRows[0] ?? null;
  const deployments = rowsOf(profile, "deployments").filter((row) => text(row.account_id) === accountId);
  const venueRows = rowsOf(profile, "venue_accounts");
  const venueRow = venueRows.find((row) => text(row.account_id) === accountId) ?? null;
  const bindingId = venueRow ? text(venueRow.binding_id) : null;

  const portfolioOf = (id: string): string | null => {
    const names = [...new Set(rowsOf(profile, "deployments").filter((row) => text(row.account_id) === id).flatMap((row) => {
      const pf = text(row.portfolio_id);
      return pf ? [pf] : [];
    }))];
    return names.length > 0 ? names.join(", ") : null;
  };

  const labelOf = (row: Row | null, id: string): string => (row ? text(row.label) ?? text(row.display_name) ?? text(row.name) : null) ?? id;

  // Sleeves: every logical account the venue rows put on this binding. With no
  // binding id published there is exactly one sleeve we can name: this one.
  const sharedIds = bindingId === null
    ? []
    : [...new Set(venueRows.filter((row) => text(row.binding_id) === bindingId).flatMap((row) => {
        const id = text(row.account_id);
        return id ? [id] : [];
      }))];
  const ids = sharedIds.includes(accountId) || sharedIds.length === 0 ? [...new Set([accountId, ...sharedIds])] : sharedIds;
  const allAccountRows = rowsOf(profile, "accounts");
  const sleeves: Sleeve[] = ids.map((id) => ({
    accountId: id,
    label: labelOf(allAccountRows.find((row) => text(row.account_id) === id) ?? null, id),
    current: id === accountId,
    portfolio: portfolioOf(id),
  }));

  const environment = profile.selectedEnvironment;
  const balances = rowsOf(profile, "account_balances").filter((row) => mine(row, accountId));
  const margins = rowsOf(profile, "margin_balances").filter((row) => mine(row, accountId));
  const headrooms = rowsOf(profile, "exposure_headroom");
  const currencies = [...new Set([...balances, ...margins, ...headrooms].flatMap((row) => {
    const ccy = text(row.currency);
    return ccy ? [ccy] : [];
  }))].sort((a, b) => a.localeCompare(b));

  const positions: PositionFacts[] = rowsOf(profile, "positions")
    .filter((row) => mine(row, accountId))
    .slice(0, ROW_CAP)
    .map((row, index) => ({
      id: text(row.position_id) ?? `position-${index}`,
      symbol: text(row.instrument_id),
      side: text(row.side),
      quantity: metricOf(row.quantity, "qty"),
      notional: metricOf(row.notional, "money"),
      unrealized: metricOf(row.unrealized_pnl, "money"),
      currency: text(row.currency),
    }));

  const allocations: AllocationFacts[] = rowsOf(profile, "portfolio_allocations")
    .filter((row) => text(row.account_id) === accountId)
    .slice(0, ROW_CAP)
    .map((row, index) => ({
      id: `${text(row.portfolio_id) ?? "pf"}:${text(row.deployment_id) ?? text(row.strategy_id) ?? index}`,
      alpha: text(row.strategy_id),
      deployment: text(row.deployment_id),
      portfolio: text(row.portfolio_id),
      mode: text(row.mode),
      allocation: metricOf(row.allocated_capital, "money"),
      currency: text(row.currency),
    }));

  const syncRows: { row: Row; source: string }[] = [
    ...rowsOf(profile, "account_sync").filter((row) => mine(row, accountId)).map((row) => ({ row, source: text(row.source) ?? "EXECUTION" })),
    ...rowsOf(profile, "broker_sync").map((row) => ({ row, source: text(row.source) ?? "BROKER" })),
  ];
  const sync: SyncEntry[] = syncRows
    .map(({ row, source }, index) => ({
      id: text(row.sync_id) ?? `${source}-${index}`,
      source,
      at: timeOf(row, "synced_at") ?? timeOf(row, "created_at"),
      status: syncView(text(row.status)),
      detail: metricOf(row.buying_power, "money"),
    }))
    // Newest first; a row with no published time sorts last and says so.
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1))
    .slice(0, ROW_CAP);

  const gaps: { relation: string; code: string }[] = [];
  for (const relation of ["account_balances", "margin_balances", "broker_sync", "differences", "exposure_headroom", "positions"]) {
    const code = absentCodeFor(profile, relation);
    if (code) gaps.push({ relation, code });
  }

  const typeWord = account ? text(account.account_type) : null;
  return {
    identity: {
      accountId,
      label: labelOf(account, accountId),
      venue: (account ? text(account.venue) : null) ?? (venueRow ? text(venueRow.venue) : null),
      baseCurrency: account ? text(account.base_currency) : null,
      state: account ? text(account.state) : null,
      marginMode: typeWord && !SENSITIVE.test(typeWord.toLowerCase()) ? typeWord : null,
      portfolios: [...new Set(deployments.flatMap((row) => {
        const pf = text(row.portfolio_id);
        return pf ? [pf] : [];
      }))],
      environment,
      bindingId,
    },
    currencies,
    sleeves,
    deployments: deployments.flatMap((row) => {
      const id = text(row.deployment_id);
      return id ? [{ id, mode: text(row.mode), stage: text(row.stage) }] : [];
    }).slice(0, ROW_CAP),
    positions,
    allocations,
    sync,
    gaps,
  };
}

/**
 * How many position rows the source published for this account. Absent when the
 * relation is missing or the source says it is unavailable: an unpublished
 * relation is not a count of zero.
 */
export function positionCount(profile: ProfileEnvelope, accountId: string): Metric | null | undefined {
  if (profile.data.positions === undefined || branchOf(profile, "positions").state === "UNAVAILABLE") return undefined;
  return countMetric(rowsOf(profile, "positions").filter((row) => mine(row, accountId)).length);
}

/** The currency the page speaks in: the URL's if it is one of the account's, else the base, else the first. */
export function chooseCurrency(view: AccountView, requested: string | null): string | null {
  if (requested !== null && view.currencies.includes(requested)) return requested;
  const base = view.identity.baseCurrency;
  if (base !== null && view.currencies.includes(base)) return base;
  return view.currencies[0] ?? null;
}

function forCurrency(rows: readonly Row[], currency: string | null): readonly Row[] {
  return currency === null ? rows : rows.filter((row) => text(row.currency) === currency);
}

export function balanceFacts(profile: ProfileEnvelope, accountId: string, currency: string | null): BalanceFacts | null {
  const rows = forCurrency(rowsOf(profile, "account_balances").filter((row) => mine(row, accountId)), currency);
  const row = latestBy(rows, "updated_at");
  if (row === null) return null;
  return {
    currency: text(row.currency) ?? currency ?? "",
    total: metricOf(row.total, "money"),
    free: metricOf(row.free, "money"),
    locked: metricOf(row.locked, "money"),
    asOf: timeOf(row, "updated_at"),
  };
}

export function marginFacts(profile: ProfileEnvelope, accountId: string, currency: string | null): MarginFacts | null {
  const rows = forCurrency(rowsOf(profile, "margin_balances").filter((row) => mine(row, accountId)), currency);
  if (rows.length === 0) return null;
  const accountLevel = rows.filter((row) => text(row.instrument_id) === null);
  const pick = accountLevel.length > 0 ? latestBy(accountLevel, "updated_at") : rows.length === 1 ? rows[0]! : null;
  if (pick === null) return { initial: undefined, maintenance: undefined, perInstrumentOnly: true };
  return { initial: metricOf(pick.initial, "money"), maintenance: metricOf(pick.maintenance, "money"), perInstrumentOnly: false };
}

export function headroomFacts(profile: ProfileEnvelope, currency: string | null): HeadroomFacts | null {
  const rows = forCurrency(rowsOf(profile, "exposure_headroom"), currency);
  const row = rows[0] ?? null;
  if (row === null) return null;
  const verdict = text(row.verdict)?.toUpperCase();
  return {
    free: metricOf(row.free, "money"),
    maintenance: metricOf(row.maintenance, "money"),
    headroom: metricOf(row.headroom, "money"),
    verdict: verdict === "AVAILABLE" ? "AVAILABLE" : verdict === "BREACHED" ? "BREACHED" : "UNKNOWN",
  };
}

export function diffFacts(profile: ProfileEnvelope, currency: string | null): DiffFacts | null {
  const rows = forCurrency(rowsOf(profile, "differences"), currency);
  const row = rows[0] ?? null;
  if (row === null) return null;
  return {
    internal: metricOf(row.portal_free, "money"),
    broker: metricOf(row.broker_buying_power, "money"),
    delta: metricOf(row.delta, "money"),
    inSync: typeof row.in_sync === "boolean" ? row.in_sync : null,
  };
}

export function brokerFacts(profile: ProfileEnvelope, currency: string | null): BrokerFacts | null {
  const rows = forCurrency(rowsOf(profile, "broker_sync"), currency);
  const row = latestBy(rows.length > 0 ? rows : rowsOf(profile, "broker_sync"), "synced_at");
  if (row === null) return null;
  return {
    buyingPower: metricOf(row.buying_power, "money"),
    status: text(row.status),
    asOf: timeOf(row, "synced_at"),
  };
}

/* ── Triad rows ─────────────────────────────────────────────────────────── */

export interface TriadModel {
  rows: readonly TriadRow[];
  internal: { asOf: UtcEpochMs | null } | null;
  broker: { asOf: UtcEpochMs | null } | null;
}

const SHARED: TriadCell = { kind: "not-computed", reason: "SHARED_BINDING" };

/**
 * Internal, Broker and Difference rows for one currency.
 *
 * The Difference column is the source's `delta` where the source published
 * one for matching scopes. On a shared binding with no published difference,
 * the broker balance cannot be split among sleeves (R10): those cells are
 * `Not computed · SHARED_BINDING`. Where the source simply has no figure the
 * cell stays `undefined` and prints `Not available`.
 */
export function triadModel(profile: ProfileEnvelope, accountId: string, currency: string | null, shared: boolean): TriadModel {
  const bal = balanceFacts(profile, accountId, currency);
  const margin = marginFacts(profile, accountId, currency);
  const diff = diffFacts(profile, currency);
  const broker = brokerFacts(profile, currency);
  const sharedCell = (): TriadCell => (shared ? SHARED : undefined);
  // `a` wins whenever the source provided the key, including a malformed value
  // (`null`): a bad figure must stay visibly bad, never be replaced by another.
  const pick = (a: TriadCell, b: TriadCell): TriadCell => (a !== undefined ? a : b);

  const rows: TriadRow[] = [
    {
      key: "free",
      label: "Free cash / buying power",
      suffix: currency ?? undefined,
      internal: pick(diff?.internal, bal?.free),
      // A whole-account buying power next to one sleeve's free cash is the wrong
      // scope: on a shared binding the broker side of this row is not computed.
      broker: diff !== null ? diff.broker : shared ? SHARED : broker?.buyingPower,
      difference: diff !== null ? diff.delta : sharedCell(),
    },
    { key: "total", label: "Account balance", suffix: currency ?? undefined, internal: bal?.total, broker: sharedCell(), difference: sharedCell() },
    { key: "locked", label: "Cash locked", suffix: currency ?? undefined, internal: bal?.locked },
    { key: "initial", label: "Initial margin", suffix: currency ?? undefined, internal: margin?.initial, broker: sharedCell(), difference: sharedCell() },
    { key: "maintenance", label: "Maintenance", suffix: currency ?? undefined, internal: margin?.maintenance, broker: sharedCell(), difference: sharedCell() },
    { key: "positions", label: "Positions", internal: positionCount(profile, accountId) },
  ];
  return {
    rows,
    internal: bal === null && margin === null ? null : { asOf: bal?.asOf ?? null },
    broker: broker === null ? null : { asOf: broker.asOf },
  };
}

/* ── shared-ness and the sleeve table ───────────────────────────────────── */

export interface Population {
  /** More than one logical account sits on the binding, by the venue rows or the exposure read. */
  shared: boolean;
  /** Sleeves the account resource names. */
  published: number;
  /** Sleeves the exposure read says exist; null when it was not read. */
  expected: number | null;
  /** Fewer sleeves published than expected: the table is a part, not the whole. */
  partial: boolean;
}

export function populationOf(view: AccountView, exposure: BindingExposure | null): Population {
  const published = view.sleeves.length;
  const expected = exposure?.expectedAccountCount ?? null;
  return {
    shared: published > 1 || (expected !== null && expected > 1),
    published,
    expected,
    partial: expected !== null && expected > published,
  };
}

export interface SleeveRow extends Sleeve {
  internal: Metric | null | undefined;
}

export function sleeveRows(profile: ProfileEnvelope, view: AccountView, currency: string | null): readonly SleeveRow[] {
  return view.sleeves.map((sleeve) => {
    const rows = forCurrency(rowsOf(profile, "account_balances").filter((row) => text(row.account_id) === sleeve.accountId), currency);
    const row = latestBy(rows, "updated_at");
    return { ...sleeve, internal: row === null ? undefined : metricOf(row.total, "money") };
  });
}

/* ── margin coverage ────────────────────────────────────────────────────── */

export function coverageFlag(verdict: HeadroomFacts["verdict"]): { kind: FlagKind; label: string } {
  switch (verdict) {
    case "AVAILABLE": return { kind: "ok", label: "Covered" };
    case "BREACHED": return { kind: "attention", label: "Not covered" };
    default: return { kind: "unknown", label: "Coverage unknown" };
  }
}

/* ── equity chart ───────────────────────────────────────────────────────── */

export interface EquityModel {
  points: readonly SeriesPoint[];
  currency: string | null;
  state: { kind: "ready" } | { kind: "partial"; reason: string } | { kind: "unavailable"; copy: string; reason?: string };
}

/**
 * The published series for the chosen currency, untouched. Series of other
 * currencies are never joined to it; when none matches the chart says so.
 */
export function equityModel(chart: FinancialChartPayload | null, currency: string | null): EquityModel {
  if (chart === null) return { points: [], currency, state: { kind: "unavailable", copy: "Not available", reason: "The account equity series could not be read." } };
  const state = chart.state.toUpperCase();
  const series = chart.series.find((entry) => currency !== null && entry.currency === currency) ?? (currency === null ? chart.series[0] ?? null : null);
  if (series === null || series.points.length === 0) {
    const why = state === "EMPTY" ? "No series is published for this account." : chart.reasonCode ?? "No series is published for this currency.";
    return { points: [], currency, state: { kind: "unavailable", copy: "Not available", reason: why } };
  }
  const points: SeriesPoint[] = series.points.flatMap(([t, v]) => {
    const at = readUtcEpochMs(t);
    return at === null ? [] : [{ t: at, v }];
  });
  if (state === "PARTIAL") return { points, currency: series.currency, state: { kind: "partial", reason: chart.reasonCode ?? "The source published part of the series." } };
  if (state === "READY") return { points, currency: series.currency, state: { kind: "ready" } };
  return { points: [], currency, state: { kind: "unavailable", copy: "Not available", reason: chart.reasonCode ?? `The series panel is ${state.toLowerCase()}.` } };
}

/* ── binding exposure (capital invariant) ───────────────────────────────── */

export interface CapitalRow {
  currency: string;
  used: Metric | null | undefined;
  reserved: Metric | null | undefined;
  available: Metric | null | undefined;
  headroom: Metric | null | undefined;
  /** The sign of the PUBLISHED headroom; null when there is none. */
  withinPhysical: boolean | null;
}

export function capitalRows(exposure: BindingExposure | null): readonly CapitalRow[] {
  if (exposure === null) return [];
  return exposure.buckets.slice(0, ROW_CAP).map((bucket) => {
    const headroom = bucket.headroom as string | null;
    return {
      currency: bucket.currency,
      used: metricOf(bucket.used === null ? null : (bucket.used as string), "money"),
      reserved: metricOf(bucket.reserved === null ? null : (bucket.reserved as string), "money"),
      available: metricOf(bucket.available === null ? null : (bucket.available as string), "money"),
      headroom: metricOf(headroom, "money"),
      withinPhysical: headroom === null ? null : !isNegative(headroom),
    };
  });
}

/* ── activity ───────────────────────────────────────────────────────────── */

export interface ActivityRow {
  id: string;
  at: UtcEpochMs;
  kind: FlagKind;
  kindLabel: string;
  target: string;
  outcome: string;
}

const ORDER_STATUS: Readonly<Record<string, { kind: FlagKind; label: string }>> = {
  FILLED: { kind: "applied", label: "Filled" },
  PARTIALLY_FILLED: { kind: "partial", label: "Partly filled" },
  NEW: { kind: "pending", label: "Open" },
  OPEN: { kind: "pending", label: "Open" },
  SUBMITTED: { kind: "pending", label: "Submitted" },
  CANCELED: { kind: "paused", label: "Canceled" },
  CANCELLED: { kind: "paused", label: "Canceled" },
  REJECTED: { kind: "rejected", label: "Rejected" },
  EXPIRED: { kind: "paused", label: "Expired" },
};

function plain(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function shownDecimal(value: unknown, unit: ExactUnit): string | null {
  if (typeof value !== "string") return null;
  return readDecimal(value, { unit })?.display ?? null;
}

/** Subject-activity records as feed rows, in the order the source gave them. Rows with no readable time are counted, not guessed. */
export function activityRows(page: SubjectActivityPage, relation: "orders" | "fills"): { rows: readonly ActivityRow[]; withoutTime: number } {
  let withoutTime = 0;
  const rows: ActivityRow[] = [];
  for (const record of page.records) {
    const values = record.values as Row;
    const at = timeOf(values, "submitted_at") ?? timeOf(values, "trade_time") ?? timeOf(values, "filled_at") ?? timeOf(values, "ts") ?? timeOf(values, "updated_at") ?? timeOf(values, "created_at");
    if (at === null) {
      withoutTime += 1;
      continue;
    }
    const status = plain(values.status)?.toUpperCase() ?? null;
    const known = status !== null && Object.hasOwn(ORDER_STATUS, status) ? ORDER_STATUS[status]! : null;
    const side = plain(values.side);
    const qty = shownDecimal(values.quantity, "qty") ?? shownDecimal(values.qty, "qty");
    const price = shownDecimal(values.price, "money");
    const outcomeParts = [side, qty, price === null ? null : `at ${price}`].filter((part): part is string => part !== null);
    rows.push({
      id: record.recordId,
      at,
      kind: relation === "fills" ? "applied" : known?.kind ?? "neutral",
      kindLabel: relation === "fills" ? "Fill" : known?.label ?? (status === null ? "Order" : humanize(status)),
      target: plain(values.instrument_id) ?? plain(values.symbol) ?? "Instrument not published",
      outcome: outcomeParts.length > 0 ? outcomeParts.join(" ") : "Detail not published",
    });
    if (rows.length >= ROW_CAP) break;
  }
  return { rows, withoutTime };
}

/* ── tabs and views ─────────────────────────────────────────────────────── */

export const TABS = [
  { id: "ov", label: "Overview" },
  { id: "pos", label: "Positions" },
  { id: "all", label: "Allocations" },
  { id: "fee", label: "Fees & funding" },
  { id: "rec", label: "Reconciliation" },
  { id: "act", label: "Activity" },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function readTab(raw: string | null): { tab: TabId; notice: string | null } {
  if (raw === null || raw === "") return { tab: "ov", notice: null };
  const hit = TABS.find((entry) => entry.id === raw.toLowerCase());
  if (hit) return { tab: hit.id, notice: null };
  return { tab: "ov", notice: `Tab "${raw}" is not available. Showing Overview.` };
}

export type AccountViewMode = "sleeve" | "physical";
export const readViewMode = (raw: string | null): AccountViewMode => (raw === "physical" ? "physical" : "sleeve");

export function stageWord(mode: string | null): string {
  switch ((mode ?? "").toLowerCase()) {
    case "live": return "Real-funded";
    case "paper": return "Paper";
    case "sandbox": return "Sandbox";
    default: return mode === null ? "Not available" : humanize(mode);
  }
}

/**
 * The V1 route of a deployment, by the mode it runs in. A Canary deployment has
 * its own control room under the live route (`/live/:id/canary`); `stage` is
 * read from the source when it publishes one, and a `canary` mode counts too.
 */
export function deploymentHref(deployment: string, mode: string | null, stage: string | null = null): string {
  const id = encodeURIComponent(deployment);
  if ((stage ?? "").toLowerCase() === "canary" || (mode ?? "").toLowerCase() === "canary") return `/deployments/live/${id}/canary`;
  const lane = mode === "paper" || mode === "sandbox" ? mode : "live";
  return `/deployments/${lane}/${id}`;
}
export const alphaHref = (id: string): string => `/deployments/alphas/${encodeURIComponent(id)}`;
export const portfolioHref = (id: string): string => `/deployments/portfolios/${encodeURIComponent(id)}`;
export const accountHref = (id: string): string => `/deployments/accounts/${encodeURIComponent(id)}`;
export const ACCOUNTS_PATH = "/deployments/accounts";
export const ACCESS_PATH = "/administration/profile-access";

/* ── ledger facts that sit on the account-equity rows ───────────────────── */

export interface LedgerPnl {
  unrealized: Metric | null | undefined;
  fees: Metric | null | undefined;
  funding: Metric | null | undefined;
  asOf: UtcEpochMs | null;
}

/**
 * The newest `account_equity` row's own figures. They are CURRENT source facts,
 * not a window; the Fees tab says so and keeps the windowed figures
 * `Not published (FE-025)`.
 */
export function ledgerPnl(profile: ProfileEnvelope, accountId: string, currency: string | null): LedgerPnl | null {
  const rows = forCurrency(rowsOf(profile, "account_equity").filter((row) => mine(row, accountId)), currency);
  const row = latestBy(rows, "ts");
  if (row === null) return null;
  return {
    unrealized: metricOf(row.unrealized_pnl, "money"),
    fees: metricOf(row.fee_total, "money"),
    funding: metricOf(row.funding_pnl, "money"),
    asOf: timeOf(row, "ts"),
  };
}

/* ── resource state ─────────────────────────────────────────────────────── */

export type ResourceStatus = "ok" | "empty" | "partial" | "stale" | "unavailable" | "denied";

export function resourceStatus(profile: ProfileEnvelope): ResourceStatus {
  switch (profile.state) {
    case "ready": return "ok";
    case "empty": return "empty";
    case "partial": return "partial";
    case "stale": return "stale";
    case "unavailable": return "unavailable";
    case "denied": return "denied";
    default: return "partial";
  }
}

/** Why a resource is not whole, in the source's own codes. */
export function resourceReason(profile: ProfileEnvelope): string | undefined {
  const codes = [...profile.unavailableBranches, ...profile.capabilities.flatMap((entry) => (entry.reasonCode ? [entry.reasonCode] : []))];
  return codes.length > 0 ? [...new Set(codes)].join(" · ") : undefined;
}

export const RELATION_LABEL: Readonly<Record<string, string>> = {
  account_balances: "Account balances",
  margin_balances: "Margin",
  broker_sync: "Broker sync",
  differences: "Differences",
  exposure_headroom: "Headroom",
  positions: "Positions",
};
