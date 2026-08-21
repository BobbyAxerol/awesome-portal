/**
 * Mechanism M2 — resolution-selected series.
 *
 * The server picks the interval and the client never asks for one (BR-EX-04,
 * ruled MODIFY: "client requests range/intent; server selects the interval
 * ladder and enforces ≤5,000"). So this module does not build requests. It does
 * two other things the client genuinely needs.
 *
 * **It predicts the rung, in order to know when to re-query.** `dataZoom` past
 * the current interval's usefulness must re-fetch at the next rung down rather
 * than zooming into an already-aggregated array, because zooming an aggregate
 * renders a shape the data does not have — the failure spec §16.3 exists to
 * prevent. Knowing which rung the visible range deserves is how the client
 * decides that a round-trip is due. (The behaviour is the unruled half of
 * BR-EX-05; the prediction is safe either way because it triggers a request
 * rather than a transformation.)
 *
 * **It validates what came back.** A series that exceeds the cap, or arrives at
 * a coarser rung than its range needs, is a contract violation. Surfacing it as
 * a caption warning is better than rendering it silently, because a chart that
 * misreports its own resolution is indistinguishable from a correct one.
 *
 * The ladder itself is "the finest interval whose point count is ≤ 5,000",
 * not a table of range brackets. Stated as brackets it drops the 5m rung and a
 * ten-day window gets 960 points where 2,880 fit — and four to seventeen days is
 * the post-incident window, so the loss lands exactly where it is felt. See
 * `EXECUTION_SCALE_AND_REFINE.md` §3.1 and `BACKEND_PLAN_REVIEW.md` F-2.
 */
import type { ChartEnvelope } from "./contracts";

/** Spec §16.4. An interactive series never exceeds this. */
export const MAX_POINTS = 5000;

export interface Interval {
  /** Wire code, as the server returns it. */
  code: string;
  seconds: number;
}

/** Finest first. The server may serve a coarser rung; it may not serve a finer. */
export const INTERVAL_LADDER: readonly Interval[] = [
  { code: "1m", seconds: 60 },
  { code: "5m", seconds: 300 },
  { code: "15m", seconds: 900 },
  { code: "1h", seconds: 3_600 },
  { code: "4h", seconds: 14_400 },
  { code: "1d", seconds: 86_400 },
];

/** The coarsest rung, used when even a day bucket cannot fit the range. */
const COARSEST = INTERVAL_LADDER[INTERVAL_LADDER.length - 1];

/**
 * The finest interval whose point count fits under the cap.
 *
 * A range longer than 5,000 days still returns `1d`: at that point the cap is
 * genuinely exceeded and the server must downsample, which it has to declare
 * through `downsampleMethod`. Returning something coarser than a day here would
 * be inventing a rung the contract does not have.
 */
export function selectInterval(rangeSeconds: number): Interval {
  if (!Number.isFinite(rangeSeconds) || rangeSeconds <= 0) return INTERVAL_LADDER[0];
  for (const interval of INTERVAL_LADDER) {
    if (rangeSeconds / interval.seconds <= MAX_POINTS) return interval;
  }
  return COARSEST;
}

/** How many points a range would produce at a given rung. */
export function pointsFor(rangeSeconds: number, interval: Interval): number {
  return Math.ceil(rangeSeconds / interval.seconds);
}

/**
 * Has a zoom gone fine enough that a re-query would return more detail?
 *
 * True only when a strictly finer rung fits the visible range. Zooming within
 * one rung changes nothing about what the server would send, so re-querying
 * there would be a round-trip for identical data.
 */
export function needsRequery(servedIntervalCode: string, visibleRangeSeconds: number): boolean {
  const served = INTERVAL_LADDER.find((i) => i.code === servedIntervalCode);
  if (!served) return false;
  const wanted = selectInterval(visibleRangeSeconds);
  return wanted.seconds < served.seconds;
}

/**
 * Contract checks on a series the server returned.
 *
 * Returns the warnings a caption must carry. An empty array means the series
 * described itself consistently; it does not mean the numbers are right, which
 * is not something this side can know.
 */
export function validateSeries(
  envelope: ChartEnvelope,
  rangeSeconds: number,
): readonly string[] {
  const warnings: string[] = [];
  const returned = envelope.returnedRows ?? null;

  if (returned !== null && returned > MAX_POINTS) {
    warnings.push(
      `This series returned ${returned.toLocaleString("en-US")} points, over the ${MAX_POINTS.toLocaleString("en-US")} interactive cap.`,
    );
  }

  const served = INTERVAL_LADDER.find((i) => i.code === envelope.interval);
  if (!served) {
    // Not an error: the server may add a rung this build has not heard of. It
    // is stated rather than assumed equivalent to a known one.
    warnings.push(`Served at interval "${envelope.interval}", which this build does not recognise.`);
  } else {
    const finest = selectInterval(rangeSeconds);
    if (served.seconds > finest.seconds && !envelope.downsampleMethod) {
      // Coarser than necessary and no downsampling declared. Worth saying,
      // because the reader is looking at less detail than the cap allowed.
      warnings.push(
        `Served at ${served.code} where ${finest.code} would have fit under the cap.`,
      );
    }
  }

  // EX-BE-04b §3 fixes the vocabulary: a non-1m result declares
  // `canonical_preaggregated`, a 1m result declares `none`, and stride sampling
  // is never used. So `none` is a DECLARED method rather than an absent one,
  // and the gap to catch is a reduced series that declares nothing at all.
  if (
    envelope.sourceRows != null &&
    returned != null &&
    envelope.sourceRows > returned &&
    !envelope.downsampleMethod
  ) {
    warnings.push("Points were reduced but no downsample method was declared.");
  }

  // A method this build does not recognise is stated rather than trusted: the
  // two the contract defines are lossless, and a third would not be.
  if (
    envelope.downsampleMethod &&
    !["canonical_preaggregated", "none"].includes(envelope.downsampleMethod)
  ) {
    warnings.push(
      `Downsample method "${envelope.downsampleMethod}" is outside the canonical set, so this series may have moved its extrema.`,
    );
  }

  // `none` on a coarser rung would mean the points were not aggregated, which
  // for anything but 1m is a contradiction.
  if (envelope.downsampleMethod === "none" && envelope.interval !== "1m") {
    warnings.push(
      `Served at ${envelope.interval} but declared no aggregation; only a 1m series can claim that.`,
    );
  }

  if (envelope.coverage != null && envelope.coverage < 1) {
    warnings.push(
      `Coverage ${(envelope.coverage * 100).toFixed(1)}% — gaps in this window are real, not smoothed over.`,
    );
  }

  return warnings;
}
