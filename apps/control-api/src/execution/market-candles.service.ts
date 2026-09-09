/**
 * Venue public market candles — the market context the Trade Replay draws its
 * fills on (hi-fi Alpha 360 · Trade Replay; BR-EX-50).
 *
 * The Trading System does not publish its kline shard yet (E5/N28, EDS-10b
 * `EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED`). Until it does, the Portal reads
 * the venue's PUBLIC klines itself — the same public feed the paper engine
 * marks against — and says so in every envelope: `source_authority:
 * VENUE_PUBLIC_MARKET_DATA`, the endpoint named, never presented as the
 * source's own history. No credential is involved; the endpoints are
 * unauthenticated market data. Feature-flagged, cached, budgeted.
 *
 * Two venues, one vocabulary (OR-5 / owner 06-09: "Binance hoặc OKX theo đúng
 * interval của alpha"):
 *   BINANCE USDM  `GET /fapi/v1/klines`            1500 bars a page, walked
 *                 forward from `from_ms` (or backward from `to_ms`)
 *   OKX     SWAP  `GET /api/v5/market/history-candles`  100 bars a page, newest
 *                 first, paged backwards from `to_ms` until `from_ms` or the
 *                 limit; every page counts against the per-minute budget.
 *
 * Every price stays the venue's decimal string. Nothing is resampled here.
 *
 * Source boundary (OR-5 R3): `EXECUTION_MARKET_CANDLES_SOURCE` picks the
 * candle source behind the same envelope. `venue_public` is the only one
 * wired; `data_layer` (the Trading System's own market gateway,
 * `/v1/binance/futures/klines/{symbol}` behind the execution edge, BR-EX-50)
 * answers a typed `MARKET_CANDLES_SOURCE_NOT_WIRED` until codex delivers it —
 * the chart, the route and the vocabulary do not change when it does.
 */
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";

export const MARKET_CANDLE_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"] as const;
export type MarketCandleInterval = (typeof MARKET_CANDLE_INTERVALS)[number];
export const MARKET_CANDLE_INTERVAL_MS: Record<MarketCandleInterval, number> = {
  "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000,
};
export const MARKET_VENUES = ["BINANCE", "OKX"] as const;
export type MarketVenue = (typeof MARKET_VENUES)[number];
export type MarketKind = "USDM" | "SWAP";
export const MARKET_OF_VENUE: Record<MarketVenue, MarketKind> = { BINANCE: "USDM", OKX: "SWAP" };
/** Bars one read may return; the venue pages are walked to fill it (Binance 1500 a page, OKX 100). */
export const MARKET_CANDLES_MAX_LIMIT = 6000;
const BINANCE_PAGE = 1500;
const BINANCE_PATH = "/fapi/v1/klines";
const OKX_PATH = "/api/v5/market/history-candles";
const OKX_PAGE = 100;
const OKX_BAR: Record<MarketCandleInterval, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1Dutc" };
const CACHE_TTL_MS = 30_000;
const BUDGET_PER_MINUTE = 60;
const TIMEOUT_MS = 6_000;

