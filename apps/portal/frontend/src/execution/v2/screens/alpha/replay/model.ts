/**
 * Trade Replay models: which window, venue and interval to ask candles for, and
 * what the panel's state is, from the orders and fills already read.
 *
 * Candles are asked for only once there is a symbol, a venue the Portal can
 * read public klines from, and a window that holds the trades. Nothing is
 * drawn from them unless the venue source says READY for that symbol.
 */
import {
  MARKET_CANDLES_MAX_LIMIT,
  MARKET_CANDLE_INTERVAL_MS,
  fittingInterval,
  marketVenueOf,
  timeframeFromStrategyId,
  type MarketCandleInterval,
  type MarketCandlesPayload,
  type MarketVenue,
} from "../../../../api/marketCandles";
import type { MarketContextCandles } from "../../../../api/marketContext";
import type { AlphaFleetItem } from "../../../../api/profileRead";
import type { PanelStatus } from "../../../../contracts";
import type { ReplayFill, ReplayOrder } from "../../../../components/tradeReplayModel";
import { buildLog, ms } from "../../../../components/tradeReplayModel";
import type { ExecEnv } from "../../../urlState";
import { envOfStage, humanize, plainReason, spineStageOf } from "../model";
import type { Read, SubjectBook } from "../useAlphaReads";

/** Padding either side of the first and last trade, so the candles show what led in and out. */
const PAD_MS = 6 * 3_600_000;

export function symbolsOf(orders: readonly ReplayOrder[], fills: readonly ReplayFill[]): readonly string[] {
  return [...new Set([...fills.map((f) => f.symbol), ...orders.map((o) => o.symbol)].filter((s): s is string => s !== null && s !== ""))].sort();
}

/** The window the trades of one symbol span, padded; `null` with no timed trade. */
export function replayRange(orders: readonly ReplayOrder[], fills: readonly ReplayFill[], symbol: string | null): { lo: number; hi: number } | null {
  const times = [
    ...fills.filter((f) => symbol === null || f.symbol === symbol).map((f) => ms(f.tradeTime)),
    ...orders.filter((o) => symbol === null || o.symbol === symbol).flatMap((o) => [ms(o.submittedAt), ms(o.updatedAt)]),
  ].filter((t): t is number => t !== null);
  if (times.length === 0) return null;
  return { lo: Math.min(...times) - PAD_MS, hi: Math.max(...times) + PAD_MS };
}

/** The first venue this alpha runs on in the book, if the Portal can read its klines. */
export function venueOf(item: AlphaFleetItem | null, env: ExecEnv): MarketVenue | null {
  if (item === null) return null;
  for (const deployment of item.deployments) {
    if (envOfStage(spineStageOf(deployment.stage)) !== env) continue;
    const venue = marketVenueOf(deployment.venue);
    if (venue !== null) return venue;
  }
  return null;
}

export interface IntervalChoice {
  interval: MarketCandleInterval;
  /** Where the preferred interval came from, when it was not published. */
  note: string | null;
}

/** A published timeframe wins, then the strategy id's suffix (marked derived), then 1h. */
export function preferredInterval(book: Pick<SubjectBook, "timeframe">, alphaId: string): IntervalChoice {
  const published = book.timeframe;
  if (published !== null && published.value !== null && published.provenance === "PUBLISHED_SOURCE") return { interval: published.value, note: null };
  if (published !== null && published.value !== null) return { interval: published.value, note: "Interval derived from the strategy id" };
  const inferred = timeframeFromStrategyId(alphaId);
  return inferred === null ? { interval: "1h", note: "Interval not published, 1h assumed" } : { interval: inferred, note: "Interval derived from the strategy id" };
}

export interface CandleWindow {
  interval: MarketCandleInterval;
  fromMs: number;
  toMs: number;
  limit: number;
}

export function candleWindow(range: { lo: number; hi: number }, wanted: MarketCandleInterval): CandleWindow {
  const interval = fittingInterval(range.hi - range.lo, wanted);
  const limit = Math.min(MARKET_CANDLES_MAX_LIMIT, Math.ceil((range.hi - range.lo) / MARKET_CANDLE_INTERVAL_MS[interval]) + 2);
  return { interval, fromMs: Math.floor(range.lo), toMs: Math.ceil(range.hi), limit };
}

export interface ReplayState {
  status: PanelStatus;
  reason?: string;
}

/** The panel's state from the two relation reads. A half-read book is partial, never complete. */
/** A server message ends in its own full stop; a sentence built around it adds its own, so the message is closed once, never twice. */
const unstopped = (text: string | undefined): string => (text ?? "").replace(/[.\s]+$/, "");

