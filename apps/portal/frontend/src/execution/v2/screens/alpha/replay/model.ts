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
import { ms } from "../../../../components/tradeReplayModel";
import type { ExecEnv } from "../../../urlState";
import { envOfStage, humanize, spineStageOf } from "../model";
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
export function replayState(book: Pick<SubjectBook, "ordersState" | "fillsState" | "orders" | "fills">): ReplayState {
  const { ordersState, fillsState } = book;
  const settled = (state: Read<unknown>) => state.phase === "ready" || state.phase === "error";
  if (!settled(ordersState) || !settled(fillsState)) return { status: "loading" };
  if (ordersState.phase === "error" && fillsState.phase === "error") return { status: ordersState.status, reason: `Orders: ${ordersState.reason}. Fills: ${fillsState.reason}` };
  if (ordersState.phase === "error") return { status: "partial", reason: `Orders could not be read (${ordersState.reason}). The fills below are all that was published.` };
  if (fillsState.phase === "error") return { status: "partial", reason: `Fills could not be read (${fillsState.reason}). Orders below carry no fill.` };
  if (book.orders.length === 0 && book.fills.length === 0) return { status: "empty", reason: "No order or fill of this alpha is present in the retained window of this book." };
  return { status: "ok" };
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
    : context.phase === "error" ? `Trading System candles are not published (${context.reason}).`
    : "";
  if (symbol === null) return { qualified: false, reason: "There is no symbol to read candles for.", context: contextState };
  if (venue.phase === "loading" || venue.phase === "idle") return { qualified: false, reason: `Reading ${symbol} candles.`, context: contextState };
  if (venue.phase === "error") return { qualified: false, reason: `${symbol}: venue candles unavailable (${venue.reason}). ${trading}`.trim(), context: contextState };
  const payload = venue.value;
  if (payload.state !== "READY") {
    return { qualified: false, reason: `${symbol}: venue candles ${payload.state.toLowerCase()}${payload.reasonCode ? ` (${payload.reasonCode})` : ""}. ${trading}`.trim(), context: contextState };
  }
  if (payload.symbol !== null && payload.symbol !== symbol) return { qualified: false, reason: `The candles read are for ${payload.symbol}, not ${symbol}.`, context: contextState };
  if (payload.candles.length === 0) return { qualified: false, reason: `${symbol}: the venue returned no candle for this window.`, context: contextState };
  return { qualified: true, reason: trading, context: contextState };
}