export class MarketCandlesError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export interface MarketCandlesQuery {
  venue: MarketVenue;
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

export const MARKET_CANDLE_SOURCES = ["venue_public", "data_layer"] as const;
export type MarketCandleSource = (typeof MARKET_CANDLE_SOURCES)[number];

export interface MarketCandlesEnvelope {
  schema_version: "portal.execution.market-candles.v1";
  logical_operation_id: "executionMarketCandlesV1";
  record_authority: "PORTAL_CONTROL";
  /** VENUE_PUBLIC_MARKET_DATA today; TRADING_SYSTEM_DATA_LAYER once BR-EX-50 is wired behind the edge */
  source_authority: "VENUE_PUBLIC_MARKET_DATA" | "TRADING_SYSTEM_DATA_LAYER";
  source: { kind: MarketCandleSource; venue: MarketVenue; market: MarketKind; endpoint: string; instrument: string; note: string };
  symbol: string;
  interval: MarketCandleInterval;
  interval_ms: number;
  state: "READY" | "EMPTY" | "UNAVAILABLE";
  reason_code: string | null;
  retryable: boolean;
  fetched_at_ms: number | null;
  read_at_ms: number;
  coverage: { from_ms: number | null; to_ms: number | null; requested_limit: number; returned_count: number; truncated: boolean; pages: number };
  last_candle_closed: boolean | null;
  candles: MarketCandle[];
}

/**
 * The private Manager Market Context BFF has a deliberately different wire
 * contract.  This adapter is the one place that translates it into the frozen
 * Trade Replay chart DTO.  It is pure, exact-decimal preserving, and makes no
 * network call — the controller has already authenticated and bounded the
 * named Manager operation before it reaches here.
 */
export function marketContextToCandlesEnvelope(
  query: MarketCandlesQuery,
  raw: unknown,
  now = Date.now(),
): MarketCandlesEnvelope {
  const source = object(raw);
  const range = object(source.range);
  const sourceHealth = object(source.source_health);
  const rows = Array.isArray(source.candles) ? source.candles : null;
  if (
    source.schema_version !== "portal.execution.market-context.candles.v1" ||
    source.logical_operation_id !== "managerMarketContextCandlesV1" ||
    source.environment === undefined ||
    range.venue !== query.venue ||
    range.instrument !== query.symbol ||
    range.interval !== query.interval ||
    !rows
  ) {
    return dataLayerUnavailable(query, now, "MARKET_CONTEXT_CONTRACT_REJECTED");
  }
  const candles: MarketCandle[] = [];
  for (const candidate of rows) {
    const row = object(candidate);
    const open = integer(row.open_ms);
    const close = integer(row.close_ms);
    const o = decimalString(row.open), h = decimalString(row.high), l = decimalString(row.low), c = decimalString(row.close), v = decimalString(row.volume);
    if (open === null || close === null || close < open || !o || !h || !l || !c || !v) {
      return dataLayerUnavailable(query, now, "MARKET_CONTEXT_CONTRACT_REJECTED");
    }
    candles.push({ t: open, o, h, l, c, v, close_t: close, trades: null });
  }
  const state = source.state === "POPULATED" ? "READY" as const
    : source.state === "AUTHORITATIVE_EMPTY" ? "EMPTY" as const
      : "UNAVAILABLE" as const;
  const coverage = typeof source.coverage === "string" ? source.coverage : "UNKNOWN";
  const asOf = integer(sourceHealth.as_of_ms);
  return {
    schema_version: "portal.execution.market-candles.v1",
    logical_operation_id: "executionMarketCandlesV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM_DATA_LAYER",
    source: {
      kind: "data_layer",
      venue: query.venue,
      market: MARKET_OF_VENUE[query.venue],
      endpoint: "portal-execution-edge:/internal/v2/manager/market/candles",
      instrument: query.symbol,
      note: "Trading System Data Layer candles through the Portal mTLS Manager adapter; bounded provider series, not lifecycle replay.",
    },
    symbol: query.symbol,
    interval: query.interval,
    interval_ms: MARKET_CANDLE_INTERVAL_MS[query.interval],
    state,
    reason_code: state === "UNAVAILABLE" ? "MARKET_CONTEXT_UNAVAILABLE" : state === "EMPTY" ? "MARKET_CONTEXT_NONE_IN_WINDOW" : null,
    retryable: state === "UNAVAILABLE",
    fetched_at_ms: asOf,
    read_at_ms: now,
    coverage: {
      from_ms: candles[0]?.t ?? query.fromMs,
      to_ms: candles.at(-1)?.close_t ?? query.toMs,
      requested_limit: query.limit,
      returned_count: candles.length,
      truncated: coverage !== "COMPLETE",
      pages: 1,
    },
    last_candle_closed: candles.length > 0 ? candles.at(-1)!.close_t < now : null,
    candles,
  };
}

/** A typed chart payload when Data Layer is selected but its exact BFF cannot answer. */
export function dataLayerUnavailable(query: MarketCandlesQuery, now: number, reason: string): MarketCandlesEnvelope {
  return {
    schema_version: "portal.execution.market-candles.v1",
    logical_operation_id: "executionMarketCandlesV1",
    record_authority: "PORTAL_CONTROL",
    source_authority: "TRADING_SYSTEM_DATA_LAYER",
    source: {
      kind: "data_layer", venue: query.venue, market: MARKET_OF_VENUE[query.venue],
      endpoint: "portal-execution-edge:/internal/v2/manager/market/candles", instrument: query.symbol,
      note: "Trading System Data Layer is selected; no public-venue fallback is made for this request.",
    },
    symbol: query.symbol,
    interval: query.interval,
    interval_ms: MARKET_CANDLE_INTERVAL_MS[query.interval],
    state: "UNAVAILABLE",
    reason_code: reason,
    retryable: reason !== "MARKET_CONTEXT_VENUE_UNSUPPORTED" && reason !== "MARKET_CONTEXT_RANGE_REQUIRED",
    fetched_at_ms: null,
    read_at_ms: now,
    coverage: { from_ms: query.fromMs, to_ms: query.toMs, requested_limit: query.limit, returned_count: 0, truncated: false, pages: 0 },
    last_candle_closed: null,
    candles: [],
  };
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function decimalString(value: unknown): string | null {
  return typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}

export type MarketCandlesFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SOURCE_NOTE = "Public venue klines fetched by the Portal (no credential). Market context only — not the Trading System kline shard (BR-EX-50 pending).";
const DATA_LAYER_NOTE = "Trading System data_layer klines behind the execution edge — not wired yet (BR-EX-50); no candle is fabricated in its place.";

/**
 * OKX names a perpetual `BASE-QUOTE-SWAP`. The Trading System records its
 * instruments as `ETHUSDT.OKX`-style ids, so a Binance-shaped symbol on the OKX
 * venue is rewritten deterministically and the envelope prints the instrument
 * actually requested. A symbol already in OKX form passes through.
 */
export function okxInstrument(symbol: string): string {
  if (/^[A-Z0-9]+-[A-Z0-9]+-SWAP$/.test(symbol)) return symbol;
  const m = /^([A-Z0-9]+?)(USDT|USDC|USD)$/.exec(symbol);
  return m ? `${m[1]}-${m[2]}-SWAP` : symbol;
}

class VenueReply {
  constructor(readonly kind: "candles" | "symbol_unknown" | "rate_limited" | "venue_error" | "malformed", readonly candles: MarketCandle[] = []) {}
}

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
    if (this.source() === "data_layer") {
      return this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_SOURCE_NOT_WIRED", retryable: false });
    }
    const key = `${query.venue}|${query.symbol}|${query.interval}|${query.fromMs ?? ""}|${query.toMs ?? ""}|${query.limit}`;
    const cached = this.cache.get(key);
    if (cached && now - cached.at < CACHE_TTL_MS) return { ...cached.body, read_at_ms: now };
    let pages = 0;
    let body: MarketCandlesEnvelope;
    try {
      const reply = query.venue === "OKX" ? await this.okx(query, now, () => { pages += 1; }) : await this.binance(query, now, () => { pages += 1; });
      if (reply === null) {
        return this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_RATE_LIMITED", retryable: true, coverage: this.coverage(query, [], pages, false) });
      }
      switch (reply.kind) {
        case "symbol_unknown":
          body = this.envelope(query, now, { state: "EMPTY", reason_code: "MARKET_CANDLES_SYMBOL_UNKNOWN", retryable: false, fetched_at_ms: now, coverage: this.coverage(query, [], pages, false) });
          break;
        case "rate_limited":
          body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_RATE_LIMITED", retryable: true, fetched_at_ms: now, coverage: this.coverage(query, [], pages, false) });
          break;
        case "venue_error":
          body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_ERROR", retryable: true, fetched_at_ms: now, coverage: this.coverage(query, [], pages, false) });
          break;
        case "malformed":
          body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_MALFORMED", retryable: true, fetched_at_ms: now, coverage: this.coverage(query, [], pages, false) });
          break;
        default: {
          const candles = reply.candles;
          const last = candles[candles.length - 1] ?? null;
          // the read filled its limit and the window still has room on one side
          const first = candles[0] ?? null;
          const truncated = candles.length >= query.limit && ((query.toMs !== null && last !== null && last.close_t < query.toMs) || (query.fromMs !== null && first !== null && first.t > query.fromMs));
          body = this.envelope(query, now, {
            state: candles.length === 0 ? "EMPTY" : "READY",
            reason_code: candles.length === 0 ? "MARKET_CANDLES_NONE_IN_WINDOW" : null,
            retryable: false,
            fetched_at_ms: now,
            candles,
            coverage: this.coverage(query, candles, pages, truncated),
            last_candle_closed: last ? last.close_t < now : null,
          });
        }
      }
    } catch {
      body = this.envelope(query, now, { state: "UNAVAILABLE", reason_code: "MARKET_CANDLES_VENUE_UNREACHABLE", retryable: true, fetched_at_ms: now, coverage: this.coverage(query, [], pages, false) });
    }
    if (body.state === "READY") this.cache.set(key, { at: now, body });
    return body;
  }

