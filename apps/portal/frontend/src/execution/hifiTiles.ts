/**
 * The twelve Insight Charts of the Alpha 360 hi-fi, computed from published
 * facts (P0-3).
 *
 * The hi-fi names twelve tiles in a fixed order, and dev had seven under four
 * different names. Tile identity matters more than it looks: an operator who
 * learned that panel 8 is execution density reads panel 8 without reading its
 * title, so a screen that renumbers them is a screen that misleads quietly.
 *
 * This module computes the derivable ones from the rows the Portal already
 * holds — fills, orders, the equity series, the drawdown and correlation
 * branches — and states, per tile, which figures came from the source and which
 * part is still `Soon`. Nothing here invents a series: a tile whose input is
 * missing carries a reason code, not a plausible shape.
 */

export type TileNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** The hi-fi's own titles and captions, in the hi-fi's own order. */
export const HIFI_TILES: readonly { index: TileNumber; title: string; caption: string }[] = [
  { index: 1, title: "Equity by stage", caption: "30d · 1h · join: artifact digest" },
  { index: 2, title: "Drawdown & underwater", caption: "per deployment · no smoothing" },
  { index: 3, title: "Rolling corr vs benchmark", caption: "ρ per pair · corr.v1" },
  { index: 4, title: "Venue contribution", caption: "per-venue currency · no FX mix" },
  { index: 5, title: "Execution quality by venue", caption: "acks and fills per venue · execution_quality.v1" },
  { index: 6, title: "Order funnel", caption: "submitted → risk → order → fill · drop reasons per stage" },
  { index: 7, title: "Trade return histogram", caption: "net of fees" },
  { index: 8, title: "Execution density day × hour", caption: "7×24 heatmap · fills per cell" },
  { index: 9, title: "Regime-shaded equity", caption: "regime.v2 · labels versioned" },
  { index: 10, title: "Paper vs Live drift", caption: "hit rate Δ · fill delay Δ" },
  { index: 11, title: "Risk utilization", caption: "notional · leverage · daily loss vs risk profile" },
  { index: 12, title: "Cost drag waterfall", caption: "gross → fees → funding → net" },
];

type Row = Record<string, unknown>;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value) : null;

const decimal = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

const timeMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/* ── 7 · Trade return histogram ─────────────────────────────────────────── */

export interface ReturnHistogram {
  buckets: { from: number; to: number; count: number }[];
  trades: number;
  /** fills that carry no realized pnl at all — counted, never bucketed as zero */
  withoutPnl: number;
  p50: number;
  p95: number;
}

/**
 * Realized PnL per closing fill, bucketed.
 *
 * Only fills that actually carry a `realized_pnl` are bucketed. A fill with no
 * value is not a zero-return trade — it is an entry, or a row the source did
 * not price — and counting it as zero would put a spike at the middle of every
 * histogram on the screen.
 */
export function returnHistogram(fills: readonly Row[], bucketCount = 21): ReturnHistogram | null {
  const values: number[] = [];
  let withoutPnl = 0;
  for (const fill of fills) {
    const pnl = decimal(fill.realized_pnl);
    if (pnl === null) { withoutPnl += 1; continue; }
    values.push(pnl);
  }
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const span = hi - lo;
  const width = span === 0 ? 1 : span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    from: lo + index * width,
    to: lo + (index + 1) * width,
    count: 0,
  }));
  for (const value of values) {
    const index = span === 0 ? 0 : Math.min(bucketCount - 1, Math.floor((value - lo) / width));
    buckets[index].count += 1;
  }
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return { buckets, trades: values.length, withoutPnl, p50: at(0.5), p95: at(0.95) };
}

/* ── 8 · Execution density day × hour ───────────────────────────────────── */

export const DENSITY_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface DensityGrid {
  /** [hour, dayIndex, count] as the heatmap expects; null count for an empty cell */
  cells: (readonly [number, number, number | null])[];
  total: number;
  busiest: { day: string; hour: number; count: number } | null;
}