export function replayState(book: Pick<SubjectBook, "ordersState" | "fillsState" | "orders" | "fills">): ReplayState {
  const { ordersState, fillsState } = book;
  const settled = (state: Read<unknown>) => state.phase === "ready" || state.phase === "error";
  if (!settled(ordersState) || !settled(fillsState)) return { status: "loading" };
  if (ordersState.phase === "error" && fillsState.phase === "error") return { status: ordersState.status, reason: `Orders: ${unstopped(ordersState.reason)}. Fills: ${unstopped(fillsState.reason)}.` };
  if (ordersState.phase === "error") return { status: "partial", reason: `Orders could not be read (${unstopped(ordersState.reason)}). The fills below are all that was published.` };
  if (fillsState.phase === "error") return { status: "partial", reason: `Fills could not be read (${unstopped(fillsState.reason)}). Orders below carry no fill.` };
  const partial = partialRelations(book);
  if (book.orders.length === 0 && book.fills.length === 0) {
    return {
      status: "empty",
      reason: `No order or fill of this alpha is present in the retained window of this book.${partial.length > 0 ? ` The source marked the ${partial.join(" and ")} read partial, so this does not prove that none exist.` : ""}`,
    };
  }
  // PARTIAL is the source saying the window it served is not the whole of what it holds (a retained window, not total history): never "ok".
  if (partial.length > 0) return { status: "partial", reason: `The source marked the ${partial.join(" and ")} read partial: what is shown is the retained window, not known to be the whole of this book.` };
  return { status: "ok" };
}

/** The relations (`orders`, `fills`) any loaded page of which the source marked PARTIAL. */
export function partialRelations(book: Pick<SubjectBook, "ordersState" | "fillsState">): string[] {
  const out: string[] = [];
  for (const [word, state] of [["orders", book.ordersState], ["fills", book.fillsState]] as const) {
    if (state.phase === "ready" && state.value.some((page) => page.state.toUpperCase() === "PARTIAL")) out.push(word);
  }
  return out;
}

export interface CandleVerdict {
  /** Venue klines are READY for the active symbol with bars to draw. */
  qualified: boolean;
  /** Words for the banner. */
  reason: string;
  /** The Trading System's own candle state, for the V1 panel's footer. */
  context: { state: string | null; reason: string | null };
}

export function candleVerdict(
  symbol: string | null,
  venue: Read<MarketCandlesPayload>,
  context: Read<MarketContextCandles>,
): CandleVerdict {
  const contextState: CandleVerdict["context"] =
    context.phase === "ready" ? { state: context.value.state, reason: null }
    : context.phase === "error" ? { state: "UNAVAILABLE", reason: context.reason }
    : { state: null, reason: null };
  const trading = context.phase === "ready"
    ? `Trading System candles ${humanize(context.value.state ?? "published").toLowerCase()}.`
    : context.phase === "error" ? `Trading System candles are not published (${plainReason(context.reason)}).`
    : "";
  if (symbol === null) return { qualified: false, reason: "There is no symbol to read candles for.", context: contextState };
  if (venue.phase === "loading" || venue.phase === "idle") return { qualified: false, reason: `Reading ${symbol} candles.`, context: contextState };
  if (venue.phase === "error") return { qualified: false, reason: `${symbol}: venue candles unavailable (${plainReason(venue.reason)}). ${trading}`.trim(), context: contextState };
  const payload = venue.value;
  if (payload.state !== "READY") {
    return { qualified: false, reason: `${symbol}: venue candles ${payload.state.toLowerCase()}${payload.reasonCode ? ` (${plainReason(payload.reasonCode)})` : ""}. ${trading}`.trim(), context: contextState };
  }
  if (payload.symbol !== null && payload.symbol !== symbol) return { qualified: false, reason: `The candles read are for ${payload.symbol}, not ${symbol}.`, context: contextState };
  if (payload.candles.length === 0) return { qualified: false, reason: `${symbol}: the venue returned no candle for this window.`, context: contextState };
  return { qualified: true, reason: trading, context: contextState };
}

/* ── what the loaded book is, and is not ───────────────────────────────────── */

export interface RelationAudit {
  /** Records the Portal said it returned (summed over the loaded pages; the received count when a page does not say). */
  declared: number;
  /** Records that arrived as readable objects with an id. */
  received: number;
  /** Records that became orders or fills of the replay. */
  read: number;
  /** Declared or received records that did not: no id, no price, no time, a repeat, or not an object at all. */
  lost: number;
  /** A page state that says the source did not answer (UNAVAILABLE, or a word this reader does not know); null when every page is AVAILABLE, PARTIAL or empty. */
  badState: string | null;
  /** Some loaded page was marked PARTIAL by the source. */
  partial: boolean;
  /** The records in hand reached `MAX_LOADED_RECORDS` while the Portal still holds more: no further page is offered. */
  capped: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
}

export interface BookAudit {
  orders: RelationAudit;
  fills: RelationAudit;
  /** Orders and fills that were read but carry no time that parses, so they are on neither the log nor the chart. */
  untimed: number;
  /** True when anything about the loaded book is short of the whole of it. */
  incomplete: boolean;
}