  /** One budgeted, time-limited GET; `null` when the per-minute budget is spent. */
  private async get(url: string, now: number): Promise<{ ok: boolean; status: number; json(): Promise<unknown> } | null> {
    while (this.calls.length > 0 && now - this.calls[0]! > 60_000) this.calls.shift();
    if (this.calls.length >= BUDGET_PER_MINUTE) return null;
    this.calls.push(now);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await this.fetchImpl(url, { signal: controller.signal, headers: { accept: "application/json" } });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Binance answers up to 1500 rows a page, oldest first. With a window
   * start the walk goes forward from `from_ms`; without one it goes backward
   * from `to_ms` (or now) so "the latest N bars" still works past one page.
   */
  private async binance(query: MarketCandlesQuery, now: number, page: () => void): Promise<VenueReply | null> {
    const collected: MarketCandle[] = [];
    const forward = query.fromMs !== null;
    let cursorFrom = query.fromMs;
    let cursorTo = query.toMs;
    const maxPages = Math.ceil(query.limit / BINANCE_PAGE);
    for (let i = 0; i < maxPages; i += 1) {
      const pageLimit = Math.min(BINANCE_PAGE, query.limit - collected.length);
      const params = new URLSearchParams({ symbol: query.symbol, interval: query.interval, limit: String(pageLimit) });
      if (cursorFrom !== null) params.set("startTime", String(cursorFrom));
      if (cursorTo !== null) params.set("endTime", String(cursorTo));
      const response = await this.get(`${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_ORIGIN}${BINANCE_PATH}?${params.toString()}`, now);
      if (response === null) return collected.length > 0 ? new VenueReply("candles", collected) : null;
      page();
      if (!response.ok) {
        const upstream = (await response.json().catch(() => null)) as { code?: unknown } | null;
        const venueCode = typeof upstream?.code === "number" ? upstream.code : null;
        if (venueCode === -1121 || venueCode === -1100) return new VenueReply("symbol_unknown");
        return new VenueReply(response.status === 429 || response.status === 418 ? "rate_limited" : "venue_error");
      }
      const rows = readKlines(await response.json());
      if (rows === null) return new VenueReply("malformed");
      if (rows.length === 0) break;
      if (forward) {
        collected.push(...rows.filter((r) => collected.length === 0 || r.t > collected[collected.length - 1]!.t));
        const last = rows[rows.length - 1]!;
        if (rows.length < pageLimit || collected.length >= query.limit || (query.toMs !== null && last.close_t >= query.toMs)) break;
        cursorFrom = last.close_t + 1;
      } else {
        collected.unshift(...rows.filter((r) => collected.length === 0 || r.t < collected[0]!.t));
        const first = rows[0]!;
        if (rows.length < pageLimit || collected.length >= query.limit) break;
        cursorTo = first.t - 1;
      }
    }
    return new VenueReply("candles", collected.slice(forward ? 0 : -query.limit, forward ? query.limit : undefined));
  }

  /**
   * OKX pages newest-first, 100 rows a page, `after` = rows strictly older
   * than the given ms. Walk back from `to_ms` (or now) until the window's
   * start or the limit; a page that repeats or comes back empty ends the walk.
   */
  private async okx(query: MarketCandlesQuery, now: number, page: () => void): Promise<VenueReply | null> {
    const instId = okxInstrument(query.symbol);
    const intervalMs = MARKET_CANDLE_INTERVAL_MS[query.interval];
    const collected: MarketCandle[] = [];
    let after = (query.toMs ?? now) + 1;
    const maxPages = Math.ceil(query.limit / OKX_PAGE);
    for (let i = 0; i < maxPages; i += 1) {
      const params = new URLSearchParams({ instId, bar: OKX_BAR[query.interval], after: String(after), limit: String(Math.min(OKX_PAGE, query.limit - collected.length)) });
      if (query.fromMs !== null) params.set("before", String(query.fromMs - 1));
      const response = await this.get(`${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_OKX_ORIGIN}${OKX_PATH}?${params.toString()}`, now);
      if (response === null) return collected.length > 0 ? new VenueReply("candles", collected) : null;
      page();
      if (!response.ok) return new VenueReply(response.status === 429 ? "rate_limited" : "venue_error");
      const raw = (await response.json().catch(() => null)) as { code?: unknown; data?: unknown } | null;
      if (raw === null || typeof raw !== "object") return new VenueReply("malformed");
      if (raw.code !== "0") {
        return raw.code === "51001" ? new VenueReply("symbol_unknown") : new VenueReply("venue_error");
      }
      const rows = readOkxCandles(raw.data, intervalMs);
      if (rows === null) return new VenueReply("malformed");
      if (rows.length === 0) break;
      // rows arrive newest first; each page is reversed so the whole record ascends
      collected.unshift(...rows.slice().reverse().filter((r) => query.fromMs === null || r.t >= query.fromMs));
      const oldest = rows[rows.length - 1]!.t;
      if (oldest >= after) break; // no progress — the venue repeated itself
      after = oldest;
      if (collected.length >= query.limit || (query.fromMs !== null && oldest <= query.fromMs) || rows.length < OKX_PAGE) break;
    }
    return new VenueReply("candles", collected.slice(-query.limit));
  }

  private coverage(query: MarketCandlesQuery, candles: MarketCandle[], pages: number, truncated: boolean): MarketCandlesEnvelope["coverage"] {
    const last = candles[candles.length - 1] ?? null;
    return { from_ms: candles[0]?.t ?? query.fromMs, to_ms: last?.close_t ?? query.toMs, requested_limit: query.limit, returned_count: candles.length, truncated, pages };
  }

  source(): MarketCandleSource { return this.config.EXECUTION_MARKET_CANDLES_SOURCE; }

  private envelope(query: MarketCandlesQuery, now: number, patch: Partial<MarketCandlesEnvelope>): MarketCandlesEnvelope {
    const okx = query.venue === "OKX";
    const kind = this.source();
    return {
      schema_version: "portal.execution.market-candles.v1",
      logical_operation_id: "executionMarketCandlesV1",
      record_authority: "PORTAL_CONTROL",
      source_authority: kind === "data_layer" ? "TRADING_SYSTEM_DATA_LAYER" : "VENUE_PUBLIC_MARKET_DATA",
      source: {
        kind,
        venue: query.venue,
        market: MARKET_OF_VENUE[query.venue],
        endpoint: kind === "data_layer" ? "edge:/v1/binance/futures/klines/{symbol}" : okx ? `${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_OKX_ORIGIN}${OKX_PATH}` : `${this.config.EXECUTION_PUBLIC_MARKET_CANDLES_ORIGIN}${BINANCE_PATH}`,
        instrument: okx ? okxInstrument(query.symbol) : query.symbol,
        note: kind === "data_layer" ? DATA_LAYER_NOTE : SOURCE_NOTE,
      },
      symbol: query.symbol,
      interval: query.interval,
      interval_ms: MARKET_CANDLE_INTERVAL_MS[query.interval],
      state: "UNAVAILABLE",
      reason_code: null,
      retryable: false,
      fetched_at_ms: null,
      read_at_ms: now,
      coverage: { from_ms: query.fromMs, to_ms: query.toMs, requested_limit: query.limit, returned_count: 0, truncated: false, pages: 0 },
      last_candle_closed: null,
      candles: [],
      ...patch,
    };
  }
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** Binance kline rows: [openTime, o, h, l, c, v, closeTime, quoteVol, trades, ...]. Strings stay strings. */
export function readKlines(raw: unknown): MarketCandle[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MarketCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 7) return null;
    const [t, o, h, l, c, v, closeT, , trades] = row as unknown[];
    if (typeof t !== "number" || typeof closeT !== "number") return null;
    if (![o, h, l, c, v].every((x) => typeof x === "string" && DECIMAL.test(x))) return null;
    out.push({ t, o: o as string, h: h as string, l: l as string, c: c as string, v: v as string, close_t: closeT, trades: typeof trades === "number" ? trades : null });
  }
  return out;
}

/**
 * OKX rows: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] with every
 * field a string, newest first. `close_t` is derived from the interval —
 * OKX does not print it — and `confirm` "0" marks the still-open bar.
 */
export function readOkxCandles(raw: unknown, intervalMs: number): MarketCandle[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MarketCandle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) return null;
    const [ts, o, h, l, c, v] = row as unknown[];
    if (typeof ts !== "string" || !/^\d+$/.test(ts)) return null;
    if (![o, h, l, c, v].every((x) => typeof x === "string" && DECIMAL.test(x))) return null;
    const t = Number(ts);
    out.push({ t, o: o as string, h: h as string, l: l as string, c: c as string, v: v as string, close_t: t + intervalMs - 1, trades: null });
  }
  return out;
}
