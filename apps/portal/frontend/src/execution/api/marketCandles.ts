/**
 * `GET /api/v1/execution/market/candles` — venue public klines the Trade
 * Replay draws its fills on. The envelope names its authority
 * (`VENUE_PUBLIC_MARKET_DATA`) and endpoint; this reader keeps prices as the
 * venue's strings and turns nothing into a number except the two clocks.
 */
export const MARKET_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type MarketCandleInterval = (typeof MARKET_CANDLE_INTERVALS)[number];
export const MARKET_CANDLE_INTERVAL_MS: Record<MarketCandleInterval, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};
/** Bars one read may return — the Portal walks the venue's pages behind it (Binance 1500 a page, OKX 100). */
export const MARKET_CANDLES_MAX_LIMIT = 6000;
/** Venues the Portal can read public klines from; anything else is a typed unsupported. */
export const MARKET_VENUES = ["BINANCE", "OKX"] as const;
export type MarketVenue = (typeof MARKET_VENUES)[number];
export const MARKET_OF_VENUE: Record<MarketVenue, "USDM" | "SWAP"> = { BINANCE: "USDM", OKX: "SWAP" };

export const marketVenueOf = (venue: string | null | undefined): MarketVenue | null =>
  venue && (MARKET_VENUES as readonly string[]).includes(venue.toUpperCase()) ? (venue.toUpperCase() as MarketVenue) : null;

/**
 * The Trading System does not publish a strategy's bar interval (checked
 * 06-09: the strategies relation carries `active, trader_id, created_at,
 * strategy_id` only — BR-EX-80 asks for it). Until then the interval is read
 * from the strategy id's own suffix (`adaptive_hma_cpp_00115m` → 15m,
 * `signalcombine00230m` → 30m) and labelled DERIVED wherever it is used.
 */
export function timeframeFromStrategyId(id: string | null | undefined): MarketCandleInterval | null {
  const lower = (id ?? "").toLowerCase();
  if (!/\d[mhd]$/.test(lower)) return null;
  // longest suffix wins: `…00115m` is 15m (the 001 is the strategy's own numbering), `…30m` is 30m
  const bySuffix = [...MARKET_CANDLE_INTERVALS].sort((a, b) => b.length - a.length);
  return bySuffix.find((i) => lower.endsWith(i)) ?? null;
}

export interface MarketCandlesQuery {
  /** defaults to BINANCE; the deployment's venue when the events carry one */
  venue?: MarketVenue;
  symbol: string;
  interval: MarketCandleInterval;
  fromMs?: number;
  toMs?: number;
  limit?: number;
}

export interface MarketCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  closeT: number;
}

export interface MarketCandlesPayload {
  schemaVersion: string;
  sourceAuthority: string | null;
  source: { venue: string | null; market: string | null; endpoint: string | null; instrument: string | null; note: string | null };
  symbol: string | null;
  interval: MarketCandleInterval | null;
  intervalMs: number | null;
  state: string;
  reasonCode: string | null;
  retryable: boolean;
  fetchedAtMs: number | null;
  coverage: { fromMs: number | null; toMs: number | null; requestedLimit: number | null; returnedCount: number | null; truncated: boolean; pages: number | null };
  lastCandleClosed: boolean | null;
  candles: readonly MarketCandle[];
}

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function readMarketCandles(raw: unknown): MarketCandlesPayload | null {
  const root = obj(raw);
  const schema = str(root?.schema_version);
  if (!root || !schema) return null;
  const source = obj(root.source) ?? {};
  const coverage = obj(root.coverage) ?? {};
  const interval = str(root.interval);
  return {
    schemaVersion: schema,
    sourceAuthority: str(root.source_authority),
    source: { venue: str(source.venue), market: str(source.market), endpoint: str(source.endpoint), instrument: str(source.instrument), note: str(source.note) },
    symbol: str(root.symbol),
    interval: interval && (MARKET_CANDLE_INTERVALS as readonly string[]).includes(interval) ? (interval as MarketCandleInterval) : null,
    intervalMs: int(root.interval_ms),
    state: str(root.state) ?? "UNAVAILABLE",
    reasonCode: str(root.reason_code),
    retryable: root.retryable === true,
    fetchedAtMs: int(root.fetched_at_ms),
    coverage: {
      fromMs: int(coverage.from_ms), toMs: int(coverage.to_ms), requestedLimit: int(coverage.requested_limit),
      returnedCount: int(coverage.returned_count), truncated: coverage.truncated === true, pages: int(coverage.pages),
    },
    lastCandleClosed: typeof root.last_candle_closed === "boolean" ? root.last_candle_closed : null,
    candles: (Array.isArray(root.candles) ? root.candles : []).flatMap((row) => {
      const c = obj(row);
      const t = int(c?.t);
      const closeT = int(c?.close_t);
      const o = str(c?.o), h = str(c?.h), l = str(c?.l), cl = str(c?.c), v = str(c?.v);
      if (!c || t === null || closeT === null || !o || !h || !l || !cl || ![o, h, l, cl].every((x) => DECIMAL.test(x))) return [];
      return [{ t, o, h, l, c: cl, v: v ?? "0", closeT }];
    }),
  };
}

export function marketCandlesPath(q: MarketCandlesQuery): string {
  const venue = q.venue ?? "BINANCE";
  const params = new URLSearchParams({ venue, market: MARKET_OF_VENUE[venue], symbol: q.symbol, interval: q.interval });
  if (q.fromMs !== undefined) params.set("from_ms", String(Math.round(q.fromMs)));
  if (q.toMs !== undefined) params.set("to_ms", String(Math.round(q.toMs)));
  params.set("limit", String(Math.min(MARKET_CANDLES_MAX_LIMIT, Math.max(1, Math.round(q.limit ?? 500)))));
  return `/market/candles?${params.toString()}`;
}

/** The finest interval that fits the range within one read (MARKET_CANDLES_MAX_LIMIT bars); the alpha's own interval when it fits. */
export function fittingInterval(rangeMs: number, preferred: MarketCandleInterval = "1h"): MarketCandleInterval {
  const order = MARKET_CANDLE_INTERVALS;
  const start = order.indexOf(preferred);
  for (let i = start; i < order.length; i += 1) {
    const key = order[i]!;
    if (rangeMs / MARKET_CANDLE_INTERVAL_MS[key] <= MARKET_CANDLES_MAX_LIMIT - 2) return key;
  }
  return "1d";
}
