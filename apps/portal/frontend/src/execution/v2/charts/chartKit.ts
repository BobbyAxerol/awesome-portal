/** Small builders shared by the chart tests. Not imported by product code. */
import { readUtcEpochMs } from "../../screenDataContract";
import type { SeriesPoint, UtcEpochMs } from "./types";

export const DAY = 86_400_000;

export function at(iso: string): UtcEpochMs {
  const value = readUtcEpochMs(Date.parse(iso));
  if (value === null) throw new Error(`not an instant: ${iso}`);
  return value;
}

export function epoch(n: number): UtcEpochMs {
  const value = readUtcEpochMs(n);
  if (value === null) throw new Error(`not an instant: ${n}`);
  return value;
}

/** One point per `step` ms from `start`; `null` stays a gap. */
export function series(values: readonly (string | null)[], start = "2026-10-01T00:00:00Z", step = DAY): SeriesPoint[] {
  const t0 = Date.parse(start);
  return values.map((v, i) => ({ t: epoch(t0 + i * step), v }));
}

/** Deterministic LCG so a 5,000-point case is the same on every machine. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A random walk as exact 2 dp strings. */
export function walk(n: number, seed = 7, start = 1_000_000, vol = 2_600): string[] {
  const r = rng(seed);
  let v = start;
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    v += (r() - 0.5) * vol;
    out.push(v.toFixed(2));
  }
  return out;
}
