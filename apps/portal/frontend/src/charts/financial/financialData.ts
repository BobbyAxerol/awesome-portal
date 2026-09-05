/**
 * Pure data shaping for `PrimusFinancialChart`.
 *
 * The server publishes decimal strings on ISO-8601 UTC buckets. A canvas needs
 * JS numbers, so this module parses them exactly once, for placement only, and
 * keeps every published string beside its bucket so the tooltip, the endpoint
 * pill and the table print the server's text verbatim. Nothing here sums,
 * averages or derives a figure; a bucket the server left empty stays a `null`
 * that breaks the line.
 */
import type { EquitySeries } from "../../execution/components/EquityChart";

export interface FinancialRaw {
  /** bucket start, ISO-8601 UTC — as published */
  t: string;
  value: string | null;
  drawdown: string | null;
  lower: string | null;
  upper: string | null;
}

export interface FinancialGap {
  from: number;
  to: number;
  reason: string;
}

export interface FinancialData {
  label: string;
  bandLabel: string | null;
  /** epoch ms, ascending, unique */
  xs: number[];
  /** parsed for placement only; null keeps a gap open */
  values: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  hasBand: boolean;
  gaps: FinancialGap[];
  raw: Map<number, FinancialRaw>;
  /** buckets whose value the server did not publish */
  missing: number;
  /** points dropped because their timestamp could not be parsed — counted, never hidden */
  dropped: number;
  /** every published value is > 0: the precondition for a log axis */
  positive: boolean;
}

export function num(v: string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toFinancialData(series: EquitySeries): FinancialData {
  const raw = new Map<number, FinancialRaw>();
  let dropped = 0;
  for (const p of series.points) {
    const ms = Date.parse(p.t);
    if (!Number.isFinite(ms)) {
      dropped += 1;
      continue;
    }
    raw.set(ms, { t: p.t, value: p.equity, drawdown: p.drawdown ?? null, lower: null, upper: null });
  }
  // The band is joined on the bucket it was published for; a band bucket with
  // no series bucket has nothing to sit under and is not invented.
  for (const b of series.band ?? []) {
    const ms = Date.parse(b.t);
    const row = Number.isFinite(ms) ? raw.get(ms) : undefined;
    if (row) {
      row.lower = b.lower;
      row.upper = b.upper;
    }
  }
  const xs = [...raw.keys()].sort((a, b) => a - b);
  const values = xs.map((x) => num(raw.get(x)!.value));
  const upper = xs.map((x) => num(raw.get(x)!.upper));
  const lower = xs.map((x) => num(raw.get(x)!.lower));
  const gaps = (series.gaps ?? []).flatMap((g) => {
    const from = Date.parse(g.from);
    const to = Date.parse(g.to);
    return Number.isFinite(from) && Number.isFinite(to) && to > from ? [{ from, to, reason: g.reason }] : [];
  });
  const published = values.filter((v): v is number => v !== null);
  return {
    label: series.label,
    bandLabel: series.bandLabel ?? null,
    xs,
    values,
    upper,
    lower,
    hasBand: upper.some((v, i) => v !== null && lower[i] !== null),
    gaps,
    raw,
    missing: values.length - published.length,
    dropped,
    positive: published.length > 0 && published.every((v) => v > 0),
  };
}

/* ── window presets ──────────────────────────────────────────────────── */

export type RangePreset = "1W" | "1M" | "3M" | "ALL";
export const RANGE_PRESETS: readonly RangePreset[] = ["1W", "1M", "3M", "ALL"];
const DAY_MS = 86_400_000;
const SPAN_MS: Record<Exclude<RangePreset, "ALL">, number> = { "1W": 7 * DAY_MS, "1M": 30 * DAY_MS, "3M": 90 * DAY_MS };

/** The x window a preset selects, anchored on the newest bucket. `null` = whole series. */
export function presetRange(xs: readonly number[], preset: RangePreset): [number, number] | null {
  if (preset === "ALL" || xs.length < 2) return null;
  const last = xs[xs.length - 1]!;
  const first = xs[0]!;
  const from = last - SPAN_MS[preset];
  return from <= first ? null : [from, last];
}

/** A preset shorter than the series is a real choice; one that covers it all is just "ALL" again. */
export function presetAvailable(xs: readonly number[], preset: RangePreset): boolean {
  return preset === "ALL" || presetRange(xs, preset) !== null;
}

/* ── UTC labels ──────────────────────────────────────────────────────── */

const two = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD HH:mmZ` — the tooltip time, unambiguous UTC (v0.5 §13). */
export function utcLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}Z`;
}

/**
 * Axis tick text chosen by the visible span, always UTC. uPlot's default
 * formatter would print the browser's local time — a bucket boundary that
 * moves with the reader's laptop is not the one the server published.
 */
export function xTickLabel(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const date = `${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  if (spanMs > 5 * DAY_MS) return date;
  if (spanMs > 6 * 3_600_000) return `${date} ${time}`;
  return time;
}

/** Axis numbers are canvas geometry, not published figures: en-US grouping, precision by magnitude. */
export function axisNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
