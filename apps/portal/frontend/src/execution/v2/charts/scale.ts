/**
 * Axis maths. Ticks are scale marks, not data: they are the only labels that
 * come from a number, and they are built as decimal strings of the tick step
 * so `formatExact` prints them like any other value.
 */
import { formatAsOf } from "../boundary";
import type { UtcEpochMs } from "../../screenDataContract";

export interface ValueTicks {
  readonly values: readonly number[];
  /** Decimal strings of `values`, ready for `formatExact`. */
  readonly labels: readonly string[];
  readonly lo: number;
  readonly hi: number;
}

const NEGATIVE_ZERO = /^-0(\.0+)?$/;

function plain(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return NEGATIVE_ZERO.test(text) ? text.slice(1) : text;
}

/** About `target` round ticks covering [lo, hi]; step is 1, 2 or 5 times a power of ten. */
export function niceTicks(lo: number, hi: number, target = 4): ValueTicks {
  let a = lo;
  let b = hi;
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    a = 0;
    b = 1;
  }
  if (a === b) {
    // One distinct value: open a unit window so the axis exists and the line sits mid-plot.
    const open = Math.abs(a) > 1 ? Math.abs(a) * 0.05 : 1;
    a -= open;
    b += open;
  }
  const span = b - a;
  const power = Math.floor(Math.log10(span / target));
  const unit = 10 ** power;
  const ratio = span / target / unit;
  const step = unit * (ratio < 1.5 ? 1 : ratio < 3 ? 2 : ratio < 7 ? 5 : 10);
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const first = Math.floor(a / step + 1e-9);
  const last = Math.ceil(b / step - 1e-9);
  const values: number[] = [];
  const labels: string[] = [];
  for (let i = first; i <= last; i += 1) {
    const text = plain(i * step, decimals);
    values.push(Number(text));
    labels.push(text);
  }
  return { values, labels, lo: values[0], hi: values[values.length - 1] };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TIME_STEPS = [
  MINUTE, 5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
  DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY,
] as const;

export interface TimeTick {
  readonly t: number;
  /** `17 Oct 09:14Z`, UTC regardless of the browser. */
  readonly label: string;
}

/** At most `max` ticks on round UTC multiples inside [from, to]. */
export function timeTicks(from: number, to: number, max: number): readonly TimeTick[] {
  if (!(to > from) || max < 1) return [{ t: from, label: formatAsOf(from as UtcEpochMs) }];
  const step = TIME_STEPS.find((s) => Math.floor(to / s) - Math.ceil(from / s) + 1 <= max) ?? TIME_STEPS[TIME_STEPS.length - 1];
  const out: TimeTick[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) out.push({ t, label: formatAsOf(t as UtcEpochMs) });
  // A window shorter than one step still gets an axis: label its ends.
  if (out.length === 0) return [from, to].map((t) => ({ t, label: formatAsOf(t as UtcEpochMs) }));
  return out;
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

export const px = (n: number): string => (Math.round(n * 10) / 10).toString();
