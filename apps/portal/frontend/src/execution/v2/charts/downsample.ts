/**
 * Envelope downsampling. Extrema are never smoothed away: every bucket keeps
 * its minimum and its maximum, every run keeps its first and last point, and
 * gaps are structural (a gap splits a run, it is never bridged).
 */
import { compareDecimal } from "./decimal";

/** A drawable observation: index into the caller's array plus its time and value. */
export interface Mark {
  readonly i: number;
  readonly t: number;
  readonly n: number;
  readonly s: string;
}

export interface Envelope {
  /** Drawable points before reduction. */
  readonly sourceCount: number;
  /** Points actually drawn. */
  readonly shownCount: number;
  /** Source points per bucket; 1 means nothing was reduced. */
  readonly bucket: number;
  /** True when fewer points were drawn than were drawable. */
  readonly reduced: boolean;
}

/** Points per bucket needed to fit `count` drawable points into about `budget` marks. */
export function bucketSizeFor(count: number, budget: number): number {
  if (count <= budget) return 1;
  return Math.max(2, Math.ceil(count / Math.max(2, Math.floor(budget / 2))));
}

/** Reduce one contiguous run. Order is preserved; the exact min and max of each bucket survive. */
export function reduceRun(run: readonly Mark[], bucket: number): Mark[] {
  if (bucket <= 1 || run.length <= 4) return run.slice();
  const keep = new Set<number>([0, run.length - 1]);
  for (let start = 0; start < run.length; start += bucket) {
    const end = Math.min(run.length, start + bucket);
    let lo = start;
    let hi = start;
    for (let k = start + 1; k < end; k += 1) {
      // Exact comparison on the strings: a float tie must not drop the true extremum.
      if (run[k].n <= run[lo].n && compareDecimal(run[k].s, run[lo].s) < 0) lo = k;
      if (run[k].n >= run[hi].n && compareDecimal(run[k].s, run[hi].s) > 0) hi = k;
    }
    keep.add(lo);
    keep.add(hi);
  }
  return [...keep].sort((a, b) => a - b).map((k) => run[k]);
}

/** Reduce all runs with one shared bucket size and report what happened. */
export function reduceRuns(runs: readonly (readonly Mark[])[], budget: number): { runs: Mark[][]; envelope: Envelope } {
  const sourceCount = runs.reduce((sum, run) => sum + run.length, 0);
  const bucket = bucketSizeFor(sourceCount, budget);
  const out = runs.map((run) => reduceRun(run, bucket));
  const shownCount = out.reduce((sum, run) => sum + run.length, 0);
  return { runs: out, envelope: { sourceCount, shownCount, bucket, reduced: shownCount < sourceCount } };
}

/** The caption that says what the envelope did, in the words the reader needs. */
export function envelopeCaption(env: Envelope, gaps: number, unreadable: number): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const parts: string[] = [];
  if (env.reduced) {
    parts.push(`Showing ${n(env.shownCount)} of ${n(env.sourceCount)} points`);
    parts.push(`minimum and maximum kept in every bucket of ${n(env.bucket)} points`);
  } else {
    parts.push(`${n(env.sourceCount)} ${env.sourceCount === 1 ? "point" : "points"}, none reduced`);
  }
  if (gaps > 0) parts.push(`${n(gaps)} ${gaps === 1 ? "gap drawn as a gap" : "gaps drawn as gaps"}, not joined`);
  if (unreadable > 0) parts.push(`${n(unreadable)} unreadable ${unreadable === 1 ? "value" : "values"} drawn as ${unreadable === 1 ? "a gap" : "gaps"}`);
  return parts.join(" · ");
}
