/**
 * Venue public market candles — the market context the Trade Replay draws its
 * fills on (hi-fi Alpha 360 · Trade Replay; BR-EX-50).
 *
 * The Trading System does not publish its kline shard yet (E5/N28, EDS-10b
 * `EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED`). Until it does, the Portal reads
 * the venue's PUBLIC klines itself — for the paper USDM profile that is the
 * same Binance USDM feed the paper engine marks against — and says so in every
 * envelope: `source_authority: VENUE_PUBLIC_MARKET_DATA`, the endpoint named,
 * never presented as the source's own history. No credential is involved; the
 * endpoint is unauthenticated market data. Feature-flagged, cached, budgeted.
 *
 * Every price stays the venue's decimal string. Nothing is resampled here.
 */
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";

export const MARKET_CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type MarketCandleInterval = (typeof MARKET_CANDLE_INTERVALS)[number];
export const MARKET_CANDLE_INTERVAL_MS: Record<MarketCandleInterval, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};
export const MARKET_CANDLES_MAX_LIMIT = 1500;
const ENDPOINT_PATH = "/fapi/v1/klines";
const CACHE_TTL_MS = 30_000;
const BUDGET_PER_MINUTE = 60;
const TIMEOUT_MS = 6_000;

export class MarketCandlesError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export interface MarketCandlesQuery {
  symbol: string;
  interval: MarketCandleInterval;
  fromMs: number | null;
  toMs: number | null;
  limit: number;
}

export interface MarketCandle {
  /** open time, UTC ms */
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  /** base volume as the venue prints it */
  v: string;
  close_t: number;
  trades: number | null;
}

export interface MarketCandlesEnvelope {
  schema_version: "portal.execution.market-candles.v1";
  logical_operation_id: "executionMarketCandlesV1";
  record_authority: "PORTAL_CONTROL";
  source_authority: "VENUE_PUBLIC_MARKET_DATA";
  source: { venue: "BINANCE"; market: "USDM"; endpoint: string; note: string };
  symbol: string;
  interval: MarketCandleInterval;
  interval_ms: number;
  state: "READY" | "EMPTY" | "UNAVAILABLE";
  reason_code: string | null;
  retryable: boolean;
  fetched_at_ms: number | null;
  read_at_ms: number;
  coverage: { from_ms: number | null; to_ms: number | null; requested_limit: number; returned_count: number; truncated: boolean };
  last_candle_closed: boolean | null;
  candles: MarketCandle[];
}

export type MarketCandlesFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SOURCE_NOTE = "Public venue klines fetched by the Portal (no credential). Market context only — not the Trading System kline shard (BR-EX-50 pending).";

@Injectable()
export class ExecutionMarketCandlesService {
  private fetchImpl: MarketCandlesFetch = (url, init) => fetch(url, init);
  private readonly cache = new Map<string, { at: number; body: MarketCandlesEnvelope }>();
  private readonly calls: number[] = [];

  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  /** Tests swap the transport; production uses the global fetch. */
  setFetch(impl: MarketCandlesFetch): void { this.fetchImpl = impl; }

