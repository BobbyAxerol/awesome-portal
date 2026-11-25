/**
 * Paper workbench view-model: one `ProfileEnvelope` (and, when it has arrived,
 * the execution-quality derivation) in, the facts the screen may print out.
 *
 * Rules this file keeps (AGENT_WORKING_RULES, CLAUDE.md s3, S3 plan D13):
 *
 *   - Money, quantities and counts are published decimal strings. They cross
 *     the boundary through `readDecimal` and come out as a `Figure`: a value,
 *     an absence, or "present but unreadable". A JS number, an exponent, `-0`
 *     or a leading zero is never repaired and never printed.
 *   - Nothing is computed that the source did not publish: no age ("Stale 14m"),
 *     no drawdown, no band, no stage history, no Long/Short/Gross. A fact with
 *     no source is a `Not published (FE-xxx)` in the screen, not a field here.
 *   - Booleans are read with `typeof`, never `=== true` (failClosed gate).
 *   - Words are mapped through closed tables. A word the table does not know is
 *     "Unknown" and the word itself is never printed or kept, so a hostile or
 *     newer enum can neither read as a success state nor reach the DOM.
 *   - Free text (ids, symbols) is refused whole when it is longer than
 *     `MAX_TEXT` or holds control or bidi-override characters; it is never
 *     truncated into a different id.
 *   - A table keeps the 200 newest rows (`PAGE_CAP`) and says "Showing 200 of N"
 *     with the best published N; the profile page itself is bounded at 200.
 */
import type { DeploymentQuality } from "../../../api/derivations";
import type { ProfileEnvelope } from "../../../api/profileRead";
import type { ExactUnit } from "../../../formatExact";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { unsafeText } from "../../../unsafeText";
import { formatAsOf, readDecimal, type BoundaryDecimal } from "../../boundary";
import type { StageTab } from "../../blocks";
import type { ChartSegment, ChartState, SeriesPoint, ServerEnvelope } from "../../charts";
import type { FlagKind } from "../../flagKinds";
import {
  readDeploymentIdentity,
  readPositionsBySide,
  readStageFacts,
  readVenueCalendar,
  type PositionsBySide,
  type StageFacts,
  type VenueCalendar,
} from "../../../stageFacts";
import { runtimeFactOf } from "../../readers/stageFactViews";
import { stageIdentity, type StageIdentity } from "../stage/identity";

/* ── constants ────────────────────────────────────────────────────────────── */

/** Rows a table draws. The profile schema bounds each branch at 200 as well. */
export const PAGE_CAP = 200;
/** Longest id, symbol or word the screen prints. Longer is refused, not cut. */
export const MAX_TEXT = 256;

export const WORKBENCH_SCREEN_KEY = "workbench" as const;

export const WB_TABS: readonly StageTab[] = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "fills", label: "Fills" },
  { id: "positions", label: "Positions" },
  { id: "sessions", label: "Sessions" },
];
export type WbTab = "overview" | "orders" | "fills" | "positions" | "sessions";
export const isWbTab = (value: string): value is WbTab => WB_TABS.some((tab) => tab.id === value);

type Row = Record<string, unknown>;

/* ── primitives ───────────────────────────────────────────────────────────── */

// Control characters and the bidi overrides: an id that carries them can reorder what is printed beside it (one shared set: unsafeText.ts).

/** A non-empty, bounded, printable string; a safe integer is a legal id (order ids arrive as numbers). */
export function text(value: unknown): string | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  if (value.trim() === "" || value.length > MAX_TEXT || unsafeText(value)) return null;
  return value;
}

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);

/** A count: a safe non-negative integer, or its digit string. */
export function count(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  if (typeof value === "string" && /^(0|[1-9]\d{0,15})$/.test(value)) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/** A published figure: absent, present-but-unreadable, or a boundary decimal. Never a zero for a gap. */
export type Figure =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "value"; decimal: BoundaryDecimal };