/** Fills per UTC weekday × hour. The clock is the source's `trade_time`, in UTC. */
export function densityGrid(fills: readonly Row[]): DensityGrid | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const fill of fills) {
    const ms = timeMs(fill.trade_time ?? fill.trade_time_ms);
    if (ms === null) continue;
    const at = new Date(ms);
    // getUTCDay is 0=Sunday; the grid reads Monday first, as the hi-fi draws it.
    const day = (at.getUTCDay() + 6) % 7;
    const hour = at.getUTCHours();
    const key = `${day}:${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return null;
  const cells: (readonly [number, number, number | null])[] = [];
  let busiest: DensityGrid["busiest"] = null;
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const count = counts.get(`${day}:${hour}`) ?? null;
      cells.push([hour, day, count]);
      if (count !== null && (busiest === null || count > busiest.count)) {
        busiest = { day: DENSITY_DAYS[day], hour, count };
      }
    }
  }
  return { cells, total, busiest };
}

/* ── 5 · Execution quality by venue ─────────────────────────────────────── */

export interface VenueQuality {
  venue: string;
  submitted: number;
  filled: number;
  rejected: number;
  fills: number;
  /** null when no order of this venue reached a terminal state */
  rejectRate: number | null;
}

const REJECTED = /REJECT|DENIED/;

/** Orders and fills grouped by the venue the source names on each row. */
export function venueQuality(orders: readonly Row[], fills: readonly Row[]): VenueQuality[] {
  const byVenue = new Map<string, VenueQuality>();
  const of = (venue: string) => {
    const existing = byVenue.get(venue);
    if (existing) return existing;
    const created: VenueQuality = { venue, submitted: 0, filled: 0, rejected: 0, fills: 0, rejectRate: null };
    byVenue.set(venue, created);
    return created;
  };
  for (const order of orders) {
    const venue = text(order.venue);
    if (!venue) continue;
    const row = of(venue);
    row.submitted += 1;
    const status = (text(order.status) ?? "").toUpperCase();
    if (status === "FILLED") row.filled += 1;
    else if (REJECTED.test(status)) row.rejected += 1;
  }
  for (const fill of fills) {
    const venue = text(fill.venue);
    if (!venue) continue;
    of(venue).fills += 1;
  }
  const rows = [...byVenue.values()];
  for (const row of rows) {
    const terminal = row.filled + row.rejected;
    row.rejectRate = terminal === 0 ? null : row.rejected / terminal;
  }
  return rows.sort((a, b) => b.submitted - a.submitted);
}

/* ── 12 · Cost drag waterfall ───────────────────────────────────────────── */

export interface CostDrag {
  currency: string;
  gross: number;
  fees: number;
  net: number;
  /** funding is a separate source fact; absent until the source publishes it */
  fundingPublished: boolean;
  fills: number;
}

/**
 * Gross, fees and net per currency, from the fills themselves.
 *
 * Currencies are never mixed: a USDT fee and a USDC fee are two facts, and the
 * hi-fi's own caption says so. Funding is left out rather than folded into
 * fees, because the source publishes no funding column on a fill and a
 * waterfall with an invented term is worse than one with a stated gap.
 */
export function costDrag(fills: readonly Row[]): CostDrag[] {
  const byCurrency = new Map<string, CostDrag>();
  for (const fill of fills) {
    const pnl = decimal(fill.realized_pnl);
    const fee = decimal(fill.commission);
    const currency = text(fill.commission_currency) ?? text(fill.currency) ?? "—";
    if (pnl === null && fee === null) continue;
    const row = byCurrency.get(currency) ?? { currency, gross: 0, fees: 0, net: 0, fundingPublished: false, fills: 0 };
    row.gross += pnl ?? 0;
    row.fees += fee ?? 0;
    row.fills += 1;
    if (fill.funding_fee !== undefined || fill.funding !== undefined) row.fundingPublished = true;
    byCurrency.set(currency, row);
  }
  const rows = [...byCurrency.values()];
  for (const row of rows) row.net = row.gross - row.fees;
  return rows.sort((a, b) => b.fills - a.fills);
}

/* ── 4 · Venue contribution ─────────────────────────────────────────────── */

export interface VenueContribution { venue: string; currency: string; realized: number; fills: number }

/** Realized PnL per venue and currency. No FX mixing, as the hi-fi's caption demands. */
export function venueContribution(fills: readonly Row[]): VenueContribution[] {
  const rows = new Map<string, VenueContribution>();
  for (const fill of fills) {
    const venue = text(fill.venue);
    const pnl = decimal(fill.realized_pnl);
    if (!venue || pnl === null) continue;
    const currency = text(fill.commission_currency) ?? "—";
    const key = `${venue}|${currency}`;
    const row = rows.get(key) ?? { venue, currency, realized: 0, fills: 0 };
    row.realized += pnl;
    row.fills += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => Math.abs(b.realized) - Math.abs(a.realized));
}