  async candles(query: MarketCandlesQuery, now = Date.now()): Promise<MarketCandlesEnvelope> {
    if (this.config.FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES !== "true") {
      return this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_FEATURE_DISABLED", retryable: false });
    }
    const key = `${query.symbol}|${query.interval}|${query.fromMs ?? ""}|${query.toMs ?? ""}|${query.limit}`;
    const cached = this.cache.get(key);
    if (cached && now - cached.at < CACHE_TTL_MS) return { ...cached.body, read_at_ms: now };
    while (this.calls.length > 0 && now - this.calls[0]! > 60_000) this.calls.shift();
    if (this.calls.length >= BUDGET_PER_MINUTE) {
      return this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_RATE_LIMITED", retryable: true });
    }
    this.calls.push(now);
    const params = new URLSearchParams({ symbol: query.symbol, interval: query.interval, limit: String(query.limit) });
    if (query.fromMs !== null) params.set("startTime", String(query.fromMs));
    if (query.toMs !== null) params.set("endTime", String(query.toMs));
    const url = `${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_ORIGIN}${ENDPOINT_PATH}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let body: MarketCandlesEnvelope;
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) {
        const upstream = (await response.json().catch(() => null)) as { code?: unknown } | null;
        const venueCode = typeof upstream?.code === "number" ? upstream.code : null;
        body = venueCode === -1121 || venueCode === -1100
          ? this.envelope(query, now, { state: "EMPTY", reason_code: "MARKET_CANDLES_SYMBOL_UNKNOWN", retryable: false, fetched_at_ms: now })
          : this.envelope(query, now, {
              state: "UNAVAILABLE",
              reason_code: response.status === 429 || response.status === 418 ? "MARKET_CANDLES_VENUE_RATE_LIMITED" : "MARKET_CANDLES_VENUE_ERROR",
              retryable: true, fetched_at_ms: now,
            });
      } else {
        const raw = await response.json();
        const candles = readKlines(raw);
        if (candles === null) {
          body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_MALFORMED", retryable: true, fetched_at_ms: now });
        } else {
          const last = candles[candles.length - 1] ?? null;
          body = this.envelope(query, now, {
            state: candles.length === 0 ? "EMPTY" : "READY",
            reason_code: candles.length === 0 ? "MARKET_CANDLES_NONE_IN_WINDOW" : null,
            retryable: false,
            fetched_at_ms: now,
            candles,
            coverage: {
              from_ms: candles[0]?.t ?? query.fromMs,
              to_ms: last?.close_t ?? query.toMs,
              requested_limit: query.limit,
              returned_count: candles.length,
              truncated: candles.length >= query.limit && (query.toMs === null || (last !== null && last.close_t < query.toMs)),
            },
            last_candle_closed: last ? last.close_t < now : null,
          });
        }
      }
    } catch {
      body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_UNREACHABLE", retryable: true, fetched_at_ms: now });
    } finally {
      clearTimeout(timer);
    }
    if (body.state === "READY") this.cache.set(key, { at: now, body });
    return body;
  }

  private envelope(query: MarketCandlesQuery, now: number, patch: Partial<MarketCandlesEnvelope>): MarketCandlesEnvelope {
    return {
      schema_version: "portal.execution.market-candles.v1",
      logical_operation_id: "executionMarketCandlesV1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "VENUE_PUBLIC_MARKET_DATA",
      source: { venue: "BINANCE", market: "USDM", endpoint: `${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_ORIGIN}${ENDPOINT_PATH}`, note: SOURCE_NOTE },
      symbol: query.symbol,
      interval: query.interval,
      interval_ms: MARKET_CANDLE_INTERVAL_MS[query.interval],
      state: "UNAVAILABLE",
      reason_code: null,
      retryable: false,
      fetched_at_ms: null,
      read_at_ms: now,
      coverage: { from_ms: query.fromMs, to_ms: query.toMs, requested_limit: query.limit, returned_count: 0, truncated: false },
      last_candle_closed: null,
      candles: [],
      ...patch,
    };
  }
}

/** Binance kline rows: [openTime, o, h, l, c, v, closeTime, quoteVol, trades, ...]. Strings stay strings. */
export function readKlines(raw: unknown): MarketCandle[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MarketCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 7) return null;
    const [t, o, h, l, c, v, closeT, , trades] = row as unknown[];
    if (typeof t !== "number" || typeof closeT !== "number") return null;
    if (![o, h, l, c, v].every((x) => typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x))) return null;
    out.push({ t, o: o as string, h: h as string, l: l as string, c: c as string, v: v as string, close_t: closeT, trades: typeof trades === "number" ? trades : null });
  }
  return out;
}