export function figure(raw: unknown, unit: ExactUnit, dp?: number): Figure {
  if (raw === undefined || raw === null) return { kind: "absent" };
  // Money and quantities are decimal STRINGS only. A count is an integer, which a JSON number carries exactly
  // (as long as it is a safe integer), so a count may arrive as either; anything else is refused whole.
  const source = unit !== "count" ? raw
    : typeof raw === "number" ? (Number.isSafeInteger(raw) && raw >= 0 ? String(raw) : null)
      // A count string is digits only: "2.5" would otherwise round to 3 on the way to the page.
      : typeof raw === "string" && /^(0|[1-9]\d{0,15})$/.test(raw) ? raw : null;
  const decimal = source === null ? null : readDecimal(source, { unit, dp });
  return decimal === null ? { kind: "unreadable" } : { kind: "value", decimal };
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** An instant as UTC epoch ms: an integer epoch, or an ISO-8601 string. Anything else is null. */
export function instantMs(raw: unknown): UtcEpochMs | null {
  if (typeof raw === "number") return readUtcEpochMs(raw);
  if (typeof raw !== "string" || raw.length > 64 || !ISO_INSTANT.test(raw)) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : readUtcEpochMs(parsed);
}

/** The first of `keys` that reads as an instant (`ts_ms` wins over `ts`). */
function timeOf(row: Row, ...keys: string[]): UtcEpochMs | null {
  for (const key of keys) {
    const at = instantMs(row[key]);
    if (at !== null) return at;
  }
  return null;
}

/** Words a published code may be shown as: `SOURCE_GAP` -> `Source gap`. Only for codes the screen already vets. */
export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
/** A reason code as the source wrote it. */
export function code(value: unknown): string | null {
  return typeof value === "string" && CODE.test(value) ? value : null;
}

const CURRENCY = /^[A-Za-z0-9]{2,12}$/;
const currencyOf = (value: unknown): string | null => (typeof value === "string" && CURRENCY.test(value) ? value : null);

function branchPublished(envelope: ProfileEnvelope, key: string): boolean {
  return Object.hasOwn(envelope.data, key);
}

function rowsOf(envelope: ProfileEnvelope, key: string): readonly Row[] {
  const rows = envelope.data[key];
  return Array.isArray(rows) ? rows.filter(isRow) : [];
}

/* ── deployment ───────────────────────────────────────────────────────────── */

export interface DeploymentFacts {
  deploymentId: string | null;
  /** The alpha: the profile names it by id only (FE-066). */
  strategyId: string | null;
  portfolioId: string | null;
  accountId: string | null;
  /** The deployment's own policy and risk-profile ids, when the source states them; null = stated null or not stated. */
  accountPolicyId?: string | null;
  riskProfileId?: string | null;
  venue: string | null;
  mode: string | null;
  updatedAtMs: UtcEpochMs | null;
  /** The source's own `active` flag; "not a health check" (V1 note). null = not published or unreadable. */
  sourceActive: boolean | null;
}

export function readDeployment(envelope: ProfileEnvelope): DeploymentFacts | null {
  const raw: unknown = envelope.objects.deployment ?? rowsOf(envelope, "deployments")[0] ?? null;
  if (!isRow(raw)) return null;
  const active = raw.active;
  return {
    deploymentId: text(raw.deployment_id),
    strategyId: text(raw.strategy_id),
    portfolioId: text(raw.portfolio_id),
    accountId: text(raw.account_id),
    accountPolicyId: text(raw.account_policy_id),
    riskProfileId: text(raw.risk_profile_id),
    venue: text(raw.venue),
    mode: text(raw.mode),
    updatedAtMs: timeOf(raw, "updated_at_ms", "updated_at"),
    sourceActive: typeof active === "boolean" ? active : null,
  };
}

/* ── page state ───────────────────────────────────────────────────────────── */

export type ReplaceStatus = "empty" | "unavailable" | "denied" | "terminal";
export interface PageState {
  /** A state that replaces the body. */
  replace: { status: ReplaceStatus; reason: string } | null;
  /** States that keep the body and say what is demoted. */
  partial: string | null;
  stale: string | null;
  /**
   * The hi-fi's "nq": the profile answers but its source is not qualified (`state: "unavailable"`). The page keeps its
   * frame and every figure is "Not available"; `reasons` are the codes the profile itself published, as given.
   */
  nq: { reasons: readonly string[] } | null;
}

/** The two published profile schemas; a newer version is a body this build was not written for. */
const SCHEMAS: ReadonlySet<string> = new Set(["execution.paper-workbench.v1", "execution.paper-workbench-vnm.v1"]);

export function pageState(envelope: ProfileEnvelope, deployment: DeploymentFacts | null): PageState {
  const none: PageState = { replace: null, partial: null, stale: null, nq: null };
  const replace = (status: ReplaceStatus, reason: string): PageState => ({ ...none, replace: { status, reason } });
  // A body that breaks the published schema is not the contract this screen claims, whatever version it names (paperRead.ts).
  if (!SCHEMAS.has(envelope.schemaVersion) || (envelope.schemaViolations?.length ?? 0) > 0) {
    return replace("terminal", "The Portal answered with a body that is not a paper-workbench profile.");
  }
  // Exact words: the published enum is lower case, and a case or spacing variant is a word this build does not know.
  const state = envelope.state;
  if (state === "denied") return replace("denied", "The Portal withheld this deployment's profile from your session.");
  if (state === "unavailable") return { ...none, nq: { reasons: reasonCodesOf(envelope) } };
  if (!["ready", "ok", "partial", "stale", "empty"].includes(state)) {
    return replace("unavailable", "The profile answered a state this build does not know.");
  }
  if (state === "empty" || deployment === null) return replace("empty", "No deployment is present in the profile the Portal returned.");
  const partial = state === "partial" || (envelope.completeness !== null && envelope.completeness !== "COMPLETE")
    ? "Some branches or rows may be missing."
    : null;
  const stale = state === "stale" || envelope.freshness === "STALE"
    ? "No update within the freshness budget."
    : null;
  return { replace: null, partial, stale, nq: null };
}

/** The reason codes a profile published for what it could not serve, as given, at most three. */
function reasonCodesOf(envelope: ProfileEnvelope): readonly string[] {
  const found = [...envelope.capabilities.map((c) => code(c.reasonCode)), ...envelope.unavailableBranches.map((b) => code(b))];
  return [...new Set(found.filter((c): c is string => c !== null))].slice(0, 3);
}

/* ── freshness (a state, never an age) ────────────────────────────────────── */

export interface FreshnessFacts {
  kind: "fresh" | "stale" | "aging" | "paused" | "unknown" | "not-published";
  label: string;
  /** The source's as-of, when it published one. */
  asOfMs: UtcEpochMs | null;
}

/** The source's as-of: the epoch clock when it published one, else its ISO instant. */
export function envelopeAsOf(envelope: ProfileEnvelope): UtcEpochMs | null {
  return (envelope.asOfMs === null ? null : readUtcEpochMs(envelope.asOfMs)) ?? instantMs(envelope.asOf);
}

/** When the Portal read the profile: the epoch clock when published, else its ISO instant. Never the as-of (a different fact). */
export function envelopeReadAt(envelope: ProfileEnvelope): UtcEpochMs | null {
  return (envelope.readAtMs === null ? null : readUtcEpochMs(envelope.readAtMs)) ?? instantMs(envelope.readAt);
}

/**
 * A run the server publishes as STOPPED has ended: its last read is the end of the record, so the chip says "Ended <date>" in a neutral
 * state, never a green "Fresh" next to a read 36 days later (QA8 N8a-05). The date is the runtime's own `since`, as published.
 */
export function endedFreshness(freshness: FreshnessFacts, facts: StageFacts | null): FreshnessFacts {
  const runtime = runtimeFactOf(facts);
  if (runtime === null || runtime.state.kind !== "value" || runtime.state.value !== "STOPPED" || runtime.sinceMs.kind !== "value") return freshness;
  return { kind: "paused", label: `Ended · ${formatAsOf(runtime.sinceMs.value as UtcEpochMs)}`, asOfMs: freshness.asOfMs };
}

export function freshnessOf(envelope: ProfileEnvelope): FreshnessFacts {
  const asOfMs = envelopeAsOf(envelope);
  switch (envelope.freshness) {
    case "FRESH": return { kind: "fresh", label: "Fresh", asOfMs };
    case "STALE": return { kind: "stale", label: "Stale", asOfMs };
    case "AGING": return { kind: "aging", label: "Aging", asOfMs };
    case "PAUSED": return { kind: "paused", label: "Paused", asOfMs };
    case null: return { kind: "not-published", label: "No freshness published", asOfMs };
    default: return { kind: "unknown", label: "Freshness unknown", asOfMs };
  }
}

/* ── observation gate (the verdict is the server's) ───────────────────────── */

export type GateVerdict = "met" | "available" | "partial" | "blocked" | "not-met" | "unknown" | "none";

export interface GateFacts {
  verdict: GateVerdict;
  observedDays: number | null;
  minimumDays: number | null;
  trades: number | null;
  minimumTrades: number | null;
  sessions: number | null;
  /** The source holds less history than the policy asks about. null = not published. */
  windowBounded: boolean | null;
  reasonCode: string | null;
  /** The policy stage as the source named it (`PAPER_OBSERVATION`); the screen shows its display name. */
  policyStage: string | null;
  /** The policy version as published (`paper.v1`); disclosure only. */
  policyVersion: string | null;
}

export function readGate(envelope: ProfileEnvelope): GateFacts {
  const raw: unknown = envelope.objects.observation_gate ?? null;
  if (!isRow(raw)) {
    return { verdict: "none", observedDays: null, minimumDays: null, trades: null, minimumTrades: null, sessions: null, windowBounded: null, reasonCode: null, policyStage: null, policyVersion: null };
  }
  const state = typeof raw.state === "string" ? raw.state : "";
  // The server's enum is MET | NOT_MET | PARTIAL (| BLOCKED). AVAILABLE is not a verdict the gate publishes: it is shown, neutral, as what it says.
  const verdict: GateVerdict = state === "MET" ? "met"
    : state === "AVAILABLE" ? "available"
    : state === "PARTIAL" ? "partial"
      : state === "BLOCKED" ? "blocked"
        : state === "NOT_MET" ? "not-met"
          : "unknown";
  const bounded = raw.window_bounded;
  return {
    verdict,
    observedDays: count(raw.observed_days),
    minimumDays: count(raw.policy_minimum_observed_days),
    trades: count(raw.trade_count),
    minimumTrades: count(raw.policy_minimum_trade_count),
    sessions: count(raw.session_count),
    windowBounded: typeof bounded === "boolean" ? bounded : null,
    reasonCode: code(raw.reason_code),
    policyStage: text(raw.policy_stage),
    policyVersion: text(raw.policy_version),
  };
}

/** The flag for the server's verdict. The words are the server's states; nothing is judged here. */
export const GATE_FLAG: Readonly<Record<GateVerdict, { kind: FlagKind; label: string }>> = {
  met: { kind: "ok", label: "Met" },
  available: { kind: "neutral", label: "Available" },
  partial: { kind: "partial", label: "Partial" },
  blocked: { kind: "attention", label: "Blocked" },
  "not-met": { kind: "na", label: "Not met" },
  unknown: { kind: "unknown", label: "Unknown" },
  none: { kind: "unknown", label: "Not published" },
};

/** The one-line reason the "Request exit review" action is not offered. */
export function exitReviewReason(gate: GateFacts): string {
  if (gate.verdict === "none" || gate.verdict === "met" || gate.verdict === "available") {
    return "Not offered from this screen yet.";
  }
  return `Blocked: the observation gate is ${GATE_FLAG[gate.verdict].label.toLowerCase()}.`;
}

/* ── equity ───────────────────────────────────────────────────────────────── */

export interface AccountingFacts {
  equity: Figure;
  netPnl: Figure;
  fees: Figure;
  funding: Figure;
  cashFree: Figure;
  cashLocked: Figure;
  currency: string | null;
  /** When the head snapshot was taken. */
  atMs: UtcEpochMs | null;
  fillsCounted: Figure;
  digest: string | null;
  snapshotReason: string | null;
  snapshotSource: string | null;
}

export interface EquityModel {
  points: readonly SeriesPoint[];
  currency: string | null;
  state: ChartState;
  segments: readonly ChartSegment[];
  serverEnvelope: ServerEnvelope | undefined;
  /** Snapshot rows the profile carried; the plot may have fewer. */
  rows: number;
  accounting: AccountingFacts;
}

const EMPTY_ACCOUNTING: AccountingFacts = {
  equity: { kind: "absent" }, netPnl: { kind: "absent" }, fees: { kind: "absent" }, funding: { kind: "absent" },
  cashFree: { kind: "absent" }, cashLocked: { kind: "absent" }, currency: null, atMs: null,
  fillsCounted: { kind: "absent" }, digest: null, snapshotReason: null, snapshotSource: null,
};

export function readEquity(envelope: ProfileEnvelope, page: PageState): EquityModel {
  const rows = rowsOf(envelope, "account_equity");
  const dated: { t: UtcEpochMs; row: Row; at: number }[] = [];
  rows.forEach((row, at) => {
    const t = timeOf(row, "ts_ms", "ts", "created_at");
    if (t !== null) dated.push({ t, row, at });
  });
  // Oldest first; two rows at one instant keep the later one (the chart refuses a repeated time).
  dated.sort((a, b) => a.t - b.t || a.at - b.at);
  const unique: typeof dated = [];
  let duplicates = 0;
  for (const item of dated) {
    if (unique.length > 0 && unique[unique.length - 1].t === item.t) {
      unique[unique.length - 1] = item;
      duplicates += 1;
    } else unique.push(item);
  }
  const undated = rows.length - dated.length;

  let unreadable = 0;
  const points: SeriesPoint[] = unique.map(({ t, row }) => {
    const raw = row.equity;
    if (raw === undefined || raw === null) return { t, v: null };
    if (readDecimal(raw, { unit: "money" }) === null) {
      unreadable += 1;
      return { t, v: null };
    }
    return { t, v: raw as string };
  });
  const drawable = points.filter((p) => p.v !== null).length;

  const headItem = unique[unique.length - 1] ?? null;
  const head = headItem?.row ?? null;
  const currency = currencyOf(head?.currency);
  const accounting: AccountingFacts = head === null ? EMPTY_ACCOUNTING : {
    equity: figure(head.equity, "money"),
    netPnl: figure(head.net_pnl, "money"),
    fees: figure(head.fee_total, "money"),
    funding: figure(head.funding_pnl, "money"),
    cashFree: figure(head.cash_free, "money"),
    cashLocked: figure(head.cash_locked, "money"),
    currency,
    atMs: headItem?.t ?? null,
    fillsCounted: figure(head.total_fills, "count"),
    digest: text(head.state_digest),
    snapshotReason: text(head.snapshot_reason),
    snapshotSource: text(head.source),
  };

  const windows: unknown = envelope.objects.history_windows;
  const equityWindow: unknown = isRow(windows) ? windows.account_equity : null;
  const window = isRow(equityWindow) ? equityWindow : null;
  const downsample = window !== null && isRow(window.downsample) ? window.downsample : null;
  const sourceRows = window === null ? null : count(window.source_rows);
  const method = downsample === null ? null : text(downsample.method);
  // The published window states its reduction by name; the only published method keeps the per-series bucket extrema, so only that
  // name may say so. Any other (or unstated) method keeps the "does not guarantee extrema" flag (FE-073, schema const).
  const serverEnvelope: ServerEnvelope | undefined = sourceRows !== null && method !== null && sourceRows >= points.length
    ? { sourceCount: sourceRows, shownCount: points.length, method, keepsExtrema: method === "PER_SERIES_BUCKET_EXTREMA" }
    : undefined;

  const notes: string[] = [];
  if (unreadable > 0) notes.push(`${unreadable} ${unreadable === 1 ? "snapshot has" : "snapshots have"} an equity value that could not be read.`);
  if (duplicates > 0) notes.push(`${duplicates} ${duplicates === 1 ? "snapshot shares" : "snapshots share"} an instant with a later one, so the later was drawn.`);
  if (undated > 0) notes.push(`${undated} ${undated === 1 ? "snapshot has" : "snapshots have"} no readable time and ${undated === 1 ? "is" : "are"} not drawn.`);
  if (page.partial !== null) notes.push(page.partial);

  let state: ChartState;
  if (drawable < 2) {
    state = {
      kind: "unavailable",
      copy: "Not available",
      reason: page.nq !== null
        ? "Source not qualified."
        : rows.length === 0
        ? "No equity snapshot published."
        : `${drawable} drawable equity ${drawable === 1 ? "snapshot" : "snapshots"}; a line needs 2.`,
    };
  } else if (notes.length > 0) {
    state = { kind: "partial", reason: [...notes, ...(page.stale !== null ? ["The read is also stale."] : [])].join(" ") };
  } else if (page.stale !== null) {
    state = { kind: "stale", reason: page.stale };
  } else {
    state = { kind: "ready" };
  }

  const segments: readonly ChartSegment[] = points.length > 0 ? [{ kind: "simulated", from: points[0].t, to: points[points.length - 1].t }] : [];
  return { points, currency, state, segments, serverEnvelope, rows: rows.length, accounting };
}

/* ── tables ───────────────────────────────────────────────────────────────── */

export interface TableWindow<R> {
  rows: readonly R[];
  /** The profile carried this branch at all. An empty published branch is "none"; a missing one is "not published". */
  published: boolean;
  /** Rows the profile carried. */
  loaded: number;
  /** The best published population: the larger of the quality read and what was loaded; null when none is known and the page is not full. */
  total: number | null;
  /** "Showing 200 of 1,247 orders". */
  label: string;
}

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const grouped = (n: number): string => NUMBER.format(n);

export function capLabel(shown: number, loaded: number, population: number | null, noun: string): string {
  const one = noun.replace(/s$/, "");
  if (population === null) {
    // No published population: what is loaded is a floor. A full page says the total is unknown.
    if (loaded > shown) return `Showing ${grouped(shown)} of at least ${grouped(loaded)} ${noun}`;
    if (loaded === PAGE_CAP) return `Showing the first ${grouped(shown)} ${noun}; the total is not published`;
    return `${grouped(loaded)} ${loaded === 1 ? one : noun}`;
  }
  const total = Math.max(population, loaded);
  if (shown < total) return `Showing ${grouped(shown)} of ${grouped(total)} ${noun}`;
  return `${grouped(total)} ${total === 1 ? one : noun}`;
}

function newest<R extends { atMs: UtcEpochMs | null }>(items: readonly R[]): R[] {
  // Newest first; a row with no readable time sorts last, in input order.
  return items
    .map((item, at) => ({ item, at }))
    .sort((a, b) => (b.item.atMs ?? Number.NEGATIVE_INFINITY) - (a.item.atMs ?? Number.NEGATIVE_INFINITY) || a.at - b.at)
    .map((entry) => entry.item);
}

function windowOf<R extends { atMs: UtcEpochMs | null }>(items: readonly R[], population: number | null, noun: string, published: boolean): TableWindow<R> {
  const ordered = newest(items);
  const rows = ordered.slice(0, PAGE_CAP);
  return {
    rows,
    published,
    loaded: items.length,
    total: population === null ? (items.length === PAGE_CAP ? null : items.length) : Math.max(population, items.length),
    label: capLabel(rows.length, items.length, population, noun),
  };
}

const uniqueKey = (key: string, seen: Map<string, number>): string => {
  const n = seen.get(key) ?? 0;
  seen.set(key, n + 1);
  return n === 0 ? key : `${key}#${n}`;
};

/* orders */

export type OrderSide = "buy" | "sell" | null;
export interface OrderState { kind: FlagKind; label: string }

const ORDER_STATE: Readonly<Record<string, OrderState>> = {
  FILLED: { kind: "applied", label: "Filled" },
  PARTIALLY_FILLED: { kind: "partial", label: "Partly filled" },
  REJECTED: { kind: "rejected", label: "Rejected" },
  DENIED: { kind: "rejected", label: "Denied" },
  CANCELED: { kind: "na", label: "Canceled" },
  CANCELLED: { kind: "na", label: "Canceled" },
  EXPIRED: { kind: "na", label: "Expired" },
  INITIALIZED: { kind: "pending", label: "Initialized" },
  SUBMITTED: { kind: "pending", label: "Submitted" },
  ACCEPTED: { kind: "pending", label: "Accepted" },
  PENDING_UPDATE: { kind: "pending", label: "Pending update" },
  PENDING_CANCEL: { kind: "pending", label: "Pending cancel" },
  TRIGGERED: { kind: "operation", label: "Triggered" },
  UNKNOWN: { kind: "unknown", label: "Unknown" },
};
const UNKNOWN_STATE: OrderState = { kind: "unknown", label: "Unknown" };

export function orderState(raw: unknown): OrderState {
  if (typeof raw !== "string") return UNKNOWN_STATE;
  return Object.hasOwn(ORDER_STATE, raw) ? ORDER_STATE[raw] : UNKNOWN_STATE;
}

export interface OrderRow {
  key: string;
  clientOrderId: string | null;
  orderId: string | null;
  side: OrderSide;
  quantity: Figure;
  price: Figure;
  state: OrderState;
  /** The source's order type word, when the row states one. */
  orderType: string | null;
  /** The order's `intent` word as the source states it; null when stated null or not stated. */
  intent: string | null;
  atMs: UtcEpochMs | null;
}

export function readOrders(envelope: ProfileEnvelope, population: number | null): TableWindow<OrderRow> {
  const seen = new Map<string, number>();
  const rows = rowsOf(envelope, "orders").map((row, at): OrderRow => {
    const orderId = text(row.order_id);
    const clientOrderId = text(row.client_order_id);
    const side = row.side === "BUY" ? "buy" : row.side === "SELL" ? "sell" : null;
    return {
      key: uniqueKey(`${orderId ?? clientOrderId ?? `row-${at}`}`, seen),
      clientOrderId,
      orderId,
      side,
      quantity: figure(row.quantity, "qty"),
      price: figure(row.price ?? row.trigger_price, "money"),
      state: orderState(row.status),
      orderType: text(row.order_type),
      intent: typeof row.intent === "string" ? text(row.intent) : null,
      atMs: timeOf(row, "submitted_at_ms", "submitted_at", "updated_at_ms", "updated_at"),
    };
  });
  return windowOf(rows, population, "orders", branchPublished(envelope, "orders"));
}

/* fills */

export interface FillRow {
  key: string;
  clientOrderId: string | null;
  orderId: string | null;
  quantity: Figure;
  price: Figure;
  fee: Figure;
  feeCurrency: string | null;
  /** MAKER, TAKER or UNKNOWN, when the row states one. */
  liquidity: string | null;
  atMs: UtcEpochMs | null;
}

export function readFills(envelope: ProfileEnvelope, population: number | null): TableWindow<FillRow> {
  const seen = new Map<string, number>();
  const rows = rowsOf(envelope, "fills").map((row, at): FillRow => ({
    key: uniqueKey(`${text(row.fill_id) ?? text(row.trade_id) ?? `row-${at}`}`, seen),
    clientOrderId: text(row.client_order_id),
    orderId: text(row.order_id),
    quantity: figure(row.quantity, "qty"),
    price: figure(row.price, "money"),
    fee: figure(row.commission, "money"),
    feeCurrency: currencyOf(row.commission_currency),
    liquidity: text(row.liquidity_side),
    atMs: timeOf(row, "trade_time_ms", "trade_time"),
  }));
  return windowOf(rows, population, "fills", branchPublished(envelope, "fills"));
}

/* positions */

export type PositionSide = "long" | "short" | "flat" | "unknown";

export interface PositionRow {
  key: string;
  symbol: string | null;
  side: PositionSide;
  quantity: Figure;
  entry: Figure;
  mark: Figure;
  unrealized: Figure;
  atMs: UtcEpochMs | null;
}

export interface PositionsModel {
  table: TableWindow<PositionRow>;
  /** Rows that are LONG or SHORT. */
  open: number;
  /** Rows whose side is not a word this build knows; they are not counted as open or flat. */
  unreadableSide: number;
}

/**
 * A flat position has no entry price. A server that prints its zero placeholder ("0", "0.00") for one is not
 * publishing a price, so that is absent (the table says why); a null/absent entry is absent too. A zero entry
 * on a LONG/SHORT/unknown row stays a printed value: it is the server's, and only a flat row is known to have none.
 */
function entryFigure(side: unknown, raw: unknown): Figure {
  const entry = figure(raw, "money");
  return side === "FLAT" && entry.kind === "value" && entry.decimal.zero ? { kind: "absent" } : entry;
}

export function readPositions(envelope: ProfileEnvelope): PositionsModel {
  const seen = new Map<string, number>();
  const all = rowsOf(envelope, "positions").map((row, at): PositionRow => ({
    key: uniqueKey(`${text(row.instrument_id) ?? text(row.symbol) ?? `row-${at}`}`, seen),
    symbol: text(row.instrument_id) ?? text(row.symbol),
    side: row.side === "LONG" ? "long" : row.side === "SHORT" ? "short" : row.side === "FLAT" ? "flat" : "unknown",
    quantity: figure(row.quantity, "qty"),
    entry: entryFigure(row.side, row.avg_px_open),
    mark: figure(row.mark_price, "money"),
    unrealized: figure(row.unrealized_pnl, "money"),
    atMs: timeOf(row, "updated_at_ms", "updated_at", "opened_at"),
  }));
  return {
    // Current positions: the population is what the profile carries.
    table: windowOf(all, null, "positions", branchPublished(envelope, "positions")),
    open: all.filter((p) => p.side === "long" || p.side === "short").length,
    unreadableSide: all.filter((p) => p.side === "unknown").length,
  };
}

/* ── execution quality ────────────────────────────────────────────────────── */

export interface QualityFacts {
  sessions: Figure;
  orders: Figure;
  fills: Figure;
  submitted: Figure;
  rejected: Figure;
  /** The derivation says part of its input is missing (always, while latency is not published). */
  partial: boolean;
  /** The derivation's own state: `ok` draws the strip, anything else names why it cannot. */
  status: { kind: "ok" } | { kind: "empty" | "unavailable" | "denied"; reason: string };
  latencyReason: string | null;
}

export function readQuality(quality: DeploymentQuality): QualityFacts {
  const d = quality.data;
  const state = quality.state;
  const reason = quality.reasonCode;
  const status: QualityFacts["status"] =
    state === "DENIED" ? { kind: "denied", reason: reason ?? "The Portal withheld execution quality from your session." }
      : state === "UNAVAILABLE" ? { kind: "unavailable", reason: reason ? `The source published no execution quality (${reason}).` : "The source published no execution quality." }
        : state === "EMPTY" ? { kind: "empty", reason: "No execution records exist for this deployment yet." }
          : state === "READY" || state === "PARTIAL" ? { kind: "ok" }
            : { kind: "unavailable", reason: "The execution-quality answer carried a state this build does not know." };
  return {
    sessions: figure(d.executionSessionPopulation, "count"),
    orders: figure(d.orderPopulation, "count"),
    fills: figure(d.fillPopulation, "count"),
    submitted: figure(d.submittedCount, "count"),
    rejected: figure(d.rejectedCount, "count"),
    partial: state === "PARTIAL" || (d.latencyState ?? "").toUpperCase() !== "AVAILABLE",
    status,
    latencyReason: code(d.latencyReasonCode),
  };
}

const populationOf = (raw: string | null | undefined): number | null => count(raw ?? null);

/* ── the whole screen ─────────────────────────────────────────────────────── */

export interface WorkbenchModel {
  deployment: DeploymentFacts | null;
  page: PageState;
  freshness: FreshnessFacts;
  gate: GateFacts;
  equity: EquityModel;
  orders: TableWindow<OrderRow>;
  fills: TableWindow<FillRow>;
  positions: PositionsModel;
  /** Sessions the quality read counts. */
  sessionsCounted: Figure;
  /*
   * BE-P2 / BE-P3 additive members, read closed (`execution/stageFacts.ts`); each is `null` when the profile carries none
   * or the member did not match the published schema exactly.
   */
  /** FE-066: the five identity keys of `data.deployment`. */
  identity: StageIdentity;
  /** FE-067: runtime, reconciliation and the session rows (`data.stage_facts`). */
  facts: StageFacts | null;
  /** S3-U4: Long, Short and Gross quantity by instrument (`data.positions_by_side`). */
  sides: PositionsBySide | null;
  /** FE-070: the VN market calendar (`data.venue_calendar`, the VN variant only). */
  calendar: VenueCalendar | null;
}

/** The profile with every figure branch removed: what an unqualified source may still say is who the deployment is. */
function withoutFigures(envelope: ProfileEnvelope): ProfileEnvelope {
  const deployment = envelope.objects.deployment;
  return { ...envelope, data: {}, objects: deployment === undefined ? {} : { deployment }, scalars: {} };
}

export function buildWorkbench(envelope: ProfileEnvelope, quality: DeploymentQuality | null): WorkbenchModel {
  const deployment = readDeployment(envelope);
  const page = pageState(envelope, deployment);
  // Not qualified: nothing the source says about figures is drawn, whatever it carried.
  const source = page.nq === null ? envelope : withoutFigures(envelope);
  const d = page.nq === null ? quality?.data : undefined;
  const facts = Object.hasOwn(envelope.objects, "stage_facts") ? readStageFacts(envelope.objects.stage_facts) : null;
  return {
    deployment,
    page,
    freshness: endedFreshness(freshnessOf(envelope), facts),
    gate: readGate(source),
    equity: readEquity(source, page),
    orders: readOrders(source, populationOf(d?.orderPopulation)),
    fills: readFills(source, populationOf(d?.fillPopulation)),
    positions: readPositions(source),
    sessionsCounted: d === undefined ? { kind: "absent" } : figure(d.executionSessionPopulation, "count"),
    identity: stageIdentity(readDeploymentIdentity(envelope.objects.deployment)),
    // Facts about the deployment, not figures: they survive an unqualified source (they say why they are not published).
    facts,
    sides: page.nq === null && Object.hasOwn(source.objects, "positions_by_side") ? readPositionsBySide(source.objects.positions_by_side) : null,
    calendar: Object.hasOwn(envelope.objects, "venue_calendar") ? readVenueCalendar(envelope.objects.venue_calendar) : null,
  };
}

/* ── links ────────────────────────────────────────────────────────────────── */

export interface WorkbenchRoutes {
  alpha(strategyId: string): string;
  account(accountId: string): string;
  portfolio(portfolioId: string): string;
  /** An order or the whole deployment in the Full Blotter. */
  blotter(deploymentId: string, orderId?: string | null): string;
  operations: string;
  exitReviews: string;
  fleet: string;
}

const enc = encodeURIComponent;

export const DEFAULT_ROUTES: WorkbenchRoutes = {
  alpha: (id) => `/deployments/alphas/${enc(id)}`,
  account: (id) => `/deployments/accounts/${enc(id)}`,
  portfolio: (id) => `/deployments/portfolios/${enc(id)}`,
  blotter: (deploymentId, orderId) => `/deployments/blotter?deployment=${enc(deploymentId)}&env=paper${orderId ? `&order=${enc(orderId)}` : ""}`,
  operations: "/execution/operations",
  exitReviews: "/governance/exit-reviews",
  fleet: "/deployments/alphas",
};

export const DEFAULT_ACCESS_HREF = "/administration/profile-access";
