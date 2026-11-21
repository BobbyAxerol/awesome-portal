/**
 * The equity projection (R-C, FIXTURE lane) as the EXISTING `EquityPanel` takes it. Pure: nothing here draws, reads or invents a value.
 *
 * - equity points are the reader's decimal texts with their instants; a null equity is a gap (`v: null`), never zero;
 * - the drawdown pane takes the projection's drawdown FRACTION as percent by moving the decimal point two places in the text (-0.0025 is -0.25),
 *   the same convention the Manager series path uses; nothing is recomputed from the line;
 * - the panel's band is one lo..hi pair, so the time-varying band is drawn as its RANGE over the window (lowest lower, highest upper) and says so;
 *   it is drawn only when the body carries a band with its run id and digest (the reader refuses a band whose lineage differs);
 * - EVERY projection is a fixture projection: the V1 contract fixes `runtime_active` to false and the reader refuses anything else, so nothing
 *   served through this model can be a real-source reading, and the band is never an approved band.
 */
import type { ChartState, SeriesPoint, UtcEpochMs } from "../../charts/types";
import type { DrawdownInput } from "../../charts/EquityPanel";
import { compareDecimal, type EquityProjection } from "../../readers/equityProjection";

export const FIXTURE_LABEL = "Fixture projection";
export const FIXTURE_BAND_NAME = "Illustrative band (fixture), not an approved band";
export const FIXTURE_NOTE = "Served by the fixture lane from the world's own figures. It is not a source reading, and the band is illustrative, not an approved Research band.";

/** A fraction text as a percent text: a decimal shift of two places, sign kept, no digit invented or dropped. */
export function fractionTextToPercent(fraction: string): string | null {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(fraction);
  if (m === null) return null;
  const [, sign = "", whole = "0", rest = ""] = m;
  const padded = rest.padEnd(2, "0");
  const integer = `${whole}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(2);
  const text = decimals === "" ? integer : `${integer}.${decimals}`;
  return /^0(?:\.0*)?$/.test(text) ? "0" : `${sign === "-" ? "-" : ""}${text}`;
}

export interface ProjectionChart {
  points: SeriesPoint[];
  drawdown: DrawdownInput;
  band: { name: string; lo: string; hi: string } | null;
  currency: string;
  intervalMs: number;
  readAsOf: UtcEpochMs | undefined;
  state: ChartState;
  caption: string;
}

export function projectionChart(p: EquityProjection): ProjectionChart {
  const points: SeriesPoint[] = p.points.map((x) => ({ t: x.atMs as UtcEpochMs, v: x.equity }));
  const dd: SeriesPoint[] = [];
  for (const x of p.points) {
    const v = x.drawdown === null ? null : fractionTextToPercent(x.drawdown);
    dd.push({ t: x.atMs as UtcEpochMs, v });
  }
  let band: ProjectionChart["band"] = null;
  if (p.band !== null && p.band.runId === p.joinedRunId && p.band.artifactDigest === p.artifactDigest && p.band.points.length > 0) {
    let lo = p.band.points[0]!.lower;
    let hi = p.band.points[0]!.upper;
    for (const b of p.band.points) {
      if (compareDecimal(b.lower, lo) < 0) lo = b.lower;
      if (compareDecimal(b.upper, hi) > 0) hi = b.upper;
    }
    band = { name: FIXTURE_BAND_NAME, lo, hi };
  }
  const state: ChartState = p.isEmpty
    ? { kind: "unavailable", copy: "No equity in this window", reason: "The projection holds no bucket with an equity; nothing is drawn." }
    : p.panelState === "stale" ? { kind: "stale", reason: "The projection says its inputs are stale." }
    : p.completeness !== "COMPLETE" || p.gaps.length > 0 ? { kind: "partial", reason: `${p.returnedBuckets} of ${p.expectedBuckets} buckets have an equity; gaps are left open, not joined.` }
    : { kind: "ready" };
  const asOf = p.inputAsOf === null ? NaN : Date.parse(p.inputAsOf);
  return {
    points,
    drawdown: p.isEmpty ? { kind: "absent", copy: "Not available" } : { kind: "series", points: dd },
    band,
    currency: p.currency,
    intervalMs: p.intervalSeconds * 1000,
    readAsOf: Number.isFinite(asOf) ? (asOf as UtcEpochMs) : undefined,
    state,
    caption: `${FIXTURE_LABEL} · ${p.interval} buckets · ${p.returnedBuckets} of ${p.expectedBuckets} · run ${p.joinedRunId}`,
  };
}
