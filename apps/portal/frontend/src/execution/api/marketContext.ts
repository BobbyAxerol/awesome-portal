/**
 * `GET /api/v1/execution/market/candles` — the Trading System's own bars, as
 * the market-context BFF publishes them (`portal.execution.market-context.
 * candles.v1`, EDS-10b/11R4).
 *
 * This is the second source of candles on the surface, and the two are not
 * interchangeable. The venue endpoint returns what the exchange says happened;
 * this one returns what the Trading System recorded. When a fill does not sit
 * on the bar it should, the difference between those two answers is the whole
 * finding — so the reader keeps them apart and every panel names which one it
 * drew.
 *
 * Nothing here is converted. Prices stay the source's strings, and the two
 * clocks are the only numbers, exactly as the venue reader does it.
 */

/** Where the bars came from. Panels print this; they never infer it. */
export type CandleSource = "TRADING_SYSTEM_DATA_LAYER" | "VENUE_PUBLIC_MARKET_DATA";

export interface ContextCandle {
  openMs: number;
  closeMs: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | null;
}

export interface MarketContextCandles {
  source: "TRADING_SYSTEM_DATA_LAYER";
  environment: string | null;
  venue: string | null;
  instrument: string | null;
  interval: string | null;
  /**
   * The source's own word for how much of the asked range it covered.
   *
   * `PARTIAL` with `SOURCE_BOUNDED` sampling is a bounded answer, not a broken
   * one — the panel says so rather than drawing a gap as if the market had
   * stopped.
   */
  coverage: string | null;
  sampling: string | null;
  /** `POPULATED` / `EMPTY_VALID` / whatever else the source publishes. */
  state: string | null;
  /**
   * The source's own health verdict. Kept as three separate words because they
   * answer three different questions and collapsing them loses the one that
   * matters: a series can be AVAILABLE, AGING and POLL_BOUNDED at once.
   */
  availability: string | null;
  freshness: string | null;
  completeness: string | null;
  asOfMs: number | null;
  /**
   * `BOUNDED_PROVIDER_SERIES_NO_REPLAY_CLAIM` — the source states outright that
   * this is not a replay-grade history. A panel that used it to claim a
   * complete session would be overreaching past what was published.
   */
  historySemantics: string | null;
  candles: readonly ContextCandle[];
}

const obj = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
const str = (raw: unknown): string | null => (typeof raw === "string" && raw.length > 0 ? raw : null);
const num = (raw: unknown): number | null => (typeof raw === "number" && Number.isFinite(raw) ? raw : null);

/** The query the BFF validates. Its names are its own — `instrument`, not
 *  `symbol`, and `point_limit`, not `limit`; the venue route uses the others,
 *  and mixing them up is answered with a typed 400 rather than a guess. */
export interface MarketContextQuery {
  environment: string;
  venue: string;
  instrument: string;
  interval: string;
  fromMs: number;
  toMs: number;
  pointLimit?: number;
}

export function marketContextCandlesPath(q: MarketContextQuery): string {
  const params = new URLSearchParams({
    environment: q.environment,
    venue: q.venue,
    instrument: q.instrument,
    interval: q.interval,
    from_ms: String(Math.trunc(q.fromMs)),
    to_ms: String(Math.trunc(q.toMs)),
  });
  if (q.pointLimit) params.set("point_limit", String(Math.trunc(q.pointLimit)));
  return `/market/candles?${params.toString()}`;
}

/**
 * Reads the envelope, or `null` when it is not the envelope it claims to be.
 *
 * A bar missing either clock is dropped rather than placed at zero: a candle at
 * the epoch would draw a spike at the left edge of every chart it entered.
 */
export function readMarketContextCandles(raw: unknown): MarketContextCandles | null {
  const o = obj(raw);
  if (!o || o.schema_version !== "portal.execution.market-context.candles.v1") return null;
  const range = obj(o.range);
  const health = obj(o.source_health);
  const provenance = obj(o.provenance);
  const rows = Array.isArray(o.candles) ? o.candles : [];
  const candles: ContextCandle[] = [];
  for (const row of rows) {
    const c = obj(row);
    if (!c) continue;
    const openMs = num(c.open_ms);
    const closeMs = num(c.close_ms);
    const open = str(c.open);
    const high = str(c.high);
    const low = str(c.low);
    const close = str(c.close);
    if (openMs === null || closeMs === null || !open || !high || !low || !close) continue;
    candles.push({ openMs, closeMs, open, high, low, close, volume: str(c.volume) });
  }
  return {
    source: "TRADING_SYSTEM_DATA_LAYER",
    environment: str(o.environment),
    venue: str(range?.venue),
    instrument: str(range?.instrument),
    interval: str(range?.interval),
    coverage: str(o.coverage),
    sampling: str(o.sampling),
    state: str(o.state),
    availability: str(health?.availability),
    freshness: str(health?.freshness),
    completeness: str(health?.completeness),
    asOfMs: num(health?.as_of_ms),
    historySemantics: str(provenance?.history_semantics),
    candles,
  };
}

/**
 * How a panel should describe the bars it drew.
 *
 * The source is named first because it is the fact a reader needs before any
 * of the numbers mean anything, and the bounded-ness is said in the source's
 * own words rather than translated into a reassurance.
 */
export function candleProvenanceLine(payload: MarketContextCandles): string {
  const parts: string[] = [payload.source];
  if (payload.coverage) parts.push(`coverage ${payload.coverage}`);
  if (payload.sampling) parts.push(payload.sampling);
  if (payload.freshness) parts.push(payload.freshness);
  if (payload.historySemantics === "BOUNDED_PROVIDER_SERIES_NO_REPLAY_CLAIM") {
    parts.push("provider series — not a replay-grade history");
  }
  return parts.join(" · ");
}
