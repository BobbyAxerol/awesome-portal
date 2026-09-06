/**
 * `GET /api/v1/execution/market/candles` — venue public klines the Trade
 * Replay draws its fills on. The envelope names its authority
 * (`VENUE_PUBLIC_MARKET_DATA`) and endpoint; this reader keeps prices as the
 * venue's strings and turns nothing into a number except the two clocks.
 */
export const MARKET_CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type MarketCandleInterval = (typeof MARKET_CANDLE_INTERVALS)[number];
export const MARKET_CANDLE_INTERVAL_MS: Record<MarketCandleInterval, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};
export const MARKET_CANDLES_MAX_LIMIT = 1500;

export interface MarketCandlesQuery {
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
  source: { venue: string | null; market: string | null; endpoint: string | null; note: string | null };
  symbol: string | null;
  interval: MarketCandleInterval | null;
  intervalMs: number | null;
  state: string;
  reasonCode: string | null;
  retryable: boolean;
  fetchedAtMs: number | null;
  coverage: { fromMs: number | null; toMs: number | null; requestedLimit: number | null; returnedCount: number | null; truncated: boolean };
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
    source: { venue: str(source.venue), market: str(source.market), endpoint: str(source.endpoint), note: str(source.note) },
    symbol: str(root.symbol),
    interval: interval && (MARKET_CANDLE_INTERVALS as readonly string[]).includes(interval) ? (interval as MarketCandleInterval) : null,
    intervalMs: int(root.interval_ms),
    state: str(root.state) ?? "UNAVAILABLE",
    reasonCode: str(root.reason_code),
    retryable: root.retryable === true,
    fetchedAtMs: int(root.fetched_at_ms),
    coverage: {
      fromMs: int(coverage.from_ms), toMs: int(coverage.to_ms), requestedLimit: int(coverage.requested_limit),
      returnedCount: int(coverage.returned_count), truncated: coverage.truncated === true,
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
  const params = new URLSearchParams({ venue: "BINANCE", market: "USDM", symbol: q.symbol, interval: q.interval });
  if (q.fromMs !== undefined) params.set("from_ms", String(Math.round(q.fromMs)));
  if (q.toMs !== undefined) params.set("to_ms", String(Math.round(q.toMs)));
  params.set("limit", String(Math.min(MARKET_CANDLES_MAX_LIMIT, Math.max(1, Math.round(q.limit ?? 500)))));
  return `/market/candles?${params.toString()}`;
}

/** The finest interval that fits the range in one venue page; the hi-fi reads 1h by default. */
export function fittingInterval(rangeMs: number, preferred: MarketCandleInterval = "1h"): MarketCandleInterval {
  const order = MARKET_CANDLE_INTERVALS;
  const start = order.indexOf(preferred);
  for (let i = start; i < order.length; i += 1) {
    const key = order[i]!;
    if (rangeMs / MARKET_CANDLE_INTERVAL_MS[key] <= MARKET_CANDLES_MAX_LIMIT - 2) return key;
  }
  return "1d";
}