type PagedBook = Pick<SubjectBook, "orders" | "fills" | "ordersState" | "fillsState" | "ordersMore" | "fillsMore">;

/**
 * The page states the Portal publishes for subject records: a window with rows, a partial window, and a proven empty one.
 * Any other word means the source did not answer (`badState`). PARTIAL is served but is never read as whole: see `replayState`.
 */
const SERVED_STATES: readonly string[] = ["AVAILABLE", "PARTIAL", "AUTHORITATIVE_EMPTY", "EMPTY"];

/** Records kept per relation across `Load more` pages (the Cockpit's `MAX_LOADED_ROWS` is the same idea): past this the chart and log stop growing. */
export const MAX_LOADED_RECORDS = 2_000;

/** Whether `Load more` is still on offer for a relation: the Portal holds more (or the last page failed) and the ceiling is not reached. */
export const canLoadMore = (rel: Pick<RelationAudit, "hasMore" | "moreError" | "capped">): boolean => (rel.hasMore || rel.moreError !== null) && !rel.capped;

function auditRelation(state: Read<readonly { state: string; records: readonly unknown[]; page: { returnedCount: number | null } }[]>, read: number, more: SubjectBook["ordersMore"]): RelationAudit {
  const pages = state.phase === "ready" ? state.value : [];
  const received = pages.reduce((sum, page) => sum + page.records.length, 0);
  const declared = pages.reduce((sum, page) => sum + (page.page.returnedCount ?? page.records.length), 0);
  const badState = pages.find((page) => !SERVED_STATES.includes(page.state.toUpperCase()))?.state ?? null;
  const partial = pages.some((page) => page.state.toUpperCase() === "PARTIAL");
  const capped = more.hasMore && received >= MAX_LOADED_RECORDS;
  return { declared, received, read, lost: Math.max(0, Math.max(declared, received) - read), badState, partial, capped, hasMore: more.hasMore, loadingMore: more.loadingMore, moreError: more.moreError };
}

/**
 * What the orders and fills in hand are, against what the Portal said it sent.
 * The replay draws what it could read; this says how much that is short of the
 * whole, so a partly read book never looks like a whole one.
 */
export function auditBook(book: PagedBook, untimedCount?: number): BookAudit {
  const orders = auditRelation(book.ordersState, book.orders.length, book.ordersMore);
  const fills = auditRelation(book.fillsState, book.fills.length, book.fillsMore);
  const untimed = untimedCount ?? countUntimed(book.orders, book.fills);
  return { orders, fills, untimed, incomplete: orders.lost > 0 || fills.lost > 0 || orders.badState !== null || fills.badState !== null || orders.partial || fills.partial || untimed > 0 || orders.hasMore || fills.hasMore || orders.moreError !== null || fills.moreError !== null };
}

/**
 * Orders and fills that were read but carry no time that parses (on neither the log nor the chart).
 * It builds the whole log, so callers on a render path memoise it on the two arrays and pass it to `auditBook`.
 * (The panel's own log is per symbol and carries round trips, so the two logs are not interchangeable.)
 */
export function countUntimed(orders: readonly ReplayOrder[], fills: readonly ReplayFill[]): number {
  return Math.max(0, orders.length + fills.length - buildLog(orders, fills, []).length);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** One sentence per shortfall, with exact counts. Empty when the book is whole. */
export function auditSentences(audit: BookAudit): string[] {
  const out: string[] = [];
  for (const [word, rel] of [["order", audit.orders], ["fill", audit.fills]] as const) {
    if (rel.lost > 0) {
      const total = Math.max(rel.declared, rel.received);
      out.push(`${rel.lost} of ${total} ${word} ${plural(total, "record", "records")} could not be read (no id, price or time, a repeat, or not a record) and ${plural(rel.lost, "is", "are")} left out of the log and chart.`);
    }
    if (rel.badState !== null) out.push(`The Portal reported the ${word} read as ${rel.badState.replace(/_/g, " ").toLowerCase()}, so what is shown is not known to be the whole of it.`);
    if (rel.hasMore && rel.capped) out.push(`${rel.received.toLocaleString("en-US")} ${word}s loaded; the Portal holds more. Loading stops at ${MAX_LOADED_RECORDS.toLocaleString("en-US")} ${word}s: narrow the replay window to see the rest. The log and chart show only what is loaded.`);
    else if (rel.hasMore) out.push(`${rel.read} ${plural(rel.read, word, `${word}s`)} loaded; the Portal holds more. The log and chart show only what is loaded.`);
    if (rel.moreError !== null && !rel.capped) out.push(`The next page of ${word}s could not be read (${rel.moreError}).`);
  }
  if (audit.untimed > 0) out.push(`${audit.untimed} ${plural(audit.untimed, "record has", "records have")} no time that can be read, so ${plural(audit.untimed, "it is", "they are")} on neither the log nor the chart.`);
  return out;
}
